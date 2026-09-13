/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHASE, GROUP_SPAWN, TERRAIN } from '../data/tuning.ts';
import type { BoxCollider, Hazard, Target } from '../level/plan.ts';
import type { Spawn } from './EucController.ts';
import type { Paddle } from './paddle.ts';
import { SLOT_FOOTPRINT_METRES } from './spawnSlots.ts';
import { createGroundSample } from './world.ts';
import type { GroundSample, SurfaceId, TerrainSampler } from './world.ts';

/**
 * Where **three or four** riders are stood at the start of a bout — M37
 * Phase 2 (`docs/PLANS.md` §37.4).
 *
 * `spawnSlots.ts` answers a different question, and the difference is the
 * whole reason this file exists. That one derives *one seat's* slot from the
 * plan's start pose and checks it; run it N times and you get N independently
 * acceptable slots, which §37.4 points out can be the same slot — and which on
 * every world actually shipped comes out as a nine-metre line abreast with one
 * seat six metres behind the others on BelVar (M37 Phase 0, measured). Nobody
 * is inside anybody's reach there. Nobody is in a fight either.
 *
 * So a group is proposed and validated **as a whole, before anyone moves**:
 *
 *   - a **regular ring** near the plan's start, every rider facing the ring's
 *     centre, so the shared meeting area is in front of all of them and no
 *     seat owns it;
 *   - a radius derived from the real weapon — `groupSeparation` reads
 *     `Paddle.reachAgainst(CHASE.riderHitRadius)` rather than repeating
 *     2.15 m — so a retune of the arm moves the ring;
 *   - **seat → position dealt by a match-placement seed**, not by seat order,
 *     so the same world and seed reproduce the pack and a fresh bout deals
 *     again;
 *   - a bounded, ordered candidate search, and a **reproducible failure** when
 *     none of it fits. There is no fallback to overlapping riders or to the
 *     plan's own spawn: §37.4 forbids it, and the caller is the only thing that
 *     can decide what "this world cannot hold a bout" should look like.
 *
 * **Ground truth stays the sampler's** (invariant 3). Authored volumes that
 * the sampler has no query for — hazards, soft bodies, targets — arrive as
 * plain data through `GroupObstacle`, which §37.4 explicitly permits; nothing
 * here imports a renderer, a level producer or three.js.
 *
 * **The flat height window is deliberately not reused.** `slotIsGround` tests
 * every candidate against one reference height with a `TERRAIN.curbThreshold`
 * window, which is right for a slot a metre from a spawn and wrong for a pack
 * 3.4 m across: on a 3.18 % route (`sweep-19`) that window is used up in
 * 1.26 m, below the N=3 ring radius, and a legitimately graded road refuses
 * itself. A pack is tested against **its own local ground plane** instead, and
 * the total rise across it is bounded separately by
 * `GROUP_SPAWN.maxPackRiseMetres` so a planar bank is still refused.
 */

// ---------------------------------------------------------------------------
// What a caller hands in
// ---------------------------------------------------------------------------

/**
 * What kind of thing a handed-in volume is.
 *
 * Carried so a refusal can say *why* a candidate was thrown away — "a hazard
 * 0.4 m from seat 2" is a report; "obstacle" is a shrug. The clearance demanded
 * is the same for all three: a rider who starts inside a bush, on a pothole rim
 * or against a tree has a worse first second than one who does not, and the
 * three cases are not worth three numbers.
 */
export type GroupObstacleKind = 'solid' | 'soft' | 'hazard';

