import type { ReactNode } from "react";
import { useI18n } from "../../../i18n/useI18n";

const werewolfPreparationSteps = [1, 2, 3, 4] as const;
const werewolfPreparationStepTotal = werewolfPreparationSteps.length;

export type WerewolfPreparationStepNumber = (typeof werewolfPreparationSteps)[number];

export function WerewolfPreparationShell({
  step,
  description,
  children,
}: {
  step: WerewolfPreparationStepNumber;
  description: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <section className="setup-shell">
      <div
        className="setup-shell-progress"
        role="progressbar"
        aria-valuemin={werewolfPreparationSteps[0]}
        aria-valuemax={werewolfPreparationStepTotal}
        aria-valuenow={step}
      >
        <span>{step} / {werewolfPreparationStepTotal}</span>
      </div>
      <div className="setup-shell-content">
        <section className="setup-hero">
          <p className="section-label">{t("werewolf.setupTitle")}</p>
          <p>{description}</p>
        </section>
        {children}
      </div>
    </section>
  );
}
