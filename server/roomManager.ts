import { requirePlayableGame, requireRoomAdapter } from "../src/games/registry";
import type { GameCommand, GameRoomAdapter } from "../src/games/types";
import type { GameId, HostRoomSnapshot, Locale, PlayerRoomSnapshot, RoomPlayerPublic, StageRoomSnapshot } from "../src/types";
import type { HostCommand, PlayerCommand } from "../src/online/messages";
import { normalizePlayerName, playerNameKey } from "../src/playerNames";
import { InMemoryRoomStore, type Room, type RoomPlayer, type RoomStore } from "./roomStore";

export class RoomManager {
  constructor(private store: RoomStore = new InMemoryRoomStore()) {}

  createRoom(clientId: string, gameId: GameId) {
    const game = requirePlayableGame(gameId);
    if (!game.roomAdapter) throw new Error(`Game ${gameId} is not playable.`);

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
      createdAt: Date.now(),
    };

    this.store.create(room);
    return { room, clientToken: room.hostToken };
  }

  joinRoom(code: string, name: string, clientId: string) {
    const room = this.requireRoom(code);
    if (room.phase !== "lobby") throw new Error("The room is already in game.");

    const trimmedName = normalizePlayerName(name);
    if (!trimmedName) throw new Error("Name is required.");

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
    this.store.save(room);
    return { room, clientToken: player.token, player };
  }

  inspectRoom(code: string) {
    const roomCode = normalizeRoomCode(code);
    const room = this.store.get(roomCode);
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
      this.store.save(room);
      return { room, role: "host" as const };
    }

    const player = room.players.find((candidate) => candidate.token === token);
    if (!player) throw new Error("Session not found.");

    player.clientId = clientId;
    player.connected = true;
    this.store.save(room);
    return { room, role: "player" as const, player };
  }

  joinStage(code: string, token: string) {
    const room = this.requireRoom(code);
    if (!room.stageToken || room.stageToken !== token) throw new Error("Stage link is not valid.");
    this.requireStageAdapter(room);
    return room;
  }

  leaveRoom(code: string, token: string) {
    const room = this.requireRoom(code);
    const player = room.players.find((candidate) => candidate.token === token);
    if (player) {
      player.connected = false;
      player.clientId = null;
      this.store.save(room);
    }
    return room;
  }

  disconnectClient(clientId: string) {
    const touched: Room[] = [];

    for (const room of this.store.list()) {
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

    this.store.save(room);
    return { room, closed: false };
  }

  applyPlayerCommand(code: string, token: string, command: PlayerCommand) {
    const room = this.requireRoom(code);
    const player = room.players.find((candidate) => candidate.token === token);
    if (!player) throw new Error("Player session not found.");

    this.adapterForRoom(room).applyPlayerCommand(room, player, command as GameCommand);
    this.store.save(room);
    return { room, player };
  }

  getRoom(code: string) {
    return this.store.get(normalizeRoomCode(code));
  }

  listRooms() {
    return this.store.list();
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
    const room = this.store.get(normalizeRoomCode(code));
    if (!room) throw new Error("Room not found.");
    return room;
  }

  private adapterForRoom(room: Room) {
    return requireRoomAdapter(room.gameId);
  }

  private createRoomCode() {
    let code = "";
    do {
      code = createToken(4).toUpperCase();
    } while (this.store.get(code));
    return code;
  }
}

function createToken(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeStageLocale(locale: unknown): Locale {
  if (locale === "de" || locale === "en") return locale;
  throw new Error("Invalid stage locale.");
}
