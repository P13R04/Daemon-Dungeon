import {
  Color3,
  DynamicTexture,
  Effect,
  Mesh,
  MeshBuilder,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  Texture,
  TransformNode,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';

type Canvas2DRenderingContext = CanvasRenderingContext2D;

export type ProceduralReliefNeighborMasks = {
  wallMask: number;
  wallDiagMask: number;
  pillarMask: number;
  pillarDiagMask: number;
  poisonMask: number;
  poisonDiagMask: number;
  voidMask: number;
  voidDiagMask: number;
};

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const NW = 1;
const NE = 2;
const SE = 4;
const SW = 8;

const WALL_BRICKS_X = 3.0;
const WALL_BRICKS_Y = 6.0;
const WALL_MORTAR_W = 0.08;
const WALL_BASE_HEIGHT = 0.12;
const WALL_MOSS_COLOR_STRENGTH = 0.22;
const WALL_MOSS_HEIGHT_STRENGTH = 1.8;
const WALL_ELEVATION_STRENGTH = 0.24;
const FLOOR_ELEVATION_STRENGTH = 0.09;

// Density-based brick counts (to match 3x6 per 1.2x1.2 tile)
const BRICKS_PER_UNIT_X = 2.5; 
const BRICKS_PER_UNIT_Y = 5.0;

export type ProceduralReliefQuality = 'low' | 'medium' | 'high';

const QUALITY_SETTINGS: Record<ProceduralReliefQuality, {
  faceSubdivisions: number;
  topSubdivisions: number;
  floorTextureSize: number;
  wallTextureSize: number;
}> = {
  low: {
    faceSubdivisions: 20,
    topSubdivisions: 16,
    floorTextureSize: 96,
    wallTextureSize: 128,
  },
  medium: {
    faceSubdivisions: 28,
    topSubdivisions: 24,
    floorTextureSize: 112,
    wallTextureSize: 192,
  },
  high: {
    faceSubdivisions: 40,
    topSubdivisions: 32,
    floorTextureSize: 128,
    wallTextureSize: 256,
  },
};

type SceneCache = {
  floorMats: Map<string, StandardMaterial>;
  wallFaceMats: Map<string, StandardMaterial>;
  poisonMats: Set<ShaderMaterial>;
  wallCoreMat: StandardMaterial;
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.00001, b - a)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number, seed: number = 0): number {
  const s = Math.sin((x + 0.713) * 127.1 + (y + 0.237) * 311.7 + seed * 91.13) * 43758.5453123;
  return s - Math.floor(s);
}

function frac01(value: number): number {
  return value - Math.floor(value);
}

function mossBlobAt(gx: number, gy: number): number {
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

  return blob;
}

function floorHeightAt(gx: number, gy: number): number {
  const stoneX = 2.35;
  const stoneY = 2.35;
  const seamW = 0.032;

  const cellX = frac01(gx * stoneX);
  const cellY = frac01(gy * stoneY);
  const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));

  const stoneIdX = Math.floor(gx * stoneX);
  const stoneIdY = Math.floor(gy * stoneY);
  const rawStone = hash2(stoneIdX * 1.17, stoneIdY * 1.31, 0.12);
  const stoneHeight = Math.floor(rawStone * 5.0) / 5.0;

  const seamDrop = border < seamW ? 0.34 : 0.0;
  const base = 0.42 + stoneHeight * 0.42 - seamDrop;
  return Math.max(0, Math.min(1, base));
}

function wallHeightAt(gu: number, gv: number, bricksY: number = WALL_BRICKS_Y): number {
  const bricksX = WALL_BRICKS_X; 
  const row = Math.floor(Math.max(0, Math.min(0.999, gv)) * bricksY);
  const stagger = (row % 2) * 0.5;
  
  const cellX = frac01(gu * bricksX + stagger);
  const cellY = frac01(gv * bricksY);
  
  const margin = WALL_MORTAR_W * 0.5;
  const isMortar = cellX < margin || cellX > (1.0 - margin) || cellY < margin || cellY > (1.0 - margin);
  
  if (isMortar) return WALL_BASE_HEIGHT;

  // Normalized local coords inside the brick [0, 1]
  const bx = (cellX - margin) / (1.0 - margin * 2);
  const by = (cellY - margin) / (1.0 - margin * 2);
  
  const brickIdX = Math.floor(gu * bricksX + stagger);
  const brickIdY = row;
  const rawBrick = hash2(brickIdX * 1.23, brickIdY * 1.31, 0.37);
  const brickHeight = Math.floor(rawBrick * 5.0) / 5.0;

  const brickRelief = 0.44 + brickHeight * 0.5;
  
  // Bevel factor
  const dist = Math.max(Math.abs(bx - 0.5), Math.abs(by - 0.5));
  const bevel = 1.0 - smoothstep(0.32, 0.5, dist);
  
  const mossBlob = mossBlobAt(gu, gv);
  const mossGate = smoothstep(0.56, 0.9, hash2(brickIdX * 0.77, brickIdY * 0.91, 0.63));
  const mossThickness = (0.015 + mossBlob * 0.12) * smoothstep(0.2, 0.74, mossBlob) * mossGate * WALL_MOSS_HEIGHT_STRENGTH;

  return Math.max(0, Math.min(1.0, WALL_BASE_HEIGHT + brickRelief + mossThickness + (bevel * 0.12)));
}

function flipMaskVertical(mask: number): number {
  return ((mask & N) ? S : 0) | ((mask & S) ? N : 0) | (mask & E) | (mask & W);
}

function flipDiagMaskVertical(diagMask: number): number {
  return ((diagMask & NW) ? SW : 0)
    | ((diagMask & NE) ? SE : 0)
    | ((diagMask & SE) ? NE : 0)
    | ((diagMask & SW) ? NW : 0);
}

