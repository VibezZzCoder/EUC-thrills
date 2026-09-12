/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TRICKS } from '../data/tuning.ts';
import type { LandingQuality } from './EucController.ts';
import {
  TrickObserver,
  clearTrickFacts,
  createTrickFacts,
  type TrickEvent,
  type TrickStepInput,
} from './trickEvents.ts';

/**
 * The trick observer, tested on the facts a ride actually produces — M36
 * §36.6.
 *
 * **The fixture is a script of fact structs, not a controller**, and that is
 * the one decision here worth defending. `EucController.test.ts` already
 * proves what the wheel reports — that a hop raises `hopped` and a ledge drop
 * does not, that a sweep which runs out of air never latches `spinCompleted`,
 * that the latch belongs to its flight — and re-riding those measurements
 * through this file would test the controller twice and the rules once. What
 * this file has to hold is the other half: that *given* those facts the
 * credits are the ones §36.6's table names, and — the harder half — that given
 * facts no ride can produce, nothing is credited anyway. A fabrication test
 * needs to be able to fabricate.
 *
 * The scripts below therefore mirror the controller's real semantics exactly
 * (they are transcribed from wave 1's measurements, cited where they matter)
 * and then step outside them on purpose, which is what the last four tests do.
 */

/** The simulation's fixed step. Everything below is driven at it. */
const STEP = 1 / 120;

/** One step's facts, with nothing eventful happening. */
function facts(over: Partial<TrickStepInput> = {}): TrickStepInput {
  return {
    flightIndex: 1,
    tookOff: false,
    hopped: false,
    hopCharge: 0,
    spinCompleted: false,
    oneFootQualified: false,
    touchedDown: false,
    landingQuality: 'none',
    crashed: false,
    reset: false,
    ...over,
  };
}

interface FlightScript {
  /** The controller's flight identity. `+1` at every takeoff, never reset. */
  readonly id?: number;
  /** A hop launch rather than a ledge drop. */
  readonly hopped?: boolean;
  /** The charge that launch captured, read only when `hopped`. */
  readonly charge?: number;
  /** Steps in the air, the takeoff step and the touchdown step included. */
  readonly air?: number;
  /**
   * The air step the sweep completes on, or null for a spin that never
   * completed (or no spin at all). The fact **latches** from there, exactly as
   * `EucController.spinCompleted` does until the next takeoff.
   */
  readonly spinAt?: number | null;
  /**
   * The air step the pose qualifies on, or null. Latches too: §36.5's
   * `qualifiedThisFlight` stays true for the rest of the flight, which is why
   * a release and a re-hold cannot be two airs.
   */
  readonly footAt?: number | null;
  /** The controller's verdict on the touchdown. */
  readonly landing?: LandingQuality;
  /** Whether the rider is down on the touchdown step. */
  readonly crashed?: boolean;
  /** Leave the flight open: no touchdown step is stepped at all. */
  readonly openEnded?: boolean;
}

/**
 * Fly one flight and collect every credit it produced.
 *
 * The shape is the ride's: one takeoff edge, some air, one touchdown edge —
 * and the two latching facts latch, because that is what the controller and
 * the pose do and a test that fed them as single-step pulses would be proving
 * the rules against a wheel this game does not have.
 */
function fly(observer: TrickObserver, script: FlightScript = {}): TrickEvent[] {
  const id = script.id ?? 1;
  const air = script.air ?? 8;
  const events: TrickEvent[] = [];

  events.push(...observer.step(STEP, facts({
    flightIndex: id,
    tookOff: true,
    hopped: script.hopped ?? false,
    hopCharge: script.hopped === true ? script.charge ?? 0 : 0,
  })));

  const last = script.openEnded === true ? air : air - 1;
  for (let step = 1; step <= last; step += 1) {
    const touchdown = step === air - 1 && script.openEnded !== true;
    events.push(...observer.step(STEP, facts({
      flightIndex: id,
      spinCompleted: script.spinAt != null && step >= script.spinAt,
      oneFootQualified: script.footAt != null && step >= script.footAt,
      touchedDown: touchdown,
      landingQuality: touchdown ? script.landing ?? 'clean' : 'none',
      crashed: touchdown ? script.crashed ?? false : false,
    })));
  }
  return events;
}

