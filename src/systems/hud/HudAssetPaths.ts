function getDetectedBaseUrl(): string {
  // Get current path (e.g. /html/1234567/index.html or /)
  const path = window.location.pathname;
  // If it's a file, strip it to get the directory
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash !== -1) {
    return path.substring(0, lastSlash + 1);
  }
  return '/';
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