function drawCircuit(ctx: Canvas2DRenderingContext, size: number, mask: number, colorA: string, colorB: string, offset = 0): void {
  const edge = Math.floor(size * 0.12) + offset;
  const w = Math.max(2, Math.floor(size * 0.02));
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.shadowBlur = Math.floor(size * 0.012);
  ctx.shadowColor = colorB;

  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.strokeStyle = colorA;
    ctx.lineWidth = w;
    ctx.moveTo(Math.floor(x1) + 0.5, Math.floor(y1) + 0.5);
    ctx.lineTo(Math.floor(x2) + 0.5, Math.floor(y2) + 0.5);
    ctx.stroke();
  };

  if (mask & N) seg((mask & W) ? edge : 0, edge, (mask & E) ? (size - edge) : size, edge);
  if (mask & E) seg(size - edge, (mask & N) ? edge : 0, size - edge, (mask & S) ? (size - edge) : size);
  if (mask & S) seg((mask & W) ? edge : 0, size - edge, (mask & E) ? (size - edge) : size, size - edge);
  if (mask & W) seg(edge, (mask & N) ? edge : 0, edge, (mask & S) ? (size - edge) : size);

  ctx.restore();
}

function drawExteriorCornerTransitions(ctx: Canvas2DRenderingContext, size: number, cardinalMask: number, diagMask: number, colorA: string, offset = 0): void {
  const edge = Math.floor(size * 0.12) + offset;
  const w = Math.max(2, Math.floor(size * 0.018));
  ctx.save();
  ctx.strokeStyle = colorA;
  ctx.lineWidth = w;

  const draw = (bit: number, needA: number, needB: number, pts: Array<[number, number]>) => {
    if (!(diagMask & bit)) return;
    if ((cardinalMask & needA) || (cardinalMask & needB)) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.stroke();
  };

  draw(NW, N, W, [[0, edge], [edge, edge], [edge, 0]]);
  draw(NE, N, E, [[size - edge, 0], [size - edge, edge], [size, edge]]);
  draw(SE, S, E, [[size, size - edge], [size - edge, size - edge], [size - edge, size]]);
  draw(SW, S, W, [[edge, size], [edge, size - edge], [0, size - edge]]);

  ctx.restore();
}

