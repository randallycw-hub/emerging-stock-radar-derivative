# Published Snapshot Read Model

`readPublishedPublicSnapshot` is the server-side boundary for the formal public site. It reads the pointers for `94025`, `11406`, and `11586`, verifies that each pointer and target snapshot match the approved source/resource pair, then requires one shared `publicationRunId` and `publishedAt`. Records are read only from those exact snapshot IDs and cloned before returning.

If any required pointer is missing, points to an ineligible or invalid snapshot, has mismatched provenance, or fails to read, the result is `{ status: "unavailable", reasons }` with no partial `datasets` object. Callers must keep the existing public version or show an unavailable state; they must never substitute fixtures or live transport data.

The `28567` company-profile dataset is optional enrichment. It is attached only when its pointer is present, eligible, source-scoped, and aligned to the same publication run and timestamp. If it is missing or out of date, the public result remains published and reports `enrichmentStatus: "unavailable"`.
