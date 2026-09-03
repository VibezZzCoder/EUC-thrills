/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { loftGeometry, loftNormal, loftPoint, vAtHeight, type LoftProfile } from './blockoutKit.ts';
import { createPlaceholderRider } from './rider.ts';
import { measureObject } from './renderCost.ts';
import {
  COOL_RIDER_LOOK,
  DRUNKARD_CAN_VERTICES,
  DRUNKARD_GLOVE_VERTICES,
  DRUNKARD_HAND_CAN,
  DRUNKARD_HAND_CAN_BANDS,
  DRUNKARD_HAT,
  DRUNKARD_HEAD,
  DRUNKARD_HOSE,
  DRUNKARD_JERSEY,
  DRUNKARD_KIT,
  DRUNKARD_BOX_TOP,
  DRUNKARD_LOOK,
  DRUNKARD_PACK,
  DRUNKARD_SHEET_LAYOUT,
  PLAYABLE_RIDER_LOOKS,
  RIDER_LOOKS,
  WIM_SHEET_LAYOUT,
} from './riderLook.ts';
import {
  ATLAS_SIZE,
  CAN_LID,
  CAN_RIM,
  CAN_TOP,
  DRUNKARD_REGIONS,
  HAND_CAN_HOP,
  KIT_LABEL,
  PACK_BAND,
  PACK_WINDOW,
  drunkardAtlasPixels,
  handCanPageS,
  hatFoamEdge,
} from './drunkardAtlas.ts';
import { linearFromHex, inkOver, type Rgb } from './inkKit.ts';
import { wimAtlasPixels } from './wimAtlas.ts';
import { maribelAtlasPixels } from './maribelAtlas.ts';

/**
 * The Drunkard's look — M29 Phase 2, and what only the built rig knows
 * (`docs/PLANS.md` §29.10).
 *
 * The captures settle what a picture is good at: that the hat reads, that
 * the cans are cans, that the pack is full of the wrong drink. What a
 * picture is bad at is what this file pins — the mechanics that make those
 * pictures true, each of which would fail silently: a can authored beside
 * the shell that drifts off it when a ring moves, a tube whose spline no
 * longer starts on its can, a hose that climbs over the neck ring, a strap
 * crossing that has slid onto the collar, a sheet that has quietly learned
 * to print a word, and the one thing a real brewery could object to — its
 * colours on somebody else's rider.
 */

const HIS = DRUNKARD_LOOK;
const PRINT = new THREE.Color(BLOCKOUT_COLOURS.drunkardPrint);
const NECK_RING = DRUNKARD_JERSEY[DRUNKARD_JERSEY.length - 1]!.y;

/** Walk a built rig and hand back every mesh in it. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

/** One texel of his sheet, decoded from sRGB back to linear. */
function texel(x: number, y: number): THREE.Color {
  const pixels = drunkardAtlasPixels(DRUNKARD_SHEET_LAYOUT);
  const i = (Math.round(y) * ATLAS_SIZE + Math.round(x)) * 4;
  const decode = (byte: number): number => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return new THREE.Color(decode(pixels[i]!), decode(pixels[i + 1]!), decode(pixels[i + 2]!));
}

/** What a page's ink lands as on the print ground, against a stated colour. */
function assertWorn(ink: THREE.Color, hex: number, what: string): void {
  const target = new THREE.Color(hex);
  const worn = ink.clone().multiply(PRINT);
  const off = Math.max(Math.abs(worn.r - target.r), Math.abs(worn.g - target.g), Math.abs(worn.b - target.b));
  assert.ok(off < 0.02, `${what} wears (${worn.r.toFixed(2)}, ${worn.g.toFixed(2)}, ${worn.b.toFixed(2)}), not ${hex.toString(16)}`);
}

/** A page texel addressed the way a wrapped painter addresses it: `s` round the body, height in metres. */
function wrappedTexel(page: keyof typeof DRUNKARD_REGIONS, profile: LoftProfile, s: number, y: number): THREE.Color {
  const rect = DRUNKARD_REGIONS[page];
  const t = vAtHeight(profile, y) / (profile.length - 1);
  return texel((rect.u0 + (rect.u1 - rect.u0) * s) * ATLAS_SIZE, (rect.v0 + (rect.v1 - rect.v0) * t) * ATLAS_SIZE);
}

/** Is this linear colour the hop cone's green — any of its three inks? */
function isHop(c: THREE.Color): boolean {
  return c.g > c.r * 1.35 && c.g > c.b * 1.6 && c.g > 0.08;
}

/** The count of hop-green texels inside a box of the sheet, in pixels. */
function hopTexels(box: { x0: number; y0: number; x1: number; y1: number }): number {
  let count = 0;
  for (let y = Math.round(box.y0); y < box.y1; y += 1) {
    for (let x = Math.round(box.x0); x < box.x1; x += 1) if (isHop(texel(x, y))) count += 1;
  }
  return count;
}

/** Signed depth of a point inside a profile's surface at its own height — `riderClearance.test.ts`'s measure. */
function depthInside(profile: LoftProfile, point: THREE.Vector3): number {
  const last = profile.length - 1;
  let ring = profile[last]!;
  if (point.y <= profile[0]!.y) ring = profile[0]!;
  else if (point.y < profile[last]!.y) {
    for (let i = 1; i <= last; i += 1) {
      const above = profile[i]!;
      if (point.y <= above.y) {
        const below = profile[i - 1]!;
        const f = (point.y - below.y) / (above.y - below.y);
        ring = {
          y: point.y,
          halfWidth: below.halfWidth + (above.halfWidth - below.halfWidth) * f,
          halfDepth: below.halfDepth + (above.halfDepth - below.halfDepth) * f,
          x: below.x + (above.x - below.x) * f,
          z: below.z + (above.z - below.z) * f,
          square: below.square + (above.square - below.square) * f,
        };
        break;
      }
    }
  }
  const dx = point.x - ring.x;
  const dz = point.z - ring.z;
  const r = Math.hypot(dx, dz);
  if (r < 1e-9) return Math.min(ring.halfWidth, ring.halfDepth);
  if (ring.halfWidth < 1e-6 || ring.halfDepth < 1e-6) return -r;
  const g = Math.abs(dx / ring.halfWidth) ** ring.square + Math.abs(dz / ring.halfDepth) ** ring.square;
  return (g ** (-1 / ring.square) - 1) * r;
}

test('he costs no more than Cool Rider — meshes and draw calls both — and states his triangles', () => {
  // Parity is the roster rule (`redRider.test.ts` holds it across the
  // roster); this states his own numbers so a later edit that adds a mesh
  // "for the peak" is told the peak already lives in the kit's buffer.
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
  // Triangles are the free axis, and this is the number the build record
  // states: a rider that doubled it would still be legal and would still be
  // worth a sentence in the record.
  assert.ok(him.triangles < 30_000, `${him.triangles} triangles — the free axis is not a bottomless one`);
});

test('he is a seventh look and not a recoloured one', () => {
  // M22's rule for the roster he joins: a set of assets required to differ
  // must be asserted to differ. His ground is cream and his gear is brown;
  // neither may collapse onto another rider's value.
  const others = PLAYABLE_RIDER_LOOKS.filter((look) => look.id !== HIS.id);
  for (const role of ['body', 'accent', 'head', 'gear'] as const) {
    for (const other of others) {
      assert.notEqual(HIS.materials[role].colour, other.materials[role].colour, `his ${role} is ${other.id}'s ${role}`);
    }
  }
  // The direction rule, stated as arithmetic: the ground is lighter than the
  // amber, the brown and the hop green in every channel, or one of them
  // could not be ink (a texel only darkens).
  const ground = new THREE.Color(BLOCKOUT_COLOURS.drunkardPrint);
  for (const hex of [BLOCKOUT_COLOURS.drunkardAmber, BLOCKOUT_COLOURS.drunkardBrown, BLOCKOUT_COLOURS.drunkardHop, BLOCKOUT_COLOURS.drunkardGear]) {
    const ink = new THREE.Color(hex);
    assert.ok(ink.r < ground.r && ink.g < ground.g && ink.b < ground.b, `${hex.toString(16)} is lighter than the ground in a channel`);
  }
  // And the value floor (`DESIGN.md` §7k): the browns have headroom; the
  // lens is the one near-black and it is a vertex tint on a face feature.
  // Judged on the sRGB byte, the value the file is authored in: `0x24262d`,
  // the near-black this project learned not to author, has a red of 36.
  for (const hex of [BLOCKOUT_COLOURS.drunkardBrown, BLOCKOUT_COLOURS.drunkardGear]) {
    assert.ok(((hex >> 16) & 0xff) >= 60, `${hex.toString(16)} is authored near-black`);
  }
});

test('every mesh of his that samples the sheet lands on a page, and the pages he wears are worn', () => {
  // The invariant the whole atlas mechanism rests on (`maribel.test.ts` has
  // the argument), stated for a look that maps lofts, patches and extras: a
  // part that kept the kit's unit square would wear the whole sheet.
  const pages = Object.entries(DRUNKARD_REGIONS);
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
      assert.equal(material.map.name, 'drunkard-atlas', `${mesh.name} samples a sheet that is not his`);
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
    assert.ok(mapped >= 14, `only ${mapped} of his meshes sample the sheet`);
    // The gear boots, the straps, the skin neck and the skin face carry no
    // map — a texture lookup on a brown boot buys nothing.
    assert.ok(unmapped >= 5, `only ${unmapped} of his meshes are unmapped`);
  } finally {
    rider.dispose();
  }
  for (const page of ['jersey', 'sleeve', 'forearm', 'hat', 'kit', 'pack', 'knee', 'blank']) {
    assert.ok(used.has(page), `nothing on him wears the ${page} page`);
  }
});

test('his sheet is built by his look alone, and no other look\'s materials carry it', () => {
  // The blast-radius check every printed look has had since Maribel's: a
  // shared texture would be freed under the ghost on the first swap, and a
  // second look wearing his sheet would wear his chest print.
  for (const look of RIDER_LOOKS) {
    if (look.id === HIS.id) continue;
    assert.notEqual(look.atlas?.build, HIS.atlas!.build, `${look.id} builds his sheet`);
    const rider = createPlaceholderRider(look);
    try {
      for (const mesh of meshesOf(rider.root)) {
        const map = (mesh.material as THREE.MeshStandardMaterial).map;
        assert.ok(map === null || map.name !== 'drunkard-atlas', `${look.id}'s ${mesh.name} wears his sheet`);
      }
    } finally {
      rider.dispose();
    }
  }
});

test('the sheet is his: no lettering, no device font, no randomness, and nothing on it is a raster', () => {
  // The one file on this rider that prints anything, and the brief's rule
  // that no text appears anywhere on him: the assertion is structural — the
  // module never imports a lettering primitive or a raster stamp at all.
  const source = new URL('./drunkardAtlas.ts', import.meta.url);
  const code = readFileSync(source, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('/**'))
    .join('\n');
  assert.equal(code.includes('inkWord'), false, 'the sheet imports lettering');
  assert.equal(code.includes('fillText'), false, 'the sheet uses a device font');
  assert.equal(code.includes('Math.random'), false, 'the sheet is not deterministic');
  assert.equal(code.includes('Date.now'), false, 'the sheet reads a clock');
  assert.equal(code.includes('inkRaster'), false, 'the sheet stamps a raster — nothing on him is one');
  // And the same sheet twice is the same bytes: the drips are hashed, and a
  // hash is the promise that a capture baseline is a baseline.
  const first = drunkardAtlasPixels(DRUNKARD_SHEET_LAYOUT);
  const again = drunkardAtlasPixels({ ...DRUNKARD_SHEET_LAYOUT });
  assert.equal(first.length, again.length);
  for (let i = 0; i < first.length; i += 4096) assert.equal(first[i], again[i], `texel ${i / 4} differs between two paints`);
});

