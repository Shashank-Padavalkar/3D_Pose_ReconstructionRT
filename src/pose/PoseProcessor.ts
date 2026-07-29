import type { BodyCalibration } from '../calibration/BodyCalibration';
import { LandmarkFilterBank } from '../filters/LandmarkFilterBank';
import {
  MissingJointPredictor,
  type MissingJointPredictorOptions,
} from '../filters/MissingJointPredictor';
import type { OneEuroFilterOptions } from '../filters/OneEuroFilter';
import { calculatePoseMetrics } from '../metrics/poseMetrics';
import {
  PoseReconstructor,
  type PoseReconstructorOptions,
} from '../reconstruction/PoseReconstructor';
import type { RootMotionMode } from '../reconstruction/RootMotionEstimator';
import { isFiniteVec3, subtract } from '../utils/math';
import {
  averageConfidence,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  gateConfidence,
  landmarkConfidence,
  type ConfidenceThresholds,
} from './confidence';
import {
  DEFAULT_AXIS_INVERSION,
  makeRootRelative,
  mediaPipeWorldToScene,
  type AxisInversion,
} from './coordinateTransform';
import { withDerivedJoints } from './derivedJoints';
import {
  ALL_JOINT_NAMES,
  LANDMARK_NAMES,
  type JointName,
  type LandmarkName,
} from './landmarkNames';
import type {
  PoseInferenceResult,
  PoseLandmark,
  ProcessedJoint,
  ProcessedPoseFrame,
  Vec3Data,
} from './poseTypes';

export interface PoseProcessorSettings {
  confidenceThresholds: ConfidenceThresholds;
  filter: Partial<OneEuroFilterOptions>;
  prediction: Partial<MissingJointPredictorOptions>;
  axisInversion: AxisInversion;
  rootMotionMode: RootMotionMode;
  groundingEnabled: boolean;
  footLockingEnabled: boolean;
  trackingLostResetMs: number;
}

export interface PoseProcessorOptions extends Partial<PoseProcessorSettings> {
  calibration?: BodyCalibration | null;
  reconstruction?: Partial<PoseReconstructorOptions>;
}

const DEFAULT_SETTINGS: Readonly<PoseProcessorSettings> = Object.freeze({
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
  filter: Object.freeze({ minCutoff: 1, beta: 0.06, derivativeCutoff: 1 }),
  prediction: Object.freeze({ predictionHorizonMs: 125, maximumVelocity: 3 }),
  axisInversion: DEFAULT_AXIS_INVERSION,
  rootMotionMode: 'anchored',
  groundingEnabled: true,
  footLockingEnabled: false,
  trackingLostResetMs: 1_000,
});

/**
 * Stateful pure-domain pose pipeline.
 *
 * Call `process` once for each inference result. The returned frame contains only
 * plain serializable values. Use `reset` when a camera/recording source changes.
 */
export class PoseProcessor {
  private settings: PoseProcessorSettings;
  private calibration: BodyCalibration | null;
  private filterBank: LandmarkFilterBank;
  private predictor: MissingJointPredictor;
  private reconstructor: PoseReconstructor;
  private lastReliableTimestampMs: number | null = null;

  constructor(options: PoseProcessorOptions = {}) {
    this.settings = mergeSettings(DEFAULT_SETTINGS, options);
    this.calibration = options.calibration ?? null;
    this.filterBank = new LandmarkFilterBank(this.settings.filter);
    this.predictor = this.createPredictor();
    this.reconstructor = new PoseReconstructor({
      ...options.reconstruction,
      rootMotionMode: this.settings.rootMotionMode,
      grounding: {
        ...options.reconstruction?.grounding,
        enabled: this.settings.groundingEnabled,
        enableFootLocking: this.settings.footLockingEnabled,
      },
    });
    this.reconstructor.setCalibration(this.calibration);
  }

