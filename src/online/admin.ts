import type { GameId, RoomPhase } from "../types";
import type { RoomServerInfo } from "./protocol";

export const ADMIN_INACTIVE_ACTIVITY_MS = 30 * 60 * 1000;

export const adminGameIds = ["werewolf", "imposter", "undercover"] as const satisfies readonly GameId[];
export const adminRoomPhases = ["lobby", "setup", "assignment", "roleReveal", "playing", "ended"] as const satisfies readonly RoomPhase[];

export type AdminInactiveReason = "hostOffline" | "staleActivity";
export type AdminProgressStatus = "running" | "waiting" | "ended";

const adminInactiveReasons = ["hostOffline", "staleActivity"] as const satisfies readonly AdminInactiveReason[];
const adminProgressStatuses = ["running", "waiting", "ended"] as const satisfies readonly AdminProgressStatus[];
const adminCountKeys = ["total", "active", "running", "waiting", "inactive", "ended"] as const satisfies readonly (keyof AdminGameCounts)[];

export interface AdminGameCounts {
  total: number;
  active: number;
  running: number;
  waiting: number;
  inactive: number;
  ended: number;
}

export interface AdminRoomSummary {
  code: string;
  gameId: GameId;
  phase: RoomPhase;
  playerCount: number;
  connectedPlayerCount: number;
  hostConnected: boolean;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  started: boolean;
  active: boolean;
  running: boolean;
  waiting: boolean;
  progressStatus: AdminProgressStatus;
  inactive: boolean;
  inactiveReasons: AdminInactiveReason[];
}

export interface AdminRoomsSummary {
  serverTime: number;
  inactiveActivityMs: number;
  totals: AdminGameCounts;
  byGame: Record<GameId, AdminGameCounts>;
  byPhase: Record<RoomPhase, number>;
  rooms: AdminRoomSummary[];
}

export type AdminRoomsResponse = { ok: true } & AdminRoomsSummary & RoomServerInfo;

export function isAdminRoomsResponse(value: unknown): value is AdminRoomsResponse {
  if (!isRecord(value)) return false;
  if (value.ok !== true) return false;
  if (!isNumber(value.serverTime) || !isNumber(value.inactiveActivityMs)) return false;
  if (!isAdminGameCounts(value.totals)) return false;
  if (!isAdminGameCountsByGame(value.byGame)) return false;
  if (!isPhaseCounts(value.byPhase)) return false;
  if (!Array.isArray(value.rooms) || !value.rooms.every(isAdminRoomSummary)) return false;
  if (!isNumber(value.protocolVersion)) return false;
  return Array.isArray(value.features) && value.features.every((feature) => typeof feature === "string");
}

function isAdminRoomSummary(value: unknown): value is AdminRoomSummary {
  if (!isRecord(value)) return false;
  if (typeof value.code !== "string" || !isGameId(value.gameId) || !isRoomPhase(value.phase)) return false;
  if (!isNumber(value.playerCount) || !isNumber(value.connectedPlayerCount)) return false;
  if (!isNumber(value.createdAt) || !isNumber(value.lastActivityAt) || !isNumber(value.expiresAt)) return false;
  if (!isBoolean(value.hostConnected) || !isBoolean(value.started) || !isBoolean(value.active)) return false;
  if (!isBoolean(value.running) || !isBoolean(value.waiting) || !isBoolean(value.inactive)) return false;
  if (!isProgressStatus(value.progressStatus)) return false;
  return Array.isArray(value.inactiveReasons) && value.inactiveReasons.every(isInactiveReason);
}

function isAdminGameCounts(value: unknown): value is AdminGameCounts {
  if (!isRecord(value)) return false;
  return adminCountKeys.every((key) => isNumber(value[key]));
}

function isAdminGameCountsByGame(value: unknown): value is Record<GameId, AdminGameCounts> {
  if (!isRecord(value)) return false;
  return adminGameIds.every((gameId) => isAdminGameCounts(value[gameId]));
}

function isPhaseCounts(value: unknown): value is Record<RoomPhase, number> {
  if (!isRecord(value)) return false;
  return adminRoomPhases.every((phase) => isNumber(value[phase]));
}

function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && adminGameIds.includes(value as GameId);
}

function isRoomPhase(value: unknown): value is RoomPhase {
  return typeof value === "string" && adminRoomPhases.includes(value as RoomPhase);
}

function isInactiveReason(value: unknown): value is AdminInactiveReason {
  return typeof value === "string" && adminInactiveReasons.includes(value as AdminInactiveReason);
}

function isProgressStatus(value: unknown): value is AdminProgressStatus {
  return typeof value === "string" && adminProgressStatuses.includes(value as AdminProgressStatus);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
