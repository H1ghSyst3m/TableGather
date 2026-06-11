import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "../types";
import { I18nContext, type I18nContextValue } from "./context";
import { persistLocale, resolveInitialLocale } from "./locale";
import { translate } from "./translations";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());

  useEffect(() => {
    persistLocale(locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
