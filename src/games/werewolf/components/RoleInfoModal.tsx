import { Info, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { RoleDefinition } from "../domain/roles";
import { useI18n } from "../../../i18n/useI18n";
import type { TranslationKey } from "../../../i18n/translations";

export function RoleInfoModal({
  role,
  onClose,
  showIdentity = true,
}: {
  role: RoleDefinition;
  onClose: () => void;
  showIdentity?: boolean;
}) {
  const { t } = useI18n();

  return createPortal(
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="role-info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={showIdentity ? t("werewolf.roleInfo", { role: t(role.nameKey) }) : t("werewolf.roleDescription")}
      >
        <div className="panel-heading">
          <h3>{showIdentity ? t(role.nameKey) : t("werewolf.roleDescription")}</h3>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="role-info-description">{t(role.descriptionKey)}</p>
        {!role.handledByApp && (
          <p className="result-note">
            <Info /> {t("werewolf.tableRuleRoleHint")}
          </p>
        )}
        <div className="role-rule-list">
          <p>{t("werewolf.roleRules")}</p>
          {role.ruleKeys.map((ruleKey) => (
            <article key={ruleKey}>
              <strong>{t(`roleRules.${role.id}.${ruleKey}.title` as TranslationKey)}</strong>
              <span>{t(`roleRules.${role.id}.${ruleKey}.text` as TranslationKey)}</span>
            </article>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
