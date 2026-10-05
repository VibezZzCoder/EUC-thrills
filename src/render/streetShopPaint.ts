/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { STREET_LIFE } from '../data/streetLife.ts';
import { inkDisc, inkRect, inkSheet, inkStroke, inkWord, inkWordLength, linearFromHex, toSrgbBytes } from './inkKit.ts';

/** Only fascia graphics. The shop interior is dimensional geometry, not art
 * printed on the front wall. Original deterministic path lettering, no fonts. */
export function paintStreetShops(): Uint8Array {
  const width = STREET_LIFE.atlasWidth;
  const height = STREET_LIFE.atlasPageHeight * STREET_LIFE.storefronts;
  const sheet = inkSheet(width, height, linearFromHex(0x233738));
  const accents = [0x315f57, 0x914e3d, 0x354f65];
  const names = ['COFFEE', 'GROCER', 'REPAIR'];
  const cream = linearFromHex(0xe1d0a6);
  for (let shop = 0; shop < 3; shop++) {
    const row = shop * STREET_LIFE.atlasPageHeight;
    inkRect(sheet, { x0: 0, y0: row, x1: width, y1: row + 256 }, linearFromHex(accents[shop]));
    inkStroke(sheet, [[18, row + 27], [1006, row + 27]], 3, cream);
    inkStroke(sheet, [[18, row + 229], [1006, row + 229]], 3, cream);
    const size = 166, tracking = 0.12;
    const textWidth = inkWordLength(names[shop], size, tracking);
    const origin: [number, number] = [(width - textWidth) / 2, row + 45];
    // Literal words keep the project-wide provenance scan closed to brands.
    if (shop === 0) inkWord(sheet, 'COFFEE', origin, size, 22, cream, { tracking });
    else if (shop === 1) inkWord(sheet, 'GROCER', origin, size, 22, cream, { tracking });
    else inkWord(sheet, 'REPAIR', origin, size, 22, cream, { tracking });
    for (const x of [38, 986]) inkDisc(sheet, [x, row + 128], shop === 1 ? 8 : 5, cream);
  }
  const printed = toSrgbBytes(sheet), pixels = new Uint8Array(printed.length);
  const stride = width * 4;
  for (let row = 0; row < height; row++) pixels.set(
    printed.subarray(row * stride, (row + 1) * stride), (height - row - 1) * stride);
  return pixels;
}
