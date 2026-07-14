import { describe, expect, it, vi } from "vitest";
import { StageDisplayController } from "../src/stage/stageDisplay";

describe("StageDisplayController", () => {
  it("enters, exits, and follows external fullscreen changes", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    const controller = createController(document, wakeLock);
    const unsubscribe = controller.subscribe(() => undefined);

    await controller.toggleFullscreen();
    expect(document.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().fullscreen).toMatchObject({ active: true, error: null, pending: false });

    document.exitFullscreenExternally();
    expect(controller.getSnapshot().fullscreen.active).toBe(false);

    await controller.toggleFullscreen();
    await controller.toggleFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().fullscreen.active).toBe(false);

    unsubscribe();
    await controller.dispose();
  });

  it("keeps rejected fullscreen requests retryable", async () => {
    const document = new FakeDocument();
    document.fullscreenRequestRejected = true;
    const controller = createController(document, new FakeWakeLock());

    await controller.toggleFullscreen();
    expect(controller.getSnapshot().fullscreen).toMatchObject({ active: false, error: "requestFailed", pending: false });

    document.fullscreenRequestRejected = false;
    await controller.toggleFullscreen();
    expect(controller.getSnapshot().fullscreen).toMatchObject({ active: true, error: null, pending: false });

    await controller.dispose();
  });

  it("marks unavailable browser APIs as unsupported without invoking them", async () => {
    const document = new FakeDocument();
    document.fullscreenEnabled = false;
    const controller = new StageDisplayController({
      document: document as unknown as Document,
      navigator: {} as Navigator,
    });

    expect(controller.getSnapshot()).toEqual({
      fullscreen: { active: false, error: "unsupported", pending: false, supported: false },
      wakeLock: { active: false, error: "unsupported", pending: false, requested: false, supported: false },
    });

    await controller.toggleFullscreen();
    await controller.toggleWakeLock();
    expect(document.requestFullscreen).not.toHaveBeenCalled();

    await controller.dispose();
  });

  it("acquires and manually releases a screen wake lock", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    const controller = createController(document, wakeLock);

    await controller.toggleWakeLock();
    expect(wakeLock.request).toHaveBeenCalledWith("screen");
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: true, error: null, requested: true });

    const sentinel = wakeLock.sentinels[0];
    await controller.toggleWakeLock();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: false, error: null, requested: false });

    await controller.dispose();
  });

  it("reacquires a requested wake lock when a hidden document becomes visible", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    const controller = createController(document, wakeLock);
    const unsubscribe = controller.subscribe(() => undefined);

    await controller.toggleWakeLock();
    document.setVisibility("hidden");
    wakeLock.sentinels[0].releaseExternally();
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: false, error: null, requested: true });

    document.setVisibility("visible");
    await flushPromises();
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: true, error: null, requested: true });

    unsubscribe();
    await controller.dispose();
  });

  it("reports visible wake lock releases and allows a retry", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    const controller = createController(document, wakeLock);

    await controller.toggleWakeLock();
    wakeLock.sentinels[0].releaseExternally();
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: false, error: "released", requested: false });

    await controller.toggleWakeLock();
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: true, error: null, requested: true });

    await controller.dispose();
  });

  it("reports rejected wake lock requests and allows a retry", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    wakeLock.rejectNextRequest = true;
    const controller = createController(document, wakeLock);

    await controller.toggleWakeLock();
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: false, error: "requestFailed", pending: false, requested: false });

    await controller.toggleWakeLock();
    expect(controller.getSnapshot().wakeLock).toMatchObject({ active: true, error: null, requested: true });

    await controller.dispose();
  });

  it("releases owned browser state and ignores later events during cleanup", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    const controller = createController(document, wakeLock);
    const listener = vi.fn();
    controller.subscribe(listener);

    await controller.toggleFullscreen();
    await controller.toggleWakeLock();
    const callsBeforeDispose = listener.mock.calls.length;
    const sentinel = wakeLock.sentinels[0];

    await controller.dispose();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(sentinel.release).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("fullscreenchange"));
    document.setVisibility("visible");
    expect(listener).toHaveBeenCalledTimes(callsBeforeDispose);
  });

  it("keeps the controller alive when React replaces a subscription in the same task", async () => {
    const document = new FakeDocument();
    const controller = createController(document, new FakeWakeLock());
    const unsubscribe = controller.subscribe(() => undefined);

    unsubscribe();
    controller.subscribe(() => undefined);
    await flushPromises();
    await controller.toggleFullscreen();

    expect(controller.getSnapshot().fullscreen.active).toBe(true);
    await controller.dispose();
  });

  it("cleans up owned browser state after the last subscriber leaves", async () => {
    const document = new FakeDocument();
    const wakeLock = new FakeWakeLock();
    const controller = createController(document, wakeLock);
    const unsubscribe = controller.subscribe(() => undefined);

    await controller.toggleFullscreen();
    await controller.toggleWakeLock();
    const sentinel = wakeLock.sentinels[0];
    unsubscribe();
    await flushPromises();

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });
});

function createController(document: FakeDocument, wakeLock: FakeWakeLock) {
  return new StageDisplayController({
    document: document as unknown as Document,
    navigator: { wakeLock } as unknown as Navigator,
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeDocument extends EventTarget {
  fullscreenEnabled = true;
  fullscreenElement: Element | null = null;
  fullscreenRequestRejected = false;
  visibilityState: DocumentVisibilityState = "visible";

  requestFullscreen = vi.fn(async () => {
    if (this.fullscreenRequestRejected) throw new TypeError("Fullscreen denied");
    this.fullscreenElement = this.documentElement;
    this.dispatchEvent(new Event("fullscreenchange"));
  });

  documentElement = {
    requestFullscreen: this.requestFullscreen,
  } as unknown as Element;

  exitFullscreen = vi.fn(async () => {
    this.fullscreenElement = null;
    this.dispatchEvent(new Event("fullscreenchange"));
  });

  exitFullscreenExternally() {
    this.fullscreenElement = null;
    this.dispatchEvent(new Event("fullscreenchange"));
  }

  setVisibility(visibilityState: DocumentVisibilityState) {
    this.visibilityState = visibilityState;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

class FakeWakeLock {
  readonly sentinels: FakeWakeLockSentinel[] = [];
  rejectNextRequest = false;

  request = vi.fn(async () => {
    if (this.rejectNextRequest) {
      this.rejectNextRequest = false;
      throw new DOMException("Wake lock denied", "NotAllowedError");
    }

    const sentinel = new FakeWakeLockSentinel();
    this.sentinels.push(sentinel);
    return sentinel as WakeLockSentinel;
  });
}

class FakeWakeLockSentinel extends EventTarget {
  onrelease: ((this: WakeLockSentinel, event: Event) => unknown) | null = null;
  released = false;
  readonly type: WakeLockType = "screen";

  release = vi.fn(async () => {
    this.releaseExternally();
  });

  releaseExternally() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}
