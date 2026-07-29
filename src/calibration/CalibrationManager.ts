import type { JointName } from '../pose/landmarkNames';
import type { QuaternionData, Vec2Data, Vec3Data } from '../pose/poseTypes';
import { withDerivedJoints } from '../pose/derivedJoints';
import { averageConfidence } from '../pose/confidence';
import { distance, isFiniteVec3 } from '../utils/math';
import {
  BODY_CALIBRATION_VERSION,
  DEFAULT_BODY_CALIBRATION,
  type BodyCalibration,
} from './BodyCalibration';
import { medianOr } from './median';
import { saveCalibration } from './calibrationStorage';

export interface CalibrationManagerOptions {
  minimumSamples: number;
  targetSamples: number;
  maximumSamples: number;
  minimumAverageConfidence: number;
  symmetryEnabled: boolean;
  bodyHeightMeters: number | null;
}

export interface CalibrationSampleContext {
  normalizedPelvisCenter?: Vec2Data;
  normalizedShoulderCenter?: Vec2Data;
  pelvisOrientation?: QuaternionData;
  chestOrientation?: QuaternionData;
}

export interface CalibrationProgress {
  accepted: boolean;
  acceptedSamples: number;
  minimumSamples: number;
  targetSamples: number;
  maximumSamples: number;
  ready: boolean;
  complete: boolean;
  reason?: 'low-confidence' | 'missing-joints' | 'maximum-reached';
}

interface SegmentMeasurement {
  shoulderWidth: number;
  hipWidth: number;
  torsoLength: number;
  neckLength?: number;
  headSize?: number;
  leftUpperArmLength: number;
  rightUpperArmLength: number;
  leftForearmLength: number;
  rightForearmLength: number;
  leftThighLength: number;
  rightThighLength: number;
  leftShinLength: number;
  rightShinLength: number;
  leftFootLength: number;
  rightFootLength: number;
  scenePelvisCenter: Vec3Data;
  sceneHeadCenter?: Vec3Data;
  normalizedPelvisCenter?: Vec2Data;
  normalizedShoulderCenter?: Vec2Data;
  pelvisOrientation?: QuaternionData;
  chestOrientation?: QuaternionData;
}

const REQUIRED_CONFIDENCE_JOINTS: readonly JointName[] = [
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftFootIndex',
  'rightFootIndex',
];

const DEFAULT_MANAGER_OPTIONS: Readonly<CalibrationManagerOptions> = Object.freeze({
  minimumSamples: 60,
  targetSamples: 75,
  maximumSamples: 90,
  minimumAverageConfidence: 0.65,
  symmetryEnabled: true,
  bodyHeightMeters: null,
});

/** Collects confidence-qualified neutral-pose samples and finalizes robust medians. */
export class CalibrationManager {
  private readonly samples: SegmentMeasurement[] = [];
  private options: CalibrationManagerOptions;

