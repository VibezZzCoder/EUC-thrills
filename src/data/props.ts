/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';
import type { SurfaceId } from '../simulation/world.ts';

/**
 * The prop kit — M7.5, and the third of the project's data tables.
 *
 * M7 finished the slice's *geometry* and left it empty: bare ground, a few grey
 * frontage slabs, and nothing that gives the place scale, identity, or anything
 * to measure speed against as it goes past. This table is the vocabulary the
 * dressing is built from, and `render/props.ts` is the only file that turns an
 * entry here into triangles.
 *
 * **Props were decoration and carried no collider until M8.6**, when the owner
 * rode through a skyline block on the grass and reported it as a projection.
 * `PROP_SOLIDS` below is the table that answers it: the solid kinds now emit a
 * `BoxCollider` from `level/buildPlan.ts` and the soft ones — canopies and
 * bollard finials — stay exactly as pass-through as they were. Nothing in this
 * file may import three.js: `level/` names these kinds, and `level/` is sealed
 * (AGENTS.md invariant 1).
 *
 * ## Colour authoring, restated because this is the fifth mesh set to face it
 *
 * Every hex below is **sRGB** and three.js decodes it to linear before
 * lighting, so the linear reflectance each one was chosen as is written beside
 * it (`DESIGN.md` §2). `props.test.ts` decodes every value and asserts it back
 * inside the palette's legibility floor and ceiling — 0.03 to 0.6 linear
 * luminance — so a value picked by eye against a white canvas fails at
 * `node --test` rather than in a screenshot nobody looks at closely.
 *
 * The existing surface materials are reused wherever a prop is made of
 * something the level already has: trunks, benches, and fences are `wood`,
 * posts and bins are `metal`, and the skyline reuses nothing because nothing in
 * `data/surfaces.ts` is a building. Only the genuinely new values live here,
 * because `data/surfaces.ts` is the single palette (`DESIGN.md` §3) and a
 * second copy of `wood` in a second table is exactly the drift that rule
 * exists to prevent.
 *
 * ## Sizes
 *
 * Metres, at `scale: 1`. They are chosen against the **chase camera**, not
 * against a tape measure: at the arm's six metres these are read as silhouettes
 * at speed, and `DESIGN.md` §7's lesson is that silhouette carries recognition
 * far more than surface detail does. A street tree is therefore a chunky 8 m
 * rather than a scale-accurate 6 m, and a lamp's head is wide enough to be a
 * lamp's head at thirty metres.
 */

/**
 * What kinds of dressing the world can carry.
 *
 * Named here rather than in `level/plan.ts` for the same reason `MaterialId`
 * is named in `data/surfaces.ts`: the kit is data, the plan only refers to it.
 */
export type PropKind =
  | 'broadleafTree'
  /** The crown alone, for topping a trunk the level already has as a collider. */
  | 'treeCanopy'
  | 'conifer'
  | 'shrub'
  | 'lampPost'
  | 'bench'
  | 'litterBin'
  /** A rounded finial for the plaza's bollards, which are collider boxes. */
  | 'bollardCap'
  | 'signpost'
  /** One bay of a fence run. Runs are made of bays so nothing is stretched. */
  | 'fenceBay'
  /** A skyline or street block. The only kind authored at a metric `size`. */
  | 'building'
  /** A bundle of tyres, M23's venue furniture. */
  | 'tyreStack'
  /**
   * The overhead half of a start gantry: truss, banner and wordmark (M23 B1).
   *
   * **Its legs are not here, and that is the shape of the thing rather than an
   * omission.** A prop stands on the ground and cannot span a road; a
   * `SegmentBlock` spans nothing and cannot leave the ground. So the legs are
   * two blocks in `metal` and this is what crosses the sky between their tops,
   * authored `onCollider` on exactly those two blocks and lifted to their
   * height — the `treeCanopy` pattern, one storey up. It is solid nowhere,
   * because a collider over a road is ground three metres up and a rider who
   * ducks under a gate would land on it (`render/checkpointGates.ts` states
   * the same trap for the same reason).
   */
  | 'gantrySpan';

export const PROP_KINDS: readonly PropKind[] = deepFreeze([
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
  'tyreStack',
  'gantrySpan',
] as PropKind[]);

/**
 * Colours the surface palette does not already carry.
 *
 * Each is authored as a linear reflectance and raised to the power 1/2.2, with
 * the linear triple in the comment so the conversion can be checked instead of
 * re-picked by eye (`DESIGN.md` §2).
 */
