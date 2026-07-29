import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import { ALL_JOINT_NAMES, type JointName } from '../pose/landmarkNames';
import { RECONSTRUCTION_CONNECTIONS } from '../pose/poseConnections';
import type {
  PoseConfidenceMap,
  PoseDisplaySource,
  PosePositionMap,
  PosePredictionMap,
  RenderPoseData,
  SkeletonLayerVisibility,
} from './renderTypes';

interface LayerStyle {
  color: Color;
  opacity: number;
  jointRadius: number;
}

const SOURCE_NAMES: readonly PoseDisplaySource[] = ['raw', 'filtered', 'constrained'];
const WARNING_COLOR = new Color(0xef5d68);
const MEDIUM_COLOR = new Color(0xff9868);
const PREDICTED_COLOR = new Color(0xf2bf4a);
const LAYER_STYLES: Readonly<Record<PoseDisplaySource, LayerStyle>> = {
  raw: { color: new Color(0xe46fd6), opacity: 0.38, jointRadius: 0.012 },
  filtered: { color: new Color(0xf0c757), opacity: 0.58, jointRadius: 0.014 },
  constrained: { color: new Color(0x47dfe9), opacity: 0.95, jointRadius: 0.017 },
};

function confidenceColor(
  base: Color,
  confidence: number,
  predicted: boolean,
  target: Color,
): Color {
  if (predicted) return target.copy(PREDICTED_COLOR);
  if (confidence < 0.4) return target.copy(WARNING_COLOR);
  if (confidence < 0.65) return target.copy(MEDIUM_COLOR);
  return target.copy(base);
}

class SkeletonLayer extends Group {
  private readonly positions = new Float32Array(RECONSTRUCTION_CONNECTIONS.length * 2 * 3);
  private readonly colors = new Float32Array(RECONSTRUCTION_CONNECTIONS.length * 2 * 3);
  private readonly lineGeometry = new BufferGeometry();
  private readonly lineMaterial: LineBasicMaterial;
  private readonly lines: LineSegments;
  private readonly jointMaterial: MeshBasicMaterial;
  private readonly joints: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  private readonly scratchMatrix = new Matrix4();
  private readonly color = new Color();

  public constructor(
    public readonly source: PoseDisplaySource,
    private readonly style: LayerStyle,
    jointGeometry: SphereGeometry,
  ) {
    super();
    this.name = `skeleton-${source}`;
    const positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    const colorAttribute = new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage);
    this.lineGeometry.setAttribute('position', positionAttribute);
    this.lineGeometry.setAttribute('color', colorAttribute);
    this.lineGeometry.setDrawRange(0, 0);

    this.lineMaterial = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: style.opacity,
      depthWrite: false,
    });
    this.lines = new LineSegments(this.lineGeometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = source === 'constrained' ? 4 : 3;
    this.add(this.lines);

    this.jointMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: style.opacity,
      depthWrite: false,
    });
    this.joints = new InstancedMesh(jointGeometry, this.jointMaterial, ALL_JOINT_NAMES.length);
    this.joints.count = 0;
    this.joints.instanceMatrix.setUsage(DynamicDrawUsage);
    this.joints.frustumCulled = false;
    this.joints.renderOrder = source === 'constrained' ? 4 : 3;
    this.add(this.joints);
  }

  public update(
    positions: PosePositionMap,
    confidences: PoseConfidenceMap,
    predicted: PosePredictionMap,
  ): void {
    let lineVertexCount = 0;
    for (const connection of RECONSTRUCTION_CONNECTIONS) {
      const from = positions[connection.from];
      const to = positions[connection.to];
      if (!from || !to) continue;

      const positionOffset = lineVertexCount * 3;
      this.positions[positionOffset] = from.x;
      this.positions[positionOffset + 1] = from.y;
      this.positions[positionOffset + 2] = from.z;
      this.positions[positionOffset + 3] = to.x;
      this.positions[positionOffset + 4] = to.y;
      this.positions[positionOffset + 5] = to.z;

      const confidence = Math.min(
        confidences[connection.from] ?? 1,
        confidences[connection.to] ?? 1,
      );
      const isPredicted = Boolean(predicted[connection.from] || predicted[connection.to]);
      confidenceColor(this.style.color, confidence, isPredicted, this.color);
      this.color.toArray(this.colors, positionOffset);
      this.color.toArray(this.colors, positionOffset + 3);
      lineVertexCount += 2;
    }

    const positionAttribute = this.lineGeometry.getAttribute('position');
    const colorAttribute = this.lineGeometry.getAttribute('color');
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    this.lineGeometry.setDrawRange(0, lineVertexCount);

    let jointCount = 0;
    for (const name of ALL_JOINT_NAMES) {
      const position = positions[name];
      if (!position) continue;
      const confidence = confidences[name] ?? 1;
      confidenceColor(this.style.color, confidence, Boolean(predicted[name]), this.color);
      const radius = this.style.jointRadius * (confidence < 0.4 ? 0.82 : 1);
      this.scratchMatrix.makeScale(radius, radius, radius);
      this.scratchMatrix.setPosition(position.x, position.y, position.z);
      this.joints.setMatrixAt(jointCount, this.scratchMatrix);
      this.joints.setColorAt(jointCount, this.color);
      jointCount += 1;
    }
    this.joints.count = jointCount;
    this.joints.instanceMatrix.needsUpdate = true;
    if (this.joints.instanceColor) this.joints.instanceColor.needsUpdate = true;
  }

  public dispose(): void {
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.jointMaterial.dispose();
    this.clear();
  }
}

