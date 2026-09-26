/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHASE } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from './routeSpine.ts';

/** Most bends one aim reports, which bounds the lookahead scan. */
const MAX_BENDS = 64;
/**
 * Metres either side of half a ring inside which the chosen way round is
 * kept rather than recomputed — so a quarry parked opposite the cop on a
 * block does not flip him between the two arms every step (M39 QA).
 */
const DIRECTION_HYSTERESIS = 10;

/** Bounded M39 junction selection. Each authored loop offers exactly two
 * ways between the same two sockets. The canonical spine still owns tracker
 * distance. Nothing is searched over the wider city and no controller is
 * bypassed.
 *
 * **Only where the canonical brain cannot see the answer (M39 QA).** A loop
 * aims the cop only when the cop or the quarry is on the loop's *alternate*
 * arm, or — for the whole town ring, which has no alternate — when the short
 * way to the quarry crosses the start/finish seam the canonical spine cannot
 * wrap. Everywhere else the tuned brain drives: its hazard, blocker, swerve
 * and gate caps are not given up merely because both riders are on a street
 * that happens to be part of a loop. */
export class StreetLoops {
  private readonly rings: RouteSpine[];
  /** Where each ring's main arm ends; beyond it is the alternate. */
  private readonly mainLength: number[];
  private readonly lastDirection: number[];
  private readonly here = createSpineLocation();
  private readonly there = createSpineLocation();
  private readonly point = createSpineSample();
  private readonly bendA = createSpineSample();
  private readonly bendB = createSpineSample();
  private readonly result = {
    x: 0,
    z: 0,
    /** The tightest bend within the lookahead, 1/m. */
    curvature: 0,
    /** Bends ahead: `bendAt[k]` metres away, `bendCurvature[k]` 1/m. */
    bendCount: 0,
    bendAt: new Array<number>(MAX_BENDS).fill(0),
    bendCurvature: new Array<number>(MAX_BENDS).fill(0),
  };

  /**
   * `shared` is a route field's read-only rings and main-arm lengths
   * (`buildRouteField`, M39 Part P §2c R-18): with three cops in a room each
   * brain would otherwise rebuild the same rings. The rings are only read, so
   * sharing them is safe; `lastDirection` and the scratch stay per instance,
   * because they are one brain's memory. Absent, the rings are built here
   * exactly as before. A `shared` whose ring count does not match the plan's
   * loops is a caller's mistake and throws rather than steering by the wrong
   * ring.
   */
  constructor(
    plan: LevelPlan,
    shared?: { readonly rings: readonly RouteSpine[]; readonly mainLengths: readonly number[] },
  ) {
    const loops = plan.streetLoops ?? [];
    if (shared !== undefined) {
      if (shared.rings.length !== loops.length || shared.mainLengths.length !== loops.length) {
        throw new Error('StreetLoops: the shared rings do not match the plan\'s street loops');
      }
      this.rings = [...shared.rings];
      this.mainLength = [...shared.mainLengths];
    } else {
      this.rings = loops.map((loop) => RouteSpine.fromTraversal(plan, [
        ...loop.main.map((id) => ({ id, forward: true })),
        ...[...loop.alternate].reverse().map((id) => ({ id, forward: false })),
      ]));
      this.mainLength = loops.map((loop, index) => {
        if (loop.alternate.length === 0) return this.rings[index].length;
        return RouteSpine.fromTraversal(plan, loop.main.map((id) => ({ id, forward: true }))).length;
      });
    }
    this.lastDirection = loops.map(() => 0);
  }

  /** Centreline distance on accepted alternate streets, for the existing
   * chase stray rule. Do not widen that rule for the rest of the world. */
  offRoute(x: number, z: number, canonical: number): number {
    let distance = canonical;
    for (const ring of this.rings) {
      ring.locate(x, z, -1, this.here);
      distance = Math.min(distance, this.here.offRoute);
    }
    return distance;
  }

  /**
   * Whether a point is on one of the loops' alternate streets rather than on
   * the canonical road — a side street, a cross street, the alley. The regroup
   * teleport and the stray rule treat such a rider as on the road (M39 QA).
   */
  onAlternate(x: number, z: number, canonicalOffRoute: number, canonicalHalfWidth: number): boolean {
    return this.alternateRing(x, z, canonicalOffRoute, canonicalHalfWidth) >= 0;
  }

