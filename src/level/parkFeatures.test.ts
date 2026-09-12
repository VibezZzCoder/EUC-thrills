/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TERRAIN, WHEEL } from '../data/tuning.ts';
import {
  corridorHeightAt,
  deck,
  lip,
  stairs,
  steppedDecks,
  type CorridorProfile,
} from './parkFeatures.ts';
import { collidersOf, placeChain, surfaceHeightAt, type SegmentSpec } from './segments.ts';

/**
 * Switchback Park's feature builders.
 *
 * The load-bearing claim is the first one below and everything else rests on
 * it: a height this module reports and a height `collidersOf` places are the
 * same number. That is asserted the only way it can be honestly asserted —
 * by placing the blocks on a real segment and reading the collider's top face
 * back — rather than by comparing this module's arithmetic with a second copy
 * of the same arithmetic written in the test, which would agree with a builder
 * that was wrong in exactly the way `AGENTS.md` warns a same-convention test
 * always agrees.
 *
 * The rest measures what the park's features are *for*: the drop at the end of
 * a level deck over a falling corridor, the equal edges of a rhythm, the
 * alley's "always half a step" staircase, and the face at a lip. Where a number
 * is quoted it was computed from the profile by hand and is checked against
 * `corridorHeightAt` as well, so a wrong constant here cannot pass by agreeing
 * with itself.
 */

/** Deliberately not at the origin, not level, and not facing +Z. */
const START = { position: { x: 4, y: 12.5, z: -7 }, headingY: 0.8 };

/** A 40 m corridor falling 4% in a straight line. The park's working gradient. */
const LINEAR: SegmentSpec = {
  id: 'linear', length: 40, climb: -1.6, linearClimb: true, halfWidth: 5, surface: 'pavement',
};

/** The same fall, eased: flat at both sockets and steepest in the middle. */
const EASED: SegmentSpec = {
  id: 'eased', length: 40, climb: -1.6, halfWidth: 5, surface: 'pavement',
};

/** The same fall again, crowned, banked, and bent — none of which is flat in t. */
const CROWNED: SegmentSpec = {
  id: 'crowned', length: 40, climb: -1.6, crown: 0.08, crossSlope: 0.05,
  curvature: 0.01, halfWidth: 4, surface: 'pavement',
};

/** The park's corridors are specs; the builders take the height half of one. */
function profileOf(spec: SegmentSpec): CorridorProfile {
  return {
    length: spec.length,
    climb: spec.climb,
    linearClimb: spec.linearClimb,
    crown: spec.crown,
    crossSlope: spec.crossSlope,
    halfWidth: spec.halfWidth,
  };
}

