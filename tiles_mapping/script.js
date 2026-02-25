const TILESET_PATH = "tiles_test";

const TYPES = ["void", "floor", "wall", "poison", "spikes"];

// Enemy types list from enemies.json
const ENEMY_TYPES = [
  { id: "zombie_basic", name: "Zombie", color: "#50FF50" },
  { id: "dummy_tank", name: "Dummy", color: "#CCCCCC" },
  { id: "bull", name: "Bull", color: "#FF5050" },
  { id: "shooter", name: "Shooter", color: "#FF9950" },
  { id: "sentinel", name: "Sentinel", color: "#5050FF" },
  { id: "turret", name: "Turret", color: "#9950FF" },
  { id: "healer", name: "Healer", color: "#50FF99" },
  { id: "artificer", name: "Artificer", color: "#FFFF50" },
  { id: "bullet_hell", name: "Bullet Hell", color: "#FF50FF" },
  { id: "mage_missile", name: "Mage Missile", color: "#50FFFF" }
];

const FRIENDLY_TYPES = [
  { id: "shopkeeper_default", name: "Shopkeeper", color: "rgb(255,255,120)"},
  { id: "friendly_turret_shot", name: "Bullet turret", color: "rgb(60,120,180)"},
  { id: "friendly_turret_aoe", name: "Bomber turret", color: "rgb(180,120,60)"},
  { id: "heal_drone", name: "Healer drone", color: "rgb(60,120,180)"},
]

// Enemy/Friendly spawns array
let enemySpawns = [];
let friendlySpawns = [];

class Grid {
  constructor(width, height, fill = "void") {
    this.width = width;
    this.height = height;
    this.data = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => fill)
    );
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.data[y][x];
  }

  set(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.data[y][x] = value;
  }

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      tiles: this.data
    };
  }
}

function getNeighbors(grid, x, y) {
  return {
    n: grid.get(x, y - 1),
    s: grid.get(x, y + 1),
    e: grid.get(x + 1, y),
    w: grid.get(x - 1, y),
    ne: grid.get(x + 1, y - 1),
    nw: grid.get(x - 1, y - 1),
    se: grid.get(x + 1, y + 1),
    sw: grid.get(x - 1, y + 1)
  };
}

function isBlocking(type) {
  return type === "wall";
}

function isMatch(type, matchType) {
  if (!type) return false;
  if (matchType === "wall") return isBlocking(type);
  return type === matchType;
}

function maskFrom(neighbors, matchType) {
  let mask = 0;
  if (isMatch(neighbors.n, matchType)) mask |= 1;
  if (isMatch(neighbors.e, matchType)) mask |= 2;
  if (isMatch(neighbors.s, matchType)) mask |= 4;
  if (isMatch(neighbors.w, matchType)) mask |= 8;
  return mask;
}

function diagMaskFrom(neighbors, matchType) {
  let mask = 0;
  if (isMatch(neighbors.nw, matchType)) mask |= 1;
  if (isMatch(neighbors.ne, matchType)) mask |= 2;
  if (isMatch(neighbors.se, matchType)) mask |= 4;
  if (isMatch(neighbors.sw, matchType)) mask |= 8;
  return mask;
}

function countBits(mask) {
  return mask.toString(2).split("0").join("").length;
}

function rotationFromMask(mask) {
  // Base orientation is N for side. Adjusted +90° clockwise.
  switch (mask) {
    case 1: return 90; // N
    case 2: return 180; // E
    case 4: return 270; // S
    case 8: return 0; // W
    default: return 0;
  }
}

function rotationFromCornerMask(mask) {
  // Base orientation for corner is N+W.
  switch (mask) {
    case 1 | 8: return 0; // N + W
    case 1 | 2: return 90; // N + E
    case 2 | 4: return 180; // E + S
    case 4 | 8: return 270; // S + W
    default: return 0;
  }
}

function rotationFromMissing(mask) {
  // For side3: base missing side is S.
  switch (mask) {
    case 1 | 2 | 8: return 0; // missing S
    case 1 | 2 | 4: return 90; // missing W
    case 2 | 4 | 8: return 180; // missing N
    case 1 | 4 | 8: return 270; // missing E
    default: return 0;
  }
}

function rotationFromDiagMask(mask) {
  // Base orientation is NW for a single diagonal.
  switch (mask) {
    case 1: return 0; // NW
    case 2: return 90; // NE
    case 4: return 180; // SE
    case 8: return 270; // SW
    default: return 0;
  }
}

function rotationFromDiagCornerMask(mask) {
  // Base orientation is NW+NE for adjacent diagonals.
  switch (mask) {
    case 1 | 2: return 0;
    case 2 | 4: return 90;
    case 4 | 8: return 180;
    case 8 | 1: return 270;
    default: return 0;
  }
}

function rotationFromDiagMissing(mask) {
  // Base orientation missing SW (NW+NE+SE).
  switch (mask) {
    case 1 | 2 | 4: return 0; // missing SW
    case 2 | 4 | 8: return 90; // missing NW
    case 1 | 4 | 8: return 180; // missing NE
    case 1 | 2 | 8: return 270; // missing SE
    default: return 0;
  }
}

