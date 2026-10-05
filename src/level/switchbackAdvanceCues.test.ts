/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { MARKINGS, PARK_SIGN_WORDS } from '../data/markings.ts';
import { ROUTE_ADVANCE } from '../data/routeAdvance.ts';
import { ribbonQuads } from '../shared/markingRibbon.ts';
import { buildLevelPlan } from './buildPlan.ts';
import type { ParkSignage, SignedFeature } from './parkSignage.ts';
import { markingsOf, placeChain, placedRunCount, type SegmentMarking, type SegmentSpec } from './segments.ts';
import { advanceCueBounds, advanceCueReservation, advanceCueRuns, INLINE_ADVANCE_CUE_LENGTH, lineSeparation,
  switchbackAdvanceCues } from './switchbackAdvanceCues.ts';
import { createSwitchbackLevel, SWITCHBACK_ADVANCE_CUES, SWITCHBACK_CHECKPOINTS,
  SWITCHBACK_FIELD_MARGIN, SWITCHBACK_FIELD_SPACING, SWITCHBACK_FOREST, SWITCHBACK_GRAPH,
  SWITCHBACK_LOOK, SWITCHBACK_LAP_CUES, SWITCHBACK_PALETTE, SWITCHBACK_SIGNAGE, SWITCHBACK_SIGNED_FEATURES,
  SWITCHBACK_SPAWN, SWITCHBACK_SURROUND, switchbackGroundAt } from './switchbackLevel.ts';

const plan = createSwitchbackLevel();
const placed = placeChain(SWITCHBACK_GRAPH, SWITCHBACK_SPAWN);
const signature = (run: unknown) => JSON.stringify(run);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const length = (points: readonly { x: number; z: number }[]) => points.slice(1)
  .reduce((sum, point, i) => sum + Math.hypot(point.x - points[i]!.x, point.z - points[i]!.z), 0);
// 2026-10-04 (VIS-3-R2): a compact-trail glyph ships one placed run per leg.
const placedRuns = (runs: readonly SegmentMarking[]) => runs.reduce((sum, run) => sum + placedRunCount(run), 0);

test('all nine real choices have six restrained cues; adjacent TECH choices share a warning window', () => {
  const cues = SWITCHBACK_ADVANCE_CUES;
  assert.equal(cues.cues.length, 6);
  assert.deepEqual(cues.cues.map(cue => cue.features), [
    ['ledge', 'gap'], ['skinny', 'stepUp', 'stairs'], ['rhythm'], ['kicker'], ['spinShelf'], ['crest'],
  ]);
  assert.deepEqual(cues.cues.flatMap(cue => cue.features), SWITCHBACK_SIGNED_FEATURES.map(feature => feature.id));
  assert.equal(cues.cues.filter(cue => cue.upperWord === 'AIR').length, 1);
  assert.deepEqual(cues.cues.find(cue => cue.upperWord === 'AIR')!.features, ['kicker']);
  assert.ok(cues.cues.every(cue => cue.lowerWord === 'SAFE'));
  assert.ok(PARK_SIGN_WORDS.includes('TECH') && PARK_SIGN_WORDS.includes('SAFE'));
  assert.equal(cues.runCount, 134);
  assert.equal(cues.addedDrawCalls, 0);
  assert.ok(cues.sourceTriangles > 0 && cues.sourceTriangles <= ROUTE_ADVANCE.maxTriangles);
  for (const cue of cues.cues) {
    assert.ok(cue.readMetres >= cue.requiredReadMetres, `${cue.features} lack a complete pre-paint bearing window`);
    assert.equal(cue.readMetres, cue.readEndDistance - cue.readStartDistance);
    assert.ok(cue.readEndDistance <= cue.fromDistance, 'crossing paint was credited as advance reading');
    assert.ok(Math.abs(cue.length - (cue.toS - cue.fromS)) < 1e-9);
    assert.ok(cue.toDistance >= Math.max(...cue.features.map(id => SWITCHBACK_SIGNED_FEATURES.find(f => f.id === id)!.lipS - 90)),
      'the last mark was moved outside the original lead window');
    for (const lead of cue.leads) {
      assert.ok(lead.metres >= lead.requiredMetres, `${lead.feature} was signed late`);
      assert.ok(lead.metres <= 90, `${lead.feature} was signed too early`);
      assert.ok(cue.toDistance <= lead.originalWarningEnd, `${lead.feature} new choice cue passed its original warning`);
    }
  }
});

