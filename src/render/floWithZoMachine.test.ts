/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, FX, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { MACHINE_IDS, machineForCharacter, machineSpec } from '../data/machines.ts';
import { createPose } from '../simulation/EucController.ts';
import { createBlockoutEUC } from './euc.ts';
import { createRidingRig } from './ridingRig.ts';
import {
  FLO_PAD_TOP,
  FLO_WITH_ZO_MACHINE_LOOK,
  STANDARD_MACHINE_LOOK,
  WHEEL_IN_MOTION_MACHINE_LOOK,
  machineLook,
} from './machineLook.ts';
import { measureObject } from './renderCost.ts';
import { FLO_WITH_ZO_LOOK } from './riderLook.ts';

/**
 * FloWithZo's wheel — M34 Phase 2, and what only the built machine knows.
 *
 * His own file, deliberately: the rider's look and the machine's row were
 * built in the same window by different hands (`docs/PLANS.md` §34.9), and a
 * shared test file is a shared merge. What is asserted here is what a capture
 * cannot show — the parity the whole axis is pinned to, the direction every
 * paint runs in, the plane the rider's shins rest against, and the dark field
 * §19.7 requires behind the status light on a machine whose one warm colour
 * is the amber rung's neighbour in hue.
 *
 * The photographs are the authority for what it looks like; this file is the
 * authority for what it costs and what it may not do.
 */

const HIS = FLO_WITH_ZO_LOOK;
const HIS_WHEEL = FLO_WITH_ZO_MACHINE_LOOK;
const WHEEL_TRIM = new THREE.Color(BLOCKOUT_COLOURS.machineFloWithZoTrim);

const lumaOf = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const hueOf = (c: THREE.Color): number => { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return h.h * 360; };
const nearHex = (c: THREE.Color, hex: number, tolerance = 0.02): boolean => {
  const target = new THREE.Color(hex);
  return Math.max(Math.abs(c.r - target.r), Math.abs(c.g - target.g), Math.abs(c.b - target.b)) < tolerance;
};
/** A trim patch's rendered colour: its tint over the trim base, or the base itself. */
const wornTrim = (tint: readonly [number, number, number] | undefined): THREE.Color => (
  tint ? new THREE.Color(tint[0] * WHEEL_TRIM.r, tint[1] * WHEEL_TRIM.g, tint[2] * WHEEL_TRIM.b) : WHEEL_TRIM.clone()
);
/** The smallest angle between two loft angles, radians. */
const angleGap = (a: number, b: number): number => {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
};

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

