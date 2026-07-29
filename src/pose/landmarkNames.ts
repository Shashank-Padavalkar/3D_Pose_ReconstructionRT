export const LANDMARK_NAMES = [
  'nose',
  'leftEyeInner',
  'leftEye',
  'leftEyeOuter',
  'rightEyeInner',
  'rightEye',
  'rightEyeOuter',
  'leftEar',
  'rightEar',
  'mouthLeft',
  'mouthRight',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftPinky',
  'rightPinky',
  'leftIndex',
  'rightIndex',
  'leftThumb',
  'rightThumb',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftFootIndex',
  'rightFootIndex',
] as const;

export type LandmarkName = (typeof LANDMARK_NAMES)[number];

export const LANDMARK_INDEX: Readonly<Record<LandmarkName, number>> = Object.freeze(
  Object.fromEntries(LANDMARK_NAMES.map((name, index) => [name, index])) as Record<
    LandmarkName,
    number
  >,
);

export const DERIVED_JOINT_NAMES = [
  'pelvisCenter',
  'shoulderCenter',
  'spineMid',
  'chestCenter',
  'neckCenter',
  'headCenter',
  'leftHandCenter',
  'rightHandCenter',
] as const;

export type DerivedJointName = (typeof DERIVED_JOINT_NAMES)[number];
export type JointName = LandmarkName | DerivedJointName;

export const ALL_JOINT_NAMES: readonly JointName[] = [...LANDMARK_NAMES, ...DERIVED_JOINT_NAMES];
