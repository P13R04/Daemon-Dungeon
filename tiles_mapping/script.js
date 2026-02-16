const TILESET_PATH = "tiles_test";

const TYPES = ["void", "floor", "wall", "pillar", "poison", "spikes"];

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
  return type === "wall" || type === "pillar";
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
  if (type === "wall" || type === "pillar") {
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
const exportBtn = document.getElementById("exportBtn");
const exportGameBtn = document.getElementById("exportGameBtn");
const widthInput = document.getElementById("gridWidth");
const heightInput = document.getElementById("gridHeight");
const toolButtons = Array.from(document.querySelectorAll(".tool"));

let grid = new Grid(Number(widthInput.value), Number(heightInput.value));
let currentType = "floor";
let mode = "edit";
let isPainting = false;

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
  const cells = gridEl.children;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const type = grid.get(x, y);

    cell.className = "cell";
    cell.style.backgroundImage = "";
    cell.style.transform = "";

    if (mode === "edit") {
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
        // No texture (walls), use solid color placeholder
        cell.classList.add(`edit-${type}`);
        cell.style.backgroundImage = "";
        cell.style.transform = "";
      }
    }
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(grid.toJSON(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "room.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function findFirstFloor(layout) {
  for (let y = 0; y < layout.length; y++) {
    for (let x = 0; x < layout[y].length; x++) {
      if (layout[y][x] !== "#" && layout[y][x] !== "V") {
        return { x, y };
      }
    }
  }
  return { x: 1, y: 1 };
}

function exportGameJSON() {
  const layout = [];
  const obstacles = [];

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
        case "pillar":
          row += ".";
          obstacles.push({ x, y, width: 1, height: 1, type: "pillar" });
          break;
        case "floor":
        default:
          row += ".";
          break;
      }
    }
    layout.push(row);
  }

  const playerSpawnPoint = findFirstFloor(layout);
  const room = {
    id: "room_custom",
    name: "Custom Room",
    layout,
    spawnPoints: [],
    playerSpawnPoint,
    obstacles,
  };

  const blob = new Blob([JSON.stringify(room, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "room_game.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

modeBtn.addEventListener("click", () => {
  mode = mode === "edit" ? "preview" : "edit";
  modeBtn.dataset.mode = mode;
  modeBtn.textContent = mode === "edit" ? "Edit Mode" : "Preview Mode";
  render();
});

resizeBtn.addEventListener("click", () => {
  const w = Number(widthInput.value);
  const h = Number(heightInput.value);
  if (Number.isNaN(w) || Number.isNaN(h) || w < 2 || h < 2) return;
  grid = new Grid(w, h);
  buildGrid();
});

exportBtn.addEventListener("click", exportJSON);
exportGameBtn.addEventListener("click", exportGameJSON);

toolButtons.forEach(btn => {
  btn.addEventListener("click", () => setActiveTool(btn.dataset.type));
});

gridEl.addEventListener("mousedown", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  isPainting = true;
  paintCell(Number(cell.dataset.x), Number(cell.dataset.y));
});

gridEl.addEventListener("mouseover", (event) => {
  if (!isPainting) return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  paintCell(Number(cell.dataset.x), Number(cell.dataset.y));
});

window.addEventListener("mouseup", () => {
  isPainting = false;
});

setActiveTool("floor");
buildGrid();
