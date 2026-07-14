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
  const statusId = useId();
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
  const status = displayStatus(display, t);
  const classes = ["stage-display-control", className, status ? "error" : ""].filter(Boolean).join(" ");

  return (
    <div className={classes} role="group" aria-label={t("common.stageDisplay")}>
      <div className="stage-display-control-buttons">
        <button
          type="button"
          aria-busy={display.fullscreen.pending}
          aria-describedby={display.fullscreen.error ? statusId : undefined}
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
          aria-describedby={display.wakeLock.error ? statusId : undefined}
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
      {status && (
        <span id={statusId} className="stage-display-control-status" role="status" aria-live="polite">
          {status}
        </span>
      )}
    </div>
  );
}

function displayStatus(
  display: StageDisplayControlState,
  t: ReturnType<typeof useI18n>["t"],
) {
  const messages: string[] = [];

  if (display.fullscreen.error === "unsupported") messages.push(t("common.stageFullscreenUnsupported"));
  if (display.fullscreen.error === "requestFailed") messages.push(t("common.stageFullscreenUnavailable"));
  if (display.wakeLock.error === "unsupported") messages.push(t("common.stageWakeLockUnsupported"));
  if (display.wakeLock.error === "requestFailed") messages.push(t("common.stageWakeLockUnavailable"));
  if (display.wakeLock.error === "released") messages.push(t("common.stageWakeLockReleased"));

  return messages.join(" ");
}
