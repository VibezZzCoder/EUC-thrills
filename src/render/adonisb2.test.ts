/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type * as THREE from 'three';
import { createRidingRig } from './ridingRig.ts';
import { ADONISB2_LOOK } from './riderLook.ts';
import { measureObject } from './renderCost.ts';
import { createPose } from '../simulation/EucController.ts';
import { RIDER, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { createBlockoutEUC } from './euc.ts';
import {
  ADONISB2_BROW,
  ADONISB2_EYE,
  ADONISB2_MACHINE_LOOK,
  RED_RIDER_MACHINE_LOOK,
  STANDARD_MACHINE_LOOK,
  machineLook,
} from './machineLook.ts';

/**
 * Adonisb2's wheel — M22 Phase 2, and the four things about it a capture
 * cannot be trusted to prove.
 *
 * The look was iterated against six rendered angles, so what the pictures
 * already settled — that the plate is green, that the lamps are cream, that
 * the tyre reads knobby — is not re-asserted here. What is asserted is what a
 * picture is bad at: **cost**, which has to stay level with the standard
 * wheel; **the ring spacing under the face**, which is the invariant that
 * makes every sheared patch on it mean what it says; **the direction of the
 * shear**, which is the difference between an angry face and a worried one
 * and which was wrong once already on a mirrored panel one file over; and
 * **the saddle's clearance**, which is a rider-pose property and not a
 * viewing angle at all.
 */

/** Where the face lives, and where the profile must therefore be evenly ruled. */
const FACE_BOTTOM = 0.454;
const FACE_TOP = 0.566;

test("Adonisb2's machine costs what the standard wheel costs", () => {
  const rows = [
    STANDARD_MACHINE_LOOK, RED_RIDER_MACHINE_LOOK, ADONISB2_MACHINE_LOOK,
  ].map((look) => {
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

  const [standard, , adonisb2] = rows;
  assert.equal(
    adonisb2.meshes,
    standard.meshes,
    `his machine draws ${adonisb2.meshes} meshes against the standard ${standard.meshes}`,
  );
  assert.equal(
    adonisb2.calls,
    standard.calls,
    `his machine costs ${adonisb2.calls} draw calls against the standard ${standard.calls}`,
  );
  // The saddle, the nose plate and 54 tyre lugs are real triangles, and
  // triangles are the axis this project spends. Draw calls are the one that
  // may not move.
  assert.ok(adonisb2.triangles > standard.triangles, 'the saddle and the lugs are real triangles');
});

test('machineLook resolves his entry and every other one', () => {
  assert.equal(machineLook('adonisb2'), ADONISB2_MACHINE_LOOK);
  assert.equal(machineLook('red-rider'), RED_RIDER_MACHINE_LOOK);
  assert.equal(machineLook('standard'), STANDARD_MACHINE_LOOK);
});

test('his machine builds on his rig, poses and disposes without throwing', () => {
  const rig = createRidingRig(ADONISB2_LOOK, ADONISB2_MACHINE_LOOK);
  rig.apply(createPose());
  rig.dispose();
});

/**
 * The lugs ride the tyre's own mesh.
 *
 * This is the whole justification for buying tyre geometry at all: an off-road
 * tread that arrived as its own mesh would be two more draw calls on a shadow
 * caster, and the cost test above would fail — but it would fail without
 * saying *why*, and the next person to want a detail on the tyre needs to know
 * that merging is the rule rather than an accident.
 */
test('the tyre lugs are merged into the tyre, not bolted beside it', () => {
  const plain = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  const knobby = createBlockoutEUC(ADONISB2_MACHINE_LOOK);
  try {
    const named = (euc: ReturnType<typeof createBlockoutEUC>): THREE.Mesh[] => {
      const found: THREE.Mesh[] = [];
      euc.group.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && object.name.startsWith('euc-tyre')) {
          found.push(object as THREE.Mesh);
        }
      });
      return found;
    };
    assert.equal(named(knobby).length, 1, 'the knobby tyre is still one mesh');

    const triangles = (mesh: THREE.Mesh): number => (
      (mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count) / 3
    );
    const extra = triangles(named(knobby)[0]!) - triangles(named(plain)[0]!);
    const lugs = ADONISB2_MACHINE_LOOK.tyre?.lugs;
    assert.ok(lugs, 'his tyre carries a lug set');
    assert.equal(
      extra,
      lugs.count * lugs.rows.length * 12,
      'every lug is twelve triangles of box and they all landed',
    );
  } finally {
    knobby.dispose();
    plain.dispose();
  }
});

