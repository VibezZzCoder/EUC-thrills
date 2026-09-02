/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { machineForCharacter } from '../data/machines.ts';
import { createPose } from '../simulation/EucController.ts';
import { loftGeometry, loftPoint, patchGeometry, tintOver, vAtHeight } from './blockoutKit.ts';
import { createPlaceholderRider } from './rider.ts';
import { createRidingRig } from './ridingRig.ts';
import { createBlockoutEUC } from './euc.ts';
import {
  STANDARD_MACHINE_LOOK,
  WHEEL_IN_MOTION_MACHINE_LOOK,
  WIM_MACHINE_LAYOUT,
  WIM_MACHINE_PLATE,
  WIM_PAD_TOP,
  machineLook,
} from './machineLook.ts';
import {
  MACHINE_SHEET_HEIGHT,
  MACHINE_SHEET_WIDTH,
  WIM_MACHINE_REGIONS,
  wimMachineAtlasPixels,
  wimMachinePlateBox,
  wimMachineRegion,
  wimPadPagePixel,
} from './wimMachineAtlas.ts';
import { measureObject } from './renderCost.ts';
import {
  COOL_RIDER_LOOK,
  PLAYABLE_RIDER_LOOKS,
  WHEEL_IN_MOTION_LOOK,
  WIM_SHEET_LAYOUT,
} from './riderLook.ts';
import { ATLAS_SIZE, MARK_ASPECT, WIM_REGIONS, wimAtlasPixels } from './wimAtlas.ts';
import { WIM_LOGO_PNG_BASE64 } from '../data/wimLogoAsset.ts';
import { bytesFromBase64, decodePng } from './pngDecode.ts';

/**
 * Wheel in Motion's look — M28 Phase 1, and what only the built rig knows.
 *
 * The captures settled what a picture is good at: that the jersey reads
 * blue-and-yellow, that the lid has a brim, that his mark sits on the chest.
 * What a picture is bad at is exactly what this file asserts — the mechanics
 * that make those pictures true, each of which failed silently once already
 * or would.
 *
 * **The first capture round read his mark backwards.** A page's `s` runs with
 * `loftPoint`'s `u`, from the rider's left across the front, which is
 * right-to-left for anybody standing in front of him — and nothing on the
 * roster had ever printed an asymmetric mark on a front-facing page, so
 * nothing had ever said so. `render/wimAtlas.ts` turns the stamp round; this
 * file proves the letters land in order, because a mirrored mark is fully
 * plausible in code review and wrong in a way he would notice first.
 */

const HIS = WHEEL_IN_MOTION_LOOK;
const PRINT = new THREE.Color(BLOCKOUT_COLOURS.wheelInMotionPrint);

/** Walk a built rig and hand back every mesh in it. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

/**
 * The shell's half-width at a height — the scale of a radian there, which is
 * how `render/wimAtlas.ts` authors the lid: an arc in metres from straight
 * ahead or straight behind.
 */
function lidHalfWidth(y: number): number {
  const shell = WIM_SHEET_LAYOUT.head;
  for (let i = 1; i < shell.length; i += 1) {
    if (shell[i]!.y < y) continue;
    const lower = shell[i - 1]!;
    const upper = shell[i]!;
    return lower.halfWidth + (upper.halfWidth - lower.halfWidth) * ((y - lower.y) / (upper.y - lower.y));
  }
  return shell[shell.length - 1]!.halfWidth;
}

/** The helmet page's texel under a point on the shell: `s` round from his left, height in metres. */
function lidTexel(s: number, y: number): THREE.Color {
  const page = WIM_REGIONS.helmet;
  const shell = WIM_SHEET_LAYOUT.head;
  const t = vAtHeight(shell, y) / (shell.length - 1);
  return texel((page.u0 + (page.u1 - page.u0) * s) * ATLAS_SIZE, (page.v0 + (page.v1 - page.v0) * t) * ATLAS_SIZE);
}

/** `s` for an arc in metres from straight ahead (his right is positive) … */
const ahead = (x: number, y: number): number => 0.25 + x / (Math.PI * 2 * lidHalfWidth(y));
/** … and from straight behind. */
const behind = (x: number, y: number): number => 0.75 - x / (Math.PI * 2 * lidHalfWidth(y));

/** What a page's ink lands as on the print ground, against a stated colour. */
function assertWorn(ink: THREE.Color, hex: number, what: string): void {
  const target = new THREE.Color(hex);
  const worn = ink.clone().multiply(PRINT);
  const off = Math.max(Math.abs(worn.r - target.r), Math.abs(worn.g - target.g), Math.abs(worn.b - target.b));
  assert.ok(off < 0.02, `${what} wears (${worn.r.toFixed(2)}, ${worn.g.toFixed(2)}, ${worn.b.toFixed(2)}), not ${hex.toString(16)}`);
}

/** One texel of his sheet, decoded from sRGB back to linear. */
function texel(x: number, y: number): THREE.Color {
  const pixels = wimAtlasPixels(WIM_SHEET_LAYOUT);
  const i = (Math.round(y) * ATLAS_SIZE + Math.round(x)) * 4;
  const decode = (byte: number): number => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return new THREE.Color(decode(pixels[i]!), decode(pixels[i + 1]!), decode(pixels[i + 2]!));
}

test('he costs no more than Cool Rider — meshes and draw calls both', () => {
  // Parity is the roster rule (`redRider.test.ts` holds it for calls across
  // the whole roster); this states his own numbers so a later edit that adds
  // a mesh "for the peak" is told the peak already lives in the head's buffer.
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
});

test('he is a sixth look and not a recoloured one — and his one blue is not Cool Rider\'s', () => {
  // M22's rule for the roster he joins: a set of assets required to differ
  // must be asserted to differ. His body is a printing ground and his shell
  // is royal; neither may collapse onto another rider's value.
  const others = PLAYABLE_RIDER_LOOKS.filter((look) => look.id !== HIS.id);
  for (const role of ['body', 'head', 'face', 'gear'] as const) {
    for (const other of others) {
      assert.notEqual(HIS.materials[role].colour, other.materials[role].colour, `his ${role} is ${other.id}'s ${role}`);
    }
  }
  // The owner's own note on the day Phase 1 opened: *"his blue is a
  // different shade than cool rider's."* Cool Rider's blue is the panel
  // accent; his is the jersey ink. Measured as hue, because a "different
  // shade" that is the same hue a stop darker is the same blue.
  const hue = (hex: number): number => {
    const { h } = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });
    return h * 360;
  };
  const cool = hue(BLOCKOUT_COLOURS.riderPanel);
  const his = hue(BLOCKOUT_COLOURS.wheelInMotionBlue);
  assert.ok(
    Math.abs(his - cool) >= 6,
    `his blue sits at ${his.toFixed(0)}°, within six degrees of Cool Rider's ${cool.toFixed(0)}°`,
  );
  // And it is *one* blue: the shell is the jersey's own — the owner's look
  // pass, *"just same blue and yellow as clothes."* The lid is printed, so
  // the blue is the helmet page's ground, sampled at the temple where no
  // stripe runs. The trousers are held to it by the leg-paint test below
  // and the hip join in `riderClearance`.
  assertWorn(lidTexel(0, 0.200), BLOCKOUT_COLOURS.wheelInMotionBlue, 'the shell at the temple');
});

test('every mesh of his that samples the sheet lands on a page, and the garment pages are worn', () => {
  // The invariant the whole atlas mechanism rests on (`maribel.test.ts` has
  // the argument), stated for the look that maps *lofts* as well as patches:
  // a loft that kept the kit's unit square would wear the whole sheet.
  const pages = Object.entries(WIM_REGIONS);
  const rider = createPlaceholderRider(HIS);
  const used = new Set<string>();
  try {
    let mapped = 0;
    let unmapped = 0;
    for (const mesh of meshesOf(rider.root)) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map === null) {
        unmapped += 1;
        continue;
      }
      mapped += 1;
      const uv = mesh.geometry.getAttribute('uv');
      assert.ok(uv, `his ${mesh.name} samples the sheet with no texture coordinates`);
      for (let i = 0; i < uv.count; i += 1) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        const page = pages.find(([, rect]) => (
          u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6 && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6
        ));
        assert.ok(page, `his ${mesh.name || '(unnamed)'} samples (${u.toFixed(3)}, ${v.toFixed(3)}), off every page`);
        used.add(page[0]);
      }
    }
    assert.ok(mapped >= 13, `only ${mapped} of his meshes sample the sheet`);
    // The gear and the neck carry no map — a texture lookup on a black boot
    // buys nothing.
    assert.ok(unmapped >= 6, `only ${unmapped} of his meshes are unmapped`);
  } finally {
    rider.dispose();
  }
  for (const page of ['jersey', 'sleeve', 'forearm', 'helmet', 'blue', 'lens', 'guardUpper', 'guardPlain', 'guardLower', 'packMark', 'cap', 'blank']) {
    assert.ok(used.has(page), `nothing on him wears the ${page} page`);
  }
});

