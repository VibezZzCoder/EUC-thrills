/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { POTHOLE, PUDDLE } from '../data/tuning.ts';
import { MATERIALS } from '../data/surfaces.ts';
import { buildLevelPlan, fieldHeightAt, type HazardSpec } from '../level/buildPlan.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createHazards } from './hazards.ts';

/**
 * The hazard mesh family — M13 Phase 2, rewritten with the family it tests.
 *
 * The milestone's open owner gate is a question only a human at a handset can
 * answer (*does a pothole read as a hole at 20 m and at 40 m?*), so what this
 * file can do is prove the geometry is the geometry the readability argument
 * assumes. **The argument itself changed** when the owner looked at the first
 * build and rejected it: relief was carrying the read, the ring it needed to be
 * tall enough for that read like a moulded collar, and the tests here duly
 * enforced a 0.12 m floor under the crest height. That floor is gone, and what
 * replaces it is an assertion about the thing that *actually* survives being
 * three pixels tall — the luminance dipole across the feature.
 *
 * Four claims carry the new argument and each has a test below:
 *
 *   1. **The dipole is real.** A pale broken rim around a very dark pit, with
 *      the road's own value between them. Value, not height, is the distance cue.
 *   2. **The outline is irregular and closed.** Nothing else in the world has a
 *      ragged edge, so shape alone is a signal — and a perfect polygon was most
 *      of what made the first build read as manufactured.
 *   3. **The interior is lit as a cavity**, by normals rather than by a baked
 *      sun. A test on positions alone would pass on a flat grey disc.
 *   4. **The drawn feature agrees with the footprint the simulation charges
 *      for** — never narrower for a hole, never wider for a spill — because a
 *      hazard whose picture and whose contact test disagree is unfair in a way
 *      no amount of contrast fixes.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

const ROAD = 'road';

/** A straight road with whatever hazards the test needs on it. */
function hazardPlan(hazards: readonly HazardSpec[], crown = 0): LevelPlan {
  return buildLevelPlan([{
    id: ROAD,
    length: 80,
    halfWidth: 6,
    surface: 'pavement',
    ...(crown === 0 ? {} : { crown }),
  }], {
    id: 'hazard-render-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    hazards,
  });
}

function pothole(
  id: string,
  s: number,
  kind: 'potholeShallow' | 'potholeDeep',
  radius = 0.8,
  t = 0,
): HazardSpec {
  return { id, segment: ROAD, s, t, kind, radius };
}

function spill(id: string, s: number, radius = 2.4, t = 0): HazardSpec {
  return { id, segment: ROAD, s, t, kind: 'spill', radius };
}

interface Vertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const GROUND_MESH = 'level-hazards-ground';
const WATER_MESH = 'level-hazards-water';

function meshNamed(view: { group: THREE.Group }, name: string): THREE.Mesh | undefined {
  return view.group.children.find((child) => child.name === name) as THREE.Mesh | undefined;
}

/** Every vertex of one built mesh, in the order the builder pushed them. */
function verticesOf(plan: LevelPlan, name = GROUND_MESH): Vertex[] {
  const view = createHazards(plan);
  try {
    const mesh = meshNamed(view, name);
    if (mesh === undefined) return [];
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const colour = mesh.geometry.getAttribute('color');
    const out: Vertex[] = [];
    for (let index = 0; index < position.count; index += 1) {
      out.push({
        x: position.getX(index),
        y: position.getY(index),
        z: position.getZ(index),
        nx: normal.getX(index),
        ny: normal.getY(index),
        nz: normal.getZ(index),
        r: colour.getX(index),
        g: colour.getY(index),
        b: colour.getZ(index),
      });
    }
    return out;
  } finally {
    view.dispose();
  }
}

const SEGMENTS = POTHOLE.radialSegments;
/** Ring 1 is the floor's edge, 2 the wall, 3 the broken lip, 4 the halo. */
function ringStart(ring: number): number {
  return 1 + (ring - 1) * SEGMENTS;
}

