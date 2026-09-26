/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  COUCH_MIN_WIDTH_PX,
  COUCH_RIDES,
  COUCH_RIDE_LABELS,
  DEFAULT_COUCH_RIDE,
  couchEligible,
  cycleGuest,
  cycleSeatCharacter,
  guestBeside,
  isCouchRide,
  rosterFor,
  rosterForRide,
  type CouchRide,
} from './couch.ts';
import { nextSpectateTarget, seatRole, type SpectateTarget } from './seats.ts';
import { CHARACTER_IDS, DEFAULT_CHARACTER, type CharacterId } from '../data/riders.ts';

const DESKTOP = { viewportWidth: 1280, finePointer: true, padSeen: false };

test('a couch needs a window wide enough to split and a device to hold', () => {
  assert.equal(couchEligible(DESKTOP), true);
  // Narrow is refused whatever is plugged in: two halves of a phone are two
  // unreadable HUDs, and a pad does not make the window wider.
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: 800 }), false);
  assert.equal(couchEligible({ viewportWidth: 800, finePointer: true, padSeen: true }), false);
  // And width alone is not enough — a wide touch-only screen has one device.
  assert.equal(couchEligible({ viewportWidth: 1600, finePointer: false, padSeen: false }), false);
});

test('the threshold is inclusive, and an unmeasured window is not eligible', () => {
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: COUCH_MIN_WIDTH_PX }), true);
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: COUCH_MIN_WIDTH_PX - 1 }), false);
  // A viewport read before layout is NaN, and `NaN >= n` is false — but so is
  // `NaN < n`, which is why the comparison is written the way it is. A
  // predicate that let an unmeasured window through would show the button for
  // one frame on a phone.
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: Number.NaN }), false);
});

test('a pad that has been seen is a second device even with no mouse', () => {
  // The hybrid case §25.9 named: a touchscreen laptop, or a TV browser with a
  // pad and no pointer at all. Deliberately not `touchWanted`.
  assert.equal(couchEligible({ viewportWidth: 1440, finePointer: false, padSeen: true }), true);
});

test('the guest is never the rider the player is already wearing', () => {
  for (const id of CHARACTER_IDS) {
    assert.notEqual(guestBeside([id]), id, `${id} was offered themselves`);
  }
  // Including the one rider nobody may choose — the cop is a `CharacterId`.
  assert.ok(CHARACTER_IDS.includes(guestBeside(['cop'])));
});

test('cycling the guest card walks the roster and steps over the player', () => {
  const taken = DEFAULT_CHARACTER;
  let id = guestBeside([taken]);
  const seen = new Set<string>();
  // One full lap of the roster's *reachable* entries, which is every character
  // but the player's own.
  for (let step = 0; step < CHARACTER_IDS.length - 1; step += 1) {
    assert.notEqual(id, taken, 'the card stopped on the player’s own rider');
    seen.add(id);
    id = cycleGuest(id, [taken], 1);
  }
  assert.equal(seen.size, CHARACTER_IDS.length - 1, 'the card cannot reach every other rider');
  assert.equal(id, guestBeside([taken]), 'a full lap did not come back to the start');
});

test('cycling backwards is the exact inverse of cycling forwards', () => {
  const taken = CHARACTER_IDS[2];
  for (const start of CHARACTER_IDS) {
    if (start === taken) continue;
    assert.equal(cycleGuest(cycleGuest(start, [taken], 1), [taken], -1), start, `${start} did not return`);
  }
});

test('a two-rider roster with one taken has exactly one reachable card', () => {
  // The degenerate case a wrapping search has to survive: every step lands on
  // the taken rider except one. Proven against the real roster by taking every
  // entry but two out of consideration — `cycleGuest` may not spin.
  const only = CHARACTER_IDS[1];
  // Walking from the only reachable card must return it rather than hang or
  // fall off the roster.
  const others = CHARACTER_IDS.filter((id) => id !== only);
  assert.ok(CHARACTER_IDS.includes(cycleGuest(only, others, 1)));
  assert.ok(CHARACTER_IDS.includes(cycleGuest(only, others, -1)));
});

// ---------------------------------------------------------------------------
// What a couch session is for — M26 Phase 5 (q78)
// ---------------------------------------------------------------------------

