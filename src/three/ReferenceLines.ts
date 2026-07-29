import {
  BufferAttribute,
  BufferGeometry,
  ColorRepresentation,
  DynamicDrawUsage,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three';
import type { Vec3Data } from '../pose/poseTypes';
import type { PosePositionMap, ReferenceLineVisibility } from './renderTypes';

type ReferenceLineName = keyof ReferenceLineVisibility;

class DynamicReferenceLine extends Line<BufferGeometry, LineBasicMaterial> {
  private readonly coordinates = new Float32Array(6);

  public constructor(name: string, color: ColorRepresentation, opacity: number) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(6), 3).setUsage(DynamicDrawUsage),
    );
    const material = new LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      depthTest: false,
    });
    super(geometry, material);
    this.name = name;
    this.renderOrder = 7;
    this.frustumCulled = false;
  }

  public setEndpoints(from: Vec3Data, to: Vec3Data): void {
    this.coordinates[0] = from.x;
    this.coordinates[1] = from.y;
    this.coordinates[2] = from.z;
    this.coordinates[3] = to.x;
    this.coordinates[4] = to.y;
    this.coordinates[5] = to.z;
    const attribute = this.geometry.getAttribute('position') as BufferAttribute;
    attribute.copyArray(this.coordinates);
    attribute.needsUpdate = true;
    this.geometry.setDrawRange(0, 2);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export interface ReferenceDisplacements {
  head: Vec3Data | null;
  pelvis: Vec3Data | null;
}

export class ReferenceLines extends Group {
  private readonly lines: Record<ReferenceLineName, DynamicReferenceLine> = {
    head: new DynamicReferenceLine('head-reference', 0x59e8ee, 0.72),
    pelvis: new DynamicReferenceLine('pelvis-reference', 0x3bc4ee, 0.72),
    shoulders: new DynamicReferenceLine('shoulder-reference', 0x59e8ee, 0.92),
    hips: new DynamicReferenceLine('hip-reference', 0x4fb7d5, 0.92),
    centerline: new DynamicReferenceLine('body-centerline', 0xb3fbff, 0.58),
    ground: new DynamicReferenceLine('ground-reference', 0x52ccd1, 0.48),
  };
  private readonly visibilityOptions: ReferenceLineVisibility = {
    head: false,
    pelvis: false,
    shoulders: false,
    hips: false,
    centerline: false,
    ground: true,
  };
  private readonly calibratedHead = new Vector3();
  private readonly calibratedPelvis = new Vector3();
  private hasHeadCalibration = false;
  private hasPelvisCalibration = false;
  private groundSpan = 2.4;
  private readonly headDisplacement = new Vector3();
  private readonly pelvisDisplacement = new Vector3();

  public constructor() {
    super();
    this.name = 'reference-lines';
    for (const line of Object.values(this.lines)) this.add(line);
    this.applyVisibility();
  }

  public update(positions: PosePositionMap): void {
    const head = positions.headCenter;
    const pelvis = positions.pelvisCenter;
    const leftShoulder = positions.leftShoulder;
    const rightShoulder = positions.rightShoulder;
    const leftHip = positions.leftHip;
    const rightHip = positions.rightHip;

    const headReference = this.hasHeadCalibration ? this.calibratedHead : head;
    if (headReference) {
      const top = Math.max(head?.y ?? headReference.y, headReference.y) + 0.28;
      this.lines.head.setEndpoints(
        { x: headReference.x, y: 0, z: headReference.z },
        { x: headReference.x, y: top, z: headReference.z },
      );
    }
    this.lines.head.visible = this.visibilityOptions.head && headReference !== undefined;

    const pelvisReference = this.hasPelvisCalibration ? this.calibratedPelvis : pelvis;
    if (pelvisReference) {
      const top = Math.max(head?.y ?? pelvisReference.y + 0.8, pelvisReference.y + 0.35);
      this.lines.pelvis.setEndpoints(
        { x: pelvisReference.x, y: 0, z: pelvisReference.z },
        { x: pelvisReference.x, y: top, z: pelvisReference.z },
      );
    }
    this.lines.pelvis.visible = this.visibilityOptions.pelvis && pelvisReference !== undefined;

    if (leftShoulder && rightShoulder)
      this.lines.shoulders.setEndpoints(leftShoulder, rightShoulder);
    this.lines.shoulders.visible =
      this.visibilityOptions.shoulders && leftShoulder !== undefined && rightShoulder !== undefined;

    if (leftHip && rightHip) this.lines.hips.setEndpoints(leftHip, rightHip);
    this.lines.hips.visible =
      this.visibilityOptions.hips && leftHip !== undefined && rightHip !== undefined;

    if (head && pelvis) this.lines.centerline.setEndpoints(pelvis, head);
    this.lines.centerline.visible =
      this.visibilityOptions.centerline && head !== undefined && pelvis !== undefined;

    const groundCenter = pelvis ?? head ?? { x: 0, y: 0, z: 0 };
    const halfSpan = this.groundSpan * 0.5;
    this.lines.ground.setEndpoints(
      { x: groundCenter.x - halfSpan, y: 0.002, z: groundCenter.z },
      { x: groundCenter.x + halfSpan, y: 0.002, z: groundCenter.z },
    );
    this.lines.ground.visible = this.visibilityOptions.ground;
  }

  public setVisibility(visibility: Partial<ReferenceLineVisibility>): void {
    Object.assign(this.visibilityOptions, visibility);
    this.applyVisibility();
  }

  public setGroundSpan(span: number): void {
    if (Number.isFinite(span)) this.groundSpan = Math.max(0.5, span);
  }

  public calibrate(positions: PosePositionMap): void {
    const head = positions.headCenter;
    const pelvis = positions.pelvisCenter;
    if (head) {
      this.calibratedHead.set(head.x, head.y, head.z);
      this.hasHeadCalibration = true;
    }
    if (pelvis) {
      this.calibratedPelvis.set(pelvis.x, pelvis.y, pelvis.z);
      this.hasPelvisCalibration = true;
    }
  }

  public clearCalibration(): void {
    this.hasHeadCalibration = false;
    this.hasPelvisCalibration = false;
  }

  public getDisplacements(positions: PosePositionMap): ReferenceDisplacements {
    const head = positions.headCenter;
    const pelvis = positions.pelvisCenter;
    const headDisplacement =
      this.hasHeadCalibration && head
        ? this.headDisplacement.set(head.x, head.y, head.z).sub(this.calibratedHead)
        : null;
    const pelvisDisplacement =
      this.hasPelvisCalibration && pelvis
        ? this.pelvisDisplacement.set(pelvis.x, pelvis.y, pelvis.z).sub(this.calibratedPelvis)
        : null;

    return {
      head: headDisplacement
        ? { x: headDisplacement.x, y: headDisplacement.y, z: headDisplacement.z }
        : null,
      pelvis: pelvisDisplacement
        ? { x: pelvisDisplacement.x, y: pelvisDisplacement.y, z: pelvisDisplacement.z }
        : null,
    };
  }

  public dispose(): void {
    for (const line of Object.values(this.lines)) line.dispose();
    this.clear();
  }

  private applyVisibility(): void {
    for (const [name, line] of Object.entries(this.lines) as [
      ReferenceLineName,
      DynamicReferenceLine,
    ][]) {
      line.visible = this.visibilityOptions[name];
    }
  }
}
