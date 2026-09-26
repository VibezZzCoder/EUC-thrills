/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { TERRAIN } from '../data/tuning.ts';
import {
  SURFACES,
  materialAppearance,
  type MaterialAppearance,
  type MaterialId,
} from '../data/surfaces.ts';
import type { BoxCollider, Heightfield, LevelPlan } from '../level/plan.ts';
import { terrainCells, type FieldCoverage } from '../level/terrainCoverage.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { createHazards, type HazardsView } from './hazards.ts';
import { createMarkings, type MarkingsView } from './markings.ts';
import { createProps } from './props.ts';
import { BASELINE_PRESENTATION } from './presentation.ts';
import { isCoursed, stoneTone, wallFaceGrid } from './wallCourses.ts';
import {
  contactOcclusion,
  edgeFillFor,
  edgeSignedDistance,
  fillTint,
  ULTRA_CRISP_MATERIALS,
  ULTRA_GROUND_ATTRIBUTES,
  type ContactField,
} from './ultra/groundContact.ts';
import { blockBaseAo, plankTone, ultraFaceDivision } from './ultra/ultraBlocks.ts';
import {
  createUltraGroundDetail,
  groundDetailKind,
  smoothSampleNormals,
  ULTRA_GROUND,
  type UltraGroundDetail,
} from './ultra/ultraGroundDetail.ts';
import { ultraBlockMaterial, ultraGroundMaterial } from './ultra/ultraMaterials.ts';
import { isUltraRecipe, ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import type { BuildRecipe, BuildRecipeId, UltraBuildContext, UltraKit } from './ultra/ultraTypes.ts';
import {
  COURSE_MOTTLE,
  EDGE_ENCROACH,
  FIELD_MOTTLE,
  encroachAt,
  groundTint,
  linearFromSrgbHex,
  mixColours,
  pavingShade,
  rebaseTint,
  type GroundTint,
} from './groundNoise.ts';

/**
 * The rendered world, built from the `LevelPlan` and from nothing else.
 *
 * **This file is the point of architecture invariant 2.** Until M4 the renderer
 * built its own placeholder ground from the same constants the plan described,
 * which is the same geometry stated twice — a version of the "rendered and
 * collision geometry need one owner" failure (master §5.4) that had simply not
 * had a chance to bite yet, because both copies were a flat plane. It is gone.
 * Every triangle below comes out of `plan.heightfield`, every kerb and wall out
 * of `plan.segments[].colliders`, and `simulation/planSampler.ts` reads the
 * same two arrays. There is no second description of the ground anywhere.
 *
 * Three decisions worth stating, because each one is load-bearing:
 *
 *   1. **The cell diagonal is shared with the sampler.** Every cell splits from
 *      (column, row) to (column+1, row+1). The sampler interpolates within that
 *      same triangle, so the drawn surface and the ridden surface agree to the
 *      millimetre rather than at the corners only.
 *   2. **All-surround cells are not emitted.** The surround is one large plane;
 *      drawing terrain coplanar with it would z-fight across every square metre
 *      of field. Skipping them also drops the mesh from roughly seventy-five
 *      thousand cells to the thirteen thousand the course actually occupies.
 *   3. **One geometry, one material group per surface.** Seven draw calls for
 *      the whole ground rather than seven meshes, and the vertex colours that
 *      carry surface mottle live on the single shared attribute. M13's spill is
 *      an eighth surface and costs exactly one more group on a level that
 *      contains one, which is the whole of what a puddle needed from this file;
 *      the potholes are `render/hazards.ts`, because a hole is not ground.
 *
 * The mottle itself is not decoration — see `data/surfaces.ts`. It replaces the
 * M1 debug grid as the thing that makes speed readable over open ground. **Its
 * arithmetic now lives in `render/groundNoise.ts`**, which imports nothing and
 * is therefore the one part of the look pass that `node --test` can check. This
 * file's job is only to decide *where* a cell is and to give all four of its
 * unshared corners the same answer.
 */

export interface TerrainView {
  readonly group: THREE.Group;
  /** Cells actually drawn, and triangles. For the budget, not for a frame time. */
  readonly cellsDrawn: number;
  readonly triangles: number;
  /** M7.5 stage 4's road paint, for the budget and the QA bridge. */
  readonly markings: MarkingsView;
  /** M13 Phase 2's potholes, on the same terms as the paint above. */
  readonly hazards: HazardsView;
  /**
   * Which recipe the world was built with — an ordinary rung
   * (`render/presentation.ts`) or an Ultra one (`render/ultra/ultraRecipe.ts`).
   */
  readonly recipe: BuildRecipeId;
  /** Colour-pass triangles of the collider blocks, for the presentation model. */
  readonly blockTriangles: number;
  /** GPU textures this view owns, through its props. */
  readonly textures: number;
  /** What an Ultra build added (M39), or `null` on an ordinary world. */
  readonly ultra: UltraTerrainReport | null;
  /** Re-centre the surround plane on the rider. Called once per frame. */
  setSurroundCentre(x: number, z: number): void;
  dispose(): void;
}

/**
 * The Ultra ledger lines one terrain view owns — M39 (`docs/M39_ULTRA.md` §5).
 *
 * `bytes` and `textures` are the contract fields (§6.3 W6); the rest is the
 * report the package card asks for, so the ≤ 8 MiB attribute budget on the
 * town and the edge fill's reach can be read off a built world rather than
 * estimated.
 */
export interface UltraTerrainReport {
  /**
   * Every Ultra-only byte this view owns: the ground, field and block vertex
   * attributes below, the ground detail maps, plus whatever the props view
   * reports for its Ultra textures (the facade maps, `PropsView.bytes`).
   */
  readonly bytes: number;
  /** GPU textures this view owns on an Ultra world: the props' facade maps and the ground detail maps. */
  readonly textures: number;
  /** Heightfield, surround-field and collider-block Ultra attribute bytes alone. */
  readonly attributeBytes: number;
  /** The ground detail maps' bytes (pre-R1 ground pass), 0 without them. */
  readonly detailBytes: number;
  /** Heightfield cells the edge field paints, and the lines it draws them with. */
  readonly filledCells: number;
  readonly fillLines: number;
  /** Heightfield vertices whose normal the smoothed-slopes option changed. */
  readonly smoothedNormals: number;
}

function sampleHeight(field: Heightfield, column: number, row: number): number {
  return field.heights[row * field.columns + column];
}

/**
 * A material's appearance, after whatever this level repainted.
 *
 * **The only thing a level may change is the albedo**, and the only thing that
 * changes is which colour comes out of this function — the id, the material
 * set, and therefore the draw-call count are all untouched (`LevelPlan.palette`
 * says why). Every appearance lookup in this file goes through here, including
 * the one that feeds the mottle: the saturation layer moves a patch toward
 * *its own* material's grey, so a retint the mottle could not see would
 * desaturate the new colour toward the old one's.
 */
function paintedAppearance(
  id: MaterialId,
  palette: LevelPlan['palette'],
): MaterialAppearance {
  const appearance = materialAppearance(id);
  const albedo = palette?.[id];
  return albedo === undefined ? appearance : { ...appearance, albedo };
}

/**
 * Every surface's encroachment and decoded albedo, resolved once.
 *
 * The edge blend asks four questions per drawn cell and the slice draws
 * forty-three thousand of them, so decoding an sRGB hex inside that loop would
 * be a hundred and seventy thousand `Math.pow` calls at every level build.
 */
function surfaceLookup(
  palette: LevelPlan['palette'],
): Map<SurfaceId, { encroach: number; linear: GroundTint }> {
  const lookup = new Map<SurfaceId, { encroach: number; linear: GroundTint }>();
  for (const id of Object.keys(SURFACES) as SurfaceId[]) {
    const appearance = paintedAppearance(SURFACES[id].material, palette);
    const linear: GroundTint = { r: 1, g: 1, b: 1 };
    linearFromSrgbHex(appearance.albedo, linear);
    lookup.set(id, { encroach: appearance.encroach, linear });
  }
  return lookup;
}

/**
 * Vertex normal from the four neighbouring samples.
 *
 * Deliberately *not* the triangle plane normal the sampler returns. The sampler
 * needs the exact plane so the slope force is right; lighting needs a smooth
 * normal so a gentle hill does not read as a staircase. They are different
 * questions about the same array and it is correct for them to have different
 * answers — the shared thing that must not diverge is the height, and it does
 * not.
 */
function vertexNormal(
  field: Heightfield,
  column: number,
  row: number,
  out: THREE.Vector3,
): void {
  const left = sampleHeight(field, Math.max(0, column - 1), row);
  const right = sampleHeight(field, Math.min(field.columns - 1, column + 1), row);
  const back = sampleHeight(field, column, Math.max(0, row - 1));
  const front = sampleHeight(field, column, Math.min(field.rows - 1, row + 1));

  const spanX = (Math.min(field.columns - 1, column + 1) - Math.max(0, column - 1))
    * field.spacing;
  const spanZ = (Math.min(field.rows - 1, row + 1) - Math.max(0, row - 1)) * field.spacing;

  out.set(
    spanX > 0 ? -(right - left) / spanX : 0,
    1,
    spanZ > 0 ? -(front - back) / spanZ : 0,
  ).normalize();
}

function standardMaterial(appearance: MaterialAppearance, vertexColors: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: appearance.albedo,
    roughness: appearance.roughness,
    metalness: appearance.metalness,
    vertexColors,
  });
}

