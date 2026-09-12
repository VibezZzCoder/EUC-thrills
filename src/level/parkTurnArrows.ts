/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Bent arrows painted on the trail ahead of a hairpin.
 *
 * The owner's first Switchback rides, 2026-09-12: off the kicker's run-out
 * the clearing hairpin "is a bit hard to notice — you have to turn right".
 * A hairpin's own signage (chevrons, bypass taper, a word) is about the
 * *feature* on the bend, not about the bend; the outer rail stands 12 m off
 * the centreline and reads as scenery from a chase camera looking down a
 * 14–18 m corridor. What a rider needs is the road's own instruction — the
 * lane arrow every driver has read a thousand times: a shaft along the trail
 * that bends toward the turn, with a head on the bend.
 *
 * **One shape, two runs.** The shaft is a three-point polyline (along, then a
 * 45° diagonal toward the inside of the bend) and the head is a chevron
 * pointing along that diagonal. Two runs, not one, for the reason
 * `parkSignage.ts`'s chevrons and bypass taper are separate runs: every run is
 * one polyline of one width, and a head that doubled back along the shaft
 * would paint over its own shaft. The proportions are the sign kit's own
 * (`SIGNS.chevronLength` / `chevronHalfSpan`) so a head here and a head on a
 * technical-line chevron are the same mark.
 *
 * **The bend is drawn at 45° in the segment frame on purpose.** The chase
 * camera looks along `s`, which foreshortens the along-trail axis roughly
 * three to one at the distance a sign is read from, so a 45° paint diagonal
 * reads as a hard turn on screen — the point — while the arrow still spends
 * most of its length along the trail, where the paint is cheapest to clip
 * around and never leaves the corridor.
 *
 * Dark ink sits on a wood surface band on the bypass half. White arrows lost
 * contrast on sunlit wood in the portrait chase view. Dirt is not paintable;
 * the pad keeps the complete arrow through surface clipping.
 */
import { markingWidth, SIGNS } from '../data/markings.ts';
import type { SegmentMarking, SurfaceBand } from './segments.ts';

/** Which way the trail bends past the arrow. Positive `t` is the rider's left. */
export type TurnDirection = 'left' | 'right';

export interface TurnArrow {
  /** The segment the arrow is painted on — the approach, never the bend itself. */
  readonly segment: string;
  /** Where the shaft starts along the approach, metres from its entry. */
  readonly s: number;
  /** Lateral offset of the shaft, metres; positive is the rider's left. */
  readonly t: number;
  readonly turn: TurnDirection;
  /**
   * The bend's across-trail reach, metres; `TURN_ARROW.bendAcross` by default.
   * A narrower corridor (the 7 m shelf straight) takes a tighter hook so the
   * arrow and its pad still fit on the bypass half.
   */
  readonly across?: number;
}

export const TURN_ARROW = Object.freeze({
  /** The straight shaft before the bend, metres along the trail. */
  run: 4.0,
  /** The bend's along-trail reach, metres. */
  bendAlong: 2.6,
  /** The bend's across-trail reach, metres — equal to `bendAlong`: 45°. */
  bendAcross: 2.6,
  /** The head, in the sign kit's own proportions. */
  headLength: SIGNS.chevronLength,
  headHalfSpan: SIGNS.chevronHalfSpan,
});

/** The arrow's whole along-trail extent, from shaft start to head tip. */
export const TURN_ARROW_ALONG = TURN_ARROW.run + TURN_ARROW.bendAlong;

/** The arrow's across-trail reach from the shaft's `t` toward the turn, plus a head wing. */
export function turnArrowAcross(arrow: TurnArrow): number {
  return (arrow.across ?? TURN_ARROW.bendAcross) + TURN_ARROW.headHalfSpan;
}

function sideOf(turn: TurnDirection): 1 | -1 {
  return turn === 'left' ? 1 : -1;
}

