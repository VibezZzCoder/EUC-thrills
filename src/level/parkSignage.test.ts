/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MARKINGS, PARK_SIGN_WORDS, SIGNS, markingWidth } from '../data/markings.ts';
import { PROP_SIZES } from '../data/props.ts';
import { CAMERA } from '../data/tuning.ts';
import { PROP_CORRIDOR_CLEARANCE, buildLevelPlan } from './buildPlan.ts';
import {
  SIGN_BRAKE_DECELERATION,
  parkSignage,
  signLeadMetres,
  type SignLap,
  type SignedFeature,
} from './parkSignage.ts';
import type { SegmentSpec } from './segments.ts';

/**
 * Advance instructions and marked landing zones — M36 Phase 2.
 *
 * `level/parkSignage.ts` is pure, so everything below is a claim about
 * arithmetic on a fixture rather than about the park — which is the point of
 * building it that way: the venue's geometry and the venue's signage are two
 * people's files this wave, and the rules the signage has to obey can be
 * asserted without either of them.
 *
 * The last test is the exception and is the important one: it feeds the helper's
 * own output back through `buildLevelPlan` and checks that **every** authored
 * run and every authored post survives. `level/plan.ts` forbids authoring
 * anything in the knowledge it will be clipped, and both clippers here are
 * silent — paint on the wrong surface simply disappears, and a prop standing in
 * a corridor is filtered out with no message at all.
 */

const MPS_PER_MPH = 0.44704;

/** Three straight 120 m corridors, sixteen metres wide: a 360 m ring. */
const LAP: SignLap = {
  metres: 360,
  segments: [
    { id: 'a', length: 120, halfWidth: 8, entryDistance: 0 },
    { id: 'b', length: 120, halfWidth: 8, entryDistance: 120 },
    { id: 'c', length: 120, halfWidth: 8, entryDistance: 240 },
  ],
};

/**
 * Three features spanning the venue's speed range: a 12 mph shelf that wants
 * two words, a 15 mph staircase, and the 40 mph kicker whose lead is the
 * longest thing on the lap and the reason `SIGNS.readSeconds` is 1.5.
 */
const FEATURES: readonly SignedFeature[] = [
  {
    id: 'shelf',
    kind: 'deck',
    segment: 'a',
    lipS: 100,
    approachMph: 12,
    technicalSide: 1,
    bypassSide: -1,
    technicalT: 4.5,
    bypassT: -4.5,
    words: ['180', 'TAP'],
    blocks: [{ s: 100, t: 4.5, halfAlong: 3, halfLateral: 2.2 }],
  },
  {
    id: 'stairs',
    kind: 'stairs',
    segment: 'b',
    lipS: 180,
    approachMph: 15,
    technicalSide: -1,
    bypassSide: 1,
    technicalT: -4,
    bypassT: 4,
    words: ['DOWN'],
    blocks: [{ s: 60, t: -4, halfAlong: 3, halfLateral: 2 }],
  },
  {
    id: 'kicker',
    kind: 'lip',
    segment: 'c',
    lipS: 300,
    approachMph: 40,
    technicalSide: 1,
    bypassSide: -1,
    technicalT: 4,
    bypassT: -4,
    words: ['AIR'],
    landing: { segment: 'c', fromS: 70, toS: 80, t: 4, halfLateral: 2.4, onGround: true },
    blocks: [{ s: 60, t: 4, halfAlong: 2, halfLateral: 2.2 }],
  },
];

