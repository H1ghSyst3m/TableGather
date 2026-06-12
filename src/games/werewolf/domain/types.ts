export type RoleId =
  | "werewolf"
  | "villager"
  | "seer"
  | "witch"
  | "hunter"
  | "cupid"
  | "fool"
  | "villageIdiot"
  | "auraSeer"
  | "detective"
  | "alphaWolf"
  | "nightGuest"
  | "protector"
  | "wildChild"
  | "cursed"
  | "infected"
  | "littleGirl"
  | "toughGuy";

export type Winner = "villagers" | "werewolves" | "fool" | "villageIdiot" | "lovers";

export type WerewolfPhase = "roleReveal" | "night" | "day" | "ended";

export type WerewolfDayTimerStatus = "idle" | "running" | "paused";

export type WerewolfDayTimerDurationSeconds = 120 | 180 | 300 | 420 | 600;

export type NightStepId =
  | "sleep"
  | "cupid"
  | "lovers"
  | "wildChild"
  | "nightGuest"
  | "protector"
  | "wolves"
  | "cursedInfo"
  | "alphaWolf"
  | "alphaWolfInfo"
  | "seer"
  | "auraSeer"
  | "detective"
  | "witch"
  | "toughGuyInfo"
  | "dawn";

export type WinMode = "standard" | "extended";

export type RevealMode = "hidden" | "team" | "role";

export type WerewolfLogType =
  | "gameStarted"
  | "roleRevealDone"
  | "roleAction"
  | "nightDeath"
  | "noNightDeath"
  | "noDayElimination"
  | "dayElimination"
  | "hunterShot"
  | "hunterSkipped"
  | "roleConverted"
  | "toughGuyWounded"
  | "toughGuyDeath"
  | "wolvesWeakened"
  | "specialWin"
  | "villagersWin"
  | "werewolvesWin";

export type WerewolfLogPrivacy = "public" | "sensitive";

export type WerewolfLogTeam = "good" | "evil";

export type WerewolfLogResult =
  | "selectedLovers"
  | "selectedModel"
  | "visited"
  | "protected"
  | "attacked"
  | "skippedAttack"
  | "keptKill"
  | "alphaInfected"
  | "inspectedRole"
  | "checkedAura"
  | "comparedTeams"
  | "witchHealed"
  | "witchPoisoned"
  | "witchNoPotion"
  | "cursedConverted"
  | "wildChildConverted";

export interface WerewolfPublicLogSummary {
  type: WerewolfLogType;
  actorRoleId?: RoleId;
  targetCount?: number;
  result?: WerewolfLogResult;
}

export interface WerewolfLogEntry {
  id: string;
  type: WerewolfLogType;
  privacy?: WerewolfLogPrivacy;
  round?: number;
  stepId?: NightStepId;
  actorRoleId?: RoleId;
  actorIds?: string[];
  targetIds?: string[];
  targetRoleIds?: RoleId[];
  result?: WerewolfLogResult;
  resultRoleId?: RoleId;
  resultTeam?: WerewolfLogTeam;
  sameTeam?: boolean;
  publicSummary?: WerewolfPublicLogSummary;
  playerName?: string;
}

export interface WerewolfDayTimer {
  durationSeconds: WerewolfDayTimerDurationSeconds;
  status: WerewolfDayTimerStatus;
  startedAt: number | null;
  pausedRemainingSeconds: number;
}

export interface WerewolfDayTimerPublicSnapshot {
  durationSeconds: WerewolfDayTimerDurationSeconds;
  status: WerewolfDayTimerStatus;
  startedAt: number | null;
  remainingSeconds: number;
  serverTime: number;
}

export type WerewolfPublicEvent =
  | { type: "nightDeaths"; playerIds: string[]; source: "night" }
  | { type: "noNightDeaths"; source: "night" }
  | { type: "voteDeath"; playerId: string; source: "day" }
  | { type: "loverDeath"; playerId: string; source: "day" | "night" }
  | { type: "hunterPending"; playerId: string; source: "day" | "night" }
  | { type: "hunterShot"; hunterId: string; playerId: string; source: "day" | "night" }
  | { type: "hunterSkipped"; hunterId: string; source: "day" | "night" }
  | { type: "winner"; winner: Winner };

export interface WerewolfPlayer {
  id: string;
  name: string;
  roleId: RoleId;
  originalRoleId: RoleId;
  alphaWolfInfected: boolean;
  alive: boolean;
  seenRole: boolean;
  loverId: string | null;
}

export type RoleCounts = Partial<Record<RoleId, number>>;

export interface WerewolfOptions {
  winMode: WinMode;
  revealMode: RevealMode;
  roleReveal: boolean;
}

export interface WerewolfState {
  id: string;
  phase: WerewolfPhase;
  players: WerewolfPlayer[];
  options: WerewolfOptions;
  roleRevealIndex: number;
  round: number;
  nightSteps: NightStepId[];
  nightStepIndex: number;
  nightResolved: boolean;
  protectedPlayerId: string | null;
  protectorLastTargetId: string | null;
  nightGuestHostId: string | null;
  wildChildModelId: string | null;
  cupidTargetIds: string[];
  inspectedPlayerId: string | null;
  seerResultRevealed: boolean;
  auraTargetId: string | null;
  auraResultRevealed: boolean;
  detectiveTargetIds: string[];
  detectiveResultRevealed: boolean;
  wolfTargetId: string | null;
  cursedConvertedTonightId: string | null;
  alphaWolfTransform: boolean | null;
  alphaWolfUsed: boolean;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  witchHealTonight: boolean;
  witchPoisonTargetId: string | null;
  wolvesSkipNextNight: boolean;
  toughGuyWoundedId: string | null;
  toughGuyWoundedTonightId: string | null;
  lastNightDeaths: string[];
  lastDayDeaths: string[];
  pendingHunterId: string | null;
  pendingHunterQueue: string[];
  pendingHunterSource: "night" | "day" | null;
  publicEvents: WerewolfPublicEvent[];
  publicEventIndex: number;
  dayTimer: WerewolfDayTimer;
  winner: Winner | null;
  log: WerewolfLogEntry[];
}

export interface RoleValidation {
  valid: boolean;
  playerCount: number;
  roleTotal: number;
  reason: "ok" | "minimum" | "sum";
}
