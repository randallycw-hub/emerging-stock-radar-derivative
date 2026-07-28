import { env } from "cloudflare:workers";
import { publicSnapshotResponse } from "@/lib/pipeline/read-models/public-snapshot-http";
import { createRuntimePipelineRepository } from "@/lib/pipeline/runtime-repository";

export const runtime = "edge";

export async function GET() {
  return publicSnapshotResponse(createRuntimePipelineRepository({ PIPELINE_DB: env.PIPELINE_DB }));
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}
