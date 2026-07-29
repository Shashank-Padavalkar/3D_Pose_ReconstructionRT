import { formatDuration } from '../utils/time';

interface TimelineProps {
  hasRecording: boolean;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  frameIndex: number;
  frameCount: number;
  speed: number;
  loop: boolean;
  recording: boolean;
  recordingDurationMs: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionMs: number) => void;
  onSpeed: (speed: number) => void;
  onLoop: (loop: boolean) => void;
}

export function Timeline(props: TimelineProps) {
  const timelineMax = Math.max(1, props.durationMs);
  return (
    <section className="timeline" aria-label="Pose recording timeline">
      <div className="timeline-controls">
        {!props.playing ? (
          <button
            type="button"
            disabled={!props.hasRecording}
            onClick={props.onPlay}
            aria-label="Play recording"
          >
            ▶
          </button>
        ) : (
          <button type="button" onClick={props.onPause} aria-label="Pause recording">
            Ⅱ
          </button>
        )}
        <label>
          Speed
          <select
            value={props.speed}
            onChange={(event) => props.onSpeed(Number(event.target.value))}
          >
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <label className="loop-control">
          <input
            type="checkbox"
            checked={props.loop}
            onChange={(event) => props.onLoop(event.target.checked)}
          />
          Loop
        </label>
      </div>

      <div className="timeline-track">
        <div className="timeline-readout">
          <span>{formatDuration(props.positionMs)}</span>
          <span>{formatDuration(props.durationMs)}</span>
        </div>
        <input
          type="range"
          min="0"
          max={timelineMax}
          step="1"
          value={Math.min(props.positionMs, timelineMax)}
          disabled={!props.hasRecording}
          onChange={(event) => props.onSeek(Number(event.target.value))}
          aria-label="Seek through pose recording"
        />
      </div>

      <div className="timeline-meta">
        {props.recording ? (
          <strong className="recording-state">
            <span className="record-dot" /> Recording {formatDuration(props.recordingDurationMs)}
          </strong>
        ) : (
          <span>{props.hasRecording ? 'Playback ready' : 'No recording'}</span>
        )}
        <span>
          Frame {props.hasRecording ? props.frameIndex + 1 : 0} / {props.frameCount}
        </span>
      </div>
    </section>
  );
}
