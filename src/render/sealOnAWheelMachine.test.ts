/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { MACHINE_IDS, machineForCharacter, machineSpec } from '../data/machines.ts';
import { createPose } from '../simulation/EucController.ts';
import { createBlockoutEUC } from './euc.ts';
import { createRidingRig } from './ridingRig.ts';
import {
  ADONISB2_MACHINE_LOOK,
  DRUNKARD_MACHINE_LOOK,
  FLO_WITH_ZO_MACHINE_LOOK,
  SEAL_PAD_TOP,
  SEAL_ON_A_WHEEL_MACHINE_LOOK,
  STANDARD_MACHINE_LOOK,
  WHEEL_IN_MOTION_MACHINE_LOOK,
  machineLook,
} from './machineLook.ts';
import { measureObject } from './renderCost.ts';
import { SEAL_ON_A_WHEEL_LOOK } from './riderLook.ts';

/**
 * Seal on a Wheel's wheel — M35 Phase 2, and what only the built machine
 * knows.
 *
 * His own file, on FloWithZo's shape and for his reason: the rider's look and
 * the machine's row are built in the same window by different hands
 * (`docs/PLANS.md` §35.10), and a shared test file is a shared merge.
 *
 * **What this file has that no machine test before it needed.** His is the
 * second machine on the roster whose identity colour is the shell *base*
 * (Red Rider's is the first), and the first whose base is a saturated cyan.
 * That inverts the arithmetic every other bezel test is written in: a cyan's
 * linear red channel is 0.007, so a near-black paint over it comes out as a
 * red *multiplier* of 0.74 — under FloWithZo's `getX < 0.45` bar by nothing
 * but accident of hue, and meaningless as a measure of darkness. §19.7 asks
 * for a dark field behind the power ladder, and on this machine the channels
 * that carry the field are green and blue. So the bezel is asserted on those,
 * and on the rendered luminance the base and the multiplier make together
 * (`docs/PLANS.md` §35.3 fact 11).
 *
 * The photographs are the authority for what it looks like; this file is the
 * authority for what it costs and what it may not do.
 */

const HIS = SEAL_ON_A_WHEEL_LOOK;
const HIS_WHEEL = SEAL_ON_A_WHEEL_MACHINE_LOOK;
const WHEEL_TRIM = new THREE.Color(BLOCKOUT_COLOURS.machineSealTrim);
const SHELL = new THREE.Color(HIS_WHEEL.shell.colour);

const lumaOf = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const hueOf = (c: THREE.Color): number => { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return h.h * 360; };
/** The shorter way round the colour wheel — a hue gap is circular, and 342° from 0° is 18°. */
const hueGap = (a: THREE.Color, b: THREE.Color): number => {
  const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return d > 180 ? 360 - d : d;
};
const nearHex = (c: THREE.Color, hex: number, tolerance = 0.02): boolean => {
  const target = new THREE.Color(hex);
  return Math.max(Math.abs(c.r - target.r), Math.abs(c.g - target.g), Math.abs(c.b - target.b)) < tolerance;
};
/** A trim patch's rendered colour: its tint over the trim base, or the base itself. */
const wornTrim = (tint: readonly [number, number, number] | undefined): THREE.Color => (
  tint ? new THREE.Color(tint[0] * WHEEL_TRIM.r, tint[1] * WHEEL_TRIM.g, tint[2] * WHEEL_TRIM.b) : WHEEL_TRIM.clone()
);
/** What a painted shell vertex actually renders as: the base times the multiplier it carries. */
const paintedLuma = (r: number, g: number, b: number): number => (
  0.2126 * SHELL.r * r + 0.7152 * SHELL.g * g + 0.0722 * SHELL.b * b
);
/** The smallest angle between two loft angles, radians. */
const angleGap = (a: number, b: number): number => {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
};

/** A built mesh's width across the machine, in world metres — what a lamp's span comes out as. */
function worldWidth(mesh: THREE.Object3D): number {
  const geometry = (mesh as THREE.Mesh).geometry;
  assert.ok(geometry, 'a mesh was expected');
  mesh.updateWorldMatrix(true, false);
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    min = Math.min(min, point.x);
    max = Math.max(max, point.x);
  }
  return max - min;
}

/** A built mesh's world surface area — a lamp's size when its width alone could hide a taller one. */
function worldArea(mesh: THREE.Object3D): number {
  const geometry = (mesh as THREE.Mesh).geometry;
  assert.ok(geometry, 'a mesh was expected');
  mesh.updateWorldMatrix(true, false);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const triangle = new THREE.Triangle();
  const count = index ? index.count : position.count;
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const at = index ? index.getX(i + corner) : i + corner;
      corners[corner]!.fromBufferAttribute(position, at).applyMatrix4(mesh.matrixWorld);
    }
    area += triangle.set(corners[0]!, corners[1]!, corners[2]!).getArea();
  }
  return area;
}

/** The built machine's `euc-pad-left` extents, in its own frame. */
function padExtents(look: typeof HIS_WHEEL): { x: number; y0: number; y1: number; z: number } {
  const euc = createBlockoutEUC(look);
  try {
    const pad = euc.group.getObjectByName('euc-pad-left') as THREE.Mesh;
    assert.ok(pad?.isMesh, 'the left pad is findable by name');
    pad.geometry.computeBoundingBox();
    const box = pad.geometry.boundingBox!;
    return { x: box.max.x, y0: box.min.y, y1: box.max.y, z: box.max.z };
  } finally {
    euc.dispose();
  }
}

/** The mean vertex multiplier on a built machine's left pedal. */
function pedalPaint(look: typeof HIS_WHEEL): [number, number, number] {
  const euc = createBlockoutEUC(look);
  try {
    const pedal = euc.group.getObjectByName('euc-pedal-left') as THREE.Mesh;
    assert.ok(pedal?.isMesh, 'the left pedal is findable by name');
    const colour = pedal.geometry.getAttribute('color');
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < colour.count; i += 1) {
      r += colour.getX(i);
      g += colour.getY(i);
      b += colour.getZ(i);
    }
    return [r / colour.count, g / colour.count, b / colour.count];
  } finally {
    euc.dispose();
  }
}

