import { NextResponse } from "next/server";

import {
  MalformedImageResponseError,
  restoreImage,
  validateRestoreInput,
} from "@/lib/restore";

export const runtime = "nodejs";

const outputFormat = "png";

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function getErrorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function openAIErrorResponse(error: unknown) {
  const status = getErrorStatus(error);

  if (status === 401 || status === 403) {
    return {
      status: 502,
      message: "The OpenAI API key was rejected. Check the key you entered or the server configuration.",
    };
  }

  if (status === 429) {
    return {
      status: 429,
      message: "OpenAI rate limits or spending limits prevented this request.",
    };
  }

  if (status === 400 || status === 422) {
    return {
      status: 400,
      message: "OpenAI rejected the image, prompt, or settings.",
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      status: 502,
      message: "OpenAI could not complete the request right now.",
    };
  }

  return {
    status: 502,
    message: "The image service could not be reached.",
  };
}

function errorPayload(message: string, error?: unknown) {
  const technicalDetail =
    process.env.NODE_ENV === "development" ? getErrorName(error) : undefined;

  return technicalDetail ? { error: message, detail: technicalDetail } : { error: message };
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  // A key entered in the browser takes precedence over the server's own key.
  const headerKey = request.headers.get("x-openai-api-key")?.trim();
  if (headerKey && !/^sk-[A-Za-z0-9_-]{16,400}$/.test(headerKey)) {
    return NextResponse.json(
      errorPayload("The API key entered in the app doesn't look like an OpenAI key."),
      { status: 400 },
    );
  }

  const apiKey = headerKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      errorPayload("No API key. Add one with the key icon, or set OPENAI_API_KEY on the server."),
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      errorPayload("The upload could not be read. Try selecting the image again."),
      { status: 400 },
    );
  }

  const mode = formData.get("mode") ?? "restore";
  const image = formData.get("image");
  const prompt = formData.get("prompt");
  const model = formData.get("model");
  const size = formData.get("size");
  const quality = formData.get("quality");
  const previousResponseId = formData.get("previousResponseId");
  const referenceImages = formData.getAll("referenceImage");

  if (image !== null && !(image instanceof File)) {
    return NextResponse.json(errorPayload("The uploaded image could not be read."), {
      status: 400,
    });
  }

  if (
    typeof mode !== "string" ||
    typeof prompt !== "string" ||
    typeof model !== "string" ||
    typeof size !== "string" ||
    typeof quality !== "string" ||
    (previousResponseId !== null && typeof previousResponseId !== "string") ||
    referenceImages.some((referenceImage) => !(referenceImage instanceof File))
  ) {
    return NextResponse.json(errorPayload("The request settings are incomplete."), {
      status: 400,
    });
  }

  // Generate mode never sends a source photograph, even if one was attached.
  const sourceImage = mode === "restore" ? image : null;
  const validation = validateRestoreInput({
    mode,
    image: sourceImage
      ? { imageType: sourceImage.type, imageSize: sourceImage.size }
      : undefined,
    prompt,
    model,
    size,
    quality,
    previousResponseId: previousResponseId ?? undefined,
    referenceImages: referenceImages.map((referenceImage) => {
      const file = referenceImage as File;
      return { imageType: file.type, imageSize: file.size };
    }),
  });

  if (!validation.ok) {
    return NextResponse.json(errorPayload(validation.message), {
      status: validation.status,
    });
  }

  try {
    const result = await restoreImage({
      apiKey,
      image: sourceImage
        ? {
            bytes: Buffer.from(await sourceImage.arrayBuffer()),
            name: sourceImage.name || "photo",
            type: sourceImage.type,
          }
        : undefined,
      referenceImages: await Promise.all(
        referenceImages.map(async (referenceImage) => {
          const file = referenceImage as File;
          return {
            bytes: Buffer.from(await file.arrayBuffer()),
            type: file.type,
          };
        }),
      ),
      ...validation.value,
    });

    return NextResponse.json({
      imageDataUrl: result.dataUrl,
      responseId: result.responseId,
      metadata: {
        mode: validation.value.mode,
        model: validation.value.model,
        size: validation.value.size,
        quality: validation.value.quality,
        outputFormat,
        durationMs: Date.now() - startedAt,
        usage: result.usage,
        cost: result.cost,
      },
    });
  } catch (error) {
    if (error instanceof MalformedImageResponseError) {
      return NextResponse.json(errorPayload(error.message, error), {
        status: 502,
      });
    }

    const mappedError = openAIErrorResponse(error);
    return NextResponse.json(errorPayload(mappedError.message, error), {
      status: mappedError.status,
    });
  }
}