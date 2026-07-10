import type { StageAudioDefinition } from "../../audio/stageAudio";
import type { WerewolfDayTimerPublicSnapshot } from "./domain/types";

export type WerewolfStageAmbience = "day" | "night";
export type WerewolfStageAudioCue = "tick" | "gong";

export interface WerewolfStageTimerCueState {
  emittedTicks: number[];
  gongPlayed: boolean;
  lastRemainingSeconds: number | null;
}

export const werewolfStageAudioDefinition = {
  ambience: {
    night: { url: new URL("./assets/audio/stage-night.mp3", import.meta.url).href },
    day: { url: new URL("./assets/audio/stage-day.mp3", import.meta.url).href },
  },
  cues: {
    tick: { url: new URL("./assets/audio/timer-tick.wav", import.meta.url).href, gain: 0.82 },
    gong: { url: new URL("./assets/audio/timer-gong.wav", import.meta.url).href },
  },
  defaultVolume: 0.6,
  mix: {
    ambienceGain: 0.42,
    crossfadeSeconds: 0.75,
    masterSmoothingSeconds: 0.03,
    resumeTimeoutMs: 5_000,
    sfxGain: 0.9,
  },
  storageKey: "tablegather-werewolf-stage-audio",
} satisfies StageAudioDefinition<WerewolfStageAmbience, WerewolfStageAudioCue>;

export function createWerewolfStageTimerCueState(): WerewolfStageTimerCueState {
  return { emittedTicks: [], gongPlayed: false, lastRemainingSeconds: null };
}

export function updateWerewolfStageTimerCues(
  state: WerewolfStageTimerCueState,
  timer: Pick<WerewolfDayTimerPublicSnapshot, "status"> | null,
  remainingSeconds: number | null,
  audible = true,
): { cues: WerewolfStageAudioCue[]; state: WerewolfStageTimerCueState } {
  if (!timer || remainingSeconds === null || timer.status === "idle") {
    return { cues: [], state: createWerewolfStageTimerCueState() };
  }

  const remaining = Math.max(0, Math.floor(remainingSeconds));
  const emittedTicks = [...state.emittedTicks];
  const gongPlayed = state.gongPlayed;
  const previous = state.lastRemainingSeconds;
  const currentTickPending = remaining >= 1 && remaining <= 5 && !emittedTicks.includes(remaining);

  if (previous !== null && remaining < previous) {
    for (let second = Math.min(5, previous - 1); second >= Math.max(1, remaining); second -= 1) {
      if (!emittedTicks.includes(second)) emittedTicks.push(second);
    }
  }

  const nextState = {
    emittedTicks,
    gongPlayed,
    lastRemainingSeconds: remaining,
  };

  if (timer.status === "running" && remaining === 0 && !gongPlayed) {
    return {
      cues: audible ? ["gong"] : [],
      state: { ...nextState, gongPlayed: true },
    };
  }

  if (!audible || timer.status !== "running" || previous === null || remaining >= previous) {
    return { cues: [], state: nextState };
  }

  if (currentTickPending) return { cues: ["tick"], state: nextState };
  return { cues: [], state: nextState };
}

export function werewolfStageTimerRemainingSeconds(timer: WerewolfDayTimerPublicSnapshot | null, now: number) {
  if (!timer) return null;
  const elapsedSeconds = timer.status === "running" ? Math.max(0, Math.floor((now - timer.serverTime) / 1000)) : 0;
  return Math.max(0, timer.remainingSeconds - elapsedSeconds);
}
