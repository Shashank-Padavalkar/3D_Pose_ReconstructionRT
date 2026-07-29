import type { QuaternionData, Vec2Data, Vec3Data } from '../pose/poseTypes';

export const BODY_CALIBRATION_VERSION = 1 as const;

export interface CalibrationReference {
  scenePelvisCenter: Vec3Data;
  sceneHeadCenter: Vec3Data | null;
  normalizedPelvisCenter: Vec2Data | null;
  normalizedShoulderCenter: Vec2Data | null;
  normalizedTorsoScale: number | null;
  pelvisOrientation: QuaternionData | null;
  chestOrientation: QuaternionData | null;
}

/** Plain serializable calibration profile; all lengths use the input world-coordinate scale. */
export interface BodyCalibration {
  version: typeof BODY_CALIBRATION_VERSION;
  createdAt: string;
  sampleCount: number;
  symmetryEnabled: boolean;
  bodyHeightMeters: number | null;

  shoulderWidth: number;
  hipWidth: number;
  torsoLength: number;
  neckLength: number;
  headSize: number;

  leftUpperArmLength: number;
  rightUpperArmLength: number;
  upperArmLength: number;
  leftForearmLength: number;
  rightForearmLength: number;
  forearmLength: number;
  leftThighLength: number;
  rightThighLength: number;
  thighLength: number;
  leftShinLength: number;
  rightShinLength: number;
  shinLength: number;
  leftFootLength: number;
  rightFootLength: number;
  footLength: number;

  reference: CalibrationReference;
}

export const CALIBRATION_LENGTH_KEYS = [
  'shoulderWidth',
  'hipWidth',
  'torsoLength',
  'neckLength',
  'headSize',
  'leftUpperArmLength',
  'rightUpperArmLength',
  'upperArmLength',
  'leftForearmLength',
  'rightForearmLength',
  'forearmLength',
  'leftThighLength',
  'rightThighLength',
  'thighLength',
  'leftShinLength',
  'rightShinLength',
  'shinLength',
  'leftFootLength',
  'rightFootLength',
  'footLength',
] as const satisfies readonly (keyof BodyCalibration)[];

/** Neutral adult-like proportions used until a real profile has been collected. */
export const DEFAULT_BODY_CALIBRATION: Readonly<BodyCalibration> = Object.freeze({
  version: BODY_CALIBRATION_VERSION,
  createdAt: 'default',
  sampleCount: 0,
  symmetryEnabled: true,
  bodyHeightMeters: null,
  shoulderWidth: 0.38,
  hipWidth: 0.3,
  torsoLength: 0.5,
  neckLength: 0.2,
  headSize: 0.22,
  leftUpperArmLength: 0.3,
  rightUpperArmLength: 0.3,
  upperArmLength: 0.3,
  leftForearmLength: 0.26,
  rightForearmLength: 0.26,
  forearmLength: 0.26,
  leftThighLength: 0.42,
  rightThighLength: 0.42,
  thighLength: 0.42,
  leftShinLength: 0.43,
  rightShinLength: 0.43,
  shinLength: 0.43,
  leftFootLength: 0.23,
  rightFootLength: 0.23,
  footLength: 0.23,
  reference: Object.freeze({
    scenePelvisCenter: Object.freeze({ x: 0, y: 0, z: 0 }),
    sceneHeadCenter: null,
    normalizedPelvisCenter: null,
    normalizedShoulderCenter: null,
    normalizedTorsoScale: null,
    pelvisOrientation: null,
    chestOrientation: null,
  }),
});

export function createDefaultCalibration(): BodyCalibration {
  return {
    ...DEFAULT_BODY_CALIBRATION,
    reference: {
      ...DEFAULT_BODY_CALIBRATION.reference,
      scenePelvisCenter: { ...DEFAULT_BODY_CALIBRATION.reference.scenePelvisCenter },
    },
  };
}
