/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-owned complete dependency-component selection. Raw construction,
 * terminal treatment and strict validators remain unchanged. */
import { SURFACES } from '../data/surfaces.ts';
import type { Heightfield, LevelPlan } from '../level/plan.ts';
import type { EdgeFillField } from './groundBoundary.ts';
import { planSharedGroundEdgeAssembly, edgeAssemblyJoinMismatches,
  SHARED_EDGE_ASSEMBLY, type EdgeAssemblyPlan, type EdgeAssemblyReport, type EdgeAssemblySourceSeam } from './sharedGroundEdgeAssembly.ts';
import { sharedEdgeSourceComponents, sharedEdgePairId as pairId, type SharedEdgeComponents } from './sharedGroundEdgeComponents.ts';

/** One initial constructor and at most one component-filtered reconstruction.
 * No world-sized retreat loop or enlarged generation/memory budget.
 * An all-urban component whose visible flush-stone run covers fewer source
 * cells than `minimumUrbanRunCells` reads as a pale shard, not a kerb
 * (2026-10-03, VIS-4); it is restored whole in the same second pass, falling
 * back to the shared contour blend. Long kerb runs are unchanged. */
export const SHARED_EDGE_SELECTION = Object.freeze({ maximumPasses: 2, minimumUrbanRunCells: 6 });
export interface SharedEdgeSelectionPass {
  readonly pass: number;
  readonly selectedPairs: number;
  readonly joinFailures: number;
  readonly newlyRejectedPairIds: readonly string[];
  readonly newlyRejectedComponentIds: readonly string[];
}
export interface SelectiveEdgeAssemblyReport extends EdgeAssemblyReport {
  readonly selectionPolicy: 'whole-source-band-component';
  readonly originalCandidatePairs: number;
  readonly originalCandidatePairIds: readonly string[];
  readonly selectedPairs: number;
  readonly selectedPairIds: readonly string[];
  readonly rejectedPairs: number;
  readonly rejectedPairIds: readonly string[];
  readonly sourceComponents: number;
  readonly selectedComponents: number;
  readonly rejectedComponents: number;
  readonly largestComponentPairs: number;
  readonly inspectedComponentBoundaries: number;
  readonly dependencyComponentBoundaries: number;
  readonly componentSelection: readonly { readonly id: string; readonly pairs: number; readonly rejected: boolean }[];
  /** Join-safe all-urban components restored only because their kerb is short. */
  readonly shortUrbanRunComponents: number;
  readonly selectionIterations: number;
  readonly selectionMaximumPasses: number;
  readonly initialJoinFailures: number;
  readonly remainingJoinFailures: number;
  readonly initialRefusedPairs: number;
  readonly initialProtectedCells: number;
  readonly selectionPasses: readonly SharedEdgeSelectionPass[];
  readonly sourceIntegrityFailures: readonly { readonly cell: number; readonly reason: string }[];
  /** The dependency proof requires surviving partitions to remain EXACTLY
   * equal to their initial original-source construction, including terminals. */
  readonly componentBoundaryFailures: readonly number[];
  readonly selectionRefusal: 'source-integrity' | 'pass-limit' | 'unowned-join' | 'ownership-drift' | 'empty-selection' | 'component-boundary-drift' | null;
}
export interface SelectiveEdgeAssemblyPlan extends EdgeAssemblyPlan {
  readonly report: SelectiveEdgeAssemblyReport;
}
/** A bad source partition is a whole refusal, never an unsupported knee that
 * selection is allowed to erase. This guard also runs at admission/allocation. */
