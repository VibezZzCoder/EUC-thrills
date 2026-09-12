/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PROP_FOOTPRINTS, PROP_SIZES, type PropKind } from '../data/props.ts';
import { CAMERA, LIGHTING } from '../data/tuning.ts';
import { PROP_CORRIDOR_CLEARANCE } from './buildPlan.ts';
import {
  FOREST_CLEARANCE,
  FOREST_HEIGHTS,
  FOREST_SHADOW_STAND,
  FOREST_STRUCTURE_GAP,
  HILLSIDE_HALF,
  HILLSIDE_OFFSET,
  HILLSIDE_STAND,
  TRAIL_CAMERA_GAP,
  blockExclusions,
  clearanceOf,
  hillsideBlocks,
  plantForest,
  propExclusions,
  railProps,
  shadowClearance,
  shadowDirection,
  shadowPerMetre,
  type DressingExclusion,
  type ForestSite,
  type SunBearing,
} from './parkDressing.ts';
import {
  centrelineAt,
  headingAt,
  leftOf,
  placeChain,
  querySegment,
  type PlacedSegment,
  type SegmentSpec,
} from './segments.ts';

/**
 * The park's dressing arithmetic, on fixtures rather than on the venue.
 *
 * `switchbackLevel.test.ts` measures what this produced *on the built park* —
 * every prop against every landing, run-out and technical line. This file
 * measures the rules themselves, on corridors small enough that the answer can
 * be worked out by hand, and it is where the guards are shown to be guards:
 * every claim here has a mutation beside it that breaks it, so a test that
 * would pass with the rule deleted is not a test.
 */

const STRAIGHT: SegmentSpec = {
  id: 'straight',
  length: 120,
  halfWidth: 8,
  surface: 'dirt',
  shoulder: 12,
};

/** A left-hand bend of radius 16, the venue's own hairpin radius. */
const BEND: SegmentSpec = {
  id: 'bend',
  length: Math.PI * 16,
  halfWidth: 8,
  surface: 'dirt',
  shoulder: 12,
  curvature: 1 / 16,
};

const SPAWN = { position: { x: 0, y: 0, z: 0 }, headingY: 0 };

/**
 * A fixed late afternoon, the same bearing and elevation the park authors.
 *
 * Transcribed rather than imported: this file measures the *rules* on fixtures,
 * and `switchbackLevel.test.ts` is where the venue's own descriptor is pinned
 * against the forest it actually grew.
 */
const LATE_AFTERNOON: SunBearing = { azimuth: -1.75, elevation: 0.58 };

/** The daylight every other world is judged at — `LIGHTING.sunElevation`. */
const DAYLIGHT: SunBearing = { azimuth: LIGHTING.sunAzimuth, elevation: LIGHTING.sunElevation };

function placeOf(...specs: SegmentSpec[]): PlacedSegment[] {
  return placeChain(specs, SPAWN);
}

function siteOf(placed: PlacedSegment[], over: Partial<ForestSite> = {}): ForestSite {
  return {
    placed,
    technical: new Set<string>(),
    exclusions: [],
    bounds: { minX: -60, maxX: 60, minZ: -20, maxZ: 140 },
    lattice: 7,
    margin: 2,
    sun: LATE_AFTERNOON,
    ...over,
  };
}

/**
 * Does this prop's shadow touch this corridor? The true footprint, marched.
 *
 * The stadium swept by a disc of the prop's own reach from its trunk to the tip
 * of its shadow, sampled every 20 cm — the measurement the isotropic bound in
 * `parkDressing.ts` is a sufficient condition for, done the expensive way so
 * the cheap way can be checked against it.
 */
function shadowTouches(
  segment: PlacedSegment,
  prop: { kind: PropKind; x: number; z: number; scale: number },
  sun: SunBearing,
  stand = 0,
): boolean {
  const footprint = PROP_FOOTPRINTS[prop.kind];
  const reach = (footprint.shape === 'circle'
    ? footprint.radius
    : Math.hypot(footprint.halfX, footprint.halfZ)) * prop.scale;
  const height = FOREST_HEIGHTS[prop.kind as keyof typeof FOREST_HEIGHTS] * prop.scale + stand;
  const length = height * shadowPerMetre(sun);
  const direction = shadowDirection(sun);
  for (let travelled = 0; travelled <= length + 1e-9; travelled += 0.2) {
    const query = querySegment(
      segment,
      prop.x + direction.x * travelled,
      prop.z + direction.z * travelled,
    );
    if (query !== null && query.outside <= reach) return true;
  }
  return false;
}

