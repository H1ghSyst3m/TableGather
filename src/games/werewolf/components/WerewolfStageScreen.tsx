import QRCode from "qrcode";
import { Ban, Clock, HeartCrack, Moon, Skull, Sun, Target, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StageAudioControlState } from "../../../audio/stageAudio";
import { StageAudioControl } from "../../../components/StageAudioControl";
import { StageDisplayControl } from "../../../components/StageDisplayControl";
import type { Locale } from "../../../types";
import { I18nContext } from "../../../i18n/context";
import { translate } from "../../../i18n/translations";
import { useI18n } from "../../../i18n/useI18n";
import type { ServerMessage } from "../../../online/messages";
import { useRoomSocket, type RoomSocketControls } from "../../../online/useRoomSocket";
import type { StageDisplayControlState } from "../../../stage/useStageDisplay";
import { useStageDisplay } from "../../../stage/useStageDisplay";
import { roleDefinitions } from "../domain/roles";
import { formatDayTimer } from "../domain/timer";
import type { RoleId, Winner } from "../domain/types";
import type { WerewolfStageEvent, WerewolfStageRoomSnapshot } from "../roomTypes";
import { ActionIconChip, RoleIconChip } from "./WerewolfIcons";
import { useSyncedNow } from "./useSyncedNow";
import { useWerewolfStageAudio } from "./useWerewolfStageAudio";

type TFunction = ReturnType<typeof useI18n>["t"];

export function WerewolfStageScreen({ code, token, navigate }: { code: string; token: string; navigate: (path: string) => void }) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<WerewolfStageRoomSnapshot | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [joinQr, setJoinQr] = useState<string | null>(null);
  const joinLink = `${window.location.origin}/room/${code}`;

  const joinStageSession = useCallback(
    (sendMessage: RoomSocketControls["send"]) => {
      sendMessage({ type: "joinStage", roomCode: code, stageToken: token });
    },
    [code, token],
  );

  const { connect, send, connected, error } = useRoomSocket((message: ServerMessage, socket) => {
    if (message.type === "connected" && message.role === "stage") {
      setServerError(null);
      if (window.location.pathname !== `/stage/${message.roomCode}/${token}`) navigate(`/stage/${message.roomCode}/${token}`);
    }
    if (message.type === "snapshot" && (message.snapshot as WerewolfStageRoomSnapshot).audience === "stage") {
      setSnapshot(message.snapshot as WerewolfStageRoomSnapshot);
    }
    if (message.type === "roomClosed") {
      setSnapshot(null);
      setServerError(t("werewolf.stageClosed"));
      socket.disconnect();
    }
    if (message.type === "error") {
      setServerError(message.message);
      if (message.message === "Stage link is not valid.") socket.disconnect();
    }
  }, { autoReconnect: true, onOpen: ({ send: sendMessage }) => joinStageSession(sendMessage) });

  useEffect(() => {
    const socket = connect();
    if (socket.readyState === WebSocket.OPEN) joinStageSession(send);
  }, [connect, joinStageSession, send]);

  useEffect(() => {
    QRCode.toDataURL(joinLink, { margin: 2, width: 360 }).then(setJoinQr).catch(() => setJoinQr(null));
  }, [joinLink]);

  if (error || serverError) {
    return (
      <main className="werewolf-stage-screen night">
        <section className="werewolf-stage-center werewolf-stage-status">
          <p className="section-label">{t("werewolf.stageMode")}</p>
          <h1>{error ? t(error === "roomProtocolMismatch" ? "errors.roomProtocolMismatch" : "errors.roomConnection") : serverError}</h1>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="werewolf-stage-screen night">
        <section className="werewolf-stage-center werewolf-stage-status">
          <p className="section-label">{t("werewolf.stageMode")}</p>
          <h1>{connected ? t("common.waiting") : t("errors.roomConnection")}</h1>
        </section>
      </main>
    );
  }

  return <WerewolfStageView snapshot={snapshot} joinQr={joinQr} />;
}

