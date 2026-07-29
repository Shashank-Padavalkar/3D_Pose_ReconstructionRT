import type { JointName, LandmarkName } from './landmarkNames';

export interface PoseConnection<T extends JointName = JointName> {
  name: string;
  from: T;
  to: T;
}

export const MEDIAPIPE_CONNECTIONS: readonly PoseConnection<LandmarkName>[] = [
  { name: 'shoulders', from: 'leftShoulder', to: 'rightShoulder' },
  { name: 'leftUpperArm', from: 'leftShoulder', to: 'leftElbow' },
  { name: 'leftForearm', from: 'leftElbow', to: 'leftWrist' },
  { name: 'rightUpperArm', from: 'rightShoulder', to: 'rightElbow' },
  { name: 'rightForearm', from: 'rightElbow', to: 'rightWrist' },
  { name: 'hips', from: 'leftHip', to: 'rightHip' },
  { name: 'leftTorso', from: 'leftShoulder', to: 'leftHip' },
  { name: 'rightTorso', from: 'rightShoulder', to: 'rightHip' },
  { name: 'leftThigh', from: 'leftHip', to: 'leftKnee' },
  { name: 'leftShin', from: 'leftKnee', to: 'leftAnkle' },
  { name: 'leftRearFoot', from: 'leftAnkle', to: 'leftHeel' },
  { name: 'leftFoot', from: 'leftHeel', to: 'leftFootIndex' },
  { name: 'rightThigh', from: 'rightHip', to: 'rightKnee' },
  { name: 'rightShin', from: 'rightKnee', to: 'rightAnkle' },
  { name: 'rightRearFoot', from: 'rightAnkle', to: 'rightHeel' },
  { name: 'rightFoot', from: 'rightHeel', to: 'rightFootIndex' },
] as const;

export const RECONSTRUCTION_CONNECTIONS: readonly PoseConnection[] = [
  { name: 'lowerSpine', from: 'pelvisCenter', to: 'spineMid' },
  { name: 'upperSpine', from: 'spineMid', to: 'chestCenter' },
  { name: 'upperTorso', from: 'chestCenter', to: 'neckCenter' },
  { name: 'neck', from: 'neckCenter', to: 'headCenter' },
  { name: 'leftClavicle', from: 'chestCenter', to: 'leftShoulder' },
  { name: 'rightClavicle', from: 'chestCenter', to: 'rightShoulder' },
  { name: 'leftUpperArm', from: 'leftShoulder', to: 'leftElbow' },
  { name: 'leftForearm', from: 'leftElbow', to: 'leftWrist' },
  { name: 'leftHand', from: 'leftWrist', to: 'leftHandCenter' },
  { name: 'rightUpperArm', from: 'rightShoulder', to: 'rightElbow' },
  { name: 'rightForearm', from: 'rightElbow', to: 'rightWrist' },
  { name: 'rightHand', from: 'rightWrist', to: 'rightHandCenter' },
  { name: 'leftPelvis', from: 'pelvisCenter', to: 'leftHip' },
  { name: 'rightPelvis', from: 'pelvisCenter', to: 'rightHip' },
  { name: 'leftThigh', from: 'leftHip', to: 'leftKnee' },
  { name: 'leftShin', from: 'leftKnee', to: 'leftAnkle' },
  { name: 'leftFoot', from: 'leftHeel', to: 'leftFootIndex' },
  { name: 'rightThigh', from: 'rightHip', to: 'rightKnee' },
  { name: 'rightShin', from: 'rightKnee', to: 'rightAnkle' },
  { name: 'rightFoot', from: 'rightHeel', to: 'rightFootIndex' },
] as const;
