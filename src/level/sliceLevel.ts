/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { MarkingPaint } from '../data/markings.ts';
import type { PropKind } from '../data/props.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import type { LevelPlan } from './plan.ts';
import { buildLevelPlan, type CheckpointSpec } from './buildPlan.ts';
import {
  facingRoute,
  placeGraph,
  querySegment,
  type PlacedProp,
  type PlacedSegment,
  type SegmentBlock,
  type SegmentBranch,
  type SegmentGraph,
  type SegmentMarking,
  type SegmentProp,
  type SegmentSpec,
} from './segments.ts';

/**
 * The vertical-slice level — M7, and the space the whole game is judged in.
 *
 * `docs/PLANS.md` §6 specifies it exactly: one compact, dense, connected
 * environment of roughly 350 m × 250 m and about three minutes of clean riding,
 * built from ten beats, with a fork whose alley shortcut is a real time save,
 * and three deliberate off-route pockets that reward curiosity. Density over
 * size, primitives and a heightfield only, and **authored as typed segments
 * with entry/exit sockets** — because these beats are also the seed library
 * M12's generator stitches, and a beat that composes cleanly here is a beat the
 * generator can reuse (§2.5).
 *
 * **This replaces the M4 proving ground as the shipped world, and does not
 * delete it.** The proving ground is still built, still tested, and still
 * reachable at `?level=proving` — see `levels.ts` for why, and
 * `docs/PLANS.md` §10 (M4 decision 5) for the question M7 was asked to answer.
 *
 * ## The ten beats
 *
 * | # | Beat | Segments | Teaches |
 * |---|---|---|---|
 * | 1 | City plaza start | `plaza` | accelerate, brake, carve safely |
 * | 2 | Boulevard | `boulevard-north`, `boulevard-bend` | carving at speed |
 * | 3 | Curb run | `curb-run` | hop up to cut a corner |
 * | 4 | The fork | `fork` + the `alley-*` branch | route choice with real risk |
 * | 5 | Park gate | `park-gate` | the city→park identity beat |
 * | 6 | Riverside path | `riverside`, `ford-in`, `ford-out`, `riverside-lower` | grass costs grip |
 * | 7 | Gravel spur | `gravel-spur` | wider turns, loose ground |
 * | 8 | Trailhead | `trailhead`, `berm` | terrain reading, momentum |
 * | 9 | The kicker | `kicker-run` + `kicker-land`, `chicken-*` | the jump; commitment |
 * | 10 | Return climb | `return-climb`, `return-plaza` | hill power, loop closure |
 *
 * ## The three off-route pockets
 *
 * `drain-*` — a concrete drainage swale beside the boulevard, one metre below
 * grade, with banks a rider can pump. `terrace-*` — a raised brick terrace off
 * the plaza carrying two low walls, one mountable and one that has to be
 * hopped. `alley-ledge` — a platform 0.55 m above the alley floor, which is
 * above an uncharged hop and under a charged one, walled off from the safe
 * route so the only way onto it is through the shortcut.
 *
 * ## The shape, and why it is a loop rather than a line
 *
 * The city runs north up one side, the fork's block turns it back at the top,
 * the park runs south down the other side, and the return climb closes the ring
 * into the plaza it started from. That separation is load-bearing rather than
 * scenic: 1,347 m of route inside a 260 m × 354 m footprint has to fold, and a
 * fold that puts two corridors on top of each other at different heights is a
 * cliff in the middle of a park. The two halves are kept on opposite sides of
 * the map so they never compete for the same ground.
 *
 * ## Elevation, in one place because it is easy to get wrong
 *
 * The city sits at 0 and the river valley six and a half metres below it, which
 * is what puts a real climb at the end of the loop rather than a flat run-in.
 * The plaza, boulevard, curb run, and fork are at 0; the safe sweep and the
 * alley both lose 0.90 m and meet the park gate at −0.90; the gate's ramp and
 * the riverside fall to −5.50, the ford dips to −6.05 and the river's low point
 * is −6.70; the gravel spur and the trailhead climb back to −5.00; and the
 * return climb lifts the whole five metres in 42 m, which is a ten-degree ramp
 * and the reason the power ladder has something to say on the way home.
 *
 * **The alley and the safe route lose the same 0.90 m by different means** —
 * the safe route eases it away over 217 m of sweeping road, the alley spends it
 * as three 0.30 m steps. Each step is above the wheel's derived step-up ceiling
 * (0.216 m) and above its drop-launch threshold, so every one of them is a
 * committed drop that cannot be ridden back up. That is the shortcut's risk,
 * and it is derived from the wheel rather than chosen.
 *
 * **One authored bank is worth naming**: where the riverside path passes the
 * foot of the return climb the two run about 0.40 m apart in height, so there
 * is a step between them. It is under the wheel's hop height (0.45 m) and over
 * its step-up ceiling, so it can be hopped and not rolled, it is on no required
 * route, and either path can be reached by going round. `sliceLevel.test.ts`
 * bounds it, so it cannot quietly grow into a wall.
 *
 * Nothing in this file may import three.js (invariant 1).
 */

// ---------------------------------------------------------------------------
// Numbers the layout depends on, named because they are load-bearing
// ---------------------------------------------------------------------------

/**
 * The kerb of `docs/PLANS.md` §6 beat 3, and of every kerb in the level.
 *
 * 0.15 m is a sidewalk, it is under the wheel's derived step-up ceiling
 * (`WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor` = 0.216 m), and it costs
 * 3 m/s to mount unhopped. One number rather than seven, so "the kerb" is a
 * thing the player learns once.
 */
const KERB = 0.15;

/**
 * The alley's three steps, in metres of drop each.
 *
 * Above the step-up ceiling, so they are one-way. Three of them spend the
 * 0.90 m the safe route eases away.
 */
const ALLEY_STEP = 0.30;
const ALLEY_DROP = ALLEY_STEP * 3;

/**
 * The kicker's rise and the height of its lip above the landing, metres.
 *
 * §6 beat 9 asks for "~1.2 m drop over a ~4 m gap". The mound rises 1.05 m as
 * heightfield — a ramp a wheel can climb — and the lip block adds the last
 * 0.15 m and juts four metres out over ground that is back at trail level. So
 * the drop off the end of the lip is exactly 1.20 m, and the gap is however far
 * the rider's own speed carries them: 5.2 m at 10 m/s, which is the four-metre
 * gap with the margin a blockout should have.
 *
 * The landing is deliberately **flat**, not a downslope. A 1.20 m fall closes
 * at 4.85 m/s along the normal against `EUC.landingImpactReference` of 5.0, so
 * a square landing scores just under `heavy` and a sloppy one crosses it —
 * which is a jump with a consequence, not a jump with a punishment.
 */
const KICKER_RISE = 1.05;
const KICKER_LIP = 0.15;

/** How far the lip juts out past the crest, metres. */
const KICKER_LIP_REACH = 4;

/**
 * Beat 4's geometry, in five numbers, because the fork has to *close*.
 *
 * The safe route and the alley are two paths between the same pair of sockets,
 * and a shortcut that lands a few metres off the road it rejoins is a seam the
 * player rides through. Rather than solve that numerically and bake the answer
 * in, the fork is authored as a shape that closes in closed form: the road runs
 * three sides of a rectangle and the alley cuts the fourth, so both are
 * right-angle turns about their own radii and the rejoin is exact by
 * construction.
 *
 * With the road's straights `P`, `Q`, `T` and its corner radius `R`, and the
 * alley's corner radius `r`, the alley's two straights are forced:
 *
 * ```text
 * S1 = 2R + Q - 2r        S2 = T - P
 * ```
 *
 * The numbers below then give a 217 m road against a 124 m alley. At the speeds
 * each actually sustains — the road is flat out on wide pavement, the alley is
 * held to about ten metres a second by its own walls — that is the four seconds
 * `docs/PLANS.md` §6 beat 4 asks for. `sliceLevel.test.ts` measures the closure
 * and `tests/m7.spec.ts` measures the times; neither is assumed here.
 */
const ROAD_LEAD = 36;
const ROAD_CROSS = 24;
const ROAD_IN = 50;
const ROAD_RADIUS = 34;
const ALLEY_RADIUS = 16;
/** A quarter turn, as a segment length. */
const quarter = (radius: number): number => (Math.PI * radius) / 2;
const ALLEY_SPINE = 2 * ROAD_RADIUS + ROAD_CROSS - 2 * ALLEY_RADIUS;
const ALLEY_EXIT_LENGTH = ROAD_IN - ROAD_LEAD;
/**
 * The spine is shared out between the walled run in, the three steps, and the
 * walled run out — and it is shared out here rather than written down three
 * times, so a change to the road's geometry cannot leave the alley landing
 * beside the gate instead of on it.
 */
const ALLEY_STEP_RUN = 9;
const ALLEY_UPPER_LENGTH = 22;
const ALLEY_RUN_LENGTH = ALLEY_SPINE - ALLEY_STEP_RUN - ALLEY_UPPER_LENGTH;

/**
 * The park loop's curvatures, and why they are not round numbers.
 *
 * **The route is a closed loop, and closure is three equations.** The return
 * ramp has to arrive inside the plaza it started from, at a heading the plaza
 * can accept, without any two corridors crossing at incompatible heights — and
 * once the city, the fork, and every beat's length are fixed, the only freedom
 * left is how the park's six curving beats share the turn. There is no reason
 * to expect the answer to be a whole number of metres, and rounding these to
 * one moves the ramp's exit twenty metres and puts it on the grass.
 *
 * So they are solved, and they are written down at full precision on purpose.
 * Every one of them is inside its own surface's grip at the speed that beat
 * actually sustains — the tightest is the gravel spur's 34.7 m, which at the
 * 10 m/s gravel supports is 2.9 m/s², or 0.29 g against gravel's 0.44 g
 * ceiling. `sliceLevel.test.ts` asserts both the closure and that bound, so a
 * later edit that breaks either fails at `node --test` rather than in a ride.
 *
 * This is also the shape M12 inherits: a generator laying a *route* rather than
 * a loop has no closure constraint at all, and can use whatever radius each
 * seed beat prefers.
 */
const PARK_CURVATURE = {
  riverside: 0.02445321044266501,
  riversideLower: 0.014970690955080213,
  gravelSpur: 0.02882828760562427,
  trailhead: 0.01105736715874174,
  returnClimb: -0.008477012636065782,
  returnPlaza: -0.004179113767108547,
} as const;

/**
 * The two lengths the closure solve also sets: the park gate's descent and the
 * kicker's landing run. Both are straights, so they move the loop's endpoint
 * without touching its total turn — which is what makes the solve well posed.
 */
const PARK_GATE_LENGTH = 59.71861586702758;
const KICKER_LAND_LENGTH = 31.946767110627512;

/** Wall height for anything meant to occlude the chase camera, metres. */
const WALL_HEIGHT = 3.4;

/**
 * The camera's obstruction probe runs from the rider's hip to the camera, so
 * nothing below about 1.3 m can ever intercept it — the finding the proving
 * ground's gateway cost (`docs/LESSONS_LEARNED.md`). Anything authored here as
 * a sight-line block is a `WALL_HEIGHT` box with real depth along the route;
 * anything shorter is furniture and is authored as furniture.
 */