test('the cans stand outboard of the shell\'s widest ring, on the kit page\'s label', () => {
  // A can authored beside the shell floats off it when a ring moves (the
  // M22 rule); these are derived from the hat's own widest ring, and the
  // margin is the pin: 50 mm outboard of the shell, which is what reads at
  // chase distance.
  const widest = Math.max(...DRUNKARD_HAT.map((ring) => ring.halfWidth));
  assert.ok(DRUNKARD_KIT.canAxisX > widest, 'a can\'s axis is inside the shell');
  const rider = createPlaceholderRider(HIS);
  try {
    const kit = rider.root.getObjectByName('rider-drunkard-hat-kit') as THREE.Mesh;
    assert.ok(kit, 'the hat kit is missing');
    assert.equal(kit.parent, rider.neck, 'the hat kit must hang from the neck with the hat');
    assert.equal(kit.castShadow, true, 'the hat kit carries the silhouette and must cast');
    const position = kit.geometry.getAttribute('position');
    const uv = kit.geometry.getAttribute('uv');
    const page = DRUNKARD_REGIONS.kit;
    const label = {
      u0: page.u0 + (page.u1 - page.u0) * KIT_LABEL.s0,
      u1: page.u0 + (page.u1 - page.u0) * KIT_LABEL.s1,
      v0: page.v0 + (page.v1 - page.v0) * KIT_LABEL.t0,
      v1: page.v0 + (page.v1 - page.v0) * KIT_LABEL.t1,
    };
    const canTop = DRUNKARD_KIT.canBottom + DRUNKARD_KIT.canHeight;
    for (const side of [-1, 1]) {
      let outboard = 0;
      let onLabel = 0;
      let highest = -Infinity;
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i) * side;
        const y = position.getY(i);
        // A can vertex: at can height, from the can's inboard face outward
        // (it stands off the shell by the standoff, held by the bracket, and
        // the bracket's own outer 4 mm is inside the can). Tubes start above
        // the can's top and the brim is below it.
        if (y < DRUNKARD_KIT.canBottom - 1e-6 || y > canTop + 1e-6 || x < widest + DRUNKARD_KIT.canStandoff - 0.002) continue;
        outboard = Math.max(outboard, x);
        const u = uv.getX(i);
        const v = uv.getY(i);
        if (u >= label.u0 - 1e-6 && u <= label.u1 + 1e-6 && v >= label.v0 - 1e-6 && v <= label.v1 + 1e-6) onLabel += 1;
        highest = Math.max(highest, y);
      }
      assert.ok(
        outboard >= widest + 0.050,
        `the ${side > 0 ? 'left' : 'right'} can reaches ${(outboard * 1000).toFixed(0)} mm, `
          + `under 50 mm outboard of the shell's widest ring at ${(widest * 1000).toFixed(0)}`,
      );
      assert.ok(onLabel >= 100, `only ${onLabel} vertices of the ${side > 0 ? 'left' : 'right'} can wear the label band`);
      assert.ok(Math.abs(highest - canTop) < 1e-3, 'the can does not reach its stated top');
    }
  } finally {
    rider.dispose();
  }
});

test('each hat tube leaves its can through a grommet, steps down to a cream straw, and ends at the mouth clear of the face between', () => {
  const canTop = DRUNKARD_KIT.canBottom + DRUNKARD_KIT.canHeight;
  const rider = createPlaceholderRider(HIS);
  try {
    const kit = rider.root.getObjectByName('rider-drunkard-hat-kit') as THREE.Mesh;
    const position = kit.geometry.getAttribute('position');
    const colour = kit.geometry.getAttribute('color');
    // The tubes are the amber-tinted vertices in the kit and the straws
    // the ivory-tinted ones (round 2: the garment tint's red is exactly 1,
    // so it is told apart by its green); the cans, the brim and the
    // retaining straps are page-coloured at 1, and the cradle, the
    // grommets and the ferrules are gear-brown, under 0.5 in red.
    const tube: THREE.Vector3[] = [];
    const straw: THREE.Vector3[] = [];
    const gear: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      const r = colour.getX(i);
      const g = colour.getY(i);
      const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
      if (r < 0.5) gear.push(vertex);
      else if (r > 0.999 && g > 0.8 && g < 0.95) straw.push(vertex);
      else if (r <= 0.999) tube.push(vertex);
    }
    assert.ok(tube.length > 200, `only ${tube.length} tube vertices`);
    assert.ok(straw.length > 60, `only ${straw.length} straw vertices`);
    const route = [...tube, ...straw];
    const near = (set: readonly THREE.Vector3[], point: THREE.Vector3, within: number): boolean => set.some((vertex) => vertex.distanceTo(point) <= within);
    for (const side of [-1, 1]) {
      const knots = DRUNKARD_KIT.tube(side);
      const first = knots[0]!;
      const canCentre = new THREE.Vector3(side * DRUNKARD_KIT.canAxisX, canTop, DRUNKARD_KIT.canZ);
      // The first knot is *inside* the can's top: within the can's radius
      // of its axis, buried by at least the tube's own radius and no deeper
      // than the cap's straight body (round 2 — an open tube end standing
      // on the domed cap floated 10 mm clear of it at the rear), and a
      // grommet covers the joint: gear-tinted vertices above the can's top
      // on its axis.
      assert.ok(Math.hypot(first.x - canCentre.x, first.z - canCentre.z) <= DRUNKARD_KIT.canRadius, 'the tube does not start over its can');
      assert.ok(first.y <= canTop - DRUNKARD_KIT.tubeRadius && first.y >= canTop - 0.030, `the tube starts ${((canTop - first.y) * 1000).toFixed(0)} mm into the can — it should be buried by its radius and no more than 30 mm`);
      const grommet = gear.filter((vertex) => vertex.y > canTop + 0.002 && Math.hypot(vertex.x - canCentre.x, vertex.z - canCentre.z) < 0.030);
      assert.ok(grommet.length >= 10, `only ${grommet.length} grommet vertices above the ${side > 0 ? 'left' : 'right'} can's top`);
      // The straw takes over at the tube's last knot, and the last knots
      // are the mouth: the corner on the face's surface, the stub inside it.
      const strawKnots = DRUNKARD_KIT.straw(side);
      assert.ok(strawKnots[0]!.distanceTo(knots[knots.length - 1]!) < 1e-9, 'the straw does not start where the tube ends');
      const corner = strawKnots[strawKnots.length - 2]!;
      const stub = strawKnots[strawKnots.length - 1]!;
      assert.ok(corner.distanceTo(DRUNKARD_KIT.mouthCorner(side)) < 1e-9, 'the straw does not end at the mouth corner');
      // On the face: the corner sits within a grin's thickness of the skin
      // loft's surface (the grin itself stands proud of it).
      assert.ok(Math.abs(depthInside(DRUNKARD_HEAD, corner)) < 0.015, `the mouth corner is ${(depthInside(DRUNKARD_HEAD, corner) * 1000).toFixed(1)} mm off the face`);
      assert.ok(depthInside(DRUNKARD_HEAD, stub) > 0.004, 'the stub is not inside the mouth');
      // And the built geometry follows the knots at both ends: amber at the
      // can, ivory at the mouth — and the vertex nearest the mouth corner
      // is a *straw* vertex, within the straw's radius of it, so a future
      // edit cannot silently restore the full-bore pipe at the grin.
      assert.ok(near(tube, first, DRUNKARD_KIT.tubeRadius + 0.002), 'no tube vertex at the can\'s top');
      assert.ok(near(straw, corner, DRUNKARD_KIT.strawRadius + 0.002), 'no straw vertex at the mouth corner');
      const nearest = route.reduce((best, vertex) => (vertex.distanceTo(corner) < best.distanceTo(corner) ? vertex : best));
      assert.ok(straw.includes(nearest) && nearest.distanceTo(corner) < 0.008, 'the vertex nearest the mouth corner is not a straw vertex within 8 mm — the full bore reaches the grin');
      assert.ok(DRUNKARD_KIT.strawRadius < DRUNKARD_KIT.tubeRadius * 0.6, 'the straw is not a step down from the tube');
    }
    // Between the two ends the route stays out of the head: no tube or
    // straw vertex is inside the skin loft except within the mouth's own
    // reach.
    let buried = 0;
    for (const vertex of route) {
      const mouth = Math.min(vertex.distanceTo(DRUNKARD_KIT.mouthCorner(1)), vertex.distanceTo(DRUNKARD_KIT.mouthCorner(-1)));
      if (mouth < 0.030) continue;
      if (depthInside(DRUNKARD_HEAD, vertex) > 0.001) buried += 1;
    }
    assert.equal(buried, 0, `${buried} tube vertices run through the face`);
    // And it stays out of the head *in projection*, at the cameras that
    // judge him — gauntlet round 2. Round 1 pinned `|x| < silhouette`, a
    // purely frontal projection that ignores `z`, and the descent it
    // approved flew out along the +x/+z diagonal, the quarter camera's own
    // axis, lying across the brim, the cheek and a lens in that view. Now:
    // at the front, quarter and chase azimuths of `tools/rider-views.mjs`
    // (the side is left out on purpose — no route clears all four, the
    // side is an inspection view, and 8 % there is the price of 0 % at the
    // quarter), every tube vertex above the grin (165 mm) and under the
    // crown is either outside the head/hat/brim span at its height or
    // behind the head's surface there.
    const AZIMUTHS = { front: Math.atan2(-1.0, 1.95), quarter: Math.atan2(1.55, 1.75), chase: Math.PI };
    const sectionAt = (profile: LoftProfile, y: number): { halfWidth: number; halfDepth: number; square: number; x: number; z: number } | null => {
      const last = profile.length - 1;
      if (y < profile[0]!.y || y > profile[last]!.y) return null;
      for (let i = 1; i <= last; i += 1) {
        if (y <= profile[i]!.y) {
          const a = profile[i - 1]!;
          const b = profile[i]!;
          const f = (y - a.y) / Math.max(1e-9, b.y - a.y);
          const lerp = (p: number, q: number): number => p + (q - p) * f;
          return { halfWidth: lerp(a.halfWidth, b.halfWidth), halfDepth: lerp(a.halfDepth, b.halfDepth), square: lerp(a.square, b.square), x: lerp(a.x, b.x), z: lerp(a.z, b.z) };
        }
      }
      return null;
    };
    /** The head's outline at a height as a point cloud in (x, z): the hat, the skull and, at its height, the brim. */
    const outlineAt = (y: number): Array<[number, number]> => {
      const points: Array<[number, number]> = [];
      for (const profile of [DRUNKARD_HAT, DRUNKARD_HEAD]) {
        const ring = sectionAt(profile, y);
        if (!ring) continue;
        for (let k = 0; k < 120; k += 1) {
          const t = (k / 120) * Math.PI * 2;
          const c = Math.cos(t);
          const s = Math.sin(t);
          points.push([ring.x + ring.halfWidth * Math.sign(c) * Math.abs(c) ** (2 / ring.square), ring.z + ring.halfDepth * Math.sign(s) * Math.abs(s) ** (2 / ring.square)]);
        }
      }
      const brim = DRUNKARD_KIT.peak;
      if (Math.abs(y - brim.y) < 0.008) {
        for (let k = 0; k < 120; k += 1) {
          const t = (k / 120) * Math.PI * 2;
          points.push([brim.halfWidth * Math.cos(t), brim.z + brim.halfDepth * Math.sin(t)]);
        }
      }
      return points;
    };
    const crown = DRUNKARD_HAT[DRUNKARD_HAT.length - 1]!.y;
    for (const [name, azimuth] of Object.entries(AZIMUTHS)) {
      let overTheFace = 0;
      for (const vertex of tube) {
        if (vertex.y < 0.165 || vertex.y > crown) continue;
        const outline = outlineAt(vertex.y);
        if (outline.length === 0) continue;
        // Screen-right and camera-nearness at this azimuth.
        const s = Math.cos(azimuth) * vertex.x - Math.sin(azimuth) * vertex.z;
        const d = Math.sin(azimuth) * vertex.x + Math.cos(azimuth) * vertex.z;
        let low = Infinity;
        let high = -Infinity;
        let surface = -Infinity;
        for (const [x, z] of outline) {
          const ps = Math.cos(azimuth) * x - Math.sin(azimuth) * z;
          const pd = Math.sin(azimuth) * x + Math.cos(azimuth) * z;
          low = Math.min(low, ps);
          high = Math.max(high, ps);
          if (Math.abs(ps - s) < 0.012) surface = Math.max(surface, pd);
        }
        if (s > low && s < high && d > surface) overTheFace += 1;
      }
      assert.equal(overTheFace, 0, `${overTheFace} tube vertices lie over the head from the ${name} camera`);
    }
  } finally {
    rider.dispose();
  }
});

