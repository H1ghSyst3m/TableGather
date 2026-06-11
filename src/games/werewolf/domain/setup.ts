import { roleIds } from "./roles";
import type { RoleCounts, RoleId, RoleValidation, WerewolfOptions } from "./types";

export const minimumWerewolfPlayers = 5;

export const defaultWerewolfOptions: WerewolfOptions = {
  winMode: "standard",
  revealMode: "role",
  roleReveal: true,
};

export function createDefaultRoleCounts(playerCount: number): RoleCounts {
  const safeCount = Math.max(playerCount, minimumWerewolfPlayers);
  const suggestedWerewolves = Math.max(1, Math.floor(safeCount / 4));
  const baseCounts: RoleCounts = {
    werewolf: suggestedWerewolves,
  };

  return autoFillVillagers(baseCounts, safeCount);
}

export function sanitizeRoleCount(counts: RoleCounts, roleId: RoleId): number {
  const rawCount = Number(counts[roleId] ?? 0);
  return Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
}

export function nonVillagerRoleTotal(counts: RoleCounts): number {
  return roleIds.reduce((total, roleId) => {
    if (roleId === "villager") return total;
    return total + sanitizeRoleCount(counts, roleId);
  }, 0);
}

export function roleCountTotal(counts: RoleCounts): number {
  return roleIds.reduce((total, roleId) => total + sanitizeRoleCount(counts, roleId), 0);
}

export function autoFillVillagers(counts: RoleCounts, playerCount: number): RoleCounts {
  const safePlayerCount = Number.isFinite(playerCount) ? Math.max(0, Math.floor(playerCount)) : 0;
  const normalized: RoleCounts = {};

  roleIds.forEach((roleId) => {
    if (roleId === "villager") return;
    const count = sanitizeRoleCount(counts, roleId);
    if (count > 0) normalized[roleId] = count;
  });

  normalized.villager = Math.max(0, safePlayerCount - nonVillagerRoleTotal(normalized));
  return normalized;
}

export function validateRoleCounts(playerCount: number, counts: RoleCounts): RoleValidation {
  const displayCounts = autoFillVillagers(counts, playerCount);
  const roleTotal = roleCountTotal(displayCounts);

  if (playerCount < minimumWerewolfPlayers) {
    return { valid: false, playerCount, roleTotal, reason: "minimum" };
  }

  if (roleTotal !== playerCount) {
    return { valid: false, playerCount, roleTotal, reason: "sum" };
  }

  return { valid: true, playerCount, roleTotal, reason: "ok" };
}
