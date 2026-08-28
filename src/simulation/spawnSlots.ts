/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { TERRAIN } from '../data/tuning.ts';
import type { Spawn } from './EucController.ts';
import { createGroundSample } from './world.ts';
import type { GroundSample, TerrainSampler } from './world.ts';

/**
 * Where the *second* rider starts — M25 Phase 2 (docs/PLANS.md §25.5).
 *
 * A `LevelPlan` states one spawn, because until now one rider used it. Two
 * riders need two places to stand, and the §25.9 review turned the first
 * draft's phrase — "beside seat 0 inside the corridor" — into a contract: a
 * slot is **derived from the plan's own start pose and then checked against
 * the same sampler the controller rides on**, so a producer nobody thought
 * about cannot quietly put the second rider inside a wall.
 *
 * **No `LevelPlan` format change**, deliberately. A per-seat spawn array on
 * the plan would make every one of the four producers state something they
 * have no opinion about, would move both pinned plan digests, and would have
 * to be authored again the first time a fifth producer arrived. The spawn a
 * world already states plus the ground it already has is enough.
 *
 * The rule the whole file follows: **a slot is a candidate until the ground
 * agrees.** Nothing here trusts arithmetic — every candidate is sampled, and
 * a candidate that reads as a step, a hole, or ground off the authored
 * heightfield is refused in favour of the next one.
 */

/**
 * How far to the side of the rider ahead of it a slot sits, metres.
 *
 * Two riders on one road, close enough to read as "together" and far enough
 * apart that neither is drawn inside the other. It is bounded above by the
 * narrowest corridor any producer offers at a spawn — the generator's trail
 * beat is 4.6 m of half-width and BelVar's asphalt is 5 m — so 1.6 m leaves
 * either rider well inside the road even on the tightest of them, and the
 * validation below is what proves it rather than this comment.
 *
 * **The default, and since 2026-08-28 not the only one.** Two people setting
 * off together want to be together; two people about to hit each other with
 * sticks want to be out of range until somebody rides. `DUEL_LATERAL_METRES`
 * is the second answer and `spawnSlot`'s `lateral` argument is how a caller
 * says which question it is asking.
 */
export const SLOT_LATERAL_METRES = 1.6;

/**
 * How far apart a **match** stands two riders, metres — the owner's 2026-08-28
 * couch ride.
 *
 * **The one thing wrong with a couch Knockabout's first second was arithmetic
 * nobody had done.** The paddle is in the right hand, seat 1 spawns on seat 0's
 * right, and a parked swing reaches 2.15 m sideways
 * (`Paddle.reachAgainst(CHASE.riderHitRadius)`, measured) — so at
 * `SLOT_LATERAL_METRES` the host began every match already holding the guest
 * inside their arc, while the guest's own forehand swept the empty road on
 * *their* right. The owner's words: *"player 1 can spawn smack player 2 …
 * P2 smacks the air as there's no one to the right of P2. This is unfair."*
 *
 * Three metres is that reach plus the better part of a rider's width of
 * daylight, and it is bounded above by the narrowest corridor any producer
 * offers at a spawn — the generator's trail beat is 4.6 m of half-width and
 * BelVar's asphalt is 5 m — so both riders are still well inside the road. The
 * validation below is what proves that rather than this comment, and
 * `spawnSlots.test.ts` is what proves the clearance: a spacing that stopped
 * clearing the weapon would fail a test rather than ship.
 *
 * **It buys a fair *start*, not a fair fight.** Whoever is on the other's left
 * is in position first, at every distance, because that is what a right-handed
 * forehand is; what this removes is the free hit nobody had to ride for.
 *
 * The *stagger* fallbacks below clear the same reach without being widened,
 * which is worth knowing rather than assuming: 3.2 m straight back is outside
 * 2.15 m in both directions, so every candidate a duel can land on is one
 * neither rider can open on.
 */
export const DUEL_LATERAL_METRES = 3.0;

/**
 * How far *behind* a staggered fallback slot sits, metres.
 *
 * Twice the lateral offset, on the same argument `placeCopBehindRider` makes
 * about a gap: back along the start heading is the one direction that is
 * defined at every spawn on every producer, and it is where a slot goes when
 * the road beside the leading rider is not road.
 */
