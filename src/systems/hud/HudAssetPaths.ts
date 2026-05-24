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
  return `${base}${relativePath}`;
}

const globalArtworkCache = new Map<string, HTMLImageElement>();

export function getCachedHudAsset(relativePath: string): HTMLImageElement | undefined {
  return globalArtworkCache.get(relativePath);
}

export function preloadHudAsset(relativePath: string): Promise<HTMLImageElement | null> {
  if (globalArtworkCache.has(relativePath)) {
    return Promise.resolve(globalArtworkCache.get(relativePath)!);
  }
  return loadImageWithRetry([buildHudAssetUrl(relativePath)], 3).then((loaded) => {
    if (!loaded) {
      console.warn(`Failed to preload asset: ${relativePath}`);
      return null;
    }
    globalArtworkCache.set(relativePath, loaded.image);
    return loaded.image;
  });
}
import { loadImageWithRetry } from '../../utils/AssetLoadReliability';
