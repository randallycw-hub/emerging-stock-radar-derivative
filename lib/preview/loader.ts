import "server-only";

import { buildPreviewData } from "./data.ts";
import { assertPreviewDevelopmentRuntime } from "./runtime.ts";
import type { PreviewDataDto } from "./types.ts";

let previewDataPromise: Promise<PreviewDataDto> | undefined;

export function loadPreviewData(): Promise<PreviewDataDto> {
  assertPreviewDevelopmentRuntime();
  previewDataPromise ??= loadRawPreviewData();
  return previewDataPromise;
}

async function loadRawPreviewData(): Promise<PreviewDataDto> {
  const [
    revenueCsv,
    revenueMetadata,
    bondCsv,
    bondMetadata,
  ] = await Promise.all([
    import("../../tests/fixtures/source-verification/94025/csv-minimal.csv?raw"),
    import("../../tests/fixtures/source-verification/94025/metadata.json?raw"),
    import("../../tests/fixtures/source-verification/11406/csv-minimal.csv?raw"),
    import("../../tests/fixtures/source-verification/11406/metadata.json?raw"),
  ]);

  return buildPreviewData({
    revenueCsv: revenueCsv.default,
    revenueMetadataJson: revenueMetadata.default,
    bondCsv: bondCsv.default,
    bondMetadataJson: bondMetadata.default,
  });
}
