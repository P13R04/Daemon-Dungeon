const fs = require('fs');
const path = require('path');

const ROOMS_DIR = path.join(__dirname, '..', 'src', 'data', 'rooms');
const DIFFICULTIES = ['facile', 'intermediaire', 'difficile'];

function countMobsInDir(dirPath) {
  const counts = {};
  let totalRooms = 0;
  let totalMobs = 0;

  if (!fs.existsSync(dirPath)) {
    return { counts, totalRooms, totalMobs, error: true };
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  totalRooms = files.length;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.spawnPoints && Array.isArray(data.spawnPoints)) {
        for (const sp of data.spawnPoints) {
          if (sp.enemyType) {
            counts[sp.enemyType] = (counts[sp.enemyType] || 0) + 1;
            totalMobs++;
          }
        }
      }
    } catch (e) {
      console.error(`Error reading ${file}:`, e.message);
    }
  }

  return { counts, totalRooms, totalMobs };
}

console.log('==================================================');
console.log('       CENSUS OF THE FIRST 3 DIFFICULTIES        ');
console.log('==================================================\n');

const results = {};

for (const diff of DIFFICULTIES) {
  const dirPath = path.join(ROOMS_DIR, diff);
  results[diff] = countMobsInDir(dirPath);
}

// Room counts summary
console.log('--- ROOM COUNT SUMMARY ---');
let totalRoomsSum = 0;
for (const diff of DIFFICULTIES) {
  const r = results[diff];
  console.log(`- ${diff.toUpperCase()}: ${r.totalRooms} rooms (Total Mobs: ${r.totalMobs})`);
  totalRoomsSum += r.totalRooms;
}
console.log(`TOTAL ROOMS ACROSS 3 DIFFICULTIES: ${totalRoomsSum}\n`);

// Detailed distribution per difficulty
for (const diff of DIFFICULTIES) {
  const r = results[diff];
  console.log(`--- DETAIL: ${diff.toUpperCase()} (${r.totalRooms} rooms, ${r.totalMobs} mobs) ---`);
  if (r.totalMobs === 0) {
    console.log(' No mobs found.\n');
    continue;
  }
  Object.entries(r.counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([mob, count], index) => {
      const pct = ((count / r.totalMobs) * 100).toFixed(1);
      console.log(`  ${(index + 1).toString().padStart(2, ' ')}. ${mob.padEnd(25)}: ${count.toString().padStart(3, ' ')} (${pct}%)`);
    });
  console.log();
}
