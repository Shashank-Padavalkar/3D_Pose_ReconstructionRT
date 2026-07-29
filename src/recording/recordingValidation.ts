import { LANDMARK_NAMES } from '../pose/landmarkNames';
import { isBodyCalibration } from '../calibration/calibrationStorage';
import type { PoseLandmark, PoseMetrics, ProcessedPoseFrame, Vec3Data } from '../pose/poseTypes';
import { isFiniteVec3 } from '../utils/math';
import { RECORDING_VERSION, type PoseRecording, type RecordedPoseFrame } from './recordingSchema';

export interface RecordingValidationResult {
  valid: boolean;
  recording?: PoseRecording;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isMetrics(value: unknown): value is PoseMetrics {
  if (!isRecord(value)) return false;
  const keys: readonly (keyof PoseMetrics)[] = [
    'pelvisYawDeg',
    'chestYawDeg',
    'xFactorDeg',
    'leftKneeFlexionDeg',
    'rightKneeFlexionDeg',
    'leftElbowFlexionDeg',
    'rightElbowFlexionDeg',
    'headSwayBodyWidths',
    'pelvisSwayBodyWidths',
    'shoulderTiltDeg',
    'pelvisTiltDeg',
  ];
  return keys.every((key) => isFiniteOrNull(value[key]));
}

function isLandmark(value: unknown): value is PoseLandmark {
  return (
    isFiniteVec3(value) &&
    isRecord(value) &&
    typeof value.visibility === 'number' &&
    Number.isFinite(value.visibility) &&
    typeof value.presence === 'number' &&
    Number.isFinite(value.presence)
  );
}

function isValueRecord<T>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is T,
): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(predicate);
}

function isQuaternionOrNull(value: unknown): boolean {
  if (value === null) return true;
  return (
    isRecord(value) &&
    ['x', 'y', 'z', 'w'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  );
}

function isRecordedFrame(value: unknown): value is RecordedPoseFrame {
  if (!isRecord(value)) return false;
  return (
    typeof value.timestampMs === 'number' &&
    Number.isFinite(value.timestampMs) &&
    value.timestampMs >= 0 &&
    isValueRecord(value.normalized2D, isLandmark) &&
    isValueRecord(value.raw3D, isFiniteVec3) &&
    isValueRecord(value.filtered3D, isFiniteVec3) &&
    isValueRecord(value.constrained3D, isFiniteVec3) &&
    isValueRecord(
      value.confidences,
      (candidate): candidate is number =>
        typeof candidate === 'number' && Number.isFinite(candidate),
    ) &&
    isFiniteVec3(value.rootTranslation) &&
    isQuaternionOrNull(value.pelvisOrientation) &&
    isQuaternionOrNull(value.chestOrientation) &&
    isQuaternionOrNull(value.headOrientation) &&
    isMetrics(value.metrics) &&
    typeof value.averageConfidence === 'number' &&
    Number.isFinite(value.averageConfidence)
  );
}

export function validateRecording(value: unknown): RecordingValidationResult {
  if (!isRecord(value)) return { valid: false, error: 'Recording must be a JSON object.' };
  if (value.version !== RECORDING_VERSION) {
    return {
      valid: false,
      error: `Unsupported recording version. Expected ${RECORDING_VERSION}.`,
    };
  }
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    return { valid: false, error: 'Recording createdAt must be a valid ISO date.' };
  }
  if (!isRecord(value.metadata)) return { valid: false, error: 'Recording metadata is missing.' };
  if (!['webcam', 'import'].includes(String(value.metadata.source))) {
    return { valid: false, error: 'Recording metadata source is invalid.' };
  }
  if (typeof value.metadata.model !== 'string' || value.metadata.model.length === 0) {
    return { valid: false, error: 'Recording metadata model is missing.' };
  }
  if (value.calibration !== null && !isBodyCalibration(value.calibration)) {
    return { valid: false, error: 'Recording calibration profile is malformed.' };
  }
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    return { valid: false, error: 'Recording must contain at least one pose frame.' };
  }
  if (!value.frames.every(isRecordedFrame)) {
    return {
      valid: false,
      error: 'One or more pose frames are malformed or contain non-finite data.',
    };
  }
  for (let index = 1; index < value.frames.length; index += 1) {
    const previous = value.frames[index - 1];
    const current = value.frames[index];
    if (!previous || !current || current.timestampMs < previous.timestampMs) {
      return { valid: false, error: 'Pose frame timestamps must be monotonic.' };
    }
  }

  // Landmark names outside the known set are tolerated for forward-compatible derived joints,
  // but at least one MediaPipe landmark must be present in every frame.
  if (
    value.frames.some(
      (frame) => !LANDMARK_NAMES.some((name) => Object.hasOwn(frame.normalized2D, name)),
    )
  ) {
    return { valid: false, error: 'Each frame must contain normalized MediaPipe landmarks.' };
  }

  return { valid: true, recording: value as unknown as PoseRecording };
}

export function parseRecordingJson(text: string): RecordingValidationResult {
  try {
    return validateRecording(JSON.parse(text) as unknown);
  } catch (error) {
    return {
      valid: false,
      error: `Recording JSON could not be parsed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

export type { ProcessedPoseFrame, Vec3Data };
