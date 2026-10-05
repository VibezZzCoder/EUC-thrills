#!/usr/bin/env node
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The per-segment render-cost table — M12 Phase 0.
 *
 * `docs/PLANS.md` §10: "Measure the marginal render cost of every existing beat
 * and prop kind from the real built scene: draw calls contributed, triangles,
 * and which meshes merge across segment boundaries versus per-segment. Extend
 * the existing scene-audit tests so the numbers regenerate rather than rot."
 *
 * The regeneration lives in `src/render/renderCost.test.ts`, which fails when
 * the model and the built scene disagree. This tool is the *report*: it prints
 * the table and, with `--write`, refreshes the measured non-level reserve in
 * `src/data/renderCost.ts` before rewriting `docs/RENDER_COST.md` from the same
 * measurement.
 *
 *   node tools/render-cost.mjs                print the table
 *   node tools/render-cost.mjs --ultra        …with the Ultra section after the enhanced one
 *   node tools/render-cost.mjs --write        refresh the reserves, both catalogues and both reports
 *   node tools/render-cost.mjs --write-ultra  refresh the Ultra catalogue and report only
 *
 * **The Ultra section (M39, `docs/M39_ULTRA.md` §5 layer 3).** Ultra is the
 * optional single-player recipe with its own envelope, priced render-side by
 * `src/render/ultra/ultraCost.ts` and never by admission. The section prints
 * the Ultra kit part by part against the enhanced and baseline kits, the
 * model against the built scene for the six worlds §5 names (the slice,
 * BelVar, Switchback, the proving ground, the `euc` town and the heavy seed)
 * under both rungs, the pass list, the shadow rigs, every Ultra-owned target
 * with its format and bytes at three drawing buffers, and each world's
 * headroom under the envelope. `--write` regenerates
 * `src/render/ultra/ultraCatalog.ts` from `measurePartTriangles(ULTRA_FULL)`
 * — one line per part, `enhancedCatalog.ts`'s format — and writes the section
 * as `docs/RENDER_COST_ULTRA.md`, behind the same development-tree check as
 * `docs/RENDER_COST.md`. `--write-ultra` does only that, touching no ordinary
 * file: the integrator's command after a forms change. `docs/RENDER_COST.md`
 * stays the ordinary report; the Ultra section reaches stdout only with
 * `--ultra` (or `--write-ultra`), so the ordinary report is byte-identical to
 * what it was before Ultra existed.
 *
 * **The chase rooms and the ceilings (M39 Part P, `docs/M39_CHASE.md` §2f).**
 * The report closes with the chase section: the cop rig (the trim and the
 * q218 full rig) beside the playable rigs, the solo reserve wearing the pack
 * of three (q209), the instanced pack as a *modelled* row, and every room the
 * rule allows per contract on the worst town seed and on the library bound.
 * `--write` also rewrites the three `RENDER_BUDGET*` ceilings by one rule
 * (R-5): each moves by exactly `passes × (new reserve − old reserve)` on each
 * axis, reading the old reserve from the file before rewriting it, and never
 * moves down. This reserve rule retains the previously authorized level share;
 * the separate environment R15 amendment adds three library slots per view
 * without changing reserves or triangle ceilings. A second `--write` is a
 * no-op. The dated prose note above a raised ceiling stays hand-written.
 *
 * Draw calls, triangles, instance counts, and GPU object counts are reportable
 * evidence. A frame interval is not (`AGENTS.md`); nothing here measures time.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

const { buildLevelPlan } = await import(join(src, 'level/buildPlan.ts'));
const { SLICE_BEATS, SLICE_GRAPH, SLICE_POCKETS, createSliceLevel } = await import(join(src, 'level/sliceLevel.ts'));
const { createProvingGround } = await import(join(src, 'level/provingGround.ts'));
const { createTrackLevel, TRACK_LAP_METRES } = await import(join(src, 'level/trackLevel.ts'));
const { createSwitchbackLevel, SWITCHBACK_DESCENT_METRES, SWITCHBACK_LAP_METRES } = await import(join(src, 'level/switchbackLevel.ts'));
const { planRenderCost } = await import(join(src, 'level/renderBudget.ts'));
const { LIBRARY_MAX_DRAW_CALLS, NON_LEVEL_RESERVE, PART_COSTS, QUAD_PASSES, RENDER_BUDGET, RENDER_BUDGET_QUAD, RENDER_BUDGET_SPLIT, SPLIT_PASSES, propPartCounts } = await import(join(src, 'data/renderCost.ts'));
const {
  chaseRoomViews, chaseRooms, measureChaseRoomScene, measureCopRig, measureLevelScene, measureNonLevelScene,
  measurePartTriangles, measureQuadNonLevelScene, measureSeatRig, measureSplitNonLevelScene, modelInstancedPackReserve,
} = await import(join(src, 'render/renderCost.ts'));
const { PLAYABLE_RIDER_LOOKS } = await import(join(src, 'render/riderLook.ts'));
const { ENHANCED_PART_COSTS } = await import(join(src, 'render/enhancedCatalog.ts'));
const { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, PRESENTATION_LADDER, selectPresentation } = await import(join(src, 'render/presentation.ts'));
const { PROP_PART_IDS } = await import(join(src, 'data/renderCost.ts'));
const { CHASE, RENDER, ULTRA } = await import(join(src, 'data/tuning.ts'));
const { generateLevel } = await import(join(src, 'level/generateRoute.ts'));
const {
  HEADLESS_CAPS, ULTRA_JUDGE_BUFFER, judgeUltra, ultraBytes, ultraCostBreakdown, ultraPartSource, ultraTargetBytes,
} = await import(join(src, 'render/ultra/ultraCost.ts'));
const { ULTRA_ENVELOPE } = await import(join(src, 'render/ultra/ultraEnvelope.ts'));
const { ULTRA_FULL, ULTRA_LADDER } = await import(join(src, 'render/ultra/ultraRecipe.ts'));
const { shadowRigFor } = await import(join(src, 'render/ultra/ultraLighting.ts'));
const { ultraGroundShadowFetches } = await import(join(src, 'render/ultra/ultraMaterials.ts'));
const { ultraLiftFarFetches } = await import(join(src, 'render/ultra/ultraGroundDetail.ts'));

const write = process.argv.includes('--write');
const writeUltra = process.argv.includes('--write-ultra');
const ultraFlag = process.argv.includes('--ultra');
// Internal: the fresh re-run below asks for every report at once, as JSON, so
// a single child process prices all of them against the files just written.
const jsonReport = process.argv.includes('--json-report');
if (write && writeUltra) {
  throw new Error('--write already regenerates the Ultra catalogue and report; pass one of --write or --write-ultra');
}

// ---------------------------------------------------------------------------
// Per-segment, measured in isolation
// ---------------------------------------------------------------------------

/** Every spec in the slice's graph, main chain then branches, in order. */
function specsOf(graph) {
  const specs = [...graph.main];
  for (const branch of graph.branches ?? []) specs.push(...branch.specs);
  return specs;
}

/**
 * What one beat costs when it is the only thing in the world.
 *
 * This is the number a generator adds up. It is *not* the beat's share of the
 * finished slice: two beats that cross share ground, and the shoulder that
 * blends a corridor into the surround is counted once here and shared there. So
 * the sum of these overestimates the whole, which is the safe direction for a
 * budget pre-screen and is quantified at the bottom of the report.
 */
function isolatedCost(spec) {
  const plan = buildLevelPlan([spec], {
    id: `isolated-${spec.id}`,
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
  });
  const cost = planRenderCost(plan);
  // Strip the per-level fixed overhead so the rows add up: every level pays for
  // one backstop and one surround field however many segments it has.
  return {
    id: spec.id,
    length: spec.length,
    surface: spec.surface,
    halfWidth: spec.halfWidth,
    cells: cost.cellsDrawn,
    colliders: (spec.blocks ?? []).length,
    props: (plan.props ?? []).length,
    markingQuads: cost.markingQuads,
    surfaces: cost.surfaces,
    materials: cost.blockMaterials,
    parts: [...cost.partInstances.keys()],
    triangles: cost.triangles
      - cost.fieldPatches * 2
      - 2,
  };
}

const rows = specsOf(SLICE_GRAPH).map(isolatedCost);
const byId = new Map(rows.map((row) => [row.id, row]));

const beatOf = new Map();
for (const beat of SLICE_BEATS) for (const id of beat.segments) beatOf.set(id, beat.name);
for (const pocket of SLICE_POCKETS) for (const id of pocket.segments) beatOf.set(id, `pocket: ${pocket.name}`);

/** Beat rows, in the order `SLICE_BEATS` declares them, pockets last. */
const beatRows = [];
for (const beat of [...SLICE_BEATS.map((b) => ({ name: b.name, segments: b.segments })),
  ...SLICE_POCKETS.map((p) => ({ name: `pocket: ${p.name}`, segments: p.segments }))]) {
  const parts = new Set();
  const surfaces = new Set();
  const materials = new Set();
  let cells = 0; let colliders = 0; let props = 0; let quads = 0; let triangles = 0; let length = 0;
  for (const id of beat.segments) {
    const row = byId.get(id);
    if (row === undefined) throw new Error(`beat "${beat.name}" names an unplaced segment "${id}"`);
    cells += row.cells; colliders += row.colliders; props += row.props;
    quads += row.markingQuads; triangles += row.triangles; length += row.length;
    for (const p of row.parts) parts.add(p);
    for (const s of row.surfaces) surfaces.add(s);
    for (const m of row.materials) materials.add(m);
  }
  beatRows.push({
    name: beat.name,
    segments: beat.segments.length,
    length,
    cells,
    colliders,
    props,
    quads,
    triangles,
    parts: [...parts],
    surfaces: [...surfaces],
    materials: [...materials],
  });
}

// ---------------------------------------------------------------------------
// Per prop kind
// ---------------------------------------------------------------------------

const slice = createSliceLevel();
const kindCounts = new Map();
for (const prop of slice.props ?? []) kindCounts.set(prop.kind, (kindCounts.get(prop.kind) ?? 0) + 1);

const kindRows = [...kindCounts.entries()].map(([kind, count]) => {
  let triangles = 0;
  let shadowTriangles = 0;
  const parts = new Set();
  for (const prop of (slice.props ?? []).filter((p) => p.kind === kind)) {
    for (const [part, instances] of propPartCounts(prop)) {
      parts.add(part);
      triangles += PART_COSTS[part].triangles * instances;
      if (PART_COSTS[part].castsShadow) shadowTriangles += PART_COSTS[part].triangles * instances;
    }
  }
  return {
    kind,
    count,
    parts: [...parts],
    triangles: triangles + shadowTriangles,
    each: (triangles + shadowTriangles) / count,
  };
}).sort((a, b) => b.triangles - a.triangles);

// ---------------------------------------------------------------------------
// The whole, measured
// ---------------------------------------------------------------------------