test('the panel offers exactly the rides the game can start into', () => {
  // A list rather than a hand-walked union, so the control, the default and the
  // specs cannot drift. **The couch race joined at M27 Phase 3**, exactly as
  // §26.7 said it would — this list and the panel's own control, no new menu.
  //
  // The order is the order the panel offers them and is asserted as such: free
  // ride first because it is the default and the quietest, the race second
  // because it is what most rooms sitting down together came for, Knockabout
  // next because choosing a fight is a thing you do on purpose, and M38's
  // Trick Run after it for that same reason — it is a score, chosen
  // deliberately — and M39 Part P's police chase last of all (A-9): being
  // hunted is the most deliberate choice on the panel.
  assert.deepEqual([...COUCH_RIDES], ['freeRide', 'race', 'knockabout', 'trickRun', 'chase']);
  assert.ok(COUCH_RIDES.includes(DEFAULT_COUCH_RIDE), 'the default must be offerable');
  assert.equal(DEFAULT_COUCH_RIDE, 'freeRide', 'the quietest ride is the one you get by default');
});

test('every ride the panel offers has a name a player would recognise', () => {
  for (const ride of COUCH_RIDES) {
    const label = COUCH_RIDE_LABELS[ride];
    assert.ok(label.length > 0, `${ride} has no label`);
    assert.notEqual(label, ride, `${ride} is showing its own identifier`);
  }
});

test('a ride the panel does not offer is refused rather than trusted', () => {
  // The select's value crosses a DOM boundary as a string, and a stale option
  // left in the markup would otherwise reach `Game` as a mode nobody built.
  for (const ride of COUCH_RIDES) assert.equal(isCouchRide(ride), true);
  // The chase is a couch ride since M39 Part P, and like Trick Run it is
  // spelled as the state it rides on (§39.6b.3b).
  assert.equal(isCouchRide('chase'), true);
  assert.equal(isCouchRide('Chase'), false);
  assert.equal(isCouchRide('policeChase'), false);
  // `trackDay` is the *state* a couch race rides on and never a couch ride
  // itself. `trickRun` is both, which is the one asymmetry M38 adds: the state
  // and the couch ride are spelled the same because the mode has one name.
  assert.equal(isCouchRide('trackDay'), false);
  assert.equal(isCouchRide('trickRun'), true);
  assert.equal(isCouchRide(''), false);
  assert.equal(isCouchRide('FREERIDE'), false);
});

test('the chase is called what the title calls it', () => {
  // A-9: the title's chase button reads "Police chase", so the panel does too.
  assert.equal(COUCH_RIDE_LABELS.chase, 'Police chase');
});

// ---------------------------------------------------------------------------
// The cop seat on the join wheel — M39 Part P (docs/PLANS.md §39.6b.3b, q215)
// ---------------------------------------------------------------------------

const NOT_CHASE: readonly CouchRide[] = COUCH_RIDES.filter((ride) => ride !== 'chase');

test('the roster offers Officer Dorkins on the chase only, once, and last', () => {
  const chase = rosterFor('chase');
  assert.deepEqual([...chase], [...CHARACTER_IDS, 'cop']);
  assert.equal(chase.filter((id) => id === 'cop').length, 1, 'the cop is on the wheel twice');
  for (const ride of NOT_CHASE) {
    assert.deepEqual([...rosterFor(ride)], [...CHARACTER_IDS], `${ride} changed its wheel`);
    assert.equal(rosterFor(ride).includes('cop'), false, `${ride} offers the cop`);
  }
});

test('off the chase the seat wheel is cycleGuest, step for step', () => {
  // The walk runs round the cop's slot and skips it, so every ride a player
  // already knows walks exactly as it did before Part P.
  for (const ride of NOT_CHASE) {
    for (const taken of [[DEFAULT_CHARACTER], [CHARACTER_IDS[0], CHARACTER_IDS[3]], CHARACTER_IDS.slice(0, 3)]) {
      for (const start of CHARACTER_IDS) {
        for (const delta of [1, -1] as const) {
          assert.equal(
            cycleSeatCharacter(start, taken, delta, ride),
            cycleGuest(start, taken, delta),
            `${ride}: ${start} ${delta} over ${taken.join()}`,
          );
        }
      }
    }
  }
});

