import { randomInt } from "node:crypto";
import { requirePlayableGame, requireRoomAdapter } from "../src/games/registry";
import type { GameCommand, GameRoomAdapter } from "../src/games/types";
import type { GameId, HostRoomSnapshot, Locale, PlayerRoomSnapshot, RoomPlayerPublic, StageRoomSnapshot } from "../src/types";
import {
  ADMIN_INACTIVE_ACTIVITY_MS,
  adminGameIds,
  adminRoomPhases,
  type AdminGameCounts,
  type AdminInactiveReason,
  type AdminProgressStatus,
  type AdminRoomsSummary,
} from "../src/online/admin";
import type { HostCommand, PlayerCommand } from "../src/online/messages";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "../src/online/roomCodes";
import { playerNameKey, validatePlayerName } from "../src/playerNames";
import { InMemoryRoomStore, type Room, type RoomPlayer, type RoomStore } from "./roomStore";

export const DEFAULT_ROOM_TTL_MS = 48 * 60 * 60 * 1000;

interface RoomManagerOptions {
  now?: () => number;
  roomTtlMs?: number;
}

export class RoomManager {
  private readonly now: () => number;
  private readonly roomTtlMs: number;

  constructor(
    private store: RoomStore = new InMemoryRoomStore(),
    options: RoomManagerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
  }

  createRoom(clientId: string, gameId: GameId) {
    this.pruneExpiredRooms();
    const game = requirePlayableGame(gameId);
    if (!game.roomAdapter) throw new Error(`Game ${gameId} is not playable.`);
    const now = this.now();

    const room: Room = {
      code: this.createRoomCode(),
      gameId,
      hostToken: createToken(),
      hostClientId: clientId,
      stageToken: null,
      stageLocale: null,
      phase: "lobby",
      players: [],
      setupState: game.roomAdapter.createInitialSetupState(5),
      assignment: [],
      gameState: null,
      undoState: null,
      createdAt: now,
      lastActivityAt: now,
    };

    this.store.create(room);
    return { room, clientToken: room.hostToken };
  }

  joinRoom(code: string, name: string, clientId: string) {
    const room = this.requireRoom(code);
    if (room.phase !== "lobby") throw new Error("The room is already in game.");

    const { name: trimmedName, error } = validatePlayerName(name);
    if (error === "required") throw new Error("Name is required.");
    if (error === "tooLong") throw new Error("Name is too long.");

    const duplicate = room.players.find((player) => playerNameKey(player.name) === playerNameKey(trimmedName));
    if (duplicate) throw new Error("Name is already taken.");

    const player: RoomPlayer = {
      id: createToken(8),
      name: trimmedName,
      token: createToken(),
      clientId,
      connected: true,
    };

    room.players.push(player);
    this.touchRoom(room);
    this.store.save(room);
    return { room, clientToken: player.token, player };
  }

  inspectRoom(code: string) {
    const roomCode = normalizeRoomCode(code);
    const room = this.getActiveRoom(roomCode);
    if (!room) return { roomCode, exists: false, joinable: false };

    return {
      roomCode: room.code,
      exists: true,
      joinable: room.phase === "lobby",
      gameId: room.gameId,
      phase: room.phase,
      playerCount: room.players.length,
    };
  }

  resumeRoom(code: string, token: string, clientId: string) {
    const room = this.requireRoom(code);
    if (room.hostToken === token) {
      room.hostClientId = clientId;
      this.touchRoom(room);
      this.store.save(room);
      return { room, role: "host" as const };
    }

    const player = room.players.find((candidate) => candidate.token === token);
    if (!player) throw new Error("Session not found.");

    player.clientId = clientId;
    player.connected = true;
    this.touchRoom(room);
    this.store.save(room);
    return { room, role: "player" as const, player };
  }

  inspectRoomSession(code: string, token: string) {
    const roomCode = normalizeRoomCode(code);
    const room = this.getActiveRoom(roomCode);
    if (!room) return { roomCode, valid: false as const };

    if (room.hostToken === token) {
      return {
        roomCode: room.code,
        valid: true as const,
        role: "host" as const,
        gameId: room.gameId,
        phase: room.phase,
        playerCount: room.players.length,
        createdAt: room.createdAt,
        lastActivityAt: room.lastActivityAt,
        expiresAt: this.expiresAt(room),
      };
    }

    const player = room.players.find((candidate) => candidate.token === token);
    if (!player) return { roomCode: room.code, valid: false as const };

    return {
      roomCode: room.code,
      valid: true as const,
      role: "player" as const,
      gameId: room.gameId,
      phase: room.phase,
      playerCount: room.players.length,
      playerName: player.name,
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      expiresAt: this.expiresAt(room),
    };
  }

  inspectStage(code: string, token: string) {
    const roomCode = normalizeRoomCode(code);
    const room = this.getActiveRoom(roomCode);
    if (!room || !room.stageToken || room.stageToken !== token) return { roomCode, valid: false as const };

    try {
      this.requireStageAdapter(room);
    } catch {
      return { roomCode: room.code, valid: false as const };
    }

    return {
      roomCode: room.code,
      valid: true as const,
      gameId: room.gameId,
      phase: room.phase,
      playerCount: room.players.length,
    };
  }

