/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  TRAFFIC_HORN,
  TrafficHornModel,
  bodyAhead,
  hornAttenuation,
  type TrafficHornBody,
  type TrafficHornVehicle,
} from './trafficHorn.ts';

/**
 * The traffic horn's trigger, asserted headlessly (2026-10-21).
 *
 * The model is handed presented population rows and presented rider
 * positions and nothing else, so every rule the owner's brief names is plain
 * arithmetic here: patience of 3 s, a box ahead of the nose, repeats 4–6 s
 * apart, and a wait that ends when the vehicle moves. Since 2026-10-22 it
 * never nags: only seated players are honked at (never a CPU cop), and one
 * wait says at most four things before going quiet until the vehicle moves
 * or a player it has not honked at yet steps in.
 */

const STEP = 1 / 60;
const NOSE = TRAFFIC_HORN.noseMetres;

type Van = { -readonly [K in keyof TrafficHornVehicle]: TrafficHornVehicle[K] };

function van(overrides: Partial<Van> = {}): Van {
  // Heading 0 faces +Z; the nose is NOSE metres up +Z from the origin.
  return {
    id: 'ring/trafficVehicle/1200', kind: 'trafficVehicle', x: 0, y: 0, z: 0, headingY: 0,
    speedMetresPerSecond: 0, activity: 'waiting', activityPhase: 1, backing: false, ...overrides,
  };
}

/** A rider standing in the lane, `metres` ahead of the nose. */
const ahead = (metres = 3, lateral = 0): TrafficHornBody => ({ x: lateral, y: 0, z: NOSE + metres });

/** Drive the model at 60 Hz for `seconds`, returning the clock of every honk. */
function ride(model: TrafficHornModel, vehicles: readonly TrafficHornVehicle[], bodies: readonly TrafficHornBody[],
  seconds: number, start = { clock: 0 }, active = true, listeners = 1): number[] {
  const honks: number[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    start.clock += STEP;
    model.observe(start.clock, vehicles, bodies, listeners, 0, active);
    for (let c = 0; c < model.cueCount; c += 1) honks.push(start.clock);
  }
  return honks;
}

test('stopped 2.9 s with a rider ahead is patience; 3.1 s is a honk', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  model.observe(0, [van()], [ahead()], 1, 0, true);
  assert.deepEqual(ride(model, [van()], [ahead()], 2.9, clock), [], 'honked before 3 s');
  assert.equal(model.blockedVehicles, 1, 'the wait is being counted');
  const honks = ride(model, [van()], [ahead()], 0.2, clock);
  assert.equal(honks.length, 1, 'no honk by 3.1 s');
  assert.ok(honks[0] >= TRAFFIC_HORN.patienceSeconds - 1e-9 && honks[0] <= 3.1, `honk at ${honks[0]}`);
  const cue = model.cues[0];
  assert.equal(cue.toots, 2, 'the first honk is the polite double toot');
  assert.equal(cue.honkIndex, 0);
  assert.equal(cue.urgency, 0);
  assert.ok(cue.gain > 0 && cue.gain <= TRAFFIC_HORN.peakGain);
  // The source is the grille: at the nose, above the contact.
  assert.ok(Math.abs(cue.z - NOSE) < 1e-9 && Math.abs(cue.y - TRAFFIC_HORN.sourceHeightMetres) < 1e-9);
});

test('a rider beside the van, or behind it, is not in its way', () => {
  for (const body of [
    { x: 3, y: 0, z: 0 },            // alongside the cab
    { x: 2.2, y: 0, z: NOSE + 3 },   // ahead but in the next lane
    { x: 0, y: 0, z: -5 },           // behind it
    { x: 0, y: 0, z: NOSE + 9 },     // further than the box reaches
    { x: 0, y: 4, z: NOSE + 3 },     // overhead (a pad flight, a bridge)
  ]) {
    const model = new TrafficHornModel();
    assert.deepEqual(ride(model, [van()], [body], 12), [], `honked at ${JSON.stringify(body)}`);
    assert.equal(model.blockedVehicles, 0);
  }
  // The box's own edges, inclusive.
  assert.equal(bodyAhead(van(), ahead(0), 1), true);
  assert.equal(bodyAhead(van(), ahead(8), 1), true);
  assert.equal(bodyAhead(van(), ahead(3, 1.6), 1), true);
  assert.equal(bodyAhead(van(), ahead(3, 1.61), 1), false);
  assert.equal(bodyAhead(van(), ahead(8.01), 1), false);
  // A turned van looks along its own heading: facing +X, a rider at +X is ahead.
  const east = van({ headingY: Math.PI / 2 });
  assert.equal(bodyAhead(east, { x: NOSE + 3, y: 0, z: 0 }, 1), true);
  assert.equal(bodyAhead(east, { x: 0, y: 0, z: NOSE + 3 }, 1), false);
});

