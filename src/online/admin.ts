import type { GameId, RoomPhase } from "../types";

export const ADMIN_INACTIVE_ACTIVITY_MS = 30 * 60 * 1000;

export const adminGameIds = ["werewolf", "imposter", "undercover"] as const satisfies readonly GameId[];
export const adminRoomPhases = ["lobby", "assignment", "roleReveal", "playing", "ended"] as const satisfies readonly RoomPhase[];

export type AdminInactiveReason = "hostOffline" | "staleActivity";

export interface AdminGameCounts {
  total: number;
  started: number;
  inactive: number;
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
