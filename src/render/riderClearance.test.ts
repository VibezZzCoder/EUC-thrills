/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, EUC, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { createPlaceholderRider, createStanceInput, type StanceInput } from './rider.ts';
import { ADONISB2_LOOK, TROLLINA_LOOK } from './riderLook.ts';
import type { LoftProfile } from './blockoutKit.ts';

/**
 * The skirt clears the legs, measured — M14.5 second look pass.
 *
 * **This file is the measurement behind an owner report.** "When carving the
 * outer leg clips the skirt" arrived on 2026-08-10, and it was the third
 * garment-versus-rig defect in as many passes; every one of them was found by
 * eye, after the fact, from one lucky camera angle. The legs are posed by IK
 * against planted pedals and the garment is rigid on the pelvis, so whether
 * they intersect is pure geometry — which means it is *testable*, and a
 * property this easy to break silently has to be.
 *
 * The rig is driven through the reachable stance envelope via the same
 * `applyStanceReaction` the game calls, with `torsoPitch` composed the way
 * `ridingRig.ts` composes it (the wheel takes `wheelPitchFactor` of the lean;
 * the constant rest tilt rides on top). Every vertex of both thighs and both
 * shins is then transformed into the pelvis frame — the frame the dress is
 * rigid in — and measured against the dress profile's own cross-section.
 *
 * ## Two tiers, because full containment is geometrically impossible
 *
 * A thigh the IK has folded toward horizontal (a full crouch inside a full
 * carve, or a held tuck) sweeps through any hem the character could wear —
 * real cloth drapes over the thigh at that point; rigid geometry can only
 * interpenetrate. No skirt "fixes" that, so the design splits the problem:
 *
 *   - **Asserted geometrically** — the held riding envelope (any carve × any
 *     lean, riding, resting, reversing, crashed) clears outright with margin,
 *     and so does the common transient (a preload, into a moderate carve).
 *     These are the stances the player holds and the ones the owner's report
 *     came from.
 *   - **Made invisible structurally** — the deep compound folds cross at the
 *     hem edge only, against tights that match the seat exactly
 *     (`RiderLook.parts`): no contrast, no value step, no silhouette break —
 *     a short skirt sitting on folded legs, which is what the real garment
 *     would do. The last test pins the material identities that property
 *     rests on.
 *
 * Cool Rider is deliberately not asserted here: his jacket, trousers and legs
 * are one suit in one material, so this class of intersection has never had
 * anything to show on him. The test is about the one look that wears a skirt
 * over a different garment; a third look that does the same must join it.
 */

/** Interpolate a loft profile's cross-section at a local height. */
function ringAtHeight(profile: LoftProfile, y: number): {
  halfWidth: number; halfDepth: number; x: number; z: number; square: number;
} {
  const last = profile.length - 1;
  if (y <= profile[0]!.y) return profile[0]!;
  if (y >= profile[last]!.y) return profile[last]!;
  for (let i = 1; i <= last; i += 1) {
    const above = profile[i]!;
    if (y <= above.y) {
      const below = profile[i - 1]!;
      const f = (y - below.y) / (above.y - below.y);
      return {
        halfWidth: below.halfWidth + (above.halfWidth - below.halfWidth) * f,
        halfDepth: below.halfDepth + (above.halfDepth - below.halfDepth) * f,
        x: below.x + (above.x - below.x) * f,
        z: below.z + (above.z - below.z) * f,
        square: below.square + (above.square - below.square) * f,
      };
    }
  }
  return profile[last]!;
}

/**
 * Signed distance from a point to the profile's surface at the point's own
 * height, along the ray from the section's centre. Positive is inside.
 */
function depthInside(profile: LoftProfile, point: THREE.Vector3): number {
  const ring = ringAtHeight(profile, point.y);
  const dx = point.x - ring.x;
  const dz = point.z - ring.z;
  const r = Math.hypot(dx, dz);
  if (r < 1e-9) return Math.min(ring.halfWidth, ring.halfDepth);
  // |x/hw|^sq + |z/hd|^sq = 1 is the section boundary (see `loftPoint`).
  const g = Math.abs(dx / ring.halfWidth) ** ring.square
    + Math.abs(dz / ring.halfDepth) ** ring.square;
  return (g ** (-1 / ring.square) - 1) * r;
}

interface Fit {
  /** Worst shortfall: minimum radial depth inside the skirt, metres. */
  radial: number;
  points: number;
}

