import { type ReactNode, useEffect, useMemo, useState } from "react";
import { I18nProvider } from "./i18n/I18nProvider";
import { AdminScreen } from "./components/AdminScreen";
import { HubScreen } from "./components/HubScreen";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import {
  resolveDefaultRoomHostRouteComponent,
  resolveDefaultRoomPlayerRouteComponent,
  resolveDefaultStageRouteComponent,
  resolveLocalPlayRouteComponent,
  resolveRoomHostRouteComponent,
  resolveRoomPlayerRouteComponent,
  resolveStageRouteComponent,
} from "./games/routeComponents";
import { gameThemeClassName, gameThemeStyle } from "./games/theme";
import type { ServerMessage } from "./online/messages";
import {
  getStoredHostRoomToken,
  getStoredPlayerRoomToken,
  removeHostRoomSession,
  removePlayerRoomSession,
} from "./online/roomSessionStorage";
import { useRoomSocket, type RoomSocketControls } from "./online/useRoomSocket";
import type { GameDefinition } from "./games/types";
import type { GameId } from "./types";

export function App() {
  const route = useRoute();

  return (
    <I18nProvider>
      <AppErrorBoundary resetKey={routeKey(route)}>
        {route.name === "home" && <HubScreen navigate={navigate} />}
        {route.name === "admin" && <AdminScreen />}
        {route.name === "localGame" && <LocalGameRoute gameId={route.gameId} navigate={navigate} />}
        {route.name === "createRoom" && <CreateRoomRoute gameId={route.gameId} navigate={navigate} />}
        {route.name === "joinRoomCode" && <JoinRoomCodeRoute navigate={navigate} />}
        {route.name === "joinRoom" && <RoomRouteScreen key={route.code} code={route.code} navigate={navigate} />}
        {route.name === "stage" && <StageRoute key={`${route.code}:${route.token}`} code={route.code} token={route.token} navigate={navigate} />}
      </AppErrorBoundary>
    </I18nProvider>
  );
}

function LocalGameRoute({ gameId, navigate }: { gameId: GameId; navigate: (path: string) => void }) {
  const route = resolveLocalPlayRouteComponent(gameId);

  if (!route) return <HubScreen navigate={navigate} />;

  const { game, Component } = route;
  return (
    <GameThemeFrame game={game}>
      <Component navigate={navigate} />
    </GameThemeFrame>
  );
}

function CreateRoomRoute({ gameId, navigate }: { gameId: GameId; navigate: (path: string) => void }) {
  const route = resolveRoomHostRouteComponent(gameId);

  if (!route) return <HubScreen navigate={navigate} />;

  const { game, Component } = route;
  return (
    <GameThemeFrame game={game}>
      <Component gameId={game.id} navigate={navigate} />
    </GameThemeFrame>
  );
}

function JoinRoomCodeRoute({ navigate }: { navigate: (path: string) => void }) {
  const route = resolveDefaultRoomPlayerRouteComponent();
  if (!route) return <HubScreen navigate={navigate} />;

  const { game, Component } = route;
  return (
    <GameThemeFrame game={game}>
      <Component navigate={navigate} onResolvedGameId={(_, roomCode) => navigate(`/room/${roomCode}`)} />
    </GameThemeFrame>
  );
}

function RoomRouteScreen({ code, navigate }: { code: string; navigate: (path: string) => void }) {
  const [lookup, setLookup] = useState<RoomLookup>(() => initialRoomLookup(code));
  const [target, setTarget] = useState<RoomRouteTarget | null>(null);
  const requestId = roomLookupRequestId(code, lookup);

  const { connect, send, error } = useRoomSocket((message: ServerMessage, controls) => {
    if (message.type === "roomSessionStatus" && message.requestId === requestId) {
      if (message.valid) {
        setTarget({ role: message.role, gameId: message.gameId });
        controls.disconnect();
        return;
      }

      const nextLookup = nextRoomLookupAfterInvalidSession(code, lookup);
      setLookup(nextLookup);
      if (lookup.type === "session" && lookup.role === "host") removeHostRoomSession(code);
      if (lookup.type === "session" && lookup.role === "player") removePlayerRoomSession(code);
    }

    if (message.type === "roomStatus" && message.requestId === requestId) {
      setTarget(message.exists && message.gameId ? { role: "player", gameId: message.gameId } : { role: "player" });
      controls.disconnect();
    }
  });

  useEffect(() => {
    if (target || error) return;

    const socket = connect();
    const inspect = () => inspectRoomRoute(send, code, lookup, requestId);
    if (socket.readyState === WebSocket.OPEN) {
      inspect();
    } else {
      socket.addEventListener("open", inspect, { once: true });
    }

    return () => socket.removeEventListener("open", inspect);
  }, [code, connect, error, lookup, requestId, send, target]);

  const resolvedTarget = target ?? (error ? { role: lookup.type === "session" ? lookup.role : "player" } : null);

  if (!resolvedTarget) return <GameThemeFrame />;

  const route =
    resolvedTarget.role === "host"
      ? resolvedTarget.gameId
        ? resolveRoomHostRouteComponent(resolvedTarget.gameId)
        : resolveDefaultRoomHostRouteComponent()
      : resolvedTarget.gameId
        ? resolveRoomPlayerRouteComponent(resolvedTarget.gameId)
        : resolveDefaultRoomPlayerRouteComponent();
  if (!route) return <HubScreen navigate={navigate} />;

  const { game, Component } = route;
  return (
    <GameThemeFrame game={game}>
      <Component code={code} navigate={navigate} />
    </GameThemeFrame>
  );
}

