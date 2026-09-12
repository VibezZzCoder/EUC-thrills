/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { PROP_FOOTPRINTS } from '../data/props.ts';
import { TRACK_DAY } from '../data/tuning.ts';
import { BAY_LENGTH, TRAIL_CAMERA_GAP, type RailRun } from './parkDressing.ts';

/**
 * Fencing the *inside* of a bend — the owner's first rides of Switchback Park.
 *
 * **A pure authoring helper, like `parkDressing.ts` beside it.** It turns a
 * list of bends into `RailRun`s and nothing else: no plan, no heightfield, no
 * import from `render/`. The venue says which bends are fenced;
 * `parkDressing.railProps` lays the bays.
 *
 * ## The complaint this answers
 *
 * "Some of the corners are very tight and require slow speeds to make them.
 * More fencing will be required to block more of them off so players know not
 * to cut corners and 'cheat'." Phase 4 railed the **outside** of the four
 * hairpins, which says *it turns, and it turns this hard* from thirty metres
 * back — and says nothing at all about where the corner ends. The only thing
 * that caught a cut was `LapEnvelope.contains`, which voids the lap silently
 * and a lap later. So the inside of a bend needs a boundary a rider can *see*
 * and, if they insist, *hit*.
 *
 * ## Where the fence stands, and why it is one number
 *
 * The whole design is one offset, held constant round a bend and down the leg
 * it leaves on, and it is the larger of two bounds:
 *
 * ```text
 * offset = max(
 *   widest half-width at the bend + offCourseMarginMetres + FENCE_ENVELOPE_CLEAR,
 *   side × technical line + TRAIL_CAMERA_GAP + FENCE_BAY_REACH,
 * )
 * ```
 *
 * **The referee's own reach decides the first.** `LapEnvelope` calls a rider
 * on-course out to a half-width plus `TRACK_DAY.offCourseMarginMetres`, and the
 * *widest* of the two corridors either side of a span decides that span's
 * reach — so a fence pitched against the bend's own half-width would be inside
 * the envelope at a socket where a wider corridor joins it (the clearing
 * hairpin meets a nine-metre run-out; the summit turn meets a seven-metre
 * return). Taking the widest of the three is what makes one offset legal along
 * the whole run.
 *
 * **The chase camera decides the second, where a feature line is on the same
 * side.** Every feature on this venue stands on the rider's left (principle 1),
 * so on a left-hand bend the fence and the technical line are the same half of
 * the trail — and a bay inside `TRAIL_CAMERA_GAP` of that line swings the arm
 * on the approach, which is the rule a signpost is placed by and a tree refused
 * by. One bend on the park is decided by it rather than by the referee.
 *
 * Holding it constant is what makes the fence a **U** rather than two unrelated
 * pieces of furniture: the arc's offset and the leg's offset are the same
 * lateral distance in the same frame at the socket they share, so the bays meet
 * end on and the run reads as one continuous edge of trail. It is also what
 * makes the claim checkable in one line — *every bay centre stands `FENCE_ENVELOPE_CLEAR`
 * outside the ground the referee calls on-course* — rather than as a table of
 * per-bend distances nobody can re-derive.
 *
 * ## What it does not do
 *
 * It never fences ground a legal line can reach. A bend whose inside cannot
 * carry a run of bays outside the envelope is **refused at module load** rather
 * than fenced approximately: see `innerFences` below, and Switchback Park's own
 * `shelf-turn`, whose R10 infield is legal ground from edge to edge.
 */

/**
 * How far outside the lap envelope every bay centre stands, metres.
 * The rigid bay's edges reach closer; the installed test separately clears
 * their complete footprint against the rider's wall standoff on legal ground.
 *
 * **Half a metre is the claim; six tenths is what is authored.** The extra
 * tenth pays for the one place the envelope is not the arc it was sampled
 * from: `buildLevelPlan` walks the centreline every two metres and
 * `LapEnvelope` joins those samples with *chords*, which cut the corner and
 * carry the boundary up to `spacing² / (8 × radius)` further in on the inside
 * of a bend — 0.031 m at R16, 0.05 m at R10. A fence authored at exactly half
 * a metre would measure 0.469 m on the tightest arc the park fences and fail
 * its own test for a reason no reader could see.
 *
 * It is not a comfort margin for the rider: a rider is off-course before they
 * reach it, by construction. It is the margin that keeps the *authoring* honest
 * against the referee's own discretisation.
 */