test('his wheel is seated, resolves to its own row, and costs what the standard wheel costs', () => {
  // The three machine pieces arrive together or not at all (§35.3 fact 2's
  // ancestor, §23.8's reverted deviation): a mapped id with no look resolves
  // to `standard` and ships the wrong wheel without saying so. So the seat,
  // the roster, the spec, the resolver and the cost are one assertion.
  assert.equal(machineForCharacter('seal-on-a-wheel'), 'seal-on-a-wheel');
  assert.ok(MACHINE_IDS.includes('seal-on-a-wheel'), 'his wheel is not on the roster');
  assert.equal(machineSpec('seal-on-a-wheel').id, 'seal-on-a-wheel', 'his spec falls back to the first entry');
  assert.equal(machineSpec('seal-on-a-wheel').name, 'Seal on a Wheel\'s wheel');
  assert.equal(machineLook('seal-on-a-wheel'), HIS_WHEEL);

  const rows = [STANDARD_MACHINE_LOOK, HIS_WHEEL].map((look) => {
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
  const [standard, his] = rows as [typeof rows[0], typeof rows[0]];
  console.log(
    `${his.machine} meshes ${his.meshes} calls ${his.calls} triangles ${his.triangles}`
      + ` | ${standard.machine} meshes ${standard.meshes} calls ${standard.calls} triangles ${standard.triangles}`,
  );
  assert.equal(his.meshes, standard.meshes, `his wheel draws ${his.meshes} meshes against the standard ${standard.meshes}`);
  assert.equal(his.calls, standard.calls, `his wheel costs ${his.calls} draw calls against the standard ${standard.calls}`);
  // And the pinned pair, spelled out: the machine axis has cost 11 meshes and
  // 18 draw calls since M19 Phase 2 proved the standard entry a no-op, and
  // every look since has been held to it (§35.3 fact 12). A parity assertion
  // against a standard wheel that itself drifted would pass while the budget
  // moved.
  assert.equal(his.meshes, 11, `his wheel draws ${his.meshes} meshes — the axis is pinned at 11`);
  assert.equal(his.calls, 18, `his wheel costs ${his.calls} draw calls — the axis is pinned at 18`);
  // The cosmetic body's extra sections, the deck, the pad block at sixteen
  // segments and the eleven trim patches are real triangles — the axis this
  // project spends. A triangle spent on him is spent four times on a
  // four-seat BelVar (§27.5), so the margin is stated here rather than left
  // open, on FloWithZo's own ceiling.
  assert.ok(his.triangles > standard.triangles, 'the profile, the deck and the pad are real triangles');
  assert.ok(
    his.triangles - standard.triangles <= 3500,
    `his wheel spends ${his.triangles - standard.triangles} triangles over the standard`,
  );
});

test('his wheel builds on his rig, poses and disposes without throwing', () => {
  const rig = createRidingRig(HIS, HIS_WHEEL);
  rig.apply(createPose());
  rig.dispose();
});

test('a cyan body, pale trim, one pink accent — and none is borrowed', () => {
  // The shell: the identity colour *is* the base, which is the Red Rider
  // architecture and the reason every paint on this machine runs downward.
  // Bright, because the references are bright and because a body 19 × the
  // tyre's luminance is what keeps the foot of the skirt an edge rather than
  // a merge without the lift Wheel in Motion and FloWithZo both needed.
  const tyre = new THREE.Color(BLOCKOUT_COLOURS.tyre);
  assert.ok(lumaOf(SHELL) > 0.25, `the shell is ${lumaOf(SHELL).toFixed(3)} in luma — that is not a cyan body`);
  assert.ok(
    lumaOf(SHELL) > lumaOf(tyre) * 8,
    `the shell is ${lumaOf(SHELL).toFixed(3)} in luma against the tyre's ${lumaOf(tyre).toFixed(4)}`,
  );
  for (const id of MACHINE_IDS) {
    if (id === 'seal-on-a-wheel') continue;
    assert.notEqual(HIS_WHEEL.shell.colour, machineLook(id).shell.colour, `the shell is ${id}'s`);
  }

  // The hue: §35.2 overrules the photographs on this one axis, because their
  // 200–202° is `machineWheelInMotionBlue`'s exactly. The render's 194° is
  // the only open slot on the roster, and it is open by the 5° bar
  // `drunkard.test.ts:1210` set, measured in the linear space `getHSL`
  // reads — 7.7° from Wheel in Motion's blue and 10.2° from FloWithZo's cyan.
  const cyan = new THREE.Color(BLOCKOUT_COLOURS.machineSealCyan);
  for (const [name, hex] of [
    ['machineWheelInMotionBlue', BLOCKOUT_COLOURS.machineWheelInMotionBlue],
    ['floWithZoCyan', BLOCKOUT_COLOURS.floWithZoCyan],
    ['machineAdonisb2Teal', BLOCKOUT_COLOURS.machineAdonisb2Teal],
  ] as const) {
    const gap = hueGap(cyan, new THREE.Color(hex));
    assert.ok(gap >= 5, `his cyan sits ${gap.toFixed(1)}° from ${name}`);
  }
  // The pads are the same hue a stop above the body — q149's Option A, cyan
  // pads and the pink on the trim, because the shin-height mass is cyan in
  // all three references.
  const pad = new THREE.Color(BLOCKOUT_COLOURS.machineSealPad);
  assert.equal(HIS_WHEEL.pads?.colour, BLOCKOUT_COLOURS.machineSealPad, 'the side shells are not his pad cyan');
  assert.ok(lumaOf(pad) > lumaOf(SHELL) * 1.15, 'the pads are not a stop above the body');
  assert.ok(hueGap(pad, cyan) < 5, 'the pads are a different colour from the body, not a value of it');

  // The pale trim base: not a colour anybody sees, but the arithmetic every
  // pink patch depends on. `tintOver` divides, so a base darker than the
  // pink in any channel would need a multiplier over 1 — a material of its
  // own, and a second trim draw call.
  assert.equal(HIS_WHEEL.trim.colour, BLOCKOUT_COLOURS.machineSealTrim);
  const pink = new THREE.Color(BLOCKOUT_COLOURS.machineSealPink);
  assert.ok(WHEEL_TRIM.r >= pink.r && WHEEL_TRIM.g >= pink.g && WHEEL_TRIM.b >= pink.b,
    'the trim base is darker than the pink in some channel — a patch would have to reach up');

  // The one accent, and its clearances. Trollina's three magentas are the
  // near neighbours; the three reds are the rule §19.7 is written about.
  for (const [name, hex] of [
    ['machineTrollinaAccent', BLOCKOUT_COLOURS.machineTrollinaAccent],
    ['machineTrollinaEmissive', BLOCKOUT_COLOURS.machineTrollinaEmissive],
    ['statusCritical', BLOCKOUT_COLOURS.statusCritical],
    ['taillight', BLOCKOUT_COLOURS.taillight],
    ['machineRed', BLOCKOUT_COLOURS.machineRed],
  ] as const) {
    const gap = hueGap(pink, new THREE.Color(hex));
    assert.ok(gap >= 5, `his pink sits ${gap.toFixed(1)}° from ${name}`);
  }
  assert.notEqual(BLOCKOUT_COLOURS.machineSealPink, BLOCKOUT_COLOURS.machineTrollinaAccent, "the accent is Trollina's magenta");

  // Every trim patch renders as the one authored pink, and no patch asks for
  // a page: there is no sheet on this machine, which is why
  // `maribel.test.ts`'s printed-machine census needs no fourth branch.
  let accented = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    assert.equal(patch.surface ?? 'shell', 'shell', 'a trim patch rides the pad — the pad is a material, not a page');
    assert.equal(patch.art, undefined, 'a trim patch asks for a page — there is no sheet on this machine');
    const worn = wornTrim(patch.tint);
    assert.ok(
      nearHex(worn, BLOCKOUT_COLOURS.machineSealPink),
      `a patch wears (${worn.r.toFixed(2)}, ${worn.g.toFixed(2)}, ${worn.b.toFixed(2)}), not his pink`,
    );
    accented += 1;
  }
  // Two bars a flank, four bumper wedges fore and aft, one quarter bar a side
  // at mid-height, one piece at each rear shoulder, and the high-front plate
  // the render under-serves: thirteen.
  //
  // The mid-height pair is round 2's: the round-1 captures put the loudest
  // pink 70–74 % of the way down the body where the photographs put it at
  // 41 %, because the low bars sit under the side shell. The quarter bars
  // carry the same relationship at the height the references read it, on the
  // rear and nose quarters where `|z| > 0.17` clears the cyan pad.
  assert.equal(accented, 13, `${accented} pink patches — four bars, four wedges, two quarter bars, two shoulders and the nose plate`);

  // Nothing on the trim glows: the lamp and the status light are the two
  // lights this machine has, and pink plastic that glowed would be a third
  // thing beside the critical rung.
  assert.equal(HIS_WHEEL.trim.emissive, 0x000000);
  assert.equal(HIS_WHEEL.trim.emissiveIntensity, 0);
});

test('the pink is mirrored, spaced by arc, and never in the ladder\'s column', () => {
  // No pink reaches the rear centre, where the ladder lives — §19.7's margin,
  // measured as an arc gap rather than assumed from the authored numbers, and
  // it matters more on this machine than on any before it: pink is the
  // critical rung's own neighbourhood in hue, and two of these patches are at
  // the rear shoulders on purpose so the wheel is not cyan-and-black from the
  // one angle the player looks at it from. Measured worst: 0.32 rad.
  const REAR = -Math.PI / 2;
  let nearestOfAll = Infinity;
  for (const patch of HIS_WHEEL.trim.patches) {
    const nearest = Math.min(angleGap(patch.u0, REAR), angleGap(patch.u1, REAR));
    nearestOfAll = Math.min(nearestOfAll, nearest);
    assert.ok(nearest >= 0.30, `a trim patch comes within ${nearest.toFixed(2)} rad of the status light's column`);
  }
  console.log(`seal-on-a-wheel: the nearest pink stands ${nearestOfAll.toFixed(3)} rad off the ladder's column`);

  // Mirrored: every patch has its twin at θ → π − θ, or is its own twin on
  // the centreline. A machine is symmetric and an accent on one flank only
  // reads as a defect.
  for (const patch of HIS_WHEEL.trim.patches) {
    const twin = HIS_WHEEL.trim.patches.find((other) => (
      Math.abs(other.u0 - (Math.PI - patch.u1)) < 1e-9 && Math.abs(other.u1 - (Math.PI - patch.u0)) < 1e-9
      && other.from === patch.from && other.to === patch.to
    ));
    assert.ok(twin, `the patch at ${patch.u0.toFixed(2)}…${patch.u1.toFixed(2)} × ${patch.from} has no mirror`);
  }

  // And every one of them is spaced by *arc*. His flank is square-5.0, where
  // a column spaced evenly in radians covers 64 mm at one end of a band and
  // 7 mm at the other — the failure Wheel in Motion's printed plate measured
  // two looks up, and the one that turns a bar into a moulding defect.
  for (const patch of HIS_WHEEL.trim.patches) {
    assert.equal(patch.uByArc, true, 'a trim patch is spaced by angle — this section is square and angle is not arc');
  }
});

test("the pad keeps the shared pad's outer face, ring for ring", () => {
  // `halfWidth` is the pad's thickness outboard of its centre, and the shared
  // pad's is 0.8 × `WHEEL.padThickness`; a block past that moves the plane
  // the rider's shins rest against, which `riderClearance.test.ts` and the
  // planted-boots property both assume.
  const blocks = HIS_WHEEL.pads?.blocks;
  assert.ok(blocks && blocks.length === 1, 'one cyan side shell a flank');
  const outer = WHEEL.padThickness * 0.8;
  let widest = 0;
  for (const ring of blocks[0]!) {
    widest = Math.max(widest, ring.halfWidth);
    assert.ok(ring.halfWidth <= outer + 1e-9, `a pad ring at ${ring.y} is ${ring.halfWidth} thick — outside the shared face at ${outer}`);
    assert.ok(Math.abs(ring.y) <= WHEEL.padHeight / 2 + 1e-9, `a pad ring at ${ring.y} leaves the shared pad's height`);
  }
  assert.ok(Math.abs(widest - outer) < 1e-9, 'no ring reaches the shared face — the shins would float');
  assert.equal(Math.max(...blocks[0]!.map((ring) => ring.y)), SEAL_PAD_TOP, 'the pad top drifted from the constant the clearance tests read');
  assert.equal(HIS_WHEEL.pads?.segments, 16, 'the side shell is back at the shared pad’s twelve sections');

  const standard = padExtents(STANDARD_MACHINE_LOOK);
  const his = padExtents(HIS_WHEEL);
  assert.ok(Math.abs(standard.x - his.x) < 1e-6, `the pad's outer face is at ${his.x} against the shared pad's ${standard.x}`);
  assert.ok(his.y0 >= standard.y0 - 1e-6 && his.y1 <= standard.y1 + 1e-6, 'the pad leaves the shared pad\'s height');
  // Longer than the shared pad, and only a little: his side shells are broad
  // panels, but the flank fore and aft of them is where the cyan body and its
  // painted window have to read, so the overrun is capped well under
  // FloWithZo's 50 mm.
  assert.ok(his.z > standard.z, 'the cyan side shell is no longer than the shared pad');
  assert.ok(his.z - standard.z <= 0.030, `the pad reaches ${((his.z - standard.z) * 1000).toFixed(0)} mm past the shared pad's nose`);

  assert.equal(HIS_WHEEL.pads?.art, undefined, 'the pad wears a page — there is no sheet on this machine');
  assert.equal(HIS_WHEEL.atlas, undefined, 'the machine grew a sheet');
});

test('the field behind the power ladder is dark in the channels a cyan base carries', () => {
  // §19.7, and §35.3 fact 11 — the finding this whole test exists for. Every
  // bezel test before this one asserts `colour.getX(i) < 0.45`, the *red*
  // multiplier, which is honest on a neutral base where all three multipliers
  // are equal. His base is a cyan whose linear red is 0.007, so the same
  // near-black paint comes out at a red multiplier of 0.74 — a green test
  // over whatever field it likes. What carries the light here is green and
  // blue, so those are asserted, and so is the luminance the base and the
  // multiplier make together.
  const euc = createBlockoutEUC(HIS_WHEEL);
  const standard = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');
    let sampled = 0;
    let recess = 0;
    let brightest = 0;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const [r, g, b] = [colour.getX(i), colour.getY(i), colour.getZ(i)];
      // 0.078 rather than the 0.07 this was authored at: round 2 took the
      // section two stops squarer and the bezel's own columns moved out to
      // x 0.0768, so the old sample window kept only the centre column and
      // this test quietly stopped measuring the field it exists for. The bound
      // sits between that pair and the unpainted i = 19 / 23 at 0.0877.
      if (z < -0.15 && Math.abs(x) < 0.078 && y > 0.42 && y < 0.556) {
        sampled += 1;
        brightest = Math.max(brightest, paintedLuma(r, g, b));
        assert.ok(g < 0.10 && b < 0.10, `bezel vertex ${i} keeps multipliers (${g.toFixed(3)}, ${b.toFixed(3)}) on the channels the cyan carries`);
        assert.ok(
          paintedLuma(r, g, b) < lumaOf(SHELL) * 0.10,
          `bezel vertex ${i} renders at ${paintedLuma(r, g, b).toFixed(4)} against a body at ${lumaOf(SHELL).toFixed(3)}`,
        );
      }
      if (z > 0.16 && Math.abs(x) < 0.06 && y > 0.478 && y < 0.532) {
        recess += 1;
        assert.ok(g < 0.10 && b < 0.10, `nose vertex ${i} keeps multipliers (${g.toFixed(3)}, ${b.toFixed(3)}) — the recess is not dark`);
      }
    }
    assert.ok(sampled > 0, 'no shell vertices behind the status light were sampled');
    assert.ok(recess > 0, 'no shell vertices in the nose recess were sampled');
    console.log(
      `seal-on-a-wheel bezel: ${sampled} vertices, brightest renders at ${brightest.toFixed(4)}`
        + ` against a body at ${lumaOf(SHELL).toFixed(3)}`,
    );

    // The light itself: its own mesh and material, seated where the standard
    // wheel seats it, on a rear face his own profile still puts under it —
    // the profile spans 0.556 or `vAtHeight` clamps and the lamp climbs onto
    // the crown (§35.3 fact 12).
    const light = euc.statusLight.material as THREE.MeshStandardMaterial;
    const reference = standard.statusLight.material as THREE.MeshStandardMaterial;
    assert.equal(light.emissive.getHex(), reference.emissive.getHex(), "the look changed the status light's colour");
    assert.ok(euc.statusLight.position.z < -0.15 && euc.statusLight.position.y > 0.42, 'the light is not where the bezel is painted');
    const rings = HIS_WHEEL.shell.profile!;
    assert.ok(
      rings[0]!.y <= 0.556 && rings[rings.length - 1]!.y >= 0.556,
      'the profile does not span 0.556 — the status light climbs off the rear face',
    );

    // And his tail lamp, which is the other half of the same margin — round 1's
    // fix 1. This line used to read `taillight === undefined`, on the reason
    // that "the shared bar leaves the ladder its whole margin": a sentence
    // true of the standard shell and **false of his**. `euc.ts:745-749` says
    // why that bar is narrow — at chase distance the machine's whole rear read
    // as a red rectangle and the status light, the one the rider has to read,
    // was competing with it — and it was narrowed on the standard section. A
    // patch is an *arc*, so on a nearly flat square-7.0 tail the same ±0.26 rad
    // came out ±0.081 against the standard's ±0.043: **1.6 × the ladder's
    // width**, where the standard's bar is 0.86 ×. The hierarchy the comment
    // describes was inverted by the body, silently. So the look authors the
    // span (q61 — the material, and so the red, stays the shared one), and
    // what is pinned is the relationship rather than the number: the ladder is
    // the wider of the two.
    assert.ok(HIS_WHEEL.taillight, 'his tail takes the default span — on his section that is wider than the power ladder');
    const his = euc.group.getObjectByName('euc-taillight') as THREE.Mesh;
    const shared = standard.group.getObjectByName('euc-taillight') as THREE.Mesh;
    const lamp = worldWidth(his);
    const ladder = worldWidth(euc.statusLight);
    console.log(
      `seal-on-a-wheel tail lamp: ${(lamp * 1000).toFixed(1)} mm against a ${(ladder * 1000).toFixed(1)} mm ladder`
        + ` (${(ladder / lamp).toFixed(2)} ×; the standard machine 1.16 ×)`,
    );
    assert.ok(
      ladder / lamp >= 1.10,
      `the power ladder is ${(ladder / lamp).toFixed(2)} × his tail lamp's width — the lamp is competing with the readout`,
    );
    // Vertex for vertex the shared bar still: only the span moved, so
    // `uSegments` and `vSegments` are the default's and the lamp costs what
    // every other machine's costs.
    assert.equal(
      his.geometry.getAttribute('position').count,
      shared.geometry.getAttribute('position').count,
      'his tail lamp is not the shared bar, vertex for vertex',
    );
  } finally {
    euc.dispose();
    standard.dispose();
  }
});