test('his wheel is seated, resolves to its own row, and costs what the standard wheel costs', () => {
  // The three machine pieces arrive together or not at all (§34.3 fact 1's
  // ancestor, §23.8's reverted deviation): a mapped id with no look resolves
  // to `standard` and ships the wrong wheel without saying so. So the seat,
  // the roster, the spec, the resolver and the cost are one assertion.
  assert.equal(machineForCharacter('flo-with-zo'), 'flo-with-zo');
  assert.ok(MACHINE_IDS.includes('flo-with-zo'), 'his wheel is not on the roster');
  assert.equal(machineSpec('flo-with-zo').id, 'flo-with-zo', 'his spec falls back to the first entry');
  assert.equal(machineSpec('flo-with-zo').name, "FloWithZo's wheel");
  assert.equal(machineLook('flo-with-zo'), HIS_WHEEL);

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
  // every look since has been held to it (§34.5). A parity assertion against
  // a standard wheel that itself drifted would pass while the budget moved.
  assert.equal(his.meshes, 11, `his wheel draws ${his.meshes} meshes — the axis is pinned at 11`);
  assert.equal(his.calls, 18, `his wheel costs ${his.calls} draw calls — the axis is pinned at 18`);
  // The cosmetic body's four extra sections, the deck, the longer pad block
  // at sixteen segments and the five trim patches are real triangles — the
  // axis this project spends. 812 at Phase 2, and a triangle spent on him is
  // spent four times on a four-seat BelVar (§27.5), so the margin is stated
  // here rather than left open.
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

test('graphite shell, pale trim, one warm accent — and none is borrowed', () => {
  // The shell: a neutral graphite with headroom. Dark enough to read as the
  // photographs' dark body, light enough that the bezel and the nose recess
  // can still be painted *down* from it, and its own — no two machines on
  // this roster share a shell colour, which is the one field that reads at
  // every distance.
  const shell = new THREE.Color(HIS_WHEEL.shell.colour);
  const graphite = new THREE.Color(BLOCKOUT_COLOURS.machineWheelInMotion);
  assert.ok(lumaOf(shell) < 0.08, `the shell is ${lumaOf(shell).toFixed(3)} in luma — that is not a dark body`);
  assert.ok(
    lumaOf(shell) > lumaOf(graphite) * 1.3,
    `the shell is ${lumaOf(shell).toFixed(3)} in luma — no headroom over Wheel in Motion's ${lumaOf(graphite).toFixed(3)}`,
  );
  for (const id of MACHINE_IDS) {
    if (id === 'flo-with-zo') continue;
    assert.notEqual(HIS_WHEEL.shell.colour, machineLook(id).shell.colour, `the shell is ${id}'s`);
  }

  // The pale trim base: the trim material, the pads' own colour, and what
  // every accent on the machine is painted down from. No page anywhere —
  // §34.3 fact 9 is why there is no sheet on him or on his wheel.
  assert.equal(HIS_WHEEL.trim.colour, BLOCKOUT_COLOURS.machineFloWithZoTrim);
  assert.equal(HIS_WHEEL.pads?.colour, BLOCKOUT_COLOURS.machineFloWithZoTrim, 'the pale side shell is not the trim base');
  assert.ok(lumaOf(WHEEL_TRIM) > 0.6, 'the trim base is not pale enough to be a side shell');

  // The one warm accent: hue 22°, between the badge in the front photograph
  // and the rim arc in the rear one, clear of the Drunkard's amber by the
  // `drunkard.test.ts:1210` precedent and deliberately not Wheel in Motion's
  // hex — three warm machines on one roster, three constants.
  const orange = new THREE.Color(BLOCKOUT_COLOURS.machineFloWithZoOrange);
  const amber = new THREE.Color(BLOCKOUT_COLOURS.machineDrunkardAmber);
  assert.ok(
    Math.abs(hueOf(orange) - hueOf(amber)) >= 5,
    `his orange sits ${Math.abs(hueOf(orange) - hueOf(amber)).toFixed(1)}° from the Drunkard's amber`,
  );
  assert.notEqual(BLOCKOUT_COLOURS.machineFloWithZoOrange, BLOCKOUT_COLOURS.wheelInMotionOrange, "the accent is Wheel in Motion's orange");
  assert.notEqual(BLOCKOUT_COLOURS.machineFloWithZoOrange, BLOCKOUT_COLOURS.statusWarn, "the accent is the status light's amber rung");

  // Every trim patch renders as one of the two authored colours, and no patch
  // asks for a page.
  let warm = 0;
  let plain = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    assert.equal(patch.surface ?? 'shell', 'shell', 'a trim patch rides the pad — the pad is a material, not a page');
    assert.equal(patch.art, undefined, 'a trim patch asks for a page — there is no sheet on this machine');
    const worn = wornTrim(patch.tint);
    if (patch.tint) {
      assert.ok(
        nearHex(worn, BLOCKOUT_COLOURS.machineFloWithZoOrange),
        `a tinted patch wears (${worn.r.toFixed(2)}, ${worn.g.toFixed(2)}, ${worn.b.toFixed(2)}), not his orange`,
      );
      warm += 1;
    } else {
      assert.ok(nearHex(worn, BLOCKOUT_COLOURS.machineFloWithZoTrim), 'an untinted patch is not the trim base');
      plain += 1;
    }
  }
  // Two band pieces a flank and one nose badge; and, from round 2, the two
  // pale nose devices PHOTO 1 carries — the plate the badge is set into and
  // the concentric boss above the lamp — which wear the trim base itself.
  // Untinted is the point: the direction rule forbids reaching *up* from a
  // pale base, so hardware on this machine is the base and colour is a tint
  // down from it.
  assert.equal(warm, 5, `${warm} warm patches — two band pieces a flank and the badge`);
  assert.equal(plain, 2, `${plain} untinted trim patches — the badge's plate and the nose boss`);

  // Nothing on the trim glows: the lamp and the status light are the two
  // lights this machine has, and orange plastic that glowed would be a third
  // thing competing with the amber rung.
  assert.equal(HIS_WHEEL.trim.emissive, 0x000000);
  assert.equal(HIS_WHEEL.trim.emissiveIntensity, 0);

  // And no warm patch reaches the rear centre, where the ladder lives —
  // §19.7's margin, measured as an arc gap rather than assumed from the
  // authored numbers.
  const REAR = -Math.PI / 2;
  for (const patch of HIS_WHEEL.trim.patches) {
    const nearest = Math.min(
      angleGap(patch.u0, REAR),
      angleGap(patch.u1, REAR),
      (patch.u0 <= REAR && REAR <= patch.u1)
        || (patch.u0 <= REAR + Math.PI * 2 && REAR + Math.PI * 2 <= patch.u1) ? 0 : Infinity,
    );
    assert.ok(nearest >= 0.30, `a trim patch comes within ${nearest.toFixed(2)} rad of the status light's column`);
  }

  // Mirrored: every band piece on the left flank has its twin at θ → π − θ.
  // The badge is the one patch that is its own mirror, on the centreline.
  for (const patch of HIS_WHEEL.trim.patches) {
    const twin = HIS_WHEEL.trim.patches.find((other) => (
      Math.abs(other.u0 - (Math.PI - patch.u1)) < 1e-9 && Math.abs(other.u1 - (Math.PI - patch.u0)) < 1e-9
      && other.from === patch.from && other.to === patch.to
    ));
    assert.ok(twin, `the patch at ${patch.u0.toFixed(2)}…${patch.u1.toFixed(2)} × ${patch.from} has no mirror`);
  }
});

test("the pad keeps the shared pad's outer face, ring for ring", () => {
  // `halfWidth` is the pad's thickness outboard of its centre, and the shared
  // pad's is 0.8 × `WHEEL.padThickness`; a block past that moves the plane
  // the rider's shins rest against, which `riderClearance.test.ts` and the
  // planted-boots property both assume.
  const blocks = HIS_WHEEL.pads?.blocks;
  assert.ok(blocks && blocks.length === 1, 'one pale side shell a flank');
  const outer = WHEEL.padThickness * 0.8;
  let widest = 0;
  for (const ring of blocks[0]!) {
    widest = Math.max(widest, ring.halfWidth);
    assert.ok(ring.halfWidth <= outer + 1e-9, `a pad ring at ${ring.y} is ${ring.halfWidth} thick — outside the shared face at ${outer}`);
    assert.ok(Math.abs(ring.y) <= WHEEL.padHeight / 2 + 1e-9, `a pad ring at ${ring.y} leaves the shared pad's height`);
  }
  assert.ok(Math.abs(widest - outer) < 1e-9, 'no ring reaches the shared face — the shins would float');
  assert.equal(Math.max(...blocks[0]!.map((ring) => ring.y)), FLO_PAD_TOP, 'the pad top drifted from the constant the clearance tests read');

  // On the built mesh: the outboard plane is the standard pad's to the
  // micron, and the block stays inside the shared pad's height. Its *length*
  // is deliberately not the shared pad's — the photographs' side shells cover
  // the upper half of the body fore and aft, which is the one dimension a
  // restyled pad may spend, and Wheel in Motion's spent it first.
  const standard = padExtents(STANDARD_MACHINE_LOOK);
  const his = padExtents(HIS_WHEEL);
  assert.ok(Math.abs(standard.x - his.x) < 1e-6, `the pad's outer face is at ${his.x} against the shared pad's ${standard.x}`);
  assert.ok(his.y0 >= standard.y0 - 1e-6 && his.y1 <= standard.y1 + 1e-6, 'the pad leaves the shared pad\'s height');
  assert.ok(his.z > standard.z, 'the pale side shell is no longer than the shared pad');
  // 50 mm, not round 1's 30: the round-2 verifier confirmed the pale field's
  // coverage against the rear photograph (its side shell is one 64 px light
  // run at hanger height where `chase` was one 45 px dark run) and shut both
  // other directions — the top is the shins' contact plane and the bottom is
  // `WHEEL.padHeight / 2`, which the lowest ring already sits on. Length is
  // the one dimension left, and this is the ceiling on it.
  assert.ok(his.z - standard.z <= 0.050, `the pad reaches ${((his.z - standard.z) * 1000).toFixed(0)} mm past the shared pad's nose`);

  // No page on it, and no sheet on the machine: the pad's colour is its
  // material, which is why `maribel.test.ts`'s printed-machine census needs
  // no fourth branch for him.
  assert.equal(HIS_WHEEL.pads?.art, undefined, 'the pad wears a page — there is no sheet on this machine');
  assert.equal(HIS_WHEEL.atlas, undefined, 'the machine grew a sheet');
});

test('his livery paints the shell dark behind the status light, and the deck is a block', () => {
  // §19.7's rule: his one warm colour is 22° from the light's amber rung, so
  // the field behind the ladder is the darkest paint on the machine. Sampled
  // from the built geometry, because the painter's band and the light's seat
  // are authored in different files and only the mesh knows whether they
  // agree — a reshaped nose or tail moves the seat and nothing else says so.
  const euc = createBlockoutEUC(HIS_WHEEL);
  const standard = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');
    let sampled = 0;
    let recess = 0;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (z < -0.15 && Math.abs(x) < 0.07 && y > 0.42 && y < 0.556) {
        sampled += 1;
        assert.ok(colour.getX(i) < 0.45, `bezel vertex ${i} keeps a multiplier of ${colour.getX(i)}`);
      }
      if (z > 0.16 && Math.abs(x) < 0.06 && y > 0.50 && y < 0.535) {
        recess += 1;
        assert.ok(colour.getX(i) < 0.45, `nose vertex ${i} keeps a multiplier of ${colour.getX(i)} — the recess is not dark`);
      }
    }
    assert.ok(sampled > 0, 'no shell vertices behind the status light were sampled');
    assert.ok(recess > 0, 'no shell vertices in the nose recess were sampled');

    // The light itself: its own mesh and material, seated where the standard
    // wheel seats it, on a rear face his own profile still puts under it.
    const light = euc.statusLight.material as THREE.MeshStandardMaterial;
    const reference = standard.statusLight.material as THREE.MeshStandardMaterial;
    assert.equal(light.emissive.getHex(), reference.emissive.getHex(), "the look changed the status light's colour");
    assert.ok(euc.statusLight.position.z < -0.15 && euc.statusLight.position.y > 0.42, 'the light is not where the bezel is painted');
  } finally {
    euc.dispose();
    standard.dispose();
  }

  // The deck: a low flat block, not a saddle — he stands — inside the
  // crouched-hip ceiling the seated wheels are pinned under, and wider than
  // the crown it sits on so it has an edge.
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
  // And the deck is the dark block both photographs show between the two
  // pale shells: tinted under the shell, not over it.
  const shellColour = new THREE.Color(HIS_WHEEL.shell.colour);
  const deck = new THREE.Color(shellColour.r * top.tint[0], shellColour.g * top.tint[1], shellColour.b * top.tint[2]);
  assert.ok(lumaOf(deck) < lumaOf(shellColour), 'the deck is lighter than the body it sits on');
});

