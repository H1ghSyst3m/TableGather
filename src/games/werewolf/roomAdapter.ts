import type { GameCommand, GameRoomAdapter, GameRoomPlayer, GameRoomRuntime } from "../types";
import type { RoomPlayerPublic } from "../../types";
import {
  advancePublicEvent,
  advanceNightStep,
  createWerewolfGame,
  createWerewolfGameFromAssignments,
  eliminateByVote,
  finishRoleReveal,
  markRoleSeen,
  pauseDayTimer,
  resolveHunterShot,
  resolveNight,
  revealNightResult,
  resetDayTimer,
  setAlphaWolfTransform,
  setAuraTarget,
  setCupidTargets,
  setDayTimerDuration,
  setDetectiveTargets,
  setInspectedPlayer,
  setNightGuestHost,
  setProtectedPlayer,
  setWildChildModel,
  setWitchHealTonight,
  setWitchPoisonTarget,
  setWolfTarget,
  startDay,
  startDayTimer,
  startNextNight,
} from "./domain/engine";
import { roleIds } from "./domain/roles";
import {
  autoFillVillagers,
  createDefaultRoleCounts,
  defaultWerewolfOptions,
  sanitizeRoleCount,
  validateRoleCounts,
} from "./domain/setup";
import type { RoleCounts, RoleId, WerewolfOptions, WerewolfState } from "./domain/types";
import type { WerewolfHostCommand, WerewolfPlayerCommand } from "./commands";
import { ensureDayTimer, resetDayTimerValue } from "./domain/timer";
import type { WerewolfHostRoomSnapshot, WerewolfRoomAssignmentEntry, WerewolfRoomUndoState, WerewolfSetupState } from "./roomTypes";
import { createWerewolfStageSnapshot } from "./stage";

