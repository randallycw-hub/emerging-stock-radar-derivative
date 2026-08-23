const activeStages = new Set(["A", "B", "C", "D"]);
const selectableStages = new Set(["all", "active", "A", "B", "C", "D", "listed", "withdrawn", "delayed", "cancelled"]);

export function defaultIpoStage(value, { includeAB = false, activeOnly = false } = {}) {
  if (value === null) return "active";
  if (includeAB && value === "AB") return "AB";
  if (!selectableStages.has(value)) return "all";
  if (activeOnly && !activeStages.has(value) && value !== "active" && value !== "all") {
    return "all";
  }
  return value;
}

export function matchesIpoStage(stage, selectedStage) {
  if (selectedStage === "all") return true;
  if (selectedStage === "active") return activeStages.has(stage);
  if (selectedStage === "AB") return stage === "A" || stage === "B";
  return stage === selectedStage;
}

export function shouldWriteIpoStage(stage) {
  return stage !== "active";
}
