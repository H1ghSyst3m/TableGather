import QRCode from "qrcode";
import { Ban, Copy, Dice5, Monitor, QrCode, RotateCcw, Shuffle, Users, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  autoFillVillagers,
  createDefaultRoleCounts,
  roleCountTotal,
  sanitizeRoleCount,
  validateRoleCounts,
} from "../domain/setup";
import { roleDefinitions, roleOrder } from "../domain/roles";
import type { RoleCounts, RoleId, WerewolfOptions, WerewolfState } from "../domain/types";
import { useI18n } from "../../../i18n/useI18n";
import type { ServerMessage } from "../../../online/messages";
import { useRoomSocket, type RoomSocketControls } from "../../../online/useRoomSocket";
import type { HostCommand } from "../../../online/messages";
import {
  getStoredHostRoomToken,
  removeHostRoomSession,
  removeRoomSessions,
  saveHostRoomSession,
} from "../../../online/roomSessionStorage";
import type { WerewolfHostRoomSnapshot } from "../roomTypes";
import type { GameId, Locale } from "../../../types";
import { GameConfirmDialog } from "../../../components/GameConfirmDialog";
import { copyText } from "../../../clipboard";
import { RoleCountEditor } from "./RoleCountEditor";
import { GameRulesEditor } from "./GameRulesEditor";
import { GameRulesButton } from "./RoleRulesModal";
import { WerewolfFlowShell, type WerewolfSettingsActionsControls } from "./WerewolfFlowShell";
import { WerewolfPlaySurface } from "./WerewolfPlaySurface";
import { loadWerewolfHostOptions, saveWerewolfHostOptionsPatch } from "../hostOptionsStorage";
import { StageLanguageControl, StageLinkPanel } from "./StageLinkPanel";
import { WerewolfPreparationShell } from "./WerewolfPreparationShell";

