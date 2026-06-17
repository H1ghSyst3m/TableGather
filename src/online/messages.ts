import type { GameId, Locale, RoomPhase } from "../types";
import type { RoomServerInfo } from "./protocol";
import type { WerewolfHostCommand, WerewolfPlayerCommand } from "../games/werewolf/commands";

export type ClientMessage =
  | { type: "createRoom"; requestId?: string; payload: { gameId: GameId } }
  | { type: "inspectRoom"; requestId?: string; roomCode: string }
  | { type: "inspectRoomSession"; requestId?: string; roomCode: string; clientToken: string }
  | { type: "inspectStage"; requestId?: string; roomCode: string; stageToken: string }
  | { type: "joinStage"; requestId?: string; roomCode: string; stageToken: string }
  | { type: "joinRoom"; requestId?: string; roomCode: string; payload: { name: string } }
  | { type: "resumeRoom"; requestId?: string; roomCode: string; clientToken: string }
  | { type: "hostCommand"; requestId?: string; roomCode: string; clientToken: string; payload: HostCommand }
  | { type: "playerCommand"; requestId?: string; roomCode: string; clientToken: string; payload: PlayerCommand }
  | { type: "leaveRoom"; requestId?: string; roomCode: string; clientToken: string };

export type CommonHostCommand =
  | { type: "kickPlayer"; playerId: string }
  | { type: "transferHost"; playerId: string }
  | { type: "createStageLink"; stageLocale?: Locale }
  | { type: "setStageLocale"; stageLocale: Locale }
  | { type: "disableStageLink" }
  | { type: "closeRoom" }
  | { type: "resetToLobby" };

export type HostCommand = CommonHostCommand | WerewolfHostCommand;

export type PlayerCommand = WerewolfPlayerCommand;

export type ServerMessage =
  | ({ type: "connected"; requestId?: string; role: "host" | "player" | "stage"; roomCode: string; clientToken: string } & RoomServerInfo)
  | ({
      type: "roomStatus";
      requestId?: string;
      roomCode: string;
      exists: boolean;
      joinable: boolean;
      gameId?: GameId;
      phase?: RoomPhase;
      playerCount?: number;
    } & RoomServerInfo)
  | ({
      type: "roomSessionStatus";
      requestId?: string;
      roomCode: string;
      valid: false;
    } & RoomServerInfo)
  | ({
      type: "roomSessionStatus";
      requestId?: string;
      roomCode: string;
      valid: true;
      role: "host" | "player";
      gameId: GameId;
      phase: RoomPhase;
      playerCount: number;
      createdAt: number;
      lastActivityAt: number;
      expiresAt: number;
      playerName?: string;
    } & RoomServerInfo)
  | ({
      type: "stageStatus";
      requestId?: string;
      roomCode: string;
      valid: false;
    } & RoomServerInfo)
  | ({
      type: "stageStatus";
      requestId?: string;
      roomCode: string;
      valid: true;
      gameId: GameId;
      phase: RoomPhase;
      playerCount: number;
    } & RoomServerInfo)
  | { type: "snapshot"; roomCode: string; snapshot: unknown }
  | { type: "roomClosed"; roomCode: string }
  | { type: "hostTransferred"; roomCode: string; toPlayerId?: string }
  | { type: "kicked"; roomCode: string }
  | { type: "leftRoom"; roomCode: string }
  | { type: "error"; requestId?: string; message: string };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string") return null;
  if (!hasOptionalStringField(raw, "requestId")) return null;

  switch (type) {
    case "createRoom": {
      const payload = raw.payload;
      if (!isRecord(payload) || typeof payload.gameId !== "string") return null;
      return raw as ClientMessage;
    }
    case "joinRoom": {
      const payload = raw.payload;
      if (!hasStringField(raw, "roomCode")) return null;
      if (!isRecord(payload) || typeof payload.name !== "string") return null;
      return raw as ClientMessage;
    }
    case "resumeRoom":
    case "leaveRoom":
      if (!hasStringField(raw, "roomCode")) return null;
      if (!hasStringField(raw, "clientToken")) return null;
      return raw as ClientMessage;
    case "hostCommand":
    case "playerCommand": {
      if (!hasStringField(raw, "roomCode")) return null;
      if (!hasStringField(raw, "clientToken")) return null;
      if (!isCommandPayload(raw.payload)) return null;
      return raw as ClientMessage;
    }
    case "inspectStage":
    case "joinStage":
      if (!hasStringField(raw, "roomCode")) return null;
      if (!hasStringField(raw, "stageToken")) return null;
      return raw as ClientMessage;
    case "inspectRoom":
      if (!hasStringField(raw, "roomCode")) return null;
      return raw as ClientMessage;
    case "inspectRoomSession":
      if (!hasStringField(raw, "roomCode")) return null;
      if (!hasStringField(raw, "clientToken")) return null;
      return raw as ClientMessage;
    default:
      return null;
  }
}

function hasStringField(message: Record<string, unknown>, key: string) {
  return typeof message[key] === "string";
}

function hasOptionalStringField(message: Record<string, unknown>, key: string) {
  return message[key] === undefined || typeof message[key] === "string";
}

function isCommandPayload(value: unknown) {
  return isRecord(value) && typeof value.type === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
