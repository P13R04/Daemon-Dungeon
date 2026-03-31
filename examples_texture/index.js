const TILE = 1.2;
const MAP = [
    '##############',
    '#....P....V..#',
    '#.##.P.##.V..#',
    '#....P....#..#',
    '#.#..P.^..##.#',
    '#....P....#..#',
    '#.##.PPP..##.#',
    '#....P.......#',
    '#..V.V..^^..V#',
    '#......M.....#',
    '##############',
];

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const NW = 1;
const NE = 2;
const SE = 4;
const SW = 8;

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);

function hash2(x, y, seed = 0.0) {
    const s = Math.sin((x + 0.713) * 127.1 + (y + 0.237) * 311.7 + seed * 91.13) * 43758.5453123;
    return s - Math.floor(s);
}

function mossBlobAt(gx, gy) {
    // Lower frequency gives larger clumps that read as actual volume on displaced mesh.
    const sx = gx * 2.2;
    const sy = gy * 2.2;
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);

    let blob = 0.0;
    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const hx = ix + ox;
            const hy = iy + oy;
            const cx = hx + hash2(hx, hy, 0.11);
            const cy = hy + hash2(hx, hy, 0.27);
            const dx = sx - cx;
            const dy = sy - cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const rad = 0.2 + hash2(hx, hy, 0.49) * 0.16;
            const core = 1.0 - smoothstep(rad * 0.45, rad, d);
            blob = Math.max(blob, core);
        }
    }

    // Circular, volumetric micro spots.
    return blob;
}

function has(map, x, z, wanted) {
    if (z < 0 || z >= map.length || x < 0 || x >= map[0].length) return false;
    return wanted.includes(map[z][x]);
}

function maskFrom(map, x, z, chars) {
    let mask = 0;
    if (has(map, x, z - 1, chars)) mask |= N;
    if (has(map, x + 1, z, chars)) mask |= E;
    if (has(map, x, z + 1, chars)) mask |= S;
    if (has(map, x - 1, z, chars)) mask |= W;
    return mask;
}

function diagMaskFrom(map, x, z, chars) {
    let mask = 0;
    if (has(map, x - 1, z - 1, chars)) mask |= NW;
    if (has(map, x + 1, z - 1, chars)) mask |= NE;
    if (has(map, x + 1, z + 1, chars)) mask |= SE;
    if (has(map, x - 1, z + 1, chars)) mask |= SW;
    return mask;
}

function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.00001, b - a)));
    return t * t * (3 - 2 * t);
}

const ELEVATION_STRENGTH = 0.09;
const ELEVATION_JITTER = 0.0;
const WALL_ELEVATION_STRENGTH = 0.14;
const WALL_BRICKS_X = 3.0;
const WALL_BRICKS_Y = 6.0;
const WALL_MORTAR_W = 0.08;
const WALL_BASE_HEIGHT = 0.12;
const WALL_MOSS_COLOR_STRENGTH = 0.22;
const WALL_MOSS_HEIGHT_STRENGTH = 1.8;

function floorHeightAt(gx, gy) {
    const stoneX = 2.35;
    const stoneY = 2.35;
    const seamW = 0.032;

    const cellX = (gx * stoneX) % 1;
    const cellY = (gy * stoneY) % 1;
    const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
    const seam = 1.0 - smoothstep(0, seamW, border);

    const stoneIdX = Math.floor(gx * stoneX);
    const stoneIdY = Math.floor(gy * stoneY);
    const rawStone = hash2(stoneIdX * 1.17, stoneIdY * 1.31, 0.12);
    const stoneHeight = Math.floor(rawStone * 5.0) / 5.0;

    // Plate-based elevation: mostly flat per stone, with recessed seams.
    const seamDrop = border < seamW ? 0.34 : 0.0;
    const base = 0.42 + stoneHeight * 0.42 - seamDrop;
    return Math.max(0, Math.min(1, base));
}

function wallHeightAt(gu, gv, bricksY = WALL_BRICKS_Y) {

    const row = Math.floor(gv * bricksY);
    const stagger = (row % 2) * 0.5;
    const cellX = (gu * WALL_BRICKS_X + stagger) % 1;
    const cellY = (gv * bricksY) % 1;
    const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));

    const brickIdX = Math.floor(gu * WALL_BRICKS_X + stagger);
    const brickIdY = Math.floor(gv * bricksY);
    // Slightly soften the mortar->brick edge to reduce temporal aliasing when camera moves.
    const brickMask = smoothstep(WALL_MORTAR_W * 0.82, WALL_MORTAR_W * 1.22, border);
    const mortarMask = 1.0 - brickMask;

    // Flat per-brick levels: no intra-brick bumps.
    const rawBrick = hash2(brickIdX * 1.23, brickIdY * 1.31, 0.37);
    const steppedBrick = Math.floor(rawBrick * 5.0) / 5.0;

    // Subtle volumetric moss clumps in global space, sparsified per-brick.
    const mossBlob = mossBlobAt(gu, gv);
    const mossGate = smoothstep(0.56, 0.9, hash2(brickIdX * 0.77, brickIdY * 0.91, 0.63));
    const mossMask = smoothstep(0.2, 0.74, mossBlob) * brickMask * mossGate;
    const mossThickness = (0.015 + mossBlob * 0.12) * mossMask * WALL_MOSS_HEIGHT_STRENGTH;

    const brickRelief = (0.44 + steppedBrick * 0.5) * brickMask;
    const mortarBase = WALL_BASE_HEIGHT * mortarMask;
    const base = mortarBase + brickRelief + mossThickness;
    return Math.max(0, Math.min(1, base));
}

