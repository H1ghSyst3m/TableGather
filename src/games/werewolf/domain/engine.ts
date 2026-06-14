import { effectiveRoleId, playerTeam, playerTeamInState } from "./alignment";
import { roleOrder } from "./roles";
import { autoFillVillagers, defaultWerewolfOptions, sanitizeRoleCount, validateRoleCounts } from "./setup";
import { getNightStepActors, isNightStepActive, isValidTarget } from "./targets";
import {
  createDayTimer,
  ensureDayTimer,
  pauseDayTimerValue,
  resetDayTimerValue,
  setDayTimerDurationValue,
  startDayTimerValue,
} from "./timer";
import type {
  NightStepId,
  RoleCounts,
  RoleId,
  WerewolfLogEntry,
  WerewolfLogPhase,
  WerewolfLogPrivacy,
  WerewolfLogResult,
  WerewolfLogTeam,
  WerewolfOptions,
  WerewolfPlayer,
  WerewolfPublicEvent,
  WerewolfState,
  Winner,
} from "./types";

type RandomSource = () => number;

export interface AssignedWerewolfPlayer {
  id?: string;
  name: string;
  roleId: RoleId;
}

export function createWerewolfGame(
  names: string[],
  counts: RoleCounts,
  random: RandomSource = Math.random,
  playerIds?: string[],
  options: WerewolfOptions = defaultWerewolfOptions,
): WerewolfState {
  const normalizedNames = names.map((name) => name.trim()).filter(Boolean);
  const displayCounts = autoFillVillagers(counts, normalizedNames.length);
  const validation = validateRoleCounts(normalizedNames.length, displayCounts);
  if (!validation.valid) {
    throw new Error(`Invalid role counts: ${validation.reason}`);
  }

  const roles = shuffle(expandRoles(displayCounts), random);
  const players = normalizedNames.map<WerewolfPlayer>((name, index) =>
    createPlayer({
      id: playerIds?.[index] ?? createId(),
      name,
      roleId: roles[index] ?? "villager",
      seenRole: !options.roleReveal,
    }),
  );

  return createWerewolfState(players, options);
}

export function createWerewolfGameFromAssignments(
  assignments: AssignedWerewolfPlayer[],
  options: WerewolfOptions = defaultWerewolfOptions,
): WerewolfState {
  const players = assignments
    .map((assignment) => ({ ...assignment, name: assignment.name.trim() }))
    .filter((assignment) => assignment.name)
    .map<WerewolfPlayer>((assignment) =>
      createPlayer({
        id: assignment.id ?? createId(),
        name: assignment.name,
        roleId: assignment.roleId,
        seenRole: !options.roleReveal,
      }),
    );

  if (players.length < 5) {
    throw new Error("Invalid role counts: minimum");
  }

  return createWerewolfState(players, options);
}

export function buildNightSteps(players: WerewolfPlayer[], round = 1): NightStepId[] {
  const presentRoles = new Set(players.map((player) => player.originalRoleId ?? player.roleId));
  const currentRoles = new Set(players.map((player) => player.roleId));
  const hasAlphaWolfInfectedPlayer = players.some((player) => player.alphaWolfInfected);
  const steps: NightStepId[] = ["sleep"];

  if (round === 1 && presentRoles.has("cupid")) {
    steps.push("cupid", "lovers");
  }
  if (round === 1 && presentRoles.has("wildChild")) steps.push("wildChild");
  if (presentRoles.has("nightGuest")) steps.push("nightGuest");
  if (presentRoles.has("protector")) steps.push("protector");
  if (presentRoles.has("werewolf") || presentRoles.has("alphaWolf") || currentRoles.has("werewolf") || hasAlphaWolfInfectedPlayer) {
    steps.push("wolves");
  }
  if (presentRoles.has("alphaWolf")) steps.push("alphaWolf");
  if (presentRoles.has("seer")) steps.push("seer");
  if (presentRoles.has("auraSeer")) steps.push("auraSeer");
  if (presentRoles.has("detective")) steps.push("detective");
  if (presentRoles.has("doctor")) steps.push("doctor");
  if (presentRoles.has("witch")) steps.push("witch");
  return [...steps, "dawn"];
}

export function markCurrentRoleSeen(state: WerewolfState): WerewolfState {
  if (state.phase !== "roleReveal") return state;

  return markRoleSeen(state, state.players[state.roleRevealIndex]?.id);
}

export function markRoleSeen(state: WerewolfState, playerId: string | undefined): WerewolfState {
  if (state.phase !== "roleReveal") return state;

  return updatePlayer(state, playerId, (player) => ({
    ...player,
    seenRole: true,
  }));
}

export function finishRoleReveal(state: WerewolfState): WerewolfState {
  if (state.phase !== "roleReveal") return state;

  return {
    ...state,
    phase: "night",
    roleRevealIndex: Math.max(0, state.players.length - 1),
    players: state.players.map((player) => ({ ...player, seenRole: true })),
    log: [...state.log, createLog("roleRevealDone", { phase: "setup" })],
  };
}

export function advanceRoleReveal(state: WerewolfState): WerewolfState {
  if (state.phase !== "roleReveal") return state;

  const seenState = markCurrentRoleSeen(state);
  const nextIndex = seenState.roleRevealIndex + 1;
  if (nextIndex < seenState.players.length) {
    return { ...seenState, roleRevealIndex: nextIndex };
  }

  return finishRoleReveal(seenState);
}

export function setProtectedPlayer(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "protector", playerId)) return state;
  return withValidNightChoices({ ...state, protectedPlayerId: playerId });
}

export function setNightGuestHost(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "nightGuest", playerId)) return state;
  return withValidNightChoices({ ...state, nightGuestHostId: playerId });
}

export function setWildChildModel(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "wildChild", playerId)) return state;
  return { ...state, wildChildModelId: playerId };
}

export function setCupidTargets(state: WerewolfState, playerIds: string[]): WerewolfState {
  const validIds = playerIds.filter((playerId, index) => playerIds.indexOf(playerId) === index && isValidTarget(state, "cupid", playerId));
  const targetIds = validIds.slice(0, 2);
  const players =
    targetIds.length === 2
      ? state.players.map((player) => ({
          ...player,
          loverId:
            player.id === targetIds[0] ? targetIds[1] : player.id === targetIds[1] ? targetIds[0] : player.loverId,
        }))
      : state.players.map((player) => ({ ...player, loverId: null }));

  return { ...state, players, cupidTargetIds: targetIds };
}

export function setInspectedPlayer(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "seer", playerId)) return state;
  return { ...state, inspectedPlayerId: playerId, seerResultRevealed: false };
}

export function setAuraTarget(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "auraSeer", playerId)) return state;
  return { ...state, auraTargetId: playerId, auraResultRevealed: false };
}

export function setDetectiveTargets(state: WerewolfState, playerIds: string[]): WerewolfState {
  const validIds = playerIds.filter((playerId, index) => playerIds.indexOf(playerId) === index && isValidTarget(state, "detective", playerId));
  return { ...state, detectiveTargetIds: validIds.slice(0, 2), detectiveResultRevealed: false };
}

