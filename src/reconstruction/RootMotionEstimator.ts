import type { Vec2Data, Vec3Data } from '../pose/poseTypes';
import { clamp } from '../utils/clamp';
import { clampMagnitude, interpolate, subtract } from '../utils/math';

export type RootMotionMode = 'anchored' | 'approximate';

export interface RootMotionReference {
  pelvisCenter: Vec2Data;
  shoulderCenter: Vec2Data;
  torsoPixelScale: number;
}

export interface RootMotionObservation {
  pelvisCenter: Vec2Data;
  shoulderCenter: Vec2Data;
}

export interface RootMotionEstimatorOptions {
  horizontalScale: number;
  verticalScale: number;
  depthScale: number;
  maximumHorizontal: number;
  maximumVertical: number;
  maximumDepth: number;
  maximumSpeed: number;
  smoothing: number;
}

const DEFAULT_OPTIONS: Readonly<RootMotionEstimatorOptions> = Object.freeze({
  horizontalScale: 2,
  verticalScale: 2,
  depthScale: 1,
  maximumHorizontal: 1.5,
  maximumVertical: 1,
  maximumDepth: 2,
  maximumSpeed: 1.5,
  smoothing: 0.16,
});

export function createRootMotionReference(
  observation: RootMotionObservation,
): RootMotionReference | null {
  const torsoPixelScale = distance2D(observation.pelvisCenter, observation.shoulderCenter);
  return torsoPixelScale > 1e-5
    ? {
        pelvisCenter: { ...observation.pelvisCenter },
        shoulderCenter: { ...observation.shoulderCenter },
        torsoPixelScale,
      }
    : null;
}

export function clampRootTranslation(
  value: Vec3Data,
  options: Pick<
    RootMotionEstimatorOptions,
    'maximumHorizontal' | 'maximumVertical' | 'maximumDepth'
  > = DEFAULT_OPTIONS,
): Vec3Data {
  return {
    x: clamp(value.x, -options.maximumHorizontal, options.maximumHorizontal),
    y: clamp(value.y, -options.maximumVertical, options.maximumVertical),
    z: clamp(value.z, -options.maximumDepth, options.maximumDepth),
  };
}

export class RootMotionEstimator {
  private current: Vec3Data = { x: 0, y: 0, z: 0 };
  private previousTimestampMs: number | null = null;
  private reference: RootMotionReference | null = null;
  private readonly options: RootMotionEstimatorOptions;

  constructor(options: Partial<RootMotionEstimatorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setReference(reference: RootMotionReference | null): void {
    this.reference = reference
      ? {
          pelvisCenter: { ...reference.pelvisCenter },
          shoulderCenter: { ...reference.shoulderCenter },
          torsoPixelScale: reference.torsoPixelScale,
        }
      : null;
  }

  update(
    observation: RootMotionObservation | null,
    timestampMs: number,
    mode: RootMotionMode,
  ): Vec3Data {
    if (mode === 'anchored') {
      this.current = { x: 0, y: 0, z: 0 };
      this.previousTimestampMs = timestampMs;
      return { ...this.current };
    }
    if (!observation) return { ...this.current };
    if (!this.reference) this.reference = createRootMotionReference(observation);
    if (!this.reference) return { ...this.current };

    const currentScale = distance2D(observation.pelvisCenter, observation.shoulderCenter);
    const depthRatio = currentScale > 1e-5 ? this.reference.torsoPixelScale / currentScale : 1;
    let target = clampRootTranslation(
      {
        x:
          (observation.pelvisCenter.x - this.reference.pelvisCenter.x) *
          this.options.horizontalScale,
        y:
          -(observation.pelvisCenter.y - this.reference.pelvisCenter.y) *
          this.options.verticalScale,
        z: (depthRatio - 1) * this.options.depthScale,
      },
      this.options,
    );

    if (this.previousTimestampMs !== null) {
      const deltaSeconds = clamp((timestampMs - this.previousTimestampMs) / 1000, 0, 0.25);
      const maximumDelta = this.options.maximumSpeed * deltaSeconds;
      target = addDelta(this.current, clampMagnitude(subtract(target, this.current), maximumDelta));
    }
    this.current = interpolate(this.current, target, clamp(this.options.smoothing, 0, 1));
    this.previousTimestampMs = timestampMs;
    return { ...this.current };
  }

  reset(): void {
    this.current = { x: 0, y: 0, z: 0 };
    this.previousTimestampMs = null;
    this.reference = null;
  }
}

function distance2D(a: Vec2Data, b: Vec2Data): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function addDelta(origin: Vec3Data, delta: Vec3Data): Vec3Data {
  return { x: origin.x + delta.x, y: origin.y + delta.y, z: origin.z + delta.z };
}
