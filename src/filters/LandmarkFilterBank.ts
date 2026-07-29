import type { JointName } from '../pose/landmarkNames';
import type { Vec3Data } from '../pose/poseTypes';
import type { OneEuroFilterOptions } from './OneEuroFilter';
import { VectorOneEuroFilter } from './VectorOneEuroFilter';

/** Lazily creates an independent XYZ filter for every joint. */
export class LandmarkFilterBank {
  private readonly filters = new Map<JointName, VectorOneEuroFilter>();

  constructor(private readonly options: Partial<OneEuroFilterOptions> = {}) {}

  filter(joint: JointName, value: Vec3Data, timestampMs: number, confidence = 1): Vec3Data {
    let filter = this.filters.get(joint);
    if (!filter) {
      filter = new VectorOneEuroFilter(this.options);
      this.filters.set(joint, filter);
    }
    return filter.filter(value, timestampMs, confidence);
  }

  resetJoint(joint: JointName, value?: Vec3Data, timestampMs?: number): void {
    const filter = this.filters.get(joint);
    if (filter) filter.reset(value, timestampMs);
  }

  reset(): void {
    this.filters.clear();
  }
}
