import { LoaderCircle, Maximize2, Minimize2, Sun, SunDim } from "lucide-react";
import { useId } from "react";
import type { StageDisplayControlState } from "../stage/useStageDisplay";
import { useI18n } from "../i18n/useI18n";

export function StageDisplayControl({
  display,
  className = "",
}: {
  display: StageDisplayControlState;
  className?: string;
}) {
  const { t } = useI18n();
  const fullscreenStatusId = useId();
  const wakeLockStatusId = useId();
  const fullscreenLabel = display.fullscreen.pending
    ? t("common.stageFullscreenLoading")
    : display.fullscreen.active
      ? t("common.stageFullscreenExit")
      : t("common.stageFullscreenEnter");
  const wakeLockLabel = display.wakeLock.pending
    ? t("common.stageWakeLockLoading")
    : display.wakeLock.requested
      ? t("common.stageWakeLockDisable")
      : t("common.stageWakeLockEnable");
  const fullscreenStatus = getFullscreenStatus(display, t);
  const wakeLockStatus = getWakeLockStatus(display, t);
  const hasStatus = Boolean(fullscreenStatus || wakeLockStatus);
  const classes = ["stage-display-control", className, hasStatus ? "error" : ""].filter(Boolean).join(" ");

  return (
    <div className={classes} role="group" aria-label={t("common.stageDisplay")}>
      <div className="stage-display-control-buttons">
        <button
          type="button"
          aria-busy={display.fullscreen.pending}
          aria-describedby={fullscreenStatus ? fullscreenStatusId : undefined}
          aria-label={fullscreenLabel}
          aria-pressed={display.fullscreen.active}
          className={display.fullscreen.active ? "active" : ""}
          disabled={!display.fullscreen.supported || display.fullscreen.pending}
          title={fullscreenLabel}
          onClick={display.toggleFullscreen}
        >
          {display.fullscreen.pending
            ? <LoaderCircle className="stage-display-control-loading" />
            : display.fullscreen.active ? <Minimize2 /> : <Maximize2 />}
        </button>
        <button
          type="button"
          aria-busy={display.wakeLock.pending}
          aria-describedby={wakeLockStatus ? wakeLockStatusId : undefined}
          aria-label={wakeLockLabel}
          aria-pressed={display.wakeLock.requested}
          className={display.wakeLock.requested ? "active" : ""}
          disabled={!display.wakeLock.supported || display.wakeLock.pending}
          title={wakeLockLabel}
          onClick={display.toggleWakeLock}
        >
          {display.wakeLock.pending
            ? <LoaderCircle className="stage-display-control-loading" />
            : display.wakeLock.requested ? <Sun /> : <SunDim />}
        </button>
      </div>
      {hasStatus && (
        <span className="stage-display-control-status">
          {fullscreenStatus && (
            <span id={fullscreenStatusId} role="status" aria-live="polite">
              {fullscreenStatus}
            </span>
          )}
          {fullscreenStatus && wakeLockStatus ? " " : null}
          {wakeLockStatus && (
            <span id={wakeLockStatusId} role="status" aria-live="polite">
              {wakeLockStatus}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function getFullscreenStatus(
  display: StageDisplayControlState,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (display.fullscreen.error === "unsupported") return t("common.stageFullscreenUnsupported");
  if (display.fullscreen.error === "requestFailed") return t("common.stageFullscreenUnavailable");
  return null;
}

function getWakeLockStatus(
  display: StageDisplayControlState,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (display.wakeLock.error === "unsupported") return t("common.stageWakeLockUnsupported");
  if (display.wakeLock.error === "requestFailed") return t("common.stageWakeLockUnavailable");
  if (display.wakeLock.error === "released") return t("common.stageWakeLockReleased");
  return null;
}
