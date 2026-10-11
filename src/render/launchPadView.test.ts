/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 — the city launch pads, drawn and priced (`render/launchPadView.ts`;
 * `docs/PLANS.md` §42.3a, BUILD_MAP Builder B).
 *
 * The price is what is built at 1/2/4 panes and is paid hidden or shown; the
 * template keeps its contracts (R16 and critic repair r4: a tall octagonal
 * kicker — a light top on the trigger circle, a light coping, a concave yellow
 * skirt steepening to its lip with bold hazard stripes on it, no apron and no
 * dark centre — whose top and skirt are the dome a human seat rides, rolled by
 * its wheel; colour that reaches the shader, never the Ultra static layer);
 * disposal is single. Over the corpus: no
 * grass root stands through a pad, no decor instance stands within its apron radius, and
 * no seed's presentation recipe, ground-edge refusal or admitted edge price
 * moves with the M42 supplements (pads and birds) — even at the most pads a
 * city may have.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import * as THREE from 'three';
import { CAMERA, LAUNCH_PAD, LAUNCH_PAD_LOOK as LOOK, LIVE_TUNABLES, PHYSICS } from '../data/tuning.ts';
import { MARKING_PAINTS } from '../data/markings.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { LaunchPadSite } from '../level/launchPadSites.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { parkCaseSites, residentialSites } from '../level/districtSites.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { LAUNCH_PAD_ROLL_RADIUS, LaunchPadField, launchPadDomeRise, launchPadRideRise } from '../simulation/launchPadField.ts';
import { createGroundSample } from '../simulation/world.ts';
import { ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { ULTRA_RECEIVING_RIGS } from './ultra/ultraRuntime.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, presentationCost } from './presentation.ts';
import { prepareEnvironmentSupplements, type PreparedEnvironmentSupplements } from './environmentSupplementPrice.ts';
import { prepareSharedGroundEdges } from './sharedGroundEdgePlan.ts';
import { judgePreparedGroundEdges } from './sharedGroundEdgeAdmission.ts';
import { prepareBirdFlight } from './birdFlight.ts';
import { prepareEnvironmentVegetation } from './environmentVegetationPlan.ts';
import { createStreetLife, streetFronts } from './streetLife.ts';
import { createEnvironmentDecor } from './environmentDecor.ts';
import { createDistrictDecor } from './districtDecor.ts';
import { createDistrictExterior } from './districtExterior.ts';
import { createDistrictExteriorAppearance } from './districtExteriorAppearance.ts';
import { DEFAULT_SPATIAL_BATCH_METRES } from './spatialBatching.ts';
import {
  countLaunchPads,
  createLaunchPadView,
  launchPadDrawnRise,
  launchPadHeights,
  launchPadPlacement,
  launchPadSkirt,
  launchPadTemplate,
  launchPadTemplateCounts,
} from './launchPadView.ts';

const town = generateLevel('euc').plan;
const slice = createSliceLevel();

/** A site where the view is told to draw one; validity is the finder's business, not the view's. */
function site(plan: LevelPlan, id: string, x: number, z: number, yaw = 0): LaunchPadSite {
  const sample = new PlanTerrainSampler(plan).sampleGround(x, z, createGroundSample());
  return { id, x, y: sample.height, z, yaw, triggerRadius: LAUNCH_PAD.triggerRadiusMetres,
    footprintRadius: LAUNCH_PAD.footprintRadiusMetres, dropMetres: 0 };
}
const SITES: readonly LaunchPadSite[] = [site(town, 'pad-a', 175, 173), site(town, 'pad-b', 45, -165, Math.PI / 8),
  site(town, 'pad-c', 613, -39, -Math.PI / 4)];

function padMesh(group: THREE.Object3D): THREE.InstancedMesh {
  const mesh = group.getObjectByName('launch-pad-instances');
  assert.ok(mesh instanceof THREE.InstancedMesh, 'all of a world\'s pads are one instanced mesh');
  return mesh;
}

/** What three submits: meshes reached through visible ancestors (its `projectObject` walk). */
function submitted(root: THREE.Object3D): number {
  let meshes = 0;
  root.traverseVisible((object) => { if (object instanceof THREE.Mesh) meshes += 1; });
  return meshes;
}

const linearLuminance = (hex: number): number => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

test('the price is what is built: one draw for every pad, the template per pad, exact bytes, at 1/2/4 panes', () => {
  const counts = launchPadTemplateCounts();
  assert.ok(counts.triangles <= 160, `≤ 160 triangles a pad including the apron (${counts.triangles})`);
  assert.ok(counts.geometryBytes <= 8 * 1024, `≤ 8 KB (${counts.geometryBytes})`);
  const view = createLaunchPadView(town, SITES);
  try {
    const mesh = padMesh(view.group);
    const price = countLaunchPads(SITES);
    const geometry = mesh.geometry;
    const geometryBytes = Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
      + geometry.index!.array.byteLength;
    assert.equal(view.group.children.length, 1);
    assert.equal(mesh.count, SITES.length);
    assert.equal(geometry.getAttribute('position').count, counts.vertices);
    assert.equal(geometry.index!.count / 3, counts.triangles);
    assert.equal(geometry.index!.array.BYTES_PER_ELEMENT, 2);
    assert.equal(price.colourDraws, 1);
    assert.equal(price.shadowDraws, 0);
    assert.equal(price.shadowTriangles, 0);
    assert.equal(price.textureBytes, 0);
    assert.equal(price.colourTriangles, mesh.count * geometry.index!.count / 3);
    assert.equal(price.geometryBytes, geometryBytes);
    assert.equal(price.geometryBytes, counts.geometryBytes);
    assert.equal(price.instanceBytes, mesh.instanceMatrix.array.byteLength);
    const report = view.report();
    assert.deepEqual(report.ids, SITES.map((s) => s.id));
    assert.equal(report.pads, SITES.length);
    assert.equal(report.drawCalls, price.colourDraws);
    assert.equal(report.colourTriangles, price.colourTriangles);
    assert.equal(report.geometryBytes, price.geometryBytes);
    assert.equal(report.instanceBytes, price.instanceBytes);
    console.log(JSON.stringify({ pad: 'template', vertices: counts.vertices, triangles: counts.triangles,
      geometryBytes: counts.geometryBytes, instanceBytesPerPad: price.instanceBytes / SITES.length }));
  } finally { view.dispose(); }

  // Every frame shape pays it once per pane, ordinary rungs alike.
  const supplements = prepareEnvironmentSupplements(slice);
  try {
    const none = { ...supplements, launchPads: [] }, some = { ...supplements, launchPads: SITES };
    for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION]) {
      const without = presentationCost(slice, recipe, null, none), withPads = presentationCost(slice, recipe, null, some);
      for (const [frame, panes] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
        assert.equal(withPads.frame[frame].drawCalls - without.frame[frame].drawCalls, 1 * panes);
        assert.equal(withPads.frame[frame].triangles - without.frame[frame].triangles, counts.triangles * SITES.length * panes);
      }
      assert.equal(withPads.shadowTriangles, without.shadowTriangles, 'no shadow pass');
    }
  } finally { supplements.dispose(); }

  // No sites, nothing allocated, zeros.
  const empty = createLaunchPadView(town, []);
  assert.equal(empty.group.children.length, 0);
  assert.deepEqual({ ...empty.report(), visible: false }, { ids: [], visible: false, pads: 0, drawCalls: 0,
    colourTriangles: 0, geometryBytes: 0, instanceBytes: 0 });
  assert.deepEqual(countLaunchPads([]), { colourDraws: 0, shadowDraws: 0, colourTriangles: 0, shadowTriangles: 0,
    geometryBytes: 0, instanceBytes: 0, textureBytes: 0 });
  empty.dispose();
});

