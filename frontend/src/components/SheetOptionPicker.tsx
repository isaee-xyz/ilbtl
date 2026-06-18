import { useEffect, useId, useState } from "react";
import { NavIcon } from "./NavIcon";

export type PickerIcon = "check" | "close" | "chart" | "dash";

export interface SheetPickerOption<T extends string = string> {
  value: T;
  label: string;
  icon: PickerIcon;
}

interface SheetOptionPickerProps<T extends string> {
  open: boolean;
  title: string;
  options: SheetPickerOption<T>[];
  value: T;
  onClose: () => void;
  onChange: (value: T) => void;
}

function PickerIconSvg({ name, className }: { name: PickerIcon; className?: string }) {
  const props = {
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.75,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "check":
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "close":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 17V11M12 17V7M16 17v-4" />
        </svg>
      );
    case "dash":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M8 12h8" />
        </svg>
      );
    default:
      return null;
  }
}

export function SheetOptionPicker<T extends string>({
  open,
  title,
  options,
  value,
  onClose,
  onChange,
}: SheetOptionPickerProps<T>) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="il-mobile-menu-backdrop absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="il-mobile-menu-sheet absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div className="w-full max-h-[70vh] overflow-y-auto rounded-t-[28px] bg-[#B8B8B8] pb-4">
          <p className="px-6 pb-2 pt-5 text-center text-sm font-semibold text-il-neutral-20">
            {title}
          </p>

          <nav>
            {options.map((option, index) => {
              const active = option.value === value;
              return (
                <div key={option.value || `option-${index}`}>
                  {index > 0 && <hr className="mx-6 border-0 border-t border-white/40" />}
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-4 px-6 py-4 text-left text-base font-medium transition ${
                      active ? "text-il-blue-30" : "text-il-neutral-20"
                    }`}
                  >
                    <PickerIconSvg
                      name={option.icon}
                      className={`h-6 w-6 shrink-0 ${
                        active ? "text-il-blue-30" : "text-il-neutral-30"
                      }`}
                    />
                    {option.label}
                  </button>
                </div>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="-mt-5 mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
          aria-label="Close"
        >
          <NavIcon name="close" className="h-6 w-6 text-il-neutral-20" />
        </button>
      </div>
    </div>
  );
}

interface OptionPickerFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  placeholder: string;
  displayValue: string;
  options: SheetPickerOption<T>[];
  onChange: (value: T) => void;
  required?: boolean;
  hint?: string;
}

export function OptionPickerField<T extends string>({
  id,
  label,
  value,
  placeholder,
  displayValue,
  options,
  onChange,
  required,
  hint,
}: OptionPickerFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const hasValue = value !== "";

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <div>
        <span id={titleId} className="mb-1.5 block text-sm font-medium">
          {label}
        </span>
        <button
          id={id}
          type="button"
          aria-labelledby={titleId}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={`flex w-full items-center justify-between rounded-xl border border-il-neutral-90 bg-il-bg-grey-tint px-4 py-3.5 text-left outline-none transition focus:border-il-blue-30 focus:ring-2 focus:ring-il-blue-90 ${
            hasValue ? "text-il-neutral-10" : "text-il-neutral-50"
          }`}
        >
          <span>{hasValue ? displayValue : placeholder}</span>
          <svg
            className="h-5 w-5 shrink-0 text-il-neutral-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {required && (
          <input
            tabIndex={-1}
            className="sr-only"
            value={value}
            required
            onChange={() => {}}
            aria-hidden
          />
        )}
        {hint && <p className="mt-1.5 text-xs text-il-neutral-50">{hint}</p>}
      </div>

      <SheetOptionPicker
        open={open}
        title={label}
        options={options}
        value={value}
        onClose={() => setOpen(false)}
        onChange={onChange}
      />
    </>
  );
}