test('the hose runs from the pack to the collarbone, and never above the neck ring', () => {
  const knots = DRUNKARD_HOSE.points();
  const first = knots[0]!;
  const last = knots[knots.length - 1]!;
  // On the pack: inside the box's footprint at the knot's own height, at
  // its top corner (the pint the hose used to leave from is gone — the
  // head's arc owned that space; see `DRUNKARD_BOX_TOP`).
  const at = DRUNKARD_PACK.reduce((best, ring) => (Math.abs(ring.y - first.y) < Math.abs(best.y - first.y) ? ring : best));
  assert.ok(Math.abs(first.x) <= at.halfWidth && Math.abs(first.z - at.z) <= at.halfDepth, 'the hose does not start on the pack');
  assert.ok(first.y >= 0.40 && first.y <= DRUNKARD_PACK[DRUNKARD_PACK.length - 1]!.y, 'the hose does not start at the pack\'s top');
  // Over the RIGHT shoulder — the q105 mirror ruling — and to the collarbone:
  // every knot on the right, the last one a hand's width off the jersey at
  // collarbone height.
  for (const knot of knots) assert.ok(knot.x < 0, `a hose knot crosses to his left at (${knot.x.toFixed(3)}, ${knot.y.toFixed(3)})`);
  assert.ok(last.y > 0.455 && last.y < 0.500, `the valve sits at ${(last.y * 1000).toFixed(0)} mm, not the collarbone`);
  assert.ok(last.z > 0.05, 'the valve is not on the chest');
  const off = -depthInside(DRUNKARD_JERSEY, last);
  assert.ok(off > 0.008 && off < 0.035, `the valve stands ${(off * 1000).toFixed(0)} mm off the jersey`);

  const rider = createPlaceholderRider(HIS);
  try {
    const pack = rider.root.getObjectByName('rider-drunkard-pack') as THREE.Mesh;
    assert.ok(pack, 'the pack is missing');
    assert.equal(pack.parent, rider.pelvis, 'the pack must ride the pelvis');
    assert.equal(pack.castShadow, true, 'the pack carries the silhouette and must cast');
    const position = pack.geometry.getAttribute('position');
    const colour = pack.geometry.getAttribute('color');
    // The hose is the amber-tinted part of the extra: the pack is
    // page-coloured at 1 and the valve is gear-brown, under 0.2 in red.
    // (Pinned by colour rather than by height since round 1, because the
    // vessel's crown is now above the hose.)
    let highest = -Infinity;
    let hoseVertices = 0;
    for (let i = 0; i < position.count; i += 1) {
      const r = colour.getX(i);
      if (r > 0.999 || r < 0.5) continue;
      hoseVertices += 1;
      highest = Math.max(highest, position.getY(i));
    }
    assert.ok(hoseVertices > 50, `only ${hoseVertices} hose vertices`);
    assert.ok(
      highest <= NECK_RING,
      `the hose reaches ${(highest * 1000).toFixed(1)} mm — over the neck ring at ${(NECK_RING * 1000).toFixed(0)}`,
    );
    // The bite valve is told from the strap it lands on — gauntlet round
    // 2. Round 1 tinted it gear × 1.6 while the straps were at 1.08, then
    // lifted the straps to 1.60, and gear × 1.60 over the print ground is
    // gear × 1.6 to 0.3 %: the fitting and the webbing were one colour in
    // every light. Pinned as a *ratio* against whatever the straps wear,
    // never as a hex (a hex pin would not have caught it): the valve's
    // worn red at least 2.5× the strap's. And wider than the chest run's
    // band at its height, so it has a side silhouette when both are in
    // the chest's shade and a value step is worth six levels.
    const gear = new THREE.Color(BLOCKOUT_COLOURS.drunkardGear);
    const strapRed = gear.r * DRUNKARD_HOSE.strapShade;
    const valveRed = PRINT.r * DRUNKARD_HOSE.valveTint[0];
    assert.ok(valveRed >= strapRed * 2.5, `the valve's red (${valveRed.toFixed(3)}) is under 2.5× the strap's (${strapRed.toFixed(3)}) — it vanishes into the webbing`);
    assert.ok(DRUNKARD_HOSE.valveTint[0] < 0.5, 'the valve\'s tint red reaches the band the hose census selects by');
    const run = HIS.panels.torso!.patches.find((patch) => patch.anchor === 'front')!;
    const v = vAtHeight(DRUNKARD_JERSEY, DRUNKARD_HOSE.valve.y);
    const outer = new THREE.Vector3();
    const inner = new THREE.Vector3();
    loftPoint(DRUNKARD_JERSEY, Math.PI / 2 + run.u0, v, outer);
    loftPoint(DRUNKARD_JERSEY, Math.PI / 2 + run.u1, v, inner);
    const band = outer.distanceTo(inner);
    assert.ok(DRUNKARD_HOSE.valveHalfWidth * 2 > band + 0.004, `the valve is ${(DRUNKARD_HOSE.valveHalfWidth * 2000).toFixed(0)} mm across on a ${(band * 1000).toFixed(0)} mm strap — no side silhouette`);
    let valveVertices = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(colour.getX(i) - DRUNKARD_HOSE.valveTint[0]) < 1e-6 && Math.abs(position.getY(i) - DRUNKARD_HOSE.valve.y) < 0.02) valveVertices += 1;
    }
    assert.ok(valveVertices > 20, `only ${valveVertices} vertices wear the valve's tint at the collarbone`);
  } finally {
    rider.dispose();
  }
});

test('the pack stands off the back and its window looks backward', () => {
  // The pack's inner face is buried in the jersey's back and its outer face
  // stands clear — a volume out of a body, not a slab on it — and the
  // window is printed on the face the chase camera sees.
  const point = new THREE.Vector3();
  for (const y of [0.22, 0.30, 0.40]) {
    loftPoint(DRUNKARD_JERSEY, -Math.PI / 2, vAtHeight(DRUNKARD_JERSEY, y), point);
    const inner = DRUNKARD_PACK[3]!.z + DRUNKARD_PACK[3]!.halfDepth;
    const outer = DRUNKARD_PACK[3]!.z - DRUNKARD_PACK[3]!.halfDepth;
    assert.ok(inner > point.z + 0.003, `the pack's inner face floats off the back at ${y}`);
    assert.ok(outer < point.z - 0.070, `the pack stands only ${((point.z - outer) * 1000).toFixed(0)} mm off the back`);
  }
  const window = PACK_WINDOW;
  assert.ok(window.s0 > 0.5 && window.s1 < 1 && (window.s0 + window.s1) / 2 > 0.7 && (window.s0 + window.s1) / 2 < 0.8, 'the window is not on the backward face');
  // The beer in the window's middle: darker than the jersey's amber by a
  // stated margin — gauntlet round 1's pin, because the reservoir printed
  // in the jersey's own ink rendered five levels off the suit and read as
  // suit. At least 0.10 of linear distance from `drunkardAmber`, and still
  // an amber (red over green over blue).
  const liquid = wrappedTexel('pack', DRUNKARD_PACK, 0.75, 0.28).multiply(PRINT);
  const amber = new THREE.Color(BLOCKOUT_COLOURS.drunkardAmber);
  const apart = Math.hypot(liquid.r - amber.r, liquid.g - amber.g, liquid.b - amber.b);
  assert.ok(apart >= 0.10, `the window's beer is ${apart.toFixed(3)} from the jersey's amber — it is the suit`);
  assert.ok(liquid.r > liquid.g && liquid.g > liquid.b && liquid.r > 0.25, 'the window is not an amber');
  // The foam line under the lid, all round: cream under the cap and above
  // the deepest drip; the same liquid at the band's foot on the face the
  // window does not cover. The band ends where the box does — the page and
  // the loft agree on that height, or the lid prints over beer (or beer
  // over the lid).
  assert.equal(PACK_BAND.top, DRUNKARD_BOX_TOP, 'the band\'s top on the page is not the box\'s top ring');
  const boxTop = DRUNKARD_PACK.find((ring) => Math.abs(ring.y - DRUNKARD_BOX_TOP) < 1e-9);
  assert.ok(boxTop && boxTop.halfWidth >= 0.099, 'the box\'s top ring is not a full ring of the box');
  assertWorn(wrappedTexel('pack', DRUNKARD_PACK, 0.75, PACK_BAND.top - 0.008), BLOCKOUT_COLOURS.drunkardPrint, 'the foam line');
  assertWorn(wrappedTexel('pack', DRUNKARD_PACK, 0.05, PACK_BAND.top - 0.008), BLOCKOUT_COLOURS.drunkardPrint, 'the foam round the side');
  const side = wrappedTexel('pack', DRUNKARD_PACK, 0.05, PACK_BAND.bottom + 0.012).multiply(PRINT);
  assert.ok(Math.abs(side.r - liquid.r) < 0.06 && side.r > side.g && side.g > side.b, 'the vessel\'s side is not the window\'s beer');
  // The beer runs all the way round from the box's first through-window
  // ring (gauntlet round 2: with the band starting at the vessel the pack
  // was a brown tank from the side, 69 % of its height), so the flank at
  // 300 mm is the beer and the brown holder is the base under 255 mm.
  const flank = wrappedTexel('pack', DRUNKARD_PACK, 0.25 + 0.20, 0.30).multiply(PRINT);
  assert.ok(Math.hypot(flank.r - amber.r, flank.g - amber.g, flank.b - amber.b) >= 0.10 && flank.r > flank.g && flank.g > flank.b && flank.r > 0.25, 'the flank at 300 mm is not the pack\'s beer');
  assertWorn(wrappedTexel('pack', DRUNKARD_PACK, 0.25 + 0.20, 0.21), BLOCKOUT_COLOURS.drunkardBrown, 'the holder\'s base');
  assert.ok(PACK_BAND.bottom <= 0.26, `the all-round beer starts at ${PACK_BAND.bottom} — the flank is a tank again`);
});