export function setWolfTarget(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "wolves", playerId)) return state;
  return withValidNightChoices({ ...state, wolfTargetId: playerId, alphaWolfTransform: null, doctorHealTonight: false, witchHealTonight: false });
}

export function setAlphaWolfTransform(state: WerewolfState, value: boolean | null): WerewolfState {
  if (value && !canAlphaWolfTransformTarget(state)) return state;
  return withValidNightChoices({ ...state, alphaWolfTransform: value });
}

export function setDoctorHealTonight(state: WerewolfState, value: boolean): WerewolfState {
  if (value && !canDoctorHealWolfTarget(state)) return state;
  return withValidNightChoices({ ...state, doctorHealTonight: value });
}

export function setWitchHealTonight(state: WerewolfState, value: boolean): WerewolfState {
  if (value && !canWitchHealWolfTarget(state)) return state;
  return withValidNightChoices({ ...state, witchHealTonight: value });
}

export function setWitchPoisonTarget(state: WerewolfState, playerId: string | null): WerewolfState {
  if (!isValidTarget(state, "witchPoison", playerId)) return state;
  return { ...state, witchPoisonTargetId: playerId };
}

export function revealNightResult(state: WerewolfState, step: Extract<NightStepId, "seer" | "auraSeer" | "detective">): WerewolfState {
  if (state.phase !== "night") return state;
  if (step === "seer" && state.inspectedPlayerId) return { ...state, seerResultRevealed: true };
  if (step === "auraSeer" && state.auraTargetId) return { ...state, auraResultRevealed: true };
  if (step === "detective" && state.detectiveTargetIds.length === 2) return { ...state, detectiveResultRevealed: true };
  return state;
}

export function advanceNightStep(state: WerewolfState): WerewolfState {
  if (state.phase !== "night" || state.nightResolved) return state;
  const currentStep = state.nightSteps[state.nightStepIndex] ?? "dawn";
  const nextStep = state.nightSteps[state.nightStepIndex + 1];
  let nextState = appendLogs(state, createNightStepLogs(state, currentStep));

  if (currentStep === "wolves") {
    nextState = advanceFromWolves(nextState);
  }

  if (currentStep === "alphaWolf" && nextState.alphaWolfTransform && canAlphaWolfTransformTarget(nextState)) {
    nextState = advanceFromAlphaWolf(nextState);
  }

  if (nextStep === "dawn" && currentStep !== "toughGuyInfo" && !nextState.toughGuyWoundedTonightId) {
    const wounded = getToughGuyWoundedByWolfAttack(nextState);
    if (wounded) {
      nextState = insertNightStepAfterCurrent(
        {
          ...nextState,
          toughGuyWoundedId: wounded.id,
          toughGuyWoundedTonightId: wounded.id,
          log: [
            ...nextState.log,
            createLog("toughGuyWounded", {
              privacy: "sensitive",
              phase: "night",
              round: nextState.round,
              stepId: "toughGuyInfo",
              targetIds: [wounded.id],
              targetRoleIds: [wounded.roleId],
            }),
          ],
        },
        "toughGuyInfo",
      );
    }
  }

  return {
    ...nextState,
    nightStepIndex: Math.min(nextState.nightStepIndex + 1, nextState.nightSteps.length - 1),
    seerResultRevealed: false,
    auraResultRevealed: false,
    detectiveResultRevealed: false,
  };
}

export function canDoctorHealWolfTarget(state: WerewolfState): boolean {
  if (state.doctorHealUsed) return false;
  return canHealWolfTarget(state);
}

export function canWitchHealWolfTarget(state: WerewolfState): boolean {
  if (state.witchHealUsed) return false;
  if (doctorHealApplies(state)) return false;
  return canHealWolfTarget(state);
}

function canHealWolfTarget(state: WerewolfState): boolean {
  const wolfTarget = getWolfTarget(state);
  if (!wolfTarget || state.wolvesSkipNextNight) return false;
  if (!wolfAttackReachesTarget(state)) return false;
  if (state.cursedConvertedTonightId === wolfTarget.id || wolfTarget.roleId === "cursed") return false;
  if (alphaWolfTransformPreventsWolfKill(state)) return false;
  return true;
}

export function canAlphaWolfTransformTarget(state: WerewolfState): boolean {
  const wolfTarget = getWolfTarget(state);
  if (!wolfTarget || state.alphaWolfUsed || state.wolvesSkipNextNight) return false;
  if (!hasAliveRole(state.players, "alphaWolf")) return false;
  if (playerTeam(wolfTarget) === "werewolves") return false;
  if (!wolfAttackReachesTarget(state)) return false;
  if (state.cursedConvertedTonightId === wolfTarget.id || wolfTarget.roleId === "cursed") return false;
  return true;
}