export function WerewolfRoomHostScreen({
  code,
  gameId = "werewolf",
  navigate,
}: {
  code?: string;
  gameId?: GameId;
  navigate: (path: string) => void;
}) {
  const { locale, t } = useI18n();
  const [snapshot, setSnapshot] = useState<WerewolfHostRoomSnapshot | null>(null);
  const [token, setToken] = useState<string | null>(() => (code ? getStoredHostRoomToken(code) : null));
  const [qr, setQr] = useState<string | null>(null);
  const [stageQr, setStageQr] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [stageSettingsOpen, setStageSettingsOpen] = useState(false);
  const [abortOpen, setAbortOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [counts, setCounts] = useState<RoleCounts>(() => createDefaultRoleCounts(5));
  const [options, setOptions] = useState<WerewolfOptions>(() => ({ ...loadWerewolfHostOptions(), roleReveal: true }));
  const setupDraftRef = useRef<{ roleCounts: RoleCounts; options: WerewolfOptions }>({ roleCounts: counts, options });
  const joinLink = snapshot ? `${window.location.origin}/room/${snapshot.code}` : "";
  const stageLink = snapshot?.stageToken ? `${window.location.origin}/stage/${snapshot.code}/${snapshot.stageToken}` : "";
  const stageLocale = snapshot?.stageLocale ?? locale;
  const createRoomSentRef = useRef(false);

  const openHostSession = useCallback(
    (sendMessage: RoomSocketControls["send"]) => {
      const storedToken = code ? getStoredHostRoomToken(code) : null;
      if (code) {
        if (storedToken) sendMessage({ type: "resumeRoom", roomCode: code, clientToken: storedToken });
        else navigate(`/room/${code}`);
        return;
      }

      if (createRoomSentRef.current) return;
      if (sendMessage({ type: "createRoom", payload: { gameId } })) createRoomSentRef.current = true;
    },
    [code, gameId, navigate],
  );

  const { connect, send, connected, error } = useRoomSocket((message: ServerMessage, socket) => {
    if (message.type === "connected" && message.role === "host") {
      setToken(message.clientToken);
      saveHostRoomSession(message.roomCode, message.clientToken);
      if (window.location.pathname !== `/room/${message.roomCode}`) replaceRoute(`/room/${message.roomCode}`);
    }
    if (message.type === "snapshot" && (message.snapshot as WerewolfHostRoomSnapshot).audience === "host") {
      const nextSnapshot = message.snapshot as WerewolfHostRoomSnapshot;
      setSnapshot(nextSnapshot);
      if (nextSnapshot.phase === "lobby" || nextSnapshot.phase === "setup" || nextSnapshot.phase === "assignment") {
        setupDraftRef.current = { roleCounts: nextSnapshot.roleCounts, options: nextSnapshot.options };
        setCounts(nextSnapshot.roleCounts);
        setOptions(nextSnapshot.options);
      }
    }
    if (message.type === "hostTransferred") {
      removeHostRoomSession(message.roomCode);
      setSnapshot(null);
      setToken(null);
      setServerError(null);
      socket.disconnect();
      navigate(`/room/${message.roomCode}`);
    }
    if (message.type === "roomClosed") {
      const closedRoomCode = snapshot?.code ?? code;
      if (closedRoomCode) {
        removeRoomSessions(closedRoomCode);
      }
      navigate("/");
    }
    if (message.type === "error") {
      setServerError(message.message);
      const staleHostSession = message.message === "Host session not found." || message.message === "Session not found.";
      if (code && (!snapshot || staleHostSession)) {
        removeRoomSessions(code);
        setToken(null);
        setSnapshot(null);
        navigate(`/room/${code}`);
      }
    }
  }, { autoReconnect: true, onOpen: ({ send: sendMessage }) => openHostSession(sendMessage) });

  useEffect(() => {
    const socket = connect();
    if (socket.readyState === WebSocket.OPEN) openHostSession(send);
  }, [connect, openHostSession, send]);

  useEffect(() => {
    if (!joinLink) return;
    QRCode.toDataURL(joinLink, { margin: 2, width: 320 }).then(setQr).catch(() => setQr(null));
  }, [joinLink]);

  useEffect(() => {
    if (!stageLink) return;
    QRCode.toDataURL(stageLink, { margin: 2, width: 320 }).then(setStageQr).catch(() => setStageQr(null));
  }, [stageLink]);

  const playerCount = snapshot?.players.length ?? 0;
  const visibleCounts = useMemo(() => {
    const filledCounts = autoFillVillagers(counts, playerCount);
    const validation = validateRoleCounts(playerCount, filledCounts);
    return validation.valid ? filledCounts : createDefaultRoleCounts(Math.max(playerCount, 5));
  }, [counts, playerCount]);
  const validation = useMemo(() => validateRoleCounts(playerCount, visibleCounts), [playerCount, visibleCounts]);

  const hostCommand = (payload: HostCommand) => {
    if (!snapshot) return;
    const activeToken = token ?? getStoredHostRoomToken(snapshot.code);
    if (!activeToken) return;
    setServerError(null);
    const message = { type: "hostCommand" as const, roomCode: snapshot.code, clientToken: activeToken, payload };
    const socket = connect();
    const sendAsCurrentHost = () => {
      send({ type: "resumeRoom", roomCode: snapshot.code, clientToken: activeToken });
      send(message);
    };

    if (socket.readyState === WebSocket.OPEN) {
      sendAsCurrentHost();
      return;
    }

    socket.addEventListener("open", sendAsCurrentHost, { once: true });
  };
  const rulesOptions =
    (snapshot?.gameState as WerewolfState | null)?.options ?? (snapshot?.phase === "lobby" ? options : snapshot?.options ?? options);
  const updateCounts = (nextCounts: RoleCounts) => {
    const roleCounts = autoFillVillagers(nextCounts, playerCount);
    const draft = { roleCounts, options: setupDraftRef.current.options };
    setupDraftRef.current = draft;
    setCounts(nextCounts);
    if (snapshot?.phase === "setup") {
      hostCommand({ type: "updateSetup", roleCounts: draft.roleCounts, options: draft.options });
    }
  };
  const updateOptions = (nextOptions: WerewolfOptions) => {
    const roomOptions = { ...nextOptions, roleReveal: true };
    const draft = { roleCounts: setupDraftRef.current.roleCounts, options: roomOptions };
    setupDraftRef.current = draft;
    setOptions(roomOptions);
    saveWerewolfHostOptionsPatch({ winMode: roomOptions.winMode, revealMode: roomOptions.revealMode });
    if (snapshot?.phase === "setup") {
      hostCommand({ type: "updateSetup", roleCounts: draft.roleCounts, options: draft.options });
    }
  };
  const createStageLink = () => hostCommand({ type: "createStageLink", stageLocale });
  const setStageLocale = (nextLocale: Locale) => hostCommand({ type: "setStageLocale", stageLocale: nextLocale });
  const settingsActions = ({ closeSettings }: WerewolfSettingsActionsControls) => (
    <HostSettingsActions
      options={rulesOptions}
      stageLink={stageLink}
      showAbort={Boolean(snapshot && (snapshot.phase === "roleReveal" || snapshot.phase === "playing" || snapshot.phase === "ended"))}
      showClose={Boolean(snapshot)}
      onAbort={() => setAbortOpen(true)}
      onCloseRoom={() => setCloseOpen(true)}
      onOpenStageSettings={() => {
        closeSettings();
        setStageSettingsOpen(true);
      }}
      onCreateStageLink={() => {
        closeSettings();
        createStageLink();
      }}
    />
  );
  const stageSettingsDialog = stageSettingsOpen ? (
    <StageSettingsDialog
      stageLink={stageLink}
      stageLocale={stageLocale}
      onClose={() => setStageSettingsOpen(false)}
      onCreateStageLink={createStageLink}
      onDisableStageLink={() => hostCommand({ type: "disableStageLink" })}
      onStageLocaleChange={setStageLocale}
    />
  ) : null;
  const confirmDialogs = snapshot ? (
    <>
      {stageSettingsDialog}
      {abortOpen && (
        <GameConfirmDialog
          title={t("werewolf.abortGameTitle")}
          description={t("werewolf.abortGameDescription")}
          cancelLabel={t("werewolf.keepPlaying")}
          confirmLabel={t("werewolf.backToLobby")}
          onCancel={() => setAbortOpen(false)}
          onConfirm={() => {
            hostCommand({ type: "resetToLobby" });
            setAbortOpen(false);
          }}
        />
      )}
      {closeOpen && (
        <GameConfirmDialog
          title={t("werewolf.closeRoomTitle")}
          description={t("werewolf.closeRoomDescription")}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("werewolf.closeRoom")}
          danger
          onCancel={() => setCloseOpen(false)}
          onConfirm={() => {
            hostCommand({ type: "closeRoom" });
            setCloseOpen(false);
          }}
        />
      )}
    </>
  ) : stageSettingsDialog;

  if (error) {
    return (
      <WerewolfFlowShell title={t("werewolf.roomCode")} onBack={() => navigate("/")} settingsActions={settingsActions}>
        <section className="panel">
          <h2>{t(error === "roomProtocolMismatch" ? "errors.roomProtocolMismatch" : "errors.roomConnection")}</h2>
          {error === "roomProtocolMismatch" && <p>{t("errors.roomProtocolMismatchHint")}</p>}
        </section>
      </WerewolfFlowShell>
    );
  }

  if (!snapshot) {
    return (
      <WerewolfFlowShell title={t("werewolf.createRoom")} onBack={() => navigate("/")} settingsActions={settingsActions}>
        <section className="panel">
          <h2>{connected ? t("werewolf.createRoom") : t("common.waiting")}</h2>
        </section>
      </WerewolfFlowShell>
    );
  }

  if (snapshot.phase === "assignment") {
    const complete = isAssignmentComplete(snapshot);
    const assignmentFooter = snapshot.assignMode === "random" ? (
      <div className="werewolf-flow-action-stack">
        <button className="primary-action" type="button" disabled={!complete} onClick={() => hostCommand({ type: "startGame" })}>
          {t("werewolf.startGame")}
        </button>
        <button className="secondary-button full" type="button" onClick={() => hostCommand({ type: "shuffleRoles" })}>
          <Shuffle /> {t("werewolf.reshuffle")}
        </button>
      </div>
    ) : snapshot.assignMode === "manual" ? (
      <button className="primary-action" type="button" disabled={!complete} onClick={() => hostCommand({ type: "startGame" })}>
        {complete ? t("werewolf.startGame") : t("werewolf.assignmentIncomplete")}
      </button>
    ) : null;

    return (
      <WerewolfFlowShell
        key="preparation-4"
        title={t("werewolf.setupAssignmentTitle")}
        onBack={() =>
          snapshot.assignMode
            ? hostCommand({ type: "setAssignMode", assignMode: null })
            : hostCommand({ type: "returnToRules" })
        }
        settingsActions={settingsActions}
        footer={assignmentFooter}
      >
        <WerewolfPreparationShell step={4} description={t("werewolf.roleAssignmentSubtitle")}>
          <RoomAssignmentPanel
            snapshot={snapshot}
            onSetAssignMode={(assignMode) => hostCommand({ type: "setAssignMode", assignMode })}
            onManualAssignment={(assignment) => hostCommand({ type: "setManualAssignment", assignment })}
          />
        </WerewolfPreparationShell>
        {confirmDialogs}
      </WerewolfFlowShell>
    );
  }

  if (snapshot.phase === "setup") {
    if (snapshot.preparationStep === "rules") {
      return (
        <WerewolfFlowShell
          key="preparation-3"
          title={t("werewolf.gameRules")}
          onBack={() => hostCommand({ type: "returnToRoleSelection" })}
          settingsActions={settingsActions}
          footer={
            <>
              <button
                className="primary-action"
                type="button"
                disabled={!validation.valid}
                onClick={() => hostCommand({ type: "prepareAssignment" })}
              >
                {snapshot.players.length < 5 ? t("werewolf.minPlayers") : t("werewolf.nextAssignment")}
              </button>
              {serverError && <p className="error-text">{serverError}</p>}
            </>
          }
        >
          <WerewolfPreparationShell step={3} description={t("werewolf.gameRulesStepSubtitle")}>
            <GameRulesEditor options={options} onChange={updateOptions} showRoleRevealOption={false} />
          </WerewolfPreparationShell>
          {confirmDialogs}
        </WerewolfFlowShell>
      );
    }

    return (
      <WerewolfFlowShell
        key="preparation-2"
        title={t("werewolf.roleSelectionTitle")}
        onBack={() => hostCommand({ type: "returnToPlayerLobby" })}
        settingsActions={settingsActions}
        footer={
          <>
            <button
              className="primary-action"
              type="button"
              disabled={!validation.valid}
              onClick={() => hostCommand({ type: "continueToRules" })}
            >
              {snapshot.players.length < 5 ? t("werewolf.minPlayers") : t("werewolf.nextRules")}
            </button>
            {serverError && <p className="error-text">{serverError}</p>}
          </>
        }
      >
        <WerewolfPreparationShell step={2} description={t("werewolf.roleSelectionSubtitle")}>
          <RoleCountEditor playerCount={snapshot.players.length} counts={visibleCounts} onChange={updateCounts} />
        </WerewolfPreparationShell>
        {confirmDialogs}
      </WerewolfFlowShell>
    );
  }

  if (snapshot.phase === "roleReveal") {
    const gameState = snapshot.gameState;
    const seen = gameState?.players.filter((player) => player.seenRole).length ?? 0;
    const total = gameState?.players.length ?? 0;

    return (
      <WerewolfFlowShell title={t("werewolf.roleReveal")} onBack={() => navigate("/")} settingsActions={settingsActions}>
        <section className="panel">
          <div className="panel-heading">
            <h3>{t("werewolf.playerStatus")}</h3>
            <span>{t("werewolf.roleRevealProgress", { seen, total })}</span>
          </div>
          <PlayerStatus players={snapshot.players} />
        </section>
        {confirmDialogs}
      </WerewolfFlowShell>
    );
  }

  if (snapshot.phase === "playing" || snapshot.phase === "ended") {
    const gameState = snapshot.gameState as WerewolfState;

    return (
      <>
        <WerewolfPlaySurface
          state={gameState}
          serverTime={snapshot.serverTime}
          canUndo={snapshot.canUndo}
          onBack={() => navigate("/")}
          settingsActions={settingsActions}
          actions={{
            setProtectedPlayer: (playerId) => hostCommand({ type: "setProtectedPlayer", playerId }),
            setNightGuestHost: (playerId) => hostCommand({ type: "setNightGuestHost", playerId }),
            setWildChildModel: (playerId) => hostCommand({ type: "setWildChildModel", playerId }),
            setCupidTargets: (playerIds) => hostCommand({ type: "setCupidTargets", playerIds }),
            setInspectedPlayer: (playerId) => hostCommand({ type: "setInspectedPlayer", playerId }),
            setAuraTarget: (playerId) => hostCommand({ type: "setAuraTarget", playerId }),
            setDetectiveTargets: (playerIds) => hostCommand({ type: "setDetectiveTargets", playerIds }),
            revealNightResult: (step) => hostCommand({ type: "revealNightResult", step }),
            setWolfTarget: (playerId) => hostCommand({ type: "setWolfTarget", playerId }),
            setAlphaWolfTransform: (value) => hostCommand({ type: "setAlphaWolfTransform", value }),
            setDoctorHealTonight: (value) => hostCommand({ type: "setDoctorHealTonight", value }),
            setWitchHealTonight: (value) => hostCommand({ type: "setWitchHealTonight", value }),
            setWitchPoisonTarget: (playerId) => hostCommand({ type: "setWitchPoisonTarget", playerId }),
            advanceNightStep: () => hostCommand({ type: "advanceNightStep" }),
            advancePublicEvent: () => hostCommand({ type: "advancePublicEvent" }),
            resolveNight: () => hostCommand({ type: "resolveNight" }),
            resolveHunterShot: (playerId) => hostCommand({ type: "resolveHunterShot", playerId }),
            eliminateByVote: (playerId) => hostCommand({ type: "eliminateByVote", playerId }),
            startDay: () => hostCommand({ type: "startDay" }),
            setDayTimerDuration: (durationSeconds) => hostCommand({ type: "setDayTimerDuration", durationSeconds }),
            startDayTimer: () => hostCommand({ type: "startDayTimer" }),
            pauseDayTimer: () => hostCommand({ type: "pauseDayTimer" }),
            resetDayTimer: () => hostCommand({ type: "resetDayTimer" }),
            startNextNight: () => hostCommand({ type: "startNextNight" }),
            undoStep: () => hostCommand({ type: "undoStep" }),
            reset: () => hostCommand({ type: "resetToLobby" }),
          }}
          roomPlayers={snapshot.players}
        />
        {confirmDialogs}
      </>
    );
  }

  return (
    <WerewolfFlowShell
      key="preparation-1"
      title={t("werewolf.playerLobbyTitle")}
      onBack={() => navigate("/")}
      settingsActions={settingsActions}
      footer={
        <>
          <button
            className="primary-action"
            type="button"
            disabled={!validation.valid}
            onClick={() => hostCommand({ type: "beginSetup", roleCounts: visibleCounts, options: { ...options, roleReveal: true } })}
          >
            {snapshot.players.length < 5 ? t("werewolf.minPlayers") : t("werewolf.nextRoles")}
          </button>
          {serverError && <p className="error-text">{serverError}</p>}
        </>
      }
    >
      <WerewolfPreparationShell step={1} description={t("werewolf.roomLobbySubtitle")}>
        <RoomHeader code={snapshot.code} qr={qr} joinLink={joinLink} />
        <StageLinkPanel
          stageLink={stageLink}
          qr={stageQr}
          stageLocale={stageLocale}
          onCreate={createStageLink}
          onDisable={() => hostCommand({ type: "disableStageLink" })}
          onStageLocaleChange={setStageLocale}
        />

        <section className="panel">
          <div className="panel-heading">
            <h3>{t("werewolf.playerStatus")}</h3>
            <span>
              <Users /> {snapshot.players.length}
            </span>
          </div>
          <PlayerStatus players={snapshot.players} onKick={(playerId) => hostCommand({ type: "kickPlayer", playerId })} />
        </section>

        <HostTransferPanel
          players={snapshot.players}
          error={serverError}
          open={transferOpen}
          onToggle={() => setTransferOpen((open) => !open)}
          onTransfer={(playerId) => {
            hostCommand({ type: "transferHost", playerId });
          }}
        />
      </WerewolfPreparationShell>

      {confirmDialogs}
    </WerewolfFlowShell>
  );
}

