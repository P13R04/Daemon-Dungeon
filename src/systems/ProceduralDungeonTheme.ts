import {
  Color3,
  DynamicTexture,
  Effect,
  Texture,
  Scene,
  ShaderMaterial,
  StandardMaterial,
} from '@babylonjs/core';

type Canvas2DRenderingContext = CanvasRenderingContext2D;

export type TileNeighborKinds = {
  wallMask: number;
  wallDiagMask: number;
  poisonMask: number;
  poisonDiagMask: number;
  voidMask: number;
  voidDiagMask: number;
};

const N_BIT = 1;
const E_BIT = 2;
const S_BIT = 4;
const W_BIT = 8;
const NW_BIT = 1;
const NE_BIT = 2;
const SE_BIT = 4;
const SW_BIT = 8;

function hash2(x: number, z: number, seed: number = 0.61803398875): number {
  const s = Math.sin((x + 1.137) * 127.1 + (z + 0.731) * 311.7 + seed * 91.13) * 43758.5453123;
  return s - Math.floor(s);
}

function brighten(color: Color3, amount: number): string {
  const r = Math.min(255, Math.max(0, Math.floor((color.r + amount) * 255)));
  const g = Math.min(255, Math.max(0, Math.floor((color.g + amount) * 255)));
  const b = Math.min(255, Math.max(0, Math.floor((color.b + amount) * 255)));
  return `rgb(${r}, ${g}, ${b})`;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.00001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function drawCircuitEdge(
  ctx: Canvas2DRenderingContext,
  mask: number,
  size: number,
  colorA: string,
  colorB: string,
  offset: number
): void {
  const edge = Math.floor(size * 0.12) + offset;
  const glow = Math.floor(size * 0.04);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowBlur = glow;
  ctx.shadowColor = colorB;

  const jitteredLine = (x1: number, y1: number, x2: number, y2: number, width: number, color: string) => {
    const segments = 5;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const len = Math.max(1, Math.sqrt(nx * nx + ny * ny));
      const wobble = (hash2(px * 0.07, py * 0.07, 0.33) - 0.5) * size * 0.012;
      const jx = px + (nx / len) * wobble;
      const jy = py + (ny / len) * wobble;
      if (i === 0) {
        ctx.moveTo(jx, jy);
      } else {
        ctx.lineTo(jx, jy);
      }
    }
    ctx.stroke();
  };

  const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: string) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  if (mask & N_BIT) {
    jitteredLine(edge, edge, size - edge, edge, Math.max(2, Math.floor(size * 0.02)), colorA);
    line(edge + 8, edge + 7, size - edge - 8, edge + 7, Math.max(1, Math.floor(size * 0.008)), colorB);
  }
  if (mask & E_BIT) {
    jitteredLine(size - edge, edge, size - edge, size - edge, Math.max(2, Math.floor(size * 0.02)), colorA);
    line(size - edge - 7, edge + 8, size - edge - 7, size - edge - 8, Math.max(1, Math.floor(size * 0.008)), colorB);
  }
  if (mask & S_BIT) {
    jitteredLine(edge, size - edge, size - edge, size - edge, Math.max(2, Math.floor(size * 0.02)), colorA);
    line(edge + 8, size - edge - 7, size - edge - 8, size - edge - 7, Math.max(1, Math.floor(size * 0.008)), colorB);
  }
  if (mask & W_BIT) {
    jitteredLine(edge, edge, edge, size - edge, Math.max(2, Math.floor(size * 0.02)), colorA);
    line(edge + 7, edge + 8, edge + 7, size - edge - 8, Math.max(1, Math.floor(size * 0.008)), colorB);
  }

  ctx.restore();
}

