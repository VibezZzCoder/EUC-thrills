/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M47 living-world density (PLANS §47): the living-r2 layer. Plain data, no
 * graphics, options, clocks or random draws; browser-importable.
 *
 * A generated city keeps its living-r1 roster (`populationPlan.ts`) exactly:
 * the same actors, ids, digest and physical world. This layer is authored once
 * after the final population build and only appends. Every extra is admitted
 * by the very `add` the living-r1 fill uses (`populationActorAdmission`),
 * starting from the base roster's own bodies, so it clears every base hull,
 * static exclusion and person gap exactly as a base actor would.
 *
 * Layers are cumulative TOTAL caps, the base roster included, filled in order;
 * a later layer only appends, so each layer's roster is a prefix of the next.
 * What a layer adds:
 *   - traffic: each closed loop takes stations in a fixed dyadic order from its
 *     living-r1 station (0.3 of the loop; then +1/2, +1/4, +3/4, +1/8, ...,
 *     wrapped), skipping any closer than the headway to a vehicle already on
 *     it; each next vehicle goes to the loop with the largest spacing
 *     L / (n + 1), ties by path id;
 *   - standing groups of two or three at anchors no base actor uses (rest
 *     anchors, unused bench anchors), atomic, members turned to the centre;
 *   - walkers and joggers on the living-r1 fill's own free slots, spread out:
 *     within a district every path's first free slot comes before any path's
 *     second (paths in hashed order, never by id), and each turn goes to the
 *     district with the most free slots left per turn it has had.
 * No extra riders, parked or service vehicles.
 *
 * Plan ids, record keys and the base digest never change; the layer's own
 * digest and revision name it. Hand-built venues get no layer (their
 * preparation never calls this), and an authored activity roster refuses one.
 */
import { POPULATION_DENSITY } from '../data/tuning.ts';
import type { LevelPlan } from './plan.ts';
import { hash128 } from './planDigest.ts';
import {
  createPopulationValidationContext, isPopulationPerson, populationActorAdmission, populationChoice,
  populationWalkingSlots, POPULATION_DISTRICT_ORDER, POPULATION_TRAFFIC_STATION_SHARE,
  type ActivityAnchor, type ActorSpec, type PopulationActorAdmission, type PopulationPath,
  type PopulationPlan, type PopulationValidationContext, type PopulationWalkingSlot,
} from './populationPlan.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import type { TerrainSampler } from '../simulation/world.ts';

const D = POPULATION_DENSITY;

/** A layer's name. Measurement may author any names; production uses `PopulationDensityTier`. */
export type PopulationDensityLayerId = string;
/** The production layers, in the order they stack. */
export type PopulationDensityTier = 'medium' | 'high';
const TIER_ORDER: readonly PopulationDensityTier[] = ['medium', 'high'];

/** One layer's cumulative TOTAL caps, the base roster and earlier layers included. */
export interface PopulationDensityLayer {
  readonly layer: PopulationDensityLayerId;
  readonly maximumPeople: number;
  readonly maximumTrafficVehicles: number;
}
/** An ordinary actor plus the layer that admitted it. */
export type PopulationDensityActor = ActorSpec & { readonly layer: PopulationDensityLayerId };
export interface PopulationDensity {
  readonly revision: 'living-r2';
  /** Extras only, in admission order: every layer's actors follow the previous layer's. */
  readonly actors: readonly PopulationDensityActor[];
  /** hash128 of { revision, actors }. */
  readonly digest: string;
}

/** The two production layers, from `POPULATION_DENSITY`. */
export const POPULATION_DENSITY_LAYERS: readonly PopulationDensityLayer[] = Object.freeze(TIER_ORDER.map(tier =>
  Object.freeze({ layer: tier, maximumPeople: D[tier].maximumPeople, maximumTrafficVehicles: D[tier].maximumTrafficVehicles })));

