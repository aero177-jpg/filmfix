import { useEffect, useRef, useState } from "react";

import { Icon } from "./ui";

export function ApiKeyButton({
  apiKey,
  onChange,
}: {
  apiKey: string;
  onChange: (apiKey: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const open = () => {
    setDraft(apiKey);
    setIsOpen((current) => !current);
  };

  return (
    <div className="api-key" ref={rootRef}>
      <button
        className={`icon-button${apiKey ? " has-key" : ""}`}
        type="button"
        onClick={open}
        aria-expanded={isOpen}
        aria-label={apiKey ? "API key saved, change it" : "Add an API key"}
        title={apiKey ? "API key saved" : "Add an API key"}
      >
        <Icon name="key" />
      </button>
      {isOpen ? (
        <form
          className="api-key-popover"
          onSubmit={(event) => {
            event.preventDefault();
            onChange(draft.trim());
            setIsOpen(false);
          }}
        >
          <label className="field-label" htmlFor="api-key-input">
            OpenAI API key
          </label>
          <input
            id="api-key-input"
            type="password"
            value={draft}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
          />
          <p className="fine-print">
            Kept in this browser only and sent to this app&apos;s server with each
            request. Leave empty to use the server&apos;s OPENAI_API_KEY.
          </p>
          <div className="api-key-actions">
            {apiKey ? (
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  onChange("");
                  setDraft("");
                  setIsOpen(false);
                }}
              >
                Remove key
              </button>
            ) : (
              <span />
            )}
            <button className="secondary-button" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
