import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createRoomServer } from "../server/index";
import { RoomManager } from "../server/roomManager";
import { InMemoryRoomStore } from "../server/roomStore";
import { ROOM_PROTOCOL_FEATURES, ROOM_PROTOCOL_VERSION } from "../src/online/protocol";
import type { ServerMessage } from "../src/online/messages";
import type { RoleCounts, WerewolfState } from "../src/games/werewolf/domain/types";
import type { WerewolfHostRoomSnapshot, WerewolfPlayerRoomSnapshot, WerewolfStageRoomSnapshot } from "../src/games/werewolf/roomTypes";

type ConnectedMessage = Extract<ServerMessage, { type: "connected" }>;
type SnapshotMessage = Extract<ServerMessage, { type: "snapshot" }>;
type RoomStatusMessage = Extract<ServerMessage, { type: "roomStatus" }>;
type RoomSessionStatusMessage = Extract<ServerMessage, { type: "roomSessionStatus" }>;

const openSockets: TestSocket[] = [];
let closeServer: (() => Promise<void>) | null = null;
const expectedSecurityHeaders = {
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

describe("room websocket server", () => {
  afterEach(async () => {
    for (const socket of openSockets.splice(0)) socket.close();
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  it("promotes the selected player and demotes all previous host sessions", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    expect(created.protocolVersion).toBe(ROOM_PROTOCOL_VERSION);
    expect(created.features).toEqual(ROOM_PROTOCOL_FEATURES);
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const staleHost = await openSocket(url);
    staleHost.send({ type: "resumeRoom", roomCode, clientToken: created.clientToken });
    await staleHost.next((message) => message.type === "connected" && message.role === "host");
    await staleHost.next((message) => message.type === "snapshot");

    const player = await openSocket(url);
    player.send({ type: "joinRoom", roomCode, payload: { name: "New Host" } });
    const joined = (await player.next((message) => message.type === "connected" && message.role === "player")) as ConnectedMessage;
    await player.next((message) => message.type === "snapshot");
    const lobby = await host.next((message) => message.type === "snapshot" && hostSnapshot(message).players.length === 1);
    const playerId = hostSnapshot(lobby).players[0].id;

    staleHost.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "transferHost", playerId } });

    await expect(host.next((message) => message.type === "hostTransferred")).resolves.toMatchObject({
      type: "hostTransferred",
      roomCode,
      toPlayerId: playerId,
    });
    await expect(staleHost.next((message) => message.type === "hostTransferred")).resolves.toMatchObject({
      type: "hostTransferred",
      roomCode,
      toPlayerId: playerId,
    });

    const promoted = (await player.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    expect(promoted.clientToken).toBe(joined.clientToken);
    const hostView = hostSnapshot(await player.next((message) => message.type === "snapshot" && hostSnapshot(message).audience === "host"));
    expect(hostView.players).toHaveLength(0);

    const formerHost = await openSocket(url);
    formerHost.send({ type: "resumeRoom", roomCode, clientToken: created.clientToken });
    await expect(formerHost.next((message) => message.type === "error")).resolves.toMatchObject({
      type: "error",
      message: "Session not found.",
    });

    formerHost.send({ type: "joinRoom", roomCode, payload: { name: "Former Host" } });
    await expect(formerHost.next((message) => message.type === "connected" && message.role === "player")).resolves.toMatchObject({
      type: "connected",
      role: "player",
      roomCode,
    });
  });

  it("reports the room protocol through health", async () => {
    const url = await startServer();
    const response = await fetch(toHealthUrl(url));

    expectSecurityHeaders(response);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      rooms: 0,
      protocolVersion: ROOM_PROTOCOL_VERSION,
      features: ROOM_PROTOCOL_FEATURES,
    });
  });

  it("does not serve static app files by default in tests", async () => {
    const staticDir = await createStaticFixture();
    try {
      const url = await startServer(new RoomManager(), { staticDir });
      const response = await fetch(toServerUrl(url, "/admin"));

      expect(response.status).toBe(404);
      await expect(response.text()).resolves.toBe("Not found");
    } finally {
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("serves the production app shell and static assets when enabled", async () => {
    const staticDir = await createStaticFixture();
    try {
      const url = await startServer(new RoomManager(), { adminToken: "secret-admin-token", serveStatic: true, staticDir });
      const adminRoute = await fetch(toServerUrl(url, "/admin"));
      const nestedRoute = await fetch(toServerUrl(url, "/room/ABCD"));
      const asset = await fetch(toServerUrl(url, "/assets/app.js"));
      const serviceWorker = await fetch(toServerUrl(url, "/sw.js"));
      const manifest = await fetch(toServerUrl(url, "/manifest.webmanifest"));
      const protectedAdminEndpoint = await fetch(toServerUrl(url, "/admin/rooms"));

      expect(adminRoute.status).toBe(200);
      expectSecurityHeaders(adminRoute);
      expect(adminRoute.headers.get("content-type")).toContain("text/html");
      expect(adminRoute.headers.get("cache-control")).toBe("no-cache");
      await expect(adminRoute.text()).resolves.toContain("TableGather fixture");

      expect(nestedRoute.status).toBe(200);
      expectSecurityHeaders(nestedRoute);
      await expect(nestedRoute.text()).resolves.toContain("TableGather fixture");

      expect(asset.status).toBe(200);
      expectSecurityHeaders(asset);
      expect(asset.headers.get("content-type")).toContain("application/javascript");
      expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      await expect(asset.text()).resolves.toContain("fixture asset");

      expect(serviceWorker.status).toBe(200);
      expectSecurityHeaders(serviceWorker);
      expect(serviceWorker.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate, proxy-revalidate");
      expect(serviceWorker.headers.get("pragma")).toBe("no-cache");
      expect(serviceWorker.headers.get("expires")).toBe("0");

      expect(manifest.status).toBe(200);
      expectSecurityHeaders(manifest);
      expect(manifest.headers.get("content-type")).toContain("application/manifest+json");
      expect(manifest.headers.get("cache-control")).toBe("no-cache");

      expect(protectedAdminEndpoint.status).toBe(401);
      expectSecurityHeaders(protectedAdminEndpoint);
      expect(protectedAdminEndpoint.headers.get("access-control-allow-origin")).toBeNull();
      await expect(protectedAdminEndpoint.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
    } finally {
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("hides the admin room endpoint when no admin token is configured", async () => {
    const url = await startServer(new RoomManager(), { adminToken: null });
    const response = await fetch(toAdminRoomsUrl(url));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Not found");
  });

  it("rejects admin room requests without a valid bearer token", async () => {
    const url = await startServer(new RoomManager(), { adminToken: "secret-admin-token" });
    const origin = "http://127.0.0.1:5173";
    const missing = await fetch(toAdminRoomsUrl(url), { headers: { Origin: origin } });
    const wrong = await fetch(toAdminRoomsUrl(url), { headers: { Authorization: "Bearer wrong-token", Origin: origin } });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expectSecurityHeaders(missing);
    expectSecurityHeaders(wrong);
    expect(missing.headers.get("access-control-allow-origin")).toBe(origin);
    expect(missing.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(missing.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(missing.headers.get("vary")).toBe("Origin");
    expect(wrong.headers.get("access-control-allow-origin")).toBe(origin);
    expect(wrong.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(wrong.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(wrong.headers.get("cache-control")).toBe("no-store");
    expect(wrong.headers.get("vary")).toBe("Origin");
    await expect(missing.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
    await expect(wrong.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
  });

  it("serves protected admin room summaries without sensitive room data", async () => {
    let now = 10_000_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now });
    const created = manager.createRoom("host-1", "werewolf");
    manager.joinRoom(created.room.code, "Alex", "player-1");
    created.room.phase = "assignment";

    const url = await startServer(manager, { adminToken: "secret-admin-token" });
    now += 1_000;
    const response = await fetch(toAdminRoomsUrl(url), {
      headers: {
        Authorization: "Bearer secret-admin-token",
        Origin: "http://127.0.0.1:5173",
      },
    });
    const body = await response.json();
    const serializedBody = JSON.stringify(body);

    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(body).toMatchObject({
      ok: true,
      protocolVersion: ROOM_PROTOCOL_VERSION,
      features: ROOM_PROTOCOL_FEATURES,
      totals: { total: 1, active: 1, running: 0, waiting: 1, inactive: 0, ended: 0 },
      byGame: { werewolf: { total: 1, active: 1, running: 0, waiting: 1, inactive: 0, ended: 0 } },
      byPhase: { assignment: 1 },
      rooms: [
        {
          code: created.room.code,
          gameId: "werewolf",
          phase: "assignment",
          playerCount: 1,
          connectedPlayerCount: 1,
          hostConnected: true,
          started: false,
          active: true,
          running: false,
          waiting: true,
          progressStatus: "waiting",
          inactive: false,
          inactiveReasons: [],
        },
      ],
    });
    expect(serializedBody).not.toContain(created.clientToken);
    expect(serializedBody).not.toContain("Alex");
    expect(serializedBody).not.toContain("gameState");
    expect(serializedBody).not.toContain("\"assignment\":[");
  });

  it("supports CORS preflight for admin room summaries", async () => {
    const url = await startServer(new RoomManager(), { adminToken: "secret-admin-token" });
    const response = await fetch(toAdminRoomsUrl(url), {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });

    expect(response.status).toBe(204);
    expectSecurityHeaders(response);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-max-age")).toBe("600");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("defaults production admin access to same-origin requests", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowedOrigins = process.env.TABLEGATHER_ADMIN_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "production";
    Reflect.deleteProperty(process.env, "TABLEGATHER_ADMIN_ALLOWED_ORIGINS");

    try {
      const url = await startServer(new RoomManager(), { adminToken: "secret-admin-token" });
      const sameOrigin = await fetch(toAdminRoomsUrl(url), {
        headers: { Authorization: "Bearer secret-admin-token" },
      });
      const devOrigin = await fetch(toAdminRoomsUrl(url), {
        headers: {
          Authorization: "Bearer secret-admin-token",
          Origin: "http://127.0.0.1:5173",
        },
      });

      expect(sameOrigin.status).toBe(200);
      expect(devOrigin.status).toBe(403);
      expectSecurityHeaders(sameOrigin);
      expectSecurityHeaders(devOrigin);
      expect(sameOrigin.headers.get("access-control-allow-origin")).toBeNull();
      expect(devOrigin.headers.get("access-control-allow-origin")).toBeNull();
      await expect(sameOrigin.json()).resolves.toMatchObject({ ok: true, rooms: [] });
      await expect(devOrigin.json()).resolves.toEqual({ ok: false, error: "origin_not_allowed" });
    } finally {
      if (previousNodeEnv === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousAllowedOrigins === undefined) {
        Reflect.deleteProperty(process.env, "TABLEGATHER_ADMIN_ALLOWED_ORIGINS");
      } else {
        process.env.TABLEGATHER_ADMIN_ALLOWED_ORIGINS = previousAllowedOrigins;
      }
    }
  });

  it("rejects unconfigured admin CORS origins without reflecting them", async () => {
    const url = await startServer(new RoomManager(), { adminToken: "secret-admin-token" });
    const origin = "https://untrusted.example";
    const request = await fetch(toAdminRoomsUrl(url), {
      headers: {
        Authorization: "Bearer secret-admin-token",
        Origin: origin,
      },
    });
    const preflight = await fetch(toAdminRoomsUrl(url), {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });

    expect(request.status).toBe(403);
    expect(preflight.status).toBe(403);
    expectSecurityHeaders(request);
    expectSecurityHeaders(preflight);
    expect(request.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(request.headers.get("vary")).toBe("Origin");
    expect(preflight.headers.get("vary")).toBe("Origin");
    await expect(request.json()).resolves.toEqual({ ok: false, error: "origin_not_allowed" });
    await expect(preflight.json()).resolves.toEqual({ ok: false, error: "origin_not_allowed" });
  });

  it("allows configured admin CORS origins", async () => {
    const origin = "https://admin.tablegather.example";
    const previousAllowedOrigins = process.env.TABLEGATHER_ADMIN_ALLOWED_ORIGINS;
    process.env.TABLEGATHER_ADMIN_ALLOWED_ORIGINS = origin;

    try {
      const url = await startServer(new RoomManager(), { adminToken: "secret-admin-token" });
      const response = await fetch(toAdminRoomsUrl(url), {
        headers: {
          Authorization: "Bearer secret-admin-token",
          Origin: origin,
        },
      });
      const preflight = await fetch(toAdminRoomsUrl(url), {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization",
        },
      });

      expect(response.status).toBe(200);
      expect(preflight.status).toBe(204);
      expectSecurityHeaders(response);
      expectSecurityHeaders(preflight);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
      await expect(response.json()).resolves.toMatchObject({ ok: true, rooms: [] });
    } finally {
      if (previousAllowedOrigins === undefined) {
        Reflect.deleteProperty(process.env, "TABLEGATHER_ADMIN_ALLOWED_ORIGINS");
      } else {
        process.env.TABLEGATHER_ADMIN_ALLOWED_ORIGINS = previousAllowedOrigins;
      }
    }
  });

  it("reports room lookup status before players join", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const guest = await openSocket(url);
    guest.send({ type: "inspectRoom", requestId: "existing-room", roomCode });
    await expect(guest.next((message) => message.type === "roomStatus")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "existing-room",
      roomCode,
      exists: true,
      joinable: true,
      gameId: "werewolf",
      phase: "lobby",
      playerCount: 0,
      protocolVersion: ROOM_PROTOCOL_VERSION,
    } satisfies Partial<RoomStatusMessage>);

    const players = await Promise.all(["P1", "P2", "P3", "P4", "P5"].map((name) => joinPlayer(url, roomCode, name)));
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).players.length === 5);
    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "beginSetup", roleCounts: { werewolf: 1, villager: 4 } } });
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "setup");

    guest.send({ type: "inspectRoom", requestId: "setup-room", roomCode });
    await expect(guest.next((message) => message.type === "roomStatus")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "setup-room",
      roomCode,
      exists: true,
      joinable: false,
      phase: "setup",
      playerCount: 5,
    } satisfies Partial<RoomStatusMessage>);

    const latePlayer = await openSocket(url);
    latePlayer.send({ type: "joinRoom", roomCode, payload: { name: "Late" } });
    await expect(latePlayer.next((message) => message.type === "error")).resolves.toMatchObject({
      type: "error",
      message: "The room is already in game.",
    });

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "startGame", roleCounts: { werewolf: 1, villager: 4 } } });
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "roleReveal");
    await Promise.all(players.map((player) => player.next((message) => message.type === "snapshot" && playerSnapshot(message).phase === "roleReveal")));

    guest.send({ type: "inspectRoom", requestId: "started-room", roomCode });
    await expect(guest.next((message) => message.type === "roomStatus")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "started-room",
      roomCode,
      exists: true,
      joinable: false,
      phase: "roleReveal",
      playerCount: 5,
    } satisfies Partial<RoomStatusMessage>);

    guest.send({ type: "inspectRoom", requestId: "missing-room", roomCode: "ZZZZ" });
    await expect(guest.next((message) => message.type === "roomStatus")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "missing-room",
      roomCode: "ZZZZ",
      exists: false,
      joinable: false,
    } satisfies Partial<RoomStatusMessage>);
  });

  it("reports stored room session status without joining the room", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const player = await joinPlayer(url, roomCode, "Alex");

    const guest = await openSocket(url);
    guest.send({ type: "inspectRoomSession", requestId: "host-session", roomCode, clientToken: created.clientToken });
    await expect(guest.next((message) => message.type === "roomSessionStatus")).resolves.toMatchObject({
      type: "roomSessionStatus",
      requestId: "host-session",
      roomCode,
      valid: true,
      role: "host",
      gameId: "werewolf",
      phase: "lobby",
      playerCount: 1,
      protocolVersion: ROOM_PROTOCOL_VERSION,
    } satisfies Partial<RoomSessionStatusMessage>);

    guest.send({ type: "inspectRoomSession", requestId: "player-session", roomCode, clientToken: player.clientToken });
    await expect(guest.next((message) => message.type === "roomSessionStatus")).resolves.toMatchObject({
      type: "roomSessionStatus",
      requestId: "player-session",
      roomCode,
      valid: true,
      role: "player",
      playerName: "Alex",
      playerCount: 1,
    } satisfies Partial<RoomSessionStatusMessage>);

    guest.send({ type: "inspectRoomSession", requestId: "bad-session", roomCode, clientToken: "BADTOKEN" });
    await expect(guest.next((message) => message.type === "roomSessionStatus")).resolves.toMatchObject({
      type: "roomSessionStatus",
      requestId: "bad-session",
      roomCode,
      valid: false,
    } satisfies Partial<RoomSessionStatusMessage>);
  });

  it("rate-limits room lookups and allows them again after the window", async () => {
    let now = 1_000;
    const url = await startServer(new RoomManager(), { now: () => now });
    const guest = await openSocket(url);

    for (let index = 0; index < 60; index += 1) {
      const requestId = `lookup-${index}`;
      guest.send({ type: "inspectRoom", requestId, roomCode: "MISS01" });
      await expect(guest.next((message) => message.type === "roomStatus" && message.requestId === requestId)).resolves.toMatchObject({
        type: "roomStatus",
        requestId,
        roomCode: "MISS01",
        exists: false,
        joinable: false,
      } satisfies Partial<RoomStatusMessage>);
    }

    guest.send({ type: "inspectRoom", requestId: "lookup-limited", roomCode: "MISS01" });
    await expect(guest.next((message) => message.type === "error" && message.requestId === "lookup-limited")).resolves.toMatchObject({
      type: "error",
      requestId: "lookup-limited",
      message: "Too many room requests.",
    });

    now += 60_000;
    for (let index = 0; index < 60; index += 1) {
      const requestId = `lookup-reset-${index}`;
      guest.send({ type: "inspectRoom", requestId, roomCode: "MISS01" });
      await expect(guest.next((message) => message.type === "roomStatus" && message.requestId === requestId)).resolves.toMatchObject({
        type: "roomStatus",
        requestId,
        roomCode: "MISS01",
        exists: false,
        joinable: false,
      } satisfies Partial<RoomStatusMessage>);
    }

    guest.send({ type: "inspectRoom", requestId: "lookup-reset-limited", roomCode: "MISS01" });
    await expect(guest.next((message) => message.type === "error" && message.requestId === "lookup-reset-limited")).resolves.toMatchObject({
      type: "error",
      requestId: "lookup-reset-limited",
      message: "Too many room requests.",
    });
  });

  it("ignores spoofed forwarding headers from untrusted peers for room lookup limits", async () => {
    let now = 1_000;
    const url = await startServer(new RoomManager(), { now: () => now });
    const first = await openSocket(url, { "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "203.0.113.11" });
    await exhaustRoomLookups(first, "untrusted-first");

    const spoofed = await openSocket(url, { "cf-connecting-ip": "203.0.113.12", "x-forwarded-for": "203.0.113.13" });
    spoofed.send({ type: "inspectRoom", requestId: "untrusted-spoofed", roomCode: "MISS01" });
    await expect(spoofed.next((message) => message.type === "error" && message.requestId === "untrusted-spoofed")).resolves.toMatchObject({
      type: "error",
      requestId: "untrusted-spoofed",
      message: "Too many room requests.",
    });

    now += 60_000;
    spoofed.send({ type: "inspectRoom", requestId: "untrusted-reset", roomCode: "MISS01" });
    await expect(spoofed.next((message) => message.type === "roomStatus" && message.requestId === "untrusted-reset")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "untrusted-reset",
      roomCode: "MISS01",
    } satisfies Partial<RoomStatusMessage>);
  });

  it("uses forwarding headers from trusted proxy peers for room lookup limits", async () => {
    const url = await startServer(new RoomManager(), { trustedProxies: ["127.0.0.1", "198.51.100.10"] });
    const first = await openSocket(url, {
      "cf-connecting-ip": "203.0.113.200",
      "x-forwarded-for": "203.0.113.99, 203.0.113.20, 198.51.100.10",
    });
    await exhaustRoomLookups(first, "trusted-first");

    const sameForwardedClient = await openSocket(url, {
      "cf-connecting-ip": "203.0.113.201",
      "x-forwarded-for": "203.0.113.100, 203.0.113.20, 198.51.100.10",
    });
    sameForwardedClient.send({ type: "inspectRoom", requestId: "trusted-same-client", roomCode: "MISS01" });
    await expect(sameForwardedClient.next((message) => message.type === "error" && message.requestId === "trusted-same-client")).resolves.toMatchObject({
      type: "error",
      requestId: "trusted-same-client",
      message: "Too many room requests.",
    });

    const differentForwardedClient = await openSocket(url, {
      "cf-connecting-ip": "203.0.113.202",
      "x-forwarded-for": "203.0.113.99, 203.0.113.21, 198.51.100.10",
    });
    differentForwardedClient.send({ type: "inspectRoom", requestId: "trusted-other-client", roomCode: "MISS01" });
    await expect(differentForwardedClient.next((message) => message.type === "roomStatus" && message.requestId === "trusted-other-client")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "trusted-other-client",
      roomCode: "MISS01",
      exists: false,
      joinable: false,
    } satisfies Partial<RoomStatusMessage>);
  });

  it("rate-limits abusive failed joins and allows valid joins after the window", async () => {
    let now = 1_000;
    const url = await startServer(new RoomManager(), { now: () => now });
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const guest = await openSocket(url);
    for (let index = 0; index < 20; index += 1) {
      const requestId = `join-missing-${index}`;
      guest.send({ type: "joinRoom", requestId, roomCode: "MISS01", payload: { name: `Guest ${index}` } });
      await expect(guest.next((message) => message.type === "error" && message.requestId === requestId)).resolves.toMatchObject({
        type: "error",
        requestId,
        message: "Room not found.",
      });
    }

    guest.send({ type: "joinRoom", requestId: "join-limited", roomCode: "MISS01", payload: { name: "Blocked" } });
    await expect(guest.next((message) => message.type === "error" && message.requestId === "join-limited")).resolves.toMatchObject({
      type: "error",
      requestId: "join-limited",
      message: "Too many room requests.",
    });

    guest.send({ type: "joinRoom", requestId: "join-valid-blocked", roomCode, payload: { name: "Alex" } });
    await expect(guest.next((message) => message.type === "error" && message.requestId === "join-valid-blocked")).resolves.toMatchObject({
      type: "error",
      requestId: "join-valid-blocked",
      message: "Too many room requests.",
    });

    now += 60_000;
    guest.send({ type: "joinRoom", requestId: "join-valid-reset", roomCode, payload: { name: "Alex" } });
    await expect(guest.next((message) => message.type === "connected" && message.requestId === "join-valid-reset")).resolves.toMatchObject({
      type: "connected",
      requestId: "join-valid-reset",
      role: "player",
      roomCode,
    });
  });

  it("closes expired rooms before websocket requests and health responses", async () => {
    let now = 1_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 100 });
    const url = await startServer(manager);
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    now = 1_100;
    const guest = await openSocket(url);
    guest.send({ type: "inspectRoom", requestId: "expired-room", roomCode });

    await expect(host.next((message) => message.type === "roomClosed")).resolves.toMatchObject({ type: "roomClosed", roomCode });
    await expect(guest.next((message) => message.type === "roomStatus")).resolves.toMatchObject({
      type: "roomStatus",
      requestId: "expired-room",
      roomCode,
      exists: false,
      joinable: false,
    } satisfies Partial<RoomStatusMessage>);

    now = 1_200;
    const secondHost = await openSocket(url);
    secondHost.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const secondCreated = (await secondHost.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    await secondHost.next((message) => message.type === "snapshot");

    now = 1_300;
    const response = await fetch(toHealthUrl(url));
    await expect(response.json()).resolves.toMatchObject({ ok: true, rooms: 0 });
    await expect(secondHost.next((message) => message.type === "roomClosed")).resolves.toMatchObject({
      type: "roomClosed",
      roomCode: secondCreated.roomCode,
    });
  });

  it("connects stage clients and closes them when the stage link is disabled", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "createStageLink" } });
    const hostView = hostSnapshot(
      await host.next((message) => message.type === "snapshot" && Boolean(hostSnapshot(message).stageToken)),
    );
    const stageToken = hostView.stageToken!;

    const stage = await openSocket(url);
    stage.send({ type: "joinStage", roomCode, stageToken });
    await expect(stage.next((message) => message.type === "connected" && message.role === "stage")).resolves.toMatchObject({
      type: "connected",
      role: "stage",
      roomCode,
      clientToken: stageToken,
    });
    const stageSnapshot = stageSnapshotFromMessage(await stage.next((message) => message.type === "snapshot"));
    expect(stageSnapshot.audience).toBe("stage");
    expect(JSON.stringify(stageSnapshot)).not.toContain("gameState");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "createStageLink" } });
    await expect(stage.next((message) => message.type === "roomClosed")).resolves.toMatchObject({ type: "roomClosed", roomCode });
    const rotatedHostView = hostSnapshot(
      await host.next((message) => message.type === "snapshot" && hostSnapshot(message).stageToken !== stageToken),
    );
    const rotatedToken = rotatedHostView.stageToken!;

    const staleStage = await openSocket(url);
    staleStage.send({ type: "joinStage", roomCode, stageToken });
    await expect(staleStage.next((message) => message.type === "error")).resolves.toMatchObject({
      type: "error",
      message: "Stage link is not valid.",
    });

    const activeStage = await openSocket(url);
    activeStage.send({ type: "joinStage", roomCode, stageToken: rotatedToken });
    await activeStage.next((message) => message.type === "connected" && message.role === "stage");
    await activeStage.next((message) => message.type === "snapshot");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "disableStageLink" } });
    await expect(activeStage.next((message) => message.type === "roomClosed")).resolves.toMatchObject({ type: "roomClosed", roomCode });
  });

  it("broadcasts host-controlled stage locale changes to active stage clients", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "createStageLink", stageLocale: "de" } });
    const hostView = hostSnapshot(
      await host.next((message) => message.type === "snapshot" && Boolean(hostSnapshot(message).stageToken)),
    );
    expect(hostView.stageLocale).toBe("de");

    const stage = await openSocket(url);
    stage.send({ type: "joinStage", roomCode, stageToken: hostView.stageToken! });
    await stage.next((message) => message.type === "connected" && message.role === "stage");
    expect(stageSnapshotFromMessage(await stage.next((message) => message.type === "snapshot")).stageLocale).toBe("de");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "setStageLocale", stageLocale: "en" } });
    expect(hostSnapshot(await host.next((message) => message.type === "snapshot" && hostSnapshot(message).stageLocale === "en")).stageLocale).toBe("en");
    expect(stageSnapshotFromMessage(await stage.next((message) => message.type === "snapshot")).stageLocale).toBe("en");
  });

  it("rejects room creation without an explicit game id", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", requestId: "missing-game" });

    await expect(host.next((message) => message.type === "error")).resolves.toMatchObject({
      type: "error",
      requestId: "missing-game",
      message: "Game id is required.",
    });
  });

  it("rejects commands from stale host and player sockets after reconnect", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const resumedHost = await openSocket(url);
    resumedHost.send({ type: "resumeRoom", roomCode, clientToken: created.clientToken });
    await resumedHost.next((message) => message.type === "connected" && message.role === "host");
    await resumedHost.next((message) => message.type === "snapshot");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "resetToLobby" } });
    await expect(host.next((message) => message.type === "error")).resolves.toMatchObject({
      type: "error",
      message: "Host session is stale.",
    });

    const player = await openSocket(url);
    player.send({ type: "joinRoom", roomCode, payload: { name: "Alex" } });
    const joined = (await player.next((message) => message.type === "connected" && message.role === "player")) as ConnectedMessage;
    await player.next((message) => message.type === "snapshot");

    const resumedPlayer = await openSocket(url);
    resumedPlayer.send({ type: "resumeRoom", roomCode, clientToken: joined.clientToken });
    await resumedPlayer.next((message) => message.type === "connected" && message.role === "player");
    await resumedPlayer.next((message) => message.type === "snapshot");

    player.send({ type: "playerCommand", roomCode, clientToken: joined.clientToken, payload: { type: "markRoleSeen" } });
    await expect(player.next((message) => message.type === "error")).resolves.toMatchObject({
      type: "error",
      message: "Player session is stale.",
    });
  });

  it("reveals a private role to every player in a five-player room", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const players = await Promise.all(["P1", "P2", "P3", "P4", "P5"].map((name) => joinPlayer(url, roomCode, name)));
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).players.length === 5);

    const roleCounts: RoleCounts = { werewolf: 1, seer: 1, villager: 3 };
    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "startGame", roleCounts } });

    const hostView = hostSnapshot(await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "roleReveal"));
    expect(hostView.players).toHaveLength(5);

    for (const player of players) {
      const snapshot = playerSnapshot(
        await player.next((message) => message.type === "snapshot" && playerSnapshot(message).phase === "roleReveal"),
      );
      expect(snapshot.self.roleId).toBeTruthy();
      expect(JSON.stringify(snapshot)).not.toContain("gameState");
      expect(JSON.stringify(snapshot)).not.toContain("\"assignment\":");
      expect(JSON.stringify(snapshot)).not.toContain("roleCounts");
      expect(JSON.stringify(snapshot)).not.toContain("wolfTargetId");
    }
  });

  it("keeps resolved nights in a night report until the host starts the day", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    const players = await Promise.all(["P1", "P2", "P3", "P4", "P5"].map((name) => joinPlayer(url, roomCode, name)));
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).players.length === 5);

    const roleCounts: RoleCounts = { werewolf: 1, villager: 4 };
    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "startGame", roleCounts } });
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "roleReveal");

    for (const player of players) {
      player.send({ type: "playerCommand", roomCode, clientToken: player.clientToken, payload: { type: "markRoleSeen" } });
    }

    const playing = hostSnapshot(await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "playing"));
    const gameState = playing.gameState as WerewolfState;
    const victim = gameState.players.find((player) => player.roleId !== "werewolf")!;

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "setWolfTarget", playerId: victim.id } });
    await host.next(
      (message) => message.type === "snapshot" && Boolean((hostSnapshot(message).gameState as WerewolfState | null)?.wolfTargetId),
    );
    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "resolveNight" } });

    const report = hostSnapshot(
      await host.next(
        (message) => message.type === "snapshot" && Boolean((hostSnapshot(message).gameState as WerewolfState | null)?.nightResolved),
      ),
    );
    const reportState = report.gameState as WerewolfState;
    expect(reportState.phase).toBe("night");
    expect(reportState.lastNightDeaths).toEqual([victim.id]);

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "startDay" } });
    const day = hostSnapshot(
      await host.next((message) => message.type === "snapshot" && (hostSnapshot(message).gameState as WerewolfState | null)?.phase === "day"),
    );
    const dayState = day.gameState as WerewolfState;
    expect(dayState.nightResolved).toBe(false);
    expect(dayState.lastNightDeaths).toEqual([]);
  });

  it("broadcasts host-controlled day timer updates to stage clients", async () => {
    const url = await startServer();
    const host = await openSocket(url);

    host.send({ type: "createRoom", payload: { gameId: "werewolf" } });
    const created = (await host.next((message) => message.type === "connected" && message.role === "host")) as ConnectedMessage;
    const roomCode = created.roomCode;
    await host.next((message) => message.type === "snapshot");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "createStageLink" } });
    const linkedHostView = hostSnapshot(
      await host.next((message) => message.type === "snapshot" && Boolean(hostSnapshot(message).stageToken)),
    );
    const stage = await openSocket(url);
    stage.send({ type: "joinStage", roomCode, stageToken: linkedHostView.stageToken! });
    await stage.next((message) => message.type === "connected" && message.role === "stage");
    await stage.next((message) => message.type === "snapshot");

    const players = await Promise.all(["P1", "P2", "P3", "P4", "P5"].map((name) => joinPlayer(url, roomCode, name)));
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).players.length === 5);

    host.send({
      type: "hostCommand",
      roomCode,
      clientToken: created.clientToken,
      payload: { type: "startGame", roleCounts: { werewolf: 1, villager: 4 } },
    });
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "roleReveal");

    for (const player of players) {
      player.send({ type: "playerCommand", roomCode, clientToken: player.clientToken, payload: { type: "markRoleSeen" } });
    }
    await host.next((message) => message.type === "snapshot" && hostSnapshot(message).phase === "playing");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "resolveNight" } });
    await host.next(
      (message) => message.type === "snapshot" && Boolean((hostSnapshot(message).gameState as WerewolfState | null)?.nightResolved),
    );
    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "startDay" } });
    await host.next((message) => message.type === "snapshot" && (hostSnapshot(message).gameState as WerewolfState | null)?.phase === "day");
    await stage.next((message) => message.type === "snapshot" && stageSnapshotFromMessage(message).scene === "day");

    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "setDayTimerDuration", durationSeconds: 120 } });
    await host.next(
      (message) => message.type === "snapshot" && (hostSnapshot(message).gameState as WerewolfState | null)?.dayTimer.durationSeconds === 120,
    );
    host.send({ type: "hostCommand", roomCode, clientToken: created.clientToken, payload: { type: "startDayTimer" } });

    const hostView = hostSnapshot(
      await host.next(
        (message) => message.type === "snapshot" && (hostSnapshot(message).gameState as WerewolfState | null)?.dayTimer.status === "running",
      ),
    );
    const stageView = stageSnapshotFromMessage(
      await stage.next((message) => message.type === "snapshot" && stageSnapshotFromMessage(message).dayTimer?.status === "running"),
    );
    const hostTimer = (hostView.gameState as WerewolfState).dayTimer;

    expect(hostTimer.durationSeconds).toBe(120);
    expect(stageView.dayTimer).toMatchObject({
      durationSeconds: 120,
      status: "running",
      startedAt: hostTimer.startedAt,
    });
    expect(stageView.dayTimer?.remainingSeconds).toBeGreaterThan(0);
    expect(stageView.dayTimer?.remainingSeconds).toBeLessThanOrEqual(120);
  });
});

