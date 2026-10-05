/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as THREE from 'three';
import { propPartCounts } from '../data/renderCost.ts';
import {
  BUILDING_FACADE,
  BUILDING_LOOKS,
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
import { ULTRA_BUILDING_BUILDERS, ULTRA_FORM_BUILDERS, isReliefPart, ultraCasts } from './ultra/ultraKit.ts';
import { SLOT_CLOSING, ULTRA_SLOT_ATTRIBUTE, ultraBuildingCap } from './ultra/ultraBuildings.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { ULTRA_FULL, ULTRA_LIT, ULTRA_STATIC_LAYER, applyKitOverride } from './ultra/ultraRecipe.ts';
import type { UltraBuildContext, UltraRecipe } from './ultra/ultraTypes.ts';
import type { PartId, PropsView } from './props.ts';

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

// ---------------------------------------------------------------------------
// M39 Phase 2 — district looks and landmarks
// ---------------------------------------------------------------------------

test('a building with a look draws exactly the pieces the cost model counts, and a roof faces outward', () => {
  const props: Prop[] = BUILDING_LOOKS.map((look, index) => ({
    kind: 'building',
    position: { x: index * 60 + 3.7, y: 0, z: 11.3 },
    rotationY: index * 0.4,
    scale: 1,
    size: { x: 12, y: look === 'residential' || look === 'industrial' ? 7 : 20, z: 16 },
    look,
  }));
  const looked = createProps({ ...propOnlyPlan(), props });
  try {
    const predicted = new Map<string, number>();
    for (const prop of props) for (const [part, count] of propPartCounts(prop)) predicted.set(part, (predicted.get(part) ?? 0) + count);
    const built = new Map<string, number>();
    for (const child of looked.group.children) built.set(child.name.replace('level-props-', ''), (child as THREE.InstancedMesh).count);
    assert.deepEqual(Object.fromEntries([...built].sort()), Object.fromEntries([...predicted].sort()));
    assert.ok(built.has('roofGable'), 'no look drew a roof');

    // The roof prism: every face's winding points away from the prism's centroid.
    const roof = looked.group.children.find((child) => child.name === 'level-props-roofGable') as THREE.InstancedMesh;
    const position = roof.geometry.getAttribute('position');
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    const centroid = new THREE.Vector3(0, 1 / 3, 0);
    for (let index = 0; index < position.count; index += 3) {
      a.fromBufferAttribute(position, index);
      b.fromBufferAttribute(position, index + 1);
      c.fromBufferAttribute(position, index + 2);
      const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      const middle = a.clone().add(b).add(c).divideScalar(3).sub(centroid);
      assert.ok(face.dot(middle) > 0, `roof triangle ${index / 3} winds inward`);
    }
    assert.equal(roof.castShadow, false, 'a building part that casts costs a shadow call the library bound has no room for');
  } finally {
    looked.dispose();
  }
});

function propOnlyPlan(): LevelPlan {
  return {
    id: 'looks-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 2, rows: 2, heights: [0, 0, 0, 0], surfaces: ['grass'] },
    segments: [],
    checkpoints: [],
  };
}

// ---------------------------------------------------------------------------
// M39 Ultra — the forms hook (`docs/M39_ULTRA.md` §6.3 W3)
// ---------------------------------------------------------------------------

/**
 * Everything an ordinary view's scene is made of, as one digest: every mesh's
 * name, count, flags, layers, material parameters and depth-material
 * presence, every geometry attribute buffer, every instance matrix and
 * colour, and the view's own counters.
 */
function sceneDigest(built: PropsView): string {
  const hash = createHash('sha256');
  for (const child of built.group.children) {
    const mesh = child as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    hash.update(`${mesh.name}|${mesh.count}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.layers.mask}|${material.roughness}|${material.metalness}|${material.vertexColors}|${material.color.getHex()}|${material.map !== null}|${mesh.customDepthMaterial === undefined}`);
    const geometry = mesh.geometry;
    for (const name of Object.keys(geometry.attributes).sort()) {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
      hash.update(name);
      hash.update(Buffer.from(new Float32Array(attribute.array as ArrayLike<number>).buffer));
    }
    hash.update(Buffer.from(new Float32Array(mesh.instanceMatrix.array).buffer));
    hash.update(Buffer.from(new Float32Array(mesh.instanceColor!.array).buffer));
  }
  hash.update(`${built.props}|${built.instances}|${built.drawCalls}|${built.triangles}|${built.shadowDrawCalls}|${built.shadowTriangles}|${built.recipe}|${built.textures}`);
  return hash.digest('hex');
}

test('ordinary createProps is byte-identical to the build before the Ultra hook', () => {
  // Invariant 1 of M39: Low, Medium and High do not change. These digests
  // were taken from this tree immediately before `createProps` learned about
  // Ultra recipes (2026-09-23, W3), on the pinned three 0.185.1 and Node 26.
  // A difference here is an ordinary-world change, not a stale number; the
  // pre-Ultra goldens in `ordinaryParity.test.ts` are the independent check.
  const track = createTrackLevel();
  assert.equal(sceneDigest(createProps(plan)), 'be2238f4a0243a9d7184df389474d494bcba34935b16f1b5720c83f6833d69f6', 'the baseline slice changed');
  assert.equal(sceneDigest(createProps(plan, ENHANCED_PRESENTATION)), '3160a0169b4b191ef9b2cb1fe837b9241d3eba5f0bd638f0fb1d619a100810ab', 'the enhanced slice changed');
  // 2026-10-04: BelVar's paddock workshop is now authored `industrial` (the
  // owner-authorized environment upgrade; `ordinaryParity.test.ts` restores
  // the same one descriptor). With exactly that descriptor restored the
  // pre-Ultra digest must still match, so nothing else in the ordinary
  // BelVar moved; the accepted current build is pinned beside it.
  let restored = 0;
  const historicalTrack: LevelPlan = { ...track, props: track.props?.map((prop) => {
    if (prop.kind !== 'building' || prop.look !== 'industrial'
      || prop.size?.x !== 10 || prop.size.y !== 5 || prop.size.z !== 15) return prop;
    restored += 1;
    const historical = { ...prop };
    delete historical.look;
    return historical;
  }) };
  assert.equal(restored, 1, 'only the amended paddock workshop is restored');
  assert.equal(sceneDigest(createProps(historicalTrack, ENHANCED_PRESENTATION)), '59d61dd9f57c9c51e90cbf2dc0e796257299b67ac17bbcd4bd5595f84aa03135', 'the enhanced BelVar changed');
  assert.equal(sceneDigest(createProps(track, ENHANCED_PRESENTATION)), '98ecd6abbb3f5288359d6fb9baf12bbe64ca85851b78837c596e60d6ae79453f', 'the enhanced BelVar with its industrial workshop changed');
  // And an ordinary view owns no Ultra resource at all.
  for (const ordinary of [view, enhancedView]) {
    assert.equal(ordinary.bytes, 0);
    for (const child of ordinary.group.children) {
      const mesh = child as THREE.InstancedMesh;
      assert.equal(mesh.receiveShadow, false, `${mesh.name} receives on an ordinary world`);
      assert.equal(mesh.customDepthMaterial, undefined, `${mesh.name} has a depth material on an ordinary world`);
      assert.equal(mesh.layers.isEnabled(ULTRA_STATIC_LAYER), false, `${mesh.name} joined the static layer on an ordinary world`);
    }
  }
});

function ultraContext(recipe: UltraRecipe): UltraBuildContext {
  // What the renderer hands `createProps`; headless, the shared uniforms need
  // no GL context and the anisotropy is 1.
  return { recipe, shared: createUltraShared(), maxAnisotropy: 1 };
}

const ultraView = createProps(plan, ULTRA_FULL, ultraContext(ULTRA_FULL));
const trackEnhanced = createProps(createTrackLevel(), ENHANCED_PRESENTATION);
const trackUltra = createProps(createTrackLevel(), ULTRA_FULL, ultraContext(ULTRA_FULL));

test('an Ultra view keeps the enhanced buckets, names, instance counts, matrices and colours', () => {
  for (const [enhanced, ultra, world] of [[enhancedView, ultraView, 'slice'], [trackEnhanced, trackUltra, 'BelVar']] as const) {
    assert.equal(ultra.recipe, 'ultra-full');
    assert.equal(ultra.props, enhanced.props);
    assert.equal(ultra.instances, enhanced.instances);
    assert.equal(ultra.drawCalls, enhanced.drawCalls, `${world}: the Ultra kit added a colour draw call`);
    assert.equal(ultra.group.children.length, enhanced.group.children.length);
    for (let index = 0; index < enhanced.group.children.length; index += 1) {
      const a = enhanced.group.children[index] as THREE.InstancedMesh;
      const b = ultra.group.children[index] as THREE.InstancedMesh;
      assert.equal(b.name, a.name, `${world}: bucket ${index} renamed`);
      assert.equal(b.count, a.count, `${world}: ${a.name} instance count moved`);
      assert.deepEqual(Array.from(b.instanceMatrix.array), Array.from(a.instanceMatrix.array), `${world}: ${a.name} transforms moved`);
      assert.deepEqual(Array.from(b.instanceColor!.array), Array.from(a.instanceColor!.array), `${world}: ${a.name} tints moved`);
      // Only the triangles of a rebuilt part differ.
      const part = a.name.replace('level-props-', '') as PartId;
      const rebuilt = ULTRA_FORM_BUILDERS[part] !== undefined || ULTRA_BUILDING_BUILDERS[part] !== undefined;
      const aTriangles = a.geometry.getAttribute('position').count / 3;
      const bTriangles = b.geometry.getAttribute('position').count / 3;
      if (rebuilt) assert.ok(bTriangles > aTriangles, `${world}: ${a.name} was not rebuilt`);
      else assert.equal(bTriangles, aTriangles, `${world}: ${a.name} changed although §4 leaves it`);
      // The instance-colour trap stays shut, and a rebuilt part's colour
      // averages one (§4). A part §4 leaves alone keeps its own attribute —
      // the gantry's three colours are ratios of its plate by design.
      const colour = b.geometry.getAttribute('color');
      assert.ok(colour !== undefined && colour.count === b.geometry.getAttribute('position').count, `${b.name} would render black`);
      if (!rebuilt) {
        assert.deepEqual(Array.from(colour.array), Array.from(a.geometry.getAttribute('color').array), `${b.name} colour changed although §4 leaves it`);
        continue;
      }
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let i = 0; i < colour.count; i += 1) sum += colour.getComponent(i, channel);
        assert.ok(Math.abs(sum / colour.count - 1) < 1e-4, `${b.name} channel ${channel} averages ${sum / colour.count}`);
      }
      assert.ok((b.material as THREE.MeshStandardMaterial).vertexColors, `${b.name} does not enable vertexColors`);
    }
  }
});