function rotateDiagMask(mask, degreesCW) {
  const steps = ((degreesCW % 360) + 360) % 360;
  if (steps === 0) return mask;
  if (steps === 90) {
    return ((mask & 1) ? 2 : 0) | ((mask & 2) ? 4 : 0) | ((mask & 4) ? 8 : 0) | ((mask & 8) ? 1 : 0);
  }
  if (steps === 180) {
    return ((mask & 1) ? 4 : 0) | ((mask & 2) ? 8 : 0) | ((mask & 4) ? 1 : 0) | ((mask & 8) ? 2 : 0);
  }
  if (steps === 270) {
    return ((mask & 1) ? 8 : 0) | ((mask & 2) ? 1 : 0) | ((mask & 4) ? 2 : 0) | ((mask & 8) ? 4 : 0);
  }
  return mask;
}

function oppositeRotation(mask) {
  // Base opposite is W+E.
  if (mask === (2 | 8)) return 0;
  if (mask === (1 | 4)) return 90;
  return 0;
}

function solveCircuitBorderForFloor(neighbors) {
  // For floor cells: compute circuit borders based on adjacent walls
  const mask = maskFrom(neighbors, "wall");
  const diagMask = diagMaskFrom(neighbors, "wall");
  const count = countBits(mask);
  const diagCount = countBits(diagMask);

  if (count === 4) {
    return { texture: "circuit_border_side4.png", rotation: 0 };
  }

  if (count === 3) {
    return { texture: "circuit_border_side3.png", rotation: rotationFromMissing(mask) };
  }

  if (count === 2) {
    const isOpposite = mask === (1 | 4) || mask === (2 | 8);
    if (isOpposite) {
      return { texture: "circuit_border_side_opposite.png", rotation: oppositeRotation(mask) };
    }

    const rotation = rotationFromCornerMask(mask);
    // Corner with opposite diagonal filled
    const oppositeDiag =
      (mask === (1 | 8) && (diagMask & 4)) ||
      (mask === (1 | 2) && (diagMask & 8)) ||
      (mask === (2 | 4) && (diagMask & 1)) ||
      (mask === (4 | 8) && (diagMask & 2));

    if (oppositeDiag) {
      return { texture: "circuit_border_corner_opposite_reversed.png", rotation };
    }

    return { texture: "circuit_border_corner.png", rotation };
  }

  if (count === 1) {
    const rotation = rotationFromMask(mask);
    const rotatedDiagMask = rotateDiagMask(diagMask, (360 - rotation) % 360);
    const relevantDiagMask = rotatedDiagMask & (2 | 4); // NE/SE in base orientation
    const diagCount = countBits(relevantDiagMask);

    if (diagCount === 2) {
      return { texture: "circuit_border_side_and_reversed2.png", rotation };
    }
    if (diagCount === 1) {
      const texture = (relevantDiagMask & 2)
        ? "circuit_border_side_and_reversed.png"
        : "circuit_border_side_and_reversed_alt.png";
      return { texture, rotation };
    }

    return { texture: "circuit_border_side.png", rotation };
  }

  if (count === 0) {
    if (diagCount === 0) {
      return null; // No walls adjacent, use base floor
    }
    if (diagCount === 1) {
      const rotation = rotationFromCornerMask(diagMask === 1 ? (1 | 8) :
        diagMask === 2 ? (1 | 2) :
        diagMask === 4 ? (2 | 4) :
        (4 | 8));
      return { texture: "circuit_border_corner_reversed.png", rotation };
    }
    if (diagCount === 2) {
      // Adjacent diagonals -> reversed2, opposite -> reversed_opposite
      const isOpposite = diagMask === (1 | 4) || diagMask === (2 | 8);
      if (isOpposite) {
        return { texture: "circuit_border_corner_reversed_opposite.png", rotation: diagMask === (1 | 4) ? 0 : 90 };
      }
      return { texture: "circuit_border_corner_reversed2.png", rotation: rotationFromDiagCornerMask(diagMask) };
    }
    if (diagCount === 3) {
      return { texture: "circuit_border_corner_reversed3.png", rotation: rotationFromDiagMissing(diagMask) };
    }
    if (diagCount === 4) {
      return { texture: "circuit_border_corner_reversed4.png", rotation: 0 };
    }
  }

  return null;
}

function solveTransition(prefix, neighbors, targetType) {
  const mask = maskFrom(neighbors, targetType);
  return solveTransitionFromMask(prefix, mask);
}

function solveTransitionFromMask(prefix, mask) {
  const count = countBits(mask);

  if (count === 4) {
    return { texture: `${prefix}_side4.png`, rotation: 0 };
  }

  if (count === 3) {
    return { texture: `${prefix}_side3.png`, rotation: rotationFromMissing(mask) };
  }

  if (count === 2) {
    const isOpposite = mask === (1 | 4) || mask === (2 | 8);
    if (isOpposite) {
      return { texture: `${prefix}_side_opposite.png`, rotation: oppositeRotation(mask) };
    }
    return { texture: `${prefix}_corner.png`, rotation: rotationFromCornerMask(mask) };
  }

  if (count === 1) {
    return { texture: `${prefix}_side.png`, rotation: rotationFromMask(mask) };
  }

  return null;
}

