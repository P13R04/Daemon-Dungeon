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

export function createSynthwaveGridBackground(scene: Scene, layerMask?: number, rotate180: boolean = false): void {
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
}
