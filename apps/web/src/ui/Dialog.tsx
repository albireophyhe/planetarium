import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { XIcon } from "lucide-react";

type DialogProps = {
  children: ReactNode;
  description?: string;
  focusContentOnOpen?: boolean;
  onClose: () => void;
  open: boolean;
  title: string;
  wide?: boolean;
};

export function Dialog({
  children,
  description,
  focusContentOnOpen = false,
  onClose,
  open,
  title,
  wide = false,
}: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();
  const titleId = useId();

  function handleContentKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    if (
      !focusContentOnOpen ||
      event.target !== event.currentTarget
    ) {
      return;
    }

    const pageDistance = Math.max(
      event.currentTarget.clientHeight * 0.8,
      44,
    );
    const scrollOptions: ScrollToOptions = {
      behavior: "auto",
      left: 0,
    };

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.currentTarget.scrollBy({
          ...scrollOptions,
          top: 44,
        });
        break;
      case "ArrowUp":
        event.preventDefault();
        event.currentTarget.scrollBy({
          ...scrollOptions,
          top: -44,
        });
        break;
      case "End":
        event.preventDefault();
        event.currentTarget.scrollTo({
          ...scrollOptions,
          top: event.currentTarget.scrollHeight,
        });
        break;
      case "Home":
        event.preventDefault();
        event.currentTarget.scrollTo({
          ...scrollOptions,
          top: 0,
        });
        break;
      case "PageDown":
        event.preventDefault();
        event.currentTarget.scrollBy({
          ...scrollOptions,
          top: pageDistance,
        });
        break;
      case "PageUp":
        event.preventDefault();
        event.currentTarget.scrollBy({
          ...scrollOptions,
          top: -pageDistance,
        });
        break;
      default:
        break;
    }
  }

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

    if (open && focusContentOnOpen) {
      contentRef.current?.focus({ preventScroll: true });
    }
  }, [focusContentOnOpen, open]);

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
      <div
        aria-label={
          focusContentOnOpen ? `${title}の内容` : undefined
        }
        className="dialog__body"
        onKeyDown={handleContentKeyDown}
        ref={contentRef}
        role={focusContentOnOpen ? "region" : undefined}
        tabIndex={focusContentOnOpen ? -1 : undefined}
      >
        {children}
      </div>
    </dialog>
  );
}
