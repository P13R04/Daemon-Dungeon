/**
 * Debug - Development utilities
 */

export class Debug {
  private static enabled: boolean = false;

  static enable(): void {
    this.enabled = true;
  }

  static disable(): void {
    this.enabled = false;
  }

  static log(...args: any[]): void {
    if (this.enabled) {
      console.log('[DEBUG]', ...args);
    }
  }

  static warn(...args: any[]): void {
    if (this.enabled) {
      console.warn('[DEBUG]', ...args);
    }
  }

  static error(...args: any[]): void {
    if (this.enabled) {
      console.error('[DEBUG]', ...args);
    }
  }

  static measure(label: string, fn: () => void): void {
    if (this.enabled) {
      console.time(label);
      fn();
      console.timeEnd(label);
    } else {
      fn();
    }
  }

  static assert(condition: boolean, message: string): void {
    if (this.enabled && !condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
}