/** Least distance from a world point to any corridor's edge, metres. */
function outsideOf(placed: readonly PlacedSegment[], x: number, z: number): number {
  let outside = Infinity;
  for (const segment of placed) {
    const query = querySegment(segment, x, z);
    if (query !== null && query.outside < outside) outside = query.outside;
  }
  return outside;
}

// ---------------------------------------------------------------------------
// 1 — the bounds, and where they come from
// ---------------------------------------------------------------------------

test('the camera gap is the chase arm plus what it pulls in around', () => {
  // Written twice in the codebase on purpose — `parkSignage.ts` places a post
  // *at* this bound and this file refuses a tree *inside* it — so it is worth
  // one test that the two are the same arithmetic rather than two numbers.
  assert.equal(TRAIL_CAMERA_GAP, CAMERA.distanceAtSpeed + CAMERA.obstructionRadius);
  assert.ok(TRAIL_CAMERA_GAP > 6 && TRAIL_CAMERA_GAP < 7);
});

test('the understorey bound is the crest corridor, derived rather than chosen', () => {
  // A prop `c` metres outside a corridor's edge is `halfWidth + c - technicalT`
  // from the line through the feature on it. The park's tightest case is the
  // fire road's crest: half-width 6, technical line 3.5.
  const needed = 3.5 + TRAIL_CAMERA_GAP - 6;
  assert.ok(
    FOREST_CLEARANCE.understoreyTechnical >= needed,
    `the understorey stands ${FOREST_CLEARANCE.understoreyTechnical} m out and needs ${needed.toFixed(2)}`,
  );
  // And it is not extravagant: a metre more would be a bound nothing asked for.
  assert.ok(FOREST_CLEARANCE.understoreyTechnical < needed + 1);
  // The canopy is further out again, because a crown is what reaches over a
  // landing and a bush is not.
  assert.ok(FOREST_CLEARANCE.canopyTechnical > FOREST_CLEARANCE.understoreyTechnical);
  assert.ok(FOREST_CLEARANCE.canopy > FOREST_CLEARANCE.understorey);
  // Every one of them is past the builder's own floor, which is the bound a
  // prop is *culled* at rather than kept off by.
  for (const bound of Object.values(FOREST_CLEARANCE)) {
    assert.ok(bound > PROP_CORRIDOR_CLEARANCE);
  }
});

// ---------------------------------------------------------------------------
// 2 — the forest
// ---------------------------------------------------------------------------

test('the same hillside grows the same forest, twice', () => {
  // `DESIGN.md` §4 rule 3: an integer hash, never `Math.random`. A world that
  // differs between boots makes every visual capture meaningless.
  const placed = placeOf(STRAIGHT);
  const first = plantForest(siteOf(placed));
  const second = plantForest(siteOf(placed));
  assert.ok(first.length > 40, `${first.length} props is not a forest`);
  assert.deepEqual(first, second);
});

test('nothing is planted in the road, and the lattice proves it was asked to', () => {
  // **The guard, shown to be a guard.** A forest that never generated a
  // candidate inside the corridor would pass the clearance assertion below
  // while measuring nothing at all — so the lattice's own sites are counted
  // first, and there are dozens of them in the road.
  const placed = placeOf(STRAIGHT);
  const site = siteOf(placed);

  let inRoad = 0;
  for (let x = site.bounds.minX + site.margin; x <= site.bounds.maxX; x += site.lattice) {
    for (let z = site.bounds.minZ + site.margin; z <= site.bounds.maxZ; z += site.lattice) {
      if (outsideOf(placed, x, z) === 0) inRoad += 1;
    }
  }
  assert.ok(inRoad > 20, `the lattice only offers ${inRoad} sites inside the corridor`);

  for (const prop of plantForest(site)) {
    const needed = prop.kind === 'shrub' ? FOREST_CLEARANCE.understorey : FOREST_CLEARANCE.canopy;
    assert.ok(
      clearanceOf(placed, prop) >= needed - 1e-9,
      `a ${prop.kind} stands ${clearanceOf(placed, prop).toFixed(2)} m off the trail`,
    );
  }
});