const measured = measureLevelScene(slice);
const predicted = planRenderCost(slice);
const reserve = measureNonLevelScene(slice.checkpoints);
const frame = {
  drawCalls: predicted.drawCalls + reserve.totalDrawCalls,
  triangles: predicted.triangles + reserve.totalTriangles,
};

const proving = createProvingGround();
const provingMeasured = measureLevelScene(proving);
const provingPredicted = planRenderCost(proving);

// **Contract 2, the desktop split frame** — M25 Phase 3 (docs/PLANS.md §25.4).
// Measured against the worst level the game ships rather than the slice, for
// the reason the ceiling exists at all: a couch session can be started on any
// world, including a generated one, so the number has to survive the dearest.
const splitReserve = measureSplitNonLevelScene(slice.checkpoints);

// **The four-seat quadrant frame** — M27 Phase 0, the scope-lock measurement
// (docs/PLANS.md §27.5–§27.6). A measurement and a report, not a contract:
// there is no quad ceiling to compare against until the owner's scope lock
// opens Phase 1, so this section models the two worst cases §27.5 names and
// sets them beside §27.2's own estimates, which is what the lock is judged on.
const quadReserve = measureQuadNonLevelScene(slice.checkpoints);

const track = createTrackLevel();
const trackMeasured = measureLevelScene(track);
const trackPredicted = planRenderCost(track);
const trackReserve = measureNonLevelScene(track.checkpoints);

// **Switchback Park** — M36, the dressed park. Measured on the same terms as
// BelVar and reported beside it, because it is the first world whose ground is
// an authored *function* rather than a flat surround: the heightfield is still
// most of the cost, and the point of the row is to show what a hillside spends
// and what the Phase 4 dressing added on top of it.
const park = createSwitchbackLevel();
const parkMeasured = measureLevelScene(park);
const parkPredicted = planRenderCost(park);
const parkReserve = measureNonLevelScene(park.checkpoints);

const isolatedSum = rows.reduce((total, row) => total + row.triangles, 0);
const isolatedCells = rows.reduce((total, row) => total + row.cells, 0);
const isolatedDrawCalls = rows.reduce((total, row) => (
  // What the level would cost if nothing merged: every segment its own ground
  // mesh per surface, its own block mesh per material, its own mesh per prop
  // part, plus a shadow pass for the parts that cast.
  total
  + row.surfaces.length
  + row.materials.length * 2
  + row.parts.reduce((n, part) => n + (PART_COSTS[part].castsShadow ? 2 : 1), 0)
  + (row.markingQuads > 0 ? 1 : 0)
), 0);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padStart(width);
const padEnd = (value, width) => String(value).padEnd(width);

const lines = [];
const out = (line = '') => { lines.push(line); };

out('# Render cost — measured, M12 Phase 0');
out();
out('Regenerate with `node tools/render-cost.mjs --write`. The numbers are');
out('checked against the built scene by `src/render/renderCost.test.ts`, which');
out('fails if the model and the renderer ever disagree — so this file is a');
out('report, never a source of truth.');
out();
out('Draw calls, triangles, and instance counts are reportable evidence. Frame');
out('interval and FPS are not, and nothing here measures time (`AGENTS.md`).');
out();

out('## The whole slice, model against measurement');
out();
out('```');
out(`                       predicted    measured`);
out(`level draw calls    ${pad(predicted.drawCalls, 12)}${pad(measured.totalDrawCalls, 12)}`);
out(`  colour pass       ${pad(predicted.colourDrawCalls, 12)}${pad(measured.drawCalls, 12)}`);
out(`  shadow pass       ${pad(predicted.shadowDrawCalls, 12)}${pad(measured.shadowDrawCalls, 12)}`);
out(`level triangles     ${pad(predicted.triangles, 12)}${pad(measured.totalTriangles, 12)}`);
out(`heightfield cells   ${pad(predicted.cellsDrawn, 12)}${pad(measured.cellsDrawn, 12)}`);
out('```');
out();
out('The proving ground, which M12 must also leave exactly where it is:');
out();
out('```');
out(`level draw calls    ${pad(provingPredicted.drawCalls, 12)}${pad(provingMeasured.totalDrawCalls, 12)}`);
out(`level triangles     ${pad(provingPredicted.triangles, 12)}${pad(provingMeasured.totalTriangles, 12)}`);
out('```');
out();

out('## BelVar Circuit — M23 Phase B1, the venue dressed');
out();
out('```');
out(`                       predicted    measured`);
out(`level draw calls    ${pad(trackPredicted.drawCalls, 12)}${pad(trackMeasured.totalDrawCalls, 12)}`);
out(`  colour pass       ${pad(trackPredicted.colourDrawCalls, 12)}${pad(trackMeasured.drawCalls, 12)}`);
out(`  shadow pass       ${pad(trackPredicted.shadowDrawCalls, 12)}${pad(trackMeasured.shadowDrawCalls, 12)}`);
out(`level triangles     ${pad(trackPredicted.triangles, 12)}${pad(trackMeasured.totalTriangles, 12)}`);
out(`heightfield cells   ${pad(trackPredicted.cellsDrawn, 12)}${pad(trackMeasured.cellsDrawn, 12)}`);
out('```');
out();
out('```');
out(`level                    ${pad(trackPredicted.drawCalls, 6)} calls   ${pad(trackPredicted.triangles, 8)} triangles`);
out(`everything else          ${pad(trackReserve.totalDrawCalls, 6)} calls   ${pad(trackReserve.totalTriangles, 8)} triangles`);
out(`                         ------          --------`);
out(`frame                    ${pad(trackPredicted.drawCalls + trackReserve.totalDrawCalls, 6)} calls   ${pad(trackPredicted.triangles + trackReserve.totalTriangles, 8)} triangles`);
out(`ceiling (§9)             ${pad(RENDER_BUDGET.maxDrawCalls, 6)} calls   ${pad(RENDER_BUDGET.maxTriangles, 8)} triangles`);
out(`headroom                 ${pad(RENDER_BUDGET.maxDrawCalls - trackPredicted.drawCalls - trackReserve.totalDrawCalls, 6)} calls   ${pad(RENDER_BUDGET.maxTriangles - trackPredicted.triangles - trackReserve.totalTriangles, 8)} triangles`);
out('```');
out();
out(`A ${TRACK_LAP_METRES.toFixed(0)} m closed circuit of ${track.segments.length} corridors, dressed: a`);
out('two-colour modular barrier down both sides, a start gantry, tyre stacks, a');
out('paddock inside the loop, a site fence and sparse planting.');
out();
out('**Historically, B1 spent seven of the ten calls the library then had spare.**');
out('(`LIBRARY_MAX_DRAW_CALLS` is now ' + LIBRARY_MAX_DRAW_CALLS + ' against a reserve of ' + NON_LEVEL_RESERVE.drawCalls + '), and only');
out('four things cost anything at all: the signal-red barrier material, the tyre');
out('stack and the gantry span — two each, a colour pass and a shadow pass — and');
out('the low-rise facade, at one, because a building casts no shadow. The paddock');
out('buildings, the fencing, the planting, the gantry legs and the banner are');
out('free, because every one of them is a material or a prop part the library');
out('already carried. **So is the venue turf**, which is the same `grass` surface');
out('under a level-scoped albedo (`LevelPlan.palette`) rather than a surface of');
out('its own: a new `SurfaceId` would have cost three calls to say what a colour');
out('says. That is the whole shape of §23.14\'s *spend triangles, not draw');
out('calls*: density of kinds that already exist costs nothing on the axis this');
out('project is scarce on, and the ceiling a new **kind** has to clear is the');
out("library's rather than this frame's (`render/renderCost.test.ts`).");
out();

out('## Switchback Park — M36, the dressed park');
out();
out('```');
out(`                       predicted    measured`);
out(`level draw calls    ${pad(parkPredicted.drawCalls, 12)}${pad(parkMeasured.totalDrawCalls, 12)}`);
out(`  colour pass       ${pad(parkPredicted.colourDrawCalls, 12)}${pad(parkMeasured.drawCalls, 12)}`);
out(`  shadow pass       ${pad(parkPredicted.shadowDrawCalls, 12)}${pad(parkMeasured.shadowDrawCalls, 12)}`);
out(`level triangles     ${pad(parkPredicted.triangles, 12)}${pad(parkMeasured.totalTriangles, 12)}`);
out(`heightfield cells   ${pad(parkPredicted.cellsDrawn, 12)}${pad(parkMeasured.cellsDrawn, 12)}`);
out('```');
out();
out('```');
out(`level                    ${pad(parkPredicted.drawCalls, 6)} calls   ${pad(parkPredicted.triangles, 8)} triangles`);
out(`everything else          ${pad(parkReserve.totalDrawCalls, 6)} calls   ${pad(parkReserve.totalTriangles, 8)} triangles`);
out(`                         ------          --------`);
out(`frame                    ${pad(parkPredicted.drawCalls + parkReserve.totalDrawCalls, 6)} calls   ${pad(parkPredicted.triangles + parkReserve.totalTriangles, 8)} triangles`);
out(`ceiling (§9)             ${pad(RENDER_BUDGET.maxDrawCalls, 6)} calls   ${pad(RENDER_BUDGET.maxTriangles, 8)} triangles`);
out(`headroom                 ${pad(RENDER_BUDGET.maxDrawCalls - parkPredicted.drawCalls - parkReserve.totalDrawCalls, 6)} calls   ${pad(RENDER_BUDGET.maxTriangles - parkPredicted.triangles - parkReserve.totalTriangles, 8)} triangles`);
out('```');
out();
out(`A ${SWITCHBACK_LAP_METRES.toFixed(0)} m closed lap of ${park.segments.length} corridors down and back up a`);
out(`${SWITCHBACK_DESCENT_METRES.toFixed(1)} m hillside, at ${park.heightfield.spacing} m heightfield spacing: nine technical`);
out('features as merged blocks, dressed: nine signs and the paint that leads into');
out(`them, a conifer forest, hillside cribbing and riprap, trail rail and three`);
out('benches — ' + park.props.length.toLocaleString('en-GB') + ' props in all — over a warm retint of three materials');
out('the library already carried, under the park\'s own fixed late afternoon');
out('(`LevelPlan.look`, the only world that authors one).');
out();
// Counted from the priced plan rather than written out: these are the buckets
// the "zero new call buckets" claim is about, and the colour pass above is
// their sum plus the paint, the field and the backstop. A hand-written census
// here went stale between two phases and had the arithmetic reading 17 against
// a measured 21 (M36 Phase 6).
out('**The hillside is still the bill.** Every draw call here is one the library');
out(`already carried — ${parkPredicted.surfaces.length} ground surfaces, ${parkPredicted.blockMaterials.length} block materials and`);
out(`${parkPredicted.partInstances.size} prop parts, plus the paint, the backstop and the field — so the venue`);
out('costs the *call* axis nothing new, exactly as §36.7 requires ("target zero');
out('new call buckets").');
out(`What it spends is triangles, and most of them are ${parkPredicted.cellsDrawn.toLocaleString('en-GB')} heightfield cells`);
out('at two triangles each. That is what `BuildOptions.groundAt` costs: a flat');
out('surround draws nothing off the corridors, and a hill draws all of it. The');
out('spacing is the lever — a one-metre grid measures 67,552 cells and a');
out('two-metre grid 16,864 — and 1.5 m is where the slopes still read and the');
out('corridor edges do not staircase. §36.7\'s working allocation is 55 calls and');
out(`300,000 triangles per pass; the dressed park has taken its share and stands`);
out(`at ${parkPredicted.drawCalls} calls and ${parkPredicted.triangles.toLocaleString('en-GB')} triangles.`);
out();

