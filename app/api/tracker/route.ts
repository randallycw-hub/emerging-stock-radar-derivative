import { NextResponse } from "next/server";
// The tracker module is shared with the existing local web implementation.
// @ts-expect-error The source is plain ESM and intentionally has no declaration file.
import { getTrackerData } from "@/lib/tracker.mjs";
import { publicApiHeaders, publicApiOptions } from "../_cors";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const payload = await getTrackerData(force);
    return NextResponse.json(payload, { headers: publicApiHeaders("public, max-age=30, stale-while-revalidate=60") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502, headers: publicApiHeaders() });
  }
}