  process(result: PoseInferenceResult): ProcessedPoseFrame | null {
    if (!Number.isFinite(result.timestampMs)) return null;

    const normalized2D: Partial<Record<JointName, PoseLandmark>> = {};
    const observedWorld: Partial<Record<JointName, Vec3Data>> = {};
    const confidences: Partial<Record<JointName, number>> = {};
    const effectiveConfidences: Partial<Record<JointName, number>> = {};
    const filteredWorld: Partial<Record<JointName, Vec3Data>> = {};
    const predictionFlags: Partial<Record<JointName, boolean>> = {};

    LANDMARK_NAMES.forEach((name, index) => {
      const normalized = result.normalizedLandmarks[index];
      const world = result.worldLandmarks[index];
      if (normalized && isFiniteVec3(normalized)) normalized2D[name] = cloneLandmark(normalized);

      const normalizedConfidence = landmarkConfidence(normalized);
      const worldConfidence = world ? landmarkConfidence(world) : normalizedConfidence;
      const confidence = normalized
        ? Math.min(normalizedConfidence, worldConfidence)
        : worldConfidence;
      confidences[name] = confidence;

      const scenePoint =
        world && isFiniteVec3(world)
          ? mediaPipeWorldToScene(world, this.settings.axisInversion)
          : null;
      if (scenePoint) observedWorld[name] = scenePoint;
      const decision = gateConfidence(confidence, this.settings.confidenceThresholds);
      const predicted = this.predictor.update(
        name,
        decision === 'predict' ? null : scenePoint,
        confidence,
        result.timestampMs,
      );
      if (!predicted.position || !predicted.isValid) return;
      predictionFlags[name] = predicted.isPredicted;
      effectiveConfidences[name] = predicted.isPredicted
        ? Math.max(confidence, this.settings.confidenceThresholds.usable)
        : confidence;
      filteredWorld[name] = this.filterBank.filter(
        name,
        predicted.position,
        result.timestampMs,
        effectiveConfidences[name],
      );
    });

    const actualAverageConfidence = averageConfidence(
      LANDMARK_NAMES.filter((name) => observedWorld[name] !== undefined).map(
        (name) => confidences[name] ?? 0,
      ),
    );
    if (actualAverageConfidence >= this.settings.confidenceThresholds.usable) {
      this.lastReliableTimestampMs = result.timestampMs;
    } else if (
      this.lastReliableTimestampMs !== null &&
      result.timestampMs - this.lastReliableTimestampMs > this.settings.trackingLostResetMs
    ) {
      this.resetTemporalState();
      return null;
    }

    const filteredEnriched = withDerivedJoints(
      filteredWorld,
      effectiveConfidences,
      this.settings.confidenceThresholds.usable,
    );
    const filteredRelative = makeRootRelative(filteredEnriched.positions);
    if (!filteredRelative.root || !filteredRelative.positions.pelvisCenter) return null;

    const rawEnriched = withDerivedJoints(
      observedWorld,
      confidences,
      this.settings.confidenceThresholds.usable,
    );
    const rawRelative = subtractRoot(rawEnriched.positions, filteredRelative.root);

    const normalizedPositions: Partial<Record<JointName, Vec3Data>> = {};
    for (const [name, landmark] of Object.entries(normalized2D) as Array<
      [JointName, PoseLandmark]
    >) {
      normalizedPositions[name] = { x: landmark.x, y: landmark.y, z: landmark.z };
    }
    const normalizedEnriched = withDerivedJoints(
      normalizedPositions,
      confidences,
      this.settings.confidenceThresholds.usable,
    );
    addDerivedNormalizedLandmarks(
      normalized2D,
      normalizedEnriched.positions,
      normalizedEnriched.confidences,
    );

    const reconstruction = this.reconstructor.reconstruct({
      filteredRootRelative: filteredRelative.positions,
      normalizedPositions: normalizedEnriched.positions,
      timestampMs: result.timestampMs,
    });
    const metrics = calculatePoseMetrics({
      joints: reconstruction.constrainedPositions,
      pelvisOrientation: reconstruction.pelvisOrientation,
      chestOrientation: reconstruction.chestOrientation,
      rootTranslation: reconstruction.rootTranslation,
      calibration: this.calibration,
    });

    const joints: Partial<Record<JointName, ProcessedJoint>> = {};
    for (const name of ALL_JOINT_NAMES) {
      const constrained = reconstruction.constrainedPositions[name];
      const filtered = filteredRelative.positions[name];
      if (!constrained || !filtered) continue;
      const raw = rawRelative[name] ?? filtered;
      const confidence = confidences[name] ?? filteredEnriched.confidences[name] ?? 0;
      joints[name] = {
        name,
        rawPosition: { ...raw },
        filteredPosition: { ...filtered },
        constrainedPosition: { ...constrained },
        confidence,
        isPredicted: predictionFlags[name] ?? derivedWasPredicted(name, predictionFlags),
        isValid: isFiniteVec3(constrained),
      };
    }

    return {
      timestampMs: result.timestampMs,
      normalized2D,
      raw3D: rawRelative,
      filtered3D: filteredRelative.positions,
      constrained3D: reconstruction.constrainedPositions,
      joints,
      confidences: { ...confidences, ...filteredEnriched.confidences },
      rootTranslation: reconstruction.rootTranslation,
      pelvisOrientation: reconstruction.pelvisOrientation,
      chestOrientation: reconstruction.chestOrientation,
      headOrientation: reconstruction.headOrientation,
      metrics,
      averageConfidence: actualAverageConfidence,
    };
  }

