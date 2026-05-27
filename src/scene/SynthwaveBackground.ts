import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
  Vector3,
  Texture,
  Material,
} from '@babylonjs/core';

function createNeutralReflectionCurtain(scene: Scene, layerMask?: number, rotate180: boolean = false): void {
  const texSize = 1536;
  const grid = 24;
  const margin = 16;

  type Pt = { x: number; y: number };
  type Path = { pts: Pt[]; length: number; speed: number; phase: number; tone: 'cyan' | 'blue' | 'violet' };
  const paths: Path[] = [];

  const texture = new DynamicTexture('neutral_reflection_curtain_tex', { width: texSize, height: texSize }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;

  const staticCanvas = document.createElement('canvas');
  staticCanvas.width = texSize;
  staticCanvas.height = texSize;
  const sctx = staticCanvas.getContext('2d') as CanvasRenderingContext2D;

  const snap = (v: number) => Math.round(v) + 0.5;
  const gridX = (i: number) => margin + (i * grid);
  const gridY = (i: number) => margin + (i * grid);
  const maxCell = Math.floor((texSize - (margin * 2)) / grid);

  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  const pathLength = (pts: Pt[]): number => {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
    return l;
  };

  const pointOnPath = (pts: Pt[], d: number): Pt => {
    if (pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1) return pts[0];
    let remain = d;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = dist(a, b);
      if (remain <= seg) {
        const t = seg <= 0.0001 ? 0 : remain / seg;
        return { x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t) };
      }
      remain -= seg;
    }
    return pts[pts.length - 1];
  };

  const drawPath = (target: CanvasRenderingContext2D, pts: Pt[], w: number, color: string): void => {
    if (pts.length < 2) return;
    target.beginPath();
    target.moveTo(snap(pts[0].x), snap(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      target.lineTo(snap(pts[i].x), snap(pts[i].y));
    }
    target.lineWidth = w;
    target.strokeStyle = color;
    target.lineJoin = 'round';
    target.lineCap = 'round';
    target.stroke();
  };

  const buildPath = (row: number, side: 'left' | 'right', idx: number): Pt[] => {
    const pts: Pt[] = [];
    const startY = Math.max(2, Math.min(maxCell - 2, row));
    let xCell = side === 'left' ? 0 : maxCell;
    let yCell = startY;
    pts.push({ x: gridX(xCell), y: gridY(yCell) });
    const steps = 22 + (idx % 14);
    for (let s = 0; s < steps; s++) {
      const horizontal = (s % 3) !== 1;
      if (horizontal) {
        const dir = side === 'left' ? 1 : -1;
        const span = 1 + ((s + idx) % 4);
        xCell = Math.max(1, Math.min(maxCell - 1, xCell + (dir * span)));
      } else {
        const vdir = (((s + idx) % 2) === 0) ? 1 : -1;
        const vspan = 1 + (((idx * 3) + s) % 2);
        yCell = Math.max(2, Math.min(maxCell - 2, yCell + (vdir * vspan)));
      }
      const next: Pt = { x: gridX(xCell), y: gridY(yCell) };
      const prev = pts[pts.length - 1];
      if (prev.x !== next.x || prev.y !== next.y) {
        pts.push(next);
      }
    }
    return pts;
  };

  // Build deterministic route network.
  for (let i = 0; i < 34; i++) {
    const row = 2 + ((i * 3) % (maxCell - 4));
    const side: 'left' | 'right' = (i % 2 === 0) ? 'left' : 'right';
    const pts = buildPath(row, side, i);
    const tone: Path['tone'] = (i % 6 === 0) ? 'violet' : ((i % 3 === 0) ? 'cyan' : 'blue');
    paths.push({
      pts,
      length: pathLength(pts),
      speed: 180 + ((i % 7) * 36),
      phase: i * 0.79,
      tone,
    });
  }

  // Static render (crisp).
  const baseGrad = sctx.createLinearGradient(0, 0, 0, texSize);
  baseGrad.addColorStop(0, 'rgba(2, 8, 24, 0.995)');
  baseGrad.addColorStop(0.42, 'rgba(4, 12, 34, 0.97)');
  baseGrad.addColorStop(0.82, 'rgba(6, 14, 38, 0.95)');
  baseGrad.addColorStop(1, 'rgba(4, 10, 28, 0.985)');
  sctx.fillStyle = baseGrad;
  sctx.fillRect(0, 0, texSize, texSize);

  // Floor-like chroma: blue center, violet edges.
  const centerBlue = sctx.createRadialGradient(texSize * 0.5, texSize * 0.45, texSize * 0.2, texSize * 0.5, texSize * 0.45, texSize * 0.72);
  centerBlue.addColorStop(0, 'rgba(56, 148, 255, 0.20)');
  centerBlue.addColorStop(0.55, 'rgba(34, 108, 214, 0.12)');
  centerBlue.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = centerBlue;
  sctx.fillRect(0, 0, texSize, texSize);

  const sideViolet = sctx.createLinearGradient(0, 0, texSize, 0);
  sideViolet.addColorStop(0, 'rgba(138, 96, 255, 0.22)');
  sideViolet.addColorStop(0.18, 'rgba(88, 64, 186, 0.10)');
  sideViolet.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  sideViolet.addColorStop(0.82, 'rgba(88, 64, 186, 0.10)');
  sideViolet.addColorStop(1, 'rgba(138, 96, 255, 0.22)');
  sctx.fillStyle = sideViolet;
  sctx.fillRect(0, 0, texSize, texSize);

  for (const p of paths) {
    drawPath(sctx, p.pts, 7.2, 'rgba(6, 14, 34, 0.98)');
  }
  for (const p of paths) {
    const color =
      p.tone === 'cyan' ? 'rgba(126, 246, 255, 0.86)'
        : p.tone === 'violet' ? 'rgba(174, 160, 255, 0.78)'
          : 'rgba(106, 208, 255, 0.84)';
    drawPath(sctx, p.pts, 4.0, color);
  }

  // Via nodes.
  for (const p of paths) {
    for (let i = 0; i < p.pts.length; i += 2) {
      const n = p.pts[i];
      sctx.beginPath();
      sctx.arc(snap(n.x), snap(n.y), 2.4, 0, Math.PI * 2);
      sctx.fillStyle = p.tone === 'violet' ? 'rgba(182, 170, 255, 0.68)' : 'rgba(126, 238, 255, 0.76)';
      sctx.fill();
    }
  }

  const fogGrad = sctx.createLinearGradient(0, texSize * 0.14, 0, texSize * 0.66);
  fogGrad.addColorStop(0, 'rgba(122, 230, 255, 0.12)');
  fogGrad.addColorStop(0.4, 'rgba(136, 152, 255, 0.07)');
  fogGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = fogGrad;
  sctx.fillRect(0, texSize * 0.14, texSize, texSize * 0.52);

  // Hard lower cut: clean separation from floor (no fuzzy blend).
  sctx.fillStyle = 'rgba(2, 8, 22, 0.995)';
  sctx.fillRect(0, texSize - 64, texSize, 64);

  const curtainMat = new StandardMaterial('neutral_reflection_curtain_mat', scene);
  curtainMat.disableLighting = true;
  curtainMat.backFaceCulling = false;
  curtainMat.diffuseColor = Color3.Black();
  curtainMat.specularColor = Color3.Black();
  curtainMat.diffuseTexture = texture;
  curtainMat.opacityTexture = texture;
  curtainMat.useAlphaFromDiffuseTexture = true;
  curtainMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  curtainMat.emissiveTexture = texture;
  curtainMat.emissiveColor = new Color3(0.56, 0.86, 0.99);

  const createCurtainInstance = (name: string, z: number): void => {
    const curtain = MeshBuilder.CreatePlane(
      name,
      { width: 1500, height: 250 },
      scene,
    );
    curtain.position.y = 60;
    curtain.position.z = z;
    curtain.isPickable = false;
    if (layerMask != null) {
      curtain.layerMask = layerMask;
    }
    // Face center.
    curtain.rotation.y = z > 0 ? Math.PI : 0;
    curtain.material = curtainMat;
  };

  // Create both sides to guarantee visibility regardless of camera orientation
  // in menu/codex-like scenes.
  createCurtainInstance('neutral_reflection_curtain_mesh_front', 330);
  createCurtainInstance('neutral_reflection_curtain_mesh_back', -330);

  texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  texture.anisotropicFilteringLevel = 1;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;

  let drift = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    drift += dt;

    // Rebuild dynamic frame from crisp static base + fast moving pulses.
    ctx.clearRect(0, 0, texSize, texSize);
    ctx.drawImage(staticCanvas, 0, 0);

    for (let pi = 0; pi < paths.length; pi++) {
      const p = paths[pi];
      if (p.length < 8) continue;

      const basePhase = ((drift * p.speed) + (p.phase * 210)) % p.length;
      const bursts = 2 + (pi % 2);
      for (let b = 0; b < bursts; b++) {
        const phaseShift = (b * p.length * 0.31) % p.length;
        const d = (basePhase + phaseShift) % p.length;
        const pos = pointOnPath(p.pts, d);
        const glowR = 10 + ((pi + b) % 4) * 1.8;
        const coreR = 2.8 + ((pi + b) % 3) * 0.4;
        const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowR);
        if (p.tone === 'violet') {
          g.addColorStop(0, 'rgba(210, 188, 255, 0.95)');
          g.addColorStop(0.35, 'rgba(166, 140, 255, 0.45)');
          g.addColorStop(1, 'rgba(80, 50, 130, 0)');
        } else if (p.tone === 'cyan') {
          g.addColorStop(0, 'rgba(194, 252, 255, 0.98)');
          g.addColorStop(0.35, 'rgba(112, 242, 255, 0.5)');
          g.addColorStop(1, 'rgba(40, 104, 140, 0)');
        } else {
          g.addColorStop(0, 'rgba(186, 230, 255, 0.95)');
          g.addColorStop(0.35, 'rgba(104, 200, 255, 0.46)');
          g.addColorStop(1, 'rgba(40, 94, 146, 0)');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = 'rgba(230, 255, 255, 0.95)';
        ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    texture.update(false);
    const pulseA = 0.9 + (Math.sin(drift * 2.4) * 0.08);
    const pulseB = 0.9 + (Math.sin((drift * 1.55) + 1.4) * 0.07);
    curtainMat.alpha = 0.9 * pulseA;
    const e = 0.44 + ((pulseA + pulseB) * 0.25);
    curtainMat.emissiveColor = new Color3(0.44 + (e * 0.28), 0.72 + (e * 0.3), 0.98);
  });
}

