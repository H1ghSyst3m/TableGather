import {
  BadgeHelp,
  Check,
  EyeOff,
  Home,
  Info,
  Minus,
  Plus,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { roleDefinitions, selectableRoleOrder, type RoleCategory, type RoleGroup } from "../domain/roles";
import {
  autoFillVillagers,
  nonVillagerRoleTotal,
  roleCountTotal,
  sanitizeRoleCount,
  validateRoleCounts,
} from "../domain/setup";
import type { RevealMode, RoleCounts, RoleId, WerewolfOptions, WinMode } from "../domain/types";
import { useI18n } from "../../../i18n/useI18n";
import { RoleInfoModal } from "./RoleInfoModal";
import { RoleIconChip } from "./WerewolfIcons";

const roleGroups: RoleGroup[] = ["wolf", "village", "specialGoal"];

export function RoleCountEditor({
  playerCount,
  counts,
  onChange,
  options,
  onOptionsChange,
  hideRoleReveal = false,
}: {
  playerCount: number;
  counts: RoleCounts;
  onChange: (counts: RoleCounts) => void;
  options?: WerewolfOptions;
  onOptionsChange?: (options: WerewolfOptions) => void;
  hideRoleReveal?: boolean;
}) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<RoleCategory>("classic");
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId | null>(null);
  const displayCounts = useMemo(() => autoFillVillagers(counts, playerCount), [counts, playerCount]);
  const validation = validateRoleCounts(playerCount, displayCounts);
  const totalRoles = roleCountTotal(displayCounts);
  const nonVillagers = nonVillagerRoleTotal(displayCounts);
  const freeSlots = playerCount - nonVillagers;
  const villagerCount = sanitizeRoleCount(displayCounts, "villager");
  const suggestedWerewolves = Math.max(1, Math.floor(Math.max(playerCount, 5) / 4));
  const wolfCount = selectableRoleOrder.reduce(
    (total, roleId) =>
      roleDefinitions[roleId].team === "werewolves" ? total + sanitizeRoleCount(displayCounts, roleId) : total,
    0,
  );

  const setCount = (roleId: RoleId, value: number) => {
    onChange(autoFillVillagers({ ...displayCounts, [roleId]: Math.max(0, value) }, playerCount));
  };

  const updateOptions = (patch: Partial<WerewolfOptions>) => {
    if (!options || !onOptionsChange) return;
    onOptionsChange({ ...options, ...patch });
  };

  return (
    <section className="panel role-editor">
      <div className="panel-heading">
        <h3>{t("werewolf.roleSetup")}</h3>
        <span className="role-editor-heading-actions">
          <span className={validation.valid ? "valid-text" : "error-text"}>
            {validation.valid ? t("werewolf.validRoleCount") : t("werewolf.invalidRoleCount")}
          </span>
        </span>
      </div>

      <div className="role-summary-grid">
        <SummaryStat label={t("common.players")} value={playerCount} tone="neutral" />
        <SummaryStat
          label={t("werewolf.roles")}
          value={`${totalRoles}/${playerCount}`}
          tone={validation.valid ? "good" : totalRoles > playerCount ? "bad" : "warn"}
        />
        <SummaryStat
          label={freeSlots < 0 ? t("werewolf.tooManyRoles") : t("werewolf.villageSlots")}
          value={freeSlots < 0 ? Math.abs(freeSlots) : freeSlots}
          tone={freeSlots < 0 ? "bad" : freeSlots === 0 ? "good" : "warn"}
        />
      </div>

      <div className="role-balance-card">
        <div>
          <strong>{t("werewolf.balance")}</strong>
          <span>{t("werewolf.suggestedWerewolves", { count: suggestedWerewolves })}</span>
        </div>
        <span className={wolfCount === suggestedWerewolves ? "valid-text" : "muted-text"}>
          {wolfCount} {t("werewolf.werewolves")}
        </span>
      </div>

      {options && onOptionsChange && (
        <RulesPanel
          options={options}
          hideRoleReveal={hideRoleReveal}
          onWinMode={(winMode) => updateOptions({ winMode })}
          onRevealMode={(revealMode) => updateOptions({ revealMode })}
          onRoleReveal={(roleReveal) => updateOptions({ roleReveal })}
        />
      )}

      <div className="auto-villager-card">
        <Home />
        <div>
          <strong>
            {t("werewolf.autoVillagers")}: {villagerCount}
          </strong>
          <span>{t("werewolf.autoVillagersHint")}</span>
        </div>
      </div>

      <div className="category-tabs" role="tablist" aria-label={t("werewolf.roleCategories")}>
        {(["classic", "special"] as const).map((category) => (
          <button
            key={category}
            type="button"
            className={activeCategory === category ? "active" : ""}
            aria-pressed={activeCategory === category}
            onClick={() => setActiveCategory(category)}
          >
            {t(category === "classic" ? "werewolf.classicRoles" : "werewolf.specialRoles")}
          </button>
        ))}
      </div>

      <div className="role-count-list">
        {roleGroups.map((group) => {
          const roles = selectableRoleOrder.filter(
            (roleId) => roleDefinitions[roleId].category === activeCategory && roleDefinitions[roleId].group === group,
          );
          if (roles.length === 0) return null;

          return (
            <section className="role-group" key={group}>
              <h4>{t(groupLabelKey(group))}</h4>
              {roles.map((roleId) => {
                const role = roleDefinitions[roleId];
                const count = sanitizeRoleCount(displayCounts, roleId);
                const max = role.unique ? 1 : playerCount;
                const canIncrease = count < max && freeSlots > 0;

                return (
                  <div className={`role-count-row role-tone-${group}`} key={roleId}>
                    <span className="role-count-main">
                      <RoleIconChip roleId={roleId} />
                      <span>
                        <strong>{t(role.nameKey)}</strong>
                        <small>
                          {t(role.unique ? "werewolf.uniqueRole" : "werewolf.multipleRole")}
                        </small>
                      </span>
                    </span>
                    <button
                      className="role-info-button"
                      type="button"
                      title={t(role.descriptionKey)}
                      aria-label={t("werewolf.roleInfo", { role: t(role.nameKey) })}
                      onClick={() => setSelectedRoleId(roleId)}
                    >
                      <Info />
                    </button>
                    <div className="stepper">
                      <button
                        type="button"
                        onClick={() => setCount(roleId, count - 1)}
                        disabled={count <= 0}
                        aria-label={t("werewolf.decreaseRole", { role: t(role.nameKey) })}
                      >
                        <Minus />
                      </button>
                      <strong>{count}</strong>
                      <button
                        type="button"
                        onClick={() => setCount(roleId, count + 1)}
                        disabled={!canIncrease}
                        aria-label={t("werewolf.increaseRole", { role: t(role.nameKey) })}
                      >
                        <Plus />
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {selectedRoleId && <RoleInfoModal role={roleDefinitions[selectedRoleId]} onClose={() => setSelectedRoleId(null)} />}
    </section>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string | number; tone: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className={`summary-stat summary-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RulesPanel({
  options,
  hideRoleReveal,
  onWinMode,
  onRevealMode,
  onRoleReveal,
}: {
  options: WerewolfOptions;
  hideRoleReveal: boolean;
  onWinMode: (mode: WinMode) => void;
  onRevealMode: (mode: RevealMode) => void;
  onRoleReveal: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="rules-panel">
      <button type="button" className="rules-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>{t("werewolf.gameRules")}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="rules-body">
          <OptionGroup
            label={t("werewolf.winMode")}
            options={[
              { value: "standard", label: t("werewolf.winStandard"), description: t("werewolf.winStandardHint"), icon: Shield },
              { value: "extended", label: t("werewolf.winExtended"), description: t("werewolf.winExtendedHint"), icon: Sparkles },
            ]}
            value={options.winMode}
            onChange={(value) => onWinMode(value as WinMode)}
          />
          <OptionGroup
            label={t("werewolf.revealMode")}
            options={[
              { value: "hidden", label: t("werewolf.revealHidden"), description: t("werewolf.revealHiddenHint"), icon: EyeOff },
              { value: "team", label: t("werewolf.revealTeam"), description: t("werewolf.revealTeamHint"), icon: Users },
              { value: "role", label: t("werewolf.revealRole"), description: t("werewolf.revealRoleHint"), icon: BadgeHelp },
            ]}
            value={options.revealMode}
            onChange={(value) => onRevealMode(value as RevealMode)}
          />
          {!hideRoleReveal && (
            <label className="toggle-row">
              <span>
                <strong>{t("werewolf.roleRevealSetting")}</strong>
                <small>{t("werewolf.roleRevealSettingHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={options.roleReveal}
                onChange={(event) => onRoleReveal(event.target.checked)}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; description: string; icon?: LucideIcon }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="option-group">
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
              aria-pressed={active}
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

function groupLabelKey(group: RoleGroup) {
  if (group === "wolf") return "werewolf.roleGroupWolf";
  if (group === "specialGoal") return "werewolf.roleGroupSpecialGoal";
  return "werewolf.roleGroupVillage";
}
