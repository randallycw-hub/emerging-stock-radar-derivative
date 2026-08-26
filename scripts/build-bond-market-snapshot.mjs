import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { isIsoDate } from "../lib/domain/dates.ts";
import {
  bondInputsFrom11406Rows,
  bondTermSummariesFrom11406Rows,
} from "./lib/bond-inputs-from-11406.mjs";
import { deriveBondRemainingMetrics } from "../lib/market-data/bond-derived-metrics.ts";
import {
  buildHistoryPoints,
  mergeBondMarketHistoryConservatively,
  parseBondMarketHistory,
} from "../lib/market-data/bond-market-history.ts";
import { buildBondMarketViews } from "../lib/market-data/bond-market-view.ts";
import { mergeConversionPriceVersions } from "../lib/market-data/conversion-price-history.ts";
import { evaluateBondAssessment } from "../lib/market-data/bond-strategy-assessment.ts";
import {
  buildBondWorkbenchSnapshot,
  parseBondWorkbenchSnapshot,
} from "../lib/market-data/bond-workbench.ts";
import {
  buildCbSupplementalSnapshot,
  currentCbRedemption,
  parseCbSupplementalSnapshot,
  summarizeCbInstitution,
} from "../lib/market-data/bond-supplemental.ts";
import {
  buildCbIssuerResearchSnapshot,
  parseCbIssuerResearchSnapshot,
} from "../lib/market-data/cb-issuer-research.ts";
import { getApprovedResource } from "../lib/pipeline/source-registry.ts";
import {
  CB_ISSUER_RESEARCH_SOURCE_POLICIES,
  fetchCbIssuerResearchSources,
} from "../lib/source-verification/source-cb-issuer-research.ts";
import {
  fetchCbSupplementalSources,
  fetchCurrentOfficialMarketData,
} from "./lib/official-market-fetch.mjs";

const MARKET_FILE_ENTRIES = [
  ["cb-quotes.json", "cbQuotes"],
  ["stock-closes.json", "stockCloses"],
  ["conversion-prices.json", "conversionPrices"],
  ["bond-supplemental.json", "supplemental"],
  ["cb-issuer-research.json", "issuerResearch"],
  ["bond-market-view.json", "views"],
  ["bond-market-history.json", "history"],
  ["bond-workbench.json", "workbench"],
];

const CB_ISSUER_RESEARCH_RESOURCES = [
  {
    policy: CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed,
    resourceId: "data-gov-18420-listed-monthly-revenue-csv",
  },
  {
    policy: CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc,
    resourceId: "data-gov-56510-otc-monthly-revenue-csv",
  },
];

const CB_SUPPLEMENTAL_RESOURCES = [
  {
    key: "institution",
    sourceId: "tpex-cb-institution-daily",
    resourceId: "tpex-cb-institution-daily-json",
    exactUrl: "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade",
  },
  {
    key: "redemption",
    sourceId: "tpex-cb-redemption-announcements",
    resourceId: "tpex-cb-redemption-announcements-json",
    exactUrl: "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
  },
  {
    key: "underwriting",
    sourceId: "twsa-cb-underwriting-announcements",
    resourceId: "twsa-cb-underwriting-announcements-html",
    exactUrl: "https://web.twsa.org.tw/edoc2/default.aspx",
  },
];

const WORKBENCH_EVENT_SOURCES = Object.freeze({
  terms: {
    sourceId: "11406",
    sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
  },
  redemption: {
    sourceId: "tpex-cb-redemption-announcements",
    sourceUrl: "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
  },
});

