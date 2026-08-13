/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BUILDING_FACADE, BUILDING_TONES, PROP_BUDGET, PROP_KINDS, type PropKind } from '../data/props.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createProps } from './props.ts';

/**
 * The prop kit, measured rather than estimated.
 *
 * `render/` needs a browser for a *picture*, but not for a scene graph: three's
 * geometry, matrices, and colours are plain maths, so the whole of M7.5's cost
 * — draw calls, triangles, instance counts, and disposal — is answerable under
 * `node --test` with no WebGL context at all. That is the layer `AGENTS.md`
 * asks to be exhausted first, and the browser then only has to answer whether
 * it *looks* right.
 *
 * Draw calls, triangles, and GPU object counts are reportable; a frame interval
 * is not (`AGENTS.md`).
 */

const plan = createSliceLevel();
const view = createProps(plan);

/** Every kind the slice actually places, so a kind cannot rot unnoticed. */
const placedKinds = new Set<PropKind>((plan.props ?? []).map((prop) => prop.kind));

test('the slice carries dressing, and enough of it to be a place', () => {
  assert.ok(plan.props !== undefined, 'the slice emits no props at all');
  assert.ok(view.props > 500, `only ${view.props} props — the world is still empty`);
  assert.equal(view.props, (plan.props ?? []).length);
});

test('every kind the kit declares is used somewhere in the slice', () => {
  // A kind nobody places is a kind nobody notices has broken.
  for (const kind of PROP_KINDS) assert.ok(placedKinds.has(kind), `${kind} is built but never placed`);
});

test('every prop is finite, upright, and at a sane scale', () => {
  for (const prop of plan.props ?? []) {
    const { x, y, z } = prop.position;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `${prop.kind} NaN`);
    assert.ok(Number.isFinite(prop.rotationY), `${prop.kind} has a non-finite yaw`);
    assert.ok(prop.scale > 0.2 && prop.scale < 5, `${prop.kind} at scale ${prop.scale}`);
    if (prop.size !== undefined) {
      assert.ok(prop.size.x > 0 && prop.size.y > 0 && prop.size.z > 0, 'a building with no size');
      assert.ok(prop.size.y < 80, `a ${prop.size.y} m building is taller than the fog is deep`);
    }
  }
});

test('the props stay inside the budget they share with the rest of the frame', () => {
  // One InstancedMesh per (part, material), so a hundred trees are two draw
  // calls. Shadow casters are counted a second time because an instanced mesh
  // spans the world and the shadow camera never culls one.
  const calls = view.drawCalls + view.shadowDrawCalls;
  const triangles = view.triangles + view.shadowTriangles;

  assert.ok(
    calls <= PROP_BUDGET.maxDrawCalls,
    `${calls} draw calls (${view.drawCalls} colour + ${view.shadowDrawCalls} shadow)`,
  );
  assert.ok(triangles <= PROP_BUDGET.maxTriangles, `${triangles} triangles`);
  assert.ok(
    view.triangles / view.props <= PROP_BUDGET.maxTrianglesPerProp,
    `${(view.triangles / view.props).toFixed(1)} triangles per prop is not a blockout prop`,
  );

  // The instancing is the point: far fewer meshes than props, always.
  assert.ok(view.drawCalls < 20, `${view.drawCalls} colour draw calls — instancing has broken`);
  assert.ok(view.instances > view.props, 'no kind is made of more than one part');
});

/** The two parts whose colour attribute is deliberately not plain white. */
const FACADE_PARTS = ['level-props-buildingBody', 'level-props-buildingTall'];

