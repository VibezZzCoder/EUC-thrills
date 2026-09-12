/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { MARKINGS, PARK_SIGN_WORDS, SIGNS, markingWidth, type ParkSignWord } from '../data/markings.ts';
import { PROP_FOOTPRINTS } from '../data/props.ts';
import { CAMERA, EUC } from '../data/tuning.ts';
import { LETTER_ASPECT, wordLength, wordStrokes } from '../shared/letterPaths.ts';
import { PROP_CORRIDOR_CLEARANCE } from './buildPlan.ts';
import type { SegmentMarking, SegmentProp, SurfaceBand } from './segments.ts';

/**
 * Advance instructions and marked landing zones — M36 Phase 2, §36.4.
 *
 * **A pure authoring helper: plain data in, plain data out.** Nothing here
 * knows what venue it is signing. It is handed a list of features — where each
 * one commits, how fast a rider arrives, which half of the corridor is the
 * technical line and which is the bypass, where the landing is — plus enough of
 * the lap's shape to convert a local `s` into a lap distance, and it returns
 * three merge maps keyed by segment id and a record of every sign it placed.
 * `level/switchbackLevel.ts` merges those maps into its own specs; this file
 * imports it not at all, which is what lets the park's geometry and the park's
 * signage be edited by two people at once.
 *
 * It imports no three.js, emits no render types, and reads no `GameOptions`
 * (AGENTS.md invariants 1 and 6).
 *
 * ## The one rule everything else is arranged around
 *
 * > A sign is placed so that the rider finishes reading it at least
 * > `readSeconds * v + v² / (2a)` before the point where the feature can no
 * > longer be refused.
 *
 * `a` is `EUC.brakeAuthority * sin(EUC.maxLeanPitch)` — the wheel's own
 * full-lean braking, 10.547 m/s², the same product
 * `simulation/topSpeedPreset.test.ts` measures the stopping distance with. It is
 * derived here rather than typed, so a change to the brake moves every sign on
 * the venue rather than silently invalidating them. `readSeconds` is 1.5 and its
 * argument is in `data/markings.ts`: at the kicker's 40 mph the rule produces
 * 42.0 m, and `HAZARD.readMetres` — the sight window the route validator holds
 * every generated world to — is 40 m. A sign the rider cannot stop inside of is
 * decoration; a sign further out than the venue guarantees they can see is
 * nobody's sign at all.
 *
 * **The distance is measured from the *far* edge of the sign's paint**, the
 * last thing read, not from where it starts. A rider who is still reading has
 * not yet begun to decide.
 *
 * ## What a sign is made of, and why the colour is never the instruction
 *
 * `docs/PLANS.md` §36.4 asks that colour reinforce shape and wording and never
 * carry the instruction alone, which is a colour-blindness rule before it is a
 * taste. So the two lines are told apart three times over:
 *
 * - the technical line gets a **stack of three chevrons** pointing along the
 *   trail, at glyph width, in `road` paint;
 * - the bypass gets **one long shallow taper** leaving the middle of the
 *   corridor and crossing to the bypass line, at edge width, in the park's
 *   duller `path` paint, with a barbed head aligned to its own diagonal.
 *
 * Three arrowheads in a column against one diagonal sweep is a difference in
 * *count*, in *direction* and in *weight*; the paint is the fourth difference
 * and the only one a monochrome screenshot loses.
 *
 * A landing is a **box**: two side lines and a far bar in white, and a red
 * `kerb`-paint **threshold** across the near end — the one line the rider is
 * aiming to clear. Red is used only there, and only where the shape (a bar
 * across the box's mouth) already says the same thing.
 *
 * Copy is limited to what can be read in motion: at most two words per sign,
 * from the eight in `PARK_SIGN_WORDS`, and nothing longer than six letters.
 *
 * ## Why the paint needs ground, and why the ground is planking
 *
 * `PAINTABLE_SURFACES` refuses dirt, which is the whole venue, and
 * `data/markings.test.ts` pins that refusal on purpose — widening it would
 * paint every trail in the project. So each sign lays a **boardwalk patch**:
 * a ranged `SurfaceBand` of `wood` under exactly the paint it carries, plus
 * `SIGNS.padMargin` on every side because a surface belongs to a heightfield
 * *cell* and the park's cells are 1.5 m across.
 *
 * Wood rather than pavement because the venue's decks are already wood, and
 * because it is not a trap: `data/surfaces.ts` gives wood 0.86 grip against
 * dirt's 0.80 and 0.45 rolling resistance against dirt's 1.10, so the patch
 * under a sign is *grippier and faster* than the trail it interrupts. The
 * rider's first warning that a feature is coming is a firmer surface, which is
 * the same warning the feature itself will give.
 */

// ---------------------------------------------------------------------------
// The inputs
// ---------------------------------------------------------------------------

/** One corridor of the lap, as far as signage is concerned. */
export interface SignLapSegment {
  readonly id: string;
  /** Centreline length, metres. */
  readonly length: number;
  /** Half the corridor's width, metres. */
  readonly halfWidth: number;
  /** Distance along the lap to this segment's entry socket, metres. */
  readonly entryDistance: number;
  /**
   * Whether a sign may be painted here. True unless the caller says otherwise.
   *
   * A lap has corridors that are not trail: a start straight carrying the line
   * and the grid, a pit apron, an arrival road. A pad is legal on them by
   * arithmetic and wrong by every other measure, and the venue is the only
   * thing that knows which is which.
   */
  readonly pads?: boolean;
  /**
   * How sharply this corridor turns, radians per metre, or zero for a straight.
   *
   * Positive turns toward the rider's **left**, which is the same sign `t`
   * takes, so a corridor with `curvature > 0` bends toward its own positive
   * lateral offsets. `level/trackLevel.ts`'s `curvatureOf` produces exactly
   * this number and every venue in the project already has it.
   *
   * **The signage needs the lap's shape, not just its length**, and this is the
   * whole of the shape it needs. The lead rule is arc length and cares about
   * nothing else; the *read* rule below is a bearing, and a bearing needs to
   * know that the corridor a mark is painted on has swung away from the trail
   * the rider is looking down. Omitted means straight, which is the answer for
   * every venue that never asks the question.
   */
  readonly curvature?: number;
}

/** The ring a sign is placed on. */
export interface SignLap {
  /** Total centreline length of one lap, metres. */
  readonly metres: number;
  /** Every corridor of the lap, in riding order. */
  readonly segments: readonly SignLapSegment[];
  /**
   * How far a boardwalk patch reaches past the paint it carries, metres.
   *
   * `SIGNS.padMargin` when the caller says nothing, which is the safe answer
   * for a venue sampled at 1.5 m whose corridors run along a world axis. A
   * venue whose corridors turn wants its own number: a cell takes the surface
   * under its *centre*, so the margin has to cover the offset from a painted
   * point to that centre, and on a corridor at 45° to the grid that offset is
   * half the cell's diagonal rather than half its side. The park hands in a
   * number derived from its own spacing, and `switchbackLevel.test.ts` proves
   * by building the level that no run was clipped at it.
   */
  readonly padMargin?: number;
  /** The same, for the patches under a landing box's lines. */
  readonly landingPadMargin?: number;
  /**
   * The furthest ahead of its feature a sign may stand, metres.
   *
   * The lead rule is a floor: read it, decide, stop. There is no ceiling in the
   * physics, and without one the search will happily put a sign most of a lap
   * early — legal, and no longer a sign for that feature. Unbounded when the
   * caller says nothing, because the rule itself is the only thing this file
   * can derive; a venue knows how far back a rider still connects a mark to a
   * feature, and this is where it says so. A candidate beyond it is refused, and
   * a feature with no candidate inside it throws rather than being signed from
   * the far side of the lap.
   */
  readonly maxLead?: number;
}

