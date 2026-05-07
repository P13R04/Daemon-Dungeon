function getDetectedBaseUrl(): string {
  // Get current absolute URL (e.g. https://.../html/1234567/index.html)
  const href = window.location.href;
  // Strip filename to get the directory
  const lastSlash = href.lastIndexOf('/');
  if (lastSlash !== -1) {
    return href.substring(0, lastSlash + 1);
  }
  return href;
}

export function getHudAssetBaseUrl(): string {
  return getDetectedBaseUrl();
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