const luminance = (v: { r: number; g: number; b: number }): number => (
  v.r * 0.2126 + v.g * 0.7152 + v.b * 0.0722
);

/** The linear luminance of an authored sRGB hex, the way three decodes it. */
function albedoLuminance(hex: number): number {
  return luminance(new THREE.Color().setHex(hex));
}

/** How far the outline may reach past a ring's nominal radius. */
const OUTLINE_REACH = POTHOLE.outlineHarmonics.reduce((sum, a) => sum + a, 0);

// ---------------------------------------------------------------------------
// What is drawn, and what is not
// ---------------------------------------------------------------------------

test('a level with no hazards draws no hazard mesh and costs no draw call', () => {
  const view = createHazards(hazardPlan([]));
  try {
    assert.equal(view.potholes, 0);
    assert.equal(view.pools, 0);
    assert.equal(view.spills, 0);
    assert.equal(view.triangles, 0);
    assert.equal(view.drawCalls, 0);
    assert.equal(view.group.children.length, 0, 'an empty group still costs a scene object');
  } finally {
    view.dispose();
  }
});

test('a spill draws water and no asphalt, because its ground is still the grid', () => {
  // The milestone's central split, asserted from the render side and **narrowed
  // rather than abandoned**. Phase 2 first shipped this as *a spill draws
  // nothing here*, on the argument that `MATERIALS.spill` on the heightfield's
  // own material group was its whole appearance. It was, and it looked like a
  // stair-stepped black mat, because a one-metre cell grid cannot be a puddle.
  // So the grid keeps the part it can express — where the grip is — and this
  // file draws the water. What must stay true is that the grid is still painted.
  const plan = hazardPlan([spill('puddle', 30)]);
  assert.equal(plan.hazards?.length, 1, 'the spill is on the plan');
  assert.ok(
    plan.heightfield.surfaces.includes('spill'),
    'and it painted cells, which is where every grip, voice and wobble answer comes from',
  );

  const view = createHazards(plan);
  try {
    assert.equal(view.potholes, 0);
    assert.equal(view.spills, 1);
    assert.equal(view.drawCalls, 1, 'the water mesh only');
    assert.equal(meshNamed(view, GROUND_MESH), undefined, 'a spill is not broken asphalt');
    assert.ok(meshNamed(view, WATER_MESH) !== undefined);
  } finally {
    view.dispose();
  }
});

test('the whole world costs two draw calls at most, however many hazards it holds', () => {
  // The set-union property the whole draw-call budget rests on
  // (`data/renderCost.ts`): a route with forty holes costs what a route with one
  // costs, and only its triangles grow. Two rather than one because roughness
  // cannot be a vertex colour, so water needs its own material — and one water
  // material serves both the pools and the puddles.
  const one = createHazards(hazardPlan([pothole('a', 20, 'potholeShallow')]));
  const many = createHazards(hazardPlan([
    pothole('a', 12, 'potholeShallow'),
    pothole('b', 24, 'potholeDeep'),
    pothole('c', 36, 'potholeShallow', 1.6, 2),
    pothole('d', 48, 'potholeDeep', 0.5, -3),
    spill('e', 62, 2.4, -2),
  ]));
  try {
    assert.equal(one.drawCalls, 1, 'a dry hole needs no water mesh');
    assert.equal(one.pools, 0);
    assert.equal(many.drawCalls, 2);
    assert.equal(many.group.children.length, 2);
    assert.equal(many.potholes, 4);
    assert.equal(many.pools, 2);
    assert.equal(many.spills, 1);

    const holes = (v: THREE.Group): number => {
      const mesh = v.children.find((c) => c.name === GROUND_MESH) as THREE.Mesh;
      return mesh.geometry.getIndex()!.count / 3;
    };
    assert.equal(holes(many.group), holes(one.group) * 4, 'and the triangles are per hole');
  } finally {
    one.dispose();
    many.dispose();
  }
});

