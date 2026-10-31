/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Foundry Yard — the skatepark, 1.4.0 (`docs/PLANS.md` §51).
 *
 * A fenced concrete yard of 79.5 × 71.75 m inside one 256 m render tile: an
 * in-ground mini ramp in the north-west, the stair block with its drop ledge,
 * five-stair, banks and euro gap in the north, a 52 m quarter-pipe wall down
 * the east side, a snake run with a berm and three rollers in the south that
 * empties into the mini bowl in the south-west, and the flat-ground pieces —
 * two kickers, two ledges, two manual pads, a hip pyramid and a planter line —
 * in the plaza between. No lap and no finish: Trick Run, free ride and the
 * couch only ("there's no racing on a skate park", §51.1).
 *
 * **How it is made.** `buildLevelPlan` builds the plan around one short
 * corridor on the start lane, which is what gives the world its spawn socket,
 * its props and their derived solids; then the producer writes the field
 * rectangle directly (§51.4.1) — origin (80, 88), 0.25 m, x 80–176 and
 * z 88–176 — and appends the blocks, the start line and the zones, as the
 * Wharf appends its boxes (`quayQuarter.ts`). The floor *is* the `pavement`
 * surround at height 0 and is written as exactly 0, so the renderer skips it
 * (`terrainCoverage.ts`); only the 8 m lattice squares a feature shapes are
 * drawn, and every shaped footprint keeps its nonzero samples off the lattice
 * lines it must not cross (a sample marks the patch a quarter metre beyond
 * it, so the high side of a square keeps half a metre).
 *
 * **One wall everywhere** (D5): a circular arc of R 2.0 behind a 0.6 m
 * clothoid foot, capped at 75°, 1.49 m tall and 2.23 m in plan — the mini's
 * three walls, the bowl and the east quarter-pipe. Copings are drawn only
 * (D6); the heightfield's lip is the riding edge and `copings` carries the
 * pipe for the renderer. Unions of two shaped profiles never dent a shared
 * floor or deck: corner walls multiply their depth fractions, and the
 * soft seams fade out where both sides meet the same plateau.
 *
 * No `three` here (invariant 1): the plan is plain data.
 */
import { buildLevelPlanSteps } from './buildPlan.ts';
import type {
  BoxCollider,
  Checkpoint,
  CopingRun,
  CopingScenery,
  Heightfield,
  LevelPlan,
  WearPatch,
  YardFaceMural,
  YardFloor,
  YardMast,
  YardMural,
  YardPlate,
  YardWear,
} from './plan.ts';
import type { PlacedProp, SegmentSpec } from './segments.ts';
import type { TrickZone } from './trickZones.ts';
import { PROP_SIZES, type BuildingLook } from '../data/props.ts';
import type { MaterialId } from '../data/surfaces.ts';
import type { Vec3 } from '../simulation/world.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';

/** The record key. Bump the revision only for a physical change: it resets every best. */
export const SKATEPARK_PLAN_ID = 'foundry-yard-r1';

/** Metres between samples (D4): the lip reads 66° at 0.25 m and 61° at 0.5. */
export const SKATEPARK_SPACING = 0.25;

/** The heightfield rectangle, written directly rather than derived from corridor bounds. */
export const SKATEPARK_FIELD = Object.freeze({ originX: 80, originZ: 88, maxX: 176, maxZ: 176 });

/**
 * The plinth's inner faces — the riding area. East is 167.50 rather than
 * §51.4.2's 167.75: the quarter-pipe deck's last nonzero sample may not sit a
 * quarter metre from the x 168 lattice line, or it pulls the next column of
 * patches in, so the deck ends at 167.50 and the plinth covers its last cell.
 */
export const SKATEPARK_RIDING = Object.freeze({ minX: 88, maxX: 167.5, minZ: 96.25, maxZ: 168 });

/** Free ride and couch free ride start here, facing the start lane (+X). */
export const SKATEPARK_SPAWN = Object.freeze({
  position: Object.freeze({ x: 100, y: 0, z: 124 }),
  headingY: Math.PI / 2,
});

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const TAN20 = Math.tan(20 * DEG);
const TAN25 = Math.tan(25 * DEG);
const TAN30 = Math.tan(30 * DEG);

/** Below this a sample is the floor, and is written as exactly the floor. */
const FLOOR_SNAP = 1e-9;

/**
 * A transition: flat, a clothoid foot easing curvature from 0 to 1/R over
 * `ease` metres of arc, then the arc to `capDeg`. `rise(u)` is the height `u`
 * metres in plan from the foot; `run` is the plan distance foot to lip. The
 * height is scaled onto `height` exactly (it moves the top angle by under a
 * hundredth of a degree), so decks and copings sit on round numbers.
 */
interface WallProfile {
  readonly run: number;
  readonly height: number;
  rise(u: number): number;
}

function wallProfile(radius: number, capDeg: number, ease: number, height: number): WallProfile {
  const cap = capDeg * DEG;
  const ds = 0.0005;
  const us: number[] = [0];
  const ys: number[] = [0];
  let s = 0;
  let phi = 0;
  let u = 0;
  let y = 0;
  while (phi < cap) {
    const curvature = s < ease ? s / ease / radius : 1 / radius;
    phi = Math.min(cap, phi + curvature * ds);
    u += Math.cos(phi) * ds;
    y += Math.sin(phi) * ds;
    s += ds;
    us.push(u);
    ys.push(y);
  }
  const scale = height / y;
  const plan = Float64Array.from(us);
  const rise = Float64Array.from(ys, (value) => value * scale);
  const run = u;
  return {
    run,
    height,
    rise(q: number): number {
      if (q <= 0) return 0;
      if (q >= run) return height;
      let lo = 0;
      let hi = plan.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (plan[mid] <= q) lo = mid;
        else hi = mid;
      }
      const t = (q - plan[lo]) / (plan[hi] - plan[lo]);
      return rise[lo] + (rise[hi] - rise[lo]) * t;
    },
  };
}

/** T75 (D5): every steep wall in the yard. */
export const SKATEPARK_WALL = wallProfile(2.0, 75, 0.6, 1.49);
/** The berm's outer wall: the same arc and foot to 60°, one metre tall. */
const BERM_WALL = wallProfile(2.0, 60, 0.6, 1.0);

/**
 * 0 → 1 over `length` with quadratic eases of `ease` at both ends and a
 * straight middle: C1, and the slope of the middle is `1 / (length − ease)`.
 */
function easedRamp(u: number, length: number, ease: number): number {
  if (u <= 0) return 0;
  if (u >= length) return 1;
  const slope = 1 / (length - ease);
  if (u < ease) return (slope * u * u) / (2 * ease);
  if (u > length - ease) {
    const rest = length - u;
    return 1 - (slope * rest * rest) / (2 * ease);
  }
  return slope * (u - ease / 2);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge: number, value: number): number {
  const t = clamp01(value / edge);
  return t * t * (3 - 2 * t);
}

/** Polynomial soft minimum: exact beyond `k` apart, rounded within it. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** A bank's toe: the plane rounded onto the floor, exactly 0 a `k` below it. */
function toe(value: number): number {
  const k = 0.3;
  const h = Math.max(k - Math.abs(value), 0) / k;
  return Math.max(value, 0) + h * h * k * 0.25;
}

/**
 * A union seam between two shaped profiles that share a floor `lo` and a deck
 * `hi` (§51.5.1, k 0.3). A plain polynomial soft minimum lowers wherever the
 * two are within `k` — which is everywhere both sit on the same deck or floor,
 * a 0.075 m dent the size of the junction — so the rounding fades out within
 * `k` of either plateau and only the ridge between the two is rounded.
 */
function seamMin(a: number, b: number, k: number, lo: number, hi: number): number {
  const lower = Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  if (h === 0) return lower;
  const fade = clamp01((hi - Math.max(a, b)) / k) * clamp01((lower - lo) / k);
  return lower - h * h * k * 0.25 * fade;
}

/** `seamMin` the other way up: a rounded valley between two profiles. */
function seamMax(a: number, b: number, k: number, lo: number, hi: number): number {
  const upper = Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  if (h === 0) return upper;
  const fade = clamp01((hi - upper) / k) * clamp01((Math.min(a, b) - lo) / k);
  return upper + h * h * k * 0.25 * fade;
}

/** How far into a T75 pit `u` metres in from the lip is, 0 at the lip and 1 on the floor. */
function depthFraction(u: number): number {
  if (u <= 0) return 0;
  if (u >= SKATEPARK_WALL.run) return 1;
  return 1 - SKATEPARK_WALL.rise(SKATEPARK_WALL.run - u) / SKATEPARK_WALL.height;
}

// ---------------------------------------------------------------------------
// The shaped ground (§51.5.2), one function per lattice cluster
// ---------------------------------------------------------------------------

/** QP-E: T75 face, coping x 162.50, deck 1.49 to the plinth, 30° end bank to the south. */
const QP_EAST = Object.freeze({ coping: 162.5, deckEnd: SKATEPARK_RIDING.maxX, north: 96.25,
  bankFrom: 148.5, bankTo: 151.5, bankEase: 0.42 });

