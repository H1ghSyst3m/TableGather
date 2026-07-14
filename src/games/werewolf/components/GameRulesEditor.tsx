import { BadgeHelp, Check, EyeOff, Shield, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { RevealMode, WerewolfOptions, WinMode } from "../domain/types";

export function GameRulesEditor({
  options,
  onChange,
  showRoleRevealOption = true,
}: {
  options: WerewolfOptions;
  onChange: (options: WerewolfOptions) => void;
  showRoleRevealOption?: boolean;
}) {
  const { t } = useI18n();
  const updateOptions = (patch: Partial<WerewolfOptions>) => onChange({ ...options, ...patch });

  return (
    <section className="panel rules-editor">
      <div className="panel-heading">
        <h3>{t("werewolf.gameRules")}</h3>
      </div>
      <div className="rules-editor-body">
        <OptionGroup<WinMode>
          label={t("werewolf.winMode")}
          options={[
            { value: "standard", label: t("werewolf.winStandard"), description: t("werewolf.winStandardHint"), icon: Shield },
            { value: "extended", label: t("werewolf.winExtended"), description: t("werewolf.winExtendedHint"), icon: Sparkles },
          ]}
          value={options.winMode}
          onChange={(winMode) => updateOptions({ winMode })}
        />
        <OptionGroup<RevealMode>
          label={t("werewolf.revealMode")}
          options={[
            { value: "hidden", label: t("werewolf.revealHidden"), description: t("werewolf.revealHiddenHint"), icon: EyeOff },
            { value: "team", label: t("werewolf.revealTeam"), description: t("werewolf.revealTeamHint"), icon: Users },
            { value: "role", label: t("werewolf.revealRole"), description: t("werewolf.revealRoleHint"), icon: BadgeHelp },
          ]}
          value={options.revealMode}
          onChange={(revealMode) => updateOptions({ revealMode })}
        />
        {showRoleRevealOption && (
          <label className="toggle-row">
            <span>
              <strong>{t("werewolf.roleRevealSetting")}</strong>
              <small>{t("werewolf.roleRevealSettingHint")}</small>
            </span>
            <input
              type="checkbox"
              checked={options.roleReveal}
              onChange={(event) => updateOptions({ roleReveal: event.target.checked })}
            />
          </label>
        )}
      </div>
    </section>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; description: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="option-group" role="radiogroup" aria-label={label}>
      <p>{label}</p>
      <div>
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={active ? "active" : ""}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
            >
              {Icon && (
                <span className="rules-option-icon" aria-hidden="true">
                  <Icon />
                </span>
              )}
              <span className="rules-option-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              {active && (
                <span className="rules-option-check" aria-hidden="true">
                  <Check />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
