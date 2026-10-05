/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { EucController as NativeController } from './EucController.ts';
import { CrashRagdoll } from './ragdoll.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EUC, POPULATION, POPULATION_OCCUPANT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose, type RiderOccupancyPose, type RiderOccupancyPrism } from '../shared/riderOccupancy.ts';
import { PopulationSimulation, sweepPopulationHulls, type PopulationFootprint } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { proposeFullRagSideProjection, proposeFullRagWheelSideProjection } from '../shared/riderSideContact.ts';
import { certifiedReactionTrajectoryClear } from './populationPhysicalReactionClearance.ts';
import { resolvePopulationWholeStepRefusal } from './populationWholeStepRefusal.ts';
import { boundRagFrameRanges } from '../shared/ragFrameRanges.ts';
import { compileRiderOccupancyCertificate } from '../shared/compiledOccupancy.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
/** The rag particle radii (ragdoll.ts `RADIUS`), restated so this file also loads on the pre-fix tree. */
const RAGDOLL_RADII = [0.14, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.07, 0.07];
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (value: EucController | NativeController) => { const out = createPose(); value.writePose(out); return out; };
const body = (p: RiderOccupancyPrism): PopulationFootprint => ({ x: p.x, z: p.z, headingY: p.headingY, halfWidthMetres: p.halfWidth,
  halfLengthMetres: p.halfLength, minY: p.baseY, maxY: p.topY, velocityX: 0, velocityZ: 0 });