test('repeats are spaced 4 to 6 s apart, vary, grow more impatient, and stop at four', () => {
  const model = new TrafficHornModel();
  const toots: number[] = [], lasts: number[] = [], urgencies: number[] = [];
  const honks: number[] = [];
  let clock = 0;
  for (let i = 0; i < Math.round(40 / STEP); i += 1) {
    clock += STEP;
    model.observe(clock, [van()], [ahead()], 1, 0, true);
    for (let c = 0; c < model.cueCount; c += 1) {
      honks.push(clock);
      toots.push(model.cues[c].toots);
      lasts.push(model.cues[c].lastTootSeconds);
      urgencies.push(model.cues[c].urgency);
    }
  }
  assert.equal(honks.length, TRAFFIC_HORN.maximumHonksPerWait, `${honks.length} honks in 40 s`);
  assert.equal(TRAFFIC_HORN.maximumHonksPerWait, 4);
  const gaps = honks.slice(1).map((at, i) => at - honks[i]);
  for (const gap of gaps) {
    assert.ok(gap >= TRAFFIC_HORN.repeatMinSeconds - STEP && gap <= TRAFFIC_HORN.repeatMaxSeconds + STEP, `gap ${gap}`);
  }
  assert.ok(new Set(gaps.map(gap => gap.toFixed(2))).size > 1, 'every repeat was the same length');
  assert.equal(toots[0], 2);
  assert.equal(toots[1], 2);
  assert.equal(toots[2], 3, 'the third honk is short-short-long');
  assert.ok(lasts[1] > lasts[0], 'the second honk did not lean on it longer');
  assert.ok(Math.max(...lasts) <= TRAFFIC_HORN.impatientLastTootSeconds + 1e-12, 'a toot ran past the ceiling');
  // The last honk of the wait is the fully impatient one.
  assert.deepEqual(urgencies, [0, 1 / 3, 2 / 3, 1]);
  assert.equal(model.blockedVehicles, 1, 'a van that gave up stopped counting the wait');
  assert.equal(model.quietVehicles, 1);
});

test('moving resets the wait: a van that creeps on and stops again starts its patience over', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  assert.equal(ride(model, [van()], [ahead()], 3.2, clock).length, 1);
  // It moves on — for one frame is enough.
  assert.deepEqual(ride(model, [van({ speedMetresPerSecond: 3, activity: 'driving' })], [ahead()], STEP, clock), []);
  assert.equal(model.blockedVehicles, 0);
  // And is held up again.
  assert.deepEqual(ride(model, [van()], [ahead()], 2.9, clock), [], 'kept the old patience');
  const again = ride(model, [van()], [ahead()], 0.3, clock);
  assert.equal(again.length, 1);
  assert.equal(model.cues[0].honkIndex, 0, 'the new wait began impatient');
});

test('a rider who steps out briefly keeps the patience; one who leaves resets it', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  ride(model, [van()], [ahead()], 2.0, clock);
  ride(model, [van()], [ahead(3, 2.5)], 0.3, clock);                 // a wobble out of the lane
  assert.equal(ride(model, [van()], [ahead()], 1.2, clock).length, 1, 'a 0.3 s step aside reset the patience');

  const other = new TrafficHornModel();
  const second = { clock: 0 };
  ride(other, [van()], [ahead()], 2.0, second);
  ride(other, [van()], [ahead(3, 2.5)], 0.8, second);                // gone for good
  assert.deepEqual(ride(other, [van()], [ahead()], 2.5, second), [], 'patience survived the rider leaving');
});