export function sharedEdgeSourceIntegrityFailures(plan: LevelPlan, assembly: EdgeAssemblyPlan): { cell: number; reason: string }[] {
  const field = plan.heightfield, columns = field.columns - 1, owners = new Map<number, EdgeAssemblySourceSeam>();
  const failures: { cell: number; reason: string }[] = [];
  for (const seam of assembly.sourceSeams ?? []) {
    for (const cell of [seam.a, seam.b]) {
      if (owners.has(cell) || !assembly.replacements.has(cell)) failures.push({ cell, reason: 'source-owner-partition' });
      owners.set(cell, seam);
    }
  }
  if (assembly.report.pairedSeams !== (assembly.sourceSeams?.length ?? 0)
    || assembly.report.replacedCells !== assembly.replacements.size || assembly.replacements.size !== owners.size) {
    failures.push({ cell: owners.keys().next().value ?? -1, reason: 'source-owner-count' });
  }
  for (const [cell, triangles] of assembly.replacements) {
    const seam = owners.get(cell);
    if (!seam || !Number.isSafeInteger(cell) || cell < 0 || cell >= field.surfaces.length) {
      failures.push({ cell, reason: 'source-owner' }); continue;
    }
    const row = Math.floor(cell / columns), column = cell % columns, at = row * field.columns + column;
    const heights = [at, at + 1, at + field.columns, at + field.columns + 1].map(index => field.heights[index]);
    const base = SURFACES[field.surfaces[cell]].material, x = field.originX + column * field.spacing, z = field.originZ + row * field.spacing;
    const axisScale = Math.max(Math.abs(seam.line.nx), Math.abs(seam.line.nz));
    let reason = '', totalArea = 0;
    for (const triangle of triangles) {
      if (triangle.cell !== cell || triangle.sourceSurface !== field.surfaces[cell]
        || (triangle.sourceTriangle !== 0 && triangle.sourceTriangle !== 1)) { reason = 'source-identity'; break; }
      const allowed = triangle.role === 'base' ? triangle.appearance === base
        : triangle.role === 'drainage' ? seam.profile !== 'trail' && triangle.appearance === 'roughPavement'
          : triangle.role === (seam.profile === 'urban' ? 'flush-stone' : 'worn-shoulder') && triangle.appearance === seam.shoulder;
      if (!allowed) { reason = 'source-role'; break; }
      for (const vertex of triangle.vertices) {
        const weights = vertex.cornerWeights;
        const expectedY = weights.reduce((sum, value, index) => sum + value * heights[index], 0);
        if (weights.length !== 4 || !weights.every(value => Number.isFinite(value) && value >= -1e-8)
          || Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) >= 1e-8
          || Math.abs(weights[triangle.sourceTriangle === 0 ? 2 : 1]) >= 1e-8
          || ![vertex.x, vertex.y, vertex.z, expectedY].every(Number.isFinite)
          || Math.abs(vertex.x - x - field.spacing * (weights[1] + weights[3])) >= 1e-8
          || Math.abs(vertex.z - z - field.spacing * (weights[2] + weights[3])) >= 1e-8
          || Math.abs(vertex.y - expectedY) >= 1e-8) { reason = 'source-height-attributes'; break; }
        const distance = (seam.line.nx * vertex.x + seam.line.nz * vertex.z - seam.line.d) / axisScale;
        if (triangle.role === 'drainage' && (distance > 1e-8 || distance < -SHARED_EDGE_ASSEMBLY.drainageMetres - 1e-8)
          || triangle.role !== 'base' && triangle.role !== 'drainage' && (distance < -1e-8
            || distance > (triangle.role === 'flush-stone' ? SHARED_EDGE_ASSEMBLY.flushStoneMetres
              : SHARED_EDGE_ASSEMBLY.wornShoulderMetres + SHARED_EDGE_ASSEMBLY.naturalWidthVariationMetres) + 1e-8)) {
          reason = 'source-role-support'; break;
        }
      }
      if (reason) break;
      const [a, b, c] = triangle.vertices;
      totalArea += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    }
    if (!reason && Math.abs(totalArea - field.spacing * field.spacing) > Math.max(SHARED_EDGE_ASSEMBLY.epsilon * 32, field.spacing * field.spacing * 1e-9)) reason = 'source-partition-area';
    if (reason) failures.push({ cell, reason });
  }
  return failures;
}

/** Accept unchanged source data only. A failing component is restored as
 * complete reciprocal source pairs. No fragment is cherry-picked and no raw
 * source/role/height failure is interpreted as a harmless unsupported knee. */