test('both lamps are the standard lamps, and his section may not inflate them', () => {
  // Round 1's fixes 1 and 2, and the one mechanism under both: a lamp is
  // authored as an **arc** and built on the look's own section, so a span
  // tuned on the standard shell means something else entirely on a square-7.0
  // body. On his rings the lamp's half-width is 0.118 · (sin Δ)^{2/7} — a
  // curve that is almost flat across the centreline — and the two spans this
  // look shipped at, ±0.26 rad of tail (the shared default) and ±0.44 of
  // nose, came out **88 % and 54 % wider** than the shapes those numbers were
  // chosen for.
  //
  // Neither lamp's **colour** is this look's to touch: `headlightMaterial` and
  // `taillightMaterial` are one material each across the nine machines, and a
  // tail lamp's red is road grammar (the `MachineLook.taillight` doc comment —
  // *"a look only gets to say how much of it there is"*). So size is the whole
  // handle, and it is measured here on the built meshes against the standard
  // machine's, because the arithmetic that produces it lives in the section
  // and not in the constants.
  const his = createBlockoutEUC(HIS_WHEEL);
  const standard = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  try {
    for (const name of ['euc-headlight', 'euc-taillight'] as const) {
      const mine = his.group.getObjectByName(name) as THREE.Mesh;
      const theirs = standard.group.getObjectByName(name) as THREE.Mesh;
      assert.ok(mine?.isMesh && theirs?.isMesh, `${name} is findable by name on both machines`);
      const width = worldWidth(mine);
      const reference = worldWidth(theirs);
      const area = worldArea(mine);
      const referenceArea = worldArea(theirs);
      console.log(
        `seal-on-a-wheel ${name}: ${(width * 1000).toFixed(1)} mm / ${area.toFixed(5)} m²`
          + ` against the standard ${(reference * 1000).toFixed(1)} mm / ${referenceArea.toFixed(5)} m²`,
      );
      // Never more than a tenth over the standard lamp in either measure —
      // the span is re-derived per section to *reach* this, not held at the
      // number that happens to ship.
      assert.ok(
        width <= reference * 1.10,
        `his ${name} is ${(width * 1000).toFixed(1)} mm against the standard lamp's ${(reference * 1000).toFixed(1)} mm`,
      );
      assert.ok(
        area <= referenceArea * 1.10,
        `his ${name} covers ${area.toFixed(5)} m² against the standard lamp's ${referenceArea.toFixed(5)} m²`,
      );
      // And it is still a lamp and not a sliver: a span re-derived too far in
      // would shrink the lens off the nose and nothing else in the file would
      // notice.
      assert.ok(
        width >= reference * 0.85,
        `his ${name} is ${(width * 1000).toFixed(1)} mm — the standard lamp is ${(reference * 1000).toFixed(1)} mm`,
      );
      // The material is the shared one, on both machines, in both channels
      // that make a lamp read: this look changed how much there is, not what
      // colour it is.
      const mineMaterial = mine.material as THREE.MeshStandardMaterial;
      const theirsMaterial = theirs.material as THREE.MeshStandardMaterial;
      assert.equal(mineMaterial.emissive.getHex(), theirsMaterial.emissive.getHex(), `the look changed ${name}'s emissive`);
      assert.equal(mineMaterial.color.getHex(), theirsMaterial.color.getHex(), `the look changed ${name}'s colour`);
      assert.equal(mineMaterial.emissiveIntensity, theirsMaterial.emissiveIntensity, `the look changed ${name}'s intensity`);
      assert.equal(
        mine.geometry.getAttribute('position').count,
        theirs.geometry.getAttribute('position').count,
        `his ${name} is not the standard lamp, vertex for vertex`,
      );
    }
    // The pair's own order, which is the thing the standard machine is
    // arranged in and his had inverted: the nose lens is the bigger lamp and
    // the tail bar is the smaller one.
    assert.ok(
      worldWidth(his.group.getObjectByName('euc-headlight')!) > worldWidth(his.group.getObjectByName('euc-taillight')!),
      'his tail bar is wider than his nose lens — the rear is the loudest end of the machine',
    );
  } finally {
    his.dispose();
    standard.dispose();
  }
});