function solveHazard(type, neighbors) {
  const base = type === "poison" ? "poison" : "vide";
  const otherType = type === "poison" ? "void" : "poison";
  const otherMask = maskFrom(neighbors, otherType);
  const otherDiagMask = diagMaskFrom(neighbors, otherType);
  const floorMask = maskFrom(neighbors, "floor") | otherMask;
  const floorDiagMask = diagMaskFrom(neighbors, "floor") | otherDiagMask;
  const floorCount = countBits(floorMask);
  const sameMask = maskFrom(neighbors, type);
  const sameCount = countBits(sameMask);
  const floorDiagCount = countBits(floorDiagMask);

  if (sameCount === 4) {
    if (floorDiagCount === 1) {
      return {
        texture: `${base}_transition_corner_reversed.png`,
        rotation: rotationFromDiagMask(floorDiagMask)
      };
    }
    if (floorDiagCount === 2) {
      const isOpposite = floorDiagMask === (1 | 4) || floorDiagMask === (2 | 8);
      if (isOpposite) {
        return {
          texture: `${base}_transition_corner_reversed_opposite.png`,
          rotation: floorDiagMask === (1 | 4) ? 0 : 90
        };
      }
      return {
        texture: `${base}_transition_corner_reversed2.png`,
        rotation: rotationFromDiagCornerMask(floorDiagMask)
      };
    }
    if (floorDiagCount === 3) {
      return {
        texture: `${base}_transition_corner_reversed3.png`,
        rotation: rotationFromDiagMissing(floorDiagMask)
      };
    }
    if (floorDiagCount === 4) {
      return { texture: `${base}_transition_corner_reversed4.png`, rotation: 0 };
    }
    return { texture: `${base}_base.png`, rotation: 0 };
  }

  if (sameCount === 0) {
    return { texture: `${base}_alone.png`, rotation: 0 };
  }

  if (floorCount === 1 && sameCount === 3) {
    const rotation = rotationFromMask(floorMask);
    const rotatedDiagMask = rotateDiagMask(floorDiagMask, (360 - rotation) % 360);
    const relevantDiagMask = rotatedDiagMask & (2 | 4); // NE/SE in base orientation
    const diagCount = countBits(relevantDiagMask);
    if (diagCount === 2) {
      return { texture: `${base}_transition_side_and_reversed2.png`, rotation };
    }
    if (diagCount === 1) {
      const texture = (relevantDiagMask & 2)
        ? `${base}_transition_side_and_reversed.png`
        : `${base}_transition_side_and_reversed_alt.png`;
      return { texture, rotation };
    }
  }

  if (floorCount === 2 && floorMask !== (1 | 4) && floorMask !== (2 | 8)) {
    const oppositeDiagIsFloor =
      (floorMask === (1 | 8) && (floorDiagMask & 4)) ||
      (floorMask === (1 | 2) && (floorDiagMask & 8)) ||
      (floorMask === (2 | 4) && (floorDiagMask & 1)) ||
      (floorMask === (4 | 8) && (floorDiagMask & 2));

    if (oppositeDiagIsFloor) {
      return {
        texture: `${base}_transition_corner_opposite_reversed.png`,
        rotation: rotationFromCornerMask(floorMask)
      };
    }
  }

  // Use the combined floorMask for standard transitions
  const transitionResult = solveTransitionFromMask(`${base}_transition`, floorMask);
  if (transitionResult) return transitionResult;

  return { texture: `${base}_base.png`, rotation: 0 };
}

function solveFloor(neighbors) {
  // Floor cells: check if adjacent to walls to apply circuit borders
  // Otherwise just use base floor texture
  const hasWall = isBlocking(neighbors.n) || isBlocking(neighbors.s) || 
                  isBlocking(neighbors.e) || isBlocking(neighbors.w) ||
                  isBlocking(neighbors.ne) || isBlocking(neighbors.nw) ||
                  isBlocking(neighbors.se) || isBlocking(neighbors.sw);

  if (hasWall) {
    const circuit = solveCircuitBorderForFloor(neighbors);
    if (circuit) return circuit;
  }

  return { texture: "floor_base.png", rotation: 0 };
}

function solveTile(type, neighbors) {
  if (type === "spikes") {
    return { texture: "spikes.png", rotation: 0 };
  }
  if (type === "wall") {
    // Walls are just placeholders, no texture
    return { texture: null, rotation: 0 };
  }
  if (type === "poison" || type === "void") {
    return solveHazard(type, neighbors);
  }
  if (type === "floor") {
    return solveFloor(neighbors);
  }
  return { texture: "floor_base.png", rotation: 0 };
}

const gridEl = document.getElementById("grid");
const modeBtn = document.getElementById("modeBtn");
const resizeBtn = document.getElementById("resizeBtn");
const importRoomBtn = document.getElementById("importRoomBtn");
const importRoomInput = document.getElementById("importRoomInput");
const exportRoomBtn = document.getElementById("exportRoomBtn");
const saveRoomBtn = document.getElementById("saveRoomBtn");
const widthInput = document.getElementById("gridWidth");
const heightInput = document.getElementById("gridHeight");
const roomNameInput = document.getElementById("roomName");
const roomIdInput = document.getElementById("roomId");
const toolButtons = Array.from(document.querySelectorAll(".tool"));