function applyWallFaceDisplacement(mesh, faceWidth, faceHeight, hOffset, axisSeed = 0, flipU = false, bricksY = WALL_BRICKS_Y, joinEdgeCorners = false, cornerCapMask = 0, uScale = 1.0, depthScale = 1.0) {
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return;

    for (let i = 0; i < positions.length; i += 3) {
        const lx = positions[i];
        const lz = positions[i + 2];
        const uRaw = lx / faceWidth + 0.5;
        const u = flipU ? (1.0 - uRaw) : uRaw;
        const v = lz / faceHeight + 0.5;
        let h = wallHeightAt(hOffset + u * uScale + axisSeed * 1000.0, v, bricksY);
        // On side walls, only enforce aggressive edge closure for truly open corners.
        if (joinEdgeCorners && cornerCapMask !== 0) {
            const edgeU = Math.min(uRaw, 1.0 - uRaw);
            const edgeJoin = 1.0 - smoothstep(0.0, 0.15, edgeU);  // (was 0.08) — wider closure band
            const minEdgeHeight = WALL_BASE_HEIGHT + 0.12;  // (was 0.06) — taller minimum
            h = h * (1.0 - edgeJoin) + Math.max(h, minEdgeHeight) * edgeJoin;

            // Keep a shared base level across faces for cleaner corner junctions at the wall foot.
            const baseBand = 1.0 - smoothstep(0.0, 0.015, v);
            const baseHeight = WALL_BASE_HEIGHT;
            h = h * (1.0 - baseBand) + Math.max(h, baseHeight) * baseBand;
        }
        // End-of-wall corner caps: close both half and full bricks on open convex corners.
        if (cornerCapMask !== 0) {
            const edgeL = (cornerCapMask & 1) ? (1.0 - smoothstep(0.0, 0.08, uRaw)) : 0.0;
            const edgeR = (cornerCapMask & 2) ? (1.0 - smoothstep(0.0, 0.08, 1.0 - uRaw)) : 0.0;
            if (edgeL > 0.0 || edgeR > 0.0) {
                // Expand corner band to wider coverage for better visual closure.
                const cornerBand = 0.20;  // (was 0.12) — wider band to reach further into corner
                const edgeBlend = Math.max(
                    (cornerCapMask & 1) ? (1.0 - smoothstep(0.0, cornerBand, uRaw)) : 0.0,
                    (cornerCapMask & 2) ? (1.0 - smoothstep(0.0, cornerBand, 1.0 - uRaw)) : 0.0
                );
                if (edgeBlend > 0.0) {
                    let uRefRaw = uRaw;
                    if ((cornerCapMask & 1) && uRaw < cornerBand) uRefRaw = cornerBand + (cornerBand - uRaw);
                    if ((cornerCapMask & 2) && (1.0 - uRaw) < cornerBand) uRefRaw = (1.0 - cornerBand) - (cornerBand - (1.0 - uRaw));
                    uRefRaw = Math.max(0.0, Math.min(1.0, uRefRaw));
                    const uRef = flipU ? (1.0 - uRefRaw) : uRefRaw;
                    const hRefCorner = wallHeightAt(hOffset + uRef * uScale + axisSeed * 1000.0, v, bricksY);
                    h = h * (1.0 - edgeBlend) + hRefCorner * edgeBlend;
                }

                const fracY = (v * bricksY) % 1.0;
                const diagL = 1.0 - smoothstep(0.0, 0.24, Math.abs(fracY - uRaw * 0.62));
                const diagR = 1.0 - smoothstep(0.0, 0.24, Math.abs(fracY - (1.0 - uRaw) * 0.62));
                const cap = Math.max(edgeL * diagL, edgeR * diagR);
                const capHeight = WALL_BASE_HEIGHT + 0.28;  // (was 0.18) — taller corner cap
                h = h * (1.0 - cap) + Math.max(h, capHeight) * cap;

                // Fill residual pits between two facing half-bricks with a soft solid bridge.
                const bridge = Math.max(edgeL, edgeR) * (1.0 - smoothstep(0.0, 0.44, Math.abs(fracY - 0.5)));
                h = h * (1.0 - bridge) + Math.max(h, WALL_BASE_HEIGHT + 0.22) * bridge;  // (was 0.14) — taller bridge

                // Ensure unfinished half-bricks near corners are sealed and re-leveled with wall base.
                const cornerHalfSeal = Math.max(edgeL, edgeR) * (1.0 - smoothstep(0.0, 0.22, Math.min(fracY, 1.0 - fracY)));
                h = h * (1.0 - cornerHalfSeal) + Math.max(h, WALL_BASE_HEIGHT + 0.14) * cornerHalfSeal;  // (was 0.06) — taller seal
            }
        }
        // Keep displacement continuous across block boundaries.
        positions[i + 1] = h * WALL_ELEVATION_STRENGTH * depthScale;
    }

    mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
}

function stabilizeTopOpenEdgeHalfBricks(mesh, faceWidth, faceHeight, hOffset, axisSeed, flipU, exposedMask, bricksY = 3.0) {
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return;

    const edgeBand = 0.8;
    for (let i = 0; i < positions.length; i += 3) {
        const lx = positions[i];
        const lz = positions[i + 2];
        const uRaw = lx / faceWidth + 0.5;
        const u = flipU ? (1.0 - uRaw) : uRaw;
        const v = lz / faceHeight + 0.5;

        let exposedEdge = 0.0;
        if (exposedMask & N) exposedEdge = Math.max(exposedEdge, smoothstep(edgeBand, 1.0, v));
        if (exposedMask & S) exposedEdge = Math.max(exposedEdge, smoothstep(edgeBand, 1.0, 1.0 - v));
        if (exposedMask & E) exposedEdge = Math.max(exposedEdge, smoothstep(edgeBand, 1.0, uRaw));
        if (exposedMask & W) exposedEdge = Math.max(exposedEdge, smoothstep(edgeBand, 1.0, 1.0 - uRaw));
        if (exposedEdge <= 0.0001) continue;

        // Mirror the interior profile near exposed borders to keep half-bricks volumetrically continuous.
        let uRef = u;
        let vRef = v;
        if ((exposedMask & N) && v > edgeBand) vRef = Math.max(0.0, edgeBand - (v - edgeBand));
        if ((exposedMask & S) && v < (1.0 - edgeBand)) vRef = Math.min(1.0, (1.0 - edgeBand) + ((1.0 - edgeBand) - v));
        if ((exposedMask & E) && uRaw > edgeBand) {
            const uRawRef = Math.max(0.0, edgeBand - (uRaw - edgeBand));
            uRef = flipU ? (1.0 - uRawRef) : uRawRef;
        }
        if ((exposedMask & W) && uRaw < (1.0 - edgeBand)) {
            const uRawRef = Math.min(1.0, (1.0 - edgeBand) + ((1.0 - edgeBand) - uRaw));
            uRef = flipU ? (1.0 - uRawRef) : uRawRef;
        }

        const hRef = wallHeightAt(hOffset + uRef + axisSeed * 1000.0, vRef, bricksY) * WALL_ELEVATION_STRENGTH;

        const gu = hOffset + u + axisSeed * 1000.0;
        const row = Math.floor(v * bricksY);
        const stagger = (row % 2) * 0.5;
        const cellX = (gu * WALL_BRICKS_X + stagger) % 1;
        const cellY = (v * bricksY) % 1;
        const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
        const brickMask = smoothstep(WALL_MORTAR_W * 0.82, WALL_MORTAR_W * 1.22, border);
        const halfBrickZone = 1.0 - smoothstep(0.78, 0.98, brickMask);
        const blend = exposedEdge * halfBrickZone;

        // Keep slight lowering at the very edge while avoiding open cracks between half-bricks.
        const loweredRef = Math.max(0.0, hRef - blend * WALL_ELEVATION_STRENGTH * 0.08);
        let outY = positions[i + 1] * (1.0 - blend) + loweredRef * blend;

        // On exposed wall ends, force top/bottom completion of cut bricks on the top panel only.
        const exposedV = Math.max(
            (exposedMask & N) ? smoothstep(edgeBand, 1.0, v) : 0.0,
            (exposedMask & S) ? smoothstep(edgeBand, 1.0, 1.0 - v) : 0.0
        );
        if (exposedV > 0.0) {
            const finishMask = exposedV * halfBrickZone;
            outY = Math.max(0.0, outY - finishMask * WALL_ELEVATION_STRENGTH * 0.22);
        }

        // Also finish exposed E/W ends of wall tops, and hard-cap the extreme edge to remove unfinished half-bricks.
        const exposedU = Math.max(
            (exposedMask & E) ? smoothstep(edgeBand, 1.0, uRaw) : 0.0,
            (exposedMask & W) ? smoothstep(edgeBand, 1.0, 1.0 - uRaw) : 0.0
        );
        const finishV = exposedV * halfBrickZone;
        const finishU = exposedU * (0.38 + 0.62 * halfBrickZone);
        const finishAll = Math.max(finishV, finishU);
        if (finishAll > 0.0) {
            outY = Math.max(0.0, outY - finishAll * WALL_ELEVATION_STRENGTH * 0.34);
            // Hard cap near the very left/right extremity of exposed top ends.
            if (exposedU > 0.92) {
                outY = Math.min(outY, WALL_ELEVATION_STRENGTH * 0.008);
            }
        }

        positions[i + 1] = outY;
    }

    const normals = new Array(positions.length).fill(0);
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
}

