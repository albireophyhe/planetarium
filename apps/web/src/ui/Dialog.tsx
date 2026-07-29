import { type ReactNode, useEffect, useId, useRef } from "react";
import { XIcon } from "lucide-react";

type DialogProps = {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
  wide?: boolean;
};

export function Dialog({
  children,
  description,
  onClose,
  open,
  title,
  wide = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`dialog${wide ? " dialog--wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <header className="dialog__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? (
            <p className="dialog__description" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <button
          aria-label={`${title}を閉じる`}
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <XIcon aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </header>
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}
