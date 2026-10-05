/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Compile-time scalar topology. Runtime point and interval evaluation use compiled scratch. */
import type { RiderOccupancyIntervalInput, RiderOccupancyPose } from './riderOccupancy.ts';
export interface Range { readonly lo: number; readonly hi: number }
export type Scalar =
  | { readonly op: 'constant'; readonly value: number }
  | { readonly op: 'affine'; readonly from: number; readonly to: number }
  | { readonly op: 'add' | 'sub' | 'mul' | 'min' | 'max'; readonly a: Scalar; readonly b: Scalar }
  | { readonly op: 'neg' | 'abs' | 'sin' | 'cos' | 'sqrt01' | 'clamp01'; readonly a: Scalar };
export interface Vec { readonly x: Scalar; readonly y: Scalar; readonly z: Scalar }
export type Primitive =
  | { readonly component: 'wheel' | 'human'; readonly kind: 'sphere'; readonly centre: Vec; readonly radius: Scalar }
  | { readonly component: 'wheel' | 'human'; readonly kind: 'box'; readonly centre: Vec; readonly half: Vec };
export interface Aabb { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

export const c = (value: number): Scalar => ({ op: 'constant', value });
export const affine = (from: number, to: number): Scalar => from === to ? c(from) : ({ op: 'affine', from, to });
export const add = (a: Scalar, b: Scalar): Scalar => ({ op: 'add', a, b });
export const sub = (a: Scalar, b: Scalar): Scalar => ({ op: 'sub', a, b });
export const mul = (a: Scalar, b: Scalar): Scalar => ({ op: 'mul', a, b });
export const neg = (a: Scalar): Scalar => ({ op: 'neg', a });
export const abs = (a: Scalar): Scalar => ({ op: 'abs', a });
export const min = (a: Scalar, b: Scalar): Scalar => ({ op: 'min', a, b });
export const max = (a: Scalar, b: Scalar): Scalar => ({ op: 'max', a, b });
export const sin = (a: Scalar): Scalar => ({ op: 'sin', a });
export const cos = (a: Scalar): Scalar => ({ op: 'cos', a });
export const clamp01 = (a: Scalar): Scalar => ({ op: 'clamp01', a });
export const sqrt01 = (a: Scalar): Scalar => ({ op: 'sqrt01', a });
export const clamp = (a: Scalar, low: number, high: number): Scalar => max(c(low), min(c(high), a));
export const oneMinus = (a: Scalar): Scalar => sub(c(1), a);
export const lerp = (a: Scalar, b: Scalar, t: Scalar): Scalar => add(a, mul(sub(b, a), t));
export const sum = (...values: Scalar[]): Scalar => values.slice(1).reduce(add, values[0]);
export const vec = (x: Scalar, y: Scalar, z: Scalar): Vec => ({ x, y, z });
export const fixedVec = (x: number, y: number, z: number): Vec => vec(c(x), c(y), c(z));
export const vadd = (a: Vec, b: Vec): Vec => vec(add(a.x, b.x), add(a.y, b.y), add(a.z, b.z));
export const vsub = (a: Vec, b: Vec): Vec => vec(sub(a.x, b.x), sub(a.y, b.y), sub(a.z, b.z));
export const scale = (a: Vec, n: Scalar): Vec => vec(mul(a.x, n), mul(a.y, n), mul(a.z, n));
export const mix = (a: Vec, b: Vec, t: Scalar): Vec => vec(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
export const squareLength = (a: Vec): Scalar => sum(mul(a.x, a.x), mul(a.y, a.y), mul(a.z, a.z));
const cross = (a: Vec, b: Vec): Vec => vec(sub(mul(a.y, b.z), mul(a.z, b.y)), sub(mul(a.z, b.x), mul(a.x, b.z)), sub(mul(a.x, b.y), mul(a.y, b.x)));
export type Q = readonly [Scalar, Scalar, Scalar, Scalar];

/** Exactly the helper's XYZ Euler (Rx * Ry * Rz) expressions. */
export function euler(x: Scalar, y: Scalar, z: Scalar): Q {
  const cx = cos(mul(x, c(.5))), cy = cos(mul(y, c(.5))), cz = cos(mul(z, c(.5)));
  const sx = sin(mul(x, c(.5))), sy = sin(mul(y, c(.5))), sz = sin(mul(z, c(.5)));
  return [add(mul(mul(sx, cy), cz), mul(mul(cx, sy), sz)),
    sub(mul(mul(cx, sy), cz), mul(mul(sx, cy), sz)),
    add(mul(mul(cx, cy), sz), mul(mul(sx, sy), cz)),
    sub(mul(mul(cx, cy), cz), mul(mul(sx, sy), sz))];
}
export function mulQ(a: Q, b: Q): Q {
  return [sub(sum(mul(a[0], b[3]), mul(a[3], b[0]), mul(a[1], b[2])), mul(a[2], b[1])),
    sub(sum(mul(a[1], b[3]), mul(a[3], b[1]), mul(a[2], b[0])), mul(a[0], b[2])),
    sub(sum(mul(a[2], b[3]), mul(a[3], b[2]), mul(a[0], b[1])), mul(a[1], b[0])),
    sub(sub(sub(mul(a[3], b[3]), mul(a[0], b[0])), mul(a[1], b[1])), mul(a[2], b[2]))];
}
export function rotate(q: Q, p: Vec): Vec {
  const xyz = vec(q[0], q[1], q[2]), t = scale(cross(xyz, p), c(2));
  return vadd(p, vadd(scale(t, q[3]), cross(xyz, t)));
}

export type PoseDAG = { readonly [K in Exclude<keyof RiderOccupancyPose, 'ragdoll'>]: Scalar };
export function poseDAG(input: RiderOccupancyIntervalInput): PoseDAG {
  const result: Record<string, Scalar> = {};
  for (const key of Object.keys(input.previous) as Array<keyof RiderOccupancyPose>) {
    if (key === 'ragdoll') continue;
    const first = input.previous[key], last = input.current[key];
    if (!Number.isFinite(first) || !Number.isFinite(last)) throw new RangeError(`Non-finite occupancy pose ${key}`);
    result[key] = affine(first, last);
  }
  // Heading is an unwrapped physical scalar in interpolateRiderOccupancyPose.
  return result as PoseDAG;
}
export function checkInterval(from: number, to: number): void {
  if (!(Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to <= 1 && to >= from)) throw new RangeError('Occupancy interval must lie in [0,1]');
}
