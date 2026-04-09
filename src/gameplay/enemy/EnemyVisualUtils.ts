import type { Mesh } from '@babylonjs/core';

export function disposeMeshesAndMaterials(meshes: Mesh[]): void {
  for (const mesh of meshes) {
    const material = mesh.material;
    mesh.dispose();
    if (material) {
      material.dispose();
    }
  }
}
