import type { CameraFrame, CameraFrameCallback } from './cameraTypes';

interface VideoFrameMetadataLike {
  mediaTime?: number;
  presentedFrames?: number;
}

type RequestVideoFrame = (
  callback: (now: number, metadata: VideoFrameMetadataLike) => void,
) => number;

interface OptionalVideoFrameCallbacks {
  requestVideoFrameCallback?: RequestVideoFrame;
  cancelVideoFrameCallback?: (handle: number) => void;
}

/**
 * Schedules work from decoded webcam frames. At most one callback is allowed to
 * be in flight; frames arriving while it is running are intentionally skipped.
 */
export class VideoFrameLoop {
  private readonly video: HTMLVideoElement;
  private readonly onFrame: CameraFrameCallback;
  private readonly onError?: (error: Error) => void;
  private videoFrameHandle: number | null = null;
  private animationFrameHandle: number | null = null;
  private running = false;
  private callbackBusy = false;
  private lastTimestampMs = Number.NEGATIVE_INFINITY;
  private lastFallbackMediaTime = Number.NEGATIVE_INFINITY;

  public constructor(
    video: HTMLVideoElement,
    onFrame: CameraFrameCallback,
    onError?: (error: Error) => void,
  ) {
    this.video = video;
    this.onFrame = onFrame;
    this.onError = onError;
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTimestampMs = Number.NEGATIVE_INFINITY;
    this.lastFallbackMediaTime = Number.NEGATIVE_INFINITY;
    this.scheduleNextFrame();
  }

  public stop(): void {
    this.running = false;

    if (this.videoFrameHandle !== null) {
      const videoCallbacks = this.video as unknown as OptionalVideoFrameCallbacks;
      videoCallbacks.cancelVideoFrameCallback?.(this.videoFrameHandle);
      this.videoFrameHandle = null;
    }
    if (this.animationFrameHandle !== null) {
      cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = null;
    }
  }

  private scheduleNextFrame(): void {
    if (!this.running) {
      return;
    }

    const requestVideoFrame = (this.video as unknown as OptionalVideoFrameCallbacks)
      .requestVideoFrameCallback;
    if (requestVideoFrame) {
      this.videoFrameHandle = requestVideoFrame.call(this.video, (now, metadata) => {
        this.videoFrameHandle = null;
        this.scheduleNextFrame();
        this.dispatchFrame(now, metadata);
      });
      return;
    }

    this.animationFrameHandle = requestAnimationFrame((now) => {
      this.animationFrameHandle = null;
      this.scheduleNextFrame();

      // RAF can run repeatedly for the same decoded video frame. Avoid sending
      // duplicate frames when currentTime has not advanced.
      const mediaTime = this.video.currentTime;
      if (mediaTime === this.lastFallbackMediaTime) {
        return;
      }
      this.lastFallbackMediaTime = mediaTime;
      this.dispatchFrame(now, { mediaTime });
    });
  }

  private dispatchFrame(requestedTimestampMs: number, metadata: VideoFrameMetadataLike): void {
    if (
      !this.running ||
      this.callbackBusy ||
      this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      this.video.videoWidth <= 0 ||
      this.video.videoHeight <= 0
    ) {
      return;
    }

    this.callbackBusy = true;
    const timestampMs =
      requestedTimestampMs > this.lastTimestampMs
        ? requestedTimestampMs
        : this.lastTimestampMs + 0.001;
    this.lastTimestampMs = timestampMs;

    const frame: CameraFrame = {
      video: this.video,
      timestampMs,
      ...(metadata.mediaTime !== undefined && Number.isFinite(metadata.mediaTime)
        ? { mediaTimeMs: metadata.mediaTime * 1000 }
        : {}),
      ...(metadata.presentedFrames !== undefined
        ? { presentedFrames: metadata.presentedFrames }
        : {}),
    };

    Promise.resolve(this.onFrame(frame))
      .catch((error: unknown) => {
        const normalizedError =
          error instanceof Error ? error : new Error('Webcam frame callback failed.');
        if (this.onError) {
          try {
            this.onError(normalizedError);
          } catch (callbackError) {
            console.error('Webcam frame error callback failed.', callbackError);
          }
        } else {
          console.error(normalizedError);
        }
      })
      .finally(() => {
        this.callbackBusy = false;
      });
  }
}

export function supportsVideoFrameCallback(video: HTMLVideoElement): boolean {
  return (
    typeof (video as unknown as OptionalVideoFrameCallbacks).requestVideoFrameCallback ===
    'function'
  );
}
