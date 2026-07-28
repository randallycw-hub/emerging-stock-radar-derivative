import { assertExactResourceUrl, getApprovedResource, type PipelineSourceId } from "../source-registry.ts";

export type RelayDatasetId = "94025" | "11406" | "11586";
export type RelayDatasetPayload = { bodyBase64: string; sourceUrl: string; fetchedAt: string };
export type RelaySourceResponse = { sourceId: RelayDatasetId; resourceId: string; requestedUrl: string; finalUrl: string; fetchedAt: string; httpStatus: number; contentType: "text/csv"; responseBytes: number; sha256: `sha256:${string}`; body: Uint8Array; attemptCount: number };

const MAX_RESPONSE_BYTES = 8_000_000;

export async function createRelaySourceResponse(datasetId: RelayDatasetId, payload: RelayDatasetPayload): Promise<RelaySourceResponse> {
  const resource = getApprovedResource(datasetId as PipelineSourceId, `${datasetId}-csv`);
  assertExactResourceUrl(resource, payload.sourceUrl);
  if (!payload.fetchedAt || !payload.bodyBase64) throw new Error("RELAY_PAYLOAD_INCOMPLETE");
  let binary: string;
  try { binary = atob(payload.bodyBase64); } catch { throw new Error("INVALID_BASE64"); }
  const body = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  const digest = await crypto.subtle.digest("SHA-256", body);
  const sha256 = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}` as `sha256:${string}`;
  return { sourceId: datasetId, resourceId: `${datasetId}-csv`, requestedUrl: payload.sourceUrl, finalUrl: payload.sourceUrl, fetchedAt: payload.fetchedAt, httpStatus: 200, contentType: "text/csv", responseBytes: body.byteLength, sha256, body, attemptCount: 1 };
}
