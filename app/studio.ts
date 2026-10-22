import {
  BLACK_AND_WHITE_COLORIZE_PROMPT,
  BWGRAIN_PROMPT,
  DEFAULT_PROMPT,
  RESTORE_PRESERVE_GRAIN_PROMPT,
} from "./prompts";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_REFERENCE_IMAGES = 4;
export const MAX_PROMPT_LENGTH = 4_000;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

export type Mode = "restore" | "generate";
export type Target = "new" | "refine";
export type PromptPreset = "restore" | "colorize";
export type ComparisonSide = "left" | "right";
export type Dimensions = { width: number; height: number };

export function promptForPreset(
  preset: PromptPreset,
  removeArtifacts: boolean,
): string {
  if (preset === "colorize") {
    return removeArtifacts ? BLACK_AND_WHITE_COLORIZE_PROMPT : BWGRAIN_PROMPT;
  }

  return removeArtifacts ? DEFAULT_PROMPT : RESTORE_PRESERVE_GRAIN_PROMPT;
}

export const MODEL_OPTIONS = [
  {
    value: "gpt-image-2.5-sunburst",
    label: "Sunburst",
    detail: "Precise editing",
  },
  {
    value: "gpt-image-2.5-flare",
    label: "Flare",
    detail: "Faster edits",
  },
] as const;