out('## The frame, against the §9 ceilings');
out();
out('```');
out(`level                    ${pad(predicted.drawCalls, 6)} calls   ${pad(predicted.triangles, 8)} triangles`);
out(`everything else          ${pad(reserve.totalDrawCalls, 6)} calls   ${pad(reserve.totalTriangles, 8)} triangles`);
out(`                         ------          --------`);
out(`frame                    ${pad(frame.drawCalls, 6)} calls   ${pad(frame.triangles, 8)} triangles`);
out(`ceiling (§9)             ${pad(RENDER_BUDGET.maxDrawCalls, 6)} calls   ${pad(RENDER_BUDGET.maxTriangles, 8)} triangles`);
out(`headroom                 ${pad(RENDER_BUDGET.maxDrawCalls - frame.drawCalls, 6)} calls   ${pad(RENDER_BUDGET.maxTriangles - frame.triangles, 8)} triangles`);
out('```');
out();
out('"Everything else" is the rider rig, every playable rider look, the checkpoint');
out('gates, both particle fields, and three\'s own background pass — measured');
out('over every frame a player can actually reach and reserved at the worst of');
out('them on each axis. That is any playable rider accompanied by either a');
out(`Time-trial ghost or the chase pack of ${CHASE.roomSize - 1} cop trims (M39 Part P, q209). The two are alternatives`);
out('rather than additions, and `render/Renderer.ts` holds one slot so that');
out('stays a fact rather than an assumption. Free ride costs materially less:');
out('everything optional starts hidden, and an invisible subtree draws nothing.');
out();
out('These are worst-case figures that ignore frustum culling, which is why they');
out('sit above what a browser reports from any one camera position. That is the');
out('correct direction for a budget: a contract has to answer "what could this');
out('world cost", not "what did this camera happen to see".');
out();

out('## Per beat, measured in isolation');
out();
out('Each beat built as the only thing in the world, so the row is what stitching');
out('that beat into a route adds. Fixed per-level overhead (the backstop and the');
out('coarse surround field) is excluded so the rows add up.');
out();
out('```');
out(`${padEnd('beat', 26)}${pad('segs', 5)}${pad('length', 8)}${pad('cells', 8)}${pad('blocks', 7)}${pad('props', 7)}${pad('paint', 7)}${pad('triangles', 10)}`);
out('-'.repeat(78));
for (const row of beatRows) {
  out(`${padEnd(row.name, 26)}${pad(row.segments, 5)}${pad(row.length.toFixed(0), 8)}${pad(row.cells, 8)}${pad(row.colliders, 7)}${pad(row.props, 7)}${pad(row.quads, 7)}${pad(row.triangles, 10)}`);
}
out('-'.repeat(78));
out(`${padEnd('sum of isolated beats', 26)}${pad(rows.length, 5)}${pad(rows.reduce((t, r) => t + r.length, 0).toFixed(0), 8)}${pad(isolatedCells, 8)}${pad(rows.reduce((t, r) => t + r.colliders, 0), 7)}${pad('', 7)}${pad('', 7)}${pad(isolatedSum, 10)}`);
out('```');
out();

out('## Per segment');
out();
out('```');
out(`${padEnd('segment', 18)}${padEnd('beat', 24)}${pad('length', 8)}${pad('cells', 8)}${pad('blocks', 7)}${pad('props', 7)}${pad('triangles', 10)}`);
out('-'.repeat(82));
for (const row of rows) {
  out(`${padEnd(row.id, 18)}${padEnd(beatOf.get(row.id) ?? '—', 24)}${pad(row.length.toFixed(0), 8)}${pad(row.cells, 8)}${pad(row.colliders, 7)}${pad(row.props, 7)}${pad(row.triangles, 10)}`);
}
out('```');
out();

out('## Per prop kind, as the slice actually places them');
out();
out('```');
out(`${padEnd('kind', 16)}${pad('placed', 8)}${pad('tris ea', 9)}${pad('triangles', 11)}  parts`);
out('-'.repeat(76));
for (const row of kindRows) {
  out(`${padEnd(row.kind, 16)}${pad(row.count, 8)}${pad(row.each.toFixed(0), 9)}${pad(row.triangles, 11)}  ${row.parts.join(', ')}`);
}
out('```');
out();
out('`tris ea` counts the shadow pass, so a casting part is charged twice — an');
out('instanced mesh spans the world and the shadow camera never culls one.');
out();

// ---------------------------------------------------------------------------
// The enhanced presentation — the environment pass, 2026-09-08
// ---------------------------------------------------------------------------

/**
 * The enhanced kit measured part by part, and every authored world priced
 * and measured under both recipes. The catalogue this writes
 * (`src/render/enhancedCatalog.ts`) is presentation data: `level/` prices
 * admission from `data/renderCost.ts` and never sees it.
 */
const baselineParts = measurePartTriangles(BASELINE_PRESENTATION);
const enhancedParts = measurePartTriangles(ENHANCED_PRESENTATION);
const enhancedRows = [...enhancedParts]
  .filter(([part, cost]) => cost.triangles !== baselineParts.get(part).triangles || part in ENHANCED_PART_COSTS)
  .map(([part, cost]) => ({ part, baseline: baselineParts.get(part).triangles, enhanced: cost.triangles, castsShadow: cost.castsShadow }));
const presentationWorlds = [
  ['the slice', slice],
  ['BelVar Circuit', track],
  ['the proving ground', proving],
  ['Switchback Park', park],
].map(([name, plan]) => {
  const selection = selectPresentation(plan);
  const verdicts = Object.fromEntries(selection.verdicts.map((verdict) => [verdict.recipe, verdict]));
  return {
    name,
    selection,
    verdicts,
    measured: Object.fromEntries(PRESENTATION_LADDER.map((recipe) => [recipe.id, measureLevelScene(plan, recipe)])),
  };
});

out('## The enhanced presentation — measured, the environment pass');
out();
out('Richer crown and conifer topology in the same instanced buckets, and a');
out('running bond on the stone walls, chosen per installed world *after*');
out('generation by `render/presentation.ts` and only where the prop family and');
out('all three frame contracts still fit. Admission still prices every route');
out('from `data/renderCost.ts`; this catalogue lives under `render/` and');
out('`src/architecture.test.ts` proves nothing in `level/`, `simulation/` or');
out('`data/` can import it.');
out();
out('```');
out(`${padEnd('part', 18)}${pad('baseline', 10)}${pad('enhanced', 10)}  casts`);
out('-'.repeat(46));
for (const row of enhancedRows) {
  out(`${padEnd(row.part, 18)}${pad(row.baseline, 10)}${pad(row.enhanced, 10)}  ${row.castsShadow ? 'yes' : 'no'}`);
}
out('```');
out();
for (const world of presentationWorlds) {
  const base = world.verdicts.baseline.cost;
  const enhanced = world.verdicts.enhanced.cost;
  const measuredEnhanced = world.measured.enhanced;
  const measuredBaseline = world.measured.baseline;
  out(`${world.name} selects **${world.selection.recipe.id}**${world.verdicts.enhanced.breaches.length > 0 ? ` — ${world.verdicts.enhanced.breaches.join('; ')}` : ''}.`);
  out();
  out('```');
  out(`${padEnd('', 30)}${pad('baseline', 10)}${pad('measured', 10)}${pad('enhanced', 10)}${pad('measured', 10)}`);
  out(`${padEnd('level draw calls', 30)}${pad(base.drawCalls, 10)}${pad(measuredBaseline.totalDrawCalls, 10)}${pad(enhanced.drawCalls, 10)}${pad(measuredEnhanced.totalDrawCalls, 10)}`);
  out(`${padEnd('level triangles', 30)}${pad(base.triangles, 10)}${pad(measuredBaseline.totalTriangles, 10)}${pad(enhanced.triangles, 10)}${pad(measuredEnhanced.totalTriangles, 10)}`);
  out(`${padEnd('  prop family, with shadows', 30)}${pad(base.propTriangles, 10)}${pad(measuredBaseline.byCategory.props.totalTriangles, 10)}${pad(enhanced.propTriangles, 10)}${pad(measuredEnhanced.byCategory.props.totalTriangles, 10)}`);
  out(`${padEnd('  blocks, colour pass', 30)}${pad(base.blockColourTriangles, 10)}${pad(measuredBaseline.byCategory.blocks.triangles, 10)}${pad(enhanced.blockColourTriangles, 10)}${pad(measuredEnhanced.byCategory.blocks.triangles, 10)}`);
  out(`${padEnd('solo frame triangles', 30)}${pad(base.frame.solo.triangles, 10)}${pad('', 10)}${pad(enhanced.frame.solo.triangles, 10)}${pad('', 10)}`);
  out(`${padEnd('split frame triangles', 30)}${pad(base.frame.split.triangles, 10)}${pad('', 10)}${pad(enhanced.frame.split.triangles, 10)}${pad('', 10)}`);
  out(`${padEnd('quad frame triangles', 30)}${pad(base.frame.quad.triangles, 10)}${pad('', 10)}${pad(enhanced.frame.quad.triangles, 10)}${pad('', 10)}`);
  out('```');
  out();
}
out('The prop family\'s ceiling is `PROP_BUDGET`, 32 calls / 90,000 triangles with');
out('shadows, applied to enhanced selection in every world; the 60-per-prop');
out('average stays a slice test (`render/props.test.ts`). The facade atlas and');
out('the foliage tones are cost-neutral and reach both recipes.');
out();
// M39: `--ultra` splices the Ultra section in here, after the enhanced one.
const ultraInsertAt = lines.length;

