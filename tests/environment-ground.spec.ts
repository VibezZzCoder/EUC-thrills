/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Ground refinement verification, 2026-10-01. Run in the exclusive browser
 * lane after the coordinator freezes the source tree and records inputs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { BufferAttribute, Material, Mesh, MeshStandardMaterial, Texture } from 'three';
import type { TerrainView } from '../src/render/terrain.ts';
import type { EdgeFillCell } from '../src/render/groundBoundary.ts';
import type { LevelId } from '../src/level/levels.ts';
import type { QualityLevel } from '../src/app/options.ts';
import type { GroundSample } from '../src/simulation/world.ts';
import type { LevelPlan } from '../src/level/plan.ts';
import { bootAtTier, collectErrors } from './harness.ts';

type LevelPlanLike = LevelPlan;

const shots = process.env.ENVIRONMENT_GROUND_SHOTS ?? 'test-results/environment-upgrade/ground-r4';
type Subject = 'diagonal-street' | 'trail-grass' | 'brick-edge' | 'dense-forecourt';
interface WorldCase { name: string; level: LevelId; seed: string; query: string; subjects: Subject[] }
const worlds: WorldCase[] = [
  { name: 'euc', level: 'generated', seed: 'euc', query: 'level=generated&seed=euc',
    subjects: ['diagonal-street', 'trail-grass', 'brick-edge', 'dense-forecourt'] },
  { name: 'corner', level: 'generated', seed: 'corner', query: 'level=generated&seed=corner',
    subjects: ['diagonal-street', 'trail-grass'] },
  { name: 'switchback', level: 'switchback', seed: '', query: 'level=switchback',
    subjects: ['trail-grass'] },
];
interface DisposeRecord {
  owner: { uuid: string; addEventListener(type: 'dispose', listener: () => void): void;
    removeEventListener(type: 'dispose', listener: () => void): void };
  kind: string; calls: number; listener: () => void;
}
interface RestoreReport {
  restored: boolean; frameUnchanged: boolean; otherObjectsUnchanged: boolean;
  restoredChangedPixels: number; controlsChangedPixels: number; changedPixels: number;
  resourcesUnchanged: boolean; owners: { kind: string; uuid: string; disposeCalls: number }[];
  glErrors: number[];
}
declare global {
  interface Window {
    environmentGroundReference?: { restore(): RestoreReport };
    environmentGroundDisposal?: { mesh: Mesh; records: DisposeRecord[] };
    environmentGroundContext?: { extension: WEBGL_lose_context; restored: number[] | null };
  }
}

/** No plan edits: route views use canonical points, while the explicit brick
 * diagnostic targets an original brick-edge cell from a clear nearby original
 * route point. Cell, route, placement and projection facts reach the manifest.
 */
async function place(page: Page, subject: Subject) {
  return page.evaluate(async subject => {
    const surfacesPath = '/src/data/surfaces.ts';
    const { SURFACES } = await import(surfacesPath);
    const game = window.game, plan = game.levelPlan, field = plan.heightfield;
    game.loop.setRunning(false); game.setActions({ throttle: 0, steer: 0 });
    const columns = field.columns - 1, rows = field.rows - 1;
    const surfaceAt = (x: number, z: number): string => {
      const c = Math.floor((x - field.originX) / field.spacing), r = Math.floor((z - field.originZ) / field.spacing);
      return c < 0 || r < 0 || c >= columns || r >= rows ? plan.surround.surface : field.surfaces[r * columns + c];
    };
    const materialAt = (x: number, z: number): string => SURFACES[surfaceAt(x, z)]?.material ?? '';
    const desired = subject === 'trail-grass' ? ['dirt', 'gravel'] : subject === 'brick-edge' ? ['brick']
      : ['pavement', 'roughPavement'];
    const route: { id: string; index: number; x: number; z: number; heading: number; score: number;
      material: string; left: string; right: string; neighbours: number; density: number }[] = [];
    const canonicalRoute: { id: string; index: number; x: number; z: number; heading: number }[] = [];
    for (const segment of plan.segments) {
      const points = window.qa.routePoints([segment.id], Math.max(field.spacing, 2));
      for (let i = 2; i < points.length - 2; i += 2) {
        const point = points[i], ahead = points[i + 1], heading = Math.atan2(ahead.x - point.x, ahead.z - point.z);
        canonicalRoute.push({ id: segment.id, index: i, x: point.x, z: point.z, heading });
        const own = materialAt(point.x, point.z);
        if (!desired.includes(own)) continue;
        const sideways = { x: Math.cos(heading), z: -Math.sin(heading) };
        let left = '', right = '', neighbours = 0;
        for (const offset of [3, 5, 7, 9]) {
          left = materialAt(point.x + sideways.x * offset, point.z + sideways.z * offset);
          right = materialAt(point.x - sideways.x * offset, point.z - sideways.z * offset);
          neighbours += Number(left !== own) + Number(right !== own);
          if ((subject === 'trail-grass' && (left === 'grass' || right === 'grass'))
            || (subject === 'brick-edge' && (left !== 'brick' || right !== 'brick'))) break;
        }
        if (neighbours === 0) continue;
        if (subject === 'trail-grass' && left !== 'grass' && right !== 'grass') continue;
        const diagonal = Math.abs(Math.sin(heading) * Math.cos(heading));
        if (subject === 'diagonal-street' && diagonal < 0.12) continue;
        const density = (plan.props ?? []).filter(prop => Math.hypot(prop.position.x - point.x, prop.position.z - point.z) < 22).length;
        const patches = (plan.groundSurfacePatches ?? []).filter(patch => patch.triangles.some(triangle => {
          const vertex = triangle.vertices[0]; return Math.hypot(vertex.x - point.x, vertex.z - point.z) < 16;
        })).length;
        // A dense forecourt must really be near original precise paving; do
        // not silently rename an arbitrary road capture as a forecourt.
        if (subject === 'dense-forecourt' && patches === 0) continue;
        route.push({ id: segment.id, index: i, x: point.x, z: point.z, heading, material: own, left, right,
          neighbours, density, score: subject === 'dense-forecourt' ? patches * 100 + density
            : diagonal * 100 + neighbours * 4 + Math.min(density, 10) });
      }
    }
    if (subject === 'brick-edge') {
      const builderPath = '/src/level/buildPlan.ts', { fieldHeightAt } = await import(builderPath);
      const obstacles = [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])];
      const patchCells = new Set((plan.groundSurfacePatches ?? []).flatMap(patch => patch.triangles.map(triangle => triangle.cell)));
      const clearanceAt = (x: number, z: number): number => obstacles.reduce((minimum, box) => {
        const dx = x - box.centre.x, dz = z - box.centre.z, c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
        const localX = c * dx - s * dz, localZ = s * dx + c * dz;
        return Math.min(minimum, Math.hypot(Math.max(0, Math.abs(localX) - box.halfExtents.x),
          Math.max(0, Math.abs(localZ) - box.halfExtents.z)));
      }, Infinity);
      const clearRoute = canonicalRoute.flatMap(point => {
        const ground = game.sampleGround(point.x, point.z);
        const fieldHeight = fieldHeightAt(field, plan.surround, point.x, point.z) as number;
        const obstacleClearance = clearanceAt(point.x, point.z);
        const hazardClearance = (plan.hazards ?? []).reduce((minimum, hazard) => Math.min(minimum,
          Math.hypot(point.x - hazard.centre.x, point.z - hazard.centre.z) - hazard.radius), Infinity);
        if (ground.offCourse || Math.abs(ground.height - fieldHeight) > 1e-7 || ground.normal.y < 0.95
          || obstacleClearance < 0.8 || hazardClearance < 1.5) return [];
        return [{ ...point, ground, fieldHeight, obstacleClearance, hazardClearance }];
      });
      const candidates: { cell: number; neighbour: number; column: number; row: number; dx: number; dz: number;
        x: number; z: number; surface: string; neighbourSurface: string; heading: number; gap: number; score: number;
        route: typeof clearRoute[number] }[] = [];
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const cell = row * columns + column, surface = field.surfaces[cell];
        if (SURFACES[surface]?.material !== 'brick') continue;
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nc = column + dx, nr = row + dz;
          if (nc < 0 || nr < 0 || nc >= columns || nr >= rows) continue;
          const neighbour = nr * columns + nc, neighbourSurface = field.surfaces[neighbour];
          const neighbourMaterial = SURFACES[neighbourSurface]?.material;
          if (!['grass', 'pavement', 'roughPavement', 'dirt', 'gravel'].includes(neighbourMaterial)) continue;
          const x = field.originX + (column + 0.5 + dx * 0.5) * field.spacing;
          const z = field.originZ + (row + 0.5 + dz * 0.5) * field.spacing;
          for (const point of clearRoute) {
            const gap = Math.hypot(point.x - x, point.z - z);
            if (gap < 5 || gap > 12) continue;
            const heading = Math.atan2(x - point.x, z - point.z);
            const cameraClearance = clearanceAt(point.x - Math.sin(heading) * 8, point.z - Math.cos(heading) * 8);
            if (cameraClearance < 0.8) continue;
            candidates.push({ cell, neighbour, column, row, dx, dz, x, z, surface, neighbourSurface, heading, gap,
              route: point, score: Number(neighbourMaterial === 'grass') * 1000
                + Math.abs(Math.sin(heading) * Math.cos(heading)) * 100 - Math.abs(gap - 7) * 4 });
          }
        }
      }
      candidates.sort((a, b) => b.score - a.score || a.cell - b.cell || a.neighbour - b.neighbour
        || a.route.id.localeCompare(b.route.id) || a.route.index - b.route.index);
      for (const candidate of candidates.slice(0, 24)) {
        window.qa.placeRider(candidate.route.x, candidate.route.z, candidate.heading); game.advance(0);
        const snap = game.snapshot(), boundaryHeight = fieldHeightAt(field, plan.surround, candidate.x, candidate.z) as number;
        const projection = window.qa.projectPoint(candidate.x, boundaryHeight, candidate.z);
        if (!projection.inFront || Math.abs(projection.x) > 0.85 || Math.abs(projection.y) > 0.8) continue;
        if (snap.camera.mode !== 'chase' || snap.camera.scriptedOcclusion || snap.loop.running) {
          throw new Error('A frozen production chase viewpoint is required for the brick-cell diagnostic');
        }
        return { label: 'Explicit brick-cell diagnostic QA placement; ordinary chase camera; not normal-spawn or continuous-ride evidence',
          subject, selection: { kind: 'original-brick-edge-cell', cell: candidate.cell, column: candidate.column, row: candidate.row,
            surface: candidate.surface, neighbourCell: candidate.neighbour, neighbourSurface: candidate.neighbourSurface,
            neighbourDirection: { x: candidate.dx, z: candidate.dz },
            boundary: { x: candidate.x, y: boundaryHeight, z: candidate.z },
            precisePatchCells: { target: patchCells.has(candidate.cell), neighbour: patchCells.has(candidate.neighbour) },
            originalRoutePoint: { segment: candidate.route.id, pointIndex: candidate.route.index,
              x: candidate.route.x, z: candidate.route.z, routeHeading: candidate.route.heading },
            placement: { x: candidate.route.x, y: candidate.route.ground.height, z: candidate.route.z, heading: candidate.heading,
              surface: candidate.route.ground.surface, normal: candidate.route.ground.normal, fieldHeight: candidate.route.fieldHeight,
              obstacleClearanceMetres: Number.isFinite(candidate.route.obstacleClearance) ? candidate.route.obstacleClearance : null,
              hazardClearanceMetres: Number.isFinite(candidate.route.hazardClearance) ? candidate.route.hazardClearance : null,
              originalObstacleCount: obstacles.length, boundaryDistanceMetres: candidate.gap } },
          spacing: field.spacing, world: plan.id, rider: snap.euc, camera: snap.camera,
          actualCamera: window.qa.cameraTransform(), tick: snap.tick, boundaryProjection: projection };
      }
      throw new Error(`No visible original brick-edge cell with a clear nearby original route placement in ${plan.id}; capture is unmeasured`);
    }
    route.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id) || a.index - b.index);
    const selected = route[0];
    if (!selected) throw new Error(`No canonical ${subject} viewpoint in ${plan.id}; capture is unmeasured`);
    // This is a diagnostic QA placement using the production chase camera.
    // There is no fabricated terrain, pose editing or scripted occlusion.
    window.qa.placeRider(selected.x, selected.z, selected.heading);
    game.advance(0);
    const snap = game.snapshot();
    if (snap.camera.mode !== 'chase' || snap.camera.scriptedOcclusion || snap.loop.running) {
      throw new Error('A frozen ordinary chase viewpoint is required');
    }
    const point = { x: selected.x + Math.sin(selected.heading) * 7, z: selected.z + Math.cos(selected.heading) * 7 };
    return { label: 'QA placement; ordinary chase camera; not normal-spawn or continuous-ride evidence',
      subject, selection: selected, spacing: field.spacing, world: plan.id,
      rider: snap.euc, camera: snap.camera, actualCamera: window.qa.cameraTransform(), tick: snap.tick,
      boundaryProjection: window.qa.projectPoint(point.x, game.sampleGround(point.x, point.z).height, point.z) };
  }, subject);
}

