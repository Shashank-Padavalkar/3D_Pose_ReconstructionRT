import type { JointName } from '../pose/landmarkNames';
import type { Vec3Data } from '../pose/poseTypes';
import { DEFAULT_BODY_CALIBRATION, type BodyCalibration } from '../calibration/BodyCalibration';
import {
  add,
  interpolate,
  isFiniteVec3,
  midpoint,
  normalize,
  scale,
  subtract,
} from '../utils/math';
import { CALIBRATED_BONES } from './skeletonHierarchy';

export type JointPositionMap = Partial<Record<JointName, Vec3Data>>;

/**
 * Preserves measured directions while replacing noisy lengths. Pelvis, hip width,
 * torso length and shoulder width are established before traversing the limbs.
 */
export function applyBoneLengthConstraints(
  source: JointPositionMap,
  calibration: BodyCalibration = DEFAULT_BODY_CALIBRATION,
): JointPositionMap {
  const result = cloneFinitePositions(source);
  const pelvis = result.pelvisCenter ?? midpointIfPresent(result.leftHip, result.rightHip);
  if (!pelvis) return result;
  result.pelvisCenter = { ...pelvis };

  const hipAxis = directionBetween(result.leftHip, result.rightHip) ?? { x: 1, y: 0, z: 0 };
  result.leftHip = add(pelvis, scale(hipAxis, -calibration.hipWidth / 2));
  result.rightHip = add(pelvis, scale(hipAxis, calibration.hipWidth / 2));

  const rawShoulderCenter =
    result.shoulderCenter ?? midpointIfPresent(result.leftShoulder, result.rightShoulder);
  const torsoDirection = (rawShoulderCenter
    ? normalize(subtract(rawShoulderCenter, pelvis))
    : null) ??
    directionBetween(pelvis, result.chestCenter) ?? { x: 0, y: 1, z: 0 };
  const shoulderCenter = add(pelvis, scale(torsoDirection, calibration.torsoLength));
  result.shoulderCenter = shoulderCenter;
  result.spineMid = interpolate(pelvis, shoulderCenter, 0.5);
  result.chestCenter = interpolate(pelvis, shoulderCenter, 0.72);
  result.neckCenter = { ...shoulderCenter };

  const shoulderAxis = directionBetween(result.leftShoulder, result.rightShoulder) ?? hipAxis;
  result.leftShoulder = add(shoulderCenter, scale(shoulderAxis, -calibration.shoulderWidth / 2));
  result.rightShoulder = add(shoulderCenter, scale(shoulderAxis, calibration.shoulderWidth / 2));

  for (const bone of CALIBRATED_BONES) {
    const configuredLength = calibration[bone.calibrationKey];
    if (typeof configuredLength !== 'number' || !(configuredLength > 0)) continue;
    constrainChild(result, source, bone.parent, bone.child, configuredLength);
  }

  // Heel offsets are not calibrated; keep their raw direction and magnitude from each ankle.
  preserveOffset(result, source, 'leftAnkle', 'leftHeel');
  preserveOffset(result, source, 'rightAnkle', 'rightHeel');
  // Foot constraints need to be re-applied after moving heels.
  constrainChild(result, source, 'leftHeel', 'leftFootIndex', calibration.leftFootLength);
  constrainChild(result, source, 'rightHeel', 'rightFootIndex', calibration.rightFootLength);

  preserveOffset(result, source, 'leftWrist', 'leftHandCenter');
  preserveOffset(result, source, 'rightWrist', 'rightHandCenter');
  return result;
}

function constrainChild(
  result: JointPositionMap,
  directionSource: JointPositionMap,
  parentName: JointName,
  childName: JointName,
  length: number,
): void {
  const parent = result[parentName];
  if (!parent) return;
  const direction =
    directionBetween(directionSource[parentName], directionSource[childName]) ??
    directionBetween(result[parentName], result[childName]) ??
    fallbackDirection(childName);
  result[childName] = add(parent, scale(direction, length));
}

function preserveOffset(
  result: JointPositionMap,
  source: JointPositionMap,
  parentName: JointName,
  childName: JointName,
): void {
  const parent = result[parentName];
  const rawParent = source[parentName];
  const rawChild = source[childName];
  if (!parent || !rawParent || !rawChild) return;
  result[childName] = add(parent, subtract(rawChild, rawParent));
}

function fallbackDirection(child: JointName): Vec3Data {
  if (child.includes('Foot') || child.includes('Heel')) return { x: 0, y: 0, z: 1 };
  if (child.includes('Shoulder') || child.includes('Hip')) {
    return child.startsWith('left') ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
  }
  return { x: 0, y: child === 'headCenter' ? 1 : -1, z: 0 };
}

function directionBetween(a: Vec3Data | undefined, b: Vec3Data | undefined): Vec3Data | null {
  return a && b ? normalize(subtract(b, a)) : null;
}

function midpointIfPresent(a: Vec3Data | undefined, b: Vec3Data | undefined): Vec3Data | null {
  return a && b ? midpoint(a, b) : null;
}

function cloneFinitePositions(source: JointPositionMap): JointPositionMap {
  const output: JointPositionMap = {};
  for (const [name, value] of Object.entries(source) as Array<[JointName, Vec3Data]>) {
    if (isFiniteVec3(value)) output[name] = { ...value };
  }
  return output;
}