out('## What merges across segment boundaries');
out();
out('```');
out(`draw calls if nothing merged   ${pad(isolatedDrawCalls, 6)}`);
out(`draw calls the slice pays      ${pad(predicted.drawCalls, 6)}`);
out(`saved by merging               ${pad(isolatedDrawCalls - predicted.drawCalls, 6)}`);
out('```');
out();
out('**Everything merges. Nothing in a level is per-segment.**');
out();
out('- the heightfield is one mesh with one material group per surface *present*;');
out('- the kerbs, walls and plinths are one merged mesh per material *present*;');
out('- the dressing is one `InstancedMesh` per part *present*;');
out('- all the paint in the level is one mesh;');
out('- all the broken asphalt in the level is one mesh and all the standing water');
out('  is a second, and neither of them casts (M13).');
out();
out('The hand-authored slice and proving ground measured above carry no hazards;');
out('generated routes do. A route pays at most two hazard draw calls the first');
out('time it contains one, however many hazards the generator places in it.');
out('Two rather than one because roughness cannot be a vertex colour: the pits are');
out('matte crushed stone and the water in them has to be smooth, and one water');
out('material serves both the pools inside deep potholes and the puddles of');
out('spills. A spill *also* costs one heightfield material group, because its grip');
out('is still the cells it paints — the drawn puddle lying on those cells is the');
out('only part of it counted in the hazard family.');
out();
out('So draw calls are a **set union over the library**, not a sum over the route.');
out(`A route ten times as long that draws on the same surfaces, materials and prop`);
out('kinds costs exactly the same number of draw calls. Triangles are additive and');
out('are where a long route actually threatens the §9 budget — which is why the');
out('Phase 2 validation contract has teeth on triangles and is close to a formality');
out('on draw calls.');
out();
out(`Cell overlap: the isolated beats total ${isolatedCells} ground cells and the finished`);
out(`slice draws ${predicted.cellsDrawn}, so beats that cross or share a shoulder account for`);
out(`${(100 * (1 - predicted.cellsDrawn / isolatedCells)).toFixed(1)}% of the sum. A pre-screen that adds the isolated rows therefore`);
out('over-estimates, which is the safe direction; the exact figure comes from');
out('`planRenderCost` on the emitted plan, which is what the contract actually uses.');
out();

// ---------------------------------------------------------------------------
// Contract 2 — the desktop split frame (M25 Phase 3)
// ---------------------------------------------------------------------------

const splitWorst = [
  ['the slice', predicted],
  ['the proving ground', provingPredicted],
  ['BelVar Circuit', trackPredicted],
  ['Switchback Park', parkPredicted],
].reduce((worst, row) => (row[1].drawCalls > worst[1].drawCalls ? row : worst));
const splitPass = {
  drawCalls: splitWorst[1].drawCalls + splitReserve.totalDrawCalls,
  triangles: splitWorst[1].triangles + splitReserve.totalTriangles,
};
const splitFrame = {
  drawCalls: splitPass.drawCalls * SPLIT_PASSES,
  triangles: splitPass.triangles * SPLIT_PASSES,
};
const splitLibraryBound = (LIBRARY_MAX_DRAW_CALLS + splitReserve.totalDrawCalls) * SPLIT_PASSES;

out('## The desktop split frame, against the Contract 2 ceiling');
out();
out('```');
out(`level (${splitWorst[0]})${' '.repeat(Math.max(1, 17 - splitWorst[0].length))}${pad(splitWorst[1].drawCalls, 6)} calls   ${pad(splitWorst[1].triangles, 8)} triangles`);
out(`everything else          ${pad(splitReserve.totalDrawCalls, 6)} calls   ${pad(splitReserve.totalTriangles, 8)} triangles`);
out(`                         ------          --------`);
out(`one pass                 ${pad(splitPass.drawCalls, 6)} calls   ${pad(splitPass.triangles, 8)} triangles`);
out(`x ${SPLIT_PASSES} passes               ${pad(splitFrame.drawCalls, 6)} calls   ${pad(splitFrame.triangles, 8)} triangles`);
out(`ceiling (Contract 2)     ${pad(RENDER_BUDGET_SPLIT.maxDrawCalls, 6)} calls   ${pad(RENDER_BUDGET_SPLIT.maxTriangles, 8)} triangles`);
out(`headroom                 ${pad(RENDER_BUDGET_SPLIT.maxDrawCalls - splitFrame.drawCalls, 6)} calls   ${pad(RENDER_BUDGET_SPLIT.maxTriangles - splitFrame.triangles, 8)} triangles`);
out('```');
out();
out('A split frame is two full renders of one scene through two cameras, each');
out('with its own shadow-map render, so **its cost is the sum of both passes**.');
out('"Everything else" here is two whole riders and machines, measured over');
out('unordered distinct pairs of playable riders wearing either companion, and');
out('from M39 Part P every two-pane chase room (1v1 beside a human cop, 2v2 with');
out('two trims of the CPU pack) — per-axis worst. Distinct because two riders on');
out('one screen are never the same character.');
out();
out(`**The structural bound doubles with the passes.** A level drawing on every`);
out(`surface, material and prop part at once costs ${LIBRARY_MAX_DRAW_CALLS} calls, so no split frame`);
out(`the library can build exceeds ${splitLibraryBound} calls — which is what`);
out('`render/renderCost.test.ts` asserts against the ceiling, exactly as it does');
out('for Contract 1. Single-player frames are one pass and are measured,');
out('reserved and bounded separately above.');
out();

// ---------------------------------------------------------------------------
// Contract 3 — the four-seat grid frame (M27 Phase 0 measured it, Phase 1
// pinned it)
// ---------------------------------------------------------------------------

// Four passes because a quadrant grid is one pass per seat, exactly as the
// halves are — each with its own shadow render (docs/PLANS.md §27.2, §27.9).
// Imported from `data/` since Phase 1: §27.5's "`SPLIT_PASSES` becomes a fact
// per frame shape" is built, and a local copy here would be a second opinion
// about the shape of the frame this report is describing.
// §27.2's desk arithmetic, quoted so the measurement can sit beside it. The
// plan extended the split reserve by two more riders at +60 calls and +23,138
// triangles each and said in the same breath that it was extending rather
// than concluding; these literals are that extension, kept verbatim.
const PLAN_ESTIMATE = {
  reserve: { drawCalls: 268, triangles: 122_700 },
  belvarFrame: { drawCalls: 1_220, triangles: 1_170_000 },
  generatedFrame: { drawCalls: 1_350, triangles: 1_960_000 },
};

// The generator's 80% line includes a solo reserve. Subtract it before
// adding the four-rider reserve, just as renderCost.test.ts does.
const quadTriangleLine = RENDER_BUDGET.maxTriangles * 0.8 - reserve.totalTriangles;
const belvarQuadPass = {
  drawCalls: trackPredicted.drawCalls + quadReserve.totalDrawCalls,
  triangles: trackPredicted.triangles + quadReserve.totalTriangles,
};
const belvarQuadFrame = {
  drawCalls: belvarQuadPass.drawCalls * QUAD_PASSES,
  triangles: belvarQuadPass.triangles * QUAD_PASSES,
};
const parkQuadPass = {
  drawCalls: parkPredicted.drawCalls + quadReserve.totalDrawCalls,
  triangles: parkPredicted.triangles + quadReserve.totalTriangles,
};
const parkQuadFrame = {
  drawCalls: parkQuadPass.drawCalls * QUAD_PASSES,
  triangles: parkQuadPass.triangles * QUAD_PASSES,
};
const generatedQuadPass = {
  drawCalls: LIBRARY_MAX_DRAW_CALLS + quadReserve.totalDrawCalls,
  triangles: quadTriangleLine + quadReserve.totalTriangles,
};
const generatedQuadFrame = {
  drawCalls: generatedQuadPass.drawCalls * QUAD_PASSES,
  triangles: generatedQuadPass.triangles * QUAD_PASSES,
};

out('## Contract 3 — the four-seat grid frame');
out();
out('**Measured at M27 Phase 0, pinned at Phase 1.** The owner answered q98 on');
out('2026-08-31 — **(a): four seats everywhere, no per-world seat cap** — so the');
out('ceiling below is written against the *heavier* of the two frames measured');
out('here, and BelVar is a datapoint rather than a second contract. All three');
out('contracts are enforced, with no per-world exemptions (§27.5). The owner');
out('reopened the triangle ceilings for the 2026-09-09 Cool Rider pass; each');
out('rose by its measured reserve growth per rendered view. Draw ceilings');
out('and the previous level geometry allowance were retained.');
out('Whether a given desktop *eats* the frame is a fact no agent may derive or');
out('report: `tools/perf-window.js --views 4`, foreground, and the verdict is the');
out('owner\'s alone.');
out();
out('```');
out(`                            measured        §27.2's estimate`);
out(`quad reserve, one pass   ${pad(quadReserve.totalDrawCalls, 6)} calls   ${pad(quadReserve.totalTriangles, 9)} tri    ~${PLAN_ESTIMATE.reserve.drawCalls} calls  ~${PLAN_ESTIMATE.reserve.triangles.toLocaleString('en-GB')} tri`);
out('```');
out();
out('The reserve is four whole rigs and machines in one scene — the gates, the');
out('particle pools and the background still shared — measured over unordered');
out('distinct four-subsets of the playable roster, each wearing the worse of the');
out('ghost and cop slots: the split reserve\'s discipline at four rigs. From M39');
out('Part P the sweep also holds every grid chase room (see the chase section).');
out();
out('**The venue the race needs — BelVar Circuit, four passes:**');
out();
out('```');
out(`level (BelVar Circuit)   ${pad(trackPredicted.drawCalls, 6)} calls   ${pad(trackPredicted.triangles, 9)} triangles`);
out(`everything else          ${pad(quadReserve.totalDrawCalls, 6)} calls   ${pad(quadReserve.totalTriangles, 9)} triangles`);
out(`                         ------           ---------`);
out(`one pass                 ${pad(belvarQuadPass.drawCalls, 6)} calls   ${pad(belvarQuadPass.triangles, 9)} triangles`);
out(`x ${QUAD_PASSES} passes               ${pad(belvarQuadFrame.drawCalls, 6)} calls   ${pad(belvarQuadFrame.triangles, 9)} triangles`);
out(`§27.2's estimate         ${pad(`~${PLAN_ESTIMATE.belvarFrame.drawCalls}`, 6)} calls   ${pad(`~${PLAN_ESTIMATE.belvarFrame.triangles.toLocaleString('en-GB')}`, 9)} triangles`);
out('```');
out();
out('**The second lap venue — the dressed Switchback Park, four passes:**');
out();
out('```');
out(`level (Switchback Park)  ${pad(parkPredicted.drawCalls, 6)} calls   ${pad(parkPredicted.triangles, 9)} triangles`);
out(`everything else          ${pad(quadReserve.totalDrawCalls, 6)} calls   ${pad(quadReserve.totalTriangles, 9)} triangles`);
out(`                         ------           ---------`);
out(`one pass                 ${pad(parkQuadPass.drawCalls, 6)} calls   ${pad(parkQuadPass.triangles, 9)} triangles`);
out(`x ${QUAD_PASSES} passes               ${pad(parkQuadFrame.drawCalls, 6)} calls   ${pad(parkQuadFrame.triangles, 9)} triangles`);
out(`ceiling (§27)            ${pad(RENDER_BUDGET_QUAD.maxDrawCalls, 6)} calls   ${pad(RENDER_BUDGET_QUAD.maxTriangles, 9)} triangles`);
out('```');
out();