/** Drained synchronously, the sliced authoring below. */
export function authorPopulationDensity(level: LevelPlan, base: PopulationPlan,
  layers: readonly PopulationDensityLayer[], sampler: TerrainSampler = new PlanTerrainSampler(level),
  context: PopulationValidationContext = createPopulationValidationContext(level)): PopulationDensity {
  return runSteps(authorPopulationDensitySteps(level, base, layers, sampler, context));
}
/** The boot path: the same authoring as slices (`shared/preparationSteps.ts`).
 * A plain function returning the generator, so the defaults are evaluated at
 * the call. `level` is the finished plan `base` was built against, or that
 * plan installed under `base.installedWorldId`: one ground, one static world. */
export function authorPopulationDensitySteps(level: LevelPlan, base: PopulationPlan,
  layers: readonly PopulationDensityLayer[], sampler: TerrainSampler = new PlanTerrainSampler(level),
  context: PopulationValidationContext = createPopulationValidationContext(level)): Steps<PopulationDensity> {
  return authorDensityInSteps(level, base, layers, sampler, context);
}

function* authorDensityInSteps(level: LevelPlan, base: PopulationPlan, layers: readonly PopulationDensityLayer[],
  sampler: TerrainSampler, context: PopulationValidationContext): Steps<PopulationDensity> {
  // An authored station list is the whole roster, and its facings are not in
  // ActorSpec; never refill it (populationPlan.ts says the same of rejections).
  if (level.populationActivity) throw new RangeError('An authored population activity takes no density layer');
  if (level.id !== base.sourceWorldId && level.id !== base.installedWorldId) {
    throw new Error('A density layer is authored against the plan its base population was built for');
  }
  const names = new Set<string>();
  for (const layer of layers) {
    if (!layer.layer || names.has(layer.layer) || !Number.isSafeInteger(layer.maximumPeople) || layer.maximumPeople < 0
      || !Number.isSafeInteger(layer.maximumTrafficVehicles) || layer.maximumTrafficVehicles < 0) {
      throw new RangeError('Density layers need unique names and whole, non-negative caps');
    }
    names.add(layer.layer);
  }
  // The base fill's own hash seed: the canonical pre-activity world, never the installed id.
  const worldId = level.populationActivityChoiceWorldId ?? base.sourceWorldId;
  const admission = populationActorAdmission(level, sampler, context, worldId);
  const pathsById = new Map(base.paths.map(path => [path.id, path]));
  for (const actor of base.actors) {
    const path = pathsById.get(actor.pathId);
    if (!path) throw new Error(`Population actor ${actor.id} has no path in its plan`);
    admission.restore(actor, path);
  }
  yield PREPARATION_SLICE;
  const counts = { people: base.actors.filter(actor => isPopulationPerson(actor.kind)).length,
    traffic: base.actors.filter(actor => actor.kind === 'trafficVehicle').length };
  const loops = trafficLoops(base);
  const groups = groupQueues(base, pathsById);
  const walking = walkingQueues(base, worldId), turns = walking.map(() => 0);
  const actors: PopulationDensityActor[] = [];
  for (const layer of layers) {
    while (counts.traffic < layer.maximumTrafficVehicles && addTraffic(admission, loops)) {
      counts.traffic += 1;
      yield PREPARATION_SLICE;
    }
    // Groups first: they are atomic and need room a walker's 10 m gap would take.
    // Round-robin by district; a full layer stops before taking an anchor, so
    // the next layer starts where this one ended and nothing is skipped.
    const groupBudget = Math.floor(Math.max(0, layer.maximumPeople - counts.people) * D.socialGroupShare);
    let grouped = 0;
    groupRounds: while (groups.some(queue => queue.length > 0)) {
      for (const queue of groups) {
        const room = Math.min(groupBudget - grouped, layer.maximumPeople - counts.people);
        if (room < D.socialGroupMinimumSize) break groupRounds;
        const anchor = queue.shift();
        if (!anchor) continue;
        const size = addGroup(admission, pathsById.get(anchor.pathId)!, anchor, worldId, room);
        grouped += size; counts.people += size;
      }
      yield PREPARATION_SLICE;
    }
    // Walkers and joggers: a refused slot still spends its district's turn,
    // and a full layer stops before taking one, so the next layer resumes here.
    while (counts.people < layer.maximumPeople) {
      const district = nextWalkingDistrict(walking, turns);
      if (district < 0) break;
      const candidate = walking[district].shift()!;
      turns[district] += 1;
      if (admission.add(candidate.kind, candidate.path, candidate.along)) counts.people += 1;
      yield PREPARATION_SLICE;
    }
    for (let index = base.actors.length + actors.length; index < admission.actors.length; index += 1) {
      actors.push({ ...admission.actors[index], layer: layer.layer });
    }
  }
  const ids = new Set(base.actors.map(actor => actor.id));
  for (const actor of actors) {
    if (ids.has(actor.id)) throw new Error(`Density actor id ${actor.id} is not unique`);
    ids.add(actor.id);
  }
  return { revision: D.revision, actors, digest: hash128(JSON.stringify({ revision: D.revision, actors })) };
}