async function startServer(manager = new RoomManager(), options?: Parameters<typeof createRoomServer>[1]) {
  const { server, wss } = createRoomServer(manager, options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  closeServer = async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return `ws://127.0.0.1:${address.port}/ws`;
}

async function openSocket(url: string, headers?: Record<string, string>) {
  const socket = new TestSocket(url, headers);
  await socket.open();
  openSockets.push(socket);
  return socket;
}

function hostSnapshot(message: ServerMessage) {
  if (message.type !== "snapshot") throw new Error(`Expected snapshot, received ${message.type}.`);
  return (message as SnapshotMessage).snapshot as WerewolfHostRoomSnapshot;
}

function playerSnapshot(message: ServerMessage) {
  if (message.type !== "snapshot") throw new Error(`Expected snapshot, received ${message.type}.`);
  return (message as SnapshotMessage).snapshot as WerewolfPlayerRoomSnapshot;
}

function stageSnapshotFromMessage(message: ServerMessage) {
  if (message.type !== "snapshot") throw new Error(`Expected snapshot, received ${message.type}.`);
  return (message as SnapshotMessage).snapshot as WerewolfStageRoomSnapshot;
}

function toHealthUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  url.protocol = "http:";
  url.pathname = "/health";
  return url;
}

function toAdminRoomsUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  url.protocol = "http:";
  url.pathname = "/admin/rooms";
  return url;
}

