/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { machineForCharacter } from '../data/machines.ts';
import { RENDER, RIDER, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { createPose, type EucPose } from '../simulation/EucController.ts';
import {
  RD_CHEST, RD_FOOT_L, RD_FOOT_R, RD_HAND_L, RD_HAND_R, RD_HEAD, RD_HIP_L, RD_HIP_R, RD_PELVIS,
  RD_SHOULDER_L, RD_SHOULDER_R,
} from '../simulation/ragdoll.ts';
import { createCopRider, createCopRidingRig, type CopRider } from '../render/copRider.ts';
import { machineLook } from '../render/machineLook.ts';
import { DRUNKARD_LOOK, RIDER_LOOKS, type RiderLook } from '../render/riderLook.ts';
import { createRidingRig, type RidingRig } from '../render/ridingRig.ts';
import { PausedViewGate, type PausedViewFrame } from './pausedView.ts';

/**
 * The held paused view against the riding rig — performance pass 2026-10-17,
 * review repair (2026-10-18).
 *
 * The review found that a Knockabout pause (and a couch-chase pause of the
 * cop seat) takes the paddle out of the hand, and the rig puts the carry down
 * by 1/12 per `apply` call — render calls, not the simulation clock. Holding
 * after the three settle frames froze the right grip 48 mm and 19° short of
 * where every baseline paused frame went on to put it. The repair is
 * `RidingRig.settling` and `Game.anyRigSettling`: a frame stays non-holdable
 * while any shown rig would still move on a repeat call.
 *
 * Two properties are proven here with the real rigs and the real gate:
 *
 *  1. **The rig's contract.** Over a corpus of poses, swings and looks, an
 *     `apply` that leaves `settling` false is followed, with the same inputs,
 *     by a bit-identical scene graph. This is the census for call-counted
 *     channels: a new one that forgets to report fails here.
 *  2. **The held picture is the baseline's picture.** `Game.render`'s order —
 *     every seat posed (`renderSeat`), the pack posed, then the gate asked —
 *     driven frame by frame through a Knockabout pause at every speed band,
 *     couch Knockabout, a couch-chase cop seat, a mid-air free-ride pause and a
 *     chase pause with the pack. The picture on screen (the last submitted
 *     frame's scene graph) must equal the scene graph the baseline would draw
 *     on every frame (it draws every frame), and a later no-op invalidation
 *     (a tab return) must not move anything. Negative controls: the predicate
 *     without the rig term reproduces the review's 48 mm, and one that asks
 *     seat 0 alone misses the couch-chase cop seat.
 */

/** Every node's world matrix and visibility, in traversal order. */
function picture(groups: readonly THREE.Object3D[]): Float64Array {
  const values: number[] = [];
  for (const group of groups) {
    group.updateMatrixWorld(true);
    group.traverse((node) => {
      for (const value of node.matrixWorld.elements) values.push(value);
      values.push(node.visible ? 1 : 0);
    });
  }
  return Float64Array.from(values);
}

/** Bit-exact equality (Object.is: -0 and NaN are their own values). */
function samePicture(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
}

const head = new THREE.Vector3(-1, 1.3, 0.3);

/** The ragdoll test's standing particle set (`render/ragdollRepair.test.ts`). */
function ragStanding(pose: EucPose): EucPose {
  const h = RIDER.hipHeight, spine = RIDER_BLOCKOUT.torsoLength, hh = RIDER_BLOCKOUT.torsoWidth * 0.26;
  const sh = RIDER_BLOCKOUT.shoulderHalfWidth;
  const points: readonly (readonly [number, readonly [number, number, number]])[] = [
    [RD_PELVIS, [0, h, 0]], [RD_CHEST, [0, h + spine, 0]], [RD_HEAD, [0, h + spine + 0.22, 0]],
    [RD_HIP_L, [hh, h, 0]], [RD_HIP_R, [-hh, h, 0]], [RD_SHOULDER_L, [sh, h + spine, 0]],
    [RD_SHOULDER_R, [-sh, h + spine, 0]], [RD_HAND_L, [sh + 0.1, h + 0.2, 0.1]],
    [RD_HAND_R, [-sh - 0.1, h + 0.2, 0.1]], [RD_FOOT_L, [0.185, 0.16, 0.05]], [RD_FOOT_R, [-0.185, 0.16, 0.05]],
  ];
  for (const [index, value] of points) pose.ragdoll.set(value, index * 3);
  return pose;
}

/**
 * A pose at riding frame `frame` of a named situation. Every situation moves
 * between frames (as an interpolated ride does), so the pause's first frame
 * differs from the last riding one, exactly as in the game.
 */
function situation(name: string, frame: number): EucPose {
  const pose = createPose();
  pose.x = frame * 0.05;
  pose.z = frame * 0.11;
  pose.headingY = 0.3 + frame * 0.002;
  switch (name) {
    case 'stopped':
      pose.restFactor = 1;
      break;
    case 'slow':
      pose.speed = 2 + frame * 0.01;
      pose.rollAngle = 0.05;
      break;
    case 'carving':
      pose.speed = 12;
      pose.rollAngle = 0.28 - frame * 0.002;
      pose.riderRoll = 0.31;
      pose.crouch = 0.3;
      pose.carveStance = 0.6;
      pose.wheelSpin = frame * 0.4;
      break;
    case 'falling':
      pose.speed = 9;
      pose.airBlend = 1;
      pose.airHeight = Math.max(0.05, 0.9 - frame * 0.04);
      pose.y = pose.airHeight;
      break;
    case 'wobble':
      pose.speed = 14;
      pose.wobble = 0.7;
      pose.wobbleYaw = 0.04 * Math.sin(frame);
      pose.wobbleRoll = 0.05 * Math.cos(frame);
      pose.wobbleSway = Math.sin(frame * 0.7);
      pose.wobbleFight = 0.5;
      break;
    case 'reverse':
      pose.speed = -3;
      pose.reverseBlend = 1;
      pose.riderLookYaw = 0.6;
      break;
    case 'crash':
      ragStanding(pose);
      pose.crashBlend = 1;
      pose.ragdollBlend = Math.min(1, 0.4 + frame * 0.05);
      break;
    default:
      throw new Error(`unknown situation ${name}`);
  }
  return pose;
}

const SITUATIONS = ['stopped', 'slow', 'carving', 'falling', 'wobble', 'reverse', 'crash'] as const;

interface ContractRun {
  /** Repeat calls compared (each followed a call that said it had settled). */
  readonly checked: number;
  /** Calls that said "settling". */
  readonly settlingSeen: number;
  /** Repeat calls that moved the rig after a call that said it had settled. */
  readonly moved: readonly string[];
  /** Cases whose settling flags broke the put-down's shape or never settled. */
  readonly shape: readonly string[];
}

/**
 * Drive the corpus and report every broken promise. `settlingOf` reads the
 * flag: the rig's own getter, or a deliberately deaf one for the controls.
 */
function contract(settlingOf: (rig: RidingRig) => boolean, situations: readonly string[] = SITUATIONS): ContractRun {
  // Swing modes across the pause: Knockabout (carried, then put down), the
  // target probe (carried throughout), free ride (never carried).
  const swings = [['carry', 'drop'], ['carry', 'carry'], ['none', 'none']] as const;
  const looks: readonly { readonly name: string; readonly build: () => RidingRig }[] = [
    { name: 'cool rider', build: () => createRidingRig() },
    { name: 'drunkard', build: () => createRidingRig(DRUNKARD_LOOK, machineLook(machineForCharacter(DRUNKARD_LOOK.id))) },
    { name: 'seated cop', build: () => createCopRidingRig() },
  ];
  let checked = 0;
  let settlingSeen = 0;
  const moved: string[] = [];
  const shape: string[] = [];
  for (const look of looks) {
    for (const name of situations) {
      for (const [riding, paused] of swings) {
        const rig = look.build();
        const label = `${look.name}/${name}/${riding}->${paused}`;
        try {
          rig.setTrickPose(name === 'falling' ? 0.6 : 0, 1);
          for (let frame = 0; frame < 8; frame += 1) {
            rig.applySwing(riding === 'carry' ? head : null, 0.2, 0.5);
            rig.apply(situation(name, frame));
          }
          // The pause: one more pose (the transition frame), then frozen.
          const frozen = situation(name, 8);
          let previous: Float64Array | null = null;
          let previousSettling = true;
          let settledBy = -1;
          for (let call = 0; call < 20; call += 1) {
            rig.applySwing(paused === 'carry' ? head : null, 0.2, 0.5);
            rig.apply(frozen);
            const now = picture([rig.group]);
            const settling = settlingOf(rig);
            if (previous !== null && !previousSettling) {
              checked += 1;
              if (!samePicture(previous, now)) moved.push(`${label}: call ${call}`);
            }
            if (settling) settlingSeen += 1;
            else if (settledBy < 0) settledBy = call;
            previous = now;
            previousSettling = settling;
          }
          if (settledBy < 0 || settledBy > 11 || settlingOf(rig)) shape.push(`${label}: settled by ${settledBy}`);
          // The put-down itself: settling for exactly the eleven calls whose carry is still above zero.
          if (riding === 'carry' && paused === 'drop' && settledBy !== 11) shape.push(`${label}: put down in ${settledBy}`);
        } finally {
          rig.dispose();
        }
      }
    }
  }
  return { checked, settlingSeen, moved, shape };
}

test('a rig that says it is not settling does not move on a repeat call with the same inputs', () => {
  const run = contract((rig) => rig.settling);
  assert.deepEqual(run.moved, [], 'a call-counted channel moved the rig after it said it had settled');
  assert.deepEqual(run.shape, []);
  assert.ok(run.checked >= 900, `only ${run.checked} repeat calls were compared`);
  assert.ok(run.settlingSeen > 100, 'the corpus never exercised a settling rig');
});

test('negative control: a deaf settling flag is caught — on the put-down, and on the falling flag alone', () => {
  const deaf = contract(() => false);
  assert.ok(deaf.moved.some((entry) => entry.includes('->drop')), 'a flag blind to the carry went undetected');
  // Free ride, never carrying: only the falling flag can move a repeat call.
  const falling = contract(() => false, ['falling']);
  assert.ok(falling.moved.some((entry) => entry.includes('none->none')), 'a flag blind to falling went undetected');
  // And the real flag passes that same narrow corpus.
  assert.deepEqual(contract((rig) => rig.settling, ['falling']).moved, []);
});

test('every playable look reports the paddle put-down the same way', () => {
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
    try {
      const pose = createPose();
      rig.applySwing(head, 0, 0);
      rig.apply(pose);
      assert.equal(rig.settling, false, `${look.id}: a carried paddle is not settling`);
      const flags: boolean[] = [];
      for (let call = 0; call < 14; call += 1) {
        rig.applySwing(null, 0, 0);
        rig.apply(pose);
        flags.push(rig.settling);
      }
      assert.deepEqual(flags, [...Array<boolean>(11).fill(true), false, false, false], look.id);
    } finally {
      rig.dispose();
    }
  }
});

