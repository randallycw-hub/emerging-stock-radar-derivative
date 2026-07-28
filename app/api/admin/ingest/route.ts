import { env } from "cloudflare:workers";
import { create11406CsvAdapter } from "@/lib/pipeline/adapters/11406-csv";
import { create11586CsvAdapter } from "@/lib/pipeline/adapters/11586-csv";
import { create94025CsvAdapter } from "@/lib/pipeline/adapters/94025-csv";
import { fetchApprovedResource } from "@/lib/pipeline/http-client";
import { getApprovedResource } from "@/lib/pipeline/source-registry";
import { authorizeIngestionRequest } from "@/lib/pipeline/orchestration/ingestion-auth";
import { runPublicSnapshotIngestion } from "@/lib/pipeline/orchestration/public-snapshot-runner";
import { createRuntimePipelineRepository } from "@/lib/pipeline/runtime-repository";

export const runtime = "edge";

type IngestionEnv = typeof env & { INGESTION_TOKEN?: string };

export async function POST(request: Request) {
  const runtimeEnv = env as IngestionEnv;
  if (!authorizeIngestionRequest(request.headers.get("authorization"), runtimeEnv.INGESTION_TOKEN)) {
    return Response.json({ status: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const repository = createRuntimePipelineRepository({ PIPELINE_DB: runtimeEnv.PIPELINE_DB });
  if (!repository) return Response.json({ status: "unavailable", reasons: ["PIPELINE_DB_NOT_CONFIGURED"] }, { status: 503 });

  const result = await runPublicSnapshotIngestion({
    repository,
    adapters: { "94025": create94025CsvAdapter(), "11406": create11406CsvAdapter(), "11586": create11586CsvAdapter() },
    clock: () => new Date().toISOString(),
    publicationRunId: crypto.randomUUID(),
    executionMode: "production",
    approvedHttpClient: (input) => fetchApprovedResource({ ...input, resource: getApprovedResource(input.resource.sourceId as "94025" | "11406" | "11586", input.resource.resourceId) }),
  });
  return Response.json(result, { status: result.published ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