export function resolveNight(state: WerewolfState): WerewolfState {
  if (state.phase !== "night" || state.nightResolved) return state;

  const beforeResolution = state.players;
  let players = state.players;
  const deaths = new Set<string>();
  const conversionLogs: WerewolfLogEntry[] = [];
  let wolvesSkipNextNight = state.wolvesSkipNextNight;
  let alphaWolfUsed = state.alphaWolfUsed;
  let toughGuyWoundedId = state.toughGuyWoundedId;
  let toughGuyWoundedTonightId: string | null = null;
  let mainWolfKillId: string | null = null;
  const doctorHealUsed = state.doctorHealUsed;
  const doctorHealAppliesTonight = doctorHealApplies(state);
  const witchHealApplies = witchHealAppliesTonight(state);
  const wolfHealApplies = doctorHealAppliesTonight || witchHealApplies;
  const delayedToughGuyDeathId =
    toughGuyWoundedId && toughGuyWoundedId !== state.toughGuyWoundedTonightId ? toughGuyWoundedId : null;

  if (delayedToughGuyDeathId) {
    deaths.add(delayedToughGuyDeathId);
    toughGuyWoundedId = null;
  }

  const wolfTargetId = state.wolvesSkipNextNight ? null : state.wolfTargetId;
  if (state.wolvesSkipNextNight) wolvesSkipNextNight = false;

  const wolfTarget = wolfTargetId ? players.find((player) => player.id === wolfTargetId && player.alive) : undefined;
  const attackBlocked = Boolean(wolfTarget && wolfTarget.id === state.protectedPlayerId);
  const nightGuest = players.find((player) => player.alive && player.roleId === "nightGuest");
  const nightGuestIsAway = Boolean(nightGuest && state.nightGuestHostId && wolfTarget?.id === nightGuest.id);

  if (wolfTarget && !attackBlocked && !nightGuestIsAway) {
    const collateralNightGuest =
      nightGuest && state.nightGuestHostId === wolfTarget.id && nightGuest.id !== wolfTarget.id ? nightGuest : null;
    let mainVictimDies = true;

    if (wolfTarget.id === state.cursedConvertedTonightId) {
      mainVictimDies = false;
    } else if (wolfTarget.roleId === "cursed") {
      players = convertPlayerToWerewolf(players, wolfTarget.id);
      conversionLogs.push(createConversionLog(state, wolfTarget, "cursedConverted", "werewolf"));
      mainVictimDies = false;
    } else if (alphaWolfTransformPreventsWolfKill({ ...state, players })) {
      if (!wolfTarget.alphaWolfInfected) {
        players = infectPlayerByAlphaWolf(players, wolfTarget.id);
        conversionLogs.push(createConversionLog(state, wolfTarget, "alphaInfected", "alphaWolf"));
        alphaWolfUsed = true;
      }
      mainVictimDies = false;
    } else if (wolfTarget.roleId === "toughGuy" && state.toughGuyWoundedTonightId === wolfTarget.id) {
      mainVictimDies = false;
    } else if (wolfTarget.roleId === "toughGuy" && toughGuyWoundedId !== wolfTarget.id && !wolfHealApplies) {
      toughGuyWoundedId = wolfTarget.id;
      toughGuyWoundedTonightId = wolfTarget.id;
      mainVictimDies = false;
    }

    if (mainVictimDies) {
      deaths.add(wolfTarget.id);
      if (!wolfHealApplies) mainWolfKillId = wolfTarget.id;
    }
    if (collateralNightGuest) deaths.add(collateralNightGuest.id);
  }

  const witchPoisonTargetId =
    state.witchPoisonTargetId && !state.witchPoisonUsed && isValidTarget(state, "witchPoison", state.witchPoisonTargetId)
      ? state.witchPoisonTargetId
      : null;

  if (wolfHealApplies && wolfTargetId && wolfTargetId !== delayedToughGuyDeathId) deaths.delete(wolfTargetId);
  if (witchPoisonTargetId) deaths.add(witchPoisonTargetId);

  const finalDeathIds = new Set([...deaths].filter((id) => players.some((player) => player.id === id && player.alive)));
  if (mainWolfKillId && finalDeathIds.has(mainWolfKillId) && findPlayer(players, mainWolfKillId)?.roleId === "infected") {
    wolvesSkipNextNight = true;
  }

  players = killPlayersWithLoverEffects(players, finalDeathIds);
  const beforeWildChildConversion = players;
  players = convertWildChildIfModelDied(beforeResolution, players, state.wildChildModelId);
  const wildChildConversionLog = createWildChildConversionLog(state, beforeWildChildConversion, players);
  toughGuyWoundedId = clearToughGuyWoundForDeadPlayer(players, toughGuyWoundedId);

  const lastNightDeaths = newlyDeadIds(beforeResolution, players);
  const pendingHunterIds = findNewlyDeadRoleIds(beforeResolution, players, "hunter");
  const pendingHunterId = pendingHunterIds[0] ?? null;
  const winner = pendingHunterId
    ? null
    : checkWin(players, {
        winMode: state.options.winMode,
        doctorHealUsed: doctorHealUsed || doctorHealAppliesTonight,
        witchHealUsed: state.witchHealUsed || witchHealApplies,
        witchPoisonUsed: state.witchPoisonUsed || Boolean(witchPoisonTargetId),
      });
  const nightLog =
    lastNightDeaths.length > 0
      ? [
          createLog("nightDeath", {
            privacy: "sensitive",
            phase: "night",
            round: state.round,
            targetIds: lastNightDeaths,
            targetRoleIds: roleIdsForIds(players, lastNightDeaths),
            publicSummary: { type: "nightDeath", targetCount: lastNightDeaths.length },
          }),
        ]
      : [
          createLog("noNightDeath", {
            privacy: "public",
            phase: "night",
            round: state.round,
            publicSummary: { type: "noNightDeath" },
          }),
        ];
  const delayedToughGuyDeathLog =
    delayedToughGuyDeathId && finalDeathIds.has(delayedToughGuyDeathId)
      ? [
          createLog("toughGuyDeath", {
            privacy: "sensitive",
            phase: "night",
            round: state.round,
            targetIds: [delayedToughGuyDeathId],
            targetRoleIds: roleIdsForIds(beforeResolution, [delayedToughGuyDeathId]),
          }),
        ]
      : [];
  const wolvesWeakenedLog =
    mainWolfKillId && finalDeathIds.has(mainWolfKillId) && findPlayer(beforeResolution, mainWolfKillId)?.roleId === "infected"
      ? [
          createLog("wolvesWeakened", {
            privacy: "sensitive",
            phase: "night",
            round: state.round,
            stepId: "wolves",
            actorRoleId: "werewolf",
            actorIds: actorIdsForStep(state, "wolves"),
            targetIds: [mainWolfKillId],
            targetRoleIds: roleIdsForIds(beforeResolution, [mainWolfKillId]),
          }),
        ]
      : [];
  const publicEvents = withWinnerPublicEvent(
    [
      ...(lastNightDeaths.length > 0
        ? ([{ type: "nightDeaths", playerIds: lastNightDeaths, source: "night" }] satisfies WerewolfPublicEvent[])
        : ([{ type: "noNightDeaths", source: "night" }] satisfies WerewolfPublicEvent[])),
      ...hunterPendingPublicEvent(pendingHunterId, "night"),
    ],
    winner,
  );

  return {
    ...state,
    players,
    phase: winner ? "ended" : "night",
    nightResolved: !winner,
    lastNightDeaths,
    lastDayDeaths: [],
    pendingHunterId,
    pendingHunterQueue: pendingHunterIds.slice(1),
    pendingHunterSource: pendingHunterId ? "night" : null,
    publicEvents,
    publicEventIndex: 0,
    winner,
    protectedPlayerId: null,
    protectorLastTargetId: state.protectedPlayerId ?? state.protectorLastTargetId,
    nightGuestHostId: null,
    inspectedPlayerId: null,
    seerResultRevealed: false,
    auraTargetId: null,
    auraResultRevealed: false,
    detectiveTargetIds: [],
    detectiveResultRevealed: false,
    wolfTargetId: null,
    cursedConvertedTonightId: null,
    alphaWolfTransform: null,
    alphaWolfUsed,
    doctorHealUsed: doctorHealUsed || doctorHealAppliesTonight,
    doctorHealTonight: false,
    witchHealUsed: state.witchHealUsed || witchHealApplies,
    witchPoisonUsed: state.witchPoisonUsed || Boolean(witchPoisonTargetId),
    witchHealTonight: false,
    witchPoisonTargetId: null,
    wolvesSkipNextNight,
    toughGuyWoundedId,
    toughGuyWoundedTonightId,
    log: [
      ...state.log,
      ...conversionLogs,
      ...(wildChildConversionLog ? [wildChildConversionLog] : []),
      ...delayedToughGuyDeathLog,
      ...wolvesWeakenedLog,
      ...nightLog,
      ...(winner ? [createWinnerLog(winner)] : []),
    ],
  };
}

export function startDay(state: WerewolfState): WerewolfState {
  if (state.phase !== "night" || !state.nightResolved || state.pendingHunterId || hasFuturePublicEvents(state)) return state;
  const activeEvent = activePublicEvent(state);
  if (activeEvent?.type === "hunterPending" || activeEvent?.type === "winner") return state;

  return {
    ...state,
    phase: "day",
    nightResolved: false,
    lastNightDeaths: [],
    publicEvents: [],
    publicEventIndex: 0,
    dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)),
    toughGuyWoundedTonightId: null,
  };
}