/** Inspect the actual installed mesh, compiled GL programs and sampler. The
 * fill arithmetic is independently regenerated from actual position order;
 * decoded runtime attrs are checked against its source AND target exclusions.
 */
async function inspect(page: Page, world: WorldCase, label: string) {
  return page.evaluate(async ({ world, label }) => {
    const levelsPath = '/src/level/levels.ts', policyPath = '/src/render/groundBoundaryPolicy.ts';
    const boundaryPath = '/src/render/groundBoundary.ts', tuningPath = '/src/data/tuning.ts';
    const samplerPath = '/src/simulation/planSampler.ts', worldPath = '/src/simulation/world.ts';
    const ordinaryPath = '/src/render/ordinaryGroundBoundary.ts', surfacesPath = '/src/data/surfaces.ts';
    const livingPath = '/src/app/populationWorld.ts', contoursPath = '/src/render/sharedGroundContours.ts';
    const tintPath = '/src/render/sharedBoundaryTint.ts', codesPath = '/src/render/sharedGroundCodes.ts';
    const [{ createLevel }, policy, { edgeFillForGrid, edgeSignedDistance }, { GROUND_BOUNDARY },
      { PlanTerrainSampler }, { createGroundSample }, ordinary, { SURFACES }, { preparePopulationWorld },
      { withSharedGroundContours, sharedContourMask }, { createSharedBoundaryTint }, { sharedGroundCode }] = await Promise.all([
      import(levelsPath), import(policyPath), import(boundaryPath), import(tuningPath),
      import(samplerPath), import(worldPath), import(ordinaryPath), import(surfacesPath), import(livingPath),
      import(contoursPath), import(tintPath), import(codesPath),
    ]);
    const game = window.game, plan = game.levelPlan, snap = game.snapshot(), presentation = game.renderer.presentation();
    if (!presentation) throw new Error('No installed renderer presentation');
    // 2026-10-04: worlds install through the living-world preparation, which
    // intentionally appends props/solids/ground patches and names the plan with
    // a composition hash. `prepared` (the same preparation of a fresh builder
    // plan, in this engine, cached per page because it costs seconds) is the
    // identity, originals and sampler reference; `source` is the untouched
    // builder plan, kept for its builder id.
    const cache = ((window as unknown as { groundSources?: Map<string, { source: LevelPlanLike; prepared: LevelPlanLike }> })
      .groundSources ??= new Map());
    const key = `${world.level}/${world.seed}`;
    let fresh = cache.get(key);
    if (!fresh) {
      const built = createLevel(world.level, world.seed);
      fresh = { source: built, prepared: preparePopulationWorld(built).level }; cache.set(key, fresh);
    }
    const source = fresh.source as typeof plan, prepared = fresh.prepared as typeof plan;
    const independentSampler = new PlanTerrainSampler(plan);
    const digest = (value: unknown) => {
      const text = JSON.stringify(value) ?? ''; let hash = 2166136261;
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const preserved = ['heightfield', 'surround', 'segments', 'props', 'solids', 'hazards', 'targets',
      'checkpoints', 'spawn', 'streetLoops', 'look', 'palette', 'lap'] as const;
    const originals = Object.fromEntries(preserved.map(key => [key, { same: JSON.stringify(prepared[key]) === JSON.stringify(plan[key]),
      source: digest(prepared[key]), installed: digest(plan[key]) }]));
    // 2026-10-04: terrain is spatially batched into 256 m tiles. Every tile is
    // a view of ONE source geometry: the very same attribute owners and one
    // material list, with its own index/groups. That shared owner is the one
    // installed heightfield; a second owner (or a tile with private
    // attributes) would still fail here.
    const found: Mesh[] = [];
    game.renderer.scene.traverse(object => { if (object.name === 'level-heightfield') found.push(object as Mesh); });
    if (found.length === 0) throw new Error('No installed heightfield owner');
    const mesh = found[0], geometry = mesh.geometry, position = geometry.getAttribute('position') as BufferAttribute;
    const attributeOwners = new Set(found.map(tile => tile.geometry.getAttribute('position')));
    // Mesh.clone copies a material array (same material objects, new array).
    const materialsOf = (tile: Mesh) => Array.isArray(tile.material) ? tile.material : [tile.material];
    const sharedTiles = found.every(tile => materialsOf(tile).length === materialsOf(mesh).length
      && materialsOf(tile).every((material, index) => material === materialsOf(mesh)[index]) && tile.castShadow === mesh.castShadow
      && tile.receiveShadow === mesh.receiveShadow && Object.keys(geometry.attributes).length === Object.keys(tile.geometry.attributes).length
      && Object.keys(geometry.attributes).every(name => tile.geometry.getAttribute(name) === geometry.getAttribute(name)));
    if (attributeOwners.size !== 1 || !sharedTiles) throw new Error(`Expected one installed heightfield owner, got ${attributeOwners.size} across ${found.length} tiles`);
    const field = plan.heightfield, columns = field.columns - 1;
    // The admitted shared-edge assembly appends band vertices after the
    // authoritative source quads (4 per drawn cell, in drawn order); only that
    // source range carries the per-cell layout read below.
    const sourceVertices = presentation.sharedEdges?.price.sourceVertices ?? position.count;
    const shared = presentation.sharedGround !== null;
    const attrs = ['groundBoundaryEdge', 'groundBoundaryTint', 'groundBoundaryMode'].map(name => {
      const a = geometry.getAttribute(name) as BufferAttribute | undefined;
      return { name, present: a !== undefined, count: a?.count ?? 0, itemSize: a?.itemSize ?? 0,
        bytes: a?.array.byteLength ?? 0, arrayType: a?.array.constructor.name ?? null,
        float16: (a as BufferAttribute & { isFloat16BufferAttribute?: boolean } | undefined)?.isFloat16BufferAttribute === true,
        normalized: a?.normalized ?? false };
    });
    const drawn = new Map<string, number[]>(), cellVertex = new Map<number, number>();
    let invalidPositions = 0;
    for (let at = 0; at < sourceVertices; at += 4) {
      const c = Math.round((position.getX(at) - field.originX) / field.spacing);
      const r = Math.round((position.getZ(at) - field.originZ) / field.spacing), cell = r * columns + c;
      const surface = field.surfaces[cell];
      if (c < 0 || r < 0 || c >= columns || r >= field.rows - 1 || !surface) invalidPositions++;
      const cells = drawn.get(surface) ?? []; cells.push(cell); drawn.set(surface, cells); cellVertex.set(cell, at);
    }
    const hazards = policy.groundHazardMask(plan), excluded = policy.groundPrecisePatchMask(plan, hazards);
    const patches = new Set<number>((plan.groundSurfacePatches ?? []).flatMap(patch => patch.triangles.map(triangle => triangle.cell)));
    const cap = policy.groundEdgeCapCells(field.spacing), drivableCap = Math.min(cap, policy.groundDrivableCapCells(field.spacing));
    const rawFill = edgeFillForGrid({ columns, rows: field.rows - 1, surfaces: field.surfaces }, drawn,
      policy.groundBoundaryPolicy(cap, drivableCap), excluded);
    // Ordinary's documented conservative guard differs from the unchanged
    // Ultra core only when a sparse future grid resolves a cap below 1/2 cell.
    // Reconstruct it here rather than treating the raw core as today's output.
    const cells = new Map<number, EdgeFillCell>(rawFill.cells);
    for (const [cell, claim] of cells) {
      const material = SURFACES[field.surfaces[cell]]?.material ?? 'pavement';
      const allowed = policy.GROUND_DRIVABLE_MATERIALS.has(material) ? rawFill.drivableCapCells : rawFill.capCells;
      if (claim.pocket === 'chamfer' && allowed < 0.5) cells.delete(cell);
    }
    const legacyFill = { ...rawFill, cells, lines: [...cells.values()].reduce((sum, claim) => sum + claim.lines.length, 0) };
    // 2026-10-04: the renderer draws the shared ground surface, whose ordinary
    // boundary is the legacy field joined into shared metre-scale contours
    // (scaled distances, shared material codes, per-corner shared tint). Its
    // exclusion is the shared contour mask (hazards and patches not drawn by
    // exact paving), a subset of the precise mask that still gates brick bits.
    const fill = shared ? withSharedGroundContours(plan, drawn, legacyFill) : legacyFill;
    const fillExcluded: Uint8Array = shared ? sharedContourMask(plan) : excluded;
    const sharedTint = shared ? createSharedBoundaryTint(plan) : null;
    const sharedTone = { r: 1, g: 1, b: 1 };
    let unsafeTargets = 0, unsafeSources = 0, excludedEncoded = 0, attrMismatches = 0, invalidAttrs = 0, sourceDiffuseMismatches = 0;
    let sharedTintMismatches = 0, maximumSharedTintError = 0;
    let eligibleBrickCells = 0, brickSourceFillCells = 0, excludedBrickCells = 0, materialFlagMismatches = 0;
    let maximumSourceDiffuseRelativeError = 0;
    const edge = geometry.getAttribute('groundBoundaryEdge') as BufferAttribute | undefined;
    const tint = geometry.getAttribute('groundBoundaryTint') as BufferAttribute | undefined;
    const mode = geometry.getAttribute('groundBoundaryMode') as BufferAttribute | undefined;
    const color = geometry.getAttribute('color') as BufferAttribute;
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Tiles keep the source's material indices. Recover each source vertex's
    // material from the tiles' own groups and require it to be its surface's
    // drawn-order material, exactly as the unbatched source groups were.
    const surfaceOrder = [...drawn.keys()];
    const vertexMaterial = new Int32Array(position.count).fill(-1);
    let materialConflicts = 0, outOfRangeIndices = 0, groupCoverageMismatches = 0;
    for (const tile of found) {
      const index = tile.geometry.index!;
      let covered = 0;
      for (const group of tile.geometry.groups) {
        covered += group.count;
        for (let at = group.start; at < group.start + group.count; at++) {
          const vertex = index.getX(at);
          if (vertex >= position.count) { outOfRangeIndices++; continue; }
          if (vertexMaterial[vertex] >= 0 && vertexMaterial[vertex] !== group.materialIndex) materialConflicts++;
          vertexMaterial[vertex] = group.materialIndex ?? 0;
        }
      }
      groupCoverageMismatches += Number(covered !== index.count);
    }
    let sourceMaterialMismatches = 0;
    for (const [cell, vertex] of cellVertex) for (let corner = 0; corner < 4; corner++) {
      const material = vertexMaterial[vertex + corner];
      if (material >= 0 && material !== surfaceOrder.indexOf(field.surfaces[cell])) sourceMaterialMismatches++;
    }
    const cellOfQuad = new Map<number, number>();
    for (const [cell, first] of cellVertex) cellOfQuad.set(first / 4, cell);
    const materialAtVertex = (vertex: number): MeshStandardMaterial => {
      const cell = cellOfQuad.get(Math.floor(vertex / 4));
      if (cell === undefined) throw new Error('A ground vertex has no drawn source cell');
      return materialList[surfaceOrder.indexOf(field.surfaces[cell])] as MeshStandardMaterial;
    };
    if (presentation.tier.effective === 'ordinary' && (!edge || !tint || !mode)) throw new Error('Ordinary attrs are missing');
    if (edge && tint && mode) {
      for (const [cell, vertex] of cellVertex) {
        const filled = fill.cells.get(cell);
        const ownMaterialIsBrick = SURFACES[field.surfaces[cell]]?.material === 'brick';
        const ownBrick = excluded[cell] === 0 && ownMaterialIsBrick;
        const fillBrick = filled !== undefined && SURFACES[filled.towards]?.material === 'brick';
        eligibleBrickCells += Number(ownBrick); brickSourceFillCells += Number(fillBrick);
        excludedBrickCells += Number(excluded[cell] !== 0 && ownMaterialIsBrick);
        unsafeTargets += Number(filled !== undefined && fillExcluded[cell] !== 0);
        unsafeSources += Number(filled !== undefined && fillExcluded[filled.source] !== 0);
        const c = cell % columns, r = Math.floor(cell / columns);
        for (let corner = 0; corner < 4; corner++) {
          const at = vertex + corner, values = [edge.getX(at), edge.getY(at), tint.getX(at), tint.getY(at), tint.getZ(at), mode.getX(at)];
          invalidAttrs += values.filter(value => !Number.isFinite(value)).length;
          if (fillExcluded[cell]) excludedEncoded += Number(edge.getX(at) !== GROUND_BOUNDARY.sentinel
            || edge.getY(at) !== GROUND_BOUNDARY.sentinel || tint.getX(at) !== 1 || tint.getY(at) !== 1
            || tint.getZ(at) !== 1 || mode.getX(at) !== 0);
          const boundaryBits = filled ? Number(filled.mode === 'intersection' && filled.lines.length > 1) + Number(filled.round === true) * 2 : 0;
          const materialBits = Number(fillBrick) * 4 + Number(ownBrick) * 8;
          const sharedBits = shared && filled ? sharedGroundCode(SURFACES[filled.towards].material) * 16 : 0;
          const bits = boundaryBits + materialBits + sharedBits;
          attrMismatches += Number(mode.getX(at) !== bits);
          materialFlagMismatches += Number((mode.getX(at) & 12) !== materialBits);
          if (filled && sharedTint) {
            // Shared mode evaluates both materials at this exact world corner.
            sharedTint(field.surfaces[cell], filled.towards, c + (corner & 1), r + (corner >> 1), sharedTone);
            const expectedTone = [sharedTone.r, sharedTone.g, sharedTone.b], actualTone = [tint.getX(at), tint.getY(at), tint.getZ(at)];
            for (let channel = 0; channel < 3; channel++) {
              const error = Math.abs(actualTone[channel] - expectedTone[channel]) / Math.max(1e-3, Math.abs(expectedTone[channel]));
              maximumSharedTintError = Math.max(maximumSharedTintError, error);
              // Binary16 rounding is at most half an ULP (2^-11 relative).
              if (error > 0.002) sharedTintMismatches++;
            }
          } else if (filled) {
            const sourceVertex = cellVertex.get(filled.source);
            if (sourceVertex === undefined) throw new Error('An actual fill source is undrawn');
            const ownMaterial = materialAtVertex(vertex), sourceMaterial = materialAtVertex(sourceVertex);
            const ownDiffuse = [ownMaterial.color.r * color.getX(at), ownMaterial.color.g * color.getY(at), ownMaterial.color.b * color.getZ(at)];
            const sourceDiffuse = [sourceMaterial.color.r * color.getX(sourceVertex), sourceMaterial.color.g * color.getY(sourceVertex),
              sourceMaterial.color.b * color.getZ(sourceVertex)];
            const actualFill = [tint.getX(at), tint.getY(at), tint.getZ(at)];
            for (let channel = 0; channel < 3; channel++) {
              const error = Math.abs(ownDiffuse[channel] * actualFill[channel] - sourceDiffuse[channel]) / Math.max(1e-8, Math.abs(sourceDiffuse[channel]));
              maximumSourceDiffuseRelativeError = Math.max(maximumSourceDiffuseRelativeError, error);
              // A binary16 ratio can round by at most half an ULP; the
              // Float32 vertex-color conversion adds a much smaller error.
              if (error > 0.002) sourceDiffuseMismatches++;
            }
          }
          for (let line = 0; line < 2; line++) {
            const expected = filled?.lines[line] ? edgeSignedDistance(filled.lines[line], c + (corner & 1), r + (corner >> 1))
              * ((filled as { distanceScale?: number }).distanceScale ?? 1) : GROUND_BOUNDARY.sentinel;
            // Binary16 quantisation is accounted for; this is not a visual tolerance.
            const actual = line === 0 ? edge.getX(at) : edge.getY(at);
            if (Math.abs(actual - expected) > Math.max(0.002, Math.abs(expected) / 512)) attrMismatches++;
          }
        }
      }
    }
    // 2026-10-04: the living world appends physical street furniture (bench
    // and bin solids that stand above patch cells), so heights, normals and
    // outside-patch surfaces are compared with the fresh prepared world: the
    // ground edit still may not change the simulation's ground anywhere.
    const sourceSampler = new PlanTerrainSampler(prepared), expected: GroundSample = createGroundSample();
    const original: GroundSample = createGroundSample();
    let samplerMismatches = 0, originalHeightMismatches = 0, originalNormalMismatches = 0, outsidePatchSemanticMismatches = 0;
    const samplePoints = [...cellVertex.keys()].filter((_cell, index) => index % 17 === 0).map(cell => ({
      x: field.originX + (cell % columns + 0.5) * field.spacing,
      z: field.originZ + (Math.floor(cell / columns) + 0.5) * field.spacing, cell,
    }));
    for (const patch of plan.groundSurfacePatches ?? []) for (const triangle of patch.triangles) {
      samplePoints.push({ cell: triangle.cell, x: triangle.vertices.reduce((sum, point) => sum + point.x, 0) / 3,
        z: triangle.vertices.reduce((sum, point) => sum + point.z, 0) / 3 });
    }
    for (const point of samplePoints) {
      independentSampler.sampleGround(point.x, point.z, expected); sourceSampler.sampleGround(point.x, point.z, original);
      const actual = game.sampleGround(point.x, point.z);
      samplerMismatches += Number(JSON.stringify(actual) !== JSON.stringify(expected));
      originalHeightMismatches += Number(actual.height !== original.height);
      originalNormalMismatches += Number(JSON.stringify(actual.normal) !== JSON.stringify(original.normal));
      outsidePatchSemanticMismatches += Number(!patches.has(point.cell) && (actual.surface !== original.surface || actual.offCourse !== original.offCourse));
    }
    const gl = game.renderer.renderer.getContext();
    const programs = (game.renderer.renderer.info.programs ?? []).map(program => {
      const vertex = gl.getShaderSource(program.vertexShader) ?? '', fragment = gl.getShaderSource(program.fragmentShader) ?? '';
      const boundary = vertex.includes('groundBoundaryEdge');
      return { id: program.id, boundary, linked: gl.getProgramParameter(program.program as WebGLProgram, gl.LINK_STATUS) as boolean,
        attrs: Object.keys(program.getAttributes() as Record<string, unknown>),
        fragmentPatched: fragment.includes('vGroundBoundaryTint') && fragment.includes('boundaryCover'),
        pavingPatched: vertex.includes('vGroundPavingWorld') && fragment.includes('pavingCover')
          && fragment.includes('pavingFootprint') && fragment.includes('dFdx(vGroundPavingWorld)')
          && fragment.includes('dFdy(vGroundPavingWorld)'),
        sharedBits: fragment.includes('mod(vGroundBoundaryMode, 16.0)'),
        addedSampler: /uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?sampler\w*\s+\w*[Gg]roundBoundary/.test(vertex + fragment) };
    });
    const glErrors: number[] = [];
    for (let i = 0; i < 16; i++) { const code = gl.getError(); if (code === gl.NO_ERROR) break; glErrors.push(code); }
    return { label, world: plan.id, sourceWorld: prepared.id, recordWorld: plan.recordWorldId, builderWorld: source.id,
      planDigest: digest(plan), originals,
      requested: snap.options.quality, effective: presentation.tier.effective, report: presentation.ordinaryBoundary,
      mesh: { uuid: found.map(tile => tile.uuid).join(','), geometry: found.map(tile => tile.geometry.uuid).join(','),
        owners: attributeOwners.size, tiles: found.length, sourceVertices, positionCount: position.count,
        groups: found.map(tile => tile.geometry.groups), attrs, invalidPositions, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow,
        materialConflicts, outOfRangeIndices, groupCoverageMismatches, sourceMaterialMismatches },
      fill: { shared, cells: fill.cells.size, lines: fill.lines, hazardExcludedCells: hazards.reduce((sum: number, value: number) => sum + value, 0),
        precisePatchCells: patches.size, unsafeTargets, unsafeSources, excludedEncoded, attrMismatches, invalidAttrs,
        sourceDiffuseMismatches, maximumSourceDiffuseRelativeError, sharedTintMismatches, maximumSharedTintError,
        eligibleBrickCells, brickSourceFillCells, excludedBrickCells, materialFlagMismatches, cap, drivableCap },
      sampler: { samples: samplePoints.length, samplerMismatches, originalHeightMismatches, originalNormalMismatches, outsidePatchSemanticMismatches },
      programs, patchAddsNoSampler: !/\bsampler\w*\b/.test(ordinary.GROUND_BOUNDARY_FRAGMENT), glErrors,
      ultraGlErrors: presentation.ultra?.glErrors ?? [], tick: snap.tick, simTimeSeconds: snap.simTimeSeconds,
      rider: snap.euc, camera: snap.camera, views: game.renderer.viewCount, resources: snap.resources };
  }, { world, label });
}
type Evidence = Awaited<ReturnType<typeof inspect>>;
function expectInstalled(evidence: Evidence, effective: 'ordinary' | 'ultra') {
  expect(evidence.world).toBe(evidence.sourceWorld);
  // 2026-10-04: the engine-independent identity of the living world.
  expect(evidence.recordWorld).toMatch(new RegExp(`^${evidence.builderWorld}(~living-r1)?$`));
  for (const [key, fact] of Object.entries(evidence.originals)) expect(fact.same, `${evidence.label}: unchanged original ${key}`).toBe(true);
  expect(evidence.effective).toBe(effective); expect(evidence.mesh.owners).toBe(1);
  expect(evidence.mesh.tiles).toBeGreaterThanOrEqual(1);
  expect(evidence.mesh).toMatchObject({ materialConflicts: 0, outOfRangeIndices: 0, groupCoverageMismatches: 0, sourceMaterialMismatches: 0 });
  expect(evidence.mesh.invalidPositions).toBe(0); expect(evidence.glErrors).toEqual([]); expect(evidence.ultraGlErrors).toEqual([]);
  expect(evidence.sampler.samples).toBeGreaterThan(0);
  expect(evidence.sampler).toMatchObject({ samplerMismatches: 0, originalHeightMismatches: 0,
    originalNormalMismatches: 0, outsidePatchSemanticMismatches: 0 });
  if (effective === 'ultra') {
    expect(evidence.report).toBeNull(); for (const attribute of evidence.mesh.attrs) expect(attribute.present).toBe(false);
    // Other ordinary programs may still be cached after a tier transition.
    // Mesh attrs/report, rather than global cache contents, prove isolation.
    return;
  }
  expect(evidence.report).not.toBeNull(); expect(evidence.report!.bytes).toBe(evidence.mesh.positionCount * 11);
  expect(evidence.report!.filledCells).toBe(evidence.fill.cells); expect(evidence.report!.fillLines).toBe(evidence.fill.lines);
  expect(evidence.mesh.attrs).toMatchObject([
    { present: true, count: evidence.mesh.positionCount, itemSize: 2, arrayType: 'Uint16Array', float16: true, normalized: false },
    { present: true, count: evidence.mesh.positionCount, itemSize: 3, arrayType: 'Uint16Array', float16: true, normalized: false },
    { present: true, count: evidence.mesh.positionCount, itemSize: 1, arrayType: 'Uint8Array', float16: false, normalized: false },
  ]);
  expect(evidence.fill).toMatchObject({ unsafeTargets: 0, unsafeSources: 0, excludedEncoded: 0, attrMismatches: 0,
    invalidAttrs: 0, sourceDiffuseMismatches: 0, sharedTintMismatches: 0, materialFlagMismatches: 0 });
  expect(evidence.patchAddsNoSampler).toBe(true);
  const programs = evidence.programs.filter(program => program.boundary);
  expect(programs.length).toBeGreaterThan(0);
  for (const program of programs) {
    // 2026-10-04: over the shared ground surface the ordinary boundary omits
    // its legacy paving footprint (the shared metre-scale surface owns paving,
    // `installOrdinaryGroundBoundary(material, !sharedSurface, sharedSurface)`)
    // and decodes the shared material code above its boundary bits.
    expect(program).toMatchObject({ linked: true, fragmentPatched: true, pavingPatched: !evidence.fill.shared,
      sharedBits: evidence.fill.shared, addedSampler: false });
    expect(program.attrs).toEqual(expect.arrayContaining(['groundBoundaryEdge', 'groundBoundaryTint', 'groundBoundaryMode']));
  }
}

/** Build the controlled reference against today's exact installed plan and
 * ordinary recipe: the renderer's OWN terrain composition (shared ground
 * surface, the admitted shared edge assembly, 256 m spatial tiles) with only
 * the ordinary boundary treatment switched off. Only its heightfield tiles are
 * mounted. This is a controlled reference, NEVER a whole historical
 * build/artifact. Every other object, owner, clock, pose, camera and plan
 * remains the current game's. No simulation advances while it is installed.
 *
 * 2026-10-04: the historical DEFAULT factory (one unbatched mesh, no shared
 * surface or edge assembly) can no longer be geometry-identical to the
 * renderer's terrain, which now draws the shared ground surface with the
 * admitted edge assembly and is spatially batched (all intended). The parity
 * gate below is unchanged in meaning: identical positions, normals, indices,
 * groups, materials and flags, so the pixel difference isolates the ordinary
 * boundary edit exactly as before. Environment supplements are not borrowed
 * (the reference builds and disposes its own feature blocks); they only feed
 * kerbs/props, which are never mounted.
 */
async function beginReference(page: Page) {
  return page.evaluate(async () => {
    if (window.environmentGroundReference) throw new Error('A reference is already installed');
    const terrainPath = '/src/render/terrain.ts', batchingPath = '/src/render/spatialBatching.ts';
    const [{ createTerrain }, { DEFAULT_SPATIAL_BATCH_METRES }] = await Promise.all([import(terrainPath), import(batchingPath)]);
    const game = window.game, renderer = game.renderer, presentation = renderer.presentation();
    if (!presentation || presentation.tier.effective !== 'ordinary' || game.snapshot().loop.running || renderer.viewCount !== 1) {
      throw new Error('The comparator requires one frozen ordinary view');
    }
    const currentTiles: Mesh[] = [];
    renderer.scene.traverse(object => { if (object.name === 'level-heightfield') currentTiles.push(object as Mesh); });
    const parent = currentTiles[0]?.parent;
    if (!parent || currentTiles.some(tile => tile.parent !== parent)) throw new Error('The current heightfield tiles are detached or split');
    const childIndices = currentTiles.map(tile => parent.children.indexOf(tile));
    const originalVisible = currentTiles.map(tile => tile.visible);
    const preparedGroundEdges = (renderer as unknown as { preparedGroundEdges: unknown }).preparedGroundEdges;
    const legacyView: TerrainView = createTerrain(game.levelPlan, presentation.recipe, undefined, {
      ordinaryBoundary: false, sharedSurface: presentation.sharedGround !== null, sharedEdges: preparedGroundEdges,
      spatialBatchMetres: DEFAULT_SPATIAL_BATCH_METRES });
    const owned = new Map<object, DisposeRecord>();
    let disposed = false;
    const legacyTiles: Mesh[] = [];
    const dispose = () => { if (disposed) return; disposed = true; for (const tile of legacyTiles) tile.removeFromParent(); legacyView.dispose(); };
    // All work after allocation is covered, including owner observation,
    // parity checks and the pre-swap controls. A setup exception must not
    // abandon temporary GPU owners or leave the current tiles detached.
    try {
    legacyView.group.traverse(object => { if (object.name === 'level-heightfield') legacyTiles.push(object as Mesh); });
    if (legacyTiles.length === 0 || legacyTiles.some(tile => !tile.isMesh)) throw new Error('The reference factory did not produce heightfield tiles');
    const observe = (owner: DisposeRecord['owner'], kind: string) => {
      if (owned.has(owner)) return;
      const record: DisposeRecord = { owner, kind, calls: 0, listener: () => { record.calls++; } };
      owner.addEventListener('dispose', record.listener); owned.set(owner, record);
    };
    legacyView.group.traverse(object => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh; observe(mesh.geometry, 'geometry');
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        observe(material, 'material');
        for (const value of Object.values(material)) if (value && typeof value === 'object' && (value as Texture).isTexture) observe(value as Texture, 'texture');
      }
    });
    const arrayEqual = (a: ArrayLike<number> | null, b: ArrayLike<number> | null) => a === null || b === null
      ? a === b : a.length === b.length && Array.from(a).every((value, index) => value === b[index]);
    const nonAlbedo = (material: Material) => {
      const m = material as MeshStandardMaterial;
      return { type: m.type, roughness: m.roughness, metalness: m.metalness, vertexColors: m.vertexColors,
        side: m.side, transparent: m.transparent, opacity: m.opacity, blending: m.blending,
        depthTest: m.depthTest, depthWrite: m.depthWrite, alphaTest: m.alphaTest, alphaHash: m.alphaHash,
        polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
        fog: m.fog, toneMapped: m.toneMapped, flatShading: m.flatShading, wireframe: m.wireframe,
        emissive: m.emissive.toArray(), emissiveIntensity: m.emissiveIntensity, normalScale: m.normalScale.toArray(),
        maps: ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap', 'aoMap', 'displacementMap', 'bumpMap', 'envMap']
          .map(key => ({ key, present: (m as unknown as Record<string, unknown>)[key] !== null })) };
    };
    const materials = (mesh: Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(nonAlbedo);
    const albedo = (mesh: Mesh) => JSON.stringify((Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map(m => (m as MeshStandardMaterial).color.toArray()));
    const current = currentTiles[0], legacy = legacyTiles[0];
    const paired = currentTiles.length === legacyTiles.length;
    const parity = {
      tiles: paired,
      position: arrayEqual(current.geometry.getAttribute('position').array, legacy.geometry.getAttribute('position').array),
      normal: arrayEqual(current.geometry.getAttribute('normal').array, legacy.geometry.getAttribute('normal').array),
      index: paired && currentTiles.every((tile, at) => arrayEqual(tile.geometry.index?.array ?? null, legacyTiles[at].geometry.index?.array ?? null)),
      groups: paired && currentTiles.every((tile, at) => JSON.stringify(tile.geometry.groups) === JSON.stringify(legacyTiles[at].geometry.groups)),
      drawRange: paired && currentTiles.every((tile, at) => JSON.stringify(tile.geometry.drawRange) === JSON.stringify(legacyTiles[at].geometry.drawRange)),
      nonAlbedoMaterials: JSON.stringify(materials(current)) === JSON.stringify(materials(legacy)),
      albedoMaterials: albedo(current) === albedo(legacy),
      flags: paired && currentTiles.every((tile, at) => tile.castShadow === legacyTiles[at].castShadow
        && tile.receiveShadow === legacyTiles[at].receiveShadow),
      legacyNoOrdinaryReport: legacyView.ordinaryBoundary === null,
      legacyNoOrdinaryAttrs: ['groundBoundaryEdge', 'groundBoundaryTint', 'groundBoundaryMode'].every(name => !legacy.geometry.getAttribute(name)),
    };
    if (Object.values(parity).some(value => !value)) { dispose(); throw new Error(`Reference parity failed: ${JSON.stringify(parity)}`); }
    legacyTiles.forEach((tile, at) => {
      const source = currentTiles[at];
      tile.position.copy(source.position); tile.quaternion.copy(source.quaternion); tile.scale.copy(source.scale);
      tile.matrix.copy(source.matrix); tile.matrixAutoUpdate = source.matrixAutoUpdate;
      tile.layers.mask = source.layers.mask; tile.renderOrder = source.renderOrder;
    });
    const order = childIndices.map((index, at) => ({ index, at })).sort((a, b) => a.index - b.index);
    const mount = (tiles: Mesh[]) => {
      for (const tile of [...currentTiles, ...legacyTiles]) tile.removeFromParent();
      for (const { index, at } of order) {
        const tile = tiles[at]; parent.add(tile);
        parent.children.splice(parent.children.indexOf(tile), 1); parent.children.splice(index, 0, tile);
      }
    };
    const setVisible = (tiles: Mesh[], visible: boolean | boolean[]) =>
      tiles.forEach((tile, at) => { tile.visible = Array.isArray(visible) ? visible[at] : visible; });
    const state = () => {
      const snap = game.snapshot(), camera = renderer.cameraFor(0);
      return JSON.stringify({ tick: snap.tick, seconds: snap.simTimeSeconds, rider: snap.euc, camera: snap.camera,
        cameraPosition: camera.position.toArray(), cameraQuaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray(),
        plan: game.levelPlan, ground: game.levelPlan.segments.slice(0, 8).map(segment => game.sampleGround(segment.entry.position.x, segment.entry.position.z)) });
    };
    const swapped = new Set<object>([...currentTiles, ...legacyTiles]);
    const others = () => {
      const result: unknown[] = [];
      renderer.scene.traverse(object => {
        if (swapped.has(object)) return;
        const mesh = object as Mesh;
        result.push({ uuid: object.uuid, parent: object.parent?.uuid, visible: object.visible, matrix: object.matrix.toArray(),
          geometry: mesh.geometry?.uuid, materials: mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.uuid) : [] });
      });
      return JSON.stringify(result);
    };
    const gl = renderer.renderer.getContext();
    const pixels = () => {
      renderer.render();
      const buffer = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      return buffer;
    };
    const difference = (a: Uint8Array, b: Uint8Array) => {
      if (a.length !== b.length) throw new Error('Comparator drawing buffer dimensions changed');
      let changed = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) changed++;
      return changed;
    };
    renderer.render();
    const beforeState = state(), beforeOthers = others(), beforeResources = JSON.stringify(game.snapshot().resources);
    const currentPixels = pixels();
    let controlsChangedPixels = -1, changedPixels = -1, cached: RestoreReport | null = null;
    const restore = (): RestoreReport => {
      if (cached) return cached;
      mount(currentTiles); setVisible(currentTiles, originalVisible); dispose();
      const restoredPixels = pixels(), glErrors: number[] = [];
      for (let i = 0; i < 16; i++) { const code = gl.getError(); if (code === gl.NO_ERROR) break; glErrors.push(code); }
      cached = { restored: currentTiles.every((tile, at) => tile.parent === parent && parent.children[childIndices[at]] === tile)
          && legacyTiles.every(tile => tile.parent === null),
        frameUnchanged: state() === beforeState, otherObjectsUnchanged: others() === beforeOthers,
        restoredChangedPixels: difference(currentPixels, restoredPixels), controlsChangedPixels, changedPixels,
        resourcesUnchanged: JSON.stringify(game.snapshot().resources) === beforeResources,
        owners: [...owned.values()].map(record => ({ kind: record.kind, uuid: record.owner.uuid, disposeCalls: record.calls })), glErrors };
      for (const record of owned.values()) record.owner.removeEventListener('dispose', record.listener);
      return cached;
    };
    window.environmentGroundReference = { restore };
    try {
      // The baseline control renders all current objects with the heightfield
      // hidden in each composition, proving every other world pixel is equal.
      setVisible(currentTiles, false); const currentOtherPixels = pixels();
      mount(legacyTiles); setVisible(legacyTiles, false); const legacyOtherPixels = pixels();
      controlsChangedPixels = difference(currentOtherPixels, legacyOtherPixels);
      setVisible(legacyTiles, originalVisible); changedPixels = difference(currentPixels, pixels());
      return { kind: 'controlled same-composition heightfield reference without the ordinary boundary, in the current world; not a historical whole-build capture',
        parity, changedPixels, controlsChangedPixels, clockUnchanged: state() === beforeState,
        otherObjectsUnchanged: others() === beforeOthers, position: current.position.toArray(), tiles: currentTiles.length,
        recipe: presentation.recipe, world: game.levelPlan.id, legacyViewOwners: owned.size };
    } catch (error) { restore(); delete window.environmentGroundReference; throw error; }
    } catch (error) {
      try {
        if (window.environmentGroundReference) window.environmentGroundReference.restore();
        else {
          for (const tile of [...currentTiles, ...legacyTiles]) tile.removeFromParent();
          for (const { index, at } of childIndices.map((index, at) => ({ index, at })).sort((a, b) => a.index - b.index)) {
            const tile = currentTiles[at]; parent.add(tile);
            parent.children.splice(parent.children.indexOf(tile), 1); parent.children.splice(index, 0, tile);
          }
          currentTiles.forEach((tile, at) => { tile.visible = originalVisible[at]; }); dispose();
        }
      } finally {
        delete window.environmentGroundReference;
        for (const record of owned.values()) record.owner.removeEventListener('dispose', record.listener);
      }
      throw error;
    }
  });
}

