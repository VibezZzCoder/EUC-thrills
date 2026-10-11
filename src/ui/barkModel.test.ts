/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BARKS } from '../data/tuning.ts';
import { BARK_LINES, BarkModel, BarkRoom, type BarkActor, type BarkFrame } from './barkModel.ts';

/**
 * The question barks' model, on synthetic frames. The rider sits at the
 * origin facing +Z unless a case moves it; people are placed by (lateral,
 * ahead) and face the rider unless a case turns them. The view's verdict is
 * the test's to give: `seen` (the candidate qualified) and `inBand` (the
 * bubble's anchor is still in the display band) default to true.
 */

const FRAME = 1 / 60;

function person(id: string, x: number, z: number, patch: Partial<BarkActor> = {}): BarkActor {
  // Facing the rider at the origin by default.
  const headingY = Math.atan2(-x, -z);
  return { id, kind: 'social', x, y: 0, z, headingY, speedMetresPerSecond: 0, activity: 'social', ...patch };
}

class Rig {
  readonly room: BarkRoom;
  readonly model: BarkModel;
  readonly controller = {};
  readonly world = {};
  readonly frame: BarkFrame;
  seen = true;
  inBand = true;
  /** Every bubble start, in order: [clock, line, actorId]. */
  readonly starts: [number, number, string][] = [];
  clock = 0;
  private wasVisible = false;
  private lastActor: string | null = null;

  constructor(room = new BarkRoom(), seat = 0) {
    this.room = room;
    this.model = new BarkModel(seat);
    this.frame = {
      dt: 0, controller: this.controller, world: this.world, x: 0, z: 0, headingY: 0, speed: 5,
      crashed: false, airborne: false, discontinuitySerial: 1, modeAllows: true, quiet: false,
      previous: [], current: [], alpha: 1,
    };
  }

  people(actors: BarkActor[]): this {
    this.frame.previous = actors;
    this.frame.current = actors;
    return this;
  }

  /** One drawn frame. */
  step(dt = FRAME, patch: Partial<BarkFrame> = {}): BarkModel {
    Object.assign(this.frame, patch);
    this.frame.dt = dt;
    this.clock += dt;
    this.model.update(this.frame);
    const output = this.model.output;
    const pending = output.pending;
    this.model.reportView(pending === null || output.visible ? null : this.seen,
      output.visible ? this.inBand : null, this.room);
    // A start is a bubble appearing, or a different person's bubble replacing
    // one that ended this same frame.
    if (output.visible && (!this.wasVisible || output.actorId !== this.lastActor)) {
      this.starts.push([this.clock, output.lineIndex, output.actorId!]);
    }
    this.wasVisible = output.visible;
    this.lastActor = output.actorId;
    return this.model;
  }

  /** Several seconds of frames. */
  run(seconds: number, patch: Partial<BarkFrame> = {}): this {
    const frames = Math.round(seconds / FRAME);
    for (let i = 0; i < frames; i += 1) this.step(FRAME, patch);
    return this;
  }

  /** Ride the ridden-first distance with nobody about, then stand still in place. */
  rideIn(): this {
    const saved = this.frame.current;
    this.people([]);
    this.run(5, { speed: 5 });
    this.frame.previous = saved;
    this.frame.current = saved;
    return this;
  }

  get visible(): boolean {
    return this.model.output.visible;
  }
}

/** A rider that has ridden in, riding at `speed`, with one person at (x, z), chance forced. */
function passRig(x: number, z: number, speed = 5, patch: Partial<BarkActor> = {}): Rig {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn();
  rig.people([person('p', x, z, patch)]);
  rig.step(FRAME, { speed });
  return rig;
}

/**
 * A rig whose first roll on person `id` fails. The shipped chances are 1
 * since owner round 2, so no id fails naturally; the room's test hook
 * declines that one roll and is then switched off.
 */
function declinedRig(id: string): Rig {
  const rig = new Rig();
  rig.rideIn().people([person(id, 0, 10)]);
  rig.room.forceDecline = true;
  rig.step();
  rig.room.forceDecline = false;
  return rig;
}

test('exactly the nine lines, in the owner\'s and the thread\'s words', () => {
  assert.deepEqual([...BARK_LINES], [
    'How fast does it go?',
    'How much was it?',
    'Can I try?',
    'Did you make it?',
    'What is that called?',
    'Is it difficult to ride?',
    "I'd hurt myself on that thing.",
    'Are you from the future?',
    'How long did it take to learn?',
  ]);
});

const [AHEAD_MIN, AHEAD_MAX] = BARKS.passAheadMetres;
const LATERAL = BARKS.passLateralMetres;

