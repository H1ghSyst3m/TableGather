import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "./messages";
import { ROOM_PROTOCOL_VERSION } from "./protocol";
import { resolveWsUrl } from "./wsUrl";

export type RoomSocketError = "roomConnection" | "roomProtocolMismatch";

interface RoomSocketControls {
  disconnect: () => void;
}

export function useRoomSocket(onMessage: (message: ServerMessage, controls: RoomSocketControls) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<RoomSocketError | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socketRef.current === socket) socketRef.current = null;

    if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener("open", () => socket.close(), { once: true });
      setConnected(false);
      return;
    }

    socket.close();
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (
      socketRef.current?.readyState === WebSocket.CONNECTING ||
      socketRef.current?.readyState === WebSocket.OPEN
    ) {
      return socketRef.current;
    }

    const socket = new WebSocket(resolveWsUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      setError(null);
    });
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("error", () => setError("roomConnection"));
    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data as string);
      if (!message) {
        setError("roomConnection");
        return;
      }

      if ("protocolVersion" in message && message.protocolVersion !== ROOM_PROTOCOL_VERSION) {
        setError("roomProtocolMismatch");
        socket.close();
        return;
      }

      onMessageRef.current(message, { disconnect });
    });

    return socket;
  }, [disconnect]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return { connect, send, disconnect, connected, error };
}

function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && "type" in parsed ? (parsed as ServerMessage) : null;
  } catch {
    return null;
  }
}
