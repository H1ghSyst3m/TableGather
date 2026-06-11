import type { ReactNode } from "react";

export function GameFlowShell({
  header,
  status,
  children,
  className = "",
}: {
  header: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`app-frame game-flow-shell ${className}`.trim()}>
      <div className="game-flow-shell-top">
        {header}
        {status}
      </div>
      <div className="game-flow-shell-body">{children}</div>
    </main>
  );
}

export function GameFlowStatus({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <section className="game-flow-status">
      <div>
        <span>{title}</span>
        <strong>{detail}</strong>
      </div>
      {action && <div className="game-flow-status-action">{action}</div>}
    </section>
  );
}

export function GameFlowToolbar({ children }: { children: ReactNode }) {
  return <div className="game-flow-tool-row">{children}</div>;
}

export function GameFlowActionBar({ children }: { children: ReactNode }) {
  return <div className="game-flow-action-bar">{children}</div>;
}
