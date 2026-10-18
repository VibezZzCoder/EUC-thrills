/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** The cool rider's tailoring atlas, painted with hoisted row/column terms
 * (2026-10-18, boot CPU), is byte-identical to the original per-pixel closure
 * painter, kept below verbatim as the reference. */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { BLOCKOUT_COLOURS as C } from '../data/tuning.ts';
import { COOL_ATLAS_SIZE, createCoolAtlas, paintCoolAtlas, type CoolPage, type CoolSheetLayout } from './coolRiderAtlas.ts';
import { COOL_SHEET_LAYOUT } from './coolRiderLook.ts';
import { inkField, inkOver, inkSheet, linearFromHex, toSrgbBytes, type InkSheet, type Rgb } from './inkKit.ts';

// ---- Reference: the closure painter exactly as it shipped before 2026-10-18 ----
/** `inkKit.toSrgbBytes` as it shipped before the grey-pixel shortcut. */
function referenceToSrgbBytes(sheet: InkSheet): Uint8Array {
  const encode = (channel: number): number => {
    const clamped = Math.min(1, Math.max(0, channel));
    const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  };
  const bytes = new Uint8Array(sheet.width * sheet.height * 4);
  for (let i = 0, j = 0; i < sheet.data.length; i += 3, j += 4) {
    bytes[j] = encode(sheet.data[i]!);
    bytes[j + 1] = encode(sheet.data[i + 1]!);
    bytes[j + 2] = encode(sheet.data[i + 2]!);
    bytes[j + 3] = 255;
  }
  return bytes;
}
const boxes = {
  jacket: [0, 0, 512, 512], thigh: [512, 0, 768, 512], shin: [768, 0, 1024, 512],
  sleeve: [0, 512, 256, 768], forearm: [256, 512, 512, 768],
  blue: [512, 512, 768, 768], guard: [768, 512, 1024, 768],
  blank: [0, 768, 256, 1024], seat: [256, 768, 512, 1024], pocket: [512, 768, 768, 1024],
} as const;
const scale = (rgb: Rgb, k: number): Rgb => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
const gaussian = (distance: number, width: number): number => Math.exp(-((distance / width) ** 2));

function referencePaint(layout: CoolSheetLayout): Uint8Array {
  const sheet = inkSheet(1024, 1024, [1, 1, 1]);
  for (const [name, b] of Object.entries(boxes) as [CoolPage, typeof boxes[CoolPage]][]) {
    if (name === 'blank') continue;
    const box = { x0: b[0], y0: b[1], x1: b[2] - 1, y1: b[3] - 1 };
    inkField(sheet, box, (px, py) => {
      const s = Math.max(0, Math.min(1, (px - b[0] - 4.5) / (b[2] - b[0] - 9)));
      const t = Math.max(0, Math.min(1, (py - b[1] - 4.5) / (b[3] - b[1] - 9)));
      const weave = 0.013 * Math.sin(px * Math.PI) * Math.cos(py * 2.09)
        + 0.008 * Math.sin(px * 1.7 + py * 1.3);
      if (name === 'pocket') {
        const edge=Math.min(s,1-s,t,1-t);
        let value=.74+weave-.15*gaussian(edge-.03,.012);
        value+=.14*gaussian(edge-.052,.004)*(.55+.45*Math.sin(py*1.8)**2);
        value-=.23*gaussian(s-.77,.018);
        value+=.20*gaussian(s-.78,.004)*(.5+.5*Math.sin(t*210)**2);
        return [[value,value,value],1];
      }
      if (name === 'blue' || name === 'guard') {
        const base = inkOver(linearFromHex(C.coolPrint), linearFromHex(name === 'blue' ? C.riderPanel : C.coolGear));
        const edge = Math.min(s, 1 - s, t, 1 - t);
        const stitch = edge > .025 && edge < .035 ? .16 : 0;
        const rib = name === 'guard' && Math.abs(s - .5) < .28
          ? .11 * Math.sin(t * 24 * Math.PI) ** 12 : 0;
        return [scale(base, .80 + .18 * Math.sin(Math.PI * s) - .25 * gaussian(edge, .013) + stitch + weave - rib), 1];
      }
      const profile = layout[name];
      const v = t * (profile.length - 1), i = Math.min(profile.length - 2, Math.floor(v));
      const y = profile[i]!.y + (profile[i + 1]!.y - profile[i]!.y) * (v - i);
      const u = s * Math.PI * 2;
      let light = .79 + weave;
      const front = Math.max(0, Math.sin(u));
      const back = Math.max(0, -Math.sin(u));
      // Longitudinal tailoring seams, with a fine lighter stitch on one edge.
      for (const seam of [.06, .44, .60, .90]) {
        light -= .12 * gaussian(s - seam, .004);
        light += .09 * gaussian(s - seam - .006, .0015) * (.55 + .45 * Math.sin(y * 1300) ** 2);
      }
      if (name === 'jacket') {
        // Centre zipper on the front (+Z), from hem to the fitted collar.
        light -= .29 * gaussian(s - .25, .006);
        light += .35 * gaussian(s - .25, .0014) * (.55 + .45 * Math.sin(y * 1500) ** 2);
        const flank = Math.abs(s - .25);
        for (const h of [.085, .185, .288, .395]) {
          const crease = y - h - .12 * flank - .007 * Math.sin(u * 5 + h * 70);
          light -= .10 * gaussian(crease, .006) * front ** 3;
          light += .08 * gaussian(crease - .009, .009) * front ** 3;
        }
        // Back yoke, elbow-friendly broad folds and a quiet lower-back seam.
        light -= .11 * gaussian(y - .40 + .016 * Math.cos(u * 2), .004) * back;
        light += .075 * Math.cos(u * 4) * back;
        light -= .18 * gaussian(y - .024, .003);
      } else if (name === 'thigh') {
        // Pocket opening on each side: garment detail, no label or manufacturer.
        const side = Math.abs(Math.cos(u));
        light -= .19 * gaussian(y + .155 + .025 * Math.sin(u), .004) * side ** 8;
        light += .08 * gaussian(y + .163 + .025 * Math.sin(u), .003) * side ** 8;
        light -= .10 * gaussian(y + .31 + .015 * Math.sin(u * 2), .008) * front;
      } else if (name === 'seat') {
        light -= .15 * gaussian(y + .005, .003);
        light -= .18 * gaussian(s - .25, .014) * front;
      } else {
        // A few cloth compression folds. Their phase varies around the limb,
        // so these never form complete corrugated rings.
        for (const h of [-.065, -.12, -.22, -.30]) {
          const fold = y - h + .014 * Math.sin(u * 2 + h * 19);
          const mask = .2 + .8 * Math.max(0, Math.cos(u + h * 10)) ** 3;
          light -= .10 * gaussian(fold, .005) * mask;
          light += .09 * gaussian(fold - .008, .008) * mask;
        }
      }
      return [[light, light, light], 1];
    });
  }
  return referenceToSrgbBytes(sheet);
}

