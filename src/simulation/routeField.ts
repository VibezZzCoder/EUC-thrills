/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHASE, EUC, TERRAIN, WHEEL } from '../data/tuning.ts';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import {
  createSpineLocation,
  createSpineSample,
  RouteSpine,
  type SpineSample,
} from './routeSpine.ts';
import { buildNavGrid, type NavGrid } from './navGrid.ts';
import { createGroundSample, type TerrainSampler } from './world.ts';

/**
 * The route field — what a CPU rider knows about the road before he rides it
 * (M39 Part P, `docs/PLANS.md` §39.6b.4 "Field construction", §39.6b.5).
 *
 * **One per world, read-only, shared by every brain.** Until Part P each
 * `CpuRider` projected the world's solids and hazards onto its own line in its
 * constructor, and built every street loop's ring twice more (once for its own
 * street field, once inside its `StreetLoops`). With one cop that was a few
 * milliseconds in `Game.installLevel`; with a pack of three it is the same
 * picture computed three times, for brains that differ only in where they are.
 * So the projection moved here, verbatim, and the brain keeps only cursors:
 * nothing below is written after `buildRouteField` returns, which is what lets
 * three brains read one field without any of them seeing another's state.
 *
 * Nothing here imports three.js (invariant 1) and nothing reads a player
 * option (invariant 5): the plan, the line and the ground are the whole input.
 * `ground` is read at construction only, exactly as the brain's constructor
 * read it before the move.
 */

/**
 * Something on the line worth not hitting, in the line's own coordinates.
 *
 * One shape for hazards and solids alike: a span of route it occupies, the band
 * across the road it blocks, and how fast it may be met. A pothole may be met
 * slowly; a bollard may not be met at all, which is `Infinity`'s meaning here
 * and is why `safeSpeed` is a number rather than a flag.
 */
export interface RouteBlocker {
  /** Where it starts and ends along the line, metres. */
  readonly from: number;
  readonly to: number;
  /** The band it blocks across the road: positive is to the **left**. */
  readonly left: number;
  readonly right: number;
  /** How fast it may be passed through, m/s. Zero means "not at all". */
  readonly safeSpeed: number;
  /**
   * Which way along the line it presents a face: `0` both ways, `1` only to a
   * rider travelling toward the route's end, `-1` only to one riding back —
   * the chase pass. A staircase is three drops one way and three walls the
   * other, and a cop rides half of every chase back the way he came.
   */
  readonly facing: 0 | 1 | -1;
}

/**
 * The road as a CPU rider sees it: the canonical line's blockers, and each
 * street loop's ring with what stands on it.
 *
 * Read-only after construction and shared by every brain in a world
 * (§39.6b.4); `CpuRider` throws if handed a field built on another spine.
 */
export interface RouteField {
  /** The canonical spine the blockers were projected onto. */
  readonly spine: RouteSpine;
  /** Everything on the canonical line worth avoiding, sorted by `from`. */
  readonly blockers: readonly RouteBlocker[];
  /**
   * Each street loop's ring and what stands on it, in its own line's
   * coordinates — the street aim rides roads the canonical line does not
   * carry (M39: the town ring's seam, a block's alternate arm).
   */
  readonly streetFields: readonly { readonly ring: RouteSpine; readonly blockers: readonly RouteBlocker[] }[];
  /**
   * `StreetLoops`' rings, the same instances as `streetFields`
   * (`streetRings[i] === streetFields[i].ring`, §2c R-18), so a brain's own
   * `StreetLoops` rides them rather than rebuilding them.
   */
  readonly streetRings: readonly RouteSpine[];
  /** Where each ring's main arm ends, metres; beyond it is the alternate. */
  readonly streetMainLengths: readonly number[];
  /** Index of the loop with no alternate (the town ring), −1 without one. */
  readonly townRing: number;
  /** The town ring's length, metres; 0 without one. */
  readonly townRingLength: number;
  /**
   * The world's navigation grid (the brutal pass, `navGrid.ts`): what stands
   * off the line, for the close-quarters search. `null` when the field was
   * built without one (`{ nav: false }`: a scripted outlaw's course, which
   * never searches).
   */
  readonly nav: NavGrid | null;
}

