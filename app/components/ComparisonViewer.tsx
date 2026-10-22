import Image from "next/image";
import { useState, type DragEvent, type SyntheticEvent } from "react";

import type { ComparisonSide, GalleryItem } from "../studio";

export function ComparisonViewer({
  left,
  right,
  position,
  onPositionChange,
  onDropFile,
  onImageLoad,
}: {
  left?: GalleryItem;
  right?: GalleryItem;
  position: number;
  onPositionChange: (position: number) => void;
  onDropFile: (side: ComparisonSide, file: File) => void;
  onImageLoad: (id: string, event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const [dropSide, setDropSide] = useState<ComparisonSide | null>(null);

  const sideFromEvent = (event: DragEvent<HTMLDivElement>): ComparisonSide => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX - bounds.left < bounds.width / 2 ? "left" : "right";
  };

  return (
    <div
      className="comparison-viewer"
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
        <Image
          key={right.id}
          className="stage-image"
          src={right.src}
          alt={right.label}
          fill
          sizes="(max-width: 900px) 100vw, 1100px"
          unoptimized
          onLoad={(event) => onImageLoad(right.id, event)}
        />
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
          <Image
            key={left.id}
            className="stage-image"
            src={left.src}
            alt={left.label}
            fill
            sizes="(max-width: 900px) 100vw, 1100px"
            unoptimized
            onLoad={(event) => onImageLoad(left.id, event)}
          />
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