function createDefaultRoomGrid(width, height) {
  const room = new Grid(width, height, "floor");
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isBorder = y === 0 || y === height - 1 || x === 0 || x === width - 1;
      room.set(x, y, isBorder ? "wall" : "floor");
    }
  }
  return room;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

let grid = createDefaultRoomGrid(Number(widthInput.value), Number(heightInput.value));
let currentType = "floor";
let mode = "edit";
let isPainting = false;
let draggingEnemyIndex = null;
let draggingFriendlyIndex = null;
let roomIdManuallyEdited = false;

function sanitizeRoomId(value) {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");

  if (!normalized) return "room_custom";
  return normalized.startsWith("room_") ? normalized : `room_${normalized}`;
}

roomNameInput.addEventListener("input", () => {
  if (!roomIdManuallyEdited) {
    roomIdInput.value = sanitizeRoomId(roomNameInput.value);
  }
});

roomIdInput.addEventListener("input", () => {
  roomIdManuallyEdited = true;
  roomIdInput.value = sanitizeRoomId(roomIdInput.value);
});

function getEnemyDisplayPosition(spawn) {
  const cell = gridEl.querySelector(".cell");
  if (!cell) return { left: 0, top: 0 };

  const styles = window.getComputedStyle(gridEl);
  const gapX = parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const gapZ = parseFloat(styles.rowGap || styles.gap || "0") || 0;
  const cellRect = cell.getBoundingClientRect();
  const cellWidth = cellRect.width;
  const cellHeight = cellRect.height;
  const stepX = cellWidth + gapX;
  const stepZ = cellHeight + gapZ;

  return {
    left: spawn.x * stepX + cellWidth / 2,
    top: spawn.z * stepZ + cellHeight / 2,
  };
}

function gridPositionFromMouseEvent(event) {
  const cell = gridEl.querySelector(".cell");
  if (!cell) return { x: 0, z: 0 };

  const rect = gridEl.getBoundingClientRect();
  const styles = window.getComputedStyle(gridEl);
  const borderLeft = parseFloat(styles.borderLeftWidth || "0") || 0;
  const borderTop = parseFloat(styles.borderTopWidth || "0") || 0;
  const gapX = parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const gapZ = parseFloat(styles.rowGap || styles.gap || "0") || 0;

  const cellRect = cell.getBoundingClientRect();
  const cellWidth = cellRect.width;
  const cellHeight = cellRect.height;
  const stepX = cellWidth + gapX;
  const stepZ = cellHeight + gapZ;

  const localX = event.clientX - rect.left - borderLeft;
  const localZ = event.clientY - rect.top - borderTop;

  return {
    x: clamp((localX - cellWidth / 2) / stepX, 0, grid.width - 1),
    z: clamp((localZ - cellHeight / 2) / stepZ, 0, grid.height - 1),
  };
}

function findEnemyNear(x, z, maxDistance = 0.45) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  enemySpawns.forEach((spawn, index) => {
    const dx = spawn.x - x;
    const dz = spawn.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function setActiveTool(type) {
  currentType = type;
  toolButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.type === type));
}