export function setDayTimerDuration(state: WerewolfState, durationSeconds: number): WerewolfState {
  if (!canUseDayTimer(state)) return state;
  return { ...state, dayTimer: setDayTimerDurationValue(ensureDayTimer(state.dayTimer), durationSeconds) };
}

export function startDayTimer(state: WerewolfState, now = Date.now()): WerewolfState {
  if (!canUseDayTimer(state)) return state;
  return { ...state, dayTimer: startDayTimerValue(ensureDayTimer(state.dayTimer), now) };
}

export function pauseDayTimer(state: WerewolfState, now = Date.now()): WerewolfState {
  if (!canUseDayTimer(state)) return state;
  return { ...state, dayTimer: pauseDayTimerValue(ensureDayTimer(state.dayTimer), now) };
}

export function resetDayTimer(state: WerewolfState): WerewolfState {
  if (!canUseDayTimer(state)) return state;
  return { ...state, dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)) };
}

export function advancePublicEvent(state: WerewolfState): WerewolfState {
  const activeEvent = activePublicEvent(state);
  if (!activeEvent || activeEvent.type === "hunterPending" || activeEvent.type === "winner") return state;

  return {
    ...state,
    publicEventIndex: Math.min((state.publicEventIndex ?? 0) + 1, state.publicEvents.length),
  };
}

export function eliminateByVote(state: WerewolfState, playerId: string): WerewolfState {
  if (state.phase !== "day" || state.pendingHunterId || state.lastDayDeaths.length > 0 || hasPendingPublicEvent(state)) return state;

  const eliminated = state.players.find((player) => player.id === playerId && player.alive);
  if (!eliminated) return state;

  if (eliminated.roleId === "fool") {
    return finishSpecialWin(state, playerId, "fool");
  }

  if (eliminated.roleId === "villageIdiot" && state.round === 1) {
    return finishSpecialWin(state, playerId, "villageIdiot");
  }

  const beforeVote = state.players;
  let players = killPlayersWithLoverEffects(state.players, new Set([playerId]));
  const beforeWildChildConversion = players;
  players = convertWildChildIfModelDied(beforeVote, players, state.wildChildModelId);
  const wildChildConversionLog = createWildChildConversionLog(state, beforeWildChildConversion, players);
  const toughGuyWoundedId = clearToughGuyWoundForDeadPlayer(players, state.toughGuyWoundedId);
  const toughGuyWoundedTonightId = clearToughGuyWoundForDeadPlayer(players, state.toughGuyWoundedTonightId);
  const lastDayDeaths = newlyDeadIds(beforeVote, players);
  const pendingHunterIds = findNewlyDeadRoleIds(beforeVote, players, "hunter");
  const pendingHunterId = pendingHunterIds[0] ?? null;
  const winner = pendingHunterId
    ? null
    : checkWin(players, {
        winMode: state.options.winMode,
        doctorHealUsed: state.doctorHealUsed,
        witchHealUsed: state.witchHealUsed,
        witchPoisonUsed: state.witchPoisonUsed,
      });

  const shouldReveal = lastDayDeaths.length > 0;
  const continueToNight = !winner && !pendingHunterId && !shouldReveal;
  const nextPlayers = continueToNight ? demoteVillageIdiotAfterRoundOne(players, state.round) : players;
  const publicEvents = withWinnerPublicEvent(
    [
      ...dayDeathPublicEvents(playerId, lastDayDeaths),
      ...hunterPendingPublicEvent(pendingHunterId, "day"),
    ],
    winner,
  );

  return {
    ...state,
    players: nextPlayers,
    phase: winner ? "ended" : pendingHunterId || shouldReveal ? "day" : "night",
    round: winner || pendingHunterId || shouldReveal ? state.round : state.round + 1,
    nightSteps: winner || pendingHunterId || shouldReveal ? state.nightSteps : buildNightSteps(nextPlayers, state.round + 1),
    nightStepIndex: winner || pendingHunterId || shouldReveal ? state.nightStepIndex : 0,
    nightResolved: false,
    lastNightDeaths: [],
    lastDayDeaths,
    pendingHunterId,
    pendingHunterQueue: pendingHunterIds.slice(1),
    pendingHunterSource: pendingHunterId ? "day" : null,
    publicEvents,
    publicEventIndex: 0,
    dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)),
    toughGuyWoundedId,
    toughGuyWoundedTonightId,
    winner,
    log: [
      ...state.log,
      createLog("dayElimination", {
        privacy: "sensitive",
        phase: "day",
        round: state.round,
        targetIds: lastDayDeaths,
        targetRoleIds: roleIdsForIds(players, lastDayDeaths),
        publicSummary: { type: "dayElimination", targetCount: lastDayDeaths.length },
      }),
      ...(wildChildConversionLog ? [wildChildConversionLog] : []),
      ...(winner ? [createWinnerLog(winner)] : []),
    ],
  };
}

