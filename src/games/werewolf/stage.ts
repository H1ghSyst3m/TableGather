import type { GameRoomRuntime } from "../types";
import type { RoomPlayerPublic } from "../../types";
import { effectiveRoleId, playerTeamInState } from "./domain/alignment";
import type { WerewolfPublicEvent, WerewolfState } from "./domain/types";
import { defaultWerewolfOptions } from "./domain/setup";
import { createDayTimerPublicSnapshot } from "./domain/timer";
import type { WerewolfSetupState, WerewolfStageEvent, WerewolfStageRoomSnapshot, WerewolfStageScene } from "./roomTypes";

export function createWerewolfStageSnapshot(room: GameRoomRuntime, players: RoomPlayerPublic[]): WerewolfStageRoomSnapshot {
  const gameState = room.gameState as WerewolfState | null;
  const serverTime = Date.now();
  const rawEvents = stagePublicEvents(gameState);
  const publicEventIndex = gameState?.publicEventIndex ?? 0;
  const activePublicEvent = rawEvents[publicEventIndex] ?? null;
  const scene = stageScene(room, gameState, activePublicEvent);
  const revealMode = gameState?.options.revealMode ?? readStageSetup(room).options.revealMode;
  const events = rawEvents.map((event) => decorateStageEvent(gameState, event));

  return {
    audience: "stage",
    code: room.code,
    phase: room.phase,
    gameId: room.gameId,
    players,
    stageLocale: room.stageLocale ?? null,
    scene,
    round: gameState?.round ?? null,
    revealMode,
    activeEvent: events[publicEventIndex] ?? null,
    pastEvents: events.slice(0, Math.min(publicEventIndex, events.length)),
    events,
    dayTimer: scene === "day" ? createDayTimerPublicSnapshot(gameState?.dayTimer, serverTime) : null,
    winner: gameState?.winner ?? null,
  };
}

function stageScene(
  room: GameRoomRuntime,
  gameState: WerewolfState | null,
  activeEvent: WerewolfPublicEvent | null,
): WerewolfStageScene {
  if (room.phase === "lobby") return "lobby";
  if (room.phase === "assignment") return "assignment";
  if (room.phase === "roleReveal") return "roleReveal";
  if (!gameState) return "lobby";

  if (activeEvent) {
    if (activeEvent.type === "nightDeaths" || activeEvent.type === "noNightDeaths") return "nightReport";
    if (activeEvent.type === "hunterPending") return "hunter";
    if (
      activeEvent.type === "voteDeath" ||
      activeEvent.type === "loverDeath" ||
      activeEvent.type === "hunterShot" ||
      activeEvent.type === "hunterSkipped"
    ) {
      return "voteReveal";
    }
    if (activeEvent.type === "winner") return "ended";
  }

  if (room.phase === "ended" || gameState.phase === "ended") return "ended";
  if (gameState.phase === "night" && gameState.nightResolved) return "nightReport";
  if (gameState.phase === "night") return "night";
  return "day";
}

function stagePublicEvents(state: WerewolfState | null): WerewolfPublicEvent[] {
  if (!state) return [];
  return state.publicEvents?.length ? state.publicEvents : fallbackEvents(state);
}

function fallbackEvents(state: WerewolfState): WerewolfPublicEvent[] {
  if (state.pendingHunterId && state.pendingHunterSource) {
    return [{ type: "hunterPending", playerId: state.pendingHunterId, source: state.pendingHunterSource }];
  }
  if (state.phase === "night" && state.nightResolved) {
    return state.lastNightDeaths.length > 0
      ? [{ type: "nightDeaths", playerIds: state.lastNightDeaths, source: "night" }]
      : [{ type: "noNightDeaths", source: "night" }];
  }
  if (state.phase === "day" && state.lastDayDeaths.length > 0) {
    return state.lastDayDeaths.map((playerId, index) => ({
      type: index === 0 ? "voteDeath" : "loverDeath",
      playerId,
      source: "day",
    }));
  }
  if (state.phase === "ended" && state.winner) return [{ type: "winner", winner: state.winner }];
  return [];
}

function decorateStageEvent(state: WerewolfState | null, event: WerewolfPublicEvent): WerewolfStageEvent {
  if (event.type === "nightDeaths") return { type: "nightDeaths", source: event.source, playerIds: event.playerIds };
  if (event.type === "noNightDeaths") return { type: "noNightDeaths", source: event.source };
  if (event.type === "winner") return { type: "winner", winner: event.winner };
  if (event.type === "hunterSkipped") return { type: "hunterSkipped", source: event.source, hunterId: event.hunterId };

  const forceHunterRole = event.type === "hunterPending";
  if (event.type === "hunterShot") {
    return {
      type: "hunterShot",
      source: event.source,
      hunterId: event.hunterId,
      playerId: event.playerId,
      reveal: revealForPlayer(state, event.playerId, { allowReveal: event.source === "day", forceRole: forceHunterRole }),
    };
  }

  return {
    type: event.type,
    source: event.source,
    playerId: event.playerId,
    reveal: revealForPlayer(state, event.playerId, { allowReveal: event.source === "day", forceRole: forceHunterRole }),
  };
}

function revealForPlayer(
  state: WerewolfState | null,
  playerId: string,
  { allowReveal, forceRole = false }: { allowReveal: boolean; forceRole?: boolean },
): WerewolfStageEvent["reveal"] {
  if (!state) return undefined;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return undefined;
  if (!allowReveal && !forceRole) return undefined;

  const mode = forceRole ? "role" : state.options.revealMode;
  if (mode === "hidden") return undefined;

  const team = playerTeamInState(state, player) === "werewolves" ? "evil" : "good";
  return mode === "team" ? { mode, team } : { mode, team, roleId: effectiveRoleId(state, player) };
}

function readStageSetup(room: GameRoomRuntime): Pick<WerewolfSetupState, "options"> {
  const setup = (room.setupState ?? {}) as Partial<WerewolfSetupState>;
  return { options: { ...defaultWerewolfOptions, ...(setup.options ?? {}) } };
}