// --- Game.render's order, with the real gate ---------------------------------

interface Seat {
  readonly rig: RidingRig;
  /** Does this seat carry a paddle while riding (Knockabout; the couch-chase cop seat)? */
  readonly armed: boolean;
  readonly situation: string;
}

interface Scenario {
  readonly name: string;
  readonly seats: readonly Seat[];
  readonly pack: readonly { readonly rider: CopRider; readonly situation: string }[];
  /** Pose speed override for every seat (the review's sweep), m/s. */
  readonly speed?: number;
}

type Predicate = 'repaired' | 'withoutRigTerm' | 'seatZeroOnly';

interface Outcome {
  readonly worstGap: number;
  readonly worstGripMm: number;
  readonly held: number;
  readonly pausedDrawn: number;
  readonly firstHeld: number;
}

function seatPose(scenario: Scenario, seat: Seat, index: number, frame: number): EucPose {
  const pose = situation(seat.situation, frame);
  pose.x += index * 2.2;
  if (scenario.speed !== undefined) pose.speed = scenario.speed;
  return pose;
}

/**
 * Drive a scenario as `Game.render` does: 40 riding frames, then a pause of
 * 60 frames with a no-op invalidation at paused frame 40 (a tab return). The
 * baseline draws every frame, so its screen is the scene graph of the current
 * frame; the candidate's screen is the scene graph of its last submitted
 * frame. Returns the worst gap between them across the pause.
 */
