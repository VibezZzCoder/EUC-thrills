/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BUILDING_CLEARANCE,
  BUILDING_FACADE,
  BUILDING_MAX_JOIN_FRACTION,
  BUILDING_TONES,
  PROP_BUDGET,
  PROP_COLOURS,
  PROP_FOOTPRINTS,
  PROP_KINDS,
  PROP_SIZES,
  PROP_SOLIDS,
  PROP_SPREADS,
  PROP_TINT_JITTER,
  PROP_VERTICAL_SPANS,
  type PropKind,
} from './props.ts';

/**
 * The prop kit's own table test, and it is here for the same reason
 * `surfaces.test.ts` is: **every colour in this project is sRGB and three
 * decodes it to linear**, so a value picked by eye against a white canvas ships
 * too dark, and this project has done that four separate times
 * (`DESIGN.md` §2). Decoding each hex back and asserting the palette's
 * legibility bounds is what turns the comment beside each value into a claim
 * that can fail.
 *
 * Nothing here imports three.js, so all of it runs under `node --test`.
 */

/** Every kind the union declares, written out so a new one fails here. */
const DECLARED: readonly PropKind[] = [
  'broadleafTree',
  'treeCanopy',
  'conifer',
  'shrub',
  'lampPost',
  'bench',
  'litterBin',
  'bollardCap',
  'signpost',
  'fenceBay',
  'building',
];

/** Linear luminance of an sRGB hex, the same arithmetic `surfaces.test.ts` uses. */
function luminance(hex: number): number {
  return 0.2126 * (((hex >> 16) & 0xff) / 255) ** 2.2
    + 0.7152 * (((hex >> 8) & 0xff) / 255) ** 2.2
    + 0.0722 * ((hex & 0xff) / 255) ** 2.2;
}

test('the kind list and the kind union agree', () => {
  assert.deepEqual([...PROP_KINDS].sort(), [...DECLARED].sort());
});

test('every prop colour is legible rather than realistically dark', () => {
  // The same floor and ceiling the surface palette is held to, because these
  // are lit by the same rig and judged in the same frame (`DESIGN.md` §3).
  for (const [name, hex] of Object.entries(PROP_COLOURS)) {
    const value = luminance(hex);
    assert.ok(value > 0.03, `${name} is ${value.toFixed(3)} linear — it will crush under ACES`);
    assert.ok(value < 0.6, `${name} is ${value.toFixed(3)} linear — it will blow out`);
  }
});

test('the three foliage greens read apart from each other', () => {
  // A park whose conifers, broadleaves, and undergrowth are one colour is a
  // park made of one tree. Undergrowth is lightest so it does not merge into
  // the canopy above it at chase-camera distance, and the conifer is darkest.
  const shrub = luminance(PROP_COLOURS.shrubFoliage);
  const broadleaf = luminance(PROP_COLOURS.broadleafFoliage);
  const conifer = luminance(PROP_COLOURS.coniferFoliage);

  assert.ok(shrub > broadleaf * 1.05, 'undergrowth does not read apart from the broadleaves');
  assert.ok(broadleaf > conifer * 1.25, 'the broadleaves do not read apart from the conifers');
});

test('the skyline offers more than one tone, and its parapet is darker', () => {
  // A roofline is a line only if the cap reads apart from the body it sits on.
  assert.ok(BUILDING_TONES.length >= 3, 'a skyline of one colour is a wall');
  const cap = luminance(PROP_COLOURS.buildingCap);
  for (const tone of BUILDING_TONES) {
    assert.ok(luminance(tone) > cap * 1.4, 'a body tone does not read apart from the parapet');
  }
});

test('every tint jitter is a fraction rather than a multiplier', () => {
  for (const [name, value] of Object.entries(PROP_TINT_JITTER)) {
    assert.ok(value >= 0 && value < 0.5, `${name} jitter of ${value} is not a fraction`);
  }
});