export const SLOT_STAGGER_METRES = 3.2;

/**
 * Half-width of the footprint each candidate is sampled over, metres.
 *
 * A single point is not a place to stand. This checks the four points a wheel
 * and its pedals actually cover, which is what catches a slot whose centre is
 * on the road and whose edge is over a kerb.
 */
export const SLOT_FOOTPRINT_METRES = 0.4;

/**
 * How far a slot's ground may differ from the leading rider's before it is
 * refused, metres.
 *
 * **`TERRAIN.curbThreshold`, not a number chosen here.** That constant is
 * already the game's answer to "is this a step or a slope" — the rise under
 * the contact patch that stops being ground the wheel rolls over. A candidate
 * whose ground differs from the spawn's by more than that is standing on
 * something, and "something" at a spawn is a kerb, a wall top, or a ditch.
 * Measured against every shipped producer and a 120-seed generated sweep, the
 * worst real difference across a slot's whole footprint is 0.0033 m, so this
 * carries an order of magnitude of headroom without being arbitrary.
 */
export const SLOT_STEP_TOLERANCE_METRES = TERRAIN.curbThreshold;

/**
 * The closest two riders may be placed, metres.
 *
 * A rider's shoulders are about half a metre across, so a metre between two
 * contact patches is daylight rather than an overlap. **Nothing in this file
 * enforces it** — the fallback of last resort is the plan's own spawn, and a
 * game that refused to seat a second rider would be worse than one that seats
 * them merged. It is here so the colocated test can say the thing that
 * matters: *no world this game ships needs that fallback.*
 */
export const SLOT_MIN_SEPARATION_METRES = 1;

/** One candidate, in the start pose's own frame: sideways, then backwards. */
interface Candidate {
  readonly lateral: number;
  readonly back: number;
}

/**
 * Derive seat `index`'s spawn from the world's own start pose.
 *
 * Index 0 is the plan's spawn, unchanged and un-sampled — seat 0 starts where
 * every rider has always started, and this function must not move it.
 *
 * Every other index gets the first candidate the ground accepts, in two
 * passes over the same ordered list:
 *
 *   1. **Strict** — the slot must be on the same surface the leading rider
 *      stands on. A second rider who starts on the grass beside the road when
 *      there is road available is not "beside" them in any sense a player
 *      would recognise.
 *   2. **Lenient** — any on-course ground within a step of the spawn's. A
 *      narrow beat, or an authored plaza that changes material a metre from
 *      its centre, should cost the pair a paint colour and not a placement.
 *
 * Both passes apply the same physical test, so the lenient pass relaxes what
 * the slot *looks* like and never whether it is somewhere a rider can stand.
 *
 * **Heading is copied, never derived.** Both riders face the way the world
 * says to set off, which is the whole reason a plan states a heading at all;
 * fanning them apart would make one of them start pointing at the verge. That
 * survived the 2026-08-28 duel-spacing fix on purpose: turning the guest round
 * to face the host would be symmetric and would also start one of them riding
 * away from the route, on a generated world whose spawn has the surround
 * behind it.
 *
 * **`lateral` is how far out the first rank of slots sits**, and the only
 * thing a caller may move. Everything else — the order, the ground test, the
 * stagger, the fallback — is the same for a duel as for a free ride, because
 * what changes between them is how far apart two riders should be and not what
 * counts as somewhere to stand.
 *
 * Allocates two ground samples per call. It is called when a world is
 * installed and when a rider is seated, never in the frame loop — the same
 * terms `Game.resetChallengeRider` places a timed run's run-up on.
 */
