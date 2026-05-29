const fs = require('fs');
const path = require('path');

const FACILE_DIR = path.join(__dirname, '..', 'src', 'data', 'rooms', 'facile');
const INTER_DIR = path.join(__dirname, '..', 'src', 'data', 'rooms', 'intermediaire');

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

console.log('=== COUNTING MOBS IN ROOMS ===');
const facile = countMobsInDir(FACILE_DIR);
const inter = countMobsInDir(INTER_DIR);

console.log('\n--- FACILE DIFFICULTY ---');
console.log(`Total Rooms: ${facile.totalRooms}`);
console.log(`Total Mobs: ${facile.totalMobs}`);
Object.entries(facile.counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([mob, count]) => {
    const pct = ((count / facile.totalMobs) * 100).toFixed(1);
    console.log(` - ${mob}: ${count} (${pct}%)`);
  });

console.log('\n--- INTERMEDIAIRE DIFFICULTY ---');
console.log(`Total Rooms: ${inter.totalRooms}`);
console.log(`Total Mobs: ${inter.totalMobs}`);
Object.entries(inter.counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([mob, count]) => {
    const pct = ((count / inter.totalMobs) * 100).toFixed(1);
    console.log(` - ${mob}: ${count} (${pct}%)`);
  });

console.log('\n--- COMBINED TOTAL (FACILE + INTERMEDIAIRE) ---');
const combinedCounts = {};
const totalCombinedMobs = facile.totalMobs + inter.totalMobs;
const totalCombinedRooms = facile.totalRooms + inter.totalRooms;

for (const [mob, count] of Object.entries(facile.counts)) {
  combinedCounts[mob] = (combinedCounts[mob] || 0) + count;
}
for (const [mob, count] of Object.entries(inter.counts)) {
  combinedCounts[mob] = (combinedCounts[mob] || 0) + count;
}

console.log(`Total Combined Rooms: ${totalCombinedRooms}`);
console.log(`Total Combined Mobs: ${totalCombinedMobs}`);
Object.entries(combinedCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([mob, count]) => {
    const pct = ((count / totalCombinedMobs) * 100).toFixed(1);
    console.log(` - ${mob}: ${count} (${pct}%)`);
  });
