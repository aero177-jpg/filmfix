"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent,
  type MouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";

// Zoom is a scale plus a pan offset in screen pixels from the container's
// center. Every image layer that shares one Zoom stays perfectly aligned.
export type Zoom = { scale: number; x: number; y: number };

export const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 8;
const DOUBLE_CLICK_ZOOM = 2.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Keeps the zoomed image covering the container (no panning past its edges).
export function clampZoom(zoom: Zoom, width: number, height: number): Zoom {
  const scale = clamp(zoom.scale, 1, MAX_ZOOM);
  if (scale <= 1.001) {
    return NO_ZOOM;
  }

  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return {
    scale,
    x: clamp(zoom.x, -maxX, maxX),
    y: clamp(zoom.y, -maxY, maxY),
  };
}

// Zooms by `factor` while keeping the point (px, py), measured from the
// container's center, fixed on screen.
export function zoomAt(
  zoom: Zoom,
  factor: number,
  px: number,
  py: number,
  width: number,
  height: number,
): Zoom {
  const scale = clamp(zoom.scale * factor, 1, MAX_ZOOM);
  const ratio = scale / zoom.scale;
  return clampZoom(
    { scale, x: px - (px - zoom.x) * ratio, y: py - (py - zoom.y) * ratio },
    width,
    height,
  );
}

export function zoomTransform(zoom: Zoom): string | undefined {
  return zoom.scale === 1
    ? undefined
    : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
}

type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; origin: Zoom }
  | { kind: "pinch"; distance: number; mid: Point; origin: Zoom };

// Wheel zoom, drag to pan, two-finger pinch, and double-click to toggle.
export function useZoomPan(
  containerRef: RefObject<HTMLElement | null>,
  zoom: Zoom,
  setZoom: Dispatch<SetStateAction<Zoom>>,
  enabled: boolean,
) {
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const measure = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ?? { left: 0, top: 0, width: 1, height: 1 };
  };

  const fromCenter = (point: Point) => {
    const rect = measure();
    return {
      x: point.x - rect.left - rect.width / 2,
      y: point.y - rect.top - rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  };

  // Wheel listeners must be non-passive to stop the page from scrolling.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !enabled) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setZoom((current) => zoomAt(current, factor, px, py, rect.width, rect.height));
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [containerRef, enabled, setZoom]);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      origin: zoom,
    };
  };

  const startPan = (point: Point, origin: Zoom) => {
    gesture.current = { kind: "pan", start: point, origin };
  };

  // Returns which gesture took the pointer, or null to let the caller use it
  // (for example to drag the comparison divider).
  const onPointerDown = (
    event: PointerEvent<HTMLElement>,
    options: { allowPan?: boolean } = {},
  ): "pan" | "pinch" | null => {
    if (!enabled) {
      return null;
    }

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      event.currentTarget.setPointerCapture(event.pointerId);
      startPinch();
      return "pinch";
    }

    if (pointers.current.size === 1 && zoom.scale > 1 && options.allowPan !== false) {
      event.currentTarget.setPointerCapture(event.pointerId);
      startPan({ x: event.clientX, y: event.clientY }, zoom);
      return "pan";
    }

    return null;
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>): boolean => {
    if (!pointers.current.has(event.pointerId)) {
      return false;
    }

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = gesture.current;
    if (!active) {
      return false;
    }

    if (active.kind === "pan") {
      const { width, height } = measure();
      setZoom(
        clampZoom(
          {
            ...active.origin,
            x: active.origin.x + event.clientX - active.start.x,
            y: active.origin.y + event.clientY - active.start.y,
          },
          width,
          height,
        ),
      );
      return true;
    }

    const [a, b] = [...pointers.current.values()];
    if (!a || !b) {
      return true;
    }

    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const anchor = fromCenter(active.mid);
    const zoomed = zoomAt(
      active.origin,
      distance / active.distance,
      anchor.x,
      anchor.y,
      anchor.width,
      anchor.height,
    );
    setZoom(
      clampZoom(
        {
          ...zoomed,
          x: zoomed.x + mid.x - active.mid.x,
          y: zoomed.y + mid.y - active.mid.y,
        },
        anchor.width,
        anchor.height,
      ),
    );
    return true;
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    if (gesture.current?.kind === "pinch") {
      // Lifting one finger of a pinch carries on as a pan with the other.
      const remaining = [...pointers.current.values()][0];
      gesture.current = null;
      if (remaining) {
        startPan(remaining, zoomRef.current);
      }
      return;
    }

    if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  const onDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!enabled) {
      return;
    }

    if (zoom.scale > 1) {
      setZoom(NO_ZOOM);
      return;
    }

    const point = fromCenter({ x: event.clientX, y: event.clientY });
    setZoom(zoomAt(zoom, DOUBLE_CLICK_ZOOM, point.x, point.y, point.width, point.height));
  };

  return { onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}
