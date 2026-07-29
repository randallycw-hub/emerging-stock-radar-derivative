import { readFile, writeFile } from "node:fs/promises";

const path = "static-showcase/data/runtime.js";
let runtime = await readFile(path, "utf8");
const before = `    cell(fmtDate(row["賣回權日期"]), true), cell(val(row, "賣回權價格"), true), cell(fmtDate(row["資料日期"])), cell("11406 官方快照"), cell(val(row, "債券種類")),`;
const after = `    cell("—", true), cell("—", true), cell("—", true), cell(fmtDate(row["資料日期"])), cell("11406 官方快照"),`;
if (!runtime.includes(before)) throw new Error("bond column mapping not found");
runtime = runtime.replace(before, after);
await writeFile(path, runtime, "utf8");
