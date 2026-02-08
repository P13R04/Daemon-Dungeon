/**
 * Pool - Object pooling for performance optimization
 */

export interface IPoolable {
  reset(): void;
  isActive(): boolean;
  setActive(active: boolean): void;
}

export class Pool<T extends IPoolable> {
  private pool: T[] = [];
  private factory: () => T;
  private initialSize: number;

  constructor(factory: () => T, initialSize: number = 10) {
    this.factory = factory;
    this.initialSize = initialSize;
    this.initialize();
  }

  private initialize(): void {
    for (let i = 0; i < this.initialSize; i++) {
      const obj = this.factory();
      obj.setActive(false);
      this.pool.push(obj);
    }
  }

  get(): T {
    // Find inactive object
    for (const obj of this.pool) {
      if (!obj.isActive()) {
        obj.setActive(true);
        obj.reset();
        return obj;
      }
    }

    // Create new if none available
    const obj = this.factory();
    obj.setActive(true);
    this.pool.push(obj);
    return obj;
  }

  release(obj: T): void {
    obj.setActive(false);
  }

  releaseAll(): void {
    this.pool.forEach(obj => obj.setActive(false));
  }

  getActiveCount(): number {
    return this.pool.filter(obj => obj.isActive()).length;
  }

  getTotalCount(): number {
    return this.pool.length;
  }
}