async function finishReference(page: Page): Promise<RestoreReport | null> {
  return page.evaluate(() => {
    const reference = window.environmentGroundReference;
    if (!reference) return null;
    try { return reference.restore(); } finally { delete window.environmentGroundReference; }
  });
}

async function capturePair(page: Page, directory: string, label: string) {
  const current = await page.locator('#viewport').screenshot({ path: join(directory, `${label}-current.png`) });
  let comparator: Awaited<ReturnType<typeof beginReference>> | null = null, restored: RestoreReport | null = null;
  try {
    comparator = await beginReference(page);
    await page.locator('#viewport').screenshot({ path: join(directory, `${label}-controlled-legacy-heightfield.png`) });
    expect(Object.values(comparator.parity)).toEqual(Array(Object.keys(comparator.parity).length).fill(true));
    expect(comparator.clockUnchanged && comparator.otherObjectsUnchanged).toBe(true);
    expect(comparator.controlsChangedPixels).toBe(0);
    expect(comparator.changedPixels, `${label}: the ground edit must be visible in this actual view`).toBeGreaterThan(0);
  } finally { restored = await finishReference(page); }
  if (!restored) throw new Error('Reference restoration evidence is missing');
  expect(restored).toMatchObject({ restored: true, frameUnchanged: true, otherObjectsUnchanged: true,
    restoredChangedPixels: 0, controlsChangedPixels: 0, resourcesUnchanged: true, glErrors: [] });
  expect(restored.owners.length).toBeGreaterThan(0);
  for (const owner of restored.owners) expect(owner.disposeCalls, `${label}: ${owner.kind} ${owner.uuid}`).toBe(1);
  const restoredImage = await page.locator('#viewport').screenshot({ path: join(directory, `${label}-restored-current.png`) });
  const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
  expect(sha256(restoredImage), `${label}: fresh restored-current PNG`).toBe(sha256(current));
  return { label, comparator, restored, currentPngSha256: sha256(current), restoredPngSha256: sha256(restoredImage) };
}

