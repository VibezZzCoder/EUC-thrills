/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CITY_DISTRICTS, CITY_ROUTE_FLOOR_METRES, dubins, threeArcs } from './cityRing.ts';
import { generateLevel, GENERATED_LEVEL_PREFIX } from './generateRoute.ts';
import { centrelineAt, querySegment } from './segments.ts';
import { LIBRARY_BEATS } from './segmentLibrary.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { EucController, createPose } from '../simulation/EucController.ts';
import { COP_WHEEL_TUNING, CpuRider } from '../simulation/cpuRider.ts';
import { RouteSpine } from '../simulation/routeSpine.ts';
import { StreetLoops } from '../simulation/streetLoops.ts';
import { EUC } from '../data/tuning.ts';

/**
 * M39 r6 — the town ring. The owner rejected an open-ended city (variety, but
 * a dead end) and then a closed one made of one block four times (connected,
 * but every environment gone). These pin the two halves of his ask together:
 * every accepted beat is on the ring, and the ring closes into the plaza.
 */
const CORPUS = ['euc', 'route-41', 'sweep-15', 'euc-7', 'harbour-spark-42', 'x67'] as const;
const towns = new Map(CORPUS.map((seed) => [seed, generateLevel(seed)]));
const town = towns.get('sweep-15')!;

test('every sampled town carries all ten accepted beats and both district blocks', () => {
  assert.equal(GENERATED_LEVEL_PREFIX, 'generated-r6-');
  for (const [seed, { plan, report, layout }] of towns) {
    assert.equal(report.usedFallback, false, seed);
    assert.ok(plan.id.startsWith(GENERATED_LEVEL_PREFIX), seed);
    for (const beat of LIBRARY_BEATS) assert.ok(report.beats.includes(beat.name), `${seed} lost ${beat.name}`);
    for (const district of CITY_DISTRICTS) assert.ok(report.beats.includes(`${district} block`), `${seed} lost the ${district} block`);
    assert.ok(report.requiredLength >= CITY_ROUTE_FLOOR_METRES, seed);
    // Several surfaces, which is what the r5 city had lost.
    const surfaces = new Set(layout.placed.map((segment) => segment.spec.surface));
    for (const surface of ['brick', 'pavement', 'roughPavement', 'dirt', 'gravel'] as const) {
      assert.ok(surfaces.has(surface), `${seed} has no ${surface}`);
    }
  }
});

test('the ring rides back into the plaza it left, at its height and heading', () => {
  for (const [seed, { plan, layout }] of towns) {
    const first = layout.placed.find((segment) => segment.spec.id === layout.throughIds[0])!.entry;
    const last = layout.placed.find((segment) => segment.spec.id === layout.throughIds[layout.throughIds.length - 1])!.exit;
    assert.ok(Math.hypot(last.position.x - first.position.x, last.position.z - first.position.z) < 0.05, `${seed} misses the plaza`);
    assert.ok(Math.abs(last.position.y - first.position.y) < 0.01, `${seed} arrives at the wrong height`);
    assert.ok(Math.abs(Math.sin(last.headingY - first.headingY)) < 1e-4, seed);
    assert.equal(plan.lap, undefined, 'a town is not a Track Day venue');
  }
});

test('the closing roads are exact: arc–straight–arc and arc–arc–arc land on their target', () => {
  const ride = (from: { x: number; z: number; h: number }, parts: readonly (readonly [number, number])[]) => {
    let pose = { ...from };
    for (const [curvature, length] of parts) {
      const end = centrelineAt({ position: { x: pose.x, y: 0, z: pose.z }, headingY: pose.h } as never,
        { id: 'x', length, curvature, halfWidth: 1, surface: 'pavement' }, length);
      pose = { x: end.x, z: end.z, h: pose.h + curvature * length };
    }
    return pose;
  };
  let checked = 0;
  for (let k = 0; k < 200; k += 1) {
    const from = { x: (k * 37) % 90, z: (k * 53) % 70, h: (k * 0.7) % 6.28 };
    const to = { x: (k * 11) % 80, z: (k * 29) % 90, h: (k * 1.3) % 6.28 };
    for (const path of dubins(from, to, 30)) {
      const end = ride(from, [[Math.sign(path.turns[0]) / 30, Math.abs(path.turns[0]) * 30], [0, path.straight],
        [Math.sign(path.turns[1]) / 30, Math.abs(path.turns[1]) * 30]]);
      assert.ok(Math.hypot(end.x - to.x, end.z - to.z) < 1e-6);
      checked += 1;
    }
    for (const turns of threeArcs(from, to, 30)) {
      const end = ride(from, turns.map((turn) => [Math.sign(turn) / 30, Math.abs(turn) * 30] as const));
      assert.ok(Math.hypot(end.x - to.x, end.z - to.z) < 1e-6);
      checked += 1;
    }
  }
  assert.ok(checked > 500);
});