export async function buildBondMarketSnapshot(options = {}) {
  assertPublicOptions(options, [
    "outputDir",
    "bonds",
    "collectImpl",
    "now",
    "manifestBase",
    "asOfDate",
    "previousIssuerResearch",
  ], "buildBondMarketSnapshot");
  const {
    outputDir = "static-showcase/data",
    bonds,
    collectImpl = fetchCurrentOfficialMarketData,
    now = () => new Date(),
    manifestBase,
    asOfDate: requestedAsOfDate,
    previousIssuerResearch,
  } = options;
  const generatedDate = now();
  if (!(generatedDate instanceof Date) || !Number.isFinite(generatedDate.valueOf())) {
    throw new TypeError("now must return a valid Date");
  }
  if (requestedAsOfDate !== undefined && !isIsoDate(requestedAsOfDate)) {
    throw new TypeError("asOfDate must be an ISO date");
  }
  const asOfDate = requestedAsOfDate ?? taipeiDate(generatedDate);
  const normalized11406Text = bonds === undefined
    ? await readFile(join(outputDir, "11406.json"), "utf8")
    : undefined;
  const normalized11406Rows = normalized11406Text === undefined
    ? undefined
    : JSON.parse(normalized11406Text);
  if (normalized11406Rows !== undefined && !Array.isArray(normalized11406Rows)) {
    throw new TypeError("normalized 11406 artifact must be an array");
  }
  const sourceRows = bonds === undefined ? normalized11406Rows : undefined;
  const bondInputs = bonds ?? bondInputsFrom11406Rows(sourceRows);
  if (!Array.isArray(bondInputs)) throw new TypeError("bonds must be an array");
  const baseTerms = sourceRows === undefined
    ? termSummariesFromBondInputs(bondInputs)
    : bondTermSummariesFrom11406Rows(sourceRows);
  const previousWorkbench = await readPreviousWorkbench(outputDir);
  const previousHistory = await readPreviousHistory(outputDir);
  const previousConversionPrices = await readPreviousConversionPrices(outputDir);
  const previousSupplemental = await readPreviousSupplemental(outputDir);
  const validatedPreviousIssuerResearch = previousIssuerResearch === undefined
    ? await readPreviousIssuerResearch(outputDir)
    : parseCbIssuerResearchSnapshot(previousIssuerResearch);
  const bondCodes = bondInputs.map((bond) => bond.bondCode);
  const issuerCodes = [...new Set(bondInputs.map((bond) => bond.issuerCode))];
  const optionalSourceAuthorization = buildProductionCbOptionalSourceAuthorization();
  const collected = await collectImpl({
    bondCodes,
    issuerCodes,
    date: asOfDate,
    optionalSourceAuthorization,
  });
  const issuerResearchSourceResults = collected.issuerResearchSourceResults === undefined
    ? await settleProductionCbIssuerResearchSources()
    : resolveCollectedCbIssuerResearchSources(
      collected.issuerResearchSourceResults,
      optionalSourceAuthorization.issuerResearch,
    );
  const issuerResearchCandidate = buildCbIssuerResearchCandidate({
    generatedAt: generatedDate.toISOString(),
    issuers: issuerInputsFromBonds(bondInputs),
    sourceResults: issuerResearchSourceResults,
    ...(validatedPreviousIssuerResearch === undefined
      ? {}
      : { previous: validatedPreviousIssuerResearch }),
  });
  const issuerResearch = issuerResearchCandidate.snapshot;
  const supplementalSourceResults = await settleProductionCbSupplementalSources(
    asOfDate,
    collected.supplementalSourceResults,
    optionalSourceAuthorization.supplemental,
  );
  const supplemental = buildCbSupplementalSnapshot({
    generatedAt: generatedDate.toISOString(),
    ...(supplementalSourceResults.institution.status === "fulfilled"
      ? { institution: supplementalSourceResults.institution.value }
      : {}),
    ...(supplementalSourceResults.redemption.status === "fulfilled"
      ? {
        redemptions: supplementalSourceResults.redemption.value,
        redemptionYear: Number(asOfDate.slice(0, 4)),
      }
      : {}),
    ...(supplementalSourceResults.underwriting.status === "fulfilled"
      ? { underwriting: supplementalSourceResults.underwriting.value }
      : {}),
    ...(previousSupplemental === undefined ? {} : { previous: previousSupplemental }),
  });
  const conversionPrices = mergeConversionPriceVersions(
    previousConversionPrices,
    collected.conversionPrices,
  );
  const views = buildBondMarketViews({
    asOfDate,
    bonds: bondInputs,
    cbQuotes: collected.cbQuotes,
    stockCloses: collected.stockCloses,
    conversionPrices,
    supplemental,
    issuerResearch: issuerResearch.records,
  });

  const errors = validateCandidate({
    bondInputs,
    collected,
    views,
  });
  if (errors.length > 0) {
    throw new Error(`VALIDATION_FAILED:${errors.join(",")}`);
  }

  await mkdir(outputDir, { recursive: true });
  const currentHistory = buildHistoryPoints({
    cbQuotes: collected.cbQuotes,
    stockCloses: collected.stockCloses,
    conversionPrices,
  });
  const history = mergeBondMarketHistoryConservatively(previousHistory, currentHistory);
  const latestCbPriceDate = latestTradingDate(collected.cbQuotes);
  const latestStockPriceDate = latestTradingDate(collected.stockCloses);
  const dataDate = [latestCbPriceDate, latestStockPriceDate]
    .filter(Boolean)
    .sort()[0] ?? null;
  if (!isIsoDate(dataDate)) {
    throw new Error("VALIDATION_FAILED:WORKBENCH_DATA_DATE");
  }
  const currentTerms = baseTerms.map((term) => ({
    ...term,
    unitFaceValueTwd: supplemental.unitFaceValueTwd,
  }));
  const currentEvents = buildBondWorkbenchEvents({
    terms: currentTerms,
    supplemental,
  });
  const currentSourceStates = buildWorkbenchSourceStates({
    views,
    supplemental,
    issuerResearch,
  });
  const workbench = buildBondWorkbenchSnapshot({
    generatedAt: generatedDate.toISOString(),
    dataDate,
    asOfDate: collected.requestedDate ?? asOfDate,
    currentTerms,
    currentViews: views,
    currentEvents,
    currentSourceStates,
    currentAssessments: buildCandidateAssessments(views, history),
    ...(previousWorkbench === undefined ? {} : { previous: previousWorkbench }),
  });
  const workbenchSourceStateSummary = summarizeWorkbenchSourceStates(workbench);
  const stagingDir = await mkdtemp(join(dirname(outputDir), ".cb-market-"));
  try {
    const documents = {
      cbQuotes: collected.cbQuotes,
      stockCloses: collected.stockCloses,
      conversionPrices,
      supplemental,
      issuerResearch,
      views,
      history,
      workbench,
    };
    const files = [];
    for (const [name, key] of MARKET_FILE_ENTRIES) {
      const text = key === "issuerResearch"
        ? issuerResearchCandidate.artifact.text
        : `${JSON.stringify(documents[key], null, 2)}\n`;
      await writeFile(join(stagingDir, name), text, "utf8");
      files.push({
        name,
        sha256: sha256(text),
        rawBytes: Buffer.byteLength(text, "utf8"),
        recordCount: key === "issuerResearch"
          ? documents[key].records.length
          : key === "supplemental"
            ? countSupplementalRecords(documents[key])
            : key === "workbench"
              ? documents[key].records.length
              : documents[key].length,
        ...(key === "workbench"
          ? {
            schemaVersion: workbench.schemaVersion,
            sourceStateSummary: workbenchSourceStateSummary,
          }
          : {}),
      });
    }

    const currentManifest = manifestBase
      ?? await readOptionalJson(join(outputDir, "manifest.json"))
      ?? {
        kind: "official-source-snapshot",
        generatedAt: asOfDate,
        datasets: [],
      };
    const manifest = {
      ...currentManifest,
      market: {
        status: "verified",
        generatedAt: generatedDate.toISOString(),
        requestedDate: collected.requestedDate ?? asOfDate,
        latestCbPriceDate,
        latestStockPriceDate,
        dataDate,
        supplementalSources: supplemental.sources,
        workbenchSourceStateSummary,
        ...(normalized11406Text === undefined ? {} : {
          normalizedInputs: [{
            name: "11406.json",
            sha256: sha256(normalized11406Text),
            rawBytes: Buffer.byteLength(normalized11406Text, "utf8"),
            recordCount: normalized11406Rows.length,
          }],
        }),
        files,
      },
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(join(stagingDir, "manifest.json"), manifestText, "utf8");
    await verifyStagedFiles(
      stagingDir,
      files,
      manifestText,
      bondInputs,
      currentTerms,
      previousWorkbench,
    );
    await publishAtomically(
      stagingDir,
      outputDir,
      [...files.map((file) => file.name), "manifest.json"],
    );

    return {
      status: "published",
      files: files.map((file) => file.name),
      manifest,
      supplemental,
      issuerResearch,
      views,
      workbench,
      report: {
        generatedAt: generatedDate.toISOString(),
        requestedDate: collected.requestedDate ?? asOfDate,
        dataDate,
        validation: "passed",
        concurrency: 2,
        counts: {
          bonds: bondInputs.length,
          cbQuotes: collected.cbQuotes.length,
          stockCloses: collected.stockCloses.length,
          conversionPrices: conversionPrices.length,
          supplemental: countSupplementalRecords(supplemental),
          issuerResearch: issuerResearch.records.length,
          views: views.length,
          workbench: workbench.records.length,
          missingViews: views.filter((view) => view.missingReasons.length > 0).length,
        },
        sourceUrls: collected.sourceUrls ?? [],
      },
    };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function settleProductionCbIssuerResearchSources({
  fetchSourcesImpl = fetchCbIssuerResearchSources,
} = {}) {
  const error = productionIssuerResearchApprovalError();
  if (error !== undefined) {
    return {
      listed: { status: "rejected", reason: error },
      otc: { status: "rejected", reason: error },
    };
  }
  if (typeof fetchSourcesImpl !== "function") {
    throw new TypeError("fetchSourcesImpl must be a function");
  }
  return validateSettledIssuerResearchSources(await fetchSourcesImpl());
}

function resolveCollectedCbIssuerResearchSources(sourceResults, authorization) {
  const settled = validateSettledIssuerResearchSources(sourceResults);
  return {
    listed: authorization.listed.approved
      ? settled.listed
      : rejectedAuthorization(authorization.listed),
    otc: authorization.otc.approved
      ? settled.otc
      : rejectedAuthorization(authorization.otc),
  };
}

async function settleProductionCbSupplementalSources(date, sourceResults, authorization) {
  if (sourceResults === undefined) {
    const error = productionCbSupplementalApprovalError();
    if (error !== undefined) {
      return {
        institution: { status: "rejected", reason: error },
        redemption: { status: "rejected", reason: error },
        underwriting: { status: "rejected", reason: error },
      };
    }
    return fetchCbSupplementalSources({ date });
  }
  const settled = validateSettledSupplementalSources(sourceResults);
  return {
    institution: authorization.institution.approved
      ? settled.institution
      : rejectedAuthorization(authorization.institution),
    redemption: authorization.redemption.approved
      ? settled.redemption
      : rejectedAuthorization(authorization.redemption),
    underwriting: authorization.underwriting.approved
      ? settled.underwriting
      : rejectedAuthorization(authorization.underwriting),
  };
}

function rejectedAuthorization(authorization) {
  return {
    status: "rejected",
    reason: new Error(authorization.reason),
  };
}

function validateSettledSupplementalSources(value) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !hasExactEnumerableKeys(value, ["institution", "redemption", "underwriting"])
  ) {
    throw new TypeError("CB supplemental source results must contain exact source results");
  }
  return {
    institution: validateOpaqueSettledResult(value.institution, "institution"),
    redemption: validateOpaqueSettledResult(value.redemption, "redemption"),
    underwriting: validateOpaqueSettledResult(value.underwriting, "underwriting"),
  };
}

function validateOpaqueSettledResult(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a settled result`);
  }
  if (value.status === "fulfilled" && hasExactEnumerableKeys(value, ["status", "value"])) {
    return { status: "fulfilled", value: value.value };
  }
  if (value.status === "rejected" && hasExactEnumerableKeys(value, ["status", "reason"])) {
    return { status: "rejected", reason: value.reason };
  }
  throw new TypeError(`${name} must be an exact settled result`);
}

function productionCbSupplementalApprovalError() {
  const authorization = buildProductionCbOptionalSourceAuthorization().supplemental;
  return Object.values(authorization).every((item) => item.approved)
    ? undefined
    : new Error("CB supplemental sources are not approved for production");
}

function buildProductionCbOptionalSourceAuthorization() {
  return Object.freeze({
    issuerResearch: Object.freeze(Object.fromEntries(
      CB_ISSUER_RESEARCH_RESOURCES.map(({ policy, resourceId }) => [
        policy.market,
        authorizeProductionResource({
          sourceId: policy.sourceId,
          resourceId,
          exactUrl: policy.url,
        }),
      ]),
    )),
    supplemental: Object.freeze(Object.fromEntries(
      CB_SUPPLEMENTAL_RESOURCES.map(({ key, ...policy }) => [
        key,
        authorizeProductionResource(policy),
      ]),
    )),
  });
}

function authorizeProductionResource(policy) {
  try {
    const resource = getApprovedResource(policy.sourceId, policy.resourceId);
    if (
      resource.approvalStatus === "APPROVED_FOR_PRODUCTION"
      && resource.exactUrl === policy.exactUrl
    ) {
      return Object.freeze({
        approved: true,
        exactUrl: policy.exactUrl,
        reason: null,
      });
    }
  } catch {
    // A missing central registry record is the same fail-closed state as revocation.
  }
  return Object.freeze({
    approved: false,
    exactUrl: policy.exactUrl,
    reason: `OPTIONAL_RESOURCE_NOT_APPROVED:${policy.sourceId}/${policy.resourceId}`,
  });
}

export function buildCbIssuerResearchCandidate({
  generatedAt,
  issuers,
  sourceResults,
  previous,
} = {}) {
  const settled = validateSettledIssuerResearchSources(sourceResults);
  const snapshot = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers,
    ...settled,
    ...(previous === undefined ? {} : { previous }),
  });
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  return Object.freeze({
    snapshot,
    artifact: Object.freeze({
      name: "cb-issuer-research.json",
      text,
      sha256: sha256(text),
      recordCount: snapshot.records.length,
    }),
    viewRecords: snapshot.records,
  });
}

function productionIssuerResearchApprovalError() {
  const authorization = buildProductionCbOptionalSourceAuthorization().issuerResearch;
  return Object.values(authorization).every((item) => item.approved)
    ? undefined
    : new Error("CB issuer research sources are not approved for production");
}

function validateSettledIssuerResearchSources(
  value,
  name = "CB issuer research source results",
) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !hasExactEnumerableKeys(value, ["listed", "otc"])
  ) {
    throw new TypeError(`${name} must contain exact listed and otc results`);
  }
  return {
    listed: validateSettledResult(value.listed, `${name}.listed`),
    otc: validateSettledResult(value.otc, `${name}.otc`),
  };
}

function assertPublicOptions(value, allowed, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} options must be an object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      throw new TypeError(`${String(key)} is not supported by ${name}`);
    }
  }
}

function validateSettledResult(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a settled result`);
  }
  if (value.status === "fulfilled") {
    if (!hasExactEnumerableKeys(value, ["status", "value"]) || typeof value.value !== "string") {
      throw new TypeError(`${name} fulfilled value must be a CSV string`);
    }
    return { status: "fulfilled", value: value.value };
  }
  if (value.status === "rejected") {
    if (!hasExactEnumerableKeys(value, ["status", "reason"])) {
      throw new TypeError(`${name} rejected result is invalid`);
    }
    return { status: "rejected", reason: value.reason };
  }
  throw new TypeError(`${name} must be fulfilled or rejected`);
}

