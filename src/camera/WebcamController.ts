import {
  CameraError,
  REQUESTED_CAMERA_FRAME_RATE,
  REQUESTED_CAMERA_HEIGHT,
  REQUESTED_CAMERA_WIDTH,
  createCameraConstraints,
  type CameraActualSettings,
  type CameraFrameCallback,
  type CameraStartResult,
  type CameraStatus,
  type WebcamControllerOptions,
} from './cameraTypes';
import { VideoFrameLoop } from './frameCapture';

export class WebcamController {
  private readonly options: WebcamControllerOptions;
  private statusValue: CameraStatus = {
    state: 'idle',
    message: 'Camera has not been started.',
    actualSettings: null,
  };
  private streamValue: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private frameLoop: VideoFrameLoop | null = null;
  private startupAbortController: AbortController | null = null;
  private operationId = 0;

  public constructor(options: WebcamControllerOptions = {}) {
    this.options = options;
  }

  public get status(): Readonly<CameraStatus> {
    return this.statusValue;
  }

  public get stream(): MediaStream | null {
    return this.streamValue;
  }

  public async start(video: HTMLVideoElement): Promise<CameraStartResult> {
    this.releaseMedia();
    const operationId = ++this.operationId;

    const hostname = typeof location === 'undefined' ? '' : location.hostname;
    const isLocalHost =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (globalThis.isSecureContext === false && !isLocalHost) {
      const error = new CameraError(
        'insecure-context',
        'Camera access requires HTTPS or localhost.',
      );
      this.setErrorStatus(error);
      throw error;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new CameraError(
        'unsupported',
        'This browser does not support webcam capture with getUserMedia.',
      );
      this.setErrorStatus(error);
      throw error;
    }

    const startupAbortController = new AbortController();
    this.startupAbortController = startupAbortController;

    this.updateStatus({
      state: 'requesting',
      message: 'Waiting for camera permission…',
      actualSettings: null,
    });

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(createCameraConstraints());
      if (operationId !== this.operationId) {
        stopAllTracks(stream);
        throw new CameraError('aborted', 'Camera start was cancelled.');
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new CameraError('no-camera', 'The camera stream did not contain a video track.');
      }

      this.streamValue = stream;
      this.videoTrack = videoTrack;
      this.video = video;
      videoTrack.addEventListener('ended', this.handleTrackEnded);

      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = stream;
      await waitForVideoMetadata(video, startupAbortController.signal);
      if (operationId !== this.operationId) {
        throw new CameraError('aborted', 'Camera start was cancelled.');
      }

      try {
        await video.play();
      } catch (error) {
        throw new CameraError(
          'playback-failed',
          'The camera opened, but the browser could not start video playback.',
          error,
        );
      }
      if (operationId !== this.operationId) {
        throw new CameraError('aborted', 'Camera start was cancelled.');
      }

      const actual = readActualSettings(videoTrack, video);
      this.startupAbortController = null;
      this.updateStatus({
        state: 'active',
        message: describeActiveCamera(actual),
        actualSettings: actual,
      });

      return {
        stream,
        requested: {
          width: REQUESTED_CAMERA_WIDTH,
          height: REQUESTED_CAMERA_HEIGHT,
          frameRate: REQUESTED_CAMERA_FRAME_RATE,
          facingMode: 'user',
        },
        actual,
      };
    } catch (error) {
      if (this.startupAbortController === startupAbortController) {
        this.startupAbortController = null;
      }
      if (operationId === this.operationId) {
        this.releaseMedia();
      } else if (stream && stream !== this.streamValue) {
        // A newer start() call owns the controller now. Release only the stale
        // stream from this attempt; never tear down the newer camera session.
        stopAllTracks(stream);
      }
      const cameraError = normalizeCameraError(error);
      if (cameraError.code !== 'aborted' && operationId === this.operationId) {
        this.setErrorStatus(cameraError);
      }
      throw cameraError;
    }
  }

  public stop(): void {
    ++this.operationId;
    this.releaseMedia();
    this.updateStatus({
      state: 'stopped',
      message: 'Camera is stopped and all media tracks were released.',
      actualSettings: null,
    });
  }

  public startFrameLoop(callback: CameraFrameCallback): void {
    if (this.statusValue.state !== 'active' || !this.video) {
      throw new CameraError('not-started', 'Start the camera before starting its frame loop.');
    }

    this.stopFrameLoop();
    this.frameLoop = new VideoFrameLoop(this.video, callback, this.options.onFrameError);
    this.frameLoop.start();
  }

  public stopFrameLoop(): void {
    this.frameLoop?.stop();
    this.frameLoop = null;
  }

  public dispose(): void {
    this.stop();
  }

  private readonly handleTrackEnded = (): void => {
    ++this.operationId;
    const previousSettings = this.statusValue.actualSettings;
    this.releaseMedia();
    this.updateStatus({
      state: 'disconnected',
      message: 'The camera disconnected while it was in use.',
      actualSettings: previousSettings,
    });
  };

  private releaseMedia(): void {
    this.startupAbortController?.abort();
    this.startupAbortController = null;
    this.stopFrameLoop();

    if (this.videoTrack) {
      this.videoTrack.removeEventListener('ended', this.handleTrackEnded);
    }
    if (this.streamValue) {
      stopAllTracks(this.streamValue);
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }

    this.videoTrack = null;
    this.streamValue = null;
    this.video = null;
  }

  private setErrorStatus(error: CameraError): void {
    console.error(`Camera error (${error.code}): ${error.message}`, error.originalError);
    this.updateStatus({
      state: 'error',
      message: error.message,
      actualSettings: null,
    });
  }

  private updateStatus(status: CameraStatus): void {
    this.statusValue = status;
    try {
      this.options.onStatusChange?.(status);
    } catch (error) {
      console.error('Camera status callback failed.', error);
    }
  }
}

