import { describe, expect, it } from 'vitest';
import { createDefaultCalibration } from '../calibration/BodyCalibration';
import { EMPTY_METRICS } from '../pose/poseTypes';
import { calculatePoseMetrics, sanitizeMetrics } from './poseMetrics';

describe('pose metrics', () => {
  it('returns useful joint/tilt/yaw/sway values for valid input', () => {
    const calibration = createDefaultCalibration();
    calibration.shoulderWidth = 0.4;
    calibration.reference.pelvisOrientation = { x: 0, y: 0, z: 0, w: 1 };
    calibration.reference.chestOrientation = { x: 0, y: 0, z: 0, w: 1 };
    calibration.reference.sceneHeadCenter = { x: 0, y: 1.7, z: 0 };
    const yaw45 = { x: 0, y: Math.sin(Math.PI / 8), z: 0, w: Math.cos(Math.PI / 8) };
    const metrics = calculatePoseMetrics({
      joints: {
        leftShoulder: { x: -0.2, y: 1, z: 0 },
        rightShoulder: { x: 0.2, y: 1.1, z: 0 },
        leftElbow: { x: -0.4, y: 0.8, z: 0 },
        leftWrist: { x: -0.6, y: 0.6, z: 0 },
        leftHip: { x: -0.15, y: 0, z: 0 },
        rightHip: { x: 0.15, y: 0, z: 0 },
        leftKnee: { x: -0.15, y: -0.5, z: 0 },
        leftAnkle: { x: -0.15, y: -1, z: 0 },
        headCenter: { x: 0.08, y: 1.7, z: 0 },
      },
      pelvisOrientation: yaw45,
      chestOrientation: { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) },
      rootTranslation: { x: 0.04, y: 0, z: 0 },
      calibration,
    });
    expect(metrics.pelvisYawDeg).toBeCloseTo(45, 8);
    expect(metrics.chestYawDeg).toBeCloseTo(90, 8);
    expect(metrics.xFactorDeg).toBeCloseTo(45, 8);
    expect(metrics.leftKneeFlexionDeg).toBeCloseTo(180, 8);
    expect(metrics.headSwayBodyWidths).toBeCloseTo(0.2, 8);
    expect(metrics.pelvisSwayBodyWidths).toBeCloseTo(0.1, 8);
    expect(metrics.shoulderTiltDeg).not.toBeNull();
  });

  it('returns null, never NaN, for invalid or unavailable metrics', () => {
    expect(
      calculatePoseMetrics({
        joints: {},
        pelvisOrientation: null,
        chestOrientation: null,
        rootTranslation: { x: 0, y: 0, z: 0 },
        calibration: null,
      }),
    ).toEqual(EMPTY_METRICS);
    expect(sanitizeMetrics({ ...EMPTY_METRICS, chestYawDeg: Number.NaN }).chestYawDeg).toBeNull();
  });
});
