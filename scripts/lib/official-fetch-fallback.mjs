import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CURL_META = "\n__CODEX_CURL_META__";
const MAX_RESPONSE_BYTES = 8_000_000;
const APPROVED_TPEX_PATHS = new Set([
  "/storage/bond_publish/ISSBD5_data.csv",
  "/openapi/v1/tpex_esb_latest_statistics",
  "/openapi/v1/tpex_mainboard_daily_close_quotes",
  "/www/zh-tw/afterTrading/tradingStock",
  "/www/zh-tw/bond/cbDayQry",
  "/www/zh-tw/bond/convSearch",
  "/www/zh-tw/bond/newCb3itrade",
  "/www/zh-tw/bond/redeem",
]);

/**
 * TPEx intermittently returns Cloudflare 520 responses to Node's built-in
 * transport while the same public endpoint remains available.  Keep this
 * fallback narrow: it applies only to explicitly approved TPEx endpoints and
 * only to a 520 response.  All existing response, date, and content validators
 * continue to run after transport succeeds.
 */
export function withTpex520Fallback({
  fetchImpl = fetch,
  fallbackFetchImpl = curlTpexFetch,
  maxFallbackAttempts = 3,
  sleepImpl = sleep,
} = {}) {
  if (typeof fetchImpl !== "function" || typeof fallbackFetchImpl !== "function") {
    throw new TypeError("TPEx transport fallback requires fetch functions");
  }
  if (!Number.isInteger(maxFallbackAttempts) || maxFallbackAttempts < 1 || maxFallbackAttempts > 3) {
    throw new TypeError("TPEx transport fallback attempts must be between 1 and 3");
  }
  if (typeof sleepImpl !== "function") throw new TypeError("TPEx transport fallback requires a sleep function");
  return async (url, init) => {
    const response = await fetchImpl(url, init);
    if (response?.status !== 520 || !isApprovedTpexEndpoint(url)) return response;
    let fallbackResponse;
    for (let attempt = 1; attempt <= maxFallbackAttempts; attempt += 1) {
      fallbackResponse = await fallbackFetchImpl(url, init);
      if (fallbackResponse?.status !== 520 || attempt === maxFallbackAttempts) {
        return fallbackResponse;
      }
      await sleepImpl(1_000);
    }
    return fallbackResponse;
  };
}

export async function curlTpexFetch(url, init = {}) {
  const target = approvedTpexUrl(url);
  const method = typeof init?.method === "string" && init.method.trim() !== ""
    ? init.method.toUpperCase()
    : "GET";
  const body = serializeBody(init?.body);
  const executable = process.platform === "win32" ? "curl.exe" : "curl";
  const args = [
    "--disable",
    "--silent",
    "--show-error",
    "--request", method,
    "--connect-timeout", "10",
    "--max-time", "45",
    "--max-filesize", String(MAX_RESPONSE_BYTES),
    "--output", "-",
    "--write-out", `${CURL_META}%{http_code}\t%{content_type}`,
  ];
  for (const [name, value] of headerEntries(init?.headers)) {
    args.push("--header", `${name}: ${value}`);
  }
  if (body !== null) args.push("--data-raw", body);
  args.push("--", target.toString());

  const { stdout } = await execFileAsync(executable, args, {
    encoding: "utf8",
    maxBuffer: MAX_RESPONSE_BYTES + 16_384,
    windowsHide: true,
  });
  const marker = stdout.lastIndexOf(CURL_META);
  if (marker < 0) throw new TypeError("TPEx curl response is missing transport metadata");
  const payload = stdout.slice(0, marker);
  if (Buffer.byteLength(payload, "utf8") > MAX_RESPONSE_BYTES) {
    throw new TypeError("TPEx curl response exceeds the configured size limit");
  }
  const [statusText, contentType = ""] = stdout.slice(marker + CURL_META.length).trim().split("\t", 2);
  if (!/^[1-5]\d\d$/.test(statusText ?? "")) {
    throw new TypeError("TPEx curl response has an invalid status");
  }
  return new Response(payload, {
    status: Number(statusText),
    headers: contentType === "" ? undefined : { "content-type": contentType },
  });
}

function isApprovedTpexEndpoint(value) {
  try {
    approvedTpexUrl(value);
    return true;
  } catch {
    return false;
  }
}

function approvedTpexUrl(value) {
  const url = new URL(String(value));
  if (
    url.protocol !== "https:"
    || url.hostname !== "www.tpex.org.tw"
    || url.search !== ""
    || !APPROVED_TPEX_PATHS.has(url.pathname)
  ) {
    throw new TypeError("TPEx curl fallback received an unapproved URL");
  }
  return url;
}

function serializeBody(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof URLSearchParams || typeof value === "string") return value.toString();
  throw new TypeError("TPEx curl fallback only accepts URL-encoded request bodies");
}

function headerEntries(value) {
  if (value === undefined || value === null) return [];
  if (value instanceof Headers) return [...value.entries()];
  if (Array.isArray(value)) return value.map(([name, headerValue]) => [String(name), String(headerValue)]);
  if (typeof value === "object") {
    return Object.entries(value).map(([name, headerValue]) => [name, String(headerValue)]);
  }
  throw new TypeError("TPEx curl fallback received invalid headers");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