test('on the chase the wheel reaches the cop one past the last rider, and back', () => {
  const last = CHARACTER_IDS[CHARACTER_IDS.length - 1];
  assert.equal(cycleSeatCharacter(last, [DEFAULT_CHARACTER], 1, 'chase'), 'cop');
  assert.equal(cycleSeatCharacter('cop', [DEFAULT_CHARACTER], -1, 'chase'), last);
  // A full lap from anywhere visits every playable rider nobody holds plus the
  // cop, each once, and comes home.
  const taken: CharacterId[] = [DEFAULT_CHARACTER];
  const start = guestBeside(taken);
  const seen = new Set<CharacterId>();
  let id: CharacterId = start;
  do {
    assert.equal(seen.has(id), false, `${id} was offered twice in one lap`);
    seen.add(id);
    id = cycleSeatCharacter(id, taken, 1, 'chase');
  } while (id !== start);
  assert.equal(seen.size, CHARACTER_IDS.length, 'the chase wheel is not the roster plus the cop');
  assert.ok(seen.has('cop'));
});

test('a second Dorkins is refused: the wheel steps over a cop another seat holds', () => {
  // q68's distinctness applies to the cop too — one cop slot, one seat.
  const last = CHARACTER_IDS[CHARACTER_IDS.length - 1];
  const taken: CharacterId[] = ['cop', DEFAULT_CHARACTER];
  for (const start of CHARACTER_IDS) {
    if (start === DEFAULT_CHARACTER) continue;
    for (const delta of [1, -1] as const) {
      assert.notEqual(cycleSeatCharacter(start, taken, delta, 'chase'), 'cop', `${start} ${delta} dealt a second cop`);
    }
  }
  assert.equal(cycleSeatCharacter(last, taken, 1, 'chase'), CHARACTER_IDS[0] === DEFAULT_CHARACTER
    ? CHARACTER_IDS[1]
    : CHARACTER_IDS[0]);
});

test('a seat still wearing the cop when the ride is not the chase steps onto a playable rider', () => {
  for (const ride of NOT_CHASE) {
    const forward = cycleSeatCharacter('cop', [DEFAULT_CHARACTER], 1, ride);
    const back = cycleSeatCharacter('cop', [DEFAULT_CHARACTER], -1, ride);
    assert.ok(CHARACTER_IDS.includes(forward as never), `${ride}: ${forward}`);
    assert.ok(CHARACTER_IDS.includes(back as never), `${ride}: ${back}`);
    assert.notEqual(forward, DEFAULT_CHARACTER);
    assert.notEqual(back, DEFAULT_CHARACTER);
  }
});

test('switching away from the chase re-deals the cop before anything is written', () => {
  const room: CharacterId[] = ['cool-rider' as CharacterId, 'cop', 'trollina' as CharacterId];
  const frozen = [...room];
  for (const ride of NOT_CHASE) {
    const fixed = rosterForRide(room, ride);
    assert.deepEqual(room, frozen, 'rosterForRide mutated its argument');
    assert.notEqual(fixed, room, 'rosterForRide handed back its argument');
    assert.equal(fixed.includes('cop'), false, `${ride} kept a cop seat`);
    assert.equal(new Set(fixed).size, fixed.length, `${ride} dealt two seats the same rider`);
    // Every seat that was not the cop is exactly as it was.
    assert.equal(fixed[0], room[0]);
    assert.equal(fixed[2], room[2]);
  }
  // On the chase the cop seat is legal and nothing changes.
  assert.deepEqual(rosterForRide(room, 'chase'), room);
});

test('the chase keeps one Dorkins, on the first seat that holds him', () => {
  const room: CharacterId[] = ['cop', 'cool-rider' as CharacterId, 'cop', 'cop'];
  const fixed = rosterForRide(room, 'chase');
  assert.equal(fixed[0], 'cop');
  assert.equal(fixed[1], room[1]);
  assert.equal(fixed.filter((id) => id === 'cop').length, 1);
  assert.equal(new Set(fixed).size, fixed.length, 'the re-dealt seats collided');
});

// ---------------------------------------------------------------------------
// The seat's role and the spectator's camera — M39 Part P (seats.ts, q215, q226)
// ---------------------------------------------------------------------------

test('a seat is the cop exactly when it wears Officer Dorkins', () => {
  assert.equal(seatRole('cop'), 'cop');
  for (const id of CHARACTER_IDS) assert.equal(seatRole(id), 'outlaw', `${id} read as the cop`);
});

const seat = (index: number): SpectateTarget => ({ kind: 'seat', index });
const pursuer = (index: number): SpectateTarget => ({ kind: 'pursuer', index });

