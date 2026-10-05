/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { DEPOT_SIGN } from '../data/environment.ts';
import { inkDisc, inkRect, inkSheet, inkStroke, inkWord, linearFromHex, toSrgbBytes } from './inkKit.ts';

/** A functional depot fascia, not a printed substitute for the service room.
 * Bold path lettering and one delivery-van silhouette remain useful along the
 * road. No font, external raster, random stream or runtime canvas is involved. */
export function paintDepotSign(): Uint8Array {
  const sheet = inkSheet(DEPOT_SIGN.atlasWidth, DEPOT_SIGN.atlasHeight, linearFromHex(0x293f3b));
  const cream = linearFromHex(0xe0d1b2), dark = linearFromHex(0x293f3b);
  inkStroke(sheet, [[12, 18], [756, 18]], 5, cream);
  inkStroke(sheet, [[12, 238], [756, 238]], 5, cream);
  inkRect(sheet, { x0: 23, y0: 94, x1: 92, y1: 177 }, cream);
  inkRect(sheet, { x0: 89, y0: 123, x1: 132, y1: 177 }, cream);
  inkRect(sheet, { x0: 97, y0: 130, x1: 124, y1: 149 }, dark);
  for (const x of [44, 111]) {
    inkDisc(sheet, [x, 179], 14, cream);
    inkDisc(sheet, [x, 179], 6, dark);
  }
  inkWord(sheet, 'DEPOT', [155, 45], 166, 23, cream, { tracking: 0.10 });
  const printed = toSrgbBytes(sheet), pixels = new Uint8Array(printed.length);
  const stride = DEPOT_SIGN.atlasWidth * 4;
  for (let row = 0; row < DEPOT_SIGN.atlasHeight; row++) pixels.set(
    printed.subarray(row * stride, (row + 1) * stride), (DEPOT_SIGN.atlasHeight - row - 1) * stride);
  return pixels;
}