/** A circular footprint in XZ — a hazard, a target disc, a post. */
export interface GroupObstacleCircle {
  readonly kind: GroupObstacleKind;
  readonly shape: 'circle';
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** A box footprint in XZ, in its own rotated frame — a collider, a prop. */
export interface GroupObstacleBox {
  readonly kind: GroupObstacleKind;
  readonly shape: 'box';
  readonly x: number;
  readonly z: number;
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
  /** Rotation about +Y, radians. Zero is axis-aligned. */
  readonly rotationY: number;
}

export type GroupObstacle = GroupObstacleCircle | GroupObstacleBox;

/**
 * The authored volumes of a `LevelPlan`, flattened into plain data.
 *
 * The composition root owns the plan; this is the one place the mapping from
 * plan fields to "things not to stand on" is written down, so `Game` and the
 * test cannot disagree about whether `plan.solids` counts. It does, and it has
 * to: the nearest solid to any shipped spawn is 3.27 m away and it is a prop
 * box rather than a segment collider (M37 Phase 0).
 *
 * Segment colliders are **not** included, and that is not an omission — they
 * already reach the validator through the sampler, which reports the top face
 * of any upright box standing at a point, so a pack inside a wall fails the
 * residual test without this file knowing what a wall is.
 */
export function groupObstaclesFrom(plan: {
  readonly solids?: readonly BoxCollider[];
  readonly softBodies?: readonly BoxCollider[];
  readonly hazards?: readonly Hazard[];
  readonly targets?: readonly Target[];
}): GroupObstacle[] {
  const out: GroupObstacle[] = [];
  const box = (collider: BoxCollider, kind: GroupObstacleKind): GroupObstacleBox => ({
    kind,
    shape: 'box',
    x: collider.centre.x,
    z: collider.centre.z,
    halfExtentX: collider.halfExtents.x,
    halfExtentZ: collider.halfExtents.z,
    rotationY: collider.rotationY,
  });
  for (const solid of plan.solids ?? []) out.push(box(solid, 'solid'));
  for (const soft of plan.softBodies ?? []) out.push(box(soft, 'soft'));
  for (const hazard of plan.hazards ?? []) {
    out.push({ kind: 'hazard', shape: 'circle', x: hazard.centre.x, z: hazard.centre.z, radius: hazard.radius });
  }
  // A target's stand is a post on the verge and its disc hangs over the road;
  // a rider standing in either is standing in the scenery. Counted as a solid
  // because that is what it is to ride into, not because of what it scores.
  for (const target of plan.targets ?? []) {
    out.push({ kind: 'solid', shape: 'circle', x: target.centre.x, z: target.centre.z, radius: target.radius });
    out.push({ kind: 'solid', shape: 'circle', x: target.base.x, z: target.base.z, radius: target.radius });
  }
  return out;
}

// ---------------------------------------------------------------------------
// What it gives back
// ---------------------------------------------------------------------------

/** One candidate the search threw away, and the measurement that threw it. */
export interface GroupSpawnRefusal {
  /**
   * Position in the ordered candidate list, from zero.
   *
   * `-1` means the call was refused before any candidate was built — an
   * unsupported participant count or a nonsensical separation.
   */
  readonly candidate: number;
  readonly reason: string;
}

/** A whole pack, ready to be stood up. */
export interface GroupSpawnAccepted {
  readonly ok: true;
  /** One spawn per seat. The index **is** the seat. */
  readonly spawns: readonly Spawn[];
  /** The smallest distance between any two riders in the pack, metres. */
  readonly minPairClearance: number;
  /** The shared meeting area every rider is facing. */
  readonly centre: { readonly x: number; readonly y: number; readonly z: number };
  /** The pack's own radius — ring radius, or the arc's bounding radius. */
  readonly radius: number;
  /** Which candidate in the ordered search this was. */
  readonly candidate: number;
  /** The match-placement seed that dealt the seats. */
  readonly seed: string;
  /** How many candidates were built before this one was accepted, inclusive. */
  readonly tried: number;
  /** Everything refused on the way here. Empty when the first candidate fit. */
  readonly refused: readonly GroupSpawnRefusal[];
}

/** No pack, and the reason for every candidate that failed. */
export interface GroupSpawnRefused {
  readonly ok: false;
  readonly tried: number;
  readonly refused: readonly GroupSpawnRefusal[];
}

export type GroupSpawnResult = GroupSpawnAccepted | GroupSpawnRefused;

// ---------------------------------------------------------------------------
// The numbers, derived
// ---------------------------------------------------------------------------

/** The participant counts this producer places. Two seats keep `spawnSlot`. */
export const GROUP_SPAWN_COUNTS: readonly number[] = [3, 4];

/**
 * How far apart a bout must stand any two riders, metres.
 *
 * **Read off the weapon, never written down.** `Paddle.reachAgainst` is the
 * sphere-capsule bound over the whole arc — the furthest a parked wielder can
 * put anybody down, 2.15 m at the shipped tuning and held to a real swept
 * search by `paddle.test.ts`. Add `GROUP_SPAWN.pairMarginMetres` and that is
 * the separation.
 *
 * Exported so `Game` and `groupSpawn.test.ts` cannot disagree: the caller hands
 * the number in, and there is exactly one place that computes it.
 */
export function groupSeparation(
  paddle: Pick<Paddle, 'reachAgainst'>,
  riderRadius: number = CHASE.riderHitRadius,
): number {
  return paddle.reachAgainst(riderRadius) + GROUP_SPAWN.pairMarginMetres;
}

/**
 * The radius a regular `count`-ring needs for that separation, metres.
 *
 * The nearest chord of a regular N-gon is `2·r·sin(π/N)`, so the radius is the
 * separation divided by that factor — and then rounded **up** to
 * `GROUP_SPAWN.ringRadiusStepMetres`, so the pack's tightest pair is a hair
 * outside the bound rather than exactly on it.
 */
export function groupRingRadius(separation: number, count: number): number {
  return radiusForChord(separation, (2 * Math.PI) / count);
}

/**
 * The radius at which points `angle` apart are `chord` apart, rounded up.
 *
 * **Strictly up, never onto the bound.** `Math.ceil` of an exact multiple is
 * that multiple, and the last bits of `2·sin(π/6)` are below a half, so a
 * separation that happens to land on a rounding step would come back as a ring
 * a hair *inside* the reach it was derived from. Nudging before the ceiling
 * costs at most one five-centimetre step and removes the case entirely.
 */
function radiusForChord(chord: number, angle: number): number {
  const exact = chord / (2 * Math.sin(angle / 2));
  const step = GROUP_SPAWN.ringRadiusStepMetres;
  return Math.ceil((exact + 1e-6) / step) * step;
}

/**
 * How far a rider must be from any handed-in volume, metres.
 *
 * The rider's own footprint — the same half-metre-ish disc `spawnSlots.ts`
 * samples the ground over — plus the pair margin, so an obstacle is given the
 * same daylight a neighbour is. Two existing numbers rather than a third.
 */
export const GROUP_OBSTACLE_CLEARANCE_METRES = SLOT_FOOTPRINT_METRES + GROUP_SPAWN.pairMarginMetres;

// ---------------------------------------------------------------------------
// The match-placement stream
// ---------------------------------------------------------------------------

/**
 * The bout's own random stream — §37.4's "separate match-placement seed".
 *
 * **Deliberately not `level/seedStreams.ts`.** That file's whole contract is
 * that a domain's draws are a function of the *world's* seed, so that "ride
 * seed 4812" names a place; a bout dealt from it would either change the world
 * or be the same deal every match. A match-placement seed is a different kind
 * of thing — it changes every bout and names nothing — so it gets its own two
 * functions here, in `simulation/`, where the pack is built.
 *
 * SplitMix32 over an FNV-1a digest of the seed string, on `seedStreams.ts`'s
 * argument: integer-only internals, so a browser and `node --test` deal the
 * same pack. `Math.random` is banned in this directory and would make a
 * "reproduce that bout" impossible anyway.
 */
function placementStream(seed: string): () => number {
  // FNV-1a, 32-bit. Short seeds like "1" and "2" must not start adjacent.
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  };
}

