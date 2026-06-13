import type { GameId, RoomPhase } from "../types";

export const ADMIN_INACTIVE_ACTIVITY_MS = 30 * 60 * 1000;

export const adminGameIds = ["werewolf", "imposter", "undercover"] as const satisfies readonly GameId[];
export const adminRoomPhases = ["lobby", "assignment", "roleReveal", "playing", "ended"] as const satisfies readonly RoomPhase[];

export type AdminInactiveReason = "hostOffline" | "staleActivity";
export type AdminProgressStatus = "running" | "waiting" | "ended";

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
