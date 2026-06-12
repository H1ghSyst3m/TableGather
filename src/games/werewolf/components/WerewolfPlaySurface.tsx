import { Clock, HeartCrack, Moon, Pause, Play, RotateCcw, ScrollText, Skull, Sun, Target, Undo2, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { Children, Fragment, isValidElement, useState } from "react";
import { effectiveRoleId as getEffectiveRoleId, playerTeamInState } from "../domain/alignment";
import { activePublicEvent, canAlphaWolfTransformTarget, canWitchHealWolfTarget } from "../domain/engine";
import { roleDefinitions } from "../domain/roles";
import { dayTimerDurations, dayTimerRemainingSeconds, ensureDayTimer, formatDayTimer } from "../domain/timer";
import { getNightStepActors, getValidTargets, isNightStepActive } from "../domain/targets";
import type { NightStepId, WerewolfDayTimerDurationSeconds, WerewolfLogEntry, WerewolfPublicEvent, WerewolfState } from "../domain/types";
import { useI18n } from "../../../i18n/useI18n";
import type { TranslationKey } from "../../../i18n/translations";
import type { RoomPlayerPublic } from "../../../types";
import { GameConfirmDialog } from "../../../components/GameConfirmDialog";
import { RoleInfoModal } from "./RoleInfoModal";
import { WerewolfFlowShell, type WerewolfFlowShellProps } from "./WerewolfFlowShell";
import { ActionIconChip, RoleIconChip, StatusIconChip, type WerewolfActionIconId, type WerewolfStatusIconId } from "./WerewolfIcons";
import { useSyncedNow } from "./useSyncedNow";

interface WerewolfActions {
  setProtectedPlayer: (playerId: string | null) => void;
  setNightGuestHost: (playerId: string | null) => void;
  setWildChildModel: (playerId: string | null) => void;
  setCupidTargets: (playerIds: string[]) => void;
  setInspectedPlayer: (playerId: string | null) => void;
  setAuraTarget: (playerId: string | null) => void;
  setDetectiveTargets: (playerIds: string[]) => void;
  revealNightResult: (step: "seer" | "auraSeer" | "detective") => void;
  setWolfTarget: (playerId: string | null) => void;
  setAlphaWolfTransform: (value: boolean | null) => void;
  setWitchHealTonight: (value: boolean) => void;
  setWitchPoisonTarget: (playerId: string | null) => void;
  advanceNightStep: () => void;
  advancePublicEvent: () => void;
  resolveNight: () => void;
  resolveHunterShot: (playerId: string | null) => void;
  eliminateByVote: (playerId: string) => void;
  startDay: () => void;
  setDayTimerDuration: (durationSeconds: WerewolfDayTimerDurationSeconds) => void;
  startDayTimer: () => void;
  pauseDayTimer: () => void;
  resetDayTimer: () => void;
  startNextNight: () => void;
  undoStep?: () => void;
  reset: () => void;
}

export function WerewolfPlaySurface({
  state,
  actions,
  roomPlayers = [],
  serverTime,
  canUndo = false,
  onBack,
  settingsActions,
}: {
  state: WerewolfState;
  actions: WerewolfActions;
  roomPlayers?: RoomPlayerPublic[];
  serverTime?: number;
  canUndo?: boolean;
  onBack?: () => void;
  settingsActions?: WerewolfFlowShellProps["settingsActions"];
}) {
  const { t } = useI18n();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [roleInfoId, setRoleInfoId] = useState<WerewolfState["players"][number]["roleId"] | null>(null);
  const logCount = (state.log ?? []).filter(Boolean).length;

  const headerActions = (
    <>
      <button className="werewolf-flow-icon-button" type="button" onClick={() => setLogOpen(true)} aria-label={t("werewolf.gameLog")} title={t("werewolf.gameLog")}>
        <ScrollText />
        {logCount > 0 && <span className="werewolf-flow-tool-badge">{logCount}</span>}
      </button>
      <button className="werewolf-flow-icon-button" type="button" onClick={() => setOverviewOpen(true)} aria-label={t("werewolf.playersOverview")} title={t("werewolf.playersOverview")}>
        <Users />
      </button>
    </>
  );

  const undoAction = actions.undoStep ? (
    <button
      className="secondary-button compact werewolf-undo-action"
      type="button"
      disabled={!canUndo}
      aria-label={t("werewolf.undoStep")}
      title={t("werewolf.undoStep")}
      onClick={actions.undoStep}
    >
      <Undo2 />
    </button>
  ) : null;
  const renderShell = ({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) => (
    <WerewolfFlowShell title={title} onBack={onBack} headerActions={headerActions} settingsActions={settingsActions} footer={withUndoFooter(footer, undoAction)}>
      {children}
    </WerewolfFlowShell>
  );

  const publicEvent = activePublicEvent(state);
  const content = publicEvent?.type === "nightDeaths" || publicEvent?.type === "noNightDeaths" ? (
    <NightReportSurface state={state} event={publicEvent} actions={actions} renderShell={renderShell} />
  ) : publicEvent?.type === "hunterPending" ? (
    <HunterShotSurface state={state} actions={actions} renderShell={renderShell} />
  ) : publicEvent?.type === "voteDeath" ||
    publicEvent?.type === "loverDeath" ||
    publicEvent?.type === "hunterShot" ||
    publicEvent?.type === "hunterSkipped" ? (
    <PublicEventRevealSurface state={state} event={publicEvent} actions={actions} renderShell={renderShell} />
  ) : publicEvent?.type === "winner" ? (
    <GameOverSurface state={state} onReset={actions.reset} renderShell={renderShell} />
  ) : state.pendingHunterId ? (
    <HunterShotSurface state={state} actions={actions} renderShell={renderShell} />
  ) : state.phase === "night" && state.nightResolved ? (
    <NightReportSurface state={state} event={null} actions={actions} renderShell={renderShell} />
  ) : state.phase === "night" ? (
    <NightSurface state={state} actions={actions} renderShell={renderShell} />
  ) : state.phase === "day" ? (
    <DaySurface state={state} actions={actions} renderShell={renderShell} serverTime={serverTime} />
  ) : (
    <GameOverSurface state={state} onReset={actions.reset} renderShell={renderShell} />
  );

  return (
    <>
      {content}
      {overviewOpen && (
        <PlayerOverviewSheet
          state={state}
          roomPlayers={roomPlayers}
          onRoleInfo={setRoleInfoId}
          onClose={() => setOverviewOpen(false)}
        />
      )}
      {logOpen && <GameLogSheet entries={state.log} onClose={() => setLogOpen(false)} />}
      {roleInfoId && <RoleInfoModal role={roleDefinitions[roleInfoId]} onClose={() => setRoleInfoId(null)} />}
    </>
  );
}

type RenderPlayShell = (parts: { title: string; footer?: ReactNode; children: ReactNode }) => ReactNode;
type NightResultTone = "good" | "evil";

interface NightResultView {
  icon: WerewolfActionIconId;
  text: string;
  tone: NightResultTone;
}

function withUndoFooter(footer: ReactNode | undefined, undoAction: ReactNode) {
  if (!undoAction) return footer;
  const footerItems = footerChildren(footer);
  const primaryAction = footerItems.at(-1);
  const supportingContent = primaryAction ? footerItems.slice(0, -1) : [];

  return (
    <div className="werewolf-flow-action-stack">
      {supportingContent}
      <div className="werewolf-flow-footer-action-row">
        {undoAction}
        {primaryAction}
      </div>
    </div>
  );
}

function footerChildren(footer: ReactNode): ReactNode[] {
  return Children.toArray(footer).flatMap((item) => {
    if (isValidElement<{ children?: ReactNode }>(item) && item.type === Fragment) {
      return footerChildren(item.props.children);
    }

    return [item];
  });
}

function NightSurface({ state, actions, renderShell }: { state: WerewolfState; actions: WerewolfActions; renderShell: RenderPlayShell }) {
  const { t } = useI18n();
  const nightSteps = state.nightSteps ?? ["dawn"];
  const step = nightSteps[state.nightStepIndex ?? 0];
  const currentStep = step ?? "dawn";
  const isLastStep = currentStep === "dawn";
  const alivePlayers = (state.players ?? []).filter((player) => player.alive);
  const stepActors = getNightStepActors(state, currentStep);
  const stepActive = isNightStepActive(state, currentStep);
  const canAdvance = canAdvanceNightStep(state, currentStep, stepActive);
  const pendingRevealStep = stepActive ? pendingNightResultRevealStep(state, currentStep) : null;
  const nightResult = stepActive ? revealedNightResult(state, currentStep, t) : null;
  const progressRail = (
    <div className="progress-rail night-progress-rail">
      {nightSteps.map((nightStep, index) => (
        <span key={`${nightStep}-${index}`} className={index <= state.nightStepIndex ? "active" : ""} />
      ))}
    </div>
  );

  return renderShell({
    title: t("werewolf.nightTitle", { round: state.round }),
    footer: (
      <>
        {nightResult && <NightResultCard result={nightResult} />}
        <button
          className="primary-action compact"
          type="button"
          disabled={pendingRevealStep ? false : !canAdvance}
          onClick={
            pendingRevealStep
              ? () => actions.revealNightResult(pendingRevealStep)
              : isLastStep
                ? actions.resolveNight
                : actions.advanceNightStep
          }
        >
          {pendingRevealStep ? t("werewolf.showNightResult") : isLastStep ? t("werewolf.resolveNight") : t("werewolf.nextStep")}
        </button>
      </>
    ),
    children: (
    <section className="game-surface">
      <div className="phase-heading">
        <Moon />
        <div>
          <p className="section-label">{t("werewolf.nightTitle", { round: state.round })}</p>
          <h2>{nightStepText(currentStep, t)}</h2>
        </div>
      </div>
      {progressRail}
      <NightStepHeader step={currentStep} actors={stepActors} active={stepActive} />

      {!stepActive && currentStep !== "dawn" && currentStep !== "sleep" && (
        <InactiveStepNote />
      )}
      {stepActive && currentStep === "cupid" && (
        <MultiPlayerSelector
          players={alivePlayers}
          selectedIds={state.cupidTargetIds}
          onSelect={actions.setCupidTargets}
          title={t("werewolf.selectLovers")}
          max={2}
        />
      )}
      {stepActive && currentStep === "lovers" && (
        <StepNote
          text={
            state.cupidTargetIds.length === 2
              ? t("werewolf.loversSelected", { names: namesForIds(state, state.cupidTargetIds) })
              : t("werewolf.noLoversSelected")
          }
        />
      )}
      {stepActive && currentStep === "wildChild" && (
        <PlayerSelector
          players={getValidTargets(state, "wildChild")}
          selectedId={state.wildChildModelId}
          onSelect={actions.setWildChildModel}
          title={t("werewolf.selectRoleModel")}
        />
      )}
      {stepActive && currentStep === "nightGuest" && (
        <PlayerSelector
          players={getValidTargets(state, "nightGuest")}
          selectedId={state.nightGuestHostId}
          onSelect={actions.setNightGuestHost}
          title={t("werewolf.nightGuestHost")}
        />
      )}
      {stepActive && currentStep === "protector" && (
        <PlayerSelector
          players={getValidTargets(state, "protector")}
          selectedId={state.protectedPlayerId}
          onSelect={actions.setProtectedPlayer}
          title={t("werewolf.protectorTarget")}
        />
      )}
      {stepActive && currentStep === "wolves" &&
        (state.wolvesSkipNextNight ? (
          <StepNote text={t("werewolf.wolvesSkipTonight")} />
        ) : (
          <PlayerSelector
            players={getValidTargets(state, "wolves")}
            selectedId={state.wolfTargetId}
            onSelect={actions.setWolfTarget}
            title={t("werewolf.wolfTarget")}
          />
        ))}
      {stepActive && currentStep === "cursedInfo" && <GmOnlyInfo text={t("werewolf.cursedInfoText", { name: namesForIds(state, [state.wolfTargetId ?? ""]) || t("roles.cursed.name") })} />}
      {stepActive && currentStep === "alphaWolf" && <AlphaWolfPanel state={state} onChange={actions.setAlphaWolfTransform} />}
      {stepActive && currentStep === "alphaWolfInfo" && <GmOnlyInfo text={t("werewolf.alphaWolfInfoText", { name: namesForIds(state, [state.wolfTargetId ?? ""]) || t("roles.alphaWolf.name") })} />}
      {stepActive && currentStep === "seer" && (
        <>
          <PlayerSelector
            players={getValidTargets(state, "seer")}
            selectedId={state.inspectedPlayerId}
            onSelect={actions.setInspectedPlayer}
            title={t("werewolf.inspectedPlayer")}
          />
        </>
      )}
      {stepActive && currentStep === "auraSeer" && (
        <>
          <PlayerSelector
            players={getValidTargets(state, "auraSeer")}
            selectedId={state.auraTargetId}
            onSelect={actions.setAuraTarget}
            title={t("werewolf.auraTarget")}
          />
        </>
      )}
      {stepActive && currentStep === "detective" && (
        <>
          <MultiPlayerSelector
            players={getValidTargets(state, "detective")}
            selectedIds={state.detectiveTargetIds}
            onSelect={actions.setDetectiveTargets}
            title={t("werewolf.detectiveTargets")}
            max={2}
          />
        </>
      )}
      {stepActive && currentStep === "witch" && <WitchPanel state={state} actions={actions} />}
      {stepActive && currentStep === "toughGuyInfo" && <GmOnlyInfo text={t("werewolf.toughGuyInfoText", { name: namesForIds(state, [state.toughGuyWoundedTonightId ?? ""]) || t("roles.toughGuy.name") })} />}
    </section>
    ),
  });
}

function NightStepHeader({
  step,
  actors,
  active,
}: {
  step: NightStepId;
  actors: WerewolfState["players"];
  active: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="night-step-card">
      <p>{nightStepDescriptionText(step, t)}</p>
      {actors.length > 0 && (
        <div className="awake-player-chips">
          <span>{t("werewolf.awakePlayers")}</span>
          <div>
            {actors.map((player) => (
              <strong className={active && player.alive ? "" : "muted-text"} key={player.id}>
                {player.name}
              </strong>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InactiveStepNote() {
  const { t } = useI18n();
  return <ActionNotice className="inactive-step-panel" icon="sleep" title={t("werewolf.inactiveStep")} text={t("werewolf.inactiveStepHint")} />;
}

function NightReportSurface({
  state,
  event,
  actions,
  renderShell,
}: {
  state: WerewolfState;
  event: Extract<WerewolfPublicEvent, { type: "nightDeaths" | "noNightDeaths" }> | null;
  actions: WerewolfActions;
  renderShell: RenderPlayShell;
}) {
  const { t } = useI18n();
  const deathIds = event?.type === "nightDeaths" ? event.playerIds : state.lastNightDeaths ?? [];
  const deaths = deathIds
    .map((id) => (state.players ?? []).find((player) => player.id === id))
    .filter(Boolean) as WerewolfState["players"];
  const nextEvent = nextPublicEvent(state);
  const footerAction = nextEvent
    ? {
        label:
          nextEvent.type === "hunterPending"
            ? t("werewolf.hunterLastShot")
            : nextEvent.type === "winner"
              ? t("werewolf.showGameOver")
              : t("werewolf.continueReveal"),
        onClick: actions.advancePublicEvent,
      }
    : {
        label: state.phase === "ended" ? t("werewolf.showGameOver") : t("werewolf.startDay"),
        onClick: state.phase === "ended" ? actions.advancePublicEvent : actions.startDay,
      };

  return renderShell({
    title: t("werewolf.nightSummary"),
    footer: (
      <button className="primary-action compact" type="button" onClick={footerAction.onClick}>
        {footerAction.label}
      </button>
    ),
    children: (
    <section className="game-surface">
      <div className="phase-heading">
        <Sun />
        <div>
          <p className="section-label">{t("werewolf.nightTitle", { round: state.round })}</p>
          <h2>{t("werewolf.nightSummary")}</h2>
        </div>
      </div>
      <div className="night-report-list">
        {deaths.length === 0 ? (
          <div className="night-report-row night-report-empty">
            <ActionIconChip icon="noDeath" className="night-report-event-icon" />
            <div className="night-report-main">
              <strong>{t("werewolf.nightSummaryEmpty")}</strong>
              <span>{nightStepDescriptionText("dawn", t)}</span>
            </div>
          </div>
        ) : (
          deaths.map((player) => {
            const team = roleTeam(state, player);
            const tone = team === "werewolves" ? "evil" : "good";
            const roleId = getEffectiveRoleId(state, player);
            return (
              <div className={`night-report-row ${tone}`} key={player.id}>
                <ActionIconChip icon="kill" className="night-report-event-icon" />
                <div className="night-report-main">
                  <strong>{player.name}</strong>
                  <span className="night-report-role">
                    <RoleIconChip roleId={roleId} className="night-report-role-icon" />
                    {roleDisplayText(state, player.id, t)}
                  </span>
                </div>
                <TeamBadge team={team} />
              </div>
            );
          })
        )}
      </div>
    </section>
    ),
  });
}

function PublicEventRevealSurface({
  state,
  event,
  actions,
  renderShell,
}: {
  state: WerewolfState;
  event: Extract<WerewolfPublicEvent, { type: "voteDeath" | "loverDeath" | "hunterShot" | "hunterSkipped" }>;
  actions: WerewolfActions;
  renderShell: RenderPlayShell;
}) {
  const { t } = useI18n();
  const nextEvent = nextPublicEvent(state);
  const playerId = event.type === "hunterSkipped" ? event.hunterId : event.playerId;
  const title = publicEventTitle(state, event, t);
  const label = publicEventLabel(event, t);
  const icon = publicEventIcon(event);
  const footerAction = nextEvent
    ? {
        label:
          nextEvent.type === "loverDeath"
            ? t("werewolf.revealHeartbreak")
            : nextEvent.type === "hunterPending"
              ? t("werewolf.hunterLastShot")
              : nextEvent.type === "winner"
                ? t("werewolf.showGameOver")
                : t("werewolf.continueReveal"),
        onClick: actions.advancePublicEvent,
      }
    : {
        label: state.phase === "night" ? t("werewolf.startDay") : state.phase === "ended" ? t("werewolf.showGameOver") : t("werewolf.nextNight"),
        onClick: state.phase === "night" ? actions.startDay : state.phase === "ended" ? actions.advancePublicEvent : actions.startNextNight,
      };

  return renderShell({
    title: state.phase === "night" ? t("werewolf.nightSummary") : t("werewolf.dayTitle", { round: state.round }),
    footer: (
      <button className="primary-action compact" type="button" onClick={footerAction.onClick}>
        {footerAction.label}
      </button>
    ),
    children: (
      <section className="game-surface public-reveal-surface">
        <div className="phase-heading">
          {icon}
          <div>
            <p className="section-label">{label}</p>
            <h2>{title}</h2>
          </div>
        </div>
        {event.type !== "hunterSkipped" && playerId && <RevealSummary state={state} ids={[playerId]} />}
      </section>
    ),
  });
}

function DaySurface({
  state,
  actions,
  renderShell,
  serverTime,
}: {
  state: WerewolfState;
  actions: WerewolfActions;
  renderShell: RenderPlayShell;
  serverTime?: number;
}) {
  const { t } = useI18n();
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [skipVoteConfirmOpen, setSkipVoteConfirmOpen] = useState(false);
  const lastDayDeaths = state.lastDayDeaths ?? [];
  const dayDeaths = namesForIds(state, lastDayDeaths);
  const alivePlayers = (state.players ?? []).filter((player) => player.alive);
  const pendingVote = pendingVoteId ? alivePlayers.find((player) => player.id === pendingVoteId) ?? null : null;

  if (lastDayDeaths.length > 0) {
    return renderShell({
      title: t("werewolf.dayTitle", { round: state.round }),
      footer: (
        <button className="primary-action compact" type="button" onClick={actions.startNextNight}>
          {t("werewolf.nextNight")}
        </button>
      ),
      children: (
      <section className="game-surface">
        <div className="phase-heading">
          <Sun />
          <div>
            <p className="section-label">{t("werewolf.dayTitle", { round: state.round })}</p>
            <h2>{t("werewolf.dayExecutionResult", { names: dayDeaths })}</h2>
          </div>
        </div>
        <RevealSummary state={state} ids={lastDayDeaths} />
      </section>
      ),
    });
  }

  return renderShell({
    title: t("werewolf.dayTitle", { round: state.round }),
    footer: pendingVote ? (
      <button
        className="primary-action compact danger-action"
        type="button"
        onClick={() => {
          const playerId = pendingVote.id;
          setPendingVoteId(null);
          actions.eliminateByVote(playerId);
        }}
      >
        {t("werewolf.eliminateNamed", { name: pendingVote.name })}
      </button>
    ) : (
      <button className="secondary-button full" type="button" aria-haspopup="dialog" onClick={() => setSkipVoteConfirmOpen(true)}>
        {t("werewolf.startNightWithoutVote")}
      </button>
    ),
    children: (
    <section className="game-surface">
      <div className="phase-heading">
        <Sun />
        <div>
          <p className="section-label">{t("werewolf.dayTitle", { round: state.round })}</p>
          <h2>{t("werewolf.dayDiscussionTitle")}</h2>
        </div>
      </div>
      {skipVoteConfirmOpen && (
        <GameConfirmDialog
          title={t("werewolf.confirmNoVoteNightTitle")}
          description={t("werewolf.confirmNoVoteNightDescription")}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("werewolf.startNightWithoutVote")}
          onCancel={() => setSkipVoteConfirmOpen(false)}
          onConfirm={() => {
            setSkipVoteConfirmOpen(false);
            actions.startNextNight();
          }}
        />
      )}
      <DayTimerPanel state={state} actions={actions} serverTime={serverTime} />
      <PlayerSelector
        players={alivePlayers}
        selectedId={pendingVoteId}
        onSelect={(playerId) => setPendingVoteId((current) => (current === playerId ? null : playerId))}
        title={t("werewolf.voteTitle")}
      />
    </section>
    ),
  });
}

function DayTimerPanel({
  state,
  actions,
  serverTime,
}: {
  state: WerewolfState;
  actions: Pick<WerewolfActions, "pauseDayTimer" | "resetDayTimer" | "setDayTimerDuration" | "startDayTimer">;
  serverTime?: number;
}) {
  const { t } = useI18n();
  const timer = ensureDayTimer(state.dayTimer);
  const now = useSyncedNow(serverTime, timer.status === "running");
  const remainingSeconds = dayTimerRemainingSeconds(timer, now);
  const expired = remainingSeconds === 0;
  const statusText = expired
    ? t("werewolf.dayTimerExpired")
    : timer.status === "running"
      ? t("werewolf.dayTimerRunning")
      : timer.status === "paused"
        ? t("werewolf.dayTimerPaused")
        : t("werewolf.dayTimerWaiting");
  const toggleLabel =
    timer.status === "running"
      ? t("werewolf.dayTimerPause")
      : timer.status === "paused"
        ? t("werewolf.dayTimerResume")
        : t("werewolf.dayTimerStart");
  const toggleIcon = timer.status === "running" ? <Pause /> : <Play />;
  const toggleAction = timer.status === "running" ? actions.pauseDayTimer : actions.startDayTimer;

  return (
    <section className={`day-timer-panel ${timer.status} ${expired ? "expired" : ""}`} aria-label={t("werewolf.dayTimer")}>
      <div className="day-timer-display">
        <Clock />
        <div>
          <p className="section-label">{t("werewolf.dayTimer")}</p>
          <strong>{formatDayTimer(remainingSeconds)}</strong>
          <span>{statusText}</span>
        </div>
      </div>
      <div className="day-timer-duration-grid" aria-label={t("werewolf.dayTimerDuration")} role="group">
        {dayTimerDurations.map((durationSeconds) => {
          const active = timer.durationSeconds === durationSeconds;
          const minutes = durationSeconds / 60;
          return (
            <button
              type="button"
              className={active ? "active" : ""}
              disabled={timer.status === "running"}
              aria-pressed={active}
              onClick={() => actions.setDayTimerDuration(durationSeconds)}
              key={durationSeconds}
            >
              {t("werewolf.dayTimerMinutes", { minutes })}
            </button>
          );
        })}
      </div>
      <div className="day-timer-actions">
        <button className="secondary-button compact" type="button" disabled={timer.status === "running" && expired} onClick={toggleAction}>
          {toggleIcon} {toggleLabel}
        </button>
        <button className="secondary-button compact" type="button" onClick={actions.resetDayTimer}>
          <RotateCcw /> {t("werewolf.dayTimerReset")}
        </button>
      </div>
    </section>
  );
}

function nextPublicEvent(state: WerewolfState) {
  return state.publicEvents[(state.publicEventIndex ?? 0) + 1] ?? null;
}

function publicEventLabel(event: WerewolfPublicEvent, t: ReturnType<typeof useI18n>["t"]) {
  if (event.type === "voteDeath") return t("werewolf.voteTitle");
  if (event.type === "loverDeath") return t("werewolf.stageLoverDeath");
  if (event.type === "hunterShot" || event.type === "hunterSkipped") return t("werewolf.hunterShotTitle");
  return t("werewolf.revealSummary");
}

function publicEventTitle(state: WerewolfState, event: WerewolfPublicEvent, t: ReturnType<typeof useI18n>["t"]) {
  if (event.type === "voteDeath") return t("werewolf.dayExecutionResult", { names: namesForIds(state, [event.playerId]) });
  if (event.type === "loverDeath") return t("werewolf.stageLoverDeathNamed", { name: namesForIds(state, [event.playerId]) });
  if (event.type === "hunterShot") return t("werewolf.stageHunterShotNamed", { name: namesForIds(state, [event.playerId]) });
  if (event.type === "hunterSkipped") return t("werewolf.stageHunterSkippedNamed", { name: namesForIds(state, [event.hunterId]) });
  return "";
}

function publicEventIcon(event: WerewolfPublicEvent) {
  if (event.type === "loverDeath") return <HeartCrack />;
  if (event.type === "hunterShot" || event.type === "hunterSkipped") return <Target />;
  return <Skull />;
}

function GmOnlyInfo({ text }: { text: string }) {
  const { t } = useI18n();

  return <ActionNotice className="gm-only-info" icon="info" title={t("werewolf.gmOnly")} text={text} />;
}

export function PlayerOverviewSheet({
  state,
  roomPlayers,
  onRoleInfo,
  onClose,
}: {
  state: WerewolfState;
  roomPlayers: RoomPlayerPublic[];
  onRoleInfo: (roleId: WerewolfState["players"][number]["roleId"]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const roomById = new Map(roomPlayers.map((player) => [player.id, player]));

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-sheet player-overview-sheet" role="dialog" aria-modal="true" aria-label={t("werewolf.playersOverview")}>
        <div className="panel-heading">
          <h3>{t("werewolf.playersOverview")}</h3>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="gm-player-overview-list">
          {(state.players ?? []).map((player) => {
            const roomPlayer = roomById.get(player.id);
            const roleId = getEffectiveRoleId(state, player);
            const roleText = roleDisplayText(state, player.id, t);
            const team = roleTeam(state, player);
            const statuses = playerOverviewStatuses(player, roomPlayer, state.phase === "roleReveal", t);
            return (
              <div className="gm-player-overview-row" key={player.id}>
                <RoleIconChip roleId={roleId} className="gm-player-overview-role-icon" />
                <span className="gm-player-overview-main">
                  <strong>{player.name}</strong>
                  <span className="gm-player-overview-statuses">
                    {statuses.map((status) => (
                      <span className={`gm-player-status-chip ${status.tone}`} key={`${player.id}-${status.icon}`}>
                        <StatusIconChip icon={status.icon} />
                        <span>{status.label}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <button className={`gm-role-button ${team === "werewolves" ? "evil" : "good"}`} type="button" title={roleText} onClick={() => onRoleInfo(roleId)}>
                  {roleText}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function playerOverviewStatuses(
  player: WerewolfState["players"][number],
  roomPlayer: RoomPlayerPublic | undefined,
  showRoleRevealStatus: boolean,
  t: ReturnType<typeof useI18n>["t"],
): Array<{ icon: WerewolfStatusIconId; label: string; tone: "danger" | "muted" | "ok" | "special" }> {
  return [
    player.alive
      ? { icon: "alive", label: t("common.alive"), tone: "ok" }
      : { icon: "eliminated", label: t("common.eliminated"), tone: "danger" },
    ...(roomPlayer
      ? [
          roomPlayer.connected
            ? { icon: "connected", label: t("common.connected"), tone: "ok" } as const
            : { icon: "disconnected", label: t("common.disconnected"), tone: "muted" } as const,
        ]
      : []),
    ...(showRoleRevealStatus
      ? [
          player.seenRole
            ? { icon: "ready", label: t("common.ready"), tone: "ok" } as const
            : { icon: "waiting", label: t("common.waiting"), tone: "muted" } as const,
        ]
      : []),
    ...(player.loverId ? [{ icon: "lover", label: t("werewolf.loversStatus"), tone: "special" } as const] : []),
  ];
}

function HunterShotSurface({ state, actions, renderShell }: { state: WerewolfState; actions: WerewolfActions; renderShell: RenderPlayShell }) {
  const { t } = useI18n();
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [skipShotConfirmOpen, setSkipShotConfirmOpen] = useState(false);
  const hunter = (state.players ?? []).find((player) => player.id === state.pendingHunterId);
  const targets = (state.players ?? []).filter((player) => player.alive && player.id !== state.pendingHunterId);
  const pendingTarget = pendingTargetId ? targets.find((player) => player.id === pendingTargetId) ?? null : null;

  return renderShell({
    title: t("werewolf.hunterShotTitle"),
    footer: (
      <button className="secondary-button full" type="button" aria-haspopup="dialog" onClick={() => setSkipShotConfirmOpen(true)}>
        {t("werewolf.hunterSkip")}
      </button>
    ),
    children: (
    <section className="game-surface">
      <div className="phase-heading">
        <Target />
        <div>
          <p className="section-label">{t("werewolf.hunterShotTitle")}</p>
          <h2>{t("werewolf.hunterShotPrompt", { name: hunter?.name ?? t("roles.hunter.name") })}</h2>
        </div>
      </div>
      <p className="result-note">{t("werewolf.hunterShotHint")}</p>
      {pendingTarget && (
        <GameConfirmDialog
          title={t("werewolf.confirmHunterShotTitle", { name: pendingTarget.name })}
          description={t("werewolf.confirmHunterShotDescription")}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("werewolf.hunterShotAction")}
          danger
          onCancel={() => setPendingTargetId(null)}
          onConfirm={() => {
            const playerId = pendingTarget.id;
            setPendingTargetId(null);
            actions.resolveHunterShot(playerId);
          }}
        />
      )}
      {skipShotConfirmOpen && (
        <GameConfirmDialog
          title={t("werewolf.confirmHunterSkipTitle")}
          description={t("werewolf.confirmHunterSkipDescription")}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("werewolf.hunterSkip")}
          onCancel={() => setSkipShotConfirmOpen(false)}
          onConfirm={() => {
            setSkipShotConfirmOpen(false);
            actions.resolveHunterShot(null);
          }}
        />
      )}
      <PlayerSelector
        players={targets}
        selectedId={pendingTargetId}
        onSelect={(playerId) => setPendingTargetId((current) => (current === playerId ? null : playerId))}
        title={t("werewolf.hunterShotTarget")}
      />
    </section>
    ),
  });
}

function GameOverSurface({ state, onReset, renderShell }: { state: WerewolfState; onReset: () => void; renderShell: RenderPlayShell }) {
  const { t } = useI18n();
  const titleKey: TranslationKey =
    state.winner === "werewolves"
      ? "werewolf.winnerWerewolves"
      : state.winner === "fool"
        ? "werewolf.winnerFool"
        : state.winner === "villageIdiot"
          ? "werewolf.winnerVillageIdiot"
          : state.winner === "lovers"
            ? "werewolf.winnerLovers"
            : "werewolf.winnerVillagers";

  return renderShell({
    title: t("werewolf.gameOverTitle"),
    footer: (
      <button className="primary-action compact" type="button" onClick={onReset}>
        {t("werewolf.newGame")}
      </button>
    ),
    children: (
    <section className="game-surface">
      <div className="phase-heading">
        <Skull />
        <div>
          <p className="section-label">{t("werewolf.gameOverTitle")}</p>
          <h2>{t(titleKey)}</h2>
        </div>
      </div>
      <div className="player-table">
        {(state.players ?? []).map((player) => (
          <div className="player-row" key={player.id}>
            <span>
              <strong>{player.name}</strong>
              <small>{roleDisplayText(state, player.id, t)}</small>
            </span>
            <span className={player.alive ? "valid-text" : "error-text"}>
              {player.alive ? t("common.alive") : t("common.eliminated")}
            </span>
          </div>
        ))}
      </div>
    </section>
    ),
  });
}

function AlphaWolfPanel({ state, onChange }: { state: WerewolfState; onChange: (value: boolean | null) => void }) {
  const { t } = useI18n();
  const victim = state.wolfTargetId ? (state.players ?? []).find((player) => player.id === state.wolfTargetId) : null;
  if (state.alphaWolfUsed) return <StepNote text={t("werewolf.alphaWolfUsed")} />;
  if (!state.wolfTargetId) return <StepNote text={t("werewolf.alphaWolfNeedsTarget")} />;
  if (!canAlphaWolfTransformTarget(state)) return <StepNote text={t("werewolf.alphaWolfBlocked")} />;

  return (
    <div className="night-action-stack alpha-wolf-panel">
      <div className="night-action-block">
        <div className="night-action-heading">
          <ActionIconChip icon="transform" />
          <div>
            <span>{t("werewolf.alphaWolfVictim")}</span>
            <strong>{victim?.name ?? t("common.unknown")}</strong>
          </div>
        </div>
      </div>
      <div className="night-action-choice-grid">
        <button type="button" className={state.alphaWolfTransform === false ? "active" : ""} onClick={() => onChange(state.alphaWolfTransform === false ? null : false)}>
          <ActionIconChip icon="kill" />
          <span className="night-action-choice-copy">
            <strong>{t("werewolf.keepKill")}</strong>
            <span>{t("werewolf.keepKillHint")}</span>
          </span>
        </button>
        <button type="button" className={state.alphaWolfTransform === true ? "active" : ""} onClick={() => onChange(state.alphaWolfTransform === true ? null : true)}>
          <ActionIconChip icon="transform" />
          <span className="night-action-choice-copy">
            <strong>{t("werewolf.transformTarget")}</strong>
            <span>{t("werewolf.transformTargetHint")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function WitchPanel({ state, actions }: { state: WerewolfState; actions: WerewolfActions }) {
  const { t } = useI18n();
  const poisonTargets = getValidTargets(state, "witchPoison");
  const victim = state.wolfTargetId ? (state.players ?? []).find((player) => player.id === state.wolfTargetId) : null;
  const canHealVictim = canWitchHealWolfTarget(state);

  return (
    <div className="night-action-stack witch-panel">
      <div className="panel-heading">
        <h3>{t("werewolf.witchPotions")}</h3>
      </div>
      {!state.witchHealUsed && victim && canHealVictim && (
        <div className="night-action-block witch-heal-action">
          <div className="night-action-heading">
            <ActionIconChip icon="heal" />
            <div>
              <strong>{t("werewolf.healPotion")}</strong>
              <span>{t("werewolf.wolfVictimAttacked", { name: victim.name })}</span>
            </div>
          </div>
          <button className={`night-action-button ${state.witchHealTonight ? "selected" : ""}`} type="button" onClick={() => actions.setWitchHealTonight(!state.witchHealTonight)}>
            {state.witchHealTonight ? t("werewolf.healPotionUsed") : t("werewolf.healAction")}
          </button>
        </div>
      )}
      {!state.witchHealUsed && victim && !canHealVictim && (
        <ActionNotice icon="protect" title={t("werewolf.healPotion")} text={t("werewolf.witchNoHealTarget")} />
      )}
      {state.witchPoisonUsed ? (
        <ActionNotice icon="poison" title={t("werewolf.poisonPotion")} text={t("werewolf.witchPoisonUsed")} />
      ) : (
        <div className="night-action-block witch-poison-action">
          <div className="night-action-heading">
            <ActionIconChip icon="poison" />
            <div>
              <strong>{t("werewolf.poisonPotion")}</strong>
              <span>{t("werewolf.poisonTarget")}</span>
            </div>
          </div>
          <InlinePlayerSelector
            players={poisonTargets}
            selectedId={state.witchPoisonTargetId}
            onSelect={actions.setWitchPoisonTarget}
            title={t("werewolf.poisonTarget")}
          />
        </div>
      )}
    </div>
  );
}

function PlayerSelector({
  players,
  selectedId,
  onSelect,
  title,
  actionLabel,
}: {
  players: WerewolfState["players"];
  selectedId: string | null;
  onSelect: (playerId: string | null) => void;
  title: string;
  actionLabel?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="panel player-selector-panel">
      <div className="panel-heading">
        <h3>{title}</h3>
      </div>
      <div className="player-grid">
        {players.length === 0 && <p className="muted-text">{t("werewolf.noValidTargets")}</p>}
        {players.map((player) => (
          <button
            key={player.id}
            className={selectedId === player.id ? "selected" : ""}
            type="button"
            onClick={() => onSelect(selectedId === player.id ? null : player.id)}
          >
            <strong>{player.name}</strong>
            {actionLabel && <span>{actionLabel}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function InlinePlayerSelector({
  players,
  selectedId,
  onSelect,
  title,
}: {
  players: WerewolfState["players"];
  selectedId: string | null;
  onSelect: (playerId: string | null) => void;
  title: string;
}) {
  const { t } = useI18n();

  return (
    <div className="inline-player-selector">
      <div className="panel-heading">
        <h3>{title}</h3>
      </div>
      <div className="player-grid">
        {players.length === 0 && <p className="muted-text">{t("werewolf.noValidTargets")}</p>}
        {players.map((player) => (
          <button
            key={player.id}
            className={selectedId === player.id ? "selected" : ""}
            type="button"
            onClick={() => onSelect(selectedId === player.id ? null : player.id)}
          >
            <strong>{player.name}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiPlayerSelector({
  players,
  selectedIds,
  onSelect,
  title,
  max,
}: {
  players: WerewolfState["players"];
  selectedIds: string[];
  onSelect: (playerIds: string[]) => void;
  title: string;
  max: number;
}) {
  const { t } = useI18n();

  return (
    <div className="panel player-selector-panel">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span>
          {selectedIds.length}/{max}
        </span>
      </div>
      <div className="player-grid">
        {players.length === 0 && <p className="muted-text">{t("werewolf.noValidTargets")}</p>}
        {players.map((player) => {
          const selected = selectedIds.includes(player.id);
          return (
            <button
              key={player.id}
              className={selected ? "selected" : ""}
              type="button"
              onClick={() => {
                if (selected) {
                  onSelect(selectedIds.filter((id) => id !== player.id));
                  return;
                }
                if (selectedIds.length < max) onSelect([...selectedIds, player.id]);
              }}
            >
              <strong>{player.name}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepNote({ text }: { text: string }) {
  return <p className="result-note">{text}</p>;
}

function ActionNotice({
  icon,
  title,
  text,
  className = "",
}: {
  icon: WerewolfActionIconId;
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <div className={["night-action-note", className].filter(Boolean).join(" ")}>
      <ActionIconChip icon={icon} />
      <span>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </div>
  );
}

function NightResultCard({ result }: { result: NightResultView }) {
  return (
    <p className={`night-result-card ${result.tone}`} role="status" aria-live="polite">
      <ActionIconChip icon={result.icon} className="night-result-icon" />
      <span>{result.text}</span>
    </p>
  );
}

function TeamBadge({ team }: { team: ReturnType<typeof roleTeam> }) {
  const { t } = useI18n();
  const evil = team === "werewolves";

  return (
    <span className={`night-report-team-badge ${evil ? "evil" : "good"}`}>
      <ActionIconChip icon={evil ? "evil" : "good"} className="night-report-team-icon" />
      {t(evil ? "werewolf.teamEvil" : "werewolf.teamGood")}
    </span>
  );
}

function revealedNightResult(state: WerewolfState, step: NightStepId, t: ReturnType<typeof useI18n>["t"]): NightResultView | null {
  if (step === "seer" && state.inspectedPlayerId && state.seerResultRevealed) {
    return inspectResult(state, state.inspectedPlayerId, t);
  }
  if (step === "auraSeer" && state.auraTargetId && state.auraResultRevealed) {
    return auraResult(state, state.auraTargetId, t);
  }
  if (step === "detective" && state.detectiveTargetIds.length === 2 && state.detectiveResultRevealed) {
    return detectiveResult(state, state.detectiveTargetIds, t);
  }
  return null;
}

function inspectResult(state: WerewolfState, playerId: string, t: ReturnType<typeof useI18n>["t"]): NightResultView | null {
  const player = (state.players ?? []).find((candidate) => candidate.id === playerId);
  if (!player) return null;

  return {
    icon: "inspect",
    text: t("werewolf.inspectResult", {
      name: player.name,
      role: roleDisplayText(state, player.id, t),
    }),
    tone: resultToneForTeam(roleTeam(state, player)),
  };
}

function auraResult(state: WerewolfState, playerId: string, t: ReturnType<typeof useI18n>["t"]): NightResultView | null {
  const player = (state.players ?? []).find((candidate) => candidate.id === playerId);
  if (!player) return null;

  const tone = resultToneForTeam(roleTeam(state, player));
  return {
    icon: "aura",
    text: t("werewolf.auraResult", {
      name: player.name,
      team: t(tone === "evil" ? "werewolf.teamEvil" : "werewolf.teamGood"),
    }),
    tone,
  };
}

function detectiveResult(state: WerewolfState, targetIds: string[], t: ReturnType<typeof useI18n>["t"]): NightResultView | null {
  const players = targetIds
    .map((id) => (state.players ?? []).find((player) => player.id === id))
    .filter(Boolean) as WerewolfState["players"];
  if (players.length !== 2) return null;

  const sameTeam = roleTeam(state, players[0]) === roleTeam(state, players[1]);
  return {
    icon: "detective",
    text: t(sameTeam ? "werewolf.detectiveSameTeam" : "werewolf.detectiveDifferentTeam", {
      first: players[0].name,
      second: players[1].name,
    }),
    tone: sameTeam ? "good" : "evil",
  };
}

function resultToneForTeam(team: ReturnType<typeof roleTeam>): NightResultTone {
  return team === "werewolves" ? "evil" : "good";
}

function RevealSummary({ state, ids }: { state: WerewolfState; ids: string[] }) {
  const { t } = useI18n();
  const revealMode = state.options?.revealMode ?? "role";
  const revealedPlayers = ids
    .map((id) => (state.players ?? []).find((candidate) => candidate.id === id))
    .filter(Boolean) as WerewolfState["players"];

  if (revealedPlayers.length === 0 || revealMode === "hidden") return null;

  return (
    <div className="panel reveal-summary">
      <div className="panel-heading">
        <h3>{t("werewolf.revealSummary")}</h3>
      </div>
      <div className="player-table">
        {revealedPlayers.map((player) => {
          return (
            <div className="player-row" key={player.id}>
              <strong>{player.name}</strong>
              <span>
                {revealMode === "team"
                  ? t(roleTeam(state, player) === "werewolves" ? "werewolf.teamEvil" : "werewolf.teamGood")
                  : roleDisplayText(state, player.id, t)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameLog({ entries = [] }: { entries?: WerewolfLogEntry[] }) {
  const { t } = useI18n();
  const visibleEntries = entries.filter(Boolean);

  if (visibleEntries.length === 0) return <p className="muted-text">{t("werewolf.gameLogEmpty")}</p>;

  return (
    <ol className="log-list">
      {visibleEntries.map((entry) => (
        <li key={entry.id}>{logText(entry, t)}</li>
      ))}
    </ol>
  );
}

function GameLogSheet({ entries, onClose }: { entries?: WerewolfLogEntry[]; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-sheet game-log-sheet" role="dialog" aria-modal="true" aria-label={t("werewolf.gameLog")}>
        <div className="panel-heading">
          <h3>{t("werewolf.gameLog")}</h3>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X />
          </button>
        </div>
        <GameLog entries={entries} />
      </section>
    </div>
  );
}

function canAdvanceNightStep(state: WerewolfState, step: NightStepId, active: boolean) {
  if (!active) return true;
  if (step === "cupid") return state.cupidTargetIds.length === 2 || getValidTargets(state, "cupid").length < 2;
  if (step === "wildChild") return Boolean(state.wildChildModelId) || getValidTargets(state, "wildChild").length === 0;
  if (step === "nightGuest") return Boolean(state.nightGuestHostId) || getValidTargets(state, "nightGuest").length === 0;
  if (step === "protector") return Boolean(state.protectedPlayerId) || getValidTargets(state, "protector").length === 0;
  if (step === "wolves") return state.wolvesSkipNextNight || Boolean(state.wolfTargetId) || getValidTargets(state, "wolves").length === 0;
  if (step === "alphaWolf") return state.alphaWolfTransform !== null || !canAlphaWolfTransformTarget(state);
  if (step === "seer") return Boolean(state.inspectedPlayerId && state.seerResultRevealed) || getValidTargets(state, "seer").length === 0;
  if (step === "auraSeer") return Boolean(state.auraTargetId && state.auraResultRevealed) || getValidTargets(state, "auraSeer").length === 0;
  if (step === "detective") return (state.detectiveTargetIds.length === 2 && state.detectiveResultRevealed) || getValidTargets(state, "detective").length < 2;
  return true;
}

function pendingNightResultRevealStep(state: WerewolfState, step: NightStepId) {
  if (step === "seer" && state.inspectedPlayerId && !state.seerResultRevealed) return "seer";
  if (step === "auraSeer" && state.auraTargetId && !state.auraResultRevealed) return "auraSeer";
  if (step === "detective" && state.detectiveTargetIds.length === 2 && !state.detectiveResultRevealed) return "detective";
  return null;
}

function nightStepDescriptionText(step: NightStepId, t: ReturnType<typeof useI18n>["t"]) {
  const keys: Record<NightStepId, TranslationKey> = {
    sleep: "werewolf.stepSleepDescription",
    cupid: "werewolf.stepCupidDescription",
    lovers: "werewolf.stepLoversDescription",
    wildChild: "werewolf.stepWildChildDescription",
    nightGuest: "werewolf.stepNightGuestDescription",
    protector: "werewolf.stepProtectorDescription",
    wolves: "werewolf.stepWolvesDescription",
    cursedInfo: "werewolf.stepCursedDescription",
    alphaWolf: "werewolf.stepAlphaWolfDescription",
    alphaWolfInfo: "werewolf.stepAlphaWolfInfoDescription",
    seer: "werewolf.stepSeerDescription",
    auraSeer: "werewolf.stepAuraSeerDescription",
    detective: "werewolf.stepDetectiveDescription",
    witch: "werewolf.stepWitchDescription",
    toughGuyInfo: "werewolf.stepToughGuyInfoDescription",
    dawn: "werewolf.stepDawnDescription",
  };
  return t(keys[step]);
}

function nightStepText(step: NightStepId, t: ReturnType<typeof useI18n>["t"]) {
  const keys: Record<NightStepId, Parameters<typeof t>[0]> = {
    sleep: "werewolf.stepSleep",
    cupid: "werewolf.stepCupid",
    lovers: "werewolf.stepLovers",
    wildChild: "werewolf.stepWildChild",
    nightGuest: "werewolf.stepNightGuest",
    protector: "werewolf.stepProtector",
    wolves: "werewolf.stepWolves",
    cursedInfo: "werewolf.stepCursedInfo",
    alphaWolf: "werewolf.stepAlphaWolf",
    alphaWolfInfo: "werewolf.stepAlphaWolfInfo",
    seer: "werewolf.stepSeer",
    auraSeer: "werewolf.stepAuraSeer",
    detective: "werewolf.stepDetective",
    witch: "werewolf.stepWitch",
    toughGuyInfo: "werewolf.stepToughGuyInfo",
    dawn: "werewolf.stepDawn",
  };
  return t(keys[step]);
}

function logText(entry: WerewolfLogEntry, t: ReturnType<typeof useI18n>["t"]) {
  if (entry.type === "nightDeath" || entry.type === "dayElimination" || entry.type === "roleConverted" || entry.type === "toughGuyWounded") {
    return t(`log.${entry.type}` as TranslationKey, { name: entry.playerName ?? "" });
  }
  if (entry.type === "hunterShot") {
    return t("log.hunterShot", { name: entry.playerName ?? "" });
  }
  if (entry.type === "specialWin" && entry.playerName) {
    return t("log.specialWinNamed", { name: entry.playerName });
  }
  return t(`log.${entry.type}` as TranslationKey);
}

function namesForIds(state: WerewolfState, ids: string[] = []) {
  return ids
    .map((id) => (state.players ?? []).find((player) => player.id === id)?.name)
    .filter(Boolean)
    .join(", ");
}

function roleDisplayText(state: WerewolfState, playerId: string, t: ReturnType<typeof useI18n>["t"]) {
  const player = (state.players ?? []).find((candidate) => candidate.id === playerId);
  if (!player) return "";
  const effectiveRole = getEffectiveRoleId(state, player);
  const role = roleDefinitionFor(effectiveRole);
  const originalRole = roleDefinitionFor(player.originalRoleId);
  const current = t(role.nameKey);
  const details = [
    ...(effectiveRole === player.originalRoleId ? [] : [t("werewolf.formerRole", { role: t(originalRole.nameKey) })]),
    ...(player.alphaWolfInfected ? [t("werewolf.wolfAlignedStatus")] : []),
  ];
  return details.length === 0 ? current : `${current} (${details.join(", ")})`;
}

function roleDefinitionFor(roleId: WerewolfState["players"][number]["roleId"]) {
  return roleDefinitions[roleId] ?? roleDefinitions.villager;
}

function roleTeam(state: WerewolfState, player: WerewolfState["players"][number]) {
  return playerTeamInState(state, player);
}