function readActualSettings(
  track: MediaStreamTrack,
  video: HTMLVideoElement,
): CameraActualSettings {
  const settings = track.getSettings();
  return {
    ...(settings.width !== undefined || video.videoWidth > 0
      ? { width: settings.width ?? video.videoWidth }
      : {}),
    ...(settings.height !== undefined || video.videoHeight > 0
      ? { height: settings.height ?? video.videoHeight }
      : {}),
    ...(settings.frameRate !== undefined ? { frameRate: settings.frameRate } : {}),
    ...(settings.facingMode ? { facingMode: settings.facingMode } : {}),
    ...(settings.deviceId ? { deviceId: settings.deviceId } : {}),
    ...(track.label ? { label: track.label } : {}),
  };
}

function describeActiveCamera(settings: CameraActualSettings): string {
  const resolution =
    settings.width !== undefined && settings.height !== undefined
      ? `${settings.width}×${settings.height}`
      : 'unknown resolution';
  const frameRate =
    settings.frameRate !== undefined ? ` at ${settings.frameRate.toFixed(1)} FPS` : '';
  return `Camera active: ${resolution}${frameRate}.`;
}

function stopAllTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function waitForVideoMetadata(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }
  if (signal.aborted) {
    return Promise.reject(new CameraError('aborted', 'Camera start was cancelled.'));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new CameraError('camera-unavailable', 'Timed out while waiting for camera video metadata.'),
      );
    }, 10_000);

    const handleLoaded = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(
        new CameraError(
          'camera-unavailable',
          'The browser could not read video from the selected camera.',
        ),
      );
    };
    const handleAbort = (): void => {
      cleanup();
      reject(new CameraError('aborted', 'Camera start was cancelled.'));
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', handleLoaded);
      video.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };

    video.addEventListener('loadedmetadata', handleLoaded, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

function normalizeCameraError(error: unknown): CameraError {
  if (error instanceof CameraError) {
    return error;
  }

  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new CameraError(
        'permission-denied',
        'Camera permission was denied. Allow camera access and try again.',
        error,
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError(
        'no-camera',
        'No camera was found. Connect a webcam and try again.',
        error,
      );
    case 'NotReadableError':
    case 'TrackStartError':
      return new CameraError(
        'camera-unavailable',
        'The camera is unavailable or is already in use by another application.',
        error,
      );
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new CameraError(
        'constraints-unsatisfied',
        'The camera could not satisfy the requested capture settings.',
        error,
      );
    case 'AbortError':
      return new CameraError('aborted', 'Camera startup was interrupted. Please try again.', error);
    default:
      return new CameraError(
        'unknown',
        'The camera could not be started. Check browser permissions and try again.',
        error,
      );
  }
}