test('on an Ultra world the buildings cast, every part receives, relief casts through its depth material, and casters join the static layer', () => {
  for (const [enhanced, ultra] of [[enhancedView, ultraView], [trackEnhanced, trackUltra]] as const) {
    let shadowCalls = 0;
    let shadowTriangles = 0;
    for (let index = 0; index < ultra.group.children.length; index += 1) {
      const ordinary = enhanced.group.children[index] as THREE.InstancedMesh;
      const mesh = ultra.group.children[index] as THREE.InstancedMesh;
      const part = mesh.name.replace('level-props-', '') as PartId;
      assert.equal(mesh.castShadow, ultraCasts(part, ordinary.castShadow, ULTRA_FULL.ultra), `${mesh.name} cast flag`);
      assert.equal(mesh.receiveShadow, true, `${mesh.name} does not receive`);
      assert.equal(mesh.customDepthMaterial !== undefined, isReliefPart(part), `${mesh.name} relief depth material`);
      assert.equal(mesh.layers.isEnabled(ULTRA_STATIC_LAYER), mesh.castShadow, `${mesh.name} static layer`);
      assert.ok(mesh.layers.isEnabled(0), `${mesh.name} left the default layer`);
      if (mesh.castShadow) {
        shadowCalls += 1;
        shadowTriangles += (mesh.geometry.getAttribute('position').count / 3) * mesh.count;
      }
    }
    assert.equal(ultra.shadowDrawCalls, shadowCalls, 'shadow calls do not follow the Ultra cast flags');
    assert.equal(ultra.shadowTriangles, shadowTriangles);
    assert.ok(ultra.shadowDrawCalls > enhanced.shadowDrawCalls, 'no building part casts on an Ultra world');
  }
  // One relief depth material for the whole view, but for a cap bucket that
  // closes a slot (A16), which wears its own: the slice has one slot.
  const depth = new Set(ultraView.group.children.map((child) => (child as THREE.InstancedMesh).customDepthMaterial).filter((m) => m !== undefined));
  assert.equal(depth.size, 2);
  for (const child of ultraView.group.children) {
    const mesh = child as THREE.InstancedMesh;
    if (mesh.customDepthMaterial === undefined) continue;
    const slot = 'ULTRA_SLOT' in (mesh.customDepthMaterial.defines ?? {});
    assert.equal(slot, mesh.name === 'level-props-buildingCap', `${mesh.name} slot depth material`);
    assert.equal(slot, mesh.geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE) !== undefined, `${mesh.name}: a slot material without its attribute, or the reverse`);
  }
  // BelVar has no slot: one relief depth material, and no attribute.
  const track = new Set(trackUltra.group.children.map((child) => (child as THREE.InstancedMesh).customDepthMaterial).filter((m) => m !== undefined));
  assert.equal(track.size, 1);
});

