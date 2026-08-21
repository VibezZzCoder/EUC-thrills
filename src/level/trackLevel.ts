/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { MARKINGS } from '../data/markings.ts';
import {
  GANTRY_WORDMARK,
  PROP_FOOTPRINTS,
  PROP_KINDS,
  PROP_SIZES,
  type PropKind,
} from '../data/props.ts';
import { positionHash01 } from '../shared/maths.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import type { LevelPlan } from './plan.ts';
import { PROP_CORRIDOR_CLEARANCE, buildLevelPlan, type CheckpointSpec } from './buildPlan.ts';
import type {
  PlacedProp,
  SegmentBlock,
  SegmentBranch,
  SegmentGraph,
  SegmentMarking,
  SegmentProp,
  SegmentSpec,
} from './segments.ts';

/**
 * BelVar Circuit — the venue, and the fourth producer of a `LevelPlan`.
 *
 * `docs/PLANS.md` §23.6 makes this an instance of a pattern the project
 * already has rather than a new system: `sliceLevel.ts` hand-authors the
 * slice, `provingGround.ts` hand-authors the instrument, `generateRoute.ts`
 * stitches a seed, and this hand-authors a closed circuit. `simulation/`
 * builds its colliders and its surface lookup, `render/` builds its meshes,
 * and neither can tell it from the other three. Nothing anywhere gains a
 * branch on "am I on the track".
 *
 * Nothing in this file may import three.js (invariant 1).
 *
 * ## The name
 *
 * **BelVar** — Mari**bel** + **Var**gas fused into one word, the tribute the
 * owner asked for at §13 q55 and told her about while Phase A0 was being
 * built. The interior capital is deliberate and is the canonical spelling: it
 * is what she has actually been told the place is called, and it shows where
 * the two halves of her name join.
 *
 * ## Designed from a program, not from the image
 *
 * The reference she supplied is a lap trace of a real, named kart venue she
 * rides, and the agreement is inspiration and not reproduction — her brief's
 * rule is *"DO NOT TRACE THE REFERENCE IMAGE"* and §23.7 turns that into a
 * method. The layout below was authored on a blank sheet from the corner-type
 * program in §23.7, and the reference was consulted only for what kinds of
 * demand a compact kart circuit makes:
 *
 * | § | The demand | Here |
 * |---|---|---|
 * | 1 | a start/finish straight long enough to brush the M20 cutout band | `main`, 175 m |
 * | 2 | a wide fast sweeper where the deep-lean carve reads | `sweeper`, R46 |
 * | 3 | one genuine heavy-braking corner at the end of the fast run | `brakes`, R13, at the end of `chute` |
 * | 4 | one tight hairpin that rewards M16's pivot-first agility | `hairpin`, R14, 175° |
 * | 5 | an S-complex for rapid left-right transitions | `flick-right` / `flick-left` |
 * | 6 | a shorter second straight as the breathing bar | `breather` |
 * | 7 | a final medium corner that launches the next lap | `last`, R24, 118° |
 *
 * `TRACK_PROGRAM` states the same table as data so a test can hold the layout
 * to it rather than a comment claiming it.
 *
 * **Made different from the reference on purpose**, in the ways §23.7 lists.
 * The reference is a crossing two-lobe layout whose lap self-intersects near
 * its start/finish; this is a single closed loop that never crosses itself and
 * turns a clean −2π. Its start/finish sits on a short flat-out crossover chute
 * between the two lobes; ours is on a long perimeter straight with a corner
 * exit behind it and a braking zone in front. Corner count and order are
 * unrelated, the infield is one open field rather than a chain of scrub
 * islands, and the paddock ground is reserved outside the main straight rather
 * than beside the crossover. `tools/track-overlay.mjs` is the evidence: it
 * puts our centreline against the traced one at every rotation, mirror and
 * scale and reports how far the best fit still is from an alignment.
 *
 * The real venue's name, its city, and the lap app she asked us not to name
 * appear nowhere in this build. Two of the three are tripwires in
 * `tools/private-tokens.mjs` and a release refuses on either — **and the
 * refusal caught this very comment**, which named them both on its first
 * draft. `src/` is published, so a file explaining which strings are forbidden
 * by spelling them is a file that cannot ship; `render/maribel.test.ts` had
 * already recorded the same collision and the same fix.
 *
 * ## The lap is closed by arithmetic, not by a number somebody typed
 *
 * A circuit is a chain whose last exit socket has to land on its first entry
 * socket, in position and in heading. Heading is closed by construction —
 * `TRACK_LOOP`'s turns sum to exactly −360° and `trackLevel.test.ts` asserts
 * it. Position is closed by `solveLoop`, which solves the one 2×2 linear
 * system the geometry leaves: with every radius, every turn and every other
 * straight authored as a round number, the two straights marked `solve` are
 * whatever closes the ring. Writing those two as pasted constants would work
 * exactly once, and then be wrong the first time anybody moved a radius by a
 * metre.
 *
 * ## Flat, and that is a decision
 *
 * Every socket is at y = 0 and the surround is grass at the same height, so
 * there is no elevation anywhere on the venue. Two reasons. **The sweeper is
 * meant to make the carve read**, and lean comes from lateral acceleration —
 * banking it would buy speed by *removing* the lean the corner exists to show.
 * And a flat venue is the honest graybox baseline for a phase whose whole
 * point is that layout iterates cheaply: camber and banking are one number
 * each, and the place to spend them is after the lap has been ridden.
 *
 * ## What punishes a bad line
 *
 * No new mechanic. The corridor is 20 m wide and only its middle 10 m is
 * asphalt; outside that is the surface system doing the work — grass at 0.7
 * grip and eight times the rolling resistance, and gravel at 0.58 on the
 * outside of the three corners a rider arrives at fastest. Barriers are
 * ordinary solids and the M17 standoff handles them, which is why the
 * acceptance fixture rides *alongside* every barrier line rather than at it.
 */

// ---------------------------------------------------------------------------
// The venue's dimensions
// ---------------------------------------------------------------------------

/**
 * Widths and offsets, in metres. Every one of them is load-bearing somewhere.
 *
 * `halfWidth` is the whole authored corridor and `asphaltHalf` is the racing
 * surface inside it: a 10 m track with a 5 m verge each side. The verge is
 * where the barriers stand and where a rider who runs wide ends up, so it is
 * not decoration — it is the width that makes running wide a mistake with a
 * cost rather than a crash into a wall.
 *
 * `barrierOffset` puts the barrier line 3.4 m outside the asphalt edge and
 * 1.6 m inside the corridor edge. Both halves matter: closer and it is the
 * snag trap her brief warns about, further and it is not a kart circuit.
 */
