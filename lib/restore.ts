import OpenAI, { toFile } from "openai";

import {
  calculateImageCost,
  normalizeUsage,
  type CostEstimate,
  type TokenUsageSummary,
} from "@/lib/pricing";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_REFERENCE_IMAGES = 4;

export const SUPPORTED_MODELS = [
  "gpt-image-2.6-sunburst",
  "gpt-image-2.6-flare",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
] as const;

export const SUPPORTED_MODES = ["restore", "generate"] as const;

export const SUPPORTED_QUALITIES = [
  "auto",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

// "auto" leaves the field out so the model uses its own default (high).
export const SUPPORTED_COMPLEXITIES = ["auto", "low", "medium", "high"] as const;

// The markup layer and the image it covers may each be at most 16,777,216 px.
export const MAX_MARKUP_PIXELS = 16_777_216;

export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type RestoreMode = (typeof SUPPORTED_MODES)[number];
export type RestoreModel = (typeof SUPPORTED_MODELS)[number];
export type RestoreSize = "auto" | `${number}x${number}`;
export type RestoreQuality = (typeof SUPPORTED_QUALITIES)[number];
export type RestoreComplexity = (typeof SUPPORTED_COMPLEXITIES)[number];

export interface RestoreInput {
  mode: string;
  image?: {
    imageType: string;
    imageSize: number;
  };
  prompt: string;
  model: string;
  size: string;
  quality: string;
  complexity: string;
  previousResponseId?: string;
  referenceImages?: Array<{
    imageType: string;
    imageSize: number;
  }>;
}

export interface ValidatedRestoreInput {
  mode: RestoreMode;
  model: RestoreModel;
  size: RestoreSize;
  quality: RestoreQuality;
  complexity: RestoreComplexity;
  prompt: string;
  previousResponseId?: string;
}

export type ValidationResult =
  | { ok: true; value: ValidatedRestoreInput }
  | { ok: false; message: string; status: 400 | 413 | 415 };

export class MalformedImageResponseError extends Error {
  constructor(message = "The image service returned no image data.") {
    super(message);
    this.name = "MalformedImageResponseError";
  }
}

function isSupportedValue<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

function isSupportedSize(value: string): value is RestoreSize {
  if (value === "auto") {
    return true;
  }

  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    return false;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixelCount = width * height;

  return (
    width <= 3_840 &&
    height <= 3_840 &&
    width % 16 === 0 &&
    height % 16 === 0 &&
    pixelCount >= 655_360 &&
    pixelCount <= 8_294_400 &&
    width <= height * 3 &&
    height <= width * 3
  );
}

function validateImage(imageType: string, imageSize: number): ValidationResult | undefined {
  if (!SUPPORTED_IMAGE_TYPES.includes(imageType as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
    return {
      ok: false,
      message: "Use a JPEG, PNG, or WebP image.",
      status: 415,
    };
  }

  if (!Number.isFinite(imageSize) || imageSize <= 0) {
    return {
      ok: false,
      message: "The selected image is empty.",
      status: 400,
    };
  }

  if (imageSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: "Images must be 50 MiB or smaller.",
      status: 413,
    };
  }
}

export function validateRestoreInput(input: RestoreInput): ValidationResult {
  if (!isSupportedValue(SUPPORTED_MODES, input.mode)) {
    return {
      ok: false,
      message: "Choose restore or generate mode.",
      status: 400,
    };
  }

  // Refinements continue from the previous response, so only a fresh
  // restoration needs the source photograph.
  if (
    input.mode === "restore" &&
    !input.image &&
    input.previousResponseId === undefined
  ) {
    return {
      ok: false,
      message: "Select an image to restore.",
      status: 400,
    };
  }

  if (input.image) {
    const imageError = validateImage(input.image.imageType, input.image.imageSize);
    if (imageError) {
      return imageError;
    }
  }

  const referenceImages = input.referenceImages ?? [];
  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    return {
      ok: false,
      message: `Choose no more than ${MAX_REFERENCE_IMAGES} reference images.`,
      status: 400,
    };
  }

  for (const referenceImage of referenceImages) {
    const referenceError = validateImage(
      referenceImage.imageType,
      referenceImage.imageSize,
    );
    if (referenceError) {
      return referenceError;
    }
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    return {
      ok: false,
      message: "Add a prompt before submitting.",
      status: 400,
    };
  }

  if (prompt.length > 4_000) {
    return {
      ok: false,
      message: "Keep the prompt under 4,000 characters.",
      status: 400,
    };
  }

  if (!isSupportedValue(SUPPORTED_MODELS, input.model)) {
    return {
      ok: false,
      message: "Choose a supported restoration model.",
      status: 400,
    };
  }

  if (!isSupportedSize(input.size)) {
    return {
      ok: false,
      message: "Choose a supported output size.",
      status: 400,
    };
  }

  if (!isSupportedValue(SUPPORTED_QUALITIES, input.quality)) {
    return {
      ok: false,
      message: "Choose a supported output quality.",
      status: 400,
    };
  }

  if (!isSupportedValue(SUPPORTED_COMPLEXITIES, input.complexity)) {
    return {
      ok: false,
      message: "Choose a supported complexity.",
      status: 400,
    };
  }

  const previousResponseId = input.previousResponseId?.trim();
  if (
    input.previousResponseId !== undefined &&
    (!previousResponseId ||
      previousResponseId.length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(previousResponseId))
  ) {
    return {
      ok: false,
      message: "The selected refinement session is invalid. Start a new restoration.",
      status: 400,
    };
  }

  return {
    ok: true,
    value: {
      mode: input.mode,
      model: input.model,
      size: input.size,
      quality: input.quality,
      complexity: input.complexity,
      prompt,
      previousResponseId,
    },
  };
}

