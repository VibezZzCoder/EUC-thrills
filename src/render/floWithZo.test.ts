/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import { loftGeometry, loftPoint, tintOver, vAtHeight } from './blockoutKit.ts';
import { createPlaceholderRider } from './rider.ts';
import { createRidingRig } from './ridingRig.ts';
import { createGhostRider } from './ghostRider.ts';
import { STANDARD_MACHINE_LOOK } from './machineLook.ts';
import { measureObject } from './renderCost.ts';
import { COOL_RIDER_LOOK, PLAYABLE_RIDER_LOOKS } from './riderLook.ts';
import {
  FLO_BAND_FRONT_STOP,
  FLO_BAND_TOP,
  FLO_BOOT_TOP,
  FLO_CUP_BOTTOM,
  FLO_CUP_SHADE,
  FLO_CUP_TOP,
  FLO_GUARD_SHADE,
  FLO_GUARD_TOP,
  FLO_WITH_ZO_LOOK,
} from './floWithZoLook.ts';

/**
 * FloWithZo's look — M34 Phase 1, and what only the built rig knows.
 *
 * The captures and the blind gauntlet settle what a picture is good at: that
 * the suit reads silver, that the lid is a dark bronze dome, that the guards
 * are large. What a picture is bad at is what this file asserts.
 *
 * **The band's handedness is the case that would ship wrong in silence.**
 * PHOTO 2 is a rear view, so image-right is the rider's right, and the
 * research map for this milestone read it the other way round before the plan
 * corrected it (`docs/PLANS.md` §34.2). Rider-left is +X, `paint.torso` is
 * handed no side and reads the vertex's own signed `x`, and a mirrored band is
 * entirely plausible in code review — so the multiplier is measured on the
 * built torso at the flanks rather than argued about.
 *
 * **The second is the knee hinge.** A guard spans a joint, a joint is two
 * bones, and a bending knee opens the halves on the side the camera sees. The
 * limb beneath the cup is painted to the cup's own value, and on him "the
 * cup's own value" is the accent white times a scalar — so the two must be
 * shown equal by construction rather than kept in step by two numbers.
 */

const HIS = FLO_WITH_ZO_LOOK;
const SUIT = new THREE.Color(BLOCKOUT_COLOURS.floWithZoSilver);

test('his replay keeps the bulky brace on both leg bones without adding live shadows', () => {
  const rider = createPlaceholderRider(HIS);
  const ghost = createGhostRider(HIS);
  const disposed: number[] = [];
  try {
    for (const side of ['left', 'right']) for (const bone of ['thigh', 'knee']) {
      const name = `rider-${bone}-pad-${side}`;
      const live = rider.root.getObjectByName(name) as THREE.Mesh;
      const replay = ghost.group.getObjectByName(`ghost-${name}`) as THREE.Mesh;
      assert.ok(live?.isMesh && replay?.isMesh, `${name}: missing brace`);
      assert.equal(live.castShadow, false, `${name}: added a live shadow pass`);
      const host = ghost.group.getObjectByProperty('uuid', replay.userData.ghostMergedInto) as THREE.Mesh;
      assert.ok(host?.isMesh && host.visible, `${name}: the replay lost its armour silhouette`);
      const allocation = disposed.push(0) - 1;
      host.geometry.addEventListener('dispose', () => { disposed[allocation]! += 1; });
      const vertices = host.geometry.getAttribute('position');
      const panel = replay.geometry.getAttribute('position');
      // The real panel's entire outline must survive in the visible bone mesh.
      // These panels and their bone share a local frame.
      for (let i = 0; i < panel.count; i += 1) {
        let found = false;
        for (let j = 0; j < vertices.count; j += 1) {
          if (vertices.getX(j) === panel.getX(i) && vertices.getY(j) === panel.getY(i)
            && vertices.getZ(j) === panel.getZ(i)) { found = true; break; }
        }
        assert.ok(found, `${name}: silhouette vertex ${i} missing from visible geometry`);
      }
      assert.equal(replay.castShadow, false, `${name}: the ghost casts a shadow`);
      assert.equal(replay.geometry.getAttribute('position').count, live.geometry.getAttribute('position').count);
    }
    assert.equal(ghost.group.getObjectByName('ghost-rider-elbow-pad-left')?.visible, false);
    assert.equal(ghost.group.getObjectByName('ghost-rider-face')?.visible, false);
    assert.ok(ghost.drawCalls <= 26, 'the brace exceeds the existing ghost budget');
  } finally {
    rider.dispose();
    ghost.dispose();
  }
  assert.deepEqual(disposed, [1, 1, 1, 1], 'a merged replay buffer leaked or was disposed twice');
});

