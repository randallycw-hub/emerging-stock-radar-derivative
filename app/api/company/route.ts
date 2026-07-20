import { NextResponse } from "next/server";
import { conceptTags, getBasicRows, INDUSTRIES } from "@/lib/company";
import { publicApiHeaders, publicApiOptions } from "../_cors";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

type OfficialDetail = {
  mainBusiness: string;
  website: string;
  fullName: string;
  chairman: string;
  capital: number;
  industry: string;
};

const detailCache = new Map<string, { at: number; value: OfficialDetail }>();

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get("code")?.trim() || "";
  const summaryOnly = searchParams.get("summary") === "1";
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: "公司代號格式錯誤" }, { status: 400, headers: publicApiHeaders() });
  try {
    const basics = await getBasicRows();
    const basic = basics.find(x => String(x.SecuritiesCompanyCode) === code);
    if (!basic) return NextResponse.json({ error: "找不到公司資料" }, { status: 404, headers: publicApiHeaders() });
    let checkedAt = "";
    let mainBusiness = "";
    let concepts: string[] = [];
    const sourceUrl = `https://ic.tpex.org.tw/company_basic.php?stk_code=${code}`;
    const basicName = String(basic.CompanyAbbreviation || basic.CompanyName || "");
    const officialDetail = summaryOnly ? null : await fetchCompanyDetail(code).catch(() => null);
    const officialIndustry = INDUSTRIES[String(basic.SecuritiesIndustryCode || "")] || officialDetail?.industry || "待確認";
    if (officialDetail?.mainBusiness) mainBusiness = officialDetail.mainBusiness;
    if (!summaryOnly && officialDetail?.mainBusiness) {
      checkedAt = new Date().toISOString();
      concepts = conceptTags(officialIndustry, mainBusiness);
    }
    concepts = conceptTags(officialIndustry, mainBusiness);
    const name = basicName || officialDetail?.fullName || "";
    return NextResponse.json({
      code, name, fullName: basic.CompanyName || officialDetail?.fullName || name,
      industry: officialIndustry,
      subindustry: concepts[0] || "待確認", mainBusiness: mainBusiness || "公司主要業務資料待確認",
      concepts, website: normalizeWebsite(String(basic.WebAddress || officialDetail?.website || "")),
      chairman: basic.Chairman || officialDetail?.chairman || "",
      capital: Number(basic["Paidin.Capital.NTDollars"] || officialDetail?.capital || 0),
      listedDate: normalizeRocDate(String(basic.DateOfListing || "")),
      sourceUrl, checkedAt: checkedAt || new Date().toISOString()
    }, { headers: publicApiHeaders(summaryOnly ? "public, max-age=21600, stale-while-revalidate=86400" : "public, max-age=1800, stale-while-revalidate=21600") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502, headers: publicApiHeaders() });
  }
}

async function fetchCompanyDetail(code: string): Promise<OfficialDetail> {
  const cached = detailCache.get(code);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return cached.value;
  const url = `https://dsp.tpex.org.tw/storage/company_basic/company_basic.php?s=${code}&m=20&_=${Date.now()}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`公司輪廓 HTTP ${response.status}`);
  const text = await response.text();
  const jsonText = text.replace(/^\s*getCompanyBasic\(/, "").replace(/\)\s*;?\s*$/, "");
  const data = JSON.parse(jsonText) as Record<string, string>;
  const value = {
    mainBusiness: [...new Set([data.MAIN_BUSINESS1, data.MAIN_BUSINESS2, data.MAIN_BUSINESS3, data.MAIN_BUSINESS4]
      .map(cleanText).filter(Boolean))].join("；").slice(0, 600),
    website: normalizeWebsite(data.INTERNET_ADDRESS || ""),
    fullName: cleanText(data.COMPANY_NAME || ""),
    chairman: cleanText(data.CHAIRMAN_NAME || ""),
    capital: Number(String(data.CAPITAL_AMT || "").replace(/,/g, "")) || 0,
    industry: cleanText(data.NAME || "")
  };
  detailCache.set(code, { at: Date.now(), value });
  return value;
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
