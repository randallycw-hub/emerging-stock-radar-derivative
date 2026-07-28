# Ingestion and Publication Lifecycle

1. An approved source adapter fetches one exact registry resource, parses it, normalizes the reviewed domain contract, and reports integrity diagnostics.
2. `ingestDataset` persists the run, immutable snapshot metadata, and typed dataset records. Re-running the same response hash is idempotent at the snapshot boundary; a different response creates a new snapshot and never overwrites the old one.
3. The public gate considers only the three public datasets: emerging-company monthly revenue (`94025`), convertible bonds (`11406`), and listing applications (`11586`). Company profiles (`28567`) remain an enrichment source for later read models.
4. The gate validates snapshot eligibility and source/resource isolation, computes each pointer's expected current snapshot, and atomically updates all three pointers. The previous pointer remains the fallback only as the prior published version; no raw adapter data or fixture is used as a fallback.
5. A failed fetch, parse, normalization, integrity check, missing dataset, or compare-and-set conflict produces an explicit unpublished decision. The website must continue reading the last complete published set until a new complete set succeeds.

The orchestration layer does not schedule jobs, expose APIs, create D1 bindings, or render UI. Those are separate follow-on boundaries.
