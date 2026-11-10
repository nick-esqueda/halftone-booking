import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import {
  FIELD_LABEL_CLASS_NAME,
  TEXT_INPUT_CLASS_NAME,
} from "../components/ui/styles";
import { readReturnPath } from "../features/session/routes";
import { useSession } from "../features/session/sessionContext";
import { useLogIn } from "../features/session/useLogIn";
import {
  findUsernameProblem,
  normalizeUsername,
} from "../features/session/username";
import { ThemeToggle } from "../features/theme/ThemeToggle";

const USER_NOT_FOUND_CODE = "user_not_found";

/**
 * The only page people see while logged out: a username field and nothing
 * else. It makes no API request until Log in is pressed, so no booking data
 * reaches it.
 */
export function LoginPage() {
  const { user } = useSession();
  const location = useLocation();
  const returnPath = readReturnPath(location.state);
  if (user !== null) {
    return <Navigate to={returnPath} replace />;
  }
  return <LoginForm returnPath={returnPath} />;
}

function LoginForm({ returnPath }: { returnPath: string }) {
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const logIn = useLogIn();
  const navigate = useNavigate();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const foundProblem = findUsernameProblem(username);
    setProblem(foundProblem);
    if (foundProblem !== null) {
      return;
    }
    logIn.mutate(username, {
      onSuccess: () => navigate(returnPath, { replace: true }),
    });
  };

  const message = problem ?? describeLogInError(logIn.error, username);
  return (
    <div className="min-h-screen">
      <div className="flex justify-end px-4 py-3">
        <ThemeToggle />
      </div>
      <main className="mx-auto mt-16 w-full max-w-xs px-4">
        <h1 className="mb-8 text-center text-xl font-semibold">
          Halftone Booking
        </h1>
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <label htmlFor="login-username" className={FIELD_LABEL_CLASS_NAME}>
            Username
          </label>
          <input
            id="login-username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              logIn.reset();
            }}
            placeholder="Your name"
            autoComplete="off"
            autoFocus
            aria-invalid={message !== null}
            aria-describedby={message ? "login-problem" : undefined}
            className={`${TEXT_INPUT_CLASS_NAME} w-full`}
          />
          {message && (
            <p id="login-problem" role="alert" className="text-sm text-danger">
              {message}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={logIn.isPending}
            className="w-full"
          >
            {logIn.isPending ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </main>
    </div>
  );
}

function describeLogInError(
  error: Error | null,
  username: string,
): string | null {
  if (error === null) {
    return null;
  }
  const isUnknownUser =
    error instanceof ApiError && error.code === USER_NOT_FOUND_CODE;
  if (isUnknownUser) {
    return `No user named ${normalizeUsername(username)}. Check the spelling.`;
  }
  return error.message;
}
