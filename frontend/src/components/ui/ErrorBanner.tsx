import type { ReactNode } from "react";

interface ErrorBannerProps {
  title: string;
  children?: ReactNode;
}

export function ErrorBanner({ title, children }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/50 bg-danger-soft px-4 py-3 text-sm"
    >
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
