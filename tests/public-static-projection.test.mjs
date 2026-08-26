import assert from "node:assert/strict";
import test from "node:test";

import {
  projectPublicBondArtifacts,
  projectPublicIpoSnapshot,
} from "../scripts/stage-static-showcase.mjs";

test("public CB artifacts retain market facts but remove internal assessments and missing reasons", () => {
  const projected = projectPublicBondArtifacts({
    workbench: {
      schemaVersion: 1,
      generatedAt: "2026-08-26T01:19:21.783Z",
      dataDate: "2026-08-25",
      records: [{
        bondCode: "11011",
        status: "active",
        term: { bondCode: "11011", bondName: "公開樣本" },
        view: { bondCode: "11011", cbClose: "101", missingReasons: ["MISSING_TURNOVER_RATE"] },
        events: [{
          bondCode: "11011",
          eventId: "11406:maturity:2029-12-10",
          type: "maturity",
          date: "2029-12-10",
          title: "公開樣本到期日",
          sourceId: "11406",
          sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
        }],
        fieldStates: { price: "complete" },
        assessment: {
          dimensions: [{ state: "risk", checks: [{ sourceId: "approved_cb_history", missingReason: "MISSING_TURNOVER_RATE" }] }],
        },
      }],
    },
    views: [{ bondCode: "11011", cbClose: "101", missingReasons: ["MISSING_TURNOVER_RATE"] }],
    issuerResearch: {
      schemaVersion: 1,
      records: [],
      sources: {},
      diagnostics: [{ sourceId: "private-diagnostic" }],
    },
  });

  assert.deepEqual(projected.workbench.records[0], {
    bondCode: "11011",
    status: "active",
    term: { bondCode: "11011", bondName: "公開樣本" },
    view: { bondCode: "11011", cbClose: "101" },
    events: [{
      bondCode: "11011",
      eventId: "11406:maturity:2029-12-10",
      type: "maturity",
      date: "2029-12-10",
      title: "公開樣本到期日",
      sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    }],
    fieldStates: { price: "complete" },
  });
  assert.deepEqual(projected.views, [{ bondCode: "11011", cbClose: "101" }]);
  assert.deepEqual(projected.issuerResearch, {
    schemaVersion: 1,
    records: [],
    sources: {},
  });
  assert.doesNotMatch(JSON.stringify(projected), /approved_cb_history|MISSING_TURNOVER_RATE|sourceId|missingReasons|diagnostics/);
});

test("public IPO snapshot retains verified facts without source identifiers or raw record identities", () => {
  const projected = projectPublicIpoSnapshot({
    schemaVersion: 1,
    dataDate: "2026-08-26",
    sourceManifest: [{
      sourceId: "twse-auctions",
      sourceUrl: "https://www.twse.com.tw/announcement/auction?response=json&yy=2026",
    }],
    records: [{
      companyCode: "1234",
      auction: {
        bidStartDate: "2026-08-27",
        sourceRecordId: "TWSE:auction:1234:2026-08-27",
      },
      events: [{
        companyCode: "1234",
        date: "2026-08-27",
        label: "競拍投標開始",
        sourceRecordIds: ["TWSE:auction:1234:2026-08-27"],
      }],
    }],
  });

  assert.deepEqual(projected, {
    schemaVersion: 1,
    dataDate: "2026-08-26",
    records: [{
      companyCode: "1234",
      auction: { bidStartDate: "2026-08-27", verified: true },
      events: [{
        companyCode: "1234",
        date: "2026-08-27",
        label: "競拍投標開始",
        verified: true,
      }],
    }],
  });
  assert.doesNotMatch(JSON.stringify(projected), /sourceManifest|sourceId|sourceRecordId/);
});
