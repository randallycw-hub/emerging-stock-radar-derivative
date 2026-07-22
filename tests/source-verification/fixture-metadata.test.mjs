import assert from "node:assert/strict";
import test from "node:test";

import {
  FixtureIntegrityError,
  parseFixtureMetadata,
  sha256Hex,
  verifyFixtureContent,
  verifyFixtureIntegrity,
} from "../../lib/source-verification/fixture-metadata.ts";
import { getParsedCsvHeaders, parseCsv } from "../../lib/source-verification/csv.ts";
import {
  InMemoryVerificationEvidenceRepository,
} from "../../lib/source-verification/evidence-repository.ts";

const sha256 = `sha256:${"a".repeat(64)}`;

function validMetadata() {
  return {
    sourceId: "data-gov-11406",
    datasetId: "11406",
    datasetName: "轉(交)換債發行資料下載",
    resourceRole: "csv",
    resourceUrl: "https://data.gov.tw/dataset/11406/resource.csv",
    fetchedAt: "2026-07-22T01:02:03Z",
    httpContentType: "text/csv; charset=utf-8",
    sourceResponseSha256: sha256,
    fixtureSha256: sha256,
    sourceRowCount: 2,
    fixtureRowCount: 1,
    licenseName: "政府資料開放授權條款－第1版",
    providerName: "金融監督管理委員會",
    manuallyReviewed: true,
    privacyReview: {
      containsPersonalData: false,
      excludedFields: ["承銷價"],
      minimized: true,
      deidentified: false,
      rationale: "僅保留本測試所需的非個人資料欄位。",
    },
    samplingMethod: "保留一列以驗證 UTF-8 CSV 欄位解析。",
  };
}

test("fixture metadata requires provenance, minimization, privacy review and two hashes", () => {
  const value = validMetadata();
  assert.equal(parseFixtureMetadata(value).datasetId, "11406");
  for (const key of ["sourceId", "datasetId", "datasetName", "resourceRole", "resourceUrl", "fetchedAt", "httpContentType", "sourceResponseSha256", "fixtureSha256", "sourceRowCount", "fixtureRowCount", "licenseName", "providerName", "manuallyReviewed", "privacyReview", "samplingMethod"]) {
    const invalid = structuredClone(value);
    delete invalid[key];
    assert.throws(() => parseFixtureMetadata(invalid), new RegExp(key));
  }
});

test("fixture metadata rejects unapproved, non-minimal, unsafe, or internally inconsistent values", () => {
  const invalidValues = [
    [{ unknown: true }, /unknown key/],
    [{ sourceId: "" }, /sourceId/],
    [{ datasetId: "28568" }, /datasetId/],
    [{ resourceUrl: "http://data.gov.tw/resource.csv" }, /resourceUrl/],
    [{ fetchedAt: "2026-07-22T09:02:03+08:00" }, /fetchedAt/],
    [{ fetchedAt: "not-a-date" }, /fetchedAt/],
    [{ sourceResponseSha256: "sha256:UPPER" }, /sourceResponseSha256/],
    [{ fixtureSha256: "sha256:short" }, /fixtureSha256/],
    [{ sourceRowCount: -1 }, /sourceRowCount/],
    [{ sourceRowCount: 1.5 }, /sourceRowCount/],
    [{ fixtureRowCount: 3 }, /fixtureRowCount/],
    [{ licenseName: "other" }, /licenseName/],
    [{ manuallyReviewed: false }, /manuallyReviewed/],
    [{ samplingMethod: "  " }, /samplingMethod/],
    [{ privacyReview: { ...validMetadata().privacyReview, rationale: " " } }, /privacyReview.rationale/],
    [{ privacyReview: { ...validMetadata().privacyReview, minimized: false } }, /privacyReview.minimized/],
    [{ privacyReview: { ...validMetadata().privacyReview, containsPersonalData: false, deidentified: true } }, /privacyReview.deidentified/],
  ];

  for (const [patch, expected] of invalidValues) {
    assert.throws(() => parseFixtureMetadata({ ...validMetadata(), ...patch }), expected);
  }
});

test("fixture integrity requires matching bytes, row count, approval, and minimization", () => {
  const bytes = new TextEncoder().encode("代號,名稱\n1234,測試\n");
  const metadata = parseFixtureMetadata({
    ...validMetadata(),
    fixtureSha256: sha256Hex(bytes),
  });
  assert.doesNotThrow(() => verifyFixtureIntegrity(metadata, bytes, 1));
  assert.throws(
    () => verifyFixtureIntegrity({ ...metadata, fixtureSha256: sha256 }, bytes, 1),
    FixtureIntegrityError,
  );
  assert.throws(() => verifyFixtureIntegrity(metadata, bytes, 2), /fixtureRowCount mismatch/);
  assert.throws(
    () => verifyFixtureIntegrity({ ...metadata, manuallyReviewed: false }, bytes, 1),
    /manuallyReviewed must be true/,
  );
  assert.throws(
    () => verifyFixtureIntegrity({ ...metadata, privacyReview: { ...metadata.privacyReview, minimized: false } }, bytes, 1),
    /privacyReview.minimized must be true/,
  );
});

