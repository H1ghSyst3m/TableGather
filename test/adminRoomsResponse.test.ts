import { describe, expect, it } from "vitest";
import { isAdminRoomsResponse } from "../src/online/admin";
import { ROOM_PROTOCOL_FEATURES, ROOM_PROTOCOL_VERSION } from "../src/online/protocol";

describe("admin room response validation", () => {
  it("accepts a valid admin room response", () => {
    expect(isAdminRoomsResponse(createAdminRoomsResponse())).toBe(true);
  });

  it("rejects malformed top-level admin room responses", () => {
    expect(isAdminRoomsResponse({ ...createAdminRoomsResponse(), ok: false })).toBe(false);
    expect(isAdminRoomsResponse({ ...createAdminRoomsResponse(), serverTime: "now" })).toBe(false);
    expect(isAdminRoomsResponse({ ...createAdminRoomsResponse(), protocolVersion: "16" })).toBe(false);
  });

  it("rejects admin room responses with non-array rooms", () => {
    expect(isAdminRoomsResponse({ ...createAdminRoomsResponse(), rooms: {} })).toBe(false);
  });

  it("rejects admin room responses with malformed totals", () => {
    expect(isAdminRoomsResponse({ ...createAdminRoomsResponse(), totals: { ...createCounts(), active: "2" } })).toBe(false);
  });

  it("rejects admin room responses with malformed room rows", () => {
    const response = createAdminRoomsResponse();

    expect(isAdminRoomsResponse({ ...response, rooms: [{ ...response.rooms[0], progressStatus: "stalled" }] })).toBe(false);
    expect(isAdminRoomsResponse({ ...response, rooms: [{ ...response.rooms[0], inactiveReasons: ["unknown"] }] })).toBe(false);
    expect(isAdminRoomsResponse({ ...response, rooms: [{ ...response.rooms[0], playerCount: "5" }] })).toBe(false);
  });
});

function createAdminRoomsResponse() {
  const now = 1_700_000_000_000;

  return {
    ok: true,
    serverTime: now,
    inactiveActivityMs: 30 * 60 * 1000,
    totals: { total: 1, active: 1, running: 1, waiting: 0, inactive: 0, ended: 0 },
    byGame: {
      werewolf: { total: 1, active: 1, running: 1, waiting: 0, inactive: 0, ended: 0 },
      imposter: createCounts(),
      undercover: createCounts(),
    },
    byPhase: {
      lobby: 0,
      assignment: 0,
      roleReveal: 1,
      playing: 0,
      ended: 0,
    },
    rooms: [
      {
        code: "ABCD",
        gameId: "werewolf",
        phase: "roleReveal",
        playerCount: 5,
        connectedPlayerCount: 5,
        hostConnected: true,
        createdAt: now - 60_000,
        lastActivityAt: now,
        expiresAt: now + 48 * 60 * 60 * 1000,
        started: true,
        active: true,
        running: true,
        waiting: false,
        progressStatus: "running",
        inactive: false,
        inactiveReasons: [],
      },
    ],
    protocolVersion: ROOM_PROTOCOL_VERSION,
    features: ROOM_PROTOCOL_FEATURES,
  };
}

function createCounts() {
  return { total: 0, active: 0, running: 0, waiting: 0, inactive: 0, ended: 0 };
}
