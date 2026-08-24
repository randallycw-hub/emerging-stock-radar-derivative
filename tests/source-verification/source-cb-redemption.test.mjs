import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseCbRedemptionAnnouncements,
} from "../../lib/source-verification/source-cb-redemption.ts";

const fixtureDirectory = new URL(
  "../fixtures/source-verification/cb-redemption/",
  import.meta.url,
);

async function jsonFixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), "utf8"));
}

function withIssuerConflict(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][0] = "9999";
  return copy;
}

function withCoordinatedIssuerConflict(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][0] = "9999";
  const url = new URL(copy.tables[0].data[0][4]);
  url.searchParams.set("co_id", "9999");
  copy.tables[0].data[0][4] = url.toString();
  return copy;
}

function withIssuerNameConflict(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][1] = "錯誤公司";
  return copy;
}

function withSixDigitBondCode(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][3] = copy.tables[0].data[0][3].replace("31312", "313112");
  return copy;
}

function withHttpUrl(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][4] = copy.tables[0].data[0][4].replace("https://", "http://");
  return copy;
}

function withUrlDateConflict(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][4] = copy.tables[0].data[0][4].replace("date1=20260804", "date1=20260805");
  return copy;
}

function withRepeatedUrlParameter(fixture, parameter, value) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][4] += `&${parameter}=${value}`;
  return copy;
}

function withUnexpectedUrlParameter(fixture) {
  return withRepeatedUrlParameter(fixture, "unexpected", "value");
}

function withUrlMutation(fixture, mutate) {
  const copy = structuredClone(fixture);
  const url = new URL(copy.tables[0].data[0][4]);
  mutate(url);
  copy.tables[0].data[0][4] = url.toString();
  return copy;
}

function withZeroAnnualYear(fixture) {
  const copy = structuredClone(fixture);
  copy.date = "00000101";
  return copy;
}

function withZeroRocAnnouncementYear(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][2] = "000/08/04";
  return copy;
}

function withMissingDelistingDate(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[0][3] = copy.tables[0].data[0][3].replace("訂於115年09月21日終止櫃檯買賣", "訂於115年09月21日");
  return copy;
}

function withDuplicateCodeAndAnnouncementDate(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data.push(structuredClone(copy.tables[0].data[0]));
  copy.tables[0].totalCount += 1;
  return copy;
}

test("extracts exact CB code, name and delisting date", async () => {
  const fixture = await jsonFixture("year-minimal.json");

  assert.deepEqual(parseCbRedemptionAnnouncements(fixture)[0], {
    issuerCode: "3131",
    issuerName: "弘塑",
    bondCode: "31312",
    bondName: "弘塑二",
    announcementDate: "2026-08-04",
    delistingDate: "2026-09-21",
    subject: fixture.tables[0].data[0][3],
    detailUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3131&date1=20260804&seq_no=2&pub_class=0&firstin=1",
  });
});

test("rejects issuer, date, URL and subject conflicts", async () => {
  const fixture = await jsonFixture("year-minimal.json");

  assert.throws(() => parseCbRedemptionAnnouncements(withIssuerConflict(fixture)), /issuer/);
  assert.throws(() => parseCbRedemptionAnnouncements(withHttpUrl(fixture)), /detail URL/);
  assert.throws(() => parseCbRedemptionAnnouncements(withUrlDateConflict(fixture)), /announcement date/);
  assert.throws(() => parseCbRedemptionAnnouncements(withMissingDelistingDate(fixture)), /delisting date/);
});

test("binds the row issuer to its bond code and subject announcement prefix", async (t) => {
  const fixture = await jsonFixture("year-minimal.json");

  await t.test("coordinated issuer and co_id mutation", () => {
    assert.throws(
      () => parseCbRedemptionAnnouncements(withCoordinatedIssuerConflict(fixture)),
      /issuer.*bond code/,
    );
  });

  await t.test("issuer name missing from announcement prefix", () => {
    assert.throws(
      () => parseCbRedemptionAnnouncements(withIssuerNameConflict(fixture)),
      /issuer name.*subject/,
    );
  });

  await t.test("six-digit bond code with two suffix digits remains valid", () => {
    assert.equal(
      parseCbRedemptionAnnouncements(withSixDigitBondCode(fixture))[0].bondCode,
      "313112",
    );
  });
});

test("rejects duplicate and unrecognized MOPS detail URL parameters", async () => {
  const fixture = await jsonFixture("year-minimal.json");

  assert.throws(
    () => parseCbRedemptionAnnouncements(withRepeatedUrlParameter(fixture, "co_id", "9999")),
    /detail URL query/,
  );
  assert.throws(
    () => parseCbRedemptionAnnouncements(withRepeatedUrlParameter(fixture, "date1", "20260805")),
    /detail URL query/,
  );
  assert.throws(() => parseCbRedemptionAnnouncements(withUnexpectedUrlParameter(fixture)), /detail URL query/);
});

test("rejects off-contract MOPS detail URL values and fragments", async (t) => {
  const fixture = await jsonFixture("year-minimal.json");
  const cases = [
    ["fragment", (url) => { url.hash = "review"; }],
    ["TYPEK", (url) => { url.searchParams.set("TYPEK", "listed"); }],
    ["zero seq_no", (url) => { url.searchParams.set("seq_no", "0"); }],
    ["non-integer seq_no", (url) => { url.searchParams.set("seq_no", "2.5"); }],
    ["pub_class", (url) => { url.searchParams.set("pub_class", "1"); }],
    ["firstin", (url) => { url.searchParams.set("firstin", "0"); }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => parseCbRedemptionAnnouncements(withUrlMutation(fixture, mutate)),
        /detail URL/,
      );
    });
  }
});

test("rejects zero annual and ROC date years", async () => {
  const fixture = await jsonFixture("year-minimal.json");

  assert.throws(() => parseCbRedemptionAnnouncements(withZeroAnnualYear(fixture)), /zero year/);
  assert.throws(() => parseCbRedemptionAnnouncements(withZeroRocAnnouncementYear(fixture)), /zero year/);
});

test("rejects schema drift and duplicate CB announcement keys", async () => {
  const fixture = await jsonFixture("year-minimal.json");
  const unknownRoot = { ...structuredClone(fixture), unexpected: true };
  const unknownTable = structuredClone(fixture);
  unknownTable.tables[0].unexpected = true;
  const reorderedFields = structuredClone(fixture);
  [reorderedFields.tables[0].fields[0], reorderedFields.tables[0].fields[1]] = [
    reorderedFields.tables[0].fields[1],
    reorderedFields.tables[0].fields[0],
  ];

  assert.throws(() => parseCbRedemptionAnnouncements(unknownRoot), /unknown root field/);
  assert.throws(() => parseCbRedemptionAnnouncements(unknownTable), /unknown table field/);
  assert.throws(() => parseCbRedemptionAnnouncements(reorderedFields), /fields do not match/);
  assert.throws(() => parseCbRedemptionAnnouncements(withDuplicateCodeAndAnnouncementDate(fixture)), /duplicate/);
});
