export function authorizeIngestionRequest(authorization: string | null | undefined, configuredToken: string | null | undefined): boolean {
  if (!configuredToken || !authorization) return false;
  return authorization === `Bearer ${configuredToken}`;
}