test(`the look-ahead box: ${AHEAD_MIN} to ${AHEAD_MAX} m ahead, at most ${LATERAL} m to the side`, () => {
  assert.deepEqual([AHEAD_MIN, AHEAD_MAX, LATERAL], [8, 28, 9], 'owner round 2: met earlier, and wider');
  assert.equal(passRig(0, AHEAD_MIN - 0.1).visible, false, 'just short of the near edge');
  assert.equal(passRig(0, AHEAD_MIN).visible, true, 'the near edge');
  assert.equal(passRig(0, AHEAD_MAX).visible, true, 'the far edge');
  assert.equal(passRig(0, AHEAD_MAX + 0.1).visible, false, 'past the far edge');
  assert.equal(passRig(LATERAL, 12).visible, true, 'at the side limit');
  assert.equal(passRig(LATERAL + 0.1, 12).visible, false, 'past the side limit');
  assert.equal(passRig(-LATERAL, 12).visible, true, 'at the other side limit');
  assert.equal(passRig(0, -10).visible, false, 'behind');
});

test('the person must not be walking away: side-on counts, only clearly turned away is skipped', () => {
  // The person stands 10 m ahead; heading π faces the rider, 0 faces away.
  assert.equal(passRig(0, 10, 5, { headingY: 0 }).visible, false, 'facing straight away');
  assert.equal(passRig(0, 10, 5, { headingY: Math.PI / 4 }).visible, false, '135° off the rider: clearly walking away');
  assert.equal(passRig(0, 10, 5, { headingY: Math.PI / 3 }).visible, true, '120° off: turned, but not walking away');
  assert.equal(passRig(0, 10, 5, { headingY: Math.PI / 2 }).visible, true, 'side-on counts (owner round 2)');
  assert.equal(passRig(0, 10, 5, { headingY: Math.PI * 0.75 }).visible, true, 'three-quarters toward');
});

test('the pass speed cap, and a pass is a moving rider', () => {
  assert.equal(passRig(0, 10, BARKS.passMaximumSpeed).visible, true, 'at the cap');
  assert.equal(passRig(0, 10, BARKS.passMaximumSpeed + 0.1).visible, false, 'over the cap');
  assert.equal(passRig(0, 10, -5).visible, true, 'reverse counts by magnitude');
  assert.equal(passRig(0, 10, 0.5).visible, false, 'a stopped rider does not "pass"');
});

test('only people, and never an impacted one', () => {
  for (const kind of ['walker', 'jogger', 'social', 'worker'] as const) {
    assert.equal(passRig(0, 10, 5, { kind }).visible, true, kind);
  }
  for (const kind of ['fictionalEuc', 'parkedVehicle', 'serviceVehicle', 'trafficVehicle'] as const) {
    assert.equal(passRig(0, 10, 5, { kind }).visible, false, kind);
  }
  assert.equal(passRig(0, 10, 5, { activity: 'impacted' }).visible, false, 'impacted');
});

test('never crashed, airborne or straight after a crash', () => {
  const crashed = new Rig();
  crashed.room.forceChance = true;
  crashed.rideIn().people([person('p', 0, 10)]);
  crashed.run(1, { crashed: true });
  assert.equal(crashed.visible, false, 'crashed');
  crashed.run(BARKS.recoveryQuietSeconds - 0.2, { crashed: false });
  assert.equal(crashed.visible, false, 'inside the recovery quiet');
  crashed.run(0.4);
  assert.equal(crashed.visible, true, 'after the recovery quiet');

  const airborne = new Rig();
  airborne.room.forceChance = true;
  airborne.rideIn().people([person('p', 0, 10)]);
  airborne.run(1, { airborne: true });
  assert.equal(airborne.visible, false, 'airborne');
  airborne.step(FRAME, { airborne: false });
  assert.equal(airborne.visible, true, 'landed');
});

test('a spectating seat, or any mode that refuses barks, gets none; a placement meanwhile still counts', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('p', 0, 10)]);
  rig.run(1, { modeAllows: false });
  assert.equal(rig.visible, false);
  assert.ok(rig.model.riddenMetres >= BARKS.minimumRiddenMetres, 'mode-off suspends: the ridden distance is kept');
  assert.equal(rig.model.output.pending, null, 'nothing is offered while suspended');

  // Respawned while spectating: the first frame back sees the new serial.
  const placed = new Rig();
  placed.room.forceChance = true;
  placed.rideIn().people([person('p', 0, 10)]);
  placed.run(1, { modeAllows: false, discontinuitySerial: 2 });
  placed.step(FRAME, { modeAllows: true });
  assert.equal(placed.visible, false, 'it has to ride its 20 m again');
  assert.ok(placed.model.riddenMetres < 1);
});