/** Walk a built rig and hand back every mesh in it. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

/** Hue in degrees, for the separation checks. */
function hue(hex: number): number {
  const { h } = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });
  return h * 360;
}

test('he costs no more than Cool Rider — meshes and draw calls both', () => {
  // Parity is the roster rule (`redRider.test.ts` holds it for calls across
  // the whole roster); this states his own numbers so a later edit that adds
  // a mesh "for the guards" is told the guards already live in two buffers,
  // one per bone, and that the room for them came from having no pack, no
  // straps and no shoulder group at all.
  const rows = [COOL_RIDER_LOOK, HIS].map((look) => {
    const rider = createPlaceholderRider(look);
    try {
      const cost = measureObject(rider.root);
      return { id: look.id, meshes: cost.meshes.length, calls: cost.totalDrawCalls, triangles: cost.totalTriangles };
    } finally {
      rider.dispose();
    }
  });
  const [cool, him] = rows as [typeof rows[0], typeof rows[0]];
  console.log(
    `${him.id} meshes ${him.meshes} calls ${him.calls} triangles ${him.triangles}`
      + ` | ${cool.id} meshes ${cool.meshes} calls ${cool.calls} triangles ${cool.triangles}`,
  );
  assert.ok(him.meshes <= cool.meshes, `${him.meshes} meshes against Cool Rider's ${cool.meshes}`);
  assert.ok(him.calls <= cool.calls, `${him.calls} draw calls against Cool Rider's ${cool.calls}`);

  // **58 unarmed is the hard ceiling, not a target** (`docs/PLANS.md` §34.3
  // fact 3). The quad reserve is a max over sums across a seated subset, so at
  // 61 armed he displaces a 60 in the worst four and
  // `renderCost.test.ts:476`'s headroom goes 44 → 40 with nothing able to
  // regenerate it — a budget conversation with the owner, not a test edit.
  // The paddle costs two calls on top of this number.
  const rig = createRidingRig(HIS, STANDARD_MACHINE_LOOK);
  try {
    rig.apply(createPose());
    const measured = measureObject(rig.group);
    console.log(`${HIS.id} riding rig, unarmed: ${measured.totalDrawCalls} calls, ${measured.totalTriangles} triangles`);
    assert.ok(measured.totalDrawCalls <= 58, `${measured.totalDrawCalls} draw calls unarmed on the riding rig`);
  } finally {
    rig.dispose();
  }
});