test('the deck is a block on the crown, and his pedals are a fourth black', () => {
  // The deck: a low flat block, not a saddle — he stands — inside the
  // crouched-hip ceiling the seated wheels are pinned under, and wider than
  // the crown it sits on so it has an edge. The handle branch is arithmetic
  // against `WHEEL.shellHeight` and yields a 10 mm post over a profile
  // topping out at 0.602 (§35.3 fact 12), so there is no handle on this
  // machine and the photographs show none either.
  const top = HIS_WHEEL.top;
  assert.equal(top.kind, 'saddle');
  assert.ok(top.kind === 'saddle');
  const crown = Math.max(...top.profile.map((ring) => ring.y));
  const shellTop = Math.max(...HIS_WHEEL.shell.profile!.map((ring) => ring.y));
  assert.ok(crown - shellTop <= 0.020, `the deck stands ${((crown - shellTop) * 1000).toFixed(0)} mm off the shell — that is a saddle`);
  assert.ok(crown <= RIDER.hipHeight - RIDER_BLOCKOUT.crouchHipDrop - 0.10, 'the deck reaches the crouched hips');
  const lip = Math.max(...top.profile.map((ring) => ring.halfWidth));
  const shellCrown = HIS_WHEEL.shell.profile!.reduce((a, b) => (b.y > a.y ? b : a));
  assert.ok(lip > shellCrown.halfWidth, 'the deck is narrower than the crown — a rounding, not a block');
  const deck = new THREE.Color(SHELL.r * top.tint[0], SHELL.g * top.tint[1], SHELL.b * top.tint[2]);
  assert.ok(lumaOf(deck) < lumaOf(SHELL), 'the deck is lighter than the body it sits on');
  // Tinted *down* rather than to black: the cyan frame arches over the top in
  // every reference and the dark there is the core seen between its arms, not
  // the bodywork. So the deck keeps his hue and the core is `paintShell`'s.
  assert.ok(hueGap(deck, SHELL) < 12, 'the deck has left the machine\'s own hue');

  // **And the core is a channel, not a lid** — round 1's fix 3. `paintShell`'s
  // deck branch cut `core = y > 0.612` alone, which on this deck is the whole
  // top cap: `SEAL_CAVITY` came to 9.2 % of the machine's top view against
  // `SEAL_DECK`'s 8.4 %, so the crown read as a black lid with a cyan rim —
  // the opposite of what the tint's own comment, this test's comment above and
  // the references all say, which is cyan arms arching over with a narrow dark
  // channel running fore-aft between them. The bound in `x` is the fix.
  //
  // **0.040 is a column count, not a width** — the bezel's lesson, one surface
  // up, and it bites harder here because the deck loft is **20** columns and
  // not the shell's 28 (`euc.ts:621`). The cap ring is y 0.620, halfWidth
  // 0.074, square 4.2, so its columns stand at x 0.0740, 0.0723, 0.0669,
  // 0.0575, 0.0423 and 0: the bound has 2 mm of room between the fore-and-aft
  // poles and the next column in, and it takes those two plus the fan's centre
  // vertex. Three positions of twenty-one, and the count is pinned because a
  // reshaped deck would slide every one of them past the bound with the rest
  // of this file still green.
  const crownPaint = ((): { dark: string[]; positions: number } => {
    const euc = createBlockoutEUC(HIS_WHEEL);
    try {
      const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
      assert.ok(shell?.isMesh, 'the shell is findable by name');
      const position = shell.geometry.getAttribute('position');
      const colour = shell.geometry.getAttribute('color');
      const dark = new Set<string>();
      const all = new Set<string>();
      // `+ 0` because a pole's `x` is the superellipse's own rounding error —
      // 1e-9 either side of nothing — and `(-0).toFixed(4)` is `'-0.0000'`,
      // which would sort and compare as a different place from `'0.0000'`.
      const place = (value: number): string => `${Math.round(value * 1e4) / 1e4 + 0}`;
      for (let i = 0; i < position.count; i += 1) {
        if (position.getY(i) <= 0.612) continue;
        const at = `${place(position.getX(i))},${place(position.getZ(i))}`;
        all.add(at);
        // Green, not luminance: on a cyan base the dark paints are told apart
        // in the channels the cyan carries (this file's opening note), and
        // `SEAL_CAVITY` multiplies green by 0.016 where `SEAL_DECK` multiplies
        // it by 0.24.
        if (colour.getY(i) < 0.10) dark.add(at);
      }
      return { dark: [...dark].sort(), positions: all.size };
    } finally {
      euc.dispose();
    }
  })();
  console.log(`seal-on-a-wheel crown: ${crownPaint.dark.length} dark of ${crownPaint.positions} positions — [${crownPaint.dark.join('] [')}]`);
  // Both poles and the fan's centre, and nothing else: the channel runs
  // nose-to-tail and is unbroken through the middle of the cap, and no column
  // off the fore-aft axis is dark.
  assert.deepEqual(
    crownPaint.dark,
    ['0,-0.13', '0,0', '0,0.13'],
    `the crown's dark is ${crownPaint.dark.length} of ${crownPaint.positions} positions — that is a lid, not a channel`,
  );

  // The pedals: black polymer, and a *fourth* distinct value. Three are
  // taken — Adonisb2 ×0.11, Wheel in Motion ×0.16, the Drunkard ×0.20 — and
  // the rule those three were chosen under is that black-pedalled machines
  // are not one machine. Measured on the built plates rather than read off
  // the source, because a painter that silently stopped running would leave
  // the constants right and the pedals wrong.
  const mine = pedalPaint(HIS_WHEEL);
  for (const [name, look] of [
    ['adonisb2', ADONISB2_MACHINE_LOOK],
    ['wheel-in-motion', WHEEL_IN_MOTION_MACHINE_LOOK],
    ['drunkard', DRUNKARD_MACHINE_LOOK],
    ['standard', STANDARD_MACHINE_LOOK],
  ] as const) {
    const other = pedalPaint(look);
    const apart = Math.max(...mine.map((v, i) => Math.abs(v - other[i]!)));
    assert.ok(apart > 0.005, `his pedals are ${name}'s, to ${apart.toFixed(4)}`);
  }
  console.log(`seal-on-a-wheel pedal paint: ${mine.map((v) => v.toFixed(3)).join(', ')}`);
});

