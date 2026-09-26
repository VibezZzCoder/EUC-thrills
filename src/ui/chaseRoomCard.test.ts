/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  CHASE_ROOM_TABLE,
  CHASE_TOUCH_NOTE,
  COUCH_CHASE_NOT_SAVED,
  chaseCopLabel,
  chaseRoomCard,
  chaseRoomResults,
  chaseRoomVerdict,
  oneCopBestNote,
  rankChaseOutlaws,
  type ChaseCardOutlaw,
  type ChaseRoomResultsInput,
} from './chaseRoomCard.ts';

/**
 * The chase room's cards, pinned headlessly — M39 Part P (§39.6b.3b, q222,
 * q225, q227, q213). Every string a room of four reads off the idle quadrant
 * and the results card is composed by a pure builder, so the ranking, the
 * headline variants and the cop's naming are `node --test` facts rather than
 * something a four-pane browser spec has to catch.
 */

function outlaw(overrides: Partial<ChaseCardOutlaw> & Pick<ChaseCardOutlaw, 'seat' | 'name'>): ChaseCardOutlaw {
  return { status: 'standing', survived: 0, place: 0, ...overrides };
}

function result(overrides: Partial<ChaseRoomResultsInput> = {}): ChaseRoomResultsInput {
  return {
    seconds: 300,
    bellSeconds: 300,
    swept: false,
    escaped: 1,
    outlaws: [
      outlaw({ seat: 0, name: 'Cool Rider', status: 'escaped', survived: 300, place: 1 }),
      outlaw({ seat: 1, name: 'Trollina', status: 'caught', survived: 134.8, place: 2 }),
      outlaw({ seat: 3, name: 'Seal on a Wheel', status: 'gaveUp', survived: 63.2, place: 3 }),
    ],
    cop: { seat: 2, busts: 1 },
    seed: '',
    ...overrides,
  };
}

test('the headline is the room verdict, one form per ending (q222)', () => {
  const three = result().outlaws;
  // A clean sweep names the officer and the moment it happened, floored.
  const swept = chaseRoomResults(result({
    seconds: 192.9,
    swept: true,
    escaped: 0,
    outlaws: three.map((one, k) => ({ ...one, status: 'caught' as const, survived: 100 + k, place: 3 - k })),
    cop: { seat: -1, busts: 3 },
  }));
  assert.equal(swept.heading, 'Officer Dorkins busted everyone — 3:12');

  // Partial escapes count the outlaws in words, the plan's own sentence.
  const two = chaseRoomVerdict(
    [three[0], { ...three[1], status: 'escaped' }, three[2]],
    { seat: 2, busts: 0 },
    2,
  );
  assert.equal(two, 'Two outlaws got away');
  assert.equal(chaseRoomVerdict(three, { seat: 2, busts: 1 }, 1), 'One outlaw got away');

  // Everybody standing at the bell.
  const all = three.map((one) => ({ ...one, status: 'escaped' as const, survived: 300, place: 1 }));
  assert.equal(chaseRoomResults(result({ escaped: 3, outlaws: all, cop: { seat: 2, busts: 0 } })).heading,
    'Everyone got away');
  // A 1v1 (q228) says the rider's name, because "everyone" is one person there.
  assert.equal(chaseRoomVerdict([all[0]], { seat: 1, busts: 0 }, 1), 'Cool Rider got away');
  // And a 1v1 sweep names him too (QA r2): "busted everyone" over one row and
  // "Busted 1 of 1" was the wording the escape's rule exists to refuse.
  assert.equal(chaseRoomVerdict([{ ...all[0], status: 'caught' }], { seat: 1, busts: 1 }, 0),
    'Officer Dorkins busted Cool Rider');
  assert.equal(chaseRoomResults(result({
    seconds: 62.4,
    swept: true,
    escaped: 0,
    outlaws: [outlaw({ seat: 0, name: 'Trollina', status: 'caught', survived: 62.4, place: 1 })],
    cop: { seat: 1, busts: 1 },
  })).heading, 'Officer Dorkins busted Trollina — 1:02');
  // A 1v1 the outlaw gave up is nobody's bust, and still says so.
  assert.equal(chaseRoomVerdict([{ ...all[0], status: 'gaveUp' }], { seat: 1, busts: 0 }, 0), 'Nobody got away');

  // **No credit the referee did not give** (q225): a room swept by a bust and
  // a give-up is still nobody escaping, but the cop did not bust everyone.
  const mixed = chaseRoomResults(result({
    seconds: 150,
    swept: true,
    escaped: 0,
    outlaws: [
      outlaw({ seat: 0, name: 'Cool Rider', status: 'caught', survived: 150, place: 1 }),
      outlaw({ seat: 1, name: 'Trollina', status: 'gaveUp', survived: 40, place: 2 }),
    ],
    cop: { seat: 2, busts: 1 },
  }));
  assert.equal(mixed.heading, 'Nobody got away — 2:30');
  assert.ok(!mixed.heading.includes('busted everyone'));
});

