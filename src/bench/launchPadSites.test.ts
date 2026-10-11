/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD } from '../data/tuning.ts';
import { PROP_SOLIDS } from '../data/props.ts';
import { preparePopulationWorld, type PreparedPopulationWorld } from '../app/populationWorld.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { parkCaseSites, residentialSites } from '../level/districtSites.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { streetFronts } from '../level/streetFronts.ts';
import {
  cityLaunchPads, launchPadCandidates, launchPadClearRadius, launchPadDecorClearance, launchPadLineCapsules,
  launchPadReachRadius, launchPadSightings, type LaunchPadSite,
} from '../level/launchPadSites.ts';
import { planDigest } from '../level/planDigest.ts';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { RouteSpine, createSpineSample } from '../simulation/routeSpine.ts';
import { createGroundSample } from '../simulation/world.ts';
import { CHASE_CORPUS } from './chaseBench.ts';
import { runPadTrial } from './launchPadBench.ts';
import { LAUNCH_PAD_ROLL_RADIUS } from '../simulation/launchPadField.ts';

/**
 * M42 — the launch-pad finder over the **prepared** corpus (`docs/PLANS.md`
 * §42.2b, §42.5). Lives in `src/bench/` because preparing a world is
 * `app/populationWorld.ts`, which `src/architecture.test.ts` forbids every
 * file under `level/` to import (tests included); the level-side unit checks
 * are `src/level/launchPadSites.test.ts`.
 *
 * Every rule is re-checked here by brute force, independently of the
 * finder's distance fields and buckets. Prints (never asserts) the finder
 * time and each seed's site list, including the seeds the existing free-ride
 * browser specs boot, for the coordinator's spec selection.
 */

/** The finder corpus: CHASE_CORPUS, four more towns and one `?mph=50` build. */
const CORPUS: readonly { label: string; seed: string; mph?: number }[] = [
  ...CHASE_CORPUS.map((seed) => ({ label: seed, seed })),
  { label: 'jetty-orchard-74', seed: 'jetty-orchard-74' },
  { label: 'copper-gate-55', seed: 'copper-gate-55' },
  { label: 'x67', seed: 'x67' },
  { label: 'lantern-span-7', seed: 'lantern-span-7' },
  { label: 'euc@50mph', seed: 'euc', mph: 50 },
];
/** Free-ride browser specs boot these besides the corpus: print their pads too. */
const SPEC_SEEDS = ['euc-thrills', 'corner', 'copper-yard-78'] as const;

type Prepared = PreparedPopulationWorld;

const worlds = new Map<string, Prepared>();
function prepared(seed: string, mph?: number): Prepared {
  const key = `${seed}@${mph ?? ''}`;
  let found = worlds.get(key);
  if (found === undefined) {
    found = preparePopulationWorld(generateLevel(seed, undefined, undefined, mph).plan);
    worlds.set(key, found);
  }
  return found;
}

const results = new Map<string, { sites: readonly LaunchPadSite[]; ms: number }>();
function sitesFor(label: string, seed: string, mph?: number): { sites: readonly LaunchPadSite[]; ms: number } {
  let found = results.get(label);
  if (found === undefined) {
    const world = prepared(seed, mph);
    const start = performance.now();
    const sites = cityLaunchPads(world.level, world.population);
    found = { sites, ms: performance.now() - start };
    results.set(label, found);
  }
  return found;
}

function boxDistance(box: { centre: { x: number; z: number }; halfExtents: { x: number; z: number } },
  yaw: number, x: number, z: number): number {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const dx = x - box.centre.x, dz = z - box.centre.z;
  const ex = Math.max(Math.abs(cos * dx - sin * dz) - box.halfExtents.x, 0);
  const ez = Math.max(Math.abs(sin * dx + cos * dz) - box.halfExtents.z, 0);
  return Math.hypot(ex, ez);
}

function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  const t = length > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / length)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function polygonDistance(polygon: readonly { x: number; z: number }[], x: number, z: number): number {
  let inside = false, best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    best = Math.min(best, segmentDistance(x, z, b.x, b.z, a.x, a.z));
  }
  return inside ? 0 : best;
}

