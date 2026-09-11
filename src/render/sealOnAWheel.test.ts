/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import { loftGeometry, mergeGeometries, tintOver } from './blockoutKit.ts';
import { createPlaceholderRider } from './rider.ts';
import { createRidingRig } from './ridingRig.ts';
import { createGhostRider } from './ghostRider.ts';
import { STANDARD_MACHINE_LOOK } from './machineLook.ts';
import { measureObject } from './renderCost.ts';
import { COOL_RIDER_LOOK, PLAYABLE_RIDER_LOOKS } from './riderLook.ts';
import { SEAL_LID_INKS, SEAL_PRINT_GROUND, sealLidInkShares } from './sealAtlas.ts';
import { linearFromHex } from './inkKit.ts';
import {
  SEAL_CUP_BOTTOM,
  SEAL_ELBOW_BOTTOM,
  SEAL_ELBOW_TOP,
  SEAL_ELBOW_UPPER,
  SEAL_GARMENT_BAND,
  SEAL_GARMENT_HEM,
  SEAL_GARMENT_KNOT,
  SEAL_GARMENT_TAIL,
  SEAL_GARMENT_VISIBLE_BOTTOM,
  SEAL_KNOT_END,
  SEAL_ON_A_WHEEL_LOOK,
  SEAL_PACK_TOP,
  SEAL_RIM_TOP,
  SEAL_SHEET_LAYOUT,
  SEAL_SHELL_BOTTOM,
  SEAL_SHELL_TOP,
  SEAL_SLEEVE_HEM,
  SEAL_VISOR_FROM,
  paintSealBand,
} from './sealOnAWheelLook.ts';

/**
 * Seal on a Wheel's look — M35 Phase 1, and what only the built rig knows.
 *
 * The captures and the blind gauntlet settle what a picture is good at: that
 * the kit reads black, that the sweatshirt is the bright thing on his body,
 * that the lid is red. What a picture is bad at is what this file asserts.
 *
 * **The garment's handedness is the case that would ship wrong in silence.**
 * PHOTO 1 is a left-side profile with the mass hanging down his left rear hip
 * and PHOTO 3 a front three-quarter with the knot left of centre. Rider-left
 * is +X, the garment is a pelvis-mounted extra whose lofts carry their own `x`
 * and `z` offsets, and a mirrored build is entirely plausible in code review —
 * so the two volumes are measured on the built rig rather than argued about.
 *
 * **The second is the printing ground.** The lid's three colours are texels
 * over a material colour nobody can see, `inkOver` divides and clamps at one,
 * and a ground that drops below an ink does not fail: it renders the ink as
 * the ground and the red quietly becomes a light grey. That relation is
 * arithmetic between two tuning keys a future edit could move independently,
 * so it is a test and not a comment.
 *
 * **And the third is the direction every paint on him runs.** His ground is
 * the floor rather than the ceiling — the mirror of the last rider's problem —
 * so the roster's "everything paints down" rule cannot hold here. What holds
 * instead is the narrower one §35.4 states: a surface lighter than the kit
 * either owns a material or is reached by a **per-channel** ratio computed
 * from the two constants it runs between. A scalar above one on a near-black
 * base — a lift with three equal channels — is the thing that is never done,
 * because it is the one that cannot land on an authored colour.
 */

const HIS = SEAL_ON_A_WHEEL_LOOK;

/** Hue in degrees in three's own space — linear, which is what `getHSL` returns. */
function hue(hex: number): number {
  const { h } = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });
  return h * 360;
}

/**
 * Hue in degrees in **sRGB**, which is what a colour picker, a photograph and
 * `docs/PLANS.md` §35.2 all speak — and the space the reds have to be
 * separated in, because in linear the whole roster's red arc compresses into
 * 353.8–359.1° and nothing in it clears anything by five (`tuning.ts`, the
 * `sealHelmetRed` paragraph).
 */
function srgbHue(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  let h = 0;
  if (max === r) h = 60 * ((((g - b) / (max - min)) % 6) + 6) % 360;
  else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
  else h = 60 * ((r - g) / (max - min) + 4);
  return (h + 360) % 360;
}