const PIER_DEPTH = 3.2;

const TREE_TRUNK = 0.30;
const TREE_HEIGHT = 4.2;

/** A row of tree trunks down one side of a corridor. */
function trees(
  surface: SurfaceId,
  side: number,
  from: number,
  spacing: number,
  count: number,
): SegmentBlock[] {
  return Array.from({ length: count }, (_unused, index) => ({
    s: from + index * spacing,
    t: side,
    halfAlong: TREE_TRUNK,
    halfLateral: TREE_TRUNK,
    height: TREE_HEIGHT,
    surface,
    appearance: 'wood' as const,
  }));
}

// ---------------------------------------------------------------------------
// Dressing — M7.5
// ---------------------------------------------------------------------------

/**
 * The props, and the one thing that makes them different from everything above.
 *
 * M7 built the geometry and left the world empty; the owner rode it and said
 * the graphics look primitive. The diagnosis was not the shading. A 1,347 m
 * route ran through bare ground with nothing beside it: nothing gave the place
 * scale, nothing separated the city from the park except an albedo, and nothing
 * went past the camera fast enough to say how fast the wheel was going.
 *
 * **Every prop below is render-only and carries no collider** (`plan.ts`), so
 * the rider passes through one rather than being stopped by it. That is what
 * decides where they may go: on the **verges, the shoulders, and the surround**,
 * never carpeting a corridor. `sliceLevel.test.ts` sweeps every rideable
 * corridor and fails if a prop stands in one, because "go anywhere" is LOCKED
 * and a route the player has to thread through invisible-to-the-wheel furniture
 * is worse than an empty one.
 *
 * Everything here is placed **deterministically** — authored offsets, or an
 * integer hash of the position. Never `Math.random`: a world that differs
 * between boots makes every visual regression capture meaningless
 * (`DESIGN.md` §4 rule 3).
 */

/** A deterministic value in [0, 1). The mottle's hash, on two authored numbers. */
function noise01(a: number, b: number): number {
  let h = (Math.round(a * 71) * 374761393 + Math.round(b * 100) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** A deterministic value in [-1, 1). */
function signed(a: number, b: number): number {
  return noise01(a, b) * 2 - 1;
}

interface RowOptions {
  /** Base scale before the per-instance jitter. Default 1. */
  readonly scale?: number;
  /** Fractional scale jitter. Default 0.14 — enough to break the rhythm. */
  readonly vary?: number;
  /** Fixed yaw relative to the corridor. Omitted means "spun by the hash". */
  readonly yaw?: number;
  /** Lateral wander, metres. Default 0. */
  readonly wander?: number;
  /** Height above the ground, metres. */
  readonly lift?: number;
  /** Standing on a collider the level already has. See `SegmentProp`. */
  readonly onCollider?: boolean;
}

/** A row of one kind down one side of a corridor. */
function rowOf(
  kind: PropKind,
  t: number,
  from: number,
  spacing: number,
  count: number,
  options: RowOptions = {},
): SegmentProp[] {
  const vary = options.vary ?? 0.14;
  return Array.from({ length: count }, (_unused, index) => {
    const s = from + index * spacing;
    const seed = s + t * 3.7;
    return {
      s,
      t: t + (options.wander ?? 0) * signed(seed, 11),
      kind,
      yaw: options.yaw ?? noise01(seed, 23) * Math.PI * 2,
      scale: (options.scale ?? 1) * (1 + vary * signed(seed, 37)),
      ...(options.lift === undefined ? {} : { lift: options.lift }),
      ...(options.onCollider === true ? { onCollider: true } : {}),
    };
  });
}

/**
 * Crowns for a row of trunk colliders — **the same arguments `trees()` takes**.
 *
 * The level has had tree *trunks* since M7: 0.6 m boxes 4.2 m tall, solid,
 * which is why they are colliders. What they never had is a canopy, and a bare
 * post beside a road does not read as a tree. Rather than duplicate them as
 * props, the crown is a prop and the trunk stays the collider it always was —
 * so the thing the rider hits and the thing the player sees are the same tree.
 *
 * `sliceLevel.test.ts` asserts every trunk collider has a crown over it, which
 * is what keeps this call and its `trees()` call from drifting apart.
 */
function treeTops(side: number, from: number, spacing: number, count: number): SegmentProp[] {
  return rowOf('treeCanopy', side, from, spacing, count, {
    scale: 1.05,
    vary: 0.16,
    // The trunk beneath is the collider, so some of these are legitimately
    // inside a corridor — a street tree in a nine-metre plaza verge is.
    onCollider: true,
  });
}

/** The bay length `render/props.ts` builds, so a run has no gaps in it. */
const FENCE_BAY = 2.4;

/** A run of fence bays along a corridor's verge, whole bays only. */
function fenceRun(t: number, from: number, count: number): SegmentProp[] {
  return rowOf('fenceBay', t, from, FENCE_BAY, count, { yaw: 0, vary: 0.02 });
}

/** A lamp post facing the route from one verge, plus its neighbours down it. */
function lamps(t: number, from: number, spacing: number, count: number): SegmentProp[] {
  return rowOf('lampPost', t, from, spacing, count, { yaw: facingRoute(t), vary: 0.03 });
}

/** A bench and its bin, both facing the route. */
function seating(t: number, s: number): SegmentProp[] {
  return [
    { s, t, kind: 'bench', yaw: facingRoute(t), scale: 1 },
    { s: s + 2.6, t: t + Math.sign(t) * 0.4, kind: 'litterBin', yaw: 0, scale: 1 },
  ];
}

/** A signpost, which is how an off-route pocket says it is worth a look. */
function marker(s: number, t: number): SegmentProp {
  return { s, t, kind: 'signpost', yaw: facingRoute(t), scale: 1 };
}

/** A city block standing off the corridor, at a metric size. */
function block(s: number, t: number, size: Vec3, yaw = 0): SegmentProp {
  return { s, t, kind: 'building', yaw, scale: 1, size };
}

// ---------------------------------------------------------------------------
// Paint — M7.5 stage 4
// ---------------------------------------------------------------------------

/**
 * How far inside a corridor's edge an edge line runs, metres.
 *
 * Real edge lines sit a few centimetres off the kerb face. Eight tenths of a
 * metre here, for a reason that is about the level rather than about roads: a
 * corridor's declared half-width is where the *rideable* surface ends and the
 * shoulder begins, and the shoulder is ground the player is encouraged to use.
 * A line painted hard against that boundary would read as the edge of the
 * world, which is the opposite of what "go anywhere" is LOCKED to mean.
 */
const EDGE_LINE_INSET = 0.8;

/**
 * A broken line down a corridor's centre.
 *
 * `docs/PLANS.md` §6 beat 2 asks for painted lines and says what they teach:
 * *"lines as a speed cue"*. That is the same job the M1 debug grid did and the
 * ground mottle does (`DESIGN.md` §4), one scale up and in the fiction — at
 * 15 m/s the rider crosses two marks a second.
 */
function centreLine(length: number, paint: MarkingPaint = 'road'): SegmentMarking {
  return { path: [{ s: 0, t: 0 }, { s: length, t: 0 }], role: 'centre', broken: true, paint };
}

/** Solid edge lines down both sides of a corridor. */
function edgeLines(
  length: number,
  halfWidth: number,
  paint: MarkingPaint = 'road',
): SegmentMarking[] {
  const offset = halfWidth - EDGE_LINE_INSET;
  return [offset, -offset].map((t) => ({
    path: [{ s: 0, t }, { s: length, t }],
    role: 'edge' as const,
    paint,
  }));
}

/**
 * A bar across a corridor: a give-way line, or a threshold under a gateway.
 *
 * The one marking that runs across the direction of travel, which is exactly
 * why it reads as a *place* in the route rather than as a lane — a junction and
 * an arch are both moments, and a moment is a line you cross.
 */
function crossBar(s: number, halfSpan: number, paint: MarkingPaint = 'road'): SegmentMarking {
  return { path: [{ s, t: -halfSpan }, { s, t: halfSpan }], role: 'bar', paint };
}

/**
 * The wall on the inside of one of the alley's two right angles.
 *
 * **Two things went wrong here before it was three short boxes.** A wall on the
 * *outside* of the turn stands in the road the alley just left, because the
 * outside of a right-hand arc is where the straight road continues. And a
 * single long box tangent to a sixteen-metre arc bulges straight through the
 * corridor it is supposed to line: a 22 m chord across that radius cuts 3.8 m
 * inside it, which is more than the alley is wide. Both were found by riding,
 * and `sliceLevel.test.ts` now sweeps every corridor for exactly this.
 *
 * Three seven-metre boxes bulge 0.39 m each, which keeps their inner faces
 * clear of the corridor with room to spare.
 */
function alleyCornerWall(): SegmentBlock[] {
  const arc = quarter(ALLEY_RADIUS);
  return [0.18, 0.5, 0.82].map((fraction) => ({
    s: arc * fraction,
    t: -5.2,
    halfAlong: 3.5,
    halfLateral: 1.6,
    height: WALL_HEIGHT,
    surface: 'roughPavement' as const,
    appearance: 'stone' as const,
  }));
}

// ---------------------------------------------------------------------------
// Beats 1-4a: the city, and the fork
// ---------------------------------------------------------------------------

/**
 * Beat 1 — the city plaza.
 *
 * Brick, wide, and with nothing in the middle of it: the first thing a new
 * rider does is find the throttle, and a plaza that punishes that is a plaza
 * that teaches the wrong lesson first. The furniture is all off the centre
 * lane — bollards in two ranks that make a slalom for anyone who wants one, a
 * low fountain wall to carve around, benches along the flanks — and the two
 * exits are the arch at the far end (to the boulevard) and the open left side
 * (to the terrace pocket), which is `docs/PLANS.md` §6 beat 1's "two exits".
 *
 * **The arch is two piers and no lintel, and that is a constraint rather than a
 * choice.** `simulation/planSampler.ts` resolves a collider by its top face, so
 * a box the rider passes *under* would be read as ground three metres up. Every
 * overhead in the slice is therefore authored as its supports. Giving the plan
 * a render-only prop list would fix it and is not M7's brief.
 */
const PLAZA: SegmentSpec = {
  id: 'plaza',
  length: 54,
  halfWidth: 17,
  surface: 'brick',
  shoulder: 9,
  blocks: [
    // Two ranks of bollards, leaving an eight-metre central lane.
    ...[-9, -6.2, 6.2, 9].flatMap((t) => [12, 20].map((s) => ({
      s,
      t,
      halfAlong: 0.09,
      halfLateral: 0.09,
      height: 0.9,
      surface: 'brick' as const,
      appearance: 'metal' as const,
    }))),
    // The low fountain wall. Off the lane, tall enough to be furniture and too
    // short to occlude the camera, which is exactly what it is for.
    {
      s: 31, t: 11.5, halfAlong: 5.0, halfLateral: 1.2, height: 0.85,
      surface: 'brick', appearance: 'stone',
    },
    // Benches. Above the step-up ceiling, so they are obstacles rather than
    // features — a slow touch scrubs, while a square riding-speed hit takes
    // the rider off before the tyre can enter the bench.
    ...[-13.5, 13.5].flatMap((t) => [24, 38].map((s) => ({
      s,
      t,
      halfAlong: 1.1,
      halfLateral: 0.3,
      height: 0.45,
      surface: 'brick' as const,
      appearance: 'wood' as const,
    }))),
    // The checkpoint arch's piers, at the plaza's far end. Beat 10 returns
    // through them, which is what closes the loop.
    ...[1, -1].map((side) => ({
      s: 50,
      t: side * (4.5 + 5.5),
      halfAlong: PIER_DEPTH,
      halfLateral: 5.5,
      height: WALL_HEIGHT,
      surface: 'brick' as const,
      appearance: 'stone' as const,
    })),
  ],
  props: [
    // The bollards get a rounded finial. Eight 0.18 m posts with flat tops read
    // as offcuts; the cap is the same trick `DESIGN.md` §7 records about the
    // wheel's shoulder, at a twentieth of the size.
    ...[-9, -6.2, 6.2, 9].flatMap((t) => [12, 20].map((s) => ({
      s, t, kind: 'bollardCap' as const, yaw: 0, scale: 1, lift: 0.9, onCollider: true,
    }))),
    // Lamps, benches, and bins on the flanks, outside the 34 m square the rider
    // gets to find the throttle in. Nothing new stands inside it.
    ...lamps(19.5, 6, 12, 4),
    ...lamps(-19.5, 6, 12, 4),
    ...seating(20.5, 12),
    ...seating(20.5, 34),
    ...seating(-20.5, 12),
    ...seating(-20.5, 34),
    // Planters standing **on** the fountain's own wall, which was a bare
    // kerb-height slab. On the wall rather than beside it because beside it is
    // the middle of a 34 m plaza, and a rider crossing it would ride through
    // the planting.
    ...rowOf('shrub', 11.5, 27, 4, 3, {
      wander: 0.3, scale: 0.62, lift: 0.85, onCollider: true,
    }),
    // The trees that make the square a square rather than a paved field.
    ...rowOf('broadleafTree', 24, 4, 9, 6, { wander: 1.2 }),
    ...rowOf('broadleafTree', -24, 8, 9, 5, { wander: 1.2 }),
    // Beat 1's second exit, named. The terrace branch leaves at s 24 to the
    // left, and an off-route pocket nobody notices is not a pocket.
    marker(22, 19),
  ],
  // No lane paint in a square — the plaza's patterning is in the ground itself
  // (`data/surfaces.ts`, brick's paving module). What it gets is a threshold
  // across the arch, because beat 10 comes home through it and a checkpoint
  // nobody can see the line of is a checkpoint nobody aims at.
  markings: [crossBar(46.5, 4.2)],
};

/**
 * Beat 2 — the boulevard, in two segments because an S-curve is two arcs.
 *
 * Crowned, which is `docs/PLANS.md` §6's word and a real one: the fall to the
 * gutter is what puts a rider back toward the middle of the road when they stop
 * steering, and it is the first ground in the game that is not level under the
 * wheel. Ten centimetres over nine metres — under a degree, felt rather than
 * seen.
 */
const BOULEVARD_NORTH: SegmentSpec = {
  id: 'boulevard-north',
  length: 62,
  curvature: 1 / 95,
  halfWidth: 9,
  crown: 0.10,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    ...trees('pavement', 12.5, 8, 16, 3),
  ],
  props: [
    ...treeTops(12.5, 8, 16, 3),
    ...lamps(-11, 6, 20, 3),
    ...rowOf('broadleafTree', -15.5, 14, 20, 3, { wander: 1.5 }),
    ...rowOf('shrub', 18.5, 10, 9, 6, { wander: 1.6, scale: 1.15 }),
    ...seating(-11.5, 26),
    // The swale leaves to the left at s 6. It is a metre below grade and easy
    // to miss from the road, which is exactly what a signpost is for.
    marker(4, 11.5),
    // The city's mass, behind the verge and clear of the swale beyond it.
    block(20, -27, { x: 17, y: 14, z: 26 }),
    block(50, -26, { x: 14, y: 19, z: 20 }),
  ],
  // Beat 2's own brief: painted lines, and lines as a speed cue.
  markings: [centreLine(62), ...edgeLines(62, 9)],
};

const BOULEVARD_BEND: SegmentSpec = {
  id: 'boulevard-bend',
  length: 66,
  curvature: -1 / 95,
  halfWidth: 9,
  crown: 0.10,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    // The traffic island. A kerbed refuge in the middle of the road: mountable
    // at the kerb's ordinary cost, or split around at no cost at all.
    {
      s: 34, t: 0, halfAlong: 7, halfLateral: 1.8, height: KERB,
      surface: 'pavement', appearance: 'concrete',
    },
    // **A bollard at each end of it, and the owner's second ride is why.**
    // Fifteen centimetres of pale concrete lying in a grey road is, from the
    // chase camera, a slab of pavement somebody dropped there — he photographed
    // it on two separate rides and called it exactly that both times. Nothing
    // about the refuge was wrong except that it had no *height*: a low plate has
    // no silhouette, and `DESIGN.md` §7's whole argument is that silhouette is
    // what carries recognition at speed. A vertical at each end is the smallest
    // thing that gives it one.
    //
    // The plaza's own bollard, to the centimetre, rather than a new object — and
    // a block rather than a prop, because a *prop* solid inside a rideable
    // corridor is the thing this level refuses on principle (`sliceLevel.test.ts`,
    // "no derived solid reaches into a corridor either"). Authored corridor
    // geometry is how the plaza puts eight of these inside its own.
    //
    // The gameplay the island was authored for survives: they stand at the two
    // extreme ends, leaving eleven metres of clear top to mount, and 1.7 m of
    // island to either side of a 0.18 m post.
    ...[28.5, 39.5].map((s) => ({
      s,
      t: 0,
      halfAlong: 0.09,
      halfLateral: 0.09,
      // Above the island's own top, so the post stands *on* the refuge.
      height: KERB + 0.9,
      surface: 'pavement' as const,
      appearance: 'metal' as const,
    })),
    ...trees('pavement', -12.5, 10, 18, 3),
  ],
  props: [
    // The same finial the plaza's bollards get, for the same reason.
    ...[28.5, 39.5].map((s) => ({
      s, t: 0, kind: 'bollardCap' as const, yaw: 0, scale: 1, lift: KERB + 0.9,
      onCollider: true,
    })),
    ...treeTops(-12.5, 10, 18, 3),
    ...lamps(11, 8, 22, 3),
    ...rowOf('broadleafTree', 15.5, 18, 22, 2, { wander: 1.5 }),
    ...rowOf('shrub', -16.5, 8, 8, 7, { wander: 1.8, scale: 1.1 }),
    ...seating(11.5, 40),
    block(18, 26, { x: 16, y: 17, z: 24 }),
    block(52, 27, { x: 13, y: 12, z: 18 }),
    block(30, -26, { x: 18, y: 21, z: 22 }),
  ],
  // **Nobody authored the break around the traffic island.** The centre line is
  // written as the whole beat; the island is a collider, paint does not go on
  // colliders, and `buildPlan.ts` clips the run in two — which is the whole
  // argument for clipping rather than rejecting.
  markings: [centreLine(66), ...edgeLines(66, 9)],
};

