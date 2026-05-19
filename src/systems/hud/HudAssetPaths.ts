function getDetectedBaseUrl(): string {
  // With assetsDir: '.', all files are at root of dist.
  // Returning empty string ensures all paths like 'models/...' are treated as purely relative.
  return '';
}

export function getHudAssetBaseUrl(): string {
  return getDetectedBaseUrl();
}

export function buildHudAssetUrl(relativePath: string): string {
  const base = getHudAssetBaseUrl();
  // Append ?v=3 to force bypass browser/Vite cache for freshly generated assets
  return `${base}${relativePath}?v=99`;
}

const globalArtworkCache = new Map<string, HTMLImageElement>();

export function getCachedHudAsset(relativePath: string): HTMLImageElement | undefined {
  return globalArtworkCache.get(relativePath);
}

export function preloadHudAsset(relativePath: string): Promise<HTMLImageElement | null> {
  if (globalArtworkCache.has(relativePath)) {
    return Promise.resolve(globalArtworkCache.get(relativePath)!);
  }
  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.onload = () => {
      globalArtworkCache.set(relativePath, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn(`Failed to preload asset: ${relativePath}`);
      resolve(null); // always resolve to not block
    };
    img.src = buildHudAssetUrl(relativePath);
  });
}