test("production runtime rejects parsing and verifying fixtures", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const bytes = new TextEncoder().encode("代號\n1234\n");
  const metadata = parseFixtureMetadata({
    ...validMetadata(),
    fixtureSha256: sha256Hex(bytes),
  });

  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => parseFixtureMetadata(validMetadata()), /production runtime/);
    assert.throws(() => verifyFixtureIntegrity(metadata, bytes, 1), /production runtime/);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("fixture content allows only approved fields and excludes declared sensitive fields", () => {
  const metadata = parseFixtureMetadata(validMetadata());
  assert.doesNotThrow(() => verifyFixtureContent(
    metadata,
    parseCsv("代號,名稱\n1234,測試\n"),
    ["代號", "名稱"],
  ));
  assert.throws(
    () => verifyFixtureContent(metadata, parseCsv("代號,承銷價\n1234,1\n"), ["代號"]),
    /unapproved header: 承銷價/,
  );
  assert.throws(
    () => verifyFixtureContent(
      metadata,
      parseCsv("代號,承銷價\n1234,1\n"),
      ["代號", "承銷價"],
    ),
    /excluded field: 承銷價/,
  );
  assert.throws(
    () => verifyFixtureContent(
      parseFixtureMetadata({
        ...validMetadata(),
        privacyReview: { ...validMetadata().privacyReview, excludedFields: ["姓名"] },
      }),
      parseCsv("代號,姓名\n1234,王小明\n"),
      ["代號", "姓名"],
    ),
    /excluded field: 姓名/,
  );
});

test("fixture content rejects an excluded CSV header even without data rows", () => {
  assert.throws(
    () => verifyFixtureContent(
      parseFixtureMetadata(validMetadata()),
      parseCsv("承銷價\n"),
      ["承銷價"],
    ),
    /excluded field: 承銷價/,
  );
});

test("fixture content fails closed for cloned header-only CSV rows without trusted headers", () => {
  const metadata = parseFixtureMetadata({
    ...validMetadata(),
    privacyReview: { ...validMetadata().privacyReview, excludedFields: ["sensitive"] },
  });
  const clonedRows = structuredClone(parseCsv("sensitive\n"));

  assert.throws(
    () => verifyFixtureContent(metadata, clonedRows, ["id"]),
    /trusted CSV headers/,
  );
});

test("parsed CSV header reads cannot mutate trusted headers", () => {
  const metadata = parseFixtureMetadata({
    ...validMetadata(),
    privacyReview: { ...validMetadata().privacyReview, excludedFields: ["sensitive"] },
  });
  const rows = parseCsv("sensitive\n");
  const headers = getParsedCsvHeaders(rows);
  headers[0] = "id";

  assert.throws(
    () => verifyFixtureContent(metadata, rows, ["id"]),
    /unapproved header: sensitive/,
  );
});

test("CSV parser handles BOM, quoted commas, escaped quotes, and CRLF", () => {
  assert.deepEqual(
    parseCsv("\uFEFF代號,名稱,備註\r\n1234,\"甲,乙\",\"說\"\"明\"\"\"\r\n"),
    [{ 代號: "1234", 名稱: "甲,乙", 備註: "說\"明\"" }],
  );
});

test("CSV parser rejects malformed headers and rows", () => {
  assert.throws(() => parseCsv("代號,代號\n1,2"), /duplicate header/);
  assert.throws(() => parseCsv("代號, \n1,2"), /blank header/);
  assert.throws(() => parseCsv("代號,名稱\n1"), /column count/);
  assert.throws(() => parseCsv("代號,名稱\n1,\"未結束"), /unclosed quote/);
  assert.deepEqual(parseCsv("代號,名稱\n1,甲\n\n"), [{ 代號: "1", 名稱: "甲" }]);
  assert.deepEqual(parseCsv("id\n1234\n\n"), [{ id: "1234" }]);
});

test("in-memory repository replaces evidence only by sourceId and returns defensive copies", async () => {
  const repo = new InMemoryVerificationEvidenceRepository();
  const evidence = {
    sourceId: "data-gov-11406",
    datasetId: "11406",
    checks: [{ id: "HASH", passed: true, evidencePath: "evidence/hash.txt", note: "verified" }],
  };
  await repo.save(evidence);
  evidence.datasetId = "mutated";
  evidence.checks[0].note = "mutated";
  assert.equal((await repo.get("data-gov-11406"))?.datasetId, "11406");
  assert.equal((await repo.get("data-gov-11406"))?.checks[0].note, "verified");
  assert.equal((await repo.list()).length, 1);
  const fetched = await repo.get("data-gov-11406");
  fetched.checks[0].note = "get mutation";
  assert.equal((await repo.get("data-gov-11406"))?.checks[0].note, "verified");
  const listed = await repo.list();
  listed[0].checks[0].note = "list mutation";
  assert.equal((await repo.get("data-gov-11406"))?.checks[0].note, "verified");
  await repo.save({ sourceId: "data-gov-11406", datasetId: "11406-replacement", checks: [] });
  assert.equal((await repo.list()).length, 1);
  assert.equal((await repo.get("data-gov-11406"))?.datasetId, "11406-replacement");
});
