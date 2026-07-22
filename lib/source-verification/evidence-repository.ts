import type { SourceEvidence } from "./types.ts";

export interface VerificationEvidenceRepository {
  save(evidence: SourceEvidence): Promise<void>;
  get(sourceId: string): Promise<SourceEvidence | undefined>;
  list(): Promise<SourceEvidence[]>;
}

export class InMemoryVerificationEvidenceRepository implements VerificationEvidenceRepository {
  readonly #items = new Map<string, SourceEvidence>();

  async save(evidence: SourceEvidence): Promise<void> {
    this.#items.set(evidence.sourceId, structuredClone(evidence));
  }

  async get(sourceId: string): Promise<SourceEvidence | undefined> {
    const item = this.#items.get(sourceId);
    return item && structuredClone(item);
  }

  async list(): Promise<SourceEvidence[]> {
    return [...this.#items.values()].map((item) => structuredClone(item));
  }
}