export function resolveHunterShot(state: WerewolfState, targetId: string | null): WerewolfState {
  if (!state.pendingHunterId || state.phase === "ended") return state;
  const activeEvent = activePublicEvent(state);
  if (activeEvent && (activeEvent.type !== "hunterPending" || activeEvent.playerId !== state.pendingHunterId)) return state;

  const source = state.pendingHunterSource;
  const queuedHunters = [...(state.pendingHunterQueue ?? [])];
  const beforeShot = state.players;
  let players = state.players;
  const target = targetId ? players.find((player) => player.id === targetId && player.alive) : null;
  let wildChildConversionLog: WerewolfLogEntry | null = null;

  if (target) {
    players = killPlayersWithLoverEffects(players, new Set([target.id]));
    const beforeWildChildConversion = players;
    players = convertWildChildIfModelDied(beforeShot, players, state.wildChildModelId);
    wildChildConversionLog = createWildChildConversionLog(state, beforeWildChildConversion, players);
  }
  const toughGuyWoundedId = clearToughGuyWoundForDeadPlayer(players, state.toughGuyWoundedId);
  const toughGuyWoundedTonightId = clearToughGuyWoundForDeadPlayer(players, state.toughGuyWoundedTonightId);

  const shotDeaths = newlyDeadIds(beforeShot, players);
  const newHunterIds = findNewlyDeadRoleIds(beforeShot, players, "hunter").filter(
    (id) => id !== state.pendingHunterId && !queuedHunters.includes(id),
  );
  const nextHunterQueue = [...queuedHunters, ...newHunterIds];
  const pendingHunterId = nextHunterQueue[0] ?? null;
  const pendingHunterQueue = nextHunterQueue.slice(1);
  const pendingHunterSource = pendingHunterId ? source : null;
  const lastNightDeaths = source === "night" ? [...new Set([...state.lastNightDeaths, ...shotDeaths])] : state.lastNightDeaths;
  const lastDayDeaths = source === "day" ? [...new Set([...state.lastDayDeaths, ...shotDeaths])] : state.lastDayDeaths;
  const winner = pendingHunterId
    ? null
    : checkWin(players, {
        winMode: state.options.winMode,
        doctorHealUsed: state.doctorHealUsed,
        witchHealUsed: state.witchHealUsed,
        witchPoisonUsed: state.witchPoisonUsed,
      });
  const hunterResolutionEvents = source
    ? target
      ? hunterShotPublicEvents(state.pendingHunterId, target.id, shotDeaths, source)
      : ([{ type: "hunterSkipped", hunterId: state.pendingHunterId, source }] satisfies WerewolfPublicEvent[])
    : [];
  const keptEvents = (state.publicEvents ?? []).slice(0, Math.min((state.publicEventIndex ?? 0) + 1, state.publicEvents?.length ?? 0));
  const publicEvents = withWinnerPublicEvent(
    [...keptEvents, ...hunterResolutionEvents, ...hunterPendingPublicEvent(pendingHunterId, source)],
    winner,
  );
  const nextPublicEventIndex = keptEvents.length;
  const hasDayEvents = source === "day" && publicEvents.length > nextPublicEventIndex;
  const continueToNight = !winner && !pendingHunterId && source === "day" && !hasDayEvents;
  const nextPlayers = continueToNight ? demoteVillageIdiotAfterRoundOne(players, state.round) : players;
  const nextPhase =
    winner
      ? "ended"
      : pendingHunterId
        ? source === "night"
          ? "night"
          : "day"
        : source === "night"
          ? "night"
          : source === "day" && !hasDayEvents
          ? "night"
          : "day";
  const preparedNextNight = continueToNight;

  return {
    ...state,
    players: nextPlayers,
    phase: nextPhase,
    round: preparedNextNight ? state.round + 1 : state.round,
    nightSteps: preparedNextNight ? buildNightSteps(nextPlayers, state.round + 1) : state.nightSteps,
    nightStepIndex: preparedNextNight ? 0 : state.nightStepIndex,
    nightResolved: nextPhase === "night" && source === "night",
    lastNightDeaths,
    lastDayDeaths: source === "day" ? lastDayDeaths : state.lastDayDeaths,
    pendingHunterId,
    pendingHunterQueue,
    pendingHunterSource,
    publicEvents,
    publicEventIndex: nextPublicEventIndex,
    dayTimer: source === "day" ? resetDayTimerValue(ensureDayTimer(state.dayTimer)) : ensureDayTimer(state.dayTimer),
    toughGuyWoundedId,
    toughGuyWoundedTonightId,
    winner,
    log: [
      ...state.log,
      ...(target
        ? [
            createLog("hunterShot", {
              privacy: "sensitive",
              phase: source ?? "day",
              round: state.round,
              actorRoleId: "hunter",
              actorIds: [state.pendingHunterId],
              targetIds: [target.id],
              targetRoleIds: roleIdsForIds(beforeShot, [target.id]),
              publicSummary: { type: "hunterShot", targetCount: 1 },
            }),
          ]
        : [
            createLog("hunterSkipped", {
              privacy: "public",
              phase: source ?? "day",
              round: state.round,
              actorRoleId: "hunter",
              actorIds: [state.pendingHunterId],
              publicSummary: { type: "hunterSkipped" },
            }),
          ]),
      ...(wildChildConversionLog ? [wildChildConversionLog] : []),
      ...(winner ? [createWinnerLog(winner)] : []),
    ],
  };
}

export function startNextNight(state: WerewolfState): WerewolfState {
  if (state.phase !== "day" || state.pendingHunterId || hasFuturePublicEvents(state)) return state;
  const activeEvent = activePublicEvent(state);
  if (activeEvent?.type === "hunterPending" || activeEvent?.type === "winner") return state;
  const players = demoteVillageIdiotAfterRoundOne(state.players, state.round);

  return {
    ...state,
    players,
    phase: "night",
    round: state.round + 1,
    nightSteps: buildNightSteps(players, state.round + 1),
    nightStepIndex: 0,
    nightResolved: false,
    lastNightDeaths: [],
    lastDayDeaths: [],
    publicEvents: [],
    publicEventIndex: 0,
    dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)),
    seerResultRevealed: false,
    auraResultRevealed: false,
    detectiveResultRevealed: false,
    toughGuyWoundedTonightId: null,
    log:
      state.lastDayDeaths.length === 0
        ? [
            ...state.log,
            createLog("noDayElimination", {
              privacy: "public",
              phase: "day",
              round: state.round,
              publicSummary: { type: "noDayElimination" },
            }),
          ]
        : state.log,
  };
}

export function resetSeenRoles(state: WerewolfState): WerewolfState {
  return {
    ...state,
    phase: "roleReveal",
    players: state.players.map((player) => ({ ...player, seenRole: false })),
    roleRevealIndex: 0,
    nightResolved: false,
    lastDayDeaths: [],
    pendingHunterId: null,
    pendingHunterQueue: [],
    pendingHunterSource: null,
    publicEvents: [],
    publicEventIndex: 0,
    dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)),
  };
}

export function checkWin(
  players: WerewolfPlayer[],
  options: { winMode?: "standard" | "extended"; doctorHealUsed?: boolean; witchHealUsed?: boolean; witchPoisonUsed?: boolean } = {},
): Winner | null {
  const alivePlayers = players.filter((player) => player.alive);
  const loverPair = alivePlayers.filter((player) => player.loverId);
  if (
    alivePlayers.length === 2 &&
    loverPair.length === 2 &&
    loverPair[0]?.loverId === loverPair[1]?.id &&
    loverPair[1]?.loverId === loverPair[0]?.id
  ) {
    return "lovers";
  }

  const wolves = alivePlayers.filter((player) => playerTeam(player) === "werewolves").length;
  const village = alivePlayers.length - wolves;

  if (wolves === 0) return "villagers";
  if (wolves >= village) {
    if (options.winMode === "extended") {
      const villagePlayers = alivePlayers.filter((player) => playerTeam(player) !== "werewolves");
      const hunterAlive = villagePlayers.some((player) => player.roleId === "hunter");
      const doctorAlive = villagePlayers.some((player) => player.roleId === "doctor");
      const witchAlive = villagePlayers.some((player) => player.roleId === "witch");
      const doctorHasHeal = doctorAlive && !options.doctorHealUsed;
      const witchHasPotion = witchAlive && (!options.witchHealUsed || !options.witchPoisonUsed);
      if (hunterAlive || doctorHasHeal || witchHasPotion) return null;
    }
    return "werewolves";
  }
  return null;
}

export function publicPlayers(players: WerewolfPlayer[]) {
  return players.map(({ id, name, alive, seenRole }) => ({ id, name, alive, seenRole }));
}