export const PROP_COLOURS = deepFreeze({
  /** linear (0.055, 0.105, 0.040) — street and park broadleaf. */
  broadleafFoliage: 0x445c3b,
  /** linear (0.038, 0.072, 0.036) — darker and bluer, so the two read apart. */
  coniferFoliage: 0x394d38,
  /** linear (0.075, 0.135, 0.052) — lighter than either tree *and* than grass,
   *  so undergrowth does not merge into the canopy above it or read as a rock
   *  on the lawn. The first pass sat at 0.099 luminance against grass's 0.077
   *  and looked, from the chase camera, like scattered stones. */
  shrubFoliage: 0x4e6742,
  /** linear (0.55, 0.53, 0.47) — a lamp head catching the midday sun. Just
   *  under the palette's 0.6 ceiling, and the lightest value in the kit. */
  lampHead: 0xc2bfb5,
  /** linear (0.10, 0.14, 0.22) — signage blue-grey. The only cool hue in the
   *  kit, which is what makes a signpost read as information at speed. */
  signPlate: 0x596880,
  //
  // **All four lifted about 55% at M7.5 stage 5, and the reason is arithmetic
  // rather than taste.** A block's shaded face is lit by the hemisphere alone,
  // which on a vertical surface is roughly an eighth of what the sun delivers
  // to a lit one; through `albedo / PI` and then ACES that put a realistic
  // 0.155-linear concrete wall at about 24 of 255 — a black cutout covering a
  // quarter of the frame wherever the route ran past a block. The fill cannot
  // fix it: reaching a readable value that way needs the hemisphere at more
  // than double, which halves the contrast of the crisp contact shadows the
  // mood is LOCKED for. `DESIGN.md` §7 already had the answer — blockout albedo
  // sits far lighter than the real thing, because a blockout authored at the
  // real reflectance renders as an unreadable void — and this is the sixth time
  // this project has had to apply it.
  /** linear (0.38, 0.372, 0.356) — pale concrete frontage. */
  buildingPale: 0xa4a39f,
  /** linear (0.32, 0.283, 0.252) — warm render. */
  buildingWarm: 0x989088,
  /** linear (0.235, 0.250, 0.272) — cool grey, and the one that reads furthest
   *  away when the haze takes the rest. */
  buildingCool: 0x84888d,
  /** linear (0.165, 0.160, 0.153) — parapets and roof slabs, a step down from
   *  every body colour so a roofline is a line rather than a fade. */
  buildingCap: 0x706f6d,
  /** linear (0.042, 0.042, 0.045) — worn tyre rubber, and the darkest value in
   *  the whole kit. It sits above `DESIGN.md` §2's 0.03 legibility floor with
   *  room to spare *after* the instance jitter takes its 7% off, which is the
   *  bound that actually matters: a stack that crushes to a silhouette is a
   *  black hole on the verge rather than a bundle of tyres. Rubber really is
   *  darker than this and would be exactly that hole. */
  tyreStack: 0x3c3c3f,
  /** linear (0.46, 0.462, 0.455) — the wordmark's own plate, and the gantry
   *  part's *base* albedo. **The brightest thing on the venue, and it has to
   *  be the base rather than the truss**: a part carries one albedo and paints
   *  its other colours as ratios in the `color` attribute, and a ratio can only
   *  go down without blowing the bound `props.test.ts` holds. So the palest of
   *  the three is the albedo and the truss and the banner are fractions of it.
   *  The letters therefore carry a flat white and cannot drift from this. */
  gantryPlate: 0xb3b3b2,
  /** linear (0.19, 0.192, 0.20) — galvanised truss, a step above `metal`'s
   *  0.10 because a gantry is read against the *sky* rather than against the
   *  ground, and the sky is the brightest thing in the frame. A lamp post at
   *  metal's value is fine at eye level and reads as a black cutout six metres
   *  up. Painted as a ratio of `gantryPlate`, never as a second material. */
  gantryTruss: 0x7d7e80,
});

/** The three body tones a building picks from, in hash order. */
export const BUILDING_TONES: readonly number[] = deepFreeze([
  PROP_COLOURS.buildingPale,
  PROP_COLOURS.buildingWarm,
  PROP_COLOURS.buildingCool,
]);

/**
 * Per-instance albedo jitter, as a fraction of the linear value.
 *
 * The same job the ground's mottle does (`DESIGN.md` §4) and the same rule:
 * deterministic, from an integer hash of the prop's own position, never
 * `Math.random`. A hundred identical trees read as wallpaper; a hundred trees
 * that differ by a few per cent read as trees.
 */
export const PROP_TINT_JITTER = deepFreeze({
  foliage: 0.16,
  structure: 0.07,
  building: 0.12,
});

/**
 * Metric sizes, in metres, at `scale: 1`.
 *
 * Radial segment counts are here too, because they are the whole triangle
 * budget: six sides on a trunk is a trunk at chase-camera distance and twenty
 * four is the same trunk at four times the cost.
 */