/**
 * Which position each seat takes, dealt from the placement seed.
 *
 * Returned as `deal[seat] = position`. A Fisher-Yates over the position
 * indices, so every permutation is reachable and no seat has a standing claim
 * on any part of the ring — which is the half of "no spawn advantage" that
 * geometry cannot provide, because a ring is only symmetric until somebody
 * decides who stands where.
 *
 * Exported for the test: proving the deal is seeded means being able to ask
 * for it without building a world.
 */
export function groupSeatDeal(seed: string, count: number): number[] {
  const next = placementStream(seed);
  const deal = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const held = deal[index];
    deal[index] = deal[swap];
    deal[swap] = held;
  }
  return deal;
}

// ---------------------------------------------------------------------------
// The producer
// ---------------------------------------------------------------------------

/** One proposed pack, before the ground has been asked about it. */
interface Layout {
  readonly label: string;
  readonly strict: boolean;
  readonly centreX: number;
  readonly centreZ: number;
  /** Positions in canonical order; the seat deal permutes them. */
  readonly points: readonly { readonly x: number; readonly z: number }[];
  /** How far each rider sits from the focus they are all facing, metres. */
  readonly radius: number;
  /** Where every rider looks. The ring's centre, or the arc's focus. */
  readonly focusX: number;
  readonly focusZ: number;
}

/**
 * Stand `count` riders for a bout, or say why it cannot be done.
 *
 * `base` is the plan's own spawn — the pose every world already states, used
 * as the origin of the search frame and never as a fallback position.
 * `separation` is handed in rather than computed here so that one call site
 * owns it; `groupSeparation` is that call site's arithmetic.
 *
 * Never throws. A world with nowhere to stand a pack, an unsupported seat
 * count and a separation wider than the road all come back as
 * `{ ok: false, tried, refused }` with the measurements that refused them,
 * because "the mode is unavailable here" is a decision for the composition
 * root and a silent overlapping fallback is the one thing §37.4 rules out.
 *
 * Called when a bout is armed, never in the frame loop.
 */
