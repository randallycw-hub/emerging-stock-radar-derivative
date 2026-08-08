import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStaticIpoSnapshot } from "./static-ipo-fallback.mjs";
import { parseEmergingMarketSource } from "../lib/source-verification/source-emerging-market.ts";
import { buildEmergingMarketViews } from "../lib/market-data/emerging-market-view.ts";
import { EmergingMarketViewSchema } from "../lib/domain/schema.ts";

const root = "static-showcase/data";
const pointer = JSON.parse(await readFile(join(root, "current.json"), "utf8"));
const generationRoot = join(root, pointer.generation);
const twseRows = JSON.parse(await readFile(join(generationRoot, "11586.json"), "utf8"));
const tpexRows = JSON.parse(await readFile("lib/tpex-applicant-snapshot.json", "utf8"));
const market = JSON.parse(await readFile(join(generationRoot, "emerging-market.json"), "utf8"));
const officialMarketRows = parseEmergingMarketSource(JSON.parse(await readFile(join(generationRoot, "_official-emerging.json"), "utf8")));
const companyRows = JSON.parse(await readFile(join(generationRoot, "94025.json"), "utf8")).map((row) => ({
  companyCode: String(row["公司代號"] ?? "").trim(),
  companyName: String(row["公司名稱"] ?? "").trim(),
  industryName: String(row["產業別"] ?? "").trim(),
}));
const marketRecords = buildEmergingMarketViews({ marketRows: officialMarketRows, companyRows })
  .map((record) => EmergingMarketViewSchema.parse(record));
const tradingDate = officialMarketRows[0]?.tradingDate;
const publishedTime = officialMarketRows.map((row) => row.publishedTime).sort().at(-1);
await writeFile(join(generationRoot, "emerging-market.json"), `${JSON.stringify({
  schemaVersion: 1,
  tradingDate,
  publishedAt: `${tradingDate}T${publishedTime}+08:00`,
  sourceId: "tpex_esb_latest_statistics",
  records: marketRecords,
}, null, 2)}\n`, "utf8");
const snapshot = buildStaticIpoSnapshot({
  twseRows,
  tpexRows,
  dataDate: tradingDate ?? market.tradingDate,
  generatedAt: `${tradingDate ?? market.tradingDate}T${publishedTime ?? "16:30:00"}+08:00`,
});
await writeFile(join(generationRoot, "ipo-events.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
const runtimePath = join(generationRoot, "runtime.json");
const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
runtime.ipoEventsUrl = `./data/${pointer.generation}/ipo-events.json`;
await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ generation: pointer.generation, records: snapshot.records.length, dataDate: snapshot.dataDate }));