test('ordinary ground: fresh matched controlled-reference frames, unchanged worlds/samplers and compiled tier shaders', async ({ page }) => {
  test.setTimeout(300_000);
  const directory = join(shots, 'matched'), errors = collectErrors(page), evidence: Evidence[] = [], frames: unknown[] = [], pairs: unknown[] = [];
  mkdirSync(directory, { recursive: true }); await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    for (const world of worlds) {
      await bootAtTier(page, world.query, 'high', { freezeAtStart: true });
      for (const subject of world.subjects) {
        const label = `${world.name}-high-${subject}`, framing = await place(page, subject);
        const report = await inspect(page, world, label); evidence.push(report); frames.push({ label, framing });
        expectInstalled(report, 'ordinary');
        if (world.name === 'switchback') expect(framing.spacing).toBe(1.5);
        pairs.push(await capturePair(page, directory, label));
      }
      // Actual active Ultra mesh must never carry the ordinary attrs/report.
      await page.evaluate(() => { window.game.setOptions({ quality: 'ultra' }); window.game.advance(0); });
      const ultra = await inspect(page, world, `${world.name}-ultra-isolation`); evidence.push(ultra);
      expectInstalled(ultra, 'ultra');
    }
    const world = worlds[0]; await bootAtTier(page, world.query, 'low', { freezeAtStart: true });
    for (const quality of ['low', 'medium', 'high'] as const) {
      await page.evaluate(quality => { window.game.setOptions({ quality }); window.game.advance(0); }, quality);
      const framing = await place(page, 'diagonal-street'), label = `euc-${quality}-active-tier`;
      const report = await inspect(page, world, label); evidence.push(report); frames.push({ label, framing });
      expectInstalled(report, 'ordinary'); pairs.push(await capturePair(page, directory, label));
    }
    expect(evidence.some(report => report.fill.hazardExcludedCells > 0)).toBe(true);
    expect(evidence.some(report => report.fill.precisePatchCells > 0)).toBe(true);
    expect(evidence.some(report => report.effective === 'ordinary' && report.fill.eligibleBrickCells > 0)).toBe(true);
    expect(evidence.some(report => report.effective === 'ordinary' && report.fill.brickSourceFillCells > 0)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await finishReference(page);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ viewport: { width: 1280, height: 720 }, frames, evidence, pairs, errors,
      evidenceScope: 'Diagnostic QA placements with the production chase camera; controlled legacy heightfield only; all other current world objects retained',
      acceptance: 'PNG pairs require fresh independent visual review. No normal-spawn ride, listening, device timing, historical whole-build or creator acceptance claim.' }, null, 2));
  }
});

