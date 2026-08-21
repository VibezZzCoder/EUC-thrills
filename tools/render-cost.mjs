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
const { LIBRARY_MAX_DRAW_CALLS, NON_LEVEL_RESERVE, PART_COSTS, RENDER_BUDGET, propPartCounts } = await import(join(src, 'data/renderCost.ts'));
const { measureLevelScene, measureNonLevelScene } = await import(join(src, 'render/renderCost.ts'));

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

if (write) {
  const sourceTarget = join(src, 'data/renderCost.ts');
  const sourceBefore = readFileSync(sourceTarget, 'utf8');
  const reservePattern = /(export const NON_LEVEL_RESERVE = deepFreeze\(\{\n  drawCalls: )[\d_]+(,\n  triangles: )[\d_]+(,\n\}\);)/;
  if (!reservePattern.test(sourceBefore)) {
    throw new Error('could not locate NON_LEVEL_RESERVE in src/data/renderCost.ts');
  }
  const sourceInteger = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
  const sourceAfter = sourceBefore.replace(
    reservePattern,
    `$1${sourceInteger(reserve.totalDrawCalls)}$2${sourceInteger(reserve.totalTriangles)}$3`,
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