function createWerewolfState(players: WerewolfPlayer[], options: WerewolfOptions): WerewolfState {
  const phase = options.roleReveal ? "roleReveal" : "night";
  return {
    id: createId(),
    phase,
    players,
    options,
    roleRevealIndex: 0,
    round: 1,
    nightSteps: buildNightSteps(players),
    nightStepIndex: 0,
    nightResolved: false,
    protectedPlayerId: null,
    protectorLastTargetId: null,
    nightGuestHostId: null,
    wildChildModelId: null,
    cupidTargetIds: [],
    inspectedPlayerId: null,
    seerResultRevealed: false,
    auraTargetId: null,
    auraResultRevealed: false,
    detectiveTargetIds: [],
    detectiveResultRevealed: false,
    wolfTargetId: null,
    cursedConvertedTonightId: null,
    alphaWolfTransform: null,
    alphaWolfUsed: false,
    doctorHealUsed: false,
    doctorHealTonight: false,
    witchHealUsed: false,
    witchPoisonUsed: false,
    witchHealTonight: false,
    witchPoisonTargetId: null,
    wolvesSkipNextNight: false,
    toughGuyWoundedId: null,
    toughGuyWoundedTonightId: null,
    lastNightDeaths: [],
    lastDayDeaths: [],
    pendingHunterId: null,
    pendingHunterQueue: [],
    pendingHunterSource: null,
    publicEvents: [],
    publicEventIndex: 0,
    dayTimer: createDayTimer(),
    winner: null,
    log: [createLog("gameStarted", { phase: "setup" })],
  };
}

function createPlayer({
  id,
  name,
  roleId,
  seenRole,
}: {
  id: string;
  name: string;
  roleId: RoleId;
  seenRole: boolean;
}): WerewolfPlayer {
  return {
    id,
    name,
    roleId,
    originalRoleId: roleId,
    alphaWolfInfected: false,
    alive: true,
    seenRole,
    loverId: null,
  };
}

function expandRoles(counts: RoleCounts): RoleId[] {
  return roleOrder.flatMap((roleId) => Array.from({ length: sanitizeRoleCount(counts, roleId) }, () => roleId));
}

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function updatePlayer(state: WerewolfState, playerId: string | undefined, updater: (player: WerewolfPlayer) => WerewolfPlayer) {
  if (!playerId) return state;
  return {
    ...state,
    players: state.players.map((player) => (player.id === playerId ? updater(player) : player)),
  };
}

function findPlayer(players: WerewolfPlayer[], playerId: string) {
  return players.find((player) => player.id === playerId);
}

function hasAliveRole(players: WerewolfPlayer[], roleId: RoleId) {
  return players.some((player) => player.alive && player.roleId === roleId);
}

function convertPlayerToWerewolf(players: WerewolfPlayer[], playerId: string): WerewolfPlayer[] {
  return players.map((player) => (player.id === playerId ? { ...player, roleId: "werewolf" as RoleId } : player));
}

function infectPlayerByAlphaWolf(players: WerewolfPlayer[], playerId: string): WerewolfPlayer[] {
  return players.map((player) => (player.id === playerId ? { ...player, alphaWolfInfected: true } : player));
}

function convertWildChildIfModelDied(
  beforePlayers: WerewolfPlayer[],
  players: WerewolfPlayer[],
  modelId: string | null,
): WerewolfPlayer[] {
  if (!modelId) return players;
  const wasAlive = beforePlayers.some((player) => player.id === modelId && player.alive);
  const isDead = players.some((player) => player.id === modelId && !player.alive);
  if (!wasAlive || !isDead) return players;

  const wildChild = players.find((player) => player.alive && player.originalRoleId === "wildChild" && player.roleId !== "werewolf");
  return wildChild ? convertPlayerToWerewolf(players, wildChild.id) : players;
}

function demoteVillageIdiotAfterRoundOne(players: WerewolfPlayer[], round: number): WerewolfPlayer[] {
  if (round !== 1) return players;
  return players.map((player) =>
    player.alive && player.roleId === "villageIdiot" ? { ...player, roleId: "villager" as RoleId } : player,
  );
}

function newlyDeadIds(beforePlayers: WerewolfPlayer[], players: WerewolfPlayer[]) {
  return players
    .filter((player) => beforePlayers.some((before) => before.id === player.id && before.alive) && !player.alive)
    .map((player) => player.id);
}

function findNewlyDeadRoleIds(beforePlayers: WerewolfPlayer[], players: WerewolfPlayer[], roleId: RoleId) {
  return players
    .filter(
      (player) =>
        player.roleId === roleId &&
        beforePlayers.some((before) => before.id === player.id && before.alive) &&
        !player.alive,
    )
    .map((player) => player.id);
}

function clearToughGuyWoundForDeadPlayer(players: WerewolfPlayer[], woundedPlayerId: string | null) {
  if (!woundedPlayerId) return null;
  return players.some((player) => player.id === woundedPlayerId && player.alive) ? woundedPlayerId : null;
}

function withValidWitchPoisonTarget(state: WerewolfState): WerewolfState {
  if (!state.witchPoisonTargetId || isValidTarget(state, "witchPoison", state.witchPoisonTargetId)) return state;
  return { ...state, witchPoisonTargetId: null };
}

function withValidNightChoices(state: WerewolfState): WerewolfState {
  let nextState = withValidWitchPoisonTarget(state);
  if (nextState.doctorHealTonight && !canDoctorHealWolfTarget(nextState)) {
    nextState = { ...nextState, doctorHealTonight: false };
  }
  if (nextState.witchHealTonight && !canWitchHealWolfTarget(nextState)) {
    nextState = { ...nextState, witchHealTonight: false };
  }
  return nextState;
}

function advanceFromAlphaWolf(state: WerewolfState): WerewolfState {
  const wolfTarget = getWolfTarget(state);
  if (!wolfTarget || wolfTarget.alphaWolfInfected) return state;

  return insertNightStepAfterCurrent(
    {
      ...state,
      players: infectPlayerByAlphaWolf(state.players, wolfTarget.id),
      alphaWolfUsed: true,
      log: [...state.log, createConversionLog(state, wolfTarget, "alphaInfected", "alphaWolf")],
    },
    "alphaWolfInfo",
  );
}

function advanceFromWolves(state: WerewolfState): WerewolfState {
  if (state.wolvesSkipNextNight) {
    return {
      ...state,
      wolvesSkipNextNight: false,
      wolfTargetId: null,
      alphaWolfTransform: null,
    };
  }

  const converted = getCursedConvertedByWolfAttack(state);
  if (!converted) return state;

  return insertNightStepAfterCurrent(
    {
      ...state,
      players: convertPlayerToWerewolf(state.players, converted.id),
      cursedConvertedTonightId: converted.id,
      alphaWolfTransform: null,
      log: [...state.log, createConversionLog(state, converted, "cursedConverted", "werewolf")],
    },
    "cursedInfo",
  );
}

function getCursedConvertedByWolfAttack(state: WerewolfState) {
  const wolfTarget = getWolfTarget(state);
  if (!wolfTarget || wolfTarget.roleId !== "cursed") return null;
  return wolfAttackReachesTarget(state) ? wolfTarget : null;
}

function getToughGuyWoundedByWolfAttack(state: WerewolfState) {
  const wolfTarget = getWolfTarget(state);
  if (!wolfTarget || wolfTarget.roleId !== "toughGuy") return null;
  if (state.toughGuyWoundedId === wolfTarget.id) return null;
  if (!wolfAttackReachesTarget(state)) return null;
  if (alphaWolfTransformPreventsWolfKill(state)) return null;
  if (doctorHealApplies(state) || witchHealAppliesTonight(state)) return null;
  return wolfTarget;
}

