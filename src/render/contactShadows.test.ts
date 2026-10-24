/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { fieldHeightAt, planColliders, planSolids } from '../level/buildPlan.ts';
import {
  CONTACT_SHADOW,
  contactBlobTriangles,
  contactShadowBlobs,
  contactShadowSkirts,
  contactSkirtTriangles,
  contactSkirtVertices,
  createContactGround,
  skirtSideEdges,
  type ContactSkirt,
} from '../level/contactShadowPlan.ts';
import { createLevel, type LevelId } from '../level/levels.ts';
import type { LevelPlan } from '../level/plan.ts';
import { planDigest } from '../level/planDigest.ts';
import { contactShadowRenderCost, planRenderCost } from '../level/renderBudget.ts';
import { createContactShadows, riderBlobFade, type MovingBlob } from './contactShadows.ts';
import { measureObject } from './renderCost.ts';
import { createRidingRig } from './ridingRig.ts';

/**
 * The Low tier's contact shadows (2026-10-22): drawn exactly as priced, never
 * dearer than the shadow pass they stand in for, lying on the ground, and
 * touching nothing the simulation reads.
 */

const VENUES: readonly LevelId[] = ['generated', 'slice', 'proving', 'track', 'switchback', 'euclaude'];
const plans = new Map<LevelId, LevelPlan>();
const planFor = (id: LevelId): LevelPlan => {
  let plan = plans.get(id);
  if (plan === undefined) {
    plan = createLevel(id);
    plans.set(id, plan);
  }
  return plan;
};

const moving = (x: number, z: number): MovingBlob => ({
  x, y: 0, z, headingY: 0.4, halfX: 0.4, halfZ: 0.7, strength: 0.5,
  innerX: 0, innerZ: 0, normalX: 0, normalY: 1, normalZ: 0,
});

test('every venue draws its contact shadows exactly as `contactShadowRenderCost` prices them', () => {
  for (const id of VENUES) {
    const plan = planFor(id);
    const dynamic = 37;
    const layer = createContactShadows(plan, dynamic + 3);
    layer.setVisible(true);
    layer.beginDynamic();
    for (let index = 0; index < dynamic; index += 1) layer.pushDynamic(moving(index, -index));
    layer.endDynamic();
    const measured = measureObject(layer.group);
    const priced = contactShadowRenderCost(plan, dynamic);
    assert.equal(measured.drawCalls, priced.drawCalls, `${id}: draw calls`);
    assert.equal(measured.triangles, priced.triangles, `${id}: triangles`);
    assert.equal(measured.shadowDrawCalls, 0, `${id}: a blob casts nothing`);
    assert.ok(priced.drawCalls <= 2, `${id}: two calls at most`);
    assert.equal(layer.report().staticTriangles, priced.staticTriangles);

    // Hidden — every tier with a shadow map — it costs nothing at all.
    layer.setVisible(false);
    assert.equal(measureObject(layer.group).drawCalls, 0, `${id}: hidden costs nothing`);
    layer.dispose();
  }
});

test('a frame with blobs is cheaper than the shadow passes it replaces, on every venue', () => {
  // The contracts are priced with every shadow pass in — the level's
  // (`planRenderCost`) and each rider's (the reserves) — and the blobs are
  // drawn only on a frame that has dropped them all. So the world's static
  // blobs must cost less than the level's own shadow pass, and the moving
  // ones (a full population plus every rider slot) less than one seated
  // rider's shadow pass alone.
  const rider = measureObject(createRidingRig().group);
  assert.ok(rider.shadowDrawCalls > 1);
  for (const id of VENUES) {
    const plan = planFor(id);
    const level = planRenderCost(plan);
    const blobs = contactShadowRenderCost(plan, 260);
    if (blobs.staticBlobs > 0) {
      assert.ok(1 <= level.shadowDrawCalls, `${id}: a static blob call with no shadow pass to replace`);
      assert.ok(blobs.staticTriangles <= level.shadowTriangles,
        `${id}: ${blobs.staticTriangles} static blob triangles against a level shadow pass of ${level.shadowTriangles}`);
    }
    assert.ok(1 <= rider.shadowDrawCalls && blobs.dynamicTriangles <= rider.shadowTriangles,
      `${id}: ${blobs.dynamicTriangles} moving blob triangles against one rider's ${rider.shadowTriangles}`);
    console.log(`[contactShadows] ${id}: ${blobs.staticBlobs} static blobs, ${blobs.staticTriangles} triangles `
      + `(level shadow pass ${level.shadowDrawCalls} calls / ${level.shadowTriangles} triangles); `
      + `260 moving blobs ${blobs.dynamicTriangles} triangles (one rider's shadow ${rider.shadowDrawCalls} / ${rider.shadowTriangles})`);
  }
});