test('he is an eighth look and not a recoloured one', () => {
  // M22's rule for the roster he joins, over all five material roles: a set of
  // assets required to differ must be asserted to differ. Two existing files
  // already walk the roster the other way (`wheelInMotion.test.ts:139`,
  // `drunkard.test.ts:172`), so a reused hex turns *their* tests red and this
  // one says why.
  const others = PLAYABLE_RIDER_LOOKS.filter((look) => look.id !== HIS.id);
  for (const role of ['body', 'accent', 'head', 'face', 'gear'] as const) {
    for (const other of others) {
      assert.notEqual(HIS.materials[role].colour, other.materials[role].colour, `his ${role} is ${other.id}'s ${role}`);
    }
  }

  // His identity colour is the hem band's cyan, and the roster is crowded
  // between 177° and 214°. Six degrees is the separation Wheel in Motion's
  // blue is held to against Cool Rider's panel; the same bar, against every
  // neighbour on this arc.
  const his = hue(BLOCKOUT_COLOURS.floWithZoCyan);
  for (const [name, hex] of [
    ['maribelAqua', BLOCKOUT_COLOURS.maribelAqua],
    ['machineAdonisb2Teal', BLOCKOUT_COLOURS.machineAdonisb2Teal],
    ['wheelInMotionBlue', BLOCKOUT_COLOURS.wheelInMotionBlue],
  ] as const) {
    assert.ok(
      Math.abs(his - hue(hex)) >= 6,
      `his cyan sits at ${his.toFixed(0)}°, within six degrees of ${name}'s ${hue(hex).toFixed(0)}°`,
    );
  }

  // The value floor, the Drunkard's rule (`drunkard.test.ts:191`): a real
  // black garment in sun is a mid-dark grey, and below near-black there is
  // nowhere for relief to go.
  assert.ok(
    ((BLOCKOUT_COLOURS.floWithZoGear >> 16) & 0xff) >= 60,
    'his gear black is under the value floor',
  );

  // And the direction rule that makes a sheet unnecessary: every accent he
  // wears is darker than the suit in every channel, so all of it is reached by
  // painting down from one ground (`docs/PLANS.md` §34.3 fact 9).
  for (const [name, hex] of [
    ['panel', BLOCKOUT_COLOURS.floWithZoPanel],
    ['gear', BLOCKOUT_COLOURS.floWithZoGear],
    ['cyan', BLOCKOUT_COLOURS.floWithZoCyan],
    ['gold', BLOCKOUT_COLOURS.floWithZoGold],
  ] as const) {
    const tint = tintOver(BLOCKOUT_COLOURS.floWithZoSilver, hex);
    for (const channel of tint) {
      assert.ok(channel <= 1 + 1e-9, `the ${name} tint paints up from the suit — it would need a material`);
    }
  }
});

