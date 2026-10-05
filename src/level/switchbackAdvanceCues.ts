/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { MARKINGS, PARK_SIGN_WORDS, SIGNS } from '../data/markings.ts';
import { ROUTE_ADVANCE as CUE } from '../data/routeAdvance.ts';
import { LETTER_ASPECT, wordLength, wordStrokes } from '../shared/letterPaths.ts';
import { ribbonQuads } from '../shared/markingRibbon.ts';
import { MPS_PER_MPH, SIGN_PANE_HALF_TANGENT, signLeadMetres,
  type ParkSignage, type SignedFeature } from './parkSignage.ts';
import { centrelineAt, collidersOf, headingAt, markingsOf,
  type PlacedSegment, type SegmentMarking } from './segments.ts';

type Point = { readonly x: number; readonly z: number };
type LocalPoint = { readonly s: number; readonly t: number };
type Word = 'TECH' | 'AIR' | 'SAFE';
type FeatureGroup = readonly SignedFeature[];
export type AdvanceCueLayout = 'stacked-arrows' | 'inline-arrows';

// Literal-owned copy uses the shared stroke alphabet. The ground vocabulary
// amendment is explicit in data/markings.ts, not inferred from a font or image.
const WORDS = {
  TECH: wordStrokes('TECH', 1, { tracking: CUE.tracking }),
  AIR: wordStrokes('AIR', 1, { tracking: CUE.tracking }),
  SAFE: wordStrokes('SAFE', 1, { tracking: CUE.tracking }),
} as const;
const ROW_LENGTH = CUE.letterAlong + CUE.wordArrowGap + CUE.arrowAlong;
export const ADVANCE_CUE_LENGTH = ROW_LENGTH * 2 + CUE.rowGap;
export const INLINE_ADVANCE_CUE_LENGTH = CUE.letterAlong * 2 + CUE.rowGap;
const cueLayout = (word: 'TECH' | 'AIR'): AdvanceCueLayout => word === 'AIR' ? 'inline-arrows' : 'stacked-arrows';
const cueLength = (word: 'TECH' | 'AIR') => word === 'AIR' ? INLINE_ADVANCE_CUE_LENGTH : ADVANCE_CUE_LENGTH;
const wordHalfWidth = (word: Word) => wordLength(word, 1, CUE.tracking) * CUE.letterAcross / LETTER_ASPECT / 2;
// The reserved gutter: its inner edge keeps paintGap from a full-width stroke.
const inlineArrowCentre = () => -(wordHalfWidth('SAFE') + MARKINGS.glyphWidth
  + CUE.paintGap + CUE.inlineArrowAcross / 2);
/** Letters and arrows share one type weight: the words' own contraction. */
const GLYPH_SCALE = CUE.letterAcross / SIGNS.glyphAcross;
const STROKE = MARKINGS.glyphWidth * GLYPH_SCALE;

export interface AdvanceCue {
  readonly features: readonly string[];
  readonly upperWord: 'TECH' | 'AIR';
  readonly lowerWord: 'SAFE';
  readonly layout: AdvanceCueLayout;
  readonly length: number;
  readonly segment: string;
  readonly fromT: number;
  readonly toT: number;
  readonly fromS: number;
  readonly toS: number;
  readonly fromDistance: number;
  readonly toDistance: number;
  readonly halfWidth: number;
  /** Arc-length bearing check only. Actual pixels own legibility acceptance. */
  readonly readMetres: number;
  readonly requiredReadMetres: number;
  readonly readStartDistance: number;
  readonly readEndDistance: number;
  readonly placementAudit: { readonly candidates: number; readonly sourceSurface: number;
    readonly blocks: number; readonly retainedPaint: number; readonly bearing: number;
    readonly bestReadMetres: number; readonly minimumEnd: number; readonly maximumEnd: number };
  readonly leads: readonly { readonly feature: string; readonly metres: number;
    readonly requiredMetres: number; readonly originalWarningEnd: number }[];
  readonly runs: readonly SegmentMarking[];
  readonly sourceTriangles: number;
}

