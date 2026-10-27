/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ENVIRONMENT_AMBIENCE, POPULATION_AMBIENCE as T } from '../data/tuning.ts';
import { createEnvironmentAmbienceInput, EnvironmentAmbienceModel } from '../audio/environmentAmbience.ts';
import { createEuclaudeLevel } from '../level/euclaudeLevel.ts';
import { createLevel } from '../level/levels.ts';
import type { ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import type { PopulationRenderSnapshot } from '../render/populationView.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createPopulationPresentationSnapshot, PopulationSimulation } from '../simulation/population.ts';
import { environmentAudioEmitters } from './environmentAudio.ts';
import { populationAudioEmitters, updatePopulationAudio, type MovingAmbienceSink } from './populationAudio.ts';
import { preparePopulationWorld } from './populationWorld.ts';

function fixture(): PopulationPlan {
  const actors: ActorSpec[] = Array.from({ length: 30 }, (_, index) => ({
    id: `person-${String(index).padStart(2, '0')}`, kind: 'walker', pathId: 'walk',
    initialDistanceMetres: 0, direction: 1, movement: 'shuttle', speedMetresPerSecond: 1,
    idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } }));
  actors.push({ ...actors[0], id: 'quiet-parked', kind: 'parkedVehicle', movement: 'stationary' },
    { ...actors[0], id: 'moving-van', kind: 'trafficVehicle', movement: 'loop' });
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'world', installedWorldId: 'world/living',
    contentDigest: 'fixture', paths: [{ id: 'walk', role: 'pedestrian', district: 'commercial',
      points: [{ x: 0, y: 0, z: 0, headingY: 0, distanceMetres: 0, surface: 'pavement', sourceSegmentId: 'street' }],
      lengthMetres: 0, closed: false, serviceShuttle: false, clearanceRadiusMetres: 2, connections: [] }],
    actors, anchors: [], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}

test('outdoor beds are bounded, prioritize real moving vehicles, and omit silent parked vehicles', () => {
  const plan = fixture(), emitters = populationAudioEmitters(plan);
  assert.equal(emitters.length, T.maximumEmitters);
  assert.equal(emitters[0].id, 'population-audio/moving-van');
  assert.equal(emitters[0].kind, 'industrial');
  assert.ok(!emitters.some(emitter => emitter.id.includes('quiet-parked')));
  assert.ok(emitters.every(emitter => emitter.strength === 0));
  assert.deepEqual(populationAudioEmitters({ ...plan, actors: [...plan.actors].reverse() }), emitters);
});

test('one frame supplies the same interpolated actor source and signed backing speed magnitude', () => {
  const pose = { id: 'van', kind: 'serviceVehicle' as const, x: 8, y: 1, z: 4, headingY: 0,
    speedMetresPerSecond: -4, gaitDistanceMetres: 0, activity: 'backing', activityPhase: 0,
    activityBlend: 1, backing: true };
  const previous: PopulationRenderSnapshot = { tick: 1, clockSeconds: 1, actors: [{ ...pose, x: 0, y: 0, z: 0 }] };
  const current: PopulationRenderSnapshot = { tick: 2, clockSeconds: 2, actors: [pose] };
  const calls: unknown[][] = [];
  const plan = fixture(), van: ActorSpec = { ...plan.actors[0], id: 'van', kind: 'serviceVehicle', movement: 'loop' };
  updatePopulationAudio({ updateAmbienceEmitter(...args) { calls.push(args); return true; } }, previous, current, 0.25,
    { ...plan, actors: [van] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 4), ['population-audio/van', 2, T.sourceHeightMetres + 0.25, 1]);
  assert.ok(Math.abs(Number(calls[0][4]) - 0.4) < 1e-12);
  assert.equal(current.actors[0], pose);
});

/** The pre-PERF-WHARF loop, verbatim: every moving row offered, the sink refusing what it never installed. */
function referenceUpdate(sink: MovingAmbienceSink, previous: PopulationRenderSnapshot,
  current: PopulationRenderSnapshot, alpha: number): void {
  const t = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
  for (let index = 0; index < current.actors.length; index++) {
    const pose = current.actors[index], before = previous.actors[index] ?? pose;
    if (pose.kind === 'parkedVehicle') continue;
    const vehicle = pose.kind === 'trafficVehicle' || pose.kind === 'serviceVehicle';
    const speed = Math.abs(before.speedMetresPerSecond + (pose.speedMetresPerSecond - before.speedMetresPerSecond) * t);
    const strength = vehicle ? T.vehicleIdleStrength + T.vehicleMovingStrength
      * Math.min(1, speed / T.vehicleFullSpeedMetresPerSecond)
      : pose.kind === 'worker' ? T.workerStrength
        : pose.kind === 'social' ? T.socialStrength
          : speed > 0.1 ? T.humanMovingStrength : T.humanStandingStrength;
    sink.updateAmbienceEmitter(`population-audio/${pose.id}`,
      before.x + (pose.x - before.x) * t, before.y + (pose.y - before.y) * t + T.sourceHeightMetres,
      before.z + (pose.z - before.z) * t, strength);
  }
}

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const bits = (value: number): string => { f64[0] = value; return `${u32[1]!.toString(16)}:${u32[0]!.toString(16)}`; };