/**
 * The rings under the face are evenly ruled — the invariant the whole nose
 * rests on.
 *
 * `MachinePatch.skew` and every patch height are **ring indices**, because
 * `patchGeometry` shears in `v`. A profile whose rings crowd together therefore
 * shears less per authored unit where they crowd, and the first version of this
 * shell went from 68 mm between rings to 30 mm exactly where the eyes sit: one
 * brow came back from the capture three times thicker at one end than the
 * other and read as a solid black mass over half the plate.
 *
 * So this is not a shape preference to be tidied away by a later detail pass.
 * Any ring inserted into the face's span has to keep the spacing uniform, or
 * every skew on the plate silently changes meaning.
 */
test("the rings under Adonisb2's face are evenly spaced", () => {
  const profile = ADONISB2_MACHINE_LOOK.shell.profile;
  assert.ok(profile, 'his machine needs its own cosmetic shell profile');

  const inFace = profile
    .map((ring) => ring.y)
    .filter((y) => y >= FACE_BOTTOM - 0.080 && y <= FACE_TOP + 0.020);
  assert.ok(inFace.length >= 5, `only ${inFace.length} rings carry the face`);

  const gaps = inFace.slice(1).map((y, i) => y - inFace[i]!);
  for (const gap of gaps) {
    assert.ok(
      Math.abs(gap - gaps[0]!) < 1e-9,
      `ring spacing under the face varies: ${gaps.map((g) => g.toFixed(3)).join(', ')}`,
    );
  }

  // And the face really is inside that zone, or the uniformity above is a
  // property of rings nothing uses.
  assert.ok(inFace[0]! <= FACE_BOTTOM, 'the evenly ruled zone starts below the plate');
  assert.ok(inFace[inFace.length - 1]! >= FACE_TOP, 'it ends above the plate');
});

/**
 * Both eyes slant **down toward the centre** — angry, not worried.
 *
 * Sampled off the built trim mesh rather than read back off the look, because
 * the defect this guards against is not a wrong number: it is the mirror. A
 * span authored from its outboard end back toward the centre runs backwards in
 * parameter space, so the shear has to flip sign with it, and the one time
 * this project got that wrong it shipped a whole milestone with one chest
 * chevron drawn inside-out (`render/blockoutKit.ts`). Here the same slip would
 * tip one eye up and the other down, and every capture that framed the machine
 * square-on would show a face that looked *almost* right.
 *
 * The lash is found by colour and place: near-black, proud of the nose, and in
 * the band the eyes occupy. Nothing else on the machine is all three — the
 * eyebrows share the ink but sit well above this window, which the test after
 * this one is about.
 */
test("both of Adonisb2's eyes drop toward the centre", () => {
  const euc = createBlockoutEUC(ADONISB2_MACHINE_LOOK);
  try {
    const trim = euc.group.getObjectByName('euc-accent') as THREE.Mesh;
    assert.ok(trim?.isMesh, 'the trim mesh is findable by name');
    const position = trim.geometry.getAttribute('position');
    const colour = trim.geometry.getAttribute('color');

    for (const side of [1, -1]) {
      let outerLowest = Infinity;
      let innerHighest = -Infinity;
      let outerSeen = 0;
      let innerSeen = 0;
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i) * side;
        const y = position.getY(i);
        // Near-black, on the nose, in the eyes' band. The V above the eyes
        // shares the ink and the place, so the inner sample is capped below
        // the height its arms can reach.
        if (colour.getX(i) > 0.02 || position.getZ(i) < 0.20) continue;
        if (x > 0.055 && x < 0.075 && y > 0.500 && y < 0.580) {
          outerSeen += 1;
          outerLowest = Math.min(outerLowest, y);
        }
        if (x > 0.006 && x < 0.020 && y > 0.500 && y < 0.540) {
          innerSeen += 1;
          innerHighest = Math.max(innerHighest, y);
        }
      }

      const name = side > 0 ? "the rider's left" : "the rider's right";
      assert.ok(outerSeen > 0, `no lash vertices sampled at ${name} outer corner`);
      assert.ok(innerSeen > 0, `no lash vertices sampled at ${name} inner corner`);
      assert.ok(
        innerHighest < outerLowest,
        `${name} eye rises toward the centre — inner reaches ${innerHighest.toFixed(4)} m `
          + `against an outer edge that starts at ${outerLowest.toFixed(4)} m. That is a `
          + 'worried face, and it means the mirrored span kept its shear sign.',
      );
    }
  } finally {
    euc.dispose();
  }
});