function HostSettingsActions({
  options,
  stageLink,
  showAbort,
  showClose,
  onAbort,
  onCloseRoom,
  onOpenStageSettings,
  onCreateStageLink,
}: {
  options: WerewolfOptions;
  stageLink: string;
  showAbort: boolean;
  showClose: boolean;
  onAbort: () => void;
  onCloseRoom: () => void;
  onOpenStageSettings: () => void;
  onCreateStageLink: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <GameRulesButton options={options} />
      <button className="text-button" type="button" onClick={stageLink ? onOpenStageSettings : onCreateStageLink}>
        <Monitor /> {stageLink ? t("werewolf.stageMode") : t("werewolf.createStageLink")}
      </button>
      {showAbort && (
        <button className="text-button danger settings-danger-action" type="button" onClick={onAbort}>
          {t("werewolf.abortGame")}
        </button>
      )}
      {showClose && (
        <button className="text-button danger settings-danger-action" type="button" onClick={onCloseRoom}>
          {t("werewolf.closeRoom")}
        </button>
      )}
    </>
  );
}

export function StageSettingsDialog({
  stageLink,
  stageLocale,
  onClose,
  onCreateStageLink,
  onDisableStageLink,
  onStageLocaleChange,
}: {
  stageLink: string;
  stageLocale: Locale;
  onClose: () => void;
  onCreateStageLink: () => void;
  onDisableStageLink: () => void;
  onStageLocaleChange: (locale: Locale) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    },
    [],
  );

  const resetCopyState = (state: Exclude<CopyState, "idle">) => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    setCopyState(state);
    copyResetTimerRef.current = window.setTimeout(() => {
      copyResetTimerRef.current = null;
      setCopyState("idle");
    }, 1800);
  };

  const copyStageLink = async () => {
    if (!stageLink) return;
    if (await copyText(stageLink)) {
      resetCopyState("copied");
      return;
    }

    linkInputRef.current?.focus();
    linkInputRef.current?.select();
    resetCopyState("failed");
  };

  const dialog = (
    <div
      className="settings-backdrop werewolf-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="settings-sheet werewolf-settings-sheet stage-settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="panel-heading">
          <h3 id={titleId}>
            <Monitor /> {t("werewolf.stageMode")}
          </h3>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X />
          </button>
        </div>

        {stageLink ? (
          <>
            <div className="settings-section stage-settings-link-section">
              <p>{t("werewolf.stageLink")}</p>
              <input
                ref={linkInputRef}
                className="room-link-input stage-settings-link-input"
                value={stageLink}
                readOnly
                aria-label={t("werewolf.stageLink")}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
            <div className="settings-section">
              <StageLanguageControl locale={stageLocale} onChange={onStageLocaleChange} />
            </div>
            <div className="stage-settings-action-grid">
              <button className="secondary-button" type="button" onClick={copyStageLink}>
                <Copy /> {copyState === "copied" ? t("common.copied") : copyState === "failed" ? t("common.copySelected") : t("common.copy")}
              </button>
              <button className="secondary-button" type="button" onClick={onCreateStageLink}>
                <RotateCcw /> {t("werewolf.rotateStageLink")}
              </button>
              <button className="text-button danger settings-danger-action" type="button" onClick={onDisableStageLink}>
                <Ban /> {t("werewolf.disableStageLink")}
              </button>
            </div>
            {copyState === "failed" && <p className="copy-feedback">{t("common.copyBlocked")}</p>}
          </>
        ) : (
          <div className="settings-section stage-settings-empty">
            <p>{t("werewolf.stageLinkHint")}</p>
            <button className="secondary-button full" type="button" onClick={onCreateStageLink}>
              <Monitor /> {t("werewolf.createStageLink")}
            </button>
          </div>
        )}
      </section>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}

