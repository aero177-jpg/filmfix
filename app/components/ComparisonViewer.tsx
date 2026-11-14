import Image from "next/image";
import {
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type PointerEvent,
  type SetStateAction,
  type SyntheticEvent,
} from "react";

import type { ComparisonSide, GalleryItem } from "../studio";
import { useZoomPan, zoomTransform, type Zoom } from "./useZoomPan";

// How close (px) a pointer must be to the divider to grab it while zoomed.
const DIVIDER_GRAB_DISTANCE = 28;

export function ComparisonViewer({
  left,
  right,
  position,
  onPositionChange,
  onDropFile,
  onImageLoad,
  zoom,
  onZoomChange,
  zoomEnabled,
}: {
  left?: GalleryItem;
  right?: GalleryItem;
  position: number;
  onPositionChange: (position: number) => void;
  onDropFile: (side: ComparisonSide, file: File) => void;
  onImageLoad: (id: string, event: SyntheticEvent<HTMLImageElement>) => void;
  zoom: Zoom;
  onZoomChange: Dispatch<SetStateAction<Zoom>>;
  zoomEnabled: boolean;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const draggingDivider = useRef(false);
  const [dropSide, setDropSide] = useState<ComparisonSide | null>(null);
  const zoomPan = useZoomPan(viewerRef, zoom, onZoomChange, zoomEnabled);
  // Both images get the same transform, so they stay aligned at any zoom.
  // The divider and clip stay in screen space, outside the transform.
  const transform = zoomTransform(zoom);
  const isZoomed = zoom.scale > 1;

  const sideFromEvent = (event: DragEvent<HTMLDivElement>): ComparisonSide => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX - bounds.left < bounds.width / 2 ? "left" : "right";
  };

  const moveDivider = (event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    onPositionChange(Math.round(Math.min(100, Math.max(0, next)) * 10) / 10);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const dividerX = bounds.left + (bounds.width * position) / 100;
    const nearDivider = Math.abs(event.clientX - dividerX) <= DIVIDER_GRAB_DISTANCE;

    // When zoomed, dragging pans unless it starts on the divider.
    if (zoomPan.onPointerDown(event, { allowPan: !nearDivider })) {
      draggingDivider.current = false;
      return;
    }

    if (!isZoomed || nearDivider) {
      draggingDivider.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      moveDivider(event);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (zoomPan.onPointerMove(event)) {
      return;
    }

    if (draggingDivider.current) {
      moveDivider(event);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    zoomPan.onPointerUp(event);
    draggingDivider.current = false;
  };

  return (
    <div
      ref={viewerRef}
      className={`comparison-viewer${zoomEnabled ? " is-zoomable" : ""}`}
      id="comparison-viewer"
      onDragOver={(event) => {
        event.preventDefault();
        setDropSide(sideFromEvent(event));
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) {
          onDropFile(sideFromEvent(event), file);
        }
        setDropSide(null);
      }}
    >
      {right ? (
        <div className="zoom-layer" style={{ transform }}>
          <Image
            key={right.id}
            className="stage-image"
            src={right.src}
            alt={right.label}
            fill
            sizes="(max-width: 900px) 100vw, 1100px"
            unoptimized
            draggable={false}
            onLoad={(event) => onImageLoad(right.id, event)}
          />
        </div>
      ) : (
        <span className="comparison-empty comparison-empty-right">
          Drop an image here
        </span>
      )}
      {left ? (
        <div
          className="comparison-left"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <div className="zoom-layer" style={{ transform }}>
            <Image
              key={left.id}
              className="stage-image"
              src={left.src}
              alt={left.label}
              fill
              sizes="(max-width: 900px) 100vw, 1100px"
              unoptimized
              draggable={false}
              onLoad={(event) => onImageLoad(left.id, event)}
            />
          </div>
        </div>
      ) : (
        <span className="comparison-empty comparison-empty-left">
          Drop an image here
        </span>
      )}

      <span className="stage-tag stage-tag-left">{left?.label ?? "Left"}</span>
      <span className="stage-tag stage-tag-right">{right?.label ?? "Right"}</span>

      {dropSide ? (
        <span className={`comparison-drop comparison-drop-${dropSide}`}>
          Release to add on the {dropSide}
        </span>
      ) : null}

      <div
        className="comparison-divider"
        style={{ left: `${position}%` }}
        aria-hidden="true"
      >
        <span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      {/* Pointer input for the divider, panning, and pinch zoom. */}
      <div
        className={`comparison-surface${isZoomed ? " is-zoomed" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={zoomPan.onDoubleClick}
      />
      {/* Keyboard control for the divider. */}
      <input
        className="comparison-slider"
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => onPositionChange(Number(event.target.value))}
        aria-label="Comparison divider position"
        aria-controls="comparison-viewer"
      />
    </div>
  );
}
