export type Locale = "en" | "de";

export type GameId = "werewolf" | "imposter" | "undercover";

export type SessionMode = "room" | "pass-and-play";

export type GameStatus = "playable" | "coming-soon";

export interface RoomPlayerPublic {
  id: string;
  name: string;
  connected: boolean;
  seenRole: boolean;
  alive?: boolean;
}

export type RoomPhase = "lobby" | "assignment" | "roleReveal" | "playing" | "ended";
export type RoomAudience = "host" | "player" | "stage";

export interface RoomAssignmentEntry<TRoleId extends string = string> {
  playerId: string;
  roleId: TRoleId | null;
}

export interface HostRoomSnapshot {
  audience: "host";
  code: string;
  phase: RoomPhase;
  gameId: GameId;
  players: RoomPlayerPublic[];
  stageToken?: string | null;
  stageLocale?: Locale | null;
}

export interface PlayerRoomSnapshot {
  audience: "player";
  code: string;
  phase: RoomPhase;
  gameId: GameId;
  self: RoomPlayerPublic;
  players: RoomPlayerPublic[];
  winner?: string | null;
}

export interface StageRoomSnapshot {
  audience: "stage";
  code: string;
  phase: RoomPhase;
  gameId: GameId;
  players: RoomPlayerPublic[];
  stageLocale?: Locale | null;
}

export type RoomSnapshot = HostRoomSnapshot | PlayerRoomSnapshot | StageRoomSnapshot;
