const fs = require('fs');
const path = require('path');

const ROOMS_DIR = path.join(process.cwd(), 'src', 'data', 'rooms');
const VALID_CHARS = new Set(['#', '.', 'O', 'P', 'V', '^', 'M', 'R', 'S', 'E']);

function readRoomFiles() {
  return fs
    .readdirSync(ROOMS_DIR)
    .filter((file) => /^room_.*\.json$/.test(file))
    .sort();
}

function toRowString(row) {
  return typeof row === 'string' ? row : String(row ?? '');
}

function analyzeRoom(fileName) {
  const filePath = path.join(ROOMS_DIR, fileName);
  const room = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const layout = Array.isArray(room.layout) ? room.layout : [];

  const rowWidths = layout.map((row) => toRowString(row).length);
  const width = rowWidths.length ? Math.max(...rowWidths) : 0;
  const height = layout.length;
  const nonRectangular = rowWidths.some((w) => w !== width);

  const invalidChars = [];
  let hasOMarker = false;

  for (let y = 0; y < height; y++) {
    const row = toRowString(layout[y]);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!VALID_CHARS.has(ch)) {
        invalidChars.push(`${x},${y}:${ch}`);
      }
      if (ch === 'O') hasOMarker = true;
    }
  }

  let borderOpen = false;
  if (height > 0 && width > 0) {
    for (let x = 0; x < width; x++) {
      const top = toRowString(layout[0])[x] ?? '#';
      const bottom = toRowString(layout[height - 1])[x] ?? '#';
      const topClosed = top === '#' || top === 'V';
      const bottomClosed = bottom === '#' || bottom === 'V';
      if (!topClosed || !bottomClosed) {
        borderOpen = true;
      }
    }

    for (let y = 0; y < height; y++) {
      const row = toRowString(layout[y]);
      const left = row[0] ?? '#';
      const right = row[width - 1] ?? '#';
      const leftClosed = left === '#' || left === 'V';
      const rightClosed = right === '#' || right === 'V';
      if (!leftClosed || !rightClosed) {
        borderOpen = true;
      }
    }
  }

  const obstacles = Array.isArray(room.obstacles) ? room.obstacles : [];
  let obstacleCells = 0;
  let obstaclesOutOrInvalid = 0;
  let nonWallObstacles = 0;

  for (const obstacle of obstacles) {
    if (obstacle?.type === 'hazard') {
      continue;
    }

    const obstacleX = obstacle?.x;
    const obstacleZ = Number.isFinite(obstacle?.y) ? obstacle.y : obstacle?.z;
    const obstacleW = Math.max(1, obstacle?.width || 1);
    const obstacleH = Math.max(1, obstacle?.height || 1);

    if (!Number.isFinite(obstacleX) || !Number.isFinite(obstacleZ)) {
      obstaclesOutOrInvalid += 1;
      continue;
    }

    obstacleCells += obstacleW * obstacleH;

    if (obstacle?.type !== 'wall') {
      nonWallObstacles += 1;
    }

    if (
      obstacleX < 0 ||
      obstacleZ < 0 ||
      obstacleX + obstacleW > width ||
      obstacleZ + obstacleH > height
    ) {
      obstaclesOutOrInvalid += 1;
    }
  }

  const issues = [];
  if (nonRectangular) issues.push(`nonRectangular rows=${rowWidths.join(',')}`);
  if (borderOpen) issues.push('openBorder=true');
  if (invalidChars.length) issues.push(`invalidChars=${invalidChars.slice(0, 8).join(' ')}`);
  if (obstaclesOutOrInvalid) issues.push(`obstaclesOutOrInvalid=${obstaclesOutOrInvalid}`);
  if (hasOMarker) issues.push('containsOMarker=true (walls-only policy expects #)');
  if (nonWallObstacles) issues.push(`nonWallObstacles=${nonWallObstacles}`);

  return {
    id: room.id || fileName,
    fileName,
    width,
    height,
    issues,
  };
}

function main() {
  const files = readRoomFiles();
  const results = files.map(analyzeRoom);
  const problematic = results.filter((r) => r.issues.length > 0);

  if (problematic.length === 0) {
    console.log('No structural issues detected in room_*.json files.');
    return;
  }

  console.log(`Found ${problematic.length} problematic room files:`);
  for (const room of problematic) {
    console.log(`\n- ${room.fileName} (${room.id}) ${room.width}x${room.height}`);
    for (const issue of room.issues) {
      console.log(`  * ${issue}`);
    }
  }
}

main();