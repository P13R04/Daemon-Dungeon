/**
 * Pathfinding - A* implementation for navigation
 */

import { Vector3 } from '@babylonjs/core';

export interface PathNode {
  x: number;
  z: number;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost
  parent?: PathNode;
}

export class Pathfinding {
  private gridWidth: number;
  private gridHeight: number;
  private obstacles: boolean[][];

  constructor(gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.obstacles = Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false));
  }

  setObstacle(x: number, z: number, isObstacle: boolean): void {
    if (this.isValidPosition(x, z)) {
      this.obstacles[z][x] = isObstacle;
    }
  }

  isObstacle(x: number, z: number): boolean {
    if (!this.isValidPosition(x, z)) return true;
    return this.obstacles[z][x];
  }

  findPathGrid(startX: number, startZ: number, goalX: number, goalZ: number): Array<{ x: number; z: number }> {
    if (!this.isValidPosition(startX, startZ) || !this.isValidPosition(goalX, goalZ)) {
      return [];
    }
    if (this.isObstacle(startX, startZ) || this.isObstacle(goalX, goalZ)) {
      return [];
    }

    const start: PathNode = {
      x: startX,
      z: startZ,
      g: 0,
      h: Math.abs(goalX - startX) + Math.abs(goalZ - startZ),
      f: 0,
    };
    start.f = start.g + start.h;

    const openList: PathNode[] = [start];
    const openByKey: Map<string, PathNode> = new Map([[`${startX},${startZ}`, start]]);
    const closed: Set<string> = new Set();

    while (openList.length > 0) {
      let bestIndex = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[bestIndex].f) {
          bestIndex = i;
        }
      }

      const current = openList.splice(bestIndex, 1)[0];
      const currentKey = `${current.x},${current.z}`;
      openByKey.delete(currentKey);
      closed.add(currentKey);

      if (current.x === goalX && current.z === goalZ) {
        return this.reconstructGridPath(current);
      }

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.z}`;
        if (closed.has(neighborKey)) continue;

        const diagonal = neighbor.x !== current.x && neighbor.z !== current.z;
        const moveCost = diagonal ? 1.41421356237 : 1;
        const tentativeG = current.g + moveCost;

        const existing = openByKey.get(neighborKey);
        if (!existing) {
          const created: PathNode = {
            x: neighbor.x,
            z: neighbor.z,
            g: tentativeG,
            h: Math.abs(goalX - neighbor.x) + Math.abs(goalZ - neighbor.z),
            f: 0,
            parent: current,
          };
          created.f = created.g + created.h;
          openList.push(created);
          openByKey.set(neighborKey, created);
          continue;
        }

        if (tentativeG < existing.g) {
          existing.g = tentativeG;
          existing.f = existing.g + existing.h;
          existing.parent = current;
        }
      }
    }

    return [];
  }

  findPath(start: Vector3, goal: Vector3): Vector3[] {
    const startX = Math.floor(start.x);
    const startZ = Math.floor(start.z);
    const goalX = Math.floor(goal.x);
    const goalZ = Math.floor(goal.z);

    return this.findPathGrid(startX, startZ, goalX, goalZ).map((node) => new Vector3(node.x, 0, node.z));
  }

  private isValidPosition(x: number, z: number): boolean {
    return x >= 0 && x < this.gridWidth && z >= 0 && z < this.gridHeight;
  }

  private getNeighbors(node: PathNode): PathNode[] {
    const neighbors: PathNode[] = [];
    const cardinal = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const diagonal = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (const [dx, dz] of cardinal) {
      const nx = node.x + dx;
      const nz = node.z + dz;
      if (!this.isValidPosition(nx, nz)) continue;
      if (this.isObstacle(nx, nz)) continue;
      neighbors.push({ x: nx, z: nz, g: 0, h: 0, f: 0 });
    }

    // Diagonal movement is allowed only if both adjacent cardinals are open.
    for (const [dx, dz] of diagonal) {
      const nx = node.x + dx;
      const nz = node.z + dz;
      if (!this.isValidPosition(nx, nz)) continue;
      if (this.isObstacle(nx, nz)) continue;

      const sideA = { x: node.x + dx, z: node.z };
      const sideB = { x: node.x, z: node.z + dz };
      if (this.isObstacle(sideA.x, sideA.z) || this.isObstacle(sideB.x, sideB.z)) continue;

      neighbors.push({ x: nx, z: nz, g: 0, h: 0, f: 0 });
    }

    return neighbors;
  }

  private heuristic(a: PathNode, b: PathNode): number {
    // Manhattan distance
    return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  }

  private reconstructGridPath(goal: PathNode): Array<{ x: number; z: number }> {
    const path: Array<{ x: number; z: number }> = [];
    let cursor: PathNode | undefined = goal;

    while (cursor) {
      path.push({ x: cursor.x, z: cursor.z });
      cursor = cursor.parent;
    }

    path.reverse();
    return path;
  }
}
