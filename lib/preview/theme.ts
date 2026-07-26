export const PREVIEW_THEME_STORAGE_KEY = "xingzhai-preview-theme";

export type PreviewTheme = "a" | "b";

interface PreviewThemeReader {
  getItem(key: string): string | null;
}

interface PreviewThemeWriter {
  setItem(key: string, value: string): void;
}

export function readPreviewTheme(
  storage: PreviewThemeReader | undefined,
): PreviewTheme {
  if (!storage) return "b";
  try {
    return storage.getItem(PREVIEW_THEME_STORAGE_KEY) === "a" ? "a" : "b";
  } catch {
    return "b";
  }
}

export function writePreviewTheme(
  storage: PreviewThemeWriter | undefined,
  theme: PreviewTheme,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PREVIEW_THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}
