/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  LETTER_ASPECT,
  inkDisc,
  inkOver,
  inkSample,
  inkSheet,
  inkStroke,
  inkWord,
  inkWordLength,
  linearFromHex,
  toSrgbBytes,
  wordStrokes,
} from './inkKit.ts';

/**
 * The press — M23 Phase A1b.
 *
 * Four properties, and each one is a thing a picture of a rider's chest would
 * not tell you had broken.
 */

test('a printed sheet is the same sheet every time it is printed', () => {
  // **The reason there is a rasterizer here at all rather than a canvas.**
  // Every visual regression capture in this project compares one build against
  // another, and a sheet that differed between runs — because a font resolved
  // differently, because a shape was sampled stochastically — would make every
  // one of those comparisons meaningless. There is no `Math.random` in the ink
  // kit and there is no `fillText`; this asserts the consequence rather than
  // the absence.
  const paint = (): Uint8Array => {
    const sheet = inkSheet(64, 64, [1, 1, 1]);
    inkDisc(sheet, [20, 20], 9, [0.2, 0.4, 0.8]);
    inkStroke(sheet, [[4, 60], [32, 40], [60, 60]], 5, [0.9, 0.1, 0.1]);
    inkWord(sheet, 'VARGAS', [2, 4], 10, 2, [0, 0, 0], { flip: true });
    return toSrgbBytes(sheet);
  };
  assert.deepEqual(Array.from(paint()), Array.from(paint()));
});

test('an unprinted texel multiplies by one', () => {
  // The whole atlas rests on it: a page with no art on it has to leave the
  // mesh underneath exactly as its vertex colours painted it, so "blank" must
  // encode to 255 in all three channels and not to 254. sRGB round-tripping is
  // where that would quietly go wrong.
  const bytes = toSrgbBytes(inkSheet(4, 4, [1, 1, 1]));
  for (let i = 0; i < bytes.length; i += 4) {
    assert.equal(bytes[i], 255);
    assert.equal(bytes[i + 1], 255);
    assert.equal(bytes[i + 2], 255);
    assert.equal(bytes[i + 3], 255, 'the sheet is opaque; a rider is not a window');
  }
});

test('ink can only ever darken, which is why the printing ground is pale', () => {
  // `inkOver` is `tintOver`'s eight-bit twin and the asymmetry between them is
  // a design constraint, not a rounding detail: a vertex colour is a float and
  // may lift a near-black suit to a near-white ground, and a texel may not lift
  // anything at all. If this ever clamped differently, her print would be
  // authored against a ceiling that had moved.
  const pale = linearFromHex(0xdcdde1);
  const leather = inkOver(pale, linearFromHex(0x24262d));
  for (const channel of leather) {
    assert.ok(channel > 0 && channel < 0.2, `leather over pale is ${channel}, not a darkening`);
  }
  const brighter = inkOver(linearFromHex(0x202020), linearFromHex(0xffffff));
  for (const channel of brighter) assert.equal(channel, 1, 'ink claimed to brighten');
});

test('a word is drawn from paths, and refuses a letter it does not have', () => {
  // The refusal is the point. A wordmark that quietly dropped an unknown glyph
  // would print VARGA on a thigh and pass every capture. The alphabet's *size*
  // used to be a second guard here — nine glyphs could not spell a brand — and
  // the venue's own name ended that when it needed four more letters. What
  // replaced it is the scan two tests below; `maribel.test.ts` still holds the
  // narrower claim about her sheet, whose five letters have not moved.
  const sheet = inkSheet(96, 24, [1, 1, 1]);
  inkWord(sheet, 'VARGAS', [2, 4], 16, 3, [0, 0, 0], { flip: true });
  let inked = 0;
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 96; x += 1) if (inkSample(sheet, x, y)[0] < 0.5) inked += 1;
  }
  assert.ok(inked > 40, 'the word left no ink on the sheet');
  assert.ok(inkWordLength('VARGAS', 16) > inkWordLength('VA', 16), 'a longer word is longer');
  assert.throws(() => inkWord(sheet, 'DAINESE', [0, 0], 8, 2, [0, 0, 0]), /no path/);
});


