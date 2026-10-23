/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 — where the city launch pads go (docs/PLANS.md §42).
 *
 * A pure finder over the **prepared** plan and its population: 4–6 lawn sites
 * off the driving line in a generated town, derived after the plan exists and
 * never written into it. It reads no seed stream, hazard or target, and
 * decides nothing from a level or venue id (invariant 22).
 *
 * Pre-staged by the M42 coordinator with the final exported types; Builder A
 * filled the finder in. Builder B's renderer and the `Game` insertions code
 * against these exports, so the exported types change only through a Ruling.
 *
 * **Pads are a derived layer, never part of the world** (§42.2c). Nothing here
 * writes to the plan or the population, so `planDigest`, every seed pin and
 * every record key are untouched by construction; the finder's test asserts
 * both digests across a call. The site list goes to two consumers — the
 * renderer draws it, and `Game` builds the human seats' `LaunchPadField` from
 * it — and both ask with the same plan and population objects, so the memo
 * below makes the second call free (`launchPadFinderRuns` proves it).
 *
 * **The rules** (§42.2b, the placement scout's strict set tightened to the
 * flight cap; every number lives in `LAUNCH_PAD`):
 *
 *   - a 2 m lattice anchored on the heightfield origin, integer keys;
 *   - ≥ footprint + 8 m from any non-grass heightfield cell, ≤ 40 m from one
 *     (findable);
 *   - the ridden surface is grass at every point within footprint + 1 m;
 *   - ≥ the clear radius (flight cap + trigger + 1 m = 22.4 m) from every
 *     collider, solid, soft body, checkpoint, population path (point plus its
 *     clearance), parking bay, activity site, ground source and solid prop;
 *   - ≥ apron + 0.5 m from every render-only prop and site-list entry (the
 *     site lists are implied by the clear radius; see `clearOfDecor`);
 *   - outside the corner-cut capsules (chords 12–60 m apart along every
 *     segment centreline and across every shared socket, half-width + 6 m),
 *     and the crossing from every free segment end — a branch or chicken
 *     line leaving its road part-way — to the nearest other line;
 *   - outside the missed-corner rays (42 m straight on, half-width + 6 m, from
 *     every sample bending tighter than ≈ 120 m and from every segment end);
 *   - ≥ the clear radius from the through route's hazard-and-target band
 *     (half-width + `routeBandMarginMetres`), where every hazard and Knockabout
 *     stand is placed whatever a probe asks for — so neither can lie in a
 *     flight's landing zone, and the finder still reads neither;
 *   - ≥ 40 m from the spawn;
 *   - **seen and reachable from a ridden line** (critic repair, 2026-10-10):
 *     from at least three samples of `plan.segments` centrelines (sample and
 *     direction pairs; one glimpse at the edge of range is not enough),
 *     travelling either way
 *     with the pad within ±40° of travel, a chase-camera point (2 m over the
 *     ridden surface, 5 m back) within 60 m sees the pad centre — the
 *     camera's own `PlanTerrainSampler.raycast` and every solid (a trunk)
 *     clear of the ray — and the wheel can ride straight from that sample to
 *     the centre (no
 *     step over the step-up, no solid across the pedals: a path fenced on the
 *     pad's side is no access). A road in a cutting or a ravine hides a lawn
 *     beyond its banks; this keeps such a lawn pad-free;
 *   - footprint flat within 8 cm, clear disc within 0.6 m; the drop the
 *     flight cap reads is measured over the reachable disc (flight cap +
 *     trigger, 21.4 m), not out to the clear disc's rim;
 *   - greedy picks ≥ 70 m apart, 4–6, one per district before any gets two,
 *     the first the best site in the spawn's forward cone.
 *
 * **Determinism** (§42.2c): the lattice, the distance fields and the spacing
 * test are integer arithmetic; the remaining thresholds are plain IEEE
 * arithmetic on plan data, quantised to the lattice; there is no hash, no
 * random source and no clock. The browser spec compares this list with the
 * one Chromium computes.
 *
 * **Cost.** It runs on the boot path of every world install. Two exact
 * Euclidean distance transforms over the 2 m lattice answer the corridor band
 * and the 22.4 m clearance for every lattice point at once (each threshold
 * widened by half a lattice diagonal, so they only ever exclude more); the
 * remaining rules are checked lazily, only for the candidates the greedy pick
 * actually reaches, against bucketed geometry.
 *
 * **Authored pads** (M44, `docs/PLANS.md` §44.1 D5). A plan that carries
 * `LevelPlan.launchPads` — a hand-built venue whose pads stand where the city
 * predicate above never reaches (on a roof deck, in a dense courtyard) — is
 * not searched: its list is *resolved* into the same `LaunchPadSite`s, in
 * the authored order, and everything downstream (the field, the view, the
 * pricing and the grass and squirrel discs) cannot tell the two apart. The
 * entry gives the id, the centre, the yaw, the declared drop and — only if it
 * writes one — its safe-point hold (D15, carried as written); the radii are
 * `LAUNCH_PAD`'s, never the author's; `y` is the prepared plan's own ground
 * at the centre through the same `PlanTerrainSampler` the finder reads, so a
 * pad on a roof deck stands on the deck's top. A bad list throws instead of
 * quietly losing a pad. The branch is a plan predicate like the gate (a key
 * on the plan, never a level or venue id, invariant 22), and **the derived
 * branch is untouched**: no shipped plan carries the key, so every derived
 * list — and every digest, seed pin and record key — is what it was (the
 * corpus pin in `src/bench/launchPadHook.test.ts`). Invariant 3 still holds
 * the derived output: it is never written into a plan; the authored list is
 * an *input* the producer wrote, as `hazards` and `softBodies` are.
 */
import { EUC, LAUNCH_PAD, PHYSICS, TERRAIN, WHEEL } from '../data/tuning.ts';
import { PROP_SOLIDS } from '../data/props.ts';
import type { AuthoredLaunchPad, BoxCollider, LevelPlan } from './plan.ts';
import type { PopulationPlan } from './populationPlan.ts';
import { RouteSpine, createSpineSample } from '../simulation/routeSpine.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { lateralCeilingG } from '../simulation/lateralCeiling.ts';
import { METRES_PER_SECOND_PER_MPH, shippedTopSpeedMph } from '../simulation/topSpeedPreset.ts';

export interface LaunchPadSite {
  readonly id: string;              // stable: derived `pad-${ix}-${iz}` from integer lattice coords, or the authored entry's own id
  readonly x: number; readonly y: number; readonly z: number;  // y = ground height at the centre (a collider's top where one stands)
  readonly yaw: number;             // octagon orientation; derived: multiples of π/8, a flat face toward the nearest road; authored: as written
  readonly triggerRadius: number;   // LAUNCH_PAD.triggerRadiusMetres (1.4)
  readonly footprintRadius: number; // LAUNCH_PAD.footprintRadiusMetres (2.0)
  readonly dropMetres: number;      // the flight cap's Δh, ≥ 0. Derived: centre ground minus the lowest ground a flight can reach (flight cap + trigger, 21.4 m), + margin; authored: as declared (a roof pad declares 0)
  readonly holdSafeMetres?: number; // authored only, and only when the entry writes it (M44 D15): the safe-point hold radius, m, ≥ 0 (`LaunchPadField.holdsSafePoint`). A derived site never carries the key, so its JSON is what it was.
}

/** The answer for every world that is not a town, shared and frozen. */
const NO_SITES: readonly LaunchPadSite[] = Object.freeze([]);

interface Memo {
  readonly population: PopulationPlan;
  readonly sites: readonly LaunchPadSite[];
}

/** One answer per plan object; a different population recomputes. */
const MEMO = new WeakMap<LevelPlan, Memo>();
let finderRuns = 0;

/**
 * Pure; memoised per plan object (WeakMap; recompute if called with a
 * different population). Never mutates either plan. A plan carrying
 * `launchPads` gets its authored list resolved (`authoredSites`; throws on a
 * bad list); every other plan is searched exactly as M42 shipped.
 */
export function cityLaunchPads(plan: LevelPlan, population: PopulationPlan | null): readonly LaunchPadSite[] {
  // The game always passes the population it installed; a caller without one
  // has no people to keep pads away from, and so gets none. That holds for an
  // authored list too: every consumer passes the installed population, so the
  // two branches answer the same callers.
  if (population === null) return NO_SITES;
  const memo = MEMO.get(plan);
  if (memo !== undefined && memo.population === population) return memo.sites;
  // One computation per world either way — a search or an authored list's
  // resolution — so the counter reads "+1 per installed world" on every
  // world, as the M42 browser spec expects across a swap.
  finderRuns += 1;
  const found = plan.launchPads !== undefined ? authoredSites(plan, plan.launchPads) : findSites(plan, population);
  const sites = found.length === 0 ? NO_SITES : Object.freeze(found.map((site) => Object.freeze(site)));
  MEMO.set(plan, { population, sites });
  return sites;
}

/**
 * Test/QA only: how many times `cityLaunchPads` actually computed (memo
 * misses) since load — a derived search or an authored list's resolution.
 */
export function launchPadFinderRuns(): number {
  return finderRuns;
}

/**
 * M44 (§44.1 D5): an authored list as sites, in its own order. Nothing is
 * searched, moved or dropped: the author placed every pad on purpose, and the
 * venue's own test proves where they stand (the lane rule, roof reach, the
 * gap rule). What this checks is that each entry *is* a pad — a non-empty id
 * no earlier entry used, a finite centre and yaw, a finite drop ≥ 0 and, when
 * the entry writes one, a finite safe-point hold ≥ 0 — and it
 * throws a `RangeError` naming the entry otherwise, so a typo fails the
 * venue's first test instead of losing a pad or arming two under one id.
 *
 * `y` is the prepared plan's ground at the centre — the highest collider top
 * there, or the heightfield, or the surround off it — through a
 * `PlanTerrainSampler` built on this plan, exactly as `Validator.site` reads
 * it. The drop is the author's: a roof pad's honest drop is the gap it exists
 * to cross, which would crush the lift cap, so it declares the roof it stands
 * on (`dropMetres: 0`, §44.1 D5). An empty list resolves to no pads (and
 * never falls back to the search); `plan.ts` asks producers to omit the key
 * instead, which is a digest matter, not a resolution one.
 */
function authoredSites(plan: LevelPlan, authored: readonly AuthoredLaunchPad[]): LaunchPadSite[] {
  if (authored.length === 0) return [];
  const sampler = new PlanTerrainSampler(plan);
  const ground = createGroundSample();
  const ids = new Set<string>();
  const sites: LaunchPadSite[] = [];
  authored.forEach((pad, index) => {
    const named = typeof pad.id === 'string' && pad.id.length > 0 ? ` "${pad.id}"` : '';
    const label = `authored launch pad ${index}${named}`;
    // A blank id is no name: the QA bridge and the drawn-equals-armed check compare ids.
    if (typeof pad.id !== 'string' || pad.id.trim().length === 0) throw new RangeError(`${label} needs a non-empty id`);
    if (ids.has(pad.id)) throw new RangeError(`${label} repeats an earlier pad's id`);
    ids.add(pad.id);
    if (!Number.isFinite(pad.x) || !Number.isFinite(pad.z)) throw new RangeError(`${label} needs a finite centre`);
    if (!Number.isFinite(pad.yaw)) throw new RangeError(`${label} needs a finite yaw`);
    if (!Number.isFinite(pad.dropMetres) || pad.dropMetres < 0) {
      throw new RangeError(`${label} needs a finite drop of at least 0 m`);
    }
    // The safe-point hold (D15) is optional: absent is no hold, and it stays
    // absent on the site, so an entry that writes none resolves to the same
    // eight keys as before (and as every derived site).
    const hold = pad.holdSafeMetres;
    if (hold !== undefined && (!Number.isFinite(hold) || hold < 0)) {
      throw new RangeError(`${label} needs a finite safe-point hold of at least 0 m`);
    }
    const y = sampler.sampleGround(pad.x, pad.z, ground).height;
    if (!Number.isFinite(y)) throw new RangeError(`${label} stands on ground that has no finite height`);
    const site: LaunchPadSite = {
      id: pad.id,
      x: pad.x, y, z: pad.z,
      yaw: pad.yaw,
      triggerRadius: LAUNCH_PAD.triggerRadiusMetres,
      footprintRadius: LAUNCH_PAD.footprintRadiusMetres,
      dropMetres: pad.dropMetres,
    };
    sites.push(hold === undefined ? site : { ...site, holdSafeMetres: hold });
  });
  return sites;
}

// ---------------------------------------------------------------------------
// The derived numbers (never typed: each is a sum or product of LAUNCH_PAD)
// ---------------------------------------------------------------------------

/** The farthest a pad flight lands from the centre: the flight cap plus the trigger, 21.4 m. */
export function launchPadReachRadius(): number {
  return LAUNCH_PAD.maximumFlightMetres + LAUNCH_PAD.triggerRadiusMetres;
}

/** The flight cap plus the trigger plus the margin: 22.4 m. */
export function launchPadClearRadius(): number {
  return launchPadReachRadius() + LAUNCH_PAD.clearanceMarginMetres;
}

/** How far a missed corner carries a rider straight on: 42 m. */
export function launchPadMissedCornerRay(): number {
  return LAUNCH_PAD.roadReachMetres + LAUNCH_PAD.footprintRadiusMetres;
}

/**
 * The tightest bend a rider at the shipped top speed takes at the grip limit,
 * times `missedCornerBendFactor`: ≈ 120 m. A sample bending at least this
 * tightly is a corner a fast rider can miss.
 */
export function launchPadMissedCornerBendRadius(): number {
  const v = shippedTopSpeedMph() * METRES_PER_SECOND_PER_MPH;
  return LAUNCH_PAD.missedCornerBendFactor * (v * v) / (PHYSICS.gravity * lateralCeilingG(v, EUC));
}

/** Render-only decor keeps this far from a pad centre: the apron plus its margin, 4.0 m. */
export function launchPadDecorClearance(): number {
  return LAUNCH_PAD.apronRadiusMetres + LAUNCH_PAD.decorMarginMetres;
}

/**
 * The line samples the finder's corner rules are built on, exported so the
 * finder's own test re-checks the picks against the same geometry. Every
 * `plan.segments` centreline, sampled through `RouteSpine.fromTraversal` — the
 * same Hermite and the same ~3.5 m spacing the spine and the cop ride on.
 */
export interface LaunchPadLine {
  readonly segmentId: string;
  readonly x: Float64Array;
  readonly z: Float64Array;
  /** Distance from the segment's entry, metres. */
  readonly s: Float64Array;
  readonly heading: Float64Array;
  readonly halfWidth: Float64Array;
}

/** The line rules as capsules — (ax, az, bx, bz, radius) per capsule — exactly as stated, unskipped. */
export interface LaunchPadCapsules {
  readonly cornerCut: Float64Array;
  readonly missedCorner: Float64Array;
  /** The through route's hazard-and-target band, widened by the clear radius. */
  readonly routeBand: Float64Array;
}

/** What the finder excludes along the ridden lines, for the test to re-check. */
export function launchPadLineCapsules(plan: LevelPlan): LaunchPadCapsules {
  const lines = sampleLines(plan);
  const cut: number[] = [];
  const missed: number[] = [];
  const band: number[] = [];
  buildLineCapsules(lines, cut, missed, COLLINEAR_METRES);
  const spine = RouteSpine.fromPlan(plan);
  if (spine !== null) buildRouteBand(spine, band);
  return { cornerCut: Float64Array.from(cut), missedCorner: Float64Array.from(missed), routeBand: Float64Array.from(band) };
}

// ---------------------------------------------------------------------------
// The finder
// ---------------------------------------------------------------------------

/**
 * Below this a chord is the line it spans (a straight road's own chords lie on
 * the road and add nothing a centreline capsule does not), metres. A numeric
 * tolerance for collinearity, not a rule.
 */
const COLLINEAR_METRES = 1e-6;
/**
 * The finder's own speed-up, metres: a chord within this of the line it spans
 * is skipped, and every line's own capsule is widened by the same amount, so
 * the region excluded is a superset of the rule's (every point of a skipped
 * chord lies within this of the line). The widened line capsule sits inside
 * the corridor gap on any paved or dirt road anyway. `launchPadLineCapsules`
 * returns the rule itself, unskipped, for the test.
 */
const CHORD_SKIP_METRES = 4;
/** RouteSpine's own sample spacing, metres (`routeSpine.ts` `SAMPLE_SPACING`). */
const LINE_SAMPLE_METRES = 3.5;
/** Segment ends closer than this share a socket, metres (`routeSpine.ts` `TIGHT_JOIN`). */
const SOCKET_JOIN_METRES = 1.25;
/** Bucket pitch for the lazy point queries, metres. Any value is exact; these are cheap. */
const BUCKET_METRES = 16;
/** The corner capsules are long (up to a 60 m chord), so they bucket coarser. */
const CAPSULE_BUCKET_METRES = 32;
/**
 * Arc spacing of the reachable disc's rim samples, metres: between two, the
 * ground can sit at most half this × its slope below the lower, which
 * `dropSampleMarginMetres` covers up to a 1:1 slope.
 */
const RIM_SAMPLE_METRES = 0.1;

/** What a candidate needs to know about the world, built once per call. */
interface World {
  readonly plan: LevelPlan;
  readonly population: PopulationPlan;
  /** Vertex grid = the heightfield's samples. */
  readonly columns: number;
  readonly rows: number;
  readonly spacing: number;
  readonly originX: number;
  readonly originZ: number;
  /** Lattice step in vertices (lattice pitch / heightfield spacing). */
  readonly step: number;
  readonly latticeColumns: number;
  readonly latticeRows: number;
  /** The through route: where the generator places hazards and Knockabout targets. */
  readonly spine: RouteSpine;
}

/** One call's candidate search: the sorted lattice keys and the lazy validator. */
interface Search {
  readonly world: World;
  /** Integer sort keys, best first: distance band × lattice count + lattice index. */
  readonly keys: readonly number[];
  readonly latticeCount: number;
  readonly validator: Validator;
}

/**
 * Test/QA only: every lattice point the finder accepts as a site — every rule
 * but the spacing between picks and the district spread — for which
 * `where(x, z)` holds, in the finder's own order of preference. Not memoised
 * and never on the boot path. The corpus test passes its own forward-cone
 * predicate, so a first pick that skips a qualifying cone site fails there.
 */
export function launchPadCandidates(plan: LevelPlan, population: PopulationPlan,
  where: (x: number, z: number) => boolean): readonly { readonly x: number; readonly z: number }[] {
  const found = search(plan, population);
  if (found === null) return [];
  const out: { x: number; z: number }[] = [];
  for (const key of found.keys) {
    const { x, z } = found.validator.position(key % found.latticeCount);
    if (where(x, z) && found.validator.valid(key % found.latticeCount)) out.push({ x, z });
  }
  return out;
}

/**
 * One sighting: a sample of a ridden line from which a chase camera sees a
 * site unobstructed and the wheel can ride straight to its centre.
 */
export interface LaunchPadSighting {
  readonly segmentId: string;
  /** The road sample (where the rider is), metres. */
  readonly x: number;
  readonly z: number;
  /** The travel heading at the sample, radians: the line's own, or its reverse. */
  readonly headingY: number;
  /** The chase-camera point the sighting was taken from. */
  readonly camera: { readonly x: number; readonly y: number; readonly z: number };
  /** Camera point to the sighted centre, metres. */
  readonly distance: number;
}

/**
 * Test/QA only: every sighting of a point, by the finder's own sightline rule,
 * in the line samples' order. Not memoised and never on the boot path; the
 * corpus test rides the wheel line from a site's nearest sighting.
 */
export function launchPadSightings(plan: LevelPlan, x: number, z: number): readonly LaunchPadSighting[] {
  const out: LaunchPadSighting[] = [];
  new Sightlines(plan, new PlanTerrainSampler(plan), sampleLines(plan)).seen(x, z, out);
  return out;
}

function findSites(plan: LevelPlan, population: PopulationPlan): LaunchPadSite[] {
  const found = search(plan, population);
  if (found === null) return [];
  const { world, keys, latticeCount, validator } = found;
  const spawnX = plan.spawn.position.x, spawnZ = plan.spawn.position.z;

  // -- Lazy validation: only the candidates the greedy pick reaches ---------
  const picks: { index: number; district: string }[] = [];
  const counts = new Map<string, number>();
  const spacingSquared = Math.ceil((LAUNCH_PAD.spacingMetres * LAUNCH_PAD.spacingMetres)
    / (LAUNCH_PAD.siteLatticeMetres * LAUNCH_PAD.siteLatticeMetres));
  const spaced = (index: number): boolean => {
    const ix = index % world.latticeColumns, iz = Math.floor(index / world.latticeColumns);
    for (const pick of picks) {
      const dx = ix - pick.index % world.latticeColumns;
      const dz = iz - Math.floor(pick.index / world.latticeColumns);
      if (dx * dx + dz * dz < spacingSquared) return false;
    }
    return true;
  };
  const take = (index: number): void => {
    const district = validator.district(index);
    picks.push({ index, district });
    counts.set(district, (counts.get(district) ?? 0) + 1);
  };

  // The first pick: the best site in the spawn's forward cone, so a new rider
  // sees a pad from the start line.
  const forwardX = Math.sin(plan.spawn.headingY), forwardZ = Math.cos(plan.spawn.headingY);
  const coneCos = Math.cos(LAUNCH_PAD.spawnConeRadians);
  const [coneNear, coneFar] = LAUNCH_PAD.spawnConeMetres;
  for (const key of keys) {
    const index = key % latticeCount;
    const { x, z } = validator.position(index);
    const dx = x - spawnX, dz = z - spawnZ, distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < coneNear * coneNear || distanceSquared > coneFar * coneFar) continue;
    const along = dx * forwardX + dz * forwardZ;
    if (along <= 0 || along * along < distanceSquared * coneCos * coneCos) continue;
    if (!validator.valid(index)) continue;
    take(index);
    break;
  }

  // Then round by round: in round r a district with r picks may take one
  // more, so every district gets one before any gets two.
  for (let round = 0; picks.length < LAUNCH_PAD.maximumPads; round += 1) {
    let progressed = false;
    for (const key of keys) {
      if (picks.length >= LAUNCH_PAD.maximumPads) break;
      const index = key % latticeCount;
      if (!spaced(index)) continue;
      if ((counts.get(validator.district(index)) ?? 0) > round) continue;
      if (!validator.valid(index)) continue;
      take(index);
      progressed = true;
    }
    if (!progressed && round >= LAUNCH_PAD.maximumPads) break;
  }

  return picks.map(({ index }) => validator.site(index));
}

