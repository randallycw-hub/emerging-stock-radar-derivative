# V5.5 CB Rights Event Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make official CB rights events visible, actionable, and consistent across the public site from one verified canonical dataset.

**Architecture:** A server-side rights-event snapshot enriches TPEx redemption discovery rows with strictly validated MOPS details and retains last-known-good data. A V5.5 canonical builder then projects that snapshot plus existing official term and conversion sources into one normalized stream consumed by homepage, market events, CB calendar, detail pages, and search.

**Tech Stack:** Node.js ESM, TypeScript data parsers, static HTML/CSS/JavaScript, Node test runner, Vinext staging pipeline.

**Spec:** docs/superpowers/specs/2026-08-30-v55-cb-rights-event-delivery-design.md

## Global Constraints

- Preserve V5.2 search/data correctness and V5.3/V5.4 CB workbench baselines; do not reintroduce technical-analysis or K-line claims.
- Use TPEx/MOPS official sources for event facts. Dynamic MOPS URLs must pass strict HTTPS, host, pathname and query validation.
- Unknown official values remain null and render as — or 待公布. Never use value || 0 or Number(value) || 0.
- Run process-heavy checks with at most two test workers. Detail collection remains capped at one request at a time.
- Do not render raw source IDs, raw hashes, missing reasons, source state internals or data-health diagnostics in public HTML.

---

### Task 1: Official redemption detail parser and recoverable snapshot

**Files:**
- Create: lib/source-verification/source-cb-rights-event.ts
- Create: lib/market-data/cb-rights-events.ts
- Modify: scripts/lib/official-market-fetch.mjs
- Modify: scripts/build-bond-market-snapshot.mjs
- Test: tests/source-verification/cb-rights-event.test.mjs
- Test: tests/cb-rights-events.test.mjs

**Interfaces:**
- Consumes: a validated CbRedemptionEvent discovery row and HTML at its exact MOPS detail URL.
- Produces: parseCbRedemptionDetail(html, discovery, fetchedAt) and buildCbRightsEventSnapshot({ generatedAt, dataDate, current, previous }).

- [ ] **Step 1: Write failing parser and snapshot tests**

~~~js
test('parses official redemption dates, price, reason and stable source identity', () => {
  const event = parseCbRedemptionDetail(detailHtml, discovery, '2026-08-30T00:00:00.000Z');
  assert.deepEqual(pick(event, ['acceptStartDate', 'acceptEndDate', 'recordDate', 'lastTradingDate', 'lastConversionDate', 'redemptionPrice']), {
    acceptStartDate: '2026-09-01', acceptEndDate: '2026-09-30', recordDate: '2026-09-30',
    lastTradingDate: '2026-10-01', lastConversionDate: '2026-10-02', redemptionPrice: 100000,
  });
});

test('retains last-known-good events when detail collection is unavailable', () => {
  const snapshot = buildCbRightsEventSnapshot({ generatedAt: '2026-08-31T00:00:00.000Z', dataDate: '2026-08-30', previous, current: undefined });
  assert.equal(snapshot.source.state, 'stale');
  assert.equal(snapshot.events.length, 1);
});
~~~

- [ ] **Step 2: Run tests and confirm the desired missing-export failure**

Run: node --test --test-concurrency=2 tests/source-verification/cb-rights-event.test.mjs tests/cb-rights-events.test.mjs

Expected: FAIL because the V5.5 parser and snapshot exports do not exist.

- [ ] **Step 3: Implement the minimal validated parser, sequential detail fetch and snapshot**

~~~ts
export function parseCbRedemptionDetail(html: string, discovery: CbRedemptionEvent, fetchedAt: string): CbRightsEvent {
  assertApprovedRedemptionDetailUrl(discovery.detailUrl);
  const text = htmlToText(html);
  return validateCbRightsEvent({
    eventId: stableEventId(discovery), eventType: 'early_redemption',
    announcementDate: discovery.announcementDate,
    acceptStartDate: readOfficialRange(text)?.start ?? null,
    acceptEndDate: readOfficialRange(text)?.end ?? null,
    recordDate: readOfficialDate(text, '收回基準日'),
    lastTradingDate: readOfficialDate(text, '終止櫃檯買賣日期') ?? discovery.delistingDate,
    lastConversionDate: readLastConversionDeadline(text),
    redemptionPrice: readRedemptionPrice(text), sourceUrl: discovery.detailUrl,
    rawTextHash: sha256(text), fetchedAt,
  });
}
~~~

The fetch layer rejects redirects, caps response size, accepts only discovery-derived MOPS detail URLs, and returns a rejected settled result when any detail validation fails. The snapshot builder reuses the prior valid whole snapshot in that case.

- [ ] **Step 4: Run focused tests**

Run: node --test --test-concurrency=2 tests/source-verification/cb-rights-event.test.mjs tests/cb-rights-events.test.mjs

Expected: PASS with parser validation, detail extraction and fallback all green.