test('a scheduled stop, a parked car, a knocked van and a pedestrian are not honked for', () => {
  for (const vehicle of [
    van({ activityPhase: 0.5 }),                         // its pause clock is still running
    van({ kind: 'parkedVehicle', activity: 'parked' }),
    van({ activity: 'impacted', activityPhase: 0.4 }),
    van({ kind: 'walker', activity: 'waiting' }),
  ]) {
    const model = new TrafficHornModel();
    assert.deepEqual(ride(model, [vehicle], [ahead()], 10), [], `honked: ${vehicle.kind}/${vehicle.activity}`);
  }
  // A service van is a horn too.
  const service = new TrafficHornModel();
  assert.equal(ride(service, [van({ kind: 'serviceVehicle', id: 'yard/serviceVehicle/9' })], [ahead()], 3.2).length, 1);
});

test('a van that was backing waits looking backwards', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  const behind: TrafficHornBody = { x: 0, y: 0, z: -(NOSE + 3) };
  ride(model, [van({ speedMetresPerSecond: -2, backing: true, activity: 'reversing' })], [behind], 0.5, clock);
  assert.equal(ride(model, [van()], [behind], 3.2, clock).length, 1, 'a backing van ignored the rider behind it');
  assert.ok(model.cues[0].z < 0, 'the honk did not come from the end it was backing toward');
  // And the rider in front of its bonnet is now behind its direction of travel.
  const front = new TrafficHornModel();
  const other = { clock: 0 };
  ride(front, [van({ speedMetresPerSecond: -2, backing: true, activity: 'reversing' })], [ahead()], 0.5, other);
  assert.deepEqual(ride(front, [van()], [ahead()], 5, other), []);
});

test('a pause forgets the wait but not which way a stopped van was backing', () => {
  // Codex QA 2026-10-22: after a pause the van watched its bonnet, not its tail.
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  const behind: TrafficHornBody = { x: 0, y: 0, z: -(NOSE + 3) };
  ride(model, [van({ speedMetresPerSecond: -1 })], [behind], 0.25, clock);
  ride(model, [van()], [behind], 2.0, clock);
  ride(model, [van()], [behind], 1.0, clock, false);                 // paused
  const honks = ride(model, [van()], [behind], 3.2, clock);
  assert.equal(honks.length, 1, 'the paused van forgot it was facing the rider behind it');
  assert.ok(model.cues[0].z < 0);
  // A quick reset or world swap forgets the direction too.
  model.reset();
  assert.deepEqual(ride(model, [van()], [behind], 5, clock), []);
});

test('silent while idle, and leaving the menu starts patience from zero', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  assert.deepEqual(ride(model, [van()], [ahead()], 10, clock, false), [], 'honked behind a menu');
  assert.equal(model.trackedVehicles, 0, 'idle kept a wait');
  ride(model, [van()], [ahead()], 2.0, clock);
  ride(model, [van()], [ahead()], 1.0, clock, false);                // paused at 2 s
  assert.deepEqual(ride(model, [van()], [ahead()], 2.9, clock), [], 'honked the instant play resumed');
  assert.equal(ride(model, [van()], [ahead()], 0.3, clock).length, 1);
});

test('a held clock holds the patience, and a clock jump backwards is a new world', () => {
  const model = new TrafficHornModel();
  for (let i = 0; i < 600; i += 1) model.observe(1, [van()], [ahead()], 1, 0, true);
  assert.equal(model.cueCount, 0, 'a frozen loop counted wall frames as time');
  const clock = { clock: 1 };
  ride(model, [van()], [ahead()], 2.5, clock);
  model.observe(0.5, [van()], [ahead()], 1, 0, true);                // a world swap's new clock
  const resumed = { clock: 0.5 };
  assert.deepEqual(ride(model, [van()], [ahead()], 2.9, resumed), []);
});