export function WerewolfStageView({ snapshot, joinQr }: { snapshot: WerewolfStageRoomSnapshot; joinQr: string | null }) {
  const { setLocale } = useI18n();
  const roomLocale = snapshot.stageLocale ?? null;
  const roomI18n = useMemo(
    () =>
      roomLocale
        ? {
            locale: roomLocale,
            setLocale,
            t: (key: string, values?: Record<string, string | number>) => translate(roomLocale, key, values),
          }
        : null,
    [roomLocale, setLocale],
  );

  if (roomI18n) {
    return (
      <I18nContext.Provider value={roomI18n}>
        <WerewolfStageContent snapshot={snapshot} joinQr={joinQr} allowLocalLanguage={false} />
      </I18nContext.Provider>
    );
  }

  return <WerewolfStageContent snapshot={snapshot} joinQr={joinQr} allowLocalLanguage />;
}

function WerewolfStageContent({
  snapshot,
  joinQr,
  allowLocalLanguage,
}: {
  snapshot: WerewolfStageRoomSnapshot;
  joinQr: string | null;
  allowLocalLanguage: boolean;
}) {
  const { locale, setLocale } = useI18n();
  const phase = stagePhase(snapshot);
  const tone = phase === "day" ? "day" : "night";
  const audio = useWerewolfStageAudio(phase, snapshot.dayTimer);
  const display = useStageDisplay();

  return (
    <main className={`werewolf-stage-screen ${tone}`}>
      <StageHeader
        snapshot={snapshot}
        locale={locale}
        onLocaleChange={allowLocalLanguage ? setLocale : null}
        audio={audio}
        display={display}
      />
      <StageBody snapshot={snapshot} joinQr={joinQr} />
    </main>
  );
}

function StageHeader({
  snapshot,
  locale,
  onLocaleChange,
  audio,
  display,
}: {
  snapshot: WerewolfStageRoomSnapshot;
  locale: Locale;
  onLocaleChange: ((locale: Locale) => void) | null;
  audio: StageAudioControlState;
  display: StageDisplayControlState;
}) {
  const { t } = useI18n();
  const title = stageTitle(snapshot, t);

  return (
    <header className="werewolf-stage-header">
      <div className="werewolf-stage-phase">
        <p className="werewolf-stage-header-kicker">{t("werewolf.stageMode")}</p>
        <h1>{title}</h1>
      </div>
      <div className="werewolf-stage-header-actions">
        <StageDisplayControl display={display} className="werewolf-stage-display" />
        <StageAudioControl audio={audio} className="werewolf-stage-audio" />
        {onLocaleChange && <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />}
        <span className="werewolf-stage-code">{snapshot.code}</span>
      </div>
    </header>
  );
}

function LanguageToggle({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  const { t } = useI18n();

  return (
    <div className="werewolf-stage-language" aria-label={t("common.interfaceLanguage")} role="group">
      <button
        type="button"
        className={locale === "de" ? "active" : ""}
        aria-pressed={locale === "de"}
        aria-label={t("common.german")}
        onClick={() => onLocaleChange("de")}
      >
        DE
      </button>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        aria-pressed={locale === "en"}
        aria-label={t("common.english")}
        onClick={() => onLocaleChange("en")}
      >
        EN
      </button>
    </div>
  );
}

function StageBody({ snapshot, joinQr }: { snapshot: WerewolfStageRoomSnapshot; joinQr: string | null }) {
  switch (snapshot.scene) {
    case "lobby":
      return <LobbyStage snapshot={snapshot} joinQr={joinQr} />;
    case "setup":
    case "assignment":
      return <PreparationStage snapshot={snapshot} />;
    case "roleReveal":
      return <RoleRevealStage snapshot={snapshot} />;
    case "night":
      return <SimpleStage icon={<Moon />} titleKey="werewolf.stageNightTitle" />;
    case "nightReport":
      return <NightReportStage snapshot={snapshot} />;
    case "hunter":
      return <HunterStage snapshot={snapshot} />;
    case "voteReveal":
      return <VoteRevealStage snapshot={snapshot} />;
    case "ended":
      return <EndedStage snapshot={snapshot} />;
    case "day":
    default:
      return <DayStage snapshot={snapshot} />;
  }
}

function LobbyStage({ snapshot, joinQr }: { snapshot: WerewolfStageRoomSnapshot; joinQr: string | null }) {
  const { t } = useI18n();
  return (
    <section className="werewolf-stage-grid">
      <div className="werewolf-stage-hero">
        <StageSymbol icon={<Users />} />
        <p>{t("werewolf.stageLobbyHint")}</p>
        <h2>{t("werewolf.roomCode")}: {snapshot.code}</h2>
      </div>
      <div className="werewolf-stage-qr">
        {joinQr && <img src={joinQr} alt={t("werewolf.joinLink")} />}
        <span>{t("werewolf.joinRoom")}</span>
      </div>
      <PlayerWall snapshot={snapshot} />
    </section>
  );
}

function PreparationStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  return (
    <section className="werewolf-stage-grid single">
      <div className="werewolf-stage-hero">
        <StageSymbol icon={<Users />} />
        <p>{t("werewolf.stageSetupHint")}</p>
        <h2>{t("werewolf.roomCode")}: {snapshot.code}</h2>
      </div>
      <PlayerWall snapshot={snapshot} />
    </section>
  );
}

function RoleRevealStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  const seen = snapshot.players.filter((player) => player.seenRole).length;
  return (
    <StageScene icon={<Users />} title={t("werewolf.roleRevealProgress", { seen, total: snapshot.players.length })}>
      <PlayerWall snapshot={snapshot} />
    </StageScene>
  );
}

function NightReportStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  const event = snapshot.activeEvent ?? snapshot.events.find((item) => item.type === "nightDeaths" || item.type === "noNightDeaths") ?? null;

  return (
    <StageScene className="dramatic night-report" icon={<Sun />} label={t("werewolf.stageDawn")} title={t("werewolf.stageDawnTitle")}>
      {event && <NightReportPanel event={event} snapshot={snapshot} />}
      <StageEliminationRail snapshot={snapshot} />
    </StageScene>
  );
}

function NightReportPanel({ event, snapshot }: { event: WerewolfStageEvent; snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();

  if (event.type === "noNightDeaths") {
    return (
      <div className="werewolf-stage-reveal-panel quiet">
        <StageSymbol icon={<Ban />} small />
        <strong>{t("werewolf.nightSummaryEmpty")}</strong>
      </div>
    );
  }

  if (event.type !== "nightDeaths") return null;

  return (
    <div className="werewolf-stage-reveal-panel night-deaths">
      <p className="werewolf-stage-panel-label">{t("werewolf.stageEliminatedTonight")}</p>
      <StagePlayerGrid playerIds={event.playerIds ?? []} snapshot={snapshot} event={event} />
    </div>
  );
}

function HunterStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  const event = snapshot.activeEvent?.type === "hunterPending" ? snapshot.activeEvent : snapshot.events.find((item) => item.type === "hunterPending");

  return (
    <StageScene className="dramatic hunter" icon={<Target />} label={t("werewolf.hunterShotTitle")} title={t("werewolf.stageHunterPromptHeadline")}>
      <p className="werewolf-stage-subtitle">{t("werewolf.stageHunterPromptSubtitle")}</p>
      {event?.playerId && (
        <div className="werewolf-stage-reveal-panel hunterPending">
          <StagePlayerTile snapshot={snapshot} playerId={event.playerId} event={event} />
          <StageRevealBadge event={event} />
        </div>
      )}
      <StageEliminationRail snapshot={snapshot} />
    </StageScene>
  );
}

function DayStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  return (
    <section className="werewolf-stage-grid single">
      <SimpleStage icon={<Sun />} titleKey="werewolf.dayDiscussionTitle" />
      <StageDayTimer snapshot={snapshot} />
      <PlayerWall snapshot={snapshot} aliveOnly />
    </section>
  );
}