function RoomAssignmentPanel({
  snapshot,
  onSetAssignMode,
  onManualAssignment,
}: {
  snapshot: WerewolfHostRoomSnapshot;
  onSetAssignMode: (assignMode: WerewolfHostRoomSnapshot["assignMode"]) => void;
  onManualAssignment: (assignment: Record<string, RoleId | null>) => void;
}) {
  const { t } = useI18n();
  const assignedCounts = countAssignedRoles(snapshot.assignment);

  if (!snapshot.assignMode) {
    return (
      <section className="assignment-choice">
        <button type="button" className="mode-button active" onClick={() => onSetAssignMode("random")}>
          <span className="mode-icon">
            <Dice5 />
          </span>
          <span className="row-main">
            <strong>{t("werewolf.randomAssignment")}</strong>
            <span>{t("werewolf.randomAssignmentHint")}</span>
          </span>
        </button>
        <button type="button" className="mode-button" onClick={() => onSetAssignMode("manual")}>
          <span className="mode-icon">
            <Users />
          </span>
          <span className="row-main">
            <strong>{t("werewolf.manualAssignment")}</strong>
            <span>{t("werewolf.manualAssignmentHint")}</span>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>{snapshot.assignMode === "random" ? t("werewolf.randomAssignment") : t("werewolf.manualAssignment")}</h3>
        <span>{roleCountTotal(snapshot.roleCounts)}</span>
      </div>
      {snapshot.assignMode === "random" ? (
        <RoomAssignmentPreview snapshot={snapshot} />
      ) : (
        <>
          <RoomQuotaBadges counts={snapshot.roleCounts} assignedCounts={assignedCounts} />
          <div className="manual-assignment-list">
            {snapshot.players.map((player) => {
              const selectedRole = snapshot.assignment.find((entry) => entry.playerId === player.id)?.roleId ?? "";
              return (
                <label className="manual-assignment-row" key={player.id}>
                  <span>{player.name}</span>
                  <select
                    value={selectedRole}
                    onChange={(event) => {
                      const next = assignmentRecord(snapshot);
                      next[player.id] = (event.target.value as RoleId) || null;
                      onManualAssignment(next);
                    }}
                  >
                    <option value="">{t("werewolf.chooseRole")}</option>
                    {availableRoomRolesForPlayer(snapshot, player.id).map((roleId) => (
                      <option key={roleId} value={roleId}>
                        {t(roleDefinitions[roleId].nameKey)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function RoomAssignmentPreview({ snapshot }: { snapshot: WerewolfHostRoomSnapshot }) {
  const { t } = useI18n();
  const roleByPlayerId = new Map(snapshot.assignment.map((entry) => [entry.playerId, entry.roleId]));

  return (
    <div className="player-table">
      {snapshot.players.map((player) => {
        const roleId = roleByPlayerId.get(player.id);
        return (
          <div className="player-row" key={player.id}>
            <strong>{player.name}</strong>
            <span>{roleId ? t(roleDefinitions[roleId].nameKey) : t("common.waiting")}</span>
          </div>
        );
      })}
    </div>
  );
}

function RoomQuotaBadges({ counts, assignedCounts }: { counts: RoleCounts; assignedCounts: RoleCounts }) {
  const { t } = useI18n();

  return (
    <div className="quota-badges">
      {roleOrder
        .filter((roleId) => sanitizeRoleCount(counts, roleId) > 0)
        .map((roleId) => {
          const total = sanitizeRoleCount(counts, roleId);
          const used = sanitizeRoleCount(assignedCounts, roleId);
          return (
            <span className={used === total ? "complete" : ""} key={roleId}>
              {t(roleDefinitions[roleId].nameKey)} {used}/{total}
            </span>
          );
        })}
    </div>
  );
}

type CopyState = "idle" | "copied" | "failed";

function RoomHeader({ code, qr, joinLink, compact = false }: { code: string; qr: string | null; joinLink: string; compact?: boolean }) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    },
    [],
  );

  const resetCopyState = (state: Exclude<CopyState, "idle">) => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    setCopyState(state);
    copyResetTimerRef.current = window.setTimeout(() => {
      copyResetTimerRef.current = null;
      setCopyState("idle");
    }, 1800);
  };

  const copyJoinLink = async () => {
    if (await copyText(joinLink)) {
      resetCopyState("copied");
      return;
    }

    linkInputRef.current?.focus();
    linkInputRef.current?.select();
    resetCopyState("failed");
  };

  return (
    <section className={`room-header ${compact ? "compact" : ""}`}>
      <div>
        <p className="section-label">{t("werewolf.roomCode")}</p>
        <h2>{code}</h2>
        <input
          ref={linkInputRef}
          className="room-link-input"
          value={joinLink}
          readOnly
          aria-label={t("werewolf.joinLink")}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      {qr ? <img src={qr} alt={t("werewolf.joinLink")} /> : <QrCode />}
      <button className="secondary-button" type="button" onClick={copyJoinLink}>
        <Copy /> {copyState === "copied" ? t("common.copied") : copyState === "failed" ? t("common.copySelected") : t("common.copy")}
      </button>
      {copyState === "failed" && <p className="copy-feedback">{t("common.copyBlocked")}</p>}
    </section>
  );
}

function PlayerStatus({
  players,
  onKick,
}: {
  players: WerewolfHostRoomSnapshot["players"];
  onKick?: (playerId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="player-table">
      {players.map((player) => (
        <div className="player-row" key={player.id}>
          <span>
            <strong>{player.name}</strong>
            <small>{player.connected ? t("common.connected") : t("common.disconnected")}</small>
          </span>
          <span className={player.seenRole ? "valid-text" : "muted-text"}>
            {player.seenRole ? t("common.ready") : t("common.waiting")}
          </span>
          {onKick && (
            <span className="player-row-actions">
              <button type="button" onClick={() => onKick(player.id)} aria-label={t("werewolf.kick")}>
                <X />
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function HostTransferPanel({
  players,
  error,
  open,
  onToggle,
  onTransfer,
}: {
  players: WerewolfHostRoomSnapshot["players"];
  error: string | null;
  open: boolean;
  onToggle: () => void;
  onTransfer: (playerId: string) => void;
}) {
  const { t } = useI18n();
  const connectedPlayers = players.filter((player) => player.connected);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>{t("werewolf.hostTransfer")}</h3>
        <span>{connectedPlayers.length}</span>
      </div>
      <button className="secondary-button full" type="button" disabled={connectedPlayers.length === 0} onClick={onToggle}>
        {t("werewolf.transferHost")}
      </button>
      {error && <p className="error-text">{error}</p>}
      {open && (
        <div className="transfer-list">
          <p>{connectedPlayers.length === 0 ? t("werewolf.noTransferTargets") : t("werewolf.transferHostHint")}</p>
          {connectedPlayers.map((player) => (
            <button key={player.id} type="button" onClick={() => onTransfer(player.id)}>
              {player.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function countAssignedRoles(assignment: WerewolfHostRoomSnapshot["assignment"]) {
  return assignment.reduce<RoleCounts>((counts, entry) => {
    if (!entry.roleId) return counts;
    return { ...counts, [entry.roleId]: sanitizeRoleCount(counts, entry.roleId) + 1 };
  }, {});
}

function isAssignmentComplete(snapshot: WerewolfHostRoomSnapshot) {
  if (snapshot.players.length === 0) return false;
  const assignment = assignmentRecord(snapshot);
  const assignedCounts = countAssignedRoles(snapshot.assignment);

  return (
    snapshot.players.every((player) => Boolean(assignment[player.id])) &&
    roleOrder.every((roleId) => sanitizeRoleCount(assignedCounts, roleId) === sanitizeRoleCount(snapshot.roleCounts, roleId))
  );
}

function assignmentRecord(snapshot: WerewolfHostRoomSnapshot) {
  return snapshot.assignment.reduce<Record<string, RoleId | null>>((record, entry) => {
    record[entry.playerId] = entry.roleId;
    return record;
  }, {});
}

function availableRoomRolesForPlayer(snapshot: WerewolfHostRoomSnapshot, playerId: string) {
  const assignment = assignmentRecord(snapshot);
  return roleOrder.filter((roleId) => {
    const total = sanitizeRoleCount(snapshot.roleCounts, roleId);
    if (total <= 0) return false;
    const usedByOthers = Object.entries(assignment).filter(([id, value]) => id !== playerId && value === roleId).length;
    return total - usedByOthers > 0 || assignment[playerId] === roleId;
  });
}

function replaceRoute(path: string) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
