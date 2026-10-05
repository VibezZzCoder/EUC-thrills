/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { RouteSign } from '../data/routeSigns.ts';
import type { LevelPlan } from './plan.ts';
import type { ParkSignage, SignedFeature } from './parkSignage.ts';
import { turnArrowsBySegment, type TurnArrow } from './parkTurnArrows.ts';
import { centrelineAt, headingAt, type PlacedSegment, type SegmentMarking } from './segments.ts';

/** Preserve the tip and the route's actual lateral centre; contract the cue. */
export function contractCue(
  run: SegmentMarking, endS: number, centreT: number, factor: number,
): SegmentMarking {
  if (!(factor > 0 && factor <= 1)) throw new Error(`invalid instruction scale ${factor}`);
  return { ...run, ...(factor === 1 ? {} : { glyphScale: (run.glyphScale ?? 1) * factor }),
    path: run.path.map(point => ({
    s: endS + (point.s - endS) * factor,
    t: centreT + (point.t - centreT) * factor,
  })) };
}

function poseAt(placed: readonly PlacedSegment[], distance: number) {
  const metres = placed.reduce((sum, each) => sum + each.spec.length, 0);
  let s = ((distance % metres) + metres) % metres;
  for (const each of placed) {
    if (s <= each.spec.length) {
      const point = centrelineAt(each.entry, each.spec, s);
      return { x: point.x, z: point.z, headingY: headingAt(each.entry, each.spec, s) };
    }
    s -= each.spec.length;
  }
  throw new Error('empty or incomplete lap');
}

/** Add face data AFTER the builder, so the pole/collider placement is untouched. */
export function switchbackRouteSigns(
  plan: LevelPlan, placed: readonly PlacedSegment[], signage: ParkSignage,
  features: readonly SignedFeature[],
): readonly RouteSign[] {
  const byFeature = new Map(features.map(feature => [feature.id, feature]));
  const bySegment = new Map(placed.map(each => [each.spec.id, each]));
  const used = new Set<number>();
  return signage.signs.map((sign): RouteSign => {
    const feature = byFeature.get(sign.feature);
    const host = bySegment.get(sign.segment);
    if (!feature || !host) throw new Error(`unresolved route sign ${sign.feature}`);
    if (feature.technicalSide !== 1 || feature.bypassSide !== -1
      || !(feature.technicalT > 0 && feature.bypassT < 0)) {
      throw new Error(`${sign.feature} no longer has the authored left technical/right safe choice`);
    }
    const point = centrelineAt(host.entry, host.spec, sign.post.s);
    const h = headingAt(host.entry, host.spec, sign.post.s);
    const post = { x: point.x + Math.cos(h) * sign.post.t,
      z: point.z - Math.sin(h) * sign.post.t };
    const matches = (plan.props ?? []).map((prop, index) => ({ prop, index }))
      .filter(({ prop }) => prop.kind === 'signpost'
        && Math.hypot(prop.position.x - post.x, prop.position.z - post.z) < 1e-5);
    if (matches.length !== 1 || used.has(matches[0]!.index)) {
      throw new Error(`${sign.feature} requires exactly one surviving original signpost`);
    }
    const propIndex = matches[0]!.index;
    used.add(propIndex);
    // Read BEFORE the first paint, following the real lap through its bends.
    // Twelve metres is an aim point, not a claimed readability distance.
    const approachDistance = sign.lapDistance - (sign.toS - sign.fromS) - 12;
    const approach = poseAt(placed, approachDistance);
    return { feature: sign.feature, propIndex,
      rotationY: Math.atan2(approach.x - post.x, approach.z - post.z),
      upper: { word: feature.id === 'kicker' ? 'AIR' : 'TECH', side: -1 },
      lower: { word: 'SAFE', side: 1 }, approach, approachDistance,
      commitDistance: sign.commitDistance,
      technicalT: feature.technicalT, safeT: feature.bypassT };
  });
}

export interface LapTurnCue {
  readonly approachSegment: string;
  readonly bendSegment: string;
  readonly exitSegment: string;
  readonly turn: 'left' | 'right';
}

/** Smaller existing bend arrows plus one forward confirmation after each bend.
 * These are glyphs on original dirt; they create no bands, blocks or props. */
export function switchbackLapCues(
  arrows: readonly TurnArrow[], placed: readonly PlacedSegment[],
): { readonly markings: ReadonlyMap<string, readonly SegmentMarking[]>;
  readonly turns: readonly LapTurnCue[] } {
  const markings = new Map<string, SegmentMarking[]>();
  const turns = new Map<string, LapTurnCue>();
  const add = (id: string, run: SegmentMarking) => {
    const list = markings.get(id) ?? [];
    list.push({ ...run, support: 'compactTrail', paint: 'path' });
    markings.set(id, list);
  };
  for (const arrow of arrows) {
    const index = placed.findIndex(each => each.spec.id === arrow.segment);
    if (index < 0) throw new Error(`unknown lap-arrow segment ${arrow.segment}`);
    let bendIndex = (index + 1) % placed.length;
    for (let visited = 0; visited < placed.length; visited += 1) {
      if ((placed[bendIndex]!.spec.curvature ?? 0) !== 0) break;
      bendIndex = (bendIndex + 1) % placed.length;
    }
    const bend = placed[bendIndex]!;
    const curvature = bend.spec.curvature ?? 0;
    if (curvature === 0) throw new Error(`no bend follows ${arrow.segment}`);
    const turn = curvature > 0 ? 'left' : 'right';
    if (arrow.turn !== turn) throw new Error(`${arrow.segment} arrow contradicts ${bend.spec.id}`);
    const exit = placed[(bendIndex + 1) % placed.length]!;
    if ((exit.spec.curvature ?? 0) !== 0 || exit.spec.length < 4) {
      throw new Error(`${bend.spec.id} has no clear straight exit for a lap confirmation`);
    }
    turns.set(bend.spec.id, { approachSegment: arrow.segment,
      bendSegment: bend.spec.id, exitSegment: exit.spec.id, turn });
    for (const run of turnArrowsBySegment([arrow]).get(arrow.segment) ?? []) {
      add(arrow.segment, contractCue(run, arrow.s, arrow.t, 0.60));
    }
  }
  for (const cue of turns.values()) {
    // On the rolling half, inside the original corridor, clear of its sockets.
    const exit = placed.find(each => each.spec.id === cue.exitSegment)!;
    const t = -Math.min(3.5, exit.spec.halfWidth / 2);
    add(cue.exitSegment, { role: 'glyph', path: [
      { s: 1.6, t: t + 0.45 }, { s: 3.0, t }, { s: 1.6, t: t - 0.45 },
    ] });
  }
  return { markings, turns: [...turns.values()] };
}
