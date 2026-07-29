import type { PoseInferenceResult, PoseLandmark } from './poseTypes';

export type PoseInferenceMode = 'worker' | 'main-thread';
export type PoseDelegate = 'GPU' | 'CPU';
export type PoseInferenceState = 'idle' | 'initializing' | 'ready' | 'error' | 'closed';

export type PoseFrameSource = HTMLVideoElement | ImageBitmap;

export interface PoseInferenceStatus {
  state: PoseInferenceState;
  mode: PoseInferenceMode;
  delegate: PoseDelegate | null;
  message: string;
  fallbackReason?: string;
}

export interface PoseInferenceOptions {
  modelAssetPath: string;
  wasmRoot: string;
  preferWorker: boolean;
  numPoses: number;
  minPoseDetectionConfidence: number;
  minPosePresenceConfidence: number;
  minTrackingConfidence: number;
  outputSegmentationMasks: boolean;
  initializationTimeoutMs: number;
  inferenceTimeoutMs: number;
  onStatusChange?: (status: Readonly<PoseInferenceStatus>) => void;
}

export const DEFAULT_POSE_INFERENCE_OPTIONS: Readonly<
  Omit<PoseInferenceOptions, 'onStatusChange'>
> = {
  modelAssetPath: '/models/pose_landmarker_full.task',
  wasmRoot: '/wasm',
  preferWorker: true,
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputSegmentationMasks: false,
  initializationTimeoutMs: 60_000,
  inferenceTimeoutMs: 10_000,
};

export interface PoseInference {
  readonly status: Readonly<PoseInferenceStatus>;
  readonly isBusy: boolean;

  initialize(): Promise<Readonly<PoseInferenceStatus>>;
  infer(frame: PoseFrameSource, timestampMs: number): Promise<PoseInferenceResult | null>;
  close(): void;
  dispose(): void;
}

export interface LandmarkLike {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export function resolvePoseInferenceOptions(
  options: Partial<PoseInferenceOptions> = {},
): PoseInferenceOptions {
  return {
    ...DEFAULT_POSE_INFERENCE_OPTIONS,
    ...options,
  };
}

export function serializeLandmarks(landmarks: readonly LandmarkLike[] | undefined): PoseLandmark[] {
  if (!landmarks) {
    return [];
  }

  return landmarks.map((landmark) => {
    const visibility = finiteOr(landmark.visibility, 0);
    return {
      x: finiteOr(landmark.x, 0),
      y: finiteOr(landmark.y, 0),
      z: finiteOr(landmark.z, 0),
      visibility,
      presence: finiteOr(landmark.presence, visibility),
    };
  });
}

export function nextMonotonicTimestamp(
  requestedTimestampMs: number,
  previousTimestampMs: number,
): number {
  const fallbackTimestamp = typeof performance === 'undefined' ? Date.now() : performance.now();
  const requested = Number.isFinite(requestedTimestampMs)
    ? requestedTimestampMs
    : fallbackTimestamp;

  return requested > previousTimestampMs ? requested : previousTimestampMs + 0.001;
}

export function isImageBitmap(frame: PoseFrameSource): frame is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && frame instanceof ImageBitmap;
}

export function closeImageBitmap(frame: PoseFrameSource): void {
  if (!isImageBitmap(frame)) {
    return;
  }

  try {
    frame.close();
  } catch {
    // A transferred ImageBitmap may already be detached. It owns no resources
    // in this realm at that point, so there is nothing left to release here.
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  return 'Unknown error';
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