test("his body is nobody else's body", () => {
  // The template was Wheel in Motion's and FloWithZo's — the tall performance
  // shell, the flat deck, the pale trim base every accent is tinted down
  // from — and a template copied whole is a recolour. The profile is
  // re-proportioned to his own photographs (§35.5): a shorter nose-to-tail
  // box on squarer flanks, a stack of slabs rather than a smooth loft.
  for (const [name, look] of [
    ['wheel-in-motion', WHEEL_IN_MOTION_MACHINE_LOOK],
    ['flo-with-zo', FLO_WITH_ZO_MACHINE_LOOK],
  ] as const) {
    assert.notDeepEqual(HIS_WHEEL.shell.profile, look.shell.profile, `his shell is ${name}'s, ring for ring`);
    assert.notDeepEqual(HIS_WHEEL.pads?.blocks, look.pads?.blocks, `his pad is ${name}'s, ring for ring`);
  }
  const rings = HIS_WHEEL.shell.profile!;
  const deepest = Math.max(...rings.map((ring) => ring.halfDepth));
  const squarest = Math.max(...rings.map((ring) => ring.square ?? 2));
  assert.ok(deepest <= 0.250, `his body reaches ${(deepest * 1000).toFixed(0)} mm of half-depth — that is FloWithZo's nose`);
  assert.ok(deepest >= 0.240, `his body reaches only ${(deepest * 1000).toFixed(0)} mm of half-depth`);
  // §35.5 authorised `square` 4.6–5.0 in the belief that it bought "a stack of
  // flat slabs". Round 1 measured what it actually buys: at square 5.0 the
  // section reaches 75.8 % of its bounding box on the diagonal, where a slab
  // reaches 100 %, and all three critics read the body as a rounded barrel.
  // The band is therefore carried up by two stops to 6.4–7.0 — 84.1 % on the
  // diagonal — which is the flattest section this loft can express without a
  // hard crease in `u`, and `loftGeometry` has none to give
  // (`blockoutKit.ts:255-262`). The floor stays a band and not a literal so
  // the skirt's and the crown's taper keeps its two stops of give.
  assert.ok(squarest >= 6.4 && squarest <= 7.0, `his flank is square-${squarest} — round 1's measured band is 6.4 to 7.0`);

  assert.equal(HIS_WHEEL.atlas, undefined, 'the machine grew a sheet');
  assert.equal(HIS_WHEEL.pads?.art, undefined, 'the pad grew a page');
  assert.notEqual(HIS_WHEEL.top.kind, 'handle');
  // The tyre is the shipped black, plain: the references show a fat black
  // tyre with no rim ring, there is no `paintTyre` hook and §34.14 forbids
  // adding one, and a cyan body clears the tyre by 19 × in luminance without
  // one.
  assert.equal(HIS_WHEEL.tyre?.lugs, undefined, 'the tyre grew lugs');
  assert.equal(HIS_WHEEL.tyre?.colour, undefined, 'the tyre is not the standard black');
  assert.equal(HIS_WHEEL.tyre?.roughness, 0.90);
});