function qpEast(x: number, z: number): number {
  const foot = QP_EAST.coping - SKATEPARK_WALL.run;
  if (x <= foot || x > QP_EAST.deckEnd || z < QP_EAST.north || z >= QP_EAST.bankTo) return 0;
  const across = x < QP_EAST.coping ? SKATEPARK_WALL.rise(x - foot) : SKATEPARK_WALL.height;
  // The end bank multiplies the whole section, so where it meets the face the
  // two round into each other instead of creasing.
  const along = z <= QP_EAST.bankFrom ? 1
    : 1 - easedRamp(z - QP_EAST.bankFrom, QP_EAST.bankTo - QP_EAST.bankFrom, QP_EAST.bankEase);
  return across * along;
}

/**
 * The in-ground mini: T75 walls W/E/N, a 30° end bank to the south whose
 * top is z 111.75. The bank runs 2.8 m (floor from z 108.95) rather than
 * §51.5.2's 2.55, which would need 30.3° before any ease at its ends.
 *
 * Widened to 11.5 m lip to lip (§51.5.10, G-M): the plaza delivers 23.8 m/s
 * to the east coping on a 65 m diagonal, past the 18 m/s trigger. The
 * copings moved to x 92.0 and 103.5 — the east one is the last grid node
 * half a metre inside the x 104 lattice line, so no patch is added — and
 * the west deck is 4.0 m.
 */
const MINI = Object.freeze({ west: 92, east: 103.5, north: 100.25, south: 111.75, bankRun: 2.8, bankEase: 0.3 });

function mini(x: number, z: number): number {
  if (x <= MINI.west || x >= MINI.east || z <= MINI.north || z >= MINI.south) return 0;
  // Corners are the product of the walls' depth fractions: rounded, and the
  // floor and the deck stay exactly where each wall alone puts them.
  return -SKATEPARK_WALL.height * depthFraction(x - MINI.west) * depthFraction(MINI.east - x)
    * depthFraction(z - MINI.north) * easedRamp(MINI.south - z, MINI.bankRun, MINI.bankEase);
}

/** The bowl: coping x 96.5–111.5, z 152.5–164, plan corners R 3.5, a 25° roll-out north. */
const BOWL = Object.freeze({ minX: 96.5, maxX: 111.5, minZ: 152.5, maxZ: 164, corner: 3.5,
  rollFrom: 101, rollTo: 106, rollRun: 3.4, rollEase: 0.2, rollSideRun: 3.2, rollSideEase: 0.6 });

function bowl(x: number, z: number): number {
  const halfX = (BOWL.maxX - BOWL.minX) / 2;
  const halfZ = (BOWL.maxZ - BOWL.minZ) / 2;
  const qx = Math.abs(x - (BOWL.minX + halfX)) - (halfX - BOWL.corner);
  const qz = Math.abs(z - (BOWL.minZ + halfZ)) - (halfZ - BOWL.corner);
  const distance = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - BOWL.corner;
  if (distance >= 0) return 0;
  const wall = SKATEPARK_WALL.rise(SKATEPARK_WALL.run + distance) - SKATEPARK_WALL.height;
  // The roll-out is a 25° bank cut through the north wall. Its sides fall
  // away at 30° at most (an eased run of 3.2 m, 0.6 m eases): the 45° kink
  // they had threw a line that crossed a side at 16–25 m/s out over the wall
  // (G-C); eased, the wheel rolls down the side and the wall's come-back
  // takes it.
  const side = Math.max(0, BOWL.rollFrom - x, x - BOWL.rollTo);
  const rollout = -SKATEPARK_WALL.height * (easedRamp(z - BOWL.minZ, BOWL.rollRun, BOWL.rollEase)
    + easedRamp(side, BOWL.rollSideRun, BOWL.rollSideEase));
  return seamMax(wall, rollout, 0.3, -SKATEPARK_WALL.height, 0);
}

/**
 * The snake: roll-in south at x 148, the berm about (142, 152.25) turning to
 * −X, the straight with three rollers at z 158.25, and the mouth deepening to
 * the bowl's floor. Channel −D(1 − (|t|/hw)^2.5), D 1.0, lip to lip 6.5 m.
 * The roll-in eases its ends over 0.25 m, so its middle is 16° rather than a
 * straight 15° with two kinks.
 */
const SNAKE = Object.freeze({ halfWidth: 3.25, depth: 1.0, rollInX: 148, rollInFrom: 146, rollInRun: 3.75,
  bermX: 142, bermZ: 152.25, bermRadius: 6, bermBlend: 20 * DEG, straightZ: 158.25, straightWest: 106,
  mouthFrom: 113.5, mouthRun: 1.83, rollerCrests: [132, 125, 118] as readonly number[], rollerHeight: 0.4,
  rollerLength: 5 });

function channel(t: number, depth: number): number {
  const a = Math.abs(t) / SNAKE.halfWidth;
  return a >= 1 ? 0 : -depth * (1 - a ** 2.5);
}

/** The berm's outer half: flat floor, then the R 2 wall to 60° and one metre. */
function bermOuter(t: number): number {
  const foot = SNAKE.halfWidth - BERM_WALL.run;
  return t <= foot ? -SNAKE.depth : -SNAKE.depth + BERM_WALL.rise(t - foot);
}

function snake(x: number, z: number): number {
  if (z >= SNAKE.rollInFrom && z < SNAKE.bermZ && Math.abs(x - SNAKE.rollInX) < SNAKE.halfWidth) {
    return channel(x - SNAKE.rollInX, SNAKE.depth * easedRamp(z - SNAKE.rollInFrom, SNAKE.rollInRun, 0.25));
  }
  if (x >= SNAKE.bermX && z >= SNAKE.bermZ) {
    const t = Math.hypot(x - SNAKE.bermX, z - SNAKE.bermZ) - SNAKE.bermRadius;
    if (Math.abs(t) >= SNAKE.halfWidth) return 0;
    const inner = channel(t, SNAKE.depth);
    if (t <= 0) return inner;
    // The steep outer wall blends in over the first and last 20° of the turn.
    const phi = Math.atan2(z - SNAKE.bermZ, x - SNAKE.bermX);
    const weight = smoothstep(SNAKE.bermBlend, phi) * smoothstep(SNAKE.bermBlend, Math.PI / 2 - phi);
    return inner + (bermOuter(t) - inner) * weight;
  }
  if (x < SNAKE.bermX && x >= SNAKE.straightWest && Math.abs(z - SNAKE.straightZ) < SNAKE.halfWidth) {
    let depth = SNAKE.depth + (SKATEPARK_WALL.height - SNAKE.depth)
      * easedRamp(SNAKE.mouthFrom - x, SNAKE.mouthRun, 0.2);
    // Rollers are amplitude times the channel's floor weight, so the lips stay at 0.
    for (const crest of SNAKE.rollerCrests) {
      const u = x - crest;
      if (Math.abs(u) < SNAKE.rollerLength / 2) {
        depth -= SNAKE.rollerHeight * (0.5 + 0.5 * Math.cos((2 * Math.PI * u) / SNAKE.rollerLength));
      }
    }
    return channel(z - SNAKE.straightZ, depth);
  }
  return 0;
}

/** The bowl and the snake share the mouth's patches; the channel cuts the bowl's east wall. */
function bowlAndSnake(x: number, z: number): number {
  return seamMin(bowl(x, z), snake(x, z), 0.3, -SKATEPARK_WALL.height, 0);
}

/**
 * The stair block's banks and the euro table. The deck block is 0.90; every
 * bank meets its edge at 0.88 (D13), so the step onto the block is 0.02 m,
 * under the 0.04 m kerb threshold. Under the deck the field is the floor.
 */
const STAIR = Object.freeze({ deckWest: 117, deckEast: 127, deckSouth: 108.5, bankTop: 0.88, stairEast: 124,
  stairFoot: 109.9, euroSouth: 102.75 });
const TABLE = Object.freeze({ nearFrom: 128.5, nearRun: 0.9, topTo: 132, farRun: 0.45 / TAN20 + 0.15,
  north: 96.25, southFrom: 102.5, southRun: 0.45 / TAN30 + 0.15, height: 0.45, ease: 0.15 });

function bankWest(x: number, z: number): number {
  if (x > STAIR.deckWest || z < 96.25 || z > STAIR.deckSouth) return 0;
  return toe(STAIR.bankTop - (STAIR.deckWest - x) * TAN25);
}

