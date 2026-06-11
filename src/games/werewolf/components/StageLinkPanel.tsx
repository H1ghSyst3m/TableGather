import { Ban, Copy, Monitor, QrCode, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../../../clipboard";
import { useI18n } from "../../../i18n/useI18n";
import type { Locale } from "../../../types";

type CopyState = "idle" | "copied" | "failed";

export function StageLinkPanel({
  stageLink,
  qr,
  stageLocale,
  onCreate,
  onDisable,
  onStageLocaleChange,
}: {
  stageLink: string;
  qr: string | null;
  stageLocale: Locale;
  onCreate: () => void;
  onDisable: () => void;
  onStageLocaleChange: (locale: Locale) => void;
}) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    },
    [],
  );

  const resetCopyState = (state: Exclude<CopyState, "idle">) => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    setCopyState(state);
    copyResetTimerRef.current = window.setTimeout(() => {
      copyResetTimerRef.current = null;
      setCopyState("idle");
    }, 1800);
  };

  const copyLink = async () => {
    if (!stageLink) return;
    if (await copyText(stageLink)) {
      resetCopyState("copied");
      return;
    }

    linkInputRef.current?.focus();
    linkInputRef.current?.select();
    resetCopyState("failed");
  };

  return (
    <section className="panel stage-link-panel">
      <div className="panel-heading">
        <h3>
          <Monitor /> {t("werewolf.stageMode")}
        </h3>
        {stageLink && <span>{t("common.ready")}</span>}
      </div>
      {stageLink ? (
        <>
          <div className="stage-link-body">
            <div>
              <p>{t("werewolf.stageLinkHint")}</p>
              <input
                ref={linkInputRef}
                className="room-link-input"
                value={stageLink}
                readOnly
                aria-label={t("werewolf.stageLink")}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
            <StageQrCode qr={qr} label={t("werewolf.stageLink")} />
          </div>
          <StageLanguageControl locale={stageLocale} onChange={onStageLocaleChange} />
          <div className="stage-link-actions">
            <button className="secondary-button" type="button" onClick={copyLink}>
              <Copy /> {copyState === "copied" ? t("common.copied") : copyState === "failed" ? t("common.copySelected") : t("common.copy")}
            </button>
            <button className="secondary-button" type="button" onClick={onCreate}>
              <RotateCcw /> {t("werewolf.rotateStageLink")}
            </button>
            <button className="text-button danger" type="button" onClick={onDisable}>
              <Ban /> {t("werewolf.disableStageLink")}
            </button>
          </div>
          {copyState === "failed" && <p className="copy-feedback">{t("common.copyBlocked")}</p>}
        </>
      ) : (
        <button className="secondary-button full" type="button" onClick={onCreate}>
          <Monitor /> {t("werewolf.createStageLink")}
        </button>
      )}
    </section>
  );
}

function StageQrCode({ qr, label }: { qr: string | null; label: string }) {
  return qr ? <img src={qr} alt={label} /> : <QrCode />;
}

export function StageLanguageControl({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const { t } = useI18n();

  return (
    <div className="stage-language-control">
      <p>{t("werewolf.stageLanguage")}</p>
      <div className="settings-choice-grid stage-language-choice-grid" role="group" aria-label={t("werewolf.stageLanguage")}>
        <StageLanguageButton locale="en" activeLocale={locale} label={t("common.english")} onChoose={onChange} />
        <StageLanguageButton locale="de" activeLocale={locale} label={t("common.german")} onChoose={onChange} />
      </div>
    </div>
  );
}

function StageLanguageButton({
  locale,
  activeLocale,
  label,
  onChoose,
}: {
  locale: Locale;
  activeLocale: Locale;
  label: string;
  onChoose: (locale: Locale) => void;
}) {
  return (
    <button type="button" className={activeLocale === locale ? "active" : ""} aria-pressed={activeLocale === locale} onClick={() => onChoose(locale)}>
      <span>{label}</span>
      <strong>{locale.toUpperCase()}</strong>
    </button>
  );
}
