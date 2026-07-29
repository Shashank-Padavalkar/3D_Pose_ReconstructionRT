import type { JointName } from '../pose/landmarkNames';
import type { QuaternionData, Vec3Data } from '../pose/poseTypes';

export type PosePositionMap = Partial<Record<JointName, Vec3Data>>;
export type PoseConfidenceMap = Partial<Record<JointName, number>>;
export type PosePredictionMap = Partial<Record<JointName, boolean>>;

export type PoseDisplaySource = 'raw' | 'filtered' | 'constrained';
export type PoseDisplayMode = 'skeleton' | 'mannequin' | 'overlay';

export interface RenderPoseData {
  timestampMs: number;
  raw: PosePositionMap;
  filtered: PosePositionMap;
  constrained: PosePositionMap;
  confidences: PoseConfidenceMap;
  predicted: PosePredictionMap;
  pelvisOrientation: QuaternionData | null;
  chestOrientation: QuaternionData | null;
  headOrientation: QuaternionData | null;
}

export interface SkeletonLayerVisibility {
  raw: boolean;
  filtered: boolean;
  constrained: boolean;
}

export interface ReferenceLineVisibility {
  head: boolean;
  pelvis: boolean;
  shoulders: boolean;
  hips: boolean;
  centerline: boolean;
  ground: boolean;
}

export const DEFAULT_SKELETON_LAYER_VISIBILITY: Readonly<SkeletonLayerVisibility> = {
  raw: false,
  filtered: false,
  constrained: true,
};

export const DEFAULT_REFERENCE_LINE_VISIBILITY: Readonly<ReferenceLineVisibility> = {
  head: false,
  pelvis: false,
  shoulders: false,
  hips: false,
  centerline: false,
  ground: true,
};
