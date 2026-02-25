import { ArcRotateCamera, Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Checkbox, Control, Rectangle, Slider, StackPanel, TextBlock } from '@babylonjs/gui';
import { PostProcessManager, PostProcessingConfig } from './PostProcess';

export class ClassSelectDevConsole {
  private gui: AdvancedDynamicTexture;
  private panel: Rectangle;
  private toggleBtn: Button;
  private isVisible: boolean = true;
  private config: PostProcessingConfig;

  constructor(
    private scene: Scene,
    gui: AdvancedDynamicTexture,
    private camera: ArcRotateCamera,
    private postProcessManager: PostProcessManager,
    initialConfig: PostProcessingConfig
  ) {
    this.gui = gui;
    this.config = { ...initialConfig };

    this.panel = this.createPanel();
    this.panel.zIndex = 1200;
    this.gui.addControl(this.panel);
    this.toggleBtn = this.createToggleButton();
    this.toggleBtn.zIndex = 1201;
    this.gui.addControl(this.toggleBtn);
  }

  dispose(): void {
    this.panel.dispose();
    this.toggleBtn.dispose();
  }

  private createPanel(): Rectangle {
    const panel = new Rectangle('classSelectDevPanel');
    panel.width = '400px';
    panel.height = '620px';
    panel.background = 'rgba(15, 15, 35, 0.98)';
    panel.thickness = 2;
    panel.cornerRadius = 8;
    panel.color = '#00FF00';
    panel.top = '100px';
    panel.left = '10px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    const content = new StackPanel('classSelectDevContent');
    content.width = '360px';
    content.top = '16px';
    content.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.addControl(content);

    const title = new TextBlock('classSelectDevTitle');
    title.text = '>>> DEV CONSOLE (SELECT) <<<';
    title.color = '#00FF00';
    title.fontSize = 16;
    title.fontWeight = 'bold';
    title.height = '30px';
    content.addControl(title);

    const camTitle = new TextBlock('classSelectCamTitle');
    camTitle.text = '═══ CAMERA ═══';
    camTitle.color = '#66FFCC';
    camTitle.fontSize = 14;
    camTitle.height = '28px';
    content.addControl(camTitle);

    this.addSlider(content, 'Alpha', this.camera.alpha, -Math.PI, Math.PI, 0.01, (value) => {
      this.camera.alpha = value;
    });

    this.addSlider(content, 'Beta', this.camera.beta, 0.25, 1.5, 0.01, (value) => {
      this.camera.beta = value;
    });

    this.addSlider(content, 'Radius', this.camera.radius, 8, 20, 0.1, (value) => {
      this.camera.radius = value;
    });

    const fxTitle = new TextBlock('classSelectFxTitle');
    fxTitle.text = '═══ POST PROCESSING ═══';
    fxTitle.color = '#66FFCC';
    fxTitle.fontSize = 14;
    fxTitle.height = '28px';
    content.addControl(fxTitle);

    this.addToggle(content, 'Enable Post FX', this.config.enabled, (checked) => {
      this.config.enabled = checked;
      this.applyPostFx();
    });

    this.addSlider(content, 'Pixel Scale', this.config.pixelScale, 1, 3, 0.1, (value) => {
      this.config.pixelScale = value;
      this.applyPostFx();
    });

    this.addSlider(content, 'Glow Intensity', this.config.glowIntensity, 0, 2, 0.05, (value) => {
      this.config.glowIntensity = value;
      this.applyPostFx();
    });

    this.addSlider(content, 'Chromatic Amount', this.config.chromaticAmount, 0, 60, 1, (value) => {
      this.config.chromaticAmount = value;
      this.applyPostFx();
    });

    this.addSlider(content, 'Chromatic Radial', this.config.chromaticRadial, 0, 1, 0.05, (value) => {
      this.config.chromaticRadial = value;
      this.applyPostFx();
    });

    this.addToggle(content, 'Enable Grain', this.config.grainEnabled, (checked) => {
      this.config.grainEnabled = checked;
      this.applyPostFx();
    });

    this.addSlider(content, 'Grain Intensity', this.config.grainIntensity, 0, 30, 1, (value) => {
      this.config.grainIntensity = value;
      this.applyPostFx();
    });

    this.addToggle(content, 'Animated Grain', this.config.grainAnimated, (checked) => {
      this.config.grainAnimated = checked;
      this.applyPostFx();
    });

    this.addToggle(content, 'CRT Lines', this.config.crtLinesEnabled, (checked) => {
      this.config.crtLinesEnabled = checked;
      this.applyPostFx();
    });

    this.addToggle(content, 'Vignette', this.config.vignetteEnabled, (checked) => {
      this.config.vignetteEnabled = checked;
      this.applyPostFx();
    });

    this.addSlider(content, 'Vignette Weight', this.config.vignetteWeight, 0, 10, 0.5, (value) => {
      this.config.vignetteWeight = value;
      this.applyPostFx();
    });

    return panel;
  }

  private createToggleButton(): Button {
    const toggleBtn = new Button('classSelectDevToggle');
    toggleBtn.width = '58px';
    toggleBtn.height = '30px';
    toggleBtn.background = '#004400';
    toggleBtn.color = '#00FF00';
    toggleBtn.fontSize = 12;
    toggleBtn.left = 10;
    toggleBtn.top = 62;
    toggleBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    const label = new TextBlock('classSelectDevToggleLabel');
    label.text = 'DEV';
    label.color = '#00FF00';
    toggleBtn.addControl(label);

    toggleBtn.onPointerUpObservable.add(() => {
      this.isVisible = !this.isVisible;
      this.panel.isVisible = this.isVisible;
    });

    return toggleBtn;
  }

  private addSlider(
    parent: StackPanel,
    label: string,
    initialValue: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void
  ): void {
    const labelBlock = new TextBlock(`classSelect_${label}_label`);
    labelBlock.text = `${label}: ${initialValue.toFixed(2)}`;
    labelBlock.fontSize = 12;
    labelBlock.color = '#FFFFFF';
    labelBlock.height = '22px';
    parent.addControl(labelBlock);

    const slider = new Slider(`classSelect_${label}_slider`);
    slider.minimum = min;
    slider.maximum = max;
    slider.value = initialValue;
    slider.height = '20px';
    slider.width = '340px';
    slider.color = '#66FFCC';
    slider.background = '#444444';
    slider.onValueChangedObservable.add((value) => {
      const stepped = Math.round(value / step) * step;
      labelBlock.text = `${label}: ${stepped.toFixed(2)}`;
      onChange(stepped);
    });
    parent.addControl(slider);
  }

  private addToggle(parent: StackPanel, label: string, initial: boolean, onChange: (checked: boolean) => void): void {
    const row = new StackPanel(`classSelect_${label}_row`);
    row.isVertical = false;
    row.height = '26px';
    row.width = '340px';
    row.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const checkbox = new Checkbox(`classSelect_${label}_check`);
    checkbox.isChecked = initial;
    checkbox.width = '20px';
    checkbox.height = '20px';

    const text = new TextBlock(`classSelect_${label}_text`);
    text.text = `  ${label}`;
    text.fontSize = 12;
    text.color = '#FFFFFF';
    text.width = '300px';
    text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    checkbox.onIsCheckedChangedObservable.add((isChecked) => {
      onChange(isChecked);
    });

    row.addControl(checkbox);
    row.addControl(text);
    parent.addControl(row);
  }

  private applyPostFx(): void {
    this.postProcessManager.applyConfig({ ...this.config });
  }
}