test('a technical corridor pushes the whole forest further out than a plain one', () => {
  const placed = placeOf(STRAIGHT);
  const plain = plantForest(siteOf(placed));
  const technical = plantForest(siteOf(placed, { technical: new Set(['straight']) }));

  const closest = (list: ReturnType<typeof plantForest>): number => Math.min(
    ...list.map((prop) => clearanceOf(placed, prop)),
  );
  assert.ok(closest(plain) < FOREST_CLEARANCE.canopyTechnical, 'the plain rule was never exercised');
  assert.ok(
    closest(technical) >= FOREST_CLEARANCE.understoreyTechnical - 1e-9,
    `the technical rule let something to ${closest(technical).toFixed(2)} m`,
  );
  // And it costs trees, which is the shape of the trade: a clear frame round a
  // landing is bought with the forest that would have stood in it.
  assert.ok(technical.length < plain.length);
});

test('the forest yields to what is already standing on the hillside', () => {
  const placed = placeOf(STRAIGHT);
  const bare = plantForest(siteOf(placed));
  assert.ok(bare.length > 0);

  // Put an exclusion on the first prop the bare site grew, and it is gone —
  // along with anything else that was inside the disc.
  const victim = bare[0]!;
  const exclusion: DressingExclusion = { x: victim.x, z: victim.z, radius: 2 };
  const shy = plantForest(siteOf(placed, { exclusions: [exclusion] }));

  assert.ok(shy.length < bare.length, 'the exclusion refused nothing');
  for (const prop of shy) {
    const footprint = PROP_FOOTPRINTS[prop.kind];
    const reach = (footprint.shape === 'circle' ? footprint.radius : 0) * prop.scale;
    const gap = Math.hypot(prop.x - exclusion.x, prop.z - exclusion.z);
    assert.ok(
      gap >= reach + exclusion.radius + FOREST_STRUCTURE_GAP - 1e-9,
      `a ${prop.kind} stands ${gap.toFixed(2)} m from a structure`,
    );
  }
  // Everything outside the disc is untouched: an exclusion moves nothing, it
  // only refuses. A forest that re-flowed around one bench would be a forest
  // whose every tree depended on every other.
  const survived = new Set(shy.map((prop) => `${prop.x},${prop.z}`));
  for (const prop of bare) {
    const gap = Math.hypot(prop.x - exclusion.x, prop.z - exclusion.z);
    if (gap > 8) assert.ok(survived.has(`${prop.x},${prop.z}`), 'an untouched site moved');
  }
});

test('the canopy thickens away from the trail and the understorey thins', () => {
  // The two ramps, measured as shares rather than restated as constants.
  const placed = placeOf(STRAIGHT);
  const forest = plantForest(siteOf(placed, {
    bounds: { minX: -70, maxX: 70, minZ: -20, maxZ: 140 },
  }));
  const near = forest.filter((prop) => outsideOf(placed, prop.x, prop.z) <= 14);
  const far = forest.filter((prop) => outsideOf(placed, prop.x, prop.z) > 14);
  assert.ok(near.length > 5 && far.length > 5, 'one of the two bands is empty');

  const shrubShare = (list: typeof near): number =>
    list.filter((prop) => prop.kind === 'shrub').length / list.length;
  assert.ok(
    shrubShare(near) > shrubShare(far),
    `near ${(shrubShare(near) * 100).toFixed(0)}% understorey, far ${(shrubShare(far) * 100).toFixed(0)}%`,
  );

  // Conifer dominant among the trees, which is what keeps the triangle bill
  // affordable: one instanced part against a broadleaf's two.
  const trees = forest.filter((prop) => prop.kind !== 'shrub');
  const conifers = trees.filter((prop) => prop.kind === 'conifer');
  assert.ok(conifers.length > trees.length * 0.6, `${conifers.length} conifers of ${trees.length} trees`);
});

