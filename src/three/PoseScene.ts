import {
  ACESFilmicToneMapping,
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  GridHelper,
  MathUtils,
  Material,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type ColorRepresentation,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ALL_JOINT_NAMES, type JointName } from '../pose/landmarkNames';
import type { ProcessedPoseFrame, QuaternionData, Vec3Data } from '../pose/poseTypes';
import { timestampForFilename } from '../utils/download';
import { FpsCounter } from '../utils/fpsCounter';
import { CameraPresetAnimator, getCameraPresetView, type CameraPresetName } from './CameraPresets';
import { disposeObject3D, disposeRenderer } from './dispose';
import { ProceduralMannequin } from './ProceduralMannequin';
import { ReferenceLines, type ReferenceDisplacements } from './ReferenceLines';
import {
  DEFAULT_REFERENCE_LINE_VISIBILITY,
  DEFAULT_SKELETON_LAYER_VISIBILITY,
  type PoseConfidenceMap,
  type PoseDisplayMode,
  type PoseDisplaySource,
  type PosePositionMap,
  type PosePredictionMap,
  type ReferenceLineVisibility,
  type RenderPoseData,
  type SkeletonLayerVisibility,
} from './renderTypes';
import { SkeletonRenderer } from './SkeletonRenderer';

interface TimedRenderPose {
  pose: RenderPoseData;
  arrivedAtMs: number;
}

export interface PoseSceneOptions {
  background?: ColorRepresentation;
  displayMode?: PoseDisplayMode;
  poseSource?: PoseDisplaySource;
  maxPixelRatio?: number;
  autoStart?: boolean;
  autoFollowTarget?: boolean;
  onRenderFps?: (fps: number) => void;
}

export interface PoseSceneDebugOverlays {
  raw?: boolean;
  filtered?: boolean;
  constrained?: boolean;
  references?: Partial<ReferenceLineVisibility>;
  wireframe?: boolean;
}

const SOURCE_NAMES: readonly PoseDisplaySource[] = ['raw', 'filtered', 'constrained'];

function createEmptyRenderPose(): RenderPoseData {
  return {
    timestampMs: 0,
    raw: {},
    filtered: {},
    constrained: {},
    confidences: {},
    predicted: {},
    pelvisOrientation: null,
    chestOrientation: null,
    headOrientation: null,
  };
}

function clonePositionMap(source: PosePositionMap): PosePositionMap {
  const result: PosePositionMap = {};
  for (const name of ALL_JOINT_NAMES) {
    const value = source[name];
    if (!value) continue;
    result[name] = { x: value.x, y: value.y, z: value.z };
  }
  return result;
}

function cloneQuaternion(value: QuaternionData | null): QuaternionData | null {
  return value ? { x: value.x, y: value.y, z: value.z, w: value.w } : null;
}

function snapshotFrame(frame: ProcessedPoseFrame): RenderPoseData {
  const confidences: PoseConfidenceMap = {};
  const predicted: PosePredictionMap = {};
  for (const name of ALL_JOINT_NAMES) {
    const confidence = frame.confidences[name];
    if (confidence !== undefined && Number.isFinite(confidence)) confidences[name] = confidence;
    const joint = frame.joints[name];
    if (joint?.isPredicted) predicted[name] = true;
  }

  return {
    timestampMs: frame.timestampMs,
    raw: clonePositionMap(frame.raw3D),
    filtered: clonePositionMap(frame.filtered3D),
    constrained: clonePositionMap(frame.constrained3D),
    confidences,
    predicted,
    pelvisOrientation: cloneQuaternion(frame.pelvisOrientation),
    chestOrientation: cloneQuaternion(frame.chestOrientation),
    headOrientation: cloneQuaternion(frame.headOrientation),
  };
}

function setInterpolatedVector(
  target: PosePositionMap,
  name: JointName,
  previous: Vec3Data | undefined,
  latest: Vec3Data | undefined,
  amount: number,
): void {
  if (!previous && !latest) {
    delete target[name];
    return;
  }

  const from = previous ?? latest;
  const to = latest ?? previous;
  if (!from || !to) return;
  let output = target[name];
  if (!output) {
    output = { x: 0, y: 0, z: 0 };
    target[name] = output;
  }
  output.x = MathUtils.lerp(from.x, to.x, amount);
  output.y = MathUtils.lerp(from.y, to.y, amount);
  output.z = MathUtils.lerp(from.z, to.z, amount);
}

