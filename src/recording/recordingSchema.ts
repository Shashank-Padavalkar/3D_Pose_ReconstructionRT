import type { BodyCalibration } from '../calibration/BodyCalibration';
import type { ProcessedPoseFrame } from '../pose/poseTypes';

export const RECORDING_VERSION = '1.0';

export interface RecordingMetadata {
  source: 'webcam' | 'import';
  model: string;
  requestedResolution?: string;
  actualResolution?: string;
  actualFrameRate?: number;
}

export interface RecordedPoseFrame extends ProcessedPoseFrame {
  timestampMs: number;
}

export interface PoseRecording {
  version: typeof RECORDING_VERSION;
  createdAt: string;
  calibration: BodyCalibration | null;
  metadata: RecordingMetadata;
  frames: RecordedPoseFrame[];
}