function doctorHealApplies(state: WerewolfState) {
  return Boolean(state.doctorHealTonight && canDoctorHealWolfTarget(state));
}

function witchHealAppliesTonight(state: WerewolfState) {
  return Boolean(state.witchHealTonight && canWitchHealWolfTarget(state));
}

function alphaWolfTransformPreventsWolfKill(state: WerewolfState) {
  const wolfTarget = getWolfTarget(state);
  return Boolean(state.alphaWolfTransform && wolfTarget && (wolfTarget.alphaWolfInfected || canAlphaWolfTransformTarget(state)));
}

function wolfAttackReachesTarget(state: WerewolfState) {
  const wolfTarget = getWolfTarget(state);
  if (!wolfTarget) return false;
  if (wolfTarget.id === state.protectedPlayerId) return false;
  const nightGuest = state.players.find((player) => player.alive && player.roleId === "nightGuest");
  return !(nightGuest && state.nightGuestHostId && nightGuest.id === wolfTarget.id);
}

function getWolfTarget(state: WerewolfState) {
  if (!state.wolfTargetId || state.wolvesSkipNextNight) return null;
  return state.players.find((player) => player.id === state.wolfTargetId && player.alive) ?? null;
}

function insertNightStepAfterCurrent(state: WerewolfState, step: NightStepId): WerewolfState {
  if (state.nightSteps.includes(step)) return state;
  const insertAt = Math.min(state.nightStepIndex + 1, state.nightSteps.length);
  return {
    ...state,
    nightSteps: [...state.nightSteps.slice(0, insertAt), step, ...state.nightSteps.slice(insertAt)],
  };
}

function killPlayersWithLoverEffects(players: WerewolfPlayer[], deathIds: Set<string>): WerewolfPlayer[] {
  const finalDeaths = new Set(deathIds);

  for (const deathId of deathIds) {
    const victim = players.find((player) => player.id === deathId);
    if (victim?.loverId) finalDeaths.add(victim.loverId);
  }

  return players.map((player) => (finalDeaths.has(player.id) ? { ...player, alive: false } : player));
}

function dayDeathPublicEvents(voteTargetId: string, deathIds: string[]): WerewolfPublicEvent[] {
  return [
    ...(deathIds.includes(voteTargetId) ? ([{ type: "voteDeath", playerId: voteTargetId, source: "day" }] satisfies WerewolfPublicEvent[]) : []),
    ...deathIds
      .filter((playerId) => playerId !== voteTargetId)
      .map((playerId) => ({ type: "loverDeath", playerId, source: "day" } satisfies WerewolfPublicEvent)),
  ];
}

function hunterShotPublicEvents(
  hunterId: string,
  targetId: string,
  deathIds: string[],
  source: NonNullable<WerewolfState["pendingHunterSource"]>,
): WerewolfPublicEvent[] {
  return [
    ...(deathIds.includes(targetId) ? ([{ type: "hunterShot", hunterId, playerId: targetId, source }] satisfies WerewolfPublicEvent[]) : []),
    ...deathIds
      .filter((playerId) => playerId !== targetId)
      .map((playerId) => ({ type: "loverDeath", playerId, source } satisfies WerewolfPublicEvent)),
  ];
}

function hunterPendingPublicEvent(playerId: string | null, source: WerewolfState["pendingHunterSource"]): WerewolfPublicEvent[] {
  return playerId && source ? [{ type: "hunterPending", playerId, source }] : [];
}

function withWinnerPublicEvent(events: WerewolfPublicEvent[], winner: Winner | null): WerewolfPublicEvent[] {
  return winner ? [...events, { type: "winner", winner }] : events;
}

export function activePublicEvent(state: WerewolfState): WerewolfPublicEvent | null {
  return state.publicEvents[state.publicEventIndex ?? 0] ?? null;
}

function hasPendingPublicEvent(state: WerewolfState) {
  return (state.publicEventIndex ?? 0) < state.publicEvents.length;
}

function hasFuturePublicEvents(state: WerewolfState) {
  return (state.publicEventIndex ?? 0) + 1 < state.publicEvents.length;
}

function canUseDayTimer(state: WerewolfState) {
  return state.phase === "day" && !state.pendingHunterId && state.lastDayDeaths.length === 0 && !hasPendingPublicEvent(state);
}

function appendLogs(state: WerewolfState, logs: WerewolfLogEntry[]): WerewolfState {
  return logs.length > 0 ? { ...state, log: [...state.log, ...logs] } : state;
}

function createNightStepLogs(state: WerewolfState, stepId: NightStepId): WerewolfLogEntry[] {
  if (!isNightStepActive(state, stepId)) return [];

  const actorRoleId = actorRoleForStep(stepId);
  const actorIds = actorIdsForStep(state, stepId);
  const roleAction = (
    result: WerewolfLogResult,
    targetIds: string[],
    details: Partial<WerewolfLogEntry> = {},
  ): WerewolfLogEntry =>
    createLog("roleAction", {
      privacy: "sensitive",
      phase: "night",
      round: state.round,
      stepId,
      actorRoleId,
      actorIds,
      targetIds,
      targetRoleIds: effectiveRoleIdsForIds(state, targetIds),
      result,
      ...details,
    });

  if (stepId === "cupid" && state.cupidTargetIds.length === 2) {
    return [
      roleAction("selectedLovers", state.cupidTargetIds, {
        publicSummary: { type: "roleAction", actorRoleId: "cupid", targetCount: 2, result: "selectedLovers" },
      }),
    ];
  }
  if (stepId === "wildChild" && state.wildChildModelId) return [roleAction("selectedModel", [state.wildChildModelId])];
  if (stepId === "nightGuest" && state.nightGuestHostId) return [roleAction("visited", [state.nightGuestHostId])];
  if (stepId === "protector" && state.protectedPlayerId) return [roleAction("protected", [state.protectedPlayerId])];
  if (stepId === "wolves") {
    if (state.wolvesSkipNextNight) {
      return [
        roleAction("skippedAttack", [], {
          publicSummary: { type: "roleAction", actorRoleId: "werewolf", result: "skippedAttack" },
        }),
      ];
    }
    return state.wolfTargetId
      ? [
          roleAction("attacked", [state.wolfTargetId], {
            publicSummary: { type: "roleAction", actorRoleId: "werewolf", targetCount: 1, result: "attacked" },
          }),
        ]
      : [];
  }
  if (stepId === "alphaWolf") {
    const wolfTarget = getWolfTarget(state);
    if (!wolfTarget || !canAlphaWolfTransformTarget(state)) return [];
    return [
      roleAction(state.alphaWolfTransform ? "alphaInfected" : "keptKill", [wolfTarget.id], {
        publicSummary: state.alphaWolfTransform
          ? undefined
          : { type: "roleAction", actorRoleId: "alphaWolf", targetCount: 1, result: "keptKill" },
      }),
    ];
  }
  if (stepId === "seer" && state.inspectedPlayerId) {
    const inspected = findPlayer(state.players, state.inspectedPlayerId);
    return inspected ? [roleAction("inspectedRole", [inspected.id], { resultRoleId: effectiveRoleId(state, inspected) })] : [];
  }
  if (stepId === "auraSeer" && state.auraTargetId) {
    const target = findPlayer(state.players, state.auraTargetId);
    return target ? [roleAction("checkedAura", [target.id], { resultTeam: logTeamForPlayer(state, target) })] : [];
  }
  if (stepId === "detective" && state.detectiveTargetIds.length === 2) {
    const targets = state.detectiveTargetIds
      .map((targetId) => findPlayer(state.players, targetId))
      .filter((player): player is WerewolfPlayer => Boolean(player));
    if (targets.length !== 2) return [];
    const [first, second] = targets;
    return [
      roleAction("comparedTeams", state.detectiveTargetIds, {
        sameTeam: playerTeamInState(state, first) === playerTeamInState(state, second),
      }),
    ];
  }
  if (stepId === "doctor") {
    const healTarget = doctorHealApplies(state) ? getWolfTarget(state) : null;
    return healTarget ? [roleAction("doctorHealed", [healTarget.id])] : [roleAction("doctorNoHeal", [])];
  }
  if (stepId === "witch") {
    const logs: WerewolfLogEntry[] = [];
    const healTarget = state.witchHealTonight && canWitchHealWolfTarget(state) ? getWolfTarget(state) : null;
    const poisonTarget =
      state.witchPoisonTargetId && !state.witchPoisonUsed && isValidTarget(state, "witchPoison", state.witchPoisonTargetId)
        ? findPlayer(state.players, state.witchPoisonTargetId)
        : null;

    if (healTarget) logs.push(roleAction("witchHealed", [healTarget.id]));
    if (poisonTarget) logs.push(roleAction("witchPoisoned", [poisonTarget.id]));
    return logs.length > 0 ? logs : [roleAction("witchNoPotion", [])];
  }

  return [];
}

