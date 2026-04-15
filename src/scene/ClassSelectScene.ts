import {
  Scene,
  Engine,
  ArcRotateCamera,
  FreeCamera,
  Vector3,
  HemisphericLight,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  SceneLoader,
  Scalar,
  AbstractMesh,
  AnimationGroup,
  Sound,
  ParticleSystem,
  DynamicTexture,
  PointerEventTypes,
  Observer,
  PointerInfo,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { PostProcessManager, PostProcessingConfig } from './PostProcess';
import { ClassSelectDevConsole } from './ClassSelectDevConsole';
import { createSynthwaveGridBackground } from './SynthwaveBackground';
import { GameSettingsStore } from '../settings/GameSettings';

interface ClassCarouselItem {
  id: 'mage' | 'firewall' | 'rogue';
  label: string;
  playable: boolean;
  root: TransformNode;
}

interface RoguePreviewTuning {
  offsetX: number;
  offsetZ: number;
  targetHeight: number;
  targetFootprint: number;
  selectedScaleMultiplier: number;
}

interface TankVisualTuning {
  height: number;
  lateral: number;
  depth: number;
  size: number;
}

export class ClassSelectScene {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private camera!: ArcRotateCamera;
  private items: ClassCarouselItem[] = [];
  private selectedIndex: number = 0;
  private carouselRotation: number = 0;
  private targetRotation: number = 0;
  private readonly radius: number = 4.8;
  private readonly rotationSpeed: number = 10;
  private infoText: TextBlock;
  private startButton: Button;
  private keyHandler!: (event: KeyboardEvent) => void;
  private pointerObserver?: Observer<PointerInfo>;
  private mageIdleGroup: AnimationGroup | null = null;
  private mageUltimateGroup: AnimationGroup | null = null;
  private tankIdleGroup: AnimationGroup | null = null;
  private rogueTake001Group: AnimationGroup | null = null;
  private rogueSelectSound: Sound | null = null;
  private rogueSelectionTimeoutId: number | null = null;
  private rogueSelectionPlayToken: number = 0;
  private tankThrusterParticles: ParticleSystem[] = [];
  private tankThrusterTextures: DynamicTexture[] = [];
  private tankThrusterAnchors: TransformNode[] = [];
  private tankVisualTuning: TankVisualTuning = {
    height: 0.57,
    lateral: 0.13,
    depth: -1.48,
    size: 0.7,
  };
  private rogueModelContainer: TransformNode | null = null;
  private rogueRawBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  } | null = null;
  private roguePreviewTuning: RoguePreviewTuning = {
    offsetX: -14,
    offsetZ: -7.55,
    targetHeight: 3.4,
    targetFootprint: 2.2,
    selectedScaleMultiplier: 1.65,
  };
  private postProcessManager: PostProcessManager;
  private devConsole: ClassSelectDevConsole;
  private postProcessConfig: PostProcessingConfig;
  private isNavigatingBack: boolean = false;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(
    private engine: Engine,
    private onStartClass: (classId: 'mage' | 'firewall' | 'rogue') => void,
    private onBackToTitle: () => void,
    postProcessingConfig?: Partial<PostProcessingConfig>
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.06, 1);

    this.postProcessConfig = {
      enabled: true,
      pixelScale: 1.6,
      glowIntensity: 0.8,
      chromaticAmount: 30,
      chromaticRadial: 0.8,
      grainEnabled: true,
      grainIntensity: 12,
      grainAnimated: true,
      crtLinesEnabled: true,
      crtLineIntensity: 0.35,
      vignetteEnabled: true,
      vignetteWeight: 4.0,
      vignetteColor: [0, 0, 0, 1],
      ...postProcessingConfig,
    };

    this.setupCameraAndLights();
    this.postProcessManager = new PostProcessManager(this.scene, this.engine);
    this.postProcessManager.setupPipeline(this.camera, this.postProcessConfig);

    this.createEnvironment();
    this.loadRogueSelectionSound();
    this.applyAudioSettingsFromStore();
    this.unsubscribeSettings = GameSettingsStore.subscribe(() => {
      this.applyAudioSettingsFromStore();
    });

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('ClassSelectUI', true, this.scene);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    const { infoText, startButton } = this.createUi();
    this.infoText = infoText;
    this.startButton = startButton;

    this.createCarouselItems();
    this.attachKeyboard();
    this.attachPointerSelection();
    this.refreshSelectionUi();
    this.updateCarouselLayout();

    this.devConsole = new ClassSelectDevConsole(
      this.scene,
      this.gui,
      this.camera,
      this.postProcessManager,
      this.postProcessConfig
    );
  }

  getScene(): Scene {
    return this.scene;
  }

  update(deltaTime: number): void {
    const lerpAmount = Math.min(1, deltaTime * this.rotationSpeed);
    this.carouselRotation = Scalar.Lerp(this.carouselRotation, this.targetRotation, lerpAmount);
    this.updateCarouselLayout();
  }

  dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }
    window.removeEventListener('keydown', this.keyHandler);
    this.clearRogueSelectionTimer();
    if (this.rogueSelectSound) {
      this.rogueSelectSound.dispose();
      this.rogueSelectSound = null;
    }
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = undefined;
    }
    this.devConsole.dispose();
    for (const ps of this.tankThrusterParticles) {
      ps.stop();
      ps.dispose();
    }
    this.tankThrusterParticles = [];
    for (const tex of this.tankThrusterTextures) {
      tex.dispose();
    }
    this.tankThrusterTextures = [];
    for (const anchor of this.tankThrusterAnchors) {
      anchor.dispose();
    }
    this.tankThrusterAnchors = [];
    this.gui.dispose();
    this.scene.dispose();
  }

  private setupCameraAndLights(): void {
    const camera = new ArcRotateCamera('classSelectCamera', Math.PI / 2, 1.15, 11.5, new Vector3(0, 1.3, 0), this.scene);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 14;
    camera.wheelPrecision = 0;
    camera.inputs.clear();
    camera.layerMask = SCENE_LAYER;

    const uiCamera = new FreeCamera('classSelectUiCamera', new Vector3(0, 0, -10), this.scene) as FreeCamera & { clear: boolean };
    uiCamera.layerMask = UI_LAYER;
    uiCamera.clear = false;

    this.scene.activeCameras = [camera, uiCamera];
    this.scene.activeCamera = camera;
    this.camera = camera;

    const lightTop = new HemisphericLight('classSelectLightTop', new Vector3(0, 1, 0), this.scene);
    lightTop.intensity = 0.85;

    const lightFront = new HemisphericLight('classSelectLightFront', new Vector3(0.6, 0.3, 1), this.scene);
    lightFront.intensity = 0.55;
  }

  private createEnvironment(): void {
    createSynthwaveGridBackground(this.scene, SCENE_LAYER);
  }

  private loadRogueSelectionSound(): void {
    this.rogueSelectSound = new Sound(
      'classSelectRogueSfx',
      'sfx/oiia-oiia-sound.mp3',
      this.scene,
      undefined,
      {
        autoplay: false,
        loop: false,
        volume: 0.9 * GameSettingsStore.getEffectiveVolume('sfx'),
      }
    );
  }

  private applyAudioSettingsFromStore(): void {
    if (this.rogueSelectSound) {
      this.rogueSelectSound.setVolume(0.9 * GameSettingsStore.getEffectiveVolume('sfx'));
    }
  }

  private createUi(): { infoText: TextBlock; startButton: Button } {
    const backBtn = Button.CreateSimpleButton('classSelectBackTopLeft', 'BACK');
    backBtn.width = '96px';
    backBtn.height = '36px';
    backBtn.color = '#B8FFE6';
    backBtn.cornerRadius = 4;
    backBtn.background = 'rgba(20,30,35,0.9)';
    backBtn.thickness = 1;
    backBtn.left = '20px';
    backBtn.top = '20px';
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    backBtn.isPointerBlocker = true;
    backBtn.zIndex = 1300;
    backBtn.onPointerClickObservable.add(() => {
      this.navigateBackToTitle();
    });
    backBtn.onPointerUpObservable.add(() => {
      this.navigateBackToTitle();
    });
    this.gui.addControl(backBtn);

    const title = new TextBlock('classSelectTitle');
    title.text = 'SELECT CLASS';
    title.color = '#7CFFEA';
    title.fontSize = 44;
    title.fontFamily = 'Consolas';
    title.top = '-42%';
    this.gui.addControl(title);

    const subtitle = new TextBlock('classSelectSubtitle');
    subtitle.text = 'LEFT / RIGHT • Q/D • A/D';
    subtitle.color = '#9FEFE1';
    subtitle.fontSize = 16;
    subtitle.fontFamily = 'Consolas';
    subtitle.top = '-36%';
    this.gui.addControl(subtitle);

    const infoPanel = new Rectangle('classSelectInfoPanel');
    infoPanel.width = '560px';
    infoPanel.height = '120px';
    infoPanel.thickness = 1;
    infoPanel.cornerRadius = 8;
    infoPanel.color = '#2EF9C3';
    infoPanel.background = 'rgba(0,0,0,0.45)';
    infoPanel.top = '34%';
    this.gui.addControl(infoPanel);

    const infoText = new TextBlock('classSelectInfoText');
    infoText.fontSize = 20;
    infoText.fontFamily = 'Consolas';
    infoText.color = '#FFFFFF';
    infoText.top = '-28px';
    infoPanel.addControl(infoText);

    const leftBtn = Button.CreateSimpleButton('classSelectLeft', '<');
    leftBtn.width = '70px';
    leftBtn.height = '52px';
    leftBtn.color = '#B8FFE6';
    leftBtn.background = 'rgba(20,30,35,0.95)';
    leftBtn.thickness = 1;
    leftBtn.cornerRadius = 6;
    leftBtn.left = '-210px';
    leftBtn.top = '22px';
    leftBtn.onPointerUpObservable.add(() => this.rotateCarousel(1));
    infoPanel.addControl(leftBtn);

    const rightBtn = Button.CreateSimpleButton('classSelectRight', '>');
    rightBtn.width = '70px';
    rightBtn.height = '52px';
    rightBtn.color = '#B8FFE6';
    rightBtn.background = 'rgba(20,30,35,0.95)';
    rightBtn.thickness = 1;
    rightBtn.cornerRadius = 6;
    rightBtn.left = '210px';
    rightBtn.top = '22px';
    rightBtn.onPointerUpObservable.add(() => this.rotateCarousel(-1));
    infoPanel.addControl(rightBtn);

    const startButton = Button.CreateSimpleButton('classSelectStart', 'START AS MAGE');
    startButton.width = '260px';
    startButton.height = '46px';
    startButton.color = '#FFFFFF';
    startButton.cornerRadius = 6;
    startButton.background = '#1D3B3A';
    startButton.thickness = 2;
    startButton.top = '22px';
    startButton.onPointerUpObservable.add(() => {
      this.tryStartSelectedClass();
    });
    infoPanel.addControl(startButton);

    return { infoText, startButton };
  }

  private createCarouselItems(): void {
    const mageRoot = new TransformNode('classMageRoot', this.scene);
    this.items.push({ id: 'mage', label: 'MAGE', playable: true, root: mageRoot });
    this.loadMageModelInto(mageRoot).catch((error) => {
      console.warn('Mage model load failed in class select, using placeholder:', error);
      this.createCylinderPlaceholder(mageRoot, new Color3(0.2, 0.45, 1.0), 2.3, 0.8, 'MAGE');
    });

    const firewallRoot = new TransformNode('classFirewallRoot', this.scene);
    this.items.push({ id: 'firewall', label: 'FIREWALL', playable: true, root: firewallRoot });
    this.loadTankModelInto(firewallRoot).catch((error) => {
      console.warn('Tank model load failed in class select, using placeholder:', error);
      this.createCylinderPlaceholder(firewallRoot, new Color3(1.0, 0.45, 0.25), 2.8, 1.2, 'FIREWALL');
    });

    const rogueRoot = new TransformNode('classRogueRoot', this.scene);
    this.loadRogueModelInto(rogueRoot).catch((error) => {
      console.warn('Rogue model load failed in class select, using placeholder:', error);
      this.createCylinderPlaceholder(rogueRoot, new Color3(0.6, 0.9, 0.35), 2.4, 0.9, 'ROGUE');
    });
    this.items.push({ id: 'rogue', label: 'ROGUE', playable: true, root: rogueRoot });
  }

  private async loadMageModelInto(root: TransformNode): Promise<void> {
    const result = await SceneLoader.ImportMeshAsync('', 'models/player/', 'mage.glb', this.scene);

    const candidateRoot = result.meshes[0];
    if (candidateRoot) {
      candidateRoot.parent = root;
      const bounds = candidateRoot.getHierarchyBoundingVectors(true);
      const currentHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
      const targetHeight = 2.4;
      const modelScale = targetHeight / currentHeight;
      candidateRoot.scaling.scaleInPlace(modelScale);
      candidateRoot.position = Vector3.Zero();
      candidateRoot.rotation.y = 0;
    }

    for (const mesh of result.meshes) {
      if (mesh !== candidateRoot && mesh.parent === null) {
        mesh.parent = root;
      }
      mesh.layerMask = SCENE_LAYER;
    }

    this.mageIdleGroup = result.animationGroups.find((group) => group.name === 'Idle.001') ?? null;
    this.mageUltimateGroup = result.animationGroups.find((group) => group.name === 'Ultime') ?? null;

    if (this.mageIdleGroup) {
      this.stopAllMageAnimations();
      this.mageIdleGroup.loopAnimation = true;
      this.mageIdleGroup.speedRatio = 1.0;
      this.mageIdleGroup.play(true);
    }

    root.position.y = 1.0;
  }

  private async loadTankModelInto(root: TransformNode): Promise<void> {
    const result = await SceneLoader.ImportMeshAsync('', 'models/player/', 'tank.glb', this.scene);

    const candidateRoot = result.meshes[0];
    if (candidateRoot) {
      candidateRoot.parent = root;
      candidateRoot.scaling.scaleInPlace(0.1);
      candidateRoot.position = Vector3.Zero();
      candidateRoot.rotation.y = 0;
    }

    for (const mesh of result.meshes) {
      if (mesh !== candidateRoot && mesh.parent === null) {
        mesh.parent = root;
      }
      mesh.layerMask = SCENE_LAYER;
    }

    this.tankIdleGroup = result.animationGroups.find((group) => group.name === 'Skyrim') ?? null;

    this.setupTankThrusterParticles(result.meshes as AbstractMesh[]);
    this.applyTankThrusterVisuals();

    if (this.tankIdleGroup) {
      this.stopAllTankAnimations();
      this.tankIdleGroup.loopAnimation = true;
      this.tankIdleGroup.speedRatio = 1.0;
      this.tankIdleGroup.play(true);
    }

    root.position.y = 1.0;
  }

  private async loadRogueModelInto(root: TransformNode): Promise<void> {
    const result = await SceneLoader.ImportMeshAsync('', 'models/player/', 'cat.glb', this.scene);

    const modelContainer = new TransformNode('classRogueModelContainer', this.scene);
    modelContainer.parent = root;
    this.rogueModelContainer = modelContainer;

    for (const mesh of result.meshes) {
      if (mesh.parent === null) {
        mesh.parent = modelContainer;
      }
      mesh.layerMask = SCENE_LAYER;
    }

    const childMeshes = modelContainer.getChildMeshes();
    if (childMeshes.length > 0) {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;

      for (const child of childMeshes) {
        child.computeWorldMatrix(true);
        const box = child.getBoundingInfo().boundingBox;
        minX = Math.min(minX, box.minimumWorld.x);
        minY = Math.min(minY, box.minimumWorld.y);
        minZ = Math.min(minZ, box.minimumWorld.z);
        maxX = Math.max(maxX, box.maximumWorld.x);
        maxY = Math.max(maxY, box.maximumWorld.y);
        maxZ = Math.max(maxZ, box.maximumWorld.z);
      }

      this.rogueRawBounds = { minX, minY, minZ, maxX, maxY, maxZ };
      this.applyRogueModelTuning();
    } else {
      modelContainer.scaling.setAll(0.1);
      modelContainer.position = Vector3.Zero();
    }
    modelContainer.rotation = Vector3.Zero();

    this.rogueTake001Group =
      result.animationGroups.find((group) => group.name === 'Take 001') ??
      result.animationGroups.find((group) => group.name.toLowerCase() === 'take 001') ??
      null;

    this.freezeRogueAtFrame1();
    root.position.y = 1.0;
  }

  private applyRogueModelTuning(): void {
    if (!this.rogueModelContainer || !this.rogueRawBounds) return;

    const { minX, minY, minZ, maxX, maxY, maxZ } = this.rogueRawBounds;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const currentHeight = Math.max(0.001, sizeY);
    const currentFootprint = Math.max(0.001, Math.max(sizeX, sizeZ));
    const modelScale = Math.min(
      this.roguePreviewTuning.targetHeight / currentHeight,
      this.roguePreviewTuning.targetFootprint / currentFootprint
    );

    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;

    this.rogueModelContainer.scaling.setAll(modelScale);
    this.rogueModelContainer.position = new Vector3(
      -centerX * modelScale + this.roguePreviewTuning.offsetX,
      -minY * modelScale,
      -centerZ * modelScale + this.roguePreviewTuning.offsetZ
    );
  }

  private setupTankThrusterParticles(meshes: AbstractMesh[]): void {
    const anchorSource = this.findTankThrusterAnchor(meshes);
    if (!anchorSource) return;

    const anchor = new TransformNode('class_select_tank_thruster_anchor', this.scene);
    anchor.parent = anchorSource;
    this.tankThrusterAnchors.push(anchor);

    const particles = new ParticleSystem('class_select_tank_thruster_particles', 900, this.scene);
    const particleTexture = new DynamicTexture('class_select_tank_thruster_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = particleTexture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,190,80,0.95)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    particleTexture.update();

    particles.particleTexture = particleTexture;
    particles.emitter = anchor as unknown as AbstractMesh;
    particles.isLocal = true;
    particles.layerMask = SCENE_LAYER;

    particles.minEmitBox = new Vector3(-0.035, -0.01, -0.045);
    particles.maxEmitBox = new Vector3(0.035, 0.01, 0.045);

    particles.color1 = new Color4(1.0, 0.95, 0.75, 0.98);
    particles.color2 = new Color4(1.0, 0.42, 0.08, 0.9);
    particles.colorDead = new Color4(0.12, 0.03, 0.0, 0);

    particles.minSize = 0.2;
    particles.maxSize = 0.52;
    particles.minLifeTime = 0.07;
    particles.maxLifeTime = 0.18;
    particles.emitRate = 980;
    particles.blendMode = ParticleSystem.BLENDMODE_ONEONE;
    particles.gravity = Vector3.Zero();
    particles.direction1 = new Vector3(-0.05, -5.4, 0.02);
    particles.direction2 = new Vector3(0.05, -7.1, 0.14);
    particles.minEmitPower = 1.2;
    particles.maxEmitPower = 3.0;
    particles.minAngularSpeed = -12;
    particles.maxAngularSpeed = 12;
    particles.updateSpeed = 0.01;

    particles.start();

    this.tankThrusterParticles.push(particles);
    this.tankThrusterTextures.push(particleTexture);
    this.applyTankThrusterVisuals();
  }

  private applyTankThrusterVisuals(): void {
    const anchor = this.tankThrusterAnchors[0] ?? null;
    if (anchor) {
      anchor.position = new Vector3(
        this.tankVisualTuning.lateral,
        this.tankVisualTuning.height,
        this.tankVisualTuning.depth
      );
    }

    const sizeScale = Math.max(0.1, this.tankVisualTuning.size);
    for (const particles of this.tankThrusterParticles) {
      particles.minSize = 0.2 * sizeScale;
      particles.maxSize = 0.52 * sizeScale;
    }
  }

  private findTankThrusterAnchor(meshes: AbstractMesh[]): AbstractMesh | null {
    const exactLayer003 = meshes.find((mesh) => (mesh.name ?? '').toLowerCase() === 'layer.003') ?? null;
    if (exactLayer003) return exactLayer003;

    const keywords = ['thruster', 'reactor', 'engine', 'jet', 'booster', 'propulseur', 'reac', 'flame'];
    let best: AbstractMesh | null = null;
    let bestScore = -Infinity;

    for (const mesh of meshes) {
      const name = (mesh.name ?? '').toLowerCase();
      const ext = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
      const approxVolume = Math.max(0.00001, ext.x * ext.y * ext.z);
      let score = 0;
      if (keywords.some((keyword) => name.includes(keyword))) score += 8;
      if (approxVolume < 1) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = mesh;
      }
    }

    return bestScore >= 1 ? best : (meshes[0] ?? null);
  }

  private createCylinderPlaceholder(root: TransformNode, color: Color3, height: number, diameter: number, name: string): void {
    const body = MeshBuilder.CreateCylinder(`${name}_placeholder`, {
      height,
      diameterTop: diameter * 0.6,
      diameterBottom: diameter,
      tessellation: 24,
    }, this.scene);
    body.parent = root;
    body.position.y = height / 2;
    body.layerMask = SCENE_LAYER;

    const mat = new StandardMaterial(`${name}_placeholder_mat`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.25);
    body.material = mat;

    const base = MeshBuilder.CreateCylinder(`${name}_base`, {
      height: 0.12,
      diameter: diameter * 1.35,
      tessellation: 32,
    }, this.scene);
    base.parent = root;
    base.position.y = 0.06;
    base.layerMask = SCENE_LAYER;

    const baseMat = new StandardMaterial(`${name}_base_mat`, this.scene);
    baseMat.diffuseColor = new Color3(0.08, 0.08, 0.12);
    baseMat.emissiveColor = color.scale(0.15);
    base.material = baseMat;
  }

  private rotateCarousel(direction: -1 | 1): void {
    const count = this.items.length;
    if (count === 0) return;
    const step = (Math.PI * 2) / count;
    this.selectedIndex = (this.selectedIndex + direction + count) % count;
    this.targetRotation -= direction * step;

    this.playSelectedClassHighlightAnimation();

    this.refreshSelectionUi();
  }

  private attachKeyboard(): void {
    this.keyHandler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'q' || key === 'a') {
        this.rotateCarousel(1);
        event.preventDefault();
      } else if (key === 'arrowright' || key === 'd') {
        this.rotateCarousel(-1);
        event.preventDefault();
      } else if (key === 'enter' || key === ' ') {
        this.tryStartSelectedClass();
        event.preventDefault();
      } else if (key === 'escape') {
        this.navigateBackToTitle();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', this.keyHandler);
  }

  private attachPointerSelection(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
      const pickInfo = pointerInfo.pickInfo;
      if (!pickInfo?.hit || !pickInfo.pickedMesh) return;

      const pickedIndex = this.findClassIndexByMesh(pickInfo.pickedMesh);
      if (pickedIndex < 0) return;

      if (pickedIndex !== this.selectedIndex) {
        this.selectClass(pickedIndex, true);
        return;
      }

      this.tryStartSelectedClass();
    });
  }

  private findClassIndexByMesh(mesh: AbstractMesh): number {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (mesh === item.root || mesh.isDescendantOf(item.root)) {
        return i;
      }
    }
    return -1;
  }

  private selectClass(index: number, alignToFront: boolean): void {
    if (index < 0 || index >= this.items.length) return;
    this.selectedIndex = index;

    if (alignToFront) {
      const step = (Math.PI * 2) / this.items.length;
      this.targetRotation = -index * step;
    }

    this.playSelectedClassHighlightAnimation();

    this.refreshSelectionUi();
  }

  private tryStartSelectedClass(): void {
    const selected = this.items[this.selectedIndex];
    if (selected?.playable) {
      this.onStartClass(selected.id);
    }
  }

  private navigateBackToTitle(): void {
    if (this.isNavigatingBack) return;
    this.isNavigatingBack = true;
    this.onBackToTitle();
  }

  private refreshSelectionUi(): void {
    const selected = this.items[this.selectedIndex];
    if (!selected) return;

    if (selected.playable) {
      this.infoText.text = `${selected.label} // READY`;
      this.infoText.color = '#FFFFFF';
      this.startButton.isEnabled = true;
      this.startButton.background = '#1D3B3A';
      this.startButton.color = '#FFFFFF';
      if (this.startButton.textBlock) {
        this.startButton.textBlock.text = `START AS ${selected.label}`;
      }
    } else {
      this.infoText.text = `${selected.label} // COMING SOON`;
      this.infoText.color = '#7C9C98';
      this.startButton.isEnabled = false;
      this.startButton.background = 'rgba(20,30,35,0.75)';
      this.startButton.color = '#7C9C98';
      if (this.startButton.textBlock) {
        this.startButton.textBlock.text = 'UNAVAILABLE';
      }
    }
  }

  private updateCarouselLayout(): void {
    const count = this.items.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const item = this.items[i];
      const angle = this.carouselRotation + (i * (Math.PI * 2)) / count;
      const x = Math.sin(angle) * this.radius;
      const z = Math.cos(angle) * this.radius;
      item.root.position.x = x;
      item.root.position.z = z;

      const depthFactor = Scalar.Clamp((z + this.radius) / (2 * this.radius), 0, 1);
      const baseScale = 0.8 + depthFactor * 0.45;
      const rogueScaleBoost = item.id === 'rogue' && i === this.selectedIndex ? this.roguePreviewTuning.selectedScaleMultiplier : 1;
      const scale = baseScale * rogueScaleBoost;
      item.root.scaling.setAll(scale);

      item.root.lookAt(new Vector3(0, item.root.position.y, 0));
      item.root.rotation.y += Math.PI / 2;
      if (item.id === 'firewall') {
        // Tank model has opposite forward axis in class select; keep a persistent 180° offset here.
        item.root.rotation.y += Math.PI;
      }

      const alpha = 0.45 + depthFactor * 0.55;
      this.setItemAlpha(item.root, alpha);
    }

    this.applyTankThrusterVisuals();
  }

  private setItemAlpha(root: TransformNode, alpha: number): void {
    const meshes = root.getChildMeshes();
    for (const mesh of meshes) {
      const material = mesh.material as StandardMaterial | null;
      if (!material) continue;
      material.alpha = alpha;
    }
  }

  private stopAllMageAnimations(): void {
    if (this.mageIdleGroup?.isPlaying) {
      this.mageIdleGroup.stop();
    }
    if (this.mageUltimateGroup?.isPlaying) {
      this.mageUltimateGroup.stop();
    }
  }

  private stopAllTankAnimations(): void {
    if (this.tankIdleGroup?.isPlaying) {
      this.tankIdleGroup.stop();
    }
  }

  private stopAllRogueAnimations(): void {
    if (this.rogueTake001Group?.isPlaying) {
      this.rogueTake001Group.stop();
    }
  }

  private playMageUltimateThenIdle(): void {
    if (!this.mageUltimateGroup || !this.mageIdleGroup) {
      return;
    }

    this.stopAllMageAnimations();
    this.mageUltimateGroup.loopAnimation = false;
    this.mageUltimateGroup.speedRatio = 1.0;
    this.mageUltimateGroup.onAnimationGroupEndObservable.addOnce(() => {
      if (!this.mageIdleGroup) return;
      this.mageIdleGroup.loopAnimation = true;
      this.mageIdleGroup.speedRatio = 1.0;
      this.mageIdleGroup.play(true);
    });
    this.mageUltimateGroup.play(false);
  }

  private playTankIdle(): void {
    if (!this.tankIdleGroup) {
      return;
    }

    this.stopAllTankAnimations();
    this.tankIdleGroup.loopAnimation = true;
    this.tankIdleGroup.speedRatio = 1.0;
    this.tankIdleGroup.play(true);
  }

  private playSelectedClassHighlightAnimation(): void {
    const selected = this.items[this.selectedIndex];
    if (!selected) return;

    if (selected.id === 'mage') {
      this.clearRogueSelectionTimer();
      this.playMageUltimateThenIdle();
      return;
    }

    if (selected.id === 'firewall') {
      this.clearRogueSelectionTimer();
      this.playTankIdle();
      return;
    }

    if (selected.id === 'rogue') {
      this.playRogueSelectionSequence();
    }
  }

  private playRogueSelectionSequence(): void {
    const take001 = this.rogueTake001Group;
    if (!take001) {
      return;
    }

    if (this.rogueSelectSound) {
      this.rogueSelectSound.stop();
      this.rogueSelectSound.play();
    }

    const token = ++this.rogueSelectionPlayToken;
    this.clearRogueSelectionTimer();
    this.playRogueWindowFromFrame(token, 100, 1.0, 2000, () => {
      this.freezeRogueAtFrame1(false);

      this.rogueSelectionTimeoutId = window.setTimeout(() => {
        if (token !== this.rogueSelectionPlayToken) return;

        this.playRogueWindowFromFrame(token, 100, 0.5, 2000, () => {
          this.freezeRogueAtFrame1();
        });
      }, 1300);
    });
  }

  private playRogueWindowFromFrame(
    token: number,
    startFrame: number,
    speedRatio: number,
    durationMs: number,
    onComplete: () => void
  ): void {
    const take001 = this.rogueTake001Group;
    if (!take001) return;

    this.stopAllRogueAnimations();

    take001.loopAnimation = true;
    take001.speedRatio = speedRatio;
    take001.play(true);
    take001.goToFrame(startFrame);

    this.rogueSelectionTimeoutId = window.setTimeout(() => {
      if (token !== this.rogueSelectionPlayToken) return;
      onComplete();
    }, durationMs);
  }

  private clearRogueSelectionTimer(): void {
    if (this.rogueSelectionTimeoutId !== null) {
      window.clearTimeout(this.rogueSelectionTimeoutId);
      this.rogueSelectionTimeoutId = null;
    }
  }

  private freezeRogueAtFrame1(clearTimer: boolean = true): void {
    const take001 = this.rogueTake001Group;
    if (!take001) return;

    if (clearTimer) {
      this.clearRogueSelectionTimer();
    }
    this.stopAllRogueAnimations();
    take001.play(false);
    take001.goToFrame(1);
    take001.pause();
  }
}