function toServerUrl(wsUrl: string, path: string) {
  const url = new URL(wsUrl);
  url.protocol = "http:";
  url.pathname = path;
  return url;
}

function expectSecurityHeaders(response: Response) {
  for (const [header, value] of Object.entries(expectedSecurityHeaders)) {
    expect(response.headers.get(header)).toBe(value);
  }
  expect(response.headers.get("permissions-policy")).toContain("camera=()");
  expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
  expect(response.headers.get("permissions-policy")).toContain("microphone=()");
  expect(response.headers.get("permissions-policy")).toContain("payment=()");
  expect(response.headers.get("permissions-policy")).toContain("usb=()");
}

async function createStaticFixture() {
  const staticDir = await mkdtemp(join(tmpdir(), "tablegather-static-"));
  await mkdir(join(staticDir, "assets"));
  await writeFile(join(staticDir, "index.html"), "<!doctype html><title>TableGather fixture</title>");
  await writeFile(join(staticDir, "assets", "app.js"), "console.log('fixture asset');");
  await writeFile(join(staticDir, "sw.js"), "self.addEventListener('install', () => undefined);");
  await writeFile(join(staticDir, "manifest.webmanifest"), JSON.stringify({ name: "TableGather fixture" }));
  return staticDir;
}

async function joinPlayer(url: string, roomCode: string, name: string) {
  const player = await openSocket(url);
  player.send({ type: "joinRoom", roomCode, payload: { name } });
  const connected = (await player.next((message) => message.type === "connected" && message.role === "player")) as ConnectedMessage;
  await player.next((message) => message.type === "snapshot");
  return Object.assign(player, { clientToken: connected.clientToken });
}