export const PROP_SIZES = deepFreeze({
  broadleafTree: {
    trunkRadiusTop: 0.19,
    trunkRadiusBase: 0.30,
    trunkHeight: 3.1,
    trunkSides: 6,
    /** Two lobes rather than one ball: an offset second lobe is the difference
     *  between a lollipop and a tree at the distance this is read from. */
    crownRadius: 2.45,
    crownHeight: 3.4,
    /** Low enough that the crown swallows the top of the trunk. A crown that
     *  starts above the trunk leaves a gap only visible from the side, which is
     *  where the chase camera spends every corner. */
    crownCentre: 4.6,
    upperRadius: 1.55,
    upperCentre: 6.3,
    upperOffset: 0.75,
  },
  conifer: {
    /**
     * Three tiers and no trunk. A spruce carries foliage nearly to the ground,
     * so the trunk would be a draw call for something nobody can see — and the
     * cone stack is the entire silhouette either way.
     *
     * **The stack sits 0.25 m into the turf, and the first draft floated it
     * 0.45 m over the turf instead.** With no trunk there is nothing between the
     * lowest cone and the ground, so a positive base is a visible band of
     * daylight under every conifer in the level — a hundred and more per world,
     * in the hand-authored slice as much as in a generated route, and the owner
     * circled two of them on his second ride as "floating tree parts". The whole
     * stack moved down by 0.70 m rather than the skirt alone, so the tree keeps
     * the proportions and the tier overlaps it was drawn with; burying the
     * widest tier a further quarter of a metre is what keeps it grounded on
     * ground that is not level, which is most ground.
     */
    tiers: [
      { radius: 2.20, height: 4.3, base: -0.25 },
      { radius: 1.55, height: 3.5, base: 2.60 },
      { radius: 0.95, height: 2.7, base: 5.20 },
    ],
    tierSides: 6,
  },
  shrub: {
    radius: 0.95,
    /** Squashed and widened, so it is a bush rather than a ball on the grass —
     *  but not flattened, which reads as a stone from the chase camera. */
    scaleX: 1.15,
    scaleY: 0.78,
    scaleZ: 0.95,
    centre: 0.62,
  },
  lampPost: {
    postRadius: 0.085,
    postHeight: 4.6,
    postSides: 6,
    armLength: 0.95,
    armThickness: 0.10,
    headWidth: 0.52,
    headHeight: 0.20,
    headDepth: 0.34,
    /** How far the head reaches out over the ground it lights. */
    headReach: 0.95,
  },
  bench: {
    length: 1.85,
    seatHeight: 0.46,
    seatThickness: 0.09,
    seatDepth: 0.46,
    backHeight: 0.40,
    backThickness: 0.08,
    legThickness: 0.09,
  },
  litterBin: {
    radiusTop: 0.27,
    radiusBase: 0.22,
    height: 0.82,
    sides: 8,
    rimHeight: 0.07,
  },
  bollardCap: {
    radius: 0.135,
    /** Flattened: a dome, not a marble. */
    scaleY: 0.72,
  },
  signpost: {
    postRadius: 0.055,
    postHeight: 2.45,
    postSides: 6,
    plateWidth: 1.05,
    plateHeight: 0.32,
    plateThickness: 0.06,
    plateCentre: 2.10,
    /** A second, shorter finger below the first. Two plates read as a
     *  fingerpost; one reads as a paddle. */
    lowerWidth: 0.72,
    lowerHeight: 0.26,
    lowerCentre: 1.68,
  },
  fenceBay: {
    /** Along the run. Runs are built from whole bays, never from one stretched
     *  bay, because an instance matrix that stretches a bay stretches its post
     *  with it (master §9.3). */
    length: 2.4,
    postWidth: 0.11,
    postHeight: 1.02,
    railThickness: 0.05,
    railHeight: 0.09,
    railUpper: 0.88,
    railLower: 0.50,
  },
  tyreStack: {
    /** Four. Three reads as a bollard and six as a tower. */
    tyres: 4,
    radius: 0.44,
    /** Every other tyre is narrower, so the stack has a waist and the eye can
     *  count the tyres in it. A plain cylinder is a bin. */
    waist: 0.88,
    tyreHeight: 0.21,
    /** Eight. It is a small round thing seen from six metres and beyond, and
     *  `DESIGN.md` §7's rule is silhouette rather than surface. */
    sides: 8,
  },
  gantrySpan: {
    /**
     * Half the truss's own length, metres.
     *
     * It reaches from leg to leg, and the legs stand just outside the
     * corridor's own half-width — `level/trackLevel.ts` derives both from the
     * same number, so a wider venue moves the legs and the truss together.
     */
    halfSpan: 10.9,
    /** Depth of the truss, metres. Local `y` runs 0 to here. */
    trussHeight: 1.15,
    /** Square section of the two chords, metres. */
    chord: 0.15,
    /** Diagonals per half-span. Enough to read as a truss, not as a ladder. */
    braces: 6,
    brace: 0.09,
    /** The red panel bolted to the truss. */
    bannerHalfWidth: 4.0,
    bannerHeight: 0.97,
    /** Total thickness, so it stands proud of both chord faces. */
    bannerThickness: 0.29,
    /** Cap height of the wordmark, metres. */
    letterHeight: 0.62,
    /** Stroke width of the wordmark, metres. */
    letterWeight: 0.105,
    /** How far a letter plate stands off the banner face, metres. */
    letterRelief: 0.035,
  },
  building: {
    /** Parapet thickness and how far it oversails the body, metres. */
    capHeight: 0.75,
    capOversail: 0.45,
    /** A setback tower on top, for the taller blocks. Fraction of the body. */
    towerWidthFraction: 0.46,
    towerHeightFraction: 0.22,
  },
});

