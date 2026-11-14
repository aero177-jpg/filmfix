"use client";

import Image from "next/image";
import type { SyntheticEvent } from "react";

import {
  formatCost,
  formatDuration,
  settingsLabel,
  type GalleryItem,
} from "../studio";

// All images of a batch side by side. Picking two opens them in the slider.
export function GridViewer({
  items,
  pickedId,
  onPick,
  onImageLoad,
}: {
  items: GalleryItem[];
  pickedId: string | null;
  onPick: (id: string) => void;
  onImageLoad: (id: string, event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const columns = items.length <= 1 ? 1 : items.length <= 4 ? 2 : 3;

  return (
    <div
      className="grid-viewer"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const metadata = item.version?.metadata;
        return (
          <button
            key={item.id}
            type="button"
            className={`grid-tile${pickedId === item.id ? " is-picked" : ""}`}
            onClick={() => onPick(item.id)}
            aria-pressed={pickedId === item.id}
            aria-label={`${item.label}${metadata ? `, ${settingsLabel(metadata)}` : ""}`}
          >
            <span className="grid-image">
              <Image
                src={item.src}
                alt=""
                fill
                sizes="(max-width: 900px) 50vw, 550px"
                unoptimized
                onLoad={(event) => onImageLoad(item.id, event)}
              />
            </span>
            <span className="grid-caption">
              <strong>{item.label}</strong>
              {metadata ? (
                <>
                  <span>{settingsLabel(metadata)}</span>
                  <span className="grid-stats">
                    {formatCost(metadata.cost)} · {formatDuration(metadata.durationMs)}
                  </span>
                </>
              ) : (
                <span>{item.kind === "original" ? "Source" : "Imported"}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