export function planSelectiveSharedGroundEdgeAssembly(plan: LevelPlan, contour: EdgeFillField,
  options: { readonly maximumPasses?: number } = {}): SelectiveEdgeAssemblyPlan {
  const maximumPasses = options.maximumPasses ?? SHARED_EDGE_SELECTION.maximumPasses;
  if (!Number.isSafeInteger(maximumPasses) || maximumPasses < 1 || maximumPasses > SHARED_EDGE_SELECTION.maximumPasses) {
    throw new RangeError('Shared edge selection needs one to two bounded source passes');
  }
  const original = planSharedGroundEdgeAssembly(plan, contour), initialReport = original.report;
  let assembly = original;
  const candidates = new Map<string, EdgeAssemblySourceSeam>();
  const active = new Set<string>(), rejected = new Set<string>(), rejectedComponents = new Set<string>();
  for (const seam of original.sourceSeams ?? []) {
    const id = pairId(seam.a, seam.b);
    if (candidates.has(id)) throw new Error('Shared edge selection requires unique reciprocal source ownership');
    candidates.set(id, seam); active.add(id);
  }
  const history: SharedEdgeSelectionPass[] = [];
  let joins = edgeAssemblyJoinMismatches(plan.heightfield, assembly, plan);
  const initialJoinFailures = joins.length;
  let sourceIntegrityFailures = sharedEdgeSourceIntegrityFailures(plan, assembly);
  let components: SharedEdgeComponents | null = null;
  const componentBoundaryFailures: number[] = [];
  let joinRejectedPairs = 0, shortUrbanRuns = 0;
  const sorted = (ids: Iterable<string>) => [...ids].sort((a, b) => candidates.get(a)!.a - candidates.get(b)!.a
    || candidates.get(a)!.b - candidates.get(b)!.b);
  const finish = (selectionRefusal: SelectiveEdgeAssemblyReport['selectionRefusal']): SelectiveEdgeAssemblyPlan => ({ ...assembly,
    report: { ...assembly.report, selectionPolicy: 'whole-source-band-component',
      originalCandidatePairs: initialReport.pairedSeams, originalCandidatePairIds: sorted(candidates.keys()),
      selectedPairs: assembly.report.pairedSeams, selectedPairIds: sorted(active), rejectedPairs: rejected.size,
      rejectedPairIds: sorted(rejected), sourceComponents: components?.components.length ?? 0,
      selectedComponents: (components?.components.length ?? 0) - rejectedComponents.size, rejectedComponents: rejectedComponents.size,
      largestComponentPairs: components?.components.reduce((maximum, component) => Math.max(maximum, component.pairIds.length), 0) ?? 0,
      inspectedComponentBoundaries: components?.inspectedBoundaries ?? 0, dependencyComponentBoundaries: components?.dependencyBoundaries ?? 0,
      componentSelection: components?.components.map(component => ({ id: component.id, pairs: component.pairIds.length,
        rejected: rejectedComponents.has(component.id) })) ?? [],
      shortUrbanRunComponents: shortUrbanRuns, selectionIterations: history.length, selectionMaximumPasses: maximumPasses,
      initialJoinFailures, remainingJoinFailures: joins.length, initialRefusedPairs: initialReport.refusedPairs,
      initialProtectedCells: initialReport.protectedCells, selectionPasses: history,
      sourceIntegrityFailures, componentBoundaryFailures, selectionRefusal } });
  const record = (pass: number, pairIds: readonly string[] = [], componentIds: readonly string[] = []) =>
    history.push({ pass, selectedPairs: assembly.report.pairedSeams, joinFailures: joins.length,
      newlyRejectedPairIds: pairIds, newlyRejectedComponentIds: componentIds });
  const ownsCurrent = () => assembly.report.pairedSeams === active.size && initialReport.pairedSeams === candidates.size
    && (assembly.sourceSeams ?? []).length === active.size
    && (assembly.sourceSeams ?? []).every(seam => active.has(pairId(seam.a, seam.b)));
  if (sourceIntegrityFailures.length) { record(1); return finish('source-integrity'); }
  if (!ownsCurrent()) { record(1); return finish('ownership-drift'); }
  components = sharedEdgeSourceComponents(plan.heightfield, original.sourceSeams ?? []);
  if (joins.length && maximumPasses === 1) { record(1); return finish('pass-limit'); }
  const unsafeComponents = new Set<string>();
  for (const failure of joins) {
    const first = components.ownerByCell.get(failure.cell);
    if (!first || !active.has(first)) { record(1); return finish('unowned-join'); }
    unsafeComponents.add(components.componentByPair.get(first)!);
    const second = components.ownerByCell.get(failure.neighbour);
    if (second && active.has(second)) unsafeComponents.add(components.componentByPair.get(second)!);
  }
  if (joins.length && !unsafeComponents.size) { record(1); return finish('unowned-join'); }
  // A short kerb is cosmetic: a one-pass request keeps its old result.
  const shortRuns = maximumPasses === 1 ? new Set<string>()
    : shortUrbanRunComponents(plan.heightfield, original, components, candidates, unsafeComponents);
  if (!unsafeComponents.size && !shortRuns.size) { record(1); return finish(null); }
  // Only join-unsafe rejection may empty the selection into a refusal.
  joinRejectedPairs = components.components.reduce((sum, component) =>
    sum + (unsafeComponents.has(component.id) ? component.pairIds.length : 0), 0);
  for (const id of shortRuns) { unsafeComponents.add(id); shortUrbanRuns++; }
  const unsafePairIds: string[] = [], unsafeComponentIds: string[] = [];
  for (const component of components.components) if (unsafeComponents.has(component.id)) {
    unsafeComponentIds.push(component.id);
    for (const id of component.pairIds) unsafePairIds.push(id);
  }
  const newlyRejectedPairIds = sorted(unsafePairIds);
  record(1, newlyRejectedPairIds, unsafeComponentIds);
  const cells = new Map(contour.cells);
  for (const id of newlyRejectedPairIds) {
    const seam = candidates.get(id)!;
    cells.delete(seam.a); cells.delete(seam.b); active.delete(id); rejected.add(id);
  }
  for (const id of unsafeComponentIds) rejectedComponents.add(id);
  // No surviving owner can lose an originally band-supported neighbor.
  // Re-derive existing safe ends and all prices once from unchanged source.
  assembly = planSharedGroundEdgeAssembly(plan, { ...contour, cells });
  joins = edgeAssemblyJoinMismatches(plan.heightfield, assembly, plan);
  sourceIntegrityFailures = sharedEdgeSourceIntegrityFailures(plan, assembly);
  record(2);
  if (sourceIntegrityFailures.length) return finish('source-integrity');
  if (!ownsCurrent()) return finish('ownership-drift');
  // Exact source parity is an additional construction proof, not a relaxed
  // join. Any overlooked dependency refuses the complete selected assembly.
  for (const [cell, triangles] of assembly.replacements) {
    const prior = original.replacements.get(cell);
    if (!prior || triangles.length !== prior.length || triangles.some((triangle, index) => {
      const old = prior[index];
      return triangle.cell !== old.cell || triangle.sourceTriangle !== old.sourceTriangle || triangle.sourceSurface !== old.sourceSurface
        || triangle.role !== old.role || triangle.appearance !== old.appearance
        || triangle.vertices.some((vertex, corner) => {
          const before = old.vertices[corner];
          return !Object.is(vertex.x, before.x) || !Object.is(vertex.y, before.y) || !Object.is(vertex.z, before.z)
            || vertex.cornerWeights.some((weight, at) => !Object.is(weight, before.cornerWeights[at]));
        });
    })) componentBoundaryFailures.push(cell);
  }
  if (componentBoundaryFailures.length) return finish('component-boundary-drift');
  if (joins.length) return finish('pass-limit'); // Residuals are never silently re-pruned.
  return finish(initialReport.pairedSeams > 0 && joinRejectedPairs === candidates.size ? 'empty-selection' : null);
}