/**
 * The word the gantry carries, in the alphabet `render/inkKit.ts` owns.
 *
 * **The kit's one lettered part, and the name is here rather than in
 * `level/trackLevel.ts` because `render/props.ts` may not import a level.**
 * That file holds the other end of the wire and throws at module load if the
 * two stop agreeing, which is the check that would catch this drifting away
 * from the place it names.
 *
 * **It carries the venue's whole name, and the first version did not.** B1
 * shipped `BELVAR` alone, and it read as a place rather than as a circuit —
 * the owner's ride was what said so, because a banner with a plausible word on
 * it looks finished. The comparison in `trackLevel.ts` was written against
 * `TRACK_NAME.split(' ')[0]`, so it agreed with the half-name it was given and
 * had nothing to say; a guard aimed at the first word of a name cannot see a
 * missing second word. It now checks the whole name.
 *
 * Nothing else in the kit prints anything, and the alphabet is closed to the
 * letters this project prints — see `inkKit.ts` for what that guard is now
 * that a venue's own name has widened it past the point where being unable to
 * spell a brand was the protection.
 */
export const GANTRY_WORDMARK = 'BELVAR CIRCUIT';

/**
 * The part of each prop that must stay out of a rideable corridor, in local XZ.
 *
 * `buildPlan.ts` consumes this plain data before a mesh exists. Checking only a
 * prop's origin is not enough: a conifer can stand two metres outside a path
 * while its ground-level foliage covers the path, and a fence can run through
 * a neighbouring beat even though both of its endpoints are off that beat's
 * centreline. These dimensions come from the same kit sizes the renderer uses,
 * so the authoring guard and the visible mesh cannot drift.
 *
 * Crowns and bollard caps have no ground footprint of their own. They are
 * explicitly authored on existing solid colliders and continue to use the
 * `onCollider` exception in the level builder.
 */
export type PropFootprint =
  | { readonly shape: 'circle'; readonly radius: number }
  | { readonly shape: 'box'; readonly halfX: number; readonly halfZ: number };

export const PROP_FOOTPRINTS: Readonly<Record<PropKind, PropFootprint>> = deepFreeze({
  broadleafTree: {
    shape: 'circle',
    radius: PROP_SIZES.broadleafTree.trunkRadiusBase,
  },
  treeCanopy: { shape: 'circle', radius: 0 },
  conifer: {
    shape: 'circle',
    radius: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.radius)),
  },
  shrub: {
    shape: 'circle',
    radius: PROP_SIZES.shrub.radius * Math.max(PROP_SIZES.shrub.scaleX, PROP_SIZES.shrub.scaleZ),
  },
  lampPost: {
    shape: 'circle',
    radius: PROP_SIZES.lampPost.postRadius * 1.35,
  },
  bench: {
    shape: 'box',
    halfX: PROP_SIZES.bench.length / 2,
    halfZ: PROP_SIZES.bench.seatDepth / 2,
  },
  litterBin: {
    shape: 'circle',
    radius: PROP_SIZES.litterBin.radiusTop * 1.12,
  },
  bollardCap: { shape: 'circle', radius: 0 },
  signpost: {
    // The plates begin below head height, so the visible finger is clearance,
    // not merely the narrow pole supporting it.
    shape: 'circle',
    radius: PROP_SIZES.signpost.plateWidth,
  },
  fenceBay: {
    shape: 'box',
    halfX: PROP_SIZES.fenceBay.postWidth / 2,
    halfZ: PROP_SIZES.fenceBay.length / 2,
  },
  // A building supplies its metric size on the prop. These unit half-extents
  // are scaled by that size in `buildPlan.ts` rather than used directly.
  building: { shape: 'box', halfX: 0.5, halfZ: 0.5 },
  tyreStack: { shape: 'circle', radius: PROP_SIZES.tyreStack.radius },
  // Nothing. The span has no ground footprint of its own — it is authored on
  // the two leg blocks and skips this guard through `onCollider`, exactly as a
  // crown does over its trunk. **What that guard therefore cannot see is the
  // far leg**, which is why `level/trackLevel.test.ts` checks both legs stand
  // clear of every corridor rather than trusting the builder to notice.
  gantrySpan: { shape: 'circle', radius: 0 },
});

/**
 * The widest each kind gets at **any** height, in local XZ.
 *
 * `PROP_FOOTPRINTS` above answers a different question — "could a rider be
 * riding here" — and for a street tree the honest answer is the *trunk*,
 * because the crown is four metres over their head. That is right for a
 * corridor and wrong for a building: a block is twelve to sixty metres tall, so
 * anything overlapping it in plan overlaps it in fact, and a crown growing out
 * of a wall is the defect the owner photographed on 2026-08-03.
 *
 * So the building guard reads this instead. Same kit dimensions, same
 * derivation rule, different question — and `props.test.ts` asserts that no
 * spread is ever *smaller* than the footprint of the same kind, which is the
 * one relationship between the two tables that has to hold.
 */
