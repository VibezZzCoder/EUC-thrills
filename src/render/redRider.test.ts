/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import { createRidingRig } from './ridingRig.ts';
import { PLAYABLE_RIDER_LOOKS, RIDER_LOOKS, RED_RIDER_LOOK } from './riderLook.ts';
import { measureObject } from './renderCost.ts';
import { createPose } from '../simulation/EucController.ts';
import { BLOCKOUT_COLOURS, RIDER, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { loftGeometry } from './blockoutKit.ts';
import { createBlockoutEUC } from './euc.ts';
import {
  RED_RIDER_MACHINE_LOOK,
  STANDARD_MACHINE_LOOK,
  machineLook,
} from './machineLook.ts';
import type { MachineId } from '../data/machines.ts';

/**
 * Red Rider's accessory pass — M19, and the two things about it that a capture
 * cannot be trusted to prove.
 *
 * The owner's second review was that the look was "still a loose
 * interpretation" and that every accessory he wears has to be represented. The
 * answer was to pack the reference's kit into the panel groups and painters
 * that already existed rather than to buy new meshes, and both halves of that
 * are checkable: the **cost** must not have moved, and the **side-aware paint**
 * must actually land outboard. The second one already shipped wrong once.
 */

test('no playable rider costs more than Cool Rider', () => {
  const rows = PLAYABLE_RIDER_LOOKS.map((look) => {
    const rig = createRidingRig(look);
    try {
      rig.apply(createPose());
      const cost = measureObject(rig.group);
      return {
        id: look.id,
        meshes: cost.meshes.length,
        casting: cost.meshes.filter((mesh) => mesh.castsShadow).length,
        calls: cost.totalDrawCalls,
        triangles: cost.totalTriangles,
      };
    } finally {
      rig.dispose();
    }
  });

  for (const row of rows) {
    console.log(
      `${row.id.padEnd(12)} meshes ${String(row.meshes).padStart(3)}`
        + `  casting ${String(row.casting).padStart(3)}`
        + `  calls ${String(row.calls).padStart(3)}`
        + `  triangles ${String(row.triangles).padStart(6)}`,
    );
  }

  const baseline = rows.find((row) => row.id === 'cool-rider');
  assert.ok(baseline, 'Cool Rider is the baseline and must be measurable');
  for (const row of rows) {
    assert.ok(
      row.calls <= baseline.calls,
      `${row.id} costs ${row.calls} draw calls against Cool Rider's ${baseline.calls}`,
    );
  }
});

test('every look builds, poses and disposes without throwing', () => {
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look);
    rig.apply(createPose());
    rig.dispose();
  }
});

/**
 * The thigh graphic sits on the **outer face of the left leg only**.
 *
 * This is the assertion the first build needed and did not have. Each leg is a
 * fresh geometry and the painter used to be handed no side, so a mark placed at
 * `+x` landed outboard on the left leg and *inboard* on the right — and the
 * symmetric `|x|` version that replaced it read as a lighting seam. The painter
 * now takes the side; this proves it uses it without inventing a symmetric
 * second mark the reference does not contain.
 *
 * Rider-left is +X (`data/tuning.ts` conventions), so outboard is +X at side +1
 * and −X at side −1.
 */
test("Red Rider's thigh graphic lands outboard on the left leg only", () => {
  const paintThigh = RED_RIDER_LOOK.paint?.thigh;
  assert.ok(paintThigh, 'the thigh painter is what this test is about');

  const markTarget = new THREE.Color(BLOCKOUT_COLOURS.redRiderMark);

  for (const side of [-1, 1]) {
    const geometry = loftGeometry(RED_RIDER_LOOK.profiles.thigh, {
      radialSegments: 14,
      shade: RED_RIDER_LOOK.shades.legs,
    });
    paintThigh(geometry, side);

    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    // The mark is the only paint on this mesh whose blue channel is driven far
    // above the suit's — the guard band drives every channel down.
    const painted: number[] = [];
    for (let i = 0; i < position.count; i += 1) {
      if (colour.getZ(i) > 4) painted.push(position.getX(i));
    }

    if (side < 0) {
      assert.equal(painted.length, 0, 'the rider-right leg must not carry a second mark');
      geometry.dispose();
      continue;
    }

    assert.ok(painted.length > 0, 'the rider-left mark was not painted');
    const wrongSide = painted.filter((x) => x * side <= 0);
    assert.equal(
      wrongSide.length,
      0,
      `side ${side}: ${wrongSide.length} of ${painted.length} marked vertices are inboard`,
    );
    geometry.dispose();
    assert.ok(markTarget.b >= 0, 'colour decoded');
  }
});

/**
 * A continuous harness needs overlap along both axes. Matching the front and
 * back strap spacing was not enough: the former shoulder patch stopped 0.35
 * rad short of both pairs, which the rear capture exposed as four capped gaps.
 */
