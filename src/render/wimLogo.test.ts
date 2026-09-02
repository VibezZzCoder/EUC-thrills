/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import zlib from 'node:zlib';
import {
  WIM_LOGO_ASPECT,
  WIM_LOGO_HEIGHT,
  WIM_LOGO_PNG_BASE64,
  WIM_LOGO_SHA256,
  WIM_LOGO_WIDTH,
} from '../data/wimLogoAsset.ts';
import { bytesFromBase64, decodePng, inflate } from './pngDecode.ts';
import { validateStrictPng } from './pngStrict.ts';

/**
 * Wheel in Motion's mark ships as his file, and this is what says so — M28.
 *
 * `mvLogo.test.ts`' property, protected for the second mark: **provenance,
 * not rendering.** The brief forbids redrawing, approximating, proceduralising
 * or "improving" the logo and says to composite the original pixels unchanged;
 * a capture cannot prove obedience to that, because a picture of a logo looks
 * like a logo either way. A hash can. So the bytes in `data/wimLogoAsset.ts`
 * are re-hashed here against the derived file under `references/` they came
 * from — itself made by script from the owner-supplied master, with the chain
 * written down beside it — and the decoder that unpacks them is checked
 * against Node's own zlib, texel for texel.
 *
 * There is no pack manifest this time; the hash the module carries is the one
 * the embed tool measured. The file on disk is therefore the authority, and
 * the test reads it rather than trusting the number beside the payload.
 *
 * **Where the file is not, the test skips — it does not fail.** `references/`
 * never publishes (the exporter refuses it by path), so the public source
 * export carries this file and not the PNG it names. Codex's QA on the
 * exported tree (2026-09-02) ran it and met `ENOENT`: contributors could not
 * satisfy the README's `npm test`. So the split below is deliberate: what a
 * contributor can check — the recorded hash, the strict container, the
 * shipped decoder against zlib on the embedded stream — always runs; the
 * comparison with the private file runs only where the file exists, and says
 * so when it does not. `tools/public-suite.test.mjs` runs this file from a
 * folder with no `references/` to hold that line.
 */

