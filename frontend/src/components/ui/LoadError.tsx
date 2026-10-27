import { Button } from "./Button";
import { ErrorBanner } from "./ErrorBanner";

interface LoadErrorProps {
  /** What failed to load, e.g. "the schedule". */
  subject: string;
  error: Error;
  onRetry: () => void;
  isRetrying?: boolean;
}

/** Shown in place of data that couldn't be loaded, with a way to try again. */
export function LoadError({
  subject,
  error,
  onRetry,
  isRetrying = false,
}: LoadErrorProps) {
  return (
    <ErrorBanner title={`Couldn't load ${subject}.`}>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <p className="text-ink-muted">{error.message}</p>
        <Button onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Trying…" : "Try again"}
        </Button>
      </div>
    </ErrorBanner>
  );
}
