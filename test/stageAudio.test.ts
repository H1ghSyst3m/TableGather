import { describe, expect, it, vi } from "vitest";
import {
  loadStageAudioPreferences,
  saveStageAudioPreferences,
  StageAudioEngine,
  type StageAudioDefinition,
} from "../src/audio/stageAudio";

type TestAmbience = "day" | "night";
type TestCue = "gong" | "tick";

const storageKey = "tablegather-test-stage-audio";
const definition = {
  ambience: {
    day: { url: "day.mp3" },
    night: { url: "night.mp3", gain: 0.7 },
  },
  cues: {
    gong: { url: "gong.wav" },
    tick: { url: "tick.wav", gain: 0.82 },
  },
  defaultVolume: 0.6,
  mix: {
    ambienceGain: 0.42,
    crossfadeSeconds: 0.75,
    masterSmoothingSeconds: 0.03,
    resumeTimeoutMs: 2_000,
    sfxGain: 0.9,
  },
  storageKey,
} satisfies StageAudioDefinition<TestAmbience, TestCue>;

describe("stage audio preferences", () => {
  it("stores versioned preferences and constrains volume values", () => {
    const storage = createMemoryStorage();

    expect(loadStageAudioPreferences(storageKey, 0.6, storage)).toEqual({ muted: false, volume: 0.6 });
    saveStageAudioPreferences(storageKey, { muted: true, volume: 1.4 }, storage);
    expect(loadStageAudioPreferences(storageKey, 0.6, storage)).toEqual({ muted: true, volume: 1 });

    saveStageAudioPreferences(storageKey, { muted: false, volume: -0.4 }, storage);
    expect(loadStageAudioPreferences(storageKey, 0.6, storage)).toEqual({ muted: false, volume: 0 });
  });

  it("falls back for invalid, outdated, and unavailable storage values", () => {
    const storage = createMemoryStorage();

    storage.setItem(storageKey, JSON.stringify({ version: 2, muted: false, volume: 0.2 }));
    expect(loadStageAudioPreferences(storageKey, 0.45, storage)).toEqual({ muted: false, volume: 0.45 });
    storage.setItem(storageKey, "not-json");
    expect(loadStageAudioPreferences(storageKey, 0.45, storage)).toEqual({ muted: false, volume: 0.45 });
    expect(loadStageAudioPreferences(storageKey, 0.45, null)).toEqual({ muted: false, volume: 0.45 });
  });
});

