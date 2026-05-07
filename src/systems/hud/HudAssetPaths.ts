function getImportMetaBaseUrl(): string {
  const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
  const base = meta.env?.BASE_URL;
  // If base is root or explicitly relative-root, treat as empty for pure relative pathing
  if (!base || base === '/' || base === './') return '';
  return base.endsWith('/') ? base : `${base}/`;
}

export function getHudAssetBaseUrl(): string {
  return getImportMetaBaseUrl();
}

export function buildHudAssetUrl(relativePath: string): string {
  const base = getHudAssetBaseUrl();
  // Append ?v=3 to force bypass browser/Vite cache for freshly generated assets
  return `${base}${relativePath}?v=3`;
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
