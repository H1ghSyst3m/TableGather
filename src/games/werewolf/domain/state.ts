import { ensureDayTimer, resetDayTimerValue } from "./timer";
import type { WerewolfState } from "./types";

export function cloneWerewolfState(state: WerewolfState): WerewolfState {
  return structuredClone(state) as WerewolfState;
}

export function resetRestoredDayTimer(state: WerewolfState): WerewolfState {
  if (state.phase !== "day") return state;
  return { ...state, dayTimer: resetDayTimerValue(ensureDayTimer(state.dayTimer)) };
}

export function areWerewolfStatesEqual(previousState: WerewolfState, nextState: WerewolfState): boolean {
  return areEqualValues(previousState, nextState);
}

function areEqualValues(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!isObjectValue(left) || !isObjectValue(right)) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => areEqualValues(item, right[index]));
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && areEqualValues(left[key], right[key]));
}

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