test('every instanced part carries the colour attribute its material needs', () => {
  // **The trap this file exists to keep shut.** `instanceColor` only reaches
  // the fragment shader when `USE_COLOR` is defined, which three derives from
  // `material.vertexColors` — and that also declares a `color` attribute the
  // vertex shader multiplies by. A geometry without one gets WebGL's default
  // generic attribute, which is black, and every prop in the level renders as
  // a silhouette. The first pass shipped seven parts like that.
  //
  // Every part but the two facades is plain white, because a part that tints
  // its own geometry as well as its instance is a part that tints twice. The
  // facades are the deliberate exception: their glazing bands *are* a value in
  // this attribute, which is what makes windows cost no draw call and no
  // material (`data/props.ts`, `BUILDING_FACADE`).
  for (const child of view.group.children) {
    const mesh = child as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    assert.ok(material.vertexColors, `${mesh.name} does not enable vertexColors`);
    const colours = mesh.geometry.getAttribute('color');
    assert.ok(colours !== undefined, `${mesh.name} has no colour attribute — it will render black`);
    assert.equal(colours.count, mesh.geometry.getAttribute('position').count);

    const facade = FACADE_PARTS.includes(mesh.name);
    for (let index = 0; index < colours.count; index += 1) {
      const value = colours.getX(index);
      if (!facade) {
        assert.equal(value, 1, `${mesh.name} colour attribute is not white`);
        continue;
      }
      // Still bounded: the glazing multiplies the building's own tone, and the
      // darkest tone in the kit times the darkest multiplier has to stay above
      // the palette's crush floor.
      assert.ok(value > 0.3 && value <= 1, `${mesh.name} carries ${value} in its colour attribute`);
    }
    assert.ok(mesh.instanceColor !== null, `${mesh.name} carries no instance colours`);
    assert.equal(material.color.getHex(), 0xffffff, `${mesh.name} tints twice`);
  }
});

test('no instance colour is black, blown out, or negative', () => {
  // Linear values, straight out of the buffer three hands the shader.
  for (const child of view.group.children) {
    const mesh = child as THREE.InstancedMesh;
    const colours = mesh.instanceColor;
    assert.ok(colours !== null);
    for (let index = 0; index < colours.count; index += 1) {
      const linear = [colours.getX(index), colours.getY(index), colours.getZ(index)];
      const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      assert.ok(luminance > 0.02, `${mesh.name} instance ${index} is ${luminance.toFixed(3)} linear`);
      assert.ok(luminance < 0.8, `${mesh.name} instance ${index} is ${luminance.toFixed(3)} linear`);
    }
  }
});

test('every instance matrix is finite, and none is degenerate', () => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (const child of view.group.children) {
    const mesh = child as THREE.InstancedMesh;
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      for (const element of matrix.elements) {
        assert.ok(Number.isFinite(element), `${mesh.name} instance ${index} has a non-finite matrix`);
      }
      matrix.decompose(position, quaternion, scale);
      assert.ok(scale.x > 0 && scale.y > 0 && scale.z > 0, `${mesh.name} instance ${index} scale`);
    }
  }
});

test('every facade triangle winds toward the normal the shader receives', () => {
  // The parapet usually hides the body roof, so back-face culling can erase it
  // without changing the ordinary chase view. Geometry winding is the only
  // direct proof that every authored face actually exists from its outside.
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const geometric = new THREE.Vector3();
  const authored = new THREE.Vector3();
  for (const child of view.group.children.filter((entry) => FACADE_PARTS.includes(entry.name))) {
    const geometry = (child as THREE.InstancedMesh).geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let index = 0; index < position.count; index += 3) {
      a.fromBufferAttribute(position, index);
      b.fromBufferAttribute(position, index + 1);
      c.fromBufferAttribute(position, index + 2);
      geometric.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      authored.fromBufferAttribute(normal, index);
      assert.ok(
        geometric.dot(authored) > 0,
        `${child.name} triangle ${index / 3} faces away from its authored normal`,
      );
    }
  }
});

