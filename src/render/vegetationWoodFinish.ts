/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { BufferGeometry } from 'three';
import { PROP_COLOURS } from '../data/props.ts';
import { materialAppearance } from '../data/surfaces.ts';
import { linearFromHex } from './inkKit.ts';
import type { VegetationPaintContext } from './vegetationForms.ts';

const bark = linearFromHex(materialAppearance('wood').albedo);
const foliage = Object.freeze({ coniferFoliage: linearFromHex(PROP_COLOURS.coniferFoliage), crown: linearFromHex(PROP_COLOURS.broadleafFoliage),
  shrub: linearFromHex(PROP_COLOURS.shrubFoliage) });

/** Existing trunk albedo inside the same foliage bucket. Instance tint still
 * multiplies both finishes; no additional draw/material/texture is allocated.
 * Only leaves are normalized to the authored foliage albedo. Including bark
 * in that mean would recolour leaves when the branch/leaf ratio changes. */
export function finishVegetationWood(geometry: BufferGeometry, context: VegetationPaintContext,
  woodTone: readonly number[] = [1, 1, 1]): void {
  if (!context.wood.some(value => value !== 0)) return;
  const color = geometry.getAttribute('color'), base = foliage[context.family];
  if (color.count !== context.wood.length || context.leaf.length !== color.count)
    throw Error('Vegetation finish requires matching semantic vertices');
  for (let channel = 0; channel < 3; channel++) {
    let sum = 0, count = 0;
    for (let vertex = 0; vertex < color.count; vertex++) if (context.leaf[vertex]) {
      sum += color.array[vertex * 3 + channel]; count++;
    }
    const mean = sum / count;
    if (!Number.isFinite(mean) || mean <= 0) throw Error('Vegetation finish requires positive leaf reflectance');
    for (let vertex = 0; vertex < color.count; vertex++) {
      const offset = vertex * 3 + channel;
      color.array[offset] = context.wood[vertex] ? bark[channel] * woodTone[channel] / base[channel] : color.array[offset] / mean;
    }
  }
}
