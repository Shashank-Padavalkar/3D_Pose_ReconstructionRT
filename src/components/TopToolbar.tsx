import type { ChangeEvent } from 'react';
import type { DisplayMode, PoseViewMode, RootMode } from '../app/constants';

interface TopToolbarProps {
  cameraActive: boolean;
  cameraBusy: boolean;
  calibrated: boolean;
  recording: boolean;
  hasRecording: boolean;
  playing: boolean;
  mirrored: boolean;
  displayMode: DisplayMode;
  poseViewMode: PoseViewMode;
  rootMode: RootMode;
  settingsOpen: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onCalibrate: () => void;
  onResetCalibration: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearRecording: () => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onScreenshot: () => void;
  onMirroredChange: (value: boolean) => void;
  onDisplayModeChange: (value: DisplayMode) => void;
  onPoseViewModeChange: (value: PoseViewMode) => void;
  onRootModeChange: (value: RootMode) => void;
  onSettingsToggle: () => void;
}

export function TopToolbar(props: TopToolbarProps) {
  return (
    <header className="top-toolbar" aria-label="Pose reconstruction controls">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">
          LP
        </span>
        <div>
          <strong>Local Pose Lab</strong>
          <span>Realtime reconstruction</span>
        </div>
      </div>

      <div className="toolbar-groups">
        <div className="control-group" aria-label="Camera controls">
          <button
            type="button"
            className="button-primary"
            disabled={props.cameraActive || props.cameraBusy}
            onClick={props.onStartCamera}
          >
            {props.cameraBusy ? 'Starting…' : 'Start camera'}
          </button>
          <button type="button" disabled={!props.cameraActive} onClick={props.onStopCamera}>
            Stop
          </button>
          <button type="button" disabled={!props.cameraActive} onClick={props.onCalibrate}>
            {props.calibrated ? 'Recalibrate' : 'Calibrate'}
          </button>
          {props.calibrated && (
            <button type="button" onClick={props.onResetCalibration} title="Delete calibration">
              Reset calibration
            </button>
          )}
        </div>

        <div className="control-group" aria-label="Recording controls">
          {!props.recording ? (
            <button type="button" disabled={!props.cameraActive} onClick={props.onStartRecording}>
              <span className="record-dot" aria-hidden="true" /> Record
            </button>
          ) : (
            <button type="button" className="recording-button" onClick={props.onStopRecording}>
              Stop recording
            </button>
          )}
          {!props.playing ? (
            <button type="button" disabled={!props.hasRecording} onClick={props.onPlay}>
              Play
            </button>
          ) : (
            <button type="button" onClick={props.onPause}>
              Pause
            </button>
          )}
          <button type="button" disabled={!props.hasRecording} onClick={props.onClearRecording}>
            Clear
          </button>
        </div>

        <div className="control-group compact-controls" aria-label="Display controls">
          <label>
            Model
            <select
              value={props.displayMode}
              onChange={(event) => props.onDisplayModeChange(event.target.value as DisplayMode)}
            >
              <option value="skeleton">Skeleton</option>
              <option value="mannequin">Mannequin</option>
              <option value="overlay">Mannequin + skeleton</option>
            </select>
          </label>
          <label>
            Pose
            <select
              value={props.poseViewMode}
              onChange={(event) => props.onPoseViewModeChange(event.target.value as PoseViewMode)}
            >
              <option value="raw">Raw</option>
              <option value="filtered">Filtered</option>
              <option value="constrained">Constrained</option>
            </select>
          </label>
          <label>
            Root
            <select
              value={props.rootMode}
              onChange={(event) => props.onRootModeChange(event.target.value as RootMode)}
            >
              <option value="anchored">Anchored</option>
              <option value="approximate">Approx. motion</option>
            </select>
          </label>
        </div>

        <div className="control-group" aria-label="File and application controls">
          <label className="button-like">
            Import JSON
            <input type="file" accept="application/json,.json" onChange={props.onImport} />
          </label>
          <button type="button" disabled={!props.hasRecording} onClick={props.onExport}>
            Export JSON
          </button>
          <button type="button" onClick={props.onScreenshot}>
            Screenshot
          </button>
          <button type="button" onClick={props.onReset}>
            Reset
          </button>
          <button
            type="button"
            aria-pressed={props.mirrored}
            onClick={() => props.onMirroredChange(!props.mirrored)}
          >
            Mirror {props.mirrored ? 'on' : 'off'}
          </button>
          <button
            type="button"
            aria-expanded={props.settingsOpen}
            aria-controls="settings-panel"
            className={props.settingsOpen ? 'button-selected' : ''}
            onClick={props.onSettingsToggle}
          >
            Settings
          </button>
        </div>
      </div>
    </header>
  );
}