test('building all this twice produces exactly the same world', () => {
  // The mottle's rule, applied to the dressing (`DESIGN.md` §4 rule 3): every
  // position, tint, and rotation comes from an integer hash, so two boots agree
  // and a visual regression capture means something. One `Math.random` in here
  // would make every screenshot disagree with the last one.
  const again = createProps(createSliceLevel());
  assert.equal(again.props, view.props);
  assert.equal(again.instances, view.instances);
  assert.equal(again.triangles, view.triangles);
  assert.equal(again.group.children.length, view.group.children.length);

  const a = new THREE.Matrix4();
  const b = new THREE.Matrix4();
  for (let child = 0; child < view.group.children.length; child += 1) {
    const left = view.group.children[child] as THREE.InstancedMesh;
    const right = again.group.children[child] as THREE.InstancedMesh;
    assert.equal(right.name, left.name);
    assert.equal(right.count, left.count);
    for (let index = 0; index < left.count; index += 1) {
      left.getMatrixAt(index, a);
      right.getMatrixAt(index, b);
      assert.deepEqual([...b.elements], [...a.elements], `${left.name} instance ${index} moved`);
    }
    assert.deepEqual(
      [...(right.instanceColor?.array ?? [])],
      [...(left.instanceColor?.array ?? [])],
      `${left.name} changed colour between builds`,
    );
  }
  again.dispose();
});

test('a plan with no props builds nothing at all', () => {
  // The proving ground is a measuring instrument rather than a place
  // (`level/levels.ts`), so it carries no dressing — and a kit that quietly
  // added a default tree to it would change the instrument.
  const proving = createProvingGround();
  assert.equal(proving.props, undefined, 'the proving ground has been dressed');

  const empty = createProps(proving);
  assert.equal(empty.props, 0);
  assert.equal(empty.instances, 0);
  assert.equal(empty.drawCalls, 0);
  assert.equal(empty.triangles, 0);
  assert.equal(empty.group.children.length, 0);
  empty.dispose();
});

test('dispose frees every geometry and material it made', () => {
  // Invariant 10: resources must plateau across repeated restarts, and a level
  // rebuild disposes the old world. Counted by listening for three's own
  // dispose event rather than by trusting the array.
  const built = createProps(plan);
  let geometries = 0;
  let materials = 0;
  let meshesDisposed = 0;
  for (const child of built.group.children) {
    const mesh = child as THREE.InstancedMesh;
    mesh.addEventListener('dispose', () => { meshesDisposed += 1; });
    mesh.geometry.addEventListener('dispose', () => { geometries += 1; });
    (mesh.material as THREE.Material).addEventListener('dispose', () => { materials += 1; });
  }
  const meshes = built.group.children.length;
  assert.ok(meshes > 0);

  built.dispose();
  assert.equal(geometries, meshes, 'a geometry survived the rebuild');
  assert.equal(materials, meshes, 'a material survived the rebuild');
  assert.equal(meshesDisposed, meshes, 'an instance buffer survived the rebuild');
  assert.equal(built.group.children.length, 0, 'the group still holds its meshes');

  // And it is safe twice: a level rebuild that raced a teardown must not throw.
  built.dispose();
});

test('one plan, two builds, no shared state between them', () => {
  // Two views of the same plan must be independent — disposing one cannot take
  // the other's geometry with it, which is what a module-level geometry cache
  // would do the first time the game rebuilt a level.
  const first = createProps(plan);
  const second = createProps(plan);
  const shared = (first.group.children[0] as THREE.InstancedMesh).geometry
    === (second.group.children[0] as THREE.InstancedMesh).geometry;
  assert.ok(!shared, 'two views share a geometry, so disposing one breaks the other');
  first.dispose();
  assert.ok(
    (second.group.children[0] as THREE.InstancedMesh).geometry.getAttribute('position') !== undefined,
    'disposing one view emptied the other',
  );
  second.dispose();
});