function deckBanks(x: number, z: number): number {
  if (x < STAIR.deckEast && z < STAIR.deckSouth) return 0;
  const south = STAIR.bankTop - (z - STAIR.deckSouth) * TAN25;
  if (x < STAIR.stairEast) {
    // Past the stairs' foot, bank-S's open west side tapers at 30°.
    if (z < STAIR.stairFoot) return 0;
    return toe(south - (STAIR.stairEast - x) * TAN30);
  }
  // Bank-E′'s north end tapers into the euro pit at 30°, where the table's
  // own south taper meets it.
  const east = STAIR.bankTop - (x - STAIR.deckEast) * TAN25 - Math.max(0, STAIR.euroSouth - z) * TAN30;
  // H1 is where the two banks cross: a hip, rounded.
  return toe(smin(south, east, 0.3));
}

function euroTable(x: number, z: number): number {
  if (x <= TABLE.nearFrom || x >= TABLE.topTo + TABLE.farRun || z < TABLE.north
    || z >= TABLE.southFrom + TABLE.southRun) return 0;
  const across = x < TABLE.nearFrom + TABLE.nearRun ? easedRamp(x - TABLE.nearFrom, TABLE.nearRun, TABLE.ease)
    : x <= TABLE.topTo ? 1 : 1 - easedRamp(x - TABLE.topTo, TABLE.farRun, TABLE.ease);
  const along = z <= TABLE.southFrom ? 1 : 1 - easedRamp(z - TABLE.southFrom, TABLE.southRun, TABLE.ease);
  return TABLE.height * across * along;
}

function stairBlock(x: number, z: number): number {
  return Math.max(bankWest(x, z), seamMax(euroTable(x, z), deckBanks(x, z), 0.3, 0, STAIR.bankTop));
}

/** A kicker: quadratic wedge to 0.30 m at 20°, the lip block, a back bank; 30° side tapers. */
interface Kicker {
  readonly foot: number;
  readonly minZ: number;
  readonly maxZ: number;
}
export const SKATEPARK_KICKERS: Readonly<Record<'k2' | 'k1', Kicker>> = Object.freeze({
  // K2, the opener: widened to 6.4 m so the couch grid's two columns meet it side by side (D12).
  k2: Object.freeze({ foot: 124.5, minZ: 120.8, maxZ: 127.2 }),
  k1: Object.freeze({ foot: 128.5, minZ: 136.85, maxZ: 140.35 }),
});
const KICK = Object.freeze({ rise: 1.65, height: 0.3, lip: 0.3, back: 0.2, backRun: 0.75, taper: 0.3 / TAN30 });

function kicker(k: Kicker, x: number, z: number): number {
  const u = x - k.foot;
  const lo = k.minZ - KICK.taper;
  const hi = k.maxZ + KICK.taper;
  if (u <= 0 || u >= KICK.rise + KICK.lip + KICK.backRun || z <= lo || z >= hi) return 0;
  const profile = u < KICK.rise ? KICK.height * (u / KICK.rise) ** 2
    : u <= KICK.rise + KICK.lip ? KICK.height
      : KICK.back * (1 - easedRamp(u - KICK.rise - KICK.lip, KICK.backRun, 0.15));
  return Math.min(profile, Math.min(z - lo, hi - z) * TAN30);
}

/** The hip pyramid: 7 × 7 m, a 3.5 m top at 0.60, faces 25° at most, ridges rounded k 0.2. */
const PYRAMID = Object.freeze({ minX: 112.5, maxX: 119.5, minZ: 136.5, maxZ: 143.5, top: 0.6, run: 1.75, ease: 0.46 });

function pyramid(x: number, z: number): number {
  if (x <= PYRAMID.minX || x >= PYRAMID.maxX || z <= PYRAMID.minZ || z >= PYRAMID.maxZ) return 0;
  const face = (u: number): number => PYRAMID.top * easedRamp(u, PYRAMID.run, PYRAMID.ease);
  const across = seamMin(face(x - PYRAMID.minX), face(PYRAMID.maxX - x), 0.2, 0, PYRAMID.top);
  const along = seamMin(face(z - PYRAMID.minZ), face(PYRAMID.maxZ - z), 0.2, 0, PYRAMID.top);
  return seamMin(across, along, 0.2, 0, PYRAMID.top);
}

/** A shaped cluster and the lattice squares it may touch (x/8, z/8, inclusive). */
interface Cluster {
  readonly id: string;
  readonly squares: readonly [number, number, number, number];
  height(x: number, z: number): number;
}

/**
 * §51.6.1's lattice squares. The snake's two square rows south of z 152 and
 * the bowl's share column 13. Thirty-five squares in all; §51.6.1 counts 36
 * because its snake row lists (17, 18), which no part of the channel reaches.
 */
export const SKATEPARK_CLUSTERS: readonly Cluster[] = Object.freeze([
  { id: 'qp-east', squares: [20, 20, 12, 18], height: qpEast },
  { id: 'mini', squares: [11, 12, 12, 13], height: mini },
  { id: 'bowl-snake', squares: [12, 18, 18, 20], height: bowlAndSnake },
  { id: 'stair-block', squares: [14, 16, 12, 13], height: stairBlock },
  { id: 'kicker-k2', squares: [15, 15, 15, 15], height: (x: number, z: number) => kicker(SKATEPARK_KICKERS.k2, x, z) },
  { id: 'kicker-k1', squares: [16, 16, 17, 17], height: (x: number, z: number) => kicker(SKATEPARK_KICKERS.k1, x, z) },
  { id: 'hip-pyramid', squares: [14, 14, 17, 17], height: pyramid },
]);

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function box(
  x0: number, x1: number, z0: number, z1: number, top: number,
  appearance: MaterialId, bottom = 0,
): BoxCollider {
  return {
    centre: { x: (x0 + x1) / 2, y: (top + bottom) / 2, z: (z0 + z1) / 2 },
    halfExtents: { x: (x1 - x0) / 2, y: (top - bottom) / 2, z: (z1 - z0) / 2 },
    rotationY: 0,
    surface: 'pavement',
    appearance,
  };
}

/** A block the rider rides, and whether its top is wide enough to restart on. */
interface RidingBlock {
  readonly collider: BoxCollider;
  /** Its floor cells are flagged (`Heightfield.transition`): too narrow to recover onto. */
  readonly narrow: boolean;
}

function riding(collider: BoxCollider, narrow: boolean): RidingBlock {
  return { collider, narrow };
}

const RISER = 0.18;
const TREAD = 0.35;
/** The euro gap's pit floor, between the take-off edge and the table's near face. */
const EURO_PIT = Object.freeze({ minX: 127, maxX: 128.5, minZ: 96.25, maxZ: 102.75 });

/**
 * Every block inside the plinth. The deck is 0.90 with five 0.18 risers down
 * its south edge (D13); the cheek closes bank-W's south side, which would
 * otherwise end in a lateral cliff beside D1 — a bank's concrete side wall,
 * flush with the deck. The planters are brick under a concrete cap.
 */
export const SKATEPARK_BLOCKS: readonly RidingBlock[] = Object.freeze([
  riding(box(117, 127, 96.25, 108.5, 0.9, 'concrete'), false),
  ...[0, 1, 2, 3].map((step) => riding(box(120, 124, 108.5 + step * TREAD, 108.5 + (step + 1) * TREAD,
    0.9 - (step + 1) * RISER, 'concrete'), true)),
  // A quarter metre past the deck's corner, over the one field cell the deck,
  // the cheek and bank-W's last row all touch.
  riding(box(114.4, 117.25, 108.5, 108.9, 0.9, 'concrete'), true),
  // The kicker lips are concrete (critic pass 1, A2/T3): 'metal' rendered
  // near-black from every camera; the steel is a render-only edge (`copings`).
  riding(box(126.15, 126.45, 120.8, 127.2, 0.3, 'concrete'), true),
  riding(box(130.15, 130.45, 136.85, 140.35, 0.3, 'concrete'), true),
  riding(box(144, 152, 101, 101.9, 0.45, 'concrete'), true),
  riding(box(104, 112, 118, 118.9, 0.4, 'concrete'), true),
  riding(box(140, 146, 116, 118.4, 0.3, 'concrete'), true),
  riding(box(102.3, 104.7, 136, 142, 0.3, 'concrete'), true),
  ...[132, 128.4, 124.8].flatMap((x0) => [
    riding(box(x0, x0 + 2.4, 164.8, 166, 0.39, 'brick'), true),
    riding(box(x0, x0 + 2.4, 164.8, 166, 0.45, 'concrete', 0.39), true),
  ]),
]);

/** A riding block's edge sits on the field 0.02 m under its top, as the deck's banks do. */
const BLOCK_SEAT = 0.02;

// ---------------------------------------------------------------------------
// Perimeter (§51.5.7, D9, D22)
// ---------------------------------------------------------------------------

const PLINTH_TOP = 1.0;
const GUARD_TOP = 2.4;
const BAY = PROP_SIZES.fenceBay.length;

/** A side of fence bays: `count` whole bays over `from → to`. */
function bayPitch(from: number, to: number): { readonly count: number; readonly pitch: number } {
  const count = Math.ceil((to - from) / BAY - 1e-9);
  return { count, pitch: (to - from) / count };
}

