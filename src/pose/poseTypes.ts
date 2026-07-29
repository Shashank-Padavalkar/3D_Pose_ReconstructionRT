import type { JointName } from './landmarkNames';

export interface Vec2Data {
  x: number;
  y: number;
}

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionData {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PoseLandmark extends Vec3Data {
  visibility: number;
  presence: number;
}

export interface PoseInferenceResult {
  timestampMs: number;
  normalizedLandmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  inferenceTimeMs: number;
}

export interface PoseMetrics {
  pelvisYawDeg: number | null;
  chestYawDeg: number | null;
  xFactorDeg: number | null;
  leftKneeFlexionDeg: number | null;
  rightKneeFlexionDeg: number | null;
  leftElbowFlexionDeg: number | null;
  rightElbowFlexionDeg: number | null;
  headSwayBodyWidths: number | null;
  pelvisSwayBodyWidths: number | null;
  shoulderTiltDeg: number | null;
  pelvisTiltDeg: number | null;
}

export interface ProcessedJoint {
  name: JointName;
  rawPosition: Vec3Data;
  filteredPosition: Vec3Data;
  constrainedPosition: Vec3Data;
  confidence: number;
  isPredicted: boolean;
  isValid: boolean;
}

export interface ProcessedPoseFrame {
  timestampMs: number;
  normalized2D: Partial<Record<JointName, PoseLandmark>>;
  raw3D: Partial<Record<JointName, Vec3Data>>;
  filtered3D: Partial<Record<JointName, Vec3Data>>;
  constrained3D: Partial<Record<JointName, Vec3Data>>;
  joints: Partial<Record<JointName, ProcessedJoint>>;
  confidences: Partial<Record<JointName, number>>;
  rootTranslation: Vec3Data;
  pelvisOrientation: QuaternionData | null;
  chestOrientation: QuaternionData | null;
  headOrientation: QuaternionData | null;
  metrics: PoseMetrics;
  averageConfidence: number;
}

export const EMPTY_METRICS: PoseMetrics = {
  pelvisYawDeg: null,
  chestYawDeg: null,
  xFactorDeg: null,
  leftKneeFlexionDeg: null,
  rightKneeFlexionDeg: null,
  leftElbowFlexionDeg: null,
  rightElbowFlexionDeg: null,
  headSwayBodyWidths: null,
  pelvisSwayBodyWidths: null,
  shoulderTiltDeg: null,
  pelvisTiltDeg: null,
};
