"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type SyntheticEvent,
} from "react";

import { drawStroke, type MarkupStroke } from "../markup";

type Size = { width: number; height: number };

// Shows an image fitted to the stage with a drawing layer on top. Strokes are
// recorded in the image's own pixels, whatever size it is displayed at.
export function MarkupCanvas({
  src,
  alt,
  strokes,
  color,
  strokeWidth,
  onStrokesChange,
  onImageLoad,
}: {
  src: string;
  alt: string;
  strokes: MarkupStroke[];
  color: string;
  strokeWidth: (natural: Size) => number;
  onStrokesChange: (strokes: MarkupStroke[]) => void;
  onImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<MarkupStroke | null>(null);
  const [container, setContainer] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainer({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Redraw committed strokes whenever they change (undo, clear, new stroke).
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((stroke) => drawStroke(ctx, stroke));
  }, [strokes, natural]);

  const frame =
    container && natural
      ? (() => {
          const scale = Math.min(
            container.width / natural.width,
            container.height / natural.height,
          );
          const width = natural.width * scale;
          const height = natural.height * scale;
          return {
            width,
            height,
            left: (container.width - width) / 2,
            top: (container.height - height) / 2,
          };
        })()
      : null;

  const toImagePoint = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * event.currentTarget.width;
    const y = ((event.clientY - rect.top) / rect.height) * event.currentTarget.height;
    return [Math.round(x), Math.round(y)];
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!natural || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: MarkupStroke = {
      color,
      width: strokeWidth(natural),
      points: [toImagePoint(event)],
    };
    activeStrokeRef.current = stroke;
    const ctx = event.currentTarget.getContext("2d");
    if (ctx) {
      drawStroke(ctx, stroke);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) {
      return;
    }

    const previous = stroke.points[stroke.points.length - 1];
    const point = toImagePoint(event);
    stroke.points.push(point);

    // Draw just the new segment; the full redraw happens when the stroke ends.
    const ctx = event.currentTarget.getContext("2d");
    if (ctx) {
      drawStroke(ctx, { ...stroke, points: [previous, point] });
    }
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (stroke) {
      onStrokesChange([...strokes, stroke]);
    }
  };

  return (
    <div ref={containerRef} className="markup-viewer">
      <div
        className="markup-frame"
        style={
          frame
            ? {
                width: frame.width,
                height: frame.height,
                left: frame.left,
                top: frame.top,
              }
            : { inset: 0, visibility: "hidden" }
        }
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 900px) 100vw, 1100px"
          unoptimized
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
            setNatural({ width, height });
            onImageLoad(event);
          }}
        />
        {natural ? (
          <canvas
            ref={canvasRef}
            className="markup-canvas"
            width={natural.width}
            height={natural.height}
            aria-label="Markup drawing area"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
        ) : null}
      </div>
    </div>
  );
}