test('outlaws rank by time standing, the escaped sharing first place (q86)', () => {
  const view = chaseRoomResults(result({
    escaped: 2,
    outlaws: [
      outlaw({ seat: 2, name: 'Wheel in Motion', status: 'escaped', survived: 300, place: 1 }),
      outlaw({ seat: 0, name: 'Cool Rider', status: 'touched', survived: 88.4, place: 3 }),
      outlaw({ seat: 1, name: 'Trollina', status: 'escaped', survived: 300, place: 1 }),
    ],
    cop: { seat: 3, busts: 1 },
  }));
  // Two firsts — no tie-break invented — shown in seat order, then the third.
  assert.deepEqual(view.rows.map((row) => row.label), [
    '1. Trollina',
    '1. Wheel in Motion',
    '3. Cool Rider',
    'Officer Dorkins (P4)',
  ]);
  assert.deepEqual(view.rows.map((row) => row.extra), [
    'Got away', 'Got away', 'Touched Dorkins', 'Busted 1 of 3',
  ]);
  assert.deepEqual(view.rows.map((row) => row.time), ['5:00.00', '5:00.00', '1:28.40', '5:00.00']);
  assert.deepEqual(view.rows.map((row) => row.ahead), [true, true, false, false]);
  // The comparison column is empty on every row (§9k).
  assert.ok(view.rows.every((row) => row.delta === ''));

  // A card drawn from state one step before the referee swept its places
  // still ranks by the referee's own rule rather than printing zeroes.
  const early = rankChaseOutlaws([
    outlaw({ seat: 0, name: 'A', status: 'caught', survived: 50 }),
    outlaw({ seat: 1, name: 'B', status: 'escaped', survived: 300 }),
    outlaw({ seat: 2, name: 'C', status: 'escaped', survived: 300 }),
  ]);
  assert.deepEqual(early.map((entry) => `${entry.place}${entry.outlaw.name}`), ['1B', '1C', '3A']);
});

test('each outlaw row says who busted him, or that he gave up (q222, q225)', () => {
  const view = chaseRoomResults(result({
    escaped: 0,
    swept: true,
    outlaws: [
      outlaw({ seat: 0, name: 'Cool Rider', status: 'caught', survived: 200, place: 1 }),
      outlaw({ seat: 1, name: 'Trollina', status: 'strayed', survived: 120, place: 2 }),
      outlaw({ seat: 2, name: 'Maribel Vargas', status: 'gaveUp', survived: 20, place: 3 }),
    ],
    cop: { seat: -1, busts: 1 },
  }));
  assert.deepEqual(view.rows.map((row) => row.extra), [
    'Busted by Dorkins', 'Out of bounds', 'Gave up', 'Busted 1 of 3',
  ]);
});

test('the cop row names the human seat or the CPU pack (q227)', () => {
  assert.equal(chaseCopLabel({ seat: 2, busts: 0 }), 'Officer Dorkins (P3)');
  assert.equal(chaseCopLabel({ seat: 0, busts: 0 }), 'Officer Dorkins (P1)');
  assert.equal(chaseCopLabel({ seat: -1, busts: 0 }), 'Officer Dorkins (CPU)');
  const cpu = chaseRoomResults(result({ cop: { seat: -1, busts: 2 } }));
  const last = cpu.rows[cpu.rows.length - 1];
  assert.equal(last.label, 'Officer Dorkins (CPU)');
  assert.equal(last.extra, 'Busted 2 of 3');
  // The cop row is the round's clock, since he rode all of it.
  assert.equal(last.time, '5:00.00');
});

