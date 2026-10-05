/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildLevelPlan } from './buildPlan.ts';
import { parkSignage } from './parkSignage.ts';
import { turnArrowsBySegment } from './parkTurnArrows.ts';
import { MIN_CONTRACTED_GLYPH_WIDTH, markingsOf, placeChain, type SegmentMarking } from './segments.ts';
import { MARKINGS } from '../data/markings.ts';
import { contractCue, switchbackLapCues, switchbackRouteSigns } from './switchbackWayfinding.ts';
import {
  createSwitchbackLevel, SWITCHBACK_CHECKPOINTS, SWITCHBACK_ENTRY_DISTANCE, SWITCHBACK_FIELD_MARGIN,
  SWITCHBACK_FIELD_SPACING, SWITCHBACK_FOREST, SWITCHBACK_GEOMETRY,
  SWITCHBACK_GRAPH, SWITCHBACK_LAP_CUES, SWITCHBACK_LAP_METRES,
  SWITCHBACK_LOOK, SWITCHBACK_PALETTE, SWITCHBACK_SIGNAGE,
  SWITCHBACK_SIGNED_FEATURES, SWITCHBACK_SIGN_PAD_MARGIN, SWITCHBACK_SPAWN,
  SWITCHBACK_SURROUND, SWITCHBACK_TURN_ARROWS, switchbackGroundAt,
} from './switchbackLevel.ts';
import type { RouteSign } from '../data/routeSigns.ts';

const placed = placeChain(SWITCHBACK_GRAPH, SWITCHBACK_SPAWN);
const plan = createSwitchbackLevel();

test('complete smaller letter bars keep the authored scale while malformed or unrelated cutoff changes refuse', () => {
  const stroke: SegmentMarking = { role: 'glyph', support: 'compactTrail',
    path: [{ s: 8, t: -2 }, { s: 8.54, t: -2 }] };
  const contracted = contractCue(stroke, 8.54, -2, 0.65);
  const host = { ...placed[0]!, spec: { ...placed[0]!.spec, markings: [contracted] } };
  const compact = markingsOf(host)[0]!;
  const metres = Math.hypot(compact.points.at(-1)!.x - compact.points[0]!.x,
    compact.points.at(-1)!.z - compact.points[0]!.z);
  assert.ok(Math.abs(metres - 0.351) < 1e-10);
  assert.equal(compact.minRun, 0.325);
  assert.ok(metres > compact.minRun && metres < 0.5, 'complete intentionally smaller bar needs its authored cutoff');
  assert.equal(markingsOf({ ...host, spec: { ...host.spec, markings: [stroke] } })[0]!.minRun, 0.5);
  for (const marking of [{ ...contracted, role: 'centre' }, { ...contracted, support: undefined },
    { ...contracted, glyphScale: 0 }, { ...contracted, glyphScale: NaN }, { ...contracted, glyphScale: 1.01 }]) {
    assert.throws(() => markingsOf({ ...host, spec: { ...host.spec,
      markings: [marking as SegmentMarking] } }), marking.role === 'glyph'
      ? /glyph scale/ : /compactTrail support belongs only to instructional glyphs/);
  }
});

test('a contracted cue paints its strokes as much thinner as its letters are smaller (VIS-3)', () => {
  // 2026-10-03: full-width 0.30 m strokes on 0.65-scale letters merged the
  // step-down warning into a scrawl ('DΛW'); tracking shrank, strokes did not.
  const stroke: SegmentMarking = { role: 'glyph', support: 'compactTrail', path: [{ s: 8, t: -2 }, { s: 9.5, t: -2 }] };
  const width = (marking: SegmentMarking): number =>
    markingsOf({ ...placed[0]!, spec: { ...placed[0]!.spec, markings: [marking] } })[0]!.width;
  assert.equal(width(stroke), MARKINGS.glyphWidth, 'a full-size letter keeps its stroke');
  assert.ok(Math.abs(width(contractCue(stroke, 9.5, -2, 0.65)) - MARKINGS.glyphWidth * 0.65) < 1e-12);
  assert.equal(width(contractCue(stroke, 9.5, -2, 0.4)), MIN_CONTRACTED_GLYPH_WIDTH, 'a legible floor');
  assert.equal(width({ ...stroke, role: 'centre', support: undefined }), MARKINGS.centreWidth, 'lane paint is untouched');
  let contracted = 0;
  for (const segment of placed) for (const marking of segment.spec.markings ?? []) {
    if (marking.role !== 'glyph' || marking.glyphScale === undefined) continue;
    contracted++;
    const painted = width(marking);
    assert.ok(painted <= Math.max(MARKINGS.glyphWidth * marking.glyphScale, MIN_CONTRACTED_GLYPH_WIDTH) + 1e-12
      && painted < MARKINGS.glyphWidth, `${segment.spec.id}: a ${marking.glyphScale} letter keeps a ${painted} m stroke`);
  }
  assert.ok(contracted >= 100, `the venue's DOWN/DROP/TECH/SAFE and advance cues are exercised (${contracted})`);
  assert.ok((plan.markings ?? []).some(mark => mark.width < MARKINGS.glyphWidth), 'the built venue carries the thinner strokes');
});