/** The shell loft's radial segments (`euc.ts:600`) — the columns every bound below selects over. */
const SHELL_COLUMNS = 28;

interface ShellVertex {
  /** The authored ring this vertex sits on, in machine metres. */
  ring: number;
  /** Its column, 0 at the rider's left and running toward the nose. */
  column: number;
  /** Its vertex colour, rounded — the paint family it belongs to. */
  key: string;
  x: number;
  z: number;
  painted: boolean;
  bright: boolean;
}

/**
 * Every lofted shell vertex, with the column it belongs to recovered from its
 * own position.
 *
 * The column is not stored anywhere — `loftGeometry` merges the body, the deck
 * and the end caps into one mesh and the indices mean nothing afterwards — so
 * it is inverted out of the superellipse the vertex was built by: `x` and `z`
 * over the ring's half-extents, raised to `square / 2`, are `cos u` and
 * `sin u`. Positions are float32 against authored doubles, hence the 1e-5
 * ring match, and the flat end caps' centre vertices have no column at all.
 */
function shellVertices(): ShellVertex[] {
  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');
    const rings = HIS_WHEEL.shell.profile!;
    const out: ShellVertex[] = [];
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const ring = rings.find((candidate) => Math.abs(candidate.y - y) < 1e-5);
      if (!ring || (Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6)) continue;
      const power = (ring.square ?? 2) / 2;
      const cosU = Math.sign(x) * Math.abs(x / ring.halfWidth) ** power;
      const sinU = Math.sign(z) * Math.abs(z / ring.halfDepth) ** power;
      let angle = Math.atan2(sinU, cosU);
      if (angle < 0) angle += Math.PI * 2;
      const [r, g, b] = [colour.getX(i), colour.getY(i), colour.getZ(i)];
      out.push({
        ring: ring.y,
        column: Math.round((angle / (Math.PI * 2)) * SHELL_COLUMNS) % SHELL_COLUMNS,
        x,
        z,
        key: `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`,
        painted: Math.abs(r - 1) > 1e-4 || Math.abs(g - 1) > 1e-4 || Math.abs(b - 1) > 1e-4,
        // Every channel over 1, not any: on a cyan base whose linear red is
        // 0.007, a paint that darkens the machine still carries a red
        // multiplier over 1 — `SEAL_WINDOW` does — and `Math.max` would call
        // the dark band a highlight (this file's opening note, again).
        bright: Math.min(r, g, b) > 1 + 1e-4,
      });
    }
    return out;
  } finally {
    euc.dispose();
  }
}

