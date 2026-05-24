#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const PUBLIC_MODELS_DIR = path.join(ROOT, 'public', 'models');
const EXTENSIONS = new Set(['.glb', '.gltf']);

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const AGGRESSIVE = args.includes('--aggressive');
const PATTERN = args.find((arg) => arg.startsWith('--match='))?.slice('--match='.length) ?? '';

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
    if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: true });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileSize(file) {
  const s = await fs.stat(file);
  return s.size;
}

async function optimizeOne(file) {
  const rel = path.relative(ROOT, file);
  const ext = path.extname(file).toLowerCase() || '.glb';
  const tmp = `${file}.opt-tmp${ext}`;
  const before = await fileSize(file);

  // gltf-transform optimize profile:
  // - safe defaults preserve visual output for game use
  // - aggressive mode increases texture and geometry compression
  const textureSize = AGGRESSIVE ? '1024' : '2048';
  const opts = [
    'gltf-transform',
    'optimize',
    `"${file}"`,
    `"${tmp}"`,
    '--compress',
    'meshopt',
    '--texture-compress',
    AGGRESSIVE ? 'webp' : 'auto',
    '--texture-size',
    textureSize,
    '--simplify',
    AGGRESSIVE ? 'true' : 'false',
    '--join',
    AGGRESSIVE ? 'true' : 'false',
    '--palette',
    AGGRESSIVE ? 'true' : 'false',
  ];

  await run('npx', opts);

  const after = await fileSize(tmp);
  const delta = before - after;
  const pct = before > 0 ? ((delta / before) * 100) : 0;

  if (WRITE) {
    const backup = `${file}.bak`;
    await fs.copyFile(file, backup);
    await fs.rename(tmp, file);
  } else {
    await fs.unlink(tmp).catch(() => {});
  }

  return { rel, before, after, delta, pct };
}

async function main() {
  const files = await walk(PUBLIC_MODELS_DIR);
  const filtered = PATTERN
    ? files.filter((f) => path.relative(ROOT, f).toLowerCase().includes(PATTERN.toLowerCase()))
    : files;

  if (filtered.length === 0) {
    console.log('[optimize-models] No matching model files.');
    return;
  }

  console.log(`[optimize-models] Mode=${WRITE ? 'WRITE' : 'DRY-RUN'} profile=${AGGRESSIVE ? 'aggressive' : 'safe'} files=${filtered.length}`);
  const results = [];
  for (const file of filtered) {
    try {
      const r = await optimizeOne(file);
      results.push(r);
      console.log(`✓ ${r.rel}: ${fmt(r.before)} -> ${fmt(r.after)} (${r.pct.toFixed(1)}%)`);
    } catch (error) {
      console.warn(`✗ failed: ${path.relative(ROOT, file)}`, error?.message ?? error);
    }
  }

  const totalBefore = results.reduce((a, b) => a + b.before, 0);
  const totalAfter = results.reduce((a, b) => a + b.after, 0);
  const gain = totalBefore - totalAfter;
  const gainPct = totalBefore > 0 ? (gain / totalBefore) * 100 : 0;
  console.log('\n=== Optimization Summary ===');
  console.log(`files optimized: ${results.length}`);
  console.log(`total before: ${fmt(totalBefore)}`);
  console.log(`total after:  ${fmt(totalAfter)}`);
  console.log(`gain:         ${fmt(gain)} (${gainPct.toFixed(1)}%)`);
  if (!WRITE) {
    console.log('\nDRY-RUN only. Use --write to apply changes and create .bak backups.');
  }
}

main().catch((error) => {
  console.error('[optimize-models] failed:', error);
  process.exit(1);
});
