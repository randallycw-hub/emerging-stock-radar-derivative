import { createD1PipelineRepository } from "./repositories/d1.ts";
import type { PipelineRepository } from "./repositories/contracts.ts";
import type { D1Database } from "./repositories/d1.ts";

export type PipelineRuntimeBindings = { PIPELINE_DB?: D1Database };

export function createRuntimePipelineRepository(
  bindings: PipelineRuntimeBindings,
  clock: () => string = () => new Date().toISOString(),
): PipelineRepository | undefined {
  if (!bindings.PIPELINE_DB) return undefined;
  return createD1PipelineRepository(bindings.PIPELINE_DB, { clock });
}