/**
 * Beat 3 — the curb run.
 *
 * A 0.15 m sidewalk down the **inside** of a right-hand bend, in three lengths
 * with driveway gaps between them, which is what §6's "repeatedly" asks for.
 * The inside is the whole point: the sidewalk is a shorter line, so hopping up
 * onto it cuts the corner and rolling onto it unhopped costs 3 m/s.
 *
 * **§6's "and injects wobble" is now permanently unbuilt, and that is a
 * decision rather than a gap.** M6 added the wobble half; M13 removed it, with
 * every other trigger that was not a hazard the rider could see and avoid
 * (§13 q8). The speed cost is the beat, and it is enough of one: hopping is
 * still the faster line through here.
 */
const CURB_RUN: SegmentSpec = {
  id: 'curb-run',
  length: 72,
  curvature: -1 / 150,
  halfWidth: 8.5,
  crown: 0.08,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    ...[13, 38, 61].map((s, index) => ({
      s,
      t: -6.6,
      halfAlong: [10, 11, 8][index],
      halfLateral: 2.4,
      height: KERB,
      surface: 'pavement' as const,
      appearance: 'concrete' as const,
    })),
    ...trees('pavement', 12, 12, 20, 3),
  ],
  props: [
    ...treeTops(12, 12, 20, 3),
    ...lamps(-11, 10, 24, 3),
    // A fence the whole length of the kerb side. Seventy metres of repeating
    // vertical at 2.4 m spacing is the strongest speed cue in the level — the
    // job the M1 debug grid used to do, in the fiction rather than over it.
    ...fenceRun(-13, 5, 25),
    ...rowOf('shrub', -16, 8, 7, 8, { wander: 1.5 }),
    ...rowOf('broadleafTree', 16.5, 16, 18, 3, { wander: 1.6 }),
    block(24, 26, { x: 20, y: 15, z: 30 }),
    block(60, 27, { x: 15, y: 22, z: 20 }),
  ],
  markings: [
    centreLine(72),
    // Only the road side takes the corridor's own edge. The sidewalk side gets
    // its line at the kerb face instead of eight tenths inside the corridor,
    // because the kerb is where that road actually ends — the corridor
    // continues over the top of it, which is the entire beat.
    { path: [{ s: 0, t: 7.7 }, { s: 72, t: 7.7 }], role: 'edge' },
    // The bend turns the sidewalk's rectangular collider very slightly across
    // the tangent near each driveway end. A 25 cm roadward allowance keeps the
    // finished ribbon plus its clearance off those corners.
    { path: [{ s: 0, t: -3.35 }, { s: 72, t: -3.35 }], role: 'edge' },
  ],
};

/**
 * Beat 4 — the fork.
 *
 * A short, wide junction on rough pavement, walled on the right by the block
 * the alley cuts through. The safe route sweeps left-then-right around that
 * block over 175 m; the alley goes straight into it and comes out 105 m later
 * at the same place. Both are authored; neither is preferred by the geometry.
 */
const FORK: SegmentSpec = {
  id: 'fork',
  length: 26,
  halfWidth: 11,
  surface: 'roughPavement',
  shoulder: 7,
  blocks: [
    // **The frontage opposite the alley, not beside it.** The alley leaves to
    // the rider's right, so anything solid on that side is a wall across the
    // shortcut's own mouth — the gap in the block *is* the alley. What makes the
    // fork read as a fork is the building on the far side of the junction.
    {
      s: 20, t: 14, halfAlong: 8, halfLateral: 4, height: WALL_HEIGHT,
      surface: 'roughPavement', appearance: 'stone',
    },
  ],
  props: [
    // The junction says it is a junction: a signpost on each side, one of them
    // at the alley's mouth. Beat 4 is a route choice, and a route choice the
    // player does not see is a route choice they do not make.
    marker(6, 12),
    marker(10, -12),
    ...lamps(13, 4, 18, 2),
    ...lamps(-13, 6, 16, 2),
    block(20, 25, { x: 19, y: 16, z: 17 }),
  ],
  // A junction is a moment rather than a lane, so it gets a bar rather than a
  // line. It is also the last paint before the alley, which has none.
  markings: [crossBar(3.5, 9.5)],
};

