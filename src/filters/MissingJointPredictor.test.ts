import { describe, expect, it } from 'vitest';
import { MissingJointPredictor } from './MissingJointPredictor';

describe('MissingJointPredictor', () => {
  it('predicts for at most 125 ms, then holds the capped endpoint', () => {
    const predictor = new MissingJointPredictor({ predictionHorizonMs: 125 });
    predictor.update('leftWrist', { x: 0, y: 0, z: 0 }, 1, 0);
    predictor.update('leftWrist', { x: 0.1, y: 0, z: 0 }, 1, 100);

    const during = predictor.update('leftWrist', null, 0.1, 200);
    const boundary = predictor.update('leftWrist', null, 0.1, 225);
    const after = predictor.update('leftWrist', null, 0.1, 500);

    expect(during.position?.x).toBeCloseTo(0.2, 8);
    expect(boundary.position?.x).toBeCloseTo(0.225, 8);
    expect(after.position?.x).toBeCloseTo(0.225, 8);
    expect(after.isPredicted).toBe(true);
  });

  it('caps velocity and never substitutes the origin without history', () => {
    const predictor = new MissingJointPredictor({ maximumVelocity: 2 });
    const missing = predictor.update('rightWrist', null, 0, 0);
    expect(missing.position).toBeNull();
    expect(missing.isValid).toBe(false);

    predictor.update('rightWrist', { x: 2, y: 1, z: 0 }, 1, 0);
    predictor.update('rightWrist', { x: 12, y: 1, z: 0 }, 1, 100);
    const predicted = predictor.update('rightWrist', null, 0, 200);
    expect(predicted.position?.x).toBeCloseTo(12.2, 8);
  });
});
