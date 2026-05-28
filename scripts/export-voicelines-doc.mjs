import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcPath = path.join(root, 'src/data/voicelines/VoicelineDatabase.ts');
const outPath = path.join(root, 'docs/daemon-voicelines-director.md');

const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

const entries = [];
let uid = 0;

const vlRegex = /vl\(\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'\s*,\s*'([^']+)'\s*(?:,\s*(\{.*\}))?\s*\),?/;

for (const line of lines) {
  if (!line.includes('vl(')) continue;
  const m = line.match(vlRegex);
  if (!m) continue;
  const trigger = m[1];
  const message = m[2].replace(/\\'/g, "'");
  const emotion = m[3];
  const opts = m[4] || '';

  uid += 1;
  let id = `${trigger}_${uid}`;
  const idMatch = opts.match(/id:\s*'([^']+)'/);
  if (idMatch) id = idMatch[1];

  const clsMatch = opts.match(/requiredClass:\s*'([^']+)'/);
  const requiredClass = clsMatch ? clsMatch[1] : '';

  const ctxMatch = opts.match(/triggerContext:\s*'([^']+)'/);
  const triggerContext = ctxMatch ? ctxMatch[1] : '';

  entries.push({ id, trigger, emotion, requiredClass, triggerContext, message });
}

const byTrigger = new Map();
for (const e of entries) {
  if (!byTrigger.has(e.trigger)) byTrigger.set(e.trigger, []);
  byTrigger.get(e.trigger).push(e);
}

const sortedTriggers = [...byTrigger.keys()].sort();

let out = '';
out += '# Daemon Director Voicelines\n\n';
out += `Generated: ${new Date().toISOString()}\n\n`;
out += '## Director Logic (V1)\n';
out += '- Dynamic pacing with global cooldown adapted by pressure and volatility.\n';
out += '- Priority queue for urgent reactions (low HP, first-seen enemies, boss/special rooms).\n';
out += '- Class-aware selection bias (mage/firewall/rogue lines preferred but not exclusive).\n';
out += '- Tag cooldown deduplication to avoid repetitive taunts.\n';
out += '- First-seen enemy reactions via `enemy_first_seen` and contextual `triggerContext`.\n';
out += '- Special room narration via `room_special` and room-id contexts.\n\n';
out += '## Gauges\n';
out += '- `pressure` (0-100): rises on damage, lowers on kills/clears; increases intensity of threat reactions.\n';
out += '- `dominance` (0-100): rises on room control/ult usage, drops when player is hit; shapes tone.\n';
out += '- `boredom` (0-100): rises in idle/cleared states; increases ambient/idle narration frequency.\n';
out += '- `volatility` (0-100): short-lived chaos signal after combat spikes; reduces spacing between lines.\n\n';

for (const trigger of sortedTriggers) {
  out += `## ${trigger}\n\n`;
  out += '| ID | Emotion | Class | Context | Message |\n';
  out += '|---|---|---|---|---|\n';
  for (const e of byTrigger.get(trigger)) {
    const msg = e.message.replace(/\|/g, '\\|');
    out += `| ${e.id} | ${e.emotion} | ${e.requiredClass || '-'} | ${e.triggerContext || '-'} | ${msg} |\n`;
  }
  out += '\n';
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${outPath} with ${entries.length} entries.`);
