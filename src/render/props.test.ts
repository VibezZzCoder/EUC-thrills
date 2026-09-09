/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  BUILDING_FACADE,
  BUILDING_TONES,
  GANTRY_WORDMARK,
  PROP_BUDGET,
  PROP_KINDS,
  PROP_SIZES,
  type PropKind,
} from '../data/props.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { wordStrokes } from './inkKit.ts';
import { createProps } from './props.ts';
import { FACADE_PAGES, type FacadePageId } from './facadeAtlas.ts';
import { FOLIAGE_TONES } from './foliageKit.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, selectPresentation } from './presentation.ts';

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
/**
 * The same slice under the enhanced recipe. The density claims below are
 * asserted on both, because the enhanced recipe is what the slice actually
 * ships with (`render/presentation.ts` selects it) and a guard that only ever
 * measured the fallback would be a guard on nothing.
 */
const enhancedView = createProps(plan, ENHANCED_PRESENTATION);

/**
 * Every kind the game's hand-authored worlds place, so a kind cannot rot
 * unnoticed.
 *
 * **It was the slice alone until M23 Phase B1**, which is when the kit first
 * gained a kind the slice has no business carrying: a tyre stack and a start
 * gantry belong to a race venue and would be litter in a city park. The rule
 * the test is really making — *a kind nobody places is a kind nobody notices
 * has broken* — is about the built worlds rather than about one of them, so
 * the set is the union and the per-prop density claims below stay on the slice
 * where they were calibrated.
 */
const placedKinds = new Set<PropKind>(
  [...(plan.props ?? []), ...(createTrackLevel().props ?? [])].map((prop) => prop.kind),
);

test('the slice carries dressing, and enough of it to be a place', () => {
  assert.ok(plan.props !== undefined, 'the slice emits no props at all');
  assert.ok(view.props > 500, `only ${view.props} props — the world is still empty`);
  assert.equal(view.props, (plan.props ?? []).length);
});

