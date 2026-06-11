import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function GameConfirmDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  danger = false,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialog = (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section
        className="settings-sheet game-confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h3 id={titleId}>{title}</h3>
        <p className="confirm-description" id={descriptionId}>
          {description}
        </p>
        {children}
        <div className="dialog-action-row">
          <button className="dialog-action secondary" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`dialog-action ${danger ? "danger" : "primary"}`} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