/**
 * The gate, the two distance fields and the cheap whole-lattice filters: the
 * candidates in the finder's order of preference, or null when the world is
 * not a town or has none.
 */
function search(plan: LevelPlan, population: PopulationPlan): Search | null {
  // **"City" is a plan predicate** (invariant 22): a closed town ring and a
  // route spine. The slice, the proving ground, BelVar and Switchback fail it.
  if (!(plan.streetLoops ?? []).some((loop) => loop.alternate.length === 0)) return null;
  const spine = RouteSpine.fromPlan(plan);
  if (spine === null) return null;

  const field = plan.heightfield;
  const spacing = field.spacing;
  const step = Math.round(LAUNCH_PAD.siteLatticeMetres / spacing);
  // Every generated town is a 1 m heightfield. A lattice that does not land on
  // its vertices is a world these rules were never measured on: no pads.
  if (step < 1 || Math.abs(step * spacing - LAUNCH_PAD.siteLatticeMetres) > 1e-9) return null;
  const world: World = {
    plan, population,
    columns: field.columns, rows: field.rows, spacing,
    originX: field.originX, originZ: field.originZ, step,
    latticeColumns: Math.floor((field.columns - 1) / step) + 1,
    latticeRows: Math.floor((field.rows - 1) / step) + 1,
    spine,
  };

  const clearRadius = launchPadClearRadius();
  const pitch = LAUNCH_PAD.siteLatticeMetres;
  // Half a lattice cell's diagonal: every point of a shape lies within this of
  // its nearest lattice point, which the shape therefore marks; so a lattice
  // point's distance to the nearest marked point, less this, never overstates
  // its distance to the shape. It is the margin every threshold below adds.
  const cellReach = pitch * Math.SQRT1_2;

  // -- The two distance fields, one value per lattice point ----------------
  const corridor = latticeDistanceSquared(world, corridorMask(world));
  const hard = latticeDistanceSquared(world, hardMask(world, cellReach));

  // -- Cheap, exact candidates over the whole lattice ----------------------
  // Squared distances in lattice units, compared as plain doubles.
  const units = (metres: number): number => (metres * metres) / (pitch * pitch);
  const minimumCorridor = units(LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.corridorGapMetres + cellReach);
  const maximumCorridor = units(LAUNCH_PAD.roadReachMetres - cellReach);
  const minimumHard = units(clearRadius + cellReach);
  const spawnX = plan.spawn.position.x, spawnZ = plan.spawn.position.z;
  const spawnClear = LAUNCH_PAD.spawnClearMetres * LAUNCH_PAD.spawnClearMetres;
  // The clear disc stays on the heightfield, so every rule reads real cells.
  const edgeVertices = Math.ceil(clearRadius / spacing);
  const keys: number[] = [];
  const latticeCount = world.latticeColumns * world.latticeRows;
  for (let iz = 0; iz < world.latticeRows; iz += 1) {
    const row = iz * step;
    if (row < edgeVertices || row > world.rows - 1 - edgeVertices) continue;
    for (let ix = 0; ix < world.latticeColumns; ix += 1) {
      const column = ix * step;
      if (column < edgeVertices || column > world.columns - 1 - edgeVertices) continue;
      const index = iz * world.latticeColumns + ix;
      const road = corridor[index];
      if (road < minimumCorridor || road > maximumCorridor) continue;
      if (hard[index] < minimumHard) continue;
      const x = world.originX + column * spacing, z = world.originZ + row * spacing;
      if ((x - spawnX) * (x - spawnX) + (z - spawnZ) * (z - spawnZ) < spawnClear) continue;
      // Integer sort keys: the distance band (whole lattice pitches from the
      // road, nearest first, so a pad is findable), then z, then x.
      const band = Math.floor(Math.sqrt(road));
      keys.push(band * latticeCount + index);
    }
  }
  if (keys.length === 0) return null;
  keys.sort((a, b) => a - b);
  return { world, keys, latticeCount, validator: new Validator(world) };
}