test('the jersey wraps its page once, with no facet running the sheet backwards', () => {
  // A shared-seam loft folds its last facet from u ≈ 1 back to 0, which on a
  // mapped body draws the entire page reversed into one strip down the
  // rider's left. `splitSeam` gives the seam its own column; this checks the
  // result rather than the flag: no triangle on the torso spans more than a
  // fraction of the page across, and the page is reached edge to edge.
  const rider = createPlaceholderRider(HIS);
  try {
    const torso = rider.pelvis.children.find(
      (child) => (child as THREE.Mesh).isMesh === true && (child as THREE.Mesh).castShadow,
    ) as THREE.Mesh;
    assert.ok(torso, 'the torso mesh is missing');
    const uv = torso.geometry.getAttribute('uv');
    const index = torso.geometry.getIndex();
    assert.ok(index, 'the torso must be indexed');
    const jersey = WIM_REGIONS.jersey;
    const onJersey = (i: number): boolean => uv.getY(i) <= jersey.v1 + 1e-6 && uv.getY(i) >= jersey.v0 - 1e-6;
    // The end caps fan from a centre texel at the middle of their row, so a
    // cap triangle legitimately spans half the page; both caps are hidden
    // (inside the collar, under the seat) and are not what this is about.
    const capCentre = (i: number): boolean => (
      Math.abs(uv.getX(i) - (jersey.u0 + jersey.u1) / 2) < 1e-6
      && (Math.abs(uv.getY(i) - jersey.v0) < 1e-6 || Math.abs(uv.getY(i) - jersey.v1) < 1e-6)
    );
    let widest = 0;
    let lowest = Infinity;
    let highest = -Infinity;
    for (let t = 0; t < index.count; t += 3) {
      const corners = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      if (!corners.every(onJersey) || corners.some(capCentre)) continue;
      const us = corners.map((i) => uv.getX(i));
      widest = Math.max(widest, Math.max(...us) - Math.min(...us));
      lowest = Math.min(lowest, ...us);
      highest = Math.max(highest, ...us);
    }
    const span = jersey.u1 - jersey.u0;
    assert.ok(widest < span * 0.10, `a torso facet spans ${(widest / span * 100).toFixed(0)}% of the jersey page`);
    assert.ok(lowest <= jersey.u0 + 1e-6 && highest >= jersey.u1 - 1e-6, 'the jersey page is not reached edge to edge');
  } finally {
    rider.dispose();
  }
});

/**
 * Where a mark's blue and orange sit along a row of the sheet.
 *
 * His W is blue and his M is orange; the `i` between them is white on white.
 * A page reads right-to-left on a front-facing surface, so for *WiM* to read
 * on his body the orange must sit at a smaller `x` on the page than the blue.
 */
function markOrder(box: { x0: number; y0: number; x1: number; y1: number }): { blue: number; orange: number } {
  let blueX = 0;
  let blueN = 0;
  let orangeX = 0;
  let orangeN = 0;
  for (let y = box.y0; y < box.y1; y += 2) {
    for (let x = box.x0; x < box.x1; x += 1) {
      const c = texel(x, y);
      if (c.b > 0.25 && c.b > c.r * 3) {
        blueX += x;
        blueN += 1;
      } else if (c.r > 0.35 && c.r > c.b * 4 && c.g < c.r * 0.6) {
        orangeX += x;
        orangeN += 1;
      }
    }
  }
  assert.ok(blueN > 50 && orangeN > 50, `the mark is not in the box (${blueN} blue, ${orangeN} orange texels)`);
  return { blue: blueX / blueN, orange: orangeX / orangeN };
}

test('his mark reads WiM on the chest and on the knee shells, not MiW', () => {
  // The chest: the front of the jersey page is its second quarter.
  const jersey = WIM_REGIONS.jersey;
  const chest = markOrder({
    x0: Math.round(jersey.u0 * ATLAS_SIZE + 0.15 * ATLAS_SIZE),
    x1: Math.round(jersey.u0 * ATLAS_SIZE + 0.35 * ATLAS_SIZE),
    y0: Math.round(jersey.v0 * ATLAS_SIZE + (jersey.v1 - jersey.v0) * ATLAS_SIZE * 0.55),
    y1: Math.round(jersey.v0 * ATLAS_SIZE + (jersey.v1 - jersey.v0) * ATLAS_SIZE * 0.80),
  });
  assert.ok(
    chest.orange < chest.blue,
    `on the chest page the orange M sits at x ${chest.orange.toFixed(0)} and the blue W at ${chest.blue.toFixed(0)} — `
      + 'that renders as MiW on his front',
  );
  // The knee shell's page is worn by a *mirrored* patch on his right leg,
  // which runs its page the other way — so that page is stamped upright, and
  // the pack's sticker, a plain back patch, is turned like the chest's.
  const guard = WIM_REGIONS.guardUpper;
  const knee = markOrder({
    x0: Math.round(guard.u0 * ATLAS_SIZE),
    x1: Math.round(guard.u1 * ATLAS_SIZE),
    y0: Math.round(guard.v0 * ATLAS_SIZE),
    y1: Math.round(guard.v1 * ATLAS_SIZE),
  });
  assert.ok(knee.orange > knee.blue, 'the right knee shell\'s mark renders as MiW');
  const shell = HIS.panels.thighPad!.patches.find((patch) => patch.art === 'guardUpper')!;
  assert.equal(shell.mirrored, true);
  assert.equal(shell.artOn, -1, 'the marked shell page must be worn by his right leg, which reads it upright');
  const pack = WIM_REGIONS.packMark;
  const sticker = markOrder({
    x0: Math.round(pack.u0 * ATLAS_SIZE),
    x1: Math.round(pack.u1 * ATLAS_SIZE),
    y0: Math.round(pack.v0 * ATLAS_SIZE),
    y1: Math.round(pack.v1 * ATLAS_SIZE),
  });
  assert.ok(sticker.orange < sticker.blue, 'the pack sticker renders as MiW from behind');
  // His left shell carries the mark too, turned, because that side runs the
  // mirrored patch's page the other way: on the page it is MiW, on him WiM.
  const plain = WIM_REGIONS.guardPlain;
  const leftKnee = markOrder({
    x0: Math.round(plain.u0 * ATLAS_SIZE),
    x1: Math.round(plain.u1 * ATLAS_SIZE),
    y0: Math.round(plain.v0 * ATLAS_SIZE),
    y1: Math.round(plain.v1 * ATLAS_SIZE),
  });
  assert.ok(leftKnee.orange < leftKnee.blue, 'the left knee shell\'s mark renders as MiW');
  // And the struts and bosses wear flat white, not a stretched mark.
  const flat = WIM_REGIONS.guardFlat;
  const boss = texel(((flat.u0 + flat.u1) / 2) * ATLAS_SIZE, ((flat.v0 + flat.v1) / 2) * ATLAS_SIZE);
  assert.ok(boss.r > 0.97 && boss.g > 0.97 && boss.b > 0.97, 'the flat guard page carries ink');
  for (const patch of [...HIS.panels.thighPad!.patches, ...HIS.panels.kneePad!.patches]) {
    assert.notEqual(patch.art, 'guardPlain', 'a strut or boss wears the marked shell page');
  }
});

