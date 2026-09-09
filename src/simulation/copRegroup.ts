/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { RouteSpine, SpineLocation, SpineSample } from './routeSpine.ts';

/**
 * Where the super tracker puts the cop back — the chase pass (§31).
 *
 * The *what* of the M20.2 regroup, moved out of `app/Game.ts` as arithmetic:
 * `ChaseRun` decides *when* and the composition root still performs the act
 * (`EucController.reset`, the pose bookkeeping, the brain's `place`), but the
 * placement itself is a pure function of the spine, the rider's pose and a
 * judge, so the headless chase bench and the suite stand the cop exactly
 * where the game would. Nothing here may import three.js (invariant 1).
 *
 * Three refusals, each learned the hard way. Two from M20.2's QA
 * (`docs/LESSONS_LEARNED.md`): a route-distance request is not proof of a
 * safe world-space placement. `RouteSpine.sample` clamps at both ends, so
 * asking for 50 m behind a rider still at the first metre answers the rider's
 * own spawn; and a tightly folded route can put two positions 50 m apart
 * along the line within a few metres of each other in the world. The third
 * from Codex's M31 QA: a spot on the line can be *in* a deep hole or two
 * metres short of a bollard row, and a cop stood there at the rider's pace
 * with a straight wheel crashes before he has thought once — 89 of 1,997
 * accepted returns did, swept over five routes both ways. So every rung is
 * shown to a `RegroupJudge` (`CpuRider.landingAllowance`, the brain's own
 * beliefs about the spot) before it is answered.
 *
 * **A refused rung is not a refused regroup.** The ladder walks further back
 * along the route, never closer — further back is always fair — and answers
 * the first rung the judge allows at a useful pace, or the best it saw, or
 * `null` when every rung is clamped, folded or occupied; the referee simply
 * demands again after the retry.
 */
export interface RegroupCandidate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Facing the rider's direction of travel along the route. */
  readonly headingY: number;
  /** Straight-line separation from the rider, metres. */
  readonly gap: number;
  /** Which way along the route the rider is travelling: +1 toward the end. */
  readonly direction: 1 | -1;
  /** Where along the route he lands, metres. */
  readonly distance: number;
  /** How far behind the rider along the route, metres — the rung the ladder took. */
  readonly back: number;
  /**
   * The fastest he may be stood there, m/s — the judge's word, `Infinity`
   * unjudged. The composition root arrives at the rider's pace or this,
   * whichever is less.
   */
  readonly entrySpeed: number;
}

/** What the planner needs to know about the rider. */
export interface RegroupRider {
  readonly x: number;
  readonly z: number;
  readonly headingY: number;
}

/**
 * Whether a spot on the line is safe to stand a cop on, and how fast, m/s.
 * `null` refuses the spot outright. `CpuRider.landingAllowance` is the judge
 * the game and the bench use; the suite hands the planner scripted ones.
 */
export type RegroupJudge = (distance: number, direction: 1 | -1) => number | null;

/**
 * The world-space floor a return must clear, metres.
 *
 * The bust radius plus one — a candidate never materialises inside the radius
 * where a crash would be his doing — or a share of the return distance if
 * that is larger. M20.2 used the whole return distance (capped at the siren's
 * far edge), and at the chase pass's 50 m return that refused every bend:
 * the chord of a curve is shorter than its arc, so a candidate 50 m back along
 * a corner is never 50 m away in a straight line. A share of it keeps the
 * fold refusal — a hairpin's two arms are a few metres apart — and lets a
 * bend through.
 */
export function regroupFloor(back: number, bustRadiusMetres: number): number {
  return Math.max(bustRadiusMetres + 1, back * REGROUP_FLOOR_SHARE);
}

/** How much of the return distance a candidate must keep in a straight line. */
const REGROUP_FLOOR_SHARE = 0.6;

/** A rider this far from the window's answer is not where they were last seen, metres. */
const REGROUP_RELOCATE_METRES = 30;
/** How much further back each rung of the ladder looks, metres. */
const REGROUP_RUNG_METRES = 5;
/** How many rungs past the asked-for return the ladder walks. */
const REGROUP_RUNGS = 6;
/**
 * The entry pace a rung is good enough at, m/s. A rung that allows less is
 * kept as a fallback while the ladder looks for a better one: a cop stood
 * at walking pace behind a rider doing 25 m/s converts into nothing, and a
 * rung five metres further back usually has the room.
 */
const REGROUP_USEFUL_PACE = 10;

/**
 * Plan a return `back` metres behind the rider along the route, or refuse.
 *
 * `minimumGap` is the world-space floor every rung must clear — see
 * `regroupFloor`. `judge` says whether a rung is safe to stand on and how
 * fast; without one every rung is unjudged and the first unclamped, unfolded
 * one answers, which is the M20.2 behaviour the suite still pins. `near` is
 * where the rider was last known to be along the route, or negative: on a
 * divided road a global search cannot tell the rider's lane from the one
 * beside it (`CpuRider.quarryDistance`'s note), and a return measured from
 * the wrong lane stands the cop behind a wall. `scratch` are caller-owned so
 * the fixed step allocates nothing.
 */
export function planRegroup(
  spine: RouteSpine,
  rider: RegroupRider,
  back: number,
  minimumGap: number,
  scratch: { readonly at: SpineLocation; readonly sample: SpineSample },
  judge: RegroupJudge | null = null,
  near = -1,
): RegroupCandidate | null {
  spine.locate(rider.x, rider.z, near, scratch.at);
  if (near >= 0 && scratch.at.offRoute > REGROUP_RELOCATE_METRES) {
    spine.locate(rider.x, rider.z, -1, scratch.at);
  }
  const riderDistance = scratch.at.distance;
  spine.sample(riderDistance, scratch.sample);
  const along = Math.cos(rider.headingY - scratch.sample.headingY);
  const direction: 1 | -1 = along >= 0 ? 1 : -1;

  let best: RegroupCandidate | null = null;
  for (let rung = 0; rung <= REGROUP_RUNGS; rung += 1) {
    const rungBack = back + rung * REGROUP_RUNG_METRES;
    spine.sample(riderDistance - direction * rungBack, scratch.sample);
    // Clamped at the route's end: every further rung is clamped too.
    const routeGap = Math.abs(riderDistance - scratch.sample.distance);
    if (routeGap + 1e-6 < rungBack) break;

    // Folded: this rung is a few metres from the rider in the world.
    const dx = scratch.sample.x - rider.x;
    const dz = scratch.sample.z - rider.z;
    const gap = Math.sqrt(dx * dx + dz * dz);
    if (gap < minimumGap) continue;

    const entrySpeed = judge === null ? Infinity : judge(scratch.sample.distance, direction);
    if (entrySpeed === null) continue;

    const candidate: RegroupCandidate = {
      x: scratch.sample.x,
      y: scratch.sample.y,
      z: scratch.sample.z,
      headingY: direction >= 0 ? scratch.sample.headingY : scratch.sample.headingY + Math.PI,
      gap,
      direction,
      distance: scratch.sample.distance,
      back: rungBack,
      entrySpeed,
    };
    if (entrySpeed >= REGROUP_USEFUL_PACE) return candidate;
    if (best === null || entrySpeed > best.entrySpeed) best = candidate;
  }
  return best;
}