test('his tail is two portrait strips at the corners, not the shared bar — and the bay is cut into the deck', () => {
  // Round 2, F5.3(b) and F5.2. The shared bar is 132 × 23 mm, 5.7 : 1
  // landscape; PHOTO 2 carries two strips, one per rear corner flanking the
  // tyre slot, each about 1 : 3.6 portrait. The count of two rests on the
  // photograph, which outranks the target render (§34.6) — so it is asserted
  // on the built mesh rather than on the authored numbers, because a patch's
  // arc is a function of the section it lies on and this profile changed in
  // the same round.
  const patches = HIS_WHEEL.taillight?.patches;
  assert.ok(patches && patches.length === 2, 'his tail is not two lamps');
  const [left, right] = patches as [typeof patches[0], typeof patches[0]];
  assert.ok(
    Math.abs(left.u0 - (-Math.PI - right.u1)) < 1e-9 && Math.abs(left.u1 - (-Math.PI - right.u0)) < 1e-9,
    'the two tail strips are not mirrored about the rear centreline',
  );

  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const tail = euc.group.getObjectByName('euc-taillight') as THREE.Mesh;
    assert.ok(tail?.isMesh, 'the taillight is findable by name');
    const position = tail.geometry.getAttribute('position');
    let rise = 0;
    let innermost = Infinity;
    let widest = 0;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      innermost = Math.min(innermost, Math.abs(position.getX(i)));
      widest = Math.max(widest, Math.abs(position.getX(i)));
      yMin = Math.min(yMin, position.getY(i));
      yMax = Math.max(yMax, position.getY(i));
    }
    rise = yMax - yMin;
    const strip = widest - innermost;
    console.log(
      `flo-with-zo taillight: rise ${(rise * 1000).toFixed(0)} mm, one strip ${(strip * 1000).toFixed(0)} mm`
        + ` of x, gap ${(innermost * 2 * 1000).toFixed(0)} mm`,
    );
    assert.ok(rise > 0.080, `the tail strips rise ${(rise * 1000).toFixed(0)} mm — the shared bar rises 23`);
    assert.ok(rise > strip * 2, 'a tail strip is landscape — the photograph\'s are portrait');
    assert.ok(innermost > 0.030, 'the two strips have closed over the tyre slot');
    // And they stay clear of the ladder: §19.7's margin, measured against the
    // seat the light actually took on this profile.
    assert.ok(yMax < euc.statusLight.position.y - 0.010, 'a tail strip reaches the status light');

    // The handle bay: the deck's top face is the darkest paint on the machine
    // with the stowed bar lifted back out of it (F5.2 — the arch itself is
    // refused by §34.3 fact 10, so the bay is paint and costs no triangles).
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    const shellPosition = shell.geometry.getAttribute('position');
    const shellColour = shell.geometry.getAttribute('color');
    let bay = 0;
    let bar = 0;
    for (let i = 0; i < shellPosition.count; i += 1) {
      if (shellPosition.getY(i) <= 0.618) continue;
      if (Math.abs(shellPosition.getX(i)) < 0.006) {
        bar += 1;
        assert.ok(shellColour.getX(i) > 1, `the stowed bar keeps a multiplier of ${shellColour.getX(i)}`);
      } else {
        bay += 1;
        assert.ok(shellColour.getX(i) < 0.45, `a bay vertex keeps a multiplier of ${shellColour.getX(i)}`);
      }
    }
    assert.ok(bay > 0 && bar > 0, `the bay sampled ${bay} vertices and the bar ${bar}`);
  } finally {
    euc.dispose();
  }
});

