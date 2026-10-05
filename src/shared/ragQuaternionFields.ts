/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared exact POINT and branch-unioned INTERVAL leaves for active rag quaternions. */
import type { RiderOccupancyIntervalInput } from './riderOccupancy.ts';
import type { Range, Scalar } from './occupancyExpressions.ts';
import { boundRagFrameRanges, mountedQuaternionRanges, poseRange } from './ragFrameRanges.ts';

type V = readonly [number, number, number];
type Q = readonly [number, number, number, number];
type QR = readonly [Range, Range, Range, Range];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal = (a: V, fallback: V): V => dot(a, a) < 1e-8 ? fallback : scale(a, 1 / Math.hypot(...a));
function euler(x: number, y: number, z: number): Q {
  const cx = Math.cos(x / 2), cy = Math.cos(y / 2), cz = Math.cos(z / 2), sx = Math.sin(x / 2), sy = Math.sin(y / 2), sz = Math.sin(z / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}
function mulQ(a: Q, b: Q): Q {
  return [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1], a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function rotate(q: Q, p: V): V { const xyz: V = [q[0], q[1], q[2]], t = scale(cross(xyz, p), 2); return add(p, add(scale(t, q[3]), cross(xyz, t))); }
function basis(x: V, y: V, z: V): Q {
  const trace = x[0] + y[1] + z[2];
  if (trace > 0) { const s = .5 / Math.sqrt(trace + 1); return [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, .25 / s]; }
  if (x[0] > y[1] && x[0] > z[2]) { const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]); return [.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  if (y[1] > z[2]) { const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]); return [(y[0] + x[1]) / s, .25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]); return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, .25 * s, (x[1] - y[0]) / s];
}
function slerp(a: Q, b: Q, t: number): Q {
  let cosine = a.reduce((sum, value, index) => sum + value * b[index], 0);
  if (cosine < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; cosine = -cosine; }
  if (cosine > 1 - Number.EPSILON) return a;
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  if (sine < 1e-8) { const q = a.map((value, index) => value + (b[index] - value) * t), length = Math.hypot(...q); return q.map(value => value / length) as unknown as Q; }
  const angle = Math.atan2(sine, cosine), s0 = Math.sin((1 - t) * angle) / sine, s1 = Math.sin(t * angle) / sine;
  return a.map((value, index) => value * s0 + b[index] * s1) as unknown as Q;
}
const plus = (a: Range, b: Range): Range => ({ lo: a.lo + b.lo, hi: a.hi + b.hi });
const times = (a: Range, b: Range): Range => { const v = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi]; return { lo: Math.min(...v), hi: Math.max(...v) }; };
const union = (a: Range, b: Range): Range => ({ lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) });
const minusOne = (a: Range): Range => ({ lo: 1 - a.hi, hi: 1 - a.lo });
const reflect = (a: Range): Range => ({ lo: -a.hi, hi: -a.lo });
const sinc = (value: number): number => value === 0 ? 1 : Math.sin(value) / value;
const sincRange = (a: Range): Range => ({ lo: sinc(a.hi), hi: sinc(a.lo) });
const positiveDivide = (a: Range, b: Range): Range => times(a, { lo: 1 / b.hi, hi: 1 / b.lo });

