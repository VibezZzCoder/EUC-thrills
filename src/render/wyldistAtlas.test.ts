/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { loftProfile, vAtHeight } from './blockoutKit.ts';
import {
  ATLAS_SIZE, WYLDIST_REGIONS, createWyldistAtlas, wyldistAtlasPixels,
  wyldistOpeningHalfWidth, type WyldistSheetLayout,
} from './wyldistAtlas.ts';

// Independent simple profiles let the test read physical locations, rather
// than importing the painter's placement constants or the rider's geometry.
const torso = loftProfile([
  { y: 0.00, halfWidth: 0.17, halfDepth: 0.105 },
  { y: 0.20, halfWidth: 0.18, halfDepth: 0.115 },
  { y: 0.40, halfWidth: 0.19, halfDepth: 0.12 },
  { y: 0.60, halfWidth: 0.17, halfDepth: 0.105 },
]);
const sleeve = loftProfile([
  { y: -0.19, halfWidth: 0.06, halfDepth: 0.06 },
  { y: -0.10, halfWidth: 0.06, halfDepth: 0.06 },
  { y: 0, halfWidth: 0.06, halfDepth: 0.06 },
]);
const head = loftProfile([
  { y: 0.078, halfWidth: 0.125, halfDepth: 0.145 },
  { y: 0.14, halfWidth: 0.14, halfDepth: 0.15 },
  { y: 0.21, halfWidth: 0.14, halfDepth: 0.14 },
  { y: 0.28, halfWidth: 0.12, halfDepth: 0.12 },
  { y: 0.345, halfWidth: 0.015, halfDepth: 0.015 },
]);
const layout: WyldistSheetLayout = Object.freeze({
  torso, upperArm: sleeve, head, headOpenings: [0, 0.5, 0.9, 0, 0],
  visor: { halfSpan: 0.9, from: 0.135, to: 0.265 }, rimTop: 0.105,
  opening: { from: 0.24, to: 0.565, halfWidth: 0.086 },
});

function pixel(bytes: Uint8Array, x: number, y: number): readonly number[] {
  const offset = (Math.round(y) * ATLAS_SIZE + Math.round(x)) * 4;
  return Array.from(bytes.subarray(offset, offset + 4));
}

function pagePixel(
  bytes: Uint8Array, page: keyof typeof WYLDIST_REGIONS, s: number, t: number,
): readonly number[] {
  const region = WYLDIST_REGIONS[page];
  return pixel(bytes,
    (region.u0 + (region.u1 - region.u0) * s) * ATLAS_SIZE,
    (region.v0 + (region.v1 - region.v0) * t) * ATLAS_SIZE,
  );
}

test('Wyldist sheet is opaque, deterministic and contains disjoint inset pages', () => {
  const pixels = wyldistAtlasPixels(layout);
  assert.equal(pixels.length, 1024 * 1024 * 4);
  for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  // A different layout object must produce the same pixels, not just reuse a
  // single cached reference. This catches a hidden random or clock source.
  assert.deepEqual(wyldistAtlasPixels({ ...layout }), pixels);
  const entries = Object.entries(WYLDIST_REGIONS);
  for (let i = 0; i < entries.length; i += 1) {
    const [name, a] = entries[i]!;
    assert.ok(a.u0 > 0 && a.v0 > 0 && a.u1 < 1 && a.v1 < 1, name);
    assert.ok(a.u0 < a.u1 && a.v0 < a.v1, name);
    for (let j = i + 1; j < entries.length; j += 1) {
      const [other, b] = entries[j]!;
      assert.ok(a.u1 < b.u0 || b.u1 < a.u0 || a.v1 < b.v0 || b.v1 < a.v0, `${name}/${other}`);
    }
  }
  assert.deepEqual(pagePixel(pixels, 'blank', 0.5, 0.5), [255, 255, 255, 255]);
});

test('physical chest V is skin ink while the back and lower shirt retain tropical print', () => {
  const pixels = wyldistAtlasPixels(layout);
  assert.equal(wyldistOpeningHalfWidth(layout, 0.20), 0);
  assert.ok(Math.abs(wyldistOpeningHalfWidth(layout, 0.4025) - 0.043) < 1e-12);
  assert.equal(wyldistOpeningHalfWidth(layout, 0.60), 0.086);
  for (const y of [0.31, 0.43, 0.54]) {
    const t = vAtHeight(torso, y) / (torso.length - 1);
    const chest = pagePixel(pixels, 'shirt', 0.25, t);
    assert.ok(chest[0]! > chest[1]! * 1.2 && chest[1]! > chest[2]! * 1.15, `skin rather than white/cloth at ${y}`);
    assert.ok(chest[0]! < 245 && chest[2]! > 110, `skin ink at ${y}`);
    assert.notDeepEqual(pagePixel(pixels, 'shirt', 0.75, t), [255, 255, 255, 255], `back at ${y}`);
  }
  const lowerT = vAtHeight(torso, 0.10) / (torso.length - 1);
  assert.notDeepEqual(pagePixel(pixels, 'shirt', 0.25, lowerT), [255, 255, 255, 255]);
});

