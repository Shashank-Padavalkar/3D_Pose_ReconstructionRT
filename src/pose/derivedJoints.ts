import type { DerivedJointName, JointName } from './landmarkNames';
import type { Vec3Data } from './poseTypes';
import { add, interpolate, isFiniteVec3, midpoint, scale } from '../utils/math';

export interface DerivedJointSet {
  positions: Partial<Record<DerivedJointName, Vec3Data>>;
  confidences: Partial<Record<DerivedJointName, number>>;
}

type PositionMap = Partial<Record<JointName, Vec3Data>>;
type ConfidenceMap = Partial<Record<JointName, number>>;

/** Computes only derived joints; callers can merge these into their source maps. */
export function computeDerivedJoints(
  inputPositions: PositionMap,
  inputConfidences: ConfidenceMap = {},
  minimumConfidence = 0.4,
): DerivedJointSet {
  const positions: PositionMap = { ...inputPositions };
  const confidences: ConfidenceMap = { ...inputConfidences };
  const derivedPositions: Partial<Record<DerivedJointName, Vec3Data>> = {};
  const derivedConfidences: Partial<Record<DerivedJointName, number>> = {};

  const addDerived = (name: DerivedJointName, position: Vec3Data, confidence: number): void => {
    if (!isFiniteVec3(position) || confidence < minimumConfidence) return;
    positions[name] = position;
    confidences[name] = confidence;
    derivedPositions[name] = position;
    derivedConfidences[name] = confidence;
  };

  const pair = (name: DerivedJointName, left: JointName, right: JointName): void => {
    const leftPoint = getUsable(positions, confidences, left, minimumConfidence);
    const rightPoint = getUsable(positions, confidences, right, minimumConfidence);
    if (!leftPoint || !rightPoint) return;
    addDerived(
      name,
      midpoint(leftPoint, rightPoint),
      Math.min(confidenceOf(confidences, left), confidenceOf(confidences, right)),
    );
  };

  pair('pelvisCenter', 'leftHip', 'rightHip');
  pair('shoulderCenter', 'leftShoulder', 'rightShoulder');

  const pelvis = getUsable(positions, confidences, 'pelvisCenter', minimumConfidence);
  const shoulders = getUsable(positions, confidences, 'shoulderCenter', minimumConfidence);
  if (pelvis && shoulders) {
    const torsoConfidence = Math.min(
      confidenceOf(confidences, 'pelvisCenter'),
      confidenceOf(confidences, 'shoulderCenter'),
    );
    addDerived('spineMid', interpolate(pelvis, shoulders, 0.5), torsoConfidence);
    addDerived('chestCenter', interpolate(pelvis, shoulders, 0.72), torsoConfidence);
    addDerived('neckCenter', { ...shoulders }, confidenceOf(confidences, 'shoulderCenter'));
  }

  const headSources: ReadonlyArray<readonly [JointName, number]> = [
    ['nose', 0.5],
    ['leftEar', 0.25],
    ['rightEar', 0.25],
  ];
  const head = weightedUsableAverage(positions, confidences, headSources, minimumConfidence, 2);
  if (head) addDerived('headCenter', head.position, head.confidence);

  const addHand = (side: 'left' | 'right'): void => {
    const sources: ReadonlyArray<readonly [JointName, number]> = [
      [`${side}Wrist`, 1],
      [`${side}Index`, 1],
      [`${side}Pinky`, 1],
      [`${side}Thumb`, 1],
    ];
    const hand = weightedUsableAverage(positions, confidences, sources, minimumConfidence, 3);
    if (hand) addDerived(`${side}HandCenter`, hand.position, hand.confidence);
  };
  addHand('left');
  addHand('right');

  return { positions: derivedPositions, confidences: derivedConfidences };
}

export function withDerivedJoints(
  positions: PositionMap,
  confidences: ConfidenceMap = {},
  minimumConfidence = 0.4,
): { positions: PositionMap; confidences: ConfidenceMap } {
  const derived = computeDerivedJoints(positions, confidences, minimumConfidence);
  return {
    positions: { ...positions, ...derived.positions },
    confidences: { ...confidences, ...derived.confidences },
  };
}

function confidenceOf(confidences: ConfidenceMap, name: JointName): number {
  const value = confidences[name];
  return value === undefined ? 1 : value;
}

function getUsable(
  positions: PositionMap,
  confidences: ConfidenceMap,
  name: JointName,
  minimumConfidence: number,
): Vec3Data | null {
  const point = positions[name];
  return point && isFiniteVec3(point) && confidenceOf(confidences, name) >= minimumConfidence
    ? point
    : null;
}

function weightedUsableAverage(
  positions: PositionMap,
  confidences: ConfidenceMap,
  sources: ReadonlyArray<readonly [JointName, number]>,
  minimumConfidence: number,
  minimumCount: number,
): { position: Vec3Data; confidence: number } | null {
  let total = { x: 0, y: 0, z: 0 };
  let totalWeight = 0;
  const usedConfidences: number[] = [];
  for (const [name, weight] of sources) {
    const point = getUsable(positions, confidences, name, minimumConfidence);
    if (!point) continue;
    total = add(total, scale(point, weight));
    totalWeight += weight;
    usedConfidences.push(confidenceOf(confidences, name));
  }
  if (usedConfidences.length < minimumCount || totalWeight <= 0) return null;
  return {
    position: scale(total, 1 / totalWeight),
    confidence: Math.min(...usedConfidences),
  };
}