export interface RagQuaternionLeaf {
  readonly op: 'ragQuaternion'; readonly owner: RagQuaternionFields;
  readonly kind: 'frame' | 'root'; readonly component: number;
}
export class RagQuaternionFields {
  private readonly input: RiderOccupancyIntervalInput;
  private readonly cache = new Map<string, { frame: QR; root: QR }>();
  private readonly frameChart: number | null;
  private readonly rootChart: number | null;
  /** Both representatives are certified against the ENTIRE loaded [0,1]
   * trajectory. Subdivision never reselects a point/interval hemisphere. */
  readonly rotationChartsCertified: boolean;
  readonly continuousRotationFieldsCertified: boolean;
  constructor(input: RiderOccupancyIntervalInput) {
    this.input = input;
    const branches = this.rawRanges(0, 1);
    this.frameChart = this.certifiedChart(branches.frame);
    this.rootChart = this.certifiedChart(branches.root);
    this.rotationChartsCertified = this.frameChart !== null && this.rootChart !== null;
    this.continuousRotationFieldsCertified = this.rotationChartsCertified && branches.partialShortestArcCertified;
    this.cache.set('0/1', this.unionFields(branches));
  }
  private certifiedChart(branches: readonly QR[]): number | null {
    // A common nonzero coordinate is a proved projective chart. Every branch
    // must exclude zero; a midpoint, norm guess or unit-frame assumption is
    // insufficient. With no chart the original safe raw branch union remains.
    return [3, 0, 1, 2].find(index => branches.every(q => q[index].lo > 0 || q[index].hi < 0)) ?? null;
  }
  private canonicalRanges(q: QR, chart: number | null): QR {
    if (chart === null || q[chart].lo > 0) return q;
    if (q[chart].hi < 0) return q.map(reflect) as unknown as QR;
    // Retain both whole representatives if a conservative local expression
    // cannot reproduce the loaded chart proof; never guess a hemisphere.
    return q.map(value => union(value, reflect(value))) as unknown as QR;
  }
  private canonicalPoint(q: Q, chart: number | null): Q {
    return chart !== null && q[chart] < 0 ? q.map(value => -value) as unknown as Q : q;
  }
  private unionFields(branches: { frame: readonly QR[]; root: readonly QR[] }): { frame: QR; root: QR } {
    const unite = (values: readonly QR[], chart: number | null): QR => {
      const canonical = values.map(q => this.canonicalRanges(q, chart));
      return [0, 1, 2, 3].map(index => canonical.slice(1).reduce((result, q) => union(result, q[index]), canonical[0][index])) as unknown as QR;
    };
    return { frame: unite(branches.frame, this.frameChart), root: unite(branches.root, this.rootChart) };
  }
  leaves(kind: RagQuaternionLeaf['kind']): readonly [Scalar, Scalar, Scalar, Scalar] {
    return [0, 1, 2, 3].map(component => ({ op: 'ragQuaternion', owner: this, kind, component })) as unknown as readonly [Scalar, Scalar, Scalar, Scalar];
  }
  range(kind: RagQuaternionLeaf['kind'], component: number, from: number, to: number): Range {
    const key = `${from}/${to}`; let known = this.cache.get(key);
    if (!known) { known = from === to ? this.point(from) : this.ranges(from, to); this.cache.set(key, known); }
    return known[kind][component];
  }
  private point(time: number): { frame: QR; root: QR } {
    const first = this.input.previous, last = this.input.current;
    const scalar = (key: keyof typeof first): number => (first[key] as number) + ((last[key] as number) - (first[key] as number)) * time;
    const ground = mulQ(euler(scalar('groundPitch'), 0, scalar('groundRoll')), euler(scalar('wheelPitch'), 0, -scalar('rollAngle')));
    const headingInverse = euler(0, -scalar('headingY'), 0), origin: V = [scalar('x'), scalar('y'), scalar('z')];
    const particle = (index: number): V => rotate(headingInverse, sub([0, 1, 2].map(axis => first.ragdoll[index * 3 + axis] + (last.ragdoll[index * 3 + axis] - first.ragdoll[index * 3 + axis]) * time) as unknown as V, origin));
    const up = normal(sub(particle(1), particle(0)), rotate(ground, [0, 1, 0]));
    const forward = normal(cross(sub(particle(3), particle(4)), up), rotate(ground, [0, 0, 1]));
    const lateral = normal(cross(up, forward), rotate(ground, [1, 0, 0])), frame = basis(lateral, up, forward);
    const root = slerp(mulQ(ground, euler(scalar('crashTumble'), 0, scalar('crashRoll'))), frame, Math.max(0, Math.min(1, scalar('ragdollBlend'))));
    const wrap = (q: Q): QR => q.map(value => ({ lo: value, hi: value })) as unknown as QR;
    // Compute native slerp FIRST, including its exact zero-dot tie. Only then
    // change each whole quaternion representative. rotate(q,v) is quadratic,
    // so q and -q are identical even when the source quaternion is nonunit.
    return { frame: wrap(this.canonicalPoint(frame, this.frameChart)), root: wrap(this.canonicalPoint(root, this.rootChart)) };
  }
  private ranges(from: number, to: number): { frame: QR; root: QR } {
    return this.unionFields(this.rawRanges(from, to));
  }
  private rawRanges(from: number, to: number): { frame: readonly QR[]; root: readonly QR[]; partialShortestArcCertified: boolean } {
    const a = mountedQuaternionRanges(this.input, from, to), frames = boundRagFrameRanges(this.input, from, to).quaternionBranches;
    const roots: QR[] = []; let partialShortestArcCertified = true;
    const rawRag = poseRange(this.input, 'ragdollBlend', from, to), rag = { lo: Math.max(0, Math.min(1, rawRag.lo)), hi: Math.max(0, Math.min(1, rawRag.hi)) };
    // Preserve EACH basis branch through native slerp/sign conditioning. A
    // componentwise union of q and -q before these products loses correlation.
    for (const frame of frames) {
      let cosine: Range = { lo: 0, hi: 0 };
      for (let index = 0; index < 4; index += 1) cosine = plus(cosine, times(a[index], frame[index]));
      const signs = cosine.lo >= 0 ? [1] : cosine.hi < 0 ? [-1] : [-1, 1];
      // At an unproved zero-dot shortest-arc switch a PARTIAL source slerp
      // can genuinely change rotation, rather than only q's representation.
      // Keep its exact point/union utility, but explicitly decline near CCD.
      // Even cosine=[0,0] can be a real discontinuity: two basis branches may
      // emit q and -q, and the native exact-zero tie leaves both unchanged.
      // Their partial slerps have equal positive w but opposite xyz, so a
      // projective root chart alone cannot make them one physical rotation.
      const zeroDotBasisTie = frames.length > 1 && cosine.lo <= 0 && cosine.hi >= 0;
      if ((signs.length > 1 || zeroDotBasisTie) && rag.hi > 0 && rag.lo < 1) partialShortestArcCertified = false;
      for (const sign of signs) {
        const b = sign === 1 ? frame : frame.map(reflect) as unknown as QR;
        const cos = sign === 1 ? cosine : reflect(cosine), nonnegative = { lo: Math.max(0, cos.lo), hi: Math.max(0, cos.hi) };
        if (nonnegative.hi > 1 - Number.EPSILON) roots.push(a);
        if (nonnegative.lo <= 1 - Number.EPSILON) {
          if (rag.lo === 0 && rag.hi === 0) { roots.push(a); continue; }
          if (rag.lo === 1 && rag.hi === 1) { roots.push(b); continue; }
          const angle = { lo: Math.acos(Math.min(1 - Number.EPSILON, nonnegative.hi)), hi: Math.acos(Math.min(1, nonnegative.lo)) };
          // sin(t*angle)/sin(angle) = t*sinc(t*angle)/sinc(angle), including
          // the continuous angle=0 limit. sinc decreases on [0,pi/2].
          const denominator = sincRange(angle), remaining = minusOne(rag);
          const s0 = times(remaining, positiveDivide(sincRange(times(remaining, angle)), denominator));
          const s1 = times(rag, positiveDivide(sincRange(times(rag, angle)), denominator));
          roots.push(a.map((value, index) => plus(times(value, s0), times(b[index], s1))) as unknown as QR);
        }
      }
    }
    // Native normalized-lerp cannot follow cosine<=1-EPS: sine is>1e-8.
    return { frame: frames, root: roots, partialShortestArcCertified };
  }
}
