import { NextResponse } from "next/server";
import { conceptTags, getBasicRows, INDUSTRIES } from "@/lib/market";
import { readProfile, saveProfile } from "@/db/market";
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
    const cached = await readProfile(code).catch(() => null) as Record<string, unknown> | null;
    let checkedAt = String(cached?.checked_at || "");
    const cacheFresh = Boolean(checkedAt && cached?.main_business && Date.now() - new Date(checkedAt).getTime() < 7 * 86400000);
    let mainBusiness = String(cached?.main_business || "");
    let concepts: string[] = parseConcepts(cached?.concepts);
    const sourceUrl = `https://ic.tpex.org.tw/company_basic.php?stk_code=${code}`;
    const basicName = String(basic.CompanyAbbreviation || basic.CompanyName || "");
    const [officialDetail, news] = await Promise.all([
      summaryOnly ? Promise.resolve(null) : fetchCompanyDetail(code).catch(() => null),
      summaryOnly ? Promise.resolve([]) : fetchNews(code).catch(() => [])
    ]);
    const officialIndustry = INDUSTRIES[String(basic.SecuritiesIndustryCode || "")] || officialDetail?.industry || "待確認";
    if (officialDetail?.mainBusiness) mainBusiness = officialDetail.mainBusiness;
    if (!summaryOnly && (!cacheFresh || officialDetail?.mainBusiness)) {
      checkedAt = new Date().toISOString();
      concepts = conceptTags(officialIndustry, mainBusiness);
      const profile = { code, mainBusiness, concepts, sourceUrl, checkedAt: new Date().toISOString() };
      await saveProfile(profile).catch(() => undefined);
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
      sourceUrl, checkedAt: checkedAt || new Date().toISOString(), news,
      chartUrl: `https://tw.stock.yahoo.com/quote/${code}.TWO/technical-analysis`
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

async function fetchNews(code: string) {
  return normalizeNews(await fetchYahooNews(code));
}

type NewsItem = {
  title: string;
  url: string;
  date: string;
  publishedAt: number;
  source: string;
};

function normalizeNews(items: NewsItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!item.title || !item.url || !Number.isFinite(item.publishedAt)) return false;
    const key = item.title.replace(/\s+-\s+[^-]{1,50}$/, "").replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 5).map(item => ({
    title: item.title, url: item.url, date: item.date, source: item.source
  }));
}

async function fetchYahooNews(code: string): Promise<NewsItem[]> {
  const response = await fetch(`https://tw.stock.yahoo.com/rss?s=${code}`, {
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6"
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(6000)
  }).catch(() => null);
  if (!response?.ok) return [];

  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => {
    const block = match[1];
    const publishedAt = new Date(extractXml(block, "pubDate"));
    return {
      title: decodeHtml(extractXml(block, "title").replace(/<!\[CDATA\[|\]\]>/g, "")),
      url: decodeHtml(extractXml(block, "link")),
      date: Number.isFinite(publishedAt.getTime()) ? publishedAt.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "",
      publishedAt: publishedAt.getTime(),
      source: "公開新聞"
    };
  });
}

function extractXml(text: string, tag: string) { return text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() || ""; }
function decodeHtml(text: string) { return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
function parseConcepts(value: unknown): string[] { try { return Array.isArray(value) ? value : JSON.parse(String(value || "[]")); } catch { return []; } }
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