export function createSynthwaveGridBackground(
  scene: Scene,
  layerMask?: number,
  rotate180: boolean = false,
  mode: 'default' | 'neutralHub' = 'default',
): void {
  const baseMesh = MeshBuilder.CreateGround(
    'synthwave_base_bg',
    {
      width: 1400,
      height: 1400,
      subdivisions: 1,
    },
    scene
  );

  baseMesh.position = new Vector3(0, -16.0, 0);
  baseMesh.isPickable = false;
  if (layerMask != null) {
    baseMesh.layerMask = layerMask;
  }
  if (rotate180) {
    baseMesh.rotation.y = Math.PI;
  }

  const baseMaterial = new StandardMaterial('synthwave_base_mat', scene);
  baseMaterial.disableLighting = true;
  baseMaterial.diffuseColor = new Color3(0.01, 0.01, 0.025);
  baseMaterial.emissiveColor = new Color3(0.01, 0.02, 0.05);
  baseMaterial.specularColor = Color3.Black();
  baseMesh.material = baseMaterial;

  const perspectiveMesh = MeshBuilder.CreateGround(
    'synthwave_grid_perspective_bg',
    {
      width: 1400,
      height: 1400,
      subdivisions: 1,
    },
    scene
  );

  perspectiveMesh.position = new Vector3(0, -15.97, 0);
  perspectiveMesh.isPickable = false;
  if (layerMask != null) {
    perspectiveMesh.layerMask = layerMask;
  }
  if (rotate180) {
    perspectiveMesh.rotation.y = Math.PI;
  }

  const flowMesh = MeshBuilder.CreateGround(
    'synthwave_grid_flow_bg',
    {
      width: 1400,
      height: 1400,
      subdivisions: 1,
    },
    scene
  );

  flowMesh.position = new Vector3(0, -15.965, 0);
  flowMesh.isPickable = false;
  if (layerMask != null) {
    flowMesh.layerMask = layerMask;
  }
  if (rotate180) {
    flowMesh.rotation.y = Math.PI;
  }

  const perspectiveTextureSize = 2048;
  const perspectiveTexture = new DynamicTexture('synthwave_grid_perspective_texture', { width: perspectiveTextureSize, height: perspectiveTextureSize }, scene, true);
  perspectiveTexture.hasAlpha = true;
  const perspectiveCtx = perspectiveTexture.getContext() as unknown as CanvasRenderingContext2D;

  perspectiveCtx.clearRect(0, 0, perspectiveTextureSize, perspectiveTextureSize);

  const horizonY = perspectiveTextureSize * 0.08;
  const vanishingX = perspectiveTextureSize * 0.5;

  const horizonGlow = perspectiveCtx.createLinearGradient(0, 0, 0, horizonY + perspectiveTextureSize * 0.28);
  horizonGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
  horizonGlow.addColorStop(0.5, 'rgba(66, 110, 255, 0.12)');
  horizonGlow.addColorStop(1, 'rgba(169, 72, 255, 0.02)');
  perspectiveCtx.fillStyle = horizonGlow;
  perspectiveCtx.fillRect(0, 0, perspectiveTextureSize, horizonY + perspectiveTextureSize * 0.28);

  const gridLineCount = 96;

  const fixedLineGradient = perspectiveCtx.createLinearGradient(0, 0, perspectiveTextureSize, 0);
  fixedLineGradient.addColorStop(0, 'rgba(156, 124, 255, 1)');
  fixedLineGradient.addColorStop(0.47, 'rgba(156, 124, 255, 1)');
  fixedLineGradient.addColorStop(0.5, 'rgba(120, 210, 255, 1)');
  fixedLineGradient.addColorStop(0.53, 'rgba(156, 124, 255, 1)');
  fixedLineGradient.addColorStop(1, 'rgba(156, 124, 255, 1)');

  perspectiveCtx.strokeStyle = fixedLineGradient;
  perspectiveCtx.lineWidth = 1.35;
  for (let i = 0; i < gridLineCount; i++) {
    const t = i / (gridLineCount - 1);
    const x = Math.round(t * perspectiveTextureSize) + 0.5;
    perspectiveCtx.beginPath();
    perspectiveCtx.moveTo(x, horizonY);
    perspectiveCtx.lineTo(x, perspectiveTextureSize);
    perspectiveCtx.stroke();
  }

  // Fade near the horizon to avoid sub-pixel moiré shimmer on distant lines
  perspectiveCtx.save();
  perspectiveCtx.globalCompositeOperation = 'destination-in';
  const perspectiveFade = perspectiveCtx.createLinearGradient(0, horizonY, 0, perspectiveTextureSize);
  perspectiveFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  perspectiveFade.addColorStop(0.25, 'rgba(0, 0, 0, 0)');
  perspectiveFade.addColorStop(0.38, 'rgba(0, 0, 0, 0.65)');
  perspectiveFade.addColorStop(0.55, 'rgba(0, 0, 0, 1)');
  perspectiveFade.addColorStop(1, 'rgba(0, 0, 0, 1)');
  perspectiveCtx.fillStyle = perspectiveFade;
  perspectiveCtx.fillRect(0, horizonY, perspectiveTextureSize, perspectiveTextureSize - horizonY);
  perspectiveCtx.restore();

  perspectiveTexture.update(false);
  perspectiveTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  perspectiveTexture.anisotropicFilteringLevel = 8;
  perspectiveTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
  perspectiveTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
  perspectiveTexture.uScale = 1;
  perspectiveTexture.vScale = 1;

  const perspectiveMaterial = new StandardMaterial('synthwave_grid_perspective_mat', scene);
  perspectiveMaterial.disableLighting = true;
  perspectiveMaterial.diffuseColor = Color3.Black();
  perspectiveMaterial.specularColor = Color3.Black();
  perspectiveMaterial.diffuseTexture = perspectiveTexture;
  perspectiveMaterial.opacityTexture = perspectiveTexture;
  perspectiveMaterial.useAlphaFromDiffuseTexture = true;
  perspectiveMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
  perspectiveMaterial.emissiveTexture = perspectiveTexture;
  perspectiveMaterial.emissiveColor = new Color3(0.78, 0.9, 1.0);
  perspectiveMesh.material = perspectiveMaterial;

  const flowTextureSize = 2048;
  const flowTexture = new DynamicTexture('synthwave_grid_flow_texture', { width: flowTextureSize, height: flowTextureSize }, scene, true);
  flowTexture.hasAlpha = true;
  const flowCtx = flowTexture.getContext() as unknown as CanvasRenderingContext2D;
  flowCtx.clearRect(0, 0, flowTextureSize, flowTextureSize);

  const flowLineCount = gridLineCount;
  const flowHorizontalGradient = flowCtx.createLinearGradient(0, 0, flowTextureSize, 0);
  flowHorizontalGradient.addColorStop(0, 'rgba(156, 124, 255, 1)');
  flowHorizontalGradient.addColorStop(0.47, 'rgba(156, 124, 255, 1)');
  flowHorizontalGradient.addColorStop(0.5, 'rgba(120, 210, 255, 1)');
  flowHorizontalGradient.addColorStop(0.53, 'rgba(156, 124, 255, 1)');
  flowHorizontalGradient.addColorStop(1, 'rgba(156, 124, 255, 1)');
  flowCtx.lineWidth = 1.35;
  for (let i = 0; i < flowLineCount; i++) {
    const t = i / (flowLineCount - 1);
    const y = Math.round(t * flowTextureSize) + 0.5;
    flowCtx.strokeStyle = flowHorizontalGradient;
    flowCtx.globalAlpha = 1;
    flowCtx.beginPath();
    flowCtx.moveTo(0, y);
    flowCtx.lineTo(flowTextureSize, y);
    flowCtx.stroke();
  }
  flowCtx.globalAlpha = 1;

  flowTexture.update(false);
  flowTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  flowTexture.anisotropicFilteringLevel = 8;
  flowTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  flowTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  flowTexture.uScale = 1;
  flowTexture.vScale = 1;

  // Create a separate static opacity texture for the horizon fade.
  // This avoids baking transparency into the scrolling grid, giving a seamless infinte scroll.
  const fadeTextureSize = 512;
  const fadeTexture = new DynamicTexture('synthwave_grid_fade_texture', { width: fadeTextureSize, height: fadeTextureSize }, scene, true);
  fadeTexture.hasAlpha = true;
  const fadeCtx = fadeTexture.getContext() as unknown as CanvasRenderingContext2D;
  fadeCtx.clearRect(0, 0, fadeTextureSize, fadeTextureSize);

  const fadeHorizonY = fadeTextureSize * 0.08;
  const fadeGradient = fadeCtx.createLinearGradient(0, fadeHorizonY, 0, fadeTextureSize);
  fadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  fadeGradient.addColorStop(0.25, 'rgba(255, 255, 255, 0)');
  fadeGradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.65)');
  fadeGradient.addColorStop(0.55, 'rgba(255, 255, 255, 1)');
  fadeGradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
  fadeCtx.fillStyle = fadeGradient;
  fadeCtx.fillRect(0, fadeHorizonY, fadeTextureSize, fadeTextureSize - fadeHorizonY);
  fadeTexture.update(false);
  
  fadeTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
  fadeTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const flowMaterial = new StandardMaterial('synthwave_grid_flow_mat', scene);
  flowMaterial.disableLighting = true;
  flowMaterial.diffuseColor = Color3.Black();
  flowMaterial.specularColor = Color3.Black();
  flowMaterial.diffuseTexture = flowTexture;
  flowMaterial.opacityTexture = fadeTexture;
  flowMaterial.useAlphaFromDiffuseTexture = false;
  flowMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
  flowMaterial.emissiveTexture = flowTexture;
  flowMaterial.emissiveColor = new Color3(0.78, 0.9, 1.0);
  flowMesh.material = flowMaterial;

  let scrollV = 0;
  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
    scrollV -= deltaSeconds * 0.005;
    flowTexture.vOffset = scrollV;
  });

  if (mode === 'neutralHub') {
    createNeutralReflectionCurtain(scene, layerMask, rotate180);
  }
}