test('every street loop names laid segments and runs between shared ends', () => {
  for (const [seed, { plan }] of towns) {
    const loops = plan.streetLoops ?? [];
    assert.ok(loops.length >= 7, `${seed}: ${loops.length} loops`);
    assert.ok(loops.some((loop) => loop.alternate.length === 0), `${seed} has no whole-town ring`);
    const ids = new Set(plan.segments.map((segment) => segment.id));
    for (const loop of loops) for (const id of [...loop.main, ...loop.alternate]) assert.ok(ids.has(id), `${seed}: ${id}`);
    // Building each one is what the chase does at install; a stale id throws.
    assert.doesNotThrow(() => new StreetLoops(plan));
  }
});

test('the cop can reach a rider on the opposite side of each district block', () => {
  const { plan, layout } = town;
  const spine = RouteSpine.fromPlan(plan)!;
  assert.ok(spine);
  for (const district of CITY_DISTRICTS) for (const reverse of [false, true]) {
    const main = layout.placed.find((s) => s.spec.id === `city-${district}-main-street`)!;
    const side = layout.placed.find((s) => s.spec.id === `city-${district}-side-street`)!;
    const start = centrelineAt(main.entry, main.spec, main.spec.length / 2);
    const target = centrelineAt(side.entry, side.spec, side.spec.length / 2);
    const sampler = new PlanTerrainSampler(plan);
    const controller = new EucController(sampler, {
      // The game's cop wheel (2026-09-22): his cutout edge is his own, not the player's.
      tuning: { ...COP_WHEEL_TUNING },
      spawn: { position: start, headingY: main.entry.headingY + (reverse ? Math.PI : 0) },
    });
    const brain = new CpuRider(spine, plan, sampler);
    const pose = createPose();
    let nearest = Infinity;
    let crashes = 0;
    let wasCrashed = false;
    for (let i = 0; i < 60 * 120; i++) {
      controller.writePose(pose);
      const view = { x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY, speed: pose.speed,
        grounded: pose.y - pose.groundY <= 1e-6, crashed: controller.crashed,
        curbAhead: controller.curbHeightAhead, lateralLimitG: EUC.maxLateralG };
      if (controller.crashed && !wasCrashed) crashes++;
      wasCrashed = controller.crashed;
      nearest = Math.min(nearest, Math.hypot(pose.x - target.x, pose.z - target.z));
      if (nearest < 8) break;
      controller.step(1 / 120, brain.step(1 / 120, view, { ...target, speed: 0 }));
    }
    assert.equal(crashes, 0, `${district} reversed=${reverse}: no respawn may substitute for riding around the block`);
    assert.ok(nearest < 8, `${district}: closest ${nearest.toFixed(1)} m`);
  }
});