export function groupSpawns(
  base: Spawn,
  count: number,
  terrain: TerrainSampler,
  seed: string,
  obstacles: readonly GroupObstacle[],
  separation: number,
): GroupSpawnResult {
  const refused: GroupSpawnRefusal[] = [];
  if (!GROUP_SPAWN_COUNTS.includes(count)) {
    refused.push({
      candidate: -1,
      reason: `unsupported participant count ${count} — a group start places ${GROUP_SPAWN_COUNTS.join(' or ')}`,
    });
    return { ok: false, tried: 0, refused };
  }
  if (!Number.isFinite(separation) || separation <= 0) {
    refused.push({ candidate: -1, reason: `separation ${separation} is not a distance` });
    return { ok: false, tried: 0, refused };
  }
  // A non-finite start pose cannot be refused downstream: `PlanTerrainSampler`
  // does not report a NaN probe as off the course, and every `Math.abs(NaN) >
  // threshold` in the validator is false, so a NaN spawn would sail through the
  // whole search and come back as an accepted pack of NaN positions. Producers
  // author `plan.spawn`, so this cannot happen in the game — it is refused here
  // because a producer bug should read as one rather than as a placed bout.
  if (
    !Number.isFinite(base.position.x)
    || !Number.isFinite(base.position.z)
    || !Number.isFinite(base.headingY)
  ) {
    refused.push({ candidate: -1, reason: 'the plan\u2019s own spawn is not a finite pose' });
    return { ok: false, tried: 0, refused };
  }

  // The start pose's own frame. +X is the rider's LEFT (AGENTS.md), so the left
  // of a heading `h` is `(cos h, -sin h)` — `spawnSlots.ts` states the same
  // convention for the same reason, and the two files share nothing else.
  const leftX = Math.cos(base.headingY);
  const leftZ = -Math.sin(base.headingY);
  const forwardX = Math.sin(base.headingY);
  const forwardZ = Math.cos(base.headingY);

  const ringRadius = groupRingRadius(separation, count);
  const deal = groupSeatDeal(seed, count);
  const probe = createGroundSample();
  const origin = createGroundSample();

  let candidate = 0;
  for (const layout of layouts(base, count, separation, ringRadius, leftX, leftZ, forwardX, forwardZ)) {
    const index = candidate;
    candidate += 1;
    const verdict = validate(layout, terrain, probe, origin, obstacles, separation, leftX, leftZ, forwardX, forwardZ);
    if (typeof verdict === 'string') {
      refused.push({ candidate: index, reason: `${layout.label}: ${verdict}` });
      continue;
    }

    const spawns: Spawn[] = [];
    for (let seat = 0; seat < count; seat += 1) {
      const point = layout.points[deal[seat]];
      terrain.sampleGround(point.x, point.z, probe);
      spawns.push({
        position: { x: point.x, y: probe.height, z: point.z },
        // Facing the shared meeting area. `atan2(dx, dz)` is the inverse of the
        // `(sin h, cos h)` forward vector this project uses everywhere.
        headingY: Math.atan2(layout.focusX - point.x, layout.focusZ - point.z),
      });
    }
    // **The shared meeting area is the focus, not the search's own anchor.**
    // They are the same point for a ring and they are not for the arc, and it
    // is the focus every rider is facing — so it is the focus the caller is
    // told about.
    terrain.sampleGround(layout.focusX, layout.focusZ, probe);
    return {
      ok: true,
      spawns,
      minPairClearance: verdict.minPairClearance,
      centre: { x: layout.focusX, y: probe.height, z: layout.focusZ },
      radius: layout.radius,
      candidate: index,
      seed,
      tried: candidate,
      refused,
    };
  }

  return { ok: false, tried: candidate, refused };
}

/**
 * Every candidate the search will try, in order.
 *
 * **Shape first, then how fussy, then how far forward, then how turned.** The
 * ring is the shape §37.4 asked for and the arc is what happens when the road
 * cannot hold one, so a lenient ring beats a strict arc; within a shape, the
 * strict pass is the one where every rider stands on the surface the plan's
 * spawn stands on, exactly as `spawnSlots.ts` prefers it.
 *
 * Offsets run from the spawn itself outward. On 28 of the 29 worlds measured
 * at Phase 0 the spawn-centred ring reaches back over the verge band behind the
 * start — on-course, level, and a different material — so the strict pass
 * usually takes the first translation; BelVar, whose apron is wide, keeps the
 * spawn itself. That is the intended behaviour of the order rather than an
 * accident of it.
 *
 * Rotations are `0`, `π/N` and `π/2N`: a half-sector turn moves every rider to
 * where the gaps were, and a quarter-sector turn is the odd one out that finds
 * a diagonal. A full sector would be the same ring with the points renamed, and
 * the seat deal already renames them.
 *
 * Thirty-two candidates at either seat count. Bounded, and short enough that a
 * failure can report all of them.
 */