test('both rows have equal type size and opposite incoming-rider arrow directions', () => {
  const runs = advanceCueRuns('TECH', 10);
  // Ten TECH strokes, nine SAFE strokes, two shaft/head pairs.
  assert.equal(runs.length, 23);
  const technicalShaft = runs[10]!, safeShaft = runs[21]!;
  // 2026-10-04 (VIS-3-R2): stacked arrows lie across the trail between rows.
  assert.equal(technicalShaft.path[1]!.s, technicalShaft.path[0]!.s);
  assert.ok(technicalShaft.path[1]!.t > technicalShaft.path[0]!.t, 'technical arrow does not point left');
  assert.equal(safeShaft.path[1]!.s, safeShaft.path[0]!.s);
  assert.ok(safeShaft.path[1]!.t < safeShaft.path[0]!.t, 'SAFE arrow does not point right');
  const spans = (word: typeof runs) => Math.max(...word.flatMap(run => run.path.map(p => p.s)))
    - Math.min(...word.flatMap(run => run.path.map(p => p.s)));
  assert.ok(Math.abs(spans(runs.slice(0, 10)) - spans(runs.slice(12, 21))) < 0.05,
    'SAFE lost equal cap-height priority');
  assert.ok(runs.every(run => run.role === 'glyph' && run.support === 'compactTrail' && run.paint === 'road'));
});

test('finished actual field retains every old warning and every added complete stroke', () => {
  const authored = placed.flatMap(host => markingsOf(host));
  const sourceRuns = SWITCHBACK_GRAPH.flatMap(segment => segment.markings ?? []);
  assert.equal(sourceRuns.length, 97 + SWITCHBACK_ADVANCE_CUES.runCount);
  assert.equal(authored.length, placedRuns(sourceRuns));
  assert.equal(plan.markings!.length, authored.length, 'a complete glyph was clipped into fragments or omitted');
  assert.ok(plan.markings!.every(run => run.support === 'compactTrail'));
  const metres = authored.reduce((sum, run) => sum + length(run.points), 0);
  const actualMetres = plan.markings!.reduce((sum, run) => sum + length(run.points), 0);
  assert.ok(actualMetres >= metres - 1e-6, 'finished field clipped a glyph ribbon');
  assert.equal(plan.markings!.filter(run => run.paint === 'kerb').length, 2);
  assert.equal(SWITCHBACK_SIGNAGE.boardwalkArea, 0);
  assert.equal(SWITCHBACK_SIGNAGE.bands.size, 0);
});

test('adding instructions changes no original riding surface, post, feature, route or record', () => {
  const withoutNewPaint = SWITCHBACK_GRAPH.map(segment => ({ ...segment,
    markings: (segment.markings ?? []).slice(0, (segment.markings ?? []).length
      - (SWITCHBACK_ADVANCE_CUES.markings.get(segment.id)?.length ?? 0)) }));
  const before = buildLevelPlan(withoutNewPaint, { id: 'switchback-r5', spawn: SWITCHBACK_SPAWN,
    surround: { ...SWITCHBACK_SURROUND }, spacing: SWITCHBACK_FIELD_SPACING, settleBlocks: true,
    groundAt: switchbackGroundAt, fieldMargin: SWITCHBACK_FIELD_MARGIN, checkpoints: SWITCHBACK_CHECKPOINTS,
    props: SWITCHBACK_FOREST, palette: SWITCHBACK_PALETTE, look: SWITCHBACK_LOOK });
  for (const key of ['id', 'spawn', 'surround', 'heightfield', 'segments', 'solids', 'checkpoints', 'lap', 'props'] as const) {
    assert.deepEqual(plan[key], before[key], `${key} changed with source paint`);
  }
  const available = new Map<string, number>();
  for (const run of plan.markings!) available.set(signature(run), (available.get(signature(run)) ?? 0) + 1);
  for (const run of before.markings!) {
    const key = signature(run), count = available.get(key) ?? 0;
    assert.ok(count > 0, 'an existing warning or lap cue changed'); available.set(key, count - 1);
  }
  const added = plan.markings!.filter(run => (available.get(signature(run)) ?? 0) > 0);
  assert.equal(added.length, placedRuns(SWITCHBACK_ADVANCE_CUES.cues.flatMap(cue => cue.runs)));
  const triangles = added.reduce((sum, run) => sum + ribbonQuads(run.points, run.dash, run.gap) * 2, 0);
  assert.ok(triangles > 0 && triangles <= ROUTE_ADVANCE.maxTriangles, `unbounded actual paint price ${triangles}`);
});

