import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseTpexApplicantSource,
  parseTpexIpoListingSource,
  parseTwseAuctionSource,
  parseTwsePublicOfferingSource,
} from "../../lib/source-verification/source-ipo-events.ts";

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../fixtures/source-verification/ipo/${name}`, import.meta.url),
  "utf8",
));

test("official IPO source parsers normalize primary-source events without market quotes", async () => {
  const [applicants, listings, auction, publicForm] = await Promise.all([
    fixture("tpex-applicants.json"),
    fixture("tpex-ipo-no-limit.json"),
    fixture("twse-auction.json"),
    fixture("twse-public-form.json"),
  ]);

  assert.deepEqual(parseTpexApplicantSource(applicants)[0], {
    companyCode: "7819",
    companyName: "精誠金融",
    market: "上櫃",
    applicationDate: "2026-04-01",
    reviewDate: "2026-04-30",
    boardDate: "2026-05-07",
    contractDate: "2026-05-10",
    listingDate: "2026-05-27",
    underwriter: "元大",
    note: "",
    sourceRecordId: "TPEx:7819:2026-04-01",
  });
  assert.deepEqual(parseTpexIpoListingSource(listings)[0], {
    companyCode: "6945",
    companyName: "圓祥生技",
    market: "上櫃",
    listingDate: "2026-06-08",
    finalUnderwritingPrice: "105.40",
    underwriter: "9800 元大",
    sourceRecordId: "TPEx:ipo-no-limit:6945:2026-06-08",
  });
  assert.equal(parseTwseAuctionSource(auction)[0].minimumBidPrice, "42.8");
  assert.equal(parseTwseAuctionSource(auction)[0].finalUnderwritingPrice, "50.5000");
  assert.equal(parseTwsePublicOfferingSource(publicForm)[0].finalUnderwritingPrice, "43.91");
  assert.equal(parseTwsePublicOfferingSource(publicForm)[1].cancelled, true);
  assert.equal(parseTwseAuctionSource(auction).length, 1);
  assert.equal(parseTwsePublicOfferingSource(publicForm).length, 2);
  const convertibleBondOnly = structuredClone(auction);
  convertibleBondOnly.data = [convertibleBondOnly.data[1]];
  assert.equal(parseTwseAuctionSource(convertibleBondOnly).length, 0);
});

test("official IPO source parsers reject schema shifts and malformed official values", async () => {
  const [auction, publicForm, applicants] = await Promise.all([
    fixture("twse-auction.json"),
    fixture("twse-public-form.json"),
    fixture("tpex-applicants.json"),
  ]);
  const invalidDate = structuredClone(auction);
  invalidDate.data[0][1] = "2026/02/30";
  assert.throws(() => parseTwseAuctionSource(invalidDate), /auctionDate/);

  const shiftedFields = structuredClone(auction);
  [shiftedFields.fields[1], shiftedFields.fields[7]] = [shiftedFields.fields[7], shiftedFields.fields[1]];
  assert.throws(() => parseTwseAuctionSource(shiftedFields), /schema|field/i);

  const scientificPrice = structuredClone(publicForm);
  scientificPrice.data[0][10] = "4.391e1";
  assert.throws(() => parseTwsePublicOfferingSource(scientificPrice), /underwritingPrice/);

  const shiftedApplicant = structuredClone(applicants);
  shiftedApplicant[0].Unexpected = "x";
  assert.throws(() => parseTpexApplicantSource(shiftedApplicant), /unknown/i);
});