test('the straps cross on the slope, never the neck ring, and nothing wraps the flank under the arm', () => {
  // Wheel in Motion's three owner rulings, inherited as pins: the crossing
  // on the trapezius slope (a band on the loft's top ring is a collar), the
  // chest run stopping at it, the lower wrap round the flank at rib height
  // into the pack's side, and nothing at shoulder height on the flank.
  const rings = HIS.profiles.torso;
  const neck = rings[rings.length - 1]!;
  const shoulder = rings.reduce((widest, ring) => (ring.halfWidth >= widest.halfWidth ? ring : widest));
  const straps = HIS.panels.torso!;
  assert.equal(straps.role, 'gear');
  assert.equal(straps.casts, false, 'a strap carries no outline — the pack casts for it');
  assert.equal(straps.patches.length, 4, `${straps.patches.length} patches — the four-patch strap and nothing else`);
  const run = straps.patches.find((patch) => patch.anchor === 'front')!;
  const rear = straps.patches.find((patch) => patch.anchor === 'back')!;
  const outboard = straps.patches.filter((patch) => patch.anchor === 'outboard');
  const crossing = outboard.find((patch) => patch.from >= 0.50)!;
  const wrap = outboard.find((patch) => patch.from < 0.50)!;
  assert.ok(run && rear && crossing && wrap, 'the four patches are not the four they should be');
  for (const patch of straps.patches) assert.equal(patch.mirrored, true, 'every strap patch is one of a pair');
  assert.ok(crossing.from >= shoulder.y - 1e-9, `the crossing starts at ${crossing.from}, below the shoulder ring at ${shoulder.y}`);
  assert.ok(crossing.to <= neck.y - 0.008, `the crossing reaches ${crossing.to} — the neck ring is at ${neck.y}, that is a collar`);
  assert.ok(Math.abs(run.to - crossing.to) < 1e-9, 'the chest run does not stop at the crossing');
  assert.ok(Math.abs(rear.to - crossing.to) < 1e-9, 'the rear run does not stop at the crossing');
  assert.ok(Math.abs(Math.PI / 2 + run.u0 - crossing.u1) < 0.01, 'the crossing does not meet the chest run');
  assert.ok(Math.abs(-Math.PI / 2 + rear.u1 - crossing.u0) < 0.01, 'the crossing does not meet the rear run');
  assert.ok(wrap.from >= 0.22 && wrap.to <= 0.32, `the lower wrap spans ${wrap.from}–${wrap.to}, not the ribs`);
  assert.ok(Math.abs(run.from - wrap.from) < 1e-9, 'the chest run does not end at the lower wrap');
  assert.ok(Math.abs(Math.PI / 2 + run.u0 - wrap.u1) < 0.01, 'the lower wrap does not meet the chest run');
  // Into the pack's side: the wrap's back end is where the pack's side face
  // is, on the jersey at rib height.
  const point = new THREE.Vector3();
  loftPoint(DRUNKARD_JERSEY, wrap.u0, vAtHeight(DRUNKARD_JERSEY, (wrap.from + wrap.to) / 2), point);
  assert.ok(Math.abs(Math.abs(point.x) - DRUNKARD_PACK[3]!.halfWidth) < 0.020, `the lower wrap ends ${(point.x * 1000).toFixed(0)} mm from the midline, not at the pack's side`);

  const rider = createPlaceholderRider(HIS);
  try {
    const mesh = rider.root.getObjectByName('rider-jacket-panels') as THREE.Mesh;
    assert.ok(mesh, 'the strap group is missing');
    const position = mesh.geometry.getAttribute('position');
    let highest = -Infinity;
    let roundTheBack = false;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      highest = Math.max(highest, y);
      if (y > crossing.to - 0.004) {
        assert.ok(Math.hypot(x, z) > neck.halfWidth + 0.01, `the straps reach the collar at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`);
      }
      if (y > wrap.from - 0.005 && y < wrap.to + 0.005 && z < -0.08) roundTheBack = true;
      assert.ok(
        !(y > 0.40 && y < 0.50 && Math.abs(x) > 0.12 && Math.abs(z) < 0.05),
        `a strap vertex sits on the flank under the arm at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
      );
    }
    assert.ok(highest > crossing.to - 0.004, `the straps reach ${highest.toFixed(3)}, short of the crossing at ${crossing.to}`);
    assert.ok(roundTheBack, 'the chest straps never come round behind the flank — they hang');
  } finally {
    rider.dispose();
  }
});

test('the can label is amber under a cream top under a rim, the fist\'s can is printed, and the hop cone is on the chest, both knees, both cans and the fist', () => {
  // The label band, sampled the way the painter addresses it — through the
  // can's own rings — at the rim, the label, the top and (round 2) the lid:
  // without a rim over the cream the can was open-topped, a tankard.
  assertWorn(wrappedTexelOnSub(0.5, 0.004), BLOCKOUT_COLOURS.drunkardPrint, 'the can\'s rim');
  assertWorn(wrappedTexelOnSub(0.5, 0.060), BLOCKOUT_COLOURS.drunkardAmber, 'the can\'s label');
  assertWorn(wrappedTexelOnSub(0.5, CAN_TOP + 0.020), BLOCKOUT_COLOURS.drunkardPrint, 'the can\'s top band');
  const canApex = DRUNKARD_SHEET_LAYOUT.can[DRUNKARD_SHEET_LAYOUT.can.length - 1]!.y;
  assertWorn(wrappedTexelOnSub(0.5, canApex - CAN_LID / 2), BLOCKOUT_COLOURS.drunkardBrown, 'the can\'s top rim');
  assert.ok(CAN_RIM < 0.02 && CAN_TOP > 0.08 && CAN_TOP + 0.020 < canApex - CAN_LID, 'the label bands are not a rim, a label, a top and a lid');
  // The can in his fist wears its own page (round 2): a cream base rim, a
  // brown line, amber, the cream top — with the cone on the face that
  // looks ahead and nowhere on the face in the fist.
  const { rim, line, top } = DRUNKARD_HAND_CAN_BANDS;
  assertWorn(wrappedTexelOnHandCan(0.5, rim / 2), BLOCKOUT_COLOURS.drunkardPrint, 'the fist can\'s base rim');
  assertWorn(wrappedTexelOnHandCan(0.5, rim + line / 2), BLOCKOUT_COLOURS.drunkardBrown, 'the fist can\'s line');
  assertWorn(wrappedTexelOnHandCan(0.5, rim + line + 0.006), BLOCKOUT_COLOURS.drunkardAmber, 'the fist can\'s label');
  assertWorn(wrappedTexelOnHandCan(0.5, top + 0.015), BLOCKOUT_COLOURS.drunkardPrint, 'the fist can\'s cream top');
  const handCan = DRUNKARD_REGIONS.handCan;
  const handCanBox = (u0: number, u1: number) => ({
    x0: (handCan.u0 + (handCan.u1 - handCan.u0) * handCanPageS(u0)) * ATLAS_SIZE,
    x1: (handCan.u0 + (handCan.u1 - handCan.u0) * handCanPageS(u1)) * ATLAS_SIZE,
    y0: handCan.v0 * ATLAS_SIZE,
    y1: handCan.v1 * ATLAS_SIZE,
  });
  assert.ok(hopTexels(handCanBox(HAND_CAN_HOP.angle - 0.08, HAND_CAN_HOP.angle + 0.08)) > 150, 'no hop cone on the fist can');
  assert.equal(hopTexels(handCanBox(0.55, 0.95)), 0, 'a cone on the face of the fist can that sits in the fist');

  // The cone on the chest: hop green in the centre panel, and nowhere on the
  // yoke beside it.
  const jersey = DRUNKARD_REGIONS.jersey;
  const rings = DRUNKARD_JERSEY;
  const chestRow = (y: number): number => (jersey.v0 + (jersey.v1 - jersey.v0) * (vAtHeight(rings, y) / (rings.length - 1))) * ATLAS_SIZE;
  const chestCol = (s: number): number => (jersey.u0 + (jersey.u1 - jersey.u0) * s) * ATLAS_SIZE;
  const chest = hopTexels({ x0: chestCol(0.22), x1: chestCol(0.28), y0: chestRow(0.370), y1: chestRow(0.435) });
  assert.ok(chest > 300, `only ${chest} hop texels on the chest`);
  assert.equal(hopTexels({ x0: chestCol(0.12), x1: chestCol(0.16), y0: chestRow(0.370), y1: chestRow(0.435) }), 0, 'hop green on the bib');
  // The knee page: the cone in its middle on brown.
  const knee = DRUNKARD_REGIONS.knee;
  const kneeBox = { x0: knee.u0 * ATLAS_SIZE, x1: knee.u1 * ATLAS_SIZE, y0: knee.v0 * ATLAS_SIZE, y1: knee.v1 * ATLAS_SIZE };
  assert.ok(hopTexels(kneeBox) > 400, 'no hop cone on the knee page');
  assertWorn(texel(kneeBox.x0 + 4, kneeBox.y0 + 4), BLOCKOUT_COLOURS.drunkardBrown, 'the knee pad\'s field');
  // The can label: the cone at s = 0.25 — the face the look turns outboard —
  // and not on the opposite face.
  const kit = DRUNKARD_REGIONS.kit;
  const labelBox = (s0: number, s1: number) => ({
    x0: (kit.u0 + (kit.u1 - kit.u0) * s0) * ATLAS_SIZE,
    x1: (kit.u0 + (kit.u1 - kit.u0) * s1) * ATLAS_SIZE,
    y0: (kit.v0 + (kit.v1 - kit.v0) * KIT_LABEL.t0) * ATLAS_SIZE,
    y1: (kit.v0 + (kit.v1 - kit.v0) * KIT_LABEL.t1) * ATLAS_SIZE,
  });
  assert.ok(hopTexels(labelBox(0.15, 0.35)) > 150, 'no hop cone on the can label');
  assert.equal(hopTexels(labelBox(0.60, 0.90)), 0, 'a second cone on the can\'s hidden face');

  // Both knees wear the knee page and both cans the label: on the built rig.
  const rider = createPlaceholderRider(HIS);
  try {
    for (const side of ['left', 'right']) {
      const pad = rider.root.getObjectByName(`rider-knee-pad-${side}`) as THREE.Mesh;
      assert.ok(pad, `the ${side} knee pad is missing`);
      const uv = pad.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i += 1) {
        assert.ok(uv.getX(i) >= knee.u0 - 1e-6 && uv.getX(i) <= knee.u1 + 1e-6 && uv.getY(i) >= knee.v0 - 1e-6 && uv.getY(i) <= knee.v1 + 1e-6, `the ${side} knee pad is off the knee page`);
      }
    }
  } finally {
    rider.dispose();
  }
});

test('the knee cone is drawn against the lifted pad, and measures 45 mm wide on it', () => {
  // Gauntlet round 3's finding, finished after the owner's ride: the fixer
  // that died taught `patchStretch` about a pad's lift and never gave the
  // knee layout the number, so the cone was still drawn against the bare
  // shin's 81 mm arc — 1.28× too squat — while the comment described the
  // pad. One home for the lift, and the cone measured back off the page at
  // the pad's own arc, so a span that loses its lift fails here rather than
  // in a capture.
  const span = DRUNKARD_SHEET_LAYOUT.kneePad;
  const patch = HIS.panels.kneePad!.patches[0]!;
  assert.ok((span.lift ?? 0) >= 0.015, `the knee layout carries no lift (${span.lift})`);
  assert.equal(patch.lift, span.lift, 'the pad patch and the page layout disagree on the lift');
  // The pad's arc across at its mid height, on the face the pad actually
  // builds — the shin offset along its normal by the lift.
  const shin = DRUNKARD_SHEET_LAYOUT.shin;
  const v = vAtHeight(shin, (span.from + span.to) / 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const at = (u: number, out: THREE.Vector3): void => {
    loftPoint(shin, u, v, out);
    out.addScaledVector(loftNormal(shin, u, v, normal), span.lift ?? 0);
  };
  at(Math.PI / 2 + span.u0, a);
  let arc = 0;
  for (let i = 1; i <= 96; i += 1) {
    at(Math.PI / 2 + span.u0 + (span.u1 - span.u0) * (i / 96), b);
    arc += a.distanceTo(b);
    a.copy(b);
  }
  assert.ok(arc > 0.095 && arc < 0.115, `the lifted pad's arc across is ${(arc * 1000).toFixed(1)} mm`);
  // The cone's green on the knee page: its column extent is its width on
  // the pad, its row extent against its columns is the aspect the stretch
  // drew it at. Without the lift the stretch is 1.13 and the aspect ~1.6;
  // with it 1.45 and ~2.0.
  const knee = DRUNKARD_REGIONS.knee;
  const x0 = knee.u0 * ATLAS_SIZE;
  const x1 = knee.u1 * ATLAS_SIZE;
  const y0 = knee.v0 * ATLAS_SIZE;
  const y1 = knee.v1 * ATLAS_SIZE;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (let y = Math.ceil(y0); y < y1; y += 1) {
    for (let x = Math.ceil(x0); x < x1; x += 1) {
      if (hopTexels({ x0: x, x1: x + 1, y0: y, y1: y + 1 }) === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y + 1);
    }
  }
  const width = ((right - left) / (x1 - x0)) * arc;
  const aspect = (top - bottom) / (right - left);
  assert.ok(width > 0.040 && width < 0.050, `the cone is ${(width * 1000).toFixed(1)} mm wide on the pad (45 expected)`);
  assert.ok(aspect > 1.85, `the cone's page aspect is ${aspect.toFixed(2)} — drawn against the bare shin, not the lifted pad`);
});

/** A texel of the kit page's label band, addressed as the painter addresses it. */
function wrappedTexelOnSub(s: number, y: number): THREE.Color {
  const kit = DRUNKARD_REGIONS.kit;
  const can = DRUNKARD_SHEET_LAYOUT.can;
  const t = KIT_LABEL.t0 + (KIT_LABEL.t1 - KIT_LABEL.t0) * (vAtHeight(can, y) / (can.length - 1));
  return texel((kit.u0 + (kit.u1 - kit.u0) * s) * ATLAS_SIZE, (kit.v0 + (kit.v1 - kit.v0) * t) * ATLAS_SIZE);
}

/** A texel of the fist can's page, addressed by loft angle (a turn from the outboard face) and metres up the can. */
function wrappedTexelOnHandCan(u01: number, y: number): THREE.Color {
  const page = DRUNKARD_REGIONS.handCan;
  const can = DRUNKARD_SHEET_LAYOUT.handCan;
  const t = vAtHeight(can, y) / (can.length - 1);
  return texel((page.u0 + (page.u1 - page.u0) * handCanPageS(u01)) * ATLAS_SIZE, (page.v0 + (page.v1 - page.v0) * t) * ATLAS_SIZE);
}

test('the hat page is amber under a cream foam mound whose edge drips unevenly', () => {
  const hat = DRUNKARD_HAT;
  assertWorn(wrappedTexel('hat', hat, 0.25, 0.360), BLOCKOUT_COLOURS.drunkardPrint, 'the crown');
  assertWorn(wrappedTexel('hat', hat, 0.25, 0.250), BLOCKOUT_COLOURS.drunkardAmber, 'the shell at the brow');
  assertWorn(wrappedTexel('hat', hat, 0.5, 0.250), BLOCKOUT_COLOURS.drunkardAmber, 'the shell at the temple');
  // Uneven: the foam's edge is not one height round the shell, and it is the
  // same edge on every build.
  const edges = Array.from({ length: 64 }, (_, i) => hatFoamEdge(i / 64));
  const spread = Math.max(...edges) - Math.min(...edges);
  assert.ok(spread > 0.020, `the foam edge varies by only ${(spread * 1000).toFixed(0)} mm — a hoop, not drips`);
  assert.equal(hatFoamEdge(0.37), hatFoamEdge(0.37));
  // And the shell wears the hat page on its own loft: every head vertex on it.
  const rider = createPlaceholderRider(HIS);
  try {
    const head = rider.neck.children.find((child) => {
      if ((child as THREE.Mesh).isMesh !== true || child.name !== '') return false;
      (child as THREE.Mesh).geometry.computeBoundingBox();
      return (child as THREE.Mesh).geometry.boundingBox!.max.y > 0.30;
    }) as THREE.Mesh;
    assert.ok(head, 'the hat mesh is missing');
    const page = DRUNKARD_REGIONS.hat;
    const uv = head.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) {
      assert.ok(uv.getX(i) >= page.u0 - 1e-6 && uv.getX(i) <= page.u1 + 1e-6 && uv.getY(i) >= page.v0 - 1e-6 && uv.getY(i) <= page.v1 + 1e-6, 'a hat vertex is off the hat page');
    }
  } finally {
    rider.dispose();
  }
});

test('no hop green and no amber ink reaches any other rider\'s sheet', () => {
  // The brief's rule that his props never propagate to the real riders,
  // stated for the one thing that could propagate silently: an ink. The
  // exact bytes his hop cone and his amber encode to, scanned for on the
  // two other sheets in the game.
  const ground = linearFromHex(BLOCKOUT_COLOURS.drunkardPrint);
  const encode = (rgb: Rgb): [number, number, number] => {
    const byte = (channel: number): number => {
      const clamped = Math.min(1, Math.max(0, channel));
      const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255);
    };
    return [byte(rgb[0]), byte(rgb[1]), byte(rgb[2])];
  };
  const forbidden = [
    encode(inkOver(ground, linearFromHex(BLOCKOUT_COLOURS.drunkardHop))),
    encode(inkOver(ground, linearFromHex(BLOCKOUT_COLOURS.drunkardAmber))),
  ];
  // His own sheet carries both, or the scan below proves nothing.
  const his = drunkardAtlasPixels(DRUNKARD_SHEET_LAYOUT);
  const count = (pixels: Uint8Array, [r, g, b]: [number, number, number]): number => {
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b) n += 1;
    return n;
  };
  assert.ok(count(his, forbidden[0]!) > 500, 'his own sheet carries no hop ink — the scan is blind');
  assert.ok(count(his, forbidden[1]!) > 50_000, 'his own sheet carries no amber ink — the scan is blind');
  for (const [name, pixels] of [
    ['Wheel in Motion', wimAtlasPixels(WIM_SHEET_LAYOUT)],
    ['Maribel', maribelAtlasPixels()],
  ] as const) {
    for (const ink of forbidden) {
      assert.equal(count(pixels, ink), 0, `${name}'s sheet carries his ink (${ink.join(',')})`);
    }
  }
});

