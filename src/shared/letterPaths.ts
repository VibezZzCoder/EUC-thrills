/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The alphabet this project owns, as stroke paths in a unit letter box.
 *
 * **This file imports nothing**, exactly as `shared/markingRibbon.ts` imports
 * nothing, and that is the whole reason it exists here rather than where it
 * was born. The table lived in `render/inkKit.ts` while a texture sheet was the
 * only thing that printed a word; M36 gives the park signage painted on the
 * *ground*, which is authored in `level/`, and `level/` may not import
 * `render/` (AGENTS.md invariant 5, enforced by `src/architecture.test.ts`).
 * Copying the letters into `level/` would have given the project two answers to
 * what its lettering looks like, which `inkKit.ts` argued against when C, I, U
 * and T arrived. So the letters moved down a layer instead and `inkKit.ts`
 * re-exports them: one alphabet, three media.
 *
 * `x` runs 0 (left) to 1 (right), `y` runs 0 (cap height) to 1 (baseline). One
 * entry per letter, each a list of strokes; a curve is a polyline with enough
 * points that its corners disappear at the size it is drawn.
 *
 * Only the letters the project actually prints are here. An alphabet with
 * unused glyphs in it is an invitation to print something nobody checked
 * against `NOTICE.md` — the sheet may carry **VARGAS** and her own devil, and
 * no manufacturer's wordmark ever (`docs/PLANS.md` §23.9d). **B, E and L
 * arrived at M23 Phase B1 for BELVAR**, **C, I, U and T when the owner's ride
 * found the gantry announcing half the venue's name**, and **D, N, O, P, W and
 * the digits 0, 1 and 8 at M36 Phase 2**, which is the first time the project
 * printed a word on the ground rather than on a garment: `180` before the spin
 * shelf, `DOWN` before the staircase, and the six other park words
 * `data/markings.ts` approves.
 *
 * **The guard that replaced "the alphabet is too small to spell a brand".**
 * Nine glyphs spelled nothing in the reference photographs and thirteen spell
 * ARAI, a helmet maker `NOTICE.md` names; twenty-one spell rather more. Being
 * unable to *spell* a brand was only ever a proxy for being unable to *print*
 * one, so the rule moved to the only place that still holds it:
 * `render/inkKit.test.ts` scans every non-test source under `src/` for a call
 * that prints a word and fails unless the word is one this project owns. This
 * file is skipped by that scan **by filename**, because the definition below
 * matches the scan's own regex; adding a third file that defines a printer
 * means adding it to the skip list and is a decision, not a formality.
 */

/** A point in a letter box: `[x, y]`, both 0..1. */
export type LetterPoint = readonly [number, number];

