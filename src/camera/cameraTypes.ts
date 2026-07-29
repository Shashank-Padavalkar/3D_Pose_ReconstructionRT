export const REQUESTED_CAMERA_WIDTH = 1280;
export const REQUESTED_CAMERA_HEIGHT = 720;
export const REQUESTED_CAMERA_FRAME_RATE = 60;

export type CameraState = 'idle' | 'requesting' | 'active' | 'stopped' | 'disconnected' | 'error';

export type CameraErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-unavailable'
  | 'constraints-unsatisfied'
  | 'playback-failed'
  | 'not-started'
  | 'aborted'
  | 'unknown';

export interface CameraActualSettings {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: string;
  deviceId?: string;
  label?: string;
}

export interface CameraStatus {
  state: CameraState;
  message: string;
  actualSettings: CameraActualSettings | null;
}

export interface CameraStartResult {
  stream: MediaStream;
  requested: {
    width: number;
    height: number;
    frameRate: number;
    facingMode: 'user';
  };
  actual: CameraActualSettings;
}

export interface CameraFrame {
  /** The live, unmirrored inference source. */
  video: HTMLVideoElement;
  /** Monotonic milliseconds suitable for MediaPipe VIDEO mode. */
  timestampMs: number;
  mediaTimeMs?: number;
  presentedFrames?: number;
}

export type CameraFrameCallback = (frame: Readonly<CameraFrame>) => void | Promise<void>;

export interface WebcamControllerOptions {
  onStatusChange?: (status: Readonly<CameraStatus>) => void;
  onFrameError?: (error: Error) => void;
}

export class CameraError extends Error {
  public readonly code: CameraErrorCode;
  public readonly originalError?: unknown;

  public constructor(code: CameraErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
    this.originalError = originalError;
  }
}

export function createCameraConstraints(): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      width: { ideal: REQUESTED_CAMERA_WIDTH },
      height: { ideal: REQUESTED_CAMERA_HEIGHT },
      frameRate: { ideal: REQUESTED_CAMERA_FRAME_RATE },
      facingMode: { ideal: 'user' },
    },
  };
}
