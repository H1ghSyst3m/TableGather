import { describe, expect, it } from "vitest";
import { roomSocketReconnectDelayMs } from "../src/online/useRoomSocket";

describe("room socket reconnect backoff", () => {
  it("backs off reconnect attempts and caps the delay", () => {
    expect(roomSocketReconnectDelayMs(-1)).toBe(500);
    expect(roomSocketReconnectDelayMs(0)).toBe(500);
    expect(roomSocketReconnectDelayMs(1)).toBe(1_000);
    expect(roomSocketReconnectDelayMs(2)).toBe(2_000);
    expect(roomSocketReconnectDelayMs(3)).toBe(4_000);
    expect(roomSocketReconnectDelayMs(4)).toBe(8_000);
    expect(roomSocketReconnectDelayMs(20)).toBe(8_000);
  });
});
