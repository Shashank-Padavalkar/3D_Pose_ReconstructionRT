import {
  BODY_CALIBRATION_VERSION,
  CALIBRATION_LENGTH_KEYS,
  type BodyCalibration,
} from './BodyCalibration';
import { isFiniteVec3 } from '../utils/math';

export const CALIBRATION_STORAGE_KEY = 'local-pose-reconstruction.body-calibration.v1';

export function saveCalibration(
  calibration: BodyCalibration,
  storage: Storage | null = browserStorage(),
): boolean {
  if (!storage || !isBodyCalibration(calibration)) return false;
  try {
    storage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    return true;
  } catch {
    return false;
  }
}

export function loadCalibration(
  storage: Storage | null = browserStorage(),
): BodyCalibration | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(CALIBRATION_STORAGE_KEY);
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    return isBodyCalibration(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCalibration(storage: Storage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(CALIBRATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isBodyCalibration(value: unknown): value is BodyCalibration {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== BODY_CALIBRATION_VERSION ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.sampleCount !== 'number' ||
    !Number.isInteger(candidate.sampleCount) ||
    candidate.sampleCount < 0 ||
    typeof candidate.symmetryEnabled !== 'boolean' ||
    !(
      candidate.bodyHeightMeters === null ||
      (typeof candidate.bodyHeightMeters === 'number' && candidate.bodyHeightMeters > 0)
    )
  ) {
    return false;
  }
  for (const key of CALIBRATION_LENGTH_KEYS) {
    const length = candidate[key];
    if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) return false;
  }

  const reference = candidate.reference;
  if (typeof reference !== 'object' || reference === null) return false;
  const referenceRecord = reference as Record<string, unknown>;
  return isFiniteVec3(referenceRecord.scenePelvisCenter);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
