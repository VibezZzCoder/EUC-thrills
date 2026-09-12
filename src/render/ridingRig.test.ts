/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import { createCopRider } from './copRider.ts';
import { createGhostRider } from './ghostRider.ts';
import { createRidingRig } from './ridingRig.ts';

/**
 * The one-foot air channel — M36, `docs/PLANS.md` §36.5.
 *
 * The *clearance* of the pose is `render/riderClearance.test.ts`'s subject.
 * What is asserted here is the channel itself: where it enters the rig, what
 * it is allowed to do, what it is forbidden to reach, and the call order the
 * composition root has to keep.
 */

/** Where an ankle is, in the rig's own space. */
function ankle(rig: ReturnType<typeof createRidingRig>, side: number): THREE.Vector3 {
  rig.group.updateMatrixWorld(true);
  const joint = rig.rider.root.getObjectByName(side > 0 ? 'rider-ankle-left' : 'rider-ankle-right');
  assert.ok(joint, 'the ankle joint is missing');
  return joint.getWorldPosition(new THREE.Vector3());
}

/** The pedal target an untouched foot stands on. */
function pedalTarget(side: number): THREE.Vector3 {
  return new THREE.Vector3(
    side * RIDER_BLOCKOUT.stanceHalfWidth,
    WHEEL.pedalHeight + RIDER_BLOCKOUT.ankleAbovePedal,
    0,
  );
}

test('the released ankle lands exactly on the gesture the tuning names', () => {
  const rig = createRidingRig();
  try {
    const pose = createPose();
    const side = RIDER_BLOCKOUT.oneFootReleaseSide;

    rig.apply(pose);
    const planted = ankle(rig, side);
    assert.ok(
      planted.distanceTo(pedalTarget(side)) < 1e-9,
      `an untouched foot is ${planted.distanceTo(pedalTarget(side))} m off its pedal`,
    );

    rig.setTrickPose(1, side);
    rig.apply(pose);
    const released = ankle(rig, side);
    // The whole gesture, from the pedal target: out, up, and back. The solve
    // reaches it exactly, which is the point of sizing the offsets against the
    // leg's own length — an ankle target past the chain's reach would leave the
    // boot somewhere the constants do not describe.
    const expected = pedalTarget(side).add(new THREE.Vector3(
      side * RIDER_BLOCKOUT.oneFootOutboard,
      RIDER_BLOCKOUT.oneFootRise,
      -RIDER_BLOCKOUT.oneFootTrail,
    ));
    assert.ok(
      released.distanceTo(expected) < 1e-9,
      `the released ankle missed its target by ${released.distanceTo(expected)} m`,
    );
    const hip = rig.rider.root.getObjectByName(side > 0 ? 'rider-hip-left' : 'rider-hip-right')!;
    const reach = expected.distanceTo(hip.getWorldPosition(new THREE.Vector3()));
    assert.ok(
      reach < RIDER_BLOCKOUT.thighLength + RIDER_BLOCKOUT.shinLength - 0.05,
      `the gesture asks for ${reach.toFixed(3)} m of a `
        + `${(RIDER_BLOCKOUT.thighLength + RIDER_BLOCKOUT.shinLength).toFixed(3)} m leg — `
        + 'the knee has no bend left',
    );

    // **The supporting foot does not move**, at any amount.
    for (const amount of [0.25, 0.5, 0.75, 1]) {
      rig.setTrickPose(amount, side);
      rig.apply(pose);
      const supporting = ankle(rig, -side);
      assert.ok(
        supporting.distanceTo(pedalTarget(-side)) < 1e-9,
        `at ${amount} the supporting foot left its pedal by `
          + `${supporting.distanceTo(pedalTarget(-side))} m`,
      );
    }
  } finally {
    rig.dispose();
  }
});

test('every interior amount is a real pose, and the channel clamps at both ends', () => {
  const rig = createRidingRig();
  try {
    const pose = createPose();
    const side: number = RIDER_BLOCKOUT.oneFootReleaseSide;
    const at = (amount: number, which: number = side): THREE.Vector3 => {
      rig.setTrickPose(amount, which);
      rig.apply(pose);
      return ankle(rig, side);
    };

    // Monotone, and every step of it visible: the gesture is a continuum, and
    // a state machine that steps it in over a few frames has to have something
    // to step through.
    const planted = pedalTarget(side);
    let last = 0;
    for (const amount of [0.2, 0.4, 0.6, 0.8, 1]) {
      const travelled = at(amount).distanceTo(planted);
      assert.ok(
        travelled > last + 0.01,
        `the foot barely moved between ${last.toFixed(3)} m and ${travelled.toFixed(3)} m`,
      );
      last = travelled;
    }

    // Clamped rather than trusted — this is the only line between whatever
    // drives the pose and the IK.
    assert.ok(at(4).distanceTo(at(1)) < 1e-9, 'an amount above 1 is not clamped');
    assert.ok(at(-3).distanceTo(planted) < 1e-9, 'a negative amount is not clamped');
    // No side is no gesture, however hard it is asked for.
    assert.ok(at(1, 0).distanceTo(planted) < 1e-9, 'a sideless gesture still moved a foot');
    // And the sign is a sign, not a scale.
    assert.ok(at(1, side * 9).distanceTo(at(1, side)) < 1e-9, 'the side is not reduced to its sign');
  } finally {
    rig.dispose();
  }
});

