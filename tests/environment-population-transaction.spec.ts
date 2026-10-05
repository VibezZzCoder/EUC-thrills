/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../src/level/populationPlan.ts';
import type { EucController, EucPreparedStep } from '../src/simulation/EucController.ts';
import type { PopulationContact, PopulationFootprint, PopulationSimulation } from '../src/simulation/population.ts';
import type { SurfaceId } from '../src/simulation/world.ts';
import { boot, collectErrors } from './harness.ts';

/**
 * Game-level transaction gates.  The headless population and controller
 * transaction tests remain the exhaustive geometry contracts; these tests
 * prove that Game keeps their chronology through its prepare/resolve/commit
 * composition.
 *
 * The tiny actor plan is deliberately hostile: `forceActorMotion` gives its
 * walker an already-reached high speed and calls its ordinary `step` without
 * occupant look-ahead.  That suppresses only predictive AI yielding so the
 * production contact batch sees the selected crossing.  It does not replace
 * hull motion, the batch solver, controller preparation, or final commit.
 */

type Occupant = { id: string; kind: 'human' | 'cop'; previous: PopulationFootprint; current: PopulationFootprint };
type Pursuer = { index: number; controller: EucController; brain: { step: (...args: unknown[]) => Record<string, unknown> } };
type Internals = {
  terrain: unknown;
  populationPlan: PopulationPlan;
  population: PopulationSimulation;
  populationReservations: unknown[];
  seats: Array<{ controller: EucController }>;
  pursuers: Pursuer[];
  populationPreparedSteps: Array<{ id: string; token: EucPreparedStep }>;
  populationTransactionCommitted: boolean;
  step(seconds: number): void;
};

const NEUTRAL = {
  throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false,
  swing: false, reset: false, cameraCycle: false, pause: false, muteAudio: false,
};

test('a chase probe installs and shows its initial cop without a manual reset', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=slice&chaseprobe=1&cops=1');
  const result = await page.evaluate(() => {
    const game = window.game;
    const internal = game as unknown as {
      pursuers: Array<{ worldPlaced: boolean; controller: EucController }>;
      populationBodies(): Array<{ id: string }>;
    };
    game.advance(0);
    const installed = internal.pursuers[0]?.worldPlaced;
    const bodies = internal.populationBodies().map(value => value.id);
    const visibleCost = game.renderer.challengeCosts().copDrawCalls;
    // A private/refused slot must never draw or occupy the origin. This is
    // the negative control for the earlier unconditionally visible scratch cop.
    internal.pursuers[0]!.worldPlaced = false;
    game.advance(0);
    return { installed, bodies, visibleCost,
      hiddenCost: game.renderer.challengeCosts().copDrawCalls,
      hiddenBodies: internal.populationBodies().map(value => value.id) };
  });
  expect(result.installed).toBe(true);
  expect(result.bodies).toContain('cop-0');
  expect(result.visibleCost).toBeGreaterThan(0);
  expect(result.hiddenCost).toBe(0);
  expect(result.hiddenBodies).not.toContain('cop-0');
  expect(errors).toEqual([]);
});

test('inactive pack placement leaves no invisible cop reservation in free ride', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=slice&cops=1');
  const result = await page.evaluate(() => {
    const game = window.game;
    const internal = game as unknown as {
      placePackAtStart(): void;
      pursuers: Array<{ worldPlaced: boolean }>;
      populationBodies(): Array<{ id: string }>;
    };
    internal.placePackAtStart();
    game.advance(0);
    return { actuallyPlaced: internal.pursuers.some(value => value.worldPlaced),
      bodies: internal.populationBodies().map(value => value.id),
      copReservations: game.populationState().reservations.filter(value => value.id.startsWith('cop-')),
      copCost: game.renderer.challengeCosts().copDrawCalls };
  });
  expect(result.actuallyPlaced).toBe(true);
  expect(result.bodies.some(value => value.startsWith('cop-'))).toBe(false);
  expect(result.copReservations).toEqual([]);
  expect(result.copCost).toBe(0);
  expect(errors).toEqual([]);
});

