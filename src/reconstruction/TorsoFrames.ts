import type { JointName } from '../pose/landmarkNames';
import type { QuaternionData, Vec3Data } from '../pose/poseTypes';
import { cross, midpoint, normalize, subtract } from '../utils/math';
import {
  QuaternionSmoother,
  ensureQuaternionContinuity,
  normalizeQuaternion,
} from '../filters/QuaternionSmoother';

export interface OrthonormalFrame {
  xAxis: Vec3Data;
  yAxis: Vec3Data;
  zAxis: Vec3Data;
  quaternion: QuaternionData;
}

type JointMap = Partial<Record<JointName, Vec3Data>>;

export function calculatePelvisFrame(
  joints: JointMap,
  previous: OrthonormalFrame | null = null,
): OrthonormalFrame | null {
  const leftHip = joints.leftHip;
  const rightHip = joints.rightHip;
  const pelvisCenter = joints.pelvisCenter ?? midpointIfPresent(leftHip, rightHip);
  const shoulderCenter =
    joints.shoulderCenter ?? midpointIfPresent(joints.leftShoulder, joints.rightShoulder);
  if (!leftHip || !rightHip || !pelvisCenter || !shoulderCenter) return cloneFrame(previous);
  return createOrthonormalFrame(
    subtract(rightHip, leftHip),
    subtract(shoulderCenter, pelvisCenter),
    previous,
  );
}

export function calculateChestFrame(
  joints: JointMap,
  previous: OrthonormalFrame | null = null,
): OrthonormalFrame | null {
  const leftShoulder = joints.leftShoulder;
  const rightShoulder = joints.rightShoulder;
  const shoulderCenter = joints.shoulderCenter ?? midpointIfPresent(leftShoulder, rightShoulder);
  const pelvisCenter = joints.pelvisCenter ?? midpointIfPresent(joints.leftHip, joints.rightHip);
  if (!leftShoulder || !rightShoulder || !shoulderCenter || !pelvisCenter) {
    return cloneFrame(previous);
  }
  return createOrthonormalFrame(
    subtract(rightShoulder, leftShoulder),
    subtract(shoulderCenter, pelvisCenter),
    previous,
  );
}

export function calculateHeadFrame(
  joints: JointMap,
  previous: OrthonormalFrame | null = null,
): OrthonormalFrame | null {
  const leftEar = joints.leftEar;
  const rightEar = joints.rightEar;
  const nose = joints.nose;
  if (!leftEar || !rightEar || !nose) return cloneFrame(previous);
  const xAxis = normalize(subtract(rightEar, leftEar));
  const earCenter = midpoint(leftEar, rightEar);
  const forward = normalize(subtract(nose, earCenter));
  if (!xAxis || !forward) return cloneFrame(previous);
  const yAxis = normalize(cross(forward, xAxis));
  if (!yAxis) return cloneFrame(previous);
  return createOrthonormalFrame(xAxis, yAxis, previous);
}

export function createOrthonormalFrame(
  xApproximation: Vec3Data,
  upApproximation: Vec3Data,
  previous: OrthonormalFrame | null = null,
): OrthonormalFrame | null {
  const xAxis = normalize(xApproximation);
  const up = normalize(upApproximation);
  if (!xAxis || !up) return cloneFrame(previous);
  let zAxis = normalize(cross(xAxis, up));
  if (!zAxis) return cloneFrame(previous);
  const yAxis = normalize(cross(zAxis, xAxis));
  if (!yAxis) return cloneFrame(previous);
  zAxis = normalize(cross(xAxis, yAxis));
  if (!zAxis) return cloneFrame(previous);

  let quaternion = quaternionFromBasis(xAxis, yAxis, zAxis);
  if (!quaternion) return cloneFrame(previous);
  if (previous) quaternion = ensureQuaternionContinuity(previous.quaternion, quaternion);
  return { xAxis, yAxis, zAxis, quaternion };
}

export function quaternionFromBasis(
  xAxis: Vec3Data,
  yAxis: Vec3Data,
  zAxis: Vec3Data,
): QuaternionData | null {
  // Rotation matrix columns are the frame basis vectors.
  const m11 = xAxis.x;
  const m12 = yAxis.x;
  const m13 = zAxis.x;
  const m21 = xAxis.y;
  const m22 = yAxis.y;
  const m23 = zAxis.y;
  const m31 = xAxis.z;
  const m32 = yAxis.z;
  const m33 = zAxis.z;
  const trace = m11 + m22 + m33;
  let quaternion: QuaternionData;

  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    quaternion = {
      w: 0.25 * s,
      x: (m32 - m23) / s,
      y: (m13 - m31) / s,
      z: (m21 - m12) / s,
    };
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    quaternion = {
      w: (m32 - m23) / s,
      x: 0.25 * s,
      y: (m12 + m21) / s,
      z: (m13 + m31) / s,
    };
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    quaternion = {
      w: (m13 - m31) / s,
      x: (m12 + m21) / s,
      y: 0.25 * s,
      z: (m23 + m32) / s,
    };
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    quaternion = {
      w: (m21 - m12) / s,
      x: (m13 + m31) / s,
      y: (m23 + m32) / s,
      z: 0.25 * s,
    };
  }
  return normalizeQuaternion(quaternion);
}

/** Stateful frame tracker that reuses degenerate frames and slerps valid rotations. */
export class TorsoFrameTracker {
  private pelvis: OrthonormalFrame | null = null;
  private chest: OrthonormalFrame | null = null;
  private head: OrthonormalFrame | null = null;
  private readonly pelvisSmoother = new QuaternionSmoother();
  private readonly chestSmoother = new QuaternionSmoother();
  private readonly headSmoother = new QuaternionSmoother();

  update(joints: JointMap): {
    pelvis: OrthonormalFrame | null;
    chest: OrthonormalFrame | null;
    head: OrthonormalFrame | null;
  } {
    this.pelvis = smoothFrame(calculatePelvisFrame(joints, this.pelvis), this.pelvisSmoother);
    this.chest = smoothFrame(calculateChestFrame(joints, this.chest), this.chestSmoother);
    this.head = smoothFrame(calculateHeadFrame(joints, this.head), this.headSmoother);
    return {
      pelvis: cloneFrame(this.pelvis),
      chest: cloneFrame(this.chest),
      head: cloneFrame(this.head),
    };
  }

  reset(): void {
    this.pelvis = null;
    this.chest = null;
    this.head = null;
    this.pelvisSmoother.reset();
    this.chestSmoother.reset();
    this.headSmoother.reset();
  }
}

function smoothFrame(
  frame: OrthonormalFrame | null,
  smoother: QuaternionSmoother,
): OrthonormalFrame | null {
  return frame ? { ...frame, quaternion: smoother.filter(frame.quaternion) } : null;
}

function midpointIfPresent(a?: Vec3Data, b?: Vec3Data): Vec3Data | null {
  return a && b ? midpoint(a, b) : null;
}

function cloneFrame(frame: OrthonormalFrame | null): OrthonormalFrame | null {
  return frame
    ? {
        xAxis: { ...frame.xAxis },
        yAxis: { ...frame.yAxis },
        zAxis: { ...frame.zAxis },
        quaternion: { ...frame.quaternion },
      }
    : null;
}
