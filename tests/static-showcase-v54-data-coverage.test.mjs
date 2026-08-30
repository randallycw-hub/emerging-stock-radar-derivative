import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildCbWorkbenchV53 } from "../static-showcase/assets/cb-workbench-v53.js";
import { runV54DataAudit } from "../scripts/v54-data-audit.mjs";
import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const OFFICIAL_TERMS = "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv";
const OFFICIAL_REDEMPTION = "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=9000&date1=20260813&seq_no=1&pub_class=0&firstin=1";
const showcaseSource = fileURLToPath(new URL("../static-showcase/", import.meta.url));

function rawRecord() {
  return {
    bondCode: "90001",
    status: "active",
    term: {
      bondCode: "90001", issuerCode: "9000", bondName: "測試一", issuerName: "測試公司",
      issueDate: "2025-08-28", listingDate: "2025-08-28", maturityDate: "2028-08-28",
      issueAmount: "500000000", outstandingAmount: "400000000", outstandingDataDate: "2026-08-28",
      securedStatus: "2", putDates: ["2027-08-28"], putPrice: "100",
    },
    view: {
      bondCode: "90001", issuerCode: "9000", bondName: "測試一", cbPriceDate: "2026-08-28",
      cbClose: "110", cbTradeUnits: "20", stockPriceDate: "2026-08-28", stockClose: "120",
      currentConversionPrice: "100", conversionPriceEffectiveDate: "2026-07-01",
    },
    events: [{
      bondCode: "90001", eventId: "11406:listing:90001", type: "listing", date: "2025-08-28",
      title: "測試一掛牌日", sourceId: "11406", sourceUrl: OFFICIAL_TERMS,
    }],
  };
}

function buildModel({ supplemental } = {}) {
  const record = rawRecord();
  return buildCbWorkbenchV53({
    workbench: { schemaVersion: 1, dataDate: "2026-08-28", records: [record] },
    cbMaster: [{ bondCode: "90001", bondName: "測試一", stockCode: "9000", companyName: "測試公司", market: "上市" }],
    companyMaster: [{ stockCode: "9000", companyName: "測試公司", market: "上市", industry: "測試業" }],
    supplemental,
  });
}

test("V5.4 CB canonical record retains only published early-redemption facts and their official notice", () => {
  const model = buildModel({
    supplemental: {
      generatedAt: "2026-08-28T18:38:56.458Z",
      redemptions: [{
        issuerCode: "9000", issuerName: "測試公司", bondCode: "90001", bondName: "測試一",
        announcementDate: "2026-08-13", delistingDate: "2026-10-01",
        subject: "公告測試公司行使債券贖回權暨訂於115年10月01日終止櫃檯買賣。",
        detailUrl: OFFICIAL_REDEMPTION,
      }],
    },
  });

  assert.deepEqual(model.records[0].rights?.redemption ?? null, {
    eventId: "mops-redemption:90001:2026-08-13",
    state: "active",
    announcementDate: "2026-08-13",
    lastTradingDate: "2026-10-01",
    redemptionDate: null,
    redemptionPrice: null,
    outstandingBalance: null,
    sourceUrl: OFFICIAL_REDEMPTION,
    dataDate: "2026-08-28",
    summary: "公告測試公司行使債券贖回權暨訂於115年10月01日終止櫃檯買賣。",
  });
  assert.deepEqual(model.events.find((event) => event.eventId === "mops-redemption:90001:2026-08-13"), {
    eventId: "mops-redemption:90001:2026-08-13",
    cbCode: "90001",
    cbName: "測試一",
    stockCode: "9000",
    companyName: "測試公司",
    type: "redemption",
    label: "提前贖回",
    date: "2026-08-13",
    title: "公告測試公司行使債券贖回權暨訂於115年10月01日終止櫃檯買賣。",
    sourceUrl: OFFICIAL_REDEMPTION,
  });
});

test("V5.4 staging publishes one canonical CB model and one canonical event stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-v54-"));
  const destination = join(root, "dist", "client", "market-site");

  await stageStaticShowcase({ source: showcaseSource, destination });

  const current = JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8"));
  const runtime = JSON.parse(await readFile(
    join(destination, current.runtimeUrl.replace(/^\.\//, "")),
    "utf8",
  ));
  assert.equal(runtime.cbWorkbenchV54Url, `./data/${current.generation}/cb-workbench-v54.json`);
  assert.equal(runtime.canonicalEventsV54Url, `./data/${current.generation}/canonical-events-v54.json`);
});

test("V5.4 produces source lineage, coverage, and cross-page QA only in an internal audit directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-v54-audit-"));
  const output = join(root, "internal-audit");
  try {
    const report = await runV54DataAudit({ source: showcaseSource, output });
    assert.equal(report.qa.passed, true);
    const sourceRegistry = JSON.parse(await readFile(join(output, "source-registry.v54.json"), "utf8"));
    const coverage = JSON.parse(await readFile(join(output, "data-coverage-report.v54.json"), "utf8"));
    const qa = JSON.parse(await readFile(join(output, "qa-report.v54.json"), "utf8"));
    assert.equal(sourceRegistry.every((source) => source.tier === "A" && source.access === "public"), true);
    assert.equal(coverage.some((entry) => entry.dataset === "cb_early_redemption"), true);
    assert.equal(qa.passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
