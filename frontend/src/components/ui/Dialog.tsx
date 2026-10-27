import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** A centered modal dialog. Radix handles focus trapping and Escape to close. */
export function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  const handleOpenChange = (isNowOpen: boolean) => {
    if (!isNowOpen) {
      onClose();
    }
  };

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 max-h-[90vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <RadixDialog.Title className="text-base font-semibold">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              aria-label="Close"
              className="rounded p-1 text-ink-muted hover:bg-muted"
            >
              ×
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
