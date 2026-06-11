import { BookOpen, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { roleDefinitions, selectableRoleOrder, type RoleCategory } from "../domain/roles";
import { defaultWerewolfOptions } from "../domain/setup";
import type { RevealMode, RoleId, WerewolfOptions, WinMode } from "../domain/types";
import { useI18n } from "../../../i18n/useI18n";
import type { TranslationKey } from "../../../i18n/translations";

const categoryOrder: RoleCategory[] = ["classic", "special"];

export function GameRulesButton({ compact = false, options }: { compact?: boolean; options?: WerewolfOptions }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={compact ? "icon-button" : "secondary-button"} type="button" onClick={() => setOpen(true)} aria-label={t("werewolf.gameRules")}>
        <BookOpen />
        {!compact && t("werewolf.gameRules")}
      </button>
      {open && createPortal(<RoleRulesModal options={options} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

export function RoleRulesModal({ options = defaultWerewolfOptions, onClose }: { options?: WerewolfOptions; onClose: () => void }) {
  const { t } = useI18n();
  const roleIds = ["villager", ...selectableRoleOrder] as RoleId[];
  const winRule = winModeRule(options.winMode);
  const revealRule = revealModeRule(options.revealMode);

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="role-rules-modal" role="dialog" aria-modal="true" aria-labelledby="role-rules-title">
        <header className="role-rules-header">
          <div>
            <p className="section-label">{t("werewolf.gameRules")}</p>
            <h2 id="role-rules-title">{t("werewolf.gameRulesTitle")}</h2>
            <span>{t("werewolf.gameRulesSubtitle")}</span>
          </div>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="role-rules-content">
          <section className="role-rules-category">
            <h3>{t("werewolf.gameRules")}</h3>
            <article className="role-rules-card">
              <div>
                <h4>{t("werewolf.winMode")}: {t(winRule.labelKey)}</h4>
                <span>{t(winRule.descriptionKey)}</span>
              </div>
            </article>
            <article className="role-rules-card">
              <div>
                <h4>{t("werewolf.revealMode")}: {t(revealRule.labelKey)}</h4>
                <span>{t(revealRule.descriptionKey)}</span>
              </div>
            </article>
            <article className="role-rules-card">
              <div>
                <h4>{t("werewolf.roleRevealSetting")}</h4>
                <span>{t("werewolf.roleRevealSettingHint")}</span>
              </div>
            </article>
          </section>

          {categoryOrder.map((category) => {
            const categoryRoles = roleIds.filter((roleId) => roleDefinitions[roleId].category === category);
            return (
              <section className="role-rules-category" key={category}>
                <h3>{t(category === "classic" ? "werewolf.classicRoles" : "werewolf.specialRoles")}</h3>
                {categoryRoles.map((roleId) => {
                  const role = roleDefinitions[roleId];
                  return (
                    <article className="role-rules-card" key={roleId}>
                      <div>
                        <h4>{t(role.nameKey)}</h4>
                        <span>{t(role.descriptionKey)}</span>
                      </div>
                      <div className="role-rule-list compact">
                        {role.ruleKeys.map((ruleKey) => (
                          <details key={ruleKey}>
                            <summary>{t(`roleRules.${role.id}.${ruleKey}.title` as TranslationKey)}</summary>
                            <p>{t(`roleRules.${role.id}.${ruleKey}.text` as TranslationKey)}</p>
                          </details>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function winModeRule(winMode: WinMode) {
  return winMode === "extended"
    ? { labelKey: "werewolf.winExtended", descriptionKey: "werewolf.winExtendedHint" } as const
    : { labelKey: "werewolf.winStandard", descriptionKey: "werewolf.winStandardHint" } as const;
}

function revealModeRule(revealMode: RevealMode) {
  if (revealMode === "hidden") {
    return { labelKey: "werewolf.revealHidden", descriptionKey: "werewolf.revealHiddenHint" } as const;
  }
  if (revealMode === "team") {
    return { labelKey: "werewolf.revealTeam", descriptionKey: "werewolf.revealTeamHint" } as const;
  }
  return { labelKey: "werewolf.revealRole", descriptionKey: "werewolf.revealRoleHint" } as const;
}
