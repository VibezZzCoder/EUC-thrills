/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The city launch pads as trigger volumes and a ride surface — M42
 * (`docs/PLANS.md` §42.2e; R16, 2026-10-10: the pad is an obvious ramp;
 * critic repair r4: a kicker's silhouette — a tall lip over a concave run).
 *
 * A pad is not *ground*: nothing here ever reaches `TerrainSampler`
 * (invariant 3), so the shared sampler — and with it the cop, the population,
 * the camera rays and every plan digest — never sees a pad. What a pad is to
 * the simulation is a discrete event with an identity, which is the hazard and
 * soft-body door: the composition root builds this field from the derived site
 * list and hands it to the human seats' controllers only (`EucController`
 * option `launchPads`). The cop, the population probe, every bench and every
 * headless fixture keep `NO_LAUNCH_PADS`.
 *
 * Two circles per pad, both centred on it:
 *
 *   - the **trigger** (`triggerRadius`): a grounded, armed, fast enough step
 *     inside it launches. A centre circle treats every heading alike, which is
 *     what makes the pad omnidirectional;
 *   - the **footprint** (`footprintRadius`): the latch boundary — a pad that
 *     has fired, or been entered too slowly, stays inert until the wheel is
 *     back on the ground outside it — and, while the pad stands, part of the
 *     ground no safe point is stored on (the dome, below, is the rest).
 *
 * And one **dome** (`riseAt`): the drawn pad is a raised octagonal kicker, and
 * a human seat rides its surface rather than sinking through it. A concave
 * skirt — three planar facets per side, shallow at the foot and steep at the
 * lip (`LAUNCH_PAD.domeKnees`) — rises from the foot octagon (corners on
 * `LAUNCH_PAD.domeFootRadiusMetres`, a face on the site's local +Z, turned by
 * its `yaw` exactly as the view turns the mesh) to a top octagon whose faces
 * touch the trigger circle, `LAUNCH_PAD.domeHeightMetres` over the lawn; the
 * top crowns by `domeCrownMetres` at its centre. Every point of the trigger is
 * on the top, so every launch leaves the top of the ramp.
 *
 * `launchPadDomeRise` is the **drawn** surface (the view draws exactly it).
 * `riseAt` answers the **ridden** one: where the 0.25 m wheel's lowest point
 * stands when its tyre rests on that surface (`launchPadRideRise`, the drawn
 * profile rolled by the wheel's radius along the radial line). On a facet of
 * angle θ that is r·(sec θ − 1) over the face below the axle — the tyre
 * touches the slope uphill of it — so the drawn tyre meets the ramp instead of
 * cutting into it (the critic measured 6.4 cm into the old 33° skirt); at the
 * lip the tyre rolls over the coping's edge. It is never below the drawn
 * surface. The answer is a height *over the lawn*: the controller adds it to
 * the wheel's ride height and keeps it out of its slope and kerb physics, so
 * the dome is a ramp the wheel rides up, never a kerb, a wall or a ledge.
 *
 * Immutable after construction and allocation-free on every query. A city has
 * at most six pads, so a linear scan with a bounds reject is the whole index:
 * a grid would be more code guarding less time (the `SoftBodyField` reasoning).
 * Plain data only — no `three`, no `app/` — so every headless test builds one
 * from object literals.
 */
import { LAUNCH_PAD, WHEEL } from '../data/tuning.ts';

/** What the field needs of a pad. Structural, so `LaunchPadSite` fits as is. */
export interface LaunchPadVolume {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Launch circle radius, metres. The dome's top octagon has this apothem. */
  readonly triggerRadius: number;
  /** Latch disc radius, metres (the dome's foot reaches beyond it: `launchPadSkirtRun`). */
  readonly footprintRadius: number;
  /** The site's worst ground drop inside its clear disc, metres (≥ 0): the flight cap's Δh. */
  readonly dropMetres: number;
  /** The octagon's turn about +Y, rad (three's convention: local +Z faces (sin yaw, cos yaw)). Default 0. */
  readonly yaw?: number;
}

/** cos(π/8): an octagon's apothem over its circumradius. */
const OCTAGON_APOTHEM = Math.cos(Math.PI / 8);
/** 1/√2, for the octagon's diagonal faces. */
const DIAGONAL = Math.SQRT1_2;
/** The wheel the ride surface is rolled by, m (every machine's tyre: `MACHINE_CONTRACT` owns its diameter). */
export const LAUNCH_PAD_ROLL_RADIUS = WHEEL.tyreDiameter / 2;

/**
 * The skirt's run from the top's edge (the trigger apothem) out to its foot,
 * m: the shipped foot octagon's apothem less the shipped trigger radius. The
 * same run for every pad, so a fixture with another trigger keeps the shape.
 */
export function launchPadSkirtRun(): number {
  return LAUNCH_PAD.domeFootRadiusMetres * OCTAGON_APOTHEM - LAUNCH_PAD.triggerRadiusMetres;
}

/** Knot `k` of the skirt, from the lip (0) to the foot (3): its share of the run out from the top's edge. */
function knotOut(k: number): number {
  return k === 0 ? 0 : k === 3 ? 1 : LAUNCH_PAD.domeKnees[k - 1][0];
}

/** Knot `k` of the skirt: its height as a share of `domeHeightMetres`. */
function knotHeight(k: number): number {
  return k === 0 ? 1 : k === 3 ? 0 : LAUNCH_PAD.domeKnees[k - 1][1];
}

/**
 * The **drawn** dome's height over the lawn at octagonal distance `p` from a
 * pad's centre (the largest projection onto a face normal: the octagon
 * "radius" of the point), for a top octagon of apothem `top` and a foot of
 * apothem `base`: the crowned top inside `top`, the three skirt facets out to
 * `base`, 0 beyond. Pure; shared by the field and the view, so the drawn mesh
 * and the ridden surface are one formula.
 */
export function launchPadDomeRise(p: number, top: number, base: number): number {
  if (!(p < base)) return 0;
  const height = LAUNCH_PAD.domeHeightMetres;
  if (p <= top) return height + LAUNCH_PAD.domeCrownMetres * (1 - p / top);
  const out = (p - top) / (base - top);
  for (let k = 0; k < 3; k += 1) {
    const o0 = knotOut(k), o1 = knotOut(k + 1);
    if (out <= o1) {
      const h0 = knotHeight(k), h1 = knotHeight(k + 1);
      return height * (h0 + ((h1 - h0) * (out - o0)) / (o1 - o0));
    }
  }
  return 0;
}

/**
 * The **ridden** dome's height over the lawn at octagonal distance `p`: the
 * drawn profile (`launchPadDomeRise`) rolled by the wheel's radius `r` along
 * the radial line — max over |q − p| ≤ r of rise(q) + √(r² − (q − p)²) − r,
 * where the tyre resting on the surface puts its lowest point. Exact for a
 * piecewise-planar profile: on each piece the maximum is its stationary point
 * q = p + r·m/√(1 + m²) (m the piece's slope), clamped to the piece and the
 * wheel. Never below the drawn surface; equal to it on any flat; 0 from
 * `base + r` out. Pure and allocation-free.
 */
export function launchPadRideRise(p: number, top: number, base: number, r: number = LAUNCH_PAD_ROLL_RADIUS): number {
  if (!(p < base + r)) return 0;
  let best = launchPadDomeRise(p, top, base);
  if (!(r > 0)) return best;
  const height = LAUNCH_PAD.domeHeightMetres;
  // The pieces, from the centre out: the crowned top, then the three facets.
  for (let piece = 0; piece < 4; piece += 1) {
    let qa: number, qb: number, ha: number, hb: number;
    if (piece === 0) {
      qa = 0; qb = top; ha = height + LAUNCH_PAD.domeCrownMetres; hb = height;
    } else {
      const k = piece - 1;
      qa = top + (base - top) * knotOut(k); qb = top + (base - top) * knotOut(k + 1);
      ha = height * knotHeight(k); hb = height * knotHeight(k + 1);
    }
    const lo = qa > p - r ? qa : p - r, hi = qb < p + r ? qb : p + r;
    if (lo > hi) continue;
    const m = (hb - ha) / (qb - qa);
    let q = p + (r * m) / Math.sqrt(1 + m * m);
    if (q < lo) q = lo; else if (q > hi) q = hi;
    const d = q - p;
    const here = ha + m * (q - qa) + Math.sqrt(Math.max(0, r * r - d * d)) - r;
    if (here > best) best = here;
  }
  return best;
}

/** The octagonal distance of a local offset: max(|x|, |z|, (|x| + |z|)/√2), faces on the axes and diagonals. */
export function octagonalDistance(localX: number, localZ: number): number {
  const ax = Math.abs(localX), az = Math.abs(localZ);
  const axis = ax > az ? ax : az;
  const diagonal = (ax + az) * DIAGONAL;
  return axis > diagonal ? axis : diagonal;
}

export class LaunchPadField {
  /** How many pads this field holds. */
  readonly count: number;
  private readonly ids: readonly string[];
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  private readonly triggerSquared: Float64Array;
  private readonly footprint: Float64Array;
  private readonly footprintSquared: Float64Array;
  private readonly drops: Float64Array;
  private readonly cosYaw: Float64Array;
  private readonly sinYaw: Float64Array;
  /** The dome's top and foot apothems, m. */
  private readonly tops: Float64Array;
  private readonly bases: Float64Array;
  /** The farthest a ridden dome reaches along an axis, m: its rolled foot's corner radius. */
  private readonly reaches: Float64Array;

  constructor(pads: readonly LaunchPadVolume[] = []) {
    const count = pads.length;
    this.count = count;
    this.xs = new Float64Array(count);
    this.zs = new Float64Array(count);
    this.triggerSquared = new Float64Array(count);
    this.footprint = new Float64Array(count);
    this.footprintSquared = new Float64Array(count);
    this.drops = new Float64Array(count);
    this.cosYaw = new Float64Array(count);
    this.sinYaw = new Float64Array(count);
    this.tops = new Float64Array(count);
    this.bases = new Float64Array(count);
    this.reaches = new Float64Array(count);
    const run = launchPadSkirtRun();
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const pad = pads[index];
      const yaw = pad.yaw ?? 0;
      if (!Number.isFinite(pad.x) || !Number.isFinite(pad.z) || !Number.isFinite(yaw)) {
        throw new RangeError(`launch pad ${pad.id} needs a finite position and yaw`);
      }
      if (!(pad.triggerRadius > 0) || !Number.isFinite(pad.triggerRadius)
        || !(pad.footprintRadius > 0) || !Number.isFinite(pad.footprintRadius)) {
        throw new RangeError(`launch pad ${pad.id} needs finite positive radii`);
      }
      if (!(pad.triggerRadius < pad.footprintRadius * OCTAGON_APOTHEM)) {
        throw new RangeError(`launch pad ${pad.id} trigger must lie strictly inside its footprint octagon`);
      }
      if (!Number.isFinite(pad.dropMetres) || pad.dropMetres < 0) {
        throw new RangeError(`launch pad ${pad.id} needs a finite non-negative drop`);
      }
      ids.push(pad.id);
      this.xs[index] = pad.x;
      this.zs[index] = pad.z;
      this.triggerSquared[index] = pad.triggerRadius * pad.triggerRadius;
      this.footprint[index] = pad.footprintRadius;
      this.footprintSquared[index] = pad.footprintRadius * pad.footprintRadius;
      this.drops[index] = pad.dropMetres;
      this.cosYaw[index] = Math.cos(yaw);
      this.sinYaw[index] = Math.sin(yaw);
      this.tops[index] = pad.triggerRadius;
      this.bases[index] = pad.triggerRadius + run;
      this.reaches[index] = (pad.triggerRadius + run + LAUNCH_PAD_ROLL_RADIUS) / OCTAGON_APOTHEM;
    }
    this.ids = Object.freeze(ids);
    Object.freeze(this);
  }

  /**
   * The pad whose **trigger circle** contains this point, or −1.
   *
   * A point test, like every other trigger volume the contact patch meets
   * (`HazardField.at`). The boundary counts as inside. Pads are placed at
   * least 70 m apart, so at most one can answer; the lowest index wins if a
   * hand-built fixture overlaps two.
   */
  at(x: number, z: number): number {
    for (let index = 0; index < this.count; index += 1) {
      const dx = x - this.xs[index];
      const dz = z - this.zs[index];
      if (dx * dx + dz * dz <= this.triggerSquared[index]) return index;
    }
    return -1;
  }

  /** Whether this point lies inside (or on) any pad's footprint. */
  inFootprint(x: number, z: number): boolean {
    for (let index = 0; index < this.count; index += 1) {
      const dx = x - this.xs[index];
      if (dx > this.footprint[index] || dx < -this.footprint[index]) continue;
      const dz = z - this.zs[index];
      if (dx * dx + dz * dz <= this.footprintSquared[index]) return true;
    }
    return false;
  }

  /**
   * The ridden dome's height over the lawn at this point, m
   * (`launchPadRideRise`): 0 beyond every pad's foot octagon by more than the
   * wheel's radius, the top's height on the trigger. The highest answer wins
   * if a hand-built fixture overlaps two.
   */
  riseAt(x: number, z: number): number {
    let rise = 0;
    for (let index = 0; index < this.count; index += 1) {
      const reach = this.reaches[index];
      const dx = x - this.xs[index];
      if (dx > reach || dx < -reach) continue;
      const dz = z - this.zs[index];
      if (dz > reach || dz < -reach) continue;
      const cos = this.cosYaw[index], sin = this.sinYaw[index];
      const p = octagonalDistance(dx * cos - dz * sin, dx * sin + dz * cos);
      const here = launchPadRideRise(p, this.tops[index], this.bases[index]);
      if (here > rise) rise = here;
    }
    return rise;
  }

  /** The pad's drop below its centre within its clear disc, metres (the cap's Δh). */
  dropAt(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`launch pad index ${index} is out of range`);
    }
    return this.drops[index];
  }

  /** The pad's stable id (diagnostics and the QA bridge). */
  idAt(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`launch pad index ${index} is out of range`);
    }
    return this.ids[index];
  }
}

/** The empty field every non-human controller and every fixture holds. */
export const NO_LAUNCH_PADS = new LaunchPadField();
