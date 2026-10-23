/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Street entrances (2026-10-22): which faces a door may open onto, and where. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { BoxCollider, LevelPlan, Prop } from '../level/plan.ts';
import { planDigest } from '../level/planDigest.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { exteriorComposition } from './districtExteriorSites.ts';
import { awningOver, doorSill, streetEntrances, surveyStreetFaces, type EntranceRequest } from './buildingEntrances.ts';

const body = (prop: Prop): BoxCollider => ({ centre: { ...prop.position, y: prop.position.y + prop.size!.y / 2 },
  halfExtents: { x: prop.size!.x / 2, y: prop.size!.y / 2, z: prop.size!.z / 2 }, rotationY: prop.rotationY, surface: 'pavement' });

/** One 12 × 7 × 16 m block at (18, 24) on grass, a paved street along x ∈ [−5, 5], and extra solids. */
function fixture(extra: readonly BoxCollider[] = [], yaw = 0, groundAt?: (x: number, z: number) => number): LevelPlan {
  const building: Prop = { kind: 'building', look: 'commercial', position: { x: 18, y: 0, z: 24 }, rotationY: yaw, scale: 1,
    size: { x: 12, y: 7, z: 16 } };
  const surfaces = new Array<SurfaceId>(160 * 160).fill('grass');
  for (let row = 0; row < 160; row += 1) for (let column = 75; column < 85; column += 1) surfaces[row * 160 + column] = 'pavement';
  const heights = Array.from({ length: 161 * 161 }, (_, index) => groundAt ? groundAt(index % 161 - 80, Math.floor(index / 161) - 80) : 0);
  return { id: 'entrance-fixture', heightfield: { originX: -80, originZ: -80, spacing: 1, columns: 161, rows: 161, heights, surfaces },
    surround: { height: 0, surface: 'grass' }, spawn: { position: { x: -60, y: 0, z: -60 }, headingY: 0 }, checkpoints: [],
    props: [building], solids: [body(building), ...extra], segments: [{ id: 'street',
      entry: { position: { x: 0, y: 0, z: -60 }, headingY: 0, halfWidth: 5, gradient: 0, surface: 'pavement' },
      exit: { position: { x: 0, y: 0, z: 70 }, headingY: 0, halfWidth: 5, gradient: 0, surface: 'pavement' }, colliders: [] }] };
}
const box = (x0: number, x1: number, z0: number, z1: number, bottom: number, top: number): BoxCollider => ({
  centre: { x: (x0 + x1) / 2, y: (bottom + top) / 2, z: (z0 + z1) / 2 },
  halfExtents: { x: (x1 - x0) / 2, y: (top - bottom) / 2, z: (z1 - z0) / 2 }, rotationY: 0, surface: 'pavement' });
const survey = (plan: LevelPlan) => surveyStreetFaces(plan, plan.props![0], exteriorComposition(plan.props![0])[0]);
const side = (plan: LevelPlan, which: number) => survey(plan).find(face => face.side === which);
/** Side 3 is the −x face at x = 12, the one that looks west toward the street. */
const WEST = 3, EAST = 1;

test('the face toward the street wins, every face is surveyed, and nothing in the plan moves', () => {
  const plan = fixture(), before = planDigest(plan), first = survey(plan);
  assert.equal(first.length, 4);
  assert.equal(first[0].side, WEST, 'the street side outranks the lawn sides');
  assert.deepEqual(survey(plan), first, 'deterministic');
  assert.equal(planDigest(plan), before, 'render-only: no collider, surface or prop is written');
});

test('a face pressed against a neighbour or a raised deck is never offered; an overhead slab is not in the way', () => {
  // A neighbour 1.5 m off the west face: no door can open into that gap.
  assert.equal(side(fixture([box(8.5, 10.5, 10, 38, 0, 9)]), WEST), undefined);
  // A 1.2 m platform against the west face blocks it, exactly like a wall.
  assert.equal(side(fixture([box(6, 12, 10, 38, 0, 1.2)]), WEST), undefined);
  // A kerb is stood on, and a deck slab and parapet three metres up are overhead.
  const open = side(fixture([box(9, 12, 10, 38, 0, 0.15), box(6, 12.3, 10, 38, 10, 11), box(11.6, 12.1, 10, 38, 11, 12.6)]), WEST);
  assert.ok(open && open.columns.every(column => Number.isFinite(column.ground)), 'overhead structure never blocks a ground-floor door');
  // A lamp post on the doorstep blocks the columns it stands in, and only those.
  const post = side(fixture([box(10.4, 10.6, 23.6, 24.4, 0, 5)]), WEST)!;
  const blocked = post.columns.filter(column => !Number.isFinite(column.ground)).length;
  assert.ok(blocked >= 1 && blocked <= 2, `${blocked} columns`);
});

test('a door never floats over falling ground and never takes a tilted doorstep', () => {
  // Ground drops 40 cm under the west face only: every west column floats, the east stays.
  const dropped = fixture([], 0, x => (x < 12 ? -0.4 : 0));
  assert.equal(side(dropped, WEST), undefined);
  assert.ok(side(dropped, EAST));
  // Rising ground lifts the sill to meet it; a step across the doorway refuses that spot.
  const raised = side(fixture([], 0, x => (x < 13 ? 0.3 : 0)), WEST)!;
  assert.ok(Math.abs(doorSill(raised, 0, 1, 0)! - 0.3) < 1e-9, 'the sill meets the ground in front of it');
  const stepped = side(fixture([], 0, (x, z) => (x < 13 && z > 24 ? 0.3 : 0)), WEST)!;
  assert.equal(doorSill(stepped, 0, 1, 0), null, 'a doorway across a step is refused');
  assert.notEqual(doorSill(stepped, -4, 1, 0), null, 'level ground elsewhere on the face still takes a door');
});