/** The composed torso hinge `ridingRig.ts` hands over for a given lean. */
function torsoPitchFor(riderPitch: number): number {
  return riderPitch * (1 - EUC.wheelPitchFactor) + RIDER_BLOCKOUT.torsoRestPitch;
}

function measure(
  rider: ReturnType<typeof createPlaceholderRider>,
  overrides: Partial<StanceInput>,
  zoneTop: number,
): Fit {
  const stance = Object.assign(createStanceInput(), overrides);
  rider.applyStanceReaction(stance);
  rider.root.updateMatrixWorld(true);

  const pelvis = rider.pelvis;
  const profile = TROLLINA_LOOK.profiles.torso;
  const hem = profile[0]!.y;

  const legMeshes: THREE.Mesh[] = [];
  for (const side of ['left', 'right']) {
    const hip = rider.root.getObjectByName(`rider-hip-${side}`)!;
    const knee = rider.root.getObjectByName(`rider-knee-${side}`)!;
    for (const joint of [hip, knee]) {
      const mesh = joint.children.find(
        (child) => (child as THREE.Mesh).isMesh === true && child.name === '',
      ) as THREE.Mesh | undefined;
      assert.ok(mesh, `no limb mesh under rider-${side}`);
      legMeshes.push(mesh);
    }
  }

  const point = new THREE.Vector3();
  let radial = Infinity;
  let points = 0;
  for (const mesh of legMeshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1) {
      point.fromBufferAttribute(positions, i);
      mesh.localToWorld(point);
      pelvis.worldToLocal(point);
      // Only the span the skirt occupies. Below the hem a leg is *supposed*
      // to be outside the garment; above the zone the bodice is nowhere a
      // knee can reach in the stances that tier asserts.
      if (point.y < hem + 0.003 || point.y > zoneTop) continue;
      points += 1;
      radial = Math.min(radial, depthInside(profile, point));
    }
  }
  return { radial, points };
}

const CARVES = [-RIDER_BLOCKOUT.carveReactionFullRoll, 0, RIDER_BLOCKOUT.carveReactionFullRoll];
const LEANS = [-EUC.maxRiderPitch, -0.35, 0, 0.35, EUC.maxRiderPitch];

test('the skirt clears the legs through every held riding stance', () => {
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  let asserted = 0;
  const held: Array<Partial<StanceInput> & { label: string }> = [];
  for (const rollAngle of CARVES) {
    for (const riderPitch of LEANS) {
      held.push({
        label: `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}`,
        rollAngle,
        riderPitch,
        torsoPitch: torsoPitchFor(riderPitch),
      });
    }
  }
  // **Backwards riding used to have a smaller envelope, and M16 took that away.**
  // At the old 2.2 m/s cap the roll a reverse corner could demand was a fraction
  // of the forward limit, so this loop asserted a fraction of the forward
  // angles. `EUC.maxReverseSpeed` is now 6.7 m/s, which is fast enough for a
  // reverse corner to reach the full lateral limit — so the reverse stance now
  // has to compose with a real carve, and it is asserted against the same
  // `CARVES` the forward stances use. The lean list stays shorter because a
  // full-lean sprint still cannot be *held* while reversing; the blend frames
  // belong to the structural tier, like every blend.
  for (const rollAngle of CARVES) {
    for (const riderPitch of [-0.35, 0, 0.35]) {
      held.push({
        label: `reverse, carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}`,
        rollAngle,
        riderPitch,
        torsoPitch: torsoPitchFor(riderPitch),
        reverse: 1,
      });
    }
  }
  // The stopped stance and the settled crash. Both are *static* — rest only
  // ramps once the wheel has stopped and a settled crash has shed its motion —
  // so composing them with a live carve or lean is not a reachable held pose;
  // the blend frames where they overlap belong to the transient tier below.
  held.push({ label: 'rest', restFactor: 1, torsoPitch: torsoPitchFor(0) });
  held.push({ label: 'crash, settled', crash: 1, torsoPitch: torsoPitchFor(0) });

  try {
    for (const stance of held) {
      const fit = measure(rider, stance, 0.10);
      if (fit.points === 0) continue;
      asserted += 1;
      assert.ok(
        fit.radial >= 0.005,
        `${stance.label}: a leg comes within ${(fit.radial * 1000).toFixed(1)} mm `
          + `of the skirt surface (5 mm required)`,
      );
    }
    // The zone must actually contain leg samples, or the loop proved nothing.
    assert.ok(asserted > 20, `only ${asserted} stances had leg points in the skirt zone`);
  } finally {
    rider.dispose();
  }
});