test('a pause keeps every clock: no cooldown, memory or encounter is cleared by it', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('m', 0, 10)]);
  rig.step();
  assert.equal(rig.starts.length, 1);
  const firstLine = rig.starts[0][1];
  rig.run(BARKS.lifetimeSeconds + BARKS.fadeSeconds + 0.1, { speed: 0 });
  assert.equal(rig.visible, false, 'the first bubble is over');
  // One paused frame, then ride on and meet the same person, then another.
  rig.step(FRAME, { modeAllows: false });
  rig.people([person('m', 0, 10)]).run(4, { modeAllows: true, speed: 5 });
  assert.equal(rig.starts.length, 1, 'the same person does not ask again after a pause');
  rig.people([person('n', 1, 12)]).run(4, { speed: 5 });
  assert.equal(rig.starts.length, 1, 'the seat cooldown survives the pause');
  rig.run(BARKS.seatCooldownSeconds, { speed: 5 });
  assert.equal(rig.starts.length, 2, 'after the cooldown, somebody else may ask');
  assert.notEqual(rig.starts[1][1], firstLine);

  // A bubble on screen when the pause comes ends at once — and, shown under
  // 0.8 s, refunds the cooldown as any short bubble does.
  const paused = passRig(0, 10);
  assert.equal(paused.visible, true);
  paused.step(FRAME, { modeAllows: false });
  assert.equal(paused.visible, false, 'the pause ends the bubble');
  assert.equal(paused.room.lastLine, -1, 'shown under 0.8 s: the room line is given back');

  // A pause never buys a second roll: the decline and the rolled encounter
  // survive it (the old full reset forgot both).
  const fishing = declinedRig('f');
  assert.equal(fishing.visible, false, 'the roll fails');
  fishing.room.forceChance = true;
  for (let i = 0; i < 20; i += 1) {
    fishing.step(FRAME, { modeAllows: false });
    fishing.run(0.5, { modeAllows: true });
  }
  assert.equal(fishing.starts.length, 0, 'pausing and resuming does not fish for a new roll');

  // …while a candidate not yet seen simply carries on after the pause.
  const carried = new Rig();
  carried.room.forceChance = true;
  carried.seen = false;
  carried.rideIn().people([person('w', 0, 12)]);
  carried.run(0.5, { speed: 2 });
  carried.run(3, { modeAllows: false });
  carried.seen = true;
  carried.step(FRAME, { modeAllows: true, speed: 2 });
  assert.equal(carried.visible, true, 'the open encounter rolls once it is seen');
  assert.equal(carried.model.encounterCount, 1, 'the same encounter, not a new one');
});

test('the ridden-first rule, and a placement zeroes it', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.people([person('p', 0, 10)]);
  // 19 m at 5 m/s: not yet.
  rig.run(3.8, { speed: 5 });
  assert.equal(rig.visible, false, 'under 20 m ridden');
  rig.run(0.4, { speed: 5 });
  assert.equal(rig.visible, true, 'past 20 m');

  const placed = new Rig();
  placed.room.forceChance = true;
  placed.rideIn();
  assert.ok(placed.model.riddenMetres >= BARKS.minimumRiddenMetres);
  placed.people([person('p', 0, 10)]);
  placed.step(FRAME, { discontinuitySerial: 2 });
  assert.equal(placed.visible, false, 'a placement zeroes the ridden distance');
  assert.ok(placed.model.riddenMetres < 1);
});

test('a different controller or world object resets the model', () => {
  const rig = new Rig();
  rig.rideIn();
  assert.ok(rig.model.riddenMetres > 20);
  rig.step(FRAME, { controller: {} });
  assert.ok(rig.model.riddenMetres < 1, 'new controller');
  rig.rideIn();
  rig.step(FRAME, { world: {} });
  assert.ok(rig.model.riddenMetres < 1, 'new world');
});

test(`the encounter edge: a second of ineligibility, or leaving the box by ${BARKS.encounterExitMarginMetres} m`, () => {
  const rig = new Rig();
  rig.seen = false; // never qualifies, so nothing is rolled and the edge is all we watch
  rig.rideIn();
  const facing = person('p', 0, 10);
  const away = person('p', 0, 10, { headingY: 0 });
  rig.people([facing]).step();
  assert.equal(rig.model.encounterCount, 1);
  rig.people([away]).run(0.5);
  rig.people([facing]).step();
  assert.equal(rig.model.encounterCount, 1, 'half a second away is the same encounter');
  rig.people([away]).run(1.1);
  rig.people([facing]).step();
  assert.equal(rig.model.encounterCount, 2, 'over a second away is a new one');
  // Out past the box's far edge by less than the margin, and back.
  const margin = BARKS.encounterExitMarginMetres;
  rig.people([person('p', 0, AHEAD_MAX + margin - 0.5)]).run(0.2);
  rig.people([facing]).step();
  assert.equal(rig.model.encounterCount, 2, 'inside the margin is the same encounter');
  rig.people([person('p', 0, AHEAD_MAX + margin + 0.5)]).run(0.2);
  rig.people([facing]).step();
  assert.equal(rig.model.encounterCount, 3, 'past the margin is a new one');
});