out('**The world four-seat free ride can open — the generated worst, four passes.**');
out('The level line is Contract 2\'s own: the library set-union bound on calls');
out(`(${LIBRARY_MAX_DRAW_CALLS}), and the level share of the generator's 80% solo-frame line (${quadTriangleLine.toLocaleString('en-GB')}) that`);
out('`level/generatedLevel.test.ts` holds routes under:');
out();
out('```');
out(`level (generated worst)  ${pad(LIBRARY_MAX_DRAW_CALLS, 6)} calls   ${pad(quadTriangleLine, 9)} triangles`);
out(`everything else          ${pad(quadReserve.totalDrawCalls, 6)} calls   ${pad(quadReserve.totalTriangles, 9)} triangles`);
out(`                         ------           ---------`);
out(`one pass                 ${pad(generatedQuadPass.drawCalls, 6)} calls   ${pad(generatedQuadPass.triangles, 9)} triangles`);
out(`x ${QUAD_PASSES} passes               ${pad(generatedQuadFrame.drawCalls, 6)} calls   ${pad(generatedQuadFrame.triangles, 9)} triangles`);
out(`§27.2's estimate         ${pad(`~${PLAN_ESTIMATE.generatedFrame.drawCalls}`, 6)} calls   ${pad(`~${PLAN_ESTIMATE.generatedFrame.triangles.toLocaleString('en-GB')}`, 9)} triangles`);
out('```');
out();
out('**The pinned ceiling, and where it comes from.** The generated worst case is');
out('what binds, because q98 (a) declined to cap generated worlds at two seats:');
out();
out('```');
out(`set-union bound          ${pad(generatedQuadFrame.drawCalls, 6)} calls   ${pad(generatedQuadFrame.triangles, 9)} triangles`);
out(`RENDER_BUDGET_QUAD       ${pad(RENDER_BUDGET_QUAD.maxDrawCalls, 6)} calls   ${pad(RENDER_BUDGET_QUAD.maxTriangles, 9)} triangles`);
out(`headroom                 ${pad(RENDER_BUDGET_QUAD.maxDrawCalls - generatedQuadFrame.drawCalls, 6)} calls   ${pad(RENDER_BUDGET_QUAD.maxTriangles - generatedQuadFrame.triangles, 9)} triangles`);
out('```');
out();
out('A change to a character is charged once per rendered view. The historical');
out('M27 estimates above are retained for comparison; the measured rows and');
out('current ceilings describe the completed roster. Contract 2 is');
out(`${RENDER_BUDGET_SPLIT.maxDrawCalls} calls / ${RENDER_BUDGET_SPLIT.maxTriangles.toLocaleString('en-GB')} triangles, and Contract 1 is`);
out(`${RENDER_BUDGET.maxDrawCalls} calls / ${RENDER_BUDGET.maxTriangles.toLocaleString('en-GB')} triangles.`);
out();

// ---------------------------------------------------------------------------
// The chase rooms — M39 Part P (docs/PLANS.md §39.6b.4, §39.6b.4b)
// ---------------------------------------------------------------------------

/**
 * Every figure the Part P plan asks of the cost model, measured here from the
 * built scene: the cop rig (the shipped trim, and the q218 full rig beside the
 * playable rigs), the solo reserve wearing the pack (q209), the instanced pack
 * as a modelled row, and every room the rule allows, per contract, on the
 * worst town seed and on the library bound. The ceilings printed are the ones
 * in `data/renderCost.ts`, which `--write` moves by the one rule this file's
 * header states.
 */
// The six-seed town corpus the chase bench pins (docs/M39_CHASE.md §2g),
// then the Ultra corpus's `euc-1` … `euc-24`; a seed in both is priced once.
const CHASE_TOWN_SEEDS = [...new Set([
  'euc', 'route-41', 'sweep-39', 'sweep-15', 'euc-7', 'harbour-spark-42',
  ...Array.from({ length: 24 }, (_, index) => `euc-${index + 1}`),
])];
const townLevels = CHASE_TOWN_SEEDS.map((seed) => {
  const selection = selectPresentation(generateLevel(seed).plan);
  return { seed, recipe: selection.recipe.id, drawCalls: selection.cost.drawCalls, triangles: selection.cost.triangles };
});
// The worst town on each axis, level half only: the level is what the seeds
// differ in, and every room adds the same non-level pass to it.
const worstTownCalls = townLevels.reduce((a, b) => (b.drawCalls > a.drawCalls ? b : a));
const worstTownTriangles = townLevels.reduce((a, b) => (b.triangles > a.triangles ? b : a));

const copTrim = measureCopRig();
const copFull = measureCopRig({ full: true });
const copSeat = measureSeatRig('cop');
const playableRigs = PLAYABLE_RIDER_LOOKS.map((look) => ({ id: look.id, cost: measureSeatRig(look) }));
const worstRigCalls = playableRigs.reduce((a, b) => (b.cost.totalDrawCalls > a.cost.totalDrawCalls ? b : a));
const worstRigTriangles = playableRigs.reduce((a, b) => (b.cost.totalTriangles > a.cost.totalTriangles ? b : a));
const lightestRigTriangles = playableRigs.reduce((a, b) => (b.cost.totalTriangles < a.cost.totalTriangles ? b : a));
const instancedReserve = modelInstancedPackReserve(slice.checkpoints);

/** Every room of one contract, grouped by shape, each shape's per-axis worst pass. */
function roomShapes(views) {
  const shapes = new Map();
  for (const room of chaseRooms(views)) {
    // Named as the plan names them: outlaws v cops, and who holds the slot.
    const label = room.copSeated
      ? `${room.outlaws.length}v1, human cop`
      : `${room.outlaws.length}v${room.pack}, CPU pack`;
    const cost = measureChaseRoomScene(slice.checkpoints, room);
    const shape = shapes.get(label) ?? { label, views: chaseRoomViews(room), rooms: 0, drawCalls: 0, triangles: 0 };
    shape.rooms += 1;
    shape.drawCalls = Math.max(shape.drawCalls, cost.totalDrawCalls);
    shape.triangles = Math.max(shape.triangles, cost.totalTriangles);
    shapes.set(label, shape);
  }
  return [...shapes.values()];
}
const chaseContracts = [
  { name: 'Contract 1 (solo)', shapes: roomShapes(1), reserve: reserve, budget: RENDER_BUDGET },
  { name: 'Contract 2 (split)', shapes: roomShapes(2), reserve: splitReserve, budget: RENDER_BUDGET_SPLIT },
  { name: 'Contract 3 (grid)', shapes: roomShapes(4), reserve: quadReserve, budget: RENDER_BUDGET_QUAD },
];

const rigRow = (label, cost) => (
  `${padEnd(label, 36)}${pad(cost.drawCalls, 7)}${pad(cost.shadowDrawCalls, 8)}${pad(cost.totalDrawCalls, 7)}${pad(cost.totalTriangles, 10)}`
);

out('## The chase rooms — M39 Part P (q209, q219)');
out();
out('The chase rule with two faces: up to three outlaws against one cop slot,');
out(`the slot either a CPU pack of \`CHASE.roomSize − outlaws\` Dorkins trims (roomSize ${CHASE.roomSize})`);
out('or one human on the cop\'s full rig (q218), never both. Every figure below is');
out('measured from the built scene; the instanced pack alone is modelled.');
out();
out('**The cop rig, and the rigs it is compared with** (posed and armed):');
out();
out('```');
out(`${padEnd('rig', 36)}${pad('colour', 7)}${pad('shadow', 8)}${pad('calls', 7)}${pad('triangles', 10)}`);
out('-'.repeat(68));
out(rigRow('cop trim (shipped)', copTrim));
out(rigRow('cop, full rig (q218)', copFull));
out(rigRow('cop seat rig', copSeat));
out(rigRow(`worst playable, calls (${worstRigCalls.id})`, worstRigCalls.cost));
out(rigRow(`worst playable, tris (${worstRigTriangles.id})`, worstRigTriangles.cost));
out(rigRow(`lightest playable, tris (${lightestRigTriangles.id})`, lightestRigTriangles.cost));
out('```');
out();
out(`The full cop rig is the seat rig, and it is ${worstRigCalls.cost.totalDrawCalls - copFull.totalDrawCalls} calls and`);
out(`${(worstRigTriangles.cost.totalTriangles - copFull.totalTriangles).toLocaleString('en-GB')} triangles under the worst playable rig: \`COP_LOOK\` has no elbow pads,`);
out('sleeve panels or separate seat mesh, and nothing was added to reach a number.');
out('So the uniform\'s delta over the rigs a room seats him beside is negative on');
out('both axes, and a room holding him can never outgrow the same room holding');
out('one more playable rider.');
out();
out('**The solo reserve wears the pack** — three trims in the second-rider slot:');
out();
out('```');
out(`${padEnd('', 26)}${pad('calls', 7)}${pad('triangles', 11)}`);
out(`${padEnd('plain pack (ships)', 26)}${pad(reserve.totalDrawCalls, 7)}${pad(reserve.totalTriangles, 11)}`);
out(`${padEnd('instanced pack (modelled)', 26)}${pad(instancedReserve.totalDrawCalls, 7)}${pad(instancedReserve.totalTriangles, 11)}`);
out('```');
out();
out('The instanced row is priced, not built: three cops from one set of draw');
out('calls (an `InstancedMesh` per rig part, the shadow subset instanced too) is');
out('the one-trim frame\'s calls with two more trims\' triangles on both passes.');
out('It is held as the remedy if the phone rejects the plain route; no game code');
out('builds it.');
out();
out(`**The worst town seed.** Over ${townLevels.length} town seeds (the chase corpus and \`euc-1\` … \`euc-24\`,`);
out(`each on the recipe it selects), the dearest level is \`${worstTownCalls.seed}\` on calls (${worstTownCalls.drawCalls}) and`);
out(`\`${worstTownTriangles.seed}\` on triangles (${worstTownTriangles.triangles.toLocaleString('en-GB')}). The library bound is ${LIBRARY_MAX_DRAW_CALLS} calls.`);
out();
out('**Every room the rule allows, per contract** — the per-axis worst pass of');
out('each room shape over its playable seatings, times its views:');
out();
out('```');
out(`${padEnd('room', 24)}${pad('rooms', 6)}${pad('views', 6)}${pad('pass calls', 11)}${pad('pass tris', 11)}${pad('town frame', 12)}${pad('town tris', 11)}${pad('bound', 7)}`);
out('-'.repeat(88));
for (const contract of chaseContracts) {
  out(`${contract.name}`);
  for (const shape of contract.shapes) {
    const townCalls = (worstTownCalls.drawCalls + shape.drawCalls) * shape.views;
    const townTriangles = (worstTownTriangles.triangles + shape.triangles) * shape.views;
    const bound = (LIBRARY_MAX_DRAW_CALLS + shape.drawCalls) * shape.views;
    out(`  ${padEnd(shape.label, 22)}${pad(shape.rooms, 6)}${pad(shape.views, 6)}${pad(shape.drawCalls, 11)}${pad(shape.triangles, 11)}${pad(townCalls, 12)}${pad(townTriangles, 11)}${pad(bound, 7)}`);
  }
}
out('```');
out();
out('**The contracts, reserve and ceiling.** A reserve is the per-axis worst of');
out('today\'s seatings wearing a companion and the rooms above; the worst frame is');
out('the worst town seed through the contract\'s passes, and the bound is the');
out('library\'s set-union bound the ceiling rests on:');
out();
out('```');
out(`${padEnd('', 20)}${pad('reserve', 9)}${pad('tris', 10)}${pad('town frame', 12)}${pad('town tris', 12)}${pad('bound', 7)}${pad('ceiling', 9)}${pad('tris', 12)}`);
out('-'.repeat(91));
for (const [contract, passes] of [[chaseContracts[0], 1], [chaseContracts[1], SPLIT_PASSES], [chaseContracts[2], QUAD_PASSES]]) {
  const townCalls = (worstTownCalls.drawCalls + contract.reserve.totalDrawCalls) * passes;
  const townTriangles = (worstTownTriangles.triangles + contract.reserve.totalTriangles) * passes;
  const bound = (LIBRARY_MAX_DRAW_CALLS + contract.reserve.totalDrawCalls) * passes;
  out(`${padEnd(contract.name, 20)}${pad(contract.reserve.totalDrawCalls, 9)}${pad(contract.reserve.totalTriangles, 10)}${pad(townCalls, 12)}${pad(townTriangles, 12)}${pad(bound, 7)}${pad(contract.budget.maxDrawCalls, 9)}${pad(contract.budget.maxTriangles, 12)}`);
}
out('```');
out();
out('Reserve changes follow R-5 (`docs/M39_CHASE.md` §2f): each ceiling moves');
out('by its passes times its own reserve\'s growth, on each axis, never down.');
out('The separate owner-authorized environment R15 amendment adds three shared');
out('route-face library slots per view, with reserves and triangle ceilings unchanged.');
out('The measured town frame sits beside each ceiling; it is never the ceiling.');
out();

