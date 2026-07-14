import type { ReactNode } from "react";

export type WerewolfPreparationStepNumber = 1 | 2 | 3 | 4;

export function WerewolfPreparationShell({
  step,
  children,
}: {
  step: WerewolfPreparationStepNumber;
  children: ReactNode;
}) {
  return (
    <section className="setup-shell">
      <div className="setup-shell-progress">
        <span>{step} / 4</span>
      </div>
      <div className="setup-shell-content">{children}</div>
    </section>
  );
}
