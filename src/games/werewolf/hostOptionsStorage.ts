import { defaultWerewolfOptions } from "./domain/setup";
import type { WerewolfOptions } from "./domain/types";

const hostOptionsStorageKey = "tablegather-werewolf-host-options";

export function loadWerewolfHostOptions(overrides: Partial<WerewolfOptions> = {}): WerewolfOptions {
  const fallback = normalizeWerewolfOptions(overrides, defaultWerewolfOptions);
  if (typeof localStorage === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(hostOptionsStorageKey);
    if (!raw) return fallback;
    return normalizeWerewolfOptions(JSON.parse(raw) as Partial<WerewolfOptions>, fallback);
  } catch {
    return fallback;
  }
}

export function saveWerewolfHostOptions(options: WerewolfOptions) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(hostOptionsStorageKey, JSON.stringify(normalizeWerewolfOptions(options, defaultWerewolfOptions)));
}

export function saveWerewolfHostOptionsPatch(patch: Partial<WerewolfOptions>) {
  saveWerewolfHostOptions({ ...loadWerewolfHostOptions(), ...patch });
}

function normalizeWerewolfOptions(input: Partial<WerewolfOptions>, fallback: WerewolfOptions): WerewolfOptions {
  return {
    winMode: input.winMode === "extended" || input.winMode === "standard" ? input.winMode : fallback.winMode,
    revealMode:
      input.revealMode === "hidden" || input.revealMode === "team" || input.revealMode === "role"
        ? input.revealMode
        : fallback.revealMode,
    roleReveal: typeof input.roleReveal === "boolean" ? input.roleReveal : fallback.roleReveal,
  };
}