// Stabilize vertical corner edges of side faces by mirroring half-brick profiles horizontally.
function stabilizeCornerVerticalEdges(mesh, faceWidth, faceHeight, hOffset, axisSeed, flipU, bricksY, isLeftEdge = true, uScale = 1.0, depthScale = 1.0) {
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return;

    const cornerBand = 0.12;
    for (let i = 0; i < positions.length; i += 3) {
        const lx = positions[i];
        const lz = positions[i + 2];
        const uRaw = lx / faceWidth + 0.5;
        const u = flipU ? (1.0 - uRaw) : uRaw;
        const v = lz / faceHeight + 0.5;

        // Only apply to left or right edge based on parameter.
        let cornerEdge = 0.0;
        if (isLeftEdge) {
            cornerEdge = 1.0 - smoothstep(0.0, cornerBand, uRaw);
        } else {
            cornerEdge = 1.0 - smoothstep(0.0, cornerBand, 1.0 - uRaw);
        }
        if (cornerEdge <= 0.0001) continue;

        // Mirror the interior profile horizontally (via U-mirroring) for volumetric continuity.
        let uMirror = u;
        if (isLeftEdge && uRaw < cornerBand) {
            const uRawMirror = cornerBand + (cornerBand - uRaw);
            uMirror = flipU ? (1.0 - uRawMirror) : uRawMirror;
        } else if (!isLeftEdge && uRaw > (1.0 - cornerBand)) {
            const uRawMirror = (1.0 - cornerBand) - (uRaw - (1.0 - cornerBand));
            uMirror = flipU ? (1.0 - uRawMirror) : uRawMirror;
        }

        const hRef = wallHeightAt(hOffset + uMirror * uScale + axisSeed * 1000.0, v, bricksY) * WALL_ELEVATION_STRENGTH * depthScale;

        // Detect half-bricks at the corner edge.
        const gu = hOffset + u * uScale + axisSeed * 1000.0;
        const row = Math.floor(v * bricksY);
        const stagger = (row % 2) * 0.5;
        const cellX = (gu * WALL_BRICKS_X + stagger) % 1;
        const cellY = (v * bricksY) % 1;
        const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
        const brickMask = smoothstep(WALL_MORTAR_W * 0.82, WALL_MORTAR_W * 1.22, border);
        const halfBrickZone = 1.0 - smoothstep(0.78, 0.98, brickMask);
        const blend = cornerEdge * halfBrickZone;

        // Blend the mirrored profile into the corner edge to close half-bricks.
        const currentY = positions[i + 1];
        const blendedRef = Math.max(0.0, hRef - blend * WALL_ELEVATION_STRENGTH * depthScale * 0.06);
        positions[i + 1] = currentY * (1.0 - blend) + blendedRef * blend;
    }

    const normals = new Array(positions.length).fill(0);
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
}

function buildReliefWallBlock(scene, name, px, py, pz, baseSize, heightScale, seedX, seedZ, parent, getFaceMaterial, coreMaterial = null, wallNeighborMask = 0) {
    const block = new BABYLON.TransformNode(name, scene);
    block.position.set(px, py, pz);
    block.parent = parent;

    const wallHeight = baseSize * heightScale;
    // Keep a tiny gap between core and displaced faces to prevent depth conflicts on fine motifs.
    const inset = baseSize * 0.996;
    // Slight inward embed keeps relief readable while minimizing corner slits.
    const facePlaneInset = baseSize * 0.003;

    const core = BABYLON.MeshBuilder.CreateBox(`${name}_core`, {
        width: inset,
        depth: inset,
        height: wallHeight,
    }, scene);
    core.material = coreMaterial || getFaceMaterial('core', seedX, 0);
    core.parent = block;

    const makeFace = (faceName, ry, ox, oy, oz, hOffset, axisSeed, flipU = false, faceWidth = baseSize, faceHeight = wallHeight, bricksY = WALL_BRICKS_Y, joinEdgeCorners = false, cornerCapMask = 0, allowPartialEdgeHighlights = false, doubleSided = false, uScale = 1.0, depthScale = 1.0) => {
        const face = BABYLON.MeshBuilder.CreateGround(`${name}_${faceName}`, {
            width: faceWidth,
            height: faceHeight,
            subdivisions: 96,
            sideOrientation: doubleSided ? BABYLON.Mesh.DOUBLESIDE : BABYLON.Mesh.FRONTSIDE,
            updatable: true,
        }, scene);
        applyWallFaceDisplacement(face, faceWidth, faceHeight, hOffset, axisSeed, flipU, bricksY, joinEdgeCorners, cornerCapMask, uScale, depthScale);
        // Use a consistent transform so local Z (height map V axis) always maps to world Y.
        face.rotation.set(Math.PI / 2, ry, 0);
        face.position.set(ox, oy, oz);
        face.material = getFaceMaterial(faceName, hOffset, axisSeed, flipU, bricksY, allowPartialEdgeHighlights, uScale);
        face.parent = block;
        return face;  // Return mesh for corner stabilization
    };

    const makeCornerFace = (faceName, ry, ox, oz, hOffset, flipU = false) => {
        const cornerWidth = baseSize * 0.150;
        const cornerUScale = 0.5 / WALL_BRICKS_X;
        const cornerDepthScale = 0.52;
        return makeFace(
            faceName,
            ry,
            ox,
            0,
            oz,
            hOffset,
            0,
            flipU,
            cornerWidth,
            wallHeight,
            WALL_BRICKS_Y,
            false,
            0,
            false,
            true,
            cornerUScale,
            cornerDepthScale
        );
    };

    // Side faces: keep world-axis mapping for inter-panel continuity.
    const openN = (wallNeighborMask & N) === 0;
    const openE = (wallNeighborMask & E) === 0;
    const openS = (wallNeighborMask & S) === 0;
    const openW = (wallNeighborMask & W) === 0;
    // cornerCapMask bits: 1=left edge, 2=right edge in face-local U space
    const northCornerCap = (openN && openW ? 1 : 0) | (openN && openE ? 2 : 0);
    const southCornerCap = (openS && openE ? 1 : 0) | (openS && openW ? 2 : 0);
    const eastCornerCap = (openE && openN ? 1 : 0) | (openE && openS ? 2 : 0);
    const westCornerCap = (openW && openS ? 1 : 0) | (openW && openN ? 2 : 0);

    const northFace = makeFace('north', 0, 0, 0, baseSize * 0.5 - facePlaneInset, seedX, 0, false, baseSize, wallHeight, WALL_BRICKS_Y, true, northCornerCap, false);
    const southFace = makeFace('south', Math.PI, 0, 0, -baseSize * 0.5 + facePlaneInset, seedX, 0, true, baseSize, wallHeight, WALL_BRICKS_Y, true, southCornerCap, false);
    const eastFace = makeFace('east', Math.PI / 2, baseSize * 0.5 - facePlaneInset, 0, 0, seedZ, 0, true, baseSize, wallHeight, WALL_BRICKS_Y, true, eastCornerCap, false);
    const westFace = makeFace('west', -Math.PI / 2, -baseSize * 0.5 + facePlaneInset, 0, 0, seedZ, 0, false, baseSize, wallHeight, WALL_BRICKS_Y, true, westCornerCap, false);

    // Stabilize corner edges with half-brick mirroring for smooth closure.
    if (openN && openW) stabilizeCornerVerticalEdges(northFace, baseSize, wallHeight, seedX, 0, false, WALL_BRICKS_Y, true);
    if (openN && openE) stabilizeCornerVerticalEdges(northFace, baseSize, wallHeight, seedX, 0, false, WALL_BRICKS_Y, false);
    if (openS && openE) stabilizeCornerVerticalEdges(southFace, baseSize, wallHeight, seedX, 0, true, WALL_BRICKS_Y, true);
    if (openS && openW) stabilizeCornerVerticalEdges(southFace, baseSize, wallHeight, seedX, 0, true, WALL_BRICKS_Y, false);
    if (openE && openN) stabilizeCornerVerticalEdges(eastFace, baseSize, wallHeight, seedZ, 0, true, WALL_BRICKS_Y, true);
    if (openE && openS) stabilizeCornerVerticalEdges(eastFace, baseSize, wallHeight, seedZ, 0, true, WALL_BRICKS_Y, false);
    if (openW && openS) stabilizeCornerVerticalEdges(westFace, baseSize, wallHeight, seedZ, 0, false, WALL_BRICKS_Y, true);
    if (openW && openN) stabilizeCornerVerticalEdges(westFace, baseSize, wallHeight, seedZ, 0, false, WALL_BRICKS_Y, false);

    // Add textured chamfer faces on open convex corners to provide real geometric closure.
    const cornerPos = baseSize * 0.5 + baseSize * 0.005;
    const cornerOffsetSeed = (seedX + seedZ) * 0.5;
    if (openN && openW) makeCornerFace('corner_nw', -Math.PI * 0.25, -cornerPos, cornerPos, cornerOffsetSeed, false);
    if (openN && openE) makeCornerFace('corner_ne', Math.PI * 0.25, cornerPos, cornerPos, cornerOffsetSeed, true);
    if (openS && openE) makeCornerFace('corner_se', Math.PI * 0.75, cornerPos, -cornerPos, cornerOffsetSeed, false);
    if (openS && openW) makeCornerFace('corner_sw', -Math.PI * 0.75, -cornerPos, -cornerPos, cornerOffsetSeed, true);

    // Flat top bricks on each wall tile (no mini stacked side walls).
    const topSize = baseSize;
    const topY = wallHeight * 0.5 + 0.001;
    const top = BABYLON.MeshBuilder.CreateGround(`${name}_top_flat`, {
        width: topSize,
        height: topSize,
        subdivisions: 96,
        updatable: true,
    }, scene);
    // Use a shared top offset so the top pattern stays coherent with side brick style.
    const topOffset = seedX;
    const topAxisSeed = seedZ / 1000.0;
    const exposedTopMask = (~wallNeighborMask) & (N | E | S | W);
    applyWallFaceDisplacement(top, topSize, topSize, topOffset, topAxisSeed, false, 3.0, false);
    stabilizeTopOpenEdgeHalfBricks(top, topSize, topSize, topOffset, topAxisSeed, false, exposedTopMask, 3.0);
    top.position.set(0, topY, 0);
    top.material = getFaceMaterial('top_flat', topOffset, topAxisSeed, false, 3.0, true);
    top.parent = block;

    return block;
}

