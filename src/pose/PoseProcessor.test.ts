import { describe, expect, it } from 'vitest';
import { LANDMARK_INDEX, type LandmarkName } from './landmarkNames';
import { PoseProcessor } from './PoseProcessor';
import type { PoseInferenceResult, PoseLandmark, Vec3Data } from './poseTypes';

describe('PoseProcessor', () => {
  it('connects transform, filtering, constraints, grounding, frames and metrics', () => {
    const processor = new PoseProcessor();
    const inference = syntheticInference(0);
    const frame = processor.process(inference);

    expect(frame).not.toBeNull();
    expect(frame!.averageConfidence).toBe(1);
    expect(frame!.filtered3D.pelvisCenter).toEqual({ x: 0, y: 0, z: 0 });
    expect(frame!.pelvisOrientation).not.toBeNull();
    expect(frame!.chestOrientation).not.toBeNull();
    expect(frame!.metrics.leftKneeFlexionDeg).not.toBeNull();
    expect(frame!.normalized2D.pelvisCenter).toBeDefined();
    expect(frame!.joints.leftWrist?.isPredicted).toBe(false);

    const feet = [
      frame!.constrained3D.leftHeel?.y,
      frame!.constrained3D.leftFootIndex?.y,
      frame!.constrained3D.rightHeel?.y,
      frame!.constrained3D.rightFootIndex?.y,
    ].filter((value): value is number => value !== undefined);
    expect(Math.min(...feet)).toBeCloseTo(0, 8);
    expect(() => JSON.stringify(frame)).not.toThrow();
  });

  it('predicts a low-confidence wrist without jumping it to the origin', () => {
    const processor = new PoseProcessor();
    processor.process(syntheticInference(0));
    const missing = syntheticInference(80);
    setConfidence(missing, 'leftWrist', 0.1);
    const frame = processor.process(missing);

    expect(frame).not.toBeNull();
    expect(frame!.joints.leftWrist?.isPredicted).toBe(true);
    const wrist = frame!.constrained3D.leftWrist;
    expect(wrist).toBeDefined();
    expect(Math.hypot(wrist!.x, wrist!.y, wrist!.z)).toBeGreaterThan(0.1);
  });

  it('exposes runtime setting, calibration, root-mode, axis and reset controls', () => {
    const processor = new PoseProcessor();
    processor.updateSettings({ filter: { beta: 0.2 }, groundingEnabled: false });
    processor.setRootMotionMode('approximate');
    processor.setAxisInversion({ x: true });
    expect(processor.getSettings()).toMatchObject({
      filter: { beta: 0.2 },
      groundingEnabled: false,
      rootMotionMode: 'approximate',
      axisInversion: { x: true },
    });
    expect(() => processor.setCalibration(null)).not.toThrow();
    expect(() => processor.reset()).not.toThrow();
  });
});

function syntheticInference(timestampMs: number): PoseInferenceResult {
  const worldLandmarks = Array.from({ length: 33 }, () => landmark(0, -1, 0));
  const normalizedLandmarks = Array.from({ length: 33 }, () => landmark(0.5, 0.5, 0));
  const scene: Partial<Record<LandmarkName, Vec3Data>> = {
    nose: { x: 0, y: 1.85, z: 0.12 },
    leftEar: { x: -0.09, y: 1.78, z: 0 },
    rightEar: { x: 0.09, y: 1.78, z: 0 },
    leftShoulder: { x: -0.2, y: 1.5, z: 0 },
    rightShoulder: { x: 0.2, y: 1.5, z: 0 },
    leftElbow: { x: -0.43, y: 1.28, z: 0.02 },
    rightElbow: { x: 0.43, y: 1.28, z: 0.02 },
    leftWrist: { x: -0.64, y: 1.08, z: 0.04 },
    rightWrist: { x: 0.64, y: 1.08, z: 0.04 },
    leftPinky: { x: -0.68, y: 1.04, z: 0.04 },
    rightPinky: { x: 0.68, y: 1.04, z: 0.04 },
    leftIndex: { x: -0.7, y: 1.08, z: 0.04 },
    rightIndex: { x: 0.7, y: 1.08, z: 0.04 },
    leftThumb: { x: -0.66, y: 1.12, z: 0.04 },
    rightThumb: { x: 0.66, y: 1.12, z: 0.04 },
    leftHip: { x: -0.15, y: 1, z: 0 },
    rightHip: { x: 0.15, y: 1, z: 0 },
    leftKnee: { x: -0.15, y: 0.55, z: 0.02 },
    rightKnee: { x: 0.15, y: 0.55, z: 0.02 },
    leftAnkle: { x: -0.15, y: 0.1, z: 0 },
    rightAnkle: { x: 0.15, y: 0.1, z: 0 },
    leftHeel: { x: -0.15, y: 0.05, z: -0.05 },
    rightHeel: { x: 0.15, y: 0.05, z: -0.05 },
    leftFootIndex: { x: -0.15, y: 0.05, z: 0.2 },
    rightFootIndex: { x: 0.15, y: 0.05, z: 0.2 },
  };
  for (const [name, point] of Object.entries(scene) as Array<[LandmarkName, Vec3Data]>) {
    const index = LANDMARK_INDEX[name];
    worldLandmarks[index] = landmark(point.x, -point.y, -point.z);
    normalizedLandmarks[index] = landmark(0.5 + point.x * 0.35, 1 - point.y * 0.5, point.z);
  }
  return {
    timestampMs,
    normalizedLandmarks,
    worldLandmarks,
    inferenceTimeMs: 8,
  };
}

function landmark(x: number, y: number, z: number): PoseLandmark {
  return { x, y, z, visibility: 1, presence: 1 };
}

function setConfidence(result: PoseInferenceResult, name: LandmarkName, confidence: number): void {
  const index = LANDMARK_INDEX[name];
  const normalized = result.normalizedLandmarks[index];
  const world = result.worldLandmarks[index];
  if (normalized) {
    normalized.visibility = confidence;
    normalized.presence = confidence;
  }
  if (world) {
    world.visibility = confidence;
    world.presence = confidence;
  }
}