test("his lid is the roster's road shell: nothing leaves it, one sunk visor", () => {
  // The owner's two look passes on the last rider (2026-09-01): an off-road
  // lid built as volumes leaving the shell read as a snout (*"it's like... a
  // pig!"*), and colour hung on as lifted patches read as *"yellow panels
  // protruding"*. So the head mesh may stand no further off its own rings than
  // a patch does; the aperture holds one sunk visor; nothing is bolted on.
  assert.equal(HIS.extras.length, 0, "something is bolted onto him — the lid's shape is the profile's");
  const rider = createPlaceholderRider(HIS);
  try {
    // The neck carries two unnamed casting meshes — the collar gaiter and the
    // head; the head is the one that reaches the crown.
    const head = rider.neck.children.find((child) => {
      if ((child as THREE.Mesh).isMesh !== true || child.name !== '') return false;
      const geometry = (child as THREE.Mesh).geometry;
      geometry.computeBoundingBox();
      return geometry.boundingBox!.max.y > 0.30;
    }) as THREE.Mesh;
    assert.ok(head, 'the head mesh is missing');
    const shell = HIS.profiles.head;
    const point = new THREE.Vector3();
    // How far a vertex stands off the shell's own surface in its direction:
    // the shell's radius at that height and (nearly) that polar angle, against
    // the vertex's own — `wheelInMotion.test.ts:464`'s method.
    const standOff = (x: number, y: number, z: number): number => {
      const v = vAtHeight(shell, y);
      const angle = Math.atan2(z, x);
      let nearest = Infinity;
      let radius = 0;
      for (let k = 0; k < 96; k += 1) {
        loftPoint(shell, (k / 96) * Math.PI * 2, v, point);
        const gap = Math.abs(Math.atan2(
          Math.sin(Math.atan2(point.z, point.x) - angle),
          Math.cos(Math.atan2(point.z, point.x) - angle),
        ));
        if (gap < nearest) {
          nearest = gap;
          radius = Math.hypot(point.x, point.z);
        }
      }
      return Math.hypot(x, z) - radius;
    };
    const position = head.geometry.getAttribute('position');
    let proudest = 0;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      // Between the base rim and the crown taper — where a chin bar, a peak or
      // a spoiler would leave the shell.
      if (y < 0.08 || y > 0.31) continue;
      proudest = Math.max(proudest, standOff(position.getX(i), y, position.getZ(i)));
    }
    assert.ok(
      proudest < 0.025,
      `the head mesh stands ${(proudest * 1000).toFixed(0)} mm off its shell — that is a volume, not a patch`,
    );
    // He carries no sheet at all, so the shell's colour is the material's.
    assert.equal((head.material as THREE.MeshStandardMaterial).map, null, 'the shell carries a map');
  } finally {
    rider.dispose();
  }

  const face = HIS.panels.face!;
  assert.equal(face.patches.length, 1, 'the aperture holds one visor');
  const visor = face.patches[0]!;
  assert.ok((visor.sink ?? 0) < 0, 'the visor is not sunk into the aperture');
  assert.equal(visor.art, undefined, 'the visor wears a page — he has no sheet');
  // And nothing stands off the back of the shell — the owner's third pass on
  // the last rider saw a rear spoiler as *"a bump on the back protruding"*.
  assert.ok(HIS.panels.head.every((patch) => patch.anchor !== 'back'), 'a feature stands off the back of the shell');

  // The split PHOTO 1 carries: a very large visor, but a shell that is still a
  // crown above it and a jaw below.
  const shell = HIS.profiles.head;
  const shellHeight = shell[shell.length - 1]!.y - shell[0]!.y;
  const share = (visor.to - visor.from) / shellHeight;
  assert.ok(share >= 0.30 && share <= 0.38, `the visor is ${(share * 100).toFixed(0)}% of the shell's height`);

  // **Where the aperture sits, not only how tall it is** — r1's finding 1c.
  // The share was right in the first cut and the placement was not: the visor
  // was cut with a 35.5 % brow over it, and a shell with that little crown over
  // an ear-to-ear eyeport reads as a letterbox wraparound shield rather than as
  // a road lid. PHOTO 1's column measures brow 50.0 %, shield 40.4 %, shell
  // below 9.6 %; the aperture moved down 52 mm and did not shrink.
  const brow = (shell[shell.length - 1]!.y - visor.to) / shellHeight;
  const jawBand = (visor.from - shell[0]!.y) / shellHeight;
  assert.ok(brow >= 0.45, `the brow is ${(brow * 100).toFixed(0)}% of the shell — PHOTO 1's is 50%`);
  // **0.12 and not 0.05 — r2's finding 1a, the round's blocker.** The floor was
  // written against the whole band under the visor, and the base rim eats the
  // bottom of it: at 12.1 % of shell below the aperture with a 6.2 % rim inside
  // that, only 5.9 % was ever *shell-coloured*, and two rounds of helmet critics
  // read the lid as having no chin bar. So the floor moves up and a second one
  // is added under the part that actually reads as a jaw — the band between the
  // rim's top and the visor's bottom, in the shell's own colour, which PHOTO 1
  // measures at 11–18 % of the helmet's height.
  assert.ok(jawBand >= 0.12, `only ${(jawBand * 100).toFixed(0)}% of shell under the visor — it runs off the jaw`);
  const rim = HIS.panels.head.find((each) => each.u1 - each.u0 >= Math.PI * 2 - 1e-6);
  assert.ok(rim, 'the base rim is missing — the shell has to end somewhere');
  const chin = (visor.from - rim.to) / shellHeight;
  assert.ok(chin >= 0.10, `the pale chin band is ${(chin * 100).toFixed(0)}% of the shell — the rim has eaten the jaw`);

  // The jaw holds its width: the ring at 10 % of the shell's height is at
  // least three quarters of the widest, or the head is a bulb on a stalk from
  // the chase camera.
  const widest = Math.max(...shell.map((ring) => ring.halfWidth));
  const at = (y: number): number => {
    for (let i = 1; i < shell.length; i += 1) {
      if (shell[i]!.y < y) continue;
      const lower = shell[i - 1]!;
      const upper = shell[i]!;
      return lower.halfWidth + (upper.halfWidth - lower.halfWidth) * ((y - lower.y) / (upper.y - lower.y));
    }
    return shell[shell.length - 1]!.halfWidth;
  };
  const jaw = at(shell[0]!.y + shellHeight * 0.10);
  assert.ok(jaw / widest >= 0.72, `the jaw is ${(100 * jaw / widest).toFixed(0)}% of the shell's widest`);
});

