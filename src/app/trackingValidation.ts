import type { JointName } from '../pose/landmarkNames';
import type { ProcessedPoseFrame } from '../pose/poseTypes';

export interface TrackingValidation {
  valid: boolean;
  message: string | null;
}

const BODY_JOINTS: readonly JointName[] = [
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftWrist',
  'rightWrist',
];

export function validateBodyVisibility(
  frame: ProcessedPoseFrame | null,
  threshold: number,
): TrackingValidation {
  if (!frame) return { valid: false, message: 'Tracking lost. Return to the camera view.' };
  if (frame.averageConfidence < threshold) {
    return {
      valid: false,
      message: 'Lighting is too poor or tracking confidence is low.',
    };
  }

  const usable = (name: JointName): boolean =>
    Boolean(frame.normalized2D[name]) && (frame.confidences[name] ?? 0) >= threshold;
  if (!usable('leftAnkle') || !usable('rightAnkle')) {
    return { valid: false, message: 'Both feet must be visible.' };
  }
  if (!BODY_JOINTS.every(usable)) {
    return { valid: false, message: 'Keep your full body inside the frame.' };
  }
  if (!usable('nose') && !(usable('leftEar') && usable('rightEar'))) {
    return { valid: false, message: 'Keep your head visible and face the camera.' };
  }

  const points = BODY_JOINTS.map((name) => frame.normalized2D[name]).filter(
    (value) => value !== undefined,
  );
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  if (
    Math.min(...xs) < 0.025 ||
    Math.max(...xs) > 0.975 ||
    Math.min(...ys) < 0.015 ||
    Math.max(...ys) > 0.985
  ) {
    return { valid: false, message: 'Move farther from the camera.' };
  }
  return { valid: true, message: null };
}
