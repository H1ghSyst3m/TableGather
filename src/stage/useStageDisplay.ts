import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  StageDisplayController,
  type StageDisplayState,
} from "./stageDisplay";

export interface StageDisplayControlState extends StageDisplayState {
  toggleFullscreen: () => void;
  toggleWakeLock: () => void;
}

const unavailableState: StageDisplayState = {
  fullscreen: { active: false, error: null, pending: false, supported: false },
  wakeLock: { active: false, error: null, pending: false, requested: false, supported: false },
};

const subscribeUnavailable = () => () => undefined;
const getUnavailableState = () => unavailableState;

export function useStageDisplay(): StageDisplayControlState {
  const [controller] = useState(() =>
    typeof document === "undefined" || typeof navigator === "undefined"
      ? null
      : new StageDisplayController({ document, navigator }),
  );
  const state = useSyncExternalStore(
    controller?.subscribe ?? subscribeUnavailable,
    controller?.getSnapshot ?? getUnavailableState,
    getUnavailableState,
  );

  const toggleFullscreen = useCallback(() => {
    void controller?.toggleFullscreen();
  }, [controller]);
  const toggleWakeLock = useCallback(() => {
    void controller?.toggleWakeLock();
  }, [controller]);

  return useMemo(() => ({
    ...state,
    toggleFullscreen,
    toggleWakeLock,
  }), [state, toggleFullscreen, toggleWakeLock]);
}