test('ordinary ground: authored plaza arrival controlled reference', async ({ page }) => {
  const directory = join(shots, 'plaza'), errors = collectErrors(page);
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true });
  const placement = await page.evaluate(() => {
    const game = window.game, plan = game.levelPlan;
    const segment = plan.segments.find(segment => segment.id.startsWith('return-plaza@'));
    if (!segment) throw new Error('Original plaza return is absent');
    const points = window.qa.routePoints([segment.id], 2);
    if (points.length < 5) throw new Error('Original return has too few canonical points');
    const point = points[points.length - 4], next = points[points.length - 3];
    const heading = Math.atan2(next.x - point.x, next.z - point.z);
    game.loop.setRunning(false); game.clearActions();
    game.placeRider({ ...point, y: game.sampleGround(point.x, point.z).height }, heading);
    game.advance(0);
    return { scope: 'Frozen QA placement on the literal original return, not a ridden-frame reproduction',
      segment: segment.id, sourceEntry: segment.entry, sourceExit: segment.exit,
      point, heading, rider: game.snapshot().euc, camera: game.snapshot().camera };
  });
  let pair: unknown;
  try {
    pair = await capturePair(page, directory, 'return-plaza-arrival');
    expect(errors).toEqual([]);
  } finally {
    await finishReference(page);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ placement, pair, errors,
      scope: 'Only the heightfield is replaced; authored markings, bollards, piers and camera stay current and fixed.' }, null, 2));
  }
});