test('hidden pads are still priced, and hiding them costs zero draws in a render', () => {
  const view = createLaunchPadView(town, SITES);
  const scene = new THREE.Scene();
  try {
    scene.add(view.group);
    view.setVisible(true);
    assert.equal(submitted(scene), 1);
    assert.equal(view.report().visible, true);
    const shown = view.report();
    view.setVisible(false);
    assert.equal(submitted(scene), 0, 'hidden is zero draws');
    const hidden = view.report();
    assert.equal(hidden.visible, false);
    assert.deepEqual({ ...hidden, visible: true }, shown, 'and still priced as installed');
    assert.deepEqual(countLaunchPads(SITES), countLaunchPads(SITES), 'the price takes no mode');
  } finally { view.dispose(); }

  // The renderer re-applies the mode's flag after every rebuild, and the warm
  // pass shows the pads before `compile` and restores the flag in a `finally`
  // spanning the whole warm body. (`GameRenderer` needs WebGL; the browser
  // block of tests/m42.spec.ts drives the live path.)
  const source = readFileSync(new URL('./Renderer.ts', import.meta.url), 'utf8');
  const build = source.slice(source.indexOf('private *levelBuildSteps('), source.indexOf('setCheckpointsVisible(visible: boolean): void {'));
  assert.ok(/createLaunchPadView\(plan, supplements\.launchPads\);\s*this\.launchPadView\.setVisible\(this\.launchPadsVisible/.test(build),
    'a rebuild re-applies the stored flag');
  const warm = source.slice(source.indexOf('async warmPrograms()'), source.indexOf('private async warmVisiblePrograms()'));
  const body = source.slice(source.indexOf('private async warmVisiblePrograms()'), source.indexOf('plantPerfQuadProbe('));
  assert.ok(warm.indexOf('pads?.setVisible(true)') > 0, 'the warm shows the pads');
  assert.ok(warm.indexOf('pads?.setVisible(true)') < warm.indexOf('this.warmVisiblePrograms()'), '… before any compile');
  assert.ok(/finally \{[^}]*setVisible\(this\.launchPadsVisible\)/s.test(warm), '… and restores the flag in a finally');
  // A count, never a shared flag: only the last of overlapping warms restores
  // the flag, so one warm's finally cannot hide the next world's pads between
  // that warm's compile and its zero-area draw (QA-B r1 m2).
  assert.ok(/this\.padWarms \+= 1;\s*pads\?\.setVisible\(true\)/.test(warm), 'each warm counts itself in');
  assert.ok(/finally \{\s*this\.padWarms -= 1;[^}]*if \(this\.padWarms === 0\) \{[^}]*setVisible\(this\.launchPadsVisible\)/s.test(warm),
    '… and only the last one out restores the flag');
  assert.ok(!/warmingPads/.test(source), 'no shared boolean left');
  assert.ok(/setVisible\(this\.launchPadsVisible \|\| this\.padWarms > 0\)/.test(build), 'a rebuild during a warm keeps the new pads shown');
  assert.ok(body.includes('this.renderer.compile(this.scene, camera)'), 'the compile is inside the shown span');
  assert.ok(body.indexOf('this.renderer.compile(this.scene, camera)') < body.indexOf('this.renderer.render(this.scene, camera)'));
});

test('never on the Ultra static layer, receives and casts no shadow, and its colour reaches the shader', () => {
  const view = createLaunchPadView(town, SITES);
  try {
    const mesh = padMesh(view.group);
    assert.equal(mesh.layers.mask, 1);
    assert.equal(mesh.layers.isEnabled(ULTRA_STATIC_LAYER), false);
    assert.equal(view.group.layers.isEnabled(ULTRA_STATIC_LAYER), false);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, true);
    assert.equal(view.group.name, 'launch-pads');
    assert.ok(!/^level-|^knockabout-target/.test(view.group.name) && !/^level-|^knockabout-target/.test(mesh.name),
      'no renderCost category prefix');
    assert.equal(ULTRA_RECEIVING_RIGS.has(view.group.name), false);
    // The LESSONS trap: a colour attribute without vertexColors renders the base colour (or black).
    const colour = mesh.geometry.getAttribute('color');
    assert.ok(colour, 'a colour attribute');
    assert.equal(colour.itemSize, 3);
    assert.equal(colour.count, mesh.geometry.getAttribute('position').count);
    const material = mesh.material as THREE.MeshStandardMaterial;
    assert.ok(material instanceof THREE.MeshStandardMaterial, 'Ultra re-materials standard materials');
    assert.equal(material.vertexColors, true);
    assert.equal(material.map, null);
    assert.equal(mesh.instanceColor, null);
    assert.equal(material.color.getHex(), 0xffffff, 'the vertex paint is not tinted');
    // Culled whole, with bounds computed once over every instance.
    assert.equal(mesh.frustumCulled, true);
    assert.ok(mesh.boundingSphere);
    for (const s of SITES) {
      const foot = LAUNCH_PAD.domeFootRadiusMetres;
      for (const [dx, dz] of [[0, 0], [foot, 0], [0, -foot]]) {
        assert.ok(mesh.boundingSphere.distanceToPoint(new THREE.Vector3(s.x + dx, s.y, s.z + dz)) <= 0.05, 'every foot inside the bounds');
      }
    }
    assert.ok(mesh.geometry.getAttribute('normal'), 'lit like the lawn it lies on');
  } finally { view.dispose(); }

  // Paint: inside DESIGN §2's band, the skirt's shaded foot too; the yellow under road paint; a
  // light top (R16: never a dark centre) and a lighter coping; dark ink only on the stripes and the
  // marker's shaft.
  for (const hex of [LOOK.rimColour, LOOK.topColour, LOOK.shaftColour, LOOK.inkColour, LOOK.copingColour]) {
    const luminance = linearLuminance(hex);
    assert.ok(luminance >= 0.03 && luminance <= 0.6, `${hex.toString(16)} at ${luminance}`);
  }
  for (const shade of LOOK.skirtShades) {
    assert.ok(linearLuminance(LOOK.rimColour) * shade >= 0.03 && shade <= 1, `skirt shade ${shade}`);
  }
  assert.ok(linearLuminance(LOOK.rimColour) < linearLuminance(MARKING_PAINTS.road.albedo));
  assert.ok(linearLuminance(LOOK.topColour) > linearLuminance(LOOK.rimColour), 'a light top, lighter than the yellow');
  assert.ok(linearLuminance(LOOK.copingColour) > linearLuminance(LOOK.topColour), 'a light coping, the lip\'s edge');
  assert.ok(linearLuminance(LOOK.inkColour) < linearLuminance(LOOK.rimColour) / 5, 'dark ink on the yellow');
});