  /**
   * Which loop's alternate street a point is on, or −1 for the canonical road
   * (or nowhere) — `onAlternate`'s answer with its ring named, so a regroup
   * can put the tail back on the street the rider actually took (the brutal
   * pass: a rider on a side street used to skip every return).
   */
  alternateRing(x: number, z: number, canonicalOffRoute: number, canonicalHalfWidth: number): number {
    if (canonicalOffRoute <= canonicalHalfWidth + CHASE.streetMargin) return -1;
    for (let index = 0; index < this.rings.length; index += 1) {
      const ring = this.rings[index];
      ring.locate(x, z, -1, this.here);
      if (this.here.offRoute <= this.here.halfWidth + CHASE.streetMargin
        && this.here.distance > this.mainLength[index]) return index;
    }
    return -1;
  }

  /** Loop `index`'s whole ring (main arm, then its alternate back), as built. */
  ring(index: number): RouteSpine {
    return this.rings[index];
  }

  aim(self: { x: number; z: number; speed: number }, quarry: { x: number; z: number },
    lookahead: number): typeof this.result | null {
    for (let index = 0; index < this.rings.length; index += 1) {
      const ring = this.rings[index];
      ring.locate(quarry.x, quarry.z, -1, this.there);
      if (this.there.offRoute > this.there.halfWidth + CHASE.streetMargin) continue;
      ring.locate(self.x, self.z, -1, this.here);
      if (this.here.offRoute > this.here.halfWidth + CHASE.streetJoinReach) continue;
      const raw = this.there.distance - this.here.distance;
      const whole = ring.length;
      const onMain = this.there.distance <= this.mainLength[index] && this.here.distance <= this.mainLength[index];
      // Both on the canonical road with no seam to cross: the tuned brain's job.
      if (onMain && (this.mainLength[index] < whole || Math.abs(raw) <= whole / 2)) continue;
      const gap = raw > whole / 2 ? raw - whole : raw < -whole / 2 ? raw + whole : raw;
      if (Math.abs(gap) < CHASE.streetCloseMetres && Math.hypot(self.x - quarry.x, self.z - quarry.z) < CHASE.streetCloseMetres) return null;
      let direction = gap < 0 ? -1 : 1;
      if (this.lastDirection[index] !== 0 && Math.abs(Math.abs(raw) - whole / 2) < DIRECTION_HYSTERESIS) {
        direction = this.lastDirection[index];
      }
      this.lastDirection[index] = direction;
      const wrap = (distance: number): number => (distance % whole + whole) % whole;
      // Aim stops at the quarry rather than driving past a stopped rider.
      ring.sample(wrap(this.here.distance + direction * Math.min(lookahead, Math.abs(gap))), this.point);
      this.result.x = this.point.x; this.result.z = this.point.z;
      let curvature = 0;
      let count = 0;
      // Look far enough ahead to slow before a city corner. Each bend is
      // reported with its distance, so the caller brakes for it with the same
      // allowance the ordinary brain gives a corner at that range.
      for (let at = 0; at < Math.max(lookahead, Math.abs(self.speed) * CHASE.streetAnticipationSeconds); at += CHASE.streetSampleMetres) {
        ring.sample(wrap(this.here.distance + direction * at), this.bendA);
        ring.sample(wrap(this.here.distance + direction * (at + CHASE.streetSampleMetres)), this.bendB);
        const turn = Math.atan2(Math.sin(this.bendB.headingY - this.bendA.headingY),
          Math.cos(this.bendB.headingY - this.bendA.headingY));
        const bend = Math.abs(turn) / CHASE.streetSampleMetres;
        curvature = Math.max(curvature, bend);
        if (bend > 1e-4 && count < MAX_BENDS) {
          this.result.bendAt[count] = at;
          this.result.bendCurvature[count] = bend;
          count += 1;
        }
      }
      this.result.curvature = curvature;
      this.result.bendCount = count;
      return this.result;
    }
    return null;
  }
}