test('his two tail lamps leave the power ladder its margins, its pulse and its peak', () => {
  // The QA repair pass, 2026-09-10. §34.2 rejected the target render's red
  // tail bar because "red on a machine collides with `statusCritical`"
  // (`data/tuning.ts:3638`), and round 2 then built two red strips on PHOTO 2's
  // authority without anyone re-opening that sentence. Re-opened here, and the
  // answer is in two halves.
  //
  // **The sentence is about the field behind the ladder, not about a lamp.**
  // Red Rider's entry says so in terms — "a red shell behind it would bury the
  // power ladder's only readable warning" — and the answer §19.7 gives is the
  // dark bezel, which the test above proves at a 0.280 multiplier. Every
  // machine on the roster already carries a red tail lamp of the same shared
  // material 22 mm under the same light.
  //
  // **What is his own is that these flank the lamp instead of sitting under
  // it**, so the two margins are asserted rather than left to a comment, and
  // so is the fact that his tail takes the shared material at the shared
  // intensity: what separates the ladder at critical is its 6 Hz pulse and a
  // peak the lamps cannot reach, and both belong to constants a later look
  // could not change but a later edit here could.
  const euc = createBlockoutEUC(HIS_WHEEL);
  const standard = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  try {
    const margins = (built: ReturnType<typeof createBlockoutEUC>): {
      vertical: number; lateral: number; intensity: number; emissive: number;
    } => {
      built.statusLight.updateMatrixWorld(true);
      const lamp = new THREE.Box3().setFromObject(built.statusLight);
      const tail = built.group.getObjectByName('euc-taillight') as THREE.Mesh;
      const position = tail.geometry.getAttribute('position');
      let top = -Infinity;
      let inner = Infinity;
      for (let i = 0; i < position.count; i += 1) {
        top = Math.max(top, position.getY(i));
        inner = Math.min(inner, Math.abs(position.getX(i)));
      }
      const material = tail.material as THREE.MeshStandardMaterial;
      return {
        vertical: lamp.min.y - top,
        lateral: inner - lamp.max.x,
        intensity: material.emissiveIntensity,
        emissive: material.emissive.getHex(),
      };
    };
    const his = margins(euc);
    const shared = margins(standard);
    console.log(
      `flo-with-zo ladder margins: ${(his.vertical * 1000).toFixed(1)} mm under the lamp, `
        + `${(his.lateral * 1000).toFixed(1)} mm outboard of its ends `
        + `(the shared bar: ${(shared.vertical * 1000).toFixed(1)} mm under, spanning beneath it)`,
    );
    // Measured 11.0 mm and 15.3 mm. The floors are under those and above zero:
    // a strip that reached the lamp, or closed over its ends, would put the
    // one readable warning inside a red field, which is the thing §34.2 was
    // refusing.
    assert.ok(his.vertical >= 0.010, `a tail strip stands ${(his.vertical * 1000).toFixed(1)} mm under the lamp`);
    assert.ok(his.lateral >= 0.012, `a tail strip stands ${(his.lateral * 1000).toFixed(1)} mm off the lamp's end`);
    // The shared material at the shared strength — no look-side boost, which
    // would eat the peak the warning is read by.
    assert.equal(his.emissive, BLOCKOUT_COLOURS.taillight, 'his tail lamps are not the shared red');
    assert.equal(his.intensity, shared.intensity, 'his tail lamps burn at their own strength');
    // And the ladder still out-burns them: the alarm rung is 2.6 against the
    // lamps' 1.1, and it pulses 6 Hz between that and 1.17 — which is their
    // own value, so the pulse is not decoration, it is the signal.
    assert.ok(
      FX.statusAlarmIntensity >= his.intensity * 2,
      `the alarm rung is ${FX.statusAlarmIntensity} against tail lamps at ${his.intensity}`,
    );
    assert.ok(FX.statusPulseDepth >= 0.5, `the critical pulse swings only ${FX.statusPulseDepth}`);
    assert.ok(FX.statusCriticalHz >= 4, `the critical pulse runs at ${FX.statusCriticalHz} Hz`);
  } finally {
    euc.dispose();
    standard.dispose();
  }
});

