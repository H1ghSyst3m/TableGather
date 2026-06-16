import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { parseClientMessage, type ServerMessage } from "../src/online/messages";
import { ROOM_PROTOCOL_FEATURES, ROOM_PROTOCOL_VERSION, type RoomServerInfo } from "../src/online/protocol";
import { RoomManager } from "./roomManager";

const roomServerInfo = {
  protocolVersion: ROOM_PROTOCOL_VERSION,
  features: ROOM_PROTOCOL_FEATURES,
} satisfies RoomServerInfo;

const ROOM_EXPIRY_SWEEP_INTERVAL_MS = 60_000;

interface RoomServerOptions {
  adminToken?: string | null;
  serveStatic?: boolean | null;
  staticDir?: string;
}

export function createRoomServer(manager = new RoomManager(), options: RoomServerOptions = {}) {
  const clients = new Map<string, WebSocket>();
  const clientSessions = new Map<string, { roomCode: string; token: string; role: "host" | "player" | "stage" }>();
  const expirySweep = setInterval(closeExpiredRooms, ROOM_EXPIRY_SWEEP_INTERVAL_MS);
  const adminToken = readAdminToken(options.adminToken);
  const adminAllowedOrigins = readAdminAllowedOrigins();
  const serveStatic = readServeStatic(options.serveStatic);
  const staticDir = resolve(options.staticDir ?? "dist");

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (requestUrl.pathname === "/health") {
      closeExpiredRooms();
      response.writeHead(200, jsonResponseHeaders());
      response.end(JSON.stringify({ ok: true, rooms: manager.listRooms().length, ...roomServerInfo }));
      return;
    }

    if (requestUrl.pathname === "/admin/rooms") {
      handleAdminRoomsRequest(request, response, adminToken);
      return;
    }

    if (serveStatic && serveStaticRequest(request, response, staticDir)) return;

    response.writeHead(404, plainTextResponseHeaders());
    response.end("Not found");
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  server.on("close", () => clearInterval(expirySweep));
  wss.on("close", () => clearInterval(expirySweep));

  wss.on("connection", (socket) => {
    const clientId = createClientId();
    clients.set(clientId, socket);

    socket.on("message", (data) => {
      closeExpiredRooms();
      const parsed = safeJson(data.toString());
      const message = parseClientMessage(parsed);

      if (!message) {
        send(socket, { type: "error", message: "Invalid message." });
        return;
      }

      try {
        if (message.type === "createRoom") {
          if (!message.payload?.gameId) throw new Error("Game id is required.");
          const { room, clientToken } = manager.createRoom(clientId, message.payload.gameId);
          clientSessions.set(clientId, { roomCode: room.code, token: clientToken, role: "host" });
          send(socket, {
            type: "connected",
            requestId: message.requestId,
            role: "host",
            roomCode: room.code,
            clientToken,
            ...roomServerInfo,
          });
          broadcastRoom(room.code);
          return;
        }

        if (message.type === "inspectRoom") {
          send(socket, {
            type: "roomStatus",
            requestId: message.requestId,
            ...manager.inspectRoom(message.roomCode),
            ...roomServerInfo,
          });
          return;
        }

        if (message.type === "inspectRoomSession") {
          send(socket, {
            type: "roomSessionStatus",
            requestId: message.requestId,
            ...manager.inspectRoomSession(message.roomCode, message.clientToken),
            ...roomServerInfo,
          });
          return;
        }

        if (message.type === "joinRoom") {
          const { room, clientToken } = manager.joinRoom(message.roomCode, message.payload.name, clientId);
          clientSessions.set(clientId, { roomCode: room.code, token: clientToken, role: "player" });
          send(socket, {
            type: "connected",
            requestId: message.requestId,
            role: "player",
            roomCode: room.code,
            clientToken,
            ...roomServerInfo,
          });
          broadcastRoom(room.code);
          return;
        }

        if (message.type === "joinStage") {
          const room = manager.joinStage(message.roomCode, message.stageToken);
          clientSessions.set(clientId, { roomCode: room.code, token: message.stageToken, role: "stage" });
          send(socket, {
            type: "connected",
            requestId: message.requestId,
            role: "stage",
            roomCode: room.code,
            clientToken: message.stageToken,
            ...roomServerInfo,
          });
          broadcastRoom(room.code);
          return;
        }

        if (message.type === "resumeRoom") {
          const { room, role } = manager.resumeRoom(message.roomCode, message.clientToken, clientId);
          clientSessions.set(clientId, { roomCode: room.code, token: message.clientToken, role });
          send(socket, {
            type: "connected",
            requestId: message.requestId,
            role,
            roomCode: room.code,
            clientToken: message.clientToken,
            ...roomServerInfo,
          });
          broadcastRoom(room.code);
          return;
        }

        if (message.type === "hostCommand") {
          assertActiveHostSession(message.roomCode, message.clientToken, clientId);
          if (message.payload.type === "transferHost") {
            assertTransferTargetOnline(message.roomCode, message.clientToken, message.payload.playerId);
          }

          const result = manager.applyHostCommand(message.roomCode, message.clientToken, message.payload);
          if (result.closed) {
            broadcastClosed(result.room.code);
            return;
          }
          if ("kicked" in result && result.kicked) {
            for (const [sessionClientId, session] of clientSessions.entries()) {
              if (session.roomCode !== result.room.code || session.token !== result.kicked.token) continue;
              const kickedSocket = clients.get(sessionClientId);
              if (kickedSocket && kickedSocket.readyState === kickedSocket.OPEN) {
                send(kickedSocket, { type: "kicked", roomCode: result.room.code });
              }
              clientSessions.delete(sessionClientId);
            }
          }
          if ("transferred" in result && result.transferred) {
            const targetSocket = clients.get(result.transferred.clientId);
            if (targetSocket && targetSocket.readyState === targetSocket.OPEN) {
              clientSessions.set(result.transferred.clientId, {
                roomCode: result.room.code,
                token: result.transferred.token,
                role: "host",
              });
              send(targetSocket, {
                type: "connected",
                role: "host",
                roomCode: result.room.code,
                clientToken: result.transferred.token,
                ...roomServerInfo,
              });
            }
            demotePreviousHostSessions(result.room.code, result.transferred.oldHostToken, clientId, result.transferred.playerId);
          }
          if (message.payload.type === "createStageLink" || message.payload.type === "disableStageLink") {
            closeStageSessions(result.room.code);
          }
          broadcastRoom(result.room.code);
          return;
        }

        if (message.type === "playerCommand") {
          assertActivePlayerSession(message.roomCode, message.clientToken, clientId);
          const { room } = manager.applyPlayerCommand(message.roomCode, message.clientToken, message.payload);
          broadcastRoom(room.code);
          return;
        }

        if (message.type === "leaveRoom") {
          const room = manager.leaveRoom(message.roomCode, message.clientToken);
          send(socket, { type: "leftRoom", roomCode: room.code });
          broadcastRoom(room.code);
        }
      } catch (error) {
        send(socket, {
          type: "error",
          requestId: message.requestId,
          message: error instanceof Error ? error.message : "Unexpected room error.",
        });
      }
    });

    socket.on("close", () => {
      closeExpiredRooms();
      clients.delete(clientId);
      clientSessions.delete(clientId);
      const touchedRooms = manager.disconnectClient(clientId);
      for (const room of touchedRooms) broadcastRoom(room.code);
    });
  });

  function closeExpiredRooms() {
    for (const room of manager.pruneExpiredRooms()) {
      broadcastClosed(room.code);
    }
  }

  function handleAdminRoomsRequest(request: http.IncomingMessage, response: http.ServerResponse, token: string) {
    if (!token) {
      response.writeHead(404, plainTextResponseHeaders());
      response.end("Not found");
      return;
    }

    if (!isAdminCorsRequestAllowed(request, adminAllowedOrigins)) {
      response.writeHead(403, adminResponseHeaders(request, adminAllowedOrigins));
      response.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, adminResponseHeaders(request, adminAllowedOrigins));
      response.end();
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405, { ...adminResponseHeaders(request, adminAllowedOrigins), Allow: "GET, OPTIONS" });
      response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
      return;
    }

    if (bearerToken(request.headers.authorization) !== token) {
      response.writeHead(401, adminResponseHeaders(request, adminAllowedOrigins));
      response.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    closeExpiredRooms();
    response.writeHead(200, adminResponseHeaders(request, adminAllowedOrigins));
    response.end(JSON.stringify({ ok: true, ...manager.adminRoomsSummary(), ...roomServerInfo }));
  }

  function assertTransferTargetOnline(roomCode: string, hostToken: string, playerId: string) {
    const room = manager.getRoom(roomCode);
    if (!room || room.hostToken !== hostToken) return;

    const target = room.players.find((player) => player.id === playerId);
    const targetSocket = target?.clientId ? clients.get(target.clientId) : null;
    if (!target || !target.connected || !target.clientId || !targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
      throw new Error("Target player is not connected.");
    }
  }

  function assertActiveHostSession(roomCode: string, hostToken: string, commandClientId: string) {
    const room = manager.getRoom(roomCode);
    if (!room || room.hostToken !== hostToken) return;
    if (room.hostClientId !== commandClientId) throw new Error("Host session is stale.");
  }

  function assertActivePlayerSession(roomCode: string, playerToken: string, commandClientId: string) {
    const room = manager.getRoom(roomCode);
    const player = room?.players.find((candidate) => candidate.token === playerToken);
    if (!player) return;
    if (player.clientId !== commandClientId) throw new Error("Player session is stale.");
  }

  function demotePreviousHostSessions(roomCode: string, oldHostToken: string, commandClientId: string, toPlayerId: string) {
    const oldHostClientIds = new Set<string>([commandClientId]);
    for (const [sessionClientId, session] of clientSessions.entries()) {
      if (session.roomCode === roomCode && session.role === "host" && session.token === oldHostToken) {
        oldHostClientIds.add(sessionClientId);
      }
    }

    for (const oldHostClientId of oldHostClientIds) {
      const oldHostSocket = clients.get(oldHostClientId);
      if (oldHostSocket && oldHostSocket.readyState === oldHostSocket.OPEN) {
        send(oldHostSocket, { type: "hostTransferred", roomCode, toPlayerId });
      }
      clientSessions.delete(oldHostClientId);
    }
  }

  function broadcastRoom(roomCode: string) {
    const room = manager.getRoom(roomCode);
    if (!room) return;

    for (const [clientId, session] of clientSessions.entries()) {
      if (session.roomCode !== room.code) continue;
      const socket = clients.get(clientId);
      if (!socket || socket.readyState !== socket.OPEN) continue;

      try {
        const snapshot =
          session.role === "host"
            ? manager.hostSnapshot(room)
            : session.role === "player"
              ? manager.playerSnapshot(room, session.token)
              : manager.stageSnapshot(room, session.token);
        send(socket, { type: "snapshot", roomCode: room.code, snapshot });
      } catch {
        clientSessions.delete(clientId);
      }
    }
  }

  function closeStageSessions(roomCode: string) {
    for (const [clientId, session] of clientSessions.entries()) {
      if (session.roomCode !== roomCode || session.role !== "stage") continue;
      const socket = clients.get(clientId);
      if (socket && socket.readyState === socket.OPEN) {
        send(socket, { type: "roomClosed", roomCode });
      }
      clientSessions.delete(clientId);
    }
  }

  function broadcastClosed(roomCode: string) {
    for (const [clientId, session] of clientSessions.entries()) {
      if (session.roomCode !== roomCode) continue;
      const socket = clients.get(clientId);
      if (socket && socket.readyState === socket.OPEN) {
        send(socket, { type: "roomClosed", roomCode });
      }
      clientSessions.delete(clientId);
    }
  }

  return { server, wss, manager };
}

