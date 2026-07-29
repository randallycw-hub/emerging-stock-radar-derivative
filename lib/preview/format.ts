const decimalPattern = /^([+-]?)(\d+)(\.\d+)?$/;

export function formatPreviewText(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return "—";
  return value;
}

export function formatPreviewNumber(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return "—";
  const match = decimalPattern.exec(value);
  if (!match) return value;
  const groupedInteger = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${match[1]}${groupedInteger}${match[3] ?? ""}`;
}

export function formatPreviewPercent(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return "—";
  if (!decimalPattern.test(value)) return `${value}%`;
  const rounded = Number(value).toFixed(2).replace(/\.?0+$/, "");
  return `${Number(rounded) === 0 ? "0" : rounded}%`;
}

export function formatPrice(value: number | undefined): string {
  return formatNumeric(value, 2);
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "\u2014";
  return `${value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
}

export function formatAmount(value: number | undefined): string {
  return formatNumeric(value, 0);
}

export function formatDateOrDash(value: string | undefined): string {
  return value && value.trim() ? value : "\u2014";
}

function formatNumeric(value: number | undefined, decimals: number): string {
  if (value === undefined || !Number.isFinite(value)) return "\u2014";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
