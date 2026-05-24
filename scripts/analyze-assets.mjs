#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');

const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg']);

async function walk(dir, out = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    out.push(full);
  }
  return out;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const files = await walk(PUBLIC_DIR);
  const buckets = {
    models: [],
    images: [],
    audio: [],
    other: [],
  };

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      continue;
    }
    const item = { file, size: stat.size };
    if (MODEL_EXTENSIONS.has(ext)) buckets.models.push(item);
    else if (IMAGE_EXTENSIONS.has(ext)) buckets.images.push(item);
    else if (AUDIO_EXTENSIONS.has(ext)) buckets.audio.push(item);
    else buckets.other.push(item);
  }

  const sum = (arr) => arr.reduce((acc, item) => acc + item.size, 0);
  const top = (arr, n = 12) => [...arr].sort((a, b) => b.size - a.size).slice(0, n);

  const totalModels = sum(buckets.models);
  const totalImages = sum(buckets.images);
  const totalAudio = sum(buckets.audio);
  const totalOther = sum(buckets.other);
  const total = totalModels + totalImages + totalAudio + totalOther;

  console.log('\n=== Asset Size Audit (public/) ===');
  console.log(`Total:   ${formatBytes(total)}`);
  console.log(`Models:  ${formatBytes(totalModels)} (${buckets.models.length} files)`);
  console.log(`Images:  ${formatBytes(totalImages)} (${buckets.images.length} files)`);
  console.log(`Audio:   ${formatBytes(totalAudio)} (${buckets.audio.length} files)`);
  console.log(`Other:   ${formatBytes(totalOther)} (${buckets.other.length} files)`);

  console.log('\nTop model files:');
  for (const item of top(buckets.models, 20)) {
    console.log(`- ${formatBytes(item.size).padStart(10)}  ${path.relative(ROOT, item.file)}`);
  }

  console.log('\nTop image files:');
  for (const item of top(buckets.images, 12)) {
    console.log(`- ${formatBytes(item.size).padStart(10)}  ${path.relative(ROOT, item.file)}`);
  }
}

main().catch((error) => {
  console.error('[analyze-assets] failed:', error);
  process.exit(1);
});