/** All-urban dependency components whose visible flush-stone kerb run is
 * shorter than the minimum. A run is the eight-connected set of surviving source
 * cells that carry flush stone, so a diagonal kerb built from many small
 * components stays one long run. Whole components only, never fragments. */
function shortUrbanRunComponents(field: Heightfield, assembly: EdgeAssemblyPlan, components: SharedEdgeComponents,
  seams: ReadonlyMap<string, EdgeAssemblySourceSeam>, rejected: ReadonlySet<string>): Set<string> {
  const columns = field.columns - 1, rows = field.rows - 1, flush = new Set<number>();
  for (const component of components.components) if (!rejected.has(component.id)) {
    for (const id of component.pairIds) for (const cell of [seams.get(id)!.a, seams.get(id)!.b]) {
      if ((assembly.replacements.get(cell) ?? []).some(triangle => triangle.role === 'flush-stone')) flush.add(cell);
    }
  }
  const run = new Map<number, number>();
  for (const start of flush) {
    if (run.has(start)) continue;
    const members = [start], stack = [start];
    run.set(start, 0);
    while (stack.length) {
      const cell = stack.pop()!, row = Math.floor(cell / columns), column = cell % columns;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const z = row + dz, x = column + dx, next = z * columns + x;
        if (x < 0 || z < 0 || x >= columns || z >= rows || !flush.has(next) || run.has(next)) continue;
        run.set(next, 0); members.push(next); stack.push(next);
      }
    }
    for (const cell of members) run.set(cell, members.length);
  }
  const short = new Set<string>();
  for (const component of components.components) {
    if (rejected.has(component.id)) continue;
    const pairs = component.pairIds.map(id => seams.get(id)!);
    if (!pairs.every(pair => pair.profile === 'urban')) continue;
    const longest = Math.max(0, ...pairs.flatMap(pair => [run.get(pair.a) ?? 0, run.get(pair.b) ?? 0]));
    if (longest < SHARED_EDGE_SELECTION.minimumUrbanRunCells) short.add(component.id);
  }
  return short;
}
