import { safeJsonFetch } from "./site-shell.js";

const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
  datasets: {},
};

export function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

export function numberValue(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits }).format(parsed)
    : "—";
}

export function dateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))
    ? String(value).replaceAll("-", "/")
    : "—";
}

export function publicBondRecords(workbench) {
  return Array.isArray(workbench?.records) ? workbench.records
    .filter((record) => record?.status === "active" && record?.term && record?.view)
    .map((record) => ({
      bondCode: textValue(record.term.bondCode ?? record.bondCode),
      bondName: textValue(record.term.bondName),
      issuerCode: textValue(record.term.issuerCode),
      issuerName: textValue(record.term.issuerName),
      issueDate: record.term.issueDate ?? null,
      listingDate: record.term.listingDate ?? null,
      maturityDate: record.term.maturityDate ?? null,
      issueAmount: record.term.issueAmount ?? null,
      outstandingAmount: record.term.outstandingAmount ?? record.view.outstandingAmount ?? null,
      outstandingDataDate: record.term.outstandingDataDate ?? record.view.outstandingDataDate ?? null,
      securedStatus: record.term.securedStatus === "1" ? "有擔保"
        : record.term.securedStatus === "2" ? "無擔保" : null,
      underwriter: record.term.underwriter ?? null,
      trustee: record.term.trustee ?? null,
      outstandingChangeDate: record.term.outstandingChangeDate ?? null,
      outstandingChangeReason: record.term.outstandingChangeReason ?? null,
      unitFaceValueTwd: record.term.unitFaceValueTwd ?? null,
      cbClose: record.view.cbClose ?? null,
      conversionValue: record.view.conversionValue ?? null,
      premiumRate: record.view.premiumRate ?? null,
      remainingRatio: record.view.remainingRatio ?? null,
      daysToMaturity: record.view.daysToMaturity ?? null,
      nextEventDate: record.view.nextEventDate ?? null,
      daysToNextEvent: record.view.daysToNextEvent ?? null,
    }))
    : [];
}

export async function loadPublicBondWorkbench({ errorTarget = null } = {}) {
  const pointer = await safeJsonFetch(bootstrapConfig.generationPointerUrl, { errorTarget });
  const config = pointer?.runtimeUrl
    ? await safeJsonFetch(new URL(pointer.runtimeUrl, globalThis.document?.baseURI), { errorTarget })
    : bootstrapConfig;
  const url = config?.datasets?.bondWorkbench;
  if (!url) return null;
  return safeJsonFetch(new URL(url, globalThis.document?.baseURI), { errorTarget });
}

export async function loadPublicCbWorkbenchV53({ errorTarget = null } = {}) {
  const pointer = await safeJsonFetch(bootstrapConfig.generationPointerUrl, { errorTarget });
  const config = pointer?.runtimeUrl
    ? await safeJsonFetch(new URL(pointer.runtimeUrl, globalThis.document?.baseURI), { errorTarget })
    : bootstrapConfig;
  const url = config?.cbWorkbenchV53Url;
  if (typeof url !== "string" || !url) return null;
  return safeJsonFetch(new URL(url, globalThis.document?.baseURI), { errorTarget });
}
