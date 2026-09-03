/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_CHARACTERS, CHARACTER_IDS } from '../data/riders.ts';
import { RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { loftPoint, vAtHeight } from './blockoutKit.ts';
import { createPlaceholderRider } from './rider.ts';
import {
  COOL_RIDER_LOOK,
  DRUNKARD_LOOK,
  MOTION_STILL,
  RIDER_LOOKS,
  riderLook,
} from './riderLook.ts';

/**
 * What a second rider is allowed to be — M14.5.
 *
 * These are the claims the whole character system rests on, and every one of
 * them is invisible in a screenshot. A look that broke any of them would still
 * *render*: the rider would simply stop being posable, or stop being findable
 * by the harness, or start leaking a material on every swap.
 */

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

test('every character has a look, and every look is a character', () => {
  // The two tables are in different layers on purpose — `data/riders.ts` is
  // plain data the options store and the menus read, and this file imports
  // three — so nothing but a test can keep them in step. A roster entry with no
  // look resolves to Cool Rider and silently ships the wrong rider.
  //
  // **Against `ALL_CHARACTERS` rather than `CHARACTER_IDS` from M18**, and the
  // difference is the cop: he is a look the renderer must be able to build and
  // a rider the *player* may never be, so the playable roster is deliberately
  // the shorter of the two lists. Checking looks against the playable roster
  // would now fail for a reason that is correct.
  const everyone = ALL_CHARACTERS.map((character) => character.id);
  assert.deepEqual([...RIDER_LOOKS].map((look) => look.id).sort(), [...everyone].sort());
  for (const id of everyone) assert.equal(riderLook(id).id, id);
  // And the cop is emphatically not in the chooser's list.
  assert.equal(CHARACTER_IDS.includes('cop' as never), false);
  // A stale id out of an old store must still resolve to somebody.
  assert.equal(riderLook('nobody' as never), COOL_RIDER_LOOK);
});

test('both riders are built on one skeleton, joint for joint', () => {
  // **Rule 1 of `render/riderLook.ts`, and the one that matters most.** The
  // chase camera was tuned at M3 against `RIDER.hipHeight`; `applyStanceReaction`
  // solves both legs to `stanceHalfWidth` and both arms from `shoulderHalfWidth`;
  // and roughly two hundred browser assertions resolve rider joints by name.
  // A look that moved a joint would not fail here as a look — it would fail as
  // a hundred unrelated pose tests, in files nobody touched.
  const expected = {
    'rider-pelvis': new THREE.Vector3(0, RIDER.hipHeight, 0),
    'rider-hip-left': new THREE.Vector3(RIDER_BLOCKOUT.torsoWidth * 0.26, RIDER.hipHeight, 0),
    'rider-hip-right': new THREE.Vector3(-RIDER_BLOCKOUT.torsoWidth * 0.26, RIDER.hipHeight, 0),
    'rider-neck': new THREE.Vector3(0, RIDER_BLOCKOUT.torsoLength, 0),
    'rider-shoulder-left': new THREE.Vector3(
      RIDER_BLOCKOUT.shoulderHalfWidth,
      RIDER_BLOCKOUT.torsoLength,
      0,
    ),
  };

  for (const look of RIDER_LOOKS) {
    const rider = createPlaceholderRider(look);
    for (const [name, position] of Object.entries(expected)) {
      const joint = rider.root.getObjectByName(name);
      assert.ok(joint, `${look.id} has no ${name}`);
      assert.ok(
        joint.position.distanceTo(position) < 1e-9,
        `${look.id}: ${name} is at ${joint.position.toArray().join()} not ${position.toArray().join()}`,
      );
    }
    rider.dispose();
  }
});

test('both riders put both boots on the pedals', () => {
  // The load-bearing property of the whole rig: the legs are children of the
  // root, so the boots stay planted through any amount of lean. A look with
  // different bone lengths would leave one rider's feet hovering — visible only
  // in a capture, and only from the `legs` angle.
  const ankleY = WHEEL.pedalHeight + RIDER_BLOCKOUT.ankleAbovePedal;
  for (const look of RIDER_LOOKS) {
    const rider = createPlaceholderRider(look);
    for (const side of ['left', 'right'] as const) {
      const ankle = rider.root.getObjectByName(`rider-ankle-${side}`);
      assert.ok(ankle, `${look.id} has no ${side} ankle`);
      const world = ankle.getWorldPosition(new THREE.Vector3());
      assert.ok(
        Math.abs(world.y - ankleY) < 1e-6,
        `${look.id}: the ${side} ankle sits at ${world.y}, not on the pedal at ${ankleY}`,
      );
      assert.ok(
        Math.abs(Math.abs(world.x) - RIDER_BLOCKOUT.stanceHalfWidth) < 1e-6,
        `${look.id}: the ${side} boot is not at the pedal centre`,
      );
    }
    rider.dispose();
  }
});

test('Trollina cap sleeves overlap the bodice instead of floating beside it', () => {
  const look = riderLook('trollina');
  const sleeve = look.profiles.sleeve;
  assert.ok(sleeve, 'Trollina has no cap sleeve profile');

  // Measure authored cross-sections in the pelvis frame. The upper ring at
  // -8 mm is the exact failure the owner's front/back captures exposed: the
  // old centred sleeve ended 7 cm outside the narrowing bodice there even
  // though it covered the bare arm perfectly. Every sleeve ring that still
  // has bodice beside it must now bury its inner edge by at least 1 mm.
  const point = new THREE.Vector3();
  // The positive-Y cap closes over the arm above the joint; it is not a join
  // surface and correctly sits outside the halter neckline. Measure the four
  // rings at and below the joint, where daylight means detached clothing.
  for (const ring of sleeve.filter((candidate) => candidate.y <= 0)) {
    const torsoY = RIDER_BLOCKOUT.torsoLength + ring.y;
    loftPoint(look.profiles.torso, 0, vAtHeight(look.profiles.torso, torsoY), point);
    const sleeveInnerEdge = RIDER_BLOCKOUT.shoulderHalfWidth
      - ring.halfWidth;
    const overlap = point.x - sleeveInnerEdge;
    assert.ok(
      overlap >= 0.001,
      `cap sleeve leaves ${(Math.max(0, -overlap) * 1000).toFixed(1)} mm of daylight at y=${ring.y}`,
    );
  }

  const rider = createPlaceholderRider(look);
  for (const side of ['left', 'right'] as const) {
    const cap = rider.root.getObjectByName(`rider-cap-sleeve-${side}`);
    assert.ok(cap, `missing ${side} cap sleeve`);
    assert.equal(cap.position.x, 0, `${side} arm is not centred in its cap sleeve`);
  }
  rider.dispose();
});

test('Officer Dorkins has an open helmet over a real face, not features painted on a shell', () => {
  // The M18 first pass technically contained a moustache and glasses, but both
  // were dark patches on Cool Rider's full-face helmet. Source structure can
  // protect the corrected read even though the final acceptance is visual: the
  // helmet crown stays above the brow and the merged skin/feature mesh exists
  // independently beneath it.
  const look = riderLook('cop');
  assert.ok(
    look.profiles.head.every((ring) => ring.y >= 0.2),
    'the cop helmet closes back over the face',
  );
  assert.ok(
    look.extras?.some((extra) => extra.name === 'rider-cop-face'),
    'the cop has no real face beneath the helmet',
  );
  assert.equal(look.panels?.torso?.role, 'face', 'the police band lost its blue material');
});

test('every rider mesh carries a colour attribute, or it renders pure black', () => {
  // The trap `DESIGN.md` §7c records and this project has nearly shipped five
  // times: every rider material sets `vertexColors`, so a geometry without the
  // attribute is not an error — it is a part that renders black. `mergeGeometries`
  // refuses one, but a mesh built from a stock three geometry has nothing
  // stopping it, which is exactly the shape Trollina's hair and eyes are.
  for (const look of RIDER_LOOKS) {
    const rider = createPlaceholderRider(look);
    for (const mesh of meshes(rider.root)) {
      assert.ok(
        mesh.geometry.getAttribute('color') !== undefined,
        `${look.id}: ${mesh.name || '(unnamed)'} has no colour attribute and will draw black`,
      );
      assert.ok(
        mesh.geometry.getAttribute('normal') !== undefined,
        `${look.id}: ${mesh.name || '(unnamed)'} has no normals`,
      );
    }
    rider.dispose();
  }
});

test('at least one part of every rider carries no silhouette', () => {
  // `render/ghostRider.ts` derives what a replay draws from `castShadow`, and a
  // look where everything casts is a look whose author never made the judgement
  // — the ghost would then draw flat identity panels as meaningless blobs.
  for (const look of RIDER_LOOKS) {
    const rider = createPlaceholderRider(look);
    const all = meshes(rider.root);
    assert.ok(all.some((mesh) => mesh.castShadow), `${look.id}: nothing casts`);
    assert.ok(all.some((mesh) => !mesh.castShadow), `${look.id}: everything casts`);
    rider.dispose();
  }
});

test('disposing a rider frees every geometry and every material it made', () => {
  // A swap builds a rider and throws the last one away, so this runs once per
  // change of character rather than once per session. `ghostRider.ts` overwrites
  // `mesh.material` on its copy, which means the rider's own tracking array is
  // the *only* reference left to a look's materials — anything built outside
  // `trackMaterial` leaks with nothing able to find it again.
  for (const look of RIDER_LOOKS) {
    const rider = createPlaceholderRider(look);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const mesh of meshes(rider.root)) {
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
      }
    }

    let disposedGeometries = 0;
    let disposedMaterials = 0;
    for (const geometry of geometries) {
      geometry.addEventListener('dispose', () => { disposedGeometries += 1; });
    }
    for (const material of materials) {
      material.addEventListener('dispose', () => { disposedMaterials += 1; });
    }

    rider.dispose();

    assert.equal(disposedGeometries, geometries.size, `${look.id}: a geometry leaked`);
    assert.equal(disposedMaterials, materials.size, `${look.id}: a material leaked`);
    assert.equal(rider.root.parent, null, `${look.id}: the root stayed in the scene`);
  }
});

