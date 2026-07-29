import { PoseLandmarker, type PoseLandmarkerOptions } from '@mediapipe/tasks-vision';
import { createLocalVisionFileset, installVisionModuleFactory } from './mediapipeFileset';
import {
  closeImageBitmap,
  errorMessage,
  isImageBitmap,
  nextMonotonicTimestamp,
  resolvePoseInferenceOptions,
  serializeLandmarks,
  type PoseDelegate,
  type PoseFrameSource,
  type PoseInference,
  type PoseInferenceOptions,
  type PoseInferenceStatus,
} from './PoseInference';
import type { PoseInferenceResult } from './poseTypes';

export class MediaPipeMainThreadInference implements PoseInference {
  private readonly options: PoseInferenceOptions;
  private statusValue: PoseInferenceStatus = {
    state: 'idle',
    mode: 'main-thread',
    delegate: null,
    message: 'Pose inference has not been initialized.',
  };
  private landmarker: PoseLandmarker | null = null;
  private gpuCanvas: HTMLCanvasElement | null = null;
  private initializePromise: Promise<Readonly<PoseInferenceStatus>> | null = null;
  private busy = false;
  private lastTimestampMs = Number.NEGATIVE_INFINITY;

  public constructor(options: Partial<PoseInferenceOptions> = {}) {
    this.options = resolvePoseInferenceOptions({
      ...options,
      preferWorker: false,
    });
  }

  public get status(): Readonly<PoseInferenceStatus> {
    return this.statusValue;
  }

  public get isBusy(): boolean {
    return this.busy;
  }

  public initialize(): Promise<Readonly<PoseInferenceStatus>> {
    if (this.statusValue.state === 'closed') {
      return Promise.reject(new Error('Cannot initialize closed pose inference.'));
    }
    if (this.statusValue.state === 'ready') {
      return Promise.resolve(this.statusValue);
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.updateStatus({
      state: 'initializing',
      mode: 'main-thread',
      delegate: null,
      message: 'Loading MediaPipe Pose Landmarker on the main thread…',
    });

    this.initializePromise = this.initializeInternal().finally(() => {
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  public async infer(
    frame: PoseFrameSource,
    requestedTimestampMs: number,
  ): Promise<PoseInferenceResult | null> {
    if (this.busy) {
      closeImageBitmap(frame);
      return null;
    }

    this.busy = true;
    try {
      if (this.statusValue.state !== 'ready') {
        await this.initialize();
      }
      if (!this.landmarker) {
        throw new Error('MediaPipe Pose Landmarker is not available.');
      }

      const timestampMs = nextMonotonicTimestamp(requestedTimestampMs, this.lastTimestampMs);
      this.lastTimestampMs = timestampMs;

      const startedAt = performance.now();
      const detection = this.landmarker.detectForVideo(frame, timestampMs);
      const inferenceTimeMs = performance.now() - startedAt;

      return {
        timestampMs,
        normalizedLandmarks: serializeLandmarks(detection.landmarks[0]),
        worldLandmarks: serializeLandmarks(detection.worldLandmarks[0]),
        inferenceTimeMs,
      };
    } catch (error) {
      console.error('Main-thread pose inference failed.', error);
      throw error;
    } finally {
      if (isImageBitmap(frame)) {
        closeImageBitmap(frame);
      }
      this.busy = false;
    }
  }

  public close(): void {
    this.dispose();
  }

  public dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.gpuCanvas = null;
    this.busy = false;
    this.lastTimestampMs = Number.NEGATIVE_INFINITY;
    this.updateStatus({
      state: 'closed',
      mode: 'main-thread',
      delegate: null,
      message: 'Pose inference is closed.',
    });
  }

  private async initializeInternal(): Promise<Readonly<PoseInferenceStatus>> {
    try {
      const visionFiles = await createLocalVisionFileset(this.options.wasmRoot);

      let gpuFailure: unknown;
      try {
        if (typeof document === 'undefined') {
          throw new Error('An HTML canvas is unavailable in this environment.');
        }
        this.gpuCanvas = document.createElement('canvas');
        this.gpuCanvas.width = 1;
        this.gpuCanvas.height = 1;
        installVisionModuleFactory();
        this.landmarker = await PoseLandmarker.createFromOptions(
          visionFiles,
          this.createLandmarkerOptions('GPU', this.gpuCanvas),
        );
        this.throwIfClosedDuringInitialization();
        this.updateStatus({
          state: 'ready',
          mode: 'main-thread',
          delegate: 'GPU',
          message: 'Pose inference is ready on the main thread using GPU.',
        });
        return this.statusValue;
      } catch (error) {
        if (this.statusValue.state === 'closed') {
          throw error;
        }
        gpuFailure = error;
        this.gpuCanvas = null;
        console.warn('MediaPipe GPU initialization failed; retrying with CPU.', error);
      }

      installVisionModuleFactory();
      this.landmarker = await PoseLandmarker.createFromOptions(
        visionFiles,
        this.createLandmarkerOptions('CPU'),
      );
      this.throwIfClosedDuringInitialization();
      this.updateStatus({
        state: 'ready',
        mode: 'main-thread',
        delegate: 'CPU',
        message: 'Pose inference is ready on the main thread using CPU.',
        fallbackReason: errorMessage(gpuFailure),
      });
      return this.statusValue;
    } catch (error) {
      if (this.statusValue.state === 'closed') {
        this.landmarker?.close();
        this.landmarker = null;
        this.gpuCanvas = null;
        throw new Error('Pose inference was closed during initialization.', {
          cause: error,
        });
      }
      const wrappedError = new Error(
        `MediaPipe Pose Landmarker could not initialize. Verify that ` +
          `${this.options.modelAssetPath} exists and that MediaPipe WASM files ` +
          `are available under ${this.options.wasmRoot}. ${errorMessage(error)}`,
      );
      console.error(wrappedError.message, error);
      this.landmarker?.close();
      this.landmarker = null;
      this.gpuCanvas = null;
      this.updateStatus({
        state: 'error',
        mode: 'main-thread',
        delegate: null,
        message: wrappedError.message,
      });
      throw wrappedError;
    }
  }

  private createLandmarkerOptions(
    delegate: PoseDelegate,
    canvas?: HTMLCanvasElement,
  ): PoseLandmarkerOptions {
    return {
      baseOptions: {
        modelAssetPath: this.options.modelAssetPath,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: this.options.numPoses,
      minPoseDetectionConfidence: this.options.minPoseDetectionConfidence,
      minPosePresenceConfidence: this.options.minPosePresenceConfidence,
      minTrackingConfidence: this.options.minTrackingConfidence,
      outputSegmentationMasks: this.options.outputSegmentationMasks,
      ...(canvas ? { canvas } : {}),
    };
  }

  private throwIfClosedDuringInitialization(): void {
    if (this.statusValue.state === 'closed') {
      this.landmarker?.close();
      this.landmarker = null;
      this.gpuCanvas = null;
      throw new Error('Pose inference was closed during initialization.');
    }
  }

  private updateStatus(status: PoseInferenceStatus): void {
    this.statusValue = status;
    try {
      this.options.onStatusChange?.(status);
    } catch (error) {
      console.error('Pose inference status callback failed.', error);
    }
  }
}