test('the jersey\'s yellow falls to his left hip, the photograph\'s way', () => {
  // The photograph is the authority for the kit, and it is handed: the broad
  // yellow block sits high on his right ribs and falls across the belly to
  // his LEFT hip, his right hip plain blue. The target render mirrors it, and
  // two rounds of this look followed the render — the second blind round
  // measured the hips. `s` is 0 at his left, 0.25 at the front, 0.5 at his
  // right; the jersey page's v is the torso's ring index.
  const jersey = WIM_REGIONS.jersey;
  const rings = WIM_SHEET_LAYOUT.torso.map((ring) => ring.y);
  const at = (s: number, y: number): THREE.Color => {
    let v = rings.length - 1;
    for (let i = 1; i < rings.length; i += 1) {
      if (y <= rings[i]!) { v = i - 1 + (y - rings[i - 1]!) / (rings[i]! - rings[i - 1]!); break; }
    }
    return texel(
      (jersey.u0 + (jersey.u1 - jersey.u0) * s) * ATLAS_SIZE,
      (jersey.v0 + (jersey.v1 - jersey.v0) * (v / (rings.length - 1))) * ATLAS_SIZE,
    );
  };
  const yellow = BLOCKOUT_COLOURS.wheelInMotionYellow;
  const blue = BLOCKOUT_COLOURS.wheelInMotionBlue;
  // His left hip, just above the hem band: yellow. His right hip: blue.
  assertWorn(at(0.12, 0.100), yellow, 'his left hip');
  assertWorn(at(0.38, 0.100), blue, 'his right hip');
  // And the block is high on his right: yellow at his right ribs, blue at the
  // same height on his left ribs.
  assertWorn(at(0.40, 0.300), yellow, 'his right ribs');
  assertWorn(at(0.10, 0.300), blue, 'his left ribs');
});