/** Snap a raised run outward onto whole bays, so no bay straddles two plinth heights. */
function snapRun(from: number, pitch: number, start: number, end: number): readonly [number, number] {
  return [from + Math.floor((start - from) / pitch + 1e-9) * pitch, from + Math.ceil((end - from) / pitch - 1e-9) * pitch];
}

interface PlinthRun {
  readonly from: number;
  readonly to: number;
  readonly top: number;
  readonly guard: number;
}

const NORTH_BAYS = bayPitch(SKATEPARK_RIDING.minX, SKATEPARK_RIDING.maxX);
const EAST_BAYS = bayPitch(SKATEPARK_RIDING.minZ, SKATEPARK_RIDING.maxZ);
const WEST_BAYS = EAST_BAYS;
const SOUTH_BAYS = NORTH_BAYS;
const QP_DECK_TOP = SKATEPARK_WALL.height;
const STAIR_DECK_TOP = 0.9;
/** North over the stair block's banks, deck and euro table (D22): deck + 1.0, guard deck + 2.0. */
const NORTH_STAIR = snapRun(SKATEPARK_RIDING.minX, NORTH_BAYS.pitch, 114, 133.5);
/**
 * North over the quarter-pipe's own north end. Not in §51.5.7, which raises
 * only the east side: the deck butts the north plinth too, and a 1.0 m plinth
 * there would stand 0.49 m under the deck it guards.
 */
const NORTH_QP = snapRun(SKATEPARK_RIDING.minX, NORTH_BAYS.pitch, QP_EAST.coping - SKATEPARK_WALL.run, SKATEPARK_RIDING.maxX);
/** East along the deck and its end bank. */
const EAST_QP = snapRun(SKATEPARK_RIDING.minZ, EAST_BAYS.pitch, SKATEPARK_RIDING.minZ, QP_EAST.bankTo);

const RAISED_STAIR = { top: STAIR_DECK_TOP + PLINTH_TOP, guard: STAIR_DECK_TOP + 2 };
const RAISED_QP = { top: QP_DECK_TOP + PLINTH_TOP, guard: QP_DECK_TOP + 2 };
const FLAT = { top: PLINTH_TOP, guard: GUARD_TOP };

export const SKATEPARK_PLINTH = Object.freeze({
  north: Object.freeze<PlinthRun[]>([
    { from: SKATEPARK_RIDING.minX, to: NORTH_STAIR[0], ...FLAT },
    { from: NORTH_STAIR[0], to: NORTH_STAIR[1], ...RAISED_STAIR },
    { from: NORTH_STAIR[1], to: NORTH_QP[0], ...FLAT },
    { from: NORTH_QP[0], to: SKATEPARK_RIDING.maxX, ...RAISED_QP },
  ]),
  // The east and west runs carry the corners: they span the north and south plinths' depth.
  east: Object.freeze<PlinthRun[]>([
    { from: SKATEPARK_RIDING.minZ - 0.5, to: EAST_QP[1], ...RAISED_QP },
    { from: EAST_QP[1], to: SKATEPARK_RIDING.maxZ + 0.5, ...FLAT },
  ]),
  south: Object.freeze<PlinthRun[]>([{ from: SKATEPARK_RIDING.minX, to: SKATEPARK_RIDING.maxX, ...FLAT }]),
  west: Object.freeze<PlinthRun[]>([{ from: SKATEPARK_RIDING.minZ - 0.5, to: SKATEPARK_RIDING.maxZ + 0.5, ...FLAT }]),
  /** Plinth thickness outward of the inner face, per side. */
  depth: Object.freeze({ north: 0.5, east: 1.0, south: 0.5, west: 0.5 }),
});

function perimeter(): BoxCollider[] {
  const { north, east, south, west, depth } = SKATEPARK_PLINTH;
  const r = SKATEPARK_RIDING;
  const out: BoxCollider[] = [];
  const both = (x0: number, x1: number, z0: number, z1: number, run: PlinthRun): void => {
    out.push(box(x0, x1, z0, z1, run.top, 'brick'));
  };
  const guards: BoxCollider[] = [];
  const guard = (x0: number, x1: number, z0: number, z1: number, run: PlinthRun): void => {
    // The fence bays draw it; the box is what stops a wheel or a body, and it
    // never pulls the chase camera in, because the bays are see-through.
    guards.push({ ...box(x0, x1, z0, z1, run.guard, 'metal', run.top), drawn: false, occludes: false });
  };
  for (const run of west) { both(r.minX - depth.west, r.minX, run.from, run.to, run); guard(r.minX - depth.west, r.minX, run.from, run.to, run); }
  for (const run of east) { both(r.maxX, r.maxX + depth.east, run.from, run.to, run); guard(r.maxX, r.maxX + depth.east, run.from, run.to, run); }
  for (const run of north) { both(run.from, run.to, r.minZ - depth.north, r.minZ, run); guard(run.from, run.to, r.minZ - depth.north, r.minZ, run); }
  for (const run of south) { both(run.from, run.to, r.maxZ, r.maxZ + depth.south, run); guard(run.from, run.to, r.maxZ, r.maxZ + depth.south, run); }
  return [...out, ...guards];
}

/** The plinth top under a point along a side, for lifting a bay onto it. */
function runTop(runs: readonly PlinthRun[], at: number): number {
  for (const run of runs) if (at >= run.from && at < run.to) return run.top;
  return PLINTH_TOP;
}

// ---------------------------------------------------------------------------
// Props (§51.5.7): bays on the plinth, the backdrop, lamps, benches, bins
// ---------------------------------------------------------------------------

/** Foundry brick, a shade apart block to block; slate and tarred roofs. */
const BRICK_TONES = [0x8a4b3a, 0x7b4234, 0x94583f, 0x6e3c30, 0x85503f] as const;
const ROOF_TONES = [0x4d5868, 0x55493f] as const;
/** Buff and tan warehouse brick beside the red (critic pass 1, R7). */
const BUFF_TONES = [0xb39c7c, 0xa38f74] as const;
/** The perimeter fence's galvanised steel. */
const FENCE_STEEL = 0x8f9599;

function building(
  x0: number, x1: number, z0: number, z1: number, height: number, rotationY: number,
  tone: number, look?: BuildingLook, roofTone?: number,
): PlacedProp {
  // `size` is the block's own frame, so a quarter-turned block swaps its sides.
  const quarter = Math.abs(Math.sin(rotationY)) > 0.5;
  return {
    kind: 'building', x: (x0 + x1) / 2, z: (z0 + z1) / 2, lift: 0, rotationY, scale: 1,
    size: { x: quarter ? z1 - z0 : x1 - x0, y: height, z: quarter ? x1 - x0 : z1 - z0 },
    tone, ...(look === undefined ? {} : { look }), ...(roofTone === undefined ? {} : { roofTone }), onCollider: true,
  };
}

function dressing(): PlacedProp[] {
  const props: PlacedProp[] = [];
  const r = SKATEPARK_RIDING;
  const { depth } = SKATEPARK_PLINTH;
  // Galvanised, not garden timber (critic pass 1, R6): a render-only tone.
  const bay = (x: number, z: number, rotationY: number, lift: number): void => {
    props.push({ kind: 'fenceBay', x, z, rotationY, scale: 1, lift, onCollider: true, tone: FENCE_STEEL });
  };
  for (let i = 0; i < NORTH_BAYS.count; i += 1) {
    const x = r.minX + (i + 0.5) * NORTH_BAYS.pitch;
    bay(x, r.minZ - depth.north / 2, Math.PI / 2, runTop(SKATEPARK_PLINTH.north, x));
  }
  for (let i = 0; i < SOUTH_BAYS.count; i += 1) {
    const x = r.minX + (i + 0.5) * SOUTH_BAYS.pitch;
    bay(x, r.maxZ + depth.south / 2, Math.PI / 2, PLINTH_TOP);
  }
  for (let i = 0; i < WEST_BAYS.count; i += 1) {
    bay(r.minX - depth.west / 2, r.minZ + (i + 0.5) * WEST_BAYS.pitch, 0, PLINTH_TOP);
  }
  for (let i = 0; i < EAST_BAYS.count; i += 1) {
    const z = r.minZ + (i + 0.5) * EAST_BAYS.pitch;
    bay(r.maxX + depth.east / 2, z, 0, runTop(SKATEPARK_PLINTH.east, z));
  }

  // The backdrop: every inner face at least 8 m outside the plinth's outer
  // face (the chase camera's gap is 6.35), heights 7 or 13 m only, all inside
  // the one render tile. Fronts face the yard (a block's local +Z).
  const B = BRICK_TONES;
  const R = ROOF_TONES;
  const P = Math.PI;
  props.push(
    // Critic pass 1 (R7): two buff warehouses among the red. Critic pass 2
    // (R1/F7): no block wears the 'industrial' face any more — its window art
    // is an atlas page the yard's 8–40 m sightlines magnify into soft smears
    // — so every block but the foundry hall draws crisp punched windows,
    // buff brick included, the classic warehouse read.
    building(82, 104, 72, 87.5, 13, 0, B[0], undefined, R[0]),
    building(106, 128, 74, 87.5, 13, 0, BUFF_TONES[1], undefined, R[1]),
    building(130, 150, 72, 87.5, 13, 0, B[2], undefined, R[0]),
    // The foundry hall in the north-east, with its stacks.
    building(152, 182, 66, 87.5, 13, 0, B[3], 'chimneys', R[1]),
    building(176.5, 190, 92, 114, 7, -P / 2, B[4], undefined, R[0]),
    building(176.5, 192, 116, 142, 13, -P / 2, BUFF_TONES[0], undefined, R[1]),
    building(176.5, 190, 144, 166, 7, -P / 2, B[2], undefined, R[0]),
    building(84, 108, 176.5, 188, 7, P, B[1], undefined, R[1]),
    building(110, 134, 176.5, 190, 7, P, B[3], undefined, R[0]),
    building(136, 160, 176.5, 188, 7, P, B[4], undefined, R[1]),
    building(64, 79.5, 94, 128, 13, P / 2, B[2], undefined, R[0]),
    building(66, 79.5, 130, 164, 13, P / 2, B[0], undefined, R[1]),
  );

  // Eight lamps in the service lane, their arms (local +Z) over the yard.
  const put = (kind: PlacedProp['kind'], x: number, z: number, rotationY: number): void => {
    props.push({ kind, x, z, rotationY, scale: 1, lift: 0, onCollider: true });
  };
  for (const x of [100, 140]) {
    put('lampPost', x, 91.5, 0);
    put('lampPost', x, 172.5, P);
  }
  for (const z of [115, 150]) {
    put('lampPost', 83.5, z, P / 2);
    put('lampPost', 172.5, z, -P / 2);
  }
  // Four benches and two bins against the west plinth, facing the yard, clear
  // of every lane and zone (the breather runs north along x 92).
  const seat = r.minX + PROP_SIZES.bench.seatDepth / 2 + 0.12;
  for (const z of [130, 135.5, 141, 146.5]) put('bench', seat, z, P / 2);
  for (const z of [132.75, 143.75]) put('litterBin', r.minX + 0.45, z, P / 2);
  return props;
}

