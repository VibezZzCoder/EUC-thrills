/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Interval bounds for the live helper's possibly nonorthogonal particle frame. */
import type { RiderOccupancyIntervalInput } from './riderOccupancy.ts';
import type { Range } from './occupancyExpressions.ts';

type RV = readonly [Range, Range, Range];
const single = (value: number): Range => ({ lo: value, hi: value });
const plus = (a: Range, b: Range): Range => ({ lo: a.lo + b.lo, hi: a.hi + b.hi });
const minus = (a: Range, b: Range): Range => ({ lo: a.lo - b.hi, hi: a.hi - b.lo });
const times = (a: Range, b: Range): Range => { const values = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi]; return { lo: Math.min(...values), hi: Math.max(...values) }; };
const union = (a: Range, b: Range): Range => ({ lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) });
const positiveDivide = (a: Range, b: Range): Range => {
  if (!(b.lo > 0)) throw new RangeError('Uncertified rag frame division');
  return times(a, { lo: 1 / b.hi, hi: 1 / b.lo });
};
const root = (a: Range): Range => ({ lo: Math.sqrt(Math.max(0, a.lo)), hi: Math.sqrt(Math.max(0, a.hi)) });
const maximumAbsolute = (a: Range): number => Math.max(Math.abs(a.lo), Math.abs(a.hi));
const nearestZero = (a: Range): number => a.lo > 0 ? a.lo : a.hi < 0 ? -a.hi : 0;
const lowerSquare = (a: RV): number => a.reduce((sum, value) => sum + nearestZero(value) ** 2, 0);
const upperSquare = (a: RV): number => a.reduce((sum, value) => sum + maximumAbsolute(value) ** 2, 0);
const cross = (a: RV, b: RV): RV => [minus(times(a[1], b[2]), times(a[2], b[1])), minus(times(a[2], b[0]), times(a[0], b[2])), minus(times(a[0], b[1]), times(a[1], b[0]))];

const NORMAL_SQUARE = 1e-8; // The live helper's normal() branch threshold.
interface NormalField { readonly ranges: RV; readonly normalizedOnly: boolean; readonly lowerSquared: number }
function normalized(raw: RV, fallback: RV): NormalField {
  const lowerSquared = lowerSquare(raw), upperSquared = upperSquare(raw);
  if (upperSquared < NORMAL_SQUARE) return { ranges: fallback, normalizedOnly: false, lowerSquared };
  const magnitude: Range = { lo: Math.sqrt(Math.max(NORMAL_SQUARE, lowerSquared)), hi: Math.sqrt(upperSquared) };
  const normalized = raw.map(value => {
    const bound = positiveDivide(value, magnitude);
    // A genuinely normalized component is always in [-1,1].
    return { lo: Math.max(-1, bound.lo), hi: Math.min(1, bound.hi) };
  }) as unknown as RV;
  return { ranges: lowerSquared >= NORMAL_SQUARE ? normalized : normalized.map((value, index) => union(value, fallback[index])) as unknown as RV,
    normalizedOnly: lowerSquared >= NORMAL_SQUARE, lowerSquared };
}

export interface RagFrameRangeBound {
  readonly normalizedFrameCertified: boolean;
  readonly upSquaredLower: number; readonly forwardSquaredLower: number; readonly lateralSquaredLower: number;
  readonly quaternionNormUpper: number;
  readonly quaternionRanges: readonly [Range, Range, Range, Range];
  /** Keep certified basis outcomes correlated until a rotation chart is proved. */
  readonly quaternionBranches: readonly QuaternionRanges[];
  /** Bound for the actual rotate(q,v), including nonunit basis/slerp output. */
  readonly rotationGain: number;
}

/**
 * basisQuaternion branches are unioned, never selected by a midpoint. Unit
 * frame columns imply each extracted quaternion component is at most one:
 * the positive-trace denominator is >= 1; in the nontrace branches the chosen
 * diagonal and trace<=0 imply 1+chosen-other-other >= 1. Thus ||q||<=2 is an
 * independent cap, while these local intervals normally establish ||q||≈1.
 */
