import type { ReactNode } from "react";

const ICON_PATHS = {
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  restore: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  swap: "M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  single: "M4 4h16v16H4z",
  compare: "M4 4h16v16H4zM12 4v16",
  pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  reset: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01",
  arrow: "M5 12h14M13 6l6 6-6 6",
  key: "M11 12l9-9M16 7l3 3M18 5l2 2M12 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  detail?: ReactNode;
  disabled?: boolean;
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className = "",
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={`segmented segmented-${size} ${className}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "is-active" : undefined}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          <span className="segmented-label">{option.label}</span>
          {option.detail ? (
            <span className="segmented-detail">{option.detail}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  action,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  action?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-header">
        {htmlFor ? (
          <label className="field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        )}
        {action}
      </div>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
