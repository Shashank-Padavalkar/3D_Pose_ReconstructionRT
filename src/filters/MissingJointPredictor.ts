import type { JointName } from '../pose/landmarkNames';
import type { Vec3Data } from '../pose/poseTypes';
import { add, clampMagnitude, interpolate, scale, subtract } from '../utils/math';

export interface MissingJointPredictorOptions {
  confidenceThreshold: number;
  predictionHorizonMs: number;
  maximumVelocity: number;
  fallbackBlendDelayMs: number;
  fallbackBlendDurationMs: number;
}

export interface PredictedJoint {
  position: Vec3Data | null;
  isPredicted: boolean;
  isValid: boolean;
  missingDurationMs: number;
}

interface JointHistory {
  position: Vec3Data;
  velocity: Vec3Data;
  observedAtMs: number;
}

export const DEFAULT_MISSING_JOINT_OPTIONS: Readonly<MissingJointPredictorOptions> = Object.freeze({
  confidenceThreshold: 0.4,
  predictionHorizonMs: 125,
  maximumVelocity: 3,
  fallbackBlendDelayMs: 250,
  fallbackBlendDurationMs: 500,
});

/** Short prediction followed by a stable hold and optional constrained fallback blend. */
export class MissingJointPredictor {
  private readonly histories = new Map<JointName, JointHistory>();
  private readonly options: MissingJointPredictorOptions;

  constructor(options: Partial<MissingJointPredictorOptions> = {}) {
    this.options = { ...DEFAULT_MISSING_JOINT_OPTIONS, ...options };
  }

  update(
    joint: JointName,
    observation: Vec3Data | null,
    confidence: number,
    timestampMs: number,
    constrainedFallback?: Vec3Data,
  ): PredictedJoint {
    const history = this.histories.get(joint);
    if (observation && confidence >= this.options.confidenceThreshold) {
      let velocity = { x: 0, y: 0, z: 0 };
      if (history) {
        const deltaSeconds = (timestampMs - history.observedAtMs) / 1000;
        if (deltaSeconds > 0 && deltaSeconds <= 0.5) {
          velocity = clampMagnitude(
            scale(subtract(observation, history.position), 1 / deltaSeconds),
            this.options.maximumVelocity,
          );
        }
      }
      this.histories.set(joint, {
        position: { ...observation },
        velocity,
        observedAtMs: timestampMs,
      });
      return {
        position: { ...observation },
        isPredicted: false,
        isValid: true,
        missingDurationMs: 0,
      };
    }

    if (!history) {
      return {
        position: constrainedFallback ? { ...constrainedFallback } : null,
        isPredicted: constrainedFallback !== undefined,
        isValid: constrainedFallback !== undefined,
        missingDurationMs: 0,
      };
    }

    const missingDurationMs = Math.max(0, timestampMs - history.observedAtMs);
    const cappedPredictionMs = Math.min(missingDurationMs, this.options.predictionHorizonMs);
    let position = add(history.position, scale(history.velocity, cappedPredictionMs / 1000));
    if (constrainedFallback && missingDurationMs > this.options.fallbackBlendDelayMs) {
      const blend = Math.min(
        1,
        (missingDurationMs - this.options.fallbackBlendDelayMs) /
          Math.max(1, this.options.fallbackBlendDurationMs),
      );
      position = interpolate(position, constrainedFallback, blend);
    }

    return { position, isPredicted: true, isValid: true, missingDurationMs };
  }

  reset(): void {
    this.histories.clear();
  }
}