function drawStoneCracks(ctx: Canvas2DRenderingContext, size: number, strength: number, seed: number): void {
  const crackCount = 14 + Math.floor(strength * 22);
  ctx.save();
  ctx.globalAlpha = 0.22 + strength * 0.28;
  ctx.strokeStyle = 'rgba(28, 31, 40, 0.9)';
  ctx.lineWidth = Math.max(1, Math.floor(size * 0.006));

  for (let i = 0; i < crackCount; i++) {
    const x = Math.floor(hash2(i + 12.7, seed) * size);
    const y = Math.floor(hash2(i + 53.4, seed + 2.0) * size);
    const len = Math.floor(size * (0.06 + hash2(i + 7.2, seed + 7.0) * 0.2));
    const angle = hash2(i + 98.3, seed + 0.3) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoss(ctx: Canvas2DRenderingContext, size: number, density: number, seed: number): void {
  const patches = 12 + Math.floor(density * 22);
  ctx.save();
  for (let i = 0; i < patches; i++) {
    const x = hash2(seed + i * 0.41, i + 4.1) * size;
    const y = hash2(seed + i * 0.73, i + 13.2) * size;
    const radius = size * (0.02 + hash2(i + 99.2, seed) * 0.06);
    const green = 70 + Math.floor(hash2(i + 31.1, seed + 2.1) * 55);

    ctx.fillStyle = `rgba(${32 + Math.floor(hash2(i + 55.1, seed) * 24)}, ${green}, ${26 + Math.floor(hash2(i + 64.5, seed) * 26)}, 0.28)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function applyPoisonTransition(
  ctx: Canvas2DRenderingContext,
  size: number,
  neighbors: TileNeighborKinds,
  intensity: number
): void {
  const edge = Math.floor(size * 0.16);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const drawSide = (bit: number, x: number, y: number, w: number, h: number) => {
    if (!(neighbors.poisonMask & bit)) return;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, `rgba(63, 255, 151, ${0.26 + intensity * 0.3})`);
    g.addColorStop(1, 'rgba(18, 90, 38, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };

  drawSide(N_BIT, 0, 0, size, edge);
  drawSide(S_BIT, 0, size - edge, size, edge);
  drawSide(W_BIT, 0, 0, edge, size);
  drawSide(E_BIT, size - edge, 0, edge, size);

  const cornerRadius = size * 0.2;
  const drawCorner = (bit: number, cx: number, cy: number) => {
    if (!(neighbors.poisonDiagMask & bit)) return;
    const rr = cornerRadius * (0.8 + hash2(cx, cy, 0.6) * 0.4);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grad.addColorStop(0, 'rgba(70, 255, 165, 0.3)');
    grad.addColorStop(1, 'rgba(70, 255, 165, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  };

  drawCorner(NW_BIT, 0, 0);
  drawCorner(NE_BIT, size, 0);
  drawCorner(SE_BIT, size, size);
  drawCorner(SW_BIT, 0, size);
  ctx.restore();
}

function applyVoidRim(ctx: Canvas2DRenderingContext, size: number, neighbors: TileNeighborKinds): void {
  const edge = Math.floor(size * 0.12);
  ctx.save();
  ctx.shadowBlur = Math.floor(size * 0.03);
  ctx.shadowColor = 'rgba(5, 15, 28, 1)';
  const drawRim = (bit: number, x: number, y: number, w: number, h: number) => {
    if (!(neighbors.voidMask & bit)) return;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(6, 9, 16, 0.95)');
    g.addColorStop(1, 'rgba(95, 143, 179, 0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };

  drawRim(N_BIT, 0, 0, size, edge);
  drawRim(S_BIT, 0, size - edge, size, edge);
  drawRim(W_BIT, 0, 0, edge, size);
  drawRim(E_BIT, size - edge, 0, edge, size);

  const corner = Math.floor(size * 0.16);
  const drawCornerRim = (bit: number, x: number, y: number) => {
    if (!(neighbors.voidDiagMask & bit)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, corner);
    g.addColorStop(0, 'rgba(7, 10, 17, 0.85)');
    g.addColorStop(1, 'rgba(7, 10, 17, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, corner, 0, Math.PI * 2);
    ctx.fill();
  };

  drawCornerRim(NW_BIT, 0, 0);
  drawCornerRim(NE_BIT, size, 0);
  drawCornerRim(SE_BIT, size, size);
  drawCornerRim(SW_BIT, 0, size);
  ctx.restore();
}

export class ProceduralDungeonTheme {
  private static poisonShaderRegistered = false;

  static isNeoTestRoom(roomId: string): boolean {
    return roomId === 'room_test_tiles_maze'
      || roomId === 'room_test_poison_pattern'
      || roomId === 'room_test_neodungeon';
  }

  static createFloorMaterial(
    scene: Scene,
    key: string,
    tileX: number,
    tileZ: number,
    neighbors: TileNeighborKinds
  ): StandardMaterial {
    const size = 256;
    const texture = new DynamicTexture(`neo_floor_tex_${key}`, { width: size, height: size }, scene, false);
    const bump = new DynamicTexture(`neo_floor_bump_${key}`, { width: size, height: size }, scene, false);
    const ctx = texture.getContext() as Canvas2DRenderingContext;
    const bctx = bump.getContext() as Canvas2DRenderingContext;

    const mortarWidth = 0.07;
    const bricksX = 4.0;
    const bricksY = 4.0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const gx = tileX + u;
        const gy = tileZ + v;

        const row = Math.floor(gy * bricksY);
        const stagger = (row % 2) * 0.5;
        const cellX = (gx * bricksX + stagger) % 1;
        const cellY = (gy * bricksY) % 1;
        const mortarDist = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
        const mortar = 1.0 - smoothstep(0, mortarWidth, mortarDist);

        const n1 = Math.sin((gx * 10.0 + gy * 13.0) * Math.PI * 2) * 0.5 + 0.5;
        const n2 = Math.sin((gx * 21.0 - gy * 18.0) * Math.PI * 2) * 0.5 + 0.5;
        const n3 = Math.sin((gx * 37.0 + gy * 31.0) * Math.PI * 2) * 0.5 + 0.5;
        const noise = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;

        const crackA = Math.abs(Math.sin((gx * 7.2 + gy * 1.9) * Math.PI * 2));
        const crackB = Math.abs(Math.sin((gx * 2.8 - gy * 8.1) * Math.PI * 2));
        const cracks = smoothstep(0.92, 0.99, (crackA * 0.65 + crackB * 0.35));

        let r = 58 + noise * 22;
        let g = 62 + noise * 24;
        let b = 70 + noise * 26;

        r = r * (1 - mortar) + 36 * mortar;
        g = g * (1 - mortar) + 39 * mortar;
        b = b * (1 - mortar) + 45 * mortar;

        r -= cracks * 18;
        g -= cracks * 22;
        b -= cracks * 25;

        const rr = Math.max(0, Math.min(255, Math.floor(r)));
        const gg = Math.max(0, Math.min(255, Math.floor(g)));
        const bb = Math.max(0, Math.min(255, Math.floor(b)));
        ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
        ctx.fillRect(x, y, 1, 1);

        const height = Math.max(0, Math.min(255, Math.floor(120 + noise * 95 - mortar * 80 - cracks * 45)));
        bctx.fillStyle = `rgb(${height}, ${height}, ${height})`;
        bctx.fillRect(x, y, 1, 1);
      }
    }

    // Floor keeps moss very light; walls carry most of it.
    drawMoss(ctx, size, 0.12, tileX * 0.7 + tileZ * 1.3 + 1.5);

    drawCircuitEdge(ctx, neighbors.wallMask, size, 'rgba(92, 194, 255, 0.95)', 'rgba(161, 126, 255, 0.9)', 0);
    if (neighbors.wallDiagMask !== 0 && neighbors.wallMask === 0) {
      drawCircuitEdge(
        ctx,
        (neighbors.wallDiagMask & NW_BIT ? N_BIT | W_BIT : 0)
          | (neighbors.wallDiagMask & NE_BIT ? N_BIT | E_BIT : 0)
          | (neighbors.wallDiagMask & SE_BIT ? S_BIT | E_BIT : 0)
          | (neighbors.wallDiagMask & SW_BIT ? S_BIT | W_BIT : 0),
        size,
        'rgba(85, 174, 244, 0.6)',
        'rgba(150, 118, 245, 0.55)',
        8
      );
    }

    applyPoisonTransition(ctx, size, neighbors, 0.5);
    applyVoidRim(ctx, size, neighbors);
    drawStoneCracks(ctx, size, 0.35, tileX * 2.1 + tileZ * 3.3 + 4.2);

    ctx.save();
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(hash2(tileX * 7 + i, tileZ * 5 + i * 3, 0.29) * size);
      const y = Math.floor(hash2(tileX * 11 + i * 2, tileZ * 9 + i, 0.53) * size);
      const w = 2 + Math.floor(hash2(i, tileX + tileZ, 0.9) * 7);
      const h = 2 + Math.floor(hash2(i + 4, tileX - tileZ, 0.4) * 4);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(117, 198, 255, 0.16)' : 'rgba(178, 120, 255, 0.14)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    texture.update(false);
    bump.update(false);

    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    bump.wrapU = Texture.WRAP_ADDRESSMODE;
    bump.wrapV = Texture.WRAP_ADDRESSMODE;

    const mat = new StandardMaterial(`neo_floor_mat_${key}`, scene);
    mat.diffuseTexture = texture;
    mat.bumpTexture = bump;
    mat.useParallax = true;
    mat.useParallaxOcclusion = true;
    mat.parallaxScaleBias = 0.028;
    mat.specularColor = new Color3(0.08, 0.08, 0.1);
    mat.emissiveColor = new Color3(0.03, 0.04, 0.06);
    return mat;
  }

  static createWallOrPillarMaterial(scene: Scene, key: string, kind: 'wall' | 'pillar'): StandardMaterial {
    const size = 384;
    const texture = new DynamicTexture(`neo_${kind}_tex_${key}`, { width: size, height: size }, scene, false);
    const bump = new DynamicTexture(`neo_${kind}_bump_${key}`, { width: size, height: size }, scene, false);
    const ctx = texture.getContext() as Canvas2DRenderingContext;
    const bctx = bump.getContext() as Canvas2DRenderingContext;

    const bricksX = kind === 'wall' ? 3.0 : 4.0;
    const bricksY = kind === 'wall' ? 6.0 : 7.0;
    const mortarWidth = kind === 'wall' ? 0.08 : 0.06;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;

        const row = Math.floor(v * bricksY);
        const stagger = (row % 2) * 0.5;
        const cellX = (u * bricksX + stagger) % 1;
        const cellY = (v * bricksY) % 1;
        const mortarDist = Math.min(Math.min(cellX, 1 - cellX), Math.min(cellY, 1 - cellY));
        const mortar = 1.0 - smoothstep(0, mortarWidth, mortarDist);

        const n1 = Math.sin((u * 13.0 + v * 11.0) * Math.PI * 2) * 0.5 + 0.5;
        const n2 = Math.sin((u * 29.0 - v * 19.0) * Math.PI * 2) * 0.5 + 0.5;
        const noise = n1 * 0.6 + n2 * 0.4;

        let r = 63 + noise * 24;
        let g = 66 + noise * 22;
        let b = 76 + noise * 28;
        r = r * (1 - mortar) + 38 * mortar;
        g = g * (1 - mortar) + 40 * mortar;
        b = b * (1 - mortar) + 46 * mortar;

        const rr = Math.max(0, Math.min(255, Math.floor(r)));
        const gg = Math.max(0, Math.min(255, Math.floor(g)));
        const bb = Math.max(0, Math.min(255, Math.floor(b)));
        ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
        ctx.fillRect(x, y, 1, 1);

        const height = Math.max(0, Math.min(255, Math.floor(130 + noise * 92 - mortar * 82)));
        bctx.fillStyle = `rgb(${height}, ${height}, ${height})`;
        bctx.fillRect(x, y, 1, 1);
      }
    }

    drawStoneCracks(ctx, size, kind === 'wall' ? 0.95 : 0.8, 2.37);
    drawMoss(ctx, size, kind === 'wall' ? 0.82 : 0.68, 4.91);
    drawCircuitEdge(ctx, N_BIT | E_BIT | S_BIT | W_BIT, size, 'rgba(101, 202, 255, 0.52)', 'rgba(176, 117, 255, 0.46)', 14);

    ctx.save();
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(hash2(i * 0.9, i * 3.4, 0.4) * size);
      const y = Math.floor(hash2(i * 2.4, i * 1.3, 0.6) * size);
      const w = 3 + Math.floor(hash2(i, 3.1, 0.9) * 10);
      const h = 2 + Math.floor(hash2(i, 7.7, 0.3) * 5);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(121, 197, 255, 0.2)' : 'rgba(180, 124, 255, 0.16)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    texture.update(false);
    bump.update(false);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    bump.wrapU = Texture.WRAP_ADDRESSMODE;
    bump.wrapV = Texture.WRAP_ADDRESSMODE;

    const mat = new StandardMaterial(`neo_${kind}_mat_${key}`, scene);
    mat.diffuseTexture = texture;
    mat.bumpTexture = bump;
    mat.useParallax = true;
    mat.useParallaxOcclusion = true;
    mat.parallaxScaleBias = 0.035;
    mat.specularColor = new Color3(0.05, 0.05, 0.06);
    mat.emissiveColor = new Color3(0.04, 0.04, 0.06);
    return mat;
  }

  static createPoisonShaderMaterial(scene: Scene, key: string): ShaderMaterial {
    this.ensurePoisonShader();

    const mat = new ShaderMaterial(
      `neo_poison_shader_${key}`,
      scene,
      {
        vertex: 'neoPoison',
        fragment: 'neoPoison',
      },
      {
        attributes: ['position', 'normal', 'uv'],
        uniforms: ['worldViewProjection', 'time'],
      }
    );

    mat.backFaceCulling = false;
    mat.alpha = 0.96;
    mat.setFloat('time', 0);
    return mat;
  }

  private static ensurePoisonShader(): void {
    if (this.poisonShaderRegistered) return;

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

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main(void) {
        vec2 uv = vUV;
        vec2 warped = uv * 7.0;
        warped.x += sin((uv.y + time * 0.6) * 12.0) * 0.18;
        warped.y += cos((uv.x - time * 0.5) * 14.0) * 0.14;

        float n1 = noise(warped + vec2(time * 0.9, -time * 0.55));
        float n2 = noise((warped * 1.9) - vec2(time * 0.35, time * 0.77));
        float streams = smoothstep(0.47, 0.9, n1 * 0.7 + n2 * 0.55);

        float scan = 0.5 + 0.5 * sin((uv.y * 90.0) + time * 12.0 + n2 * 3.14);
        float flicker = 0.78 + 0.22 * sin(time * 17.0 + uv.x * 41.0);

        vec3 dark = vec3(0.02, 0.08, 0.04);
        vec3 mid = vec3(0.05, 0.35, 0.12);
        vec3 bright = vec3(0.18, 0.92, 0.31);

        vec3 color = mix(dark, mid, streams);
        color = mix(color, bright, streams * scan * 0.85);
        color += vec3(0.0, 0.08, 0.02) * flicker * 0.35;

        float alpha = 0.82 + streams * 0.16;
        gl_FragColor = vec4(color, alpha);
      }
    `;

    this.poisonShaderRegistered = true;
  }
}