test("the band is cyan on his right hip and gold on his left, the rear photograph's way", () => {
  // PHOTO 2 is a rear view: image-right is the rider's right, cyan `#0aa1b0`
  // at x 797–828 is on his RIGHT hip and gold `#ecba70` at x 745–790 on his
  // LEFT. Rider-left is +X here, so cyan is the negative half. Measured at the
  // flanks (`|z| < 0.06`), where the split at the spine cannot be confused
  // with the seam column at the front.
  const cyan = tintOver(BLOCKOUT_COLOURS.floWithZoSilver, BLOCKOUT_COLOURS.floWithZoCyan);
  const gold = tintOver(BLOCKOUT_COLOURS.floWithZoSilver, BLOCKOUT_COLOURS.floWithZoGold);
  const rider = createPlaceholderRider(HIS);
  try {
    // The torso is unnamed; it is the largest casting mesh on the pelvis.
    const torso = rider.pelvis.children
      .filter((child) => (child as THREE.Mesh).isMesh === true && (child as THREE.Mesh).castShadow)
      .map((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        return { mesh, size: (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z) };
      })
      .reduce((biggest, row) => (row.size > biggest.size ? row : biggest)).mesh;
    const position = torso.geometry.getAttribute('position');
    const colour = torso.geometry.getAttribute('color');
    const close = (i: number, tint: readonly [number, number, number]): boolean => (
      Math.abs(colour.getX(i) - tint[0]) < 2e-2
        && Math.abs(colour.getY(i) - tint[1]) < 2e-2
        && Math.abs(colour.getZ(i) - tint[2]) < 2e-2
    );
    // Every banded vertex is asked which side it is on, rather than every
    // vertex in a height window being asked what colour it is: the seat loft
    // is merged into this same mesh and its top ring runs through the band's
    // heights at the band's own half-width, painted silver on purpose.
    let right = 0;
    let left = 0;
    let crest = 0;
    let cyanReach = 0;
    let goldReach = 0;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      // **A sash, not a ring** — r1's finding 4c. Every accent vertex is
      // behind the hem ring's flank pole: PHOTO 1's waist front is plain suit
      // (hue 28°, sat 8.9 %) and the only accent it shows from the front is the
      // tab on the hip crest, which is on the pole and still painted — so the
      // count below has to stay above zero or the gate has eaten the hips
      // along with the front.
      if (close(i, cyan) || close(i, gold)) {
        assert.ok(z < FLO_BAND_FRONT_STOP + 1e-6, `the band crosses the front at z ${z.toFixed(3)}`);
        if (z > -0.02) crest += 1;
      }
      if (close(i, cyan)) {
        assert.ok(x < 0, `cyan on his LEFT at x ${x.toFixed(3)} — the rear photograph puts it on his right`);
        assert.ok(y <= FLO_BAND_TOP + 1e-6, `cyan at y ${y.toFixed(3)} — nothing cyan crosses the chest`);
        if (x < -0.05) right += 1;
        cyanReach = Math.max(cyanReach, -x);
      } else if (close(i, gold)) {
        assert.ok(x > 0, `gold on his RIGHT at x ${x.toFixed(3)} — the rear photograph puts it on his left`);
        assert.ok(y <= FLO_BAND_TOP + 1e-6, `gold at y ${y.toFixed(3)} — the band is the hem's`);
        if (x > 0.05) left += 1;
        goldReach = Math.max(goldReach, x);
      }
    }
    // Counted by which hip they are on and not by a `z` window as r1 counted
    // them: the |x| > 50 mm test already separates a hip from the spine's own
    // columns (which stand at |x| ≈ 35 mm), and r2's finding 4d takes the gold
    // off the crest of his left hip by design, so a 60 mm flank window now
    // finds nothing gold at all and would fail for the reason it was built.
    assert.ok(right > 4 && left > 4, `only ${right} right and ${left} left band vertices at the hips`);
    assert.ok(crest > 0, 'the depth gate took the hip crest with the front — PHOTO 1 puts teal on it');
    // **And the asymmetry itself, which is what r2's 4d and 6b together ask
    // for**: read as a rear view PHOTO 2 runs the cyan out to his right hip's
    // silhouette and stops the gold ≈ 13 % short of his left. A symmetric band
    // is the thing this replaces, so it is asserted rather than left to a
    // constant nobody reads.
    assert.ok(
      cyanReach > goldReach + 0.010,
      `the cyan reaches ${(cyanReach * 1000).toFixed(0)} mm and the gold ${(goldReach * 1000).toFixed(0)} mm`
        + ' — the sash is symmetric again',
    );
  } finally {
    rider.dispose();
  }
});

