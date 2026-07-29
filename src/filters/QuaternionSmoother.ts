import type { QuaternionData } from '../pose/poseTypes';
import { clamp } from '../utils/clamp';

export function quaternionDot(a: QuaternionData, b: QuaternionData): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function normalizeQuaternion(value: QuaternionData): QuaternionData | null {
  const magnitude = Math.hypot(value.x, value.y, value.z, value.w);
  if (!(magnitude > 1e-8) || !Number.isFinite(magnitude)) return null;
  return {
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
    w: value.w / magnitude,
  };
}

export function ensureQuaternionContinuity(
  previous: QuaternionData,
  current: QuaternionData,
): QuaternionData {
  return quaternionDot(previous, current) < 0
    ? { x: -current.x, y: -current.y, z: -current.z, w: -current.w }
    : { ...current };
}

export function slerpQuaternion(
  from: QuaternionData,
  to: QuaternionData,
  amount: number,
): QuaternionData {
  const normalizedFrom = normalizeQuaternion(from);
  const normalizedTo = normalizeQuaternion(to);
  if (!normalizedFrom) return normalizedTo ?? { x: 0, y: 0, z: 0, w: 1 };
  if (!normalizedTo) return normalizedFrom;

  const continuousTo = ensureQuaternionContinuity(normalizedFrom, normalizedTo);
  const cosine = clamp(quaternionDot(normalizedFrom, continuousTo), -1, 1);
  const t = clamp(amount, 0, 1);
  if (cosine > 0.9995) {
    return normalizeQuaternion({
      x: normalizedFrom.x + t * (continuousTo.x - normalizedFrom.x),
      y: normalizedFrom.y + t * (continuousTo.y - normalizedFrom.y),
      z: normalizedFrom.z + t * (continuousTo.z - normalizedFrom.z),
      w: normalizedFrom.w + t * (continuousTo.w - normalizedFrom.w),
    })!;
  }

  const angle = Math.acos(cosine);
  const sine = Math.sin(angle);
  const fromWeight = Math.sin((1 - t) * angle) / sine;
  const toWeight = Math.sin(t * angle) / sine;
  return {
    x: normalizedFrom.x * fromWeight + continuousTo.x * toWeight,
    y: normalizedFrom.y * fromWeight + continuousTo.y * toWeight,
    z: normalizedFrom.z * fromWeight + continuousTo.z * toWeight,
    w: normalizedFrom.w * fromWeight + continuousTo.w * toWeight,
  };
}

export class QuaternionSmoother {
  private previous: QuaternionData | null = null;

  constructor(private readonly smoothingAmount = 0.28) {}

  filter(value: QuaternionData): QuaternionData {
    const normalized = normalizeQuaternion(value);
    if (!normalized) return this.previous ?? { x: 0, y: 0, z: 0, w: 1 };
    if (!this.previous) {
      this.previous = normalized;
      return { ...normalized };
    }
    this.previous = slerpQuaternion(this.previous, normalized, this.smoothingAmount);
    return { ...this.previous };
  }

  reset(value?: QuaternionData): void {
    this.previous = value ? normalizeQuaternion(value) : null;
  }
}