function issuerInputsFromBonds(bonds) {
  return bonds.map((bond, index) => {
    if (bond === null || typeof bond !== "object" || Array.isArray(bond)) {
      throw new TypeError(`bond ${index} must be an object`);
    }
    return {
      issuerCode: requiredPlainText(bond.issuerCode, `bond ${index} issuerCode`),
      issuerName: requiredPlainText(bond.issuerName, `bond ${index} issuerName`),
    };
  });
}

function requiredPlainText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

async function readPreviousIssuerResearch(outputDir) {
  const value = await readOptionalJson(join(outputDir, "cb-issuer-research.json"));
  return value === undefined ? undefined : parseCbIssuerResearchSnapshot(value);
}

async function readPreviousWorkbench(outputDir) {
  const value = await readOptionalJson(join(outputDir, "bond-workbench.json"));
  if (value === undefined) return undefined;
  try {
    return parseBondWorkbenchSnapshot(value);
  } catch (error) {
    throw new TypeError(`previous bond workbench is invalid: ${error.message}`);
  }
}

async function readPreviousSupplemental(outputDir) {
  const value = await readOptionalJson(join(outputDir, "bond-supplemental.json"));
  if (value === undefined) return undefined;
  try {
    return parseCbSupplementalSnapshot(value);
  } catch (error) {
    throw new TypeError(`previous supplemental snapshot is invalid: ${error.message}`);
  }
}

