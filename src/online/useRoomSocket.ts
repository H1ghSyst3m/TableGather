import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "./messages";
import { ROOM_PROTOCOL_VERSION } from "./protocol";
import { resolveWsUrl } from "./wsUrl";

export type RoomSocketError = "roomConnection" | "roomProtocolMismatch";

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;

export interface RoomSocketControls {
  disconnect: () => void;
  send: (message: ClientMessage) => boolean;
}

interface RoomSocketOptions {
  autoReconnect?: boolean;
  onOpen?: (controls: RoomSocketControls) => void;
}

export function useRoomSocket(
  onMessage: (message: ServerMessage, controls: RoomSocketControls) => void,
  options: RoomSocketOptions = {},
) {
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const optionsRef = useRef<RoomSocketOptions>(options);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const connectRef = useRef<() => WebSocket | null>(() => null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<RoomSocketError | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current === null) return;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    const socket = socketRef.current;
    if (!socket) {
      setConnected(false);
      return;
    }
    if (socketRef.current === socket) socketRef.current = null;

    socket.close();
    setConnected(false);
  }, [clearReconnectTimer]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!optionsRef.current.autoReconnect || manualDisconnectRef.current || reconnectTimerRef.current !== null) return;

    const delay = roomSocketReconnectDelayMs(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    manualDisconnectRef.current = false;
    clearReconnectTimer();
    if (
      socketRef.current?.readyState === WebSocket.CONNECTING ||
      socketRef.current?.readyState === WebSocket.OPEN
    ) {
      return socketRef.current;
    }

    const socket = new WebSocket(resolveWsUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return;
      reconnectAttemptRef.current = 0;
      setConnected(true);
      setError(null);
      optionsRef.current.onOpen?.({ disconnect, send });
    });
    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return;
      if (socketRef.current === socket) socketRef.current = null;
      setConnected(false);
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return;
      setError("roomConnection");
    });
    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return;
      const message = parseServerMessage(event.data as string);
      if (!message) {
        setError("roomConnection");
        return;
      }

      if ("protocolVersion" in message && message.protocolVersion !== ROOM_PROTOCOL_VERSION) {
        setError("roomProtocolMismatch");
        manualDisconnectRef.current = true;
        clearReconnectTimer();
        socket.close();
        return;
      }

      onMessageRef.current(message, { disconnect, send });
    });

    return socket;
  }, [clearReconnectTimer, disconnect, scheduleReconnect, send]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => disconnect, [disconnect]);

  return { connect, send, disconnect, connected, error };
}

export function roomSocketReconnectDelayMs(attempt: number) {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_DELAY_MS);
}

function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && "type" in parsed ? (parsed as ServerMessage) : null;
  } catch {
    return null;
  }
}