test('the room card speaks the chase language and saves nothing', () => {
  const view = chaseRoomResults(result({ seed: 'maple-44' }));
  assert.deepEqual(view.table, CHASE_ROOM_TABLE);
  assert.equal(view.table.delta, '', 'a couch compares nothing (§9k)');
  assert.equal(view.table.extra, 'Result');
  assert.equal(view.isRecord, false);
  assert.equal(view.deltaToBest, '');
  // The summary figures are the rules the round was held under (§9o).
  assert.equal(view.totalCaption, 'Outlaws');
  assert.equal(view.total, '3');
  assert.equal(view.bestCaption, 'To survive');
  assert.equal(view.best, '5:00');
  // Seed first, the not-saved note last; no touch line when nobody touched.
  assert.deepEqual(view.notes, ['Route seed maple-44', COUCH_CHASE_NOT_SAVED]);
  assert.equal(COUCH_CHASE_NOT_SAVED, 'Couch chases are not saved');
  // One row per outlaw plus the cop's, and no tricks region.
  assert.equal(view.rows.length, 4);
  assert.equal(view.tricks, undefined);
  assert.equal(view.mode, undefined);

  // Touches are said in their rows, not in a third note: the card's fit has
  // no room for one (P6 notes), and the cell already names what happened.
  const touched = chaseRoomResults(result({
    escaped: 1,
    outlaws: [
      outlaw({ seat: 0, name: 'Cool Rider', status: 'touched', survived: 10, place: 3 }),
      outlaw({ seat: 1, name: 'Trollina', status: 'escaped', survived: 300, place: 1 }),
      outlaw({ seat: 2, name: 'Red Rider', status: 'touched', survived: 20, place: 2 }),
    ],
    cop: { seat: 3, busts: 2 },
  }));
  assert.deepEqual(touched.notes, [COUCH_CHASE_NOT_SAVED]);
  assert.deepEqual(touched.rows.map((row) => row.extra).slice(0, 3),
    ['Got away', 'Touched Dorkins', 'Touched Dorkins']);
});

test('the idle quadrant becomes the room card: clock, every outlaw, the cop (§39.6b.3b)', () => {
  const outlaws = [
    outlaw({ seat: 1, name: 'Trollina', status: 'caught', survived: 134.8 }),
    outlaw({ seat: 0, name: 'Cool Rider', status: 'standing', survived: 181.2 }),
  ];
  const running = chaseRoomCard({ phase: 'running', remaining: 118.8, outlaws, cop: { seat: 2, busts: 1 } });
  // A deadline is ceiled like every deadline on screen.
  assert.equal(running.title, '1:59 left');
  // Seat order while running — rows must not change places mid-round.
  assert.deepEqual(running.rows, [
    { label: 'Cool Rider', value: 'Riding · 3:01' },
    { label: 'Trollina', value: 'Busted · 2:14' },
    { label: 'Officer Dorkins (P3)', value: 'Busts 1 of 2' },
  ]);

  assert.equal(chaseRoomCard({ phase: 'countdown', remaining: 300, outlaws, cop: { seat: 2, busts: 0 } }).title,
    'Getting ready');

  const ended = chaseRoomCard({
    phase: 'ended',
    remaining: 0,
    outlaws: [
      outlaw({ seat: 1, name: 'Trollina', status: 'caught', survived: 134.8, place: 2 }),
      outlaw({ seat: 0, name: 'Cool Rider', status: 'escaped', survived: 300, place: 1 }),
      outlaw({ seat: 2, name: 'Red Rider', status: 'gaveUp', survived: 61, place: 3 }),
    ],
    cop: { seat: -1, busts: 1 },
  });
  assert.equal(ended.title, 'One outlaw got away');
  // Ranked once it is over, with the referee's shared places.
  assert.deepEqual(ended.rows.map((row) => row.label), [
    '1. Cool Rider', '2. Trollina', '3. Red Rider', 'Officer Dorkins (CPU)',
  ]);
  assert.deepEqual(ended.rows.map((row) => row.value), [
    'Got away · 5:00', 'Busted · 2:14', 'Gave up · 1:01', 'Busts 1 of 3',
  ]);
});

test('the solo card keeps two lines from here: the touch note and q213', () => {
  assert.equal(CHASE_TOUCH_NOTE, 'You touched an officer — that is an instant bust');
  // q213: one line when a one-cop best exists, and nothing when none does.
  assert.equal(oneCopBestNote(null), null);
  assert.equal(oneCopBestNote({ seconds: 300, escaped: true }), 'Best against one cop: 5:00.00, escaped');
  assert.equal(oneCopBestNote({ seconds: 212.456, escaped: false }), 'Best against one cop: 3:32.46');
});