/** Distance from a point to the nearest non-grass heightfield cell (the cell's square). */
function roadDistance(plan: LevelPlan, x: number, z: number, reach: number): number {
  const field = plan.heightfield, cells = field.columns - 1, s = field.spacing;
  const c0 = Math.max(0, Math.floor((x - reach - field.originX) / s));
  const c1 = Math.min(cells - 1, Math.floor((x + reach - field.originX) / s));
  const r0 = Math.max(0, Math.floor((z - reach - field.originZ) / s));
  const r1 = Math.min(field.rows - 2, Math.floor((z + reach - field.originZ) / s));
  let best = Infinity;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (field.surfaces[r * cells + c] === 'grass') continue;
      const minX = field.originX + c * s, minZ = field.originZ + r * s;
      const dx = Math.max(minX - x, 0, x - (minX + s)), dz = Math.max(minZ - z, 0, z - (minZ + s));
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best;
}

/**
 * The drop a flight can meet, by brute force: the shipped sampler on a 0.25 m
 * grid inside the reachable disc (flight cap + trigger) and every 0.02 m along
 * its rim — independent of the finder's vertex-and-rim reading.
 */
function denseReachableLow(sampler: PlanTerrainSampler, x: number, z: number): number {
  const radius = launchPadReachRadius(), ground = createGroundSample();
  let low = Infinity;
  for (let dz = -radius; dz <= radius; dz += 0.25) {
    for (let dx = -radius; dx <= radius; dx += 0.25) {
      if (dx * dx + dz * dz > radius * radius) continue;
      low = Math.min(low, sampler.sampleGround(x + dx, z + dz, ground).height);
    }
  }
  const count = Math.ceil((2 * Math.PI * radius) / 0.02);
  for (let k = 0; k < count; k += 1) {
    const angle = (2 * Math.PI * k) / count;
    low = Math.min(low, sampler.sampleGround(x + radius * Math.sin(angle), z + radius * Math.cos(angle), ground).height);
  }
  return low;
}

/**
 * A sound floor for the ground the reachable disc can hold: the lowest
 * heightfield vertex of any cell that touches it (the triangulated field never
 * dips below its vertices, and no collider stands within the clear radius).
 */
function vertexFloor(plan: LevelPlan, x: number, z: number): number {
  const field = plan.heightfield, reach = launchPadReachRadius() + field.spacing * Math.SQRT2;
  const c0 = Math.floor((x - reach - field.originX) / field.spacing), c1 = Math.ceil((x + reach - field.originX) / field.spacing);
  const r0 = Math.floor((z - reach - field.originZ) / field.spacing), r1 = Math.ceil((z + reach - field.originZ) / field.spacing);
  let low = Infinity;
  for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) {
    const vx = field.originX + c * field.spacing - x, vz = field.originZ + r * field.spacing - z;
    if (vx * vx + vz * vz > reach * reach) continue;
    low = Math.min(low, field.heights[r * field.columns + c]);
  }
  return low;
}

/** What each site's drop was under round 1's rule (the 2 m lattice of the whole 22.4 m disc), for the report. */
const dropChanges: string[] = [];