/**
 * The eyebrows are one mark and the lashes are another — the owner's
 * correction, pinned.
 *
 * The first build gave the plate a wide dark band above each eye *and* a heavy
 * V above that, and he read the result immediately: **two sets of eyebrows.**
 * In both references there is exactly one brow mark — a small steep arrow high
 * on the plate — and the dark near the eye is cartoon eyelashes, the eye's own
 * top edge darkened. The distinction is easy to lose the next time somebody
 * adjusts a height by a few millimetres, and it is the difference between a
 * face and a grille.
 *
 * **Asserted on the authored spans rather than on the built mesh, and that is
 * the honest level for it.** The three parts of an eye are separate patches
 * with different angular spans and different segment counts, so their vertices
 * never share a column; and every one of them is displaced by its own `lift`
 * along a normal that points partly upward over the shell's crown. Comparing
 * built heights across those differences produced a number that separated a
 * lid from a brow by four millimetres out of seventeen — which is a magic
 * threshold, not a property. The relationship being protected is a statement
 * about *spans*, and spans are what the look actually declares.
 *
 * The shear direction, which no amount of span arithmetic can express, is
 * checked against the built mesh by the test above.
 */
test("Adonisb2's lashes lie on his eyes and his eyebrows sit clear above them", () => {
  const { sclera, iris, pupil, lash } = ADONISB2_EYE;

  // A lid is part of the eye. A band whose top clears the white is a brow
  // standing over the eye, which is exactly what the owner caught on the first
  // build — "you made the lashes eyebrows".
  assert.ok(
    lash.from >= sclera.from && lash.to <= sclera.to,
    `the lash spans ${lash.from}–${lash.to} m against an eye of ${sclera.from}–${sclera.to} m. `
      + 'A lid darkens the eye\'s own top edge; a band standing over it is a second brow.',
  );

  // Nesting, which is the owner's second correction: the iris inside the eye
  // and the pupil inside the iris, in every direction. Heights compare
  // directly because `ADONISB2_EYE` states all four parts in one frame — the
  // whole reason it exists.
  for (const [name, part, host] of [
    ['iris', iris, sclera], ['pupil', pupil, iris],
  ] as const) {
    assert.ok(
      part.inner > host.inner && part.outer < host.outer
        && part.from > host.from && part.to <= host.to,
      `the ${name} spans ${part.inner}–${part.outer} m across and ${part.from}–${part.to} m up, `
        + `which is not inside its host's ${host.inner}–${host.outer} / ${host.from}–${host.to}`,
    );
  }

  // And the one real brow is clear above the lash, in open green.
  assert.ok(
    ADONISB2_BROW.from > lash.to + 0.006,
    `the eyebrow starts at ${ADONISB2_BROW.from} m against a lash ending at ${lash.to} m — `
      + 'they read as one dark mass rather than as two separate marks',
  );

  // It is also *small*. The mark in the mockup is a tenth of the plate's width;
  // the first build drew it at half, and a wide V above a dark band is the
  // second row of brows. Compared in metres off the centreline, which is the
  // frame the whole face is authored in.
  const arm = ADONISB2_BROW.outer - ADONISB2_BROW.inner;
  const eye = sclera.outer - sclera.inner;
  assert.ok(
    arm < eye * 0.25,
    `each eyebrow arm is ${(arm * 1000).toFixed(0)} mm against a ${(eye * 1000).toFixed(0)} mm `
      + 'eye — that is a brow row, not the arrow the references draw',
  );
});

