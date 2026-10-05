/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Reusable wheel, mounted-human and active-rag continuous occupancy certificates. */
import type { RiderOccupancyCoefficients, RiderOccupancyPose, RiderOccupancyPrism } from './riderOccupancy.ts';
import { checkInterval, type Range, type Scalar } from './occupancyExpressions.ts';
import { buildRagHumanTemplateDAG } from './ragHumanTemplate.ts';
import { buildMountedHumanTemplateDAG } from './mountedHumanTemplate.ts';
import { buildWheelTemplate } from './wheelTemplate.ts';
import { RagQuaternionFields, type RagQuaternionLeaf } from './ragQuaternionFields.ts';

const OPS = ['constant', 'affine', 'add', 'sub', 'mul', 'min', 'max', 'neg', 'abs', 'sin', 'cos', 'sqrt01', 'clamp01', 'ragQuaternion'] as const;
export type OccupancyCertificateKind = 'wheel' | 'mounted-human' | 'rag-human';
type Key = Exclude<keyof RiderOccupancyPose, 'ragdoll'>;
type SourceKey = Key | `particle:${number}`;
interface Instruction { readonly op: number; readonly a: number; readonly b: number; readonly literal: number; readonly key: number }
interface Emission { readonly x: number; readonly y: number; readonly z: number; readonly radius: number; always: boolean }
interface Gate { readonly primitive: number; readonly reach: number; readonly threshold: number; readonly strict: boolean }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type BoundsRanges = { minX: MutableRange; maxX: MutableRange; minY: MutableRange; maxY: MutableRange; minZ: MutableRange; maxZ: MutableRange };

export interface CompiledOccupancyTemplate {
  readonly instructionCount: number; readonly primitiveCount: number;
  createSlot(): CompiledOccupancySlot;
}
export interface CompiledOccupancySlot {
  readonly component: 'wheel' | 'human';
  /** Rebind a slot; scalar topology and evaluator scratch remain allocated. */
  load(previous: RiderOccupancyPose, current: RiderOccupancyPose): void;
  at(time: number): RiderOccupancyPrism;
  intervalEnvelopeMetres(from: number, to: number): number;
  readonly enabledFoldCount: number;
}

