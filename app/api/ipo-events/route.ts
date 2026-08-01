import { env } from "cloudflare:workers";
import { publicApiHeaders, publicApiOptions } from "../_cors";
import { getIpoEventsResponse } from "@/lib/ipo-events/refresh";
import { createIpoSnapshotRepository } from "@/lib/ipo-events/repository";

export const runtime = "edge";
export const OPTIONS = publicApiOptions;

export async function GET() {
  if (!env.PIPELINE_DB) {
    return Response.json(
      { status: "source_unavailable" },
      { status: 503, headers: publicApiHeaders("no-store") },
    );
  }
  return getIpoEventsResponse({
    repository: createIpoSnapshotRepository(env.PIPELINE_DB),
    fetchImpl: fetch,
    now: new Date(),
    headers: publicApiHeaders(),
  });
}