test('a side street is legal chase ground, and the canonical road is not handed to the street aim', () => {
  const spine = RouteSpine.fromPlan(town.plan)!;
  const streets = new StreetLoops(town.plan);
  for (const district of CITY_DISTRICTS) {
    const side = town.layout.placed.find((s) => s.spec.id === `city-${district}-side-street`)!;
    const at = centrelineAt(side.entry, side.spec, side.spec.length / 2);
    const located = { distance: 0, offRoute: 0, halfWidth: 0 };
    spine.locate(at.x, at.z, -1, located);
    assert.ok(located.offRoute > 30, 'the old spine must expose the old false-straying condition');
    assert.ok(streets.offRoute(at.x, at.z, located.offRoute) < 1);
    assert.equal(streets.onAlternate(at.x, at.z, located.offRoute, located.halfWidth), true);
  }
  assert.equal(streets.offRoute(10000, 10000, 100), 100);
  // Two riders on the canonical road, short of the seam: the tuned brain
  // keeps them (its hazard and blocker caps are not given up to a loop).
  const road = town.layout.placed.find((s) => s.spec.id === town.layout.throughIds[4])!;
  const a = centrelineAt(road.entry, road.spec, 2);
  const b = centrelineAt(road.entry, road.spec, Math.min(road.spec.length, 30));
  assert.equal(streets.aim({ x: a.x, z: a.z, speed: 10 }, { x: b.x, z: b.z }, 20), null);
});

test('the cop rides the return climb home: its line runs on past the finish into the plaza', () => {
  // M39 r6 Codex QA: the spine stopped at the finish gate, ~100 m short of the
  // plaza, so a rider ahead on the return was a rider behind the cop and it
  // chose to turn round. Two pursuits: one wholly on the return, one across
  // the start/finish seam into the plaza.
  const { plan, layout } = towns.get('euc')!;
  const spine = RouteSpine.fromPlan(plan)!;
  const ring = layout.throughIds.reduce((sum, id) => sum + layout.placed.find((s) => s.spec.id === id)!.spec.length, 0);
  // Within 1 %: a moderate bend's chord-sized curve is a little shorter than
  // its arc. Before the fix the line stopped ~100 m short, at the finish gate.
  assert.ok(Math.abs(spine.length - ring) < ring * 0.01, `spine ${spine.length.toFixed(0)} m of a ${ring.toFixed(0)} m ring`);
  const finish = plan.checkpoints.find((gate) => gate.kind === 'finish')!;
  const located = { distance: 0, offRoute: 0, halfWidth: 0 };
  spine.locate(finish.centre.x, finish.centre.z, -1, located);
  assert.ok(spine.length - located.distance > 60, 'the finish stands short of the plaza, so this probe covers road past it');
  const at = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  assert.equal(spine.closed, true, 'a town spine ends where it began');
  const cases = [
    [spine.length - 140, spine.length - 68, 1], // wholly on the return (Codex's probe)
    [spine.length - 60, 25, 1], // across the seam into the plaza
    [spine.length - 60, 60, 1],
    [30, spine.length - 40, -1], // across the seam, back down the return
  ] as const;
  for (const [copAt, riderAt, way] of cases) {
    spine.sample(copAt, at);
    const sampler = new PlanTerrainSampler(plan);
    const controller = new EucController(sampler, { tuning: { ...COP_WHEEL_TUNING },
      spawn: { position: { x: at.x, y: at.y, z: at.z }, headingY: at.headingY } });
    spine.sample(riderAt, at);
    const target = { x: at.x, y: at.y, z: at.z };
    const brain = new CpuRider(spine, plan, sampler);
    const pose = createPose();
    let nearest = Infinity;
    let crashes = 0;
    let wasCrashed = false;
    let furthestBack = 0;
    for (let i = 0; i < 60 * 120; i++) {
      controller.writePose(pose);
      const view = { x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY, speed: pose.speed,
        grounded: pose.y - pose.groundY <= 1e-6, crashed: controller.crashed,
        curbAhead: controller.curbHeightAhead, lateralLimitG: EUC.maxLateralG };
      if (controller.crashed && !wasCrashed) crashes++;
      wasCrashed = controller.crashed;
      nearest = Math.min(nearest, Math.hypot(pose.x - target.x, pose.z - target.z));
      if (nearest < 8) break;
      spine.locate(pose.x, pose.z, -1, located);
      // Progress the right way round, across the seam: never more than a
      // turning circle the wrong way.
      const along = ((located.distance - copAt) * way % spine.length + spine.length * 1.5) % spine.length - spine.length / 2;
      furthestBack = Math.max(furthestBack, -along);
      controller.step(1 / 120, brain.step(1 / 120, view, { ...target, speed: 0 }));
    }
    assert.equal(crashes, 0, `cop from ${copAt.toFixed(0)} m`);
    assert.ok(nearest < 8, `cop from ${copAt.toFixed(0)} m to ${riderAt.toFixed(0)} m: closest ${nearest.toFixed(1)} m`);
    assert.ok(furthestBack < 5, `cop from ${copAt.toFixed(0)} m went ${furthestBack.toFixed(1)} m the wrong way`);
  }
});

