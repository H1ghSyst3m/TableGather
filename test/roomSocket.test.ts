import { afterEach, describe, expect, it, vi } from "vitest";
import { roomSocketReconnectDelayMs } from "../src/online/useRoomSocket";

describe("room socket reconnect backoff", () => {
  it("backs off reconnect attempts and caps the delay", () => {
    expect(roomSocketReconnectDelayMs(-1)).toBe(500);
    expect(roomSocketReconnectDelayMs(0)).toBe(500);
    expect(roomSocketReconnectDelayMs(1)).toBe(1_000);
    expect(roomSocketReconnectDelayMs(2)).toBe(2_000);
    expect(roomSocketReconnectDelayMs(3)).toBe(4_000);
    expect(roomSocketReconnectDelayMs(4)).toBe(8_000);
    expect(roomSocketReconnectDelayMs(20)).toBe(8_000);
  });
});

describe("room socket reconnect lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("react");
    vi.resetModules();
    MockWebSocket.instances = [];
  });

  it("closes a manually disconnected pending socket without opening or reconnecting", async () => {
    const { controls, onOpen, sockets } = await createRoomSocketHarness();
    const socket = controls.connect() as unknown as MockWebSocket;

    controls.disconnect();
    socket.open();

    expect(sockets).toHaveLength(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reconnect after a protocol mismatch closes the socket", async () => {
    const { controls, onOpen, sockets } = await createRoomSocketHarness();
    const socket = controls.connect() as unknown as MockWebSocket;

    socket.open();
    socket.emitMessage({ type: "connected", protocolVersion: -1 });
    socket.emitClose();

    expect(sockets).toHaveLength(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps only one reconnect timer for repeated close events", async () => {
    const { controls, sockets } = await createRoomSocketHarness();
    const socket = controls.connect() as unknown as MockWebSocket;

    socket.open();
    socket.emitClose();
    socket.emitClose();

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(500);

    expect(sockets).toHaveLength(2);
  });

  it("runs onOpen again after a successful reconnect", async () => {
    const { controls, onOpen, sockets } = await createRoomSocketHarness();
    const socket = controls.connect() as unknown as MockWebSocket;

    socket.open();
    socket.emitClose();
    vi.advanceTimersByTime(500);
    sockets[1].open();

    expect(sockets).toHaveLength(2);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

async function createRoomSocketHarness() {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_WS_URL", "ws://example.test/ws");
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.doMock("react", () => createReactHookMock());
  MockWebSocket.instances = [];

  const roomSocketModule = await import("../src/online/useRoomSocket");
  const roomSocketHook = roomSocketModule.useRoomSocket;
  const onMessage = vi.fn();
  const onOpen = vi.fn();
  const controls = roomSocketHook(onMessage, { autoReconnect: true, onOpen });

  return { controls, onMessage, onOpen, sockets: MockWebSocket.instances };
}

function createReactHookMock() {
  return {
    useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback) => callback,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useRef: <Value>(initial: Value) => ({ current: initial }),
    useState: <Value>(initial: Value | (() => Value)) => {
      let value = typeof initial === "function" ? (initial as () => Value)() : initial;
      const setValue = vi.fn((next: Value | ((current: Value) => Value)) => {
        value = typeof next === "function" ? (next as (current: Value) => Value)(value) : next;
      });

      return [value, setValue] as const;
    },
  };
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly sent: string[] = [];
  readyState = MockWebSocket.CONNECTING;
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  send = vi.fn((data: string) => {
    this.sent.push(data);
  });

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  emitMessage(message: unknown) {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}