export const PROP_SPREADS: Readonly<Record<PropKind, PropFootprint>> = deepFreeze({
  // The crown, not the trunk. The upper lobe reaches 0.75 + 1.55 = 2.30, which
  // the main crown's 2.45 already covers.
  broadleafTree: { shape: 'circle', radius: PROP_SIZES.broadleafTree.crownRadius },
  treeCanopy: { shape: 'circle', radius: PROP_SIZES.broadleafTree.crownRadius },
  // A conifer carries foliage to the ground, so its widest tier is both.
  conifer: PROP_FOOTPRINTS.conifer,
  shrub: PROP_FOOTPRINTS.shrub,
  // The arm and head reach out over what they light, which is most of a lamp's
  // plan extent and none of its footprint.
  lampPost: {
    shape: 'circle',
    radius: PROP_SIZES.lampPost.headReach + PROP_SIZES.lampPost.headDepth / 2,
  },
  bench: PROP_FOOTPRINTS.bench,
  litterBin: PROP_FOOTPRINTS.litterBin,
  // A finial has a real radius even though it has no ground footprint of its
  // own. It is authored on a collider and skips both guards, but the table has
  // to be honest about the shape either way.
  bollardCap: { shape: 'circle', radius: PROP_SIZES.bollardCap.radius },
  signpost: PROP_FOOTPRINTS.signpost,
  fenceBay: PROP_FOOTPRINTS.fenceBay,
  // Scaled by the prop's own metric size in `buildPlan.ts`, plus the parapet's
  // oversail, which is the widest a block gets.
  building: { shape: 'box', halfX: 0.5, halfZ: 0.5 },
  tyreStack: PROP_FOOTPRINTS.tyreStack,
  // The honest plan extent, which is the whole span. It has no footprint and
  // still has to be in this table truthfully: this is the question a building
  // asks, and a clubhouse should not be planted under the gantry.
  gantrySpan: {
    shape: 'box',
    halfX: PROP_SIZES.gantrySpan.halfSpan,
    halfZ: PROP_SIZES.gantrySpan.bannerThickness / 2,
  },
});

/** Vertical mesh envelope at `scale: 1`, relative to the placed prop origin. */
export const PROP_VERTICAL_SPANS: Readonly<Record<PropKind, {
  readonly bottom: number;
  readonly top: number;
}>> = deepFreeze({
  broadleafTree: {
    bottom: 0,
    top: Math.max(
      PROP_SIZES.broadleafTree.trunkHeight,
      PROP_SIZES.broadleafTree.crownCentre + PROP_SIZES.broadleafTree.crownHeight / 2,
      PROP_SIZES.broadleafTree.upperCentre + PROP_SIZES.broadleafTree.upperRadius * 0.85,
    ),
  },
  treeCanopy: {
    bottom: PROP_SIZES.broadleafTree.crownCentre - PROP_SIZES.broadleafTree.crownHeight / 2,
    top: Math.max(
      PROP_SIZES.broadleafTree.crownCentre + PROP_SIZES.broadleafTree.crownHeight / 2,
      PROP_SIZES.broadleafTree.upperCentre + PROP_SIZES.broadleafTree.upperRadius * 0.85,
    ),
  },
  conifer: {
    bottom: Math.min(...PROP_SIZES.conifer.tiers.map((tier) => tier.base)),
    top: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.base + tier.height)),
  },
  shrub: {
    bottom: PROP_SIZES.shrub.centre - PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleY,
    top: PROP_SIZES.shrub.centre + PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleY,
  },
  lampPost: { bottom: 0, top: PROP_SIZES.lampPost.postHeight },
  bench: { bottom: 0, top: PROP_SIZES.bench.seatHeight + PROP_SIZES.bench.backHeight },
  litterBin: { bottom: 0, top: PROP_SIZES.litterBin.height + PROP_SIZES.litterBin.rimHeight },
  bollardCap: {
    bottom: -PROP_SIZES.bollardCap.radius * PROP_SIZES.bollardCap.scaleY,
    top: PROP_SIZES.bollardCap.radius * PROP_SIZES.bollardCap.scaleY,
  },
  signpost: { bottom: 0, top: PROP_SIZES.signpost.postHeight },
  fenceBay: { bottom: 0, top: PROP_SIZES.fenceBay.postHeight },
  // Buildings supply their metric height on the placed prop. The unit span is
  // still useful to keep this table exhaustive.
  building: { bottom: 0, top: 1 },
  tyreStack: {
    bottom: 0,
    top: PROP_SIZES.tyreStack.tyres * PROP_SIZES.tyreStack.tyreHeight,
  },
  // Measured from the prop's own origin, which the level lifts to the top of
  // the legs. The truss stands on that; nothing hangs below it.
  gantrySpan: { bottom: 0, top: PROP_SIZES.gantrySpan.trussHeight },
});

