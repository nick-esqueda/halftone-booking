import { useId, useState } from "react";

import { TEXT_INPUT_CLASS_NAME } from "../../components/ui/styles";
import { findCloseName } from "./closeNames";
import { useBookerNames } from "./useBookerNames";

type HintPlacement = "inline" | "overlay";

// "overlay" floats the hint over what's below, for tight spots like the header.
const HINT_PLACEMENT_CLASS_NAMES: Record<HintPlacement, string> = {
  inline: "mt-1",
  overlay:
    "absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 shadow-sm",
};

interface NameInputProps {
  value: string;
  onChange: (name: string) => void;
  label: string;
  className?: string;
  hintPlacement?: HintPlacement;
}

/**
 * A text field that suggests names already used on bookings. Once the person
 * leaves the field, it asks "Did you mean …?" if the name looks like a typo
 * of one of them, so bookings don't end up split across two spellings.
 */
export function NameInput({
  value,
  onChange,
  label,
  className = "",
  hintPlacement = "inline",
}: NameInputProps) {
  const listId = useId();
  const { data: knownNames = [] } = useBookerNames();
  const [isEditing, setIsEditing] = useState(false);
  const closeName = isEditing ? null : findCloseName(value, knownNames);

  return (
    <div className="relative">
      <input
        aria-label={label}
        list={listId}
        value={value}
        placeholder="Your name"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        className={`${TEXT_INPUT_CLASS_NAME} ${className}`}
      />
      <datalist id={listId}>
        {knownNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {closeName && (
        <CloseNameHint
          name={closeName}
          placement={hintPlacement}
          onPick={() => onChange(closeName)}
        />
      )}
    </div>
  );
}

interface CloseNameHintProps {
  name: string;
  placement: HintPlacement;
  onPick: () => void;
}

function CloseNameHint({ name, placement, onPick }: CloseNameHintProps) {
  return (
    <p
      role="status"
      className={`${HINT_PLACEMENT_CLASS_NAMES[placement]} text-xs text-ink-muted`}
    >
      Did you mean{" "}
      <button
        type="button"
        onClick={onPick}
        className="font-medium text-accent hover:underline"
      >
        {name}
      </button>
      ?
    </p>
  );
}
