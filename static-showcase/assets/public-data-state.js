/** Converts only an explicitly published numeric field; null and blank stay absent. */
export function publicNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A public aggregate is unavailable when any constituent value is unpublished. */
export function sumPublishedValues(records, readValue) {
  const values = (Array.isArray(records) ? records : []).map((record) => publicNumber(readValue(record)));
  if (values.some((value) => value === null)) return null;
  return values.reduce((total, value) => total + value, 0);
}

/** Count is unavailable when the data source has not published every input value. */
export function countPublishedPositive(records, readValue) {
  const values = (Array.isArray(records) ? records : []).map((record) => publicNumber(readValue(record)));
  if (values.some((value) => value === null)) return null;
  return values.filter((value) => value > 0).length;
}