if (isMainModule()) {
  const { server } = createRoomServer();
  const port = readPort(process.env.PORT ?? process.env.TABLEGATHER_PORT, 8787);
  server.listen(port, () => {
    console.log(
      `TableGather room server listening on ${port} ` +
        `(protocol ${ROOM_PROTOCOL_VERSION}; features: ${ROOM_PROTOCOL_FEATURES.join(", ")})`,
    );
  });
}

function send(socket: WebSocket, message: ServerMessage) {
  socket.send(JSON.stringify(message));
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readAdminToken(configuredToken: string | null | undefined) {
  if (configuredToken !== undefined) return configuredToken?.trim() ?? "";
  return process.env.TABLEGATHER_ADMIN_TOKEN?.trim() ?? "";
}

function readAdminAllowedOrigins() {
  const configuredOrigins = parseAllowedOrigins(process.env.TABLEGATHER_ADMIN_ALLOWED_ORIGINS);
  if (process.env.NODE_ENV === "production") return configuredOrigins;
  return new Set([...configuredOrigins, "http://localhost:5173", "http://127.0.0.1:5173"]);
}

function readServeStatic(configured: boolean | null | undefined) {
  if (configured !== undefined && configured !== null) return configured;
  const value = process.env.TABLEGATHER_SERVE_STATIC?.trim().toLowerCase();
  if (value) return ["1", "true", "yes", "on"].includes(value);
  return process.env.NODE_ENV === "production";
}

function bearerToken(header: string | undefined) {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function adminResponseHeaders(request: http.IncomingMessage, allowedOrigins: ReadonlySet<string>): http.OutgoingHttpHeaders {
  const origin = allowedAdminCorsOrigin(request, allowedOrigins);
  const headers: http.OutgoingHttpHeaders = {
    ...jsonResponseHeaders(),
    "Cache-Control": "no-store",
    Vary: "Origin",
  };

  if (!origin) return headers;
  return {
    ...headers,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
}

function isAdminCorsRequestAllowed(request: http.IncomingMessage, allowedOrigins: ReadonlySet<string>) {
  return !request.headers.origin || Boolean(allowedAdminCorsOrigin(request, allowedOrigins));
}

function allowedAdminCorsOrigin(request: http.IncomingMessage, allowedOrigins: ReadonlySet<string>) {
  const origin = normalizeAllowedOrigin(request.headers.origin);
  return origin && allowedOrigins.has(origin) ? origin : null;
}

function parseAllowedOrigins(value: string | null | undefined) {
  const rawOrigins = (value ?? "").split(",");
  const origins = new Set<string>();

  for (const rawOrigin of rawOrigins) {
    const origin = normalizeAllowedOrigin(rawOrigin);
    if (origin) origins.add(origin);
  }

  return origins;
}

function normalizeAllowedOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed === url.origin ? url.origin : null;
  } catch {
    return null;
  }
}

function jsonResponseHeaders(): http.OutgoingHttpHeaders {
  return {
    ...securityHeaders(),
    "Content-Type": "application/json",
  };
}

function plainTextResponseHeaders(): http.OutgoingHttpHeaders {
  return {
    ...securityHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
  };
}

function securityHeaders(): http.OutgoingHttpHeaders {
  return {
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function createClientId() {
  return Math.random().toString(36).slice(2, 12);
}

function serveStaticRequest(request: http.IncomingMessage, response: http.ServerResponse, staticDir: string) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  let pathname: string;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400, plainTextResponseHeaders());
    response.end("Bad request");
    return true;
  }

  const filePath = resolveStaticFilePath(staticDir, pathname);
  if (!filePath) {
    response.writeHead(404, plainTextResponseHeaders());
    response.end("Not found");
    return true;
  }

  const headers = staticHeaders(filePath, pathname);
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  createReadStream(filePath).pipe(response);
  return true;
}