function StageDayTimer({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  const timer = snapshot.dayTimer;
  const now = useSyncedNow(timer?.serverTime, timer?.status === "running");
  if (!timer) return null;

  const elapsedSeconds = timer.status === "running" ? Math.max(0, Math.floor((now - timer.serverTime) / 1000)) : 0;
  const remainingSeconds = Math.max(0, timer.remainingSeconds - elapsedSeconds);
  const expired = remainingSeconds === 0;
  const statusText = expired
    ? t("werewolf.dayTimerExpired")
    : timer.status === "running"
      ? t("werewolf.dayTimerRunning")
      : timer.status === "paused"
        ? t("werewolf.dayTimerPaused")
        : t("werewolf.dayTimerWaiting");

  return (
    <div className={`werewolf-stage-day-timer ${timer.status} ${expired ? "expired" : ""}`}>
      <Clock />
      <div>
        <p className="werewolf-stage-panel-label">{t("werewolf.dayTimer")}</p>
        <strong>{formatDayTimer(remainingSeconds)}</strong>
        <span>{statusText}</span>
      </div>
    </div>
  );
}

function VoteRevealStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  const event = snapshot.activeEvent ?? snapshot.events[0] ?? null;

  return (
    <StageScene className={`dramatic vote-reveal ${event?.type ?? ""}`} icon={eventIcon(event)} label={event ? stageEventLabel(event, snapshot, t) : t("werewolf.voteTitle")} title={event ? stageEventTitle(event, snapshot, t) : ""}>
      {event && <StageEventFocus event={event} snapshot={snapshot} />}
      <StageEliminationRail snapshot={snapshot} />
    </StageScene>
  );
}