test('the two sleeve pages differ only in one small outer hem print', () => {
  const pixels = wyldistAtlasPixels(layout);
  let differences = 0;
  for (let y = 517; y < 764; y += 1) {
    for (let x = 5; x < 508; x += 1) {
      const a = pixel(pixels, x, y), b = pixel(pixels, x + 512, y);
      if (a.every((channel, i) => channel === b[i])) continue;
      differences += 1;
      const s = (x + 0.5 - 4.5) / 503;
      // Overnight 2026-10-10: the word is 1.75× r5's (its cap 2.8 cm, 7.9 cm
      // long), since the owner could not read it; still one word on the outer
      // face, its centre 2.1 cm forward of the seam so a front three-quarter
      // view keeps the last S (round 1's critic read "SML"). Measured round the
      // girth from the seam: ≤ 6.5 cm toward the front, ≤ 2.5 cm toward the back.
      const forward = s < 0.5, arc = (forward ? s : 1 - s) * Math.PI * 0.12;
      assert.ok(arc <= (forward ? 0.065 : 0.025), `print moved off the outer face at ${x},${y}`);
      const t = (y + 0.5 - 516.5) / 247;
      const v = t * (sleeve.length - 1), i = Math.min(sleeve.length - 2, Math.floor(v));
      const height = sleeve[i]!.y + (sleeve[i + 1]!.y - sleeve[i]!.y) * (v - i);
      assert.ok(height >= -0.174 && height <= -0.138, `print moved away from hem at ${x},${y}`);
    }
  }
  assert.ok(differences > 40, 'the permitted sleeve print disappeared');
  // The word inks ≈ 2,800 texels here; a solid backing of its size ≈ 5,300.
  assert.ok(differences < 4000, 'the sleeve print became a large badge');
  // The wrap is continuous: the texels whose centres sit exactly on s = 0 and
  // s = 1 (the inset page edges, 4.5 px in) carry one colour at every height.
  // `pagePixel`'s rounding compared s = 0.002 with s = 1, so any motif edge
  // crossing the seam failed it; sampling the coincident texels at several
  // heights is the stricter form of the same check.
  const region = WYLDIST_REGIONS.leftSleeve;
  for (const height of [-0.14, -0.10, -0.05]) {
    const row = Math.floor((region.v0 + (region.v1 - region.v0) * vAtHeight(sleeve, height) / (sleeve.length - 1)) * ATLAS_SIZE);
    assert.deepEqual(pixel(pixels, region.u0 * ATLAS_SIZE - 0.5, row), pixel(pixels, region.u1 * ATLAS_SIZE - 0.5, row),
      `the sleeve wrap is discontinuous at ${height}`);
  }
});

test('rear helmet badge uses the opening-relative centre and auxiliary corner is neutral', () => {
  const pixels = wyldistAtlasPixels(layout);
  const badgeY = 0.078 + (0.345 - 0.078) * 0.52;
  const t = vAtHeight(head, badgeY) / (head.length - 1);
  const middle = pagePixel(pixels, 'helmet', 0.5, t);
  // The gap between the two numerals is the pale badge, not a black number.
  assert.ok(middle[0]! > 210 && middle[1]! > 210 && middle[2]! > 210);
  const side = pagePixel(pixels, 'helmet', 0.25, t);
  assert.ok(side[0]! > side[1]! * 1.5, 'badge duplicated on helmet side');
  assert.deepEqual(pagePixel(pixels, 'helmet', 0.001, 0.001), [255, 255, 255, 255]);
  // C2 and the real helmet read the disc at 0.38–0.40 of the rear width (r0
  // painted 0.53). Physically that is 0.32–0.40: the head-back close-up's
  // perspective enlarges the rear centre ≈ 15 % against the silhouette.
  // Walk the badge row out from the rear centre to red.
  const f = (badgeY - 0.21) / 0.07, ring = 0.14 - 0.02 * f, aperture = 0.9 * (1 - f);
  const red = (s: number): boolean => { const p = pagePixel(pixels, 'helmet', s, t); return p[0]! > p[1]! * 2; };
  let reach = 0;
  while (!red(0.5 + reach) && reach < 0.25) reach += 0.001;
  // This test shell is elliptical (square 2): x = ring·sin(angle from the rear).
  const diameter = 2 * ring * Math.sin(reach * (Math.PI * 2 - aperture * 2));
  assert.ok(diameter >= 0.32 * ring * 2 && diameter <= 0.40 * ring * 2, `badge ${diameter.toFixed(3)} m on a ${ring * 2} m shell`);
});

