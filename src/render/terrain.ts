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
  /** Re-centre the surround plane on the rider. Called once per frame. */
  setSurroundCentre(x: number, z: number): void;
  dispose(): void;
}

function sampleHeight(field: Heightfield, column: number, row: number): number {
  return field.heights[row * field.columns + column];
}

/**
 * Every surface's encroachment and decoded albedo, resolved once.
 *
 * The edge blend asks four questions per drawn cell and the slice draws
 * forty-three thousand of them, so decoding an sRGB hex inside that loop would
 * be a hundred and seventy thousand `Math.pow` calls at every level build.
 */
function surfaceLookup(): Map<SurfaceId, { encroach: number; linear: GroundTint }> {
  const lookup = new Map<SurfaceId, { encroach: number; linear: GroundTint }>();
  for (const id of Object.keys(SURFACES) as SurfaceId[]) {
    const appearance = materialAppearance(SURFACES[id].material);
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

export function createTerrain(plan: LevelPlan): TerrainView {
  const group = new THREE.Group();
  group.name = 'level-terrain';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const field = plan.heightfield;
  const surroundAppearance = materialAppearance(SURFACES[plan.surround.surface].material);

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
  const fieldMesh = createSurroundField(plan, surroundAppearance, coverage);
  group.add(fieldMesh.mesh);
  geometries.push(fieldMesh.geometry);
  materials.push(fieldMesh.material);

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
  const surfaceLook = surfaceLookup();

  for (const [surface, cells] of cellsBySurface) {
    const appearance = materialAppearance(
      SURFACES[surface as keyof typeof SURFACES]?.material ?? 'pavement',
    );
    // The material's linear albedo, which the saturation layer needs so a
    // desaturated patch moves toward *this* surface's grey.
    linearFromSrgbHex(appearance.albedo, base);
    const own = surfaceLook.get(surface as SurfaceId);
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
      for (let side = 0; side < 4; side += 1) {
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

    terrainMaterials.push(standardMaterial(appearance, true));
  }

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
    const appearance = materialAppearance(id);
    const boxPositions: number[] = [];
    const boxNormals: number[] = [];
    const boxIndices: number[] = [];

    for (const collider of colliders) {
      appendBox(collider, boxPositions, boxNormals, boxIndices);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(boxPositions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(boxNormals, 3));
    geometry.setIndex(boxIndices);
    geometry.computeBoundingSphere();

    const material = standardMaterial(appearance, false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `level-blocks-${id}`;
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
  const props = createProps(plan);
  group.add(props.group);

  // M7.5 stage 4's paint. Render-only on exactly the same terms as the props
  // above, built and freed with the terrain for exactly the same reason, and
  // needing no second world description from this file: the renderer samples
  // each finished ribbon edge from the plan's own heightfield.
  const markings = createMarkings(plan);
  group.add(markings.group);

  // M13 Phase 2's potholes, on exactly the terms the paint above is held to and
  // for the same reasons: built from `plan.hazards` alone, owning their own
  // geometry and material, freed with the terrain, and answering no gameplay
  // question — `simulation/hazards.ts` reads the same array for that. A spill
  // is absent from this call by construction, because a spill is a surface and
  // was drawn by the heightfield above.
  const hazards = createHazards(plan);
  group.add(hazards.group);

  return {
    group,
    cellsDrawn,
    markings,
    hazards,
    triangles: indices.length / 3 + colliderTriangles + fieldMesh.triangles + 2
      + props.triangles + markings.triangles + hazards.triangles,

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

  const material = standardMaterial(appearance, true);
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'level-field';

  return { mesh, geometry, material, triangles: indices.length / 3 };
}

/**
 * Append one yawed box to a shared buffer.
 *
 * Built as real triangles at their true metric size rather than as an
 * instance-scaled unit cube, which master §9.3 names as the trap: an instance
 * matrix that stretches a cube stretches everything about it, and merged
 * geometry keeps every block in one draw call anyway.
 */
function appendBox(
  collider: BoxCollider,
  positions: number[],
  normals: number[],
  indices: number[],
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
    const base = positions.length / 3;
    const [nx, ny, nz] = face.normal;
    const worldNormalX = cos * nx + sin * nz;
    const worldNormalZ = -sin * nx + cos * nz;

    for (const [sx, sy, sz] of face.corners) {
      const [wx, wy, wz] = toWorld(
        sx * halfExtents.x,
        sy * halfExtents.y,
        sz * halfExtents.z,
      );
      positions.push(wx, wy, wz);
      normals.push(worldNormalX, ny, worldNormalZ);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