test('a prop kind the kit does not know still builds something', () => {
  // A plan is data and may outlive the kit that reads it — a saved level, or
  // M12's generator asking for a kind added later. The honest failure is a
  // block standing in the right place, not a crash inside the renderer.
  const fixture: LevelPlan = {
    ...buildLevelPlan(
      [{ id: 'pad', length: 20, halfWidth: 6, surface: 'pavement' }],
      { id: 'fixture', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'grass' } },
    ),
    props: [{ kind: 'building' as PropKind, position: { x: 40, y: 0, z: 0 }, rotationY: 0, scale: 1 } as Prop],
  };
  const built = createProps(fixture);
  assert.ok(built.instances >= 1, 'a sized-by-default building produced nothing');
  built.dispose();
});

// ---------------------------------------------------------------------------
// The facade — from the owner's ride, 2026-08-03
// ---------------------------------------------------------------------------

test('a building wears storeys, and they cost no draw call of their own', () => {
  const facades = view.group.children.filter((child) => FACADE_PARTS.includes(child.name));
  assert.equal(facades.length, 2, 'both facades have to be built — low-rise and tall');

  for (const child of facades) {
    const mesh = child as THREE.InstancedMesh;
    const colours = mesh.geometry.getAttribute('color');
    let glazed = 0;
    let solid = 0;
    for (let index = 0; index < colours.count; index += 1) {
      if (colours.getX(index) < 1) glazed += 1; else solid += 1;
    }
    assert.ok(glazed > 0, `${mesh.name} has no glazing at all — it is a plain box`);
    assert.ok(solid > 0, `${mesh.name} is all glass`);
    // Roughly half and half. All glass reads as a greenhouse; a sliver reads as
    // nothing at all from the distance a block is seen at.
    const share = glazed / (glazed + solid);
    assert.ok(share > 0.2 && share < 0.7, `${mesh.name} is ${(share * 100).toFixed(0)}% glass`);
  }
});

test('the glazing is blue-shifted and never crushes the darkest building tone', () => {
  const tint = BUILDING_FACADE.glassTint;
  assert.ok(tint.b > tint.g && tint.g > tint.r, 'glass reflects the sky, so it is cooler than the wall');
  assert.ok(tint.r > 0 && tint.b < 1, 'the glazing is a multiplier, not an albedo');

  // The multiplier lands on the building's own linear tone, so the check is
  // against the darkest tone in the kit — `DESIGN.md` §2's crush floor.
  const darkest = Math.min(...BUILDING_TONES.map((hex) => {
    const linear = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
      .map((channel) => (channel / 255) ** 2.2);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }));
  const glazed = darkest * (0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b);
  assert.ok(glazed > 0.03, `glazing lands at ${glazed.toFixed(3)} linear — it will crush under ACES`);
});

test('a tall block gets more storeys than a low one, and both are plausible', () => {
  // The whole reason there are two geometries: the box is scaled per instance,
  // so one band count would give a sixty-metre tower ten-metre floors.
  assert.ok(BUILDING_FACADE.highFloors > BUILDING_FACADE.lowFloors);

  const low = view.group.children.find((child) => child.name === 'level-props-buildingBody');
  const tall = view.group.children.find((child) => child.name === 'level-props-buildingTall');
  assert.ok(low !== undefined && tall !== undefined);
  const vertices = (child: THREE.Object3D): number => (
    (child as THREE.InstancedMesh).geometry.getAttribute('position').count
  );
  assert.ok(vertices(tall) > vertices(low), 'the tall facade has to carry more bands');

  // Measure the matrices actually emitted, including optional setback towers.
  // The earlier test looked only at authored body heights while the renderer
  // silently put four bands on three-metre rooftop boxes.
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const child of [low, tall]) {
    const mesh = child as THREE.InstancedMesh;
    const floors = child === tall ? BUILDING_FACADE.highFloors : BUILDING_FACADE.lowFloors;
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      const height = scale.y / floors;
      assert.ok(
        height >= BUILDING_FACADE.minFloorHeight
          && height <= BUILDING_FACADE.maxFloorHeight,
        `${mesh.name} instance ${index} gets ${height.toFixed(2)} m storeys`,
      );
    }
  }
});