test('a spectator cycles the standing outlaws, then the CPU pack, and wraps', () => {
  // Seat 1 is busted in a 3v1-CPU room: seats 0 and 2 stand, pursuer 0 stands.
  let target = nextSpectateTarget(null, 1, [2, 0], -1, [0]);
  assert.deepEqual(target, seat(0), 'the cycle does not start at the first standing outlaw');
  target = nextSpectateTarget(target, 1, [2, 0], -1, [0]);
  assert.deepEqual(target, seat(2));
  target = nextSpectateTarget(target, 1, [2, 0], -1, [0]);
  assert.deepEqual(target, pursuer(0), 'the cop is not last');
  target = nextSpectateTarget(target, 1, [2, 0], -1, [0]);
  assert.deepEqual(target, seat(0), 'the cycle does not wrap');
  // Himself never, even if a caller lists him as standing.
  assert.deepEqual(nextSpectateTarget(null, 1, [1], -1, [0, 2]), pursuer(0));
  assert.deepEqual(nextSpectateTarget(pursuer(0), 1, [1], -1, [0, 2]), pursuer(2));
});

test('beside a human cop the cycle ends on the cop seat', () => {
  // A 2v1-human room: seat 3 is the cop, seat 0 is busted, seat 1 stands.
  assert.deepEqual(nextSpectateTarget(null, 0, [1], 3, []), seat(1));
  assert.deepEqual(nextSpectateTarget(seat(1), 0, [1], 3, []), seat(3));
  assert.deepEqual(nextSpectateTarget(seat(3), 0, [1], 3, []), seat(1));
  // The cop seat is never offered twice even if listed among the outlaws.
  assert.deepEqual(nextSpectateTarget(seat(1), 0, [1, 3], 3, [0]), seat(3));
  assert.deepEqual(nextSpectateTarget(seat(3), 0, [1, 3], 3, [0]), seat(1));
});

test('a target who has gone down steps on to the next body, not back to the start', () => {
  // Watching seat 1 when seat 1 is busted too: the next standing body after
  // seat 1 is seat 3, not seat 0.
  assert.deepEqual(nextSpectateTarget(seat(1), 2, [0, 3], -1, [0, 1]), seat(3));
  // Watching pursuer 1 when he is down: pursuer 2 is next.
  assert.deepEqual(nextSpectateTarget(pursuer(1), 2, [0], -1, [0, 2]), pursuer(2));
  // Past the end of the cycle, round to the first.
  assert.deepEqual(nextSpectateTarget(pursuer(5), 2, [0], -1, [0, 2]), seat(0));
});

test('nobody left standing is nobody to watch', () => {
  assert.equal(nextSpectateTarget(null, 0, [], -1, []), null);
  assert.equal(nextSpectateTarget(seat(1), 0, [0], -1, []), null);
});

test('a cycle of one answers the body already watched — the press Game then treats as a no-op', () => {
  // QA r1: a 3v1-CPU room after both other outlaws went down, or a 2v1 room
  // whose other outlaw is out while the pack is the human cop's alone. The
  // answer is the current target, and `Game.cycleSpectate` must not re-snap
  // the camera onto it (pinned on its source below).
  assert.deepEqual(nextSpectateTarget(seat(2), 0, [2], -1, []), seat(2));
  assert.deepEqual(nextSpectateTarget(pursuer(0), 0, [], -1, [0]), pursuer(0));
});

/**
 * The composition root cannot be built headless, so the two couch-chase
 * shapes QA r1 repaired are pinned on its source, the way the other
 * `Game.ts` readers pin theirs.
 */
const GAME_SOURCE = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

function methodBody(signature: string): string {
  const at = GAME_SOURCE.indexOf(signature);
  assert.ok(at >= 0, `Game.ts no longer declares ${signature}`);
  const next = GAME_SOURCE.indexOf('\n  private ', at + signature.length);
  return GAME_SOURCE.slice(at, next < 0 ? undefined : next);
}

