import { COMPLEXITY_OPTIONS, MODEL_OPTIONS, QUALITY_OPTIONS } from "./studio";

export type Variation = {
  model: string;
  quality: string;
  complexity: string;
};

export const MAX_VARIATIONS = 6;

// A 2×2 grid that changes one setting at a time, so differences can be traced
// to either the model or the quality.
export const DEFAULT_PRESET: Variation[] = [
  { model: "gpt-image-2.6-flare", quality: "medium", complexity: "auto" },
  { model: "gpt-image-2.6-flare", quality: "high", complexity: "auto" },
  { model: "gpt-image-2.6-sunburst", quality: "medium", complexity: "auto" },
  { model: "gpt-image-2.6-sunburst", quality: "high", complexity: "auto" },
];

const STORAGE_KEY = "batch-preset";

function isVariation(value: unknown): value is Variation {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { model, quality, complexity } = value as Record<string, unknown>;
  return (
    MODEL_OPTIONS.some((option) => option.value === model) &&
    QUALITY_OPTIONS.some(([option]) => option === quality) &&
    COMPLEXITY_OPTIONS.some(([option]) => option === complexity)
  );
}

export function loadPreset(): Variation[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      Array.isArray(stored) &&
      stored.length > 0 &&
      stored.length <= MAX_VARIATIONS &&
      stored.every(isVariation)
    ) {
      return stored.map(({ model, quality, complexity }) => ({ model, quality, complexity }));
    }
  } catch {
    // Unreadable or blocked storage falls back to the default preset.
  }

  return DEFAULT_PRESET;
}

export function savePreset(rows: Variation[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}