test('the view decides the roll: unseen candidates cost nothing', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.seen = false;
  rig.rideIn().people([person('p', 0, 10), person('q', 2, 12)]);
  rig.run(3);
  assert.equal(rig.visible, false, 'never rolled while unseen');
  assert.ok(rig.model.output.pending !== null, 'still a candidate');
  rig.seen = true;
  rig.step();
  assert.equal(rig.visible, true, 'the first seen frame rolls, with no cooldown spent before it');
});

test('one roll per encounter, and a failed roll is remembered for 30 s', () => {
  const rig = declinedRig('d');
  assert.equal(rig.visible, false, 'the roll fails');
  rig.room.forceChance = true;
  rig.run(BARKS.declineMemorySeconds - 0.5);
  assert.equal(rig.visible, false, 'no second roll inside the decline memory, chance forced or not');
  rig.run(1);
  assert.equal(rig.visible, true, 'a new encounter after the memory rolls again');
});

test('a stop barks once per stop and re-arms by moving 8 m or passing 2 m/s', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('a', 1, 2.5), person('b', -1.5, 2.5)]);
  rig.run(BARKS.stopDwellSeconds - 0.1, { speed: 0 });
  assert.equal(rig.visible, false, 'not before the dwell');
  rig.run(0.2, { speed: 0 });
  assert.equal(rig.visible, true, 'after the dwell');
  // Parked for two cooldowns: nobody else in the group gets a turn.
  rig.run(2 * BARKS.seatCooldownSeconds, { speed: 0 });
  assert.equal(rig.starts.length, 1, 'one bubble per stop');
  // A roll forward and back at 2.5 m/s re-arms it.
  rig.step(FRAME, { speed: BARKS.stopRearmSpeed + 0.5 });
  rig.run(1, { speed: 0 });
  assert.equal(rig.starts.length, 2, 're-armed by speed');
  rig.run(BARKS.seatCooldownSeconds + 1, { speed: 0 });
  assert.equal(rig.starts.length, 2);
  // Moving 8 m at a crawl re-arms it too.
  rig.step(FRAME, { speed: 0, z: BARKS.stopRearmMetres });
  rig.people([person('c', 1, BARKS.stopRearmMetres + 2.5)]);
  rig.run(1, { speed: 0, z: BARKS.stopRearmMetres });
  assert.equal(rig.starts.length, 3, 're-armed by distance');
});

test('a shown bubble that leaves the display band fades and ends, never to return', () => {
  const rig = passRig(0, 10);
  rig.run(1.0);
  assert.equal(rig.visible, true);
  rig.inBand = false;
  rig.step();
  assert.equal(rig.model.output.leaving, true);
  rig.inBand = true;
  rig.run(BARKS.fadeSeconds - 0.05);
  assert.equal(rig.visible, true, 'fading');
  assert.ok(rig.model.output.opacity < 1);
  rig.run(0.1);
  assert.equal(rig.visible, false, 'ended');
  rig.run(5);
  assert.equal(rig.visible, false, 'never shown again');
  assert.equal(rig.starts.length, 1);
});

/** A rider stopped at the origin with one walker at (x, z) facing it, chance forced: the stop bubble is up. */
function stopRig(x: number, z: number): Rig {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('w', x, z, { kind: 'walker', activity: 'walking' })]);
  rig.run(BARKS.stopDwellSeconds + 0.1, { speed: 0 });
  assert.equal(rig.visible, true, 'the stop bubble is up');
  return rig;
}