  constructor(options: Partial<CalibrationManagerOptions> = {}) {
    const merged = { ...DEFAULT_MANAGER_OPTIONS, ...options };
    const minimumSamples = Math.max(1, Math.round(merged.minimumSamples));
    const maximumSamples = Math.max(minimumSamples, Math.round(merged.maximumSamples));
    this.options = {
      ...merged,
      minimumSamples,
      maximumSamples,
      targetSamples: Math.min(
        maximumSamples,
        Math.max(minimumSamples, Math.round(merged.targetSamples)),
      ),
    };
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  get isReady(): boolean {
    return this.samples.length >= this.options.minimumSamples;
  }

  get isComplete(): boolean {
    return this.samples.length >= this.options.targetSamples;
  }

  get progress(): number {
    return Math.min(1, this.samples.length / this.options.targetSamples);
  }

  setSymmetry(enabled: boolean): void {
    this.options.symmetryEnabled = enabled;
  }

  setBodyHeightMeters(height: number | null): void {
    this.options.bodyHeightMeters = height !== null && height > 0 ? height : null;
  }

  addSample(
    positions: Partial<Record<JointName, Vec3Data>>,
    confidences: Partial<Record<JointName, number>> = {},
    context: CalibrationSampleContext = {},
  ): CalibrationProgress {
    if (this.samples.length >= this.options.maximumSamples) {
      return this.result(false, 'maximum-reached');
    }

    const requiredConfidence = averageConfidence(
      REQUIRED_CONFIDENCE_JOINTS.map((name) => confidences[name] ?? (positions[name] ? 1 : 0)),
    );
    if (requiredConfidence < this.options.minimumAverageConfidence) {
      return this.result(false, 'low-confidence');
    }

    const enriched = withDerivedJoints(positions, confidences, 0.4);
    const measurement = measureSegments(enriched.positions, context);
    if (!measurement) return this.result(false, 'missing-joints');

    this.samples.push(measurement);
    return this.result(true);
  }

  finalize(): BodyCalibration {
    if (!this.isReady) {
      throw new Error(
        `Calibration needs at least ${this.options.minimumSamples} valid samples; ${this.samples.length} collected.`,
      );
    }

    const segmentMedian = (key: keyof SegmentMeasurement, fallback: number): number =>
      medianOr(
        this.samples
          .map((sample) => sample[key])
          .filter((value): value is number => typeof value === 'number'),
        fallback,
      );

    const leftUpperArm = segmentMedian(
      'leftUpperArmLength',
      DEFAULT_BODY_CALIBRATION.leftUpperArmLength,
    );
    const rightUpperArm = segmentMedian(
      'rightUpperArmLength',
      DEFAULT_BODY_CALIBRATION.rightUpperArmLength,
    );
    const leftForearm = segmentMedian(
      'leftForearmLength',
      DEFAULT_BODY_CALIBRATION.leftForearmLength,
    );
    const rightForearm = segmentMedian(
      'rightForearmLength',
      DEFAULT_BODY_CALIBRATION.rightForearmLength,
    );
    const leftThigh = segmentMedian('leftThighLength', DEFAULT_BODY_CALIBRATION.leftThighLength);
    const rightThigh = segmentMedian('rightThighLength', DEFAULT_BODY_CALIBRATION.rightThighLength);
    const leftShin = segmentMedian('leftShinLength', DEFAULT_BODY_CALIBRATION.leftShinLength);
    const rightShin = segmentMedian('rightShinLength', DEFAULT_BODY_CALIBRATION.rightShinLength);
    const leftFoot = segmentMedian('leftFootLength', DEFAULT_BODY_CALIBRATION.leftFootLength);
    const rightFoot = segmentMedian('rightFootLength', DEFAULT_BODY_CALIBRATION.rightFootLength);

    const upperArmLength = (leftUpperArm + rightUpperArm) / 2;
    const forearmLength = (leftForearm + rightForearm) / 2;
    const thighLength = (leftThigh + rightThigh) / 2;
    const shinLength = (leftShin + rightShin) / 2;
    const footLength = (leftFoot + rightFoot) / 2;
    const symmetric = this.options.symmetryEnabled;

    return {
      version: BODY_CALIBRATION_VERSION,
      createdAt: new Date().toISOString(),
      sampleCount: this.samples.length,
      symmetryEnabled: symmetric,
      bodyHeightMeters: this.options.bodyHeightMeters,
      shoulderWidth: segmentMedian('shoulderWidth', DEFAULT_BODY_CALIBRATION.shoulderWidth),
      hipWidth: segmentMedian('hipWidth', DEFAULT_BODY_CALIBRATION.hipWidth),
      torsoLength: segmentMedian('torsoLength', DEFAULT_BODY_CALIBRATION.torsoLength),
      neckLength: segmentMedian('neckLength', DEFAULT_BODY_CALIBRATION.neckLength),
      headSize: segmentMedian('headSize', DEFAULT_BODY_CALIBRATION.headSize),
      leftUpperArmLength: symmetric ? upperArmLength : leftUpperArm,
      rightUpperArmLength: symmetric ? upperArmLength : rightUpperArm,
      upperArmLength,
      leftForearmLength: symmetric ? forearmLength : leftForearm,
      rightForearmLength: symmetric ? forearmLength : rightForearm,
      forearmLength,
      leftThighLength: symmetric ? thighLength : leftThigh,
      rightThighLength: symmetric ? thighLength : rightThigh,
      thighLength,
      leftShinLength: symmetric ? shinLength : leftShin,
      rightShinLength: symmetric ? shinLength : rightShin,
      shinLength,
      leftFootLength: symmetric ? footLength : leftFoot,
      rightFootLength: symmetric ? footLength : rightFoot,
      footLength,
      reference: buildReference(this.samples),
    };
  }

  finalizeAndSave(storage?: Storage | null): BodyCalibration {
    const calibration = this.finalize();
    if (!saveCalibration(calibration, storage)) {
      throw new Error('Calibration was created but could not be saved to localStorage.');
    }
    return calibration;
  }

  reset(): void {
    this.samples.length = 0;
  }

  private result(accepted: boolean, reason?: CalibrationProgress['reason']): CalibrationProgress {
    return {
      accepted,
      acceptedSamples: this.samples.length,
      minimumSamples: this.options.minimumSamples,
      targetSamples: this.options.targetSamples,
      maximumSamples: this.options.maximumSamples,
      ready: this.isReady,
      complete: this.isComplete,
      ...(reason ? { reason } : {}),
    };
  }
}

function measureSegments(
  positions: Partial<Record<JointName, Vec3Data>>,
  context: CalibrationSampleContext,
): SegmentMeasurement | null {
  const point = (name: JointName): Vec3Data | null => {
    const value = positions[name];
    return value && isFiniteVec3(value) ? value : null;
  };
  const requiredNames: readonly JointName[] = [
    'leftShoulder',
    'rightShoulder',
    'leftElbow',
    'rightElbow',
    'leftWrist',
    'rightWrist',
    'leftHip',
    'rightHip',
    'leftKnee',
    'rightKnee',
    'leftAnkle',
    'rightAnkle',
    'leftHeel',
    'rightHeel',
    'leftFootIndex',
    'rightFootIndex',
    'pelvisCenter',
    'shoulderCenter',
  ];
  const required = Object.fromEntries(requiredNames.map((name) => [name, point(name)])) as Record<
    JointName,
    Vec3Data | null
  >;
  if (requiredNames.some((name) => !required[name])) return null;
  const p = required as Record<JointName, Vec3Data>;
  const positiveDistance = (a: JointName, b: JointName): number | null => {
    const value = distance(p[a], p[b]);
    return value > 1e-5 && Number.isFinite(value) ? value : null;
  };
  const measurements = {
    shoulderWidth: positiveDistance('leftShoulder', 'rightShoulder'),
    hipWidth: positiveDistance('leftHip', 'rightHip'),
    torsoLength: positiveDistance('pelvisCenter', 'shoulderCenter'),
    leftUpperArmLength: positiveDistance('leftShoulder', 'leftElbow'),
    rightUpperArmLength: positiveDistance('rightShoulder', 'rightElbow'),
    leftForearmLength: positiveDistance('leftElbow', 'leftWrist'),
    rightForearmLength: positiveDistance('rightElbow', 'rightWrist'),
    leftThighLength: positiveDistance('leftHip', 'leftKnee'),
    rightThighLength: positiveDistance('rightHip', 'rightKnee'),
    leftShinLength: positiveDistance('leftKnee', 'leftAnkle'),
    rightShinLength: positiveDistance('rightKnee', 'rightAnkle'),
    leftFootLength: positiveDistance('leftHeel', 'leftFootIndex'),
    rightFootLength: positiveDistance('rightHeel', 'rightFootIndex'),
  };
  if (Object.values(measurements).some((value) => value === null)) return null;

  const headCenter = point('headCenter');
  const leftEar = point('leftEar');
  const rightEar = point('rightEar');
  return {
    ...(measurements as Omit<SegmentMeasurement, 'scenePelvisCenter'>),
    ...(headCenter ? { neckLength: distance(p.shoulderCenter, headCenter) } : {}),
    ...(leftEar && rightEar ? { headSize: distance(leftEar, rightEar) } : {}),
    scenePelvisCenter: { ...p.pelvisCenter },
    ...(headCenter ? { sceneHeadCenter: { ...headCenter } } : {}),
    ...context,
  };
}

function buildReference(samples: readonly SegmentMeasurement[]): BodyCalibration['reference'] {
  const vectorMedian = (
    selector: (sample: SegmentMeasurement) => Vec3Data | undefined,
  ): Vec3Data | null => {
    const points = samples.map(selector).filter((value): value is Vec3Data => value !== undefined);
    if (points.length === 0) return null;
    return {
      x: medianOr(
        points.map((value) => value.x),
        0,
      ),
      y: medianOr(
        points.map((value) => value.y),
        0,
      ),
      z: medianOr(
        points.map((value) => value.z),
        0,
      ),
    };
  };
  const vec2Median = (
    selector: (sample: SegmentMeasurement) => Vec2Data | undefined,
  ): Vec2Data | null => {
    const points = samples.map(selector).filter((value): value is Vec2Data => value !== undefined);
    return points.length === 0
      ? null
      : {
          x: medianOr(
            points.map((value) => value.x),
            0.5,
          ),
          y: medianOr(
            points.map((value) => value.y),
            0.5,
          ),
        };
  };
  const quaternionMedian = (
    selector: (sample: SegmentMeasurement) => QuaternionData | undefined,
  ): QuaternionData | null => {
    const values = samples
      .map(selector)
      .filter((value): value is QuaternionData => value !== undefined);
    if (values.length === 0) return null;
    const reference = values[0]!;
    const continuous = values.map((value) =>
      reference.x * value.x +
        reference.y * value.y +
        reference.z * value.z +
        reference.w * value.w <
      0
        ? { x: -value.x, y: -value.y, z: -value.z, w: -value.w }
        : value,
    );
    const components = {
      x: medianOr(
        continuous.map((value) => value.x),
        0,
      ),
      y: medianOr(
        continuous.map((value) => value.y),
        0,
      ),
      z: medianOr(
        continuous.map((value) => value.z),
        0,
      ),
      w: medianOr(
        continuous.map((value) => value.w),
        1,
      ),
    };
    const magnitude = Math.hypot(components.x, components.y, components.z, components.w);
    return magnitude > 1e-8
      ? {
          x: components.x / magnitude,
          y: components.y / magnitude,
          z: components.z / magnitude,
          w: components.w / magnitude,
        }
      : null;
  };

  const normalizedPelvisCenter = vec2Median((sample) => sample.normalizedPelvisCenter);
  const normalizedShoulderCenter = vec2Median((sample) => sample.normalizedShoulderCenter);
  const normalizedTorsoScale =
    normalizedPelvisCenter && normalizedShoulderCenter
      ? Math.hypot(
          normalizedShoulderCenter.x - normalizedPelvisCenter.x,
          normalizedShoulderCenter.y - normalizedPelvisCenter.y,
        )
      : null;
  return {
    scenePelvisCenter: vectorMedian((sample) => sample.scenePelvisCenter) ?? { x: 0, y: 0, z: 0 },
    sceneHeadCenter: vectorMedian((sample) => sample.sceneHeadCenter),
    normalizedPelvisCenter,
    normalizedShoulderCenter,
    normalizedTorsoScale,
    pelvisOrientation: quaternionMedian((sample) => sample.pelvisOrientation),
    chestOrientation: quaternionMedian((sample) => sample.chestOrientation),
  };
}