async function readPreviousHistory(outputDir) {
  const value = await readOptionalJson(join(outputDir, "bond-market-history.json"));
  try {
    return parseBondMarketHistory(value ?? []);
  } catch (error) {
    throw new TypeError(`previous bond market history is invalid: ${error.message}`);
  }
}

async function readPreviousConversionPrices(outputDir) {
  const value = await readOptionalJson(join(outputDir, "conversion-prices.json"));
  try {
    return mergeConversionPriceVersions([], value ?? []);
  } catch (error) {
    throw new TypeError(`previous conversion price versions are invalid: ${error.message}`);
  }
}

function countSupplementalRecords(snapshot) {
  return Object.values(snapshot.institutionHistory)
    .reduce((count, records) => count + records.length, 0)
    + snapshot.redemptions.length
    + snapshot.underwritingCases.length;
}

function latestTradingDate(records) {
  return records
    .map((record) => record.tradingDate)
    .filter(isIsoDate)
    .sort()
    .at(-1) ?? null;
}

export { bondInputsFrom11406Rows };

function validateCandidate({ bondInputs, collected, views }) {
  const errors = [];
  if (bondInputs.length === 0) errors.push("EMPTY_BOND_INPUT");
  if (!Array.isArray(collected.cbQuotes) || collected.cbQuotes.length === 0) {
    errors.push("EMPTY_CB_QUOTES");
  }
  if (!Array.isArray(collected.stockCloses) || collected.stockCloses.length === 0) {
    errors.push("EMPTY_STOCK_CLOSES");
  }
  if (
    !Array.isArray(collected.conversionPrices)
    || collected.conversionPrices.length === 0
  ) {
    errors.push("EMPTY_CONVERSION_PRICES");
  }
  if (views.length === 0) errors.push("EMPTY_BOND_MARKET_VIEW");
  if (new Set(views.map((view) => view.bondCode)).size !== views.length) {
    errors.push("DUPLICATE_BOND_CODE");
  }
  if (views.some((view) => view.premiumRate !== null && view.valuationDate === null)) {
    errors.push("DERIVED_VALUE_WITHOUT_VALUATION_DATE");
  }
  if ((collected.sourceUrls ?? []).some((url) => !isApprovedOfficialUrl(url))) {
    errors.push("UNAPPROVED_SOURCE_URL");
  }
  return errors;
}

