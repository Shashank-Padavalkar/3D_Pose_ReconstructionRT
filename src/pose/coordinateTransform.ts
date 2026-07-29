import { LANDMARK_NAMES, type JointName, type LandmarkName } from './landmarkNames';
import type { PoseLandmark, Vec3Data } from './poseTypes';
import { add, isFiniteVec3, subtract } from '../utils/math';

export interface AxisInversion {
  x: boolean;
  y: boolean;
  z: boolean;
}

export const DEFAULT_AXIS_INVERSION: Readonly<AxisInversion> = Object.freeze({
  x: false,
  y: false,
  z: false,
});

/** The only MediaPipe-world to scene-axis sign conversion in the application. */
export function mediaPipeWorldToScene(
  point: Vec3Data,
  inversion: Partial<AxisInversion> = DEFAULT_AXIS_INVERSION,
): Vec3Data {
  const x = point.x;
  const y = -point.y;
  const z = -point.z;
  return {
    x: inversion.x ? -x : x,
    y: inversion.y ? -y : y,
    z: inversion.z ? -z : z,
  };
}

export function namedLandmarkPositions(
  landmarks: readonly PoseLandmark[],
  transformToScene = false,
  inversion: Partial<AxisInversion> = DEFAULT_AXIS_INVERSION,
): Partial<Record<LandmarkName, Vec3Data>> {
  const output: Partial<Record<LandmarkName, Vec3Data>> = {};
  LANDMARK_NAMES.forEach((name, index) => {
    const point = landmarks[index];
    if (!point || !isFiniteVec3(point)) return;
    output[name] = transformToScene
      ? mediaPipeWorldToScene(point, inversion)
      : { x: point.x, y: point.y, z: point.z };
  });
  return output;
}

export function transformPositionMap(
  positions: Partial<Record<JointName, Vec3Data>>,
  inversion: Partial<AxisInversion> = DEFAULT_AXIS_INVERSION,
): Partial<Record<JointName, Vec3Data>> {
  const output: Partial<Record<JointName, Vec3Data>> = {};
  for (const [name, point] of Object.entries(positions) as Array<[JointName, Vec3Data]>) {
    if (isFiniteVec3(point)) output[name] = mediaPipeWorldToScene(point, inversion);
  }
  return output;
}

export interface RootRelativeResult {
  positions: Partial<Record<JointName, Vec3Data>>;
  root: Vec3Data | null;
}

export function makeRootRelative(
  positions: Partial<Record<JointName, Vec3Data>>,
  rootName: JointName = 'pelvisCenter',
): RootRelativeResult {
  const root = positions[rootName];
  if (!root || !isFiniteVec3(root)) return { positions: { ...positions }, root: null };
  const output: Partial<Record<JointName, Vec3Data>> = {};
  for (const [name, point] of Object.entries(positions) as Array<[JointName, Vec3Data]>) {
    if (isFiniteVec3(point)) output[name] = subtract(point, root);
  }
  return { positions: output, root: { ...root } };
}

export function translatePositions(
  positions: Partial<Record<JointName, Vec3Data>>,
  translation: Vec3Data,
): Partial<Record<JointName, Vec3Data>> {
  const output: Partial<Record<JointName, Vec3Data>> = {};
  for (const [name, point] of Object.entries(positions) as Array<[JointName, Vec3Data]>) {
    if (isFiniteVec3(point)) output[name] = add(point, translation);
  }
  return output;
}