function choicesCorrect(signs: readonly RouteSign[]): boolean {
  return signs.length === SWITCHBACK_SIGNED_FEATURES.length && signs.every(sign => {
    const feature = SWITCHBACK_SIGNED_FEATURES.find(each => each.id === sign.feature);
    return feature !== undefined && feature.technicalT === sign.technicalT
      && feature.bypassT === sign.safeT && sign.technicalT > 0 && sign.safeT < 0
      && sign.upper.side === -1 && sign.lower.side === 1
      && sign.lower.word === 'SAFE'
      && sign.upper.word === (feature.id === 'kicker' ? 'AIR' : 'TECH');
  });
}

test('every actual fork names left technical/right rolling safe; kicker is AIR', () => {
  const signs = plan.routeSigns!;
  assert.ok(choicesCorrect(signs));
  assert.equal(new Set(signs.map(sign => sign.propIndex)).size, 9);
  assert.equal(signs.filter(sign => sign.upper.word === 'AIR').length, 1);
  assert.equal(signs.find(sign => sign.upper.word === 'AIR')!.feature, 'kicker');
  assert.equal(choicesCorrect(signs.map((sign, i) => i === 0
    ? { ...sign, lower: { ...sign.lower, side: -1 } } : sign)), false, 'reversed SAFE control passed');
  assert.equal(choicesCorrect(signs.map(sign => sign.feature === 'kicker'
    ? { ...sign, upper: { ...sign.upper, word: 'TECH' } } : sign)), false, 'generic kicker control passed');
});

test('readable face normals aim at actual pre-sign lap pose; pole yaw is separate', () => {
  const signs = switchbackRouteSigns(plan, placed, SWITCHBACK_SIGNAGE, SWITCHBACK_SIGNED_FEATURES);
  for (const sign of signs) {
    const prop = plan.props![sign.propIndex]!;
    assert.equal(prop.kind, 'signpost');
    const dx = sign.approach.x - prop.position.x, dz = sign.approach.z - prop.position.z;
    const dot = (dx * Math.sin(sign.rotationY) + dz * Math.cos(sign.rotationY)) / Math.hypot(dx, dz);
    assert.ok(dot > 1 - 1e-12, `${sign.feature} face misses its actual approach`);
    const backwards = (dx * Math.sin(sign.rotationY + Math.PI)
      + dz * Math.cos(sign.rotationY + Math.PI)) / Math.hypot(dx, dz);
    assert.ok(backwards < 0, 'backwards face control passed');
  }
  assert.throws(() => switchbackRouteSigns({ ...plan, props: [] }, placed,
    SWITCHBACK_SIGNAGE, SWITCHBACK_SIGNED_FEATURES), /surviving original signpost/);
});

test('lap arrows follow actual next curvature and repeat forward on each bend exit', () => {
  assert.deepEqual(SWITCHBACK_LAP_CUES.turns.map(cue => cue.bendSegment),
    ['timber-turn', 'rhythm-turn', 'clearing-turn', 'shelf-turn']);
  for (const cue of SWITCHBACK_LAP_CUES.turns) {
    const bend = placed.find(each => each.spec.id === cue.bendSegment)!;
    assert.equal(cue.turn, bend.spec.curvature! > 0 ? 'left' : 'right');
    const confirmation = SWITCHBACK_LAP_CUES.markings.get(cue.exitSegment)!.find(run =>
      run.path.length === 3 && run.path[1]!.s === 3 && run.path[0]!.s === 1.6);
    assert.ok(confirmation, `${cue.exitSegment} has no forward lap confirmation`);
    assert.ok(confirmation.path.every(point => point.t < 0), 'confirmation leaves the rolling half');
  }
  const wrongTurn = SWITCHBACK_TURN_ARROWS.map((arrow, index) => index === 0
    ? { ...arrow, turn: arrow.turn === 'left' ? 'right' as const : 'left' as const } : arrow);
  assert.throws(() => switchbackLapCues(wrongTurn, placed), /contradicts/);
});