test('Game discards a later cop collision on an NPC suffix stopped by an earlier human', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=slice&chaseprobe=1&cops=1');

  const result = await page.evaluate((NEUTRAL) => {
    const game = window.game;
    game.loop.setRunning(false);
    const internal = game as unknown as Internals;
    const cop = internal.pursuers[0];
    if (!cop) throw new Error('chaseprobe must provide one cop');

    const point = (x: number, z: number) => {
      const ground = game.sampleGround(x, z);
      return { x, y: ground.height, z };
    };
    const path: PopulationPath = {
      id: 'qa/hostile-line', role: 'pedestrian', district: 'park', closed: false, serviceShuttle: false,
      points: [0, 4, 8].map((z) => ({ ...point(0, z), headingY: 0, distanceMetres: z,
        surface: game.sampleGround(0, z).surface as SurfaceId, sourceSegmentId: 'qa/clear-pavement' })),
      lengthMetres: 8, clearanceRadiusMetres: 3, connections: [],
    };
    const actor: ActorSpec = { id: 'qa/npc', kind: 'walker', pathId: path.id, initialDistanceMetres: 0,
      direction: 1, movement: 'shuttle', speedMetresPerSecond: 16, idleSeconds: 1, appearanceIndex: 0,
      hull: { halfWidthMetres: 0.05, halfLengthMetres: 0.05, heightMetres: 1.8 } };
    const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'qa',
      installedWorldId: 'qa~living-r1', contentDigest: 'discarded-suffix', paths: [path], anchors: [], actors: [actor],
      report: { missingAuthoredPaths: false, rejected: [], availableKinds: ['walker'], missingKinds: [] } };
    const Simulation = internal.population.constructor as unknown as new (p: PopulationPlan, terrain: unknown) => PopulationSimulation;
    // 2026-10-04 negative control: outside Game, the same forced walker covers
    // its whole 4 m sweep in one 0.25 s step, so a held walker below is held
    // by the Game transaction, not by the fixture.
    const control = new Simulation(plan, internal.terrain) as unknown as {
      states: Array<{ speed: number }>; step(dt: number, occupants?: readonly Occupant[], reservations?: readonly unknown[]): void;
      snapshot(): { actors: readonly { z: number }[] } };
    control.states[0]!.speed = 16; control.step(0.25, [], []);
    const controlZ = control.snapshot().actors[0]!.z;
    const population = new Simulation(plan, internal.terrain);
    const hostile = population as unknown as {
      states: Array<{ speed: number }>;
      step(dt: number, occupants?: readonly Occupant[], reservations?: readonly unknown[]): void;
    };
    const ordinaryStep = hostile.step.bind(population);
    // Force the authored 4 m NPC sweep; omit look-ahead occupants/reservations only.
    hostile.step = (dt, _occupants, _reservations) => { hostile.states[0]!.speed = 16; ordinaryStep(dt, [], []); };
    internal.populationPlan = plan; internal.population = population; internal.populationReservations = [];

    const human = internal.seats[0]!.controller;
    if (!human.reset({ position: point(0, 1.35), headingY: 0 })) throw new Error('human placement was blocked');
    if (!cop.controller.reset({ position: point(0, 3.35), headingY: 0 })) throw new Error('cop placement was blocked');
    internal.populationReservations = [];
    let brainCalls = 0;
    cop.brain.step = () => { brainCalls += 1; return { ...NEUTRAL }; };

    // 0.25 s is Population's documented bounded maximum; this makes one real
    // Game transaction contain the 4 m NPC sweep without a long browser loop.
    internal.step(0.25);
    const contacts = game.populationState().contacts as readonly PopulationContact[];
    const actorEnd = game.populationState().simulation.actors.find(value => value.id === 'qa/npc')!;
    const humanPose = human.snapshot();
    const copPose = cop.controller.snapshot();
    return { brainCalls, contacts: contacts.map(value => value.occupantId), controlZ,
      actorZ: actorEnd.z, actorSpeed: actorEnd.speedMetresPerSecond,
      humanZ: humanPose.position.z, copZ: copPose.position.z,
      humanCollision: humanPose.collisionImpact, copCollision: copPose.collisionImpact,
      committed: internal.populationTransactionCommitted,
      prepared: internal.populationPreparedSteps.map(value => ({ id: value.id, ready: value.token.ready })) };
  }, NEUTRAL);

  // 2026-10-03: the legacy per-occupant `prepareContacts` precondition is gone —
  // populated worlds always settle through the compound transaction now.
  expect(result.brainCalls, 'the cop brain was replayed while the transaction settled').toBe(1);
  // 2026-10-04 (R2C-5, populationPhysicalTransaction.ts): an actor whose step
  // would meet a prepared rider is now held at its start for that step instead
  // of being stopped at the contact and publishing it. The walker's 4 m sweep
  // is therefore held by the earlier human before it covers any of its route,
  // so neither rider is touched, and its suffix still never reaches the cop.
  expect(result.controlZ, 'the forced walker sweeps 4 m without the Game transaction').toBeGreaterThan(3.9);
  expect(result.actorZ, 'the walker was held at its start by the earlier human').toBe(0);
  expect(result.actorSpeed).toBe(0);
  expect(result.contacts).toEqual([]);
  expect(result.humanCollision).toBe(0);
  expect(result.humanZ).toBeCloseTo(1.35, 6);
  expect(result.copZ).toBeCloseTo(3.35, 6);
  expect(result.copCollision, 'an unreachable NPC suffix charged the cop').toBe(0);
  expect(result.committed).toBe(true);
  // A committed token is consumed and cannot be reused for another step.
  expect(result.prepared.find(value => value.id === 'human-0')?.ready).toBe(false);
  expect(result.prepared.find(value => value.id === 'cop-0')?.ready).toBe(false);
  expect(errors).toEqual([]);
});