export interface RestoreImageRequest {
  apiKey: string;
  mode: RestoreMode;
  image?: {
    bytes: Buffer;
    name: string;
    type: string;
  };
  prompt: string;
  model: RestoreModel;
  size: RestoreSize;
  quality: RestoreQuality;
  complexity: RestoreComplexity;
  previousResponseId?: string;
  referenceImages?: Array<{
    bytes: Buffer;
    type: string;
  }>;
}

export interface RestoreImageResult {
  dataUrl: string;
  // Only Responses API calls have an id that later refinements can continue from.
  responseId?: string;
  usage?: TokenUsageSummary;
  cost?: CostEstimate;
}

function imageDataUrl(image: { bytes: Buffer; type: string }): string {
  return `data:${image.type};base64,${image.bytes.toString("base64")}`;
}

export async function restoreImage(
  request: RestoreImageRequest,
): Promise<RestoreImageResult> {
  const openai = new OpenAI({
    apiKey: request.apiKey,
    maxRetries: 0,
  });
  const isGenerate = request.mode === "generate";
  const sourceImage =
    !isGenerate && !request.previousResponseId ? request.image : undefined;
  const inputImages = sourceImage
    ? [sourceImage, ...(request.referenceImages ?? [])]
    : request.referenceImages ?? [];
  const referenceStartIndex = sourceImage ? 1 : 0;
  const imageContent = inputImages.flatMap((image, index) => {
    const isSourcePhoto = sourceImage !== undefined && index === 0;
    const referenceNumber = index - referenceStartIndex + 1;

    return [
      {
        type: "input_text" as const,
        text: isSourcePhoto
          ? "SOURCE PHOTOGRAPH TO RESTORE: This is the only image to edit. Preserve its identity, composition, and scene."
          : isGenerate
            ? `REFERENCE IMAGE ${referenceNumber}: Visual guidance for the requested image. Use it only in the ways the user's instructions describe.`
            : `REFERENCE IMAGE ${referenceNumber}: This is context only. Do not restore, copy, replace, or merge it into the source photograph unless the user explicitly asks to use a specific visual detail as guidance.`,
      },
      {
        type: "input_image" as const,
        image_url: imageDataUrl(image),
        detail: "high" as const,
      },
    ];
  });
  const framing = request.previousResponseId
    ? isGenerate
      ? "REFINEMENT REQUEST: Revise the previously generated image according to the instructions below. Any new images below are reference-only context.\n\nUser instructions:\n"
      : "REFINEMENT REQUEST: The previous generated image is the photograph to edit. Any new images below are reference-only context.\n\nUser instructions:\n"
    : isGenerate
      ? "IMAGE GENERATION REQUEST: Create a new image from the instructions below. Any images below are reference-only context.\n\nUser instructions:\n"
      : "RESTORATION REQUEST: The labeled source photograph below is the photograph to restore. Any later images are reference-only context.\n\nUser instructions:\n";
  // A fresh text-only generation is a pure generate; anything with an image in
  // context (references or a previous response) lets the model decide.
  const action = !isGenerate
    ? "edit"
    : request.previousResponseId || inputImages.length > 0
      ? "auto"
      : "generate";
  const response = await openai.responses.create({
    model: "gpt-4.1",
    previous_response_id: request.previousResponseId,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: framing },
          { type: "input_text", text: request.prompt },
          ...imageContent,
        ],
      },
    ],
    tools: [
      {
        type: "image_generation",
        action,
        model: request.model,
        size: request.size,
        quality: request.quality,
        ...(request.complexity !== "auto" && { complexity: request.complexity }),
        output_format: "png",
      },
    ],
    tool_choice: "required",
  });
  const imageGeneration = response.output.find(
    (item) => item.type === "image_generation_call" && item.result,
  );
  const base64 =
    imageGeneration?.type === "image_generation_call"
      ? imageGeneration.result
      : undefined;

  if (!base64) {
    throw new MalformedImageResponseError(
      "The image service did not produce a usable image. Try refining again or use a different reference image.",
    );
  }

  const usage = normalizeUsage(response.usage);

  return {
    dataUrl: `data:image/png;base64,${base64}`,
    responseId: response.id,
    usage,
    cost: calculateImageCost(usage),
  };
}
// Edits through the Image API. This is the only path that accepts a markup
// layer, and the result has no response id to continue a conversation from.