// ---------------------------------------------------------------------------
// Beat 4b: the safe route, and beats 5-10
// ---------------------------------------------------------------------------

/**
 * The safe route: three sides of the block the alley cuts through.
 *
 * `docs/PLANS.md` §6 calls it "wide sweeping right to the park gate", and the
 * two corners are what make it sweeping — 34 m of radius is 0.67 g at the
 * wheel's 15 m/s top speed, just inside pavement's 0.75 g ceiling, so the road
 * is flat out for a committed rider and forgiving for a careful one. It loses
 * the same 0.90 m the alley spends on steps, eased across all five segments so
 * no socket in it reports a gradient the next one has to match.
 */
const ROAD_LEAD_SPEC: SegmentSpec = {
  id: 'road-lead',
  length: ROAD_LEAD,
  halfWidth: 8.5,
  crown: 0.08,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    // Frontage on the road's LEFT, for the same reason as the fork's: the block
    // the alley cuts through is on the right, and the alley is the hole in it.
    {
      s: 18, t: 13.5, halfAlong: 17, halfLateral: 4, height: WALL_HEIGHT,
      surface: 'pavement', appearance: 'stone',
    },
  ],
  props: [
    // Blocks standing behind the frontage, so the wall reads as the foot of a
    // building rather than as a slab in a field. This is the whole reason the
    // city half of the level looked like a diagram.
    block(10, 25, { x: 15, y: 21, z: 16 }),
    block(28, 26, { x: 17, y: 15, z: 18 }),
    ...lamps(-11, 8, 18, 2),
    ...rowOf('shrub', -14, 6, 8, 4, { wander: 1.4 }),
  ],
  markings: [centreLine(ROAD_LEAD), ...edgeLines(ROAD_LEAD, 8.5)],
};

const ROAD_CORNER_A: SegmentSpec = {
  id: 'road-corner-a',
  length: quarter(ROAD_RADIUS),
  curvature: -1 / ROAD_RADIUS,
  halfWidth: 8.5,
  crown: 0.08,
  climb: -0.42,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    ...trees('pavement', 11.5, 8, 12, 4),
  ],
  props: [
    ...treeTops(11.5, 8, 12, 4),
    ...lamps(-11.5, 10, 16, 3),
    ...rowOf('shrub', -15, 6, 7, 6, { wander: 1.5 }),
    block(14, 24, { x: 18, y: 18, z: 20 }),
    block(40, 25, { x: 16, y: 13, z: 24 }),
  ],
  markings: [
    centreLine(quarter(ROAD_RADIUS)),
    ...edgeLines(quarter(ROAD_RADIUS), 8.5),
  ],
};

const ROAD_CROSS_SPEC: SegmentSpec = {
  id: 'road-cross',
  length: ROAD_CROSS,
  halfWidth: 8.5,
  crown: 0.08,
  climb: -0.12,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    {
      s: 12, t: -13.5, halfAlong: 11, halfLateral: 4, height: WALL_HEIGHT,
      surface: 'pavement', appearance: 'stone',
    },
  ],
  props: [
    block(12, -25, { x: 16, y: 20, z: 22 }),
    ...lamps(11, 6, 14, 2),
    ...rowOf('shrub', 14, 4, 6, 4, { wander: 1.2 }),
  ],
  markings: [centreLine(ROAD_CROSS), ...edgeLines(ROAD_CROSS, 8.5)],
};

const ROAD_CORNER_B: SegmentSpec = {
  id: 'road-corner-b',
  length: quarter(ROAD_RADIUS),
  curvature: -1 / ROAD_RADIUS,
  halfWidth: 8.5,
  crown: 0.08,
  climb: -0.24,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    ...trees('pavement', 11.5, 8, 12, 4),
  ],
  props: [
    ...treeTops(11.5, 8, 12, 4),
    ...lamps(-11.5, 8, 16, 3),
    ...rowOf('shrub', 15, 8, 8, 5, { wander: 1.5 }),
    block(16, -24, { x: 17, y: 16, z: 21 }),
    block(42, -25, { x: 14, y: 23, z: 18 }),
  ],
  markings: [
    centreLine(quarter(ROAD_RADIUS)),
    ...edgeLines(quarter(ROAD_RADIUS), 8.5),
  ],
};

const ROAD_IN_SPEC: SegmentSpec = {
  id: 'road-in',
  length: ROAD_IN,
  halfWidth: 8.5,
  crown: 0.06,
  climb: -0.12,
  surface: 'pavement',
  shoulder: 7,
  blocks: [
    {
      s: 26, t: 13.5, halfAlong: 24, halfLateral: 4, height: WALL_HEIGHT,
      surface: 'pavement', appearance: 'stone',
    },
  ],
  props: [
    block(14, 25, { x: 18, y: 19, z: 24 }),
    block(40, 26, { x: 15, y: 14, z: 22 }),
    ...lamps(-11, 8, 15, 3),
    ...fenceRun(-12.5, 6, 15),
    ...rowOf('shrub', -15, 10, 8, 5, { wander: 1.4 }),
    // The city ends here. The park gate is the next socket, and this is the
    // last thing the rider passes that is made of pavement and frontage.
    marker(44, -10.5),
  ],
  markings: [centreLine(ROAD_IN), ...edgeLines(ROAD_IN, 8.5)],
};

/**
 * Beat 5 — the park gate.
 *
 * The city→park identity beat, and it has to read as a transition rather than
 * as a change of albedo. Four things change at once: the road narrows from 8 m
 * of half-width to 5, the gate piers put something solid on both sides of the
 * sight line, the trees start, and the first grass shoulders appear as bands
 * inside the corridor rather than as the surround beyond it — so the grass is
 * ground the rider can choose, not ground they have fallen off onto.
 */
const PARK_GATE: SegmentSpec = {
  id: 'park-gate',
  length: PARK_GATE_LENGTH,
  halfWidth: 8,
  climb: -2.6,
  surface: 'pavement',
  shoulder: 12,
  bands: [
    { from: 5.2, to: 8, surface: 'grass' },
    { from: -8, to: -5.2, surface: 'grass' },
  ],
  blocks: [
    // **A narrow passage with depth, not a doorway in a thin wall.** The chase
    // camera follows the rider through whatever gap they went through and swings
    // to the outside of a turn, so a wide opening never gets between the two —
    // the finding the proving ground's gateway cost
    // (`docs/LESSONS_LEARNED.md`). A 4.8 m gap through 6.4 m of passage does,
    // and a park gate is a thing a rider is supposed to aim at.
    ...[1, -1].map((side) => ({
      s: 12,
      t: side * (2.4 + 4.2),
      halfAlong: PIER_DEPTH,
      halfLateral: 4.2,
      height: WALL_HEIGHT,
      surface: 'pavement' as const,
      appearance: 'stone' as const,
    })),
    ...trees('pavement', 9.5, 20, 7, 3),
    ...trees('pavement', -9.5, 23, 7, 3),
  ],
  props: [
    ...treeTops(9.5, 20, 7, 3),
    ...treeTops(-9.5, 23, 7, 3),
    // The identity beat, dressed as one. Four things already change at the gate
    // — width, piers, trees, grass bands — and this is the fifth: the street
    // furniture stops and the planting starts.
    ...lamps(9.5, 6, 0, 1),
    ...lamps(-9.5, 6, 0, 1),
    ...rowOf('broadleafTree', 13.5, 26, 11, 3, { wander: 1.6 }),
    ...rowOf('broadleafTree', -13.5, 30, 11, 3, { wander: 1.6 }),
    ...rowOf('conifer', 18, 18, 13, 3, { wander: 2 }),
    ...rowOf('conifer', -18, 24, 13, 3, { wander: 2 }),
    ...rowOf('shrub', 11, 16, 6, 7, { wander: 1.4, scale: 1.1 }),
    ...rowOf('shrub', -11, 19, 6, 7, { wander: 1.4, scale: 1.1 }),
    ...seating(-10.5, 34),
    marker(8, 9.5),
  ],
  // **The paint changes at the gate, and that is the fifth thing that changes
  // here.** The city's maintained white gives way to the park's duller line
  // (`data/markings.ts`), no edge lines follow it in, and the run breaks
  // through the piers on its own because they are colliders. A rider should be
  // able to feel they have left the city without being told so.
  markings: [centreLine(PARK_GATE_LENGTH, 'path')],
};

/**
 * Beat 6 — the riverside path, in four segments.
 *
 * Grass shoulders on both sides for its whole length, which makes every corner
 * a choice: the inside line is shorter and crosses grass, where the lateral
 * ceiling falls from 0.75 g to 0.53 g and rolling resistance is eight times
 * pavement's. The ford is the beat's second question — a wooden deck at path
 * level over a gully half a metre deep, so a rider can take the bridge, or drop
 * into the ford and need a **charged** hop (0.63 m against 0.45 m) to get back
 * up onto the deck.
 */
const RIVERSIDE: SegmentSpec = {
  id: 'riverside',
  length: 78,
  curvature: PARK_CURVATURE.riverside,
  halfWidth: 4.6,
  climb: -2.0,
  surface: 'pavement',
  shoulder: 11,
  bands: [
    { from: 3.2, to: 5.4, surface: 'grass' },
    { from: -5.4, to: -3.2, surface: 'grass' },
  ],
  blocks: [
    ...trees('pavement', 7, 12, 15, 5),
  ],
  props: [
    ...treeTops(7, 12, 15, 5),
    // The river side gets the fence and the park side gets the planting, so
    // the two edges of a 9 m path are told apart at a glance.
    ...fenceRun(-6.4, 6, 27),
    ...lamps(-8.5, 14, 26, 3),
    ...seating(8, 22),
    ...seating(8, 62),
    ...rowOf('conifer', 12, 6, 12, 6, { wander: 2.4 }),
    ...rowOf('conifer', -12, 10, 14, 5, { wander: 2.4 }),
    ...rowOf('shrub', 9, 8, 5, 13, { wander: 1.6, scale: 1.2 }),
    ...rowOf('shrub', -9.5, 12, 7, 9, { wander: 1.6, scale: 1.2 }),
  ],
  // A shared path gets a centre line and nothing else. Its own grass bands sit
  // inside the corridor, so an edge line here would be painted on turf — which
  // is exactly the case `PAINTABLE_SURFACES` exists to catch, and the reason
  // the check is against the finished heightfield rather than the corridor.
  markings: [centreLine(78, 'path')],
};

