/**
 * PostProcess - Manages visual effects pipeline
 * Pixelation, chromatic aberration, CRT/scanlines, glow
 */

import { Scene, Camera, DefaultRenderingPipeline, Color4, Engine, PostProcess, Effect } from '@babylonjs/core';
import { EventBus, GameEvents } from '../core/EventBus';

interface PostProcessingConfig {
  enabled: boolean;
  pixelScale: number;
  glowIntensity: number;
  chromaticAmount: number;
  chromaticRadial: number;
  grainIntensity: number;
  grainAnimated: boolean;
  vignetteEnabled: boolean;
  vignetteWeight: number;
  vignetteColor: [number, number, number, number];
}

export class PostProcessManager {
  private scene: Scene;
  private engine: Engine;
  private pipeline?: DefaultRenderingPipeline;
  private pixelate?: PostProcess;
  private camera?: Camera;
  private eventBus: EventBus;
  private config: PostProcessingConfig = {
    enabled: true,
    pixelScale: 1.6,
    glowIntensity: 0.8,
    chromaticAmount: 30,
    chromaticRadial: 0.8,
    grainIntensity: 12,
    grainAnimated: true,
    vignetteEnabled: true,
    vignetteWeight: 4.0,
    vignetteColor: [0, 0, 0, 1],
  };

  constructor(scene: Scene, engine: Engine) {
    this.scene = scene;
    this.engine = engine;
    this.eventBus = EventBus.getInstance();
    this.bindEvents();
  }

  setupPipeline(camera: Camera, config?: Partial<PostProcessingConfig>): void {
    this.camera = camera;
    if (config) {
      this.config = { ...this.config, ...config };
    }
    if (this.config.enabled) {
      this.createPipeline();
      this.applyConfig(this.config);
    } else {
      this.disablePipeline();
    }
  }

  applyConfig(config: PostProcessingConfig): void {
    this.config = { ...this.config, ...config };
    if (!this.pipeline) return;

    const enabled = !!this.config.enabled;
    if (!enabled) {
      this.disablePipeline();
      return;
    }

    if (!this.pipeline) {
      this.createPipeline();
    }
    if (!this.pipeline) return;

    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.contrast = 1.15;
    this.pipeline.imageProcessing.exposure = 1.0;
    this.pipeline.imageProcessing.vignetteEnabled = this.config.vignetteEnabled;
    this.pipeline.imageProcessing.vignetteWeight = this.config.vignetteWeight;
    const [r, g, b, a] = this.config.vignetteColor;
    this.pipeline.imageProcessing.vignetteColor = new Color4(r, g, b, a);

    this.pipeline.chromaticAberrationEnabled = true;
    if (this.pipeline.chromaticAberration) {
      this.pipeline.chromaticAberration.aberrationAmount = this.config.chromaticAmount;
      this.pipeline.chromaticAberration.radialIntensity = this.config.chromaticRadial;
    }

    this.pipeline.grainEnabled = this.config.grainIntensity > 0;
    if (this.pipeline.grain) {
      this.pipeline.grain.intensity = this.config.grainIntensity;
      this.pipeline.grain.animated = this.config.grainAnimated;
    }

    this.pipeline.glowLayerEnabled = true;
    if (this.pipeline.glowLayer) {
      this.pipeline.glowLayer.intensity = this.config.glowIntensity;
    }

    this.pipeline.fxaaEnabled = false;

    if (this.config.pixelScale > 1.0) {
      this.ensurePixelate();
    } else {
      this.disposePixelate();
    }
  }

  private bindEvents(): void {
    this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data) => {
      if (!data?.option) return;
      switch (data.option) {
        case 'postProcessingEnabled':
          this.config.enabled = !!data.value;
          if (this.config.enabled) {
            this.createPipeline();
            this.applyConfig({ ...this.config });
          } else {
            this.disablePipeline();
          }
          break;
        case 'postProcessingPixelScale':
          this.applyConfig({ ...this.config, pixelScale: Number(data.value) });
          break;
        case 'postProcessingGlow':
          this.applyConfig({ ...this.config, glowIntensity: Number(data.value) });
          break;
        case 'postProcessingChromatic':
          this.applyConfig({ ...this.config, chromaticAmount: Number(data.value) });
          break;
        case 'postProcessingChromaticRadial':
          this.applyConfig({ ...this.config, chromaticRadial: Number(data.value) });
          break;
        case 'postProcessingGrain':
          this.applyConfig({ ...this.config, grainIntensity: Number(data.value) });
          break;
        case 'postProcessingGrainAnimated':
          this.applyConfig({ ...this.config, grainAnimated: !!data.value });
          break;
        case 'postProcessingVignette':
          this.applyConfig({ ...this.config, vignetteEnabled: !!data.value });
          break;
        case 'postProcessingVignetteWeight':
          this.applyConfig({ ...this.config, vignetteWeight: Number(data.value) });
          break;
      }
    });
  }

  private createPipeline(): void {
    if (this.pipeline || !this.camera) return;
    this.pipeline = new DefaultRenderingPipeline(
      'defaultPipeline',
      true,
      this.scene,
      [this.camera]
    );
    this.pipeline.fxaaEnabled = false;
  }

  private disablePipeline(): void {
    if (this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = undefined;
    }
    this.disposePixelate();
  }

  private ensurePixelate(): void {
    if (!this.camera) return;

    if (!Effect.ShadersStore['pixelateFragmentShader']) {
      Effect.ShadersStore['pixelateFragmentShader'] = `
        precision highp float;
        varying vec2 vUV;
        uniform sampler2D textureSampler;
        uniform vec2 pixelSize;
        void main(void) {
          vec2 coord = vec2(
            pixelSize.x * floor(vUV.x / pixelSize.x),
            pixelSize.y * floor(vUV.y / pixelSize.y)
          );
          gl_FragColor = texture2D(textureSampler, coord);
        }
      `;
    }

    if (!this.pixelate) {
      this.pixelate = new PostProcess('pixelate', 'pixelate', ['pixelSize'], null, 1.0, this.camera);
      this.pixelate.onApply = (effect) => {
        const width = this.engine.getRenderWidth();
        const height = this.engine.getRenderHeight();
        const scale = this.clamp(this.config.pixelScale, 1, 6);
        effect.setFloat2('pixelSize', scale / width, scale / height);
      };
    }
  }

  private disposePixelate(): void {
    if (this.pixelate) {
      this.pixelate.dispose();
      this.pixelate = undefined;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  getPipeline(): DefaultRenderingPipeline | undefined {
    return this.pipeline;
  }
}
