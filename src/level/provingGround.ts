/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from './plan.ts';
import { buildLevelPlan } from './buildPlan.ts';
import type { SegmentSpec } from './segments.ts';

/**
 * The M4 proving ground.
 *
 * **This is not the slice level.** The ten beats of `docs/PLANS.md` §6 are M7's
 * brief, and inventing them early would be taking a decision that was not
 * ours. What M4 needs is authored terrain sufficient to prove slopes, kerbs,
 * surface feel, suspension, and the camera's obstruction pull-in — and shaped
 * as typed segments so M7 reuses the approach rather than replacing it.
 *
 * So it is a **course of nine segments that rides every one of the seven
 * surfaces once**, in an order that lets the owner answer M4's exit question by
 * riding it: *can I feel the difference between pavement and grass with my eyes
 * shut?* Brick plaza to smooth boulevard is a small change; boulevard to grass
 * verge is a large one; grass to gravel changes which way the wheel argues.
 *
 * What each segment exists to prove:
 *
 * | # | Segment | Proves |
 * |---|---|---|
 * | 1 | `pad` | nothing — it is the *reference* the rest is measured against |
 * | 2 | `plaza` | brick, and the gateway the camera pull-in fires against |
 * | 3 | `boulevard` | smooth pavement at top speed, and the 0.15 m kerb |
 * | 4 | `sweep` | grip: the same corner on pavement and across a grass verge |
 * | 5 | `climb` | the slope term, uphill, on rough pavement |
 * | 6 | `crest` | that a gradient reversal is not a crease |
 * | 7 | `descent` | the slope term, downhill, on gravel |
 * | 8 | `trail` | dirt, and a rock that rolls against one that does not |
 * | 9 | `bridge` | wood, and a narrow corridor |
 * | 10 | `return` | pavement again, so the contrast is a memory not a guess |
 *
 * **The pad is not filler, and deleting it would cost more than it saves.**
 * `docs/PLANS.md` §2.5 makes the hand-authored level the *measuring instrument*
 * for the entire movement phase: M2's accel curve, top speed, braking distance
 * and lateral limit, and M3's arm, field of view, look-ahead and bank were all
 * settled on an endless flat plane, and every one of those numbers is
 * surface-dependent now that surfaces exist. A course made only of corridors
 * has nowhere to reach top speed in a straight line or to hold a full-lock
 * carve, so the evidence for two closed milestones would quietly start
 * measuring grass. The pad is 180 m of flat pavement, 80 m wide — sized from
 * those two manoeuvres and no larger — and it is where the M2 and M3 browser
 * specs ride. It also happens to be the best place to answer M4's own
 * question, because open pavement and open grass meet along its edge.
 *
 * Several of these are deliberate near-relatives of slice beats — the plaza,
 * the kerb run, the grass shoulders, the gravel spur, the trailhead — so the
 * shapes that survive M4 are shapes M7 can start from. None of them *is* a
 * slice beat, and none of the slice's route structure (the fork, the shortcut,
 * the checkpoints, the off-route pockets) is here.
 */

/**
 * The gateway: half its opening, half the span either side of it, half its
 * depth along the route, and its height.
 *
 * These are the load-bearing numbers in this file, and the depth is the one
 * that took a measurement to get right. The gate exists to give M3's
 * obstruction pull-in its first real geometry — the mechanism was built with a
 * test double and a scripted probe because the flat plane had nothing above the
 * ground to hide behind.
 *
 * **A thin wall with a gap in it does not occlude a chase camera, and the
 * reason is worth writing down.** The camera trails along the rider's *lagged*
 * heading, which means it follows them through the same gap they went through;
 * and on a turn it swings to the *outside* of the turn, away from whatever the
 * rider is turning towards. So a rider who passes a doorway and carves keeps a
 * clear line to their own camera the whole time. Giving the opening depth fixes
 * it outright: inside a five-metre passage, any yaw lag at all puts a side wall
 * between the rider and a camera still in the passage behind them.
 *
 * The height is set against the arm rather than by eye. The probe runs from the
 * rider's hip (1.27 m) to the camera (1.95 m), so anything below about 1.3 m
 * can never intercept it — which is why the fountain wall and the crest parapet
 * are furniture and this is not.
 */
const GATE_HALF_GAP = 1.6;
const GATE_HALF_SPAN = 7.2;
const GATE_HALF_DEPTH = 2.5;
const GATE_HEIGHT = 2.0;

