import { env } from "cloudflare:workers";
import { create11406CsvAdapter } from "@/lib/pipeline/adapters/11406-csv";
import { create11586CsvAdapter } from "@/lib/pipeline/adapters/11586-csv";
import { create94025CsvAdapter } from "@/lib/pipeline/adapters/94025-csv";
import { authorizeIngestionRequest } from "@/lib/pipeline/orchestration/ingestion-auth";
import { createRelaySourceResponse, type RelayDatasetId, type RelayDatasetPayload } from "@/lib/pipeline/orchestration/relay-contract";
import { runPublicSnapshotIngestion } from "@/lib/pipeline/orchestration/public-snapshot-runner";
import { createRuntimePipelineRepository } from "@/lib/pipeline/runtime-repository";

export const runtime = "edge";
const required: readonly RelayDatasetId[] = ["94025", "11406", "11586"];
type RelayEnv = typeof env & { INGESTION_TOKEN?: string };

export async function POST(request: Request) {
  const runtimeEnv = env as RelayEnv;
  if (!authorizeIngestionRequest(request.headers.get("authorization"), runtimeEnv.INGESTION_TOKEN)) return Response.json({ status: "unauthorized" }, { status: 401 });
  const repository = createRuntimePipelineRepository({ PIPELINE_DB: runtimeEnv.PIPELINE_DB });
  if (!repository) return Response.json({ status: "unavailable", reasons: ["PIPELINE_DB_NOT_CONFIGURED"] }, { status: 503 });
  try {
    const body = await request.json() as { datasets?: Partial<Record<RelayDatasetId, RelayDatasetPayload>> };
    if (!body.datasets || required.some((datasetId) => !body.datasets?.[datasetId])) return Response.json({ status: "invalid", reasons: ["RELAY_DATASETS_INCOMPLETE"] }, { status: 400 });
    const responses = Object.fromEntries(await Promise.all(required.map(async (datasetId) => [datasetId, await createRelaySourceResponse(datasetId, body.datasets![datasetId]!) ]))) as Record<RelayDatasetId, Awaited<ReturnType<typeof createRelaySourceResponse>>>;
    const result = await runPublicSnapshotIngestion({
      repository,
      adapters: { "94025": create94025CsvAdapter(responses["94025"]), "11406": create11406CsvAdapter(responses["11406"]), "11586": create11586CsvAdapter(responses["11586"]) },
      clock: () => new Date().toISOString(),
      publicationRunId: crypto.randomUUID(),
      executionMode: "production",
      approvedHttpClient: async () => { throw new Error("RELAY_ADAPTER_MUST_NOT_FETCH"); },
    });
    return Response.json(result, { status: result.published ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ status: "invalid", reasons: [error instanceof Error ? error.message : String(error)] }, { status: 400 });
  }
}
