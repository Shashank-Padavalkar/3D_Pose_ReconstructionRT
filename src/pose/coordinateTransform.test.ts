import { describe, expect, it } from 'vitest';
import { makeRootRelative, mediaPipeWorldToScene } from './coordinateTransform';

describe('coordinate transform', () => {
  it('converts MediaPipe axes in one explicit operation', () => {
    expect(mediaPipeWorldToScene({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: -2, z: -3 });
    expect(mediaPipeWorldToScene({ x: 1, y: 2, z: 3 }, { x: true, y: true, z: true })).toEqual({
      x: -1,
      y: 2,
      z: 3,
    });
  });

  it('subtracts pelvis center without changing relative geometry', () => {
    const result = makeRootRelative({
      pelvisCenter: { x: 2, y: 3, z: 4 },
      leftHip: { x: 1, y: 3, z: 4 },
      rightHip: { x: 3, y: 3, z: 4 },
    });
    expect(result.root).toEqual({ x: 2, y: 3, z: 4 });
    expect(result.positions.pelvisCenter).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.positions.leftHip).toEqual({ x: -1, y: 0, z: 0 });
    expect(result.positions.rightHip).toEqual({ x: 1, y: 0, z: 0 });
  });
});