const FORD_IN: SegmentSpec = {
  id: 'ford-in',
  length: 15,
  halfWidth: 5.4,
  climb: -0.55,
  surface: 'dirt',
  shoulder: 10,
  blocks: [
    // The bridge. One deck spanning both halves of the gully from the segment
    // it starts on: its top face is flat, the corridor beneath it falls 0.5 m
    // and comes back, so the deck is flush with the path at both ends and half
    // a metre above the ford floor in the middle. Wood is ridden here and
    // nowhere else.
    {
      s: 15, t: 0, halfAlong: 15, halfLateral: 3.2, height: 0.55, depth: 1.5,
      surface: 'wood', appearance: 'wood',
    },
    // Railings, on the deck rather than beside it.
    ...[1, -1].map((side) => ({
      s: 15,
      t: side * 3.05,
      halfAlong: 14,
      halfLateral: 0.12,
      height: 1.1,
      surface: 'wood' as const,
      appearance: 'wood' as const,
    })),
  ],
  props: [
    // The bridge-or-ford choice, marked. Both are rideable and one of them
    // needs a charged hop to leave, which is worth a sign.
    marker(3, 7),
    ...rowOf('shrub', 7.5, 2, 3.5, 4, { wander: 1.2, scale: 1.3 }),
    ...rowOf('shrub', -7.5, 3, 3.5, 4, { wander: 1.2, scale: 1.3 }),
    ...rowOf('conifer', 12, 4, 9, 2, { wander: 2 }),
  ],
};

const FORD_OUT: SegmentSpec = {
  id: 'ford-out',
  length: 15,
  halfWidth: 5.4,
  climb: 0.55,
  surface: 'dirt',
  shoulder: 10,
  props: [
    ...rowOf('shrub', 7.5, 2, 3.5, 4, { wander: 1.2, scale: 1.3 }),
    ...rowOf('shrub', -7.5, 3, 3.5, 4, { wander: 1.2, scale: 1.3 }),
    ...rowOf('conifer', -12, 5, 9, 2, { wander: 2 }),
  ],
};

const RIVERSIDE_LOWER: SegmentSpec = {
  id: 'riverside-lower',
  length: 56,
  curvature: PARK_CURVATURE.riversideLower,
  halfWidth: 5.4,
  climb: -1.2,
  surface: 'pavement',
  shoulder: 11,
  bands: [
    { from: 3.2, to: 5.4, surface: 'grass' },
    { from: -5.4, to: -3.2, surface: 'grass' },
  ],
  blocks: [
    ...trees('pavement', -7, 8, 16, 4),
  ],
  props: [
    ...treeTops(-7, 8, 16, 4),
    ...fenceRun(6.4, 5, 20),
    ...lamps(8.5, 12, 22, 2),
    ...seating(-8, 30),
    ...rowOf('conifer', -11.5, 6, 13, 4, { wander: 2.4 }),
    ...rowOf('conifer', 12, 9, 13, 4, { wander: 2.4 }),
    ...rowOf('shrub', -9.5, 7, 6, 8, { wander: 1.6, scale: 1.2 }),
  ],
};

/**
 * Beat 7 — the gravel spur.
 *
 * The access road to the trailhead: wide, loose, and climbing gently back out
 * of the valley. Gravel's grip of 0.58 puts the lateral ceiling at 0.44 g, so
 * the corner here has to be taken far wider than the same corner on pavement —
 * and gravel never reaches the pedal-strike angle, so the limit the rider meets
 * on this surface is grip rather than clearance.
 */
const GRAVEL_SPUR: SegmentSpec = {
  id: 'gravel-spur',
  length: 60,
  curvature: PARK_CURVATURE.gravelSpur,
  halfWidth: 6.5,
  climb: 0.9,
  surface: 'gravel',
  shoulder: 10,
  blocks: [
    {
      s: 30, t: 8.4, halfAlong: 1.4, halfLateral: 1.1, height: 0.85,
      surface: 'gravel', appearance: 'stone',
    },
  ],
  props: [
    // An access road at the bottom of the valley: no lamps, no benches, no
    // paving. Conifers on both sides and a trailhead sign, and that is all a
    // gravel spur has.
    marker(6, 8.5),
    ...rowOf('conifer', 10, 6, 11, 5, { wander: 2.6 }),
    ...rowOf('conifer', -10, 10, 11, 5, { wander: 2.6 }),
    ...rowOf('shrub', 8, 8, 7, 7, { wander: 1.8, scale: 1.25 }),
    ...rowOf('shrub', -8, 5, 7, 7, { wander: 1.8, scale: 1.25 }),
  ],
};

/**
 * Beat 8 — the trailhead, then the berm.
 *
 * Narrowing dirt with roots across it: six low blocks at 0.10 m, which is under
 * the kerb threshold's own reading of a step but still a step, so they roll at
 * speed and cost at walking pace. Two rocks either side of the derived step-up
 * ceiling — 0.18 m rolls, 0.30 m does not and has to be ridden around, which is
 * the same pairing the proving ground uses and the one M4's evidence settled.
 */
const TRAILHEAD: SegmentSpec = {
  id: 'trailhead',
  length: 66,
  curvature: PARK_CURVATURE.trailhead,
  halfWidth: 4.6,
  climb: 0.8,
  surface: 'dirt',
  shoulder: 10,
  blocks: [
    // Roots. Angled across the trail by riding on a curved segment, which yaws
    // them with the corridor for free.
    ...[16, 22, 28, 44, 50, 56].map((s, index) => ({
      s,
      t: index % 2 === 0 ? -0.8 : 0.9,
      halfAlong: 0.18,
      halfLateral: 2.6,
      height: 0.10,
      surface: 'dirt' as const,
      appearance: 'wood' as const,
    })),
    {
      s: 34, t: -2.2, halfAlong: 0.75, halfLateral: 0.75, height: 0.30,
      surface: 'dirt', appearance: 'stone',
    },
    {
      s: 64, t: 2.0, halfAlong: 0.6, halfLateral: 0.6, height: 0.18,
      surface: 'dirt', appearance: 'stone',
    },
  ],
  props: [
    // Woods. The densest planting in the level, on the narrowest corridor —
    // which is what makes a 9.2 m trail feel like a trail rather than a strip
    // of brown ground. Everything is off the corridor and off its verge.
    ...rowOf('conifer', 7.5, 4, 7, 9, { wander: 1.8 }),
    ...rowOf('conifer', -7.5, 8, 7, 8, { wander: 1.8 }),
    ...rowOf('conifer', 12, 6, 11, 5, { wander: 2.6, scale: 1.15 }),
    ...rowOf('conifer', -12, 12, 11, 4, { wander: 2.6, scale: 1.15 }),
    ...rowOf('shrub', 6, 5, 5, 12, { wander: 1.2, scale: 1.2 }),
    ...rowOf('shrub', -6, 7, 5, 11, { wander: 1.2, scale: 1.2 }),
    marker(4, 6),
  ],
};

/**
 * The bermed left-hander.
 *
 * §6 beat 8's one banked corner, and the only place in the slice where the
 * ground helps. A 26 m radius at 10 m/s is 3.85 m/s² — 0.39 g against dirt's
 * 0.60 g ceiling — and the bank tips the rider 0.20 rad into it, so the corner
 * can be carried faster than a flat one of the same radius and, ridden badly,
 * spits the rider up the bank and off the outside.
 *
 * A **negative** cross-slope raises the rider's right, which is the outside of
 * a left-hand turn. Derived from the axis facts rather than eyeballed, per
 * `AGENTS.md`.
 */
const BERM: SegmentSpec = {
  id: 'berm',
  length: 34,
  curvature: 1 / 26,
  halfWidth: 4.6,
  crossSlope: -0.20,
  surface: 'dirt',
  shoulder: 10,
  props: [
    // Nothing on the outside of the bank a rider gets spat up. Trees on the
    // inside, where a rider who overcooks it never goes.
    ...rowOf('conifer', 8, 4, 8, 4, { wander: 1.8 }),
    ...rowOf('shrub', 6.5, 6, 5, 6, { wander: 1.2, scale: 1.2 }),
    ...rowOf('conifer', -13, 6, 10, 3, { wander: 2.4, scale: 1.1 }),
  ],
};

/**
 * Beat 9 — the kicker, as a mound with a lip.
 *
 * The mound is heightfield, so a wheel climbs it; the lip is a block, so a
 * wheel leaves it. Riding off the end of the lip is a 1.20 m drop onto flat
 * ground four metres out, which at any speed above walking pace is a real jump
 * — and `EucController` cannot be launched by a gradient at any steepness, so
 * the ramp on its own would never have thrown anybody. The block is the beat.
 */
const KICKER_RUN: SegmentSpec = {
  id: 'kicker-run',
  length: 34,
  halfWidth: 4.4,
  climb: KICKER_RISE,
  surface: 'dirt',
  shoulder: 5,
  blocks: [
    {
      s: 34,
      t: 0,
      halfAlong: KICKER_LIP_REACH,
      halfLateral: 3.0,
      height: KICKER_LIP,
      // Deep enough to reach below the landing corridor, so the overhang reads
      // as a buttress of packed dirt rather than as a slab hanging in the air.
      depth: 1.9,
      surface: 'dirt',
      appearance: 'dirt',
    },
  ],
  props: [
    // **The one beat that is dressed by what is not on it.** The kicker's
    // approach, its lip, its landing, and the chicken line beside it all stay
    // clear: a jump the rider commits to at speed is the last place in the
    // level to put something they might read as an obstacle. Everything is
    // beyond the chicken line's own corridor, on the far side.
    ...rowOf('conifer', -11, 6, 10, 3, { wander: 2 }),
    ...rowOf('shrub', -8, 4, 7, 4, { wander: 1.4, scale: 1.2 }),
    ...rowOf('conifer', 20, 8, 11, 2, { wander: 2.4 }),
  ],
};

/** Beat 9's landing, and beat 10's climb, which continue from the lip. */
const KICKER_LAND: SegmentSpec = {
  id: 'kicker-land',
  length: KICKER_LAND_LENGTH,
  halfWidth: 5.4,
  surface: 'dirt',
  shoulder: 5,
  blocks: [
    {
      s: 24, t: 7.4, halfAlong: 1.2, halfLateral: 1.0, height: 0.9,
      surface: 'dirt', appearance: 'stone',
    },
  ],
  props: [
    ...rowOf('conifer', -11, 5, 9, 3, { wander: 2 }),
    ...rowOf('conifer', -16, 12, 11, 2, { wander: 2.4, scale: 1.15 }),
    ...rowOf('shrub', -8.5, 8, 7, 4, { wander: 1.4, scale: 1.2 }),
  ],
};

/**
 * Beat 10 — the return climb.
 *
 * Rough pavement out of the valley and back to the plaza's arch. The gradient
 * is what the power ladder was built for: `EUC.powerSlopeLoad` scaled by speed
 * means a settled climb sits in the amber rung and charging it from speed spikes
 * into tilt-back, which is where the M6 exit question was asked.
 */
