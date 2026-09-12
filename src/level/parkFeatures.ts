/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { MaterialId } from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { climbAt, lateralProfile, type SegmentBlock, type SegmentSpec } from './segments.ts';

/**
 * Switchback Park's technical features, as blocks measured against a corridor.
 *
 * §36 asks for a hillside lap whose decks, steps, staircases and lips are
 * *exact*: a feature's window is the speed at its lip and the height of its
 * face, and §36.4 will not accept a measured-safe interval for an obstacle
 * whose real dimensions nobody wrote down. This module is where those
 * dimensions are computed, once, so that the venue file authors a shape and the
 * bench measures a number rather than each of them doing arithmetic.
 *
 * **A level top over a descending corridor is the drop.** Every feature here is
 * a `SegmentBlock`, and a block's top face is level along its whole length
 * while the corridor beneath it keeps falling — so a deck that is flush where
 * it starts stands `length * gradient` proud where it ends, and the rider rides
 * off a genuine face without anything authoring one. That is the only kind of
 * face the controller will launch from: `EucController` puts the wheel in the
 * air when the sampled fall under the contact patch exceeds what the slope it
 * is already on predicted, by `TERRAIN.dropLaunchThreshold` (0.05 m). A smooth
 * fold — however steep, however convex it is drawn — predicts its own fall and
 * never throws anybody (§36.2 item 3). Lips and deck ends are the launch
 * primitive, and the reports below name the two heights that decide it: the
 * kerb the wheel has to mount to get on (`stepUpAtStart`, against the derived
 * ceiling of `TERRAIN.stepUpPedalFactor * WHEEL.pedalHeight`, 0.216 m) and the
 * face it leaves from (`dropAtLip`, `exitDrop`).
 *
 * **Every height here is computed with `segments.ts`'s own functions, and that
 * is not a stylistic preference.** A `SegmentBlock.height` means "top face
 * above the corridor surface at the block's centre", and the only thing that
 * resolves that into world space is `collidersOf`, which reads
 * `surfaceHeightAt(entry, spec, s, t)` — `entry.position.y + climbAt + lateralProfile`.
 * A builder that re-derived the corridor's surface from its own idea of a
 * gradient would agree with that on a straight flat road and disagree on every
 * eased climb, every crown and every berm in the park, by centimetres nobody
 * could see until a rider caught a pedal on a deck that was supposed to be
 * flush. So the expression here is `climbAt + lateralProfile` exactly, minus the
 * socket's own `y`, which makes `corridorHeightAt` and `surfaceHeightAt` the
 * same function measured from two different zeros — and `parkFeatures.test.ts`
 * proves it through `collidersOf` rather than trusting the claim.
 *
 * The recipes are the slice's, generalised. `sliceLevel.ts`'s alley staircase is
 * three level blocks over a linear ramp, each one half a step proud of the ramp
 * beneath it; its kicker is a level lip block at the crest of a climb. Both are
 * here as builders with their heights reported rather than as numbers copied
 * into a second venue, because §36.2 item 2 is the record of what copying a
 * height instead of measuring one costs.
 *
 * Plain data only, and nothing here may import three.js (invariant 1) or reach
 * into `app/`, `ui/`, `render/`, `platform/`, `audio/` or `diagnostics/`
 * (invariant 5).
 */

/**
 * The fields of a corridor that decide its surface height.
 *
 * A `SegmentSpec` satisfies this structurally, which is the intended way to
 * call every builder below: hand it the spec the venue is already authoring and
 * the two cannot drift.
 *
 * **`halfWidth` is optional and is required in practice by any corridor with a
 * cross section.** `lateralProfile` is quadratic in `|t| / halfWidth` and
 * linear in the clamped `t`, so a crowned or banked corridor without its own
 * half-width would read as *flat* here and as crowned in `collidersOf` — the
 * one failure this module exists to make impossible. Rather than answer
 * silently wrong, `profileSpec` throws when a crown or a cross slope arrives
 * without the width it is measured against. A flat-sectioned corridor never
 * needs it: `lateralProfile` returns zero before it looks.
 */
