function getImportMetaBaseUrl(): string {
  const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
  return meta.env?.BASE_URL ?? '/';
}

export function getHudAssetBaseUrl(): string {
  const baseUrl = getImportMetaBaseUrl();
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function buildHudAssetUrl(relativePath: string): string {
  return `${getHudAssetBaseUrl()}${relativePath}`;
}
