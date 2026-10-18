/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Shared probes for the PERF-POP exactness tests (2026-10-17): the population
 * fixed step stopped deep-copying its epoch start, builds forecasts without a
 * whole pose, writes committed velocities in one literal and reads reaction
 * admission from footprint rows. These helpers reach the simulation's private
 * state through `unknown` on purpose: the claims are about internals that no
 * public reader exposes. Used by `populationPerfExactness.test.ts` (synthetic
 * fixture) and `app/populationPerfExactnessTown.test.ts` (the euc town).
 */
import type { ActorKind, ActorSpec, PopulationPath } from '../level/populationPlan.ts';
import { POPULATION } from '../data/tuning.ts';
import { clamp, lerp, wrapAngle } from '../shared/maths.ts';
import type { PopulationActorPose, PopulationFootprint, PopulationSimulation, PopulationSnapshot } from './population.ts';

/** The live per-actor fields the forecast and pose builders read (population.ts `ActorState`). */
export interface ActorStateView {
  readonly spec: ActorSpec;
  readonly path: { readonly path: PopulationPath };
  readonly distance: number;
  readonly direction: 1 | -1;
  readonly speed: number;
  readonly heading: number;
  readonly gaitDistance: number;
  readonly wheelTravel: number;
  readonly pause: number;
  readonly turning: boolean;
  readonly waiting: boolean;
  readonly workerLeg: 'work' | 'outbound' | 'return';
  readonly workerAnchor: number;
  readonly workerTarget: number;
  readonly impactUntil: number;
  readonly reaction: 'stagger' | 'knockdown';
  readonly aside: number;
  readonly pose: PopulationActorPose;
}
export interface PopulationInternals {
  readonly states: readonly ActorStateView[];
  readonly current: PopulationSnapshot;
  readonly previous: PopulationSnapshot;
  readonly clock: number;
  makePose(state: ActorStateView, velocityX: number, velocityZ: number, signedSpeed?: number,
    before?: PopulationActorPose, dt?: number): PopulationActorPose;
  prospectiveFrom(state: ActorStateView, from: number, direction: 1 | -1, gaitFrom: number, travel: number): PopulationFootprint;
}
export const internals = (simulation: PopulationSimulation): PopulationInternals => simulation as unknown as PopulationInternals;

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
/**
 * A key-ordered float-bit rendering: every number by its IEEE bits (so -0 and
 * NaN payloads count), every key in insertion order, key presence, array
 * lengths and frozenness. Two values render alike only if they are the same
 * plain data down to the bit and the key order.
 */
export function bits(value: unknown): string {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'number') { f64[0] = x; out.push(`${u32[1].toString(16)}:${u32[0].toString(16)}`); return; }
    if (typeof x === 'string') { out.push(JSON.stringify(x)); return; }
    if (typeof x !== 'object' || x === null) { out.push(String(x)); return; }
    if (Array.isArray(x)) { out.push(Object.isFrozen(x) ? '[f' : '[', String(x.length)); for (const y of x) walk(y); out.push(']'); return; }
    out.push(Object.isFrozen(x) ? '{f' : '{');
    for (const key of Object.keys(x)) { out.push(`${key}=`); walk((x as Record<string, unknown>)[key]); }
    out.push('}');
  };
  walk(value); return out.join(' ');
}
/** The next representable double away from zero (one ulp; zero becomes the least subnormal). */
export function oneUlp(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value); view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
}
/** Freeze every object reachable from a value (cycles and repeats visited once). */
export function deepFreeze(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key], seen);
}
/** Freeze both private published snapshots: an in-place write anywhere in them then throws (ES modules are strict). */
export function freezePublished(simulation: PopulationSimulation): void {
  const view = internals(simulation); deepFreeze(view.current); deepFreeze(view.previous);
}

