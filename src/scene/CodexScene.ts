import {
  AnimationGroup,
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scalar,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Rectangle, ScrollViewer, StackPanel, TextBlock, Image } from '@babylonjs/gui';
import { buildHudAssetUrl, preloadHudAsset } from '../systems/hud/HudAssetPaths';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { getHudAssetBaseUrl } from '../systems/hud/HudAssetPaths';
import { createSynthwaveGridBackground } from './SynthwaveBackground';
import { BONUS_CODEX_ENTRIES, BonusCodexEntry } from '../data/codex/bonuses';
import { UIFactory } from '../ui/UIFactory';
import { UITheme } from '../ui/UITheme';
import { DaemonGlitchFx } from '../ui/DaemonGlitchFx';
import { AchievementProgress, CodexService } from '../services/CodexService';
import type { EnemyConfigEntry } from '../types/config';

type CodexSection = 'bestiary' | 'bonuses' | 'achievements';
type BestiaryGroup = 'normal' | 'boss';

interface EnemyCodexEntry {
  id: string;
  name: string;
  description: string;
  behavior: string;
  isBoss: boolean;
  attackType: string;
  hp: number;
  damage: number;
  attackSpeed: number;
  color: Color3;
}

interface CodexEnemyConfig extends EnemyConfigEntry {
  name?: string;
  description?: string;
  behavior?: string;
  appearance?: {
    color?: {
      r?: number;
      g?: number;
      b?: number;
    };
  };
}

interface BestiaryCarouselItem {
  entry: EnemyCodexEntry;
  root: TransformNode;
  animations: AnimationGroup[];
  isUnlocked: boolean;
  customUpdate?: (dt: number, time: number) => void;
}

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

export class CodexScene {
  private readonly terminalFont = 'Lucida Console';

  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private camera: ArcRotateCamera;

  // ── Audio ───────────────────────────────────────────────────────────────────
  private synthBeep: SciFiTypewriterSynth;

  private section: CodexSection = 'bestiary';
  private bestiaryGroup: BestiaryGroup = 'normal';

  private enemyEntries: EnemyCodexEntry[] = [];
  private bestiaryItems: BestiaryCarouselItem[] = [];
  private selectedBestiaryIndex: number = 0;
  private selectedBonusIndex: number = 0;
  private selectedAchievementIndex: number = 0;

  private carouselRotation: number = 0;
  private carouselTargetRotation: number = 0;
  private carouselRadius: number = 9;

  private leftPanel: Rectangle;
  private leftTitle: TextBlock;
  private leftDescription: TextBlock;
  private leftListStack!: StackPanel;
  private leftListScroll!: ScrollViewer;
  private leftFilterRow!: StackPanel;
  private leftFilterNormalBtn: Button;
  private leftFilterBossBtn: Button;

  private rightPanel: Rectangle;
  private rightTitle: TextBlock;
  private rightBody: TextBlock;

  private centerCard: Rectangle;
  private centerCardIcon: TextBlock;
  private centerCardTitle: TextBlock;
  private centerCardSubtitle: TextBlock;
  private centerCardArtwork: Image;

  private bestiaryFogLeft: Rectangle;
  private bestiaryFogRight: Rectangle;

  private headerTitle: TextBlock;
  private headerSubtitle: TextBlock;

  private terminalLines: TerminalLine[] = [];
  private cursorBlinkTimer: number = 0;
  private cursorVisible: boolean = true;

  private keyHandler: (event: KeyboardEvent) => void;
  private audioUnlockHandler: (() => void) | null = null;
  private glitchFx!: DaemonGlitchFx;

  constructor(
    private engine: Engine,
    private codexService: CodexService,
    private enemyConfigs: Record<string, CodexEnemyConfig>,
    private onBackToMenu: () => void
  ) {
    this.synthBeep = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);

    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromHexString(UITheme.colors.bgVoid);

    this.setupAudioUnlock();

    this.camera = new ArcRotateCamera('codexCamera', -Math.PI / 2, 1.44, 17.5, new Vector3(0, 1.7, 0), this.scene);
    this.camera.lowerRadiusLimit = 12;
    this.camera.upperRadiusLimit = 28;
    this.camera.wheelDeltaPercentage = 0.01;
    // We intentionally do NOT attachControl so the user cannot drag/zoom the camera manually