test('the asker turns away or walks off: the bubble fades and ends (critic-people r3 N1), once it has been read', () => {
  // Turns back, the way a walker answers a rider parked in their path: 4 rad/s
  // from facing the rider (π) round to facing away (0). They stop facing it
  // past `facingDot` (heading under acos(−facingDot)) about 1.2 s into the
  // bubble — before it has been read, the owner's "he turned his back" — so
  // it holds full opacity to `minimumReadableSeconds`, then the fade starts
  // within 0.1 s and is gone a fade later.
  const turn = stopRig(0, 3);
  const startedAt = turn.starts[0][0];
  turn.run(0.5, { speed: 0 });
  const awayBelow = Math.acos(-BARKS.facingDot);
  let heading = Math.PI;
  let crossedAt = -1;
  let leftAt = -1;
  let goneAt = -1;
  for (let i = 0; i < 300 && goneAt < 0; i += 1) {
    heading = Math.max(0, heading - 4 * FRAME);
    if (crossedAt < 0 && heading <= awayBelow) crossedAt = turn.clock + FRAME;
    turn.people([person('w', 0, 3, { kind: 'walker', activity: 'walking', headingY: heading })]).step(FRAME, { speed: 0 });
    if (leftAt < 0 && turn.model.output.leaving) leftAt = turn.clock;
    if (leftAt < 0 && turn.visible) assert.equal(turn.model.output.opacity, 1, 'full opacity until it leaves');
    if (!turn.visible) goneAt = turn.clock;
  }
  assert.ok(crossedAt > 0 && leftAt > 0, `it began to leave (crossed ${crossedAt.toFixed(3)}, left ${leftAt.toFixed(3)})`);
  const readBy = startedAt + BARKS.minimumReadableSeconds;
  assert.ok(crossedAt < readBy - 0.5, `the asker turned away ${(crossedAt - startedAt).toFixed(2)} s in, before it was read`);
  assert.ok(leftAt >= readBy - FRAME / 2, `the fade began ${(leftAt - startedAt).toFixed(3)} s in, before the readable minimum`);
  assert.ok(leftAt - readBy <= 0.1, `the fade began ${(leftAt - readBy).toFixed(3)} s after the readable minimum`);
  assert.ok(goneAt > 0 && goneAt - leftAt <= BARKS.fadeSeconds + 2 * FRAME, `gone ${(goneAt - leftAt).toFixed(3)} s after`);
  turn.people([person('w', 0, 3, { kind: 'walker', activity: 'walking', headingY: Math.PI })]).run(5, { speed: 0 });
  assert.equal(turn.starts.length, 1, 'never shown again, even facing the rider once more');

  // Walks off: a walker crossing the parked rider's front at 1.4 m/s, never
  // turning, after the bubble has been read. Past the rider's shoulder, where
  // they no longer face it by `facingDot` (x = 3·k/√(1 − k²), k = −facingDot),
  // the bubble begins to leave.
  const cross = stopRig(-1.5, 3);
  const crossStart = cross.starts[0][0];
  const k = -BARKS.facingDot;
  const pastShoulder = (3 * k) / Math.sqrt(1 - k * k);
  let x = cross.frame.current[0].x;
  let ended = -1;
  let endedAt = -1;
  for (let i = 0; i < 300 && ended < 0; i += 1) {
    x += 1.4 * FRAME;
    cross.people([person('w', x, 3, { kind: 'walker', activity: 'walking', headingY: Math.PI / 2, speedMetresPerSecond: 1.4 })])
      .step(FRAME, { speed: 0 });
    if (cross.model.output.leaving || !cross.visible) {
      ended = x;
      endedAt = cross.clock;
    }
  }
  assert.ok(endedAt - crossStart >= BARKS.minimumReadableSeconds, `ended ${(endedAt - crossStart).toFixed(2)} s in`);
  assert.ok(endedAt - crossStart < BARKS.lifetimeSeconds, 'by the walk-off, not the end of its life');
  assert.ok(ended >= pastShoulder && ended <= pastShoulder + 0.1,
    `the walker had walked to x = ${ended.toFixed(2)} m when the bubble began to leave (shoulder line ${pastShoulder.toFixed(2)} m)`);

  // Controls: an asker who keeps facing the rider keeps the full life, and so
  // does one the rider rides on past (their face is still to the camera; the
  // display band, not the facing test, ends a pass).
  const stays = stopRig(0, 3);
  stays.run(BARKS.lifetimeSeconds - 0.2, { speed: 0 });
  assert.equal(stays.model.output.opacity, 1, 'facing the rider: full opacity through its life');
  assert.equal(stays.model.output.leaving, false);
  const past = passRig(2, 12, 7);
  let z = 0;
  for (let i = 0; i < Math.round((BARKS.lifetimeSeconds - 0.1) / FRAME); i += 1) {
    z += 7 * FRAME;
    past.step(FRAME, { speed: 7, z });
  }
  assert.ok(z > 14, `the rider rode on past the asker (z = ${z.toFixed(1)} m)`);
  assert.equal(past.model.output.leaving, false, 'riding on past an asker does not turn them away');
  assert.equal(past.model.output.opacity, 1);
});

test('a fade never brightens: leaving the band, or the siren, during the end-of-life fade carries on down', () => {
  // DESIGN §9: cues never strobe. A pass leaving the display band near the
  // end of its life lands inside the natural fade, so this is the common case.
  const cases: [string, (rig: Rig) => void][] = [
    ['leaves the band', (rig) => { rig.inBand = false; rig.step(); rig.inBand = true; }],
    ['the siren', (rig) => rig.step(FRAME, { quiet: true })],
    ['knocked down', (rig) => rig.people([person('p', 0, 10, { activity: 'impacted' })]).step()],
    ['the rider crashes', (rig) => rig.step(FRAME, { crashed: true })],
  ];
  for (const [label, leave] of cases) {
    for (const at of [1.0, BARKS.lifetimeSeconds + 0.1, BARKS.lifetimeSeconds + 0.2]) {
      const rig = passRig(0, 10);
      const opacities: number[] = [];
      rig.run(at);
      opacities.push(rig.model.output.opacity);
      leave(rig);
      assert.equal(rig.model.output.leaving || !rig.visible, true, `${label} at ${at} s: it leaves`);
      while (rig.visible) {
        opacities.push(rig.model.output.opacity);
        rig.step(FRAME, { quiet: label === 'the siren', crashed: label === 'the rider crashes' });
      }
      for (let i = 1; i < opacities.length; i += 1) {
        assert.ok(opacities[i] <= opacities[i - 1] + 1e-9,
          `${label} at ${at} s: opacity rose from ${opacities[i - 1].toFixed(3)} to ${opacities[i].toFixed(3)}`);
      }
      // It ends no later than a full fade from where it began to leave.
      assert.ok(opacities.length <= Math.ceil(BARKS.fadeSeconds / FRAME) + 3, `${label} at ${at} s: ${opacities.length} frames`);
    }
  }
});

