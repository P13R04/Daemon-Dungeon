import { Scene, Engine, FreeCamera, Vector3, Color4 } from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { UI_LAYER } from '../ui/uiLayers';

export class MainMenuScene {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;

  constructor(
    private engine: Engine,
    private onPlayRequested: () => void,
    private onCodexRequested: () => void
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.01, 0.01, 0.02, 1);

    const camera = new FreeCamera('mainMenuCamera', new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    this.scene.activeCamera = camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('MainMenuUI', true, this.scene);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

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
    panel.isPointerBlocker = true;
    panel.top = '-2%';
    this.gui.addControl(panel);

    const playBtn = this.makeActionButton('menuPlay', 'PLAY', -70, () => {
      this.hidePanels();
      this.onPlayRequested();
    });
    panel.addControl(playBtn);

    const codexBtn = this.makeActionButton('menuCodex', 'CODEX', -10, () => {
      this.hidePanels();
      this.onCodexRequested();
    });
    panel.addControl(codexBtn);

    const settingsBtn = Button.CreateSimpleButton('menuSettings', 'SETTINGS');
    settingsBtn.width = '220px';
    settingsBtn.height = '46px';
    settingsBtn.color = '#6B8A87';
    settingsBtn.cornerRadius = 6;
    settingsBtn.background = 'rgba(20,30,35,0.45)';
    settingsBtn.thickness = 1;
    settingsBtn.top = '50px';
    settingsBtn.isEnabled = false;
    settingsBtn.isHitTestVisible = false;
    settingsBtn.isPointerBlocker = false;
    panel.addControl(settingsBtn);

    const hint = new TextBlock('menuHint');
    hint.text = 'PLAY -> CLASS SELECT | CODEX -> CODEX SCENE';
    hint.color = '#7C9C98';
    hint.fontSize = 12;
    hint.fontFamily = 'Consolas';
    hint.top = '104px';
    hint.isHitTestVisible = false;
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

  private makeActionButton(id: string, label: string, top: number, onClick: () => void): Button {
    const button = Button.CreateSimpleButton(id, label);
    button.width = '220px';
    button.height = '46px';
    button.top = `${top}px`;
    button.color = '#FFFFFF';
    button.cornerRadius = 6;
    button.background = '#1D3B3A';
    button.thickness = 2;
    button.zIndex = 50;
    button.isEnabled = true;
    button.isHitTestVisible = true;
    button.isPointerBlocker = true;
    button.hoverCursor = 'pointer';
    button.onPointerEnterObservable.add(() => {
      button.background = '#2A5A57';
    });
    button.onPointerOutObservable.add(() => {
      button.background = '#1D3B3A';
    });
    button.onPointerClickObservable.add(() => {
      onClick();
    });
    return button;
  }

  private hidePanels(): void {
    // Reserved for future menu panels.
  }
}
