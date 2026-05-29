const fs = require('fs');
const path = require('path');

const DIFFICILE_DIR = path.join(__dirname, '..', 'src', 'data', 'rooms', 'difficile');

function countMobsInDir(dirPath) {
  const counts = {};
  let totalRooms = 0;
  let totalMobs = 0;

  if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    return { counts, totalRooms, totalMobs };
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

console.log('=== COUNTING MOBS IN DIFFICILE ROOMS ===');
const difficile = countMobsInDir(DIFFICILE_DIR);

console.log('\n--- DIFFICILE DIFFICULTY ---');
console.log(`Total Rooms: ${difficile.totalRooms}`);
console.log(`Total Mobs: ${difficile.totalMobs}`);
Object.entries(difficile.counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([mob, count]) => {
    const pct = ((count / difficile.totalMobs) * 100).toFixed(1);
    console.log(` - ${mob}: ${count} (${pct}%)`);
  });