function* layouts(
  base: Spawn,
  count: number,
  separation: number,
  ringRadius: number,
  leftX: number,
  leftZ: number,
  forwardX: number,
  forwardZ: number,
): Generator<Layout> {
  const offsets: number[] = [];
  for (let forward = 0; forward <= GROUP_SPAWN.forwardSearchMetres + 1e-9; forward += GROUP_SPAWN.forwardStepMetres) {
    offsets.push(forward);
  }
  const rotations = [0, Math.PI / count, Math.PI / (2 * count)];

  for (const shape of ['ring', 'arc'] as const) {
    for (const strict of [true, false]) {
      for (const forward of offsets) {
        const centreX = base.position.x + forwardX * forward;
        const centreZ = base.position.z + forwardZ * forward;
        if (shape === 'ring') {
          for (const rotation of rotations) {
            const points: { x: number; z: number }[] = [];
            for (let index = 0; index < count; index += 1) {
              const angle = rotation + (index * 2 * Math.PI) / count;
              const along = Math.cos(angle) * ringRadius;
              const across = Math.sin(angle) * ringRadius;
              points.push({
                x: centreX + forwardX * along + leftX * across,
                z: centreZ + forwardZ * along + leftZ * across,
              });
            }
            yield {
              label: `ring +${forward.toFixed(1)} m rot ${rotation.toFixed(3)} ${strict ? 'strict' : 'lenient'}`,
              strict,
              centreX,
              centreZ,
              points,
              radius: ringRadius,
              focusX: centreX,
              focusZ: centreZ,
            };
          }
        } else {
          yield arcLayout(count, separation, strict, forward, centreX, centreZ, leftX, leftZ, forwardX, forwardZ);
        }
      }
    }
  }
}

/**
 * The roomier fallback: a shallow arc across the road, focused down it.
 *
 * **What it buys is the direction nobody departs in.** A ring puts one rider
 * in front of the meeting area, and that rider's clear departure runs
 * *backwards up the route* — into the direction that actually runs out at a
 * spawn, which is the one behind it (`switchback` has three metres behind its
 * apron, `sweep-19` two; forward room is sixty metres on twenty-five of the
 * twenty-nine worlds measured at Phase 0). On this arc every rider sits behind
 * the focus and faces it, so **no departure has a backward component at all**:
 * the outermost heading is sixty degrees off the route, not square across it.
 * It is also half as deep as the ring and rather wider, which is the other half
 * of "roomier" — and it is still a shared meeting area, because the riders sit
 * on a circle whose centre is the thing they are all pointed at.
 *
 * A 120° sector with the seats spaced at the same `separation` chord the ring
 * uses; the arc's own radius falls out of those two.
 *
 * **It is a fallback and it costs something**, which is worth saying plainly:
 * the middle of an arc is nearer to both its neighbours than the ends are to
 * each other, so opening *opportunity* is less even than on a ring even though
 * no opening swing can land. The seat deal is what keeps that unevenness from
 * belonging to a seat, and the ring is tried first, at every offset and every
 * rotation, on every world.
 */
function arcLayout(
  count: number,
  separation: number,
  strict: boolean,
  forward: number,
  centreX: number,
  centreZ: number,
  leftX: number,
  leftZ: number,
  forwardX: number,
  forwardZ: number,
): Layout {
  const sector = (2 * Math.PI) / 3;
  const step = sector / (count - 1);
  const radius = radiusForChord(separation, step);

  // Where each rider sits relative to the focus, in the start frame: backward
  // from it by the arc's radius, swung out by its share of the sector.
  const seats: { along: number; across: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -sector / 2 + index * step;
    seats.push({ along: -Math.cos(angle) * radius, across: Math.sin(angle) * radius });
  }

  // The focus sits ahead of the candidate centre by whatever puts the riders'
  // **own** fore-aft extent symmetrically about that centre, so the arc is
  // tested over the same patch of road the ring at this offset was and a short
  // clear band admits it.
  //
  // **Measured off the seats, not off the sector's sagitta.**
  // `radius·(1 − cos(sector/2))` is the depth of the full 120° arc, which is
  // the riders' spread only when somebody actually sits at each end AND at the
  // middle: true at N=3, false at N=4, where the inner pair sit 20° off the
  // axis rather than on it. Using the sagitta there put the pack 0.107 m
  // forward of the centre the comment claimed. `groupSpawn.test.ts` holds the
  // midpoint to the candidate centre at both seat counts.
  let shallowest = seats[0].along;
  let deepest = seats[0].along;
  for (const seat of seats) {
    shallowest = Math.min(shallowest, seat.along);
    deepest = Math.max(deepest, seat.along);
  }
  const focusAlong = -(shallowest + deepest) / 2;
  const focusX = centreX + forwardX * focusAlong;
  const focusZ = centreZ + forwardZ * focusAlong;

  const points = seats.map((seat) => ({
    x: focusX + forwardX * seat.along + leftX * seat.across,
    z: focusZ + forwardZ * seat.along + leftZ * seat.across,
  }));
  return {
    label: `arc +${forward.toFixed(1)} m ${strict ? 'strict' : 'lenient'}`,
    strict,
    centreX,
    centreZ,
    points,
    radius,
    focusX,
    focusZ,
  };
}