test('repeated builds and disposals of alternating riders plateau', () => {
  // Invariant 10, applied to the one thing M14.5 made repeatable. A player can
  // stand on the chooser and switch back and forth; if either look leaked, the
  // count would climb once per press with nothing on screen to show for it.
  const count = (): number => {
    let geometries = 0;
    for (const look of RIDER_LOOKS) {
      const rider = createPlaceholderRider(look);
      geometries += meshes(rider.root).length;
      rider.dispose();
    }
    return geometries;
  };

  const first = count();
  for (let i = 0; i < 6; i += 1) count();
  assert.equal(count(), first);
});

// ---------------------------------------------------------------------------
// M29 — safeguard S5: only one rider has a motion table
// ---------------------------------------------------------------------------

test('only the Drunkard carries a motion table, and the still one is a true zero', () => {
  // §29.4's safeguard S5, and the cheapest guarantee in the milestone: the
  // ride style reaches the rig as `look.motion ?? MOTION_STILL`, exactly the
  // shape `armCarriage` already uses, so a look with no table contributes a
  // product of zero to every joint the style touches. That is only true while
  // the table stays absent everywhere else — a `motion` copied onto a second
  // look during a Phase 2 spread would give a sober rider the Drunkard's sway
  // the first time somebody rode past a stumble, and nothing on screen would
  // name the cause.
  for (const look of RIDER_LOOKS) {
    if (look.id === 'drunkard') continue;
    assert.equal(
      look.motion,
      undefined,
      `${look.id} has a motion table and is not the one rider allowed one`,
    );
  }
  // Including the cop, who is a look the renderer must build and a rider the
  // player may never be — `rideStyleFor('cop')` returns the sober style and
  // this is the rig's half of the same promise.
  assert.equal(riderLook('cop').motion, undefined);
  assert.equal(COOL_RIDER_LOOK.motion, undefined);

  // The fallback is a true zero in every field, frozen, so "no table" and "a
  // table of zeros" are the same ride rather than nearly the same one.
  assert.equal(Object.isFrozen(MOTION_STILL), true);
  for (const [key, value] of Object.entries(MOTION_STILL)) {
    assert.ok(Object.is(value, 0), `MOTION_STILL.${key} is ${value}`);
  }
});

