import type { PipelineRepository } from "../repositories/contracts.ts";
import { readPublishedPublicSnapshot } from "./public-snapshot.ts";

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

export async function publicSnapshotResponse(repository?: PipelineRepository): Promise<Response> {
  if (!repository) {
    return new Response(JSON.stringify({ status: "unavailable", reasons: ["D1_BINDING_UNAVAILABLE"] }), {
      status: 503,
      headers: { ...JSON_HEADERS, "Cache-Control": "no-store" },
    });
  }
  try {
    const payload = await readPublishedPublicSnapshot(repository);
    return new Response(JSON.stringify(payload), {
      status: payload.status === "published" ? 200 : 503,
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": payload.status === "published" ? "public, max-age=30, stale-while-revalidate=60" : "no-store",
      },
    });
  } catch {
    return new Response(JSON.stringify({ status: "unavailable", reasons: ["PUBLIC_SNAPSHOT_READ_FAILED"] }), {
      status: 503,
      headers: { ...JSON_HEADERS, "Cache-Control": "no-store" },
    });
  }
}