// ---------------------------------------------------------------------------
// Copings (C6), zones, the start line
// ---------------------------------------------------------------------------

const COPING_RADIUS = 0.03;
/** The pipe's top sits 0.01 m proud at most, and it overhangs the face by 0.04 m. */
const COPING_DROP = 0.01 - COPING_RADIUS;
const COPING_IN = 0.04 - COPING_RADIUS;
/** Pool coping and a poured lip: a pale band this wide on the deck side (critic pass 1, A3/A4). */
const POOL_COPING = 0.3;
/** A poured lip's band, narrowed to a bullnose (critic pass 2, R4/K5), and a poured crest's (K2). */
const POURED_LIP = 0.2;
const POURED_CREST = 0.25;
/** The pyramid's crest lines stand this far inside its flat top's edge (K2). */
const CREST_INSET = 0.05;
/** A kicker's lip stripe (K1): solid paint on the lip block's top. */
const KICK_CAP = Object.freeze({ width: 0.3, colour: 0xc8892f });

function arc(cx: number, cz: number, radius: number, fromDeg: number, toDeg: number, y: number): Vec3[] {
  const steps = Math.max(1, Math.ceil(Math.abs(toDeg - fromDeg) / 7.5));
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (fromDeg + ((toDeg - fromDeg) * i) / steps) * DEG;
    out.push({ x: cx + radius * Math.cos(a), y, z: cz + radius * Math.sin(a) });
  }
  return out;
}

function copings(): CopingScenery {
  const deckY = SKATEPARK_WALL.height + COPING_DROP;
  const groundY = COPING_DROP;
  const runs: CopingRun[] = [];
  // QP-E, straight on x 162.50, from the north plinth to where the end bank starts.
  const qx = QP_EAST.coping - COPING_IN;
  // Critic pass 2 (K3): the quarter-pipe and the mini wear pool coping too,
  // the bright lip line every fast lane ends on.
  runs.push({ band: POOL_COPING, points: [{ x: qx, y: deckY, z: QP_EAST.north }, { x: qx, y: deckY, z: QP_EAST.bankFrom }] });
  // The mini's three walls, ending where the south bank leaves the floor.
  const bankFoot = MINI.south - MINI.bankRun;
  runs.push({ band: POOL_COPING, points: [
    { x: MINI.west + COPING_IN, y: groundY, z: bankFoot },
    { x: MINI.west + COPING_IN, y: groundY, z: MINI.north + COPING_IN },
    { x: MINI.east - COPING_IN, y: groundY, z: MINI.north + COPING_IN },
    { x: MINI.east - COPING_IN, y: groundY, z: bankFoot },
  ] });
  // The bowl, broken by the north roll-out and the snake's mouth (lips z 155 / 161.5).
  const c = BOWL.corner - COPING_IN;
  const west = BOWL.minX + BOWL.corner;
  const east = BOWL.maxX - BOWL.corner;
  const north = BOWL.minZ + BOWL.corner;
  const south = BOWL.maxZ - BOWL.corner;
  const mouthDeg = Math.asin((north - (SNAKE.straightZ - SNAKE.halfWidth)) / c) / DEG;
  // The bowl and the berm wear pool coping behind the pipe (critic pass 1, A4).
  runs.push({ band: POOL_COPING, points: [
    { x: BOWL.rollTo, y: groundY, z: BOWL.minZ + COPING_IN },
    ...arc(east, north, c, -90, -mouthDeg, groundY),
  ] });
  const mouthSouthDeg = Math.asin((SNAKE.straightZ + SNAKE.halfWidth - south) / c) / DEG;
  runs.push({ band: POOL_COPING, points: [
    ...arc(east, south, c, mouthSouthDeg, 90, groundY),
    ...arc(west, south, c, 90, 180, groundY),
    ...arc(west, north, c, 180, 270, groundY),
    { x: BOWL.rollFrom, y: groundY, z: BOWL.minZ + COPING_IN },
  ] });
  // The berm's outer lip, the quarter turn from heading +Z to −X.
  runs.push({ band: POOL_COPING,
    points: arc(SNAKE.bermX, SNAKE.bermZ, SNAKE.bermRadius + SNAKE.halfWidth - COPING_IN, 0, 90, groundY) });
  // A steel edge where each kicker's ride face meets its lip (A2, T3), and a
  // painted stripe on the lip block behind it (critic pass 2, K1).
  for (const [k, top] of [[SKATEPARK_KICKERS.k2, KICK.height], [SKATEPARK_KICKERS.k1, KICK.height]] as const) {
    const x = k.foot + KICK.rise;
    runs.push({ cap: KICK_CAP, points: [{ x, y: top + COPING_DROP, z: k.minZ }, { x, y: top + COPING_DROP, z: k.maxZ }] });
  }
  // The snake's poured lips (A3): no pipe, a pale band and a bullnose. The
  // inner lip runs down the roll-in's west side, round the berm's inside and
  // west along the north straight; the south straight; the roll-in's east
  // side, up to where the berm's pipe begins.
  const inner = SNAKE.bermRadius - SNAKE.halfWidth;
  const westSide = SNAKE.rollInX - SNAKE.halfWidth;
  const eastSide = SNAKE.rollInX + SNAKE.halfWidth;
  const northLip = SNAKE.straightZ - SNAKE.halfWidth;
  const southLip = SNAKE.straightZ + SNAKE.halfWidth;
  // Each straight lip runs on to the bowl's own wall line (critic pass 2,
  // F4), not half a metre short of it. Not to the arc's own end at x 111.34:
  // the drawn rim notches there, 4–18 cm under the deck, so a band could not
  // lie level and the whole segment would be dropped; 16 cm stay bare.
  const northMouthX = BOWL.maxX;
  const southMouthX = BOWL.maxX;
  runs.push({ style: 'edge', band: POURED_LIP, points: [
    { x: westSide, y: 0, z: SNAKE.rollInFrom },
    ...arc(SNAKE.bermX, SNAKE.bermZ, inner, 0, 90, 0),
    { x: northMouthX, y: 0, z: northLip },
  ] });
  runs.push({ style: 'edge', band: POURED_LIP, points: [{ x: SNAKE.bermX, y: 0, z: southLip }, { x: southMouthX, y: 0, z: southLip }] });
  runs.push({ style: 'edge', band: POURED_LIP, points: [{ x: eastSide, y: 0, z: SNAKE.rollInFrom }, { x: eastSide, y: 0, z: SNAKE.bermZ }] });
  // The pyramid's poured crest (critic pass 2, K2): four lines just inside
  // its flat top, so a pale arris over a darker face shows where the top
  // begins and which way each face falls.
  const [x0, x1] = [PYRAMID.minX + PYRAMID.run + CREST_INSET, PYRAMID.maxX - PYRAMID.run - CREST_INSET];
  const [z0, z1] = [PYRAMID.minZ + PYRAMID.run + CREST_INSET, PYRAMID.maxZ - PYRAMID.run - CREST_INSET];
  const y = PYRAMID.top;
  for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]] as const) {
    runs.push({ style: 'edge', band: POURED_CREST, points: [{ x: a[0], y, z: a[1] }, { x: b[0], y, z: b[1] }] });
  }
  return { radius: COPING_RADIUS, runs };
}