test('a busted outlaw\'s hidden wheel is parked at the hide and never stepped again', () => {
  // §39.6b.3b "Busted, then watching" (q216): his rig leaves the world, and
  // so does his wheel — otherwise the controller's auto-recover stands the
  // invisible body up 2 s after the hide, chirps and rolls it on.
  const watchers = methodBody('private stepChaseWatchers(');
  const hide = watchers.indexOf('seat.rig.group.visible = false;');
  const park = watchers.indexOf('this.standStill(seat, seatIndex);');
  assert.ok(hide >= 0 && park > hide, 'the hide no longer parks the wheel where it lies');
  const standStill = methodBody('private standStill(');
  assert.ok(standStill.includes('seat.controller.reset('), 'standStill no longer stops the controller');
  assert.ok(standStill.includes('this.audio.resetRider(index);'), 'standStill no longer clears the crash book (the chirp)');

  const stepSeat = methodBody('private stepSeat(');
  const frozen = stepSeat.indexOf('if (this.chaseFrozen) {');
  const out = stepSeat.indexOf('if (this.chaseIsCouch && this.chaseSeatOut[index]) {');
  const integrate = stepSeat.indexOf('seat.controller.step(stepSeconds, actions);');
  assert.ok(frozen >= 0 && out > frozen && integrate > out,
    'stepSeat integrates a seat the chase has taken out of the world');
  assert.match(stepSeat.slice(out, out + 160), /return false;/, 'the out seat\'s branch does not stop the step');
});

test('the spectator\'s camera press is a no-op when it moves nowhere', () => {
  const cycle = methodBody('private cycleSpectate(');
  const guard = cycle.indexOf('next.kind === current.kind && next.index === current.index) return;');
  const watch = cycle.indexOf('this.watch(seat, next);');
  assert.ok(guard >= 0 && watch > guard, 'cycleSpectate re-snaps the camera onto the body it is already watching');
});

test('QA r2: a pane glued to the cop being returned is not asked about his return, and is snapped with him', () => {
  // §39.6b.3b "Returns with several cameras": a spectator following a CPU cop
  // is carried with him, so his camera cannot see a body appear. Judged by
  // it, the rung ahead of the tail was refused every retry (a busted outlaw
  // could hold the lone tail off his teammates) and a post behind the patrol
  // was accepted while the pane was centred on him.
  const roomPanes = methodBody('private refreshRoomPanes(');
  assert.match(roomPanes, /private refreshRoomPanes\(moving = -1\)/, 'the room panes no longer know which cop is moving');
  assert.match(roomPanes, /target\.kind === 'pursuer' && target\.index === moving\) continue;/,
    'a spectator glued to the moving cop still judges his return');
  const pane = methodBody('private refreshPane(');
  assert.ok(pane.includes('this.refreshRoomPanes(moving);'), 'refreshPane drops the moving cop');
  const tail = methodBody('private regroupTail(');
  const post = methodBody('private returnToPost(');
  assert.ok(tail.includes('this.refreshPane(pursuer.index);'), 'the tail return is judged by his own watcher\'s pane');
  assert.ok(post.includes('this.refreshPane(pursuer.index);'), 'the post return is judged by his own watcher\'s pane');
  // And the watcher is snapped onto the new pose after the placement — never
  // before it (a refused return must not touch his pane).
  const place = methodBody('private placePursuer(');
  const reset = place.indexOf('pursuer.controller.reset(spawn, speed);');
  const copied = place.indexOf('copyPose(pursuer.current, pursuer.render);');
  const snap = place.indexOf('this.watch(seat, target);');
  assert.ok(reset >= 0 && copied > reset && snap > copied, 'a watcher of a placed cop is not snapped after the placement');
  assert.match(place.slice(copied, snap), /target\.kind === 'pursuer' && target\.index === pursuer\.index/);
});

test('QA r2: a watcher sees the bust he was watching; the hand-on waits for the rig to leave', () => {
  // `watchable` keeps an outlaw whose crash beat is still playing, and the
  // watchers run in two passes — every hide first, then every hand-on — so a
  // watcher is handed on on the very step the rig leaves, whatever the seat
  // order.
  const watchable = methodBody('private watchable(');
  assert.match(watchable, /statusOf\(outlaw\) === 'standing' \|\| this\.chaseOutBeat\[target\.index\] >= 0/,
    'a busted outlaw stops being watchable before his beat plays');
  const watchers = methodBody('private stepChaseWatchers(');
  const hide = watchers.indexOf('seat.rig.group.visible = false;');
  const handOn = watchers.indexOf('this.watch(seat, this.nearestWatchTarget(seatIndex));');
  assert.ok(hide >= 0 && handOn > hide, 'the hand-on no longer follows the hide');
  assert.equal(watchers.split('this.watch(').length - 1, 1, 'a second hand-on path crept back in');
  // The two loops: the hand-on sits in the second, after every hide.
  const loops = watchers.split('for (let seatIndex = 0; seatIndex < this.seats.length; seatIndex += 1)').length - 1;
  assert.equal(loops, 2, 'the hide pass and the hand-on pass are no longer separate');
  // A body going down is still never chosen: the target rule and the press
  // take standing outlaws only.
  assert.match(methodBody('private nearestWatchTarget('), /statusOf\(outlaw\) !== 'standing'\) continue;/);
  assert.match(methodBody('private cycleSpectate('), /statusOf\(outlaw\) !== 'standing'\) continue;/);
});