const LETTERS: Readonly<Record<string, readonly (readonly LetterPoint[])[]>> = {
  V: [[[0.02, 0], [0.5, 1], [0.98, 0]]],
  B: [
    [[0.06, 0], [0.06, 1]],
    [[0.06, 0], [0.62, 0], [0.88, 0.13], [0.88, 0.32], [0.62, 0.46], [0.06, 0.46]],
    [[0.06, 0.46], [0.68, 0.46], [0.94, 0.62], [0.94, 0.84], [0.68, 1], [0.06, 1]],
  ],
  E: [
    [[0.08, 0.02], [0.08, 0.98]],
    [[0.08, 0.02], [0.92, 0.02]],
    [[0.08, 0.5], [0.78, 0.5]],
    [[0.08, 0.98], [0.92, 0.98]],
  ],
  L: [[[0.10, 0], [0.10, 0.98], [0.90, 0.98]]],
  A: [[[0.02, 1], [0.5, 0], [0.98, 1]], [[0.2, 0.62], [0.8, 0.62]]],
  R: [
    [[0.06, 0], [0.06, 1]],
    [[0.06, 0], [0.66, 0], [0.9, 0.14], [0.9, 0.34], [0.66, 0.48], [0.06, 0.48]],
    [[0.5, 0.48], [0.96, 1]],
  ],
  G: [[
    [0.98, 0.2], [0.82, 0.04], [0.5, 0], [0.18, 0.08], [0.04, 0.36], [0.04, 0.64],
    [0.18, 0.92], [0.5, 1], [0.82, 0.96], [0.96, 0.8], [0.96, 0.56], [0.56, 0.56],
  ]],
  S: [[
    [0.94, 0.16], [0.74, 0.02], [0.4, 0.02], [0.14, 0.14], [0.12, 0.36], [0.36, 0.46],
    [0.7, 0.54], [0.9, 0.66], [0.86, 0.88], [0.6, 0.98], [0.26, 0.98], [0.06, 0.84],
  ]],
  M: [[[0.02, 1], [0.02, 0], [0.5, 0.62], [0.98, 0], [0.98, 1]]],
  // C shares G's bowl point for point as far as G's spur, because a face whose
  // C and G are drawn twice is a face with two bowls in it. Its two terminals
  // sit at the same x so the aperture is symmetrical.
  C: [[
    [0.98, 0.2], [0.82, 0.04], [0.5, 0], [0.18, 0.08], [0.04, 0.36], [0.04, 0.64],
    [0.18, 0.92], [0.5, 1], [0.82, 0.96], [0.98, 0.8],
  ]],
  // A bare stem, on E's vertical extent. Every advance in this face is the same
  // width, so an I carries wide side bearings; at gantry tracking that reads as
  // the letter-spacing it already has rather than as a gap.
  I: [[[0.5, 0.02], [0.5, 0.98]]],
  U: [[
    [0.06, 0], [0.06, 0.6], [0.16, 0.86], [0.4, 0.98], [0.6, 0.98], [0.84, 0.86],
    [0.94, 0.6], [0.94, 0],
  ]],
  // The arm reaches wider than E's, because it has no stem at its left end to
  // stop the eye and an E-width arm on a T looks clipped.
  T: [[[0.04, 0.02], [0.96, 0.02]], [[0.5, 0.02], [0.5, 0.98]]],

  // -- M36 Phase 2: the park's ground signage -------------------------------
  // Five letters and three digits, every one of them drawn *from* a letter that
  // was already here rather than beside it, for the reason C was drawn from G.

  // B's stem, with one bowl instead of two — so a D is a B that was not
  // interrupted, which is what a D is.
  D: [
    [[0.06, 0], [0.06, 1]],
    [[0.06, 0], [0.58, 0], [0.88, 0.18], [0.94, 0.5], [0.88, 0.82], [0.58, 1], [0.06, 1]],
  ],
  // One stroke, like M, and on M's own stem positions pulled in to E's width:
  // a diagonal that starts at the cap and finishes at the baseline.
  N: [[[0.08, 1], [0.08, 0], [0.92, 1], [0.92, 0]]],
  // C's bowl, closed. The first nine points are C's and therefore G's, and the
  // last three climb the right side back to the start — so the project has one
  // bowl, drawn once, appearing in four letters.
  O: [[
    [0.98, 0.2], [0.82, 0.04], [0.5, 0], [0.18, 0.08], [0.04, 0.36], [0.04, 0.64],
    [0.18, 0.92], [0.5, 1], [0.82, 0.96], [0.96, 0.64], [0.96, 0.36], [0.98, 0.2],
  ]],
  // R without its leg, point for point: the two share a bowl exactly as C and G
  // do, and a P whose bowl were drawn separately would be a second R.
  P: [
    [[0.06, 0], [0.06, 1]],
    [[0.06, 0], [0.66, 0], [0.9, 0.14], [0.9, 0.34], [0.66, 0.48], [0.06, 0.48]],
  ],
  // M mirrored about the middle of its own letter box — every `y` replaced by
  // `1 - y`. A W drawn freehand beside an M is a W from another face.
  W: [[[0.02, 0], [0.02, 1], [0.5, 0.38], [0.98, 1], [0.98, 0]]],

  // The three digits `180` needs. A numeral set that matched the letters'
  // widths would read as OIB at speed, so the two that could be confused are
  // deliberately not the same shape as their letters: the zero is a narrower
  // bowl than the O, and the one carries a flag and a foot the I has not.
  '0': [[
    [0.82, 0.2], [0.71, 0.04], [0.5, 0], [0.29, 0.08], [0.20, 0.36], [0.20, 0.64],
    [0.29, 0.92], [0.5, 1], [0.71, 0.96], [0.80, 0.64], [0.80, 0.36], [0.82, 0.2],
  ]],
  '1': [
    [[0.22, 0.22], [0.52, 0.02], [0.52, 0.98]],
    [[0.22, 0.98], [0.82, 0.98]],
  ],
  // Two closed bowls, the upper one smaller, so an 8 upside down is still an 8
  // to the eye but is never mistaken for a B — which has a stem and these do
  // not.
  '8': [
    [
      [0.5, 0], [0.22, 0.06], [0.14, 0.2], [0.22, 0.38], [0.5, 0.46],
      [0.78, 0.38], [0.86, 0.2], [0.78, 0.06], [0.5, 0],
    ],
    [
      [0.5, 0.46], [0.18, 0.56], [0.08, 0.76], [0.2, 0.94], [0.5, 1],
      [0.8, 0.94], [0.92, 0.76], [0.82, 0.56], [0.5, 0.46],
    ],
  ],
};

