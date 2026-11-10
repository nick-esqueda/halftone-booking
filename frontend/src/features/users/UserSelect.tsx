import { TEXT_INPUT_CLASS_NAME } from "../../components/ui/styles";
import { useUsers } from "./useUsers";

const NO_CHOICE_LABEL = "Choose a person";

interface UserSelectProps {
  label: string;
  value: string;
  onChange: (username: string) => void;
  className?: string;
}

/** Picks one of the studio's users. Bookings can only be for users. */
export function UserSelect({
  label,
  value,
  onChange,
  className = "",
}: UserSelectProps) {
  const { data: users = [] } = useUsers();
  const usernames = users.map((user) => user.username);
  // Keep the current name selectable while the list loads.
  const isValueListed = usernames.includes(value) || value === "";
  const options = isValueListed ? usernames : [value, ...usernames];
  const hasNoChoice = value === "";

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${TEXT_INPUT_CLASS_NAME} ${className}`}
    >
      {hasNoChoice && (
        <option value="" disabled>
          {NO_CHOICE_LABEL}
        </option>
      )}
      {options.map((username) => (
        <option key={username} value={username}>
          {username}
        </option>
      ))}
    </select>
  );
}
