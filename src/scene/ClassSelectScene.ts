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
  PointerEventTypes,
  Observer,
  PointerInfo,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { PostProcessManager, PostProcessingConfig } from './PostProcess';
import { ClassSelectDevConsole } from './ClassSelectDevConsole';

interface ClassCarouselItem {
  id: 'mage' | 'firewall' | 'rogue';
  label: string;
  playable: boolean;
  root: TransformNode;
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
  private postProcessManager: PostProcessManager;
  private devConsole: ClassSelectDevConsole;
  private postProcessConfig: PostProcessingConfig;
  private isNavigatingBack: boolean = false;

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

    this.devConsole = new ClassSelectDevConsole(this.scene, this.gui, this.camera, this.postProcessManager, this.postProcessConfig);
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
    window.removeEventListener('keydown', this.keyHandler);
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = undefined;
    }
    this.devConsole.dispose();
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

    const uiCamera = new FreeCamera('classSelectUiCamera', new Vector3(0, 0, -10), this.scene);
    uiCamera.layerMask = UI_LAYER;
    (uiCamera as any).clear = false;

    this.scene.activeCameras = [camera, uiCamera];
    this.scene.activeCamera = camera;
    this.camera = camera;

    const lightTop = new HemisphericLight('classSelectLightTop', new Vector3(0, 1, 0), this.scene);
    lightTop.intensity = 0.85;

    const lightFront = new HemisphericLight('classSelectLightFront', new Vector3(0.6, 0.3, 1), this.scene);
    lightFront.intensity = 0.55;
  }

  private createEnvironment(): void {
    const floor = MeshBuilder.CreateGround('classSelectFloor', { width: 20, height: 20 }, this.scene);
    floor.layerMask = SCENE_LAYER;
    const floorMat = new StandardMaterial('classSelectFloorMat', this.scene);
    floorMat.diffuseColor = new Color3(0.08, 0.08, 0.12);
    floorMat.emissiveColor = new Color3(0.02, 0.05, 0.08);
    floor.material = floorMat;

    const centerRing = MeshBuilder.CreateTorus('classSelectRing', { diameter: 5, thickness: 0.08, tessellation: 64 }, this.scene);
    centerRing.position.y = 0.03;
    centerRing.rotation.x = Math.PI / 2;
    centerRing.layerMask = SCENE_LAYER;
    const ringMat = new StandardMaterial('classSelectRingMat', this.scene);
    ringMat.emissiveColor = new Color3(0.12, 0.6, 0.8);
    ringMat.diffuseColor = new Color3(0.03, 0.15, 0.25);
    centerRing.material = ringMat;
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
    this.createCylinderPlaceholder(firewallRoot, new Color3(1.0, 0.45, 0.25), 2.8, 1.2, 'FIREWALL');
    this.items.push({ id: 'firewall', label: 'FIREWALL', playable: true, root: firewallRoot });

    const rogueRoot = new TransformNode('classRogueRoot', this.scene);
    this.createCylinderPlaceholder(rogueRoot, new Color3(0.6, 0.9, 0.35), 2.4, 0.9, 'ROGUE');
    this.items.push({ id: 'rogue', label: 'ROGUE', playable: true, root: rogueRoot });
  }

  private async loadMageModelInto(root: TransformNode): Promise<void> {
    const result = await SceneLoader.ImportMeshAsync('', '/models/player/', 'mage.glb', this.scene);

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

    const selected = this.items[this.selectedIndex];
    if (selected?.id === 'mage') {
      this.playMageUltimateThenIdle();
    }

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

    const selected = this.items[this.selectedIndex];
    if (selected?.id === 'mage') {
      this.playMageUltimateThenIdle();
    }

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
      const scale = 0.8 + depthFactor * 0.45;
      item.root.scaling.setAll(scale);

      item.root.lookAt(new Vector3(0, item.root.position.y, 0));
      item.root.rotation.y += Math.PI / 2;

      const alpha = 0.45 + depthFactor * 0.55;
      this.setItemAlpha(item.root, alpha);
    }
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
}
