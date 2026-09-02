/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import zlib from 'node:zlib';
import {
  MV_LOGO_ASPECT,
  MV_LOGO_HEIGHT,
  MV_LOGO_PNG_BASE64,
  MV_LOGO_SHA256,
  MV_LOGO_WIDTH,
} from '../data/mvLogoAsset.ts';
import { bytesFromBase64, decodePng, inflate } from './pngDecode.ts';
import { validateStrictPng } from './pngStrict.ts';
import { ATLAS_SIZE, MARK_ASPECT, maribelAtlasPixels } from './maribelAtlas.ts';

/**
 * Maribel Vargas's mark ships as her file, and this is what says so.
 *
 * **The property being protected is provenance, not rendering.** Three earlier
 * passes drew the mark in this project's own arithmetic and the owner's verdict
 * on the last of them was that it was *still* butchering her logo; the answer
 * was an asset pack he declared the authority, whose README forbids redrawing,
 * tracing, glyph substitution, procedural approximation, filling the negative
 * space, and stretching X against Y. Obeying that is not something a capture
 * can prove — a picture of a logo looks like a logo either way. A hash can.
 *
 * So: the bytes in `data/mvLogoAsset.ts` are re-hashed here against the number
 * the pack publishes for the file they came from, and the decoder that unpacks
 * them is checked against Node's own zlib. An edit to either fails the suite
 * rather than shipping a subtly different mark.
 */