test('a person knocked down mid-question: the bubble fades, and under 0.8 s it refunds', () => {
  const late = passRig(0, 10);
  late.run(1.0);
  late.people([person('p', 0, 10, { activity: 'impacted' })]).step();
  assert.equal(late.model.output.leaving, true, 'no bark rides a hit');
  late.run(BARKS.fadeSeconds + 0.05);
  assert.equal(late.visible, false);
  assert.notEqual(late.room.lastLine, -1, 'shown a second: it counted');

  const early = passRig(0, 10);
  early.run(0.3);
  early.people([person('p', 0, 10, { activity: 'impacted' })]).run(BARKS.fadeSeconds + 0.05);
  assert.equal(early.visible, false);
  assert.equal(early.room.lastLine, -1, 'shown under 0.8 s: the room line is given back');
  early.people([person('q', 1, 12)]).step();
  assert.equal(early.visible, true, 'and the seat cooldown with it');
});

test('the asked rider crashes mid-question: the bubble fades, and under 0.8 s it refunds', () => {
  // PLANS §42.2h "never while the seat is crashed" covers a bubble already up.
  const late = passRig(0, 10);
  late.run(1.0);
  late.step(FRAME, { crashed: true });
  assert.equal(late.model.output.leaving, true, 'no bark rides a wipe-out');
  late.run(BARKS.fadeSeconds + 0.05, { crashed: true });
  assert.equal(late.visible, false, 'gone within one fade');
  assert.notEqual(late.room.lastLine, -1, 'shown a second: it counted');

  const early = passRig(0, 10);
  early.run(0.3);
  early.run(BARKS.fadeSeconds + 0.05, { crashed: true });
  assert.equal(early.visible, false);
  assert.equal(early.room.lastLine, -1, 'shown under 0.8 s: the room line is given back');
  // Back up after the recovery quiet, the seat may ask again at once.
  early.run(BARKS.recoveryQuietSeconds + 0.1, { crashed: false });
  early.people([person('q', 1, 12)]).step();
  assert.equal(early.visible, true, 'and the seat cooldown with it');
});

test('a candidate behind a wall sits out a short hold between rays', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('p', 0, 10)]);
  // The test is the view: every frame the candidate is offered counts a ray,
  // and the ray always hits.
  let rays = 0;
  const frames = Math.round(2 / FRAME);
  for (let i = 0; i < frames; i += 1) {
    rig.frame.dt = FRAME;
    rig.model.update(rig.frame);
    const pending = rig.model.output.pending;
    if (pending !== null) rays += 1;
    rig.model.reportView(pending === null ? null : false, null, rig.room, pending !== null);
  }
  const expected = 2 / BARKS.occlusionHoldSeconds;
  assert.ok(rays >= expected - 1 && rays <= expected + 1, `${rays} rays in 2 s, about ${expected} expected`);
  assert.equal(rig.visible, false);
  // Once the wall is gone, the next offer qualifies and rolls.
  rig.run(BARKS.occlusionHoldSeconds + FRAME);
  assert.equal(rig.visible, true);
  assert.equal(rig.model.encounterCount, 1, 'the hold never closed the encounter');

  // A candidate merely outside the start band (no ray cast) is offered every frame.
  const outside = new Rig();
  outside.room.forceChance = true;
  outside.seen = false;
  outside.rideIn().people([person('p', 0, 10)]);
  let offers = 0;
  for (let i = 0; i < 60; i += 1) {
    outside.step();
    if (outside.model.output.pending !== null) offers += 1;
  }
  assert.equal(offers, 60);
});

test('a bubble shown under 0.8 s refunds the cooldown and leaves the last line alone', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('p', 0, 10)]);
  rig.step();
  assert.equal(rig.visible, true);
  rig.run(0.4);
  rig.inBand = false;
  rig.step();
  rig.inBand = true;
  rig.run(BARKS.fadeSeconds + 0.1);
  assert.equal(rig.visible, false);
  assert.equal(rig.room.lastLine, -1, 'the room line was given back');
  // Cooldown refunded: a second person barks at once.
  rig.people([person('q', 1, 12)]);
  rig.step();
  assert.equal(rig.visible, true, 'no cooldown spent');

  // Shown long enough, it counts.
  const counted = passRig(0, 10);
  counted.run(1.0);
  counted.inBand = false;
  counted.step();
  counted.inBand = true;
  counted.run(BARKS.fadeSeconds + 0.1);
  assert.notEqual(counted.room.lastLine, -1);
  counted.people([person('q', 1, 12)]);
  counted.run(5);
  assert.equal(counted.visible, false, 'the cooldown holds');
});