test('a word space advances the pen and prints nothing', () => {
  // BELVAR CIRCUIT is the project's first two-word wordmark, and a space is the
  // only character `wordStrokes` is allowed to skip. Two claims rather than
  // one, because the cheap bug is a space that draws nothing *and* costs
  // nothing, which sets the two words solid and still looks like lettering.
  const tight = wordStrokes('AT', 10);
  const spaced = wordStrokes('A T', 10);
  assert.equal(spaced.length, tight.length, 'the space added or dropped a stroke');
  const advance = 10 * LETTER_ASPECT * 1.16;
  for (let stroke = 0; stroke < tight.length; stroke += 1) {
    // A is the first two strokes and must not move; T is the rest and moves by
    // exactly one advance.
    const shift = stroke < 2 ? 0 : advance;
    for (let point = 0; point < tight[stroke]!.length; point += 1) {
      const moved = spaced[stroke]![point]![0] - tight[stroke]![point]![0];
      assert.ok(
        Math.abs(moved - shift) < 1e-9,
        `stroke ${stroke} point ${point} moved ${moved.toFixed(4)}, not ${shift.toFixed(4)}`,
      );
      assert.equal(spaced[stroke]![point]![1], tight[stroke]![point]![1], 'the space moved a baseline');
    }
  }
  assert.ok(
    Math.abs(inkWordLength('A T', 10) - inkWordLength('AT', 10) - advance) < 1e-9,
    'a space costs no width, so a measured word disagrees with the drawn one',
  );
});

test('the venue letters exist and are drawn like the ones beside them', () => {
  // C, I, U and T arrived for BELVAR CIRCUIT. The claim worth asserting is not
  // that they exist — a missing one throws — but that C was drawn *from* G:
  // a face whose C and G have different bowls has two faces in it, and no
  // capture of a gantry seen from sixty metres would say so.
  for (const letter of 'CIUT') {
    assert.doesNotThrow(() => wordStrokes(letter, 10), `no path for '${letter}'`);
  }
  const c = wordStrokes('C', 10)[0]!;
  const g = wordStrokes('G', 10)[0]!;
  for (let point = 0; point < c.length - 1; point += 1) {
    assert.deepEqual(
      c[point], g[point],
      `C and G part company at point ${point}, so the bowl is drawn twice`,
    );
  }
});

/**
 * Every word this project hands to the press, found in the source rather than
 * trusted.
 *
 * Deliberately crude — a flattened-whitespace regex, not a parser — because it
 * only has to answer one question: is the argument a literal on the list, or
 * the one constant that holds the gantry's word? Anything else, including a
 * variable, fails and should.
 */
function printedWords(source: string): string[] {
  const flat = source.replace(/\s+/g, ' ');
  const found: string[] = [];
  for (const match of flat.matchAll(/\binkWord\s*\(\s*[^,]+,\s*([^,]+),/g)) found.push(match[1]!.trim());
  for (const match of flat.matchAll(/\bwordStrokes\s*\(\s*([^,)]+)\s*[,)]/g)) found.push(match[1]!.trim());
  return found;
}

test('nothing in this project prints a word it does not own', () => {
  // **The guard that replaced "the alphabet is too small to spell it."**
  //
  // That rule held for nine glyphs and died the moment a venue was entitled to
  // its own name: thirteen glyphs spell ARAI, a helmet maker `NOTICE.md` names.
  // Being unable to *spell* a brand was only ever a proxy for being unable to
  // *print* one, and the proxy is the half that broke — so this asserts the
  // thing itself. Two words ship, and both are the project's own: her surname
  // by her grant, and the venue's name.
  //
  // `inkKit.ts` is skipped because the pass-through inside `inkWord` is the
  // mechanism, and the specs because refusing DAINESE means printing it here.
  const root = join(import.meta.dirname, '..');
  const allowed = new Set(["'VARGAS'", 'GANTRY_WORDMARK']);
  const offenders: string[] = [];
  let scanned = 0;
  for (const entry of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    if (entry.endsWith('inkKit.ts')) continue;
    scanned += 1;
    for (const word of printedWords(readFileSync(join(root, entry), 'utf8'))) {
      if (!allowed.has(word)) offenders.push(`${entry} prints ${word}`);
    }
  }
  assert.ok(scanned > 40, `only ${scanned} sources scanned, so the walk found nothing to check`);
  assert.deepEqual(offenders, []);

  // An audit that cannot fail is not an audit.
  assert.deepEqual(
    printedWords("inkWord(sheet, 'DAINESE', [0, 0], 8, 2, WHITE);"),
    ["'DAINESE'"],
  );
  assert.deepEqual(printedWords('wordStrokes(BRAND, size.letterHeight)'), ['BRAND']);
  // And it must not mistake the ruler for the press.
  assert.deepEqual(printedWords("inkWordLength('VARGAS', cap)"), []);
});