function buildGrid() {
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${grid.width}, 32px)`;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      gridEl.appendChild(cell);
    }
  }
  render();
}

function paintCell(x, y) {
  grid.set(x, y, currentType);
  render();
}

function render() {
  gridEl.querySelectorAll(".enemy-marker-floating, .friendly-marker-floating").forEach(marker => marker.remove());

  const cells = gridEl.children;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const type = grid.get(x, y);

    cell.className = "cell";
    cell.style.backgroundImage = "";
    cell.style.transform = "";

    if (enemyOnlyView || friendlyOnlyView) {
      cell.classList.add("enemy-only-mode");
    } else if (mode === "edit") {
      cell.classList.add(`edit-${type}`);
    } else {
      cell.classList.add("preview");
      const neighbors = getNeighbors(grid, x, y);
      const solved = solveTile(type, neighbors);

      if (solved.texture) {
        const url = `${TILESET_PATH}/${solved.texture}`;
        cell.style.backgroundImage = `url('${url}')`;
        cell.style.transform = `rotate(${solved.rotation}deg)`;
      } else {
        cell.classList.add(`edit-${type}`);
      }
    }
  }

  enemySpawns.forEach((enemy) => {
    const enemyType = ENEMY_TYPES.find(t => t.id === enemy.enemyType);
    const marker = document.createElement("div");
    marker.className = "enemy-marker enemy-marker-floating";
    if (enemyOnlyView) marker.classList.add("enemy-marker-large");

    const { left, top } = getEnemyDisplayPosition(enemy);
    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
    marker.style.backgroundColor = enemyType ? enemyType.color : "#FFFF00";
    marker.title = `${enemyType ? enemyType.name : enemy.enemyType} (${enemy.x.toFixed(2)}, ${enemy.z.toFixed(2)})`;
    gridEl.appendChild(marker);
  });

  friendlySpawns.forEach((friendly) => {
    const friendlyType = FRIENDLY_TYPES.find(t => t.id === friendly.friendlyType);
    const marker = document.createElement("div");
    marker.className = "enemy-marker enemy-marker-floating friendly-marker-floating";
    if (friendlyOnlyView) marker.classList.add("enemy-marker-large");

    const { left, top } = getEnemyDisplayPosition(friendly);
    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
    marker.style.backgroundColor = friendlyType ? friendlyType.color : "#00FFFF";
    marker.style.outline = "2px solid #000";
    marker.title = `${friendlyType ? friendlyType.name : friendly.friendlyType} (${friendly.x.toFixed(2)}, ${friendly.z.toFixed(2)})`;
    gridEl.appendChild(marker);
  });
}

function buildRoomJSON() {
  const layout = [];

  for (let y = 0; y < grid.height; y++) {
    let row = "";
    for (let x = 0; x < grid.width; x++) {
      const type = grid.get(x, y);
      switch (type) {
        case "wall":
          row += "#";
          break;
        case "poison":
          row += "P";
          break;
        case "void":
          row += "V";
          break;
        case "spikes":
          row += "^";
          break;
        case "floor":
        default:
          row += ".";
          break;
      }
    }
    layout.push(row);
  }

  const spawnPoints = enemySpawns.map(spawn => ({
    x: Math.round(spawn.x * 10) / 10,
    y: grid.height - 1 - Math.round(spawn.z * 10) / 10,
    enemyType: spawn.enemyType
  }));

  const friendlySpawnPoints = friendlySpawns.map(spawn => ({
    x: Math.round(spawn.x * 10) / 10,
    y: grid.height - 1 - Math.round(spawn.z * 10) / 10,
    friendlyType: spawn.friendlyType
  }));

  return {
    id: sanitizeRoomId(roomIdInput.value || roomNameInput.value),
    name: roomNameInput.value?.trim() || "Custom Room",
    layout,
    spawnPoints,
    friendlySpawnPoints,
    obstacles: [],
  };
}

function loadRoomFromJSON(room) {
  if (!room || !Array.isArray(room.layout) || room.layout.length === 0) {
    throw new Error("Invalid room JSON: missing layout");
  }

  const height = room.layout.length;
  const width = room.layout[0]?.length ?? 0;
  if (width < 2 || height < 2) {
    throw new Error("Invalid room dimensions");
  }

  widthInput.value = String(width);
  heightInput.value = String(height);
  roomNameInput.value = (room.name || "Custom Room").toString();
  roomIdInput.value = sanitizeRoomId((room.id || roomNameInput.value).toString());
  roomIdManuallyEdited = true;

  grid = new Grid(width, height, "floor");
  for (let y = 0; y < height; y++) {
    const row = room.layout[y] || "";
    for (let x = 0; x < width; x++) {
      const char = row[x] || ".";
      let type = "floor";
      if (char === "#") type = "wall";
      else if (char === "P") type = "poison";
      else if (char === "V") type = "void";
      else if (char === "^") type = "spikes";
      grid.set(x, y, type);
    }
  }

  enemySpawns = Array.isArray(room.spawnPoints)
    ? room.spawnPoints.map((spawn) => ({
        x: clamp(Number(spawn.x) || 0, 0, width - 1),
        z: clamp(height - 1 - (Number(spawn.y) || 0), 0, height - 1),
        enemyType: spawn.enemyType || "dummy_tank",
      }))
    : [];

  friendlySpawns = Array.isArray(room.friendlySpawnPoints)
    ? room.friendlySpawnPoints.map((spawn) => ({
        x: clamp(Number(spawn.x) || 0, 0, width - 1),
        z: clamp(height - 1 - (Number(spawn.y) || 0), 0, height - 1),
        friendlyType: spawn.friendlyType || (FRIENDLY_TYPES[0]?.id ?? "shopkeeper_default"),
      }))
    : [];

  renderEnemyList();
  renderFriendlyList();
  buildGrid();
}

function exportRoomJSON() {
  const room = buildRoomJSON();
  const blob = new Blob([JSON.stringify(room, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${room.id}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function saveRoomToFolder() {
  const room = buildRoomJSON();

  if (typeof window.showDirectoryPicker !== "function") {
    alert("Direct save is not supported in this browser. Use Export Room JSON and place the file in src/data/rooms.");
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const fileHandle = await directoryHandle.getFileHandle(`${room.id}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(room, null, 2));
    await writable.close();
    alert(`Saved ${room.id}.json`);
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.error(error);
    alert("Failed to save room file.");
  }
}

const enemyModeBtn = document.getElementById("enemyModeBtn");
const enemyOnlyViewBtn = document.getElementById("enemyOnlyViewBtn");
const enemySelector = document.getElementById("enemySelector");
const addEnemyBtn = document.getElementById("addEnemyBtn");
const enemyXInput = document.getElementById("enemyX");
const enemyZInput = document.getElementById("enemyZ");
const enemyList = document.getElementById("enemyList");