/** Every rule of §42.2b, checked by brute force; returns the measured margins. */
function checkRules(label: string, plan: LevelPlan, world: Prepared, sites: readonly LaunchPadSite[]): string[] {
  const failures: string[] = [];
  const fail = (site: LaunchPadSite, what: string): void => { failures.push(`${label} ${site.id}: ${what}`); };
  const clear = launchPadClearRadius();
  const decor = launchPadDecorClearance();
  const sampler = new PlanTerrainSampler(plan);
  const ground = createGroundSample();
  const capsules = launchPadLineCapsules(plan);
  const boxes: { box: BoxCollider; yaw: number; what: string }[] = [
    ...plan.segments.flatMap((segment) => segment.colliders.map((box) => ({ box, yaw: box.rotationY, what: 'collider' }))),
    ...(plan.solids ?? []).map((box) => ({ box, yaw: box.rotationY, what: 'solid' })),
    ...(plan.softBodies ?? []).map((box) => ({ box, yaw: box.rotationY, what: 'soft body' })),
  ];
  const lists = [
    ...parkCaseSites(plan), ...residentialSites(plan), ...environmentSites(plan), ...streetFronts(plan),
  ].map((entry) => entry.position);
  for (const site of sites) {
    const { x, z } = site;
    // Lattice and identity.
    const ix = (x - plan.heightfield.originX) / LAUNCH_PAD.siteLatticeMetres;
    const iz = (z - plan.heightfield.originZ) / LAUNCH_PAD.siteLatticeMetres;
    if (!Number.isInteger(ix) || !Number.isInteger(iz) || site.id !== `pad-${ix}-${iz}`) fail(site, 'not on the lattice');
    // Corridor gap and findability.
    const road = roadDistance(plan, x, z, LAUNCH_PAD.roadReachMetres + 2);
    if (road < LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.corridorGapMetres) fail(site, `${road.toFixed(2)} m from the road`);
    if (road > LAUNCH_PAD.roadReachMetres) fail(site, `${road.toFixed(2)} m from the road (not findable)`);
    // Grass underfoot at every lattice point within footprint + margin.
    const grassReach = LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.grassCheckMarginMetres;
    for (let dz = -grassReach; dz <= grassReach; dz += LAUNCH_PAD.siteLatticeMetres / 2) {
      for (let dx = -grassReach; dx <= grassReach; dx += LAUNCH_PAD.siteLatticeMetres / 2) {
        if (Math.hypot(dx, dz) > grassReach) continue;
        if (sampler.sampleGround(x + dx, z + dz, ground).surface !== 'grass') fail(site, `not grass at ${dx},${dz}`);
      }
    }
    // The clear radius.
    for (const { box, yaw, what } of boxes) {
      const d = boxDistance(box, yaw, x, z);
      if (d < clear) fail(site, `${what} ${d.toFixed(2)} m away`);
    }
    for (const gate of plan.checkpoints) {
      const d = boxDistance(gate, gate.headingY, x, z);
      if (d < clear) fail(site, `checkpoint ${gate.id} ${d.toFixed(2)} m away`);
    }
    for (const prop of plan.props ?? []) {
      const d = Math.hypot(prop.position.x - x, prop.position.z - z);
      if (PROP_SOLIDS[prop.kind] !== null && d < clear) fail(site, `solid ${prop.kind} ${d.toFixed(2)} m away`);
      if (d < decor) fail(site, `${prop.kind} prop ${d.toFixed(2)} m away`);
    }
    for (const path of world.population.paths) {
      for (const point of path.points) {
        const d = Math.hypot(point.x - x, point.z - z) - path.clearanceRadiusMetres;
        if (d < clear) { fail(site, `path ${path.id} ${d.toFixed(2)} m away`); break; }
      }
    }
    for (const bay of plan.populationParkingBays ?? []) {
      const d = boxDistance({ centre: bay.position, halfExtents: { x: bay.halfWidthMetres, z: bay.halfLengthMetres } },
        bay.headingY, x, z);
      if (d < clear) fail(site, `parking bay ${bay.id} ${d.toFixed(2)} m away`);
      for (const frame of bay.approachFrames ?? []) {
        if (Math.hypot(frame.x - x, frame.z - z) - frame.halfWidthMetres < clear) fail(site, `bay driveway ${bay.id}`);
      }
    }
    for (const activity of plan.populationActivitySites ?? []) {
      for (const spot of activity.positions) {
        if (Math.hypot(spot.position.x - x, spot.position.z - z) < clear) fail(site, `activity site ${activity.id}`);
      }
      for (const frame of activity.approachFrames) {
        if (Math.hypot(frame.x - x, frame.z - z) - frame.halfWidthMetres < clear) fail(site, `activity approach ${activity.id}`);
      }
    }
    for (const source of plan.populationGroundSources ?? []) {
      for (const polygon of source.polygons) {
        const d = polygonDistance(polygon, x, z);
        if (d < clear) fail(site, `ground source ${source.id} ${d.toFixed(2)} m away`);
      }
    }
    // The four dressed site lists (implied by the clear radius; asserted here).
    for (const position of lists) {
      const d = Math.hypot(position.x - x, position.z - z);
      if (d < decor) fail(site, `dressed site ${d.toFixed(2)} m away`);
    }
    // Hazards and targets: never read by the finder, kept clear all the same.
    for (const hazard of plan.hazards ?? []) {
      if (Math.hypot(hazard.centre.x - x, hazard.centre.z - z) < clear) fail(site, `hazard ${hazard.id}`);
    }
    for (const target of plan.targets ?? []) {
      if (Math.hypot(target.centre.x - x, target.centre.z - z) < clear
        || Math.hypot(target.base.x - x, target.base.z - z) < clear) fail(site, `target ${target.id}`);
    }
    // The corner-cut capsules, the missed-corner rays and the through route's hazard-and-target band.
    for (const [kind, data] of [['corner-cut', capsules.cornerCut], ['missed-corner', capsules.missedCorner],
      ['through-route band', capsules.routeBand]] as const) {
      for (let at = 0; at < data.length; at += 5) {
        const d = segmentDistance(x, z, data[at], data[at + 1], data[at + 2], data[at + 3]);
        if (d < data[at + 4]) { fail(site, `inside a ${kind} capsule (${d.toFixed(2)} < ${data[at + 4].toFixed(2)})`); break; }
      }
    }
    // The spawn.
    if (Math.hypot(plan.spawn.position.x - x, plan.spawn.position.z - z) < LAUNCH_PAD.spawnClearMetres) fail(site, 'near the spawn');
    // Flatness, and the drop the flight cap reads.
    const centre = plan.heightfield;
    const heightAt = (px: number, pz: number): number => sampler.sampleGround(px, pz, ground).height;
    let low = Infinity, high = -Infinity;
    for (let dz = -2; dz <= 2; dz += 1) for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.hypot(dx, dz) > LAUNCH_PAD.footprintRadiusMetres) continue;
      const h = heightAt(x + dx * centre.spacing, z + dz * centre.spacing);
      low = Math.min(low, h); high = Math.max(high, h);
    }
    if (high - low > LAUNCH_PAD.footprintFlatnessMetres + 1e-9) fail(site, `footprint ${(high - low).toFixed(3)} m out of flat`);
    let discLow = Infinity, discHigh = -Infinity;
    const step = LAUNCH_PAD.siteLatticeMetres, reach = Math.floor(clear / step);
    for (let kz = -reach; kz <= reach; kz += 1) for (let kx = -reach; kx <= reach; kx += 1) {
      if (Math.hypot(kx * step, kz * step) > clear) continue;
      const h = heightAt(x + kx * step, z + kz * step);
      discLow = Math.min(discLow, h); discHigh = Math.max(discHigh, h);
    }
    if (discHigh - discLow > LAUNCH_PAD.clearFlatnessMetres + 1e-9) fail(site, `clear disc ${(discHigh - discLow).toFixed(3)} m out of flat`);
    if (Math.abs(site.y - heightAt(x, z)) > 1e-9) fail(site, 'y is not the ground');
    // The drop the flight cap reads: never below the dense brute-force drop of
    // the reachable disc, and never beyond what its cells' vertices allow.
    const dense = site.y - denseReachableLow(sampler, x, z);
    if (site.dropMetres < dense - 1e-9) fail(site, `drop ${site.dropMetres.toFixed(3)} understates the reachable ${dense.toFixed(3)}`);
    const ceiling = Math.max(0, site.y - vertexFloor(plan, x, z) + LAUNCH_PAD.dropSampleMarginMetres);
    if (site.dropMetres > ceiling + 1e-9) fail(site, `drop ${site.dropMetres.toFixed(3)} beyond its vertex ceiling ${ceiling.toFixed(3)}`);
    const before = Math.max(0, site.y - discLow + LAUNCH_PAD.dropSampleMarginMetres);
    if (Math.abs(before - site.dropMetres) > 0.005) {
      dropChanges.push(`${label} ${site.id} ${before.toFixed(2)}→${site.dropMetres.toFixed(2)} (dense ${Math.max(0, dense).toFixed(2)})`);
    }
  }
  // Spacing.
  for (let a = 0; a < sites.length; a += 1) {
    for (let b = a + 1; b < sites.length; b += 1) {
      const d = Math.hypot(sites[a].x - sites[b].x, sites[a].z - sites[b].z);
      if (d < LAUNCH_PAD.spacingMetres) failures.push(`${label} ${sites[a].id}/${sites[b].id} only ${d.toFixed(1)} m apart`);
    }
  }
  return failures;
}