test('the face is one casting skin extra, because the skull under the hat is in it', () => {
  // Rule 3: `castShadow` is what the ghost draws. The skull lives in this
  // mesh, so a non-casting face was a ghost (and a shadow) with a hat
  // floating 110 mm over a neck — Codex's QA after Phase 2. The kit and the
  // pack change his outline and cast too.
  const face = HIS.extras.find((extra) => extra.name === 'rider-drunkard-face')!;
  const kit = HIS.extras.find((extra) => extra.name === 'rider-drunkard-hat-kit')!;
  const pack = HIS.extras.find((extra) => extra.name === 'rider-drunkard-pack')!;
  assert.ok(face && kit && pack, 'the three extras are not the three');
  assert.equal(face.casts, true);
  assert.equal(face.role, 'accent', 'the face is skin');
  assert.equal(face.joint, 'neck');
  assert.equal(kit.casts, true);
  assert.equal(pack.casts, true);
  assert.equal(HIS.parts.neck, 'accent', 'the neck must be skin too');
  // The skin is unmapped: the face's colours are tints and its material
  // carries no sheet. Stated because a mapped skin would fold the face onto
  // the blank page and cost a texture lookup on every feature.
  assert.equal(HIS.atlas!.roles.includes('accent'), false);
  assert.equal(HIS.materials.face, HIS.materials.accent, 'the aperture role is the skin — the shades are lofts in the face');
  // And the head under the hat is derived from the hat's rings, inset: every
  // skin ring above the rim sits inside the shell.
  const rim = DRUNKARD_HAT[0]!.y;
  const point = new THREE.Vector3();
  for (const ring of DRUNKARD_HEAD) {
    if (ring.y < rim + 0.02 || ring.halfWidth < 1e-6) continue;
    for (let k = 0; k < 24; k += 1) {
      loftPoint(DRUNKARD_HEAD, (k / 24) * Math.PI * 2, vAtHeight(DRUNKARD_HEAD, ring.y), point);
      assert.ok(depthInside(DRUNKARD_HAT, point) >= 0.008, `the skull breaks the shell at (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)})`);
    }
  }
  // Both feature families exist and are the right way round: dark lenses
  // under pale glints, a dark mouth under a pale tooth strip.
  const rider = createPlaceholderRider(HIS);
  try {
    const mesh = rider.root.getObjectByName('rider-drunkard-face') as THREE.Mesh;
    assert.equal(mesh.castShadow, true, 'the skull is in this mesh — the ghost and the shadow need it');
    assert.equal(mesh.parent, rider.neck);
    const colour = mesh.geometry.getAttribute('color');
    let dark = 0;
    let lifted = 0;
    for (let i = 0; i < colour.count; i += 1) {
      if (colour.getX(i) < 0.2) dark += 1;
      if (colour.getY(i) > 1.2) lifted += 1;
    }
    assert.ok(dark > 40, `only ${dark} dark vertices — no lenses`);
    assert.ok(lifted > 40, `only ${lifted} lifted vertices — no glints, no teeth`);
  } finally {
    rider.dispose();
  }
});

