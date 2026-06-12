import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStoredHostRoomToken,
  getStoredPlayerRoomToken,
  listStoredRoomSessionCandidates,
  listStoredRoomSessions,
  removeHostRoomSession,
  removePlayerRoomSession,
  saveHostRoomSession,
  savePlayerRoomSession,
} from "../src/online/roomSessionStorage";

const previousStorage = globalThis.localStorage;

describe("room session storage", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
    vi.restoreAllMocks();
  });

  it("lists host and player candidates before deduping sessions", () => {
    useStorage(
      createMemoryStorage({
        "tablegather-room-ABCD-host": "HOST_TOKEN",
        "tablegather-room-ABCD-player": "PLAYER_TOKEN",
      }),
    );

    expect(listStoredRoomSessionCandidates()).toEqual([
      { roomCode: "ABCD", role: "host", token: "HOST_TOKEN" },
      { roomCode: "ABCD", role: "player", token: "PLAYER_TOKEN" },
    ]);
  });

  it("keeps deduped sessions host-preferred", () => {
    useStorage(
      createMemoryStorage({
        "tablegather-room-ABCD-player": "PLAYER_TOKEN",
        "tablegather-room-ABCD-host": "HOST_TOKEN",
      }),
    );

    expect(listStoredRoomSessions()).toEqual([{ roomCode: "ABCD", role: "host", token: "HOST_TOKEN" }]);
  });

  it("does not throw when storage methods fail", () => {
    useStorage(createThrowingStorage());

    expect(() => {
      expect(getStoredHostRoomToken("ABCD")).toBeNull();
      expect(getStoredPlayerRoomToken("ABCD")).toBeNull();
      expect(listStoredRoomSessionCandidates()).toEqual([]);
      expect(listStoredRoomSessions()).toEqual([]);
      saveHostRoomSession("ABCD", "HOST_TOKEN");
      savePlayerRoomSession("ABCD", "PLAYER_TOKEN");
      removeHostRoomSession("ABCD");
      removePlayerRoomSession("ABCD");
    }).not.toThrow();
  });

  it("does not throw when storage key iteration fails", () => {
    const storage = createMemoryStorage({
      "tablegather-room-ABCD-host": "HOST_TOKEN",
    });
    storage.key = vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    useStorage(storage);

    expect(listStoredRoomSessionCandidates()).toEqual([]);
  });

  it("keeps the player token when saving the host token fails", () => {
    const storage = createMemoryStorage({
      "tablegather-room-ABCD-player": "PLAYER_TOKEN",
    });
    storage.setItem = vi.fn(() => {
      throw new DOMException("blocked", "QuotaExceededError");
    });
    useStorage(storage);

    saveHostRoomSession("ABCD", "HOST_TOKEN");

    expect(getStoredPlayerRoomToken("ABCD")).toBe("PLAYER_TOKEN");
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

function useStorage(storage: Storage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } as unknown as Storage;
}

function createThrowingStorage() {
  return {
    get length() {
      throw new DOMException("blocked", "SecurityError");
    },
    clear: vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
    getItem: vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
    key: vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
    removeItem: vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
    setItem: vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
  } as unknown as Storage;
}