test('crossing ribbons are rejected even when every endpoint is far away', () => {
  const a = { x: -5, z: 0 }, b = { x: 5, z: 0 }, c = { x: 0, z: -5 }, d = { x: 0, z: 5 };
  assert.equal(lineSeparation(a, b, c, d), 0);
  assert.ok(Math.hypot(a.x - c.x, a.z - c.z) > MARKINGS.glyphWidth, 'endpoint-only negative control is not hostile');
  assert.equal(lineSeparation(a, b, { x: -2, z: 1 }, { x: 2, z: 1 }), 1);
  assert.equal(lineSeparation(a, b, { x: 4, z: 0 }, { x: 8, z: 0 }), 0);
});

function fixture(changes: Partial<SegmentSpec> = {}) {
  const host: SegmentSpec = { id: 'trail', length: 100, halfWidth: 7, surface: 'dirt', ...changes };
  const features: SignedFeature[] = [{ id: 'test-feature', kind: 'deck', segment: 'trail', lipS: 88,
    approachMph: 20, technicalSide: 1, bypassSide: -1, technicalT: 4, bypassT: -3 }];
  const signage: ParkSignage = { bands: new Map(), markings: new Map(), props: new Map(), boardwalkArea: 0,
    signs: [{ feature: 'test-feature', kind: 'deck', segment: 'trail', fromS: 53, toS: 60,
      fromT: -4, toT: 5, lapDistance: 60, commitDistance: 88, lead: 28, requiredLead: 17,
      approachMps: 8.94, readMetres: 20, requiredReadMetres: 13.41, words: [], post: { s: 53, t: 10 },
      postCameraGap: 6, padArea: 0 }] };
  return { placed: placeChain([host], { position: { x: 0, y: 0, z: 0 }, headingY: 0 }), signage, features };
}

test('legacy maximum lead belongs to the final mark, not the first complete word row', () => {
  const clear = fixture();
  // The old pad ends at 60, 28 m before commitment88. A complete6.95 m
  // instruction may start before station58 while its final mark stays within
  // 30 m, as parkSignage.findPad has always permitted for its own copy.
  // Restoring the erroneous +cueLength in the minimumEND makes this throw.
  const result = switchbackAdvanceCues(clear.placed, clear.signage, clear.features, 30);
  assert.equal(result.cues.length, 1);
  const cue = result.cues[0]!;
  assert.ok(cue.fromDistance < 88 - 30);
  assert.ok(cue.toDistance >= 88 - 30 && cue.toDistance <= 60);
  assert.equal(cue.placementAudit.minimumEnd, 58);
  assert.equal(cue.placementAudit.maximumEnd, 60);
  assert.ok(cue.leads[0]!.metres <= 30);
  //26 m cannot contain an END before the unchanged original warning60.
  // This control ensures correcting endpoint semantics did not waive maxLead.
  assert.throws(() => switchbackAdvanceCues(clear.placed, clear.signage, clear.features, 26),
    /no complete central advance cue/);
});

