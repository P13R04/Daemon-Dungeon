/**
 * WallOcclusionManager — Handles wall transparency when walls occlude the player.
 *
 * All sub-meshes of a relief wall block (core, face planes, top, corners) share the same
 * parent TransformNode. Detection runs once per parent group using the group's world-space
 * centroid, then applies a uniform visibility target to every mesh in the group.
 * This prevents inconsistencies where individual faces at different offsets pass/fail
 * the corridor or distance checks independently.
 *
 * Visibility is set to OCCLUDED_VISIBILITY (0.22) when the player is close enough to and
 * behind a wall, and restored to 1.0 otherwise, with smooth animation.
 */

import { AbstractMesh, Node, TransformNode, Vector3 } from '@babylonjs/core';

/** Partial transparency applied to all faces of an occluding wall block. */
const OCCLUDED_VISIBILITY = 0.22;

/** Animation speed (visibility units per second). */
const FADE_SPEED = 8.0;

/**
 * Half-width of the detection corridor around the cam→player segment (world units).
 * 1.5 ≈ 1.25 × tileSize — covers roughly 2-3 wall panels on either side of the
 * cam→player line.
 */
const OCCLUSION_HALF_WIDTH = 1.5;

/**
 * Maximum XZ distance from the player to a wall group centroid for occlusion to fire.
 * 3.0 units ≈ 2.5 × tileSize — walls up to ~2.5 tiles away from the player can fade.
 */
const MAX_PLAYER_WALL_DIST = 3.0;

/** Minimum projection ratio along cam→player for a wall to be "between" cam and player. */
const MIN_PROJECTION_RATIO = 0.05;

// ---------------------------------------------------------------------------

type WallGroup = {
  meshes: AbstractMesh[];
  /** XZ centroid of the group's meshes (used for detection). */
  cx: number;
  cz: number;
};

export class WallOcclusionManager {
  private enabled: boolean;
  /** Target visibility for each tracked mesh (set uniformly per group). */
  private readonly targetVis: Map<AbstractMesh, number> = new Map();

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Call once per gameplay frame while the game is in 'playing' state.
   */
  update(
    deltaTime: number,
    wallMeshes: AbstractMesh[],
    playerPos: Vector3,
    cameraPos: Vector3,
  ): void {
    if (!this.enabled) return;
    const dt = Math.max(0, deltaTime);

    // ── 1. Group meshes by parent TransformNode (one entry per wall block) ──────
    const groups = this.buildGroups(wallMeshes);

    // ── 2. Cam→player segment in XZ ─────────────────────────────────────────────
    const camX = cameraPos.x;
    const camZ = cameraPos.z;
    const playerX = playerPos.x;
    const playerZ = playerPos.z;

    const dx = playerX - camX;
    const dz = playerZ - camZ;
    const segLenSq = dx * dx + dz * dz;
    const hasSegment = segLenSq > 0.0001;

    // ── 3. Determine target visibility for each group ────────────────────────────
    const seenMeshes = new Set<AbstractMesh>();

    for (const group of groups) {
      const mx = group.cx;
      const mz = group.cz;

      for (const m of group.meshes) seenMeshes.add(m);

      let target = 1.0;

      if (hasSegment) {
        // Gate 1: XZ distance from player to group centroid
        const tpx = mx - playerX;
        const tpz = mz - playerZ;
        if (tpx * tpx + tpz * tpz <= MAX_PLAYER_WALL_DIST * MAX_PLAYER_WALL_DIST) {
          // Gate 2: centroid must lie within the cam→player corridor
          const wmx = mx - camX;
          const wmz = mz - camZ;
          const proj = (wmx * dx + wmz * dz) / segLenSq;

          if (proj >= MIN_PROJECTION_RATIO && proj <= 1.0 - MIN_PROJECTION_RATIO) {
            const closestX = camX + proj * dx;
            const closestZ = camZ + proj * dz;
            const perpX = mx - closestX;
            const perpZ = mz - closestZ;
            const perpDistSq = perpX * perpX + perpZ * perpZ;

            if (perpDistSq < OCCLUSION_HALF_WIDTH * OCCLUSION_HALF_WIDTH) {
              target = OCCLUDED_VISIBILITY;
            }
          }
        }
      }

      // Apply the same target to every mesh in the group
      for (const m of group.meshes) {
        this.targetVis.set(m, target);
      }
    }

    // ── 4. Clean up stale entries ────────────────────────────────────────────────
    for (const [mesh] of this.targetVis) {
      if (!seenMeshes.has(mesh)) {
        if (!mesh.isDisposed()) mesh.visibility = 1.0;
        this.targetVis.delete(mesh);
      }
    }

    // ── 5. Animate toward targets ────────────────────────────────────────────────
    const step = FADE_SPEED * dt;
    for (const [mesh, target] of this.targetVis) {
      if (mesh.isDisposed()) { this.targetVis.delete(mesh); continue; }
      const cur = mesh.visibility;
      if (Math.abs(cur - target) < 0.005) {
        mesh.visibility = target;
      } else {
        mesh.visibility = cur > target
          ? Math.max(target, cur - step)
          : Math.min(target, cur + step);
      }
    }
  }

  /** Instantly restore all tracked meshes to fully opaque and clear state. */
  reset(): void {
    for (const [mesh] of this.targetVis) {
      if (!mesh.isDisposed()) mesh.visibility = 1.0;
    }
    this.targetVis.clear();
  }

  dispose(): void {
    this.reset();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Groups wall meshes by their parent node (the wall block's TransformNode).
   * Meshes without a meaningful parent each form their own single-mesh group.
   * The group centroid is the XZ average of all constituent mesh absolute positions,
   * which approximates the wall tile centre regardless of individual face offsets.
   */
  private buildGroups(wallMeshes: AbstractMesh[]): WallGroup[] {
    const byParent = new Map<Node | null, AbstractMesh[]>();

    for (const mesh of wallMeshes) {
      if (!mesh || mesh.isDisposed()) continue;
      // Use the immediate parent as the grouping key.
      // Relief wall blocks: parent = block TransformNode (shared by core + all faces).
      // Classic walls: parent = scene root or reliefContainer — each mesh is unique.
      const key = (mesh.parent instanceof TransformNode) ? mesh.parent : mesh;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(mesh);
    }

    const groups: WallGroup[] = [];

    for (const [, meshes] of byParent) {
      // Compute XZ centroid over all meshes in the group.
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (const m of meshes) {
        const p = m.getAbsolutePosition();
        sumX += p.x;
        sumZ += p.z;
        count++;
      }
      if (count === 0) continue;
      groups.push({ meshes, cx: sumX / count, cz: sumZ / count });
    }

    return groups;
  }
}
