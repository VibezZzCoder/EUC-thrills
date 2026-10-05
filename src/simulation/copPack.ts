/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SURFACES } from '../data/surfaces.ts';
import { CHASE, PHYSICS, TERRAIN } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { RouteBlocker } from './cpuRider.ts';
import { createSpineLocation, createSpineSample, RouteSpine, type SpineSample } from './routeSpine.ts';
import { createGroundSample, type TerrainSampler } from './world.ts';

/**
 * The pack's arithmetic — M39 Part P, "the chase rule with two faces"
 * (`docs/PLANS.md` §39.6b.3 and §39.6b.3b; the contract is `docs/M39_CHASE.md`
 * §2b).
 *
 * Three pursuers of one brain and one wheel differ only in where they begin
 * and where they return, and nothing in `cpuRider.ts` knows the word "role".
 * What does know it lives here, as pure functions over typed inputs: where a
 * patrol parks (`choosePatrolPosts`), when a parked patrol wakes
 * (`wakeTarget`), how a pack keeps from riding as three cops on one line
 * (`packmateBands`, `followLine`), where a patrol may be put back
 * (`choosePostReturn`), whether any human camera frames a spot
 * (`framedByAnyPane`) and the human cop's bearing readout (`bearingTo`).
 *
 * Nothing here imports three.js, `app/` or `render/` (invariant 1), nothing is
 * stateful beyond caller-owned scratch, and the functions called every fixed
 * step (`packmateBands`, `followLine`, `wakeTarget`, `framedByAnyPane`,
 * `choosePostReturn`, `bearingTo`) allocate nothing in the steady state.
 * `choosePatrolPosts` runs once per world and may.
 */

/**
 * How fast a cop may be stood at `distance` along the canonical spine facing
 * `direction`, or `null` for "not here": `CpuRider.landingAllowance`, bound —
 * the regroup's `RegroupJudge` shape.
 */
export type PostJudge = (distance: number, direction: 1 | -1) => number | null;

