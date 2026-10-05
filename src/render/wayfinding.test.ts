/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { MARKINGS, PAINTABLE_SURFACES, markingWidth } from '../data/markings.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { forwardOf, leftOf } from '../level/segments.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { markingGeometry, markingIndexBytes } from '../shared/markingRibbon.ts';
import { createMarkings } from './markings.ts';
import { prepareVisualWayfinding } from './wayfinding.ts';

function surfaceAt(plan: LevelPlan, x: number, z: number): string {
  const field = plan.heightfield, column = Math.floor((x - field.originX) / field.spacing), row = Math.floor((z - field.originZ) / field.spacing);
  return column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1
    ? plan.surround.surface : field.surfaces[row * (field.columns - 1) + column];
}
function inBox(box: BoxCollider, x: number, z: number): boolean {
  const dx = x - box.centre.x, dz = z - box.centre.z, c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
  return Math.abs(c * dx - s * dz) <= box.halfExtents.x && Math.abs(s * dx + c * dz) <= box.halfExtents.z;
}
function distanceToSegment(point: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2));
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}
function indexBytes(view: ReturnType<typeof createMarkings>): number {
  const mesh = view.group.getObjectByName('level-markings-paint');
  assert.ok(mesh instanceof THREE.Mesh && mesh.geometry.index, 'marking owner emitted its one index buffer');
  return mesh.geometry.index.array.byteLength;
}

const generatedFixtures = new Map<string, { source: LevelPlan; prepared: ReturnType<typeof preparePopulationWorld> }>();
function generatedFixture(seed: string) {
  let fixture = generatedFixtures.get(seed);
  if (!fixture) { const source = generateLevel(seed).plan; fixture = { source, prepared: preparePopulationWorld(source) }; generatedFixtures.set(seed, fixture); }
  return fixture;
}

test('marking price uses Three array index primitive-restart boundary', () => {
  for (const [maximum, bytes] of [[65_534, 2], [65_535, 4]] as const) {
    const geometry = new THREE.BufferGeometry();
    try {
      geometry.setIndex([0, maximum, 1]);
      assert.equal(geometry.index!.array.BYTES_PER_ELEMENT, bytes, `actual maximum index ${maximum}`);
      assert.equal(markingIndexBytes(maximum + 1, 3), bytes * 3, `source price maximum index ${maximum}`);
    } finally { geometry.dispose(); }
  }
});

test('synthetic sixty-metre native brick plaza retains its axis and allocates two perpendicular exit inlays', () => {
  // This is deliberately descriptor-only: it does not prepare population or
  // repeat the accepted generated-world integration capture. The fixture is
  // a structurally admissible plaza rather than an id or seed exception.
  const source = createSliceLevel(), field = source.heightfield;
  const origin = { x: field.originX + field.spacing * 10, y: 0, z: field.originZ + field.spacing * 10 };
  const end = { x: origin.x, y: 0, z: origin.z + 60 }, nextEnd = { x: origin.x, y: 0, z: origin.z + 80 };
  const base = source.segments[0];
  assert.ok(base, 'slice supplies the segment shape; all fixture route facts are replaced below');
  const plaza = { ...base, entry: { ...base.entry, position: origin, headingY: 0, surface: 'brick' as const },
    exit: { ...base.exit, position: end, headingY: 0, surface: 'brick' as const }, colliders: [] };
  const next = { ...base, entry: { ...base.entry, position: end, headingY: 0, surface: 'pavement' as const },
    exit: { ...base.exit, position: nextEnd, headingY: 0, surface: 'pavement' as const }, colliders: [] };
  const fixture: LevelPlan = { ...source, spawn: { position: origin, headingY: 0 }, segments: [plaza, next],
    streetLoops: [{ main: [], alternate: [] }], markings: [], solids: [], hazards: [],
    heightfield: { ...field, surfaces: field.surfaces.map(() => 'brick' as const) }, surround: { ...source.surround, surface: 'brick' } };
  const wayfinding = prepareVisualWayfinding(fixture, null);
  const centre = wayfinding.runs.filter(run => run.paint === 'road'), inlays = wayfinding.runs.filter(run => run.paint === 'path');
  assert.equal(centre.length, 1, 'the accepted 42 cm central road cue is retained');
  assert.equal(centre[0].width, markingWidth('bar'));
  assert.equal(inlays.length, 2, 'both sides of the real next-road opening receive one continuous inlay');
  assert.ok(inlays.every(run => run.width === markingWidth('centre')), 'both inlays use the 16 cm centre-line paver width');
  const forward = forwardOf(0), left = leftOf(0);
  for (const side of [-1, 1] as const) {
    const points = inlays.flatMap(run => run.points).filter(point => Math.abs((point.x - origin.x) * left.x
      + (point.z - origin.z) * left.z - side * 1.25) < 1e-8);
    assert.ok(points.length >= 2, `${side}: heading-relative side exists`);
    assert.ok(points.every(point => Math.abs((point.x - origin.x) * forward.x + (point.z - origin.z) * forward.z) >= 3),
      `${side}: edge carries no sideways projection in place of route progress`);
  }
  assert.ok(Math.min(...inlays.flatMap(run => run.points.map(point => (point.z - origin.z)))) <= 3.001,
    'inlays begin at the incoming-road end');
  assert.ok(Math.max(...inlays.flatMap(run => run.points.map(point => (point.z - origin.z)))) >= 56.999,
    'inlays reach the joined next-road opening');
});