function rect(id: string, x0: number, x1: number, z0: number, z1: number): TrickZone {
  return { id, corners: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] };
}

function polygon(id: string, corners: readonly (readonly [number, number])[]): TrickZone {
  return { id, corners: corners.map(([x, z]) => ({ x, z })) };
}

/**
 * The snake berm's outer wall, as zone corners from the berm's 0° to 90°:
 * its lip (`bermRadius + halfWidth` round the berm centre) plus a 0.5 m deck
 * strip, as the other drop edges carry. Eight chords over the quarter keep
 * the sagitta under 5 cm, so every chord lies outside the drawn lip (QA TR-1:
 * on the lip itself, a come-back air off the berm wall latched its launch
 * 6–24 cm past the old chords and was paid off-feature).
 */
function bermOuterArc(): [number, number][] {
  const radius = SNAKE.bermRadius + SNAKE.halfWidth + 0.5;
  const corners: [number, number][] = [];
  for (let step = 0; step <= 8; step += 1) {
    const angle = (step / 8) * (Math.PI / 2);
    corners.push([SNAKE.bermX + radius * Math.cos(angle), SNAKE.bermZ + radius * Math.sin(angle)]);
  }
  return corners;
}

/**
 * Seventeen zones, one per feature (D10); the east wall alone is split, into
 * one section per riding lane, sharing an edge so the continuous wall has no
 * off-feature seam (QA TR-3). Mount zones reach back over the run-up
 * (v × 0.362 s + 1.5 m at 6 m/s); drop edges carry a 0.5 m deck strip. The
 * east wall's sections end at its coping instead (QA TR-2): a deck strip
 * there was standable flat, reached up the end bank, and two sections met on
 * it — a stand-still pair worth 1,792. A launch latched on the coping line
 * itself is still inside.
 */
export const SKATEPARK_TRICK_ZONES: readonly TrickZone[] = Object.freeze([
  rect('qp-east-north', 161.5, 162.5, 96.75, 113.75),
  rect('qp-east-mid', 161.5, 162.5, 113.75, 131.75),
  rect('qp-east-south', 161.5, 162.5, 131.75, 148.25),
  rect('mini', MINI.west, MINI.east, MINI.north, MINI.south),
  polygon('bowl', [[97.53, 152.5], [110.47, 152.5], [111.5, 153.53], [111.5, 162.97], [110.47, 164],
    [97.53, 164], [96.5, 162.97], [96.5, 153.53]]),
  polygon('snake-berm', [[144.75, 146], [SNAKE.bermX + SNAKE.bermRadius + SNAKE.halfWidth + 0.5, 146],
    ...bermOuterArc(), [140.5, SNAKE.bermZ + SNAKE.bermRadius + SNAKE.halfWidth + 0.5], [140.5, 155]]),
  rect('snake-rollers', 121.5, 134.5, 155, 161.5),
  rect('stair-deck', 117, 127, 108, 111.5),
  rect('euro-gap', 126.5, 133.5, 96.75, 102.75),
  rect('kicker-k2', 124.5, 127.4, 120, 128),
  rect('kicker-k1', 128.5, 131.4, 136.6, 140.6),
  rect('ledge-l1', 140.25, 155.75, 99.5, 103.4),
  rect('ledge-l2', 102.25, 117.75, 116.5, 120.4),
  rect('manual-1', 136.25, 149.75, 114.5, 119.9),
  rect('manual-2', 100.8, 106.2, 134.5, 145.75),
  rect('hip-pyramid', 112.5, 119.5, 136.5, 143.5),
  rect('planter-line', 124.3, 138.25, 164, 167.5),
].map((zone) => Object.freeze(zone)));

/**
 * The one checkpoint: the start line of the Trick Run lane, heading +X. No
 * finish and no lap, so Time trial, Track Day and Race stay closed by the
 * referees' own rules (D18). It is appended to the built plan rather than
 * passed to the builder, whose `assertRouteOrder` wants a timed route of two
 * or more gates; no other producer's path changes. `centre.y` is one
 * half-height above the floor, the `Checkpoint` contract.
 */
export const SKATEPARK_START: Readonly<Checkpoint> = {
  id: 'start',
  centre: { x: 116, y: 2, z: 124 },
  halfExtents: { x: 3, y: 2, z: 0.5 },
  headingY: Math.PI / 2,
  routeIndex: 0,
  kind: 'start',
  label: 'Start',
};

/** The start lane's corridor: what gives `buildLevelPlan` a socket at the spawn. */
const RUN_UP: readonly SegmentSpec[] = [{ id: 'foundry-run-up', length: 16, halfWidth: 3, shoulder: 0.1, surface: 'pavement' }];

/**
 * A light concrete yard (D3's brief): pavement retinted pale; concrete lifted
 * with it so the blocks keep their margin over the floor they stand on
 * (`DESIGN.md` §3, the kerb rule); foundry brick for the plinth and planters.
 */
export const SKATEPARK_PALETTE: Readonly<Partial<Record<MaterialId, number>>> = Object.freeze({
  pavement: 0x8a8984,
  concrete: 0xb5b3ac,
  brick: 0x8a4f3d,
});

// ---------------------------------------------------------------------------
// Wear (the look pass): faces, lips, floors, tonal patches, plinth panels
// ---------------------------------------------------------------------------

/** Old paint, muted: what a decade of pieces reads as from the chase camera. */
const PAINT = Object.freeze({
  teal: 0x2f7f7a, magenta: 0x9a3c76, cobalt: 0x3557a6, ochre: 0xc8892f,
  coral: 0xc4584a, lilac: 0x7d6aa8, moss: 0x5b9a5a, black: 0x2a2a2e, slate: 0x2e3a50, chalk: 0xddd8cc,
});

function patch(x0: number, x1: number, z0: number, z1: number, colour: number, strength: number): WearPatch {
  return { x0, x1, z0, z1, colour, strength };
}

/**
 * A solid wash over a kicker's two side tapers, foot to back bank (critic
 * pass 2, R5): its dark painted sides. Each reaches a little under the ride
 * face's own paint (`SKATEPARK_FACE_MURALS`), so no bare seam shows between.
 */
function sideWashes(k: Kicker, colour: number, strength: number): WearPatch[] {
  const [x0, x1] = [k.foot, k.foot + KICK.rise + KICK.lip + KICK.backRun];
  const under = 0.35;
  return [
    { x0, x1, z0: k.minZ - KICK.taper - 0.12, z1: k.minZ + under, colour, strength, wash: true },
    { x0, x1, z0: k.maxZ - under, z1: k.maxZ + KICK.taper + 0.12, colour, strength, wash: true },
  ];
}

/**
 * Tonal patches on the transition faces (world XZ rectangles; only a face
 * takes colour, so a rectangle may overlap its deck and floor freely).
 */
export const SKATEPARK_WEAR_PATCHES: readonly WearPatch[] = Object.freeze([
  // Critic pass 1 (R4): the straight faces carry hard-edged paint as
  // geometry (`SKATEPARK_FACE_MURALS`); their blotches stay as a faint older
  // layer under it.
  // QP-E's face, x 160.27–162.50, one patch between each pair of lanes.
  patch(159.8, 162.9, 99, 107, PAINT.teal, 0.18),
  patch(159.8, 162.9, 110.5, 116.5, PAINT.magenta, 0.18),
  patch(159.8, 162.9, 126.5, 135, PAINT.cobalt, 0.18),
  patch(159.8, 162.9, 140, 147, PAINT.ochre, 0.18),
  // The mini's three walls.
  patch(91.7, 94.5, 103, 109, PAINT.coral, 0.18),
  patch(95, 100.5, 100, 102.8, PAINT.lilac, 0.18),
  patch(101, 103.8, 104, 110.5, PAINT.moss, 0.18),
  // The bowl: south wall, west wall, the north-east corner. Critic pass 2
  // (R8): the curved corner and the berm keep only the faint older layer
  // (soft blotches on a curve read as dirt, not paint), and the rollers' lip
  // patch is gone.
  patch(99, 106, 161.6, 164.3, PAINT.cobalt, 0.18),
  patch(96.2, 98.8, 154.5, 161, PAINT.slate, 0.18),
  patch(107.5, 111.8, 152.2, 156, PAINT.magenta, 0.15),
  // The snake: the berm's outer wall.
  patch(147, 151.6, 152, 158, PAINT.teal, 0.15),
  // Each kicker's side tapers, painted dark (R5); the ride face is solid
  // paint as geometry (`SKATEPARK_FACE_MURALS`).
  ...sideWashes(SKATEPARK_KICKERS.k2, PAINT.black, 0.6),
  ...sideWashes(SKATEPARK_KICKERS.k1, PAINT.black, 0.6),
].map((entry) => Object.freeze(entry)));

