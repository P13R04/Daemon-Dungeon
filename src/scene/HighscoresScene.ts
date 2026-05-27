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
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { PostProcessManager, PostProcessingConfig } from './PostProcess';
import { createSynthwaveGridBackground } from './SynthwaveBackground';
import { UIFactory } from '../ui/UIFactory';
import { UITheme } from '../ui/UITheme';
import { DaemonGlitchFx } from '../ui/DaemonGlitchFx';
import { CodexService, RunRecord } from '../services/CodexService';
import { BONUS_CODEX_ENTRIES } from '../data/codex/bonuses';
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

export class HighscoresScene {
  private readonly terminalFont = 'Arcade8Bit';

  private scene: Scene;
  private camera!: ArcRotateCamera;
  private gui!: AdvancedDynamicTexture;

  private synthBeep: SciFiTypewriterSynth;
  private selectedRunIndex: number = 0;

  private leftPanel!: Rectangle;
  private leftTitle!: TextBlock;
  private leftDescription!: TextBlock;
  private leftListStack!: StackPanel;
  private leftListScroll!: ScrollViewer;
  private leftListButtonWidth: number = 392;

  private rightPanel!: Rectangle;
  private rightTitle!: TextBlock;
  private rightBody!: TextBlock;

  private centerCard!: Rectangle;
  private centerCardTitle!: TextBlock;
  private centerCardSubtitle!: TextBlock;
  private centerBonusesContainer!: Rectangle;
  private bonusIconsStack!: StackPanel;
  private centerBonusLabel!: TextBlock;
  private centerDetailsPanel!: Rectangle;
  private centerDetailsImg!: Image;
  private centerDetailsTitle!: TextBlock;
  private centerDetailsDesc!: TextBlock;

  private terminalLines: TerminalLine[] = [];
  private cursorBlinkTimer: number = 0;
  private cursorVisible: boolean = true;

  private keyHandler: (event: KeyboardEvent) => void;
  private audioUnlockHandler: (() => void) | null = null;
  private glitchFx!: DaemonGlitchFx;

  private postProcessManager: PostProcessManager;
  private postProcessConfig: PostProcessingConfig;
  private runs: RunRecord[] = [];
  private resizeObserver: any = null;

  constructor(
    private engine: Engine,
    private codexService: CodexService,
    private onBackToMenu: () => void
  ) {
    this.synthBeep = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);

    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromHexString(UITheme.colors.bgVoid);

    // Retrieve highscore run history from CodexService
    const stats = (this.codexService as any).stats;
    this.runs = stats?.runHistory || [];

    this.setupAudioUnlock();

    // Create scene cameras (same as CodexScene)
    this.camera = new ArcRotateCamera('highscoresCamera', -Math.PI / 2, 1.30, 14.5, new Vector3(0, 1.3, 0), this.scene);
    this.camera.lowerRadiusLimit = 10;
    this.camera.upperRadiusLimit = 28;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.layerMask = SCENE_LAYER;

