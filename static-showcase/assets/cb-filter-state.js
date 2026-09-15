export const CB_NUMERIC_RANGE_RULES = Object.freeze({
  priceMin: [0, Infinity], priceMax: [0, Infinity],
  premiumMin: [-Infinity, Infinity], premiumMax: [-Infinity, Infinity],
  remainingMin: [0, 100], remainingMax: [0, 100],
  conversionPriceMin: [0, Infinity], conversionPriceMax: [0, Infinity],
  conversionValueMin: [0, Infinity], conversionValueMax: [0, Infinity],
  stockPriceMin: [0, Infinity], stockPriceMax: [0, Infinity],
  maturityDaysMin: [0, Infinity], maturityDaysMax: [0, Infinity],
});
export const CB_DATE_RANGE_KEYS = Object.freeze(['issueFrom','issueTo','maturityFrom','maturityTo']);
export const CB_SECURED_VALUES = Object.freeze(new Set(['all','secured','unsecured']));

export function validCbRangeNumber(key, value) {
  if (!Object.hasOwn(CB_NUMERIC_RANGE_RULES, key) || !['string', 'number'].includes(typeof value)) return null;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  const [min, max] = CB_NUMERIC_RANGE_RULES[key];
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function strictIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? null : value;
}

export function readValidatedCbConditions(params) {
  const result = {};
  for (const key of Object.keys(CB_NUMERIC_RANGE_RULES)) {
    const number = validCbRangeNumber(key, params.get(key));
    if (number !== null) result[key] = String(number);
  }
  for (const key of CB_DATE_RANGE_KEYS) {
    const value = strictIsoDate(params.get(key));
    if (value) result[key] = value;
  }
  return result;
}
