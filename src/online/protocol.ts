export const ROOM_PROTOCOL_VERSION = 16;

export const ROOM_PROTOCOL_FEATURES = [
  "transferHost",
  "roleRevealAllPlayers",
  "guidedNightFlow",
  "prototypeNightRules",
  "nightReportStep",
  "completeRoleParity",
  "privateFormerRole",
  "roomAssignmentFlow",
  "roomLookup",
  "stageMode",
  "stageLocaleControl",
  "roomExpiry",
  "roomSessions",
  "werewolfHostUndo",
] as const;

export type RoomProtocolFeature = (typeof ROOM_PROTOCOL_FEATURES)[number];

export interface RoomServerInfo {
  protocolVersion: number;
  features: readonly RoomProtocolFeature[];
}
