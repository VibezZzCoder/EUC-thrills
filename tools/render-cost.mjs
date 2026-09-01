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
 *   node tools/render-cost.mjs            print the table
 *   node tools/render-cost.mjs --write    refresh the reserve and report
 *
 * Draw calls, triangles, instance counts, and GPU object counts are reportable
 * evidence. A frame interval is not (`AGENTS.md`); nothing here measures time.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

const { buildLevelPlan } = await import(join(src, 'level/buildPlan.ts'));
const { SLICE_BEATS, SLICE_GRAPH, SLICE_POCKETS, createSliceLevel } = await import(join(src, 'level/sliceLevel.ts'));
const { createProvingGround } = await import(join(src, 'level/provingGround.ts'));
const { createTrackLevel, TRACK_LAP_METRES } = await import(join(src, 'level/trackLevel.ts'));
const { planRenderCost } = await import(join(src, 'level/renderBudget.ts'));
const { LIBRARY_MAX_DRAW_CALLS, NON_LEVEL_RESERVE, PART_COSTS, QUAD_PASSES, RENDER_BUDGET, RENDER_BUDGET_QUAD, RENDER_BUDGET_SPLIT, SPLIT_PASSES, propPartCounts } = await import(join(src, 'data/renderCost.ts'));
const { measureLevelScene, measureNonLevelScene, measureQuadNonLevelScene, measureSplitNonLevelScene } = await import(join(src, 'render/renderCost.ts'));

const write = process.argv.includes('--write');

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
const out = (line = '') => { lines.push(line); console.log(line); };

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
out('**B1 spent seven of the ten calls the library had spare**');
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
out('Time-trial ghost or M18\'s chase cop. The two are alternatives');
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
out('"Everything else" here is the single-player reserve plus a whole second');
out(`rider and machine — ${splitReserve.totalDrawCalls - NON_LEVEL_RESERVE.drawCalls} calls and `
  + `${(splitReserve.totalTriangles - NON_LEVEL_RESERVE.triangles).toLocaleString('en-GB')} triangles more `
  + 'than one rider, measured');
out('over unordered distinct pairs of playable riders, per-axis worst. Distinct');
out('because two riders on one screen are never the same character.');
out();
out(`**The structural bound doubles with the passes.** A level drawing on every`);
out(`surface, material and prop part at once costs ${LIBRARY_MAX_DRAW_CALLS} calls, so no split frame`);
out(`the library can build exceeds ${splitLibraryBound} calls — which is what`);
out('`render/renderCost.test.ts` asserts against the ceiling, exactly as it does');
out('for Contract 1. **Contract 1 is untouched by any of this**: single-player');
out('frames are one pass and are measured, reserved and bounded above.');
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

const quadTriangleLine = RENDER_BUDGET.maxTriangles * 0.8;
const belvarQuadPass = {
  drawCalls: trackPredicted.drawCalls + quadReserve.totalDrawCalls,
  triangles: trackPredicted.triangles + quadReserve.totalTriangles,
};
const belvarQuadFrame = {
  drawCalls: belvarQuadPass.drawCalls * QUAD_PASSES,
  triangles: belvarQuadPass.triangles * QUAD_PASSES,
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
out('here, and BelVar is a datapoint rather than a second contract. Contracts 1');
out('and 2 are untouched; all three are pinned and none has exemptions (§27.5).');
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
out('ghost and cop slots: the split reserve\'s discipline at four rigs.');
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
out('**The world four-seat free ride can open — the generated worst, four passes.**');
out('The level line is Contract 2\'s own: the library set-union bound on calls');
out(`(${LIBRARY_MAX_DRAW_CALLS}), and the generator's 80% triangle line (${quadTriangleLine.toLocaleString('en-GB')}) that`);
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
out('The headroom is derived rather than generous: every new character costs four');
out('times in a grid frame, and Contract 2 left the equivalent of 1.44 characters');
out('on the draw-call axis and 2.4 on the triangle axis. These are those margins,');
out(`scaled. For scale, Contract 2 — the two-seat ceiling, never touched — is`);
out(`${RENDER_BUDGET_SPLIT.maxDrawCalls} calls / ${RENDER_BUDGET_SPLIT.maxTriangles.toLocaleString('en-GB')} triangles, and Contract 1 — the phone, never bent — is`);
out(`${RENDER_BUDGET.maxDrawCalls} calls / ${RENDER_BUDGET.maxTriangles.toLocaleString('en-GB')} triangles.`);
out();

if (write) {
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
  writeFileSync(sourceTarget, sourceAfter);

  // The report file is internal documentation. In the published repository —
  // this tool ships so a contributor can measure a new segment's row — `docs/`
  // is the built game, there is no report to refresh, and writing one there
  // would pollute the Pages package. The reserve above is the functional part.
  const reportTarget = join(root, 'docs/RENDER_COST.md');
  if (existsSync(reportTarget)) {
    writeFileSync(reportTarget, `${lines.join('\n')}\n`);
    console.log(`\nwritten: src/data/renderCost.ts, docs/RENDER_COST.md`);
  } else {
    console.log(`\nwritten: src/data/renderCost.ts (no docs/RENDER_COST.md here; report skipped)`);
  }
}