/**
 * Build a world's route field — once, in `Game.installChaseWorld` (or a
 * bench's setup), never in the step.
 *
 * The rings are built exactly as `StreetLoops` builds them — a loop's main arm
 * forward, then its alternate back to where the main arm started — and so are
 * the main-arm lengths (the whole ring for the town ring, which has no
 * alternate; the main arm's own traversal otherwise), so a brain handed this
 * field steers by the same numbers a brain that built its own did.
 */
export function buildRouteField(
  spine: RouteSpine,
  plan: LevelPlan,
  ground: TerrainSampler,
  options: { readonly nav?: boolean } = {},
): RouteField {
  const loops = plan.streetLoops ?? [];
  const streetRings = loops.map((loop) => RouteSpine.fromTraversal(plan, [
    ...loop.main.map((id) => ({ id, forward: true })),
    ...[...loop.alternate].reverse().map((id) => ({ id, forward: false })),
  ]));
  const streetMainLengths = loops.map((loop, index) => (
    loop.alternate.length === 0
      ? streetRings[index].length
      : RouteSpine.fromTraversal(plan, loop.main.map((id) => ({ id, forward: true }))).length
  ));
  const streetFields = streetRings.map((ring) => Object.freeze({
    ring,
    blockers: Object.freeze(routeBlockers(ring, plan, ground)),
  }));
  const townRing = loops.findIndex((loop) => loop.alternate.length === 0);
  return Object.freeze({
    spine,
    blockers: Object.freeze(routeBlockers(spine, plan, ground)),
    streetFields: Object.freeze(streetFields),
    streetRings: Object.freeze(streetRings),
    streetMainLengths: Object.freeze(streetMainLengths),
    townRing,
    townRingLength: townRing < 0 ? 0 : streetRings[townRing].length,
    // Built here, once per world, over every road a chase rides (§39.6b.4's
    // rule for anything a pack reads: one build, shared read-only).
    nav: options.nav === false ? null : buildNavGrid(plan, [spine, ...streetRings]),
  });
}

/**
 * The pace a step the wheel cannot mount but a hop can clear is taken at, m/s
 * — the chase pass. The feeler reads a face 0.55 m ahead and the hop needs
 * about a tenth of a second to leave the ground, so a step is met at a walk
 * and hopped, exactly as a player takes a staircase the wrong way.
 */
const STEP_HOP_SPEED = 2.5;

/**
 * How high something has to be before it is worth steering around, metres.
 *
 * Below this it is a kerb, a ledge or a ramp lip — things the wheel climbs, and
 * things `curbAhead` and the hop already answer. A brain that swerved around
 * every kerb would refuse to ride the kerb run, which is a beat.
 *
 * **The wheel's own step limit, not a round number** — the chase pass. It was
 * 0.35 m, and `EucController` mounts nothing taller than
 * `WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor` (0.216 m): the trail's
 * 0.30 m rocks sat in the band between, invisible to the brain and a wall to
 * the wheel, and a cop who no longer crawled past them at the old swerve
 * law's 12 m/s met them at 17 and went over the bars on three pinned seeds.
 * Anything the wheel cannot climb is a thing to steer around.
 */
const BLOCKER_MIN_HEIGHT = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
/**
 * How far outside the corridor a blocker still matters, metres. Exported: the
 * brain's shoulder search asks the walls over exactly this width.
 */