- [ ] **Step 5: Commit the parser/snapshot slice**

~~~bash
git add lib/source-verification/source-cb-rights-event.ts lib/market-data/cb-rights-events.ts scripts/lib/official-market-fetch.mjs scripts/build-bond-market-snapshot.mjs tests/source-verification/cb-rights-event.test.mjs tests/cb-rights-events.test.mjs
git commit -m "feat: capture official CB rights-event details"
~~~

### Task 2: V5.5 canonical data, status machine and staged artifacts

**Files:**
- Create: static-showcase/assets/v55-canonical-data.js
- Modify: scripts/stage-static-showcase.mjs
- Modify: scripts/v54-data-audit.mjs
- Test: tests/static-showcase-v55-cb-events.test.mjs
- Test: tests/stage-static-showcase.test.mjs

**Interfaces:**
- Consumes: V5.4 records/events and cb-rights-events.json.
- Produces: buildV55CanonicalData(input), classifyCbEventStatus(event, asOfDate), canonical-events-v55.json, cb-workbench-v55.json and V5.5 runtime URLs.

- [ ] **Step 1: Write failing status-machine and staging tests**

~~~js
test('classifies a three-day conversion deadline as deadline_soon', () => {
  assert.equal(classifyCbEventStatus({
    announcementDate: '2026-08-13', acceptStartDate: '2026-09-01',
    acceptEndDate: '2026-09-30', lastConversionDate: '2026-09-02',
  }, '2026-08-30'), 'deadline_soon');
});

test('staging emits a V5.5 stream and active-event search badge', async () => {
  const runtime = await stageFixture();
  assert.match(runtime.canonicalEventsV55Url, /canonical-events-v55\.json$/);
  assert.equal(searchEntry.eventBadge, '強制贖回');
});
~~~

- [ ] **Step 2: Run tests and confirm missing V5.5 behavior**

Run: node --test --test-concurrency=2 tests/static-showcase-v55-cb-events.test.mjs tests/stage-static-showcase.test.mjs

Expected: FAIL with a missing V5.5 builder or runtime artifact.

- [ ] **Step 3: Implement canonical normalization**

~~~js
export function buildV55CanonicalData({ v54, rightsSnapshot }) {
  const retained = v54.events.filter((event) => event.eventType !== 'cb_early_redemption');
  const detailed = rightsSnapshot.events.map((event) => projectOfficialRightsEvent(event, v54.dataDate));
  return validateV55CanonicalData({
    schemaVersion: 2, dataDate: v54.dataDate, records: v54.records,
    events: dedupe([...retained, ...detailed]),
  });
}
~~~

Project listing, put, maturity and conversion price data into the same V5.5 shape. Include semantic dates, status, source URL, source state, stable ID and typed detail values. Enrich the staged search index only with active or deadline-soon event badges.

- [ ] **Step 4: Run focused tests and inspect generated artifacts**

Run: node --test --test-concurrency=2 tests/static-showcase-v55-cb-events.test.mjs tests/stage-static-showcase.test.mjs

Expected: PASS; runtime points to V5.5 artifacts and unknown values are not converted to zero.

- [ ] **Step 5: Commit the canonical slice**

~~~bash
git add static-showcase/assets/v55-canonical-data.js scripts/stage-static-showcase.mjs scripts/v54-data-audit.mjs tests/static-showcase-v55-cb-events.test.mjs tests/stage-static-showcase.test.mjs
git commit -m "feat: build V5.5 canonical CB rights events"
~~~

### Task 3: Public event surfaces and search integration

**Files:**
- Create: static-showcase/assets/cb-rights-event-ui.js
- Modify: static-showcase/index.html
- Modify: static-showcase/assets/home-page.js
- Modify: static-showcase/events.html
- Modify: static-showcase/assets/market-event-model.js
- Modify: static-showcase/assets/market-events-page.js
- Modify: static-showcase/bonds-events.html
- Modify: static-showcase/assets/bond-events-page.js
- Modify: static-showcase/assets/bond-public-data.js
- Modify: static-showcase/assets/bonds-page.js
- Modify: static-showcase/assets/cb-detail-v53.js
- Modify: static-showcase/assets/site-search.js
- Modify: static-showcase/assets/app.css
- Test: tests/static-showcase-v55-cb-ui.test.mjs
- Test: tests/market-event-model.test.mjs
- Test: tests/cb-workbench-acceptance.test.mjs

**Interfaces:**
- Consumes: canonical-events-v55.json and V5.5 CB/search records.
- Produces: projectPublicCbRightsEvent, renderCbRightsAlert, home cards, calendar rows, market rows and search eventBadge.

- [ ] **Step 1: Write failing public-surface tests**

~~~js
test('renders a redemption row with labelled dates, status, price and official link', () => {
  const html = renderCbRightsEvent(event);
  assert.match(html, /公告日.*2026\/08\/13/);
  assert.match(html, /收回價格.*100,000/);
  assert.match(html, /官方公告/);
});