export const werewolfRoomAdapter = {
  createInitialSetupState(playerCount: number) {
    return createWerewolfSetupState(playerCount);
  },

  resetRoom(room) {
    room.phase = "lobby";
    room.setupState = createWerewolfSetupState(Math.max(room.players.length, 5));
    room.assignment = [];
    room.gameState = null;
    room.undoState = null;
  },

  applyHostCommand(room, rawCommand) {
    const command = rawCommand as WerewolfHostCommand;

    switch (command.type) {
      case "prepareAssignment": {
        const roleCounts = normalizeRoomRoleCounts(room.players.length, command.roleCounts);
        const validation = validateRoleCounts(room.players.length, roleCounts);
        if (!validation.valid) throw new Error(`Invalid role counts: ${validation.reason}`);

        writeSetup(room, roleCounts, { ...(command.options ?? readSetup(room).options), roleReveal: true }, null);
        room.assignment = [];
        room.gameState = null;
        room.undoState = null;
        room.phase = "assignment";
        break;
      }
      case "setAssignMode": {
        requireAssignmentPhase(room);
        writeAssignMode(room, command.assignMode);
        room.assignment =
          command.assignMode === "random"
            ? createRandomAssignment(room)
            : command.assignMode === "manual"
              ? createEmptyManualAssignment(room)
              : [];
        break;
      }
      case "shuffleRoles": {
        requireAssignmentPhase(room);
        writeAssignMode(room, "random");
        room.assignment = createRandomAssignment(room);
        break;
      }
      case "setManualAssignment": {
        requireAssignmentPhase(room);
        writeAssignMode(room, "manual");
        room.assignment = normalizeManualAssignment(room, command.assignment);
        break;
      }
      case "startGame": {
        const startingPlayers = room.players.map((player) => ({ id: player.id, name: player.name.trim() }));
        if (startingPlayers.length !== room.players.length || startingPlayers.some((player) => !player.name)) {
          throw new Error("Every room player must have a valid name before the game can start.");
        }

        const setup = readSetup(room);
        const roleCounts = normalizeRoomRoleCounts(startingPlayers.length, command.roleCounts ?? setup.roleCounts);
        const validation = validateRoleCounts(startingPlayers.length, roleCounts);
        if (!validation.valid) throw new Error(`Invalid role counts: ${validation.reason}`);

        const options = { ...(command.options ?? setup.options ?? defaultWerewolfOptions), roleReveal: true };
        const assignment = room.phase === "assignment" && !command.roleCounts ? getCompleteAssignment(room) : null;
        const gameState = assignment
          ? createWerewolfGameFromAssignments(
              startingPlayers.map((player) => ({
                id: player.id,
                name: player.name,
                roleId: assignment.find((entry) => entry.playerId === player.id)?.roleId ?? "villager",
              })),
              options,
            )
          : createWerewolfGame(
              startingPlayers.map((player) => player.name),
              roleCounts,
              Math.random,
              startingPlayers.map((player) => player.id),
              options,
            );
        const assignedIds = new Set(gameState.players.map((player) => player.id));
        const missingPlayer = startingPlayers.find((player) => !assignedIds.has(player.id));
        if (missingPlayer) throw new Error("Every room player must receive a role before the game can start.");

        writeSetup(room, roleCounts, options);
        room.assignment = gameState.players.map((player) => ({ playerId: player.id, roleId: player.roleId }));
        room.gameState = gameState;
        room.undoState = null;
        room.phase = "roleReveal";
        break;
      }
      case "setProtectedPlayer":
        room.gameState = withGame(room.gameState, (state) => setProtectedPlayer(state, command.playerId));
        break;
      case "setNightGuestHost":
        room.gameState = withGame(room.gameState, (state) => setNightGuestHost(state, command.playerId));
        break;
      case "setWildChildModel":
        room.gameState = withGame(room.gameState, (state) => setWildChildModel(state, command.playerId));
        break;
      case "setCupidTargets":
        room.gameState = withGame(room.gameState, (state) => setCupidTargets(state, command.playerIds));
        break;
      case "setInspectedPlayer":
        room.gameState = withGame(room.gameState, (state) => setInspectedPlayer(state, command.playerId));
        break;
      case "setAuraTarget":
        room.gameState = withGame(room.gameState, (state) => setAuraTarget(state, command.playerId));
        break;
      case "setDetectiveTargets":
        room.gameState = withGame(room.gameState, (state) => setDetectiveTargets(state, command.playerIds));
        break;
      case "revealNightResult":
        room.gameState = withGame(room.gameState, (state) => {
          const nextState = revealNightResult(state, command.step);
          if (nextState !== state) room.undoState = null;
          return nextState;
        });
        break;
      case "setWolfTarget":
        room.gameState = withGame(room.gameState, (state) => setWolfTarget(state, command.playerId));
        break;
      case "setAlphaWolfTransform":
        room.gameState = withGame(room.gameState, (state) => setAlphaWolfTransform(state, command.value));
        break;
      case "setWitchHealTonight":
        room.gameState = withGame(room.gameState, (state) => setWitchHealTonight(state, command.value));
        break;
      case "setWitchPoisonTarget":
        room.gameState = withGame(room.gameState, (state) => setWitchPoisonTarget(state, command.playerId));
        break;
      case "advanceNightStep":
        applyUndoableGameCommand(room, advanceNightStep);
        break;
      case "advancePublicEvent":
        applyUndoableGameCommand(room, advancePublicEvent);
        syncRoomPlayPhase(room);
        break;
      case "resolveNight":
        applyUndoableGameCommand(room, resolveNight);
        syncRoomPlayPhase(room);
        break;
      case "resolveHunterShot":
        applyUndoableGameCommand(room, (state) => resolveHunterShot(state, command.playerId));
        syncRoomPlayPhase(room);
        break;
      case "eliminateByVote":
        applyUndoableGameCommand(room, (state) => eliminateByVote(state, command.playerId));
        syncRoomPlayPhase(room);
        break;
      case "startDay":
        applyUndoableGameCommand(room, startDay);
        syncRoomPlayPhase(room);
        break;
      case "setDayTimerDuration":
        room.gameState = withGame(room.gameState, (state) => setDayTimerDuration(state, command.durationSeconds));
        break;
      case "startDayTimer":
        room.gameState = withGame(room.gameState, (state) => startDayTimer(state, Date.now()));
        break;
      case "pauseDayTimer":
        room.gameState = withGame(room.gameState, (state) => pauseDayTimer(state, Date.now()));
        break;
      case "resetDayTimer":
        room.gameState = withGame(room.gameState, resetDayTimer);
        break;
      case "startNextNight":
        applyUndoableGameCommand(room, startNextNight);
        syncRoomPlayPhase(room);
        break;
      case "undoStep":
        restoreUndoState(room);
        break;
      default:
        throw new Error(`Unsupported werewolf host command: ${commandType(rawCommand)}`);
    }
  },

  applyPlayerCommand(room, player, rawCommand) {
    const command = rawCommand as WerewolfPlayerCommand;
    if (command.type !== "markRoleSeen") {
      throw new Error(`Unsupported werewolf player command: ${commandType(rawCommand)}`);
    }

    if (!room.gameState) return;

    const gamePlayer = findGamePlayer(room, player);
    if (!gamePlayer) return;

    room.gameState = markRoleSeen(room.gameState as WerewolfState, gamePlayer.id);
    const gameState = room.gameState as WerewolfState;
    const allSeen = gameState.players.every((statePlayer) => statePlayer.seenRole);
    if (allSeen) {
      room.gameState = finishRoleReveal(gameState);
      room.phase = "playing";
    }
  },

  publicPlayer(room, player) {
    const gamePlayer = findGamePlayer(room, player);
    return toPublicPlayer(player, gamePlayer);
  },

  hostSnapshot(room, players) {
    const setup = readSetup(room);

    return {
      audience: "host",
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      players,
      stageToken: room.stageToken ?? null,
      stageLocale: room.stageLocale ?? null,
      roleCounts: setup.roleCounts,
      options: setup.options,
      assignMode: setup.assignMode,
      assignment: room.assignment as WerewolfRoomAssignmentEntry[],
      serverTime: Date.now(),
      gameState: room.gameState as WerewolfState | null,
      canUndo: Boolean((room.undoState as WerewolfRoomUndoState | null)?.gameState),
    } satisfies WerewolfHostRoomSnapshot;
  },

  playerSnapshot(room, player, players) {
    const gameState = room.gameState as WerewolfState | null;
    const gamePlayer = findGamePlayer(room, player);
    const roleVisible = room.phase === "roleReveal" || room.phase === "playing" || room.phase === "ended";

    return {
      audience: "player",
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      self: {
        ...toPublicPlayer(player, gamePlayer),
        roleId: roleVisible ? gamePlayer?.roleId : undefined,
        originalRoleId: roleVisible ? gamePlayer?.originalRoleId : undefined,
        ...(roleVisible && gamePlayer?.alphaWolfInfected ? { alphaWolfInfected: true } : {}),
      },
      options: gameState?.options ?? readSetup(room).options,
      players,
      winner: gameState?.winner ?? null,
    };
  },

  stageSnapshot(room, players) {
    return createWerewolfStageSnapshot(room, players);
  },
} satisfies GameRoomAdapter;

