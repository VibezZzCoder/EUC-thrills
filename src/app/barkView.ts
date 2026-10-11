/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { Vector3, type Camera } from 'three';
import { BARKS, POPULATION_AUTHORING } from '../data/tuning.ts';

/**
 * The barks' view rules (M42, `docs/PLANS.md` §42.2h, the plan review's one
 * blocker): **a bark has to be seen to count.** Pure projection maths shared
 * by `Game.render` and the headless tests — `three`'s `Vector3` and camera
 * matrices, never the DOM.
 *
 * Game calls it per pane **after** `renderView`, because that is where the
 * camera's matrices are refreshed (`updateHud` runs before the camera is
 * placed, which would put the bubble a frame behind).
 *
 * - A **candidate** qualifies only if its anchor is inside the start band now
 *   and at each `BARKS.predictSeconds` of relative motion (anchor moved by
 *   v_person − v_rider, against the current camera), and still inside the
 *   display band at `BARKS.minimumReadableSeconds`, every time deeper than
 *   the rider's own camera depth plus `depthBeyondRiderMetres`. The ray check
 *   is Game's, once, at that moment, because it needs the world.
 * - A **shown bubble** stays only while its anchor is inside the display band.
 * - **The asker must be seen too** (`candidateHidden`, `bubbleHidden`): the
 *   camera's rays to the asker's head and chest must miss every other
 *   population body's hull, or the bubble would point at whoever stands in
 *   front — in a social pair, a partner with their back to the rider.
 */

export interface NdcBand {
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PaneSize {
  readonly width: number;
  readonly height: number;
}

export const START_BAND: NdcBand = Object.freeze({
  maxX: BARKS.startNdcMaxX,
  minY: BARKS.startNdcMinY,
  maxY: BARKS.startNdcMaxY,
});

export const DISPLAY_BAND: NdcBand = Object.freeze({
  maxX: BARKS.ndcMaxX,
  minY: BARKS.ndcMinY,
  maxY: BARKS.ndcMaxY,
});

/** Inside the band and between the near and far planes (behind the camera is outside). */
export function inBand(ndc: Vector3, band: NdcBand): boolean {
  return ndc.z > -1 && ndc.z < 1
    && Math.abs(ndc.x) <= band.maxX
    && ndc.y >= band.minY && ndc.y <= band.maxY;
}

/** NDC to pane CSS pixels, measured from the pane's top-left (y down). */
export function ndcToPane(ndcX: number, ndcY: number, pane: PaneSize, out: { x: number; y: number }): void {
  out.x = ((ndcX + 1) / 2) * pane.width;
  out.y = ((1 - ndcY) / 2) * pane.height;
}

/**
 * One instance per Game (or per test), holding its scratch vectors so a
 * drawn frame allocates nothing.
 */
export class BarkView {
  /** The last projection, in NDC. */
  readonly ndc = new Vector3();
  private readonly scratch = new Vector3();

  /** View-space depth of a world point: metres in front of the camera. */
  depth(camera: Camera, x: number, y: number, z: number): number {
    this.scratch.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    return -this.scratch.z;
  }

  /** Project `point` into `this.ndc`. */
  project(camera: Camera, x: number, y: number, z: number): Vector3 {
    return this.ndc.set(x, y, z).project(camera);
  }

  /**
   * A shown bubble's anchor: is it still in the display band? Leaves the
   * projection in `this.ndc` for `ndcToPane`.
   */
  bubbleInBand(camera: Camera, anchor: WorldPoint): boolean {
    this.project(camera, anchor.x, anchor.y, anchor.z);
    return inBand(this.ndc, DISPLAY_BAND);
  }

