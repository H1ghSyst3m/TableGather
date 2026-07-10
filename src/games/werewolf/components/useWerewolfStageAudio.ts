/// <reference lib="dom" />

import { useEffect, useRef } from "react";
import { useStageAudio } from "../../../audio/useStageAudio";
import type { WerewolfDayTimerPublicSnapshot } from "../domain/types";
import {
  createWerewolfStageTimerCueState,
  updateWerewolfStageTimerCues,
  werewolfStageAudioDefinition,
  werewolfStageTimerRemainingSeconds,
  type WerewolfStageAmbience,
} from "../stageAudio";
import { useSyncedNow } from "./useSyncedNow";

export function useWerewolfStageAudio(
  ambience: WerewolfStageAmbience | null,
  timer: WerewolfDayTimerPublicSnapshot | null,
) {
  const audio = useStageAudio(werewolfStageAudioDefinition, ambience);
  const { playCue } = audio;
  const timerRef = useRef(timer);
  const serverOffsetRef = useRef(0);
  const cueStateRef = useRef(createWerewolfStageTimerCueState());
  const now = useSyncedNow(timer?.serverTime, timer?.status === "running");
  const remainingSeconds = werewolfStageTimerRemainingSeconds(timer, now);

  useEffect(() => {
    timerRef.current = timer;
    if (timer) serverOffsetRef.current = timer.serverTime - Date.now();
  }, [timer]);

  useEffect(() => {
    const audible = typeof document === "undefined" || document.visibilityState === "visible";
    const result = updateWerewolfStageTimerCues(cueStateRef.current, timer, remainingSeconds, audible);
    cueStateRef.current = result.state;
    for (const cue of result.cues) playCue(cue);
  }, [playCue, remainingSeconds, timer]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncAfterVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const currentTimer = timerRef.current;
      const serverNow = Date.now() + serverOffsetRef.current;
      const currentRemaining = werewolfStageTimerRemainingSeconds(currentTimer, serverNow);
      cueStateRef.current = updateWerewolfStageTimerCues(
        cueStateRef.current,
        currentTimer,
        currentRemaining,
        false,
      ).state;
    };
    document.addEventListener("visibilitychange", syncAfterVisibilityChange);
    return () => document.removeEventListener("visibilitychange", syncAfterVisibilityChange);
  }, []);

  return audio;
}