// ---------------------------------------------------------------------------
// Distance fields
// ---------------------------------------------------------------------------

/**
 * Every lattice point whose cell (the square of side one pitch around it)
 * touches a non-grass heightfield cell. The road is then within `cellReach`
 * of every marked point, and every road point marks its nearest one.
 */
function corridorMask(world: World): Uint8Array {
  const { columns, rows, step, latticeColumns, latticeRows } = world;
  const surfaces = world.plan.heightfield.surfaces;
  const mask = new Uint8Array(latticeColumns * latticeRows);
  const cells = columns - 1;
  const half = step / 2;
  // Two passes on purpose: the scan of half a million cells stays one tight
  // loop (it runs once per world install, cold, on the boot path), and only
  // the few percent of cells that are road are then spread onto the lattice.
  const total = cells * (rows - 1);
  const road = new Int32Array(total);
  let count = 0;
  for (let cell = 0; cell < total; cell += 1) {
    if (surfaces[cell] !== 'grass') road[count++] = cell;
  }
  for (let k = 0; k < count; k += 1) {
    const r = Math.floor(road[k] / cells), c = road[k] - r * cells;
    const z0 = Math.max(0, Math.ceil((r - half) / step)), z1 = Math.min(latticeRows - 1, Math.floor((r + 1 + half) / step));
    const x0 = Math.max(0, Math.ceil((c - half) / step)), x1 = Math.min(latticeColumns - 1, Math.floor((c + 1 + half) / step));
    for (let lz = z0; lz <= z1; lz += 1) for (let lx = x0; lx <= x1; lx += 1) mask[lz * latticeColumns + lx] = 1;
  }
  return mask;
}