// ---- End of the reference ----

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function firstDifference(a: Uint8Array, b: Uint8Array): string {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
    const pixel = Math.floor(i / 4);
    return `byte ${i} (x ${pixel % COOL_ATLAS_SIZE}, y ${Math.floor(pixel / COOL_ATLAS_SIZE)}): ${a[i]} vs ${b[i]}`;
  }
  return a.length === b.length ? 'none' : 'length';
}
/** A deterministic variation of every loft: other ring counts and heights. */
function variant(seed: number): CoolSheetLayout {
  let s = seed;
  const random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const vary = (profile: CoolSheetLayout['jacket']) => {
    const rings = Math.max(2, profile.length + Math.floor(random() * 5) - 2);
    return Array.from({ length: rings }, (_, index) => ({ ...profile[Math.min(index, profile.length - 1)]!,
      y: profile[0]!.y + (profile.at(-1)!.y - profile[0]!.y) * (index / (rings - 1)) + (random() - 0.5) * 0.01 }));
  };
  return { jacket: vary(COOL_SHEET_LAYOUT.jacket), thigh: vary(COOL_SHEET_LAYOUT.thigh), shin: vary(COOL_SHEET_LAYOUT.shin),
    sleeve: vary(COOL_SHEET_LAYOUT.sleeve), forearm: vary(COOL_SHEET_LAYOUT.forearm), seat: vary(COOL_SHEET_LAYOUT.seat) } as CoolSheetLayout;
}

test('the shipped tailoring atlas is byte-identical to the closure painter', () => {
  const fast = paintCoolAtlas(COOL_SHEET_LAYOUT), reference = referencePaint(COOL_SHEET_LAYOUT);
  assert.equal(fast.length, COOL_ATLAS_SIZE * COOL_ATLAS_SIZE * 4);
  assert.equal(firstDifference(fast, reference), 'none');
  const texture = createCoolAtlas(COOL_SHEET_LAYOUT);
  try {
    assert.equal(digest(texture.image.data as Uint8Array), digest(reference), 'the installed texture carries the same bytes');
  } finally { texture.dispose(); }
});

test('other loft layouts paint byte-identically too, and the comparison is sensitive', () => {
  for (const seed of [1, 2, 3]) {
    const layout = variant(seed);
    assert.equal(firstDifference(paintCoolAtlas(layout), referencePaint(layout)), 'none', `variant ${seed}`);
  }
  // Known-bad control: a 1 mm shift of one jacket ring moves real bytes, so a
  // painter that dropped or reordered a row term could not pass the pin above.
  const shifted = { ...COOL_SHEET_LAYOUT, jacket: COOL_SHEET_LAYOUT.jacket.map((ring, index) =>
    index === 3 ? { ...ring, y: ring.y + 0.001 } : ring) } as CoolSheetLayout;
  assert.notEqual(firstDifference(referencePaint(shifted), referencePaint(COOL_SHEET_LAYOUT)), 'none');
  assert.equal(firstDifference(paintCoolAtlas(shifted), referencePaint(shifted)), 'none');
});

test('the grey-pixel shortcut in toSrgbBytes encodes exactly as before', () => {
  const special = [0, -0, 1, 2, -1, 0.0031308, 0.00313081, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e-40];
  const width = 64, height = 64, sheet = inkSheet(width, height, [0, 0, 0]);
  let seed = 7;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const pick = () => random() < 0.3 ? special[Math.floor(random() * special.length)]! : random() * 1.2 - 0.1;
    const grey = random() < 0.5, value = pick();
    sheet.data[pixel * 3] = value;
    sheet.data[pixel * 3 + 1] = grey ? (random() < 0.5 ? value : -value) : pick();
    sheet.data[pixel * 3 + 2] = grey ? value : pick();
  }
  assert.equal(firstDifference(toSrgbBytes(sheet), referenceToSrgbBytes(sheet)), 'none');
});
