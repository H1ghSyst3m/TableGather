/// <reference lib="dom" />

export type StageDisplayError = "released" | "requestFailed" | "unsupported";

export interface StageDisplayFeatureState {
  active: boolean;
  error: StageDisplayError | null;
  pending: boolean;
  supported: boolean;
}

export interface StageWakeLockState extends StageDisplayFeatureState {
  requested: boolean;
}

export interface StageDisplayState {
  fullscreen: StageDisplayFeatureState;
  wakeLock: StageWakeLockState;
}

export interface StageDisplayEnvironment {
  document: Document;
  navigator: Navigator;
  target?: Element;
}

type StageDisplayListener = () => void;

export class StageDisplayController {
  private readonly document: Document;
  private readonly navigator: Navigator;
  private readonly target: Element;
  private readonly listeners = new Set<StageDisplayListener>();
  private state: StageDisplayState;
  private wakeLock: WakeLockSentinel | null = null;
  private fullscreenOperation = 0;
  private wakeLockOperation = 0;
  private ownsFullscreen = false;
  private listening = false;
  private disposed = false;
  private cleanupGeneration = 0;

  constructor({ document, navigator, target = document.documentElement }: StageDisplayEnvironment) {
    this.document = document;
    this.navigator = navigator;
    this.target = target;

    const fullscreenSupported = Boolean(document.fullscreenEnabled
      && typeof target.requestFullscreen === "function"
      && typeof document.exitFullscreen === "function");
    const wakeLockSupported = "wakeLock" in navigator
      && typeof navigator.wakeLock?.request === "function";

    this.state = {
      fullscreen: featureState(fullscreenSupported, document.fullscreenElement === target),
      wakeLock: {
        ...featureState(wakeLockSupported),
        requested: false,
      },
    };
  }

  getSnapshot = () => this.state;

  subscribe = (listener: StageDisplayListener) => {
    if (this.disposed) return () => undefined;

    this.cleanupGeneration += 1;
    this.listeners.add(listener);
    this.startListening();

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size !== 0) return;