function applyFloorDisplacement(mesh, tx, tz) {
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return;

    for (let i = 0; i < positions.length; i += 3) {
        const lx = positions[i] / TILE + 0.5;
        const lz = positions[i + 2] / TILE + 0.5;
        const gx = tx + lx;
        const gy = tz + lz;

        const h = floorHeightAt(gx, gy);
        positions[i + 1] = h * ELEVATION_STRENGTH;
    }

    const normals = new Array(positions.length).fill(0);
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
}

function snapPx(v) {
    return Math.floor(v) + 0.5;
}

function alignedSegment(ctx, x1, y1, x2, y2, width, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.moveTo(snapPx(x1), snapPx(y1));
    ctx.lineTo(snapPx(x2), snapPx(y2));
    ctx.stroke();
}

function drawCircuit(ctx, size, mask, colorA, colorB, offset = 0) {
    const edge = Math.floor(size * 0.12) + offset;
    const w = Math.max(2, Math.floor(size * 0.02));
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.shadowBlur = Math.floor(size * 0.012);
    ctx.shadowColor = colorB;

    if (mask & N) {
        const x1 = (mask & W) ? edge : 0;
        const x2 = (mask & E) ? (size - edge) : size;
        alignedSegment(ctx, x1, edge, x2, edge, w, colorA);
    }
    if (mask & E) {
        const y1 = (mask & N) ? edge : 0;
        const y2 = (mask & S) ? (size - edge) : size;
        alignedSegment(ctx, size - edge, y1, size - edge, y2, w, colorA);
    }
    if (mask & S) {
        const x1 = (mask & W) ? edge : 0;
        const x2 = (mask & E) ? (size - edge) : size;
        alignedSegment(ctx, x1, size - edge, x2, size - edge, w, colorA);
    }
    if (mask & W) {
        const y1 = (mask & N) ? edge : 0;
        const y2 = (mask & S) ? (size - edge) : size;
        alignedSegment(ctx, edge, y1, edge, y2, w, colorA);
    }

    ctx.restore();
}