test('rest, a crash and the ragdoll each refuse the gesture outright', () => {
  const rig = createRidingRig();
  try {
    const side = RIDER_BLOCKOUT.oneFootReleaseSide;
    for (const field of ['restFactor', 'crashBlend', 'ragdollBlend'] as const) {
      const pose = createPose();
      pose[field] = 1;
      rig.setTrickPose(0, side);
      rig.apply(pose);
      const without = ankle(rig, side);
      rig.setTrickPose(1, side);
      rig.apply(pose);
      const with_ = ankle(rig, side);
      assert.ok(
        without.distanceTo(with_) < 1e-9,
        `${field} at 1 still let the gesture move the foot by ${without.distanceTo(with_)} m — `
          + 'a rider standing, crashing or on the ground is not holding an air pose',
      );
    }
  } finally {
    rig.dispose();
  }
});

test('the trick pose is recorded before apply and spent inside it', () => {
  // `app/Game.ts`'s `renderSeat` calls `setTrickPose` **before** `apply`, the
  // order it already keeps for `applySwing`, and that order is load-bearing:
  // `apply` is what folds the channel into the stance the leg is solved from.
  // A call afterwards poses the foot a frame late, and this is the assertion
  // that says so out loud.
  const rig = createRidingRig();
  try {
    const pose = createPose();
    const side = RIDER_BLOCKOUT.oneFootReleaseSide;
    rig.apply(pose);
    const before = ankle(rig, side);

    rig.setTrickPose(1, side);
    const afterCall = ankle(rig, side);
    assert.ok(
      before.distanceTo(afterCall) < 1e-9,
      'setTrickPose moved a joint on its own — it must only record',
    );

    rig.apply(pose);
    assert.ok(
      before.distanceTo(ankle(rig, side)) > 0.1,
      'apply did not spend the recorded gesture',
    );

    // Held, not consumed: a rig told nothing keeps what it was told, like
    // every other channel here.
    const held = ankle(rig, side);
    rig.apply(pose);
    assert.ok(held.distanceTo(ankle(rig, side)) < 1e-9, 'the gesture was consumed by one apply');
  } finally {
    rig.dispose();
  }
});

test('the cop and the ghost have no one-foot channel at all', () => {
  // The channel is a sibling method rather than an `EucPose` field, and this
  // is what that buys: neither of the two rigs that are driven by a pose alone
  // can be given the gesture, so their feet are neutral by construction and
  // there is no fallback code anywhere to keep in step. The ghost's recorded
  // fields are a contract (`render/ghostRider.ts`) and the cop has no seat and
  // no input at all.
  const cop = createCopRider();
  const ghost = createGhostRider();
  try {
    assert.ok(!('setTrickPose' in cop), 'the cop rig exposes a trick channel');
    assert.ok(!('setTrickPose' in ghost), 'the ghost rig exposes a trick channel');
    const pose = createPose();
    cop.apply(pose);
    cop.group.updateMatrixWorld(true);
    for (const side of [1, -1]) {
      const joint = cop.group.getObjectByName(side > 0 ? 'cop-rider-ankle-left' : 'cop-rider-ankle-right');
      assert.ok(joint, 'the cop has no ankle joint');
      const world = joint.getWorldPosition(new THREE.Vector3());
      assert.ok(
        world.distanceTo(pedalTarget(side)) < 1e-9,
        `the cop's ${side > 0 ? 'left' : 'right'} boot is ${world.distanceTo(pedalTarget(side))} m `
          + 'off its pedal',
      );
    }
  } finally {
    cop.dispose();
    ghost.dispose();
  }
});

test('the gesture adds no geometry: the same parts, the same triangles', () => {
  // A pose channel moves joints. If this ever counts differently the channel
  // has grown a mesh, and `render/renderCost.test.ts`'s budget would find out
  // a milestone later.
  const rig = createRidingRig();
  try {
    const pose = createPose();
    const count = (): { meshes: number; triangles: number } => {
      rig.group.updateMatrixWorld(true);
      let meshes = 0;
      let triangles = 0;
      rig.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh !== true) return;
        meshes += 1;
        const index = mesh.geometry.getIndex();
        triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
      });
      return { meshes, triangles };
    };

    rig.setTrickPose(0, 0);
    rig.apply(pose);
    const planted = count();
    assert.ok(planted.meshes > 10 && planted.triangles > 100, 'the rig built nothing to count');

    for (const amount of [0.35, 0.7, 1]) {
      for (const side of [1, -1]) {
        rig.setTrickPose(amount, side);
        rig.apply(pose);
        const released = count();
        assert.equal(released.meshes, planted.meshes, 'the gesture added or removed a mesh');
        assert.equal(released.triangles, planted.triangles, 'the gesture changed the triangle count');
      }
    }
  } finally {
    rig.dispose();
  }
});
