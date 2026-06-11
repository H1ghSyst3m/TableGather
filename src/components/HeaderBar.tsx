import { ChevronDown, Globe2, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../types";

export function HeaderBar({
  onBack,
  actions,
  settingsActions,
  hideLanguageButton = false,
}: {
  onBack?: () => void;
  actions?: ReactNode;
  settingsActions?: ReactNode;
  hideLanguageButton?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const languageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!languageOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!languageRef.current?.contains(event.target as Node)) setLanguageOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [languageOpen]);

  const chooseLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setLanguageOpen(false);
  };

  return (
    <header className="header-bar">
      <div className="brand-row">
        {onBack ? (
          <button className="back-button" onClick={onBack} type="button">
            {t("common.back")}
          </button>
        ) : (
          <div className="app-brand">
            <img className="app-brand-mark" src="/icon.svg" alt="" aria-hidden="true" />
            <h1>{t("common.appName")}</h1>
          </div>
        )}
        <div className="header-actions">
          {actions}
          {!hideLanguageButton && (
            <div className="language-menu-wrap" ref={languageRef}>
              <button
                className="language-button"
                type="button"
                onClick={() => setLanguageOpen((open) => !open)}
                aria-expanded={languageOpen}
                aria-haspopup="menu"
                aria-label={t("common.language")}
              >
                <Globe2 />
                <span>{locale.toUpperCase()}</span>
                <ChevronDown />
              </button>
              {languageOpen && (
                <div className="language-menu" role="menu">
                  <LanguageChoice locale="en" activeLocale={locale} label={t("common.english")} onChoose={chooseLocale} />
                  <LanguageChoice locale="de" activeLocale={locale} label={t("common.german")} onChoose={chooseLocale} />
                </div>
              )}
            </div>
          )}
          <button className="icon-button" type="button" aria-label={t("common.settings")} onClick={() => setSettingsOpen(true)}>
            <Settings />
          </button>
        </div>
      </div>
      {settingsOpen && createPortal(
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section className="settings-sheet" role="dialog" aria-modal="true" aria-label={t("common.settings")}>
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
            {settingsActions && <div className="settings-action-list">{settingsActions}</div>}
            <div className="settings-note">
              <strong>{t("common.session")}</strong>
              <span>{t("common.settingsSessionHint")}</span>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </header>
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
