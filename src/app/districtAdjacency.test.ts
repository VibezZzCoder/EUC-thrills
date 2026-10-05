/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withDistrictAdjacency, DISTRICT_ADJACENCY, type DistrictAdjacentPlan } from '../level/districtAdjacency.ts';
import type { BoxCollider, LevelPlan, Prop } from '../level/plan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { planDigest } from '../level/planDigest.ts';
import { PROP_FOOTPRINTS, PROP_SOLIDS } from '../data/props.ts';
import { PROP_CORRIDOR_CLEARANCE } from '../level/buildPlan.ts';
import { placeChain, querySegment } from '../level/segments.ts';
import { withStreetGround } from './streetGround.ts';
import { streetFronts } from '../level/streetFronts.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { residentialSites } from '../level/districtSites.ts';
import { preparePopulationWorld } from './populationWorld.ts';

/** Independently authored bodies and source planes. No selector-derived
 * positive footprint and no generator is needed by these focused controls. */
function fixture(angle = 0, options: { single?: boolean; look?: Prop['look'];
  roadSurface?: SurfaceId; height?: (x: number, z: number) => number; corridorHalfWidth?: number } = {}): LevelPlan {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (point: Vec3): Vec3 => ({ x: c * point.x + s * point.z,
    y: point.y, z: point.z * c - point.x * s });
  const heights: number[] = [], surfaces: SurfaceId[] = [];
  for (let row = 0; row <= 140; row++) for (let column = 0; column <= 140; column++) {
    heights.push(options.height?.(-70 + column, -70 + row) ?? 0);
  }
  for (let row = 0; row < 140; row++) for (let column = 0; column < 140; column++) {
    const x = -70 + column + 0.5, z = -70 + row + 0.5, localZ = s * x + c * z;
    surfaces.push(localZ >= 18 && localZ < 26 ? options.roadSurface ?? 'pavement' : 'grass');
  }
  const props: Prop[] = (options.single ? [-14] : [-14, 14]).map(x => ({ kind: 'building',
    position: rotate({ x, y: 0, z: 0 }), rotationY: angle, scale: 1,
    size: { x: 10, y: 12, z: 10 }, ...(options.look ? { look: options.look } : {}) }));
  const solids: BoxCollider[] = props.map(prop => ({ centre: { ...prop.position, y: 6 },
    halfExtents: { x: 5, y: 6, z: 5 }, rotationY: angle, surface: 'pavement', occludes: true }));
  const socket = (x: number) => ({ position: rotate({ x, y: 0, z: 22 }), headingY: angle + Math.PI / 2,
    surface: options.roadSurface ?? 'pavement', gradient: 0, halfWidth: options.corridorHalfWidth ?? 4 });
  return { id: 'district-adjacency-fixture', spawn: { position: { x: -60, y: 0, z: -50 }, headingY: 0 },
    heightfield: { originX: -70, originZ: -70, spacing: 1, columns: 141, rows: 141, heights, surfaces },
    surround: { height: 0, surface: 'grass' }, segments: [{ id: 'source-street', entry: socket(-60), exit: socket(60), colliders: [] }],
    props, solids, checkpoints: [] };
}
const groundOnly = (plan: LevelPlan) => new PlanTerrainSampler({ ...plan, solids: [], softBodies: [],
  segments: plan.segments.map(segment => ({ ...segment, colliders: [] })) });
function rotatePoint(angle: number, x: number, z: number): { x: number; z: number } {
  return { x: Math.cos(angle) * x + Math.sin(angle) * z, z: Math.cos(angle) * z - Math.sin(angle) * x };
}