const slotKey = (pathId: string, along: number): string => `${pathId}\n${along}`;

/**
 * The living-r1 fill's walking slots that no base actor stands on, per
 * district, reordered to spread: every path's first free slot, then every
 * path's second, and so on. Paths take a hashed order so a district's extras
 * are not drawn from the alphabetically first streets; a slot keeps its kind.
 */
function walkingQueues(base: PopulationPlan, worldId: string): PopulationWalkingSlot[][] {
  const occupied = new Set(base.actors.map(actor => slotKey(actor.pathId, actor.initialDistanceMetres)));
  return populationWalkingSlots(base.paths, base.anchors, worldId).map(queue => {
    const free = new Map<PopulationPath, PopulationWalkingSlot[]>();
    for (const slot of queue) {
      if (occupied.has(slotKey(slot.path.id, slot.along))) continue;
      const slots = free.get(slot.path);
      if (slots) slots.push(slot); else free.set(slot.path, [slot]);
    }
    const paths = [...free.keys()].map(path => ({ path, order: populationChoice(worldId, 'density-walk', path.id) }))
      .sort((a, b) => a.order - b.order || (a.path.id < b.path.id ? -1 : a.path.id > b.path.id ? 1 : 0));
    const spread: PopulationWalkingSlot[] = [];
    for (let rank = 0, placed = true; placed; rank += 1) {
      placed = false;
      for (const { path } of paths) {
        const slot = free.get(path)![rank];
        if (slot) { spread.push(slot); placed = true; }
      }
    }
    return spread;
  });
}
/** A round-robin weighted by room: the turn goes to the district with the most
 * free slots left per turn it has already had (D'Hondt divisors), ties in
 * district order; -1 once every queue is empty. A district with little room,
 * the park or the industrial yard, still gets turns in proportion to it. */
function nextWalkingDistrict(walking: readonly (readonly PopulationWalkingSlot[])[], turns: readonly number[]): number {
  let best = -1;
  for (let district = 0; district < walking.length; district += 1) {
    if (walking[district].length === 0) continue;
    if (best < 0 || walking[district].length / (turns[district] + 1)
      > walking[best].length / (turns[best] + 1)) best = district;
  }
  return best;
}

interface TrafficLoop {
  readonly path: PopulationPath;
  /** Candidate stations in dyadic order; `next` is the first not yet tried. */
  readonly stations: readonly number[];
  next: number;
  readonly vehicles: number[];
}
/** Every closed traffic loop with its vehicles and its finite station order.
 * Offsets halve while their spacing is at least half the headway: one level
 * finer than the headway admits, so a station refused by the static world
 * can still be covered from between its neighbours. */