/**
 * The solid part of each kind — what the wheel actually meets (M8.6).
 *
 * **This is the table that stopped props being scenery.** Until now every kind
 * here was render-only by contract, and the owner rode straight through a
 * skyline block on the grass: "I went right through the buildings as if they
 * were a projection". A world whose largest objects are not there is not a
 * world, so the solid kinds now emit a `BoxCollider` in `level/buildPlan.ts`
 * and reach `simulation/` like any kerb or wall.
 *
 * **`null` means soft, and soft is a deliberate answer rather than an
 * omission.** Canopies and bollard finials are authored *on* geometry that is
 * already solid, so a collider of their own would be a second copy of one.
 * Shrubs were originally soft under the arcade-first reading, but shared
 * playtest feedback found that riding straight through the whole visible bush
 * broke the world's physical read. Their dense lobe now contributes a compact,
 * non-occluding solid while the faceted corners remain forgiving.
 *
 * ## Why these are not simply the footprints
 *
 * `PROP_FOOTPRINTS` answers "could a rider be riding here" and `PROP_SPREADS`
 * answers "how wide is this at any height". Neither answers "what stops a
 * wheel", and a conifer is the case that proves it: it carries foliage to the
 * ground at a 2.2 m radius, so its spread is a 4.4 m disc — and a 4.4 m solid
 * disc on a verge is a wall of branches that ends a run. What a rider actually
 * meets is the trunk and the dense inner metre around it. Authored, with the
 * reason beside each one, rather than derived from a table that means
 * something else.
 *
 * Sizes are metres at `scale: 1`, and `building` is scaled by its own metric
 * `size` in the plan builder exactly as its mesh is.
 */
export interface PropSolid {
  /** Half extents in local XZ, metres. A round kind becomes its inscribed box. */
  readonly halfX: number;
  readonly halfZ: number;
  /** Top of the solid part above the prop's base, metres. */
  readonly height: number;
  /**
   * Surface of the box's top face, which is what a rider who lands on it
   * stands on. Only the bench's is genuinely reachable; the rest are metres
   * over the rider's head and the value is there because a collider has to
   * carry one, not because anybody will ever ride it.
   */
  readonly surface: SurfaceId;
  /**
   * Does a chase camera behind this lose sight of the rider?
   *
   * **Only a building does**, and the distinction is not pedantry. The camera
   * pulls in on any box its obstruction ray meets, hard (0.05 s) and restores
   * slowly (0.55 s); a lamp post is narrower than the rider and passes the ray
   * in a few frames, so obeying it would duck the camera dozens of times down
   * an avenue for an occlusion the player never had. A block genuinely hides
   * the rider and genuinely should.
   */
  readonly occludes: boolean;
  /**
   * Foliage rather than structure (M15). A soft box never enters
   * `plan.solids` — `level/buildPlan.ts` routes it to `plan.softBodies`, so
   * the wheel drags through it instead of crashing against it. The forum's
   * "a collision with a bush now reacts like a boulder" is the defect this
   * flag exists to end.
   */
  readonly soft?: true;
}

/**
 * A round prop's collider half-extent as a fraction of its radius.
 *
 * A box that circumscribes the circle is 41% too wide at the corners, which on
 * a 0.3 m trunk is a rider stopped by air. Inscribing it instead is 21% too
 * narrow at the flats, which is a rider clipping bark. This sits between them,
 * so the square's area matches the circle's — the honest compromise for a
 * shape the collider format cannot express.
 */
const ROUND_TO_BOX = 0.886;