function quaternionRange(x: RV, y: RV, z: RV): { norm: number; ranges: readonly [Range, Range, Range, Range]; branches: readonly QuaternionRanges[] } {
  const trace = plus(plus(x[0], y[1]), z[2]), outcomes: (readonly Range[])[] = [];
  if (trace.hi > 0) {
    const t: Range = { lo: Math.max(0, trace.lo), hi: Math.min(3, trace.hi) };
    const d = root(plus(single(1), t)), factor = positiveDivide(single(.5), d);
    outcomes.push([times(minus(y[2], z[1]), factor), times(minus(z[0], x[2]), factor), times(minus(x[1], y[0]), factor), times(single(.5), d)]);
  }
  if (trace.lo <= 0) {
    if (x[0].hi > y[1].lo && x[0].hi > z[2].lo) {
      const d = root({ lo: Math.max(1, minus(minus(plus(single(1), x[0]), y[1]), z[2]).lo), hi: Math.min(4, minus(minus(plus(single(1), x[0]), y[1]), z[2]).hi) });
      const s = times(single(2), d);
      outcomes.push([times(single(.5), d), positiveDivide(plus(y[0], x[1]), s), positiveDivide(plus(z[0], x[2]), s), positiveDivide(minus(y[2], z[1]), s)]);
    }
    if (y[1].hi > z[2].lo && !(x[0].lo > y[1].hi && x[0].lo > z[2].hi)) {
      const raw = minus(minus(plus(single(1), y[1]), x[0]), z[2]), d = root({ lo: Math.max(1, raw.lo), hi: Math.min(4, raw.hi) }), s = times(single(2), d);
      outcomes.push([positiveDivide(plus(y[0], x[1]), s), times(single(.5), d), positiveDivide(plus(z[1], y[2]), s), positiveDivide(minus(z[0], x[2]), s)]);
    }
    if (!(x[0].lo > y[1].hi && x[0].lo > z[2].hi) && !(y[1].lo > z[2].hi)) {
      const raw = minus(minus(plus(single(1), z[2]), x[0]), y[1]), d = root({ lo: Math.max(1, raw.lo), hi: Math.min(4, raw.hi) }), s = times(single(2), d);
      outcomes.push([positiveDivide(plus(z[0], x[2]), s), positiveDivide(plus(z[1], y[2]), s), times(single(.5), d), positiveDivide(minus(x[1], y[0]), s)]);
    }
  }
  if (!outcomes.length) throw new RangeError('No certified rag basisQuaternion branch');
  const all = [0, 1, 2, 3].map(component => outcomes.slice(1).reduce((result, q) => union(result, q[component]), outcomes[0][component]));
  return { norm: Math.min(2, Math.max(...outcomes.map(q => Math.hypot(...q.map(maximumAbsolute))))), ranges: all as unknown as readonly [Range, Range, Range, Range], branches: outcomes as unknown as readonly QuaternionRanges[] };
}

export function poseRange(input: RiderOccupancyIntervalInput, key: Exclude<keyof typeof input.previous, 'ragdoll'>, from: number, to: number): Range {
  const first = input.previous[key], slope = input.current[key] - first, a = first + slope * from, b = first + slope * to;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}