export const FENCE_ENVELOPE_CLEAR = 0.6;

/**
 * How far a spine runs down the leg a hairpin leaves on, metres.
 *
 * A hairpin's two legs run parallel for their whole length, so "as long as the
 * legs run parallel" is not a bound — it would fence fifty-two metres of
 * `rock-rhythm` to catch a cut nobody would take, because a rider crossing the
 * infield thirty metres down the leg is twenty metres off-course and has
 * thrown the lap away several seconds earlier. Twenty-four metres is the
 * distance the cut is actually *tempting* over: it covers the exit socket, the
 * whole of the mouth a rider aims at out of the turn, and rather more than the
 * `CAMERA.distanceAtSpeed` the bend is read from.
 */
export const FENCE_SPINE_METRES = 24;

/**
 * The least inner radius a run of bays can follow, metres — one bay's length.
 *
 * A bay is a rigid 2.4 m chord (master §9.3: a run is built from whole bays,
 * never from one stretched bay), so an arc tighter than the bay itself turns
 * more than a radian per bay and the chord falls a tenth of a metre short of
 * the arc it stands in for. That still reads as a fence. Anything tighter is a
 * ring of planks around a point, which is why it is a refusal rather than a
 * clamp: a venue that wants a corner marked at a radius bays cannot follow
 * wants something this module does not build.
 */
export const FENCE_MIN_ARC_RADIUS = BAY_LENGTH;

/**
 * A bay's own widest reach in plan, metres — the figure a clearance measures.
 *
 * The half-diagonal of its footprint, which is very nearly its half-length: a
 * bay is 2.4 m of run and 0.11 m of post, so this over-reserves across the run
 * by more than a metre and never under-reserves along it. That is the right
 * way round for a camera bound — the arm swings past a bay end on, and a rule
 * that measured only the post's width would clear a fence the camera clips.
 */
export const FENCE_BAY_REACH = PROP_FOOTPRINTS.fenceBay.shape === 'box'
  ? Math.hypot(PROP_FOOTPRINTS.fenceBay.halfX, PROP_FOOTPRINTS.fenceBay.halfZ)
  : BAY_LENGTH / 2;

/** The geometry `innerFences` needs — `SwitchbackSegment` satisfies it. */
export interface FenceElement {
  readonly id: string;
  /**
   * The element's own turn, degrees, signed.
   *
   * **The sign is the whole of "which side is the inside".** Positive yaw turns
   * left and positive `t` is the rider's left, so a bend's inside is
   * `sign(turn)` — and on a hairpin it stays that side all the way round and
   * down the leg beyond it, because a rider circling an infield never puts it
   * on their other hand.
   */
  readonly turn: number;
  /** Arc radius, metres. Zero on a straight. */
  readonly radius: number;
  readonly length: number;
  readonly halfWidth: number;
}

