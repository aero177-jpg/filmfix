"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type SubmitEvent,
  type SyntheticEvent,
} from "react";

import { saveApiKey, useApiKey } from "./apiKeyStore";
import { ApiKeyButton } from "./components/ApiKeyButton";
import { ComparisonViewer } from "./components/ComparisonViewer";
import { Field, Icon, Segmented, Switch } from "./components/ui";
import {
  ACCEPT_ATTRIBUTE,
  GENERATE_SIZE_OPTIONS,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_IMAGES,
  MODEL_OPTIONS,
  QUALITY_OPTIONS,
  RESTORE_SIZE_OPTIONS,
  downloadName,
  formatBytes,
  formatCost,
  formatDimensions,
  formatDuration,
  formatTokenCount,
  isGenerateSizePreset,
  isRestoreSizePreset,
  modelLabel,
  normalizeMetadata,
  outputSizeForPreset,
  promptForPreset,
  readImageDimensions,
  validateImageFile,
  type ComparisonSide,
  type Dimensions,
  type GalleryItem,
  type GenerateSizePreset,
  type Mode,
  type PromptPreset,
  type RestoreSizePreset,
  type RestoreVersion,
  type Target,
} from "./studio";

const ORIGINAL_ID = "original";

type View = "single" | "compare";

type ReferenceImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type UiError = {
  message: string;
  detail?: string;
};

class RestoreRequestError extends Error {
  detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "RestoreRequestError";
    this.detail = detail;
  }
}