test('critic r4: a tall octagonal kicker — a light top on the trigger, a light coping, a concave yellow skirt steepening to a striped lip, no apron, no dark centre', () => {
  // The pad (the hovering marker above it is the next test's).
  const template = launchPadTemplate(false);
  const counts = launchPadTemplateCounts(false);
  assert.equal(template.positions.length / 3, counts.vertices);
  assert.equal(template.indices.length / 3, counts.triangles);
  const paint = (hex: number, shade = 1): string => new THREE.Color(hex).toArray().map((v) => (v * shade).toFixed(6)).join();
  const role = new Map([[paint(LOOK.topColour), 'top'], [paint(LOOK.copingColour), 'coping'], [paint(LOOK.inkColour), 'ink']]);
  LOOK.skirtShades.forEach((shade, ring) => { if (!role.has(paint(LOOK.rimColour, shade))) role.set(paint(LOOK.rimColour, shade), `skirt${ring}`); });
  const key = (v: number): string => [...template.colours.subarray(v * 3, v * 3 + 3)].map((c) => c.toFixed(6)).join();
  type Point = { v: number; x: number; y: number; z: number; r: number };
  const byRole = new Map<string, Point[]>();
  for (let v = 0; v < counts.vertices; v += 1) {
    const name = role.get(key(v));
    assert.ok(name, `vertex ${v} carries an unknown paint (no dark centre, no apron: the pad's only dark paint is its stripe ink)`);
    const x = template.positions[v * 3], y = template.positions[v * 3 + 1], z = template.positions[v * 3 + 2];
    const list = byRole.get(name) ?? [];
    list.push({ v, x, y, z, r: Math.hypot(x, z) });
    byRole.set(name, list);
  }
  const trigger = LAUNCH_PAD.triggerRadiusMetres, foot = LAUNCH_PAD.domeFootRadiusMetres;
  const sides = LOOK.octagonSides, apothem = Math.cos(Math.PI / sides);
  const heights = launchPadHeights(), skirt = launchPadSkirt();
  const degrees = skirt.angles.map((a) => +((a * 180) / Math.PI).toFixed(1));
  // Tall enough to read from the road (critic r4: the yellow face ≥ 12 px at the six road
  // sightings at 720p; 0.6 m measured 10–13), and a kicker's concave run: steepening from a
  // shallow foot to a steep lip, every facet a slope a wheel rides, never a wall.
  assert.ok(heights.top >= 0.7 && heights.apex <= 0.85, `lip ${heights.top} m, apex ${heights.apex} m`);
  assert.equal(heights.top, LAUNCH_PAD.domeHeightMetres, 'the drawn lip is the ridden one');
  assert.ok(skirt.angles[0] > skirt.angles[1] && skirt.angles[1] > skirt.angles[2], `concave: steepening to the lip (${degrees}°)`);
  assert.ok(degrees[0] >= 40 && degrees[0] <= 58, `a steep lip, not a wall (${degrees[0]}°)`);
  assert.ok(degrees[2] >= 8 && degrees[2] <= 18, `a shallow foot (${degrees[2]}°)`);
  assert.ok(foot > LAUNCH_PAD.footprintRadiusMetres && foot <= LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.grassCheckMarginMetres
    && foot < LAUNCH_PAD.apronRadiusMetres, 'the foot on the finder\'s checked grass, inside its decor-free radius');
  // No apron: nothing drawn beyond the foot octagon's corners, and they are on it.
  const all = [...byRole.values()].flat();
  assert.ok(Math.abs(Math.max(...all.map((p) => p.r)) - foot) < 1e-6, 'the foot is the outermost thing drawn');
  // The light top: its crown and one octagon whose faces touch the trigger circle — derived,
  // never typed — so every launch leaves the top.
  const top = byRole.get('top')!;
  assert.equal(top.length, 1 + sides);
  assert.equal(top.filter((p) => p.r < 1e-9 && Math.abs(p.y - heights.apex) < 1e-6).length, 1, 'the crown on the centre');
  for (const p of top.filter((q) => q.r > 1e-9)) {
    assert.ok(Math.abs(p.r - trigger / apothem) < 1e-6 && Math.abs(p.y - heights.top) < 1e-6, `top corner at ${p.r}, ${p.y}`);
  }
  // No dark centre: seen from above, everything inside the trigger circle is the light top.
  for (const [name, points] of byRole) {
    for (const p of points) if (p.r < trigger - 1e-6) assert.equal(name, 'top', `vertex ${p.v} inside the trigger is ${name}`);
  }
  // The coping: a light ring from the top's edge down the lip to the coping's foot.
  const coping = byRole.get('coping')!, [edge, copingFoot] = skirt.rings;
  assert.equal(coping.length, 2 * sides);
  for (const p of coping) {
    const atEdge = Math.abs(p.r - edge.apothem / apothem) < 1e-6 && Math.abs(p.y - edge.height) < 1e-6;
    const atFoot = Math.abs(p.r - copingFoot.apothem / apothem) < 1e-6 && Math.abs(p.y - copingFoot.height) < 1e-6;
    assert.ok(atEdge || atFoot, `coping vertex ${p.v} on the lip's edge or the coping's foot`);
  }
  assert.ok(Math.abs(Math.hypot(copingFoot.apothem - edge.apothem, edge.height - copingFoot.height) - LOOK.copingSlopeMetres) < 1e-9);
  // The yellow skirt: per side, four rings on the face's own line (the coping's foot, the lip's
  // knee, the middle knee, the foot), each on the profile, darkening towards the lawn.
  const rings = skirt.rings.slice(1);
  const skirtPoints = [...byRole].filter(([name]) => name.startsWith('skirt')).flatMap(([, points]) => points);
  assert.equal(skirtPoints.length, sides * rings.length * 2, 'two corners a side on each ring, unshared between sides');
  assert.ok(LOOK.skirtShades.every((s, k) => k === 0 || s <= LOOK.skirtShades[k - 1]), 'the paint darkens towards the foot');
  rings.forEach((ring, k) => {
    if (k < rings.length - 1) assert.ok(Math.abs(ring.height - launchPadDrawnRise(0, ring.apothem)) < 1e-9, `ring ${k} on the profile`);
    else assert.equal(ring.height, LOOK.baseLiftMetres, 'the foot at the base lift');
    const on = skirtPoints.filter((p) => Math.abs(p.y - ring.height) < 1e-6 && Math.abs(p.r * Math.cos(Math.PI / sides) - ring.apothem) < 1e-6);
    assert.equal(on.length, sides * 2, `ring ${k}: every side's two corners`);
    for (const p of on) {
      assert.equal(key(p.v), paint(LOOK.rimColour, LOOK.skirtShades[k]), `ring ${k}: shaded ${LOOK.skirtShades[k]}`);
    }
  });
  // Bold hazard stripes: `hazardStripes` a side, each a leaning parallelogram on the lip facet
  // between the coping's foot and the lip's knee, lifted off it, inside the face.
  const ink = byRole.get('ink')!;
  assert.equal(ink.length, sides * LOOK.hazardStripes * 4);
  const lipKnee = skirt.rings[2], lipAngle = skirt.angles[0];
  for (let face = 0; face < sides; face += 1) {
    const bearing = (face * Math.PI * 2) / sides, nx = Math.sin(bearing), nz = Math.cos(bearing);
    for (let stripe = 0; stripe < LOOK.hazardStripes; stripe += 1) {
      const start = (face * LOOK.hazardStripes + stripe) * 4;
      const mine = ink.slice(start, start + 4);
      const across = (p: Point): number => p.x * nz - p.z * nx;
      for (const p of mine) {
        const along = p.x * nx + p.z * nz;
        const faceY = edge.height - (along - edge.apothem) * Math.tan(lipAngle);
        const off = (p.y - faceY) * Math.cos(lipAngle);
        assert.ok(Math.abs(off - LOOK.decalLiftMetres) < 1e-5, `face ${face}: ${off} m off the lip`);
        assert.ok(p.y <= copingFoot.height + LOOK.decalLiftMetres && p.y >= lipKnee.height, 'between the coping and the lip\'s knee');
        assert.ok(Math.abs(across(p)) < along * Math.tan(Math.PI / sides), 'inside the face');
      }
      const upper = mine.filter((p) => p.y > (copingFoot.height + lipKnee.height) / 2), lower = mine.filter((p) => p.y <= (copingFoot.height + lipKnee.height) / 2);
      assert.equal(upper.length, 2);
      const lean = Math.min(...upper.map(across)) - Math.min(...lower.map(across));
      assert.ok(Math.abs(Math.abs(lean) - LOOK.hazardStripeLeanMetres) < 1e-5, `face ${face}: a diagonal (${lean})`);
      assert.ok(LOOK.hazardStripeWidthMetres >= 0.2, 'bold, not fine');
    }
  }
  // Every face looks at the sky, and every skirt vertex out from the centre too.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(template.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(template.indices, 1));
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let v = 0; v < normals.count; v += 1) assert.ok(normals.getY(v) > 0.5, `vertex ${v} faces down or sideways`);
  for (const p of all.filter((q) => q.r > trigger / apothem + 1e-6)) {
    assert.ok((normals.getX(p.v) * p.x + normals.getZ(p.v) * p.z) / p.r > 0.1, `skirt vertex ${p.v} faces out`);
  }
  geometry.dispose();
});

