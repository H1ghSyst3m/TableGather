import type { ComponentType } from "react";
import type { GameId } from "../types";
import { getGameDefinition } from "./registry";
import type { GameDefinition } from "./types";
import { LocalWerewolfApp } from "./werewolf/components/LocalWerewolfApp";
import { WerewolfRoomHostScreen } from "./werewolf/components/WerewolfRoomHostScreen";
import { WerewolfRoomPlayerScreen } from "./werewolf/components/WerewolfRoomPlayerScreen";
import { WerewolfStageScreen } from "./werewolf/components/WerewolfStageScreen";

export interface LocalPlayRouteProps {
  navigate: (path: string) => void;
}

export interface RoomHostRouteProps {
  code?: string;
  gameId?: GameId;
  navigate: (path: string) => void;
}

export interface RoomPlayerRouteProps {
  code?: string;
  navigate: (path: string) => void;
  onResolvedGameId?: (gameId: GameId, roomCode: string) => void;
}

export interface StageRouteProps {
  code: string;
  token: string;
  navigate: (path: string) => void;
}

interface GameRouteComponents {
  localPlay?: ComponentType<LocalPlayRouteProps>;
  roomHost?: ComponentType<RoomHostRouteProps>;
  roomPlayer?: ComponentType<RoomPlayerRouteProps>;
  stage?: ComponentType<StageRouteProps>;
}

export interface ResolvedRouteComponent<TProps> {
  game: GameDefinition;
  Component: ComponentType<TProps>;
}

const routeComponents: Partial<Record<GameId, GameRouteComponents>> = {
  werewolf: {
    localPlay: LocalWerewolfApp,
    roomHost: WerewolfRoomHostScreen,
    roomPlayer: WerewolfRoomPlayerScreen,
    stage: WerewolfStageScreen,
  },
};

const defaultRoomEntryGameId: GameId = "werewolf";

export function resolveDefaultRoomHostRouteComponent() {
  return resolveRoomHostRouteComponent(defaultRoomEntryGameId);
}

export function resolveDefaultRoomPlayerRouteComponent() {
  return resolveRoomPlayerRouteComponent(defaultRoomEntryGameId);
}

export function resolveDefaultStageRouteComponent() {
  return resolveStageRouteComponent(defaultRoomEntryGameId);
}

export function resolveLocalPlayRouteComponent(gameId: GameId): ResolvedRouteComponent<LocalPlayRouteProps> | null {
  const game = playableGame(gameId);
  const Component = game?.components.localPlay ? routeComponents[game.id]?.localPlay : undefined;

  return game && Component && game.supportedModes.includes("pass-and-play") ? { game, Component } : null;
}

export function resolveRoomHostRouteComponent(gameId: GameId): ResolvedRouteComponent<RoomHostRouteProps> | null {
  const game = playableGame(gameId);
  const Component = game?.components.roomHost ? routeComponents[game.id]?.roomHost : undefined;

  return game && Component && game.supportedModes.includes("room") && game.roomAdapter ? { game, Component } : null;
}

export function resolveRoomPlayerRouteComponent(gameId: GameId): ResolvedRouteComponent<RoomPlayerRouteProps> | null {
  const game = playableGame(gameId);
  const Component = game?.components.roomPlayer ? routeComponents[game.id]?.roomPlayer : undefined;

  return game && Component && game.supportedModes.includes("room") && game.roomAdapter ? { game, Component } : null;
}

export function resolveStageRouteComponent(gameId: GameId): ResolvedRouteComponent<StageRouteProps> | null {
  const game = playableGame(gameId);
  const Component = game?.components.stage ? routeComponents[game.id]?.stage : undefined;

  return game && Component && game.supportedModes.includes("room") && game.roomAdapter?.stageSnapshot ? { game, Component } : null;
}

function playableGame(gameId: GameId) {
  const game = getGameDefinition(gameId);
  return game?.status === "playable" ? game : null;
}
