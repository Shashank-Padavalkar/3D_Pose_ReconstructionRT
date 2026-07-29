import type { PoseMetrics } from '../pose/poseTypes';

interface MetricDefinition {
  key: keyof PoseMetrics;
  label: string;
  unit: string;
  decimals: number;
  tooltip: string;
}

const METRICS: readonly MetricDefinition[] = [
  {
    key: 'pelvisYawDeg',
    label: 'Pelvis rotation',
    unit: '°',
    decimals: 1,
    tooltip: 'Approximate pelvis yaw relative to the calibrated neutral frame.',
  },
  {
    key: 'chestYawDeg',
    label: 'Chest rotation',
    unit: '°',
    decimals: 1,
    tooltip: 'Approximate shoulder-frame yaw relative to calibration.',
  },
  {
    key: 'xFactorDeg',
    label: 'X-factor',
    unit: '°',
    decimals: 1,
    tooltip: 'Approximate chest yaw minus pelvis yaw.',
  },
  {
    key: 'leftKneeFlexionDeg',
    label: 'Left knee',
    unit: '°',
    decimals: 0,
    tooltip: 'Angle formed by the left hip, knee, and ankle.',
  },
  {
    key: 'rightKneeFlexionDeg',
    label: 'Right knee',
    unit: '°',
    decimals: 0,
    tooltip: 'Angle formed by the right hip, knee, and ankle.',
  },
  {
    key: 'leftElbowFlexionDeg',
    label: 'Left elbow',
    unit: '°',
    decimals: 0,
    tooltip: 'Angle formed by the left shoulder, elbow, and wrist.',
  },
  {
    key: 'rightElbowFlexionDeg',
    label: 'Right elbow',
    unit: '°',
    decimals: 0,
    tooltip: 'Angle formed by the right shoulder, elbow, and wrist.',
  },
  {
    key: 'headSwayBodyWidths',
    label: 'Head sway',
    unit: ' body widths',
    decimals: 2,
    tooltip: 'Horizontal head displacement divided by calibrated shoulder width.',
  },
  {
    key: 'pelvisSwayBodyWidths',
    label: 'Pelvis sway',
    unit: ' body widths',
    decimals: 2,
    tooltip: 'Camera-relative pelvis displacement divided by calibrated shoulder width.',
  },
  {
    key: 'shoulderTiltDeg',
    label: 'Shoulder tilt',
    unit: '°',
    decimals: 1,
    tooltip: 'Shoulder-line angle relative to the horizontal image axis.',
  },
  {
    key: 'pelvisTiltDeg',
    label: 'Pelvis tilt',
    unit: '°',
    decimals: 1,
    tooltip: 'Hip-line angle relative to the horizontal image axis.',
  },
] as const;

interface MetricsPanelProps {
  metrics: PoseMetrics;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <section className="metrics-panel" aria-label="Approximate pose measurements">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Live measurements</p>
          <h2>Approximate biomechanics</h2>
        </div>
        <span className="approximate-badge">Approximate</span>
      </div>
      <div className="metric-grid">
        {METRICS.map((definition) => {
          const value = metrics[definition.key];
          return (
            <article
              className={`metric-card ${value === null ? 'metric-invalid' : ''}`}
              key={definition.key}
              title={definition.tooltip}
            >
              <div>
                <span>{definition.label}</span>
                <button
                  type="button"
                  className="info-button"
                  aria-label={`How ${definition.label} is calculated`}
                >
                  i
                </button>
              </div>
              <strong>
                {value === null ? '—' : value.toFixed(definition.decimals)}
                <small>{value === null ? '' : definition.unit}</small>
              </strong>
              <span className="metric-validity">{value === null ? 'Not tracked' : 'Tracking'}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