export const QUALITY_OPTIONS = [
  ["auto", "Auto"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["xhigh", "Extra high"],
  ["max", "Maximum"],
] as const;

export const RESTORE_SIZE_OPTIONS = [
  ["auto", "Auto (model-selected)"],
  ["1mp", "Match original, ~1 MP"],
  ["4mp", "Match original, ~4 MP"],
  ["8mp", "Match original, up to 8 MP"],
] as const;

// Every explicit size satisfies the server allowlist: multiples of 16, at most
// 3840 per edge, 655,360-8,294,400 pixels, and a ratio no wider than 3:1.
export const GENERATE_SIZE_OPTIONS = [
  ["auto", "Auto (model-selected)"],
  ["1024x1024", "Square · 1024 × 1024"],
  ["2048x2048", "Square · 2048 × 2048"],
  ["1024x1536", "Portrait 2:3 · 1024 × 1536"],
  ["2160x3840", "Portrait 9:16 · 2160 × 3840"],
  ["1536x1024", "Landscape 3:2 · 1536 × 1024"],
  ["3840x2160", "Landscape 16:9 · 3840 × 2160"],
] as const;

export type RestoreSizePreset = (typeof RESTORE_SIZE_OPTIONS)[number][0];
export type GenerateSizePreset = (typeof GENERATE_SIZE_OPTIONS)[number][0];

export function isRestoreSizePreset(value: string): value is RestoreSizePreset {
  return RESTORE_SIZE_OPTIONS.some(([option]) => option === value);
}

export function isGenerateSizePreset(value: string): value is GenerateSizePreset {
  return GENERATE_SIZE_OPTIONS.some(([option]) => option === value);
}

const OUTPUT_PIXEL_TARGETS: Record<Exclude<RestoreSizePreset, "auto">, number> = {
  "1mp": 1_048_576,
  "4mp": 4_194_304,
  "8mp": 8_294_400,
};
const MAX_OUTPUT_EDGE = 3_840;

export function outputSizeForPreset(
  preset: RestoreSizePreset,
  dimensions: Dimensions,
): string {
  if (preset === "auto") {
    return "auto";
  }

  const aspectRatio = Math.min(
    3,
    Math.max(1 / 3, dimensions.width / dimensions.height),
  );
  const maxPixelsForEdge =
    (MAX_OUTPUT_EDGE * MAX_OUTPUT_EDGE) / Math.max(aspectRatio, 1 / aspectRatio);
  const targetPixels = Math.min(OUTPUT_PIXEL_TARGETS[preset], maxPixelsForEdge);
  let width = Math.floor(Math.sqrt(targetPixels * aspectRatio) / 16) * 16;
  let height = Math.floor(Math.sqrt(targetPixels / aspectRatio) / 16) * 16;

  if (width > height * 3) {
    width = height * 3;
  } else if (height > width * 3) {
    height = width * 3;
  }

  return `${width}x${height}`;
}

export async function readImageDimensions(file: File): Promise<Dimensions> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

export function validateImageFile(file: File, noun = "Images"): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${noun} must be JPEG, PNG, or WebP.`;
  }

  if (file.size <= 0) {
    return "That image is empty. Choose another file.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `${noun} must be 50 MiB or smaller.`;
  }

  return null;
}

export type Usage = {
  inputTextTokens?: number;
  inputImageTokens?: number;
  outputImageTokens?: number;
  totalTokens?: number;
};

export type Cost = {
  amountUsd: number;
  currency: string;
};

export type RestoreMetadata = {
  model: string;
  size: string;
  quality: string;
  outputFormat: string;
  durationMs?: number;
  usage?: Usage;
  cost?: Cost;
};

export type RestoreVersion = {
  id: string;
  label: string;
  mode: Mode;
  imageDataUrl: string;
  metadata: RestoreMetadata;
  prompt: string;
  responseId: string;
  parentVersionId: string | null;
  sourceName: string | null;
};

// Anything that can be shown on the stage or picked for either comparison side.
export type GalleryItem = {
  id: string;
  label: string;
  src: string;
  kind: "original" | "generated" | "imported";
  version?: RestoreVersion;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizeUsage(value: unknown): Usage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const usage: Usage = {
    inputTextTokens: optionalNumber(value.inputTextTokens),
    inputImageTokens: optionalNumber(value.inputImageTokens),
    outputImageTokens: optionalNumber(value.outputImageTokens),
    totalTokens: optionalNumber(value.totalTokens),
  };

  return Object.values(usage).some((tokenCount) => tokenCount !== undefined)
    ? usage
    : undefined;
}

export function normalizeMetadata(
  value: unknown,
  fallback: { model: string; size: string; quality: string },
): RestoreMetadata {
  const metadata = isRecord(value) ? value : {};
  const cost = isRecord(metadata.cost) ? metadata.cost : undefined;
  const amountUsd = optionalNumber(cost?.amountUsd);

  return {
    model: typeof metadata.model === "string" ? metadata.model : fallback.model,
    size: typeof metadata.size === "string" ? metadata.size : fallback.size,
    quality:
      typeof metadata.quality === "string" ? metadata.quality : fallback.quality,
    outputFormat:
      typeof metadata.outputFormat === "string" ? metadata.outputFormat : "png",
    durationMs: optionalNumber(metadata.durationMs),
    usage: normalizeUsage(metadata.usage),
    cost:
      amountUsd !== undefined
        ? {
            amountUsd,
            currency: typeof cost?.currency === "string" ? cost.currency : "USD",
          }
        : undefined,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDimensions(dimensions: Dimensions | undefined): string {
  return dimensions ? `${dimensions.width} × ${dimensions.height}` : "—";
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return "Unavailable";
  }

  if (durationMs < 1_000) {
    return "< 1 s";
  }

  return `${(durationMs / 1_000).toFixed(1)} s`;
}

export function formatCost(cost: Cost | undefined): string {
  if (!cost) {
    return "Unavailable";
  }

  if (cost.amountUsd > 0 && cost.amountUsd < 0.0001) {
    return `< $0.0001`;
  }

  return `$${cost.amountUsd.toFixed(4)}`;
}

export function formatTokenCount(tokenCount: number | undefined): string {
  return tokenCount === undefined ? "Unavailable" : tokenCount.toLocaleString();
}

export function modelLabel(model: string): string {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;
}

export function downloadName(version: RestoreVersion): string {
  if (version.mode === "generate" || !version.sourceName) {
    return `generated-${version.label}.png`;
  }

  const extensionIndex = version.sourceName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0
      ? version.sourceName.slice(0, extensionIndex)
      : version.sourceName;
  return `${baseName || "photo"}-restored-${version.label}.png`;
}