function StageRoute({ code, token, navigate }: { code: string; token: string; navigate: (path: string) => void }) {
  const [gameId, setGameId] = useState<GameId | null>(null);
  const [useDefaultStage, setUseDefaultStage] = useState(false);
  const requestId = `stage-route:${code}:${token}`;

  const { connect, send, error } = useRoomSocket((message: ServerMessage, controls) => {
    if (message.type !== "stageStatus" || message.requestId !== requestId) return;

    if (message.valid) setGameId(message.gameId);
    else setUseDefaultStage(true);
    controls.disconnect();
  });

  useEffect(() => {
    if (gameId || useDefaultStage || error) return;

    const socket = connect();
    const inspect = () => send({ type: "inspectStage", requestId, roomCode: code, stageToken: token });
    if (socket.readyState === WebSocket.OPEN) {
      inspect();
    } else {
      socket.addEventListener("open", inspect, { once: true });
    }

    return () => socket.removeEventListener("open", inspect);
  }, [code, connect, error, gameId, requestId, send, token, useDefaultStage]);

  const route = gameId ? resolveStageRouteComponent(gameId) : useDefaultStage || error ? resolveDefaultStageRouteComponent() : null;
  if (!route) return <GameThemeFrame />;

  const { game, Component } = route;
  return (
    <GameThemeFrame game={game}>
      <Component code={code} token={token} navigate={navigate} />
    </GameThemeFrame>
  );
}

function GameThemeFrame({ game, children }: { game?: GameDefinition; children?: ReactNode }) {
  return (
    <div className={gameThemeClassName(game)} style={gameThemeStyle(game)}>
      {children}
    </div>
  );
}

type RoomLookup =
  | { type: "session"; role: "host" | "player"; token: string }
  | { type: "room" };

interface RoomRouteTarget {
  role: "host" | "player";
  gameId?: GameId;
}

function initialRoomLookup(code: string): RoomLookup {
  const hostToken = getStoredHostRoomToken(code);
  if (hostToken) return { type: "session", role: "host", token: hostToken };

  const playerToken = getStoredPlayerRoomToken(code);
  return playerToken ? { type: "session", role: "player", token: playerToken } : { type: "room" };
}

function nextRoomLookupAfterInvalidSession(code: string, lookup: RoomLookup): RoomLookup {
  if (lookup.type === "session" && lookup.role === "host") {
    const playerToken = getStoredPlayerRoomToken(code);
    if (playerToken) return { type: "session", role: "player", token: playerToken };
  }

  return { type: "room" };
}

function roomLookupRequestId(code: string, lookup: RoomLookup) {
  return lookup.type === "session" ? `room-route:${code}:${lookup.role}` : `room-route:${code}`;
}

function inspectRoomRoute(send: RoomSocketControls["send"], code: string, lookup: RoomLookup, requestId: string) {
  if (lookup.type === "session") {
    send({ type: "inspectRoomSession", requestId, roomCode: code, clientToken: lookup.token });
    return;
  }

  send({ type: "inspectRoom", requestId, roomCode: code });
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type Route =
  | { name: "home" }
  | { name: "admin" }
  | { name: "localGame"; gameId: GameId }
  | { name: "createRoom"; gameId: GameId }
  | { name: "joinRoomCode" }
  | { name: "joinRoom"; code: string }
  | { name: "stage"; code: string; token: string };

function useRoute(): Route {
  const [location, setLocation] = useState(() => ({ path: window.location.pathname, revision: 0 }));

  useEffect(() => {
    const onPopState = () => setLocation((current) => ({ path: window.location.pathname, revision: current.revision + 1 }));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return useMemo(() => {
    const { path } = location;
    if (/^\/admin\/?$/i.test(path)) return { name: "admin" };

    const playMatch = path.match(/^\/play\/([a-z0-9-]+)$/i);
    if (playMatch && isGameId(playMatch[1])) return { name: "localGame", gameId: playMatch[1] };
    const createRoomMatch = path.match(/^\/room\/create(?:\/([a-z0-9-]+))?$/i);
    if (createRoomMatch) {
      const gameId = createRoomMatch[1];
      return { name: "createRoom", gameId: gameId && isGameId(gameId) ? gameId : "werewolf" };
    }

    if (/^\/room\/join$/i.test(path)) return { name: "joinRoomCode" };

    const roomMatch = path.match(/^\/room\/([A-Z0-9]+)$/i);
    if (roomMatch) return { name: "joinRoom", code: roomMatch[1].toUpperCase() };

    const stageMatch = path.match(/^\/stage\/([A-Z0-9]+)\/([A-Z0-9]+)$/i);
    if (stageMatch) return { name: "stage", code: stageMatch[1].toUpperCase(), token: stageMatch[2].toUpperCase() };

    return { name: "home" };
  }, [location]);
}

function isGameId(value: string): value is GameId {
  return value === "werewolf" || value === "imposter" || value === "undercover";
}

function routeKey(route: Route) {
  if (route.name === "stage") return `${route.name}:${route.code}:${route.token}`;
  if (route.name === "localGame" || route.name === "createRoom") return `${route.name}:${route.gameId}`;
  return route.name === "joinRoom" ? `${route.name}:${route.code}` : route.name;
}