/**
 * Every part of an eye sits at the eye's **angle**, not at the eye's *skew*.
 *
 * This is the owner's second correction, and it is the trap `MachinePatch.skew`
 * sets for anything built out of nested patches: the shear is measured across
 * a patch's *own* angular span, so handing the iris the sclera's 0.50 tilts it
 * by 0.50 across half the width — twice the angle — and its corners swing out
 * through the white on both sides. The numbers all looked right; they were the
 * eye's own.
 *
 * So the invariant is a *slope*: shear divided by span, equal for every part of
 * an eye. Read off the patches the look actually produces, which is where an
 * added part would go wrong.
 */
test("Adonisb2's iris, pupil and lash all sit at the eye's angle", () => {
  const eye = ADONISB2_MACHINE_LOOK.trim.patches.filter(
    (patch) => (patch.surface ?? 'shell') === 'shell'
      && patch.skew !== undefined
      && patch.from > 0.480
      // The eyebrow is a separate mark with its own, much steeper tilt.
      && patch.from < 0.545
      // One half of the face; the mirror carries the opposite sign by design.
      && patch.u1 < Math.PI / 2,
  );
  assert.equal(eye.length, 4, `expected sclera, iris, pupil and lash — found ${eye.length}`);

  const tilts = eye.map((patch) => patch.skew! / (patch.u1 - patch.u0));
  for (const tilt of tilts) {
    assert.ok(
      Math.abs(tilt - tilts[0]!) < 1e-9,
      `the parts of one eye tilt at ${tilts.map((t) => t.toFixed(3)).join(', ')} rings per `
        + 'radian. A part given the eye\'s skew rather than the eye\'s angle shears faster the '
        + 'narrower it is, and its corners come out through the white.',
    );
  }
});

/**
 * The saddle stays under a crouched rider — the same clearance Red Rider's
 * seat has to keep, and for the same reason: he stands on the pedals, so the
 * cushion is scenery between his legs and the deepest his hips reach is
 * `RIDER.hipHeight - crouchHipDrop`.
 */
test("Adonisb2's saddle keeps clear of the hips at a full crouch", () => {
  const top = ADONISB2_MACHINE_LOOK.top;
  assert.equal(top.kind, 'saddle', 'his machine carries the saddle');
  const crown = Math.max(...top.profile.map((ring) => ring.y));
  const hipsAtFullCrouch = RIDER.hipHeight - RIDER_BLOCKOUT.crouchHipDrop;
  assert.ok(
    crown <= hipsAtFullCrouch - 0.10,
    `saddle crown at ${crown} m against hips at ${hipsAtFullCrouch} m — under 0.10 m of clearance`,
  );
});

/**
 * "An obvious saddle" — the owner's words, pinned as geometry.
 *
 * The crown is capped by the clearance above, so the only way this seat can be
 * obvious is shape: it has to *emerge* from the shell rather than cap it, and
 * it has to be a seat's proportion rather than a lid's. Both halves are stated
 * here so a later pass that flattens it has to argue with a failing test.
 */
test("Adonisb2's saddle stands out of the shell rather than capping it", () => {
  const top = ADONISB2_MACHINE_LOOK.top;
  const profile = ADONISB2_MACHINE_LOOK.shell.profile;
  assert.equal(top.kind, 'saddle');
  assert.ok(profile);

  const shellTop = Math.max(...profile.map((ring) => ring.y));
  const crown = Math.max(...top.profile.map((ring) => ring.y));
  assert.ok(
    crown - shellTop >= 0.045,
    `only ${((crown - shellTop) * 1000).toFixed(0)} mm of saddle clears the shell's top face`,
  );

  // A neck: the lowest ring is narrower than the shell's crown, so the seat is
  // bolted onto a post rather than moulded into the body.
  const neck = top.profile.reduce((a, b) => (b.y < a.y ? b : a));
  const shellCrown = profile.reduce((a, b) => (b.y > a.y ? b : a));
  assert.ok(
    neck.halfWidth < shellCrown.halfWidth,
    'the saddle meets the shell at least as wide as the crown — that is a lid, not a seat',
  );

  // And a seat's proportion. Longer than Red Rider's, which is the shape
  // difference between a perch and something you would actually sit on.
  const length = (ring: { readonly halfDepth: number }): number => ring.halfDepth * 2;
  const seatLength = Math.max(...top.profile.map(length));
  const redSaddle = RED_RIDER_MACHINE_LOOK.top;
  assert.equal(redSaddle.kind, 'saddle');
  assert.ok(
    seatLength > Math.max(...redSaddle.profile.map(length)),
    'his saddle is no longer than Red Rider\'s perch',
  );

  // The tail kicks: the top rings slide rearward.
  const tail = top.profile.reduce((a, b) => (b.y > a.y ? b : a));
  assert.ok((tail.z ?? 0) < -0.02, 'the saddle tail does not kick back');
});