/** Compile coefficient/pose topology once, rather than once per physics tick. */
export function compileRiderOccupancyCertificate(kind: OccupancyCertificateKind, coefficients: RiderOccupancyCoefficients, posePrototype: RiderOccupancyPose): CompiledOccupancyTemplate {
  const physicalKeys: readonly Key[] = ['x', 'y', 'z', 'headingY', 'groundPitch', 'groundRoll', 'wheelPitch', 'rollAngle', 'riderRoll',
    'riderPitch', 'riderTurnTwist', 'technicalTurn', 'suspensionOffset', 'restFactor', 'reverseBlend',
    'crouch', 'tuck', 'attack', 'carveStance', 'airBlend', 'airHeight', 'wobbleYaw', 'wobbleRoll',
    'wobbleFight', 'wobbleFootCorrection', 'wobbleSway', 'pedalStrike', 'styleYaw', 'styleRoll', 'styleSway',
    'crashBlend', 'crashLateral', 'crashForward', 'crashDrop', 'crashTumble', 'crashRoll', 'wheelCrashSpin',
    'wheelCrashLean', 'wheelCrashPop', 'ragdollBlend'];
  const keys: SourceKey[] = [...physicalKeys, ...(kind === 'rag-human' ? Array.from({ length: 33 }, (_, i) => `particle:${i}` as const) : [])];
  // poseDAG enumerates its inputs: filter the objects as well as source keys.
  // Unrelated EucPose metadata must never become graph leaves or validation.
  const physicalPrototype = Object.fromEntries(physicalKeys.map(key => [key, posePrototype[key]])) as Record<Key, number>;
  const previous = { ...physicalPrototype, ragdoll: new Float64Array(33) }, current = { ...physicalPrototype, ragdoll: new Float64Array(33) };
  const markers = new Map<string, number>();
  keys.forEach((key, index) => {
    const first = (index + 1) / 101, last = (index + 1) / 97;
    if (key.startsWith('particle:')) { const i = Number(key.slice(9)); previous.ragdoll[i] = first; current.ragdoll[i] = last; }
    else { (previous as unknown as Record<string, number>)[key] = first; (current as unknown as Record<string, number>)[key] = last; }
    markers.set(`${first}/${last}`, index);
  });
  if (kind === 'mounted-human') previous.ragdollBlend = current.ragdollBlend = 0;
  const graph = kind === 'wheel' ? buildWheelTemplate({ previous, current, coefficients }) : kind === 'mounted-human' ? buildMountedHumanTemplateDAG({ previous, current, coefficients }) : buildRagHumanTemplateDAG({ previous, current, coefficients });
  const instructions: Instruction[] = [], memo = new Map<Scalar, number>(), structural = new Map<string, number>();
  const intern = (instruction: Instruction): number => {
    const literal = Object.is(instruction.literal, -0) ? '-0' : String(instruction.literal);
    const key = `${instruction.op}/${instruction.a}/${instruction.b}/${literal}/${instruction.key}`, known = structural.get(key);
    if (known !== undefined) return known;
    const index = instructions.length; instructions.push(instruction); structural.set(key, index); return index;
  };
  const constant = (value: number): number => intern({ op: 0, a: -1, b: -1, literal: value, key: -1 });
  const compile = (expression: Scalar): number => {
    const known = memo.get(expression); if (known !== undefined) return known;
    let a = -1, b = -1, literal = 0, key = -1;
    const leaf = expression as unknown as RagQuaternionLeaf;
    if (leaf.op === 'ragQuaternion') { const index = intern({ op: 13, a: -1, b: -1, literal: leaf.component, key: leaf.kind === 'frame' ? 0 : 1 }); memo.set(expression, index); return index; }
    if ('a' in expression) a = compile(expression.a);
    if ('b' in expression) b = compile(expression.b);
    if (expression.op === 'constant') literal = expression.value;
    if (expression.op === 'affine') {
      const source = markers.get(`${expression.from}/${expression.to}`);
      if (source === undefined) throw new Error('Unclassified affine leaf in reusable mounted DAG');
      key = source;
    }
    const left = instructions[a], right = instructions[b], lc = left?.op === 0, rc = right?.op === 0;
    let simplified: number | undefined;
    if (expression.op === 'add' && lc && left.literal === 0) simplified = b;
    else if ((expression.op === 'add' || expression.op === 'sub') && rc && right.literal === 0) simplified = a;
    else if (expression.op === 'sub' && a === b) simplified = constant(0);
    else if (expression.op === 'mul' && ((lc && left.literal === 0) || (rc && right.literal === 0))) simplified = constant(0);
    else if (expression.op === 'mul' && lc && left.literal === 1) simplified = b;
    else if (expression.op === 'mul' && rc && right.literal === 1) simplified = a;
    else if ((expression.op === 'min' || expression.op === 'max') && a === b) simplified = a;
    else if (expression.op === 'neg' && left?.op === 7) simplified = left.a;
    else if (lc && (b < 0 || rc)) {
      const x = left.literal, y = right?.literal; let result: number | undefined;
      switch (expression.op) {
        case 'add': result = x + y; break; case 'sub': result = x - y; break; case 'mul': result = x * y; break;
        case 'min': result = Math.min(x, y); break; case 'max': result = Math.max(x, y); break;
        case 'neg': result = -x; break; case 'abs': result = Math.abs(x); break;
        case 'sin': result = Math.sin(x); break; case 'cos': result = Math.cos(x); break;
        case 'sqrt01': result = Math.sqrt(Math.max(0, x)); break; case 'clamp01': result = Math.max(0, Math.min(1, x)); break;
      }
      if (result !== undefined) simplified = constant(result);
    }
    const index = simplified ?? intern({ op: OPS.indexOf(expression.op), a, b, literal, key }); memo.set(expression, index); return index;
  };
  const gateIndices = new Set(graph.foldedChains.map(field => field.primitiveIndex)), emissionIndices: number[] = [], emissions: Emission[] = [], emissionMemo = new Map<string, number>();
  graph.primitives.forEach((primitive, originalIndex) => {
    if (primitive.kind !== 'sphere') throw new Error('Mounted template emits spheres and transformed corner points');
    const emission: Emission = { x: compile(primitive.centre.x), y: compile(primitive.centre.y), z: compile(primitive.centre.z), radius: compile(primitive.radius), always: !gateIndices.has(originalIndex) };
    const key = `${emission.x}/${emission.y}/${emission.z}/${emission.radius}`, known = emissionMemo.get(key);
    if (known !== undefined) { emissions[known].always ||= emission.always; emissionIndices.push(known); }
    else { emissionIndices.push(emissions.length); emissionMemo.set(key, emissions.length); emissions.push(emission); }
  });
  const gates: Gate[] = graph.foldedChains.map(field => ({ primitive: emissionIndices[field.primitiveIndex], reach: compile(field.squaredReach), threshold: field.thresholdSquared, strict: field.strict }));
  // Constant/identity simplification can strand child nodes already visited by
  // the compiler. Remove them once, preserving topological instruction order.
  const used = new Uint8Array(instructions.length), visit = (index: number): void => {
    if (index < 0 || used[index]) return; used[index] = 1;
    visit(instructions[index].a); visit(instructions[index].b);
  };
  for (const emission of emissions) { visit(emission.x); visit(emission.y); visit(emission.z); visit(emission.radius); }
  for (const gate of gates) visit(gate.reach);
  const remap = new Int32Array(instructions.length).fill(-1), compact: Instruction[] = [];
  instructions.forEach((instruction, index) => {
    if (!used[index]) return; remap[index] = compact.length;
    compact.push({ ...instruction, a: instruction.a < 0 ? -1 : remap[instruction.a], b: instruction.b < 0 ? -1 : remap[instruction.b] });
  });
  const finalEmissions = emissions.map(emission => ({ ...emission, x: remap[emission.x], y: remap[emission.y], z: remap[emission.z], radius: remap[emission.radius] }));
  const finalGates = gates.map(gate => ({ ...gate, reach: remap[gate.reach] }));
  instructions.length = 0; for (const instruction of compact) instructions.push(instruction);
  // The point evaluator reads these columns; every slot of the template shares them.
  const program: PointProgram = { op: Int32Array.from(instructions, value => value.op), a: Int32Array.from(instructions, value => value.a),
    b: Int32Array.from(instructions, value => value.b), literal: Float64Array.from(instructions, value => value.literal),
    key: Int32Array.from(instructions, value => value.key) };
  return { instructionCount: instructions.length, primitiveCount: finalEmissions.length, createSlot: () => new Slot(kind, coefficients, keys, instructions, finalEmissions, finalGates, program) };
}