const RETURN_CLIMB: SegmentSpec = {
  id: 'return-climb',
  length: 42,
  curvature: PARK_CURVATURE.returnClimb,
  halfWidth: 7,
  climb: 5.0,
  surface: 'roughPavement',
  shoulder: 7,
  blocks: [
    {
      s: 21, t: -10.5, halfAlong: 20, halfLateral: 3, height: WALL_HEIGHT,
      surface: 'roughPavement', appearance: 'stone',
    },
  ],
  props: [
    // The city coming back. The climb runs out of the park, so the planting
    // gives way to lamps and blocks over its 42 m — the reverse of the gate.
    ...lamps(9, 6, 14, 3),
    ...rowOf('conifer', 13, 4, 12, 2, { wander: 2 }),
    ...rowOf('broadleafTree', 12, 30, 12, 2, { wander: 1.6 }),
    block(14, -21, { x: 16, y: 13, z: 20 }),
    block(34, -22, { x: 14, y: 18, z: 16 }),
  ],
  // The city coming back, in paint as well as in planting: the park's line
  // stops at the foot of the climb and the road's picks it up.
  markings: [
    centreLine(42),
    // The first few centimetres overlap the park path's grass-edged join. The
    // road edges begin once the whole ribbon is back on rough pavement.
    ...edgeLines(41.7, 7).map((marking) => ({
      ...marking,
      path: marking.path.map((point) => ({ ...point, s: point.s + 0.3 })),
    })),
  ],
};

const RETURN_PLAZA: SegmentSpec = {
  id: 'return-plaza',
  length: 40,
  curvature: PARK_CURVATURE.returnPlaza,
  halfWidth: 7,
  surface: 'roughPavement',
  shoulder: 7,
  props: [
    ...lamps(9.5, 8, 14, 3),
    ...lamps(-9.5, 14, 14, 2),
    ...rowOf('broadleafTree', 13, 6, 13, 3, { wander: 1.6 }),
    ...rowOf('broadleafTree', -13, 12, 13, 2, { wander: 1.6 }),
    ...seating(10, 22),
    block(20, 24, { x: 15, y: 16, z: 22 }),
    block(12, -24, { x: 17, y: 12, z: 18 }),
  ],
  markings: [centreLine(40), ...edgeLines(40, 7)],
};

// ---------------------------------------------------------------------------
// The alley — beat 4's shortcut
// ---------------------------------------------------------------------------

/**
 * The alley's mouth: a right-angle turn off the road at sixteen metres.
 *
 * Half the fork's width and a third of the boulevard's. At 2.9 m of half-width
 * there is room to carve and no room to be careless, and the corner's radius is
 * what actually caps the shortcut's speed: 16 m is 0.64 g at 10 m/s against
 * rough pavement's 0.69 g ceiling, so this is a corner taken at ten metres a
 * second by a rider who commits and scrubbed into the wall by one who does not.
 */
const ALLEY_MOUTH: SegmentSpec = {
  id: 'alley-mouth',
  length: quarter(ALLEY_RADIUS),
  curvature: -1 / ALLEY_RADIUS,
  halfWidth: 2.9,
  surface: 'roughPavement',
  shoulder: 2,
  blocks: [...alleyCornerWall()],
  props: [
    // **Everything in the alley stands behind its walls.** The corridor is
    // 5.8 m wide and a rider uses all of it, so a bin against the wall would be
    // a bin the wheel goes through at ten metres a second. Lamps behind the
    // 3.4 m walls put their heads over the top, which lights the alley in the
    // only way a prop with no collider safely can.
    ...lamps(-7.4, 6, 12, 2),
    ...rowOf('shrub', 7.5, 8, 7, 3, { wander: 1.2 }),
  ],
};

/** The walled run up to the steps. */
const ALLEY_UPPER: SegmentSpec = {
  id: 'alley-upper',
  length: ALLEY_UPPER_LENGTH,
  halfWidth: 2.9,
  surface: 'roughPavement',
  shoulder: 2,
  blocks: [
    ...[1, -1].map((side) => ({
      s: ALLEY_UPPER_LENGTH / 2,
      t: side * 4.6,
      halfAlong: ALLEY_UPPER_LENGTH / 2,
      halfLateral: 1.6,
      height: WALL_HEIGHT,
      surface: 'roughPavement' as const,
      appearance: 'stone' as const,
    })),
  ],
  props: [
    ...lamps(7.2, 5, 12, 2),
    ...lamps(-7.2, 11, 0, 1),
    // The ledge leaves to the left at fourteen metres, half a metre up. It is
    // the pocket only the shortcut can reach, so it gets the only sign in here.
    marker(11, 6.9),
  ],
};

/**
 * The three-step drop.
 *
 * The corridor falls 0.90 m linearly over nine metres and three level blocks
 * stand on it, each one 0.15 m proud of the ramp beneath. The rider therefore
 * rides three 0.30 m steps rather than a 5.7° slope — and 0.30 m is above the
 * derived step-up ceiling, so the alley is one-way in the middle. A rider who
 * comes at it from the park has to go around, which is the price of a shortcut
 * that saves four seconds.
 */
const ALLEY_STEPS: SegmentSpec = {
  id: 'alley-steps',
  length: ALLEY_STEP_RUN,
  linearClimb: true,
  climb: -ALLEY_DROP,
  halfWidth: 2.9,
  surface: 'roughPavement',
  shoulder: 2,
  blocks: [
    ...[0, 1, 2].map((index) => ({
      s: 1.5 + index * 3,
      t: 0,
      halfAlong: 1.5,
      halfLateral: 2.9,
      // The ramp has fallen (index + 0.5) × 0.30 by the block's centre, and the
      // block's top has to sit at the level of the step above it: index × 0.30
      // below the alley's upper floor. The difference is always half a step.
      height: ALLEY_STEP / 2,
      surface: 'roughPavement' as const,
      appearance: 'concrete' as const,
    })),
    ...[1, -1].map((side) => ({
      s: ALLEY_STEP_RUN / 2,
      t: side * 4.6,
      halfAlong: ALLEY_STEP_RUN / 2,
      halfLateral: 1.6,
      height: WALL_HEIGHT,
      surface: 'roughPavement' as const,
      appearance: 'stone' as const,
    })),
  ],
  props: [
    ...lamps(-7.2, 4.5, 0, 1),
  ],
};

/** The walled run below the steps, out to the dogleg. */
const ALLEY_RUN: SegmentSpec = {
  id: 'alley-run',
  length: ALLEY_RUN_LENGTH,
  halfWidth: 2.9,
  surface: 'roughPavement',
  shoulder: 2,
  blocks: [
    ...[1, -1].map((side) => ({
      s: ALLEY_RUN_LENGTH / 2,
      t: side * 4.6,
      halfAlong: ALLEY_RUN_LENGTH / 2,
      halfLateral: 1.6,
      height: WALL_HEIGHT,
      surface: 'roughPavement' as const,
      appearance: 'stone' as const,
    })),
  ],
  props: [
    ...lamps(7.2, 6, 14, 2),
    ...lamps(-7.2, 20, 0, 1),
  ],
};

/**
 * The dogleg out of the alley, and the exit lip.
 *
 * The second right angle of the shortcut, and the blindest corner in the level:
 * a wall on the outside, no sight line through it, and a kerb waiting three
 * metres from the mouth. The lip is the same 0.15 m the boulevard teaches, so
 * the alley finishes by asking for the one skill beat 3 spent seventy metres
 * teaching — hop it and the shortcut is clean, roll it and it costs 3 m/s.
 */
const ALLEY_DOG: SegmentSpec = {
  id: 'alley-dog',
  length: quarter(ALLEY_RADIUS),
  curvature: -1 / ALLEY_RADIUS,
  halfWidth: 2.9,
  surface: 'roughPavement',
  shoulder: 2,
  blocks: [...alleyCornerWall()],
  props: [
    ...lamps(-7.4, 8, 12, 2),
    ...rowOf('shrub', 7.5, 6, 8, 3, { wander: 1.2 }),
  ],
};

const ALLEY_EXIT: SegmentSpec = {
  id: 'alley-exit',
  length: ALLEY_EXIT_LENGTH,
  halfWidth: 3.2,
  surface: 'roughPavement',
  shoulder: 3,
  blocks: [
    {
      s: 3, t: 0, halfAlong: 0.9, halfLateral: 3.2, height: KERB,
      surface: 'roughPavement', appearance: 'concrete',
    },
  ],
  props: [
    ...lamps(6.5, 4, 0, 1),
    ...rowOf('shrub', -6.5, 5, 5, 2, { wander: 1 }),
  ],
};

/**
 * The alley-only ledge.
 *
 * A platform 0.55 m above the alley floor with a **zero shoulder**, so its
 * sides are a single cell wide and it is a genuine ledge rather than a ramp.
 * 0.55 m is deliberately between the wheel's two hop heights: 0.45 m from a
 * standing press does not reach it and 0.63 m from a held crouch does, so the
 * pocket rewards the one input the game has that nothing is currently asking
 * for. It is walled from the safe route by the alley's own walls, which is what
 * "reachable only via the alley" means in geometry.
 */
const ALLEY_LEDGE: SegmentSpec = {
  id: 'alley-ledge',
  length: 22,
  halfWidth: 2.2,
  surface: 'brick',
  shoulder: 0,
  blocks: [
    {
      s: 21, t: 0, halfAlong: 1, halfLateral: 2.2, height: 0.8,
      surface: 'brick', appearance: 'stone',
    },
  ],
  props: [
    // The reward for the charged hop, dressed so it reads as somewhere rather
    // than as a slab: lamps standing on the alley floor beside it, whose heads
    // clear the ledge, and a bin at the far end.
    ...lamps(3.8, 5, 11, 2),
    { s: 18, t: -3.4, kind: 'litterBin', yaw: 0, scale: 1 },
  ],
};

// ---------------------------------------------------------------------------
// The off-route pockets
// ---------------------------------------------------------------------------

/**
 * The drainage swale.
 *
 * A **negative crown** hollows the corridor instead of shedding off it, and an
 * elevation offset drops the whole thing a metre below grade — so this is one
 * segment, two numbers, and a rideable concrete channel with banks that can be
 * pumped. The banks run at about 34°, which the wheel can climb out of at full
 * throttle (7.67 m/s² of drive against 5.5 m/s² of slope) and cannot climb out
 * of while coasting. That is the pocket: easy to fall into, worth learning to
 * carry speed through.
 */
const DRAIN_RUN: SegmentSpec = {
  id: 'drain-run',
  length: 74,
  curvature: 1 / 300,
  halfWidth: 2.6,
  crown: -0.55,
  surface: 'pavement',
  shoulder: 1.6,
  props: [
    // A fence along the top of one bank for the whole 74 m. The swale is a
    // metre below grade and nearly invisible from the boulevard, so the fence
    // is what makes it findable — and, once a rider is in it, the thing that
    // reads as speed while they pump the banks.
    ...fenceRun(4.4, 3, 29),
    ...rowOf('shrub', -4.6, 6, 6, 11, { wander: 1, scale: 1.15 }),
    marker(4, -4.4),
  ],
};

/**
 * The terrace and its two low walls.
 *
 * §6's "a low wall to ride". Two of them, because one is a fact and two is a
 * choice: 0.20 m is under the derived step-up ceiling so it can be rolled onto,
 * and 0.34 m is over it so it has to be hopped. Both are 1.1 m wide and 40 m
 * long, which is narrow enough that staying on one is the point.
 */