  updateSettings(settings: Partial<PoseProcessorSettings>): void {
    this.settings = mergeSettings(this.settings, settings);
    if (settings.filter) {
      this.filterBank = new LandmarkFilterBank(this.settings.filter);
    }
    if (settings.prediction || settings.confidenceThresholds) {
      this.predictor = this.createPredictor();
    }
    this.reconstructor.updateOptions({
      rootMotionMode: this.settings.rootMotionMode,
      grounding: {
        enabled: this.settings.groundingEnabled,
        enableFootLocking: this.settings.footLockingEnabled,
      },
    });
  }

  setCalibration(calibration: BodyCalibration | null): void {
    this.calibration = calibration;
    this.reconstructor.setCalibration(calibration);
    this.filterBank.reset();
    this.predictor.reset();
  }

  setRootMotionMode(mode: RootMotionMode): void {
    this.settings.rootMotionMode = mode;
    this.reconstructor.setRootMotionMode(mode);
  }

  setAxisInversion(inversion: Partial<AxisInversion>): void {
    this.settings.axisInversion = { ...this.settings.axisInversion, ...inversion };
    this.resetTemporalState();
  }

  getSettings(): PoseProcessorSettings {
    return {
      ...this.settings,
      confidenceThresholds: { ...this.settings.confidenceThresholds },
      filter: { ...this.settings.filter },
      prediction: { ...this.settings.prediction },
      axisInversion: { ...this.settings.axisInversion },
    };
  }

  reset(): void {
    this.lastReliableTimestampMs = null;
    this.resetTemporalState();
  }

  private createPredictor(): MissingJointPredictor {
    return new MissingJointPredictor({
      ...this.settings.prediction,
      confidenceThreshold: this.settings.confidenceThresholds.usable,
    });
  }

  private resetTemporalState(): void {
    this.filterBank.reset();
    this.predictor.reset();
    this.reconstructor.reset();
  }
}

export default PoseProcessor;

function mergeSettings(
  base: PoseProcessorSettings,
  update: Partial<PoseProcessorSettings>,
): PoseProcessorSettings {
  return {
    ...base,
    ...update,
    confidenceThresholds: {
      ...base.confidenceThresholds,
      ...update.confidenceThresholds,
    },
    filter: { ...base.filter, ...update.filter },
    prediction: { ...base.prediction, ...update.prediction },
    axisInversion: { ...base.axisInversion, ...update.axisInversion },
  };
}

function cloneLandmark(landmark: PoseLandmark): PoseLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility,
    presence: landmark.presence,
  };
}

function subtractRoot(
  positions: Partial<Record<JointName, Vec3Data>>,
  root: Vec3Data,
): Partial<Record<JointName, Vec3Data>> {
  const output: Partial<Record<JointName, Vec3Data>> = {};
  for (const [name, point] of Object.entries(positions) as Array<[JointName, Vec3Data]>) {
    if (isFiniteVec3(point)) output[name] = subtract(point, root);
  }
  return output;
}

function addDerivedNormalizedLandmarks(
  target: Partial<Record<JointName, PoseLandmark>>,
  positions: Partial<Record<JointName, Vec3Data>>,
  confidences: Partial<Record<JointName, number>>,
): void {
  for (const name of ALL_JOINT_NAMES) {
    if (LANDMARK_NAMES.includes(name as LandmarkName)) continue;
    const position = positions[name];
    if (!position) continue;
    const confidence = confidences[name] ?? 0;
    target[name] = { ...position, visibility: confidence, presence: confidence };
  }
}

function derivedWasPredicted(name: JointName, flags: Partial<Record<JointName, boolean>>): boolean {
  const sources: Partial<Record<JointName, readonly JointName[]>> = {
    pelvisCenter: ['leftHip', 'rightHip'],
    shoulderCenter: ['leftShoulder', 'rightShoulder'],
    spineMid: ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder'],
    chestCenter: ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder'],
    neckCenter: ['leftShoulder', 'rightShoulder'],
    headCenter: ['nose', 'leftEar', 'rightEar'],
    leftHandCenter: ['leftWrist', 'leftIndex', 'leftPinky', 'leftThumb'],
    rightHandCenter: ['rightWrist', 'rightIndex', 'rightPinky', 'rightThumb'],
  };
  return sources[name]?.some((source) => flags[source] === true) ?? false;
}
