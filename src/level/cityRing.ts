/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { PropKind } from '../data/props.ts';
import { roadConnectorMarkings } from './roadConnectorMarkings.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { LevelPlan } from './plan.ts';
import type { RandomStream } from './seedStreams.ts';
import {
  centrelineAt,
  forwardOf,
  leftOf,
  placeGraph,
  querySegment,
  type PlacedSegment,
  type SegmentBranch,
  type SegmentProp,
  type SegmentSpec,
} from './segments.ts';
import {
  LIBRARY_CONNECTORS,
  libraryPiece,
  transitionIsLegible,
  type LibraryPiece,
} from './segmentLibrary.ts';

/**
 * M39 — the town ring (generated revision r6).
 *
 * **Why this exists, in the owner's words.** The first M39 city appended two
 * blocks to the old point-to-point library tail: it kept the beats' variety and
 * ended in a dead end. Its replacement (r5) closed the loop by repeating one
 * pavement block four times, and the library tail stopped running because the
 * four blocks already paid the length floor — so the plaza, the curbs, the
 * alley, the park, the river ford, the gravel spur, the bermed trail and the
 * kicker all disappeared. *"This can be done better."*
 *
 * The ring keeps both halves. Every accepted beat is on it, in an order that
 * reads as one town — a downtown with a commercial block, a residential
 * quarter with the curb run and the alley fork, a park and riverside that fall
 * toward the ford, the trail and kicker, and an industrial yard on the low
 * ground — and a closing road solved exactly back into the plaza, so a rider
 * never has to turn round. Three city blocks, each in its own district style,
 * carry the parallel side streets and cross streets a chase can use.
 *
 * **What a seed changes.** District order inside each quarter, block sizes and
 * spacing, the shape of the loop (the ellipse the joins steer along), which
 * steering joins are taken, optional pockets and shortcuts, and — through the
 * other five streams — grades, verges, dressing, hazards and targets. **What it
 * never changes**: that every beat is present, that the loop closes, and that
 * the old slice's beats keep their authored geometry (no beat is mirrored or
 * re-proportioned; only the joins between them are new).
 */

/** The district looks the kit can dress. */
export type CityDistrict = 'commercial' | 'residential' | 'industrial';
/**
 * The districts that are blocks with side and cross streets. The industrial
 * quarter is the rough yard road home and the return climb, dressed with
 * sheds rather than laid out as a third block.
 */
export const CITY_DISTRICTS = ['commercial', 'residential'] as const satisfies readonly CityDistrict[];

/** Which quarter a stretch of the ring belongs to — dressing and reports. */
export type RingQuarter = 'downtown' | 'residential' | 'park' | 'trails' | 'industrial' | 'join';

/** Main-route metres the ring must pay by required structure alone. */
export const CITY_ROUTE_FLOOR_METRES = 1_646;

interface DistrictStyle {
  readonly surface: SurfaceId;
  readonly halfWidth: number;
  /** Paving strips along both kerbs. */
  readonly kerb: SurfaceId;
  readonly kerbWidth: readonly [number, number];
  /** Building height: base + jitter × draw. */
  readonly height: readonly [number, number];
  /** Along-street spacing of the frontage, metres. */
  readonly spacing: number;
  /** Across-street depth of each frontage building. */
  readonly depth: readonly [number, number];
  /** Along-street width of each frontage building. */
  readonly width: readonly [number, number];
  readonly planting: PropKind | null;
  readonly furniture: PropKind | null;
}

/**
 * Three looks from the kit the game already owns. Width, height, spacing,
 * kerb material and what stands between the buildings do the work — no new
 * material or primitive, so nothing here moves a draw-call bucket.
 */
const DISTRICT_STYLES: Readonly<Record<CityDistrict, DistrictStyle>> = {
  // Tall, tight frontage on a wide street with brick pavements and lamps.
  commercial: {
    surface: 'pavement', halfWidth: 9, kerb: 'brick', kerbWidth: [2.2, 3.0],
    height: [16, 22], spacing: 20, depth: [16, 20], width: [16, 20],
    planting: null, furniture: 'lampPost',
  },
  // Low houses set apart, trees between them, a narrower street.
  residential: {
    surface: 'pavement', halfWidth: 6.5, kerb: 'brick', kerbWidth: [1.4, 1.8],
    height: [6, 4], spacing: 22, depth: [10, 12], width: [11, 14],
    planting: 'broadleafTree', furniture: 'shrub',
  },
  // Long low sheds on broken concrete with gravel aprons.
  industrial: {
    surface: 'roughPavement', halfWidth: 8, kerb: 'roughPavement', kerbWidth: [0, 0],
    height: [8, 5], spacing: 38, depth: [22, 26], width: [30, 34],
    planting: null, furniture: 'litterBin',
  },
};

/** A block's reconnecting streets, for `LevelPlan.streetLoops` and reports. */
export interface BlockLayout {
  readonly district: CityDistrict;
  readonly main: SegmentSpec[];
  readonly branches: SegmentBranch[];
  readonly throughIds: string[];
  readonly exitId: string;
  readonly loops: { main: string[]; alternate: string[] }[];
  readonly shortcuts: { name: string; fromId: string; exitId: string; rejoinId: string }[];
  readonly ids: string[];
}

const ARM_PARTS = ['in', 'align', 'street', 'street-b', 'return', 'out'] as const;
/**
 * Kerb to building face, metres. The builder refuses a building within the
 * default seven-metre shoulder of any corridor (`BUILDING_STAND_BACK`), so a
 * frontage set nearer simply never appears — which is how the first r6 draft
 * shipped blocks with no buildings on them.
 */
const FRONTAGE_SETBACK = 8;

/** How much wider the side street's bends are than the main street's, metres. */
const SIDE_STREET_WIDENING = 2;
const armIds = (district: string, arm: string): string[] =>
  ARM_PARTS.map((part) => `city-${district}-${arm}-${part}`);

/**
 * One district block: a Y at each end, two parallel streets `4R` apart with a
 * row of buildings between them and a cross street in the middle, and outward
 * frontage on both. Opposite arms mirror each other exactly, so both rejoin
 * the exit mouth at the same position, height and heading by construction.
 */
