import {
  Color4,
  Engine,
  Scene,
  ArcRotateCamera,
  FreeCamera,
  Vector3,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Rectangle, ScrollViewer, StackPanel, TextBlock, Image } from '@babylonjs/gui';
import { buildHudAssetUrl, preloadHudAsset, getCachedHudAsset } from '../systems/hud/HudAssetPaths';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { playUiSelectClick } from '../audio/UiSelectClick';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { PostProcessManager, PostProcessingConfig } from './PostProcess';
import { createSynthwaveGridBackground } from './SynthwaveBackground';
import { UIFactory } from '../ui/UIFactory';
import { BASE_TEXT_SCALE, UITheme } from '../ui/UITheme';
import { DaemonGlitchFx } from '../ui/DaemonGlitchFx';
import { AchievementProgress, CodexService } from '../services/CodexService';
import { applyResponsiveGuiScaling, DESIGN_HEIGHT, DESIGN_WIDTH } from '../ui/GuiScaling';

interface TerminalLine {
  block: TextBlock;
  fullText: string;
  typed: string;
  index: number;
  speed: number;
  timer: number;
  burstCount: number;
  burstTarget: number;
  pauseMs: number;
  showCursor: boolean;
}

export class AchievementsScene {
  private readonly terminalFont = 'Lucida Console';

  private scene: Scene;
  private camera!: ArcRotateCamera;
  private gui!: AdvancedDynamicTexture;

  private synthBeep: SciFiTypewriterSynth;
  private selectedAchievementIndex: number = 0;

  private leftPanel!: Rectangle;
  private leftTitle!: TextBlock;
  private leftDescription!: TextBlock;
  private leftListStack!: StackPanel;
  private leftListScroll!: ScrollViewer;
  private leftListButtonWidth: number = 472;

  private rightPanel!: Rectangle;
  private rightTitle!: TextBlock;
  private rightBody!: TextBlock;

  private centerCard!: Rectangle;
  private centerCardIcon!: TextBlock;
  private centerCardTitle!: TextBlock;
  private centerCardTitleBaseFontSize: number = 32;
  private centerCardSubtitle!: TextBlock;
  private centerCardArtwork!: Image;

  private terminalLines: TerminalLine[] = [];
  private cursorBlinkTimer: number = 0;
  private cursorVisible: boolean = true;

  private keyHandler: (event: KeyboardEvent) => void;
  private audioUnlockHandler: (() => void) | null = null;
  private glitchFx!: DaemonGlitchFx;

  private postProcessManager!: PostProcessManager;
  private postProcessConfig: PostProcessingConfig;
  private resizeObserver: any = null;

  constructor(
    private engine: Engine,
    private codexService: CodexService,
    private onBackToMenu: () => void
  ) {
    this.synthBeep = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);

    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromHexString(UITheme.colors.bgVoid);

    this.setupAudioUnlock();

    // Create scene cameras (same as CodexScene)
    this.camera = new ArcRotateCamera('achievementsCamera', -Math.PI / 2, 1.30, 14.5, new Vector3(0, 1.3, 0), this.scene);
    this.camera.lowerRadiusLimit = 10;
    this.camera.upperRadiusLimit = 28;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.layerMask = SCENE_LAYER;

    const uiCamera = new FreeCamera('achievementsUiCamera', new Vector3(0, 0, -10), this.scene) as FreeCamera & { clear: boolean };
    uiCamera.layerMask = UI_LAYER;
    uiCamera.clear = false;

    this.scene.activeCameras = [this.camera, uiCamera];
    this.scene.activeCamera = this.camera;

    this.buildUI();
    this.glitchFx = new DaemonGlitchFx();

