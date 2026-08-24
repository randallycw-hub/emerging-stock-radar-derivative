import type { SourceAttribution } from "../domain/types.ts";
import type { PublicSourceReference } from "../domain/sourced-value.ts";

export function publicSourceReferenceFromAttribution(
  attribution: Pick<SourceAttribution, "providerName" | "datasetName" | "officialUrl">,
): PublicSourceReference {
  return {
    providerName: attribution.providerName,
    datasetName: attribution.datasetName,
    officialUrl: attribution.officialUrl,
  };
}
