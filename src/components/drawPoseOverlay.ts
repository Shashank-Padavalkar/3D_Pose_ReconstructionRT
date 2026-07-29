import type { JointName } from '../pose/landmarkNames';
import { LANDMARK_NAMES } from '../pose/landmarkNames';
import { MEDIAPIPE_CONNECTIONS } from '../pose/poseConnections';
import type { PoseLandmark, ProcessedPoseFrame } from '../pose/poseTypes';

export interface OverlayReferenceState {
  headX?: number;
  pelvisX?: number;
}

export interface OverlayOptions {
  mirrored: boolean;
  confidenceThreshold: number;
  showLabels: boolean;
  showBoundingBox: boolean;
  showBodyCenterline: boolean;
  showHeadReference: boolean;
  showPelvisReference: boolean;
  showShoulderLine: boolean;
  showHipLine: boolean;
  showGroundLine: boolean;
  reference?: OverlayReferenceState;
  warning?: string | null;
}

interface RenderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateContainedRect(
  containerWidth: number,
  containerHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): RenderRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight };
  }
  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.65) return '#70e5ad';
  if (confidence >= 0.4) return '#f2ca69';
  return '#ef6f79';
}

function pointFor(
  landmark: PoseLandmark,
  rect: RenderRect,
  mirrored: boolean,
): { x: number; y: number } {
  const normalizedX = mirrored ? 1 - landmark.x : landmark.x;
  return { x: rect.x + normalizedX * rect.width, y: rect.y + landmark.y * rect.height };
}

function drawReferenceLine(
  context: CanvasRenderingContext2D,
  x: number,
  rect: RenderRect,
  mirrored: boolean,
  color: string,
): void {
  const displayX = rect.x + (mirrored ? 1 - x : x) * rect.width;
  context.save();
  context.strokeStyle = color;
  context.setLineDash([6, 6]);
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(displayX, rect.y);
  context.lineTo(displayX, rect.y + rect.height);
  context.stroke();
  context.restore();
}

function drawJointLine(
  context: CanvasRenderingContext2D,
  from: JointName,
  to: JointName,
  landmarks: ProcessedPoseFrame['normalized2D'],
  rect: RenderRect,
  options: OverlayOptions,
  color = 'rgba(121, 222, 239, 0.86)',
): void {
  const a = landmarks[from];
  const b = landmarks[to];
  if (!a || !b) return;
  const pa = pointFor(a, rect, options.mirrored);
  const pb = pointFor(b, rect, options.mirrored);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(pa.x, pa.y);
  context.lineTo(pb.x, pb.y);
  context.stroke();
}

export function drawPoseOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: ProcessedPoseFrame | null,
  options: OverlayOptions,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
  const targetHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (!frame) return;

  const rect = calculateContainedRect(
    bounds.width,
    bounds.height,
    video.videoWidth || 16,
    video.videoHeight || 9,
  );
  const landmarks = frame.normalized2D;

  if (options.showHeadReference && options.reference?.headX !== undefined) {
    drawReferenceLine(context, options.reference.headX, rect, options.mirrored, '#7ce6f4');
  }
  if (options.showPelvisReference && options.reference?.pelvisX !== undefined) {
    drawReferenceLine(context, options.reference.pelvisX, rect, options.mirrored, '#b79af9');
  }

  context.save();
  for (const connection of MEDIAPIPE_CONNECTIONS) {
    drawJointLine(context, connection.from, connection.to, landmarks, rect, options);
  }
  if (options.showShoulderLine) {
    drawJointLine(context, 'leftShoulder', 'rightShoulder', landmarks, rect, options, '#f1d47b');
  }
  if (options.showHipLine) {
    drawJointLine(context, 'leftHip', 'rightHip', landmarks, rect, options, '#b69af7');
  }
  if (options.showBodyCenterline) {
    drawJointLine(context, 'shoulderCenter', 'pelvisCenter', landmarks, rect, options, '#efeff5');
  }

  const visiblePoints: { x: number; y: number }[] = [];
  for (const name of LANDMARK_NAMES) {
    const landmark = landmarks[name];
    if (!landmark) continue;
    const confidence = Math.min(landmark.visibility, landmark.presence);
    const point = pointFor(landmark, rect, options.mirrored);
    if (confidence >= options.confidenceThreshold) visiblePoints.push(point);
    context.fillStyle = confidenceColor(confidence);
    context.globalAlpha = confidence >= options.confidenceThreshold ? 1 : 0.35;
    context.beginPath();
    context.arc(
      point.x,
      point.y,
      name.includes('Eye') || name.includes('mouth') ? 2 : 3.5,
      0,
      Math.PI * 2,
    );
    context.fill();
    if (options.showLabels) {
      context.globalAlpha = 0.9;
      context.font = '10px Inter, system-ui, sans-serif';
      context.fillText(name, point.x + 5, point.y - 4);
    }
  }
  context.globalAlpha = 1;

  if (options.showBoundingBox && visiblePoints.length >= 4) {
    const xs = visiblePoints.map((point) => point.x);
    const ys = visiblePoints.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    context.strokeStyle = 'rgba(112, 229, 173, 0.6)';
    context.setLineDash([5, 4]);
    context.strokeRect(left - 8, top - 8, Math.max(...xs) - left + 16, Math.max(...ys) - top + 16);
  }

  if (options.showGroundLine) {
    const leftFoot = landmarks.leftFootIndex;
    const rightFoot = landmarks.rightFootIndex;
    const footY = Math.max(leftFoot?.y ?? 0.94, rightFoot?.y ?? 0.94);
    const displayY = rect.y + footY * rect.height;
    context.strokeStyle = 'rgba(124, 230, 244, 0.65)';
    context.setLineDash([8, 5]);
    context.beginPath();
    context.moveTo(rect.x, displayY);
    context.lineTo(rect.x + rect.width, displayY);
    context.stroke();
  }

  if (options.warning) {
    context.fillStyle = 'rgba(24, 18, 13, 0.82)';
    context.fillRect(rect.x + 14, rect.y + 14, Math.min(rect.width - 28, 420), 38);
    context.fillStyle = '#f2ca69';
    context.font = '600 13px Inter, system-ui, sans-serif';
    context.fillText(options.warning, rect.x + 28, rect.y + 38);
  }
  context.restore();
}
