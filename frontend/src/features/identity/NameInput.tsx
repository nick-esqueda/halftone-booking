import { useId } from "react";

import { TEXT_INPUT_CLASS_NAME } from "../../components/ui/styles";
import { useBookerNames } from "./useBookerNames";

interface NameInputProps {
  value: string;
  onChange: (name: string) => void;
  label: string;
  className?: string;
}

/** A text field that suggests names already used on bookings. */
export function NameInput({
  value,
  onChange,
  label,
  className = "",
}: NameInputProps) {
  const listId = useId();
  const { data: knownNames = [] } = useBookerNames();

  return (
    <>
      <input
        aria-label={label}
        list={listId}
        value={value}
        placeholder="Your name"
        onChange={(event) => onChange(event.target.value)}
        className={`${TEXT_INPUT_CLASS_NAME} ${className}`}
      />
      <datalist id={listId}>
        {knownNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