describe("StageAudioEngine", () => {
  it("unlocks Web Audio, loads MP3 and WAV tracks, mixes playback, and closes cleanly", async () => {
    const context = new FakeAudioContext();
    const fetchAudio = vi.fn(async (url: URL | RequestInfo) => {
      const value = String(url);
      return audioResponse({ contentType: value === "gong.wav" ? "audio/x-wav" : value.endsWith(".wav") ? "audio/wav" : "audio/mpeg" });
    });
    const engine = new StageAudioEngine(definition, {
      createContext: () => context as unknown as AudioContext,
      fetchAudio: fetchAudio as unknown as typeof fetch,
    });

    const result = await engine.activate(0.6, false);
    expect(result.failed).toEqual([]);
    expect(result.loaded).toHaveLength(4);
    expect(result.loaded).toEqual(expect.arrayContaining(["day.mp3", "night.mp3", "gong.wav", "tick.wav"]));
    expect(context.decoded).toBe(4);
    expect(context.resumed).toBe(true);
    expect(context.silentBuffers).toBe(1);
    expect(context.sources[0]).toMatchObject({ started: true, stopTimes: [] });
    expect(context.activationEvents.slice(0, 2)).toEqual(["resume", "source-start"]);
    expect(context.gains[0].gain.value).toBe(0.42);
    expect(context.gains[1].gain.value).toBe(0.9);
    expect(context.gains[2].gain.value).toBe(0.6);

    engine.setAmbience("night");
    expect(context.sources[1]).toMatchObject({ loop: true, started: true });
    expect(context.gains[3].gain.value).toBe(0.7);
    engine.setAmbience("day");
    expect(context.sources).toHaveLength(3);
    expect(context.sources[1].stopTimes).toEqual([10.75]);

    engine.playCue("tick");
    engine.playCue("gong");
    expect(context.sources).toHaveLength(5);
    expect(context.sources.slice(3).every((source) => source.started && !source.loop)).toBe(true);
    expect(context.gains[5].gain.value).toBe(0.82);
    expect(context.gains[6].gain.value).toBe(1);

    await engine.dispose();
    expect(context.closed).toBe(true);
    expect(context.sources[2].stopTimes).toContain(10);
  });

  it("accepts a running state event even when resume remains pending", async () => {
    const context = new FakeAudioContext();
    context.resumePending = true;
    const engine = new StageAudioEngine(definition, {
      createContext: () => context as unknown as AudioContext,
      fetchAudio: (async () => audioResponse()) as typeof fetch,
    });

    const activation = engine.activate(0.6, false);
    context.transitionTo("running");

    await expect(activation).resolves.toMatchObject({ failed: [] });
    await engine.dispose();
  });

  it("accepts a second activation gesture while Firefox keeps the first resume pending", async () => {
    const context = new FakeAudioContext();
    context.resumePendingAttempts = 1;
    const fetchAudio = vi.fn(async () => audioResponse());
    const engine = new StageAudioEngine(definition, {
      createContext: () => context as unknown as AudioContext,
      fetchAudio: fetchAudio as unknown as typeof fetch,
    });

    const first = engine.activate(0.6, false);
    const second = engine.activate(0.6, false);

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ failed: [] }),
      expect.objectContaining({ failed: [] }),
    ]);
    expect(context.resumeCalls).toBe(2);
    expect(fetchAudio).toHaveBeenCalledTimes(4);
    await engine.dispose();
  });

  it("retries only failed tracks while retaining decoded buffers", async () => {
    const context = new FakeAudioContext();
    const failures = vi.fn();
    let dayAttempts = 0;
    const fetchAudio = vi.fn(async (url: URL | RequestInfo) => {
      const value = String(url);
      if (value === "day.mp3" && dayAttempts++ === 0) return audioResponse({ contentType: "text/html" });
      return audioResponse({ contentType: value.endsWith(".wav") ? "audio/wav" : "audio/mpeg" });
    });
    const engine = new StageAudioEngine(definition, {
      createContext: () => context as unknown as AudioContext,
      fetchAudio: fetchAudio as unknown as typeof fetch,
      onAssetFailure: failures,
    });

    const first = await engine.activate(0.6, false);
    expect(first.loaded).toHaveLength(3);
    expect(first.failed).toEqual([
      expect.objectContaining({ reason: "mime", url: "day.mp3", contentType: "text/html" }),
    ]);

    const second = await engine.activate(0.6, false);
    expect(second.failed).toEqual([]);
    expect(second.loaded).toHaveLength(4);
    expect(fetchAudio.mock.calls.filter(([url]) => String(url) === "day.mp3")).toHaveLength(2);
    expect(fetchAudio.mock.calls.filter(([url]) => String(url) !== "day.mp3")).toHaveLength(3);
    expect(context.decoded).toBe(4);
    expect(failures).toHaveBeenCalledTimes(1);

    await engine.dispose();
  });

  it("deduplicates parallel activation loads", async () => {
    const context = new FakeAudioContext();
    const fetchAudio = vi.fn(async () => audioResponse());
    const engine = new StageAudioEngine(definition, {
      createContext: () => context as unknown as AudioContext,
      fetchAudio: fetchAudio as unknown as typeof fetch,
    });

    const first = engine.activate(0.6, false);
    const second = engine.activate(0.4, false);
    const results = await Promise.all([first, second]);

    expect(fetchAudio).toHaveBeenCalledTimes(4);
    expect(results.every((result) => result.loaded.length === 4 && result.failed.length === 0)).toBe(true);
    await engine.dispose();
  });

  it("binds the browser fetch implementation to the global scope", async () => {
    const context = new FakeAudioContext();
    const fetchAudio = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(audioResponse());
    });
    vi.stubGlobal("fetch", fetchAudio);

    try {
      const engine = new StageAudioEngine(definition, {
        createContext: () => context as unknown as AudioContext,
      });
      await expect(engine.activate(0.6, false)).resolves.toMatchObject({ failed: [] });
      expect(fetchAudio).toHaveBeenCalledTimes(4);
      await engine.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports network, HTTP, MIME, and decode failures with their asset URLs", async () => {
    const context = new FakeAudioContext();
    context.decodeFailureByteLength = 13;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const engine = new StageAudioEngine(definition, {
      createContext: () => context as unknown as AudioContext,
      fetchAudio: (async (url) => {
        const value = String(url);
        if (value === "day.mp3") throw new Error("Network offline");
        if (value === "night.mp3") return audioResponse({ ok: false, status: 404, statusText: "Not Found" });
        if (value === "tick.wav") return audioResponse({ contentType: "text/html" });
        return audioResponse({ byteLength: 13, contentType: "audio/wav" });
      }) as typeof fetch,
    });

    try {
      const result = await engine.activate(0.6, false);
      expect(result.loaded).toEqual([]);
      expect(Object.fromEntries(result.failed.map((failure) => [failure.url, failure.reason]))).toEqual({
        "day.mp3": "network",
        "night.mp3": "http",
        "gong.wav": "decode",
        "tick.wav": "mime",
      });
      expect(result.failed).toEqual(expect.arrayContaining([
        expect.objectContaining({ url: "night.mp3", status: 404, message: "HTTP 404 Not Found" }),
        expect.objectContaining({ url: "tick.wav", contentType: "text/html" }),
      ]));
      expect(warning).toHaveBeenCalledTimes(4);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("day.mp3: Network offline"));
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("night.mp3: HTTP 404 Not Found"));
    } finally {
      await engine.dispose();
      warning.mockRestore();
    }
  });

  it("retains a timed-out context so a later Firefox gesture can resume it", async () => {
    const suspendedContext = new FakeAudioContext();
    suspendedContext.resumePendingAttempts = 1;
    const activationFailures = vi.fn();
    const timeoutDefinition = {
      ...definition,
      mix: { ...definition.mix, resumeTimeoutMs: 5 },
    } satisfies StageAudioDefinition<TestAmbience, TestCue>;

    const suspendedEngine = new StageAudioEngine(timeoutDefinition, {
      createContext: () => suspendedContext as unknown as AudioContext,
      fetchAudio: (async () => audioResponse()) as typeof fetch,
      onActivationFailure: activationFailures,
    });
    await expect(suspendedEngine.activate(0.6, false)).rejects.toThrow("visible user interaction");
    expect(suspendedContext.closed).toBe(false);
    expect(activationFailures).toHaveBeenCalledWith(expect.objectContaining({
      contextState: "suspended",
      retryable: true,
    }));

    await expect(suspendedEngine.activate(0.6, false)).resolves.toMatchObject({ failed: [] });
    expect(suspendedContext.resumeCalls).toBe(2);
    expect(suspendedContext.resumed).toBe(true);
    await suspendedEngine.dispose();
    expect(suspendedContext.closed).toBe(true);
  });
});