// ---------------------------------------------------------------------------
// Ultra — M39, the optional single-player recipe (docs/M39_ULTRA.md §5)
// ---------------------------------------------------------------------------

/**
 * The Ultra section, as its own list of lines.
 *
 * Kept apart from `lines` so the ordinary report stays byte-identical to what
 * it was before Ultra existed: it reaches stdout spliced after the enhanced
 * section only with `--ultra`, and reaches `docs/RENDER_COST_ULTRA.md` under
 * its own heading. Everything is measured here from the built scene, exactly
 * as the rest of this file is; `src/render/ultra/ultraCost.test.ts` is the
 * assertion and this is the report.
 */
function ultraReportLines() {
  const ul = [];
  const put = (line = '') => { ul.push(line); };
  const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`;
  const group = (value) => Number(value).toLocaleString('en-GB');

  const ultraParts = measurePartTriangles(ULTRA_FULL);
  const enhancedMeasured = enhancedParts;
  const worlds = [
    ['the slice', slice],
    ['BelVar Circuit', track],
    ['Switchback Park', park],
    ['the proving ground', proving],
    ['the euc town', generateLevel('euc').plan],
    ['the heavy seed (route-41 at 65 mph)', generateLevel('route-41', undefined, undefined, 65).plan],
  ].map(([name, plan]) => ({
    name,
    plan,
    judgement: judgeUltra(plan, HEADLESS_CAPS),
    rungs: ULTRA_LADDER.map((rung) => ({
      rung,
      model: ultraCostBreakdown(plan, rung),
      built: measureLevelScene(plan, rung),
    })),
  }));

  put('## Ultra — the optional single-player recipe, measured (M39)');
  put();
  put('Ultra renders the same plan forward to the same MSAA canvas with no post');
  put('chain, priced render-side by `src/render/ultra/ultraCost.ts` against its own');
  put('envelope (`ultraEnvelope.ts`) — never by admission, never against Contracts');
  put('1–3. The model is checked against the built scene by');
  put('`src/render/ultra/ultraCost.test.ts`, exactly; this section is the report.');
  put('The catalogue below is regenerated into `src/render/ultra/ultraCatalog.ts`');
  put('by `--write` / `--write-ultra`.');
  put();

  // -- Parts --------------------------------------------------------------
  put('### The kit, part by part');
  put();
  put('```');
  put(`${padEnd('part', 16)}${pad('baseline', 10)}${pad('enhanced', 10)}${pad('ultra', 8)}  casts (ultra)  full-rung builder`);
  put('-'.repeat(78));
  for (const part of PROP_PART_IDS) {
    const baseline = baselineParts.get(part);
    const enhanced = enhancedMeasured.get(part);
    const ultra = ultraParts.get(part);
    if (baseline === undefined || enhanced === undefined || ultra === undefined) {
      throw new Error(`${part} is missing from a measured kit`);
    }
    put(`${padEnd(part, 16)}${pad(baseline.triangles, 10)}${pad(enhanced.triangles, 10)}${pad(ultra.triangles, 8)}  `
      + `${padEnd(ultra.castsShadow ? 'yes' : 'no', 13)}  ${ultraPartSource(part, ULTRA_FULL)}`);
  }
  put('```');
  put();
  put('`ultra-lit` draws the enhanced/baseline builder for every `forms` part and');
  put('keeps the `buildings` parts; a part whose cast flag turns on is charged a');
  put('second draw call and its triangles again in the shadow pass.');
  put();

  // -- Model against the built scene ---------------------------------------
  put('### The six worlds, model against the built scene');
  put();
  for (const world of worlds) {
    const [full, lit] = world.rungs;
    const verdict = world.judgement;
    put(`${world.name} (\`${world.plan.id}\`) is built with **${verdict.recipe === null ? 'High' : verdict.recipe.id}**`
      + `${verdict.refusal === null ? '' : ` — refused: ${JSON.stringify(verdict.refusal)}`}.`);
    put();
    put('```');
    put(`${padEnd('', 28)}${pad(full.rung.id, 12)}${pad('built', 10)}${pad(lit.rung.id, 12)}${pad('built', 10)}`);
    const row = (label, model, built) => {
      put(`${padEnd(label, 28)}${pad(model(full), 12)}${pad(built(full), 10)}${pad(model(lit), 12)}${pad(built(lit), 10)}`);
    };
    row('level colour draw calls', (r) => r.model.colourDrawCalls, (r) => r.built.drawCalls);
    row('level shadow draw calls', (r) => r.model.shadowDrawCalls, (r) => r.built.shadowDrawCalls);
    row('level colour triangles', (r) => r.model.colourTriangles, (r) => r.built.triangles);
    row('level shadow triangles', (r) => r.model.shadowTriangles, (r) => r.built.shadowTriangles);
    row('  prop family draw calls', (r) => r.model.frame.props.drawCalls, (r) => r.built.byCategory.props.totalDrawCalls);
    row('  prop family triangles', (r) => r.model.frame.props.triangles, (r) => r.built.byCategory.props.totalTriangles);
    row('  blocks, colour pass', (r) => r.model.blockColourTriangles, (r) => r.built.byCategory.blocks.triangles);
    row('solo frame draw calls', (r) => r.model.frame.solo.drawCalls, (r) => r.built.totalDrawCalls + NON_LEVEL_RESERVE.drawCalls);
    row('solo frame triangles', (r) => r.model.frame.solo.triangles, (r) => r.built.totalTriangles + NON_LEVEL_RESERVE.triangles);
    put('```');
    const flips = full.model.castFlips;
    put();
    put(`Cast flips under the full rung: ${flips.length === 0 ? 'none' : flips.join(', ')}.`);
    put();
  }

  // -- Pass list -----------------------------------------------------------
  const town = worlds[4];
  put(`### The pass list — ${town.name}, ${ULTRA_FULL.id}`);
  put();
  put('```');
  put(`${padEnd('pass', 20)}${padEnd('when', 14)}${pad('calls', 8)}${pad('triangles', 12)}`);
  put('-'.repeat(54));
  for (const pass of town.rungs[0].model.frame.passes) {
    put(`${padEnd(pass.name, 20)}${padEnd(pass.when, 14)}${pad(pass.drawCalls, 8)}${pad(pass.triangles, 12)}`);
  }
  put(`${padEnd('non-level reserve', 20)}${padEnd('every-frame', 14)}${pad(NON_LEVEL_RESERVE.drawCalls, 8)}${pad(NON_LEVEL_RESERVE.triangles, 12)}`);
  put('```');
  put();
  put('Two scene renders per frame (the near shadow and the colour pass), exactly');
  put('as High; zero full-screen passes and zero per-frame render targets. The far');
  put('depth render and the PMREM build run once per world activation and after a');
  put('context restore, never mid-ride. Tone mapping and output happen once, in');
  put('shader, on the canvas.');
  put();

  // -- Shadow configuration -------------------------------------------------
  const ordinaryRig = shadowRigFor('ordinary', 'high');
  const ultraRig = shadowRigFor('ultra', 'high');
  put('### Shadow configuration');
  put();
  put('```');
  put(`${padEnd('', 16)}${pad('High', 12)}${pad('Ultra', 12)}`);
  for (const field of ['mapSize', 'extent', 'near', 'far', 'bias', 'normalBias', 'radius', 'intensity',
    'lightDistance', 'forwardShare', 'snap', 'fadeShare']) {
    put(`${padEnd(field, 16)}${pad(String(ordinaryRig[field]), 12)}${pad(String(ultraRig[field]), 12)}`);
  }
  put(`${padEnd('far map', 16)}${pad('—', 12)}${pad(ULTRA_FULL.ultra.farShadow ? `${ULTRA.farShadow.mapSize}²` : 'off', 12)}`);
  put('```');
  put();
  put('The rig figures are `render/ultra/ultraLighting.ts:shadowRigFor`\'s own');
  put('(the lighting owner\'s); the far map is the full rung\'s static depth render');
  put('(`ultra-lit` keeps it off).');
  put();

  // -- Targets --------------------------------------------------------------
  // The phone row is Playwright's Pixel 7 (412×839 CSS at DPR 2.625), which
  // the renderer caps at DPR 2: 824×1678, 1.38 MP — under the 2,000,000 px at
  // which the runtime keeps the 4096 / 3072 shadow maps (A22, Fable F5).
  const buffers = [
    ['q205 reference, 1920×1080 @1', 1920, 1080, 1],
    ['panel native, 2560×1600 @1', 2560, 1600, 1],
    ['the Air "looks like 1440×900" @2', 1440, 900, 2],
    ['a phone, Pixel 7 412×839 @2.625', 412, 839, 2.625],
  ].map(([label, cssW, cssH, dpr]) => {
    const highRatio = Math.min(dpr, RENDER.maxPixelRatio);
    const ultraRatio = Math.min(dpr, RENDER.maxPixelRatio, Math.sqrt(ULTRA.pixelBudget / (cssW * cssH)));
    return {
      label,
      high: { width: Math.floor(cssW * highRatio), height: Math.floor(cssH * highRatio) },
      ultra: { width: Math.floor(cssW * ultraRatio), height: Math.floor(cssH * ultraRatio) },
    };
  });
  const targetLists = buffers.map((buffer) => ultraTargetBytes(ULTRA_FULL, buffer.ultra));
  const sameEverywhere = targetLists.every((list) => JSON.stringify(list) === JSON.stringify(targetLists[0]));
  // Which rows move with the buffer: A22 sizes the two shadow maps from it
  // (`ultraShadowMapSizesFor`); the rest are fixed. Found, not assumed.
  const movingRows = [...new Set(targetLists.flatMap((list) => list
    .filter((target, index) => JSON.stringify(target) !== JSON.stringify(targetLists[0][index]))
    .map((target) => target.name)))];
  put('### Ultra-owned targets, formats and bytes');
  put();
  put('```');
  put(`${padEnd('target', 34)}${pad('size', 12)}  ${padEnd('format', 24)}${pad('bytes', 12)}`);
  put('-'.repeat(86));
  for (const target of targetLists[0]) {
    const size = target.width === 0 ? '—' : `${target.width}×${target.height}`;
    put(`${padEnd(target.name, 34)}${pad(size, 12)}  ${padEnd(target.format, 24)}${pad(mib(target.bytes), 12)}`);
  }
  const fullBytes = ultraBytes(ULTRA_FULL);
  const litBytes = ultraBytes(ULTRA_LADDER[1]);
  put('-'.repeat(86));
  put(`${padEnd(`steady, ${ULTRA_FULL.id}`, 72)}${pad(mib(fullBytes.steady), 12)}`);
  put(`${padEnd(`steady, ${ULTRA_LADDER[1].id}`, 72)}${pad(mib(litBytes.steady), 12)}`);
  put(`${padEnd(`switch peak, ${ULTRA_FULL.id} (PMREM ping-pong + half-float source)`, 72)}${pad(mib(fullBytes.peakSwitch), 12)}`);
  put(`${padEnd('ceilings (steady / peak)', 60)}${pad(mib(ULTRA_ENVELOPE.bytes), 12)}${pad(mib(ULTRA_ENVELOPE.peakSwitchBytes), 12)}`);
  put('```');
  put();
  put(`Priced at ${ULTRA_JUDGE_BUFFER.width}×${ULTRA_JUDGE_BUFFER.height}, the buffer admission judges (the largest Ultra draws to).`);
  if (sameEverywhere) {
    put('The list is identical at every drawing buffer below (no post chain, no per-frame target).');
  } else {
    put(`Only ${movingRows.map((name) => `\`${name}\``).join(' and ')} follow the drawing buffer (A22: \`ultraShadowMapSizesFor\`,`);
    put('4096 near / 3072 far from 2,000,000 px up, 2048 / 2048 below); every other row is fixed. Per buffer:');
    put();
    put('```');
    put(`${padEnd('display', 36)}${pad('Ultra buffer', 14)}${pad('near', 7)}${pad('far', 7)}${pad('steady', 13)}${pad('peak', 13)}`);
    buffers.forEach((buffer, index) => {
      const list = targetLists[index];
      const edge = (name) => list.find((target) => target.name === name)?.width ?? '—';
      const bytes = ultraBytes(ULTRA_FULL, buffer.ultra);
      put(`${padEnd(buffer.label, 36)}${pad(`${buffer.ultra.width}×${buffer.ultra.height}`, 14)}`
        + `${pad(edge('near-shadow'), 7)}${pad(edge('far-shadow'), 7)}${pad(mib(bytes.steady), 13)}${pad(mib(bytes.peakSwitch), 13)}`);
    });
    put('```');
  }
  put();
  put('The canvas itself is not Ultra-owned: High draws to the same MSAA default');
  put('framebuffer, and the pixel budget only ever makes Ultra\'s smaller. Estimated');
  put(`as ${ULTRA_ENVELOPE.msaaSamples}× (RGBA8 + depth-stencil) plus the RGBA8 resolve, 36 bytes a pixel —`);
  put('the browser owns the real allocation:');
  put();
  put('```');
  put(`${padEnd('display', 36)}${pad('High buffer', 14)}${pad('Ultra buffer', 14)}${pad('High canvas', 13)}${pad('Ultra canvas', 14)}`);
  const canvas = (buffer) => buffer.width * buffer.height * (ULTRA_ENVELOPE.msaaSamples * 8 + 4);
  for (const buffer of buffers) {
    put(`${padEnd(buffer.label, 36)}${pad(`${buffer.high.width}×${buffer.high.height}`, 14)}`
      + `${pad(`${buffer.ultra.width}×${buffer.ultra.height}`, 14)}${pad(mib(canvas(buffer.high)), 13)}${pad(mib(canvas(buffer.ultra)), 14)}`);
  }
  put('```');
  put();

  // -- Headroom -------------------------------------------------------------
  put('### Envelope headroom, per world (the rung each is built with)');
  put();
  put('```');
  put(`${padEnd('world', 38)}${padEnd('rung', 12)}${pad('solo calls', 12)}${pad('solo tris', 12)}`
    + `${pad('prop calls', 12)}${pad('prop tris', 11)}${pad('far calls', 11)}${pad('far tris', 10)}`);
  put('-'.repeat(118));
  put(`${padEnd('ceiling', 38)}${padEnd('', 12)}${pad(ULTRA_ENVELOPE.soloDraws, 12)}${pad(group(ULTRA_ENVELOPE.soloTriangles), 12)}`
    + `${pad(ULTRA_ENVELOPE.propDraws, 12)}${pad(group(ULTRA_ENVELOPE.propTriangles), 11)}`
    + `${pad(ULTRA_ENVELOPE.farDepthDraws, 11)}${pad(group(ULTRA_ENVELOPE.farDepthTriangles), 10)}`);
  for (const world of worlds) {
    const verdict = world.judgement;
    const rung = verdict.rungs.find((each) => each.id === verdict.recipe?.id) ?? verdict.rungs[verdict.rungs.length - 1];
    const far = rung.cost.passes.find((pass) => pass.name === 'far-shadow-build');
    put(`${padEnd(world.name, 38)}${padEnd(verdict.recipe === null ? 'refused' : rung.id, 12)}`
      + `${pad(rung.cost.solo.drawCalls, 12)}${pad(group(rung.cost.solo.triangles), 12)}`
      + `${pad(rung.cost.props.drawCalls, 12)}${pad(group(rung.cost.props.triangles), 11)}`
      + `${pad(far === undefined ? '—' : far.drawCalls, 11)}${pad(far === undefined ? '—' : group(far.triangles), 10)}`);
  }
  put('```');
  put();
  put('The far columns are the model\'s layer-5 set. A world where a building cap');
  put('closes a slot (A16) also draws its cap bucket once more into the far map —');
  put('one activation-only call, the bucket\'s triangles again — which the model');
  put('leaves out; the far ceiling is settled on the drawn figure, and');
  put('`ultraCost.test.ts` holds the model plus that draw under it.');
  put();
  put(`Bytes and the near map are per rung and drawing buffer, not per world: ${mib(fullBytes.steady)} and a ${ULTRA.near.mapSize}² near map`);
  put(`on the full rung at the judge buffer against ${mib(ULTRA_ENVELOPE.bytes)} and ${ULTRA_ENVELOPE.shadowMap}². Live programs (≤ ${ULTRA_ENVELOPE.programs}) are held by`);
  put('`tests/m39-ultra.spec.ts` on the running game, never guessed here. No frame');
  put('interval or FPS figure is measured or implied (`AGENTS.md`).');
  put();

  // -- Per-fragment shadow fetches (Fable finding 8, A28; A29) ---------------
  // The envelope above prices calls, triangles, programs and bytes; A28's
  // screen kernel added per-fragment work none of them sees, and A29 compiled
  // it out again. The counts are the shaders' own (`ultraGroundShadowFetches`,
  // `ultraLiftFarFetches`, pinned against the GLSL by their tests), the
  // switch and the distance the tuning's.
  const nearFetch = ultraGroundShadowFetches();
  const farFetch = ultraLiftFarFetches();
  const kernelShipped = ULTRA.nearFilter.groundScreenKernel === true;
  const kernelFrom = ULTRA.nearFilter.groundScreenRampMetres[0];
  // What a shipped program fetches at most: the kernel's pieces only if the tuning compiles them in.
  const shipped = (withoutKernel, withKernel) => (kernelShipped ? withKernel : withoutKernel);
  const fetchRow = (name, map, runs, ship, kernel) => {
    put(`${padEnd(name, 40)}${padEnd(map, 6)}${padEnd(runs, 40)}${pad(ship, 9)}${pad(kernel, 9)}`);
  };
  put('### Per-fragment shadow fetches (not priced by the envelope)');
  put();
  put('The envelope prices draw calls, triangles, programs and bytes, not the work');
  put('a fragment does. What the Ultra ground\'s shadow sampling fetches per');
  put('fragment, each fetch one hardware depth compare. "shipped" is the most a');
  put('shipped program fetches, at any view distance. "kernel" is the ground\'s');
  put(`screen kernel (A28, Trade 2) past ${kernelFrom} m of view distance, where it is on.`);
  if (kernelShipped) {
    put('The kernel ships (`ULTRA.nearFilter.groundScreenKernel` true), so the two');
    put(`columns agree past ${kernelFrom} m; inside it the kernel is zero.`);
  } else {
    put('A29 compiled the kernel out (`ULTRA.nearFilter.groundScreenKernel` false):');
    put('no shipped program carries its far-caster disk or the lean\'s diagonals,');
    put('and its column is the record of what it cost, for its tests and the owner.');
  }
  put();
  put('```');
  fetchRow('fetch', 'map', 'runs on', 'shipped', 'kernel');
  put('-'.repeat(104));
  fetchRow('disk (ultraGroundShadow)', 'near', 'ground, paint, pothole ground, water', nearFetch.disk, nearFetch.disk);
  fetchRow('far-caster disk (the kernel\'s test)', 'near', 'the same, kernel compiled', shipped(0, nearFetch.farCaster), nearFetch.farCaster);
  fetchRow('static-shade lean (ultraFarShadeAround)', 'far', 'ground and paint in shade, far map', shipped(farFetch.lean, farFetch.lean + farFetch.kernelLean),
    farFetch.lean + farFetch.kernelLean);
  fetchRow('tall-caster ray point (the same lean)', 'far', '...where the lean found static shade', shipped(farFetch.lean, farFetch.lean + farFetch.kernelLean),
    farFetch.lean + farFetch.kernelLean);
  fetchRow('tall-caster vertical point', 'far', '...the same', farFetch.vertical, farFetch.vertical);
  put('-'.repeat(104));
  fetchRow('near map, per ground fragment', '', '', shipped(nearFetch.disk, nearFetch.disk + nearFetch.farCaster), nearFetch.disk + nearFetch.farCaster);
  fetchRow('far map, per lifted fragment at most', '', '', shipped(2 * farFetch.lean + farFetch.vertical, 2 * (farFetch.lean + farFetch.kernelLean) + farFetch.vertical),
    2 * (farFetch.lean + farFetch.kernelLean) + farFetch.vertical);
  put('```');
  put();
  put('The far map is read only where a fragment is in shade (the near map\'s, or a');
  put('face turned from the sun) and the far map is built (`ultra-lit` has none);');
  put('the blocks run the same lean, never with the kernel. Facades, foliage and');
  put('the rider keep their own filters, which neither A28 nor A29 changed and this');
  put('table does not list. No program, byte or pass is added; what a fetch costs on');
  put('a device is not measured or implied here (no frame interval or FPS figure,');
  put('`AGENTS.md`).');
  put();
  return ul;
}