test('no hazard mesh ever casts, and both always receive', () => {
  // A recess that cast into the 2048 cascade would draw a dark ring beside every
  // hole; a ring that received nothing would keep full brightness through a
  // tree's shadow and read as glowing. And the lit/shaded pair the family
  // depends on *is* the lighting, so receiving is not optional here.
  const view = createHazards(hazardPlan([pothole('a', 20, 'potholeDeep'), spill('b', 50)]));
  try {
    assert.equal(view.group.children.length, 2);
    for (const child of view.group.children) {
      const mesh = child as THREE.Mesh;
      assert.equal(mesh.castShadow, false, `${mesh.name} casts`);
      assert.equal(mesh.receiveShadow, true, `${mesh.name} does not receive`);
    }
  } finally {
    view.dispose();
  }
});

// ---------------------------------------------------------------------------
// 1. The dipole is real — the cue that replaced the crest's height
// ---------------------------------------------------------------------------

test('the family straddles the road it sits in: a pale rim, a far darker pit', () => {
  // **This is the readability argument, and it is the one the first build got
  // wrong.** That build put 0.23 m of spoil ring above the road because a flat
  // feature is under a pixel tall at forty route-metres — true, and the wrong
  // conclusion, because a mark that is one pixel tall and forty wide is read by
  // its *contrast*, not by its height. A dark mark alone averages back into the
  // asphalt as the pixels shrink; a pale ring around a dark core cannot, because
  // the two halves fall on opposite sides of the road's value.
  const pavement = albedoLuminance(MATERIALS.pavement.albedo);
  const kerb = albedoLuminance(MATERIALS.concrete.albedo);

  const rim = albedoLuminance(POTHOLE.rimColour) * POTHOLE.rimShade;
  const halo = albedoLuminance(POTHOLE.haloColour);
  const floor = albedoLuminance(POTHOLE.floorColour) * POTHOLE.deepFloorShade;

  assert.ok(rim > pavement * 1.1, `the rim (${rim.toFixed(3)}) must out-value the road`);
  assert.ok(rim < kerb * 0.92, `and stay under the kerb (${kerb.toFixed(3)}) — DESIGN §3`);
  assert.ok(floor < pavement * 0.35, `the pit (${floor.toFixed(3)}) must be far under the road`);
  assert.ok(rim / floor > 4, `the dipole is ${(rim / floor).toFixed(1)}:1, which is the whole cue`);
  assert.ok(
    Math.abs(halo - pavement) < pavement * 0.05,
    'the halo is pavement, so the outer edge of the feature disappears instead of '
      + 'drawing a second circle around the first',
  );
});

test('the lip stands proud but is a chip of asphalt, not a kerb', () => {
  const plan = hazardPlan([pothole('a', 20, 'potholeShallow')]);
  const vertices = verticesOf(plan);

  let lowest = Infinity;
  let highest = -Infinity;
  for (const vertex of vertices) {
    const above = vertex.y - fieldHeightAt(plan.heightfield, plan.surround, vertex.x, vertex.z);
    lowest = Math.min(lowest, above);
    highest = Math.max(highest, above);
  }

  assert.ok(
    lowest >= 0,
    'nothing may be drawn below the road, because the road is opaque and would hide it '
      + `— the lowest vertex sits ${lowest.toFixed(4)} m above the ground`,
  );
  assert.ok(highest > POTHOLE.lift, 'the lip has to stand off the road at all');
  assert.ok(
    highest <= POTHOLE.lift + POTHOLE.shallowRimHeight + 1e-6,
    'and never further than the profile says',
  );
  // **The ceiling, where the first build had a floor.** A rider rolls through
  // this without feeling it, because a pothole is never a collider — so the
  // taller it gets, the bigger that lie is. Five to seven centimetres is a slab
  // of broken asphalt; a quarter of a metre is a kerb the wheel ignores.
  assert.ok(
    POTHOLE.deepRimHeight <= 0.09 && POTHOLE.deepRimHeight > POTHOLE.shallowRimHeight,
    'the lip has grown back toward the collar the owner rejected',
  );
});

