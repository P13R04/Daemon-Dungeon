#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BACKUP_ROOT = path.join(ROOT, 'backups', 'model-originals-2026-05-24');
const TARGET_ROOT = path.join(ROOT, 'public', 'models');

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

function toTargetPath(backupFile) {
  const relative = path.relative(BACKUP_ROOT, backupFile);
  if (!relative.endsWith('.bak')) return null;
  const withoutBak = relative.slice(0, -4);
  return path.join(TARGET_ROOT, withoutBak);
}

async function main() {
  const files = await walk(BACKUP_ROOT);
  if (files.length === 0) {
    console.log('[restore-model-backups] No backup files found.');
    return;
  }

  let restored = 0;
  for (const backupFile of files) {
    const target = toTargetPath(backupFile);
    if (!target) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(backupFile, target);
    restored++;
    console.log(`restored: ${path.relative(ROOT, target)}`);
  }

  console.log(`\n[restore-model-backups] Restored ${restored} model files from backup.`);
}

main().catch((error) => {
  console.error('[restore-model-backups] failed:', error);
  process.exit(1);
});