function actorRoleForStep(stepId: NightStepId): RoleId | undefined {
  const rolesByStep: Partial<Record<NightStepId, RoleId>> = {
    cupid: "cupid",
    wildChild: "wildChild",
    nightGuest: "nightGuest",
    protector: "protector",
    wolves: "werewolf",
    alphaWolf: "alphaWolf",
    seer: "seer",
    auraSeer: "auraSeer",
    detective: "detective",
    doctor: "doctor",
    witch: "witch",
  };
  return rolesByStep[stepId];
}

function actorIdsForStep(state: WerewolfState, stepId: NightStepId) {
  return getNightStepActors(state, stepId)
    .filter((player) => player.alive)
    .map((player) => player.id);
}

function effectiveRoleIdsForIds(state: WerewolfState, ids: string[]) {
  return ids
    .map((id) => {
      const player = findPlayer(state.players, id);
      return player ? effectiveRoleId(state, player) : null;
    })
    .filter((roleId): roleId is RoleId => Boolean(roleId));
}

function roleIdsForIds(players: WerewolfPlayer[], ids: string[]) {
  return ids
    .map((id) => findPlayer(players, id)?.roleId)
    .filter((roleId): roleId is RoleId => Boolean(roleId));
}

function logTeamForPlayer(state: WerewolfState, player: WerewolfPlayer): WerewolfLogTeam {
  return playerTeamInState(state, player) === "werewolves" ? "evil" : "good";
}

function createConversionLog(
  state: WerewolfState,
  target: WerewolfPlayer,
  result: Extract<WerewolfLogResult, "cursedConverted" | "alphaInfected" | "wildChildConverted">,
  actorRoleId: RoleId,
): WerewolfLogEntry {
  const stepId = result === "cursedConverted" ? "cursedInfo" : result === "alphaInfected" ? "alphaWolfInfo" : undefined;

  return createLog("roleConverted", {
    privacy: "sensitive",
    phase: logPhaseForState(state),
    round: state.round,
    stepId,
    actorRoleId,
    actorIds:
      result === "wildChildConverted"
        ? []
        : actorRoleId === "wildChild"
          ? [target.id]
          : actorIdsForStep(state, actorRoleId === "alphaWolf" ? "alphaWolf" : "wolves"),
    targetIds: [target.id],
    targetRoleIds: [result === "wildChildConverted" ? "wildChild" : target.roleId],
    result,
  });
}

function createWildChildConversionLog(
  state: WerewolfState,
  beforePlayers: WerewolfPlayer[],
  players: WerewolfPlayer[],
): WerewolfLogEntry | null {
  const converted = players.find((player) => {
    const before = beforePlayers.find((candidate) => candidate.id === player.id);
    return before?.originalRoleId === "wildChild" && before.roleId !== "werewolf" && player.roleId === "werewolf";
  });

  return converted ? createConversionLog(state, converted, "wildChildConverted", "wildChild") : null;
}

function logPhaseForState(state: WerewolfState): WerewolfLogPhase {
  if (state.phase === "roleReveal") return "setup";
  return state.phase;
}

function finishSpecialWin(state: WerewolfState, playerId: string, winner: Extract<Winner, "fool" | "villageIdiot">): WerewolfState {
  const eliminated = state.players.find((player) => player.id === playerId);
  const players = state.players.map((player) => (player.id === playerId ? { ...player, alive: false } : player));

  return {
    ...state,
    players,
    phase: "ended",
    winner,
    dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)),
    publicEvents: [
      { type: "voteDeath", playerId, source: "day" },
      { type: "winner", winner },
    ],
    publicEventIndex: 0,
    log: [
      ...state.log,
      createLog("dayElimination", {
        privacy: "sensitive",
        phase: "day",
        round: state.round,
        targetIds: [playerId],
        targetRoleIds: roleIdsForIds(state.players, [playerId]),
        publicSummary: { type: "dayElimination", targetCount: 1 },
      }),
      createLog("specialWin", {
        privacy: "public",
        phase: "ended",
        round: state.round,
        targetIds: [playerId],
        targetRoleIds: roleIdsForIds(state.players, [playerId]),
        playerName: eliminated?.name,
      }),
    ],
  };
}

function createWinnerLog(winner: Winner) {
  if (winner === "villagers") return createLog("villagersWin", { phase: "ended" });
  if (winner === "werewolves") return createLog("werewolvesWin", { phase: "ended" });
  return createLog("specialWin", { phase: "ended" });
}

function createLog(
  type: WerewolfLogEntry["type"],
  details: string | Partial<Omit<WerewolfLogEntry, "id" | "type">> = {},
): WerewolfLogEntry {
  const entryDetails = typeof details === "string" ? { playerName: details } : details;
  return { id: createId(), type, privacy: entryDetails.privacy ?? defaultLogPrivacy(type), ...entryDetails };
}

function defaultLogPrivacy(type: WerewolfLogEntry["type"]): WerewolfLogPrivacy {
  if (
    type === "gameStarted" ||
    type === "roleRevealDone" ||
    type === "noNightDeath" ||
    type === "noDayElimination" ||
    type === "hunterSkipped" ||
    type === "villagersWin" ||
    type === "werewolvesWin" ||
    type === "specialWin"
  ) {
    return "public";
  }
  return "sensitive";
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}
