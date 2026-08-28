# V5.1 Home Search Canonical Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver V5.1 searchable, data-backed home modules from one verified public canonical read model.

**Architecture:** Build `market-research.json` only after staging validates the active generation. A pure builder receives existing verified snapshots, preserves missing/stale/zero states, and emits public search entries and home modules. Static HTML and client code consume that same artifact; no financial definition changes.

**Tech Stack:** Node.js ES modules, existing verified JSON snapshots, static-site staging, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-v51-home-search-canonical-data-design.md` and `C:/Users/USER/Desktop/台灣盤後市場資訊台_V5.1_首頁資訊完整化_搜尋修復_官方資料源整合_Codex完整執行規格.pdf`.

## Global Constraints

- Use only repository-approved TWSE, TPEx, MOPS and TDCC sources.
- Do not hard-code companies, prices, events, rankings, timestamps or signals.
- Keep verified zero, `—`, `待公告`, `今日無成交`, stale data and fetch error distinct.
- Never mix data dates for CB valuation or CB-related stock moves.
- Strip internal IDs, diagnostics, missing reasons and personal data from public artifacts.

---

### Task 1: Build the public market research read model

**Files:**
- Create: `static-showcase/assets/public-market-research.js`
- Create: `tests/public-market-research.test.mjs`

**Interfaces:**
- `buildPublicMarketResearch({ manifest, emerging, ipo, workbench, stockCloses, history })` returns `{ schemaVersion, meta, searchIndex, home }`.
- `home` provides CB stock leaders, emerging rankings, CB turnover, issuance, official announcements, news state, IPO calendar and compact events.

- [x] Write a failing test with hand-built records proving that same-date CB leaders exist, stale daily CB data is not converted to zero, and `23031` has its canonical CB URL.
- [x] Run `node --test tests/public-market-research.test.mjs`; confirm failure because the builder is missing.
- [x] Implement pure projection helpers. Keep entries only when their input date satisfies the module contract. Derive weekly CB volume only by summing verified history points in one period.
- [x] Run the model and data-governance regression; confirm no internal metadata.

### Task 2: Stage the read model after source validation

**Files:**
- Modify: `scripts/stage-static-showcase.mjs`
- Create: `tests/static-showcase-v51-staging.test.mjs`

**Interfaces:**
- `writePublicMarketResearch({ destination, generation })` reads already public-projected artifacts and writes `data/<generation>/market-research.json`.
- Public clients derive the read-model URL from the verified generation pointer; the staged runtime format remains untouched.

- [x] Write a failing integration test that stages the site and reads `market-research.json`, expecting `meta.status === "ok"`, non-empty index, source URL metadata, and no `sourceId` or `missingReasons`.
- [x] Run `node --test tests/static-showcase-v51-staging.test.mjs`; confirm failure because artifact is absent.
- [x] Implement artifact writing after `writePublicStaticArtifacts`; preserve the immutable staged runtime and derive the artifact path from the verified generation.
- [x] Run the staging and refresh acceptance regression.

### Task 3: Repair P0 full-site search from the canonical index

**Files:**
- Modify: `static-showcase/assets/site-search.js`
- Create: `tests/static-showcase-v51-search.test.mjs`

**Interfaces:**
- `normalizePublicSearch(value)` uses NFKC, trim and uppercase.
- `searchCanonicalIndex(query, index)` prioritizes exact CB code, then exact stock code, then name matches.
- `loadSearchIndex()` produces a ready/error state rather than masking a failed fetch as an empty index.

- [x] Write failing tests for `3595`, `23031`, `聯電`, full-width `　２３０３ ` and unknown code.
- [x] Run `node --test tests/static-showcase-v51-search.test.mjs`; confirm existing code fails at full-width input and has no canonical-index function.
- [x] Replace client-side raw snapshot joining with staged index loading. Keep an explicit index-error state and existing keyboard/mobile interactions.
- [x] Run search and homepage-search regressions.

### Task 4: Render V5.1 home modules from the read model

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/home-static-fallback.js`
- Modify: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/static-showcase-v51-home.test.mjs`

**Interfaces:**
- `buildV51HomeStaticFallback(research)` outputs the three start cards, CB market cards, IPO calendar and compact event feed.
- Each module exposes a normal data state or a precise empty/error state plus a canonical route.

- [x] Write a failing staged-home test for the V5.1 start cards, CB cards and no loading/internal-state wording.
- [x] Confirm RED because V5.1 containers did not yet exist.
- [x] Add semantic containers and compact responsive renderers. Static staging injects the model; client JavaScript only adds ranking-tab interaction.
- [x] Run homepage, staging, accessibility and density regressions.

### Task 5: Record baseline, sources and data-governance QA

**Files:**
- Create: `docs/baselines/2026-08-28-v51-pre-change.md`
- Modify: `static-showcase/methodology.html`
- Create: `tests/static-showcase-v51-governance.test.mjs`
- Create: `docs/ux-v51-final-audit.md`

- [x] Record 10 emerging rows, 10 CB rows, 10 IPO rows, 2026-08-26 metadata and the pre-change full-width search result.
- [x] Assert that no verified CB day points has no fake rows while a true zero stays distinct.
- [x] Add only actual source URLs and public field definitions to methodology. State that market news stays separate until a permitted feed exists.
- [x] Run the V5.1 governance and public-projection regression.

### Task 6: Verify, audit and publish

**Files:**
- Modify: `docs/superpowers/plans/2026-08-28-v51-home-search-canonical-data.md`
- Modify: `docs/ux-v51-final-audit.md`

- [x] Run final targeted V5.1 regression and static artifact inspection.
- [x] Run `npm run lint`, `npm run typecheck`, `npm test`, and `git diff --check`.
- [ ] Commit the verified implementation, push that exact commit to the existing Sites source, package the successful build, save a site version and poll its production deployment to success.
