import { type ReactNode, useEffect, useMemo, useState } from "react";
import { I18nProvider } from "./i18n/I18nProvider";
import { HubScreen } from "./components/HubScreen";
import { LocalWerewolfApp } from "./games/werewolf/components/LocalWerewolfApp";
import { WerewolfRoomHostScreen } from "./games/werewolf/components/WerewolfRoomHostScreen";
import { WerewolfRoomPlayerScreen } from "./games/werewolf/components/WerewolfRoomPlayerScreen";
import { WerewolfStageScreen } from "./games/werewolf/components/WerewolfStageScreen";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { getGameDefinition } from "./games/registry";
import { gameThemeClassName, gameThemeStyle } from "./games/theme";
import type { GameDefinition } from "./games/types";
import type { GameId } from "./types";

export function App() {
  const route = useRoute();

  return (
    <I18nProvider>
      <AppErrorBoundary resetKey={routeKey(route)}>
        {route.name === "home" && <HubScreen navigate={navigate} />}
        {route.name === "localGame" && <LocalGameRoute gameId={route.gameId} navigate={navigate} />}
        {route.name === "createRoom" && <CreateRoomRoute gameId={route.gameId} navigate={navigate} />}
        {route.name === "joinRoomCode" && <JoinRoomCodeRoute navigate={navigate} />}
        {route.name === "joinRoom" && <RoomRouteScreen code={route.code} navigate={navigate} />}
        {route.name === "stage" && <StageRoute code={route.code} token={route.token} navigate={navigate} />}
      </AppErrorBoundary>
    </I18nProvider>
  );
}

function LocalGameRoute({ gameId, navigate }: { gameId: GameId; navigate: (path: string) => void }) {
  const game = getGameDefinition(gameId);

  if (game?.id !== "werewolf" || game.status !== "playable") return <HubScreen navigate={navigate} />;

  return (
    <GameThemeFrame game={game}>
      <LocalWerewolfApp navigate={navigate} />
    </GameThemeFrame>
  );
}

function CreateRoomRoute({ gameId, navigate }: { gameId: GameId; navigate: (path: string) => void }) {
  const game = getGameDefinition(gameId);

  if (game?.id !== "werewolf" || game.status !== "playable") return <HubScreen navigate={navigate} />;

  return (
    <GameThemeFrame game={game}>
      <WerewolfRoomHostScreen gameId={game.id} navigate={navigate} />
    </GameThemeFrame>
  );
}

function JoinRoomCodeRoute({ navigate }: { navigate: (path: string) => void }) {
  return (
    <GameThemeFrame game={getGameDefinition("werewolf")}>
      <WerewolfRoomPlayerScreen navigate={navigate} />
    </GameThemeFrame>
  );
}

function RoomRouteScreen({ code, navigate }: { code: string; navigate: (path: string) => void }) {
  const hostToken = localStorage.getItem(`tablegather-room-${code}-host`);
  return (
    <GameThemeFrame game={getGameDefinition("werewolf")}>
      {hostToken ? (
        <WerewolfRoomHostScreen code={code} navigate={navigate} />
      ) : (
        <WerewolfRoomPlayerScreen code={code} navigate={navigate} />
      )}
    </GameThemeFrame>
  );
}

function StageRoute({ code, token, navigate }: { code: string; token: string; navigate: (path: string) => void }) {
  return (
    <GameThemeFrame game={getGameDefinition("werewolf")}>
      <WerewolfStageScreen code={code} token={token} navigate={navigate} />
    </GameThemeFrame>
  );
}

function GameThemeFrame({ game, children }: { game?: GameDefinition; children: ReactNode }) {
  return (
    <div className={gameThemeClassName(game)} style={gameThemeStyle(game)}>
      {children}
    </div>
  );
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type Route =
  | { name: "home" }
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
  return route.name === "joinRoom" ? `${route.name}:${route.code}` : route.name;
}
