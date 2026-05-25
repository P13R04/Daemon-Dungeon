import type { Vector3 } from '@babylonjs/core';

export interface BeamSegment {
  start: Vector3;
  end: Vector3;
}

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
