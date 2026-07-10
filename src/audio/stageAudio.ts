/// <reference lib="dom" />

export type StageAudioError = "activation" | "assets" | null;

export interface StageAudioPreferences {
  muted: boolean;
  volume: number;
}

export interface StageAudioControlState extends StageAudioPreferences {
  enabled: boolean;
  error: StageAudioError;
  loading: boolean;
  setVolume: (volume: number) => void;
  toggle: () => void;
}

export interface StageAudioTrack {
  url: string;
  gain?: number;
}

export interface StageAudioMix {
  ambienceGain?: number;
  crossfadeSeconds?: number;
  masterSmoothingSeconds?: number;
  resumeTimeoutMs?: number;
  sfxGain?: number;
}

export interface StageAudioDefinition<AmbienceId extends string, CueId extends string> {
  ambience: Record<AmbienceId, StageAudioTrack>;
  cues: Record<CueId, StageAudioTrack>;
  defaultVolume?: number;
  mix?: StageAudioMix;
  storageKey: string;
}

export type StageAudioAssetFailureReason = "decode" | "http" | "mime" | "network";

export interface StageAudioAssetFailure {
  contentType?: string | null;
  message: string;
  reason: StageAudioAssetFailureReason;
  status?: number;
  url: string;
}

export interface StageAudioActivationFailure {
  contextState: AudioContextState;
  message: string;
  retryable: boolean;
  visibilityState: DocumentVisibilityState | "unavailable";
}

export interface StageAudioLoadResult {
  failed: StageAudioAssetFailure[];
  loaded: string[];
}

export interface StageAudioEngineOptions {
  createContext?: () => AudioContext;
  fetchAudio?: typeof fetch;
  onActivationFailure?: (failure: StageAudioActivationFailure) => void;
  onAssetFailure?: (failure: StageAudioAssetFailure) => void;
}

interface ActiveAmbience<AmbienceId extends string> {
  gain: GainNode;
  id: AmbienceId;
  source: AudioBufferSourceNode;
}

const DEFAULT_STAGE_AUDIO_VOLUME = 0.6;
const DEFAULT_AMBIENCE_GAIN = 0.42;
const DEFAULT_SFX_GAIN = 0.9;
const DEFAULT_CROSSFADE_SECONDS = 0.75;
const DEFAULT_MASTER_SMOOTHING_SECONDS = 0.03;
const DEFAULT_RESUME_TIMEOUT_MS = 5_000;
const STAGE_AUDIO_STORAGE_VERSION = 1;

export function loadStageAudioPreferences(
  storageKey: string,
  defaultVolume = DEFAULT_STAGE_AUDIO_VOLUME,
  storage: Storage | null = browserStorage(),
): StageAudioPreferences {
  const fallback = defaultStageAudioPreferences(defaultVolume);
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { version?: unknown; muted?: unknown; volume?: unknown };
    if (parsed.version !== STAGE_AUDIO_STORAGE_VERSION || typeof parsed.muted !== "boolean" || typeof parsed.volume !== "number") {
      return fallback;
    }
    return { muted: parsed.muted, volume: normalizeStageAudioVolume(parsed.volume, fallback.volume) };
  } catch {
    return fallback;
  }
}

export function saveStageAudioPreferences(
  storageKey: string,
  preferences: StageAudioPreferences,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return;

  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        version: STAGE_AUDIO_STORAGE_VERSION,
        muted: preferences.muted,
        volume: normalizeStageAudioVolume(preferences.volume),
      }),
    );
  } catch {
    // Audio remains usable when browser storage is unavailable.
  }
}

export function normalizeStageAudioVolume(volume: number, fallback = DEFAULT_STAGE_AUDIO_VOLUME) {
  if (!Number.isFinite(volume)) return Math.min(1, Math.max(0, fallback));
  return Math.min(1, Math.max(0, volume));
}

export class StageAudioEngine<AmbienceId extends string, CueId extends string> {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly createContext: () => AudioContext;
  private readonly fetchAudio: typeof fetch;
  private readonly onActivationFailure: (failure: StageAudioActivationFailure) => void;
  private readonly onAssetFailure: (failure: StageAudioAssetFailure) => void;
  private readonly oneShots = new Set<AudioBufferSourceNode>();
  private activeAmbience: ActiveAmbience<AmbienceId> | null = null;
  private ambienceBus: GainNode | null = null;
  private context: AudioContext | null = null;
  private desiredAmbience: AmbienceId | null = null;
  private disposed = false;
  private loadPromise: Promise<StageAudioLoadResult> | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private abortController: AbortController | null = null;