test('static blobs lie on the ground they are drawn over', () => {
  for (const id of ['generated', 'switchback', 'euclaude'] as const) {
    const plan = planFor(id);
    const blobs = contactShadowBlobs(plan);
    assert.ok(blobs.length > 0, `${id} has blobs`);
    const layer = createContactShadows(plan, 1);
    const position = layer.staticMesh!.geometry.getAttribute('position');
    let vertex = 0;
    for (const blob of blobs) {
      for (let k = 0; k < blob.grid * blob.grid; k += 1, vertex += 1) {
        const x = position.getX(vertex);
        const z = position.getZ(vertex);
        const ground = blob.flatY ?? fieldHeightAt(plan.heightfield, plan.surround, x, z);
        assert.ok(Math.abs(position.getY(vertex) - (ground + CONTACT_SHADOW.lift)) < 1e-4,
          `${id}: vertex ${vertex} floats or sinks`);
      }
    }
    // The skirts follow, in plan order, each on the field or on its support's top.
    for (const skirt of contactShadowSkirts(plan)) {
      for (let k = 0; k < contactSkirtVertices(skirt); k += 1, vertex += 1) {
        const x = position.getX(vertex);
        const z = position.getZ(vertex);
        const ground = skirt.flatY ?? fieldHeightAt(plan.heightfield, plan.surround, x, z);
        assert.ok(Math.abs(position.getY(vertex) - (ground + CONTACT_SHADOW.lift)) < 1e-4,
          `${id}: skirt vertex ${vertex} floats or sinks`);
      }
    }
    assert.equal(vertex, position.count);
    layer.dispose();
  }
});

test('a blob is sized and placed from its prop: buildings and gantries lay no blob, big blobs follow the slope', () => {
  const plan = planFor('generated');
  const blobs = contactShadowBlobs(plan);
  const kinds = new Set((plan.props ?? []).map((prop) => prop.kind));
  assert.ok(kinds.has('building'));
  const table = CONTACT_SHADOW.props as Record<string, readonly unknown[] | undefined>;
  let expected = 0;
  for (const prop of plan.props ?? []) expected += table[prop.kind]?.length ?? 0;
  assert.equal(blobs.length, expected + (plan.quayScenery?.stalls.length ?? 0));
  for (const blob of blobs) {
    const half = Math.max(blob.halfX, blob.halfZ);
    assert.equal(blob.grid, half > CONTACT_SHADOW.grid4Above ? 4 : half > CONTACT_SHADOW.grid3Above ? 3 : 2);
    assert.equal(contactBlobTriangles(blob), 2 * (blob.grid - 1) ** 2);
    assert.ok(blob.strength > 0 && blob.strength <= 1);
  }
  // The Quay's market stalls lay one each.
  const quay = planFor('euclaude');
  assert.ok((quay.quayScenery?.stalls.length ?? 0) > 0);
  assert.equal(contactShadowBlobs(quay).filter((blob) => blob.innerX === CONTACT_SHADOW.stall.inner).length,
    quay.quayScenery!.stalls.length);
});

test('building the layer reads the plan and changes nothing in it', () => {
  for (const id of ['generated', 'euclaude'] as const) {
    const plan = planFor(id);
    const before = planDigest(plan);
    const layer = createContactShadows(plan, 4);
    createContactGround(plan).below(0, 0, 10);
    layer.dispose();
    assert.equal(planDigest(plan), before, `${id}: the plan moved`);
  }
});