function isFiniteQuaternion(value: QuaternionData | null): value is QuaternionData {
  return (
    value !== null &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}

export class PoseScene {
  public readonly scene: Scene;
  public readonly camera: PerspectiveCamera;
  public readonly renderer: WebGLRenderer;
  public readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly mannequin = new ProceduralMannequin();
  private readonly skeleton = new SkeletonRenderer();
  private readonly referenceLines = new ReferenceLines();
  private readonly grid = new GridHelper(8, 32, 0x2d8994, 0x153942);
  private readonly axes = new AxesHelper(0.38);
  private readonly cameraAnimator = new CameraPresetAnimator();
  private readonly focusTarget = new Vector3(0, 0.9, 0);
  private readonly desiredFocusTarget = new Vector3(0, 0.9, 0);
  private readonly fpsCounter = new FpsCounter();
  private readonly interpolatedPose = createEmptyRenderPose();
  private readonly quaternionFrom = new Quaternion();
  private readonly quaternionTo = new Quaternion();
  private readonly quaternionOutput = new Quaternion();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onWindowResize = (): void => this.resize();
  private readonly onControlsStart = (): void => this.cameraAnimator.cancel();
  private readonly onRenderFps?: (fps: number) => void;
  private readonly maxPixelRatio: number;
  private previousPose: TimedRenderPose | null = null;
  private latestPose: TimedRenderPose | null = null;
  private displayMode: PoseDisplayMode;
  private poseSource: PoseDisplaySource;
  private autoFollowTarget: boolean;
  private labelsVisible = false;
  private framingRadius = 1.25;
  private renderFps = 0;
  private animationFrameId: number | null = null;
  private disposed = false;

  public constructor(container: HTMLElement, options: PoseSceneOptions = {}) {
    this.container = container;
    this.displayMode = options.displayMode ?? 'overlay';
    this.poseSource = options.poseSource ?? 'constrained';
    this.maxPixelRatio = Math.max(1, options.maxPixelRatio ?? 2);
    this.autoFollowTarget = options.autoFollowTarget ?? true;
    this.onRenderFps = options.onRenderFps;

    this.scene = new Scene();
    this.scene.background = new Color(options.background ?? 0x07131b);

    this.camera = new PerspectiveCamera(40, 1, 0.01, 100);
    const initialView = getCameraPresetView('perspective', this.focusTarget, this.framingRadius);
    this.camera.position.copy(initialView.position);
    this.camera.up.copy(initialView.up);
    this.camera.lookAt(initialView.target);

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.domElement.className = 'pose-three-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D pose reconstruction');
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.target.copy(this.focusTarget);
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 12;
    this.controls.maxPolarAngle = Math.PI * 0.98;
    this.controls.addEventListener('start', this.onControlsStart);

    const ambient = new AmbientLight(0xb9dce5, 1.35);
    ambient.name = 'ambient-light';
    const keyLight = new DirectionalLight(0xe4fbff, 3.1);
    keyLight.name = 'key-light';
    keyLight.position.set(3.2, 5.5, 4.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    const rimLight = new DirectionalLight(0x528eff, 1.7);
    rimLight.name = 'rim-light';
    rimLight.position.set(-3.5, 2.8, -3.2);

    this.grid.name = 'floor-grid';
    this.grid.position.y = 0;
    const gridMaterials: readonly Material[] = Array.isArray(this.grid.material)
      ? (this.grid.material as Material[])
      : [this.grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
    }
    this.axes.name = 'world-axes';
    this.axes.visible = false;

    this.scene.add(
      ambient,
      keyLight,
      rimLight,
      this.grid,
      this.axes,
      this.mannequin,
      this.skeleton,
      this.referenceLines,
    );
    this.skeleton.setLayerVisibility(DEFAULT_SKELETON_LAYER_VISIBILITY);
    this.referenceLines.setVisibility(DEFAULT_REFERENCE_LINE_VISIBILITY);
    this.applyDisplayMode();

    if (typeof ResizeObserver === 'undefined') {
      this.resizeObserver = null;
      window.addEventListener('resize', this.onWindowResize);
    } else {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.resize();
    if (options.autoStart ?? true) this.start();
  }

  /** Supply a processed pose. The renderer snapshots it and interpolates at display rate. */
  public updatePose(frame: ProcessedPoseFrame, sourceMode?: PoseDisplaySource): void {
    if (this.disposed) return;
    if (sourceMode) this.setPoseSource(sourceMode);
    const next: TimedRenderPose = { pose: snapshotFrame(frame), arrivedAtMs: performance.now() };
    this.previousPose = this.latestPose;
    this.latestPose = next;
    if (!this.previousPose) this.previousPose = next;
  }

  public setDisplayMode(mode: PoseDisplayMode): void {
    this.displayMode = mode;
    this.applyDisplayMode();
  }

  public setPoseSource(source: PoseDisplaySource): void {
    this.poseSource = source;
    this.skeleton.showOnly(source);
    this.skeleton.setLabelsVisible(this.labelsVisible, source);
  }

  public setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  public setAxesVisible(visible: boolean): void {
    this.axes.visible = visible;
  }

  public setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    this.skeleton.setLabelsVisible(visible, this.poseSource);
  }

  public setDebugOverlays(options: PoseSceneDebugOverlays): void {
    const layers: Partial<SkeletonLayerVisibility> = {};
    if (options.raw !== undefined) layers.raw = options.raw;
    if (options.filtered !== undefined) layers.filtered = options.filtered;
    if (options.constrained !== undefined) layers.constrained = options.constrained;
    this.skeleton.setLayerVisibility(layers);
    if (options.references) this.referenceLines.setVisibility(options.references);
    if (options.wireframe !== undefined) this.mannequin.setWireframe(options.wireframe);
  }

  public setReferenceVisibility(visibility: Partial<ReferenceLineVisibility>): void {
    this.referenceLines.setVisibility(visibility);
  }

  public calibrateReferenceLines(frame?: ProcessedPoseFrame): void {
    if (frame) {
      const pose = snapshotFrame(frame);
      this.referenceLines.calibrate(pose[this.poseSource]);
      return;
    }
    const pose = this.latestPose?.pose ?? this.interpolatedPose;
    this.referenceLines.calibrate(pose[this.poseSource]);
  }

  public clearReferenceCalibration(): void {
    this.referenceLines.clearCalibration();
  }

  public getReferenceDisplacements(): ReferenceDisplacements {
    const pose = this.latestPose?.pose ?? this.interpolatedPose;
    return this.referenceLines.getDisplacements(pose[this.poseSource]);
  }

  public setCameraPreset(preset: CameraPresetName, durationMs = 650): void {
    if (this.disposed) return;
    const view = getCameraPresetView(preset, this.focusTarget, this.framingRadius);
    this.cameraAnimator.start(
      this.camera,
      this.controls.target,
      view,
      performance.now(),
      durationMs,
    );
  }

  public resetCamera(durationMs = 650): void {
    this.setCameraPreset('reset', durationMs);
  }

  public setAutoFollowTarget(enabled: boolean): void {
    this.autoFollowTarget = enabled;
  }

  /** Renders, downloads a local PNG, and returns the same data URL for callers that need it. */
  public captureScreenshot(filename = `pose-reconstruction-${timestampForFilename()}.png`): string {
    if (this.disposed)
      throw new Error('Cannot capture a screenshot after the pose scene is disposed.');
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.click();
    return dataUrl;
  }

  public getScreenshotDataUrl(): string {
    if (this.disposed)
      throw new Error('Cannot capture a screenshot after the pose scene is disposed.');
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  public getRenderFps(): number {
    return this.renderFps;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public start(): void {
    if (this.disposed || this.animationFrameId !== null) return;
    this.fpsCounter.reset();
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  }

  public stop(): void {
    if (this.animationFrameId === null) return;
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.dispose();
    this.cameraAnimator.cancel();

    this.scene.remove(this.mannequin, this.skeleton, this.referenceLines);
    this.mannequin.dispose();
    this.skeleton.dispose();
    this.referenceLines.dispose();
    disposeObject3D(this.scene);
    this.scene.clear();
    disposeRenderer(this.renderer);
    this.previousPose = null;
    this.latestPose = null;
  }

  private readonly renderFrame = (nowMs: number): void => {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.renderFrame);

    const pose = this.interpolatePose(nowMs);
    if (pose) this.updatePoseObjects(pose);

    if (this.cameraAnimator.isActive) {
      this.cameraAnimator.update(this.camera, this.controls.target, nowMs);
    } else if (this.autoFollowTarget && pose) {
      this.updateDesiredFocus(pose[this.poseSource]);
      this.focusTarget.lerp(this.desiredFocusTarget, 0.075);
      this.controls.target.lerp(this.focusTarget, 0.075);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const fps = this.fpsCounter.tick(nowMs);
    if (fps !== this.renderFps) {
      this.renderFps = fps;
      this.onRenderFps?.(fps);
    }
  };

  private interpolatePose(nowMs: number): RenderPoseData | null {
    const latest = this.latestPose;
    const previous = this.previousPose;
    if (!latest || !previous) return null;

    const intervalMs = Math.max(1, latest.arrivedAtMs - previous.arrivedAtMs);
    const delayedRenderTime = nowMs - intervalMs;
    const amount =
      previous === latest
        ? 1
        : MathUtils.clamp((delayedRenderTime - previous.arrivedAtMs) / intervalMs, 0, 1);

    for (const source of SOURCE_NAMES) {
      const outputPositions = this.interpolatedPose[source];
      const previousPositions = previous.pose[source];
      const latestPositions = latest.pose[source];
      for (const name of ALL_JOINT_NAMES) {
        setInterpolatedVector(
          outputPositions,
          name,
          previousPositions[name],
          latestPositions[name],
          amount,
        );
      }
    }

    for (const name of ALL_JOINT_NAMES) {
      const previousConfidence = previous.pose.confidences[name];
      const latestConfidence = latest.pose.confidences[name];
      if (previousConfidence === undefined && latestConfidence === undefined) {
        delete this.interpolatedPose.confidences[name];
      } else {
        this.interpolatedPose.confidences[name] = MathUtils.lerp(
          previousConfidence ?? latestConfidence ?? 1,
          latestConfidence ?? previousConfidence ?? 1,
          amount,
        );
      }
      const isPredicted = latest.pose.predicted[name] ?? previous.pose.predicted[name];
      if (isPredicted) this.interpolatedPose.predicted[name] = true;
      else delete this.interpolatedPose.predicted[name];
    }

    this.interpolatedPose.timestampMs = MathUtils.lerp(
      previous.pose.timestampMs,
      latest.pose.timestampMs,
      amount,
    );
    this.interpolatedPose.pelvisOrientation = this.interpolateOrientation(
      this.interpolatedPose.pelvisOrientation,
      previous.pose.pelvisOrientation,
      latest.pose.pelvisOrientation,
      amount,
    );
    this.interpolatedPose.chestOrientation = this.interpolateOrientation(
      this.interpolatedPose.chestOrientation,
      previous.pose.chestOrientation,
      latest.pose.chestOrientation,
      amount,
    );
    this.interpolatedPose.headOrientation = this.interpolateOrientation(
      this.interpolatedPose.headOrientation,
      previous.pose.headOrientation,
      latest.pose.headOrientation,
      amount,
    );
    return this.interpolatedPose;
  }

  private interpolateOrientation(
    output: QuaternionData | null,
    previous: QuaternionData | null,
    latest: QuaternionData | null,
    amount: number,
  ): QuaternionData | null {
    const from = isFiniteQuaternion(previous) ? previous : latest;
    const to = isFiniteQuaternion(latest) ? latest : previous;
    if (!from || !to) return null;
    this.quaternionFrom.set(from.x, from.y, from.z, from.w).normalize();
    this.quaternionTo.set(to.x, to.y, to.z, to.w).normalize();
    this.quaternionOutput.copy(this.quaternionFrom).slerp(this.quaternionTo, amount);
    const target = output ?? { x: 0, y: 0, z: 0, w: 1 };
    target.x = this.quaternionOutput.x;
    target.y = this.quaternionOutput.y;
    target.z = this.quaternionOutput.z;
    target.w = this.quaternionOutput.w;
    return target;
  }

  private updatePoseObjects(pose: RenderPoseData): void {
    const positions = pose[this.poseSource];
    this.mannequin.update({
      positions,
      confidences: pose.confidences,
      predicted: pose.predicted,
      pelvisOrientation: pose.pelvisOrientation,
      chestOrientation: pose.chestOrientation,
      headOrientation: pose.headOrientation,
    });
    this.skeleton.update(pose);
    this.referenceLines.update(positions);
    this.updateFramingRadius(positions);
  }

  private updateDesiredFocus(positions: PosePositionMap): void {
    const pelvis = positions.pelvisCenter;
    const chest = positions.chestCenter;
    if (pelvis && chest) {
      this.desiredFocusTarget.set(
        (pelvis.x + chest.x) * 0.5,
        (pelvis.y + chest.y) * 0.5,
        (pelvis.z + chest.z) * 0.5,
      );
    } else if (pelvis) {
      this.desiredFocusTarget.set(pelvis.x, pelvis.y + 0.22, pelvis.z);
    } else if (chest) {
      this.desiredFocusTarget.set(chest.x, chest.y - 0.18, chest.z);
    }
  }

  private updateFramingRadius(positions: PosePositionMap): void {
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (const name of ALL_JOINT_NAMES) {
      const position = positions[name];
      if (!position) continue;
      minimumY = Math.min(minimumY, position.y);
      maximumY = Math.max(maximumY, position.y);
    }
    if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) return;
    const targetRadius = MathUtils.clamp((maximumY - minimumY) * 0.68, 0.75, 2.4);
    this.framingRadius = MathUtils.lerp(this.framingRadius, targetRadius, 0.04);
  }

  private applyDisplayMode(): void {
    this.mannequin.visible = this.displayMode === 'mannequin' || this.displayMode === 'overlay';
    this.skeleton.visible = this.displayMode === 'skeleton' || this.displayMode === 'overlay';
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(width, height, false);
  }
}

export type {
  CameraPresetName,
  PoseDisplayMode,
  PoseDisplaySource,
  ReferenceLineVisibility,
  SkeletonLayerVisibility,
};
