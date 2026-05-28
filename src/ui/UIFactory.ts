import { Button, Control, Rectangle, ScrollViewer, TextBlock, Slider } from '@babylonjs/gui';
import { UITheme } from './UITheme';

export class UIFactory {
  /**
   * Creates a terminal-styled button with basic hover/down color states.
   * To add glitch effects, call DaemonGlitchFx.inject(btn, label, onClick) after creation.
   */
  static createTerminalButton(
    name: string,
    text: string,
    width: string = '200px',
    height: string = '40px',
  ): Button {
    const btn = Button.CreateSimpleButton(name, text);
    btn.width = width;
    btn.height = height;
    btn.thickness = UITheme.shapes.borderThickness;
    btn.cornerRadius = UITheme.shapes.cornerRadius;
    btn.color = UITheme.colors.borderBright;
    btn.background = UITheme.colors.buttonBg;

    if (btn.textBlock) {
      btn.textBlock.fontFamily = UITheme.fonts.primary;
      btn.textBlock.fontSize = UITheme.fonts.normalSize;
      btn.textBlock.color = UITheme.colors.textNormal;
      btn.textBlock.zIndex = 10; // ensure text renders above injected child controls
    }

    return btn;
  }

  /**
   * Creates a solid background panel for windows.
   */
  static createPanel(name: string, width: string | number, height: string | number): Rectangle {
    const panel = new Rectangle(name);
    panel.width = typeof width === 'number' ? `${width}px` : width;
    panel.height = typeof height === 'number' ? `${height}px` : height;
    panel.thickness = UITheme.shapes.borderThicknessThick;
    panel.cornerRadius = UITheme.shapes.cornerRadius;
    panel.color = UITheme.colors.borderDim;
    panel.background = UITheme.colors.bgPanel;
    panel.isPointerBlocker = true; // Blocks clicks from passing through
    return panel;
  }

  /**
   * Creates a standardized text block.
   */
  static createText(name: string, text: string, size: number = UITheme.fonts.normalSize, color: string = UITheme.colors.textNormal): TextBlock {
    const tb = new TextBlock(name);
    tb.text = text;
    tb.fontFamily = UITheme.fonts.primary;
    tb.fontSize = size;
    tb.color = color;
    tb.textWrapping = true;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.isHitTestVisible = false;
    tb.isPointerBlocker = false;
    return tb;
  }

  /**
   * Creates a ScrollViewer configured for proper responsiveness and fixed bugs.
   */
  static createScrollViewer(name: string): ScrollViewer {
    const scroll = new ScrollViewer(name);
    scroll.thickness = UITheme.shapes.borderThickness;
    scroll.color = UITheme.colors.borderDim;
    scroll.background = UITheme.colors.scrollBg;
    
    // Fix: Unresponsive / hyper-sensitive scroll wheel
    scroll.wheelPrecision = 0.1;
    
    // Fix: Tiny unclickable scroll bar
    scroll.barColor = UITheme.colors.scrollBar;
    scroll.barSize = 14; 
    
    // Block pointers so you can actually click the background to scroll
    scroll.isPointerBlocker = true;

    // Mobile ergonomics: allow hold + swipe on the whole list area (not only scrollbar).
    // Keeps tap interactions on list items when there is no drag.
    const isTouchPreferred = (() => {
      try {
        const touchPoints = (globalThis.navigator && (navigator.maxTouchPoints || 0)) || 0;
        return touchPoints > 0;
      } catch {
        return false;
      }
    })();
    if (isTouchPreferred) {
      let dragging = false;
      let dragStarted = false;
      let lastY = 0;
      const DRAG_THRESHOLD_PX = 8;
      const DRAG_SPEED = 0.0038;

      scroll.onPointerDownObservable.add((coords: any) => {
        dragging = true;
        dragStarted = false;
        lastY = typeof coords?.y === 'number' ? coords.y : 0;
      });

      scroll.onPointerMoveObservable.add((coords: any) => {
        if (!dragging) return;
        const y = typeof coords?.y === 'number' ? coords.y : lastY;
        const dy = y - lastY;
        if (!dragStarted && Math.abs(dy) >= DRAG_THRESHOLD_PX) {
          dragStarted = true;
        }
        if (dragStarted && scroll.verticalBar) {
          const next = Math.min(1, Math.max(0, scroll.verticalBar.value - dy * DRAG_SPEED));
          scroll.verticalBar.value = next;
        }
        lastY = y;
      });

      const endDrag = () => {
        dragging = false;
        dragStarted = false;
      };
      scroll.onPointerUpObservable.add(endDrag);
      scroll.onPointerOutObservable.add(endDrag);
    }
    
    return scroll;
  }

  /**
   * Creates a standard slider with predictable controls.
   */
  static createSlider(name: string, min: number = 0, max: number = 100, val: number = 50): Slider {
    const slider = new Slider(name);
    slider.minimum = min;
    slider.maximum = max;
    slider.value = val;
    slider.height = '20px';
    slider.width = '200px';
    slider.color = UITheme.colors.borderBright;
    slider.background = UITheme.colors.bgPanel;
    slider.borderColor = UITheme.colors.borderDim;
    
    // Fix: Larger thumb so it's easier to grab
    slider.thumbWidth = '16px';
    slider.isThumbCircle = false;
    
    // Hover effects for the slider thumb
    slider.onPointerEnterObservable.add(() => {
      slider.color = UITheme.colors.textHighlight;
    });
    slider.onPointerOutObservable.add(() => {
      slider.color = UITheme.colors.borderBright;
    });
    
    return slider;
  }
}
