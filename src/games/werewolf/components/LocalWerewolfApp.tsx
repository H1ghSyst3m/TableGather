import { ChevronLeft, Dice5, Plus, Shuffle, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  advanceNightStep,
  advancePublicEvent,
  createWerewolfGame,
  createWerewolfGameFromAssignments,
  eliminateByVote,
  finishRoleReveal,
  markRoleSeen,
  pauseDayTimer,
  revealNightResult,
  resetDayTimer,
  resolveNight,
  resolveHunterShot,
  setAlphaWolfTransform,
  setAuraTarget,
  setCupidTargets,
  setDayTimerDuration,
  setDetectiveTargets,
  setInspectedPlayer,
  setNightGuestHost,
  setProtectedPlayer,
  setWildChildModel,
  setWitchHealTonight,
  setWitchPoisonTarget,
  setWolfTarget,
  startDay,
  startDayTimer,
  startNextNight,
} from "../domain/engine";
import { roleDefinitions, roleOrder } from "../domain/roles";
import {
  autoFillVillagers,
  createDefaultRoleCounts,
  defaultWerewolfOptions,
  roleCountTotal,
  sanitizeRoleCount,
  validateRoleCounts,
} from "../domain/setup";
import { areWerewolfStatesEqual, cloneWerewolfState, resetRestoredDayTimer } from "../domain/state";
import type { RoleCounts, RoleId, WerewolfOptions, WerewolfState } from "../domain/types";
import { ensureDayTimer } from "../domain/timer";
import { useI18n } from "../../../i18n/useI18n";
import { GameConfirmDialog } from "../../../components/GameConfirmDialog";
import { hasDuplicatePlayerName, normalizePlayerName } from "../../../playerNames";
import { RoleCountEditor } from "./RoleCountEditor";
import { RoleRevealScreen } from "./RoleRevealScreen";
import { GameRulesButton } from "./RoleRulesModal";
import { WerewolfFlowShell } from "./WerewolfFlowShell";
import { WerewolfPlaySurface } from "./WerewolfPlaySurface";
import { loadWerewolfHostOptions, saveWerewolfHostOptions } from "../hostOptionsStorage";

const STORAGE_KEY = "tablegather-werewolf-local";

type SetupStep = 1 | 2;
type AssignMode = "random" | "manual" | null;

interface SetupPlayer {
  id: string;
  name: string;
}