export type QuaternionRanges = readonly [Range, Range, Range, Range];
const trig = (a: Range, cosine: boolean): Range => {
  if (a.hi - a.lo >= Math.PI * 2) return { lo: -1, hi: 1 };
  const fn = cosine ? Math.cos : Math.sin, phase = cosine ? 0 : Math.PI / 2; let lo = Math.min(fn(a.lo), fn(a.hi)), hi = Math.max(fn(a.lo), fn(a.hi));
  for (let i = Math.ceil((a.lo - phase) / Math.PI); i <= Math.floor((a.hi - phase) / Math.PI); i += 1) { lo = Math.min(lo, fn(phase + i * Math.PI)); hi = Math.max(hi, fn(phase + i * Math.PI)); }
  return { lo, hi };
};
const negative = (a: Range): Range => ({ lo: -a.hi, hi: -a.lo });
function eulerRanges(x: Range, y: Range, z: Range): QuaternionRanges {
  const half = single(.5), cx = trig(times(x, half), true), cy = trig(times(y, half), true), cz = trig(times(z, half), true),
    sx = trig(times(x, half), false), sy = trig(times(y, half), false), sz = trig(times(z, half), false);
  return [plus(times(times(sx, cy), cz), times(times(cx, sy), sz)), minus(times(times(cx, sy), cz), times(times(sx, cy), sz)),
    plus(times(times(cx, cy), sz), times(times(sx, sy), cz)), minus(times(times(cx, cy), cz), times(times(sx, sy), sz))];
}
function multiplyQ(a: QuaternionRanges, b: QuaternionRanges): QuaternionRanges {
  return [minus(plus(plus(times(a[0], b[3]), times(a[3], b[0])), times(a[1], b[2])), times(a[2], b[1])),
    minus(plus(plus(times(a[1], b[3]), times(a[3], b[1])), times(a[2], b[0])), times(a[0], b[2])),
    minus(plus(plus(times(a[2], b[3]), times(a[3], b[2])), times(a[0], b[1])), times(a[1], b[0])),
    minus(minus(minus(times(a[3], b[3]), times(a[0], b[0])), times(a[1], b[1])), times(a[2], b[2]))];
}
const addV = (a: RV, b: RV): RV => a.map((r, i) => plus(r, b[i])) as unknown as RV;
const scaleV = (a: RV, b: Range): RV => a.map(r => times(r, b)) as unknown as RV;
function rotateRange(q: QuaternionRanges, p: RV): RV {
  const xyz: RV = [q[0], q[1], q[2]], t = scaleV(cross(xyz, p), single(2));
  return addV(p, addV(scaleV(t, q[3]), cross(xyz, t)));
}
function groundRanges(input: RiderOccupancyIntervalInput, from: number, to: number): QuaternionRanges {
  const p = (key: Exclude<keyof typeof input.previous, 'ragdoll'>) => poseRange(input, key, from, to);
  return multiplyQ(eulerRanges(p('groundPitch'), single(0), p('groundRoll')), eulerRanges(p('wheelPitch'), single(0), negative(p('rollAngle'))));
}
export function mountedQuaternionRanges(input: RiderOccupancyIntervalInput, from: number, to: number): QuaternionRanges {
  return multiplyQ(groundRanges(input, from, to), eulerRanges(poseRange(input, 'crashTumble', from, to), single(0), poseRange(input, 'crashRoll', from, to)));
}
export function boundRagFrameRanges(input: RiderOccupancyIntervalInput, from = 0, to = 1): RagFrameRangeBound {
  const ground = groundRanges(input, from, to), headingInverse = eulerRanges(single(0), negative(poseRange(input, 'headingY', from, to)), single(0));
  // Difference trajectories are affine before rotation. World translation
  // cancels algebraically; equal particle trajectories remain exact zero.
  const difference = (a: number, b: number): RV => [0, 1, 2].map(axis => {
    const first = input.previous.ragdoll[a * 3 + axis] - input.previous.ragdoll[b * 3 + axis];
    const last = input.current.ragdoll[a * 3 + axis] - input.current.ragdoll[b * 3 + axis], slope = last - first;
    const x = first + slope * from, y = first + slope * to; return { lo: Math.min(x, y), hi: Math.max(x, y) };
  }) as unknown as RV;
  const unit = (axis: number): RV => [0, 1, 2].map(i => single(Number(axis === i))) as unknown as RV;
  const up = normalized(rotateRange(headingInverse, difference(1, 0)), rotateRange(ground, unit(1)));
  const shoulder = rotateRange(headingInverse, difference(3, 4));
  const forward = normalized(cross(shoulder, up.ranges), rotateRange(ground, unit(2)));
  const lateral = normalized(cross(up.ranges, forward.ranges), rotateRange(ground, unit(0)));
  const quaternion = quaternionRange(lateral.ranges, up.ranges, forward.ranges), qUpper = quaternion.norm;
  const rootQNormUpper = Math.max(1, qUpper), rotationGain = Math.max(1, 2 * rootQNormUpper ** 2 - 1);
  return { normalizedFrameCertified: up.normalizedOnly && forward.normalizedOnly && lateral.normalizedOnly,
    upSquaredLower: up.lowerSquared, forwardSquaredLower: forward.lowerSquared, lateralSquaredLower: lateral.lowerSquared,
    quaternionNormUpper: qUpper, quaternionRanges: quaternion.ranges, quaternionBranches: quaternion.branches, rotationGain };
}
