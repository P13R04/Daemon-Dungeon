/**
 * SceneBootstrap - Initializes the Babylon.js scene with base settings
 */

import { Scene, Engine, ArcRotateCamera, Vector3, HemisphericLight } from '@babylonjs/core';

export class SceneBootstrap {
  static createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
    const scene = new Scene(engine);
    
    // Basic isometric camera setup
    const camera = new ArcRotateCamera(
      'mainCamera',
      -Math.PI / 4, // Alpha (horizontal rotation)
      Math.PI / 3,   // Beta (vertical angle for isometric)
      20,            // Radius
      Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 30;
    
    // Basic lighting
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    
    // Scene settings
    scene.clearColor = scene.clearColor.set(0.1, 0.1, 0.1, 1);
    
    return scene;
  }

  static setupOptimizations(scene: Scene): void {
    // TODO: Enable optimizations for web performance
    // scene.autoClear = false;
    // scene.autoClearDepthAndStencil = false;
    // scene.blockMaterialDirtyMechanism = true;
  }
}
