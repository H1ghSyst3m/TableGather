import { Eye, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { roleDefinitions } from "../domain/roles";
import type { RoleId } from "../domain/types";
import { useI18n } from "../../../i18n/useI18n";
import type { ServerMessage } from "../../../online/messages";
import { useRoomSocket } from "../../../online/useRoomSocket";
import { normalizePlayerName } from "../../../playerNames";
import { resolveGameTheme } from "../../theme";
import type { WerewolfPlayerRoomSnapshot } from "../roomTypes";
import { werewolfTheme } from "../theme";
import { RoleRevealScreen } from "./RoleRevealScreen";
import { GameRulesButton } from "./RoleRulesModal";
import { WerewolfFlowShell } from "./WerewolfFlowShell";

type JoinRoomStatus = "idle" | "checking" | "joinable" | "notFound" | "started";

const werewolfAssets = resolveGameTheme({ theme: werewolfTheme }).assets;

export function WerewolfRoomPlayerScreen({ code: initialCode = "", navigate }: { code?: string; navigate: (path: string) => void }) {
  const { t } = useI18n();
  const initialRoomCode = normalizeRoomCode(initialCode);
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode);
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WerewolfPlayerRoomSnapshot | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(initialRoomCode || null);
  const [roomStatus, setRoomStatus] = useState<JoinRoomStatus>(initialRoomCode ? "checking" : "idle");
  const [roomPlayerCount, setRoomPlayerCount] = useState<number | null>(null);
  const [roleCardOpen, setRoleCardOpen] = useState(false);
  const roomCode = normalizeRoomCode(roomCodeInput);

  const { connect, send, error } = useRoomSocket((message: ServerMessage, socket) => {
    if (message.type === "roomStatus" && message.roomCode === pendingCode) {
      setRoomPlayerCount(message.playerCount ?? null);
      setRoomStatus(!message.exists ? "notFound" : message.joinable ? "joinable" : "started");
      setServerError(null);
    }
    if (message.type === "connected" && message.role === "player") {
      setToken(message.clientToken);
      localStorage.setItem(playerStorageKey(message.roomCode), message.clientToken);
      setRoomCodeInput(message.roomCode);
      setServerError(null);
      if (window.location.pathname !== `/room/${message.roomCode}`) navigate(`/room/${message.roomCode}`);
    }
    if (message.type === "connected" && message.role === "host") {
      localStorage.removeItem(playerStorageKey(message.roomCode));
      localStorage.setItem(hostStorageKey(message.roomCode), message.clientToken);
      localStorage.setItem("tablegather-current-host-room", message.roomCode);
      setToken(null);
      setSnapshot(null);
      setServerError(null);
      socket.disconnect();
      navigate(`/room/${message.roomCode}`);
    }
    if (message.type === "snapshot" && (message.snapshot as WerewolfPlayerRoomSnapshot).audience === "player") {
      setSnapshot(message.snapshot as WerewolfPlayerRoomSnapshot);
    }
    if (message.type === "roomClosed" || message.type === "kicked") {
      if (roomCode) localStorage.removeItem(playerStorageKey(roomCode));
      setToken(null);
      setSnapshot(null);
      navigate("/");
    }
    if (message.type === "error") {
      setServerError(message.message);
      if (message.message === "Room not found.") setRoomStatus("notFound");
      if (message.message === "The room is already in game.") setRoomStatus("started");
      if (isStalePlayerSessionError(message.message)) {
        if (roomCode) localStorage.removeItem(playerStorageKey(roomCode));
        setToken(null);
        setSnapshot(null);
        if (message.message !== "Room not found.") setRoomStatus("joinable");
      }
    }
  });

  useEffect(() => {
    if (roomCode.length !== 4) return;

    const socket = connect();
    const storedToken = localStorage.getItem(playerStorageKey(roomCode));
    const inspectOrResume = () => {
      if (storedToken) send({ type: "resumeRoom", roomCode, clientToken: storedToken });
      else send({ type: "inspectRoom", roomCode });
    };

    if (socket.readyState === WebSocket.OPEN) {
      inspectOrResume();
      return;
    }

    socket.addEventListener("open", inspectOrResume, { once: true });
    return () => socket.removeEventListener("open", inspectOrResume);
  }, [connect, roomCode, send]);

  const join = () => {
    const trimmedName = normalizePlayerName(name);
    if (!trimmedName) {
      setServerError(t("errors.nameRequired"));
      return;
    }
    if (roomCode.length !== 4) return;
    if (roomStatus !== "joinable") return;
    send({ type: "joinRoom", roomCode, payload: { name: trimmedName } });
  };
  const settingsActions = <GameRulesButton options={snapshot?.options} />;
  const displayError =
    serverError ? translateRoomServerError(serverError, t) : error ? t(error === "roomProtocolMismatch" ? "errors.roomProtocolMismatch" : "errors.roomConnection") : null;
  const canJoin = roomStatus === "joinable" && !error;
  const hasName = Boolean(normalizePlayerName(name));
  const canSubmit = roomCode.length === 4 && canJoin && hasName;

  if (!snapshot) {
    return (
      <WerewolfFlowShell
        title={t("werewolf.joinRoom")}
        onBack={() => navigate("/")}
        settingsActions={settingsActions}
        footer={
          <button className="primary-action" type="submit" form="werewolf-player-join-form" disabled={!canSubmit}>
            {t("werewolf.joinRoom")}
          </button>
        }
      >
        <section className="player-join-screen room-code-entry-screen">
          {werewolfAssets.logo && (
            <span className="werewolf-brand-mark" aria-hidden="true">
              <img src={werewolfAssets.logo} alt="" />
            </span>
          )}
          <div className="player-join-hero">
            <p className="section-label">{t("werewolf.roomCode")}</p>
            <h2>{t("werewolf.enterRoomCodeTitle")}</h2>
            <p>{t("werewolf.enterRoomCodeAndNamePrompt")}</p>
          </div>
          <form
            id="werewolf-player-join-form"
            className="player-join-form room-code-entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              join();
            }}
          >
            <label>
              <span>{t("werewolf.roomCode")}</span>
              <span className="room-code-input-row">
                <QrCode />
                <input
                  value={roomCodeInput}
                  onChange={(event) => {
                    const nextCode = normalizeRoomCode(event.target.value);
                    setRoomCodeInput(nextCode);
                    setServerError(null);

                    if (nextCode.length === 4) {
                      setPendingCode(nextCode);
                      setRoomStatus("checking");
                      setRoomPlayerCount(null);
                      return;
                    }

                    setPendingCode(null);
                    setRoomStatus("idle");
                    setRoomPlayerCount(null);
                  }}
                  placeholder={t("werewolf.roomCodePlaceholder")}
                  aria-label={t("werewolf.roomCode")}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={4}
                />
              </span>
            </label>
            <label>
              <span>{t("common.name")}</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setServerError(null);
                }}
                placeholder={t("common.name")}
                autoComplete="name"
              />
            </label>
            {roomStatus !== "idle" && (
              <span className={`room-status-pill ${roomStatus}`}>{roomStatusText(roomStatus, roomPlayerCount, t)}</span>
            )}
          </form>
          {displayError && <p className="error-text">{displayError}</p>}
          {error === "roomProtocolMismatch" && <p>{t("errors.roomProtocolMismatchHint")}</p>}
        </section>
      </WerewolfFlowShell>
    );
  }

  const roleId = snapshot.self.roleId as RoleId | undefined;
  const originalRoleId = snapshot.self.originalRoleId as RoleId | undefined;
  const alphaWolfInfected = snapshot.self.alphaWolfInfected === true;
  const role = roleId ? roleDefinitions[roleId] : null;
  const activeRoomCode = snapshot.code;
  const activeToken = token ?? localStorage.getItem(playerStorageKey(activeRoomCode));

  if (snapshot.phase === "roleReveal" && role && !snapshot.self.seenRole && activeToken) {
    return (
      <RoleRevealScreen
        players={[{ id: snapshot.self.id, name: snapshot.self.name, roleId: roleId as RoleId, originalRoleId, alphaWolfInfected }]}
        doneLabel={t("werewolf.roleSeen")}
        instruction={t("werewolf.dragRevealHint")}
        showRoleInfo
        showRoleInfoIdentity={false}
        onDone={() => send({ type: "playerCommand", roomCode: activeRoomCode, clientToken: activeToken, payload: { type: "markRoleSeen" } })}
        layout={({ screen, footer }) => (
          <WerewolfFlowShell title={t("werewolf.roleReveal")} onBack={() => navigate("/")} settingsActions={settingsActions} footer={footer}>
            {screen}
          </WerewolfFlowShell>
        )}
      />
    );
  }

  if (roleCardOpen && role) {
    return (
      <RoleRevealScreen
        players={[{ id: snapshot.self.id, name: snapshot.self.name, roleId: roleId as RoleId, originalRoleId, alphaWolfInfected }]}
        title={t("werewolf.privateRole")}
        doneLabel={t("common.close")}
        instruction={t("werewolf.privateRoleInstruction")}
        showRoleInfo
        showRoleInfoIdentity={false}
        onDone={() => setRoleCardOpen(false)}
        layout={({ screen, footer }) => (
          <WerewolfFlowShell title={t("werewolf.privateRole")} onBack={() => setRoleCardOpen(false)} settingsActions={settingsActions} footer={footer}>
            {screen}
          </WerewolfFlowShell>
        )}
      />
    );
  }

  return (
    <WerewolfFlowShell
      title={snapshot.phase === "lobby" || snapshot.phase === "assignment" ? t("werewolf.roomWaiting") : t("werewolf.privateRole")}
      onBack={() => navigate("/")}
      settingsActions={settingsActions}
      footer={
        role ? (
          <button className="primary-action compact" type="button" onClick={() => setRoleCardOpen(true)}>
            <Eye /> {t("werewolf.showMyRole")}
          </button>
        ) : null
      }
    >
      <section className="role-reveal-card player-role-card">
        {role ? (
          <>
            <h2>{snapshot.self.name}</h2>
            <p>{t(snapshot.phase === "roleReveal" ? "werewolf.roleRevealWaiting" : "werewolf.privateRoleReady")}</p>
          </>
        ) : (
          <p>{t("werewolf.roleCardLocked")}</p>
        )}
      </section>

      {snapshot.winner && (
        <section className="panel">
          <h2>{snapshot.winner === "werewolves" ? t("werewolf.winnerWerewolves") : t("werewolf.winnerVillagers")}</h2>
        </section>
      )}

      <section className="panel player-status-panel">
        <div className="panel-heading">
          <h3>{t("werewolf.playerStatus")}</h3>
        </div>
        <div className="player-table">
          {snapshot.players.map((player) => (
            <div className="player-row" key={player.id}>
              <span>
                <strong>{player.name}</strong>
                <small>{player.connected ? t("common.connected") : t("common.disconnected")}</small>
              </span>
              <span className={player.alive === false ? "error-text" : "valid-text"}>
                {player.alive === undefined
                  ? t("common.waiting")
                  : player.alive === false
                    ? t("common.eliminated")
                    : t("common.alive")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </WerewolfFlowShell>
  );
}

function isStalePlayerSessionError(message: string) {
  return message === "Session not found." || message === "Player session not found." || message === "Room not found.";
}

function normalizeRoomCode(value: string) {
  const roomMatch = value.toUpperCase().match(/ROOM\/([A-Z0-9]{1,4})/);
  if (roomMatch) return roomMatch[1];
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function playerStorageKey(code: string) {
  return `tablegather-room-${code}-player`;
}

function hostStorageKey(code: string) {
  return `tablegather-room-${code}-host`;
}

function roomStatusText(status: JoinRoomStatus, playerCount: number | null, t: ReturnType<typeof useI18n>["t"]) {
  if (status === "checking") return t("werewolf.roomChecking");
  if (status === "notFound") return t("errors.roomNotFoundClosed");
  if (status === "started") return t("errors.roomAlreadyStarted");
  return playerCount === null ? t("werewolf.roomJoinable") : t("werewolf.roomJoinableWithCount", { count: playerCount });
}

function translateRoomServerError(message: string, t: ReturnType<typeof useI18n>["t"]) {
  if (message === "Name is required.") return t("errors.nameRequired");
  if (message === "Name is already taken.") return t("errors.nameAlreadyTaken");
  if (message === "Room not found.") return t("errors.roomNotFoundClosed");
  if (message === "The room is already in game.") return t("errors.roomAlreadyStarted");
  return message;
}
