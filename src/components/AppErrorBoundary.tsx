import { Component, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";

interface BoundaryProps {
  children: ReactNode;
  resetKey: string;
  fallback: (reset: () => void) => ReactNode;
}

interface BoundaryState {
  crashed: boolean;
}

class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidUpdate(previousProps: BoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.crashed) {
      this.setState({ crashed: false });
    }
  }

  render() {
    if (this.state.crashed) {
      return this.props.fallback(() => this.setState({ crashed: false }));
    }

    return this.props.children;
  }
}

export function AppErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const { t } = useI18n();

  return (
    <RouteErrorBoundary
      resetKey={resetKey}
      fallback={(reset) => (
        <main className="app-frame flow-screen">
          <section className="panel app-error-panel">
            <h2>{t("errors.screenCrashed")}</h2>
            <p>{t("errors.screenCrashedHint")}</p>
            <button className="secondary-button full" type="button" onClick={reset}>
              {t("common.reset")}
            </button>
          </section>
        </main>
      )}
    >
      {children}
    </RouteErrorBoundary>
  );
}
