import { describe, expect, it } from "vitest";
import {
  createWerewolfStageTimerCueState,
  updateWerewolfStageTimerCues,
  werewolfStageTimerRemainingSeconds,
  type WerewolfStageAudioCue,
  type WerewolfStageTimerCueState,
} from "../src/games/werewolf/stageAudio";
import type { WerewolfDayTimerPublicSnapshot, WerewolfDayTimerStatus } from "../src/games/werewolf/domain/types";

describe("werewolf stage audio cues", () => {
  it("emits one tick for each final second and one gong at zero", () => {
    let state = createWerewolfStageTimerCueState();
    const cues: WerewolfStageAudioCue[] = [];

    for (const remaining of [6, 5, 5, 4, 3]) {
      ({ state } = collectCues(state, "running", remaining, cues));
    }
    ({ state } = collectCues(state, "paused", 3, cues));
    ({ state } = collectCues(state, "running", 3, cues));
    for (const remaining of [2, 1, 0, 0]) {
      ({ state } = collectCues(state, "running", remaining, cues));
    }

    expect(cues).toEqual(["tick", "tick", "tick", "tick", "tick", "gong"]);
    expect(state.gongPlayed).toBe(true);
  });

  it("emits one gong when a running timer is first observed at zero", () => {
    const initial = updateWerewolfStageTimerCues(
      createWerewolfStageTimerCueState(),
      timerStatus("running"),
      0,
    );
    expect(initial.cues).toEqual(["gong"]);
    expect(initial.state).toMatchObject({ gongPlayed: true, lastRemainingSeconds: 0 });

    const repeated = updateWerewolfStageTimerCues(initial.state, timerStatus("running"), 0);
    expect(repeated.cues).toEqual([]);
    expect(repeated.state.gongPlayed).toBe(true);
  });

  it("records an inaudible initial gong without replaying it later", () => {
    const hidden = updateWerewolfStageTimerCues(
      createWerewolfStageTimerCueState(),
      timerStatus("running"),
      0,
      false,
    );
    expect(hidden.cues).toEqual([]);
    expect(hidden.state.gongPlayed).toBe(true);

    const visible = updateWerewolfStageTimerCues(hidden.state, timerStatus("running"), 0, true);
    expect(visible.cues).toEqual([]);
  });

  it("waits to emit an initial zero gong until a paused timer starts running", () => {
    const paused = updateWerewolfStageTimerCues(
      createWerewolfStageTimerCueState(),
      timerStatus("paused"),
      0,
    );
    expect(paused.cues).toEqual([]);
    expect(paused.state.gongPlayed).toBe(false);

    const running = updateWerewolfStageTimerCues(paused.state, timerStatus("running"), 0);
    expect(running.cues).toEqual(["gong"]);
    expect(running.state.gongPlayed).toBe(true);
  });

  it("does not replay skipped cues after a hidden-tab resync", () => {
    let state = createWerewolfStageTimerCueState();
    state = updateWerewolfStageTimerCues(state, timerStatus("running"), 6).state;
    const hiddenResult = updateWerewolfStageTimerCues(state, timerStatus("running"), 2, false);
    expect(hiddenResult.cues).toEqual([]);
    expect(hiddenResult.state.emittedTicks).toEqual([5, 4, 3, 2]);

    const visibleResult = updateWerewolfStageTimerCues(hiddenResult.state, timerStatus("running"), 1, true);
    expect(visibleResult.cues).toEqual(["tick"]);
  });

  it("emits only the current cue after a running timer jump and resets from idle", () => {
    let state = updateWerewolfStageTimerCues(createWerewolfStageTimerCueState(), timerStatus("running"), 8).state;
    let result = updateWerewolfStageTimerCues(state, timerStatus("running"), 3);
    expect(result.cues).toEqual(["tick"]);

    state = updateWerewolfStageTimerCues(result.state, timerStatus("idle"), 120).state;
    result = updateWerewolfStageTimerCues(state, timerStatus("running"), 120);
    expect(result.cues).toEqual([]);
    result = updateWerewolfStageTimerCues(result.state, timerStatus("running"), 5);
    expect(result.cues).toEqual(["tick"]);
  });

  it("derives the current timer value from the synchronized server time", () => {
    const timer: WerewolfDayTimerPublicSnapshot = {
      durationSeconds: 120,
      status: "running",
      startedAt: 1_000,
      remainingSeconds: 60,
      serverTime: 10_000,
    };

    expect(werewolfStageTimerRemainingSeconds(timer, 14_999)).toBe(56);
    expect(werewolfStageTimerRemainingSeconds(timer, 80_000)).toBe(0);
    expect(werewolfStageTimerRemainingSeconds({ ...timer, status: "paused" }, 80_000)).toBe(60);
  });
});

function collectCues(
  state: WerewolfStageTimerCueState,
  status: WerewolfDayTimerStatus,
  remaining: number,
  cues: WerewolfStageAudioCue[],
) {
  const result = updateWerewolfStageTimerCues(state, timerStatus(status), remaining);
  cues.push(...result.cues);
  return result;
}

function timerStatus(status: WerewolfDayTimerStatus) {
  return { status };
}