  constructor(
    private readonly definition: StageAudioDefinition<AmbienceId, CueId>,
    options: StageAudioEngineOptions = {},
  ) {
    this.createContext = options.createContext ?? (() => new AudioContext());
    this.fetchAudio = options.fetchAudio ?? globalThis.fetch.bind(globalThis);
    this.onActivationFailure = options.onActivationFailure ?? warnStageAudioActivationFailure;
    this.onAssetFailure = options.onAssetFailure ?? warnStageAudioAssetFailure;
  }

  async activate(volume: number, muted: boolean): Promise<StageAudioLoadResult> {
    const context = this.ensureContext();
    this.setVolume(volume, muted);
    if (context.state !== "running") {
      try {
        await resumeAudioContext(context, this.definition.mix?.resumeTimeoutMs ?? DEFAULT_RESUME_TIMEOUT_MS);
      } catch (error) {
        this.onActivationFailure({
          contextState: context.state,
          message: errorMessage(error),
          retryable: isRetryableStageAudioActivationError(error),
          visibilityState: documentVisibilityState(),
        });
        throw error;
      }
    }
    const result = await this.loadAssets();
    if (!this.disposed) this.syncAmbience();
    return result;
  }

  setAmbience(ambience: AmbienceId | null) {
    this.desiredAmbience = ambience;
    this.syncAmbience();
  }

  setVolume(volume: number, muted: boolean) {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    const target = muted ? 0 : normalizeStageAudioVolume(volume, this.definition.defaultVolume);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(
      target,
      now,
      this.definition.mix?.masterSmoothingSeconds ?? DEFAULT_MASTER_SMOOTHING_SECONDS,
    );
  }

  playCue(cue: CueId) {
    if (!this.context || !this.sfxBus || this.context.state !== "running") return;
    const track = this.definition.cues[cue];
    const buffer = this.buffers.get(track.url);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = track.gain ?? 1;
    source.connect(gain);
    gain.connect(this.sfxBus);
    this.oneShots.add(source);
    source.onended = () => {
      this.oneShots.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController?.abort();
    this.stopAmbience(0);
    for (const source of this.oneShots) {
      try {
        source.stop();
      } catch {
        // The one-shot may already have completed.
      }
      source.disconnect();
    }
    this.oneShots.clear();
    this.ambienceBus?.disconnect();
    this.sfxBus?.disconnect();
    this.masterGain?.disconnect();
    if (this.context && this.context.state !== "closed") await this.context.close();
  }

  private ensureContext() {
    if (this.disposed) throw new Error("Stage audio engine has been disposed.");
    if (this.context) return this.context;

    const context = this.createContext();
    const ambienceBus = context.createGain();
    const sfxBus = context.createGain();
    const masterGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    ambienceBus.gain.value = this.definition.mix?.ambienceGain ?? DEFAULT_AMBIENCE_GAIN;
    sfxBus.gain.value = this.definition.mix?.sfxGain ?? DEFAULT_SFX_GAIN;
    masterGain.gain.value = 0;
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    ambienceBus.connect(masterGain);
    sfxBus.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(context.destination);
    this.context = context;
    this.ambienceBus = ambienceBus;
    this.sfxBus = sfxBus;
    this.masterGain = masterGain;
    return context;
  }

  private loadAssets() {
    if (this.loadPromise) return this.loadPromise;
    const urls = this.trackUrls().filter((url) => !this.buffers.has(url));
    if (urls.length === 0) return Promise.resolve({ loaded: [...this.buffers.keys()], failed: [] });

    const abortController = new AbortController();
    this.abortController = abortController;
    const loadPromise = Promise.allSettled(
      urls.map((url) => this.loadAsset(url, abortController.signal)),
    )
      .then((results) => {
        const failed = results.flatMap((result, index) => {
          if (result.status === "fulfilled") return [];
          const failure = stageAudioAssetFailure(urls[index], result.reason);
          if (!this.disposed) this.onAssetFailure(failure);
          return [failure];
        });
        return { loaded: [...this.buffers.keys()], failed };
      })
      .finally(() => {
        if (this.loadPromise === loadPromise) this.loadPromise = null;
        if (this.abortController === abortController) this.abortController = null;
      });
    this.loadPromise = loadPromise;
    return loadPromise;
  }

  private async loadAsset(url: string, signal: AbortSignal) {
    let response: Response;
    try {
      response = await this.fetchAudio(url, { signal });
    } catch (error) {
      throw new StageAudioAssetLoadError({
        message: errorMessage(error),
        reason: "network",
        url,
      });
    }

    if (!response.ok) {
      throw new StageAudioAssetLoadError({
        message: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        reason: "http",
        status: response.status,
        url,
      });
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("audio/")) {
      throw new StageAudioAssetLoadError({
        contentType,
        message: `Expected audio/* but received ${contentType ?? "no Content-Type"}.`,
        reason: "mime",
        url,
      });
    }

    const context = this.context;
    if (!context) throw new Error("Stage audio context is unavailable.");
    try {
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!this.disposed) this.buffers.set(url, buffer);
    } catch (error) {
      throw new StageAudioAssetLoadError({
        contentType,
        message: errorMessage(error),
        reason: "decode",
        url,
      });
    }
  }

