export function mapV56EmergingRows(model = {}) {
  if (model?.schemaVersion !== 3 || !isIsoDate(model?.dataDate)) return [];
  const records = Array.isArray(model?.emerging?.records) ? model.emerging.records : [];
  return records.flatMap((record) => {
    const companyCode = text(record?.stockCode);
    if (!/^\d{4}$/.test(companyCode)) return [];
    return [{
      companyCode,
      companyName: textOrNull(record?.companyName),
      industryName: textOrNull(record?.industryName),
      tradingDate: isIsoDate(record?.tradingDate) ? record.tradingDate : null,
      dailyAveragePrice: finiteOrNull(record?.dailyAveragePrice),
      previousAveragePrice: finiteOrNull(record?.previousAveragePrice),
      dailyHighPrice: finiteOrNull(record?.dailyHighPrice),
      dailyLowPrice: finiteOrNull(record?.dailyLowPrice),
      averageChange: finiteOrNull(record?.averageChange),
      averageChangePercent: finiteOrNull(record?.averageChangePercent),
      direction: textOrNull(record?.direction),
      transactionVolume: finiteOrNull(record?.dailyVolume),
      estimatedTransactionAmount: finiteOrNull(record?.transactionAmount),
      applyingDate: textOrNull(record?.applyingDate),
      applyingStatus: textOrNull(record?.applyingStatus),
    }];
  });
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value) {
  const result = text(value);
  return result || null;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