test('ground copy contraction preserves warning vocabulary, physical plan and records identity', () => {
  // Reconstruct the frozen r5's original instruction policy. It has exactly
  // the same graph, post search, builder options and physical feature data.
  const original = parkSignage(SWITCHBACK_SIGNED_FEATURES, {
    metres: SWITCHBACK_LAP_METRES, support: 'compactTrail', maxLead: 90,
    segments: SWITCHBACK_GEOMETRY.map(segment => ({ id: segment.id,
      entryDistance: SWITCHBACK_ENTRY_DISTANCE.get(segment.id)!,
      length: segment.length, halfWidth: segment.halfWidth, curvature: segment.curvature,
      ...(segment.id === 'apron' ? { pads: false } : {}) })),
    padMargin: SWITCHBACK_SIGN_PAD_MARGIN, landingPadMargin: SWITCHBACK_SIGN_PAD_MARGIN,
  });
  const turns = turnArrowsBySegment(SWITCHBACK_TURN_ARROWS);
  const baselineGraph = SWITCHBACK_GRAPH.map(segment => ({ ...segment,
    markings: [...(original.markings.get(segment.id) ?? []),
      ...(turns.get(segment.id) ?? []).map(run => ({ ...run,
        support: 'compactTrail' as const, paint: 'path' as const }))] }));
  const baseline = buildLevelPlan(baselineGraph, {
    id: 'switchback-r5', spawn: SWITCHBACK_SPAWN, surround: { ...SWITCHBACK_SURROUND },
    spacing: SWITCHBACK_FIELD_SPACING, settleBlocks: true, groundAt: switchbackGroundAt,
    fieldMargin: SWITCHBACK_FIELD_MARGIN, checkpoints: SWITCHBACK_CHECKPOINTS,
    props: SWITCHBACK_FOREST, palette: SWITCHBACK_PALETTE, look: SWITCHBACK_LOOK,
  });
  for (const key of ['id', 'spawn', 'surround', 'heightfield', 'segments', 'solids', 'checkpoints', 'lap', 'props'] as const) {
    assert.deepEqual(plan[key], baseline[key], `${key} moved with presentation-only signs`);
  }
  assert.equal(SWITCHBACK_SIGNAGE.boardwalkArea, 0);
  assert.equal(SWITCHBACK_SIGNAGE.bands.size, 0);
  assert.deepEqual([...SWITCHBACK_SIGNAGE.props], [...original.props], 'original post positions changed');
  assert.deepEqual(SWITCHBACK_SIGNAGE.signs.map(sign => [sign.segment, sign.fromS, sign.toS, sign.post,
    sign.lead, sign.readMetres]), original.signs.map(sign => [sign.segment, sign.fromS, sign.toS,
    sign.post, sign.lead, sign.readMetres]));
  assert.equal([...SWITCHBACK_SIGNAGE.markings.values()].flat().length,
    [...original.markings.values()].flat().length, 'a warning stroke was removed');
  const lengthOf = (runs: typeof original.markings) => [...runs.values()].flat().reduce((sum, run) =>
    sum + run.path.slice(1).reduce((length, point, index) => length + Math.hypot(
      point.s - run.path[index]!.s, point.t - run.path[index]!.t), 0), 0);
  assert.ok(lengthOf(SWITCHBACK_SIGNAGE.markings) < lengthOf(original.markings),
    'oversize supporting instructions were not contracted');
  const movedHeight = { ...baseline.heightfield,
    heights: baseline.heightfield.heights.map((value, index) => value + (index === 0 ? 0.01 : 0)) };
  assert.notDeepEqual(plan.heightfield, movedHeight, 'physical mutation control passed');
});
