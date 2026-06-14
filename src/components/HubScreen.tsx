import { ChevronRight, Clock3, Lock, LogIn, Play, QrCode, RefreshCw, SignalMedium, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { games } from "../games/registry";
import { gameThemeStyle, hubDefaultTheme } from "../games/theme";
import { useI18n } from "../i18n/useI18n";
import type { GameId, RoomPhase, SessionMode } from "../types";
import { GameIcon } from "./GameIcon";
import { HeaderBar } from "./HeaderBar";
import type { TranslationKey } from "../i18n/translations";
import type { ServerMessage } from "../online/messages";
import {
  listStoredRoomSessionCandidates,
  removeStoredRoomSession,
  type StoredRoomSession,
} from "../online/roomSessionStorage";
import { useRoomSocket } from "../online/useRoomSocket";

const SESSION_INSPECT_TIMEOUT_MS = 5_000;

interface HubScreenProps {
  navigate: (path: string) => void;
  initialTab?: HubTab;
}

type HubTab = "games" | "session";

interface HubSessionCard {
  roomCode: string;
  role: "host" | "player";
  gameId: GameId;
  phase: RoomPhase;
  playerCount: number;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  playerName?: string;
}

export function HubScreen({ navigate, initialTab = "games" }: HubScreenProps) {
  const { t } = useI18n();
  const [selectedGameId, setSelectedGameId] = useState<GameId>("werewolf");
  const [mode, setMode] = useState<SessionMode>("room");
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [sessionCards, setSessionCards] = useState<HubSessionCard[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionServerError, setSessionServerError] = useState<string | null>(null);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const pendingSessionsRef = useRef<Map<string, StoredRoomSession>>(new Map());
  const pendingSessionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const currentGame = games.find((game) => game.id === selectedGameId) ?? games[0];
  const otherGames = games.filter((game) => game.id !== currentGame.id);
  const canStart = currentGame.status === "playable";
  const { connect, send, error: roomSocketError } = useRoomSocket((message: ServerMessage) => {
    if (message.type === "roomSessionStatus" && message.requestId) {
      const session = pendingSessionsRef.current.get(message.requestId);
      if (!session) return;

      clearPendingSessionTimer(pendingSessionTimersRef.current, message.requestId);
      pendingSessionsRef.current.delete(message.requestId);
      if (message.valid) {
        setSessionCards((current) => mergeSessionCard(current, roomSessionCard(message)));
      } else {
        removeStoredRoomSession(session);
      }

      if (pendingSessionsRef.current.size === 0) setSessionLoading(false);
    }

    if (message.type === "error" && message.requestId) {
      const session = pendingSessionsRef.current.get(message.requestId);
      if (!session) return;

      clearPendingSessionTimer(pendingSessionTimersRef.current, message.requestId);
      pendingSessionsRef.current.delete(message.requestId);
      setSessionServerError(message.message);
      if (pendingSessionsRef.current.size === 0) setSessionLoading(false);
    }
  });

  useEffect(() => {
    if (activeTab !== "session") return;

    const sessions = listStoredRoomSessionCandidates();
    const pendingSessions = pendingSessionsRef.current;
    const pendingSessionTimers = pendingSessionTimersRef.current;
    let cancelled = false;
    clearPendingSessionTimers(pendingSessionTimers);
    pendingSessions.clear();
    queueMicrotask(() => {
      if (cancelled) return;
      setSessionCards([]);
      setSessionServerError(null);
    });

    if (sessions.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setSessionLoading(false);
      });
      return () => {
        cancelled = true;
        clearPendingSessionTimers(pendingSessionTimers);
        pendingSessions.clear();
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setSessionLoading(true);
    });
    const socket = connect();
    const requestBatch = Date.now();
    const inspectSessions = () => {
      for (const session of sessions) {
        const requestId = `hub-session-${session.role}-${session.roomCode}-${sessionRefreshKey}-${requestBatch}`;
        pendingSessions.set(requestId, session);
        pendingSessionTimers.set(
          requestId,
          setTimeout(() => {
            if (!pendingSessions.has(requestId)) return;
            pendingSessions.delete(requestId);
            pendingSessionTimers.delete(requestId);
            setSessionServerError(t("errors.roomConnection"));
            if (pendingSessions.size === 0) setSessionLoading(false);
          }, SESSION_INSPECT_TIMEOUT_MS),
        );

        const sent = send({ type: "inspectRoomSession", requestId, roomCode: session.roomCode, clientToken: session.token });
        if (!sent) {
          clearPendingSessionTimer(pendingSessionTimers, requestId);
          pendingSessions.delete(requestId);
          setSessionServerError(t("errors.roomConnection"));
        }
      }

      if (pendingSessions.size === 0) setSessionLoading(false);
    };

    if (socket.readyState === WebSocket.OPEN) {
      inspectSessions();
    } else {
      socket.addEventListener("open", inspectSessions, { once: true });
    }

    return () => {
      cancelled = true;
      socket.removeEventListener("open", inspectSessions);
      clearPendingSessionTimers(pendingSessionTimers);
      pendingSessions.clear();
    };
  }, [activeTab, connect, send, sessionRefreshKey, t]);

  const start = () => {
    if (!canStart) return;
    navigate(mode === "room" ? `/room/create/${currentGame.id}` : `/play/${currentGame.id}`);
  };

  return (
    <main className="app-frame hub-screen" style={gameThemeStyle({ theme: hubDefaultTheme })}>
      <HeaderBar />

      <div className="hub-screen-body">
        <section className="segmented-tabs" aria-label={t("common.session")}>
          <button
            className={`segmented-tab ${activeTab === "games" ? "active" : ""}`}
            type="button"
            aria-pressed={activeTab === "games"}
            onClick={() => setActiveTab("games")}
          >
            <GameIcon game={currentGame} />
            <span>{t("common.games")}</span>
          </button>
          <button
            className={`segmented-tab ${activeTab === "session" ? "active" : ""}`}
            type="button"
            aria-pressed={activeTab === "session"}
            onClick={() => setActiveTab("session")}
          >
            <Users />
            <span>{t("common.session")}</span>
          </button>
        </section>

        {activeTab === "games" ? (
          <div className="hub-game-sections">
            <section className="section-block current-game">
              <p className="section-label">{t("common.currentGame")}</p>
              <div className="current-game-layout">
                <GameIcon game={currentGame} size="large" />
                <div>
                  <h2>{t(currentGame.titleKey as TranslationKey)}</h2>
                  <p>{t(currentGame.descriptionKey as TranslationKey)}</p>
                </div>
              </div>
              <div className="game-facts" aria-label={t("common.currentGame")}>
                <span>
                  <Users /> {currentGame.playerRange} {t("common.players")}
                </span>
                <span>
                  <Clock3 /> {currentGame.duration}
                </span>
                <span>
                  <SignalMedium /> {t(currentGame.difficultyKey as TranslationKey)}
                </span>
              </div>
            </section>

            <section className="section-block">
              <p className="section-label">{t("common.otherGames")}</p>
              <div className="list-surface">
                {otherGames.map((game) => (
                  <button
                    className="game-row"
                    key={game.id}
                    type="button"
                    onClick={() => setSelectedGameId(game.id)}
                    disabled={game.status !== "playable"}
                  >
                    <GameIcon game={game} />
                    <span className="row-main">
                      <strong>{t(game.titleKey as TranslationKey)}</strong>
                      <span>{t(game.descriptionKey as TranslationKey)}</span>
                    </span>
                    <span className={`status-label status-${game.id}`}>
                      <Lock /> {t("common.comingSoon")}
                    </span>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            </section>

            <section className="section-block">
              <p className="section-label">{t("common.chooseMode")}</p>
              <div className="mode-list">
                <ModeButton
                  active={mode === "room"}
                  title={t("hub.roomMode")}
                  description={t("hub.roomModeDescription")}
                  icon={<QrCode />}
                  onClick={() => setMode("room")}
                />
                <ModeButton
                  active={mode === "pass-and-play"}
                  title={t("hub.passAndPlay")}
                  description={t("hub.passAndPlayDescription")}
                  icon={<Users />}
                  onClick={() => setMode("pass-and-play")}
                />
              </div>
            </section>
          </div>
        ) : (
          <HubSessionPanel
            cards={sessionCards}
            error={
              roomSocketError
                ? t(roomSocketError === "roomProtocolMismatch" ? "errors.roomProtocolMismatch" : "errors.roomConnection")
                : sessionServerError
            }
            loading={sessionLoading && !roomSocketError}
            navigate={navigate}
            onRefresh={() => setSessionRefreshKey((key) => key + 1)}
          />
        )}
      </div>

      {activeTab === "games" && (
        <footer className="hub-action-footer">
          <div className="hub-action-footer-content">
            <div className="hub-action-footer-actions">
              <button className="primary-action" type="button" onClick={start} disabled={!canStart}>
                <Play />
                {t("hub.startGame", { game: t(currentGame.titleKey as TranslationKey) })}
              </button>
              {mode === "room" && (
                <button className="secondary-button full hub-join-room-action" type="button" onClick={() => navigate("/room/join")} disabled={!canStart}>
                  <LogIn /> {t("hub.joinRoomByCode")}
                </button>
              )}
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}

export function HubSessionPanel({
  cards,
  error,
  loading,
  navigate,
  onRefresh,
}: {
  cards: HubSessionCard[];
  error: string | null;
  loading: boolean;
  navigate: (path: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="section-block hub-session-section">
      <div className="hub-session-heading">
        <div>
          <p className="section-label">{t("common.session")}</p>
          <h2>{t("hub.sessionTitle")}</h2>
          <p>{t("hub.sessionDescription")}</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={onRefresh}>
          <RefreshCw /> {t("hub.sessionRefresh")}
        </button>
      </div>

      {loading ? (
        <section className="panel hub-session-state" aria-live="polite">
          <h3>{t("hub.sessionLoading")}</h3>
        </section>
      ) : error ? (
        <section className="panel hub-session-state" aria-live="polite">
          <h3>{t("hub.sessionUnavailable")}</h3>
          <p>{error}</p>
        </section>
      ) : cards.length > 0 ? (
        <div className="list-surface hub-session-list">
          {cards.map((card) => (
            <HubSessionRoomCard key={`${card.role}-${card.roomCode}`} card={card} navigate={navigate} />
          ))}
        </div>
      ) : (
        <section className="panel hub-session-state">
          <h3>{t("hub.sessionEmptyTitle")}</h3>
          <p>{t("hub.sessionEmptyDescription")}</p>
        </section>
      )}
    </section>
  );
}

function HubSessionRoomCard({ card, navigate }: { card: HubSessionCard; navigate: (path: string) => void }) {
  const { t } = useI18n();
  const game = games.find((candidate) => candidate.id === card.gameId) ?? games[0];

  return (
    <button className="session-room-card" type="button" onClick={() => navigate(`/room/${card.roomCode}`)}>
      <GameIcon game={game} />
      <span className="row-main">
        <strong>
          {t(game.titleKey as TranslationKey)} <span>{card.roomCode}</span>
        </strong>
        <span>
          {roomPhaseLabel(card.phase, t)} / {card.playerCount} {t("common.players")} / {formatRemainingTime(card.expiresAt, t)}
        </span>
        {card.playerName && <span>{t("hub.sessionPlayerName", { name: card.playerName })}</span>}
      </span>
      <span className={`session-role-pill ${card.role}`}>{t(card.role === "host" ? "hub.sessionRoleHost" : "hub.sessionRolePlayer")}</span>
      <ChevronRight />
    </button>
  );
}

function ModeButton({
  active,
  title,
  description,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`mode-button ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span className="mode-icon">{icon}</span>
      <span className="row-main">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="radio-dot" />
      <ChevronRight />
    </button>
  );
}

function roomSessionCard(message: Extract<ServerMessage, { type: "roomSessionStatus"; valid: true }>): HubSessionCard {
  return {
    roomCode: message.roomCode,
    role: message.role,
    gameId: message.gameId,
    phase: message.phase,
    playerCount: message.playerCount,
    createdAt: message.createdAt,
    lastActivityAt: message.lastActivityAt,
    expiresAt: message.expiresAt,
    playerName: message.playerName,
  };
}

function mergeSessionCard(cards: HubSessionCard[], nextCard: HubSessionCard) {
  const existingCard = cards.find((card) => card.roomCode === nextCard.roomCode);
  if (existingCard?.role === "host" && nextCard.role === "player") return cards;

  return sortSessionCards([...cards.filter((card) => card.roomCode !== nextCard.roomCode), nextCard]);
}

function sortSessionCards(cards: HubSessionCard[]) {
  return [...cards].sort((first, second) => second.lastActivityAt - first.lastActivityAt);
}

function clearPendingSessionTimer(timers: Map<string, ReturnType<typeof setTimeout>>, requestId: string) {
  const timer = timers.get(requestId);
  if (!timer) return;
  clearTimeout(timer);
  timers.delete(requestId);
}

function clearPendingSessionTimers(timers: Map<string, ReturnType<typeof setTimeout>>) {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function formatRemainingTime(expiresAt: number, t: ReturnType<typeof useI18n>["t"]) {
  const remainingMs = expiresAt - Date.now();
  const hourMs = 60 * 60 * 1000;
  if (remainingMs <= hourMs) return t("hub.sessionExpiresSoon");
  return t("hub.sessionExpiresIn", { hours: Math.ceil(remainingMs / hourMs) });
}

function roomPhaseLabel(phase: RoomPhase, t: ReturnType<typeof useI18n>["t"]) {
  switch (phase) {
    case "lobby":
      return t("hub.sessionPhaseLobby");
    case "assignment":
      return t("hub.sessionPhaseAssignment");
    case "roleReveal":
      return t("hub.sessionPhaseRoleReveal");
    case "playing":
      return t("hub.sessionPhasePlaying");
    case "ended":
      return t("hub.sessionPhaseEnded");
    default:
      return t("common.unknown");
  }
}