export default function Home() {
  const formRef = useRef<HTMLFormElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importSideRef = useRef<ComparisonSide>("left");
  const previewUrlRef = useRef("");
  const referenceObjectUrlsRef = useRef<string[]>([]);
  const importObjectUrlsRef = useRef<string[]>([]);

  const [mode, setMode] = useState<Mode>("restore");
  const [target, setTarget] = useState<Target>("new");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dimensions, setDimensions] = useState<Record<string, Dimensions>>({});
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0].value);
  const [quality, setQuality] = useState("high");
  const [restoreSize, setRestoreSize] = useState<RestoreSizePreset>("auto");
  const [generateSize, setGenerateSize] = useState<GenerateSizePreset>("auto");
  const [restorePreset, setRestorePreset] = useState<PromptPreset>("restore");
  const [removeArtifacts, setRemoveArtifacts] = useState(true);
  const [restorePrompt, setRestorePrompt] = useState(() =>
    promptForPreset("restore", true),
  );
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [versions, setVersions] = useState<RestoreVersion[]>([]);
  const [imports, setImports] = useState<GalleryItem[]>([]);
  const [view, setView] = useState<View>("single");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<
    Record<ComparisonSide, string | null>
  >({ left: null, right: null });
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSourceDragging, setIsSourceDragging] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const apiKey = useApiKey();

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      referenceObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      importObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen || view !== "compare") {
      return;
    }

    const handleFullscreenKeyDown = (event: KeyboardEvent) => {
      const nextPosition = {
        ArrowLeft: 0,
        ArrowRight: 100,
        ArrowUp: 50,
      }[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp"];

      if (nextPosition === undefined) {
        return;
      }

      event.preventDefault();
      setComparisonPosition(nextPosition);
    };

    window.addEventListener("keydown", handleFullscreenKeyDown);
    return () => window.removeEventListener("keydown", handleFullscreenKeyDown);
  }, [isFullscreen, view]);

  // Everything that can be viewed or compared, in filmstrip order.
  const gallery: GalleryItem[] = [
    ...(previewUrl
      ? [
          {
            id: ORIGINAL_ID,
            label: "Original",
            src: previewUrl,
            kind: "original" as const,
          },
        ]
      : []),
    ...versions.map((version) => ({
      id: version.id,
      label: version.label,
      src: version.imageDataUrl,
      kind: "generated" as const,
      version,
    })),
    ...imports,
  ];
  const findItem = (id: string | null | undefined) =>
    id ? gallery.find((item) => item.id === id) : undefined;

  const selectedItem = findItem(selectedId) ?? gallery[0];
  const compareRight =
    findItem(comparison.right) ??
    (selectedItem?.kind === "original"
      ? gallery.find((item) => item.kind !== "original")
      : selectedItem);
  // Restorations compare best against the source; generations against their parent.
  const parentId = compareRight?.version?.parentVersionId;
  const leftPreference =
    compareRight?.version?.mode === "generate"
      ? [parentId, ORIGINAL_ID]
      : [ORIGINAL_ID, parentId];
  const compareLeft =
    findItem(comparison.left) ??
    leftPreference
      .map((id) => findItem(id))
      .find((item) => item && item.id !== compareRight?.id) ??
    [...gallery].reverse().find((item) => item.id !== compareRight?.id);

  const focusItem = view === "single" ? selectedItem : compareRight;
  const focusVersion = focusItem?.version;
  const effectiveTarget: Target = focusVersion ? target : "new";
  const isRefine = effectiveTarget === "refine" && focusVersion !== undefined;

  const presetPrompt = promptForPreset(restorePreset, removeArtifacts);
  const activePrompt = isRefine
    ? refinePrompt
    : mode === "restore"
      ? restorePrompt
      : generatePrompt;
  const setActivePrompt = isRefine
    ? setRefinePrompt
    : mode === "restore"
      ? setRestorePrompt
      : setGeneratePrompt;
  const needsSource = mode === "restore" && !isRefine && !selectedFile;
  const canSubmit = !isProcessing && !needsSource && activePrompt.trim() !== "";
  const hasSession =
    selectedFile !== null || versions.length > 0 || imports.length > 0;

  const recordDimensions = (
    id: string,
    event: SyntheticEvent<HTMLImageElement>,
  ) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    setDimensions((current) =>
      current[id]?.width === width && current[id]?.height === height
        ? current
        : { ...current, [id]: { width, height } },
    );
  };

  const replaceFile = (file: File) => {
    const problem = validateImageFile(file);
    if (problem) {
      setError({ message: problem });
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setDimensions((current) => {
      const next = { ...current };
      delete next[ORIGINAL_ID];
      return next;
    });
    setSelectedId(ORIGINAL_ID);
    setView("single");
    setTarget("new");
    setError(null);
  };

  const removeSource = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }

    setSelectedFile(null);
    setPreviewUrl("");
    if (sourceInputRef.current) {
      sourceInputRef.current.value = "";
    }
  };

  const handleSourceDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsSourceDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      replaceFile(file);
    }
  };

  const clearReferenceImages = () => {
    referenceObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    referenceObjectUrlsRef.current = [];
    setReferenceImages([]);
    if (referenceInputRef.current) {
      referenceInputRef.current.value = "";
    }
  };

  const addReferenceImages = (files: File[]) => {
    const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (remainingSlots <= 0) {
      setError({
        message: `Choose no more than ${MAX_REFERENCE_IMAGES} reference images.`,
      });
      return;
    }

    const acceptedFiles: File[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      const problem = validateImageFile(file, "Reference images");
      if (problem) {
        setError({ message: problem });
        return;
      }
      acceptedFiles.push(file);
    }

    const nextImages = acceptedFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      referenceObjectUrlsRef.current.push(previewUrl);
      return { id: crypto.randomUUID(), file, previewUrl };
    });

    if (nextImages.length > 0) {
      setReferenceImages((current) => [...current, ...nextImages]);
      setError(null);
    }
  };

  const removeReferenceImage = (imageId: string) => {
    setReferenceImages((current) => {
      const image = current.find((candidate) => candidate.id === imageId);
      if (image) {
        URL.revokeObjectURL(image.previewUrl);
        referenceObjectUrlsRef.current = referenceObjectUrlsRef.current.filter(
          (url) => url !== image.previewUrl,
        );
      }
      return current.filter((candidate) => candidate.id !== imageId);
    });
  };

  const importImage = (side: ComparisonSide, file: File) => {
    const problem = validateImageFile(file);
    if (problem) {
      setError({ message: problem });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const id = crypto.randomUUID();
    importObjectUrlsRef.current.push(objectUrl);
    setImports((current) => [
      ...current,
      {
        id,
        label: `Import ${current.length + 1}`,
        src: objectUrl,
        kind: "imported",
      },
    ]);
    setComparison((current) => ({ ...current, [side]: id }));
    setView("compare");
    setError(null);
  };

  const openImportPicker = (side: ComparisonSide) => {
    importSideRef.current = side;
    importInputRef.current?.click();
  };

  const resetSession = () => {
    removeSource();
    clearReferenceImages();
    importObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    importObjectUrlsRef.current = [];
    setImports([]);
    setVersions([]);
    setDimensions({});
    setSelectedId(null);
    setComparison({ left: null, right: null });
    setComparisonPosition(50);
    setView("single");
    setTarget("new");
    setRestorePreset("restore");
    setRemoveArtifacts(true);
    setRestorePrompt(promptForPreset("restore", true));
    setGeneratePrompt("");
    setRefinePrompt("");
    setError(null);
  };

  const selectGalleryItem = (id: string) => {
    setSelectedId(id);
    if (view === "compare") {
      setComparison((current) => ({
        left: current.left === id ? (compareRight?.id ?? null) : current.left,
        right: id,
      }));
    }
  };

  const swapComparison = () => {
    setComparison({
      left: compareRight?.id ?? null,
      right: compareLeft?.id ?? null,
    });
  };

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      await stage.requestFullscreen();
    } catch {
      setError({ message: "Fullscreen is not available here." });
    }
  };

  const handleSubmit = async (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (isProcessing) {
      return;
    }

    const parent = isRefine ? focusVersion : undefined;
    if (mode === "restore" && !parent && !selectedFile) {
      setError({ message: "Choose a photograph to restore first." });
      return;
    }

    const promptText = activePrompt.trim();
    if (!promptText) {
      setError({
        message: parent
          ? "Describe what to change before refining."
          : "Add a prompt before submitting.",
      });
      return;
    }

    let requestedSize: string = mode === "generate" ? generateSize : "auto";
    if (mode === "restore" && restoreSize !== "auto") {
      try {
        const sourceDimensions =
          dimensions[ORIGINAL_ID] ??
          (selectedFile
            ? await readImageDimensions(selectedFile)
            : parent
              ? dimensions[parent.id]
              : undefined);
        requestedSize = sourceDimensions
          ? outputSizeForPreset(restoreSize, sourceDimensions)
          : "auto";
      } catch {
        setError({ message: "The source image dimensions could not be read." });
        return;
      }
    }

    setIsProcessing(true);
    setElapsedSeconds(0);
    setError(null);

    const formData = new FormData();
    formData.append("mode", mode);
    if (mode === "restore" && !parent && selectedFile) {
      formData.append("image", selectedFile);
    }
    formData.append("prompt", promptText);
    formData.append("model", model);
    formData.append("size", requestedSize);
    formData.append("quality", quality);
    if (parent) {
      formData.append("previousResponseId", parent.responseId);
    }
    referenceImages.forEach((referenceImage) => {
      formData.append("referenceImage", referenceImage.file);
    });

    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: apiKey ? { "x-openai-api-key": apiKey } : undefined,
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!response.ok) {
        throw new RestoreRequestError(
          typeof payload?.error === "string"
            ? payload.error
            : "The request was not accepted.",
          typeof payload?.detail === "string" ? payload.detail : undefined,
        );
      }

      if (
        !payload ||
        typeof payload.imageDataUrl !== "string" ||
        !payload.imageDataUrl.startsWith("data:image/") ||
        typeof payload.responseId !== "string"
      ) {
        throw new RestoreRequestError(
          "The image service returned an invalid image response.",
        );
      }

      const versionId = crypto.randomUUID();
      const version: RestoreVersion = {
        id: versionId,
        label: `v${versions.length + 1}`,
        mode,
        imageDataUrl: payload.imageDataUrl,
        metadata: normalizeMetadata(payload.metadata, {
          model,
          size: requestedSize,
          quality,
        }),
        prompt: promptText,
        responseId: payload.responseId,
        parentVersionId: parent?.id ?? null,
        sourceName:
          mode === "restore"
            ? (selectedFile?.name ?? parent?.sourceName ?? null)
            : null,
      };
      setVersions((current) => [...current, version]);
      setSelectedId(versionId);
      setComparison({ left: null, right: versionId });
      setComparisonPosition(50);
      setView(mode === "restore" || parent ? "compare" : "single");
      if (parent) {
        setRefinePrompt("");
      }
      clearReferenceImages();
    } catch (requestError) {
      if (requestError instanceof RestoreRequestError) {
        setError({ message: requestError.message, detail: requestError.detail });
      } else {
        setError({
          message: "The request could not reach the server.",
          detail: requestError instanceof Error ? requestError.name : undefined,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const submitLabel = isProcessing
    ? isRefine
      ? `Refining ${focusVersion?.label}…`
      : mode === "restore"
        ? "Restoring…"
        : "Generating…"
    : isRefine
      ? `Refine ${focusVersion?.label}`
      : mode === "restore"
        ? "Restore photograph"
        : "Generate image";

  const lineage: RestoreVersion[] = [];
  for (
    let version = focusVersion;
    version;
    version = versions.find((candidate) => candidate.id === version?.parentVersionId)
  ) {
    lineage.unshift(version);
  }

  const renderSideSelect = (side: ComparisonSide, item: GalleryItem | undefined) => (
    <div className="side-picker">
      <span className="side-picker-label">{side === "left" ? "L" : "R"}</span>
      <select
        aria-label={`${side === "left" ? "Left" : "Right"} comparison image`}
        value={item?.id ?? ""}
        disabled={gallery.length === 0}
        onChange={(event) =>
          setComparison((current) => ({ ...current, [side]: event.target.value }))
        }
      >
        {item ? null : <option value="">Empty</option>}
        {gallery.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.version?.parentVersionId ? " (refined)" : ""}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        type="button"
        onClick={() => openImportPicker(side)}
        aria-label={`Import an image to the ${side} side`}
        title="Import from device"
      >
        <Icon name="plus" />
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <Segmented
          className="mode-switch"
          label="Mode"
          size="lg"
          value={mode}
          onChange={(nextMode) => {
            setMode(nextMode);
            setError(null);
          }}
          options={[
            {
              value: "restore",
              label: (
                <>
                  <Icon name="restore" /> Restore
                </>
              ),
            },
            {
              value: "generate",
              label: (
                <>
                  <Icon name="sparkle" /> Generate
                </>
              ),
            },
          ]}
        />
        <div className="topbar-actions">
          {hasSession ? (
            <button
              className="ghost-button"
              type="button"
              onClick={resetSession}
              disabled={isProcessing}
            >
              <Icon name="reset" /> New session
            </button>
          ) : null}
          <ApiKeyButton apiKey={apiKey} onChange={saveApiKey} />
        </div>
      </header>

      <div className="workspace">
        <form
          ref={formRef}
          className="composer"
          onSubmit={handleSubmit}
          aria-label={mode === "restore" ? "Restoration settings" : "Generation settings"}
        >
          <div className="composer-scroll">
            {mode === "restore" ? (
              <section className="composer-section" aria-labelledby="source-title">
                <h2 className="section-kicker" id="source-title">
                  Source photograph
                </h2>
                {selectedFile ? (
                  <div
                    className={`source-card${isSourceDragging ? " is-dragging" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsSourceDragging(true);
                    }}
                    onDragLeave={() => setIsSourceDragging(false)}
                    onDrop={handleSourceDrop}
                  >
                    <button
                      className="source-thumb"
                      type="button"
                      onClick={() => selectGalleryItem(ORIGINAL_ID)}
                      aria-label="Show the original on the stage"
                    >
                      <Image
                        src={previewUrl}
                        alt=""
                        fill
                        sizes="64px"
                        unoptimized
                        onLoad={(event) => recordDimensions(ORIGINAL_ID, event)}
                      />
                    </button>
                    <div className="source-meta">
                      <strong title={selectedFile.name}>{selectedFile.name}</strong>
                      <span>
                        {formatDimensions(dimensions[ORIGINAL_ID])} ·{" "}
                        {formatBytes(selectedFile.size)}
                      </span>
                      <div className="source-actions">
                        <label className="link-button" htmlFor="source-upload">
                          Replace
                        </label>
                        <button
                          className="link-button"
                          type="button"
                          onClick={removeSource}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    className={`source-drop${isSourceDragging ? " is-dragging" : ""}`}
                    htmlFor="source-upload"
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsSourceDragging(true);
                    }}
                    onDragLeave={() => setIsSourceDragging(false)}
                    onDrop={handleSourceDrop}
                  >
                    <Icon name="upload" size={18} />
                    <span>
                      <strong>Choose a photograph</strong>
                      <small>or drop it here · JPEG, PNG, WebP · 50 MiB</small>
                    </span>
                  </label>
                )}
                <input
                  ref={sourceInputRef}
                  className="visually-hidden"
                  id="source-upload"
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      replaceFile(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </section>
            ) : null}

            <section className="composer-section" aria-labelledby="prompt-title">
              <h2 className="section-kicker" id="prompt-title">
                Instructions
              </h2>

              {focusVersion ? (
                <Segmented
                  label="What to submit"
                  value={effectiveTarget}
                  onChange={setTarget}
                  options={[
                    {
                      value: "new",
                      label: mode === "restore" ? "New restoration" : "New image",
                    },
                    {
                      value: "refine",
                      label: (
                        <>
                          <Icon name="pen" /> Refine {focusVersion.label}
                        </>
                      ),
                    },
                  ]}
                />
              ) : null}

              {mode === "restore" && !isRefine ? (
                <div className="preset-row">
                  <Segmented
                    label="Prompt preset"
                    size="sm"
                    value={restorePreset}
                    onChange={(preset) => {
                      setRestorePreset(preset);
                      setRestorePrompt(promptForPreset(preset, removeArtifacts));
                    }}
                    options={[
                      { value: "restore", label: "Restore" },
                      { value: "colorize", label: "Colorize B&W" },
                    ]}
                  />
                  <Switch
                    id="remove-artifacts"
                    label="Remove artifacts"
                    checked={removeArtifacts}
                    onChange={(checked) => {
                      setRemoveArtifacts(checked);
                      setRestorePrompt(promptForPreset(restorePreset, checked));
                    }}
                  />
                </div>
              ) : null}

              <Field
                label={
                  isRefine
                    ? "Refinement"
                    : mode === "restore"
                      ? "Restoration prompt"
                      : "Prompt"
                }
                htmlFor="prompt"
                action={
                  mode === "restore" && !isRefine && restorePrompt !== presetPrompt ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setRestorePrompt(presetPrompt)}
                    >
                      Reset to preset
                    </button>
                  ) : null
                }
                hint={
                  <>
                    <span>
                      {isRefine
                        ? `Builds on ${focusVersion?.label} and becomes v${versions.length + 1}.`
                        : "Ctrl + Enter to submit"}
                    </span>
                    <span>
                      {activePrompt.length.toLocaleString()} /{" "}
                      {MAX_PROMPT_LENGTH.toLocaleString()}
                    </span>
                  </>
                }
              >
                <textarea
                  id="prompt"
                  value={activePrompt}
                  maxLength={MAX_PROMPT_LENGTH}
                  rows={6}
                  placeholder={
                    isRefine
                      ? `Describe what to change in ${focusVersion?.label}…`
                      : "Describe the image you want to create…"
                  }
                  onChange={(event) => setActivePrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                />
              </Field>

              <Field
                label="Reference images"
                action={
                  referenceImages.length > 0 ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={clearReferenceImages}
                    >
                      Clear
                    </button>
                  ) : (
                    <span className="field-count">Optional</span>
                  )
                }
                hint={
                  mode === "restore"
                    ? "Context only — never treated as the photo being restored."
                    : "Visual guidance for style, subject, or composition."
                }
              >
                <ul className="reference-grid" aria-label="Reference images">
                  {referenceImages.map((referenceImage) => (
                    <li key={referenceImage.id} className="reference-tile">
                      <Image
                        src={referenceImage.previewUrl}
                        alt={`Reference ${referenceImage.file.name}`}
                        fill
                        sizes="80px"
                        unoptimized
                      />
                      <button
                        className="reference-remove"
                        type="button"
                        onClick={() => removeReferenceImage(referenceImage.id)}
                        aria-label={`Remove ${referenceImage.file.name}`}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                  {referenceImages.length < MAX_REFERENCE_IMAGES ? (
                    <li>
                      <label
                        className="reference-add"
                        htmlFor="reference-images"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          addReferenceImages(Array.from(event.dataTransfer.files));
                        }}
                      >
                        <Icon name="plus" />
                        <span>
                          {referenceImages.length}/{MAX_REFERENCE_IMAGES}
                        </span>
                      </label>
                    </li>
                  ) : null}
                </ul>
                <input
                  ref={referenceInputRef}
                  className="visually-hidden"
                  id="reference-images"
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  multiple
                  onChange={(event) => {
                    addReferenceImages(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                />
              </Field>
            </section>

            <section className="composer-section" aria-labelledby="output-title">
              <h2 className="section-kicker" id="output-title">
                Output
              </h2>
              <Field label="Model">
                <Segmented
                  label="Model"
                  value={model}
                  onChange={setModel}
                  options={MODEL_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                    detail: option.detail,
                  }))}
                />
              </Field>
              <div className="field-row">
                <Field label="Size" htmlFor="size">
                  {mode === "restore" ? (
                    <select
                      id="size"
                      value={restoreSize}
                      onChange={(event) => {
                        if (isRestoreSizePreset(event.target.value)) {
                          setRestoreSize(event.target.value);
                        }
                      }}
                    >
                      {RESTORE_SIZE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      id="size"
                      value={generateSize}
                      onChange={(event) => {
                        if (isGenerateSizePreset(event.target.value)) {
                          setGenerateSize(event.target.value);
                        }
                      }}
                    >
                      {GENERATE_SIZE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Quality" htmlFor="quality">
                  <select
                    id="quality"
                    value={quality}
                    onChange={(event) => setQuality(event.target.value)}
                  >
                    {QUALITY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>
          </div>

          <div className="composer-footer">
            <button className="primary-button" type="submit" disabled={!canSubmit}>
              {isProcessing ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Icon name={isRefine ? "pen" : mode === "restore" ? "restore" : "sparkle"} />
              )}
              <span>{submitLabel}</span>
            </button>
            <p className="processing-note" aria-live="polite">
              {isProcessing
                ? `${elapsedSeconds}s elapsed · can take up to about two minutes`
                : needsSource
                  ? "Choose a source photograph to begin."
                  : "One request at a time. Nothing is retried automatically."}
            </p>
          </div>
        </form>

        <main className="canvas">
          <section
            ref={stageRef}
            className={`stage${isFullscreen ? " is-fullscreen" : ""}`}
            aria-label="Image stage"
          >
            <div className="stage-toolbar">
              <Segmented
                label="View"
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  {
                    value: "single",
                    label: (
                      <>
                        <Icon name="single" /> Single
                      </>
                    ),
                  },
                  {
                    value: "compare",
                    label: (
                      <>
                        <Icon name="compare" /> Compare
                      </>
                    ),
                  },
                ]}
              />

              {view === "compare" ? (
                <div className="compare-pickers">
                  {renderSideSelect("left", compareLeft)}
                  <button
                    className="icon-button"
                    type="button"
                    onClick={swapComparison}
                    aria-label="Swap sides"
                    title="Swap sides"
                    disabled={!compareLeft && !compareRight}
                  >
                    <Icon name="swap" />
                  </button>
                  {renderSideSelect("right", compareRight)}
                </div>
              ) : (
                <div className="stage-title">
                  {selectedItem ? (
                    <>
                      <strong>{selectedItem.label}</strong>
                      <span>{formatDimensions(dimensions[selectedItem.id])}</span>
                    </>
                  ) : null}
                </div>
              )}

              <div className="stage-actions">
                {focusVersion ? (
                  <a
                    className="secondary-button"
                    href={focusVersion.imageDataUrl}
                    download={downloadName(focusVersion)}
                  >
                    <Icon name="download" /> <span>{focusVersion.label}</span>
                  </a>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  <Icon name={isFullscreen ? "shrink" : "expand"} />
                </button>
              </div>
            </div>

            <div className="stage-body">
              {view === "compare" ? (
                <ComparisonViewer
                  left={compareLeft}
                  right={compareRight}
                  position={comparisonPosition}
                  onPositionChange={setComparisonPosition}
                  onDropFile={importImage}
                  onImageLoad={recordDimensions}
                />
              ) : selectedItem ? (
                <div className="single-viewer">
                  <Image
                    key={selectedItem.id}
                    className="stage-image"
                    src={selectedItem.src}
                    alt={selectedItem.label}
                    fill
                    sizes="(max-width: 900px) 100vw, 1100px"
                    unoptimized
                    onLoad={(event) => recordDimensions(selectedItem.id, event)}
                  />
                </div>
              ) : mode === "restore" ? (
                <label
                  className={`stage-drop${isSourceDragging ? " is-dragging" : ""}`}
                  htmlFor="source-upload"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsSourceDragging(true);
                  }}
                  onDragLeave={() => setIsSourceDragging(false)}
                  onDrop={handleSourceDrop}
                >
                  <span className="empty-icon">
                    <Icon name="upload" size={22} />
                  </span>
                  <span className="empty-title">Drop a photograph to restore</span>
                  <span className="empty-caption">or click to browse this device</span>
                  <span className="empty-formats">JPEG · PNG · WebP · 50 MiB max</span>
                </label>
              ) : (
                <div className="stage-empty">
                  <span className="empty-icon">
                    <Icon name="sparkle" size={22} />
                  </span>
                  <span className="empty-title">Nothing generated yet</span>
                  <span className="empty-caption">
                    Write a prompt on the left and your images will appear here.
                  </span>
                </div>
              )}

              {isProcessing ? (
                <div className="stage-progress" role="status">
                  <span className="spinner spinner-lg" aria-hidden="true" />
                  <strong>
                    {isRefine
                      ? `Refining ${focusVersion?.label}`
                      : mode === "restore"
                        ? "Restoring photograph"
                        : "Generating image"}
                  </strong>
                  <span>{elapsedSeconds}s</span>
                </div>
              ) : null}
            </div>

            {view === "compare" && isFullscreen ? (
              <p className="stage-hint">← left · ↑ center · → right</p>
            ) : null}
          </section>

          {error ? (
            <div className="notice" role="alert">
              <div>
                <strong>{error.message}</strong>
                {error.detail ? <code>{error.detail}</code> : null}
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss"
              >
                <Icon name="close" />
              </button>
            </div>
          ) : null}

          {gallery.length > 0 ? (
            <nav className="filmstrip" aria-label="Versions">
              {gallery.map((item) => {
                const isLeft = view === "compare" && item.id === compareLeft?.id;
                const isRight = view === "compare" && item.id === compareRight?.id;
                const isActive = view === "single" ? item.id === selectedItem?.id : isRight;
                const parent = item.version?.parentVersionId
                  ? versions.find((v) => v.id === item.version?.parentVersionId)
                  : undefined;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`film-tile${isActive ? " is-active" : ""}${isLeft ? " is-left" : ""}`}
                    onClick={() => selectGalleryItem(item.id)}
                    aria-pressed={isActive}
                  >
                    <span className="film-thumb">
                      <Image src={item.src} alt="" fill sizes="88px" unoptimized />
                      {isLeft || isRight ? (
                        <span className="film-side">{isLeft ? "L" : "R"}</span>
                      ) : null}
                    </span>
                    <span className="film-label">
                      {item.version ? (
                        <Icon
                          name={item.version.mode === "restore" ? "restore" : "sparkle"}
                          size={11}
                        />
                      ) : item.kind === "imported" ? (
                        <Icon name="image" size={11} />
                      ) : null}
                      {item.label}
                      {parent ? <small>← {parent.label}</small> : null}
                    </span>
                  </button>
                );
              })}
            </nav>
          ) : null}

          {focusVersion ? (
            <section className="details" aria-label={`${focusVersion.label} details`}>
              <div className="details-heading">
                <h2>
                  {focusVersion.label}
                  <span>
                    {focusVersion.parentVersionId
                      ? `Refinement of ${versions.find((v) => v.id === focusVersion.parentVersionId)?.label ?? "an earlier version"}`
                      : focusVersion.mode === "restore"
                        ? `Restoration${focusVersion.sourceName ? ` of ${focusVersion.sourceName}` : ""}`
                        : "Generation"}
                  </span>
                </h2>
              </div>
              <dl className="stat-grid">
                <div>
                  <dt>Model</dt>
                  <dd>{modelLabel(focusVersion.metadata.model)}</dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>{focusVersion.metadata.quality}</dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{focusVersion.metadata.size}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>{formatDimensions(dimensions[focusVersion.id])}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{formatDuration(focusVersion.metadata.durationMs)}</dd>
                </div>
                <div>
                  <dt>Est. cost</dt>
                  <dd>{formatCost(focusVersion.metadata.cost)}</dd>
                </div>
              </dl>

              <details className="disclosure" open>
                <summary>
                  {lineage.length > 1 ? `Prompt lineage (${lineage.length})` : "Prompt"}
                </summary>
                <ol className="lineage">
                  {lineage.map((version) => (
                    <li key={version.id}>
                      <strong>{version.label}</strong>
                      <p>{version.prompt}</p>
                    </li>
                  ))}
                </ol>
              </details>

              <details className="disclosure">
                <summary>Token usage</summary>
                {focusVersion.metadata.usage ? (
                  <dl className="stat-grid stat-grid-compact">
                    <div>
                      <dt>Input text</dt>
                      <dd>{formatTokenCount(focusVersion.metadata.usage.inputTextTokens)}</dd>
                    </div>
                    <div>
                      <dt>Input image</dt>
                      <dd>{formatTokenCount(focusVersion.metadata.usage.inputImageTokens)}</dd>
                    </div>
                    <div>
                      <dt>Output image</dt>
                      <dd>{formatTokenCount(focusVersion.metadata.usage.outputImageTokens)}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{formatTokenCount(focusVersion.metadata.usage.totalTokens)}</dd>
                    </div>
                  </dl>
                ) : null}
                <p className="fine-print">
                  {focusVersion.metadata.usage
                    ? "Cost is estimated from returned tokens at $5/M text input, $8/M image input, and $30/M image output. Missing token fields stay unavailable."
                    : "Token usage was not included in the response, so a cost estimate is unavailable."}
                </p>
              </details>
            </section>
          ) : null}
        </main>
      </div>

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            importImage(importSideRef.current, file);
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