export interface AdvanceCues {
  readonly cues: readonly AdvanceCue[];
  readonly markings: ReadonlyMap<string, readonly SegmentMarking[]>;
  readonly runCount: number;
  readonly sourceTriangles: number;
  readonly addedDrawCalls: 0;
}

function wordRuns(word: Word, nearS: number): SegmentMarking[] {
  const scale = CUE.letterAcross / LETTER_ASPECT;
  const half = wordLength(word, 1, CUE.tracking) * scale / 2;
  return WORDS[word].map(stroke => ({ role: 'glyph', paint: 'road',
    support: 'compactTrail', glyphScale: GLYPH_SCALE,
    path: stroke.map(([x, y]) => ({ s: nearS + CUE.letterAlong * (1 - y),
      t: half - x * scale })) }));
}

/** A shaft and a two-barb head at the letters' weight. +t is the arriving
 * rider's LEFT. `segments.markingsOf` draws every leg exactly, so the head is
 * a head rather than the one bar a whole-run ribbon used to cut across it. */
function arrowRuns(start: LocalPoint, tip: LocalPoint, barb: number, spread: number): SegmentMarking[] {
  const angle = Math.atan2(tip.t - start.t, tip.s - start.s);
  const wing = (direction: -1 | 1): LocalPoint => ({
    s: tip.s + barb * Math.cos(angle + Math.PI + direction * spread),
    t: tip.t + barb * Math.sin(angle + Math.PI + direction * spread),
  });
  const run = (path: LocalPoint[]): SegmentMarking => ({ role: 'glyph', paint: 'road',
    support: 'compactTrail', glyphScale: GLYPH_SCALE, path });
  return [run([start, tip]), run([wing(-1), tip, wing(1)])];
}

/** A stacked row's arrow: across the trail, midway between this row's cap and
 * the next row's baseline, so bare ground (`arrowClear` or more) separates it
 * from both words. The last row keeps the same offset inside its band. */
function stackedArrow(capS: number, side: -1 | 1): SegmentMarking[] {
  const s = capS + (CUE.wordArrowGap + CUE.arrowAlong + CUE.rowGap) / 2;
  return arrowRuns({ s, t: -side * CUE.arrowAcross / 2 }, { s, t: side * CUE.arrowAcross / 2 },
    CUE.arrowBarb, CUE.arrowSpread);
}

/** A kicker row's arrow: up the row inside the reserved right gutter, its
 * inner stroke `arrowClear` off SAFE's letters and its outer stroke inside the
 * gutter's bounds. SAFE runs out to the right; AIR runs back in, to the left. */
function inlineArrow(rowS: number, side: -1 | 1): SegmentMarking[] {
  const outer = advanceCueBounds('AIR').fromT + MARKINGS.glyphWidth / 2;
  const inner = -(wordHalfWidth('SAFE') + STROKE + CUE.arrowClear);
  const s = rowS + (CUE.letterAlong - CUE.inlineArrowAlong) / 2;
  const [from, to] = side === -1 ? [inner, outer] : [outer, inner];
  return arrowRuns({ s, t: from }, { s: s + CUE.inlineArrowAlong, t: to },
    CUE.inlineArrowBarb, CUE.inlineArrowSpread);
}

export function advanceCueRuns(word: 'TECH' | 'AIR', nearS: number): SegmentMarking[] {
  const inline = cueLayout(word) === 'inline-arrows';
  const secondRow = nearS + (inline ? CUE.letterAlong : ROW_LENGTH) + CUE.rowGap;
  const arrow = (rowS: number, side: -1 | 1) => inline ? inlineArrow(rowS, side)
    : stackedArrow(rowS + CUE.letterAlong, side);
  return [
    ...wordRuns(word, nearS), ...arrow(nearS, 1),
    ...wordRuns('SAFE', secondRow), ...arrow(secondRow, -1),
  ];
}