/** The kinds credited, in order. The whole assertion surface of most tests. */
function kinds(events: readonly TrickEvent[]): string[] {
  return events.map((event) => event.kind);
}

test('a plain hop with a full charge is a charged hop, credited once at the launch', () => {
  const observer = new TrickObserver();
  const events = fly(observer, { hopped: true, charge: 1 });

  assert.deepEqual(kinds(events), ['charged-hop']);
  assert.deepEqual(observer.tally, {
    cleanLandings: 0,
    chargedHops: 1,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
  // Banked at the launch and not at the landing: the credit arrived on the
  // first step of the flight, before any of the air was flown.
  assert.equal(events[0].flight, 1);
});

test('a partial charge is diagnostic and never rounds up', () => {
  const observer = new TrickObserver();
  // §36.6 names the half charge as the diagnostic case, and `jumpBench` models
  // exactly it. One step short of the window is the *other* case and is the
  // reason the threshold is not 1 — see `TRICKS.chargedHopMinCharge`.
  fly(observer, { hopped: true, charge: 0.5 });
  assert.equal(observer.tally.chargedHops, 0);
  // Kept, so a bench can read what the rider actually spent.
  assert.equal(observer.lastFlight?.charge, 0.5);

  fly(observer, { id: 2, hopped: true, charge: TRICKS.chargedHopMinCharge - 1e-9 });
  assert.equal(observer.tally.chargedHops, 0);

  fly(observer, { id: 3, hopped: true, charge: TRICKS.chargedHopMinCharge });
  assert.equal(observer.tally.chargedHops, 1);
});

test('riding off a ledge is a flight and is not a charged hop', () => {
  const observer = new TrickObserver();
  // The trap wave 1 measured and wrote down: `lastHopCharge` survives its
  // launch, so a ledge run reads `charge: 1` from a hop taken 20 m earlier.
  // The composition root gates the read on `hopped`; the observer gates the
  // credit on it too, so neither alone can produce a phantom charged hop.
  fly(observer, { hopped: false, charge: 1 });
  assert.equal(observer.tally.chargedHops, 0);
  // It was still a flight: it can carry a 180 and a one-foot air.
  assert.equal(observer.lastFlight?.ended, 'landed');
  assert.equal(observer.lastFlight?.charge, 0);
});

test('arming a spin is not completing one', () => {
  const observer = new TrickObserver();
  // `EucController.test.ts` measures the ride this transcribes: a sweep at
  // `spinYawRate 0.5` delivers 0.3 rad of π, `spins` counts the arming press,
  // and `spinCompleted` is never true. The observer is handed the completion
  // fact and nothing else, so an arming count it cannot see cannot credit.
  const events = fly(observer, { spinAt: null, landing: 'clean' });
  assert.deepEqual(kinds(events), []);
  assert.equal(observer.tally.spinsLanded, 0);
  assert.equal(observer.lastFlight?.spinCompleted, false);
});

test('a completed sweep landed clean is a 180, once, however long it stays true', () => {
  const observer = new TrickObserver();
  // The latch is true from the completion step to the *next* takeoff, so it is
  // read on every remaining air step and on the touchdown step. One credit.
  const events = fly(observer, { air: 60, spinAt: 20, landing: 'clean' });
  assert.deepEqual(kinds(events), ['spin-landed']);
  assert.equal(observer.tally.spinsLanded, 1);

  // **The landing closed the flight**, and this is the case that makes that
  // matter: the controller's latch is still true on every grounded step after
  // the landing, because it is cleared at the *next* takeoff. A second
  // touchdown arriving with it still standing credits nothing, because there
  // is no flight for it to belong to.
  assert.equal(observer.flightOpen, false);
  const again = observer.step(STEP, facts({
    spinCompleted: true,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(again), []);
  assert.equal(observer.tally.spinsLanded, 1);

  // And the completion is **latched by the flight**, not read at the
  // touchdown: a sweep that finished mid-flight is landed even if the fact
  // stopped being reported before the wheel came down.
  const latched = new TrickObserver();
  latched.step(STEP, facts({ tookOff: true }));
  latched.step(STEP, facts({ spinCompleted: true }));
  latched.step(STEP, facts({ spinCompleted: false }));
  const late = latched.step(STEP, facts({ touchedDown: true, landingQuality: 'clean' }));
  assert.deepEqual(kinds(late), ['spin-landed']);
});

test('a sweep that completes on the landing step still lands', () => {
  const observer = new TrickObserver();
  // Wave 1 tuned a sweep to finish on the touchdown step and measured the
  // latch true there — which is exactly why the controller clears it at the
  // next takeoff rather than at the landing. The observer must read it.
  const events = fly(observer, { air: 20, spinAt: 18, landing: 'clean' });
  assert.deepEqual(kinds(events), ['spin-landed']);
});

test('a crash forfeits the flight, by either fact', () => {
  const byTier = new TrickObserver();
  fly(byTier, { hopped: true, charge: 1, spinAt: 3, footAt: 4, landing: 'crash' });
  // The hop was charged and that happened at the launch; the two the landing
  // had to survive did not.
  assert.deepEqual(byTier.tally, {
    cleanLandings: 0,
    chargedHops: 1,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
  assert.equal(byTier.lastFlight?.ended, 'crashed');
  // Readable, and worth nothing — §36.6's bounded diagnostics.
  assert.equal(byTier.lastFlight?.spinCompleted, true);
  assert.equal(byTier.lastFlight?.oneFoot, true);

  // And by the level, on a landing the controller scored `heavy` while the
  // rider was already down.
  const byLevel = new TrickObserver();
  fly(byLevel, { spinAt: 3, footAt: 4, landing: 'heavy', crashed: true });
  assert.equal(byLevel.tally.spinsLanded, 0);
  assert.equal(byLevel.tally.oneFootAirs, 0);

  // A crash taken in mid-air never reaches a touchdown at all; the flight ends
  // where it is, and the next takeoff is a new flight rather than a resumed one.
  const inFlight = new TrickObserver();
  inFlight.step(STEP, facts({ tookOff: true }));
  inFlight.step(STEP, facts({ spinCompleted: true, oneFootQualified: true }));
  inFlight.step(STEP, facts({ crashed: true }));
  assert.equal(inFlight.flightOpen, false);
  assert.equal(inFlight.lastFlight?.ended, 'crashed');
  assert.deepEqual(inFlight.tally, {
    cleanLandings: 0,
    chargedHops: 0,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
});

test('a 180 and a one-foot air are both credited on one flight', () => {
  const observer = new TrickObserver();
  // §36.6: they are different events. The 180 is a press and the pose is a
  // held level, and a rider who tapped the spin and then held the hold gets
  // both — the case `oneFootPose.test.ts` measures as "a spin tap then a
  // sustained hold fits the uncharged flight".
  const events = fly(observer, { air: 72, spinAt: 30, footAt: 18, landing: 'clean' });
  assert.deepEqual(kinds(events), ['spin-landed', 'one-foot-air']);
  assert.deepEqual(observer.tally, {
    cleanLandings: 0,
    chargedHops: 0,
    spinsLanded: 1,
    oneFootAirs: 1,
  });
});

test('one air per flight, however often the pose is released and re-held', () => {
  const observer = new TrickObserver();
  // §36.5 latches `qualifiedThisFlight` for the flight, so a re-hold reads
  // true again. §36.6 asks for at most one per flight even if released and
  // re-held, and the credit hangs off the touchdown rather than off the fact.
  observer.step(STEP, facts({ tookOff: true }));
  for (let step = 0; step < 6; step += 1) {
    observer.step(STEP, facts({ oneFootQualified: step % 2 === 0 }));
  }
  const events = observer.step(STEP, facts({ touchedDown: true, landingQuality: 'clean' }));
  assert.deepEqual(kinds(events), ['one-foot-air']);
  assert.equal(observer.tally.oneFootAirs, 1);

  // And a second flight earns its own.
  fly(observer, { id: 2, footAt: 2 });
  assert.equal(observer.tally.oneFootAirs, 2);
});

test('clean landings are not counted here, whatever the landing was', () => {
  const observer = new TrickObserver();
  for (let flight = 1; flight <= 4; flight += 1) fly(observer, { id: flight, landing: 'clean' });
  // §36.6: reuse the existing count rather than counting the same touchdown in
  // two places. The owner fills this field in; the observer always reports nil.
  assert.equal(observer.tally.cleanLandings, 0);
});

test('nothing is credited without a flight, so a teleport fabricates nothing', () => {
  const observer = new TrickObserver();
  // Every fact §36.6 counts, all true, on a step with no takeoff behind it —
  // a struct no ride can produce, which is the point. A launch, a completion
  // and a landing all at once, and the answer is silence.
  const events = observer.step(STEP, facts({
    hopped: true,
    hopCharge: 1,
    spinCompleted: true,
    oneFootQualified: true,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(events), []);
  assert.deepEqual(observer.tally, {
    cleanLandings: 0,
    chargedHops: 0,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
  assert.equal(observer.lastFlight, null);

  // And the same struct with the reset flag on it, mid-flight: the pending
  // flight is discarded and this step is not riding. A second observer, so
  // the assertion above — which narrows what it is handed — cannot make the
  // reads below unreachable to the type checker.
  const teleported = new TrickObserver();
  teleported.step(STEP, facts({ tookOff: true }));
  teleported.step(STEP, facts({ spinCompleted: true, oneFootQualified: true }));
  const teleport = teleported.step(STEP, facts({
    reset: true,
    hopped: true,
    hopCharge: 1,
    tookOff: true,
    spinCompleted: true,
    oneFootQualified: true,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(teleport), []);
  assert.equal(teleported.flightOpen, false);
  assert.equal(teleported.lastFlight?.ended, 'discarded');
  assert.deepEqual(teleported.tally, {
    cleanLandings: 0,
    chargedHops: 0,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
});

test('a discarded flight loses its credits and keeps the session it was in', () => {
  const observer = new TrickObserver();
  fly(observer, { hopped: true, charge: 1, spinAt: 3, footAt: 4, landing: 'clean' });
  assert.deepEqual(observer.tally, {
    cleanLandings: 0,
    chargedHops: 1,
    spinsLanded: 1,
    oneFootAirs: 1,
  });

  // `R` in mid-hop, the second flight thrown away.
  observer.step(STEP, facts({ flightIndex: 2, tookOff: true, hopped: true, hopCharge: 1 }));
  observer.step(STEP, facts({ flightIndex: 2, spinCompleted: true, oneFootQualified: true }));
  observer.discardFlight();
  assert.equal(observer.flightOpen, false);
  // The charged hop was banked at the launch and stays banked; the two that
  // needed a landing never got one. Everything earlier survives, which is the
  // quick reset's whole contract.
  assert.deepEqual(observer.tally, {
    cleanLandings: 0,
    chargedHops: 2,
    spinsLanded: 1,
    oneFootAirs: 1,
  });

  // A touchdown arriving afterwards belongs to no flight and credits nothing.
  const stray = observer.step(STEP, facts({
    flightIndex: 2,
    spinCompleted: true,
    oneFootQualified: true,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(stray), []);
  assert.equal(observer.tally.spinsLanded, 1);

  // And a discard with nothing in the air is a no-op, not a lost diagnostic.
  const before = observer.lastFlight;
  observer.discardFlight();
  assert.equal(observer.lastFlight, before);
});

test('a takeoff always begins a new flight, and facts from another one cannot land it', () => {
  const observer = new TrickObserver();
  // An interrupted flight — one the observer was never told the end of —
  // earns nothing when the next takeoff arrives over the top of it.
  observer.step(STEP, facts({ tookOff: true }));
  observer.step(STEP, facts({ spinCompleted: true, oneFootQualified: true }));
  observer.step(STEP, facts({ flightIndex: 2, tookOff: true }));
  assert.equal(observer.lastFlight?.ended, 'discarded');
  const landed = observer.step(STEP, facts({
    flightIndex: 2,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(landed), []);

  // And a landing carrying a different flight's name lands nothing: the open
  // flight is discarded before anything is read, so its latches go with it.
  observer.step(STEP, facts({ flightIndex: 3, tookOff: true }));
  observer.step(STEP, facts({ flightIndex: 3, spinCompleted: true }));
  const mismatched = observer.step(STEP, facts({
    flightIndex: 4,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(mismatched), []);
  assert.equal(observer.tally.spinsLanded, 0);

  // **Two takeoffs under one name**, which is a struct no ride can produce —
  // the controller's index increments at every takeoff, so the check above
  // would normally catch this first. The takeoff's own discard is what makes
  // the rule hold anyway: a second launch is a second flight whatever it is
  // called, and it inherits nothing from the one it interrupted.
  const repeated = new TrickObserver();
  repeated.step(STEP, facts({ flightIndex: 5, tookOff: true }));
  repeated.step(STEP, facts({ flightIndex: 5, spinCompleted: true, oneFootQualified: true }));
  repeated.step(STEP, facts({ flightIndex: 5, tookOff: true }));
  assert.equal(repeated.lastFlight?.ended, 'discarded');
  const inherited = repeated.step(STEP, facts({
    flightIndex: 5,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(inherited), []);
  assert.deepEqual(repeated.tally, {
    cleanLandings: 0,
    chargedHops: 0,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
});

test('clear() zeroes everything a new session must not inherit', () => {
  const observer = new TrickObserver();
  fly(observer, { hopped: true, charge: 1, spinAt: 2, footAt: 3, landing: 'clean' });
  observer.step(STEP, facts({ flightIndex: 2, tookOff: true }));
  assert.equal(observer.flightOpen, true);

  observer.clear();
  assert.deepEqual(observer.tally, {
    cleanLandings: 0,
    chargedHops: 0,
    spinsLanded: 0,
    oneFootAirs: 0,
  });
  assert.equal(observer.lastFlight, null);
  assert.equal(observer.flightOpen, false);
  // The flight that was in the air cannot land into the new session either.
  const stray = observer.step(STEP, facts({
    flightIndex: 2,
    spinCompleted: true,
    touchedDown: true,
    landingQuality: 'clean',
  }));
  assert.deepEqual(kinds(stray), []);
});

test('the diagnostic keeps one flight and awards nothing from it', () => {
  const observer = new TrickObserver();
  fly(observer, { id: 7, air: 30, hopped: true, charge: 0.5, spinAt: 4, footAt: 5, landing: 'heavy' });
  const flight = observer.lastFlight;
  assert.ok(flight !== null);
  assert.equal(flight.id, 7);
  assert.equal(flight.charge, 0.5);
  assert.equal(flight.spinCompleted, true);
  assert.equal(flight.oneFoot, true);
  assert.equal(flight.landing, 'heavy');
  assert.equal(flight.ended, 'landed');
  // 30 steps in the air, counted at the fixed step and nowhere near a point.
  assert.ok(Math.abs(flight.airSeconds - 30 * STEP) < 1e-12);
  // A heavy landing is a landing: both survived it.
  assert.equal(observer.tally.spinsLanded, 1);
  assert.equal(observer.tally.oneFootAirs, 1);

  // One flight, never a log: the next one replaces it.
  fly(observer, { id: 8 });
  assert.equal(observer.lastFlight?.id, 8);
});

test('identical facts produce an identical tally', () => {
  const script: FlightScript[] = [
    { id: 1, hopped: true, charge: 1, spinAt: 3, footAt: 4, landing: 'clean' },
    { id: 2, hopped: true, charge: 0.4, landing: 'crash' },
    { id: 3, spinAt: 2, landing: 'wobble' },
    { id: 4, footAt: 6, air: 40, landing: 'clean' },
  ];
  const first = new TrickObserver();
  const second = new TrickObserver();
  for (const flight of script) fly(first, flight);
  for (const flight of script) fly(second, flight);
  assert.deepEqual(first.tally, second.tally);
  assert.deepEqual(first.lastFlight, second.lastFlight);
  // And it is not vacuous: the script really did count things.
  assert.deepEqual(first.tally, {
    cleanLandings: 0,
    chargedHops: 1,
    spinsLanded: 2,
    oneFootAirs: 2,
  });
});

test('the facts slot is filled and emptied by one writer', () => {
  const slot = createTrickFacts();
  assert.deepEqual(slot, facts({ flightIndex: 0 }));

  slot.flightIndex = 9;
  slot.tookOff = true;
  slot.hopped = true;
  slot.hopCharge = 1;
  slot.spinCompleted = true;
  slot.oneFootQualified = true;
  slot.touchedDown = true;
  slot.landingQuality = 'clean';
  slot.crashed = true;
  slot.reset = true;

  clearTrickFacts(slot);
  // **The flight it names survives the clear.** The controller's `flightIndex`
  // is not reset by a respawn either, and a slot that forgot it would make the
  // next step's facts look like a different flight's.
  assert.equal(slot.flightIndex, 9);
  assert.deepEqual(slot, facts({ flightIndex: 9 }));
});
