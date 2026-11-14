// Freehand markup drawn over an image. Points are stored in the image's own
// pixel coordinates so the exported layer matches the image size exactly.

export type MarkupStroke = {
  color: string;
  width: number;
  points: Array<[number, number]>;
};

export const MARKUP_COLORS = [
  ["#ff2a2a", "Red"],
  ["#ffd500", "Yellow"],
  ["#00c8ff", "Cyan"],
  ["#ffffff", "White"],
] as const;

export const BRUSH_SIZES = [
  ["s", "S", 0.005],
  ["m", "M", 0.01],
  ["l", "L", 0.02],
] as const;

export type BrushSize = (typeof BRUSH_SIZES)[number][0];

export function brushWidth(size: BrushSize, width: number, height: number): number {
  const fraction = BRUSH_SIZES.find(([value]) => value === size)?.[2] ?? 0.01;
  return Math.max(2, Math.round(Math.max(width, height) * fraction));
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: MarkupStroke) {
  const [first, ...rest] = stroke.points;
  if (!first) {
    return;
  }

  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (rest.length === 0) {
    ctx.beginPath();
    ctx.arc(first[0], first[1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Renders the strokes onto a transparent PNG the same size as the image.
export function renderMarkupPng(
  strokes: MarkupStroke[],
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas is not available."));
  }

  strokes.forEach((stroke) => drawStroke(ctx, stroke));

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Markup export failed."))),
      "image/png",
    );
  });
}
