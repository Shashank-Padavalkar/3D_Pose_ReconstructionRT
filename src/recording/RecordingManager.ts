import type { BodyCalibration } from '../calibration/BodyCalibration';
import type { ProcessedPoseFrame, Vec3Data } from '../pose/poseTypes';
import {
  RECORDING_VERSION,
  type PoseRecording,
  type RecordedPoseFrame,
  type RecordingMetadata,
} from './recordingSchema';

function cloneVector(value: Vec3Data): Vec3Data {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneFrame(frame: ProcessedPoseFrame, timestampMs: number): RecordedPoseFrame {
  return {
    ...structuredClone(frame),
    timestampMs,
    rootTranslation: cloneVector(frame.rootTranslation),
  };
}

export class RecordingManager {
  private frames: RecordedPoseFrame[] = [];
  private startedAtMs: number | null = null;
  private calibration: BodyCalibration | null = null;
  private metadata: RecordingMetadata | null = null;

  get isRecording(): boolean {
    return this.startedAtMs !== null;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  get durationMs(): number {
    return this.frames.at(-1)?.timestampMs ?? 0;
  }

  start(
    metadata: RecordingMetadata,
    calibration: BodyCalibration | null,
    nowMs = performance.now(),
  ): void {
    this.frames = [];
    this.metadata = { ...metadata };
    this.calibration = calibration ? structuredClone(calibration) : null;
    this.startedAtMs = nowMs;
  }

  addFrame(frame: ProcessedPoseFrame): boolean {
    if (this.startedAtMs === null) return false;
    const relativeTimestamp = Math.max(0, frame.timestampMs - this.startedAtMs);
    const previous = this.frames.at(-1);
    const monotonicTimestamp = Math.max(previous?.timestampMs ?? 0, relativeTimestamp);
    this.frames.push(cloneFrame(frame, monotonicTimestamp));
    return true;
  }

  stop(): PoseRecording | null {
    this.startedAtMs = null;
    return this.snapshot();
  }

  clear(): void {
    this.frames = [];
    this.startedAtMs = null;
    this.metadata = null;
    this.calibration = null;
  }

  load(recording: PoseRecording): void {
    this.startedAtMs = null;
    this.frames = structuredClone(recording.frames);
    this.calibration = recording.calibration ? structuredClone(recording.calibration) : null;
    this.metadata = { ...recording.metadata, source: 'import' };
  }

  snapshot(): PoseRecording | null {
    if (!this.metadata || this.frames.length === 0) return null;
    return {
      version: RECORDING_VERSION,
      createdAt: new Date().toISOString(),
      calibration: this.calibration ? structuredClone(this.calibration) : null,
      metadata: { ...this.metadata },
      frames: structuredClone(this.frames),
    };
  }
}