/** Whether a point is in the spawn's forward cone. */
function inCone(plan: LevelPlan, x: number, z: number): boolean {
  const dx = x - plan.spawn.position.x, dz = z - plan.spawn.position.z, d = Math.hypot(dx, dz);
  const [near, far] = LAUNCH_PAD.spawnConeMetres;
  if (d < near || d > far) return false;
  const along = dx * Math.sin(plan.spawn.headingY) + dz * Math.cos(plan.spawn.headingY);
  return along > 0 && along / d >= Math.cos(LAUNCH_PAD.spawnConeRadians);
}

test('every corpus city gets 4–6 pads, every rule holds, and the inputs are untouched', () => {
  const failures: string[] = [];
  let townsWithCone = 0;
  for (const { label, seed, mph } of CORPUS) {
    const world = prepared(seed, mph);
    const plan = world.level;
    // Before the finder runs on this world (the memo is per plan object).
    const digest = planDigest(plan);
    const content = world.population.contentDigest;
    const { sites, ms } = sitesFor(label, seed, mph);
    assert.equal(planDigest(plan), digest, `${label}: the plan digest moved`);
    assert.equal(world.population.contentDigest, content, `${label}: the population digest moved`);
    assert.ok(sites.length >= LAUNCH_PAD.minimumPads && sites.length <= LAUNCH_PAD.maximumPads,
      `${label}: ${sites.length} pads (Ruling R1: fewer than 4 is a stop-and-report)`);
    failures.push(...checkRules(label, plan, world, sites));
    // The first pick is the best valid site in the forward cone whenever the
    // cone holds one: the candidates come back in the finder's own order, the
    // cone predicate is this file's.
    const cone = launchPadCandidates(plan, world.population, (x, z) => inCone(plan, x, z));
    if (cone.length > 0) {
      townsWithCone += 1;
      assert.deepEqual({ x: sites[0].x, z: sites[0].z }, cone[0], `${label}: ${cone.length} cone sites, not picked first`);
    } else {
      assert.ok(!sites.some((site) => inCone(plan, site.x, site.z)), `${label}: a pick in the cone the finder calls empty`);
    }
    console.log(`[launch pads] ${label}: ${sites.length} pads, finder ${ms.toFixed(1)} ms, valid cone sites ${cone.length}, `
      + `first in cone: ${inCone(plan, sites[0].x, sites[0].z)} — `
      + sites.map((s) => `${s.id}(${s.x},${s.z} drop ${s.dropMetres.toFixed(2)})`).join(' '));
  }
  console.log(`[launch pads] drops moved off the clear disc's rim: ${dropChanges.length} — ${dropChanges.join('; ')}`);
  assert.deepEqual(failures, []);
  // Not vacuous: the cone check above bit in at least one corpus town.
  assert.ok(townsWithCone >= 1, 'no corpus town has a valid cone site: the cone check proved nothing');
});