test('PERF-WHARF: only installed sources are offered, with the same values in the same order (Wharf and town)', { timeout: 300_000 }, () => {
  for (const [name, level] of [['wharf', createEuclaudeLevel()], ['town', createLevel('generated', 'euc')]] as const) {
    const living = preparePopulationWorld(level);
    const emitters = [...environmentAudioEmitters(living.level), ...populationAudioEmitters(living.population)];
    const record = () => {
      const model = new EnvironmentAmbienceModel(ENVIRONMENT_AMBIENCE);
      model.replaceWorld(living.level.id, emitters);
      const log = { offered: 0, accepted: [] as string[] };
      const sink: MovingAmbienceSink = { updateAmbienceEmitter(id, x, y, z, strength) {
        log.offered += 1;
        const accepted = model.updateEmitter(id, x, y, z, strength);
        if (accepted) log.accepted.push([id, bits(x), bits(y), bits(z), bits(strength)].join(' '));
        return accepted;
      } };
      return { model, log, sink };
    };
    const before = record(), after = record();
    const simulation = new PopulationSimulation(living.population, new PlanTerrainSampler(living.level));
    const previous = createPopulationPresentationSnapshot(), current = createPopulationPresentationSnapshot();
    const anticipation = { components: [], incompleteOwnerIds: [] };
    // The listener stands at the first installed source, so the frame depends on where it was moved.
    const input = createEnvironmentAmbienceInput(), heard = populationAudioEmitters(living.population)[0]!.id;
    input.running = true;
    const alphas = [0.25, 0.75, 0, 1, Number.NaN, -0.5, 1.5, 0.999];
    const rows = new Set<string>();
    for (let tick = 0; tick < 480; tick += 1) {
      simulation.step(1 / 120, [], [], anticipation);
      simulation.writePresentationEndpoints(previous, current);
      for (const pose of current.actors) rows.add(pose.kind);
      for (let frame = 0; frame < 2; frame += 1) {
        const alpha = alphas[(tick * 2 + frame) % alphas.length]!, start = before.log.accepted.length;
        referenceUpdate(before.sink, previous, current, alpha);
        updatePopulationAudio(after.sink, previous, current, alpha, living.population);
        assert.deepEqual(after.log.accepted.slice(start), before.log.accepted.slice(start), `${name} tick ${tick} frame ${frame}`);
      }
      const listener = current.actors.find(pose => `population-audio/${pose.id}` === heard)!;
      input.listenerX = listener.x + 3; input.listenerY = listener.y + 1.6; input.listenerZ = listener.z;
      // What the installed sources then sound like, by bits (the model reads every moved source).
      const a = before.model.update(1 / 120, input), b = after.model.update(1 / 120, input);
      assert.deepEqual(Object.values(b).map(bits), Object.values(a).map(bits), `${name} tick ${tick} frame`);
    }
    const installed = populationAudioEmitters(living.population).length, frames = 480 * 2;
    assert.equal(after.log.accepted.length, before.log.accepted.length);
    assert.equal(after.log.accepted.length, installed * frames, `${name}: every installed source is moved every frame`);
    assert.equal(after.log.offered, after.log.accepted.length, `${name}: nothing the sink would refuse is offered`);
    assert.ok(before.log.offered > before.log.accepted.length, `${name}: the reference offered refused rows`);
    assert.ok(rows.size >= 3, `${name}: ${[...rows]}`);
  }
});

test('M47: a density roster keeps the town\'s beds — at most six for moving vehicles, the base vans first', { timeout: 120_000 }, async () => {
  const { populationRoster } = await import('../level/populationDensity.ts');
  const living = preparePopulationWorld(createLevel('generated', 'euc'));
  const kinds = (plan: PopulationPlan) => populationAudioEmitters(plan).reduce<Record<string, number>>((count, emitter) =>
    ({ ...count, [emitter.kind]: (count[emitter.kind] ?? 0) + 1 }), {});
  const low = populationRoster(living.population, 'base'), medium = populationRoster(living.population, 'medium');
  const high = populationRoster(living.population, 'high');
  // Low is the base plan itself: its beds are today's (vans first, no cap).
  assert.equal(low, living.population);
  assert.deepEqual(kinds(low), { industrial: 3, park: 12, workshop: 1 });
  for (const plan of [medium, high]) {
    assert.equal(populationAudioEmitters(plan).length, T.maximumEmitters);
    assert.equal(kinds(plan).industrial, T.densityVehicleEmitters);
  }
  // High's vehicle beds are Medium's: the base vans, then the extras in density order.
  const vehicleBeds = (plan: PopulationPlan) => populationAudioEmitters(plan).filter(emitter => emitter.kind === 'industrial').map(emitter => emitter.id);
  assert.deepEqual(vehicleBeds(high), vehicleBeds(medium));
  for (const actor of low.actors) if (actor.kind === 'trafficVehicle' || actor.kind === 'serviceVehicle') {
    assert.ok(vehicleBeds(high).includes(`population-audio/${actor.id}`));
  }
});