test('actual euc/corner/city spawn plazas carry a solid road cue into their joined next road', () => {
  for (const seed of ['euc', 'corner', 'city']) {
    const { source, prepared } = generatedFixture(seed), before = JSON.stringify(source);
    const wayfinding = prepareVisualWayfinding(prepared.level, prepared.population);
    const bridge = wayfinding.runs.filter(run => run.paint === 'road');
    const [plaza, next] = prepared.level.segments;
    assert.ok(plaza && next, `${seed}: final source carries the spawn plaza and its successor`);
    assert.equal(plaza.entry.surface, 'brick', `${seed}: source starts on the physical brick plaza`);
    assert.equal(next.entry.surface, 'pavement', `${seed}: the plaza's actual joined continuation is a road`);
    assert.ok(Math.hypot(plaza.exit.position.x - next.entry.position.x, plaza.exit.position.z - next.entry.position.z) < 1e-8,
      `${seed}: successor begins at the source plaza exit`);
    assert.ok(Math.abs(plaza.exit.headingY - next.entry.headingY) < 1e-8,
      `${seed}: successor preserves the source plaza heading`);
    assert.ok(bridge.length >= 1, `${seed}: clipping leaves a real road cue; it may split at original marks or hazards`);
    for (const run of bridge) {
      assert.equal(run.width, markingWidth('bar'), `${seed}: cue is a readable paver-scale stroke`);
      assert.equal(run.dash, 0, `${seed}: cue is continuous across the plaza`);
      assert.equal(run.gap, 0, `${seed}: cue has no speed-line gaps`);
    }
    const heading = prepared.level.spawn.headingY, forward = forwardOf(heading);
    const projections = bridge.flatMap(run => run.points.map(point => (point.x - prepared.level.spawn.position.x) * forward.x
      + (point.z - prepared.level.spawn.position.z) * forward.z));
    const plazaLength = Math.hypot(plaza.exit.position.x - plaza.entry.position.x, plaza.exit.position.z - plaza.entry.position.z);
    assert.ok(Math.min(...projections) <= 4.25, `${seed}: cue starts at the incoming-road end of the plaza`);
    assert.ok(Math.max(...projections) >= plazaLength - 4.25, `${seed}: cue reaches the next-road opening`);
    for (const run of bridge) for (const point of run.points) {
      assert.ok(PAINTABLE_SURFACES.includes(surfaceAt(prepared.level, point.x, point.z) as never), `${seed}: cue stays on final paintable ground`);
      assert.equal(point.y, fieldHeightAt(prepared.level.heightfield, prepared.level.surround, point.x, point.z) + MARKINGS.lift, `${seed}: cue samples final ground`);
      assert.ok(![...prepared.level.segments.flatMap(segment => segment.colliders), ...(prepared.level.solids ?? [])].some(box => inBox(box, point.x, point.z)), `${seed}: cue avoids solid ground`);
      assert.ok(!(prepared.level.hazards ?? []).some(hazard => Math.hypot(point.x - hazard.centre.x, point.z - hazard.centre.z) <= hazard.radius), `${seed}: cue avoids hazard ground`);
      assert.ok(!(prepared.level.markings ?? []).some(mark => mark.points.slice(1).some((to, index) => distanceToSegment(point, mark.points[index], to) <= (mark.width + run.width) / 2 + 0.02)), `${seed}: cue does not cross original paint`);
    }
    assert.equal(JSON.stringify(source), before, `${seed}: descriptor did not mutate generator source`);
  }
});

