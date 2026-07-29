import {
  type KeyboardEvent,
  useId,
  useRef,
} from "react";

type Option<T extends string> = {
  controlsId?: string;
  id?: string;
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  kind?: "radio" | "tabs";
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  value: T;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  kind = "radio",
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  const generatedId = useId();
  const optionRefs = useRef(new Map<T, HTMLButtonElement>());
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + options.length) % options.length;
        break;
      case "End":
        nextIndex = options.length - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextOption = options[nextIndex];
    if (!nextOption) {
      return;
    }
    onChange(nextOption.value);
    optionRefs.current.get(nextOption.value)?.focus();
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className="segmented"
      role={kind === "tabs" ? "tablist" : "radiogroup"}
    >
      {options.map((option, index) => (
        <button
          aria-checked={
            kind === "radio" ? option.value === value : undefined
          }
          aria-controls={kind === "tabs" ? option.controlsId : undefined}
          aria-selected={
            kind === "tabs" ? option.value === value : undefined
          }
          className="segmented__button"
          id={option.id ?? `${generatedId}-${option.value}`}
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          ref={(node) => {
            if (node) {
              optionRefs.current.set(option.value, node);
            } else {
              optionRefs.current.delete(option.value);
            }
          }}
          role={kind === "tabs" ? "tab" : "radio"}
          tabIndex={index === selectedIndex ? 0 : -1}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
