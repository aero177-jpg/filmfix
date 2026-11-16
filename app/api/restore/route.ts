import { NextResponse } from "next/server";

import {
  MalformedImageResponseError,
  SAFETY_BLOCK_MESSAGE,
  cancelRestoreJob,
  editImage,
  getRestoreJob,
  isSafetyCode,
  startRestoreJob,
  validateEditInput,
  validateRestoreInput,
} from "@/lib/restore";

export const runtime = "nodejs";

const outputFormat = "png";

// Netlify caps buffered function responses at 6 MB, and a large PNG as base64
// can exceed that. Streamed responses are allowed up to 20 MB.
function streamJson(body: unknown, status = 200): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const chunkSize = 256 * 1024;
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });

  return new Response(stream, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function getOpenAIErrorDetails(error: unknown): { code?: string; message?: string } {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const { code, error: body } = error as {
    code?: unknown;
    error?: { code?: unknown; message?: unknown } | null;
  };
  return {
    code:
      typeof code === "string"
        ? code
        : typeof body?.code === "string"
          ? body.code
          : undefined,
    message: typeof body?.message === "string" ? body.message : undefined,
  };
}

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

function openAIErrorResponse(error: unknown): { status: number; message: string; code?: string } {
  const status = getErrorStatus(error);
  const { code, message } = getOpenAIErrorDetails(error);

  if (isSafetyCode(code)) {
    return { status: 400, message: SAFETY_BLOCK_MESSAGE, code };
  }

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
    // OpenAI's own wording for 400s ("Invalid size", "image too large", ...)
    // is more useful than a generic line.
    return {
      status: 400,
      message: message
        ? `OpenAI rejected the request: ${message}`
        : "OpenAI rejected the image, prompt, or settings.",
      code,
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

function errorPayload(message: string, error?: unknown, code?: string) {
  const technicalDetail =
    process.env.NODE_ENV === "development" ? getErrorName(error) : undefined;

  return {
    error: message,
    ...(code && { code }),
    ...(technicalDetail && { detail: technicalDetail }),
  };
}

// Returns the key to use, or an error response to send back.
function resolveApiKey(request: Request): string | Response {
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

  return apiKey;
}

function readJobId(request: Request): string | undefined {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  return id && id.length <= 256 && /^[A-Za-z0-9_-]+$/.test(id) ? id : undefined;
}

function openAIErrorJson(error: unknown): Response {
  if (error instanceof MalformedImageResponseError) {
    return NextResponse.json(errorPayload(error.message, error), { status: 502 });
  }

  const mappedError = openAIErrorResponse(error);
  return NextResponse.json(errorPayload(mappedError.message, error, mappedError.code), {
    status: mappedError.status,
  });
}

// Polls a background job started by POST. Answers { status } while it runs,
// then the finished image.
export async function GET(request: Request) {
  const apiKey = resolveApiKey(request);
  if (typeof apiKey !== "string") {
    return apiKey;
  }

  const id = readJobId(request);
  if (!id) {
    return NextResponse.json(errorPayload("The image job id is missing or invalid."), {
      status: 400,
    });
  }

  try {
    const job = await getRestoreJob(apiKey, id);
    if (!job.done) {
      return NextResponse.json({ status: job.status });
    }

    return streamJson({
      status: "completed",
      imageDataUrl: job.result.dataUrl,
      responseId: job.result.responseId,
      usage: job.result.usage,
      cost: job.result.cost,
    });
  } catch (error) {
    return openAIErrorJson(error);
  }
}

// Cancels a background job the browser has given up on, so it stops costing money.
export async function DELETE(request: Request) {
  const apiKey = resolveApiKey(request);
  if (typeof apiKey !== "string") {
    return apiKey;
  }

  const id = readJobId(request);
  if (!id) {
    return NextResponse.json(errorPayload("The image job id is missing or invalid."), {
      status: 400,
    });
  }

  try {
    await cancelRestoreJob(apiKey, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return openAIErrorJson(error);
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  const apiKey = resolveApiKey(request);
  if (typeof apiKey !== "string") {
    return apiKey;
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
  const complexity = formData.get("complexity") ?? "auto";
  const editImageFile = formData.get("editImage");
  const markup = formData.get("markup");
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
    typeof complexity !== "string" ||
    (editImageFile !== null && !(editImageFile instanceof File)) ||
    (markup !== null && !(markup instanceof File)) ||
    (previousResponseId !== null && typeof previousResponseId !== "string") ||
    referenceImages.some((referenceImage) => !(referenceImage instanceof File))
  ) {
    return NextResponse.json(errorPayload("The request settings are incomplete."), {
      status: 400,
    });
  }

  const readFile = async (file: File) => Buffer.from(await file.arrayBuffer());
  const referenceFiles = referenceImages as File[];
  const referenceMeta = referenceFiles.map((file) => ({
    imageType: file.type,
    imageSize: file.size,
  }));

  try {
    if (editImageFile) {
      // A direct Image API edit, optionally guided by a drawn markup layer.
      const validation = validateEditInput({
        image: { imageType: editImageFile.type, imageSize: editImageFile.size },
        markup: markup ? { imageType: markup.type, imageSize: markup.size } : undefined,
        referenceImages: referenceMeta,
        prompt,
        model,
        size,
        quality,
        complexity,
      });

      if (!validation.ok) {
        return NextResponse.json(errorPayload(validation.message), {
          status: validation.status,
        });
      }

      // The Image API has no background mode, so edits still have to finish
      // within the host's 60 second function limit.
      const settings = validation.value;
      const result = await editImage({
        apiKey,
        image: {
          bytes: await readFile(editImageFile),
          name: editImageFile.name || "image",
          type: editImageFile.type,
        },
        markup: markup ? { bytes: await readFile(markup) } : undefined,
        referenceImages: await Promise.all(
          referenceFiles.map(async (file) => ({
            bytes: await readFile(file),
            type: file.type,
          })),
        ),
        ...validation.value,
      });

      return streamJson({
        imageDataUrl: result.dataUrl,
        metadata: {
          mode: mode === "generate" ? "generate" : "restore",
          model: settings.model,
          size: settings.size,
          quality: settings.quality,
          complexity: settings.complexity,
          markup: Boolean(markup),
          outputFormat,
          durationMs: Date.now() - startedAt,
          usage: result.usage,
          cost: result.cost,
        },
      });
    } else {
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
        complexity,
        previousResponseId: previousResponseId ?? undefined,
        referenceImages: referenceMeta,
      });

      if (!validation.ok) {
        return NextResponse.json(errorPayload(validation.message), {
          status: validation.status,
        });
      }

      const settings = validation.value;
      const jobId = await startRestoreJob({
        apiKey,
        image: sourceImage
          ? {
              bytes: await readFile(sourceImage),
              name: sourceImage.name || "photo",
              type: sourceImage.type,
            }
          : undefined,
        referenceImages: await Promise.all(
          referenceFiles.map(async (file) => ({
            bytes: await readFile(file),
            type: file.type,
          })),
        ),
        ...validation.value,
      });

      // The browser polls GET ?id=jobId for the image. Usage, cost and duration
      // are filled in when it finishes.
      return NextResponse.json(
        {
          jobId,
          metadata: {
            mode: settings.mode,
            model: settings.model,
            size: settings.size,
            quality: settings.quality,
            complexity: settings.complexity,
            markup: false,
            outputFormat,
          },
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return openAIErrorJson(error);
  }
}