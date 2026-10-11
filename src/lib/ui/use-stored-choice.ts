"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGE_EVENT = "sptt:stored-choice";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * A small view preference kept in this browser (for example row density).
 * It reads the same value on the server and during hydration, then switches to
 * the saved choice, so there is no hydration mismatch. A stored value outside
 * `allowed` is ignored.
 */
export function useStoredChoice<T extends string>(
  key: string,
  allowed: ReadonlyArray<T>,
  fallback: T,
): [T, (next: T) => void] {
  const value = useSyncExternalStore<T>(
    subscribe,
    () => {
      try {
        const saved = window.localStorage.getItem(key);
        return allowed.includes(saved as T) ? (saved as T) : fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Private mode or a full quota: the choice then lasts until reload only.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [value, set];
}