    const uiCamera = new FreeCamera('highscoresUiCamera', new Vector3(0, 0, -10), this.scene) as FreeCamera & { clear: boolean };
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
        const total = this.runs.length;
        if (total > 0) {
          this.selectedRunIndex = (this.selectedRunIndex - 1 + total) % total;
          this.populateRunsList();
          this.refreshRunSelection(false);
          this.updateListScroll(this.selectedRunIndex, total);
        }
        evt.preventDefault();
      } else if (key === 'arrowdown' || key === 'arrowright' || key === 'd' || key === ' ' || key === 'spacebar' || key === 'enter') {
        const total = this.runs.length;
        if (total > 0) {
          this.selectedRunIndex = (this.selectedRunIndex + 1) % total;
          this.populateRunsList();
          this.refreshRunSelection(false);
          this.updateListScroll(this.selectedRunIndex, total);
        }
        evt.preventDefault();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    this.populateRunsList();
    this.refreshRunSelection(true);
  }

  public getScene(): Scene {
    return this.scene;
  }

  public dispose(): void {
    if (this.resizeObserver) {
      this.engine.onResizeObservable.remove(this.resizeObserver);
      this.resizeObserver = null;
    }
    window.removeEventListener('keydown', this.keyHandler);
    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
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

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('HighscoresUI', true, this.scene);
    applyResponsiveGuiScaling(this.gui, this.engine, { desktopFirst: true });
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    const root = new Rectangle('highscoresRoot');
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
    const panelTop = Math.round(layoutHeight * 0.15);
    const sidePanelWidth = Math.round(layoutWidth * (isMobileLayout ? 0.31 : 0.29));
    const bottomStripHeight = Math.round(layoutHeight * 0.19);
    const sidePanelHeight = Math.round(layoutHeight - panelTop - bottomStripHeight - Math.round(layoutHeight * 0.04));
    const sideInnerWidth = Math.max(0, sidePanelWidth - 40);
    const centerCardWidth = Math.round(layoutWidth * (isMobileLayout ? 0.34 : 0.32));
    const centerCardHeight = Math.round(sidePanelHeight * 0.56);
    this.leftListButtonWidth = Math.max(0, sideInnerWidth - 34);

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

    const backBtn = this.makeTabButton('BACK TO MAIN MENU', () => {
      this.onBackToMenu();
    });
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    backBtn.left = '32px';
    backBtn.top = '24px';
    mainLayoutContainer.addControl(backBtn);

    if (!import.meta.env.PROD) {
      const devBtn = this.makeTabButton(this.getDevLabel(), () => {
        this.codexService.setDevUnlockCodexEntries(!this.codexService.getDevUnlockCodexEntries());
        devBtn.textBlock!.text = this.getDevLabel();
        this.populateRunsList();
        this.refreshRunSelection(true);
      });
      devBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      devBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      devBtn.left = '-32px';
      devBtn.top = '24px';
      mainLayoutContainer.addControl(devBtn);
    }

    const mainTitle = UIFactory.createText('hsTitle', 'LOCAL HIGHSCORES DIRECTORY', 60, UITheme.colors.textHighlight);
    mainTitle.fontFamily = UITheme.fonts.primary;
    mainTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    mainTitle.top = `${Math.round(layoutHeight * 0.05)}px`;
    mainTitle.height = '70px';
    mainTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    mainLayoutContainer.addControl(mainTitle);

    this.leftPanel = this.makeTerminalPanel('hsLeftPanel', sidePanelWidth, sidePanelHeight);
    this.leftPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftPanel.left = `${sidePadding}px`;
    this.leftPanel.top = `${panelTop}px`;
    mainLayoutContainer.addControl(this.leftPanel);

    this.leftTitle = this.makeTerminalText('leftTitle', 24, '#7DFFE8');
    this.leftTitle.top = `-${Math.round(sidePanelHeight * 0.44)}px`;
    this.leftTitle.width = `${sideInnerWidth}px`;
    this.leftTitle.height = '30px';
    this.leftTitle.isHitTestVisible = false;
    this.leftTitle.isPointerBlocker = false;
    this.leftPanel.addControl(this.leftTitle);

    this.leftDescription = this.makeTerminalText('leftDesc', 18, '#CFFCF3');
    this.leftDescription.top = `-${Math.round(sidePanelHeight * 0.37)}px`;
    this.leftDescription.width = `${sideInnerWidth}px`;
    this.leftDescription.height = `${Math.round(sidePanelHeight * 0.07)}px`;
    this.leftDescription.isHitTestVisible = false;
    this.leftDescription.isPointerBlocker = false;
    this.leftPanel.addControl(this.leftDescription);

    const scrollViewer = UIFactory.createScrollViewer('leftListScroll');
    scrollViewer.width = `${sideInnerWidth}px`;
    scrollViewer.height = `${Math.round(sidePanelHeight * 0.8)}px`;
    scrollViewer.top = `${Math.round(sidePanelHeight * 0.1)}px`;
    scrollViewer.thickness = 0;
    scrollViewer.barColor = '#3B685C';
    scrollViewer.barBackground = 'rgba(0,0,0,0.5)';
    this.leftPanel.addControl(scrollViewer);
    this.leftListScroll = scrollViewer;

    this.leftListStack = new StackPanel('leftListStack');
    this.leftListStack.isVertical = true;
    this.leftListStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.leftListStack.spacing = 6;
    scrollViewer.addControl(this.leftListStack);

    this.rightPanel = this.makeTerminalPanel('hsRightPanel', sidePanelWidth, sidePanelHeight);
    this.rightPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.rightPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.rightPanel.left = `-${sidePadding}px`;
    this.rightPanel.top = `${panelTop}px`;
    mainLayoutContainer.addControl(this.rightPanel);

    this.rightTitle = this.makeTerminalText('rightTitle', 26, '#7DFFE8');
    this.rightTitle.top = `-${Math.round(sidePanelHeight * 0.44)}px`;
    this.rightTitle.width = `${sideInnerWidth}px`;
    this.rightTitle.height = `${Math.round(sidePanelHeight * 0.09)}px`;
    this.rightPanel.addControl(this.rightTitle);

    this.rightBody = this.makeTerminalText('rightBody', 20, '#CFFCF3');
    this.rightBody.top = `${Math.round(sidePanelHeight * 0.05)}px`;
    this.rightBody.width = `${sideInnerWidth}px`;
    this.rightBody.height = `${Math.round(sidePanelHeight * 0.8)}px`;
    this.rightPanel.addControl(this.rightBody);

    this.centerCard = this.makeTerminalPanel('centerCard', centerCardWidth, centerCardHeight);
    this.centerCard.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.centerCard.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.centerCard.top = `${Math.round(panelTop + Math.max(0, (sidePanelHeight - centerCardHeight) * 0.5))}px`;
    mainLayoutContainer.addControl(this.centerCard);

    this.centerCardTitle = new TextBlock('centerTitle', 'RUN SUMMARY');
    this.centerCardTitle.fontFamily = this.terminalFont;
    this.centerCardTitle.fontSize = isMobileLayout ? 36 : 32;
    this.centerCardTitle.color = '#FFFFFF';
    this.centerCardTitle.top = `-${Math.round(centerCardHeight * 0.39)}px`;
    this.centerCard.addControl(this.centerCardTitle);

    this.centerCardSubtitle = new TextBlock('centerSubtitle', '');
    this.centerCardSubtitle.fontFamily = this.terminalFont;
    this.centerCardSubtitle.fontSize = isMobileLayout ? 26 : 22;
    this.centerCardSubtitle.color = '#7DFFE8';
    this.centerCardSubtitle.top = `-${Math.round(centerCardHeight * 0.28)}px`;
    this.centerCard.addControl(this.centerCardSubtitle);

    this.centerBonusesContainer = new Rectangle('bonusesContainer');
    this.centerBonusesContainer.width = `${Math.max(0, centerCardWidth - 40)}px`;
    this.centerBonusesContainer.height = `${Math.round(centerCardHeight * 0.5)}px`;
    this.centerBonusesContainer.top = `${Math.round(centerCardHeight * 0.12)}px`;
    this.centerBonusesContainer.thickness = 1;
    this.centerBonusesContainer.color = '#3B685C';
    this.centerBonusesContainer.background = 'rgba(0,0,0,0.5)';
    this.centerCard.addControl(this.centerBonusesContainer);

    this.centerBonusLabel = new TextBlock('bonusLabel', 'EQUIPPED BONUSES');
    this.centerBonusLabel.fontFamily = this.terminalFont;
    this.centerBonusLabel.fontSize = isMobileLayout ? 22 : 19;
    this.centerBonusLabel.color = '#7CFFEA';
    this.centerBonusLabel.top = `-${Math.round(centerCardHeight * 0.19)}px`;
    this.centerBonusesContainer.addControl(this.centerBonusLabel);

    this.bonusIconsStack = new StackPanel('bonusIconsStack');
    this.bonusIconsStack.isVertical = true;
    this.bonusIconsStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.bonusIconsStack.spacing = 10;
    this.bonusIconsStack.top = '15px';
    this.centerBonusesContainer.addControl(this.bonusIconsStack);

    // Detached Details Panel for Tooltips at the bottom center of the screen
    this.centerDetailsPanel = new Rectangle('centerDetailsPanel');
    this.centerDetailsPanel.width = `${Math.round(layoutWidth * 0.7)}px`;
    this.centerDetailsPanel.height = `${bottomStripHeight}px`;
    this.centerDetailsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.centerDetailsPanel.top = `-${Math.round(layoutHeight * 0.025)}px`;
    this.centerDetailsPanel.thickness = 2;
    this.centerDetailsPanel.color = '#3B685C';
    this.centerDetailsPanel.background = 'rgba(10, 18, 22, 0.95)';
    this.centerDetailsPanel.cornerRadius = 6;
    this.centerDetailsPanel.isHitTestVisible = false;
    this.centerDetailsPanel.isPointerBlocker = false;
    mainLayoutContainer.addControl(this.centerDetailsPanel);

    this.centerDetailsImg = new Image('centerDetailsImg', '');
    this.centerDetailsImg.width = '90px';
    this.centerDetailsImg.height = '90px';
    this.centerDetailsImg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.centerDetailsImg.left = '20px';
    this.centerDetailsImg.isVisible = false;
    this.centerDetailsPanel.addControl(this.centerDetailsImg);

    const detailsTextStack = new StackPanel('centerDetailsTextStack');
    detailsTextStack.isVertical = true;
    detailsTextStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailsTextStack.left = '130px';
    detailsTextStack.width = `${Math.max(0, Math.round(layoutWidth * 0.7) - 160)}px`;
    detailsTextStack.spacing = 6;
    this.centerDetailsPanel.addControl(detailsTextStack);

    this.centerDetailsTitle = new TextBlock('centerDetailsTitle', '> SYSTEM METRICS');
    this.centerDetailsTitle.fontFamily = this.terminalFont;
    this.centerDetailsTitle.fontSize = isMobileLayout ? 24 : 21;
    this.centerDetailsTitle.color = '#7CFFEA';
    this.centerDetailsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.centerDetailsTitle.height = '28px';
    detailsTextStack.addControl(this.centerDetailsTitle);

    this.centerDetailsDesc = new TextBlock('centerDetailsDesc', 'Hover a module to analyze database metadata.');
    this.centerDetailsDesc.fontFamily = this.terminalFont;
    this.centerDetailsDesc.fontSize = isMobileLayout ? 21 : 19;
    this.centerDetailsDesc.color = '#647D7D';
    this.centerDetailsDesc.textWrapping = true;
    this.centerDetailsDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.centerDetailsDesc.height = '70px';
    detailsTextStack.addControl(this.centerDetailsDesc);
  }

  private makeTerminalPanel(id: string, w: number, h: number): Rectangle {
    const p = new Rectangle(id);
    p.width = w + 'px';
    p.height = h + 'px';
    p.thickness = 1;
    p.color = '#3B685C';
    p.background = 'rgba(10, 18, 22, 0.85)';
    return p;
  }

  private makeTerminalText(id: string, size: number, color: string): TextBlock {
    const t = new TextBlock(id, '');
    t.fontFamily = this.terminalFont;
    t.fontSize = Math.round(size * 1.12);
    t.color = color;
    t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    t.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    t.left = '20px';
    t.textWrapping = true;
    return t;
  }

  private makeTabButton(label: string, onClick: () => void): Button {
    const isMobileLayout = (this.gui.idealWidth || DESIGN_WIDTH) <= 960;
    const btn = Button.CreateSimpleButton(`tab_${label}`, label);
    btn.width = `${isMobileLayout ? 380 : 350}px`;
    btn.height = `${isMobileLayout ? 82 : 74}px`;
    btn.color = '#7CFFEA';
    btn.thickness = 1;
    btn.cornerRadius = 2;
    btn.background = 'rgba(20, 30, 35, 0.6)';
    btn.fontFamily = this.terminalFont;
    btn.fontSize = isMobileLayout ? 25 : 22;
    btn.onPointerUpObservable.add(onClick);
    return btn;
  }

  private clearLeftList(): void {
    const children = [...this.leftListStack.children];
    for (const child of children) {
      child.dispose();
    }
  }

  private getFormattedClassName(classId: string): string {
    switch (classId.toLowerCase()) {
      case 'mage': return 'WIZARD INSTALLER';
      case 'firewall': return 'FIREWALL';
      case 'rogue': return 'GLITCH';
      default: return classId.toUpperCase();
    }
  }

  private populateRunsList(): void {
    this.clearLeftList();
    if (this.runs.length === 0) {
      const emptyBtn = Button.CreateSimpleButton('empty_hs', 'NO RECORDED RUNS');
      const isMobileLayout = (this.gui.idealWidth || DESIGN_WIDTH) <= 960;
      emptyBtn.width = `${Math.max(420, this.leftListButtonWidth)}px`;
      emptyBtn.height = `${isMobileLayout ? 64 : 56}px`;
      emptyBtn.thickness = 0;
      emptyBtn.color = '#647D7D';
      emptyBtn.fontFamily = 'Arcade8Bit';
      emptyBtn.fontSize = isMobileLayout ? 22 : 19;
      this.leftListStack.addControl(emptyBtn);
      return;
    }

    for (let i = 0; i < this.runs.length; i++) {
      const run = this.runs[i];
      const dateStr = new Date(run.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const label = `#${i+1} [${this.getFormattedClassName(run.classId)}] - ${run.score.toLocaleString()} (${dateStr})`;
      const btn = this.makeLeftListButton(`left_run_${run.id}`, label, i === this.selectedRunIndex, () => {
        this.selectedRunIndex = i;
        this.populateRunsList();
        this.refreshRunSelection(false);
        this.updateListScroll(this.selectedRunIndex, this.runs.length);
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
    btn.color = active ? '#F1FFFC' : '#A3DCCF';
    btn.background = active ? 'rgba(26,98,89,0.65)' : 'rgba(10,24,34,0.84)';
    btn.isPointerBlocker = true;
    btn.isHitTestVisible = true;
    btn.onPointerClickObservable.add(onClick);
    if (btn.textBlock) {
      btn.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      btn.textBlock.paddingLeft = '10px';
      btn.textBlock.fontFamily = 'Arcade8Bit';
      btn.textBlock.fontSize = isMobileLayout ? 21 : 18;
    }
    return btn;
  }

  private updateListScroll(index: number, total: number): void {
    if (this.leftListScroll && this.leftListScroll.verticalBar && total > 1) {
      this.leftListScroll.verticalBar.value = index / (total - 1);
    }
  }

  private refreshRunSelection(resetTyping: boolean): void {
    this.setTerminalText(this.leftTitle, '> HIGHSCORES DIRECTORY', 220, false);
    this.setTerminalText(this.leftDescription, '> Local sector run achievements\n> Sorted by score performance.', 220, false);

    // Clear bonus icons
    const bChildren = [...this.bonusIconsStack.children];
    bChildren.forEach(child => child.dispose());

    // Reset details panel to default
    if (this.centerDetailsImg) {
      this.centerDetailsImg.isVisible = false;
      this.centerDetailsTitle.text = '> SYSTEM METRICS';
      this.centerDetailsDesc.text = 'Hover a module to analyze database metadata.';
    }

    if (this.runs.length === 0) {
      if (resetTyping) {
        this.setTerminalText(this.rightTitle, 'NO DATA');
        this.setTerminalText(this.rightBody, '> No highscores available.\n> Complete runs to store performance files.');
        this.centerCardSubtitle.text = 'No Active Logs';
      }
      return;
    }

    const run = this.runs[this.selectedRunIndex];
    if (!run) return;

    this.centerCardSubtitle.text = `CLASS: ${run.classId.toUpperCase()}`;

    // Populate bonus list in center panel
    if (run.bonuses && run.bonuses.length > 0) {
      const numRows = Math.ceil(run.bonuses.length / 8) || 1;
      const bonusesHeight = 60 + numRows * 64;
      this.centerBonusesContainer.height = `${bonusesHeight}px`;
      this.centerCard.height = `${160 + bonusesHeight}px`;

      const halfCardHeight = (160 + bonusesHeight) / 2;
      this.centerCardTitle.top = `-${halfCardHeight - 40}px`;
      this.centerCardSubtitle.top = `-${halfCardHeight - 80}px`;
      this.centerBonusesContainer.top = `40px`;

      const labelTop = -(bonusesHeight / 2) + 25;
      this.centerBonusLabel.top = `${labelTop}px`;

      this.bonusIconsStack.top = `15px`;

      let currentRowStack: StackPanel | null = null;
      for (let i = 0; i < run.bonuses.length; i++) {
        const bonus = run.bonuses[i];
        if (i % 8 === 0) {
          currentRowStack = new StackPanel(`hs_bonus_row_stack_${Math.floor(i / 8)}`);
          currentRowStack.isVertical = false;
          currentRowStack.spacing = 12;
          currentRowStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
          currentRowStack.height = '52px';
          this.bonusIconsStack.addControl(currentRowStack);
        }

        const box = new Rectangle(`hs_bonus_box_${bonus.id}`);
        box.width = '52px';
        box.height = '52px';
        box.thickness = 1;
        box.color = '#3B685C';
        box.background = 'rgba(10, 18, 22, 0.85)';
        box.isPointerBlocker = true;
        box.isHitTestVisible = true;
        box.hoverCursor = 'pointer';

        const img = new Image(`hs_bonus_img_${bonus.id}`, buildHudAssetUrl(`bonuses/${bonus.id}.png`));
        img.width = '38px';
        img.height = '38px';
        img.isHitTestVisible = false;
        box.addControl(img);

        if (bonus.stacks > 1) {
          const badge = new Rectangle(`hs_bonus_badge_${bonus.id}`);
          badge.width = '20px';
          badge.height = '16px';
          badge.thickness = 0;
          badge.background = '#FF3B5C';
          badge.cornerRadius = 2;
          badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          badge.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
          badge.left = '4px';
          badge.top = '4px';
          badge.isHitTestVisible = false;

          const badgeText = new TextBlock(`hs_bonus_badge_text_${bonus.id}`, `x${bonus.stacks}`);
          badgeText.fontFamily = this.terminalFont;
          badgeText.fontSize = 12;
          badgeText.color = '#FFFFFF';
          badgeText.isHitTestVisible = false;
          badge.addControl(badgeText);
          box.addControl(badge);
        }

        const def = BONUS_CODEX_ENTRIES.find(d => d.id === bonus.id) || {
          name: bonus.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: 'Custom system upgrade module loaded during execution.',
          effect: 'Standard performance parameters apply.'
        };
        box.onPointerEnterObservable.add(() => {
          this.centerDetailsImg.source = buildHudAssetUrl(`bonuses/${bonus.id}.png`);
          this.centerDetailsImg.isVisible = true;
          this.centerDetailsTitle.text = `${def.name.toUpperCase()} (x${bonus.stacks})`;
          this.centerDetailsDesc.text = `${def.description}\nEffect: ${def.effect}`;
        });
        box.onPointerOutObservable.add(() => {
          this.centerDetailsImg.isVisible = false;
          this.centerDetailsTitle.text = '> SYSTEM METRICS';
          this.centerDetailsDesc.text = 'Hover a module to analyze database metadata.';
        });

        if (currentRowStack) {
          currentRowStack.addControl(box);
        }
      }
    } else {
      this.centerBonusesContainer.height = '124px';
      this.centerCard.height = '284px';

      const halfCardHeight = 284 / 2;
      this.centerCardTitle.top = `-${halfCardHeight - 40}px`;
      this.centerCardSubtitle.top = `-${halfCardHeight - 80}px`;
      this.centerBonusesContainer.top = '40px';

      this.centerBonusLabel.top = '-37px';

      const noneText = new TextBlock('no_bonuses', 'NO BONUSES SELECTED');
      noneText.fontFamily = this.terminalFont;
      noneText.fontSize = 15;
      noneText.color = '#647D7D';
      noneText.isHitTestVisible = false;
      this.bonusIconsStack.addControl(noneText);
    }

    const dateStr = new Date(run.timestamp).toLocaleString('en-US');
    const body =
      `> Run Report Summary\n\n` +
      `Date: ${dateStr}\n` +
      `System Sector: ${run.roomReached}\n` +
      `Final Score: ${run.score.toLocaleString()}\n` +
      `Host Class: ${this.getFormattedClassName(run.classId)}\n\n` +
      `> System Parameters\n` +
      `Unique code: RUN-${run.id.toUpperCase()}\n` +
      `Discovered modules: ${run.bonuses ? run.bonuses.length : 0}\n\n` +
      `> Status: SAVED RECORD`;

    this.setTerminalText(this.rightTitle, `RUN RECORD #${this.selectedRunIndex + 1}`, 240, false);
    this.setTerminalText(this.rightBody, body, 280, true);
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
        if (!line.fullText.endsWith('\n')) {
          line.block.text = line.fullText + (this.cursorVisible && line.showCursor ? '_' : ' ');
        } else {
          line.block.text = line.fullText;
        }
        continue;
      }

      if (line.pauseMs > 0) {
        line.pauseMs -= dt;
        line.block.text = line.typed + (this.cursorVisible ? '_' : ' ');
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

        line.block.text = line.typed + (this.cursorVisible ? '_' : ' ');
      }
    }
  }

  private getDevLabel(): string {
    return this.codexService.getDevUnlockCodexEntries() ? 'DEV UNLOCK: ON' : 'DEV UNLOCK: OFF';
  }
}