function panel(x: number, z: number, normal: YardMural['normal'], width: number, fill: number, outline: number,
  seed: number, bottom = 0.08, height = 0.84): YardMural {
  return { x, z, normal, width, bottom, height, fill, outline, seed };
}

/**
 * A riding block's concrete side painted end to end (critic pass 2, R3):
 * from 3 cm over the floor to 6 cm under the block's top, a dark field with
 * bold slanted bands, weathered toward concrete — the painted ramp side the
 * brief's reference is known by. The seed picks the slant.
 */
function side(x: number, z: number, normal: YardMural['normal'], width: number, top: number, fill: number,
  outline: number, seed: number): YardMural {
  return { ...panel(x, z, normal, width, fill, outline, seed, 0.03, top - 0.09), ground: 'concrete' };
}

/** Over the stair deck (0.90) on the raised north run, and over the QP-E deck (1.49) on the raised east run. */
const OVER_STAIR_DECK = STAIR_DECK_TOP + 0.08;
const OVER_QP_DECK = QP_DECK_TOP + 0.08;

/**
 * Painted panels on the plinth's inner side, only where the floor or a deck
 * stands right in front: never behind a bank or a face. Critic pass 1
 * (R3/A7): 24 pieces in three kinds (lump clusters, slanted bands, shards),
 * some over a faded field, some with drips, some up to the cap — all
 * abstract, no letters, no words, no marks.
 */
export const SKATEPARK_MURALS: readonly YardMural[] = Object.freeze([
  // West face (x 88, facing +X): beside the mini, the start lane, the bowl deck.
  panel(88, 104, 'x+', 3.6, PAINT.teal, PAINT.black, 11),
  panel(88, 112, 'x+', 3.0, PAINT.chalk, PAINT.slate, 14, 0.06, 0.9),
  panel(88, 121, 'x+', 4.4, PAINT.ochre, PAINT.black, 12),
  panel(88, 151.5, 'x+', 3.2, PAINT.coral, PAINT.black, 15, 0.1, 0.8),
  panel(88, 158.5, 'x+', 3.8, PAINT.magenta, PAINT.black, 13),
  // South face (z 168, facing −Z), clear of the planter line.
  panel(93, 168, 'z-', 3.8, PAINT.chalk, PAINT.slate, 21, 0.06, 0.9),
  panel(106.5, 168, 'z-', 4.4, PAINT.coral, PAINT.black, 22),
  panel(113.5, 168, 'z-', 3.2, PAINT.chalk, PAINT.black, 26, 0.1, 0.82),
  panel(119, 168, 'z-', 2.8, PAINT.moss, PAINT.black, 23),
  panel(144.5, 168, 'z-', 4.0, PAINT.lilac, PAINT.black, 24, 0.06, 0.9),
  panel(151, 168, 'z-', 3.0, PAINT.ochre, PAINT.slate, 27),
  panel(157, 168, 'z-', 3.6, PAINT.chalk, PAINT.black, 25),
  panel(163.5, 168, 'z-', 3.2, PAINT.teal, PAINT.black, 28, 0.1, 0.8),
  // North face (z 96.25, facing +Z), on the two 1.0 m runs, and over the stair deck.
  panel(95, 96.25, 'z+', 3.4, PAINT.coral, PAINT.black, 31),
  panel(108, 96.25, 'z+', 3.8, PAINT.teal, PAINT.black, 32, 0.06, 0.9),
  panel(119.5, 96.25, 'z+', 3.2, PAINT.magenta, PAINT.black, 35, OVER_STAIR_DECK, 0.84),
  panel(124.5, 96.25, 'z+', 3.0, PAINT.chalk, PAINT.slate, 36, OVER_STAIR_DECK, 0.84),
  panel(139, 96.25, 'z+', 3.6, PAINT.cobalt, PAINT.black, 33),
  panel(146, 96.25, 'z+', 3.0, PAINT.ochre, PAINT.black, 34, 0.1, 0.8),
  panel(152.5, 96.25, 'z+', 3.4, PAINT.lilac, PAINT.black, 37),
  // East face (x 167.5, facing −X): over the quarter-pipe's deck, and south of its end bank.
  panel(167.5, 104, 'x-', 3.6, PAINT.ochre, PAINT.black, 42, OVER_QP_DECK, 0.84),
  panel(167.5, 121.5, 'x-', 4.2, PAINT.teal, PAINT.slate, 43, OVER_QP_DECK, 0.84),
  panel(167.5, 138, 'x-', 3.6, PAINT.coral, PAINT.black, 44, OVER_QP_DECK, 0.84),
  panel(167.5, 160, 'x-', 3.4, PAINT.magenta, PAINT.black, 41),
  // Critic pass 2 (R3): the riding blocks' long sides, end to end — L1 (top
  // 0.45), L2 (0.40), the two manual pads (0.30) — and the stair deck's euro
  // take-off face over the pit; chalk bands on the sides the yard sees.
  side(148, 101.9, 'z+', 7.8, 0.45, PAINT.chalk, PAINT.black, 67),
  side(148, 101, 'z-', 7.8, 0.45, PAINT.coral, PAINT.black, 81),
  side(108, 118.9, 'z+', 7.8, 0.4, PAINT.chalk, PAINT.black, 84),
  side(108, 118, 'z-', 7.8, 0.4, PAINT.teal, PAINT.slate, 91),
  side(143, 118.4, 'z+', 5.8, 0.3, PAINT.chalk, PAINT.slate, 95),
  side(143, 116, 'z-', 5.8, 0.3, PAINT.lilac, PAINT.black, 116),
  side(104.7, 139, 'x+', 5.8, 0.3, PAINT.chalk, PAINT.black, 123),
  side(102.3, 139, 'x-', 5.8, 0.3, PAINT.ochre, PAINT.black, 128),
  side(127, 98.6, 'x+', 4.2, 0.9, PAINT.chalk, PAINT.black, 185),
].map((entry) => Object.freeze(entry)));

function face(along: 'x' | 'z', at: number, down: 1 | -1, from: number, to: number, fill: number, outline: number,
  seed: number): YardFaceMural {
  return { along, at, down, from, to, fill, outline, seed };
}

/**
 * A kicker's ride face painted solid, edge to edge and down to the toe plate
 * (critic pass 2, K1/F3/R5): the reference's blue ramp, with hard sides. Its
 * coping line is the lip sample just past the steel edge; the face is a
 * straight in z a sample inside each taper (`faceProfile` throws otherwise).
 */
function kickerFace(k: Kicker, seed: number): YardFaceMural {
  const lip = SKATEPARK_FIELD.originX
    + Math.ceil((k.foot + KICK.rise - SKATEPARK_FIELD.originX) / SKATEPARK_SPACING) * SKATEPARK_SPACING;
  return {
    ...face('z', lip, -1, k.minZ + 0.1, k.maxZ - 0.1, PAINT.cobalt, PAINT.black, seed),
    solid: { top: Math.hypot(lip - (k.foot + KICK.rise), 0.02) + 0.01, foot: 0 },
  };
}

/**
 * Hard-edged paint on the straight faces (critic pass 1, R4), each inside
 * its wall's straight: QP-E between the lanes, the mini's three walls, the
 * bowl's south and west walls. Never on a curved corner, where the cells
 * crease.
 */
export const SKATEPARK_FACE_MURALS: readonly YardFaceMural[] = Object.freeze([
  face('z', QP_EAST.coping, -1, 99, 107, PAINT.teal, PAINT.black, 51),
  face('z', QP_EAST.coping, -1, 110.5, 116.5, PAINT.magenta, PAINT.black, 52),
  face('z', QP_EAST.coping, -1, 126.5, 135, PAINT.chalk, PAINT.black, 53),
  face('z', QP_EAST.coping, -1, 140, 147, PAINT.ochre, PAINT.black, 54),
  face('z', MINI.west, 1, 102.75, 108.75, PAINT.coral, PAINT.black, 55),
  face('x', MINI.north, 1, 94.5, 101, PAINT.lilac, PAINT.black, 56),
  face('z', MINI.east, -1, 102.75, 108.75, PAINT.moss, PAINT.black, 57),
  face('x', BOWL.maxZ, -1, 100.25, 107.75, PAINT.cobalt, PAINT.black, 58),
  face('z', BOWL.minX, 1, 156.25, 160.25, PAINT.coral, PAINT.black, 59),
  kickerFace(SKATEPARK_KICKERS.k2, 61),
  kickerFace(SKATEPARK_KICKERS.k1, 62),
].map((entry) => Object.freeze(entry)));