test('Game refuses a dynamically clipped prefix when that prefix is statically invalid', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=slice&chaseprobe=1&cops=1');

  const result = await page.evaluate((NEUTRAL) => {
    const game = window.game;
    game.loop.setRunning(false);
    const internal = game as unknown as Internals;
    const human = internal.seats[0]!.controller;
    const groundAt = (x: number, z: number) => game.sampleGround(x, z);
    internal.pursuers[0]?.controller.reset({ position: { x: 0, y: groundAt(0, 12).height, z: 12 }, headingY: 0 });
    if (!human.reset({ position: { x: 0, y: groundAt(0, 0).height, z: 0 }, headingY: 0 }, 8)) {
      throw new Error('calibration reset was blocked');
    }
    const calibration = human.prepareStep(0.25, { ...NEUTRAL });
    const motion = calibration.motionRequests.find(value => value.kind === 'move');
    if (!motion) throw new Error('calibration must produce a moving human candidate');
    const dx = motion.proposed.x - motion.previous.x, dz = motion.proposed.z - motion.previous.z;
    const travel = Math.hypot(dx, dz);
    if (travel < 1.6) throw new Error(`fixture needs a long candidate, got ${travel}`);
    const ux = dx / travel, uz = dz / travel;
    // The actor is clear at start and meets the human around the middle of its
    // real candidate.  The 0.05 m hull gives the static sampler a narrow,
    // intentional prefix target rather than a full-endpoint block.
    const actorX = motion.previous.x + ux * (travel * 0.5 + 0.76);
    const actorZ = motion.previous.z + uz * (travel * 0.5 + 0.76);
    const path: PopulationPath = {
      id: 'qa/prefix-target', role: 'pedestrian', district: 'park', closed: false, serviceShuttle: false,
      points: [-0.1, 0, 0.1].map((offset, index) => {
        const x = actorX + ux * offset, z = actorZ + uz * offset, ground = groundAt(x, z);
        return { x, y: ground.height, z, headingY: motion.previous.headingY, distanceMetres: index * 0.1,
          surface: ground.surface as SurfaceId, sourceSegmentId: 'qa/prefix-target' };
      }),
      lengthMetres: 0.2, clearanceRadiusMetres: 3, connections: [],
    };
    const actor: ActorSpec = { id: 'qa/static-prefix', kind: 'walker', pathId: path.id, initialDistanceMetres: 0.1,
      direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 1, appearanceIndex: 0,
      hull: { halfWidthMetres: 0.05, halfLengthMetres: 0.05, heightMetres: 1.8 } };
    const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'qa',
      installedWorldId: 'qa~living-r1', contentDigest: 'static-prefix', paths: [path], anchors: [], actors: [actor],
      report: { missingAuthoredPaths: false, rejected: [], availableKinds: ['walker'], missingKinds: [] } };
    const Simulation = internal.population.constructor as unknown as new (p: PopulationPlan, terrain: unknown) => PopulationSimulation;
    internal.populationPlan = plan; internal.population = new Simulation(plan, internal.terrain); internal.populationReservations = [];
    // Reset invalidates the calibration token and restores the exact candidate start.
    if (!human.reset({ position: { x: motion.previous.x, y: motion.previous.minY, z: motion.previous.z },
      headingY: motion.previous.headingY }, 8)) throw new Error('replay reset was blocked');
    internal.populationReservations = [];
    const rawSampler = (human as unknown as { sampler: { sampleGround(x: number, z: number, out: unknown): unknown;
      raycast(...args: unknown[]): unknown; raycastObstacle?: (...args: unknown[]) => unknown } }).sampler;
    const bandAt = travel * 0.5;
    const ordinaryGround = rawSampler.sampleGround.bind(rawSampler);
    rawSampler.sampleGround = (x: number, z: number, out: unknown) => {
        const result = ordinaryGround(x, z, out) as { height: number };
        const along = (x - motion.previous.x) * ux + (z - motion.previous.z) * uz;
        if (Math.abs(along - bandAt) < 0.12) result.height += 1;
        return result;
    };
    internal.step(0.25);
    const after = human.snapshot();
    const contacts = game.populationState().contacts as readonly PopulationContact[];
    return { travelled: Math.hypot(after.position.x - motion.previous.x, after.position.z - motion.previous.z),
      collisionImpact: after.collisionImpact, contacts: contacts.map(value => value.occupantId),
      actorZ: game.populationState().simulation.actors[0]!.z };
  }, NEUTRAL);

  expect(result.travelled, 'the statically invalid clipped prefix was committed then rolled back').toBeLessThan(1e-6);
  expect(result.collisionImpact, 'the rejected, unreachable prefix charged an NPC contact').toBe(0);
  expect(result.contacts).toEqual([]);
  expect(errors).toEqual([]);
});