  joinStage(code: string, token: string) {
    const room = this.requireRoom(code);
    if (!room.stageToken || room.stageToken !== token) throw new Error("Stage link is not valid.");
    this.requireStageAdapter(room);
    this.touchRoom(room);
    this.store.save(room);
    return room;
  }

  leaveRoom(code: string, token: string) {
    const room = this.requireRoom(code);
    const player = room.players.find((candidate) => candidate.token === token);
    if (player) {
      player.connected = false;
      player.clientId = null;
      this.touchRoom(room);
      this.store.save(room);
    }
    return room;
  }

  disconnectClient(clientId: string) {
    const touched: Room[] = [];

    for (const room of this.store.list()) {
      if (this.isExpired(room)) {
        this.store.delete(room.code);
        continue;
      }

      let changed = false;
      if (room.hostClientId === clientId) {
        room.hostClientId = null;
        changed = true;
      }

      for (const player of room.players) {
        if (player.clientId === clientId) {
          player.clientId = null;
          player.connected = false;
          changed = true;
        }
      }

      if (changed) {
        this.store.save(room);
        touched.push(room);
      }
    }

    return touched;
  }

  applyHostCommand(code: string, token: string, command: HostCommand) {
    const room = this.requireHost(code, token);

    switch (command.type) {
      case "transferHost": {
        const target = this.transferHost(room, command.playerId);
        this.touchRoom(room);
        this.store.save(room);
        return { room, closed: false, transferred: target };
      }
      case "createStageLink": {
        this.requireStageAdapter(room);
        const stageLocale = command.stageLocale === undefined ? undefined : normalizeStageLocale(command.stageLocale);
        room.stageToken = createToken();
        if (stageLocale !== undefined) room.stageLocale = stageLocale;
        break;
      }
      case "setStageLocale":
        this.requireStageAdapter(room);
        room.stageLocale = normalizeStageLocale(command.stageLocale);
        break;
      case "disableStageLink":
        room.stageToken = null;
        break;
      case "kickPlayer": {
        const kicked = room.players.find((player) => player.id === command.playerId);
        room.players = room.players.filter((player) => player.id !== command.playerId);
        this.touchRoom(room);
        this.store.save(room);
        return {
          room,
          closed: false,
          kicked: kicked ? { playerId: kicked.id, clientId: kicked.clientId, token: kicked.token } : null,
        };
      }
      case "closeRoom":
        this.store.delete(room.code);
        return { room, closed: true };
      case "resetToLobby":
        this.adapterForRoom(room).resetRoom(room);
        break;
      default:
        this.adapterForRoom(room).applyHostCommand(room, command as GameCommand);
        break;
    }

    this.touchRoom(room);
    this.store.save(room);
    return { room, closed: false };
  }

  applyPlayerCommand(code: string, token: string, command: PlayerCommand) {
    const room = this.requireRoom(code);
    const player = room.players.find((candidate) => candidate.token === token);
    if (!player) throw new Error("Player session not found.");

    this.adapterForRoom(room).applyPlayerCommand(room, player, command as GameCommand);
    this.touchRoom(room);
    this.store.save(room);
    return { room, player };
  }

  getRoom(code: string) {
    return this.getActiveRoom(normalizeRoomCode(code));
  }

  listRooms() {
    this.pruneExpiredRooms();
    return this.store.list();
  }

  adminRoomsSummary(): AdminRoomsSummary {
    const serverTime = this.now();
    this.pruneExpiredRooms();

    const byGame = createGameCounts();
    const byPhase = createPhaseCounts();
    const totals = createEmptyCounts();
    const rooms = this.store.list().map((room) => {
      const inactiveReasons = this.inactiveReasons(room, serverTime);
      const inactive = inactiveReasons.length > 0;
      const active = !inactive;
      const progressStatus = progressStatusForRoom(room);
      const started = progressStatus !== "waiting";
      const running = progressStatus === "running";
      const waiting = progressStatus === "waiting";

      incrementCounts(totals, { active, progressStatus });
      incrementCounts(byGame[room.gameId], { active, progressStatus });
      byPhase[room.phase] += 1;

      return {
        code: room.code,
        gameId: room.gameId,
        phase: room.phase,
        playerCount: room.players.length,
        connectedPlayerCount: room.players.filter((player) => player.connected).length,
        hostConnected: Boolean(room.hostClientId),
        createdAt: room.createdAt,
        lastActivityAt: room.lastActivityAt,
        expiresAt: this.expiresAt(room),
        started,
        active,
        running,
        waiting,
        progressStatus,
        inactive,
        inactiveReasons,
      };
    });

    return {
      serverTime,
      inactiveActivityMs: ADMIN_INACTIVE_ACTIVITY_MS,
      totals,
      byGame,
      byPhase,
      rooms: rooms.sort((first, second) => second.lastActivityAt - first.lastActivityAt),
    };
  }