const TERRACE: SegmentSpec = {
  id: 'terrace',
  length: 52,
  halfWidth: 9,
  surface: 'brick',
  shoulder: 6,
  blocks: [
    {
      s: 26, t: 3.4, halfAlong: 20, halfLateral: 0.55, height: 0.20,
      surface: 'brick', appearance: 'stone',
    },
    {
      s: 26, t: -3.4, halfAlong: 20, halfLateral: 0.55, height: 0.34,
      surface: 'brick', appearance: 'concrete',
    },
    ...trees('brick', 8, 8, 12, 4),
  ],
  props: [
    ...treeTops(8, 8, 12, 4),
    // A raised brick terrace with two low walls to ride, dressed as a place
    // somebody would sit: lamps, benches facing the walls, planting behind.
    ...lamps(12.5, 8, 16, 3),
    ...lamps(-12.5, 14, 16, 2),
    ...seating(-11, 14),
    ...seating(-11, 34),
    ...seating(11.5, 26),
    ...rowOf('shrub', -14, 6, 6, 7, { wander: 1.4, scale: 1.15 }),
    ...rowOf('broadleafTree', -17, 10, 14, 3, { wander: 1.5 }),
    marker(5, 11.5),
  ],
};

/**
 * The chicken line — beat 9's way around the kicker.
 *
 * An S-bend of two equal opposite arcs, which returns to the original heading
 * and moves eleven metres sideways in exactly 2R·sin(φ) along the route. That
 * is why it rejoins the landing corridor to the millimetre rather than to a
 * tolerance: the geometry is closed in the numbers rather than solved for.
 *
 * It is 2.4 m longer than the kicker's own line and carries no jump, so taking
 * the mound is faster as well as better. A chicken line that were faster would
 * be the real route with a decoration beside it.
 */
/** How far to the side the chicken line runs, clear of the mound's flank. */
const CHICKEN_OFFSET = 13;
const CHICKEN_RADIUS = 26;
const CHICKEN_PHI = Math.acos(1 - CHICKEN_OFFSET / (2 * CHICKEN_RADIUS));
const CHICKEN_ARC_LENGTH = CHICKEN_PHI * CHICKEN_RADIUS;

const CHICKEN_LEAD: SegmentSpec = {
  id: 'chicken-lead',
  length: 12,
  halfWidth: 3,
  surface: 'dirt',
  shoulder: 4,
};

const CHICKEN_IN: SegmentSpec = {
  id: 'chicken-in',
  length: CHICKEN_ARC_LENGTH,
  curvature: -1 / CHICKEN_RADIUS,
  halfWidth: 3,
  surface: 'dirt',
  shoulder: 4,
  props: [
    // Only on the outside. The mound is on the other side of this line and the
    // gap between them is where a rider who changed their mind ends up.
    ...rowOf('conifer', 9, 3, 8, 2, { wander: 1.6 }),
  ],
};

const CHICKEN_OUT: SegmentSpec = {
  id: 'chicken-out',
  length: CHICKEN_ARC_LENGTH,
  curvature: 1 / CHICKEN_RADIUS,
  halfWidth: 3,
  surface: 'dirt',
  shoulder: 4,
  props: [
    ...rowOf('conifer', 9.5, 4, 9, 2, { wander: 1.6 }),
    ...rowOf('shrub', 7, 3, 6, 3, { wander: 1.2, scale: 1.2 }),
  ],
};

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

/**
 * The main chain is the safe route, start to finish.
 *
 * Everything after the kicker's lip hangs off a branch, because the landing has
 * to sit 1.05 m below the crest and a chain cannot step down: two chained
 * segments share one socket, and a socket has one height. The branch's
 * `elevationOffset` is the only mechanism in the level model that can make a
 * drop, which is the same reason it exists for the ledge and the swale.
 */
const MAIN: readonly SegmentSpec[] = [
  PLAZA,
  BOULEVARD_NORTH,
  BOULEVARD_BEND,
  CURB_RUN,
  FORK,
  ROAD_LEAD_SPEC,
  ROAD_CORNER_A,
  ROAD_CROSS_SPEC,
  ROAD_CORNER_B,
  ROAD_IN_SPEC,
  PARK_GATE,
  RIVERSIDE,
  FORD_IN,
  FORD_OUT,
  RIVERSIDE_LOWER,
  GRAVEL_SPUR,
  TRAILHEAD,
  BERM,
  KICKER_RUN,
];

const BRANCHES: readonly SegmentBranch[] = [
  // Beat 9's landing and beat 10's climb home. The offset is the mound's rise
  // and not the lip's, so the landing sits exactly at the level the kicker's
  // approach started from and the drop off the lip is exactly the lip's own
  // 1.20 m above it.
  {
    from: 'kicker-run',
    elevationOffset: -KICKER_RISE,
    specs: [KICKER_LAND, RETURN_CLIMB, RETURN_PLAZA],
  },
  // Beat 9's chicken line, leaving before the mound starts.
  {
    from: 'kicker-run',
    atDistance: 0,
    lateralOffset: CHICKEN_OFFSET,
    specs: [CHICKEN_LEAD, CHICKEN_IN, CHICKEN_OUT],
  },
  // Beat 4's shortcut. No offset and no turn at the root: the alley's own first
  // arc is the turn, which is what makes the closed form above exact.
  {
    from: 'fork',
    specs: [ALLEY_MOUTH, ALLEY_UPPER, ALLEY_STEPS, ALLEY_RUN, ALLEY_DOG, ALLEY_EXIT],
  },
  // The pocket that only the shortcut can reach.
  {
    from: 'alley-upper',
    atDistance: 14,
    lateralOffset: 6.6,
    elevationOffset: 0.55,
    headingOffset: 0.10,
    specs: [ALLEY_LEDGE],
  },
  // The swale, alongside the boulevard and below it.
  {
    from: 'boulevard-north',
    atDistance: 6,
    lateralOffset: 34,
    elevationOffset: -1.0,
    headingOffset: 0.06,
    specs: [DRAIN_RUN],
  },
  // The terrace, out of the plaza's open left side — beat 1's second exit.
  {
    from: 'plaza',
    atDistance: 24,
    lateralOffset: 21,
    headingOffset: 1.35,
    specs: [TERRACE],
  },
];

const GRAPH: SegmentGraph = { main: MAIN, branches: BRANCHES };

// ---------------------------------------------------------------------------
// The surround, and the horizon
// ---------------------------------------------------------------------------

/**
 * The level's footprint, which the scatter and the skyline are laid out from.
 *
 * These are the heightfield's own bounds, which `buildPlan.ts` derives from the
 * segments and their shoulders — so they are written down here rather than
 * guessed, and `sliceLevel.test.ts` asserts them against the built plan. A
 * skyline laid out from a stale footprint is a skyline standing in the park.
 */
export const SLICE_FOOTPRINT = {
  minX: -180,
  maxX: 89,
  minZ: -28,
  maxZ: 331,
} as const;

const FOOTPRINT = SLICE_FOOTPRINT;

