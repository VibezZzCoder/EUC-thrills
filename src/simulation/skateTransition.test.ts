/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import type { Heightfield, LevelPlan } from '../level/plan.ts';
import { createLevel, type LevelId } from '../level/levels.ts';
import { SKATEPARK_WALL, createSkateparkLevel } from '../level/skateparkLevel.ts';
import { EucController, createPose } from './EucController.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { createGroundSample, type GroundSample, type TerrainSampler } from './world.ts';

/**
 * The skatepark transition rules are inert without their plan data — 1.4.0
 * (`docs/PLANS.md` §51.5.9, C2–C5). Every rule is switched on by
 * `Heightfield.transition` (read through the sampler's optional
 * `transitionAt`) or `LevelPlan.recovery` (`restartsAtRest`), which only
 * Foundry Yard emits; steepness alone never fires one, because the shipped
 * worlds already ride faces up to 86°. The ridden gates on the real yard are
 * `level/skateparkRide.test.ts`.
 */

const STEP = 1 / SIMULATION.hz;
const DEG = Math.PI / 180;

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/**
 * A T75 wall (the yard's own profile) rising +Z from z 20 to its coping, a
 * deck behind it, and one 0.45 m ledge on the floor at x 6: the faces, the
 * lip and the block every rule reads, on a plan with no flags.
 */
function wallPlan(): LevelPlan {
  const spacing = 0.25;
  const x0 = -10, x1 = 10, z0 = 0, z1 = 30;
  const columns = Math.round((x1 - x0) / spacing) + 1;
  const rows = Math.round((z1 - z0) / spacing) + 1;
  const heights: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) heights.push(SKATEPARK_WALL.rise(z0 + row * spacing - 20));
  }
  const heightfield: Heightfield = {
    originX: x0, originZ: z0, spacing, columns, rows, heights,
    surfaces: new Array((columns - 1) * (rows - 1)).fill('pavement'),
  };
  return {
    id: 'transition-probe', spawn: { position: { x: 0, y: 0, z: 10 }, headingY: 0 },
    surround: { height: 0, surface: 'pavement' }, heightfield,
    segments: [{
      id: 'probe', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 30 }, halfWidth: 10,
      colliders: [{ centre: { x: 6, y: 0.225, z: 10 }, halfExtents: { x: 0.45, y: 0.225, z: 4 }, rotationY: 0, surface: 'pavement' }],
    }],
    checkpoints: [],
  } as unknown as LevelPlan;
}

/** Every shaped cell flagged, as the producer flags a face; the ledge's floor too. */
function flagged(plan: LevelPlan): LevelPlan {
  const field = plan.heightfield;
  const transition: Record<number, true> = {};
  const cells = field.columns - 1;
  for (let row = 0; row < field.rows - 1; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const at = (r: number, c: number) => field.heights[r * field.columns + c];
      const corners = [at(row, column), at(row, column + 1), at(row + 1, column), at(row + 1, column + 1)];
      const x = field.originX + (column + 0.5) * field.spacing;
      const z = field.originZ + (row + 0.5) * field.spacing;
      const underLedge = Math.abs(x - 6) < 0.45 && Math.abs(z - 10) < 4;
      if (Math.max(...corners) - Math.min(...corners) > 1e-9 || underLedge) transition[row * cells + column] = true;
    }
  }
  return { ...plan, heightfield: { ...field, transition }, recovery: { speed: 'rest' } };
}

/** The plan sampler with its optional methods hidden: the double every headless suite builds. */
function bare(sampler: PlanTerrainSampler): TerrainSampler {
  return {
    sampleGround: (x: number, z: number, out: GroundSample) => sampler.sampleGround(x, z, out),
    raycast: (origin, direction, maxDistance) => sampler.raycast(origin, direction, maxDistance),
    raycastObstacle: (...args) => sampler.raycastObstacle(...args),
  };
}

function digest(controller: EucController): unknown {
  const pose = createPose();
  controller.writePose(pose);
  return {
    pose, snapshot: controller.snapshot(),
    facts: [controller.tookOff, controller.hopped, controller.touchedDown, controller.flightIndex,
      controller.spinCompleted, controller.lastLandingQuality, controller.crashed,
      controller.wallTurnCount, controller.comeBackAirCount, controller.inComeBackAir],
  };
}

/**
 * The scripted ride: up the wall at 9 m/s to its lip, a stall at 4 m/s, a
 * hop low on the face at 12 m/s, a crash on the face and its recovery, and a
 * run into the ledge. Each phase starts from a reset on the floor.
 */