test('quiet suppresses new bubbles and ends a shown one', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('p', 0, 10)]);
  rig.run(2, { quiet: true });
  assert.equal(rig.visible, false, 'quiet: nothing starts');
  rig.step(FRAME, { quiet: false });
  assert.equal(rig.visible, true);
  rig.run(1.2, { quiet: false });
  rig.step(FRAME, { quiet: true });
  assert.equal(rig.model.output.leaving, true, 'the siren ends it');
  rig.run(BARKS.fadeSeconds + 0.05, { quiet: true });
  assert.equal(rig.visible, false);
  assert.ok(rig.model.riddenMetres > 20, 'quiet is not a reset');
});

test(`the seat cooldown is ${BARKS.seatCooldownSeconds} s and a person stays quiet for ${BARKS.personMemorySeconds} s`, () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('a', 0, 10)]);
  rig.step();
  assert.equal(rig.starts.length, 1);
  rig.people([person('a', 0, 10), person('b', 1, 12)]);
  rig.run(BARKS.seatCooldownSeconds - 0.5);
  assert.equal(rig.starts.length, 1, 'inside the seat cooldown');
  rig.run(1);
  assert.equal(rig.starts.length, 2, 'after it');
  // Person a again: still inside its memory after the next cooldown.
  rig.people([person('a', 0, 10)]);
  rig.run(BARKS.seatCooldownSeconds + 1);
  assert.equal(rig.starts.length, 2, 'a is remembered');
  rig.run(BARKS.personMemorySeconds - 2 * BARKS.seatCooldownSeconds);
  assert.equal(rig.starts.length, 3, 'a may ask again once its memory lapses');
});

test('never the same line twice in a row, per seat and across a room', () => {
  const room = new BarkRoom();
  room.forceChance = true;
  const a = new Rig(room, 0);
  const b = new Rig(room, 1);
  a.rideIn();
  b.rideIn();
  const roomLines: number[] = [];
  let lastA = a.starts.length;
  let lastB = b.starts.length;
  for (let i = 0; i < 80; i += 1) {
    // A fresh person for each encounter, after each cooldown.
    a.people([person(`a${i}`, 1, 10)]);
    b.people([person(`b${i}`, -1, 12)]);
    for (let f = 0; f < Math.round((BARKS.seatCooldownSeconds + 0.5) / FRAME); f += 1) {
      a.step();
      if (a.starts.length !== lastA) { lastA = a.starts.length; roomLines.push(a.starts[lastA - 1][1]); }
      b.step();
      if (b.starts.length !== lastB) { lastB = b.starts.length; roomLines.push(b.starts[lastB - 1][1]); }
    }
  }
  assert.ok(a.starts.length >= 70 && b.starts.length >= 70, `${a.starts.length} / ${b.starts.length} bubbles`);
  for (const rig of [a, b]) {
    for (let i = 1; i < rig.starts.length; i += 1) {
      assert.notEqual(rig.starts[i][1], rig.starts[i - 1][1], 'a seat repeated itself');
    }
  }
  for (let i = 1; i < roomLines.length; i += 1) {
    assert.notEqual(roomLines[i], roomLines[i - 1], 'the room echoed');
  }
  // Every line gets used.
  assert.equal(new Set(roomLines).size, BARK_LINES.length);
  // And a seat never reuses one of its recent lines: any `seatRecentLines` + 1
  // of its bubbles in a row are all different.
  const window = BARKS.seatRecentLines + 1;
  for (const rig of [a, b]) {
    for (let i = window; i <= rig.starts.length; i += 1) {
      const lines = rig.starts.slice(i - window, i).map(([, line]) => line);
      assert.equal(new Set(lines).size, window, `a seat reused a recent line: ${lines.join(',')}`);
    }
  }
});