/** Bound on remembered times per loaded trajectory; a long-held trajectory starts over. */
const MEMORY_LIMIT = 512;
/** The instruction list as columns: the per-step point pass reads typed arrays, not objects. */
interface PointProgram { readonly op: Int32Array; readonly a: Int32Array; readonly b: Int32Array; readonly literal: Float64Array; readonly key: Int32Array }

class Slot implements CompiledOccupancySlot {
  readonly component: 'wheel' | 'human';
  private readonly kind: OccupancyCertificateKind;
  private readonly coefficients: RiderOccupancyCoefficients; private fields: RagQuaternionFields | null = null;
  private readonly keys: readonly SourceKey[];
  private readonly emissions: readonly Emission[]; private readonly gates: readonly Gate[];
  private readonly first: Float64Array; private readonly last: Float64Array;
  private readonly point: Float64Array; private readonly low: Float64Array; private readonly high: Float64Array;
  private readonly enabled: Uint8Array;
  private loaded = false;
  private foldCount = 0;
  private foldCountPending = false;
  /** at() and intervalEnvelopeMetres results for the loaded trajectory. */
  private readonly points = new Map<number, RiderOccupancyPrism>();
  /** bounds()' own record: at() spreads it into the prism it returns at once (PERF-R2-2). */
  private readonly pointBounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  private readonly envelopes = new Map<number, Map<number, number>>();
  private readonly program: PointProgram;
  /** Each emission's unconditional state (2 present, 0 absent), copied before the gates. */
  private readonly always: Uint8Array;
  private readonly gateColumns: { readonly primitive: Int32Array; readonly reach: Int32Array; readonly threshold: Float64Array; readonly strict: Uint8Array };
  /** Per source key: its particle index, or -1 for a named pose field. */
  private readonly particle: Int32Array;
  private readonly inputIndex: Readonly<Record<'x' | 'y' | 'z' | 'headingY', number>>;
  constructor(kind: OccupancyCertificateKind, coefficients: RiderOccupancyCoefficients, keys: readonly SourceKey[], instructions: readonly Instruction[], emissions: readonly Emission[], gates: readonly Gate[], program: PointProgram) {
    this.kind = kind; this.component = kind === 'wheel' ? 'wheel' : 'human'; this.coefficients = coefficients; this.keys = keys; this.emissions = emissions; this.gates = gates;
    this.first = new Float64Array(keys.length); this.last = new Float64Array(keys.length);
    this.point = new Float64Array(instructions.length); this.low = new Float64Array(instructions.length); this.high = new Float64Array(instructions.length);
    this.enabled = new Uint8Array(emissions.length);
    this.program = program;
    this.always = Uint8Array.from(emissions, emission => emission.always ? 2 : 0);
    this.gateColumns = { primitive: Int32Array.from(gates, gate => gate.primitive), reach: Int32Array.from(gates, gate => gate.reach),
      threshold: Float64Array.from(gates, gate => gate.threshold), strict: Uint8Array.from(gates, gate => gate.strict ? 1 : 0) };
    this.particle = Int32Array.from(keys, key => key.startsWith('particle:') ? Number(key.slice(9)) : -1);
    this.inputIndex = { x: keys.indexOf('x'), y: keys.indexOf('y'), z: keys.indexOf('z'), headingY: keys.indexOf('headingY') };
  }
  load(previous: RiderOccupancyPose, current: RiderOccupancyPose): void {
    if (this.kind === 'mounted-human' && (previous.ragdollBlend > 0 || current.ragdollBlend > 0)) throw new RangeError('Compiled mounted template rejects active ragdollBlend');
    // Remembered results describe the loaded endpoints. A wheel or mounted
    // pass reads nothing else, so a bit-identical reload (the transaction
    // re-certifies an unchanged owner pass after pass) keeps them; anything
    // else forgets them before the first value changes.
    let remembered = this.loaded && this.kind !== 'rag-human';
    if (!remembered) this.forget();
    for (let index = 0; index < this.keys.length; index += 1) {
      const key = this.keys[index], particle = this.particle[index];
      const first = particle >= 0 ? previous.ragdoll[particle] : previous[key as Key];
      const last = particle >= 0 ? current.ragdoll[particle] : current[key as Key];
      if (remembered && (!Object.is(this.first[index], first) || !Object.is(this.last[index], last))) { remembered = false; this.forget(); }
      if (!Number.isFinite(first) || !Number.isFinite(last)) throw new RangeError(`Non-finite compiled rag source ${key}`);
      this.first[index] = first; this.last[index] = last;
    }
    this.fields = this.kind === 'rag-human' ? new RagQuaternionFields({ previous: { ...previous, ragdoll: Float64Array.from(previous.ragdoll) }, current: { ...current, ragdoll: Float64Array.from(current.ragdoll) }, coefficients: this.coefficients }) : null;
    this.loaded = true;
    // The whole-interval pass only feeds this diagnostic: at() and the
    // envelope run their own passes. Pure arithmetic, so it is taken on demand.
    this.foldCountPending = true;
  }
  private forget(): void { this.points.clear(); this.envelopes.clear(); }
  /** Diagnostic potential-fold count belongs to the loaded trajectory. It
   * never authorizes an extra concrete primitive at an unrelated time. */
  get enabledFoldCount(): number {
    if (this.foldCountPending) {
      this.runInterval(0, 1); this.foldCountPending = false;
      this.foldCount = this.gates.reduce((count, gate) => count + Number(this.folded(this.low[gate.reach], gate)), 0);
    }
    return this.foldCount;
  }
  private folded(squaredReach: number, gate: Gate): boolean {
    const reach = Math.max(0, squaredReach);
    return gate.strict ? reach < gate.threshold : reach <= gate.threshold;
  }
  /** The same conditional emission, with exact POINT and unioned INTERVAL
   * semantics. 0 is absent, 1 is possible and 2 is definitely present. */
  private selectPointEmissions(): void {
    // folded() over the gate columns: the same comparison per gate.
    const enabled = this.enabled, point = this.point, { primitive, reach, threshold, strict } = this.gateColumns;
    enabled.set(this.always);
    for (let index = 0; index < primitive.length; index += 1) {
      const squared = Math.max(0, point[reach[index]]);
      if (strict[index] ? squared < threshold[index] : squared <= threshold[index]) enabled[primitive[index]] = 2;
    }
  }
  private selectIntervalEmissions(): void {
    for (let index = 0; index < this.emissions.length; index += 1) this.enabled[index] = this.emissions[index].always ? 2 : 0;
    for (const gate of this.gates) {
      if (!this.folded(this.low[gate.reach], gate)) continue;
      const state = this.folded(this.high[gate.reach], gate) ? 2 : 1;
      this.enabled[gate.primitive] = Math.max(this.enabled[gate.primitive], state);
    }
  }
  private input(key: 'x' | 'y' | 'z' | 'headingY', time: number): number {
    const index = this.inputIndex[key]; return this.first[index] + (this.last[index] - this.first[index]) * time;
  }
  private runPoint(time: number): void {
    if (!this.loaded) throw new Error('Compiled mounted slot must be loaded');
    // Operands precede their instruction, so each is final when read.
    const p = this.point, { op, a, b, literal, key } = this.program, first = this.first, last = this.last;
    for (let index = 0; index < op.length; index += 1) {
      switch (op[index]) {
        case 0: p[index] = literal[index]; break;
        case 1: { const k = key[index]; p[index] = first[k] + (last[k] - first[k]) * time; break; }
        case 2: p[index] = p[a[index]] + p[b[index]]; break; case 3: p[index] = p[a[index]] - p[b[index]]; break;
        case 4: p[index] = p[a[index]] * p[b[index]]; break;
        case 5: p[index] = Math.min(p[a[index]], p[b[index]]); break; case 6: p[index] = Math.max(p[a[index]], p[b[index]]); break;
        case 7: p[index] = -p[a[index]]; break;
        case 8: p[index] = Math.abs(p[a[index]]); break; case 9: p[index] = Math.sin(p[a[index]]); break; case 10: p[index] = Math.cos(p[a[index]]); break;
        case 11: p[index] = Math.sqrt(Math.max(0, p[a[index]])); break; case 12: p[index] = Math.max(0, Math.min(1, p[a[index]])); break;
        case 13: p[index] = this.fields!.range(key[index] === 0 ? 'frame' : 'root', literal[index], time, time).lo; break;
      }
    }
    this.selectPointEmissions();
  }
  private runInterval(from: number, to: number): void {
    // The same interval arithmetic over the instruction columns.
    const lo = this.low, hi = this.high, { op, a, b, literal, key } = this.program, first = this.first, last = this.last;
    for (let index = 0; index < op.length; index += 1) {
      const code = op[index];
      switch (code) {
        case 0: lo[index] = hi[index] = literal[index]; break;
        case 1: { const k = key[index], x = first[k] + (last[k] - first[k]) * from,
          y = first[k] + (last[k] - first[k]) * to;
          lo[index] = Math.min(x, y); hi[index] = Math.max(x, y); break; }
        case 2: lo[index] = lo[a[index]] + lo[b[index]]; hi[index] = hi[a[index]] + hi[b[index]]; break;
        case 3: lo[index] = lo[a[index]] - hi[b[index]]; hi[index] = hi[a[index]] - lo[b[index]]; break;
        case 4: { const al = lo[a[index]], ah = hi[a[index]], bl = lo[b[index]], bh = hi[b[index]];
          lo[index] = Math.min(al * bl, al * bh, ah * bl, ah * bh); hi[index] = Math.max(al * bl, al * bh, ah * bl, ah * bh); break; }
        case 5: lo[index] = Math.min(lo[a[index]], lo[b[index]]); hi[index] = Math.min(hi[a[index]], hi[b[index]]); break;
        case 6: lo[index] = Math.max(lo[a[index]], lo[b[index]]); hi[index] = Math.max(hi[a[index]], hi[b[index]]); break;
        case 7: { const al = lo[a[index]]; lo[index] = -hi[a[index]]; hi[index] = -al; break; }
        case 8: { const al = lo[a[index]], ah = hi[a[index]];
          lo[index] = al <= 0 && ah >= 0 ? 0 : Math.min(Math.abs(al), Math.abs(ah)); hi[index] = Math.max(Math.abs(al), Math.abs(ah)); break; }
        case 9: case 10: {
          const al = lo[a[index]], ah = hi[a[index]];
          const cosine = code === 10, fn = cosine ? Math.cos : Math.sin, phase = cosine ? 0 : Math.PI / 2;
          if (ah - al >= 2 * Math.PI) { lo[index] = -1; hi[index] = 1; break; }
          let low = Math.min(fn(al), fn(ah)), high = Math.max(fn(al), fn(ah));
          for (let k = Math.ceil((al - phase) / Math.PI); k <= Math.floor((ah - phase) / Math.PI); k += 1) {
            const value = fn(phase + k * Math.PI); low = Math.min(low, value); high = Math.max(high, value);
          }
          lo[index] = low; hi[index] = high; break;
        }
        case 11: lo[index] = Math.sqrt(Math.max(0, lo[a[index]])); hi[index] = Math.sqrt(Math.max(0, hi[a[index]])); break;
        case 12: lo[index] = Math.max(0, Math.min(1, lo[a[index]])); hi[index] = Math.max(0, Math.min(1, hi[a[index]])); break;
        case 13: { const q = this.fields!.range(key[index] === 0 ? 'frame' : 'root', literal[index], from, to); lo[index] = q.lo; hi[index] = q.hi; break; }
      }
    }
    this.selectIntervalEmissions();
  }
  private bounds(): Bounds {
    const result = this.pointBounds, p = this.point;
    result.minX = Infinity; result.maxX = -Infinity; result.minY = Infinity; result.maxY = -Infinity; result.minZ = Infinity; result.maxZ = -Infinity;
    for (let index = 0; index < this.emissions.length; index += 1) {
      if (!this.enabled[index]) continue;
      const emission = this.emissions[index], radius = p[emission.radius];
      result.minX = Math.min(result.minX, p[emission.x] - radius); result.maxX = Math.max(result.maxX, p[emission.x] + radius);
      result.minY = Math.min(result.minY, p[emission.y] - radius); result.maxY = Math.max(result.maxY, p[emission.y] + radius);
      result.minZ = Math.min(result.minZ, p[emission.z] - radius); result.maxZ = Math.max(result.maxZ, p[emission.z] + radius);
    }
    return result;
  }
  at(time: number): RiderOccupancyPrism {
    checkInterval(time, time);
    // Remembered per loaded trajectory (-0 is evaluated, never looked up); each
    // caller receives its own object, as a fresh evaluation would give it.
    const memo = Object.is(time, -0) ? undefined : this.points.get(time);
    if (memo !== undefined) return { ...memo };
    this.runPoint(time); const b = this.bounds();
    const centreX = (b.minX + b.maxX) / 2, centreY = (b.minY + b.maxY) / 2, centreZ = (b.minZ + b.maxZ) / 2;
    const headingY = this.input('headingY', time), ch = Math.cos(headingY), sh = Math.sin(headingY), baseY = this.input('y', time);
    const prism = { ...b, component: this.component, centreX, centreY, centreZ,
      x: this.input('x', time) + centreX * ch + centreZ * sh, y: baseY + centreY, z: this.input('z', time) - centreX * sh + centreZ * ch, headingY,
      halfWidth: (b.maxX - b.minX) / 2, halfHeight: (b.maxY - b.minY) / 2, halfLength: (b.maxZ - b.minZ) / 2, baseY: baseY + b.minY, topY: baseY + b.maxY };
    if (!Object.is(time, -0)) {
      if (this.points.size >= MEMORY_LIMIT) this.points.clear();
      this.points.set(time, { ...prism });
    }
    return prism;
  }
  private boundRanges(): BoundsRanges {
    // Six accumulators per axis in locals, folded in the same emission order.
    let minXlo = Infinity, minXhi = Infinity, maxXlo = -Infinity, maxXhi = -Infinity;
    let minYlo = Infinity, minYhi = Infinity, maxYlo = -Infinity, maxYhi = -Infinity;
    let minZlo = Infinity, minZhi = Infinity, maxZlo = -Infinity, maxZhi = -Infinity;
    const low = this.low, high = this.high;
    for (let index = 0; index < this.emissions.length; index += 1) {
      const state = this.enabled[index];
      if (!state) continue;
      const e = this.emissions[index], rl = low[e.radius], rh = high[e.radius];
      // Optional branch emissions can expand the outside bounds, but
      // cannot contract the inside endpoints of the bound ranges unless
      // their predicate is certified true throughout this interval.
      minXlo = Math.min(minXlo, low[e.x] - rh); maxXhi = Math.max(maxXhi, high[e.x] + rh);
      if (state === 2) { minXhi = Math.min(minXhi, high[e.x] - rl); maxXlo = Math.max(maxXlo, low[e.x] + rl); }
      minYlo = Math.min(minYlo, low[e.y] - rh); maxYhi = Math.max(maxYhi, high[e.y] + rh);
      if (state === 2) { minYhi = Math.min(minYhi, high[e.y] - rl); maxYlo = Math.max(maxYlo, low[e.y] + rl); }
      minZlo = Math.min(minZlo, low[e.z] - rh); maxZhi = Math.max(maxZhi, high[e.z] + rh);
      if (state === 2) { minZhi = Math.min(minZhi, high[e.z] - rl); maxZlo = Math.max(maxZlo, low[e.z] + rl); }
    }
    return { minX: { lo: minXlo, hi: minXhi }, maxX: { lo: maxXlo, hi: maxXhi }, minY: { lo: minYlo, hi: minYhi },
      maxY: { lo: maxYlo, hi: maxYhi }, minZ: { lo: minZlo, hi: minZhi }, maxZ: { lo: maxZlo, hi: maxZhi } };
  }
  intervalEnvelopeMetres(from: number, to: number): number {
    checkInterval(from, to); if (to === from) return 0;
    // A pure function of the loaded trajectory and the interval: a compound
    // sweep asks for the same dyadic intervals pair after pair and pass after pass.
    const remember = !Object.is(from, -0) && !Object.is(to, -0);
    let byTo = remember ? this.envelopes.get(from) : undefined;
    const known = byTo?.get(to);
    if (known !== undefined) return known;
    const first = this.at(from), last = this.at(to); this.runInterval(from, to); const bounds = this.boundRanges();
    // These are the same footprint/support formulas as the scalar footprint support certificate,
    // evaluated directly on the instruction-DAG scratch ranges.
    const input = (key: 'x' | 'y' | 'z' | 'headingY'): Range => span(this.input(key, from), this.input(key, to));
    const heading = input('headingY'), ch = trigRange(heading, true), sh = trigRange(heading, false);
    const baseX = input('x'), baseY = input('y'), baseZ = input('z'), cx = span(first.x, last.x), cz = span(first.z, last.z);
    const width = span(first.halfWidth, last.halfWidth), length = span(first.halfLength, last.halfLength), base = span(first.baseY, last.baseY), top = span(first.topY, last.topY);
    let pad = 0;
    for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) {
      const wx = plus(plus(baseX, times(ch, x)), times(sh, z)), wy = plus(baseY, y), wz = plus(minus(baseZ, times(sh, x)), times(ch, z));
      const dx = minus(wx, cx), dz = minus(wz, cz);
      pad = Math.max(pad, minus(absolute(minus(times(ch, dx), times(sh, dz))), width).hi,
        minus(absolute(plus(times(sh, dx), times(ch, dz))), length).hi, minus(base, wy).hi, minus(wy, top).hi);
    }
    if (!Number.isFinite(pad)) throw new RangeError('Non-finite compiled support residual');
    const envelope = Math.max(0, pad);
    if (remember) {
      if (this.envelopes.size >= MEMORY_LIMIT) { this.envelopes.clear(); byTo = undefined; }
      if (byTo === undefined) this.envelopes.set(from, byTo = new Map());
      byTo.set(to, envelope);
    }
    return envelope;
  }
}
type MutableRange = { lo: number; hi: number };
const span = (a: number, b: number): MutableRange => ({ lo: Math.min(a, b), hi: Math.max(a, b) });
const plus = (a: Range, b: Range): MutableRange => ({ lo: a.lo + b.lo, hi: a.hi + b.hi });
const minus = (a: Range, b: Range): MutableRange => ({ lo: a.lo - b.hi, hi: a.hi - b.lo });
const times = (a: Range, b: Range): MutableRange => ({ lo: Math.min(a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi), hi: Math.max(a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi) });
const absolute = (a: Range): MutableRange => ({ lo: a.lo <= 0 && a.hi >= 0 ? 0 : Math.min(Math.abs(a.lo), Math.abs(a.hi)), hi: Math.max(Math.abs(a.lo), Math.abs(a.hi)) });
function trigRange(a: Range, cosine: boolean): MutableRange {
  if (a.hi - a.lo >= 2 * Math.PI) return { lo: -1, hi: 1 };
  const fn = cosine ? Math.cos : Math.sin, phase = cosine ? 0 : Math.PI / 2;
  let lo = Math.min(fn(a.lo), fn(a.hi)), hi = Math.max(fn(a.lo), fn(a.hi));
  for (let k = Math.ceil((a.lo - phase) / Math.PI); k <= Math.floor((a.hi - phase) / Math.PI); k += 1) { const v = fn(phase + k * Math.PI); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { lo, hi };
}

/** Compact compatibility constructor: a human component here is mounted-only. */
export function compileOccupancyTemplate(component: 'wheel' | 'human', coefficients: RiderOccupancyCoefficients, prototype: RiderOccupancyPose): CompiledOccupancyTemplate {
  return compileRiderOccupancyCertificate(component === 'wheel' ? 'wheel' : 'mounted-human', coefficients, prototype);
}
/** Active rag shares the same compiled evaluator and scalar instruction set. */
export function compileTightRagHumanTemplate(coefficients: RiderOccupancyCoefficients, prototype: RiderOccupancyPose): CompiledOccupancyTemplate {
  return compileRiderOccupancyCertificate('rag-human', coefficients, prototype);
}