test('each vehicle has its own horn, and the same vehicle is always the same horn', () => {
  const ids = ['a/trafficVehicle/300', 'b/trafficVehicle/1800', 'c/trafficVehicle/2400', 'd/serviceVehicle/77'];
  const notes = new Map<string, number>();
  for (const id of ids) {
    const kind = id.includes('service') ? 'serviceVehicle' : 'trafficVehicle';
    const first = new TrafficHornModel(), second = new TrafficHornModel();
    ride(first, [van({ id, kind })], [ahead()], 3.2);
    const low = first.cues[0].lowHz, high = first.cues[0].highHz;
    ride(second, [van({ id, kind })], [ahead()], 3.2);
    assert.equal(second.cues[0].lowHz, low, 'a vehicle changed its horn between runs');
    const band = kind === 'serviceVehicle'
      ? [TRAFFIC_HORN.serviceLowHz, TRAFFIC_HORN.serviceHighHz] : [TRAFFIC_HORN.trafficLowHz, TRAFFIC_HORN.trafficHighHz];
    assert.ok(low >= band[0] && low <= band[1], `${id} at ${low} Hz`);
    const ratio = high / low;
    assert.ok(Math.abs(ratio - TRAFFIC_HORN.majorThird) < 1e-9 || Math.abs(ratio - TRAFFIC_HORN.minorThird) < 1e-9);
    notes.set(id, low);
  }
  assert.equal(new Set([...notes.values()].map(hz => hz.toFixed(1))).size, ids.length, 'two vehicles share a horn');
});

test('the honk is attenuated for the nearest seat, placed left or right, and beyond earshot builds nothing', () => {
  assert.equal(hornAttenuation(0), 1);
  assert.equal(hornAttenuation(TRAFFIC_HORN.nearMetres), 1);
  assert.ok(hornAttenuation(20) < hornAttenuation(10) && hornAttenuation(10) < 1);
  assert.equal(hornAttenuation(TRAFFIC_HORN.farMetres), 0);
  assert.equal(hornAttenuation(Number.NaN), 0);

  // The blocker is the seat: close to the grille, then at the far left corner of the box.
  const seatLeft: TrafficHornBody = { x: 25, y: 0, z: NOSE };
  const near = new TrafficHornModel();
  ride(near, [van()], [ahead(1)], 3.2);
  assert.ok(Math.abs(near.cues[0].gain - TRAFFIC_HORN.peakGain) < 1e-12, 'attenuated inside the near distance');
  const far = new TrafficHornModel();
  let clock = 0, gain = 0, pan = 0, distance = 0;
  for (let i = 0; i < Math.round(3.2 / STEP); i += 1) {
    clock += STEP;
    far.observe(clock, [van()], [ahead(8, 1.5)], 1, 0, true);
    if (far.cueCount > 0) ({ gain, pan, distanceMetres: distance } = far.cues[0]);
  }
  assert.ok(gain > 0 && gain < near.cues[0].gain, 'the far seat heard it as loud as the near one');
  assert.ok(Math.abs(distance - Math.hypot(8, 1.5, TRAFFIC_HORN.sourceHeightMetres)) < 1e-9);
  // The seat faces +Z, so its right is -X — which is where the van's grille is.
  assert.ok(pan > 0 && pan <= TRAFFIC_HORN.maximumPan, `pan ${pan}`);

  // Two seats: centred, whichever pane is nearer.
  const couch = new TrafficHornModel();
  ride(couch, [van()], [seatLeft, ahead()], 3.2, { clock: 0 }, true, 2);
  assert.equal(couch.cues[0].pan, 0);
  assert.ok(Math.abs(couch.cues[0].gain - TRAFFIC_HORN.peakGain) < 1e-12, 'not attenuated for the nearer seat');

  // Out of earshot (only reachable with a shorter earshot than the box: the
  // blocker is always a seat): no cue, but the rhythm keeps going silently,
  // and silent honks spend the wait like heard ones.
  // (The frozen tuning's numbers are literal types; a test tuning is cast to it.)
  const deaf = new TrafficHornModel({ ...TRAFFIC_HORN, fadeStartMetres: 1, farMetres: 2 } as unknown as typeof TRAFFIC_HORN);
  const deafClock = { clock: 0 };
  assert.deepEqual(ride(deaf, [van()], [ahead(5)], 12, deafClock), []);
  assert.equal(deaf.blockedVehicles, 1);
  assert.equal(deaf.quietVehicles, 0);
  assert.deepEqual(ride(deaf, [van()], [ahead(5)], 6, deafClock), []);
  assert.equal(deaf.quietVehicles, 1, 'four silent honks did not spend the wait');
});