export const TRACK = Object.freeze({
  /** Authored corridor half-width, metres. Asphalt plus verge. */
  halfWidth: 10,
  /** Half-width of the racing surface, metres. */
  asphaltHalf: 5,
  /** Barrier centreline offset from the corridor centreline, metres. */
  barrierOffset: 8.4,
  /** Half-thickness of a barrier block, metres. */
  barrierHalfLateral: 0.35,
  /**
   * Barrier height above the corridor, metres.
   *
   * A kart barrier, and under the rider: `RIDER_BLOCKOUT` stands about 1.7 m
   * over a half-metre wheel, so this is chest height on somebody riding past
   * it and cannot hide them from the chase camera. `trackLevel.test.ts` holds
   * it under the rider so that stays true if anybody raises it.
   */
  barrierHeight: 0.9,
  /** How far a barrier line may chord away from the arc it follows, metres. */
  barrierFacetSag: 0.05,
  /** Longest half-facet a barrier run uses on an arc, metres. */
  barrierFacetHalfMax: 3,
  /**
   * Length of one barrier panel along its own run, metres — B1.
   *
   * **The barrier stopped being a wall and became modules, because a colourway
   * needs something to alternate.** Two metres and a bit is a kart barrier
   * panel; it is also short enough that the sagitta rule above only overrides
   * it inside the hairpin, so the red/white rhythm is even nearly everywhere
   * and finer exactly where the corner is tightest.
   */
  barrierModule: 2.2,
  /**
   * How far a signal-red panel stands proud of the pale one beside it, metres.
   *
   * **This is a depth-fighting fix, and the artifact it fixes has been in the
   * build since B0.** Panels must overlap at their joints (see below), so in
   * every overlap band two boxes present the *same* outer face at the *same*
   * depth — which is z-fighting by definition. It was invisible while every
   * block on the venue was one material at one shade: the fight was between
   * two identical greys. Give the two colourways different shades and every
   * joint on the circuit starts to shimmer.
   *
   * Twelve millimetres of lateral proudness settles it in the depth buffer
   * instead of leaving it to floating-point luck, and it is what a bolted
   * modular barrier actually looks like. It is invisible at riding speed and
   * well inside what the M17 standoff and the ride-alongside fixtures care
   * about.
   */
  barrierPanelStep: 0.012,
  /**
   * Safety factor on the joint overlap a panel needs. Dimensionless.
   *
   * Tangent-aligned rectangles laid along an arc meet at their inner faces but
   * their *corners* do not: the two boxes' end faces are a facet angle apart,
   * so the joint opens by about `barrierHalfLateral × Δθ` — nine centimetres
   * on the hairpin. A wheel cannot fit through it, but the M17 wall feeler
   * can find it, and a barrier with a hole in it every metre is exactly the
   * class of defect the shallow-angle fixture exists to catch.
   *
   * **B0 covered that with a flat 15% of a facet, and B1 could not keep it.**
   * A share is not a length: at B1's 2.2 m panels it granted 33 cm where 5 cm
   * was needed, which on a two-colour barrier is a *visible* 65:35 stripe
   * instead of the even alternation a barrier has. So the overlap is now the
   * splay it exists to cover, times this, with `barrierJointFloor` under it —
   * zero on a straight, where the splay is genuinely zero. The guard that this
   * is enough is not this comment: `trackLevel.test.ts` walks every barrier
   * line in **world** metres and fails on a gap.
   */
  barrierJointSafety: 1.5,
  /** Least overlap any joint gets, metres. A straight's splay is zero. */
  barrierJointFloor: 0.02,
  /**
   * Lateral offset of every painted line from the centreline, metres.
   *
   * **Derived from the heightfield's cell size, not from where a line looks
   * best.** Paint is clipped against the *finished* heightfield, whose surface
   * is one value per one-metre cell sampled at the cell's centre — so the
   * asphalt's edge, as the paint sees it, is a ragged staircase within half a
   * metre of `asphaltHalf`. A line authored at 4.75 m measured 85% paintable
   * and shipped as 103 broken pieces of a continuous 1,859 m of edge line;
   * 4.3 m measures 100% at its centre. **And the centre is not what is
   * tested** — `clipMarking` samples the whole *ribbon*, centre and both
   * edges, so the widest role decides the offset: a 0.42 m kerb centred at 4.3
   * reaches 4.51 and is clipped again. 4.05 keeps every role's outer edge
   * inside 4.26. `trackLevel.test.ts` asserts the whole of the paint
   * survives the builder, because a clipped line is a line somebody put in the
   * wrong place and clipping hides that rather than reporting it.
   *
   * **Every role shares this offset, so no two of them may share a stretch of
   * `s`.** B1 authored the kerbs on the edge line's own offset, reasoning that
   * a 0.42 m bar centred on the same line would swallow the 0.13 m line under
   * it. A depth buffer does not work that way: two coplanar ribbons at one
   * height in one mesh fight, and the fight is invisible while both are white
   * and strobes the moment one turns red. The kerb therefore *replaces* the
   * edge line for the length it runs — which is also what a real apex kerb
   * does — and `trackMarkings` breaks the line around it. Moving the kerb
   * outboard instead is not available: the clip bound above is 4.26 m and a
   * kerb clear of a 0.13 m line would need to reach 4.47 m.
   */
  paintOffset: 4.05,
  /**
   * How far short of a corridor's own ends a painted line stops, metres.
   *
   * **A knife-edge, not a taste.** `buildPlan` clips paint to points that are
   * *inside* some rideable corridor, and `outside` is `max(0, -s, s - length)`
   * — so a line authored to end exactly at `s = length` lands on a socket where
   * that expression is a few times 1e-15 rather than zero, and the builder
   * clips the last sample. The visible result is a 1.25 m hole in the edge
   * line at seven of the eighteen seams. Two centimetres of inset puts every
   * sample comfortably inside and leaves a gap nobody can see at 40 mph.
   */
  paintInset: 0.02,
  /**
   * Daylight between two painted runs that meet, metres.
   *
   * Where the edge line gives way to a kerb, and where a bar across the track
   * reaches the edge line, the two runs stop short of each other rather than
   * butting exactly. Butting is a hairline; a floating-point overlap is a
   * depth fight. Six centimetres is under half a wheel's width and invisible
   * at any speed a rider passes it.
   */
  paintGap: 0.06,
  /** Distance along `main` from the corridor's start to the start/finish line. */
  lineAt: 70,

  // -- Phase B1, the dressing ----------------------------------------------

  /**
   * Where the start gantry stands, as a distance along `main`.
   *
   * **Eight metres short of the line rather than over it**, which is what a
   * sponsor bridge does at a real venue and what keeps Phase B2 out of a
   * collision: the start/finish `Checkpoint` draws its own pylons and header
   * when a timed mode is running (`render/checkpointGates.ts`), and two
   * structures over one piece of road would read as one broken structure.
   * Here they are two things in a row — the venue announcing itself, then the
   * line that is actually being timed.
   */
  gantryAt: 62,
  /**
   * Height of a gantry leg above the corridor, metres.
   *
   * Six, which is three times the rider's own height over the wheel — a
   * gantry has to read as something you pass *under* from a long way back, and
   * a low one reads as a gate that might be shut.
   */
  gantryLegHeight: 6,
  /**
   * Half-thickness of a gantry leg, metres.
   *
   * Three tenths, so a leg is 0.6 m square. Thinner reads as scaffolding pole
   * and cannot plausibly hold a twenty-two metre truss; thicker starts to
   * occlude the corner behind it, and a block occludes the chase camera by
   * default.
   */
  gantryLegHalf: 0.3,
  /**
   * Length of one kerb stripe, in metres of the kerb's **own** arc.
   *
   * Its own arc, not its corridor's: an apex kerb on the inside of the hairpin
   * runs at 9.95 m where the centreline runs at 14, so 2.4 m of `s` is 1.7 m
   * of paint there — under `MARKINGS.minRunLength`, which means the builder
   * throws it away and the corner has no kerb. That is `SegmentBlock.s`'s
   * lesson arriving in a second system, and it is why this is converted rather
   * than authored.
   *
   * The size is the mockups': roughly a fifth of the track's width, which is
   * coarse enough to count at 44 mph and fine enough to read as a kerb rather
   * than as two long bars.
   */
  kerbStripe: 2.4,
});

/**
 * The least lateral offset a prop of this kind may take on a corridor here.
 *
 * **Derived, because the builder silently drops a prop that breaks it.**
 * `buildPlan.standsOnCorridor` culls anything standing within
 * `PROP_CORRIDOR_CLEARANCE` of a rideable corridor, and it tests the prop's
 * whole footprint rather than its origin — so the honest bound is the
 * corridor, plus that clearance, plus the widest footprint in the kit. A
 * number chosen by eye would be a piece of dressing that vanishes without an
 * error, which is exactly the class of defect `trackLevel.test.ts` counts the
 * survivors to catch.
 */
export function propStandOff(kind: PropKind): number {
  const shape = PROP_FOOTPRINTS[kind];
  const reach = shape.shape === 'circle' ? shape.radius : Math.hypot(shape.halfX, shape.halfZ);
  return TRACK.halfWidth + PROP_CORRIDOR_CLEARANCE + reach;
}

/** The offset that clears the corridor for **every** kind in the library. */
export const PROP_MIN_LATERAL = Math.max(...PROP_KINDS.map(propStandOff));

/**
 * The two holes in the barrier line, as `[segment, side, from, to]`.
 *
 * **They are load-bearing rather than decorative.** "Go anywhere" is LOCKED
 * (`EUC_THRILLS_GAME_VISION.md`), and a venue ringed by an unbroken wall would
 * be the first ride in this game with an edge — AGENTS.md is explicit that the
 * chase's stray limit is the mode's alone and must not be generalised. A real
 * circuit has the same holes for the same practical reason: the paddock has to
 * get onto the track and the marshals have to get off it.
 */
export const BARRIER_GATES: readonly {
  readonly segment: string;
  readonly side: 1 | -1;
  readonly from: number;
  readonly to: number;
  readonly what: string;
}[] = [
  { segment: 'main', side: 1, from: 138, to: 152, what: 'the paddock gate' },
  { segment: 'exit', side: -1, from: 4, to: 16, what: "the marshals' access" },
];