function drawWallBrickHighlights(
  ctx: Canvas2DRenderingContext,
  size: number,
  hOffset: number,
  axisSeed = 0,
  flipU = false,
  bricksY = WALL_BRICKS_Y,
  allowPartialEdgeHighlights = false,
  uScale = 1.0
): void {
  const brickH = size / bricksY;
  const lineW = Math.max(2, Math.floor(size * 0.012));

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'miter';

  const gBase = hOffset + axisSeed * 1000.0;
  const gxMin = gBase;
  const gxMax = gBase + uScale;
  const brickIdXMin = Math.floor(gxMin * WALL_BRICKS_X) - 1;
  const brickIdXMax = Math.ceil(gxMax * WALL_BRICKS_X);

  for (let row = 0; row < bricksY; row++) {
    const stagger = (row % 2) * 0.5;
    const y0 = Math.floor(row * brickH);
    const y1 = Math.floor((row + 1) * brickH);

    for (let brickIdX = brickIdXMin; brickIdX <= brickIdXMax; brickIdX++) {
      const gxStart = (brickIdX - stagger) / WALL_BRICKS_X;
      const gxEnd = (brickIdX + 1.0 - stagger) / WALL_BRICKS_X;
      const safeUScale = Math.max(0.0001, uScale);
      const u0 = flipU ? ((gBase + uScale - gxStart) / safeUScale) : ((gxStart - gBase) / safeUScale);
      const u1 = flipU ? ((gBase + uScale - gxEnd) / safeUScale) : ((gxEnd - gBase) / safeUScale);
      const x0f = Math.min(u0, u1) * size;
      const x1f = Math.max(u0, u1) * size;

      if (x1f < 0 || x0f > size) continue;

      const x0 = Math.max(0, Math.floor(x0f));
      const x1 = Math.min(size, Math.ceil(x1f));
      if (x1 - x0 < 6 || y1 - y0 < 6) continue;

      const pick = hash2(brickIdX * 1.31, row * 2.17 + axisSeed * 19.0, 0.41);
      if (pick < 0.76) continue;

      const accent = 0.78 + hash2(brickIdX * 2.37, row * 1.73 + axisSeed * 7.0, 0.22) * 0.18;
      const edgeTol = 0.15;
      const isFullBrick = (x0f >= -edgeTol && x1f <= size + edgeTol);
      if (!isFullBrick && !allowPartialEdgeHighlights) continue;

      const rx = x0;
      const ry = y0;
      const rw = x1 - x0;
      const rh = y1 - y0;
      const drawVerticalBorders = isFullBrick;

      const b = lineW;
      ctx.fillStyle = 'rgb(10, 12, 16)';
      ctx.fillRect(rx, ry, rw, b);
      ctx.fillRect(rx, ry + rh - b, rw, b);
      if (drawVerticalBorders) {
        ctx.fillRect(rx, ry, b, rh);
        ctx.fillRect(rx + rw - b, ry, b, rh);
      }

      const f = lineW + 1;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(142, 224, 255, ${accent.toFixed(3)})`;
      ctx.fillRect(rx, ry, rw, f);
      ctx.fillRect(rx, ry + rh - f, rw, f);
      if (drawVerticalBorders) {
        ctx.fillRect(rx, ry, f, rh);
        ctx.fillRect(rx + rw - f, ry, f, rh);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.restore();
}

function applyPoisonTransition(ctx: Canvas2DRenderingContext, size: number, poisonMask: number, poisonDiagMask: number): void {
  const edge = Math.floor(size * 0.18);
  const side = (bit: number, x: number, y: number, w: number, h: number, horizontal: boolean) => {
    if (!(poisonMask & bit)) return;
    const g = horizontal
      ? ctx.createLinearGradient(x, y, x, y + h)
      : ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(12,19,15,0.92)');
    g.addColorStop(0.2, 'rgba(24,68,45,0.62)');
    g.addColorStop(1, 'rgba(24,68,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };

  side(N, 0, 0, size, edge, true);
  side(S, 0, size - edge, size, edge, true);
  side(W, 0, 0, edge, size, false);
  side(E, size - edge, 0, edge, size, false);

  const corner = Math.floor(size * 0.18);
  const c = (bit: number, x: number, y: number, needA: number, needB: number) => {
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

  c(NW, 0, 0, N, W);
  c(NE, size, 0, N, E);
  c(SE, size, size, S, E);
  c(SW, 0, size, S, W);
}

function applyVoidRim(ctx: Canvas2DRenderingContext, size: number, voidMask: number, voidDiagMask: number): void {
  const edge = Math.floor(size * 0.17);
  const side = (bit: number, x: number, y: number, w: number, h: number, horizontal: boolean) => {
    if (!(voidMask & bit)) return;
    const g = horizontal
      ? ctx.createLinearGradient(x, y, x, y + h)
      : ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(7,10,17,0.96)');
    g.addColorStop(0.25, 'rgba(20,31,47,0.45)');
    g.addColorStop(1, 'rgba(20,31,47,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };

  side(N, 0, 0, size, edge, true);
  side(S, 0, size - edge, size, edge, true);
  side(W, 0, 0, edge, size, false);
  side(E, size - edge, 0, edge, size, false);

  const corner = Math.floor(size * 0.16);
  const c = (bit: number, x: number, y: number, needA: number, needB: number) => {
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

  c(NW, 0, 0, N, W);
  c(NE, size, 0, N, E);
  c(SE, size, size, S, E);
  c(SW, 0, size, S, W);
}

function ensurePoisonShader(): void {
  if (Effect.ShadersStore.neoPoisonFragmentShader) return;

  Effect.ShadersStore.neoPoisonVertexShader = `
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

  Effect.ShadersStore.neoPoisonFragmentShader = `
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

export class ProceduralReliefTheme {
  private static sceneCaches: Map<string, SceneCache> = new Map();
  private static quality: ProceduralReliefQuality = 'medium';
  private static lightweightMode: boolean = false;

  static getQuality(): ProceduralReliefQuality {
    return this.quality;
  }

  static isLightweightMode(): boolean {
    return this.lightweightMode;
  }

  static setLightweightMode(enabled: boolean): void {
    if (this.lightweightMode === enabled) return;
    this.lightweightMode = enabled;
    this.disposeAllCaches();
  }

  static setQuality(quality: ProceduralReliefQuality): void {
    if (this.quality === quality) return;
    this.quality = quality;
    this.disposeAllCaches();
  }

  private static disposeAllCaches(): void {
    for (const cache of this.sceneCaches.values()) {
      for (const mat of cache.floorMats.values()) {
        mat.dispose();
      }
      for (const mat of cache.wallFaceMats.values()) {
        mat.dispose();
      }
      for (const mat of cache.poisonMats.values()) {
        mat.dispose();
      }
      cache.wallCoreMat.dispose();
    }
    this.sceneCaches.clear();
  }

  private static getSceneCache(scene: Scene): SceneCache {
    let cache = this.sceneCaches.get(scene.uid);
    if (cache) return cache;

    const coreMat = new StandardMaterial(`relief_wall_core_${scene.uid}`, scene);
    coreMat.diffuseColor = new Color3(0.16, 0.18, 0.22);
    coreMat.specularColor = new Color3(0.0, 0.0, 0.0);
    coreMat.emissiveColor = new Color3(0.02, 0.02, 0.025);
    coreMat.freeze();

    cache = {
      floorMats: new Map(),
      wallFaceMats: new Map(),
      poisonMats: new Set(),
      wallCoreMat: coreMat,
    };

    this.sceneCaches.set(scene.uid, cache);
    return cache;
  }

  static prewarm(scene: Scene): void {
    ensurePoisonShader();
    const cache = this.getSceneCache(scene);
    if (cache.wallFaceMats.size === 0) {
      cache.wallFaceMats.set('warmup', this.makeWallMaterial(scene, 'warmup', 0, 0, false, WALL_BRICKS_Y, false, 1));
    }
    if (!this.lightweightMode && cache.floorMats.size === 0) {
      cache.floorMats.set(
        'warmup',
        this.makeFloorMaterial(scene, 'warmup', 0, 0, {
          wallMask: 0,
          wallDiagMask: 0,
          pillarMask: 0,
          pillarDiagMask: 0,
          poisonMask: 0,
          poisonDiagMask: 0,
          voidMask: 0,
          voidDiagMask: 0,
        })
      );
    }
  }

  static applyFloorDisplacement(mesh: Mesh, tileX: number, tileZ: number, tileSize: number): void {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return;

    for (let i = 0; i < positions.length; i += 3) {
      const lx = positions[i] / tileSize + 0.5;
      const lz = positions[i + 2] / tileSize + 0.5;
      const gx = tileX + lx;
      const gy = tileZ + lz;
      positions[i + 1] = floorHeightAt(gx, gy) * FLOOR_ELEVATION_STRENGTH;
    }

    const normals = new Array(positions.length).fill(0);
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }

  static createFloorMaterial(scene: Scene, tileX: number, tileZ: number, neighbors: ProceduralReliefNeighborMasks): StandardMaterial {
    const cache = this.getSceneCache(scene);
    const k = [
      this.lightweightMode ? 'lite' : 'full',
      tileX,
      tileZ,
      neighbors.wallMask,
      neighbors.wallDiagMask,
      neighbors.pillarMask,
      neighbors.pillarDiagMask,
      neighbors.poisonMask,
      neighbors.poisonDiagMask,
      neighbors.voidMask,
      neighbors.voidDiagMask,
    ].join('_');

    const cached = cache.floorMats.get(k);
    if (cached) return cached;

    const mat = this.makeFloorMaterial(scene, k, tileX, tileZ, neighbors);
    cache.floorMats.set(k, mat);
    return mat;
  }

  static createPoisonMaterial(scene: Scene, key: string): ShaderMaterial {
    ensurePoisonShader();
    const cache = this.getSceneCache(scene);
    const mat = new ShaderMaterial(
      `poison_${key}`,
      scene,
      { vertex: 'neoPoison', fragment: 'neoPoison' },
      { attributes: ['position', 'normal', 'uv'], uniforms: ['worldViewProjection', 'time'] }
    );
    mat.setFloat('time', 0);
    mat.alpha = 0.95;
    mat.backFaceCulling = false;
    cache.poisonMats.add(mat);
    return mat;
  }

  static createReliefWallBlock(params: {
    scene: Scene;
    name: string;
    x: number;
    y: number;
    z: number;
    baseSize: number;
    heightScale: number;
    seedX: number;
    seedZ: number;
    parent: TransformNode;
    wallNeighborMask?: number;
  }): TransformNode {
    const {
      scene,
      name,
      x,
      y,
      z,
      baseSize,
      heightScale,
      seedX,
      seedZ,
      parent,
      wallNeighborMask = 0,
    } = params;

    const cache = this.getSceneCache(scene);
    const quality = QUALITY_SETTINGS[this.quality];
    const faceSubdivisions = this.lightweightMode
      ? Math.max(8, Math.floor(quality.faceSubdivisions * 0.45))
      : quality.faceSubdivisions;
    const topSubdivisions = this.lightweightMode
      ? Math.max(6, Math.floor(quality.topSubdivisions * 0.45))
      : quality.topSubdivisions;

    const getFaceMat = (
      hOffset: number,
      axisSeed: number,
      flipU = false,
      bricksY = WALL_BRICKS_Y,
      allowPartialEdgeHighlights = false,
      uScale = 1.0
    ): StandardMaterial => {
      const key = [
        this.lightweightMode ? 'lite' : 'full',
        axisSeed.toFixed(4),
        hOffset.toFixed(4),
        flipU ? 1 : 0,
        bricksY.toFixed(2),
        allowPartialEdgeHighlights ? 1 : 0,
        uScale.toFixed(4),
      ].join('_');
      const existing = cache.wallFaceMats.get(key);
      if (existing) return existing;
      const created = this.makeWallMaterial(scene, key, hOffset, axisSeed, flipU, bricksY, allowPartialEdgeHighlights, uScale);
      cache.wallFaceMats.set(key, created);
      return created;
    };

    const block = new TransformNode(name, scene);
    block.position.set(x, y, z);
    block.parent = parent;

    const wallHeight = baseSize * heightScale;
    const inset = baseSize * 0.996;
    const facePlaneInset = baseSize * 0.003;

    const core = MeshBuilder.CreateBox(`${name}_core`, {
      width: inset,
      depth: inset,
      height: wallHeight,
    }, scene);
    core.material = cache.wallCoreMat;
    core.parent = block;

    const makeFace = (
      faceName: string,
      ry: number,
      ox: number,
      oy: number,
      oz: number,
      hOffset: number,
      axisSeed: number,
      flipU = false,
      faceWidth = baseSize,
      faceHeight = wallHeight,
      bricksY = WALL_BRICKS_Y,
      joinEdgeCorners = false,
      cornerCapMask = 0,
      allowPartialEdgeHighlights = false,
      doubleSided = false,
      uScale = 1.0,
      depthScale = 1.0
    ): Mesh => {
      const face = MeshBuilder.CreateGround(`${name}_${faceName}`, {
        width: faceWidth,
        height: faceHeight,
        subdivisions: faceSubdivisions,
        updatable: true,
      }, scene);

      this.applyWallFaceDisplacement(
        face,
        faceWidth,
        faceHeight,
        hOffset,
        axisSeed,
        flipU,
        bricksY,
        joinEdgeCorners,
        cornerCapMask,
        uScale,
        depthScale
      );
      face.rotation.set(Math.PI / 2, ry, 0);
      face.position.set(ox, oy, oz);
      face.material = getFaceMat(hOffset, axisSeed, flipU, bricksY, allowPartialEdgeHighlights, uScale);
      face.parent = block;
      return face;
    };

    const makeCornerFace = (faceName: string, ry: number, ox: number, oz: number, hOffset: number, flipU = false): Mesh => {
      const cornerWidth = baseSize * 0.136;
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

    const openN = (wallNeighborMask & N) === 0;
    const openE = (wallNeighborMask & E) === 0;
    const openS = (wallNeighborMask & S) === 0;
    const openW = (wallNeighborMask & W) === 0;
    const axisSeedNS = seedZ * 0.173 + 0.11;
    const axisSeedEW = seedX * 0.173 + 0.29;
    const axisSeedCorner = seedX * 0.113 + seedZ * 0.197 + 0.37;

    const northCornerCap = (openN && openW ? 1 : 0) | (openN && openE ? 2 : 0);
    const southCornerCap = (openS && openE ? 1 : 0) | (openS && openW ? 2 : 0);
    const eastCornerCap = (openE && openN ? 1 : 0) | (openE && openS ? 2 : 0);
    const westCornerCap = (openW && openS ? 1 : 0) | (openW && openN ? 2 : 0);

    const northFace = makeFace('north', 0, 0, 0, baseSize * 0.5 - facePlaneInset, seedX, axisSeedNS, false, baseSize, wallHeight, WALL_BRICKS_Y, true, northCornerCap, false);
    const southFace = makeFace('south', Math.PI, 0, 0, -baseSize * 0.5 + facePlaneInset, seedX, axisSeedNS, true, baseSize, wallHeight, WALL_BRICKS_Y, true, southCornerCap, false);
    const eastFace = makeFace('east', Math.PI / 2, baseSize * 0.5 - facePlaneInset, 0, 0, seedZ, axisSeedEW, true, baseSize, wallHeight, WALL_BRICKS_Y, true, eastCornerCap, false);
    const westFace = makeFace('west', -Math.PI / 2, -baseSize * 0.5 + facePlaneInset, 0, 0, seedZ, axisSeedEW, false, baseSize, wallHeight, WALL_BRICKS_Y, true, westCornerCap, false);

    if (openN && openW) this.stabilizeCornerVerticalEdges(northFace, baseSize, wallHeight, seedX, axisSeedNS, false, WALL_BRICKS_Y, true, 1.0, 1.0);
    if (openN && openE) this.stabilizeCornerVerticalEdges(northFace, baseSize, wallHeight, seedX, axisSeedNS, false, WALL_BRICKS_Y, false, 1.0, 1.0);
    if (openS && openE) this.stabilizeCornerVerticalEdges(southFace, baseSize, wallHeight, seedX, axisSeedNS, true, WALL_BRICKS_Y, true, 1.0, 1.0);
    if (openS && openW) this.stabilizeCornerVerticalEdges(southFace, baseSize, wallHeight, seedX, axisSeedNS, true, WALL_BRICKS_Y, false, 1.0, 1.0);
    if (openE && openN) this.stabilizeCornerVerticalEdges(eastFace, baseSize, wallHeight, seedZ, axisSeedEW, true, WALL_BRICKS_Y, true, 1.0, 1.0);
    if (openE && openS) this.stabilizeCornerVerticalEdges(eastFace, baseSize, wallHeight, seedZ, axisSeedEW, true, WALL_BRICKS_Y, false, 1.0, 1.0);
    if (openW && openS) this.stabilizeCornerVerticalEdges(westFace, baseSize, wallHeight, seedZ, axisSeedEW, false, WALL_BRICKS_Y, true, 1.0, 1.0);
    if (openW && openN) this.stabilizeCornerVerticalEdges(westFace, baseSize, wallHeight, seedZ, axisSeedEW, false, WALL_BRICKS_Y, false, 1.0, 1.0);

    const cornerPos = baseSize * 0.5 + baseSize * 0.005;
    const cornerOffsetSeed = (seedX + seedZ) * 0.5;
    if (openN && openW) makeCornerFace('corner_nw', -Math.PI * 0.25, -cornerPos, cornerPos, cornerOffsetSeed, false);
    if (openN && openE) makeCornerFace('corner_ne', Math.PI * 0.25, cornerPos, cornerPos, cornerOffsetSeed, true);
    if (openS && openE) makeCornerFace('corner_se', Math.PI * 0.75, cornerPos, -cornerPos, cornerOffsetSeed, false);
    if (openS && openW) makeCornerFace('corner_sw', -Math.PI * 0.75, -cornerPos, -cornerPos, cornerOffsetSeed, true);

    const top = MeshBuilder.CreateGround(`${name}_top_flat`, {
      width: baseSize,
      height: baseSize,
      subdivisions: topSubdivisions,
      updatable: true,
    }, scene);

    const exposedTopMask = (~wallNeighborMask) & (N | E | S | W);
    this.applyWallFaceDisplacement(top, baseSize, baseSize, seedX, axisSeedCorner, false, 3.0, false, 0, 1.0, 1.0);
    this.stabilizeTopOpenEdgeHalfBricks(top, baseSize, baseSize, seedX, axisSeedCorner, false, exposedTopMask, 3.0);
    top.position.set(0, wallHeight * 0.5 + 0.001, 0);
    top.material = getFaceMat(seedX, axisSeedCorner, false, 3.0, true, 1.0);
    top.parent = block;

    return block;
  }

  private static applyWallFaceDisplacement(
    mesh: Mesh,
    faceWidth: number,
    faceHeight: number,
    hOffset: number,
    axisSeed = 0,
    flipU = false,
    bricksY = WALL_BRICKS_Y,
    joinEdgeCorners = false,
    cornerCapMask = 0,
    uScale = 1.0,
    depthScale = 1.0
  ): void {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions) return;

    for (let i = 0; i < positions.length; i += 3) {
      const lx = positions[i];
      const lz = positions[i + 2];
      const uRaw = lx / faceWidth + 0.5;
      const u = flipU ? (1.0 - uRaw) : uRaw;
      const v = lz / faceHeight + 0.5;
      let h = wallHeightAt(hOffset + u * uScale + axisSeed * 1000.0, v, bricksY);

      if (joinEdgeCorners && cornerCapMask !== 0) {
        const edgeU = Math.min(uRaw, 1.0 - uRaw);
        const edgeJoin = 1.0 - smoothstep(0.0, 0.15, edgeU);
        const minEdgeHeight = WALL_BASE_HEIGHT + 0.12;
        h = h * (1.0 - edgeJoin) + Math.max(h, minEdgeHeight) * edgeJoin;

        const baseBand = 1.0 - smoothstep(0.0, 0.015, v);
        h = h * (1.0 - baseBand) + Math.max(h, WALL_BASE_HEIGHT) * baseBand;
      }

      if (cornerCapMask !== 0) {
        const edgeL = (cornerCapMask & 1) ? (1.0 - smoothstep(0.0, 0.08, uRaw)) : 0.0;
        const edgeR = (cornerCapMask & 2) ? (1.0 - smoothstep(0.0, 0.08, 1.0 - uRaw)) : 0.0;
        if (edgeL > 0.0 || edgeR > 0.0) {
          const cornerBand = 0.20;
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

          const fracY = frac01(v * bricksY);
          const diagL = 1.0 - smoothstep(0.0, 0.24, Math.abs(fracY - uRaw * 0.62));
          const diagR = 1.0 - smoothstep(0.0, 0.24, Math.abs(fracY - (1.0 - uRaw) * 0.62));
          const cap = Math.max(edgeL * diagL, edgeR * diagR);
          h = h * (1.0 - cap) + Math.max(h, WALL_BASE_HEIGHT + 0.28) * cap;

          const bridge = Math.max(edgeL, edgeR) * (1.0 - smoothstep(0.0, 0.44, Math.abs(fracY - 0.5)));
          h = h * (1.0 - bridge) + Math.max(h, WALL_BASE_HEIGHT + 0.22) * bridge;

          const cornerHalfSeal = Math.max(edgeL, edgeR) * (1.0 - smoothstep(0.0, 0.22, Math.min(fracY, 1.0 - fracY)));
          h = h * (1.0 - cornerHalfSeal) + Math.max(h, WALL_BASE_HEIGHT + 0.14) * cornerHalfSeal;
        }
      }

      positions[i + 1] = h * WALL_ELEVATION_STRENGTH * depthScale;
    }

    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    if (indices) {
      const normals = new Array(positions.length).fill(0);
      VertexData.ComputeNormals(positions, indices, normals);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
  }

  private static stabilizeTopOpenEdgeHalfBricks(
    mesh: Mesh,
    faceWidth: number,
    faceHeight: number,
    hOffset: number,
    axisSeed: number,
    flipU: boolean,
    exposedMask: number,
    bricksY = 3.0
  ): void {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
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
      const cellX = frac01(gu * WALL_BRICKS_X + stagger);
      const cellY = frac01(v * bricksY);
      const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
      const brickMask = smoothstep(WALL_MORTAR_W * 0.82, WALL_MORTAR_W * 1.22, border);
      const halfBrickZone = 1.0 - smoothstep(0.78, 0.98, brickMask);
      const blend = exposedEdge * halfBrickZone;

      const loweredRef = Math.max(0.0, hRef - blend * WALL_ELEVATION_STRENGTH * 0.08);
      let outY = positions[i + 1] * (1.0 - blend) + loweredRef * blend;

      const exposedV = Math.max(
        (exposedMask & N) ? smoothstep(edgeBand, 1.0, v) : 0.0,
        (exposedMask & S) ? smoothstep(edgeBand, 1.0, 1.0 - v) : 0.0
      );
      if (exposedV > 0.0) {
        const finishMask = exposedV * halfBrickZone;
        outY = Math.max(0.0, outY - finishMask * WALL_ELEVATION_STRENGTH * 0.22);
      }

      const exposedU = Math.max(
        (exposedMask & E) ? smoothstep(edgeBand, 1.0, uRaw) : 0.0,
        (exposedMask & W) ? smoothstep(edgeBand, 1.0, 1.0 - uRaw) : 0.0
      );
      const finishV = exposedV * halfBrickZone;
      const finishU = exposedU * (0.38 + 0.62 * halfBrickZone);
      const finishAll = Math.max(finishV, finishU);
      if (finishAll > 0.0) {
        outY = Math.max(0.0, outY - finishAll * WALL_ELEVATION_STRENGTH * 0.34);
        if (exposedU > 0.92) {
          outY = Math.min(outY, WALL_ELEVATION_STRENGTH * 0.008);
        }
      }

      positions[i + 1] = outY;
    }

    const normals = new Array(positions.length).fill(0);
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }

  private static stabilizeCornerVerticalEdges(
    mesh: Mesh,
    faceWidth: number,
    faceHeight: number,
    hOffset: number,
    axisSeed: number,
    flipU: boolean,
    bricksY: number,
    isLeftEdge = true,
    uScale = 1.0,
    depthScale = 1.0
  ): void {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return;

    const cornerBand = 0.12;
    for (let i = 0; i < positions.length; i += 3) {
      const lx = positions[i];
      const lz = positions[i + 2];
      const uRaw = lx / faceWidth + 0.5;
      const u = flipU ? (1.0 - uRaw) : uRaw;
      const v = lz / faceHeight + 0.5;

      let cornerEdge = 0.0;
      if (isLeftEdge) {
        cornerEdge = 1.0 - smoothstep(0.0, cornerBand, uRaw);
      } else {
        cornerEdge = 1.0 - smoothstep(0.0, cornerBand, 1.0 - uRaw);
      }
      if (cornerEdge <= 0.0001) continue;

      let uMirror = u;
      if (isLeftEdge && uRaw < cornerBand) {
        const uRawMirror = cornerBand + (cornerBand - uRaw);
        uMirror = flipU ? (1.0 - uRawMirror) : uRawMirror;
      } else if (!isLeftEdge && uRaw > (1.0 - cornerBand)) {
        const uRawMirror = (1.0 - cornerBand) - (uRaw - (1.0 - cornerBand));
        uMirror = flipU ? (1.0 - uRawMirror) : uRawMirror;
      }

      const hRef = wallHeightAt(hOffset + uMirror * uScale + axisSeed * 1000.0, v, bricksY) * WALL_ELEVATION_STRENGTH * depthScale;

      const gu = hOffset + u * uScale + axisSeed * 1000.0;
      const row = Math.floor(v * bricksY);
      const stagger = (row % 2) * 0.5;
      const cellX = frac01(gu * WALL_BRICKS_X + stagger);
      const cellY = frac01(v * bricksY);
      const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
      const brickMask = smoothstep(WALL_MORTAR_W * 0.82, WALL_MORTAR_W * 1.22, border);
      const halfBrickZone = 1.0 - smoothstep(0.78, 0.98, brickMask);
      const blend = cornerEdge * halfBrickZone;

      const currentY = positions[i + 1];
      const blendedRef = Math.max(0.0, hRef - blend * WALL_ELEVATION_STRENGTH * depthScale * 0.06);
      positions[i + 1] = currentY * (1.0 - blend) + blendedRef * blend;
    }

    const normals = new Array(positions.length).fill(0);
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }

  private static makeFloorMaterial(
    scene: Scene,
    key: string,
    tileX: number,
    tileZ: number,
    neighbors: ProceduralReliefNeighborMasks
  ): StandardMaterial {
    const configuredSize = QUALITY_SETTINGS[this.quality].floorTextureSize;
    const size = this.lightweightMode
      ? Math.max(56, Math.floor(configuredSize * 0.62))
      : configuredSize;
    const invSize = 1 / Math.max(1, size - 1);
    const tex = new DynamicTexture(`f_tex_${key}`, { width: size, height: size }, scene, false);
    const bump = new DynamicTexture(`f_bump_${key}`, { width: size, height: size }, scene, false);
    const ctx = tex.getContext() as Canvas2DRenderingContext;
    const bctx = bump.getContext() as Canvas2DRenderingContext;

    const stoneX = 2.35;
    const stoneY = 2.35;
    const seamW = 0.05;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * invSize;
        const v = (size - 1 - y) * invSize; // Invert V to match Babylon UV space (v=0 at bottom)
        const gx = tileX + u;
        const gy = tileZ + v;

        const cellX = frac01(gx * stoneX);
        const cellY = frac01(gy * stoneY);
        const border = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));

        const stoneIdX = Math.floor(gx * stoneX);
        const stoneIdY = Math.floor(gy * stoneY);
        const stoneTone = hash2(stoneIdX, stoneIdY, 0.44);
        const rawStone = hash2(stoneIdX, stoneIdY, 0.12);
        const stoneHeight = Math.floor(rawStone * 5.0) / 5.0;

        const large = hash2(gx * 1.6, gy * 1.5, 0.23);
        const medium = hash2(gx * 2.2, gy * 2.1, 0.61);

        let r = 110 + large * 6 + medium * 3 + stoneTone * 4 + stoneHeight * 3;
        let g = 117 + large * 6 + medium * 3 + stoneTone * 4 + stoneHeight * 3;
        let b = 128 + large * 7 + medium * 4 + stoneTone * 5 + stoneHeight * 3;

        const seamShade = border < seamW ? 6 : 0;
        r -= seamShade;
        g -= seamShade;
        b -= seamShade;

        ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
        ctx.fillRect(x, y, 1, 1);

        const h01 = floorHeightAt(gx, gy);
        // Sharpen the mortar in the bump map
        const mortarBump = border < seamW ? 32 : 0;
        const h = Math.max(0, Math.min(255, Math.floor(116 + h01 * 122 - mortarBump + stoneTone * 8)));
        bctx.fillStyle = `rgb(${h}, ${h}, ${h})`;
        bctx.fillRect(x, y, 1, 1);
      }
    }

    const wallMask = flipMaskVertical(neighbors.wallMask);
    const wallDiagMask = flipDiagMaskVertical(neighbors.wallDiagMask);
    const pillarMask = flipMaskVertical(neighbors.pillarMask);
    const pillarDiagMask = flipDiagMaskVertical(neighbors.pillarDiagMask);
    const poisonMask = flipMaskVertical(neighbors.poisonMask);
    const poisonDiagMask = flipDiagMaskVertical(neighbors.poisonDiagMask);
    const voidMask = flipMaskVertical(neighbors.voidMask);
    const voidDiagMask = flipDiagMaskVertical(neighbors.voidDiagMask);

    const poisonMaskFinal = poisonMask & (~voidMask);
    const poisonDiagFinal = poisonDiagMask & (~voidDiagMask);

    drawCircuit(ctx, size, wallMask, 'rgba(83, 188, 255, 0.95)', 'rgba(168, 113, 255, 0.95)', 0);
    drawExteriorCornerTransitions(ctx, size, wallMask, wallDiagMask, 'rgba(104, 196, 255, 0.78)', 0);

    if (pillarMask || pillarDiagMask) {
      drawCircuit(ctx, size, pillarMask, 'rgba(126, 218, 255, 0.95)', 'rgba(170, 128, 255, 0.85)', 8);
      drawExteriorCornerTransitions(ctx, size, pillarMask, pillarDiagMask, 'rgba(126, 218, 255, 0.9)', 8);
    }

    applyPoisonTransition(ctx, size, poisonMaskFinal, poisonDiagFinal);
    applyVoidRim(ctx, size, voidMask, voidDiagMask);

    tex.update(false);
    bump.update(false);
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    bump.wrapU = Texture.CLAMP_ADDRESSMODE;
    bump.wrapV = Texture.CLAMP_ADDRESSMODE;

    const mat = new StandardMaterial(`f_mat_${key}`, scene);
    mat.diffuseTexture = tex;
    mat.bumpTexture = bump;
    mat.useParallax = false;
    mat.useParallaxOcclusion = false;
    if (mat.bumpTexture) {
      mat.bumpTexture.level = 1.9;
    }
    mat.specularColor = new Color3(0.08, 0.08, 0.1);
    mat.emissiveColor = new Color3(0.02, 0.02, 0.025);
    mat.freeze();
    return mat;
  }

  private static makeWallMaterial(
    scene: Scene,
    key: string,
    hOffset = 0,
    axisSeed = 0,
    flipU = false,
    bricksY = WALL_BRICKS_Y,
    allowPartialEdgeHighlights = false,
    uScale = 1.0
  ): StandardMaterial {
    const configuredSize = QUALITY_SETTINGS[this.quality].wallTextureSize;
    const size = this.lightweightMode
      ? Math.max(128, Math.floor(configuredSize * 0.58))
      : 256;
    const invSize = 1 / Math.max(1, size - 1);
    const useMipMaps = !this.lightweightMode;
    const tex = new DynamicTexture(`w_tex_${key}`, { width: size, height: size }, scene, useMipMaps);
    const bump = new DynamicTexture(`w_bump_${key}`, { width: size, height: size }, scene, useMipMaps);
    const ctx = tex.getContext() as Canvas2DRenderingContext;
    const bctx = bump.getContext() as Canvas2DRenderingContext;


    // 1. Draw Mortar Base
    const mortarShade = 74;
    ctx.fillStyle = `rgb(${mortarShade}, ${mortarShade + 3}, ${mortarShade + 8})`;
    ctx.fillRect(0, 0, size, size);
    
    // Heightmap base (mortar depth)
    const mortarH = 112 - 36;
    bctx.fillStyle = `rgb(${mortarH}, ${mortarH}, ${mortarH})`;
    bctx.fillRect(0, 0, size, size);

    const brickW = size / WALL_BRICKS_X;
    const brickH = size / bricksY;
    const margin = size * WALL_MORTAR_W * 0.5;

    // 2. Iterate by Brick (Explicit loop for vertical motif integrity)
    for (let row = 0; row < bricksY; row++) {
      const stagger = (row % 2) * 0.5;
      const brickIdY = row;
      
      // We cover extra bricks on X to handle stagger and uScale/hOffset
      const minBX = Math.floor((hOffset - 0.5) * WALL_BRICKS_X) - 1;
      const maxBX = Math.ceil((hOffset + uScale + 0.5) * WALL_BRICKS_X) + 1;

      for (let bx = minBX; bx <= maxBX; bx++) {
        // Map global brick to texture space
        const gxStart = (bx - stagger) / WALL_BRICKS_X;
        const u0 = (gxStart - hOffset) / uScale;
        const x0 = flipU ? (1.0 - u0 - (1.0 / (WALL_BRICKS_X * uScale))) * size : u0 * size;
        const x1 = x0 + (size / (WALL_BRICKS_X * uScale));
        const y0 = (bricksY - 1 - row) * brickH; // Flip V to match Babylon
        const y1 = y0 + brickH;

        if (x1 < 0 || x0 > size) continue;

        const brickIdX = bx;
        const rawBrick = hash2(brickIdX * 1.23, brickIdY * 1.31, 0.37);
        const brickHeight = Math.floor(rawBrick * 5.0) / 5.0;

        // Brick bounds with margin
        const rx = Math.max(0, x0 + margin);
        const ry = y0 + margin;
        const rw = Math.min(size, x1 - margin) - rx;
        const rh = brickH - margin * 2;

        if (rw <= 0 || rh <= 0) continue;

        // Color and Bump
        const n = hash2(brickIdX * 13.0, brickIdY * 11.0, 0.62); // Per-brick variation
        const c = 45 + n * 12 + brickHeight * 18;
        
        ctx.fillStyle = `rgb(${Math.floor(c + 12)}, ${Math.floor(c + 16)}, ${Math.floor(c + 25)})`;
        ctx.fillRect(rx, ry, rw, rh);

        // High-Fidelity Bevel in Bump Map using a radial-like gradient effect
        const h = 112 + brickHeight * 78;
        const hTop = h + 45; // Bevel peak
        
        const grad = bctx.createRadialGradient(rx + rw/2, ry + rh/2, 0, rx + rw/2, ry + rh/2, Math.max(rw, rh)/2);
        grad.addColorStop(0, `rgb(${hTop}, ${hTop}, ${hTop})`);
        grad.addColorStop(0.7, `rgb(${hTop}, ${hTop}, ${hTop})`); // Plateau
        grad.addColorStop(1, `rgb(${h}, ${h}, ${h})`); // Bevel edge
        bctx.fillStyle = grad;
        bctx.fillRect(rx, ry, rw, rh);

        // Blue Highlight Integrated
        const highlightPick = hash2(brickIdX * 1.31, brickIdY * 2.17 + axisSeed * 19.0, 0.41);
        if (highlightPick > 0.76) {
          const accent = 0.78 + hash2(brickIdX * 2.37, brickIdY * 1.73 + axisSeed * 7.0, 0.22) * 0.18;
          ctx.strokeStyle = `rgb(${Math.floor(142 * accent)}, ${Math.floor(224 * accent)}, ${Math.floor(255 * accent)})`;
          ctx.lineWidth = size * 0.015;
          ctx.strokeRect(rx + ctx.lineWidth/2, ry + ctx.lineWidth/2, rw - ctx.lineWidth, rh - ctx.lineWidth);
        }
      }
    }

    // 3. Final Noise Pass (Grain)
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 400; i++) {
        const nx = Math.random() * size;
        const ny = Math.random() * size;
        const nc = Math.random() * 40;
        ctx.fillStyle = `rgba(${nc}, ${nc}, ${nc}, 0.15)`;
        ctx.fillRect(nx, ny, 2, 2);
    }
    ctx.restore();

    // 4. Moss Pass
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const u = x / size;
        const v = (size - 1 - y) / size;
        const gx = hOffset + u * uScale;
        const gy = v;
        const mb = mossBlobAt(gx, gy);
        if (mb > 0.45) {
          const mrow = Math.floor(gy * bricksY);
          const mcol = Math.floor(gx * WALL_BRICKS_X + (mrow % 2) * 0.5);
          const mgate = smoothstep(0.56, 0.9, hash2(mcol * 0.77, mrow * 0.91, 0.63));
          if (mgate > 0.5) {
            const mossAlpha = smoothstep(0.45, 0.8, mb);
            ctx.fillStyle = `rgba(86, 132, 92, ${mossAlpha * 0.4})`;
            ctx.fillRect(x, y, 4, 4);
            const mbump = Math.floor(mb * 180 * WALL_MOSS_HEIGHT_STRENGTH);
            bctx.fillStyle = `rgba(${mbump}, ${mbump}, ${mbump}, ${mossAlpha})`;
            bctx.fillRect(x, y, 4, 4);
          }
        }
      }
    }

    // Removed the separate call to drawWallBrickHighlights as it's now integrated

    tex.update(false);
    bump.update(false);
    tex.updateSamplingMode(this.lightweightMode ? Texture.BILINEAR_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE);
    bump.updateSamplingMode(this.lightweightMode ? Texture.BILINEAR_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    bump.wrapU = Texture.CLAMP_ADDRESSMODE;
    bump.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = this.lightweightMode ? 2 : 8;
    bump.anisotropicFilteringLevel = this.lightweightMode ? 2 : 8;

    const mat = new StandardMaterial(`w_mat_${key}`, scene);
    mat.diffuseTexture = tex;
    mat.bumpTexture = bump;
    mat.useParallax = true;
    mat.useParallaxOcclusion = true;
    mat.parallaxScaleBias = 0.035;
    if (mat.bumpTexture) {
      mat.bumpTexture.level = 1.4;
    }
    mat.emissiveColor = new Color3(0.02, 0.02, 0.025);
    mat.specularColor = new Color3(0.015, 0.015, 0.015);
    mat.freeze();
    return mat;
  }
}