test('nothing is planted outside the field it was given', () => {
  const placed = placeOf(STRAIGHT);
  const bounds = { minX: -40, maxX: 40, minZ: 0, maxZ: 60 };
  for (const prop of plantForest(siteOf(placed, { bounds, margin: 5 }))) {
    assert.ok(prop.x >= bounds.minX + 5 - 1e-9 && prop.x <= bounds.maxX - 5 + 1e-9);
    assert.ok(prop.z >= bounds.minZ + 5 - 1e-9 && prop.z <= bounds.maxZ - 5 + 1e-9);
  }
});

test('a lattice of zero is refused rather than looped on forever', () => {
  assert.throws(() => plantForest(siteOf(placeOf(STRAIGHT), { lattice: 0 })), /lattice/);
});

// ---------------------------------------------------------------------------
// 2b — the fifth bound: the venue's own sun
// ---------------------------------------------------------------------------

test('a shadow is the sun\'s elevation and nothing else', () => {
  // The whole of the low sun's cost, in one number. Daylight throws 0.70 x a
  // caster's height; the park's fixed late afternoon throws 1.53 x.
  assert.ok(Math.abs(shadowPerMetre(DAYLIGHT) - 0.7001) < 5e-4, `${shadowPerMetre(DAYLIGHT)}`);
  assert.ok(Math.abs(shadowPerMetre(LATE_AFTERNOON) - 1.5263) < 5e-4);
  assert.ok(shadowPerMetre(LATE_AFTERNOON) > shadowPerMetre(DAYLIGHT) * 2.1);

  // Monotone in elevation, and the bearing is not an input to it — which is
  // exactly why the clearance below holds at every bearing.
  for (let elevation = 0.2; elevation < 1.4; elevation += 0.1) {
    assert.ok(shadowPerMetre({ azimuth: 0, elevation })
      > shadowPerMetre({ azimuth: 3, elevation: elevation + 0.1 }));
  }
  // A sun on the horizon or at the zenith is refused rather than returned as
  // an infinity that would silently empty the hillside or fill it.
  assert.throws(() => shadowPerMetre({ azimuth: 0, elevation: 0 }), /shadow/);
  assert.throws(() => shadowPerMetre({ azimuth: 0, elevation: Math.PI / 2 }), /shadow/);
});

test('a shadow runs the way the renderer throws it', () => {
  // `render/Renderer.ts` puts the key light at `(sin a, _, cos a) * distance`,
  // so the shadow runs the other way. Transcribed here because a forest planted
  // against one bearing and lit from another is a defect nothing else can see.
  for (const azimuth of [-1.75, 0, 0.9, 2.4]) {
    const direction = shadowDirection({ azimuth, elevation: 0.58 });
    assert.ok(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-12);
    assert.ok(Math.abs(direction.x + Math.sin(azimuth)) < 1e-12);
    assert.ok(Math.abs(direction.z + Math.cos(azimuth)) < 1e-12);
  }
  // The park's own: a sun ten degrees south of west throws very nearly due
  // east, which is the direction its landings are measured along.
  const park = shadowDirection(LATE_AFTERNOON);
  assert.ok(park.x > 0.98 && park.z > 0.17 && park.z < 0.19);
});