/** A block standing on a corridor, in that corridor's own `(s, t)` frame. */
export interface SignBlock {
  readonly s: number;
  readonly t: number;
  readonly halfAlong: number;
  readonly halfLateral: number;
}

/** Where a feature puts the rider down. */
export interface SignLanding {
  /** The corridor the landing is on — not always the feature's own. */
  readonly segment: string;
  /** The landing's span in that corridor's own frame, metres. */
  readonly fromS: number;
  readonly toS: number;
  /** Lateral centre of the landing, metres. Positive is the rider's LEFT. */
  readonly t: number;
  /** Half the landing's width, metres. */
  readonly halfLateral: number;
  /**
   * Whether the rider lands on bare trail rather than on a deck.
   *
   * A deck landing is already marked — it is a different material standing
   * proud of the ground, which is `docs/PLANS.md` §36.4's own "the landing is a
   * different surface on the first frame". Only a ground landing needs paint,
   * and painting a box on top of a deck is impossible anyway: `buildPlan`
   * reads the *heightfield cell's* surface, not the deck's top face.
   */
  readonly onGround: boolean;
}

/** One feature, and everything its signage needs to know about it. */
export interface SignedFeature {
  /** The feature's stable id, used in every refusal message. */
  readonly id: string;
  /** What kind of thing it is. Carried through to the placement record. */
  readonly kind: string;
  /** The corridor that carries the feature's blocks. */
  readonly segment: string;
  /**
   * The commitment point, as a distance along the **lap**, metres.
   *
   * Where the feature can no longer be refused: a take-off lip, the first tread
   * of a staircase, the near edge of a gap. Every lead is measured back from
   * here. A lap distance rather than a corridor-local `s` because that is the
   * frame the measurement pass publishes it in (`bench/installedPark.ts`'s
   * `lipS`) and because a lead of forty metres routinely reaches back through
   * two corridors, so the local frame would have to be converted anyway.
   */
  readonly lipS: number;
  /** The speed a rider actually arrives at, mph, from the measurement pass. */
  readonly approachMph: number;
  /** Which half the feature is on: +1 the rider's left, -1 their right. */
  readonly technicalSide: 1 | -1;
  /** Which half rolls past it. Normally the other one. */
  readonly bypassSide: 1 | -1;
  /** Lateral centre of the technical line, metres, signed like `t`. */
  readonly technicalT: number;
  /** Lateral centre of the bypass line, metres, signed like `t`. */
  readonly bypassT: number;
  /**
   * Where the bypass arrow's shaft begins across the trail, metres.
   *
   * Zero — the middle of the corridor — draws the full taper: a lane change
   * authored from the centreline out to the bypass line, which is the right
   * mark where a rider has to be *told* which half is the easy one.
   *
   * A venue whose bypass is simply the whole free half of every corridor does
   * not need telling, and the taper costs it dearly: the pad has to carry
   * paint from the technical line across to the bypass line, which is most of
   * the corridor's width in boardwalk under every sign. Starting the shaft
   * nearer the bypass line keeps the arrow's *shape* — a single long diagonal
   * against a stack of three chevrons — on a strip of its own.
   */
  readonly bypassFromT?: number;
  /**
   * Shorten this sign, because its corridor cannot give a full-length one.
   *
   * Two chevrons at the shortest pitch that does not overlap them rather than
   * three at a reading pitch, and the bypass arrow drawn over the same block.
   * The stack is 3.6 m instead of 7.0, and what buys is where the pad's
   * boardwalk starts.
   *
   * **Asked for by measurement, not by taste.** Switchback's staircase can be
   * signed from one place — the eight metres of trail between the skinny's
   * plank and the step-up's deck — and that trail is the step-up's own
   * measured run-up. A full pad puts planking under the point the bench spawns
   * its step-up trials at, and the bench says so: `diagnostic50` at 8 mph with
   * half charge stopped mounting the 0.50 m face. A pad short enough to start
   * after that point leaves every window in `docs/JUMP_BENCH.md` exactly where
   * Phase 2 measured it, which is §36.4's "new scenery must not move any of
   * these boundaries" obeyed rather than argued with.
   *
   * The two marks are still told apart four ways — a V against a diagonal, the
   * technical line against the bypass line, glyph width against edge width,
   * `road` paint against `path` — so the one distinction this gives up, the
   * count, is the one that was redundant.
   */
  readonly compact?: true;
  /** Up to two approved words, printed in this order along the trail. */
  readonly words?: readonly ParkSignWord[];
  /** Where the rider lands, if this feature puts them anywhere. */
  readonly landing?: SignLanding;
  /** The feature's own blocks, so no sign is painted or planted against one. */
  readonly blocks?: readonly SignBlock[];
}

// ---------------------------------------------------------------------------
// The outputs
// ---------------------------------------------------------------------------

/** Where one sign ended up, and the arithmetic that put it there. */
export interface SignPlacement {
  readonly feature: string;
  readonly kind: string;
  /** The corridor the sign's pad is on. */
  readonly segment: string;
  /** The pad's paint, in that corridor's frame, metres. */
  readonly fromS: number;
  readonly toS: number;
  /** The lateral extent of the pad's paint, metres. */
  readonly fromT: number;
  readonly toT: number;
  /** Lap distance of the last thing the rider reads. */
  readonly lapDistance: number;
  /** Lap distance of the feature's commitment point. */
  readonly commitDistance: number;
  /** Metres of lap between the two. The rule's left-hand side. */
  readonly lead: number;
  /** What the rule asked for at this approach speed. */
  readonly requiredLead: number;
  readonly approachMps: number;
  /**
   * Metres of approach over which the chevrons stay on the narrowest pane.
   *
   * The longest *unbroken* stretch, which is the only form of the number that
   * means anything: a mark that flickers in and out of the frame three times
   * has not been read. Measured to the last chevron's tip — the far edge of the
   * paint, the same point the lead rule is measured from.
   */
  readonly readMetres: number;
  /**
   * What the read rule asked for: `readSeconds × v`, or the pad's own length.
   *
   * The longer of the two. The first is the time a rider needs to read a mark
   * and the second is the distance over which the mark *is* a mark — a nineteen
   * metre sign seen for twelve is a sign read in pieces.
   */
  readonly requiredReadMetres: number;
  readonly words: readonly ParkSignWord[];
  /** The signpost beside the pad, in the pad's own corridor frame. */
  readonly post: { readonly s: number; readonly t: number };
  /**
   * How far the post stands from the technical line, metres.
   *
   * The chase arm reaches `CAMERA.distanceAtSpeed` behind the rider and its
   * obstruction probe pulls the camera in on anything solid within
   * `obstructionRadius` of that ray. A sign that yanked the camera in on the
   * approach it exists to make readable would be worse than no sign, so this is
   * a reported number rather than a hope.
   *
   * A *separation* rather than a difference of magnitudes, because a post on a
   * bend stands on the far side of the trail from its own chevrons (see the
   * builder) and the arithmetic has to say the same thing either way.
   */
  readonly postCameraGap: number;
  /**
   * Boardwalk this sign laid, square metres — its own pads plus its landing's.
   *
   * Measured in the corridor's own `(s, t)` frame, which is the frame the
   * bands are authored in. Reported because a sign is a surface change on the
   * riding line and the venue owes the owner a number for how much of his lap
   * it planked.
   */
  readonly padArea: number;
  /**
   * The separate pad the words went on, when they would not fit in front of the
   * arrows. Absent — the usual case — when the sign is one pad.
   */
  readonly copy?: {
    readonly segment: string;
    readonly fromS: number;
    readonly toS: number;
    readonly lapDistance: number;
  };
}

