/**
 * PostProcess - Manages visual effects pipeline
 * Pixelation, chromatic aberration, CRT/scanlines, glow
 */

import { Scene, Camera, DefaultRenderingPipeline, Color4, Engine, PostProcess, Effect, Observer } from '@babylonjs/core';
import { EventBus, GameEvents } from '../core/EventBus';

interface UiOptionChangedPayload {
  option?: string;
  value?: boolean | number;
}

export interface PostProcessingConfig {
  enabled: boolean;
  pixelScale: number;
  glowIntensity: number;
  chromaticAmount: number;
  chromaticRadial: number;
  grainEnabled: boolean;
  grainIntensity: number;
  grainAnimated: boolean;
  crtLinesEnabled: boolean;
  crtLineIntensity: number;
  vignetteEnabled: boolean;
  vignetteWeight: number;
  vignetteColor: [number, number, number, number];
}

export class PostProcessManager {
  private scene: Scene;
  private engine: Engine;
  private pipeline?: DefaultRenderingPipeline;
  private pixelate?: PostProcess;
  private crtLines?: PostProcess;
  private camera?: Camera;
  private eventBus: EventBus;
  private unsubscribeOptions: (() => void) | null = null;
  private unsubscribePlayerDamaged: (() => void) | null = null;
  private beforeRenderObserver: Observer<Scene> | null = null;
  private damageFxTimer: number = 0;
  private readonly damageFxDuration: number = 0.5;
  private damageShakeTimer: number = 0;
  private readonly damageShakeDuration: number = 0.11;
  private damageShakeOffset = { x: 0, y: 0, z: 0 };
  private config: PostProcessingConfig = {
    enabled: true,
    pixelScale: 1.6,
    glowIntensity: 0.8,
    chromaticAmount: 30,
    chromaticRadial: 0.8,
    grainEnabled: false,
    grainIntensity: 0,
    grainAnimated: false,
    crtLinesEnabled: true,
    crtLineIntensity: 0.35,
    vignetteEnabled: true,
    vignetteWeight: 4.0,
    vignetteColor: [0, 0, 0, 1],
  };

