export class PreviewUnavailableError extends Error {
  constructor() {
    super("development preview is unavailable outside development");
    this.name = "PreviewUnavailableError";
  }
}

export function isPreviewDevelopmentRuntime(
  environment: string | undefined = process.env.NODE_ENV,
): boolean {
  return environment === "development";
}

export function assertPreviewDevelopmentRuntime(
  environment: string | undefined = process.env.NODE_ENV,
): void {
  if (!isPreviewDevelopmentRuntime(environment)) {
    throw new PreviewUnavailableError();
  }
}
