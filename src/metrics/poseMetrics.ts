import type { BodyCalibration } from '../calibration/BodyCalibration';
import type { JointName } from '../pose/landmarkNames';
import {
  EMPTY_METRICS,
  type PoseMetrics,
  type QuaternionData,
  type Vec3Data,
} from '../pose/poseTypes';
import { normalizeAngleDeg } from '../utils/math';
import { jointAngleDeg, lineTiltDeg, quaternionYawDeg } from './angles';

export interface PoseMetricsInput {
  joints: Partial<Record<JointName, Vec3Data>>;
  pelvisOrientation: QuaternionData | null;
  chestOrientation: QuaternionData | null;
  rootTranslation: Vec3Data;
  calibration: BodyCalibration | null;
}

export function calculatePoseMetrics(input: PoseMetricsInput): PoseMetrics {
  const jointAngle = (a: JointName, b: JointName, c: JointName): number | null => {
    const first = input.joints[a];
    const middle = input.joints[b];
    const last = input.joints[c];
    return first && middle && last ? jointAngleDeg(first, middle, last) : null;
  };

  const pelvisYaw = input.calibration?.reference.pelvisOrientation
    ? quaternionYawDeg(input.pelvisOrientation, input.calibration.reference.pelvisOrientation)
    : null;
  const chestYaw = input.calibration?.reference.chestOrientation
    ? quaternionYawDeg(input.chestOrientation, input.calibration.reference.chestOrientation)
    : null;
  const xFactor =
    pelvisYaw !== null && chestYaw !== null
      ? finiteOrNull(normalizeAngleDeg(chestYaw - pelvisYaw))
      : null;

  const leftShoulder = input.joints.leftShoulder;
  const rightShoulder = input.joints.rightShoulder;
  const leftHip = input.joints.leftHip;
  const rightHip = input.joints.rightHip;
  const head = input.joints.headCenter;
  const calibration = input.calibration;
  const validWidth = calibration && calibration.shoulderWidth > 1e-8;

  return sanitizeMetrics({
    pelvisYawDeg: pelvisYaw,
    chestYawDeg: chestYaw,
    xFactorDeg: xFactor,
    leftKneeFlexionDeg: jointAngle('leftHip', 'leftKnee', 'leftAnkle'),
    rightKneeFlexionDeg: jointAngle('rightHip', 'rightKnee', 'rightAnkle'),
    leftElbowFlexionDeg: jointAngle('leftShoulder', 'leftElbow', 'leftWrist'),
    rightElbowFlexionDeg: jointAngle('rightShoulder', 'rightElbow', 'rightWrist'),
    headSwayBodyWidths:
      validWidth && head && calibration.reference.sceneHeadCenter
        ? (head.x - calibration.reference.sceneHeadCenter.x) / calibration.shoulderWidth
        : null,
    pelvisSwayBodyWidths: validWidth ? input.rootTranslation.x / calibration.shoulderWidth : null,
    shoulderTiltDeg:
      leftShoulder && rightShoulder ? lineTiltDeg(leftShoulder, rightShoulder) : null,
    pelvisTiltDeg: leftHip && rightHip ? lineTiltDeg(leftHip, rightHip) : null,
  });
}

export function sanitizeMetrics(metrics: PoseMetrics): PoseMetrics {
  const output = { ...EMPTY_METRICS };
  for (const [name, value] of Object.entries(metrics) as Array<
    [keyof PoseMetrics, number | null]
  >) {
    output[name] = finiteOrNull(value);
  }
  return output;
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}
