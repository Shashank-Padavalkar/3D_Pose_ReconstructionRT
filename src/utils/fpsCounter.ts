export class FpsCounter {
  private frameCount = 0;
  private windowStartedAt = performance.now();
  private currentFps = 0;

  tick(timestampMs = performance.now()): number {
    this.frameCount += 1;
    const elapsed = timestampMs - this.windowStartedAt;
    if (elapsed >= 1000) {
      this.currentFps = (this.frameCount * 1000) / elapsed;
      this.frameCount = 0;
      this.windowStartedAt = timestampMs;
    }
    return this.currentFps;
  }

  reset(timestampMs = performance.now()): void {
    this.frameCount = 0;
    this.windowStartedAt = timestampMs;
    this.currentFps = 0;
  }
}
