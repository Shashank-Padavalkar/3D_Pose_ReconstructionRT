import type { Vec3Data } from '../pose/poseTypes';
import { OneEuroFilter, type OneEuroFilterOptions } from './OneEuroFilter';

export class VectorOneEuroFilter {
  private readonly x: OneEuroFilter;
  private readonly y: OneEuroFilter;
  private readonly z: OneEuroFilter;

  constructor(options: Partial<OneEuroFilterOptions> = {}) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
    this.z = new OneEuroFilter(options);
  }

  filter(value: Vec3Data, timestampMs: number, confidence = 1): Vec3Data {
    return {
      x: this.x.filter(value.x, timestampMs, confidence),
      y: this.y.filter(value.y, timestampMs, confidence),
      z: this.z.filter(value.z, timestampMs, confidence),
    };
  }

  reset(value?: Vec3Data, timestampMs?: number): void {
    this.x.reset(value?.x, timestampMs);
    this.y.reset(value?.y, timestampMs);
    this.z.reset(value?.z, timestampMs);
  }
}
