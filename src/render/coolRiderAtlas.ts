/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS as C } from '../data/tuning.ts';
import type { LoftProfile, UvRect } from './blockoutKit.ts';
import { inkField, inkOver, inkSheet, linearFromHex, toSrgbBytes, type Rgb } from './inkKit.ts';

/** Original garment construction, painted in code. No image or font assets. */
export const COOL_ATLAS_SIZE = 1024;
const boxes = {
  jacket: [0, 0, 512, 512], thigh: [512, 0, 768, 512], shin: [768, 0, 1024, 512],
  sleeve: [0, 512, 256, 768], forearm: [256, 512, 512, 768],
  blue: [512, 512, 768, 768], guard: [768, 512, 1024, 768],
  blank: [0, 768, 256, 1024], seat: [256, 768, 512, 1024], pocket: [512, 768, 768, 1024],
} as const;
export type CoolPage = keyof typeof boxes;
export const COOL_REGIONS = Object.freeze(Object.fromEntries(Object.entries(boxes).map(([name, b]) => [
  name, Object.freeze({ u0: (b[0] + 4.5) / 1024, v0: (b[1] + 4.5) / 1024,
    u1: (b[2] - 4.5) / 1024, v1: (b[3] - 4.5) / 1024 }),
]))) as Readonly<Record<CoolPage, UvRect>>;

export interface CoolSheetLayout {
  jacket: LoftProfile; thigh: LoftProfile; shin: LoftProfile;
  sleeve: LoftProfile; forearm: LoftProfile; seat: LoftProfile;
}
const scale = (rgb: Rgb, k: number): Rgb => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
const gaussian = (distance: number, width: number): number => Math.exp(-((distance / width) ** 2));

export function paintCoolAtlas(layout: CoolSheetLayout): Uint8Array {
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
  return toSrgbBytes(sheet);
}

const cached = new WeakMap<CoolSheetLayout, Uint8Array>();
export function createCoolAtlas(layout: CoolSheetLayout): THREE.DataTexture {
  let pixels = cached.get(layout);
  if (!pixels) { pixels = paintCoolAtlas(layout); cached.set(layout, pixels); }
  const texture = new THREE.DataTexture(pixels, 1024, 1024, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.name = 'cool-rider-tailoring';
  return texture;
}
