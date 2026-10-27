import { Button } from "../../components/ui/Button";
import { useTheme } from "./useTheme";

const TOGGLE_LABELS = {
  dark: { icon: "☀", label: "Switch to light mode" },
  light: { icon: "☾", label: "Switch to dark mode" },
};

export function ThemeToggle() {
  const [theme, toggleTheme] = useTheme();
  const { icon, label } = TOGGLE_LABELS[theme];
  return (
    <Button
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      {icon}
    </Button>
  );
}