const PHASES: readonly { speed: number; x: number; z: number; steps: number; input: (step: number, c: EucController) => ActionSnapshot }[] = [
  { speed: 9, x: 0, z: 15, steps: 360, input: () => actions() },
  { speed: 4, x: -3, z: 17, steps: 360, input: () => actions() },
  { speed: 12, x: 3, z: 15, steps: 300, input: (_s, c) => actions({ hop: c.snapshot().position.z > 20.3 && c.canAcceptHop }) },
  { speed: 7, x: -6, z: 15, steps: 720, input: (step, c) => {
    if (step === 0) return actions();
    const s = c.snapshot();
    if (!s.crashed && s.grounded && s.position.y > 0.6 && step < 200) c.hardKnock(0, 1);
    return actions();
  } },
  { speed: 8, x: 6, z: 2, steps: 300, input: () => actions() },
];

function rideAll(riders: EucController[], each: (step: number) => void): void {
  let global = 0;
  for (const phase of PHASES) {
    for (const rider of riders) assert.ok(rider.reset({ position: { x: phase.x, y: 0, z: phase.z }, headingY: 0 }, phase.speed));
    for (let step = 0; step < phase.steps; step += 1) {
      const input = phase.input(step, riders[0]);
      for (let index = 0; index < riders.length; index += 1) {
        // The crash phase knocks every rider at the same step the first one meets the face.
        if (index > 0 && phase.speed === 7 && riders[0].crashed && !riders[index].crashed && step < 200) riders[index].hardKnock(0, 1);
        riders[index].step(STEP, input);
      }
      each(global);
      global += 1;
    }
  }
}

test('absent, empty and hidden transition data ride bit-identically; flags and a recovery key are the only switch', () => {
  const base = wallPlan();
  const plain = new PlanTerrainSampler(base);
  const empty = new PlanTerrainSampler({ ...base, heightfield: { ...base.heightfield, transition: {} } });
  const rules = new PlanTerrainSampler(flagged(base));
  const tuning = { crashRecoverAutoSeconds: 1.0 };
  const riders = [plain, empty, bare(plain), bare(rules)].map((sampler) => new EucController(sampler, { tuning }));
  const control = new EucController(rules, { tuning });
  let differed = 0;
  rideAll([...riders, control], (step) => {
    const reference = digest(riders[0]);
    for (let index = 1; index < riders.length; index += 1) assert.deepEqual(digest(riders[index]), reference, `variant ${index} at step ${step}`);
    if (JSON.stringify(digest(control)) !== JSON.stringify(reference)) differed += 1;
  });
  for (const rider of riders) {
    assert.equal(rider.wallTurnCount, 0);
    assert.equal(rider.comeBackAirCount, 0);
  }
  // The control must fail the identity: with the flags present the rules fire.
  assert.ok(differed > 100, `the flagged control rode differently on ${differed} steps`);
  const fired = new EucController(rules, { tuning });
  let turns = 0, airs = 0;
  rideAll([fired], () => { turns = Math.max(turns, fired.wallTurnCount); airs = Math.max(airs, fired.comeBackAirCount); });
  assert.ok(turns > 0, 'the wall turn fired on the flagged wall');
  assert.ok(airs > 0, 'a come-back air fired on the flagged wall');
});

test('the shipped recovery restores speed; a recovery key restarts at rest', () => {
  const base = wallPlan();
  for (const [sampler, atRest] of [[new PlanTerrainSampler(base), false], [new PlanTerrainSampler(flagged(base)), true]] as const) {
    const rider = new EucController(sampler, { tuning: { crashSafeDelaySeconds: 0, crashRecoverAutoSeconds: 0.5 } });
    assert.ok(rider.reset({ position: { x: -3, y: 0, z: 2 }, headingY: 0 }, 8));
    for (let step = 0; step < 60; step += 1) rider.step(STEP, actions({ throttle: 0.3 }));
    rider.hardKnock(0, 1);
    let respawned = false;
    for (let step = 0; step < 240 && !respawned; step += 1) {
      rider.step(STEP, actions());
      respawned = !rider.crashed && rider.snapshot().state === 'recovering';
    }
    assert.ok(respawned);
    if (atRest) assert.equal(rider.snapshot().speed, 0);
    else assert.ok(rider.snapshot().speed > 1, `restored ${rider.snapshot().speed}`);
  }
});