test('critic r4: the drawn top and skirt are the field\'s profile, and a human seat rides it rolled by its wheel — never in it — at any yaw', () => {
  const template = launchPadTemplate(false);
  const paint = (hex: number, shade = 1): string => new THREE.Color(hex).toArray().map((v) => (v * shade).toFixed(6)).join();
  const surface = new Set([paint(LOOK.topColour), paint(LOOK.copingColour), ...LOOK.skirtShades.map((s) => paint(LOOK.rimColour, s))]);
  const key = (v: number): string => [...template.colours.subarray(v * 3, v * 3 + 3)].map((c) => c.toFixed(6)).join();
  const triangles: number[][] = [];
  for (let t = 0; t < template.indices.length; t += 3) {
    const tri = [template.indices[t], template.indices[t + 1], template.indices[t + 2]];
    if (tri.every((v) => surface.has(key(v)))) triangles.push(tri);
  }
  const at = (v: number): [number, number, number] => [template.positions[v * 3], template.positions[v * 3 + 1], template.positions[v * 3 + 2]];
  /** The drawn surface's height under (x, z) in the template frame, or null off it. */
  const drawn = (x: number, z: number): number | null => {
    let best: number | null = null;
    for (const [a, b, c] of triangles) {
      const [ax, ay, az] = at(a), [bx, by, bz] = at(b), [cx, cy, cz] = at(c);
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (l1 < -1e-9 || l2 < -1e-9 || 1 - l1 - l2 < -1e-9) continue;
      const y = l1 * ay + l2 * by + (1 - l1 - l2) * cy;
      if (best === null || y > best) best = y;
    }
    return best;
  };
  const r = LAUNCH_PAD_ROLL_RADIUS, lip = launchPadSkirt().angles[0];
  // The most a rolled wheel's lowest point stands over a facet: r·(sec θ − 1) at the steepest.
  const roll = r * (1 / Math.cos(lip) - 1);
  for (const yaw of [0, 0.37, -1.1]) {
    const field = new LaunchPadField([{ id: 'p', x: 12, z: -7, yaw, triggerRadius: LAUNCH_PAD.triggerRadiusMetres,
      footprintRadius: LAUNCH_PAD.footprintRadiusMetres, dropMetres: 0 }]);
    let worstDrawn = 0, worstAbove = 0, onTop = 0;
    for (let i = 0; i < 2000; i += 1) {
      // A deterministic spiral over the foot octagon and the wheel's reach beyond it.
      const radius = (LAUNCH_PAD.domeFootRadiusMetres + r + 0.2) * Math.sqrt((i + 0.5) / 2000), angle = i * 2.399963;
      const lx = Math.sin(angle) * radius, lz = Math.cos(angle) * radius;
      // The template frame turned by yaw (three's convention) is the world offset.
      const wx = lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const ride = field.riseAt(12 + wx, -7 + wz);
      const profile = launchPadDrawnRise(lx, lz);
      const mesh = drawn(lx, lz);
      if (mesh === null) {
        assert.equal(profile, 0, 'no profile off the drawn pad');
        assert.ok(ride >= 0 && ride <= roll + 1e-9, `yaw ${yaw}: beyond the foot only the wheel's reach (${ride})`);
        continue;
      }
      // The mesh is the profile (within the skirt foot's 1 cm base lift).
      worstDrawn = Math.max(worstDrawn, Math.abs(mesh - profile));
      // Ridden: never below the drawn surface, never more than the wheel's roll over it.
      assert.ok(ride >= profile - 1e-9, `yaw ${yaw}: the wheel never stands in the ramp (${ride} < ${profile})`);
      worstAbove = Math.max(worstAbove, ride - profile);
      if (Math.hypot(lx, lz) <= LAUNCH_PAD.triggerRadiusMetres) {
        onTop += 1;
        assert.ok(ride - profile < 2e-4, `yaw ${yaw}: the top is ridden as drawn`);
        assert.ok(ride >= LAUNCH_PAD.domeHeightMetres - 1e-9, 'every trigger point is on the top');
      }
    }
    assert.ok(worstDrawn <= LOOK.baseLiftMetres + 1e-6, `yaw ${yaw}: mesh vs profile within the skirt's 1 cm foot (${worstDrawn})`);
    assert.ok(worstAbove <= roll + 1e-9 && worstAbove > 0.05, `yaw ${yaw}: the roll is used on the steep lip (${worstAbove.toFixed(3)} ≤ ${roll.toFixed(3)})`);
    assert.ok(onTop > 100);
  }
  // Radially, the rolled wheel touches the drawn profile and never cuts it: its circle (centre
  // r over the ridden height) stays on or over the profile, and meets it.
  const top = LAUNCH_PAD.triggerRadiusMetres, base = LAUNCH_PAD.domeFootRadiusMetres * Math.cos(Math.PI / 8);
  for (let p = 0; p <= base + r; p += 0.01) {
    const centre = launchPadRideRise(p, top, base) + r;
    let gap = Infinity;
    for (let q = Math.max(0, p - r); q <= p + r; q += 0.0025) {
      gap = Math.min(gap, centre - Math.sqrt(Math.max(0, r * r - (q - p) ** 2)) - launchPadDomeRise(q, top, base));
    }
    assert.ok(gap >= -1e-6, `at ${p.toFixed(2)} m the tyre cuts the ramp by ${-gap}`);
    if (launchPadRideRise(p, top, base) > 1e-3) assert.ok(gap < 2e-3, `at ${p.toFixed(2)} m the tyre floats ${gap}`);
  }
});