test("his body is not Wheel in Motion's body", () => {
  // The template was his — the tall performance shell, the flat deck, the
  // pale trim base every accent is tinted down from — and a template copied
  // whole is a recolour. The profile is re-proportioned to his own
  // photographs (§34.5), and this is what says so.
  assert.notDeepEqual(
    HIS_WHEEL.shell.profile,
    WHEEL_IN_MOTION_MACHINE_LOOK.shell.profile,
    "his shell is Wheel in Motion's, ring for ring",
  );
  assert.notDeepEqual(
    HIS_WHEEL.pads?.blocks,
    WHEEL_IN_MOTION_MACHINE_LOOK.pads?.blocks,
    "his pad is Wheel in Motion's, ring for ring",
  );
  assert.equal(HIS_WHEEL.atlas, undefined, 'the machine grew a sheet');
  assert.equal(HIS_WHEEL.pads?.art, undefined, 'the pad grew a page');
  // No handle: the branch's posts and bar are arithmetic against
  // `WHEEL.shellHeight` and come out ten and six millimetres over a profile
  // topping out at 0.606 (§34.3 fact 10).
  assert.notEqual(HIS_WHEEL.top.kind, 'handle');
  // And the tyre carries no ring: a scalar cannot reach orange from a
  // near-black material, and the tyre is unsprung while every patch rides
  // the body.
  assert.equal(HIS_WHEEL.tyre?.lugs, undefined, 'the tyre grew lugs');
  assert.equal(HIS_WHEEL.tyre?.colour, undefined, 'the tyre is not the standard black');
});
