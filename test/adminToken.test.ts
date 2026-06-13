import { afterEach, describe, expect, it, vi } from "vitest";
import { clearUrlAdminToken, readUrlAdminToken } from "../src/online/adminToken";

const previousWindow = (globalThis as { window?: unknown }).window;

describe("admin token URL helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it("reads a trimmed admin token from the URL fragment", () => {
    useWindow("http://127.0.0.1:5173/admin#token=%20secret-admin-token%20");

    expect(readUrlAdminToken()).toBe("secret-admin-token");
  });

  it("ignores admin tokens in the query string", () => {
    useWindow("http://127.0.0.1:5173/admin?token=query-token");

    expect(readUrlAdminToken()).toBeNull();
  });

  it("removes the token from the fragment", () => {
    const replaceState = useWindow("http://127.0.0.1:5173/admin#token=secret-admin-token");

    clearUrlAdminToken();

    expect(replaceState).toHaveBeenCalledWith({}, "", "/admin");
  });

  it("preserves other fragment parameters when clearing the token", () => {
    const replaceState = useWindow("http://127.0.0.1:5173/admin?filter=active#view=rooms&token=secret-admin-token&sort=age");

    clearUrlAdminToken();

    expect(replaceState).toHaveBeenCalledWith({}, "", "/admin?filter=active#view=rooms&sort=age");
  });

  it("does not rewrite the URL when the fragment has no token", () => {
    const replaceState = useWindow("http://127.0.0.1:5173/admin#view=rooms");

    clearUrlAdminToken();

    expect(replaceState).not.toHaveBeenCalled();
  });
});

function useWindow(href: string) {
  const url = new URL(href);
  const replaceState = vi.fn();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: url.href,
        hash: url.hash,
      },
      history: {
        replaceState,
      },
    },
  });

  return replaceState;
}