test('real base walks, connected access and a bounded street edge retain every original owner and revise physical identity', () => {
  const source = fixture(), before = planDigest(source), finished = withDistrictAdjacency(source);
  assert.ok(finished.districtAdjacency);
  assert.notEqual(finished.id, source.id, 'added grip and furniture require a records/ghost revision');
  assert.equal(finished.districtAdjacency.sourceWorldId, source.id);
  assert.equal(finished.districtAdjacency.frontages.length, 2);
  assert.equal(finished.districtAdjacency.links.length, 1);
  for (const key of ['heightfield', 'segments', 'spawn', 'surround', 'checkpoints', 'hazards', 'lap', 'targets', 'trickZones'] as const) {
    assert.equal(finished[key], source[key], `${key} remains with its original owner`);
  }
  assert.deepEqual(finished.props!.slice(0, source.props!.length), source.props);
  assert.deepEqual(finished.solids!.slice(0, source.solids!.length), source.solids);
  assert.equal(planDigest(source), before);
  assert.deepEqual(withDistrictAdjacency(source), finished, 'no clock, random draws or options change authoring');
  assert.equal(withDistrictAdjacency(finished), finished, 'installed supplement is idempotent');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(finished)), 'plain serializable data only');
  const sample = createGroundSample(), sampler = groundOnly(finished);
  for (const [x, z] of [[-18, 6], [-14, 11], [14, 11], [0, 17.2], [-12.9, 17.2], [12.9, 17.2]]) {
    assert.equal(sampler.sampleGround(x, z, sample).surface, 'pavement', `${x},${z}: continuous usable paving`);
  }
  assert.equal(sampler.sampleGround(0, 11, sample).surface, 'grass', 'the residential/neutral setback remains a lawn rather than a huge court');
  assert.equal(sampler.sampleGround(0, 15.7, sample).surface, 'grass', 'street walk has a deliberate outside edge');
});

