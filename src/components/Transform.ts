/**
 * Transform - Position, rotation, scale component
 */

import { Vector3, TransformNode, Scene } from '@babylonjs/core';
import { IComponent } from '../entities/Entity';

export class Transform implements IComponent {
  public node: TransformNode;
  
  constructor(scene: Scene, name: string) {
    this.node = new TransformNode(name, scene);
  }

  get position(): Vector3 {
    return this.node.position;
  }

  set position(value: Vector3) {
    this.node.position = value;
  }

  get rotation(): Vector3 {
    return this.node.rotation;
  }

  set rotation(value: Vector3) {
    this.node.rotation = value;
  }

  get scaling(): Vector3 {
    return this.node.scaling;
  }

  set scaling(value: Vector3) {
    this.node.scaling = value;
  }

  update(deltaTime: number): void {
    // Transform updates are handled by Babylon.js
  }

  destroy(): void {
    this.node.dispose();
  }
}
