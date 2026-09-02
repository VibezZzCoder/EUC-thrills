/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * A strict PNG container check for the logos that ship as bytes.
 *
 * **Why the decoder is not enough.** `pngDecode.ts` reads a PNG the way a
 * decoder should: it takes the chunks it needs and steps over the rest. That
 * is exactly wrong for a file whose every byte will be published. A third
 * party's mark ships verbatim, and a PNG is a container that can carry text
 * chunks (tEXt, zTXt, iTXt, XMP, EXIF) whose contents are compressed, so a
 * substring scan of the raw bytes for private tokens cannot see them — and it
 * can carry anything at all after `IEND`, which a decoder never reads. An
 * adversarial pass (Codex, 2026-09-01) demonstrated both: a zTXt chunk holding
 * compressed private text passed the embed tool's raw-byte scan, and the same
 * chunk appended after `IEND` passed the embed tool, its `--check`, every logo
 * test and both release scanners, while its text stayed recoverable by anyone
 * who inflated the trailer.
 *
 * So this module says what a shipped logo file may be, and nothing else:
 *
 *   - the eight-byte signature;
 *   - a sequence of chunks, each with a length that fits inside the file and
 *     a CRC-32 that matches its type and data;
 *   - the types `IHDR` (first, exactly 13 bytes, 8-bit RGBA, deflate,
 *     adaptive filtering, non-interlaced — the shipped decoder's one shape),
 *     `IDAT` (one or more, contiguous) and `IEND` (last, empty) and no others;
 *   - **end of file immediately after `IEND`.**
 *
 * It has no imports so the same function runs in the embed tools (Node, at
 * release time) and in the unit tests (against the embedded payload, so the
 * check runs in a public clone with no `references/` folder). The one
 * property it cannot state is whether the deflate stream inside `IDAT` ends
 * where the chunk data ends; the callers check that with `node:zlib`, which
 * reports the bytes it consumed.
 *
 * Every refusal names what it found. None of them is a decoder error: a file
 * this function refuses may well decode perfectly, which is the point.
 */

export interface StrictPng {
  readonly width: number;
  readonly height: number;
  /** Chunk types in file order — always `IHDR`, `IDAT`×n, `IEND` on success. */
  readonly chunks: readonly string[];
  /** The concatenated `IDAT` payload: one zlib stream. */
  readonly idat: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ALLOWED = new Set(['IHDR', 'IDAT', 'IEND']);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (ISO 3309, as PNG uses it) over `bytes[from, to)`. */
export function crc32(bytes: Uint8Array, from = 0, to = bytes.length): number {
  let crc = 0xffffffff;
  for (let i = from; i < to; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
}

function chunkType(bytes: Uint8Array, at: number): string {
  let type = '';
  for (let i = 0; i < 4; i += 1) {
    const c = bytes[at + i]!;
    // PNG chunk types are four ASCII letters. Anything else is not a chunk
    // type, and is named as bytes so the message is readable.
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) {
      return `0x${Array.from(bytes.subarray(at, at + 4), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    }
    type += String.fromCharCode(c);
  }
  return type;
}

/**
 * Validate `bytes` as exactly the container described in the file comment,
 * or throw an `Error` naming the first departure.
 */
export function validateStrictPng(bytes: Uint8Array): StrictPng {
  if (bytes.length < 8 + 12 + 13 + 12 + 12) {
    throw new Error(`png: ${bytes.length} bytes is too short to be IHDR + IDAT + IEND`);
  }
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error('png: bad signature');
  }

  const chunks: string[] = [];
  const idatParts: Uint8Array[] = [];
  let idatLength = 0;
  let width = 0;
  let height = 0;
  let sawIend = false;
  let lastWasIdat = false;
  let at = 8;
  while (at < bytes.length) {
    if (sawIend) {
      throw new Error(`png: ${bytes.length - at} byte(s) after IEND — the file must end there`);
    }
    if (at + 12 > bytes.length) {
      throw new Error(`png: ${bytes.length - at} stray byte(s) where a chunk header should be`);
    }
    const length = u32(bytes, at);
    const type = chunkType(bytes, at + 4);
    const dataAt = at + 8;
    const crcAt = dataAt + length;
    if (crcAt + 4 > bytes.length) {
      throw new Error(`png: ${type} chunk claims ${length} bytes but the file ends first`);
    }
    if (!ALLOWED.has(type)) {
      throw new Error(`png: the file carries a ${type} chunk — only IHDR, IDAT and IEND may ship`);
    }
    const expected = u32(bytes, crcAt);
    const actual = crc32(bytes, at + 4, crcAt);
    if (expected !== actual) {
      throw new Error(`png: ${type} chunk CRC is ${expected.toString(16)}, computed ${actual.toString(16)}`);
    }

    if (chunks.length === 0 && type !== 'IHDR') {
      throw new Error(`png: first chunk is ${type}, not IHDR`);
    }
    if (type === 'IHDR') {
      if (chunks.length !== 0) throw new Error('png: a second IHDR');
      if (length !== 13) throw new Error(`png: IHDR is ${length} bytes, not 13`);
      width = u32(bytes, dataAt);
      height = u32(bytes, dataAt + 4);
      const bitDepth = bytes[dataAt + 8];
      const colourType = bytes[dataAt + 9];
      const compression = bytes[dataAt + 10];
      const filter = bytes[dataAt + 11];
      const interlace = bytes[dataAt + 12];
      if (width === 0 || height === 0) throw new Error(`png: ${width}×${height} is empty`);
      if (bitDepth !== 8 || colourType !== 6) {
        throw new Error(`png: the decoder reads 8-bit RGBA only; this is depth ${bitDepth}, colour type ${colourType}`);
      }
      if (compression !== 0 || filter !== 0) {
        throw new Error(`png: compression ${compression}, filter method ${filter} — only 0/0 exist`);
      }
      if (interlace !== 0) throw new Error('png: interlaced — the decoder reads non-interlaced only');
    } else if (type === 'IDAT') {
      if (idatParts.length > 0 && !lastWasIdat) {
        throw new Error('png: IDAT chunks are not contiguous');
      }
      idatParts.push(bytes.subarray(dataAt, crcAt));
      idatLength += length;
    } else {
      if (length !== 0) throw new Error(`png: IEND carries ${length} bytes`);
      if (idatParts.length === 0) throw new Error('png: IEND before any IDAT');
      sawIend = true;
    }

    chunks.push(type);
    lastWasIdat = type === 'IDAT';
    at = crcAt + 4;
  }
  if (!sawIend) throw new Error('png: no IEND — the file is truncated');

  const idat = new Uint8Array(idatLength);
  let offset = 0;
  for (const part of idatParts) {
    idat.set(part, offset);
    offset += part.length;
  }
  return { width, height, chunks, idat };
}