function drive(scenario: Scenario, predicate: Predicate, settleFrames: number = RENDER.pausedViewSettleFrames): Outcome {
  const gate = new PausedViewGate(settleFrames);
  const frame: PausedViewFrame = { holdable: false, bufferWidth: 1280, bufferHeight: 720, pixelRatio: 1, views: scenario.seats.length, seats: scenario.seats.length };
  const groups = [...scenario.seats.map((seat) => seat.rig.group), ...scenario.pack.map((cop) => cop.rider.group)];
  let screen: Float64Array | null = null;
  let screenGrips: THREE.Vector3[] = [];
  let worstGap = 0;
  let worstGripMm = 0;
  let held = 0;
  let pausedDrawn = 0;
  let firstHeld = -1;
  const RIDING = 40;
  for (let f = 0; f < RIDING + 60; f += 1) {
    const paused = f >= RIDING;
    // The pause freezes the poses one frame in (the transition frame moved).
    const poseFrame = paused ? RIDING : f;
    if (paused && f === RIDING + 40) gate.invalidate('visible');
    // renderSeat, every seat, held or drawn.
    scenario.seats.forEach((seat, index) => {
      // paddleEquippedFor(index): false once the state is 'paused'.
      seat.rig.applySwing(seat.armed && !paused ? head : null, 0.1, 0.4);
      seat.rig.apply(seatPose(scenario, seat, index, poseFrame));
    });
    // The pack: posed every frame with a head that is never null.
    for (const cop of scenario.pack) {
      cop.rider.applySwing(head, 0.1, 0.4);
      cop.rider.apply(situation(cop.situation, poseFrame));
    }
    const seatSettling = predicate === 'seatZeroOnly'
      ? scenario.seats[0].rig.settling
      : scenario.seats.some((seat) => seat.rig.settling);
    const packSettling = predicate === 'repaired' && scenario.pack.some((cop) => cop.rider.visible && cop.rider.settling);
    frame.holdable = paused && (predicate === 'withoutRigTerm' || (!seatSettling && !packSettling));
    const now = picture(groups);
    const grips = scenario.seats.map((seat) => seat.rig.rider.grip.getWorldPosition(new THREE.Vector3()));
    if (gate.admit(frame)) {
      screen = now;
      screenGrips = grips;
      if (paused) pausedDrawn += 1;
    } else {
      held += 1;
      if (firstHeld < 0) firstHeld = f - RIDING;
    }
    if (!paused || screen === null) continue;
    // The baseline's screen is `now`.
    if (!samePicture(screen, now)) {
      let gap = 0;
      for (let i = 0; i < now.length; i += 1) gap = Math.max(gap, Math.abs(now[i] - screen[i]));
      worstGap = Math.max(worstGap, gap);
      for (let i = 0; i < grips.length; i += 1) worstGripMm = Math.max(worstGripMm, grips[i].distanceTo(screenGrips[i]) * 1000);
      if (gap === 0) worstGap = Math.max(worstGap, Number.MIN_VALUE); // a -0/NaN-only difference still counts
    }
  }
  return { worstGap, worstGripMm, held, pausedDrawn, firstHeld };
}