test('a tree is as tall as the kit draws it, and the bound is that height leaned over', () => {
  // Read off `PROP_SIZES`, so the kit and the rule cannot drift. These are the
  // envelopes `render/foliageKit.ts` holds both recipes inside, which is what
  // makes the setback recipe independent.
  assert.equal(FOREST_HEIGHTS.conifer, 7.9);
  assert.equal(FOREST_HEIGHTS.broadleafTree, 6.3);
  assert.ok(Math.abs(FOREST_HEIGHTS.shrub - 1.361) < 1e-9);
  assert.ok(FOREST_HEIGHTS.conifer > FOREST_HEIGHTS.broadleafTree);

  // The bound is the tree's own height plus the bank it may stand on, leaned
  // over by the sun. A full-scale conifer at the park's sun wants 18.9 m.
  const tall = shadowClearance('conifer', 1.25, LATE_AFTERNOON);
  assert.ok(Math.abs(tall - (7.9 * 1.25 + FOREST_SHADOW_STAND) * 1.5263) < 1e-2, `${tall}`);
  assert.ok(tall > 18.8 && tall < 19.0);
  // Daylight would have wanted 8.7 m for the same tree, which the camera bound
  // of 6 m nearly covers on its own — the reason this bound is new at Phase 4
  // and not at Phase 1.
  assert.ok(shadowClearance('conifer', 1.25, DAYLIGHT) < 8.8);
  // Smaller trees are let closer: a bound quoted at the worst case would have
  // cost the hillside trees the sun never puts on a landing.
  assert.ok(shadowClearance('conifer', 0.85, LATE_AFTERNOON) < tall - 4);
  assert.ok(shadowClearance('shrub', 1.4, LATE_AFTERNOON) < shadowClearance('broadleafTree', 0.85, LATE_AFTERNOON));
  assert.throws(() => shadowClearance('bench', 1, LATE_AFTERNOON), /forest plants/);
});

test('the low sun pushes the treeline off a technical corridor, and no shadow lands on it', () => {
  const placed = placeOf(STRAIGHT);
  const segment = placed[0]!;
  const technical = new Set(['straight']);
  const afternoon = plantForest(siteOf(placed, { technical }));
  const noon = plantForest(siteOf(placed, { technical, sun: DAYLIGHT }));

  // **The claim, measured as the footprint rather than as the bound.** Not one
  // prop's shadow stadium touches the corridor at the park's own bearing, and
  // the stand allowance is carried in the measurement so a tree on the bank is
  // measured as one.
  for (const prop of afternoon) {
    assert.ok(
      !shadowTouches(segment, prop, LATE_AFTERNOON, FOREST_SHADOW_STAND),
      `a ${prop.kind} at (${prop.x.toFixed(1)}, ${prop.z.toFixed(1)}) lays its shadow on the corridor`,
    );
  }

  // **And the guard is a guard.** The same hillside under the daylight the game
  // ships grows trees whose shadows do reach the corridor at the low sun — so
  // the assertion above is the rule's doing and not the lattice's.
  const reaching = noon.filter((prop) => shadowTouches(segment, prop, LATE_AFTERNOON, FOREST_SHADOW_STAND));
  assert.ok(reaching.length > 3, `only ${reaching.length} of the daylight forest would shade the trail`);
  assert.ok(afternoon.length < noon.length, 'the low sun cost no trees at all');
});

test('the shadow bound leaves the plain trail in dappled light', () => {
  // §36.8 asks that the *landings* read, not that the hillside be shadowless.
  // A corridor with no feature on it keeps the camera bound alone, and the
  // proof is that its treeline is nearer than any shadow rule would allow.
  const placed = placeOf(STRAIGHT);
  const segment = placed[0]!;
  const plain = plantForest(siteOf(placed));
  const closest = Math.min(...plain.map((prop) => clearanceOf(placed, prop)));
  assert.ok(closest < shadowClearance('conifer', 0.85, LATE_AFTERNOON));
  assert.ok(
    plain.some((prop) => shadowTouches(segment, prop, LATE_AFTERNOON)),
    'nothing shades the plain trail, so the bound is not scoped to technical corridors',
  );
});

// ---------------------------------------------------------------------------
// 3 — the hillside's own masonry and timber
// ---------------------------------------------------------------------------

test('a run of cribbing is pitched along its corridor, outside its edge', () => {
  const blocks = hillsideBlocks(
    [{ segment: 'straight', fromS: 10, toS: 40, pitch: 10, side: -1, surface: 'wood', appearance: 'wood' }],
    () => 8,
  ).get('straight')!;

  // 10, 20, 30, 40 — the last one kept, which is the `1e-9` in the loop and
  // the reason it is there: an exact multiple must not lose its final block.
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map((block) => block.s), [10, 20, 30, 40]);
  for (const block of blocks) {
    assert.equal(block.t, -(8 + HILLSIDE_OFFSET));
    assert.equal(block.height, HILLSIDE_STAND);
    assert.equal(block.halfAlong, HILLSIDE_HALF.along);
    assert.equal(block.halfLateral, HILLSIDE_HALF.lateral);
    assert.equal(block.surface, 'wood');
    assert.equal(block.appearance, 'wood');
    // Outside the corridor by more than the builder's own floor, at its corner.
    const corner = Math.abs(block.t) - Math.hypot(block.halfAlong, block.halfLateral) - 8;
    assert.ok(corner > PROP_CORRIDOR_CLEARANCE, `a block's corner reaches ${corner.toFixed(2)} m out`);
  }
});