test('QA r2: the room card reads the room the drawn frame already read', () => {
  // `chaseRoom.state` allocates, and a drawn frame reads it once
  // (`chaseFrameState`); the idle quadrant's card takes that read rather than
  // a second one. The callers outside a frame read it fresh.
  const idle = methodBody('private updateIdlePane(');
  assert.match(idle, /private updateIdlePane\(frame: ChaseRoomState \| null = null\)/);
  assert.ok(idle.includes('const room = frame ?? this.chaseRoom.state;'), 'the room card reads the room a second time');
  assert.ok(GAME_SOURCE.includes('this.updateIdlePane(this.chaseFrameState);'), 'the drawn frame does not hand the card its read');
});

test('QA r3: Settings\' reset keeps the host\'s cop, and a re-dress keeps a busted seat out of the world', () => {
  // q215's two places (§25.5): `hostCop` and seat 0's rig move together.
  // "Reset everything to defaults" is reachable from the pause card mid-chase
  // and rewrites the saved rider; the options listener must not dress the
  // host's cop seat in it, or the card, the join wheel and the room's
  // `chaseCopSeat` go on saying he is the cop while he rides a playable rig.
  const apply = methodBody('private applyOptions(');
  const branch = apply.indexOf('if (previous !== null && options.character !== previous.character) {');
  assert.ok(branch >= 0, 'applyOptions no longer re-dresses on a changed record');
  const guarded = apply.indexOf('if (!this.hostCop) this.installCharacter(options.character);', branch);
  assert.ok(guarded > branch, 'a reset of the record re-dresses the host holding Officer Dorkins');
  assert.equal(apply.split('this.installCharacter(').length - 1, 1, 'a second, unguarded re-dress crept in');
  // The other door that writes the record mid-session clears the field first.
  const wheel = methodBody('private cycleCouchRider(');
  const cleared = wheel.indexOf('this.hostCop = false;');
  const written = wheel.indexOf('this.options.set({ character: moved as PlayableCharacterId });');
  assert.ok(cleared >= 0 && written > cleared, 'the wheel writes the record before clearing hostCop');

  // A busted outlaw re-dressed (the host by the reset, a guest by q68's
  // repair) stays hidden, and a watching pane is not snapped onto his body.
  const dress = methodBody('private dressSeat(');
  const kept = dress.indexOf('const shown = seat.rig.group.visible;');
  const born = dress.indexOf('seat.rig = rigFor(id);');
  const restored = dress.indexOf('seat.rig.group.visible = shown;');
  assert.ok(kept >= 0 && born > kept && restored > born, 'a re-dress stands a hidden rig back in the world');
  const install = methodBody('private installCharacter(');
  assert.match(install, /if \(seat\.spectating === undefined \|\| seat\.spectating === null\) this\.syncCamera\(seat\);/,
    'a re-dress snaps a spectator\'s camera onto his own parked body');
});

test('QA r3: every record site asks the one couch predicate, the Trick Run\'s filing included', () => {
  // §39.6b.3b "Records": one named predicate (`Game.couchSession`) is asked in
  // all four places that refuse a couch record, so the next mode asks rather
  // than rediscovers the rule. The Trick Run's filing had kept only the
  // referee's own seat count.
  for (const site of [
    'private finishChase(',
    'private finishKnockabout(',
    'private enterTrackDay(',
    'private fileTrickRun(',
  ]) {
    assert.ok(methodBody(site).includes('this.couchSession'), `${site.slice(8, -1)} no longer asks couchSession`);
  }
  assert.match(methodBody('private fileTrickRun('), /if \(this\.couchSession \|\| result\.seats !== 1\) return;/);
});