      this.stopListening();
      const cleanupGeneration = ++this.cleanupGeneration;
      queueMicrotask(() => {
        if (cleanupGeneration === this.cleanupGeneration && this.listeners.size === 0) {
          void this.dispose();
        }
      });
    };
  };

  async toggleFullscreen() {
    const { fullscreen } = this.state;
    if (this.disposed || !fullscreen.supported || fullscreen.pending) return;

    const operation = ++this.fullscreenOperation;
    const entering = this.document.fullscreenElement !== this.target;
    this.updateFullscreen({ error: null, pending: true });

    try {
      if (entering) {
        await this.target.requestFullscreen();
      } else {
        await this.document.exitFullscreen();
      }

      if (this.disposed || operation !== this.fullscreenOperation) {
        if (entering && this.document.fullscreenElement === this.target) {
          await this.document.exitFullscreen().catch(() => undefined);
        }
        return;
      }

      this.ownsFullscreen = entering && this.document.fullscreenElement === this.target;
      this.updateFullscreen({
        active: this.document.fullscreenElement === this.target,
        error: null,
      });
    } catch {
      if (!this.disposed && operation === this.fullscreenOperation) {
        this.ownsFullscreen = false;
        this.updateFullscreen({ error: "requestFailed" });
      }
    } finally {
      if (!this.disposed && operation === this.fullscreenOperation) {
        this.updateFullscreen({ pending: false });
      }
    }
  }

  async toggleWakeLock() {
    const { wakeLock } = this.state;
    if (this.disposed || !wakeLock.supported || wakeLock.pending) return;

    if (wakeLock.requested || wakeLock.active) {
      await this.releaseWakeLock();
      return;
    }

    this.updateWakeLock({ error: null, requested: true });
    await this.acquireWakeLock();
  }

  async dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.cleanupGeneration += 1;
    this.fullscreenOperation += 1;
    this.wakeLockOperation += 1;
    this.stopListening();
    this.listeners.clear();

    const wakeLock = this.wakeLock;
    this.wakeLock = null;
    wakeLock?.removeEventListener("release", this.handleWakeLockRelease);
    if (wakeLock && !wakeLock.released) await wakeLock.release().catch(() => undefined);

    if (this.ownsFullscreen && this.document.fullscreenElement === this.target) {
      await this.document.exitFullscreen().catch(() => undefined);
    }
  }

  private startListening() {
    if (this.listening) return;
    this.listening = true;
    this.document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.document.addEventListener("fullscreenerror", this.handleFullscreenError);
    this.document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private stopListening() {
    if (!this.listening) return;
    this.listening = false;
    this.document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    this.document.removeEventListener("fullscreenerror", this.handleFullscreenError);
    this.document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private handleFullscreenChange = () => {
    const active = this.document.fullscreenElement === this.target;
    if (!active) this.ownsFullscreen = false;
    this.updateFullscreen({ active, error: null });
  };

  private handleFullscreenError = () => {
    this.ownsFullscreen = false;
    this.updateFullscreen({ error: "requestFailed", pending: false });
  };

  private handleVisibilityChange = () => {
    const { wakeLock } = this.state;
    if (this.document.visibilityState === "visible" && wakeLock.requested && !wakeLock.active && !wakeLock.pending) {
      void this.acquireWakeLock();
    }
  };

  private handleWakeLockRelease = () => {
    const wakeLock = this.wakeLock;
    wakeLock?.removeEventListener("release", this.handleWakeLockRelease);
    this.wakeLock = null;

    if (this.disposed) return;

    if (this.document.visibilityState !== "visible" && this.state.wakeLock.requested) {
      this.updateWakeLock({ active: false, error: null, pending: false });
      return;
    }

    this.updateWakeLock({
      active: false,
      error: "released",
      pending: false,
      requested: false,
    });
  };

  private async acquireWakeLock() {
    if (this.disposed || !this.state.wakeLock.requested || this.state.wakeLock.pending) return;
    if (this.document.visibilityState !== "visible") return;

    const operation = ++this.wakeLockOperation;
    this.updateWakeLock({ error: null, pending: true });

    try {
      const wakeLock = await this.navigator.wakeLock.request("screen");
      if (this.disposed || operation !== this.wakeLockOperation || !this.state.wakeLock.requested) {
        await wakeLock.release().catch(() => undefined);
        return;
      }

      this.wakeLock = wakeLock;
      wakeLock.addEventListener("release", this.handleWakeLockRelease);
      this.updateWakeLock({ active: true, error: null, pending: false });
    } catch {
      if (!this.disposed && operation === this.wakeLockOperation) {
        this.updateWakeLock({
          active: false,
          error: "requestFailed",
          pending: false,
          requested: false,
        });
      }
    }
  }

  private async releaseWakeLock() {
    this.wakeLockOperation += 1;
    const wakeLock = this.wakeLock;
    this.wakeLock = null;
    wakeLock?.removeEventListener("release", this.handleWakeLockRelease);
    this.updateWakeLock({ active: false, error: null, pending: false, requested: false });

    if (wakeLock && !wakeLock.released) await wakeLock.release().catch(() => undefined);
  }

  private updateFullscreen(update: Partial<StageDisplayFeatureState>) {
    this.setState({
      ...this.state,
      fullscreen: { ...this.state.fullscreen, ...update },
    });
  }

  private updateWakeLock(update: Partial<StageWakeLockState>) {
    this.setState({
      ...this.state,
      wakeLock: { ...this.state.wakeLock, ...update },
    });
  }

  private setState(state: StageDisplayState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function featureState(supported: boolean, active = false): StageDisplayFeatureState {
  return {
    active,
    error: supported ? null : "unsupported",
    pending: false,
    supported,
  };
}
