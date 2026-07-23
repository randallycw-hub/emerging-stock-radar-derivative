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
