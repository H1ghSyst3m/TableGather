/// <reference lib="dom" />

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStageAudioPreferences,
  isRetryableStageAudioActivationError,
  normalizeStageAudioVolume,
  saveStageAudioPreferences,
  StageAudioEngine,
  type StageAudioControlState,
  type StageAudioDefinition,
} from "./stageAudio";

export interface StageAudioController<CueId extends string> extends StageAudioControlState {
  playCue: (cue: CueId) => void;
}

export function useStageAudio<AmbienceId extends string, CueId extends string>(
  definition: StageAudioDefinition<AmbienceId, CueId>,
  ambience: AmbienceId | null,
): StageAudioController<CueId> {
  const [preferences, setPreferences] = useState(() =>
    loadStageAudioPreferences(definition.storageKey, definition.defaultVolume),
  );
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<StageAudioControlState["error"]>(null);
  const [loading, setLoading] = useState(false);
  const engineRef = useRef<StageAudioEngine<AmbienceId, CueId> | null>(null);
  const activationIdRef = useRef(0);
  const mountedRef = useRef(true);
  const preferencesRef = useRef(preferences);
  const ambienceRef = useRef(ambience);

  const getEngine = useCallback(() => {
    engineRef.current ??= new StageAudioEngine(definition);
    return engineRef.current;
  }, [definition]);

  const activate = useCallback(async (nextPreferences: typeof preferences) => {
    const activationId = activationIdRef.current + 1;
    activationIdRef.current = activationId;
    setLoading(true);
    setError(null);
    const engine = getEngine();

    try {
      const result = await engine.activate(nextPreferences.volume, nextPreferences.muted);
      engine.setAmbience(ambienceRef.current);
      if (!mountedRef.current || activationId !== activationIdRef.current) return;
      setEnabled(result.loaded.length > 0);
      setError(result.failed.length > 0 ? "assets" : null);
    } catch (activationError) {
      const isCurrentAttempt = activationId === activationIdRef.current;
      if (isCurrentAttempt && !isRetryableStageAudioActivationError(activationError) && engineRef.current === engine) {
        engineRef.current = null;
        try {
          await engine.dispose();
        } catch {
          // A fresh engine is still used for the next activation attempt.
        }
      }
      if (!mountedRef.current || !isCurrentAttempt) return;
      setEnabled(false);
      setError("activation");
    } finally {
      if (activationId === activationIdRef.current) {
        if (mountedRef.current) setLoading(false);
      }
    }
  }, [getEngine]);

  const updatePreferences = useCallback((nextPreferences: typeof preferences) => {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    saveStageAudioPreferences(definition.storageKey, nextPreferences);
    engineRef.current?.setVolume(nextPreferences.volume, nextPreferences.muted);
  }, [definition.storageKey]);

  const toggle = useCallback(() => {
    if (!enabled) {
      const nextPreferences = { ...preferencesRef.current, muted: false };
      updatePreferences(nextPreferences);
      void activate(nextPreferences);
      return;
    }

    const nextPreferences = { ...preferencesRef.current, muted: !preferencesRef.current.muted };
    updatePreferences(nextPreferences);
    if (!nextPreferences.muted) void activate(nextPreferences);
  }, [activate, enabled, updatePreferences]);

  const setVolume = useCallback((volume: number) => {
    const normalizedVolume = normalizeStageAudioVolume(volume, definition.defaultVolume);
    const nextPreferences = { muted: normalizedVolume === 0, volume: normalizedVolume };
    updatePreferences(nextPreferences);
    if (!enabled && normalizedVolume > 0) void activate(nextPreferences);
  }, [activate, definition.defaultVolume, enabled, updatePreferences]);

  const playCue = useCallback((cue: CueId) => {
    if (enabled && !preferencesRef.current.muted) engineRef.current?.playCue(cue);
  }, [enabled]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    ambienceRef.current = ambience;
    engineRef.current?.setAmbience(ambience);
  }, [ambience]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activationIdRef.current += 1;
      const engine = engineRef.current;
      engineRef.current = null;
      void engine?.dispose();
    };
  }, []);

  return {
    enabled,
    error,
    loading,
    muted: preferences.muted,
    playCue,
    setVolume,
    toggle,
    volume: preferences.volume,
  };
}
