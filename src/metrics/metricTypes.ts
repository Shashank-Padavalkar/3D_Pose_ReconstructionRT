import type { PoseMetrics } from '../pose/poseTypes';

export type PoseMetricName = keyof PoseMetrics;

export interface PoseMetricDefinition {
  label: string;
  unit: 'deg' | 'body widths';
  description: string;
  approximate: true;
}

export const POSE_METRIC_DEFINITIONS: Readonly<Record<PoseMetricName, PoseMetricDefinition>> =
  Object.freeze({
    pelvisYawDeg: {
      label: 'Pelvis rotation',
      unit: 'deg',
      description: 'Pelvis yaw relative to calibration.',
      approximate: true,
    },
    chestYawDeg: {
      label: 'Chest rotation',
      unit: 'deg',
      description: 'Chest yaw relative to calibration.',
      approximate: true,
    },
    xFactorDeg: {
      label: 'X-factor',
      unit: 'deg',
      description: 'Approximate chest yaw minus pelvis yaw.',
      approximate: true,
    },
    leftKneeFlexionDeg: {
      label: 'Left knee angle',
      unit: 'deg',
      description: 'Interior angle from hip through knee to ankle.',
      approximate: true,
    },
    rightKneeFlexionDeg: {
      label: 'Right knee angle',
      unit: 'deg',
      description: 'Interior angle from hip through knee to ankle.',
      approximate: true,
    },
    leftElbowFlexionDeg: {
      label: 'Left elbow angle',
      unit: 'deg',
      description: 'Interior angle from shoulder through elbow to wrist.',
      approximate: true,
    },
    rightElbowFlexionDeg: {
      label: 'Right elbow angle',
      unit: 'deg',
      description: 'Interior angle from shoulder through elbow to wrist.',
      approximate: true,
    },
    headSwayBodyWidths: {
      label: 'Head sway',
      unit: 'body widths',
      description: 'Horizontal head displacement divided by calibrated shoulder width.',
      approximate: true,
    },
    pelvisSwayBodyWidths: {
      label: 'Pelvis sway',
      unit: 'body widths',
      description: 'Approximate root displacement divided by calibrated shoulder width.',
      approximate: true,
    },
    shoulderTiltDeg: {
      label: 'Shoulder tilt',
      unit: 'deg',
      description: 'Shoulder line angle relative to camera-plane horizontal.',
      approximate: true,
    },
    pelvisTiltDeg: {
      label: 'Pelvis tilt',
      unit: 'deg',
      description: 'Hip line angle relative to camera-plane horizontal.',
      approximate: true,
    },
  });
