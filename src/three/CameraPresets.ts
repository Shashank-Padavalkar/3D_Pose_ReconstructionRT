import { PerspectiveCamera, Spherical, Vector3 } from 'three';

export type CameraPresetName =
  'front' | 'back' | 'left' | 'right' | 'top' | 'perspective' | 'reset';

export interface CameraPresetView {
  position: Vector3;
  target: Vector3;
  up: Vector3;
}

const MIN_DISTANCE = 1.4;
const DEFAULT_DISTANCE = 3.25;

function cameraDistance(radius: number): number {
  return Math.max(MIN_DISTANCE, Number.isFinite(radius) ? radius * 2.45 : DEFAULT_DISTANCE);
}

export function getCameraPresetView(
  preset: CameraPresetName,
  target: Vector3,
  framingRadius = 1.35,
): CameraPresetView {
  const distance = cameraDistance(framingRadius);
  const position = target.clone();
  const up = new Vector3(0, 1, 0);

  switch (preset) {
    case 'front':
      position.add(new Vector3(0, framingRadius * 0.08, distance));
      break;
    case 'back':
      position.add(new Vector3(0, framingRadius * 0.08, -distance));
      break;
    case 'left':
      position.add(new Vector3(-distance, framingRadius * 0.08, 0));
      break;
    case 'right':
      position.add(new Vector3(distance, framingRadius * 0.08, 0));
      break;
    case 'top':
      position.add(new Vector3(0, distance, 0.001));
      up.set(0, 0, -1);
      break;
    case 'reset':
    case 'perspective':
      position.add(new Vector3(distance * 0.68, distance * 0.42, distance * 0.78));
      break;
  }

  return { position, target: target.clone(), up };
}

function easeInOutCubic(amount: number): number {
  return amount < 0.5 ? 4 * amount * amount * amount : 1 - Math.pow(-2 * amount + 2, 3) / 2;
}

export class CameraPresetAnimator {
  private active = false;
  private startedAtMs = 0;
  private durationMs = 650;
  private readonly startPosition = new Vector3();
  private readonly endPosition = new Vector3();
  private readonly startTarget = new Vector3();
  private readonly endTarget = new Vector3();
  private readonly startUp = new Vector3();
  private readonly endUp = new Vector3();
  private readonly spherical = new Spherical();

  public get isActive(): boolean {
    return this.active;
  }

  public start(
    camera: PerspectiveCamera,
    currentTarget: Vector3,
    view: CameraPresetView,
    nowMs: number,
    durationMs = 650,
  ): void {
    this.startPosition.copy(camera.position);
    this.endPosition.copy(view.position);
    this.startTarget.copy(currentTarget);
    this.endTarget.copy(view.target);
    this.startUp.copy(camera.up);
    this.endUp.copy(view.up);
    this.startedAtMs = nowMs;
    this.durationMs = Math.max(0, durationMs);
    this.active = true;

    if (this.durationMs === 0) this.update(camera, currentTarget, nowMs);
  }

  public cancel(): void {
    this.active = false;
  }

  public update(camera: PerspectiveCamera, target: Vector3, nowMs: number): boolean {
    if (!this.active) return false;

    const rawAmount = this.durationMs === 0 ? 1 : (nowMs - this.startedAtMs) / this.durationMs;
    const amount = easeInOutCubic(Math.min(1, Math.max(0, rawAmount)));
    camera.position.lerpVectors(this.startPosition, this.endPosition, amount);
    target.lerpVectors(this.startTarget, this.endTarget, amount);
    camera.up.lerpVectors(this.startUp, this.endUp, amount).normalize();

    // Keep OrbitControls away from the singularity encountered directly above the target.
    this.spherical.setFromVector3(camera.position.clone().sub(target));
    if (this.spherical.radius < 0.001) camera.position.z += 0.001;
    camera.lookAt(target);

    if (rawAmount >= 1) {
      this.active = false;
      return false;
    }
    return true;
  }
}