export const PROP_SOLIDS: Readonly<Record<PropKind, PropSolid | null>> = deepFreeze({
  // The trunk, and only the trunk. A crown four metres over the rider's head
  // stops nothing, and giving it a collider would put a 2.45 m disc of solid
  // air across every verge the street trees stand on.
  broadleafTree: {
    halfX: PROP_SIZES.broadleafTree.trunkRadiusBase * ROUND_TO_BOX,
    halfZ: PROP_SIZES.broadleafTree.trunkRadiusBase * ROUND_TO_BOX,
    height: PROP_SIZES.broadleafTree.trunkHeight,
    surface: 'wood',
    occludes: false,
  },
  // Authored on a trunk the level already carries as a collider.
  treeCanopy: null,
  // The dense inner core, not the 2.2 m skirt. See the note above. The height
  // is derived from the tier stack rather than restated, so lowering the stack
  // cannot leave a collider standing above the mesh that justifies it.
  conifer: {
    halfX: 0.55,
    halfZ: 0.55,
    height: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.base + tier.height)),
    surface: 'wood',
    occludes: false,
  },
  // The dense foliage body, not a box around every outer tip. ROUND_TO_BOX
  // keeps the collider area honest to the rendered ellipse while leaving its
  // faceted corners forgiving. The mesh sinks slightly below its origin, so
  // only the visible height above the planted base is solid.
  shrub: {
    halfX: PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleX * ROUND_TO_BOX,
    halfZ: PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleZ * ROUND_TO_BOX,
    height: PROP_VERTICAL_SPANS.shrub.top,
    surface: 'grass',
    occludes: false,
    soft: true,
  },
  lampPost: {
    halfX: PROP_SIZES.lampPost.postRadius * ROUND_TO_BOX,
    halfZ: PROP_SIZES.lampPost.postRadius * ROUND_TO_BOX,
    height: PROP_SIZES.lampPost.postHeight,
    surface: 'pavement',
    occludes: false,
  },
  // The whole bench, seat back included: it is 0.86 m of solid furniture and a
  // rider meets all of it.
  bench: {
    halfX: PROP_SIZES.bench.length / 2,
    halfZ: PROP_SIZES.bench.seatDepth / 2,
    height: PROP_SIZES.bench.seatHeight + PROP_SIZES.bench.backHeight,
    surface: 'wood',
    occludes: false,
  },
  litterBin: {
    halfX: PROP_SIZES.litterBin.radiusTop * ROUND_TO_BOX,
    halfZ: PROP_SIZES.litterBin.radiusTop * ROUND_TO_BOX,
    height: PROP_SIZES.litterBin.height + PROP_SIZES.litterBin.rimHeight,
    surface: 'pavement',
    occludes: false,
  },
  // Authored on a bollard, which is already a collider box.
  bollardCap: null,
  // The post. The fingers start at 1.68 m, which is over the rider's head and
  // nothing the wheel can reach.
  signpost: {
    halfX: PROP_SIZES.signpost.postRadius * ROUND_TO_BOX,
    halfZ: PROP_SIZES.signpost.postRadius * ROUND_TO_BOX,
    height: PROP_SIZES.signpost.postHeight,
    surface: 'pavement',
    occludes: false,
  },
  // One bay, running along its own local +Z exactly as the mesh does. A run of
  // bays becomes a run of colliders, which is a fence rather than one long box
  // that would cut the corners of a curved run.
  fenceBay: {
    halfX: PROP_SIZES.fenceBay.postWidth / 2,
    halfZ: PROP_SIZES.fenceBay.length / 2,
    height: PROP_SIZES.fenceBay.postHeight,
    surface: 'wood',
    occludes: false,
  },
  // Half-extents of the *unit* box. `buildPlan.ts` scales them by the block's
  // own metric size, the same way `render/props.ts` scales its mesh — the
  // parapet's oversail is deliberately not included, because a rider stopped
  // 45 cm short of a wall by an eave twenty metres above them is a bug.
  building: { halfX: 0.5, halfZ: 0.5, height: 1, surface: 'pavement', occludes: true },
  // A bundle of tyres is a bundle of tyres: solid, low, and narrower than the
  // rider, so it stops a wheel without ducking the chase camera. It stands
  // where nothing hides it — outside a barrier gate or in the paddock — so it
  // is one of the few things on the venue a rider can actually meet.
  tyreStack: {
    halfX: PROP_SIZES.tyreStack.radius * ROUND_TO_BOX,
    halfZ: PROP_SIZES.tyreStack.radius * ROUND_TO_BOX,
    height: PROP_SIZES.tyreStack.tyres * PROP_SIZES.tyreStack.tyreHeight,
    surface: 'pavement',
    occludes: false,
  },
  // **Null, and this is the M7 trap rather than a convenience.** The sampler
  // resolves a collider by its *top* face, so a box spanning the road six
  // metres up is ground six metres up: a rider passing under the gantry would
  // be standing on it. Its legs carry the solidity, as two authored blocks.
  gantrySpan: null,
});

/**
 * Clear ground the dressing leaves around a building, metres.
 *
 * Not zero: a tree whose canopy grazes a wall reads as a tree growing out of
 * it, and the wall is the thing that has to win because the tree can move.
 */
export const BUILDING_CLEARANCE = 0.6;

/**
 * **Buildings are allowed to overlap, and only being *buried* is refused.**
 *
 * Real city blocks abut, and two that share a corner read as one L-shaped
 * building — which is a building. A skyline whose members are forbidden to
 * touch reads as a row of separate towers rather than as a city, so the rule is
 * deliberately the narrowest one that catches the defect: a block whose
 * **centre** lies inside another block is one fused shape with a seam through
 * it, and one of the two goes.
 *
 * Stated as a flag rather than as a distance because a distance is the wrong
 * shape for the question — the first attempt used a fixed metre-and-a-half
 * overlap allowance, which culled twelve perfectly good abutting blocks off the
 * skyline to fix two fused ones. Whether a centre is inside is scale-free.
 */
export const REFUSE_BURIED_BUILDINGS = true;

/** Maximum depth of an authored building join, relative to its narrowest side. */
export const BUILDING_MAX_JOIN_FRACTION = 0.15;

