/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { withStreetGround } from '../app/streetGround.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { collectStreetPavingPieces, createStreetPaving } from './streetGroundView.ts';
import { createStreetLife } from './streetLife.ts';
import { materialAppearance } from '../data/surfaces.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createLevel } from '../level/levels.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { sharedContourMask } from './sharedGroundContours.ts';

test('paving draws every exact shared fragment without lifting the surface', () => {
  const source = generateLevel({ seed: 'euc' }).plan;
  assert.equal(createStreetPaving(source), null);
  const plan = withStreetGround(source), paving = createStreetPaving(plan)!;
  const vertices = plan.groundSurfacePatches!.flatMap(p => p.triangles.flatMap(t => t.vertices));
  const positions = paving.geometry.getAttribute('position');
  assert.equal(positions.count, vertices.length);
  assert.ok(vertices.length > 100);
  vertices.forEach((p, i) => {
    assert.ok(Math.abs(positions.getX(i) - p.x) < 0.00005);
    assert.ok(Math.abs(positions.getY(i) - p.y) < 0.00005);
    assert.ok(Math.abs(positions.getZ(i) - p.z) < 0.00005);
  });
  const service = paving.geometry.getAttribute('streetPavingService');
  assert.equal(service.itemSize, 1);
  assert.equal(service.count, positions.count);
  assert.equal(service.array.byteLength, positions.count, 'one byte per existing paving vertex');
  const expectedService = plan.groundSurfacePatches!.flatMap(patch =>
    patch.triangles.flatMap(triangle => triangle.vertices.map(() => Number(patch.footprint?.id.endsWith('-service-apron')))));
  assert.deepEqual(Array.from(service.array), expectedService);
  assert.ok(expectedService.includes(0) && expectedService.includes(1), 'personnel/commercial pavers and industrial concrete coexist');
  assert.ok(paving.material.polygonOffset && paving.material.polygonOffsetFactor < 0);
  assert.equal(paving.material.color.getHex(), materialAppearance('stone').albedo);
  const colours = paving.geometry.getAttribute('color');
  for (let i = 0; i < colours.count; i++) {
    for (const multiplier of [colours.getX(i), colours.getY(i), colours.getZ(i)]) {
      assert.ok(multiplier > 0.9 && multiplier < 1.1, 'vertex colour is a bounded multiplier');
    }
  }
  const normal = paving.geometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.98);
  const base = createStreetLife(source), candidate = createStreetLife(plan);
  assert.equal(candidate.report().drawCalls, base.report().drawCalls + 1);
  assert.equal(candidate.report().colourTriangles, base.report().colourTriangles + vertices.length / 3);
  assert.ok(candidate.report().geometryBytes > base.report().geometryBytes);
  assert.strictEqual(plan.heightfield, source.heightfield);
  base.dispose(); candidate.dispose(); paving.geometry.dispose(); paving.material.dispose();
});

