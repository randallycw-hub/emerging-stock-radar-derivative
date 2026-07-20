import { NextResponse } from "next/server";
// The tracker module is shared with the existing local web implementation.
import { getTrackerData } from "@/lib/tracker.mjs";
import { publicApiHeaders, publicApiOptions } from "../_cors";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const payload = await getTrackerData(force);
    return NextResponse.json(payload, { headers: publicApiHeaders("public, max-age=30, stale-while-revalidate=60") });
  } catch {
    return NextResponse.json(
      { status: "source_unavailable", error: "官方上市櫃進度資料目前無法取得" },
      { status: 503, headers: publicApiHeaders() },
    );
  }
}