    const light = new HemisphericLight('codexLight', new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.95;

    const fill = new HemisphericLight('codexFill', new Vector3(-1, 1, 0), this.scene);
    fill.intensity = 0.34;

    createSynthwaveGridBackground(this.scene);

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('CodexUI', true, this.scene);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    // Preload artworks for better UX
    BONUS_CODEX_ENTRIES.forEach(b => preloadHudAsset(`bonuses/${b.id}.png`));
    this.codexService.getAchievementsProgress().forEach(a => preloadHudAsset(`achievements/${a.id}.png`));

    const root = new Rectangle('codexRoot');
    root.width = 1;
    root.height = 1;
    root.thickness = 0;
    root.background = 'rgba(5,8,16,0.15)';
    this.gui.addControl(root);

    this.headerTitle = new TextBlock('codexHeaderTitle');
    this.headerTitle.text = 'NEURAL CODEX';
    this.headerTitle.fontFamily = this.terminalFont;
    this.headerTitle.fontSize = 42;
    this.headerTitle.color = '#7FFFE7';
    this.headerTitle.top = '-44%';
    root.addControl(this.headerTitle);

    this.headerSubtitle = new TextBlock('codexHeaderSubtitle');
    this.headerSubtitle.text = '> DATABASE TERMINAL';
    this.headerSubtitle.fontFamily = this.terminalFont;
    this.headerSubtitle.fontSize = 14;
    this.headerSubtitle.color = '#8FDCCF';
    this.headerSubtitle.top = '-38.7%';
    root.addControl(this.headerSubtitle);

    const backBtn = this.makeTopButton('codexBack', 'BACK TO MENU', Control.HORIZONTAL_ALIGNMENT_LEFT, () => this.onBackToMenu());
    backBtn.left = '24px';
    root.addControl(backBtn);

    if (!import.meta.env.PROD) {
      const devBtn = this.makeTopButton('codexDev', this.getDevLabel(), Control.HORIZONTAL_ALIGNMENT_RIGHT, () => {
        this.codexService.setDevUnlockCodexEntries(!this.codexService.getDevUnlockCodexEntries());
        devBtn.textBlock!.text = this.getDevLabel();
        this.refreshSection(true);
      });
      devBtn.left = '-24px';
      root.addControl(devBtn);
    }

    const tabsRow = new StackPanel('codexTabsRow');
    tabsRow.isVertical = false;
    tabsRow.width = '760px';
    tabsRow.height = '48px';
    tabsRow.top = '-33%';
    root.addControl(tabsRow);

    tabsRow.addControl(this.makeTabButton('BESTIARY', () => {
      this.section = 'bestiary';
      this.refreshSection(false);
    }));
    tabsRow.addControl(this.makeTabButton('BONUSES', () => {
      this.section = 'bonuses';
      this.refreshSection(false);
    }));
    tabsRow.addControl(this.makeTabButton('ACHIEVEMENTS', () => {
      this.section = 'achievements';
      this.refreshSection(false);
    }));

    this.leftPanel = this.makeTerminalPanel('codexLeftPanel', 430, 530);
    this.leftPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.leftPanel.left = '24px';
    this.leftPanel.top = '58px';
    root.addControl(this.leftPanel);

    this.leftTitle = this.makeTerminalText('leftTitle', 20, '#7DFFE8');
    this.leftTitle.top = '-236px';
    this.leftTitle.width = '390px';
    this.leftTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftPanel.addControl(this.leftTitle);

    this.leftDescription = this.makeTerminalText('leftDescription', 13, '#9EE6DB');
    this.leftDescription.top = '-184px';
    this.leftDescription.width = '390px';
    this.leftDescription.height = '90px';
    this.leftDescription.textWrapping = true;
    this.leftDescription.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftPanel.addControl(this.leftDescription);

    this.leftFilterRow = new StackPanel('leftFilterRow');
    this.leftFilterRow.isVertical = false;
    this.leftFilterRow.width = '390px';
    this.leftFilterRow.height = '42px';
    this.leftFilterRow.top = '-120px';
    this.leftPanel.addControl(this.leftFilterRow);

    this.leftFilterNormalBtn = this.makeFilterButton('NORMAL', true, () => {
      this.bestiaryGroup = 'normal';
      this.refreshSection(false);
    });
    this.leftFilterBossBtn = this.makeFilterButton('BOSS', false, () => {
      this.bestiaryGroup = 'boss';
      this.refreshSection(false);
    });
    this.leftFilterRow.addControl(this.leftFilterNormalBtn);
    this.leftFilterRow.addControl(this.leftFilterBossBtn);

    const leftListFrame = UIFactory.createPanel('leftListFrame', 390, 270);
    leftListFrame.top = '44px';
    this.leftPanel.addControl(leftListFrame);

    this.leftListScroll = UIFactory.createScrollViewer('leftListScroll');
    this.leftListScroll.width = '100%';
    this.leftListScroll.height = '100%';
    leftListFrame.addControl(this.leftListScroll);

    this.leftListStack = new StackPanel('leftListStack');
    this.leftListStack.isVertical = true;
    this.leftListStack.width = '100%';
    this.leftListStack.paddingTop = '6px';
    this.leftListStack.paddingBottom = '6px';
    this.leftListStack.isPointerBlocker = false;
    this.leftListScroll.addControl(this.leftListStack);

    this.rightPanel = this.makeTerminalPanel('codexRightPanel', 430, 530);
    this.rightPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.rightPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rightPanel.left = '-24px';
    this.rightPanel.top = '58px';
    root.addControl(this.rightPanel);

    this.rightTitle = this.makeTerminalText('rightTitle', 34, '#7EFFE7');
    this.rightTitle.top = '-208px';
    this.rightTitle.width = '390px';
    this.rightTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.rightPanel.addControl(this.rightTitle);

    this.rightBody = this.makeTerminalText('rightBody', 14, '#A7EFE2');
    this.rightBody.top = '-8px';
    this.rightBody.width = '390px';
    this.rightBody.height = '380px';
    this.rightBody.textWrapping = true;
    this.rightBody.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.rightPanel.addControl(this.rightBody);

    this.centerCard = this.makeTerminalPanel('centerFlatCard', 250, 280);
    this.centerCard.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.centerCard.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.centerCard.top = '38px';
    root.addControl(this.centerCard);

    this.centerCardIcon = this.makeTerminalText('centerCardIcon', 64, '#8CFFF0');
    this.centerCardIcon.top = '-58px';
    this.centerCard.addControl(this.centerCardIcon);

    this.centerCardArtwork = new Image('centerCardArtwork');
    this.centerCardArtwork.width = '140px';
    this.centerCardArtwork.height = '140px';
    this.centerCardArtwork.stretch = Image.STRETCH_UNIFORM;
    this.centerCardArtwork.top = '-40px';
    this.centerCardArtwork.isVisible = false;
    this.centerCard.addControl(this.centerCardArtwork);

    this.centerCardTitle = this.makeTerminalText('centerCardTitle', 20, '#C8FFF8');
    this.centerCardTitle.top = '34px';
    this.centerCard.addControl(this.centerCardTitle);

    this.centerCardSubtitle = this.makeTerminalText('centerCardSubtitle', 13, '#8FDACF');
    this.centerCardSubtitle.top = '72px';
    this.centerCard.addControl(this.centerCardSubtitle);

    this.bestiaryFogLeft = new Rectangle('bestiaryFogLeft');
    this.bestiaryFogLeft.width = '180px';
    this.bestiaryFogLeft.height = '420px';
    this.bestiaryFogLeft.thickness = 0;
    this.bestiaryFogLeft.background = 'rgba(8,14,24,0.53)';
    this.bestiaryFogLeft.left = '-270px';
    this.bestiaryFogLeft.top = '44px';
    this.bestiaryFogLeft.isPointerBlocker = false;
    this.bestiaryFogLeft.isHitTestVisible = false;
    root.addControl(this.bestiaryFogLeft);

    this.bestiaryFogRight = new Rectangle('bestiaryFogRight');
    this.bestiaryFogRight.width = '180px';
    this.bestiaryFogRight.height = '420px';
    this.bestiaryFogRight.thickness = 0;
    this.bestiaryFogRight.background = 'rgba(8,14,24,0.53)';
    this.bestiaryFogRight.left = '270px';
    this.bestiaryFogRight.top = '44px';
    this.bestiaryFogRight.isPointerBlocker = false;
    this.bestiaryFogRight.isHitTestVisible = false;
    root.addControl(this.bestiaryFogRight);

    const navRow = new StackPanel('codexBottomNav');
    navRow.isVertical = false;
    navRow.width = '260px';
    navRow.height = '56px';
    navRow.top = '42%';
    root.addControl(navRow);

    const leftNavBtn = UIFactory.createTerminalButton('codexNavLeft', '<', '110px', '46px');
    DaemonGlitchFx.inject(leftNavBtn, '<', () => this.navigateBy(-1), 0);
    navRow.addControl(leftNavBtn);

    const rightNavBtn = UIFactory.createTerminalButton('codexNavRight', '>', '110px', '46px');
    DaemonGlitchFx.inject(rightNavBtn, '>', () => this.navigateBy(1), 0);
    navRow.addControl(rightNavBtn);

    const navHint = this.makeTerminalText('navHint', 13, '#8FD9CE');
    navHint.text = '> navigate: arrows / qd / ad';
    navHint.top = '35.8%';
    root.addControl(navHint);

    this.keyHandler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'q' || key === 'a') {
        this.navigateBy(-1);
        event.preventDefault();
      } else if (key === 'arrowright' || key === 'd' || key === ' ' || key === 'spacebar') {
        this.navigateBy(1);
        event.preventDefault();
      } else if (key === 'escape') {
        this.onBackToMenu();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    this.buildEnemyEntries();
    this.refreshSection(true);

    this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime();
      this.updateTerminalLines(dt);

      if (this.section === 'bestiary') {
        const lerpAmount = Math.min(1, dt * 0.01);
        this.carouselRotation = Scalar.Lerp(this.carouselRotation, this.carouselTargetRotation, lerpAmount);
        this.updateBestiaryCarouselLayout();
        
        const time = performance.now() * 0.001;
        for (const item of this.bestiaryItems) {
          if (item.customUpdate) {
            item.customUpdate(dt, time);
          }
        }
      }
    });

    this.scene.onPrePointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERWHEEL) {
        if (this.leftListScroll && this.leftListScroll.verticalBar) {
          const event = info.event as WheelEvent;
          this.leftListScroll.verticalBar.value += Math.sign(event.deltaY) * 0.08;
          this.leftListScroll.verticalBar.value = Scalar.Clamp(this.leftListScroll.verticalBar.value, 0, 1);
        }
      }
    });
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
      this.audioUnlockHandler = null;
    }
    this.synthBeep.dispose();
    this.disposeBestiaryCarousel();
    this.gui.dispose();
    this.scene.dispose();
  }

  private setupAudioUnlock(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    // Prevent Babylon's default "Unmute" button and unlock on first user gesture.
    audioEngine.useCustomUnlockedButton = true;

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

  private getDevLabel(): string {
    return this.codexService.getDevUnlockCodexEntries() ? 'DEV UNLOCK: ON' : 'DEV UNLOCK: OFF';
  }

  private makeTopButton(id: string, label: string, alignment: number, onClick: () => void): Button {
    const btn = UIFactory.createTerminalButton(id, label, '160px', '36px');
    btn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    btn.horizontalAlignment = alignment;
    btn.top = '20px';
    btn.onPointerClickObservable.add(onClick);
    return btn;
  }

  private makeTabButton(label: string, onClick: () => void): Button {
    const btn = UIFactory.createTerminalButton(`tab_${label}`, label, '246px', '40px');
    DaemonGlitchFx.inject(btn, label, onClick, 0);
    return btn;
  }

  private makeFilterButton(label: string, active: boolean, onClick: () => void): Button {
    const btn = UIFactory.createTerminalButton(`bestiary_filter_${label}`, label, '190px', '34px');
    btn.color = active ? UITheme.colors.textHighlight : UITheme.colors.borderBright;
    btn.background = active ? UITheme.colors.hoverBg : UITheme.colors.bgPanel;
    btn.onPointerClickObservable.add(onClick);
    return btn;
  }

  private makeTerminalPanel(id: string, width: number, height: number): Rectangle {
    return UIFactory.createPanel(id, width, height);
  }

  private makeTerminalText(id: string, size: number, color: string): TextBlock {
    return UIFactory.createText(id, '', size, color);
  }

  private setTerminalText(block: TextBlock, text: string, speed = 220, showCursor = true): void {
    const current = this.terminalLines.find((line) => line.block === block);
    if (current) {
      current.fullText = text;
      current.typed = '';
      current.index = 0;
      current.timer = 0;
      current.speed = speed;
      current.burstCount = 0;
      current.burstTarget = 12 + Math.floor(Math.random() * 10);
      current.pauseMs = 0;
      current.showCursor = showCursor;
      block.text = '';
      return;
    }

    this.terminalLines.push({
      block,
      fullText: text,
      typed: '',
      index: 0,
      speed,
      timer: 0,
      burstCount: 0,
      burstTarget: 12 + Math.floor(Math.random() * 10),
      pauseMs: 0,
      showCursor,
    });
    block.text = '';
  }

  private updateTerminalLines(deltaMs: number): void {
    this.cursorBlinkTimer += deltaMs;
    if (this.cursorBlinkTimer >= 400) {
      this.cursorBlinkTimer = 0;
      this.cursorVisible = !this.cursorVisible;
    }

    for (const line of this.terminalLines) {
      if (line.pauseMs > 0) {
        line.pauseMs = Math.max(0, line.pauseMs - deltaMs);
      }

      line.timer += deltaMs;
      const threshold = 1000 / Math.max(1, line.speed);
      while (line.pauseMs <= 0 && line.timer >= threshold && line.index < line.fullText.length) {
        line.timer -= threshold;
        line.typed += line.fullText[line.index++];
        this.playBeep();

        line.burstCount++;
        if (line.burstCount >= line.burstTarget && line.index < line.fullText.length) {
          line.pauseMs = 18 + Math.random() * 28;
          line.burstCount = 0;
          line.burstTarget = 12 + Math.floor(Math.random() * 10);
        }
      }

      const cursor = line.showCursor ? (this.cursorVisible ? ' _' : '  ') : '';
      line.block.text = `${line.typed}${cursor}`;
    }
  }

  private playBeep(): void {
    this.synthBeep.triggerForTypedChar();
  }

  private buildEnemyEntries(): void {
    const entries: EnemyCodexEntry[] = [];

    for (const [id, config] of Object.entries(this.enemyConfigs)) {
      const stats = config?.baseStats ?? {};
      const appearance = config?.appearance?.color ?? {};

      entries.push({
        id,
        name: config?.name ?? id,
        description: config?.description ?? 'No description available.',
        behavior: config?.behavior ?? 'unknown',
        isBoss: id.includes('_boss') || (config?.name ?? '').toLowerCase().includes('boss'),
        attackType: this.mapBehaviorToAttackType(config?.behavior ?? 'unknown'),
        hp: Number(stats?.hp ?? 0),
        damage: Number(stats?.damage ?? 0),
        attackSpeed: Number(stats?.attackCooldown ?? 0) > 0 ? 1 / Number(stats.attackCooldown) : 0,
        color: new Color3(
          typeof appearance.r === 'number' ? appearance.r : 0.5,
          typeof appearance.g === 'number' ? appearance.g : 0.9,
          typeof appearance.b === 'number' ? appearance.b : 0.8
        ),
      });
    }

    this.enemyEntries = entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  private mapBehaviorToAttackType(behavior: string): string {
    if (behavior.includes('turret') || behavior.includes('sentinel') || behavior.includes('bullet') || behavior.includes('laser')) {
      return 'Ranged';
    }
    if (behavior.includes('healer')) {
      return 'Support';
    }
    if (behavior.includes('boss')) {
      return 'Boss pattern';
    }
    return 'Melee';
  }

  private refreshSection(resetTyping: boolean): void {
    this.clearLeftList();

    if (this.section === 'bestiary') {
      this.leftFilterRow.isVisible = true;
      this.centerCard.isVisible = false;
      this.bestiaryFogLeft.isVisible = true;
      this.bestiaryFogRight.isVisible = true;

      this.leftFilterNormalBtn.background = this.bestiaryGroup === 'normal' ? 'rgba(46,249,195,0.35)' : 'rgba(9,27,33,0.82)';
      this.leftFilterBossBtn.background = this.bestiaryGroup === 'boss' ? 'rgba(46,249,195,0.35)' : 'rgba(9,27,33,0.82)';

      this.populateBestiaryCarousel();
      this.populateBestiaryList();
      this.refreshBestiarySelection(resetTyping);
      return;
    }

    this.disposeBestiaryCarousel();
    this.leftFilterRow.isVisible = false;
    this.centerCard.isVisible = true;
    this.bestiaryFogLeft.isVisible = false;
    this.bestiaryFogRight.isVisible = false;

    if (this.section === 'bonuses') {
      this.populateBonusList();
      this.refreshBonusSelection(resetTyping);
      return;
    }

    this.populateAchievementList();
    this.refreshAchievementSelection(resetTyping);
  }

  private clearLeftList(): void {
    const children = [...this.leftListStack.children];
    for (const child of children) {
      child.dispose();
    }
  }

  private populateBestiaryList(): void {
    const entries = this.getBestiaryEntriesForGroup();
    for (let i = 0; i < entries.length; i++) {
      const item = this.bestiaryItems[i];
      const entry = entries[i];
      if (!item || !entry) continue;
      const label = item.isUnlocked ? entry.name : '[LOCKED ENTITY]';
      const btn = this.makeLeftListButton(`left_beast_${entry.id}`, label, i === this.selectedBestiaryIndex, () => {
        this.selectBestiaryIndex(i);
      });
      this.leftListStack.addControl(btn);
    }
  }

  private populateBonusList(): void {
    for (let i = 0; i < BONUS_CODEX_ENTRIES.length; i++) {
      const bonus = BONUS_CODEX_ENTRIES[i];
      const unlocked = this.codexService.isBonusUnlocked(bonus.id);
      const label = unlocked ? `${bonus.iconText} ${bonus.name}` : '[LOCKED BONUS]';
      const btn = this.makeLeftListButton(`left_bonus_${bonus.id}`, label, i === this.selectedBonusIndex, () => {
        this.selectedBonusIndex = i;
        this.clearLeftList();
        this.populateBonusList();
        this.refreshBonusSelection(false);
        this.updateListScroll(this.selectedBonusIndex, BONUS_CODEX_ENTRIES.length);
      });
      this.leftListStack.addControl(btn);
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
    const btn = Button.CreateSimpleButton(id, label);
    btn.width = '382px';
    btn.height = '38px';
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
    }
    return btn;
  }

  private getBestiaryEntriesForGroup(): EnemyCodexEntry[] {
    return this.enemyEntries.filter((entry) => (this.bestiaryGroup === 'boss' ? entry.isBoss : !entry.isBoss));
  }

  private populateBestiaryCarousel(): void {
    this.disposeBestiaryCarousel();

    const entries = this.getBestiaryEntriesForGroup();
    const count = Math.max(1, entries.length);
    this.carouselRadius = Scalar.Clamp(6.8 + count * 0.45, 7.2, 14.5);
    this.updateBestiaryCamera(count);

    for (const entry of entries) {
      const unlocked = this.codexService.isEnemyUnlocked(entry.id);
      const root = new TransformNode(`bestiary_${entry.id}`, this.scene);
      root.position.y = 0.85;
      this.bestiaryItems.push({ entry, root, animations: [], isUnlocked: unlocked });

      void this.populateEnemyVisual(root, entry, unlocked).then((animations) => {
        const item = this.bestiaryItems.find((candidate) => candidate.root === root);
        if (!item) return;
        item.animations = animations;
        for (const group of animations) {
          group.loopAnimation = true;
          group.play(true);
        }
      });
    }

    this.selectedBestiaryIndex = Math.min(this.selectedBestiaryIndex, Math.max(0, this.bestiaryItems.length - 1));
    const step = this.bestiaryItems.length > 0 ? (Math.PI * 2) / this.bestiaryItems.length : 0;
    this.carouselTargetRotation = -this.selectedBestiaryIndex * step;
    this.carouselRotation = this.carouselTargetRotation;
    this.updateBestiaryCarouselLayout();
  }

  private async populateEnemyVisual(root: TransformNode, entry: EnemyCodexEntry, unlocked: boolean): Promise<AnimationGroup[]> {
    if (!unlocked) {
      this.createEnemyPlaceholder(root, new Color3(0.23, 0.23, 0.27), entry.behavior, entry.isBoss);
      return [];
    }

    let urlPath = '';
    let fileName = '';
    let scale = entry.isBoss ? 0.18 : 0.13;
    let rotation = Vector3.Zero();
    let mainAnimName = '';
    let useColor = false;

    if (entry.behavior === 'bull') {
      urlPath = 'models/bull/'; fileName = 'bull.glb';
      mainAnimName = 'charge_run.001';
      rotation = new Vector3(0, Math.PI, 0); // vers la gauche par rapport à PI/2
    } else if (entry.behavior === 'jumper') {
      urlPath = 'models/jumper/'; fileName = 'sauteur.glb';
      scale = entry.isBoss ? 0.36 : 0.26; // x2
    } else if (['turret', 'bullet_hell', 'mage_missile'].includes(entry.behavior)) {
      if (entry.behavior === 'bullet_hell') {
        urlPath = 'models/bullet_hell/';
        fileName = 'tde_socle_bullet_hell(crying obsidian).glb';
      } else if (entry.behavior === 'mage_missile') {
        urlPath = 'models/mage_missile/';
        fileName = 'tde_socle_red_n_white.glb';
      } else {
        urlPath = 'models/caster/';
        fileName = 'caster_socle.glb';
      }
      mainAnimName = 'idle';
    } else if (['sentinel', 'prefire_sentinel', 'healer', 'artificer', 'necromancer', 'swarm_coordinator'].includes(entry.behavior)) {
      if (entry.behavior === 'healer') {
        urlPath = 'models/healer/';
        fileName = 'tde_float_yellow.glb';
      } else {
        urlPath = 'models/caster/';
        fileName = 'caster_mobile.glb';
      }
      mainAnimName = 'forward';
      rotation = Vector3.Zero(); // vers la droite par rapport à PI/2
    } else if (entry.behavior === 'missile') {
      urlPath = 'models/caster/'; fileName = 'missile.glb';
      scale = 0.16; // x2
      rotation = Vector3.Zero();
    } else if (entry.behavior === 'pong') {
      urlPath = 'models/pong/'; fileName = 'pong.glb';
      scale = 0.24; // x6
      rotation = Vector3.Zero();
    } else if (['chase', 'flee', 'strategist', 'spike_strategist', 'fuyard'].includes(entry.behavior)) {
      urlPath = 'models/zombie/'; fileName = 'zombie.glb';
      scale = entry.isBoss ? 2.25 : 0.75; // x3
      rotation = Vector3.Zero();
      mainAnimName = ['flee', 'strategist', 'spike_strategist', 'fuyard'].includes(entry.behavior) ? 'Zombie_idle' : 'Zombie_attack_1';
      useColor = true;
    } else {
      this.createEnemyPlaceholder(root, entry.color, entry.behavior, entry.isBoss);
      return [];
    }

    try {
      const result = await SceneLoader.ImportMeshAsync('', getHudAssetBaseUrl() + urlPath, fileName, this.scene);
      const mainRoot = result.meshes[0];
      if (mainRoot) {
        mainRoot.parent = root;
        mainRoot.scaling.setAll(scale);
        mainRoot.position = Vector3.Zero();
        mainRoot.rotation = rotation;
        
        const item = this.bestiaryItems.find(i => i.root === root);
        if (item) {
          if (entry.behavior === 'missile') {
            item.customUpdate = (dt, time) => {
              mainRoot.rotation.y += dt * 0.002;
              mainRoot.position.y = Math.sin(time * 3) * 0.15;
            };
          } else if (entry.behavior === 'jumper') {
            let state: 'idle' | 'jump' = 'idle';
            let timer = 0;
            const cooldown = 1.5;
            const jumpDuration = 1.4;
            const jumpAnim = result.animationGroups[0];
            
            item.customUpdate = (dt) => {
              const dtSec = dt * 0.001;
              timer += dtSec;
              
              if (state === 'idle') {
                mainRoot.position.y = 0;
                if (timer >= cooldown) {
                  state = 'jump';
                  timer = 0;
                  if (jumpAnim) {
                    const animLengthSecs = (jumpAnim.to - jumpAnim.from) / 60;
                    const speed = animLengthSecs / jumpDuration;
                    jumpAnim.start(false, speed, jumpAnim.from, jumpAnim.to, false);
                  }
                }
              } else if (state === 'jump') {
                const progress = timer / jumpDuration;
                if (progress >= 1.0) {
                  state = 'idle';
                  timer = 0;
                  mainRoot.position.y = 0;
                } else {
                  mainRoot.position.y = Math.sin(progress * Math.PI) * 0.8;
                }
              }
            };
          }
        }
      }

      for (const mesh of result.meshes) {
        if (mesh !== mainRoot && mesh.parent === null) {
          mesh.parent = root;
        }
        mesh.layerMask = SCENE_LAYER;
        
        if (useColor) {
          if (mesh.material && mesh.material.getClassName() === 'PBRMaterial') {
            (mesh.material as any).albedoColor = entry.color;
          } else if (mesh.material && mesh.material.getClassName() === 'StandardMaterial') {
            (mesh.material as any).diffuseColor = entry.color;
          }
        }
      }

      if (mainAnimName) {
        const anim = result.animationGroups.find(g => g.name === mainAnimName);
        if (anim) {
          result.animationGroups.forEach(g => {
            if (g !== anim) g.stop();
          });
          return [anim];
        }
      }

      if (entry.behavior === 'jumper') {
        result.animationGroups.forEach(g => g.stop());
        return [];
      }

      return result.animationGroups;
    } catch (error) {
      console.warn(`Failed to load model for ${entry.id}`, error);
      this.createEnemyPlaceholder(root, entry.color, entry.behavior, entry.isBoss);
      return [];
    }
  }

  private createEnemyPlaceholder(root: TransformNode, color: Color3, behavior: string, isBoss: boolean): void {
    const body = this.buildEnemyPlaceholderMesh(behavior, isBoss);
    body.parent = root;
    body.layerMask = SCENE_LAYER;

    const mat = new StandardMaterial(`${root.name}_mat`, this.scene);
    mat.diffuseColor = color.scale(0.6);
    mat.emissiveColor = color.scale(0.3);
    body.material = mat;

    const base = MeshBuilder.CreateCylinder(`${root.name}_base`, {
      diameter: isBoss ? 2.0 : 1.4,
      height: 0.12,
      tessellation: 24,
    }, this.scene);
    base.parent = root;
    base.position.y = 0.06;
    base.layerMask = SCENE_LAYER;

    const baseMat = new StandardMaterial(`${root.name}_base_mat`, this.scene);
    baseMat.diffuseColor = new Color3(0.08, 0.08, 0.12);
    baseMat.emissiveColor = color.scale(0.2);
    base.material = baseMat;
  }

  private buildEnemyPlaceholderMesh(behavior: string, isBoss: boolean): Mesh {
    const scale = isBoss ? 1.3 : 1.0;

    if (behavior === 'bull' || behavior === 'jumper') {
      const capsule = MeshBuilder.CreateCapsule('codexEnemyCapsule', {
        radius: 0.45 * scale,
        height: 1.8 * scale,
      }, this.scene);
      capsule.position.y = 0.9 * scale;
      return capsule;
    }

    if (behavior.includes('turret') || behavior.includes('bullet') || behavior.includes('laser')) {
      const cylinder = MeshBuilder.CreateCylinder('codexEnemyTurret', {
        diameter: 1.5 * scale,
        height: 1.2 * scale,
        tessellation: 8,
      }, this.scene);
      cylinder.position.y = 0.6 * scale;
      return cylinder;
    }

    if (behavior.includes('healer') || behavior.includes('necromancer')) {
      const sphere = MeshBuilder.CreateSphere('codexEnemySphere', {
        diameter: 1.4 * scale,
        segments: 12,
      }, this.scene);
      sphere.position.y = 0.7 * scale;
      return sphere;
    }

    const box = MeshBuilder.CreateBox('codexEnemyBox', {
      width: 1.2 * scale,
      height: 1.2 * scale,
      depth: 1.2 * scale,
    }, this.scene);
    box.position.y = 0.6 * scale;
    return box;
  }

  private updateBestiaryCamera(enemyCount: number): void {
    this.camera.setTarget(new Vector3(0, Scalar.Clamp(1.55 + enemyCount * 0.03, 1.55, 2.25), 0));
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = Scalar.Clamp(1.40 + enemyCount * 0.006, 1.40, 1.50);
    this.camera.radius = Scalar.Clamp(15.8 + enemyCount * 0.42, 15.8, 24.5);
  }

  private updateBestiaryCarouselLayout(): void {
    const count = this.bestiaryItems.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const item = this.bestiaryItems[i];
      const angle = this.carouselRotation + Math.PI + (i * (Math.PI * 2)) / count;
      const x = Math.sin(angle) * this.carouselRadius;
      const z = Math.cos(angle) * this.carouselRadius;

      item.root.position.x = x;
      item.root.position.z = z;
      item.root.lookAt(new Vector3(this.camera.position.x, item.root.position.y, this.camera.position.z));
      item.root.rotation.y += (Math.PI / 2) + Math.PI;

      const depthFactor = Scalar.Clamp((z + this.carouselRadius) / (2 * this.carouselRadius), 0, 1);
      const focusBoost = i === this.selectedBestiaryIndex ? 0.16 : 0;
      const scale = 0.78 + depthFactor * 0.45 + focusBoost;
      item.root.scaling.setAll(scale);

      const alpha = 0.2 + depthFactor * 0.8;
      this.setRootAlpha(item.root, alpha);
    }
  }

  private setRootAlpha(root: TransformNode, alpha: number): void {
    const meshes = root.getChildMeshes();
    for (const mesh of meshes) {
      const material = mesh.material as StandardMaterial | null;
      if (!material) continue;
      material.alpha = alpha;
    }
  }

  private navigateBy(step: number): void {
    if (this.section === 'bestiary') {
      this.selectBestiaryIndex(this.selectedBestiaryIndex - step);
      return;
    }

    if (this.section === 'bonuses') {
      const count = BONUS_CODEX_ENTRIES.length;
      if (count === 0) return;
      this.selectedBonusIndex = (this.selectedBonusIndex + step + count) % count;
      this.clearLeftList();
      this.populateBonusList();
      this.refreshBonusSelection(false);
      this.updateListScroll(this.selectedBonusIndex, count);
      return;
    }

    const achievements = this.codexService.getAchievementsProgress();
    const count = achievements.length;
    if (count === 0) return;
    this.selectedAchievementIndex = (this.selectedAchievementIndex + step + count) % count;
    this.clearLeftList();
    this.populateAchievementList();
    this.refreshAchievementSelection(false);
    this.updateListScroll(this.selectedAchievementIndex, count);
  }

  private updateListScroll(index: number, total: number): void {
    if (this.leftListScroll && this.leftListScroll.verticalBar && total > 1) {
      this.leftListScroll.verticalBar.value = index / (total - 1);
    }
  }

  private selectBestiaryIndex(index: number): void {
    const count = this.bestiaryItems.length;
    if (count === 0) return;

    const oldIndex = this.selectedBestiaryIndex;
    this.selectedBestiaryIndex = ((index % count) + count) % count;
    
    let diff = this.selectedBestiaryIndex - oldIndex;
    if (diff > count / 2) diff -= count;
    else if (diff < -count / 2) diff += count;

    const stepAngle = (Math.PI * 2) / count;
    this.carouselTargetRotation -= diff * stepAngle;

    this.clearLeftList();
    this.populateBestiaryList();
    this.refreshBestiarySelection(false);
    this.updateListScroll(this.selectedBestiaryIndex, count);
  }

  private refreshBestiarySelection(resetTyping: boolean): void {
    const selected = this.bestiaryItems[this.selectedBestiaryIndex];
    if (!selected) {
      if (resetTyping) {
        this.setTerminalText(this.leftTitle, '> BESTIARY');
        this.setTerminalText(this.leftDescription, '> No entries available in this category.');
        this.setTerminalText(this.rightTitle, 'NO ENTRY');
        this.setTerminalText(this.rightBody, '> No data loaded.');
      }
      return;
    }

    const leftDesc = this.bestiaryGroup === 'boss'
      ? '> Bosses are high-threat entities\n> capable of ending a run on their own.'
      : '> Enemies are daemon-aligned\n> execution units testing your resilience.';

    this.setTerminalText(this.leftTitle, this.bestiaryGroup === 'boss' ? '> BESTIARY // BOSSES' : '> BESTIARY // ENEMIES', 220, false);
    this.setTerminalText(this.leftDescription, leftDesc, 220, false);

    if (!selected.isUnlocked) {
      this.setTerminalText(this.rightTitle, '[LOCKED ENTITY]');
      this.setTerminalText(this.rightBody, '> Status: encrypted\n> Unlock by encountering this enemy in a run.');
      return;
    }

    const e = selected.entry;
    const body =
      `> Description\n${e.description}\n\n` +
      `> Core Stats\n` +
      `Type: ${e.isBoss ? 'Boss' : 'Regular'}\n` +
      `Attack Type: ${e.attackType}\n` +
      `HP: ${e.hp}\n` +
      `Damage: ${e.damage}\n` +
      `Attack Speed: ${e.attackSpeed > 0 ? e.attackSpeed.toFixed(2) + '/s' : 'N/A'}\n\n` +
      `> Runtime\nBehavior ID: ${e.behavior}\nEnemy ID: ${e.id}`;

    this.setTerminalText(this.rightTitle, e.name, 240, false);
    this.setTerminalText(this.rightBody, body, 280, true);
  }

  private refreshBonusSelection(resetTyping: boolean): void {
    this.populateBonusList();

    this.setTerminalText(this.leftTitle, '> BONUS DATABASE', 220, false);
    this.setTerminalText(this.leftDescription, '> Select a bonus to inspect effects,\n> category tags and synergy notes.', 220, false);

    const bonus = BONUS_CODEX_ENTRIES[this.selectedBonusIndex];
    if (!bonus) {
      if (resetTyping) {
        this.setTerminalText(this.rightTitle, 'NO BONUS');
        this.setTerminalText(this.rightBody, '> No bonus registered.');
      }
      return;
    }

    const unlocked = this.codexService.isBonusUnlocked(bonus.id);
    if (!unlocked) {
      this.centerCardIcon.isVisible = true;
      this.centerCardArtwork.isVisible = false;
      this.centerCardIcon.text = '?';
      this.centerCardTitle.text = 'LOCKED';
      this.centerCardSubtitle.text = 'Undiscovered bonus';
      this.setTerminalText(this.rightTitle, '[LOCKED BONUS]');
      this.setTerminalText(this.rightBody, '> Unlock this bonus by obtaining it in a run.');
      return;
    }

    // Leave centerCardIcon visible so it serves as a background fallback if the image is transparent
    this.centerCardIcon.isVisible = true;
    this.centerCardArtwork.isVisible = true;
    this.centerCardArtwork.source = buildHudAssetUrl(`bonuses/${bonus.id}.png`);

    this.centerCardTitle.text = bonus.name;
    this.centerCardSubtitle.text = bonus.categories.join(' / ');

    const body =
      `> Description\n${bonus.description}\n\n` +
      `> Effect\n${bonus.effect}\n\n` +
      `> Characteristics\n${bonus.characteristics}\n\n` +
      `> Categories\n${bonus.categories.join(', ')}\n\n` +
      `> ID\n${bonus.id}`;

    this.setTerminalText(this.rightTitle, bonus.name, 240, false);
    this.setTerminalText(this.rightBody, body, 280, true);
  }

  private refreshAchievementSelection(resetTyping: boolean): void {
    this.populateAchievementList();

    this.setTerminalText(this.leftTitle, '> ACHIEVEMENTS LOG', 220, false);
    this.setTerminalText(this.leftDescription, '> Track completion conditions\n> and current unlock state.', 220, false);

    const achievements = this.codexService.getAchievementsProgress();
    const achievement = achievements[this.selectedAchievementIndex];
    if (!achievement) {
      if (resetTyping) {
        this.setTerminalText(this.rightTitle, 'NO ACHIEVEMENT');
        this.setTerminalText(this.rightBody, '> No achievement loaded.');
      }
      return;
    }

    if (achievement.unlocked) {
      // Leave centerCardIcon visible so it serves as a background fallback if the image is transparent
      this.centerCardIcon.isVisible = true;
      this.centerCardArtwork.isVisible = true;
      this.centerCardArtwork.source = buildHudAssetUrl(`achievements/${achievement.id}.png`);
    } else {
      this.centerCardIcon.isVisible = true;
      this.centerCardArtwork.isVisible = false;
      this.centerCardIcon.text = '?';
    }

    this.centerCardTitle.text = achievement.name;
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
    this.setTerminalText(this.rightBody, body, 280, true);
  }

  private disposeBestiaryCarousel(): void {
    for (const item of this.bestiaryItems) {
      for (const group of item.animations) {
        if (group.isPlaying) {
          group.stop();
        }
        group.dispose();
      }

      const childMeshes = item.root.getChildMeshes();
      for (const mesh of childMeshes) {
        mesh.dispose();
      }
      item.root.dispose();
    }

    this.bestiaryItems = [];
  }
}