export function districtBlock(district: CityDistrict, draw: () => number, dress: () => number): BlockLayout {
  const style = DISTRICT_STYLES[district];
  const prefix = `city-${district}`;
  const radius = district === 'residential' ? 15 + Math.floor(draw() * 3) * 2
    : district === 'commercial' ? 18 + Math.floor(draw() * 3) * 2 : 20 + Math.floor(draw() * 3) * 2;
  const street = 120 + Math.floor(draw() * 4) * 16;
  const half = street / 2;
  const kerbWidth = style.kerbWidth[0] + draw() * (style.kerbWidth[1] - style.kerbWidth[0]);
  const road = (id: string, length: number, halfWidth: number, curvature = 0): SegmentSpec => ({
    id, length, halfWidth, curvature, surface: style.surface, shoulder: 3,
    ...(kerbWidth > 0 ? { bands: [
      { from: -halfWidth, to: -halfWidth + kerbWidth, surface: style.kerb },
      { from: halfWidth - kerbWidth, to: halfWidth, surface: style.kerb },
    ] } : {}),
    // Inset 6 m and 6.5 m: block streets are whole metres long, and a painted
    // run that is an exact number of 7.5 m dash periods puts the last dash on a
    // knife edge the last place of a sine decides (M39 r6).
    markings: curvature === 0 && halfWidth >= 7 ? [{ role: 'centre', broken: true,
      path: [{ s: 6, t: 0 }, { s: length - 6.5, t: 0 }] }] : [],
  });
  // **The side street is the longer way round, always** (M39 r6). Its bends
  // are two metres wider and its straights four metres shorter each, so it
  // still rejoins the exit mouth exactly, but it rides (2π − 4) × 2 ≈ 4.6 m
  // further. The chase spine is a shortest walk between the gates; with two
  // equal arms it could run up the side street and leave the main street
  // looking like a stray.
  const sideRadius = radius + SIDE_STREET_WIDENING;
  const sideHalf = half - 2 * SIDE_STREET_WIDENING;
  const between = 2 * radius + 2 * sideRadius;
  const frontage = (arm: 'main' | 'side', part: number): SegmentProp[] => {
    const length = arm === 'main' ? half : sideHalf;
    const out: SegmentProp[] = [];
    // Toward the other arm is right for the main (left) arm, left for the side.
    const inward = arm === 'main' ? -1 : 1;
    const outward = -inward;
    for (let s = style.spacing / 2; s < length - 8; s += style.spacing) {
      const height = style.height[0] + dress() * style.height[1];
      const depth = style.depth[0] + dress() * (style.depth[1] - style.depth[0]);
      const width = style.width[0] + dress() * (style.width[1] - style.width[0]);
      // The central row, once per pair of streets (the main arm authors it).
      if (arm === 'main') {
        const across = Math.max(10, between - 2 * (style.halfWidth + FRONTAGE_SETBACK));
        out.push({ kind: 'building', s, t: inward * between / 2,
          size: { x: across, y: height, z: width }, look: district });
      }
      // Outward frontage stands one verge behind the kerb.
      out.push({ kind: 'building', s: s + style.spacing * 0.35, t: outward * (style.halfWidth + FRONTAGE_SETBACK + depth / 2),
        size: { x: depth, y: height * (0.8 + dress() * 0.5), z: width }, look: district });
      if (style.furniture !== null && (part + Math.round(s)) % 2 === 0) {
        out.push({ kind: style.furniture, s: s + 6, t: outward * (style.halfWidth + 1.2) });
      }
      if (style.planting !== null) {
        out.push({ kind: style.planting, s: s + style.spacing / 2, t: outward * (style.halfWidth + 3.5),
          scale: 0.8 + dress() * 0.3 });
      }
    }
    return out;
  };
  const arm = (name: 'main' | 'side', sign: number): SegmentSpec[] => {
    const r = name === 'main' ? radius : sideRadius;
    const length = name === 'main' ? half : sideHalf;
    return [
      road(`${prefix}-${name}-in`, Math.PI * r / 2, style.halfWidth, sign / r),
      road(`${prefix}-${name}-align`, Math.PI * r / 2, style.halfWidth, -sign / r),
      { ...road(`${prefix}-${name}-street`, length, style.halfWidth), props: frontage(name, 0) },
      { ...road(`${prefix}-${name}-street-b`, length, style.halfWidth), props: frontage(name, 1) },
      road(`${prefix}-${name}-return`, Math.PI * r / 2, style.halfWidth, -sign / r),
      road(`${prefix}-${name}-out`, Math.PI * r / 2, style.halfWidth, sign / r),
    ];
  };
  const mouth = Math.max(style.halfWidth + 1, 9);
  const main = [road(`${prefix}-entry`, 24, mouth), ...arm('main', 1), road(`${prefix}-exit`, 24, mouth)];
  const branches: SegmentBranch[] = [
    { from: `${prefix}-entry`, specs: arm('side', -1) },
    { from: `${prefix}-main-street`, headingOffset: -Math.PI / 2,
      specs: [road(`${prefix}-cross`, between, Math.min(style.halfWidth, 6.5))] },
  ];
  const mainArm = armIds(district, 'main');
  const sideArm = armIds(district, 'side');
  const cross = `${prefix}-cross`;
  return {
    district,
    main,
    branches,
    throughIds: main.map((spec) => spec.id),
    exitId: `${prefix}-exit`,
    loops: [
      { main: mainArm, alternate: sideArm },
      { main: [...mainArm.slice(0, 3), cross], alternate: sideArm.slice(0, 3) },
      { main: mainArm.slice(3), alternate: [cross, ...sideArm.slice(3)] },
    ],
    shortcuts: [
      { name: `${district} side street`, fromId: `${prefix}-entry`, exitId: `${prefix}-side-out`, rejoinId: `${prefix}-exit` },
      { name: `${district} cross street`, fromId: `${prefix}-main-street`, exitId: cross, rejoinId: `${prefix}-side-street-b` },
    ],
    ids: [...main.map((spec) => spec.id), ...branches.flatMap((branch) => branch.specs.map((spec) => spec.id))],
  };
}

/**
 * Buildings along a join inside a town quarter, so the streets between the
 * blocks read as town rather than as country road (M39 r6). Drawn from the
 * dressing stream alone; the builder still refuses any that stand within a
 * shoulder of another corridor, so a bend that passes near other road simply
 * loses a building.
 */