export const BLOCKER_MARGIN = 5;
/** How much of a deck's outer edge is filed as its flank, metres. */
const DECK_FLANK_METRES = 0.5;
/** How finely the line is walked for steps in the ground, metres. */
const STEP_SCAN_METRES = 0.5;
/** Two rises this close along the line are one step, metres. */
const STEP_MERGE_METRES = 1.5;
/** Roughly how large a piece a solid is chopped into before projecting, metres. */
const PIECE_METRES = 1.5;
/** The most pieces a solid is chopped into on one axis. A building is not a wall. */
const PIECE_MAX = 8;

/**
 * Everything on the line worth avoiding, in the line's own coordinates.
 *
 * Run once per world at `Game.installLevel`, never in the step. The hazards
 * come from `plan.hazards` and the solid geometry from the segments' own
 * colliders and `plan.solids` — the two arrays `simulation/planSampler.ts`
 * reads and cannot tell apart, which is the correct reading: a wall is a wall.
 *
 * **`plan.softBodies` is deliberately absent.** A shrub is pass-through by
 * construction (M15) and a cop who steered around bushes would be a cop who
 * cannot be lured into one — which is half of what the escaping player has
 * (§13 q28).
 */
function routeBlockers(
  spine: RouteSpine,
  plan: LevelPlan,
  ground: TerrainSampler,
): RouteBlocker[] {
  const out: RouteBlocker[] = [];
  const located = createSpineLocation();
  const at = createSpineSample();
  const under = createGroundSample();

  /**
   * How high the road is where the line passes `distance`.
   *
   * **Sampled at the *line*, never at the box**, and the difference is the
   * whole point. The sampler resolves a collider by its top face, so asking it
   * about the railing's own footprint answers with the top of the railing and
   * every railing in the game becomes invisible. Asking it about the road
   * beside one answers with the deck, which is what the rider is standing on
   * and what a thing's height has to be measured against.
   */
  const roadHeightAt = (distance: number): number => {
    spine.sample(distance, at);
    ground.sampleGround(at.x, at.z, under);
    return under.height;
  };

  /**
   * The road as measured just clear of a box's own span, not under it.
   *
   * The line-sampling rule above has a blind spot the §4.2 wall repro found:
   * a solid standing *on* the line is its own footprint, so the sampler
   * answers with its top face and the box measures itself as flat road —
   * which is how a wall square across the corridor projected to nothing and
   * the cop rode at it forever. Sampling just before and just after the span
   * and keeping the lower answer measures the box against the road a rider
   * arrives on. The ford's deck stays invisible either way: its top *is* the
   * road on both approaches, so the difference stays under the threshold.
   */
  const roadBesideBox = (distance: number, radius: number): number => Math.min(
    roadHeightAt(distance - radius - 0.6),
    roadHeightAt(distance + radius + 0.6),
  );
  /**
   * The face a box shows a rider arriving from before it and from after it,
   * metres above the road they arrive on — the chase pass. A staircase slab
   * is flush with the road behind it and a step above the road ahead of it,
   * so it is a drop to a rider descending and a wall to one climbing; both
   * answers are kept and the scans read the one for their direction.
   */
  const faces = (top: number, distance: number, radius: number): { forward: number; backward: number } => ({
    forward: top - roadHeightAt(distance - radius - 0.6),
    backward: top - roadHeightAt(distance + radius + 0.6),
  });
  /**
   * What a face this tall may be met at. Taller than a hop clears, nothing;
   * between the wheel's own step and the hop's reach, a walk and a hop.
   */
  const facePace = (height: number): number => (
    height <= CHASE.hopMaxCurbHeight ? STEP_HOP_SPEED : 0
  );

  /**
   * Where a world point sits on the line: how far along, and how far across.
   *
   * **The along-line component is added back, and that is not a refinement.**
   * `locate` clamps to the ends of the line, so everything behind the start
   * projects onto distance zero — and its across-the-line offset is then
   * measured in a frame it is nowhere near, which smears a building standing
   * *behind* the spawn into a band right across the road in front of it. One
   * pinned seed sat at the start line for four minutes waiting for a gap in it.
   * Adding the forward component gives a signed distance that is negative
   * behind the start and past the length beyond the end, and both are then
   * simply not on the route.
   */
  const lateralOf = (x: number, z: number, near: number): { distance: number; lateral: number } => {
    spine.locate(x, z, near, located);
    spine.sample(located.distance, at);
    const dx = x - at.x;
    const dz = z - at.z;
    const cos = Math.cos(at.headingY);
    const sin = Math.sin(at.headingY);
    return {
      distance: located.distance + (dx * sin + dz * cos),
      lateral: dx * cos - dz * sin,
    };
  };

  for (const hazard of plan.hazards ?? []) {
    const { distance, lateral } = lateralOf(hazard.centre.x, hazard.centre.z, -1);
    if (distance < -hazard.radius || distance > spine.length + hazard.radius) continue;
    out.push({
      from: distance - hazard.radius,
      to: distance + hazard.radius,
      left: lateral + hazard.radius,
      right: lateral - hazard.radius,
      // A deep pothole is the wipeout (`level/plan.ts`); a spill and a shallow
      // hole cost a wobble a cop rides out like anybody else, so they are worth
      // a swerve and never worth braking for.
      safeSpeed: hazard.kind === 'potholeDeep' ? EUC.hazardCrashSpeed * 0.7 : Infinity,
      facing: 0,
    });
  }

  const solids: BoxCollider[] = [
    ...plan.segments.flatMap((segment) => segment.colliders),
    ...(plan.solids ?? []),
  ];

  for (const box of solids) {
    // The cheap rejection first: a route carries hundreds of these and almost
    // all of them are dressing well off the road. One projection each.
    const circum = Math.hypot(box.halfExtents.x, box.halfExtents.z);
    const centre = lateralOf(box.centre.x, box.centre.z, -1);
    if (centre.distance < -circum || centre.distance > spine.length + circum) continue;
    spine.sample(centre.distance, at);
    const halfWidthHere = at.halfWidth;
    if (Math.abs(centre.lateral) > halfWidthHere + circum + BLOCKER_MARGIN) continue;
    // Low enough to ride over or hop — a kerb, a ledge, a ramp lip, or the deck
    // of the ford, which is a two-metre-wide box whose top face *is* the road.
    // Measured against the road under the line rather than against the line's
    // own interpolated height: the line runs straight between two sockets and
    // the ford's deck is flat, so on the approach the two disagree by enough to
    // make the road the rider crosses read as a wall across it. Two of the
    // pinned seeds stopped dead at the water's edge on exactly that.
    //
    // **Unless it carries the line** — M39, the kicker ridden back. A box the
    // line runs over is a deck whether or not its top differs from the road
    // either side of it, and a deck's flanks are what the deck branch below
    // is for: the kicker's lip is 0.2 m proud of the mound it sits on, so the
    // whole block read as road and only its last piece — the one that sees
    // the landing past it — filed a flank. Ridden back round the lip's face
    // on the landing-level ground beside it, the cop found no flank for the
    // first six metres of a 1.2 m buttress and steered for the line through
    // it (`sweep-7`). Such a box goes on to its pieces; the ones the road is
    // level with have only their flanks felt.
    spine.sample(centre.distance, at);
    const boxTurn = box.rotationY - at.headingY;
    const carriesLine = Math.abs(centre.lateral) <= box.halfExtents.x * Math.abs(Math.cos(boxTurn))
      + box.halfExtents.z * Math.abs(Math.sin(boxTurn));
    if (!carriesLine && box.centre.y + box.halfExtents.y - roadBesideBox(centre.distance, circum)
      < BLOCKER_MIN_HEIGHT) {
      continue;
    }

    // **Then in pieces, and the subdivision is the whole correctness of this
    // function.** Distance-along and offset-across are curvilinear coordinates,
    // and a shape large compared with the bend it sits on distorts wildly in
    // them: a fourteen-metre wall on the outside of a corner has corners that
    // project ten metres apart across the road, so its bounding band covers the
    // entire corridor and the cop brakes to a stop in front of an open bend.
    // That is exactly what two of the pinned seeds did. Chopped into pieces
    // roughly a wheel's length across, every piece is small compared with the
    // curve and its band is where it actually is.
    const cos = Math.cos(box.rotationY);
    const sin = Math.sin(box.rotationY);
    const alongX = Math.min(PIECE_MAX, Math.max(1, Math.ceil(box.halfExtents.x / PIECE_METRES)));
    const alongZ = Math.min(PIECE_MAX, Math.max(1, Math.ceil(box.halfExtents.z / PIECE_METRES)));
    const halfX = box.halfExtents.x / alongX;
    const halfZ = box.halfExtents.z / alongZ;
    const circumradius = Math.hypot(halfX, halfZ);

    for (let i = 0; i < alongX; i += 1) {
      for (let j = 0; j < alongZ; j += 1) {
        const ox = -box.halfExtents.x + (2 * i + 1) * halfX;
        const oz = -box.halfExtents.z + (2 * j + 1) * halfZ;
        const piece = lateralOf(
          box.centre.x + ox * cos + oz * sin,
          box.centre.z - ox * sin + oz * cos,
          centre.distance,
        );
        // Off either end of the line is not on the route at all.
        if (piece.distance < -circumradius || piece.distance > spine.length + circumradius) continue;
        spine.sample(piece.distance, at);
        // **A piece's band is its own shape turned into the road's frame, not
        // its circumscribed circle** — the chase pass. A piece of the ford's
        // rail is 0.1 m thick and 1.75 m long; as a circle it stood 1.75 m
        // across the road on each side, and two rails 6 m apart left the brain
        // a 1.1 m slot through a 6 m boardwalk he crawled at 5 m/s and still
        // clipped. Turned by the box's own yaw against the road's heading here,
        // the rail is 0.1 m wide and the §4.2 wall is 0.35 m deep, which is
        // what they are.
        const turn = box.rotationY - at.headingY;
        const turnCos = Math.abs(Math.cos(turn));
        const turnSin = Math.abs(Math.sin(turn));
        const across = halfX * turnCos + halfZ * turnSin;
        const along = halfX * turnSin + halfZ * turnCos;
        const radius = along;
        // Per piece, so the half of a building that faces the road is a blocker
        // and the half behind it is not.
        if (Math.abs(piece.lateral) > at.halfWidth + across + BLOCKER_MARGIN) continue;
        const top = box.centre.y + box.halfExtents.y;
        const level = top - roadBesideBox(piece.distance, radius) < BLOCKER_MIN_HEIGHT;
        if (level && !carriesLine) continue;
        // **A box whose top is the road is a deck, not a wall** — the chase
        // pass. The ford's deck, the alley's step slabs and the kicker's ramp
        // all carry the line on their top face, and a rider arrives on one
        // of them from road that is level with it, or a mountable lip below
        // it. Such a box has no face of its own to steer around; where its
        // far edge is a drop or a wall, the ground scan below sees the jump
        // and files it with the direction it faces. What stays here is the
        // thing that stands above the road on both sides: a wall.
        const face = faces(top, piece.distance, radius);
        if (level || Math.min(face.forward, face.backward) < BLOCKER_MIN_HEIGHT) {
          // **A deck's flanks are walls where the ground beside it is lower.**
          // The kicker's ramp is 6 m wide on an 8.8 m road; a cop steering
          // round its lip on the road beside it met the ramp's 1.2 m side.
          // File the outer strip of the deck on each side that stands off the
          // ground, so the line past a deck keeps the wheel's room from it.
          //
          // **Beside the piece, not beside the road past it** — M39. `faces`
          // just walked `at` to the road beyond the piece, and the flanks were
          // being felt from there: off the kicker's lip that is the landing
          // 1.2 m below, so every piece at the lip's far end filed its inner
          // edges as walls, two bogus bands astride the line on top of the
          // lip, and a cop steering round them met its face off-centre.
          spine.sample(piece.distance, at);
          for (const side of [1, -1] as const) {
            const edge = piece.lateral + side * across;
            const beside = edge + side * 0.6;
            ground.sampleGround(
              at.x + Math.cos(at.headingY) * beside,
              at.z - Math.sin(at.headingY) * beside,
              under,
            );
            if (top - under.height < BLOCKER_MIN_HEIGHT) continue;
            out.push({
              from: piece.distance - along,
              to: piece.distance + along,
              left: side > 0 ? edge : edge + DECK_FLANK_METRES,
              right: side > 0 ? edge - DECK_FLANK_METRES : edge,
              safeSpeed: facePace(top - under.height),
              facing: 0,
            });
          }
          continue;
        }
        out.push({
          from: piece.distance - along,
          to: piece.distance + along,
          left: piece.lateral + across,
          right: piece.lateral - across,
          safeSpeed: facePace(Math.min(face.forward, face.backward)),
          facing: 0,
        });
      }
    }
  }

  // -- Steps in the ground itself — the chase pass --------------------------
  //
  // A staircase is three 0.30 m drops one way and three walls the other, and
  // the kicker's lip is a jump one way and a 1.2 m face from the landing;
  // none of it is a box standing on the road, so none of it was in this
  // field, and a cop riding a route back the way he came — which is half of
  // every chase, because the player turns at the ends — met all of it at
  // speed. Walk the line, file every rise the wheel cannot mount, and give it
  // the direction it faces; the lateral scan says how much of the road it
  // crosses, so the kicker's lip leaves the road beside the ramp open, which
  // is the bypass a player takes.
  const stepBefore = createSpineSample();
  const stepAfter = createSpineSample();
  const groundA = createGroundSample();
  const groundB = createGroundSample();
  const heightAt = (sample: SpineSample, lateral: number, sink: typeof groundA): number => {
    ground.sampleGround(
      sample.x + Math.cos(sample.headingY) * lateral,
      sample.z - Math.sin(sample.headingY) * lateral,
      sink,
    );
    return sink.height;
  };
  let lastStepAt = -Infinity;
  for (let distance = STEP_SCAN_METRES; distance <= spine.length; distance += STEP_SCAN_METRES) {
    spine.sample(distance - STEP_SCAN_METRES, stepBefore);
    spine.sample(distance, stepAfter);
    const rise = heightAt(stepAfter, 0, groundB) - heightAt(stepBefore, 0, groundA);
    if (Math.abs(rise) < BLOCKER_MIN_HEIGHT || distance - lastStepAt < STEP_MERGE_METRES) continue;
    lastStepAt = distance;
    const reach = (side: 1 | -1): number => {
      let extent = 0;
      for (let lateral = 1; lateral <= stepAfter.halfWidth + BLOCKER_MARGIN; lateral += 1) {
        const there = heightAt(stepAfter, side * lateral, groundB)
          - heightAt(stepBefore, side * lateral, groundA);
        if (Math.abs(there) < BLOCKER_MIN_HEIGHT || Math.sign(there) !== Math.sign(rise)) break;
        extent = lateral;
      }
      // The edge lies somewhere in the metre past the last sample that was
      // still a step; claim the whole metre, because the thing that makes
      // the step — a ramp's flank, a slab's end — is a wall at that edge.
      return extent + 1;
    };
    out.push({
      from: distance - STEP_SCAN_METRES - 0.25,
      to: distance + 0.25,
      left: reach(1),
      right: -reach(-1),
      safeSpeed: facePace(Math.abs(rise)),
      facing: rise > 0 ? 1 : -1,
    });
  }

  out.sort((a, b) => a.from - b.from);
  return out;
}