export function createWerewolfSetupState(playerCount: number): WerewolfSetupState {
  return {
    roleCounts: createDefaultRoleCounts(Math.max(playerCount, 5)),
    options: { ...defaultWerewolfOptions, roleReveal: true },
    assignMode: null,
  };
}

function readSetup(room: GameRoomRuntime): WerewolfSetupState {
  const setup = (room.setupState ?? {}) as Partial<WerewolfSetupState>;

  return {
    roleCounts: setup.roleCounts ?? createDefaultRoleCounts(Math.max(room.players.length, 5)),
    options: { ...defaultWerewolfOptions, ...(setup.options ?? {}), roleReveal: true },
    assignMode: setup.assignMode ?? null,
  };
}

function writeSetup(room: GameRoomRuntime, roleCounts: RoleCounts, options: WerewolfOptions, assignMode = readSetup(room).assignMode) {
  room.setupState = { roleCounts, options: { ...options, roleReveal: true }, assignMode } satisfies WerewolfSetupState;
}

function writeAssignMode(room: GameRoomRuntime, assignMode: WerewolfSetupState["assignMode"]) {
  const setup = readSetup(room);
  writeSetup(room, setup.roleCounts, setup.options, assignMode);
}

function requireAssignmentPhase(room: GameRoomRuntime) {
  if (room.phase !== "assignment") throw new Error("Room is not in assignment.");
}

function createRandomAssignment(room: GameRoomRuntime): WerewolfRoomAssignmentEntry[] {
  const setup = readSetup(room);
  const roleCounts = normalizeRoomRoleCounts(room.players.length, setup.roleCounts);
  const validation = validateRoleCounts(room.players.length, roleCounts);
  if (!validation.valid) throw new Error(`Invalid role counts: ${validation.reason}`);

  const preview = createWerewolfGame(
    room.players.map((player) => player.name),
    roleCounts,
    Math.random,
    room.players.map((player) => player.id),
    setup.options,
  );

  return preview.players.map((player) => ({ playerId: player.id, roleId: player.roleId }));
}

function createEmptyManualAssignment(room: GameRoomRuntime): WerewolfRoomAssignmentEntry[] {
  const byPlayerId = new Map(room.assignment.map((entry) => [entry.playerId, entry.roleId as RoleId | null]));
  return room.players.map((player) => ({
    playerId: player.id,
    roleId: byPlayerId.get(player.id) ?? null,
  }));
}

