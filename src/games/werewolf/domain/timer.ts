import type {
  WerewolfDayTimer,
  WerewolfDayTimerDurationSeconds,
  WerewolfDayTimerPublicSnapshot,
} from "./types";

export const dayTimerDurations = [120, 180, 300, 420, 600] as const satisfies readonly WerewolfDayTimerDurationSeconds[];
export const defaultDayTimerDurationSeconds = 300 satisfies WerewolfDayTimerDurationSeconds;

export function createDayTimer(durationSeconds: number = defaultDayTimerDurationSeconds): WerewolfDayTimer {
  const duration = normalizeDayTimerDuration(durationSeconds);

  return {
    durationSeconds: duration,
    status: "idle",
    startedAt: null,
    pausedRemainingSeconds: duration,
  };
}

export function ensureDayTimer(timer: WerewolfDayTimer | undefined | null): WerewolfDayTimer {
  if (!timer) return createDayTimer();
  const duration = isDayTimerDuration(timer.durationSeconds) ? timer.durationSeconds : defaultDayTimerDurationSeconds;
  const remaining = Number.isFinite(timer.pausedRemainingSeconds)
    ? Math.min(Math.max(0, Math.floor(timer.pausedRemainingSeconds)), duration)
    : duration;

  return {
    durationSeconds: duration,
    status: timer.status === "running" || timer.status === "paused" ? timer.status : "idle",
    startedAt: typeof timer.startedAt === "number" ? timer.startedAt : null,
    pausedRemainingSeconds: remaining,
  };
}

export function setDayTimerDurationValue(timer: WerewolfDayTimer, durationSeconds: number): WerewolfDayTimer {
  const duration = normalizeDayTimerDuration(durationSeconds);
  if (timer.status === "running") return timer;
  return createDayTimer(duration);
}

export function startDayTimerValue(timer: WerewolfDayTimer, now = Date.now()): WerewolfDayTimer {
  if (timer.status === "running") return timer;
  const remaining = timer.status === "paused" ? timer.pausedRemainingSeconds : timer.durationSeconds;

  return {
    ...timer,
    status: "running",
    startedAt: now,
    pausedRemainingSeconds: remaining,
  };
}

export function pauseDayTimerValue(timer: WerewolfDayTimer, now = Date.now()): WerewolfDayTimer {
  if (timer.status !== "running") return timer;

  return {
    ...timer,
    status: "paused",
    startedAt: null,
    pausedRemainingSeconds: dayTimerRemainingSeconds(timer, now),
  };
}

export function resetDayTimerValue(timer: WerewolfDayTimer): WerewolfDayTimer {
  return createDayTimer(timer.durationSeconds);
}

export function dayTimerRemainingSeconds(timer: WerewolfDayTimer, now = Date.now()): number {
  if (timer.status !== "running" || timer.startedAt === null) return Math.max(0, timer.pausedRemainingSeconds);
  const elapsedSeconds = Math.max(0, Math.floor((now - timer.startedAt) / 1000));
  return Math.max(0, timer.pausedRemainingSeconds - elapsedSeconds);
}

export function dayTimerExpired(timer: WerewolfDayTimer, now = Date.now()): boolean {
  return dayTimerRemainingSeconds(timer, now) === 0;
}

export function formatDayTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function createDayTimerPublicSnapshot(
  timer: WerewolfDayTimer | undefined | null,
  serverTime = Date.now(),
): WerewolfDayTimerPublicSnapshot {
  const dayTimer = ensureDayTimer(timer);

  return {
    durationSeconds: dayTimer.durationSeconds,
    status: dayTimer.status,
    startedAt: dayTimer.startedAt,
    remainingSeconds: dayTimerRemainingSeconds(dayTimer, serverTime),
    serverTime,
  };
}

function normalizeDayTimerDuration(durationSeconds: number): WerewolfDayTimerDurationSeconds {
  if (isDayTimerDuration(durationSeconds)) return durationSeconds;
  throw new Error("Invalid day timer duration.");
}

function isDayTimerDuration(durationSeconds: number): durationSeconds is WerewolfDayTimerDurationSeconds {
  return dayTimerDurations.includes(durationSeconds as WerewolfDayTimerDurationSeconds);
}