const MARKUP_INSTRUCTIONS =
  "\n\nThe markup layer drawn over the first image shows where to apply the change. Do not reproduce the markup in the result: remove every markup stroke, and keep everything outside the marked areas unchanged.";

const EDIT_REFERENCE_INSTRUCTIONS =
  "\n\nEdit only the first image. Any additional images are reference-only context.";

export interface EditInput {
  image: { imageType: string; imageSize: number };
  markup?: { imageType: string; imageSize: number };
  referenceImages: Array<{ imageType: string; imageSize: number }>;
  prompt: string;
  model: string;
  size: string;
  quality: string;
  complexity: string;
}

export type ValidatedEditInput = Omit<
  ValidatedRestoreInput,
  "mode" | "previousResponseId"
>;

export type EditValidationResult =
  | { ok: true; value: ValidatedEditInput }
  | { ok: false; message: string; status: 400 | 413 | 415 };

export function validateEditInput(input: EditInput): EditValidationResult {
  const imageError = validateImage(input.image.imageType, input.image.imageSize);
  if (imageError && !imageError.ok) {
    return imageError;
  }

  if (input.markup) {
    if (input.markup.imageType !== "image/png") {
      return { ok: false, message: "The markup layer must be a PNG.", status: 415 };
    }

    const markupError = validateImage(input.markup.imageType, input.markup.imageSize);
    if (markupError && !markupError.ok) {
      return markupError;
    }
  }

  // Reuse the shared checks for references, prompt, and settings.
  const shared = validateRestoreInput({
    mode: "generate",
    prompt: input.prompt,
    model: input.model,
    size: input.size,
    quality: input.quality,
    complexity: input.complexity,
    referenceImages: input.referenceImages,
  });
  if (!shared.ok) {
    return shared;
  }

  const { model, size, quality, complexity, prompt } = shared.value;
  return { ok: true, value: { model, size, quality, complexity, prompt } };
}

export interface EditImageRequest extends ValidatedEditInput {
  apiKey: string;
  image: { bytes: Buffer; name: string; type: string };
  markup?: { bytes: Buffer };
  referenceImages: Array<{ bytes: Buffer; type: string }>;
}

export async function editImage(
  request: EditImageRequest,
): Promise<RestoreImageResult> {
  const openai = new OpenAI({
    apiKey: request.apiKey,
    maxRetries: 0,
  });
  const references = await Promise.all(
    request.referenceImages.map((reference, index) =>
      toFile(reference.bytes, `reference-${index + 1}`, { type: reference.type }),
    ),
  );
  const image = await toFile(request.image.bytes, request.image.name, {
    type: request.image.type,
  });
  const prompt =
    request.prompt +
    (request.markup ? MARKUP_INSTRUCTIONS : "") +
    (references.length > 0 ? EDIT_REFERENCE_INSTRUCTIONS : "");

  const result = await openai.images.edit({
    model: request.model,
    image: references.length > 0 ? [image, ...references] : image,
    markup: request.markup
      ? await toFile(request.markup.bytes, "markup.png", { type: "image/png" })
      : undefined,
    prompt,
    size: request.size,
    quality: request.quality,
    ...(request.complexity !== "auto" && { complexity: request.complexity }),
    output_format: "png",
  });
  const base64 = result.data?.[0]?.b64_json;

  if (!base64) {
    throw new MalformedImageResponseError(
      "The image service did not produce a usable image. Try a different prompt or markup.",
    );
  }

  const usage = normalizeUsage(result.usage);

  return {
    dataUrl: `data:image/png;base64,${base64}`,
    usage,
    cost: calculateImageCost(usage),
  };
}