test('his mark is stamped at its own aspect on the chest, measured on the body', () => {
  // The artwork is 835 × 368; the box on the page is derived from the surface,
  // so the brief's no-distortion rule holds in metres, not in texels. Walk the
  // built torso: find the vertices of the front facets that span the mark's
  // page box and compare metres across with metres up.
  const rider = createPlaceholderRider(HIS);
  try {
    const torso = rider.pelvis.children.find(
      (child) => (child as THREE.Mesh).isMesh === true && (child as THREE.Mesh).castShadow,
    ) as THREE.Mesh;
    const uv = torso.geometry.getAttribute('uv');
    const position = torso.geometry.getAttribute('position');
    // Locate the mark on the page by its **plate**: the artwork's own white
    // ground is the one thing on the jersey page that is white, so its
    // bounding box is the artwork's box — 835 × 368 — on the page.
    const jersey = WIM_REGIONS.jersey;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let y = Math.round(512 * 0.5); y < 512 * 0.9; y += 1) {
      for (let x = 100; x < 412; x += 1) {
        const c = texel(x, y);
        if (!(c.r > 0.85 && c.g > 0.85 && c.b > 0.85)) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    assert.ok(x1 > x0 && y1 > y0, 'the chest mark\'s plate was not found on the page');
    // Metres per texel across and up, from the vertices nearest the mark's
    // centre column and row.
    // Locate a texture coordinate on the body by finding the triangle whose
    // texture triangle contains it and interpolating its corners — the only
    // honest way to measure a mark's box in metres on a curved, unevenly
    // gridded surface (two nearest-vertex attempts before this measured
    // diagonals and reported the mark half again too short).
    const index = torso.geometry.getIndex()!;
    const locate = (u: number, v: number): THREE.Vector3 => {
      for (let t = 0; t < index.count; t += 3) {
        const i0 = index.getX(t);
        const i1 = index.getX(t + 1);
        const i2 = index.getX(t + 2);
        const u0 = uv.getX(i0);
        const v0 = uv.getY(i0);
        const u1 = uv.getX(i1);
        const v1 = uv.getY(i1);
        const u2 = uv.getX(i2);
        const v2 = uv.getY(i2);
        const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
        if (Math.abs(det) < 1e-12) continue;
        const b1 = ((u - u0) * (v2 - v0) - (u2 - u0) * (v - v0)) / det;
        const b2 = ((u1 - u0) * (v - v0) - (u - u0) * (v1 - v0)) / det;
        const b0 = 1 - b1 - b2;
        if (b0 < -1e-6 || b1 < -1e-6 || b2 < -1e-6) continue;
        const p0 = new THREE.Vector3().fromBufferAttribute(position, i0);
        const p1 = new THREE.Vector3().fromBufferAttribute(position, i1);
        const p2 = new THREE.Vector3().fromBufferAttribute(position, i2);
        return p0.multiplyScalar(b0).add(p1.multiplyScalar(b1)).add(p2.multiplyScalar(b2));
      }
      throw new Error(`no torso facet contains texture coordinate (${u.toFixed(3)}, ${v.toFixed(3)})`);
    };
    const uLeft = jersey.u0 + x0 / ATLAS_SIZE;
    const uRight = jersey.u0 + x1 / ATLAS_SIZE;
    const vBottom = jersey.v0 + y0 / ATLAS_SIZE;
    const vTop = jersey.v0 + y1 / ATLAS_SIZE;
    const uMid = (uLeft + uRight) / 2;
    const vMid = (vBottom + vTop) / 2;
    // Along the surface, in a few steps, so a curved chest is not measured
    // by its chord.
    const along = (from: [number, number], to: [number, number]): number => {
      let length = 0;
      let previous = locate(from[0], from[1]);
      for (let i = 1; i <= 8; i += 1) {
        const next = locate(from[0] + (to[0] - from[0]) * (i / 8), from[1] + (to[1] - from[1]) * (i / 8));
        length += previous.distanceTo(next);
        previous = next;
      }
      return length;
    };
    const widthM = along([uLeft, vMid], [uRight, vMid]);
    const heightM = along([uMid, vBottom], [uMid, vTop]);
    const aspect = heightM / widthM;
    // The plate is the whole file, so its aspect is the file's own.
    const art = decodePng(bytesFromBase64(WIM_LOGO_PNG_BASE64));
    const own = art.height / art.width;
    assert.ok(
      Math.abs(aspect - own) / own < 0.08,
      `the mark renders at ${aspect.toFixed(3)} tall per wide against the artwork's ${own.toFixed(3)}`,
    );
  } finally {
    rider.dispose();
  }
});

test('his lid is the roster\'s road shell: nothing leaves it, one sunk visor, and its second colour is print', () => {
  // The owner's two look passes (2026-09-01). Phase 1's off-road lid — a
  // peak and a chin bar built as volumes leaving the shell — read as a snout
  // on the ride (*"it's like... a pig!"*), and the first pass's yellow, hung
  // on as lifted patches, read as *"yellow panels protruding"*. So the head
  // mesh may stand no further off its own rings than a patch does, at the
  // jaw or the brow; the aperture holds one sunk visor wearing the lens
  // page; nothing is bolted on; and the yellow is the helmet page's — print
  // on the shell, in the jersey's yellow and not the target render's orange.
  assert.equal(HIS.extras.length, 0, 'something is bolted onto him — the lid\'s colours are print');
  const rider = createPlaceholderRider(HIS);
  try {
    // The neck carries two unnamed casting meshes — the gaiter and the head;
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
    // How far a vertex stands off the shell's own surface in its direction:
    // the shell's radius at that height and (nearly) that polar angle,
    // against the vertex's own.
    const standOff = (x: number, y: number, z: number): number => {
      const v = vAtHeight(shell, y);
      const angle = Math.atan2(z, x);
      let nearest = Infinity;
      let radius = 0;
      for (let k = 0; k < 96; k += 1) {
        loftPoint(shell, (k / 96) * Math.PI * 2, v, point);
        const gap = Math.abs(Math.atan2(Math.sin(Math.atan2(point.z, point.x) - angle), Math.cos(Math.atan2(point.z, point.x) - angle)));
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
      // Between the base rim and the crown taper — where a chin bar or a
      // peak would leave the shell.
      if (y < 0.08 || y > 0.31) continue;
      proudest = Math.max(proudest, standOff(position.getX(i), y, position.getZ(i)));
    }
    assert.ok(
      proudest < 0.025,
      `the head mesh stands ${(proudest * 1000).toFixed(0)} mm off its shell — that is a volume, not a patch`,
    );
    // And the shell samples the sheet, on its own page: the print is what
    // the second colour *is*.
    assert.notEqual((head.material as THREE.MeshStandardMaterial).map, null, 'the shell carries no map');
    // The shell's own vertices — one column per radial segment plus the
    // seam, one row per ring, and the base cap's centre — on the helmet
    // page; every feature merged into it on the flat blue page; nothing
    // anywhere else.
    const uv = head.geometry.getAttribute('uv');
    const within = (rect: { u0: number; u1: number; v0: number; v1: number }, i: number): boolean => {
      const u = uv.getX(i);
      const v = uv.getY(i);
      return u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6 && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6;
    };
    let onHelmet = 0;
    let onBlue = 0;
    for (let i = 0; i < uv.count; i += 1) {
      if (within(WIM_REGIONS.helmet, i)) onHelmet += 1;
      else if (within(WIM_REGIONS.blue, i)) onBlue += 1;
    }
    const shellVertices = (HIS.density!.head! + 1) * shell.length + 1;
    assert.equal(onHelmet, shellVertices, `${onHelmet} head vertices on the helmet page, not the shell's ${shellVertices}`);
    assert.equal(onHelmet + onBlue, uv.count, `${uv.count - onHelmet - onBlue} head vertices are off both the helmet and the blue page`);
  } finally {
    rider.dispose();
  }
  const face = HIS.panels.face!;
  assert.equal(face.patches.length, 1, 'the aperture holds one visor');
  assert.equal(face.patches[0]!.art, 'lens', 'the visor does not wear the lens page');
  assert.ok((face.patches[0]!.sink ?? 0) < 0, 'the visor is not sunk into the aperture');
  // Every feature merged into the shell wears the flat blue page: a merged
  // patch keeps its own unit square, and unpaged it would wear the shell's
  // print across the brow.
  for (const patch of HIS.panels.head) assert.equal(patch.art, 'blue', 'a head feature is not on the blue page');
  // And nothing stands off the back of the shell — the owner's third pass
  // saw Cool Rider's spoiler as *"a bump on the back protruding"*.
  assert.ok(HIS.panels.head.every((patch) => patch.anchor !== 'back'), 'a feature stands off the back of the shell');
  // The print, where the owner's mockup puts it: a stripe over the brow and
  // two chevrons down the back in yellow, the chin yellow with the mouth
  // vent black in it — *"keep the black bit in the mouth area"* — and blue
  // at the temple and the crown between them. Addressed as the painter is,
  // in metres of arc from straight ahead or straight behind.
  const blue = BLOCKOUT_COLOURS.wheelInMotionBlue;
  const yellow = BLOCKOUT_COLOURS.wheelInMotionYellow;
  assertWorn(lidTexel(ahead(0.049, 0.298), 0.298), yellow, 'the stripe over the brow');
  assertWorn(lidTexel(ahead(-0.049, 0.298), 0.298), yellow, 'the other stripe over the brow');
  assertWorn(lidTexel(ahead(0.042, 0.122), 0.122), yellow, 'the chin beside the vent');
  assertWorn(lidTexel(ahead(0, 0.122), 0.122), BLOCKOUT_COLOURS.wheelInMotionGear, 'the mouth vent');
  // The mockup's chin: a V of yellow round the vent, blue between it and the
  // cheek stroke, the stroke yellow again outboard — three reads across the
  // jaw, not one yellow mask (the second blind round's measurement).
  assertWorn(lidTexel(ahead(0.042, 0.118), 0.118), yellow, 'the V beside the vent');
  // The vent terminates the chin: black at the base rim's top edge, under
  // the vent's centreline, where the first cut left yellow and then blue.
  assertWorn(lidTexel(ahead(0, 0.080), 0.080), BLOCKOUT_COLOURS.wheelInMotionGear, 'the vent reaching the rim');
  assertWorn(lidTexel(ahead(0.046, 0.100), 0.100), blue, 'the blue between the V and the cheek');
  assertWorn(lidTexel(ahead(0.059, 0.100), 0.100), yellow, 'the cheek stroke');
  // And the split the mockup has: the visor a third of the shell, the crown
  // and the chin the rest in the mockup's proportion.
  const visor = HIS.panels.face?.patches.find((patch) => patch.art === 'lens');
  assert.ok(visor, 'the visor patch is missing');
  const lidHeight = WIM_SHEET_LAYOUT.head[WIM_SHEET_LAYOUT.head.length - 1]!.y - WIM_SHEET_LAYOUT.head[0]!.y;
  const visorShare = (visor.to - visor.from) / lidHeight;
  assert.ok(Math.abs(visorShare - 0.326) < 0.02, `the visor is ${(visorShare * 100).toFixed(0)}% of the shell — the mockup's is 33%`);
  // The jaw holds its width: the ring at 90% of the shell's height is at least
  // three quarters of the widest, the mockup's near-parallel cheek pads.
  const widest = Math.max(...WIM_SHEET_LAYOUT.head.map((ring) => ring.halfWidth));
  const jaw = lidHalfWidth(WIM_SHEET_LAYOUT.head[0]!.y + lidHeight * 0.10);
  assert.ok(jaw / widest >= 0.72, `the jaw is ${(100 * jaw / widest).toFixed(0)}% of the shell's widest — a bulb on a stalk`);
  assertWorn(lidTexel(behind(0.056, 0.271), 0.271), yellow, 'the upper chevron');
  assertWorn(lidTexel(behind(0.058, 0.134), 0.134), yellow, 'the lower chevron');
  assertWorn(lidTexel(0.5, 0.330), blue, 'the crown');
  assertWorn(lidTexel(0, 0.200), blue, 'the temple');
});

test('his pack hangs from two straps that go over the shoulders, and nothing else crosses the chest', () => {
  // The owner's look pass: Phase 1 ran the shoulder wraps round the flank at
  // shoulder height — under the armpits, to the eye — and hung a sternum
  // strap, buckles and a belt on the chest that the photograph does not
  // carry. Two straps, each three patches meeting edge to edge at the
  // shoulder's rim: that is the whole harness.
  const rings = HIS.profiles.torso;
  const neck = rings[rings.length - 1]!;
  // The shoulder: the widest ring, from which the trapezius slope climbs to
  // the neck ring.
  const shoulder = rings.reduce((widest, ring) => (ring.halfWidth >= widest.halfWidth ? ring : widest));
  const chest = HIS.panels.torso!;
  assert.equal(chest.patches.length, 2, `${chest.patches.length} patches on the chest — the strap pair and its lower wrap, nothing else`);
  const run = chest.patches.find((patch) => patch.anchor === 'front')!;
  const wrap = chest.patches.find((patch) => patch.anchor === 'outboard')!;
  assert.ok(run && wrap, 'the chest carries a front run and an outboard wrap');
  assert.equal(run.mirrored, true, 'the chest run is not a mirrored pair');
  const shoulders = HIS.panels.shoulders!;
  const rear = shoulders.patches.filter((patch) => patch.anchor === 'back' && patch.mirrored === true);
  const crossings = shoulders.patches.filter((patch) => patch.anchor === 'outboard');
  assert.equal(rear.length, 1, 'one rear run per side');
  assert.equal(crossings.length, 1, 'one shoulder crossing per side');
  const crossing = crossings[0]!;
  // **On the slope, not on the neck ring** — the owner's third pass: a
  // crossing on the loft's top ring *"goes around his collar"* like a dog
  // harness. It sits between the shoulder ring and the neck with room to
  // spare, and both runs stop at its top instead of climbing to the collar.
  assert.ok(crossing.from >= shoulder.y - 1e-9, `the crossing starts at ${crossing.from}, below the shoulder ring at ${shoulder.y}`);
  assert.ok(crossing.to <= neck.y - 0.008, `the crossing reaches ${crossing.to} — the neck ring is at ${neck.y}, that is a collar`);
  assert.ok(Math.abs(run.to - crossing.to) < 1e-9, 'the chest run does not stop at the crossing');
  assert.ok(Math.abs(rear[0]!.to - crossing.to) < 1e-9, 'the rear run does not stop at the crossing');
  // Nothing wraps the flank under the arm: an outboard patch at shoulder
  // height below the slope is the armpit wrap.
  assert.ok(crossing.from > 0.50 - 1e-9, 'a patch wraps the flank under the arm');
  // Edge to edge at the crossing, in the profile's own angles: the chest
  // run's outboard edge and the rear run's are where the crossing ends.
  assert.ok(Math.abs(Math.PI / 2 + run.u0 - crossing.u1) < 0.01, 'the crossing does not meet the chest run');
  assert.ok(Math.abs(-Math.PI / 2 + rear[0]!.u1 - crossing.u0) < 0.01, 'the crossing does not meet the rear run');
  // And closed at the bottom — the owner's second pass: *"straps are just
  // dangling in front of him. should connect to the back at the sides as
  // well."* — at the height his third pass put it: *"too low, could go a
  // bit higher above his hip more towards ribs height."* The lower wrap
  // runs from the chest run's bottom edge round the flank into the pack's
  // side face, at rib height, nowhere near the armpit.
  const pack = shoulders.patches
    .filter((patch) => patch.anchor === 'back' && patch.mirrored !== true)
    .reduce((lowest, patch) => (patch.from < lowest.from ? patch : lowest));
  assert.equal(wrap.mirrored, true, 'the lower wrap is not a mirrored pair');
  assert.ok(wrap.from >= 0.22 && wrap.to <= 0.32, `the lower wrap spans ${wrap.from}–${wrap.to}, not the ribs`);
  assert.ok(wrap.from > pack.from && wrap.to < pack.to, 'the lower wrap does not enter the pack\'s side face');
  assert.ok(Math.abs(run.from - wrap.from) < 1e-9, 'the chest run does not end at the lower wrap');
  assert.ok(Math.abs(Math.PI / 2 + run.u0 - wrap.u1) < 0.01, 'the lower wrap does not meet the chest run');
  assert.ok(Math.abs(-Math.PI / 2 + pack.u1 - wrap.u0) < 0.01, 'the lower wrap does not meet the pack\'s side');

  // And on the built rig: the strap reaches the crossing, out on the
  // shoulder rather than at the collar, comes round behind the flank at rib
  // height, and no gear vertex sits on
  // the flank at shoulder height, which is where the wraps were.
  const rider = createPlaceholderRider(HIS);
  try {
    let highest = -Infinity;
    let roundTheBack = false;
    for (const name of ['rider-shoulder-panels', 'rider-jacket-panels']) {
      const mesh = rider.root.getObjectByName(name) as THREE.Mesh;
      assert.ok(mesh, `${name} is missing`);
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        highest = Math.max(highest, y);
        // The top of the strap is out on the shoulder: a vertex up at the
        // crossing's height within a centimetre of the neck ring's radius is
        // a collar. (A patch's lift stands its top edge a few millimetres
        // higher than the ring it was authored on, so height alone is not
        // the test.)
        if (y > crossing.to - 0.004) {
          assert.ok(
            Math.hypot(x, z) > neck.halfWidth + 0.01,
            `${name} reaches the collar at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
          );
        }
        if (name === 'rider-jacket-panels' && y > wrap.from - 0.005 && y < wrap.to + 0.005 && z < -0.08) roundTheBack = true;
        assert.ok(
          !(y > 0.40 && y < 0.50 && Math.abs(x) > 0.12 && Math.abs(z) < 0.05),
          `${name} has a vertex on the flank under the arm at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
        );
      }
    }
    assert.ok(highest > crossing.to - 0.004, `the straps reach ${highest.toFixed(3)}, short of the crossing at ${crossing.to}`);
    assert.ok(roundTheBack, 'the chest straps never come round behind the flank — they hang');
  } finally {
    rider.dispose();
  }
});

test('what shows through his knee hinge is the cup, and the shell plate spans both bones', () => {
  // M22's lesson: a guard spans a joint, the joint is two bones, and a bending
  // knee opens the halves on the side the camera sees. The limb beneath the
  // cup is therefore painted to the cup's own value — the `cap` page's ink —
  // and the two must stay equal. Both halves of the cup wear that page.
  const thighCup = HIS.panels.thighPad?.patches.find((patch) => patch.art === 'cap' && patch.anchor === 'front');
  const shinCup = HIS.panels.kneePad?.patches.find((patch) => patch.art === 'cap' && patch.anchor === 'front' && patch.to === 0);
  assert.ok(thighCup && shinCup, 'both halves of the cup must exist and wear the cap page');
  const shell = HIS.panels.thighPad?.patches.find((patch) => patch.art === 'guardUpper');
  const plate = HIS.panels.kneePad?.patches.find((patch) => patch.art === 'guardLower');
  assert.ok(shell && plate, 'the shell and the plate must both exist');
  assert.ok(shell.from < thighCup.to && plate.to >= shinCup.from - 1e-9, 'the white armour does not meet the cup on both bones');

  const cap = new THREE.Color(BLOCKOUT_COLOURS.wheelInMotionGear);
  const nearness = (a: THREE.Color, b: THREE.Color): number => {
    const scale = Math.max(b.r, b.g, b.b, 1e-4);
    return Math.hypot((a.r - b.r) / scale, (a.g - b.g) / scale, (a.b - b.b) / scale);
  };
  for (const [profile, painter, inside] of [
    [HIS.profiles.thigh, HIS.paint?.thigh, (y: number) => y <= thighCup.to],
    [HIS.profiles.shin, HIS.paint?.shin, (y: number) => y >= shinCup.from],
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
        // Under the shell's arc only; behind the leg the cup is not there.
        const angle = Math.atan2(side * position.getX(i), position.getZ(i));
        if (angle <= -0.55 || angle >= 2.30) continue;
        sampled += 1;
        const painted = new THREE.Color(PRINT.r * colour.getX(i), PRINT.g * colour.getY(i), PRINT.b * colour.getZ(i));
        if (nearness(painted, cap) < 0.06) matching += 1;
      }
      geometry.dispose();
      assert.ok(sampled > 0, 'no vertices lie under the cup');
      assert.equal(matching, sampled, `${sampled - matching} of ${sampled} vertices under the cup are not cup-dark`);
    }
  }
});

test('his legs are three colours from one pale material, painted in the direction the multiplier honours', () => {
  // The jersey's blue above the guard (the owner's call: *"make his pants
  // same blue as shirt"*), guard-white under the shell, boot-black below the
  // collar — and never a vertex colour above 1, which would be paint going up.
  const trousers = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionBlue);
  // The guard's white is lifted *above* the print ground on purpose — a
  // vertex tint may lift where a texel may not (`DESIGN.md` §7i) — so the
  // armour is the brightest thing below the waist; 1.30 is the look's own
  // `WIM_GUARD_SHADE`, restated here as the number the shell patches carry.
  const guard = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGuard, 1.30);
  const boot = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGear);
  for (const tint of [trousers, boot]) {
    for (const channel of tint) assert.ok(channel <= 1 + 1e-9, 'a leg tint paints up');
  }
  const shell = HIS.panels.thighPad!.patches.find((patch) => patch.art === 'guardUpper')!;
  assert.equal(shell.shade, 1.30, 'the shell patches and the limb paint under them must share the guard shade');
  const shin = loftGeometry(HIS.profiles.shin, { radialSegments: 18 });
  HIS.paint!.shin!(shin, 1);
  const position = shin.getAttribute('position');
  const colour = shin.getAttribute('color');
  const seen = { trousers: 0, guard: 0, boot: 0 };
  const near = (i: number, tint: readonly [number, number, number]): boolean => (
    Math.abs(colour.getX(i) - tint[0]) < 1e-4 && Math.abs(colour.getY(i) - tint[1]) < 1e-4 && Math.abs(colour.getZ(i) - tint[2]) < 1e-4
  );
  for (let i = 0; i < position.count; i += 1) {
    if (near(i, trousers)) seen.trousers += 1;
    else if (near(i, guard)) seen.guard += 1;
    else if (near(i, boot)) seen.boot += 1;
  }
  shin.dispose();
  assert.ok(seen.trousers > 0 && seen.guard > 0 && seen.boot > 0, `the shin carries ${JSON.stringify(seen)}`);
  // The boot band starts where the profile says it does.
  const cuff = -RIDER_BLOCKOUT.shinLength * 0.68;
  assert.ok(HIS.profiles.shin.some((ring) => Math.abs(ring.y - cuff) < 0.012), 'no seam ring at the boot collar');
});

