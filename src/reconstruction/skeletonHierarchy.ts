import type { JointName } from '../pose/landmarkNames';
import type { BodyCalibration } from '../calibration/BodyCalibration';

export interface CalibratedBone {
  name: string;
  parent: JointName;
  child: JointName;
  calibrationKey: keyof BodyCalibration;
}

/** Outward traversal order after pelvis/torso widths have been established. */
export const CALIBRATED_BONES: readonly CalibratedBone[] = [
  { name: 'neck', parent: 'neckCenter', child: 'headCenter', calibrationKey: 'neckLength' },
  {
    name: 'leftUpperArm',
    parent: 'leftShoulder',
    child: 'leftElbow',
    calibrationKey: 'leftUpperArmLength',
  },
  {
    name: 'leftForearm',
    parent: 'leftElbow',
    child: 'leftWrist',
    calibrationKey: 'leftForearmLength',
  },
  {
    name: 'rightUpperArm',
    parent: 'rightShoulder',
    child: 'rightElbow',
    calibrationKey: 'rightUpperArmLength',
  },
  {
    name: 'rightForearm',
    parent: 'rightElbow',
    child: 'rightWrist',
    calibrationKey: 'rightForearmLength',
  },
  {
    name: 'leftThigh',
    parent: 'leftHip',
    child: 'leftKnee',
    calibrationKey: 'leftThighLength',
  },
  {
    name: 'leftShin',
    parent: 'leftKnee',
    child: 'leftAnkle',
    calibrationKey: 'leftShinLength',
  },
  {
    name: 'rightThigh',
    parent: 'rightHip',
    child: 'rightKnee',
    calibrationKey: 'rightThighLength',
  },
  {
    name: 'rightShin',
    parent: 'rightKnee',
    child: 'rightAnkle',
    calibrationKey: 'rightShinLength',
  },
  {
    name: 'leftFoot',
    parent: 'leftHeel',
    child: 'leftFootIndex',
    calibrationKey: 'leftFootLength',
  },
  {
    name: 'rightFoot',
    parent: 'rightHeel',
    child: 'rightFootIndex',
    calibrationKey: 'rightFootLength',
  },
] as const;

export const SKELETON_PARENTS: Readonly<Partial<Record<JointName, JointName>>> = Object.freeze({
  spineMid: 'pelvisCenter',
  chestCenter: 'spineMid',
  neckCenter: 'chestCenter',
  headCenter: 'neckCenter',
  leftHip: 'pelvisCenter',
  rightHip: 'pelvisCenter',
  leftShoulder: 'chestCenter',
  rightShoulder: 'chestCenter',
  leftElbow: 'leftShoulder',
  rightElbow: 'rightShoulder',
  leftWrist: 'leftElbow',
  rightWrist: 'rightElbow',
  leftHandCenter: 'leftWrist',
  rightHandCenter: 'rightWrist',
  leftKnee: 'leftHip',
  rightKnee: 'rightHip',
  leftAnkle: 'leftKnee',
  rightAnkle: 'rightKnee',
  leftHeel: 'leftAnkle',
  rightHeel: 'rightAnkle',
  leftFootIndex: 'leftHeel',
  rightFootIndex: 'rightHeel',
});