/**
 * The Ultra kit a build runs under, or `null` for an ordinary one — M39.
 *
 * **Every Ultra branch in this file sits behind this value being non-null**,
 * so a Low/Medium/High world builds exactly the geometry, materials and flags
 * it built before Ultra existed — the ordinary arm of each branch is the old
 * statement, unchanged (`docs/M39_ULTRA.md` §7.1 invariant 1, pinned by the
 * ordinary-parity goldens and the u0 captures). An Ultra recipe without its
 * build context is refused rather than half-built: the materials need the
 * context's shared uniforms, and a world drawn with ordinary materials over
 * Ultra attributes would be an "Ultra" label on an ordinary frame. The
 * context must also describe the same kit as the recipe, because the ground
 * patch keys its attribute reads on the context's kit and the geometry below
 * carries attributes by the recipe's — a mismatch would read a missing
 * attribute as WebGL's default 0, which is black AO.
 */
function ultraKitOf(recipe: BuildRecipe, context: UltraBuildContext | undefined): UltraKit | null {
  if (!isUltraRecipe(recipe)) return null;
  if (context === undefined) {
    throw new Error(`createTerrain: the Ultra recipe '${recipe.id}' needs its UltraBuildContext`);
  }
  const ours = recipe.ultra;
  const theirs = context.recipe.ultra;
  for (const key of Object.keys(ours) as (keyof UltraKit)[]) {
    if (ours[key] !== theirs[key]) {
      throw new Error(`createTerrain: the build context's kit disagrees with the recipe on '${key}'`);
    }
  }
  return ours;
}