  private trackUrls() {
    return [
      ...new Set([
        ...Object.values<StageAudioTrack>(this.definition.ambience).map((track) => track.url),
        ...Object.values<StageAudioTrack>(this.definition.cues).map((track) => track.url),
      ]),
    ];
  }

  private syncAmbience() {
    if (!this.context || !this.ambienceBus || this.context.state !== "running") return;
    if (this.activeAmbience?.id === this.desiredAmbience) return;

    const nextId = this.desiredAmbience;
    const previous = this.activeAmbience;
    this.activeAmbience = null;
    const crossfadeSeconds = this.definition.mix?.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS;
    if (previous) this.fadeOut(previous, crossfadeSeconds);
    if (!nextId) return;

    const track = this.definition.ambience[nextId];
    const buffer = this.buffers.get(track.url);
    if (!buffer) return;

    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(track.gain ?? 1, now + crossfadeSeconds);
    source.connect(gain);
    gain.connect(this.ambienceBus);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    this.activeAmbience = { gain, id: nextId, source };
  }

  private stopAmbience(durationSeconds: number) {
    const active = this.activeAmbience;
    this.activeAmbience = null;
    if (active) this.fadeOut(active, durationSeconds);
  }

  private fadeOut(active: ActiveAmbience<AmbienceId>, durationSeconds: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueAtTime(active.gain.gain.value, now);
    active.gain.gain.linearRampToValueAtTime(0, now + durationSeconds);
    try {
      active.source.stop(now + durationSeconds);
    } catch {
      active.source.disconnect();
      active.gain.disconnect();
    }
  }
}

function defaultStageAudioPreferences(defaultVolume: number): StageAudioPreferences {
  return { muted: false, volume: normalizeStageAudioVolume(defaultVolume) };
}

function browserStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

async function resumeAudioContext(context: AudioContext, timeoutMs: number) {
  if (context.state === "running") return;

  const unlockSource = context.createBufferSource();
  unlockSource.buffer = context.createBuffer(1, 1, context.sampleRate);
  unlockSource.connect(context.destination);

  let resolveRunning: (() => void) | undefined;
  const running = new Promise<void>((resolve) => {
    resolveRunning = resolve;
  });
  const handleStateChange = () => {
    if (context.state === "running") resolveRunning?.();
  };
  context.addEventListener("statechange", handleStateChange);

  try {
    const resume = context.resume();
    try {
      unlockSource.start(0);
    } catch {
      // The direct resume still has a chance to unlock contexts that reject the silent source.
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        running,
        resume.then(() => (context.state === "running" ? undefined : running)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new StageAudioActivationTimeoutError()), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  } finally {
    context.removeEventListener("statechange", handleStateChange);
    unlockSource.disconnect();
  }

  if (!isAudioContextRunning(context)) throw new Error("Stage audio context did not start.");
}

function isAudioContextRunning(context: AudioContext) {
  return context.state === "running";
}

export function isRetryableStageAudioActivationError(error: unknown) {
  return error instanceof StageAudioActivationTimeoutError;
}

class StageAudioActivationTimeoutError extends Error {
  constructor() {
    super("Stage audio requires another visible user interaction.");
    this.name = "StageAudioActivationTimeoutError";
  }
}

class StageAudioAssetLoadError extends Error {
  constructor(readonly failure: StageAudioAssetFailure) {
    super(failure.message);
    this.name = "StageAudioAssetLoadError";
  }
}

function stageAudioAssetFailure(url: string, error: unknown): StageAudioAssetFailure {
  if (error instanceof StageAudioAssetLoadError) return error.failure;
  return { message: errorMessage(error), reason: "network", url };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function documentVisibilityState(): DocumentVisibilityState | "unavailable" {
  return typeof document === "undefined" ? "unavailable" : document.visibilityState;
}

function warnStageAudioActivationFailure(failure: StageAudioActivationFailure) {
  console.warn(
    `[StageAudio] activation failure (context: ${failure.contextState}, visibility: ${failure.visibilityState}, retryable: ${failure.retryable}): ${failure.message}`,
  );
}

function warnStageAudioAssetFailure(failure: StageAudioAssetFailure) {
  console.warn(`[StageAudio] ${failure.reason} failure for ${failure.url}: ${failure.message}`);
}