test('the sheet is his: no lettering, and only the pages he wears', () => {
  // The one file on this rider that prints anything. His mark is his file;
  // everything else on the sheet is fields and stripes. No wordmark — not the
  // jersey maker's on the chest and sleeve, not the guard maker's, not the
  // helmet's — reaches it, and the assertion is structural: the atlas module
  // never imports the lettering primitives at all.
  const source = new URL('./wimAtlas.ts', import.meta.url);
  return import('node:fs').then(({ readFileSync }) => {
    // Code only — the file's comments name the things it must not do.
    const code = readFileSync(source, 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('/**'))
      .join('\n');
    assert.equal(code.includes('inkWord'), false, 'the sheet imports lettering');
    assert.equal(code.includes('fillText'), false, 'the sheet uses a device font');
    assert.equal(code.includes('Math.random'), false, 'the sheet is not deterministic');
    // And no orange: the owner's look pass reserved it for his wheel. The
    // orange in his mark is the file's own bytes, not an ink.
    assert.equal(code.includes('wheelInMotionOrange'), false, 'the sheet inks orange — orange is the wheel\'s');
  });
});

// -- His wheel — M28 Phase 2 --------------------------------------------------
//
// The captures settle what a picture is good at: that the pads read blue, the
// power pads orange, the body black. What follows is what a picture is bad
// at — cost, which has to stay level with the standard wheel; the pads' outer
// face, which is a rider-pose property; the bezel behind the status light; the
// plate's mirror, direction and aspect; and that he is actually seated on it.