/** A steel plate across each kicker's toe (critic pass 2, R5), 1.6 cm thick, over the paint's own foot. */
export const SKATEPARK_PLATES: readonly YardPlate[] = Object.freeze(
  [SKATEPARK_KICKERS.k2, SKATEPARK_KICKERS.k1].map((k) => Object.freeze({
    x0: k.foot - 0.35, x1: k.foot + 0.1, z0: k.minZ, z1: k.maxZ, thickness: 0.016,
  })),
);

/**
 * Four floodlight masts at the service lane's corners (critic pass 2, R7),
 * clear of every building, lamp and the plinth, aimed at the yard's middle.
 */
export const SKATEPARK_MASTS: readonly YardMast[] = Object.freeze(
  ([[83.5, 91.5], [172.5, 91.5], [83.5, 172.5], [172.5, 172.5]] as const).map(([x, z]) => Object.freeze({
    x, z, height: 12, aimX: 128, aimZ: 132,
  })),
);

/**
 * Saw-cut joints on a 4 m grid over the riding area (the 8 m lattice's lines
 * and the lines between), and stains and skid marks gathered where riders
 * brake and land: the run-up, K2's landing, the stair's foot (R1, A6).
 */
export const SKATEPARK_FLOOR: Readonly<YardFloor> = Object.freeze({
  jointPitch: 4,
  jointWidth: 0.07,
  minX: SKATEPARK_RIDING.minX,
  maxX: SKATEPARK_RIDING.maxX,
  minZ: SKATEPARK_RIDING.minZ,
  maxZ: SKATEPARK_RIDING.maxZ,
  stains: 36,
  seed: 0x5ca7,
  stainBias: Object.freeze([
    Object.freeze({ x0: 94, x1: 124, z0: 120.5, z1: 127.5 }),
    Object.freeze({ x0: 132, x1: 156, z0: 119, z1: 129 }),
    Object.freeze({ x0: 117, x1: 128, z0: 110.5, z1: 116 }),
  ]),
});

/** The yard's worn concrete (`render/yardWear.ts`, `level/yardScenery.ts`). Render-only. */
export const SKATEPARK_WEAR: Readonly<YardWear> = Object.freeze({
  revision: 'foundry-wear-r3',
  faceShade: 0.78,
  // Critic pass 1 (R5): a wider, lighter band, so a curved rim draws no teeth.
  lipGrime: 0.3,
  scuff: 0.14,
  patches: SKATEPARK_WEAR_PATCHES,
  murals: SKATEPARK_MURALS,
  faceMurals: SKATEPARK_FACE_MURALS,
  floor: SKATEPARK_FLOOR,
  plates: SKATEPARK_PLATES,
  masts: SKATEPARK_MASTS,
});

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

function* skateparkFieldSteps(blocks: readonly RidingBlock[]): Steps<Heightfield> {
  const s = SKATEPARK_SPACING;
  const { originX, originZ } = SKATEPARK_FIELD;
  const columns = Math.round((SKATEPARK_FIELD.maxX - originX) / s) + 1;
  const rows = Math.round((SKATEPARK_FIELD.maxZ - originZ) / s) + 1;
  const heights = new Array<number>(columns * rows).fill(0);
  const lattice = 8 / s;

  for (const cluster of SKATEPARK_CLUSTERS) {
    const [sx0, sx1, sz0, sz1] = cluster.squares;
    const c0 = Math.round((sx0 * 8 - originX) / s);
    const c1 = Math.round(((sx1 + 1) * 8 - originX) / s);
    const r0 = Math.round((sz0 * 8 - originZ) / s);
    const r1 = Math.round(((sz1 + 1) * 8 - originZ) / s);
    for (let row = r0; row <= r1; row += 1) {
      const z = originZ + row * s;
      for (let column = c0; column <= c1; column += 1) {
        const value = cluster.height(originX + column * s, z);
        if (value !== 0) heights[row * columns + column] = value;
      }
      if ((row - r0) % lattice === 0) yield PREPARATION_SLICE;
    }
  }

  // Seat every riding block: every corner of every cell a block overlaps sits
  // at least 0.02 m below its top, so the box always wins the sampler over
  // its whole footprint and no sliver of bank stands proud of a stair tread
  // beside it. A cell that only touches a block's edge is left alone, so the
  // banks keep their own shape right up to the deck.
  for (const { collider } of blocks) {
    const top = collider.centre.y + collider.halfExtents.y - BLOCK_SEAT;
    const c0 = Math.floor((collider.centre.x - collider.halfExtents.x - originX) / s - 1 + 1e-9) + 1;
    const c1 = Math.ceil((collider.centre.x + collider.halfExtents.x - originX) / s + 1 - 1e-9) - 1;
    const r0 = Math.floor((collider.centre.z - collider.halfExtents.z - originZ) / s - 1 + 1e-9) + 1;
    const r1 = Math.ceil((collider.centre.z + collider.halfExtents.z - originZ) / s + 1 - 1e-9) - 1;
    for (let row = r0; row <= r1; row += 1) {
      for (let column = c0; column <= c1; column += 1) {
        const index = row * columns + column;
        if (heights[index] > top) heights[index] = top;
      }
    }
  }
  for (let index = 0; index < heights.length; index += 1) {
    if (Math.abs(heights[index]) < FLOOR_SNAP) heights[index] = 0;
  }
  yield PREPARATION_SLICE;

  // C1: every cell that is not level, plus the floor under the narrow blocks
  // and the euro pit.
  const cellColumns = columns - 1;
  const transition: Record<number, true> = {};
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < cellColumns; column += 1) {
      const a = heights[row * columns + column];
      const b = heights[row * columns + column + 1];
      const c = heights[(row + 1) * columns + column];
      const d = heights[(row + 1) * columns + column + 1];
      if (Math.max(a, b, c, d) - Math.min(a, b, c, d) > FLOOR_SNAP) transition[row * cellColumns + column] = true;
    }
  }
  const flagArea = (x0: number, x1: number, z0: number, z1: number): void => {
    const c0 = Math.floor((x0 - originX) / s + 1e-9);
    const c1 = Math.ceil((x1 - originX) / s - 1e-9);
    const r0 = Math.floor((z0 - originZ) / s + 1e-9);
    const r1 = Math.ceil((z1 - originZ) / s - 1e-9);
    for (let row = r0; row < r1; row += 1) {
      for (let column = c0; column < c1; column += 1) transition[row * cellColumns + column] = true;
    }
  };
  for (const { collider, narrow } of blocks) {
    if (!narrow) continue;
    const { centre, halfExtents } = collider;
    flagArea(centre.x - halfExtents.x, centre.x + halfExtents.x, centre.z - halfExtents.z, centre.z + halfExtents.z);
  }
  flagArea(EURO_PIT.minX, EURO_PIT.maxX, EURO_PIT.minZ, EURO_PIT.maxZ);

  return {
    originX,
    originZ,
    spacing: s,
    columns,
    rows,
    heights,
    surfaces: new Array(cellColumns * (rows - 1)).fill('pavement'),
    transition,
  };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function createSkateparkLevel(hazardProbeMetres?: number, targetProbeMetres?: number): LevelPlan {
  return runSteps(createSkateparkLevelSteps(hazardProbeMetres, targetProbeMetres));
}

/**
 * `createSkateparkLevel` as slices (`shared/preparationSteps.ts`). The probe
 * arguments are accepted and ignored, as the Wharf ignores them: a hand-built
 * yard has no hazard or target authoring for a diagnostic to decorate.
 */
export function* createSkateparkLevelSteps(
  _hazardProbeMetres?: number,
  _targetProbeMetres?: number,
): Steps<LevelPlan> {
  const plan = yield* buildLevelPlanSteps(RUN_UP, {
    id: SKATEPARK_PLAN_ID,
    spawn: { position: { ...SKATEPARK_SPAWN.position }, headingY: SKATEPARK_SPAWN.headingY },
    surround: { height: 0, surface: 'pavement' },
    spacing: SKATEPARK_SPACING,
    settleBlocks: false,
    props: dressing(),
    palette: SKATEPARK_PALETTE,
  });
  yield PREPARATION_SLICE;
  const heightfield = yield* skateparkFieldSteps(SKATEPARK_BLOCKS);
  const colliders = [...SKATEPARK_BLOCKS.map((block) => block.collider), ...perimeter()];
  return {
    ...plan,
    heightfield,
    segments: plan.segments.map((segment, index) => index === 0
      ? { ...segment, colliders: [...segment.colliders, ...colliders] } : segment),
    checkpoints: [{ ...SKATEPARK_START, centre: { ...SKATEPARK_START.centre },
      halfExtents: { ...SKATEPARK_START.halfExtents } }],
    trickZones: SKATEPARK_TRICK_ZONES,
    // Zero population (D17): the authored branch with no paths installs no
    // actor, so the world keeps its own id and its record key is the plan id.
    populationActivity: { revision: 'authored-cut1-r1', ground: 'authored',
      targets: { people: 0, traffic: 0, riders: 0 }, paths: [] },
    recovery: { speed: 'rest' },
    copings: copings(),
    yardWear: SKATEPARK_WEAR,
  };
}