async function verifyStagedFiles(
  stagingDir,
  files,
  manifestText,
  bondInputs,
  currentTerms,
  previousWorkbench,
) {
  let stagedIssuerResearch;
  let stagedSupplemental;
  let stagedHistory;
  let stagedViews;
  let stagedWorkbench;
  for (const file of files) {
    const text = await readFile(join(stagingDir, file.name), "utf8");
    if (file.rawBytes !== Buffer.byteLength(text, "utf8")) {
      throw new Error(`VALIDATION_FAILED:STAGED_BYTES_MISMATCH:${file.name}`);
    }
    const parsed = JSON.parse(text);
    if (file.name === "cb-issuer-research.json") {
      stagedIssuerResearch = parseCbIssuerResearchSnapshot(parsed);
      if (stagedIssuerResearch.records.length !== file.recordCount) {
        throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
      }
    } else if (file.name === "bond-supplemental.json") {
      stagedSupplemental = parseCbSupplementalSnapshot(parsed);
      if (countSupplementalRecords(stagedSupplemental) !== file.recordCount) {
        throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
      }
    } else if (file.name === "bond-market-history.json") {
      stagedHistory = parseBondMarketHistory(parsed);
      if (stagedHistory.length !== file.recordCount) {
        throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
      }
    } else if (file.name === "bond-workbench.json") {
      stagedWorkbench = parseBondWorkbenchSnapshot(parsed);
      if (
        stagedWorkbench.records.length !== file.recordCount
        || file.rawBytes !== Buffer.byteLength(text, "utf8")
        || file.schemaVersion !== stagedWorkbench.schemaVersion
        || !equalPlainJson(
          file.sourceStateSummary,
          summarizeWorkbenchSourceStates(stagedWorkbench),
        )
      ) {
        throw new Error(`VALIDATION_FAILED:STAGED_WORKBENCH_METADATA:${file.name}`);
      }
    } else if (!Array.isArray(parsed) || parsed.length !== file.recordCount) {
      throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
    }
    if (file.name === "bond-market-view.json") stagedViews = parsed;
    if (sha256(text) !== file.sha256) {
      throw new Error(`VALIDATION_FAILED:STAGED_HASH_MISMATCH:${file.name}`);
    }
  }
  const manifest = JSON.parse(manifestText);
  const manifestFiles = manifest?.market?.files;
  if (
    !Array.isArray(manifestFiles)
    || manifestFiles.length !== files.length
    || files.some((file) => {
      const entry = manifestFiles.find((candidate) => candidate?.name === file.name);
      return entry?.sha256 !== file.sha256
        || entry?.rawBytes !== file.rawBytes
        || entry?.recordCount !== file.recordCount;
    })
  ) {
    throw new Error("VALIDATION_FAILED:MARKET_MANIFEST_FILES");
  }
  if (
    stagedIssuerResearch === undefined
    || stagedSupplemental === undefined
    || stagedHistory === undefined
    || stagedViews === undefined
    || stagedWorkbench === undefined
  ) {
    throw new Error("VALIDATION_FAILED:MARKET_ARTIFACTS");
  }
  verifyIssuerResearchViewConsistency(stagedIssuerResearch, stagedViews);
  verifySupplementalViewConsistency(
    stagedSupplemental,
    stagedViews,
    manifest?.market?.requestedDate,
    bondInputs,
  );
  verifyWorkbenchConsistency({
    workbench: stagedWorkbench,
    terms: currentTerms,
    views: stagedViews,
    history: stagedHistory,
    supplemental: stagedSupplemental,
    issuerResearch: stagedIssuerResearch,
    requestedDate: manifest?.market?.requestedDate,
    dataDate: manifest?.market?.dataDate,
    sourceStateSummary: manifest?.market?.workbenchSourceStateSummary,
    previous: previousWorkbench,
  });
}

export function buildBondWorkbenchEvents({ terms, supplemental }) {
  const knownBondCodes = new Set(terms.map((term) => term.bondCode));
  const events = [];
  for (const term of terms) {
    if (term.listingDate !== null) {
      events.push(termEvent(term, "listing", term.listingDate, "掛牌日"));
    }
    for (const date of term.putDates) {
      events.push(termEvent(term, "put", date, "賣回權日期"));
    }
    events.push(termEvent(term, "maturity", term.maturityDate, "到期日"));
  }
  for (const redemption of supplemental.redemptions) {
    if (!knownBondCodes.has(redemption.bondCode)) continue;
    events.push({
      bondCode: redemption.bondCode,
      eventId: `redemption:${redemption.announcementDate}:${redemption.delistingDate}`,
      type: "redemption",
      date: redemption.announcementDate,
      title: `${redemption.bondName}贖回公告`,
      ...WORKBENCH_EVENT_SOURCES.redemption,
    });
    events.push({
      bondCode: redemption.bondCode,
      eventId: `delisting:${redemption.delistingDate}`,
      type: "delisting",
      date: redemption.delistingDate,
      title: `${redemption.bondName}終止櫃檯買賣`,
      ...WORKBENCH_EVENT_SOURCES.redemption,
    });
  }
  return events.sort((left, right) => (
    left.bondCode.localeCompare(right.bondCode)
    || left.date.localeCompare(right.date)
    || left.eventId.localeCompare(right.eventId)
  ));
}

export function buildWorkbenchSourceStates({ views, supplemental, issuerResearch }) {
  return views.map((view) => ({
    bondCode: view.bondCode,
    institutions: supplemental.sources.institution.state,
    company: issuerSourceState(view, issuerResearch),
    events: supplemental.sources.redemption.state,
  }));
}

function issuerSourceState(view, issuerResearch) {
  if (view.issuerResearch === null) return "unavailable";
  const status = issuerResearch.sources[view.issuerResearch.market]?.status;
  if (status === "current") return "fresh";
  if (status === "stale") return "stale";
  return "unavailable";
}

function termEvent(term, type, date, label) {
  return {
    bondCode: term.bondCode,
    eventId: `11406:${type}:${date}`,
    type,
    date,
    title: `${term.bondName}${label}`,
    ...WORKBENCH_EVENT_SOURCES.terms,
  };
}