const HIS_WHEEL = WHEEL_IN_MOTION_MACHINE_LOOK;
const WHEEL_TRIM = new THREE.Color(BLOCKOUT_COLOURS.machineWheelInMotionTrim);

/** One texel of his machine sheet, decoded from sRGB back to linear. */
function machineTexel(x: number, y: number): THREE.Color {
  const pixels = wimMachineAtlasPixels(WIM_MACHINE_LAYOUT);
  const i = (Math.round(y) * MACHINE_SHEET_WIDTH + Math.round(x)) * 4;
  const decode = (byte: number): number => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return new THREE.Color(decode(pixels[i]!), decode(pixels[i + 1]!), decode(pixels[i + 2]!));
}

/** Distance along the shell from `u0` to `u1` at a height, in metres. */
function shellArc(y: number, u0: number, u1: number): number {
  const profile = WIM_MACHINE_LAYOUT.shell;
  const v = vAtHeight(profile, y);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let length = 0;
  loftPoint(profile, u0, v, a);
  for (let i = 1; i <= 96; i += 1) {
    loftPoint(profile, u0 + (u1 - u0) * (i / 96), v, b);
    length += a.distanceTo(b);
    a.copy(b);
  }
  return length;
}

test('his wheel costs what the standard wheel costs, and he is seated on it', () => {
  // The three machine pieces arrive together or not at all (`docs/PLANS.md`
  // §28.3 fact 1): a mapped id with no look resolves to `standard` and ships
  // the wrong wheel without saying so. So the seat, the resolver and the cost
  // are one assertion.
  assert.equal(machineForCharacter('wheel-in-motion'), 'wheel-in-motion');
  assert.equal(machineLook('wheel-in-motion'), HIS_WHEEL);

  const rows = [STANDARD_MACHINE_LOOK, HIS_WHEEL].map((look) => {
    const euc = createBlockoutEUC(look);
    try {
      const cost = measureObject(euc.group);
      return { machine: look.machine, meshes: cost.meshes.length, calls: cost.totalDrawCalls, triangles: cost.totalTriangles };
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
  // The deck, three pad blocks a side and the orange pads are real triangles —
  // the axis this project spends.
  assert.ok(his.triangles > standard.triangles, 'the deck, the blocks and the pads are real triangles');
});

test('his wheel builds on his rig, poses and disposes without throwing', () => {
  const rig = createRidingRig(HIS, HIS_WHEEL);
  rig.apply(createPose());
  rig.dispose();
});

test('black base, blue structures, orange pads — and none of the three is borrowed', () => {
  // The brief's §11 relationship, asserted as the colours the player sees
  // rather than as the constants that produced them.
  const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const shell = new THREE.Color(HIS_WHEEL.shell.colour);
  assert.ok(luma(shell) < 0.03, `the shell is ${luma(shell).toFixed(3)} in luma — that is not black`);

  // The blue is the pads' page's ink over the pale base — the pad is
  // printed — and it is his machine's blue: a step lighter than the
  // jersey's, the same cyan lean, and not Cool Rider's.
  const pads = new THREE.Color(BLOCKOUT_COLOURS.machineWheelInMotionBlue);
  const jersey = new THREE.Color(BLOCKOUT_COLOURS.wheelInMotionBlue);
  assert.equal(HIS_WHEEL.pads?.colour, BLOCKOUT_COLOURS.machineWheelInMotionTrim, 'a printed pad is the pale base');
  assert.equal(HIS_WHEEL.pads?.art, 'pads');
  assert.ok(luma(pads) > luma(jersey), 'the pads are no lighter than the knit');
  const hue = (c: THREE.Color): number => { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return h.h * 360; };
  assert.ok(Math.abs(hue(pads) - hue(jersey)) < 8, `the pads' hue ${hue(pads).toFixed(0)}° drifted from the jersey's ${hue(jersey).toFixed(0)}°`);
  assert.ok(Math.abs(hue(pads) - hue(new THREE.Color(BLOCKOUT_COLOURS.riderPanel))) > 6, 'the pads borrowed Cool Rider\'s blue');

  // The orange: every tinted patch renders as `wheelInMotionOrange` over the
  // pale base, on the pads and on the shell both — from behind (the fins),
  // from in front (the blade) and on the flank (the power pads).
  const orange = new THREE.Color(BLOCKOUT_COLOURS.wheelInMotionOrange);
  let onPads = 0;
  let onShell = 0;
  let behind = 0;
  let ahead = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    if (!patch.tint) continue;
    const worn = new THREE.Color(patch.tint[0] * WHEEL_TRIM.r, patch.tint[1] * WHEEL_TRIM.g, patch.tint[2] * WHEEL_TRIM.b);
    const off = Math.max(Math.abs(worn.r - orange.r), Math.abs(worn.g - orange.g), Math.abs(worn.b - orange.b));
    const offBlue = Math.max(Math.abs(worn.r - pads.r), Math.abs(worn.g - pads.g), Math.abs(worn.b - pads.b));
    // The louvre slots are the blade's blue a step down: same hue, darker.
    const louvre = Math.abs(hue(worn) - hue(pads)) < 8 && luma(worn) < luma(pads) * 0.6;
    assert.ok(off < 0.02 || offBlue < 0.02 || louvre, `a tinted patch wears (${worn.r.toFixed(2)}, ${worn.g.toFixed(2)}, ${worn.b.toFixed(2)}), neither his orange nor his blue`);
    if (off >= 0.02) continue;
    if ((patch.surface ?? 'shell') === 'pad') onPads += 1;
    else {
      onShell += 1;
      const centre = (patch.u0 + patch.u1) / 2;
      if (Math.abs(centre + Math.PI / 2) < 0.9) behind += 1;
      if (Math.abs(centre - Math.PI / 2) < 0.2) ahead += 1;
    }
  }
  // No orange patch rides the pad: the pad's orange is print, like its
  // cyan and its grip field. Orange on the shell at both ends.
  assert.equal(onPads, 0, `${onPads} orange patches ride the pad — its art is the page's`);
  assert.ok(onShell >= 3, `only ${onShell} orange pieces ride the shell`);
  assert.ok(behind >= 2, 'no orange faces the chase camera');
  assert.ok(ahead >= 1, 'no orange faces forward');
  // And the blue corner pieces: the photograph's, on the shell's rear
  // shoulders and front lower corners, in the pads' own blue — so the blue
  // is in the chase frame and the front view, not only on the flank.
  let blueBehind = 0;
  let blueAhead = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    if (!patch.tint || (patch.surface ?? 'shell') === 'pad') continue;
    const worn = new THREE.Color(patch.tint[0] * WHEEL_TRIM.r, patch.tint[1] * WHEEL_TRIM.g, patch.tint[2] * WHEEL_TRIM.b);
    const offBlue = Math.max(Math.abs(worn.r - pads.r), Math.abs(worn.g - pads.g), Math.abs(worn.b - pads.b));
    if (offBlue >= 0.02) continue;
    const centre = (patch.u0 + patch.u1) / 2;
    if (Math.abs(centre + Math.PI / 2) < 0.9 && patch.to > 0.55) blueBehind += 1;
    if (Math.abs(centre - Math.PI / 2) < 0.9 && patch.from < 0.36) blueAhead += 1;
  }
  assert.equal(blueBehind, 2, `${blueBehind} blue blades at the rear`);
  assert.equal(blueAhead, 2, `${blueAhead} blue blades at the front`);
  // Blades, not chips: each is at least 150 mm of the 268 mm of bodywork
  // above the skirt — the photograph's are two thirds of the flank.
  let shoulderPieces = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    if (!patch.tint || (patch.surface ?? 'shell') === 'pad') continue;
    const worn = new THREE.Color(patch.tint[0] * WHEEL_TRIM.r, patch.tint[1] * WHEEL_TRIM.g, patch.tint[2] * WHEEL_TRIM.b);
    const offBlue = Math.max(Math.abs(worn.r - pads.r), Math.abs(worn.g - pads.g), Math.abs(worn.b - pads.b));
    if (offBlue >= 0.02) continue;
    const centre = (patch.u0 + patch.u1) / 2;
    const atAnEnd = Math.abs(Math.abs(centre) - Math.PI / 2) < 0.9;
    if (!atAnEnd) {
      // The shoulder piece behind the plate: on the flank, above the pad.
      shoulderPieces += 1;
      assert.ok(patch.from >= WHEEL.padCentreHeight + WIM_PAD_TOP, 'a shoulder piece reaches into the pad');
      continue;
    }
    assert.ok(patch.to - patch.from >= 0.150, `a blue blade is only ${((patch.to - patch.from) * 1000).toFixed(0)} mm tall`);
  }
  assert.equal(shoulderPieces, 2, `${shoulderPieces} blue shoulder pieces behind the plate`);
  // And the louvres ride the blades: every slot sits inside a blade's span.
  const blades = HIS_WHEEL.trim.patches.filter((patch) => patch.tint && (patch.surface ?? 'shell') === 'shell' && patch.to - patch.from >= 0.150);
  // The pad's face, sampled on the page at points of the pad's own frame
  // (metres fore/aft and up from the pad's centre): the forward comma is
  // cyan with orange inside it, the aft hook the same, the hub dark, and
  // the grip field between them black — the photograph's set, as shapes.
  const worn = (z: number, y: number): THREE.Color => {
    const [x, py] = wimPadPagePixel(WIM_MACHINE_LAYOUT, z, y);
    return machineTexel(x, py).multiply(WHEEL_TRIM);
  };
  const near = (c: THREE.Color, hex: number): boolean => {
    const target = new THREE.Color(hex);
    return Math.max(Math.abs(c.r - target.r), Math.abs(c.g - target.g), Math.abs(c.b - target.b)) < 0.03;
  };
  assert.ok(near(worn(0.142, -0.010), BLOCKOUT_COLOURS.machineWheelInMotionBlue), 'the forward comma is not cyan');
  assert.ok(near(worn(0.107, -0.010), BLOCKOUT_COLOURS.wheelInMotionOrange), 'the ribbon inside the comma is not orange');
  assert.ok(near(worn(-0.137, -0.012), BLOCKOUT_COLOURS.machineWheelInMotionBlue), 'the aft hook is not cyan');
  assert.ok(near(worn(-0.106, -0.012), BLOCKOUT_COLOURS.wheelInMotionOrange), 'the orange inside the hook is missing');
  const lumaOf = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  assert.ok(lumaOf(worn(0, 0.040)) < 0.05, 'the grip field between the pads is not black');
  assert.ok(lumaOf(worn(0, -0.012)) < 0.05, 'the hub is not dark');
  assert.ok(near(worn(0.130, 0.048), BLOCKOUT_COLOURS.machineWheelInMotionBlue), 'the forward shoulder pad is not cyan');
  let slots = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    if (!patch.tint || (patch.surface ?? 'shell') === 'pad' || patch.to - patch.from > 0.020) continue;
    slots += 1;
    assert.ok(
      blades.some((blade) => patch.u0 >= blade.u0 && patch.u1 <= blade.u1 && patch.from >= blade.from && patch.to <= blade.to),
      `a louvre at ${patch.from} hangs off its blade`,
    );
    assert.ok((patch.lift ?? 0) > (blades[0]!.lift ?? 0), 'a louvre sits under its blade');
  }
  assert.equal(slots, 12, `${slots} louvre slots on four blades`);
});

