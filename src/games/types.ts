import type {
  GameId,
  GameStatus,
  HostRoomSnapshot,
  Locale,
  PlayerRoomSnapshot,
  StageRoomSnapshot,
  RoomAssignmentEntry,
  RoomPhase,
  RoomPlayerPublic,
  SessionMode,
} from "../types";

export type GameIconId = "shield" | "mask" | "spy";

export type TranslationLeaf = string | { [key: string]: TranslationLeaf };
export type TranslationBundle = Record<string, TranslationLeaf>;

export interface GameAssetSlots {
  logo?: string;
  cover?: string;
  icon?: string;
  roleIcons?: Record<string, string>;
}

export interface GameThemeTokens {
  name?: string;
  mood?: string;
  accent?: string;
  accentStrong?: string;
  accentSoft?: string;
  surface?: string;
  background?: string;
  appBackground?: string;
  cardBackground?: string;
  text?: string;
  muted?: string;
  border?: string;
  danger?: string;
  shadow?: string;
  assets?: GameAssetSlots;
  dark?: Omit<GameThemeTokens, "dark">;
}

export interface GameComponentSlots {
  localPlay?: string;
  roomHost?: string;
  roomPlayer?: string;
}

export interface GameSetupDefinition {
  createInitialState: (playerCount: number) => unknown;
  schema?: unknown;
}

export interface GameRoomPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface GameRoomRuntime {
  code: string;
  gameId: GameId;
  phase: RoomPhase;
  stageToken?: string | null;
  stageLocale?: Locale | null;
  players: GameRoomPlayer[];
  setupState: unknown;
  assignment: RoomAssignmentEntry[];
  gameState: unknown | null;
}

export interface GameCommand {
  type?: unknown;
}

export interface GameRoomAdapter {
  createInitialSetupState: (playerCount: number) => unknown;
  resetRoom: (room: GameRoomRuntime) => void;
  applyHostCommand: (room: GameRoomRuntime, command: GameCommand) => void;
  applyPlayerCommand: (room: GameRoomRuntime, player: GameRoomPlayer, command: GameCommand) => void;
  publicPlayer: (room: GameRoomRuntime, player: GameRoomPlayer) => RoomPlayerPublic;
  hostSnapshot: (room: GameRoomRuntime, players: RoomPlayerPublic[]) => HostRoomSnapshot;
  playerSnapshot: (room: GameRoomRuntime, player: GameRoomPlayer, players: RoomPlayerPublic[]) => PlayerRoomSnapshot;
  stageSnapshot?: (room: GameRoomRuntime, players: RoomPlayerPublic[]) => StageRoomSnapshot;
}

export interface GameDefinition {
  id: GameId;
  titleKey: string;
  descriptionKey: string;
  status: GameStatus;
  icon: GameIconId;
  supportedModes: SessionMode[];
  playerRange: string;
  duration: string;
  difficultyKey: string;
  setup: GameSetupDefinition;
  hostCommands: readonly string[];
  playerCommands: readonly string[];
  reducer: string;
  roomAdapter?: GameRoomAdapter;
  components: GameComponentSlots;
  i18n: Partial<Record<Locale, TranslationBundle>>;
  theme?: GameThemeTokens;
  assets?: GameAssetSlots;
}
