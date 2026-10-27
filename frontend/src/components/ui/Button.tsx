import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BASE_CLASS_NAME =
  "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT_CLASS_NAMES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-surface hover:bg-accent-strong",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-muted",
  danger:
    "border border-danger/50 bg-danger-soft text-danger hover:bg-danger-soft/70",
  ghost: "text-ink-muted hover:bg-muted",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const variantClassName = VARIANT_CLASS_NAMES[variant];
  return (
    <button
      type={type}
      className={`${BASE_CLASS_NAME} ${variantClassName} ${className}`}
      {...props}
    />
  );
}
