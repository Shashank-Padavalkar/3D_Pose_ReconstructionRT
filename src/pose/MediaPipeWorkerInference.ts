import {
  closeImageBitmap,
  errorMessage,
  isImageBitmap,
  resolvePoseInferenceOptions,
  type PoseFrameSource,
  type PoseInference,
  type PoseInferenceOptions,
  type PoseInferenceStatus,
} from './PoseInference';
import { MediaPipeMainThreadInference } from './MediaPipeMainThreadInference';
import type { PoseInferenceResult } from './poseTypes';
import {
  toWorkerInitializationOptions,
  type PoseWorkerRequest,
  type PoseWorkerResponse,
} from '../workers/workerMessages';

interface PendingWorkerRequest {
  resolve: (response: PoseWorkerResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Worker-first PoseInference implementation. It owns every ImageBitmap passed
 * to infer(), drops frames while busy, and changes to the main-thread
 * implementation if the worker cannot initialize or fails at runtime.
 */
export class MediaPipeWorkerInference implements PoseInference {
  private readonly options: PoseInferenceOptions;
  private statusValue: PoseInferenceStatus;
  private worker: Worker | null = null;
  private mainThread: MediaPipeMainThreadInference | null = null;
  private initializePromise: Promise<Readonly<PoseInferenceStatus>> | null = null;
  private fallbackPromise: Promise<MediaPipeMainThreadInference> | null = null;
  private readonly pendingRequests = new Map<number, PendingWorkerRequest>();
  private nextRequestId = 1;
  private busy = false;

  public constructor(options: Partial<PoseInferenceOptions> = {}) {
    this.options = resolvePoseInferenceOptions(options);
    this.statusValue = {
      state: 'idle',
      mode: this.options.preferWorker ? 'worker' : 'main-thread',
      delegate: null,
      message: 'Pose inference has not been initialized.',
    };
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

    this.initializePromise = this.initializeInternal().finally(() => {
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  public async infer(
    frame: PoseFrameSource,
    timestampMs: number,
  ): Promise<PoseInferenceResult | null> {
    if (this.busy) {
      closeImageBitmap(frame);
      return null;
    }

    this.busy = true;
    let transferableFrame: ImageBitmap | null = null;
    try {
      if (this.statusValue.state !== 'ready') {
        await this.initialize();
      }

      if (this.mainThread) {
        return await this.mainThread.infer(frame, timestampMs);
      }
      if (!this.worker) {
        const fallback = await this.activateMainThread(new Error('Pose worker is unavailable.'));
        return await fallback.infer(frame, timestampMs);
      }

      if (isImageBitmap(frame)) {
        transferableFrame = frame;
      } else {
        if (typeof createImageBitmap === 'undefined') {
          const fallback = await this.activateMainThread(
            new Error('createImageBitmap is unavailable in this browser.'),
          );
          return await fallback.infer(frame, timestampMs);
        }
        transferableFrame = await createImageBitmap(frame);
      }

      const requestId = this.nextRequestId++;
      const response = await this.sendRequest(
        {
          type: 'process-frame',
          requestId,
          frame: transferableFrame,
          timestampMs,
        },
        [transferableFrame],
        this.options.inferenceTimeoutMs,
      );

      if (response.type === 'error') {
        throw new Error(`Pose worker inference failed: ${response.message}`);
      }
      if (response.type !== 'result') {
        throw new Error(`Unexpected pose worker response: ${response.type}`);
      }
      return response.result;
    } catch (error) {
      console.error('Pose worker failed at runtime; switching to main-thread inference.', error);
      closeImageBitmap(transferableFrame ?? frame);
      const fallback = await this.activateMainThread(error);

      // A transferred ImageBitmap is detached and cannot be reused. A video
      // element is still live, so the fallback can process the current frame.
      if (!isImageBitmap(frame)) {
        return await fallback.infer(frame, timestampMs);
      }
      return null;
    } finally {
      this.busy = false;
    }
  }

  public close(): void {
    this.dispose();
  }

  public dispose(): void {
    if (this.statusValue.state === 'closed') {
      return;
    }

    this.mainThread?.dispose();
    this.mainThread = null;
    this.terminateWorker(new Error('Pose inference was closed.'));
    this.busy = false;
    this.updateStatus({
      state: 'closed',
      mode: this.statusValue.mode,
      delegate: null,
      message: 'Pose inference is closed.',
    });
  }

  private async initializeInternal(): Promise<Readonly<PoseInferenceStatus>> {
    if (!this.options.preferWorker) {
      await this.activateMainThread(new Error('Worker inference was disabled by configuration.'));
      return this.statusValue;
    }

    const unsupportedReason = workerUnsupportedReason();
    if (unsupportedReason) {
      await this.activateMainThread(new Error(unsupportedReason));
      return this.statusValue;
    }

    this.updateStatus({
      state: 'initializing',
      mode: 'worker',
      delegate: null,
      message: 'Loading MediaPipe Pose Landmarker in a worker…',
    });

    try {
      this.createWorker();
      const requestId = this.nextRequestId++;
      const response = await this.sendRequest(
        {
          type: 'initialize',
          requestId,
          options: toWorkerInitializationOptions(this.options),
        },
        [],
        this.options.initializationTimeoutMs,
      );

      if (response.type === 'error') {
        throw new Error(response.message);
      }
      if (response.type !== 'ready') {
        throw new Error(`Unexpected pose worker response: ${response.type}`);
      }

      this.updateStatus({
        state: 'ready',
        mode: 'worker',
        delegate: response.delegate,
        message: `Pose inference is ready in a worker using ${response.delegate}.`,
        ...(response.gpuFallbackReason ? { fallbackReason: response.gpuFallbackReason } : {}),
      });
      return this.statusValue;
    } catch (error) {
      console.warn('Worker pose initialization failed; using main-thread inference.', error);
      await this.activateMainThread(error);
      return this.statusValue;
    }
  }

  private createWorker(): void {
    this.terminateWorker(new Error('Replacing the pose worker.'));
    const worker = new Worker(new URL('../workers/pose.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pose-inference',
    });
    worker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
      this.resolveWorkerResponse(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.handleWorkerFailure(new Error(event.message || 'The pose worker crashed.'));
    };
    worker.onmessageerror = () => {
      this.handleWorkerFailure(new Error('The pose worker returned an unreadable message.'));
    };
    this.worker = worker;
  }

  private sendRequest(
    request: Exclude<PoseWorkerRequest, { type: 'close' }>,
    transfer: Transferable[],
    timeoutMs: number,
  ): Promise<PoseWorkerResponse> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error('Pose worker is not running.'));
    }

    return new Promise<PoseWorkerResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject(new Error(`${request.type} timed out after ${Math.round(timeoutMs)} ms.`));
      }, timeoutMs);

      this.pendingRequests.set(request.requestId, {
        resolve,
        reject,
        timeout,
      });

      try {
        worker.postMessage(request, transfer);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.requestId);
        reject(new Error(`Could not message pose worker: ${errorMessage(error)}`));
      }
    });
  }

  private resolveWorkerResponse(response: PoseWorkerResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.requestId);
    pending.resolve(response);
  }

  private handleWorkerFailure(error: Error): void {
    if (this.statusValue.state === 'closed') {
      return;
    }
    console.error('Pose worker error.', error);
    this.terminateWorker(error);
    void this.activateMainThread(error).catch((fallbackError: unknown) => {
      console.error('Main-thread pose fallback failed.', fallbackError);
    });
  }

  private activateMainThread(reason: unknown): Promise<MediaPipeMainThreadInference> {
    if (this.mainThread && this.mainThread.status.state === 'ready') {
      return Promise.resolve(this.mainThread);
    }
    if (this.fallbackPromise) {
      return this.fallbackPromise;
    }
    if (this.statusValue.state === 'closed') {
      return Promise.reject(new Error('Pose inference is closed.'));
    }

    const fallbackReason = errorMessage(reason);
    this.terminateWorker(new Error(fallbackReason));
    this.updateStatus({
      state: 'initializing',
      mode: 'main-thread',
      delegate: null,
      message: 'Starting main-thread pose inference fallback…',
      fallbackReason,
    });

    const fallback = new MediaPipeMainThreadInference({
      ...this.options,
      preferWorker: false,
      onStatusChange: undefined,
    });
    this.fallbackPromise = fallback
      .initialize()
      .then(() => {
        if (this.statusValue.state === 'closed') {
          fallback.dispose();
          throw new Error('Pose inference was closed during initialization.');
        }
        this.mainThread = fallback;
        this.updateStatus({
          state: 'ready',
          mode: 'main-thread',
          delegate: fallback.status.delegate,
          message:
            `Pose inference is ready on the main thread using ` +
            `${fallback.status.delegate ?? 'CPU'}.`,
          fallbackReason,
        });
        return fallback;
      })
      .catch((error: unknown) => {
        fallback.dispose();
        if (this.statusValue.state === 'closed') {
          throw new Error('Pose inference was closed during initialization.', {
            cause: error,
          });
        }
        const message =
          `Worker and main-thread pose inference both failed. ` + `${errorMessage(error)}`;
        this.updateStatus({
          state: 'error',
          mode: 'main-thread',
          delegate: null,
          message,
          fallbackReason,
        });
        throw new Error(message);
      })
      .finally(() => {
        this.fallbackPromise = null;
      });

    return this.fallbackPromise;
  }

  private terminateWorker(error: Error): void {
    this.worker?.terminate();
    this.worker = null;

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
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

function workerUnsupportedReason(): string | null {
  if (typeof Worker === 'undefined') {
    return 'Web Workers are unavailable in this browser.';
  }
  if (typeof createImageBitmap === 'undefined') {
    return 'createImageBitmap is unavailable in this browser.';
  }
  return null;
}