function trafficLoops(base: PopulationPlan): TrafficLoop[] {
  return base.paths.filter(path => path.role === 'traffic' && path.closed)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(path => {
      const offsets = [0];
      for (let denominator = 2; path.lengthMetres / denominator >= D.minimumTrafficHeadwayMetres / 2; denominator *= 2) {
        for (let numerator = 1; numerator < denominator; numerator += 2) offsets.push(numerator / denominator);
      }
      return { path, next: 0,
        stations: offsets.map(offset => path.lengthMetres * ((POPULATION_TRAFFIC_STATION_SHARE + offset) % 1)),
        vehicles: base.actors.filter(actor => actor.kind === 'trafficVehicle' && actor.pathId === path.id)
          .map(actor => actor.initialDistanceMetres) };
    });
}
/** One more vehicle on the loop with the largest spacing L / (n + 1) that can
 * still take one; ties go to the lower path id. False once no loop can. */
function addTraffic(admission: PopulationActorAdmission, loops: readonly TrafficLoop[]): boolean {
  for (;;) {
    let best: TrafficLoop | undefined;
    for (const loop of loops) {
      if (loop.next >= loop.stations.length) continue;
      if (loop.path.lengthMetres < D.compactLoopMetres && loop.vehicles.length >= D.compactLoopMaximumVehicles) continue;
      // Loops are in path id order, so only a strictly larger spacing wins.
      if (!best || loop.path.lengthMetres / (loop.vehicles.length + 1)
        > best.path.lengthMetres / (best.vehicles.length + 1)) best = loop;
    }
    if (!best) return false;
    while (best.next < best.stations.length) {
      const station = best.stations[best.next]; best.next += 1;
      // Vehicles only accumulate, so a station refused now is refused for good.
      const length = best.path.lengthMetres;
      if (best.vehicles.some(other => {
        const gap = Math.abs(station - other) % length;
        return Math.min(gap, length - gap) < D.minimumTrafficHeadwayMetres;
      })) continue;
      if (admission.add('trafficVehicle', best.path, station)) { best.vehicles.push(station); return true; }
    }
  }
}

/** Per district, the anchors a standing group may use: rest and bench anchors
 * on ordinary walking paths that no base actor owns, in anchor order. */
function groupQueues(base: PopulationPlan, pathsById: ReadonlyMap<string, PopulationPath>): ActivityAnchor[][] {
  const owned = new Set(base.actors.flatMap(actor => actor.anchorId ? [actor.anchorId] : []));
  const supports = new Set(base.anchors.filter(anchor => anchor.activitySiteId).map(anchor => anchor.pathId));
  return POPULATION_DISTRICT_ORDER.map(district => base.anchors.filter(anchor =>
    (anchor.kind === 'rest' || anchor.kind === 'social') && !anchor.activitySiteId && anchor.district === district
    && !owned.has(anchor.id) && !supports.has(anchor.pathId) && pathsById.get(anchor.pathId)?.role === 'pedestrian'));
}
/**
 * A standing group centred on its anchor along the anchor's own path, all
 * members admitted or none; the members admitted (0, 2 or 3). Hashed per
 * anchor, a group tries three first, then two. Members stand on the path
 * centreline, so each faces the centre the only way the simulation turns a
 * person: by direction. Those behind the centre face along the path, those
 * ahead face back; a middle member turns by hash.
 */