    this.postProcessManager = new PostProcessManager(this.scene, this.engine);
    this.postProcessConfig = {
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
    this.postProcessManager.setupPipeline(this.camera, this.postProcessConfig);

    this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.engine.getDeltaTime();
      this.updateTerminalLines(dt);
    });

    this.keyHandler = (evt) => {
      const key = evt.key.toLowerCase();
      if (key === 'escape') {
        this.onBackToMenu();
        evt.preventDefault();
      } else if (key === 'arrowup' || key === 'arrowleft' || key === 'q' || key === 'a') {
        const achievements = this.codexService.getAchievementsProgress();
        const total = achievements.length;
        if (total > 0) {
          this.selectedAchievementIndex = (this.selectedAchievementIndex - 1 + total) % total;
          this.clearLeftList();
          this.populateAchievementList();
          this.refreshAchievementSelection(false);
          this.updateListScroll(this.selectedAchievementIndex, total);
        }
        evt.preventDefault();
      } else if (key === 'arrowdown' || key === 'arrowright' || key === 'd' || key === ' ' || key === 'spacebar' || key === 'enter') {
        const achievements = this.codexService.getAchievementsProgress();
        const total = achievements.length;
        if (total > 0) {
          this.selectedAchievementIndex = (this.selectedAchievementIndex + 1) % total;
          this.clearLeftList();
          this.populateAchievementList();
          this.refreshAchievementSelection(false);
          this.updateListScroll(this.selectedAchievementIndex, total);
        }
        evt.preventDefault();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    this.populateAchievementList();
    this.refreshAchievementSelection(true);
  }

  public getScene(): Scene {
    return this.scene;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
    }
    if (this.resizeObserver) {
      this.engine.onResizeObservable.remove(this.resizeObserver);
      this.resizeObserver = null;
    }
    this.postProcessManager.dispose();
    this.glitchFx.dispose();
    this.gui.dispose();
    this.scene.dispose();
  }

  private setupAudioUnlock(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    const tryUnlock = () => {
      try {
        audioEngine.unlock();
      } catch {
        // Ignore unlock errors; next gesture can retry.
      }
      void this.synthBeep.unlock();
      const audioContext = (audioEngine as { audioContext?: AudioContext }).audioContext;
      this.synthBeep.attachContext(audioContext);
      if (audioEngine.unlocked && this.audioUnlockHandler) {
        window.removeEventListener('pointerdown', this.audioUnlockHandler);
        window.removeEventListener('keydown', this.audioUnlockHandler);
        this.audioUnlockHandler = null;
      }
    };

    this.audioUnlockHandler = tryUnlock;
    window.addEventListener('pointerdown', tryUnlock);
    window.addEventListener('keydown', tryUnlock);
    const audioContext = (audioEngine as { audioContext?: AudioContext }).audioContext;
    this.synthBeep.attachContext(audioContext);
  }

  private buildUI(): void {
    createSynthwaveGridBackground(this.scene, SCENE_LAYER, true, 'neutralHub');

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('AchievementsUI', true, this.scene);
    applyResponsiveGuiScaling(this.gui, this.engine, { desktopFirst: true });
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    this.codexService.getAchievementsProgress().forEach(a => preloadHudAsset(`achievements/${a.id}.png`));

    const root = new Rectangle('achievementsRoot');
    root.width = 1;
    root.height = 1;
    root.thickness = 0;
    root.background = 'transparent';
    this.gui.addControl(root);

    const idealWidth = this.gui.idealWidth || DESIGN_WIDTH;
    const idealHeight = this.gui.idealHeight || DESIGN_HEIGHT;
    const isMobileLayout = idealWidth <= 960;
    const layoutWidth = Math.round(idealWidth);
    const layoutHeight = Math.round(idealHeight);
    const sidePadding = Math.round(layoutWidth * 0.02);
    const sidePanelWidth = Math.round(layoutWidth * (isMobileLayout ? 0.31 : 0.29));
    const sidePanelHeight = Math.round(layoutHeight * 0.78);
    const panelTop = Math.round((layoutHeight - sidePanelHeight) * 0.5);
    const sideInnerWidth = Math.max(0, sidePanelWidth - 40);
    this.leftListButtonWidth = Math.max(0, sideInnerWidth - 34);
    const centerCardWidth = Math.round(layoutWidth * (isMobileLayout ? 0.28 : 0.26));
    const centerCardHeight = Math.round(sidePanelHeight * 0.78);

    const mainLayoutContainer = new Rectangle('mainLayout');
    mainLayoutContainer.width = 1;
    mainLayoutContainer.height = 1;
    mainLayoutContainer.thickness = 0;
    mainLayoutContainer.background = 'transparent';
    mainLayoutContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    mainLayoutContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(mainLayoutContainer);

    const updateScale = () => {
      mainLayoutContainer.scaleX = 1;
      mainLayoutContainer.scaleY = 1;
    };
    this.resizeObserver = this.engine.onResizeObservable.add(updateScale);
    // Re-apply GUI scale settings on orientation/size change
    this.engine.onResizeObservable.add(() => applyResponsiveGuiScaling(this.gui, this.engine, { desktopFirst: true }));
    updateScale();

    const topButtonWidth = `${isMobileLayout ? 290 : 260}px`;
    const topButtonHeight = `${isMobileLayout ? 82 : 74}px`;

    const backBtn = this.makeTabButton('BACK', () => {
      this.onBackToMenu();
    });
    backBtn.width = topButtonWidth;
    backBtn.height = topButtonHeight;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    backBtn.left = '32px';
    backBtn.top = '20px';
    if (backBtn.textBlock) {
      backBtn.textBlock.fontSize = isMobileLayout ? 25 : 23;
      backBtn.textBlock.fontFamily = 'Wonder8Bit';
      backBtn.textBlock.color = '#FFFFFF';
    }
    mainLayoutContainer.addControl(backBtn);

    const devBtn = this.makeTabButton(this.getDevLabel(), () => {
      this.codexService.setDevUnlockCodexEntries(!this.codexService.getDevUnlockCodexEntries());
      devBtn.textBlock!.text = this.getDevLabel();
      this.clearLeftList();
      this.populateAchievementList();
      this.refreshAchievementSelection(true);
    });
    devBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    devBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    devBtn.width = topButtonWidth;
    devBtn.height = topButtonHeight;
    devBtn.left = '-32px';
    devBtn.top = '20px';
    if (devBtn.textBlock) {
      devBtn.textBlock.fontSize = isMobileLayout ? 25 : 23;
      devBtn.textBlock.fontFamily = 'Wonder8Bit';
      devBtn.textBlock.color = '#FFFFFF';
      (devBtn.textBlock as any).__daemonBaseColor = '#FFFFFF';
    }
    mainLayoutContainer.addControl(devBtn);

    const mainTitle = UIFactory.createText('achTitle', 'ACHIEVEMENTS', 60, UITheme.colors.textHighlight);
    mainTitle.fontFamily = 'Wonder8Bit';
    mainTitle.color = '#EAF9FF';
    mainTitle.outlineColor = '#081622';
    mainTitle.outlineWidth = 4;
    mainTitle.shadowBlur = 0;
    mainTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    mainTitle.top = `${Math.round(layoutHeight * 0.05)}px`;
    mainTitle.height = '70px';
    mainTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    mainLayoutContainer.addControl(mainTitle);

    this.leftPanel = this.makeTerminalPanel('achLeftPanel', sidePanelWidth, sidePanelHeight);
    this.leftPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftPanel.left = `${sidePadding}px`;
    this.leftPanel.top = `${panelTop}px`;
    mainLayoutContainer.addControl(this.leftPanel);

    this.leftTitle = this.makeTerminalText('leftTitle', 24, '#7DFFE8');
    this.leftTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftTitle.top = `${Math.round(sidePanelHeight * 0.08)}px`;
    this.leftTitle.width = `${sideInnerWidth}px`;
    this.leftTitle.resizeToFit = true;
    this.leftPanel.addControl(this.leftTitle);

    this.leftDescription = this.makeTerminalText('leftDesc', 18, '#CFFCF3');
    this.leftDescription.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftDescription.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftDescription.top = `${Math.round(sidePanelHeight * 0.17)}px`;
    this.leftDescription.width = `${sideInnerWidth}px`;
    this.leftDescription.resizeToFit = true;
    this.leftDescription.isHitTestVisible = false;
    this.leftDescription.isPointerBlocker = false;
    this.leftPanel.addControl(this.leftDescription);

    const scrollViewer = UIFactory.createScrollViewer('leftListScroll');
    scrollViewer.width = `${sideInnerWidth}px`;
    scrollViewer.height = `${Math.round(sidePanelHeight * 0.8)}px`;
    scrollViewer.top = `${Math.round(sidePanelHeight * 0.12)}px`;
    scrollViewer.thickness = 0;
    scrollViewer.barColor = UITheme.colors.borderBright;
    scrollViewer.barBackground = 'rgba(0,0,0,0.5)';
    this.leftPanel.addControl(scrollViewer);
    this.leftListScroll = scrollViewer;

    this.leftListStack = new StackPanel('leftListStack');
    this.leftListStack.isVertical = true;
    this.leftListStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.leftListStack.spacing = 6;
    scrollViewer.addControl(this.leftListStack);

    this.rightPanel = this.makeTerminalPanel('achRightPanel', sidePanelWidth, sidePanelHeight);
    this.rightPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.rightPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.rightPanel.left = `-${sidePadding}px`;
    this.rightPanel.top = `${panelTop}px`;
    mainLayoutContainer.addControl(this.rightPanel);

    this.rightTitle = this.makeTerminalText('rightTitle', 26, '#7DFFE8');
    this.rightTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.rightTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.rightTitle.top = `${Math.round(sidePanelHeight * 0.06)}px`;
    this.rightTitle.resizeToFit = true;
    this.rightPanel.addControl(this.rightTitle);

    this.rightBody = this.makeTerminalText('rightBody', 20, '#CFFCF3');
    this.rightBody.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.rightBody.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.rightBody.top = `${Math.round(sidePanelHeight * 0.55)}px`;
    this.rightBody.height = `${Math.round(sidePanelHeight * 0.8)}px`;
    this.rightPanel.addControl(this.rightBody);

    this.centerCard = this.makeTerminalPanel('centerCard', centerCardWidth, centerCardHeight);
    this.centerCard.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.centerCard.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.centerCard.top = `${Math.round(panelTop + (sidePanelHeight - centerCardHeight) * 0.5)}px`;
    mainLayoutContainer.addControl(this.centerCard);

    const artContainer = new Rectangle('artContainer');
    const artSize = Math.round(centerCardWidth * 0.86);
    artContainer.width = `${artSize}px`;
    artContainer.height = `${artSize}px`;
    artContainer.top = `-${Math.round(centerCardHeight * 0.1)}px`;
    artContainer.thickness = 1;
    artContainer.color = UITheme.colors.borderDim;
    artContainer.background = 'rgba(0,0,0,0.5)';
    this.centerCard.addControl(artContainer);

    this.centerCardIcon = new TextBlock('centerIcon', '?');
    this.centerCardIcon.fontFamily = this.terminalFont;
    this.centerCardIcon.fontSize = 96;
    this.centerCardIcon.color = '#7CFFEA';
    artContainer.addControl(this.centerCardIcon);

    this.centerCardArtwork = new Image('centerArtwork', '');
    this.centerCardArtwork.width = '100%';
    this.centerCardArtwork.height = '100%';
    this.centerCardArtwork.stretch = Image.STRETCH_UNIFORM;
    this.centerCardArtwork.isVisible = false;
    artContainer.addControl(this.centerCardArtwork);

    this.centerCardTitle = new TextBlock('centerTitle', '');
    this.centerCardTitle.fontFamily = 'Wonder8Bit';
    this.centerCardTitleBaseFontSize = isMobileLayout ? 36 : 32;
    this.centerCardTitle.fontSize = this.centerCardTitleBaseFontSize;
    this.centerCardTitle.color = '#FFFFFF';
    this.centerCardTitle.top = '202px';
    this.centerCardTitle.width = `${Math.round(centerCardWidth * 0.88)}px`;
    this.centerCardTitle.height = isMobileLayout ? '120px' : '108px';
    this.centerCardTitle.textWrapping = true;
    this.centerCardTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.centerCardTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.centerCardTitle.lineSpacing = '2px';
    this.centerCard.addControl(this.centerCardTitle);

    this.centerCardSubtitle = new TextBlock('centerSubtitle', '');
    this.centerCardSubtitle.fontFamily = this.terminalFont;
    this.centerCardSubtitle.fontSize = Math.round((isMobileLayout ? 30 : 26) * BASE_TEXT_SCALE);
    this.centerCardSubtitle.color = '#7DFFE8';
    this.centerCardSubtitle.top = '256px';
    this.centerCard.addControl(this.centerCardSubtitle);

    const navButtonWidth = isMobileLayout ? 168 : 156;
    const navButtonHeight = isMobileLayout ? 74 : 66;
    const navRow = new StackPanel('achBottomNav');
    navRow.isVertical = false;
    navRow.width = `${navButtonWidth * 2 + 18}px`;
    navRow.height = `${navButtonHeight}px`;
    navRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    navRow.top = `-${Math.round(layoutHeight * 0.05)}px`;
    navRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainLayoutContainer.addControl(navRow);

    const leftNavBtn = UIFactory.createTerminalButton('achNavLeft', '<', `${navButtonWidth}px`, `${navButtonHeight}px`);
    if (leftNavBtn.textBlock) leftNavBtn.textBlock.fontSize = isMobileLayout ? 25 : 22;
    if (leftNavBtn.textBlock) leftNavBtn.textBlock.fontFamily = 'Wonder8Bit';
    this.bindGlitchButton(leftNavBtn, '<', () => this.navigateBy(-1), { silent: true });
    navRow.addControl(leftNavBtn);

    const rightNavBtn = UIFactory.createTerminalButton('achNavRight', '>', `${navButtonWidth}px`, `${navButtonHeight}px`);
    if (rightNavBtn.textBlock) rightNavBtn.textBlock.fontSize = isMobileLayout ? 25 : 22;
    if (rightNavBtn.textBlock) rightNavBtn.textBlock.fontFamily = 'Wonder8Bit';
    this.bindGlitchButton(rightNavBtn, '>', () => this.navigateBy(1), { silent: true });
    navRow.addControl(rightNavBtn);
  }

  private makeTerminalPanel(id: string, w: number, h: number): Rectangle {
    const p = new Rectangle(id);
    p.width = w + 'px';
    p.height = h + 'px';
    p.thickness = 1;
    p.color = UITheme.colors.borderDim;
    p.background = 'rgba(10, 18, 22, 0.85)';
    return p;
  }

  private makeTerminalText(id: string, size: number, color: string): TextBlock {
    const t = new TextBlock(id, '');
    t.fontFamily = this.terminalFont;
    t.fontSize = Math.round(size * 1.12 * BASE_TEXT_SCALE);
    t.color = color;
    t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    t.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    t.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    t.left = '20px';
    t.textWrapping = true;
    return t;
  }

  private makeTabButton(label: string, onClick: () => void): Button {
    const isMobileLayout = (this.gui.idealWidth || DESIGN_WIDTH) <= 960;
    const btn = Button.CreateSimpleButton(`tab_${label}`, label);
    btn.width = `${isMobileLayout ? 340 : 300}px`;
    btn.height = `${isMobileLayout ? 84 : 76}px`;
    btn.color = UITheme.colors.borderBright;
    btn.thickness = 1;
    btn.cornerRadius = 2;
    btn.background = UITheme.colors.bgPanel;
    btn.fontFamily = 'Wonder8Bit';
    btn.fontSize = isMobileLayout ? 26 : 23;
    this.bindGlitchButton(btn, label, onClick);
    if (btn.textBlock) {
      btn.textBlock.fontFamily = 'Wonder8Bit';
      btn.textBlock.fontSize = isMobileLayout ? 26 : 23;
      btn.textBlock.color = UITheme.colors.textNormal;
    }
    return btn;
  }

  private clearLeftList(): void {
    const children = [...this.leftListStack.children];
    for (const child of children) {
      child.dispose();
    }
  }

  private populateAchievementList(): void {
    const achievements = this.codexService.getAchievementsProgress();
    for (let i = 0; i < achievements.length; i++) {
      const achievement = achievements[i];
      const status = achievement.unlocked ? '[UNLOCKED]' : `[${achievement.progress}/${achievement.target}]`;
      const btn = this.makeLeftListButton(`left_ach_${achievement.id}`, `${achievement.name} ${status}`, i === this.selectedAchievementIndex, () => {
        this.selectedAchievementIndex = i;
        this.clearLeftList();
        this.populateAchievementList();
        this.refreshAchievementSelection(false);
        this.updateListScroll(this.selectedAchievementIndex, achievements.length);
      });
      this.leftListStack.addControl(btn);
    }
  }

  private makeLeftListButton(id: string, label: string, active: boolean, onClick: () => void): Button {
    const isMobileLayout = (this.gui.idealWidth || DESIGN_WIDTH) <= 960;
    const btn = Button.CreateSimpleButton(id, label);
    btn.width = `${this.leftListButtonWidth}px`;
    btn.height = `${isMobileLayout ? 64 : 56}px`;
    btn.thickness = 1;
    btn.cornerRadius = 4;
    btn.color = active ? '#FFFFFF' : UITheme.colors.textNormal;
    btn.background = active ? UITheme.colors.hoverBg : UITheme.colors.bgPanel;
    btn.isPointerBlocker = true;
    btn.isHitTestVisible = true;
    this.bindGlitchButton(btn, label, onClick);
    if (btn.textBlock) {
      btn.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      btn.textBlock.paddingLeft = '10px';
      btn.textBlock.fontFamily = 'Arcade8Bit';
      btn.textBlock.fontSize = Math.round((isMobileLayout ? 22 : 19) * BASE_TEXT_SCALE);
    }
    return btn;
  }

  private updateListScroll(index: number, total: number): void {
    if (this.leftListScroll && this.leftListScroll.verticalBar && total > 1) {
      this.leftListScroll.verticalBar.value = index / (total - 1);
    }
  }

  private navigateBy(delta: number): void {
    const achievements = this.codexService.getAchievementsProgress();
    const total = achievements.length;
    if (total <= 0) return;
    this.selectedAchievementIndex = (this.selectedAchievementIndex + delta + total) % total;
    this.clearLeftList();
    this.populateAchievementList();
    this.refreshAchievementSelection(false);
    this.updateListScroll(this.selectedAchievementIndex, total);
  }

  private refreshAchievementSelection(resetTyping: boolean): void {
    this.setTerminalText(this.leftTitle, '> ACHIEVEMENTS LOG', 220, false);
    this.setTerminalText(this.leftDescription, '> Track completion conditions\n> and current unlock state.', 220, false);

    const achievements = this.codexService.getAchievementsProgress();
    const achievement = achievements[this.selectedAchievementIndex];
    if (!achievement) {
      if (resetTyping) {
        this.setTerminalText(this.rightTitle, 'NO ACHIEVEMENT', 220, false);
        this.setTerminalText(this.rightBody, '> No achievement loaded.\n');
      }
      return;
    }

    if (achievement.unlocked) {
      this.centerCardIcon.isVisible = true;
      this.centerCardArtwork.isVisible = true;
      const cachedImg = getCachedHudAsset(`achievements/${achievement.id}.png`);
      if (cachedImg) {
        this.centerCardArtwork.domImage = cachedImg;
      } else {
        this.centerCardArtwork.source = buildHudAssetUrl(`achievements/${achievement.id}.png`);
      }
    } else {
      this.centerCardIcon.isVisible = true;
      this.centerCardArtwork.isVisible = false;
      this.centerCardIcon.text = '?';
    }

    this.applyCenterCardTitle(achievement.name);
    this.centerCardSubtitle.text = achievement.unlocked ? 'Unlocked' : 'In progress';

    const body =
      `> Description\n${achievement.description}\n\n` +
      `> Conditions\n` +
      `Type: ${achievement.type}\n` +
      `Target: ${achievement.target}\n\n` +
      `> State\n` +
      `Progress: ${achievement.progress}/${achievement.target}\n` +
      `Status: ${achievement.unlocked ? 'Unlocked' : 'Locked'}\n\n` +
      `> ID\n${achievement.id}`;

    this.setTerminalText(this.rightTitle, achievement.name, 240, false);
    this.setTerminalText(this.rightBody, body + '\n', 280, true);
  }

  private applyCenterCardTitle(rawTitle: string): void {
    const title = (rawTitle ?? '').trim();
    if (!title) {
      this.centerCardTitle.text = '';
      this.centerCardTitle.fontSize = this.centerCardTitleBaseFontSize;
      return;
    }

    const normalized = title.replace(/\s+/g, ' ');
    const isMobileLayout = (this.gui.idealWidth || DESIGN_WIDTH) <= 960;
    const singleLineThreshold = isMobileLayout ? 26 : 24;
    if (normalized.length <= singleLineThreshold) {
      this.centerCardTitle.text = normalized;
      this.centerCardTitle.fontSize = this.centerCardTitleBaseFontSize;
      return;
    }

    const words = normalized.split(' ');
    if (words.length <= 1) {
      this.centerCardTitle.text = normalized;
      this.centerCardTitle.fontSize = Math.max(26, this.centerCardTitleBaseFontSize - 4);
      return;
    }

    const midpoint = normalized.length / 2;
    let bestSplit = 1;
    let bestScore = Number.POSITIVE_INFINITY;
    let left = words[0];
    for (let i = 1; i < words.length; i++) {
      const right = words.slice(i).join(' ');
      const score = Math.abs(left.length - midpoint) + Math.abs(left.length - right.length);
      if (score < bestScore) {
        bestScore = score;
        bestSplit = i;
      }
      left += ` ${words[i]}`;
    }

    const line1 = words.slice(0, bestSplit).join(' ');
    const line2 = words.slice(bestSplit).join(' ');
    this.centerCardTitle.text = `${line1}\n${line2}`;
    this.centerCardTitle.fontSize = Math.max(24, this.centerCardTitleBaseFontSize - 4);
  }

  private setTerminalText(block: TextBlock, text: string, speedBase: number = 300, clearExisting: boolean = true): void {
    const existingLine = this.terminalLines.find((line) => line.block === block);
    if (existingLine && existingLine.fullText === text) {
      return;
    }
    if (clearExisting) {
      const existingIndex = this.terminalLines.findIndex((line) => line.block === block);
      if (existingIndex > -1) {
        this.terminalLines.splice(existingIndex, 1);
      }
      block.text = '';
    }

    this.terminalLines.push({
      block,
      fullText: text,
      typed: '',
      index: 0,
      speed: speedBase,
      timer: 0,
      burstCount: 0,
      burstTarget: 0,
      pauseMs: 0,
      showCursor: true,
    });
  }

  private updateTerminalLines(dt: number): void {
    this.cursorBlinkTimer += dt;
    if (this.cursorBlinkTimer >= 500) {
      this.cursorBlinkTimer = 0;
      this.cursorVisible = !this.cursorVisible;
    }

    for (let i = this.terminalLines.length - 1; i >= 0; i--) {
      const line = this.terminalLines[i];

      if (line.index >= line.fullText.length) {
        line.block.text = line.fullText + (this.cursorVisible && line.showCursor ? ' _' : '  ');
        continue;
      }

      if (line.pauseMs > 0) {
        line.pauseMs -= dt;
        line.block.text = line.typed + (this.cursorVisible ? ' _' : '  ');
        continue;
      }

      line.timer += dt;
      const msPerChar = 1000 / line.speed;

      if (line.timer >= msPerChar) {
        line.timer = 0;
        let charsToType = 1;

        if (line.burstCount < line.burstTarget) {
          charsToType = Math.min(3, line.fullText.length - line.index);
          line.burstCount += charsToType;
        } else {
          if (Math.random() < 0.1) {
            line.burstTarget = Math.floor(Math.random() * 5) + 2;
            line.burstCount = 0;
          }
        }

        let didTypeVisible = false;

        for (let c = 0; c < charsToType; c++) {
          if (line.index >= line.fullText.length) break;
          const char = line.fullText[line.index];
          line.typed += char;
          line.index++;

          if (char.trim() !== '') {
            didTypeVisible = true;
          }

          if (char === '.' || char === '!' || char === '?') {
            line.pauseMs = 150 + Math.random() * 200;
            break;
          }
          if (char === '\n') {
            line.pauseMs = 50;
            break;
          }
        }

        if (didTypeVisible && Math.random() < 0.3) {
          this.synthBeep.triggerForTypedChar();
        }

        line.block.text = line.typed + (this.cursorVisible ? ' _' : '  ');
      }
    }
  }

  private getDevLabel(): string {
    return this.codexService.getDevUnlockCodexEntries() ? 'DEV UNLOCK: ON' : 'DEV UNLOCK: OFF';
  }

  private playUiClickSound(): void {
    playUiSelectClick(0.8);
  }

  private bindGlitchButton(button: Button, label: string, onAction: () => void, options?: { silent?: boolean }): void {
    button.isPointerBlocker = true;
    button.isHitTestVisible = true;
    button.hoverCursor = 'pointer';
    DaemonGlitchFx.injectWithOptions(button, label, () => {
      if (!options?.silent) this.playUiClickSound();
      onAction();
    }, { clickDelayMs: 170, enableHoverGlitch: false });
  }
}