function drawWallBrickHighlights(ctx, size, hOffset, axisSeed = 0, flipU = false, bricksY = WALL_BRICKS_Y, allowPartialEdgeHighlights = false, uScale = 1.0) {
    const brickW = size / WALL_BRICKS_X;
    const brickH = size / bricksY;
    const lineW = Math.max(2, Math.floor(size * 0.012));

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'miter';

    // Compute range of global brick IDs that might appear in this texture
    const uMin = 0.0;
    const uMax = 1.0;
    const gBase = hOffset + axisSeed * 1000.0;
    const gxMin = gBase + uMin * uScale;
    const gxMax = gBase + uMax * uScale;
    const brickIdXMin = Math.floor(gxMin * WALL_BRICKS_X) - 1;
    const brickIdXMax = Math.ceil(gxMax * WALL_BRICKS_X);

    // For each row and each global brick in range
    for (let row = 0; row < bricksY; row++) {
        const stagger = (row % 2) * 0.5;
        const y0 = Math.floor(row * brickH);
        const y1 = Math.floor((row + 1) * brickH);

        for (let brickIdX = brickIdXMin; brickIdX <= brickIdXMax; brickIdX++) {
            // Map global brick to texture space
            const gxStart = (brickIdX - stagger) / WALL_BRICKS_X;
            const gxEnd = (brickIdX + 1.0 - stagger) / WALL_BRICKS_X;
            
            // Convert to texture pixels
            const u0 = flipU ? ((gBase + uScale - gxStart) / Math.max(0.0001, uScale)) : ((gxStart - gBase) / Math.max(0.0001, uScale));
            const u1 = flipU ? ((gBase + uScale - gxEnd) / Math.max(0.0001, uScale)) : ((gxEnd - gBase) / Math.max(0.0001, uScale));
            const x0f = Math.min(u0, u1) * size;
            const x1f = Math.max(u0, u1) * size;
            
            // Only draw if brick is within [0, size]
            if (x1f < 0 || x0f > size) continue;
            
            // Clamp to texture bounds for drawing
            const x0 = Math.max(0, Math.floor(x0f));
            const x1 = Math.min(size, Math.ceil(x1f));
            
            if (x1 - x0 < 6 || y1 - y0 < 6) continue;

            const pick = hash2(brickIdX * 1.31, row * 2.17 + axisSeed * 19.0, 0.41);
            if (pick < 0.76) continue;

            const accent = 0.78 + hash2(brickIdX * 2.37, row * 1.73 + axisSeed * 7.0, 0.22) * 0.18;
            
            const rx = x0;
            const ry = y0;
            const rw = (x1 - x0);
            const rh = (y1 - y0);

            // Only highlight full bricks; partial edge bricks cause visible half-highlights.
            const edgeTol = 0.15;
            const isFullBrick = (x0f >= -edgeTol && x1f <= size + edgeTol);
            if (!isFullBrick && !allowPartialEdgeHighlights) continue;
            
            // Draw border bands
            const b = lineW;
            const drawVerticalBorders = isFullBrick;
            ctx.fillStyle = 'rgb(10, 12, 16)';
            ctx.fillRect(rx, ry, rw, b);           // top
            ctx.fillRect(rx, ry + rh - b, rw, b); // bottom
            if (drawVerticalBorders) {
                ctx.fillRect(rx, ry, b, rh);       // left
                ctx.fillRect(rx + rw - b, ry, b, rh); // right
            }

            // Draw highlight bands
            const f = lineW + 1;
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(142, 224, 255, ${accent.toFixed(3)})`;
            ctx.fillRect(rx, ry, rw, f);           // top
            ctx.fillRect(rx, ry + rh - f, rw, f); // bottom
            if (drawVerticalBorders) {
                ctx.fillRect(rx, ry, f, rh);       // left
                ctx.fillRect(rx + rw - f, ry, f, rh); // right
            }
            ctx.globalCompositeOperation = 'source-over';

        }
    }

    ctx.restore();
}

function drawExteriorCornerTransitions(ctx, size, cardinalMask, diagMask, colorA, offset = 0) {
    const edge = Math.floor(size * 0.12) + offset;
    const w = Math.max(2, Math.floor(size * 0.018));
    const drawCorner = (bit, needA, needB, x1, y1, x2, y2, x3, y3) => {
        if (!(diagMask & bit)) return;
        if ((cardinalMask & needA) || (cardinalMask & needB)) return;
        alignedSegment(ctx, x1, y1, x2, y2, w, colorA);
        alignedSegment(ctx, x2, y2, x3, y3, w, colorA);
    };
    ctx.save();
    // Diagonal-only corners: two border stubs that meet on the same edge rail.
    drawCorner(NW, N, W, 0, edge, edge, edge, edge, 0);
    drawCorner(NE, N, E, size - edge, 0, size - edge, edge, size, edge);
    drawCorner(SE, S, E, size, size - edge, size - edge, size - edge, size - edge, size);
    drawCorner(SW, S, W, edge, size, edge, size - edge, 0, size - edge);
    ctx.restore();
}

function flipMaskVertical(mask) {
    return ((mask & N) ? S : 0) | ((mask & S) ? N : 0) | (mask & E) | (mask & W);
}

function flipDiagMaskVertical(diagMask) {
    return ((diagMask & NW) ? SW : 0)
        | ((diagMask & NE) ? SE : 0)
        | ((diagMask & SE) ? NE : 0)
        | ((diagMask & SW) ? NW : 0);
}

function applyPoisonTransition(ctx, size, poisonMask, poisonDiagMask) {
    const edge = Math.floor(size * 0.18);
    const lip = Math.max(2, Math.floor(size * 0.03));
    const inset = 1;
    const hasN = (poisonMask & N) !== 0;
    const hasE = (poisonMask & E) !== 0;
    const hasS = (poisonMask & S) !== 0;
    const hasW = (poisonMask & W) !== 0;
    const hasNWDiagPure = (poisonDiagMask & NW) && !hasN && !hasW;
    const hasNEDiagPure = (poisonDiagMask & NE) && !hasN && !hasE;
    const hasSEDiagPure = (poisonDiagMask & SE) && !hasS && !hasE;
    const hasSWDiagPure = (poisonDiagMask & SW) && !hasS && !hasW;
    ctx.save();

    const side = (bit) => {
        if (!(poisonMask & bit)) return;

        let g;
        if (bit === N) {
            const x0 = (hasW || hasNWDiagPure) ? lip : 0;
            const x1 = (hasE || hasNEDiagPure) ? size - lip : size;
            g = ctx.createLinearGradient(0, 0, 0, edge);
            g.addColorStop(0, 'rgba(12,19,15,0.92)');
            g.addColorStop(0.2, 'rgba(24,68,45,0.62)');
            g.addColorStop(1, 'rgba(24,68,45,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x0, 0, x1 - x0, edge);
            ctx.fillStyle = 'rgba(109,235,171,0.24)';
            ctx.fillRect(x0 + inset, inset, Math.max(0, x1 - x0 - inset * 2), lip);
            return;
        }

        if (bit === S) {
            const x0 = (hasW || hasSWDiagPure) ? lip : 0;
            const x1 = (hasE || hasSEDiagPure) ? size - lip : size;
            g = ctx.createLinearGradient(0, size, 0, size - edge);
            g.addColorStop(0, 'rgba(12,19,15,0.92)');
            g.addColorStop(0.2, 'rgba(24,68,45,0.62)');
            g.addColorStop(1, 'rgba(24,68,45,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x0, size - edge, x1 - x0, edge);
            ctx.fillStyle = 'rgba(109,235,171,0.24)';
            ctx.fillRect(x0 + inset, size - lip - inset, Math.max(0, x1 - x0 - inset * 2), lip);
            return;
        }

        if (bit === W) {
            const y0 = (hasN || hasNWDiagPure) ? lip : 0;
            const y1 = (hasS || hasSWDiagPure) ? size - lip : size;
            g = ctx.createLinearGradient(0, 0, edge, 0);
            g.addColorStop(0, 'rgba(12,19,15,0.92)');
            g.addColorStop(0.2, 'rgba(24,68,45,0.62)');
            g.addColorStop(1, 'rgba(24,68,45,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, y0, edge, y1 - y0);
            ctx.fillStyle = 'rgba(109,235,171,0.24)';
            ctx.fillRect(inset, y0 + inset, lip, Math.max(0, y1 - y0 - inset * 2));
            return;
        }

        const y0 = (hasN || hasNEDiagPure) ? lip : 0;
        const y1 = (hasS || hasSEDiagPure) ? size - lip : size;
        g = ctx.createLinearGradient(size, 0, size - edge, 0);
        g.addColorStop(0, 'rgba(12,19,15,0.92)');
        g.addColorStop(0.2, 'rgba(24,68,45,0.62)');
        g.addColorStop(1, 'rgba(24,68,45,0)');
        ctx.fillStyle = g;
        ctx.fillRect(size - edge, y0, edge, y1 - y0);
        ctx.fillStyle = 'rgba(109,235,171,0.24)';
        ctx.fillRect(size - lip - inset, y0 + inset, lip, Math.max(0, y1 - y0 - inset * 2));
    };

    side(N);
    side(S);
    side(W);
    side(E);

    const corner = Math.floor(size * 0.18);
    const c = (bit, x, y, cornerName, needA, needB) => {
        if (!(poisonDiagMask & bit)) return;
        if ((poisonMask & needA) || (poisonMask & needB)) return;

        const g = ctx.createRadialGradient(x, y, 0, x, y, corner);
        g.addColorStop(0, 'rgba(14,22,17,0.9)');
        g.addColorStop(0.35, 'rgba(92,222,157,0.3)');
        g.addColorStop(1, 'rgba(98,225,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, corner, 0, Math.PI * 2);
        ctx.fill();
    };
    c(NW, 0, 0, 'NW', N, W);
    c(NE, size, 0, 'NE', N, E);
    c(SE, size, size, 'SE', S, E);
    c(SW, 0, size, 'SW', S, W);
    ctx.restore();
}

function applyVoidRim(ctx, size, voidMask, voidDiagMask) {
    const edge = Math.floor(size * 0.17);
    const lip = Math.max(2, Math.floor(size * 0.03));
    const inset = 1;
    const hasN = (voidMask & N) !== 0;
    const hasE = (voidMask & E) !== 0;
    const hasS = (voidMask & S) !== 0;
    const hasW = (voidMask & W) !== 0;
    const hasNWDiagPure = (voidDiagMask & NW) && !hasN && !hasW;
    const hasNEDiagPure = (voidDiagMask & NE) && !hasN && !hasE;
    const hasSEDiagPure = (voidDiagMask & SE) && !hasS && !hasE;
    const hasSWDiagPure = (voidDiagMask & SW) && !hasS && !hasW;
    const side = (bit) => {
        if (!(voidMask & bit)) return;

        let g;
        if (bit === N) {
            const x0 = (hasW || hasNWDiagPure) ? lip : 0;
            const x1 = (hasE || hasNEDiagPure) ? size - lip : size;
            g = ctx.createLinearGradient(0, 0, 0, edge);
            g.addColorStop(0, 'rgba(7,10,17,0.96)');
            g.addColorStop(0.25, 'rgba(20,31,47,0.45)');
            g.addColorStop(1, 'rgba(20,31,47,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x0, 0, x1 - x0, edge);
            ctx.fillStyle = 'rgba(126,188,236,0.2)';
            ctx.fillRect(x0 + inset, inset, Math.max(0, x1 - x0 - inset * 2), lip);
            return;
        }

        if (bit === S) {
            const x0 = (hasW || hasSWDiagPure) ? lip : 0;
            const x1 = (hasE || hasSEDiagPure) ? size - lip : size;
            g = ctx.createLinearGradient(0, size, 0, size - edge);
            g.addColorStop(0, 'rgba(7,10,17,0.96)');
            g.addColorStop(0.25, 'rgba(20,31,47,0.45)');
            g.addColorStop(1, 'rgba(20,31,47,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x0, size - edge, x1 - x0, edge);
            ctx.fillStyle = 'rgba(126,188,236,0.2)';
            ctx.fillRect(x0 + inset, size - lip - inset, Math.max(0, x1 - x0 - inset * 2), lip);
            return;
        }

        if (bit === W) {
            const y0 = (hasN || hasNWDiagPure) ? lip : 0;
            const y1 = (hasS || hasSWDiagPure) ? size - lip : size;
            g = ctx.createLinearGradient(0, 0, edge, 0);
            g.addColorStop(0, 'rgba(7,10,17,0.96)');
            g.addColorStop(0.25, 'rgba(20,31,47,0.45)');
            g.addColorStop(1, 'rgba(20,31,47,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, y0, edge, y1 - y0);
            ctx.fillStyle = 'rgba(126,188,236,0.2)';
            ctx.fillRect(inset, y0 + inset, lip, Math.max(0, y1 - y0 - inset * 2));
            return;
        }

        const y0 = (hasN || hasNEDiagPure) ? lip : 0;
        const y1 = (hasS || hasSEDiagPure) ? size - lip : size;
        g = ctx.createLinearGradient(size, 0, size - edge, 0);
        g.addColorStop(0, 'rgba(7,10,17,0.96)');
        g.addColorStop(0.25, 'rgba(20,31,47,0.45)');
        g.addColorStop(1, 'rgba(20,31,47,0)');
        ctx.fillStyle = g;
        ctx.fillRect(size - edge, y0, edge, y1 - y0);
        ctx.fillStyle = 'rgba(126,188,236,0.2)';
        ctx.fillRect(size - lip - inset, y0 + inset, lip, Math.max(0, y1 - y0 - inset * 2));
    };
    side(N);
    side(S);
    side(W);
    side(E);

    const corner = Math.floor(size * 0.16);
    const c = (bit, x, y, cornerName, needA, needB) => {
        if (!(voidDiagMask & bit)) return;
        if ((voidMask & needA) || (voidMask & needB)) return;

        const g = ctx.createRadialGradient(x, y, 0, x, y, corner);
        g.addColorStop(0, 'rgba(6,9,15,0.92)');
        g.addColorStop(0.35, 'rgba(117,184,236,0.28)');
        g.addColorStop(1, 'rgba(7,10,17,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, corner, 0, Math.PI * 2);
        ctx.fill();
    };
    c(NW, 0, 0, 'NW', N, W);
    c(NE, size, 0, 'NE', N, E);
    c(SE, size, size, 'SE', S, E);
    c(SW, 0, size, 'SW', S, W);
}

function makeFloorMaterial(
    scene,
    key,
    tx,
    tz,
    wallMask,
    wallDiagMask,
    pillarMask,
    pillarDiagMask,
    poisonMask,
    poisonDiagMask,
    voidMask,
    voidDiagMask,
    options
) {
    const size = 128;
    const invSize = 1 / Math.max(1, size - 1);
    const tex = new BABYLON.DynamicTexture(`f_tex_${key}`, { width: size, height: size }, scene, false);
    const bump = new BABYLON.DynamicTexture(`f_bump_${key}`, { width: size, height: size }, scene, false);
    const ctx = tex.getContext();
    const bctx = bump.getContext();

    const stoneX = 2.35;
    const stoneY = 2.35;
    const seamW = 0.05;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x * invSize;
            const v = y * invSize;
            const gx = tx + u;
            const gy = tz + v;

            const cellX = (gx * stoneX) % 1;
            const cellY = (gy * stoneY) % 1;
            const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
            const seam = 1.0 - smoothstep(0, seamW, border);

            const stoneIdX = Math.floor(gx * stoneX);
            const stoneIdY = Math.floor(gy * stoneY);
            const stoneTone = hash2(stoneIdX, stoneIdY, 0.44);
            const rawStone = hash2(stoneIdX, stoneIdY, 0.12);
            const stoneHeight = Math.floor(rawStone * 5.0) / 5.0;

            const large = hash2(gx * 1.6, gy * 1.5, 0.23);
            const medium = hash2(gx * 2.2, gy * 2.1, 0.61);

            let r = 96 + large * 10 + medium * 7 + stoneTone * 10 + stoneHeight * 10;
            let g = 101 + large * 11 + medium * 7 + stoneTone * 10 + stoneHeight * 10;
            let b = 109 + large * 13 + medium * 8 + stoneTone * 12 + stoneHeight * 11;

            const seamShade = border < seamW ? 12 : 0;
            r -= seamShade;
            g -= seamShade + 1;
            b -= seamShade + 2;

            ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
            ctx.fillRect(x, y, 1, 1);

            const h01 = floorHeightAt(gx, gy);
            const h = Math.max(0, Math.min(255, Math.floor(116 + h01 * 122 - (border < seamW ? 18 : 0) + stoneTone * 8)));
            bctx.fillStyle = `rgb(${h}, ${h}, ${h})`;
            bctx.fillRect(x, y, 1, 1);
        }
    }

    const wallMaskOriented = flipMaskVertical(wallMask);
    const wallDiagOriented = flipDiagMaskVertical(wallDiagMask);
    const pillarMaskOriented = flipMaskVertical(pillarMask);
    const pillarDiagOriented = flipDiagMaskVertical(pillarDiagMask);
    const poisonMaskOriented = flipMaskVertical(poisonMask);
    const poisonDiagOriented = flipDiagMaskVertical(poisonDiagMask);
    const voidMaskOriented = flipMaskVertical(voidMask);
    const voidDiagOriented = flipDiagMaskVertical(voidDiagMask);
    const poisonMaskFinal = poisonMaskOriented & (~voidMaskOriented);
    const poisonDiagFinal = poisonDiagOriented & (~voidDiagOriented);

    drawCircuit(ctx, size, wallMaskOriented, options.circuitBlue, options.circuitPurple, 0);
    if (wallDiagOriented) {
        drawExteriorCornerTransitions(ctx, size, wallMaskOriented, wallDiagOriented, 'rgba(104, 196, 255, 0.78)', 0);
    }

    if (pillarMaskOriented || pillarDiagOriented) {
        drawCircuit(ctx, size, pillarMaskOriented, 'rgba(126, 218, 255, 0.95)', 'rgba(170, 128, 255, 0.85)', 8);
        drawExteriorCornerTransitions(ctx, size, pillarMaskOriented, pillarDiagOriented, 'rgba(126, 218, 255, 0.9)', 8);
    }
    applyPoisonTransition(ctx, size, poisonMaskFinal, poisonDiagFinal);
    applyVoidRim(ctx, size, voidMaskOriented, voidDiagOriented);

    // Removed per-tile random overlays to keep floor luminance continuous across tile boundaries.

    tex.update(false);
    bump.update(false);
    // Clamp avoids opposite-edge bleed that creates small clipping ticks between tiles.
    tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    bump.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    bump.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    const mat = new BABYLON.StandardMaterial(`f_mat_${key}`, scene);
    mat.diffuseTexture = tex;
    mat.bumpTexture = bump;
    mat.useParallax = false;
    mat.useParallaxOcclusion = false;
    mat.bumpTexture.level = 1.9;
    mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.1);
    mat.emissiveColor = new BABYLON.Color3(0.055, 0.065, 0.085);
    mat.freeze();
    return mat;
}

function makeWallMaterial(scene, key, hOffset = 0, axisSeed = 0, flipU = false, bricksY = WALL_BRICKS_Y, allowPartialEdgeHighlights = false, uScale = 1.0) {
    const size = 256;
    const invSize = 1 / Math.max(1, size - 1);
    const tex = new BABYLON.DynamicTexture(`w_tex_${key}`, { width: size, height: size }, scene, true);
    const bump = new BABYLON.DynamicTexture(`w_bump_${key}`, { width: size, height: size }, scene, true);
    const ctx = tex.getContext();
    const bctx = bump.getContext();

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const uRaw = x * invSize;
            const u = flipU ? (1.0 - uRaw) : uRaw;
            const v = y * invSize;
            const gx = hOffset + u * uScale + axisSeed * 1000.0;
            const gy = v;
            const row = Math.floor(gy * bricksY);
            const stagger = (row % 2) * 0.5;
            const cellX = (gx * WALL_BRICKS_X + stagger) % 1;
            const cellY = (gy * bricksY) % 1;
            const md = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
            const mortar = 1.0 - smoothstep(0, WALL_MORTAR_W, md);

            const brickIdX = Math.floor(gx * WALL_BRICKS_X + stagger);
            const brickIdY = Math.floor(gy * bricksY);
            const rawBrick = hash2(brickIdX * 1.23, brickIdY * 1.31, 0.37);
            const brickHeight = Math.floor(rawBrick * 5.0) / 5.0;
            const n = hash2(gx * 17.0, gy * 15.0, 0.62) * 0.7 + hash2(gx * 43.0, gy * 39.0, 0.18) * 0.3;
            const centerDist = Math.max(Math.abs(cellX - 0.5), Math.abs(cellY - 0.5));
            const bevel = 1.0 - smoothstep(0.32, 0.5, centerDist);
            const c = 45 + n * 18 + bevel * 14 + brickHeight * 18;
            const mortarShade = 74;
            let r = c * (1 - mortar) + mortarShade * mortar;
            let g = (c + 4) * (1 - mortar) + (mortarShade + 3) * mortar;
            let b = (c + 13) * (1 - mortar) + (mortarShade + 8) * mortar;

            // Calculate moss field once for both diffuse and bump
            const brickMask = smoothstep(WALL_MORTAR_W * 0.82, WALL_MORTAR_W * 1.22, md);
            const mossBlob = mossBlobAt(gx, gy);
            const mossGate = smoothstep(0.56, 0.9, hash2(brickIdX * 0.77, brickIdY * 0.91, 0.63));

            // Subtle moss tint for diffuse
            const moss = smoothstep(0.2, 0.74, mossBlob) * (1.0 - mortar) * mossGate;
            r = r * (1 - moss * WALL_MOSS_COLOR_STRENGTH) + 86 * (moss * WALL_MOSS_COLOR_STRENGTH);
            g = g * (1 - moss * WALL_MOSS_COLOR_STRENGTH * 1.35) + 132 * (moss * WALL_MOSS_COLOR_STRENGTH * 1.35);
            b = b * (1 - moss * WALL_MOSS_COLOR_STRENGTH * 0.85) + 92 * (moss * WALL_MOSS_COLOR_STRENGTH * 0.85);

            ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
            ctx.fillRect(x, y, 1, 1);

            // Add moss relief to bump texture for visible 3D elevation
            const mossMask = smoothstep(0.2, 0.74, mossBlob) * brickMask * mossGate;
            const mossBump = (0.015 + mossBlob * 0.12) * mossMask * WALL_MOSS_HEIGHT_STRENGTH;
            const h = Math.max(0, Math.min(255, Math.floor(112 + brickHeight * 78 + n * 34 + bevel * 60 - mortar * 36 + mossBump * 180)));
            bctx.fillStyle = `rgb(${h}, ${h}, ${h})`;
            bctx.fillRect(x, y, 1, 1);
        }
    }

    // Removed per-tile random moss overlays to avoid visible tile-level gray shifts.

    drawWallBrickHighlights(ctx, size, hOffset, axisSeed, flipU, bricksY, allowPartialEdgeHighlights, uScale);

    tex.update(false);
    bump.update(false);
    tex.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    bump.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    bump.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    bump.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 8;
    bump.anisotropicFilteringLevel = 8;

    const mat = new BABYLON.StandardMaterial(`w_mat_${key}`, scene);
    mat.diffuseTexture = tex;
    mat.bumpTexture = bump;
    mat.useParallax = false;
    mat.useParallaxOcclusion = false;
    mat.bumpTexture.level = 1.4;
    mat.emissiveColor = new BABYLON.Color3(0.04, 0.04, 0.07);
    mat.specularColor = new BABYLON.Color3(0.015, 0.015, 0.015);
    mat.freeze();
    return mat;
}

function ensurePoisonShader() {
    if (BABYLON.Effect.ShadersStore.neoPoisonFragmentShader) return;

    BABYLON.Effect.ShadersStore.neoPoisonVertexShader = `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 worldViewProjection;
        varying vec2 vUV;
        void main(void) {
            vUV = uv;
            gl_Position = worldViewProjection * vec4(position, 1.0);
        }
    `;

    BABYLON.Effect.ShadersStore.neoPoisonFragmentShader = `
        precision highp float;
        varying vec2 vUV;
        uniform float time;

        float hashPeriodic(vec2 p, vec2 period) {
            vec2 q = mod(p, period);
            return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noisePeriodic(vec2 p, vec2 period) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float a = hashPeriodic(i, period);
            float b = hashPeriodic(i + vec2(1.0, 0.0), period);
            float c = hashPeriodic(i + vec2(0.0, 1.0), period);
            float d = hashPeriodic(i + vec2(1.0, 1.0), period);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main(void) {
            const float TAU = 6.28318530718;
            vec2 uv = fract(vUV);
            vec2 warp;
            warp.x = sin((uv.y + time * 0.12) * TAU * 6.0) * 0.18
                   + sin((uv.y - time * 0.07) * TAU * 11.0) * 0.06;
            warp.y = cos((uv.x - time * 0.10) * TAU * 5.0) * 0.14
                   + cos((uv.x + time * 0.05) * TAU * 9.0) * 0.05;

            float n1 = noisePeriodic(uv * vec2(12.0, 12.0) + warp + vec2(time * 0.35, -time * 0.21), vec2(12.0, 12.0));
            float n2 = noisePeriodic(uv * vec2(24.0, 24.0) + warp * 1.7 - vec2(time * 0.17, time * 0.29), vec2(24.0, 24.0));
            float streams = smoothstep(0.47, 0.9, n1 * 0.7 + n2 * 0.55);
            float scan = 0.5 + 0.5 * sin((uv.y * TAU * 18.0) + time * 7.0 + n2 * 2.2);

            vec3 dark = vec3(0.02, 0.08, 0.04);
            vec3 mid = vec3(0.05, 0.35, 0.12);
            vec3 bright = vec3(0.18, 0.92, 0.31);

            vec3 color = mix(dark, mid, streams);
            color = mix(color, bright, streams * scan * 0.85);
            gl_FragColor = vec4(color, 0.9);
        }
    `;
}

function makePoisonMaterial(scene, key) {
    ensurePoisonShader();
    const mat = new BABYLON.ShaderMaterial(
        `poison_${key}`,
        scene,
        { vertex: 'neoPoison', fragment: 'neoPoison' },
        { attributes: ['position', 'normal', 'uv'], uniforms: ['worldViewProjection', 'time'] }
    );
    mat.setFloat('time', 0);
    mat.alpha = 0.95;
    mat.backFaceCulling = false;
    return mat;
}

function createScene() {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.11, 0.2, 1);

    const camera = new BABYLON.ArcRotateCamera('cam', -1.35, 1.14, 22, new BABYLON.Vector3(8, 0.8, 6), scene);
    camera.wheelPrecision = 24;
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 45;
    camera.attachControl(canvas, true);

    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0), scene);
    hemi.intensity = 0.95;
    hemi.diffuse = new BABYLON.Color3(1.0, 1.0, 1.0);
    hemi.groundColor = new BABYLON.Color3(0.28, 0.31, 0.36);

    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.4, -1.0, 0.45), scene);
    dir.position = new BABYLON.Vector3(12, 18, -8);
    dir.intensity = 0.92;
    dir.diffuse = new BABYLON.Color3(0.95, 0.96, 1.0);

    const options = {
        showGrid: false,
        circuitBlue: 'rgba(83, 188, 255, 0.95)',
        circuitPurple: 'rgba(168, 113, 255, 0.95)',
    };

    const root = new BABYLON.TransformNode('root', scene);
    const poisonMats = [];
    const wallCoreMat = new BABYLON.StandardMaterial('wall_core_mat', scene);
    wallCoreMat.diffuseColor = new BABYLON.Color3(0.16, 0.18, 0.22);
    wallCoreMat.specularColor = new BABYLON.Color3(0.0, 0.0, 0.0);
    wallCoreMat.emissiveColor = new BABYLON.Color3(0.01, 0.01, 0.015);
    wallCoreMat.freeze();

    const wallMatCache = new Map();
    const getWallFaceMat = (_faceName, hOffset, axisSeed, flipU = false, bricksY = WALL_BRICKS_Y, allowPartialEdgeHighlights = false, uScale = 1.0) => {
        // Only axis + horizontal offset define wall pattern continuity.
        const k = `${axisSeed}_${hOffset.toFixed(4)}_${flipU ? 1 : 0}_${bricksY.toFixed(2)}_${allowPartialEdgeHighlights ? 1 : 0}_${uScale.toFixed(4)}`;
        if (!wallMatCache.has(k)) {
            wallMatCache.set(k, makeWallMaterial(scene, `wall_${k}`, hOffset, axisSeed, flipU, bricksY, allowPartialEdgeHighlights, uScale));
        }
        return wallMatCache.get(k);
    };

    for (let row = 0; row < MAP.length; row++) {
        for (let col = 0; col < MAP[row].length; col++) {
            const c = MAP[row][col];
            const x = col;
            const z = MAP.length - 1 - row;

            if (c === 'V') continue;

            if (c === '#' || c === 'O') {
                const wallNeighborMask = maskFrom(MAP, col, row, ['#']);
                buildReliefWallBlock(
                    scene,
                    `w_${x}_${z}`,
                    x * TILE + TILE * 0.5,
                    TILE * 0.85,
                    z * TILE + TILE * 0.5,
                    TILE,
                    1.65,
                    x,
                    z,
                    root,
                    getWallFaceMat,
                    wallCoreMat,
                    wallNeighborMask
                );
                continue;
            }

            const tile = BABYLON.MeshBuilder.CreateGround(
                `g_${x}_${z}`,
                { width: TILE, height: TILE, subdivisions: c === 'P' ? 1 : 14, updatable: c !== 'P' },
                scene
            );
            tile.position.set(x * TILE + TILE * 0.5, 0.0, z * TILE + TILE * 0.5);

            if (c === 'P') {
                const poison = makePoisonMaterial(scene, `${x}_${z}`);
                tile.material = poison;
                poisonMats.push(poison);
            } else {
                applyFloorDisplacement(tile, x, z);
                const wallMask = maskFrom(MAP, col, row, ['#']);
                const wallDiagMask = diagMaskFrom(MAP, col, row, ['#']);
                const pillarMask = maskFrom(MAP, col, row, ['O']);
                const pillarDiagMask = diagMaskFrom(MAP, col, row, ['O']);
                const poisonMask = maskFrom(MAP, col, row, ['P']);
                const poisonDiagMask = diagMaskFrom(MAP, col, row, ['P']);
                const voidMask = maskFrom(MAP, col, row, ['V']);
                const voidDiagMask = diagMaskFrom(MAP, col, row, ['V']);
                tile.material = makeFloorMaterial(
                    scene,
                    `${x}_${z}`,
                    x,
                    z,
                    wallMask,
                    wallDiagMask,
                    pillarMask,
                    pillarDiagMask,
                    poisonMask,
                    poisonDiagMask,
                    voidMask,
                    voidDiagMask,
                    options
                );
            }

            tile.parent = root;
        }
    }

    const grid = BABYLON.MeshBuilder.CreateGround('grid', { width: MAP[0].length * TILE, height: MAP.length * TILE }, scene);
    grid.position.set((MAP[0].length * TILE) / 2 - TILE / 2, -0.03, (MAP.length * TILE) / 2 - TILE / 2);
    const gmat = new BABYLON.StandardMaterial('grid_mat', scene);
    gmat.diffuseColor = new BABYLON.Color3(0.04, 0.06, 0.08);
    gmat.alpha = 0.2;
    grid.material = gmat;
    grid.isVisible = options.showGrid;

    const gui = new dat.GUI({ width: 280 });
    gui.add(options, 'showGrid').name('Show under grid').onChange((v) => {
        grid.isVisible = v;
    });

    scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() * 0.001;
        for (const mat of poisonMats) {
            mat.setFloat('time', t);
        }
    });

    return scene;
};

const scene = createScene();
engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener('resize', () => {
    engine.resize();
});