function addGroup(admission: PopulationActorAdmission, path: PopulationPath, anchor: ActivityAnchor,
  worldId: string, room: number): number {
  const minimum = D.socialGroupMinimumSize, maximum = D.socialGroupMaximumSize;
  const first = populationChoice(worldId, 'density-group', anchor.id) < D.socialGroupTrioShare ? maximum : minimum;
  const groupId = `${anchor.id}/density-group`;
  for (let size = Math.min(first, room); size >= minimum; size -= 1) {
    const middle = (size - 1) / 2;
    const stations = Array.from({ length: size }, (_, index) =>
      anchor.distanceMetres + (index - middle) * D.socialGroupSpacingMetres);
    if (stations[0] < 0 || stations[size - 1] > path.lengthMetres) continue;
    const before = admission.actors.length;
    if (stations.every((along, index) => admission.add('social', path, along, anchor, groupId, undefined, undefined,
      index < middle ? 1 : index > middle ? -1
        : populationChoice(worldId, 'density-facing', `${groupId}/${index}`) < 0.5 ? 1 : -1))) return size;
    admission.truncate(before);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Rosters: the plan a consumer installs for one layer
// ---------------------------------------------------------------------------

const rosters = new WeakMap<PopulationPlan, WeakMap<PopulationDensity, Map<string, PopulationPlan>>>();
/** Each roster's base plan, so a roster handed back resolves to its base. */
const rosterBases = new WeakMap<PopulationPlan, PopulationPlan>();
const plainActors = new WeakMap<PopulationDensity, readonly ActorSpec[]>();

function baseOf(plan: PopulationPlan): PopulationPlan {
  if (plan.densityLayer === undefined) return plan;
  const base = rosterBases.get(plan);
  if (!base) throw new Error('A density roster must be built from its base population plan');
  return base;
}
/** The density's actors as plain ActorSpec objects (the `layer` field stripped), in order. */
function plainOf(density: PopulationDensity): readonly ActorSpec[] {
  let plain = plainActors.get(density);
  if (!plain) {
    plain = density.actors.map(actor => {
      const { layer: _layer, ...spec } = actor;
      return spec;
    });
    plainActors.set(density, plain);
  }
  return plain;
}
function rosterOf(base: PopulationPlan, density: PopulationDensity, order: 'tier' | 'appearance', layer: string,
  included: (layer: string) => boolean): PopulationPlan {
  let byDensity = rosters.get(base);
  if (!byDensity) { byDensity = new WeakMap(); rosters.set(base, byDensity); }
  let byLayer = byDensity.get(density);
  if (!byLayer) { byLayer = new Map(); byDensity.set(density, byLayer); }
  // The two orders may include different actors under one layer name.
  const key = `${order}\n${layer}`, memo = byLayer.get(key);
  if (memo) return memo;
  const plain = plainOf(density);
  const extras = plain.filter((_, index) => included(density.actors[index].layer));
  const roster: PopulationPlan = { ...base, actors: [...base.actors, ...extras],
    contentDigest: hash128(`${base.contentDigest}|${density.digest}|${layer}`),
    density, densityLayer: layer, vehicleFollowing: 'living-r2' };
  byLayer.set(key, roster); rosterBases.set(roster, base);
  return roster;
}

/**
 * The population a consumer installs for one production layer. 'base' is the
 * living-r1 plan itself (the same object), and so is every layer of a plan
 * without a density. Otherwise a new plan sharing `paths`, `anchors`,
 * `crossings` and `report` by reference, with the base actors followed by
 * every extra up to `layer` (medium, then high), its own `contentDigest`,
 * `densityLayer`, the living-r2 vehicle rules and the `density` kept. The same
 * object comes back for the same plan and layer; a roster passed in resolves
 * to its base first.
 */
export function populationRoster(plan: PopulationPlan, layer: 'base' | PopulationDensityTier): PopulationPlan {
  const base = baseOf(plan);
  if (layer === 'base' || !base.density) return base;
  const upto = TIER_ORDER.indexOf(layer);
  if (upto < 0) throw new RangeError(`Unknown population density layer ${layer as string}`);
  return rosterOf(base, base.density, 'tier', layer, name => {
    const index = TIER_ORDER.indexOf(name as PopulationDensityTier);
    return index >= 0 && index <= upto;
  });
}

/**
 * `populationRoster` for measurement layers: `density` may be any authored
 * layering of this plan, ordered by each layer's first actor. A layer that
 * admitted no actor has no place in that order, so it is refused.
 */
export function populationRosterFromLayers(plan: PopulationPlan, density: PopulationDensity,
  uptoLayer: PopulationDensityLayerId): PopulationPlan {
  const base = baseOf(plan);
  const order: string[] = [];
  for (const actor of density.actors) if (!order.includes(actor.layer)) order.push(actor.layer);
  const upto = order.indexOf(uptoLayer);
  if (upto < 0) throw new RangeError(`Density layer ${uptoLayer} admitted no actors`);
  return rosterOf(base, density, 'appearance', uptoLayer, name => order.indexOf(name) <= upto);
}