test('full feature blocks, forbidden bands and wrong branch semantics refuse rather than omit a cue', () => {
  const clear = fixture();
  assert.equal(switchbackAdvanceCues(clear.placed, clear.signage, clear.features, 50).cues.length, 1);
  for (const bad of [fixture({ blocks: [{ s: 50, t: 0, halfAlong: 20, halfLateral: 4,
    height: 0.5, surface: 'wood', appearance: 'wood' }] }),
    fixture({ bands: [{ from: -4, to: 4, fromS: 30, toS: 70, surface: 'gravel' }] }),
    fixture({ surface: 'grass' })]) {
    assert.throws(() => switchbackAdvanceCues(bad.placed, bad.signage, bad.features, 50), /no complete central advance cue/);
  }
  assert.throws(() => switchbackAdvanceCues(clear.placed, clear.signage,
    clear.features.map(feature => ({ ...feature, bypassSide: 1 as const })), 50), /left technical\/right safe/);
});


test('kicker keeps both complete word rows while its arrows occupy a separate right gutter', () => {
  const cue = SWITCHBACK_ADVANCE_CUES.cues.find(each => each.features[0] === 'kicker')!;
  assert.equal(cue.layout, 'inline-arrows');
  assert.equal(cue.segment, 'rhythm-turn');
  const sign = SWITCHBACK_SIGNAGE.signs.find(each => each.feature === 'kicker')!;
  // The preserved current warning is a split copy+7 m arrow pad. The older
  // static report assumed its13 m unsplit layout and invented a later end.
  assert.ok(sign.copy !== undefined, 'split warning fixture changed');
  assert.ok(Math.abs(sign.lapDistance - 347.367420876634) < 1e-9);
  assert.ok(Math.abs(cue.placementAudit.minimumEnd - 346.0796326794896) < 1e-9);
  assert.equal(cue.placementAudit.maximumEnd, sign.lapDistance);
  assert.ok(cue.toDistance <= sign.lapDistance);
  assert.ok(cue.placementAudit.candidates > 0);
  assert.ok(cue.leads[0]!.metres <= 90);
  assert.equal(cue.length, INLINE_ADVANCE_CUE_LENGTH);
  assert.ok(Math.abs(cue.length - 4.95) < 1e-9);
  assert.ok(Math.abs(cue.fromT + 2.835) < 1e-9 && Math.abs(cue.toT - 1.865) < 1e-9);
  assert.ok(Math.abs(cue.requiredReadMetres - 33.528) < 1e-9, '50 mph/1.5 s was lowered');
  assert.ok(cue.readMetres >= cue.requiredReadMetres);
  // Same AIR/SAFE word geometry, different arrow placement. No letter shrinks.
  const air = advanceCueRuns('AIR', 0);
  const tech = advanceCueRuns('TECH', 0);
  const cap = (runs: typeof air) => Math.max(...runs.flatMap(run => run.path.map(p => p.s)))
    - Math.min(...runs.flatMap(run => run.path.map(p => p.s)));
  assert.ok(Math.abs(cap(air.slice(0, 6)) - ROUTE_ADVANCE.letterAlong) < 0.05);
  assert.ok(Math.abs(cap(air.slice(8, 17)) - cap(tech.slice(12, 21))) < 0.05);
  const upperShaft = air[6]!, lowerShaft = air[17]!;
  assert.ok(upperShaft.path[1]!.t > upperShaft.path[0]!.t, 'AIR arrow does not point left');
  assert.ok(lowerShaft.path[1]!.t < lowerShaft.path[0]!.t, 'SAFE arrow does not point right');
  const bounds = advanceCueBounds('AIR');
  for (const run of air) for (const point of run.path) {
    assert.ok(point.t - MARKINGS.glyphWidth / 2 >= bounds.fromT - 1e-9);
    assert.ok(point.t + MARKINGS.glyphWidth / 2 <= bounds.toT + 1e-9);
    assert.ok(point.s >= 0 && point.s <= INLINE_ADVANCE_CUE_LENGTH);
  }
});