test('the pad keeps the shared pad\'s outer face, fills the flank, and the plate starts above it', () => {
  // `halfWidth` is the pad's thickness outboard of its centre, and the shared
  // pad's is 0.8 × `WHEEL.padThickness`; a block past that moves the plane
  // the rider's shins rest against, which `riderClearance.test.ts` and the
  // planted-boots property both assume.
  const blocks = HIS_WHEEL.pads?.blocks;
  assert.ok(blocks && blocks.length === 1, 'one big power pad a side');
  const outer = WHEEL.padThickness * 0.8;
  let widest = 0;
  for (const block of blocks) {
    for (const ring of block) {
      widest = Math.max(widest, ring.halfWidth);
      assert.ok(ring.halfWidth <= outer + 1e-9, `a pad ring at ${ring.y} is ${ring.halfWidth} thick — outside the shared face at ${outer}`);
      assert.ok(Math.abs(ring.y) <= WHEEL.padHeight / 2 + 1e-9, `a pad ring at ${ring.y} leaves the shared pad's height`);
    }
  }
  assert.ok(Math.abs(widest - outer) < 1e-9, 'no block reaches the shared face — the shins would float');

  // The power pad's top is where the look says, and the plate clears it.
  const power = blocks[0]!;
  const top = Math.max(...power.map((ring) => ring.y));
  assert.equal(top, WIM_PAD_TOP);
  assert.ok(WIM_MACHINE_PLATE.from >= WHEEL.padCentreHeight + top + 0.008, 'the plate runs into the pad');
  // And it is most of the flank — the photograph's, not a pill at shin
  // height: 160 mm tall, 340 mm long, and no thinner than 16 mm at its ends.
  const bottom = Math.min(...power.map((ring) => ring.y));
  assert.ok(top - bottom >= 0.150, `the pad is ${((top - bottom) * 1000).toFixed(0)} mm tall`);
  assert.ok(Math.max(...power.map((ring) => ring.halfDepth)) >= 0.165, 'the pad is shorter than the shared pad');
  assert.ok(Math.min(...power.map((ring) => ring.halfWidth)) >= 0.016, 'the pad tapers to a pill');
});

