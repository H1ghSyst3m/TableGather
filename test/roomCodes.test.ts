import { describe, expect, it } from "vitest";
import { normalizeRoomCodeInput, ROOM_CODE_LENGTH } from "../src/online/roomCodes";

describe("room code helpers", () => {
  it("normalizes plain room code input to the central length", () => {
    expect(normalizeRoomCodeInput(" g5k-q9r-extra ")).toBe("G5KQ9R");
    expect(normalizeRoomCodeInput("abc123")).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("extracts invite link room segments case-insensitively", () => {
    expect(normalizeRoomCodeInput("https://table.example/room/g5kq9r?from=invite")).toBe("G5KQ9R");
    expect(normalizeRoomCodeInput("https://table.example/ROOM/abc-123#join")).toBe("ABC123");
  });

  it("does not derive room codes from unrelated URL content", () => {
    expect(normalizeRoomCodeInput("https://table.example/invite/g5kq9r")).toBe("");
    expect(normalizeRoomCodeInput("HTTPS://TABLE.EXAMPLE")).toBe("");
  });
});