test('transitionAt answers the cell sampleField interpolates in, and nothing without the map', () => {
  const base = wallPlan();
  const plain = new PlanTerrainSampler(base);
  const rules = new PlanTerrainSampler(flagged(base));
  assert.equal(plain.transitionAt(0, 21), false);
  assert.equal(plain.restartsAtRest(), false);
  assert.equal(rules.restartsAtRest(), true);
  assert.equal(rules.transitionAt(0, 21), true, 'on the face');
  assert.equal(rules.transitionAt(0, 10), false, 'on the floor');
  assert.equal(rules.transitionAt(6, 10), true, 'the floor under the ledge');
  assert.equal(rules.transitionAt(0, 29), false, 'on the deck');
  assert.equal(rules.transitionAt(50, 10), false, 'off the field');
  // A point on a grid line belongs to its +X/+Z cell: the foot's first shaped cell starts at z 20.
  assert.equal(rules.transitionAt(0, 20), true);
  assert.equal(rules.transitionAt(0, 19.999), false);
});

/** Up to `count` field points tilted past `minTilt` (rad), at least 6 m apart, with their uphill directions. */
function steepFaces(plan: LevelPlan, minTilt: number, count: number): { x: number; z: number; ux: number; uz: number }[] {
  const sampler = new PlanTerrainSampler(plan);
  const field = plan.heightfield;
  const ground = createGroundSample();
  const found: { x: number; z: number; ux: number; uz: number; tilt: number }[] = [];
  for (let row = 0; row < field.rows - 1; row += 2) {
    for (let column = 0; column < field.columns - 1; column += 2) {
      const x = field.originX + (column + 0.7) * field.spacing;
      const z = field.originZ + (row + 0.3) * field.spacing;
      sampler.sampleGround(x, z, ground);
      const tilt = Math.acos(Math.min(1, ground.normal.y));
      if (tilt < minTilt || ground.offCourse) continue;
      const across = Math.hypot(ground.normal.x, ground.normal.z);
      found.push({ x, z, ux: -ground.normal.x / across, uz: -ground.normal.z / across, tilt });
    }
  }
  found.sort((a, b) => b.tilt - a.tilt);
  const picked: typeof found = [];
  for (const face of found) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.hypot(p.x - face.x, p.z - face.z) > 6)) picked.push(face);
  }
  return picked;
}

