/// <reference lib="webworker" />

import { PoseLandmarker, type PoseLandmarkerOptions } from '@mediapipe/tasks-vision';
import {
  errorMessage,
  nextMonotonicTimestamp,
  serializeLandmarks,
  type PoseDelegate,
} from '../pose/PoseInference';
import { createLocalVisionFileset, installVisionModuleFactory } from '../pose/mediapipeFileset';
import type {
  InitializePoseWorkerRequest,
  PoseWorkerInitializationOptions,
  PoseWorkerRequest,
  PoseWorkerResponse,
  ProcessPoseFrameRequest,
} from './workerMessages';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let landmarker: PoseLandmarker | null = null;
let activeDelegate: PoseDelegate | null = null;
let lastTimestampMs = Number.NEGATIVE_INFINITY;

workerScope.onmessage = (event: MessageEvent<PoseWorkerRequest>): void => {
  void handleMessage(event.data);
};

async function handleMessage(message: PoseWorkerRequest): Promise<void> {
  switch (message.type) {
    case 'initialize':
      await initialize(message);
      break;
    case 'process-frame':
      processFrame(message);
      break;
    case 'close':
      closeLandmarker();
      workerScope.close();
      break;
  }
}

async function initialize(request: InitializePoseWorkerRequest): Promise<void> {
  closeLandmarker();
  lastTimestampMs = Number.NEGATIVE_INFINITY;

  try {
    const visionFiles = await createLocalVisionFileset(request.options.wasmRoot);

    let gpuFailure: unknown;
    try {
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas is unavailable in this worker.');
      }

      const gpuCanvas = new OffscreenCanvas(1, 1);
      installVisionModuleFactory();
      landmarker = await PoseLandmarker.createFromOptions(
        visionFiles,
        createOptions(request.options, 'GPU', gpuCanvas),
      );
      activeDelegate = 'GPU';
    } catch (error) {
      gpuFailure = error;
      installVisionModuleFactory();
      landmarker = await PoseLandmarker.createFromOptions(
        visionFiles,
        createOptions(request.options, 'CPU'),
      );
      activeDelegate = 'CPU';
    }

    const response: PoseWorkerResponse = {
      type: 'ready',
      requestId: request.requestId,
      delegate: activeDelegate,
      ...(gpuFailure ? { gpuFallbackReason: errorMessage(gpuFailure) } : {}),
    };
    workerScope.postMessage(response);
  } catch (error) {
    closeLandmarker();
    postError(
      request.requestId,
      'initialization',
      new Error(
        `MediaPipe Pose Landmarker could not initialize in the worker. ` +
          `Verify model ${request.options.modelAssetPath} and WASM files under ` +
          `${request.options.wasmRoot}. ${errorMessage(error)}`,
      ),
    );
  }
}

function processFrame(request: ProcessPoseFrameRequest): void {
  try {
    if (!landmarker || !activeDelegate) {
      throw new Error('Pose worker received a frame before initialization.');
    }

    const timestampMs = nextMonotonicTimestamp(request.timestampMs, lastTimestampMs);
    lastTimestampMs = timestampMs;

    const startedAt = performance.now();
    const detection = landmarker.detectForVideo(request.frame, timestampMs);
    const inferenceTimeMs = performance.now() - startedAt;

    const response: PoseWorkerResponse = {
      type: 'result',
      requestId: request.requestId,
      result: {
        timestampMs,
        normalizedLandmarks: serializeLandmarks(detection.landmarks[0]),
        worldLandmarks: serializeLandmarks(detection.worldLandmarks[0]),
        inferenceTimeMs,
      },
    };
    workerScope.postMessage(response);
  } catch (error) {
    postError(request.requestId, 'inference', error);
  } finally {
    request.frame.close();
  }
}

function createOptions(
  options: PoseWorkerInitializationOptions,
  delegate: PoseDelegate,
  canvas?: OffscreenCanvas,
): PoseLandmarkerOptions {
  return {
    baseOptions: {
      modelAssetPath: options.modelAssetPath,
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: options.numPoses,
    minPoseDetectionConfidence: options.minPoseDetectionConfidence,
    minPosePresenceConfidence: options.minPosePresenceConfidence,
    minTrackingConfidence: options.minTrackingConfidence,
    outputSegmentationMasks: options.outputSegmentationMasks,
    ...(canvas ? { canvas } : {}),
  };
}

function postError(requestId: number, phase: 'initialization' | 'inference', error: unknown): void {
  const response: PoseWorkerResponse = {
    type: 'error',
    requestId,
    phase,
    message: errorMessage(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
  workerScope.postMessage(response);
}

function closeLandmarker(): void {
  landmarker?.close();
  landmarker = null;
  activeDelegate = null;
}

export {};