test('the common transient — a preload, into a moderate carve — stays clear too', () => {
  // The deepest stance family this file asserts geometrically. Past it — a
  // full-depth crouch inside a full carve, a held tuck, a wobble fight — the
  // IK folds the thighs toward horizontal, and *no* hem the character could
  // wear clears a horizontal thigh: real cloth drapes over the leg at that
  // point, and rigid lofts can only cross. Those compounds are not asserted
  // here because they are not assertable; what makes them shippable is
  // structural, and the test below pins it: every crossing happens at the hem
  // edge against tights that match the seat exactly, which is how a short
  // skirt sits on folded legs — fabric on limbs, not a leg through a wall.
  // The capture set (`tools/rider-views.mjs --pose carve`) is the eye's check
  // on that claim.
  const rider = createPlaceholderRider(TROLLINA_LOOK);
  try {
    for (const rollAngle of [-0.32, 0, 0.32]) {
      for (const riderPitch of [-0.35, 0, 0.35]) {
        for (const crouch of [0, 1]) {
          const fit = measure(rider, {
            rollAngle,
            riderPitch,
            torsoPitch: torsoPitchFor(riderPitch),
            crouch,
          }, 0.10);
          if (fit.points === 0) continue;
          assert.ok(
            fit.radial >= 0.003,
            `carve ${rollAngle.toFixed(2)}, lean ${riderPitch.toFixed(2)}, `
              + `crouch ${crouch}: a leg comes within ${(fit.radial * 1000).toFixed(1)} mm `
              + `of the skirt surface (3 mm required)`,
          );
        }
      }
    }
  } finally {
    rider.dispose();
  }
});

/**
 * Adonisb2 — M22, the third look with a garment-versus-leg contrast problem,
 * and the reason this file's header says a look like his "must join" it.
 *
 * Cool Rider's exemption was that his jacket, trousers and legs are one black
 * suit: a hem graze has nothing to show. Adonisb2's legs are the *green* base
 * material painted down to trousers (§22.3 fact 4), which hands the legs
 * contrast again — a fold that swung guard-green up through the black jacket
 * hem would be Trollina's skirt defect in a new colour. The clearance is
 * therefore asserted the way hers is, but for the coloured region rather than
 * the whole limb: no green-based vertex may reach the jacket's hem zone in any
 * stance of the held envelope or the common transient. Green vertices are
 * found by their painted colour, not by height arithmetic, so the assertion
 * survives the paint boundary moving.
 */
test("Adonisb2's guard green never reaches the jacket hem", () => {
  const rider = createPlaceholderRider(ADONISB2_LOOK);
  const hem = ADONISB2_LOOK.profiles.torso[0]!.y;

  const stances: Array<Partial<StanceInput>> = [];
  for (const rollAngle of CARVES) {
    for (const riderPitch of LEANS) {
      stances.push({ rollAngle, riderPitch, torsoPitch: torsoPitchFor(riderPitch) });
      stances.push({
        rollAngle: rollAngle * 0.8,
        riderPitch: riderPitch * 0.8,
        torsoPitch: torsoPitchFor(riderPitch * 0.8),
        crouch: 1,
      });
    }
  }
  stances.push({ restFactor: 1, torsoPitch: torsoPitchFor(0) });
  stances.push({ crash: 1, torsoPitch: torsoPitchFor(0) });

  try {
    const point = new THREE.Vector3();
    let sampled = 0;
    for (const overrides of stances) {
      const stance = Object.assign(createStanceInput(), overrides);
      rider.applyStanceReaction(stance);
      rider.root.updateMatrixWorld(true);
      const pelvis = rider.pelvis;

      let highestGreen = -Infinity;
      for (const side of ['left', 'right']) {
        const hip = rider.root.getObjectByName(`rider-hip-${side}`)!;
        const knee = rider.root.getObjectByName(`rider-knee-${side}`)!;
        const meshes: THREE.Mesh[] = [];
        for (const joint of [hip, knee]) {
          for (const child of joint.children) {
            if ((child as THREE.Mesh).isMesh === true) meshes.push(child as THREE.Mesh);
          }
        }
        for (const mesh of meshes) {
          const positions = mesh.geometry.getAttribute('position');
          const colours = mesh.geometry.getAttribute('color');
          for (let i = 0; i < positions.count; i += 1) {
            // Green base or the bright guard plate: the multiplier's green
            // channel sits near 1; the trouser and cuff tints paint it far
            // below. 0.5 splits the two populations with margin either way.
            if (colours.getY(i) < 0.5) continue;
            point.fromBufferAttribute(positions, i);
            mesh.localToWorld(point);
            pelvis.worldToLocal(point);
            sampled += 1;
            highestGreen = Math.max(highestGreen, point.y);
          }
        }
      }
      assert.ok(
        highestGreen < hem - 0.02,
        `carve ${(overrides.rollAngle ?? 0).toFixed(2)}, lean `
          + `${(overrides.riderPitch ?? 0).toFixed(2)}, crouch ${overrides.crouch ?? 0}: `
          + `guard green rises to ${(highestGreen * 1000).toFixed(0)} mm against the hem at `
          + `${(hem * 1000).toFixed(0)} mm — the jacket would show green through its hem`,
      );
    }
    assert.ok(sampled > 1000, `only ${sampled} green vertices sampled — the guards are missing`);
  } finally {
    rider.dispose();
  }
});