const CENTRE_X = (FOOTPRINT.minX + FOOTPRINT.maxX) / 2;
const CENTRE_Z = (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2;

/**
 * How far a scattered prop has to stay from any rideable corridor, metres.
 *
 * Measured from the corridor edge, not from its centreline. Nine metres keeps
 * the scatter off every verge the authored dressing already owns and well clear
 * of the line a rider takes when they leave the route — which they are
 * encouraged to do, because "go anywhere" is LOCKED and a surround carpeted
 * with trees the wheel rides through is a worse surround than an empty one.
 */
const SCATTER_CLEARANCE = 9;

/** The scatter's grid, metres. One candidate per cell, jittered inside it. */
const SCATTER_CELL = 15;

/**
 * Trees over the whole surround, on an integer-hash scatter.
 *
 * **Not decoration, and not `Math.random`.** The open field beyond the course
 * is the largest thing the player sees and until now it was an unbroken green
 * plane with a coarse mottle on it; at fifteen metres a second a plane with no
 * vertical in it reads as standing still. This is the same argument
 * `DESIGN.md` §4 makes for the mottle, one scale up.
 *
 * Density and species follow the world's own halves: the park is the west and
 * south of the map and gets conifers, the city is the north and east and gets
 * broadleaves, and the boundary between them is the river valley rather than a
 * line somebody drew.
 */
function meadowScatter(placed: readonly PlacedSegment[]): PlacedProp[] {
  const props: PlacedProp[] = [];
  const margin = 40;

  for (let x = FOOTPRINT.minX - margin; x <= FOOTPRINT.maxX + margin; x += SCATTER_CELL) {
    for (let z = FOOTPRINT.minZ - margin; z <= FOOTPRINT.maxZ + margin; z += SCATTER_CELL) {
      const roll = noise01(x, z);
      if (roll > 0.46) continue;

      const px = x + signed(x + 1.7, z) * SCATTER_CELL * 0.42;
      const pz = z + signed(x, z + 3.1) * SCATTER_CELL * 0.42;

      // The one rule the scatter has: never on a corridor, never on its verge.
      let clear = true;
      for (const segment of placed) {
        const query = querySegment(segment, px, pz);
        if (query !== null && query.outside < SCATTER_CLEARANCE) { clear = false; break; }
      }
      if (!clear) continue;

      // The park is the west and south of the map — everything left of the
      // river valley and below the fork's block. The boundary is the world's
      // own, taken from where the beats actually sit, so a conifer never turns
      // up in the plaza's surround and a street tree never turns up on the
      // trailhead's.
      const parkish = px < -30 && pz < 215;
      const kind: PropKind = roll < 0.13
        ? 'shrub'
        : parkish
          ? (roll < 0.40 ? 'conifer' : 'broadleafTree')
          : (roll < 0.42 ? 'broadleafTree' : 'conifer');

      props.push({
        kind,
        x: px,
        z: pz,
        rotationY: noise01(px, pz) * Math.PI * 2,
        scale: (kind === 'shrub' ? 1.25 : 1.05) * (1 + 0.22 * signed(px + 5, pz)),
        lift: 0,
      });
    }
  }

  return props;
}

/**
 * The skyline — `docs/PLANS.md` §6's world beyond the world.
 *
 * Until M7.5 the horizon was the surround's own flat green meeting the sky,
 * with the level's 3.4 m frontage walls the tallest thing in it. A city with
 * nothing above eye level has no scale: a 15 m/s ride past a 9 m tree is fast
 * and a ride past nothing at all is a screensaver.
 *
 * Laid out on an **ellipse around the footprint** rather than a circle, so the
 * distance from the course is roughly even on a world that is 269 m one way and
 * 359 m the other. The blocks go on the city's arc and a treeline goes on the
 * park's, which is the same city/park division the ground makes, read from
 * three hundred metres away.
 *
 * The radii are chosen against the haze, not against a map: `LIGHTING.fogNear`
 * is 190 m and `fogFar` 470 m, so the near arc stands nearly solid, the far arc
 * dissolves into exactly the colour the sky has at the horizon, and nothing is
 * ever clipped by the camera's 500 m far plane while still visible.
 */
const SKYLINE_COUNT = 88;
const SKYLINE_RADIUS_X = 268;
const SKYLINE_RADIUS_Z = 318;

function skyline(): PlacedProp[] {
  const props: PlacedProp[] = [];

  for (let index = 0; index < SKYLINE_COUNT; index += 1) {
    const angle = (index / SKYLINE_COUNT) * Math.PI * 2;
    // Two rings' worth of depth from one loop: the radius wanders by a fifth,
    // which is what stops a skyline reading as a fence.
    const wander = 1 + 0.22 * signed(index, 3);
    const x = CENTRE_X + Math.sin(angle) * SKYLINE_RADIUS_X * wander;
    const z = CENTRE_Z + Math.cos(angle) * SKYLINE_RADIUS_Z * wander;

    // The city stands over the plaza, the boulevard, and the fork, which are
    // the north and east of the map; the park's horizon is trees.
    const city = Math.sin(angle) > -0.15 || Math.cos(angle) > 0.55;
    if (!city) {
      props.push({
        kind: noise01(index, 7) > 0.35 ? 'conifer' : 'broadleafTree',
        x,
        z,
        rotationY: noise01(index, 11) * Math.PI * 2,
        scale: 2.6 + 1.4 * noise01(index, 13),
        lift: 0,
      });
      continue;
    }

    const height = 14 + 46 * noise01(index, 17) ** 1.7;
    const width = 14 + 22 * noise01(index, 19);
    props.push({
      kind: 'building',
      x,
      z,
      rotationY: noise01(index, 23) * Math.PI * 2,
      scale: 1,
      size: { x: width, y: height, z: width * (0.7 + 0.6 * noise01(index, 29)) },
      lift: 0,
    });
  }

  return props;
}

/**
 * The ten beats, as an index over the segments that carry them.
 *
 * `docs/PLANS.md` §2.5 says the slice's beats are M12's seed library, and a
 * library needs an index — a generator picking "a curb run" has to know which
 * specs are one. It is exported rather than inferred because a beat is a design
 * unit and a segment is a geometry unit, and the mapping between them is a
 * decision rather than a naming convention.
 */
export interface SliceBeat {
  readonly index: number;
  readonly name: string;
  readonly teaches: string;
  readonly segments: readonly string[];
}

export const SLICE_BEATS: readonly SliceBeat[] = [
  { index: 1, name: 'City plaza start', teaches: 'accelerate, brake, carve safely', segments: ['plaza'] },
  { index: 2, name: 'Boulevard', teaches: 'carving at speed', segments: ['boulevard-north', 'boulevard-bend'] },
  { index: 3, name: 'Curb run', teaches: 'hop up to cut a corner', segments: ['curb-run'] },
  {
    index: 4,
    name: 'The fork',
    teaches: 'route choice with real risk',
    segments: [
      'fork', 'road-lead', 'road-corner-a', 'road-cross', 'road-corner-b', 'road-in',
      'alley-mouth', 'alley-upper', 'alley-steps', 'alley-run', 'alley-dog', 'alley-exit',
    ],
  },
  { index: 5, name: 'Park gate', teaches: 'the city to park transition', segments: ['park-gate'] },
  {
    index: 6,
    name: 'Riverside path',
    teaches: 'corner-cutting across grass costs grip',
    segments: ['riverside', 'ford-in', 'ford-out', 'riverside-lower'],
  },
  { index: 7, name: 'Gravel spur', teaches: 'wider turns on loose ground', segments: ['gravel-spur'] },
  { index: 8, name: 'Trailhead', teaches: 'terrain reading, momentum as a tool', segments: ['trailhead', 'berm'] },
  {
    index: 9,
    name: 'The kicker',
    teaches: 'the satisfying jump, and commitment',
    segments: ['kicker-run', 'kicker-land', 'chicken-lead', 'chicken-in', 'chicken-out'],
  },
  { index: 10, name: 'Return climb', teaches: 'hill power and loop closure', segments: ['return-climb', 'return-plaza'] },
];

/** The three deliberate off-route pockets, by the segments that carry them. */
export const SLICE_POCKETS: readonly { readonly name: string; readonly segments: readonly string[] }[] = [
  { name: 'drainage channel', segments: ['drain-run'] },
  { name: 'low walls to ride', segments: ['terrace'] },
  { name: 'alley-only ledge', segments: ['alley-ledge'] },
];

/** The two ways through beat 4, as segment id lists, in riding order. */
export const SAFE_ROUTE: readonly string[] = [
  'road-lead', 'road-corner-a', 'road-cross', 'road-corner-b', 'road-in',
];
export const ALLEY_ROUTE: readonly string[] = [
  'alley-mouth', 'alley-upper', 'alley-steps', 'alley-run', 'alley-dog', 'alley-exit',
];

/**
 * The timed route — M10's six gates, and where each one sits.
 *
 * **Every gate is on ground both routes through beat 4 share.** The fork is the
 * one place in the slice where two legal lines exist, so a gate on `fork`, on
 * any `road-*`, or on any `alley-*` would time a different course depending on
 * which way the rider went and make the split table meaningless. The shortcut
 * has to show up as a *faster leg* between two shared gates, which is the only
 * reading under which "the alley saves four seconds" is a thing the game can
 * tell the player. `sliceLevel.test.ts` verifies the claim by name and by
 * geometry rather than trusting this paragraph.
 *
 * **Beat 9's chicken line is the same problem wearing different clothes**, and
 * it is the reason the kicker's gate is on `kicker-land` rather than anywhere
 * on `kicker-run`. The chicken line leaves at the mound's foot and rejoins the
 * landing corridor 12.4 m in, so a gate before that point would void the run of
 * every rider who chose not to jump — a route the level deliberately offers.
 *
 * Each `s` is chosen so the rider is travelling straight through open corridor
 * as they cross: never on a socket seam, never mid-apex where the line they are
 * holding matters, and never inside a block they might be hopping. The reasons
 * are one per gate below, because a number with no argument behind it is a
 * number the next person moves.
 *
 * The ids read like the places they are, so a split in a log or a results row
 * names somewhere the player recognises.
 */
export const SLICE_CHECKPOINTS: readonly CheckpointSpec[] = [
  {
    // The arch at the plaza's far end, dead centre between its two piers, which
    // makes the level's own architecture the start line's gateposts. The rider
    // spawns 50 m back at the plaza's entry with a clear brick run at it, which
    // is what lets the clock start on a crossing instead of on a countdown
    // nobody wants to sit through twice. The piers span s 46.8–53.2, so a
    // 3.6 m-thick gate at 50 sits wholly inside the passage.
    id: 'start', segment: 'plaza', s: 50, kind: 'start', label: 'Start',
  },
  {
    // The first driveway gap in beat 3's sidewalk, whose kerbs run s 3–23,
    // 27–49 and 53–69. The gap is 23–27 and the gate is centred in it, so the
    // volume crosses road rather than kerb and a rider hopped up onto the
    // sidewalk crosses the same line at the same moment as one who stayed down.
    id: 'curb-run', segment: 'curb-run', s: 25, kind: 'split', label: 'Curb run',
  },
  {
    // Just through the park gate's piers, which end at s 15.2. Beat 5 is the
    // city-to-park identity beat and the split belongs on the park side of it,
    // where the corridor is straight, 16 m wide and the rider has stopped
    // aiming at a 4.8 m gap. The first trunk is at s 19.7, so the gate's 3.6 m
    // fits between the two without touching either.
    id: 'park-gate', segment: 'park-gate', s: 18, kind: 'split', label: 'Park gate',
  },
  {
    // A third of the way up the spur, clear of the socket it shares with the
    // riverside and of the plinth at s 30. Beat 7 is one constant 34.7 m arc
    // end to end, so there is no straight to find here — what there is instead
    // is a stretch with nothing in it, which is the next best thing.
    id: 'gravel-spur', segment: 'gravel-spur', s: 20, kind: 'split', label: 'Gravel spur',
  },
  {
    // The landing, 5.6 m past where the chicken line rejoins it at s 12.4 —
    // see above; this is the number that keeps the beat's second route legal.
    // It is also past where a jumped rider touches down (about 5 m out at
    // 10 m/s), so the gate is crossed on the ground by both of them.
    id: 'kicker', segment: 'kicker-land', s: 18, kind: 'split', label: 'The kicker',
  },
  {
    // Home. `return-plaza` runs into the plaza's open west side and its last
    // 20 m are inside the plaza's own corridor, so a gate at s 34 stands on
    // brick in the square the run started in. It is six metres short of the
    // corridor's end, which keeps the whole 3.6 m volume off the seam.
    //
    // **It is not under the arch, and the arch is what M10's brief asked for.**
    // Beat 10 comes home 20 m west of the arch's piers — `PARK_CURVATURE`
    // solved the loop's closure into the plaza, not into its gateway — so a
    // finish "at the arch" would have to sit on `plaza`, 16 m off the corridor
    // the rider is actually on and inside the start gate's own volume. The
    // square is the finish; the arch is the start.
    id: 'finish', segment: 'return-plaza', s: 34, kind: 'finish', label: 'Finish',
  },
];

/**
 * In the plaza, facing the arch.
 *
 * A rider gets a wide brick square to find the throttle in before the level
 * asks for anything, which is what the vision means by teaching through terrain
 * rather than through a tutorial. Named because the scatter has to place the
 * graph before the builder does, and both have to start from the same point.
 */
const SPAWN = { position: { x: 0, y: 0, z: 0 }, headingY: 0 };

/** Build the vertical-slice level. */
export function createSliceLevel(
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
): LevelPlan {
  // The graph is placed twice — once here to know where the corridors are, and
  // once inside `buildLevelPlan`. `placeGraph` is pure and cheap (thirty-four
  // segments, no rasterising), and the alternative is teaching the builder what
  // a scatter is, which would put level authoring inside the one function M12's
  // generator also calls.
  const placed = placeGraph(GRAPH, SPAWN);

  return buildLevelPlan(GRAPH, {
    id: 'm7-slice',
    spawn: SPAWN,
    // Grass, at the city's height. The park sits in a shallow cut below it, so
    // riding off the riverside path is a climb onto the meadow rather than a
    // fall off the world — and "go anywhere" is LOCKED.
    surround: { height: 0, surface: 'grass' },
    // Dressing that belongs to the level rather than to a beat. Everything
    // else hangs off the segment it decorates.
    props: [...meadowScatter(placed), ...skyline()],
    checkpoints: SLICE_CHECKPOINTS,
    // **On here, where `settleProps` is deliberately off, and the difference is
    // the point.** Settling a *prop* second-guesses where somebody put it, and
    // this level's dressing was placed by somebody looking at it. Footing a
    // *block* moves nothing anybody authored: the top face — the thing a rider
    // mounts, lands on, or is stopped by — stays exactly where it was, and only
    // the buried part grows. It changes one collider here, the return climb's
    // 40 m retaining wall, which stood 1.88 m clear of the ground beside it.
    settleBlocks: true,
    // M13 Phase 2's diagnostic. Absent unless `?hazardprobe=` asked for it, so
    // the shipped slice is the hazard-free world §13 q9 decided it should be
    // and the pinned plan digest never sees the key (`BuildOptions`).
    ...(hazardProbeMetres === undefined ? {} : { hazardProbeMetres }),
    ...(targetProbeMetres === undefined ? {} : { targetProbeMetres }),
  });
}

/** The authored graph, for tests and for M12's seed library. */
export const SLICE_GRAPH = GRAPH;
