import type { JointName } from '../pose/landmarkNames';
import type { Vec3Data } from '../pose/poseTypes';
import { clamp } from '../utils/clamp';
import { add, clampMagnitude, distance, isFiniteVec3 } from '../utils/math';
import { translatePositions } from '../pose/coordinateTransform';

type JointMap = Partial<Record<JointName, Vec3Data>>;
type Side = 'left' | 'right';

export interface FootGroundingOptions {
  enabled: boolean;
  smoothingTimeSeconds: number;
  enableFootLocking: boolean;
  plantedSpeedThreshold: number;
  releaseSpeedThreshold: number;
  plantedFrames: number;
  maximumLockCorrection: number;
}

export interface FootGroundingResult {
  positions: JointMap;
  verticalOffset: number;
  plantedFeet: readonly Side[];
}

interface FootLockState {
  previous: Vec3Data | null;
  previousTimestampMs: number | null;
  stillFrames: number;
  lockedPosition: Vec3Data | null;
}

const DEFAULT_OPTIONS: Readonly<FootGroundingOptions> = Object.freeze({
  enabled: true,
  smoothingTimeSeconds: 0.12,
  enableFootLocking: false,
  plantedSpeedThreshold: 0.08,
  releaseSpeedThreshold: 0.18,
  plantedFrames: 4,
  maximumLockCorrection: 0.04,
});

const FOOT_JOINTS: readonly JointName[] = [
  'leftAnkle',
  'leftHeel',
  'leftFootIndex',
  'rightAnkle',
  'rightHeel',
  'rightFootIndex',
];

export class FootGrounder {
  private verticalOffset: number | null = null;
  private previousTimestampMs: number | null = null;
  private readonly options: FootGroundingOptions;
  private readonly locks: Record<Side, FootLockState> = {
    left: { previous: null, previousTimestampMs: null, stillFrames: 0, lockedPosition: null },
    right: { previous: null, previousTimestampMs: null, stillFrames: 0, lockedPosition: null },
  };

  constructor(options: Partial<FootGroundingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  ground(positions: JointMap, timestampMs: number): FootGroundingResult {
    if (!this.options.enabled) {
      return { positions: clonePositions(positions), verticalOffset: 0, plantedFeet: [] };
    }
    const footPoints = FOOT_JOINTS.map((name) => positions[name]).filter(
      (point): point is Vec3Data => point !== undefined && isFiniteVec3(point),
    );
    if (footPoints.length === 0) {
      return {
        positions: clonePositions(positions),
        verticalOffset: this.verticalOffset ?? 0,
        plantedFeet: [],
      };
    }

    const targetOffset = -Math.min(...footPoints.map((point) => point.y));
    if (this.verticalOffset === null || this.previousTimestampMs === null) {
      this.verticalOffset = targetOffset;
    } else {
      const deltaSeconds = clamp((timestampMs - this.previousTimestampMs) / 1000, 0, 0.25);
      const alpha =
        this.options.smoothingTimeSeconds <= 0
          ? 1
          : 1 - Math.exp(-deltaSeconds / this.options.smoothingTimeSeconds);
      this.verticalOffset += (targetOffset - this.verticalOffset) * alpha;
    }
    this.previousTimestampMs = timestampMs;

    let grounded = translatePositions(positions, { x: 0, y: this.verticalOffset, z: 0 });
    const plantedFeet: Side[] = [];
    if (this.options.enableFootLocking) {
      for (const side of ['left', 'right'] as const) {
        const update = this.applyFootLock(grounded, side, timestampMs);
        grounded = update.positions;
        if (update.planted) plantedFeet.push(side);
      }
    }
    return { positions: grounded, verticalOffset: this.verticalOffset, plantedFeet };
  }

  reset(): void {
    this.verticalOffset = null;
    this.previousTimestampMs = null;
    for (const state of Object.values(this.locks)) {
      state.previous = null;
      state.previousTimestampMs = null;
      state.stillFrames = 0;
      state.lockedPosition = null;
    }
  }

  private applyFootLock(
    positions: JointMap,
    side: Side,
    timestampMs: number,
  ): { positions: JointMap; planted: boolean } {
    const state = this.locks[side];
    const heelName: JointName = `${side}Heel`;
    const heel = positions[heelName];
    if (!heel) return { positions, planted: false };

    if (state.previous && state.previousTimestampMs !== null) {
      const deltaSeconds = (timestampMs - state.previousTimestampMs) / 1000;
      const speed = deltaSeconds > 0 ? distance(heel, state.previous) / deltaSeconds : Infinity;
      if (speed < this.options.plantedSpeedThreshold) state.stillFrames += 1;
      else state.stillFrames = 0;
      if (!state.lockedPosition && state.stillFrames >= this.options.plantedFrames) {
        state.lockedPosition = { ...heel };
      } else if (state.lockedPosition && speed > this.options.releaseSpeedThreshold) {
        state.lockedPosition = null;
        state.stillFrames = 0;
      }
    }
    state.previous = { ...heel };
    state.previousTimestampMs = timestampMs;
    if (!state.lockedPosition) return { positions, planted: false };

    const correction = clampMagnitude(
      {
        x: state.lockedPosition.x - heel.x,
        y: 0,
        z: state.lockedPosition.z - heel.z,
      },
      this.options.maximumLockCorrection,
    );
    const output = clonePositions(positions);
    for (const suffix of ['Ankle', 'Heel', 'FootIndex'] as const) {
      const name: JointName = `${side}${suffix}`;
      const point = output[name];
      if (point) output[name] = add(point, correction);
    }
    return { positions: output, planted: true };
  }
}

function clonePositions(positions: JointMap): JointMap {
  const output: JointMap = {};
  for (const [name, value] of Object.entries(positions) as Array<[JointName, Vec3Data]>) {
    if (isFiniteVec3(value)) output[name] = { ...value };
  }
  return output;
}
