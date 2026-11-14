import { useSyncExternalStore } from "react";

import { MODEL_GENERATIONS, type ModelGeneration } from "./studio";

// App-wide choice between the current and previous GPT Image models,
// remembered in this browser.
const STORAGE_KEY = "model-generation";
const DEFAULT: ModelGeneration = MODEL_GENERATIONS[0];
const listeners = new Set<() => void>();
let memoryValue: ModelGeneration = DEFAULT;

function isGeneration(value: unknown): value is ModelGeneration {
  return MODEL_GENERATIONS.some((generation) => generation === value);
}

function read(): ModelGeneration {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isGeneration(stored) ? stored : DEFAULT;
  } catch {
    return memoryValue;
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

export function saveModelGeneration(generation: ModelGeneration) {
  memoryValue = generation;
  try {
    window.localStorage.setItem(STORAGE_KEY, generation);
  } catch {
    // Keep the in-memory choice for this page session.
  }
  listeners.forEach((listener) => listener());
}

export function useModelGeneration(): ModelGeneration {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