test('steep shipped faces never fire a rule: slice, Switchback and EUClaude Heights, unflagged', () => {
  for (const id of ['slice', 'switchback', 'euclaude'] as LevelId[]) {
    const plan = createLevel(id);
    assert.equal(plan.heightfield.transition, undefined);
    assert.equal(plan.recovery, undefined);
    const sampler = new PlanTerrainSampler(plan);
    const faces = steepFaces(plan, (45 * Math.PI) / 180, 6);
    assert.ok(faces.length > 0, `${id} has steep faces to ride`);
    for (const face of faces) {
      assert.equal(sampler.transitionAt(face.x, face.z), false);
      for (const speed of [3, 9]) {
        const rider = new EucController(sampler, { tuning: { cutoutEnabled: 0 } });
        const heading = Math.atan2(face.ux, face.uz);
        if (!rider.reset({ position: { x: face.x - face.ux * 3, y: 0, z: face.z - face.uz * 3 }, headingY: heading }, speed)) continue;
        for (let step = 0; step < 240; step += 1) rider.step(STEP, actions({ hop: step === 30 && rider.canAcceptHop }));
        assert.equal(rider.wallTurnCount, 0, `${id} wall turn at (${face.x}, ${face.z})`);
        assert.equal(rider.comeBackAirCount, 0, `${id} come-back air at (${face.x}, ${face.z})`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// QA round 1 (1.4.0): the come-back's half turn and a 180, the wall turn's
// state across a hop, a crest, partial throttle, and a contact push.
// ---------------------------------------------------------------------------

/** Private state a pin reads; the controller exposes no getter for it. */
type Internals = { headingY: number; comeBackTurn: number; wallTurnSeconds: number };
const internals = (controller: EucController): Internals => controller as unknown as Internals;

test('QA CTRL-1: a 180 in an angled come-back air turns with the rule — a whole turn of yaw, paid once — lip and hop alike', () => {
  const rules = new PlanTerrainSampler(flagged(wallPlan()));
  let checked = 0;
  for (const path of ['lip', 'hop'] as const) for (const degrees of [-20, -10, -5, 5, 10, 20]) {
    for (const stick of [0, 1, -1]) {
      const subject = new EucController(rules, { tuning: { cutoutEnabled: 0 } });
      assert.ok(subject.reset({ position: { x: path === 'lip' ? 0 : 3, y: 0, z: 15 }, headingY: degrees * DEG }, path === 'lip' ? 9 : 12));
      let start = -1, previous = 0, travelled = 0, turned = false, spins = 0;
      for (let step = 0; step < 480; step += 1) {
        const s = subject.snapshot();
        const hop = path === 'hop' && start < 0 && s.position.z > 20.3 && subject.canAcceptHop;
        const tap = start >= 0 && step === start + 3;
        // The stick is held from the wall's foot on, through the climb and the air.
        subject.step(STEP, actions({ hop: hop || tap, steer: s.position.z > 19.5 || start >= 0 ? stick : 0 }));
        const heading = internals(subject).headingY;
        if (start < 0 && subject.inComeBackAir) {
          start = step;
          previous = heading;
          turned = internals(subject).comeBackTurn > 0;
        } else if (start >= 0 && subject.inComeBackAir) {
          travelled += Math.abs(heading - previous);
          previous = heading;
        }
        if (start >= 0 && subject.touchedDown) {
          if (subject.spinCompleted) spins += 1;
          break;
        }
      }
      const label = `${path} ${degrees}° stick ${stick}`;
      assert.ok(start >= 0, `${label}: no come-back air`);
      if (!turned || spins === 0) continue;
      checked += 1;
      assert.ok(travelled >= 1.9 * Math.PI, `${label}: ${(travelled / DEG).toFixed(0)}° of yaw for the rule's half turn and a paid 180`);
    }
  }
  assert.ok(checked >= 24, `only ${checked} turned come-backs spun a 180`);
});

test('QA CTRL-2: a hop ends a wall turn; a 180 landed fakie keeps its heading', () => {
  const rules = new PlanTerrainSampler(flagged(wallPlan()));
  const subject = new EucController(rules, { tuning: { cutoutEnabled: 0 } });
  assert.ok(subject.reset({ position: { x: -3, y: 0, z: 19 }, headingY: 0.3 }, 4));
  let turnAt = -1, takeoffAt = -1, touchdownAt = -1, touchdownHeading = 0, checked = false;
  for (let step = 0; step < 900; step += 1) {
    const press = (turnAt >= 0 && step === turnAt + 20) || (takeoffAt >= 0 && step === takeoffAt + 4);
    subject.step(STEP, actions({ hop: press }));
    if (turnAt < 0 && subject.wallTurnCount > 0) turnAt = step;
    if (takeoffAt < 0 && subject.tookOff) {
      takeoffAt = step;
      assert.equal(internals(subject).wallTurnSeconds, 0, 'the flight ended the wall turn');
    }
    if (takeoffAt >= 0 && touchdownAt < 0 && subject.touchedDown) {
      touchdownAt = step;
      touchdownHeading = internals(subject).headingY;
      assert.equal(subject.spinCompleted, true, 'the 180 was spun');
    }
    if (touchdownAt >= 0 && step === touchdownAt + 10) {
      assert.ok(Math.abs(internals(subject).headingY - touchdownHeading) < 1e-9,
        `heading moved ${((internals(subject).headingY - touchdownHeading) / DEG).toFixed(1)}° after the landing`);
      checked = true;
      break;
    }
  }
  assert.ok(turnAt >= 0 && takeoffAt >= 0 && checked, `turn ${turnAt}, takeoff ${takeoffAt}, touchdown ${touchdownAt}`);
});

test('QA CTRL-3: a slow climb rolling over the coping onto the deck keeps its heading', () => {
  const rules = new PlanTerrainSampler(flagged(wallPlan()));
  let reached = 0;
  for (let tenth = 46; tenth <= 54; tenth += 1) {
    const subject = new EucController(rules, { tuning: { cutoutEnabled: 0 } });
    assert.ok(subject.reset({ position: { x: 0, y: 0, z: 17 }, headingY: 0 }, tenth / 10));
    for (let step = 0; step < 480; step += 1) subject.step(STEP, actions());
    const s = subject.snapshot();
    if (s.position.z < 22.3) continue;
    reached += 1;
    assert.equal(internals(subject).headingY, 0, `${tenth / 10} m/s reached the deck yawed ${(internals(subject).headingY / DEG).toFixed(1)}°`);
  }
  assert.ok(reached >= 3, `only ${reached} runs crested`);
});

test('QA COUCH-2: a one-centimetre contact push at the coping never carries a climber over it', () => {
  // A one-step contact separation (1.2 m/s × 1/120 s) applied to a grounded
  // rider within that distance of the coping: refused, so the next move
  // reaches the lip and comes back in.
  const plan = createSkateparkLevel();
  const sampler = new PlanTerrainSampler(plan);
  let pushed = 0;
  for (const speed of [8, 12, 16, 20]) for (let offset = 0; offset < 0.2; offset += 0.004) {
    const subject = new EucController(sampler, { spawn: { position: { x: 150 + offset, y: 0, z: 124 }, headingY: Math.PI / 2 } });
    assert.ok(subject.reset(undefined, speed));
    let didPush = false, deck = false;
    for (let step = 0; step < 480; step += 1) {
      subject.step(STEP, actions({ throttle: 1 }));
      const s = subject.snapshot();
      if (!didPush && s.grounded && !subject.inComeBackAir && s.position.x >= 162.49 && s.position.x < 162.5) {
        subject.separate(0.01, 0);
        didPush = true;
      }
      if (s.grounded && s.position.x > 162.55 && s.position.y > 1.3) deck = true;
      assert.equal(s.crashed, false, `${speed} m/s from ${150 + offset}: crashed ${s.crashCause}`);
    }
    if (!didPush) continue;
    pushed += 1;
    assert.equal(deck, false, `${speed} m/s from ${150 + offset}: rode the deck`);
    assert.ok(subject.comeBackAirCount >= 1, `${speed} m/s from ${150 + offset}: no come-back`);
  }
  assert.ok(pushed >= 5, `only ${pushed} runs met the coping within a centimetre`);
});

test('QA R2-TR2: no brake holds a wheel still facing down a flagged face; unflagged, the shipped brake still does', () => {
  // Facing down the wall (−Z) on its 25–66° part, with a held brake, the
  // bench's 120 Hz settle (brake rolling forward, drive rolling back) and a
  // human one (decided at 10 Hz from a speed 150 ms old). The shipped brake
  // out-pulls any slope, and with the stop clamp it parked the wheel there
  // for good — a stand-still hop spot on the yard's quarter pipe (1,792 for
  // the QP-E pair). With the flags the face wins and the wheel reaches the
  // gentle foot; without them the bench's settle still parks (the control).
  const base = wallPlan();
  const probe = createGroundSample();
  const tiltAt = (sampler: PlanTerrainSampler, z: number): number => {
    sampler.sampleGround(0, z, probe);
    return Math.acos(probe.normal.y) / DEG;
  };
  const rules = new PlanTerrainSampler(flagged(base));
  const plain = new PlanTerrainSampler(base);
  const settles: Record<string, (speeds: readonly number[], step: number, last: number) => number> = {
    hold: () => -1,
    bench: (speeds) => {
      const v = speeds[speeds.length - 1];
      return v > 0.005 ? -1 : v < -0.005 ? 1 : 0;
    },
    human: (speeds, step, last) => {
      if (step % 12 !== 0) return last;
      const v = speeds[Math.max(0, speeds.length - 1 - 18)];
      return v > 0.05 ? -1 : v < -0.05 ? 1 : 0;
    },
  };
  let starts = 0, controls = 0;
  for (let z = 21.3; z <= 22.2; z += 0.15) {
    const tilt = tiltAt(rules, z);
    if (tilt < 25) continue;
    starts += 1;
    for (const [name, settle] of Object.entries(settles)) {
      for (const [sampler, isFlagged] of [[rules, true], [plain, false]] as const) {
        const subject = new EucController(sampler, { tuning: { cutoutEnabled: 0 } });
        assert.ok(subject.reset({ position: { x: 0, y: 0, z }, headingY: Math.PI }, 0));
        const speeds: number[] = [];
        let throttle = 0, still = 0, longest = 0;
        for (let step = 0; step < 600; step += 1) {
          const s = subject.snapshot();
          speeds.push(s.speed);
          throttle = settle(speeds, step, throttle);
          subject.step(STEP, actions({ throttle }));
          const after = subject.snapshot();
          const onFace = after.grounded && tiltAt(sampler, after.position.z) >= 20;
          still = onFace && Math.abs(after.speed) < 0.005 ? still + 1 : 0;
          longest = Math.max(longest, still);
        }
        const label = `${name} from z ${z.toFixed(1)} (${tilt.toFixed(0)}°), ${isFlagged ? 'flagged' : 'unflagged'}`;
        if (isFlagged) {
          assert.ok(longest < 30, `${label}: still on the face for ${longest} steps`);
          // A brake held into reverse backs the wheel to the first face cell
          // and no further (the brake there is the face's): the foot, < 25°.
          assert.ok(tiltAt(sampler, subject.snapshot().position.z) < 25, `${label}: ended up the face`);
          assert.equal(subject.snapshot().crashed, false, label);
        } else if (name === 'bench' && tilt >= 40) {
          controls += 1;
          const end = subject.snapshot().position.z;
          assert.ok(tiltAt(sampler, end) >= 25, `${label}: the shipped brake let the wheel go to z ${end.toFixed(2)}`);
        }
      }
    }
  }
  assert.ok(starts >= 5 && controls >= 3, `only ${starts} starts on the face, ${controls} controls`);
});