// ---------------------------------------------------------------------------
// The whole-pack validator
// ---------------------------------------------------------------------------

/** What a candidate is worth once the ground has been asked. */
interface Verdict {
  readonly minPairClearance: number;
}

/**
 * Is this whole pack somewhere a bout can start?
 *
 * Every test here is over the *pack*, which is the point: §37.4 asks for the
 * complete group to be checked rather than each rider's distance from seat 0.
 * In order, cheapest refusal first:
 *
 *   1. **The pack's own ground plane.** Five samples — the centre and four
 *      points a radius out along the start frame — give a fore-aft and a
 *      left-right slope by central difference. Every rider centre and every
 *      footprint point is then predicted from that plane and its **residual**
 *      held to `TERRAIN.curbThreshold`. A kerb, a wall top, a ditch and a
 *      pothole lip all fail it; an honest 3 % grade does not, which is exactly
 *      what the flat window this replaces got wrong.
 *   2. **On-course**, absolutely, for every point sampled — the surround is
 *      real ground and not a place to start a bout.
 *   3. **Surface**, on the strict pass only, for the rider centres. Footprint
 *      samples are exempt on `slotIsGround`'s argument: a spawn's footprint
 *      already reaches past the first metre of road on every generated world.
 *   4. **Obstacles**, by `GROUP_OBSTACLE_CLEARANCE_METRES` from every handed-in
 *      volume's own boundary.
 *   5. **Total rise**, so a planar bank is refused even though it has no step.
 *      It is **last of the per-point tests and not first**, because it is an
 *      aggregate of 2–4 above: the lowest and highest cannot be known until
 *      every rider centre and footprint has been sampled. A bank that also has
 *      a surface mismatch therefore reports the surface, not the bank.
 *   6. **Pair separation**, over all unordered pairs. Distance is symmetric, so
 *      one test covers both directions of a pair; what "both directions" is
 *      really about is the *weapon*, and that is asserted against a real swung
 *      `Paddle` in `groupSpawn.test.ts` rather than inferred here.
 *   7. **A clear departure** for each rider, along the heading they will
 *      actually be facing, for `GROUP_SPAWN.departureMetres`.
 *
 * The reason returned is the first of those that was actually wrong, read in
 * that order.
 *
 * Returns the verdict, or the sentence that refused it.
 */