const isVehicle = (kind: ActorKind): boolean => kind === 'parkedVehicle' || kind === 'serviceVehicle' || kind === 'trafficVehicle';
/** population.ts' `pathPoint`, restated so the oracle does not share the code under test. */
function referencePathPoint(path: PopulationPath, along: number): { x: number; z: number; headingY: number } {
  const distance = clamp(along, 0, path.lengthMetres);
  let low = 0, high = path.points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (path.points[mid].distanceMetres <= distance) low = mid; else high = mid;
  }
  const a = path.points[low], b = path.points[high];
  const t = b.distanceMetres > a.distanceMetres ? (distance - a.distanceMetres) / (b.distanceMetres - a.distanceMetres) : 0;
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), headingY: a.headingY + wrapAngle(b.headingY - a.headingY) * t };
}
/** The pre-PERF-POP `along`, reading the frame from the state it is given. */
function referenceAlong(state: ActorStateView, signedTravel: number): number {
  const length = state.path.path.lengthMetres;
  if (state.spec.movement === 'loop') return ((state.distance + signedTravel) % length + length) % length;
  if (state.spec.kind === 'worker') {
    const destination = state.workerLeg === 'outbound' ? state.workerTarget : state.workerAnchor;
    return state.direction === 1 ? Math.min(state.distance + signedTravel, destination)
      : Math.max(state.distance + signedTravel, destination);
  }
  return clamp(state.distance + signedTravel, 0, length);
}
/** A forecast's start frame: the live state's own (a step candidate) or an epoch start pose's (a lookahead). */
export interface ForecastFrame {
  readonly distance: number; readonly direction: 1 | -1; readonly heading: number;
  readonly gaitDistance: number; readonly wheelTravel: number;
}
export const liveFrame = (state: ActorStateView): ForecastFrame => ({ distance: state.distance, direction: state.direction,
  heading: state.heading, gaitDistance: state.gaitDistance, wheelTravel: state.wheelTravel });
export const startFrame = (pose: PopulationActorPose): ForecastFrame => ({ distance: pose.distanceMetres, direction: pose.direction,
  heading: pose.headingY, gaitDistance: pose.gaitDistanceMetres, wheelTravel: pose.wheelTravelMetres });
/**
 * The oracle: the pre-PERF-POP forecast, `prospective(startState(state, frame), travel)`
 * — a whole candidate state and pose built only to return its footprint.
 */
export function referenceForecast(simulation: PopulationSimulation, state: ActorStateView, frame: ForecastFrame,
  travel: number): PopulationFootprint {
  const framed: ActorStateView = { ...state, distance: frame.distance, direction: frame.direction, heading: frame.heading,
    gaitDistance: frame.gaitDistance, wheelTravel: frame.wheelTravel };
  const distance = referenceAlong(framed, travel), point = referencePathPoint(framed.path.path, distance);
  const vehicle = isVehicle(state.spec.kind);
  const candidate: ActorStateView = { ...framed, distance,
    heading: point.headingY + (!vehicle && framed.direction === -1 ? Math.PI : 0),
    gaitDistance: framed.gaitDistance + Math.abs(travel),
    wheelTravel: framed.wheelTravel + (vehicle ? travel : Math.abs(travel)) };
  return internals(simulation).makePose(candidate, 0, 0, Math.abs(travel) <= POPULATION.epsilon ? 0
    : state.spec.speedMetresPerSecond * (vehicle ? framed.direction : 1)).footprint;
}
/** The forecast under test, from the same frame. */
export const fusedForecast = (simulation: PopulationSimulation, state: ActorStateView, frame: ForecastFrame, travel: number): PopulationFootprint =>
  internals(simulation).prospectiveFrom(state, frame.distance, frame.direction, frame.gaitDistance, travel);
/** The pre-PERF-POP committed pose: makePose, then velocities spread over it and its footprint. */
export function referenceCommitted(simulation: PopulationSimulation, state: ActorStateView, signedSpeed: number,
  before: PopulationActorPose, dt: number): PopulationActorPose {
  const updated = internals(simulation).makePose(state, 0, 0, signedSpeed);
  return { ...updated, velocityX: (updated.x - before.x) / dt, velocityZ: (updated.z - before.z) / dt,
    footprint: { ...updated.footprint, velocityX: (updated.footprint.x - before.footprint.x) / dt,
      velocityZ: (updated.footprint.z - before.footprint.z) / dt } };
}

/** What a coverage tally saw; the tests assert each case actually occurred. */
export interface ForecastCoverage {
  comparisons: number;
  /** Comparisons where both sides refused (same error); a pass made of these would be vacuous. */
  refusals: number;
  kinds: Set<ActorKind>;
  aside: number; knockedDown: number; paused: number; waiting: number; turning: number;
  reversed: number; pedal: number; tyres: number; impactRows: number;
}
export const emptyCoverage = (): ForecastCoverage => ({ comparisons: 0, refusals: 0, kinds: new Set(), aside: 0, knockedDown: 0,
  paused: 0, waiting: 0, turning: 0, reversed: 0, pedal: 0, tyres: 0, impactRows: 0 });

/** A builder's bit rendering, or its refusal: the same error must come from the same call. */
function outcome(build: () => unknown): string {
  try { return bits(build()); } catch (error) { return `throws ${(error as Error).name}: ${(error as Error).message}`; }
}