test('what shows through his knee hinge is the cup', () => {
  // M22's lesson, and the one place his brace differs mechanically from the
  // last rider's: the cup is a patch in the **accent** material at a scalar
  // shade, not an ink on the same ground the limb is. So "the limb beneath the
  // cup is the cup's own value" is only true if the limb's tint targets
  // `accent × FLO_CUP_SHADE` — which is exactly how it is authored, and this
  // is the measurement that says so on both bones and both sides.
  const thighCup = HIS.panels.thighPad!.patches.find((patch) => patch.anchor === 'front' && patch.to === FLO_CUP_TOP);
  const shinCup = HIS.panels.kneePad!.patches.find((patch) => patch.anchor === 'front' && patch.to === 0);
  assert.ok(thighCup && shinCup, 'both halves of the cup must exist');
  // **The cap is white, and that is r1's finding 3a.** It was authored at the
  // brace's black and the captures made it the darkest thing on the rider
  // (0.30 × the trouser) where PHOTO 1's kneecap shell is the *lightest* piece
  // on the leg (0.96 × the trouser above it). The black did not leave the
  // brace, it went where the photograph has it: the strap under the cap, the
  // strut, the bosses — and the limb the guard closes over, which is the half
  // of this test that did not move.
  assert.equal(thighCup.shade, FLO_GUARD_SHADE, 'the thigh half of the cap is not the guard white');
  assert.equal(shinCup.shade, FLO_GUARD_SHADE, 'the shin half of the cap is not the guard white');
  // And the brace is still one black and one white with nothing in between —
  // four shades on one brace is the failure this scalar exists to prevent.
  const brace = [...HIS.panels.thighPad!.patches, ...HIS.panels.kneePad!.patches];
  for (const patch of brace) {
    assert.ok(
      patch.shade === FLO_GUARD_SHADE || patch.shade === FLO_CUP_SHADE,
      `a brace patch sits at ${String(patch.shade)} — the brace is one black and one white`,
    );
  }
  // **Five and not six since r2's finding 3d.** The outboard knee plate left
  // the dark list: all four outboard patches sat at the cup's value where
  // PHOTO 2 makes that plate the *lightest* element on the whole leg (L 165
  // against a shell of 158–169), with the dark living in the strut behind it.
  // What stays dark is the strut, the two shin bosses and the two straps.
  assert.equal(
    brace.filter((patch) => patch.shade === FLO_CUP_SHADE).length,
    5,
    "the brace's dark parts are the hinge strut, the two shin bosses and the two straps",
  );
  const shell = HIS.panels.thighPad!.patches.find((patch) => patch.shade === FLO_GUARD_SHADE && patch !== thighCup);
  const plate = HIS.panels.kneePad!.patches.find((patch) => patch.shade === FLO_GUARD_SHADE && patch.to === FLO_CUP_BOTTOM);
  assert.ok(shell && plate, 'the shell and the plate must both exist');
  assert.ok(shell.from < thighCup.to && plate.to >= shinCup.from - 1e-9, 'the white armour does not meet the cup on both bones');

  const cup = new THREE.Color(BLOCKOUT_COLOURS.floWithZoGuard).multiplyScalar(FLO_CUP_SHADE);
  const nearness = (a: THREE.Color, b: THREE.Color): number => {
    const scale = Math.max(b.r, b.g, b.b, 1e-4);
    return Math.hypot((a.r - b.r) / scale, (a.g - b.g) / scale, (a.b - b.b) / scale);
  };
  for (const [profile, painter, inside] of [
    [HIS.profiles.thigh, HIS.paint?.thigh, (y: number) => y <= -RIDER_BLOCKOUT.thighLength * FLO_GUARD_TOP],
    [HIS.profiles.shin, HIS.paint?.shin, (y: number) => y >= FLO_CUP_BOTTOM],
  ] as const) {
    assert.ok(painter, 'the leg painter is missing');
    for (const side of [-1, 1]) {
      const geometry = loftGeometry(profile, { radialSegments: 18 });
      painter(geometry, side);
      const position = geometry.getAttribute('position');
      const colour = geometry.getAttribute('color');
      let sampled = 0;
      let matching = 0;
      for (let i = 0; i < position.count; i += 1) {
        if (!inside(position.getY(i))) continue;
        sampled += 1;
        const painted = new THREE.Color(
          SUIT.r * colour.getX(i),
          SUIT.g * colour.getY(i),
          SUIT.b * colour.getZ(i),
        );
        if (nearness(painted, cup) < 0.06) matching += 1;
      }
      geometry.dispose();
      assert.ok(sampled > 0, 'no vertices lie under the cup');
      assert.equal(matching, sampled, `${sampled - matching} of ${sampled} vertices under the cup are not cup-dark`);
    }
  }
});