test('his mark rides both flanks as one turned plate, at its own aspect, on parallel rings', () => {
  const plates = HIS_WHEEL.trim.patches.filter((patch) => patch.art === 'plate');
  assert.equal(plates.length, 2, `${plates.length} plate patches`);
  const [left, right] = plates as [typeof plates[0], typeof plates[0]];
  assert.equal(left.surface ?? 'shell', 'shell');
  assert.equal(right.surface ?? 'shell', 'shell');
  // The right flank is the left's mirror with its ends swapped, which is what
  // keeps the page running toward the viewer's left from either side.
  assert.ok(Math.abs(right.u0 - (Math.PI - left.u1)) < 1e-9 && Math.abs(right.u1 - (Math.PI - left.u0)) < 1e-9, 'the right plate is not the left\'s mirror');
  assert.equal(left.from, right.from);
  assert.equal(left.to, right.to);
  // Forward of the flank's centre, where the standing rider's shin does not
  // cover it: the rear edge at or just ahead of the centre, the whole plate
  // ahead of it.
  assert.ok(left.u0 >= -0.01 && left.u0 < 0.05 && left.u1 > 0.3, 'the plate is not forward of the flank\'s centre');
  assert.equal(left.uByArc, true, 'the plate page runs with angle, not arc');
  assert.equal(right.uByArc, true, 'the right plate page runs with angle, not arc');

  // And the page runs at one scale across the whole plate: the columns of
  // the built patch are evenly spaced in metres, where by angle the first of
  // eight covered half the plate. Built flat (no lift, no sink) so the two
  // faces coincide and the mid row is one line of columns.
  const flat = patchGeometry(WIM_MACHINE_LAYOUT.shell, {
    u0: left.u0, u1: left.u1,
    v0: vAtHeight(WIM_MACHINE_LAYOUT.shell, left.from), v1: vAtHeight(WIM_MACHINE_LAYOUT.shell, left.to),
    uSegments: 8, vSegments: 6, lift: 0, sink: 0, uByArc: true,
  });
  const position = flat.getAttribute('position');
  // The rows sit at ring-index heights, so take the row nearest the middle
  // rather than assuming the middle is a row.
  const midY = (left.from + left.to) / 2;
  let rowY = Infinity;
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getY(i) - midY) < Math.abs(rowY - midY)) rowY = position.getY(i);
  }
  const columns = new Set<number>();
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getY(i) - rowY) < 0.0005) columns.add(Math.round(position.getZ(i) * 1e4) / 1e4);
  }
  const zs = [...columns].sort((a, b) => a - b);
  assert.equal(zs.length, 9, `${zs.length} columns on the plate's mid row`);
  const gaps = zs.slice(1).map((z, i) => z - zs[i]!);
  assert.ok(Math.max(...gaps) / Math.min(...gaps) < 1.15, `columns span ${(Math.min(...gaps) * 1000).toFixed(1)}–${(Math.max(...gaps) * 1000).toFixed(1)} mm — the page is not running by arc`);
  flat.dispose();

  // The band it sits on is parallel: the arc across it at the bottom and the
  // top agree within 3%, or the mark is keystoned — the stretch the brief
  // forbids, done downstream of the texture.
  const bottom = shellArc(left.from, left.u0, left.u1);
  const top = shellArc(left.to, left.u0, left.u1);
  assert.ok(Math.abs(top - bottom) / bottom < 0.03, `the plate is ${bottom.toFixed(3)} m wide at its foot and ${top.toFixed(3)} at its head`);
  assert.ok(bottom > 0.12 && bottom < 0.17, `the plate is ${(bottom * 1000).toFixed(0)} mm wide — a sticker is 120–170`);

  // And the mark inside it is his file at its own aspect, measured on the
  // body: the mark's width is its share of the page across the plate's arc,
  // its height its share of the page up the plate's rise.
  const box = wimMachinePlateBox(WIM_MACHINE_LAYOUT);
  const page = WIM_MACHINE_REGIONS.plate;
  const pageWidth = (page.u1 - page.u0) * MACHINE_SHEET_WIDTH + 1;
  const pageHeight = (page.v1 - page.v0) * MACHINE_SHEET_HEIGHT + 1;
  const mid = (left.from + left.to) / 2;
  const across = shellArc(mid, left.u0, left.u1) * ((box.x1 - box.x0) / pageWidth);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const centreU = (left.u0 + left.u1) / 2;
  loftPoint(WIM_MACHINE_LAYOUT.shell, centreU, vAtHeight(WIM_MACHINE_LAYOUT.shell, left.from), a);
  loftPoint(WIM_MACHINE_LAYOUT.shell, centreU, vAtHeight(WIM_MACHINE_LAYOUT.shell, left.to), b);
  const up = a.distanceTo(b) * ((box.y1 - box.y0) / pageHeight);
  const ratio = up / across;
  assert.ok(Math.abs(ratio - MARK_ASPECT) / MARK_ASPECT < 0.03, `the mark lands ${across.toFixed(3)} m by ${up.toFixed(3)} on the flank — ${ratio.toFixed(3)} against the artwork's ${MARK_ASPECT.toFixed(3)}`);
  assert.ok(across > 0.10, `the mark is ${(across * 1000).toFixed(0)} mm across`);

  // The plate is white to its corners, and the mark is in it, turned: the
  // orange M lands at a lower `x` than the blue W on the page, which renders
  // as W-i-M from either side of the machine.
  for (const [x, y] of [[2, 2], [445, 2], [2, 253], [445, 253]] as const) {
    const c = machineTexel(x, y);
    assert.ok(c.r > 0.97 && c.g > 0.97 && c.b > 0.97, `the plate's corner at (${x}, ${y}) is inked`);
  }
  let blueX = 0; let blueN = 0; let orangeX = 0; let orangeN = 0;
  for (let y = Math.ceil(box.y0); y < box.y1; y += 2) {
    for (let x = Math.ceil(box.x0); x < box.x1; x += 1) {
      const c = machineTexel(x, y).multiply(WHEEL_TRIM);
      if (c.b > 0.25 && c.b > c.r * 3) { blueX += x; blueN += 1; }
      else if (c.r > 0.35 && c.r > c.b * 4 && c.g < c.r * 0.6) { orangeX += x; orangeN += 1; }
    }
  }
  assert.ok(blueN > 200 && orangeN > 200, `the mark is not on the plate (${blueN} blue, ${orangeN} orange texels)`);
  assert.ok(orangeX / orangeN < blueX / blueN, 'the plate renders as MiW');

  // The sheet is the plate and nothing else: two pages, and every other art
  // name lands on the neutral one.
  assert.deepEqual(Object.keys(WIM_MACHINE_REGIONS).sort(), ['blank', 'pads', 'plate']);
  assert.equal(wimMachineRegion('plate'), WIM_MACHINE_REGIONS.plate);
  assert.equal(wimMachineRegion(undefined), WIM_MACHINE_REGIONS.blank);
  assert.equal(wimMachineRegion('machineMark'), WIM_MACHINE_REGIONS.blank);
  const blank = WIM_MACHINE_REGIONS.blank;
  const c = machineTexel(((blank.u0 + blank.u1) / 2) * MACHINE_SHEET_WIDTH, ((blank.v0 + blank.v1) / 2) * MACHINE_SHEET_HEIGHT);
  assert.ok(c.r > 0.99 && c.g > 0.99 && c.b > 0.99, 'the neutral page carries ink');
});

test('his livery paints the shell dark behind the status light, and the deck is a block', () => {
  // §19.7's rule: orange is the amber rung's neighbour on this wheel, so the
  // field behind the ladder is the darkest paint on it. Sampled from the
  // built geometry, because the painter's band and the light's seat are
  // authored in different files and only the mesh knows whether they agree.
  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');
    let sampled = 0;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (position.getZ(i) < -0.15 && Math.abs(position.getX(i)) < 0.07 && y > 0.42 && y < 0.556) {
        sampled += 1;
        assert.ok(colour.getX(i) < 0.45, `bezel vertex ${i} keeps a multiplier of ${colour.getX(i)}`);
      }
    }
    assert.ok(sampled > 0, 'no shell vertices behind the status light were sampled');
  } finally {
    euc.dispose();
  }

  // The deck: a low flat block, not a saddle — he stands — inside the
  // crouched-hip ceiling the seated wheels are pinned under, and wider than
  // the crown it sits on so it has an edge.
  const top = HIS_WHEEL.top;
  assert.equal(top.kind, 'saddle');
  const crown = Math.max(...top.profile.map((ring) => ring.y));
  const shellTop = Math.max(...HIS_WHEEL.shell.profile!.map((ring) => ring.y));
  assert.ok(crown - shellTop <= 0.020, `the deck stands ${((crown - shellTop) * 1000).toFixed(0)} mm off the shell — that is a saddle`);
  assert.ok(crown <= RIDER.hipHeight - RIDER_BLOCKOUT.crouchHipDrop - 0.10, 'the deck reaches the crouched hips');
  const lip = Math.max(...top.profile.map((ring) => ring.halfWidth));
  const shellCrown = HIS_WHEEL.shell.profile!.reduce((a, b) => (b.y > a.y ? b : a));
  assert.ok(lip > shellCrown.halfWidth, 'the deck is narrower than the crown — a rounding, not a block');
});
