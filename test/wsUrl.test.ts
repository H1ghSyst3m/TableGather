import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRoomServerHttpUrl } from "../src/online/wsUrl";

const previousWindow = (globalThis as { window?: unknown }).window;

describe("websocket URL helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it("resolves the default admin endpoint next to the websocket endpoint", () => {
    vi.stubEnv("VITE_WS_URL", "");
    useWindowLocation("http://127.0.0.1:5173/admin");

    expect(resolveRoomServerHttpUrl("/admin/rooms")).toBe("http://127.0.0.1:8787/admin/rooms");
  });

  it("preserves a websocket parent path prefix for admin endpoints", () => {
    vi.stubEnv("VITE_WS_URL", "wss://example.test/tablegather/ws?stale=query#hash");
    useWindowLocation("https://example.test/tablegather/admin");

    expect(resolveRoomServerHttpUrl("/admin/rooms")).toBe("https://example.test/tablegather/admin/rooms");
  });
});

function useWindowLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        protocol: url.protocol,
        hostname: url.hostname,
        href: url.href,
      },
    },
  });
}
