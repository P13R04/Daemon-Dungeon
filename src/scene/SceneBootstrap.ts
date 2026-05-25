/**
 * SceneBootstrap - Initializes the Babylon.js scene with base settings
 */

import { Scene, Engine, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, FreeCamera, Color3, Color4 } from '@babylonjs/core';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { createMatrixVoidBackground } from './MatrixVoidBackground';
import { PhysicsBootstrap } from './PhysicsBootstrap';

type SceneWithCameras = Scene & {
  mainCamera?: ArcRotateCamera;
  uiCamera?: FreeCamera;
};

export class SceneBootstrap {
  static async createScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
    const scene = new Scene(engine);

    // Ensure 3D meshes only render on the main scene layer.
    scene.onNewMeshAddedObservable.add((mesh) => {
      mesh.layerMask = SCENE_LAYER;
    });
    
    // Basic isometric camera setup
    const camera = new ArcRotateCamera(
      'mainCamera',
      -76 * (Math.PI / 180), // Alpha (horizontal rotation)
      54 * (Math.PI / 180),  // Beta (vertical angle)
      24,                    // Radius
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

    
    // Brighter gameplay lighting closer to the reference texture lab setup.
    const hemi = new HemisphericLight('light', new Vector3(0.2, 1, 0), scene);
    hemi.intensity = 1.0;
    hemi.diffuse = new Color3(1.0, 1.0, 1.0);
    hemi.groundColor = new Color3(0.28, 0.31, 0.36);
    const dir = new DirectionalLight('dir', new Vector3(-0.4, -1.0, 0.45), scene);
    dir.position = new Vector3(12, 18, -8);
    dir.intensity = 0.95;
    
    // Scene settings
    scene.clearColor = new Color4(0.02, 0.02, 0.06, 1);
    createMatrixVoidBackground(scene);
    
    // Store cameras on scene for access by GameManager
    const sceneWithCameras = scene as SceneWithCameras;
    sceneWithCameras.mainCamera = camera;
    sceneWithCameras.uiCamera = uiCamera;
    scene.activeCameras = [camera, uiCamera];
    scene.activeCamera = camera;

    await PhysicsBootstrap.enableHavok(scene);
    
    return scene;
  }

  static setupOptimizations(scene: Scene): void {
    // TODO: Enable optimizations for web performance
    // scene.autoClear = false;
    // scene.autoClearDepthAndStencil = false;
    // scene.blockMaterialDirtyMechanism = true;
  }
}