/**
 * Every lattice point within `cellReach` of something a pad must keep the
 * clear radius from: segment colliders, solids, soft bodies, checkpoints,
 * solid props, population paths (each point plus its clearance), parking
 * bays and their driveways, activity sites and their approaches, and the
 * finished-ground sources.
 */
function hardMask(world: World, cellReach: number): Uint8Array {
  const { plan, population } = world;
  const mask = new Uint8Array(world.latticeColumns * world.latticeRows);
  const reach = cellReach * (1 + 1e-9);
  const box = (box: BoxCollider): void => markBox(world, mask, box.centre.x, box.centre.z,
    box.halfExtents.x, box.halfExtents.z, box.rotationY, reach);
  for (const segment of plan.segments) for (const collider of segment.colliders) box(collider);
  for (const solid of plan.solids ?? []) box(solid);
  for (const soft of plan.softBodies ?? []) box(soft);
  for (const gate of plan.checkpoints) {
    markBox(world, mask, gate.centre.x, gate.centre.z, gate.halfExtents.x, gate.halfExtents.z, gate.headingY, reach);
  }
  for (const prop of plan.props ?? []) {
    if (PROP_SOLIDS[prop.kind] !== null) markDisc(world, mask, prop.position.x, prop.position.z, reach);
  }
  for (const path of population.paths) {
    const radius = path.clearanceRadiusMetres + reach;
    for (const point of path.points) markDisc(world, mask, point.x, point.z, radius);
  }
  for (const bay of plan.populationParkingBays ?? []) {
    markBox(world, mask, bay.position.x, bay.position.z, bay.halfWidthMetres, bay.halfLengthMetres,
      bay.headingY, reach);
    for (const frame of bay.approachFrames ?? []) markDisc(world, mask, frame.x, frame.z, frame.halfWidthMetres + reach);
  }
  for (const site of plan.populationActivitySites ?? []) {
    for (const spot of site.positions) markDisc(world, mask, spot.position.x, spot.position.z, reach);
    for (const frame of site.approachFrames) markDisc(world, mask, frame.x, frame.z, frame.halfWidthMetres + reach);
  }
  for (const source of plan.populationGroundSources ?? []) {
    for (const polygon of source.polygons) markPolygon(world, mask, polygon, reach);
  }
  return mask;
}

/** Lattice range covering [min, max] on one axis, clamped to the lattice. */
function latticeRange(origin: number, count: number, min: number, max: number): [number, number] {
  const pitch = LAUNCH_PAD.siteLatticeMetres;
  return [Math.max(0, Math.ceil((min - origin) / pitch)), Math.min(count - 1, Math.floor((max - origin) / pitch))];
}

function markDisc(world: World, mask: Uint8Array, x: number, z: number, radius: number): void {
  const { latticeColumns, latticeRows, originX, originZ } = world;
  const pitch = LAUNCH_PAD.siteLatticeMetres;
  const [c0, c1] = latticeRange(originX, latticeColumns, x - radius, x + radius);
  const [r0, r1] = latticeRange(originZ, latticeRows, z - radius, z + radius);
  const limit = radius * radius;
  for (let r = r0; r <= r1; r += 1) {
    const dz = originZ + r * pitch - z;
    for (let c = c0; c <= c1; c += 1) {
      const dx = originX + c * pitch - x;
      if (dx * dx + dz * dz <= limit) mask[r * latticeColumns + c] = 1;
    }
  }
}

/** A box in the plan's yaw convention (`planSampler.ts`: local x = cos·dx − sin·dz). */
function markBox(world: World, mask: Uint8Array, x: number, z: number, halfX: number, halfZ: number,
  yaw: number, reach: number): void {
  const { latticeColumns, latticeRows, originX, originZ } = world;
  const pitch = LAUNCH_PAD.siteLatticeMetres;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const spanX = Math.abs(cos) * halfX + Math.abs(sin) * halfZ + reach;
  const spanZ = Math.abs(sin) * halfX + Math.abs(cos) * halfZ + reach;
  const [c0, c1] = latticeRange(originX, latticeColumns, x - spanX, x + spanX);
  const [r0, r1] = latticeRange(originZ, latticeRows, z - spanZ, z + spanZ);
  const limit = reach * reach;
  for (let r = r0; r <= r1; r += 1) {
    const dz = originZ + r * pitch - z;
    for (let c = c0; c <= c1; c += 1) {
      const dx = originX + c * pitch - x;
      const ex = Math.max(Math.abs(cos * dx - sin * dz) - halfX, 0);
      const ez = Math.max(Math.abs(sin * dx + cos * dz) - halfZ, 0);
      if (ex * ex + ez * ez <= limit) mask[r * latticeColumns + c] = 1;
    }
  }
}

function markPolygon(world: World, mask: Uint8Array, polygon: readonly { x: number; z: number }[], reach: number): void {
  if (polygon.length === 0) return;
  const { latticeColumns, latticeRows, originX, originZ } = world;
  const pitch = LAUNCH_PAD.siteLatticeMetres;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const [c0, c1] = latticeRange(originX, latticeColumns, minX - reach, maxX + reach);
  const [r0, r1] = latticeRange(originZ, latticeRows, minZ - reach, maxZ + reach);
  for (let r = r0; r <= r1; r += 1) {
    const z = originZ + r * pitch;
    for (let c = c0; c <= c1; c += 1) {
      const x = originX + c * pitch;
      if (insidePolygon(polygon, x, z) || polygonEdgeDistanceSquared(polygon, x, z) <= reach * reach) {
        mask[r * latticeColumns + c] = 1;
      }
    }
  }
}

function insidePolygon(polygon: readonly { x: number; z: number }[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function polygonEdgeDistanceSquared(polygon: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    best = Math.min(best, segmentDistanceSquared(x, z, polygon[j].x, polygon[j].z, polygon[i].x, polygon[i].z));
  }
  return best;
}

function segmentDistanceSquared(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  const t = length > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / length)) : 0;
  const ex = px - (ax + dx * t), ez = pz - (az + dz * t);
  return ex * ex + ez * ez;
}

/**
 * Exact squared Euclidean distance, in lattice units, from every lattice
 * point to the nearest marked one (Felzenszwalb–Huttenlocher, two separable
 * passes). Integer-valued doubles throughout: an unmarked line's "infinity"
 * is a finite square larger than the lattice, so no arithmetic loses a bit
 * and Node and Chromium agree exactly.
 */
