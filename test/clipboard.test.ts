import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/clipboard";

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("https://example.test/room/ABCD")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.test/room/ABCD");
  });

  it("falls back to a temporary textarea when Clipboard API copy is blocked", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    const fallback = createDocumentFallback(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", fallback.document);

    await expect(copyText("https://example.test/room/ABCD")).resolves.toBe(true);
    expect(fallback.textarea.value).toBe("https://example.test/room/ABCD");
    expect(fallback.textarea.focus).toHaveBeenCalled();
    expect(fallback.textarea.select).toHaveBeenCalled();
    expect(fallback.document.execCommand).toHaveBeenCalledWith("copy");
    expect(fallback.document.body.removeChild).toHaveBeenCalledWith(fallback.textarea);
  });

  it("reports failure when both copy strategies fail", async () => {
    const fallback = createDocumentFallback(false);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", fallback.document);

    await expect(copyText("https://example.test/room/ABCD")).resolves.toBe(false);
    expect(fallback.document.execCommand).toHaveBeenCalledWith("copy");
  });
});

function createDocumentFallback(execResult: boolean) {
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
  };
  const document = {
    activeElement: null,
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => execResult),
  };

  return { document, textarea };
}
