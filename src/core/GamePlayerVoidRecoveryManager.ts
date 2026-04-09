import { Color3, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { PlayerController } from '../gameplay/PlayerController';
import { RoomManager } from '../systems/RoomManager';

type PlayerVoidFallState = {
  timer: number;
  duration: number;
  respawn: Vector3;
};

export class GamePlayerVoidRecoveryManager {
  private playerVoidFallState: PlayerVoidFallState | null = null;
  private playerVoidFxTimer = 0;
  private readonly playerVoidFallDuration = 0.72;

  constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly roomManager: RoomManager,
    private readonly onPlayerDied: (reason: string) => void,
  ) {}

  reset(): void {
    this.playerVoidFallState = null;
    this.playerVoidFxTimer = 0;
    this.playerController.setExternalVerticalOffset(0);
    this.playerController.setRenderVisibility(1);
  }

  isFalling(): boolean {
    return this.playerVoidFallState !== null;
  }

  detectAndStart(roomOrder: string[], currentRoomIndex: number): void {
    if (this.playerVoidFallState) return;
    const pos = this.playerController.getPosition();
    const tileType = this.roomManager.getTileTypeAtWorld(pos.x, pos.z);
    if (tileType !== 'void') return;

    const currentRoomId = roomOrder[currentRoomIndex] ?? this.roomManager.getCurrentRoom()?.id;
    const respawn = this.roomManager.getPlayerSpawnPoint(currentRoomId) ?? pos.clone();

    this.playerVoidFallState = {
      timer: this.playerVoidFallDuration,
      duration: this.playerVoidFallDuration,
      respawn,
    };
    this.playerVoidFxTimer = 0;
    this.spawnPlayerVoidBurst(pos, 10);
  }

  update(deltaTime: number): boolean {
    if (!this.playerVoidFallState) return false;

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
    const particleCount = Math.max(1, Math.floor(count));
    for (let i = 0; i < particleCount; i++) {
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
      const gravity = 6.8;
      const bornAt = Date.now();
      const ttlMs = 260 + (Math.random() * 200);

      const tick = window.setInterval(() => {
        if (shard.isDisposed()) {
          window.clearInterval(tick);
          return;
        }

        const elapsed = Date.now() - bornAt;
        const t = Math.min(1, elapsed / ttlMs);
        const dt = 1 / 60;
        velocity.y -= gravity * dt;
        shard.position.addInPlace(velocity.scale(dt));
        shard.scaling.scaleInPlace(0.95);
        mat.alpha = Math.max(0, 0.9 * (1 - t));

        if (t >= 1) {
          window.clearInterval(tick);
          shard.dispose();
          mat.dispose();
        }
      }, 16);
    }
  }
}