/** sRGB saturation in HSV — the axis a red's identity survives a value change on. */
function srgbSaturation(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/** Relative luminance in linear light — the axis his whole kit is separated on. */
function luminance(hex: number): number {
  const colour = new THREE.Color(hex);
  return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
}

/** Walk a built rig and hand back every mesh in it. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

test('his replay keeps the knee shells on both leg bones without adding live shadows', () => {
  const rider = createPlaceholderRider(HIS);
  const ghost = createGhostRider(HIS);
  const disposed: number[] = [];
  try {
    for (const side of ['left', 'right']) for (const bone of ['thigh', 'knee']) {
      const name = `rider-${bone}-pad-${side}`;
      const live = rider.root.getObjectByName(name) as THREE.Mesh;
      const replay = ghost.group.getObjectByName(`ghost-${name}`) as THREE.Mesh;
      assert.ok(live?.isMesh && replay?.isMesh, `${name}: missing shell`);
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
    }
    // The straps and the visor are the two parts of him with no outline of
    // their own, and the ghost is where that shows: a strap is a band lying on
    // a body the ghost already draws, and the pack behind it carries the shape.
    assert.equal(ghost.group.getObjectByName('ghost-rider-jacket-panels')?.visible, false);
    assert.equal(ghost.group.getObjectByName('ghost-rider-face')?.visible, false);
    // And the two volumes that *are* the silhouette survive it. An all-black
    // rider in one flat ghost colour is an outline and nothing else, so a
    // replay without the sweatshirt and the pack is a different person.
    for (const name of ['ghost-rider-seal-garment', 'ghost-rider-seal-pack']) {
      assert.equal(ghost.group.getObjectByName(name)?.visible, true, `${name} is missing from the replay`);
    }
    assert.ok(ghost.drawCalls <= 26, `the shells exceed the existing ghost budget at ${ghost.drawCalls}`);
  } finally {
    rider.dispose();
    ghost.dispose();
  }
  assert.deepEqual(disposed, [1, 1, 1, 1], 'a merged replay buffer leaked or was disposed twice');
});

test('he costs no more than Cool Rider — meshes and draw calls both', () => {
  // Parity is the roster rule (`redRider.test.ts` holds it for calls across the
  // whole roster); this states his own numbers so a later edit that adds a mesh
  // "for the shells" is told where the room came from. He has no shoulder
  // group, no waist group, no collar patch, no sleeve panels and no elbow
  // group: the elbow is a swell in the forearm's own rings, and what that buys
  // is the two extras — the sweatshirt and the pack — that carry his outline.
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

  // **58 unarmed is the hard ceiling, not a target** (`docs/PLANS.md` §35.3
  // fact 4). The quad reserve is a max over sums across a seated subset, so at
  // 61 armed he displaces a 60 in the worst four and `renderCost.test.ts`'s
  // headroom bar goes 44 → 40 with nothing able to regenerate it — which is
  // the owner's authorized ceiling raise, not a test edit. The paddle costs
  // two calls on top of this number.
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

test('he is a ninth look and not a recoloured one', () => {
  // M22's rule for the roster he joins, over all six material roles: a set of
  // assets required to differ must be asserted to differ. Four existing files
  // already walk the roster the other way, so a reused hex turns *their* tests
  // red and this one says why.
  const others = PLAYABLE_RIDER_LOOKS.filter((look) => look.id !== HIS.id);
  for (const role of ['body', 'limbs', 'accent', 'head', 'face', 'gear'] as const) {
    for (const other of others) {
      assert.notEqual(HIS.materials[role].colour, other.materials[role].colour, `his ${role} is ${other.id}'s ${role}`);
    }
  }

  // **The lid's red is the tightest hue in the build, and it is separated in
  // sRGB because it cannot be separated in linear.** The roster's whole red
  // arc compresses into linear 353.8–359.1° — a 6.2° span holding five reds —
  // so a ≥ 5° bar in three's own space is one no red on this roster could
  // pass, his or anybody's. What is honestly his is the sRGB hue plus the
  // saturation he carries at it (`tuning.ts`, the key's own ruling).
  const red = BLOCKOUT_COLOURS.sealHelmetRed;
  for (const [name, hex] of [
    ['maribelCoral', BLOCKOUT_COLOURS.maribelCoral],
    ['redRiderHelmet', BLOCKOUT_COLOURS.redRiderHelmet],
  ] as const) {
    assert.ok(
      Math.abs(srgbHue(red) - srgbHue(hex)) >= 5,
      `his lid sits at sRGB ${srgbHue(red).toFixed(1)}°, within five degrees of ${name}'s ${srgbHue(hex).toFixed(1)}°`,
    );
    assert.notEqual(red, hex, `his lid's red is ${name}`);
  }
  assert.ok(
    srgbSaturation(red) >= 0.76,
    `his lid's red is ${srgbSaturation(red).toFixed(2)} saturated — §35.2 reads it at 0.78`,
  );
  console.log(
    `seal lid red: sRGB ${srgbHue(red).toFixed(1)}° S ${srgbSaturation(red).toFixed(2)} Ylin ${luminance(red).toFixed(3)}`
      + ` | linear hue ${hue(red).toFixed(1)}° against maribelCoral ${hue(BLOCKOUT_COLOURS.maribelCoral).toFixed(1)}°`
      + ` and redRiderHelmet ${hue(BLOCKOUT_COLOURS.redRiderHelmet).toFixed(1)}°`,
  );

  // The shoe's yellow, which does clear in both spaces: 57–60° is the one slot
  // between the two hi-vis yellows already on the roster (§35.2).
  const neon = BLOCKOUT_COLOURS.sealNeon;
  for (const [name, hex] of [
    ['copHiVis', BLOCKOUT_COLOURS.copHiVis],
    ['maribelHiVis', BLOCKOUT_COLOURS.maribelHiVis],
  ] as const) {
    assert.ok(Math.abs(srgbHue(neon) - srgbHue(hex)) >= 5, `his rand is within five sRGB degrees of ${name}`);
    assert.ok(Math.abs(hue(neon) - hue(hex)) >= 5, `his rand is within five linear degrees of ${name}`);
  }

  // **And it is pale, not lime — r2's §E 2.** Hue-filtered inside one frame,
  // PHOTO 1's sunlit sole reads p95 **S 0.31 at v 0.94** and the r2 rand read
  // p95 S 0.66 at v 0.73: double the saturation at two thirds the value, and
  // the within-frame ordering flipped with it — the photograph's sole peaks
  // *above* its own garment, the r2 rand peaked below its own sash. The key
  // had taken the target render's saturation (`research/reference-measure.md`
  // records the photographs at S 0.34 and the target at 0.60–0.77) rather than
  // the photographs'. The hue is held to a tenth of a degree so both five-degree
  // clearances above are untouched, and the ceiling is §35.2's own sentence:
  // the sweatshirt is the brightest thing on the body, so the rand's linear
  // luminance stays under it.
  const neonMax = Math.max((neon >> 16) & 0xff, (neon >> 8) & 0xff, neon & 0xff) / 255;
  console.log(
    `seal rand: sRGB ${srgbHue(neon).toFixed(1)}° S ${srgbSaturation(neon).toFixed(3)}`
      + ` V ${neonMax.toFixed(3)} Ylin ${luminance(neon).toFixed(3)}`
      + ` against the sweatshirt's ${luminance(BLOCKOUT_COLOURS.sealGarment).toFixed(3)}`,
  );
  assert.ok(
    srgbSaturation(neon) <= 0.58,
    `his rand is ${srgbSaturation(neon).toFixed(3)} saturated — r2 shipped 0.727 and PHOTO 1's sunlit sole reads 0.31`,
  );
  assert.ok(
    neonMax >= 0.87,
    `his rand's value is ${neonMax.toFixed(3)} — a pale yellow in sun does not sit under 0.87`,
  );
  assert.ok(
    luminance(neon) < luminance(BLOCKOUT_COLOURS.sealGarment),
    'his rand is brighter than his sweatshirt — §35.2 makes the garment the brightest thing on the body',
  );

  // The skin, and it is the roster's first fair one: paler and cooler than
  // every tan already here, which is what three stills of a real person give
  // against a render that tanned him (§35.2).
  const skin = BLOCKOUT_COLOURS.sealSkin;
  for (const [name, hex] of [
    ['coolSkin', BLOCKOUT_COLOURS.coolSkin],
    ['trollinaSkin', BLOCKOUT_COLOURS.trollinaSkin],
    ['copSkin', BLOCKOUT_COLOURS.copSkin],
    ['drunkardSkin', BLOCKOUT_COLOURS.drunkardSkin],
  ] as const) {
    assert.notEqual(skin, hex, `his skin is ${name}'s`);
    assert.ok(srgbHue(skin) < srgbHue(hex), `his skin at ${srgbHue(skin).toFixed(1)}° is warmer than ${name}'s`);
  }

  // **And it stands where his own garment puts it.** A skin key cannot be
  // judged against the roster — every other rider stands in different kit —
  // so r1's piece 4 judged it the only way a photograph allows: as a ratio
  // inside one frame. PHOTO 1's sunlit frame gives forearm ÷ garment 0.77–0.93
  // and upper arm ÷ garment 1.28–1.55, against **0.696** here and 0.48 in the
  // rendered pixels. The value moved and nothing else did: hue and saturation
  // in HSV are the same to a rounding step, because the warm half of that
  // finding is a shade-lit read and was not confirmed (§E 8).
  const skinToGarment = luminance(skin) / luminance(BLOCKOUT_COLOURS.sealGarment);
  assert.ok(
    Math.abs(skinToGarment - 0.85) <= 0.03,
    `his skin is ${skinToGarment.toFixed(3)} of his sweatshirt — PHOTO 1's own frame gives 0.77 to 1.55`,
  );
  // **And the chroma came up in r3's §E 4a, with the hue still held.** The
  // saturation half is the one axis of this key three rounds agree on against
  // the shipped value: §35.2's authoring row asks 0.30–0.35 and the stills give
  // **0.22–0.26** measured in-frame (PHOTO 2 0.26 at 10°, PHOTO 1 0.22 at 3°,
  // PHOTO 3 0.23 at 12°), so 0.203 sat under even the unadjusted floor. What it
  // cost on screen is the reason it is a finding and not a preference: a
  // red-dominant albedo under a blue ambient loses its green channel fastest,
  // so the shaded forearms rendered **S 0.05–0.07 at hue 320–324** — a
  // grey-mauve where the only large warm area on an all-black rider should be.
  // The hue half is r1 §E 8 and r2 4.4 refuted a third time (the stills run
  // 10–20° bluer than the paint and a shade-lit skin reads *lower* on the
  // circle), so it moves by less than half a degree and the value ratio above
  // is held to three decimals.
  console.log(
    `seal skin: sRGB ${srgbHue(skin).toFixed(1)}° S ${srgbSaturation(skin).toFixed(3)}`
      + ` Ylin ${luminance(skin).toFixed(4)} | skin ÷ garment ${skinToGarment.toFixed(3)}`,
  );
  assert.ok(
    Math.abs(srgbHue(skin) - 16.8) < 0.5,
    `his skin moved off ${srgbHue(skin).toFixed(1)}° — the warm half was refuted three times`,
  );
  assert.ok(
    srgbSaturation(skin) >= 0.22 && srgbSaturation(skin) <= 0.26,
    `his skin is ${srgbSaturation(skin).toFixed(3)} saturated — the stills read 0.22–0.26 in-frame`,
  );

  // The value floor, the Drunkard's rule: a real black garment in sun is a
  // mid-dark grey, and on a rider whose whole kit is black there is nowhere
  // for six other blacks to go below it.
  assert.ok(
    ((BLOCKOUT_COLOURS.sealGear >> 16) & 0xff) >= 60,
    'his top is under the value floor',
  );

  // **And the ladder itself**, which is the only thing separating seven
  // near-blacks inside a 27° hue band. The order is the one the references
  // rank them in (§35.2): the pack darkest, the pads a whole stop above the
  // knit, and the top the ground between them.
  const ladder = [
    ['sealPack', BLOCKOUT_COLOURS.sealPack],
    ['sealBoot', BLOCKOUT_COLOURS.sealBoot],
    ['sealGlove', BLOCKOUT_COLOURS.sealGlove],
    ['sealHelmetBlack', BLOCKOUT_COLOURS.sealHelmetBlack],
    ['sealTrouser', BLOCKOUT_COLOURS.sealTrouser],
    ['sealGear', BLOCKOUT_COLOURS.sealGear],
    ['sealPad', BLOCKOUT_COLOURS.sealPad],
  ] as const;
  for (let i = 1; i < ladder.length; i += 1) {
    const [lowName, low] = ladder[i - 1]!;
    const [highName, high] = ladder[i]!;
    assert.ok(
      luminance(high) > luminance(low),
      `${highName} at ${luminance(high).toFixed(3)} is not above ${lowName} at ${luminance(low).toFixed(3)}`,
    );
  }
  assert.ok(
    luminance(BLOCKOUT_COLOURS.sealPad) >= luminance(BLOCKOUT_COLOURS.sealGear) * 1.25,
    'the shells are not a stop above the knit — a black shell on a black leg is more trouser',
  );
});

test('his two bright surfaces own a material rather than a paint', () => {
  // The direction rule, and it is the mirror image of the last rider's
  // (`floWithZo.test.ts`: every accent he wore was darker than his suit, so a
  // sheet was unnecessary). Here the ground is the floor: the sweatshirt and
  // the lid's white are ten to thirty times lighter than the kit in linear
  // luminance, and there is no vertex tint from a near-black base that lands
  // on either without a ratio in the tens. So each owns a surface.
  const garment = HIS.extras.find((extra) => extra.name === 'rider-seal-garment');
  assert.ok(garment, 'the tied sweatshirt is missing');
  assert.equal(garment.material?.colour, BLOCKOUT_COLOURS.sealGarment, 'the sweatshirt does not own its material');
  assert.equal(garment.casts, true, 'the sweatshirt does not cast — it is the only thing that changes his outline');
  const pack = HIS.extras.find((extra) => extra.name === 'rider-seal-pack');
  assert.ok(pack && pack.casts, 'the pack is missing or does not cast');
  assert.equal(HIS.extras.length, 2, 'something else is bolted onto him');

  // **The pack takes every millimetre the skull's arc leaves it.** r1's piece 3
  // traced PHOTO 1's silhouette and put the pack's lid and the shoulder on one
  // line — 7 px of 442 under the helmet — against 83 mm of daylight in the
  // render. §E 6 costed 18 of those 83 as reachable; the chin bar shipped in
  // the same round deepened the swept skull and took eight of them back, so the
  // lid stands at 0.462 — the last height that clears
  // `riderClearance.test.ts`'s 20 mm bar is 0.463, measured a millimetre at a
  // time — and the remaining 73 mm is M29's contract, on the record rather than
  // bargained down. Asserted as a floor and a ceiling so neither a quiet drop
  // back nor a quiet climb into the arc passes review.
  const shoulderRing = HIS.profiles.torso.find((ring) => ring.y >= 0.50)!.y;
  assert.ok(
    SEAL_PACK_TOP >= 0.460 && SEAL_PACK_TOP <= shoulderRing - 0.030,
    `the pack's lid at ${(SEAL_PACK_TOP * 1000).toFixed(0)} mm is not in the 460–${((shoulderRing - 0.030) * 1000).toFixed(0)} mm window the two contracts leave`,
  );

  for (const [name, hex] of [
    ['the sweatshirt', BLOCKOUT_COLOURS.sealGarment],
    ["the lid's white", BLOCKOUT_COLOURS.sealHelmetWhite],
  ] as const) {
    const tint = tintOver(BLOCKOUT_COLOURS.sealGear, hex);
    assert.ok(
      tint.some((channel) => channel > 4),
      `${name} is within reach of a tint from the kit — it would not need a surface of its own`,
    );
  }

  // The **printing ground**, which is the arithmetic that makes the lid
  // possible. `inkOver` divides and clamps at one, so a ground below an ink
  // does not fail — it renders that ink as the ground, and the red would
  // quietly become a light grey. The ground is the sweatshirt's own value, so
  // this relation runs between two keys a later edit could move apart.
  for (const [name, hex] of Object.entries(SEAL_LID_INKS)) {
    const ink = linearFromHex(hex);
    for (let channel = 0; channel < 3; channel += 1) {
      assert.ok(
        SEAL_PRINT_GROUND[channel]! >= ink[channel]! - 1e-9,
        `the lid's ${name} stands above the print ground on channel ${channel}`
          + ` — the page would clamp and render it as the ground`,
      );
    }
  }
  assert.equal(HIS.materials.head.colour, BLOCKOUT_COLOURS.sealGarment, 'the lid does not wear the print ground');
  // The garment still sits below the roster's two brightest surfaces, so the
  // brightest garment on the roster does not change hands (§35.2).
  assert.ok(
    luminance(BLOCKOUT_COLOURS.sealGarment) < luminance(BLOCKOUT_COLOURS.floWithZoGuard),
    'his sweatshirt is brighter than the roster\'s brightest guard white',
  );
  assert.ok(
    luminance(BLOCKOUT_COLOURS.sealHelmetWhite) < luminance(BLOCKOUT_COLOURS.sealGarment),
    "the lid's white is brighter than the sweatshirt — §35.2 puts it below",
  );
  // **But only just.** r3's pieces 1 and 6 reached the same miss from opposite
  // ends of the rider (§E 1): every still puts the lid's white *above* the tied
  // garment — PHOTO 2 garment ÷ lid 0.66, PHOTO 1 0.60, PHOTO 3 0.94 at the
  // knot — and the shipped pair rendered the ordering backwards at 1.235, which
  // is what made the sash the loudest thing on him at chase distance. The
  // garment's own floor is not free: `sealNeon` sits at 0.685 and the assertion
  // above it requires the rand to stay under the sweatshirt, so the lid is the
  // one lever. It rises until the two are within a twentieth of each other and
  // stops there, because §35.2's authoring bands put the lid at 0.55–0.62 and
  // the garment at 0.62–0.72 and **those two bands cannot both hold with the
  // photographs' ratio** — closing the rest needs a fifteenth colour key (a
  // print ground of the lid's own) that §35.2/§35.4 declined. The residual is
  // on the record (r3 §C-3) rather than rounded away here.
  const garmentToLid = luminance(BLOCKOUT_COLOURS.sealGarment) / luminance(BLOCKOUT_COLOURS.sealHelmetWhite);
  console.log(
    `seal lid white: Ylin ${luminance(BLOCKOUT_COLOURS.sealHelmetWhite).toFixed(4)}`
      + ` sRGB ${srgbHue(BLOCKOUT_COLOURS.sealHelmetWhite).toFixed(1)}° S ${srgbSaturation(BLOCKOUT_COLOURS.sealHelmetWhite).toFixed(3)}`
      + ` | garment ÷ lid ${garmentToLid.toFixed(3)} against the stills' 0.60–0.92`,
  );
  assert.ok(
    garmentToLid <= 1.06,
    `his sash outranks the lid's white by ${garmentToLid.toFixed(3)} — all three stills rank them the other way`,
  );
  // And the blue cast is **refuted**, so the value is the only axis that moved:
  // PHOTO 1's own lid whites read hue 218–219 at S 0.14–0.15, which is at least
  // as blue as the key. It stays inside five degrees of where r1 authored it.
  assert.ok(
    Math.abs(srgbHue(BLOCKOUT_COLOURS.sealHelmetWhite) - 217.5) <= 5,
    `the lid's white moved ${Math.abs(srgbHue(BLOCKOUT_COLOURS.sealHelmetWhite) - 217.5).toFixed(1)}° off its hue — only the value was confirmed`,
  );
});

test('nothing on him is painted up by a scalar', () => {
  // §35.4's rule, and the generalisation of `floWithZo.test.ts`'s: on a dark
  // ground a paint that reaches a lighter colour is legal and necessary — the
  // shells over the trousers, the knuckle's red, the shoe's yellow rand — but
  // it is always a **per-channel** ratio computed by `tintOver` from the two
  // constants it runs between, so it lands on an authored colour. A scalar
  // above one is the move that cannot: three equal channels off a near-black
  // base reach a brighter near-black and nothing else, which is exactly the
  // corrective multiplier `DESIGN.md` §7k diagnoses.
  const surfaces = [
    ['thigh', HIS.profiles.thigh, HIS.paint!.thigh!],
    ['shin', HIS.profiles.shin, HIS.paint!.shin!],
    ['upperArm', HIS.profiles.upperArm, HIS.paint!.upperArm!],
    ['forearm', HIS.profiles.forearm, HIS.paint!.forearm!],
    ['hand', HIS.profiles.hand, HIS.paint!.hand!],
  ] as const;
  for (const [name, profile, painter] of surfaces) {
    for (const side of [-1, 1]) {
      const geometry = loftGeometry(profile, { radialSegments: 18 });
      painter(geometry, side);
      const colour = geometry.getAttribute('color');
      for (let i = 0; i < colour.count; i += 1) {
        const channels = [colour.getX(i), colour.getY(i), colour.getZ(i)];
        if (channels.every((channel) => channel <= 1 + 1e-6)) continue;
        const spread = Math.max(...channels) / Math.max(1e-6, Math.min(...channels));
        assert.ok(
          spread > 1.02,
          `a ${name} vertex lifts by a flat ${channels[0]!.toFixed(3)} — that is a scalar, not a colour`,
        );
      }
      geometry.dispose();
    }
  }
  // And every lift on him is one of the four the plan names, by construction:
  // the shells over the trousers, the shoe's rand, its lace flash and the
  // glove's knuckle. Each is `tintOver` between two keys, so the painted
  // vertex is that key and not a number that resembles it.
  for (const [name, base, target] of [
    ['the shells', BLOCKOUT_COLOURS.sealGear, BLOCKOUT_COLOURS.sealPad],
    ['the rand', BLOCKOUT_COLOURS.sealBoot, BLOCKOUT_COLOURS.sealNeon],
    ['the lace flash', BLOCKOUT_COLOURS.sealBoot, BLOCKOUT_COLOURS.sealHelmetWhite],
    ['the knuckle', BLOCKOUT_COLOURS.sealGear, BLOCKOUT_COLOURS.sealGloveRed],
  ] as const) {
    const tint = tintOver(base, target);
    const landed = new THREE.Color(base).multiply(new THREE.Color(tint[0], tint[1], tint[2]));
    const wanted = new THREE.Color(target);
    assert.ok(
      Math.hypot(landed.r - wanted.r, landed.g - wanted.g, landed.b - wanted.b) < 1e-6,
      `${name} does not land on its own constant`,
    );
  }
});

test("his lid is a printed shell: nothing leaves it, one sunk visor", () => {
  // The owner's two look passes on the sixth rider (2026-09-01): an off-road
  // lid built as volumes leaving the shell read as a snout (*"it's like... a
  // pig!"*), and colour hung on as lifted patches read as *"yellow panels
  // protruding"*. So the head mesh may stand no further off its own rings than
  // a patch does, the aperture holds one sunk visor, and the second and third
  // colours are texels. And no pivot bosses: three blind rounds on the eighth
  // rider called them a panel, and §35.4's standing instruction is to not
  // start with them.
  assert.equal(HIS.build?.head, undefined, 'the lid must remain the profile shape');
  const rider = createPlaceholderRider(HIS);
  try {
    // The neck carries two unnamed casting meshes — the neck and the head;
    // the head is the one that reaches the crown.
    const head = rider.neck.children.find((child) => {
      if ((child as THREE.Mesh).isMesh !== true || child.name !== '') return false;
      const geometry = (child as THREE.Mesh).geometry;
      geometry.computeBoundingBox();
      return geometry.boundingBox!.max.y > 0.30;
    }) as THREE.Mesh;
    assert.ok(head, 'the head mesh is missing');
    const shell = HIS.profiles.head;
    const point = new THREE.Vector3();
    // How far a vertex stands off the shell's own surface in its direction.
    const standOff = (x: number, y: number, z: number): number => {
      const v = (() => {
        const last = shell.length - 1;
        if (y <= shell[0]!.y) return 0;
        if (y >= shell[last]!.y) return last;
        for (let i = 1; i <= last; i += 1) {
          if (y <= shell[i]!.y) return i - 1 + (y - shell[i - 1]!.y) / (shell[i]!.y - shell[i - 1]!.y);
        }
        return last;
      })();
      const angle = Math.atan2(z, x);
      let nearest = Infinity;
      let radius = 0;
      for (let k = 0; k < 96; k += 1) {
        const ring = (() => {
          const index = Math.min(Math.floor(v), shell.length - 2);
          const f = v - index;
          const a = shell[index]!;
          const b = shell[index + 1]!;
          return {
            halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * f,
            halfDepth: a.halfDepth + (b.halfDepth - a.halfDepth) * f,
            x: a.x + (b.x - a.x) * f,
            z: a.z + (b.z - a.z) * f,
            square: a.square + (b.square - a.square) * f,
          };
        })();
        const u = (k / 96) * Math.PI * 2;
        const c = Math.cos(u);
        const s = Math.sin(u);
        const r = (Math.abs(c / ring.halfWidth) ** ring.square + Math.abs(s / ring.halfDepth) ** ring.square)
          ** (-1 / ring.square);
        point.set(ring.x + r * c, y, ring.z + r * s);
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
    // And it *is* printed: the shell samples the sheet, which is the only way
    // three saturated colours reach one helmet.
    assert.ok((head.material as THREE.MeshStandardMaterial).map, 'the shell carries no map — the lid is not printed');
  } finally {
    rider.dispose();
  }

  const face = HIS.panels.face!;
  assert.equal(face.patches.length, 1, 'the aperture holds one visor');
  const visor = face.patches[0]!;
  assert.ok((visor.sink ?? 0) < 0, 'the visor is not sunk into the aperture');
  // Nothing stands off the back of the shell — a rear spoiler was *"a bump on
  // the back protruding"* on his own ride — and the head carries exactly one
  // merged feature, the base rim, which wears a page of its own or it would be
  // a white ring on a printing ground.
  assert.ok(HIS.panels.head.every((each) => each.anchor !== 'back'), 'a feature stands off the back of the shell');
  assert.equal(HIS.panels.head.length, 1, 'the lid has grown a second feature — bosses are the one §35.4 forbids');
  assert.equal(HIS.panels.head[0]!.art, 'rim', 'the base rim wears the shell\'s print across itself');

  // The proportions the photographs give, and they are not the roster's road
  // shell's: §35.2 measures the lid **as wide as it is tall** (w/h 0.91) and
  // the base wide rather than pinched, which is the chase-camera read M34 left
  // open.
  const shell = HIS.profiles.head;
  const shellHeight = shell[shell.length - 1]!.y - shell[0]!.y;
  const widest = Math.max(...shell.map((ring) => ring.halfWidth));
  const aspect = (widest * 2) / shellHeight;
  assert.ok(aspect >= 0.90 && aspect <= 0.99, `the lid is ${aspect.toFixed(2)} wide for its height — the stills give 0.91`);
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
  assert.ok(jaw / widest >= 0.82, `the jaw is ${(100 * jaw / widest).toFixed(0)}% of the shell's widest`);

  // The aperture's split down the shell — the one two gauntlet rounds on the
  // last rider converged on, and the reason it is copied rather than re-argued.
  const share = (visor.to - visor.from) / shellHeight;
  const brow = (shell[shell.length - 1]!.y - visor.to) / shellHeight;
  const jawBand = (visor.from - shell[0]!.y) / shellHeight;
  const rim = HIS.panels.head.find((each) => each.u1 - each.u0 >= Math.PI * 2 - 1e-6);
  assert.ok(rim, 'the base rim is missing — the shell has to end somewhere');
  const chin = (visor.from - rim.to) / shellHeight;
  assert.ok(share >= 0.29 && share <= 0.38, `the visor is ${(share * 100).toFixed(0)}% of the shell's height`);
  assert.ok(brow >= 0.45, `the brow is ${(brow * 100).toFixed(0)}% of the shell`);
  // **The jaw band, and r1 moved it.** M34's converged road lid left 16.0 % of
  // the shell under the aperture; PHOTO 2, read at ×8 through the lid's centre,
  // puts it at **35.3 %** (crown y 372, aperture's lower edge 420, chin 446 of
  // a 74 px lid), and three of r1's six critics wrote the same sentence —
  // *there is no chin bar*. 25 % is where that photograph and the roster's own
  // converged recipe meet; how much further to go is the owner's
  // (`seal-views/_scratch/gauntlet-r1-record.md` §E 2 and §F).
  assert.ok(
    jawBand >= 0.24 && jawBand <= 0.26,
    `${(jawBand * 100).toFixed(1)}% of shell under the visor — PHOTO 2 gives 35%, the plan 25%`,
  );
  assert.ok(chin >= 0.10, `the chin band is ${(chin * 100).toFixed(0)}% of the shell — the rim has eaten the jaw`);

  // **And the jaw leads.** A chin bar is a share of the shell's height *and* a
  // mass in front of the brow; r1 measured the base ring reaching only 0.633 of
  // the shell's own furthest forward point, so the jaw sat 58 mm behind the
  // brow and the silhouette was a sphere cut flat at the neck from every
  // camera. Read as each ring's forward reach — its own `z` plus its
  // `halfDepth` — against the largest of them.
  const reach = shell.map((ring) => (ring.z ?? 0) + ring.halfDepth);
  const lead = reach[0]! / Math.max(...reach);
  assert.ok(lead >= 0.84, `the base ring reaches ${lead.toFixed(3)} of the shell's furthest forward point`);
});

test('the lid is red-dominant, and its white is a flash rather than a hairline', () => {
  // §35.2's one hard statement about the blocking, and the only one a
  // photograph can make about a pattern nobody may copy: *area order red >
  // black > white*. Measured on the painted page rather than on the shapes
  // that drew it, because a stroke that overlaps another, an edge ramp that
  // eats a band or a shape that has drifted off the shell show here and in
  // none of the numbers in `sealAtlas.ts`.
  //
  // **The second half of that order is gone, and the photographs are why.**
  // r1's verifier re-measured both stills through one classifier and found
  // white at or above black on the visible lid in each — PHOTO 1 white 31.5 %,
  // black 38.7 %, red 29.8 %; PHOTO 2 white 42.4 %, black 42.3 %, red 15.2 %,
  // with white first in both under the unsplit accounting
  // (`seal-views/_scratch/gauntlet-r1-record.md` §C-5). The r1 page carried
  // **6.4 %** white, a tenth of what PHOTO 2 measures, and three blind critics
  // found the lid short of white independently. So `black > white` is not
  // capped back into place here: it is retired with its measurement beside it,
  // and what remains asserted is the half the references agree on — red leads
  // — plus a floor and a ceiling on the white that r2's widened flashes and
  // rear band have to land between.
  //
  // **The eye port is outside the count**, and saying so is the point: the
  // visor patch covers it in its own material, so the texels under it are the
  // only part of the page a player never sees, and a share that counted them
  // would be counting a surface that does not exist.
  const shares = sealLidInkShares(SEAL_SHEET_LAYOUT);
  console.log(
    `seal lid page: red ${(100 * shares.red / shares.counted).toFixed(1)}%`
      + ` black ${(100 * shares.black / shares.counted).toFixed(1)}%`
      + ` white ${(100 * shares.white / shares.counted).toFixed(1)}%`
      + ` of ${shares.counted} texels outside the eye port`,
  );
  assert.ok(shares.counted > 100_000, `only ${shares.counted} texels counted`);
  assert.ok(shares.red > shares.black, 'the lid is not red-dominant');
  const white = shares.white / shares.counted;
  assert.ok(
    white >= 0.16 && white <= 0.26,
    `the lid's white is ${(100 * white).toFixed(1)}% of the page — r1 measured 6.4%, PHOTO 2 measures 42.4%`,
  );

  // And the chin bar's sides are red again. r1 rendered the chin band 97.3 %
  // black and 2.7 % red where PHOTO 2's is 45.5 % black, 22.8 % red and 31.7 %
  // white: the lower-chin term's own reach — 130 mm of arc either side of the
  // centre line — had swallowed the whole jaw. Measured over the arc that term
  // used to own, between the base rim and the aperture's lower edge.
  const chin = sealLidInkShares(SEAL_SHEET_LAYOUT, {
    from: SEAL_RIM_TOP,
    to: SEAL_VISOR_FROM,
    frontArc: 0.130,
  });
  console.log(
    `seal chin band: red ${(100 * chin.red / chin.counted).toFixed(1)}%`
      + ` black ${(100 * chin.black / chin.counted).toFixed(1)}%`
      + ` white ${(100 * chin.white / chin.counted).toFixed(1)}%`
      + ` of ${chin.counted} texels`,
  );
  assert.ok(chin.counted > 2_000, `only ${chin.counted} chin-band texels counted`);
  assert.ok(
    chin.red / chin.counted >= 0.15,
    `the chin bar is ${(100 * chin.red / chin.counted).toFixed(1)}% red — r1 rendered 2.7%`,
  );

  // **And the pale band round the rear base is as deep as PHOTO 1's.** r2's
  // was `rimTop + 0.004 … + 0.044` — 40 mm of a 288 mm shell, **13.9 %** — and
  // the base rim under it wears its own solid black, so nothing painted below
  // 0.070 was visible at all; `rest/head.png` rendered the band at 50 px of a
  // 353 px lid. PHOTO 1's rear columns give **20–30 %** of the local shell
  // height at three stations and its lower half is 30.5 % pale against the 23 %
  // r2 rendered. So the band takes the rim's own top edge and 20 mm more of the
  // strip the nape gives up above it. Measured over the rear arc the two shapes
  // share, where a band that had drifted off the shell or been eaten by the
  // nape's edge ramp would show and nothing in `sealAtlas.ts` would.
  const rear = sealLidInkShares(SEAL_SHEET_LAYOUT, {
    from: SEAL_RIM_TOP,
    to: SEAL_RIM_TOP + 0.064,
    rearArc: 0.120,
  });
  console.log(
    `seal rear base band: white ${(100 * rear.white / rear.counted).toFixed(1)}%`
      + ` red ${(100 * rear.red / rear.counted).toFixed(1)}%`
      + ` black ${(100 * rear.black / rear.counted).toFixed(1)}% of ${rear.counted} texels`,
  );
  assert.ok(rear.counted > 1_000, `only ${rear.counted} rear-base texels counted`);
  assert.ok(
    rear.white / rear.counted >= 0.80,
    `the rear base band is ${(100 * rear.white / rear.counted).toFixed(1)}% white over its own span`
      + ' — r2 painted 40 mm of the 64 the photographs ask for',
  );
});

test('the sweatshirt hangs on his LEFT and knots in front of it', () => {
  // §35.2, measured: PHOTO 1 is a left-side profile and the mass hangs down
  // **his left rear hip**; PHOTO 3 is a front three-quarter and the knot sits
  // at the front, slightly left of centre. Rider-left is +X (`AGENTS.md`), and
  // a mirrored garment is entirely plausible in code review — so this is read
  // off the **built** rig's own vertices rather than off the profiles.
  const rider = createPlaceholderRider(HIS);
  try {
    const garment = rider.root.getObjectByName('rider-seal-garment') as THREE.Mesh;
    assert.ok(garment, 'the sweatshirt is missing');
    const position = garment.geometry.getAttribute('position');
    // The two volumes, found by where they are rather than by an index: the
    // tail is everything below the band's own buried rings, the knot
    // everything ahead of the torso's front.
    let tailX = 0;
    let tailZ = 0;
    let tailCount = 0;
    let knotX = 0;
    let knotCount = 0;
    let front = -Infinity;
    let back = Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      front = Math.max(front, z);
      back = Math.min(back, z);
      if (y < 0.020) { tailX += x; tailZ += z; tailCount += 1; }
      if (z > 0.140) { knotX += x; knotCount += 1; }
    }
    assert.ok(tailCount > 40, `only ${tailCount} vertices hang below the band`);
    assert.ok(knotCount > 12, `only ${knotCount} vertices stand ahead of the band's own front`);
    assert.ok(tailX / tailCount > 0.02, `the hanging mass is centred at x ${(1000 * tailX / tailCount).toFixed(0)} mm — it belongs on his left`);
    assert.ok(tailZ / tailCount < -0.10, `the hanging mass is centred at z ${(1000 * tailZ / tailCount).toFixed(0)} mm — it belongs behind his hip`);
    assert.ok(knotX / knotCount > 0.02, `the knot is centred at x ${(1000 * knotX / knotCount).toFixed(0)} mm — it belongs left of centre`);
    // And both volumes stand proud of the band rather than being flush with
    // it: a flat lump is a printed band, which is exactly the correction
    // §35.2 makes against the render's flat sash. Measured against the band's
    // own extremes rather than against the knot's authored rings, because
    // what matters is the step between them and a superellipse's own pole
    // sits between two columns at any density.
    const bandFront = Math.max(...SEAL_GARMENT_BAND.map((ring) => ring.z + ring.halfDepth));
    const bandBack = Math.min(...SEAL_GARMENT_BAND.map((ring) => ring.z - ring.halfDepth));
    assert.ok(
      front >= bandFront + 0.015,
      `the knot stands ${((front - bandFront) * 1000).toFixed(0)} mm proud of the band — a lump, not a bulge`,
    );
    assert.ok(
      back <= bandBack - 0.020,
      `the tail hangs ${((bandBack - back) * 1000).toFixed(0)} mm behind the band — it has been swallowed`,
    );
    assert.ok(SEAL_GARMENT_TAIL[0]!.x > 0, 'the hanging mass has been mirrored off his left');
    assert.ok(
      SEAL_GARMENT_KNOT.every((tube) => tube.every((ring) => ring.x > 0)),
      'a knot tube has been mirrored off his left',
    );

    // **And the knot is two crossing sleeves with two free ends**, which is
    // r2's §E 4 and the cue that separates a tied sweatshirt from a belt. The
    // r1–r2 knot was one five-ring lobe and rendered as a pebble on a roll;
    // PHOTO 3 at ×3 shows two rolled tubes crossing with a loop through them
    // and two short ends below. Measured as two *separated* sections at the
    // height the ends hang at — a single blob would read as one run there.
    assert.equal(SEAL_GARMENT_KNOT.length, 2, 'the knot is not two tubes');
    const spans = SEAL_GARMENT_KNOT.map((tube) => {
      const ring = tube.find((candidate) => candidate.y >= SEAL_KNOT_END - 1e-9)!;
      assert.ok(ring.halfWidth > 0.010, 'a knot tube has closed before its free end');
      return [ring.x - ring.halfWidth, ring.x + ring.halfWidth] as const;
    }).sort((a, b) => a[0] - b[0]);
    const gap = spans[1]![0] - spans[0]![1];
    assert.ok(
      gap >= 0.010,
      `the two free ends are ${(gap * 1000).toFixed(0)} mm apart at y ${SEAL_KNOT_END} — they read as one lump`,
    );
    assert.ok(
      SEAL_KNOT_END <= SEAL_GARMENT_VISIBLE_BOTTOM - 0.040,
      `the free ends stop ${((SEAL_GARMENT_VISIBLE_BOTTOM - SEAL_KNOT_END) * 1000).toFixed(0)} mm below the band — that is still roll`,
    );
  } finally {
    rider.dispose();
  }

  // **And the hanging mass is a folded panel, not a bolster.** r1's piece 2
  // and piece 6 both landed on it and the verifier confirmed three findings
  // into one: the drop measured **25.7 %** of waist-to-ground where PHOTO 1
  // gives 43 % and PHOTO 3 33 %, and the section was a **1.59 : 1** closed tube
  // with a rounded cap where both stills show a flat sweatshirt folded over
  // itself with a ragged hem. A tube is what a loft gives you for free; the
  // panel is the shape, so it is asserted rather than drawn and hoped for.
  const widest = SEAL_GARMENT_TAIL.reduce((a, b) => (b.halfWidth > a.halfWidth ? b : a));
  const flatness = widest.halfWidth / widest.halfDepth;
  assert.ok(flatness >= 3.0, `the tail is ${flatness.toFixed(2)} : 1 at its widest — a bolster, not a panel`);
  assert.ok(
    SEAL_GARMENT_HEM <= -0.185,
    `the hem stops ${(-SEAL_GARMENT_HEM * 1000).toFixed(0)} mm below the hip — PHOTO 1 hangs it to 43% of waist-to-ground`,
  );
  // Fold planes rather than one smooth taper: rings between the widest and the
  // hem, ruled evenly, are what let a flat section read as cloth over cloth.
  const between = SEAL_GARMENT_TAIL.filter((ring) => ring.y > SEAL_GARMENT_HEM + 1e-9 && ring.y < widest.y - 1e-9);
  assert.ok(between.length >= 4, `only ${between.length} rings carry the drop — it is one taper`);

  // **And the hem ends on a corner** — r3's §E 2, the one half of its piece 2
  // that survived measurement. The cut was authored as a step and rendered as
  // an arc: the half-width falls 76 → 50 → 0 mm over **8 mm** of a 310 mm
  // drop, which is 2–3 px in `rest/chase.png` and closes the silhouette the
  // way a rounded blade does. The widths are right and only the two closing
  // rings move, so the drape's length, its section and r2 §E 5's projected
  // mass are all untouched — it is r1 §E 4's own sentence, *"a hem that ends
  // rather than rounds off"*, made true at the scale the camera works at.
  // The proportion is taken over the tail's **whole** fall, top ring to close,
  // because that is the length a chase frame renders the drape at: r3 measured
  // the cut at 8 mm of 310, and 2 mm of the 304 the tail now falls is 0.66 %.
  const fall = SEAL_GARMENT_TAIL[SEAL_GARMENT_TAIL.length - 1]!.y - SEAL_GARMENT_TAIL[0]!.y;
  const closeSpan = SEAL_GARMENT_HEM - SEAL_GARMENT_TAIL[0]!.y;
  console.log(
    `seal hem: closes in ${(closeSpan * 1000).toFixed(1)} mm of a ${(fall * 1000).toFixed(0)} mm fall`
      + ` — ${(100 * closeSpan / fall).toFixed(2)} %`,
  );
  assert.ok(
    closeSpan <= 0.002 + 1e-9,
    `the hem closes over ${(closeSpan * 1000).toFixed(1)} mm — a cut at this scale is 2 mm or it is an arc`,
  );
  assert.ok(
    closeSpan / fall <= 0.007,
    `the close is ${(100 * closeSpan / fall).toFixed(2)} % of the fall — r3 measured 2.6 % and read it as a rounded blade`,
  );

  // Owner QA rejected the thick oval panel even after the reference-area
  // guard passed. Hold visible width and cloth thickness separately: their
  // product rewarded the depth that made it look like armour.
  assert.ok(widest.halfWidth * 2 >= 0.26, 'the drape lost its visible breadth');
  for (const ring of SEAL_GARMENT_TAIL) {
    if (ring.y <= 0.060) assert.ok(ring.halfDepth * 2 <= 0.045, 'the hanging cloth became a thick slab');
  }
  const hem = SEAL_GARMENT_TAIL.find((ring) => ring.y === SEAL_GARMENT_HEM)!;
  assert.ok(hem.halfWidth >= widest.halfWidth * 0.75, 'the hem tapers into an oval paddle');
  // **The hem is a cut, not a point.** The last ring before the close steps in
  // rather than tapering to nothing, so the drop ends on an edge — PHOTO 1's
  // bundle has a bottom and `technical/chase.png` rendered a rounded blade.
  const closing = SEAL_GARMENT_TAIL[0]!;
  const cut = SEAL_GARMENT_TAIL[1]!;
  const hemRing = SEAL_GARMENT_TAIL.find((ring) => Math.abs(ring.y - SEAL_GARMENT_HEM) < 1e-9)!;
  assert.equal(closing.halfWidth, 0, 'the tail does not close');
  assert.ok(
    cut.y < SEAL_GARMENT_HEM && cut.halfWidth > 0 && cut.halfWidth <= hemRing.halfWidth * 0.72,
    `the hem steps from ${(1000 * hemRing.halfWidth).toFixed(0)} to ${(1000 * cut.halfWidth).toFixed(0)} mm — that is a taper, not a cut`,
  );
  // **And the drape hangs rather than trailing.** §E 10: the rings used to
  // sweep back 46 mm over the 302 mm drop — 8.7° the look added to whatever
  // the pelvis was already doing — where the panel is rigid and its lean is
  // the rig's. The sweep is the look's only share of that finding and it is
  // the one this file can hold.
  const zs = SEAL_GARMENT_TAIL.filter((ring) => ring.y <= 0.060).map((ring) => ring.z);
  const span = SEAL_GARMENT_TAIL[SEAL_GARMENT_TAIL.length - 1]!.y - SEAL_GARMENT_TAIL[0]!.y;
  const trail = Math.atan2(Math.max(...zs) - Math.min(...zs), span) * 180 / Math.PI;
  assert.ok(
    trail <= 2,
    `the drape's own rings trail ${trail.toFixed(1)}° behind the hip — r2 added 8.7° to the pelvis's own pitch`,
  );
});

test('the band is a tied roll and not a belt: his right hip is black under it', () => {
  // r2's piece 2, measured: the shipped band was one light value right round —
  // an unbroken pale run **1.22 ×** the black torso's own width below it in
  // `rest/knees.png`, against PHOTO 2's **0.21** and PHOTO 3's **0.15–0.20**,
  // and at ×3 PHOTO 3 shows his right hip as black cloth with no garment on it.
  // The cause the finding named was refuted — `SEAL_JERSEY`'s hem stands 82 mm
  // *below* the band's bottom ring and renders black under it — so what moved
  // is the band's own value on one quarter of its circumference, and the
  // diameter did not (r1 refused that on measurement: a sweatshirt tied round
  // a waist is a roll wider than the hips).
  //
  // Asserted on the band's own painter rather than on the merged buffer,
  // because the merge is exactly where the sleeves and the knot — which keep
  // the pale — would blur the reading.
  const band = loftGeometry(SEAL_GARMENT_BAND, { radialSegments: 26 });
  paintSealBand(band);
  const position = band.getAttribute('position');
  const colour = band.getAttribute('color');
  const shadow = tintOver(BLOCKOUT_COLOURS.sealGarment, BLOCKOUT_COLOURS.sealGear);
  let dark = 0;
  let pale = 0;
  for (let i = 0; i < position.count; i += 1) {
    const isDark = Math.abs(colour.getX(i) - shadow[0]) < 1e-6;
    if (isDark) dark += 1; else pale += 1;
    const x = position.getX(i);
    const z = position.getZ(i);
    if (z > 0 && x < -0.010) {
      assert.ok(isDark, `the band is still pale at x ${x.toFixed(3)}, z ${z.toFixed(3)} — that is his front-right hip`);
    }
    if (x > 0.010) {
      assert.ok(!isDark, `the band is dark at x ${x.toFixed(3)} — his left side carries the cloth in both stills`);
    }
  }
  band.dispose();
  console.log(`seal band: ${dark} of ${dark + pale} vertices carry the kit's black`);
  // A quarter of the circumference, give or take the ring the break lands on:
  // below a sixth it is a smudge and above a third it is a sash on his left.
  const share = dark / (dark + pale);
  assert.ok(
    share >= 0.16 && share <= 0.34,
    `${(100 * share).toFixed(1)}% of the band is dark — the break is a quarter of the roll, not a stripe or a sash`,
  );
  // And it paints **down**: the whole point of addressing the value inside the
  // buffer is that a garment key reaches a kit key without a second material.
  assert.ok(
    shadow.every((channel) => channel <= 1 + 1e-9),
    'the band break lifts rather than darkens — the sweatshirt is the brighter of the two keys',
  );
});

test('what shows through his knee hinge is the shell', () => {
  // M22's lesson, and the one place his shells differ mechanically from the
  // trouser they lie on: the shell is a patch in the **accent** material while
  // the limb under it is the **body** one, so "the limb inside the hinge is the
  // shell's value" is only true if the limb's tint targets `sealPad` exactly.
  // It is derived from the same constant the shell's material is, and this is
  // the measurement that says so on both bones and both sides.
  const shell = new THREE.Color(BLOCKOUT_COLOURS.sealPad);
  const kit = new THREE.Color(BLOCKOUT_COLOURS.sealGear);
  const nearness = (a: THREE.Color, b: THREE.Color): number => {
    const scale = Math.max(b.r, b.g, b.b, 1e-4);
    return Math.hypot((a.r - b.r) / scale, (a.g - b.g) / scale, (a.b - b.b) / scale);
  };
  for (const [profile, painter, inside] of [
    [HIS.profiles.thigh, HIS.paint?.thigh, (y: number) => y <= -RIDER_BLOCKOUT.thighLength * SEAL_SHELL_TOP],
    [HIS.profiles.shin, HIS.paint?.shin, (y: number) => y >= SEAL_SHELL_BOTTOM],
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
          kit.r * colour.getX(i),
          kit.g * colour.getY(i),
          kit.b * colour.getZ(i),
        );
        if (nearness(painted, shell) < 0.06) matching += 1;
      }
      geometry.dispose();
      assert.ok(sampled > 0, 'no vertices lie inside the hinge');
      assert.equal(matching, sampled, `${sampled - matching} of ${sampled} vertices inside the hinge are not shell-dark`);
    }
  }
  // Both halves of the shell exist, on the two bones a guard has to span.
  assert.ok(HIS.panels.thighPad?.ghostSilhouette, 'the thigh shell is absent from the replay');
  assert.ok(HIS.panels.kneePad?.ghostSilhouette, 'the shin shell is absent from the replay');
  assert.equal(HIS.panels.thighPad!.role, 'accent', 'the thigh shell is not the pad material');
  assert.equal(HIS.panels.kneePad!.role, 'accent', 'the shin shell is not the pad material');

  // **And the shells do not shine.** r1's piece 3 found a near-white band —
  // peak L 198, 278 px over L 140 — as the brightest thing on his legs, where
  // the shell's own albedo reads L 14. PHOTO 3 rules the other way from the
  // lid: his knee shells are *darker* than the trouser beside them (median 35
  // against 46) and peak at 140, so there is no highlight on that plastic to
  // reproduce. The cause was not a colour — the shell mesh carries two tints,
  // 1.000 and the rivets' 0.740 — it was 0.40 roughness with a touch of
  // metalness under this sun, so what moves is the pair and nothing else.
  // `FLO_GUARD`'s own numbers: the roster's precedent for armour, and the
  // reason there is no third value to argue about.
  assert.equal(HIS.materials.accent.roughness, 0.55, 'the shells are glossier than the roster\'s armour');
  assert.equal(HIS.materials.accent.metalness ?? 0, 0, 'the shells carry a mirror lobe PHOTO 3 has none of');
});

test('his arms are bare between a high sleeve and a short cuff', () => {
  // §35.2's *"bare skin from the sleeve hem to the glove, a black elbow pad
  // mid-run, skin above and below it"* — his only large warm area, and the
  // read cue an all-black rider has at chase distance. Three values on the
  // upper arm and two on the forearm, asserted on the multiplier where the
  // camera reads them rather than on a hex.
  //
  // **The elbow's value moved in r3 and this line moved with it** (§E 7, and
  // §H of the r2 record, which required the move to be argued rather than
  // quietly capped). The band used to land on `sealPad` — a key authored *a
  // whole stop above the knit* for the knee shells, where a black shell on a
  // black trouser needs the separation. The arm does not: the pad sits on bare
  // skin, so the shirt's own black is separation enough, and the key's lift was
  // rendering two grey bands as the brightest things on an otherwise black
  // rider. Within-frame linear-Y, pad ÷ shirt: the game gave **2.58** and
  // **2.50** against PHOTO 2's 1.54 and 0.46 and PHOTO 3's 0.93 and 0.29 — above
  // the whole reference range in every capture. M34 settled the identical
  // finding on the last rider by moving `FLO_ELBOW_PAD` off the guard material.
  // `sealPad ≥ sealGear × 1.25` is still asserted above, for the shells that
  // still wear it.
  const sleeveHem = -RIDER_BLOCKOUT.upperArmLength * SEAL_SLEEVE_HEM;
  const skin = new THREE.Color(BLOCKOUT_COLOURS.sealSkin);
  const classify = (colour: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): string => {
    const painted = new THREE.Color(skin.r * colour.getX(i), skin.g * colour.getY(i), skin.b * colour.getZ(i));
    let best = 'skin';
    let bestGap = Infinity;
    for (const [name, hex] of [
      ['skin', BLOCKOUT_COLOURS.sealSkin],
      ['kit', BLOCKOUT_COLOURS.sealGear],
      ['pad', BLOCKOUT_COLOURS.sealPad],
    ] as const) {
      const target = new THREE.Color(hex);
      const gap = Math.hypot(painted.r - target.r, painted.g - target.g, painted.b - target.b);
      if (gap < bestGap) { bestGap = gap; best = name; }
    }
    return best;
  };
  for (const side of [-1, 1]) {
    const upper = loftGeometry(HIS.profiles.upperArm, { radialSegments: 18 });
    HIS.paint!.upperArm!(upper, side);
    const upperPos = upper.getAttribute('position');
    const upperColour = upper.getAttribute('color');
    let bareUpper = 0;
    for (let i = 0; i < upperPos.count; i += 1) {
      const y = upperPos.getY(i);
      const what = classify(upperColour, i);
      if (y > sleeveHem + 1e-3) assert.equal(what, 'kit', `the sleeve is ${what} at y ${y.toFixed(3)}`);
      else if (y > -0.20) { assert.equal(what, 'skin', `the upper arm is ${what} at y ${y.toFixed(3)}`); bareUpper += 1; }
    }
    upper.dispose();
    assert.ok(bareUpper > 20, `only ${bareUpper} bare vertices between the sleeve and the elbow`);

    const fore = loftGeometry(HIS.profiles.forearm, { radialSegments: 18 });
    HIS.paint!.forearm!(fore, side);
    const forePos = fore.getAttribute('position');
    const foreColour = fore.getAttribute('color');
    let bareFore = 0;
    for (let i = 0; i < forePos.count; i += 1) {
      const y = forePos.getY(i);
      const what = classify(foreColour, i);
      if (y > SEAL_ELBOW_BOTTOM + 1e-3) assert.equal(what, 'kit', `the elbow pad is ${what} at y ${y.toFixed(3)}`);
      else { assert.equal(what, 'skin', `the forearm is ${what} at y ${y.toFixed(3)}`); bareFore += 1; }
    }
    fore.dispose();
    assert.ok(bareFore > 30, `only ${bareFore} bare vertices below the elbow pad`);
  }
  // And the pad is **a bulge, not a stripe** (§35.2: the render under-sizes
  // it). The forearm's widest ring is the elbow's, and it is wider than the
  // limb below it by a stated margin.
  const rings = HIS.profiles.forearm;
  const elbow = Math.max(...rings.filter((ring) => ring.y > SEAL_ELBOW_BOTTOM).map((ring) => ring.halfWidth));
  const arm = Math.max(...rings.filter((ring) => ring.y < SEAL_ELBOW_BOTTOM - 0.02).map((ring) => ring.halfWidth));
  assert.ok(elbow >= arm * 1.20, `the elbow is ${(elbow / arm).toFixed(2)} × the forearm — that is a stripe`);

  // **And it reaches the sleeve**, which is r2's §E 8. The r2 arm ran sleeve
  // 95 mm, bare skin 149, pad 136 (36 on the upper arm plus 100 on the
  // forearm), bare forearm 156 — **pad ÷ bare-above 0.91**, a pad shorter than
  // the gap above it. PHOTO 2 gives 1.4 and PHOTO 3 at ×3 puts the pad's top
  // essentially at the sleeve's hem. `SEAL_ELBOW_UPPER` at −0.210 lands at
  // 1.48 and keeps the bare band the classifier above walks.
  // Two bones, so two spans: the swell's upper half runs from `SEAL_ELBOW_UPPER`
  // to the upper arm's own end, and its lower half is the forearm's two rings.
  const bareAbove = sleeveHem - SEAL_ELBOW_UPPER;
  const padRun = (RIDER_BLOCKOUT.upperArmLength + SEAL_ELBOW_UPPER)
    + (SEAL_ELBOW_TOP - SEAL_ELBOW_BOTTOM);
  console.log(
    `seal elbow: sleeve hem ${(-1000 * sleeveHem).toFixed(0)} mm, bare ${(1000 * bareAbove).toFixed(0)},`
      + ` pad ${(1000 * padRun).toFixed(0)}, ratio ${(padRun / bareAbove).toFixed(2)}`,
  );
  assert.ok(
    padRun / bareAbove >= 1.30,
    `the pad is ${(padRun / bareAbove).toFixed(2)} × the bare band above it — r2 rendered 0.91 and PHOTO 2 gives 1.4`,
  );
});

test('the glove red is a knuckle patch and not a red mitt', () => {
  // **r2's BLOCKER, and the unit is the whole of it.** r1 refuted the same
  // claim on 22.5 % of the glove's *vertices*; r2's verifier measured the
  // rendered hand — background and skin excluded by hue — at 52 %, 35 % and
  // 56 % across three captures against PHOTO 3's 1 % and 11 % and PHOTO 2's
  // 19 % and 0 %. A camera sees area, not vertices, so area is what is
  // asserted here: **triangle area** of the red window on the built glove,
  // which counts the cuff and the inboard half no camera sees and is therefore
  // a ceiling rather than a reading.
  //
  // The placement itself is not the finding. §35.2 measures a red section on
  // the knuckle side in two stills and PHOTO 2's near glove reads 19 % red
  // frontally, so the outboard half stands; what was wrong was its **size** —
  // every ring below the wrist waist, right round the outboard half. The
  // window is now the knuckle swell's own two rings.
  const geometry = loftGeometry(HIS.profiles.hand, { radialSegments: 18 });
  HIS.paint!.hand!(geometry, 1);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  const red = tintOver(BLOCKOUT_COLOURS.sealGear, BLOCKOUT_COLOURS.sealGloveRed);
  const isRed = (i: number): boolean => Math.abs(colour.getX(i) - red[0]) < 1e-6
    && Math.abs(colour.getY(i) - red[1]) < 1e-6
    && Math.abs(colour.getZ(i) - red[2]) < 1e-6;
  let redVertices = 0;
  for (let i = 0; i < colour.count; i += 1) if (isRed(i)) redVertices += 1;
  const index = geometry.index!;
  const corner = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  let total = 0;
  let painted = 0;
  for (let t = 0; t < index.count; t += 3) {
    const i0 = index.getX(t);
    const i1 = index.getX(t + 1);
    const i2 = index.getX(t + 2);
    corner.fromBufferAttribute(position, i0);
    edgeA.fromBufferAttribute(position, i1).sub(corner);
    edgeB.fromBufferAttribute(position, i2).sub(corner);
    const area = 0.5 * edgeA.cross(edgeB).length();
    total += area;
    // A facet counts as red when the majority of its corners are: two red
    // corners is a facet a player reads as red, and a single one is the ramp
    // at the patch's own edge.
    if ([i0, i1, i2].filter(isRed).length >= 2) painted += area;
  }
  geometry.dispose();
  const share = painted / total;
  console.log(
    `seal glove red: ${(100 * share).toFixed(1)}% of the part's triangle area,`
      + ` ${redVertices}/${colour.count} vertices`,
  );
  assert.ok(
    share <= 0.10,
    `the glove is ${(100 * share).toFixed(1)}% red by area — r2 rendered 21.5% and the captures read 35–56% of the hand`,
  );
  assert.ok(
    redVertices <= 22 && redVertices >= 12,
    `${redVertices} of ${colour.count} glove vertices are red — r2 carried 45, and under twelve is no patch at all`,
  );
});

test("the yellow rand sits above the pedal line, and the sole's dark stays under it", () => {
  // `paintFloBoot`'s measured lesson, inherited (M34 findings 4b and 4d): the
  // pedal plate covers the bottom **24 %** of the boot at every angle the
  // capture tool takes, so an accent authored where a shoe's sole unit
  // actually is does not exist on screen. His yellow is a rand from 0.26 to
  // 0.42 of the last, which is the band that reads from any camera.
  const upper = loftGeometry(HIS.profiles.boot, { radialSegments: HIS.density!.boot! }).rotateX(Math.PI / 2);
  const sole = loftGeometry(HIS.profiles.bootSole, { radialSegments: HIS.density!.boot! + 4, shade: HIS.shades.sole });
  // The rig merges the two before painting; reproduce the same buffer so the
  // sole's shade is in it and the painter's own skip is exercised.
  const boot = mergeGeometries([upper, sole]);
  HIS.paint!.boot!(boot, 1);
  boot.computeBoundingBox();
  const box = boot.boundingBox!;
  const height = box.max.y - box.min.y;
  const position = boot.getAttribute('position');
  const colour = boot.getAttribute('color');
  const neon = tintOver(BLOCKOUT_COLOURS.sealBoot, BLOCKOUT_COLOURS.sealNeon);
  const lace = tintOver(BLOCKOUT_COLOURS.sealBoot, BLOCKOUT_COLOURS.sealHelmetWhite);
  let lowest = Infinity;
  let painted = 0;
  let laced = 0;
  const randRings = new Set<string>();
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(colour.getX(i) - lace[0]) < 1e-6) { laced += 1; continue; }
    if (Math.abs(colour.getX(i) - neon[0]) > 1e-6) continue;
    painted += 1;
    // The upper's own rings run heel to toe: after the quarter turn that stands
    // the loft up, each ring's height in the last is the vertex's `z`.
    randRings.add(position.getZ(i).toFixed(4));
    lowest = Math.min(lowest, (position.getY(i) - box.min.y) / height);
  }
  const total = position.count;
  // The lace's share of the boot, in the unit a camera uses: **triangle area
  // with all three corners inside the window**, because a gouraud-interpolated
  // vertex is a smear and not a mark. Taken before the buffer goes.
  const laceArea = (() => {
    const index = boot.getIndex();
    const count = index ? index.count / 3 : position.count / 3;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const marked: boolean[] = [];
    for (let i = 0; i < position.count; i += 1) marked.push(Math.abs(colour.getX(i) - lace[0]) < 1e-6);
    let all = 0;
    let mine = 0;
    for (let triangle = 0; triangle < count; triangle += 1) {
      const i0 = index ? index.getX(triangle * 3) : triangle * 3;
      const i1 = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const i2 = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      a.fromBufferAttribute(position, i0);
      b.fromBufferAttribute(position, i1);
      c.fromBufferAttribute(position, i2);
      const area = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
      all += area;
      if (marked[i0] && marked[i1] && marked[i2]) mine += area;
    }
    return (mine / all) * 100;
  })();
  boot.dispose();
  // **The rand is a band, not a gradient** (r1 §E 10, the surviving MINOR half
  // of P4-2). Its ring count refuted the MAJOR — the neon is a complete 19/19
  // ring and the heel is not black — but 19 vertices of 136 in a 16 % slab of
  // the last leaves the yellow with no edge of its own at either end. A ring at
  // the mid-foot and eight more points of the last put a row of vertices inside
  // the band instead of only on its shoulders.
  assert.ok(painted >= 34, `only ${painted} of ${total} vertices carry the rand`);
  assert.ok(randRings.size >= 5, `the rand crosses only ${randRings.size} of the upper's rings`);
  assert.ok(lowest >= 0.24, `the rand reaches ${(lowest * 100).toFixed(0)}% of the last — the pedal covers 24%`);
  // **And the lace flash is a mark, not a smear** — r3's §E 4, and the whole
  // finding turns on the unit. r1's piece 4 read the boot's colour attribute
  // and found `SEAL_LACE_TINT` on **none** of the 136 vertices; r2 rebuilt the
  // window on the mesh and reached three, and r2 refuted the critic on a *pixel
  // count* (154 pale pixels), which is not wrong and is the wrong unit. Three
  // vertices spread one per ring means **not one triangle carries the tint on
  // all three corners**, so what renders is a gouraud fan around three points —
  // a soft pale blob with no edge anywhere, which is exactly the *"smooth
  // specular ramp"* the third round reported. A camera sees faces.
  //
  // So the unit here is **triangle area with all three vertices inside the
  // window**, and it is bounded at both ends. The floor is a mark that exists;
  // the ceiling is the r2 lesson kept — the same predicate opened to
  // `z < 0.030` takes the collar's own ring as well, measures 2.55 %, and
  // renders as a shoe with a white top rather than as laces. The window is the
  // instep crown only, **65 × 25 mm on a 130 mm-wide last, no side stripe and
  // no brand-shaped mark**, because the brightest white on PHOTO 1's shoe is a
  // maker's mark and piece 7 has returned WIN three rounds running.
  console.log(`seal lace: ${laced} vertices, ${laceArea.toFixed(2)} % of the boot's triangle area`);
  assert.ok(laced >= 6, `the lace flash paints ${laced} of ${total} vertices`);
  assert.ok(
    laceArea >= 0.9,
    `the lace covers ${laceArea.toFixed(2)} % of the boot's triangle area — under 0.9 it has no edge of its own`,
  );
  assert.ok(
    laceArea <= 1.5,
    `the lace covers ${laceArea.toFixed(2)} % of the boot's triangle area — over 1.5 it is a white instep`,
  );
});

test('the head casts and the visor does not', () => {
  // Rule 3 of the look file: `castShadow` is what the ghost draws, and the
  // silhouette the chase camera reads is the shell's. The visor lies on that
  // shell and carries no outline of its own, so it is the one part of the head
  // that may be dropped — which is part of what pays for the two extras.
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

    // **One surface samples the sheet and it is the lid.** His atlas names one
    // role, so a bug in the page can only ever be a bug on a helmet — and
    // every other mesh on him keeps the unit square the kit gave it.
    assert.deepEqual([...HIS.atlas!.roles], ['head'], 'more than the lid samples his sheet');
    for (const mesh of meshesOf(rider.root)) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map !== null) {
        assert.equal(mesh, head, `his ${mesh.name || '(unnamed)'} samples the sheet`);
      }
    }
    // And the blank page is a page rather than a throw, which is the contract
    // `RiderAtlas.region` states for a part that forgot to name its art.
    assert.ok(HIS.atlas!.region(undefined), 'an unnamed page throws');
    assert.ok(HIS.atlas!.region('no such page'), 'an unknown page throws');
  } finally {
    rider.dispose();
  }

  const ghost = createGhostRider(HIS);
  try {
    console.log(`${HIS.id} ghost: ${ghost.drawCalls} draw calls, ${ghost.triangles} triangles`);
    assert.ok(ghost.drawCalls <= 26, `${ghost.drawCalls} draw calls for a recording of him`);
    assert.ok(ghost.triangles < 40_000, `${ghost.triangles} triangles for a recording of him`);
  } finally {
    ghost.dispose();
  }
});

test('the shells reach the ground the hinge is painted to on both bones', () => {
  // The cup's own spans, stated so a later edit that shortens one half is told
  // the other half is where the paint stops: the shell runs from 104 mm above
  // the knee to 146 mm below it, 1.4 × the thigh's own last quarter, which is
  // §35.2's *"the biggest single volume on his legs"*.
  assert.ok(
    RIDER_BLOCKOUT.thighLength * (1 - SEAL_SHELL_TOP) >= 0.100,
    'the shell starts less than 100 mm above the knee',
  );
  assert.ok(-SEAL_SHELL_BOTTOM >= 0.140, 'the shell ends less than 140 mm below the knee');
  const capTop = HIS.panels.thighPad!.patches.find((each) => each.to === -0.384);
  const capBottom = HIS.panels.kneePad!.patches.find((each) => each.from === SEAL_CUP_BOTTOM);
  assert.ok(capTop && capBottom, 'both halves of the cap must exist');
  assert.ok(capBottom.to === 0, 'the shin half of the cap does not reach the knee');

  // **And the thigh half stops on the limb rather than hanging off its end** —
  // r3's §E 3, the round's one rendered defect. A patch is offset along the
  // loft's own outward normal, and `SEAL_THIGH` closes hemispherically over its
  // last 36 mm: on that dome the normal swings downward and the cross-section
  // falls to nothing, so a 32 mm lift applied to a ring 36 mm wide builds a
  // skirt of nearly twice the radius hanging in the air below the knee. That is
  // what `technical/legs.png` showed at ×12 — a near-black hard-edged wedge
  // with a needle spur sitting on the knee shell's upper edge and breaking the
  // silhouette against the ground — and it is measured here on the built mesh
  // rather than left to a capture, because the capture is what missed it twice.
  //
  // The bar is the limb's own end: nothing in the cap may fall below the thigh
  // loft's last ring. The cap's low edge must therefore start **above the first
  // dome ring**, and it must not go back toward −0.400 to do it: that is M34's
  // r2 confirmed measurement, where 34 mm of a 73 mm dark band read as bare
  // kneecap.
  const thighClose = Math.min(...HIS.profiles.thigh.map((ring) => ring.y));
  const rider = createPlaceholderRider(HIS);
  try {
    for (const side of ['left', 'right'] as const) {
      const pad = rider.root.getObjectByName(`rider-thigh-pad-${side}`) as THREE.Mesh;
      assert.ok(pad?.isMesh, `the ${side} thigh shell is missing`);
      const position = pad.geometry.getAttribute('position');
      let lowest = Infinity;
      for (let i = 0; i < position.count; i += 1) lowest = Math.min(lowest, position.getY(i));
      assert.ok(
        lowest >= thighClose,
        `the ${side} thigh cap hangs ${((thighClose - lowest) * 1000).toFixed(1)} mm past the leg's own close`
          + ` — r3 measured 20.6 mm of it and a critic called it a spiked wedge`,
      );
    }
  } finally {
    rider.dispose();
  }
  const knuckle = HIS.panels.thighPad!.patches.reduce((a, b) => (b.from < a.from ? b : a));
  assert.ok(
    knuckle.from <= -0.412,
    `the thigh cap starts at ${knuckle.from} — at −0.400 M34 measured 34 mm of a 73 mm band as bare kneecap`,
  );
});

test('his chooser card is painted out of his own keys, not out of a frozen Phase-0 copy of them', () => {
  // M34's bronze dome, one milestone on. `src/ui/menus.ts` is the card's
  // authority (`DESIGN.md` §9d), its doc block claims the fills are "the albedo
  // values `BLOCKOUT_COLOURS.seal*` and `machineSeal*` carry" — and a claim in a
  // comment cannot fail. It failed silently on M34 and again here: the three
  // keys the r1 fix round moved (`sealHelmetRed`, `sealHelmetWhite`,
  // `sealGarment`) stayed at their Phase-0 hexes on the card until QA round 1
  // measured them on 2026-09-11. So the sentence is pinned instead of trusted.
  //
  // The card is read as text rather than imported because `ui/menus.ts` builds
  // DOM at module scope; the same trick `drunkard.test.ts` uses on its atlases.
  const menus = readFileSync(new URL('../ui/menus.ts', import.meta.url), 'utf8');
  const from = menus.indexOf("'seal-on-a-wheel': {");
  assert.ok(from > 0, 'the ninth chooser card is gone from `ui/menus.ts`');
  const to = menus.indexOf('</svg>', from);
  assert.ok(to > from, "the ninth card's portrait is gone");
  const portrait = menus.slice(from, to);

  const palette = new Map(
    (
      [
        'sealHelmetRed',
        'sealHelmetWhite',
        'sealHelmetBlack',
        'sealVisor',
        'sealGear',
        'sealGarment',
        'machineSealCyan',
        'machineSealPink',
      ] as const
    ).map((key) => [`#${BLOCKOUT_COLOURS[key].toString(16).padStart(6, '0')}`, key]),
  );

  const fills = [...portrait.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((match) => match[1]);
  assert.equal(fills.length, 14, `the card draws ${fills.length} filled shapes`);
  for (const fill of fills) {
    assert.ok(
      palette.has(fill),
      `the card paints ${fill}, which is no key of his — the eight are`
        + ` ${[...palette].map(([hex, key]) => `${key} ${hex}`).join(', ')}`,
    );
  }
  // All eight keys reach the card: a card that quietly dropped one would still
  // pass the membership test above.
  const used = new Set(fills.map((fill) => palette.get(fill)!));
  assert.equal(used.size, palette.size, `the card uses ${used.size} of his ${palette.size} keys`);
});

// Owner QA: a full mitten and an inboard thumb must survive the replay merge.
test('his mittens have mirrored thumbs and keep their full shape in the ghost', () => {
  const rider = createPlaceholderRider(HIS);
  const ghost = createGhostRider(HIS);
  try {
    for (const [side, sign] of [['left', 1], ['right', -1]] as const) {
      const hand = rider.root.getObjectByName(`rider-hand-${side}`) as THREE.Mesh;
      const p = hand.geometry.getAttribute('position');
      let tip = 0; let thumb = 0;
      for (let i = 0; i < p.count; i += 1) {
        tip = Math.min(tip, p.getY(i));
        if (p.getY(i) < -0.050 && p.getY(i) > -0.110) thumb = Math.max(thumb, -sign * p.getX(i));
      }
      assert.ok(tip <= -0.140, 'mitten ends at the wrist');
      assert.ok(thumb >= 0.060, 'no thumb projects from the inboard palm');
      const replayHand = ghost.group.getObjectByName(`ghost-rider-hand-${side}`) as THREE.Mesh;
      assert.ok(replayHand?.isMesh, 'the replay dropped a hand');
      replayHand.geometry.computeBoundingBox();
      assert.ok(replayHand.geometry.boundingBox!.min.y <= -0.140, 'the replay shortened the mitten');
      const bounds = replayHand.geometry.boundingBox!;
      assert.ok((sign === 1 ? -bounds.min.x : bounds.max.x) >= 0.060, 'the replay dropped the thumb');
    }
  } finally { rider.dispose(); ghost.dispose(); }
});