export function createTerrain(
  plan: LevelPlan,
  recipe: BuildRecipe = BASELINE_PRESENTATION,
  context?: UltraBuildContext,
): TerrainView {
  const kit = ultraKitOf(recipe, context);
  const group = new THREE.Group();
  group.name = 'level-terrain';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const field = plan.heightfield;
  const surroundAppearance = paintedAppearance(SURFACES[plan.surround.surface].material, plan.palette);

  // -- The backstop -------------------------------------------------------
  // One uniform plane a few centimetres below the world, following the rider so
  // that running out of authored world is impossible rather than merely
  // unlikely. `polygonOffset` on both surround meshes pushes them a hair
  // further from the camera in depth than the terrain that meets them, which
  // makes the join structurally free of z-fighting rather than free of it by
  // luck.
  //
  // **"Below the world" is not "below the surround", and M7 is where that
  // stopped being the same sentence.** The proving ground only ever climbed
  // away from its surround, so a plane a few centimetres under the surround was
  // under everything. The slice's river valley is six and a half metres *below*
  // the city the surround sits at, and a backstop parked at the surround drew a
  // lid over the entire park: correct ground underneath, nothing visible but
  // grass. The plane therefore goes below the lowest sample the plan actually
  // contains. Found by riding the Pages build to the park gate, which is what
  // browser verification is for.
  let lowest = plan.surround.height;
  for (const height of field.heights) if (height < lowest) lowest = height;

  const backstopGeometry = new THREE.PlaneGeometry(
    TERRAIN.surroundBackstopHalfExtent * 2,
    TERRAIN.surroundBackstopHalfExtent * 2,
  );
  const backstopMaterial = standardMaterial(surroundAppearance, false);
  backstopMaterial.polygonOffset = true;
  backstopMaterial.polygonOffsetFactor = 2;
  backstopMaterial.polygonOffsetUnits = 2;
  const backstop = new THREE.Mesh(backstopGeometry, backstopMaterial);
  backstop.rotation.x = -Math.PI / 2;
  backstop.position.y = lowest - TERRAIN.surroundBackstopDrop;
  backstop.name = 'level-surround';
  group.add(backstop);
  geometries.push(backstopGeometry);
  materials.push(backstopMaterial);

  // -- The field ----------------------------------------------------------
  // The world outside the course, at the height the sampler answers for it, and
  // mottled at a coarser patch size than the course so the two read as managed
  // ground and open ground. **Static, not rider-following**: the mottle only
  // reads as speed if it moves relative to the rider, and a pattern carried by
  // a mesh that follows them does not.
  //
  // **The field yields wherever the course is not flush with it**, which M7
  // made necessary and M4 did not. A proving ground that only ever climbed away
  // from its surround could be covered by one rectangle at the surround's
  // height, because the heightfield always drew on top of it. A river valley six
  // and a half metres *below* the city is underneath that rectangle, and the
  // rectangle wins — the whole park rendered as unbroken grass with the correct
  // ground hidden under it. `fieldCoverage` marks the coarse patches that are
  // genuinely flush, the field draws only those, and the heightfield picks up
  // the rest.
  // Which ground this plan draws — the coverage rule and the cell census, both
  // owned by `level/terrainCoverage.ts` so that M12's render-budget contract
  // predicts the cost of exactly the mesh this file then builds, rather than of
  // a second description of it (invariant 2).
  const { coverage, bySurface: cellsBySurface, cellsDrawn } = terrainCells(plan);
  // -- Ultra: the ground's painted detail maps (M39 pre-R1 ground pass) ----
  // One set per view, shared by every ground material below and freed with
  // the view; the field and every heightfield group sample them in world XZ.
  const groundDetail: UltraGroundDetail | null = kit?.ground === true && ULTRA_GROUND.detail.enabled
    ? createUltraGroundDetail(context!.maxAnisotropy)
    : null;
  const fieldMesh = createSurroundField(
    plan,
    surroundAppearance,
    coverage,
    kit === null ? undefined : (appearance) => ultraGroundMaterial(appearance, 'field', context!, groundDetail),
  );
  group.add(fieldMesh.mesh);
  geometries.push(fieldMesh.geometry);
  materials.push(fieldMesh.material);

  // -- Ultra: contact AO on the field (M39 T5) ---------------------------
  // The analytic occluder field, built once and shared with the heightfield
  // below. The field's vertices stand on the coarse patch grid, so each one
  // asks for the mean over the patch it is interpolated across rather than
  // for the one point it sits on (`contactOcclusion`'s footprint).
  const contact = kit?.ground === true ? contactOcclusion(plan) : null;
  let ultraAttributeBytes = 0;
  if (contact !== null) {
    const position = fieldMesh.geometry.getAttribute('position');
    const ao = new Uint8Array(position.count);
    // One answer per patch corner, shared by the up-to-four unshared vertices
    // standing on it, exactly as the heightfield shares its samples below.
    const perCorner = new Float32Array((coverage.columns + 1) * (coverage.rows + 1)).fill(-1);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const x = position.getX(vertex);
      const z = position.getZ(vertex);
      const corner = Math.round((z - coverage.minZ) / coverage.cell) * (coverage.columns + 1)
        + Math.round((x - coverage.minX) / coverage.cell);
      if (perCorner[corner] < 0) perCorner[corner] = contact(x, z, coverage.cell);
      ao[vertex] = aoByte(perCorner[corner]);
    }
    fieldMesh.geometry.setAttribute(ULTRA_GROUND_ATTRIBUTES.ao, new THREE.Uint8BufferAttribute(ao, 1, true));
    ultraAttributeBytes += ao.byteLength;
  }

  // -- The heightfield ----------------------------------------------------
  const cellColumns = field.columns - 1;
  const cellRows = field.rows - 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const terrainMaterials: THREE.Material[] = [];

  const normal = new THREE.Vector3();

  /**
   * Four unshared vertices per cell.
   *
   * **Unshared on purpose, and it is the difference between a speed cue and
   * nothing.** Sharing vertices between neighbouring cells is the obvious
   * saving, and it was the first attempt: it makes the per-cell mottle
   * interpolate across every cell boundary, which turns a metre-scale texture
   * into a ten-metre gradient that is invisible at chase-camera distance and
   * useless at 15 m/s. Duplicating the corners lets each square metre take one
   * tone, which reads as paving, turf, or gravel and gives the eye something
   * that actually moves past.
   *
   * The lower-frequency layers added at M7.5 are smooth by construction and
   * would survive shared vertices perfectly well. The metre-scale layer would
   * not, and it is the one doing the speed work — so the geometry decision is
   * unchanged.
   *
   * The *normal* is still the smooth one computed from the neighbouring
   * samples, so a hill is smooth-shaded even though its colour is not. Flat
   * colour with smooth lighting is the whole effect. The cost is four times the
   * vertices of a shared mesh, which on a course this size is tens of
   * thousands, not millions.
   */
  const pushCorner = (column: number, row: number, tint: GroundTint): number => {
    const index = positions.length / 3;
    positions.push(
      field.originX + column * field.spacing,
      sampleHeight(field, column, row),
      field.originZ + row * field.spacing,
    );
    vertexNormal(field, column, row, normal);
    normals.push(normal.x, normal.y, normal.z);
    // Multiplied against the material's own albedo, so the variation is
    // relative and a dark surface does not receive a light surface's absolute
    // swing. All four corners of a cell get the *same* tint — that is what
    // makes a square metre take one tone instead of a gradient, and it is the
    // whole reason the corners are unshared.
    colors.push(tint.r, tint.g, tint.b);
    return index;
  };

  const tint: GroundTint = { r: 1, g: 1, b: 1 };
  const base: GroundTint = { r: 1, g: 1, b: 1 };
  const blended: GroundTint = { r: 1, g: 1, b: 1 };
  const encroaching: GroundTint = { r: 0, g: 0, b: 0 };
  const surfaceLook = surfaceLookup(plan.palette);

  for (const [surface, cells] of cellsBySurface) {
    const appearance = paintedAppearance(
      SURFACES[surface as keyof typeof SURFACES]?.material ?? 'pavement',
      plan.palette,
    );
    // The material's linear albedo, which the saturation layer needs so a
    // desaturated patch moves toward *this* surface's grey.
    linearFromSrgbHex(appearance.albedo, base);
    const own = surfaceLook.get(surface as SurfaceId);
    // M39 Wave 3 (R-G; round-1 item 8, A12): on an Ultra world whose edge
    // field draws the band boundaries, a ridden or verge cell (road, rough
    // pavement, dirt, gravel: `ULTRA_CRISP_MATERIALS`) takes no §4c blend. The blend tinted the
    // ridden cells along every boundary toward the turf or verge beside them,
    // and once the field had straightened the boundary those tinted cells
    // were left as a stair-stepped, feathered band inside the road and the
    // trail ("grass reads onto the trail", the smeared steeple edge). The
    // field now draws the neighbour's colour, crisply and within half a cell.
    const holdBlend = kit !== null && kit.ground && kit.edgeFill && ULTRA_CRISP_MATERIALS.has(appearance.id);
    for (const cell of cells) {
      const row = Math.floor(cell / cellColumns);
      const column = cell - row * cellColumns;
      const worldX = field.originX + (column + 0.5) * field.spacing;
      const worldZ = field.originZ + (row + 0.5) * field.spacing;

      // -- The edge, from M7.5 stage 4 -----------------------------------
      // How much of a neighbouring surface this cell takes, and of what. Only
      // neighbours that encroach harder than this cell does contribute, which
      // is what makes turf creep onto a path and never the other way round.
      let weight = 0;
      encroaching.r = 0; encroaching.g = 0; encroaching.b = 0;
      for (let side = 0; side < 4 && !holdBlend; side += 1) {
        const neighbourColumn = column + (side === 0 ? -1 : side === 1 ? 1 : 0);
        const neighbourRow = row + (side === 2 ? -1 : side === 3 ? 1 : 0);
        if (
          neighbourColumn < 0 || neighbourRow < 0
          || neighbourColumn >= cellColumns || neighbourRow >= cellRows
        ) continue;
        const neighbour = surfaceLook.get(field.surfaces[neighbourRow * cellColumns + neighbourColumn]);
        if (neighbour === undefined || neighbour.encroach <= (own?.encroach ?? 0)) continue;

        const amount = encroachAt(column, row, worldX, worldZ, neighbour.encroach, 0x2b1 + side);
        if (amount <= 0) continue;
        weight += amount;
        encroaching.r += neighbour.linear.r * amount;
        encroaching.g += neighbour.linear.g * amount;
        encroaching.b += neighbour.linear.b * amount;
      }

      let effective = base;
      if (weight > 0) {
        encroaching.r /= weight; encroaching.g /= weight; encroaching.b /= weight;
        effective = mixColours(
          base,
          encroaching,
          Math.min(EDGE_ENCROACH.maxBlend, weight),
          blended,
        );
      }

      // Cell indices drive the metre-scale speed cue; the cell *centre* in
      // world metres drives the smooth layers, so those stay locked to the
      // world rather than to the heightfield's array origin.
      groundTint(
        column,
        row,
        worldX,
        worldZ,
        appearance.mottle,
        effective,
        COURSE_MOTTLE,
        tint,
      );
      // The tint multiplies the *material's* albedo, so a cell that blended
      // toward its neighbour has to carry the ratio between the two.
      if (weight > 0) rebaseTint(tint, effective, base);

      if (appearance.paving !== undefined) {
        const paving = pavingShade(worldX, worldZ, appearance.paving);
        tint.r *= paving; tint.g *= paving; tint.b *= paving;
      }

      const a = pushCorner(column, row, tint);
      const b = pushCorner(column + 1, row, tint);
      const c = pushCorner(column, row + 1, tint);
      const d = pushCorner(column + 1, row + 1, tint);

      // Split along the (column, row) - (column+1, row+1) diagonal, which is
      // the diagonal `simulation/planSampler.ts` interpolates within. Wound
      // counter-clockwise seen from above: +X is to the left of +Z here, so
      // the front face is the one the sun lights.
      indices.push(a, c, b, b, c, d);
    }

    terrainMaterials.push(
      kit === null ? standardMaterial(appearance, true) : ultraGroundMaterial(appearance, appearance.id, context!, groundDetail),
    );
  }

  // -- Ultra: smooth-shaded slopes (M39 pre-R1 ground pass, optional) -------
  // Attribute-only: the normals of every non-road cell are replaced by a
  // Gaussian-smoothed field of the same samples, eased in from the road, so
  // a bank reads as a slope instead of as facets. Positions, triangles and
  // the sampler's own plane normals are untouched.
  const smoothedNormals = kit?.ground === true && ULTRA_GROUND.smoothNormals.enabled
    ? smoothHeightfieldNormals(field, cellsBySurface, normals)
    : 0;

  // The groups have to be added after the index array is complete, because a
  // group is a range into it.
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  terrainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.setIndex(indices);

  let start = 0;
  let materialIndex = 0;
  for (const cells of cellsBySurface.values()) {
    const count = cells.length * 6;
    terrainGeometry.addGroup(start, count, materialIndex);
    start += count;
    materialIndex += 1;
  }
  terrainGeometry.computeBoundingSphere();

  // -- Ultra: contact AO and the edge fill on the heightfield (M39 T5, T6) --
  // Attributes only: no position, normal, colour, index or group above moves,
  // so the ridden surface and the ordinary tints are the ones just built. The
  // fill is part of the ground treatment (`kit.ground`), with `edgeFill` its
  // kill flag — the same pair the ground patch declares the attributes under.
  let fillLines = 0;
  let filledCells = 0;
  if (kit !== null && contact !== null) {
    const ultraGround = heightfieldAttributes(plan, cellsBySurface, colors, contact, kit.edgeFill);
    for (const [name, attribute] of ultraGround.attributes) terrainGeometry.setAttribute(name, attribute);
    ultraAttributeBytes += ultraGround.bytes;
    fillLines = ultraGround.fillLines;
    filledCells = ultraGround.filledCells;
  }

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterials);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.name = 'level-heightfield';
  group.add(terrain);
  geometries.push(terrainGeometry);
  materials.push(...terrainMaterials);

  // -- Kerbs, walls, bollards ---------------------------------------------
  // Merged per material into one geometry each, so the plaza's four bollards
  // and its gate cost two draw calls between them rather than six.
  const byMaterial = new Map<MaterialId, BoxCollider[]>();
  for (const segment of plan.segments) {
    for (const collider of segment.colliders) {
      const id = collider.appearance ?? SURFACES[collider.surface].material;
      const list = byMaterial.get(id);
      if (list === undefined) byMaterial.set(id, [collider]);
      else list.push(collider);
    }
  }

  let colliderTriangles = 0;
  for (const [id, colliders] of byMaterial) {
    const appearance = paintedAppearance(id, plan.palette);
    const boxPositions: number[] = [];
    const boxNormals: number[] = [];
    const boxColours: number[] = [];
    const boxIndices: number[] = [];
    // M39 T9: the Ultra blocks' base AO, one value per vertex pushed.
    const boxAo: number[] | null = kit?.blocks === true ? [] : null;

    for (const collider of colliders) {
      appendBox(
        collider,
        boxPositions,
        boxNormals,
        boxColours,
        boxIndices,
        recipe.walls && isCoursed(collider, id),
        boxAo === null ? undefined : { material: id, ao: boxAo },
      );
    }

    // The colour attribute is present in every recipe — white where a face
    // is plain, the running bond's flat tones where a wall is coursed — so a
    // block material compiles the same program whichever recipe a world took.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(boxPositions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(boxNormals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(boxColours, 3));
    if (boxAo !== null) {
      const ao = Uint8Array.from(boxAo, aoByte);
      geometry.setAttribute(ULTRA_GROUND_ATTRIBUTES.ao, new THREE.Uint8BufferAttribute(ao, 1, true));
      ultraAttributeBytes += ao.byteLength;
    }
    geometry.setIndex(boxIndices);
    geometry.computeBoundingSphere();

    const material = kit === null ? standardMaterial(appearance, true) : ultraBlockMaterial(appearance, id, context!);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `level-blocks-${id}`;
    // Every block casts, so on an Ultra world every block joins the static
    // far-shadow layer (§3.4); the ordinary world has no far shadow to join.
    if (kit !== null) mesh.layers.enable(ULTRA_STATIC_LAYER);
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    colliderTriangles += boxIndices.length / 3;
  }

  // M7.5's dressing. This renderer reads only `plan.props`; M8.6's separately
  // derived `plan.solids` are simulation data and are deliberately not drawn as
  // proxy boxes over the prop meshes. Props are built and freed with the level
  // because one outliving the terrain it was placed against is a leak with no
  // symptom until the GPU object count stops plateauing.
  const props = createProps(plan, recipe, context);
  group.add(props.group);

  // M7.5 stage 4's paint. Render-only on exactly the same terms as the props
  // above, built and freed with the terrain for exactly the same reason, and
  // needing no second world description from this file: the renderer samples
  // each finished ribbon edge from the plan's own heightfield.
  const markings = createMarkings(plan, context);
  group.add(markings.group);

  // M13 Phase 2's potholes, on exactly the terms the paint above is held to and
  // for the same reasons: built from `plan.hazards` alone, owning their own
  // geometry and material, freed with the terrain, and answering no gameplay
  // question — `simulation/hazards.ts` reads the same array for that. A spill
  // is absent from this call by construction, because a spill is a surface and
  // was drawn by the heightfield above.
  const hazards = createHazards(plan, context);
  group.add(hazards.group);

  // The props view reports its own Ultra bytes (the facade maps) when it has
  // any; read defensively so this file does not depend on that field's shape.
  const propsUltraBytes = 'bytes' in props && typeof props.bytes === 'number' ? props.bytes : 0;

  return {
    group,
    cellsDrawn,
    markings,
    hazards,
    triangles: indices.length / 3 + colliderTriangles + fieldMesh.triangles + 2
      + props.triangles + markings.triangles + hazards.triangles,
    recipe: recipe.id,
    blockTriangles: colliderTriangles,
    textures: props.textures + (groundDetail?.textures ?? 0),
    ultra: kit === null
      ? null
      : {
        bytes: ultraAttributeBytes + propsUltraBytes + (groundDetail?.bytes ?? 0),
        textures: props.textures + (groundDetail?.textures ?? 0),
        attributeBytes: ultraAttributeBytes,
        detailBytes: groundDetail?.bytes ?? 0,
        filledCells,
        fillLines,
        smoothedNormals,
      },

    setSurroundCentre(x: number, z: number): void {
      backstop.position.x = x;
      backstop.position.z = z;
    },

    dispose(): void {
      // Props, paint and potholes first: each owns geometries and materials of
      // its own, and the loops below only free what this file tracked.
      props.dispose();
      markings.dispose();
      hazards.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      groundDetail?.dispose();
      geometries.length = 0;
      materials.length = 0;
      group.removeFromParent();
    },
  };
}