export type CorridorProfile =
  Pick<SegmentSpec, 'length' | 'climb' | 'linearClimb' | 'crown' | 'crossSlope'>
  & Partial<Pick<SegmentSpec, 'halfWidth'>>;

/** One deck: a level top standing over the corridor's own fall. */
export interface DeckSpec {
  /** `s` where the deck begins — its uphill end. */
  from: number;
  /** Along `s`. `from + length` may not pass the corridor's end. */
  length: number;
  /** Lateral centre. Positive is the rider's LEFT, as everywhere else. */
  t: number;
  halfLateral: number;
  /** Top face above the corridor surface at `(from, t)`. Zero is flush. */
  lift: number;
  surface: SurfaceId;
  appearance?: MaterialId;
  /** Passed through to the block. Omitted, the block's own default applies. */
  depth?: number;
}

/**
 * What a deck is, measured.
 *
 * `top` is relative to the entry socket's `y`, exactly like `corridorHeightAt`,
 * so `entry.position.y + top` is where the collider's top face lands.
 */
export interface DeckReport {
  /** Exactly one block. */
  blocks: SegmentBlock[];
  /** Top face, relative to the entry socket's `y`. */
  top: number;
  /** Top minus the corridor at the deck's uphill end: the face to mount. */
  entryFace: number;
  /** Top minus the corridor at the deck's downhill end: the face to leave. */
  exitDrop: number;
}

/** A rhythm of decks, each one `stepDown` below the last. */
export interface SteppedDecksSpec {
  from: number;
  count: number;
  deckLength: number;
  /** Corridor showing between one deck and the next. Zero abuts them. */
  gap: number;
  /** Top-to-top fall from each deck to the next. */
  stepDown: number;
  t: number;
  halfLateral: number;
  /** Top face above the corridor at `(from, t)` for the FIRST deck. */
  lift: number;
  surface: SurfaceId;
  appearance?: MaterialId;
  depth?: number;
}

export interface SteppedDecksReport {
  blocks: SegmentBlock[];
  /** Per deck, in order. Deck k's top is deck 0's top minus `k * stepDown`. */
  decks: DeckReport[];
  /**
   * `count - 1` entries: deck k's top minus the corridor at the centre of the
   * gap after it — how far a rider who comes up short falls to the ground
   * between two decks, which is the catch the rhythm has to survive.
   */
  gapCatchDrops: number[];
  /**
   * `count` entries: the deck-to-deck edges, then the last deck's `exitDrop`.
   *
   * A deck-to-deck edge is `stepDown` and nothing else — both tops are level
   * and both are derived from the same first top, so the corridor beneath does
   * not enter it. Only the last edge lands on the corridor, and only that one
   * has to be measured.
   */
  drops: number[];
}

/** A down staircase: level treads over a falling corridor. */
export interface StairsSpec {
  from: number;
  steps: number;
  /** Along `s`, per tread. */
  tread: number;
  /** Tread-to-tread fall. */
  rise: number;
  t: number;
  halfLateral: number;
  surface: SurfaceId;
  appearance?: MaterialId;
  depth?: number;
}

export interface StairsReport {
  /** One block per tread, in order. */
  blocks: SegmentBlock[];
  /** Tread k's top, relative to the entry socket's `y`. */
  treadTops: number[];
  /** The block `height` written for each tread. All are >= 0 or this threw. */
  treadHeights: number[];
  /** The last tread's top minus the corridor where the stairs end. */
  exitDrop: number;
}

/** A lip: a level top through a crest, which is what makes the crest launch. */
export interface LipSpec {
  /** The crest point along `s`. The top is measured against the corridor here. */
  at: number;
  /** The level top starts this far before `at`. */
  lead: number;
  /** And continues this far past it. Must be positive: the reach is the face. */
  reach: number;
  /** Top above the corridor surface at `(at, t)`. May be zero. */
  height: number;
  t: number;
  halfLateral: number;
  surface: SurfaceId;
  appearance?: MaterialId;
  depth?: number;
}