/** A bend the venue wants fenced on the inside. */
export interface FencedBend {
  /** The bend's own id. It must be an element of the lap handed in. */
  readonly bend: string;
  /**
   * Where the arc starts, metres into the bend. Absent means at the socket.
   *
   * **For a bend whose entry socket is already occupied.** A fence bay is a
   * 2.4 m box and its own length reaches back *past* the socket into the leg
   * behind it, so a bend arrived at along a leg whose infield shoulder carries
   * cribbing has its first bay standing in the masonry — and `buildPlan`
   * deletes a prop inside a collider without a word. Starting the arc a little
   * way in is the authored answer, and it costs nothing legible: what fills the
   * gap is the thing that caused it.
   */
  readonly fromS?: number;
  /**
   * Continue the run down the leg the bend leaves on.
   *
   * A hairpin wants it: the cut it invites is the long one across the strip
   * between its legs, and the arc alone leaves that strip open. A 90° bend does
   * not — its legs diverge, so the only cut is across the apex and the arc is
   * the whole of the answer.
   */
  readonly spine: boolean;
  /**
   * The technical line this fence's own ground carries, in the corridor frame.
   *
   * **The second bound, and the one the referee knows nothing about.** The
   * chase camera reaches `TRAIL_CAMERA_GAP` behind and around the rider, so a
   * bay inside that of the line a rider takes through a feature swings the
   * camera on the approach — which is the same rule `parkSignage.ts` places a
   * post by and `parkDressing.ts` refuses a tree by. It binds only where the
   * fence and the line are on the same side of the trail, because every feature
   * on this venue stands on the rider's left (principle 1) and half the bends
   * turn the other way; declare it anyway and let the arithmetic say so.
   */
  readonly technicalT?: number;
}

/** One bend's fence: where it stands, and the runs that lay it. */
export interface InnerFence {
  readonly bend: string;
  /** `+1` for the rider's left, `-1` for their right — `sign(turn)`. */
  readonly side: 1 | -1;
  /** The lateral offset every run of this fence stands at, metres. */
  readonly offset: number;
  /** The radius the arc's bays follow, metres — `radius - offset`. */
  readonly innerRadius: number;
  /** How much fence the arc itself lays, metres of its own shorter arc. */
  readonly arcMetres: number;
  /** The leg the spine runs down, and how far. Absent when there is none. */
  readonly spine?: { readonly segment: string; readonly metres: number };
  readonly runs: readonly RailRun[];
}

/**
 * The offset one bend's fence stands at, metres — the larger of two bounds.
 *
 * The referee's, and the camera's. They are different claims about different
 * things (where a lap stops counting; what the picture has in it), so the
 * offset is the *maximum* rather than a sum or a compromise, and the venue can
 * read off which one decided a bend by comparing the two.
 *
 * Exported so a test can re-derive it from the lap rather than restate it, and
 * so the venue can print it in a comment without owning the arithmetic.
 */
export function innerFenceOffset(
  bend: FenceElement,
  before: FenceElement,
  after: FenceElement,
  technicalT?: number,
): number {
  const widest = Math.max(bend.halfWidth, before.halfWidth, after.halfWidth);
  const envelope = widest + TRACK_DAY.offCourseMarginMetres + FENCE_ENVELOPE_CLEAR;
  if (technicalT === undefined) return envelope;
  // `side * technicalT` rather than its magnitude: a fence on the far side of
  // the trail from the line is further from it for standing further out, so the
  // term goes the other way and stops binding, which is the honest arithmetic
  // rather than a special case.
  const side = bend.turn > 0 ? 1 : -1;
  return Math.max(envelope, side * technicalT + TRAIL_CAMERA_GAP + FENCE_BAY_REACH);
}

/**
 * Every fenced bend, as runs `parkDressing.railProps` can lay.
 *
 * The neighbours are **derived from the lap rather than authored**: a bend's
 * legs are the elements either side of it in riding order, wrapped, so a
 * layout edit that moves a corridor moves the offset with it instead of
 * leaving a hand-typed neighbour behind. The lap is a ring, so the wrap is the
 * honest reading of the first and last elements' neighbours.
 *
 * Four *fences* are refused rather than approximated, each of them one that
 * would be somewhere it could not be seen to be wrong. (A typo'd id and a start
 * outside its own bend throw as well, and need no argument.)
 *
 *   1. **An element that is not a bend.** A straight has no inside.
 *   2. **A bend whose inner radius is under `FENCE_MIN_ARC_RADIUS`** — the arc
 *      is tighter than one bay, so there is no run to lay. On a park whose
 *      corridors are seven metres wide and whose referee reaches two and a half
 *      metres past them, this is the same sentence as *the whole infield is
 *      legal ground*: the fence would have to stand where a rider may ride.
 *   3. **A spine down a leg that is not straight**, which would want its own
 *      curvature correction and is a bend that should have been fenced itself.
 *   4. **A duplicate bend**, which would lay two runs of bays in one place and
 *      leave `resolveStructuralConflicts` to drop one of them quietly.
 */