test('his legs are painted in the direction the multiplier honours', () => {
  // Everything below the waist is one silver material painted **down** — the
  // guard's sleeve to the cup's value, the outer thigh to the panel grey. A
  // vertex tint may lift, but nothing on the limbs does, because the only
  // thing on him above the suit's value is the guards' own accent material.
  for (const [name, profile, painter] of [
    ['thigh', HIS.profiles.thigh, HIS.paint!.thigh!],
    ['shin', HIS.profiles.shin, HIS.paint!.shin!],
  ] as const) {
    for (const side of [-1, 1]) {
      const geometry = loftGeometry(profile, { radialSegments: 18 });
      painter(geometry, side);
      const colour = geometry.getAttribute('color');
      for (let i = 0; i < colour.count; i += 1) {
        for (const channel of [colour.getX(i), colour.getY(i), colour.getZ(i)]) {
          assert.ok(channel <= 1 + 1e-6, `a ${name} vertex paints up at ${channel.toFixed(4)}`);
        }
      }
      geometry.dispose();
    }
  }
});

test('the calf between the plates is a light shell, not a black sleeve', () => {
  // **r1's finding 6c, and the one the chase camera made.** The white plates
  // span 155° of the shin, front-and-outboard; the chase camera looks at the
  // other 205°, so what the player sees of the lower leg is the *limb's* paint,
  // not the guard's. Painted to the cup's value it measured 0.33–0.48 × the
  // suit in the chase frames, where PHOTO 2 — the same rear angle — gives
  // 0.64–0.83 ×, and the standing silhouette broke into three bands. This is
  // that window, asserted on the multiplier where the camera actually reads it:
  // below the cup, above the trainer's collar, all the way round.
  const cuff = -RIDER_BLOCKOUT.shinLength * FLO_BOOT_TOP;
  for (const side of [-1, 1]) {
    const geometry = loftGeometry(FLO_WITH_ZO_LOOK.profiles.shin, { radialSegments: 18 });
    FLO_WITH_ZO_LOOK.paint!.shin!(geometry, side);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    let sampled = 0;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y >= FLO_CUP_BOTTOM || y < cuff) continue;
      sampled += 1;
      for (const channel of [colour.getX(i), colour.getY(i), colour.getZ(i)]) {
        assert.ok(
          channel >= 0.60 && channel <= 0.90,
          `the calf sits at ${channel.toFixed(2)} × the suit — PHOTO 2's rear shin is 0.64–0.83 ×`,
        );
      }
    }
    geometry.dispose();
    assert.ok(sampled > 0, 'no vertices lie on the calf between the cup and the collar');
  }
});

