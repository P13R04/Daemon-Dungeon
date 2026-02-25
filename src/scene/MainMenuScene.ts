import { Scene, Engine, FreeCamera, Vector3, Color4 } from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { UI_LAYER } from '../ui/uiLayers';

export class MainMenuScene {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private codexPanel: Rectangle;
  private settingsPanel: Rectangle;

  constructor(private engine: Engine, private onPlayRequested: () => void) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.01, 0.01, 0.02, 1);

    const camera = new FreeCamera('mainMenuCamera', new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    this.scene.activeCamera = camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('MainMenuUI', true, this.scene);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    this.codexPanel = this.createInfoPanel('CODEX', 'ENEMIES / BONUSES / CLASSES\nCOMING SOON.');
    this.settingsPanel = this.createInfoPanel('SETTINGS', 'AUDIO / KEYBINDS / ACCESSIBILITY\nCOMING SOON.');
    this.codexPanel.isVisible = false;
    this.settingsPanel.isVisible = false;

    this.createMainButtons();
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    this.gui.dispose();
    this.scene.dispose();
  }

  private createMainButtons(): void {
    const title = new TextBlock('menuTitle');
    title.text = 'DAEMON DUNGEON';
    title.color = '#7CFFEA';
    title.fontSize = 56;
    title.fontFamily = 'Consolas';
    title.top = '-34%';
    this.gui.addControl(title);

    const subtitle = new TextBlock('menuSubtitle');
    subtitle.text = 'SYSTEM READY // MAIN CONSOLE';
    subtitle.color = '#9FEFE1';
    subtitle.fontSize = 16;
    subtitle.fontFamily = 'Consolas';
    subtitle.top = '-27%';
    this.gui.addControl(subtitle);

    const panel = new Rectangle('menuPanel');
    panel.width = '460px';
    panel.height = '280px';
    panel.thickness = 1;
    panel.cornerRadius = 8;
    panel.color = '#2EF9C3';
    panel.background = 'rgba(0,0,0,0.45)';
    panel.top = '-2%';
    this.gui.addControl(panel);

    const playBtn = this.makeButton('menuPlay', 'PLAY', -70, '#1D3B3A', '#FFFFFF', true);
    playBtn.onPointerUpObservable.add(() => {
      this.hidePanels();
      this.onPlayRequested();
    });
    panel.addControl(playBtn);

    const codexBtn = this.makeButton('menuCodex', 'CODEX', -10, 'rgba(20,30,35,0.9)', '#B8FFE6', false);
    codexBtn.onPointerUpObservable.add(() => {
      this.settingsPanel.isVisible = false;
      this.codexPanel.isVisible = !this.codexPanel.isVisible;
    });
    panel.addControl(codexBtn);

    const settingsBtn = this.makeButton('menuSettings', 'SETTINGS', 50, 'rgba(20,30,35,0.9)', '#B8FFE6', false);
    settingsBtn.onPointerUpObservable.add(() => {
      this.codexPanel.isVisible = false;
      this.settingsPanel.isVisible = !this.settingsPanel.isVisible;
    });
    panel.addControl(settingsBtn);

    const hint = new TextBlock('menuHint');
    hint.text = 'PLAY -> CLASS SELECT';
    hint.color = '#7C9C98';
    hint.fontSize = 12;
    hint.fontFamily = 'Consolas';
    hint.top = '104px';
    panel.addControl(hint);
  }

  private makeButton(id: string, label: string, top: number, background: string, color: string, thick: boolean): Button {
    const button = Button.CreateSimpleButton(id, label);
    button.width = '220px';
    button.height = '46px';
    button.color = color;
    button.cornerRadius = 6;
    button.background = background;
    button.thickness = thick ? 2 : 1;
    button.top = `${top}px`;
    return button;
  }

  private createInfoPanel(title: string, body: string): Rectangle {
    const panel = new Rectangle(`menuInfo_${title}`);
    panel.width = '520px';
    panel.height = '200px';
    panel.thickness = 1;
    panel.cornerRadius = 8;
    panel.color = '#2EF9C3';
    panel.background = 'rgba(0,0,0,0.65)';
    panel.top = '30%';
    panel.isPointerBlocker = true;
    this.gui.addControl(panel);

    const titleText = new TextBlock(`menuInfoTitle_${title}`);
    titleText.text = title;
    titleText.color = '#7CFFEA';
    titleText.fontSize = 24;
    titleText.fontFamily = 'Consolas';
    titleText.top = '-62px';
    panel.addControl(titleText);

    const bodyText = new TextBlock(`menuInfoBody_${title}`);
    bodyText.text = body;
    bodyText.color = '#9FEFE1';
    bodyText.fontSize = 14;
    bodyText.fontFamily = 'Consolas';
    bodyText.textWrapping = true;
    bodyText.width = '460px';
    bodyText.height = '110px';
    bodyText.top = '-8px';
    panel.addControl(bodyText);

    const closeBtn = Button.CreateSimpleButton(`menuInfoClose_${title}`, 'CLOSE');
    closeBtn.width = '120px';
    closeBtn.height = '34px';
    closeBtn.color = '#B8FFE6';
    closeBtn.cornerRadius = 4;
    closeBtn.background = 'rgba(20,30,35,0.9)';
    closeBtn.thickness = 1;
    closeBtn.top = '72px';
    closeBtn.onPointerUpObservable.add(() => {
      panel.isVisible = false;
    });
    panel.addControl(closeBtn);

    return panel;
  }

  private hidePanels(): void {
    this.codexPanel.isVisible = false;
    this.settingsPanel.isVisible = false;
  }
}
