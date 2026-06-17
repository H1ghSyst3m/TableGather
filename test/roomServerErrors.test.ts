import { describe, expect, it, vi } from "vitest";
import { translateCommonRoomServerError } from "../src/i18n/roomServerErrors";

describe("room server error translation", () => {
  it("translates shared room server errors", () => {
    const t = vi.fn((key: string) => `translated:${key}`);

    expect(translateCommonRoomServerError("Too many room requests.", t)).toBe("translated:errors.roomTooManyRequests");
    expect(t).toHaveBeenCalledWith("errors.roomTooManyRequests");
  });

  it("leaves unknown room server errors unchanged", () => {
    const t = vi.fn((key: string) => `translated:${key}`);

    expect(translateCommonRoomServerError("Unexpected room error.", t)).toBe("Unexpected room error.");
    expect(t).not.toHaveBeenCalled();
  });
});
