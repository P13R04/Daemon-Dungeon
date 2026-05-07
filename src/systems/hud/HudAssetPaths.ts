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