/** The arrow footprints every cue was first placed against (R15/V4: a 0.75 m
 * diagonal, 0.85 m across, 0.62 m swept head; 0.55/0.40 m in the kicker's
 * gutter), as whole un-split runs. The placement search reads them together
 * with the drawn paint, so redrawing an arrow inside its band can never slide
 * a cue to a spot the original search refused; the drawn arrows must still
 * clear every neighbour where the cue lands. Never painted. */
export function advanceCueReservation(word: 'TECH' | 'AIR', nearS: number): SegmentMarking[] {
  const inline = cueLayout(word) === 'inline-arrows';
  const secondRow = nearS + (inline ? CUE.letterAlong : ROW_LENGTH) + CUE.rowGap;
  const arrow = (rowS: number, side: -1 | 1): SegmentMarking[] => {
    const s0 = rowS + (inline ? (CUE.letterAlong - CUE.arrowAlong) / 2 : CUE.letterAlong + CUE.wordArrowGap);
    const across = inline ? CUE.reservation.inlineAcross : CUE.reservation.across;
    const centreT = inline ? inlineArrowCentre() : 0;
    const start = { s: s0, t: centreT - side * across / 2 };
    const tip = { s: s0 + CUE.arrowAlong, t: centreT + side * across / 2 };
    const angle = Math.atan2(tip.t - start.t, tip.s - start.s);
    const barb = inline ? CUE.reservation.inlineBarb : CUE.reservation.barb;
    const wing = (direction: -1 | 1): LocalPoint => ({
      s: tip.s + barb * Math.cos(angle + Math.PI + direction * CUE.reservation.spread),
      t: tip.t + barb * Math.sin(angle + Math.PI + direction * CUE.reservation.spread),
    });
    return [{ role: 'glyph', path: [start, tip] }, { role: 'glyph', path: [wing(-1), tip, wing(1)] }];
  };
  return [...arrow(nearS, 1), ...arrow(secondRow, -1)];
}

/** Full word boxes AND arrow ribbons. The inline gutter is asymmetric: using
 * its maximum radius on both sides would invent an unpainted inner-bend box. */
export function advanceCueBounds(word: 'TECH' | 'AIR'): { fromT: number; toT: number } {
  const wordHalf = Math.max(wordHalfWidth(word), wordHalfWidth('SAFE')) + MARKINGS.glyphWidth / 2;
  return { fromT: cueLayout(word) === 'inline-arrows'
    ? inlineArrowCentre() - CUE.inlineArrowAcross / 2 - MARKINGS.glyphWidth / 2 : -wordHalf,
    toT: wordHalf };
}

function worldPoint(host: PlacedSegment, p: LocalPoint): Point {
  const spine = centrelineAt(host.entry, host.spec, p.s);
  const h = headingAt(host.entry, host.spec, p.s);
  return { x: spine.x + Math.cos(h) * p.t, z: spine.z - Math.sin(h) * p.t };
}

function closestPoint(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const u = length2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2));
  return Math.hypot(p.x - a.x - u * dx, p.z - a.z - u * dz);
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

/** Complete segment separation, including a crossing between sparse samples. */
export function lineSeparation(a: Point, b: Point, c: Point, d: Point): number {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  // Strict crossing here; endpoint and collinear cases are caught by distances.
  if (abC * abD < 0 && cdA * cdB < 0) return 0;
  return Math.min(closestPoint(a, c, d), closestPoint(b, c, d),
    closestPoint(c, a, b), closestPoint(d, a, b));
}

function paintedSegments(host: PlacedSegment, runs: readonly SegmentMarking[]) {
  // A bevel join lies inside its legs' round ends, which already measure it.
  return markingsOf({ ...host, spec: { ...host.spec, markings: runs } }).filter(run => run.join !== true)
    .flatMap(run => run.points.slice(1).map((b, i) => ({ a: run.points[i]!, b,
      radius: run.width / 2 })));
}

