import type {
  PoseLandmark,
  PoseMetrics,
  ProcessedPoseFrame,
  QuaternionData,
  Vec3Data,
} from '../pose/poseTypes';
import { clamp } from '../utils/clamp';
import { interpolate } from '../utils/math';
import type { JointName } from '../pose/landmarkNames';
import type { PoseRecording, RecordedPoseFrame } from './recordingSchema';

function interpolateRecord<T extends Vec3Data>(
  before: Partial<Record<JointName, T>>,
  after: Partial<Record<JointName, T>>,
  amount: number,
): Partial<Record<JointName, T>> {
  const output: Partial<Record<JointName, T>> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as JointName[]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (a && b) output[key] = { ...a, ...interpolate(a, b, amount) };
    else if (a || b) output[key] = structuredClone((a ?? b) as T);
  }
  return output;
}

function interpolateNullable(a: number | null, b: number | null, amount: number): number | null {
  if (a === null || b === null) return a ?? b;
  return a + (b - a) * amount;
}

function interpolateMetrics(a: PoseMetrics, b: PoseMetrics, amount: number): PoseMetrics {
  return {
    pelvisYawDeg: interpolateNullable(a.pelvisYawDeg, b.pelvisYawDeg, amount),
    chestYawDeg: interpolateNullable(a.chestYawDeg, b.chestYawDeg, amount),
    xFactorDeg: interpolateNullable(a.xFactorDeg, b.xFactorDeg, amount),
    leftKneeFlexionDeg: interpolateNullable(a.leftKneeFlexionDeg, b.leftKneeFlexionDeg, amount),
    rightKneeFlexionDeg: interpolateNullable(a.rightKneeFlexionDeg, b.rightKneeFlexionDeg, amount),
    leftElbowFlexionDeg: interpolateNullable(a.leftElbowFlexionDeg, b.leftElbowFlexionDeg, amount),
    rightElbowFlexionDeg: interpolateNullable(
      a.rightElbowFlexionDeg,
      b.rightElbowFlexionDeg,
      amount,
    ),
    headSwayBodyWidths: interpolateNullable(a.headSwayBodyWidths, b.headSwayBodyWidths, amount),
    pelvisSwayBodyWidths: interpolateNullable(
      a.pelvisSwayBodyWidths,
      b.pelvisSwayBodyWidths,
      amount,
    ),
    shoulderTiltDeg: interpolateNullable(a.shoulderTiltDeg, b.shoulderTiltDeg, amount),
    pelvisTiltDeg: interpolateNullable(a.pelvisTiltDeg, b.pelvisTiltDeg, amount),
  };
}

function interpolateQuaternion(
  before: QuaternionData | null,
  after: QuaternionData | null,
  amount: number,
): QuaternionData | null {
  if (!before || !after) return before ?? after;
  let bx = after.x;
  let by = after.y;
  let bz = after.z;
  let bw = after.w;
  if (before.x * bx + before.y * by + before.z * bz + before.w * bw < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  const x = before.x + (bx - before.x) * amount;
  const y = before.y + (by - before.y) * amount;
  const z = before.z + (bz - before.z) * amount;
  const w = before.w + (bw - before.w) * amount;
  const magnitude = Math.hypot(x, y, z, w) || 1;
  return { x: x / magnitude, y: y / magnitude, z: z / magnitude, w: w / magnitude };
}

export function interpolateRecordedFrames(
  before: RecordedPoseFrame,
  after: RecordedPoseFrame,
  amount: number,
): ProcessedPoseFrame {
  const t = clamp(amount, 0, 1);
  const confidences: Partial<Record<JointName, number>> = {};
  const confidenceKeys = new Set([
    ...Object.keys(before.confidences),
    ...Object.keys(after.confidences),
  ] as JointName[]);
  for (const key of confidenceKeys) {
    const a = before.confidences[key];
    const b = after.confidences[key];
    if (a !== undefined && b !== undefined) confidences[key] = a + (b - a) * t;
    else confidences[key] = a ?? b;
  }

  return {
    timestampMs: before.timestampMs + (after.timestampMs - before.timestampMs) * t,
    normalized2D: interpolateRecord<PoseLandmark>(before.normalized2D, after.normalized2D, t),
    raw3D: interpolateRecord(before.raw3D, after.raw3D, t),
    filtered3D: interpolateRecord(before.filtered3D, after.filtered3D, t),
    constrained3D: interpolateRecord(before.constrained3D, after.constrained3D, t),
    joints: t < 0.5 ? before.joints : after.joints,
    confidences,
    rootTranslation: interpolate(before.rootTranslation, after.rootTranslation, t),
    pelvisOrientation: interpolateQuaternion(before.pelvisOrientation, after.pelvisOrientation, t),
    chestOrientation: interpolateQuaternion(before.chestOrientation, after.chestOrientation, t),
    headOrientation: interpolateQuaternion(before.headOrientation, after.headOrientation, t),
    metrics: interpolateMetrics(before.metrics, after.metrics, t),
    averageConfidence:
      before.averageConfidence + (after.averageConfidence - before.averageConfidence) * t,
  };
}

export class PlaybackController {
  private recording: PoseRecording | null = null;
  private playing = false;
  private loop = false;
  private speed = 1;
  private positionMs = 0;
  private lastUpdateMs = 0;

  load(recording: PoseRecording): void {
    this.recording = recording;
    this.pause();
    this.positionMs = 0;
  }

  play(nowMs = performance.now()): void {
    if (!this.recording) return;
    this.playing = true;
    this.lastUpdateMs = nowMs;
  }

  pause(): void {
    this.playing = false;
  }

  seek(positionMs: number): void {
    this.positionMs = clamp(positionMs, 0, this.durationMs);
  }

  setSpeed(speed: number): void {
    if ([0.25, 0.5, 1, 2].includes(speed)) this.speed = speed;
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  update(nowMs = performance.now()): ProcessedPoseFrame | null {
    const frames = this.recording?.frames;
    if (!frames?.length) return null;
    if (this.playing) {
      this.positionMs += Math.max(0, nowMs - this.lastUpdateMs) * this.speed;
      this.lastUpdateMs = nowMs;
      if (this.positionMs >= this.durationMs) {
        if (this.loop && this.durationMs > 0) this.positionMs %= this.durationMs;
        else {
          this.positionMs = this.durationMs;
          this.playing = false;
        }
      }
    }

    let upperIndex = frames.findIndex((frame) => frame.timestampMs >= this.positionMs);
    if (upperIndex < 0) upperIndex = frames.length - 1;
    const lowerIndex = Math.max(0, upperIndex - 1);
    const before = frames[lowerIndex];
    const after = frames[upperIndex];
    if (!before || !after) return null;
    const interval = after.timestampMs - before.timestampMs;
    const amount = interval > 0 ? (this.positionMs - before.timestampMs) / interval : 0;
    return interpolateRecordedFrames(before, after, amount);
  }

  get state(): {
    playing: boolean;
    loop: boolean;
    speed: number;
    positionMs: number;
    durationMs: number;
    frameIndex: number;
  } {
    const frames = this.recording?.frames ?? [];
    const frameIndex = Math.max(
      0,
      frames.findIndex((frame) => frame.timestampMs >= this.positionMs),
    );
    return {
      playing: this.playing,
      loop: this.loop,
      speed: this.speed,
      positionMs: this.positionMs,
      durationMs: this.durationMs,
      frameIndex,
    };
  }

  get durationMs(): number {
    return this.recording?.frames.at(-1)?.timestampMs ?? 0;
  }
}