test('the can is in his left fist only, printed at the label\'s colours, gripped, and the glove is brown', () => {
  const rider = createPlaceholderRider(HIS);
  try {
    const left = rider.root.getObjectByName('rider-hand-left') as THREE.Mesh;
    const right = rider.root.getObjectByName('rider-hand-right') as THREE.Mesh;
    const leftCount = left.geometry.getAttribute('position').count;
    const rightCount = right.geometry.getAttribute('position').count;
    assert.equal(rightCount, DRUNKARD_GLOVE_VERTICES, 'the right hand carries something — the right is the paddle\'s (q105)');
    assert.ok(leftCount > DRUNKARD_GLOVE_VERTICES + DRUNKARD_CAN_VERTICES + 60, 'the left hand carries no can, or no grip');
    const position = left.geometry.getAttribute('position');
    const colour = left.geometry.getAttribute('color');
    const uv = left.geometry.getAttribute('uv');
    const gear = new THREE.Color(BLOCKOUT_COLOURS.drunkardGear);
    const amber = new THREE.Color(BLOCKOUT_COLOURS.drunkardAmber);
    const page = DRUNKARD_REGIONS.handCan;
    let amberVertices = 0;
    let creamVertices = 0;
    let lowest = Infinity;
    let gripping = 0;
    const canEnd = DRUNKARD_GLOVE_VERTICES + DRUNKARD_CAN_VERTICES;
    for (let i = 0; i < position.count; i += 1) {
      const worn = new THREE.Color(PRINT.r * colour.getX(i), PRINT.g * colour.getY(i), PRINT.b * colour.getZ(i));
      if (i < DRUNKARD_GLOVE_VERTICES) {
        // Brown, or the cuff band's hop green — round 1's wrist band, the
        // one green the chase camera can see.
        assert.ok(worn.r < gear.r * 1.7 + 0.01 || isHop(worn), `glove vertex ${i} is not brown`);
        continue;
      }
      lowest = Math.min(lowest, position.getY(i));
      if (i < canEnd) {
        // The can is print (round 2): left at the ground by its vertex
        // colour and folded onto its own page, so its colours are read
        // from the sheet at the vertex's own texture coordinate.
        assert.ok(colour.getX(i) > 0.999 && colour.getY(i) > 0.999 && colour.getZ(i) > 0.999, `can vertex ${i} carries a tint over its print`);
        const u = uv.getX(i);
        const v = uv.getY(i);
        assert.ok(u >= page.u0 - 1e-6 && u <= page.u1 + 1e-6 && v >= page.v0 - 1e-6 && v <= page.v1 + 1e-6, `can vertex ${i} is off the fist can's page`);
        const printed = texel(u * ATLAS_SIZE, v * ATLAS_SIZE).multiply(PRINT);
        if (Math.abs(printed.r - amber.r) < 0.02 && Math.abs(printed.g - amber.g) < 0.02) amberVertices += 1;
        if (Math.abs(printed.r - PRINT.r) < 0.02 && Math.abs(printed.b - PRINT.b) < 0.02) creamVertices += 1;
        continue;
      }
      // The grip: the glove's brown, and its bars stand proud of the can's
      // skin between the fist's tip and the can's top — the target's
      // fingers lap over the can, and the fist loft alone stood 29 mm
      // behind the can's front face.
      assert.ok(worn.r < gear.r * 1.05 + 0.01, `grip vertex ${i} is not the glove's brown`);
      const y = position.getY(i);
      const proud = Math.hypot(position.getX(i), position.getZ(i) - DRUNKARD_HAND_CAN.z) - DRUNKARD_HAND_CAN.radius;
      if (y > -0.105 && y < DRUNKARD_HAND_CAN.top && proud > 0.001) gripping += 1;
    }
    assert.ok(amberVertices >= 24, `only ${amberVertices} amber vertices on the can`);
    assert.ok(creamVertices > 30, `only ${creamVertices} cream vertices on the can`);
    assert.ok(gripping >= 40, `only ${gripping} grip vertices stand proud of the can between the fist's tip and the can's top`);
    assert.ok(Math.abs(lowest - DRUNKARD_HAND_CAN.bottom) < 1e-6, 'the can does not reach its stated bottom');
    // Below the fingertips: the can hangs a readable length below the fist
    // — 85 mm, against the 42 mm that rendered as an 8 px sliver at chase
    // distance (gauntlet round 1) — and the cream boundary sits at least
    // 25 mm under the fingertips so the visible can is two-tone (round 2:
    // at 10 mm it was a 3 px cap on an amber stub the trousers' colour).
    assert.ok(DRUNKARD_HAND_CAN.bottom < -0.180, 'the can does not show below the fist');
    const creamBoundary = DRUNKARD_HAND_CAN.bottom + DRUNKARD_HAND_CAN_BANDS.top;
    assert.ok(creamBoundary <= -0.105 - 0.025, `the cream boundary is ${((-0.105 - creamBoundary) * 1000).toFixed(0)} mm under the fingertips — under 25`);
  } finally {
    rider.dispose();
  }
});

test('the belly is rings — forward and deeper through the middle, with the back where Cool Rider\'s is', () => {
  // The caricature the brief allows (§11) on the skeleton the rig demands:
  // the jersey's middle rings lead Cool Rider's jacket by a stated amount,
  // and their backs are unchanged so the pack derived from the back sits
  // where it did.
  const cool = COOL_RIDER_LOOK.profiles.torso;
  const ringOf = (profile: LoftProfile, y: number) => {
    const point = new THREE.Vector3();
    loftPoint(profile, Math.PI / 2, vAtHeight(profile, y), point);
    const back = new THREE.Vector3();
    loftPoint(profile, -Math.PI / 2, vAtHeight(profile, y), back);
    return { front: point.z, back: back.z };
  };
  let lead = 0;
  for (const y of [0.12, 0.16, 0.19, 0.22, 0.26]) {
    const his = ringOf(DRUNKARD_JERSEY, y);
    const theirs = ringOf(cool, y);
    lead = Math.max(lead, his.front - theirs.front);
    assert.ok(Math.abs(his.back - theirs.back) < 0.004, `the back moved by ${((his.back - theirs.back) * 1000).toFixed(1)} mm at ${y}`);
  }
  assert.ok(lead >= 0.020, `the belly leads the jacket by only ${(lead * 1000).toFixed(0)} mm`);
  // And the shoulders are loose: on Trollina's side of the table, wider
  // than Cool Rider's, and that is the whole of the caricature — no bone moved.
  assert.ok(HIS.armCarriage.splay > COOL_RIDER_LOOK.armCarriage.splay);
});

test('the legs are amber trousers with a cream panel over a cream ground, painted down, brown under the pads', () => {
  const amber = new THREE.Color(BLOCKOUT_COLOURS.drunkardAmber);
  const brown = new THREE.Color(BLOCKOUT_COLOURS.drunkardBrown);
  // The garment's cream is the ivory, a stop under the foam's ground (round 1).
  const ivory = new THREE.Color(BLOCKOUT_COLOURS.drunkardIvory);
  const near = (worn: THREE.Color, target: THREE.Color): boolean => (
    Math.abs(worn.r - target.r) < 0.02 && Math.abs(worn.g - target.g) < 0.02 && Math.abs(worn.b - target.b) < 0.02
  );
  for (const [profile, painter] of [[HIS.profiles.thigh, HIS.paint!.thigh!], [HIS.profiles.shin, HIS.paint!.shin!]] as const) {
    const geometry = loftGeometry(profile, { radialSegments: 18 });
    painter(geometry, 1);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    const seen = { amber: 0, cream: 0, brown: 0 };
    for (let i = 0; i < position.count; i += 1) {
      for (const channel of [colour.getX(i), colour.getY(i), colour.getZ(i)]) assert.ok(channel <= 1 + 1e-9, 'a leg tint paints up');
      const worn = new THREE.Color(PRINT.r * colour.getX(i), PRINT.g * colour.getY(i), PRINT.b * colour.getZ(i));
      if (near(worn, amber)) seen.amber += 1;
      else if (near(worn, ivory)) seen.cream += 1;
      else if (near(worn, brown)) seen.brown += 1;
    }
    geometry.dispose();
    assert.ok(seen.amber > 0 && seen.cream > 0 && seen.brown > 0, `the leg carries ${JSON.stringify(seen)}`);
  }
  // Knee pads only: no shin plate, no thigh pad (the render has none).
  assert.equal(HIS.panels.thighPad, undefined, 'a thigh pad — the render has knee pads only');
  assert.equal(HIS.panels.kneePad!.patches.length, 1, 'the knee group carries more than the pad');
  assert.equal(HIS.panels.kneePad!.patches[0]!.art, 'knee');
});

// ============================================================================
// — His wheel — M29 Phase 3 (`docs/PLANS.md` §29.6, §29.11)
// ============================================================================
//
// The seventh `MachineLook` row: the standard body in beer. What a capture
// settles — that the pads are amber, that the cone is on them, that the
// lamp is white — is not what this section pins. It pins the mechanics that
// would fail silently: the three machine pieces arriving apart (a mapped id
// with no look ships the standard wheel without saying so), a pad ring that
// moves the shins' plane, a page painted against the curve and landing on
// the facets as a tall oval, a bezel band and a light seat authored in
// different files that stop agreeing, and a colour that turns out to be the
// status light's or another rider's.

import { machineForCharacter, MACHINE_IDS, machineSpec } from '../data/machines.ts';
import { WHEEL } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import { createRidingRig } from './ridingRig.ts';
import { createBlockoutEUC } from './euc.ts';
import {
  DRUNKARD_MACHINE_LAYOUT,
  DRUNKARD_MACHINE_LOOK,
  MARIBEL_MACHINE_LOOK,
  STANDARD_MACHINE_LOOK,
  WHEEL_IN_MOTION_MACHINE_LOOK,
  machineLook,
} from './machineLook.ts';
import {
  DRUNKARD_MACHINE_REGIONS,
  MACHINE_SHEET_HEIGHT,
  MACHINE_SHEET_WIDTH,
  PAD_HOP_WIDTH,
  PAD_ROUNDEL_RADIUS,
  drunkardMachineAtlasPixels,
  drunkardMachineRegion,
  drunkardPadPagePixel,
} from './drunkardMachineAtlas.ts';

const HIS_WHEEL = DRUNKARD_MACHINE_LOOK;
const WHEEL_TRIM = new THREE.Color(BLOCKOUT_COLOURS.machineDrunkardTrim);

/** One texel of his machine sheet, decoded from sRGB back to linear. */
function machineTexel(x: number, y: number): THREE.Color {
  const pixels = drunkardMachineAtlasPixels(DRUNKARD_MACHINE_LAYOUT);
  const i = (Math.round(y) * MACHINE_SHEET_WIDTH + Math.round(x)) * 4;
  const decode = (byte: number): number => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return new THREE.Color(decode(pixels[i]!), decode(pixels[i + 1]!), decode(pixels[i + 2]!));
}