test("Red Rider's harness overlaps both shoulder routes and the rear route reaches the belt", () => {
  const shoulderPatches = RED_RIDER_LOOK.panels.shoulders?.patches ?? [];
  const torsoPatches = RED_RIDER_LOOK.panels.torso?.patches ?? [];

  const shoulderWraps = shoulderPatches.filter(
    (patch) => patch.anchor === 'outboard' && patch.u1 - patch.u0 > 1,
  );
  const frontStrap = torsoPatches.find(
    (patch) => patch.anchor === 'front' && patch.mirrored === true,
  );
  const belt = torsoPatches.find(
    (patch) => patch.anchor === 'back' && patch.u1 - patch.u0 > 6,
  );
  const backStraps = torsoPatches.filter(
    (patch) => patch.anchor === 'back' && patch.u1 - patch.u0 < 1,
  );

  assert.equal(shoulderWraps.length, 2, 'the shoulder route needs a front and rear half');
  assert.ok(frontStrap, 'front strap pair is missing');
  assert.ok(belt, 'wrapped waist belt is missing');
  assert.equal(backStraps.length, 2, 'the harness needs two back drops');

  const frontShoulder = shoulderWraps.find((patch) => patch.u1 > 1);
  const rearShoulder = shoulderWraps.find((patch) => patch.u0 < -1);
  assert.ok(frontShoulder, 'front shoulder half is missing');
  assert.ok(rearShoulder, 'rear shoulder half is missing');

  const angularReach = Math.PI / 2 - Math.max(Math.abs(frontStrap.u0), Math.abs(frontStrap.u1));
  assert.ok(frontShoulder.u1 >= angularReach, 'shoulder wrap stops before the front strap');
  assert.ok(-rearShoulder.u0 >= angularReach, 'shoulder wrap stops before the back strap');
  assert.ok(frontShoulder.u0 <= rearShoulder.u1, 'the shoulder halves do not overlap at the crown');
  assert.ok(frontStrap.to >= frontShoulder.from, 'front strap stops below the shoulder wrap');
  for (const backStrap of backStraps) {
    assert.ok(backStrap.to >= rearShoulder.from, 'back strap stops below the shoulder wrap');
    assert.ok(backStrap.from <= belt.to, 'back strap stops above the belt');
  }
});

/**
 * The graphic's edges land on rings, which is what stops it fogging.
 *
 * `limbProfile` places a ring *pair* at each seam ± 0.018, and the first build
 * of this mark spanned two default ring gaps a tenth of a metre wide and
 * rendered as white fog down his leg. The seams at 0.30 and 0.68 exist for this
 * mark alone, so a test that they still bracket it is a test that the mark
 * still has edges — and their *spacing* is the mark's proportions, which is why
 * they moved out from 0.34/0.60 when the owner called the graphic square.
 */
// ---------------------------------------------------------------------------
// His machine — M19 Phases 2 and 3
// ---------------------------------------------------------------------------

/**
 * The red wheel spends triangles and never a draw call.
 *
 * That was the design (`docs/PLANS.md` §19.7): livery is vertex paint, the
 * saddle merges into the shell mesh, and every guard and nameplate patch lands
 * in the one trim mesh the accent strips already paid for. So the machine
 * comparison is the rider comparison one axis over — measured rather than
 * asserted, with the table printed for the build record.
 */
test("Red Rider's machine costs the same draw calls as the standard wheel", () => {
  const rows = [STANDARD_MACHINE_LOOK, RED_RIDER_MACHINE_LOOK].map((look) => {
    const euc = createBlockoutEUC(look);
    try {
      const cost = measureObject(euc.group);
      return {
        machine: look.machine,
        meshes: cost.meshes.length,
        calls: cost.totalDrawCalls,
        triangles: cost.totalTriangles,
      };
    } finally {
      euc.dispose();
    }
  });

  for (const row of rows) {
    console.log(
      `${row.machine.padEnd(12)} meshes ${String(row.meshes).padStart(3)}`
        + `  calls ${String(row.calls).padStart(3)}`
        + `  triangles ${String(row.triangles).padStart(6)}`,
    );
  }

  const [standard, red] = rows;
  assert.equal(
    red.calls,
    standard.calls,
    `his machine costs ${red.calls} draw calls against the standard ${standard.calls}`,
  );
  assert.ok(red.triangles > standard.triangles, 'the saddle and guards are real triangles');
});

test('his machine builds on his rig, poses and disposes without throwing', () => {
  const rig = createRidingRig(RED_RIDER_LOOK, RED_RIDER_MACHINE_LOOK);
  rig.apply(createPose());
  rig.dispose();
});

test('machineLook resolves both entries and falls back to the standard wheel', () => {
  assert.equal(machineLook('standard'), STANDARD_MACHINE_LOOK);
  assert.equal(machineLook('red-rider'), RED_RIDER_MACHINE_LOOK);
  assert.equal(machineLook('nonexistent' as MachineId), STANDARD_MACHINE_LOOK);
});

/**
 * The saddle stays under a crouched rider.
 *
 * He stands on the pedals — the planted-boots property `riderEuc.test.ts`
 * asserts — so the cushion is scenery between his legs, and the deepest the
 * hips reach is `RIDER.hipHeight - crouchHipDrop` (the preload and the landing
 * absorb; the held tuck is deliberately shallower). A hand's breadth of margin
 * under that keeps the seat garment clear too, which is the same clearance
 * argument `riderClearance.test.ts` makes for Trollina's skirt.
 */