// 2026-10-03, VIS-1: the warehouse bay and driveway were physics pavement
// but drawn as lawn. Traffic turn courts stay the coarse grass or brick.
function livingFixture(): LevelPlan {
  const surfaces: SurfaceId[] = Array.from({ length: 16 }, (_, cell) => cell % 4 < 2 ? 'grass' : 'brick');
  return { id: 'living-paving', spawn: { position: { x: 0, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 5, rows: 5, heights: Array(25).fill(1), surfaces } };
}
const cellTriangle = (cell: number) => {
  const x = cell % 4, z = Math.floor(cell / 4);
  return { cell, vertices: [{ x, y: 1, z }, { x: x + 1, y: 1, z: z + 1 }, { x: x + 1, y: 1, z }] as const };
};

test('the warehouse bay and driveway draw paved with the plain service finish; turn courts keep the coarse cell', () => {
  const plan = livingFixture();
  plan.groundSurfacePatches = [
    { id: 'street-7-coffee-forecourt-grass', surface: 'pavement', sourceSurface: 'grass', triangles: [cellTriangle(0)],
      footprint: { id: 'street-7-coffee-forecourt', origin: { x: 0, y: 1, z: 0 }, yaw: 0, width: 4, near: 0, far: 4 } },
    { id: 'living-ground/warehouse-1/bay-4.5-0/grass', surface: 'pavement', sourceSurface: 'grass',
      triangles: [cellTriangle(1), cellTriangle(4)] },
    { id: 'living-ground/warehouse-1/bay-4.5-0/driveway-1-3-0/piece-0/grass', surface: 'pavement', sourceSurface: 'grass',
      triangles: [cellTriangle(8)] },
    { id: 'living-ground/city-commercial/local-side-street/24/0.5/0/turn-0/piece-6/brick', surface: 'pavement',
      sourceSurface: 'brick', triangles: [cellTriangle(2)] },
    { id: 'living-ground/city-residential/entry-neighborhood/1.5/0/turn-1/piece-0/grass', surface: 'pavement',
      sourceSurface: 'grass', triangles: [cellTriangle(9)] },
    { id: 'population-precise-lane', surface: 'pavement', sourceSurface: 'grass', triangles: [cellTriangle(5)] },
  ];
  const before = JSON.stringify(plan), pieces = collectStreetPavingPieces(plan)!;
  assert.equal(pieces.colourTriangles, 4, 'street + bay + driveway only; no court drawn on the lawn or the sidewalk');
  assert.deepEqual(pieces.pavingService, [0, 0, 0, ...Array(9).fill(1)], 'bay paving uses the plain service concrete');
  const drawn = [0, 1, 4, 8].flatMap(cell => cellTriangle(cell).vertices.flatMap(p => [p.x, p.y, p.z]));
  assert.deepEqual(pieces.positions, drawn, 'exact unchanged patch triangles, no lift or reshaping');
  for (let i = 0; i < pieces.pavingFrame.length; i += 3) assert.ok(pieces.pavingFrame[i] > 0 && pieces.pavingFrame[i + 2] > pieces.pavingFrame[i + 1]);
  const paving = createStreetPaving(plan, pieces)!;
  assert.equal(paving.geometry.getAttribute('position').count, 12);
  paving.geometry.dispose(); paving.material.dispose();
  const mask = sharedContourMask(plan);
  assert.deepEqual([mask[0], mask[1], mask[4], mask[8]], [0, 0, 0, 0], 'drawn bay paving joins the rendered opaque path branch');
  assert.deepEqual([mask[2], mask[9]], [1, 1], 'an undrawn court never grows a new contour chain');
  assert.equal(mask[5], 1, 'unknown precise semantics stay excluded');
  assert.equal(JSON.stringify(plan), before, 'plan data is untouched');
});

test('the prepared euc world draws its warehouse bay and driveway as paving where the van parks', () => {
  const plan = preparePopulationWorld(createLevel('generated', 'euc')).level;
  const bay = plan.populationParkingBays?.[0];
  assert.ok(bay, 'control: euc authors one warehouse bay');
  const sample = new PlanTerrainSampler(plan).sampleGround(bay.position.x, bay.position.z, createGroundSample());
  assert.equal(sample.surface, 'pavement', 'control: physics already rides the bay as pavement');
  const field = plan.heightfield, columns = field.columns - 1;
  const cell = Math.floor((bay.position.z - field.originZ) / field.spacing) * columns + Math.floor((bay.position.x - field.originX) / field.spacing);
  assert.equal(field.surfaces[cell], 'grass', 'control: the coarse cell under the van is lawn');
  const pieces = collectStreetPavingPieces(plan)!, p = pieces.positions;
  const inside = (i: number) => {
    const ax = p[i * 9], az = p[i * 9 + 2], bx = p[i * 9 + 3], bz = p[i * 9 + 5], cx = p[i * 9 + 6], cz = p[i * 9 + 8];
    const x = bay.position.x, z = bay.position.z;
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz), d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const covering = Array.from({ length: pieces.colourTriangles }, (_, i) => i).filter(inside);
  assert.ok(covering.length > 0, 'a drawn paving triangle covers the parked van');
  assert.ok(covering.every(i => pieces.pavingService[i * 3] === 1), 'with the plain service finish');
  const patches = plan.groundSurfacePatches ?? [], count = (list: typeof patches) => list.reduce((sum, patch) => sum + patch.triangles.length, 0);
  const bayPatches = patches.filter(patch => patch.id.startsWith(`${bay.sourceId}/`));
  assert.ok(bayPatches.some(patch => patch.id.includes('/driveway-')), 'control: the bay has its driveway to the road');
  const courts = patches.filter(patch => patch.id.startsWith('living-ground/') && patch.id.includes('/turn-'));
  assert.ok(courts.some(patch => patch.sourceSurface === 'grass') && courts.some(patch => patch.sourceSurface === 'brick'),
    'control: euc turn courts cross both lawn and brick sidewalk');
  const street = count(patches.filter(patch => patch.id.startsWith('street-')));
  assert.equal(pieces.colourTriangles, street + count(bayPatches), 'the bay and its driveway are drawn; no turn court is');
});
