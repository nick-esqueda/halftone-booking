import { describe, expect, it } from "vitest";

import {
  LEGACY_NAME_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from "../../config/constants";
import { LocalSessionStore } from "./sessionStore";

const SUSIE = { userId: 1, username: "Susie" };

/** A Storage whose every call throws, like a browser that blocks site data. */
const BLOCKED_STORAGE = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("LocalSessionStore", () => {
  it("reads back what it saved, and nothing after clear", () => {
    const store = new LocalSessionStore();

    store.save(SUSIE);
    expect(new LocalSessionStore().read()).toEqual(SUSIE);

    store.clear();
    expect(new LocalSessionStore().read()).toBeNull();
  });

  it("treats unreadable stored data as logged out", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    expect(new LocalSessionStore().read()).toBeNull();

    window.localStorage.setItem(SESSION_STORAGE_KEY, '{"username": 4}');
    expect(new LocalSessionStore().read()).toBeNull();
  });

  it("keeps the session in memory when storage is blocked", () => {
    const store = new LocalSessionStore(BLOCKED_STORAGE);

    store.save(SUSIE);
    expect(store.read()).toEqual(SUSIE);

    store.clear();
    expect(store.read()).toBeNull();
  });

  it("removes the old free-text name and doesn't log in with it", () => {
    window.localStorage.setItem(LEGACY_NAME_STORAGE_KEY, "Sam K");

    const store = new LocalSessionStore();

    expect(store.read()).toBeNull();
    expect(window.localStorage.getItem(LEGACY_NAME_STORAGE_KEY)).toBeNull();
  });
});