test('q237/R14: the hovering marker clears every rider over the pad centre, reads from the road, turns gently, and is priced and hidden with it', () => {
  const plain = launchPadTemplateCounts(false), marked = launchPadTemplateCounts(true);
  assert.equal(LOOK.markerShown, true, 'R14: on by default');
  assert.deepEqual(launchPadTemplateCounts(), marked, 'the game builds what LAUNCH_PAD_LOOK says');
  assert.equal(marked.vertices - plain.vertices, 36);
  assert.equal(marked.triangles - plain.triangles, 16);
  assert.ok(marked.triangles <= 160, `≤ 160 triangles a pad with the marker (${marked.triangles})`);
  const padsBytes = marked.geometryBytes + LAUNCH_PAD.maximumPads * 64;
  assert.ok(padsBytes <= 8 * 1024, `≤ 8 KB with the marker and the most pads' matrices (${padsBytes})`);
  const template = launchPadTemplate(true), heights = launchPadHeights();
  assert.equal(template.positions.length / 3, marked.vertices);
  assert.equal(template.indices.length / 3, marked.triangles);
  assert.equal(template.markerFirst, plain.vertices);
  // The low pad is unchanged underneath: the same first vertices and triangles.
  const low = launchPadTemplate(false);
  assert.deepEqual([...template.positions.subarray(0, low.positions.length)], [...low.positions]);
  assert.deepEqual([...template.indices.subarray(0, low.indices.length)], [...low.indices]);
  // Over the pad's centre, its lowest point (the arrow's tip, on the centre
  // line) above the highest rider a pad can throw from the dome's top: the F4 slider's top lift's
  // apex + a ≈ 1.9 m rider + margin, and R14's 4.2 m.
  const lift = LIVE_TUNABLES.find((spec) => spec.path === 'LAUNCH_PAD.verticalSpeed');
  assert.ok(lift && typeof lift.max === 'number');
  const highestRider = lift.max ** 2 / (2 * PHYSICS.gravity) + 1.9;
  const yellow = new THREE.Color(LOOK.rimColour).toArray().map((v) => v.toFixed(6)).join();
  const dark = new THREE.Color(LOOK.shaftColour).toArray().map((v) => v.toFixed(6)).join();
  let lowest = Infinity, highest = -Infinity, widest = 0;
  for (let v = plain.vertices; v < marked.vertices; v += 1) {
    const x = template.positions[v * 3], y = template.positions[v * 3 + 1], z = template.positions[v * 3 + 2];
    const paint = [...template.colours.subarray(v * 3, v * 3 + 3)].map((c) => c.toFixed(6)).join();
    assert.ok(Math.hypot(x, z) <= LOOK.markerHeadHalfWidthMetres * Math.SQRT2 + 1e-6, `marker vertex ${v} over the pad`);
    assert.ok(Math.hypot(x, z) < LAUNCH_PAD.triggerRadiusMetres, '… over the light top, seen from above');
    if (y < heights.markerCap - 1e-6) assert.ok(Math.hypot(x, z) < 1e-9, 'below the cap only the tip, on the centre line');
    // The arrowhead (its tip, and its corners at the cap) is signal yellow; the shaft above it is the dark centre's paint.
    const shaftCorner = Math.abs(Math.hypot(x, z) - LOOK.markerShaftHalfWidthMetres * Math.SQRT2) < 1e-6;
    const inShaft = y > heights.markerCap + 1e-6 || (Math.abs(y - heights.markerCap) < 1e-6 && shaftCorner);
    assert.equal(paint, inShaft ? dark : yellow, `marker vertex ${v}: ${inShaft ? 'shaft dark' : 'arrowhead yellow'}`);
    lowest = Math.min(lowest, y); highest = Math.max(highest, y);
    widest = Math.max(widest, Math.abs(x), Math.abs(z));
  }
  assert.ok(Math.abs(lowest - heights.markerTip) < 1e-5 && Math.abs(highest - heights.markerTop) < 1e-5);
  assert.ok(lowest - heights.apex >= 4.2 - 1e-6, `R14: tip ${(lowest - heights.apex).toFixed(2)} m over the pad's top`);
  // R16: the highest rider takes off from the dome's top, never above its crown.
  assert.ok(lowest - heights.apex >= highestRider + 0.9, `… ≥ 0.9 m over the highest rider (${highestRider.toFixed(2)} m over the top)`);
  assert.ok(Math.abs(widest - LOOK.markerHeadHalfWidthMetres) < 1e-6 && LOOK.markerShaftHalfWidthMetres < widest / 2,
    'a broad head on a narrow shaft: an arrow, pointing down');
  // Its own normals: sides lit as uprights facing out, caps looking up; every face wound to its normal.
  for (let v = 0; v < template.markerNormals.length / 3; v += 1) {
    const nx = template.markerNormals[v * 3], ny = template.markerNormals[v * 3 + 1], nz = template.markerNormals[v * 3 + 2];
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-6);
    assert.ok(Math.abs(ny) < 1e-6 || Math.abs(ny - 1) < 1e-6, `marker vertex ${v}: upright or cap`);
  }
  for (let t = low.indices.length; t < template.indices.length; t += 3) {
    const at = (k: number) => new THREE.Vector3().fromArray(template.positions, template.indices[t + k] * 3);
    const a = at(0), normal = at(1).sub(a).cross(at(2).sub(a)).normalize();
    const lit = new THREE.Vector3().fromArray(template.markerNormals, (template.indices[t] - template.markerFirst) * 3);
    assert.ok(normal.dot(lit) > 0.4, `marker triangle ${(t - low.indices.length) / 3} faces its own light`);
  }
  // From the road (the critics' farthest nearest-road distance, 65 m) at the widest chase lens on 720p it is ≥ 20 px tall.
  const pixels = ((heights.markerTop - heights.markerTip) / (2 * 65 * Math.tan(CAMERA.fovAtSpeed / 2))) * 720;
  assert.ok(pixels >= 20, `${pixels.toFixed(1)} px at 65 m`);
  // Built: one mesh still, priced as built, no shadow, render-only, hidden with the pad.
  const before = JSON.stringify(town), sampler = new PlanTerrainSampler(town), sample = createGroundSample();
  const grounds = SITES.map((s) => sampler.sampleGround(s.x, s.z, sample).height);
  const view = createLaunchPadView(town, SITES, true);
  try {
    const mesh = padMesh(view.group);
    assert.equal(view.group.children.length, 1);
    assert.equal(mesh.castShadow, false);
    const price = countLaunchPads(SITES, true);
    assert.equal(price.colourDraws, 1, 'one draw, the marker included');
    assert.equal(price.colourTriangles, marked.triangles * SITES.length);
    assert.equal(price.geometryBytes, Object.values(mesh.geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
      + mesh.geometry.index!.array.byteLength);
    assert.deepEqual({ ...view.report(), ids: [], visible: true }, { ids: [], visible: true, pads: SITES.length, drawCalls: 1,
      colourTriangles: price.colourTriangles, geometryBytes: price.geometryBytes, instanceBytes: price.instanceBytes });
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    assert.deepEqual([...(normal.array as Float32Array).subarray(template.markerFirst * 3)], [...template.markerNormals]);
    const padPart = [...(position.array as Float32Array).subarray(0, template.markerFirst * 3)];
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const holds = (label: string) => SITES.forEach((_, index) => {
      mesh.getMatrixAt(index, matrix);
      for (let v = template.markerFirst; v < position.count; v += 1) {
        point.fromBufferAttribute(position, v).applyMatrix4(matrix);
        assert.ok(mesh.boundingSphere!.distanceToPoint(point) <= 1e-3, `${label}: marker vertex ${v} inside the bounds computed once`);
      }
    });
    holds('at rest');
    // It turns slowly about its upright: one turn per `markerTurnSeconds`, the same seconds the same pose.
    const version = position.version;
    view.update(LOOK.markerTurnSeconds / 8, false);
    assert.ok(position.version > version, 'turned');
    const eighth = [...(position.array as Float32Array)];
    const tip = new THREE.Vector3().fromBufferAttribute(position, template.markerFirst);
    assert.ok(Math.hypot(tip.x, tip.z) < 1e-6 && Math.abs(tip.y - heights.markerTip) < 1e-5, 'the tip stays on the centre line');
    const corner = new THREE.Vector3().fromBufferAttribute(position, template.markerFirst + 1);
    const restCorner = new THREE.Vector3().fromArray(template.positions, (template.markerFirst + 1) * 3);
    // three turns +Z towards +X about +Y: the bearing atan2(x, z) grows by the turn.
    const turnedBy = Math.atan2(corner.x, corner.z) - Math.atan2(restCorner.x, restCorner.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(turnedBy), Math.cos(turnedBy)) - Math.PI / 4) < 1e-5, 'an eighth of a turn');
    assert.ok(Math.PI * 2 / LOOK.markerTurnSeconds <= 0.6, 'slow: at most ≈ 34°/s');
    assert.deepEqual([...(position.array as Float32Array)].slice(0, padPart.length), padPart, 'the pad itself never moves');
    holds('turned');
    const settled = position.version;
    view.update(LOOK.markerTurnSeconds / 8, false);
    assert.equal(position.version, settled, 'an unchanged angle uploads nothing');
    view.update(LOOK.markerTurnSeconds * 3 + LOOK.markerTurnSeconds / 8, false);
    assert.deepEqual([...(position.array as Float32Array)].map((v) => +v.toFixed(4)), eighth.map((v) => +v.toFixed(4)), 'periodic');
    view.update(5, true);
    assert.deepEqual([...(position.array as Float32Array)].map((v) => +v.toFixed(5)),
      [...padPart, ...template.positions.subarray(template.markerFirst * 3)].map((v) => +v.toFixed(5)), 'reduced motion holds it at rest');
    view.setVisible(false);
    assert.equal(submitted(view.group), 0, 'hidden with the pad: nothing of it draws');
    const hiddenVersion = position.version;
    view.update(7, false);
    assert.equal(position.version, hiddenVersion, 'hidden: no turn, no upload');
  } finally { view.dispose(); }
  assert.equal(JSON.stringify(town), before, 'never in the plan');
  assert.deepEqual(SITES.map((s) => sampler.sampleGround(s.x, s.z, sample).height), grounds, 'never in the sampler');
  console.log(JSON.stringify({ pad: 'hovering marker (q237/R14)', shown: LOOK.markerShown, vertices: marked.vertices,
    triangles: marked.triangles, geometryBytes: marked.geometryBytes, addedTriangles: marked.triangles - plain.triangles,
    addedBytes: marked.geometryBytes - plain.geometryBytes, tipOverPadTop: +(heights.markerTip - heights.apex).toFixed(3),
    highestRider: +highestRider.toFixed(2), pixelsAt65m720p: +pixels.toFixed(1) }));
});