test('the chase line follows the road centre through every bend, 150° joins included', () => {
  // M39 r6 Codex QA: a 150° join's chord runs ~10 m inside its bend, and the
  // spine's walk bridged short joins by their chord. Every wide join (≥ 115°)
  // is ridden on its centre; every other through-road point, and every gate,
  // stays in the middle of its road (the line the brain was tuned on keeps a
  // moderate bend's chord-sized curve — see `routeSpine.curveAt`).
  let wideJoins = 0;
  for (const [seed, { plan, layout }] of towns) {
    const spine = RouteSpine.fromPlan(plan)!;
    const located = { distance: 0, offRoute: 0, halfWidth: 0 };
    for (const id of layout.throughIds) {
      const segment = layout.placed.find((s) => s.spec.id === id)!;
      const wide = Math.abs((segment.spec.curvature ?? 0) * segment.spec.length) >= (115 * Math.PI) / 180;
      if (wide) wideJoins += 1;
      const allowed = wide ? 0.5 : 0.4 * segment.spec.halfWidth + 0.1;
      for (let k = 1; k < 16; k++) {
        const p = centrelineAt(segment.entry, segment.spec, (segment.spec.length * k) / 16);
        spine.locate(p.x, p.z, -1, located);
        assert.ok(located.offRoute < allowed, `${seed}: ${id} at ${k}/16 is ${located.offRoute.toFixed(2)} m off the line`);
      }
    }
    for (const gate of plan.checkpoints) {
      spine.locate(gate.centre.x, gate.centre.z, -1, located);
      assert.ok(located.offRoute < 0.4 * located.halfWidth + 0.1, `${seed}: ${gate.id} is ${located.offRoute.toFixed(2)} m off the line`);
    }
  }
  assert.ok(wideJoins > 0, 'the corpus must include a wide join for this to mean anything');
});

test('Time Trial gates never sit on a street that has a way round', () => {
  for (const [seed, { plan, layout }] of towns) {
    const withAlternates = new Set((plan.streetLoops ?? []).filter((loop) => loop.alternate.length > 0).flatMap((loop) => loop.main));
    assert.equal(plan.checkpoints.length, 6, seed);
    const onLoop = new Set((plan.streetLoops ?? []).filter((loop) => loop.alternate.length > 0).flatMap((loop) => [...loop.main, ...loop.alternate]));
    for (const gate of plan.checkpoints) {
      // The gate's own carrier — the segment whose centreline it was placed
      // on — is on the through road and on neither arm of any loop, so every
      // permitted path rides it (Codex QA: "some road under it is shared" can
      // pass with the gate on a bypassable arm).
      const carrier = layout.placed.filter((segment) => {
        for (let k = 0; k <= 64; k++) {
          const p = centrelineAt(segment.entry, segment.spec, (segment.spec.length * k) / 64);
          if (Math.hypot(p.x - gate.centre.x, p.z - gate.centre.z) < segment.spec.length / 128 + 0.01) return true;
        }
        return false;
      });
      assert.ok(carrier.length > 0, `${seed}: ${gate.id} has no carrier`);
      for (const segment of carrier) {
        assert.ok(layout.throughIds.includes(segment.spec.id), `${seed}: ${gate.id} carrier ${segment.spec.id} is off the through road`);
        assert.ok(!onLoop.has(segment.spec.id), `${seed}: ${gate.id} carrier ${segment.spec.id} is on a loop arm`);
      }
      const under = layout.placed.filter((segment) => querySegment(segment, gate.centre.x, gate.centre.z)?.outside === 0);
      assert.ok(under.length > 0, `${seed}: ${gate.id} is on no road`);
      assert.ok(under.some((segment) => !withAlternates.has(segment.spec.id)),
        `${seed}: ${gate.id} sits on ${under.map((segment) => segment.spec.id).join('/')}, which a side street skips`);
    }
  }
});