export interface LipReport {
  /** One block spanning `[at - lead, at + reach]`. */
  blocks: SegmentBlock[];
  top: number;
  /**
   * Top minus the corridor at `at - lead`: the kerb the wheel mounts to get on.
   *
   * Reported, never enforced. Whether it is rideable is a question about the
   * *wheel* — `TERRAIN.stepUpPedalFactor * WHEEL.pedalHeight`, 0.216 m at the
   * shipped pedal height — and about the approach, and both belong to the
   * feature's own measurement record rather than to a data builder.
   */
  stepUpAtStart: number;
  /**
   * Top minus the corridor at `at + reach`: the face that guarantees the
   * launch once it is at or above `TERRAIN.dropLaunchThreshold`.
   */
  dropAtLip: number;
}

/** Where a block's placement lands, without the lift that decides its top. */
interface DeckPlacement {
  from: number;
  length: number;
  t: number;
  halfLateral: number;
  surface: SurfaceId;
  appearance?: MaterialId;
  depth?: number;
}

function requireFinite(what: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${what} must be a finite number, got ${value}`);
}

function requirePositive(what: string, value: number): void {
  requireFinite(what, value);
  if (value <= 0) throw new Error(`${what} must be greater than zero, got ${value}`);
}

function requireNonNegative(what: string, value: number): void {
  requireFinite(what, value);
  if (value < 0) throw new Error(`${what} must not be negative, got ${value}`);
}

function requireCount(what: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${what} must be a whole number of at least 1, got ${value}`);
  }
}

/** The two optional pass-throughs, checked once wherever a builder takes them. */
function requireDressing(what: string, depth: number | undefined): void {
  if (depth !== undefined) requireNonNegative(`${what} depth`, depth);
}

/**
 * A feature's footprint must lie on the corridor that measures it.
 *
 * A deck may end *exactly* at the exit socket, which is the ordinary case for a
 * feature that hands over to the next beat. It may not pass it: `climbAt` and
 * `lateralProfile` clamp, so a block beyond the end would be placed against the
 * corridor's last cross section and would read as flush while standing in mid
 * air over whatever segment actually owns that ground.
 */
function requireSpan(what: string, profile: CorridorProfile, from: number, to: number): void {
  requireFinite(`${what} start s`, from);
  requireFinite(`${what} end s`, to);
  if (from < 0) {
    throw new Error(`${what} starts at s=${from}, before the corridor's entry socket at s=0`);
  }
  if (to > profile.length) {
    throw new Error(
      `${what} ends at s=${to}, past the corridor's length ${profile.length}`
      + ` — heights there would be extrapolated from a cross section that has already ended`,
    );
  }
}

/**
 * The corridor, as the spec `climbAt` and `lateralProfile` expect.
 *
 * Neither function reads an id or a surface; both are filled with something
 * inert so this stays a plain structural adapter rather than a second elevation
 * model. The one field that matters and is not in the `Pick` is `halfWidth`,
 * which only a cross section uses — see `CorridorProfile`.
 */
function profileSpec(profile: CorridorProfile): SegmentSpec {
  requirePositive('corridor length', profile.length);
  if (profile.climb !== undefined) requireFinite('corridor climb', profile.climb);

  const crown = profile.crown ?? 0;
  const crossSlope = profile.crossSlope ?? 0;
  const halfWidth = profile.halfWidth ?? 0;
  if ((crown !== 0 || crossSlope !== 0) && !(halfWidth > 0)) {
    throw new Error(
      `a corridor with crown ${crown} or crossSlope ${crossSlope} must carry its halfWidth`
      + ` (got ${profile.halfWidth}): the cross section is measured in |t| / halfWidth, so without`
      + ` it every height here would read as flat while collidersOf reads the real crown`,
    );
  }

  return {
    id: 'corridor-profile',
    length: profile.length,
    climb: profile.climb,
    linearClimb: profile.linearClimb,
    crown: profile.crown,
    crossSlope: profile.crossSlope,
    halfWidth,
    surface: 'pavement',
  };
}

