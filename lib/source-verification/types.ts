export type RegistryStage =
  | "CANDIDATE"
  | "APPROVED_FOR_V1_DESIGN"
  | "VERIFIED_FOR_IMPLEMENTATION"
  | "APPROVED_FOR_PRODUCTION";

export type RegistryPauseState = "SUSPENDED";

export interface FixturePrivacyReview {
  containsPersonalData: boolean;
  excludedFields: string[];
  minimized: boolean;
  deidentified: boolean;
  rationale: string;
}

export interface FixtureMetadata {
  sourceId: string;
  datasetId: "11406" | "94025" | "11586" | "28567";
  datasetName: string;
  resourceRole: "csv" | "openapi_json";
  resourceUrl: string;
  fetchedAt: string;
  httpContentType: string;
  sourceResponseSha256: `sha256:${string}`;
  fixtureSha256: `sha256:${string}`;
  sourceRowCount: number;
  fixtureRowCount: number;
  licenseName: "政府資料開放授權條款－第1版";
  providerName: string;
  manuallyReviewed: boolean;
  privacyReview: FixturePrivacyReview;
  samplingMethod: string;
}

export interface EvidenceCheck {
  id: string;
  passed: boolean;
  evidencePath: string;
  note: string;
}

export interface SourceEvidence {
  sourceId: string;
  datasetId: string;
  checks: EvidenceCheck[];
}

export interface VerificationDecision {
  eligible: boolean;
  currentStage: RegistryStage;
  maximumStage: "APPROVED_FOR_V1_DESIGN" | "VERIFIED_FOR_IMPLEMENTATION";
  failedCheckIds: string[];
  requiresManualApproval: true;
}