export function innerFences(
  bends: readonly FencedBend[],
  lap: readonly FenceElement[],
): InnerFence[] {
  const index = new Map(lap.map((element, at) => [element.id, at]));
  const seen = new Set<string>();
  const out: InnerFence[] = [];

  for (const fenced of bends) {
    const at = index.get(fenced.bend);
    if (at === undefined) throw new Error(`the lap carries no bend "${fenced.bend}"`);
    if (seen.has(fenced.bend)) throw new Error(`${fenced.bend} is fenced twice`);
    seen.add(fenced.bend);

    const bend = lap[at];
    const before = lap[(at - 1 + lap.length) % lap.length];
    const after = lap[(at + 1) % lap.length];
    if (bend.turn === 0 || !(bend.radius > 0)) {
      throw new Error(`${bend.id} is straight, so it has no inside to fence`);
    }

    const side: 1 | -1 = bend.turn > 0 ? 1 : -1;
    const offset = innerFenceOffset(bend, before, after, fenced.technicalT);
    const innerRadius = bend.radius - offset;
    if (!(innerRadius >= FENCE_MIN_ARC_RADIUS)) {
      throw new Error(
        `${bend.id}'s inside is ${innerRadius.toFixed(2)} m of arc at an offset of `
        + `${offset.toFixed(2)} m, which no run of ${BAY_LENGTH} m bays can follow: `
        + `the lap envelope already reaches the whole of that infield`,
      );
    }

    const from = fenced.fromS ?? 0;
    if (!(from >= 0) || from >= bend.length) {
      throw new Error(`${bend.id}'s fence starts at ${from} m of a ${bend.length.toFixed(1)} m bend`);
    }
    const runs: RailRun[] = [{ segment: bend.id, fromS: from, toS: bend.length, t: side * offset }];

    // What the arc lays, in its own much shorter arc's metres. A bay travels
    // `innerRadius / radius` metres of the *fence* for every metre of
    // centreline, which is exactly the correction `railProps` pitches by.
    const arcMetres = (bend.length - from) * (innerRadius / bend.radius);
    let spine: InnerFence['spine'];
    if (fenced.spine) {
      if (after.turn !== 0 || after.radius !== 0) {
        throw new Error(`${bend.id} leaves onto ${after.id}, which is a bend rather than a leg`);
      }
      // **The junction is pitched, not butted.** The arc's last bay lands
      // wherever the whole bays ran out, which is somewhere inside the last
      // 2.4 m before the socket; a spine started at the socket would stand its
      // first bay on top of it. Two bays never conflict — `buildPlan` exempts
      // the pair by kind, because a run is *meant* to abut — so this is a
      // defect that would ship as one doubled bay per hairpin rather than as a
      // refusal. The offset is constant across the socket, so the fence's own
      // length is continuous there and the leftover is simply carried over.
      const tail = arcMetres - Math.floor(arcMetres / BAY_LENGTH) * BAY_LENGTH;
      const fromSpine = BAY_LENGTH - tail;
      const metres = Math.min(FENCE_SPINE_METRES, after.length - fromSpine);
      if (!(metres > 0)) throw new Error(`${bend.id} leaves onto ${after.id}, too short for a spine`);
      spine = { segment: after.id, metres };
      runs.push({ segment: after.id, fromS: fromSpine, toS: fromSpine + metres, t: side * offset });
    }

    out.push({
      bend: bend.id,
      side,
      offset,
      innerRadius,
      arcMetres,
      ...(spine === undefined ? {} : { spine }),
      runs,
    });
  }

  return out;
}
