import { clamp } from './clamp';
import type { Vec3Data } from '../pose/poseTypes';

export const EPSILON = 1e-7;

export function vec3(x = 0, y = 0, z = 0): Vec3Data {
  return { x, y, z };
}

export function add(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(value: Vec3Data, scalar: number): Vec3Data {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

export function dot(a: Vec3Data, b: Vec3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3Data, b: Vec3Data): Vec3Data {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSquared(value: Vec3Data): number {
  return dot(value, value);
}

export function length(value: Vec3Data): number {
  return Math.sqrt(lengthSquared(value));
}

export function distance(a: Vec3Data, b: Vec3Data): number {
  return length(subtract(a, b));
}

export function normalize(value: Vec3Data): Vec3Data | null {
  const magnitude = length(value);
  return magnitude > EPSILON && Number.isFinite(magnitude) ? scale(value, 1 / magnitude) : null;
}

export function midpoint(a: Vec3Data, b: Vec3Data): Vec3Data {
  return scale(add(a, b), 0.5);
}

export function interpolate(a: Vec3Data, b: Vec3Data, amount: number): Vec3Data {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
  };
}

export function average(points: readonly Vec3Data[]): Vec3Data | null {
  if (points.length === 0) return null;
  const sum = points.reduce<Vec3Data>((result, point) => add(result, point), vec3());
  return scale(sum, 1 / points.length);
}

export function clampMagnitude(value: Vec3Data, maximum: number): Vec3Data {
  const magnitude = length(value);
  return magnitude > maximum && magnitude > EPSILON ? scale(value, maximum / magnitude) : value;
}

export function isFiniteVec3(value: unknown): value is Vec3Data {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y) &&
    typeof candidate.z === 'number' &&
    Number.isFinite(candidate.z)
  );
}

export function normalizeAngleDeg(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function safeAcos(value: number): number {
  return Math.acos(clamp(value, -1, 1));
}