test('repeated teardown frees every unique owner exactly once', () => {
  const scene = new THREE.Scene();
  for (let generation = 0; generation < 3; generation += 1) {
    const view = createLaunchPadView(town, SITES);
    scene.add(view.group);
    const mesh = padMesh(view.group);
    const counts = [0, 0, 0];
    mesh.addEventListener('dispose', () => { counts[0] += 1; });
    mesh.geometry.addEventListener('dispose', () => { counts[1] += 1; });
    (mesh.material as THREE.Material).addEventListener('dispose', () => { counts[2] += 1; });
    view.dispose();
    view.dispose();
    assert.equal(scene.children.length, 0);
    assert.deepEqual(counts, [1, 1, 1]);
  }
});

test('each pad lies on its lawn: on the fitted plane, never under the ground, at the site and its yaw', () => {
  const sampler = new PlanTerrainSampler(town), sample = createGroundSample();
  const view = createLaunchPadView(town, SITES);
  try {
    const mesh = padMesh(view.group), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const template = launchPadTemplate(), forward = new THREE.Vector3();
    SITES.forEach((s, index) => {
      mesh.getMatrixAt(index, matrix);
      const placed = launchPadPlacement(sampler, s);
      point.setFromMatrixPosition(matrix);
      assert.ok(Math.hypot(point.x - s.x, point.z - s.z) < 1e-4, 'at the site');
      assert.ok(Math.abs(point.y - s.y) <= LAUNCH_PAD.footprintFlatnessMetres + placed.raise + 1e-6, 'on its ground');
      forward.set(0, 0, 1).transformDirection(matrix);
      const turn = Math.atan2(forward.x, forward.z) - s.yaw;
      assert.ok(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < 1e-3, 'a flat face turned to the yaw');
      // Every drawn base and apron vertex stands above the ground beneath it.
      for (let v = 0; v < template.positions.length / 3; v += 1) {
        if (template.positions[v * 3 + 1] > LOOK.baseLiftMetres + 1e-9) continue;
        point.fromArray(template.positions, v * 3).applyMatrix4(matrix);
        sampler.sampleGround(point.x, point.z, sample);
        assert.ok(point.y >= sample.height + LOOK.baseLiftMetres / 2, `pad ${s.id} vertex ${v} sinks`);
      }
    });
  } finally { view.dispose(); }
});