test('the saddle keeps clear of the hips at a full crouch', () => {
  const top = RED_RIDER_MACHINE_LOOK.top;
  assert.equal(top.kind, 'saddle', 'his machine carries the saddle');
  const crown = Math.max(...top.profile.map((ring) => ring.y));
  const hipsAtFullCrouch = RIDER.hipHeight - RIDER_BLOCKOUT.crouchHipDrop;
  assert.ok(
    crown <= hipsAtFullCrouch - 0.10,
    `saddle crown at ${crown} m against hips at ${hipsAtFullCrouch} m — under 0.10 m of clearance`,
  );
});

/**
 * The owner's first wheel review kept the design but asked for the silhouette
 * to read taller and more aggressive like the character reference. That read
 * comes from aspect and continuous load paths, not a larger tyre: the saddle
 * is a narrow vertical stack, the front blades run from near the axle to the
 * light brow, and the rear guards make the same journey around the status
 * spine. Pin those relationships so a later detail pass cannot turn the red
 * machine back into the short horizontal pod this pass replaced.
 */
test("Red Rider's wheel keeps its tall armor routes and narrow saddle", () => {
  const shellProfile = RED_RIDER_MACHINE_LOOK.shell.profile;
  assert.ok(shellProfile, 'the red machine needs its own cosmetic shell profile');
  const shellHeight = Math.max(...shellProfile.map((ring) => ring.y))
    - Math.min(...shellProfile.map((ring) => ring.y));
  const shellDepth = Math.max(...shellProfile.map((ring) => ring.halfDepth)) * 2;
  assert.ok(shellHeight / shellDepth >= 0.80, 'the side shell flattened back into a pod');

  const top = RED_RIDER_MACHINE_LOOK.top;
  assert.equal(top.kind, 'saddle');
  const saddleBottom = Math.min(...top.profile.map((ring) => ring.y));
  const saddleTop = Math.max(...top.profile.map((ring) => ring.y));
  const saddleDepth = Math.max(...top.profile.map((ring) => ring.halfDepth)) * 2;
  assert.ok(saddleTop - saddleBottom >= 0.07, 'the saddle flattened back into a cap');
  assert.ok(saddleDepth <= 0.33, 'the saddle spread back into a horizontal pod');

  const shellPatches = RED_RIDER_MACHINE_LOOK.trim.patches.filter(
    (patch) => (patch.surface ?? 'shell') === 'shell',
  );
  const frontBlades = shellPatches.filter(
    (patch) => patch.u0 > Math.PI / 2 - 0.70
      && patch.u1 < Math.PI / 2 + 0.70
      && patch.u1 - patch.u0 < 0.50
      && patch.from < 0.31
      && patch.to > 0.54,
  );
  const rearGuards = shellPatches.filter(
    (patch) => patch.u0 > -Math.PI / 2 - 0.70
      && patch.u1 < -Math.PI / 2 + 0.70
      && patch.u1 - patch.u0 < 0.50
      && patch.from < 0.31
      && patch.to > 0.56,
  );
  assert.equal(frontBlades.length, 2, 'the tall front U needs two separate blades');
  assert.equal(rearGuards.length, 2, 'the rear spine needs two tall corner guards');
});

/**
 * The status light keeps its dark bezel — §19.7's collision, closed.
 *
 * `statusCritical` is red and his shell is red, so the livery has to paint the
 * shell dark where the ladder's warning sits. Sampled from the built geometry
 * rather than read off the painter, because the painter's bands and the status
 * light's seat are authored in different files and only the mesh knows whether
 * they still agree.
 */
test("his livery paints the shell dark behind the status light", () => {
  const euc = createBlockoutEUC(RED_RIDER_MACHINE_LOOK);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');

    let sampled = 0;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (position.getZ(i) < -0.15 && Math.abs(position.getX(i)) < 0.07
        && y > 0.52 && y < 0.578) {
        sampled += 1;
        assert.ok(
          colour.getX(i) < 0.10,
          `bezel vertex ${i} keeps a red multiplier of ${colour.getX(i)} — the warning would sit on red`,
        );
      }
    }
    assert.ok(sampled > 0, 'no shell vertices behind the status light were sampled');
  } finally {
    euc.dispose();
  }
});

test("Red Rider's thigh profile carries the seams the graphic ends on", () => {
  // A `LoftProfile` *is* the ring array — `readonly Required<LoftRing>[]`.
  const heights = RED_RIDER_LOOK.profiles.thigh.map((ring) => ring.y);
  const length = RIDER_BLOCKOUT.thighLength;
  for (const seam of [0.30, 0.68]) {
    const wanted = -length * seam;
    const nearest = heights.reduce(
      (best, y) => (Math.abs(y - wanted) < Math.abs(best - wanted) ? y : best),
      heights[0],
    );
    assert.ok(
      Math.abs(nearest - wanted) < length * 0.03,
      `no ring within 3% of the ${seam} seam — the graphic edge will smear`,
    );
  }
});