test('R16: nothing that walks, rides or drives can cross a dome — every population path, along its whole line, stays clear of every footprint', () => {
  // The dome is drawn and ridden by human seats only; people, CPU riders
  // (`fictionalEuc` on rider paths) and vehicles never see it, so none may
  // ever be drawn crossing it. They move only along `population.paths`
  // (stationary actors stand on them; a walker steps at most 1.4 m aside —
  // `SIDESTEP_OFFSETS_METRES` in `simulation/population.ts`; a knocked-down
  // person sits where struck). So the whole polyline — every segment, the
  // closing one of a loop, not only its points — keeps the path's own
  // clearance radius + a 3 m reaction allowance + the dome's reach from every
  // pad (critic r4: its foot's corners, beyond the footprint, and the wheel's roll).
  const REACTION_ALLOWANCE = 3;
  const DOME_REACH = Math.max(LAUNCH_PAD.footprintRadiusMetres, LAUNCH_PAD.domeFootRadiusMetres + LAUNCH_PAD_ROLL_RADIUS);
  let nearest = Infinity, nearestAt = '';
  const failures: string[] = [];
  for (const { label, seed, mph } of [...CORPUS, ...SPEC_SEEDS.map((s) => ({ label: s, seed: s, mph: undefined }))]) {
    const world = prepared(seed, mph);
    const { sites } = sitesFor(label, seed, mph);
    for (const site of sites) {
      for (const path of world.population.paths) {
        const points = path.points;
        const segments = path.closed ? points.length : points.length - 1;
        for (let index = 0; index < segments; index += 1) {
          const a = points[index], b = points[(index + 1) % points.length];
          const d = segmentDistance(site.x, site.z, a.x, a.z, b.x, b.z);
          const margin = d - path.clearanceRadiusMetres - REACTION_ALLOWANCE - DOME_REACH;
          if (d < nearest) { nearest = d; nearestAt = `${label} ${site.id} ↔ ${path.role} path ${path.id}`; }
          if (margin < 0) failures.push(`${label} ${site.id}: ${path.role} path ${path.id} passes ${d.toFixed(2)} m from the centre`);
        }
      }
      for (const anchor of world.population.anchors) {
        const d = Math.hypot(anchor.position.x - site.x, anchor.position.z - site.z);
        if (d < DOME_REACH + REACTION_ALLOWANCE) failures.push(`${label} ${site.id}: anchor ${anchor.id} at ${d.toFixed(2)} m`);
      }
    }
  }
  console.log(`[launch pads] R16: the nearest population line to any pad centre is ${nearest.toFixed(2)} m (${nearestAt}); `
    + `the dome reaches ${DOME_REACH.toFixed(2)} m (its foot's corners and the wheel's roll)`);
  assert.deepEqual(failures, []);
  assert.ok(Number.isFinite(nearest), 'paths were measured (not vacuous)');
});

