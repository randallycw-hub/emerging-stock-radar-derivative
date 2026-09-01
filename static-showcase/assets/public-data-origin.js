export const PUBLIC_DATA_SITE_ROOT = new URL(
  "https://raw.githubusercontent.com/randallycw-hub/emerging-stock-radar-derivative/main/static-showcase/",
);

export const PUBLIC_DATA_POINTER_URL = new URL("data/current.json", PUBLIC_DATA_SITE_ROOT);

function isApprovedPublishedDataUrl(url) {
  return url.origin === PUBLIC_DATA_SITE_ROOT.origin
    && url.pathname.startsWith("/randallycw-hub/emerging-stock-radar-derivative/main/static-showcase/data/");
}

/**
 * Resolves published generation references without allowing a data pointer to
 * redirect the public site to an arbitrary origin or repository path.
 */
export function resolvePublishedDataUrl(reference, baseUrl) {
  if (typeof reference !== "string" || typeof baseUrl !== "string" && !(baseUrl instanceof URL)) return null;
  try {
    const base = new URL(baseUrl);
    if (!reference.startsWith("./data/")) {
      return isApprovedPublishedDataUrl(base) ? null : new URL(reference, base);
    }
    const siteRoot = isApprovedPublishedDataUrl(base)
      ? PUBLIC_DATA_SITE_ROOT
      : base.pathname.endsWith("/data/current.json")
        ? new URL("../", base)
        : new URL("./", base);
    const resolved = new URL(reference.slice(2), siteRoot);
    return isApprovedPublishedDataUrl(base)
      ? isApprovedPublishedDataUrl(resolved) ? resolved : null
      : resolved;
  } catch {
    return null;
  }
}

export function configuredPublishedPointerUrl(config, fallback) {
  const configured = config?.generationPointerUrl;
  if (typeof configured === "string" && configured) {
    try {
      const url = new URL(configured, fallback ?? PUBLIC_DATA_POINTER_URL);
      if (isApprovedPublishedDataUrl(url)) return url;
    } catch {}
  }
  if (fallback) {
    try {
      return new URL(fallback);
    } catch {}
  }
  return PUBLIC_DATA_POINTER_URL;
}