test('Game keeps a crashed rider down while the population blocks recovery, then publishes one recovery reservation', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=slice&chaseprobe=1&cops=1');

  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const internal = game as unknown as Internals;
    const human = internal.seats[0]!.controller;
    internal.pursuers[0]?.controller.reset({ position: { x: 0, y: game.sampleGround(0, 12).height, z: 12 }, headingY: 0 });
    const ground = game.sampleGround(0, 0);
    if (!human.reset({ position: { x: 0, y: ground.height, z: 0 }, headingY: 0 })) throw new Error('recovery fixture reset failed');
    if (!human.hardKnock(1, 0)) throw new Error('fixture must crash the rider');
    game.tuning.set('EUC.crashRecoverAutoSeconds', 0.01);

    const makePlan = (x: number, id: string): PopulationPlan => {
      const samples = [-0.1, 0, 0.1].map((offset, index) => {
        const sample = game.sampleGround(x, offset);
        return { x, y: sample.height, z: offset, headingY: 0, distanceMetres: index * 0.1,
          surface: sample.surface as SurfaceId, sourceSegmentId: id };
      });
      const path: PopulationPath = { id, role: 'pedestrian', district: 'park', points: samples, lengthMetres: 0.2,
        closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] };
      const actor: ActorSpec = { id: `${id}/actor`, kind: 'walker', pathId: id, initialDistanceMetres: 0.1,
        direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 1, appearanceIndex: 0,
        hull: { halfWidthMetres: 0.45, halfLengthMetres: 0.45, heightMetres: 1.8 } };
      return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'qa', installedWorldId: 'qa~living-r1',
        contentDigest: id, paths: [path], anchors: [], actors: [actor],
        report: { missingAuthoredPaths: false, rejected: [], availableKinds: ['walker'], missingKinds: [] } };
    };
    const Simulation = internal.population.constructor as unknown as new (p: PopulationPlan, terrain: unknown) => PopulationSimulation;
    const blocked = makePlan(0, 'qa/recovery-blocked');
    internal.populationPlan = blocked; internal.population = new Simulation(blocked, internal.terrain); internal.populationReservations = [];
    const serial = human.discontinuitySerial;
    // Real fixed steps (2026-10-03): a 0.25 s step tumbles the rag further than
    // its frame certificate can prove and was itself the refusal. 0.2 s blocked
    // stays inside the recovery fallback's 0.5 s patience.
    for (let step = 0; step < 24; step += 1) internal.step(1 / 120);
    const owned = () => game.populationState().reservations.map(value => value.id)
      .filter(value => value.split('/')[0] === 'human-0');
    const blockedState = { crashed: human.crashed, serial: human.discontinuitySerial, reservations: owned() };

    const clear = makePlan(10, 'qa/recovery-clear');
    internal.populationPlan = clear; internal.population = new Simulation(clear, internal.terrain); internal.populationReservations = [];
    for (let step = 0; step < 240 && human.crashed; step += 1) internal.step(1 / 120);
    return { blockedState, initialSerial: serial, recovered: !human.crashed, finalSerial: human.discontinuitySerial,
      reservations: owned() };
  });

  expect(result.blockedState.crashed).toBe(true);
  expect(result.blockedState.serial).toBe(result.initialSerial);
  expect(result.blockedState.reservations).toEqual([]);
  expect(result.recovered).toBe(true);
  expect(result.finalSerial).toBeGreaterThan(result.initialSerial);
  expect([...result.reservations].sort()).toEqual(['human-0/human', 'human-0/wheel']);
  expect(errors).toEqual([]);
});