test('the hillside offset clears the camera on the narrowest corridor with a feature', () => {
  // The same derivation the understorey's bound comes from, at the crest's
  // half-width of 6 and technical line of 3.5.
  assert.ok(6 + HILLSIDE_OFFSET - 3.5 >= TRAIL_CAMERA_GAP);
});

test('a run with no pitch or a backwards span is refused, not silently empty', () => {
  assert.throws(() => hillsideBlocks(
    [{ segment: 'straight', fromS: 0, toS: 10, pitch: 0, side: 1, surface: 'wood', appearance: 'wood' }],
    () => 8,
  ), /pitch/);
  assert.throws(() => hillsideBlocks(
    [{ segment: 'straight', fromS: 10, toS: 0, pitch: 5, side: 1, surface: 'wood', appearance: 'wood' }],
    () => 8,
  ), /ends before it starts/);
});

// ---------------------------------------------------------------------------
// 4 — the rail
// ---------------------------------------------------------------------------

test('a rail on the outside of a bend is laid at its own length, not the centreline\'s', () => {
  const placed = placeOf(BEND);
  const segment = placed[0]!;
  const bayLength = PROP_SIZES.fenceBay.length;
  // The outside of a left-hand bend is the rider's right, which is negative t.
  const t = -14;
  const bays = railProps([{ segment: 'bend', fromS: 6, toS: 30, t }], () => BEND.curvature!)
    .get('bend')!;
  assert.ok(bays.length > 4);
  assert.ok(bays.every((bay) => bay.kind === 'fenceBay' && bay.t === t));

  const world = bays.map((bay) => {
    const centre = centrelineAt(segment.entry, segment.spec, bay.s);
    const left = leftOf(headingAt(segment.entry, segment.spec, bay.s));
    return { x: centre.x + left.x * bay.t, z: centre.z + left.z * bay.t };
  });
  for (let index = 1; index < world.length; index += 1) {
    const gap = Math.hypot(world[index]!.x - world[index - 1]!.x, world[index]!.z - world[index - 1]!.z);
    assert.ok(
      Math.abs(gap - bayLength) < 0.05,
      `two bays stand ${gap.toFixed(3)} m apart on a run of ${bayLength} m bays`,
    );
  }

  // **The guard.** Pitched by centreline distance instead — which is what a run
  // written without the `1 - k * t` correction does — the outside of an R16
  // bend at 14 m leaves most of a bay's length between every pair.
  const naive = 6 + bayLength;
  const naiveCentre = centrelineAt(segment.entry, segment.spec, naive);
  const naiveLeft = leftOf(headingAt(segment.entry, segment.spec, naive));
  const naiveGap = Math.hypot(
    naiveCentre.x + naiveLeft.x * t - world[0]!.x,
    naiveCentre.z + naiveLeft.z * t - world[0]!.z,
  );
  assert.ok(
    naiveGap > bayLength * 1.5,
    `the uncorrected pitch would leave ${naiveGap.toFixed(2)} m between bays, not a gap worth guarding`,
  );
});

