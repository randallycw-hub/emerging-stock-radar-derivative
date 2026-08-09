import { parseMonthlyRevenueCsv } from "./source-94025.ts";

const MAX_RESPONSE_BYTES = 2_000_000;
const CSV_CONTENT_TYPES = new Set([
  "application/csv",
  "application/vnd.ms-excel",
  "text/csv",
]);

const listedPolicy = Object.freeze({
  sourceId: "data-gov-18420-listed-monthly-revenue",
  url: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
  market: "listed",
} as const);

const otcPolicy = Object.freeze({
  sourceId: "data-gov-56510-otc-monthly-revenue",
  url: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
  market: "otc",
} as const);

export const CB_ISSUER_RESEARCH_SOURCE_POLICIES = Object.freeze({
  listed: listedPolicy,
  otc: otcPolicy,
});

export type CbIssuerResearchSourcePolicy =
  typeof CB_ISSUER_RESEARCH_SOURCE_POLICIES[keyof typeof CB_ISSUER_RESEARCH_SOURCE_POLICIES];

export function assertCbIssuerResearchSourceRequest(input: {
  method: string;
  url: string;
  redirected?: boolean;
}): CbIssuerResearchSourcePolicy {
  if (input.method !== "GET") {
    throw new TypeError("CB issuer research source request method must be GET");
  }
  if (input.redirected === true) {
    throw new TypeError("CB issuer research source request must not follow a redirect");
  }
  if (input.redirected !== undefined && typeof input.redirected !== "boolean") {
    throw new TypeError("CB issuer research source request redirected flag must be boolean");
  }
  if (typeof input.url !== "string") {
    throw new TypeError("CB issuer research source request URL must be a string");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    throw new TypeError("CB issuer research source request URL must be absolute");
  }
  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw new TypeError("CB issuer research source request URL must not contain credentials");
  }
  if (parsedUrl.search !== "" || parsedUrl.hash !== "") {
    throw new TypeError("CB issuer research source request URL must not contain a query or fragment");
  }

  const policy = Object.values(CB_ISSUER_RESEARCH_SOURCE_POLICIES)
    .find((candidate) => candidate.url === input.url);
  if (policy === undefined) {
    throw new TypeError("CB issuer research source request URL is not a reviewed resource");
  }
  return policy;
}

export async function fetchCbIssuerResearchSources(options?: {
  fetchImpl?: typeof fetch;
}): Promise<{
  listed: PromiseSettledResult<string>;
  otc: PromiseSettledResult<string>;
}> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const [listed, otc] = await Promise.allSettled([
    fetchCbIssuerResearchSource(CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed, fetchImpl),
    fetchCbIssuerResearchSource(CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc, fetchImpl),
  ] as const);
  return { listed, otc };
}

async function fetchCbIssuerResearchSource(
  policy: CbIssuerResearchSourcePolicy,
  fetchImpl: typeof fetch,
): Promise<string> {
  assertCbIssuerResearchSourceRequest({ method: "GET", url: policy.url });
  const response = await fetchImpl(policy.url, { method: "GET", redirect: "manual" });
  if (response.status !== 200) {
    throw new TypeError(`${policy.market} monthly revenue response must have HTTP status 200`);
  }
  assertCbIssuerResearchSourceRequest({
    method: "GET",
    url: response.url,
    redirected: response.redirected,
  });
  if (response.url !== policy.url) {
    throw new TypeError(`${policy.market} monthly revenue response final URL must match its request`);
  }

  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType === undefined || !CSV_CONTENT_TYPES.has(contentType)) {
    throw new TypeError(`${policy.market} monthly revenue response Content-Type must be CSV-compatible`);
  }

  const bytes = await readBoundedResponseBody(response, policy.market);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new TypeError(`${policy.market} monthly revenue response must be valid UTF-8`);
  }
  parseMonthlyRevenueCsv(text, `${policy.market} monthly revenue CSV`);
  return text;
}

async function readBoundedResponseBody(response: Response, market: string): Promise<Uint8Array> {
  if (response.body === null) {
    throw new TypeError(`${market} monthly revenue response body is required`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TypeError(`${market} monthly revenue response exceeds ${MAX_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