const friendlyModeBtn = document.getElementById("friendlyModeBtn");
const friendlyOnlyViewBtn = document.getElementById("friendlyOnlyViewBtn");
const friendlySelector = document.getElementById("friendlySelector");
const addFriendlyBtn = document.getElementById("addFriendlyBtn");
const friendlyXInput = document.getElementById("friendlyX");
const friendlyZInput = document.getElementById("friendlyZ");
const friendlyList = document.getElementById("friendlyList");

let enemyMode = false;
let enemyOnlyView = false;
let selectedEnemyType = "zombie_basic";

let friendlyMode = false;
let friendlyOnlyView = false;
let selectedFriendlyType = FRIENDLY_TYPES[0]?.id ?? null;

function setEnemyMode(on) {
  enemyMode = !!on;
  if (enemyMode) friendlyMode = false;

  enemyModeBtn.classList.toggle("active", enemyMode);
  enemyModeBtn.textContent = enemyMode ? "Enemy Mode (ON)" : "Enemy Mode (OFF)";

  friendlyModeBtn.classList.toggle("active", friendlyMode);
  friendlyModeBtn.textContent = friendlyMode ? "Friendly Mode (ON)" : "Friendly Mode (OFF)";
}

function setFriendlyMode(on) {
  friendlyMode = !!on;
  if (friendlyMode) enemyMode = false;

  friendlyModeBtn.classList.toggle("active", friendlyMode);
  friendlyModeBtn.textContent = friendlyMode ? "Friendly Mode (ON)" : "Friendly Mode (OFF)";

  enemyModeBtn.classList.toggle("active", enemyMode);
  enemyModeBtn.textContent = enemyMode ? "Enemy Mode (ON)" : "Enemy Mode (OFF)";
}

function findFriendlyNear(x, z, maxDistance = 0.45) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  friendlySpawns.forEach((spawn, index) => {
    const dx = spawn.x - x;
    const dz = spawn.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function updateEnemyInputs(x, z) {
  enemyXInput.value = x.toFixed(2);
  enemyZInput.value = z.toFixed(2);
}

function updateFriendlyInputs(x, z) {
  friendlyXInput.value = x.toFixed(2);
  friendlyZInput.value = z.toFixed(2);
}

function renderEnemyList() {
  enemyList.innerHTML = "";

  if (enemySpawns.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No enemies placed.";
    enemyList.appendChild(empty);
    return;
  }

  enemySpawns.forEach((spawn, index) => {
    const li = document.createElement("li");
    const enemyType = ENEMY_TYPES.find(t => t.id === spawn.enemyType);

    const info = document.createElement("div");
    info.className = "enemy-info";
    info.innerHTML = `<span style="color: ${enemyType ? enemyType.color : "#FFFF00"}">●</span><span>${enemyType ? enemyType.name : spawn.enemyType}</span>`;

    const sliders = document.createElement("div");
    sliders.className = "enemy-sliders";

    const xLabel = document.createElement("label");
    xLabel.textContent = "X:";
    const xRange = document.createElement("input");
    xRange.type = "range";
    xRange.min = "0";
    xRange.max = String(grid.width - 1);
    xRange.step = "0.01";
    xRange.value = String(spawn.x);
    const xNumber = document.createElement("input");
    xNumber.type = "number";
    xNumber.min = "0";
    xNumber.max = String(grid.width - 1);
    xNumber.step = "0.01";
    xNumber.value = spawn.x.toFixed(2);

    const zLabel = document.createElement("label");
    zLabel.textContent = "Z:";
    const zRange = document.createElement("input");
    zRange.type = "range";
    zRange.min = "0";
    zRange.max = String(grid.height - 1);
    zRange.step = "0.01";
    zRange.value = String(spawn.z);
    const zNumber = document.createElement("input");
    zNumber.type = "number";
    zNumber.min = "0";
    zNumber.max = String(grid.height - 1);
    zNumber.step = "0.01";
    zNumber.value = spawn.z.toFixed(2);

    const updateX = (value) => {
      const next = clamp(Number(value), 0, grid.width - 1);
      enemySpawns[index].x = next;
      xRange.value = String(next);
      xNumber.value = next.toFixed(2);
      updateEnemyInputs(enemySpawns[index].x, enemySpawns[index].z);
      render();
    };

    const updateZ = (value) => {
      const next = clamp(Number(value), 0, grid.height - 1);
      enemySpawns[index].z = next;
      zRange.value = String(next);
      zNumber.value = next.toFixed(2);
      updateEnemyInputs(enemySpawns[index].x, enemySpawns[index].z);
      render();
    };

    xRange.addEventListener("input", () => updateX(xRange.value));
    xNumber.addEventListener("input", () => updateX(xNumber.value));
    zRange.addEventListener("input", () => updateZ(zRange.value));
    zNumber.addEventListener("input", () => updateZ(zNumber.value));

    xLabel.appendChild(xRange);
    xLabel.appendChild(xNumber);
    zLabel.appendChild(zRange);
    zLabel.appendChild(zNumber);
    sliders.appendChild(xLabel);
    sliders.appendChild(zLabel);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      enemySpawns.splice(index, 1);
      renderEnemyList();
      render();
    });

    li.appendChild(info);
    li.appendChild(sliders);
    li.appendChild(removeBtn);
    enemyList.appendChild(li);
  });
}

