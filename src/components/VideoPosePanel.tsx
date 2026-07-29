import type { RefObject } from 'react';
import { TrackingWarning } from './TrackingWarning';

interface VideoPosePanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mirrored: boolean;
  cameraActive: boolean;
  actualResolution: string;
  actualFrameRate: number | null;
  warning: string | null;
}

export function VideoPosePanel({
  videoRef,
  canvasRef,
  mirrored,
  cameraActive,
  actualResolution,
  actualFrameRate,
  warning,
}: VideoPosePanelProps) {
  return (
    <section className="viewer-panel video-panel" aria-label="Webcam with 2D pose overlay">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Camera input</p>
          <h2>Live pose</h2>
        </div>
        <span className={`panel-chip ${cameraActive ? 'healthy' : ''}`}>
          {cameraActive
            ? `${actualResolution}${actualFrameRate ? ` · ${actualFrameRate.toFixed(0)} fps` : ''}`
            : 'Camera off'}
        </span>
      </div>
      <div className="video-stage">
        <video
          ref={videoRef}
          className={mirrored ? 'mirrored' : ''}
          autoPlay
          muted
          playsInline
          aria-label="Live webcam feed"
        />
        <canvas ref={canvasRef} aria-label="2D pose landmarks" />
        {!cameraActive && (
          <div className="empty-stage">
            <div className="camera-glyph" aria-hidden="true" />
            <strong>Camera is paused</strong>
            <span>Start the camera to estimate a pose locally.</span>
          </div>
        )}
        <TrackingWarning message={warning} />
      </div>
    </section>
  );
}
