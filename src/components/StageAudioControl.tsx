import { LoaderCircle, Volume2, VolumeX } from "lucide-react";
import type { StageAudioControlState } from "../audio/stageAudio";
import { useI18n } from "../i18n/useI18n";

export function StageAudioControl({
  audio,
  className = "",
}: {
  audio: StageAudioControlState;
  className?: string;
}) {
  const { t } = useI18n();
  const active = audio.enabled && !audio.muted;
  const errorLabel = audio.error === "activation"
    ? t("common.stageAudioNeedsInteraction")
    : t("common.stageAudioUnavailable");
  const buttonLabel = audio.loading
    ? t("common.stageAudioLoading")
    : audio.error && !audio.enabled
      ? errorLabel
      : !audio.enabled
        ? t("common.stageAudioEnable")
        : audio.muted
          ? t("common.stageAudioUnmute")
          : t("common.stageAudioMute");
  const classes = ["stage-audio-control", className, audio.error ? "error" : ""].filter(Boolean).join(" ");

  return (
    <div className={classes} role="group" aria-label={t("common.stageAudio")}>
      <button
        type="button"
        aria-label={buttonLabel}
        aria-pressed={active}
        title={buttonLabel}
        onClick={audio.toggle}
      >
        {audio.loading ? <LoaderCircle className="stage-audio-control-loading" /> : active ? <Volume2 /> : <VolumeX />}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(audio.volume * 100)}
        aria-label={t("common.stageAudioVolume")}
        onChange={(event) => audio.setVolume(Number(event.currentTarget.value) / 100)}
      />
      {audio.error && (
        <span className="stage-audio-control-status" role="status" aria-live="polite">
          {errorLabel}
        </span>
      )}
    </div>
  );
}