function ribbonsConflict(first: ReturnType<typeof paintedSegments>[number], second: ReturnType<typeof paintedSegments>[number]): boolean {
  const gap = first.radius + second.radius + CUE.paintGap;
  const dx = Math.max(0, Math.min(first.a.x, first.b.x) - Math.max(second.a.x, second.b.x),
    Math.min(second.a.x, second.b.x) - Math.max(first.a.x, first.b.x));
  const dz = Math.max(0, Math.min(first.a.z, first.b.z) - Math.max(second.a.z, second.b.z),
    Math.min(second.a.z, second.b.z) - Math.max(first.a.z, first.b.z));
  return dx * dx + dz * dz <= gap * gap
    && lineSeparation(first.a, first.b, second.a, second.b) < gap;
}

function segmentHitsBox(a: Point, b: Point, box: ReturnType<typeof collidersOf>[number], radius: number): boolean {
  const c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
  const reach = radius + MARKINGS.colliderClearance;
  const rx = Math.abs(c) * box.halfExtents.x + Math.abs(s) * box.halfExtents.z + reach;
  const rz = Math.abs(s) * box.halfExtents.x + Math.abs(c) * box.halfExtents.z + reach;
  if (Math.max(a.x, b.x) < box.centre.x - rx || Math.min(a.x, b.x) > box.centre.x + rx
    || Math.max(a.z, b.z) < box.centre.z - rz || Math.min(a.z, b.z) > box.centre.z + rz) return false;
  const local = (p: Point) => ({ x: (p.x - box.centre.x) * c - (p.z - box.centre.z) * s,
    z: (p.x - box.centre.x) * s + (p.z - box.centre.z) * c });
  const p = local(a), q = local(b);
  // An expanded rectangle is conservative at corners, never a partial ribbon.
  let enter = 0, exit = 1;
  for (const key of ['x', 'z'] as const) {
    const half = box.halfExtents[key] + radius + MARKINGS.colliderClearance;
    const delta = q[key] - p[key];
    if (Math.abs(delta) < 1e-12) {
      if (Math.abs(p[key]) > half) return false;
      continue;
    }
    const u = (-half - p[key]) / delta, v = (half - p[key]) / delta;
    enter = Math.max(enter, Math.min(u, v)); exit = Math.min(exit, Math.max(u, v));
    if (enter > exit) return false;
  }
  return true;
}

/** Source-surface interval check. The finished builder still must prove every
 * complete ribbon on the actual field; authoring permission cannot waive it. */
function clearSourceSurface(host: PlacedSegment, fromS: number, toS: number, fromT: number, toT: number): boolean {
  const halfWidth = Math.max(Math.abs(fromT), Math.abs(toT));
  if (host.spec.surface !== 'dirt') return false;
  if (halfWidth + MARKINGS.colliderClearance > host.spec.halfWidth) return false;
  return !(host.spec.bands ?? []).some(band => band.surface !== 'dirt'
    && (band.fromS ?? 0) < toS && (band.toS ?? host.spec.length) > fromS
    && band.from < toT && band.to > fromT);
}

/** Add a bounded central instruction within the ORIGINAL warning/lead window.
 * Existing warnings and posts are read as immutable obstacles, never moved.
 * Same-choice neighbours share one cue when all their lead windows overlap. */