const needUltra = ultraFlag || write || writeUltra || jsonReport;
const ultraLines = needUltra ? ultraReportLines() : [];
const ultraDocument = (section) => [
  '# Render cost — Ultra, measured (M39)',
  '',
  'Regenerate with `node tools/render-cost.mjs --write` (everything) or',
  '`--write-ultra` (the Ultra catalogue and this file only). The numbers are',
  'checked against the built scene by `src/render/ultra/ultraCost.test.ts`,',
  'which fails if the model and the renderer ever disagree — so this file is a',
  'report, never a source of truth. The ordinary report is `docs/RENDER_COST.md`.',
  '',
  ...section,
].join('\n');

let report = `${lines.join('\n')}\n`;
let spliced = `${[...lines.slice(0, ultraInsertAt), ...ultraLines, ...lines.slice(ultraInsertAt)].join('\n')}\n`;
let ultraReport = needUltra ? `${ultraDocument(ultraLines)}` : '';

// The re-run's answer. No `process.exit` after it: a large write to a pipe
// is flushed asynchronously, and exiting early truncates the JSON.
if (jsonReport) process.stdout.write(JSON.stringify({ report, spliced, ultraReport }));

/**
 * The Ultra catalogue, from the full rung's built kit — every part a line,
 * `enhancedCatalog.ts`'s pattern, and a part without a line is an error
 * rather than a stale price.
 */
