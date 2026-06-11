import type { GameId, Locale, RoomAssignmentEntry, RoomPhase } from "../src/types";

export interface RoomPlayer {
  id: string;
  name: string;
  token: string;
  clientId: string | null;
  connected: boolean;
}

export interface Room {
  code: string;
  gameId: GameId;
  hostToken: string;
  hostClientId: string | null;
  stageToken: string | null;
  stageLocale: Locale | null;
  phase: RoomPhase;
  players: RoomPlayer[];
  setupState: unknown;
  assignment: RoomAssignmentEntry[];
  gameState: unknown | null;
  createdAt: number;
}

export interface RoomStore {
  create(room: Room): void;
  get(code: string): Room | undefined;
  save(room: Room): void;
  delete(code: string): void;
  list(): Room[];
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  create(room: Room) {
    this.rooms.set(room.code, room);
  }

  get(code: string) {
    return this.rooms.get(code.toUpperCase());
  }

  save(room: Room) {
    this.rooms.set(room.code, room);
  }

  delete(code: string) {
    this.rooms.delete(code.toUpperCase());
  }

  list() {
    return Array.from(this.rooms.values());
  }
}