test('keeps completed events out of default upcoming and in history', () => {
  assert.equal(filterV55CbEvents(events, { asOfDate: '2026-08-30', period: '30' }).some((event) => event.status === 'completed'), false);
  assert.equal(filterV55CbEvents(events, { asOfDate: '2026-08-30', period: 'history' }).some((event) => event.status === 'completed'), true);
});
~~~

- [ ] **Step 2: Run tests and confirm missing renderer/filter behavior**

Run: node --test --test-concurrency=2 tests/static-showcase-v55-cb-ui.test.mjs tests/market-event-model.test.mjs tests/cb-workbench-acceptance.test.mjs

Expected: FAIL because V5.5 public renderers and history/status controls do not exist.

- [ ] **Step 3: Implement one shared public event presenter and wire all surfaces**

~~~js
export function projectPublicCbRightsEvent(event, asOfDate) {
  return {
    id: event.eventId, typeLabel: EVENT_LABELS[event.eventType], status: event.status,
    primaryDate: selectPrimaryDate(event), primaryDateLabel: selectPrimaryDateLabel(event),
    facts: visibleFacts(event), sourceUrl: approvedOfficialUrl(event.sourceUrl),
  };
}
~~~

The detail view places a compact amber/red alert before quote cards only for active/deadline-soon events. Calendar and market center reuse the same IDs, labels, dates, statuses and links. The homepage shows — rather than 0 for unavailable sources. Search appends a badge only for active/deadline-soon events. Escape every displayed value and use allowlisted external links with noopener noreferrer.

- [ ] **Step 4: Run focused UI tests**

Run: node --test --test-concurrency=2 tests/static-showcase-v55-cb-ui.test.mjs tests/market-event-model.test.mjs tests/cb-workbench-acceptance.test.mjs

Expected: PASS; public HTML excludes raw IDs, hashes, missing reasons and internal diagnostics.

- [ ] **Step 5: Commit the public surface slice**

~~~bash
git add static-showcase/index.html static-showcase/events.html static-showcase/bonds-events.html static-showcase/assets/cb-rights-event-ui.js static-showcase/assets/home-page.js static-showcase/assets/market-event-model.js static-showcase/assets/market-events-page.js static-showcase/assets/bond-events-page.js static-showcase/assets/bond-public-data.js static-showcase/assets/bonds-page.js static-showcase/assets/cb-detail-v53.js static-showcase/assets/site-search.js static-showcase/assets/app.css tests/static-showcase-v55-cb-ui.test.mjs tests/market-event-model.test.mjs tests/cb-workbench-acceptance.test.mjs
git commit -m "feat: show CB rights events across public pages"
~~~

### Task 4: Official refresh, V5.5 QA and public acceptance evidence

**Files:**
- Create: scripts/v55-rights-event-qa.mjs
- Create: docs/v55-rights-event-baseline.md
- Modify: package.json
- Modify: docs/testing-and-acceptance-plan.md
- Test: tests/v55-rights-event-qa.test.mjs

**Interfaces:**
- Consumes: staged V5.5 canonical event data.
- Produces: a private 20-CB QA report, fixed-date cross-page assertions and stored Before/After screenshots outside public assets.

- [ ] **Step 1: Write a failing QA test**

~~~js
test('reports twenty CB samples with official sources and no cross-page failures', () => {
  const report = auditV55RightsEvents(canonical);
  assert.equal(report.samples.length, 20);
  assert.equal(report.failures.length, 0);
});
~~~

- [ ] **Step 2: Run the QA test and confirm the audit is absent**

Run: node --test --test-concurrency=2 tests/v55-rights-event-qa.test.mjs

Expected: FAIL because the V5.5 audit entrypoint does not exist.

- [ ] **Step 3: Implement private QA and regenerate official data**

~~~js
export function auditV55RightsEvents(canonical) {
  const samples = selectTwentyDistinctCbSamples(canonical.events);
  return { samples, failures: validateCrossPageEventIdentity(samples, canonical) };
}
~~~

Run the official refresh through the existing source-lock and atomic staging path. Then run build, lint, the full two-worker test suite, V5.4/V5.5 audits and public artifact scans. Keep reports and screenshots outside the public artifact.

- [ ] **Step 4: Verify desktop and 390px public views**

Check homepage CB events, market-event CB filter, CB calendar, one active redemption alert and a CB search badge. Record Before/After evidence outside static-showcase and ensure each tested page has no horizontal overflow at 390px.

- [ ] **Step 5: Commit V5.5 QA and documentation**

~~~bash
git add scripts/v55-rights-event-qa.mjs docs/v55-rights-event-baseline.md docs/testing-and-acceptance-plan.md package.json tests/v55-rights-event-qa.test.mjs
git commit -m "test: verify V5.5 CB rights-event delivery"
~~~

