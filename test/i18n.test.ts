import { describe, expect, it } from "vitest";
import { werewolfDe } from "../src/games/werewolf/i18n/de";
import { werewolfEn } from "../src/games/werewolf/i18n/en";
import { roleDefinitions, selectableRoleOrder } from "../src/games/werewolf/domain/roles";
import { commonDe } from "../src/i18n/common/de";
import { commonEn } from "../src/i18n/common/en";
import { hubDe } from "../src/i18n/hub/de";
import { hubEn } from "../src/i18n/hub/en";
import { resolveInitialLocale } from "../src/i18n/locale";
import { translations, translate } from "../src/i18n/translations";
import type { RoleId } from "../src/games/werewolf/domain/types";
import type { TranslationKey } from "../src/i18n/translations";

describe("i18n", () => {
  it("uses English as the default product language", () => {
    expect(translate("en", "hub.startGame", { game: "Werewolf" })).toBe("Start Werewolf");
  });

  it("prefers a stored locale over the browser language", () => {
    expect(resolveInitialLocale({ storage: storageWithLocale("de"), navigator: { language: "en-US" } })).toBe("de");
    expect(resolveInitialLocale({ storage: storageWithLocale("en"), navigator: { language: "de-DE" } })).toBe("en");
  });

  it("uses German for German browser languages and English otherwise", () => {
    expect(resolveInitialLocale({ storage: null, navigator: { language: "de" } })).toBe("de");
    expect(resolveInitialLocale({ storage: null, navigator: { language: "de-DE" } })).toBe("de");
    expect(resolveInitialLocale({ storage: null, navigator: { languages: ["fr-FR", "de-AT"], language: "fr-FR" } })).toBe("de");
    expect(resolveInitialLocale({ storage: null, navigator: { language: "en-US" } })).toBe("en");
    expect(resolveInitialLocale({ storage: null, navigator: { language: "fr-FR" } })).toBe("en");
  });

  it("renders the bundled German locale", () => {
    expect(translate("de", "hub.roomMode")).toBe("Raum-Modus");
  });

  it("loads registered game bundles and falls back for missing keys", () => {
    expect(translate("en", "werewolf.setupTitle")).toBe("Set up Werewolf");
    expect(translate("de", "roles.werewolf.name")).toBe("Werwolf");
    expect(translate("de", "missing.translation.key")).toBe("missing.translation.key");
  });

  it("keeps German locale keys aligned with English", () => {
    expect(translationKeys(translations.de)).toEqual(translationKeys(translations.en));
    expect(translationKeys(commonDe)).toEqual(translationKeys(commonEn));
    expect(translationKeys(hubDe)).toEqual(translationKeys(hubEn));
    expect(translationKeys(werewolfDe)).toEqual(translationKeys(werewolfEn));
  });

  it("covers visible werewolf role rules in English and German", () => {
    const visibleRoleIds = [...selectableRoleOrder, "villager"] as RoleId[];

    for (const roleId of visibleRoleIds) {
      const role = roleDefinitions[roleId];
      expect(translate("en", role.nameKey)).not.toContain("roles.");
      expect(translate("de", role.nameKey)).not.toContain("roles.");

      for (const ruleKey of role.ruleKeys) {
        const titleKey = `roleRules.${roleId}.${ruleKey}.title` as TranslationKey;
        const textKey = `roleRules.${roleId}.${ruleKey}.text` as TranslationKey;
        expect(translate("en", titleKey)).not.toContain("roleRules.");
        expect(translate("de", titleKey)).not.toContain("roleRules.");
        expect(translate("en", textKey)).not.toContain("roleRules.");
        expect(translate("de", textKey)).not.toContain("roleRules.");
      }
    }
  });
});

function storageWithLocale(locale: string | null) {
  return { getItem: () => locale };
}

function translationKeys(bundle: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(bundle)
    .flatMap(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === "object" ? translationKeys(value as Record<string, unknown>, fullKey) : [fullKey];
    })
    .sort();
}