test('an Ultra recipe without a build context is refused rather than half-built', () => {
  assert.throws(() => createProps(plan, ULTRA_FULL), /UltraBuildContext/);
});

test('the Ultra facade maps replace the ordinary atlas, are counted with their bytes, and go with the view', () => {
  assert.equal(ultraView.textures, 3, 'an Ultra view with facades owns its albedo copy, normal and ORM pages');
  assert.ok(ultraView.bytes > 0, 'the Ultra ledger would be charged nothing');
  const probe = createProps(plan, ULTRA_FULL, ultraContext(ULTRA_FULL));
  const depth = (probe.group.children.find((child) => (child as THREE.InstancedMesh).customDepthMaterial !== undefined) as THREE.InstancedMesh).customDepthMaterial!;
  let depthDisposed = 0;
  depth.addEventListener('dispose', () => { depthDisposed += 1; });
  const original = THREE.Texture.prototype.dispose;
  let textures = 0;
  THREE.Texture.prototype.dispose = function counted(this: THREE.Texture) {
    textures += 1;
    original.call(this);
  };
  try {
    probe.dispose();
    probe.dispose();
  } finally {
    THREE.Texture.prototype.dispose = original;
  }
  assert.equal(textures, 3, `${textures} textures freed — the facade maps outlived the view, or were freed twice`);
  assert.equal(depthDisposed, 1, 'the relief depth material outlived the view');
  // Without facade maps the Ultra view falls back to the ordinary atlas; its
  // bytes are then the caps' slot attribute alone (A16, 4 B a cap).
  const noMaps = applyKitOverride(ULTRA_FULL, { facadeMaps: false });
  const plain = createProps(plan, noMaps, ultraContext(noMaps));
  const caps = plain.group.children.find((child) => child.name === 'level-props-buildingCap') as THREE.InstancedMesh;
  assert.equal(plain.textures, 1);
  assert.equal(plain.bytes, caps.count * 4);
  plain.dispose();
});

