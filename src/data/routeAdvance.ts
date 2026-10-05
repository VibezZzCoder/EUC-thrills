/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';

/** Source-ground branch instructions, metres. Equal type size on both rows.
 * No surface pad, border, coloured panel, material or screen-facing element. */
export const ROUTE_ADVANCE = deepFreeze({
  letterAcross: 0.70,
  letterAlong: 2.30,
  tracking: 0.30,
  /** The band each word row reserves past its cap for its own arrow
   * (0.25 + 0.75 m). It is the envelope every cue was placed with, so the
   * placements stay where they were; the arrow is drawn inside it. */
  wordArrowGap: 0.25,
  arrowAlong: 0.75,
  /** A stacked row's arrow lies ACROSS the trail, centred between its word's
   * cap and the next row (VIS-3-R2, 2026-10-04). The band is 1.35 m between
   * two rows of letters, so a diagonal arrow sat on both words ('×', '+');
   * the across axis is also the one a low chase camera does not foreshorten.
   * Shaft span, then the head's barb length and its half-angle in radians:
   * 0.5 is the widest head that still keeps `arrowClear` from both rows
   * (0.26 m measured), and the head's spread along the trail is all the
   * chase camera has to tell a head from a tail. */
  arrowAcross: 1.6,
  arrowBarb: 0.45,
  arrowSpread: 0.5,
  /** Bare ground every arrow keeps from every letter, beyond both strokes. */
  arrowClear: 0.25,
  rowGap: 0.35,
  /** The kicker has two arrows beside their own word rows, in a right gutter.
   * The full word size is unchanged; the gutter spends width only at -t.
   * `inlineArrowAcross` is the reserved gutter (its bounds); the drawn arrow
   * runs `inlineArrowAlong` up the row inside it, `arrowClear` off the word. */
  inlineArrowAcross: 0.55,
  inlineArrowAlong: 0.75,
  inlineArrowBarb: 0.45,
  inlineArrowSpread: 0.30,
  /** The original arrow footprints, kept only as the placement reservation
   * (`advanceCueReservation`): every cue stays where it was first searched. */
  reservation: { across: 0.85, barb: 0.62, inlineAcross: 0.55, inlineBarb: 0.40, spread: 0.55 },
  socketMargin: 1.0,
  paintGap: 0.12,
  searchStep: 0.25,
  readStep: 0.25,
  /** Author complete-word bearing windows inside the portrait cone instead of
   * exactly on its rim. The native R16 skinny approach cropped at x=-1.0216
   * while following normal inputs; the chase camera lags a turning rider.
   * This 2-degree inset reserves space for that response, rather than changing
   * the camera, shrinking words or crediting off-screen reading. Actual chase
   * pixels at the published window still own acceptance. Radians. */
  portraitBearingInset: Math.PI / 90,
  /** This bounds added paint only; it grants no additional frame budget. */
  maxCues: 9,
  maxRuns: 207,
  maxTriangles: 4_000,
});
