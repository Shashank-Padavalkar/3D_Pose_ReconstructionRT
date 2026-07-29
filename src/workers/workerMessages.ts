import type { PoseDelegate, PoseInferenceOptions } from '../pose/PoseInference';
import type { PoseInferenceResult } from '../pose/poseTypes';

export interface PoseWorkerInitializationOptions {
  modelAssetPath: string;
  wasmRoot: string;
  numPoses: number;
  minPoseDetectionConfidence: number;
  minPosePresenceConfidence: number;
  minTrackingConfidence: number;
  outputSegmentationMasks: boolean;
}

export interface InitializePoseWorkerRequest {
  type: 'initialize';
  requestId: number;
  options: PoseWorkerInitializationOptions;
}

export interface ProcessPoseFrameRequest {
  type: 'process-frame';
  requestId: number;
  frame: ImageBitmap;
  timestampMs: number;
}

export interface ClosePoseWorkerRequest {
  type: 'close';
}

export type PoseWorkerRequest =
  InitializePoseWorkerRequest | ProcessPoseFrameRequest | ClosePoseWorkerRequest;

export interface PoseWorkerReadyResponse {
  type: 'ready';
  requestId: number;
  delegate: PoseDelegate;
  gpuFallbackReason?: string;
}

export interface PoseWorkerResultResponse {
  type: 'result';
  requestId: number;
  result: PoseInferenceResult;
}

export interface PoseWorkerErrorResponse {
  type: 'error';
  requestId: number;
  phase: 'initialization' | 'inference';
  message: string;
  stack?: string;
}

export type PoseWorkerResponse =
  PoseWorkerReadyResponse | PoseWorkerResultResponse | PoseWorkerErrorResponse;

export function toWorkerInitializationOptions(
  options: PoseInferenceOptions,
): PoseWorkerInitializationOptions {
  return {
    modelAssetPath: options.modelAssetPath,
    wasmRoot: options.wasmRoot,
    numPoses: options.numPoses,
    minPoseDetectionConfidence: options.minPoseDetectionConfidence,
    minPosePresenceConfidence: options.minPosePresenceConfidence,
    minTrackingConfidence: options.minTrackingConfidence,
    outputSegmentationMasks: options.outputSegmentationMasks,
  };
}