test('every new fragment and sampler uses the exact original triangle planes, normals and bounded polygons', () => {
  const source = fixture(0, { height: (x, z) => 0.012 * Math.sin(x * 0.25) + 0.012 * Math.sin(z * 0.21) });
  const finished = withDistrictAdjacency(source), before = groundOnly(source), after = groundOnly(finished);
  assert.ok(finished.districtAdjacency!.addedTriangles > 100, 'actual admitted paving positive');
  const oldSample = createGroundSample(), newSample = createGroundSample();
  const addedProps = finished.props!.slice(source.props!.length);
  assert.ok(addedProps.length > 0, 'non-flat source admits genuinely grounded scene furniture');
  assert.ok(addedProps.some(prop => Math.abs(prop.position.y) > 1e-5));
  for (const prop of addedProps) {
    assert.ok(Math.abs(before.sampleGround(prop.position.x, prop.position.z, oldSample).height - prop.position.y) < 1e-9);
  }
  for (const patch of finished.groundSurfacePatches ?? []) for (const triangle of patch.triangles) {
    const [a, b, c] = triangle.vertices;
    assert.ok((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0, 'upward source winding');
    for (const vertex of triangle.vertices) {
      before.sampleGround(vertex.x, vertex.z, oldSample);
      assert.ok(Math.abs(oldSample.height - vertex.y) < 1e-9, 'the drawing vertex is actual source height');
    }
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    before.sampleGround(x, z, oldSample); after.sampleGround(x, z, newSample);
    assert.equal(newSample.height, oldSample.height);
    assert.deepEqual(newSample.normal, oldSample.normal);
    assert.equal(newSample.offCourse, oldSample.offCourse);
    assert.equal(newSample.surface, patch.surface);
    assert.equal(patch.sourceSurface, source.heightfield.surfaces[triangle.cell]);
  }
});

test('rotated source courses keep real road-facing approaches; neither sides nor retail use are inferred', () => {
  for (const angle of [0.37, 0.71]) {
    const source = fixture(angle), finished = withDistrictAdjacency(source), sampler = groundOnly(finished), sample = createGroundSample();
    assert.equal(finished.districtAdjacency!.frontages.length, 2);
    for (const frontage of finished.districtAdjacency!.frontages) {
      assert.ok(Math.cos(frontage.yaw - angle) > 1 - 1e-9);
      assert.equal(frontage.retainedOpening, false);
      assert.equal(finished.props![frontage.propIndex].look, undefined, 'generic block acquires no shop/residential art label');
    }
    for (const [x, z] of [[-14, 11], [14, 11], [0, 17.8]]) {
      const point = rotatePoint(angle, x, z);
      assert.equal(sampler.sampleGround(point.x, point.z, sample).surface, 'pavement');
    }
  }
});

test('a source surface lie, steep/rising ground, false body or diagonal face cannot create an approach', () => {
  const original = fixture(0, { single: true });
  for (const roadSurface of ['dirt', 'grass', 'gravel', 'wood'] as const) {
    const source = fixture(0, { single: true, roadSurface });
    assert.equal(withDistrictAdjacency(source), source, roadSurface);
  }
  const falseStreet = { ...original, heightfield: { ...original.heightfield, surfaces: original.heightfield.surfaces.map(() => 'grass' as const) } };
  assert.equal(withDistrictAdjacency(falseStreet), falseStreet);
  const steep = fixture(0, { single: true, height: (_x, z) => z > 7 && z < 13 ? 0.8 : 0 });
  assert.equal(withDistrictAdjacency(steep), steep, 'all clipped triangle planes must pass, not chosen points');
  const missingBody = { ...original, solids: [] };
  assert.equal(withDistrictAdjacency(missingBody), missingBody);
  const wrongFacing = { ...original, props: original.props!.map(prop => ({ ...prop, rotationY: 0.5 })),
    solids: original.solids!.map(body => ({ ...body, rotationY: 0.5 })) };
  assert.equal(withDistrictAdjacency(wrongFacing), wrongFacing);
});

test('a foreign thin obstruction off the path centre refuses the full connected access, never leaves a paved island', () => {
  const source = fixture(0, { single: true });
  const blocked = { ...source, solids: [...source.solids!, { centre: { x: -13.05, y: 1, z: 11 },
    halfExtents: { x: 0.12, y: 1, z: 0.4 }, rotationY: 0, surface: 'wood' as const }] };
  assert.equal(withDistrictAdjacency(blocked), blocked);
  assert.equal(blocked.groundSurfacePatches, undefined, 'base and access install atomically');
});

test('hazard, spawn, lap and exact earlier precise ground retain their protected places', () => {
  const source = fixture(0, { single: true });
  const hazard: LevelPlan = { ...source, hazards: [{ id: 'protected-spill', kind: 'spill', centre: { x: -14, y: 0, z: 11 }, radius: 0.5 }] };
  const nearSpawn = { ...source, spawn: { ...source.spawn, position: { x: -14, y: 0, z: 11 } } };
  const lap: LevelPlan = { ...source, lap: { length: 40, points: [{ x: -14, z: 7, halfWidth: 2 },
    { x: -14, z: 17, halfWidth: 2 }, { x: -14, z: 7, halfWidth: 2 }] } };
  assert.equal(withDistrictAdjacency(hazard), hazard);
  assert.equal(withDistrictAdjacency(nearSpawn), nearSpawn);
  assert.equal(withDistrictAdjacency(lap), lap);
  const precise: LevelPlan = { ...source, groundSurfacePatches: [{ id: 'protected-wood', surface: 'wood', sourceSurface: 'grass',
    triangles: [{ cell: 76 * 140 + 51, vertices: [{ x: -19, y: 0, z: 6 }, { x: -18, y: 0, z: 7 }, { x: -18, y: 0, z: 6 }] }] }] };
  assert.equal(withDistrictAdjacency(precise), precise);
});

test('one connected shared rest group per district uses matching physical kit bodies and a related planting mass', () => {
  const source = fixture(), finished = withDistrictAdjacency(source), report = finished.districtAdjacency!;
  assert.equal(report.groups.length, 1, 'two adjacent blocks share one scene rather than duplicate furniture');
  assert.equal(report.addedProps, 6, 'bench, bin, three clustered shrubs and one canopy tree');
  assert.equal(report.addedSolids, 3);
  assert.equal(report.addedSoftBodies, 3);
  assert.ok(report.groups.length <= DISTRICT_ADJACENCY.maximumPublicGroups);
  const group = report.groups[0], newProps = group.propIndices.map(index => finished.props![index]);
  assert.deepEqual(newProps.map(prop => prop.kind), ['bench', 'litterBin', 'shrub', 'shrub', 'shrub', 'broadleafTree']);
  for (const prop of newProps) {
    const kit = PROP_SOLIDS[prop.kind]!, owners = kit.soft ? finished.softBodies! : finished.solids!;
    const body = owners.find(item => item.centre.x === prop.position.x && item.centre.z === prop.position.z)!;
    assert.ok(body, `${prop.kind}: no pass-through visual furnishing`);
    assert.deepEqual(body.halfExtents, { x: kit.halfX * prop.scale, y: kit.height * prop.scale / 2, z: kit.halfZ * prop.scale });
    assert.equal(body.centre.y - body.halfExtents.y, prop.position.y);
  }
  assert.ok(group.groundPatchIds.length > 0, 'bench/entry rest space is actual shared ground');
  assert.ok(newProps.filter(prop => prop.kind === 'shrub').every(prop => prop.position.z > newProps[0].position.z + 3), 'planting backs the seating instead of scattering through it');
});

test('a street-side tree that would stand on the riding corridor is left out alone; the rest group stays (LC-3)', () => {
  // 2026-10-03: the corridor's own grass verge (paved 18..26, rideable 14..30)
  // took a 2.8 m solid trunk where the builder's one prop rule guarantees space.
  const source = fixture(0, { corridorHalfWidth: 8 }), finished = withDistrictAdjacency(source);
  const corridor = placeChain([{ id: 'source-street', length: 120, halfWidth: 8, surface: 'pavement' }],
    { position: { x: -60, y: 0, z: 22 }, headingY: Math.PI / 2 })[0]!;
  const report = finished.districtAdjacency!;
  assert.equal(report.groups.length, 1, 'the frontage keeps its shared rest group');
  const kinds = report.groups[0].propIndices.map(index => finished.props![index].kind);
  assert.deepEqual(kinds, ['bench', 'litterBin', 'shrub', 'shrub', 'shrub'], 'seating, bin and planting stay');
  for (const prop of finished.props!.slice(source.props!.length)) {
    const footprint = PROP_FOOTPRINTS[prop.kind], solid = PROP_SOLIDS[prop.kind];
    const reach = Math.max(footprint.shape === 'circle' ? footprint.radius : Math.hypot(footprint.halfX, footprint.halfZ),
      solid ? Math.hypot(solid.halfX, solid.halfZ) : 0) * prop.scale;
    const outside = querySegment(corridor, prop.position.x, prop.position.z)?.outside ?? Infinity;
    assert.ok(outside - reach >= PROP_CORRIDOR_CLEARANCE, `${prop.kind} stands ${(outside - reach).toFixed(2)} m from the corridor`);
  }
  const control = withDistrictAdjacency(fixture());
  assert.equal(control.districtAdjacency!.groups[0].propIndices.map(index => control.props![index].kind).at(-1), 'broadleafTree',
    'a tree clear of the corridor is kept');
});

test('a segment whose riding arc cannot be recovered is reported, not a reason to refuse every group (LC-3)', () => {
  // 2026-10-03: one unrecoverable segment used to make every added prop count
  // as standing on the route, silently refusing all of the world's rest groups.
  const source = fixture(), control = withDistrictAdjacency(source);
  const loop = { position: { x: -60, y: 0, z: -60 }, surface: 'pavement' as const, gradient: 0, halfWidth: 4 };
  const odd: LevelPlan = { ...source, segments: [...source.segments,
    { id: 'full-loop', entry: { ...loop, headingY: 0 }, exit: { ...loop, headingY: Math.PI * 2 }, colliders: [] }] };
  const finished = withDistrictAdjacency(odd), report = finished.districtAdjacency!;
  assert.ok(report.groups.length > 0, 'the frontage keeps its rest group');
  assert.deepEqual(report.groups.map(group => group.propIndices.map(index => finished.props![index].kind)),
    control.districtAdjacency!.groups.map(group => group.propIndices.map(index => control.props![index].kind)), 'the groups stay');
  assert.deepEqual(report.uncheckedCorridors, ['full-loop']);
  assert.equal(control.districtAdjacency!.uncheckedCorridors, undefined, 'absent where every arc is recovered');
  // Its socket lines still count: a loop whose socket lies under the street-side
  // tree leaves that tree out, and only that tree.
  const tree = control.props!.at(control.districtAdjacency!.groups[0].propIndices.at(-1)!)!;
  assert.equal(tree.kind, 'broadleafTree');
  const under = { ...loop, position: { ...tree.position }, halfWidth: 0.2 };
  const covered = withDistrictAdjacency({ ...source, segments: [...source.segments,
    { id: 'full-loop', entry: { ...under, headingY: 0 }, exit: { ...under, headingY: Math.PI * 2 }, colliders: [] }] });
  assert.deepEqual(covered.districtAdjacency!.groups.map(group => group.propIndices.map(index => covered.props![index].kind)),
    [['bench', 'litterBin', 'shrub', 'shrub', 'shrub']]);
});

test('authored actor and vehicle bands suppress furnishing while preserving connected physical pavement', () => {
  const source = fixture(0, { single: true });
  const reserved: LevelPlan = { ...source, populationPaths: [{ id: 'retained-moving-band', role: 'service', district: 'industrial',
    closed: false, serviceShuttle: true, frames: [{ x: -30, y: 0, z: 6.3, headingY: Math.PI / 2,
      distanceMetres: 0, halfWidthMetres: 2, sourceSegmentId: 'source-street' },
    { x: 5, y: 0, z: 6.3, headingY: Math.PI / 2, distanceMetres: 35, halfWidthMetres: 2, sourceSegmentId: 'source-street' }] }] };
  const finished = withDistrictAdjacency(reserved);
  assert.ok(finished.districtAdjacency!.frontages.length > 0);
  assert.equal(finished.districtAdjacency!.groups.length, 0);
  assert.equal(finished.props, source.props, 'no phantom or relocated objects reserve an actor lane');
  assert.equal(finished.populationPaths, reserved.populationPaths);
});

test('accepted shop/domestic/depot art decisions and source building types survive district finishing', () => {
  const source = withStreetGround(fixture(0, { look: 'commercial' }));
  const fronts = streetFronts(source), industrial = environmentSites(source), domestic = residentialSites(source);
  assert.ok(fronts.length > 0, 'accepted commercial art positive');
  const finished = withDistrictAdjacency(source);
  assert.deepEqual(streetFronts(finished), fronts);
  assert.deepEqual(environmentSites(finished), industrial);
  assert.deepEqual(residentialSites(finished), domestic);
  assert.deepEqual(finished.props!.slice(0, source.props!.length), source.props);
  const preserved = new Map(source.groundSurfacePatches!.map(patch => [patch.id, patch]));
  for (const patch of finished.groundSurfacePatches ?? []) if (preserved.has(patch.id)) assert.equal(patch, preserved.get(patch.id));
});

test('worlds without physically admitted frontages remain unchanged and no metadata claims a finished district', () => {
  const source = { ...fixture(), props: [], solids: [] };
  assert.equal(withDistrictAdjacency(source), source);
  assert.equal((withDistrictAdjacency(source) as DistrictAdjacentPlan).districtAdjacency, undefined);
});

test('the complete preparation hook retains installed physical fragments and never hashes population identity twice', () => {
  const source: LevelPlan = { ...fixture(), populationPaths: [{ id: 'actual-street-walk', role: 'pedestrian',
    district: 'commercial', closed: false, serviceShuttle: false,
    frames: Array.from({ length: 121 }, (_, index) => ({ x: -30 + index * 0.5, y: 0, z: 22,
      headingY: Math.PI / 2, distanceMetres: index * 0.5, sourceSegmentId: 'source-street', halfWidthMetres: 1.5 })) }] };
  const one = preparePopulationWorld(source), two = preparePopulationWorld(one.level);
  assert.ok(one.population.actors.length > 0, 'actual authored population exercises the second identity revision');
  const report = (one.level as DistrictAdjacentPlan).districtAdjacency!;
  assert.ok(report.physicalWorldId.startsWith('district-v1-'));
  assert.notEqual(one.level.id, report.physicalWorldId, 'population is installed on the revised physical world');
  assert.equal(two.level.id, one.level.id);
  assert.equal(two.population.contentDigest, one.population.contentDigest);
  assert.deepEqual(two.population.paths, one.population.paths);
  assert.deepEqual(two.population.actors, one.population.actors);
  assert.equal(two.level.groundSurfacePatches, one.level.groundSurfacePatches, 'no street-prefix stripping on repeated preparation');
  assert.equal(two.level.props, one.level.props);
  assert.equal(two.level.solids, one.level.solids);
  assert.equal(two.level.softBodies, one.level.softBodies);
});
