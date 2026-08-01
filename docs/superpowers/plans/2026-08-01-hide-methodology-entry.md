# Hide Methodology Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every public discovery entry for the methodology page while preserving both direct methodology URLs and all methodology content.

**Architecture:** Treat methodology as an unlisted support page. Static formal pages and legacy application navigation stop linking to it, while the route files remain intact. Tests enforce both halves of the contract: no public discovery links and direct-page preservation.

**Tech Stack:** Static HTML/CSS, Next.js 16, React 19, Node.js test runner, TypeScript, Vinext/Sites.

## Global Constraints

- Keep `static-showcase/methodology.html` and `app/methodology/page.tsx` available.
- Do not change data snapshots, market calculations, filters, sorting, colors, or page content unrelated to methodology discovery.
- Keep CPU-intensive commands at no more than 2 threads through `UV_THREADPOOL_SIZE=2`.
- Publish only after recursive tests, lint, typecheck, build, independent review, and external verification succeed.

---

### Task 1: Lock the unlisted-page contract with failing tests

**Files:**
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/public-homepage.test.mjs`
- Create: `tests/methodology-entry-visibility.test.mjs`

**Interfaces:**
- Consumes: existing HTML and TSX files as real artifacts.
- Produces: a test contract that public navigation has no methodology link while direct methodology files remain.

- [ ] **Step 1: Write failing tests**

Add assertions that `index.html`, `bonds.html`, `emerging.html`, `ipo.html`, `Homepage.tsx`, `Dashboard.tsx`, and `LegalPage.tsx` contain no `href` to methodology. Assert the static and Next methodology source files still exist and retain their headings/formulas. Assert `app/sitemap.ts` does not emit `/methodology`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test tests/static-showcase-pages.test.mjs tests/static-showcase-bond-ui.test.mjs tests/public-homepage.test.mjs tests/methodology-entry-visibility.test.mjs
```

Expected: FAIL because current public HTML and React navigation still link to methodology.

### Task 2: Remove static formal-site discovery entries

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/methodology.html`

**Interfaces:**
- Consumes: the public navigation and footer markup.
- Produces: four-item global navigation and a three-module homepage, with methodology still directly readable.

- [ ] **Step 1: Implement minimal static HTML changes**

Remove the methodology navigation anchor from all five files, delete only the methodology home module, and replace linked footer wording with the existing plain investment disclaimer.

- [ ] **Step 2: Run static tests and verify GREEN**

Run:

```powershell
node --test tests/static-showcase-pages.test.mjs tests/static-showcase-bond-ui.test.mjs tests/methodology-entry-visibility.test.mjs
```

Expected: PASS.

### Task 3: Remove legacy application discovery entries

**Files:**
- Modify: `app/Homepage.tsx`
- Modify: `app/Dashboard.tsx`
- Modify: `app/LegalPage.tsx`
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: existing Next.js `Link` navigation and sitemap entries.
- Produces: no discoverable methodology link outside the preserved methodology route itself.

- [ ] **Step 1: Implement minimal React and sitemap changes**

Remove only `Link` elements targeting `/methodology`, replace the Homepage primary action with a direct market/radar action, remove the source-note methodology link, and delete the sitemap methodology record.

- [ ] **Step 2: Run application tests and verify GREEN**

Run:

```powershell
node --test tests/public-homepage.test.mjs tests/methodology-entry-visibility.test.mjs
```

Expected: PASS.

### Task 4: Verify and publish the exact version

**Files:**
- Modify only if verification finds an in-scope regression.

**Interfaces:**
- Consumes: completed source state.
- Produces: validated Sites deployment at the existing public URL.

- [ ] **Step 1: Run full verification**

Run recursive tests, lint, typecheck, `git diff --check`, and `npm run build` with `UV_THREADPOOL_SIZE=2`. Expected: zero failures and a staged `dist/client/market-site` containing the preserved methodology page but no public links to it.

- [ ] **Step 2: Commit and independently review**

Commit the exact validated files and request a blocker-only review focused on accidental route deletion or remaining discovery links.

- [ ] **Step 3: Publish and externally verify**

Push the exact commit, package its build, save and deploy one Sites version, then verify the root URL returns the formal site and the public HTML no longer includes a methodology entry.