function build(name: string, seats: readonly { look?: RiderLook; cop?: boolean; armed: boolean; situation: string }[],
  pack: readonly string[] = [], speed?: number): Scenario {
  return {
    name,
    speed,
    seats: seats.map((seat) => ({
      rig: seat.cop === true ? createCopRidingRig()
        : seat.look !== undefined ? createRidingRig(seat.look, machineLook(machineForCharacter(seat.look.id))) : createRidingRig(),
      armed: seat.armed,
      situation: seat.situation,
    })),
    pack: pack.map((situationName, index) => {
      const rider = createCopRider({ index });
      rider.setVisible(true);
      return { rider, situation: situationName };
    }),
  };
}

function dispose(scenario: Scenario): void {
  for (const seat of scenario.seats) seat.rig.dispose();
  for (const cop of scenario.pack) cop.rider.dispose();
}

function scenarios(): Scenario[] {
  const list: Scenario[] = [];
  for (const speed of [0, 2, 4, 8, 12, 16]) {
    list.push(build(`solo Knockabout pause at ${speed} m/s`, [{ armed: true, situation: 'slow' }], [], speed));
  }
  list.push(build('solo Knockabout pause, stopped', [{ armed: true, situation: 'stopped' }]));
  list.push(build('couch Knockabout pause, four seats', [
    { armed: true, situation: 'stopped' }, { look: RIDER_LOOKS[1], armed: true, situation: 'slow' },
    { look: DRUNKARD_LOOK, armed: true, situation: 'stopped' }, { look: RIDER_LOOKS[2], armed: true, situation: 'carving' },
  ]));
  list.push(build('couch-chase pause of the cop seat (seat 1)', [
    { armed: false, situation: 'slow' }, { cop: true, armed: true, situation: 'stopped' }, { armed: false, situation: 'carving' },
  ]));
  list.push(build('free-ride pause in the air, falling', [{ armed: false, situation: 'falling' }]));
  list.push(build('chase pause with the pack, one trim falling', [{ armed: false, situation: 'carving' }],
    ['falling', 'slow', 'stopped']));
  return list;
}