function near(actual: number, expected: number, tolerance: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: ${actual} vs ${expected} (tolerance ${tolerance})`,
  );
}

test('a reported top is the top face collidersOf places, on every cross section', () => {
  for (const spec of [LINEAR, EASED, CROWNED]) {
    for (const t of [0, 3, -3]) {
      const report = deck(profileOf(spec), {
        from: 6, length: 8, t, halfLateral: 1.2, lift: 0.12, surface: 'wood',
      });
      const [placed] = placeChain([{ ...spec, blocks: report.blocks }], START);
      const [collider] = collidersOf(placed);

      // Top face of a box is its centre plus its half extent, and `collidersOf`
      // builds both out of `surfaceHeightAt` and the block's own height.
      const topFace = collider.centre.y + collider.halfExtents.y;
      near(topFace, placed.entry.position.y + report.top, 1e-9, `${spec.id} top face at t=${t}`);

      // And the two ends the feature is authored by, through the same collider.
      near(
        topFace - (placed.entry.position.y + corridorHeightAt(profileOf(spec), 6, t)),
        report.entryFace,
        1e-9,
        `${spec.id} entry face at t=${t}`,
      );
      near(
        topFace - (placed.entry.position.y + corridorHeightAt(profileOf(spec), 14, t)),
        report.exitDrop,
        1e-9,
        `${spec.id} exit drop at t=${t}`,
      );
    }
  }
});

test('corridorHeightAt is surfaceHeightAt measured from the entry socket', () => {
  // The same claim without a block in the way, against `segments.ts`'s own
  // function rather than against a second copy of its arithmetic — including
  // past both ends, where every term clamps.
  for (const spec of [LINEAR, EASED, CROWNED]) {
    const [placed] = placeChain([spec], START);
    for (const s of [-5, 0, 0.5, 13, 27.25, 40, 46]) {
      for (const t of [0, 2.5, -3.75]) {
        const clamped = Math.min(spec.length, Math.max(0, s));
        assert.equal(
          placed.entry.position.y + corridorHeightAt(profileOf(spec), s, t),
          surfaceHeightAt(placed.entry, spec, clamped, t),
          `${spec.id} surface at (${s}, ${t})`,
        );
      }
    }
  }
});

test('a segment spec is itself a corridor profile', () => {
  // The intended call at the venue: hand the builder the spec being authored.
  const fromSpec = deck(LINEAR, { from: 6, length: 8, t: 0, halfLateral: 2, lift: 0, surface: 'wood' });
  const fromProfile = deck(profileOf(LINEAR), {
    from: 6, length: 8, t: 0, halfLateral: 2, lift: 0, surface: 'wood',
  });
  assert.deepEqual(fromSpec, fromProfile);
});

test('a flush deck on a falling corridor makes its own drop', () => {
  const flush = deck(profileOf(LINEAR), {
    from: 6, length: 8, t: 0, halfLateral: 2.4, lift: 0, surface: 'wood',
  });

  // Nothing to mount at the uphill end, and eight metres of 4% at the other.
  near(flush.entryFace, 0, 1e-12, 'flush entry face');
  near(flush.exitDrop, 0.32, 1e-9, 'flush exit drop');
  assert.ok(
    flush.exitDrop >= TERRAIN.dropLaunchThreshold,
    `a flush 8 m deck should still launch: ${flush.exitDrop} vs ${TERRAIN.dropLaunchThreshold}`,
  );

  // The lift adds to the whole deck, so it adds to the drop as well.
  const lifted = deck(profileOf(LINEAR), {
    from: 6, length: 8, t: 0, halfLateral: 2.4, lift: 0.05, surface: 'wood',
  });
  near(lifted.entryFace, 0.05, 1e-9, 'lifted entry face');
  near(lifted.exitDrop, 0.37, 1e-9, 'lifted exit drop');

  // One block, centred, and its height is measured at that centre — halfway
  // down the deck, which is neither of the two faces above.
  assert.equal(flush.blocks.length, 1);
  const [block] = flush.blocks;
  assert.equal(block.s, 10);
  assert.equal(block.halfAlong, 4);
  assert.equal(block.halfLateral, 2.4);
  assert.equal(block.surface, 'wood');
  assert.equal('depth' in block, false, 'depth is omitted so the block default applies');
  assert.equal('appearance' in block, false);
  near(block.height, 0.16, 1e-9, 'block height at the deck centre');
});

test('a deck passes its dressing through to the block', () => {
  const [block] = deck(profileOf(LINEAR), {
    from: 6, length: 8, t: 1.5, halfLateral: 2, lift: 0,
    surface: 'wood', appearance: 'stone', depth: 1.4,
  }).blocks;
  assert.equal(block.depth, 1.4);
  assert.equal(block.appearance, 'stone');
  assert.equal(block.t, 1.5);
});

test('stepped decks abut exactly and every edge between them is one step', () => {
  const profile = profileOf(LINEAR);
  const report = steppedDecks(profile, {
    from: 6, count: 3, deckLength: 10, gap: 0, stepDown: 0.30,
    t: 0, halfLateral: 2.4, lift: 0.05, surface: 'wood',
  });

  assert.equal(report.blocks.length, 3);
  assert.equal(report.decks.length, 3);

  // Three decks from 6 to 36 with nothing between them: block k ends where
  // block k+1 begins, to the bit.
  for (let index = 0; index < 2; index += 1) {
    const ends = report.blocks[index].s + report.blocks[index].halfAlong;
    const begins = report.blocks[index + 1].s - report.blocks[index + 1].halfAlong;
    near(ends, begins, 1e-12, `deck ${index} abuts deck ${index + 1}`);
  }

  // The tops are pinned to each other, not to the ground under them.
  const first = report.decks[0].top;
  near(first, corridorHeightAt(profile, 6, 0) + 0.05, 1e-12, 'first top');
  near(first, -0.19, 1e-9, 'first top, computed from the profile by hand');
  for (let index = 0; index < 3; index += 1) {
    near(report.decks[index].top, first - index * 0.30, 1e-9, `deck ${index} top`);
  }

  // The last deck ends at s = 36, where the corridor has fallen 1.44 m.
  const lastExit = report.decks[2].top - corridorHeightAt(profile, 36, 0);
  near(lastExit, 0.65, 1e-9, 'last exit drop, computed by hand');
  assert.deepEqual(report.drops.length, 3);
  near(report.drops[0], 0.30, 1e-12, 'first edge');
  near(report.drops[1], 0.30, 1e-12, 'second edge');
  near(report.drops[2], lastExit, 1e-12, 'last edge is the exit drop');
  near(report.drops[2], report.decks[2].exitDrop, 1e-12, 'last edge is the last deck');

  // Abutted, the catch after a deck is that deck's own exit drop.
  assert.equal(report.gapCatchDrops.length, 2);
  for (let index = 0; index < 2; index += 1) {
    near(
      report.gapCatchDrops[index],
      report.decks[index].exitDrop,
      1e-12,
      `zero-gap catch ${index}`,
    );
  }
});

test('a gap between decks is measured to the ground at its centre', () => {
  const profile = profileOf(LINEAR);
  const report = steppedDecks(profile, {
    from: 2, count: 3, deckLength: 10, gap: 3, stepDown: 0.30,
    t: 0, halfLateral: 2.4, lift: 0.05, surface: 'wood',
  });

  // Decks at [2,12], [15,25] and [28,38]; gap centres at 13.5 and 26.5.
  near(report.decks[0].top, -0.03, 1e-9, 'first top');
  for (const [index, centre] of [[0, 13.5], [1, 26.5]] as const) {
    near(
      report.gapCatchDrops[index],
      report.decks[index].top - corridorHeightAt(profile, centre, 0),
      1e-12,
      `catch drop into the gap after deck ${index}`,
    );
  }
  near(report.gapCatchDrops[0], 0.51, 1e-9, 'first catch drop, by hand');
  near(report.gapCatchDrops[1], 0.73, 1e-9, 'second catch drop, by hand');

  // A gap is corridor, not deck: the blocks no longer touch.
  near(report.blocks[0].s + report.blocks[0].halfAlong, 12, 1e-12, 'first deck ends');
  near(report.blocks[1].s - report.blocks[1].halfAlong, 15, 1e-12, 'second deck begins');
});

test('the alley recipe: level treads over a linear ramp are always half a step', () => {
  // `sliceLevel.ts`'s own numbers: 0.90 m over nine metres, three 0.30 m steps.
  const profile: CorridorProfile = { length: 9, climb: -0.90, linearClimb: true };
  const report = stairs(profile, {
    from: 0, steps: 3, tread: 3, rise: 0.30, t: 0, halfLateral: 2.9,
    surface: 'roughPavement', appearance: 'concrete',
  });

  assert.equal(report.blocks.length, 3);
  for (let index = 0; index < 3; index += 1) {
    near(report.treadHeights[index], 0.15, 1e-9, `tread ${index} height`);
    near(report.treadTops[index], -index * 0.30, 1e-9, `tread ${index} top`);
    near(report.blocks[index].s, 1.5 + index * 3, 1e-12, `tread ${index} centre`);
    assert.equal(report.blocks[index].halfAlong, 1.5);
    assert.equal(report.blocks[index].appearance, 'concrete');
  }

  // Tread 0 is flush, so the rider takes three equal steps: two between treads
  // and the last one off the bottom tread onto the corridor at s = 9.
  near(report.treadTops[0], corridorHeightAt(profile, 0, 0), 1e-12, 'tread 0 is flush at `from`');
  near(report.exitDrop, 0.30, 1e-9, 'exit drop off the last tread');
  near(
    report.exitDrop,
    report.treadTops[2] - corridorHeightAt(profile, 9, 0),
    1e-12,
    'exit drop against the corridor',
  );
  assert.ok(
    report.exitDrop >= TERRAIN.dropLaunchThreshold,
    'each step is a genuine face, not a fold',
  );
});

test('an eased corridor gives the same stairs unequal treads, and none is buried', () => {
  const profile: CorridorProfile = { length: 9, climb: -0.90 };
  const report = stairs(profile, {
    from: 0, steps: 3, tread: 3, rise: 0.30, t: 0, halfLateral: 2.9, surface: 'roughPavement',
  });

  // An eased profile is flat at both sockets, so it has fallen less than the
  // linear one by the first tread's centre and more by the last: the heights
  // are 1/15, 3/20 and 7/30 rather than three times 0.15.
  near(report.treadHeights[0], 1 / 15, 1e-9, 'first tread height');
  near(report.treadHeights[1], 0.15, 1e-9, 'middle tread height');
  near(report.treadHeights[2], 7 / 30, 1e-9, 'last tread height');
  assert.ok(
    report.treadHeights[0] < report.treadHeights[1]
      && report.treadHeights[1] < report.treadHeights[2],
    `the heights should differ per tread: ${report.treadHeights.join(', ')}`,
  );
  for (const [index, height] of report.treadHeights.entries()) {
    assert.ok(height >= 0, `tread ${index} height ${height} must not be negative`);
  }

  // The tops and the exit are the staircase's, not the corridor's.
  for (let index = 0; index < 3; index += 1) {
    near(report.treadTops[index], -index * 0.30, 1e-9, `tread ${index} top`);
  }
  near(report.exitDrop, 0.30, 1e-9, 'exit drop off the last tread');
});

test('stairs over a level corridor are refused, because a tread would be buried', () => {
  assert.throws(
    () => stairs({ length: 9 }, {
      from: 0, steps: 3, tread: 3, rise: 0.30, t: 0, halfLateral: 2.9, surface: 'roughPavement',
    }),
    /tread 1 would sit 0\.3 m BELOW the corridor/,
  );
});

test('a lip needs a reach, because the reach is the face', () => {
  const rising: CorridorProfile = { length: 14, climb: 0.9 };
  assert.throws(
    () => lip(rising, {
      at: 14, lead: 1, reach: 0, height: 0.15, t: 0, halfLateral: 2.2, surface: 'dirt',
    }),
    /lip reach must be greater than zero, got 0/,
  );
});

test('a lip through a crest reports the kerb on and the face off', () => {
  const rising: CorridorProfile = { length: 14, climb: 0.9 };
  const report = lip(rising, {
    at: 12, lead: 1, reach: 2, height: 0.10, t: 0, halfLateral: 2.2, surface: 'dirt',
  });

  near(report.top, corridorHeightAt(rising, 12, 0) + 0.10, 1e-12, 'top');
  near(
    report.stepUpAtStart,
    report.top - corridorHeightAt(rising, 11, 0),
    1e-12,
    'step up onto the lip',
  );
  near(
    report.dropAtLip,
    report.top - corridorHeightAt(rising, 14, 0),
    1e-12,
    'drop off the lip',
  );

  // Reported, not enforced — but this one is inside both of the wheel's limits
  // that matter: it can be mounted, and leaving it launches.
  near(report.stepUpAtStart, 0.156414, 1e-6, 'step up, computed by hand');
  assert.ok(
    report.stepUpAtStart < TERRAIN.stepUpPedalFactor * WHEEL.pedalHeight,
    `step up ${report.stepUpAtStart} must clear the wheel's derived ceiling`,
  );
  assert.ok(
    report.dropAtLip >= TERRAIN.dropLaunchThreshold,
    `drop ${report.dropAtLip} must be a launch, not a fold`,
  );

  // One block spanning [11, 14], centred at 12.5.
  assert.equal(report.blocks.length, 1);
  const [block] = report.blocks;
  near(block.s, 12.5, 1e-12, 'lip block centre');
  near(block.halfAlong, 1.5, 1e-12, 'lip block half length');
  near(block.height, report.top - corridorHeightAt(rising, 12.5, 0), 1e-12, 'lip block height');
});

