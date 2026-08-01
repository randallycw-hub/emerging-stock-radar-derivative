import assert from "node:assert/strict";
import test from "node:test";

import {
  getApprovedIpoResource,
  listApprovedIpoResources,
} from "../../lib/pipeline/source-registry.ts";

const expected2026Resources = [
  ["twse-applications", "11586", "11586-csv", "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data", "text/csv"],
  ["tpex-applications", "tpex-applications", "tpex-applications-json", "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies", "application/json"],
  ["tpex-ipo-listings", "tpex-ipo-listings", "tpex-ipo-listings-json", "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit", "application/json"],
  ["twse-auctions", "twse-auctions", "twse-auctions-json", "https://www.twse.com.tw/announcement/auction?response=json&yy=2026", "application/json"],
  ["twse-public-offerings", "twse-public-offerings", "twse-public-offerings-json", "https://www.twse.com.tw/announcement/publicForm?response=json&yy=2026", "application/json"],
];

test("registry is the authoritative approval source for all five IPO resources", () => {
  const resources = listApprovedIpoResources(2026);

  assert.deepEqual(resources.map((resource) => [
    resource.ipoEventPolicy.manifestSourceId,
    resource.sourceId,
    resource.resourceId,
    resource.exactUrl,
    resource.allowedContentTypes[0],
  ]), expected2026Resources);
  assert.ok(resources.every((resource) => resource.approvalStatus === "APPROVED_FOR_PRODUCTION"));
  assert.ok(resources.every((resource) => resource.ipoEventPolicy.approvedPurpose === "ipo_events"));
});

test("11586 explicitly approves underwriter and note evidence for IPO events but not its price", () => {
  const resource = getApprovedIpoResource("twse-applications", 2026);

  assert.ok(resource.ipoEventPolicy.allowedFields.includes("underwriters"));
  assert.ok(resource.ipoEventPolicy.allowedFields.includes("note"));
  assert.equal(resource.ipoEventPolicy.allowedFields.includes("underwritingPrice"), false);
  assert.equal(resource.ipoEventPolicy.allowedFields.includes("chairmanName"), false);
});

test("annual TWSE IPO resources resolve to an exact four-digit year URL", () => {
  assert.equal(
    getApprovedIpoResource("twse-auctions", 2027).exactUrl,
    "https://www.twse.com.tw/announcement/auction?response=json&yy=2027",
  );
  assert.throws(() => getApprovedIpoResource("twse-auctions", 99), /IPO_RESOURCE_YEAR_INVALID/);
  assert.throws(() => getApprovedIpoResource("unknown", 2026), /IPO_RESOURCE_NOT_APPROVED/);
});
