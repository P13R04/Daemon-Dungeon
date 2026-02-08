/**
 * Entity - Base class for all game entities (ECS-lite approach)
 */

import { TransformNode } from '@babylonjs/core';

export interface IComponent {
  update(deltaTime: number): void;
  destroy(): void;
}

export class Entity {
  public id: string;
  public transformNode?: TransformNode;
  private components: Map<string, IComponent> = new Map();
  public isActive: boolean = true;

  constructor(id: string) {
    this.id = id;
  }

  addComponent<T extends IComponent>(name: string, component: T): void {
    this.components.set(name, component);
  }

  getComponent<T extends IComponent>(name: string): T | undefined {
    return this.components.get(name) as T;
  }

  removeComponent(name: string): void {
    const component = this.components.get(name);
    if (component) {
      component.destroy();
      this.components.delete(name);
    }
  }

  update(deltaTime: number): void {
    if (!this.isActive) return;
    
    this.components.forEach(component => {
      component.update(deltaTime);
    });
  }

  destroy(): void {
    this.components.forEach(component => component.destroy());
    this.components.clear();
    
    if (this.transformNode) {
      this.transformNode.dispose();
    }
  }
}