export class SkeletonRenderer extends Group {
  private readonly jointGeometry = new SphereGeometry(1, 10, 8);
  private readonly layerGroups: Record<PoseDisplaySource, SkeletonLayer>;
  private readonly layerVisibility: SkeletonLayerVisibility = {
    raw: false,
    filtered: false,
    constrained: true,
  };
  private readonly labels = new Map<JointName, Sprite>();
  private labelsVisible = false;
  private labelSource: PoseDisplaySource = 'constrained';
  private lastPose: RenderPoseData | null = null;

  public constructor() {
    super();
    this.name = 'skeleton-renderer';
    this.layerGroups = {
      raw: new SkeletonLayer('raw', LAYER_STYLES.raw, this.jointGeometry),
      filtered: new SkeletonLayer('filtered', LAYER_STYLES.filtered, this.jointGeometry),
      constrained: new SkeletonLayer('constrained', LAYER_STYLES.constrained, this.jointGeometry),
    };
    for (const source of SOURCE_NAMES) this.add(this.layerGroups[source]);
    this.applyLayerVisibility();
  }

  public update(data: RenderPoseData): void {
    this.lastPose = data;
    for (const source of SOURCE_NAMES) {
      this.layerGroups[source].update(data[source], data.confidences, data.predicted);
    }
    this.updateLabels(data[this.labelSource]);
  }

  public setLayerVisibility(visibility: Partial<SkeletonLayerVisibility>): void {
    Object.assign(this.layerVisibility, visibility);
    this.applyLayerVisibility();
  }

  public showOnly(source: PoseDisplaySource): void {
    this.layerVisibility.raw = source === 'raw';
    this.layerVisibility.filtered = source === 'filtered';
    this.layerVisibility.constrained = source === 'constrained';
    this.labelSource = source;
    this.applyLayerVisibility();
    if (this.lastPose) this.updateLabels(this.lastPose[source]);
  }

  public setLabelsVisible(visible: boolean, source: PoseDisplaySource = this.labelSource): void {
    this.labelsVisible = visible;
    this.labelSource = source;
    if (visible && this.labels.size === 0) this.createLabels();
    if (this.lastPose) this.updateLabels(this.lastPose[source]);
    for (const label of this.labels.values()) label.visible = visible && label.visible;
  }

  public dispose(): void {
    for (const source of SOURCE_NAMES) this.layerGroups[source].dispose();
    for (const label of this.labels.values()) {
      label.material.map?.dispose();
      label.material.dispose();
    }
    this.labels.clear();
    this.jointGeometry.dispose();
    this.clear();
  }

  private applyLayerVisibility(): void {
    for (const source of SOURCE_NAMES) {
      this.layerGroups[source].visible = this.layerVisibility[source];
    }
  }

  private createLabels(): void {
    if (typeof document === 'undefined') return;
    for (const name of ALL_JOINT_NAMES) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 48;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = '600 22px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = 5;
      context.strokeStyle = 'rgba(4, 14, 22, 0.92)';
      context.strokeText(name, canvas.width / 2, canvas.height / 2);
      context.fillStyle = '#dffbff';
      context.fillText(name, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.name = `label-${name}`;
      sprite.scale.set(0.28, 0.0525, 1);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 8;
      sprite.visible = false;
      this.labels.set(name, sprite);
      this.add(sprite);
    }
  }

  private updateLabels(positions: PosePositionMap): void {
    if (!this.labelsVisible) {
      for (const label of this.labels.values()) label.visible = false;
      return;
    }
    for (const [name, label] of this.labels) {
      const position = positions[name];
      label.visible = position !== undefined;
      if (position) label.position.set(position.x, position.y + 0.025, position.z);
    }
  }
}