function renderFriendlyList() {
  friendlyList.innerHTML = "";

  if (friendlySpawns.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No friendlies placed.";
    friendlyList.appendChild(empty);
    return;
  }

  friendlySpawns.forEach((spawn, index) => {
    const li = document.createElement("li");
    const friendlyType = FRIENDLY_TYPES.find(t => t.id === spawn.friendlyType);

    const info = document.createElement("div");
    info.className = "enemy-info";
    info.innerHTML = `<span style="color: ${friendlyType ? friendlyType.color : "#00FFFF"}">●</span><span>${friendlyType ? friendlyType.name : spawn.friendlyType}</span>`;

    const sliders = document.createElement("div");
    sliders.className = "enemy-sliders";

    const xLabel = document.createElement("label");
    xLabel.textContent = "X:";
    const xRange = document.createElement("input");
    xRange.type = "range";
    xRange.min = "0";
    xRange.max = String(grid.width - 1);
    xRange.step = "0.01";
    xRange.value = String(spawn.x);
    const xNumber = document.createElement("input");
    xNumber.type = "number";
    xNumber.min = "0";
    xNumber.max = String(grid.width - 1);
    xNumber.step = "0.01";
    xNumber.value = spawn.x.toFixed(2);

    const zLabel = document.createElement("label");
    zLabel.textContent = "Z:";
    const zRange = document.createElement("input");
    zRange.type = "range";
    zRange.min = "0";
    zRange.max = String(grid.height - 1);
    zRange.step = "0.01";
    zRange.value = String(spawn.z);
    const zNumber = document.createElement("input");
    zNumber.type = "number";
    zNumber.min = "0";
    zNumber.max = String(grid.height - 1);
    zNumber.step = "0.01";
    zNumber.value = spawn.z.toFixed(2);

    const updateX = (value) => {
      const next = clamp(Number(value), 0, grid.width - 1);
      friendlySpawns[index].x = next;
      xRange.value = String(next);
      xNumber.value = next.toFixed(2);
      updateFriendlyInputs(friendlySpawns[index].x, friendlySpawns[index].z);
      render();
    };

    const updateZ = (value) => {
      const next = clamp(Number(value), 0, grid.height - 1);
      friendlySpawns[index].z = next;
      zRange.value = String(next);
      zNumber.value = next.toFixed(2);
      updateFriendlyInputs(friendlySpawns[index].x, friendlySpawns[index].z);
      render();
    };

    xRange.addEventListener("input", () => updateX(xRange.value));
    xNumber.addEventListener("input", () => updateX(xNumber.value));
    zRange.addEventListener("input", () => updateZ(zRange.value));
    zNumber.addEventListener("input", () => updateZ(zNumber.value));

    xLabel.appendChild(xRange);
    xLabel.appendChild(xNumber);
    zLabel.appendChild(zRange);
    zLabel.appendChild(zNumber);
    sliders.appendChild(xLabel);
    sliders.appendChild(zLabel);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      friendlySpawns.splice(index, 1);
      renderFriendlyList();
      render();
    });

    li.appendChild(info);
    li.appendChild(sliders);
    li.appendChild(removeBtn);
    friendlyList.appendChild(li);
  });
}

ENEMY_TYPES.forEach(enemy => {
  const option = document.createElement("option");
  option.value = enemy.id;
  option.textContent = enemy.name;
  enemySelector.appendChild(option);
});

FRIENDLY_TYPES.forEach(friendly => {
  const option = document.createElement("option");
  option.value = friendly.id;
  option.textContent = friendly.name;
  friendlySelector.appendChild(option);
});

enemySelector.addEventListener("change", (e) => {
  selectedEnemyType = e.target.value;
});

friendlySelector.addEventListener("change", (e) => {
  selectedFriendlyType = e.target.value;
});

enemyModeBtn.addEventListener("click", () => {
  setEnemyMode(!enemyMode);
  render();
});

friendlyModeBtn.addEventListener("click", () => {
  setFriendlyMode(!friendlyMode);
  render();
});

enemyOnlyViewBtn.addEventListener("click", () => {
  enemyOnlyView = !enemyOnlyView;
  if (enemyOnlyView) friendlyOnlyView = false;

  enemyOnlyViewBtn.classList.toggle("active", enemyOnlyView);
  friendlyOnlyViewBtn.classList.toggle("active", friendlyOnlyView);
  render();
});

friendlyOnlyViewBtn.addEventListener("click", () => {
  friendlyOnlyView = !friendlyOnlyView;
  if (friendlyOnlyView) enemyOnlyView = false;

  friendlyOnlyViewBtn.classList.toggle("active", friendlyOnlyView);
  enemyOnlyViewBtn.classList.toggle("active", enemyOnlyView);
  render();
});

addEnemyBtn.addEventListener("click", () => {
  const x = clamp(parseFloat(enemyXInput.value), 0, grid.width - 1);
  const z = clamp(parseFloat(enemyZInput.value), 0, grid.height - 1);
  if (isNaN(x) || isNaN(z)) {
    alert("Invalid coordinates");
    return;
  }

  enemySpawns.push({ x, z, enemyType: selectedEnemyType });
  renderEnemyList();
  render();
});

