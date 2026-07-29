import type { RefObject } from 'react';
import type { CameraPreset } from '../app/constants';

interface ThreePosePanelProps {
  containerRef: RefObject<HTMLDivElement | null>;
  activePreset: CameraPreset;
  gridVisible: boolean;
  axesVisible: boolean;
  labelsVisible: boolean;
  webglError: string | null;
  onPreset: (preset: CameraPreset) => void;
  onResetCamera: () => void;
  onGridToggle: () => void;
  onAxesToggle: () => void;
  onLabelsToggle: () => void;
}

const PRESETS: readonly { value: CameraPreset; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'perspective', label: 'Perspective' },
];

export function ThreePosePanel({
  containerRef,
  activePreset,
  gridVisible,
  axesVisible,
  labelsVisible,
  webglError,
  onPreset,
  onResetCamera,
  onGridToggle,
  onAxesToggle,
  onLabelsToggle,
}: ThreePosePanelProps) {
  return (
    <section className="viewer-panel three-panel" aria-label="Interactive 3D reconstruction">
      <div className="panel-heading three-heading">
        <div>
          <p className="eyebrow">Reconstruction</p>
          <h2>Interactive 3D</h2>
        </div>
        <div className="scene-toggles">
          <button type="button" aria-pressed={gridVisible} onClick={onGridToggle}>
            Grid
          </button>
          <button type="button" aria-pressed={axesVisible} onClick={onAxesToggle}>
            Axes
          </button>
          <button type="button" aria-pressed={labelsVisible} onClick={onLabelsToggle}>
            Labels
          </button>
        </div>
      </div>
      <div className="three-stage" ref={containerRef}>
        {webglError && (
          <div className="empty-stage error-stage" role="alert">
            <strong>3D view unavailable</strong>
            <span>{webglError}</span>
          </div>
        )}
        <div className="orientation-cue" aria-hidden="true">
          <span>Y</span>
          <span>X</span>
          <span>Z</span>
        </div>
      </div>
      <nav className="camera-presets" aria-label="3D camera presets">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.value}
            className={activePreset === preset.value ? 'button-selected' : ''}
            onClick={() => onPreset(preset.value)}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" onClick={onResetCamera}>
          Reset camera
        </button>
      </nav>
    </section>
  );
}
