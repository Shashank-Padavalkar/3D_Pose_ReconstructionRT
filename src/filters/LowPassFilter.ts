import { clamp } from '../utils/clamp';

/** Stateful exponential low-pass filter used by the One Euro filter. */
export class LowPassFilter {
  private filteredValue: number | null = null;

  get initialized(): boolean {
    return this.filteredValue !== null;
  }

  get value(): number | null {
    return this.filteredValue;
  }

  filter(value: number, alpha: number): number {
    if (!Number.isFinite(value)) {
      return this.filteredValue ?? 0;
    }

    if (this.filteredValue === null) {
      this.filteredValue = value;
      return value;
    }

    const safeAlpha = clamp(Number.isFinite(alpha) ? alpha : 0, 0, 1);
    this.filteredValue = safeAlpha * value + (1 - safeAlpha) * this.filteredValue;
    return this.filteredValue;
  }

  reset(value?: number): void {
    this.filteredValue = value !== undefined && Number.isFinite(value) ? value : null;
  }
}

export function smoothingAlpha(cutoffHz: number, deltaSeconds: number): number {
  if (!(cutoffHz > 0) || !(deltaSeconds > 0)) return 1;
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / deltaSeconds);
}