export function spawnSlot(
  base: Spawn,
  index: number,
  terrain: TerrainSampler,
  lateral: number = SLOT_LATERAL_METRES,
): Spawn {
  if (index <= 0) return base;

  const origin = createGroundSample();
  terrain.sampleGround(base.position.x, base.position.z, origin);

  // The rider's left, as a unit vector in the XZ plane: a positive yaw about
  // +Y turns +Z toward +X, so ninety degrees off the heading is their left.
  // The same convention `level/segments.ts` states for a branch's
  // `lateralOffset`, and the same one `data/tuning.ts` uses for the rider's
  // own frame — restated rather than imported so the runtime simulation layer
  // does not pull the authoring module in for two lines of trigonometry.
  const leftX = Math.cos(base.headingY);
  const leftZ = -Math.sin(base.headingY);
  const forwardX = Math.sin(base.headingY);
  const forwardZ = Math.cos(base.headingY);

  const probe = createGroundSample();
  for (const strict of [true, false]) {
    for (const candidate of candidatesFor(index, lateral)) {
      const x = base.position.x + leftX * candidate.lateral - forwardX * candidate.back;
      const z = base.position.z + leftZ * candidate.lateral - forwardZ * candidate.back;
      if (!slotIsGround(terrain, probe, x, z, origin, strict)) continue;
      terrain.sampleGround(x, z, probe);
      return { position: { x, y: probe.height, z }, headingY: base.headingY };
    }
  }

  // **The plan's own spawn, and only when the world left nothing else.** A
  // throw here would be a boot failure on a world that is otherwise perfectly
  // rideable, and a null would push the same decision onto every caller. Two
  // riders briefly merged is a visual the first metre of riding undoes; see
  // `SLOT_MIN_SEPARATION_METRES` for where that claim is held to account.
  return base;
}

/**
 * The ordered slots for a seat index: beside, then beside and behind, then
 * straight behind.
 *
 * **Odd seats go to the leading rider's right.** Arbitrary as physics and not
 * as an interface: Phase 3 splits the screen left|right with seat 0 on the
 * left, so putting seat 1 on the right of the pair makes the two halves of
 * the screen agree with the two riders' places on the road.
 *
 * Rank is what lets this answer for a third and fourth rider without being
 * rewritten: seats 1 and 2 sit one `spacing` out, seats 3 and 4 sit two.
 * Stage 1 never asks, and a function that quietly returned the same slot to
 * everybody would be a poor thing to discover when it does.
 */
function* candidatesFor(index: number, spacing: number): Generator<Candidate> {
  const rank = Math.ceil(index / 2);
  const preferred = index % 2 === 1 ? -1 : 1;
  const lateral = rank * spacing;
  const back = rank * SLOT_STAGGER_METRES;

  yield { lateral: preferred * lateral, back: 0 };
  yield { lateral: -preferred * lateral, back: 0 };
  yield { lateral: preferred * lateral, back };
  yield { lateral: -preferred * lateral, back };
  yield { lateral: 0, back };
}

/**
 * Is this somewhere a rider can be put down?
 *
 * The centre decides what the slot is *made of*; the footprint decides
 * whether it is *flat*. Both read through the `TerrainSampler` the controller
 * itself rides on, which is what makes this a check rather than a guess —
 * `PlanTerrainSampler.sampleGround` already answers with the top face of any
 * collider standing at the point, so a slot inside a wall reports the wall's
 * height and fails the step test without this function knowing what a wall is.
 */
function slotIsGround(
  terrain: TerrainSampler,
  probe: GroundSample,
  x: number,
  z: number,
  origin: GroundSample,
  strict: boolean,
): boolean {
  terrain.sampleGround(x, z, probe);
  // Off the authored heightfield is the surround — real ground with a real
  // surface, and not a place to start a ride from on any world in this game.
  if (probe.offCourse) return false;
  if (strict && probe.surface !== origin.surface) return false;
  if (Math.abs(probe.height - origin.height) > SLOT_STEP_TOLERANCE_METRES) return false;

  const reach = SLOT_FOOTPRINT_METRES;
  for (const [offsetX, offsetZ] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
    terrain.sampleGround(x + offsetX, z + offsetZ, probe);
    if (probe.offCourse) return false;
    // The surface is deliberately *not* re-tested out here. A spawn sits at
    // the very start of a route, so a footprint sample behind it is already
    // past the first metre of road — true of seat 0's own footprint today,
    // and refusing it would refuse every slot on every generated world.
    if (Math.abs(probe.height - origin.height) > SLOT_STEP_TOLERANCE_METRES) return false;
  }
  return true;
}