test("a flush lip on a falling corridor is the corridor's own fall over its reach", () => {
  // Nothing lifted at all: the level top over a 12% descent is the whole drop.
  const falling: CorridorProfile = { length: 20, climb: -2.4, linearClimb: true };
  const report = lip(falling, {
    at: 0, lead: 0, reach: 2, height: 0, t: 0, halfLateral: 2.2, surface: 'dirt',
  });

  near(report.top, 0, 1e-12, 'top is the corridor at the crest');
  near(report.stepUpAtStart, 0, 1e-12, 'nothing to mount with no lead');
  near(report.dropAtLip, 0.24, 1e-9, 'drop off the lip');
  near(report.blocks[0].s, 1, 1e-12, 'block centre');
  near(report.blocks[0].height, 0.12, 1e-9, 'block height at its centre');
});

test('a feature that leaves its corridor is refused, with the offending numbers', () => {
  const profile = profileOf(LINEAR);

  assert.throws(
    () => deck(profile, { from: 36, length: 8, t: 0, halfLateral: 2, lift: 0, surface: 'wood' }),
    /deck ends at s=44, past the corridor's length 40/,
  );
  assert.throws(
    () => deck(profile, { from: -1, length: 8, t: 0, halfLateral: 2, lift: 0, surface: 'wood' }),
    /deck starts at s=-1, before the corridor's entry socket/,
  );
  assert.throws(
    () => deck(profile, { from: 6, length: 8, t: 0, halfLateral: -1, lift: 0, surface: 'wood' }),
    /deck halfLateral must be greater than zero, got -1/,
  );
  assert.throws(
    () => deck(profile, { from: 6, length: -8, t: 0, halfLateral: 2, lift: 0, surface: 'wood' }),
    /deck length must be greater than zero, got -8/,
  );
  assert.throws(
    () => steppedDecks(profile, {
      from: 6, count: 0, deckLength: 10, gap: 0, stepDown: 0.3,
      t: 0, halfLateral: 2, lift: 0, surface: 'wood',
    }),
    /steppedDecks count must be a whole number of at least 1, got 0/,
  );
  assert.throws(
    () => steppedDecks(profile, {
      from: 6, count: 4, deckLength: 10, gap: 0, stepDown: 0.3,
      t: 0, halfLateral: 2, lift: 0, surface: 'wood',
    }),
    /steppedDecks ends at s=46, past the corridor's length 40/,
  );
  assert.throws(
    () => stairs(profile, {
      from: 0, steps: 3, tread: 0, rise: 0.3, t: 0, halfLateral: 2, surface: 'wood',
    }),
    /stairs tread must be greater than zero, got 0/,
  );
  assert.throws(
    () => stairs(profile, {
      from: 0, steps: 3, tread: -3, rise: 0.3, t: 0, halfLateral: 2, surface: 'wood',
    }),
    /stairs tread must be greater than zero, got -3/,
  );
});

test('a cross section without its half width is refused, not silently flattened', () => {
  // The one field `CorridorProfile`'s Pick does not carry. Answering "flat"
  // here would put every block on a crowned corridor at the wrong height, which
  // is the single failure this module exists to prevent.
  assert.throws(
    () => corridorHeightAt({ length: 40, climb: -1.6, crown: 0.08 }, 10, 3),
    /must carry its halfWidth/,
  );
  assert.throws(
    () => corridorHeightAt({ length: 40, crossSlope: 0.05 }, 10, 3),
    /must carry its halfWidth/,
  );
  // And a flat-sectioned corridor never needs it.
  near(corridorHeightAt({ length: 40, climb: -1.6, linearClimb: true }, 10, 3), -0.4, 1e-12,
    'flat cross section without a half width');
});
