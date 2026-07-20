import { NextResponse } from "next/server";
import { conceptTags, getBasicRows, INDUSTRIES } from "@/lib/company";
import { publicApiHeaders, publicApiOptions } from "../_cors";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get("code")?.trim() || "";
  const summaryOnly = searchParams.get("summary") === "1";
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: "公司代號格式錯誤" }, { status: 400, headers: publicApiHeaders() });
  try {
    const basics = await getBasicRows();
    const basic = basics.find(x => String(x.SecuritiesCompanyCode) === code);
    if (!basic) return NextResponse.json({ error: "找不到公司資料" }, { status: 404, headers: publicApiHeaders() });
    const checkedAt = new Date().toISOString();
    const mainBusiness = "";
    const sourceUrl = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R";
    const basicName = String(basic.CompanyAbbreviation || basic.CompanyName || "");
    const officialIndustry = INDUSTRIES[String(basic.SecuritiesIndustryCode || "")] || "待確認";
    const concepts = conceptTags(officialIndustry, mainBusiness);
    const name = basicName || String(basic.CompanyName || "");
    return NextResponse.json({
      code, name, fullName: basic.CompanyName || name,
      industry: officialIndustry,
      subindustry: concepts[0] || "待確認", mainBusiness: mainBusiness || "公司主要業務資料待確認",
      concepts, website: normalizeWebsite(String(basic.WebAddress || "")),
      chairman: basic.Chairman || "",
      capital: Number(basic["Paidin.Capital.NTDollars"] || 0),
      listedDate: normalizeRocDate(String(basic.DateOfListing || "")),
      sourceUrl, checkedAt
    }, { headers: publicApiHeaders(summaryOnly ? "public, max-age=21600, stale-while-revalidate=86400" : "public, max-age=1800, stale-while-revalidate=21600") });
  } catch {
    return NextResponse.json(
      { status: "source_unavailable", error: "官方公司基本資料目前無法取得" },
      { status: 503, headers: publicApiHeaders() },
    );
  }
}

function cleanText(value: unknown) { return String(value || "").replace(/\s+/g, " ").trim(); }
function normalizeWebsite(value: string) {
  const candidate = cleanText(value).split(/[\s;,，；]+/).find(Boolean)?.replace(/[)）.。]+$/, "") || "";
  if (!candidate) return "";
  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(normalized);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") ? url.toString() : "";
  } catch {
    return "";
  }
}
function normalizeRocDate(value: string) { const d=value.replace(/\D/g,""); if(/^\d{8}$/.test(d)) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; if(/^\d{7}$/.test(d)) return `${Number(d.slice(0,3))+1911}-${d.slice(3,5)}-${d.slice(5,7)}`; return value; }