/**
 * The mottled field surrounding the course.
 *
 * A flat grid rather than a `PlaneGeometry`, for one reason: it carries the
 * same per-patch vertex colour the heightfield does, at a coarser patch size,
 * and `PlaneGeometry` shares its vertices — which would interpolate the mottle
 * away exactly as it did on the course before the corners were unshared.
 *
 * Its extent comes from `TERRAIN.surroundMargin`, which is chosen against the
 * fog's far distance so the edge is always further away than the haze can see.
 * That is what lets a finite, static, world-locked plane stand in for an
 * endless one.
 */
function createSurroundField(
  plan: LevelPlan,
  appearance: MaterialAppearance,
  coverage: FieldCoverage,
  /** M39: the Ultra ground material, when the world is Ultra. Absent, the ordinary one. */
  ultraMaterial?: (appearance: MaterialAppearance) => THREE.MeshStandardMaterial,
): {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  triangles: number;
} {
  const { cell, columns, rows, minX, minZ } = coverage;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const y = plan.surround.height;

  const tint: GroundTint = { r: 1, g: 1, b: 1 };
  const albedo: GroundTint = { r: 1, g: 1, b: 1 };
  linearFromSrgbHex(appearance.albedo, albedo);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!coverage.patch(column, row)) continue;
      const x0 = minX + column * cell;
      const z0 = minZ + row * cell;
      // Offset the patch indices so the field's per-patch layer does not line
      // up with the course's, which at a whole-number ratio of cell sizes would
      // read as one pattern in two scales rather than as two kinds of ground.
      // The smooth layers need no offset — they are world-locked and run at
      // `FIELD_MOTTLE`'s far longer wavelengths, which is what keeps the
      // boundary reading as open ground meeting managed ground.
      groundTint(
        column + 7919,
        row + 104_729,
        x0 + cell * 0.5,
        z0 + cell * 0.5,
        appearance.mottle,
        albedo,
        FIELD_MOTTLE,
        tint,
      );
      const first = positions.length / 3;

      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        positions.push(x0 + dx * cell, y, z0 + dz * cell);
        normals.push(0, 1, 0);
        colors.push(tint.r, tint.g, tint.b);
      }
      indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = ultraMaterial === undefined ? standardMaterial(appearance, true) : ultraMaterial(appearance);
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'level-field';

  return { mesh, geometry, material, triangles: indices.length / 3 };
}