test('every kind the kit declares is used somewhere in a hand-authored world', () => {
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

/** The two facade parts the slice places; they wear the atlas, not a tone. */
const FACADE_PARTS = ['level-props-buildingBody', 'level-props-buildingTall'];
/** The parts whose colour attribute carries the foliage tone vocabulary. */
const FOLIAGE_PARTS = ['level-props-crown', 'level-props-coniferFoliage', 'level-props-shrub'];

test('every instanced part carries the colour attribute its material needs', () => {
  // **The trap this file exists to keep shut.** `instanceColor` only reaches
  // the fragment shader when `USE_COLOR` is defined, which three derives from
  // `material.vertexColors` — and that also declares a `color` attribute the
  // vertex shader multiplies by. A geometry without one gets WebGL's default
  // generic attribute, which is black, and every prop in the level renders as
  // a silhouette. The first pass shipped seven parts like that.
  //
  // Every part but the foliage is plain white, because a part that tints
  // its own geometry as well as its instance is a part that tints twice. The
  // foliage is the deliberate exception since the environment pass: its
  // tone vocabulary (`render/foliageKit.ts`) rides this attribute, bounded and
  // normalised to a mean of one so the instance tint still states the albedo.
  // The facades went the other way: their glazing is texels on the atlas now
  // and their attribute is white throughout, in both recipes.
  for (const candidate of [view, enhancedView]) {
    for (const child of candidate.group.children) {
      const mesh = child as THREE.InstancedMesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      assert.ok(material.vertexColors, `${mesh.name} does not enable vertexColors`);
      const colours = mesh.geometry.getAttribute('color');
      assert.ok(colours !== undefined, `${mesh.name} has no colour attribute — it will render black`);
      assert.equal(colours.count, mesh.geometry.getAttribute('position').count);

      const foliage = FOLIAGE_PARTS.includes(mesh.name);
      let sum = 0;
      for (let index = 0; index < colours.count; index += 1) {
        const value = colours.getX(index);
        assert.equal(colours.getY(index), value, `${mesh.name} tone is not grey`);
        assert.equal(colours.getZ(index), value, `${mesh.name} tone is not grey`);
        sum += value;
        if (!foliage) {
          assert.equal(value, 1, `${mesh.name} colour attribute is not white`);
          continue;
        }
        assert.ok(
          value >= FOLIAGE_TONES.min / 1.05 && value <= FOLIAGE_TONES.max * 1.05,
          `${mesh.name} carries ${value} in its colour attribute`,
        );
      }
      assert.ok(
        Math.abs(sum / colours.count - 1) < 1e-4,
        `${mesh.name} tones average ${sum / colours.count}, so the instance tint no longer states the albedo`,
      );
      assert.ok(mesh.instanceColor !== null, `${mesh.name} carries no instance colours`);
      assert.equal(material.color.getHex(), 0xffffff, `${mesh.name} tints twice`);
      assert.equal(
        material.map !== null,
        FACADE_PARTS.includes(mesh.name) || mesh.name === 'level-props-buildingLow',
        `${mesh.name} samples the facade atlas when it should not, or fails to`,
      );
    }
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

/** Which atlas page a facade corner samples, or null if it is off every page. */
function pageOf(u: number, v: number): FacadePageId | null {
  for (const [id, rect] of Object.entries(FACADE_PAGES) as [FacadePageId, typeof FACADE_PAGES.plain][]) {
    if (u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6 && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6) return id;
  }
  return null;
}

test('a building wears storeys, and they cost no draw call of their own', () => {
  const facades = view.group.children.filter((child) => FACADE_PARTS.includes(child.name));
  assert.equal(facades.length, 2, 'both facades have to be built — low-rise and tall');

  for (const child of facades) {
    const mesh = child as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    assert.ok(material.map !== null, `${mesh.name} does not sample the facade atlas`);
    const uvs = mesh.geometry.getAttribute('uv');
    assert.ok(uvs !== undefined, `${mesh.name} has no UVs — the atlas has nowhere to land`);
    assert.equal(uvs.count, mesh.geometry.getAttribute('position').count);

    // Since the environment pass the glazing is texels: every corner is folded
    // onto exactly one page (`DESIGN.md` §7i — unfolded geometry samples the
    // whole sheet), the wall strips are on a wall page, the glazed strips on a
    // glass page, and the roof and underside on the plain one.
    let glazed = 0;
    let solid = 0;
    for (let index = 0; index < uvs.count; index += 1) {
      const page = pageOf(uvs.getX(index), uvs.getY(index));
      assert.ok(page !== null, `${mesh.name} corner ${index} samples off every atlas page`);
      if (page.startsWith('glass')) glazed += 1; else solid += 1;
    }
    assert.ok(glazed > 0, `${mesh.name} has no glazing at all — it is a plain box`);
    assert.ok(solid > 0, `${mesh.name} is all glass`);
    // Roughly half and half. All glass reads as a greenhouse; a sliver reads as
    // nothing at all from the distance a block is seen at.
    const share = glazed / (glazed + solid);
    assert.ok(share > 0.2 && share < 0.7, `${mesh.name} is ${(share * 100).toFixed(0)}% glass`);
  }
});

test('every quad of a facade lies on one atlas page, and the three classes wear different pages', () => {
  const pagesByPart = new Map<string, Set<FacadePageId>>();
  const heights = [5, 18, 34];
  const probe: LevelPlan = {
    ...createProvingGround(),
    props: heights.map((height, index) => ({
      kind: 'building' as const,
      position: { x: index * 40, y: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      size: { x: 12, y: height, z: 12 },
    })),
  };
  const facades = createProps(probe);
  try {
    for (const child of facades.group.children) {
      const mesh = child as THREE.InstancedMesh;
      if (!mesh.name.includes('building') || mesh.name.endsWith('Cap')) continue;
      const uvs = mesh.geometry.getAttribute('uv');
      const pages = new Set<FacadePageId>();
      // Six corners a quad; all six must name the same page.
      for (let quad = 0; quad < uvs.count / 6; quad += 1) {
        const first = pageOf(uvs.getX(quad * 6), uvs.getY(quad * 6));
        for (let corner = 1; corner < 6; corner += 1) {
          const page = pageOf(uvs.getX(quad * 6 + corner), uvs.getY(quad * 6 + corner));
          assert.equal(page, first, `${mesh.name} quad ${quad} straddles pages`);
        }
        if (first !== null) pages.add(first);
      }
      pagesByPart.set(mesh.name, pages);
    }
  } finally {
    facades.dispose();
  }
  assert.deepEqual(
    [...(pagesByPart.get('level-props-buildingLow') ?? [])].sort(),
    ['glassLow', 'groundLow', 'plain', 'spandrel'],
  );
  assert.deepEqual(
    [...(pagesByPart.get('level-props-buildingBody') ?? [])].sort(),
    ['glass', 'ground', 'plain', 'spandrel'],
  );
  assert.deepEqual(
    [...(pagesByPart.get('level-props-buildingTall') ?? [])].sort(),
    ['glassTall', 'groundTall', 'plain', 'spandrel'],
  );
});

test('the facade atlas is one texture per view, shared by every facade material, and freed with the view', () => {
  const probe = createProps(plan);
  const maps = new Set<THREE.Texture>();
  for (const child of probe.group.children) {
    const material = (child as THREE.InstancedMesh).material as THREE.MeshStandardMaterial;
    if (material.map !== null) maps.add(material.map);
  }
  assert.equal(maps.size, 1, 'the facade parts must share one atlas texture');
  assert.equal(probe.textures, 1);
  const [atlas] = maps;
  let disposed = 0;
  atlas.addEventListener('dispose', () => { disposed += 1; });
  probe.dispose();
  assert.equal(disposed, 1, 'dispose() must release the atlas; a material never disposes its map');
  probe.dispose();
  assert.equal(disposed, 1, 'a second dispose() must not free the atlas twice');

  const empty = createProps(createProvingGround());
  assert.equal(empty.textures, 0, 'a world with no facade owns no atlas');
  empty.dispose();
});

test('the glazing is blue-shifted and never crushes the darkest building tone', () => {
  // The tint is now painted into the atlas (`render/facadeAtlas.test.ts`
  // asserts the texels), but the authored multiplier is still what the atlas
  // is painted from, so its two contracts stay here.
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

// ---------------------------------------------------------------------------
// The enhanced recipe — the environment pass, 2026-09-08
// ---------------------------------------------------------------------------

test('the slice selects the enhanced recipe, and that recipe stays inside PROP_BUDGET on the slice', () => {
  assert.equal(selectPresentation(plan).recipe.id, 'enhanced');
  assert.equal(enhancedView.recipe, 'enhanced');
  assert.equal(view.recipe, 'baseline');
  assert.ok(
    enhancedView.drawCalls + enhancedView.shadowDrawCalls <= PROP_BUDGET.maxDrawCalls,
    `${enhancedView.drawCalls + enhancedView.shadowDrawCalls} prop draw calls`,
  );
  assert.ok(
    enhancedView.triangles + enhancedView.shadowTriangles <= PROP_BUDGET.maxTriangles,
    `${enhancedView.triangles + enhancedView.shadowTriangles} prop triangles with shadows`,
  );
  // The average-per-prop guard, in the one scope it was calibrated for. It is
  // deliberately not a selection rule (`render/presentation.ts`).
  const average = enhancedView.triangles / enhancedView.props;
  assert.ok(
    average <= PROP_BUDGET.maxTrianglesPerProp,
    `the enhanced slice averages ${average.toFixed(1)} colour triangles per prop`,
  );
  assert.ok(enhancedView.triangles > view.triangles, 'the enhanced recipe must actually spend triangles');
});

test('the enhanced recipe changes triangles only — same buckets, transforms, tints, shadow flags', () => {
  assert.equal(enhancedView.group.children.length, view.group.children.length);
  assert.equal(enhancedView.instances, view.instances);
  assert.equal(enhancedView.drawCalls, view.drawCalls);
  assert.equal(enhancedView.shadowDrawCalls, view.shadowDrawCalls);
  for (let index = 0; index < view.group.children.length; index += 1) {
    const a = view.group.children[index] as THREE.InstancedMesh;
    const b = enhancedView.group.children[index] as THREE.InstancedMesh;
    assert.equal(a.name, b.name);
    assert.equal(a.count, b.count, `${a.name} instance count moved`);
    assert.equal(a.castShadow, b.castShadow, `${a.name} shadow flag moved`);
    assert.deepEqual(Array.from(b.instanceMatrix.array), Array.from(a.instanceMatrix.array), `${a.name} transforms moved`);
    assert.deepEqual(Array.from(b.instanceColor!.array), Array.from(a.instanceColor!.array), `${a.name} tints moved`);
    const enhanced = ['level-props-crown', 'level-props-coniferFoliage'].includes(a.name);
    const aTriangles = a.geometry.getAttribute('position').count / 3;
    const bTriangles = b.geometry.getAttribute('position').count / 3;
    if (enhanced) assert.ok(bTriangles > aTriangles, `${a.name} was not enriched`);
    else assert.equal(bTriangles, aTriangles, `${a.name} changed although the recipe does not name it`);
  }
});

test('the baseline recipe is what createProps builds when nobody asks', () => {
  const silent = createProps(plan);
  const explicit = createProps(plan, BASELINE_PRESENTATION);
  try {
    assert.equal(silent.recipe, 'baseline');
    assert.equal(silent.triangles, explicit.triangles);
    assert.equal(silent.triangles, view.triangles);
  } finally {
    silent.dispose();
    explicit.dispose();
  }
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

  /** The bands each facade geometry carries, by the mesh the renderer names. */
  const FLOORS: Readonly<Record<string, number>> = {
    'level-props-buildingLow': BUILDING_FACADE.lowRiseFloors,
    'level-props-buildingBody': BUILDING_FACADE.lowFloors,
    'level-props-buildingTall': BUILDING_FACADE.highFloors,
  };

  // **Every hand-authored world, not just the slice.** This assertion existed
  // and was correct throughout B1, and never saw BelVar's four paddock sheds
  // wearing 0.85 m storeys, because it was pointed at one level. That is the
  // third time a check has been fenced to the slice while a second world
  // quietly broke it — after `RouteSpine` and the mobile resize ride.
  for (const scene of [view, createProps(createTrackLevel())]) {
    for (const child of scene.group.children) {
      const floors = FLOORS[child.name];
      if (floors === undefined) continue;
      const mesh = child as THREE.InstancedMesh;
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
  }
});


test('the wordmark fits the banner it is bolted to, and keeps a margin of red', () => {
  // **The check the name's own length needed.** B1's gantry said BELVAR, which
  // fits any panel; the venue is BelVar Circuit, and the fix more than doubled
  // the lettering. Nothing in the kit was watching that: the plates are placed
  // from the word's own width, so a longer name does not wrap or clip — it
  // simply walks off the ends of the red and hangs in the truss, which reads as
  // a broken renderer rather than as a name that outgrew its sign.
  const size = PROP_SIZES.gantrySpan;
  const strokes = wordStrokes(GANTRY_WORDMARK, size.letterHeight);
  let width = 0;
  for (const stroke of strokes) for (const [x] of stroke) if (x > width) width = x;
  // The plates are the stroke paths *thickened*, so the ink is half a weight
  // wider than the path at each end.
  width += size.letterWeight;
  const panel = size.bannerHalfWidth * 2;
  const margin = (panel - width) / 2;
  assert.ok(
    margin > 0,
    `${GANTRY_WORDMARK} is ${width.toFixed(2)} m of lettering on a ${panel.toFixed(2)} m panel`,
  );
  // One cap height of red at each end, which is the difference between a sign
  // and a word with a red rectangle behind it.
  assert.ok(
    margin > size.letterHeight,
    `only ${margin.toFixed(2)} m of banner beside the wordmark, against a ${size.letterHeight} m cap`,
  );
  assert.ok(
    size.letterHeight < size.bannerHeight,
    'the lettering is taller than the panel carrying it',
  );
});