test("Adonisb2's trousers agree with his seat across the hip join", () => {
  // The other half of his exemption from the radial assertion Trollina needs:
  // where his leg CAN graze the hem, it must be painted to exactly the black
  // the seat wears, so a graze has nothing to show — Cool Rider's property,
  // recovered by arithmetic on a green-based leg. The painted trouser colour
  // is base × tint; the seat is suit × shades.seat; the two must be one value.
  const look = ADONISB2_LOOK;
  assert.equal(look.parts.legs, 'accent', 'his legs must be the green base material');
  assert.equal(look.parts.seat, 'body', 'his seat is the suit, inside the torso mesh');

  const rider = createPlaceholderRider(look);
  try {
    const thigh = rider.root.getObjectByName('rider-hip-left')!.children.find(
      (child) => (child as THREE.Mesh).isMesh === true,
    ) as THREE.Mesh;
    const positions = thigh.geometry.getAttribute('position');
    const colours = thigh.geometry.getAttribute('color');
    const base = new THREE.Color(BLOCKOUT_COLOURS.adonisb2Guard);
    const seat = new THREE.Color(BLOCKOUT_COLOURS.adonisb2Suit).multiplyScalar(look.shades.seat);
    let checked = 0;
    for (let i = 0; i < positions.count; i += 1) {
      // **The trouser band is the top half of the thigh**, which is the only
      // part of it that can reach the hem and therefore the only part this
      // contract is about.
      //
      // It used to be selected as "every vertex that is not green", on the
      // reasoning that a green-based leg has exactly two painted populations.
      // It has three since the knee cup's dark was painted onto the limb
      // beneath the cup patches (a hinge opens, and what shows through it has
      // to be the cup's own value) — near-black paint at the knee, correct,
      // deliberate, and nowhere near a jacket hem. Selecting by height keeps
      // the assertion aimed at what it was written to protect instead of
      // failing on a third colour it never anticipated.
      if (positions.getY(i) < -RIDER_BLOCKOUT.thighLength * 0.5) continue;
      if (colours.getY(i) >= 0.5) continue;
      checked += 1;
      const painted = new THREE.Color(
        base.r * colours.getX(i) * look.shades.legs,
        base.g * colours.getY(i) * look.shades.legs,
        base.b * colours.getZ(i) * look.shades.legs,
      );
      assert.ok(
        Math.abs(painted.r - seat.r) < 2e-3
          && Math.abs(painted.g - seat.g) < 2e-3
          && Math.abs(painted.b - seat.b) < 2e-3,
        `trouser vertex ${i} paints to (${painted.r.toFixed(4)}, ${painted.g.toFixed(4)}, `
          + `${painted.b.toFixed(4)}) against the seat's (${seat.r.toFixed(4)}, `
          + `${seat.g.toFixed(4)}, ${seat.b.toFixed(4)}) — the hip join would show a seam`,
      );
    }
    assert.ok(checked > 50, `only ${checked} trouser vertices found`);
  } finally {
    rider.dispose();
  }
});

test('below the hem there is nothing a crossing could show', () => {
  // The other half of the tier-B contract, asserted structurally: everything a
  // folded leg can pass through under the hem — the seat and both legs — is
  // one material spec at one vertex shade, so the geometry that does cross
  // (real cloth would drape; rigid lofts cannot) has no contrast to show.
  const look = TROLLINA_LOOK;
  assert.notEqual(look.parts.seat, 'body', 'the seat must not be part of the pink dress');
  assert.equal(
    look.materials[look.parts.seat],
    look.materials[look.parts.legs],
    'seat and legs must share one material spec',
  );
  assert.equal(
    look.shades.seat,
    look.shades.legs,
    'seat and legs must share one vertex shade',
  );
});