/**
 * The facade — M7.5 stage 5b, from the owner's ride: "the buildings are missing
 * windows".
 *
 * **Horizontal glazing bands, and nothing else.** Vertical mullions cost
 * triangles and buy nothing at the distance a block is read from; what says
 * "building" from thirty metres, and still says it from three hundred, is
 * *storeys* — a repeating horizontal rhythm up the face. This is the same
 * argument `DESIGN.md` §7 makes about silhouette over surface detail, applied
 * one level down.
 *
 * **It costs no draw call at all.** The bands are strips in the same unit box
 * the instanced body already was, and the glazing tone rides the geometry's own
 * `color` attribute — which every part carries anyway, because `instanceColor`
 * does not reach the shader without it (`render/props.ts`). The building's own
 * tone still arrives on the instance colour and multiplies through, so a pale
 * block gets pale spandrels and a cool one cool ones.
 *
 * Two band counts rather than one, because the box is scaled per instance and a
 * fixed count would give a sixty-metre tower ten-metre storeys. A block picks
 * the geometry whose floor height lands nearest a real one.
 */
export const BUILDING_FACADE = deepFreeze({
  /** Bands on a low block, and on the setback tower that caps a tall one. */
  lowFloors: 4,
  /**
   * Bands on a building too short to wear `lowFloors` of them.
   *
   * **The rule `minFloorHeight` states was enforced in one place and not the
   * other.** `render/props.ts` suppresses a *rooftop setback box* whose bands
   * would come out under two metres, in as many words: "a short setback box is
   * a roof feature, not a miniature four-storey building". Nothing said the
   * same about a short *body*, so BelVar's paddock sheds — 3.4 to 5.0 m —
   * wore four bands of 0.85 to 1.25 m and read as striped office units rather
   * than as sheds. `render/props.test.ts` asserts every instance is in range
   * and built only the slice, so it never saw them.
   *
   * Two bands: a solid ground floor and one glazed strip above it, which is
   * what a workshop looks like. A building shorter than
   * `lowRiseFloors × minFloorHeight` still has no facade that fits it, and the
   * assertion is left to say so rather than being softened.
   */
  lowRiseFloors: 2,
  /**
   * Body height, metres, below which a block wears `lowRiseFloors`.
   *
   * `lowFloors × minFloorHeight` — the height at which the four-band facade
   * stops producing storeys somebody could stand up in. Kept as a literal so
   * it reads at the call site; `props.test.ts` holds it to the derivation.
   */
  lowRiseHeight: 8,
  /** Bands on anything above `highRiseHeight`. */
  highFloors: 11,
  /** Body height, metres, at which a block switches to the taller pattern. */
  highRiseHeight: 26,
  /** A facade band outside this range reads as striping, not as a storey. */
  minFloorHeight: 2,
  maxFloorHeight: 7,
  /**
   * Fraction of each band that is glass rather than spandrel.
   *
   * Above about two thirds a facade reads as a greenhouse; below about a third
   * the band disappears at distance and the block is plain again.
   */
  glazing: 0.55,
  /**
   * Multiplier on the building's own tone for the glass, per channel.
   *
   * Darker and cooler: glazing seen from outside at midday is a dark, slightly
   * blue reflection of the sky, not a lit interior. It is a *multiplier* rather
   * than an albedo, so it cannot be authored past the palette — the darkest
   * building tone times this still sits above `DESIGN.md` §2's crush floor,
   * which `props.test.ts` asserts.
   */
  glassTint: { r: 0.42, g: 0.46, b: 0.58 },
  /**
   * The ground floor carries no glazing band.
   *
   * A blockout building meets the ground in a single hard line, and a window
   * strip running into the grass is the tell. One solid band at the bottom
   * reads as a plinth and costs two triangles a side.
   */
  solidGroundFloor: true,
});

/**
 * How the kit is expected to spend the budget.
 *
 * `DESIGN.md` §8 caps the whole frame at 150 draw calls and 400k triangles, of
 * which M7 already spends 74 and about 144k. These are the props' own ceilings,
 * asserted in `render/props.test.ts` against the real built scene rather than
 * estimated, so a prop added later with a thousand triangles fails headlessly.
 */
export const PROP_BUDGET = deepFreeze({
  /**
   * Draw calls added to the frame: one per InstancedMesh, plus one more for
   * each that casts, because an instanced mesh spans the world and the shadow
   * camera never culls one. M7.5 measures 25 against M7's 74 for everything
   * else, so the frame stands at 99 of the 150 the budget allows.
   */
  maxDrawCalls: 32,
  /** Triangles as `renderer.info` counts them — the shadow pass included. */
  maxTriangles: 90_000,
  /**
   * Colour-pass triangles per prop, averaged.
   *
   * A prop is read at the chase camera's six metres, at up to 15 m/s, and
   * `DESIGN.md` §7 is explicit that silhouette carries recognition there and
   * surface detail does not. Thirty-six was what the kit averaged before the
   * facades; **it averages 49 with them, and the ceiling moved from 50 to 60
   * deliberately rather than being squeezed under.**
   *
   * The honest reading is that this number stopped being the interesting one.
   * Averaging a 156-triangle tower against a 12-triangle bollard finial says
   * little about either, and the claim it was proxying for — that these are
   * blockout props rather than models — is now carried by `maxTriangles`
   * above, which the whole kit meets at about three quarters. This stays as a
   * backstop against a kind arriving with a thousand triangles in it.
   */
  maxTrianglesPerProp: 60,
});