test("the Drunkard's motion table is complete, finite, and never negative", () => {
  // The table is nine amplitudes the owner's ride will move, so the useful
  // claims are structural rather than numeric: it names exactly the fields
  // `MOTION_STILL` does — a typo would otherwise land as `undefined` and
  // multiply a channel into `NaN` on the first weaving step — and every one
  // is a finite magnitude. Signs are the rig's, not the table's: `rider.ts`
  // and `ridingRig.ts` decide which way a positive sway leans.
  const motion = DRUNKARD_LOOK.motion;
  assert.ok(motion, 'the Drunkard has no motion table');
  assert.equal(Object.isFrozen(motion), true);
  assert.deepEqual(Object.keys(motion).sort(), Object.keys(MOTION_STILL).sort());
  for (const [key, value] of Object.entries(motion)) {
    assert.equal(Number.isFinite(value), true, `motion.${key} is ${value}`);
    assert.ok(value >= 0, `motion.${key} is negative (${value})`);
  }
  // And it is not silently the still table: at least one amplitude is real,
  // or every assertion above would pass on a rider who does not move.
  assert.ok(
    Object.values(motion).some((value) => value > 0),
    "the Drunkard's table is all zeros",
  );
  // The over-lean is the one entry that is a *fraction* of a counter-roll
  // rather than an amplitude, and a value past 1 would invert the upper body.
  assert.ok(motion.overLean <= 1, `overLean is ${motion.overLean}`);
});