/** An `ultraAo` value as the normalized byte it is stored in, rounded up so it never falls below the floor. */
function aoByte(value: number): number {
  return Math.min(255, Math.max(0, Math.ceil(value * 255 - 1e-6)));
}

/**
 * The heightfield's Ultra attributes — M39 T5 and T6 (`docs/M39_ULTRA.md` §4;
 * the edge field as revised in the pre-R1 ground pass, §U2).
 *
 * Built after the ordinary mesh and from it: the drawn cells in draw order,
 * four unshared vertices each (`pushCorner`'s a, b, c, d = the cell's
 * (0,0), (1,0), (0,1), (1,1) corners), and the ordinary `color` array the
 * fill reads its source tiles' tones from.
 *
 * - **`ultraAo`** — one contact-AO value per heightfield *sample*, memoised,
 *   so the up-to-four vertices standing on a shared corner are handed the
 *   same number and agree to the bit. Each sample speaks for the one-metre
 *   square around it (`contactOcclusion`'s footprint).
 * - **`ultraEdge`, `ultraFillTint`, `ultraFillKind`** (when `edgeFill`) —
 *   each filled cell's signed distance to its one or two fill lines at each
 *   of its corners (in cells; a line is affine, so the patch's per-fragment
 *   value is exact), the multiplier that turns this cell's own colour into
 *   its source tile's (`fillTint`, decoded exactly as three decodes the
 *   material colours), and the filling surface's detail kind with the
 *   lines' mode in bit 3 (8 = intersection).
 *
 * Packing (`ULTRA_GROUND_ATTRIBUTES` states it for the patch): Uint8 for the
 * AO and the kind, half floats for the edge pair and the tone — twelve bytes
 * a vertex, about 5.2 MB on the town's 109 k cells, inside §5's 8 MiB line.
 */
