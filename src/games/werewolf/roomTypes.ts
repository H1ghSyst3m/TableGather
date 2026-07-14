import type { HostRoomSnapshot, PlayerRoomSnapshot, RoomAssignmentEntry, RoomPhase, RoomPlayerPublic, StageRoomSnapshot } from "../../types";
import type {
  RevealMode,
  RoleCounts,
  RoleId,
  WerewolfDayTimerPublicSnapshot,
  WerewolfOptions,
  WerewolfState,
  Winner,
} from "./domain/types";

export type WerewolfRoomAssignMode = "random" | "manual" | null;
export type WerewolfPreparationStep = "roles" | "rules";

export interface WerewolfSetupState {
  roleCounts: RoleCounts;
  options: WerewolfOptions;
  assignMode: WerewolfRoomAssignMode;
  preparationStep: WerewolfPreparationStep;
}

export type WerewolfRoomAssignmentEntry = RoomAssignmentEntry<RoleId>;

export interface WerewolfRoomUndoState {
  phase: RoomPhase;
  gameState: WerewolfState;
}

export interface WerewolfHostRoomSnapshot extends HostRoomSnapshot {
  roleCounts: RoleCounts;
  options: WerewolfOptions;
  assignMode: WerewolfRoomAssignMode;
  preparationStep: WerewolfPreparationStep;
  assignment: WerewolfRoomAssignmentEntry[];
  serverTime: number;
  gameState: WerewolfState | null;
  canUndo: boolean;
}

export interface WerewolfPlayerRoomSnapshot extends PlayerRoomSnapshot {
  self: RoomPlayerPublic & {
    roleId?: RoleId;
    originalRoleId?: RoleId;
    alphaWolfInfected?: boolean;
  };
  options?: WerewolfOptions;
  winner?: Winner | null;
}

export type WerewolfStageScene =
  | "lobby"
  | "setup"
  | "assignment"
  | "roleReveal"
  | "night"
  | "nightReport"
  | "hunter"
  | "day"
  | "voteReveal"
  | "ended";

export interface WerewolfStageReveal {
  mode: Exclude<RevealMode, "hidden">;
  team?: "good" | "evil";
  roleId?: RoleId;
}

export interface WerewolfStageEvent {
  type: "nightDeaths" | "noNightDeaths" | "voteDeath" | "loverDeath" | "hunterPending" | "hunterShot" | "hunterSkipped" | "winner";
  source?: "day" | "night";
  playerIds?: string[];
  playerId?: string;
  hunterId?: string;
  reveal?: WerewolfStageReveal;
  winner?: Winner;
}

export interface WerewolfStageRoomSnapshot extends StageRoomSnapshot {
  scene: WerewolfStageScene;
  round: number | null;
  revealMode: RevealMode;
  players: RoomPlayerPublic[];
  activeEvent: WerewolfStageEvent | null;
  pastEvents: WerewolfStageEvent[];
  events: WerewolfStageEvent[];
  dayTimer: WerewolfDayTimerPublicSnapshot | null;
  winner?: Winner | null;
}