function normalizeManualAssignment(
  room: GameRoomRuntime,
  assignment: Record<string, RoleId | null>,
): WerewolfRoomAssignmentEntry[] {
  const usedCounts: RoleCounts = {};
  const setup = readSetup(room);

  return room.players.map((player) => {
    const roleId = assignment[player.id];
    if (!isAssignableRole(setup.roleCounts, usedCounts, roleId)) {
      return { playerId: player.id, roleId: null };
    }

    usedCounts[roleId] = sanitizeRoleCount(usedCounts, roleId) + 1;
    return { playerId: player.id, roleId };
  });
}

function getCompleteAssignment(room: GameRoomRuntime): Array<{ playerId: string; roleId: RoleId }> {
  const { assignMode } = readSetup(room);
  const assignment =
    assignMode === "random" && room.assignment.length === room.players.length
      ? room.assignment
      : assignMode === "manual"
        ? room.assignment
        : createRandomAssignment(room);

  const completeAssignment = assignment.map((entry) => ({ ...entry, roleId: entry.roleId as RoleId | null }));
  if (completeAssignment.some((entry) => !entry.roleId)) {
    throw new Error("Every room player must receive a role before the game can start.");
  }

  const counts = completeAssignment.reduce<RoleCounts>((result, entry) => {
    const roleId = entry.roleId as RoleId;
    return { ...result, [roleId]: sanitizeRoleCount(result, roleId) + 1 };
  }, {});

  const setup = readSetup(room);
  const expectedCounts = normalizeRoomRoleCounts(room.players.length, setup.roleCounts);
  const matchesRoleCounts = roleIds.every(
    (roleId) => sanitizeRoleCount(counts, roleId) === sanitizeRoleCount(expectedCounts, roleId),
  );
  if (!matchesRoleCounts) throw new Error("Assigned roles must match the selected role counts.");

  room.assignment = completeAssignment as WerewolfRoomAssignmentEntry[];
  return room.assignment as Array<{ playerId: string; roleId: RoleId }>;
}

function findGamePlayer(room: GameRoomRuntime, player: GameRoomPlayer) {
  const gamePlayers = (room.gameState as WerewolfState | null)?.players ?? [];
  return gamePlayers.find((candidate) => candidate.id === player.id);
}

function withGame(gameState: unknown, updater: (state: WerewolfState) => WerewolfState) {
  if (!gameState) throw new Error("Game has not started.");
  return updater(gameState as WerewolfState);
}

function applyUndoableGameCommand(room: GameRoomRuntime, updater: (state: WerewolfState) => WerewolfState) {
  const previousState = requireGameState(room.gameState);
  const previousPhase = room.phase;
  const nextState = updater(previousState);

  if (nextState !== previousState) {
    room.undoState = {
      phase: previousPhase,
      gameState: cloneWerewolfState(previousState),
    } satisfies WerewolfRoomUndoState;
  }

  room.gameState = nextState;
}

function restoreUndoState(room: GameRoomRuntime) {
  const undoState = room.undoState as WerewolfRoomUndoState | null;
  if (!undoState) return;

  room.phase = undoState.phase;
  room.gameState = resetRestoredDayTimer(cloneWerewolfState(undoState.gameState));
  room.undoState = null;
}

function resetRestoredDayTimer(state: WerewolfState): WerewolfState {
  if (state.phase !== "day") return state;
  return { ...state, dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)) };
}

function syncRoomPlayPhase(room: GameRoomRuntime) {
  const gameState = room.gameState as WerewolfState | null;
  if (!gameState) return;
  room.phase = gameState.phase === "ended" ? "ended" : "playing";
}

function requireGameState(gameState: unknown): WerewolfState {
  if (!gameState) throw new Error("Game has not started.");
  return gameState as WerewolfState;
}

function cloneWerewolfState(state: WerewolfState): WerewolfState {
  return structuredClone(state) as WerewolfState;
}

function normalizeRoomRoleCounts(playerCount: number, counts: RoleCounts | undefined) {
  return autoFillVillagers(counts ?? createDefaultRoleCounts(Math.max(playerCount, 5)), playerCount);
}

function isAssignableRole(
  expectedCounts: RoleCounts,
  usedCounts: RoleCounts,
  roleId: RoleId | null | undefined,
): roleId is RoleId {
  if (!roleId || !roleIds.includes(roleId)) return false;
  return sanitizeRoleCount(usedCounts, roleId) < sanitizeRoleCount(expectedCounts, roleId);
}

function toPublicPlayer(player: GameRoomPlayer, gamePlayer?: { alive: boolean; seenRole: boolean }): RoomPlayerPublic {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    seenRole: gamePlayer?.seenRole ?? false,
    alive: gamePlayer?.alive,
  };
}

function commandType(command: GameCommand) {
  return String(command.type ?? "unknown");
}
