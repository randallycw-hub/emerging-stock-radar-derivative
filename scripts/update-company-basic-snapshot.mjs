import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R";
const outputUrl = new URL("../lib/company-basic-snapshot.json", import.meta.url);
const fields = [
  "SecuritiesCompanyCode",
  "CompanyName",
  "CompanyAbbreviation",
  "SecuritiesIndustryCode",
  "Chairman",
  "Paidin.Capital.NTDollars",
  "DateOfListing",
  "WebAddress"
];

const response = await fetch(SOURCE_URL, {
  headers: {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0"
  }
});

if (!response.ok) throw new Error(`TPEx company API returned HTTP ${response.status}`);

const rows = await response.json();
const snapshot = rows
  .map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? ""])))
  .filter((row) => /^\d{4}$/.test(String(row.SecuritiesCompanyCode)))
  .sort((a, b) => String(a.SecuritiesCompanyCode).localeCompare(String(b.SecuritiesCompanyCode)));

await writeFile(fileURLToPath(outputUrl), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Saved ${snapshot.length} official company profiles to ${fileURLToPath(outputUrl)}`);
