export type CalibrationStage = 'idle' | 'countdown' | 'collecting' | 'complete' | 'failed';

interface CalibrationOverlayProps {
  stage: CalibrationStage;
  countdown: number;
  sampleCount: number;
  targetSamples: number;
  message: string | null;
  onCancel: () => void;
}

export function CalibrationOverlay(props: CalibrationOverlayProps) {
  if (props.stage === 'idle' || props.stage === 'complete') return null;
  const progress = Math.min(100, (props.sampleCount / Math.max(1, props.targetSamples)) * 100);
  return (
    <div
      className="calibration-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Body calibration"
    >
      <div className="calibration-card">
        <p className="eyebrow">Body proportion calibration</p>
        {props.stage === 'countdown' ? (
          <>
            <strong className="countdown-number">{props.countdown}</strong>
            <h2>Stand fully visible and face the camera</h2>
            <p>Adopt a neutral upright pose with arms relaxed and both feet visible.</p>
          </>
        ) : (
          <>
            <div className="calibration-pulse" aria-hidden="true" />
            <h2>{props.stage === 'failed' ? 'Calibration needs another try' : 'Hold still'}</h2>
            <p>{props.message ?? 'Collecting stable, high-confidence samples…'}</p>
            <div
              className="calibration-progress"
              aria-label={`${Math.round(progress)} percent complete`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <strong>
              {props.sampleCount} / {props.targetSamples} valid frames
            </strong>
          </>
        )}
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
