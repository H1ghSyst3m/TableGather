import type { GameCommand } from "../types";
import { dayTimerDurations } from "./domain/timer";
import type { NightStepId, RoleCounts, RoleId, WerewolfDayTimerDurationSeconds, WerewolfOptions } from "./domain/types";
import { roleIds } from "./domain/roles";
import type { WerewolfRoomAssignMode } from "./roomTypes";

export type WerewolfHostCommand =
  | { type: "beginSetup"; roleCounts?: RoleCounts; options?: WerewolfOptions }
  | { type: "updateSetup"; roleCounts: RoleCounts; options?: WerewolfOptions }
  | { type: "continueToRules" }
  | { type: "returnToPlayerLobby" }
  | { type: "returnToRoleSelection" }
  | { type: "prepareAssignment" }
  | { type: "returnToRules" }
  | { type: "setAssignMode"; assignMode: WerewolfRoomAssignMode }
  | { type: "shuffleRoles" }
  | { type: "setManualAssignment"; assignment: Record<string, RoleId | null> }
  | { type: "startGame" }
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
  | { type: "setDoctorHealTonight"; value: boolean }
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
  "continueToRules",
  "returnToPlayerLobby",
  "returnToRoleSelection",
  "prepareAssignment",
  "returnToRules",
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
  "setDoctorHealTonight",
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

const noPayloadHostCommandTypes = new Set([
  "continueToRules",
  "returnToPlayerLobby",
  "returnToRoleSelection",
  "prepareAssignment",
  "returnToRules",
  "startGame",
  "shuffleRoles",
  "advanceNightStep",
  "advancePublicEvent",
  "resolveNight",
  "startDay",
  "startDayTimer",
  "pauseDayTimer",
  "resetDayTimer",
  "startNextNight",
  "undoStep",
]);

const nullablePlayerIdHostCommandTypes = new Set([
  "setProtectedPlayer",
  "setNightGuestHost",
  "setWildChildModel",
  "setInspectedPlayer",
  "setAuraTarget",
  "setWolfTarget",
  "setWitchPoisonTarget",
  "resolveHunterShot",
]);

const playerIdListHostCommandTypes = new Set(["setCupidTargets", "setDetectiveTargets"]);

export function isWerewolfHostCommand(command: GameCommand): command is WerewolfHostCommand {
  if (!isRecord(command) || typeof command.type !== "string") return false;

  if (noPayloadHostCommandTypes.has(command.type)) return hasOnlyKeys(command, "type");
  if (nullablePlayerIdHostCommandTypes.has(command.type)) return hasOnlyKeys(command, "type", "playerId") && isStringOrNull(command.playerId);
  if (playerIdListHostCommandTypes.has(command.type)) return hasOnlyKeys(command, "type", "playerIds") && isStringArray(command.playerIds);

  switch (command.type) {
    case "beginSetup":
      return hasOnlyKeys(command, "type", "roleCounts", "options") && isOptionalRoleCounts(command.roleCounts) && isOptionalWerewolfOptions(command.options);
    case "updateSetup":
      return hasOnlyKeys(command, "type", "roleCounts", "options") && isRoleCounts(command.roleCounts) && isOptionalWerewolfOptions(command.options);
    case "setAssignMode":
      return hasOnlyKeys(command, "type", "assignMode") && (command.assignMode === "random" || command.assignMode === "manual" || command.assignMode === null);
    case "setManualAssignment":
      return hasOnlyKeys(command, "type", "assignment") && isManualAssignment(command.assignment);
    case "revealNightResult":
      return hasOnlyKeys(command, "type", "step") && (command.step === "seer" || command.step === "auraSeer" || command.step === "detective");
    case "setAlphaWolfTransform":
      return hasOnlyKeys(command, "type", "value") && (typeof command.value === "boolean" || command.value === null);
    case "setDoctorHealTonight":
    case "setWitchHealTonight":
      return hasOnlyKeys(command, "type", "value") && typeof command.value === "boolean";
    case "eliminateByVote":
      return hasOnlyKeys(command, "type", "playerId") && typeof command.playerId === "string";
    case "setDayTimerDuration":
      return (
        hasOnlyKeys(command, "type", "durationSeconds") &&
        typeof command.durationSeconds === "number" &&
        dayTimerDurations.includes(command.durationSeconds as WerewolfDayTimerDurationSeconds)
      );
    default:
      return false;
  }
}

export function isWerewolfPlayerCommand(command: GameCommand): command is WerewolfPlayerCommand {
  return isRecord(command) && command.type === "markRoleSeen" && hasOnlyKeys(command, "type");
}

function isOptionalRoleCounts(value: unknown) {
  return value === undefined || isRoleCounts(value);
}

function isRoleCounts(value: unknown): value is RoleCounts {
  if (!isRecord(value)) return false;

  return Object.entries(value).every(
    ([roleId, count]) => roleIds.includes(roleId as RoleId) && Number.isInteger(count) && Number(count) >= 0,
  );
}

function isOptionalWerewolfOptions(value: unknown) {
  return value === undefined || isWerewolfOptions(value);
}

function isWerewolfOptions(value: unknown): value is WerewolfOptions {
  if (!isRecord(value)) return false;
  return (
    hasOnlyKeys(value, "winMode", "revealMode", "roleReveal") &&
    (value.winMode === "standard" || value.winMode === "extended") &&
    (value.revealMode === "hidden" || value.revealMode === "team" || value.revealMode === "role") &&
    typeof value.roleReveal === "boolean"
  );
}

function isManualAssignment(value: unknown): value is Record<string, RoleId | null> {
  if (!isRecord(value)) return false;

  return Object.entries(value).every(
    ([playerId, roleId]) => playerId.length > 0 && (roleId === null || (typeof roleId === "string" && roleIds.includes(roleId as RoleId))),
  );
}

function isStringOrNull(value: unknown) {
  return typeof value === "string" || value === null;
}

function isStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, ...keys: string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