export function verifyWorkbenchConsistency({
  workbench,
  terms,
  views,
  history,
  supplemental,
  issuerResearch,
  requestedDate,
  dataDate,
  sourceStateSummary,
  previous,
  allowHistoricalAssessments = false,
}) {
  const snapshot = parseBondWorkbenchSnapshot(workbench);
  const parsedHistory = parseBondMarketHistory(history);
  if (
    !Array.isArray(terms)
    || !Array.isArray(views)
    || !isIsoDate(requestedDate)
    || !isIsoDate(dataDate)
    || snapshot.dataDate !== dataDate
  ) {
    throw new Error("VALIDATION_FAILED:WORKBENCH_ENVELOPE");
  }
  const termsByCode = uniqueByBondCode(terms, "WORKBENCH_TERM");
  const viewsByCode = uniqueByBondCode(views, "WORKBENCH_VIEW");
  const recordsByCode = uniqueByBondCode(snapshot.records, "WORKBENCH_RECORD");
  if (
    termsByCode.size !== viewsByCode.size
    || [...termsByCode.keys()].some((code) => !viewsByCode.has(code))
  ) {
    throw new Error("VALIDATION_FAILED:WORKBENCH_CURRENT_BOND_CODES");
  }
  const canonicalViews = [];
  for (const [bondCode, term] of termsByCode) {
    const view = viewsByCode.get(bondCode);
    const publishedView = recordsByCode.get(bondCode)?.view;
    if (
      publishedView === undefined
      ||
      term.issuerCode !== view.issuerCode
      || term.bondName !== view.bondName
    ) {
      throw new Error(`VALIDATION_FAILED:WORKBENCH_CURRENT_MISMATCH:${bondCode}`);
    }
    if (
      !equalPlainJson(view, publishedView)
      && !equalPlainJson(view, withoutMarketStatus(publishedView))
    ) {
      throw new Error(`VALIDATION_FAILED:WORKBENCH_VIEW_MISMATCH:${bondCode}`);
    }
    canonicalViews.push(publishedView);
  }
  if (parsedHistory.some((point) => !recordsByCode.has(point.bondCode))) {
    throw new Error("VALIDATION_FAILED:WORKBENCH_HISTORY_BOND_CODE");
  }
  const expectedPrevious = previous ?? {
    ...snapshot,
    records: snapshot.records.filter((record) => !termsByCode.has(record.bondCode)),
  };
  const expected = buildBondWorkbenchSnapshot({
    generatedAt: snapshot.generatedAt,
    dataDate,
    asOfDate: requestedDate,
    currentTerms: terms,
    currentViews: canonicalViews,
    currentEvents: buildBondWorkbenchEvents({ terms, supplemental }),
    currentSourceStates: buildWorkbenchSourceStates({
      views: canonicalViews,
      supplemental,
      issuerResearch,
    }),
    currentAssessments: buildCandidateAssessments(canonicalViews, parsedHistory),
    previous: expectedPrevious,
  });
  if (!equalPlainJson(snapshot, expected)) {
    const historicalAssessmentDrift = (
      allowHistoricalAssessments
      && equalPlainJson(
        withoutWorkbenchAssessments(snapshot),
        withoutWorkbenchAssessments(expected),
      )
    );
    if (!historicalAssessmentDrift) {
      const expectedByCode = new Map(expected.records.map((record) => [
        record.bondCode,
        record,
      ]));
      if (snapshot.records.some((record) => (
        termsByCode.has(record.bondCode)
        && !equalPlainJson(record.assessment, expectedByCode.get(record.bondCode)?.assessment)
      ))) {
        throw new Error("VALIDATION_FAILED:WORKBENCH_HISTORY_ASSESSMENT");
      }
      throw new Error(
        `VALIDATION_FAILED:WORKBENCH_CANDIDATE_MISMATCH:${firstJsonDifference(
          allowHistoricalAssessments ? withoutWorkbenchAssessments(snapshot) : snapshot,
          allowHistoricalAssessments ? withoutWorkbenchAssessments(expected) : expected,
        )}`,
      );
    }
  }
  if (!equalPlainJson(
    sourceStateSummary,
    summarizeWorkbenchSourceStates(snapshot),
  )) {
    throw new Error("VALIDATION_FAILED:WORKBENCH_SOURCE_STATE");
  }
  verifyIssuerResearchViewConsistency(issuerResearch, canonicalViews);
  verifySupplementalViewConsistency(supplemental, canonicalViews, requestedDate, terms);
  return snapshot;
}

function withoutMarketStatus(view) {
  return Object.fromEntries(Object.entries(view).filter(([key]) => key !== "marketStatus"));
}

function withoutWorkbenchAssessments(workbench) {
  return {
    ...workbench,
    records: workbench.records.map((record) => Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "assessment"),
    )),
  };
}

