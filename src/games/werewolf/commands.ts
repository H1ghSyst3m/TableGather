import type { NightStepId, RoleCounts, RoleId, WerewolfDayTimerDurationSeconds, WerewolfOptions } from "./domain/types";
import type { WerewolfRoomAssignMode } from "./roomTypes";

export type WerewolfHostCommand =
  | { type: "beginSetup"; roleCounts?: RoleCounts; options?: WerewolfOptions }
  | { type: "updateSetup"; roleCounts: RoleCounts; options?: WerewolfOptions }
  | { type: "returnToPlayerLobby" }
  | { type: "returnToGameSettings" }
  | { type: "prepareAssignment"; roleCounts: RoleCounts; options?: WerewolfOptions }
  | { type: "setAssignMode"; assignMode: WerewolfRoomAssignMode }
  | { type: "shuffleRoles" }
  | { type: "setManualAssignment"; assignment: Record<string, RoleId | null> }
  | { type: "startGame"; roleCounts?: RoleCounts; options?: WerewolfOptions }
  | { type: "setProtectedPlayer"; playerId: string | null }
  | { type: "setNightGuestHost"; playerId: string | null }
  | { type: "setWildChildModel"; playerId: string | null }
  | { type: "setCupidTargets"; playerIds: string[] }
  | { type: "setInspectedPlayer"; playerId: string | null }
  | { type: "setAuraTarget"; playerId: string | null }
  | { type: "setDetectiveTargets"; playerIds: string[] }
  | { type: "revealNightResult"; step: Extract<NightStepId, "seer" | "auraSeer" | "detective"> }
  | { type: "setWolfTarget"; playerId: string | null }
  | { type: "setAlphaWolfTransform"; value: boolean | null }
  | { type: "setWitchHealTonight"; value: boolean }
  | { type: "setWitchPoisonTarget"; playerId: string | null }
  | { type: "advanceNightStep" }
  | { type: "advancePublicEvent" }
  | { type: "resolveNight" }
  | { type: "resolveHunterShot"; playerId: string | null }
  | { type: "eliminateByVote"; playerId: string }
  | { type: "startDay" }
  | { type: "setDayTimerDuration"; durationSeconds: WerewolfDayTimerDurationSeconds }
  | { type: "startDayTimer" }
  | { type: "pauseDayTimer" }
  | { type: "resetDayTimer" }
  | { type: "startNextNight" }
  | { type: "undoStep" };

export type WerewolfPlayerCommand = { type: "markRoleSeen" };

export const werewolfHostCommandTypes = [
  "beginSetup",
  "updateSetup",
  "returnToPlayerLobby",
  "returnToGameSettings",
  "prepareAssignment",
  "setAssignMode",
  "shuffleRoles",
  "setManualAssignment",
  "startGame",
  "setProtectedPlayer",
  "setNightGuestHost",
  "setWildChildModel",
  "setCupidTargets",
  "setInspectedPlayer",
  "setAuraTarget",
  "setDetectiveTargets",
  "revealNightResult",
  "setWolfTarget",
  "setAlphaWolfTransform",
  "setWitchHealTonight",
  "setWitchPoisonTarget",
  "advanceNightStep",
  "advancePublicEvent",
  "resolveNight",
  "resolveHunterShot",
  "eliminateByVote",
  "startDay",
  "setDayTimerDuration",
  "startDayTimer",
  "pauseDayTimer",
  "resetDayTimer",
  "startNextNight",
  "undoStep",
] as const;

export const werewolfPlayerCommandTypes = ["markRoleSeen"] as const;