/** `surfaceHeightAt` minus the entry socket's own `y`, with `s` clamped. */
function heightOn(spec: SegmentSpec, s: number, t: number): number {
  const clamped = Math.min(spec.length, Math.max(0, s));
  return climbAt(spec, clamped) + lateralProfile(spec, clamped, t);
}

/**
 * Corridor surface height at `(s, t)`, relative to the entry socket's `y`.
 *
 * `climbAt + lateralProfile` — which is `surfaceHeightAt` without the socket —
 * so `entry.position.y + corridorHeightAt(spec, s, t)` is the ground the
 * renderer draws and the sampler rides, to the bit. `s` is clamped into
 * `[0, length]` exactly as those two clamp it.
 */
export function corridorHeightAt(profile: CorridorProfile, s: number, t: number): number {
  requireFinite('corridorHeightAt s', s);
  requireFinite('corridorHeightAt t', t);
  return heightOn(profileSpec(profile), s, t);
}

/** One deck, given the absolute top its caller has already decided. */
function deckAtTop(spec: SegmentSpec, placement: DeckPlacement, top: number): DeckReport {
  const centre = placement.from + placement.length / 2;
  const block: SegmentBlock = {
    s: centre,
    t: placement.t,
    halfAlong: placement.length / 2,
    halfLateral: placement.halfLateral,
    // The block's own contract: its top face above the corridor AT ITS CENTRE,
    // which on a falling corridor is neither its entry face nor its exit drop.
    height: top - heightOn(spec, centre, placement.t),
    surface: placement.surface,
    ...(placement.appearance === undefined ? {} : { appearance: placement.appearance }),
    ...(placement.depth === undefined ? {} : { depth: placement.depth }),
  };

  return {
    blocks: [block],
    top,
    entryFace: top - heightOn(spec, placement.from, placement.t),
    exitDrop: top - heightOn(spec, placement.from + placement.length, placement.t),
  };
}

/**
 * One deck: a level top from `from` to `from + length`.
 *
 * `lift` is measured at the deck's **uphill** end, so `lift: 0` is a deck the
 * rider rolls onto without a step and rides off the end of. What they ride off
 * is `exitDrop`, and on a descending corridor that is the corridor's own fall
 * over the deck's length — the drop is authored by choosing where the deck ends
 * rather than by choosing a height.
 *
 * A deck whose corridor *climbs* reports a negative `exitDrop` and may write a
 * negative block height, which is a buried deck rather than a jump. That is not
 * refused here: the report says so plainly, and where a feature is allowed to
 * bury itself is the venue's decision, not this builder's.
 */
export function deck(profile: CorridorProfile, spec: DeckSpec): DeckReport {
  const corridor = profileSpec(profile);
  requirePositive('deck length', spec.length);
  requirePositive('deck halfLateral', spec.halfLateral);
  requireFinite('deck t', spec.t);
  requireFinite('deck lift', spec.lift);
  requireDressing('deck', spec.depth);
  requireSpan('deck', profile, spec.from, spec.from + spec.length);

  return deckAtTop(corridor, spec, heightOn(corridor, spec.from, spec.t) + spec.lift);
}

/**
 * A rhythm of decks, each `stepDown` below the last.
 *
 * §36.4's three/four-drop rhythm, whose whole requirement is "distinct clean
 * touchdowns with enough time to recover, aim and launch again. Not one long
 * fall spanning all the decks" — so the tops are pinned to each other rather
 * than to the corridor. Deck k's top is deck 0's top minus `k * stepDown`
 * whatever the ground under it does, which is what makes every edge in the
 * rhythm the same drop; the corridor's own fall is then absorbed by the decks'
 * block heights, and shows up only where the rider leaves the last one.
 *
 * `gap` is corridor showing between decks. At zero the blocks abut exactly —
 * deck k ends at the same `s` deck k+1 starts — and the catch drop after a deck
 * is that deck's own exit drop.
 */