test('a vehicle the population no longer has is forgotten', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  ride(model, [van(), van({ id: 'other', x: 40 })], [ahead()], 1, clock);
  assert.equal(model.trackedVehicles, 2);
  ride(model, [van()], [ahead()], STEP, clock);
  assert.equal(model.trackedVehicles, 1);
});

test('the car queued behind a waiting van waits for the van, and does not honk through it', () => {
  // Rider 1.4 m off the front van's nose; the second car's nose 1.5 m behind
  // the van's tail, so the rider is inside the second car's 8 m box too.
  const front = van({ id: 'q/trafficVehicle/front' });
  const queued = van({ id: 'q/trafficVehicle/queued', z: -(2 * NOSE + 1.5) });
  assert.equal(bodyAhead(queued, ahead(1.4), 1), true, 'the fixture does not put the rider in both boxes');
  const model = new TrafficHornModel();
  const honks: string[] = [];
  let clock = 0;
  for (let i = 0; i < Math.round(12 / STEP); i += 1) {
    clock += STEP;
    model.observe(clock, [front, queued], [ahead(1.4)], 1, 0, true);
    for (let c = 0; c < model.cueCount; c += 1) honks.push(model.cues[c].vehicleId);
  }
  assert.ok(honks.length >= 2, 'the front van did not honk');
  assert.ok(honks.every(id => id === front.id), `honked through the van: ${honks.join(', ')}`);
  assert.equal(model.blockedVehicles, 1);
  // A parked car in the lane is in the way just the same; one in the next lane is not.
  const parked = van({ id: 'kerb/parkedVehicle/1', kind: 'parkedVehicle', activity: 'parked', z: NOSE + 1 + NOSE });
  const besideParked = { ...parked, id: 'kerb/parkedVehicle/2', x: 3 };
  const blockedBehindParked = new TrafficHornModel();
  assert.deepEqual(ride(blockedBehindParked, [van(), parked], [ahead(6)], 6), []);
  const nextLane = new TrafficHornModel();
  assert.equal(ride(nextLane, [van(), besideParked], [ahead(6)], 3.2).length, 1);
  // Someone on foot crossing between the nose and the rider is who it waits for.
  const walker = van({ id: 'crossing/walker/3', kind: 'walker', activity: 'walking', z: NOSE + 2 });
  const crossing = new TrafficHornModel();
  assert.deepEqual(ride(crossing, [van(), walker], [ahead(5)], 6), []);
  // But a walker beyond the rider changes nothing.
  const beyond = new TrafficHornModel();
  assert.equal(ride(beyond, [van(), { ...walker, z: NOSE + 7 }], [ahead(3)], 3.2).length, 1);
});

test('only a seated player is honked at: a CPU cop in the lane is waited for in silence', () => {
  // Bodies are seats first, then placed cops; `listenerCount` is the seat count.
  const seatAway: TrafficHornBody = { x: 30, y: 0, z: 0 };
  const parkedCop = new TrafficHornModel();
  assert.deepEqual(ride(parkedCop, [van()], [seatAway, ahead(3)], 30), [], 'honked at a parked cop');
  assert.equal(parkedCop.blockedVehicles, 0);
  // A player standing beyond the cop: the van is waiting for the cop.
  const beyondCop = new TrafficHornModel();
  assert.deepEqual(ride(beyondCop, [van()], [ahead(6), ahead(2)], 12), [], 'honked through the cop');
  // A player between the cop and the grille is what it waits for.
  const beforeCop = new TrafficHornModel();
  assert.equal(ride(beforeCop, [van()], [ahead(2), ahead(6)], 3.2).length, 1);
  // A seat is a player whatever they ride as: the couch's human cop is seat 1.
  const humanCop = new TrafficHornModel();
  assert.equal(ride(humanCop, [van()], [seatAway, ahead(3)], 3.2, { clock: 0 }, true, 2).length, 1);
});