export function LocalWerewolfApp({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useI18n();
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [players, setPlayers] = useState<SetupPlayer[]>([]);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [counts, setCounts] = useState<RoleCounts>(() => createDefaultRoleCounts(5));
  const [options, setOptions] = useState<WerewolfOptions>(() => loadWerewolfHostOptions());
  const [assignMode, setAssignMode] = useState<AssignMode>(null);
  const [manualAssign, setManualAssign] = useState<Record<string, RoleId | undefined>>({});
  const [randomPreview, setRandomPreview] = useState<WerewolfState | null>(null);
  const [state, setState] = useState<WerewolfState | null>(() => loadSavedGame());
  const [undoState, setUndoState] = useState<WerewolfState | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);

  useEffect(() => {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const displayCounts = useMemo(() => autoFillVillagers(counts, players.length), [counts, players.length]);
  const validation = useMemo(() => validateRoleCounts(players.length, displayCounts), [players.length, displayCounts]);
  const assignedCounts = useMemo(() => countManualAssignments(manualAssign), [manualAssign]);
  const allManualAssigned = useMemo(
    () =>
      players.length > 0 &&
      players.every((player) => manualAssign[player.id]) &&
      roleOrder.every((roleId) => sanitizeRoleCount(displayCounts, roleId) === (assignedCounts[roleId] ?? 0)),
    [assignedCounts, displayCounts, manualAssign, players],
  );

  const addPlayer = () => {
    const trimmedName = normalizePlayerName(name);
    if (!trimmedName) {
      setNameError(t("errors.nameRequired"));
      return;
    }
    if (hasDuplicatePlayerName(players.map((player) => player.name), trimmedName)) {
      setNameError(t("errors.nameAlreadyTaken"));
      return;
    }

    setPlayers((current) => [...current, createSetupPlayer(trimmedName)]);
    setName("");
    setNameError(null);
  };

  const updateOptions = (nextOptions: WerewolfOptions) => {
    setOptions(nextOptions);
    saveWerewolfHostOptions(nextOptions);
  };

  const startRandomAssignment = () => {
    setAssignMode("random");
    setRandomPreview(createRandomPreview(players, displayCounts, options));
  };

  const reshuffle = () => {
    setRandomPreview(createRandomPreview(players, displayCounts, options));
  };

  const startRandomGame = () => {
    setUndoState(null);
    setState(randomPreview ?? createRandomPreview(players, displayCounts, options));
  };

  const startManualGame = () => {
    if (!allManualAssigned) return;
    setUndoState(null);
    setState(
      createWerewolfGameFromAssignments(
        players.map((player) => ({
          id: player.id,
          name: player.name,
          roleId: manualAssign[player.id] ?? "villager",
        })),
        options,
      ),
    );
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    if (state) setPlayers(state.players.map((player) => createSetupPlayer(player.name)));
    setUndoState(null);
    setState(null);
    setSetupStep(1);
    setAssignMode(null);
    setManualAssign({});
    setRandomPreview(null);
  };
  const settingsActions = (
    <>
      <GameRulesButton options={state?.options ?? options} />
      {state && (
        <button className="text-button danger settings-danger-action" type="button" onClick={() => setAbortOpen(true)}>
          {t("werewolf.abortGame")}
        </button>
      )}
    </>
  );
  const confirmDialogs = abortOpen ? (
    <GameConfirmDialog
      title={t("werewolf.abortGameTitle")}
      description={t("werewolf.abortGameDescription")}
      cancelLabel={t("werewolf.keepPlaying")}
      confirmLabel={t("werewolf.backToLobby")}
      onCancel={() => setAbortOpen(false)}
      onConfirm={() => {
        reset();
        setAbortOpen(false);
      }}
    />
  ) : null;
  const setupBack = () => {
    if (setupStep === 2) {
      if (assignMode) {
        setAssignMode(null);
        setRandomPreview(null);
        setManualAssign({});
        return;
      }
      setSetupStep(1);
      return;
    }

    navigate("/");
  };
  const updateStateWithUndo = (updater: (current: WerewolfState) => WerewolfState) => {
    if (!state) return;
    const nextState = updater(state);
    if (!areWerewolfStatesEqual(state, nextState)) setUndoState(cloneWerewolfState(state));
    setState(nextState);
  };
  const updateStateWithoutUndo = (updater: (current: WerewolfState) => WerewolfState) => {
    if (!state) return;
    const nextState = updater(state);
    if (nextState !== state) setUndoState(null);
    setState(nextState);
  };
  const undoStep = () => {
    if (!undoState) return;
    setState(resetRestoredDayTimer(cloneWerewolfState(undoState)));
    setUndoState(null);
  };

  if (state?.phase === "roleReveal") {
    return (
      <RoleRevealScreen
        players={state.players}
        showRoleInfo
        showRoleInfoIdentity={false}
        onPlayerDone={(playerId) => setState((current) => (current ? markRoleSeen(current, playerId) : current))}
        onDone={() => setState((current) => (current ? finishRoleReveal(current) : current))}
        layout={({ screen, footer }) => (
          <WerewolfFlowShell title={t("werewolf.roleReveal")} onBack={() => navigate("/")} settingsActions={settingsActions} footer={footer}>
            {screen}
            {confirmDialogs}
          </WerewolfFlowShell>
        )}
      />
    );
  }

  if (state) {
    return (
      <>
        <WerewolfPlaySurface
          state={state}
          canUndo={Boolean(undoState)}
          onBack={() => navigate("/")}
          settingsActions={settingsActions}
          actions={{
            setProtectedPlayer: (playerId) => setState((current) => (current ? setProtectedPlayer(current, playerId) : current)),
            setNightGuestHost: (playerId) => setState((current) => (current ? setNightGuestHost(current, playerId) : current)),
            setWildChildModel: (playerId) => setState((current) => (current ? setWildChildModel(current, playerId) : current)),
            setCupidTargets: (playerIds) => setState((current) => (current ? setCupidTargets(current, playerIds) : current)),
            setInspectedPlayer: (playerId) => setState((current) => (current ? setInspectedPlayer(current, playerId) : current)),
            setAuraTarget: (playerId) => setState((current) => (current ? setAuraTarget(current, playerId) : current)),
            setDetectiveTargets: (playerIds) => setState((current) => (current ? setDetectiveTargets(current, playerIds) : current)),
            revealNightResult: (step) => updateStateWithoutUndo((current) => revealNightResult(current, step)),
            setWolfTarget: (playerId) => setState((current) => (current ? setWolfTarget(current, playerId) : current)),
            setAlphaWolfTransform: (value) => setState((current) => (current ? setAlphaWolfTransform(current, value) : current)),
            setWitchHealTonight: (value) => setState((current) => (current ? setWitchHealTonight(current, value) : current)),
            setWitchPoisonTarget: (playerId) => setState((current) => (current ? setWitchPoisonTarget(current, playerId) : current)),
            advanceNightStep: () => updateStateWithUndo(advanceNightStep),
            advancePublicEvent: () => updateStateWithUndo(advancePublicEvent),
            resolveNight: () => updateStateWithUndo(resolveNight),
            resolveHunterShot: (playerId) => updateStateWithUndo((current) => resolveHunterShot(current, playerId)),
            eliminateByVote: (playerId) => updateStateWithUndo((current) => eliminateByVote(current, playerId)),
            startDay: () => updateStateWithUndo(startDay),
            setDayTimerDuration: (durationSeconds) => setState((current) => (current ? setDayTimerDuration(current, durationSeconds) : current)),
            startDayTimer: () => setState((current) => (current ? startDayTimer(current) : current)),
            pauseDayTimer: () => setState((current) => (current ? pauseDayTimer(current) : current)),
            resetDayTimer: () => setState((current) => (current ? resetDayTimer(current) : current)),
            startNextNight: () => updateStateWithUndo(startNextNight),
            undoStep,
            reset,
          }}
        />
        {confirmDialogs}
      </>
    );
  }

  return (
    <WerewolfFlowShell
      title={setupStep === 1 ? t("werewolf.setupTitle") : t("werewolf.setupAssignmentTitle")}
      onBack={setupBack}
      settingsActions={settingsActions}
      footer={
        setupStep === 1 ? (
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              setCounts(autoFillVillagers(counts, players.length));
              setAssignMode(null);
              setManualAssign({});
              setRandomPreview(null);
              setSetupStep(2);
            }}
            disabled={!validation.valid}
          >
            {players.length < 5 ? t("werewolf.minPlayers") : t("werewolf.nextAssignment")}
          </button>
        ) : assignMode === "random" ? (
          <div className="werewolf-flow-action-stack">
            <button className="primary-action" type="button" onClick={startRandomGame}>
              {t("werewolf.startGame")}
            </button>
            <button className="secondary-button full" type="button" onClick={reshuffle}>
              <Shuffle /> {t("werewolf.reshuffle")}
            </button>
          </div>
        ) : assignMode === "manual" ? (
          <button className="primary-action" type="button" disabled={!allManualAssigned} onClick={startManualGame}>
            {allManualAssigned ? t("werewolf.startGame") : t("werewolf.assignmentIncomplete")}
          </button>
        ) : null
      }
    >
      {loadSavedGame() && (
        <section className="panel restore-panel">
          <h2>{t("werewolf.restoreTitle")}</h2>
          <p>{t("werewolf.restoreDescription")}</p>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => setState(loadSavedGame())}>
              {t("common.continue")}
            </button>
            <button className="text-button" type="button" onClick={reset}>
              {t("common.reset")}
            </button>
          </div>
        </section>
      )}

      {setupStep === 1 && (
        <SetupShell
          step={1}
        >
          <section className="setup-hero">
            <p className="section-label">{t("hub.passAndPlay")}</p>
            <h2>{t("werewolf.setupTitle")}</h2>
            <p>{t("werewolf.setupSubtitle")}</p>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h3>{t("werewolf.playerList")}</h3>
              <span>{players.length}</span>
            </div>
            <form
              className="add-player-form"
              onSubmit={(event) => {
                event.preventDefault();
                addPlayer();
              }}
            >
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                placeholder={t("werewolf.addPlayerPlaceholder")}
              />
              <button type="submit" aria-label={t("common.add")}>
                <Plus />
              </button>
            </form>
            {nameError && <p className="error-text">{nameError}</p>}
            {players.length > 0 && (
              <div className="button-row setup-button-row">
                <button className="text-button danger" type="button" onClick={() => setPlayers([])}>
                  <Trash2 /> {t("werewolf.clearPlayers")}
                </button>
              </div>
            )}
            <div className="player-table">
              {players.map((player) => (
                <div className="player-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <button type="button" onClick={() => setPlayers((current) => current.filter((item) => item.id !== player.id))}>
                    <X />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <RoleCountEditor playerCount={players.length} counts={displayCounts} onChange={setCounts} options={options} onOptionsChange={updateOptions} />
        </SetupShell>
      )}

      {setupStep === 2 && (
        <SetupShell
          step={2}
        >
          {!assignMode && (
            <section className="assignment-choice">
              <button type="button" className="mode-button active" onClick={startRandomAssignment}>
                <span className="mode-icon">
                  <Dice5 />
                </span>
                <span className="row-main">
                  <strong>{t("werewolf.randomAssignment")}</strong>
                  <span>{t("werewolf.randomAssignmentHint")}</span>
                </span>
              </button>
              <button type="button" className="mode-button" onClick={() => setAssignMode("manual")}>
                <span className="mode-icon">
                  <ChevronLeft />
                </span>
                <span className="row-main">
                  <strong>{t("werewolf.manualAssignment")}</strong>
                  <span>{t("werewolf.manualAssignmentHint")}</span>
                </span>
              </button>
            </section>
          )}

          {assignMode === "random" && randomPreview && (
            <section className="panel">
              <div className="panel-heading">
                <h3>{t("werewolf.assignedRoles")}</h3>
                <span>{roleCountTotal(displayCounts)}</span>
              </div>
              <AssignmentPreview players={randomPreview.players} />
            </section>
          )}

          {assignMode === "manual" && (
            <section className="panel">
              <div className="panel-heading">
                <h3>{t("werewolf.manualAssignment")}</h3>
              </div>
              <QuotaBadges counts={displayCounts} assignedCounts={assignedCounts} />
              <div className="manual-assignment-list">
                {players.map((player) => (
                  <label className="manual-assignment-row" key={player.id}>
                    <span>{player.name}</span>
                    <select
                      value={manualAssign[player.id] ?? ""}
                      onChange={(event) =>
                        setManualAssign((current) => ({
                          ...current,
                          [player.id]: (event.target.value as RoleId) || undefined,
                        }))
                      }
                    >
                      <option value="">{t("werewolf.chooseRole")}</option>
                      {availableRolesForPlayer(displayCounts, manualAssign, player.id).map((roleId) => (
                        <option key={roleId} value={roleId}>
                          {t(roleDefinitions[roleId].nameKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          )}
        </SetupShell>
      )}
    </WerewolfFlowShell>
  );
}

function SetupShell({
  step,
  children,
}: {
  step: SetupStep;
  children: ReactNode;
}) {
  return (
    <section className="setup-shell">
      <div className="setup-shell-progress">
        <span>{step} / 2</span>
      </div>
      <div className="setup-shell-content">{children}</div>
    </section>
  );
}

function AssignmentPreview({ players }: { players: WerewolfState["players"] }) {
  const { t } = useI18n();
  return (
    <div className="player-table">
      {players.map((player) => (
        <div className="player-row" key={player.id}>
          <strong>{player.name}</strong>
          <span>{t(roleDefinitions[player.roleId].nameKey)}</span>
        </div>
      ))}
    </div>
  );
}

function QuotaBadges({ counts, assignedCounts }: { counts: RoleCounts; assignedCounts: RoleCounts }) {
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

function availableRolesForPlayer(counts: RoleCounts, manualAssign: Record<string, RoleId | undefined>, playerId: string) {
  return roleOrder.filter((roleId) => {
    const total = sanitizeRoleCount(counts, roleId);
    if (total <= 0) return false;
    const usedByOthers = Object.entries(manualAssign).filter(([id, value]) => id !== playerId && value === roleId).length;
    return total - usedByOthers > 0 || manualAssign[playerId] === roleId;
  });
}

function countManualAssignments(manualAssign: Record<string, RoleId | undefined>): RoleCounts {
  return Object.values(manualAssign).reduce<RoleCounts>((counts, roleId) => {
    if (!roleId) return counts;
    return { ...counts, [roleId]: sanitizeRoleCount(counts, roleId) + 1 };
  }, {});
}

function createRandomPreview(players: SetupPlayer[], counts: RoleCounts, options: WerewolfOptions) {
  return createWerewolfGame(
    players.map((player) => player.name),
    counts,
    Math.random,
    players.map((player) => player.id),
    options,
  );
}

function createSetupPlayer(name: string): SetupPlayer {
  return { id: Math.random().toString(36).slice(2, 10), name };
}

function loadSavedGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeSavedGame(JSON.parse(raw) as WerewolfState);
  } catch {
    return null;
  }
}

function normalizeSavedGame(state: WerewolfState): WerewolfState {
  return {
    ...state,
    options: state.options ?? defaultWerewolfOptions,
    players: state.players.map((player) => ({
      ...player,
      originalRoleId: player.originalRoleId ?? player.roleId,
      alphaWolfInfected: player.alphaWolfInfected ?? false,
      loverId: player.loverId ?? null,
    })),
    protectorLastTargetId: state.protectorLastTargetId ?? null,
    nightGuestHostId: state.nightGuestHostId ?? null,
    wildChildModelId: state.wildChildModelId ?? null,
    cupidTargetIds: state.cupidTargetIds ?? [],
    inspectedPlayerId: state.inspectedPlayerId ?? null,
    seerResultRevealed: state.seerResultRevealed ?? false,
    auraTargetId: state.auraTargetId ?? null,
    auraResultRevealed: state.auraResultRevealed ?? false,
    detectiveTargetIds: state.detectiveTargetIds ?? [],
    detectiveResultRevealed: state.detectiveResultRevealed ?? false,
    cursedConvertedTonightId: state.cursedConvertedTonightId ?? null,
    alphaWolfTransform: state.alphaWolfTransform ?? null,
    alphaWolfUsed: state.alphaWolfUsed ?? false,
    witchHealUsed: state.witchHealUsed ?? false,
    witchPoisonUsed: state.witchPoisonUsed ?? false,
    witchHealTonight: state.witchHealTonight ?? false,
    witchPoisonTargetId: state.witchPoisonTargetId ?? null,
    wolvesSkipNextNight: state.wolvesSkipNextNight ?? false,
    toughGuyWoundedId: state.toughGuyWoundedId ?? null,
    toughGuyWoundedTonightId: state.toughGuyWoundedTonightId ?? null,
    nightResolved: state.nightResolved ?? false,
    lastNightDeaths: state.lastNightDeaths ?? [],
    lastDayDeaths: state.lastDayDeaths ?? [],
    pendingHunterId: state.pendingHunterId ?? null,
    pendingHunterQueue: state.pendingHunterQueue ?? [],
    pendingHunterSource: state.pendingHunterSource ?? null,
    publicEvents: state.publicEvents ?? [],
    publicEventIndex: state.publicEventIndex ?? 0,
    dayTimer: ensureDayTimer(state.dayTimer),
  };
}
