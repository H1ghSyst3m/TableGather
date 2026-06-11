import type { GameId, Locale, RoomPhase } from "../types";
import type { RoomServerInfo } from "./protocol";
import type { WerewolfHostCommand, WerewolfPlayerCommand } from "../games/werewolf/commands";

export type ClientMessage =
  | { type: "createRoom"; requestId?: string; payload: { gameId: GameId } }
  | { type: "inspectRoom"; requestId?: string; roomCode: string }
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
  | { type: "snapshot"; roomCode: string; snapshot: unknown }
  | { type: "roomClosed"; roomCode: string }
  | { type: "hostTransferred"; roomCode: string; toPlayerId?: string }
  | { type: "kicked"; roomCode: string }
  | { type: "leftRoom"; roomCode: string }
  | { type: "error"; requestId?: string; message: string };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== "object" || !("type" in raw)) return null;
  const type = (raw as { type: unknown }).type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "createRoom":
    case "joinRoom":
    case "resumeRoom":
    case "hostCommand":
    case "playerCommand":
    case "leaveRoom":
      return raw as ClientMessage;
    case "joinStage": {
      const message = raw as { requestId?: unknown; roomCode?: unknown; stageToken?: unknown };
      if (typeof message.roomCode !== "string") return null;
      if (typeof message.stageToken !== "string") return null;
      if (message.requestId !== undefined && typeof message.requestId !== "string") return null;
      return raw as ClientMessage;
    }
    case "inspectRoom": {
      const message = raw as { requestId?: unknown; roomCode?: unknown };
      if (typeof message.roomCode !== "string") return null;
      if (message.requestId !== undefined && typeof message.requestId !== "string") return null;
      return raw as ClientMessage;
    }
    default:
      return null;
  }
}