function heightfieldAttributes(
  plan: LevelPlan,
  cellsBySurface: ReadonlyMap<string, number[]>,
  colors: readonly number[],
  contact: ContactField,
  edgeFill: boolean,
): {
  attributes: [string, THREE.BufferAttribute][];
  bytes: number;
  fillLines: number;
  filledCells: number;
} {
  const field = plan.heightfield;
  const cellColumns = field.columns - 1;
  let vertexCount = 0;
  for (const cells of cellsBySurface.values()) vertexCount += cells.length * 4;

  const perSample = new Float32Array(field.columns * field.rows).fill(-1);
  const sampleAo = (column: number, row: number): number => {
    const sample = row * field.columns + column;
    if (perSample[sample] < 0) {
      perSample[sample] = contact(
        field.originX + column * field.spacing,
        field.originZ + row * field.spacing,
        field.spacing,
      );
    }
    return perSample[sample];
  };
  const ao = new Uint8Array(vertexCount);
  let vertex = 0;
  for (const cells of cellsBySurface.values()) {
    for (const cell of cells) {
      const row = Math.floor(cell / cellColumns);
      const column = cell - row * cellColumns;
      ao[vertex] = aoByte(sampleAo(column, row));
      ao[vertex + 1] = aoByte(sampleAo(column + 1, row));
      ao[vertex + 2] = aoByte(sampleAo(column, row + 1));
      ao[vertex + 3] = aoByte(sampleAo(column + 1, row + 1));
      vertex += 4;
    }
  }
  const attributes: [string, THREE.BufferAttribute][] = [
    [ULTRA_GROUND_ATTRIBUTES.ao, new THREE.Uint8BufferAttribute(ao, 1, true)],
  ];
  let bytes = ao.byteLength;

  let fillLines = 0;
  let filledCells = 0;
  if (edgeFill) {
    const fill = edgeFillFor(plan, cellsBySurface);
    fillLines = fill.lines;
    filledCells = fill.cells.size;

    // Where each drawn cell's four vertices start, so a source tile's tone
    // can be read straight out of the ordinary colour array.
    const firstVertex = new Int32Array(cellColumns * (field.rows - 1)).fill(-1);
    let next = 0;
    for (const cells of cellsBySurface.values()) {
      for (const cell of cells) {
        firstVertex[cell] = next;
        next += 4;
      }
    }

    // Each surface's albedo in the linear values three itself decodes the
    // material colour to, so `own × tint` lands on `toward × tone` exactly.
    const linear = new Map<SurfaceId, THREE.Color>();
    const linearOf = (surface: SurfaceId): THREE.Color => {
      let colour = linear.get(surface);
      if (colour === undefined) {
        const material = SURFACES[surface]?.material ?? 'pavement';
        colour = new THREE.Color(paintedAppearance(material, plan.palette).albedo);
        linear.set(surface, colour);
      }
      return colour;
    };

    const none = THREE.DataUtils.toHalfFloat(ULTRA_GROUND.edge.sentinel);
    const edge = new Uint16Array(vertexCount * 2).fill(none);
    const tone = new Uint16Array(vertexCount * 3).fill(THREE.DataUtils.toHalfFloat(1));
    const kind = new Uint8Array(vertexCount);
    const tint = { r: 1, g: 1, b: 1 };
    const sourceTone = { r: 1, g: 1, b: 1 };
    const ownTone = { r: 1, g: 1, b: 1 };
    for (const [cell, filled] of fill.cells) {
      const first = firstVertex[cell];
      if (first < 0) continue;
      const row = Math.floor(cell / cellColumns);
      const column = cell - row * cellColumns;
      const from = firstVertex[filled.source] * 3;
      sourceTone.r = colors[from];
      sourceTone.g = colors[from + 1];
      sourceTone.b = colors[from + 2];
      ownTone.r = colors[first * 3];
      ownTone.g = colors[first * 3 + 1];
      ownTone.b = colors[first * 3 + 2];
      fillTint(linearOf(field.surfaces[cell]), ownTone, linearOf(filled.towards), sourceTone, tint);
      const r = THREE.DataUtils.toHalfFloat(tint.r);
      const g = THREE.DataUtils.toHalfFloat(tint.g);
      const b = THREE.DataUtils.toHalfFloat(tint.b);
      // Bits 0–2 the filling surface's detail kind, bit 3 the lines' mode
      // (intersection), bit 4 a drivable chain's rounded knee (A18).
      const kindByte = groundDetailKind(SURFACES[filled.towards].material)
        + (filled.mode === 'intersection' && filled.lines.length > 1 ? 8 : 0)
        + (filled.round === true ? 16 : 0);
      // a (0,0), b (1,0), c (0,1), d (1,1) — `pushCorner`'s order.
      for (let corner = 0; corner < 4; corner += 1) {
        const at = first + corner;
        const gx = column + (corner & 1);
        const gz = row + (corner >> 1);
        for (let index = 0; index < filled.lines.length && index < 2; index += 1) {
          edge[at * 2 + index] = THREE.DataUtils.toHalfFloat(edgeSignedDistance(filled.lines[index], gx, gz));
        }
        tone[at * 3] = r;
        tone[at * 3 + 1] = g;
        tone[at * 3 + 2] = b;
        kind[at] = kindByte;
      }
    }
    attributes.push(
      [ULTRA_GROUND_ATTRIBUTES.edge, new THREE.Float16BufferAttribute(edge, 2)],
      [ULTRA_GROUND_ATTRIBUTES.fillTint, new THREE.Float16BufferAttribute(tone, 3)],
      [ULTRA_GROUND_ATTRIBUTES.fillKind, new THREE.Uint8BufferAttribute(kind, 1, false)],
    );
    bytes += edge.byteLength + tone.byteLength + kind.byteLength;
  }

  return { attributes, bytes, fillLines, filledCells };
}