async function armDisposal(page: Page) {
  return page.evaluate(() => {
    if (window.environmentGroundDisposal) throw new Error('A disposal observer is already armed');
    const mesh = window.game.renderer.scene.getObjectByName('level-heightfield') as Mesh;
    // 2026-10-04: the heightfield is one shared source drawn as 256 m tiles;
    // observe every tile's geometry (each is its own disposable wrapper) and
    // the one shared material list.
    const tiles: Mesh[] = [];
    window.game.renderer.scene.traverse(object => { if (object.name === 'level-heightfield') tiles.push(object as Mesh); });
    const owners = [...tiles.map(tile => ({ owner: tile.geometry, kind: 'geometry' })),
      ...[...new Set(Array.isArray(mesh.material) ? mesh.material : [mesh.material])]
      .map(owner => ({ owner, kind: 'material' }))];
    const records: DisposeRecord[] = owners.map(({ owner, kind }) => {
      const record: DisposeRecord = { owner, kind, calls: 0, listener: () => { record.calls++; } };
      owner.addEventListener('dispose', record.listener); return record;
    });
    window.environmentGroundDisposal = { mesh, records };
    return { mesh: mesh.uuid, geometry: mesh.geometry.uuid, owners: records.length };
  });
}
async function finishDisposal(page: Page) {
  return page.evaluate(() => {
    const saved = window.environmentGroundDisposal;
    if (!saved) throw new Error('No armed disposal observer');
    const active = window.game.renderer.scene.getObjectByName('level-heightfield');
    const ancestry: { uuid: string; name: string; type: string }[] = [];
    let ancestor: Mesh['parent'] = saved.mesh, inScene = false;
    while (ancestor) {
      ancestry.push({ uuid: ancestor.uuid, name: ancestor.name, type: ancestor.type });
      if (ancestor === window.game.renderer.scene) { inScene = true; break; }
      ancestor = ancestor.parent;
    }
    // A disposed mesh can remain inside its now-detached terrain subtree.
    // Reachability from the live scene, paired with owner disposal events,
    // is the lifetime predicate; immediate parent null is not required.
    const result = { sameOwner: saved.mesh === active, detached: !inScene,
      immediateParent: saved.mesh.parent?.uuid ?? null, ancestry,
      owners: saved.records.map(record => ({ kind: record.kind, uuid: record.owner.uuid, calls: record.calls })) };
    for (const record of saved.records) record.owner.removeEventListener('dispose', record.listener);
    delete window.environmentGroundDisposal; return result;
  });
}