function validate(
  layout: Layout,
  terrain: TerrainSampler,
  probe: GroundSample,
  origin: GroundSample,
  obstacles: readonly GroupObstacle[],
  separation: number,
  leftX: number,
  leftZ: number,
  forwardX: number,
  forwardZ: number,
): Verdict | string {
  terrain.sampleGround(layout.centreX, layout.centreZ, origin);
  if (origin.offCourse) return 'the pack centre is off the course';
  const centreHeight = origin.height;
  const centreSurface: SurfaceId = origin.surface;

  // The local plane, by central difference over the pack's own extent. The
  // sampler's normal would answer the same question at a point; four probes
  // answer it over the patch the riders actually occupy, which is the thing a
  // pack needs and a point does not.
  //
  // **Measured per axis, not over a bounding circle.** The arc is wide and
  // shallow, and probing it at its bounding radius would ask about ground two
  // metres behind a pack that never goes there — which on a short apron is
  // ground that does not exist, and would refuse the very candidate the arc
  // is for.
  let spanAlong: number = GROUP_SPAWN.ringRadiusStepMetres;
  let spanAcross: number = GROUP_SPAWN.ringRadiusStepMetres;
  for (const point of layout.points) {
    const dx = point.x - layout.centreX;
    const dz = point.z - layout.centreZ;
    spanAlong = Math.max(spanAlong, Math.abs(dx * forwardX + dz * forwardZ));
    spanAcross = Math.max(spanAcross, Math.abs(dx * leftX + dz * leftZ));
  }
  const slope = (aheadX: number, aheadZ: number, span: number): number | string => {
    terrain.sampleGround(layout.centreX + aheadX * span, layout.centreZ + aheadZ * span, probe);
    if (probe.offCourse) return 'a plane probe is off the course';
    const ahead = probe.height;
    terrain.sampleGround(layout.centreX - aheadX * span, layout.centreZ - aheadZ * span, probe);
    if (probe.offCourse) return 'a plane probe is off the course';
    return (ahead - probe.height) / (2 * span);
  };
  const alongSlope = slope(forwardX, forwardZ, spanAlong);
  if (typeof alongSlope === 'string') return alongSlope;
  const acrossSlope = slope(leftX, leftZ, spanAcross);
  if (typeof acrossSlope === 'string') return acrossSlope;

  const predict = (x: number, z: number): number => {
    const dx = x - layout.centreX;
    const dz = z - layout.centreZ;
    const along = dx * forwardX + dz * forwardZ;
    const across = dx * leftX + dz * leftZ;
    return centreHeight + alongSlope * along + acrossSlope * across;
  };

  let lowest = centreHeight;
  let highest = centreHeight;
  const check = (x: number, z: number, what: string, surfaceMatters: boolean): string | null => {
    terrain.sampleGround(x, z, probe);
    if (probe.offCourse) return `${what} is off the course`;
    if (surfaceMatters && layout.strict && probe.surface !== centreSurface) {
      return `${what} stands on ${probe.surface} beside a centre on ${centreSurface}`;
    }
    const residual = probe.height - predict(x, z);
    if (Math.abs(residual) > TERRAIN.curbThreshold) {
      return `${what} sits ${residual.toFixed(3)} m off the pack's own ground plane, which is a step`;
    }
    if (probe.height < lowest) lowest = probe.height;
    if (probe.height > highest) highest = probe.height;
    return null;
  };

  for (const [index, point] of layout.points.entries()) {
    const centreFault = check(point.x, point.z, `position ${index}`, true);
    if (centreFault) return centreFault;
    for (const [offsetX, offsetZ] of FOOTPRINT) {
      const fault = check(
        point.x + offsetX * SLOT_FOOTPRINT_METRES,
        point.z + offsetZ * SLOT_FOOTPRINT_METRES,
        `position ${index}'s footprint`,
        false,
      );
      if (fault) return fault;
    }
    const blocking = blockingObstacle(point.x, point.z, obstacles);
    if (blocking) {
      return blocking.gap < 0
        ? `position ${index} stands ${(-blocking.gap).toFixed(3)} m inside a ${blocking.kind}`
        : `position ${index} is ${blocking.gap.toFixed(3)} m from a ${blocking.kind}, inside the `
          + `${GROUP_OBSTACLE_CLEARANCE_METRES.toFixed(2)} m a rider needs`;
    }
  }

  if (highest - lowest > GROUP_SPAWN.maxPackRiseMetres) {
    return `the pack spans ${(highest - lowest).toFixed(3)} m of height, which is a bank rather than a start`;
  }

  let minPairClearance = Infinity;
  for (let a = 0; a < layout.points.length; a += 1) {
    for (let b = a + 1; b < layout.points.length; b += 1) {
      const gap = Math.hypot(
        layout.points[a].x - layout.points[b].x,
        layout.points[a].z - layout.points[b].z,
      );
      if (gap < minPairClearance) minPairClearance = gap;
    }
  }
  if (minPairClearance < separation - 1e-9) {
    return `positions are ${minPairClearance.toFixed(3)} m apart, inside the ${separation.toFixed(3)} m a `
      + 'swing needs to miss';
  }

  for (const [index, point] of layout.points.entries()) {
    const fault = departureIsClear(point, layout, terrain, probe, obstacles);
    if (fault) return `position ${index}: ${fault}`;
  }

  return { minPairClearance };
}

/**
 * The four points a wheel and its pedals cover, as unit offsets.
 *
 * `spawnSlots.ts` samples exactly these four at exactly this radius, and the
 * two files deliberately agree. It is a **sampling resolution, not an
 * exhaustive footprint test**, and the resolution is worth writing down
 * rather than letting "validate every footprint point" sound complete: a
 * straight-edged defect running at 45° to the world axes threads between the
 * four probes, and a brute-force sweep over orientations and offsets (M37
 * Phase 2 repair pass, measured) put the closest an undetected 0.40 m step or
 * course edge gets to an accepted rider's centre at 0.307 m. No shipped world
 * or swept seed exhibits it; four diagonal probes per rider would close it to
 * 0.370 m, and adding them is the owner's call rather than this pass's.
 */