test('every authored size is positive and at a human scale', () => {
  const walk = (path: string, value: unknown): void => {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${path} is not a number`);
      // Nothing in the kit is negative, and nothing is larger than a tree.
      assert.ok(value > -1 && value < 20, `${path} is ${value}, which is not a prop dimension`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(`${path}[${index}]`, entry));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) walk(`${path}.${key}`, entry);
    }
  };
  walk('PROP_SIZES', PROP_SIZES);
});

test('every prop kind declares the footprint the level builder protects', () => {
  assert.deepEqual(Object.keys(PROP_FOOTPRINTS).sort(), [...PROP_KINDS].sort());
  for (const [kind, footprint] of Object.entries(PROP_FOOTPRINTS)) {
    if (footprint.shape === 'circle') {
      assert.ok(footprint.radius >= 0, `${kind} has a negative footprint`);
    } else {
      assert.ok(footprint.halfX > 0 && footprint.halfZ > 0, `${kind} has an empty footprint`);
    }
  }
});

test('every prop kind declares a finite vertical envelope', () => {
  assert.deepEqual(Object.keys(PROP_VERTICAL_SPANS).sort(), [...PROP_KINDS].sort());
  for (const [kind, span] of Object.entries(PROP_VERTICAL_SPANS)) {
    assert.ok(Number.isFinite(span.bottom) && Number.isFinite(span.top), `${kind} span is not finite`);
    assert.ok(span.top > span.bottom, `${kind} has an empty vertical envelope`);
  }
});

test('nothing that stands on the ground begins above it', () => {
  // **The owner circled two of these on his second ride as "floating tree
  // parts".** A prop is placed with its origin on the ground, so a kind whose
  // mesh starts at a positive height stands on a visible band of daylight —
  // every instance of it, everywhere, in the hand-authored slice as much as in
  // a generated route. The conifer was the case: three cones, no trunk, and a
  // lowest tier authored 0.45 m up.
  //
  // The two exemptions are the two kinds that are *not* placed on the ground:
  // a crown is authored on a trunk collider and a finial on a bollard, and both
  // say so with `onCollider`.
  for (const kind of PROP_KINDS) {
    if (kind === 'treeCanopy' || kind === 'bollardCap') continue;
    assert.ok(
      PROP_VERTICAL_SPANS[kind].bottom <= 0,
      `${kind} begins ${PROP_VERTICAL_SPANS[kind].bottom.toFixed(2)} m above the ground it stands on`,
    );
  }
});

test('the conifer buries its skirt rather than resting it exactly on zero', () => {
  // Zero would be right on ground that is flat, and no ground is flat. A prop
  // is one rigid object at one sampled height, so a skirt at exactly zero lifts
  // off the moment the turf falls away under one side of it — which is most of
  // the time. A quarter of a metre into the ground costs nothing visible and
  // survives the slope the builder is willing to stand a prop on at all.
  assert.ok(
    PROP_VERTICAL_SPANS.conifer.bottom <= -0.15,
    'the conifer sits on the ground rather than into it',
  );
  assert.ok(
    PROP_VERTICAL_SPANS.conifer.bottom > -1,
    'the conifer is buried, not planted',
  );
});

test('the conifer’s collider is no taller than the conifer', () => {
  // It is derived from the tier stack for exactly this reason: the stack moved
  // 0.70 m down and a restated 8.6 would have left a collider standing in the
  // air above the tree that justifies it.
  const solid = PROP_SOLIDS.conifer;
  assert.ok(solid !== null);
  assert.equal(solid.height, PROP_VERTICAL_SPANS.conifer.top);
});

test('the shrub collider follows its visible lobe without blocking its outer corners', () => {
  const solid = PROP_SOLIDS.shrub;
  assert.ok(solid !== null, 'shared-playtest shrubs are still pass-through');

  const visibleHalfX = PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleX;
  const visibleHalfZ = PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleZ;
  assert.ok(solid.halfX < visibleHalfX, 'the collider circumscribes the shrub on X');
  assert.ok(solid.halfZ < visibleHalfZ, 'the collider circumscribes the shrub on Z');
  assert.ok(solid.halfX > visibleHalfX * 0.85, 'the shrub has no meaningful X collision body');
  assert.ok(solid.halfZ > visibleHalfZ * 0.85, 'the shrub has no meaningful Z collision body');
  assert.equal(solid.height, PROP_VERTICAL_SPANS.shrub.top, 'the solid rises above the mesh');
  assert.equal(solid.occludes, false, 'a knee-high shrub makes the chase camera duck');
});

test('the conifer’s tiers stack without a gap between them', () => {
  // The silhouette is the whole prop. A tier that starts above the one below it
  // ends is a floating cone, which is visible from every angle at once.
  const tiers = PROP_SIZES.conifer.tiers;
  assert.ok(tiers.length >= 3, 'fewer than three tiers is a cone, not a conifer');
  for (let index = 1; index < tiers.length; index += 1) {
    const below = tiers[index - 1];
    assert.ok(
      tiers[index].base < below.base + below.height,
      `conifer tier ${index} floats above the one below it`,
    );
    assert.ok(tiers[index].radius < below.radius, `conifer tier ${index} is not narrower`);
  }
});

test('the broadleaf’s crown swallows the top of its own trunk', () => {
  // A crown that starts above the trunk leaves a gap only visible from the
  // side, which is where the chase camera spends every corner.
  const tree = PROP_SIZES.broadleafTree;
  const crownBase = tree.crownCentre - tree.crownHeight / 2;
  assert.ok(crownBase < tree.trunkHeight, `the crown starts ${crownBase} m up, above the trunk`);
  assert.ok(tree.upperCentre > tree.crownCentre, 'the second lobe is not above the first');
});

test('the budget is stated in numbers the frame can actually afford', () => {
  // DESIGN.md §8: 150 draw calls and 400k triangles for the whole frame, of
  // which M7 already spends 74 and 143,720. These are the props' share.
  assert.ok(PROP_BUDGET.maxDrawCalls + 74 <= 150, 'the prop budget overruns the frame');
  assert.ok(PROP_BUDGET.maxTriangles + 143_720 <= 400_000, 'the prop budget overruns the frame');
  assert.ok(PROP_BUDGET.maxTrianglesPerProp < 100, 'a prop that size is not a blockout prop');
});

// ---------------------------------------------------------------------------
// The visual envelope, added 2026-08-03 after a tree grew out of a building
// ---------------------------------------------------------------------------

/**
 * The widest each kind gets, worked out **again** from `PROP_SIZES`.
 *
 * Written out longhand rather than read from `PROP_SPREADS`, and that is the
 * entire point of the test below: an assertion that reads the table it is
 * checking proves the table equals itself. A mutation that set the broadleaf's
 * spread back to its trunk radius passed every existing check for exactly that
 * reason, and this is the second derivation that catches it.
 */
const WIDEST: Record<PropKind, number> = {
  broadleafTree: Math.max(
    PROP_SIZES.broadleafTree.crownRadius,
    PROP_SIZES.broadleafTree.upperOffset + PROP_SIZES.broadleafTree.upperRadius,
    PROP_SIZES.broadleafTree.trunkRadiusBase,
  ),
  treeCanopy: Math.max(
    PROP_SIZES.broadleafTree.crownRadius,
    PROP_SIZES.broadleafTree.upperOffset + PROP_SIZES.broadleafTree.upperRadius,
  ),
  conifer: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.radius)),
  shrub: PROP_SIZES.shrub.radius * Math.max(PROP_SIZES.shrub.scaleX, PROP_SIZES.shrub.scaleZ),
  lampPost: Math.max(
    PROP_SIZES.lampPost.postRadius * 1.35,
    PROP_SIZES.lampPost.armLength,
    PROP_SIZES.lampPost.headReach + PROP_SIZES.lampPost.headDepth / 2,
  ),
  bench: PROP_SIZES.bench.length / 2,
  litterBin: PROP_SIZES.litterBin.radiusTop * 1.12,
  bollardCap: PROP_SIZES.bollardCap.radius,
  signpost: PROP_SIZES.signpost.plateWidth - PROP_SIZES.signpost.postRadius,
  fenceBay: PROP_SIZES.fenceBay.length / 2,
  building: 0.5,
};

/** The largest distance from a footprint's origin to its own boundary. */
const reach = (kind: PropKind, table: typeof PROP_SPREADS): number => {
  const shape = table[kind];
  return shape.shape === 'circle' ? shape.radius : Math.max(shape.halfX, shape.halfZ);
};

test('every kind declares the envelope its own mesh actually occupies', () => {
  for (const kind of PROP_KINDS) {
    assert.ok(
      reach(kind, PROP_SPREADS) >= WIDEST[kind] - 1e-9,
      `${kind} spreads ${reach(kind, PROP_SPREADS).toFixed(2)} m against a mesh reaching ${WIDEST[kind].toFixed(2)} m`,
    );
  }
});

test('a spread is never narrower than the footprint of the same kind', () => {
  // The two tables answer different questions — "could a rider hit it" and
  // "how wide does it get at any height" — and the second can only ever be the
  // larger of the two. A spread under its own footprint would mean a prop the
  // corridor guard protects against and the building guard does not.
  for (const kind of PROP_KINDS) {
    assert.ok(
      reach(kind, PROP_SPREADS) >= reach(kind, PROP_FOOTPRINTS) - 1e-9,
      `${kind}'s spread is narrower than its footprint`,
    );
  }
});