async function selectWorld(page: Page, seed: string | null) {
  await page.evaluate(() => { window.game.setAppState('title'); window.game.loop.setRunning(false); });
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  if (seed === null) await page.locator('.euc-menu--routes [data-venue="slice"]').click();
  else { await page.locator('#euc-seed').fill(seed); await page.locator('.euc-menu--routes [data-menu="ride-route"]').click(); }
  // 2026-10-04: plan ids of living worlds are composition hashes; the builder
  // identity is recordWorldId, and a menu world swap now prepares the living
  // world behind the loading cover (seconds, not one synchronous call).
  await expect.poll(() => page.evaluate(() => window.game.levelPlan.recordWorldId), { timeout: 90_000 })
    .toBe(seed === null ? 'm7-slice~living-r1' : `generated-r6-${seed}~living-r1`);
  await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
  await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(0); });
}

test('ordinary ground: one owner across couch panes, disposal on rebuild, warmed tier/context plateau', async ({ page }) => {
  // 2026-10-04: six menu swaps now prepare a living world behind the loading
  // cover; on a loaded shared machine this fixture reached its last pane
  // assertion just past the old 300 s budget.
  test.setTimeout(600_000);
  const directory = join(shots, 'lifecycle'), errors = collectErrors(page), world = worlds[0];
  const tiers: Evidence[] = [], panes: Evidence[] = [], menu: Evidence[] = [], disposals: unknown[] = [], restores: unknown[] = [];
  mkdirSync(directory, { recursive: true }); await page.setViewportSize({ width: 1280, height: 720 });
  try {
    await bootAtTier(page, world.query, 'high', { freezeAtStart: true }); await place(page, 'diagonal-street');
    for (let round = 0; round < 3; round++) {
      await armDisposal(page); await selectWorld(page, null); const disposed = await finishDisposal(page); disposals.push(disposed);
      expect(disposed.sameOwner).toBe(false); expect(disposed.detached).toBe(true);
      for (const owner of disposed.owners) expect(owner.calls).toBe(1);
      await selectWorld(page, 'euc'); await place(page, 'diagonal-street');
      const report = await inspect(page, world, `menu-rebuild-${round}`); menu.push(report); expectInstalled(report, 'ordinary');
    }
    expect(menu[2].resources).toEqual(menu[1].resources); expect(menu[2].report).toEqual(menu[1].report);
    const order: QualityLevel[] = ['low', 'medium', 'high', 'ultra', 'high'];
    for (let round = 0; round < 3; round++) for (const [index, quality] of order.entries()) {
      await armDisposal(page);
      const immutable = await page.evaluate(quality => {
        const game = window.game, plan = game.levelPlan, before = game.snapshot();
        game.setOptions({ quality }); game.advance(0); const after = game.snapshot();
        return { samePlan: game.levelPlan === plan, tick: before.tick === after.tick,
          rider: JSON.stringify(before.euc) === JSON.stringify(after.euc), camera: JSON.stringify(before.camera) === JSON.stringify(after.camera) };
      }, quality);
      const disposed = await finishDisposal(page); disposals.push({ round, index, quality, disposed });
      expect(immutable).toEqual({ samePlan: true, tick: true, rider: true, camera: true });
      if (disposed.sameOwner) for (const owner of disposed.owners) expect(owner.calls).toBe(0);
      else { expect(disposed.detached).toBe(true); for (const owner of disposed.owners) expect(owner.calls).toBe(1); }
      const report = await inspect(page, world, `cycle-${round}-${index}-${quality}`); tiers.push(report);
      expectInstalled(report, quality === 'ultra' ? 'ultra' : 'ordinary');
    }
    // Warm cycle is retained. Compare matching states in complete cycles 2/3.
    for (let index = 0; index < order.length; index++) expect(tiers[index + 10].resources).toEqual(tiers[index + 5].resources);
    const lastRestored = new Map<QualityLevel, Evidence>();
    for (const quality of ['high', 'ultra'] as const) for (let round = 0; round < 3; round++) {
      await page.evaluate(quality => { window.game.setOptions({ quality }); window.game.advance(0); }, quality);
      const before = await inspect(page, world, `${quality}-loss-${round}`);
      await armDisposal(page);
      await page.evaluate(() => {
        const renderer = window.game.renderer.renderer, gl = renderer.getContext(), extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('WEBGL_lose_context unavailable; context evidence is unmeasured');
        const record = { extension, restored: null as number[] | null }; window.environmentGroundContext = record;
        renderer.domElement.addEventListener('webglcontextrestored', () => {
          window.game.loop.setRunning(false); const codes: number[] = [];
          for (let i = 0; i < 16; i++) { const code = gl.getError(); if (code === gl.NO_ERROR) break; codes.push(code); }
          record.restored = codes;
        }, { once: true }); extension.loseContext();
      });
      await page.waitForFunction(() => window.game.snapshot().contextLost);
      const lost = await page.evaluate(() => ({ tick: window.game.snapshot().tick, running: window.game.snapshot().loop.running }));
      expect(lost).toEqual({ tick: before.tick, running: false }); await expect(page.locator('#euc-context-notice')).toBeVisible();
      await page.evaluate(() => window.environmentGroundContext!.extension.restoreContext());
      await page.waitForFunction(() => !window.game.snapshot().contextLost
        && window.environmentGroundContext !== undefined && window.environmentGroundContext.restored !== null);
      await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(0); });
      const restoredFlags = await page.evaluate(() => window.environmentGroundContext!.restored);
      const after = await inspect(page, world, `${quality}-restored-${round}`), contextDisposal = await finishDisposal(page);
      restores.push({ quality, round, before, lost, restoredFlags, after, contextDisposal });
      // releaseForLostContext deliberately dispatches dispose on uploaded GPU
      // owners while retaining their CPU scene objects for automatic re-upload.
      expect(contextDisposal.sameOwner).toBe(true); expect(contextDisposal.detached).toBe(false);
      for (const owner of contextDisposal.owners) expect(owner.calls).toBe(1);
      expect(restoredFlags).toEqual([]); expectInstalled(after, quality === 'ultra' ? 'ultra' : 'ordinary');
      expect(after.tick).toBe(before.tick); expect(after.rider).toEqual(before.rider); expect(after.camera).toEqual(before.camera);
      expect(after.planDigest).toBe(before.planDigest); expect(after.report).toEqual(before.report);
      // A context loss clears earlier cache uploads. Compare exact restored
      // matching states after one warm restore, never to a pre-loss cache.
      const previous = lastRestored.get(quality);
      if (round >= 2 && previous) expect(after.resources).toEqual(previous.resources);
      lastRestored.set(quality, after);
      await page.locator('#viewport').screenshot({ path: join(directory, `${quality}-restored-${round}.png`) });
      await page.evaluate(() => { delete window.environmentGroundContext; });
    }
    await page.evaluate(() => { window.game.setOptions({ quality: 'high' }); window.game.advance(0); });
    const solo = await inspect(page, world, 'solo'); panes.push(solo); expectInstalled(solo, 'ordinary');
    for (const count of [2, 4]) {
      const shared = await page.evaluate(count => {
        const game = window.game, owner = game.renderer.scene.getObjectByName('level-heightfield') as Mesh;
        const plan = game.levelPlan, pose = game.snapshot().euc;
        while (game.renderer.viewCount < count) { game.spawnRider(); game.loop.setRunning(false); }
        for (let seat = 1; seat < count; seat++) game.placeRider(pose.position, pose.headingY, seat);
        game.advance(0);
        return { sameOwner: owner === game.renderer.scene.getObjectByName('level-heightfield'), samePlan: plan === game.levelPlan,
          sameGeometry: owner.geometry === (game.renderer.scene.getObjectByName('level-heightfield') as Mesh).geometry };
      }, count);
      const report = await inspect(page, world, `${count}-pane`); panes.push(report); expectInstalled(report, 'ordinary');
      expect(shared).toEqual({ sameOwner: true, samePlan: true, sameGeometry: true });
      expect(report.views).toBe(count); expect(report.mesh.uuid).toBe(solo.mesh.uuid); expect(report.mesh.geometry).toBe(solo.mesh.geometry);
      expect(report.report).toEqual(solo.report); expect(report.mesh.attrs).toEqual(solo.mesh.attrs);
      await page.locator('#viewport').screenshot({ path: join(directory, `${count}-pane-one-ground-owner.png`) });
    }
    // The saved request stays Ultra while couch mode draws one ordinary owner.
    await page.evaluate(() => { window.game.setOptions({ quality: 'ultra' }); window.game.advance(0); });
    const fallback = await inspect(page, world, 'four-pane-requested-ultra'); panes.push(fallback);
    expect(fallback.requested).toBe('ultra'); expectInstalled(fallback, 'ordinary'); expect(fallback.views).toBe(4);
    expect(fallback.report).toEqual(solo.report);
    const expectedContextMessages = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
    expect(errors.filter(message => !expectedContextMessages.test(message))).toEqual([]);
  } finally {
    await finishReference(page);
    await page.evaluate(() => {
      const saved = window.environmentGroundDisposal;
      if (saved) for (const record of saved.records) record.owner.removeEventListener('dispose', record.listener);
      delete window.environmentGroundDisposal; delete window.environmentGroundContext;
    });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ tiers, panes, menu, disposals, restores, errors,
      tierPlateau: { order: ['low', 'medium', 'high', 'ultra', 'high-after-ultra'], cycles: 3, warmupCycle: 0,
        comparedCycles: [1, 2], predicate: 'Exact matching-state resources, no first-cycle cache assumptions' },
      contextPlateau: { restoresPerTier: 3, warmupRestore: 0, comparedRestores: [1, 2] },
      acceptance: 'Ownership, resource counts and functional GL behavior only; no frame interval or sustained device performance claim' }, null, 2));
  }
});