async function exhaustRoomLookups(socket: TestSocket, prefix: string) {
  for (let index = 0; index < 60; index += 1) {
    const requestId = `${prefix}-${index}`;
    socket.send({ type: "inspectRoom", requestId, roomCode: "MISS01" });
    await expect(socket.next((message) => message.type === "roomStatus" && message.requestId === requestId)).resolves.toMatchObject({
      type: "roomStatus",
      requestId,
      roomCode: "MISS01",
      exists: false,
      joinable: false,
    } satisfies Partial<RoomStatusMessage>);
  }
}

class TestSocket {
  private socket: WebSocket;
  private queue: ServerMessage[] = [];
  private waiters: Array<() => void> = [];

  constructor(url: string, headers?: Record<string, string>) {
    this.socket = new WebSocket(url, { headers });
    this.socket.addEventListener("message", (event) => {
      this.queue.push(JSON.parse(event.data.toString()) as ServerMessage);
      for (const waiter of [...this.waiters]) waiter();
    });
  }

  open() {
    return new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("WebSocket failed to open.")), { once: true });
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  next(predicate: (message: ServerMessage) => boolean, timeout = 4000) {
    return new Promise<ServerMessage>((resolve, reject) => {
      const cleanup = (listener: () => void) => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((waiter) => waiter !== listener);
      };
      const pick = (listener: () => void) => {
        const index = this.queue.findIndex(predicate);
        if (index < 0) return false;
        const [message] = this.queue.splice(index, 1);
        cleanup(listener);
        resolve(message);
        return true;
      };
      const onMessage = () => pick(onMessage);
      const timer = setTimeout(() => {
        cleanup(onMessage);
        reject(new Error(`Timed out waiting for WebSocket message. Queued: ${JSON.stringify(this.queue)}`));
      }, timeout);
      if (!pick(onMessage)) this.waiters.push(onMessage);
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }
}