/** `inflateSync` with `info: true`, typed — the Node typings do not know it. */
function inflateInfo(data: Uint8Array): { buffer: Buffer; engine: { bytesWritten: number } } {
  return zlib.inflateSync(data, { info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
}

const SOURCE = 'references/Wheel-In-Motion/derived/wim-logo-835x368.png';

test('the embedded logo hashes to the number recorded beside it', () => {
  const bytes = bytesFromBase64(WIM_LOGO_PNG_BASE64);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    sha256,
    WIM_LOGO_SHA256,
    'the base64 payload no longer hashes to the SHA-256 recorded beside it',
  );
});

test('the embedded logo is the derived file, byte for byte (private tree only)', (t) => {
  if (!existsSync(SOURCE)) {
    t.skip(`${SOURCE} is not here — the private reference never publishes`);
    return;
  }
  const bytes = bytesFromBase64(WIM_LOGO_PNG_BASE64);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = readFileSync(SOURCE);
  assert.equal(bytes.length, file.length, 'the embedded payload is the wrong length');
  assert.equal(
    createHash('sha256').update(file).digest('hex'),
    sha256,
    'the embedded bytes are not the derived file under references/',
  );
});

test('the file is the shape the shipped decoder reads, and carries nothing else', () => {
  // 8-bit RGBA, non-interlaced: the embed tool refuses anything else, and the
  // decoder throws by name on anything else, so this is the same fact stated
  // where a reader of the suite will meet it.
  //
  // And no other chunk, and no byte after IEND. A metadata chunk is the one
  // place the person behind the persona could reach a published byte stream
  // unread, and the first version of this test walked the chunks and stopped
  // at IEND — which an adversarial pass (2026-09-01) walked straight past: a
  // zTXt chunk of compressed private text appended after IEND passed this
  // test, the embed tool and both release scanners. `pngStrict.ts` is the
  // check now, the same one the embed tool runs, and `pngStrict.test.ts`
  // holds that trailer and its siblings as refusal fixtures.
  const bytes = bytesFromBase64(WIM_LOGO_PNG_BASE64);
  const png = validateStrictPng(bytes);
  assert.equal(png.width, WIM_LOGO_WIDTH);
  assert.equal(png.height, WIM_LOGO_HEIGHT);
  assert.deepEqual(png.chunks, ['IHDR', 'IDAT', 'IDAT', 'IEND']);
  // The chunk walk cannot see inside IDAT; zlib reports what it consumed, so
  // nothing rides between the end of the stream and the end of the chunk.
  const inflated = inflateInfo(png.idat);
  assert.equal(inflated.engine.bytesWritten, png.idat.length, 'bytes inside IDAT past the zlib stream');
  assert.equal(inflated.buffer.length, WIM_LOGO_HEIGHT * (WIM_LOGO_WIDTH * 4 + 1));
});

test('the shipped decoder agrees with zlib, texel for texel', () => {
  const bytes = bytesFromBase64(WIM_LOGO_PNG_BASE64);
  const image = decodePng(bytes);
  assert.equal(image.width, WIM_LOGO_WIDTH);
  assert.equal(image.height, WIM_LOGO_HEIGHT);
  assert.equal(image.rgba.length, WIM_LOGO_WIDTH * WIM_LOGO_HEIGHT * 4);

  // Reference: Node's zlib on the embedded IDAT, unfiltered by hand. The
  // stream comes from the payload, not the file under `references/` — the
  // two are the same bytes (the test above, where the file exists), and this
  // one has to run where the file does not.
  const stream = Buffer.from(validateStrictPng(bytes).idat);
  const raw = zlib.inflateSync(stream);
  const stride = WIM_LOGO_WIDTH * 4;
  const reference = Buffer.alloc(WIM_LOGO_HEIGHT * stride);
  let read = 0;
  for (let y = 0; y < WIM_LOGO_HEIGHT; y += 1) {
    const filter = raw[read];
    read += 1;
    const line = raw.subarray(read, read + stride);
    read += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? reference[y * stride + x - 4]! : 0;
      const b = y > 0 ? reference[(y - 1) * stride + x]! : 0;
      const c = y > 0 && x >= 4 ? reference[(y - 1) * stride + x - 4]! : 0;
      let value = line[x]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      reference[y * stride + x] = value & 0xff;
    }
  }
  let differing = 0;
  for (let i = 0; i < reference.length; i += 1) {
    if (reference[i] !== image.rgba[i]) differing += 1;
  }
  assert.equal(differing, 0, `${differing} bytes differ from zlib's own decode`);

  const mine = inflate(stream, WIM_LOGO_HEIGHT * (stride + 1));
  assert.equal(mine.length, raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    if (mine[i] !== raw[i]) assert.fail(`inflate differs from zlib at byte ${i}`);
  }
});

test('the artwork is the mark on its white ground, in his three colours', () => {
  // Not a rendering test — a sanity read of what was embedded, so a wrong file
  // (a screenshot of a page, the JPEG master's whole square, an empty crop)
  // fails by content and not only by hash. Every edge texel is the white
  // ground the derivation kept as a border, the ground is opaque, and the mark
  // reaches the sheet as blue, orange and its black outline.
  const image = decodePng(bytesFromBase64(WIM_LOGO_PNG_BASE64));
  const { width, height, rgba } = image;
  const at = (x: number, y: number): [number, number, number, number] => {
    const i = (y * width + x) * 4;
    return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
  };
  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      const [r, g, b, a] = at(x, y);
      assert.ok(r >= 250 && g >= 250 && b >= 250 && a === 255, `edge texel ${x},${y} is not ground`);
    }
  }
  let blue = 0;
  let orange = 0;
  let outline = 0;
  let opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (rgba[i + 3] === 255) opaque += 1;
    if (b > 150 && b - r > 60) blue += 1;
    if (r > 200 && g > 60 && g < 170 && b < 80) orange += 1;
    if (r < 40 && g < 40 && b < 40) outline += 1;
  }
  assert.equal(opaque, width * height, 'the ground is not opaque everywhere');
  assert.ok(blue > 20_000, `only ${blue} blue texels — the W is missing`);
  assert.ok(orange > 20_000, `only ${orange} orange texels — the M is missing`);
  assert.ok(outline > 3_000, `only ${outline} outline texels`);
});

test('the aspect ratio is the artwork\'s own', () => {
  assert.equal(WIM_LOGO_ASPECT, WIM_LOGO_WIDTH / WIM_LOGO_HEIGHT);
  // 835 / 368 — the derived file's own dimensions, and the number every
  // placement (card, chest, flank) derives its height from.
  assert.ok(Math.abs(WIM_LOGO_ASPECT - 2.269) < 1e-3, `aspect drifted to ${WIM_LOGO_ASPECT}`);
});