test('the tree, the canopy and the lamp are wider than they are footed', () => {
  // Named individually because these three are the whole reason the second
  // table exists: their ground footprint is a fraction of their visible width,
  // and a guard reading the footprint lets a crown grow out of a wall.
  for (const kind of ['broadleafTree', 'treeCanopy', 'lampPost'] as const) {
    assert.ok(
      reach(kind, PROP_SPREADS) > reach(kind, PROP_FOOTPRINTS) * 1.5,
      `${kind} spreads no wider than it stands, which is what the second table is for`,
    );
  }
});

test('a building keeps real clearance around it, and a metre is not a wall', () => {
  assert.ok(BUILDING_CLEARANCE > 0.25 && BUILDING_CLEARANCE < 2, 'the clearance is a hand-span, not a plaza');
  assert.ok(
    BUILDING_MAX_JOIN_FRACTION > 0.05 && BUILDING_MAX_JOIN_FRACTION < 0.3,
    'a building join must permit a seam without permitting a fused half-block',
  );
});

test('the facade bands are storeys rather than stripes', () => {
  assert.ok(BUILDING_FACADE.lowFloors >= 3, 'fewer than three bands is not a rhythm');
  assert.ok(BUILDING_FACADE.highFloors > BUILDING_FACADE.lowFloors);
  assert.ok(BUILDING_FACADE.highRiseHeight > 10, 'every block would be a tower');
  assert.ok(
    BUILDING_FACADE.glazing > 0.3 && BUILDING_FACADE.glazing < 0.7,
    'glazing is a band, not a greenhouse or a hairline',
  );
  // The switch has to land where both patterns give plausible storeys.
  assert.ok(BUILDING_FACADE.minFloorHeight > 1.5);
  assert.ok(BUILDING_FACADE.maxFloorHeight < 8);
  assert.ok(
    BUILDING_FACADE.highRiseHeight / BUILDING_FACADE.lowFloors
      < BUILDING_FACADE.maxFloorHeight,
  );
  assert.ok(
    BUILDING_FACADE.highRiseHeight / BUILDING_FACADE.highFloors
      > BUILDING_FACADE.minFloorHeight,
  );
});