/** Metres from the status light's world bounding box to the nearest pink vertex. */
function nearestAccentToLadder(): number {
  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const light = euc.statusLight;
    light.updateWorldMatrix(true, false);
    light.geometry.computeBoundingBox();
    const box = light.geometry.boundingBox!.clone().applyMatrix4(light.matrixWorld);
    const accent = euc.group.getObjectByName('euc-accent') as THREE.Mesh;
    assert.ok(accent?.isMesh, 'the trim is findable by name');
    accent.updateWorldMatrix(true, false);
    const position = accent.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    let nearest = Infinity;
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(accent.matrixWorld);
      nearest = Math.min(nearest, box.distanceToPoint(point));
    }
    return nearest;
  } finally {
    euc.dispose();
  }
}

test('every painted band still selects the columns its bounds were authored for', () => {
  // **The contract round 1 found nothing asserting**, and the reason this test
  // exists: the bezel, the nose recess and the flank window are selected by
  // hard coordinate bounds over a superellipse, not by column index. Reshape
  // the section — which round 2 does, two stops of `square` — and every bound
  // slides along the surface silently. At square 7.0 the rear pair moves out
  // to x 0.0768 and the old 0.075 bound would have collapsed the §19.7 bezel
  // to the single centre column: a passing suite, a shipped machine, and no
  // dark field behind the power ladder. So the *counts* are pinned here, and
  // the next person who reshapes this body is told rather than trusted.
  const vertices = shellVertices();
  assert.ok(vertices.length > 300, `${vertices.length} lofted shell vertices — the walk found no body`);
  const columnsWhere = (predicate: (vertex: ShellVertex) => boolean): number[] => (
    [...new Set(vertices.filter(predicate).map((vertex) => vertex.column))].sort((a, b) => a - b)
  );

  // The bezel: three rear columns, on every body ring under the shoulder
  // chamfer. Not two (the field loses its margin at the light's own ends) and
  // not five (the dark runs out past `FX.statusLightWidth` onto the flank).
  for (const ring of [0.452, 0.502, 0.508, 0.550, 0.556]) {
    // −0.21 and not the branch's own −0.15: the window's rearmost column sits
    // at z −0.1595 and is painted too, and this is a count of the bezel.
    const rear = columnsWhere((vertex) => vertex.ring === ring && vertex.painted && vertex.z < -0.21);
    assert.deepEqual(rear, [20, 21, 22], `the bezel selects ${rear.length} rear columns at ring ${ring}: [${rear}]`);
  }
  // The nose recess the lamp sits in, which shares the bezel's x bound and so
  // shares its collapse.
  for (const ring of [0.502, 0.508]) {
    const nose = columnsWhere((vertex) => vertex.ring === ring && vertex.painted && vertex.z > 0.21);
    assert.deepEqual(nose, [6, 7, 8], `the nose recess selects ${nose.length} columns at ring ${ring}: [${nose}]`);
  }
  // The flank window: three columns a flank, at every ring it spans — square,
  // not a trapezoid. Its fore-aft bound cuts a body that narrows with height,
  // so a bound set for the widest ring admits a fourth column at the top of
  // the band; this is the assertion that catches it.
  const windowRings = [0.508, 0.550, 0.556, 0.568];
  for (const ring of windowRings) {
    const flank = (vertex: ShellVertex): boolean => vertex.ring === ring && vertex.painted && Math.abs(vertex.z) < 0.19;
    const left = columnsWhere((vertex) => flank(vertex) && vertex.x > 0);
    const right = columnsWhere((vertex) => flank(vertex) && vertex.x < 0);
    assert.deepEqual(left, [0, 1, 27], `the window selects ${left.length} columns on the left flank at ring ${ring}: [${left}]`);
    assert.deepEqual(right, [13, 14, 15], `the window selects ${right.length} columns on the right flank at ring ${ring}: [${right}]`);
  }

  // And its height, which is what round 1 measured as the finding: the window
  // read 11.6 % of the machine's coloured height against ≈ 27 % in the
  // photographs. Everything below 0.502 is behind the cyan side shell (q149's
  // Option A), so the ceiling is the shoulder chamfer, and this is it: the
  // band runs the 0.508 ring to the 0.568 one over a 370 mm body.
  // Taken as the window's own colour family rather than as "dark paint on the
  // flank", which would also collect the skirt's foot and the shoulder
  // chamfer and measure the whole machine.
  const sample = vertices.find((vertex) => vertex.ring === 0.508 && vertex.column === 1);
  assert.ok(sample?.painted, 'the flank window is not painted at the ring its lower pair was authored for');
  const window = vertices.filter((vertex) => vertex.key === sample.key);
  const lowest = Math.min(...window.map((vertex) => vertex.ring));
  const highest = Math.max(...window.map((vertex) => vertex.ring));
  const body = 0.620 - 0.250;
  console.log(`seal-on-a-wheel flank window: ${lowest}…${highest} m, ${((highest - lowest) / body * 100).toFixed(1)}% of the body`);
  assert.ok(highest - lowest >= 0.055, `the flank window is ${((highest - lowest) * 1000).toFixed(0)} mm tall`);
  assert.ok((highest - lowest) / body >= 0.16, 'the flank window is back under a sixth of the body');

  // The shoulder chamfer, and the reason its bound is 0.576 rather than the
  // 0.574 ring it sits above: float32 rounds 0.574 *up*, so `y > 0.574` would
  // take the window's own upper frame ring and light the top edge of the
  // dark band.
  const brightRings = [...new Set(vertices.filter((vertex) => vertex.bright).map((vertex) => vertex.ring))].sort((a, b) => a - b);
  assert.deepEqual(brightRings, [0.578, 0.592], `the shoulder chamfer lights rings [${brightRings}]`);

  // §19.7's margin as a distance rather than an arc: the pink round 2 moved up
  // the flank stays as far from the power ladder as round 1 measured it.
  const nearest = nearestAccentToLadder();
  console.log(`seal-on-a-wheel: the nearest pink vertex stands ${(nearest * 1000).toFixed(1)} mm off the status light's box`);
  assert.ok(nearest >= 0.0249, `the nearest pink vertex is ${(nearest * 1000).toFixed(1)} mm from the status light's box`);
});