function latticeDistanceSquared(world: World, mask: Uint8Array): Float64Array {
  const { latticeColumns: w, latticeRows: h } = world;
  const far = (w + h) * (w + h);
  // Pass 1, along each row: squared distance along x to the nearest marked
  // point, stored column-major so pass 2 reads each column contiguously.
  const along = new Float64Array(w * h);
  for (let r = 0; r < h; r += 1) {
    const base = r * w;
    let last = -1;
    for (let c = 0; c < w; c += 1) {
      if (mask[base + c] === 1) last = c;
      along[c * h + r] = last < 0 ? far : (c - last) * (c - last);
    }
    let next = -1;
    for (let c = w - 1; c >= 0; c -= 1) {
      if (mask[base + c] === 1) next = c;
      if (next >= 0) {
        const at = c * h + r, d = (next - c) * (next - c);
        if (d < along[at]) along[at] = d;
      }
    }
  }
  // Pass 2, down each column: the lower envelope of parabolas.
  const out = new Float64Array(w * h);
  const v = new Int32Array(h);
  const bound = new Float64Array(h + 1);
  for (let c = 0; c < w; c += 1) {
    const base = c * h;
    let k = 0;
    v[0] = 0; bound[0] = -Infinity; bound[1] = Infinity;
    for (let q = 1; q < h; q += 1) {
      const fq = along[base + q] + q * q;
      let s = (fq - (along[base + v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= bound[k]) {
        k -= 1;
        s = (fq - (along[base + v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      }
      k += 1; v[k] = q; bound[k] = s; bound[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < h; q += 1) {
      while (bound[k + 1] < q) k += 1;
      const d = q - v[k];
      out[q * w + c] = d * d + along[base + v[k]];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The ridden lines: samples, corner-cut chords, missed-corner rays
// ---------------------------------------------------------------------------

function sampleLines(plan: LevelPlan): LaunchPadLine[] {
  const sample = createSpineSample();
  return plan.segments.map((segment) => {
    const spine = RouteSpine.fromTraversal(plan, [{ id: segment.id, forward: true }]);
    const length = spine.length;
    const count = Math.max(2, Math.ceil(length / LINE_SAMPLE_METRES)) + 1;
    const line: LaunchPadLine = {
      segmentId: segment.id,
      x: new Float64Array(count), z: new Float64Array(count), s: new Float64Array(count),
      heading: new Float64Array(count), halfWidth: new Float64Array(count),
    };
    for (let k = 0; k < count; k += 1) {
      const s = (length * k) / (count - 1);
      spine.sample(s, sample);
      line.x[k] = sample.x; line.z[k] = sample.z; line.s[k] = s;
      line.heading[k] = sample.headingY; line.halfWidth[k] = sample.halfWidth;
    }
    return line;
  });
}

/**
 * The through route's band, widened by the clear radius: capsules along the
 * canonical spine of radius clear radius + half-width + the band margin.
 * Hazards (within 0.62 of the half-width) and Knockabout target stands (just
 * off the verge) are placed only on this route's stations, whatever a probe
 * asks for, so keeping a site out of this band keeps every one of them out of
 * every flight's landing zone without reading a seed stream.
 */
function buildRouteBand(spine: RouteSpine, out: number[]): void {
  const sample = createSpineSample();
  const count = Math.max(2, Math.ceil(spine.length / LINE_SAMPLE_METRES));
  const reach = launchPadClearRadius() + LAUNCH_PAD.routeBandMarginMetres;
  let ax = 0, az = 0, aw = 0;
  for (let k = 0; k <= count; k += 1) {
    spine.sample((spine.length * k) / count, sample);
    if (k > 0) out.push(ax, az, sample.x, sample.z, reach + Math.max(aw, sample.halfWidth));
    ax = sample.x; az = sample.z; aw = sample.halfWidth;
  }
}

/** One step of a walk away from a socket: a sample and its arc distance from the socket. */
interface Reached {
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly arc: number;
}

function buildLineCapsules(lines: readonly LaunchPadLine[], cut: number[], missed: number[], skip: number): void {
  const [chordMin, chordMax] = LAUNCH_PAD.cornerCutSampleMetres;
  const cutMargin = LAUNCH_PAD.cornerCutMarginMetres;
  const rayLength = launchPadMissedCornerRay();
  const rayMargin = LAUNCH_PAD.missedCornerMarginMetres;
  const bendRadius = launchPadMissedCornerBendRadius();

  // Within a segment: every chord of 12–60 m of arc that leaves the line.
  for (const line of lines) {
    const n = line.x.length;
    // A segment's own centreline at the corner-cut radius, so a chord the
    // line already covers can be skipped without losing anything.
    for (let k = 0; k + 1 < n; k += 1) {
      cut.push(line.x[k], line.z[k], line.x[k + 1], line.z[k + 1],
        Math.max(line.halfWidth[k], line.halfWidth[k + 1]) + cutMargin + skip);
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const arc = line.s[j] - line.s[i];
        if (arc < chordMin) continue;
        if (arc > chordMax) break;
        if (chordLeavesLine(line.x, line.z, i, j, skip)) {
          cut.push(line.x[i], line.z[i], line.x[j], line.z[j],
            Math.max(line.halfWidth[i], line.halfWidth[j]) + cutMargin);
        }
      }
    }
    // Missed corners inside the segment: a sample bending at least as tightly
    // as the threshold throws a fast rider straight on, either way round.
    for (let k = 0; k < n; k += 1) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      const turn = Math.abs(wrapAngle(line.heading[b] - line.heading[a]));
      if (!(turn > 0) || (line.s[b] - line.s[a]) / turn > bendRadius) continue;
      const tx = Math.sin(line.heading[k]), tz = Math.cos(line.heading[k]);
      const radius = line.halfWidth[k] + rayMargin;
      missed.push(line.x[k], line.z[k], line.x[k] + tx * rayLength, line.z[k] + tz * rayLength, radius);
      missed.push(line.x[k], line.z[k], line.x[k] - tx * rayLength, line.z[k] - tz * rayLength, radius);
    }
    // Every segment end: a rider who does not take whatever comes next — a
    // junction, a bend into the next beat, a dead end — carries straight on.
    const last = n - 1;
    missed.push(line.x[last], line.z[last],
      line.x[last] + Math.sin(line.heading[last]) * rayLength, line.z[last] + Math.cos(line.heading[last]) * rayLength,
      line.halfWidth[last] + rayMargin);
    missed.push(line.x[0], line.z[0],
      line.x[0] - Math.sin(line.heading[0]) * rayLength, line.z[0] - Math.cos(line.heading[0]) * rayLength,
      line.halfWidth[0] + rayMargin);
  }

  // Across sockets: chords between the lines that meet at one, walking out
  // through further sockets up to the longest chord.
  const ends: { line: number; atExit: boolean; x: number; z: number }[] = [];
  lines.forEach((line, index) => {
    ends.push({ line: index, atExit: false, x: line.x[0], z: line.z[0] });
    ends.push({ line: index, atExit: true, x: line.x[line.x.length - 1], z: line.z[line.z.length - 1] });
  });
  const joined = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
    (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z) <= SOCKET_JOIN_METRES * SOCKET_JOIN_METRES;
  const neighbours: number[][] = ends.map((end, index) =>
    ends.flatMap((other, at) => (at !== index && other.line !== end.line && joined(end, other) ? [at] : [])));
  const seen = new Set<string>();
  for (let e = 0; e < ends.length; e += 1) {
    // One socket, once: a cluster is named by its lowest end index.
    const cluster = [e, ...neighbours[e]].sort((a, b) => a - b);
    const name = cluster.join(',');
    if (cluster[0] !== e || seen.has(name)) continue;
    seen.add(name);
    if (cluster.length < 2) {
      // **A free end** — an optional branch or a chicken line leaving a road
      // part-way along it, or a dead end. Nothing shares its socket, so a
      // rider crosses open ground between it and the nearest other line: the
      // capsule from the end to that line's nearest sample, if within the
      // longest chord, is ridden ground too.
      const own = ends[e];
      const line = lines[own.line];
      const k = own.atExit ? line.x.length - 1 : 0;
      let best = Infinity, bx = 0, bz = 0, bw = 0;
      lines.forEach((other, index) => {
        if (index === own.line) return;
        for (let j = 0; j < other.x.length; j += 1) {
          const d = (other.x[j] - own.x) * (other.x[j] - own.x) + (other.z[j] - own.z) * (other.z[j] - own.z);
          if (d < best) { best = d; bx = other.x[j]; bz = other.z[j]; bw = other.halfWidth[j]; }
        }
      });
      if (best <= chordMax * chordMax) {
        cut.push(own.x, own.z, bx, bz, Math.max(line.halfWidth[k], bw) + cutMargin);
      }
      continue;
    }
    // Each end leaving the socket is one branch: walk into its line away from
    // the socket, and on through any socket it reaches, out to chordMax.
    const branches = cluster.map((end) => walkAway(lines, ends, neighbours, end, chordMax));
    for (let a = 0; a < branches.length; a += 1) {
      for (let b = a + 1; b < branches.length; b += 1) {
        const one = branches[a], other = branches[b];
        for (let i = 0; i < one.length; i += 1) {
          const p = one[i];
          for (let j = 0; j < other.length; j += 1) {
            const q = other[j];
            const arc = p.arc + q.arc;
            if (arc < chordMin || arc > chordMax) continue;
            // A chord through a straight join lies on the road it spans.
            if (!branchChordLeaves(one, i, other, j, skip)) continue;
            cut.push(p.x, p.z, q.x, q.z, Math.max(p.halfWidth, q.halfWidth) + cutMargin);
          }
        }
      }
    }
  }
}

/**
 * The samples reached walking away from a socket into `start`'s line and on
 * through every socket beyond, out to `limit` metres of arc. A branch that
 * forks is followed down every fork.
 */
function walkAway(lines: readonly LaunchPadLine[], ends: readonly { line: number; atExit: boolean }[],
  neighbours: readonly (readonly number[])[], start: number, limit: number): Reached[] {
  const out: Reached[] = [];
  const visit = (end: number, offset: number, depth: number): void => {
    const { line: index, atExit } = ends[end];
    const line = lines[index];
    const n = line.x.length;
    const length = line.s[n - 1];
    for (let k = 0; k < n; k += 1) {
      const sample = atExit ? n - 1 - k : k;
      const arc = offset + (atExit ? length - line.s[sample] : line.s[sample]);
      if (arc > limit) break;
      // The socket itself is the other branch's sample too; skip the duplicate.
      if (k === 0 && depth > 0) continue;
      out.push({ x: line.x[sample], z: line.z[sample], halfWidth: line.halfWidth[sample], arc });
    }
    const far = end ^ 1;
    const reached = offset + length;
    if (reached >= limit || depth > lines.length) return;
    for (const next of neighbours[far]) visit(next, reached, depth + 1);
  };
  visit(start, 0, 0);
  return out;
}

/**
 * Whether the chord from `one[i]` to `other[j]` leaves the walked line between
 * them — `one` back to the socket, then `other` out — by more than the
 * collinear tolerance. Both branches start at the socket itself.
 */
function branchChordLeaves(one: readonly Reached[], i: number, other: readonly Reached[], j: number,
  skip: number): boolean {
  const ax = one[i].x, az = one[i].z, dx = other[j].x - ax, dz = other[j].z - az;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (!(length > 0)) return false;
  const off = (p: Reached): number => Math.abs((p.x - ax) * dz - (p.z - az) * dx) / length;
  for (let k = 0; k < i; k += 1) if (off(one[k]) > skip) return true;
  for (let k = 0; k < j; k += 1) if (off(other[k]) > skip) return true;
  return false;
}

/** Whether the chord i→j leaves the polyline between them by more than `skip` metres. */
function chordLeavesLine(xs: Float64Array, zs: Float64Array, i: number, j: number, skip: number): boolean {
  const ax = xs[i], az = zs[i], dx = xs[j] - ax, dz = zs[j] - az;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (!(length > 0)) return false;
  for (let k = i + 1; k < j; k += 1) {
    const off = Math.abs((xs[k] - ax) * dz - (zs[k] - az) * dx) / length;
    if (off > skip) return true;
  }
  return false;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// ---------------------------------------------------------------------------
// Lazy per-candidate rules
// ---------------------------------------------------------------------------

/**
 * A dense bucket grid over the heightfield (compressed rows, two typed
 * arrays), for "what might be within reach of here". Items whose bounds leave
 * the heightfield are clipped to it: every query is a candidate on it.
 */
class Buckets {
  readonly starts: Int32Array;
  readonly items: Int32Array;
  readonly pitch: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly columns: number;
  private readonly rows: number;

  constructor(world: Pick<World, 'originX' | 'originZ' | 'columns' | 'rows' | 'spacing'>, count: number,
    bounds: (item: number, out: Float64Array) => void, pitch: number = BUCKET_METRES) {
    this.pitch = pitch;
    this.originX = world.originX;
    this.originZ = world.originZ;
    this.columns = Math.max(1, Math.ceil(((world.columns - 1) * world.spacing) / pitch) + 1);
    this.rows = Math.max(1, Math.ceil(((world.rows - 1) * world.spacing) / pitch) + 1);
    const cells = this.columns * this.rows;
    const box = new Float64Array(4);
    const starts = new Int32Array(cells + 1);
    const span = (item: number): [number, number, number, number] => {
      bounds(item, box);
      return [
        Math.max(0, Math.floor((box[0] - this.originX) / pitch)),
        Math.max(0, Math.floor((box[1] - this.originZ) / pitch)),
        Math.min(this.columns - 1, Math.floor((box[2] - this.originX) / pitch)),
        Math.min(this.rows - 1, Math.floor((box[3] - this.originZ) / pitch)),
      ];
    };
    for (let item = 0; item < count; item += 1) {
      const [c0, r0, c1, r1] = span(item);
      for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) starts[r * this.columns + c + 1] += 1;
    }
    for (let cell = 0; cell < cells; cell += 1) starts[cell + 1] += starts[cell];
    const items = new Int32Array(starts[cells]);
    const cursor = starts.slice(0, cells);
    for (let item = 0; item < count; item += 1) {
      const [c0, r0, c1, r1] = span(item);
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) items[cursor[r * this.columns + c]++] = item;
      }
    }
    this.starts = starts;
    this.items = items;
  }

  /** The bucket under a point, or −1 off the grid. */
  cell(x: number, z: number): number {
    const c = Math.floor((x - this.originX) / this.pitch), r = Math.floor((z - this.originZ) / this.pitch);
    return c < 0 || r < 0 || c >= this.columns || r >= this.rows ? -1 : r * this.columns + c;
  }

  /**
   * Visit every item of every bucket the square x ± reach, z ± reach touches
   * (clamped to the grid, as the items were), until `visit` returns true.
   * Point items sit in one bucket each, so none is visited twice.
   */
  some(x: number, z: number, reach: number, visit: (item: number) => boolean): boolean {
    const c0 = Math.max(0, Math.floor((x - reach - this.originX) / this.pitch));
    const c1 = Math.min(this.columns - 1, Math.floor((x + reach - this.originX) / this.pitch));
    const r0 = Math.max(0, Math.floor((z - reach - this.originZ) / this.pitch));
    const r1 = Math.min(this.rows - 1, Math.floor((z + reach - this.originZ) / this.pitch));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const cell = r * this.columns + c;
        for (let slot = this.starts[cell]; slot < this.starts[cell + 1]; slot += 1) {
          if (visit(this.items[slot])) return true;
        }
      }
    }
    return false;
  }
}

/**
 * The sightline rule (critic repair, 2026-10-10; the constants are
 * `LAUNCH_PAD.sight*`). A pad nobody can see from a road is a pad nobody
 * finds: a road in a cutting or a ravine hides the lawn beyond its banks, and
 * a path fenced on the lawn's side cannot be left there. So a site counts only
 * if, from at least `sightMinimumSightings` samples of the ridden lines (every
 * `plan.segments` centreline; each sample counts once per direction of
 * travel), a chase-camera point within `sightRoadMetres` sees the centre
 * through the camera's own occlusion ray with no solid across it either, the
 * pad within `sightConeRadians` of travel, **and** the wheel can ride straight
 * from that sample to the centre. (The critic's instrument also accepts an
 * apron-rim point; the finder asks more, see `clear`.)
 *
 * The wheel line mirrors the controller's two refusals: a rise between steps
 * over the step-up (`WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor`, the
 * `defaultEucTuning` derivation — a fence or wall top reads as ground), and a
 * pedal-wide `raycastObstacle` at step-up height across each step (a post).
 * The corpus test rides that line through the shipped controller.
 */
class Sightlines {
  private readonly sampler: PlanTerrainSampler;
  private readonly lines: readonly LaunchPadLine[];
  /** Flattened samples: line index, sample index, position and heading. */
  private readonly line: Int32Array;
  private readonly index: Int32Array;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  private readonly headings: Float64Array;
  /** The ridden surface's height at each sample, read on first use (NaN until then). */
  private readonly grounds: Float64Array;
  private readonly buckets: Buckets;
  private readonly ground = createGroundSample();
  private readonly stepUp = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
  private readonly pedalHalfSpan = WHEEL.pedalSpan / 2;
  private readonly coneCos = Math.cos(LAUNCH_PAD.sightConeRadians);

  constructor(plan: LevelPlan, sampler: PlanTerrainSampler, lines: readonly LaunchPadLine[]) {
    this.sampler = sampler;
    this.lines = lines;
    let count = 0;
    for (const line of lines) count += line.x.length;
    this.line = new Int32Array(count);
    this.index = new Int32Array(count);
    this.xs = new Float64Array(count);
    this.zs = new Float64Array(count);
    this.headings = new Float64Array(count);
    this.grounds = new Float64Array(count).fill(Number.NaN);
    let at = 0;
    lines.forEach((line, l) => {
      for (let k = 0; k < line.x.length; k += 1, at += 1) {
        this.line[at] = l; this.index[at] = k;
        this.xs[at] = line.x[k]; this.zs[at] = line.z[k]; this.headings[at] = line.heading[k];
      }
    });
    this.buckets = new Buckets(plan.heightfield, count, (i, out) => {
      out[0] = this.xs[i]; out[1] = this.zs[i]; out[2] = this.xs[i]; out[3] = this.zs[i];
    }, CAPSULE_BUCKET_METRES);
  }

  /**
   * Whether (x, z) has at least `sightMinimumSightings` sightings; with
   * `all`, every sighting is collected (and the answer is the same count test).
   */
  seen(x: number, z: number, all?: LaunchPadSighting[]): boolean {
    const targetY = this.sampler.sampleGround(x, z, this.ground).height + LAUNCH_PAD.sightTargetLiftMetres;
    const back = LAUNCH_PAD.sightCameraBackMetres;
    const range = LAUNCH_PAD.sightRoadMetres;
    // A camera within range sits within range + back of its sample.
    const reach = range + back;
    let count = 0;
    this.buckets.some(x, z, reach, (i) => {
      const sx = this.xs[i], sz = this.zs[i];
      if ((sx - x) * (sx - x) + (sz - z) * (sz - z) > reach * reach) return false;
      let ground = this.grounds[i];
      if (Number.isNaN(ground)) ground = this.grounds[i] = this.sampler.sampleGround(sx, sz, this.ground).height;
      let access: boolean | undefined;
      for (const reverse of [false, true]) {
        const heading = reverse ? this.headings[i] + Math.PI : this.headings[i];
        const fx = Math.sin(heading), fz = Math.cos(heading);
        const camera = { x: sx - fx * back, y: ground + LAUNCH_PAD.sightCameraHeightMetres, z: sz - fz * back };
        const dx = x - camera.x, dz = z - camera.z, dy = targetY - camera.y;
        const flat = Math.hypot(dx, dz), distance = Math.hypot(dx, dy, dz);
        if (distance > range) continue;
        const along = dx * fx + dz * fz;
        if (!(along > 0) || along < flat * this.coneCos) continue;
        if (!this.clear(camera, x, targetY, z)) continue;
        access ??= this.reachable(sx, sz, ground, x, z);
        if (!access) return false;
        count += 1;
        all?.push({ segmentId: this.lines[this.line[i]].segmentId, x: sx, z: sz,
          headingY: wrapAngle(heading), camera, distance });
        if (all === undefined && count >= LAUNCH_PAD.sightMinimumSightings) return true;
      }
      return false;
    });
    return count >= LAUNCH_PAD.sightMinimumSightings;
  }

  /**
   * The camera's occlusion ray reaches the centre, and no solid crosses it
   * either (`raycastObstacle`: a tree trunk is a non-occluding solid the
   * camera ray ignores, but it hides a pad behind it all the same). Only the
   * centre: a sighting by an apron-rim point alone is the far edge of the pad
   * showing over a bank crest — the critic's instrument counts it, a rider
   * does not see a pad there (`euc` pad-252-111 from `park-gate@6`, 59 m).
   */
  private clear(camera: { x: number; y: number; z: number }, x: number, y: number, z: number): boolean {
    const tx = x - camera.x, ty = y - camera.y, tz = z - camera.z;
    const length = Math.hypot(tx, ty, tz);
    const direction = { x: tx / length, y: ty / length, z: tz / length };
    const reach = length - LAUNCH_PAD.sightHitToleranceMetres;
    const hit = this.sampler.raycast(camera, direction, length);
    if (hit !== null && hit < reach) return false;
    const solid = this.sampler.raycastObstacle(camera, direction, length);
    return solid === null || solid >= reach;
  }

  /** The straight wheel line from the sample to the centre: no rise over the step-up, no solid across the pedals. */
  private reachable(sx: number, sz: number, startGround: number, x: number, z: number): boolean {
    const length = Math.hypot(x - sx, z - sz);
    const steps = Math.max(1, Math.ceil(length / LAUNCH_PAD.sightAccessStepMetres));
    const origin = { x: sx, y: 0, z: sz }, direction = { x: (x - sx) / steps, y: 0, z: (z - sz) / steps };
    const stride = length / steps;
    let previous = startGround;
    for (let k = 1; k <= steps; k += 1) {
      origin.x = sx + ((x - sx) * (k - 1)) / steps;
      origin.z = sz + ((z - sz) * (k - 1)) / steps;
      origin.y = previous + this.stepUp + 1e-6;
      if (this.sampler.raycastObstacle(origin, direction, stride, this.pedalHalfSpan) !== null) return false;
      const next = this.sampler.sampleGround(sx + ((x - sx) * k) / steps, sz + ((z - sz) * k) / steps, this.ground).height;
      if (next - previous > this.stepUp) return false;
      previous = next;
    }
    return true;
  }
}

class Validator {
  private readonly world: World;
  /** 0 unknown, 1 valid, 2 refused. */
  private readonly verdicts: Uint8Array;
  private readonly districts = new Map<number, string>();
  private sampler: PlanTerrainSampler | undefined;
  private readonly ground = createGroundSample();
  private decor: { xs: Float64Array; zs: Float64Array; buckets: Buckets } | undefined;
  private capsules: { data: Float64Array; buckets: Buckets } | undefined;
  private paths: { xs: Float64Array; zs: Float64Array; district: string[]; buckets: Buckets } | undefined;
  private lines: LaunchPadLine[] | undefined;
  private sight: Sightlines | undefined;

  constructor(world: World) {
    this.world = world;
    this.verdicts = new Uint8Array(world.latticeColumns * world.latticeRows);
  }

  position(index: number): { x: number; z: number; column: number; row: number } {
    const { latticeColumns, step, spacing, originX, originZ } = this.world;
    const column = (index % latticeColumns) * step, row = Math.floor(index / latticeColumns) * step;
    return { x: originX + column * spacing, z: originZ + row * spacing, column, row };
  }

  valid(index: number): boolean {
    const known = this.verdicts[index];
    if (known !== 0) return known === 1;
    const ok = this.check(index);
    this.verdicts[index] = ok ? 1 : 2;
    return ok;
  }

  private check(index: number): boolean {
    const { x, z, column, row } = this.position(index);
    // The sightline last: it casts rays, the rest read arrays.
    return this.clearOfDecor(x, z) && this.clearOfLines(x, z) && this.flat(column, row)
      && this.grassUnderfoot(x, z) && this.seenFromRoad(x, z);
  }

  /** Seen from a ridden line and reachable from where it was seen (`Sightlines`). */
  private seenFromRoad(x: number, z: number): boolean {
    const sampler = this.sampler ??= new PlanTerrainSampler(this.world.plan);
    const sight = this.sight ??= new Sightlines(this.world.plan, sampler, this.lineSamples());
    return sight.seen(x, z);
  }

  /**
   * ≥ apron + margin from every prop position (the render-only ones are the
   * rule; a solid one is already a clear radius away).
   *
   * **The four dressed site lists** (`parkCaseSites`, `residentialSites`,
   * `environmentSites`, `streetFronts`) are not re-derived here: each entry
   * stands at the face of, or inside, a building whose body is a solid in
   * `plan.solids` (each list requires that protecting solid), and every site
   * is already the clear radius (22.4 m) from every solid — so it is far
   * beyond 4 m from every entry. Re-deriving them cost ~10 ms of the boot
   * path for a rule that cannot bite; the finder's test derives all four over
   * the whole corpus and asserts the 4 m clearance, so a future list that
   * dresses open lawn fails there rather than slipping through.
   */
  private clearOfDecor(x: number, z: number): boolean {
    const decor = this.decor ??= this.buildDecor();
    const limit = launchPadDecorClearance();
    const cell = decor.buckets.cell(x, z);
    if (cell < 0) return true;
    const { starts, items } = decor.buckets;
    for (let slot = starts[cell]; slot < starts[cell + 1]; slot += 1) {
      const item = items[slot], dx = decor.xs[item] - x, dz = decor.zs[item] - z;
      if (dx * dx + dz * dz < limit * limit) return false;
    }
    return true;
  }

  private buildDecor(): { xs: Float64Array; zs: Float64Array; buckets: Buckets } {
    const props = this.world.plan.props ?? [];
    const xs = Float64Array.from(props, (prop) => prop.position.x);
    const zs = Float64Array.from(props, (prop) => prop.position.z);
    const reach = launchPadDecorClearance();
    const buckets = new Buckets(this.world, xs.length, (i, out) => {
      out[0] = xs[i] - reach; out[1] = zs[i] - reach; out[2] = xs[i] + reach; out[3] = zs[i] + reach;
    });
    return { xs, zs, buckets };
  }

  /** Outside every corner-cut capsule and every missed-corner ray. */
  private clearOfLines(x: number, z: number): boolean {
    const capsules = this.capsules ??= this.buildCapsules();
    const data = capsules.data;
    const cell = capsules.buckets.cell(x, z);
    if (cell < 0) return true;
    const { starts, items } = capsules.buckets;
    for (let slot = starts[cell]; slot < starts[cell + 1]; slot += 1) {
      const at = items[slot] * 5, r = data[at + 4];
      if (segmentDistanceSquared(x, z, data[at], data[at + 1], data[at + 2], data[at + 3]) < r * r) return false;
    }
    return true;
  }

  private buildCapsules(): { data: Float64Array; buckets: Buckets } {
    const cut: number[] = [];
    buildLineCapsules(this.lineSamples(), cut, cut, CHORD_SKIP_METRES);
    buildRouteBand(this.world.spine, cut);
    const data = Float64Array.from(cut);
    const buckets = new Buckets(this.world, data.length / 5, (item, out) => {
      const at = item * 5, r = data[at + 4];
      out[0] = Math.min(data[at], data[at + 2]) - r; out[1] = Math.min(data[at + 1], data[at + 3]) - r;
      out[2] = Math.max(data[at], data[at + 2]) + r; out[3] = Math.max(data[at + 1], data[at + 3]) + r;
    }, CAPSULE_BUCKET_METRES);
    return { data, buckets };
  }

  private lineSamples(): LaunchPadLine[] {
    return this.lines ??= sampleLines(this.world.plan);
  }

  /**
   * The footprint within 8 cm and the clear disc within 0.6 m. Reads the
   * heightfield's own samples: every vertex inside the footprint, and every
   * lattice point inside the clear disc. (The drop a flight meets is
   * `reachableLowest`, measured only for the picks.)
   */
  private flat(column: number, row: number): boolean {
    const { columns, spacing, step } = this.world;
    const heights = this.world.plan.heightfield.heights;
    const centre = heights[row * columns + column];
    const footprint = Math.floor(LAUNCH_PAD.footprintRadiusMetres / spacing);
    const footprintLimit = (LAUNCH_PAD.footprintRadiusMetres / spacing) ** 2;
    let low = centre, high = centre;
    for (let dr = -footprint; dr <= footprint; dr += 1) {
      for (let dc = -footprint; dc <= footprint; dc += 1) {
        if (dc * dc + dr * dr > footprintLimit) continue;
        const h = heights[(row + dr) * columns + column + dc];
        if (h < low) low = h;
        if (h > high) high = h;
      }
    }
    if (high - low > LAUNCH_PAD.footprintFlatnessMetres) return false;
    const clear = launchPadClearRadius();
    const reach = Math.floor(clear / LAUNCH_PAD.siteLatticeMetres);
    const limit = (clear / LAUNCH_PAD.siteLatticeMetres) ** 2;
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        if (dc * dc + dr * dr > limit) continue;
        const h = heights[(row + dr * step) * columns + column + dc * step];
        if (h < low) low = h;
        if (h > high) high = h;
      }
    }
    return high - low <= LAUNCH_PAD.clearFlatnessMetres;
  }

  /** The ridden surface (the sampler sees ground patches too) is grass within footprint + margin. */
  private grassUnderfoot(x: number, z: number): boolean {
    const sampler = this.sampler ??= new PlanTerrainSampler(this.world.plan);
    const spacing = this.world.spacing;
    const radius = LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.grassCheckMarginMetres;
    const reach = Math.floor(radius / spacing);
    const limit = (radius / spacing) ** 2;
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        if (dc * dc + dr * dr > limit) continue;
        if (sampler.sampleGround(x + dc * spacing, z + dr * spacing, this.ground).surface !== 'grass') return false;
      }
    }
    return true;
  }

  /** The nearest population path's district, else the nearest segment's id stem. */
  district(index: number): string {
    const known = this.districts.get(index);
    if (known !== undefined) return known;
    const { x, z } = this.position(index);
    const paths = this.paths ??= this.buildPaths();
    let best = Infinity, district: string | undefined;
    // Rings of buckets outward until a ring can no longer hold anything nearer.
    for (let ring = 0; ring < 1_000; ring += 1) {
      if (district !== undefined && (ring - 1) * BUCKET_METRES > Math.sqrt(best)) break;
      if (paths.xs.length === 0) break;
      for (let dr = -ring; dr <= ring; dr += 1) {
        for (let dc = -ring; dc <= ring; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const cell = paths.buckets.cell(x + dc * BUCKET_METRES, z + dr * BUCKET_METRES);
          if (cell < 0) continue;
          for (let slot = paths.buckets.starts[cell]; slot < paths.buckets.starts[cell + 1]; slot += 1) {
            const item = paths.buckets.items[slot];
            const dx = paths.xs[item] - x, dz = paths.zs[item] - z, d = dx * dx + dz * dz;
            if (d < best || (d === best && district !== undefined && paths.district[item] < district)) {
              best = d;
              district = paths.district[item];
            }
          }
        }
      }
    }
    const answer = district ?? this.segmentStem(x, z);
    this.districts.set(index, answer);
    return answer;
  }

  private buildPaths(): { xs: Float64Array; zs: Float64Array; district: string[]; buckets: Buckets } {
    const x: number[] = [], z: number[] = [], district: string[] = [];
    for (const path of this.world.population.paths) {
      for (const point of path.points) { x.push(point.x); z.push(point.z); district.push(path.district); }
    }
    const xs = Float64Array.from(x), zs = Float64Array.from(z);
    const buckets = new Buckets(this.world, xs.length, (i, out) => {
      out[0] = xs[i]; out[1] = zs[i]; out[2] = xs[i]; out[3] = zs[i];
    });
    return { xs, zs, district, buckets };
  }

  private segmentStem(x: number, z: number): string {
    let best = Infinity, stem = 'town';
    for (const line of this.lineSamples()) {
      for (let k = 0; k < line.x.length; k += 1) {
        const dx = line.x[k] - x, dz = line.z[k] - z, d = dx * dx + dz * dz;
        if (d < best) { best = d; stem = line.segmentId.split('@')[0].split('-').slice(0, 2).join('-'); }
      }
    }
    return stem;
  }

  /** The finished site: ground height, yaw toward the nearest road, and the reachable disc's drop. */
  site(index: number): LaunchPadSite {
    const { x, z, column, row } = this.position(index);
    const lattice = this.world.latticeColumns;
    const sampler = this.sampler ??= new PlanTerrainSampler(this.world.plan);
    const y = sampler.sampleGround(x, z, this.ground).height;
    return {
      id: `pad-${index % lattice}-${Math.floor(index / lattice)}`,
      x, y, z,
      yaw: this.roadYaw(column, row),
      triggerRadius: LAUNCH_PAD.triggerRadiusMetres,
      footprintRadius: LAUNCH_PAD.footprintRadiusMetres,
      dropMetres: Math.max(0, y - this.reachableLowest(x, z, column, row) + LAUNCH_PAD.dropSampleMarginMetres),
    };
  }

  /**
   * The lowest ground a pad flight can reach: within the flight cap plus the
   * trigger (21.4 m, derived) of the centre — a takeoff inside the trigger
   * covers at most the cap. Ground beyond it (an embankment at the clear
   * disc's rim) no flight meets, so it never lowers the lift.
   *
   * The ridden ground there is the triangulated heightfield alone (every
   * collider is a clear radius away, and a collider only ever raises it), so
   * its lowest point in the disc is a vertex inside it or a point on its rim:
   * every vertex inside is read, and the rim is sampled every
   * `RIM_SAMPLE_METRES` through the shipped sampler.
   */
  private reachableLowest(x: number, z: number, column: number, row: number): number {
    const { columns, spacing } = this.world;
    const heights = this.world.plan.heightfield.heights;
    const radius = launchPadReachRadius();
    const reach = Math.floor(radius / spacing);
    const limit = (radius / spacing) ** 2;
    let low = Infinity;
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        if (dc * dc + dr * dr > limit) continue;
        const h = heights[(row + dr) * columns + column + dc];
        if (h < low) low = h;
      }
    }
    const sampler = this.sampler ??= new PlanTerrainSampler(this.world.plan);
    const count = Math.ceil((2 * Math.PI * radius) / RIM_SAMPLE_METRES);
    for (let k = 0; k < count; k += 1) {
      const angle = (2 * Math.PI * k) / count;
      const h = sampler.sampleGround(x + radius * Math.sin(angle), z + radius * Math.cos(angle), this.ground).height;
      if (h < low) low = h;
    }
    return low;
  }

  /**
   * The heading from the centre to the nearest non-grass cell, quantised to
   * π/8: the view turns a flat face of the octagon toward it.
   */
  private roadYaw(column: number, row: number): number {
    const { columns, rows } = this.world;
    const surfaces = this.world.plan.heightfield.surfaces;
    const cells = columns - 1;
    const reach = Math.ceil(LAUNCH_PAD.roadReachMetres / this.world.spacing) + 1;
    let best = Infinity, bx = 0, bz = 1;
    for (let dr = -reach; dr < reach; dr += 1) {
      const r = row + dr;
      if (r < 0 || r >= rows - 1) continue;
      for (let dc = -reach; dc < reach; dc += 1) {
        const c = column + dc;
        if (c < 0 || c >= cells || surfaces[r * cells + c] === 'grass') continue;
        // The cell's centre, half a cell beyond its lower-left vertex.
        const ox = dc + 0.5, oz = dr + 0.5, d = ox * ox + oz * oz;
        if (d < best) { best = d; bx = ox; bz = oz; }
      }
    }
    const eighth = Math.PI / 8;
    const yaw = Math.round(Math.atan2(bx, bz) / eighth) * eighth;
    return yaw > Math.PI - 1e-12 ? yaw - 2 * Math.PI : yaw;
  }
}
