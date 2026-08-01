function isMissing(value, type) {
  if (value === null || value === undefined || value === "" || value === "-") {
    return true;
  }
  if (type === "number") {
    return !Number.isFinite(Number(String(value).replaceAll(",", "")));
  }
  return false;
}

function comparable(value, type) {
  if (type === "number") return Number(String(value).replaceAll(",", ""));
  return String(value).localeCompare ? String(value) : value;
}

export function sortRows(rows, {
  key,
  direction = "desc",
  type = "number",
  missing = "last",
}) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftMissing = isMissing(left[key], type);
    const rightMissing = isMissing(right[key], type);
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) {
        return String(left.bondCode ?? "").localeCompare(String(right.bondCode ?? ""));
      }
      const missingOrder = missing === "first" ? -1 : 1;
      return leftMissing ? missingOrder : -missingOrder;
    }

    let comparison;
    if (type === "text") {
      comparison = String(left[key]).localeCompare(String(right[key]), "zh-Hant");
    } else {
      comparison = comparable(left[key], type) - comparable(right[key], type);
    }
    if (comparison !== 0) return comparison * multiplier;
    return String(left.bondCode ?? "").localeCompare(String(right.bondCode ?? ""));
  });
}
