import { Color3, MeshBuilder, Observer, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { PlayerController } from '../gameplay/PlayerController';
import { RoomManager } from '../systems/RoomManager';

type PlayerVoidFallState = {
  timer: number;
  duration: number;
  respawn: Vector3;
  lockedXZ: Vector3;
};

export class GamePlayerVoidRecoveryManager {
  private playerVoidFallState: PlayerVoidFallState | null = null;
  private playerVoidFxTimer = 0;
  private readonly playerVoidFallDuration = 0.72;
  private readonly voidSampleRadius = 0.234;
  private activeVoidShards: Array<{
    mesh: ReturnType<typeof MeshBuilder.CreateBox>;
    material: StandardMaterial;
    velocity: Vector3;
    ttlMs: number;
    ageMs: number;
  }> = [];
  private voidShardObserver: Observer<Scene> | null = null;
  private readonly maxActiveVoidShards = 42;

  constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly roomManager: RoomManager,
    private readonly onPlayerDied: (reason: string) => void,
  ) {}

  reset(): void {
    this.playerVoidFallState = null;
    this.playerVoidFxTimer = 0;
    this.clearVoidShardFx();
    this.playerController.setExternalVerticalOffset(0);
    this.playerController.setRenderVisibility(1);
  }

  isFalling(): boolean {
    return this.playerVoidFallState !== null;
  }

  detectAndStart(roomOrder: string[], currentRoomIndex: number): void {
    if (this.playerVoidFallState) return;
    const pos = this.playerController.getPosition();
    if (!this.isFullyOverVoid(pos)) return;

    const currentRoomId = roomOrder[currentRoomIndex] ?? this.roomManager.getCurrentRoom()?.id;
    const respawn = this.roomManager.getPlayerSpawnPoint(currentRoomId) ?? pos.clone();

    this.playerVoidFallState = {
      timer: this.playerVoidFallDuration,
      duration: this.playerVoidFallDuration,
      respawn,
      lockedXZ: new Vector3(pos.x, 0, pos.z),
    };
    this.playerVoidFxTimer = 0;
    this.spawnPlayerVoidBurst(pos, 10);
  }

  private isFullyOverVoid(pos: Vector3): boolean {
    const r = this.voidSampleRadius;
    const o = r * 0.72;
    const samplePoints: Array<{ x: number; z: number }> = [
      { x: pos.x, z: pos.z },
      { x: pos.x + r, z: pos.z },
      { x: pos.x - r, z: pos.z },
      { x: pos.x, z: pos.z + r },
      { x: pos.x, z: pos.z - r },
      { x: pos.x + o, z: pos.z + o },
      { x: pos.x - o, z: pos.z + o },
      { x: pos.x + o, z: pos.z - o },
      { x: pos.x - o, z: pos.z - o },
    ];
    for (const p of samplePoints) {
      if (this.roomManager.getTileTypeAtWorld(p.x, p.z) !== 'void') {
        return false;
      }
    }
    return true;
  }

  update(deltaTime: number): boolean {
    if (!this.playerVoidFallState) return false;

    // Keep the player anchored on the void-fall X/Z so they cannot steer back to solid tiles.
    const currentPos = this.playerController.getPosition();
    if (
      Math.abs(currentPos.x - this.playerVoidFallState.lockedXZ.x) > 0.0001
      || Math.abs(currentPos.z - this.playerVoidFallState.lockedXZ.z) > 0.0001
    ) {
      this.playerController.setPosition(new Vector3(
        this.playerVoidFallState.lockedXZ.x,
        currentPos.y,
        this.playerVoidFallState.lockedXZ.z,
      ));
    }

    this.playerVoidFallState.timer = Math.max(0, this.playerVoidFallState.timer - deltaTime);
    const progress = 1 - (this.playerVoidFallState.timer / Math.max(0.0001, this.playerVoidFallState.duration));
    const eased = Math.pow(progress, 2.45);
    this.playerController.setExternalVerticalOffset(-7.2 * eased);
    this.playerController.setRenderVisibility(Math.max(0.02, 1 - eased * 0.98));

    this.playerVoidFxTimer -= deltaTime;
    if (this.playerVoidFxTimer <= 0) {
      this.playerVoidFxTimer = 0.05;
      const p = this.playerController.getPosition();
      this.spawnPlayerVoidBurst(p.add(new Vector3(0, -3.4 * eased, 0)), 5);
    }

    if (this.playerVoidFallState.timer <= 0) {
      this.playerController.setExternalVerticalOffset(0);
      this.playerController.setRenderVisibility(1);
      this.onPlayerDied('void_fall');
      this.playerVoidFallState = null;
      this.playerVoidFxTimer = 0;
    }

    return true;
  }

  private spawnPlayerVoidBurst(origin: Vector3, count: number): void {
    this.ensureVoidShardUpdater();
    const particleCount = Math.max(1, Math.floor(count));
    const availableSlots = Math.max(0, this.maxActiveVoidShards - this.activeVoidShards.length);
    const spawnCount = Math.min(particleCount, availableSlots);
    if (spawnCount <= 0) return;
    for (let i = 0; i < spawnCount; i++) {
      const shard = MeshBuilder.CreateBox(`void_player_shard_${Date.now()}_${i}`, {
        size: 0.08 + (Math.random() * 0.07),
      }, this.scene);
      shard.position = origin.add(new Vector3(
        (Math.random() - 0.5) * 0.55,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.55,
      ));

      const mat = new StandardMaterial(`void_player_shard_mat_${Date.now()}_${i}`, this.scene);
      mat.diffuseColor = new Color3(0.1, 0.92, 0.7);
      mat.emissiveColor = new Color3(0.05, 0.62, 0.42);
      mat.alpha = 0.9;
      shard.material = mat;

      const velocity = new Vector3(
        (Math.random() - 0.5) * 2.4,
        0.5 + (Math.random() * 1.2),
        (Math.random() - 0.5) * 2.4,
      );
      const ttlMs = 260 + (Math.random() * 200);
      this.activeVoidShards.push({
        mesh: shard,
        material: mat,
        velocity,
        ttlMs,
        ageMs: 0,
      });
    }
  }

  private ensureVoidShardUpdater(): void {
    if (this.voidShardObserver) return;
    this.voidShardObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (this.activeVoidShards.length === 0) return;
      const dtMs = Math.min(40, this.scene.getEngine().getDeltaTime());
      const dt = dtMs / 1000;
      const gravity = 6.8;

      for (let i = this.activeVoidShards.length - 1; i >= 0; i--) {
        const fx = this.activeVoidShards[i];
        if (fx.mesh.isDisposed()) {
          this.activeVoidShards.splice(i, 1);
          continue;
        }
        fx.ageMs += dtMs;
        const t = Math.min(1, fx.ageMs / fx.ttlMs);
        fx.velocity.y -= gravity * dt;
        fx.mesh.position.addInPlace(fx.velocity.scale(dt));
        fx.mesh.scaling.scaleInPlace(0.95);
        fx.material.alpha = Math.max(0, 0.9 * (1 - t));

        if (t >= 1) {
          fx.mesh.dispose();
          fx.material.dispose();
          this.activeVoidShards.splice(i, 1);
        }
      }
    });
  }

  private clearVoidShardFx(): void {
    for (const fx of this.activeVoidShards) {
      try { fx.mesh.dispose(); } catch {}
      try { fx.material.dispose(); } catch {}
    }
    this.activeVoidShards = [];
    if (this.voidShardObserver) {
      this.scene.onBeforeRenderObservable.remove(this.voidShardObserver);
      this.voidShardObserver = null;
    }
  }

  dispose(): void {
    this.reset();
  }
}
