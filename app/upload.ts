// Netlify Functions cap request bodies at 6 MB after base64 encoding, about
// 4.5 MB of binary, and reject larger ones before the route runs. Images are
// shrunk in the browser to fit under this budget.
export const REQUEST_BYTE_BUDGET = 4_000_000;

// Room left for the prompt, settings and multipart framing.
const FORM_OVERHEAD_BYTES = 64 * 1024;

export type FittedImage = {
  file: File;
  // Output size divided by the original size; 1 when untouched.
  scale: number;
  // Set only when the image was resized.
  resized?: { width: number; height: number };
};

function encodeJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas is not available."));
  }

  // JPEG has no transparency; flatten onto white rather than black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image export failed."))),
      "image/jpeg",
      quality,
    );
  });
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.jpg`;
}

// Returns the file unchanged when it already fits. Otherwise it re-encodes as
// JPEG, first lowering quality at full resolution, then scaling down.
export async function fitImageToBytes(file: File, maxBytes: number): Promise<FittedImage> {
  if (file.size <= maxBytes) {
    return { file, scale: 1 };
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  try {
    let scale = 1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      let smallest: Blob | undefined;

      for (const quality of [0.92, 0.85]) {
        const blob = await encodeJpeg(bitmap, targetWidth, targetHeight, quality);
        if (blob.size <= maxBytes) {
          return {
            file: new File([blob], jpegName(file.name), { type: "image/jpeg" }),
            scale: targetWidth / width,
            resized:
              targetWidth === width && targetHeight === height
                ? undefined
                : { width: targetWidth, height: targetHeight },
          };
        }
        smallest = blob;
      }

      // File size tracks pixel count, so shrink each side by the square root.
      const ratio = Math.sqrt(maxBytes / (smallest?.size ?? maxBytes * 2)) * 0.95;
      scale *= Math.min(0.9, Math.max(0.5, ratio));
    }
  } finally {
    bitmap.close();
  }

  throw new Error("The image could not be made small enough to upload.");
}

// Splits the request budget between the main image and its references.
// References are capped at 40% of the budget combined, and the main image gets
// whatever is left.
export async function fitUploads(
  main: File | undefined,
  references: File[],
  reservedBytes = 0,
): Promise<{ main?: FittedImage; references: File[] }> {
  const available = REQUEST_BYTE_BUDGET - FORM_OVERHEAD_BYTES - reservedBytes;
  const total = (main?.size ?? 0) + references.reduce((sum, file) => sum + file.size, 0);

  if (total <= available) {
    return { main: main && { file: main, scale: 1 }, references };
  }

  const referenceCap = main
    ? (available * 0.4) / Math.max(1, references.length)
    : available / Math.max(1, references.length);
  const fittedReferences = await Promise.all(
    references.map(async (file) => (await fitImageToBytes(file, referenceCap)).file),
  );
  const referenceBytes = fittedReferences.reduce((sum, file) => sum + file.size, 0);

  return {
    main: main ? await fitImageToBytes(main, available - referenceBytes) : undefined,
    references: fittedReferences,
  };
}
