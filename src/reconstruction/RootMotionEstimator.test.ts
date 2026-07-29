import { describe, expect, it } from 'vitest';
import { clampRootTranslation, RootMotionEstimator } from './RootMotionEstimator';

describe('root motion', () => {
  it('hard-clamps all approximate translation axes', () => {
    expect(
      clampRootTranslation(
        { x: 20, y: -20, z: 20 },
        { maximumHorizontal: 1, maximumVertical: 2, maximumDepth: 3 },
      ),
    ).toEqual({ x: 1, y: -2, z: 3 });
  });

  it('anchors by default and speed-limits approximate motion', () => {
    const estimator = new RootMotionEstimator({
      smoothing: 1,
      maximumSpeed: 1,
      maximumHorizontal: 10,
    });
    const neutral = {
      pelvisCenter: { x: 0.5, y: 0.7 },
      shoulderCenter: { x: 0.5, y: 0.3 },
    };
    expect(estimator.update(neutral, 0, 'anchored')).toEqual({ x: 0, y: 0, z: 0 });
    estimator.update(neutral, 100, 'approximate');
    const moved = estimator.update(
      { pelvisCenter: { x: 1.5, y: 0.7 }, shoulderCenter: { x: 1.5, y: 0.3 } },
      200,
      'approximate',
    );
    expect(moved.x).toBeCloseTo(0.1, 8);
  });
});