export interface PatrolPost {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * Faces the spawn by the short way round the ring (A-5): a rider arriving
   * meets him head-on, parked and visible (q127's reading).
   */
  readonly headingY: number;
  /** Canonical-spine distance: `brain.place(view, near)` and the judge. */
  readonly distance: number;
  /** Along the town ring (or the spine in the fallback), metres from the ring's own start, in [0, ring.length). */
  readonly ringDistance: number;
  /** Which side of the through line he stands: +1 left (AGENTS: +X is the rider's left), −1 right. */
  readonly side: 1 | -1;
}

export interface PatrolPosts {
  /** One entry per patrol; `null` = that patrol runs in echelon behind the tail from GO (no post could stand). */
  readonly posts: readonly (PatrolPost | null)[];
  /** F3's word: 'ring' on a town ring, 'spine' for the no-ring fallback, 'echelon' when every post is null. */
  readonly source: 'ring' | 'spine' | 'echelon';
}

export interface PaneView {
  /** The seat camera's position and yaw (Game: the seat's render camera; bench: the outlaw pose pulled back CAMERA.distanceAtRest). */
  readonly x: number;
  readonly z: number;
  readonly headingY: number;
}

export interface PackBody {
  /** Canonical-spine distance (`CpuRider.routeDistance`). */
  readonly distance: number;
  /** Metres left of the spine (`CpuRider.lineLateral`). */
  readonly lateral: number;
  /** m/s, unsigned. */
  readonly speed: number;
  /** `!crashed`. A crashed packmate is filed as nothing: cops pass through each other (no cop-to-cop physics). */
  readonly standing: boolean;
  /** World x/z (the brutal pass): what the close-quarters search steers round. Absent: not weighed. */
  readonly x?: number;
  readonly z?: number;
}

/** How far apart along the line the post walk tries candidates, metres. */
const POST_WALK_STEP_METRES = 5;
/**
 * How far either side of its target fraction a post may walk, as a share of
 * the ring. A sixth each way keeps two patrols at a third and two thirds from
 * ever crossing each other (or the spawn's own sixth either side).
 */
const POST_WALK_SHARE = 1 / 6;
/** How far along the line the roomier-side test looks for bands, metres either way. */
const ROOMIER_LOOK_METRES = 10;
/** How far along the line a post's own spot must be clear of every band, metres either way. */
const POST_CLEAR_ALONG_METRES = 2;
/**
 * How far the ground under a post may sit from the road line's own height,
 * metres. A post in a hole, down a drop or on a wall top is refused — a
 * parked cop needs no pace, but he does need somewhere to stand.
 */
const POST_HEIGHT_TOLERANCE_METRES = 0.5;
/**
 * How far either side of a post, along the heading he parks at, the ground is
 * read for its gradient, metres: a wheel's length of road under him.
 */
const POST_SLOPE_SPAN_METRES = 1;
/** Half a packmate's length along the line, metres: a wheel and a rider, filed as a moving blocker. */
const PACKMATE_HALF_LENGTH_METRES = 0.8;

/** Shortest signed difference between two angles, radians. */
function wrapAngle(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Signed route separation `to − from` on a line, the short way round a closed one. */
function routeDelta(from: number, to: number, spine: { readonly length: number; readonly closed: boolean }): number {
  let delta = to - from;
  if (spine.closed && spine.length > 0) {
    const half = spine.length / 2;
    if (delta > half) delta -= spine.length;
    else if (delta < -half) delta += spine.length;
  }
  return delta;
}

// -- Posts ------------------------------------------------------------------

/**
 * The steepest downhill, along his heading, a parked cop stands still on —
 * rise over run, the post walk's gradient refusal (QA r2).
 *
 * A parked patrol's wheel is stepped on neutral input, and the controller
 * holds a stopped wheel only against rolling *backwards* (the reverse gate,
 * `EucController.ts`): downhill ahead, gravity's pull along the road
 * (`g · slope`) is resisted by nothing but rolling resistance, so a post
 * steeper than `rollingResistance / g` rolls him off the spot he was judged
 * for — 23–29 m at up to 3.5 m/s on the steepest town posts. Derived, not
 * tuned: pavement's rolling resistance (the least of any road surface, so the
 * rule holds on every surface a post can stand on) times the live scale, over
 * gravity — 0.35 / 9.81 = 0.0357 today.
 */
export function postHoldSlope(
  rollingResistanceScale: number = TERRAIN.rollingResistanceScale,
  gravity: number = PHYSICS.gravity,
): number {
  return (SURFACES.pavement.rollingResistance * rollingResistanceScale) / gravity;
}

/**
 * Where the patrols park, once per world, from the plan alone (§39.6b.3
 * "Posts"; `docs/M39_CHASE.md` §2b.1).
 *
 * Deterministic on purpose: the same seed gives the same posts every time,
 * so a player learns the town's beat. On the town ring — the street loop
 * with no alternate — patrol i of n aims for ring fraction (i + 1)/(n + 1)
 * from the spawn's projection (a third and two thirds for the solo face's
 * two patrols, a half for a 2v2 room's one: A-5), wrapped round the ring's
 * seam (R-13), and walks nearest-first either side of it in 5 m steps until
 * a spot stands: off the through line by `postStandoffMetres` on the roomier
 * side, clamped inside the chase corridor, clear of every band, on ground
 * level with the road, no steeper downhill along the heading he parks at
 * than his wheel holds still on (`holdSlope`, `postHoldSlope`), allowed by
 * the judge, and beyond the tracker line from the spawn. A spot in a hole,
 * on a gradient he would roll off, or short of a bollard row is refused and
 * the walk continues. A plan with no ring (none in the r6 corpus) takes the
 * same fractions on the canonical spine; a patrol whose walk finds nothing
 * answers `null` and rides in echelon, and when every patrol does the source
 * says so for F3.
 *
 * `blockers` are the canonical spine's (the shared `RouteField`'s), so every
 * candidate is judged in the canonical frame: projected onto the spine the
 * way `routeBlockers` projects the world, whatever direction the ring runs.
 */
export function choosePatrolPosts(
  plan: LevelPlan,
  spine: RouteSpine,
  blockers: readonly RouteBlocker[],
  ground: TerrainSampler,
  count: number,
  judge: PostJudge | null,
  tuning?: {
    readonly postStandoffMetres: number;
    readonly trackerGapMetres: number;
    readonly riderHitRadius: number;
    readonly streetMargin: number;
    /** `postHoldSlope()` at the live rolling-resistance scale; the shipped value when omitted. */
    readonly holdSlope?: number;
  },
): PatrolPosts {
  const standoff = tuning?.postStandoffMetres ?? CHASE.postStandoffMetres;
  const trackerGap = tuning?.trackerGapMetres ?? CHASE.trackerGapMetres;
  const hitRadius = tuning?.riderHitRadius ?? CHASE.riderHitRadius;
  const margin = tuning?.streetMargin ?? CHASE.streetMargin;
  const holdSlope = tuning?.holdSlope ?? postHoldSlope();

  const ringLoop = (plan.streetLoops ?? []).find((loop) => loop.alternate.length === 0);
  // Built exactly as StreetLoops builds it (unclosed), once per world.
  const line = ringLoop === undefined
    ? spine
    : RouteSpine.fromTraversal(plan, ringLoop.main.map((id) => ({ id, forward: true })));
  const onRing = ringLoop !== undefined;
  const length = line.length;
  // The ring always wraps (it is a loop whose builder leaves it unclosed);
  // the fallback spine wraps only if it is itself closed, and clamps otherwise.
  const wraps = onRing || spine.closed;
  const wrap = (distance: number): number => (length > 0 ? ((distance % length) + length) % length : 0);

  const spawn = plan.spawn.position;
  const located = createSpineLocation();
  line.locate(spawn.x, spawn.z, -1, located);
  const spawnAt = located.distance;

  const here = createSpineSample();
  const canon = createSpineSample();
  const underfoot = createGroundSample();
  const slopeSample = createGroundSample();

  const posts: (PatrolPost | null)[] = [];
  for (let index = 0; index < count; index += 1) {
    const fraction = (index + 1) / (count + 1);
    const target = spawnAt + fraction * length;
    const reach = length * POST_WALK_SHARE;
    let post: PatrolPost | null = null;
    for (let offset = 0; offset <= reach && post === null; offset += POST_WALK_STEP_METRES) {
      for (const sign of offset === 0 ? [1] : [1, -1]) {
        const raw = target + sign * offset;
        if (!wraps && (raw < 0 || raw > length)) continue;
        const ringDistance = wraps ? wrap(raw) : raw;
        post = standPost(index, ringDistance);
        if (post !== null) break;
      }
    }
    posts.push(post);
  }

  const source: PatrolPosts['source'] = count > 0 && posts.every((post) => post === null)
    ? 'echelon'
    : onRing ? 'ring' : 'spine';
  return { posts, source };

  /** One candidate: the post that stands at `ringDistance`, or null with the walk continuing. */
  function standPost(index: number, ringDistance: number): PatrolPost | null {
    line.sample(ringDistance, here);

    // The canonical frame: where this spot is along the spine, which way the
    // spine runs here against the line, and where the line's centre sits
    // across the spine. On r6 the ring *is* the canonical road (o = 1,
    // centre 0); the projection keeps a future ring that is not honest.
    let canonicalDistance: number;
    if (line === spine) {
      canonicalDistance = ringDistance;
    } else {
      spine.locate(here.x, here.z, -1, located, here.headingY);
      canonicalDistance = located.distance;
    }
    spine.sample(canonicalDistance, canon);
    const orientation: 1 | -1 = Math.cos(canon.headingY - here.headingY) >= 0 ? 1 : -1;
    const centre = lateralIn(canon, here.x, here.z);

    // The roomier side: the greater clearance from the line's centre to the
    // nearest band within ±10 m along it, capped by the corridor; ties right.
    const corridor = here.halfWidth + margin;
    let roomLeft = corridor;
    let roomRight = corridor;
    for (const band of blockers) {
      if (band.to < canonicalDistance - ROOMIER_LOOK_METRES || band.from > canonicalDistance + ROOMIER_LOOK_METRES) continue;
      const a = orientation * (band.left - centre);
      const b = orientation * (band.right - centre);
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      if (high > 0) roomLeft = Math.min(roomLeft, Math.max(0, low));
      if (low < 0) roomRight = Math.min(roomRight, Math.max(0, -high));
    }
    const side: 1 | -1 = roomLeft > roomRight ? 1 : -1;

    // 1. Off the through line by the standoff, inside the chase corridor.
    const lateral = side * Math.min(standoff, corridor - hitRadius);
    const x = here.x + Math.cos(here.headingY) * lateral;
    const z = here.z - Math.sin(here.headingY) * lateral;

    // 2. Clear of every band across his own width, a couple of metres either way.
    const across = lateralIn(canon, x, z);
    for (const band of blockers) {
      if (band.to < canonicalDistance - POST_CLEAR_ALONG_METRES || band.from > canonicalDistance + POST_CLEAR_ALONG_METRES) continue;
      if (band.left >= across - hitRadius && band.right <= across + hitRadius) return null;
    }

    // 3. On the ground, level with the road: not in a hole, not on a wall top.
    ground.sampleGround(x, z, underfoot);
    if (Math.abs(underfoot.height - here.y) > POST_HEIGHT_TOLERANCE_METRES) return null;

    // Facing the spawn by the short way round (A-5); on a clamped line, toward it.
    let facingLine: 1 | -1;
    if (wraps) {
      const back = wrap(ringDistance - spawnAt);
      facingLine = back <= length / 2 ? -1 : 1;
    } else {
      facingLine = ringDistance > spawnAt ? -1 : 1;
    }
    const headingY = wrapAngle(here.headingY + (facingLine < 0 ? Math.PI : 0));

    // 3b. Level enough along that heading to stand still on (QA r2). He is
    // parked on neutral input and nothing holds a stopped wheel against
    // rolling forward but rolling resistance: downhill ahead steeper than
    // `holdSlope`, the "parked, visible cop" would roll off his post onto a
    // spot nobody judged — and a post return would put him back to roll again.
    const forwardX = Math.sin(headingY) * POST_SLOPE_SPAN_METRES;
    const forwardZ = Math.cos(headingY) * POST_SLOPE_SPAN_METRES;
    ground.sampleGround(x + forwardX, z + forwardZ, slopeSample);
    const ahead = slopeSample.height;
    ground.sampleGround(x - forwardX, z - forwardZ, slopeSample);
    const behind = slopeSample.height;
    if ((ahead - behind) / (2 * POST_SLOPE_SPAN_METRES) < -holdSlope) return null;

    // 4. The brain's own beliefs about the spot, in the canonical frame.
    if (judge !== null && judge(canonicalDistance, (facingLine * orientation) as 1 | -1) === null) return null;

    // 5. Beyond the tracker line from the spawn: a patrol parked inside it
    // would be a second tail at GO, not a beat to ride toward.
    if (Math.hypot(x - spawn.x, z - spawn.z) <= trackerGap) return null;

    return {
      index,
      x,
      y: underfoot.height,
      z,
      headingY,
      distance: canonicalDistance,
      ringDistance,
      side,
    };
  }
}

/** Metres left of the line at `at` of a world point (AGENTS: +X is the rider's left). */
function lateralIn(at: SpineSample, x: number, z: number): number {
  return (x - at.x) * Math.cos(at.headingY) - (z - at.z) * Math.sin(at.headingY);
}

// -- Not stacking -----------------------------------------------------------

/**
 * Per-`out` pools of reusable bands, so a band count that dips (a packmate
 * crashes) and recovers does not allocate again: the fixed step allocates
 * nothing in the steady state.
 */
const bandPools = new WeakMap<RouteBlocker[], MutableBand[]>();

interface MutableBand {
  from: number;
  to: number;
  left: number;
  right: number;
  safeSpeed: number;
  facing: 0 | 1 | -1;
}

/**
 * The other standing cops as moving blockers in `self`'s canonical frame
 * (§39.6b.3 "Not stacking": **a packmate is a moving blocker**).
 *
 * Each other standing body files one band a wheel's length long, across his
 * true lateral extent (`lateral ± riderHitRadius`), passable at his own speed
 * (`safeSpeed` raw: the brain floors a packmate-bound cap at
 * `TURN_TO_FACE_SPEED`, so no packmate ever brakes a cop to the standstill
 * reserved for one aimed away from his quarry). On a closed spine the band is
 * seam-shifted by ±length to the short way round from `self`, so two cops
 * either side of the start line still see each other. The rule is written in
 * the brain's own vocabulary so no new steering law is: the existing gap
 * search and swerve law spread the pack across the corridor the way they
 * already spread around a bollard row. A crashed packmate files nothing —
 * cops pass through each other, as they always could.
 *
 * `self` is an index into `bodies`. `out` is caller-owned and reused; the
 * answer is `out`, trimmed to the bands filed.
 */
export function packmateBands(
  self: number,
  bodies: readonly PackBody[],
  spine: { readonly length: number; readonly closed: boolean },
  out: RouteBlocker[],
  riderHitRadius: number = CHASE.riderHitRadius,
): readonly RouteBlocker[] {
  let pool = bandPools.get(out);
  if (pool === undefined) {
    pool = [];
    bandPools.set(out, pool);
  }
  const origin = bodies[self]?.distance ?? 0;
  let count = 0;
  for (let index = 0; index < bodies.length; index += 1) {
    if (index === self) continue;
    const body = bodies[index];
    if (!body.standing) continue;
    const centre = origin + routeDelta(origin, body.distance, spine);
    let band = pool[count];
    if (band === undefined) {
      band = { from: 0, to: 0, left: 0, right: 0, safeSpeed: 0, facing: 0 };
      pool[count] = band;
    }
    band.from = centre - PACKMATE_HALF_LENGTH_METRES;
    band.to = centre + PACKMATE_HALF_LENGTH_METRES;
    band.left = body.lateral + riderHitRadius;
    band.right = body.lateral - riderHitRadius;
    band.safeSpeed = Math.abs(body.speed);
    band.facing = 0;
    out[count] = band;
    count += 1;
  }
  out.length = count;
  return out;
}

/**
 * The lateral line this cop follows instead of the quarry's, metres left of
 * the spine, or `null` to copy the quarry's line (§39.6b.3 "Not stacking":
 * **the lateral follow is offset per pursuer**).
 *
 * The tail always answers `null`: he copies the rider's line as shipped. A
 * patrol with a standing packmate within `spacingMetres` by route (seam-aware)
 * takes the roomier side of the nearest one by that spacing — left when the
 * mate sits on or right of the centre, right otherwise — clamped to
 * ±halfWidth, so the echelon forms without anyone braking for anyone.
 * Deterministic: the same pack gives the same lines, so the formation does
 * not flicker between steps.
 */
export function followLine(
  self: number,
  role: 'tail' | 'patrol',
  bodies: readonly PackBody[],
  halfWidth: number,
  spacingMetres: number,
  spine: { readonly length: number; readonly closed: boolean },
): number | null {
  if (role === 'tail') return null;
  const me = bodies[self];
  if (me === undefined) return null;
  let nearest = -1;
  let nearestGap = Infinity;
  for (let index = 0; index < bodies.length; index += 1) {
    if (index === self) continue;
    const body = bodies[index];
    if (!body.standing) continue;
    const gap = Math.abs(routeDelta(me.distance, body.distance, spine));
    if (gap > spacingMetres || gap >= nearestGap) continue;
    nearest = index;
    nearestGap = gap;
  }
  if (nearest < 0) return null;
  const mate = bodies[nearest].lateral;
  const side = (halfWidth - mate) >= (halfWidth + mate) ? 1 : -1;
  return clamp(mate + side * spacingMetres, -halfWidth, halfWidth);
}

/**
 * The other standing cops where they are, world x/z — the brutal pass's
 * `CpuPackInput.mates`, read by the close-quarters search so a second cop
 * takes the other way round the block. `out` is caller-owned: its entries
 * are reused, so the fixed step allocates nothing once it has held the pack.
 */
export function packmatePositions(
  self: number,
  bodies: readonly PackBody[],
  out: { x: number; z: number }[],
): readonly { x: number; z: number }[] {
  let count = 0;
  const pool = matePools.get(out) ?? [];
  matePools.set(out, pool);
  for (let index = 0; index < bodies.length; index += 1) {
    if (index === self) continue;
    const body = bodies[index];
    if (!body.standing || body.x === undefined || body.z === undefined) continue;
    let mate = pool[count];
    if (mate === undefined) {
      mate = { x: 0, z: 0 };
      pool[count] = mate;
    }
    mate.x = body.x;
    mate.z = body.z;
    out[count] = mate;
    count += 1;
  }
  out.length = count;
  return out;
}

const matePools = new WeakMap<{ x: number; z: number }[], { x: number; z: number }[]>();

// -- Waking -----------------------------------------------------------------

/**
 * The nearest standing outlaw inside `wakeMetres` of a parked patrol, or −1
 * (§39.6b.3 "Waking"). `distances[o]` is the straight line from the patrol to
 * outlaw o. `wakeMetres` defaults to `CHASE.patrolWakeMetres`, which is pinned
 * to the siren's far edge, so a wake is heard as it happens. Ties go to the
 * lower index, so the answer never depends on anything but the facts.
 */
export function wakeTarget(
  distances: readonly number[],
  standing: readonly boolean[],
  wakeMetres: number = CHASE.patrolWakeMetres,
): number {
  let best = -1;
  let bestRange = Infinity;
  for (let index = 0; index < distances.length; index += 1) {
    if (!standing[index]) continue;
    const range = distances[index];
    if (!(range <= wakeMetres) || range >= bestRange) continue;
    best = index;
    bestRange = range;
  }
  return best;
}

// -- Returns ----------------------------------------------------------------

/**
 * Whether any human pane frames the spot (§39.6b.3b "Returns with several
 * cameras"). Pane s frames it when the spot is within `farMetres` of it AND
 * inside its forward cone (`|wrap(atan2(dx, dz) − headingY)| ≤ coneRadians`),
 * or when it is closer than `nearMetres` whatever the angle — a body
 * appearing beside a camera is seen. The panes are every human pane:
 * standing outlaws, spectators and a human cop; in the solo face, one.
 *
 * The rule's name, for AGENTS: **no body appears where anyone is looking.**
 * The same predicate refuses a tail's rung (bound into `planRegroup`'s
 * refusals) and a patrol's post (`choosePostReturn`).
 */
export function framedByAnyPane(
  x: number,
  z: number,
  panes: readonly PaneView[],
  coneRadians: number,
  farMetres: number,
  nearMetres: number = CHASE.bustRadiusMetres + 1,
): boolean {
  for (let index = 0; index < panes.length; index += 1) {
    const pane = panes[index];
    const dx = x - pane.x;
    const dz = z - pane.z;
    const range = Math.sqrt(dx * dx + dz * dz);
    if (range < nearMetres) return true;
    if (range > farMetres) continue;
    if (Math.abs(wrapAngle(Math.atan2(dx, dz) - pane.headingY)) <= coneRadians) return true;
  }
  return false;
}

/**
 * The post a patrol is put back to when his gap or stall clock fires, or
 * `null` to keep riding (§39.6b.3 "Returning"; `docs/M39_CHASE.md` §2b.5).
 *
 * A post qualifies when it exists, lies beyond `trackerGapMetres` from the
 * quarry by straight line, is **behind his travel** or farther than
 * `patrolReturnMetres`, is not occupied by another cop (within
 * `packSpacingMetres`), and no human pane frames it. The answer is the
 * qualifying post nearest the quarry. A re-entry from the front is therefore
 * always a parked, visible cop the player rides toward, never a rider
 * materialising ahead; and when nothing qualifies he keeps riding, because
 * skipping a return is fair and appearing in view is not. Posts were judged
 * when they were chosen, so a return does not judge them again.
 */
export function choosePostReturn(
  posts: readonly (PatrolPost | null)[],
  quarry: { readonly x: number; readonly z: number; readonly headingY: number },
  others: readonly { readonly x: number; readonly z: number }[],
  panes: readonly PaneView[],
  tuning: {
    readonly trackerGapMetres: number;
    readonly patrolReturnMetres: number;
    readonly returnConeRadians: number;
    readonly packSpacingMetres: number;
    readonly nearMetres: number;
  },
): PatrolPost | null {
  const travelX = Math.sin(quarry.headingY);
  const travelZ = Math.cos(quarry.headingY);
  const spacing = tuning.packSpacingMetres * tuning.packSpacingMetres;
  let best: PatrolPost | null = null;
  let bestRange = Infinity;
  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    if (post === null) continue;
    const dx = post.x - quarry.x;
    const dz = post.z - quarry.z;
    const range = Math.sqrt(dx * dx + dz * dz);
    if (range <= tuning.trackerGapMetres) continue;
    const behind = dx * travelX + dz * travelZ < 0;
    if (!behind && range <= tuning.patrolReturnMetres) continue;
    let taken = false;
    for (let other = 0; other < others.length && !taken; other += 1) {
      const ox = others[other].x - post.x;
      const oz = others[other].z - post.z;
      taken = ox * ox + oz * oz <= spacing;
    }
    if (taken) continue;
    if (framedByAnyPane(post.x, post.z, panes, tuning.returnConeRadians, tuning.patrolReturnMetres, tuning.nearMetres)) {
      continue;
    }
    if (range < bestRange) {
      best = post;
      bestRange = range;
    }
  }
  return best;
}

// -- Roadblocks: a patrol sent ahead (the brutal pass) -----------------------

/** How far apart along the line the roadblock walk tries candidates, metres. */
const INTERCEPT_STEP_METRES = 10;
/**
 * How far past the wake line a roadblock stands from the rider in a straight
 * line, metres: placed asleep and silent, never woken by his own arrival.
 * Callers pass `patrolWakeMetres` plus this as `minStraightMetres`.
 */
export const INTERCEPT_WAKE_MARGIN_METRES = 20;

/**
 * Where a patrol sent ahead of an outlaw stands, or `null` to keep riding —
 * the brutal pass (2026-09-25), the owner's *"it was still easy to escape
 * him by speeding away. it took a while of riding in silence before i ran
 * into the next cop"*.
 *
 * A **roadblock**: a parked cop on the rider's own line of travel, off the
 * racing line by the post stand-off on the roomier side exactly as a fixed
 * post stands (never an obstacle to ride into blind), facing back down the
 * road at the rider. Walked out along the canonical spine the way the rider
 * is travelling, from `minAheadMetres` to `maxAheadMetres` in 10 m steps, the
 * nearest spot that is:
 *
 * - at least `minStraightMetres` from the rider in a straight line (past the
 *   wake line, so he is placed asleep and silent, and never on a fold's
 *   other arm a few metres off);
 * - **framed by no human pane** (`framed`, `framedByAnyPane` bound by the
 *   caller) — no body appears where anyone is looking, the same predicate
 *   every return answers to; on a straight that puts him past the pane's far
 *   edge, round a bend it can be nearer;
 * - not occupied by another cop (`packSpacingMetres`);
 * - clear of every band across his width, on ground level with the road, no
 *   steeper downhill along his heading than a parked wheel holds, and allowed
 *   by the brain's own landing judge — a post's tests, for the same reasons.
 *
 * So the re-entry from the front is still q127's: a parked, visible cop the
 * rider rides toward, woken as the siren starts (`patrolWakeMetres`). What
 * the pass changed is *where*: ahead of him on the road he is riding, not a
 * third of the ring away. Allocates its answer (a demand is rare, not a step).
 */
export function chooseIntercept(
  spine: RouteSpine,
  blockers: readonly RouteBlocker[],
  ground: TerrainSampler,
  rider: { readonly x: number; readonly z: number; readonly headingY: number },
  near: number,
  others: readonly { readonly x: number; readonly z: number }[],
  framed: ((x: number, z: number) => boolean) | null,
  judge: PostJudge | null,
  tuning: {
    readonly minAheadMetres: number;
    readonly maxAheadMetres: number;
    readonly minStraightMetres: number;
    readonly postStandoffMetres: number;
    readonly packSpacingMetres: number;
    readonly riderHitRadius: number;
    readonly streetMargin: number;
    readonly holdSlope?: number;
  },
  canStand: ((post: PatrolPost) => boolean) | null = null,
): PatrolPost | null {
  const located = createSpineLocation();
  const here = createSpineSample();
  const underfoot = createGroundSample();
  const slopeSample = createGroundSample();
  spine.locate(rider.x, rider.z, near, located);
  if (near >= 0 && located.offRoute > 30) spine.locate(rider.x, rider.z, -1, located);
  const riderAt = located.distance;
  spine.sample(riderAt, here);
  const direction: 1 | -1 = Math.cos(rider.headingY - here.headingY) >= 0 ? 1 : -1;
  const length = spine.length;
  const holdSlope = tuning.holdSlope ?? postHoldSlope();
  const spacing = tuning.packSpacingMetres * tuning.packSpacingMetres;
  const hit = tuning.riderHitRadius;

  for (let ahead = tuning.minAheadMetres; ahead <= tuning.maxAheadMetres; ahead += INTERCEPT_STEP_METRES) {
    const raw = riderAt + direction * ahead;
    if (!spine.closed && (raw < 0 || raw > length)) break;
    spine.sample(raw, here);
    const distance = here.distance;
    if (Math.hypot(here.x - rider.x, here.z - rider.z) < tuning.minStraightMetres) continue;

    // The roomier side, as a post chooses it: the clearance to the nearest
    // band within 10 m along the line, capped by the corridor.
    const corridor = here.halfWidth + tuning.streetMargin;
    let roomLeft = corridor;
    let roomRight = corridor;
    for (const band of blockers) {
      if (band.to < distance - 10 || band.from > distance + 10) continue;
      if (band.left > 0) roomLeft = Math.min(roomLeft, Math.max(0, band.right));
      if (band.right < 0) roomRight = Math.min(roomRight, Math.max(0, -band.left));
    }
    const side: 1 | -1 = roomLeft > roomRight ? 1 : -1;
    const lateral = side * Math.min(tuning.postStandoffMetres, corridor - hit);
    const x = here.x + Math.cos(here.headingY) * lateral;
    const z = here.z - Math.sin(here.headingY) * lateral;

    let clear = true;
    for (const band of blockers) {
      if (band.to < distance - 2 || band.from > distance + 2) continue;
      if (band.right - hit < lateral && band.left + hit > lateral) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    ground.sampleGround(x, z, underfoot);
    if (Math.abs(underfoot.height - here.y) > POST_HEIGHT_TOLERANCE_METRES) continue;

    // Facing back down the road at the rider.
    const facing: 1 | -1 = direction > 0 ? -1 : 1;
    const headingY = wrapAngle(here.headingY + (facing < 0 ? Math.PI : 0));
    const forwardX = Math.sin(headingY) * POST_SLOPE_SPAN_METRES;
    const forwardZ = Math.cos(headingY) * POST_SLOPE_SPAN_METRES;
    ground.sampleGround(x + forwardX, z + forwardZ, slopeSample);
    const aheadHeight = slopeSample.height;
    ground.sampleGround(x - forwardX, z - forwardZ, slopeSample);
    if ((aheadHeight - slopeSample.height) / (2 * POST_SLOPE_SPAN_METRES) < -holdSlope) continue;

    let taken = false;
    for (let other = 0; other < others.length && !taken; other += 1) {
      const ox = others[other].x - x;
      const oz = others[other].z - z;
      taken = ox * ox + oz * oz <= spacing;
    }
    if (taken) continue;
    if (framed !== null && framed(x, z)) continue;
    if (judge !== null && judge(distance, facing) === null) continue;
    const candidate: PatrolPost = { index: -1, x, y: underfoot.height, z, headingY, distance, ringDistance: distance, side };
    // Dynamic occupancy is another refused rung, so search onward rather
    // than repeatedly selecting a temporarily occupied first answer.
    if (canStand !== null && !canStand(candidate)) continue;
    return candidate;
  }
  return null;
}

// -- The bearing readout (q220) ---------------------------------------------

/**
 * Relative bearing (radians, + = left, 0 = dead ahead) and range from a pose
 * to a point, written into `out` — the human cop's "eyes + bearing" readout
 * (q220). Allocation-free.
 */
export function bearingTo(
  from: { readonly x: number; readonly z: number; readonly headingY: number },
  to: { readonly x: number; readonly z: number },
  out: { bearing: number; range: number },
): { bearing: number; range: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  out.range = Math.sqrt(dx * dx + dz * dz);
  out.bearing = out.range === 0 ? 0 : wrapAngle(Math.atan2(dx, dz) - from.headingY);
  return out;
}