/**
 * The surfaces the smoothed-slopes option smooths: turf — the banks and
 * verges that read as facets. The road, the riding dirt and gravel, the
 * decks, the brick bands and the spill keep their normals exactly, and so
 * does every vertex that shares a corner with one of them.
 */
const SMOOTH_ONLY: ReadonlySet<string> = new Set(['grass']);

/**
 * The smoothed-slopes option (M39 pre-R1 ground pass): overwrite `normals`
 * (the heightfield's, in `pushCorner` order) with `smoothSampleNormals` of
 * the same per-sample normals `vertexNormal` gives, turf only — every
 * vertex touching any other surface held exactly. Returns how many vertices
 * changed.
 */
function smoothHeightfieldNormals(
  field: Heightfield,
  cellsBySurface: ReadonlyMap<string, number[]>,
  normals: number[],
): number {
  const cellColumns = field.columns - 1;
  const count = field.columns * field.rows;
  // The samples the drawn turf reads, and the per-sample normals within the
  // smoothing's reach of them — the rest of the lattice is never asked.
  const wanted = new Uint8Array(count);
  for (const [surface, cells] of cellsBySurface) {
    if (!SMOOTH_ONLY.has(surface)) continue;
    for (const cell of cells) {
      const row = Math.floor(cell / cellColumns);
      const column = cell - row * cellColumns;
      for (let corner = 0; corner < 4; corner += 1) wanted[(row + (corner >> 1)) * field.columns + column + (corner & 1)] = 1;
    }
  }
  const reach = Math.ceil(ULTRA_GROUND.smoothNormals.radiusCells);
  const samples = new Float32Array(count * 3);
  const computed = new Uint8Array(count);
  const normal = new THREE.Vector3();
  for (let sample = 0; sample < count; sample += 1) {
    if (wanted[sample] !== 1) continue;
    const row = Math.floor(sample / field.columns);
    const column = sample - row * field.columns;
    for (let dr = -reach; dr <= reach; dr += 1) {
      const r = Math.min(field.rows - 1, Math.max(0, row + dr));
      for (let dc = -reach; dc <= reach; dc += 1) {
        const c = Math.min(field.columns - 1, Math.max(0, column + dc));
        const at = r * field.columns + c;
        if (computed[at] === 1) continue;
        computed[at] = 1;
        vertexNormal(field, c, r, normal);
        samples[at * 3] = normal.x;
        samples[at * 3 + 1] = normal.y;
        samples[at * 3 + 2] = normal.z;
      }
    }
  }
  const smoothed = smoothSampleNormals(
    field.columns,
    field.rows,
    samples,
    (cell) => !SMOOTH_ONLY.has(field.surfaces[cell]),
    ULTRA_GROUND.smoothNormals.radiusCells,
    ULTRA_GROUND.smoothNormals.rampCells,
    wanted,
  );
  let vertex = 0;
  let changed = 0;
  for (const cells of cellsBySurface.values()) {
    for (const cell of cells) {
      const row = Math.floor(cell / cellColumns);
      const column = cell - row * cellColumns;
      for (let corner = 0; corner < 4; corner += 1) {
        const index = (row + (corner >> 1)) * field.columns + column + (corner & 1);
        const sample = index * 3;
        const at = vertex * 3;
        if (wanted[index] !== 1) {
          // No turf reads this corner: its normal is the ordinary one, untouched.
          vertex += 1;
          continue;
        }
        if (normals[at] !== smoothed[sample] || normals[at + 1] !== smoothed[sample + 1] || normals[at + 2] !== smoothed[sample + 2]) {
          const moved = Math.abs(normals[at] - smoothed[sample]) + Math.abs(normals[at + 1] - smoothed[sample + 1])
            + Math.abs(normals[at + 2] - smoothed[sample + 2]);
          if (moved > 1e-6) changed += 1;
        }
        normals[at] = smoothed[sample];
        normals[at + 1] = smoothed[sample + 1];
        normals[at + 2] = smoothed[sample + 2];
        vertex += 1;
      }
    }
  }
  return changed;
}

