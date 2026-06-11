import { roleDefinitions, type RoleTeam } from "./roles";
import type { RoleId, WerewolfPlayer, WerewolfState } from "./types";

export function effectiveRoleId(state: WerewolfState, player: WerewolfPlayer): RoleId {
  if (player.id === state.cursedConvertedTonightId) return "werewolf";
  return player.roleId;
}

export function playerTeam(player: WerewolfPlayer): RoleTeam {
  if (player.alphaWolfInfected) return "werewolves";
  return roleDefinitions[player.roleId]?.team ?? "village";
}

export function playerTeamInState(state: WerewolfState, player: WerewolfPlayer): RoleTeam {
  if (player.id === state.cursedConvertedTonightId) return "werewolves";
  return playerTeam(player);
}

export function isWolfAligned(state: WerewolfState, player: WerewolfPlayer): boolean {
  return playerTeamInState(state, player) === "werewolves";
}
