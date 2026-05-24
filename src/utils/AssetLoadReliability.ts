import { AssetContainer, Scene, SceneLoader } from '@babylonjs/core';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function computeBackoffDelayMs(attempt: number): number {
  const base = 140;
  const jitter = Math.random() * 90;
  return base * Math.pow(2, Math.max(0, attempt - 1)) + jitter;
}

function withAttemptCacheBust(fileName: string, attempt: number): string {
  if (attempt <= 1) return fileName;
  const separator = fileName.includes('?') ? '&' : '?';
  return `${fileName}${separator}retry=${attempt}&t=${Date.now()}`;
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
      return await SceneLoader.ImportMeshAsync('', rootUrl, withAttemptCacheBust(fileName, attempt), scene);
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
      return await SceneLoader.LoadAssetContainerAsync(rootUrl, withAttemptCacheBust(fileName, attempt), scene);
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

export function getAdaptivePreloadConcurrency(defaultValue: number = 4): number {
  const fallback = Math.max(1, Math.floor(defaultValue));
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & { connection?: any }) | null;
  const connection = nav?.connection;
  if (!connection) return fallback;
  const saveData = !!connection.saveData;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') return 1;
  if (effectiveType === '3g') return Math.min(fallback, 2);
  return fallback;
}

export async function mapWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = 4,
): Promise<Array<PromiseSettledResult<T>>> {
  const settled: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  const maxWorkers = Math.max(1, Math.floor(concurrency));
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      try {
        const value = await tasks[index]();
        settled[index] = { status: 'fulfilled', value };
      } catch (reason) {
        settled[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxWorkers, tasks.length) }, () => worker()));
  return settled;
}