  constructor(scene: Scene, engine: Engine) {
    this.scene = scene;
    this.engine = engine;
    this.eventBus = EventBus.getInstance();
    this.bindEvents();
    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.updateDamageFx();
    });
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

    if (this.pipeline.imageProcessing) {
      this.pipeline.imageProcessingEnabled = true;
      this.pipeline.imageProcessing.contrast = 1.08;
      this.pipeline.imageProcessing.exposure = 1.08;
      this.pipeline.imageProcessing.vignetteEnabled = this.config.vignetteEnabled;
      this.pipeline.imageProcessing.vignetteWeight = this.config.vignetteWeight;
      const [r, g, b, a] = this.config.vignetteColor;
      this.pipeline.imageProcessing.vignetteColor = new Color4(r, g, b, a);
    }

    this.pipeline.chromaticAberrationEnabled = true;
    if (this.pipeline.chromaticAberration) {
      this.pipeline.chromaticAberration.aberrationAmount = this.config.chromaticAmount;
      this.pipeline.chromaticAberration.radialIntensity = this.config.chromaticRadial;
    }

    this.pipeline.grainEnabled = this.config.grainEnabled && this.config.grainIntensity > 0;
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

    if (this.config.crtLinesEnabled) {
      this.ensureCrtLines();
    } else {
      this.disposeCrtLines();
    }
    this.applyDamageFxToPipeline();
  }

  private bindEvents(): void {
    if (this.unsubscribeOptions) return;
    this.unsubscribeOptions = this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data: UiOptionChangedPayload) => {
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
        case 'postProcessingGrainEnabled':
          this.applyConfig({ ...this.config, grainEnabled: !!data.value });
          break;
        case 'postProcessingGrainAnimated':
          this.applyConfig({ ...this.config, grainAnimated: !!data.value });
          break;
        case 'postProcessingCrtLinesEnabled':
          this.applyConfig({ ...this.config, crtLinesEnabled: !!data.value });
          break;
        case 'postProcessingVignette':
          this.applyConfig({ ...this.config, vignetteEnabled: !!data.value });
          break;
        case 'postProcessingVignetteWeight':
          this.applyConfig({ ...this.config, vignetteWeight: Number(data.value) });
          break;
      }
    });

    this.unsubscribePlayerDamaged = this.eventBus.on(GameEvents.PLAYER_DAMAGED, (data: { damage?: number }) => {
      if ((data?.damage ?? 0) > 0) {
        this.damageFxTimer = this.damageFxDuration;
        this.damageShakeTimer = this.damageShakeDuration;
        this.applyDamageFxToPipeline();
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
    this.disposeCrtLines();
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

  private ensureCrtLines(): void {
    if (!this.camera) return;

    if (!Effect.ShadersStore['crtLinesFragmentShader']) {
      Effect.ShadersStore['crtLinesFragmentShader'] = `
        precision highp float;
        varying vec2 vUV;
        uniform sampler2D textureSampler;
        uniform float screenHeight;
        uniform float lineStrength;

        void main(void) {
          vec4 color = texture2D(textureSampler, vUV);
          float phase = sin(vUV.y * screenHeight * 3.14159265);
          float scanline = 0.75 + 0.25 * phase;
          float multiplier = mix(1.0, scanline, clamp(lineStrength, 0.0, 1.0));
          color.rgb *= multiplier;
          gl_FragColor = color;
        }
      `;
    }

    if (!this.crtLines) {
      this.crtLines = new PostProcess('crtLines', 'crtLines', ['screenHeight', 'lineStrength'], null, 1.0, this.camera);
      this.crtLines.onApply = (effect) => {
        effect.setFloat('screenHeight', this.engine.getRenderHeight());
        effect.setFloat('lineStrength', this.clamp(this.config.crtLineIntensity, 0, 1));
      };
    }
  }

  private disposeCrtLines(): void {
    if (this.crtLines) {
      this.crtLines.dispose();
      this.crtLines = undefined;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private updateDamageFx(): void {
    this.updateDamageCameraShake();
    if (this.damageFxTimer <= 0) return;
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    if (dt <= 0) return;
    this.damageFxTimer = Math.max(0, this.damageFxTimer - dt);
    this.applyDamageFxToPipeline();
  }

  private applyDamageFxToPipeline(): void {
    if (!this.pipeline) return;
    const fxAlpha = this.damageFxDuration > 0
      ? this.clamp(this.damageFxTimer / this.damageFxDuration, 0, 1)
      : 0;
    const pulse = fxAlpha > 0 ? Math.sin((1 - fxAlpha) * Math.PI) : 0;
    const hitEnvelope = Math.pow(fxAlpha, 0.5) * (0.9 + (0.5 * pulse));

    if (this.pipeline.chromaticAberration) {
      this.pipeline.chromaticAberration.aberrationAmount = this.config.chromaticAmount + (900 * hitEnvelope);
      this.pipeline.chromaticAberration.radialIntensity = this.config.chromaticRadial + (14.0 * hitEnvelope);
      const aberration = this.pipeline.chromaticAberration as any;
      if (aberration.direction) {
        aberration.direction.x = 1;
        aberration.direction.y = 0.25;
      }
      if (aberration.centerPosition) {
        aberration.centerPosition.x = 0.5;
        aberration.centerPosition.y = 0.5;
      }
    }

    if (this.pipeline.imageProcessing) {
      this.pipeline.imageProcessing.vignetteEnabled = true;
      this.pipeline.imageProcessing.vignetteWeight = this.config.vignetteWeight + (5.0 * hitEnvelope);
      this.pipeline.imageProcessing.vignetteColor = new Color4(
        0.55 * hitEnvelope,
        0.02 * hitEnvelope,
        0.04 * hitEnvelope,
        1
      );
    }
  }

  private updateDamageCameraShake(): void {
    if (!this.camera || !(this.camera as any).position) {
      return;
    }
    const cam = this.camera as any;
    cam.position.x -= this.damageShakeOffset.x;
    cam.position.y -= this.damageShakeOffset.y;
    cam.position.z -= this.damageShakeOffset.z;
    this.damageShakeOffset.x = 0;
    this.damageShakeOffset.y = 0;
    this.damageShakeOffset.z = 0;

    if (this.damageShakeTimer <= 0) return;

    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.damageShakeTimer = Math.max(0, this.damageShakeTimer - Math.max(0, dt));
    const t = this.damageShakeDuration > 0 ? this.damageShakeTimer / this.damageShakeDuration : 0;
    const amp = 0.055 * Math.pow(t, 0.45);
    this.damageShakeOffset.x = (Math.random() * 2 - 1) * amp;
    this.damageShakeOffset.y = (Math.random() * 2 - 1) * amp * 0.65;
    this.damageShakeOffset.z = (Math.random() * 2 - 1) * amp * 0.45;
    cam.position.x += this.damageShakeOffset.x;
    cam.position.y += this.damageShakeOffset.y;
    cam.position.z += this.damageShakeOffset.z;
  }

  private resetDamageCameraShake(): void {
    if (!this.camera || !(this.camera as any).position) return;
    const cam = this.camera as any;
    cam.position.x -= this.damageShakeOffset.x;
    cam.position.y -= this.damageShakeOffset.y;
    cam.position.z -= this.damageShakeOffset.z;
    this.damageShakeOffset.x = 0;
    this.damageShakeOffset.y = 0;
    this.damageShakeOffset.z = 0;
    this.damageShakeTimer = 0;
  }

  getPipeline(): DefaultRenderingPipeline | undefined {
    return this.pipeline;
  }

  dispose(): void {
    this.resetDamageCameraShake();
    this.disablePipeline();
    if (this.beforeRenderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
      this.beforeRenderObserver = null;
    }
    if (this.unsubscribeOptions) {
      this.unsubscribeOptions();
      this.unsubscribeOptions = null;
    }
    if (this.unsubscribePlayerDamaged) {
      this.unsubscribePlayerDamaged();
      this.unsubscribePlayerDamaged = null;
    }
  }
}
