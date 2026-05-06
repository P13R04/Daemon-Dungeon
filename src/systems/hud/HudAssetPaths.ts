function getImportMetaBaseUrl(): string {
  const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
  return meta.env?.BASE_URL ?? '/';
}

export function getHudAssetBaseUrl(): string {
  const baseUrl = getImportMetaBaseUrl();
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function buildHudAssetUrl(relativePath: string): string {
  // Append ?v=3 to force bypass browser/Vite cache for freshly generated assets
  return `${getHudAssetBaseUrl()}${relativePath}?v=3`;
}

export function preloadHudAsset(relativePath: string): Promise<void> {
  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.onload = () => resolve();
    img.onerror = () => {
      console.warn(`Failed to preload asset: ${relativePath}`);
      resolve(); // always resolve to not block
    };
    img.src = buildHudAssetUrl(relativePath);
  });
}
