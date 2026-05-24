import { AssetContainer, Scene, SceneLoader } from '@babylonjs/core';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function computeBackoffDelayMs(attempt: number): number {
  const base = 140;
  const jitter = Math.random() * 90;
  return base * Math.pow(2, Math.max(0, attempt - 1)) + jitter;
}

export async function importMeshWithRetry(
  rootUrl: string,
  fileName: string,
  scene: Scene,
  maxAttempts: number = 3,
): Promise<Awaited<ReturnType<typeof SceneLoader.ImportMeshAsync>>> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Math.floor(maxAttempts));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(computeBackoffDelayMs(attempt));
      }
    }
  }
  throw lastError ?? new Error(`Failed to import mesh "${fileName}" from "${rootUrl}"`);
}

export async function loadAssetContainerWithRetry(
  rootUrl: string,
  fileName: string,
  scene: Scene,
  maxAttempts: number = 3,
): Promise<AssetContainer> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Math.floor(maxAttempts));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(computeBackoffDelayMs(attempt));
      }
    }
  }
  throw lastError ?? new Error(`Failed to load asset container "${fileName}" from "${rootUrl}"`);
}

export async function loadImageWithRetry(
  urls: string[],
  maxAttemptsPerUrl: number = 2,
): Promise<{ image: HTMLImageElement; resolvedUrl: string } | null> {
  for (const url of urls) {
    const attempts = Math.max(1, Math.floor(maxAttemptsPerUrl));
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = document.createElement('img');
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
      if (loaded) {
        return { image: loaded, resolvedUrl: url };
      }
      if (attempt < attempts) {
        await sleep(computeBackoffDelayMs(attempt));
      }
    }
  }
  return null;
}