// A shell whose eye port opens above a closed chin bar, as the production lid
// does: rings below `visor.from` are whole, so their front column is the chin.
const chinHead = loftProfile([
  { y: 0.060, halfWidth: 0.11, halfDepth: 0.10 }, { y: 0.095, halfWidth: 0.13, halfDepth: 0.135 },
  { y: 0.130, halfWidth: 0.14, halfDepth: 0.15 }, { y: 0.150, halfWidth: 0.145, halfDepth: 0.155 },
  { y: 0.215, halfWidth: 0.145, halfDepth: 0.155 }, { y: 0.230, halfWidth: 0.14, halfDepth: 0.15 },
  { y: 0.300, halfWidth: 0.12, halfDepth: 0.13 }, { y: 0.355, halfWidth: 0.01, halfDepth: 0.01 },
]);
const chinLayout: WyldistSheetLayout = Object.freeze({
  ...layout, head: chinHead, headOpenings: [0, 0, 0, 0.6, 0.6, 0, 0, 0],
  visor: { halfSpan: 0.6, from: 0.130, to: 0.230 }, rimTop: 0.099,
});
const chinT = (y: number): number => vAtHeight(chinHead, y) / (chinHead.length - 1);

test('a brow-height rim datum cannot turn the projecting lower chin bar black', () => {
  // r0's brow datum blackened the lower front. The rim band follows the
  // shell's own lowest ring, so a brow-height datum changes no helmet texel.
  const brow = wyldistAtlasPixels({ ...chinLayout, rimTop: 0.285 });
  const base = wyldistAtlasPixels(chinLayout);
  const helmet = WYLDIST_REGIONS.helmet;
  for (let y = Math.ceil(helmet.v0 * ATLAS_SIZE); y < helmet.v1 * ATLAS_SIZE; y += 1) {
    for (let x = Math.ceil(helmet.u0 * ATLAS_SIZE); x < helmet.u1 * ATLAS_SIZE; x += 3) {
      assert.deepEqual(pixel(brow, x, y), pixel(base, x, y), `rimTop moved the helmet texel ${x},${y}`);
    }
  }
  // The chin bar's flank, 5 cm off the centreline between the vent and the
  // port, is the shell's red.
  const flank = pagePixel(brow, 'helmet', Math.asin(0.05 / 0.135) / (Math.PI * 2), chinT(0.100));
  assert.ok(flank[0]! > 170 && flank[0]! > flank[1]! * 2, `red chin bar became ${flank}`);
});

test('mouth vent is local while the neighbouring chin shell stays red', () => {
  const pixels = wyldistAtlasPixels(chinLayout);
  const t = chinT(0.089); // between two of its grille slats
  const vent = pagePixel(pixels, 'helmet', 0, t);
  const beside = pagePixel(pixels, 'helmet', 0.10, t);
  assert.ok(vent[0]! < 100 && vent[1]! < 100 && vent[2]! < 100, `mouth vent disappeared: ${vent}`);
  assert.ok(beside[0]! > 170 && beside[0]! > beside[1]! * 2, `vent flooded adjacent chin: ${beside}`);
  // A trapezoid under the mouth, not a slot across the jaw: 6 cm off centre at
  // the vent's own height is already red.
  const wide = pagePixel(pixels, 'helmet', Math.asin(0.06 / 0.128) / (Math.PI * 2), t);
  assert.ok(wide[0]! > wide[1]! * 2, `vent became a wide slot: ${wide}`);
});

test('each rig owns a separate configured texture over memoised pixels', () => {
  const a = createWyldistAtlas(layout), b = createWyldistAtlas(layout);
  assert.notEqual(a, b);
  assert.equal(a.image.data, b.image.data);
  assert.equal(a.colorSpace, THREE.SRGBColorSpace);
  assert.equal(a.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(a.magFilter, THREE.LinearFilter);
  assert.equal(a.anisotropy, 4);
  let released = 0;
  a.addEventListener('dispose', () => { released += 1; });
  a.dispose();
  assert.equal(released, 1);
  assert.ok(b.image.data);
  assert.equal(b.image.data.length, ATLAS_SIZE * ATLAS_SIZE * 4);
  b.dispose();
});