test('a deep hole holds water and a shallow one stays a dry break', () => {
  // The two kinds have to be told apart at speed, and this is the cue that
  // survives distance: not a size difference but a difference in *kind*. The one
  // that ends a run is wet; the one that only shakes you is not.
  const shallow = createHazards(hazardPlan([pothole('a', 20, 'potholeShallow')]));
  const deep = createHazards(hazardPlan([pothole('a', 20, 'potholeDeep')]));
  try {
    assert.equal(shallow.pools, 0);
    assert.equal(shallow.drawCalls, 1);
    assert.equal(deep.pools, 1);
    assert.equal(deep.drawCalls, 2);
  } finally {
    shallow.dispose();
    deep.dispose();
  }

  // And the pit under it is darker, in linear terms, because it is deeper.
  const shallowFloor = verticesOf(hazardPlan([pothole('a', 20, 'potholeShallow')]))[0];
  const deepFloor = verticesOf(hazardPlan([pothole('a', 20, 'potholeDeep')]))[0];
  assert.ok(luminance(deepFloor) < luminance(shallowFloor));
});

test('the family is drawn face-up, so the sun lights it', () => {
  // Winding is the kind of thing that is invisible until back-face culling shows
  // a hole through the road. Checked on the fan, which is the one place the
  // centre vertex participates, and on both meshes.
  const view = createHazards(hazardPlan([pothole('a', 20, 'potholeDeep'), spill('b', 50)]));
  try {
    for (const child of view.group.children) {
      const mesh = child as THREE.Mesh;
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.getIndex()!;
      const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(0));
      const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(1));
      const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(2));
      assert.ok(b.sub(a).cross(c.sub(a)).y > 0, `${mesh.name} is wound face-down`);
    }
  } finally {
    view.dispose();
  }
});

// ---------------------------------------------------------------------------
// 2. The outline is irregular, and it closes
// ---------------------------------------------------------------------------

test('the outline is ragged rather than a polygon, and it joins up', () => {
  // **Harmonics, not per-vertex noise.** An independent random radius per step
  // gives a spiky star whose seam between the last step and the first is a
  // visible discontinuity, because nothing makes the loop close. The test for
  // "smooth and closed" is that the step from the last vertex to the first is no
  // larger than the largest step anywhere else in the ring.
  const radius = 1.35;
  const plan = hazardPlan([pothole('a', 24, 'potholeDeep', radius)]);
  const hazard = plan.hazards![0];
  const vertices = verticesOf(plan);

  const distances: number[] = [];
  for (let step = 0; step < SEGMENTS; step += 1) {
    const vertex = vertices[ringStart(3) + step];
    distances.push(Math.hypot(vertex.x - hazard.centre.x, vertex.z - hazard.centre.z));
  }

  const spread = Math.max(...distances) - Math.min(...distances);
  assert.ok(
    spread > radius * 0.08,
    `the lip varies by only ${spread.toFixed(3)} m around the ring — this is a circle again`,
  );

  const steps: number[] = [];
  for (let step = 0; step < SEGMENTS; step += 1) {
    steps.push(Math.abs(distances[(step + 1) % SEGMENTS] - distances[step]));
  }
  const seam = steps[SEGMENTS - 1];
  const largestInteriorStep = Math.max(...steps.slice(0, -1));
  assert.ok(
    seam <= largestInteriorStep + 1e-9,
    `the join is a ${seam.toFixed(3)} m jump against a largest step of `
      + `${largestInteriorStep.toFixed(3)} m elsewhere — the loop does not close`,
  );
});