function signedGap(first: PopulationFootprint, second: PopulationFootprint) {
  const axes = (h: number) => [{ x: Math.cos(h), z: -Math.sin(h) }, { x: Math.sin(h), z: Math.cos(h) }];
  const support = (p: PopulationFootprint, n: { x: number; z: number }) => { const [x, z] = axes(p.headingY);
    return Math.abs(x.x * n.x + x.z * n.z) * p.halfWidthMetres + Math.abs(z.x * n.x + z.z * n.z) * p.halfLengthMetres; };
  return Math.max(first.minY - second.maxY, second.minY - first.maxY,
    ...[...axes(first.headingY), ...axes(second.headingY)].map(n => Math.abs((first.x - second.x) * n.x + (first.z - second.z) * n.z) - support(first, n) - support(second, n)));
}
/** A crashed body's physical gap (2026-10-04): rag particles as their radius boxes, and the wheel. */
function bodyGap(pose: RiderOccupancyPose, actor: PopulationFootprint): number {
  let value = signedGap(body(buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY).wheel), actor);
  if (pose.ragdollBlend > 0) RAGDOLL_RADII.forEach((radius, index) => { value = Math.min(value, signedGap({ x: pose.ragdoll[index * 3],
    z: pose.ragdoll[index * 3 + 2], headingY: actor.headingY, halfWidthMetres: radius, halfLengthMetres: radius,
    minY: pose.ragdoll[index * 3 + 1] - radius, maxY: pose.ragdoll[index * 3 + 1] + radius, velocityX: 0, velocityZ: 0 }, actor)); });
  return value;
}
function crashed<T extends EucController | NativeController>(value: T, ticks = 12): T {
  value.reset(undefined, 12); assert.equal(value.hardKnock(3, 0), true); for (let i = 0; i < ticks; i += 1) value.step(DT, NEUTRAL_ACTIONS); return value;
}
function translated(p: RiderOccupancyPose, x: number, z: number): RiderOccupancyPose {
  return { ...p, ragdoll: Float64Array.from(p.ragdoll, (value, i) => value + (i % 3 === 0 ? x : i % 3 === 2 ? z : 0)) };
}
test('full-rag native particle translation is the exact authoritative human translation and leaves the separate wheel untouched', () => {
  const first = poseOf(crashed(new EucController(flat), 24)), after = translated(first, -.03, .04);
  assert.equal(first.ragdollBlend, 1);
  const a = buildRiderOccupancyEnvelope(first, RIDER_OCCUPANCY), b = buildRiderOccupancyEnvelope(after, RIDER_OCCUPANCY);
  assert.deepEqual(b.wheel, a.wheel); assert.ok(Math.abs(b.human.x - a.human.x + .03) < 1e-8); assert.ok(Math.abs(b.human.z - a.human.z - .04) < 1e-8);
  for (const key of ['halfWidth', 'halfLength', 'baseY', 'topY'] as const) assert.ok(Math.abs(a.human[key] - b.human[key]) < 1e-8, key);
  const actor: PopulationFootprint = { ...body(a.human), x: a.human.x + a.human.halfWidth + .28 + .05,
    halfWidthMetres: .28, halfLengthMetres: .28, minY: 0, maxY: 2.8 };
  const inward = translated(first, .1, 0), correction = proposeFullRagSideProjection(first, inward, [actor], RIDER_OCCUPANCY, POPULATION.contactSkinMetres);
  assert.ok(correction && correction.x < -.05); assert.ok(signedGap(body(buildRiderOccupancyEnvelope(translated(inward, correction.x, correction.z), RIDER_OCCUPANCY).human), actor) >= POPULATION.contactSkinMetres - 1e-8);
});
test('full-rag wheel-root contact translation leaves the authoritative world-particle human fixed and keeps vertical support unchanged', () => {
  const first = poseOf(crashed(new EucController(flat), 24)), shifted = { ...first, x: first.x - .03, z: first.z + .04 };
  const a = buildRiderOccupancyEnvelope(first, RIDER_OCCUPANCY), b = buildRiderOccupancyEnvelope(shifted, RIDER_OCCUPANCY);
  for (const key of ['x', 'z', 'halfWidth', 'halfLength', 'baseY', 'topY'] as const) assert.ok(Math.abs(a.human[key] - b.human[key]) < 1e-8, `human ${key}`);
  assert.ok(Math.abs(b.wheel.x - a.wheel.x + .03) < 1e-8); assert.ok(Math.abs(b.wheel.z - a.wheel.z - .04) < 1e-8);
  assert.equal(b.wheel.baseY, a.wheel.baseY); assert.equal(b.wheel.topY, a.wheel.topY);
  const actor: PopulationFootprint = { ...body(a.wheel), x: a.wheel.x + a.wheel.halfWidth + .28 + .05,
    halfWidthMetres: .28, halfLengthMetres: .28, minY: 0, maxY: 2.8 };
  const inward = { ...first, x: first.x + .1 }, correction = proposeFullRagWheelSideProjection(first, inward, [actor], RIDER_OCCUPANCY, POPULATION.contactSkinMetres);
  assert.ok(correction && correction.x < -.05);
  const end = buildRiderOccupancyEnvelope({ ...inward, x: inward.x + correction.x, z: inward.z + correction.z }, RIDER_OCCUPANCY);
  assert.ok(signedGap(body(end.wheel), actor) >= POPULATION.contactSkinMetres - 1e-8);
  for (const key of ['x', 'z', 'halfWidth', 'halfLength', 'baseY', 'topY'] as const) assert.ok(Math.abs(a.human[key] - end.human[key]) < 1e-8, `final human ${key}`);
});
test('native crash wheel side constraint preserves Y/Verlet fall and tangential momentum, with authored rejection before state mutation', () => {
  let blocked = false;
  const terrain: TerrainSampler = { ...flat, raycastObstacle() { return blocked ? 0 : null; } };
  const value = crashed(new EucController(terrain), 24), before = poseOf(value), snapshot = value.snapshot();
  const rag = (value as unknown as { ragdoll: { positions: Float64Array; previous: Float64Array } }).ragdoll;
  const particles = Array.from(rag.positions), history = Array.from(rag.previous);
  const native = value as unknown as { projectCrashWheelSideContact(pose: typeof before, projection: { x: number; z: number; normals: { x: number; z: number }[]; planes: [] }): boolean };
  assert.equal(native.projectCrashWheelSideContact(before, { x: -.03, z: 0, normals: [{ x: -1, z: 0 }], planes: [] }), true);
  const after = poseOf(value);
  assert.equal(after.y, before.y); assert.equal(after.wheelCrashPop, before.wheelCrashPop); assert.equal(value.snapshot().speed, snapshot.speed);
  assert.deepEqual(Array.from(rag.positions), particles); assert.deepEqual(Array.from(rag.previous), history);
  assert.ok(Math.abs(after.x - before.x + .03) < 1e-8); assert.equal(after.z, before.z);
  const exact = { pose: poseOf(value), snapshot: value.snapshot(), positions: Array.from(rag.positions), previous: Array.from(rag.previous) };
  blocked = true;
  assert.equal(native.projectCrashWheelSideContact(after, { x: -.03, z: 0, normals: [{ x: -1, z: 0 }], planes: [] }), false);
  assert.deepEqual({ pose: poseOf(value), snapshot: value.snapshot(), positions: Array.from(rag.positions), previous: Array.from(rag.previous) }, exact);
});
test('partial-rag and initially side-intruding bodies cannot acquire a fabricated side-plane escape', () => {
  const first = poseOf(crashed(new EucController(flat), 24)), human = buildRiderOccupancyEnvelope(first, RIDER_OCCUPANCY).human;
  const blocker = { ...body(human), halfWidthMetres: .28, halfLengthMetres: .28, minY: 0, maxY: 2.8 };
  assert.equal(proposeFullRagSideProjection(first, first, [blocker], RIDER_OCCUPANCY, .001), null);
  assert.equal(proposeFullRagSideProjection({ ...first, ragdollBlend: .99 }, first, [], RIDER_OCCUPANCY, .001), null);
});
test('native rag side projection preserves vertical/tangential Verlet history and refuses authored/uphill obstruction before particle mutation', () => {
  const rag = new CrashRagdoll(), history = (rag as unknown as { previous: Float64Array }).previous;
  for (let i = 0; i < 11; i += 1) { rag.positions.set([0, 2, 0], i * 3); history.set([-.1, 1.9, -.2], i * 3); }
  assert.equal(rag.projectSideContact(-.03, 0, [{ x: -1, z: 0 }], flat), true);
  for (let i = 0; i < 11; i += 1) {
    assert.equal(rag.positions[i * 3], -.03); assert.equal(history[i * 3], -.03); assert.equal(rag.positions[i * 3 + 1], 2); assert.equal(history[i * 3 + 1], 1.9);
    assert.equal(rag.positions[i * 3 + 2], 0); assert.equal(history[i * 3 + 2], -.2);
  }
  const positions = Array.from(rag.positions), previous = Array.from(history);
  assert.equal(rag.projectSideContact(-.03, 0, [{ x: -1, z: 0 }], { ...flat, raycastObstacle() { return .001; } }), false);
  assert.deepEqual(Array.from(rag.positions), positions); assert.deepEqual(Array.from(history), previous);
  assert.equal(rag.projectSideContact(-.03, 0, [{ x: -1, z: 0 }], { ...flat, sampleGround(x, z, out) { flat.sampleGround(x, z, out); out.height = -x; return out; } }), false);
  assert.deepEqual(Array.from(rag.positions), positions); assert.deepEqual(Array.from(history), previous);
});
test('distant actual native side-obstacle port preserves mounted and full crash/recovery byte parity against the same native clear-space equations', () => {
  const candidate = new EucController(flat), native = new NativeController(flat); candidate.reset(undefined, 12); native.reset(undefined, 12);
  candidate.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    ragObstacleBodies: () => [{ x: 1000, z: 1000, headingY: 0, halfWidthMetres: 1.02, halfLengthMetres: 2.4, minY: 0, maxY: 2.8, velocityX: 0, velocityZ: 0 }] });
  for (let i = 0; i < 25; i += 1) { candidate.step(DT, NEUTRAL_ACTIONS); native.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(poseOf(candidate), poseOf(native)); assert.deepEqual(candidate.snapshot(), native.snapshot()); }
  assert.equal(candidate.hardKnock(3, 0), native.hardKnock(3, 0));
  for (let i = 0; i < 460; i += 1) { candidate.step(DT, NEUTRAL_ACTIONS); native.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(poseOf(candidate), poseOf(native)); assert.deepEqual(candidate.snapshot(), native.snapshot()); }
});
function parkedPlan(x: number, z: number): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'full-rag-side', installedWorldId: 'full-rag-side/living-r1', contentDigest: 'full-rag-side', anchors: [],
    paths: [{ id: 'parked', role: 'traffic', district: 'commercial', points: [-1, 1].map((offset, index) => ({ x, y: 0, z: z + offset, headingY: 0, distanceMetres: index * 2, surface: 'pavement', sourceSegmentId: 'native-full-rag-side' })), lengthMetres: 2, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'parked', kind: 'parkedVehicle', pathId: 'parked', initialDistanceMetres: 1, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
function fullNativeRide(response: boolean) {
  const value = crashed(new EucController(flat)), first = poseOf(value), original = value.prepareStep(DT, NEUTRAL_ACTIONS), unprotected = createPose(); value.writePreparedPose(original, unprotected);
  const human = buildRiderOccupancyEnvelope(first, RIDER_OCCUPANCY).human, next = buildRiderOccupancyEnvelope(unprotected, RIDER_OCCUPANCY).human;
  const initialFront = human.z + human.halfLength, growth = next.z + next.halfLength - initialFront; assert.ok(growth > .006);
  const population = new PopulationSimulation(parkedPlan(0, initialFront + growth / 2 + 2.4), flat), actor = population.snapshot().actors[0].footprint;
  assert.ok(Object.values(buildRiderOccupancyEnvelope(first, RIDER_OCCUPANCY)).every(part => signedGap(body(part), actor) > 0));
  assert.ok(Object.values(buildRiderOccupancyEnvelope(unprotected, RIDER_OCCUPANCY)).some(part => signedGap(body(part), actor) < 0), 'actual unprotected full native next fall supplies the strict collision witness');
  const certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, first), notes: unknown[] = [], denials: unknown[] = [], serial = value.discontinuitySerial;
  const port: EucDynamicWorld = { hull: POPULATION_OCCUPANT,
    ...(response ? { ragObstacleBodies: () => population.snapshot().actors.map(actor => actor.footprint) } : {}), resolveMotion: () => null,
    canPlace: request => certificates.components('owner', request.occupancyPose, request.occupancyPose, 0, 'placement').every(component => population.recoveryClearance(component.at(0), [], [], 0).clear),
    didPlace: request => notes.push({ reason: request.reason, clock: population.clockSeconds, serial: value.discontinuitySerial, crashed: value.crashed }),
    canReact: request => {
      const allowed = populationPhysicalReactionAllowed({ ownerId: 'owner', request, population, certificates, occupants: [], reservations: [] });
      if (!allowed && request.kind === 'contactClock' && denials.length < 4) {
        const proof = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, request.previous), blockers = population.snapshot().actors.map(actor => ({ id: actor.id, previous: actor.footprint, current: actor.footprint }));
        const owner = proof.owner('diagnostic', request.previous, request.proposed, DT, blockers);
        denials.push({ crashClock: value.snapshot().crashTime, conditioning: owner.requiresConditioningHold,
          components: owner.movingComponents().map(component => ({ component: component.componentId,
            beforeGap: signedGap(component.at(0), actor), afterGap: signedGap(component.at(1), actor),
            fullPad: component.intervalEnvelopeMetres(0, 1), clear: certifiedReactionTrajectoryClear(component, actor) })) });
      }
      return allowed;
    } };
  value.setDynamicWorld(port); let refusals = 0, advanced = 0, maximumCrashTime = value.snapshot().crashTime, minimumPelvisY = first.ragdoll[1], minimumBodyGap = Infinity;
  const rows: unknown[] = [], unresolvedIntervals: unknown[] = [];
  let diagnosticTick = -1, diagnosticPrevious: RiderOccupancyPose = first, diagnosticCurrent: RiderOccupancyPose = first;
  const originalComponents = certificates.components.bind(certificates);
  certificates.components = (...args) => {
    const parts = originalComponents(...args);
    if (args[4] !== 'moving') return parts;
    diagnosticPrevious = args[1]; diagnosticCurrent = args[2];
    return parts.map(part => ({ ...part, intervalEnvelopeMetres: (lo: number, hi: number) => {
      const pad = part.intervalEnvelopeMetres(lo, hi);
      if (hi - lo <= 1 / 2 ** POPULATION.sweepMaximumSubdivisionDepth && pad > POPULATION.contactSkinMetres && unresolvedIntervals.length < 4) {
        const first = part.at(lo), last = part.at(hi), inflate = (p: PopulationFootprint): PopulationFootprint => ({ ...p,
          halfWidthMetres: p.halfWidthMetres + pad, halfLengthMetres: p.halfLengthMetres + pad, minY: p.minY - pad, maxY: p.maxY + pad });
        if (sweepPopulationHulls(inflate(first), inflate(last), actor, actor)) {
          const midpoint = (lo + hi) / 2, input = { previous: diagnosticPrevious, current: diagnosticCurrent, coefficients: RIDER_OCCUPANCY },
            frame = boundRagFrameRanges(input, lo, hi), exact = [lo, midpoint, hi].map(t => ({ t,
              source: buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(input.previous, input.current, t), RIDER_OCCUPANCY)[part.componentId as 'wheel' | 'human'], compiled: part.at(t) })),
            slot = compileRiderOccupancyCertificate(part.componentId === 'human' ? 'rag-human' : 'wheel', RIDER_OCCUPANCY, input.previous).createSlot();
          slot.load(input.previous, input.current);
          const internal = slot as unknown as { point: Float64Array; gates: { primitive: number; reach: number; threshold: number; strict: boolean }[] };
          const folds = [lo, midpoint, hi].map(t => { slot.at(t); return { t, gates: [...new Map(internal.gates.map(g => { const squaredReach = internal.point[g.reach], active = g.strict ? squaredReach < g.threshold : squaredReach <= g.threshold;
            return [`${g.primitive}/${g.threshold}/${g.strict}`, { primitive: g.primitive, threshold: g.threshold, strict: g.strict, squaredReach, active }] as const; })).values()] }; });
          unresolvedIntervals.push({ tick: diagnosticTick, component: part.componentId, lo, hi, pad, firstGap: signedGap(first, actor), lastGap: signedGap(last, actor),
            midpointGap: signedGap(part.at(midpoint), actor), frame, folds, exact });
        }
      }
      return pad;
    } }));
  };
  for (let tick = 0; tick < 440 && (tick === 0 || value.crashed); tick += 1) {
    diagnosticTick = tick;
    const previous = poseOf(value), current = createPose(), token = value.prepareStep(DT, NEUTRAL_ACTIONS), metadata = body(buildRiderOccupancyEnvelope(previous, RIDER_OCCUPANCY).human);
    population.step(DT, [{ id: 'owner', kind: 'human', previous: metadata, current: metadata }]);
    const seat = { id: 'owner', kind: 'human' as const, controller: value, pose: current };
    let result: ReturnType<typeof commitPopulationPhysicalTransaction>;
    try { result = commitPopulationPhysicalTransaction({ population, certificates, seats: [seat], preparedSeats: [{ ...seat, token, world: port }],
      before: new Map([['owner', { pose: previous, serial: value.discontinuitySerial }]]), dt: DT, reservations: [], bodyFromPose: p => body(buildRiderOccupancyEnvelope(p, RIDER_OCCUPANCY).human),
      ...(response ? { contactResponse: 'yield' as const } : {}) }); }
    catch (error) {
      console.log(JSON.stringify({ diagnostic: 'native-phase-crash-v8-FIRST-FAILURE', response, tick, error: String(error),
        sourceSnapshot: value.snapshot(), previous, prepared: current, actor, prefix: { refusals, advanced, maximumCrashTime, minimumPelvisY, rows, denials }, unresolvedIntervals }));
      throw error;
    }
    refusals += Number(result.resolution.refusedOwnerIds.includes('owner')); advanced += result.contactResponses.filter(item => item.inputAdvanced).length;
    const actual = poseOf(value); maximumCrashTime = Math.max(maximumCrashTime, value.snapshot().crashTime);
    if (value.crashed) minimumPelvisY = Math.min(minimumPelvisY, actual.ragdoll[1]);
    // 2026-10-04: a falling body's particles and wheel meet the car natively;
    // its garment envelope may brush it. A recovered rider is clear whole.
    const gaps = value.crashed ? [bodyGap(actual, actor)] : Object.values(buildRiderOccupancyEnvelope(actual, RIDER_OCCUPANCY)).map(part => signedGap(body(part), actor));
    minimumBodyGap = Math.min(minimumBodyGap, ...gaps);
    if (response) assert.ok(gaps.every(gap => gap >= -1e-6), `accepted actual native body must not intrude at tick ${tick}: ${gaps}`);
    if (tick < 3 || tick % 100 === 0 || !value.crashed) rows.push({ tick, clock: population.clockSeconds, crashClock: value.snapshot().crashTime, response: result.contactResponses, refused: result.resolution.refusedOwnerIds, gaps, pelvisY: actual.ragdoll[1] });
  }
  return { value, first, population, notes, serial, refusals, advanced, maximumCrashTime, minimumPelvisY, minimumBodyGap, rows, denials };
}
// 2026-10-04 (R2C-1/R2C-3, R2C-7): a falling body is never refused now, so the
// counterfactual is no longer the old exact-start hold but a port without the
// actors' bodies, whose fall crosses the car's face: the particle and wheel
// side constraints are what keep it out, and nothing holds it.
test('actual compound whole-step contact never refuses a falling body: its native fall meets the car and recovers; without the actors\' bodies it would cross the car', () => {
  const good = fullNativeRide(true), bad = fullNativeRide(false);
  console.log(JSON.stringify({ prototype: 'native-phase-contact-v8', good: { crashed: good.value.crashed, maximumCrashTime: good.maximumCrashTime, initialPelvisY: good.first.ragdoll[1], minimumPelvisY: good.minimumPelvisY, notes: good.notes, refusals: good.refusals, advanced: good.advanced, rows: good.rows, denials: good.denials }, bad: { crashed: bad.value.crashed, maximumCrashTime: bad.maximumCrashTime, initialPelvisY: bad.first.ragdoll[1], minimumPelvisY: bad.minimumPelvisY, notes: bad.notes, refusals: bad.refusals, rows: bad.rows } }));
  assert.equal(good.refusals, 0, 'a falling body is never held'); assert.equal(good.value.crashed, false, 'actual full native automatic recovery must complete without a suspended-pose clock');
  assert.ok(good.maximumCrashTime >= EUC.crashRecoverAutoSeconds - 2 * DT); assert.ok(good.minimumPelvisY < good.first.ragdoll[1] - .1, 'the body must actually fall, not merely translate sideways or advance a frozen clock');
  assert.equal(good.value.discontinuitySerial, good.serial + 1); assert.equal(good.notes.length, 1); assert.equal((good.notes[0] as { reason: string }).reason, 'recover');
  assert.ok(good.minimumBodyGap >= -1e-6);
  assert.ok(bad.minimumBodyGap < -.01, `without the actors' bodies the same fall enters the car (${bad.minimumBodyGap.toFixed(3)} m)`);
});
test('incoming actor motion blocks a native crash while its actual exact-start held body clears the SAME full native trajectory', () => {
  const value = crashed(new EucController(flat)), native = crashed(new EucController(flat)), before = poseOf(value), token = value.prepareStep(DT, NEUTRAL_ACTIONS), after = createPose();
  value.resolvePreparedStep(token, { hull: POPULATION_OCCUPANT, resolveMotion: () => null }); value.writePreparedPose(token, after);
  const a = buildRiderOccupancyEnvelope(before, RIDER_OCCUPANCY).human, b = buildRiderOccupancyEnvelope(after, RIDER_OCCUPANCY).human;
  const side = Math.max(a.x + a.halfWidth, b.x + b.halfWidth), actorFirst: PopulationFootprint = { x: side + .28 + .03, z: a.z, headingY: -Math.PI / 2, halfWidthMetres: .28, halfLengthMetres: .28, minY: 0, maxY: 1.9, velocityX: -24, velocityZ: 0 };
  const actor = { id: 'incoming', previous: actorFirst, current: { ...actorFirst, x: actorFirst.x - 24 * DT } }, certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, before), owner = certificates.owner('owner', before, after, DT, [actor]);
  assert.ok(signedGap(body(a), actorFirst) > 0 && signedGap(body(b), actorFirst) > .0299999); assert.ok(signedGap(body(b), actor.current) < 0, 'actual incoming actor suffix must collide with the actual human');
  const bad = resolvePopulationWholeStepRefusal([actor], [owner]), heldActor = { ...actor,
    previous: { ...actorFirst, velocityX: 0, velocityZ: 0 }, current: { ...actorFirst, velocityX: 0, velocityZ: 0 } },
    good = resolvePopulationWholeStepRefusal([heldActor], [owner]);
  assert.ok(bad.refusedOwnerIds.includes('owner')); assert.deepEqual(good.refusedOwnerIds, []); assert.deepEqual(good.batch.hits, []);
  value.commitPreparedStep(token); native.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(poseOf(value), poseOf(native)); assert.deepEqual(value.snapshot(), native.snapshot());
});