function resolveStaticFilePath(staticDir: string, pathname: string) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = resolve(staticDir, `.${normalizedPath}`);
  if (!isInsideDirectory(staticDir, requestedPath)) return null;

  const requestedFile = existingFilePath(requestedPath);
  if (requestedFile) return requestedFile;

  if (extname(normalizedPath)) return null;
  return existingFilePath(resolve(staticDir, "index.html"));
}

function existingFilePath(filePath: string) {
  try {
    const stats = statSync(filePath);
    return stats.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function isInsideDirectory(parent: string, child: string) {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(normalizedParent);
}

function staticHeaders(filePath: string, pathname: string): http.OutgoingHttpHeaders {
  const contentType = contentTypeForPath(filePath);
  const headers: http.OutgoingHttpHeaders = { ...securityHeaders(), "Content-Type": contentType };

  if (pathname === "/sw.js") {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
    headers.Pragma = "no-cache";
    headers.Expires = "0";
    return headers;
  }

  if (pathname === "/" || filePath.endsWith(`${sep}index.html`)) {
    headers["Cache-Control"] = "no-cache";
    return headers;
  }

  if (pathname === "/manifest.webmanifest") {
    headers["Cache-Control"] = "no-cache";
    return headers;
  }

  headers["Cache-Control"] = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  return headers;
}

function contentTypeForPath(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}