test('doors land on the caller\'s candidates, spaced, within the face and on the best faces only', () => {
  const plan = fixture(), building = plan.props![0], piece = exteriorComposition(building)[0];
  const request = (overrides: Partial<EntranceRequest> = {}): EntranceRequest => ({ halfWidth: 1, spacing: 4, secondaryFaces: 0,
    maximumSill: 0.5, doorsOnFace: () => 2, candidates: face => [-face.width / 2 + 0.5, -3, 0, 3, face.width / 2 - 0.5], ...overrides });
  const [only, ...rest] = streetEntrances(plan, building, piece, request());
  assert.equal(rest.length, 0); assert.equal(only.face.side, WEST);
  assert.deepEqual(only.doors.map(door => door.x), [-3, 3], 'edge candidates cannot hold a door; the rest are spaced');
  assert.equal(streetEntrances(plan, building, piece, request({ maximumSill: -1 })).length, 0, 'the storey cap refuses every sill');
  // Secondary faces need paving nearly as good as the best face's: lawns never qualify.
  assert.equal(streetEntrances(plan, building, piece, request({ secondaryFaces: 3 })).length, 1);
});

test('an authored awning names the shopfront face', () => {
  const plan = fixture(), east: LevelPlan = { ...plan,
    quayScenery: { awnings: [{ x0: 24, z0: 18, x1: 24, z1: 30, nx: 1, nz: 0 }] } as unknown as LevelPlan['quayScenery'] };
  assert.equal(survey(east)[0].side, EAST, 'the awning outranks the street');
  const face = survey(east)[0];
  assert.equal(awningOver(east, face, 0, 1), true);
  assert.equal(awningOver(east, face, 7.5, 1), false, 'beyond the awning\'s run');
  assert.equal(awningOver(plan, face, 0, 1), false);
});

test('a rotated body surveys the same faces in its own frame', () => {
  const turned = survey(fixture([], Math.PI / 2));
  // Turned a quarter, the body's −z face (side 2, 12 m wide) looks west at the street.
  assert.equal(turned[0].side, 2); assert.equal(turned[0].width, 12);
  assert.ok(Math.abs(Math.sin(turned[0].yaw) + 1) < 1e-9);
});

/** The same fixture with its ground surfaces repainted cell by cell (cell centres at x + 0.5, z + 0.5). */
const repainted = (plan: LevelPlan, paint: (x: number, z: number) => SurfaceId): LevelPlan => ({ ...plan, heightfield: {
  ...plan.heightfield, surfaces: plan.heightfield.surfaces.map((_, index) => paint(index % 160 - 80 + 0.5, Math.floor(index / 160) - 80 + 0.5)) } });

// Doors fix (2026-10-22): the default town's blocks stand in lawn on every
// side, and their nearest paved station can be a far straight stretch.
test('a body set back in lawn fronts the street it looks onto, not a far station\'s bearing', () => {
  // The segment (the station) still runs at x = 0, west; the only street ground is a strip 4 m off the east face.
  const east = repainted(fixture(), x => (x > 28 && x < 32 ? 'pavement' : 'grass'));
  const faces = survey(east);
  assert.ok(faces.every(face => face.paved === 0), 'the strip is beyond the doorstep probes: a lawn body');
  assert.equal(faces[0].side, EAST, 'the face looking onto the street wins over the bearing of the station');
  assert.ok(faces[0].street > 0.8 && side(east, WEST)!.street === 0);
  // A footpath counts, more weakly than a street; a building in the way hides the street behind it.
  const path = side(repainted(fixture(), x => (x > 28 && x < 32 ? 'gravel' : 'grass')), EAST)!;
  assert.ok(path.street > 0.4 && path.street < faces[0].street);
  const hidden = repainted(fixture([box(27.2, 28.2, 10, 38, 0, 9)]), x => (x > 29 && x < 33 ? 'pavement' : 'grass'));
  assert.equal(side(hidden, EAST)!.street, 0, 'a neighbour between the face and the street');
  // Paving at any wall's foot keeps the original ranking: the street term is lawn-only.
  const footed = repainted(fixture(), x => ((x > 28 && x < 32) || (x > 9 && x < 12) ? 'pavement' : 'grass'));
  assert.equal(side(footed, WEST)!.paved, 1);
  const lawnEast = side(east, EAST)!, footedEast = side(footed, EAST)!;
  assert.ok(Math.abs(lawnEast.score - footedEast.score - 2 * lawnEast.street) < 1e-9);
});

test('a door reports whether its doorstep is paved and the ground a step must cover', () => {
  const request: EntranceRequest = { halfWidth: 1, spacing: 4, secondaryFaces: 0, maximumSill: 0.5,
    doorsOnFace: () => 1, candidates: () => [0] };
  const lawn = fixture(), building = lawn.props![0], piece = exteriorComposition(building)[0];
  const [turf] = streetEntrances(lawn, building, piece, request);
  assert.equal(turf.doors[0].paved, false, 'the fixture\'s doors open onto grass');
  assert.equal(turf.doors[0].stepLow, 0); assert.equal(turf.doors[0].stepHigh, 0);
  const walk = repainted(lawn, x => (x < 12 ? 'pavement' : 'grass'));
  assert.equal(streetEntrances(walk, walk.props![0], piece, request)[0].doors[0].paved, true);
  // Ground rising away from the wall raises the step's top, never the sill.
  const rising = fixture([], 0, x => (x < 11 ? 0.2 : 0));
  const [up] = streetEntrances(rising, rising.props![0], piece, request);
  assert.equal(up.doors[0].y, 0); assert.ok(up.doors[0].stepHigh > 0.05 && up.doors[0].stepLow === 0);
});
