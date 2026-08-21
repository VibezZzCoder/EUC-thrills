/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canonicalPlanString, hash128, planDigest, planSummary } from './planDigest.ts';
import type { LevelPlan } from './plan.ts';
import { createProvingGround } from './provingGround.ts';
import { createSliceLevel } from './sliceLevel.ts';

/**
 * The digest, mutation-tested.
 *
 * `docs/PLANS.md` M12 Phase 1 makes deep equality of the slice's `LevelPlan`
 * the regression guarantee for the whole extraction, and the digest is the only
 * thing that can carry that guarantee across a code change. An audit that
 * cannot fail is not an audit (`src/architecture.test.ts` says the same about
 * the import boundary), so every difference the digest has to be able to see is
 * shown to change it below — including the three `JSON.stringify` cannot see.
 */

/** A minimal but structurally complete plan, so a mutation has somewhere to go. */
function fixture(): LevelPlan {
  return {
    id: 'fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: {
      originX: -1,
      originZ: -1,
      spacing: 1,
      columns: 2,
      rows: 2,
      heights: [0, 0, 0, 0],
      surfaces: ['grass'],
    },
    segments: [{
      id: 'a',
      entry: {
        position: { x: 0, y: 0, z: 0 }, headingY: 0, surface: 'pavement', halfWidth: 3, gradient: 0,
      },
      exit: {
        position: { x: 0, y: 0, z: 10 }, headingY: 0, surface: 'pavement', halfWidth: 3, gradient: 0,
      },
      colliders: [{
        centre: { x: 0, y: 0, z: 5 },
        halfExtents: { x: 1, y: 1, z: 1 },
        rotationY: 0,
        surface: 'brick',
      }],
    }],
    checkpoints: [],
  };
}

test('the digest is stable across two builds of the same plan', () => {
  assert.equal(planDigest(fixture()), planDigest(fixture()));
});

test('a changed number changes the digest', () => {
  const mutated = fixture();
  mutated.heightfield.heights = [0, 0, 0, 0.0000001];
  assert.notEqual(planDigest(mutated), planDigest(fixture()));
});

test('negative zero is not zero — the difference JSON.stringify cannot see', () => {
  // `segments.ts` carries two explicit guards against emitting -0, on the
  // grounds that it compares equal to 0 and is not deep-equal to it. A digest
  // blind to the difference could not police them.
  const mutated = fixture();
  mutated.segments[0].entry.gradient = -0;

  // `assert.equal` is `Object.is` under `node:assert/strict`, which is exactly
  // the comparison that *can* tell them apart — so the claim that they compare
  // equal has to be made with `===`, which is the comparison that cannot.
  assert.ok(mutated.segments[0].entry.gradient === 0, 'the two compare equal');
  assert.equal(
    JSON.stringify(mutated),
    JSON.stringify(fixture()),
    'and JSON.stringify writes both as "0"',
  );
  assert.notEqual(planDigest(mutated), planDigest(fixture()), 'the digest must see it');
});

test('key order does not change the digest — a deep-equal object is one plan', () => {
  const reordered = fixture();
  const collider = reordered.segments[0].colliders[0];
  reordered.segments[0].colliders[0] = {
    surface: collider.surface,
    rotationY: collider.rotationY,
    halfExtents: collider.halfExtents,
    centre: collider.centre,
  };

  assert.notEqual(
    JSON.stringify(reordered),
    JSON.stringify(fixture()),
    'insertion order changes the stringification',
  );
  assert.deepStrictEqual(reordered, fixture(), 'and the two are still deep-equal');
  assert.equal(planDigest(reordered), planDigest(fixture()), 'so the digest must agree');
});

test('an absent optional is not a present undefined one', () => {
  const present = fixture();
  // `appearance` is optional on BoxCollider. Present-and-undefined is
  // deep-strict-unequal to absent, and `JSON.stringify` writes both the same.
  (present.segments[0].colliders[0] as { appearance?: undefined }).appearance = undefined;

  assert.equal(JSON.stringify(present), JSON.stringify(fixture()));
  assert.notEqual(planDigest(present), planDigest(fixture()));
});

test('an empty optional array is not an absent one', () => {
  const empty = fixture();
  empty.props = [];
  assert.notEqual(planDigest(empty), planDigest(fixture()));
});

test('an empty targets array is not an absent one either — the M14 contract', () => {
  // The general rule is the test above; this is the same rule pinned on the key
  // M14 introduces, because for `targets` the two spellings carry *different
  // meanings* rather than merely different digests. Absent is a world the target
  // pass never ran on. Empty is a world it ran on and placed nothing in, which
  // §13 q21 makes legal and refuses at the entrance instead of throwing the
  // route away. A producer that emitted `[]` for "none" would erase that
  // distinction, and both pinned plan digests would move on the day it did.
  const empty = fixture();
  empty.targets = [];
  assert.equal(planSummary(empty).targets, 0, 'the census cannot tell them apart');
  assert.equal(planSummary(fixture()).targets, 0, 'which is why the digest has to');
  assert.notEqual(planDigest(empty), planDigest(fixture()));
});

