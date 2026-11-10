import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LOGIN_PATH } from "./routes";
import { useSession } from "./sessionContext";

/** Shows its child routes only when someone is logged in; otherwise the login page. */
export function RequireSession() {
  const { user } = useSession();
  const location = useLocation();
  if (user === null) {
    const state = { from: location.pathname };
    return <Navigate to={LOGIN_PATH} replace state={state} />;
  }
  return <Outlet />;
}