const lumaOf = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const hueOf = (c: THREE.Color): number => { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return h.h * 360; };
const nearHex = (c: THREE.Color, hex: number, tolerance = 0.03): boolean => {
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

test('his wheel is seated, resolves to its own row, and costs what the standard wheel costs', () => {
  // The three machine pieces arrive together or not at all (§29.3 fact 1,
  // §23.8's reverted deviation): a mapped id with no look resolves to
  // `standard` and ships the wrong wheel without saying so. So the seat, the
  // roster, the spec, the resolver and the cost are one assertion.
  assert.equal(machineForCharacter('drunkard'), 'drunkard');
  assert.ok(MACHINE_IDS.includes('drunkard'), 'his wheel is not on the roster');
  assert.equal(machineSpec('drunkard').id, 'drunkard', 'his spec falls back to the first entry');
  assert.equal(machineSpec('drunkard').name, "The Drunkard's wheel");
  assert.equal(machineLook('drunkard'), HIS_WHEEL);

  // The standard body, in beer: no cosmetic profile, the carry handle, the
  // standard lamp verbatim, the shared taillight and the plain tyre.
  assert.equal(HIS_WHEEL.shell.profile, undefined, 'his wheel grew a cosmetic shell — the render is the standard body');
  assert.equal(HIS_WHEEL.top.kind, 'handle');
  assert.deepEqual(HIS_WHEEL.headlight.patches, STANDARD_MACHINE_LOOK.headlight.patches, 'the lamp is not the standard white bar');
  assert.equal(HIS_WHEEL.headlight.emissive, STANDARD_MACHINE_LOOK.headlight.emissive);
  assert.equal(HIS_WHEEL.taillight, undefined, 'the taillight is not the shared one');
  assert.equal(HIS_WHEEL.tyre, undefined, 'the tyre is not the plain black one');

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
  // The trim's extra patches and the pad's seam column are real triangles —
  // and few: the cone is print, not geometry. A triangle spent on him is
  // spent four times on a four-seat BelVar (§27.5), so the margin is stated:
  // 800 at Phase 3; 1000 since gauntlet round 2 spent 256 on the trim (the
  // cream shoulder arc and lower stripe carried round to the rear face the
  // chase camera sees, and the forward plate made one panel with the
  // stripe) — deliberately, and this is where it is said.
  assert.ok(his.triangles > standard.triangles, 'the trim and the seam column are real triangles');
  assert.ok(his.triangles - standard.triangles <= 1000, `his wheel spends ${his.triangles - standard.triangles} triangles over the standard — the cone was meant to be print`);
});

test('his wheel builds on his rig, poses and disposes without throwing', () => {
  const rig = createRidingRig(HIS, HIS_WHEEL);
  rig.apply(createPose());
  rig.dispose();
});

test('brown shell, amber pads, cream trim — and none of the three is borrowed', () => {
  // The shell: a near-black *brown*, with headroom. Warm (hue in the
  // orange-brown band), darker than every other brown on him, and lighter
  // than Wheel in Motion's graphite — the `0x24262d` this project learned
  // not to author (`DESIGN.md` §7k) — so the painter can still take the
  // bezel down from it.
  const shell = new THREE.Color(HIS_WHEEL.shell.colour);
  const graphite = new THREE.Color(BLOCKOUT_COLOURS.machineWheelInMotion);
  assert.ok(hueOf(shell) > 15 && hueOf(shell) < 45, `the shell's hue is ${hueOf(shell).toFixed(0)}° — not a brown`);
  assert.ok(lumaOf(shell) < 0.08, `the shell is ${lumaOf(shell).toFixed(3)} in luma — that is not near-black`);
  assert.ok(lumaOf(shell) > lumaOf(graphite) * 1.3, `the shell is ${lumaOf(shell).toFixed(3)} in luma — no headroom over graphite at ${lumaOf(graphite).toFixed(3)}`);
  assert.ok(lumaOf(shell) < lumaOf(new THREE.Color(BLOCKOUT_COLOURS.drunkardGear)), 'the shell is lighter than his boots');
  assert.notEqual(HIS_WHEEL.shell.colour, MARIBEL_MACHINE_LOOK.shell.colour, 'the shell is Maribel\'s');
  assert.notEqual(HIS_WHEEL.shell.colour, WHEEL_IN_MOTION_MACHINE_LOOK.shell.colour, 'the shell is Wheel in Motion\'s');
  assert.notEqual(HIS_WHEEL.shell.colour, STANDARD_MACHINE_LOOK.shell.colour, 'the shell is the standard grey');

  // The pads: printed, so the material is the pale cream base and the amber
  // is the page's ink — and that amber is the wheel's own: the jersey's hue
  // a stop under it, not the status light's rung, not Wheel in Motion's
  // yellow or orange.
  assert.equal(HIS_WHEEL.pads?.colour, BLOCKOUT_COLOURS.machineDrunkardTrim, 'a printed pad is the pale base');
  assert.equal(HIS_WHEEL.pads?.art, 'pads');
  const amber = new THREE.Color(BLOCKOUT_COLOURS.machineDrunkardAmber);
  const jersey = new THREE.Color(BLOCKOUT_COLOURS.drunkardAmber);
  assert.ok(Math.abs(hueOf(amber) - hueOf(jersey)) < 3, `the pads' hue ${hueOf(amber).toFixed(0)}° drifted from the jersey's ${hueOf(jersey).toFixed(0)}°`);
  assert.ok(lumaOf(amber) < lumaOf(jersey), 'the pads outshine the jersey');
  for (const [name, hex] of [
    ['the status light\'s amber rung', BLOCKOUT_COLOURS.statusWarn],
    ['the status light\'s notice rung', BLOCKOUT_COLOURS.statusNotice],
    ['Wheel in Motion\'s yellow', BLOCKOUT_COLOURS.wheelInMotionYellow],
    ['Wheel in Motion\'s orange', BLOCKOUT_COLOURS.wheelInMotionOrange],
  ] as const) {
    assert.notEqual(BLOCKOUT_COLOURS.machineDrunkardAmber, hex, `the pads' amber is ${name}`);
    assert.ok(Math.abs(hueOf(amber) - hueOf(new THREE.Color(hex))) >= 5, `the pads' amber sits within 5° of ${name}`);
  }

  // The trim: cream, the base itself — a stop under his print ground and
  // not Wheel in Motion's white — and every tinted patch on it renders as
  // the pads' amber; every untinted one is the cream.
  assert.equal(HIS_WHEEL.trim.colour, BLOCKOUT_COLOURS.machineDrunkardTrim);
  assert.ok(lumaOf(WHEEL_TRIM) > 0.7, 'the trim base is not pale enough to be cream');
  assert.ok(lumaOf(WHEEL_TRIM) < lumaOf(PRINT), 'the trim outshines the foam on his hat');
  assert.notEqual(HIS_WHEEL.trim.colour, BLOCKOUT_COLOURS.machineWheelInMotionTrim, 'the trim is Wheel in Motion\'s white');
  assert.notEqual(HIS_WHEEL.trim.colour, BLOCKOUT_COLOURS.drunkardPrint, 'the trim is his print ground');
  let amberPatches = 0;
  let creamPatches = 0;
  let noseLobes = 0;
  let shoulderReturns = 0;
  for (const patch of HIS_WHEEL.trim.patches) {
    assert.equal(patch.surface ?? 'shell', 'shell', 'a trim patch rides the pad — its art is the page\'s');
    assert.equal(patch.art, undefined, 'a trim patch asks for a page — the cone is on the pads');
    const worn = wornTrim(patch.tint);
    const centre = (patch.u0 + patch.u1) / 2;
    if (patch.tint) {
      assert.ok(nearHex(worn, BLOCKOUT_COLOURS.machineDrunkardAmber, 0.02), `a tinted patch wears (${worn.r.toFixed(2)}, ${worn.g.toFixed(2)}, ${worn.b.toFixed(2)}), not his amber`);
      amberPatches += 1;
      if (angleGap(centre, Math.PI / 2) < 0.5 && patch.to < 0.50) noseLobes += 1;
      if (patch.from >= WHEEL.padCentreHeight + WHEEL.padHeight / 2) shoulderReturns += 1;
    } else {
      assert.ok(nearHex(worn, BLOCKOUT_COLOURS.machineDrunkardTrim, 0.02), 'an untinted patch is not the cream');
      creamPatches += 1;
    }
  }
  // Two amber lobes under the lamp, two amber shoulder returns; a cream
  // shoulder arc, a cream stripe under the pad and a cream bar ahead of it,
  // per flank.
  assert.equal(noseLobes, 2, `${noseLobes} amber lobes under the lamp`);
  assert.equal(shoulderReturns, 2, `${shoulderReturns} amber shoulder returns`);
  assert.equal(amberPatches, 4, `${amberPatches} amber patches`);
  assert.equal(creamPatches, 6, `${creamPatches} cream patches — two stripes and the arc, per flank`);
  // Mirrored: every patch on the left flank has its twin at θ → π − θ.
  for (const patch of HIS_WHEEL.trim.patches) {
    const twin = HIS_WHEEL.trim.patches.find((other) => (
      Math.abs(other.u0 - (Math.PI - patch.u1)) < 1e-9 && Math.abs(other.u1 - (Math.PI - patch.u0)) < 1e-9
      && other.from === patch.from && other.to === patch.to
    ));
    assert.ok(twin, `the patch at ${patch.u0.toFixed(2)}…${patch.u1.toFixed(2)} × ${patch.from} has no mirror`);
  }
});

test('nothing on the trim glows, and no trim patch reaches the rear where the amber rung lives', () => {
  // The lamp and the status light are the two lights this machine has.
  // Cream or amber plastic that glowed would be a third thing competing
  // with the amber rung — and an amber patch in the light's neighbourhood
  // is the "optional amber light strip" §29.2 ruled out, by another name.
  assert.equal(HIS_WHEEL.trim.emissive, 0x000000);
  assert.equal(HIS_WHEEL.trim.emissiveIntensity, 0);
  const REAR = -Math.PI / 2;
  const MARGIN = 0.30;
  for (const patch of HIS_WHEEL.trim.patches) {
    // The arc may not contain any angle within the margin of rear centre.
    const nearest = Math.min(
      angleGap(patch.u0, REAR),
      angleGap(patch.u1, REAR),
      // Rear centre inside the span counts as zero gap.
      (patch.u0 <= REAR && REAR <= patch.u1) || (patch.u0 <= REAR + Math.PI * 2 && REAR + Math.PI * 2 <= patch.u1) ? 0 : Infinity,
    );
    assert.ok(nearest >= MARGIN, `a trim patch comes within ${nearest.toFixed(2)} rad of the status light's column`);
  }
});

test('the pad keeps the shared pad\'s outer face, ring for ring, and the page lands on its facets', () => {
  // `halfWidth` is the pad's thickness outboard of its centre, and the shared
  // pad's is 0.8 × `WHEEL.padThickness`; a block past that moves the plane
  // the rider's shins rest against, which `riderClearance.test.ts` and the
  // planted-boots property both assume.
  const blocks = HIS_WHEEL.pads?.blocks;
  assert.ok(blocks && blocks.length === 1, 'one pad a side, the shared one');
  const outer = WHEEL.padThickness * 0.8;
  let widest = 0;
  for (const ring of blocks[0]!) {
    widest = Math.max(widest, ring.halfWidth);
    assert.ok(ring.halfWidth <= outer + 1e-9, `a pad ring at ${ring.y} is ${ring.halfWidth} thick — outside the shared face at ${outer}`);
    assert.ok(Math.abs(ring.y) <= WHEEL.padHeight / 2 + 1e-9, `a pad ring at ${ring.y} leaves the shared pad's height`);
  }
  assert.ok(Math.abs(widest - outer) < 1e-9, 'no ring reaches the shared face — the shins would float');

  // Ring for ring: the built pad's extents are the standard pad's to the
  // micron — the fractions restated in `machineLook.ts` have not drifted
  // from `euc.ts`'s. Extents rather than vertices, because a printed pad
  // carries one seam column more.
  const extents = (look: typeof HIS_WHEEL): { x: number; y0: number; y1: number; z: number } => {
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
  };
  const standard = extents(STANDARD_MACHINE_LOOK);
  const his = extents(HIS_WHEEL);
  for (const key of ['x', 'y0', 'y1', 'z'] as const) {
    assert.ok(Math.abs(standard[key] - his[key]) < 1e-6, `the pad's ${key} extent is ${his[key]} against the shared pad's ${standard[key]}`);
  }

  // The page lands on the mesh, not on the curve — the first capture's tall
  // oval. Every outboard vertex of the built pad carries the texture column
  // the layout's own mapping predicts for its position, within a texel and
  // a half; a mapping painted against the analytic superellipse misses by
  // twenty texels at the roundel's edge.
  const euc = createBlockoutEUC(HIS_WHEEL);
  try {
    const pad = euc.group.getObjectByName('euc-pad-left') as THREE.Mesh;
    const position = pad.geometry.getAttribute('position');
    const uv = pad.geometry.getAttribute('uv');
    const page = DRUNKARD_MACHINE_REGIONS.pads;
    let checked = 0;
    for (let i = 0; i < position.count; i += 1) {
      // Outboard columns only, clear of the ±90° columns at x = 0 and of the
      // top and bottom caps (which carry their own centre uv).
      if (position.getX(i) < 0.004 || Math.abs(position.getY(i)) >= WHEEL.padHeight / 2 - 1e-6) continue;
      const [px, py] = drunkardPadPagePixel(DRUNKARD_MACHINE_LAYOUT, position.getZ(i), position.getY(i));
      const meshX = uv.getX(i) * MACHINE_SHEET_WIDTH;
      const meshY = uv.getY(i) * MACHINE_SHEET_HEIGHT;
      assert.ok(Math.abs(meshX - px) < 1.5, `vertex ${i} at z ${position.getZ(i).toFixed(3)} samples column ${meshX.toFixed(1)}; the layout says ${px.toFixed(1)}`);
      assert.ok(Math.abs(meshY - py) < 1.5, `vertex ${i} at y ${position.getY(i).toFixed(3)} samples row ${meshY.toFixed(1)}; the layout says ${py.toFixed(1)}`);
      assert.ok(uv.getX(i) >= page.u0 - 1e-6 && uv.getX(i) <= page.u1 + 1e-6, `vertex ${i} samples outside the pads page`);
      checked += 1;
    }
    assert.ok(checked >= 20, `only ${checked} outboard pad vertices were checked`);
  } finally {
    euc.dispose();
  }
});

test('the hop cone sits on a brown roundel in an amber field on the pads page, and the sheet is only that', () => {
  // Sampled at points of the pad's own frame (metres fore/aft and up from
  // the pad's centre) through the layout's pixel mapping: green at the
  // cone's centre, the roundel's brown just outside the cone, amber
  // beyond the roundel and at the pad's top and bottom.
  const worn = (z: number, y: number): THREE.Color => {
    const [x, py] = drunkardPadPagePixel(DRUNKARD_MACHINE_LAYOUT, z, y);
    return machineTexel(x, py).multiply(WHEEL_TRIM);
  };
  const centre = worn(0, 0);
  assert.ok(hueOf(centre) > 70 && hueOf(centre) < 140 && centre.g > centre.r * 1.4, `the cone's centre is not green: hue ${hueOf(centre).toFixed(0)}°`);
  // The cone is the rider's one drawing: its green is his hop ink, over this
  // sheet's base rather than his print ground — so the target is that ink
  // worn on the trim, not the hop hex itself.
  const hopOnTrim = new THREE.Color(...inkOver(linearFromHex(BLOCKOUT_COLOURS.drunkardPrint), linearFromHex(BLOCKOUT_COLOURS.drunkardHop))).multiply(WHEEL_TRIM);
  let greenAtCentre = 0;
  for (const [dz, dy] of [[0, 0], [0.006, 0.004], [-0.006, -0.004], [0.004, -0.008], [-0.004, 0.008]] as const) {
    const c = worn(dz, dy);
    if (hueOf(c) > 70 && hueOf(c) < 140) greenAtCentre += 1;
    if (Math.max(Math.abs(c.r - hopOnTrim.r), Math.abs(c.g - hopOnTrim.g), Math.abs(c.b - hopOnTrim.b)) < 0.06) greenAtCentre += 0;
  }
  assert.ok(greenAtCentre >= 4, `only ${greenAtCentre} of 5 samples about the cone's centre are green`);
  const plate = worn(PAD_HOP_WIDTH / 2 + 0.008, 0);
  assert.ok(nearHex(plate, BLOCKOUT_COLOURS.drunkardBrown, 0.04), `the roundel beside the cone is (${plate.r.toFixed(2)}, ${plate.g.toFixed(2)}, ${plate.b.toFixed(2)}), not his brown`);
  for (const [z, y, where] of [
    [PAD_ROUNDEL_RADIUS + 0.030, 0, 'ahead of the roundel'],
    [-(PAD_ROUNDEL_RADIUS + 0.030), 0, 'behind the roundel'],
    [0, 0.085, 'above the roundel'],
    [0, -0.085, 'below the roundel'],
    [0.110, 0.060, 'the pad\'s front top corner'],
  ] as const) {
    const c = worn(z, y);
    assert.ok(nearHex(c, BLOCKOUT_COLOURS.machineDrunkardAmber, 0.03), `${where} wears (${c.r.toFixed(2)}, ${c.g.toFixed(2)}, ${c.b.toFixed(2)}), not his amber`);
  }
  // The roundel is round on the pad — its brown reaches the same distance
  // fore and aft as up and down, through the mapping the mesh honours.
  const isBrown = (c: THREE.Color): boolean => nearHex(c, BLOCKOUT_COLOURS.drunkardBrown, 0.05) || nearHex(c, BLOCKOUT_COLOURS.drunkardGear, 0.05);
  assert.ok(isBrown(worn(PAD_ROUNDEL_RADIUS - 0.004, 0)) && isBrown(worn(0, PAD_ROUNDEL_RADIUS - 0.004)), 'the roundel is not round: brown stops short on one axis');
  assert.ok(!isBrown(worn(PAD_ROUNDEL_RADIUS + 0.012, 0)) && !isBrown(worn(0, PAD_ROUNDEL_RADIUS + 0.012)), 'the roundel is not round: brown runs long on one axis');

  // Three pages, and every other art name lands on the neutral one; the
  // plate page is laid out and left cream (nothing asks for it — see the
  // sheet's file comment), the blank page carries no ink.
  assert.deepEqual(Object.keys(DRUNKARD_MACHINE_REGIONS).sort(), ['blank', 'pads', 'plate']);
  assert.equal(drunkardMachineRegion('pads'), DRUNKARD_MACHINE_REGIONS.pads);
  assert.equal(drunkardMachineRegion(undefined), DRUNKARD_MACHINE_REGIONS.blank);
  assert.equal(drunkardMachineRegion('machineMark'), DRUNKARD_MACHINE_REGIONS.blank);
  assert.equal(HIS_WHEEL.atlas?.region('pads'), DRUNKARD_MACHINE_REGIONS.pads);
  for (const name of ['blank', 'plate'] as const) {
    const rect = DRUNKARD_MACHINE_REGIONS[name];
    const c = machineTexel(((rect.u0 + rect.u1) / 2) * MACHINE_SHEET_WIDTH, ((rect.v0 + rect.v1) / 2) * MACHINE_SHEET_HEIGHT);
    assert.ok(c.r > 0.99 && c.g > 0.99 && c.b > 0.99, `the ${name} page carries ink`);
  }
  assert.ok(HIS_WHEEL.trim.patches.every((patch) => patch.art !== 'plate'), 'a patch wears the plate page — its test above assumes nothing does');
});

test('his livery paints the shell dark behind the status light and in the nose recess, and the light is untouched', () => {
  // §29.3 fact 11: the pads are amber by the Maribel axis and the light's
  // amber rung is the same hue a metre away, so §19.7's bezel applies with
  // more force than it did for Red Rider or Wheel in Motion. Sampled from
  // the built geometry, because the painter's band and the light's seat are
  // authored in different files and only the mesh knows whether they agree.
  // The ratio: the bezel is 0.30 of the shell, under half — a shell vertex
  // at 0.45 or more would leave the warning on brown.
  const euc = createBlockoutEUC(HIS_WHEEL);
  const standard = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  try {
    const shell = euc.group.getObjectByName('euc-shell') as THREE.Mesh;
    assert.ok(shell?.isMesh, 'the shell is findable by name');
    const position = shell.geometry.getAttribute('position');
    const colour = shell.geometry.getAttribute('color');
    let bezel = 0;
    let recess = 0;
    let flank = 0;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (z < -0.15 && Math.abs(x) < 0.07 && y > 0.42 && y < 0.556) {
        bezel += 1;
        assert.ok(colour.getX(i) < 0.45, `bezel vertex ${i} keeps a multiplier of ${colour.getX(i)} — the amber rung would sit on brown`);
      }
      if (z > 0.16 && Math.abs(x) < 0.06 && y > 0.40 && y < 0.53) {
        recess += 1;
        assert.ok(colour.getX(i) < 0.45, `nose vertex ${i} keeps a multiplier of ${colour.getX(i)} — the recess is not dark`);
      }
      // And the flank is the brown itself: the painter reaches nothing else.
      // Above 0.42, clear of the suspension slider the shell mesh merges in
      // (its top at 0.41 — `STANCHION_TOP + SLIDER_LENGTH`), which carries
      // its own shade.
      if (Math.abs(x) > 0.09 && Math.abs(z) < 0.10 && y > 0.42 && y < 0.50) {
        flank += 1;
        assert.equal(colour.getX(i), 1, `flank vertex ${i} was painted`);
      }
    }
    assert.ok(bezel > 0, 'no shell vertices behind the status light were sampled');
    assert.ok(recess > 0, 'no shell vertices in the nose recess were sampled');
    assert.ok(flank > 0, 'no flank vertices were sampled');

    // The light: its own mesh, its own material, seated where the standard
    // wheel seats it, and its emissive is the ladder's and not the look's.
    const light = euc.statusLight.material as THREE.MeshStandardMaterial;
    const reference = standard.statusLight.material as THREE.MeshStandardMaterial;
    assert.equal(light.emissive.getHex(), reference.emissive.getHex(), 'the look changed the status light\'s colour');
    assert.equal(light.emissiveIntensity, reference.emissiveIntensity, 'the look changed the status light\'s intensity');
    assert.ok(euc.statusLight.position.distanceTo(standard.statusLight.position) < 1e-9, 'the light moved off its standard seat');
    // And the bezel band sits under the light: the seat is inside the band
    // the vertices above were sampled from.
    assert.ok(euc.statusLight.position.z < -0.15 && euc.statusLight.position.y > 0.42, 'the light is not where the bezel is painted');
  } finally {
    euc.dispose();
    standard.dispose();
  }
});

