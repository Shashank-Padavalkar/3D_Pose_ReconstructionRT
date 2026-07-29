import type { PoseLandmark } from './poseTypes';
import { clamp } from '../utils/clamp';

export interface ConfidenceThresholds {
  high: number;
  usable: number;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ConfidenceDecision = 'accept' | 'smooth' | 'predict';

export const DEFAULT_CONFIDENCE_THRESHOLDS: Readonly<ConfidenceThresholds> = Object.freeze({
  high: 0.65,
  usable: 0.4,
});

/** Conservative landmark confidence: the weaker of visibility and presence. */
export function landmarkConfidence(
  landmark: Pick<PoseLandmark, 'visibility' | 'presence'> | null | undefined,
): number {
  if (!landmark) return 0;
  const visibility = Number.isFinite(landmark.visibility) ? landmark.visibility : 0;
  const candidate = landmark as { presence?: number };
  const presence = Number.isFinite(candidate.presence) ? candidate.presence! : visibility;
  return clamp(Math.min(visibility, presence), 0, 1);
}

export function confidenceLevel(
  confidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceLevel {
  const safe = Number.isFinite(confidence) ? confidence : 0;
  if (safe >= thresholds.high) return 'high';
  if (safe >= thresholds.usable) return 'medium';
  return 'low';
}

export function gateConfidence(
  confidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceDecision {
  const level = confidenceLevel(confidence, thresholds);
  return level === 'high' ? 'accept' : level === 'medium' ? 'smooth' : 'predict';
}

export function isUsableConfidence(
  confidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): boolean {
  return confidenceLevel(confidence, thresholds) !== 'low';
}

export function averageConfidence(values: Iterable<number>): number {
  let total = 0;
  let count = 0;
  for (const value of values) {
    if (Number.isFinite(value)) {
      total += clamp(value, 0, 1);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}
