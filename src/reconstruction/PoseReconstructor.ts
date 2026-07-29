import { DEFAULT_BODY_CALIBRATION, type BodyCalibration } from '../calibration/BodyCalibration';
import type { JointName } from '../pose/landmarkNames';
import type { QuaternionData, Vec3Data } from '../pose/poseTypes';
import { translatePositions } from '../pose/coordinateTransform';
import { applyBoneLengthConstraints, type JointPositionMap } from './BoneLengthConstraint';
import { FootGrounder, type FootGroundingOptions } from './FootGrounding';
import {
  RootMotionEstimator,
  type RootMotionEstimatorOptions,
  type RootMotionMode,
  type RootMotionObservation,
} from './RootMotionEstimator';
import { TorsoFrameTracker } from './TorsoFrames';

export interface PoseReconstructorOptions {
  rootMotionMode: RootMotionMode;
  rootMotion: Partial<RootMotionEstimatorOptions>;
  grounding: Partial<FootGroundingOptions>;
}

export interface PoseReconstructionInput {
  filteredRootRelative: JointPositionMap;
  normalizedPositions?: Partial<Record<JointName, Vec3Data>>;
  timestampMs: number;
}

export interface PoseReconstructionResult {
  constrainedPositions: JointPositionMap;
  rootTranslation: Vec3Data;
  pelvisOrientation: QuaternionData | null;
  chestOrientation: QuaternionData | null;
  headOrientation: QuaternionData | null;
  plantedFeet: readonly ('left' | 'right')[];
}

const DEFAULT_OPTIONS: Readonly<PoseReconstructorOptions> = Object.freeze({
  rootMotionMode: 'anchored',
  rootMotion: Object.freeze({}),
  grounding: Object.freeze({ enabled: true, enableFootLocking: false }),
});

/** Fixed-length reconstruction, optional coarse root motion, floor grounding and orientations. */
export class PoseReconstructor {
  private calibration: BodyCalibration = DEFAULT_BODY_CALIBRATION;
  private rootMotionMode: RootMotionMode;
  private rootMotion: RootMotionEstimator;
  private grounder: FootGrounder;
  private readonly frameTracker = new TorsoFrameTracker();
  private options: PoseReconstructorOptions;

  constructor(options: Partial<PoseReconstructorOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      rootMotion: { ...DEFAULT_OPTIONS.rootMotion, ...options.rootMotion },
      grounding: { ...DEFAULT_OPTIONS.grounding, ...options.grounding },
    };
    this.rootMotionMode = this.options.rootMotionMode;
    this.rootMotion = new RootMotionEstimator(this.options.rootMotion);
    this.grounder = new FootGrounder(this.options.grounding);
  }

  reconstruct(input: PoseReconstructionInput): PoseReconstructionResult {
    const constrainedLocal = applyBoneLengthConstraints(
      input.filteredRootRelative,
      this.calibration,
    );
    const observation = normalizedRootObservation(input.normalizedPositions);
    const coarseRoot = this.rootMotion.update(observation, input.timestampMs, this.rootMotionMode);
    const translated = translatePositions(constrainedLocal, coarseRoot);
    const grounded = this.grounder.ground(translated, input.timestampMs);
    const rootTranslation = {
      x: coarseRoot.x,
      y: coarseRoot.y + grounded.verticalOffset,
      z: coarseRoot.z,
    };
    const frames = this.frameTracker.update(grounded.positions);
    return {
      constrainedPositions: grounded.positions,
      rootTranslation,
      pelvisOrientation: frames.pelvis?.quaternion ?? null,
      chestOrientation: frames.chest?.quaternion ?? null,
      headOrientation: frames.head?.quaternion ?? null,
      plantedFeet: grounded.plantedFeet,
    };
  }

  setCalibration(calibration: BodyCalibration | null): void {
    this.calibration = calibration ?? DEFAULT_BODY_CALIBRATION;
    const reference = this.calibration.reference;
    if (
      reference.normalizedPelvisCenter &&
      reference.normalizedShoulderCenter &&
      reference.normalizedTorsoScale !== null
    ) {
      this.rootMotion.setReference({
        pelvisCenter: reference.normalizedPelvisCenter,
        shoulderCenter: reference.normalizedShoulderCenter,
        torsoPixelScale: reference.normalizedTorsoScale,
      });
    } else {
      this.rootMotion.setReference(null);
    }
    this.grounder.reset();
    this.frameTracker.reset();
  }

  setRootMotionMode(mode: RootMotionMode): void {
    this.rootMotionMode = mode;
  }

  updateOptions(options: Partial<PoseReconstructorOptions>): void {
    this.options = {
      ...this.options,
      ...options,
      rootMotion: { ...this.options.rootMotion, ...options.rootMotion },
      grounding: { ...this.options.grounding, ...options.grounding },
    };
    this.rootMotionMode = this.options.rootMotionMode;
    this.rootMotion = new RootMotionEstimator(this.options.rootMotion);
    this.grounder = new FootGrounder(this.options.grounding);
    this.setCalibration(this.calibration);
  }

  reset(): void {
    this.rootMotion.reset();
    this.grounder.reset();
    this.frameTracker.reset();
    this.setCalibration(this.calibration);
  }
}

function normalizedRootObservation(
  positions?: Partial<Record<JointName, Vec3Data>>,
): RootMotionObservation | null {
  const pelvisCenter = positions?.pelvisCenter;
  const shoulderCenter = positions?.shoulderCenter;
  return pelvisCenter && shoulderCenter
    ? {
        pelvisCenter: { x: pelvisCenter.x, y: pelvisCenter.y },
        shoulderCenter: { x: shoulderCenter.x, y: shoulderCenter.y },
      }
    : null;
}
