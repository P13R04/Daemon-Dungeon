/**
 * VisualPlaceholder - Creates simple geometric placeholders for testing
 */

import { MeshBuilder, StandardMaterial, Color3, Mesh, Scene, Vector3 } from '@babylonjs/core';

export class VisualPlaceholder {
  static createPlayerPlaceholder(scene: Scene, name: string = 'player'): Mesh {
    // Blue cube for player
    const mesh = MeshBuilder.CreateBox(name, { size: 0.6 }, scene);
    const material = new StandardMaterial(`${name}_mat`, scene);
    material.diffuseColor = new Color3(0.2, 0.5, 1.0); // Blue
    material.emissiveColor = new Color3(0.1, 0.3, 0.5);
    mesh.material = material;
    return mesh;
  }

  static createEnemyPlaceholder(scene: Scene, name: string, color: Color3 = new Color3(1.0, 0.5, 0.2)): Mesh {
    // Orange sphere for enemy
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 0.5 }, scene);
    const material = new StandardMaterial(`${name}_mat`, scene);
    material.diffuseColor = color;
    material.emissiveColor = new Color3(color.r * 0.5, color.g * 0.5, color.b * 0.5);
    mesh.material = material;
    return mesh;
  }

  static createProjectilePlaceholder(scene: Scene, name: string): Mesh {
    // Small yellow sphere for projectile
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 0.3 }, scene);
    const material = new StandardMaterial(`${name}_mat`, scene);
    material.diffuseColor = new Color3(1.0, 1.0, 0.0); // Yellow
    material.emissiveColor = new Color3(1.0, 1.0, 0.0);
    mesh.material = material;
    return mesh;
  }

  static createAoEPlaceholder(scene: Scene, name: string, radius: number): Mesh {
    // Transparent cylinder for AoE zone
    const mesh = MeshBuilder.CreateCylinder(name, { height: 0.1, diameter: radius * 2 }, scene);
    const material = new StandardMaterial(`${name}_mat`, scene);
    material.diffuseColor = new Color3(0.5, 1.0, 0.5); // Green
    material.alpha = 0.3;
    mesh.material = material;
    return mesh;
  }

  static createFloorTile(scene: Scene, name: string, isWall: boolean = false): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { size: 1.0 }, scene);
    const material = new StandardMaterial(`${name}_mat`, scene);
    
    if (isWall) {
      material.diffuseColor = new Color3(0.3, 0.3, 0.3);
      material.emissiveColor = new Color3(0.1, 0.1, 0.1);
    } else {
      material.diffuseColor = new Color3(0.2, 0.2, 0.2);
      material.emissiveColor = new Color3(0.05, 0.05, 0.05);
    }
    
    mesh.material = material;
    return mesh;
  }

  static createGridOverlay(scene: Scene, width: number, height: number, tileSize: number): void {
    // Draw grid lines for dev purposes
    for (let x = 0; x <= width; x++) {
      const line = MeshBuilder.CreateTube(
        `gridX_${x}`,
        {
          path: [
            new Vector3(x * tileSize, 0.01, 0),
            new Vector3(x * tileSize, 0.01, height * tileSize),
          ],
          radius: 0.02,
        },
        scene
      );
      const mat = new StandardMaterial(`gridMat_${x}`, scene);
      mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
      line.material = mat;
    }

    for (let z = 0; z <= height; z++) {
      const line = MeshBuilder.CreateTube(
        `gridZ_${z}`,
        {
          path: [
            new Vector3(0, 0.01, z * tileSize),
            new Vector3(width * tileSize, 0.01, z * tileSize),
          ],
          radius: 0.02,
        },
        scene
      );
      const mat = new StandardMaterial(`gridMat_${z}`, scene);
      mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
      line.material = mat;
    }
  }
}
