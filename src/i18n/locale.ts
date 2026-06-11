import type { Locale } from "../types";

const STORAGE_KEY = "tablegather-locale";

interface LocaleSource {
  storage?: Pick<Storage, "getItem"> | null;
  navigator?: { language?: string; languages?: readonly string[] } | null;
}

export function resolveInitialLocale(source: LocaleSource = {}): Locale {
  const stored = readStoredLocale(source.storage ?? safeLocalStorage());
  return stored ?? browserLocale(source.navigator ?? safeNavigator());
}

export function persistLocale(locale: Locale) {
  try {
    safeLocalStorage()?.setItem(STORAGE_KEY, locale);
  } catch {
    // Persisting the language is best-effort; the in-memory locale still updates.
  }
}

function readStoredLocale(storage: Pick<Storage, "getItem"> | null): Locale | null {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return stored === "de" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
}

function browserLocale(browser: LocaleSource["navigator"]): Locale {
  const languages = [...(browser?.languages ?? []), browser?.language].filter((value): value is string => Boolean(value));
  return languages.some((language) => language.toLowerCase().split("-")[0] === "de") ? "de" : "en";
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function safeNavigator(): LocaleSource["navigator"] {
  return typeof navigator === "undefined" ? null : navigator;
}