test('four honks and then quiet: a player who stays, or steps out and back, is let be until the van moves', () => {
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  assert.equal(ride(model, [van()], [ahead()], 25, clock).length, 4);
  assert.deepEqual(ride(model, [van()], [ahead()], 60, clock), [], 'nagged a player who stayed');
  assert.equal(model.quietVehicles, 1);
  assert.equal(model.blockedVehicles, 1);
  // Stepping out past the grace and back in does not buy a new round.
  ride(model, [van()], [ahead(3, 2.5)], 1, clock);
  assert.equal(model.quietVehicles, 0);
  assert.deepEqual(ride(model, [van()], [ahead()], 30, clock), [], 'stepping out and back restarted the horn');
  // The van moves on, stops again for the same player: a new stop, from patience.
  ride(model, [van({ speedMetresPerSecond: 2, activity: 'driving' })], [ahead()], STEP, clock);
  assert.equal(model.quietVehicles, 0);
  assert.deepEqual(ride(model, [van()], [ahead()], 2.9, clock), []);
  assert.equal(ride(model, [van()], [ahead()], 0.3, clock).length, 1);
  assert.equal(model.cues[0].honkIndex, 0, 'the new stop began impatient');

  // Stepping out mid-wait keeps the count: two honks, out, back in — two more, not four.
  const partial = new TrafficHornModel();
  const second = { clock: 0 };
  assert.equal(ride(partial, [van()], [ahead()], 8, second).length, 2);
  ride(partial, [van()], [ahead(3, 2.5)], 1, second);
  const back = second.clock;
  const rest = ride(partial, [van()], [ahead()], 60, second);
  assert.equal(rest.length, 2, `${rest.length} more honks after stepping back in`);
  assert.ok(rest[0] - back >= TRAFFIC_HORN.patienceSeconds - STEP, 'came back to no patience');
});

test('a different player stepping in after the horn gave up gets a fresh, polite wait of their own', () => {
  const away: TrafficHornBody = { x: 30, y: 0, z: 0 };
  const model = new TrafficHornModel();
  const clock = { clock: 0 };
  const cues: { at: number; index: number }[] = [];
  const watch = (bodies: TrafficHornBody[], seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
      clock.clock += STEP;
      model.observe(clock.clock, [van()], bodies, 2, 0, true);
      for (let c = 0; c < model.cueCount; c += 1) cues.push({ at: clock.clock, index: model.cues[c].honkIndex });
    }
  };
  watch([ahead(3), away], 25);
  assert.equal(cues.length, 4, 'seat 0 was not honked out');
  // Seat 1 pulls in between the grille and seat 0.
  const cutIn = clock.clock;
  watch([ahead(3), ahead(1.5)], 30);
  assert.equal(cues.length, 8, `${cues.length - 4} honks for the new player`);
  assert.ok(cues[4].at - cutIn >= TRAFFIC_HORN.patienceSeconds - STEP, 'the new player got no patience');
  assert.deepEqual(cues.slice(4).map(cue => cue.index), [0, 1, 2, 3], 'the new player was not started polite');
  // Seat 1 rides off; seat 0 is still there, already honked out.
  watch([ahead(3), away], 30);
  assert.equal(cues.length, 8, 'went back to nagging the first player');
  assert.equal(model.quietVehicles, 1);
});

test('two players jostling in front share one wait, and someone passing through restarts nothing', () => {
  // Side by side, the nearer one changing every 0.2 s.
  const jostle = new TrafficHornModel();
  let clock = 0, honks = 0;
  for (let i = 0; i < Math.round(60 / STEP); i += 1) {
    clock += STEP;
    const swap = Math.floor(clock / 0.2) % 2 === 0;
    jostle.observe(clock, [van()], swap ? [ahead(2, -0.5), ahead(3, 0.5)] : [ahead(3, -0.5), ahead(2, 0.5)], 2, 0, true);
    honks += jostle.cueCount;
  }
  assert.equal(honks, 4, `${honks} honks for one jostling pair`);

  // After the horn gave up on seat 0, seat 1 rides through the box for 0.3 s.
  const away: TrafficHornBody = { x: 30, y: 0, z: 0 };
  const model = new TrafficHornModel();
  const at = { clock: 0 };
  assert.equal(ride(model, [van()], [ahead(3), away], 25, at, true, 2).length, 4);
  ride(model, [van()], [ahead(3), ahead(1)], 0.3, at, true, 2);
  assert.deepEqual(ride(model, [van()], [ahead(3), away], 40, at, true, 2), [], 'a passer-by restarted the horn');
});