function EndedStage({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  return (
    <StageScene className="dramatic ended" icon={<Trophy />} title={winnerText(snapshot.winner, t)} />
  );
}

function SimpleStage({
  icon,
  titleKey,
}: {
  icon: ReactNode;
  titleKey: string;
}) {
  const { t } = useI18n();
  return <StageScene icon={icon} title={t(titleKey)} />;
}

function StageScene({ icon, label, title, children, className = "" }: { icon: ReactNode; label?: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <section className={`werewolf-stage-center ${className}`}>
      <StageSymbol icon={icon} />
      {label && <p className="werewolf-stage-scene-label">{label}</p>}
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

function StageSymbol({ icon, small = false }: { icon: ReactNode; small?: boolean }) {
  return <span className={`werewolf-stage-symbol ${small ? "small" : ""}`}>{icon}</span>;
}

function StageEventFocus({ event, snapshot }: { event: WerewolfStageEvent; snapshot: WerewolfStageRoomSnapshot }) {
  if (event.type === "hunterSkipped") {
    return (
      <div className="werewolf-stage-reveal-panel quiet">
        <StageSymbol icon={<Ban />} small />
        <StageRevealBadge event={event} />
      </div>
    );
  }

  if (!event.playerId) return null;

  return (
    <div className={`werewolf-stage-reveal-panel ${event.type}`}>
      <StagePlayerTile snapshot={snapshot} playerId={event.playerId} event={event} />
      <StageRevealBadge event={event} />
    </div>
  );
}

function StagePlayerGrid({ playerIds, snapshot, event }: { playerIds: string[]; snapshot: WerewolfStageRoomSnapshot; event: WerewolfStageEvent }) {
  return (
    <div className="werewolf-stage-player-grid">
      {playerIds.map((playerId) => (
        <StagePlayerTile key={playerId} snapshot={snapshot} playerId={playerId} event={event} />
      ))}
    </div>
  );
}

function StagePlayerTile({ snapshot, playerId, event, compact = false }: { snapshot: WerewolfStageRoomSnapshot; playerId: string; event: WerewolfStageEvent; compact?: boolean }) {
  return (
    <article className={`werewolf-stage-player-tile ${event.type} ${compact ? "compact" : ""}`}>
      <span className="werewolf-stage-player-mark">{eventIcon(event)}</span>
      <strong>{playerName(snapshot, playerId)}</strong>
    </article>
  );
}

function StageRevealBadge({ event, compact = false }: { event: WerewolfStageEvent; compact?: boolean }) {
  const { t } = useI18n();
  if (!event.reveal) {
    if (event.type === "voteDeath" || event.type === "loverDeath" || event.type === "hunterShot") {
      return <span className={`werewolf-stage-reveal-badge hidden ${compact ? "compact" : ""}`}>{t("werewolf.stageNoReveal")}</span>;
    }
    return null;
  }

  const team = event.reveal.team ?? "good";
  const label = event.reveal.mode === "team" ? t("werewolf.stageRevealTeam") : t("werewolf.stageRevealRole");
  const value =
    event.reveal.mode === "team"
      ? t(team === "evil" ? "werewolf.teamEvil" : "werewolf.teamGood")
      : event.reveal.roleId
        ? t(roleDefinitions[event.reveal.roleId as RoleId].nameKey)
        : "";

  return (
    <span className={`werewolf-stage-reveal-badge ${team} ${compact ? "compact" : ""}`}>
      {event.reveal.mode === "role" && event.reveal.roleId ? (
        <RoleIconChip roleId={event.reveal.roleId as RoleId} className="werewolf-stage-reveal-role-icon" />
      ) : (
        <ActionIconChip icon={team === "evil" ? "evil" : "good"} className="werewolf-stage-reveal-team-icon" />
      )}
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function PlayerWall({ snapshot, aliveOnly = false }: { snapshot: WerewolfStageRoomSnapshot; aliveOnly?: boolean }) {
  const players = useMemo(
    () => snapshot.players.filter((player) => !aliveOnly || player.alive !== false),
    [aliveOnly, snapshot.players],
  );

  return (
    <div className="werewolf-stage-player-wall">
      {players.map((player) => (
        <span className={player.alive === false ? "dead" : ""} key={player.id}>
          {player.name}
        </span>
      ))}
    </div>
  );
}

function StageEliminationRail({ snapshot }: { snapshot: WerewolfStageRoomSnapshot }) {
  const { t } = useI18n();
  const visibleEvents = snapshot.pastEvents.filter(isEliminationEvent);
  if (visibleEvents.length === 0) return null;
  const countClass = visibleEvents.length === 1 ? "single count-1" : visibleEvents.length === 2 ? "pair count-2" : "many count-many";

  return (
    <aside className="werewolf-stage-elimination-rail" aria-label={t("werewolf.stagePreviousEliminations")}>
      <p className="werewolf-stage-rail-label">{t("werewolf.stagePreviousEliminations")}</p>
      <div className={`werewolf-stage-timeline ${countClass}`}>
        {visibleEvents.map((event, index) => (
          <StageTimelineStep
            event={event}
            index={index}
            snapshot={snapshot}
            key={`${event.type}-${event.source ?? "event"}-${event.playerId ?? event.playerIds?.join("-") ?? index}`}
          />
        ))}
      </div>
    </aside>
  );
}

function StageTimelineStep({ event, snapshot, index }: { event: WerewolfStageEvent; snapshot: WerewolfStageRoomSnapshot; index: number }) {
  const { t } = useI18n();
  const playerIds = event.type === "nightDeaths" ? event.playerIds ?? [] : event.playerId ? [event.playerId] : [];

  return (
    <article className={`werewolf-stage-timeline-step ${event.type}`}>
      <span className="werewolf-stage-timeline-marker" aria-hidden="true">{index + 1}</span>
      <div className="werewolf-stage-timeline-card">
        <div className="werewolf-stage-timeline-heading">
          <span className="werewolf-stage-timeline-icon">{eventIcon(event)}</span>
          <strong>{stageHistoryTitle(event, snapshot, t)}</strong>
        </div>
        <div className="werewolf-stage-timeline-participants">
          {playerIds.map((playerId) => (
            <StageTimelineParticipant key={playerId} event={event} snapshot={snapshot} playerId={playerId} />
          ))}
        </div>
      </div>
    </article>
  );
}

function StageTimelineParticipant({
  event,
  snapshot,
  playerId,
}: {
  event: WerewolfStageEvent;
  snapshot: WerewolfStageRoomSnapshot;
  playerId: string;
}) {
  return (
    <div className={`werewolf-stage-timeline-participant ${event.type}`}>
      <span className="werewolf-stage-timeline-name">{playerName(snapshot, playerId)}</span>
      {event.type !== "nightDeaths" && <StageRevealBadge event={event} compact />}
    </div>
  );
}

function isEliminationEvent(event: WerewolfStageEvent) {
  return event.type === "nightDeaths" || event.type === "voteDeath" || event.type === "loverDeath" || event.type === "hunterShot";
}

function stageEventLabel(event: WerewolfStageEvent, snapshot: WerewolfStageRoomSnapshot, t: TFunction) {
  if (event.type === "nightDeaths" || event.type === "noNightDeaths") return t("werewolf.stageDawn");
  if (event.type === "voteDeath") return t("werewolf.voteTitle");
  if (event.type === "loverDeath") return t("werewolf.stageFollowUp");
  if (event.type === "hunterShot") return t("werewolf.hunterShotTitle");
  if (event.type === "hunterSkipped") return t("werewolf.hunterShotTitle");
  if (event.type === "hunterPending") return t("werewolf.hunterShotTitle");
  if (event.type === "winner") return t("werewolf.gameOverTitle");
  return stageTitle(snapshot, t);
}

function stageEventTitle(event: WerewolfStageEvent, snapshot: WerewolfStageRoomSnapshot, t: TFunction) {
  if (event.type === "nightDeaths") return t("werewolf.stageEliminatedTonight");
  if (event.type === "noNightDeaths") return t("werewolf.nightSummaryEmpty");
  if (event.type === "voteDeath") return t("werewolf.stageVoteExecutionTitle");
  if (event.type === "loverDeath") return t("werewolf.stageLoverDeath");
  if (event.type === "hunterShot") return t("werewolf.stageHunterShotTitle");
  if (event.type === "hunterSkipped") return t("werewolf.stageHunterSkippedTitle");
  if (event.type === "hunterPending") return t("werewolf.stageHunterPromptHeadline");
  if (event.type === "winner") return winnerText(event.winner, t);
  return "";
}

function stageHistoryTitle(event: WerewolfStageEvent, snapshot: WerewolfStageRoomSnapshot, t: TFunction) {
  if (event.type === "nightDeaths") return t("werewolf.nightSummary");
  if (event.type === "loverDeath") return t("werewolf.stageLoverDeath");
  return stageEventLabel(event, snapshot, t);
}

function eventIcon(event: WerewolfStageEvent | null) {
  if (event?.type === "loverDeath") return <HeartCrack />;
  if (event?.type === "hunterShot" || event?.type === "hunterPending") return <Target />;
  if (event?.type === "hunterSkipped") return <Ban />;
  if (event?.type === "nightDeaths" || event?.type === "voteDeath") return <Skull />;
  return <Skull />;
}

function stageTitle(snapshot: WerewolfStageRoomSnapshot, t: TFunction) {
  const phase = stagePhase(snapshot);
  if (snapshot.round && phase === "night") return t("werewolf.nightTitle", { round: snapshot.round });
  if (snapshot.round && phase === "day") return t("werewolf.dayTitle", { round: snapshot.round });
  if (snapshot.scene === "roleReveal") return t("werewolf.roleReveal");
  if (snapshot.scene === "ended") return t("werewolf.gameOverTitle");
  return t("werewolf.stagePreparation");
}

function stagePhase(snapshot: WerewolfStageRoomSnapshot): "day" | "night" | null {
  if (snapshot.activeEvent?.source) return snapshot.activeEvent.source;
  if (snapshot.scene === "night" || snapshot.scene === "nightReport") return "night";
  if (snapshot.scene === "day" || snapshot.scene === "voteReveal" || snapshot.scene === "hunter") return "day";
  return null;
}

function playerName(snapshot: WerewolfStageRoomSnapshot, playerId: string) {
  return snapshot.players.find((player) => player.id === playerId)?.name ?? "";
}

function winnerText(winner: Winner | null | undefined, t: TFunction) {
  if (winner === "werewolves") return t("werewolf.winnerWerewolves");
  if (winner === "fool") return t("werewolf.winnerFool");
  if (winner === "villageIdiot") return t("werewolf.winnerVillageIdiot");
  if (winner === "lovers") return t("werewolf.winnerLovers");
  return t("werewolf.winnerVillagers");
}