/** Ground-plane length of an authored `(s, t)` path, metres. */
function pathLength(path: readonly { readonly s: number; readonly t: number }[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += Math.hypot(path[index]!.s - path[index - 1]!.s, path[index]!.t - path[index - 1]!.t);
  }
  return total;
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

test('every sign finishes being read a full braking distance before its feature', () => {
  // §36.4's whole ask, and the file's one rule: `readSeconds * v + v^2 / 2a`,
  // measured from the far edge of the paint because a rider still reading has
  // not started deciding.
  const signage = parkSignage(FEATURES, LAP);
  assert.equal(signage.signs.length, FEATURES.length, 'a feature went unsigned');

  for (const sign of signage.signs) {
    const feature = FEATURES.find((entry) => entry.id === sign.feature)!;
    const required = signLeadMetres(feature.approachMph * MPS_PER_MPH);
    assert.ok(
      Math.abs(sign.requiredLead - required) < 1e-9,
      `${sign.feature} recorded ${sign.requiredLead} m of required lead against ${required}`,
    );
    assert.ok(
      sign.lead >= required - 1e-9,
      `${sign.feature} leads by ${sign.lead.toFixed(2)} m against ${required.toFixed(2)} m required`,
    );
    // And not early by being on the far side of the lap: a sign a rider has
    // forgotten by the time the feature arrives is not a sign either.
    assert.ok(
      sign.lead <= required * 3,
      `${sign.feature} leads by ${sign.lead.toFixed(2)} m, three times what it needed`,
    );
    // The recorded lead is the two lap distances it claims to be the gap
    // between, wrapped the way the ring wraps.
    const measured = (sign.commitDistance - sign.lapDistance + LAP.metres) % LAP.metres;
    assert.ok(Math.abs(measured - sign.lead) < 1e-9, `${sign.feature}'s lead does not match its record`);
  }

  // The kicker is the case the constant was chosen against: 40 mph is 17.88 m/s
  // and the rule asks for 42.0 m.
  const kicker = signage.signs.find((sign) => sign.feature === 'kicker')!;
  assert.ok(
    Math.abs(kicker.requiredLead - 42.0) < 0.2,
    `the 40 mph lead came out at ${kicker.requiredLead.toFixed(2)} m`,
  );
  // The braking half of it is the tuning table's own, not a number typed twice.
  assert.ok(
    Math.abs(SIGN_BRAKE_DECELERATION - 10.547) < 0.001,
    `full-lean braking is ${SIGN_BRAKE_DECELERATION}`,
  );
});

test('a sign that cannot be given its lead is refused rather than placed short', () => {
  // **The guard, and the proof that it has teeth.** A 40 mph feature needs 42 m
  // of lead and 13 m of pad; put it on a lap with 40 m of corridor in it and
  // there is nowhere legal to stand.
  const cramped: SignLap = {
    metres: 40,
    segments: [{ id: 'only', length: 40, halfWidth: 8, entryDistance: 0 }],
  };
  const fast: SignedFeature = {
    id: 'kicker',
    kind: 'lip',
    segment: 'only',
    lipS: 38,
    approachMph: 40,
    technicalSide: 1,
    bypassSide: -1,
    technicalT: 4,
    bypassT: -4,
    words: ['AIR'],
  };
  assert.throws(() => parkSignage([fast], cramped), /nowhere to put a sign/);

  // And the refusal is not vacuous: without the lead bound the search would
  // happily have placed a pad here, the latest one the corridor allows — and
  // that pad's lead is a fraction of what the rider needs. This is the number
  // the guard is refusing, computed the way an unguarded search would.
  const copyLength = SIGNS.glyphAcross / 0.62 * SIGNS.glyphElongation + SIGNS.copyGap
    + Math.max(
      (SIGNS.chevronCount - 1) * SIGNS.chevronPitch + SIGNS.chevronLength,
      SIGNS.bypassTaperLength,
    );
  const naiveLead = fast.lipS - (1 + copyLength);
  const required = signLeadMetres(fast.approachMph * MPS_PER_MPH);
  assert.ok(
    naiveLead < required,
    `the unguarded placement would have led by ${naiveLead.toFixed(1)} m, which is not under `
    + `${required.toFixed(1)} m — the fixture no longer exercises the guard`,
  );

  // The same feature at a speed the same corridor *can* serve is placed, which
  // is what says the refusal is about the rule and not about the fixture.
  const slow = parkSignage([{ ...fast, approachMph: 8 }], cramped);
  assert.equal(slow.signs.length, 1);
  assert.ok(slow.signs[0]!.lead >= slow.signs[0]!.requiredLead - 1e-9);
});

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

test('a sign prints only words the project owns, and never more than two', () => {
  const signage = parkSignage(FEATURES, LAP);
  for (const sign of signage.signs) {
    assert.ok(sign.words.length <= 2, `${sign.feature} carries ${sign.words.length} words`);
    for (const word of sign.words) {
      assert.ok(
        (PARK_SIGN_WORDS as readonly string[]).includes(word),
        `${sign.feature} prints ${word}, which is not approved`,
      );
    }
  }

  const rogue = { ...FEATURES[0]!, words: ['SPONSOR'] } as unknown as SignedFeature;
  assert.throws(() => parkSignage([rogue], LAP), /not an approved park word/);
  const chatty = { ...FEATURES[0]!, words: ['180', 'TAP', 'DROP'] } as unknown as SignedFeature;
  assert.throws(() => parkSignage([chatty], LAP), /nobody reads three at speed/);
});

test('a word reads left to right across the trail with its caps furthest away', () => {
  // The orientation road text has, and the reason it has it: the rider's left
  // is `+t`, so reading order runs toward negative `t`; and a word on the
  // ground is read the way a word on a page is, tops away from the reader, so
  // the cap height is at the *larger* `s`.
  const signage = parkSignage([FEATURES[1]!], LAP);
  const runs = signage.markings.get('b')!;
  const glyphs = runs.filter((run) => run.role === 'glyph' && run.path.length > 2);
  assert.ok(glyphs.length >= 4, 'DOWN printed fewer than four strokes');

  const sign = signage.signs[0]!;
  const wordFar = sign.fromS + (SIGNS.glyphAcross / 0.62) * SIGNS.glyphElongation;
  for (const run of runs) {
    if (run.role !== 'glyph') continue;
    for (const point of run.path) {
      assert.ok(point.s <= wordFar + 1e-9 || point.s > wordFar + 1, 'a letter reached past its cap');
    }
  }

  // `D` is the first letter of DOWN and must therefore sit furthest to the
  // rider's left — the largest `t` of any stroke in the word.
  const letters = runs.filter((run) => run.role === 'glyph' && run.path.every((p) => p.s <= wordFar + 1e-9));
  const ts = letters.flatMap((run) => run.path.map((point) => point.t));
  const leftmost = Math.max(...ts);
  const rightmost = Math.min(...ts);
  const dStem = letters[0]!;
  assert.ok(
    Math.max(...dStem.path.map((point) => point.t)) > (leftmost + rightmost) / 2,
    'the first letter of the word is not on the reading side',
  );
  // And the word is stretched along the trail rather than square, which is the
  // whole reason it survives being seen at eight degrees above the ground.
  const along = Math.max(...letters.flatMap((r) => r.path.map((p) => p.s)))
    - Math.min(...letters.flatMap((r) => r.path.map((p) => p.s)));
  const across = leftmost - rightmost;
  assert.ok(along > across * 0.7, `the word is ${along.toFixed(2)} m long and ${across.toFixed(2)} m wide`);
});

// ---------------------------------------------------------------------------
// The paint
// ---------------------------------------------------------------------------

test('the technical line and the bypass are told apart without reading a colour', () => {
  const signage = parkSignage([FEATURES[2]!], LAP);
  const sign = signage.signs[0]!;
  const runs = signage.markings.get('c')!;
  // A chevron is an arrowhead: its middle point is its furthest-forward point
  // and its two wings sit level with each other. **So is a capital A**, which
  // is exactly why the word and the arrows are laid on different stretches of
  // the pad rather than beside each other — a rider reading `AIR` must not be
  // reading the first chevron at the same moment.
  const stackFrom = sign.toS - SIGNS.chevronPitch * (SIGNS.chevronCount - 1) - 1e-9;
  const arrowheads = runs.filter((run) => run.role === 'glyph' && run.path.length === 3
    && run.path[1]!.s > run.path[0]!.s && run.path[1]!.s > run.path[2]!.s
    && Math.abs(run.path[0]!.s - run.path[2]!.s) < 1e-9);
  const chevrons = arrowheads.filter((run) => run.path[1]!.s >= stackFrom);
  assert.ok(
    arrowheads.length > chevrons.length,
    'the fixture no longer prints a letter that could be mistaken for a chevron',
  );
  for (const letter of arrowheads.filter((run) => run.path[1]!.s < stackFrom)) {
    assert.ok(
      letter.path[1]!.s < sign.toS - Math.max(
        (SIGNS.chevronCount - 1) * SIGNS.chevronPitch + SIGNS.chevronLength,
        SIGNS.bypassTaperLength,
      ),
      'a word overlaps the arrows it is supposed to precede',
    );
  }
  assert.equal(chevrons.length, SIGNS.chevronCount, 'the chevron stack is the wrong height');
  const bypass = runs.filter((run) => run.paint === 'path');
  assert.equal(bypass.length, 2, 'the bypass arrow is not a shaft and a head');

  // Count, weight and direction all differ, so a monochrome frame still says
  // which line is which.
  assert.ok(chevrons.length !== bypass.length, 'both marks have the same number of strokes');
  assert.notEqual(markingWidth('glyph'), markingWidth('edge'), 'both marks have the same weight');
  for (const chevron of chevrons) {
    const acrossTrail = Math.abs(chevron.path[0]!.t - chevron.path[2]!.t);
    const alongTrail = Math.abs(chevron.path[1]!.s - chevron.path[0]!.s);
    assert.ok(alongTrail > 0 && acrossTrail > 0, 'a chevron is not a chevron');
  }
  const shaft = bypass[0]!;
  assert.ok(
    Math.abs(shaft.path[1]!.t - shaft.path[0]!.t) > SIGNS.chevronHalfSpan * 2,
    'the bypass arrow does not visibly leave the line it starts on',
  );

  // The two never share ground: all paint in this project is one coplanar mesh,
  // so an overlap is an invisible run rather than a bright one.
  const chevronT = chevrons.flatMap((run) => run.path.map((point) => point.t));
  const bypassT = bypass.flatMap((run) => run.path.map((point) => point.t));
  assert.ok(
    Math.min(...chevronT) - markingWidth('glyph') > Math.max(...bypassT) + markingWidth('edge'),
    'the chevrons and the bypass arrow overlap',
  );
});

test('a ground landing is boxed, with the threshold the only red line on the venue', () => {
  const signage = parkSignage(FEATURES, LAP);
  const runs = signage.markings.get('c')!;
  const box = runs.filter((run) => run.path.every((point) => point.s >= 60 && point.s <= 90));
  assert.equal(box.length, 4, 'a landing box is two sides, a far bar and a threshold');

  const red = box.filter((run) => run.paint === 'kerb');
  assert.equal(red.length, 1, 'the threshold is the only red line');
  assert.equal(red[0]!.role, 'bar', 'the threshold is not drawn as a bar');
  assert.equal(red[0]!.path[0]!.s, 70, 'the threshold is not at the mouth of the box');
  // The shape says the same thing the colour does — a bar across the near end —
  // so the instruction survives a colour-blind reading.
  assert.ok(
    Math.abs(red[0]!.path[1]!.t - red[0]!.path[0]!.t) > 4,
    'the threshold does not cross the box',
  );
  for (const run of box) {
    if (run.paint === 'kerb') continue;
    assert.equal(run.paint, 'road');
    assert.ok(run.path[0]!.s > 70 || run.path[0]!.s === 80, 'a white line shares the threshold’s ground');
  }

  // A landing on a deck is already a different surface underfoot and takes no
  // paint at all — and could not, because the clipper reads the heightfield
  // cell rather than the deck's top face.
  const onDeck = parkSignage(
    [{ ...FEATURES[2]!, landing: { ...FEATURES[2]!.landing!, onGround: false } }],
    LAP,
  );
  assert.equal(
    (onDeck.markings.get('c') ?? []).filter((run) => run.paint === 'kerb').length,
    0,
    'a deck landing was painted anyway',
  );
});

test('nothing is authored that the builder would quietly clip away', () => {
  // Two silent clippers, both asserted against here rather than after the fact:
  // a run under its role's minimum is dropped, and paint off the corridor is
  // cut. `level/plan.ts` forbids relying on either.
  const signage = parkSignage(FEATURES, LAP);
  for (const [segmentId, runs] of signage.markings) {
    const segment = LAP.segments.find((entry) => entry.id === segmentId)!;
    for (const run of runs) {
      const minimum = run.role === 'glyph' ? MARKINGS.minGlyphRunLength : MARKINGS.minRunLength;
      assert.ok(
        pathLength(run.path) >= minimum,
        `a ${run.role} run on ${segmentId} is ${pathLength(run.path).toFixed(2)} m, under ${minimum} m`,
      );
      for (const point of run.path) {
        const half = markingWidth(run.role) / 2;
        assert.ok(
          Math.abs(point.t) + half <= segment.halfWidth,
          `paint at t ${point.t.toFixed(2)} runs off a corridor ${segment.halfWidth} m wide`,
        );
        assert.ok(point.s >= 0 && point.s <= segment.length, `paint at s ${point.s} is off the corridor`);
      }
    }
  }

  const wide = { ...FEATURES[0]!, technicalT: 7.6, words: ['STAIRS'] } as SignedFeature;
  assert.throws(() => parkSignage([wide], LAP), /clipped rather than painted/);
});

test('no paint and no post lands against a block', () => {
  const signage = parkSignage(FEATURES, LAP);
  const clear = MARKINGS.colliderClearance;
  for (const feature of FEATURES) {
    for (const block of feature.blocks ?? []) {
      for (const run of signage.markings.get(feature.segment) ?? []) {
        for (const point of run.path) {
          const half = markingWidth(run.role) / 2;
          const along = Math.abs(point.s - block.s) - block.halfAlong - half;
          const across = Math.abs(point.t - block.t) - block.halfLateral - half;
          assert.ok(
            along >= clear || across >= clear,
            `paint at (${point.s.toFixed(2)}, ${point.t.toFixed(2)}) is inside a block on ${feature.segment}`,
          );
        }
      }
      for (const post of signage.props.get(feature.segment) ?? []) {
        const along = Math.abs(post.s - block.s) - block.halfAlong;
        const across = Math.abs(post.t - block.t) - block.halfLateral;
        assert.ok(along >= clear || across >= clear, 'a signpost stands in a block');
      }
    }
  }

  // **And it is the search that keeps it that way, not luck.** A feature's
  // whole built extent is a zone, not just the point it commits at — which
  // matters because a deck is not where a block *starts*: the gap on the park
  // has a landing deck thirteen metres past the edge the rider leaves, and a
  // zone that stopped at the commitment point would let the next feature's
  // sign be painted straight across it, where `buildPlan` would silently
  // delete it for standing on a block rather than on a paintable cell.
  //
  // Shown by taking the blocks away: the same two features, the same lap, and
  // the later one's pad lands on the earlier one's deck the moment the deck
  // stops being declared.
  const deck = { from: 130, to: 150 };
  const pair = (declared: boolean): SignedFeature[] => [
    {
      id: 'front',
      kind: 'deck',
      segment: 'b',
      lipS: 130,
      approachMph: 12,
      technicalSide: 1,
      bypassSide: -1,
      technicalT: 4,
      bypassT: -4,
      ...(declared ? { blocks: [{ s: 20, t: 4, halfAlong: 10, halfLateral: 2 }] } : {}),
    },
    {
      id: 'behind',
      kind: 'deck',
      segment: 'b',
      lipS: 160,
      approachMph: 12,
      technicalSide: 1,
      bypassSide: -1,
      technicalT: 4,
      bypassT: -4,
    },
  ];
  const padLap = (signage: ReturnType<typeof parkSignage>): { from: number; to: number } => {
    const entry = signage.signs.find((record) => record.feature === 'behind')!;
    const base = LAP.segments.find((segment) => segment.id === entry.segment)!.entryDistance;
    return { from: base + entry.fromS, to: base + entry.toS };
  };
  const undeclared = padLap(parkSignage(pair(false), LAP));
  assert.ok(
    undeclared.to > deck.from && undeclared.from < deck.to,
    `without the blocks the pad went to ${undeclared.from.toFixed(1)}..${undeclared.to.toFixed(1)},`
    + ' which is not on the deck, so this proves nothing',
  );
  const declared = padLap(parkSignage(pair(true), LAP));
  assert.ok(
    declared.to <= deck.from,
    `the pad still runs ${declared.from.toFixed(1)}..${declared.to.toFixed(1)} across a deck`,
  );
});

// ---------------------------------------------------------------------------
// The posts
// ---------------------------------------------------------------------------

test('a signpost stands off the trail and out of the chase camera’s sweep', () => {
  const signage = parkSignage(FEATURES, LAP);
  const posts = [...signage.props].flatMap(([id, list]) => list.map((prop) => ({ id, prop })));
  assert.equal(posts.length, FEATURES.length, 'a feature lost its post');

  for (const { id, prop } of posts) {
    const segment = LAP.segments.find((entry) => entry.id === id)!;
    assert.equal(prop.kind, 'signpost', 'the signage invented a prop kind');
    // `buildPlan` drops a prop whose footprint touches a rideable corridor, and
    // it does it silently — so the post clears the corridor by its own plate
    // radius plus the builder's clearance, with a margin on top.
    const clear = Math.abs(prop.t) - segment.halfWidth - PROP_SIZES.signpost.plateWidth;
    assert.ok(
      clear >= PROP_CORRIDOR_CLEARANCE,
      `a post on ${id} clears the corridor by ${clear.toFixed(2)} m against ${PROP_CORRIDOR_CLEARANCE} m`,
    );
  }

  for (const sign of signage.signs) {
    // The chase arm reaches `distanceAtSpeed` behind the rider and pulls in on
    // anything solid within `obstructionRadius` of that ray. A sign that yanked
    // the camera in on the approach it exists to make readable is worse than no
    // sign at all.
    assert.ok(
      sign.postCameraGap >= CAMERA.distanceAtSpeed + CAMERA.obstructionRadius - 1e-9,
      `${sign.feature}'s post is ${sign.postCameraGap.toFixed(2)} m from the technical line`,
    );
    assert.ok(sign.post.s >= 0, 'a post stands off the end of its corridor');
  }
});

// ---------------------------------------------------------------------------
// Determinism, and the end-to-end proof
// ---------------------------------------------------------------------------

test('two builds of the same signage are the same signage', () => {
  // No clock, no random, no map iteration order that depends on anything but
  // the order the features were given. `switchbackLevel.test.ts` makes the same
  // claim about the park and this is the half of it that lives here.
  const first = parkSignage(FEATURES, LAP);
  const second = parkSignage(FEATURES, LAP);
  assert.deepStrictEqual(first.signs, second.signs);
  assert.deepStrictEqual([...first.markings], [...second.markings]);
  assert.deepStrictEqual([...first.bands], [...second.bands]);
  assert.deepStrictEqual([...first.props], [...second.props]);
});

test('every authored run and every post survives a real build', () => {
  // **The test the other nine are a proxy for.** Both clippers are silent, so
  // the only way to know the signage ships is to build a level out of it and
  // count what came back. The fixture is sampled at 1.5 m, which is the park's
  // own grid and the harshest thing the boardwalk patches have to beat.
  const signage = parkSignage(FEATURES, LAP);
  const specs: SegmentSpec[] = LAP.segments.map((segment) => {
    const blocks = FEATURES
      .filter((feature) => feature.segment === segment.id)
      .flatMap((feature) => (feature.blocks ?? []).map((block) => ({
        s: block.s,
        t: block.t,
        halfAlong: block.halfAlong,
        halfLateral: block.halfLateral,
        height: 0.4,
        surface: 'wood' as const,
      })));
    return {
      id: segment.id,
      length: segment.length,
      halfWidth: segment.halfWidth,
      surface: 'dirt',
      shoulder: 5,
      ...(blocks.length === 0 ? {} : { blocks }),
      ...(signage.bands.has(segment.id) ? { bands: [...signage.bands.get(segment.id)!] } : {}),
      ...(signage.markings.has(segment.id)
        ? { markings: [...signage.markings.get(segment.id)!] }
        : {}),
      ...(signage.props.has(segment.id) ? { props: [...signage.props.get(segment.id)!] } : {}),
    };
  });

  const plan = buildLevelPlan(specs, {
    id: 'signage-fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    spacing: 1.5,
  });

  const authored = [...signage.markings.values()].reduce((total, runs) => total + runs.length, 0);
  assert.ok(authored > 20, `only ${authored} runs were authored, so this proves little`);
  assert.ok(
    (plan.markings ?? []).length >= authored,
    `${authored} runs were authored and ${(plan.markings ?? []).length} survived the clipper`,
  );

  // Nothing was painted onto the trail itself: every surviving point stands on
  // a paintable cell, which on this venue means the boardwalk patches did their
  // job. `buildPlan` would simply have deleted anything that did not.
  const width = plan.heightfield.columns - 1;
  for (const marking of plan.markings ?? []) {
    for (const point of marking.points) {
      const column = Math.floor((point.x - plan.heightfield.originX) / plan.heightfield.spacing);
      const row = Math.floor((point.z - plan.heightfield.originZ) / plan.heightfield.spacing);
      assert.equal(plan.heightfield.surfaces[row * width + column], 'wood', 'paint landed off the boardwalk');
    }
  }

  const posts = (plan.props ?? []).filter((prop) => prop.kind === 'signpost');
  assert.equal(posts.length, FEATURES.length, 'a signpost was filtered out for standing on the trail');

  // And the boardwalk is the only surface the signage added: no new terrain
  // bucket beyond the one `wood` patch set, which is what keeps the frame's
  // draw-call ledger where §36.7 left it.
  const surfaces = new Set(plan.heightfield.surfaces);
  assert.deepEqual([...surfaces].sort(), ['dirt', 'grass', 'wood']);
});

// ---------------------------------------------------------------------------
// The read rule
// ---------------------------------------------------------------------------

/**
 * A straight that feeds a 180° hairpin that feeds another straight.
 *
 * Switchback's kicker clearing and spin shelf in miniature, and the shape the
 * lead rule alone gets wrong: the feature stands on the far straight, its lead
 * reaches back through the whole corner, and the *latest* point that lead allows
 * is two thirds of the way round a bend whose exit points back the way the rider
 * came.
 */
const HAIRPIN_RADIUS = 16;
const HAIRPIN_LAP: SignLap = {
  metres: 120 + Math.PI * HAIRPIN_RADIUS + 120,
  segments: [
    { id: 'in', length: 120, halfWidth: 8, entryDistance: 0, curvature: 0 },
    {
      id: 'bend',
      length: Math.PI * HAIRPIN_RADIUS,
      halfWidth: 8,
      entryDistance: 120,
      // Positive turns toward the rider's left, which is the side the chevrons
      // are on — the inside of the corner, and the worst case.
      curvature: 1 / HAIRPIN_RADIUS,
    },
    {
      id: 'out',
      length: 120,
      halfWidth: 8,
      entryDistance: 120 + Math.PI * HAIRPIN_RADIUS,
      curvature: 0,
    },
  ],
};

const HAIRPIN_FEATURE: SignedFeature = {
  id: 'kicker',
  kind: 'lip',
  segment: 'out',
  lipS: 120 + Math.PI * HAIRPIN_RADIUS + 40,
  approachMph: 40,
  technicalSide: 1,
  bypassSide: -1,
  technicalT: 4,
  bypassT: -4,
  blocks: [{ s: 40, t: 4, halfAlong: 2, halfLateral: 2.2 }],
};

/**
 * Where a mark on the hairpin sits in the frame of a rider still on the straight.
 *
 * Closed form rather than a ride: at `back` metres before the bend's entry the
 * rider is looking straight down the corridor, and a point `s` round an arc of
 * radius `R` at lateral `t` is `R sin(s/R)` ahead and `R (1 - cos(s/R)) + t` to
 * the left of that line. The ratio of the two is the tangent of the bearing the
 * pane has to contain, and the pane's own half-angle is `tan(fov/2) * aspect`.
 * Independent of `parkSignage.ts`'s own arithmetic on purpose — a guard that
 * reuses the thing it guards proves nothing.
 */
function hairpinBearingTangent(markS: number, markT: number, back: number): number {
  const angle = markS / HAIRPIN_RADIUS;
  const forward = back + HAIRPIN_RADIUS * Math.sin(angle);
  const left = HAIRPIN_RADIUS * (1 - Math.cos(angle)) + markT;
  return Math.abs(left) / forward;
}

test('a sign goes where the rider can see it, not merely where the lead rule allows', () => {
  // **The Phase 2 browser pass's defect, as arithmetic.** It photographed the
  // kicker's chevrons in frame for 0.00 s of a portrait phone's approach and
  // the spin shelf's for 1.25 s against the 1.5 s `SIGNS.readSeconds` buys,
  // because both pads sat past the apex of a 180° bend where a 412x915 pane's
  // 16° half-angle cannot reach them. Every lead was correct.
  const pane = Math.tan(CAMERA.fovAtRest / 2) * SIGNS.paneAspect;
  const signage = parkSignage([HAIRPIN_FEATURE], HAIRPIN_LAP);
  const sign = signage.signs[0]!;

  // The lead rule is untouched: the read rule only ever moves a sign further
  // back, never closer.
  assert.ok(sign.lead >= sign.requiredLead - 1e-9, `${sign.feature} lost its lead`);
  assert.ok(
    sign.readMetres >= sign.requiredReadMetres - 1e-9,
    `${sign.feature} is on the screen for ${sign.readMetres.toFixed(1)} m of approach against `
    + `the ${sign.requiredReadMetres.toFixed(1)} m ${SIGNS.readSeconds} s at its own speed asks for`,
  );
  assert.equal(sign.segment, 'bend', 'the fixture no longer exercises the bend');
  assert.ok(
    sign.toS < HAIRPIN_LAP.segments[1]!.length / 3,
    `the pad ends ${sign.toS.toFixed(1)} m into a ${HAIRPIN_LAP.segments[1]!.length.toFixed(1)} m bend`,
  );

  // **And the same search without the shape.** Withholding `curvature` is the
  // only difference — the lengths, the widths, the entry distances, the feature
  // and its lead are identical — so what it isolates is exactly the rule this
  // test is here for. The helper then believes the corner is a straight, takes
  // the latest slot the lead allows, and puts the paint past the apex.
  const flat = parkSignage([HAIRPIN_FEATURE], {
    ...HAIRPIN_LAP,
    segments: HAIRPIN_LAP.segments.map(({ curvature, ...rest }) => rest),
  });
  const blind = flat.signs[0]!;
  assert.equal(blind.segment, 'bend', 'the unguarded search left the bend');
  assert.ok(
    blind.toS > HAIRPIN_LAP.segments[1]!.length / 2,
    `the unguarded pad ended ${blind.toS.toFixed(1)} m in, which is not past the apex`,
  );

  // Measured thirty metres before the corner — well inside the stretch the
  // 1.5 s is spent on — the guarded mark is in the frame and the unguarded one
  // is nowhere near it.
  const guarded = hairpinBearingTangent(sign.toS, HAIRPIN_FEATURE.technicalT, 30);
  const unguarded = hairpinBearingTangent(blind.toS, HAIRPIN_FEATURE.technicalT, 30);
  assert.ok(guarded <= pane, `the guarded mark is ${guarded.toFixed(3)} off a ${pane.toFixed(3)} pane`);
  assert.ok(unguarded > pane * 2, `the unguarded mark is only ${unguarded.toFixed(3)} off the pane`);
});