test('a reordered array is a different plan', () => {
  const two = fixture();
  two.segments[0].colliders.push({
    centre: { x: 9, y: 0, z: 5 },
    halfExtents: { x: 1, y: 1, z: 1 },
    rotationY: 0,
    surface: 'brick',
  });
  const swapped = fixture();
  swapped.segments[0].colliders = [two.segments[0].colliders[1], two.segments[0].colliders[0]];

  assert.notEqual(planDigest(swapped), planDigest(two));
});

test('a string cannot impersonate the digest framing', () => {
  // Ids are player-invisible but author-controlled, and an unquoted separator
  // would let one collide with a structural boundary.
  const a = fixture();
  a.id = 'x","y';
  const b = fixture();
  b.id = 'x';
  (b as { extra?: string }).extra = 'y';
  assert.notEqual(planDigest(a), planDigest(b));
});

test('the hash separates inputs that differ only in order', () => {
  assert.notEqual(hash128('ab'), hash128('ba'));
  assert.notEqual(hash128('a'), hash128('aa'));
  assert.equal(hash128(''), hash128(''));
  assert.equal(hash128('euc').length, 32);
});

test('the canonical string is exact enough to diff by hand', () => {
  const text = canonicalPlanString(fixture());
  assert.ok(text.includes('"id":"fixture"'));
  assert.ok(text.includes('"halfWidth":3'));
});

// ---------------------------------------------------------------------------
// The Phase 1 guarantee itself
// ---------------------------------------------------------------------------

/**
 * What `createSliceLevel()` emitted on 2026-08-08, before M12 touched anything.
 *
 * **This constant is the M12 Phase 1 gate** (`docs/PLANS.md` §10): the beats
 * were promoted into a segment library with stitching metadata, and the plan
 * the slice emits had to come out deep-equal to the plan it emitted before —
 * because the hand-authored slice is the known-good reference the whole
 * milestone is judged against, and because the owner has already accepted and
 * published it. If this fails, the extraction changed the level; the milestone
 * stops and the owner rides the slice again before anything else proceeds.
 *
 * It is a *pre*-change measurement. It was taken from the shipped code and
 * checked in before the first line of the extraction was written, which is the
 * only order in which it proves anything.
 */
const SLICE_PLAN_DIGEST_2026_08_08 = '02b4a9dda7cc22db0eae6bcedcfc6130';

/** The same, for the M2–M6 measuring instrument, which M12 must also not move. */
const PROVING_PLAN_DIGEST_2026_08_08 = '6f5e47adbe23beb05dbc717ca89cc672';

/**
 * What it emits now, after the owner's **second** ride of a generated route.
 *
 * **The Phase 1 gate was met and then deliberately re-set, in that order.** The
 * extraction into the segment library moved nothing — the slice held
 * `SLICE_PLAN_DIGEST_2026_08_08` through the whole of Phases 0 to 2, which is
 * what that constant was for and it stays here as the record. What moved it is
 * three authored fixes to defects the owner photographed, every one of which
 * lives in data the hand-authored level shares with the generated one:
 *
 *   1. **The conifer's skirt reaches the ground.** Its lowest cone was authored
 *      0.45 m above its own origin with no trunk under it, so every conifer in
 *      every world stood on a visible band of daylight. The stack dropped 0.70 m
 *      (`data/props.ts`). One of the slice's 149 conifers now overlaps a piece
 *      of structural furniture it used to float over, and is culled: 148.
 *   2. **The boulevard's traffic island has a bollard at each end.** A 0.15 m
 *      plate of pale concrete in a grey road read as a slab of dropped pavement
 *      from the chase camera, twice. Two blocks and two finials, the plaza's own
 *      bollard to the centimetre: colliders 95 → 97, props +2, solids ±0.
 *   3. **Authored blocks are footed** (`BuildOptions.settleBlocks`). One
 *      collider moves: the return climb's 40 m retaining wall, which stood
 *      1.88 m clear of the ground beside it. Top faces are untouched, so nothing
 *      a rider can reach has changed.
 *
 * Net census: colliders 95 → 97, props 781 → 782, solids 538 → 537.
 */
const SLICE_PLAN_DIGEST_2026_08_08_SECOND_RIDE = 'ddf7805060b6a08c3be458c3d08c6dd9';

/**
 * What the slice emits after the 2026-08-10 shared-playtest shrub-collision
 * fix. Route geometry, terrain, dressing positions, paint, checkpoints, and
 * hazards did not move. The only change is that 196 free-standing shrubs now
 * contribute compact non-occluding solids; three plaza planters already stand
 * on the fountain wall and deliberately do not duplicate its collision.
 *
 * Net census: solids 537 → 733. Every rendered count stays identical because
 * `plan.solids` is simulation data and the shrub meshes already existed.
 */