export function steppedDecks(profile: CorridorProfile, spec: SteppedDecksSpec): SteppedDecksReport {
  const corridor = profileSpec(profile);
  requireCount('steppedDecks count', spec.count);
  requirePositive('steppedDecks deckLength', spec.deckLength);
  requireNonNegative('steppedDecks gap', spec.gap);
  requireFinite('steppedDecks stepDown', spec.stepDown);
  requirePositive('steppedDecks halfLateral', spec.halfLateral);
  requireFinite('steppedDecks t', spec.t);
  requireFinite('steppedDecks lift', spec.lift);
  requireDressing('steppedDecks', spec.depth);

  const pitch = spec.deckLength + spec.gap;
  const end = spec.from + spec.count * spec.deckLength + (spec.count - 1) * spec.gap;
  requireSpan('steppedDecks', profile, spec.from, end);

  const firstTop = heightOn(corridor, spec.from, spec.t) + spec.lift;
  const blocks: SegmentBlock[] = [];
  const decks: DeckReport[] = [];
  const gapCatchDrops: number[] = [];
  const drops: number[] = [];

  for (let index = 0; index < spec.count; index += 1) {
    const from = spec.from + index * pitch;
    const report = deckAtTop(
      corridor,
      {
        from,
        length: spec.deckLength,
        t: spec.t,
        halfLateral: spec.halfLateral,
        surface: spec.surface,
        ...(spec.appearance === undefined ? {} : { appearance: spec.appearance }),
        ...(spec.depth === undefined ? {} : { depth: spec.depth }),
      },
      firstTop - index * spec.stepDown,
    );

    decks.push(report);
    blocks.push(...report.blocks);

    if (index < spec.count - 1) {
      drops.push(spec.stepDown);
      const gapCentre = from + spec.deckLength + spec.gap / 2;
      gapCatchDrops.push(report.top - heightOn(corridor, gapCentre, spec.t));
    } else {
      drops.push(report.exitDrop);
    }
  }

  return { blocks, decks, gapCatchDrops, drops };
}

/**
 * A down staircase: level treads over a corridor that falls beneath them.
 *
 * **The slice's alley recipe, and it is the only honest way to build stairs
 * here.** `sliceLevel.ts`'s alley drops 0.90 m linearly over nine metres with
 * three level blocks on it, and every one of those blocks is written half a
 * step proud of the ramp — because the ramp has fallen `(k + 0.5) * rise` by
 * the block's centre while the block's top has to sit `k * rise` below the
 * floor the stairs started from. A staircase cut into the heightfield instead
 * would sample as a ramp and the rider would simply roll down it (§36.4:
 * "Use solid treads, not a heightfield texture that samples as a ramp").
 *
 * Tread 0 is flush at `from`, so the rider arrives at the top of the stairs
 * without a step and takes `steps` equal drops of `rise` — the last of them off
 * the final tread onto the corridor, which is `exitDrop`.
 *
 * Throws if any tread's block height would be negative. That is the corridor
 * being too shallow for the staircase standing on it: a tread cannot be sunk
 * into the ground, and a `steps * rise` descent needs the corridor to have
 * fallen at least as far by the time the treads have. An eased corridor is the
 * interesting case — it is flat at both sockets, so its ends fall slowest and
 * the first tread is the one that goes negative first.
 */
