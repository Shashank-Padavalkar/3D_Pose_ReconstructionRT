import {
  CylinderGeometry,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { JointName } from '../pose/landmarkNames';
import type { QuaternionData } from '../pose/poseTypes';
import type { PoseConfidenceMap, PosePositionMap, PosePredictionMap } from './renderTypes';

type BodySide = 'left' | 'right' | 'center';
type RadiusBasis = 'shoulders' | 'hips';

interface SegmentDefinition {
  name: string;
  from: JointName;
  to: JointName;
  side: BodySide;
  radiusBasis: RadiusBasis;
  radiusFactor: number;
  minimumRadius: number;
  maximumRadius: number;
}

interface SegmentPart {
  definition: SegmentDefinition;
  mesh: Mesh<CylinderGeometry, MeshStandardMaterial>;
}

interface JointPart {
  name: JointName;
  side: BodySide;
  mesh: Mesh<SphereGeometry, MeshStandardMaterial>;
}

export interface MannequinPoseData {
  positions: PosePositionMap;
  confidences: PoseConfidenceMap;
  predicted: PosePredictionMap;
  pelvisOrientation?: QuaternionData | null;
  chestOrientation?: QuaternionData | null;
  headOrientation?: QuaternionData | null;
}

const SEGMENTS: readonly SegmentDefinition[] = [
  {
    name: 'neck',
    from: 'chestCenter',
    to: 'headCenter',
    side: 'center',
    radiusBasis: 'shoulders',
    radiusFactor: 0.055,
    minimumRadius: 0.018,
    maximumRadius: 0.06,
  },
  {
    name: 'left-upper-arm',
    from: 'leftShoulder',
    to: 'leftElbow',
    side: 'left',
    radiusBasis: 'shoulders',
    radiusFactor: 0.065,
    minimumRadius: 0.018,
    maximumRadius: 0.065,
  },
  {
    name: 'left-forearm',
    from: 'leftElbow',
    to: 'leftWrist',
    side: 'left',
    radiusBasis: 'shoulders',
    radiusFactor: 0.05,
    minimumRadius: 0.014,
    maximumRadius: 0.052,
  },
  {
    name: 'left-hand',
    from: 'leftWrist',
    to: 'leftHandCenter',
    side: 'left',
    radiusBasis: 'shoulders',
    radiusFactor: 0.05,
    minimumRadius: 0.014,
    maximumRadius: 0.05,
  },
  {
    name: 'right-upper-arm',
    from: 'rightShoulder',
    to: 'rightElbow',
    side: 'right',
    radiusBasis: 'shoulders',
    radiusFactor: 0.065,
    minimumRadius: 0.018,
    maximumRadius: 0.065,
  },
  {
    name: 'right-forearm',
    from: 'rightElbow',
    to: 'rightWrist',
    side: 'right',
    radiusBasis: 'shoulders',
    radiusFactor: 0.05,
    minimumRadius: 0.014,
    maximumRadius: 0.052,
  },
  {
    name: 'right-hand',
    from: 'rightWrist',
    to: 'rightHandCenter',
    side: 'right',
    radiusBasis: 'shoulders',
    radiusFactor: 0.05,
    minimumRadius: 0.014,
    maximumRadius: 0.05,
  },
  {
    name: 'left-thigh',
    from: 'leftHip',
    to: 'leftKnee',
    side: 'left',
    radiusBasis: 'hips',
    radiusFactor: 0.12,
    minimumRadius: 0.028,
    maximumRadius: 0.095,
  },
  {
    name: 'left-shin',
    from: 'leftKnee',
    to: 'leftAnkle',
    side: 'left',
    radiusBasis: 'hips',
    radiusFactor: 0.085,
    minimumRadius: 0.02,
    maximumRadius: 0.075,
  },
  {
    name: 'left-foot',
    from: 'leftHeel',
    to: 'leftFootIndex',
    side: 'left',
    radiusBasis: 'hips',
    radiusFactor: 0.075,
    minimumRadius: 0.018,
    maximumRadius: 0.065,
  },
  {
    name: 'right-thigh',
    from: 'rightHip',
    to: 'rightKnee',
    side: 'right',
    radiusBasis: 'hips',
    radiusFactor: 0.12,
    minimumRadius: 0.028,
    maximumRadius: 0.095,
  },
  {
    name: 'right-shin',
    from: 'rightKnee',
    to: 'rightAnkle',
    side: 'right',
    radiusBasis: 'hips',
    radiusFactor: 0.085,
    minimumRadius: 0.02,
    maximumRadius: 0.075,
  },
  {
    name: 'right-foot',
    from: 'rightHeel',
    to: 'rightFootIndex',
    side: 'right',
    radiusBasis: 'hips',
    radiusFactor: 0.075,
    minimumRadius: 0.018,
    maximumRadius: 0.065,
  },
] as const;

const JOINTS: readonly { name: JointName; side: BodySide }[] = [
  { name: 'headCenter', side: 'center' },
  { name: 'neckCenter', side: 'center' },
  { name: 'chestCenter', side: 'center' },
  { name: 'pelvisCenter', side: 'center' },
  { name: 'leftShoulder', side: 'left' },
  { name: 'leftElbow', side: 'left' },
  { name: 'leftWrist', side: 'left' },
  { name: 'leftHip', side: 'left' },
  { name: 'leftKnee', side: 'left' },
  { name: 'leftAnkle', side: 'left' },
  { name: 'rightShoulder', side: 'right' },
  { name: 'rightElbow', side: 'right' },
  { name: 'rightWrist', side: 'right' },
  { name: 'rightHip', side: 'right' },
  { name: 'rightKnee', side: 'right' },
  { name: 'rightAnkle', side: 'right' },
] as const;

const UP = new Vector3(0, 1, 0);

function isUsableNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function isUsableQuaternion(value: QuaternionData | null | undefined): value is QuaternionData {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}

export class ProceduralMannequin extends Group {
  private readonly segmentGeometry = new CylinderGeometry(1, 1, 1, 14, 1, false);
  private readonly sphereGeometry = new SphereGeometry(1, 18, 12);
  private readonly materials = {
    left: new MeshStandardMaterial({ color: 0x36d6df, roughness: 0.56, metalness: 0.08 }),
    right: new MeshStandardMaterial({ color: 0x6287ff, roughness: 0.56, metalness: 0.08 }),
    center: new MeshStandardMaterial({ color: 0xa9c5d6, roughness: 0.62, metalness: 0.04 }),
    lowConfidence: new MeshStandardMaterial({
      color: 0xf05c67,
      emissive: 0x421018,
      roughness: 0.72,
    }),
    predicted: new MeshStandardMaterial({
      color: 0xf1b64a,
      emissive: 0x3b2707,
      roughness: 0.66,
      transparent: true,
      opacity: 0.78,
    }),
  };
  private readonly segments: SegmentPart[] = [];
  private readonly joints: JointPart[] = [];
  private readonly chest: Mesh<SphereGeometry, MeshStandardMaterial>;
  private readonly pelvis: Mesh<SphereGeometry, MeshStandardMaterial>;
  private readonly head: Mesh<SphereGeometry, MeshStandardMaterial>;
  private readonly fromVector = new Vector3();
  private readonly toVector = new Vector3();
  private readonly direction = new Vector3();
  private readonly midpoint = new Vector3();
  private readonly xAxis = new Vector3();
  private readonly yAxis = new Vector3();
  private readonly zAxis = new Vector3();
  private readonly rotationMatrix = new Matrix4();
  private readonly scratchQuaternion = new Quaternion();
  private shoulderWidth = 0.4;
  private hipWidth = 0.3;
  private torsoLength = 0.52;

  public constructor() {
    super();
    this.name = 'procedural-mannequin';

    for (const definition of SEGMENTS) {
      const mesh = new Mesh(this.segmentGeometry, this.materials[definition.side]);
      mesh.name = definition.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.add(mesh);
      this.segments.push({ definition, mesh });
    }

    for (const joint of JOINTS) {
      const mesh = new Mesh(this.sphereGeometry, this.materials[joint.side]);
      mesh.name = `joint-${joint.name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.add(mesh);
      this.joints.push({ ...joint, mesh });
    }

    this.chest = this.createBodyMesh('chest');
    this.pelvis = this.createBodyMesh('pelvis');
    this.head = this.createBodyMesh('head');
  }

  public update(data: MannequinPoseData): void {
    this.updateProportions(data.positions);

    for (const segment of this.segments) this.updateSegment(segment, data);
    for (const joint of this.joints) this.updateJoint(joint, data);

    this.updateChest(data);
    this.updatePelvis(data);
    this.updateHead(data);
  }

  public setWireframe(enabled: boolean): void {
    for (const material of Object.values(this.materials)) material.wireframe = enabled;
  }

  public dispose(): void {
    this.segmentGeometry.dispose();
    this.sphereGeometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.clear();
  }

  private createBodyMesh(name: string): Mesh<SphereGeometry, MeshStandardMaterial> {
    const mesh = new Mesh(this.sphereGeometry, this.materials.center);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.add(mesh);
    return mesh;
  }

  private updateProportions(positions: PosePositionMap): void {
    const leftShoulder = positions.leftShoulder;
    const rightShoulder = positions.rightShoulder;
    if (leftShoulder && rightShoulder) {
      this.shoulderWidth = MathUtils.clamp(
        this.fromVector
          .set(leftShoulder.x, leftShoulder.y, leftShoulder.z)
          .distanceTo(this.toVector.set(rightShoulder.x, rightShoulder.y, rightShoulder.z)),
        0.18,
        0.72,
      );
    }

    const leftHip = positions.leftHip;
    const rightHip = positions.rightHip;
    if (leftHip && rightHip) {
      this.hipWidth = MathUtils.clamp(
        this.fromVector
          .set(leftHip.x, leftHip.y, leftHip.z)
          .distanceTo(this.toVector.set(rightHip.x, rightHip.y, rightHip.z)),
        0.16,
        0.58,
      );
    }

    const pelvisCenter = positions.pelvisCenter;
    const neckCenter = positions.neckCenter;
    if (pelvisCenter && neckCenter) {
      this.torsoLength = MathUtils.clamp(
        this.fromVector
          .set(pelvisCenter.x, pelvisCenter.y, pelvisCenter.z)
          .distanceTo(this.toVector.set(neckCenter.x, neckCenter.y, neckCenter.z)),
        0.28,
        0.9,
      );
    }
  }

  private updateSegment(segment: SegmentPart, data: MannequinPoseData): void {
    const { definition, mesh } = segment;
    const from = data.positions[definition.from];
    const to = data.positions[definition.to];
    if (!from || !to) {
      mesh.visible = false;
      return;
    }

    this.fromVector.set(from.x, from.y, from.z);
    this.toVector.set(to.x, to.y, to.z);
    this.direction.subVectors(this.toVector, this.fromVector);
    const length = this.direction.length();
    if (!Number.isFinite(length) || length < 1e-5) {
      mesh.visible = false;
      return;
    }

    this.midpoint.addVectors(this.fromVector, this.toVector).multiplyScalar(0.5);
    const basis = definition.radiusBasis === 'shoulders' ? this.shoulderWidth : this.hipWidth;
    const radius = MathUtils.clamp(
      basis * definition.radiusFactor,
      definition.minimumRadius,
      definition.maximumRadius,
    );

    mesh.position.copy(this.midpoint);
    mesh.quaternion.setFromUnitVectors(UP, this.direction.multiplyScalar(1 / length));
    mesh.scale.set(radius, length, radius);
    mesh.material = this.pickMaterial(
      definition.side,
      this.minimumConfidence(data.confidences, definition.from, definition.to),
      Boolean(data.predicted[definition.from] || data.predicted[definition.to]),
    );
    mesh.visible = true;
  }

  private updateJoint(joint: JointPart, data: MannequinPoseData): void {
    const position = data.positions[joint.name];
    if (!position) {
      joint.mesh.visible = false;
      return;
    }

    const confidence = data.confidences[joint.name];
    const basis =
      joint.name.includes('Hip') || joint.name.includes('Knee') || joint.name.includes('Ankle')
        ? this.hipWidth
        : this.shoulderWidth;
    const radius = MathUtils.clamp(basis * 0.04, 0.012, 0.045);
    joint.mesh.position.set(position.x, position.y, position.z);
    joint.mesh.scale.setScalar(radius);
    joint.mesh.material = this.pickMaterial(
      joint.side,
      confidence ?? 1,
      Boolean(data.predicted[joint.name]),
    );
    joint.mesh.visible = true;
  }

  private updateChest(data: MannequinPoseData): void {
    const center = data.positions.chestCenter;
    if (!center) {
      this.chest.visible = false;
      return;
    }

    this.chest.position.set(center.x, center.y, center.z);
    this.chest.scale.set(
      this.shoulderWidth * 0.43,
      this.torsoLength * 0.3,
      this.shoulderWidth * 0.24,
    );
    this.applyBodyOrientation(
      this.chest,
      data.chestOrientation,
      data.positions.leftShoulder,
      data.positions.rightShoulder,
      data.positions.pelvisCenter,
      data.positions.neckCenter,
    );
    this.chest.material = this.pickMaterial(
      'center',
      this.minimumConfidence(data.confidences, 'leftShoulder', 'rightShoulder', 'chestCenter'),
      Boolean(data.predicted.chestCenter),
    );
    this.chest.visible = true;
  }

  private updatePelvis(data: MannequinPoseData): void {
    const center = data.positions.pelvisCenter;
    if (!center) {
      this.pelvis.visible = false;
      return;
    }

    this.pelvis.position.set(center.x, center.y, center.z);
    this.pelvis.scale.set(this.hipWidth * 0.52, this.torsoLength * 0.15, this.hipWidth * 0.34);
    this.applyBodyOrientation(
      this.pelvis,
      data.pelvisOrientation,
      data.positions.leftHip,
      data.positions.rightHip,
      data.positions.pelvisCenter,
      data.positions.spineMid,
    );
    this.pelvis.material = this.pickMaterial(
      'center',
      this.minimumConfidence(data.confidences, 'leftHip', 'rightHip', 'pelvisCenter'),
      Boolean(data.predicted.pelvisCenter),
    );
    this.pelvis.visible = true;
  }

  private updateHead(data: MannequinPoseData): void {
    const center = data.positions.headCenter;
    if (!center) {
      this.head.visible = false;
      return;
    }

    this.head.position.set(center.x, center.y, center.z);
    this.head.scale.set(
      MathUtils.clamp(this.shoulderWidth * 0.17, 0.06, 0.14),
      MathUtils.clamp(this.shoulderWidth * 0.22, 0.08, 0.18),
      MathUtils.clamp(this.shoulderWidth * 0.16, 0.055, 0.13),
    );
    if (isUsableQuaternion(data.headOrientation)) {
      this.head.quaternion
        .set(
          data.headOrientation.x,
          data.headOrientation.y,
          data.headOrientation.z,
          data.headOrientation.w,
        )
        .normalize();
    }
    this.head.material = this.pickMaterial(
      'center',
      data.confidences.headCenter ?? data.confidences.nose ?? 1,
      Boolean(data.predicted.headCenter),
    );
    this.head.visible = true;
  }

  private applyBodyOrientation(
    mesh: Mesh,
    orientation: QuaternionData | null | undefined,
    left: PosePositionMap[JointName],
    right: PosePositionMap[JointName],
    bottom: PosePositionMap[JointName],
    top: PosePositionMap[JointName],
  ): void {
    if (isUsableQuaternion(orientation)) {
      mesh.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w).normalize();
      return;
    }

    if (!left || !right || !bottom || !top) return;
    this.xAxis.set(right.x - left.x, right.y - left.y, right.z - left.z).normalize();
    this.yAxis.set(top.x - bottom.x, top.y - bottom.y, top.z - bottom.z).normalize();
    this.zAxis.crossVectors(this.xAxis, this.yAxis).normalize();
    if (this.zAxis.lengthSq() < 1e-8) return;
    this.yAxis.crossVectors(this.zAxis, this.xAxis).normalize();
    this.rotationMatrix.makeBasis(this.xAxis, this.yAxis, this.zAxis);
    this.scratchQuaternion.setFromRotationMatrix(this.rotationMatrix);
    mesh.quaternion.copy(this.scratchQuaternion);
  }

  private minimumConfidence(confidences: PoseConfidenceMap, ...names: JointName[]): number {
    let minimum = 1;
    let found = false;
    for (const name of names) {
      const confidence = confidences[name];
      if (!isUsableNumber(confidence)) continue;
      minimum = Math.min(minimum, confidence);
      found = true;
    }
    return found ? minimum : 1;
  }

  private pickMaterial(
    side: BodySide,
    confidence: number,
    predicted: boolean,
  ): MeshStandardMaterial {
    if (predicted) return this.materials.predicted;
    if (confidence < 0.65) return this.materials.lowConfidence;
    return this.materials[side];
  }
}
