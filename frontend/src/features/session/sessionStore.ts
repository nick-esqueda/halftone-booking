import {
  LEGACY_NAME_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from "../../config/constants";

/** Who is logged in on this browser. */
export interface SessionUser {
  userId: number;
  username: string;
}

/**
 * Where the logged-in user is kept (strategy pattern).
 *
 * The app only talks to this interface, so the session's home can change
 * without touching the pages. Today it's `LocalSessionStore` (browser
 * storage). To move sessions to the server (Phase 3), add a class that
 * implements `SessionStore` using the API and pass it to `SessionProvider`.
 */
export interface SessionStore {
  read(): SessionUser | null;
  save(user: SessionUser): void;
  clear(): void;
  /** Calls `onChange` when another tab logs in or out; returns an unsubscribe. */
  subscribe(onChange: () => void): () => void;
}

function isSessionUser(value: unknown): value is SessionUser {
  const candidate = value as Partial<SessionUser> | null;
  return (
    typeof candidate?.userId === "number" &&
    typeof candidate.username === "string"
  );
}

function parseSessionUser(text: string | null): SessionUser | null {
  if (text === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isSessionUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the session in localStorage, so it survives reloads and restarts
 * until Log out. Storage can be unavailable (private windows, blocked site
 * data); then the session lives in memory for this tab only.
 */
export class LocalSessionStore implements SessionStore {
  private memoryUser: SessionUser | null = null;

  constructor(private readonly storage: Storage | null = getLocalStorage()) {
    this.removeLegacyName();
  }

  read(): SessionUser | null {
    try {
      const storedText = this.storage?.getItem(SESSION_STORAGE_KEY) ?? null;
      return parseSessionUser(storedText) ?? this.memoryUser;
    } catch {
      return this.memoryUser;
    }
  }

  save(user: SessionUser): void {
    this.memoryUser = user;
    try {
      this.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // The in-memory copy keeps this tab logged in.
    }
  }

  clear(): void {
    this.memoryUser = null;
    try {
      this.storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Nothing stored, so nothing to remove.
    }
  }

  subscribe(onChange: () => void): () => void {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SESSION_STORAGE_KEY || event.key === null) {
        onChange();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }

  /** The old free-text name isn't a login, so everyone logs in once. */
  private removeLegacyName(): void {
    try {
      this.storage?.removeItem(LEGACY_NAME_STORAGE_KEY);
    } catch {
      // Nothing to clean up.
    }
  }
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
