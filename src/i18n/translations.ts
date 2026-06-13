import { games } from "../games/registry";
import type { Locale } from "../types";
import { adminDe } from "./admin/de";
import { adminEn } from "./admin/en";
import { commonDe } from "./common/de";
import { commonEn } from "./common/en";
import { hubDe } from "./hub/de";
import { hubEn } from "./hub/en";
import { mergeTranslationBundles } from "./merge";
import type { TranslationKey, TranslationTree } from "./types";

export type { TranslationKey } from "./types";

export const translations: Record<Locale, TranslationTree> = {
  en: mergeTranslationBundles(
    commonEn,
    hubEn,
    adminEn,
    ...games.flatMap((game) => (game.i18n.en ? [game.i18n.en] : [])),
  ),
  de: mergeTranslationBundles(
    commonDe,
    hubDe,
    adminDe,
    ...games.flatMap((game) => (game.i18n.de ? [game.i18n.de] : [])),
  ),
};

export function translate(locale: Locale, key: TranslationKey, values: Record<string, string | number> = {}) {
  const value = readValue(translations[locale], key) ?? readValue(translations.en, key) ?? key;

  return Object.entries(values).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    value,
  );
}

function readValue(tree: TranslationTree, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree);

  return typeof value === "string" ? value : undefined;
}
