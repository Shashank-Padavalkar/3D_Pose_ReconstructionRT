import { clamp } from '../utils/clamp';
import { LowPassFilter, smoothingAlpha } from './LowPassFilter';

export interface OneEuroFilterOptions {
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
  /** Multiplier applied to minCutoff for medium-confidence observations. */
  mediumConfidenceCutoffScale: number;
}

export const DEFAULT_ONE_EURO_OPTIONS: Readonly<OneEuroFilterOptions> = Object.freeze({
  minCutoff: 1,
  beta: 0.06,
  derivativeCutoff: 1,
  mediumConfidenceCutoffScale: 0.55,
});

/**
 * Standard One Euro adaptive low-pass filter.
 * Timestamps are expressed in milliseconds to match requestVideoFrameCallback.
 */
export class OneEuroFilter {
  private readonly signal = new LowPassFilter();
  private readonly derivative = new LowPassFilter();
  private previousRaw: number | null = null;
  private previousTimestampMs: number | null = null;
  private readonly options: OneEuroFilterOptions;

  constructor(options: Partial<OneEuroFilterOptions> = {}) {
    this.options = sanitizeOptions({ ...DEFAULT_ONE_EURO_OPTIONS, ...options });
  }

  filter(value: number, timestampMs: number, confidence = 1): number {
    if (!Number.isFinite(value)) return this.signal.value ?? 0;

    if (this.previousTimestampMs === null || this.previousRaw === null) {
      this.previousTimestampMs = timestampMs;
      this.previousRaw = value;
      this.derivative.reset(0);
      return this.signal.filter(value, 1);
    }

    const elapsedMs = timestampMs - this.previousTimestampMs;
    if (!(elapsedMs > 0) || !Number.isFinite(elapsedMs)) {
      return this.signal.value ?? value;
    }

    // Very long gaps should not create a misleading derivative or a slow catch-up.
    const deltaSeconds = clamp(elapsedMs / 1000, 1 / 1000, 0.25);
    const rawDerivative = (value - this.previousRaw) / deltaSeconds;
    const filteredDerivative = this.derivative.filter(
      rawDerivative,
      smoothingAlpha(this.options.derivativeCutoff, deltaSeconds),
    );

    const confidenceScale = confidence >= 0.65 ? 1 : this.options.mediumConfidenceCutoffScale;
    const adaptiveCutoff =
      this.options.minCutoff * confidenceScale +
      this.options.beta * confidenceScale * Math.abs(filteredDerivative);
    const result = this.signal.filter(value, smoothingAlpha(adaptiveCutoff, deltaSeconds));

    this.previousRaw = value;
    this.previousTimestampMs = timestampMs;
    return result;
  }

  reset(value?: number, timestampMs?: number): void {
    this.signal.reset(value);
    this.derivative.reset(value === undefined ? undefined : 0);
    this.previousRaw = value !== undefined && Number.isFinite(value) ? value : null;
    this.previousTimestampMs = this.previousRaw === null ? null : (timestampMs ?? null);
  }
}

function sanitizeOptions(options: OneEuroFilterOptions): OneEuroFilterOptions {
  return {
    minCutoff: options.minCutoff > 0 ? options.minCutoff : DEFAULT_ONE_EURO_OPTIONS.minCutoff,
    beta: options.beta >= 0 ? options.beta : DEFAULT_ONE_EURO_OPTIONS.beta,
    derivativeCutoff:
      options.derivativeCutoff > 0
        ? options.derivativeCutoff
        : DEFAULT_ONE_EURO_OPTIONS.derivativeCutoff,
    mediumConfidenceCutoffScale: clamp(options.mediumConfidenceCutoffScale, 0.05, 1),
  };
}