test('two independent builds of a world find deep-equal sites', () => {
  // (Seed streams: the finder runs after `generateLevel`, never inside it, so
  // no generation report could show a draw it made. The real guard is the
  // source scan in `src/level/launchPadSites.test.ts`: no seed stream, random
  // source or clock in any pad module.)
  const first = sitesFor('euc', 'euc').sites;
  const again = preparePopulationWorld(generateLevel('euc').plan);
  assert.notEqual(again.level, prepared('euc').level, 'a second, separate preparation');
  assert.deepEqual(cityLaunchPads(again.level, again.population), first);
});

test('the free-ride spec seeds: print their pads (evidence for the coordinator, not asserted)', () => {
  for (const seed of ['route-41', ...SPEC_SEEDS]) {
    const { sites, ms } = sitesFor(seed, seed);
    console.log(`[launch pads] spec seed ${seed}: ${sites.length} pads, finder ${ms.toFixed(1)} ms — `
      + sites.map((s) => `${s.id}(${s.x},${s.z})`).join(' '));
    assert.ok(sites.length <= LAUNCH_PAD.maximumPads);
  }
});

// ---------------------------------------------------------------------------
// The sightline rule (critic repair, 2026-10-10; `critic-pads.md` item 1a)
// ---------------------------------------------------------------------------

/** One plan line sampled the critic's way: ≈ 2 m apart, entry to exit. */
interface CriticLine { readonly x: number[]; readonly z: number[]; readonly heading: number[] }

function criticLines(plan: LevelPlan): CriticLine[] {
  const sample = createSpineSample();
  return plan.segments.map((segment) => {
    const spine = RouteSpine.fromTraversal(plan, [{ id: segment.id, forward: true }]);
    const count = Math.max(2, Math.ceil(spine.length / 2)) + 1;
    const line: CriticLine = { x: [], z: [], heading: [] };
    for (let k = 0; k < count; k += 1) {
      spine.sample((spine.length * k) / (count - 1), sample);
      line.x.push(sample.x); line.z.push(sample.z); line.heading.push(sample.headingY);
    }
    return line;
  });
}

/**
 * The pads critic's line-of-sight instrument (its private browser sweep
 * spec), replicated in Node on the sampler the game's
 * `terrain` is (`new PlanTerrainSampler(levelPlan)`): every other ≈ 2 m sample
 * of every plan line, both ways; a camera point 2 m over the sample's ground
 * and 5 m back; in view within ±48°; seen when a ray to the centre or to one
 * of four rim points (±3.5 m in x or z) stops no more than 0.3 m short. Its
 * numbers are the critic's on purpose, not `LAUNCH_PAD`'s: an independent
 * instrument with its own sampling and a wider cone. On the pre-repair `euc`
 * pads it reads exactly the critic's sweep-los.json (p1 0, p3 0, p4 0 within
 * 60 m; checked by a private one-off probe, not shipped).
 */
function criticSeenWithin60(sampler: PlanTerrainSampler, lines: readonly CriticLine[], site: LaunchPadSite): number {
  const ground = createGroundSample(), half = (97 / 2) * Math.PI / 180, y = site.y + 0.05;
  let seen = 0;
  for (const line of lines) {
    for (let k = 0; k < line.x.length; k += 2) {
      if (Math.hypot(line.x[k] - site.x, line.z[k] - site.z) > 120) continue;
      for (const reverse of [false, true]) {
        const h = reverse ? line.heading[k] + Math.PI : line.heading[k];
        const camera = {
          x: line.x[k] - Math.sin(h) * 5, y: sampler.sampleGround(line.x[k], line.z[k], ground).height + 2,
          z: line.z[k] - Math.cos(h) * 5,
        };
        const dx = site.x - camera.x, dz = site.z - camera.z;
        if (Math.hypot(dx, y - camera.y, dz) > 60) continue;
        if (Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - h), Math.cos(Math.atan2(dx, dz) - h))) > half) continue;
        for (const [ox, oz] of [[0, 0], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]]) {
          const tx = site.x + ox - camera.x, ty = y - camera.y, tz = site.z + oz - camera.z, length = Math.hypot(tx, ty, tz);
          const hit = sampler.raycast(camera, { x: tx / length, y: ty / length, z: tz / length }, length);
          if (hit === null || hit >= length - 0.3) { seen += 1; break; }
        }
      }
    }
  }
  return seen;
}