test('the held paused picture is the baseline picture: Knockabout, couch, cop seat, mid-air and the pack', (t) => {
  for (const scenario of scenarios()) {
    try {
      // Fresh rigs per predicate: the rig's call history is part of the state.
      const repaired = drive(scenario, 'repaired');
      assert.equal(repaired.worstGap, 0,
        `${scenario.name}: the held picture is ${repaired.worstGripMm.toFixed(2)} mm off the baseline's`);
      assert.ok(repaired.held > 20, `${scenario.name}: the pause never held (${repaired.held}) — this proves nothing`);
      t.diagnostic(`${scenario.name}: ${repaired.pausedDrawn} paused frames drawn, first hold at paused frame ${repaired.firstHeld}`);
    } finally {
      dispose(scenario);
    }
  }
  // Knockabout from a stop: eleven settling frames, then the three settle frames.
  const solo = build('solo', [{ armed: true, situation: 'stopped' }]);
  try {
    const outcome = drive(solo, 'repaired');
    assert.equal(outcome.firstHeld, 11 + RENDER.pausedViewSettleFrames);
    // 14 at the pause, and the settle window again after the tab return.
    assert.equal(outcome.pausedDrawn, 11 + 2 * RENDER.pausedViewSettleFrames);
  } finally {
    dispose(solo);
  }
});

test('the rig term alone makes the rigs exact: it holds for a gate with a single settle frame too', () => {
  // The settle count covers the transition frame and the world's one-frame
  // lags; the rigs no longer lean on it. A one-frame gate is exact for them.
  for (const scenario of scenarios()) {
    try {
      const outcome = drive(scenario, 'repaired', 1);
      assert.equal(outcome.worstGap, 0, `${scenario.name}: a one-frame gate held ${outcome.worstGripMm.toFixed(2)} mm off`);
    } finally {
      dispose(scenario);
    }
  }
});

test('negative control: without the rig term the review\'s 48 mm comes back; seat 0 alone misses the cop seat', () => {
  const stopped = build('solo stopped', [{ armed: true, situation: 'stopped' }]);
  try {
    const broken = drive(stopped, 'withoutRigTerm');
    assert.ok(broken.worstGripMm > 45 && broken.worstGripMm < 52,
      `the unrepaired predicate should reproduce the review's 48.49 mm, got ${broken.worstGripMm.toFixed(2)} mm`);
  } finally {
    dispose(stopped);
  }
  const fast = build('solo 16 m/s', [{ armed: true, situation: 'slow' }], [], 16);
  try {
    // The review's sweep: no gap at 16 m/s, where the arm is in its balance carriage.
    assert.equal(drive(fast, 'withoutRigTerm').worstGap, 0);
  } finally {
    dispose(fast);
  }
  const copSeat = build('cop seat', [
    { armed: false, situation: 'slow' }, { cop: true, armed: true, situation: 'stopped' },
  ]);
  try {
    assert.ok(drive(copSeat, 'seatZeroOnly').worstGripMm > 10, 'a predicate asking seat 0 alone went undetected');
  } finally {
    dispose(copSeat);
  }
});