function rewriteUltraCatalogue() {
  const target = join(src, 'render/ultra/ultraCatalog.ts');
  const before = readFileSync(target, 'utf8');
  let after = before;
  const measuredUltra = measurePartTriangles(ULTRA_FULL);
  for (const part of PROP_PART_IDS) {
    const cost = measuredUltra.get(part);
    if (cost === undefined) throw new Error(`the Ultra kit built no ${part}`);
    const pattern = new RegExp(`^(\\s*)${part}: \\{ triangles: \\d+, castsShadow: (?:true|false) \\},$`, 'm');
    if (!pattern.test(after)) {
      throw new Error(`${part} has no line in src/render/ultra/ultraCatalog.ts`);
    }
    after = after.replace(pattern, `$1${part}: { triangles: ${cost.triangles}, castsShadow: ${cost.castsShadow} },`);
  }
  writeFileSync(target, after);
  return after !== before;
}

/**
 * Every report priced against the files as they are now on disk — a fresh
 * read-only process, because this one imported the previous reserves and
 * catalogues at start. It has no write flag, so it cannot recurse or write.
 */
function freshReports() {
  return JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--json-report'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }));
}

// The report files are internal documentation. In the published repository —
// this tool ships so a contributor can measure a new segment's row — `docs/`
// is the built game, there is no report to refresh, and writing one there
// would pollute the Pages package. The presence of `docs/RENDER_COST.md` is
// what says this is the development tree, for the Ultra report as well.
const reportTarget = join(root, 'docs/RENDER_COST.md');
const ultraReportTarget = join(root, 'docs/RENDER_COST_ULTRA.md');
const developmentTree = existsSync(reportTarget);

let written = '';
if (jsonReport) {
  // Answered above; a re-run writes nothing.
} else if (write) {
  const sourceTarget = join(src, 'data/renderCost.ts');
  const sourceBefore = readFileSync(sourceTarget, 'utf8');
  const sourceInteger = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
  // **One rewriter, two reserves** — M25 Phase 3. It was a single hardcoded
  // pattern for a single constant; Contract 2 needs a second, and a second copy
  // of the regex is how the two would drift. Each still throws its own named
  // error rather than skipping silently, which is what made the M14 pass find
  // that a stray comment had left the tool unusable for a milestone.
  const rewriteReserve = (source, name, drawCalls, triangles) => {
    const pattern = new RegExp(
      `(export const ${name} = deepFreeze\\(\\{\\n  drawCalls: )[\\d_]+(,\\n  triangles: )[\\d_]+(,\\n\\}\\);)`,
    );
    if (!pattern.test(source)) {
      throw new Error(`could not locate ${name} in src/data/renderCost.ts`);
    }
    return source.replace(pattern, `$1${sourceInteger(drawCalls)}$2${sourceInteger(triangles)}$3`);
  };
  /** A reserve as the file holds it now, before this run rewrites it. */
  const readReserve = (source, name) => {
    const match = source.match(new RegExp(
      `export const ${name} = deepFreeze\\(\\{\\n  drawCalls: ([\\d_]+),\\n  triangles: ([\\d_]+),\\n\\}\\);`,
    ));
    if (match === null) throw new Error(`could not locate ${name} in src/data/renderCost.ts`);
    return { drawCalls: Number(match[1].replaceAll('_', '')), triangles: Number(match[2].replaceAll('_', '')) };
  };
  /**
   * One contract's ceiling, moved by R-5's rule: `passes × (new reserve − old
   * reserve)` on each axis, and only when the reserve grew. The block is found
   * by its declaration and the field by its own line, so the hand-written
   * notes around them are never touched, and a block or field that cannot be
   * found throws by name rather than skipping — the rewriter's standing rule.
   */
  const rewriteCeiling = (source, name, passes, before, after) => {
    const block = source.match(new RegExp(`export const ${name} = deepFreeze\\(\\{[\\s\\S]*?\\n\\}\\);`));
    if (block === null) throw new Error(`could not locate ${name} in src/data/renderCost.ts`);
    let text = block[0];
    for (const [field, axis] of [['maxDrawCalls', 'drawCalls'], ['maxTriangles', 'triangles']]) {
      const pattern = new RegExp(`(\\n  ${field}: )([\\d_]+)(,\\n)`);
      const found = text.match(pattern);
      if (found === null) throw new Error(`could not locate ${name}.${field} in src/data/renderCost.ts`);
      const growth = after[axis] - before[axis];
      if (growth <= 0) continue;
      const moved = Number(found[2].replaceAll('_', '')) + passes * growth;
      text = text.replace(pattern, `$1${sourceInteger(moved)}$3`);
    }
    return source.replace(block[0], text);
  };
  let sourceAfter = rewriteReserve(
    sourceBefore, 'NON_LEVEL_RESERVE', reserve.totalDrawCalls, reserve.totalTriangles,
  );
  sourceAfter = rewriteReserve(
    sourceAfter, 'SPLIT_NON_LEVEL_RESERVE',
    splitReserve.totalDrawCalls, splitReserve.totalTriangles,
  );
  sourceAfter = rewriteReserve(
    sourceAfter, 'QUAD_NON_LEVEL_RESERVE',
    quadReserve.totalDrawCalls, quadReserve.totalTriangles,
  );
  // **The ceilings follow their reserves** — M39 Part P (q209, q219;
  // docs/M39_CHASE.md §2f, R-5). Read before the rewrite, so the growth is
  // the file's old reserve against the measurement, and a second `--write`
  // finds no growth and moves nothing.
  const ceilingMoves = [
    ['RENDER_BUDGET', 'NON_LEVEL_RESERVE', 1, reserve],
    ['RENDER_BUDGET_SPLIT', 'SPLIT_NON_LEVEL_RESERVE', SPLIT_PASSES, splitReserve],
    ['RENDER_BUDGET_QUAD', 'QUAD_NON_LEVEL_RESERVE', QUAD_PASSES, quadReserve],
  ];
  for (const [ceiling, reserveName, passes, measuredReserve] of ceilingMoves) {
    sourceAfter = rewriteCeiling(sourceAfter, ceiling, passes, readReserve(sourceBefore, reserveName), {
      drawCalls: measuredReserve.totalDrawCalls,
      triangles: measuredReserve.totalTriangles,
    });
  }
  writeFileSync(sourceTarget, sourceAfter);

  // The enhanced catalogue, from the enhanced kit — one line per part, and a
  // part the kit stopped enriching is an error rather than a stale price.
  const catalogueTarget = join(src, 'render/enhancedCatalog.ts');
  const catalogueBefore = readFileSync(catalogueTarget, 'utf8');
  let catalogue = catalogueBefore;
  for (const row of enhancedRows) {
    const pattern = new RegExp(`^(\\s*)${row.part}: \\{ triangles: \\d+, castsShadow: (?:true|false) \\},$`, 'm');
    if (!pattern.test(catalogue)) {
      throw new Error(`${row.part} is enriched by the kit but has no line in src/render/enhancedCatalog.ts`);
    }
    catalogue = catalogue.replace(pattern, `$1${row.part}: { triangles: ${row.enhanced}, castsShadow: ${row.castsShadow} },`);
  }
  writeFileSync(catalogueTarget, catalogue);

  // The Ultra catalogue (M39), which the reserve above also prices.
  const ultraChanged = rewriteUltraCatalogue();

  // The selector imported the previous reserves/catalogues at process start.
  // If any of them changed, a fresh read-only process must price the reports
  // against the files just written. Buffer output until that consistent
  // report exists.
  if (sourceAfter !== sourceBefore || catalogue !== catalogueBefore || ultraChanged) {
    ({ report, spliced, ultraReport } = freshReports());
  }

  if (developmentTree) {
    writeFileSync(reportTarget, report);
    writeFileSync(ultraReportTarget, ultraReport);
    written = 'src/data/renderCost.ts, src/render/enhancedCatalog.ts, src/render/ultra/ultraCatalog.ts, '
      + 'docs/RENDER_COST.md, docs/RENDER_COST_ULTRA.md';
  } else {
    written = 'src/data/renderCost.ts, src/render/enhancedCatalog.ts, src/render/ultra/ultraCatalog.ts '
      + '(no docs/RENDER_COST.md here; reports skipped)';
  }
} else if (writeUltra) {
  // The integrator's command after a forms change: the Ultra catalogue and
  // its report, and no ordinary file at all.
  if (rewriteUltraCatalogue()) ({ report, spliced, ultraReport } = freshReports());
  if (developmentTree) {
    writeFileSync(ultraReportTarget, ultraReport);
    written = 'src/render/ultra/ultraCatalog.ts, docs/RENDER_COST_ULTRA.md';
  } else {
    written = 'src/render/ultra/ultraCatalog.ts (no docs/RENDER_COST.md here; report skipped)';
  }
}
if (!jsonReport) process.stdout.write(writeUltra ? ultraReport : ultraFlag ? spliced : report);
if (written) console.log(`\nwritten: ${written}`);