test('the moving blobs are one instanced mesh whose instances lie on the ground plane they are given', () => {
  const plan = planFor('proving');
  const layer = createContactShadows(plan, 3);
  layer.setVisible(true);
  layer.beginDynamic();
  const tilted: MovingBlob = { ...moving(2, 3), y: 1.5, normalX: 0.3, normalY: 1, normalZ: -0.2 };
  layer.pushDynamic(tilted);
  layer.pushDynamic({ ...moving(0, 0), strength: 0 });
  layer.pushDynamic(moving(5, 5));
  layer.pushDynamic(moving(6, 6));
  layer.pushDynamic(moving(7, 7));
  layer.endDynamic();
  const mesh = layer.dynamicMesh;
  assert.equal(mesh.count, 3, 'a faint blob is skipped and the capacity is a ceiling');
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1);
  const normal = new THREE.Vector3(0.3, 1, -0.2).normalize();
  assert.ok(up.distanceTo(normal) < 1e-6, 'the blob lies on the ground plane');
  const xAxis = new THREE.Vector3().setFromMatrixColumn(matrix, 0);
  const zAxis = new THREE.Vector3().setFromMatrixColumn(matrix, 2);
  assert.ok(Math.abs(xAxis.length() - tilted.halfX) < 1e-6 && Math.abs(zAxis.length() - tilted.halfZ) < 1e-6);
  assert.ok(Math.abs(xAxis.dot(normal)) < 1e-6 && Math.abs(zAxis.dot(normal)) < 1e-6, 'both axes in the plane');
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(position.distanceTo(new THREE.Vector3(2, 1.5 + CONTACT_SHADOW.lift, 3)) < 1e-6);
  // Flat ground keeps the heading: +Z of the blob is (sin, 0, cos).
  mesh.getMatrixAt(1, matrix);
  const flatZ = new THREE.Vector3().setFromMatrixColumn(matrix, 2).normalize();
  assert.ok(flatZ.distanceTo(new THREE.Vector3(Math.sin(0.4), 0, Math.cos(0.4))) < 1e-6);
  layer.setDynamicCapacity(10);
  assert.equal(layer.report().dynamicCapacity, 10);
  assert.equal(layer.dynamicMesh.count, 0);
  layer.dispose();
});

test('a rider\'s blob fades and widens with height, and is gone by the fade height', () => {
  assert.deepEqual(riderBlobFade(0), { strength: 1, grow: 1 });
  let last = 1;
  for (let h = 0.25; h <= CONTACT_SHADOW.fadeHeight; h += 0.25) {
    const { strength, grow } = riderBlobFade(h);
    assert.ok(strength < last && grow > 1, `at ${h} m`);
    last = strength;
  }
  assert.equal(riderBlobFade(CONTACT_SHADOW.fadeHeight).strength, 0);
  assert.equal(riderBlobFade(-1).strength, 1, 'below the ground is on it');
  assert.equal(riderBlobFade(Number.NaN).strength, 1);
});

test('the ground under a moving blob is a solid\'s top when the rider is on it, the field otherwise', () => {
  const plan = planFor('generated');
  const ground = createContactGround(plan);
  const solid = (plan.solids ?? []).concat(plan.segments.flatMap((segment) => segment.colliders))
    .find((box) => box.halfExtents.x > 0.6 && box.halfExtents.z > 0.6 && box.halfExtents.y < 2);
  assert.ok(solid !== undefined);
  const top = solid.centre.y + solid.halfExtents.y;
  const field = fieldHeightAt(plan.heightfield, plan.surround, solid.centre.x, solid.centre.z);
  assert.equal(ground.below(solid.centre.x, solid.centre.z, top + 0.01), Math.max(top, field));
  // Well under the top, the rider is beside (or under) it, on the field.
  if (top - field > 0.5) {
    assert.equal(ground.below(solid.centre.x, solid.centre.z, field), field);
  }
});