test('he carries no sheet', () => {
  // The direction rule made one unnecessary (`docs/PLANS.md` §34.3 fact 9), so
  // this is `maribel.test.ts:742`'s census aimed at him by name: no material
  // may carry a map, and no geometry may have been folded onto a page, which
  // shows as texture coordinates that no longer span their own unit square.
  assert.equal(HIS.atlas, undefined, 'he declares an atlas');
  const rider = createPlaceholderRider(HIS);
  try {
    for (const mesh of meshesOf(rider.root)) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      assert.ok(material.map === null, `his ${mesh.name || '(unnamed)'} samples a texture`);
      const uv = mesh.geometry.getAttribute('uv');
      assert.ok(uv, `his ${mesh.name || '(unnamed)'} lost its texture coordinates`);
      let low = Infinity;
      let high = -Infinity;
      for (let i = 0; i < uv.count; i += 1) {
        low = Math.min(low, uv.getX(i), uv.getY(i));
        high = Math.max(high, uv.getX(i), uv.getY(i));
      }
      assert.ok(low < 1e-6 && high > 1 - 1e-6, `his ${mesh.name || '(unnamed)'} was folded onto a page`);
    }
  } finally {
    rider.dispose();
  }
});

test('the head casts and the visor does not', () => {
  // Rule 3 of the look file: `castShadow` is what the ghost draws, and the
  // silhouette the chase camera reads is the shell's. The visor lies on that
  // shell and carries no outline of its own, so it is the one part of the head
  // that may be dropped — which is what pays for the guards' second buffer.
  const rider = createPlaceholderRider(HIS);
  try {
    const head = rider.neck.children.find((child) => {
      if ((child as THREE.Mesh).isMesh !== true || child.name !== '') return false;
      const geometry = (child as THREE.Mesh).geometry;
      geometry.computeBoundingBox();
      return geometry.boundingBox!.max.y > 0.30;
    }) as THREE.Mesh;
    assert.ok(head, 'the head mesh is missing');
    assert.equal(head.castShadow, true, 'the shell does not cast — the ghost would have no head');
    const face = rider.root.getObjectByName('rider-face') as THREE.Mesh;
    assert.ok(face, 'the visor mesh is missing');
    assert.equal(face.castShadow, false, 'the visor casts a shadow of a pane of glass');
  } finally {
    rider.dispose();
  }

  const ghost = createGhostRider(HIS);
  try {
    console.log(`${HIS.id} ghost: ${ghost.drawCalls} draw calls, ${ghost.triangles} triangles`);
    assert.ok(ghost.drawCalls <= 26, `${ghost.drawCalls} draw calls for a recording of him`);
  } finally {
    ghost.dispose();
  }
});