function audioResponse({
  byteLength = 8,
  contentType = "audio/mpeg",
  ok = true,
  status = ok ? 200 : 500,
  statusText = "",
}: {
  byteLength?: number;
  contentType?: string;
  ok?: boolean;
  status?: number;
  statusText?: string;
} = {}) {
  return {
    ok,
    status,
    statusText,
    headers: new Headers({ "content-type": contentType }),
    arrayBuffer: async () => new ArrayBuffer(byteLength),
  } as Response;
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

class FakeAudioParam {
  value = 1;

  cancelScheduledValues() {}
  linearRampToValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
  }
}

class FakeAudioNode {
  connect() {
    return this;
  }
  disconnect() {}
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeCompressorNode extends FakeAudioNode {
  attack = new FakeAudioParam();
  knee = new FakeAudioParam();
  ratio = new FakeAudioParam();
  release = new FakeAudioParam();
  threshold = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopTimes: number[] = [];

  constructor(private readonly onStart: () => void = () => undefined) {
    super();
  }

  start() {
    this.onStart();
    this.started = true;
  }
  stop(when = 0) {
    this.stopTimes.push(when);
  }
}

class FakeAudioContext {
  readonly activationEvents: string[] = [];
  readonly currentTime = 10;
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  readonly sampleRate = 48_000;
  readonly sources: FakeBufferSourceNode[] = [];
  private readonly stateListeners = new Set<() => void>();
  state: AudioContextState = "suspended";
  closed = false;
  decodeFailureByteLength: number | null = null;
  decoded = 0;
  resumed = false;
  resumePending = false;
  resumePendingAttempts = 0;
  resumeCalls = 0;
  silentBuffers = 0;

  addEventListener(type: string, listener: () => void) {
    if (type === "statechange") this.stateListeners.add(listener);
  }
  async close() {
    this.closed = true;
    this.transitionTo("closed");
  }
  createBuffer() {
    this.silentBuffers += 1;
    return {} as AudioBuffer;
  }
  createBufferSource() {
    const source = new FakeBufferSourceNode(() => this.activationEvents.push("source-start"));
    this.sources.push(source);
    return source;
  }
  createDynamicsCompressor() {
    return new FakeCompressorNode();
  }
  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }
  async decodeAudioData(data: ArrayBuffer) {
    if (data.byteLength === this.decodeFailureByteLength) throw new DOMException("Unable to decode audio data.");
    this.decoded += 1;
    return {} as AudioBuffer;
  }
  removeEventListener(type: string, listener: () => void) {
    if (type === "statechange") this.stateListeners.delete(listener);
  }
  async resume() {
    this.resumeCalls += 1;
    this.activationEvents.push("resume");
    if (this.resumePending || this.resumeCalls <= this.resumePendingAttempts) await new Promise(() => undefined);
    this.resumed = true;
    this.transitionTo("running");
  }
  transitionTo(state: AudioContextState) {
    this.state = state;
    for (const listener of this.stateListeners) listener();
  }
}
