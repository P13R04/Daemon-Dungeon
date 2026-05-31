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
    velocity: Vector3;
    ttlMs: number;
    ageMs: number;
  }> = [];
  private pooledVoidShards: Array<ReturnType<typeof MeshBuilder.CreateBox>> = [];
  private voidShardMaterial: StandardMaterial | null = null;
  private voidShardObserver: Observer<Scene> | null = null;
  private readonly maxActiveVoidShards = 28;
  private readonly tmpVec = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly roomManager: RoomManager,
    private readonly onPlayerDied: (reason: string) => void,
  ) {
    this.ensureVoidShardMaterial();
    this.prewarmVoidShardPool(16);
  }

  reset(): void {
    this.playerVoidFallState = null;
    this.playerVoidFxTimer = 0;
    this.deactivateVoidShardFx();
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
    this.spawnPlayerVoidBurst(pos, 8);
  }

  private isFullyOverVoid(pos: Vector3): boolean {
    const r = this.voidSampleRadius;
    const o = r * 0.72;
    return (
      this.roomManager.getTileTypeAtWorld(pos.x, pos.z) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x + r, pos.z) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x - r, pos.z) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x, pos.z + r) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x, pos.z - r) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x + o, pos.z + o) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x - o, pos.z + o) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x + o, pos.z - o) === 'void'
      && this.roomManager.getTileTypeAtWorld(pos.x - o, pos.z - o) === 'void'
    );
  }

  update(deltaTime: number): boolean {
    if (!this.playerVoidFallState) return false;

    // Keep the player anchored on the void-fall X/Z so they cannot steer back to solid tiles.
    const currentPos = this.playerController.getPosition();
    if (
      Math.abs(currentPos.x - this.playerVoidFallState.lockedXZ.x) > 0.0001
      || Math.abs(currentPos.z - this.playerVoidFallState.lockedXZ.z) > 0.0001
    ) {
      this.tmpVec.set(
        this.playerVoidFallState.lockedXZ.x,
        currentPos.y,
        this.playerVoidFallState.lockedXZ.z,
      );
      this.playerController.setPosition(this.tmpVec);
    }

    this.playerVoidFallState.timer = Math.max(0, this.playerVoidFallState.timer - deltaTime);
    const progress = 1 - (this.playerVoidFallState.timer / Math.max(0.0001, this.playerVoidFallState.duration));
    const eased = Math.pow(progress, 2.45);
    this.playerController.setExternalVerticalOffset(-7.2 * eased);
    this.playerController.setRenderVisibility(Math.max(0.02, 1 - eased * 0.98));

    this.playerVoidFxTimer -= deltaTime;
    if (this.playerVoidFxTimer <= 0) {
      this.playerVoidFxTimer = 0.08;
      const p = this.playerController.getPosition();
      this.spawnPlayerVoidBurst(p.add(new Vector3(0, -3.4 * eased, 0)), 3);
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
    this.ensureVoidShardMaterial();
    const particleCount = Math.max(1, Math.floor(count));
    const availableSlots = Math.max(0, this.maxActiveVoidShards - this.activeVoidShards.length);
    const spawnCount = Math.min(particleCount, availableSlots);
    if (spawnCount <= 0) return;
    for (let i = 0; i < spawnCount; i++) {
      const shard = this.getOrCreateVoidShardMesh();
      shard.setEnabled(true);
      shard.scaling.setAll(1);
      shard.isPickable = false;
      shard.position = origin.add(new Vector3(
        (Math.random() - 0.5) * 0.55,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.55,
      ));
      if (this.voidShardMaterial) {
        shard.material = this.voidShardMaterial;
      }

      const velocity = new Vector3(
        (Math.random() - 0.5) * 2.4,
        0.5 + (Math.random() * 1.2),
        (Math.random() - 0.5) * 2.4,
      );
      const ttlMs = 260 + (Math.random() * 200);
      this.activeVoidShards.push({
        mesh: shard,
        velocity,
        ttlMs,
        ageMs: 0,
      });
    }
  }

  private ensureVoidShardMaterial(): void {
    if (this.voidShardMaterial && !this.isBabylonObjectDisposed(this.voidShardMaterial)) return;
    const mat = new StandardMaterial('void_player_shard_shared_mat', this.scene);
    mat.diffuseColor = new Color3(0.1, 0.92, 0.7);
    mat.emissiveColor = new Color3(0.05, 0.62, 0.42);
    mat.alpha = 0.9;
    this.voidShardMaterial = mat;
  }

  private getOrCreateVoidShardMesh(): ReturnType<typeof MeshBuilder.CreateBox> {
    const pooled = this.pooledVoidShards.pop();
    if (pooled && !this.isBabylonObjectDisposed(pooled)) {
      return pooled;
    }
    const shard = MeshBuilder.CreateBox(`void_player_shard_${Date.now()}`, {
      size: 0.12,
    }, this.scene);
    shard.alwaysSelectAsActiveMesh = false;
    shard.isPickable = false;
    if (this.voidShardMaterial) {
      shard.material = this.voidShardMaterial;
    }
    return shard;
  }

  private prewarmVoidShardPool(count: number): void {
    const target = Math.max(0, Math.floor(count));
    while (this.pooledVoidShards.length < target) {
      const shard = MeshBuilder.CreateBox(`void_player_shard_prewarm_${this.pooledVoidShards.length}`, {
        size: 0.12,
      }, this.scene);
      shard.alwaysSelectAsActiveMesh = false;
      shard.isPickable = false;
      shard.setEnabled(false);
      if (this.voidShardMaterial) {
        shard.material = this.voidShardMaterial;
      }
      this.pooledVoidShards.push(shard);
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
        if (this.isBabylonObjectDisposed(fx.mesh)) {
          this.activeVoidShards.splice(i, 1);
          continue;
        }
        fx.ageMs += dtMs;
        const t = Math.min(1, fx.ageMs / fx.ttlMs);
        fx.velocity.y -= gravity * dt;
        fx.mesh.position.addInPlaceFromFloats(
          fx.velocity.x * dt,
          fx.velocity.y * dt,
          fx.velocity.z * dt,
        );
        fx.mesh.scaling.scaleInPlace(0.95);

        if (t >= 1) {
          fx.mesh.setEnabled(false);
          this.pooledVoidShards.push(fx.mesh);
          this.activeVoidShards.splice(i, 1);
        }
      }
    });
  }

  private deactivateVoidShardFx(): void {
    for (const fx of this.activeVoidShards) {
      try { fx.mesh.setEnabled(false); } catch {}
      this.pooledVoidShards.push(fx.mesh);
    }
    this.activeVoidShards = [];
    if (this.voidShardObserver) {
      this.scene.onBeforeRenderObservable.remove(this.voidShardObserver);
      this.voidShardObserver = null;
    }
  }

  private clearVoidShardFx(): void {
    this.deactivateVoidShardFx();
    for (const pooled of this.pooledVoidShards) {
      try { pooled.dispose(); } catch {}
    }
    this.pooledVoidShards = [];
    if (this.voidShardMaterial && !this.isBabylonObjectDisposed(this.voidShardMaterial)) {
      this.voidShardMaterial.dispose();
    }
    this.voidShardMaterial = null;
  }

  // Babylon versions differ: some expose `isDisposed()` method, others `isDisposed` boolean.
  private isBabylonObjectDisposed(obj: any): boolean {
    if (!obj) return true;
    try {
      const flag = obj.isDisposed;
      if (typeof flag === 'function') {
        return !!flag.call(obj);
      }
      if (typeof flag === 'boolean') {
        return flag;
      }
    } catch {
      // Ignore and fall through.
    }
    return false;
  }

  dispose(): void {
    this.reset();
  }
}
