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