addFriendlyBtn.addEventListener("click", () => {
  const x = clamp(parseFloat(friendlyXInput.value), 0, grid.width - 1);
  const z = clamp(parseFloat(friendlyZInput.value), 0, grid.height - 1);
  if (isNaN(x) || isNaN(z)) {
    alert("Invalid coordinates");
    return;
  }
  if (!selectedFriendlyType) {
    alert("No friendly type selected");
    return;
  }

  friendlySpawns.push({ x, z, friendlyType: selectedFriendlyType });
  renderFriendlyList();
  render();
});

modeBtn.addEventListener("click", () => {
  mode = mode === "edit" ? "preview" : "edit";
  modeBtn.dataset.mode = mode;
  modeBtn.textContent = mode === "edit" ? "Edit Mode" : "Preview Mode";
  render();
});

importRoomBtn.addEventListener("click", () => {
  importRoomInput.click();
});

importRoomInput.addEventListener("change", async () => {
  const file = importRoomInput.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    const room = JSON.parse(content);
    loadRoomFromJSON(room);
  } catch (error) {
    console.error(error);
    alert("Invalid room JSON file.");
  } finally {
    importRoomInput.value = "";
  }
});

resizeBtn.addEventListener("click", () => {
  const w = Number(widthInput.value);
  const h = Number(heightInput.value);
  if (Number.isNaN(w) || Number.isNaN(h) || w < 2 || h < 2) return;

  grid = createDefaultRoomGrid(w, h);
  enemySpawns = enemySpawns.map(spawn => ({
    ...spawn,
    x: clamp(spawn.x, 0, w - 1),
    z: clamp(spawn.z, 0, h - 1),
  }));
  friendlySpawns = friendlySpawns.map(spawn => ({
    ...spawn,
    x: clamp(spawn.x, 0, w - 1),
    z: clamp(spawn.z, 0, h - 1),
  }));

  renderEnemyList();
  renderFriendlyList();
  buildGrid();
});

exportRoomBtn.addEventListener("click", exportRoomJSON);
saveRoomBtn.addEventListener("click", saveRoomToFolder);

toolButtons.forEach(btn => {
  btn.addEventListener("click", () => setActiveTool(btn.dataset.type));
});

gridEl.addEventListener("mousedown", (event) => {
  if (enemyMode) {
    const { x, z } = gridPositionFromMouseEvent(event);
    const existingEnemyIndex = findEnemyNear(x, z);

    if (existingEnemyIndex >= 0) {
      draggingEnemyIndex = existingEnemyIndex;
    } else {
      enemySpawns.push({ x, z, enemyType: selectedEnemyType });
      draggingEnemyIndex = enemySpawns.length - 1;
      renderEnemyList();
    }

    updateEnemyInputs(enemySpawns[draggingEnemyIndex].x, enemySpawns[draggingEnemyIndex].z);
    render();
    event.preventDefault();
    return;
  }

  if (friendlyMode) {
    const { x, z } = gridPositionFromMouseEvent(event);
    const existingFriendlyIndex = findFriendlyNear(x, z);

    if (existingFriendlyIndex >= 0) {
      draggingFriendlyIndex = existingFriendlyIndex;
    } else {
      friendlySpawns.push({ x, z, friendlyType: selectedFriendlyType || FRIENDLY_TYPES[0]?.id || "shopkeeper_default" });
      draggingFriendlyIndex = friendlySpawns.length - 1;
      renderFriendlyList();
    }

    updateFriendlyInputs(friendlySpawns[draggingFriendlyIndex].x, friendlySpawns[draggingFriendlyIndex].z);
    render();
    event.preventDefault();
    return;
  }

  const cell = event.target.closest(".cell");
  if (!cell) return;

  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  isPainting = true;
  paintCell(x, y);
});

gridEl.addEventListener("mousemove", (event) => {
  if (enemyMode && draggingEnemyIndex !== null) {
    const { x, z } = gridPositionFromMouseEvent(event);
    enemySpawns[draggingEnemyIndex].x = x;
    enemySpawns[draggingEnemyIndex].z = z;
    updateEnemyInputs(x, z);
    render();
    return;
  }

  if (friendlyMode && draggingFriendlyIndex !== null) {
    const { x, z } = gridPositionFromMouseEvent(event);
    friendlySpawns[draggingFriendlyIndex].x = x;
    friendlySpawns[draggingFriendlyIndex].z = z;
    updateFriendlyInputs(x, z);
    render();
    return;
  }

  if (!isPainting || enemyMode || friendlyMode) return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  paintCell(Number(cell.dataset.x), Number(cell.dataset.y));
});

window.addEventListener("mouseup", () => {
  isPainting = false;

  if (draggingEnemyIndex !== null) {
    renderEnemyList();
  }
  if (draggingFriendlyIndex !== null) {
    renderFriendlyList();
  }

  draggingEnemyIndex = null;
  draggingFriendlyIndex = null;
});

setActiveTool("floor");
roomIdInput.value = sanitizeRoomId(roomIdInput.value || roomNameInput.value);
renderEnemyList();
renderFriendlyList();
buildGrid();
