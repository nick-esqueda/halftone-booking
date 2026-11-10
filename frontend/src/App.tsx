import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import { Button } from "./components/ui/Button";
import { RequireSession } from "./features/session/RequireSession";
import { HOME_PATH, LOGIN_PATH } from "./features/session/routes";
import { useCurrentUser, useSession } from "./features/session/sessionContext";
import { ThemeToggle } from "./features/theme/ThemeToggle";
import { LoginPage } from "./pages/LoginPage";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { SchedulePage } from "./pages/SchedulePage";

const NAV_LINKS = [
  { to: HOME_PATH, label: "Schedule" },
  { to: "/my-bookings", label: "My bookings" },
];

export function App() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<SignedInLayout />}>
          <Route path={HOME_PATH} element={<SchedulePage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
    </Routes>
  );
}

function SignedInLayout() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function TopBar() {
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
          <SignedInAs />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function SignedInAs() {
  const { username } = useCurrentUser();
  const { logOut } = useSession();
  const navigate = useNavigate();

  const handleLogOut = () => {
    logOut();
    // Replace, so Back from the login page doesn't return to the schedule.
    navigate(LOGIN_PATH, { replace: true });
  };

  return (
    <>
      <span className="text-ink-muted">Signed in as</span>
      <span className="font-semibold">{username}</span>
      <Button onClick={handleLogOut} className="ml-2">
        Log out
      </Button>
    </>
  );
}