/** A skirt side's piece in world space: its inner edge's two ends and its outer edge's. */
const sideWorld = (skirt: ContactSkirt, side: number): { inner: [number, number][]; outer: [number, number][] } => {
  const { inner, outer } = skirtSideEdges(skirt, side);
  const cos = Math.cos(skirt.rotationY);
  const sin = Math.sin(skirt.rotationY);
  const world = ([lx, lz]: readonly [number, number]): [number, number] => [skirt.x + lx * cos + lz * sin, skirt.z - lx * sin + lz * cos];
  return { inner: inner.map(world), outer: outer.map(world) };
};

test('blocks and buildings lay skirts: drawn blocks with a foot, every building, none twice', () => {
  const plan = planFor('generated');
  const skirts = contactShadowSkirts(plan);
  const buildings = (plan.props ?? []).filter((prop) => prop.kind === 'building');
  // Every building lays one, and so does every drawn block standing at least
  // `minHeight` clear of the field — unless it stands inside another solid
  // (a post set in a low deck), whose top would hide the shade.
  assert.equal(skirts.filter((skirt) => skirt.reach === CONTACT_SHADOW.building.reach).length, buildings.length);
  const solids = planSolids(plan);
  const within = (solid: (typeof solids)[number], x: number, z: number): boolean => {
    const dx = x - solid.centre.x;
    const dz = z - solid.centre.z;
    const lx = dx * Math.cos(solid.rotationY) - dz * Math.sin(solid.rotationY);
    const lz = dx * Math.sin(solid.rotationY) + dz * Math.cos(solid.rotationY);
    return Math.abs(lx) <= solid.halfExtents.x && Math.abs(lz) <= solid.halfExtents.z;
  };
  let standing = 0;
  for (const box of planColliders(plan)) {
    if (box.drawn === false) continue;
    const field = fieldHeightAt(plan.heightfield, plan.surround, box.centre.x, box.centre.z);
    if (box.centre.y + box.halfExtents.y - field < CONTACT_SHADOW.block.minHeight) {
      assert.ok(!skirts.some((skirt) => skirt.x === box.centre.x && skirt.z === box.centre.z), 'a kerb-height block laid a skirt');
      continue;
    }
    if (solids.some((other) => other !== box && within(other, box.centre.x, box.centre.z))) continue;
    standing += 1;
    assert.ok(skirts.some((skirt) => skirt.x === box.centre.x && skirt.z === box.centre.z), 'a standing block laid no skirt');
  }
  assert.ok(standing > 40, `${standing} standing blocks`);
  for (const skirt of skirts) {
    assert.ok(skirt.sides.some(Boolean));
    assert.ok(skirt.strength > 0 && skirt.strength <= 1);
    assert.equal(contactSkirtTriangles(skirt), skirt.sides.reduce((sum, drawn, side) => sum + (drawn ? 2 * skirt.spans[side] : 0), 0));
    // An isolated block on flat ground is a ring of eight triangles.
    if (skirt.sides.every(Boolean) && skirt.spans.every((n) => n === 1)) assert.equal(contactSkirtTriangles(skirt), 8);
  }
  // The see-through railings' boxes and the Quay's stalls (which lay a stall blob) lay none.
  const quay = planFor('euclaude');
  const quaySkirts = contactShadowSkirts(quay);
  // Keyed by footprint as well as centre: the rear stair masonry's undrawn coping solid shares
  // the drawn masonry's centre (2026-10-23), and only the masonry lays a skirt.
  const centres = new Set(quaySkirts.map((skirt) => `${skirt.x},${skirt.z},${skirt.footX},${skirt.footZ}`));
  for (const box of planColliders(quay)) {
    if (box.drawn === false) assert.ok(!centres.has(`${box.centre.x},${box.centre.z},${box.halfExtents.x},${box.halfExtents.z}`), 'an undrawn railing box laid a skirt');
  }
  for (const rect of quay.quayScenery!.stalls) {
    assert.ok(!quaySkirts.some((skirt) => skirt.x >= rect.x0 && skirt.x <= rect.x1 && skirt.z >= rect.z0 && skirt.z <= rect.z1), 'a stall is shaded twice');
  }
});