test('ultra-lit keeps the enhanced foliage and furniture and still builds the Ultra buildings', () => {
  const lit = createProps(plan, ULTRA_LIT, ultraContext(ULTRA_LIT));
  try {
    assert.equal(lit.recipe, 'ultra-lit');
    for (let index = 0; index < lit.group.children.length; index += 1) {
      const enhanced = enhancedView.group.children[index] as THREE.InstancedMesh;
      const full = ultraView.group.children[index] as THREE.InstancedMesh;
      const mesh = lit.group.children[index] as THREE.InstancedMesh;
      const part = mesh.name.replace('level-props-', '') as PartId;
      const triangles = mesh.geometry.getAttribute('position').count;
      if (ULTRA_BUILDING_BUILDERS[part] !== undefined) {
        assert.equal(triangles, full.geometry.getAttribute('position').count, `${mesh.name} lost its relief on ultra-lit`);
        assert.ok(mesh.castShadow && mesh.customDepthMaterial !== undefined);
      } else {
        assert.equal(triangles, enhanced.geometry.getAttribute('position').count, `${mesh.name} kept an Ultra form on ultra-lit`);
      }
    }
  } finally {
    lit.dispose();
  }
});

test('a kit without buildings draws the ordinary buildings with their ordinary flags', () => {
  const recipe = applyKitOverride(ULTRA_FULL, { buildings: false });
  const built = createProps(plan, recipe, ultraContext(recipe));
  try {
    for (let index = 0; index < built.group.children.length; index += 1) {
      const enhanced = enhancedView.group.children[index] as THREE.InstancedMesh;
      const mesh = built.group.children[index] as THREE.InstancedMesh;
      const part = mesh.name.replace('level-props-', '') as PartId;
      if (!isReliefPart(part)) continue;
      assert.equal(mesh.geometry.getAttribute('position').count, enhanced.geometry.getAttribute('position').count, `${mesh.name} rebuilt without the buildings kit`);
      assert.equal(mesh.geometry.getAttribute('ultraRelief'), undefined);
      assert.equal(mesh.geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE), undefined);
      assert.equal(mesh.castShadow, enhanced.castShadow);
      assert.equal(mesh.customDepthMaterial, undefined);
    }
  } finally {
    built.dispose();
  }
});

