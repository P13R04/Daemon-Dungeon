/**
 * SceneBootstrap - Initializes the Babylon.js scene with base settings
 */

import { Scene, Engine, ArcRotateCamera, Vector3, HemisphericLight, FreeCamera, Color4 } from '@babylonjs/core';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { createSynthwaveGridBackground } from './SynthwaveBackground';

export class SceneBootstrap {
  static createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
    const scene = new Scene(engine);

    // Ensure 3D meshes only render on the main scene layer.
    scene.onNewMeshAddedObservable.add((mesh) => {
      mesh.layerMask = SCENE_LAYER;
    });
    
    // Basic isometric camera setup
    const camera = new ArcRotateCamera(
      'mainCamera',
      Math.PI / 4 - Math.PI / 2 - Math.PI / 12, // Alpha (horizontal rotation)
      Math.PI / 5,   // Beta (vertical angle)
      30,            // Radius
      Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.inputs.clear(); // Disable all camera controls - GameManager handles camera positioning
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 30;
    camera.layerMask = SCENE_LAYER;

    const uiCamera = new FreeCamera('uiCamera', new Vector3(0, 0, -10), scene);
    uiCamera.layerMask = UI_LAYER;
    // Note: clearColor is a Scene property, not FreeCamera property
    // The UI layer will be transparent through layerMask
    (uiCamera as any).clear = false;
    
    // Basic lighting
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.55;
    
    // Scene settings
    scene.clearColor = scene.clearColor.set(0.02, 0.02, 0.06, 1);
    createSynthwaveGridBackground(scene);
    
    // Store cameras on scene for access by GameManager
    (scene as any).mainCamera = camera;
    (scene as any).uiCamera = uiCamera;
    scene.activeCameras = [camera, uiCamera];
    scene.activeCamera = camera;
    
    return scene;
  }

  static setupOptimizations(scene: Scene): void {
    // TODO: Enable optimizations for web performance
    // scene.autoClear = false;
    // scene.autoClearDepthAndStencil = false;
    // scene.blockMaterialDirtyMechanism = true;
  }
}