  /**
   * A pending candidate: in the start band now and along its predicted path,
   * still in the display band once it would have been read
   * (`BARKS.minimumReadableSeconds`, owner round 2: a bubble that would leave
   * the screen before it is read is not started), and always deeper than the
   * rider. Leaves the *current* projection in `this.ndc`.
   */
  candidateSeen(camera: Camera, anchor: WorldPoint, relativeVelocity: WorldPoint, rider: WorldPoint): boolean {
    const floor = this.depth(camera, rider.x, rider.y, rider.z) + BARKS.depthBeyondRiderMetres;
    const read = BARKS.minimumReadableSeconds;
    const readX = anchor.x + relativeVelocity.x * read;
    const readY = anchor.y + relativeVelocity.y * read;
    const readZ = anchor.z + relativeVelocity.z * read;
    if (this.depth(camera, readX, readY, readZ) < floor) return false;
    this.project(camera, readX, readY, readZ);
    if (!inBand(this.ndc, DISPLAY_BAND)) return false;
    const predictions: readonly number[] = BARKS.predictSeconds;
    for (let i = predictions.length; i >= 0; i -= 1) {
      // The furthest prediction first (it fails most often), the present last
      // so `this.ndc` holds it on return.
      const t = i === 0 ? 0 : predictions[i - 1];
      const x = anchor.x + relativeVelocity.x * t;
      const y = anchor.y + relativeVelocity.y * t;
      const z = anchor.z + relativeVelocity.z * t;
      if (this.depth(camera, x, y, z) < floor) return false;
      this.project(camera, x, y, z);
      if (!inBand(this.ndc, START_BAND)) return false;
    }
    return true;
  }
}

/** One population row as the sight test reads it (a subset of the presentation pose). */
export interface SightBody {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly headingY: number;
  readonly speedMetresPerSecond: number;
}

/** This frame's population endpoints (a `BarkFrame` is one). Index i is the same actor in both arrays. */
export interface SightBodies {
  readonly previous: readonly SightBody[];
  readonly current: readonly SightBody[];
  readonly alpha: number;
}

/** What a sight test needs of the candidate: who, where its anchor is, how it moves against the rider. */
export interface SightCandidate {
  readonly actorId: string;
  readonly anchor: WorldPoint;
  readonly relativeVelocity: WorldPoint;
}

const VEHICLE_KINDS: ReadonlySet<string> = new Set(['parkedVehicle', 'serviceVehicle', 'trafficVehicle']);

/** The anchor stands this far above the asker's feet (`ui/barkModel.ts`). */
const ANCHOR_ABOVE_FEET = POPULATION_AUTHORING.actorHeightMetres + BARKS.anchorLiftMetres;

/** The open parameter interval of the segment being clipped (one test at a time; no allocation). */
const clipRange = { enter: 0, exit: 1 };

/** Clip `clipRange` to one slab; false once it is empty. */
function clipSlab(start: number, delta: number, min: number, max: number): boolean {
  if (Math.abs(delta) < 1e-12) return start >= min && start <= max;
  let t0 = (min - start) / delta;
  let t1 = (max - start) / delta;
  if (t0 > t1) {
    const swap = t0;
    t0 = t1;
    t1 = swap;
  }
  if (t0 > clipRange.enter) clipRange.enter = t0;
  if (t1 < clipRange.exit) clipRange.exit = t1;
  return clipRange.enter <= clipRange.exit;
}

/**
 * Does the segment eye → target pass through this body? A vehicle is its
 * population hull (`actorHull` in `level/populationPlan.ts`), which the van
 * is drawn to fill: ± half-width × ± half-length, `vehicleHeightMetres` tall,
 * turned to its heading. A person (or a fictional rider) is the upright body
 * actually drawn — a vertical cylinder of `BARKS.sightPersonRadiusMetres`,
 * `actorHeightMetres` tall — not the clearance square of the hull, which is
 * about 1.6 times as wide as the shoulders and would hide askers nobody hides.
 * Everything stands on its feet.
 */
function segmentHitsHull(
  eye: WorldPoint, targetX: number, targetY: number, targetZ: number,
  kind: string, bodyX: number, bodyY: number, bodyZ: number, headingY: number,
): boolean {
  clipRange.enter = 0;
  clipRange.exit = 1;
  if (!VEHICLE_KINDS.has(kind)) {
    if (!clipSlab(eye.y - bodyY, targetY - eye.y, 0, POPULATION_AUTHORING.actorHeightMetres)) return false;
    // The nearest the segment's in-height span comes to the body's axis.
    const deltaX = targetX - eye.x;
    const deltaZ = targetZ - eye.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    let s = lengthSquared > 1e-12 ? ((bodyX - eye.x) * deltaX + (bodyZ - eye.z) * deltaZ) / lengthSquared : 0;
    s = Math.min(clipRange.exit, Math.max(clipRange.enter, s));
    const offX = eye.x + deltaX * s - bodyX;
    const offZ = eye.z + deltaZ * s - bodyZ;
    return offX * offX + offZ * offZ <= BARKS.sightPersonRadiusMetres * BARKS.sightPersonRadiusMetres;
  }
  const halfWidth = POPULATION_AUTHORING.vehicleHalfWidthMetres;
  const halfLength = POPULATION_AUTHORING.vehicleHalfLengthMetres;
  const height = POPULATION_AUTHORING.vehicleHeightMetres;
  const sin = Math.sin(headingY);
  const cos = Math.cos(headingY);
  const fromX = eye.x - bodyX;
  const fromZ = eye.z - bodyZ;
  const deltaX = targetX - eye.x;
  const deltaZ = targetZ - eye.z;
  // Body frame: across = (cos, −sin), along = (sin, cos) — heading zero faces +Z.
  return clipSlab(fromX * cos - fromZ * sin, deltaX * cos - deltaZ * sin, -halfWidth, halfWidth)
    && clipSlab(fromX * sin + fromZ * cos, deltaX * sin + deltaZ * cos, -halfLength, halfLength)
    && clipSlab(eye.y - bodyY, targetY - eye.y, 0, height);
}

/**
 * Some other body hides the asker at `t` seconds of relative motion: the
 * asker's anchor moved by its `relativeVelocity`·t, every other body by
 * (its own velocity − the rider's)·t, the camera where it is now — the same
 * frame `BarkView.candidateSeen` predicts in.
 */
function hiddenAt(
  eye: WorldPoint, candidate: SightCandidate, bodies: SightBodies, t: number,
  riderVelocityX: number, riderVelocityZ: number, chest: boolean,
): boolean {
  const { anchor, relativeVelocity } = candidate;
  const askerX = anchor.x + relativeVelocity.x * t;
  const askerZ = anchor.z + relativeVelocity.z * t;
  const feetY = anchor.y + relativeVelocity.y * t - ANCHOR_ABOVE_FEET;
  const alpha = Number.isFinite(bodies.alpha) ? Math.min(1, Math.max(0, bodies.alpha)) : 1;
  const { previous, current } = bodies;
  for (let index = 0; index < current.length; index += 1) {
    const body = current[index];
    if (body.id === candidate.actorId) continue;
    const before = previous[index];
    let x = body.x;
    let y = body.y;
    let z = body.z;
    if (before !== undefined && before.id === body.id) {
      x = before.x + (body.x - before.x) * alpha;
      y = before.y + (body.y - before.y) * alpha;
      z = before.z + (body.z - before.z) * alpha;
    }
    if (t > 0) {
      const speed = Number.isFinite(body.speedMetresPerSecond) ? body.speedMetresPerSecond : 0;
      x += (speed * Math.sin(body.headingY) - riderVelocityX) * t;
      z += (speed * Math.cos(body.headingY) - riderVelocityZ) * t;
    }
    if (segmentHitsHull(eye, askerX, feetY + BARKS.sightHeadMetres, askerZ, body.kind, x, y, z, body.headingY)) return true;
    if (chest && segmentHitsHull(eye, askerX, feetY + BARKS.sightChestMetres, askerZ, body.kind, x, y, z, body.headingY)) {
      return true;
    }
  }
  return false;
}

/**
 * A pending candidate the camera sees but cannot see *clearly*: another body
 * blocks the ray to the asker's head or chest now, or at any of
 * `BARKS.predictSeconds`. Game holds such a candidate out like one behind a
 * wall. `riderVelocity` is the rider's drawn velocity, m/s (heading zero along
 * +Z), the same one the model subtracted into `relativeVelocity`.
 */
export function candidateHidden(
  eye: WorldPoint, candidate: SightCandidate, bodies: SightBodies, riderVelocityX: number, riderVelocityZ: number,
): boolean {
  if (hiddenAt(eye, candidate, bodies, 0, riderVelocityX, riderVelocityZ, true)) return true;
  const predictions: readonly number[] = BARKS.predictSeconds;
  for (const t of predictions) {
    if (hiddenAt(eye, candidate, bodies, t, riderVelocityX, riderVelocityZ, true)) return true;
  }
  return false;
}

const STILL: WorldPoint = Object.freeze({ x: 0, y: 0, z: 0 });
const bubbleScratch: { actorId: string; anchor: WorldPoint; relativeVelocity: WorldPoint } = {
  actorId: '', anchor: STILL, relativeVelocity: STILL,
};

/**
 * A shown bubble whose asker's head another body now hides: Game reports it
 * to the model (`askerHidden`), which fades and ends the bubble once it has
 * been read (`BARKS.minimumReadableSeconds`) — it does not keep pointing at
 * someone else, and a passer-by does not snatch it away mid-sentence.
 */
export function bubbleHidden(eye: WorldPoint, actorId: string, anchor: WorldPoint, bodies: SightBodies): boolean {
  bubbleScratch.actorId = actorId;
  bubbleScratch.anchor = anchor;
  return hiddenAt(eye, bubbleScratch, bodies, 0, 0, 0, false);
}