test('all 97 retained authored and native finished strokes stay byte-exact against preserved R15f evidence', () => {
  // Authored hash is shared with the preserved portrait-high browser audit.
  // Finished hash is the independently executed current native baseline. The
  // archived browser hash dc92fa3204c94b53d9dea5cd6c0f10bc22a6b8470a6c7a5f115d11599063f730
  // differs only in two Math-derived z coordinates by 3.552713678800501e-15.
  // Same-realm comparison covers all fields exactly; no runtime normalization.
  const retained = [...SWITCHBACK_SIGNAGE.markings.values(), ...SWITCHBACK_LAP_CUES.markings.values()].flat();
  assert.equal(retained.length, 97);
  // 2026-10-04 (VIS-3-R2): DOWN and DROP are authored at full size again
  // (13 strokes, no glyphScale); the other 84 retained strokes are unchanged.
  // R15f pin before it: d20f354a0fea54aded98d6449c4ff7930acd31c4accf0458a83574f7e3a9ab9f.
  assert.equal(digest(retained), '42efe37c75e4a34c135cd832d41178671e9082abb7d950dee46e1db81319a63d');
  const withoutNewPaint = SWITCHBACK_GRAPH.map(segment => ({ ...segment,
    markings: (segment.markings ?? []).slice(0, (segment.markings ?? []).length
      - (SWITCHBACK_ADVANCE_CUES.markings.get(segment.id)?.length ?? 0)) }));
  const before = buildLevelPlan(withoutNewPaint, { id: 'switchback-r5', spawn: SWITCHBACK_SPAWN,
    surround: { ...SWITCHBACK_SURROUND }, spacing: SWITCHBACK_FIELD_SPACING, settleBlocks: true,
    groundAt: switchbackGroundAt, fieldMargin: SWITCHBACK_FIELD_MARGIN, checkpoints: SWITCHBACK_CHECKPOINTS,
    props: SWITCHBACK_FOREST, palette: SWITCHBACK_PALETTE, look: SWITCHBACK_LOOK });
  // 2026-10-03 (VIS-3): contracted letters now paint 0.30 x glyphScale strokes.
  // Only widths moved; restoring 0.30 on those runs gives the R15f pin f6f614b3....
  // 2026-10-04 (VIS-3-R2): full-size DOWN/DROP, and every compact-trail glyph
  // ships one run per leg, then a bevel at each turned corner (review follow-
  // up; legs unchanged). VIS-3 pin: 31fac0a8c2bab728...; per-leg: 651a5952....
  assert.equal(digest(before.markings), '7990cfae73e5e8377d12d57af2794d80af42c15c77cc155330b4f08b2070d7f7');
  console.log(JSON.stringify({ advanceCues: SWITCHBACK_ADVANCE_CUES.cues.map(({ runs: _runs, ...cue }) => cue),
    sourceRuns: SWITCHBACK_ADVANCE_CUES.runCount, sourceTriangles: SWITCHBACK_ADVANCE_CUES.sourceTriangles,
    finishedRuns: plan.markings!.length, retainedAuthoredSha256: digest(retained), retainedFinishedSha256: digest(before.markings) }));
});

test('redrawing the arrows inside their band moves no advance cue (VIS-3-R2)', () => {
  // 2026-10-04: the six placements the R15/V4 search made, to the millimetre.
  // Without `advanceCueReservation` the slimmer gutter arrows let the kicker
  // cue slide 0.75 m later, to 4.603-9.553 (measured negative control).
  assert.deepEqual(SWITCHBACK_ADVANCE_CUES.cues.map(cue => [cue.segment, cue.fromS.toFixed(3), cue.toS.toFixed(3)]), [
    ['entrance', '1.197', '8.147'], ['terrace-turn', '1.793', '8.743'], ['timber-turn', '10.380', '17.330'],
    ['rhythm-turn', '3.853', '8.803'], ['clearing-turn', '11.674', '18.624'], ['fire-road-1', '37.975', '44.925'],
  ]);
  // The reservation is searched against, never painted.
  for (const cue of SWITCHBACK_ADVANCE_CUES.cues) {
    const reserved = new Set(advanceCueReservation(cue.upperWord, cue.fromS).map(signature));
    assert.equal(reserved.size, 4);
    assert.ok(cue.runs.every(run => !reserved.has(signature(run))), `${cue.features} paints its reservation`);
  }
});