test('the shell answers the sun like moulded plate, not like chrome', () => {
  // Round 2's blocker, and the one half of it this type can say. Both panels
  // measured the same column down what they called the sunlit flank in
  // `side.png` — 90 px, luminance falling 1.92 : 1 at a saturation spread of
  // 0.478 — and **round 3 proved that column is not this material**: it is
  // `euc-pad-left` at `pads.roughness` 0.62, byte-identical at shell 0.50 and
  // at 0.68, and a controlled A/B at `pads.roughness` 0.95 moves it
  // (`seal-views/wheel-r3/ab/pad-roughness-095/`, 5,138 px in a box holding all
  // four sample points). What 0.68 is authored off is its own four-view
  // capture: the specular sweep flattens side 3.22 → 3.07, back 5.71 → 5.07,
  // top 5.99 → 5.70, front 7.06 → 6.07, and 17,047 px change in `side.png`
  // alone.
  //
  // **So do not chase 0.78 inside the band below.** Round 2's acceptance number
  // (≤ 1.35 at ≤ 0.25) is out of reach of any legal `pads.roughness`, let alone
  // of this one — closing it is a lighting change, and this machine does not
  // own the light. The band exists to hold the value where the capture put it,
  // not to invite a walk to its top.
  //
  // The other half — flat plates, hard chamfers — is capped and stays on the
  // record: `MachineLook.shell` offers `colour`, `roughness` and `profile`,
  // `loftGeometry` shares its seam and runs `computeVertexNormals`, and
  // `square` is already spent two stops past §35.5's authorisation. A
  // genuinely faceted machine needs a shading field on the type.
  const shell = HIS_WHEEL.shell.roughness!;
  assert.ok(shell >= 0.64 && shell <= 0.78, `his shell answers the sun at roughness ${shell}`);
  // The order is the materials': moulded plate over moulded pad over rubber.
  // The two performance wheels before him both carry 0.50, inherited rather
  // than captured; his is authored off his own four-view sweep.
  assert.ok(shell > HIS_WHEEL.pads!.roughness!, `the shell (${shell}) is glossier than its own pads`);
  assert.ok(shell < HIS_WHEEL.tyre!.roughness!, `the shell (${shell}) is rougher than its own tyre`);
});

/** The built trim mesh's vertices in the machine's own frame — the accent is unparented, so these are the authored metres. */
function accentVertices(): THREE.Vector3[] {
  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const accent = euc.group.getObjectByName('euc-accent') as THREE.Mesh;
    assert.ok(accent?.isMesh, 'the trim is findable by name');
    const position = accent.geometry.getAttribute('position');
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i += 1) out.push(new THREE.Vector3().fromBufferAttribute(position, i));
    return out;
  } finally {
    euc.dispose();
  }
}

/** The built trim mesh's triangle count — what a reseat may not change. */
function accentTriangles(): number {
  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const accent = euc.group.getObjectByName('euc-accent') as THREE.Mesh;
    const index = accent.geometry.getIndex();
    return (index ? index.count : accent.geometry.getAttribute('position').count) / 3;
  } finally {
    euc.dispose();
  }
}

test('the rear-shoulder pink sits down on the shoulder instead of standing off it', () => {
  // Round 2's other confirmed finding, and it has a mechanism rather than a
  // taste. The pair is authored across `from 0.562` to `to 0.594`, which is
  // almost entirely the shoulder chamfer: the section falls from `halfDepth`
  // 0.234 at y 0.556 to 0.178 at 0.592, about one in one. A 30 mm `lift`
  // along a normal tilted that far does not stand the piece on a flank, it
  // throws it out and up — built, its highest vertex stood 2.5 mm **above**
  // the machine's crown and its widest 12 mm **outboard** of the widest ring
  // anywhere on the body, which from the front three-quarter is a splayed fan
  // showing its own rim against the sky.
  //
  // Refuted in the same finding and worth keeping here so nobody repairs the
  // wrong thing: the pieces are not thin (a `MachinePatch` is a solid, and
  // this pair measures 40 mm through) and they do not float (every inner-face
  // vertex on the lower edge is inside the shell's implicit surface).
  // `sink` goes with `lift` only so the shortened rim still meets the shell
  // well inside it.
  const euc = createBlockoutEUC(HIS_WHEEL);
  let crown: number;
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    shell.geometry.computeBoundingBox();
    crown = shell.geometry.boundingBox!.max.y;
  } finally {
    euc.dispose();
  }
  const vertices = accentVertices();
  const above = vertices.filter((vertex) => vertex.y > crown).length;
  const highest = Math.max(...vertices.map((vertex) => vertex.y));
  console.log(`seal-on-a-wheel: the pink tops out at ${highest.toFixed(4)} m against a crown of ${crown.toFixed(4)} m`);
  assert.equal(above, 0, `${above} pink vertices stand above the machine's crown`);
  assert.ok(highest <= 0.616, `the highest pink vertex is at ${highest.toFixed(4)} m`);

  // The rear shoulders by their own band, so the bumper wedges — which stand
  // outboard on purpose, as the photographs' lower pink block does — are not
  // dragged into the measure.
  const shoulder = vertices.filter((vertex) => vertex.z < -0.12 && vertex.y > 0.545);
  assert.ok(shoulder.length > 0, 'the rear-shoulder band selects nothing — the band moved');
  const widest = Math.max(...shoulder.map((vertex) => Math.abs(vertex.x)));
  console.log(`seal-on-a-wheel: the rear-shoulder pink reaches |x| ${widest.toFixed(4)} m`);
  assert.ok(widest <= 0.122, `the rear-shoulder pink reaches |x| ${(widest * 1000).toFixed(1)} mm`);

  // §19.7 again, and the reason this fix is worth having twice over: the
  // reseat pulls the piece inboard, so it moves the pink **away** from the
  // power ladder rather than toward it. 31.4 mm is the round-2 measurement
  // the reseat has to beat, over and above the 24.9 mm floor the file already
  // pins.
  const nearest = nearestAccentToLadder();
  assert.ok(nearest >= 0.0314, `the nearest pink vertex is ${(nearest * 1000).toFixed(2)} mm from the status light's box`);

  // And it costs nothing: a patch's face area is set by its `u`/`v` span, and
  // `lift` and `sink` move vertices the mesh already had. Same triangles, same
  // one merged accent mesh, no pink area added — which is piece 6's standing
  // constraint that the pink must not multiply.
  assert.equal(accentTriangles(), 1292, 'the reseat changed the trim mesh');
});
