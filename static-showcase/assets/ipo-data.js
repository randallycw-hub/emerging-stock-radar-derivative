export async function loadIpoSnapshot({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(new URL("/api/ipo-events", location.origin), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.schemaVersion === 1 && Array.isArray(payload.records) ? payload : null;
}