test('a rail on a straight is pitched at exactly one bay', () => {
  const placed = placeOf(STRAIGHT);
  const segment = placed[0]!;
  const bays = railProps([{ segment: 'straight', fromS: 10, toS: 34, t: -13 }], () => 0)
    .get('straight')!;
  const bayLength = PROP_SIZES.fenceBay.length;
  assert.equal(bays.length, Math.floor(24 / bayLength) + 1);
  for (let index = 1; index < bays.length; index += 1) {
    assert.ok(Math.abs(bays[index]!.s - bays[index - 1]!.s - bayLength) < 1e-9);
  }
  // And it stands outside the corridor, at its own footprint's corner.
  for (const bay of bays) {
    const centre = centrelineAt(segment.entry, segment.spec, bay.s);
    const left = leftOf(headingAt(segment.entry, segment.spec, bay.s));
    const footprint = PROP_FOOTPRINTS.fenceBay;
    assert.equal(footprint.shape, 'box');
    const reach = footprint.shape === 'box' ? Math.hypot(footprint.halfX, footprint.halfZ) : 0;
    const outside = outsideOf(placed, centre.x + left.x * bay.t, centre.z + left.z * bay.t);
    assert.ok(outside - reach > PROP_CORRIDOR_CLEARANCE);
  }
});

// ---------------------------------------------------------------------------
// 5 — what the forest is told to keep off
// ---------------------------------------------------------------------------

test('exclusions are read off the placed chain, props and blocks alike', () => {
  const spec: SegmentSpec = {
    ...STRAIGHT,
    props: [{ s: 20, t: -11, kind: 'bench' }, { s: 40, t: 11, kind: 'signpost', scale: 1.5 }],
    blocks: [{ s: 30, t: -12, halfAlong: 1.3, halfLateral: 0.9, height: 0.4, surface: 'wood' }],
  };
  const placed = placeOf(spec);

  const props = propExclusions(placed);
  assert.equal(props.length, 2);
  // A bench is a box, so its reserved radius is the half-diagonal; a signpost
  // is a circle, and its scale multiplies it.
  const bench = PROP_FOOTPRINTS.bench;
  assert.equal(bench.shape, 'box');
  if (bench.shape === 'box') {
    assert.ok(Math.abs(props[0]!.radius - Math.hypot(bench.halfX, bench.halfZ)) < 1e-9);
  }
  const post = PROP_FOOTPRINTS.signpost;
  assert.equal(post.shape, 'circle');
  if (post.shape === 'circle') assert.ok(Math.abs(props[1]!.radius - post.radius * 1.5) < 1e-9);

  const blocks = blockExclusions(placed);
  assert.equal(blocks.length, 1);
  assert.ok(Math.abs(blocks[0]!.radius - Math.hypot(1.3, 0.9)) < 1e-9);

  // And the forest actually keeps off both of them.
  const forest = plantForest(siteOf(placed, { exclusions: [...props, ...blocks] }));
  for (const prop of forest) {
    for (const exclusion of [...props, ...blocks]) {
      const footprint = PROP_FOOTPRINTS[prop.kind];
      const reach = (footprint.shape === 'circle' ? footprint.radius : 0) * prop.scale;
      assert.ok(
        Math.hypot(prop.x - exclusion.x, prop.z - exclusion.z)
          >= reach + exclusion.radius + FOREST_STRUCTURE_GAP - 1e-9,
      );
    }
  }
});

test('clearance is measured from the footprint, not from the centre', () => {
  const placed = placeOf(STRAIGHT);
  const segment = placed[0]!;
  const centre = centrelineAt(segment.entry, segment.spec, 40);
  const left = leftOf(headingAt(segment.entry, segment.spec, 40));
  const t = 16;
  const x = centre.x + left.x * t;
  const z = centre.z + left.z * t;

  const radius = PROP_FOOTPRINTS.conifer.shape === 'circle' ? PROP_FOOTPRINTS.conifer.radius : 0;
  assert.equal(clearanceOf(placed, { kind: 'conifer', x, z, scale: 1 }), t - 8 - radius);
  // Scale is part of the reach, which is the whole reason the forest carries
  // one: a conifer at 1.25 is half a metre wider than a conifer at 1.
  assert.ok(
    clearanceOf(placed, { kind: 'conifer', x, z, scale: 1.25 })
      < clearanceOf(placed, { kind: 'conifer', x, z, scale: 1 }),
  );
  // A prop in the road reports a negative clearance rather than zero, so a
  // failure says how far in it was.
  assert.ok(clearanceOf(placed, { kind: 'conifer', x: centre.x, z: centre.z, scale: 1 }) < 0);
});