test('two holes are never the same shape, and one hole is the same shape twice', () => {
  // Determinism, because the phases come from the hazard's own position rather
  // than from a seed threaded down the level: two hazards are never in the same
  // place, and a hazard is always in the same place. A shape that drifted
  // between rebuilds would put the digest tests' whole premise in doubt.
  const plan = hazardPlan([
    pothole('a', 20, 'potholeShallow', 1.0),
    pothole('b', 50, 'potholeShallow', 1.0),
  ]);
  const first = verticesOf(plan);
  const again = verticesOf(plan);
  assert.deepEqual(again, first, 'the same plan built twice gave two different shapes');

  const radii = (base: number, centre: { x: number; z: number }): number[] => {
    const out: number[] = [];
    for (let step = 0; step < SEGMENTS; step += 1) {
      const v = first[base + ringStart(3) + step];
      out.push(Number(Math.hypot(v.x - centre.x, v.z - centre.z).toFixed(4)));
    }
    return out;
  };
  const perHole = 1 + 4 * SEGMENTS;
  const a = radii(0, plan.hazards![0].centre);
  const b = radii(perHole, plan.hazards![1].centre);
  assert.notDeepEqual(a, b, 'both holes came out of the same die');
});

// ---------------------------------------------------------------------------
// 3. The interior is lit as a cavity
// ---------------------------------------------------------------------------

test('the mouth carries the normals of a bowl that is not there', () => {
  // The whole close-range depth cue, and a test on positions alone would pass on
  // a flat grey disc. A surface rising outward leans its normal *inward*, so the
  // radial component must be negative all the way round the mouth.
  const plan = hazardPlan([pothole('a', 20, 'potholeShallow')]);
  const vertices = verticesOf(plan);
  const centre = vertices[0];

  assert.deepEqual(
    [centre.nx, centre.ny, centre.nz],
    [0, 1, 0],
    'the bowl has no radial direction at its own axis',
  );

  for (let step = 0; step < SEGMENTS; step += 1) {
    const vertex = vertices[ringStart(1) + step];
    const dx = vertex.x - centre.x;
    const dz = vertex.z - centre.z;
    const radial = (vertex.nx * dx + vertex.nz * dz) / Math.hypot(dx, dz);
    assert.ok(
      radial < -0.05,
      `mouth vertex ${step} leans ${radial.toFixed(3)} radially; a positive or flat `
        + 'lean means the interior is being lit as road rather than as a cavity',
    );
    assert.ok(vertex.ny > 0, 'and it still faces upward');
  }
});

test('a deep hole leans its walls further from the sun than a shallow one', () => {
  // Which is what makes the interior *darker* rather than merely differently
  // coloured, under whatever the coupled lighting system is doing — the reason
  // the sun's direction is faked into the normals and never into the colours.
  const lean = (kind: 'potholeShallow' | 'potholeDeep'): number => (
    verticesOf(hazardPlan([pothole('a', 20, kind)]))[ringStart(1)].ny
  );
  assert.ok(lean('potholeDeep') < lean('potholeShallow'));
});

test('the pit is occluded from the sky, and the occlusion deepens with the hole', () => {
  // Baked ambient occlusion, which is a fact about the shape rather than a
  // second opinion about the light — a floor sees less sky than the road beside
  // it at every hour and from every angle. It is what makes the hole read as a
  // hole in the hemisphere fill as well as in the sun.
  const shallow = verticesOf(hazardPlan([pothole('a', 20, 'potholeShallow')]));
  const deep = verticesOf(hazardPlan([pothole('a', 20, 'potholeDeep')]));
  const open = albedoLuminance(POTHOLE.floorColour);

  assert.ok(luminance(shallow[0]) < open * 0.6, 'a shallow floor is barely shaded at all');
  assert.ok(luminance(deep[0]) < luminance(shallow[0]) * 0.8, 'and a deep one is deeper still');
  assert.ok(
    luminance(deep[ringStart(4)]) > luminance(deep[ringStart(2)]),
    'the halo out on the road is shaded like road, or the occlusion has leaked outside the pit',
  );
});

test('the halo leans outward, so one sun gives an inner shadow and an outer highlight', () => {
  const vertices = verticesOf(hazardPlan([pothole('a', 20, 'potholeDeep')]));
  const centre = vertices[0];
  for (let step = 0; step < SEGMENTS; step += 1) {
    const vertex = vertices[ringStart(4) + step];
    const dx = vertex.x - centre.x;
    const dz = vertex.z - centre.z;
    const radial = (vertex.nx * dx + vertex.nz * dz) / Math.hypot(dx, dz);
    assert.ok(
      radial > 0.05,
      `halo vertex ${step} leans ${radial.toFixed(3)} radially; the outer face has to lean `
        + 'the opposite way to the mouth or the feature has no relief signature at all',
    );
  }
});