/** The one gate that turns a closed barrier side into a walkable ring. */
export function barrierGateForSide(
  side: 1 | -1,
  gates: readonly (typeof BARRIER_GATES)[number][] = BARRIER_GATES,
): (typeof BARRIER_GATES)[number] {
  const matches = gates.filter((candidate) => candidate.side === side);
  if (matches.length !== 1) {
    throw new Error(`barrier side ${side} carries ${matches.length} gates; its ring needs exactly one`);
  }
  return matches[0];
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/** One element of the lap: a straight of a length, or an arc of a turn. */
export interface LoopElement {
  readonly id: string;
  /** Centreline length, metres. Absent on an arc, which derives it. */
  readonly straight?: number;
  /** Arc radius, metres. */
  readonly radius?: number;
  /** Signed turn, degrees. Positive turns toward the rider's LEFT. */
  readonly turn?: number;
  /** A straight whose length `solveLoop` chooses so the ring closes. */
  readonly solve?: true;
}

/**
 * The lap, in riding order from the start of the main straight.
 *
 * Read it as the §23.7 program with connective tissue: the long straight and
 * its sweeper, the chute and the corner it brakes for, the back stretch and
 * its kink, the loop that carries the hairpin, the flick pair, the breathing
 * bar and the corner that launches the next lap.
 *
 * **The turns sum to exactly −360°**, which is what makes the ring a lap and
 * not a spiral: five right-hand corners against four left, a clockwise
 * circuit. Anybody changing one turn owes the ring another.
 *
 * The two `solve: true` straights carry whatever length closes the loop. They
 * were chosen because their headings are 62° apart, which is the best-
 * conditioned pair on the lap — a nearly parallel pair would make a
 * millimetre of closure cost tens of metres of straight.
 */
export const TRACK_LOOP: readonly LoopElement[] = [
  // 1 — the start/finish straight. Long enough that a rider who gets the last
  // corner right arrives at the sweeper inside the M20 overspeed band, which
  // is the one mechanic in the game a circuit can showcase and a route cannot.
  { id: 'main', straight: 175 },
  // 2 — the fast sweeper. R46 caps a clean line at 18.4 m/s (41 mph), so it is
  // a lift and a long held carve rather than a brake and a turn.
  { id: 'sweeper', radius: 46, turn: -90 },
  // 3 — the fast run continues. Solved.
  { id: 'chute', straight: 135, solve: true },
  // 4 — the heavy-braking corner, at the end of that run. R13 caps it at
  // 9.8 m/s, so the approach sheds about 27 mph in one braking zone.
  { id: 'brakes', radius: 13, turn: -77 },
  { id: 'backstretch', straight: 103 },
  // A kink rather than a corner: it costs a little speed and sets the entry to
  // the loop, and it is here so the back stretch is not a second main straight.
  { id: 'kink', radius: 20, turn: -71 },
  { id: 'approach', straight: 23 },
  // 5 — into the hairpin loop. The first of the two left-handers that pay for
  // the hairpin's 175° out of the lap's rotation budget.
  { id: 'loop-in', radius: 18, turn: 90 },
  { id: 'dive', straight: 71 },
  // 6 — THE HAIRPIN. R14 with 10 m of track is a 17 m racing-line arc at
  // best, about 11 m/s, and the rider arrives at nearly twice that.
  { id: 'hairpin', radius: 14, turn: -175 },
  { id: 'climb', straight: 33 },
  { id: 'loop-out', radius: 20, turn: 81 },
  { id: 'exit', straight: 23 },
  // 7 — the flick pair. Equal and opposite, so the complex costs the lap no
  // rotation and is purely a demand on transitions.
  { id: 'flick-right', radius: 18, turn: -44 },
  { id: 'link', straight: 27 },
  { id: 'flick-left', radius: 18, turn: 44 },
  // 8 — the breathing bar. Solved.
  { id: 'breather', straight: 49, solve: true },
  // 9 — the final corner. Long and medium-radius, so the exit is a throttle
  // decision that is still being paid for at the start/finish line.
  { id: 'last', radius: 24, turn: -118 },
];

/** The §23.7 program, as data, so a test can hold the layout to it. */
export const TRACK_PROGRAM: readonly {
  readonly item: number;
  readonly demand: string;
  readonly segments: readonly string[];
}[] = [
  { item: 1, demand: 'a start/finish straight that brushes the cutout band', segments: ['main'] },
  { item: 2, demand: 'a wide fast sweeper where the deep carve reads', segments: ['sweeper'] },
  { item: 3, demand: 'one heavy-braking corner at the end of the fast run', segments: ['chute', 'brakes'] },
  { item: 4, demand: "a tight hairpin that rewards the pivot", segments: ['hairpin'] },
  { item: 5, demand: 'an S-complex for rapid left-right transitions', segments: ['flick-right', 'link', 'flick-left'] },
  { item: 6, demand: 'a shorter second straight as the breathing bar', segments: ['breather'] },
  { item: 7, demand: 'a final medium corner that launches the next lap', segments: ['last'] },
];

const DEGREE = Math.PI / 180;

/** Curvature of an element, 1/m. Zero on a straight. */
function curvatureOf(element: LoopElement): number {
  if (element.radius === undefined || element.turn === undefined) return 0;
  return Math.sign(element.turn) / element.radius;
}

/** Centreline length of an element, metres. */
function lengthOf(element: LoopElement, solved: ReadonlyMap<string, number>): number {
  if (element.straight !== undefined) return solved.get(element.id) ?? element.straight;
  return Math.abs(element.turn ?? 0) * DEGREE * (element.radius ?? 0);
}

/**
 * The two straight lengths that close the ring.
 *
 * The chain's end position is *affine* in the two free lengths — an arc's
 * displacement depends only on the heading it starts at, and a straight's
 * heading does not depend on any straight's length — so this is one 2×2 solve
 * and not an iteration. `end = base + a·uA + b·uB`, and closure is
 * `a·uA + b·uB = start − base`.
 *
 * It is computed rather than pasted so that moving a radius or a turn by hand
 * produces a circuit that is still closed, instead of one that is closed
 * everywhere except at the start line.
 */
export function solveLoop(loop: readonly LoopElement[]): Map<string, number> {
  const free = loop.filter((element) => element.solve === true);
  if (free.length !== 2) {
    throw new Error(`a closed lap needs exactly two solved straights, found ${free.length}`);
  }

  // Walk the ring once with both free straights at zero, collecting the base
  // displacement and the two unit directions.
  const zero = new Map(free.map((element) => [element.id, 0]));
  let heading = 0;
  let baseX = 0;
  let baseZ = 0;
  const direction = new Map<string, { x: number; z: number }>();

  for (const element of loop) {
    const length = lengthOf(element, zero);
    const curvature = curvatureOf(element);
    if (curvature === 0) {
      if (element.solve === true) direction.set(element.id, { x: Math.sin(heading), z: Math.cos(heading) });
      baseX += Math.sin(heading) * length;
      baseZ += Math.cos(heading) * length;
    } else {
      const exit = heading + curvature * length;
      baseX += (Math.cos(heading) - Math.cos(exit)) / curvature;
      baseZ += (Math.sin(exit) - Math.sin(heading)) / curvature;
      heading = exit;
    }
  }

  const a = direction.get(free[0].id) as { x: number; z: number };
  const b = direction.get(free[1].id) as { x: number; z: number };
  const determinant = a.x * b.z - a.z * b.x;
  if (Math.abs(determinant) < 1e-6) {
    throw new Error('the two solved straights are parallel and cannot close a ring');
  }
  const lengthA = (-baseX * b.z + baseZ * b.x) / determinant;
  const lengthB = (-a.x * baseZ + a.z * baseX) / determinant;
  if (!Number.isFinite(lengthA) || !Number.isFinite(lengthB) || lengthA <= 0 || lengthB <= 0) {
    throw new Error(
      `the solved straights are not rideable: ${free[0].id}=${lengthA}, ${free[1].id}=${lengthB}`,
    );
  }
  return new Map([[free[0].id, lengthA], [free[1].id, lengthB]]);
}

const SOLVED = solveLoop(TRACK_LOOP);

/** Every element with its final length and curvature. The lap as geometry. */
export const TRACK_GEOMETRY: readonly {
  readonly id: string;
  readonly length: number;
  readonly curvature: number;
  readonly turn: number;
  readonly radius: number;
}[] = TRACK_LOOP.map((element) => ({
  id: element.id,
  length: lengthOf(element, SOLVED),
  curvature: curvatureOf(element),
  turn: element.turn ?? 0,
  radius: element.radius ?? 0,
}));

/** Total centreline length of one lap, metres. */
export const TRACK_LAP_METRES = TRACK_GEOMETRY.reduce((total, element) => total + element.length, 0);

/** Distance along the lap to the entry socket of each segment, metres. */
export const TRACK_ENTRY_DISTANCE: ReadonlyMap<string, number> = (() => {
  const out = new Map<string, number>();
  let along = 0;
  for (const element of TRACK_GEOMETRY) {
    out.set(element.id, along);
    along += element.length;
  }
  return out;
})();

// ---------------------------------------------------------------------------
// What each corridor carries
// ---------------------------------------------------------------------------

/**
 * The geometry of one barrier line on one corridor.
 *
 * A block is a box and a box is straight, so a barrier on an arc is a chain of
 * chords. The chord's sagitta is `a² / 2r` at half-length `a`, and the radius
 * that matters is the *barrier's* rather than the corridor's — the inside of
 * the hairpin runs at 5.6 m where its centreline runs at 14 — so the panel
 * length is derived from the barrier line itself and not from the corner.
 *
 * **`arcScale` is the whole reason this is a function rather than two lines.**
 * `s` and `halfAlong` are not in the same frame: `collidersOf` reads `s` as a
 * distance along the *centreline* and `halfAlong` as a world half-length. On
 * the outside of a corner the barrier's own arc is longer than the centreline
 * it is spaced against, so boxes spaced evenly in `s` and sized in metres fall
 * short of each other — 1.28 m short every 4.6 m around the hairpin on the
 * first B0 build, which is a hole a wheel fits through. A coverage test
 * written in `s` shared the mistake and passed.
 */
export function barrierLine(curvature: number, side: 1 | -1): {
  readonly t: number;
  readonly arcScale: number;
  /** Longest panel this line may use before it chords off its own arc, m. */
  readonly panelMax: number;
  /** Overlap each joint on this line needs to close its corner splay, m. */
  readonly joint: number;
} {
  const t = side * TRACK.barrierOffset;
  if (curvature === 0) {
    return { t, arcScale: 1, panelMax: TRACK.barrierModule, joint: TRACK.barrierJointFloor };
  }
  // Radius of this barrier line about the arc's own centre: a point at lateral
  // `t` sits at `1/|k| - t·sign(k)`, so the outside of a right-hander is wider
  // than its corridor and the inside of one is tighter.
  const radius = 1 / Math.abs(curvature) - t * Math.sign(curvature);
  const facetHalf = Math.min(
    TRACK.barrierFacetHalfMax,
    Math.sqrt(2 * Math.max(1, radius) * TRACK.barrierFacetSag),
  );
  const panelMax = Math.min(TRACK.barrierModule, facetHalf * 2);
  return {
    t,
    arcScale: radius * Math.abs(curvature),
    panelMax,
    // The splay a chord pair opens at its outer corners, `halfLateral × Δθ`,
    // with the panel's own turned angle for Δθ.
    joint: Math.max(
      TRACK.barrierJointFloor,
      TRACK.barrierHalfLateral * (panelMax / radius) * TRACK.barrierJointSafety,
    ),
  };
}

/**
 * One unbroken run of barrier, cut into panels, alternating from `index`.
 *
 * Returns the panels and the index the next run continues from, so a whole
 * side of the circuit alternates as one sequence rather than restarting its
 * phase at every corridor seam — see `barrierRing`.
 */
function barrierRunPanels(
  curvature: number,
  side: 1 | -1,
  from: number,
  to: number,
  index: number,
): { readonly blocks: SegmentBlock[]; readonly index: number } {
  const span = to - from;
  if (span <= 1e-9) return { blocks: [], index };

  const line = barrierLine(curvature, side);
  const count = Math.max(1, Math.ceil((span * line.arcScale) / line.panelMax));
  const step = span / count;
  const halfAlong = (step * line.arcScale) / 2 + line.joint;

  const blocks: SegmentBlock[] = [];
  for (let panel = 0; panel < count; panel += 1) {
    // Red proud, pale recessed. `barrierPanelStep` says why the two cannot be
    // the same width.
    const red = (index + panel) % 2 === 1;
    blocks.push({
      s: from + step * (panel + 0.5),
      t: line.t,
      halfAlong,
      halfLateral: red
        ? TRACK.barrierHalfLateral
        : TRACK.barrierHalfLateral - TRACK.barrierPanelStep,
      height: TRACK.barrierHeight,
      surface: 'pavement' as SurfaceId,
      appearance: red ? ('signalRed' as const) : ('concrete' as const),
    });
  }
  return { blocks, index: index + count };
}

/**
 * How many metres of paint one metre of centreline buys, at a lateral offset.
 *
 * `SegmentMarking` paths are in centreline `s`, and a line at `t` on an arc is
 * a different length from the centreline it is measured against — the outside
 * of a corner is longer, the inside shorter. Every length rule that acts on
 * paint (`TRACK.kerbStripe`, `MARKINGS.minRunLength`, `TRACK.paintGap`) is a
 * rule about *world* metres, so it has to cross this first. Getting it wrong
 * once already nearly deleted every stripe on the hairpin.
 */
function arcScaleAt(curvature: number, t: number): number {
  if (curvature === 0) return 1;
  return (1 / Math.abs(curvature) - t * Math.sign(curvature)) * Math.abs(curvature);
}

/**
 * One kerb, as alternating red and white bars along the corner's inside edge.
 *
 * **Red/white kerbs cost this venue no draw call at all**, which is the
 * difference between a `MarkingPaint` and a `MaterialId`: all the paint in a
 * level is one mesh and one material, and a paint's identity rides on the
 * vertex colour (`data/markings.ts`). So the thing that most says *circuit* to
 * anyone glancing at a corner is free, where the barrier's red was not.
 *
 * **The bars stand clear of each other rather than abutting**, by half a
 * `TRACK.paintGap` at each end. Abutting was the intent and it does not
 * survive a curve: two ribbons that share an endpoint on an arc are two chords
 * meeting at an angle, so they splay apart on the outside of the joint and
 * *overlap* on the inside — the barrier's problem exactly, at paint scale, and
 * ninety-four wedges of it around this lap. Daylight costs a seam a rider
 * cannot see and a real kerb has one anyway, being cast in sections.
 *
 * **That rule is about the neighbours in this run and about the run underneath
 * it equally**, which is the half B1 missed: these bars sit on `paintOffset`,
 * where the edge line already is. `trackMarkings` breaks the edge line around
 * whatever span a kerb occupies, so a kerb is the only paint on its own line.
 */
function kerbStripes(
  curvature: number,
  t: number,
  from: number,
  to: number,
): SegmentMarking[] {
  const span = to - from;
  if (span <= 0) return [];

  // The kerb's own radius, and therefore how many metres of paint one metre of
  // centreline buys. See `TRACK.kerbStripe`.
  const world = span * arcScaleAt(curvature, t);
  const count = Math.max(1, Math.floor(world / TRACK.kerbStripe));

  // Too short to stripe without the builder throwing the offcuts away. One
  // plain bar is a kerb somebody has not repainted, which is a fair thing for
  // a grassroots venue to have. What survives the builder is the bar minus the
  // daylight at both of its ends, so that is what has to clear the minimum.
  if (world / count - TRACK.paintGap < MARKINGS.minRunLength) {
    return [{ path: [{ s: from, t }, { s: to, t }], role: 'bar' }];
  }

  const scale = arcScaleAt(curvature, t);
  const step = span / count;
  const inset = TRACK.paintGap / 2 / scale;
  const stripes: SegmentMarking[] = [];
  for (let index = 0; index < count; index += 1) {
    stripes.push({
      path: [
        { s: from + step * index + inset, t },
        { s: from + step * (index + 1) - inset, t },
      ],
      role: 'bar',
      ...(index % 2 === 0 ? { paint: 'kerb' as const } : {}),
    });
  }
  return stripes;
}

/**
 * Edge lines down both sides of the asphalt, plus this corner's kerbs.
 *
 * **Every role here is painted on the same two lines, so the function's real
 * job is making sure only one of them occupies any stretch of either.** All
 * the paint in a level is one mesh at one height, so two runs that share
 * ground do not stack — they fight, and the fight is silent until their
 * colours differ. It stayed silent through B1 because a white kerb bar over a
 * white edge line looks exactly like a white edge line.
 */
function trackMarkings(id: string, length: number, turn: number): SegmentMarking[] {
  const from = TRACK.paintInset;
  const to = length - TRACK.paintInset;
  const markings: SegmentMarking[] = [];

  // The kerbs, as the spans of `s` they claim, before any line is laid.
  //
  // The apex kerb is on the inside of the corner. Turning right puts the
  // centre of the turn on the rider's right, and +t is the rider's LEFT, so
  // the inside of a right-hander is the negative side — which `Math.sign` of a
  // negative turn gives directly. The exit kerb is the mirror of it over the
  // corner's final 38%, where a rider unwinding the lean runs out to the far
  // edge. A corner therefore carries at most one kerb per side.
  const curvature = turn === 0 ? 0 : Math.sign(turn) / (length / (Math.abs(turn) * DEGREE));
  const kerbs: { readonly t: number; readonly from: number; readonly to: number }[] = [];
  if (turn !== 0) {
    const inside = Math.sign(turn) * TRACK.paintOffset;
    kerbs.push({ t: inside, from: length * 0.15, to: length * 0.85 });
    if (Math.abs(turn) >= 55) {
      kerbs.push({ t: -inside, from: length * 0.62, to });
    }
  }

  // Edge line in whatever each side has left. Where a kerb runs, the kerb *is*
  // the edge marking, which is both what removes the overlap and what a real
  // apex kerb does to the line it interrupts.
  for (const side of [1, -1] as const) {
    const t = side * TRACK.paintOffset;
    const kerb = kerbs.find((candidate) => Math.sign(candidate.t) === side);
    // Both the gap and the minimum are rules about metres of paint, and `s` is
    // a centreline distance, so each crosses `arcScaleAt` before it is used.
    const scale = arcScaleAt(curvature, t);
    const gap = TRACK.paintGap / scale;
    const spans = kerb === undefined
      ? [{ from, to }]
      : [{ from, to: kerb.from - gap }, { from: kerb.to + gap, to }];
    for (const span of spans) {
      // Never author a run the builder would discard: `trackLevel.test.ts`
      // asserts that everything authored survives, and that claim is only
      // worth having if nothing is authored in the knowledge it will not.
      if ((span.to - span.from) * scale < MARKINGS.minRunLength) continue;
      markings.push({ path: [{ s: span.from, t }, { s: span.to, t }], role: 'edge' });
    }
  }

  for (const kerb of kerbs) {
    markings.push(...kerbStripes(curvature, kerb.t, kerb.from, kerb.to));
  }

  // A bar across the track stops short of both edge lines, for the same reason
  // the kerbs give way to them: crossing one puts two coplanar ribbons on the
  // same ground. The gap is six centimetres at the end of a nine-metre bar.
  const barReach = TRACK.paintOffset - MARKINGS.edgeWidth / 2 - TRACK.paintGap;

  // The start/finish line: two bars across the asphalt so it reads as a line
  // rather than as a marking. `main` is the only corridor that carries it.
  if (id === 'main') {
    for (const offset of [-0.3, 0.3]) {
      markings.push({
        path: [
          { s: TRACK.lineAt + offset, t: -barReach },
          { s: TRACK.lineAt + offset, t: barReach },
        ],
        role: 'bar',
      });
    }
  }

  // A sector line is one bar in the park's duller paint, so the two kinds of
  // line across the track cannot be confused at speed.
  const sector = TRACK_SECTOR_LINES.find((line) => line.segment === id);
  if (sector !== undefined) {
    markings.push({
      path: [{ s: sector.s, t: -barReach }, { s: sector.s, t: barReach }],
      role: 'bar',
      paint: 'path',
    });
  }

  return markings;
}

/** Where each sector ends, as a distance along the segment that carries it. */
const TRACK_SECTOR_LINES: readonly { readonly segment: string; readonly s: number }[] = [
  { segment: 'backstretch', s: 8 },
  { segment: 'climb', s: 14 },
];

/**
 * The verge outside the asphalt: grass, or gravel where running wide is fast.
 *
 * Gravel goes on the outside of the three corners a rider arrives at quickest
 * — the sweeper, the heavy-braking corner and the final corner — and on the
 * chute that brakes into the second of them, because a run-off that starts at
 * the corner starts too late. Everywhere else is grass, which is slow and
 * survivable: a hairpin overshoot at 20 mph should cost a place, not the lap.
 *
 * `surfaceAtLateral` takes the first band whose half-open span contains `t`,
 * so the asphalt is exactly `[-asphaltHalf, +asphaltHalf]` and the two bands
 * own everything outside it.
 */
function verge(gravelOutside: boolean, turn: number): { from: number; to: number; surface: SurfaceId }[] {
  // The outside of a right-hander is the rider's LEFT, which is positive t.
  //
  // **A straight has no outside of its own**, so `turn === 0` falls into the
  // right-hander branch deliberately: a straight carries run-off for the corner
  // it *feeds*, and the only one here — the chute — feeds a right-hander.
  // `trackLevel.test.ts` holds that true rather than leaving it as a
  // coincidence, so a gravel straight added before a left-hander fails there
  // instead of putting the trap on the wrong side of the road.
  const outsideIsLeft = turn <= 0;
  const left: SurfaceId = gravelOutside && outsideIsLeft ? 'gravel' : 'grass';
  const right: SurfaceId = gravelOutside && !outsideIsLeft ? 'gravel' : 'grass';
  return [
    { from: -TRACK.halfWidth, to: -TRACK.asphaltHalf, surface: right },
    { from: TRACK.asphaltHalf, to: TRACK.halfWidth, surface: left },
  ];
}

/** Segments whose outside verge is gravel rather than grass. */
export const GRAVEL_RUNOFF: readonly string[] = ['sweeper', 'chute', 'brakes', 'last'];

// ---------------------------------------------------------------------------
// The dressing — Phase B1
// ---------------------------------------------------------------------------

/**
 * The venue's own name, and the only lettering anywhere on it.
 *
 * **`data/props.ts` owns the word the gantry actually prints**, because
 * `render/props.ts` builds that geometry and may not import a level. This is
 * the other end of that wire, checked at module load rather than left to a
 * comment: a gantry announcing somewhere else is not something a screenshot
 * would catch, because it would simply look like a word.
 */
export const TRACK_NAME = 'BelVar Circuit';

// The **whole** name, not its first word. The original compared against
// `TRACK_NAME.split(' ')[0]`, which is a guard that agrees with a banner
// announcing half the venue — and that is exactly what shipped through B1
// until the owner rode it. A check narrowed to the part that is present
// cannot report the part that is missing.
if (GANTRY_WORDMARK !== TRACK_NAME.toUpperCase()) {
  throw new Error(`the gantry prints ${GANTRY_WORDMARK}, and the venue is ${TRACK_NAME}`);
}

/**
 * The two legs of the start gantry, as authored blocks on `main`.
 *
 * **A prop cannot span a road and a block cannot leave the ground, so the
 * gantry is one of each.** These are the solid half: two posts just outside
 * the corridor, carrying the truss that `trackProps` stands on top of them.
 * They are the only blocks on the venue that are not barrier, and they share
 * the barrier's own pale material, so they cost this frame nothing at all.
 *
 * Their lateral offset is the truss's own half-span, so widening one widens
 * the other and the truss always lands on its legs.
 */
function gantryLegs(): SegmentBlock[] {
  return [1, -1].map((side) => ({
    s: TRACK.gantryAt,
    t: side * PROP_SIZES.gantrySpan.halfSpan,
    halfAlong: TRACK.gantryLegHalf,
    halfLateral: TRACK.gantryLegHalf,
    height: TRACK.gantryLegHeight,
    surface: 'pavement' as SurfaceId,
    // **`concrete`, not `metal`, and it is a lighting argument rather than a
    // material one.** `metal` sits at 0.10 linear, which is fine on a bollard
    // read against the ground and is a black cutout on a six-metre leg read
    // against the sky — the brightest thing in the frame. Kerb concrete is the
    // palette's lightest value and is already on this venue in every pale
    // barrier panel, so the legs also cost the frame no draw call at all.
    appearance: 'concrete' as const,
  }));
}

/**
 * Dressing authored against one corridor of the lap.
 *
 * **The tyre bundles are at a barrier gate, and that is a fact about barriers
 * rather than a shortage of ideas.** A stack is 0.88 m tall and a barrier is
 * 0.9 m, so a bundle placed behind the barrier line — where the builder's
 * corridor rule requires it to be — is a bundle nobody can see from the racing
 * surface. The only places on the venue where the barrier *stops* are its two
 * gates, and a real circuit protects the exposed end of a barrier run at
 * exactly those openings. The other gate's bundles are authored on the paddock
 * road that leaves through it, and the rest are in the paddock itself, which
 * is read across the open infield from the far side of the lap.
 */
function trackProps(id: string): SegmentProp[] {
  const props: SegmentProp[] = [];

  if (id === 'main') {
    // The truss, standing on the two leg blocks — `onCollider` in the literal
    // sense the flag was written for, one storey up from a crown on a trunk.
    props.push({
      s: TRACK.gantryAt,
      t: 0,
      kind: 'gantrySpan',
      lift: TRACK.gantryLegHeight,
      onCollider: true,
    });
  }

  for (const gate of BARRIER_GATES) {
    if (gate.segment !== id) continue;
    // The gate the paddock road leaves by has a corridor of its own on this
    // ground; its bundles are authored on that road instead, at its mouth.
    if (gate.segment === PADDOCK.gate) continue;
    // Per kind rather than the library's worst case: the widest footprint in
    // the kit is a conifer's 2.2 m skirt, and holding a 0.44 m tyre bundle to
    // that would stand it four and a half metres back from an opening it is
    // supposed to be guarding.
    const t = gate.side * (propStandOff('tyreStack') + 0.6);
    // Three a side, staggered, so the pile reads as a bundle rather than as a
    // row of bollards.
    for (const [along, out] of [[-2.4, 0], [-0.6, 1.1], [1.1, 0.3]] as const) {
      for (const end of [gate.from, gate.to] as const) {
        props.push({
          s: end + (end === gate.from ? -1 : 1) * (1.4 + along),
          t: t + gate.side * out,
          kind: 'tyreStack',
        });
      }
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// The paddock
// ---------------------------------------------------------------------------

/**
 * How wide the paddock apron is and how long the road to it runs, metres.
 *
 * The apron is a corridor rather than a painted rectangle because a surface is
 * a property of a corridor in this engine, and a paddock that is not
 * hardstanding is a field with sheds in it. Making it rideable is the same
 * decision the barrier gates already took: "go anywhere" is LOCKED, and a
 * venue whose paddock is scenery would be the first place in the game a rider
 * can see and not reach.
 */
export const PADDOCK = Object.freeze({
  /** Which gate the paddock road leaves the circuit through. */
  gate: 'exit',
  /** Distance along that corridor where the road leaves it. */
  at: 10,
  roadLength: 30,
  roadHalfWidth: 4.5,
  /**
   * Forty by twenty-six metres of hardstanding.
   *
   * **Sized down from the first pass, which was fifteen metres wider and read
   * as an empty car park.** A paddock is a place where things are close
   * together — a rider walking between a van and a shed — and the same
   * furniture spread over half as much ground again reads as a slab with
   * objects at its corners. It is still large enough for the whole cluster to
   * be one recognisable shape seen across the infield from the main straight,
   * which is where it is read from on most laps.
   */
  apronLength: 40,
  apronHalfWidth: 13,
});

/**
 * The paddock, as a branch off the marshals' gate into the infield.
 *
 * **It hangs off `exit` and not off `main`, and the reason is topology rather
 * than taste.** The circuit turns a net −360°, so its infield is on the
 * rider's *right* and the two authored barrier gates open into different
 * places: the one on `main` faces the outer field, and the one on `exit` is
 * the only opening on the whole venue that reaches the infield. §23.14 settled
 * that the paddock goes inside the loop and reuses an existing gate; only one
 * gate can satisfy both, and this is it. Neither gate moves, so §23.15's cut
 * catalog still describes the barrier it was written against.
 */
const PADDOCK_BRANCH: SegmentBranch = {
  from: PADDOCK.gate,
  atDistance: PADDOCK.at,
  // Out to the corridor's own edge, then a right-angle turn inward. Positive
  // is the rider's LEFT and the infield is on their right, so both are
  // negative.
  lateralOffset: -TRACK.halfWidth,
  headingOffset: -Math.PI / 2,
  specs: [
    {
      id: 'paddock-road',
      length: PADDOCK.roadLength,
      halfWidth: PADDOCK.roadHalfWidth,
      surface: 'roughPavement',
      props: paddockRoadProps(),
    },
    {
      id: 'paddock',
      length: PADDOCK.apronLength,
      halfWidth: PADDOCK.apronHalfWidth,
      surface: 'roughPavement',
      props: paddockProps(),
    },
  ],
};

/**
 * A fence down each side of the access road, and tyres at its mouth.
 *
 * The fence starts clear of the road's own root: the first metres of it run
 * inside the `exit` corridor it leaves from — that is what a junction *is* —
 * and a bay authored there is a bay the builder deletes.
 */
function paddockRoadProps(): SegmentProp[] {
  const props: SegmentProp[] = [];
  const t = PADDOCK.roadHalfWidth + PROP_CORRIDOR_CLEARANCE + PROP_SIZES.fenceBay.postWidth;
  const from = TRACK.halfWidth - PADDOCK.roadHalfWidth + 2.5;
  for (const side of [-1, 1] as const) {
    for (let along = from; along < PADDOCK.roadLength - 1.2; along += PROP_SIZES.fenceBay.length) {
      props.push({ s: along, t: side * t, kind: 'fenceBay' });
    }
    // The bundles that protect the exposed end of the barrier run this road
    // passes through, which is what a circuit puts at an opening.
    for (const [along, out] of [[0, 0], [1.0, 0.85]] as const) {
      props.push({ s: from + 0.4 + along, t: side * (t + 1.1 + out), kind: 'tyreStack' });
    }
  }
  return props;
}

/**
 * The paddock itself: two sheds, a clubhouse, tyres, and the things a place
 * where people spend a day has.
 *
 * Every kind here was already in the library, which is the whole point of
 * §23.14's *spend triangles, not draw calls*: a building costs this venue one
 * call it was not paying and the ceiling nothing at all, because
 * `buildingBody`, `buildingCap` and friends have been counted since M7.5.
 *
 * The lateral offsets are all derived from the apron's own half-width plus
 * what the builder demands, because a building authored a metre too close is
 * a building the builder deletes without saying so.
 */
function paddockProps(): SegmentProp[] {
  // **A knife edge, not a taste** — the same one `TRACK.paintInset` records.
  // `standsOnCorridor` refuses a prop whose footprint comes within
  // `PROP_CORRIDOR_CLEARANCE` of a corridor, and a building authored at
  // exactly that distance lands a rounding error inside it: the first draft
  // put the clubhouse's near wall on 0.5000 m and lost the whole building.
  // Forty centimetres of daylight costs nothing and is not a coin toss.
  const edge = PADDOCK.apronHalfWidth + PROP_CORRIDOR_CLEARANCE + 0.4;
  // **Nothing here is under four metres**, which is a facade constraint rather
  // than a taste: `BUILDING_FACADE.lowRiseFloors` is two bands, and two bands
  // under `minFloorHeight` each are the striping this venue shipped with. A
  // shorter shed has no facade in the library that fits it, and
  // `render/props.test.ts` measures every instance and refuses.
  const sheds: SegmentProp[] = [
    // The workshop, long side to the apron.
    { s: 15, t: -(edge + 5), kind: 'building', size: { x: 10, y: 5.0, z: 15 } },
    // The clubhouse, opposite it.
    { s: 12, t: edge + 4, kind: 'building', size: { x: 8, y: 4.2, z: 11 } },
    // A lock-up at the head of the apron.
    { s: 33, t: -(edge + 4.5), kind: 'building', size: { x: 9, y: 4.0, z: 8 } },
    // And a low store across the head of it, so the paddock has a back wall
    // rather than running out into the field. Offset from the centreline: at
    // `t = 2` its near face sat directly behind a rider leaving the apron and
    // collapsed the chase arm to 1.6 m for more than a second.
    { s: 45, t: 9, kind: 'building', size: { x: 13, y: 4.0, z: 7 } },
  ];

  const props: SegmentProp[] = [...sheds];

  // Tyres, in bundles along the apron's fringe. They stand just off the
  // hardstanding rather than on it, because the builder refuses dressing
  // inside a rideable corridor and an apron is one — which is also where a
  // paddock actually keeps them, out of the way of what is being wheeled
  // about. Nothing stands between these and the infield, so they are the
  // bundles the venue is read by from the far side of the lap.
  // Clear in `s` of the sheds' own footprints as well as in `t`: the fringe
  // runs through the lateral band every shed occupies, so a bundle beside one
  // is a bundle inside it.
  const fringe = edge + PROP_SIZES.tyreStack.radius + 0.5;
  for (const [along, side, out] of [
    [26.0, 1, 0], [26.9, 1, 0.85], [27.8, 1, 0],
    [25.0, -1, 0], [25.9, -1, 0.85],
    [39.5, -1, 0], [40.4, -1, 0.85],
  ] as const) {
    props.push({ s: along, t: side * (fringe + out), kind: 'tyreStack' });
  }

  props.push({ s: 2.2, t: edge + 1.2, kind: 'signpost', yaw: facing(edge + 1.2) });
  props.push({ s: 20, t: edge + 1.4, kind: 'bench', yaw: facing(edge + 1.4) });
  props.push({ s: 23.4, t: edge + 1.4, kind: 'litterBin' });
  // Clear of the sheds in `s` as well as in `t`: a lamp inside a building's
  // own footprint is a lamp the builder removes without comment.
  for (const [along, side] of [[2.5, -1], [33, 1]] as const) {
    const t = side * (edge + 1.1);
    props.push({ s: along, t, kind: 'lampPost', yaw: facing(t) });
  }
  // Trees at the far end, so the paddock has a back rather than an edge.
  props.push({ s: 38.5, t: edge + 6, kind: 'broadleafTree' });
  props.push({ s: 39.5, t: edge + 13, kind: 'conifer' });
  props.push({ s: 41, t: -(edge + 9), kind: 'broadleafTree' });

  return props;
}

/** Yaw, relative to a corridor, that turns a prop to face it. */
function facing(t: number): number {
  return t > 0 ? -Math.PI / 2 : Math.PI / 2;
}

// ---------------------------------------------------------------------------
// The site — what says this whole patch of land is a venue
// ---------------------------------------------------------------------------

/**
 * How far outside the circuit's own bounds the site fence stands, metres.
 *
 * **The venue has two boundary rings and they do different jobs.** The barrier
 * is the racing surface's edge and is read at two metres; this is the
 * property's edge and is read at eighty. Without it the circuit is asphalt
 * laid at random in an infinite field, which is what B0 looked like — the
 * ground runs to the horizon in every direction and nothing says where the
 * place stops.
 */
export const SITE_MARGIN = 26;

/**
 * The site fence and the planting beyond it, in world coordinates.
 *
 * **World-space rather than authored against a corridor, and that is the
 * shape of the thing.** A fence at a fixed offset from the track would snake
 * around every corner with it, which is not what a property boundary does; a
 * venue is a rectangle of land with a circuit inside it. `BuildOptions.props`
 * exists for exactly this — dressing that belongs to the level rather than to
 * any one segment.
 *
 * Everything here still goes through the builder's own refusals, so a bay that
 * would stand in a corridor is dropped rather than drawn. `trackLevel.test.ts`
 * counts what survives, because a silent drop is how dressing disappears.
 */
function siteProps(): PlacedProp[] {
  const props: PlacedProp[] = [];

  // The circuit's own extent, measured rather than typed: the centreline walk
  // plus a corridor half-width and the run-off beyond it.
  const bounds = lapBounds();
  const minX = bounds.minX - SITE_MARGIN;
  const maxX = bounds.maxX + SITE_MARGIN;
  const minZ = bounds.minZ - SITE_MARGIN;
  const maxZ = bounds.maxZ + SITE_MARGIN;

  const bay = PROP_SIZES.fenceBay.length;
  const run = (
    fromX: number, fromZ: number, toX: number, toZ: number,
  ): void => {
    const spanX = toX - fromX;
    const spanZ = toZ - fromZ;
    const length = Math.hypot(spanX, spanZ);
    const bays = Math.max(1, Math.round(length / bay));
    const rotationY = Math.atan2(spanX / length, spanZ / length);
    for (let index = 0; index < bays; index += 1) {
      const at = (index + 0.5) / bays;
      props.push({
        kind: 'fenceBay',
        x: fromX + spanX * at,
        z: fromZ + spanZ * at,
        rotationY,
        scale: 1,
        lift: 0,
      });
    }
  };

  run(minX, maxZ, maxX, maxZ);
  run(maxX, maxZ, maxX, minZ);
  run(maxX, minZ, minX, minZ);
  run(minX, minZ, minX, maxZ);

  // Planting beyond the fence: a sparse belt, jittered off a lattice by the
  // project's own hash rather than by `Math.random`, so the venue looks the
  // same on every boot (`DESIGN.md` §4 rule 3).
  const belt = 34;
  const spacing = 21;
  for (let x = minX - belt; x <= maxX + belt; x += spacing) {
    for (let z = minZ - belt; z <= maxZ + belt; z += spacing) {
      // Outside the fence and clear of it: a tree standing in the fence line is
      // a tree the builder drops, silently, in favour of the bay.
      const clear = 6;
      const inside = x > minX - clear && x < maxX + clear && z > minZ - clear && z < maxZ + clear;
      if (inside) continue;
      const keep = positionHash01(x, z, 21);
      if (keep > 0.42) continue;
      // Half the lattice, so two neighbours cannot close to less than a crown.
      const jitterX = (positionHash01(x, z, 5) - 0.5) * spacing * 0.5;
      const jitterZ = (positionHash01(x, z, 9) - 0.5) * spacing * 0.5;
      props.push({
        kind: positionHash01(x, z, 13) > 0.62 ? 'conifer' : 'broadleafTree',
        x: x + jitterX,
        z: z + jitterZ,
        rotationY: positionHash01(x, z, 17) * Math.PI * 2,
        scale: 0.85 + positionHash01(x, z, 23) * 0.45,
        lift: 0,
      });
    }
  }

  return props;
}

/** The lap's own extent in world XZ, including its corridors. */
function lapBounds(): {
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let x = TRACK_SPAWN.position.x;
  let z = TRACK_SPAWN.position.z;
  let heading = TRACK_SPAWN.headingY;
  const see = (px: number, pz: number): void => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (pz < minZ) minZ = pz;
    if (pz > maxZ) maxZ = pz;
  };
  for (const element of TRACK_GEOMETRY) {
    const steps = Math.max(2, Math.ceil(element.length / 4));
    for (let step = 0; step < steps; step += 1) {
      const along = element.length / steps;
      if (element.curvature === 0) {
        x += Math.sin(heading) * along;
        z += Math.cos(heading) * along;
      } else {
        const exit = heading + element.curvature * along;
        x += (Math.cos(heading) - Math.cos(exit)) / element.curvature;
        z += (Math.sin(exit) - Math.sin(heading)) / element.curvature;
        heading = exit;
      }
      see(x + TRACK.halfWidth, z + TRACK.halfWidth);
      see(x - TRACK.halfWidth, z - TRACK.halfWidth);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Every barrier panel on one side of the lap, keyed by the corridor it sits on.
 *
 * **The alternation is walked once around the ring, not computed per corridor,
 * and that is the point of this function.** A phase that restarts at each
 * corridor's entry socket puts two panels of the same colour together at
 * whichever of the eighteen seams the previous corridor's length happened not
 * to divide — which is most of them, and reads as a manufacturing defect
 * rather than as a barrier.
 *
 * Each side carries exactly **one** gate (`BARRIER_GATES`), so each side's
 * barrier is one unbroken run from the far lip of its own gate, all the way
 * around the circuit, to the near lip of the same gate. Starting the walk at
 * the gate is what puts the ring's one unavoidable seam — a closed ring's arc
 * length is not an even number of panels — inside a hole nobody can see it in.
 */
function barrierRing(side: 1 | -1): Map<string, SegmentBlock[]> {
  const gate = barrierGateForSide(side);
  const start = TRACK_GEOMETRY.findIndex((element) => element.id === gate.segment);
  if (start < 0) throw new Error(`the ${gate.what} names a corridor the lap does not have`);

  const out = new Map<string, SegmentBlock[]>();
  const push = (id: string, blocks: readonly SegmentBlock[]): void => {
    const list = out.get(id);
    if (list === undefined) out.set(id, [...blocks]);
    else list.push(...blocks);
  };

  let index = 0;
  const gated = TRACK_GEOMETRY[start];

  // Out of the gate, around the lap, and back to the gate's near lip.
  let run = barrierRunPanels(gated.curvature, side, gate.to, gated.length, index);
  push(gated.id, run.blocks);
  index = run.index;

  for (let step = 1; step < TRACK_GEOMETRY.length; step += 1) {
    const element = TRACK_GEOMETRY[(start + step) % TRACK_GEOMETRY.length];
    run = barrierRunPanels(element.curvature, side, 0, element.length, index);
    push(element.id, run.blocks);
    index = run.index;
  }

  run = barrierRunPanels(gated.curvature, side, 0, gate.from, index);
  push(gated.id, run.blocks);
  return out;
}

/** Both rings, resolved once, so `TRACK_GRAPH` is a lookup rather than a walk. */
const BARRIER_BLOCKS: ReadonlyMap<string, readonly SegmentBlock[]> = (() => {
  const merged = new Map<string, SegmentBlock[]>();
  for (const side of [-1, 1] as const) {
    for (const [id, blocks] of barrierRing(side)) {
      const list = merged.get(id);
      if (list === undefined) merged.set(id, [...blocks]);
      else list.push(...blocks);
    }
  }
  return merged;
})();

/** The authored circuit, one `SegmentSpec` per element of the lap. */
export const TRACK_GRAPH: readonly SegmentSpec[] = TRACK_GEOMETRY.map((element) => {
  const blocks = [...(BARRIER_BLOCKS.get(element.id) ?? [])];
  if (element.id === 'main') blocks.push(...gantryLegs());
  const props = trackProps(element.id);

  const spec: SegmentSpec = {
    id: element.id,
    length: element.length,
    halfWidth: TRACK.halfWidth,
    surface: 'pavement',
    bands: verge(GRAVEL_RUNOFF.includes(element.id), element.turn),
    blocks,
    markings: trackMarkings(element.id, element.length, element.turn),
    ...(props.length === 0 ? {} : { props }),
    ...(element.curvature === 0 ? {} : { curvature: element.curvature }),
  };
  return spec;
});

/**
 * The lap's own corridors, in riding order.
 *
 * **Separate from `TRACK_GRAPH` from Phase B1, because the plan now holds
 * corridors that are not the lap.** The paddock is rideable ground reached
 * through a gate, so it is a `SegmentSpec` like any other and appears in
 * `LevelPlan.segments` beside the eighteen — and anything that means *the
 * circuit* has to say so rather than taking every corridor the plan carries.
 * The routed-lap acceptance ride is the case that matters: handed the whole
 * list it would try to drive up the paddock road.
 */
export const TRACK_LAP_SEGMENT_IDS: readonly string[] = TRACK_GEOMETRY.map((element) => element.id);

/** The venue, as the graph the builder takes: the lap, plus the paddock. */
export const TRACK_SITE: SegmentGraph = { main: TRACK_GRAPH, branches: [PADDOCK_BRANCH] };


// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

/**
 * The start/finish line and the two sector lines — §23.13's "start/finish and
 * sector volumes", authored as the `Checkpoint` volumes §23.6 reuses.
 *
 * **There is no `finish`, and that is the shape of a lap rather than an
 * omission.** A closed circuit has one line: crossing it opens a lap and
 * crossing it again closes that lap and opens the next. Inventing a second
 * gate at the same coordinates to satisfy a point-to-point route's grammar
 * would put two gantries in one place and detect one crossing twice.
 * `buildPlan.ts`'s `assertRouteOrder` accepts both spellings and says why.
 *
 * The consequence is deliberate and correct: `ChallengeRun.available` asks
 * whether a route can *start and stop*, a lap cannot, and so the M10 time
 * trial declines this venue on its own terms without a single branch on which
 * level is loaded. The referee that can read these gates as a lap is Phase B2.
 *
 * Where each one sits, and why:
 *
 * - **the line**, 70 m along `main`. Far enough past the final corner's exit
 *   that a lap is timed from a rider at speed rather than from whatever they
 *   made of the corner, and 105 m short of the sweeper, so nobody is braking
 *   as they cross it.
 * - **sector 1**, 8 m into `backstretch`, closing the fast third: the main
 *   straight, the sweeper, the chute and the heavy-braking corner. The gate is
 *   on the straight just past that corner's exit, where the rider is upright.
 * - **sector 2**, 14 m up `climb`, closing the technical third: the back
 *   stretch, the kink, the loop and the hairpin. Out of the hairpin and
 *   accelerating, which is again a straight line through the gate.
 *
 * That splits 930 m into 337 / 299 / 294, and each third is a stretch a rider
 * can name.
 */
export const TRACK_CHECKPOINTS: readonly CheckpointSpec[] = [
  { id: 'line', segment: 'main', s: TRACK.lineAt, kind: 'start', label: 'Start/finish' },
  { id: 'sector-1', segment: 'backstretch', s: 8, kind: 'split', label: 'Sector 1' },
  { id: 'sector-2', segment: 'climb', s: 14, kind: 'split', label: 'Sector 2' },
];

/**
 * On the main straight, 70 m short of the line, facing the lap.
 *
 * The chain starts here, so this is also the first corridor's entry socket. A
 * rider gets an out-lap: seventy metres to find the throttle before the clock
 * has anything to say, which is what a track day looks like from the pit exit.
 */
export const TRACK_SPAWN: { position: Vec3; headingY: number } = {
  position: { x: 111, y: 0, z: -96 },
  headingY: 0,
};

/**
 * The site fence and its planting, resolved once.
 *
 * Exported so `trackLevel.test.ts` can count what was *authored* against what
 * survived the builder. The builder drops a prop that would stand in a
 * corridor or inside a wall and says nothing about it, which is the correct
 * behaviour for a generator and a silent hole in a hand-authored venue.
 */
export const TRACK_SITE_PROPS: readonly PlacedProp[] = siteProps();

/** Build BelVar Circuit. */
/**
 * What this venue paints the shared palette with — see `LevelPlan.palette`.
 *
 * **A race circuit is mown and a city verge is not**, and one global grass had
 * to be one or the other. The reference photographs the venue was designed
 * from are not merely brighter than ours: the dominant difference is *hue*.
 * Their turf carries a twelfth as much blue as green; the shared grass carries
 * two fifths. That is the difference between managed turf in summer and rough
 * ground, and it is the single largest reason the graybox read as a road laid
 * in a field rather than as a circuit.
 *
 * Linear (0.091, 0.165, 0.030), luminance 0.140 — inside `DESIGN.md` §2's
 * bounds, 1.4× the shared grass, and still well under the asphalt beside it so
 * the racing surface stays the brightest thing a rider is looking at.
 *
 * **It costs no draw call.** Draw calls are a set union over the library and
 * this adds nothing to the set; the alternative considered was a mown-turf
 * `SurfaceId` of its own, which would have spent three of the four calls the
 * phone budget had left to say what a colour says. Grip, particles, audio and
 * encroachment are all still `grass`, which is correct: this changes how the
 * field looks and nothing about what it is.
 */
export const TRACK_PALETTE = Object.freeze({ grass: 0x557130 });

export function createTrackLevel(
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
): LevelPlan {
  return buildLevelPlan(TRACK_SITE, {
    // **`-r1` is room to retire records, not decoration.** A personal best is
    // filed under this string, and a lap time on a layout that has since moved
    // is a lie the store cannot detect. Phase B0 iterates the layout at the
    // owner's gate and files nothing; the first change *after* records exist
    // bumps this, exactly as the generator's content revision does.
    id: 'belvar-r1',
    spawn: TRACK_SPAWN,
    // Grass at the circuit's own height, so riding out through a barrier gate
    // is riding onto the field beside the track rather than off the world.
    surround: { height: 0, surface: 'grass' },
    palette: TRACK_PALETTE,
    checkpoints: TRACK_CHECKPOINTS,
    // The site fence and its planting: level dressing rather than any one
    // corridor's, so it keeps the property's rectangle instead of snaking
    // around every corner of the circuit.
    props: TRACK_SITE_PROPS,
    ...(hazardProbeMetres === undefined ? {} : { hazardProbeMetres }),
    ...(targetProbeMetres === undefined ? {} : { targetProbeMetres }),
  });
}