export function stairs(profile: CorridorProfile, spec: StairsSpec): StairsReport {
  const corridor = profileSpec(profile);
  requireCount('stairs steps', spec.steps);
  requirePositive('stairs tread', spec.tread);
  requireNonNegative('stairs rise', spec.rise);
  requirePositive('stairs halfLateral', spec.halfLateral);
  requireFinite('stairs t', spec.t);
  requireDressing('stairs', spec.depth);
  requireSpan('stairs', profile, spec.from, spec.from + spec.steps * spec.tread);

  const datum = heightOn(corridor, spec.from, spec.t);
  const blocks: SegmentBlock[] = [];
  const treadTops: number[] = [];
  const treadHeights: number[] = [];

  for (let index = 0; index < spec.steps; index += 1) {
    const top = datum - index * spec.rise;
    const centre = spec.from + (index + 0.5) * spec.tread;
    const height = top - heightOn(corridor, centre, spec.t);

    if (height < 0) {
      throw new Error(
        `stairs tread ${index} would sit ${-height} m BELOW the corridor at s=${centre}:`
        + ` its top is ${top} and the corridor there is ${heightOn(corridor, centre, spec.t)}.`
        + ` The corridor must fall at least as fast as the stairs — ${spec.steps} x ${spec.rise} m`
        + ` over ${spec.steps * spec.tread} m — or the treads are buried, not ridden`,
      );
    }

    treadTops.push(top);
    treadHeights.push(height);
    blocks.push({
      s: centre,
      t: spec.t,
      halfAlong: spec.tread / 2,
      halfLateral: spec.halfLateral,
      height,
      surface: spec.surface,
      ...(spec.appearance === undefined ? {} : { appearance: spec.appearance }),
      ...(spec.depth === undefined ? {} : { depth: spec.depth }),
    });
  }

  return {
    blocks,
    treadTops,
    treadHeights,
    exitDrop: treadTops[spec.steps - 1]
      - heightOn(corridor, spec.from + spec.steps * spec.tread, spec.t),
  };
}

/**
 * A lip through a crest: one level block from `at - lead` to `at + reach`.
 *
 * The slice's kicker, generalised. A mound is heightfield, so a wheel climbs
 * it; the lip is a block, so a wheel *leaves* it — and it has to be, because a
 * gradient cannot launch the controller at any steepness (§36.2 item 3). The
 * `reach` is the whole mechanism: it holds the top level for a stretch past the
 * crest while the ground beneath keeps turning over, and the difference the two
 * have opened up by the end of it is `dropAtLip`. A `reach` of zero would put
 * the block's end exactly where the corridor is, which is a lip with no face,
 * so it is refused rather than reported.
 *
 * `lead` is the run-up on the level: it costs the rider a step up onto the
 * block (`stepUpAtStart`), which is why it is reported. Zero `lead` is legal
 * and means the top starts exactly at the crest.
 */
export function lip(profile: CorridorProfile, spec: LipSpec): LipReport {
  const corridor = profileSpec(profile);
  requireFinite('lip at', spec.at);
  requireNonNegative('lip lead', spec.lead);
  requirePositive('lip reach', spec.reach);
  requireFinite('lip height', spec.height);
  requirePositive('lip halfLateral', spec.halfLateral);
  requireFinite('lip t', spec.t);
  requireDressing('lip', spec.depth);

  const start = spec.at - spec.lead;
  const end = spec.at + spec.reach;
  requireSpan('lip', profile, start, end);

  const top = heightOn(corridor, spec.at, spec.t) + spec.height;
  const centre = (start + end) / 2;

  return {
    blocks: [{
      s: centre,
      t: spec.t,
      halfAlong: (spec.lead + spec.reach) / 2,
      halfLateral: spec.halfLateral,
      height: top - heightOn(corridor, centre, spec.t),
      surface: spec.surface,
      ...(spec.appearance === undefined ? {} : { appearance: spec.appearance }),
      ...(spec.depth === undefined ? {} : { depth: spec.depth }),
    }],
    top,
    stepUpAtStart: top - heightOn(corridor, start, spec.t),
    dropAtLip: top - heightOn(corridor, end, spec.t),
  };
}