test('water follows the finished ground at one lift while only its normals ripple', () => {
  // The ripple. It is **not** trying to catch the sun — `PUDDLE` records the
  // measurement that showed no achievable normal tilt can, with a 55° sun and a
  // chase camera looking along the ground. What it does is vary the diffuse term
  // so a puddle is not a cut-out. The vertices must stay at one authored lift
  // over the finished road while it does — not on one centre-height plane that
  // would bury one side of a crowned road and float the other.
  const plan = hazardPlan([spill('a', 30, 2.4, 2.5)], 0.12);
  const water = verticesOf(plan, WATER_MESH);
  assert.ok(water.length > 0);

  const residuals = new Set<string>();
  const groundHeights = new Set<string>();
  let tilted = 0;
  for (const vertex of water) {
    const ground = fieldHeightAt(plan.heightfield, plan.surround, vertex.x, vertex.z);
    groundHeights.add(ground.toFixed(6));
    residuals.add((vertex.y - ground).toFixed(6));
    assert.ok(vertex.ny > 0.9, 'a puddle that steep is a bubble');
    if (Math.hypot(vertex.nx, vertex.nz) > 0.02) tilted += 1;
  }
  assert.ok(
    groundHeights.size > 1,
    'the crowned road under this puddle is flat, so constant-lift ground following was not tested',
  );
  assert.equal(residuals.size, 1, `water has more than one lift above the ground: ${[...residuals]}`);
  assert.equal([...residuals][0], PUDDLE.lift.toFixed(6));
  assert.ok(tilted > water.length * 0.5, 'most of the surface is dead flat, so there is no ripple');
});

// ---------------------------------------------------------------------------
// 4. The picture agrees with the footprint
// ---------------------------------------------------------------------------

test('a hole is never drawn smaller than the circle the simulation charges for', () => {
  // `Hazard.radius` is the distance at which the contact point is in the hole
  // (`simulation/hazards.ts`). The outline jitter runs **outward only**, so a
  // rider who clips the visible edge is never charged for a hole they missed.
  // Generous in the direction a rider forgives.
  const radius = 1.35;
  const plan = hazardPlan([pothole('a', 24, 'potholeDeep', radius)]);
  const hazard = plan.hazards![0];
  const vertices = verticesOf(plan);

  for (let step = 0; step < SEGMENTS; step += 1) {
    const vertex = vertices[ringStart(3) + step];
    const distance = Math.hypot(vertex.x - hazard.centre.x, vertex.z - hazard.centre.z);
    assert.ok(
      distance >= radius - 1e-6,
      `lip vertex ${step} is at ${distance.toFixed(4)} m, inside the ${radius} m hit circle`,
    );
    assert.ok(distance <= radius * (1 + OUTLINE_REACH) + 1e-6);
  }
});

test('nothing is drawn beyond the halo, and the halo only ever forgives', () => {
  const radius = 0.9;
  const plan = hazardPlan([pothole('a', 24, 'potholeShallow', radius)]);
  const hazard = plan.hazards![0];

  let furthest = 0;
  for (const vertex of verticesOf(plan)) {
    furthest = Math.max(furthest, Math.hypot(vertex.x - hazard.centre.x, vertex.z - hazard.centre.z));
  }
  const bound = radius * POTHOLE.haloFraction * (1 + OUTLINE_REACH);
  assert.ok(furthest <= bound + 1e-6, `${furthest.toFixed(4)} m reaches past the ${bound.toFixed(4)} m halo`);
  assert.ok(POTHOLE.haloFraction > 1, 'the drawn feature is wider than the hit circle, never narrower');
});