export function switchbackAdvanceCues(
  placed: readonly PlacedSegment[], signage: ParkSignage,
  features: readonly SignedFeature[], maxLead: number,
): AdvanceCues {
  for (const word of ['TECH', 'SAFE'] as const) {
    if (!(PARK_SIGN_WORDS as readonly string[]).includes(word)) throw new Error(`ground vocabulary lacks ${word}`);
  }
  if (!(maxLead > 0) || !Number.isFinite(maxLead) || placed.length === 0) throw new Error('no finite advance-cue lap');
  const entries = new Map<string, number>();
  let metres = 0;
  for (const host of placed) { entries.set(host.spec.id, metres); metres += host.spec.length; }
  const bearingHalfTangent = Math.tan(Math.atan(SIGN_PANE_HALF_TANGENT) - CUE.portraitBearingInset);
  if (!(bearingHalfTangent > 0)) throw new Error('advance-cue bearing inset consumes the portrait cone');
  const poseAt = (distance: number) => {
    const d = ((distance % metres) + metres) % metres;
    const host = placed.find(each => d <= entries.get(each.spec.id)! + each.spec.length + 1e-9)!;
    const s = d - entries.get(host.spec.id)!;
    return { ...worldPoint(host, { s, t: 0 }), h: headingAt(host.entry, host.spec, s) };
  };
  const signByFeature = new Map(signage.signs.map(sign => [sign.feature, sign]));
  const wordFor = (group: FeatureGroup) => group[0]!.id === 'kicker' ? 'AIR' as const : 'TECH' as const;
  const bounds = (group: FeatureGroup) => ({
    // maxLead is measured to the LAST mark, exactly as parkSignage.findPad.
    // Its sMin = commitment - copyLength - maxLead permits the first row
    // farther back; adding cue length here inverted that existing contract.
    minimum: Math.max(...group.map(feature => feature.lipS - maxLead)),
    maximum: Math.min(...group.map(feature => Math.min(
      signByFeature.get(feature.id)!.lapDistance, feature.lipS - signLeadMetres(feature.approachMph * MPS_PER_MPH)))),
  });
  const groups: SignedFeature[][] = [];
  for (const feature of features) {
    if (feature.technicalSide !== 1 || feature.bypassSide !== -1 || !(feature.technicalT > 0 && feature.bypassT < 0)
      || !signByFeature.has(feature.id)) throw new Error(`unresolved left technical/right safe feature ${feature.id}`);
    const last = groups.at(-1), combined = last === undefined ? [feature] : [...last, feature];
    if (last !== undefined && wordFor(last) === wordFor([feature]) && bounds(combined).minimum <= bounds(combined).maximum) {
      last.push(feature);
    } else groups.push([feature]);
  }
  const boxes = placed.flatMap(collidersOf);
  const existing = placed.flatMap(host => paintedSegments(host, host.spec.markings ?? []));
  const cues: AdvanceCue[] = [], markings = new Map<string, SegmentMarking[]>();
  let runCount = 0, sourceTriangles = 0;
  for (const group of groups) {
    const word = wordFor(group), interval = bounds(group), length = cueLength(word);
    const { fromT, toT } = advanceCueBounds(word);
    const halfWidth = Math.max(Math.abs(fromT), Math.abs(toT));
    const audit = { candidates: 0, sourceSurface: 0, blocks: 0, retainedPaint: 0,
      bearing: 0, bestReadMetres: 0, minimumEnd: interval.minimum, maximumEnd: interval.maximum };
    const requiredReadMetres = SIGNS.readSeconds * Math.max(...group.map(feature => feature.approachMph * MPS_PER_MPH));
    let best: AdvanceCue | undefined;
    for (const host of placed) {
      // The apron remains a grid/arrival road; source surface is not dirt.
      const entry = entries.get(host.spec.id)!;
      const maximum = Math.min(host.spec.length - CUE.socketMargin, interval.maximum - entry);
      const minimum = Math.max(CUE.socketMargin + length, interval.minimum - entry);
      for (let toS = maximum; toS >= minimum - 1e-9; toS -= CUE.searchStep) {
        const fromS = toS - length, toDistance = entry + toS;
        if (best !== undefined && toDistance <= best.toDistance) break;
        audit.candidates += 1;
        if (!clearSourceSurface(host, fromS, toS, fromT, toT)) { audit.sourceSurface += 1; continue; }
        const runs = advanceCueRuns(word, fromS);
        const candidate = paintedSegments(host, [...runs, ...advanceCueReservation(word, fromS)]);
        if (candidate.some(run => boxes.some(box => segmentHitsBox(run.a, run.b, box, run.radius)))) {
          audit.blocks += 1; continue;
        }
        if (candidate.some(run => existing.some(old => ribbonsConflict(run, old)))) {
          audit.retainedPaint += 1; continue;
        }
        // All four word-box corners plus arrow tips, not only a chevron tip.
        const points = [fromS, toS, fromS + CUE.letterAlong,
          fromS + (cueLayout(word) === 'inline-arrows' ? CUE.letterAlong : ROW_LENGTH)
            + CUE.rowGap + CUE.letterAlong]
          .flatMap(s => [fromT, toT].map(t => worldPoint(host, { s, t })));
        let readMetres = 0, spellStart: number | undefined;
        let readStartDistance = 0, readEndDistance = 0;
        for (let back = SIGNS.readMetres; back >= length; back -= CUE.readStep) {
          const rider = poseAt(toDistance - back);
          const inView = points.every(point => {
            const dx = point.x - rider.x, dz = point.z - rider.z;
            const forward = dx * Math.sin(rider.h) + dz * Math.cos(rider.h);
            const lateral = dx * Math.cos(rider.h) - dz * Math.sin(rider.h);
            return forward > 1 && Math.abs(lateral) <= forward * bearingHalfTangent;
          });
          const distance = toDistance - back;
          if (!inView) spellStart = undefined;
          else {
            spellStart ??= distance;
            // One visible point grants zero metres; only endpoint separation
            // counts. This removes v1's one-sample credit without moving 1.5 s.
            const span = distance - spellStart;
            if (span > readMetres) {
              readMetres = span; readStartDistance = spellStart; readEndDistance = distance;
            }
          }
        }
        audit.bestReadMetres = Math.max(audit.bestReadMetres, readMetres);
        if (readMetres + 1e-9 < requiredReadMetres) { audit.bearing += 1; continue; }
        const cost = markingsOf({ ...host, spec: { ...host.spec, markings: runs } })
          .reduce((sum, run) => sum + ribbonQuads(run.points.map(point => ({ ...point, y: 0 })), run.dash, run.gap) * 2, 0);
        best = { features: group.map(feature => feature.id), upperWord: word, lowerWord: 'SAFE',
          layout: cueLayout(word), length, segment: host.spec.id, fromT, toT, fromS, toS,
          fromDistance: entry + fromS, toDistance, halfWidth, readMetres, requiredReadMetres,
          readStartDistance, readEndDistance, placementAudit: { ...audit }, runs, sourceTriangles: cost,
          leads: group.map(feature => ({ feature: feature.id, metres: feature.lipS - toDistance,
            requiredMetres: signLeadMetres(feature.approachMph * MPS_PER_MPH),
            originalWarningEnd: signByFeature.get(feature.id)!.lapDistance })) };
      }
    }
    if (best === undefined) throw new Error(`no complete central advance cue for ${group.map(feature => feature.id).join(', ')} `
      + `inside its original lead/read window; no cue was silently omitted; ${JSON.stringify(audit)}`);
    cues.push(best); runCount += best.runs.length; sourceTriangles += best.sourceTriangles;
    const list = markings.get(best.segment) ?? []; list.push(...best.runs); markings.set(best.segment, list);
    existing.push(...paintedSegments(placed.find(host => host.spec.id === best.segment)!,
      [...best.runs, ...advanceCueReservation(best.upperWord, best.fromS)]));
  }
  if (cues.length > CUE.maxCues || runCount > CUE.maxRuns || sourceTriangles > CUE.maxTriangles) {
    throw new Error(`advance-cue envelope exceeded: ${cues.length} cues, ${runCount} runs, ${sourceTriangles} source triangles`);
  }
  return { cues, markings, runCount, sourceTriangles, addedDrawCalls: 0 };
}
