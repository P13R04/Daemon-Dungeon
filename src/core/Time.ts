/**
 * Time - Centralized time management
 */

export class Time {
  private static instance: Time;
  
  public deltaTime: number = 0;
  public timeScale: number = 1;
  public elapsedTime: number = 0;
  private lastFrameTime: number = 0;

  private constructor() {}

  static getInstance(): Time {
    if (!Time.instance) {
      Time.instance = new Time();
    }
    return Time.instance;
  }

  update(currentTime: number): void {
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = currentTime;
    }
    
    const rawDelta = (currentTime - this.lastFrameTime) / 1000;
    this.deltaTime = rawDelta * this.timeScale;
    this.elapsedTime += this.deltaTime;
    this.lastFrameTime = currentTime;
  }

  reset(): void {
    this.deltaTime = 0;
    this.elapsedTime = 0;
    this.lastFrameTime = 0;
  }
}
