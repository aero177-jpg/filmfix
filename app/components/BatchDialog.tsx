"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_PRESET, MAX_VARIATIONS, loadPreset, savePreset, type Variation } from "../batch";
import {
  COMPLEXITY_OPTIONS,
  MODEL_GENERATIONS,
  MODEL_OPTIONS,
  QUALITY_OPTIONS,
  formatCost,
  type Cost,
  type ModelGeneration,
} from "../studio";
import { Icon } from "./ui";

export function BatchDialog({
  rows,
  onRowsChange,
  estimate,
  generation,
  actionLabel,
  blockedReason,
  onRun,
  onClose,
}: {
  rows: Variation[];
  onRowsChange: (rows: Variation[]) => void;
  // Average cost of earlier runs with the same model and quality, if any.
  estimate: (row: Variation) => Cost | undefined;
  generation: ModelGeneration;
  actionLabel: string;
  blockedReason: string | null;
  onRun: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [presetNote, setPresetNote] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const updateRow = (index: number, patch: Partial<Variation>) =>
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const estimates = rows.map(estimate);
  const total = estimates.every((cost) => cost !== undefined)
    ? estimates.reduce((sum, cost) => sum + (cost?.amountUsd ?? 0), 0)
    : undefined;
  const canAdd = rows.length < MAX_VARIATIONS;

  return (
    <dialog
      ref={dialogRef}
      className="batch-dialog"
      aria-labelledby="batch-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      <div className="batch-panel">
        <div className="batch-heading">
          <div>
            <h2 id="batch-title">Batch variations</h2>
            <p>
              Runs every row at once with the prompt, size, and references from the
              panel. Results open side by side in the grid.
            </p>
            <p>
              Using GPT Image {generation}
              {generation !== MODEL_GENERATIONS[0] ? " (previous models)" : ""}. Change
              the version next to Model in the panel.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="batch-presets">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              onRowsChange(loadPreset());
              setPresetNote("Loaded your preset.");
            }}
          >
            <Icon name="layers" /> Load preset
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              setPresetNote(
                savePreset(rows)
                  ? "Saved as your preset."
                  : "This browser blocked saving the preset.",
              )
            }
          >
            Save as preset
          </button>
          <button
            className="link-button"
            type="button"
            onClick={() => {
              onRowsChange(DEFAULT_PRESET);
              setPresetNote("Reset to the 2×2 model × quality grid.");
            }}
          >
            Default 2×2
          </button>
          <span className="batch-note" aria-live="polite">
            {presetNote}
          </span>
        </div>

        <ol className="batch-rows">
          {rows.map((row, index) => {
            const cost = estimates[index];
            return (
              <li key={index} className="batch-row">
                <span className="batch-index">{index + 1}</span>
                <select
                  aria-label={`Row ${index + 1} model`}
                  value={row.model}
                  onChange={(event) => updateRow(index, { model: event.target.value })}
                >
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Row ${index + 1} quality`}
                  value={row.quality}
                  onChange={(event) => updateRow(index, { quality: event.target.value })}
                >
                  {QUALITY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Row ${index + 1} complexity`}
                  value={row.complexity}
                  onChange={(event) => updateRow(index, { complexity: event.target.value })}
                >
                  {COMPLEXITY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {value === "auto" ? "Complexity auto" : `${label} complexity`}
                    </option>
                  ))}
                </select>
                <span className="batch-cost" title="Average of earlier runs with this model and quality">
                  {cost ? `~${formatCost(cost)}` : "—"}
                </span>
                <span className="batch-row-actions">
                  <button
                    className="icon-button"
                    type="button"
                    disabled={!canAdd}
                    onClick={() =>
                      onRowsChange([...rows.slice(0, index + 1), row, ...rows.slice(index + 1)])
                    }
                    aria-label={`Repeat row ${index + 1}`}
                    title="Repeat this row to see how much results vary by chance"
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={rows.length === 1}
                    onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
                    aria-label={`Remove row ${index + 1}`}
                  >
                    <Icon name="close" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>

        <button
          className="ghost-button batch-add"
          type="button"
          disabled={!canAdd}
          onClick={() => onRowsChange([...rows, rows[rows.length - 1] ?? DEFAULT_PRESET[0]])}
        >
          <Icon name="plus" /> Add variation
          <span className="batch-note">
            {rows.length}/{MAX_VARIATIONS}
          </span>
        </button>

        <div className="batch-footer">
          <p className="fine-print">
            {total !== undefined
              ? `Estimated total ~${formatCost({ amountUsd: total, currency: "USD" })} from earlier runs. Size and image count change the real cost.`
              : "Cost shows after the run for settings you haven't used yet."}
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={blockedReason !== null}
            title={blockedReason ?? undefined}
            onClick={() => {
              onRun();
              dialogRef.current?.close();
            }}
          >
            <Icon name="layers" />
            <span>
              {actionLabel} · {rows.length} {rows.length === 1 ? "variation" : "variations"}
            </span>
          </button>
          {blockedReason ? <p className="batch-blocked">{blockedReason}</p> : null}
        </div>
      </div>
    </dialog>
  );
}