/** `inflateSync` with `info: true`, typed — the Node typings do not know it. */
function inflateInfo(data: Uint8Array): { buffer: Buffer; engine: { bytesWritten: number } } {
  return zlib.inflateSync(data, { info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
}

const PACK = 'references/Maribel-Vargas/MV_LOGO_ASSET_PACK';

test('the embedded logo hashes to the number recorded beside it', () => {
  const bytes = bytesFromBase64(MV_LOGO_PNG_BASE64);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    sha256,
    MV_LOGO_SHA256,
    'the base64 payload no longer hashes to the SHA-256 recorded beside it',
  );
});

test('the embedded logo is the pack\'s own file, byte for byte (private tree only)', (t) => {
  // The pack lives under `references/`, which never publishes; in the public
  // source export this test skips and says why, rather than failing every
  // contributor's `npm test` on a file they were never given (found by Codex's
  // QA on the exported tree, 2026-09-02). `tools/public-suite.test.mjs` runs
  // this file from a folder with no `references/` to keep it that way.
  if (!existsSync(`${PACK}/integrity_manifest.json`)) {
    t.skip(`${PACK} is not here — the private pack never publishes`);
    return;
  }
  const bytes = bytesFromBase64(MV_LOGO_PNG_BASE64);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // And that recorded hash is the pack's, not one this project computed for
  // whatever it happens to be carrying. The manifest is the pack's own.
  const manifest = JSON.parse(readFileSync(`${PACK}/integrity_manifest.json`, 'utf8'));
  const published = manifest['logo/MV_logo_transparent_CLEAN.png'];
  assert.ok(published, 'the pack manifest no longer lists the master file');
  assert.equal(sha256, published.sha256, 'the embedded bytes are not the pack master');
  assert.equal(bytes.length, published.bytes, 'the embedded payload is the wrong length');
});

test('the file carries pixels and nothing else — no text chunk, no byte after IEND', () => {
  // The manifest hash says the embedded bytes are the pack's file; it does not
  // say what that file contains. Added 2026-09-01 with `pngStrict.ts`, after
  // an adversarial pass showed the sibling logo's pipeline accepted compressed
  // private text in a zTXt chunk and after IEND. The same check runs in the
  // embed tool; the refusal fixtures live in `pngStrict.test.ts`.
  const bytes = bytesFromBase64(MV_LOGO_PNG_BASE64);
  const png = validateStrictPng(bytes);
  assert.equal(png.width, MV_LOGO_WIDTH);
  assert.equal(png.height, MV_LOGO_HEIGHT);
  assert.deepEqual(png.chunks, ['IHDR', 'IDAT', 'IDAT', 'IDAT', 'IDAT', 'IEND']);
  const inflated = inflateInfo(png.idat);
  assert.equal(inflated.engine.bytesWritten, png.idat.length, 'bytes inside IDAT past the zlib stream');
  assert.equal(inflated.buffer.length, MV_LOGO_HEIGHT * (MV_LOGO_WIDTH * 4 + 1));
});

test('the shipped decoder agrees with zlib, texel for texel', () => {
  // The game cannot use `node:zlib` and cannot await an `Image`, so it carries
  // its own inflate. That is a correctness risk worth one test: a bug in a
  // Huffman table is not a crash, it is a logo with a stripe through it.
  const bytes = bytesFromBase64(MV_LOGO_PNG_BASE64);
  const image = decodePng(bytes);
  assert.equal(image.width, MV_LOGO_WIDTH);
  assert.equal(image.height, MV_LOGO_HEIGHT);
  assert.equal(image.rgba.length, MV_LOGO_WIDTH * MV_LOGO_HEIGHT * 4);

  // Reference: Node's zlib on the embedded IDAT, unfiltered by hand. The
  // stream is the payload's own — the same bytes as the pack file where the
  // pack exists (the test above), and present where it does not.
  const stream = Buffer.from(validateStrictPng(bytes).idat);
  const raw = zlib.inflateSync(stream);
  const stride = MV_LOGO_WIDTH * 4;
  const reference = Buffer.alloc(MV_LOGO_HEIGHT * stride);
  let read = 0;
  for (let y = 0; y < MV_LOGO_HEIGHT; y += 1) {
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

  // The inflate is also exercised on its own, because `decodePng` would hide a
  // length mismatch behind a filter error.
  const mine = inflate(stream, MV_LOGO_HEIGHT * (stride + 1));
  assert.equal(mine.length, raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    if (mine[i] !== raw[i]) {
      assert.fail(`inflate differs from zlib at byte ${i}`);
    }
  }
});

test('base64 round-trips whatever Node would have produced', () => {
  // `atob` is a host global and this decoder exists so the game does not need
  // one; that only helps if it agrees with the host.
  const bytes = bytesFromBase64(MV_LOGO_PNG_BASE64);
  const node = Buffer.from(MV_LOGO_PNG_BASE64, 'base64');
  assert.equal(bytes.length, node.length);
  assert.ok(Buffer.from(bytes).equals(node), 'the hand-rolled base64 decode diverged');
});

test('the aspect ratio the atlas prints at is the artwork\'s own', () => {
  // The pack's one machine-checkable rule: never stretch X against Y. The
  // atlas derives every placement's height from this constant, so pinning it
  // to the file's own dimensions closes the whole class.
  assert.equal(MARK_ASPECT, MV_LOGO_HEIGHT / MV_LOGO_WIDTH);
  assert.ok(Math.abs(MV_LOGO_ASPECT - 1.197_026) < 1e-5, `aspect drifted to ${MV_LOGO_ASPECT}`);
  assert.ok(Math.abs(MARK_ASPECT * MV_LOGO_ASPECT - 1) < 1e-12);
});

test('her mark reaches the sheet, in her colours, on all four pages', () => {
  // The stamp itself, sampled where the artwork is solid. Each region is
  // checked for texels that read as her purple *after* the multiplier is
  // applied to the accent material — the sheet is a multiplier, so a raw texel
  // is not a colour until it is multiplied by the base it prints on.
  const pixels = maribelAtlasPixels();
  const base = [0xdc, 0xdd, 0xe1];
  const regions = {
    chest: { x0: 0, y0: 0, x1: 512, y1: 512 },
    backMark: { x0: 0, y0: 768, x1: 512, y1: 1024 },
    machineMark: { x0: 768, y0: 512, x1: 1024, y1: 768 },
    kneeDevice: { x0: 512, y0: 512, x1: 768, y1: 768 },
  };
  for (const [name, box] of Object.entries(regions)) {
    let purple = 0;
    let white = 0;
    for (let y = box.y0; y < box.y1; y += 1) {
      for (let x = box.x0; x < box.x1; x += 1) {
        const i = (y * ATLAS_SIZE + x) * 4;
        const r = (pixels[i]! * base[0]!) / 255;
        const g = (pixels[i + 1]! * base[1]!) / 255;
        const b = (pixels[i + 2]! * base[2]!) / 255;
        // Her mark's purple: blue over green, red between the two.
        if (b - g > 18 && r - g > 8 && r - b < 40 && b > 40) purple += 1;
        // And the grin, which is the brightest thing in the artwork.
        if (r > 200 && g > 200 && b > 200) white += 1;
      }
    }
    assert.ok(purple > 600, `${name} carries only ${purple} texels of her purple`);
    assert.ok(white > 60, `${name} carries only ${white} texels of the grin`);
  }
});