export function quarterFrontage(spec: SegmentSpec, quarter: RingQuarter, draw: () => number): SegmentProp[] {
  const district: CityDistrict | null = quarter === 'downtown' ? 'commercial'
    : quarter === 'residential' ? 'residential' : null;
  if (district === null) return [];
  const style = DISTRICT_STYLES[district];
  const out: SegmentProp[] = [];
  for (let s = style.spacing / 2; s < spec.length - 4; s += style.spacing) {
    for (const side of [1, -1]) {
      if (draw() > 0.7) continue;
      const height = style.height[0] + draw() * style.height[1];
      const depth = style.depth[0] + draw() * (style.depth[1] - style.depth[0]);
      const width = style.width[0] + draw() * (style.width[1] - style.width[0]);
      out.push({ kind: 'building', s, t: side * (spec.halfWidth + FRONTAGE_SETBACK + depth / 2),
        size: { x: depth, y: height, z: width }, look: district });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Joins: steering arcs between stations and the exact closure
// ---------------------------------------------------------------------------

/** A connector family: the library's own neutral join, reshaped only in plan. */
interface JoinFamily {
  readonly name: string;
  readonly template: SegmentSpec;
  readonly radius: number;
}

const JOIN_FAMILIES: readonly JoinFamily[] = (() => {
  const straight = (family: string): SegmentSpec | undefined => LIBRARY_CONNECTORS
    .find((piece) => piece.main[0].id === `${family}-straight`)?.main[0];
  // Radius is the family's own bend where it authors one; otherwise that of the
  // nearest family (gravel with the trail, rough with the road).
  const bend = (family: string): number | undefined => {
    const spec = LIBRARY_CONNECTORS.find((piece) => piece.main[0].id === `${family}-bend-left`)?.main[0];
    return spec?.curvature === undefined ? undefined : 1 / spec.curvature;
  };
  const out: JoinFamily[] = [];
  for (const [name, fallback] of [['link-road', 40], ['link-path', 32], ['link-trail', 26],
    ['link-gravel', 30], ['link-rough', 36]] as const) {
    const template = straight(name);
    if (template !== undefined) out.push({ name, template, radius: bend(name) ?? fallback });
  }
  return out;
})();

interface Socket { readonly surface: SurfaceId; readonly halfWidth: number }

const widthOk = (a: number, b: number): boolean => Math.min(a, b) / Math.max(a, b) >= 0.5;

/** The families that may sit between two sockets without an illegible join. */
function familiesBetween(before: Socket, after: Socket): JoinFamily[] {
  return JOIN_FAMILIES.filter((family) => transitionIsLegible(before.surface, family.template.surface)
    && transitionIsLegible(family.template.surface, after.surface)
    && widthOk(before.halfWidth, family.template.halfWidth)
    && widthOk(family.template.halfWidth, after.halfWidth));
}

/** Geometry candidates remain paint-free. Paint is authored only after the
 * steering/closure choice passes, using that choice's actual length. */
function joinSpec(family: JoinFamily, id: string, length: number, curvature: number): SegmentSpec {
  const { props: _props, bands: _bands, markings: _markings, ...rest } = family.template;
  return { ...rest, id, length, curvature, climb: 0 };
}

/** Explicit family purpose, including closing roads whose ids are `close-*`.
 * Thousands of rejected search candidates never allocate paint paths. */
function paintAcceptedRoadJoin(family: JoinFamily, specs: SegmentSpec[]): SegmentSpec[] {
  return family.name !== 'link-road' ? specs : specs.map(spec => ({
    ...spec, markings: roadConnectorMarkings(spec.length, spec.halfWidth),
  }));
}

interface Pose { x: number; z: number; h: number }

/**
 * How much lower the town's return-climb ledge stands than the slice's, metres.
 *
 * The owner's r6 ride (2026-09-22): the stone ledge beside the climb, seen
 * from the plaza, was *nearly* hoppable and would be fun if it were. The
 * slice's block stands 0.91 m proud at its plaza end; 0.55 m lower it stands
 * 0.36 m proud there — under an uncharged hop's ~0.46 m apex — and still rises
 * clear of the road as the climb falls away, so it is a ledge to hop onto and
 * ride along. Applied to the ring's own renamed copy of the beat: the library
 * keeps pointing at the slice's spec, and the authored slice keeps its wall.
 */
const TOWN_RETURN_LEDGE_DROP = 0.55;

/**
 * The look a quarter's own buildings wear (M39 Phase 2). A beat keeps its
 * authored blocks — same place, same size, same collider — and only its
 * composition takes the district's: the boulevard's blocks join downtown's
 * palette, the curb run's and the fork's become the residential quarter's
 * pitched roofs, the return beat's the yard's sheds. The park and the trails
 * carry no buildings. Applied to the ring's renamed copies only, so the
 * library and the authored slice never see a look.
 */
const QUARTER_LOOKS: Readonly<Record<RingQuarter, CityDistrict | undefined>> = {
  downtown: 'commercial',
  residential: 'residential',
  industrial: 'industrial',
  park: undefined,
  trails: undefined,
  join: undefined,
};

function withDistrictLook(spec: SegmentSpec, look: CityDistrict | undefined): SegmentSpec {
  if (look === undefined || !(spec.props ?? []).some((prop) => prop.kind === 'building')) return spec;
  return { ...spec, props: spec.props!.map((prop) => (prop.kind === 'building' ? { ...prop, look } : prop)) };
}

function townVariant(spec: SegmentSpec, libraryId: string): SegmentSpec {
  if (libraryId !== 'return-climb') return spec;
  return {
    ...spec,
    blocks: (spec.blocks ?? []).map((block) => ({ ...block, height: block.height - TOWN_RETURN_LEDGE_DROP })),
  };
}

/**
 * A closing-road length or a join score, settled to the micrometre.
 *
 * **One seed must be one world in every runtime.** `Math.asin`, `acos`,
 * `atan2` and even `sin` are not bit-identical between V8 builds — Node's and
 * a browser's differ in the last place on some inputs — and the closing road
 * is solved from them. Unsettled, that last-place difference rode through
 * every segment after it and changed the heightfield a browser built from the
 * one a test predicted. A micrometre is far below anything a rider meets, and
 * the ring's own guard still checks it arrives within 5 cm of the plaza.
 *
 * Scores are settled for the same reason and a sharper one: two join shapes
 * can be the *same road* (a 120° arc and two 60° arcs), so their scores tie
 * exactly in arithmetic and the last place decided which was taken — in a
 * browser, a different ring from the one Node built. Settled, they tie
 * exactly, and the stable sort keeps them in the order they were generated.
 */
function settled(metres: number): number {
  return Math.round(metres * 1e6) / 1e6;
}

const TAU = Math.PI * 2;
const wrap = (angle: number): number => ((angle % TAU) + TAU) % TAU;
const headingOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

/**
 * Arc–straight–arc from one pose to another at radius `r`, all four kinds.
 * Exact by construction: the closing road meets the return climb's entry
 * socket at its position and heading, so the ring has no seam at the join.
 */
export function dubins(from: Pose, to: Pose, r: number): { turns: [number, number]; straight: number; kind: string }[] {
  const out: { turns: [number, number]; straight: number; kind: string }[] = [];
  for (const kind of ['LSL', 'RSR', 'LSR', 'RSL']) {
    const s1 = kind[0] === 'L' ? 1 : -1;
    const s2 = kind[2] === 'L' ? 1 : -1;
    const l0 = leftOf(from.h); const l1 = leftOf(to.h);
    const c1 = { x: from.x + s1 * r * l0.x, z: from.z + s1 * r * l0.z };
    const c2 = { x: to.x + s2 * r * l1.x, z: to.z + s2 * r * l1.z };
    const dx = c2.x - c1.x; const dz = c2.z - c1.z;
    const d = Math.hypot(dx, dz);
    const phi = headingOf(dx, dz);
    let theta: number; let straight: number;
    if (s1 === s2) { theta = phi; straight = d; }
    else {
      if (d < 2 * r) continue;
      theta = phi + s1 * Math.asin(2 * r / d);
      straight = Math.sqrt(d * d - 4 * r * r);
    }
    const a1 = s1 > 0 ? wrap(theta - from.h) : wrap(from.h - theta);
    const a2 = s2 > 0 ? wrap(to.h - theta) : wrap(theta - to.h);
    out.push({ turns: [s1 * a1, s2 * a2], straight, kind });
  }
  return out;
}

/**
 * Arc–arc–arc, for two ends too close for a straight between them. Worked in
 * (z, x), where a heading is the usual counter-clockwise angle and a left
 * turn is counter-clockwise, then read back as signed turns.
 */
export function threeArcs(from: Pose, to: Pose, r: number): number[][] {
  const out: number[][] = [];
  const p0 = { X: from.z, Y: from.x }; const p1 = { X: to.z, Y: to.x };
  for (const first of [1, -1]) {
    const c1 = { X: p0.X - first * r * Math.sin(from.h), Y: p0.Y + first * r * Math.cos(from.h) };
    const c2 = { X: p1.X - first * r * Math.sin(to.h), Y: p1.Y + first * r * Math.cos(to.h) };
    const d = Math.hypot(c2.X - c1.X, c2.Y - c1.Y);
    if (d < 1e-6 || d > 4 * r) continue;
    const phi = Math.atan2(c2.Y - c1.Y, c2.X - c1.X);
    for (const side of [1, -1]) {
      const alpha = phi + side * Math.acos(d / (4 * r));
      const c3 = { X: c1.X + 2 * r * Math.cos(alpha), Y: c1.Y + 2 * r * Math.sin(alpha) };
      const t1 = Math.atan2(c3.Y - c1.Y, c3.X - c1.X) + first * Math.PI / 2;
      const t2 = Math.atan2(c2.Y - c3.Y, c2.X - c3.X) - first * Math.PI / 2;
      const a1 = first > 0 ? wrap(t1 - from.h) : wrap(from.h - t1);
      const a2 = first > 0 ? wrap(t1 - t2) : wrap(t2 - t1);
      const a3 = first > 0 ? wrap(to.h - t2) : wrap(t2 - to.h);
      out.push([first * a1, -first * a2, first * a3]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stations and the ring program
// ---------------------------------------------------------------------------

type Station =
  | { readonly kind: 'beat'; readonly piece: LibraryPiece; readonly quarter: RingQuarter }
  | { readonly kind: 'block'; readonly district: CityDistrict; readonly quarter: RingQuarter };

/**
 * The quarters in riding order. Elevation decides the fixed parts: the park
 * and riverside fall 6.7 m to the ford, gravel and trail give back 1.7, and
 * the return climb's five metres bring the ring home to the plaza — the slice's
 * own profile, which is why the order inside those quarters stays put.
 */
function ringProgram(route: RandomStream): Station[] {
  const beat = (id: string, quarter: RingQuarter): Station => ({ kind: 'beat', piece: libraryPiece(id), quarter });
  const block = (district: CityDistrict, quarter: RingQuarter): Station => ({ kind: 'block', district, quarter });
  const maybeSwap = <T>(a: T, b: T): [T, T] => (route.next() < 0.5 ? [a, b] : [b, a]);
  const downtown = maybeSwap(block('commercial', 'downtown'), beat('boulevard', 'downtown'));
  const residential = maybeSwap(block('residential', 'residential'), beat('curb-run', 'residential'));
  return [
    beat('plaza', 'downtown'),
    ...downtown,
    ...residential,
    beat('fork', 'residential'),
    beat('park-gate', 'park'),
    beat('riverside', 'park'),
    beat('gravel-spur', 'park'),
    beat('trailhead', 'trails'),
    beat('kicker', 'trails'),
    beat('return', 'industrial'),
  ];
}

export interface TownRing {
  readonly graph: { main: SegmentSpec[]; branches: SegmentBranch[] };
  readonly throughIds: string[];
  /** Library pieces in riding order, with their instance tag. */
  readonly beats: { piece: LibraryPiece; instance: string; exitId: string; optional: { name: string; branch: SegmentBranch; ids: string[] }[] }[];
  readonly blocks: BlockLayout[];
  readonly closureIds: string[];
  readonly shortcuts: { name: string; fromId: string; exitId: string; rejoinId: string }[];
  readonly jumps: { name: string; lipId: string; landingId: string }[];
  readonly streetLoops: { main: string[]; alternate: string[] }[];
  /** Segment id → piece id, so the seam rule skips a piece's own overlaps. */
  readonly pieceOf: Map<string, string>;
  /** Segment id → quarter, for dressing and reports. */
  readonly quarterOf: Map<string, RingQuarter>;
  readonly stations: string[];
  /** Every join the construction filter treats as one piece of road. */
  readonly links: [string, string][];
}

/**
 * Clear ground a new stretch of road must keep from every corridor it does not
 * join, edge to edge, metres. Corridors may meet only where the town means
 * them to: a Y, a junction, a crossing a piece authors. Overlap at one height
 * is legal ground but not a street anybody drew.
 */
const CORRIDOR_GAP = 8;

/** Road left between the two halves for the closing road to make, metres. */
const MEETING_GAP = 140;

/** Shortest piece a closing road may contain, metres. */
const MIN_PART = 2;

/** Join road the loop is sized for before each station, metres. */
const JOIN_ALLOWANCE = 30;

/** What a join measures on average once laid, metres — spreads the forward half. */
const JOIN_ESTIMATE = 50;

/** How much worse than the best a join may score and still be taken when the best ones are blocked. */
const FALLBACK_SCORE = 90;

/** Score per metre of join: short joins keep the ring made of places, not road. */
const JOIN_LENGTH_COST = 0.4;

/** Steepest eased grade the closing road may reach; the slice's return climb is ~9%. */
const CLOSURE_MAX_GRADE = 0.09;

interface Chunk {
  readonly station: Station;
  readonly specs: SegmentSpec[];
  readonly branches: SegmentBranch[];
  readonly throughIds: string[];
  readonly exitId: string;
  readonly entry: Socket;
  readonly exit: Socket;
  readonly beat?: TownRing['beats'][number];
  readonly block?: BlockLayout;
}

function chunkOf(station: Station, index: number, route: RandomStream, dressing: RandomStream): Chunk {
  if (station.kind === 'block') {
    const block = districtBlock(station.district, () => route.next(), () => dressing.next());
    const first = block.main[0]; const last = block.main[block.main.length - 1];
    return {
      station, specs: block.main, branches: block.branches, throughIds: block.throughIds,
      exitId: block.exitId, block,
      entry: { surface: first.surface, halfWidth: first.halfWidth },
      exit: { surface: last.surface, halfWidth: last.halfWidth },
    };
  }
  const piece = station.piece;
  const instance = `${index}`;
  const rename = (id: string): string => `${id}@${instance}`;
  const look = QUARTER_LOOKS[station.quarter];
  const specs = piece.main.map((spec) => withDistrictLook(townVariant({ ...spec, id: rename(spec.id) }, spec.id), look));
  const through = piece.branches.filter((branch) => branch.kind === 'through');
  const asBranch = (branch: LibraryPiece['branches'][number]): SegmentBranch => ({
    from: rename(branch.from),
    ...(branch.atDistance === undefined ? {} : { atDistance: branch.atDistance }),
    ...(branch.lateralOffset === undefined ? {} : { lateralOffset: branch.lateralOffset }),
    ...(branch.elevationOffset === undefined ? {} : { elevationOffset: branch.elevationOffset }),
    ...(branch.headingOffset === undefined ? {} : { headingOffset: branch.headingOffset }),
    specs: branch.specs.map((spec) => withDistrictLook({ ...spec, id: rename(spec.id) }, look)),
  });
  const optional = piece.branches.filter((branch) => branch.kind === 'optional').map((branch) => ({
    name: branch.name, branch: asBranch(branch), ids: branch.specs.map((spec) => rename(spec.id)),
  }));
  return {
    station,
    specs,
    branches: through.map(asBranch),
    throughIds: [...specs.map((spec) => spec.id), ...through.flatMap((branch) => branch.specs.map((spec) => rename(spec.id)))],
    exitId: rename(piece.exitSegment),
    entry: piece.entry,
    exit: piece.exit,
    beat: { piece, instance, exitId: rename(piece.exitSegment), optional },
  };
}

/** Where a chunk ends relative to its entry pose, placed for real. */
function chunkExit(chunk: Chunk, start: Pose): { pose: Pose; placed: PlacedSegment[] } {
  const placed = placeGraph({ main: chunk.specs, branches: chunk.branches },
    { position: { x: start.x, y: 0, z: start.z }, headingY: start.h });
  const exit = placed.find((segment) => segment.spec.id === chunk.exitId)!.exit;
  return { pose: { x: exit.position.x, z: exit.position.z, h: exit.headingY }, placed };
}

/** Pose after a sequence of plan-view moves (arc angle at radius, or straight). */
function advance(pose: Pose, specs: readonly SegmentSpec[]): Pose {
  let p = pose;
  for (const spec of specs) {
    const end = centrelineAt({ position: { x: p.x, y: 0, z: p.z }, headingY: p.h, surface: 'pavement', halfWidth: 1, gradient: 0 }, spec, spec.length);
    p = { x: end.x, z: end.z, h: p.h + (spec.curvature ?? 0) * spec.length };
  }
  return p;
}

export interface RingOptions {
  /**
   * The construction filter: would these freshly placed segments meet any of
   * `others` at a step or a wall? `links` names every pair that is one road.
   */
  readonly collides: (fresh: readonly PlacedSegment[], others: readonly PlacedSegment[], links: readonly [string, string][]) => boolean;
}

/** Local offset of `to` from `from`, in `from`'s frame: left, forward, turn. */
interface Relative { readonly left: number; readonly ahead: number; readonly turn: number; readonly climb: number }

function relativeOf(specs: readonly SegmentSpec[], branches: readonly SegmentBranch[], exitId: string): Relative {
  const placed = placeGraph({ main: specs, branches }, { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  const exit = placed.find((segment) => segment.spec.id === exitId)!.exit;
  // At heading 0 the rider's left is +X and forward is +Z.
  return { left: exit.position.x, ahead: exit.position.z, turn: exit.headingY, climb: exit.position.y };
}

/** Where something with offset `rel` must start so that it ends at `end`. */
function startFor(end: Pose, rel: Relative): Pose {
  const h = end.h - rel.turn;
  const f = forwardOf(h); const l = leftOf(h);
  return { x: end.x - (l.x * rel.left + f.x * rel.ahead), z: end.z - (l.z * rel.left + f.z * rel.ahead), h };
}

interface Laid {
  readonly joins: SegmentSpec[];
  readonly chunk: Chunk;
}

/**
 * Lay one ring, or say why not. `route` decides the plan view, `dressing`
 * the frontage; the terrain, verges, hazards and targets stay with their own
 * streams in the generator.
 *
 * **Laid from both ends.** The first half runs forward out of the plaza; the
 * second half is laid backward from the plaza's own entry socket (the return
 * climb, the kicker, the trail…), each station solved to end exactly where the
 * next begins. The two halves meet on the far side of town, in open ground,
 * where an arc–straight–arc road joins them exactly. A ring laid forward only
 * has to find its way home through the town it has just built; this one never
 * has to.
 */
export function layTownRing(route: RandomStream, dressing: RandomStream, options: RingOptions): { ring: TownRing | null; reason: string; partial?: { main: SegmentSpec[]; branches: SegmentBranch[] } } {
  const program = ringProgram(route);
  const chunks = program.map((station, index) => chunkOf(station, index, route, dressing));
  // The halves meet in the park: the riverside or the gravel spur is the
  // first station laid backward.
  const split = program.findIndex((station) => station.kind === 'beat' && station.piece.id === 'riverside')
    + (route.next() < 0.5 ? 0 : 1);

  // The loop the joins steer along: an ellipse through the spawn, turning
  // left, sized for the stations and about forty metres of join before each.
  const estimate = chunks.reduce((sum, chunk) => sum + chunkLength(chunk), 0) + chunks.length * JOIN_ALLOWANCE + MEETING_GAP;
  const aspect = 0.75 + route.next() * 0.5;
  const a = estimate / (Math.PI * (3 * (1 + aspect) - Math.sqrt((3 + aspect) * (1 + 3 * aspect))));
  const b = a * aspect;
  const ellipseLength = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const ellipse = (fraction: number): { x: number; z: number } => {
    const theta = fraction * TAU;
    return { x: a - a * Math.cos(theta), z: b * Math.sin(theta) };
  };
  /** The loop's tangent heading, unwrapped: 0 at the plaza, 2π back at it. */
  const tangentAt = (fraction: number): number => {
    const theta = Math.min(Math.max(fraction, 0), 1) * TAU;
    const heading = Math.atan2(a * Math.sin(theta), b * Math.cos(theta));
    return theta > 0.01 && heading <= 0 ? heading + TAU : heading;
  };

  const forward: Laid[] = [];
  const backward: Laid[] = [];
  let joinCount = 0;

  const joinShapes = (family: JoinFamily, tag: string): SegmentSpec[][] => {
    const out: SegmentSpec[][] = [];
    const turns = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
    for (const first of turns) {
      for (const second of [0, -60, -30, 30, 60]) {
        if (second !== 0 && Math.abs(first) > 90) continue;
        for (const lead of [0, 30, 70]) {
          const id = (part: string) => `${family.name}-steer${part}@${tag}`;
          const specs: SegmentSpec[] = [];
          const arc = (part: string, degrees: number): void => {
            if (degrees === 0) return;
            const angle = degrees * Math.PI / 180;
            specs.push(joinSpec(family, id(part), Math.abs(angle) * family.radius, Math.sign(angle) / family.radius));
          };
          arc('', first);
          if (lead > 0) specs.push(joinSpec(family, id('-lead'), lead, 0));
          arc('-b', second);
          if (specs.length === 0) specs.push(joinSpec(family, id(''), 16, 0));
          out.push(specs);
        }
      }
    }
    return out;
  };

  // -- Placement and the construction filter ------------------------------
  const assemble = (withClosure: SegmentSpec[] = [], withBackward = true): { main: SegmentSpec[]; branches: SegmentBranch[]; links: [string, string][] } => {
    const main: SegmentSpec[] = [];
    const branches: SegmentBranch[] = [];
    const links: [string, string][] = [];
    let attach: string | null = null;
    const chain = (specs: readonly SegmentSpec[]): void => {
      if (specs.length === 0) return;
      if (attach === null) main.push(...specs);
      else { branches.push({ from: attach, specs: [...specs] }); links.push([attach, specs[0].id]); }
      for (let k = 1; k < specs.length; k += 1) links.push([specs[k - 1].id, specs[k].id]);
      attach = specs[specs.length - 1].id;
    };
    const lay = (item: Laid): void => {
      chain(item.joins);
      chain(item.chunk.specs);
      branches.push(...item.chunk.branches);
      for (const branch of item.chunk.branches) {
        const ids = [branch.from, ...branch.specs.map((spec) => spec.id)];
        for (let k = 1; k < ids.length; k += 1) links.push([ids[k - 1], ids[k]]);
      }
      attach = item.chunk.exitId;
    };
    for (const item of forward) lay(item);
    chain(withClosure);
    if (withBackward) for (const item of backward) lay(item);
    return { main, branches, links };
  };

  /** The backward half as its own chain, ending on the plaza's entry. */
  const backwardPlaced = (items: readonly Laid[]): PlacedSegment[] => {
    if (items.length === 0) return [];
    let end: Pose = { x: 0, z: 0, h: TAU };
    let climb = 0;
    for (let k = items.length - 1; k >= 0; k -= 1) {
      const rel = relativeOf([...items[k].joins, ...items[k].chunk.specs], items[k].chunk.branches, items[k].chunk.exitId);
      end = startFor(end, rel);
      climb += rel.climb;
    }
    const specs: SegmentSpec[] = [];
    const extra: SegmentBranch[] = [];
    for (const item of items) { specs.push(...item.joins, ...item.chunk.specs); extra.push(...item.chunk.branches); }
    // Chunks whose exit is a branch (the kicker's landing) chain from there.
    const graph = { main: [] as SegmentSpec[], branches: [] as SegmentBranch[] };
    let attach: string | null = null;
    for (const item of items) {
      for (const run of [item.joins, item.chunk.specs]) {
        if (run.length === 0) continue;
        if (attach === null) graph.main.push(...run); else graph.branches.push({ from: attach, specs: [...run] });
        attach = run[run.length - 1].id;
      }
      graph.branches.push(...item.chunk.branches);
      attach = item.chunk.exitId;
    }
    return placeGraph(graph, { position: { x: end.x, y: -climb, z: end.z }, headingY: end.h });
  };

  const forwardPlaced = (): PlacedSegment[] => {
    const { main, branches } = assemble([], false);
    if (main.length === 0) return [];
    return placeGraph({ main, branches }, { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  };

  const clear = (fresh: readonly PlacedSegment[], others: readonly PlacedSegment[], links: readonly [string, string][]): boolean => {
    const near = new Map<string, Set<string>>();
    for (const [x, y] of links) {
      (near.get(x) ?? near.set(x, new Set()).get(x)!).add(y);
      (near.get(y) ?? near.set(y, new Set()).get(y)!).add(x);
    }
    // Two hops of adjacency: a join may sit close to the piece before the one
    // it touches (a Y mouth beside its own arms), never beside far road.
    const close2 = (id: string): Set<string> => {
      const out = new Set<string>([id]);
      for (const one of near.get(id) ?? []) { out.add(one); for (const two of near.get(one) ?? []) out.add(two); }
      return out;
    };
    for (const segment of fresh) {
      const mine = close2(segment.spec.id);
      const against = others.filter((other) => !mine.has(other.spec.id));
      for (let at = 0; at <= segment.spec.length; at += 4) {
        const centre = centrelineAt(segment.entry, segment.spec, at);
        const left = leftOf(segment.entry.headingY + (segment.spec.curvature ?? 0) * at);
        for (const lateral of [-segment.spec.halfWidth, 0, segment.spec.halfWidth]) {
          const x = centre.x + left.x * lateral; const z = centre.z + left.z * lateral;
          for (const other of against) {
            if (x < other.minX - CORRIDOR_GAP || x > other.maxX + CORRIDOR_GAP
              || z < other.minZ - CORRIDOR_GAP || z > other.maxZ + CORRIDOR_GAP) continue;
            const query = querySegment(other, x, z);
            if (query !== null && query.outside < CORRIDOR_GAP) return false;
          }
        }
      }
    }
    return true;
  };

  const chunkLinks = (item: Laid): [string, string][] => {
    const out: [string, string][] = [];
    const ids = [...item.joins, ...item.chunk.specs].map((spec) => spec.id);
    for (let k = 1; k < ids.length; k += 1) out.push([ids[k - 1], ids[k]]);
    for (const branch of item.chunk.branches) {
      const chain = [branch.from, ...branch.specs.map((spec) => spec.id)];
      for (let k = 1; k < chain.length; k += 1) out.push([chain[k - 1], chain[k]]);
    }
    // A chunk's own pieces may overlap each other (the Y mouths, the fork's
    // alley); the seam rule already treats a piece as the owner's geometry.
    const own = [...item.chunk.specs, ...item.chunk.branches.flatMap((branch) => branch.specs)].map((spec) => spec.id);
    for (const x of own) for (const y of own) if (x < y) out.push([x, y]);
    return out;
  };

  const acceptable = (fresh: readonly PlacedSegment[], others: readonly PlacedSegment[], links: readonly [string, string][]): boolean =>
    clear(fresh, others, links) && !options.collides(fresh, others, links);

  // -- The backward half, laid first ----------------------------------------
  // `home` is where the next-laid (earlier) station has to end.
  let home: Pose = { x: 0, z: 0, h: TAU };
  let remaining = 0;
  // The plaza is down before anything: the return climb ends on it.
  const plazaPlaced = placeGraph({ main: chunks[0].specs, branches: chunks[0].branches },
    { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  for (let index = chunks.length - 1; index >= split; index -= 1) {
    const chunk = chunks[index];
    const rel = relativeOf(chunk.specs, chunk.branches, chunk.exitId);
    const entry = startFor(home, rel);
    const before = chunks[index - 1];
    const families = familiesBetween(before.exit, chunk.entry);
    if (families.length === 0) return { ring: null, reason: `no legible join into ${stationName(chunk.station)}` };
    const family = families[Math.floor(route.next() * families.length)];
    const tag = `k${joinCount}`;
    const chunkLen = chunkLength(chunk);
    const scored = joinShapes(family, tag).map((specs) => {
      const joinRel = relativeOf(specs, [], specs[specs.length - 1].id);
      const start = startFor(entry, joinRel);
      const length = specs.reduce((sum, spec) => sum + spec.length, 0);
      // Steer the station before this one: its middle should point along the
      // loop where it will sit, and its end should be on the loop.
      const at = 1 - (remaining + chunkLen + length) / ellipseLength;
      const previousMiddle = at - chunkLength(before) / 2 / ellipseLength;
      const turn = index - 1 >= split ? Math.abs(start.h - (tangentAt(previousMiddle) + turnOf(before) / 2)) : Math.abs(start.h - tangentAt(at));
      const goal = ellipse(at);
      const miss = Math.hypot(start.x - goal.x, start.z - goal.z);
      return { specs, start, score: settled(turn * 120 + miss * 0.6 + length * JOIN_LENGTH_COST) };
    }).sort((x, y) => x.score - y.score);
    const best = scored[0].score;
    const near = scored.filter((candidate) => candidate.score <= best + 25);
    // A join that fits only by throwing the ring off its loop is refused; the
    // attempt is drawn again instead (retry, never repair).
    const order = [...rotate(near, Math.floor(route.next() * near.length)),
      ...scored.slice(near.length).filter((candidate) => candidate.score <= best + FALLBACK_SCORE)];
    const placedBefore = [...plazaPlaced, ...backwardPlaced(backward)];
    let chosen: Laid | null = null;
    for (const candidate of order.slice(0, 60)) {
      const item: Laid = { joins: candidate.specs, chunk };
      const now = backwardPlaced([item, ...backward]);
      const ids = new Set([...candidate.specs, ...chunk.specs, ...chunk.branches.flatMap((branch) => branch.specs)].map((spec) => spec.id));
      const fresh = now.filter((segment) => ids.has(segment.spec.id));
      const links: [string, string][] = [...chunkLinks(item), ...backward.flatMap(chunkLinks)];
      if (backward.length > 0) links.push([chunk.exitId, (backward[0].joins[0] ?? backward[0].chunk.specs[0]).id]);
      else links.push([chunk.exitId, chunks[0].specs[0].id]);
      if (!acceptable(fresh, placedBefore, links)) continue;
      chosen = item;
      break;
    }
    joinCount += 1;
    if (chosen === null) return { ring: null, reason: `every join into ${stationName(chunk.station)} crosses the town` };
    chosen = { ...chosen, joins: paintAcceptedRoadJoin(family, chosen.joins) };
    backward.unshift(chosen);
    home = startFor(entry, relativeOf(chosen.joins, [], chosen.joins[chosen.joins.length - 1].id));
    remaining += chunkLen + chosen.joins.reduce((sum, spec) => sum + spec.length, 0);
  }

  // -- The forward half, which ends short of where the backward half begins --
  // The meeting point sits MEETING_GAP back along the backward half's first
  // heading; the forward half's stations are spread along the loop up to it
  // and its last station aims straight at it.
  const ahead = forwardOf(home.h);
  const meet: Pose = { x: home.x - ahead.x * MEETING_GAP, z: home.z - ahead.z * MEETING_GAP, h: home.h };
  let meetFraction = 0.5;
  {
    let nearest = Infinity;
    for (let k = 0; k <= 400; k += 1) {
      const point = ellipse(k / 400);
      const gap = Math.hypot(point.x - meet.x, point.z - meet.z);
      if (gap < nearest) { nearest = gap; meetFraction = k / 400; }
    }
  }
  const forwardPlanned = chunks.slice(0, split).reduce((sum, chunk) => sum + chunkLength(chunk), 0)
    + (split - 1) * JOIN_ESTIMATE;
  const along = (metres: number): number => Math.min(meetFraction, metres / forwardPlanned * meetFraction);
  const backPlacedFirst = backwardPlaced(backward);
  let pose: Pose = { x: 0, z: 0, h: 0 };
  let travelled = 0;
  let socket: Socket | null = null;
  for (let index = 0; index < split; index += 1) {
    const chunk = chunks[index];
    let chosen: Laid | null = null;
    if (socket === null) {
      chosen = { joins: [], chunk };
    } else {
      const families = familiesBetween(socket, chunk.entry);
      if (families.length === 0) return { ring: null, reason: `no legible join into ${stationName(chunk.station)}` };
      const family = families[Math.floor(route.next() * families.length)];
      const tag = `j${joinCount}`;
      const scored = joinShapes(family, tag).map((specs) => {
        const afterJoin = advance(pose, specs);
        const exit = chunkExit(chunk, afterJoin).pose;
        const length = specs.reduce((sum, spec) => sum + spec.length, 0);
        if (index === split - 1) {
          const miss = Math.hypot(exit.x - meet.x, exit.z - meet.z);
          return { specs, score: settled(miss + Math.abs(exit.h - meet.h) * 120 + length * JOIN_LENGTH_COST) };
        }
        const middle = along(travelled + length + chunkLength(chunk) / 2);
        const turn = Math.abs((afterJoin.h + exit.h) / 2 - tangentAt(middle));
        const goal = ellipse(along(travelled + length + chunkLength(chunk)));
        const miss = Math.hypot(exit.x - goal.x, exit.z - goal.z);
        return { specs, score: settled(turn * 120 + miss * 0.6 + length * JOIN_LENGTH_COST) };
      }).sort((x, y) => x.score - y.score);
      const best = scored[0].score;
      const near = scored.filter((candidate) => candidate.score <= best + 25);
      // A join that fits only by throwing the ring off its loop is refused; the
      // attempt is drawn again instead (retry, never repair).
      const order = [...rotate(near, Math.floor(route.next() * near.length)),
        ...scored.slice(near.length).filter((candidate) => candidate.score <= best + FALLBACK_SCORE)];
      const placedBefore = [...forwardPlaced(), ...backPlacedFirst];
      for (const candidate of order.slice(0, 60)) {
        const item: Laid = { joins: candidate.specs, chunk };
        forward.push(item);
        const now = forwardPlaced();
        forward.pop();
        const ids = new Set([...candidate.specs, ...chunk.specs, ...chunk.branches.flatMap((branch) => branch.specs)].map((spec) => spec.id));
        const fresh = now.filter((segment) => ids.has(segment.spec.id));
        const links = [...assemble([], false).links, ...chunkLinks(item), [forward[forward.length - 1].chunk.exitId, candidate.specs[0].id] as [string, string]];
        if (!acceptable(fresh, placedBefore, links)) continue;
        chosen = item;
        break;
      }
      joinCount += 1;
      if (chosen === null) return { ring: null, reason: `every join into ${stationName(chunk.station)} crosses the town` };
      chosen = { ...chosen, joins: paintAcceptedRoadJoin(family, chosen.joins) };
    }
    forward.push(chosen);
    const length = chosen.joins.reduce((sum, spec) => sum + spec.length, 0) + chunkLength(chunk);
    pose = chunkExit(chunk, advance(pose, chosen.joins)).pose;
    travelled += length;
    socket = chunk.exit;
  }

  // -- The closing road, on the far side of town ----------------------------
  const fromSocket = socket!;
  const toFamily = backward[0].joins[0];
  const toSocket: Socket = { surface: toFamily.surface, halfWidth: toFamily.halfWidth };
  const closeFamily = familiesBetween(fromSocket, toSocket)[0];
  if (closeFamily === undefined) return { ring: null, reason: 'no legible road can close the ring' };
  const backPlaced = backwardPlaced(backward);
  const forwardEnd = forwardPlaced().find((segment) => segment.spec.id === forward[forward.length - 1].chunk.exitId)!.exit;
  const rise = backPlaced[0].entry.position.y - forwardEnd.position.y;
  const tried: SegmentSpec[][] = [];
  const id = (part: string) => `close-${part}@c`;
  for (const radius of [closeFamily.radius, closeFamily.radius * 1.5, closeFamily.radius * 2.5]) {
    for (const option of dubins(pose, home, radius)) {
      if (Math.abs(option.turns[0]) > Math.PI * 1.1 || Math.abs(option.turns[1]) > Math.PI * 1.1) continue;
      // Exact or nothing: a sliver is refused rather than trimmed, because a
      // trimmed arc is a heading error the whole second half would inherit.
      const parts = [Math.abs(option.turns[0]) * radius, option.straight, Math.abs(option.turns[1]) * radius].map(settled);
      if (parts.some((part) => part > 1e-6 && part < MIN_PART)) continue;
      const specs: SegmentSpec[] = [];
      if (parts[0] > 1e-6) specs.push(joinSpec(closeFamily, id('a'), parts[0], Math.sign(option.turns[0]) / radius));
      if (parts[1] > 1e-6) specs.push(joinSpec(closeFamily, id('b'), parts[1], 0));
      if (parts[2] > 1e-6) specs.push(joinSpec(closeFamily, id('c'), parts[2], Math.sign(option.turns[1]) / radius));
      if (specs.length === 0) continue;
      const length = specs.reduce((sum, spec) => sum + spec.length, 0);
      if (1.5 * Math.abs(rise) / length > CLOSURE_MAX_GRADE) continue;
      tried.push(specs.map((spec) => ({ ...spec, climb: rise * spec.length / length })));
    }
  }
  for (const radius of [closeFamily.radius, closeFamily.radius * 1.5]) {
    for (const turns of threeArcs(pose, home, radius)) {
      if (turns.some((turn) => Math.abs(turn) > Math.PI * 1.1)) continue;
      if (turns.some((turn) => Math.abs(turn) * radius > 1e-6 && Math.abs(turn) * radius < MIN_PART)) continue;
      const specs = turns.filter((turn) => Math.abs(turn) * radius > 1e-6).map((turn, k) =>
        joinSpec(closeFamily, id(['a', 'b', 'c'][k]), settled(Math.abs(turn) * radius), Math.sign(turn) / radius));
      if (specs.length === 0) continue;
      const length = specs.reduce((sum, spec) => sum + spec.length, 0);
      if (1.5 * Math.abs(rise) / length > CLOSURE_MAX_GRADE) continue;
      tried.push(specs.map((spec) => ({ ...spec, climb: rise * spec.length / length })));
    }
  }
  tried.sort((x, y) => settled(x.reduce((s, spec) => s + spec.length, 0)) - settled(y.reduce((s, spec) => s + spec.length, 0)));
  let closure: SegmentSpec[] | null = null;
  for (const specs of tried) {
    const whole = assemble(specs);
    const placed = placeGraph({ main: whole.main, branches: whole.branches }, { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    const ids = new Set(specs.map((spec) => spec.id));
    const fresh = placed.filter((segment) => ids.has(segment.spec.id));
    const others = placed.filter((segment) => !ids.has(segment.spec.id));
    if (!acceptable(fresh, others, whole.links)) continue;
    closure = paintAcceptedRoadJoin(closeFamily, specs);
    break;
  }
  if (closure === null) {
    const whole = assemble(tried[0] ?? []);
    return { ring: null, reason: `the two halves of the town cannot meet (${tried.length} roads tried)`, partial: { main: whole.main, branches: whole.branches } };
  }

  // -- The ring as data -------------------------------------------------------
  const whole = assemble(closure);
  const graph = { main: whole.main, branches: whole.branches };
  const placed = placeGraph(graph, { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  const last = placed.find((segment) => segment.spec.id === backward[backward.length - 1].chunk.exitId)!.exit;
  if (Math.hypot(last.position.x, last.position.z) > 0.05 || Math.abs(last.headingY - TAU) > 1e-4) {
    return { ring: null, reason: `the ring misses the plaza by ${Math.hypot(last.position.x, last.position.z).toFixed(2)} m` };
  }

  const throughIds: string[] = [];
  const pieceOf = new Map<string, string>();
  const quarterOf = new Map<string, RingQuarter>();
  const beats: TownRing['beats'] = [];
  const blocks: BlockLayout[] = [];
  const shortcuts: TownRing['shortcuts'] = [];
  const jumps: TownRing['jumps'] = [];
  const streetLoops: TownRing['streetLoops'] = [];
  const stations: string[] = [];
  const record = (item: Laid, joinQuarter: RingQuarter): void => {
    for (const spec of item.joins) { throughIds.push(spec.id); pieceOf.set(spec.id, `join-${spec.id.split('@')[1]}`); quarterOf.set(spec.id, joinQuarter); }
    const chunk = item.chunk;
    const piece = chunk.block !== undefined ? `city-${chunk.block.district}` : `${chunk.beat!.piece.id}@${chunk.beat!.instance}`;
    for (const spec of [...chunk.specs, ...chunk.branches.flatMap((branch) => branch.specs)]) {
      pieceOf.set(spec.id, piece); quarterOf.set(spec.id, chunk.station.quarter);
    }
    throughIds.push(...chunk.throughIds);
    stations.push(stationName(chunk.station));
    if (chunk.block !== undefined) {
      blocks.push(chunk.block);
      shortcuts.push(...chunk.block.shortcuts);
      streetLoops.push(...chunk.block.loops);
    }
    if (chunk.beat !== undefined) {
      beats.push(chunk.beat);
      if (chunk.beat.piece.id === 'kicker') {
        jumps.push({ name: `the kicker (${chunk.beat.instance})`, lipId: `kicker-run@${chunk.beat.instance}`, landingId: `kicker-land@${chunk.beat.instance}` });
      }
    }
  };
  for (const item of forward) record(item, item.chunk.station.quarter);
  for (const spec of closure) { throughIds.push(spec.id); pieceOf.set(spec.id, 'closure'); quarterOf.set(spec.id, 'park'); }
  for (const item of backward) record(item, item.chunk.station.quarter);
  const links = whole.links;
  const lastId = backward[backward.length - 1].chunk.exitId;
  links.push([lastId, graph.main[0].id]);
  for (const shortcut of shortcuts) links.push([shortcut.exitId, shortcut.rejoinId]);
  shortcuts.push({ name: 'continuous town return', fromId: graph.main[0].id, exitId: lastId, rejoinId: graph.main[0].id });
  streetLoops.push({ main: [...throughIds], alternate: [] });

  return {
    ring: {
      graph, throughIds, beats, blocks, closureIds: closure.map((spec) => spec.id), shortcuts, jumps,
      streetLoops, pieceOf, quarterOf, stations, links,
    },
    reason: '',
  };
}

function turnOf(chunk: Chunk): number {
  return relativeOf(chunk.specs, chunk.branches, chunk.exitId).turn;
}

function chunkLength(chunk: Chunk): number {
  const ids = new Set(chunk.throughIds);
  let total = 0;
  for (const spec of [...chunk.specs, ...chunk.branches.flatMap((branch) => branch.specs)]) if (ids.has(spec.id)) total += spec.length;
  return total;
}

function stationName(station: Station): string {
  return station.kind === 'block' ? `${station.district} block` : station.piece.name;
}

function rotate<T>(list: readonly T[], by: number): T[] {
  return [...list.slice(by), ...list.slice(0, by)];
}

/** Plain-data loops for the plan. */
export function ringStreetLoops(ring: TownRing): NonNullable<LevelPlan['streetLoops']> {
  return ring.streetLoops.map((loop) => ({ main: [...loop.main], alternate: [...loop.alternate] }));
}
