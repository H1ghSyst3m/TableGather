import type { ReactNode } from "react";

const werewolfPreparationSteps = [1, 2, 3, 4] as const;
const werewolfPreparationStepTotal = werewolfPreparationSteps.length;

export type WerewolfPreparationStepNumber = (typeof werewolfPreparationSteps)[number];

export function WerewolfPreparationShell({
  step,
  children,
}: {
  step: WerewolfPreparationStepNumber;
  children: ReactNode;
}) {
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
      <div className="setup-shell-content">{children}</div>
    </section>
  );
}
