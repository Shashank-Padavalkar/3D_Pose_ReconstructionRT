import type { QuaternionData, Vec3Data } from '../pose/poseTypes';
import {
  dot,
  normalize,
  normalizeAngleDeg,
  radiansToDegrees,
  safeAcos,
  subtract,
} from '../utils/math';
import { normalizeQuaternion } from '../filters/QuaternionSmoother';

/** Interior angle ABC in degrees. Degenerate or non-finite input returns null. */
export function jointAngleDeg(a: Vec3Data, b: Vec3Data, c: Vec3Data): number | null {
  const first = normalize(subtract(a, b));
  const second = normalize(subtract(c, b));
  if (!first || !second) return null;
  const angle = radiansToDegrees(safeAcos(dot(first, second)));
  return Number.isFinite(angle) ? angle : null;
}

/** Camera-plane line tilt relative to horizontal, normalized to [-90, 90] degrees. */
export function lineTiltDeg(left: Vec3Data, right: Vec3Data): number | null {
  const deltaX = right.x - left.x;
  const deltaY = right.y - left.y;
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || Math.hypot(deltaX, deltaY) < 1e-8) {
    return null;
  }
  let angle = normalizeAngleDeg(radiansToDegrees(Math.atan2(deltaY, deltaX)));
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return Number.isFinite(angle) ? angle : null;
}

export function conjugateQuaternion(value: QuaternionData): QuaternionData {
  return { x: -value.x, y: -value.y, z: -value.z, w: value.w };
}

export function multiplyQuaternions(a: QuaternionData, b: QuaternionData): QuaternionData {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Y-axis rotation of current relative to an optional calibration quaternion. */
export function quaternionYawDeg(
  current: QuaternionData | null | undefined,
  reference?: QuaternionData | null,
): number | null {
  if (!current) return null;
  const normalizedCurrent = normalizeQuaternion(current);
  if (!normalizedCurrent) return null;
  let relative = normalizedCurrent;
  if (reference) {
    const normalizedReference = normalizeQuaternion(reference);
    if (!normalizedReference) return null;
    relative = multiplyQuaternions(conjugateQuaternion(normalizedReference), normalizedCurrent);
  }
  const yaw = Math.atan2(
    2 * (relative.w * relative.y + relative.x * relative.z),
    1 - 2 * (relative.y * relative.y + relative.z * relative.z),
  );
  const degrees = normalizeAngleDeg(radiansToDegrees(yaw));
  return Number.isFinite(degrees) ? degrees : null;
}
