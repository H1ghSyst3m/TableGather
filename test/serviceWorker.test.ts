import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://tablegather.app";

describe("service worker", () => {
  it("loads navigations from the network before using the offline shell", async () => {
    const worker = loadServiceWorker();
    const cachedShell = response("cached shell");
    const networkShell = response("network shell");
    worker.cache.seed("/", cachedShell);
    worker.fetchMock.mockResolvedValueOnce(networkShell);

    const event = createFetchEvent(request("/", "navigate"));
    worker.fetch(event);

    expect(event.respondWith).toHaveBeenCalledTimes(1);
    await expect(event.response()).resolves.toBe(networkShell);
    expect(worker.fetchMock).toHaveBeenCalledWith(event.request);
  });

  it("falls back to the cached app shell when navigation is offline", async () => {
    const worker = loadServiceWorker();
    const cachedShell = response("cached shell");
    worker.cache.seed("/", cachedShell);
    worker.fetchMock.mockRejectedValueOnce(new Error("offline"));

    const event = createFetchEvent(request("/room/ABCD", "navigate"));
    worker.fetch(event);

    expect(event.respondWith).toHaveBeenCalledTimes(1);
    await expect(event.response()).resolves.toBe(cachedShell);
  });

  it("does not intercept worker, health, or websocket requests", () => {
    const worker = loadServiceWorker();
    const bypassedPaths = ["/sw.js", "/health", "/ws"];

    for (const path of bypassedPaths) {
      const event = createFetchEvent(request(path));
      worker.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    }
  });

  it("caches same-origin hashed assets after a network response", async () => {
    const worker = loadServiceWorker();
    const assetResponse = response("asset");
    worker.fetchMock.mockResolvedValueOnce(assetResponse);

    const event = createFetchEvent(request("/assets/index-abcd.js"));
    worker.fetch(event);

    await expect(event.response()).resolves.toBe(assetResponse);
    await vi.waitFor(() => expect(worker.cache.put).toHaveBeenCalledTimes(1));
    expect(worker.cache.put).toHaveBeenCalledWith(event.request, expect.objectContaining({ label: "asset clone" }));
  });
});

interface TestRequest {
  method: string;
  mode: string;
  url: string;
}

interface TestResponse {
  label: string;
  ok: boolean;
  clone: () => TestResponse;
}

interface FetchEvent {
  request: TestRequest;
  respondWith: ReturnType<typeof vi.fn>;
  response: () => Promise<TestResponse | undefined>;
}

interface LifecycleEvent {
  waitUntil: (promise: Promise<unknown>) => void;
}

type WorkerEvent = FetchEvent | LifecycleEvent;
type WorkerListener = (event: WorkerEvent) => void;

function loadServiceWorker() {
  const listeners = new Map<string, WorkerListener[]>();
  const cache = createMemoryCache();
  const fetchMock = vi.fn();
  const self = {
    location: { origin },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: vi.fn((type: string, listener: WorkerListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ["tablegather-v1", "tablegather-v2"]),
    delete: vi.fn(async () => true),
    match: vi.fn((value: TestRequest | string) => cache.match(value)),
  };
  const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

  vm.runInNewContext(source, { self, caches, fetch: fetchMock, URL, Error, Promise }, { filename: "public/sw.js" });

  const fetchListeners = listeners.get("fetch");
  if (!fetchListeners?.[0]) throw new Error("Service worker did not register a fetch listener.");

  return {
    cache,
    fetchMock,
    fetch: fetchListeners[0],
  };
}

function createMemoryCache() {
  const entries = new Map<string, TestResponse>();

  return {
    addAll: vi.fn(async (paths: string[]) => {
      for (const path of paths) entries.set(cacheKey(path), response(`cached ${path}`));
    }),
    match: vi.fn(async (value: TestRequest | string) => entries.get(cacheKey(value))),
    put: vi.fn(async (value: TestRequest | string, valueResponse: TestResponse) => {
      entries.set(cacheKey(value), valueResponse);
    }),
    seed: (path: string, valueResponse: TestResponse) => {
      entries.set(cacheKey(path), valueResponse);
    },
  };
}

function createFetchEvent(eventRequest: TestRequest): FetchEvent {
  let responsePromise: Promise<TestResponse | undefined> | null = null;

  return {
    request: eventRequest,
    respondWith: vi.fn((promise: Promise<TestResponse | undefined>) => {
      responsePromise = promise;
    }),
    response: () => {
      if (!responsePromise) throw new Error("The service worker did not respond to this event.");
      return responsePromise;
    },
  };
}

function request(path: string, mode = "same-origin"): TestRequest {
  return {
    method: "GET",
    mode,
    url: new URL(path, origin).href,
  };
}

function response(label: string, ok = true): TestResponse {
  return {
    label,
    ok,
    clone: () => response(`${label} clone`, ok),
  };
}

function cacheKey(value: TestRequest | string) {
  const url = typeof value === "string" ? new URL(value, origin) : new URL(value.url);
  return url.href;
}