/** The two runs one arrow paints: the bent shaft, then the head on the bend. */
export function turnArrowMarkings(arrow: TurnArrow): SegmentMarking[] {
  const side = sideOf(arrow.turn);
  const elbowS = arrow.s + TURN_ARROW.run;
  const tipS = elbowS + TURN_ARROW.bendAlong;
  const bendAcross = arrow.across ?? TURN_ARROW.bendAcross;
  const tipT = arrow.t + side * bendAcross;
  // Unit vector along the diagonal, and its perpendicular, in the (s, t) frame.
  const diagonal = Math.hypot(TURN_ARROW.bendAlong, bendAcross);
  const uS = TURN_ARROW.bendAlong / diagonal;
  const uT = (side * bendAcross) / diagonal;
  const nS = -uT;
  const nT = uS;
  const baseS = tipS - uS * TURN_ARROW.headLength;
  const baseT = tipT - uT * TURN_ARROW.headLength;
  return [
    {
      path: [
        { s: arrow.s, t: arrow.t },
        { s: elbowS, t: arrow.t },
        { s: tipS, t: tipT },
      ],
      role: 'glyph',
      paint: 'ink',
    },
    {
      path: [
        { s: baseS + nS * TURN_ARROW.headHalfSpan, t: baseT + nT * TURN_ARROW.headHalfSpan },
        { s: tipS, t: tipT },
        { s: baseS - nS * TURN_ARROW.headHalfSpan, t: baseT - nT * TURN_ARROW.headHalfSpan },
      ],
      role: 'glyph',
      paint: 'ink',
    },
  ];
}

/** Every arrow's runs, grouped by the segment that paints them. */
export function turnArrowsBySegment(
  arrows: readonly TurnArrow[],
): ReadonlyMap<string, readonly SegmentMarking[]> {
  const out = new Map<string, SegmentMarking[]>();
  for (const arrow of arrows) {
    const runs = out.get(arrow.segment) ?? [];
    runs.push(...turnArrowMarkings(arrow));
    out.set(arrow.segment, runs);
  }
  return out;
}

/**
 * The boardwalk pad under one arrow.
 *
 * Dirt is not in `PAINTABLE_SURFACES` — that is the rule the whole sign kit
 * is built around, and why every word and chevron on the lap stands on a wood
 * patch of its own. An arrow gets the same patch, `margin` past its paint on
 * every side (the caller passes the park's own `SWITCHBACK_SIGN_PAD_MARGIN`,
 * which is what a 1.5 m heightfield cell needs to keep a stroke's whole width
 * on planking). The patch never crosses the centreline: the arrows are laid on
 * the bypass half, and a pad that reached the technical half would read as one
 * more deck.
 */
export function turnArrowPad(arrow: TurnArrow, margin: number): SurfaceBand {
  const side = arrow.turn === 'left' ? 1 : -1;
  const far = arrow.t + side * turnArrowAcross(arrow);
  const near = arrow.t - side * TURN_ARROW.headHalfSpan;
  const paintHalf = markingWidth('glyph') / 2;
  const from = Math.min(near, far) - paintHalf - margin;
  const to = Math.max(near, far) + paintHalf + margin;
  return {
    from,
    to,
    surface: 'wood',
    fromS: arrow.s - paintHalf - margin,
    toS: arrow.s + TURN_ARROW_ALONG + paintHalf + margin,
  };
}

/** Every arrow's pad, grouped by segment, in the arrows' own order. */
export function turnArrowPadsBySegment(
  arrows: readonly TurnArrow[],
  margin: number,
): ReadonlyMap<string, readonly SurfaceBand[]> {
  const out = new Map<string, SurfaceBand[]>();
  for (const arrow of arrows) {
    const pads = out.get(arrow.segment) ?? [];
    pads.push(turnArrowPad(arrow, margin));
    out.set(arrow.segment, pads);
  }
  return out;
}
