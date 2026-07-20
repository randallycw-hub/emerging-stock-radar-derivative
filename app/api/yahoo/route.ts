import { NextResponse } from "next/server";
import { getYahooQuotes, lastCompletedFriday } from "@/lib/yahoo";
import { publicApiHeaders, publicApiOptions } from "../_cors";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const codes = [...new Set((url.searchParams.get("codes") || "").split(",")
    .map(code => code.trim()).filter(code => /^\d{4}$/.test(code)))].slice(0, 20);
  if (!codes.length) return NextResponse.json({ error: "缺少有效股票代號" }, { status: 400, headers: publicApiHeaders() });

  const lastWeekEnd = lastCompletedFriday();
  const quotes = await getYahooQuotes(codes, {
    force: url.searchParams.get("refresh") === "1",
    lastWeekEnd,
    suffixes: ["TWO"],
    concurrency: 8
  });
  return NextResponse.json({
    generatedAt: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date()),
    lastWeekEnd,
    count: quotes.length,
    success: quotes.filter(quote => quote.current !== null).length,
    quotes
  }, { headers: publicApiHeaders() });
}