test('every corpus pad is seen from a ridden line within 60 m, and the wheel rides straight to it from there', () => {
  const failures: string[] = [];
  for (const { label, seed, mph } of CORPUS) {
    const plan = prepared(seed, mph).level;
    const { sites } = sitesFor(label, seed, mph);
    const sampler = new PlanTerrainSampler(plan);
    const lines = criticLines(plan);
    const rows: string[] = [];
    for (const site of sites) {
      // The critic's own acceptance, on the critic's instrument.
      const critic = criticSeenWithin60(sampler, lines, site);
      if (critic === 0) failures.push(`${label} ${site.id}: the critic's sweep sees it from no road sample within 60 m`);
      // The finder's sightings, and a real ride from the nearest one: the
      // shipped controller, armed, straight from the road sample at 8 m/s.
      const sightings = launchPadSightings(plan, site.x, site.z);
      if (sightings.length < LAUNCH_PAD.sightMinimumSightings) {
        failures.push(`${label} ${site.id}: ${sightings.length} sightings by the finder's own rule`);
        if (sightings.length === 0) continue;
      }
      const nearest = sightings.reduce((best, s) => (s.distance < best.distance ? s : best));
      const dx = site.x - nearest.x, dz = site.z - nearest.z;
      const trial = runPadTrial({ label: site.id, pad: site, sampler: () => new PlanTerrainSampler(plan) },
        { headingY: Math.atan2(dx, dz), speed: 8, approachMetres: Math.hypot(dx, dz) });
      if (!trial.launched) failures.push(`${label} ${site.id}: a ride from ${nearest.segmentId} never reached the pad`);
      else if (trial.crashed) failures.push(`${label} ${site.id}: a ride from ${nearest.segmentId} crashed (${trial.tier})`);
      rows.push(`${site.id} critic ${critic}, finder ${sightings.length} (nearest ${nearest.distance.toFixed(1)} m from `
        + `${nearest.segmentId}, ride ${Math.hypot(dx, dz).toFixed(1)} m ${trial.launched ? 'launched' : 'NOT launched'})`);
    }
    console.log(`[launch pads] sightlines ${label}: ${rows.join('; ')}`);
  }
  assert.deepEqual(failures, []);
});

test('the sightline rule refuses exactly the euc sites the critic failed (cutting, ravine, fenced path) and keeps the rest', () => {
  // The six `euc` sites the finder placed before the repair, as the critic
  // listed them. p1 and p4 lie beyond the banks of `close-b@c`'s cutting, p3
  // beyond the `kicker-run@10` ravine, p5 behind `drain-run@1`'s rail fence
  // (seen only from that path, `drain-run@1` samples 6–9, and every wheel
  // line from them meets the rail's solid 6.5–7.5 m out); p0 and p2 the
  // critic saw from the road.
  const plan = prepared('euc').level;
  const before: readonly [string, number, number, boolean][] = [
    ['p0 pad-107-276', 175, 173, true], ['p1 pad-252-53', 465, -273, false], ['p2 pad-310-151', 581, -77, true],
    ['p3 pad-42-107', 45, -165, false], ['p4 pad-231-85', 423, -209, false], ['p5 pad-71-233', 103, 87, false],
  ];
  for (const [name, x, z, kept] of before) {
    const sightings = launchPadSightings(plan, x, z).length;
    assert.equal(sightings >= LAUNCH_PAD.sightMinimumSightings, kept,
      `${name}: ${kept ? 'kept' : 'refused'} by the critic, ${sightings} sightings`);
  }
  assert.ok(!sitesFor('euc', 'euc').sites.some((site) => before.some(([, x, z, kept]) => !kept && site.x === x && site.z === z)),
    'a refused site is still picked');
});
