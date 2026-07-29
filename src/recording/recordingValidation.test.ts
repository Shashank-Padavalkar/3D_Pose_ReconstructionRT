import { describe, expect, it } from 'vitest';
import { EMPTY_METRICS, type ProcessedPoseFrame } from '../pose/poseTypes';
import { RECORDING_VERSION, type PoseRecording } from './recordingSchema';
import { parseRecordingJson, validateRecording } from './recordingValidation';

function frame(timestampMs: number): ProcessedPoseFrame {
  const nose = { x: 0.5, y: 0.2, z: -0.1, visibility: 0.9, presence: 0.9 };
  const position = { x: 0, y: 1, z: 0 };
  return {
    timestampMs,
    normalized2D: { nose },
    raw3D: { nose: position },
    filtered3D: { nose: position },
    constrained3D: { nose: position },
    joints: {},
    confidences: { nose: 0.9 },
    rootTranslation: { x: 0, y: 0, z: 0 },
    pelvisOrientation: null,
    chestOrientation: null,
    headOrientation: null,
    metrics: { ...EMPTY_METRICS },
    averageConfidence: 0.9,
  };
}

function recording(): PoseRecording {
  return {
    version: RECORDING_VERSION,
    createdAt: '2026-07-29T12:00:00.000Z',
    calibration: null,
    metadata: { source: 'webcam', model: 'Pose Landmarker Full' },
    frames: [frame(0), frame(33)],
  };
}

describe('recording validation', () => {
  it('accepts a valid, finite, monotonic pose recording', () => {
    const result = validateRecording(recording());
    expect(result.valid).toBe(true);
    expect(result.recording?.frames).toHaveLength(2);
  });

  it('rejects unsupported versions and malformed JSON', () => {
    expect(validateRecording({ ...recording(), version: '99' }).valid).toBe(false);
    expect(parseRecordingJson('{not json').error).toMatch(/could not be parsed/i);
  });

  it('rejects non-finite data and timestamps that move backward', () => {
    const invalidNumber = recording();
    invalidNumber.frames[0]!.rootTranslation.x = Number.NaN;
    expect(validateRecording(invalidNumber).valid).toBe(false);

    const invalidTime = recording();
    invalidTime.frames[1]!.timestampMs = -1;
    expect(validateRecording(invalidTime).valid).toBe(false);
  });

  it('rejects a malformed embedded calibration profile', () => {
    const value = recording() as unknown as Record<string, unknown>;
    value.calibration = { version: 1 };
    expect(validateRecording(value).error).toMatch(/calibration/i);
  });
});