const STATE_VARIANTS: readonly ((state: ActorStateView, clock: number) => ActorStateView)[] = [
  state => ({ ...state, aside: 0.9 }),
  state => ({ ...state, aside: -1.4 }),
  state => ({ ...state, direction: state.direction === 1 ? -1 : 1 }),
  state => ({ ...state, pause: 0.25 }),
  state => ({ ...state, waiting: !state.waiting }),
  state => ({ ...state, turning: !state.turning }),
  (state, clock) => ({ ...state, impactUntil: clock + 0.5, reaction: 'knockdown' }),
  state => ({ ...state, workerLeg: state.workerLeg === 'outbound' ? 'return' : 'outbound' }),
];

/**
 * Compare the fused forecast with the oracle for every actor of a live
 * simulation: at its own step-candidate frame and at its epoch start (the
 * lookahead frame) for its own travel, none, and both look-ahead horizons;
 * with `variants`, also under each live-field variant above. Returns the first
 * mismatch, or null. Neither builder writes simulation state: both only use
 * the owned ground and corner scratch, which every use overwrites first.
 */
export function compareForecasts(simulation: PopulationSimulation, dt: number, coverage: ForecastCoverage,
  variants: boolean): string | null {
  const view = internals(simulation);
  for (let index = 0; index < view.states.length; index += 1) {
    const live = view.states[index], start = view.previous.actors[index];
    const kind = live.spec.kind;
    coverage.kinds.add(kind);
    if (live.aside !== 0) coverage.aside += 1;
    if (live.reaction === 'knockdown' && live.impactUntil > view.clock) coverage.knockedDown += 1;
    if (live.pause > 0) coverage.paused += 1;
    if (live.waiting) coverage.waiting += 1;
    if (live.turning) coverage.turning += 1;
    if (live.direction === -1) coverage.reversed += 1;
    if (live.pose.footSupports && kind === 'fictionalEuc') coverage.pedal += 1;
    if (live.pose.tyreSupports) coverage.tyres += 1;
    if (live.pose.impactReaction !== undefined) coverage.impactRows += 1;
    const states = variants ? [live, ...STATE_VARIANTS.map(variant => variant(live, view.clock))] : [live];
    for (const state of states) {
      const speed = state.spec.speedMetresPerSecond;
      const travels = [state.direction * state.speed * dt, 0, state.direction * speed * POPULATION.humanLookAheadSeconds,
        state.direction * speed * POPULATION.vehicleLookAheadSeconds];
      const frames: [string, ForecastFrame][] = [['step', liveFrame(state)]];
      if (start !== undefined && start.id === state.spec.id) frames.push(['lookahead', startFrame(start)]);
      for (const [label, frame] of frames) for (const travel of travels) {
        const expected = outcome(() => referenceForecast(simulation, state, frame, travel));
        const actual = outcome(() => fusedForecast(simulation, state, frame, travel));
        coverage.comparisons += 1;
        if (expected.startsWith('throws ')) coverage.refusals += 1;
        if (actual !== expected) return `${state.spec.id} (${kind}) ${label} frame, travel ${travel}:\n  fused  ${actual}\n  oracle ${expected}`;
      }
    }
  }
  return null;
}

/** The fused committed pose against the former outer-spread form, for every actor (and the same variants). */
export function compareCommitted(simulation: PopulationSimulation, dt: number, variants: boolean): { mismatch: string | null; comparisons: number } {
  const view = internals(simulation);
  let comparisons = 0;
  for (let index = 0; index < view.states.length; index += 1) {
    const live = view.states[index], before = view.previous.actors[index];
    if (before === undefined || before.id !== live.spec.id) continue;
    const states = variants ? [live, ...STATE_VARIANTS.map(variant => variant(live, view.clock))] : [live];
    for (const state of states) for (const signedSpeed of [live.pose.speedMetresPerSecond, state.speed, 0]) {
      const expected = outcome(() => referenceCommitted(simulation, state, signedSpeed, before, dt));
      const actual = outcome(() => view.makePose(state, 0, 0, signedSpeed, before, dt));
      comparisons += 1;
      if (actual !== expected) return { mismatch: `${state.spec.id} at speed ${signedSpeed}:\n  fused  ${actual}\n  spread ${expected}`, comparisons };
    }
  }
  return { mismatch: null, comparisons };
}

/** `snapshot()` reduced to what reaction admission reads: the oracle for `actorFootprintRows()`. */
export function snapshotRows(simulation: PopulationSimulation): unknown {
  const snapshot = simulation.snapshot();
  return { clockSeconds: snapshot.clockSeconds, actors: snapshot.actors.map(actor => ({ id: actor.id, footprint: actor.footprint })) };
}