/** How wide a letter box is, relative to its height, before tracking. */
export const LETTER_ASPECT = 0.62;

export interface WordMetrics {
  /**
   * Mirror the letter box vertically.
   *
   * Needed because the sheets this prints on run their `y` **up** the body —
   * a texture row maps to a surface's `v`, and `v` grows from a loft's
   * lowest ring. Every glyph above is authored the way letters are drawn,
   * with the cap height at `y = 0`, so a word printed onto one of those
   * sheets without this reads upside down and nothing but a capture says so.
   */
  readonly flip?: boolean;
  readonly tracking?: number;
}

/**
 * A word laid out as polylines, in a local frame: `x` right from zero, `y`
 * down from the cap height.
 *
 * **The one placement rule, so three media cannot disagree about the type.**
 * `render/inkKit.ts` strokes these onto a texture sheet, `render/props.ts`
 * extrudes them into the plates on BelVar's gantry banner, and
 * `level/parkSignage.ts` stretches them along a trail as road paint; a second
 * copy of the advance arithmetic would be a second answer to how wide the
 * wordmark is.
 *
 * Everything scales linearly in `height`, which is what lets a caller lay a
 * word out once at unit height and reuse it at any size.
 *
 * Refuses a letter it does not have rather than skipping it: a wordmark
 * quietly missing its R is exactly the kind of thing a capture would not catch
 * and a rider would. A space is the sole exception and draws nothing.
 */
export function wordStrokes(
  word: string,
  height: number,
  options: WordMetrics = {},
): LetterPoint[][] {
  const tracking = options.tracking ?? 0.16;
  const flip = options.flip === true;
  const boxWidth = height * LETTER_ASPECT;
  const advance = boxWidth * (1 + tracking);
  const out: LetterPoint[][] = [];
  for (let i = 0; i < word.length; i += 1) {
    // A word space is the one character that may legitimately draw nothing, and
    // it is handled here rather than as an empty entry in `LETTERS` because an
    // empty stroke list is indistinguishable from a glyph whose strokes were
    // deleted — and the refusal on the next line is this file's whole safety
    // story. It takes a full advance: a signage word space wants to be wide.
    if (word[i] === ' ') continue;
    const glyph = LETTERS[word[i]!];
    if (glyph === undefined) throw new Error(`inkWord has no path for '${word[i]}'`);
    const left = i * advance;
    for (const stroke of glyph) {
      out.push(stroke.map(([lx, ly]): LetterPoint => [
        left + lx * boxWidth,
        (flip ? 1 - ly : ly) * height,
      ]));
    }
  }
  return out;
}

/** How long a word printed at this height will be, in the same units. */
export function wordLength(word: string, height: number, tracking = 0.16): number {
  const boxWidth = height * LETTER_ASPECT;
  return boxWidth * (word.length - 1) * (1 + tracking) + boxWidth;
}
