import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import { auditV55RightsEvents } from "../scripts/v55-rights-event-qa.mjs";

const execFileAsync = promisify(execFile);

const officialUrl = "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3167&date1=20260813&seq_no=1&pub_class=0&firstin=1";

function event(overrides = {}) {
  return {
    eventId: "mops-redemption:31672:2026-08-13:1",
    eventType: "early_redemption",
    marketScope: "cb",
    cbCode: "31672",
    companyName: "大量",
    cbName: "大量二",
    announcementDate: "2026-08-13",
    deadlineDate: "2026-09-30",
    status: "upcoming",
    sourceUrl: officialUrl,
    eventDetails: {
      acceptanceStartDate: "2026-09-01",
      acceptanceEndDate: "2026-09-30",
    },
    ...overrides,
  };
}

test("V5.5 rights-event QA verifies canonical identity, official links, and public-field boundary", () => {
  const result = auditV55RightsEvents({
    canonical: { dataDate: "2026-08-28", records: [event()] },
    rightsSnapshot: { events: [{ eventId: "mops-redemption:31672:2026-08-13:1", bondCode: "31672" }] },
    minimumSampleSize: 1,
  });

  assert.equal(result.passed, true);
  assert.equal(result.sampledCbCodes.length, 1);
  assert.equal(result.richEventCount, 1);
});

test("V5.5 rights-event QA rejects a public internal source field", () => {
  assert.throws(
    () => auditV55RightsEvents({
      canonical: { dataDate: "2026-08-28", records: [event({ rawSourceId: "private" })] },
      rightsSnapshot: { events: [{ eventId: "mops-redemption:31672:2026-08-13:1", bondCode: "31672" }] },
      minimumSampleSize: 1,
    }),
    /internal field/i,
  );
});

test("V5.5 rights-event QA runs when invoked as a Windows Node script", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/v55-rights-event-qa.mjs", "missing-v55-artifacts"]),
    /ENOENT|no such file/i,
  );
});