/**
 * The status light keeps its dark bezel — §19.7's rule, honoured cheaply.
 *
 * His shell is already dark, so this costs nothing, and that is exactly why it
 * has to be asserted rather than assumed: the painter's rear-spine band and
 * the light's own seat are authored in different files, and only the built
 * mesh knows whether they still agree. Sampled the same way Red Rider's is.
 */
test("his livery paints the shell dark behind the status light", () => {
  const euc = createBlockoutEUC(ADONISB2_MACHINE_LOOK);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');

    let sampled = 0;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (position.getZ(i) < -0.15 && Math.abs(position.getX(i)) < 0.07
        && y > 0.42 && y < 0.556) {
        sampled += 1;
        assert.ok(
          colour.getX(i) < 0.45,
          `bezel vertex ${i} keeps a multiplier of ${colour.getX(i)} — the ladder would `
            + 'sit on unpainted bodywork',
        );
      }
    }
    assert.ok(sampled > 0, 'no shell vertices behind the status light were sampled');
  } finally {
    euc.dispose();
  }
});

/**
 * Every mark on the plate stays on the plate.
 *
 * The face is eight patches authored in millimetres and turned into radians by
 * one inversion, and an eye whose span leaves the plate is a black shape
 * floating on the bodywork — which at chase distance is not obviously a defect
 * at all, just an ugly machine.
 *
 * Measured against the *plate as built* rather than against the heights it was
 * authored at, because a patch's `lift` runs along the surface normal, and the
 * normal over the shell's top chamfer points partly upward: the plate's top
 * edge stands 16 mm higher than the 0.566 m it is written at. Comparing marks
 * to authored numbers would fail on geometry that is perfectly correct. The
 * plate is the green one, and it is the only green thing proud of the nose
 * above the lamps.
 */
test("nothing on Adonisb2's face hangs off the plate", () => {
  const euc = createBlockoutEUC(ADONISB2_MACHINE_LOOK);
  try {
    const trim = euc.group.getObjectByName('euc-accent') as THREE.Mesh;
    const position = trim.geometry.getAttribute('position');
    const colour = trim.geometry.getAttribute('color');

    const plate = { top: -Infinity, bottom: Infinity, widest: 0, seen: 0 };
    const marks = { top: -Infinity, bottom: Infinity, widest: 0, seen: 0 };
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (position.getZ(i) < 0.20 || y < FACE_BOTTOM - 0.010) continue;
      const green = colour.getY(i) > colour.getX(i) * 2;
      const into = green ? plate : marks;
      into.seen += 1;
      into.top = Math.max(into.top, y);
      into.bottom = Math.min(into.bottom, y);
      into.widest = Math.max(into.widest, Math.abs(position.getX(i)));
    }

    assert.ok(plate.seen > 0, 'no plate vertices sampled');
    assert.ok(marks.seen > 0, 'no face marks sampled');
    assert.ok(
      marks.top < plate.top,
      `a face mark reaches ${marks.top.toFixed(4)} m against a plate ending at `
        + `${plate.top.toFixed(4)} m`,
    );
    assert.ok(
      marks.bottom >= plate.bottom - 1e-6,
      `a face mark reaches ${marks.bottom.toFixed(4)} m, under the plate at `
        + `${plate.bottom.toFixed(4)} m`,
    );
    assert.ok(
      marks.widest < plate.widest,
      `a face mark reaches ${marks.widest.toFixed(4)} m from the centreline against a plate `
        + `${plate.widest.toFixed(4)} m wide`,
    );
  } finally {
    euc.dispose();
  }
});