/** Everything the signage adds, gathered by the corridor that carries it. */
export interface ParkSignage {
  /** Ranged `wood` bands — the boardwalk patches paint stands on. */
  readonly bands: ReadonlyMap<string, readonly SurfaceBand[]>;
  readonly markings: ReadonlyMap<string, readonly SegmentMarking[]>;
  readonly props: ReadonlyMap<string, readonly SegmentProp[]>;
  /** One record per sign, in the order the features were given. */
  readonly signs: readonly SignPlacement[];
  /** Every band's area added up, square metres. */
  readonly boardwalkArea: number;
}

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

/** Metres a second per mile an hour. */
const MPS_PER_MPH = 0.44704;

/**
 * The wheel's braking at full lean, m/s².
 *
 * Derived rather than typed — see the file comment. 22.0 × sin 0.50 = 10.547.
 */
export const SIGN_BRAKE_DECELERATION = EUC.brakeAuthority * Math.sin(EUC.maxLeanPitch);

/**
 * How far before its feature a sign has to finish being read, metres.
 *
 * `readSeconds * v + v² / (2a)`. The first term is the rider reading the sign
 * and deciding; the second is `data/tuning.ts`'s own stopping distance from
 * that speed. See the file comment for where both halves come from.
 */
export function signLeadMetres(mps: number): number {
  return SIGNS.readSeconds * mps + (mps * mps) / (2 * SIGN_BRAKE_DECELERATION);
}

// ---------------------------------------------------------------------------
// The read rule
// ---------------------------------------------------------------------------

/**
 * Tangent of the half-angle a mark has to stay inside to be on the screen.
 *
 * **The second half of the sign rule, and it took a photograph to find it.**
 * The lead rule says a rider must have time to act on a mark; it says nothing
 * about whether the mark is on the screen while they have it. Phase 2 placed
 * every pad at the latest point the lead rule allowed, which on a 180° hairpin
 * is past the apex — and the browser pass measured the kicker's chevrons in
 * frame for **0.00 s** of a portrait phone's approach and the spin shelf's for
 * **1.25 s** against the 1.5 s the lead rule buys. Both signs were legal and
 * neither was a sign.
 *
 * The angle is derived rather than typed: `CAMERA.fovAtRest` is the vertical
 * field of view and the horizontal one is that angle times the pane's aspect,
 * so `tan(fov/2) × SIGNS.paneAspect` is the tangent of the half-angle on the
 * narrowest pane the game is played in. `fovAtRest` rather than `fovAtSpeed`
 * because the field *widens* with speed — the narrow end is the one a placement
 * has to survive.
 */
export const SIGN_PANE_HALF_TANGENT = Math.tan(CAMERA.fovAtRest / 2) * SIGNS.paneAspect;

/** How finely the read rule walks an approach, metres. */
const READ_SAMPLE = 0.25;

/** How far a pad's start is moved per attempt when the read rule refuses it. */
const READ_STEP = 0.5;

/** A pose on the lap's centreline: a world point and a heading. */
interface LapPose {
  readonly x: number;
  readonly z: number;
  /** Radians; forward is `(sin h, cos h)` and the rider's left is `(cos h, -sin h)`. */
  readonly h: number;
}

/**
 * The lap's centreline, reconstructed from the corridors' lengths and turns.
 *
 * Placed at an arbitrary origin facing an arbitrary way, because every question
 * asked of it is a *relative* bearing — where a mark sits in the rider's own
 * frame — and those are unchanged by where the ring is pinned. That is what
 * lets this file stay ignorant of the venue: it is handed lengths, curvatures
 * and entry distances, and the shape follows.
 */
function lapShape(lap: SignLap): {
  poseOn: (segmentId: string, s: number) => LapPose;
  poseAt: (distance: number) => LapPose;
} {
  const ordered = [...lap.segments].sort((a, b) => a.entryDistance - b.entryDistance);
  const entries = new Map<string, LapPose>();
  let x = 0;
  let z = 0;
  let h = 0;
  for (const segment of ordered) {
    entries.set(segment.id, { x, z, h });
    const curvature = segment.curvature ?? 0;
    const exit = h + curvature * segment.length;
    if (Math.abs(curvature) < 1e-9) {
      x += Math.sin(h) * segment.length;
      z += Math.cos(h) * segment.length;
    } else {
      x += (Math.cos(h) - Math.cos(exit)) / curvature;
      z += (Math.sin(exit) - Math.sin(h)) / curvature;
    }
    h = exit;
  }
  const byId = new Map(lap.segments.map((segment) => [segment.id, segment]));

  const poseOn = (segmentId: string, s: number): LapPose => {
    const segment = byId.get(segmentId);
    const entry = entries.get(segmentId);
    if (segment === undefined || entry === undefined) {
      throw new Error(`the lap carries no segment "${segmentId}"`);
    }
    const curvature = segment.curvature ?? 0;
    const heading = entry.h + curvature * s;
    if (Math.abs(curvature) < 1e-9) {
      return { x: entry.x + Math.sin(entry.h) * s, z: entry.z + Math.cos(entry.h) * s, h: heading };
    }
    return {
      x: entry.x + (Math.cos(entry.h) - Math.cos(heading)) / curvature,
      z: entry.z + (Math.sin(heading) - Math.sin(entry.h)) / curvature,
      h: heading,
    };
  };

  const poseAt = (distance: number): LapPose => {
    const along = ((distance % lap.metres) + lap.metres) % lap.metres;
    let found = ordered[ordered.length - 1]!;
    for (const segment of ordered) {
      if (along >= segment.entryDistance - 1e-9
        && along <= segment.entryDistance + segment.length + 1e-9) {
        found = segment;
        break;
      }
    }
    return poseOn(found.id, along - found.entryDistance);
  };

  return { poseOn, poseAt };
}

/**
 * A world point, offset to the rider's left of a corridor's spine.
 *
 * The same reconstruction the browser pass uses to aim its camera at a mark,
 * which is why the two measurements agree to a tenth of a second.
 */
function markPoint(
  shape: ReturnType<typeof lapShape>,
  segmentId: string,
  s: number,
  t: number,
): { x: number; z: number } {
  const pose = shape.poseOn(segmentId, s);
  return { x: pose.x + Math.cos(pose.h) * t, z: pose.z - Math.sin(pose.h) * t };
}