// ---------------------------------------------------------------------------
// The corpus: grass, decor, and the recipe and ground-edge sweep
// ---------------------------------------------------------------------------

const CORPUS = ['euc', 'x67', 'jetty-orchard-74', 'route-41', 'harbour-spark-42', 'sweep-15', 'euc-7', 'copper-gate-55'];
interface CorpusWorld {
  readonly seed: string;
  readonly level: LevelPlan;
  readonly supplements: PreparedEnvironmentSupplements;
}
let corpus: CorpusWorld[] | null = null;
/** Installed exactly as the game installs them (`preparePopulationWorld`), prepared once per file. */
function corpusWorlds(): CorpusWorld[] {
  corpus ??= CORPUS.map((seed) => {
    const world = preparePopulationWorld(generateLevel(seed).plan);
    return { seed, level: world.level, supplements: prepareEnvironmentSupplements(world.level, world.population) };
  });
  return corpus;
}
after(() => { for (const world of corpus ?? []) world.supplements.dispose(); });

test('no grass root stands through a pad, in any mode; the exclusion removes clumps only', (t) => {
  const worlds = corpusWorlds();
  if (worlds.every((world) => world.supplements.launchPads.length === 0)) {
    t.skip('the finder found no sites on any corpus seed: nothing to measure yet');
    return;
  }
  const clear = LAUNCH_PAD.footprintRadiusMetres + LOOK.grassClearMetres;
  let before = 0, beforeOrdinary = 0;
  for (const { seed, level, supplements } of worlds) {
    const sites = supplements.launchPads;
    const near = (x: number, z: number): boolean => sites.some((s) => Math.hypot(x - s.x, z - s.z) <= clear);
    // Installed (with the exclusion): none.
    assert.equal(supplements.grass.clumps.filter((c) => near(c.x, c.z)).length, 0, `${seed}: a clump stands through a pad`);
    // The measurement without it, and the proof it only removed those.
    const unexcluded = prepareEnvironmentVegetation(level);
    const under = unexcluded.clumps.filter((c) => near(c.x, c.z));
    const underOrdinary = unexcluded.clumps.slice(0, unexcluded.ordinaryClumps).filter((c) => near(c.x, c.z));
    before += under.length;
    beforeOrdinary += underOrdinary.length;
    // Removed: only roots whose own footprint (ENVIRONMENT_VEGETATION.footprintRadius,
    // 0.5 m) reaches the disc — the existing exclusion convention. Where the
    // population is capped (every town), as many next-ranked candidates take
    // their places from beyond the cap: the count and the price stay put.
    const key = (c: { x: number; z: number }): string => `${c.x},${c.z}`;
    const installed = new Set(supplements.grass.clumps.map(key)), original = new Set(unexcluded.clumps.map(key));
    const removed = unexcluded.clumps.filter((c) => !installed.has(key(c)));
    const added = supplements.grass.clumps.filter((c) => !original.has(key(c)));
    assert.ok(removed.every((c) => sites.some((s) => Math.hypot(c.x - s.x, c.z - s.z) <= clear + 0.5)),
      `${seed}: a clump away from every pad was removed`);
    const lastRank = unexcluded.clumps.at(-1)?.rank ?? -Infinity;
    assert.ok(added.every((c) => c.rank >= lastRank), `${seed}: a clump moved (it did not come from beyond the cap)`);
    assert.equal(added.length, unexcluded.populationCapped ? removed.length : 0);
    assert.equal(supplements.grass.clumps.length, unexcluded.populationCapped
      ? unexcluded.clumps.length : unexcluded.clumps.length - removed.length);
    console.log(JSON.stringify({ pad: 'grass', seed, sites: sites.length, clumpsUnderPadsBefore: under.length,
      ordinaryBefore: underOrdinary.length, removed: removed.length, refilledFromBeyondCap: added.length, after: 0 }));
  }
  console.log(JSON.stringify({ pad: 'grass-total', clumpsUnderPadsBefore: before, ordinaryBefore: beforeOrdinary }));
});

/** XZ distance from a point to a triangle. */
function triangleDistance(px: number, pz: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const sign = (p: THREE.Vector3, q: THREE.Vector3): number => (q.x - p.x) * (pz - p.z) - (q.z - p.z) * (px - p.x);
  const s0 = sign(a, b), s1 = sign(b, c), s2 = sign(c, a);
  if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return 0;
  const edge = (p: THREE.Vector3, q: THREE.Vector3): number => {
    const dx = q.x - p.x, dz = q.z - p.z, length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - p.x) * dx + (pz - p.z) * dz) / length2)) : 0;
    return Math.hypot(px - p.x - dx * t, pz - p.z - dz * t);
  };
  return Math.min(edge(a, b), edge(b, c), edge(c, a));
}