function firstJsonDifference(left, right, path = "$") {
  if (Object.is(left, right)) return "unknown";
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${path}.length`;
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstJsonDifference(left[index], right[index], `${path}[${index}]`);
      if (difference !== "unknown") return difference;
    }
    return "unknown";
  }
  if (
    left !== null
    && right !== null
    && typeof left === "object"
    && typeof right === "object"
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!equalPlainJson(leftKeys, rightKeys)) return `${path}.keys`;
    for (const key of leftKeys) {
      const difference = firstJsonDifference(left[key], right[key], `${path}.${key}`);
      if (difference !== "unknown") return difference;
    }
    return "unknown";
  }
  return path;
}

export function summarizeWorkbenchSourceStates(workbench) {
  const snapshot = parseBondWorkbenchSnapshot(workbench);
  const states = ["complete", "stale", "date_mismatch", "missing", "accumulating"];
  const fields = [
    "price",
    "valuation",
    "outstanding",
    "institutions",
    "company",
    "events",
    "history",
  ];
  return {
    lifecycle: {
      active: snapshot.records.filter((record) => record.status === "active").length,
      archived: snapshot.records.filter((record) => record.status === "archived").length,
    },
    fields: Object.fromEntries(fields.map((field) => [
      field,
      Object.fromEntries(states.map((state) => [
        state,
        snapshot.records.filter((record) => record.fieldStates[field] === state).length,
      ])),
    ])),
  };
}

function uniqueByBondCode(records, code) {
  const output = new Map();
  for (const record of records) {
    if (
      record === null
      || typeof record !== "object"
      || Array.isArray(record)
      || typeof record.bondCode !== "string"
      || !/^\d{5,6}$/.test(record.bondCode)
      || output.has(record.bondCode)
    ) {
      throw new Error(`VALIDATION_FAILED:${code}_BOND_CODE`);
    }
    output.set(record.bondCode, record);
  }
  return output;
}

function buildCandidateAssessments(views, history) {
  return views.map((view) => ({
    bondCode: view.bondCode,
    assessment: evaluateBondAssessment({
      view,
      history: history.filter((point) => point.bondCode === view.bondCode),
      spreadPercent: null,
      spreadDataDate: null,
      borrowability: "unknown",
      conversionSuspended: null,
      publicFinancials: {
        ttmProfitState: "unknown",
        revenueTrendState: "unknown",
        psPercentile: null,
        dataDate: null,
        sourceId: null,
      },
    }),
  }));
}

export function verifyIssuerResearchViewConsistency(snapshot, views) {
  if (!Array.isArray(views)) {
    throw new Error("VALIDATION_FAILED:BOND_MARKET_VIEW_ENVELOPE");
  }
  const researchByCode = new Map(
    snapshot.records.map((record) => [record.issuerCode, publicIssuerResearch(record)]),
  );
  const viewedIssuerCodes = new Set();
  for (const view of views) {
    if (view === null || typeof view !== "object" || Array.isArray(view)) {
      throw new Error("VALIDATION_FAILED:BOND_MARKET_VIEW_ENVELOPE");
    }
    const expected = researchByCode.get(view.issuerCode) ?? null;
    if (!equalPlainJson(view.issuerResearch, expected)) {
      throw new Error(`VALIDATION_FAILED:ISSUER_RESEARCH_VIEW_MISMATCH:${view.issuerCode}`);
    }
    viewedIssuerCodes.add(view.issuerCode);
  }
  if (snapshot.records.some((record) => !viewedIssuerCodes.has(record.issuerCode))) {
    throw new Error("VALIDATION_FAILED:ORPHAN_ISSUER_RESEARCH");
  }
}

export function verifySupplementalViewConsistency(
  snapshot,
  views,
  asOfDate,
  bondInputs,
) {
  const supplemental = parseCbSupplementalSnapshot(snapshot);
  if (!isIsoDate(asOfDate) || !Array.isArray(views)) {
    throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_VIEW_ENVELOPE");
  }
  const issuanceByBondCode = verifiedIssuanceEvidence(bondInputs, views);
  for (const view of views) {
    if (
      view === null
      || typeof view !== "object"
      || Array.isArray(view)
      || !/^\d{5,6}$/.test(view.bondCode ?? "")
    ) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_VIEW_ENVELOPE");
    }
    const institution = summarizeCbInstitution(
      supplemental,
      view.bondCode,
      asOfDate,
    );
    const institutionFieldsMatch = (
      view.institutionDataDate === institution.dataDate
      && view.institutionNetUnits === institution.dailyNetUnits
      && view.institutionNet5dUnits === institution.net5dUnits
      && view.institutionNet20dUnits === institution.net20dUnits
    );
    const redemption = currentCbRedemption(supplemental, view.bondCode, asOfDate);
    const redemptionMatches =
      JSON.stringify(view.redemptionEvent) === JSON.stringify(redemption);
    const issuance = issuanceByBondCode.get(view.bondCode);
    let remainingMetrics;
    try {
      remainingMetrics = deriveBondRemainingMetrics({
        issueAmount: issuance.issueAmount,
        outstandingAmount: issuance.outstandingAmount,
        outstandingDataDate: issuance.outstandingDataDate,
        faceValueTwd: supplemental.unitFaceValueTwd,
        cbTradeUnits: view.cbTradeUnits,
        cbTradeDate: view.cbPriceDate,
      });
    } catch {
      throw new Error(`VALIDATION_FAILED:SUPPLEMENTAL_VIEW_MISMATCH:${view.bondCode}`);
    }
    const derivedReasonsMatch = derivedMissingReasonsMatch(
      view.missingReasons,
      remainingMetrics.missingReasons,
    );
    const expectedQuality = remainingMetrics.missingReasons.includes(
      "BALANCE_TRADE_DATE_MISMATCH",
    )
      ? "date_mismatch"
      : view.missingReasons.length > 0
        ? "partial"
        : "complete";
    const remainingFieldsMatch = (
      view.outstandingAmount === issuance.outstandingAmount
      && view.outstandingDataDate === issuance.outstandingDataDate
      && view.remainingUnits === remainingMetrics.remainingUnits
      && view.remainingRatio === remainingMetrics.remainingRatio
      && view.dailyTurnoverRate === remainingMetrics.dailyTurnoverRate
      && derivedReasonsMatch
      && view.dataQuality === expectedQuality
    );
    if (!institutionFieldsMatch || !redemptionMatches || !remainingFieldsMatch) {
      throw new Error(`VALIDATION_FAILED:SUPPLEMENTAL_VIEW_MISMATCH:${view.bondCode}`);
    }
  }
}

const DERIVED_MISSING_REASONS = new Set([
  "NO_VERIFIED_FACE_VALUE",
  "OUTSTANDING_NOT_INTEGER",
  "OUTSTANDING_NOT_DIVISIBLE",
  "INVALID_ISSUE_AMOUNT",
  "BALANCE_TRADE_DATE_MISMATCH",
  "ZERO_REMAINING_UNITS",
]);

function verifiedIssuanceEvidence(bondInputs, views) {
  if (!Array.isArray(bondInputs)) {
    throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_ISSUANCE_EVIDENCE");
  }
  const evidence = new Map();
  for (const bond of bondInputs) {
    if (bond === null || typeof bond !== "object" || Array.isArray(bond)) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_ISSUANCE_EVIDENCE");
    }
    const { bondCode, issueAmount, outstandingAmount, outstandingDataDate } = bond;
    if (
      typeof bondCode !== "string"
      || !/^\d{5,6}$/.test(bondCode)
      || evidence.has(bondCode)
      || !isOptionalCanonicalAmount(issueAmount)
      || !isOptionalCanonicalAmount(outstandingAmount)
      || !(
        outstandingDataDate === null
        || typeof outstandingDataDate === "string" && isIsoDate(outstandingDataDate)
      )
      || outstandingAmount !== null && outstandingDataDate === null
    ) {
      throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_ISSUANCE_EVIDENCE");
    }
    evidence.set(bondCode, { issueAmount, outstandingAmount, outstandingDataDate });
  }
  const viewCodes = views.map((view) => view?.bondCode);
  if (
    evidence.size !== views.length
    || new Set(viewCodes).size !== views.length
    || viewCodes.some((bondCode) => !evidence.has(bondCode))
  ) {
    throw new Error("VALIDATION_FAILED:SUPPLEMENTAL_ISSUANCE_EVIDENCE");
  }
  return evidence;
}

function isOptionalCanonicalAmount(value) {
  return value === null
    || typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function derivedMissingReasonsMatch(actual, expected) {
  if (!Array.isArray(actual) || actual.some((reason) => typeof reason !== "string")) {
    return false;
  }
  const actualDerived = actual.filter((reason) => DERIVED_MISSING_REASONS.has(reason));
  return new Set(actualDerived).size === actualDerived.length
    && actualDerived.length === expected.length
    && expected.every((reason) => actualDerived.includes(reason));
}

function publicIssuerResearch(record) {
  return {
    market: record.market,
    industryName: record.industryName,
    revenueMonth: record.revenueMonth,
    sourcePublishedOn: record.sourcePublishedOn,
    revenueUnit: record.revenueUnit,
    currentMonthRevenue: record.currentMonthRevenue,
    monthOverMonthPercent: record.monthOverMonthPercent,
    yearOverYearPercent: record.yearOverYearPercent,
    cumulativeRevenue: record.cumulativeRevenue,
    cumulativeYearOverYearPercent: record.cumulativeYearOverYearPercent,
  };
}

function equalPlainJson(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equalPlainJson(value, right[index]));
  }
  if (
    left === null
    || right === null
    || typeof left !== "object"
    || typeof right !== "object"
  ) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index]
      && equalPlainJson(left[key], right[key])
    ))
  );
}

async function publishAtomically(stagingDir, outputDir, names) {
  const backupDir = join(stagingDir, "backup");
  await mkdir(backupDir);
  const existed = new Set();
  for (const name of names) {
    const target = join(outputDir, name);
    if (await pathExists(target)) {
      existed.add(name);
      await copyFile(target, join(backupDir, name));
    }
  }

  try {
    for (const name of names) {
      await rename(join(stagingDir, name), join(outputDir, name));
    }
  } catch (error) {
    for (const name of names) {
      const target = join(outputDir, name);
      if (existed.has(name)) {
        await copyFile(join(backupDir, name), target);
      } else {
        await rm(target, { force: true });
      }
    }
    throw error;
  }
}

async function loadBondRows(outputDir) {
  return JSON.parse(await readFile(join(outputDir, "11406.json"), "utf8"));
}

function termSummariesFromBondInputs(bonds) {
  return bonds.map((bond, index) => {
    if (bond === null || typeof bond !== "object" || Array.isArray(bond)) {
      throw new TypeError(`bond ${index} must be an object`);
    }
    return {
      bondCode: bond.bondCode,
      issuerCode: bond.issuerCode,
      bondName: bond.shortName,
      issuerName: bond.issuerName,
      issueDate: null,
      listingDate: null,
      maturityDate: bond.maturityDate,
      issueAmount: bond.issueAmount,
      outstandingAmount: bond.outstandingAmount,
      outstandingDataDate: bond.outstandingDataDate,
      initialConversionPrice: null,
      conversionStartDate: null,
      conversionEndDate: null,
      putDates: bond.putDates,
      putPrice: null,
      securedStatus: null,
      underwriter: null,
      trustee: null,
      unitFaceValueTwd: null,
    };
  });
}

function isApprovedOfficialUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.hostname === "openapi.twse.com.tw") {
      return url.pathname === "/v1/exchangeReport/STOCK_DAY_ALL";
    }
    if (url.hostname === "mopsov.twse.com.tw") {
      return url.pathname === "/mops/web/t120sg01";
    }
    if (url.hostname === "www.tpex.org.tw") {
      return new Set([
        "/www/zh-tw/bond/cbDayQry",
        "/openapi/v1/tpex_mainboard_daily_close_quotes",
        "/www/zh-tw/bond/convSearch",
      ]).has(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}


async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function hasExactEnumerableKeys(value, expected) {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length
    && keys.every((key) => (
      typeof key === "string"
      && expected.includes(key)
      && Object.prototype.propertyIsEnumerable.call(value, key)
    ))
  );
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function taipeiDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  const dryRun = process.env.CB_MARKET_DRY_RUN === "1";
  if (dryRun) {
    const outputDir = "static-showcase/data";
    const bonds = bondInputsFrom11406Rows(await loadBondRows(outputDir));
    const collected = await fetchCurrentOfficialMarketData({
      bondCodes: bonds.map((bond) => bond.bondCode),
      issuerCodes: [...new Set(bonds.map((bond) => bond.issuerCode))],
      date: taipeiDate(new Date()),
    });
    const views = buildBondMarketViews({
      asOfDate: collected.requestedDate,
      bonds,
      cbQuotes: collected.cbQuotes,
      stockCloses: collected.stockCloses,
      conversionPrices: collected.conversionPrices,
    });
    const errors = validateCandidate({ bondInputs: bonds, collected, views });
    if (errors.length > 0) throw new Error(`VALIDATION_FAILED:${errors.join(",")}`);
    console.log(JSON.stringify({
      mode: "dry-run",
      concurrency: 2,
      validation: "passed",
      published: false,
      counts: {
        bonds: bonds.length,
        cbQuotes: collected.cbQuotes.length,
        stockCloses: collected.stockCloses.length,
        conversionPrices: collected.conversionPrices.length,
        views: views.length,
      },
      sourceUrls: collected.sourceUrls,
    }, null, 2));
  } else {
    console.log(JSON.stringify(await buildBondMarketSnapshot(), null, 2));
  }
}