const SPECS: readonly SegmentSpec[] = [
  {
    // The reference surface. Its dimensions come from the two manoeuvres the
    // M2 and M3 evidence depends on: thirteen seconds of full throttle covers
    // 155 m, and a full-lock carve at the wheel's top speed has a 27 m radius,
    // so it swings 29 m off the line before it has turned ninety degrees.
    id: 'pad',
    length: 180,
    halfWidth: 40,
    surface: 'pavement',
    shoulder: 8,
  },
  {
    id: 'plaza',
    length: 44,
    halfWidth: 15,
    surface: 'brick',
    shoulder: 8,
    blocks: [
      // Bollards. Two pairs, leaving a seven-metre central lane: a slalom for
      // anyone who wants one, and a corridor for anyone who does not.
      ...[-6, -3.5, 3.5, 6].map((t) => ({
        s: 14,
        t,
        halfAlong: 0.09,
        halfLateral: 0.09,
        height: 0.9,
        surface: 'brick' as const,
        appearance: 'metal' as const,
      })),
      // The low fountain wall, off to one side. Solid, tall enough to hide
      // behind, and far enough off the lane to be a choice rather than an
      // obstacle.
      {
        s: 26,
        t: 9,
        halfAlong: 4.5,
        halfLateral: 1.1,
        height: 0.85,
        surface: 'brick',
        appearance: 'stone',
      },
      // The gateway: a wall across the plaza with a passage through it.
      {
        s: 38,
        t: GATE_HALF_GAP + GATE_HALF_SPAN,
        halfAlong: GATE_HALF_DEPTH,
        halfLateral: GATE_HALF_SPAN,
        height: GATE_HEIGHT,
        surface: 'brick',
        appearance: 'stone',
      },
      {
        s: 38,
        t: -(GATE_HALF_GAP + GATE_HALF_SPAN),
        halfAlong: GATE_HALF_DEPTH,
        halfLateral: GATE_HALF_SPAN,
        height: GATE_HEIGHT,
        surface: 'brick',
        appearance: 'stone',
      },
    ],
  },
  {
    id: 'boulevard',
    length: 86,
    halfWidth: 9,
    surface: 'pavement',
    shoulder: 7,
    blocks: [
      // The kerb run. A 0.15 m sidewalk down the rider's right for seventy
      // metres, which is `docs/PLANS.md` §6 beat 3 in its M4 form: rolling on
      // to it unhopped costs speed, and hopping it is M5's business.
      {
        s: 43,
        t: -7,
        halfAlong: 35,
        halfLateral: 2,
        height: 0.15,
        surface: 'pavement',
        appearance: 'concrete',
      },
    ],
  },
  {
    id: 'sweep',
    // A ninety-degree left at a forty-metre radius. At the controller's 0.75 g
    // lateral limit that corner is flat out at about 17 m/s, which is above the
    // wheel's top speed — so it is a corner the player takes at full speed on
    // pavement and cannot take at full speed across the grass on its inside.
    length: 63,
    curvature: 1 / 40,
    halfWidth: 9,
    surface: 'pavement',
    shoulder: 7,
    bands: [
      // Inside the turn, so cutting the corner is shorter and looser at once.
      { from: 4.5, to: 9, surface: 'grass' },
      { from: -9, to: -5.5, surface: 'grass' },
    ],
  },
  {
    id: 'climb',
    length: 54,
    climb: 7,
    halfWidth: 8,
    surface: 'roughPavement',
    shoulder: 7,
  },
  {
    id: 'crest',
    length: 22,
    halfWidth: 8,
    surface: 'roughPavement',
    shoulder: 7,
    blocks: [
      {
        s: 11,
        t: 7.4,
        halfAlong: 9,
        halfLateral: 0.5,
        height: 1.0,
        surface: 'roughPavement',
        appearance: 'stone',
      },
    ],
  },
  {
    id: 'descent',
    length: 50,
    climb: -7,
    halfWidth: 8,
    surface: 'gravel',
    shoulder: 7,
  },
  {
    id: 'trail',
    length: 50,
    curvature: -1 / 50,
    halfWidth: 5.5,
    surface: 'dirt',
    shoulder: 6,
    blocks: [
      // Two rocks either side of the step-up ceiling, which is derived from the
      // wheel's own pedal height (`TERRAIN.stepUpPedalFactor`). One rolls over
      // for a speed cost; the other does not, and has to be ridden around.
      {
        s: 18,
        t: -1.8,
        halfAlong: 0.7,
        halfLateral: 0.7,
        height: 0.3,
        surface: 'dirt',
        appearance: 'stone',
      },
      {
        s: 32,
        t: 2.2,
        halfAlong: 0.6,
        halfLateral: 0.6,
        height: 0.18,
        surface: 'dirt',
        appearance: 'stone',
      },
    ],
  },
  {
    id: 'bridge',
    length: 16,
    halfWidth: 3.5,
    surface: 'wood',
    shoulder: 4,
    blocks: [
      ...[-3.4, 3.4].map((t) => ({
        s: 8,
        t,
        halfAlong: 8,
        halfLateral: 0.12,
        height: 0.9,
        surface: 'wood' as const,
        appearance: 'wood' as const,
      })),
    ],
  },
  {
    id: 'return',
    length: 40,
    halfWidth: 8,
    surface: 'pavement',
    shoulder: 7,
  },
];

/**
 * Build the proving ground.
 *
 * Called once at construction. The plan is immutable afterwards, which is what
 * lets the sampler flatten the collider list once instead of walking the
 * segment tree inside the 120 Hz step.
 */
export function createProvingGround(
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
): LevelPlan {
  return buildLevelPlan(SPECS, {
    id: 'm4-proving-ground',
    // On the pad, facing down it. A rider gets open pavement to find the wheel
    // on before the course asks anything of them, which is what the vision
    // means by teaching through terrain rather than through a tutorial.
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    // Grass, at the plaza's own height. Riding off the course is not falling
    // off the world: it is riding onto a field, which is both the honest
    // answer to "what is out there" and the go-anywhere fantasy the vision
    // LOCKS. It also means M4's exit question can be asked without riding the
    // course at all — leave the boulevard sideways and the wheel tells you.
    surround: { height: 0, surface: 'grass' },
    // M13 Phase 2's diagnostic — see `createSliceLevel`. The measuring
    // instrument stays an instrument unless somebody explicitly asks it to
    // carry hazards, so every M2–M6 spec still rides the course it was
    // written against.
    ...(hazardProbeMetres === undefined ? {} : { hazardProbeMetres }),
    ...(targetProbeMetres === undefined ? {} : { targetProbeMetres }),
  });
}

/** The authored specs, for tests and for M7 to start from. */
export const PROVING_GROUND_SPECS = SPECS;