const FOOTPRINT: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Can this rider ride away from here?
 *
 * A stationary ground sample cannot see that somebody is facing a wall, so the
 * heading they will actually carry is marched out for
 * `GROUP_SPAWN.departureMetres` and every probe asked three things: is this
 * still the course, is the step from the last probe a step, and is there
 * anything standing here.
 *
 * **Consecutive samples, not the pack's plane.** A departure leaves the patch
 * the plane was fitted over — a road is allowed to crest or curve away within
 * four metres, and refusing it would refuse honest routes. What a departure
 * must not contain is a *step*, which is a local question, and
 * `GROUP_SPAWN.departureSampleMetres` is well under a heightfield cell so one
 * cannot hide between two probes.
 */
function departureIsClear(
  point: { readonly x: number; readonly z: number },
  layout: Layout,
  terrain: TerrainSampler,
  probe: GroundSample,
  obstacles: readonly GroupObstacle[],
): string | null {
  const dx = layout.focusX - point.x;
  const dz = layout.focusZ - point.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return 'stands on the meeting point, so it has no facing';
  const stepX = dx / length;
  const stepZ = dz / length;

  terrain.sampleGround(point.x, point.z, probe);
  let previous = probe.height;
  for (
    let travelled = GROUP_SPAWN.departureSampleMetres;
    travelled <= GROUP_SPAWN.departureMetres + 1e-9;
    travelled += GROUP_SPAWN.departureSampleMetres
  ) {
    const x = point.x + stepX * travelled;
    const z = point.z + stepZ * travelled;
    terrain.sampleGround(x, z, probe);
    if (probe.offCourse) return `the road runs out ${travelled.toFixed(2)} m ahead of the facing`;
    if (Math.abs(probe.height - previous) > TERRAIN.curbThreshold) {
      return `a ${(probe.height - previous).toFixed(3)} m step sits ${travelled.toFixed(2)} m ahead of the facing`;
    }
    previous = probe.height;
    const blocking = blockingObstacle(x, z, obstacles);
    if (blocking) {
      return `a ${blocking.kind} sits ${travelled.toFixed(2)} m ahead of the facing`;
    }
  }
  return null;
}

/**
 * The handed-in volume this point breaches worst, if any.
 *
 * Distance to the volume's own boundary, so a wide prop refuses further out
 * than a post does. A point inside a volume reports a negative gap, which is
 * inside any positive clearance — no special case needed for "standing in it".
 *
 * **The whole list is walked even after something has refused**, so the
 * sentence a refusal carries names the closest volume rather than whichever
 * one the plan happened to enumerate first: two plans holding the same
 * geometry in a different order would otherwise print different reasons for
 * the identical pack. Acceptance never depended on the order — any one
 * breach refuses — so this buys honest text, not a different verdict.
 */
function blockingObstacle(
  x: number,
  z: number,
  obstacles: readonly GroupObstacle[],
): { kind: GroupObstacleKind; gap: number } | null {
  let worst: { kind: GroupObstacleKind; gap: number } | null = null;
  for (const obstacle of obstacles) {
    let gap: number;
    if (obstacle.shape === 'circle') {
      gap = Math.hypot(x - obstacle.x, z - obstacle.z) - obstacle.radius;
    } else {
      // Into the box's own frame. A yaw of h maps local +X onto the rider's
      // left and local +Z onto the heading (`level/segments.ts`), so the
      // world→local map is that rotation's TRANSPOSE — the same two lines
      // `planSampler.ts` and `routeValidator.ts` already write, with cos/sin
      // of +rotationY. Rotating the offset by -rotationY instead builds the
      // box's MIRROR, which agrees with the sampler only for a square box or
      // a yaw that is a multiple of π/2: at π/4 on a 4 × 1 m solid the two
      // verdicts are exactly inverted, and `plan.softBodies` are never read
      // by the sampler at all, so for a shrub this is the only containment
      // test there is. Both claims are asserted in `groupSpawn.test.ts`.
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const cos = Math.cos(obstacle.rotationY);
      const sin = Math.sin(obstacle.rotationY);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      const outX = Math.abs(localX) - obstacle.halfExtentX;
      const outZ = Math.abs(localZ) - obstacle.halfExtentZ;
      gap = outX > 0 || outZ > 0
        ? Math.hypot(Math.max(0, outX), Math.max(0, outZ))
        : Math.max(outX, outZ);
    }
    if (gap < GROUP_OBSTACLE_CLEARANCE_METRES && (worst === null || gap < worst.gap)) {
      worst = { kind: obstacle.kind, gap };
    }
  }
  return worst;
}