const SLICE_PLAN_DIGEST_2026_08_10_SHRUB_COLLISION = '088e4522385ab4837297325789540d95';

/**
 * What the slice emits after the M15 soft-foliage revision (2026-08-11).
 *
 * The 2026-08-10 fix made shrubs solid and the forum immediately reported the
 * overcorrection — "a collision with a bush now reacts like a boulder"
 * (`references/PublicFeedback/FEEDBACK-TRIAGE.md` §3). The same 196 boxes now
 * arrive as `plan.softBodies`: drag volumes the controller reads, never
 * walls the sampler can see. Nothing moved — position for position they are
 * the boxes the 2026-08-10 plan carried as solids.
 *
 * Net census: solids 733 → 537, softBodies 0 → 196. Rendered counts are
 * untouched for the 2026-08-10 revision's own reason.
 */
const SLICE_PLAN_DIGEST_2026_08_11_SOFT_FOLIAGE = '76a2d24495a2a0e333497b2111b1a6af';

test('the slice emits the intentionally revised soft-foliage plan', () => {
  assert.equal(
    planDigest(createSliceLevel()),
    SLICE_PLAN_DIGEST_2026_08_11_SOFT_FOLIAGE,
    'the hand-authored slice changed. docs/PLANS.md M12: stop and tell the '
      + 'owner — the slice is the reference this milestone is judged against '
      + 'and it stays in the build permanently.',
  );
  assert.notEqual(
    SLICE_PLAN_DIGEST_2026_08_11_SOFT_FOLIAGE,
    SLICE_PLAN_DIGEST_2026_08_10_SHRUB_COLLISION,
    'the soft-foliage revision records no plan change',
  );
  assert.notEqual(
    SLICE_PLAN_DIGEST_2026_08_10_SHRUB_COLLISION,
    SLICE_PLAN_DIGEST_2026_08_08_SECOND_RIDE,
    'the shrub-collision revision records no plan change',
  );
  assert.notEqual(
    SLICE_PLAN_DIGEST_2026_08_08_SECOND_RIDE,
    SLICE_PLAN_DIGEST_2026_08_08,
    'the second-ride revision records no plan change',
  );
});

test('the proving ground emits the same LevelPlan too', () => {
  // `docs/PLANS.md` §2.5: the proving ground is the measuring instrument for
  // the entire movement phase, and every number the owner accepted at M2–M6 was
  // settled on it. M12 must leave it exactly where it is.
  assert.equal(planDigest(createProvingGround()), PROVING_PLAN_DIGEST_2026_08_08);
});

test('two builds of the slice are deep-equal, not merely equal-digested', () => {
  // The digest stands alone only across a code change. Where both plans exist
  // at once, the real comparison is available and is worth making.
  assert.deepStrictEqual(createSliceLevel(), createSliceLevel());
});

test('the slice census is what the digest is a digest of', () => {
  // A digest that changed would say nothing about *what* changed. These are the
  // first numbers to look at when it does — and the three lines that moved
  // between the pre-M12 census and this one are itemised on
  // `SLICE_PLAN_DIGEST_2026_08_08_SECOND_RIDE` above, with the reason for each.
  assert.deepStrictEqual(planSummary(createSliceLevel()), {
    id: 'm7-slice',
    segments: 34,
    colliders: 97,
    solids: 537,
    // The 2026-08-10 shrub solids, rerouted at M15: a bush drags, a wall stops.
    softBodies: 196,
    props: 782,
    markings: 39,
    markingPoints: 1324,
    checkpoints: 6,
    // Zero, and expected to stay zero: §13 q9 puts hazards in generated routes
    // only, so the hand-authored slice never carries one. A non-zero here means
    // the pinned digest above has already moved.
    hazards: 0,
    // Zero for the same reason under §13 q12, and added to the census at M14
    // without any digest moving. **This line is a census-shape change, not a
    // digest break**: `planSummary` grew a field, so the `deepStrictEqual` above
    // failed while `planDigest` stayed byte-identical, because the digest reads
    // the plan and this reads the summary of it. If a future field lands here
    // the same way, check the digest before reaching for the message below.
    targets: 0,
    // Zero for a third time, at M23, and the third census-shape change this
    // block has absorbed without the digest moving: the slice is a
    // point-to-point course, so `buildLevelPlan` emits no `lap` key at all and
    // `planSummary` reports nothing to count. `LevelPlan.lap` follows the same
    // absent-never-empty contract `targets` writes down, which is exactly why
    // the digest above is byte-identical either side of the change.
    lapPoints: 0,
    samples: 97200,
    cells: 96571,
    columns: 270,
    rows: 360,
  });
});
