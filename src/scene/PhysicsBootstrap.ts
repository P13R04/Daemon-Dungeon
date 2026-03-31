import { Scene, Vector3 } from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import HavokPhysics from '@babylonjs/havok';

export class PhysicsBootstrap {
  static async enableHavok(scene: Scene): Promise<boolean> {
    try {
      const havokInstance = await HavokPhysics();
      const plugin = new HavokPlugin(true, havokInstance);

      scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
      const physicsEngine = scene.getPhysicsEngine();
      if (physicsEngine) {
        physicsEngine.setTimeStep(1 / 120);
      }

      console.info('[Physics] Havok enabled');
      return true;
    } catch (error) {
      console.warn('[Physics] Havok unavailable, running without physics world.', error);
      return false;
    }
  }
}
