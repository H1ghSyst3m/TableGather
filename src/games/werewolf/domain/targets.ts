import { playerTeamInState } from "./alignment";
import type { NightStepId, RoleId, WerewolfPlayer, WerewolfState } from "./types";

export type NightTargetAction =
  | "cupid"
  | "wildChild"
  | "nightGuest"
  | "protector"
  | "wolves"
  | "seer"
  | "auraSeer"
  | "detective"
  | "witchPoison"
  | "hunterShot";

export function getNightStepActors(state: WerewolfState, stepId: NightStepId): WerewolfPlayer[] {
  const players = state.players ?? [];

  if (stepId === "wolves") return players.filter((player) => playerTeamInState(state, player) === "werewolves");
  if (stepId === "cursedInfo") return state.wolfTargetId ? players.filter((player) => player.id === state.wolfTargetId) : [];
  if (stepId === "alphaWolfInfo") return state.wolfTargetId ? players.filter((player) => player.id === state.wolfTargetId) : [];
  if (stepId === "toughGuyInfo") {
    return state.toughGuyWoundedTonightId ? players.filter((player) => player.id === state.toughGuyWoundedTonightId) : [];
  }

  const rolesByStep: Partial<Record<NightStepId, RoleId[]>> = {
    cupid: ["cupid"],
    wildChild: ["wildChild"],
    nightGuest: ["nightGuest"],
    protector: ["protector"],
    alphaWolf: ["alphaWolf"],
    seer: ["seer"],
    auraSeer: ["auraSeer"],
    detective: ["detective"],
    witch: ["witch"],
  };
  const roles = rolesByStep[stepId];
  return roles ? players.filter((player) => roles.includes(player.roleId)) : [];
}

export function getValidTargets(state: WerewolfState, action: NightTargetAction): WerewolfPlayer[] {
  const alive = (state.players ?? []).filter((player) => player.alive);

  if (action === "cupid" || action === "hunterShot") return alive;
  if (action === "wolves") return alive.filter((player) => playerTeamInState(state, player) !== "werewolves");
  if (action === "protector") {
    const protector = findAliveRole(state, "protector");
    return alive.filter((player) => player.id !== protector?.id && player.id !== state.protectorLastTargetId);
  }

  const actorRoleByAction: Partial<Record<NightTargetAction, RoleId>> = {
    wildChild: "wildChild",
    nightGuest: "nightGuest",
    seer: "seer",
    auraSeer: "auraSeer",
    detective: "detective",
    witchPoison: "witch",
  };
  const actor = actorRoleByAction[action] ? findAliveRole(state, actorRoleByAction[action]) : null;
  return alive.filter((player) => {
    if (player.id === actor?.id) return false;
    if (action !== "witchPoison") return true;
    return player.id !== state.wolfTargetId || canPoisonWolfTarget(state);
  });
}

export function isValidTarget(state: WerewolfState, action: NightTargetAction, playerId: string | null): boolean {
  if (!playerId) return true;
  return getValidTargets(state, action).some((player) => player.id === playerId);
}

export function isNightStepActive(state: WerewolfState, stepId: NightStepId): boolean {
  if (stepId === "sleep" || stepId === "dawn") return true;
  if (stepId === "lovers") return state.cupidTargetIds.length === 2;
  if (stepId === "wolves") return getNightStepActors(state, "wolves").some((player) => player.alive);
  if (stepId === "alphaWolf") return getNightStepActors(state, "alphaWolf").some((player) => player.alive) && !state.alphaWolfUsed;
  if (stepId === "witch") {
    return getNightStepActors(state, "witch").some((player) => player.alive) && (!state.witchHealUsed || !state.witchPoisonUsed);
  }
  if (stepId === "cursedInfo") return Boolean(state.wolfTargetId);
  if (stepId === "alphaWolfInfo") return Boolean(state.alphaWolfTransform && state.wolfTargetId);
  if (stepId === "toughGuyInfo") return Boolean(state.toughGuyWoundedTonightId);
  return getNightStepActors(state, stepId).some((player) => player.alive);
}

function findAliveRole(state: WerewolfState, roleId: RoleId) {
  return (state.players ?? []).find((player) => player.alive && player.roleId === roleId) ?? null;
}

function canPoisonWolfTarget(state: WerewolfState) {
  return Boolean(
    state.wolfTargetId &&
      (state.wolfTargetId === state.cursedConvertedTonightId ||
        (state.alphaWolfTransform && (state.players ?? []).some((player) => player.id === state.wolfTargetId && player.alphaWolfInfected)) ||
        state.wolfTargetId === state.protectedPlayerId ||
        isNightGuestAwayFromWolfAttack(state)),
  );
}

function isNightGuestAwayFromWolfAttack(state: WerewolfState) {
  const nightGuest = (state.players ?? []).find((player) => player.alive && player.roleId === "nightGuest");
  return Boolean(nightGuest && state.nightGuestHostId && nightGuest.id === state.wolfTargetId);
}
