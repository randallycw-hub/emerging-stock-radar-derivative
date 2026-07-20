import { NextResponse } from "next/server";
import { getMarketData } from "@/lib/market";
import { saveClosingSnapshot } from "@/db/market";
import { publicApiHeaders, publicApiOptions } from "../_cors";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const payload = await getMarketData(force);
    await saveClosingSnapshot(payload).catch(() => undefined);
    return NextResponse.json(payload, { headers: publicApiHeaders("public, max-age=10, stale-while-revalidate=20") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502, headers: publicApiHeaders() });
  }
}
