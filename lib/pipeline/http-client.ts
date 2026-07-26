import { createHash } from "node:crypto";
import { assertExactResourceUrl, type ApprovedResource } from "./source-registry.ts";

export type HttpErrorCode = "RESOURCE_NOT_APPROVED" | "URL_NOT_ALLOWED" | "INSECURE_PROTOCOL" | "REDIRECT_NOT_ALLOWED" | "HTTP_STATUS_ERROR" | "TIMEOUT" | "RESPONSE_TOO_LARGE" | "CONTENT_TYPE_MISMATCH" | "EMPTY_RESPONSE" | "NETWORK_ERROR" | "HASH_FAILURE";
export class ApprovedHttpError extends Error {
  readonly code: HttpErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: HttpErrorCode, message: string, details: Record<string, unknown> = {}) { super(message); this.name = "ApprovedHttpError"; this.code = code; this.details = details; }
}
export interface RetryPolicy { maxAttempts: number; backoffMs: number; sleep?: (ms: number) => Promise<void>; }
export interface FetchApprovedRequest { resource: ApprovedResource; requestedUrl?: string; expectedContentTypes?: readonly string[]; timeoutMs?: number; maxResponseBytes?: number; retryPolicy?: RetryPolicy; transport?: typeof fetch; now?: () => string; }
export interface RawHttpResponse { sourceId: string; resourceId: string; requestedUrl: string; finalUrl: string; fetchedAt: string; httpStatus: number; contentType: string; responseBytes: number; sha256: `sha256:${string}`; body: Uint8Array; attemptCount: number; }

function canonicalContentType(value: string | null): string { return (value ?? "").split(";", 1)[0].trim().toLowerCase(); }
function retryableStatus(status: number): boolean { return status === 429 || status >= 500; }
function sleepDefault(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function fetchApprovedResource(request: FetchApprovedRequest): Promise<RawHttpResponse> {
  const resource = request.resource;
  if (resource.approvalStatus !== "VERIFIED_FOR_IMPLEMENTATION") throw new ApprovedHttpError("RESOURCE_NOT_APPROVED", "resource approval gate rejected");
  const requestedUrl = request.requestedUrl ?? resource.exactUrl;
  try { assertExactResourceUrl(resource, requestedUrl); } catch { throw new ApprovedHttpError("URL_NOT_ALLOWED", "requested URL is not exact registry resource"); }
  const transport = request.transport ?? fetch;
  const retry = request.retryPolicy ?? { maxAttempts: 1, backoffMs: 0, sleep: sleepDefault };
  const maxAttempts = Math.max(1, Math.floor(retry.maxAttempts));
  const timeoutMs = request.timeoutMs ?? resource.timeoutMs;
  const maxBytes = request.maxResponseBytes ?? resource.maxResponseBytes;
  let lastError: ApprovedHttpError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await transport(requestedUrl, { redirect: "error", signal: controller.signal, headers: { accept: resource.allowedContentTypes.join(",") } });
      if (response.status < 200 || response.status >= 300) throw new ApprovedHttpError("HTTP_STATUS_ERROR", `HTTP ${response.status}`, { httpStatus: response.status });
      const contentType = canonicalContentType(response.headers.get("content-type"));
      const allowed = request.expectedContentTypes ?? resource.allowedContentTypes;
      if (request.expectedContentTypes?.some((type) => !resource.allowedContentTypes.includes(type))) throw new ApprovedHttpError("CONTENT_TYPE_MISMATCH", "requested content type is outside registry allowlist");
      if (!allowed.includes(contentType)) throw new ApprovedHttpError("CONTENT_TYPE_MISMATCH", `unsupported content type: ${contentType}`);
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength === 0) throw new ApprovedHttpError("EMPTY_RESPONSE", "response body is empty");
      if (body.byteLength > maxBytes) throw new ApprovedHttpError("RESPONSE_TOO_LARGE", "response exceeds configured byte limit");
      const finalUrl = response.url || requestedUrl;
      try { assertExactResourceUrl(resource, finalUrl); } catch { throw new ApprovedHttpError("REDIRECT_NOT_ALLOWED", "final URL is not the exact resource"); }
      const sha256 = `sha256:${createHash("sha256").update(body).digest("hex")}` as `sha256:${string}`;
      return { sourceId: resource.sourceId, resourceId: resource.resourceId, requestedUrl, finalUrl, fetchedAt: request.now?.() ?? new Date().toISOString(), httpStatus: response.status, contentType, responseBytes: body.byteLength, sha256, body, attemptCount: attempt };
    } catch (error) {
      lastError = error instanceof ApprovedHttpError ? error : (error instanceof DOMException && error.name === "AbortError" ? new ApprovedHttpError("TIMEOUT", "request timed out") : new ApprovedHttpError("NETWORK_ERROR", "network request failed"));
      const retryable = lastError.code === "NETWORK_ERROR" || lastError.code === "TIMEOUT" || (lastError.code === "HTTP_STATUS_ERROR" && retryableStatus(Number(lastError.details.httpStatus)));
      if (!retryable || attempt >= maxAttempts) throw lastError;
      await (retry.sleep ?? sleepDefault)(retry.backoffMs * attempt);
    } finally { clearTimeout(timer); }
  }
  throw lastError ?? new ApprovedHttpError("NETWORK_ERROR", "request failed");
}