test('actual slice walking edges are perpendicular and choose the rider-facing shared boundary', () => {
  const prepared = preparePopulationWorld(createSliceLevel());
  const wayfinding = prepareVisualWayfinding(prepared.level, prepared.population);
  const edges = wayfinding.runs.filter(run => run.paint === 'path');
  assert.equal(edges.length, 2, 'riverside and lower pedestrian bands');
  const admitted = new Set((prepared.level.populationActivityWalks ?? []).filter(walk => walk.district === 'park'
    && prepared.population.actors.some(actor => actor.activityWalkId === walk.id)).map(walk => `${walk.pathId}/clear-0`));
  const walkers = prepared.population.paths.filter(path => admitted.has(path.id) && path.role === 'pedestrian');
  const riders = prepared.population.paths.filter(path => path.district === 'park' && path.role !== 'pedestrian');
  assert.ok(riders.length > 0, 'slice has the actual paired rider band');
  for (const edge of edges) for (const point of edge.points) {
    const nearest = walkers.flatMap(path => path.points.map(point => ({ ...point, clearanceRadiusMetres: path.clearanceRadiusMetres }))).reduce((best, candidate) => Math.hypot(candidate.x - point.x, candidate.z - point.z) < Math.hypot(best.x - point.x, best.z - point.z) ? candidate : best);
    const delta = { x: point.x - nearest.x, z: point.z - nearest.z }, forward = forwardOf(nearest.headingY), left = leftOf(nearest.headingY);
    const longitudinal = delta.x * forward.x + delta.z * forward.z, lateral = delta.x * left.x + delta.z * left.z;
    assert.ok(Math.abs(longitudinal) < 1e-8, 'edge offset has no forward component');
    assert.ok(Math.abs(Math.abs(lateral) - Math.min(0.35, nearest.clearanceRadiusMetres - markingWidth('edge') / 2 - 0.25)) < 1e-8, 'edge is exactly a heading-relative lateral offset');
    const opposite = { x: nearest.x - delta.x, z: nearest.z - delta.z };
    const riderDistance = (candidate: { x: number; z: number }): number => Math.min(...riders.flatMap(path => path.points).map(other => Math.hypot(candidate.x - other.x, candidate.z - other.z)));
    assert.ok(riderDistance(point) <= riderDistance(opposite), 'edge is the rider-facing allocation boundary, not the outer verge');
  }
  assert.equal(wayfinding.drawCalls, 0, 'slice already owns a shared markings mesh');
});

test('descriptor uses final source structure rather than installed world id and refuses unsupported ground', () => {
  const { prepared } = generatedFixture('euc');
  const original = prepareVisualWayfinding(prepared.level, prepared.population);
  const rekeyed = prepareVisualWayfinding({ ...prepared.level, id: 'population-rekeyed' }, prepared.population);
  assert.deepEqual(rekeyed.runs, original.runs, 'no id branch');
  const grass = { ...prepared.level, heightfield: { ...prepared.level.heightfield,
    surfaces: prepared.level.heightfield.surfaces.map(() => 'grass' as const) } };
  assert.equal(prepareVisualWayfinding(grass, prepared.population).runs.filter(run => run.paint === 'road').length, 0,
    'a brick source lane does not float across unsupported final ground');
});

test('accounting is the actual shared ribbon shape, deterministic, and has no hidden material draw', () => {
  const prepared = preparePopulationWorld(createSliceLevel());
  const a = prepareVisualWayfinding(prepared.level, prepared.population);
  const b = prepareVisualWayfinding(prepared.level, prepared.population);
  assert.deepEqual(a, b);
  assert.equal(a.indices, a.triangles * 3);
  const base = markingGeometry(prepared.level.markings ?? []);
  assert.equal(a.geometryBytes, a.vertices * 36 + markingIndexBytes(base.vertices + a.vertices, base.indices + a.indices)
    - markingIndexBytes(base.vertices, base.indices));
  assert.equal(a.drawCalls, 0);
});

test('supplemental cues append to the one existing markings owner and dispose with it', () => {
  const prepared = preparePopulationWorld(createSliceLevel());
  const cue = prepareVisualWayfinding(prepared.level, prepared.population);
  const base = createMarkings(prepared.level), merged = createMarkings(prepared.level, undefined, cue.runs);
  try {
    assert.equal(merged.drawCalls, 1);
    assert.equal(merged.triangles - base.triangles, cue.triangles);
    assert.equal(merged.runs - base.runs, cue.runs.length);
    const source = markingGeometry(prepared.level.markings ?? []);
    assert.equal(indexBytes(merged) - indexBytes(base) + cue.vertices * 36, cue.geometryBytes, 'merged price debits any whole-buffer Uint32 promotion');
    assert.equal(indexBytes(merged), markingIndexBytes(source.vertices + cue.vertices, source.indices + cue.indices));
  } finally { base.dispose(); merged.dispose(); }
});

test('six source worlds use the actual array index width from their source marking counts', () => {
  const worlds: readonly (readonly [string, () => LevelPlan])[] = [
    ['slice', createSliceLevel], ['belvar', createTrackLevel], ['switchback', createSwitchbackLevel],
    ['proving', createProvingGround], ['euc', () => generatedFixture('euc').source],
    ['heavy', () => generateLevel('route-41', undefined, undefined, 65).plan],
  ];
  for (const [name, build] of worlds) {
    const plan = build(), source = markingGeometry(plan.markings ?? []), view = createMarkings(plan);
    try {
      if (source.indices === 0) {
        assert.equal(view.drawCalls, 0, `${name}: genuinely unmarked source allocates no paint draw`);
        assert.equal(view.triangles, 0);
        assert.equal(markingIndexBytes(source.vertices, source.indices), 0);
        continue;
      }
      assert.equal(indexBytes(view), markingIndexBytes(source.vertices, source.indices), `${name}: source price matches BufferGeometry.setIndex(array)`);
    } finally { view.dispose(); }
  }
});