test('A16: the town\'s caps close their slots in the depth pass alone — one byte a side, never past a midline, nothing drawn moved', () => {
  // Gauntlet round 2, item 3: the commercial street's sunlit sliver is sun
  // through a 0.90 m slot between two parapets. The cap bucket carries a
  // normalised byte per side per instance (metres, −x, +x, −z, +z) that only
  // its own depth material reads.
  const recipe = applyKitOverride(ULTRA_FULL, { facadeMaps: false });
  const town = createProps(generateLevel('euc').plan, recipe, ultraContext(recipe));
  try {
    const caps = town.group.children.find((child) => child.name === 'level-props-buildingCap') as THREE.InstancedMesh;
    const slot = caps.geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE) as THREE.InstancedBufferAttribute;
    assert.ok(slot instanceof THREE.InstancedBufferAttribute, 'the slot data is not per instance');
    assert.ok(slot.array instanceof Uint8Array && slot.normalized && slot.itemSize === 4 && slot.count === caps.count);
    assert.equal(town.bytes, slot.array.byteLength, 'the slot attribute is not in the Ultra ledger');
    for (const child of town.group.children) {
      if (child !== caps) assert.equal((child as THREE.InstancedMesh).geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE), undefined, `${child.name} carries slot data`);
    }
    // The colour pass is untouched: the cap geometry is the Ultra cap plus the
    // attribute, and the colour material never declares it.
    const reference = ultraBuildingCap();
    for (const name of Object.keys(reference.attributes)) {
      assert.deepEqual(Array.from(caps.geometry.getAttribute(name).array), Array.from(reference.getAttribute(name).array), `the cap's ${name} changed`);
    }
    assert.ok(!('ULTRA_SLOT' in ((caps.material as THREE.Material).defines ?? {})));
    assert.ok('ULTRA_SLOT' in (caps.customDepthMaterial!.defines ?? {}));
    // The far map's half: only the slot bucket hangs a draw on its render hook.
    for (const child of town.group.children) {
      const own = Object.prototype.hasOwnProperty.call(child, 'onBeforeRender');
      assert.equal(own, child === caps, `${child.name} render hook`);
    }

    // Every push, re-measured from the drawn instance matrices: sideways,
    // toward an aligned cap under 2 m away, and never past the midline.
    const matrix = new THREE.Matrix4();
    const boxes = Array.from({ length: caps.count }, (_, index) => {
      caps.getMatrixAt(index, matrix);
      const e = matrix.elements;
      const sx = Math.hypot(e[0], e[1], e[2]);
      const sz = Math.hypot(e[8], e[9], e[10]);
      return { x: e[12], z: e[14], ux: [e[0] / sx, e[2] / sx], uz: [e[8] / sz, e[10] / sz], hx: sx / 2, hz: sz / 2 };
    });
    const half = (box: typeof boxes[number], dx: number, dz: number): number =>
      Math.abs(dx * box.ux[0] + dz * box.ux[1]) * box.hx + Math.abs(dx * box.uz[0] + dz * box.uz[1]) * box.hz;
    let pushed = 0;
    let commercial = 0;
    for (let index = 0; index < caps.count; index += 1) {
      const a = boxes[index];
      for (let side = 0; side < 4; side += 1) {
        const value = slot.array[index * 4 + side] / 255;
        if (value === 0) continue;
        pushed += 1;
        const axis = side < 2 ? a.ux : a.uz;
        const sign = side % 2 === 0 ? -1 : 1;
        const n = [axis[0] * sign, axis[1] * sign];
        const t = side < 2 ? a.uz : a.ux;
        const along = side < 2 ? a.hz : a.hx;
        let nearest = Infinity;
        for (const b of boxes) {
          if (b === a) continue;
          // A neighbour faces this side when it runs along it; the nearest one
          // along the side's own normal bounds the push.
          const offset = (b.x - a.x) * t[0] + (b.z - a.z) * t[1];
          const run = Math.min(along, offset + half(b, t[0], t[1])) - Math.max(-along, offset - half(b, t[0], t[1]));
          if (run <= 0) continue;
          const gap = (b.x - a.x) * n[0] + (b.z - a.z) * n[1] - half(b, n[0], n[1]) - (side < 2 ? a.hx : a.hz);
          if (gap > 0 && gap < SLOT_CLOSING.maxGap) nearest = Math.min(nearest, gap);
        }
        assert.ok(nearest < SLOT_CLOSING.maxGap, `cap ${index} side ${side} pushed ${value} m with no cap under 2 m`);
        assert.ok(value <= nearest / 2 + 1e-4, `cap ${index} side ${side} pushed ${value} m past the midline of ${nearest} m`);
        // The commercial pair at the gauntlet's view: both parapets reach the midline.
        if (Math.hypot(a.x - 240.14, a.z - 206.46) < 0.5 || Math.hypot(a.x - 256.57, a.z - 217.89) < 0.5) {
          if (Math.abs(nearest - 0.895) < 0.01) {
            commercial += 1;
            assert.ok(value > nearest / 2 - 2 / 255, `the commercial slot stays ${nearest - 2 * value} m open`);
          }
        }
      }
    }
    assert.ok(pushed >= 2, 'the town closes no slot at all');
    assert.equal(commercial, 2, 'the commercial slot (gauntlet round 2, item 3) is not closed from both sides');
  } finally {
    town.dispose();
  }
});

test('Ultra views are deterministic, and two of them share nothing', () => {
  const again = createProps(plan, ULTRA_FULL, ultraContext(ULTRA_FULL));
  try {
    assert.equal(again.triangles, ultraView.triangles);
    assert.equal(again.shadowTriangles, ultraView.shadowTriangles);
    for (let index = 0; index < again.group.children.length; index += 1) {
      const a = ultraView.group.children[index] as THREE.InstancedMesh;
      const b = again.group.children[index] as THREE.InstancedMesh;
      assert.notEqual(a.geometry, b.geometry, `${a.name} geometry is shared between views`);
      for (const name of Object.keys(a.geometry.attributes)) {
        assert.deepEqual(Array.from(b.geometry.getAttribute(name).array), Array.from(a.geometry.getAttribute(name).array), `${a.name} ${name} differs between builds`);
      }
    }
  } finally {
    again.dispose();
  }
  assert.ok((ultraView.group.children[0] as THREE.InstancedMesh).geometry.getAttribute('position') !== undefined);
});
