"use client";

import { useEffect, useState } from "react";

import {
  readPreviewTheme,
  writePreviewTheme,
  type PreviewTheme,
} from "../../../lib/preview/theme.ts";

export function PreviewThemeToggle() {
  const [theme, setTheme] = useState<PreviewTheme>("b");

  useEffect(() => {
    const storedTheme = readPreviewTheme(previewStorage());
    applyPreviewTheme(storedTheme);
    const animationFrame = window.requestAnimationFrame(() => {
      setTheme(storedTheme);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  function selectTheme(nextTheme: PreviewTheme) {
    applyPreviewTheme(nextTheme);
    setTheme(nextTheme);
    writePreviewTheme(previewStorage(), nextTheme);
  }

  return (
    <div className="preview-theme-toggle" role="group" aria-label="預覽主題">
      <span>Theme</span>
      <button
        aria-label="套用 Theme A"
        aria-pressed={theme === "a"}
        className="preview-theme-button"
        onClick={() => selectTheme("a")}
        type="button"
      >A</button>
      <button
        aria-label="套用 Theme B"
        aria-pressed={theme === "b"}
        className="preview-theme-button"
        onClick={() => selectTheme("b")}
        type="button"
      >B</button>
    </div>
  );
}

function applyPreviewTheme(theme: PreviewTheme) {
  const root = document.querySelector<HTMLElement>(".preview-root");
  if (root) root.dataset.previewTheme = theme;
}

function previewStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
