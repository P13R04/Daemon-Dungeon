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

export function createSynthwaveGridBackground(scene: Scene, layerMask?: number): void {
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
  perspectiveFade.addColorStop(0.12, 'rgba(0, 0, 0, 0.72)');
  perspectiveFade.addColorStop(0.28, 'rgba(0, 0, 0, 1)');
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

  // Same horizon fade for the scrolling layer to keep both grids visually stable
  flowCtx.save();
  flowCtx.globalCompositeOperation = 'destination-in';
  const flowFade = flowCtx.createLinearGradient(0, horizonY, 0, flowTextureSize);
  flowFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  flowFade.addColorStop(0.1, 'rgba(0, 0, 0, 0.68)');
  flowFade.addColorStop(0.26, 'rgba(0, 0, 0, 1)');
  flowFade.addColorStop(1, 'rgba(0, 0, 0, 1)');
  flowCtx.fillStyle = flowFade;
  flowCtx.fillRect(0, horizonY, flowTextureSize, flowTextureSize - horizonY);
  flowCtx.restore();

  flowTexture.update(false);
  flowTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  flowTexture.anisotropicFilteringLevel = 8;
  flowTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  flowTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  flowTexture.uScale = 1;
  flowTexture.vScale = 1;

  const flowMaterial = new StandardMaterial('synthwave_grid_flow_mat', scene);
  flowMaterial.disableLighting = true;
  flowMaterial.diffuseColor = Color3.Black();
  flowMaterial.specularColor = Color3.Black();
  flowMaterial.diffuseTexture = flowTexture;
  flowMaterial.opacityTexture = flowTexture;
  flowMaterial.useAlphaFromDiffuseTexture = true;
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