test('one person met again and again: a fresh roll each time, and the lines come round (critic item 13)', () => {
  /** Meet person p `times` times, 95 s apart (past the person memory and the seat cooldown). */
  const meet = (forced: boolean, times: number): (number | null)[] => {
    const rig = new Rig();
    rig.room.forceChance = forced;
    rig.rideIn();
    const outcomes: (number | null)[] = [];
    for (let i = 0; i < times; i += 1) {
      const before = rig.starts.length;
      rig.people([person('p', 0, 10)]).run(1);
      outcomes.push(rig.starts.length > before ? rig.starts[rig.starts.length - 1][1] : null);
      // Out of the look-ahead box, the way a rider rides off and comes back.
      rig.people([person('p', 0, AHEAD_MAX + 12)]).run(95);
    }
    return outcomes;
  };
  const forced = meet(true, 8);
  assert.ok(forced.every((line) => line !== null), `every forced encounter asks: ${forced.join(',')}`);
  const lines = forced as number[];
  assert.ok(new Set(lines).size >= 4, `8 encounters used only lines ${lines.join(',')}`);
  for (let i = 1; i < lines.length; i += 1) assert.notEqual(lines[i], lines[i - 1], `a repeat: ${lines.join(',')}`);

  // At the shipped chance the roll is fresh each time: near `passChance` of
  // the encounters ask (all of them at 1, since owner round 2; some do not
  // below it), and the asked ones still vary. (Before the hash finaliser, one
  // person rolled nearly the same number every time and either always
  // declined or alternated two lines.)
  const natural = meet(false, 40);
  const asked = natural.filter((line): line is number => line !== null);
  assert.ok(asked.length > 0, `${asked.length} of ${natural.length} asked`);
  if (BARKS.passChance < 1) assert.ok(asked.length < natural.length, `${asked.length} of ${natural.length} asked`);
  assert.ok(Math.abs(asked.length / natural.length - BARKS.passChance) <= 0.2,
    `${asked.length} of ${natural.length} asked at passChance ${BARKS.passChance}`);
  assert.ok(new Set(asked).size >= 4, `lines ${asked.join(',')}`);
  for (let i = 1; i < asked.length; i += 1) assert.notEqual(asked[i], asked[i - 1], `a repeat: ${asked.join(',')}`);
});

test('deterministic for the same inputs', () => {
  const run = (): string => {
    const rig = new Rig();
    rig.rideIn();
    for (let i = 0; i < 40; i += 1) {
      rig.people([person(`p${i}`, (i % 5) - 2, 8 + (i % 7))]);
      rig.run(BARKS.seatCooldownSeconds / 2);
    }
    return JSON.stringify(rig.starts.map(([clock, line, id]) => [clock.toFixed(4), line, id]));
  };
  const first = run();
  assert.equal(run(), first);
  assert.ok(JSON.parse(first).length > 0, 'something barked');
});

test('one bubble per seat', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn().people([person('a', 0, 10), person('b', 2, 11), person('c', -2, 12)]);
  rig.run(BARKS.lifetimeSeconds);
  assert.equal(rig.starts.length, 1);
  assert.equal(rig.visible, true);
});

test(`life and fade on a real dt sequence: gone after ${BARKS.lifetimeSeconds + BARKS.fadeSeconds} s`, () => {
  const rig = passRig(0, 10);
  assert.equal(rig.visible, true);
  rig.run(BARKS.lifetimeSeconds - 0.05);
  assert.equal(rig.model.output.opacity, 1, 'full opacity through its life');
  rig.run(0.2);
  assert.equal(rig.visible, true, 'fading');
  assert.ok(rig.model.output.opacity < 1 && rig.model.output.opacity > 0);
  rig.run(BARKS.fadeSeconds);
  assert.equal(rig.visible, false, 'gone after life plus fade');
  // A zero dt never ages a bubble: the trap of reading the cleared field.
  const frozen = passRig(0, 10);
  for (let i = 0; i < 1000; i += 1) frozen.step(0);
  assert.equal(frozen.visible, true);
  assert.equal(frozen.model.output.age, 0);
});

test('a person this seat struck stays silent for 10 s', () => {
  const rig = new Rig();
  rig.room.forceChance = true;
  rig.rideIn();
  // Struck at arm's length, then back on their feet ahead of the rider.
  rig.people([person('p', 0, 1, { activity: 'impacted' })]).step(FRAME, { speed: 0 });
  rig.people([person('p', 0, 10)]);
  rig.run(BARKS.hitMemorySeconds - 0.5, { speed: 5 });
  assert.equal(rig.visible, false, 'inside the hit memory');
  rig.run(1, { speed: 5 });
  assert.equal(rig.visible, true, 'after it');

  // Somebody impacted far from this seat (another rider's knock) is not ours.
  const other = new Rig();
  other.room.forceChance = true;
  other.rideIn();
  other.people([person('p', 0, 30, { activity: 'impacted' })]).step();
  other.people([person('p', 0, 10)]).step();
  assert.equal(other.visible, true);
});

test('the source: no Math.random, a type-only population import, no three and no DOM', () => {
  const source = readFileSync(new URL('./barkModel.ts', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\.random/.test(code), 'Math.random');
  const simulationImports = [...source.matchAll(/^import\s+(type\s+)?[^;]*from\s+'\.\.\/simulation\/[^']+';/gm)];
  assert.ok(simulationImports.length >= 1, 'expected the type import of the population');
  for (const match of simulationImports) assert.ok(match[1], `a runtime simulation import: ${match[0]}`);
  assert.ok(!/from\s+'three'/.test(code), 'no three');
  assert.ok(!/\bdocument\b|\bwindow\b/.test(code), 'no DOM');
  // The private-name check on the bark files lives in the roster's own test,
  // which never ships (this file does, and the roster does not).
});
