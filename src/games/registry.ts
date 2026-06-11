import type { GameId } from "../types";
import { imposterDefinition } from "./imposter/definition";
import type { GameDefinition, GameRoomAdapter } from "./types";
import { undercoverDefinition } from "./undercover/definition";
import { werewolfDefinition } from "./werewolf/definition";

export const games: GameDefinition[] = [
  werewolfDefinition,
  imposterDefinition,
  undercoverDefinition,
];

export function getGameDefinition(id: GameId) {
  return games.find((game) => game.id === id);
}

export function requirePlayableGame(id: GameId) {
  const game = getGameDefinition(id);
  if (!game || game.status !== "playable") {
    throw new Error(`Game ${id} is not playable.`);
  }
  return game;
}

export function requireRoomAdapter(id: GameId): GameRoomAdapter {
  const game = requirePlayableGame(id);
  if (!game.roomAdapter) throw new Error(`Game ${id} is not playable.`);
  return game.roomAdapter;
}