test('a skirt lies on what its block stands on, and never hangs off it', () => {
  // The Quay's rooftop units stand 11 m up on the roof deck: flat skirts at
  // their base, every drawn side over the roof.
  const quay = planFor('euclaude');
  const solids = planSolids(quay);
  const flat = contactShadowSkirts(quay).filter((skirt) => skirt.flatY !== null);
  assert.ok(flat.length >= 8, `${flat.length} raised skirts`);
  const topAt = (x: number, z: number, y: number): boolean => solids.some((solid) => {
    const dx = x - solid.centre.x;
    const dz = z - solid.centre.z;
    const lx = dx * Math.cos(solid.rotationY) - dz * Math.sin(solid.rotationY);
    const lz = dx * Math.sin(solid.rotationY) + dz * Math.cos(solid.rotationY);
    return Math.abs(lx) <= solid.halfExtents.x && Math.abs(lz) <= solid.halfExtents.z
      && Math.abs(solid.centre.y + solid.halfExtents.y - y) <= CONTACT_SHADOW.onFieldTolerance;
  });
  for (const skirt of flat) {
    assert.ok(topAt(skirt.x, skirt.z, skirt.flatY!), 'a raised skirt with nothing under its block');
    for (let side = 0; side < 4; side += 1) {
      if (!skirt.sides[side]) continue;
      const { outer } = sideWorld(skirt, side);
      const mid: [number, number] = [(outer[0][0] + outer[1][0]) / 2, (outer[0][1] + outer[1][1]) / 2];
      assert.ok(topAt(mid[0], mid[1], skirt.flatY!), 'a raised skirt hangs off its support');
    }
  }
  // Field skirts follow the field: no drawn side drapes over a drop.
  for (const id of ['generated', 'track', 'switchback'] as const) {
    const plan = planFor(id);
    for (const skirt of contactShadowSkirts(plan)) {
      assert.equal(skirt.flatY, null, `${id}: every block stands on the field`);
      for (let side = 0; side < 4; side += 1) {
        if (!skirt.sides[side]) continue;
        const { inner, outer } = sideWorld(skirt, side);
        for (let k = 0; k < 2; k += 1) {
          const rise = fieldHeightAt(plan.heightfield, plan.surround, outer[k][0], outer[k][1]) - fieldHeightAt(plan.heightfield, plan.surround, inner[k][0], inner[k][1]);
          assert.ok(Math.abs(rise) <= CONTACT_SHADOW.skirtDrop + 0.25, `${id}: a skirt drapes ${rise.toFixed(2)} m`);
        }
      }
    }
  }
});

test('a chain of blocks shades as one wall: the faces they share lay nothing', () => {
  // BelVar's barriers are hundreds of blocks laid end to end. Each lays its
  // two long sides and drops the ends its neighbours touch, so the joints
  // carry no darker bead.
  const plan = planFor('track');
  const skirts = contactShadowSkirts(plan);
  const barriers = skirts.filter((skirt) => skirt.footX < 0.4 && skirt.footZ > 0.7);
  assert.ok(barriers.length > 700, `${barriers.length} barrier skirts`);
  const chained = barriers.filter((skirt) => skirt.sides[0] && skirt.sides[1] && !skirt.sides[2] && !skirt.sides[3]);
  assert.ok(chained.length / barriers.length > 0.85, `${chained.length} of ${barriers.length} barrier blocks drop both shared ends`);
  // A long side with a dropped end stops square at the face: it does not run on into the neighbour's strip.
  for (const skirt of chained) {
    const { inner, outer } = skirtSideEdges(skirt, 0);
    assert.deepEqual([outer[0][1], outer[1][1]], [inner[0][1], inner[1][1]]);
  }
  // On a flat plaza a side is one quad; a slope splits it.
  const generated = contactShadowSkirts(planFor('generated'));
  assert.ok(generated.some((skirt) => skirt.spans.some((n) => n > 1)), 'nothing in the default world follows a slope');
  assert.ok(generated.filter((skirt) => skirt.spans.every((n) => n === 1)).length > generated.length / 3);
});
