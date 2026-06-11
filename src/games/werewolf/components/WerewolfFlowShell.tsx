import { ChevronLeft, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/useI18n";
import type { Locale } from "../../../types";

export interface WerewolfSettingsActionsControls {
  closeSettings: () => void;
}

export interface WerewolfFlowShellProps {
  title: string;
  onBack?: () => void;
  headerActions?: ReactNode;
  settingsActions?: ReactNode | ((controls: WerewolfSettingsActionsControls) => ReactNode);
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WerewolfFlowShell({
  title,
  onBack,
  headerActions,
  settingsActions,
  footer,
  children,
  className = "",
}: WerewolfFlowShellProps) {
  const { locale, setLocale, t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  return (
    <main className={`app-frame werewolf-flow-shell ${className}`.trim()}>
      <header className="werewolf-flow-header">
        <div className="werewolf-flow-header-side">
          {onBack && (
            <button className="werewolf-flow-back" type="button" onClick={onBack} aria-label={t("common.back")}>
              <ChevronLeft />
              <span>{t("common.back")}</span>
            </button>
          )}
        </div>
        <h1 className="werewolf-flow-title">{title}</h1>
        <div className="werewolf-flow-header-actions">
          {headerActions}
          <button className="werewolf-flow-icon-button" type="button" aria-label={t("common.settings")} title={t("common.settings")} onClick={() => setSettingsOpen(true)}>
            <Settings />
          </button>
        </div>
      </header>

      <div className="werewolf-flow-body">{children}</div>

      {footer && (
        <div className="werewolf-flow-footer">
          <div className="werewolf-flow-footer-content">{footer}</div>
        </div>
      )}

      {settingsOpen && createPortal(
        <div
          className="settings-backdrop werewolf-settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section className="settings-sheet werewolf-settings-sheet" role="dialog" aria-modal="true" aria-label={t("common.settings")}>
            <div className="panel-heading">
              <h3>{t("common.settings")}</h3>
              <button className="icon-button" type="button" aria-label={t("common.close")} onClick={() => setSettingsOpen(false)}>
                <X />
              </button>
            </div>
            <div className="settings-section">
              <p>{t("common.interfaceLanguage")}</p>
              <div className="settings-choice-grid">
                <LanguageChoice locale="en" activeLocale={locale} label={t("common.english")} onChoose={setLocale} />
                <LanguageChoice locale="de" activeLocale={locale} label={t("common.german")} onChoose={setLocale} />
              </div>
            </div>
            {settingsActions && (
              <div className="settings-action-list">
                {typeof settingsActions === "function" ? settingsActions({ closeSettings: () => setSettingsOpen(false) }) : settingsActions}
              </div>
            )}
            <div className="settings-note">
              <strong>{t("common.session")}</strong>
              <span>{t("common.settingsSessionHint")}</span>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </main>
  );
}

function LanguageChoice({
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
    <button type="button" className={activeLocale === locale ? "active" : ""} role="menuitemradio" aria-checked={activeLocale === locale} onClick={() => onChoose(locale)}>
      <span>{label}</span>
      <strong>{locale.toUpperCase()}</strong>
    </button>
  );
}