test('his machine sheet is his: one drawing of the cone, no lettering, no raster, no randomness, and no other machine wears it', () => {
  const source = new URL('./drunkardMachineAtlas.ts', import.meta.url);
  const code = readFileSync(source, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('/**'))
    .join('\n');
  assert.equal(code.includes('inkWord'), false, 'the machine sheet imports lettering');
  assert.equal(code.includes('fillText'), false, 'the machine sheet uses a device font');
  assert.equal(code.includes('Math.random'), false, 'the machine sheet is not deterministic');
  assert.equal(code.includes('Date.now'), false, 'the machine sheet reads a clock');
  assert.equal(code.includes('inkRaster'), false, 'the machine sheet stamps a raster');
  // The cone is imported, not redrawn: one drawing on the chest, the knees,
  // the cans and the pads.
  assert.ok(/import\s*\{[^}]*\bpaintHop\b[^}]*\}\s*from\s*'\.\/drunkardAtlas\.ts'/.test(code), 'the machine sheet does not import paintHop from the rider\'s sheet');
  assert.equal(code.includes('function paintHop'), false, 'the machine sheet redraws the cone');
  // The same sheet twice is the same bytes.
  const first = drunkardMachineAtlasPixels(DRUNKARD_MACHINE_LAYOUT);
  const again = drunkardMachineAtlasPixels({ ...DRUNKARD_MACHINE_LAYOUT });
  assert.equal(first.length, again.length);
  for (let i = 0; i < first.length; i += 1024) assert.equal(first[i], again[i], `texel ${i / 4} differs between two paints`);

  // A sheet of its own: no other machine's look builds it, and his rig's
  // rider materials never carry it (the rider's sheet is a different
  // texture — `render/drunkard.test.ts` above holds the rider to his).
  const his = HIS_WHEEL.atlas!.build();
  try {
    assert.equal(his.name, 'drunkard-machine-atlas');
    for (const id of MACHINE_IDS) {
      if (id === 'drunkard') continue;
      const other = machineLook(id);
      assert.notEqual(other.atlas?.build, HIS_WHEEL.atlas!.build, `${id} builds his machine sheet`);
      if (other.atlas === undefined) continue;
      const theirs = other.atlas.build();
      try {
        assert.notEqual(theirs.name, his.name, `${id}'s sheet is named as his`);
      } finally {
        theirs.dispose();
      }
    }
  } finally {
    his.dispose();
  }
});
