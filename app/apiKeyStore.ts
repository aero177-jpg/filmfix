import { useSyncExternalStore } from "react";

const STORAGE_KEY = "openai-api-key";
const listeners = new Set<() => void>();
// Used when localStorage is unavailable (private mode, blocked storage).
let memoryKey = "";

function read(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return memoryKey;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function saveApiKey(apiKey: string) {
  memoryKey = apiKey;
  try {
    if (apiKey) {
      window.localStorage.setItem(STORAGE_KEY, apiKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Fall back to the in-memory key for this page session.
  }
  listeners.forEach((listener) => listener());
}

export function useApiKey(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}