/**
 * M39 T9's options for one Ultra block (`render/ultra/ultraBlocks.ts`): the
 * material the face division reads, and where each pushed vertex's base AO
 * goes. Absent on every ordinary world, which draws exactly what it drew.
 */
interface UltraBoxOptions {
  readonly material: MaterialId;
  readonly ao: number[];
}

/**
 * Append one yawed box to a shared buffer.
 *
 * Built as real triangles at their true metric size rather than as an
 * instance-scaled unit cube, which master §9.3 names as the trap: an instance
 * matrix that stretches a cube stretches everything about it, and merged
 * geometry keeps every block in one draw call anyway.
 *
 * **Ultra (M39 T9) divides vertical faces only**, and only by fractions of
 * the face itself (`ultraFaceDivision`): planks on tall wood, one split at the
 * base-AO line elsewhere, the enhanced bond on coursed stone, nothing on
 * concrete or signal red. The top, the underside and every face's top edge
 * are emitted by the same arithmetic as before, so a block's top and lip are
 * the same floats on every recipe and every new vertex lies on the box.
 */
function appendBox(
  collider: BoxCollider,
  positions: number[],
  normals: number[],
  colours: number[],
  indices: number[],
  coursed: boolean,
  ultra?: UltraBoxOptions,
): void {
  const { centre, halfExtents } = collider;
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);

  // Local axes, yawed into the world. A yaw of h maps local +Z onto the
  // heading and local +X onto the rider's left (`level/segments.ts`).
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => ([
    centre.x + cos * lx + sin * lz,
    centre.y + ly,
    centre.z - sin * lx + cos * lz,
  ]);

  const faces: { normal: [number, number, number]; corners: [number, number, number][] }[] = [
    { normal: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
    { normal: [0, -1, 0], corners: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
    { normal: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
    { normal: [-1, 0, 0], corners: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
    { normal: [0, 0, 1], corners: [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]] },
    { normal: [0, 0, -1], corners: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] },
  ];

  for (const face of faces) {
    const [nx, ny, nz] = face.normal;
    const worldNormalX = cos * nx + sin * nz;
    const worldNormalZ = -sin * nx + cos * nz;

    // Every vertical face lists its corners as [origin, origin+up,
    // origin+up+along, origin+along], so a sub-quad at fractions (s0..s1) of
    // the run and (t0..t1) of the height keeps exactly the face's winding.
    const emit = (s0: number, s1: number, t0: number, t1: number, tone: number): void => {
      const base = positions.length / 3;
      const [c0, c1, , c3] = face.corners;
      const along = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];
      const up = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
      const at = (s: number, t: number): [number, number, number] => toWorld(
        (c0[0] + along[0] * s + up[0] * t) * halfExtents.x,
        (c0[1] + along[1] * s + up[1] * t) * halfExtents.y,
        (c0[2] + along[2] * s + up[2] * t) * halfExtents.z,
      );
      for (const [wx, wy, wz] of [at(s0, t0), at(s0, t1), at(s1, t1), at(s1, t0)]) {
        positions.push(wx, wy, wz);
        normals.push(worldNormalX, ny, worldNormalZ);
        colours.push(tone, tone, tone);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      if (ultra !== undefined) {
        // On a vertical face `t` runs from the underside (0) to the top (1),
        // so `t × height` is the vertex's height above the box's foot.
        const faceHeight = halfExtents.y * 2;
        const foot = ny === 0 ? blockBaseAo(t0 * faceHeight, faceHeight) : 1;
        const head = ny === 0 ? blockBaseAo(t1 * faceHeight, faceHeight) : 1;
        ultra.ao.push(foot, head, head, foot);
      }
    };

    if (ultra !== undefined && ny === 0) {
      const division = ultraFaceDivision(
        collider,
        ultra.material,
        nx !== 0 ? halfExtents.z * 2 : halfExtents.x * 2,
      );
      if (division.kind === 'planks') {
        // Keyed on the face's own midpoint, so two faces of a deck differ.
        const [faceX, , faceZ] = toWorld(nx * halfExtents.x, 0, nz * halfExtents.z);
        for (let row = 0; row < division.rows; row += 1) {
          emit(0, 1, row / division.rows, (row + 1) / division.rows, plankTone(faceX, faceZ, row));
        }
        continue;
      }
      if (division.kind === 'split') {
        emit(0, 1, 0, division.at, 1);
        emit(0, 1, division.at, 1, 1);
        continue;
      }
      // 'single' and 'coursed' are exactly what the lines below draw.
    }

    if (!coursed || ny !== 0) {
      emit(0, 1, 0, 1, 1);
      continue;
    }

    // A running bond across the face: rows of the grid's height, odd rows
    // offset by half a stone so the joints do not line up (`render/wallCourses.ts`).
    const width = nx !== 0 ? halfExtents.z * 2 : halfExtents.x * 2;
    const grid = wallFaceGrid(width, halfExtents.y * 2);
    if (grid.rows === 1 && grid.columns === 1) {
      emit(0, 1, 0, 1, 1);
      continue;
    }
    for (let row = 0; row < grid.rows; row += 1) {
      const t0 = row / grid.rows;
      const t1 = (row + 1) / grid.rows;
      const offset = row % 2 === 1 ? 0.5 / grid.columns : 0;
      let s0 = 0;
      let s1 = offset > 0 ? offset : 1 / grid.columns;
      while (s0 < 1 - 1e-9) {
        const [cx, , cz] = toWorld(0, 0, 0);
        const mid = (s0 + s1) / 2;
        // The stone's own centre, for a tone that belongs to it and not to the wall.
        const [mx, , mz] = (() => {
          const [c0, , , c3] = face.corners;
          return toWorld(
            (c0[0] + (c3[0] - c0[0]) * mid) * halfExtents.x,
            0,
            (c0[2] + (c3[2] - c0[2]) * mid) * halfExtents.z,
          );
        })();
        emit(s0, s1, t0, t1, stoneTone(mx - cx + cx, mz - cz + cz, row));
        s0 = s1;
        s1 = Math.min(1, s1 + 1 / grid.columns);
      }
    }
  }
}