  pruneExpiredRooms() {
    const expired: Room[] = [];

    for (const room of this.store.list()) {
      if (!this.isExpired(room)) continue;
      this.store.delete(room.code);
      expired.push(room);
    }

    return expired;
  }

  hostSnapshot(room: Room): HostRoomSnapshot {
    const adapter = this.adapterForRoom(room);
    return adapter.hostSnapshot(room, this.publicRoomPlayers(room, adapter));
  }

  playerSnapshot(room: Room, token: string): PlayerRoomSnapshot {
    const player = room.players.find((candidate) => candidate.token === token);
    if (!player) throw new Error("Player session not found.");

    const adapter = this.adapterForRoom(room);
    return adapter.playerSnapshot(room, player, this.publicRoomPlayers(room, adapter));
  }

  stageSnapshot(room: Room, token: string): StageRoomSnapshot {
    if (!room.stageToken || room.stageToken !== token) throw new Error("Stage link is not valid.");

    const adapter = this.requireStageAdapter(room);

    return adapter.stageSnapshot(room, this.publicRoomPlayers(room, adapter));
  }

  private publicRoomPlayers(room: Room, adapter: GameRoomAdapter): RoomPlayerPublic[] {
    return room.players.map((player) => adapter.publicPlayer(room, player));
  }

  private requireHost(code: string, token: string) {
    const room = this.requireRoom(code);
    if (room.hostToken !== token) throw new Error("Host session not found.");
    return room;
  }

  private requireStageAdapter(room: Room): GameRoomAdapter & { stageSnapshot: NonNullable<GameRoomAdapter["stageSnapshot"]> } {
    const adapter = this.adapterForRoom(room);
    if (!adapter.stageSnapshot) throw new Error(`Game ${room.gameId} does not support stage mode.`);
    return adapter as GameRoomAdapter & { stageSnapshot: NonNullable<GameRoomAdapter["stageSnapshot"]> };
  }

  private transferHost(room: Room, playerId: string) {
    if (room.phase !== "lobby") throw new Error("Host transfer is only available in the lobby.");

    const target = room.players.find((player) => player.id === playerId);
    if (!target || !target.connected || !target.clientId) throw new Error("Target player is not connected.");

    const oldHostToken = room.hostToken;
    const oldHostClientId = room.hostClientId;

    room.hostToken = target.token;
    room.hostClientId = target.clientId;
    room.players = room.players.filter((player) => player.id !== target.id);

    return {
      playerId: target.id,
      clientId: target.clientId,
      token: target.token,
      oldHostClientId,
      oldHostToken,
    };
  }

  private requireRoom(code: string) {
    const room = this.getActiveRoom(normalizeRoomCode(code));
    if (!room) throw new Error("Room not found.");
    return room;
  }

  private adapterForRoom(room: Room) {
    return requireRoomAdapter(room.gameId);
  }

  private createRoomCode() {
    let code = "";
    do {
      code = createToken(ROOM_CODE_LENGTH).toUpperCase();
    } while (this.getActiveRoom(code));
    return code;
  }

  private getActiveRoom(roomCode: string) {
    const room = this.store.get(roomCode);
    if (!room) return undefined;
    if (!this.isExpired(room)) return room;
    this.store.delete(room.code);
    return undefined;
  }

  private touchRoom(room: Room) {
    room.lastActivityAt = this.now();
  }

  private inactiveReasons(room: Room, serverTime: number): AdminInactiveReason[] {
    const reasons: AdminInactiveReason[] = [];
    if (!room.hostClientId) reasons.push("hostOffline");
    if (serverTime - room.lastActivityAt >= ADMIN_INACTIVE_ACTIVITY_MS) reasons.push("staleActivity");
    return reasons;
  }

  private expiresAt(room: Room) {
    return room.lastActivityAt + this.roomTtlMs;
  }

  private isExpired(room: Room) {
    return this.expiresAt(room) <= this.now();
  }
}

function createEmptyCounts(): AdminGameCounts {
  return { total: 0, active: 0, running: 0, waiting: 0, inactive: 0, ended: 0 };
}

function createGameCounts(): Record<GameId, AdminGameCounts> {
  return Object.fromEntries(adminGameIds.map((gameId) => [gameId, createEmptyCounts()])) as Record<GameId, AdminGameCounts>;
}

function createPhaseCounts() {
  return Object.fromEntries(adminRoomPhases.map((phase) => [phase, 0])) as Record<Room["phase"], number>;
}

function progressStatusForRoom(room: Room): AdminProgressStatus {
  if (room.phase === "ended") return "ended";
  if (room.phase === "playing") return "running";
  return "waiting";
}

function incrementCounts(counts: AdminGameCounts, flags: { active: boolean; progressStatus: AdminProgressStatus }) {
  counts.total += 1;
  if (flags.active) counts.active += 1;
  else counts.inactive += 1;
  counts[flags.progressStatus] += 1;
}

function createToken(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function normalizeStageLocale(locale: unknown): Locale {
  if (locale === "de" || locale === "en") return locale;
  throw new Error("Invalid stage locale.");
}