/**
 * The longest unbroken stretch of the approach on which a mark is on the screen.
 *
 * Metres of lap rather than seconds, because metres are what a placement can be
 * moved by; the caller converts with the speed the lead rule already uses.
 * Walked backwards from the mark over `SIGNS.readMetres`, which is where the
 * paint stops being paint on the narrowest pane.
 *
 * `stopAt` is how far short of the mark the walk finishes, and the caller passes
 * the **pad's own length**: the spell has to be spent before the rider is on the
 * paint, because reading a sign while crossing it is not advance warning. It is
 * not pedantry — a 180° hairpin has a plateau in it. Paint anywhere past a
 * hairpin's apex is invisible for the whole approach and then visible for the
 * last nine or ten metres, from inside the corner, and that plateau is wide
 * enough to satisfy a slow feature's `readSeconds × v` on its own. Finishing the
 * walk at the first paint deletes it, which is the difference between a rule and
 * a number a bad placement can creep under.
 *
 * **The camera's own arm is deliberately left out.** It stands
 * `CAMERA.distanceAtSpeed` behind the rider, which *adds* to every forward
 * distance and can only widen the window — so a placement that passes this
 * passes with the real camera too, and the number this returns is a floor
 * rather than a claim.
 */
function readWindowMetres(
  shape: ReturnType<typeof lapShape>,
  mark: { readonly segment: string; readonly s: number; readonly t: number },
  markDistance: number,
  stopAt = 0,
): number {
  const point = markPoint(shape, mark.segment, mark.s, mark.t);
  let best = 0;
  let run = 0;
  for (let back = SIGNS.readMetres; back >= stopAt; back -= READ_SAMPLE) {
    const rider = shape.poseAt(markDistance - back);
    const dx = point.x - rider.x;
    const dz = point.z - rider.z;
    const forward = dx * Math.sin(rider.h) + dz * Math.cos(rider.h);
    const lateral = dx * Math.cos(rider.h) - dz * Math.sin(rider.h);
    // A metre of forward distance is the floor rather than zero: at nothing at
    // all the ratio below is a division by a rounding error, and a mark level
    // with the wheel is under it rather than on the screen.
    if (forward > 1 && Math.abs(lateral) / forward <= SIGN_PANE_HALF_TANGENT) {
      run += READ_SAMPLE;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Metres per unit `x` in the letter frame — the across-trail scale.
 *
 * A letter box is `LETTER_ASPECT` units wide and has to come out
 * `SIGNS.glyphAcross` metres across, and `wordLength(word, 1)` measures a word
 * in the same units — so one scale converts both.
 */
const GLYPH_ACROSS_SCALE = SIGNS.glyphAcross / LETTER_ASPECT;
/** Metres per unit `y` — the along-trail scale, stretched for foreshortening. */
const GLYPH_ALONG_SCALE = GLYPH_ACROSS_SCALE * SIGNS.glyphElongation;

/** The along-trail block the chevrons and the bypass taper share. */
const ARROW_BLOCK = Math.max(
  (SIGNS.chevronCount - 1) * SIGNS.chevronPitch + SIGNS.chevronLength,
  SIGNS.bypassTaperLength,
);

/** How many chevrons a compact sign stacks, and how far apart. */
const COMPACT_CHEVRON_COUNT = 2;
/**
 * The shortest pitch two chevrons may take: their own length.
 *
 * Any closer and the second one's wings cross the first one's — two runs of
 * paint sharing ground, which on a single coplanar mesh is one invisible run
 * (`trackLevel.test.ts`'s `paintFights`). So this is a floor rather than a
 * choice, and a compact stack is 3.6 m against a full one's 7.0.
 */
const COMPACT_CHEVRON_PITCH = SIGNS.chevronLength;
const COMPACT_ARROW_BLOCK = (COMPACT_CHEVRON_COUNT - 1) * COMPACT_CHEVRON_PITCH
  + SIGNS.chevronLength;

/** How far a pad keeps off a segment's own sockets, metres. */
const SOCKET_MARGIN = 1.0;

/**
 * Clear trail between a pad and the feature — or the sign — beside it, metres.
 *
 * Deliberately *not* the boardwalk margin. The boardwalk is a surface and may
 * run under a deck's foundation, where it is invisible and harmless; the paint
 * is the thing that has to stay off, and `buildPlan`'s own clipper already
 * refuses anything within `MARKINGS.colliderClearance` of a block. Half a metre
 * is what separates two marks a rider reads as two marks, and it is the number
 * the venue needs: Switchback's timber corridor leaves exactly eight metres of
 * trail between the skinny's plank and the step-up's deck, which is a seven
 * metre pad and this clearance either side and nothing to spare.
 */
const FEATURE_CLEARANCE = 0.5;

/** The signpost's own footprint, which `buildPlan` tests the corridor against. */
const POST_RADIUS = (() => {
  const footprint = PROP_FOOTPRINTS.signpost;
  return footprint.shape === 'circle' ? footprint.radius : 0;
})();

/**
 * The eight words, drawn once each at unit cap height.
 *
 * **Every call below passes a literal**, which is the point: `inkKit.test.ts`
 * scans the whole of `src/` for a printed word and refuses anything not on the
 * approved list, and a scan cannot read a variable. Laying the alphabet out
 * through a literal-keyed table makes the set of words this file is *able* to
 * print visible in the file, to a reader and to the guard alike. Everything
 * `wordStrokes` does scales linearly in the height, so unit strokes multiply
 * up to any size exactly.
 */
const UNIT_WORDS: Readonly<Record<ParkSignWord, readonly (readonly (readonly [number, number])[])[]>> = Object.freeze({
  '180': wordStrokes('180', 1, { tracking: SIGNS.glyphTracking }),
  TAP: wordStrokes('TAP', 1, { tracking: SIGNS.glyphTracking }),
  DOWN: wordStrokes('DOWN', 1, { tracking: SIGNS.glyphTracking }),
  GAP: wordStrokes('GAP', 1, { tracking: SIGNS.glyphTracking }),
  DROP: wordStrokes('DROP', 1, { tracking: SIGNS.glyphTracking }),
  STEP: wordStrokes('STEP', 1, { tracking: SIGNS.glyphTracking }),
  STAIRS: wordStrokes('STAIRS', 1, { tracking: SIGNS.glyphTracking }),
  AIR: wordStrokes('AIR', 1, { tracking: SIGNS.glyphTracking }),
});

/**
 * Half the across-trail width of a word, metres.
 *
 * Measured from the letter *boxes* rather than from the strokes inside them, so
 * a word ending in an `I` — a stem in the middle of its own box — is centred on
 * its type rather than on its ink.
 */
function wordHalfAcross(word: ParkSignWord): number {
  return (wordLength(word, 1, SIGNS.glyphTracking) * GLYPH_ACROSS_SCALE) / 2;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Place every feature's signage.
 *
 * Deterministic: the features are walked in the order given, every search below
 * scans the lap in its own order, and nothing here reads a clock or a random
 * number. Two calls with the same arguments return deep-equal results.
 *
 * Throws rather than degrading. A sign that cannot be placed far enough back,
 * a word that is not approved, paint that would land on a block or off the
 * corridor — each of those is a level that should not build, because the
 * failure mode of the alternative is signage that is silently clipped away and
 * a feature nobody was warned about (`level/plan.ts`: nothing may be authored
 * in the knowledge it will be clipped).
 */
export function parkSignage(
  features: readonly SignedFeature[],
  lap: SignLap,
): ParkSignage {
  const padMargin = lap.padMargin ?? SIGNS.padMargin;
  const landingMargin = lap.landingPadMargin ?? SIGNS.landingPadMargin;
  if (!(padMargin > 0) || !(landingMargin > 0)) {
    throw new Error(`a boardwalk margin of ${padMargin} / ${landingMargin} m is not a margin`);
  }

  const byId = new Map<string, SignLapSegment>();
  for (const segment of lap.segments) byId.set(segment.id, segment);
  if (byId.size !== lap.segments.length) throw new Error('the lap names a segment twice');
  if (!(lap.metres > 0)) throw new Error(`a lap of ${lap.metres} m is not a lap`);

  // The lap as a shape rather than as a ring of lengths, for the read rule.
  const shape = lapShape(lap);

  const lapDistance = (segmentId: string, s: number): number => {
    const segment = byId.get(segmentId);
    if (segment === undefined) throw new Error(`the lap carries no segment "${segmentId}"`);
    return (segment.entryDistance + s) % lap.metres;
  };

  // Every feature's own stretch of lap, so no sign is laid across another
  // feature's take-off or landing. A metre either side, plus the pad margin the
  // boardwalk would want anyway.
  const zones: { readonly from: number; readonly to: number; readonly id: string }[] = [];
  for (const feature of features) {
    if (byId.get(feature.segment) === undefined) {
      throw new Error(`${feature.id} sits on no segment "${feature.segment}"`);
    }
    const commit = ((feature.lipS % lap.metres) + lap.metres) % lap.metres;
    // **The whole of the feature, not just the point it commits at.** A gap's
    // landing deck is thirteen metres past its take-off and a rhythm's last
    // terrace thirty past its first; a zone that stopped at the commitment
    // point would let the next feature's sign be painted across them, and paint
    // on a deck is paint that never appears (`buildPlan` reads the heightfield
    // cell's surface, not a block's top face).
    let from = commit;
    let to = commit;
    const reach = (distance: number): void => {
      const ahead = (distance - commit + lap.metres) % lap.metres;
      if (ahead > lap.metres / 2) {
        const behind = lap.metres - ahead;
        if (behind > (commit - from + lap.metres) % lap.metres) from = distance;
        return;
      }
      if (ahead > (to - commit + lap.metres) % lap.metres) to = distance;
    };
    for (const block of feature.blocks ?? []) {
      reach(lapDistance(feature.segment, block.s - block.halfAlong));
      reach(lapDistance(feature.segment, block.s + block.halfAlong));
    }
    if (feature.landing !== undefined) {
      reach(lapDistance(feature.landing.segment, feature.landing.fromS));
      reach(lapDistance(feature.landing.segment, feature.landing.toS));
    }
    zones.push({
      from: (from - FEATURE_CLEARANCE + lap.metres) % lap.metres,
      to: (to + FEATURE_CLEARANCE) % lap.metres,
      id: feature.id,
    });
  }

  const blocksBySegment = new Map<string, SignBlock[]>();
  for (const feature of features) {
    for (const block of feature.blocks ?? []) {
      const list = blocksBySegment.get(feature.segment);
      if (list === undefined) blocksBySegment.set(feature.segment, [block]);
      else list.push(block);
    }
  }

  const bands = new Map<string, SurfaceBand[]>();
  const markings = new Map<string, SegmentMarking[]>();
  const props = new Map<string, SegmentProp[]>();
  const signs: SignPlacement[] = [];
  let boardwalkArea = 0;

  const addBand = (id: string, band: SurfaceBand): void => {
    const list = bands.get(id);
    if (list === undefined) bands.set(id, [band]);
    else list.push(band);
  };

  /**
   * Plank exactly one group of runs, and say what it cost.
   *
   * **One patch per mark, not one per sign.** A sign's paint is three or four
   * marks with corridor between them — a word, a stack of chevrons, an arrow on
   * the far half — and a single rectangle round the lot plants boardwalk across
   * the whole trail: the fixture measured 210–310 m² a sign that way, which on
   * nine features is two thousand square metres of planking on a 949 m lap.
   * Bounding each mark on its own and letting the trail show between them costs
   * the perimeter of each patch in margin and nothing else.
   */
  const plank = (id: string, runs: readonly SegmentMarking[], margin: number): number => {
    let lowS = Infinity;
    let highS = -Infinity;
    let lowT = Infinity;
    let highT = -Infinity;
    for (const run of runs) {
      const half = markingWidth(run.role) / 2;
      for (const point of run.path) {
        lowS = Math.min(lowS, point.s - half);
        highS = Math.max(highS, point.s + half);
        lowT = Math.min(lowT, point.t - half);
        highT = Math.max(highT, point.t + half);
      }
    }
    if (!(lowS <= highS)) throw new Error('a boardwalk patch was asked to carry no paint');
    const band: SurfaceBand = {
      from: lowT - margin,
      to: highT + margin,
      surface: 'wood',
      fromS: lowS - margin,
      toS: highS + margin,
    };
    addBand(id, band);
    const area = (band.to - band.from) * ((band.toS ?? 0) - (band.fromS ?? 0));
    boardwalkArea += area;
    return area;
  };
  const addMarking = (id: string, marking: SegmentMarking): void => {
    const list = markings.get(id);
    if (list === undefined) markings.set(id, [marking]);
    else list.push(marking);
  };

  for (const feature of features) {
    const words = feature.words ?? [];
    for (const word of words) {
      if (!(PARK_SIGN_WORDS as readonly string[]).includes(word)) {
        throw new Error(`${feature.id} prints "${word}", which is not an approved park word`);
      }
    }
    if (words.length > 2) {
      throw new Error(`${feature.id} carries ${words.length} words; nobody reads three at speed`);
    }
    if (!(feature.approachMph > 0)) {
      throw new Error(`${feature.id} approaches at ${feature.approachMph} mph`);
    }
    if (feature.technicalSide === feature.bypassSide) {
      throw new Error(`${feature.id} puts its technical line and its bypass on the same side`);
    }
    if (Math.sign(feature.technicalT) !== feature.technicalSide) {
      throw new Error(
        `${feature.id} is on side ${feature.technicalSide} but its line is at t ${feature.technicalT}`,
      );
    }

    const approachMps = feature.approachMph * MPS_PER_MPH;
    const requiredLead = signLeadMetres(approachMps);
    const commitDistance = ((feature.lipS % lap.metres) + lap.metres) % lap.metres;

    // -- How long the pad is ------------------------------------------------
    // Words first, because they are read first; then a gap; then the arrows,
    // which are the instruction and are the last thing under the wheel.
    const copyBlock = words.length === 0
      ? 0
      : words.length * GLYPH_ALONG_SCALE + (words.length - 1) * SIGNS.copyGap;
    const arrowBlock = feature.compact === true ? COMPACT_ARROW_BLOCK : ARROW_BLOCK;
    const copyLength = words.length === 0 ? arrowBlock : copyBlock + SIGNS.copyGap + arrowBlock;

    // -- The read rule, as a predicate the pad search has to satisfy ---------
    // `readSeconds` of approach at the speed the lead rule already uses, which
    // is the same second and a half spent on the same sign: the lead rule buys
    // the time to act on it and this buys the time to see it. A pad that is
    // legal by one and refused by the other is the defect the browser pass
    // photographed on two of Switchback's hairpins.
    //
    // **Or the pad's own length, whichever is longer.** A sign is a mark lying
    // on the ground and a rider who cannot see its far end coming for as far as
    // the sign is long is reading it in pieces. It matters on exactly one of
    // Switchback's nine: the spin shelf's is nineteen metres of pad in front of
    // a 15 mph feature, so `readSeconds × v` asks for ten metres — barely over
    // the ten-metre plateau a 180° hairpin hands to any pad past its apex, and
    // close enough to it that a metre of geometry either way decides whether the
    // sign is readable. Nineteen puts it on the part of the corner the approach
    // actually looks down, with seventeen metres of window instead of twelve.
    const readSpeedMetres = SIGNS.readSeconds * approachMps;
    const reads = (segmentId: string, s: number, length: number): boolean => readWindowMetres(
      shape,
      // The last chevron's tip — the far edge of the paint, and the same point
      // the lead is measured from. On a bend it is the worst point of the mark,
      // because it is the one furthest round the corner from the rider's eye.
      { segment: segmentId, s: s + length, t: feature.technicalT },
      lapDistance(segmentId, s + length),
      length,
    ) >= Math.max(readSpeedMetres, length) - 1e-9;

    let placement = findPad(lap, commitDistance, requiredLead, copyLength, zones, reads);
    // **Copy and arrows may be two pads, and on a crowded lap they have to be.**
    // Switchback's timber corridor leaves exactly eight metres of trail between
    // the skinny's plank and the step-up's deck, and the staircase's lead puts
    // its sign nowhere else: seven metres of arrows fit there and a word in
    // front of them does not. Splitting them is what road signage does anyway —
    // the word is the advance warning and the arrows are the decision point —
    // so the fallback is a better sign rather than a compromised one. Tried
    // second, because one pad reads as one instruction and is preferred
    // wherever the lap has room for it.
    let copyPad: { segment: string; s: number; lead: number } | null = null;
    if (placement === null && words.length > 0) {
      placement = findPad(lap, commitDistance, requiredLead, arrowBlock, zones, reads);
      if (placement !== null) {
        copyPad = findPad(
          lap,
          (lapDistance(placement.segment, placement.s) - FEATURE_CLEARANCE + lap.metres)
            % lap.metres,
          0,
          copyBlock,
          zones,
          reads,
        );
        if (copyPad === null) placement = null;
      }
    }
    if (placement === null) {
      throw new Error(
        `${feature.id} has nowhere to put a sign: it needs ${requiredLead.toFixed(1)} m of lead, `
        + `${copyLength.toFixed(1)} m of pad inside one corridor and `
        + `${Math.max(readSpeedMetres, copyLength).toFixed(1)} m `
        + `of approach it can be seen from, no further back than `
        + `${(lap.maxLead ?? Infinity).toFixed(1)} m, and no corridor on this `
        + `${lap.metres.toFixed(1)} m lap has all four clear of another feature`,
      );
    }
    const segment = byId.get(placement.segment)!;
    const padEnd = placement.s + (copyPad === null ? copyLength : arrowBlock);

    // -- The paint, one group per mark --------------------------------------
    // Grouped rather than gathered, because each group gets its own boardwalk
    // patch and the trail between them stays trail.
    const groups: SegmentMarking[][] = [];
    const copyGroups: SegmentMarking[][] = [];
    let cursor = copyPad === null ? placement.s : copyPad.s;
    for (const word of words) {
      const mark = glyphMarkings(word, cursor + GLYPH_ALONG_SCALE, feature.technicalT);
      (copyPad === null ? groups : copyGroups).push(mark);
      cursor += GLYPH_ALONG_SCALE + SIGNS.copyGap;
    }
    const arrowsFrom = padEnd - arrowBlock;
    groups.push(chevronMarkings(padEnd, feature.technicalT, feature.compact === true));
    groups.push(bypassMarkings(arrowsFrom, padEnd, feature.bypassFromT ?? 0, feature.bypassT));
    const authored: SegmentMarking[] = [...groups.flat(), ...copyGroups.flat()];

    // -- Where the paint actually reaches, so the boardwalk can carry it ----
    let fromT = Infinity;
    let toT = -Infinity;
    for (const marking of authored) {
      const half = markingWidth(marking.role) / 2;
      for (const point of marking.path) {
        fromT = Math.min(fromT, point.t - half);
        toT = Math.max(toT, point.t + half);
      }
    }
    // Nothing is authored in the knowledge it will be clipped (`level/plan.ts`),
    // and paint that ran off the corridor would be cut away silently.
    const edge = Math.min(
      segment.halfWidth,
      copyPad === null ? Infinity : byId.get(copyPad.segment)!.halfWidth,
    ) - MARKINGS.colliderClearance;
    if (fromT < -edge || toT > edge) {
      throw new Error(
        `${feature.id}'s sign reaches t ${fromT.toFixed(2)}..${toT.toFixed(2)} on a corridor `
        + `${segment.halfWidth} m wide either side — it would be clipped rather than painted`,
      );
    }

    // -- Nothing painted or planted against a block ------------------------
    // A second line of defence behind the feature zones, which is where a pad
    // is normally kept off a deck. It is still worth having: a zone that wraps
    // a corridor's entry socket is dropped from that corridor's frame, and this
    // reads the blocks themselves.
    const checkBlocks = (id: string, from: number, to: number, runs: SegmentMarking[]): void => {
      if (runs.length === 0) return;
      let low = Infinity;
      let high = -Infinity;
      for (const run of runs) {
        const half = markingWidth(run.role) / 2;
        for (const point of run.path) {
          low = Math.min(low, point.t - half);
          high = Math.max(high, point.t + half);
        }
      }
      for (const block of blocksBySegment.get(id) ?? []) {
        const clear = MARKINGS.colliderClearance;
        const alongApart = Math.abs((from + to) / 2 - block.s) - ((to - from) / 2 + block.halfAlong);
        const acrossApart = Math.abs((low + high) / 2 - block.t)
          - ((high - low) / 2 + block.halfLateral);
        if (alongApart < clear && acrossApart < clear) {
          throw new Error(
            `${feature.id}'s sign lands on a block at s ${block.s}, t ${block.t} — `
            + `${Math.max(alongApart, acrossApart).toFixed(2)} m apart against ${clear} m `
            + 'of clearance',
          );
        }
      }
    };
    checkBlocks(placement.segment, placement.s, padEnd, groups.flat());
    if (copyPad !== null) {
      checkBlocks(copyPad.segment, copyPad.s, copyPad.s + copyBlock, copyGroups.flat());
    }

    for (const marking of groups.flat()) addMarking(placement.segment, marking);
    let padArea = 0;
    for (const group of groups) padArea += plank(placement.segment, group, padMargin);
    if (copyPad !== null) {
      for (const marking of copyGroups.flat()) addMarking(copyPad.segment, marking);
      for (const group of copyGroups) padArea += plank(copyPad.segment, group, padMargin);
      zones.push({
        from: (lapDistance(copyPad.segment, copyPad.s) - FEATURE_CLEARANCE + lap.metres)
          % lap.metres,
        to: (lapDistance(copyPad.segment, copyPad.s + copyBlock) + FEATURE_CLEARANCE) % lap.metres,
        id: `${feature.id}'s own copy`,
      });
    }

    // -- The landing --------------------------------------------------------
    // **The box is an outline and its inside is the trail.** Planking the whole
    // pad would put wood under every touchdown, and `data/surfaces.ts` prices
    // wood's roughness at 0.010 against dirt's 0.026 — which `EucController`'s
    // landing score reads directly, so a planked landing would quietly move
    // every window `docs/JUMP_BENCH.md` publishes. Four lines, each on its own
    // strip of boardwalk, leave the ground the rider actually lands on exactly
    // as the measurement pass found it.
    if (feature.landing !== undefined && feature.landing.onGround) {
      const landing = feature.landing;
      const host = byId.get(landing.segment);
      if (host === undefined) throw new Error(`${feature.id} lands on no segment "${landing.segment}"`);
      const length = landing.toS - landing.fromS;
      if (length < MARKINGS.minRunLength * 2) {
        throw new Error(`${feature.id}'s landing box is ${length.toFixed(2)} m long and would be clipped away`);
      }
      if (landing.halfLateral * 2 < MARKINGS.minRunLength + MARKINGS.edgeWidth * 2) {
        throw new Error(`${feature.id}'s landing box is ${(landing.halfLateral * 2).toFixed(2)} m wide and would be clipped away`);
      }
      const edge = host.halfWidth - MARKINGS.colliderClearance;
      const reach = Math.abs(landing.t) + landing.halfLateral + MARKINGS.barWidth / 2;
      if (reach > edge) {
        throw new Error(
          `${feature.id}'s landing box reaches ${reach.toFixed(2)} m across a corridor `
          + `${host.halfWidth} m wide either side — it would be clipped rather than painted`,
        );
      }
      for (const line of landingMarkings(landing)) {
        addMarking(landing.segment, line);
        padArea += plank(landing.segment, [line], landingMargin);
      }
    }

    // -- The post -----------------------------------------------------------
    // Outside the corridor by the builder's own clearance and the plate's own
    // radius, and outside the chase arm's sweep of the technical line, whichever
    // is further. Both bounds are read from the tables that enforce them.
    //
    // **On the outside of a bend, and on the technical side only where the trail
    // is straight.** A signpost's footprint is its plate, 1.05 m of radius, and
    // on the *inside* of a bend the verge is a converging wedge: Switchback
    // stands three signs four metres apart along a 16 m-radius corner, and at
    // ten metres inside that corner those four metres are one metre and a
    // third — close enough that `buildPlan`'s structural pass threw the middle
    // post away and the level shipped with eight posts for nine signs. Outside
    // the same corner the verge diverges and the same four metres are six and a
    // half. It is also where the post can be *seen* from: the read rule above
    // is the statement that the inside of a bend is behind the rider's eye, and
    // a post is signage before it is scenery.
    const cornerOut = segment.halfWidth + POST_RADIUS + PROP_CORRIDOR_CLEARANCE + SIGNS.postClearance;
    const curvature = segment.curvature ?? 0;
    const postSide: 1 | -1 = curvature === 0
      ? feature.technicalSide
      : (curvature > 0 ? -1 : 1);
    // The chase arm sweeps `distanceAtSpeed` behind the technical line and its
    // probe pulls in on anything within `obstructionRadius` of that ray, so what
    // the post owes is a distance from *that line* rather than from the
    // centreline — which on the far side of the trail is most of the way paid by
    // the corridor's own width.
    const cameraGap = CAMERA.distanceAtSpeed + CAMERA.obstructionRadius;
    const cameraOut = postSide === feature.technicalSide
      ? Math.abs(feature.technicalT) + cameraGap
      : cameraGap - Math.abs(feature.technicalT);
    const postT = postSide * Math.max(cornerOut, cameraOut);
    // No `yaw`: the plate is a box 1.05 m by 0.32 m and a half-turn about its
    // own axis maps it onto itself, so authoring a facing here would be data
    // that changes a digest and nothing a player can see. It stands square to
    // the trail, which is where the corridor's own heading puts it.
    const post: SegmentProp = { s: placement.s, t: postT, kind: 'signpost' };
    const list = props.get(placement.segment);
    if (list === undefined) props.set(placement.segment, [post]);
    else list.push(post);

    signs.push({
      feature: feature.id,
      kind: feature.kind,
      segment: placement.segment,
      fromS: placement.s,
      toS: padEnd,
      fromT,
      toT,
      lapDistance: lapDistance(placement.segment, padEnd),
      commitDistance,
      lead: placement.lead,
      requiredLead,
      approachMps,
      readMetres: readWindowMetres(
        shape,
        { segment: placement.segment, s: padEnd, t: feature.technicalT },
        lapDistance(placement.segment, padEnd),
        padEnd - placement.s,
      ),
      requiredReadMetres: Math.max(readSpeedMetres, padEnd - placement.s),
      words,
      post: { s: post.s, t: post.t },
      postCameraGap: Math.abs(postT - feature.technicalT),
      padArea,
      ...(copyPad === null ? {} : {
        copy: {
          segment: copyPad.segment,
          fromS: copyPad.s,
          toS: copyPad.s + copyBlock,
          lapDistance: lapDistance(copyPad.segment, copyPad.s + copyBlock),
        },
      }),
    });

    // **A placed pad is a zone like a feature is.** Two signs sharing ground is
    // one invisible sign: all paint in this project is coplanar and on one
    // mesh, so a later pad laid over an earlier one would simply be lost in it
    // (`trackLevel.test.ts`'s `paintFights`). Features are walked in lap order,
    // so the sign that gets the latest legal slot is the one whose feature
    // comes first, and everything behind it is pushed further back.
    zones.push({
      from: (lapDistance(placement.segment, placement.s) - FEATURE_CLEARANCE + lap.metres) % lap.metres,
      to: (lapDistance(placement.segment, padEnd) + FEATURE_CLEARANCE) % lap.metres,
      id: `${feature.id}'s own sign`,
    });

  }

  return {
    bands: new Map([...bands].map(([id, list]) => [id, list as readonly SurfaceBand[]])),
    markings: new Map([...markings].map(([id, list]) => [id, list as readonly SegmentMarking[]])),
    props: new Map([...props].map(([id, list]) => [id, list as readonly SegmentProp[]])),
    signs,
    boardwalkArea,
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * The latest place on the lap a pad of this length may start.
 *
 * "Latest" because a sign further back than it needs to be is a sign the rider
 * has forgotten by the time the feature arrives. The search is over whole
 * corridors rather than over the ring, because a pad is authored in one
 * segment's `(s, t)` frame and a pad straddling a socket would be authored
 * half in each — so a candidate that does not fit inside one corridor is not a
 * candidate at all.
 *
 * `cRel` is how far forward the commitment point lies from a candidate
 * segment's own entry socket, which turns the ring into a number line per
 * segment and keeps every comparison below a subtraction.
 */
function findPad(
  lap: SignLap,
  commitDistance: number,
  requiredLead: number,
  copyLength: number,
  zones: readonly { readonly from: number; readonly to: number; readonly id: string }[],
  reads: (segmentId: string, s: number, length: number) => boolean,
): { segment: string; s: number; lead: number } | null {
  let best: { segment: string; s: number; lead: number } | null = null;

  const maxLead = lap.maxLead ?? Infinity;
  if (maxLead < requiredLead) return null;

  for (const segment of lap.segments) {
    if (segment.pads === false) continue;
    const room = segment.length - copyLength - 2 * SOCKET_MARGIN;
    if (room < 0) continue;

    const cRel = ((commitDistance - segment.entryDistance) % lap.metres + lap.metres) % lap.metres;
    // The pad must finish `requiredLead` before the commitment point, and must
    // not wrap past it — `s + copyLength <= cRel - requiredLead` does both.
    const sMax = Math.min(segment.length - copyLength - SOCKET_MARGIN, cRel - copyLength - requiredLead);
    const sMin = Math.max(SOCKET_MARGIN, cRel - copyLength - maxLead);
    if (sMax < sMin) continue;

    // Feature zones, in the same per-segment frame. A sign painted across a
    // take-off is not a sign.
    const local = zones
      .map((zone) => ({
        from: ((zone.from - segment.entryDistance) % lap.metres + lap.metres) % lap.metres,
        to: ((zone.to - segment.entryDistance) % lap.metres + lap.metres) % lap.metres,
      }))
      .filter((zone) => zone.from <= segment.length && zone.from <= zone.to);
    // Half-open on both ends, to a millionth of a millimetre: a pad that
    // finishes exactly where a zone begins has not entered it, and on this
    // venue that is not a technicality — the staircase's sign fits in the
    // timber corridor with zero slack or not at all.
    const clear = (s: number): boolean => local
      .every((zone) => !(s + copyLength > zone.from + 1e-9 && s < zone.to - 1e-9));

    // **The candidates, latest first.** `sMax` is the latest the lead rule and
    // the sockets allow; each zone's own near edge is the latest a pad may
    // finish in front of *that* zone, and those two sets are where the answer
    // lay while the lead rule was the only rule — the zone boundaries already
    // carry a pad margin, so a pad ending exactly at one is already clear of it
    // and subtracting a socket margin as well would cost a metre nothing asked
    // for. The read rule can refuse all of them, and then the search has to walk
    // back through the corridor rather than give up: hence the grid, at a step
    // fine enough that half a metre is the most a sign is ever pushed past the
    // first place it becomes readable.
    const candidates = [sMax, ...local.map((zone) => zone.from - copyLength)]
      .filter((s) => s >= sMin - 1e-9 && s <= sMax + 1e-9);
    for (let s = sMax; s >= sMin; s -= READ_STEP) candidates.push(s);
    candidates.sort((a, b) => b - a);

    for (const s of candidates) {
      if (!clear(s)) continue;
      const lead = cRel - s - copyLength;
      if (lead > maxLead) continue;
      if (best !== null && lead >= best.lead) break;
      if (!reads(segment.id, s, copyLength)) continue;
      best = { segment: segment.id, s, lead };
      break;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * A stack of chevrons pointing along the trail, right-aligned at the pad's end.
 *
 * A `V` opening backwards, which is a shape no lane line in this project makes,
 * so it can be told from a centre line without reading its colour.
 */
function chevronMarkings(padEnd: number, centreT: number, compact: boolean): SegmentMarking[] {
  const out: SegmentMarking[] = [];
  const count = compact ? COMPACT_CHEVRON_COUNT : SIGNS.chevronCount;
  const pitch = compact ? COMPACT_CHEVRON_PITCH : SIGNS.chevronPitch;
  for (let index = 0; index < count; index += 1) {
    const tip = padEnd - index * pitch;
    out.push({
      path: [
        { s: tip - SIGNS.chevronLength, t: centreT + SIGNS.chevronHalfSpan },
        { s: tip, t: centreT },
        { s: tip - SIGNS.chevronLength, t: centreT - SIGNS.chevronHalfSpan },
      ],
      role: 'glyph',
      paint: 'road',
    });
  }
  return out;
}

/**
 * One long taper from the middle of the corridor across to the bypass line.
 *
 * It starts at `t = 0` rather than on the technical line, which keeps it clear
 * of the chevrons' own ground by the whole of the technical line's offset —
 * two runs of paint sharing ground are one invisible run, because all paint in
 * this project is coplanar and on one mesh (`trackLevel.test.ts`'s
 * `paintFights`).
 *
 * **Two runs against the chevron stack's three**, and that difference is on
 * purpose: a shaft and one head is a single arrow, where three heads in a
 * column is a repeated instruction. Together with the diagonal direction, the
 * lighter `edge` weight and the duller `path` paint, that is four independent
 * ways to tell the two marks apart, of which only the last is a colour.
 */
function bypassMarkings(
  from: number,
  to: number,
  fromT: number,
  bypassT: number,
): SegmentMarking[] {
  const runS = to - from;
  const runT = bypassT - fromT;
  const length = Math.hypot(runS, runT);
  const dirS = runS / length;
  const dirT = runT / length;
  // Long enough to survive the clipper's two-metre minimum for an `edge` run —
  // a head authored at a metre and a half would be thrown away silently and the
  // bypass arrow would ship as a bare diagonal.
  const barb = SIGNS.bypassTaperLength * 0.35;
  const spread = 0.5;
  const wing = (side: 1 | -1): { s: number; t: number } => {
    // The shaft direction rotated by roughly ±150°, so the head is swept back
    // along the *diagonal* rather than along the trail.
    const cos = Math.cos(Math.PI - spread * side);
    const sin = Math.sin(Math.PI - spread * side);
    return {
      s: to + barb * (dirS * cos - dirT * sin),
      t: bypassT + barb * (dirS * sin + dirT * cos),
    };
  };
  return [
    { path: [{ s: from, t: fromT }, { s: to, t: bypassT }], role: 'edge', paint: 'path' },
    { path: [wing(1), { s: to, t: bypassT }, wing(-1)], role: 'edge', paint: 'path' },
  ];
}

/**
 * A word, stretched along the trail and read across it.
 *
 * The letter frame's `x` runs left to right in reading order, and the rider's
 * left is `+t`, so reading order runs toward **negative** `t`. The frame's `y`
 * runs from cap height to baseline, and the caps have to be the part furthest
 * from the rider — a word on the ground is read the way a word on a page is,
 * with its tops away from the reader — so `y` runs toward **negative** `s` from
 * the word's far edge.
 *
 * `GLYPH_ALONG_SCALE` is `GLYPH_ACROSS_SCALE * SIGNS.glyphElongation`: a mark
 * lying flat on the ground forty metres ahead of a camera two metres up is seen
 * at about eight degrees and loses most of its along-trail extent, which is why
 * real road text is stretched and why an unstretched word here would read as a
 * smear of strokes.
 */
function glyphMarkings(word: ParkSignWord, farS: number, centreT: number): SegmentMarking[] {
  const half = wordHalfAcross(word);
  const out: SegmentMarking[] = [];
  for (const stroke of UNIT_WORDS[word]) {
    out.push({
      path: stroke.map(([x, y]) => ({
        s: farS - y * GLYPH_ALONG_SCALE,
        t: centreT + half - x * GLYPH_ACROSS_SCALE,
      })),
      role: 'glyph',
      paint: 'road',
    });
  }
  return out;
}

/**
 * A landing box: three white lines and one red threshold.
 *
 * The threshold is the near end — the line the rider is aiming to clear — and
 * is the only red paint the signage uses. The sides and the far bar are inset
 * from it so no two runs share ground at the corners, which would be an
 * invisible overlap rather than a visible join.
 */
function landingMarkings(landing: SignLanding): SegmentMarking[] {
  const near = landing.fromS;
  const far = landing.toS;
  const inset = MARKINGS.barWidth;
  const left = landing.t + landing.halfLateral;
  const right = landing.t - landing.halfLateral;
  return [
    {
      path: [{ s: near, t: right }, { s: near, t: left }],
      role: 'bar',
      paint: 'kerb',
    },
    {
      path: [{ s: near + inset, t: left }, { s: far - MARKINGS.edgeWidth, t: left }],
      role: 'edge',
      paint: 'road',
    },
    {
      path: [{ s: near + inset, t: right }, { s: far - MARKINGS.edgeWidth, t: right }],
      role: 'edge',
      paint: 'road',
    },
    {
      path: [
        { s: far, t: right + MARKINGS.edgeWidth },
        { s: far, t: left - MARKINGS.edgeWidth },
      ],
      role: 'edge',
      paint: 'road',
    },
  ];
}