test('a spill is never drawn wider than the ground it actually made slippery', () => {
  // **The opposite rule, for the opposite reason.** A spill's charged footprint
  // is the set of cells it painted, so water drawn inside the radius means
  // everywhere you can see water is slippery, and the damp cells outside the
  // puddle warn that the slippery part is wider than the shiny part. Water drawn
  // *outside* would be a gleaming, fully-grippy margin around every spill.
  const radius = 2.4;
  const plan = hazardPlan([spill('a', 30, radius)]);
  const hazard = plan.hazards![0];

  let furthest = 0;
  for (const vertex of verticesOf(plan, WATER_MESH)) {
    furthest = Math.max(furthest, Math.hypot(vertex.x - hazard.centre.x, vertex.z - hazard.centre.z));
  }
  assert.ok(furthest <= radius + 1e-6, `the puddle reaches ${furthest.toFixed(4)} m of a ${radius} m spill`);
  assert.ok(furthest > radius * 0.8, 'and it is not so far inside that the water is a dot in a damp square');
});

// ---------------------------------------------------------------------------
// The ground it is drawn on
// ---------------------------------------------------------------------------

test('every vertex follows the finished ground, not one plane through the centre', () => {
  // `render/markings.ts`'s rule, and a pothole needs it more than paint does: a
  // 2.7 m footprint on a crowned road spans most of a lane, so a ring drawn on
  // one plane buries the gutter side and floats the crown side. **The residual
  // is asserted rather than the height** — every vertex must sit its own ring's
  // authored offset above the ground *under it*.
  const radius = 1.35;
  const plan = hazardPlan([pothole('a', 24, 'potholeShallow', radius, 2.5)], 0.12);
  const vertices = verticesOf(plan);
  const rim = Math.min(POTHOLE.shallowRimHeight, radius * POTHOLE.maxRimFraction);

  const flat = new Set<string>();
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    const above = vertex.y - fieldHeightAt(plan.heightfield, plan.surround, vertex.x, vertex.z);
    assert.ok(above >= 0 && above <= POTHOLE.lift + rim + 1e-6);
    // The lip's height varies per step by design, so only the other three rings
    // can be counted — and they must land on exactly two authored offsets.
    const ring = index === 0 ? 0 : Math.floor((index - 1) / SEGMENTS) + 1;
    if (ring !== 3) flat.add(above.toFixed(6));
  }
  assert.deepEqual(
    [...flat].sort(),
    [POTHOLE.lift.toFixed(6), (POTHOLE.lift + rim * 0.25).toFixed(6)].sort(),
    'the flat rings are the shared lift and the wall rise; a mesh drawn on one plane '
      + 'over a crown would produce dozens',
  );

  // And the ground genuinely varies underneath, or the assertion above is
  // vacuous — the trap this project has now hit twice with fixture worlds too
  // small or too flat to exercise the rule (`docs/LESSONS_LEARNED.md`).
  const heights = new Set(vertices.map((vertex) => (
    fieldHeightAt(plan.heightfield, plan.surround, vertex.x, vertex.z).toFixed(4)
  )));
  assert.ok(heights.size > 1, 'the crowned road under this footprint is flat, so nothing was tested');
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('a disposed hazard family leaves the scene exactly as it found it', () => {
  // Invariant 10, for a mesh family that is rebuilt on every world swap. The
  // whole-scene version of this lives in `render/levelLifecycle.test.ts`; this is
  // the unit that fails first and says which file to look in.
  const scene = new THREE.Scene();
  const plan = hazardPlan([
    pothole('a', 20, 'potholeShallow'),
    pothole('b', 40, 'potholeDeep'),
    spill('c', 60),
  ]);

  for (let round = 0; round < 3; round += 1) {
    const view = createHazards(plan);
    scene.add(view.group);
    let meshes = 0;
    scene.traverse((object) => { if ((object as THREE.Mesh).isMesh === true) meshes += 1; });
    assert.equal(meshes, 2, 'the world is genuinely built in between, or the teardown proves nothing');
    view.dispose();

    let objects = 0;
    scene.traverse(() => { objects += 1; });
    assert.equal(objects, 1, `after ${round + 1} build(s) the scene still holds a hazard group`);
  }
});