/** The nearest drawn triangle of `root` to any site, XZ metres. */
function nearestDrawn(root: THREE.Object3D, sites: readonly LaunchPadSite[], limit: number): number {
  root.updateMatrixWorld(true);
  let nearest = Infinity;
  const instance = new THREE.Matrix4(), world = new THREE.Matrix4(), box = new THREE.Box3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute('position');
    const index = geometry.index;
    const triangles = (index ? index.count : positions.count) / 3;
    geometry.computeBoundingBox();
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let i = 0; i < count; i += 1) {
      world.copy(object.matrixWorld);
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, instance); world.multiply(instance); }
      box.copy(geometry.boundingBox!).applyMatrix4(world);
      const reach = sites.some((s) => Math.hypot(Math.max(box.min.x - s.x, 0, s.x - box.max.x),
        Math.max(box.min.z - s.z, 0, s.z - box.max.z)) <= limit + 2);
      if (!reach) continue;
      for (let t = 0; t < triangles; t += 1) {
        const ia = index ? index.getX(t * 3) : t * 3, ib = index ? index.getX(t * 3 + 1) : t * 3 + 1, ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(positions, ia).applyMatrix4(world);
        b.fromBufferAttribute(positions, ib).applyMatrix4(world);
        c.fromBufferAttribute(positions, ic).applyMatrix4(world);
        for (const s of sites) {
          if (Math.min(a.x, b.x, c.x) > s.x + limit + 2 || Math.max(a.x, b.x, c.x) < s.x - limit - 2
            || Math.min(a.z, b.z, c.z) > s.z + limit + 2 || Math.max(a.z, b.z, c.z) < s.z - limit - 2) continue;
          nearest = Math.min(nearest, triangleDistance(s.x, s.z, a, b, c));
        }
      }
    }
  });
  return nearest;
}

test('no decor, district, exterior or street-life instance stands within the apron + 0.3 m of a pad', (t) => {
  const worlds = corpusWorlds();
  if (worlds.every((world) => world.supplements.launchPads.length === 0)) {
    t.skip('the finder found no sites on any corpus seed: nothing to check yet');
    return;
  }
  const limit = LAUNCH_PAD.apronRadiusMetres + 0.3;
  for (const { seed, level, supplements } of worlds) {
    const sites = supplements.launchPads;
    if (sites.length === 0) continue;
    const appearance = createDistrictExteriorAppearance();
    const owners = [
      ['street-life', createStreetLife(level, supplements.street)],
      ['environment-decor', createEnvironmentDecor(level, supplements.environment)],
      ['district-decor', createDistrictDecor(level, supplements.district)],
      ['district-exterior', createDistrictExterior(level, { ...appearance, spatialBatchMetres: DEFAULT_SPATIAL_BATCH_METRES,
        protectedOpenings: [...streetFronts(level), ...environmentSites(level), ...residentialSites(level), ...parkCaseSites(level)] },
      supplements.exterior)],
    ] as const;
    try {
      // Null: nothing drawn within the search reach (limit + 2 m) of any pad.
      const nearest: Record<string, number | null> = {};
      for (const [name, owner] of owners) {
        const distance = nearestDrawn(owner.group, sites, limit);
        nearest[name] = Number.isFinite(distance) ? +distance.toFixed(2) : null;
        assert.ok(distance > limit, `${seed}: ${name} draws ${distance.toFixed(2)} m from a pad (a finder rule for Builder A)`);
      }
      // Positive control: the instrument does see an owner's geometry where it stands.
      const front = streetFronts(level)[0];
      if (front) {
        const probe = { ...sites[0], id: 'probe', x: front.position.x, z: front.position.z };
        assert.ok(nearestDrawn(owners[0][1].group, [probe], limit) < limit, `${seed}: the decor probe saw nothing at a shopfront`);
      }
      console.log(JSON.stringify({ pad: 'decor', seed, sites: sites.length, nearestMetres: nearest, searchReachMetres: limit + 2, limit }));
    } finally {
      for (const [, owner] of owners) owner.dispose();
      appearance.dispose();
    }
  }
});

test('corpus sweep: the M42 supplements move no presentation recipe, ground-edge refusal or admitted edge price', () => {
  const rows = [];
  for (const { seed, level, supplements } of corpusWorlds()) {
    const edges = prepareSharedGroundEdges(level);
    // Before M42: no pads, no flock, and the lawn as it was.
    const before = { ...supplements, launchPads: [], birds: prepareBirdFlight({ ...level, props: [] }),
      grass: prepareEnvironmentVegetation(level) };
    // The most pads a city may have, wherever the finder put its first.
    const first = supplements.launchPads[0] ?? { id: 'pad-max', x: level.spawn.position.x, y: level.spawn.position.y,
      z: level.spawn.position.z, yaw: 0, triggerRadius: LAUNCH_PAD.triggerRadiusMetres,
      footprintRadius: LAUNCH_PAD.footprintRadiusMetres, dropMetres: 0 };
    const most = { ...supplements, launchPads: Array.from({ length: LAUNCH_PAD.maximumPads },
      (_, k) => supplements.launchPads[k] ?? { ...first, id: `pad-max-${k}` }) };
    // …and with the hovering marker switched the other way on every one of them (the owner's switch).
    const marked = { ...most, launchPadMarker: !LOOK.markerShown };
    const judged = [before, supplements, most, marked].map((prepared) => judgePreparedGroundEdges(level, edges, undefined, prepared));
    const fingerprint = (j: (typeof judged)[number]) => ({ recipe: j.selection.recipe.id, refusal: j.refusal?.reason ?? null,
      admitted: j.prepared ? JSON.stringify(j.prepared.price) : null });
    const [was, now, max, flipped] = judged.map(fingerprint);
    assert.deepEqual(now, was, `${seed}: M42 flipped the presentation`);
    assert.deepEqual(max, was, `${seed}: the most pads a city may have flip the presentation`);
    assert.deepEqual(flipped, was, `${seed}: turning the q237 marker ${LOOK.markerShown ? 'off' : 'on'} flips the presentation`);
    assert.equal(judged[3].selection.cost.frame.solo.triangles - judged[2].selection.cost.frame.solo.triangles,
      (LOOK.markerShown ? -1 : 1) * (launchPadTemplateCounts(true).triangles - launchPadTemplateCounts(false).triangles)
        * LAUNCH_PAD.maximumPads, `${seed}: the marker is priced`);
    const solo = (j: (typeof judged)[number]) => j.selection.cost.frame.solo;
    rows.push({ seed, sites: supplements.launchPads.length, recipe: now.recipe, refusal: now.refusal,
      edgesAdmitted: now.admitted !== null,
      soloDeltaDraws: solo(judged[1]).drawCalls - solo(judged[0]).drawCalls,
      soloDeltaTriangles: solo(judged[1]).triangles - solo(judged[0]).triangles,
      soloTriangles: solo(judged[1]).triangles });
  }
  for (const row of rows) console.log(JSON.stringify({ pad: 'sweep', ...row }));
});
