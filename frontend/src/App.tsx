import { NavLink, Route, Routes } from "react-router-dom";

import { NameInput } from "./features/identity/NameInput";
import { useBookerNameContext } from "./features/identity/bookerNameStore";
import { ThemeToggle } from "./features/theme/ThemeToggle";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { SchedulePage } from "./pages/SchedulePage";

const NAV_LINKS = [
  { to: "/", label: "Schedule" },
  { to: "/my-bookings", label: "My bookings" },
];

export function App() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function TopBar() {
  const { bookerName, setBookerName } = useBookerNameContext();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
        <span className="font-semibold">Halftone Booking</span>
        <nav className="flex gap-6 text-sm">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className={({ isActive }) =>
                isActive
                  ? "font-semibold text-accent"
                  : "text-ink-muted hover:text-ink"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Booking as</span>
          <NameInput
            label="Your name"
            value={bookerName}
            onChange={setBookerName}
            className="w-40"
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
