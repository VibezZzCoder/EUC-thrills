/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R18 source-supported edge construction, render-only plain data.
 * Replaces affected source triangles; it is not a raised curb, ground patch,
 * depth-offset overlay, material owner or new route/surface admission rule.
 */
import { SURFACES, type MaterialId } from '../data/surfaces.ts';
import type { GroundSurfaceTriangle, Heightfield, LevelPlan } from '../level/plan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import type { EdgeFillField, EdgeLine } from './groundBoundary.ts';
import { groundHazardMask } from './groundBoundaryPolicy.ts';

/** Geometry dimensions in metres along a contour's dominant source axis.
 * Perpendicular width is never larger. These are visible construction widths,
 * not revised source-coverage or presentation limits. */
export const SHARED_EDGE_ASSEMBLY = Object.freeze({
  drainageMetres: 0.16,
  flushStoneMetres: 0.22,
  wornShoulderMetres: 0.25,
  naturalWidthVariationMetres: 0.04,
  epsilon: 1e-10,
});
export type EdgeAssemblyRole = 'base' | 'flush-stone' | 'drainage' | 'worn-shoulder';
export interface EdgeAssemblyVertex extends Vec3 {
  /** Interpolate the original cell's colour, smooth normal, AO and line
   * attributes with these same weights. Never re-sample a height or a normal.
   * Corner order is h00, h10, h01, h11. */
  readonly cornerWeights: readonly [number, number, number, number];
}
export interface EdgeAssemblyTriangle {
  readonly cell: number;
  readonly sourceTriangle: 0 | 1;
  /** Parent physical material/surface remain facts, including under bands. */
  readonly sourceSurface: SurfaceId;
  readonly role: EdgeAssemblyRole;
  readonly appearance: MaterialId;
  readonly vertices: readonly [EdgeAssemblyVertex, EdgeAssemblyVertex, EdgeAssemblyVertex];
}
export interface EdgeAssemblyReport {
  readonly pairedSeams: number;
  readonly replacedCells: number;
  readonly originalTriangles: number;
  readonly triangles: number;
  readonly addedTriangles: number;
  readonly roleTriangles: Readonly<Record<EdgeAssemblyRole, number>>;
  readonly bandMaterials: readonly MaterialId[];
  readonly refusedPairs: number;
  readonly protectedCells: number;
  readonly exactPatchPieces: number;
  /** Source-plane taper candidates; these are construction, never coverage claims. */
  readonly terminalTreatments: number;
  readonly terminalCells: number;
  readonly terminalBoundaries: Readonly<Record<'untouched' | 'hazard' | 'precise-patch' | 'frame', number>>;
}
/** A reciprocal contour pair already accepted by the constructor. Its metric
 * line can authorize a role transition only when it coincides with the entire
 * shared physical source edge; different surfaces alone grant no exception. */
export interface EdgeAssemblySourceSeam {
  readonly a: number;
  readonly b: number;
  readonly line: EdgeLine;
  readonly profile: 'urban' | 'road-verge' | 'trail';
  readonly shoulder: MaterialId;
}
export interface EdgeAssemblyPlan {
  /** Every present cell supplies its complete source-triangle partition.
   * Omit the parent's original six indices, then draw these fragments.
   * Missing cells retain their original mesh and boundary attributes. */
  readonly replacements: ReadonlyMap<number, readonly EdgeAssemblyTriangle[]>;
  /** Missing ownership retains the strict same-role comparison. */
  readonly sourceSeams?: readonly EdgeAssemblySourceSeam[];
  readonly report: EdgeAssemblyReport;
}
export interface EdgeAssemblyJoinMismatch {
  readonly cell: number;
  readonly neighbour: number;
  readonly direction: 'x' | 'z';
  readonly reason?: 'paired-disagreement' | 'missing-continuation';
  readonly terminal?: { readonly boundary: 'untouched' | 'hazard' | 'precise-patch' | 'frame'; readonly bound: number; readonly origin: number; readonly inward: -1 | 1 };
  readonly first: readonly { role: EdgeAssemblyRole; appearance: MaterialId; from: number; to: number }[];
  readonly second: readonly { role: EdgeAssemblyRole; appearance: MaterialId; from: number; to: number }[];
}
const epsilon = SHARED_EDGE_ASSEMBLY.epsilon;
type Polygon = EdgeAssemblyVertex[];
type Plane = (vertex: EdgeAssemblyVertex) => number;
interface Fragment { polygon: Polygon; role: EdgeAssemblyRole; appearance: MaterialId }
type Pair = EdgeAssemblySourceSeam;
const road = (material: MaterialId) => material === 'pavement' || material === 'roughPavement';
const hard = (material: MaterialId) => material === 'brick' || material === 'concrete';
const natural = (material: MaterialId) => material === 'grass' || material === 'dirt' || material === 'gravel';

function interpolate(a: EdgeAssemblyVertex, b: EdgeAssemblyVertex, fraction: number): EdgeAssemblyVertex {
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
    cornerWeights: a.cornerWeights.map((value, index) => value + (b.cornerWeights[index] - value) * fraction) as unknown as EdgeAssemblyVertex['cornerWeights'] };
}
function clip(polygon: readonly EdgeAssemblyVertex[], plane: Plane): Polygon {
  const out: Polygon = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const da = plane(a), db = plane(b), insideA = da >= 0, insideB = db >= 0;
    if (insideA) out.push(a);
    if (insideA !== insideB) out.push(interpolate(a, b, da / (da - db)));
  }
  const clean: Polygon = [];
  for (const vertex of out) {
    const prior = clean.at(-1);
    if (!prior || Math.hypot(prior.x - vertex.x, prior.z - vertex.z) > epsilon) clean.push(vertex);
  }
  if (clean.length > 1 && Math.hypot(clean[0].x - clean.at(-1)!.x, clean[0].z - clean.at(-1)!.z) <= epsilon) clean.pop();
  return clean;
}
function area(polygon: readonly Vec3[]): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]; twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) * 0.5;
}

/** Authoritative h00--h11 triangles, matching planSampler and streetFronts.
 * The separately guarded terrain diagonal proposal must land first. */
export function authoritativeCellTriangles(field: Heightfield, cell: number): readonly [Polygon, Polygon] {
  const columns = field.columns - 1, row = Math.floor(cell / columns), column = cell % columns;
  const point = (dx: 0 | 1, dz: 0 | 1): EdgeAssemblyVertex => {
    const weights = [0, 0, 0, 0]; weights[dx + dz * 2] = 1;
    return { x: field.originX + (column + dx) * field.spacing,
      y: field.heights[(row + dz) * field.columns + column + dx],
      z: field.originZ + (row + dz) * field.spacing,
      cornerWeights: weights as unknown as EdgeAssemblyVertex['cornerWeights'] };
  };
  const a = point(0, 0), b = point(1, 0), c = point(0, 1), d = point(1, 1);
  return [[a, d, b], [a, c, d]];
}

/** Subtract an exact existing patch from a band. The removed piece returns
 * to base, rather than making a hole or assigning the patch's physical id.
 * Splitting in XZ interpolates the source triangle's Y/attributes exactly. */
function protectPatch(fragment: Fragment, patch: GroundSurfaceTriangle, base: MaterialId): Fragment[] {
  if (fragment.role === 'base') return [fragment];
  const vertices = patch.vertices;
  let orientation = 0;
  for (let i = 0; i < 3; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 3]; orientation += a.x * b.z - b.x * a.z;
  }
  if (Math.abs(orientation) <= epsilon) return [fragment];
  const sign = orientation > 0 ? 1 : -1;
  let remaining = fragment.polygon;
  const outside: Fragment[] = [];
  for (let i = 0; i < 3 && remaining.length >= 3; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 3];
    const plane: Plane = vertex => sign * ((b.x - a.x) * (vertex.z - a.z) - (b.z - a.z) * (vertex.x - a.x));
    const part = clip(remaining, vertex => -plane(vertex));
    if (part.length >= 3 && area(part) > epsilon) outside.push({ ...fragment, polygon: part });
    remaining = clip(remaining, plane);
  }
  if (remaining.length >= 3 && area(remaining) > epsilon) outside.push({ polygon: remaining, role: 'base', appearance: base });
  return outside;
}
function opposite(a: EdgeLine, b: EdgeLine): boolean {
  return Math.abs(a.nx + b.nx) < epsilon && Math.abs(a.nz + b.nz) < epsilon && Math.abs(a.d + b.d) < epsilon;
}
function classify(a: MaterialId, b: MaterialId): { profile: Pair['profile']; shoulder: MaterialId; positive: MaterialId } | null {
  if ((road(a) && hard(b)) || (road(b) && hard(a))) return { profile: 'urban', shoulder: 'concrete', positive: road(a) ? b : a };
  if ((road(a) && natural(b)) || (road(b) && natural(a))) {
    const other = road(a) ? b : a;
    return { profile: 'road-verge', shoulder: other === 'gravel' ? 'gravel' : 'dirt', positive: other };
  }
  if ((a === 'grass' && (b === 'dirt' || b === 'gravel')) || (b === 'grass' && (a === 'dirt' || a === 'gravel'))) {
    return { profile: 'trail', shoulder: a === 'grass' ? b : a, positive: 'grass' };
  }
  return null;
}

/** No new contour inference: assemblies follow only a proved reciprocal,
 * single-line shared contour. Thin features, multi-line junctions, legacy
 * one-sided claims, wood and spill retain their existing treatment. */
export function planSharedGroundEdgeAssembly(plan: LevelPlan, contour: EdgeFillField): EdgeAssemblyPlan {
  const field = plan.heightfield;
  const excluded = groundHazardMask(plan), exact = new Map<number, GroundSurfaceTriangle[]>();
  for (const patch of plan.groundSurfacePatches ?? []) for (const triangle of patch.triangles) {
    const prior = exact.get(triangle.cell); if (prior) prior.push(triangle); else exact.set(triangle.cell, [triangle]);
    // Living-world courts and bays keep the shared contour, never a band:
    // their cut fragments would reject whole long kerb/verge components.
    if (patch.id.startsWith('living-ground/')) excluded[triangle.cell] = 1;
  }
  const material = (cell: number) => SURFACES[field.surfaces[cell]].material;
  const pairs: Pair[] = [];
  let refusedPairs = 0, protectedCells = 0;
  for (const [a, fill] of contour.cells) {
    const b = fill.source;
    if (a >= b) continue;
    const mate = contour.cells.get(b);
    const profile = classify(material(a), material(b));
    if (!profile) continue;
    if (excluded[a] || excluded[b]) { protectedCells += 2; continue; }
    if (fill.lines.length !== 1 || !mate || mate.source !== a || mate.lines.length !== 1
      || !opposite(fill.lines[0], mate.lines[0])
      || ![fill.lines[0].nx, fill.lines[0].nz, fill.lines[0].d].every(Number.isFinite)
      || Math.abs(Math.hypot(fill.lines[0].nx, fill.lines[0].nz) - 1) > epsilon) { refusedPairs++; continue; }
    const raw = fill.lines[0], sign = material(b) === profile.positive ? 1 : -1;
    // Convert the unit-normal grid line to metres. distanceScale is only a
    // packed material-shoulder adjustment and must not move the metric seam.
    const nx = raw.nx * sign, nz = raw.nz * sign;
    pairs.push({ a, b, profile: profile.profile, shoulder: profile.shoulder,
      line: { nx, nz, d: raw.d * sign * field.spacing + nx * field.originX + nz * field.originZ } });
  }
  const replacements = new Map<number, readonly EdgeAssemblyTriangle[]>();
  const cellPairs = new Map<number, Pair>();
  const roleTriangles: Record<EdgeAssemblyRole, number> = { base: 0, 'flush-stone': 0, drainage: 0, 'worn-shoulder': 0 };
  const bandMaterials = new Set<MaterialId>();
  let exactPatchPieces = 0;
  for (const pair of pairs) for (const cell of [pair.a, pair.b]) {
    // One reciprocal source pair owns a cell. Conflicting ownership is a
    // refusal, never a second layer or an arbitrary wider winning strip.
    if (replacements.has(cell)) throw new Error(`Shared edge assembly duplicated source cell ${cell}`);
    cellPairs.set(cell, pair);
    const base = material(cell), fragments: EdgeAssemblyTriangle[] = [];
    // Adjacent taut segments can have different metric normals at a knee.
    // A constant perpendicular offset would cross the shared source edge at
    // two different points, leaving a sliver. Dominant-axis courses meet at
    // exactly the same point for segments constructed in the same frame.
    // Their perpendicular width only contracts; it never grows beyond the
    // named metre width. Frame switches remain an explicit join tripwire.
    const axisScale = Math.max(Math.abs(pair.line.nx), Math.abs(pair.line.nz));
    const distance: Plane = vertex => (pair.line.nx * vertex.x + pair.line.nz * vertex.z - pair.line.d) / axisScale;
    for (const [sourceTriangle, source] of authoritativeCellTriangles(field, cell).entries()) {
      // Natural widths are a continuous affine approximation of a bounded
      // world-space wear field on this source triangle. Shared source edges
      // evaluate the same corner values; neither texture padding nor RNG.
      const wearAtCorner = source.map(vertex => SHARED_EDGE_ASSEMBLY.wornShoulderMetres
        + SHARED_EDGE_ASSEMBLY.naturalWidthVariationMetres * Math.sin(vertex.x * 0.37 + vertex.z * 0.29));
      const [p, q, r] = source;
      const determinant = (q.x - p.x) * (r.z - p.z) - (r.x - p.x) * (q.z - p.z);
      const width: Plane = vertex => {
        const u = ((vertex.x - p.x) * (r.z - p.z) - (r.x - p.x) * (vertex.z - p.z)) / determinant;
        const v = ((q.x - p.x) * (vertex.z - p.z) - (vertex.x - p.x) * (q.z - p.z)) / determinant;
        return wearAtCorner[0] + (wearAtCorner[1] - wearAtCorner[0]) * u + (wearAtCorner[2] - wearAtCorner[0]) * v;
      };
      const edgeWidth: Plane = pair.profile === 'urban' ? () => SHARED_EDGE_ASSEMBLY.flushStoneMetres : width;
      const slots: Fragment[] = [];
      const put = (polygon: Polygon, role: EdgeAssemblyRole, appearance: MaterialId) => {
        if (polygon.length >= 3 && area(polygon) > epsilon) slots.push({ polygon, role, appearance });
      };
      if (pair.profile !== 'trail') {
        put(clip(source, vertex => -distance(vertex) - SHARED_EDGE_ASSEMBLY.drainageMetres), 'base', base);
        put(clip(clip(source, vertex => distance(vertex) + SHARED_EDGE_ASSEMBLY.drainageMetres), vertex => -distance(vertex)),
          'drainage', 'roughPavement');
      } else put(clip(source, vertex => -distance(vertex)), 'base', base);
      put(clip(clip(source, distance), vertex => edgeWidth(vertex) - distance(vertex)),
        pair.profile === 'urban' ? 'flush-stone' : 'worn-shoulder', pair.shoulder);
      put(clip(source, vertex => distance(vertex) - edgeWidth(vertex)), 'base', base);
      let protectedSlots = slots;
      for (const triangle of exact.get(cell) ?? []) {
        const next = protectedSlots.flatMap(fragment => protectPatch(fragment, triangle, base));
        exactPatchPieces += next.length - protectedSlots.length;
        protectedSlots = next;
      }
      for (const fragment of protectedSlots) for (let index = 1; index + 1 < fragment.polygon.length; index++) {
        const vertices = [fragment.polygon[0], fragment.polygon[index], fragment.polygon[index + 1]] as const;
        if (area(vertices) <= epsilon) continue;
        fragments.push({ cell, sourceTriangle: sourceTriangle as 0 | 1, sourceSurface: field.surfaces[cell],
          role: fragment.role, appearance: fragment.appearance, vertices });
        roleTriangles[fragment.role]++;
        if (fragment.role !== 'base') bandMaterials.add(fragment.appearance);
      }
    }
    const total = fragments.reduce((sum, fragment) => sum + area(fragment.vertices), 0);
    if (Math.abs(total - field.spacing * field.spacing) > Math.max(epsilon * 32, field.spacing * field.spacing * 1e-9)) {
      throw new Error(`Shared edge assembly does not partition source cell ${cell}: ${total}`);
    }
    replacements.set(cell, fragments);
  }
  const preliminary: EdgeAssemblyPlan = { replacements, sourceSeams: pairs, report: { pairedSeams: pairs.length, replacedCells: replacements.size,
    originalTriangles: replacements.size * 2, triangles: 0, addedTriangles: 0,
    roleTriangles, bandMaterials: [...bandMaterials].sort(), refusedPairs, protectedCells, exactPatchPieces,
    terminalTreatments: 0, terminalCells: 0, terminalBoundaries: { untouched: 0, hazard: 0, 'precise-patch': 0, frame: 0 } } };
  const terminals = edgeAssemblyJoinMismatches(field, preliminary, plan).filter(failure => failure.terminal);
  const terminalBoundaries = { untouched: 0, hazard: 0, 'precise-patch': 0, frame: 0 };
  const byCell = new Map<number, typeof terminals>();
  for (const terminal of terminals) {
    terminalBoundaries[terminal.terminal!.boundary]++;
    const list = byCell.get(terminal.cell) ?? []; list.push(terminal); byCell.set(terminal.cell, list);
  }
  // Clip the already source-supported bands with affine taper planes. Every
  // removed fragment returns to its ORIGINAL physical source appearance.
  // Width reaches zero at a terminal source edge; no raised cap, patch, new
  // mask or sampler value. Protected fragments remain base throughout.
  for (const [cell, endings] of byCell) {
    const pair = cellPairs.get(cell)!;
    const axisScale = Math.max(Math.abs(pair.line.nx), Math.abs(pair.line.nz));
    const signed = (vertex: EdgeAssemblyVertex) => (pair.line.nx * vertex.x + pair.line.nz * vertex.z - pair.line.d) / axisScale;
    const out: EdgeAssemblyTriangle[] = [];
    for (const triangle of replacements.get(cell)!) {
      if (triangle.role === 'base') { out.push(triangle); continue; }
      let pieces: Fragment[] = [{ polygon: [...triangle.vertices], role: triangle.role, appearance: triangle.appearance }];
      for (const ending of endings) {
        const terminal = ending.terminal!, width = triangle.role === 'drainage' ? SHARED_EDGE_ASSEMBLY.drainageMetres
          : triangle.role === 'flush-stone' ? SHARED_EDGE_ASSEMBLY.flushStoneMetres
          : SHARED_EDGE_ASSEMBLY.wornShoulderMetres + SHARED_EDGE_ASSEMBLY.naturalWidthVariationMetres;
        const plane: Plane = vertex => width / field.spacing * terminal.inward
          * ((ending.direction === 'x' ? vertex.x : vertex.z) - terminal.bound)
          + (triangle.role === 'drainage' ? signed(vertex) : -signed(vertex));
        pieces = pieces.flatMap(piece => {
          if (piece.role === 'base') return [piece];
          const keep = clip(piece.polygon, plane), restore = clip(piece.polygon, vertex => -plane(vertex));
          return [{ polygon: keep, role: piece.role, appearance: piece.appearance },
            { polygon: restore, role: 'base' as const, appearance: material(cell) }]
            .filter(part => part.polygon.length >= 3 && area(part.polygon) > epsilon);
        });
      }
      for (const piece of pieces) for (let i = 1; i + 1 < piece.polygon.length; i++) {
        const vertices = [piece.polygon[0], piece.polygon[i], piece.polygon[i + 1]] as const;
        if (area(vertices) > epsilon) out.push({ ...triangle, role: piece.role, appearance: piece.appearance, vertices });
      }
    }
    const total = out.reduce((sum, triangle) => sum + area(triangle.vertices), 0);
    if (Math.abs(total - field.spacing * field.spacing) > Math.max(epsilon * 32, field.spacing * field.spacing * 1e-9)) {
      throw new Error(`Terminal taper does not partition source cell ${cell}: ${total}`);
    }
    replacements.set(cell, out);
  }
  for (const role of Object.keys(roleTriangles) as EdgeAssemblyRole[]) roleTriangles[role] = 0;
  bandMaterials.clear();
  for (const triangles of replacements.values()) for (const triangle of triangles) {
    roleTriangles[triangle.role]++; if (triangle.role !== 'base') bandMaterials.add(triangle.appearance);
  }
  const triangles = Object.values(roleTriangles).reduce((sum, count) => sum + count, 0);
  return { replacements, sourceSeams: pairs, report: { pairedSeams: pairs.length, replacedCells: replacements.size,
    originalTriangles: replacements.size * 2, triangles, addedTriangles: triangles - replacements.size * 2,
    roleTriangles, bandMaterials: [...bandMaterials].sort(), refusedPairs, protectedCells, exactPatchPieces,
    terminalTreatments: terminals.length, terminalCells: byCell.size, terminalBoundaries } };
}

/** Exact source-edge continuity tripwire. Longitudinal/bent band intervals
 * must agree in role, appearance and support. A reciprocal metric contour
 * coincident with its complete physical source edge instead requires the
 * profile's exact incident roles, original source identity and full coverage
 * on both sides. This is a proved source transition, not a differing-surface
 * waiver. Bent-contour offsets still need a bevel/miter before continuity.
 * All four boundaries are compared, including untouched/protected/frame cells.
 * A deleted terminal replacement therefore cannot erase the obligation.
 */
export function edgeAssemblyJoinMismatches(field: Heightfield, assembly: EdgeAssemblyPlan, plan?: LevelPlan): EdgeAssemblyJoinMismatch[] {
  const hazards = plan ? groundHazardMask(plan) : null;
  const precise = new Set(plan?.groundSurfacePatches?.flatMap(patch => patch.triangles.map(triangle => triangle.cell)) ?? []);
  const out: EdgeAssemblyJoinMismatch[] = [], columns = field.columns - 1, rows = field.rows - 1;
  const intervals = (cell: number, direction: 'x' | 'z', bound: number, origin: number, includeBase = false) => {
    const parts: EdgeAssemblyJoinMismatch['first'][number][] = [];
    for (const triangle of assembly.replacements.get(cell) ?? []) {
      if (triangle.role === 'base' && !includeBase) continue;
      const points = triangle.vertices.filter(vertex => Math.abs((direction === 'x' ? vertex.x : vertex.z) - bound) < 1e-8)
        .map(vertex => ((direction === 'x' ? vertex.z : vertex.x) - origin) / field.spacing);
      if (points.length < 2) continue;
      const from = Math.min(...points), to = Math.max(...points);
      if (to - from > 1e-8) parts.push({ role: triangle.role, appearance: triangle.appearance, from, to });
    }
    parts.sort((a, b) => a.role.localeCompare(b.role) || a.appearance.localeCompare(b.appearance) || a.from - b.from);
    const merged: typeof parts = [];
    for (const part of parts) {
      const prior = merged.at(-1);
      if (prior && prior.role === part.role && prior.appearance === part.appearance && Math.abs(prior.to - part.from) < 1e-8) {
        merged[merged.length - 1] = { ...prior, to: part.to };
      } else merged.push(part);
    }
    return merged;
  };
  // Retain explicit accepted ownership: a material change or a nearby line
  // cannot manufacture this exception. Duplicate metadata has no owner.
  const seamKey = (a: number, b: number) => `${Math.min(a, b)}/${Math.max(a, b)}`;
  const sourceSeams = new Map<string, EdgeAssemblySourceSeam | null>();
  for (const seam of assembly.sourceSeams ?? []) {
    const key = seamKey(seam.a, seam.b);
    sourceSeams.set(key, sourceSeams.has(key) ? null : seam);
  }
  /** null means this is not a coincident owned source seam: keep the old
   * strict interval predicate. false means a claimed coincident transition
   * is corrupt, and must not fall back to equality of arbitrary roles. */
  const sourceTransition = (cell: number, neighbour: number, direction: 'x' | 'z', bound: number, origin: number): boolean | null => {
    const seam = sourceSeams.get(seamKey(cell, neighbour));
    if (!seam) return null;
    const { nx, nz, d } = seam.line;
    const at = (along: number) => direction === 'x' ? nx * bound + nz * along - d : nx * along + nz * bound - d;
    if (Math.abs(at(origin)) >= 1e-8 || Math.abs(at(origin + field.spacing)) >= 1e-8) return null;
    const own = SURFACES[field.surfaces[cell]].material, other = SURFACES[field.surfaces[neighbour]].material;
    const profile = classify(own, other);
    if (!profile || profile.profile !== seam.profile || profile.shoulder !== seam.shoulder
      || ![nx, nz, d].every(Number.isFinite) || Math.abs(Math.hypot(nx, nz) - 1) > epsilon) return false;
    const centreDistance = (source: number) => {
      const x = field.originX + (source % columns + 0.5) * field.spacing;
      const z = field.originZ + (Math.floor(source / columns) + 0.5) * field.spacing;
      return nx * x + nz * z - d;
    };
    // The constructor orients positive towards the profile's named material.
    // Check both source centres rather than trusting a role copied in metadata.
    const positive = (source: number) => SURFACES[field.surfaces[source]].material === profile.positive;
    for (const source of [cell, neighbour]) {
      const distance = centreDistance(source);
      if (positive(source) ? distance <= epsilon : distance >= -epsilon) return false;
      if (!(assembly.replacements.get(source) ?? []).every(triangle => triangle.cell === source
        && triangle.sourceSurface === field.surfaces[source])) return false;
    }
    const expected = (source: number): { role: EdgeAssemblyRole; appearance: MaterialId } => positive(source)
      ? { role: profile.profile === 'urban' ? 'flush-stone' : 'worn-shoulder', appearance: profile.shoulder }
      : profile.profile === 'trail' ? { role: 'base', appearance: SURFACES[field.surfaces[source]].material }
        : { role: 'drainage', appearance: 'roughPavement' };
    // Include the trail's negative base side. Every claimed source seam must
    // cover its entire edge exactly once; equal shifted/gapped ends are invalid.
    return [cell, neighbour].every(source => {
      const parts = intervals(source, direction, bound, origin, true), side = expected(source);
      return parts.length === 1 && parts[0].role === side.role && parts[0].appearance === side.appearance
        && Math.abs(parts[0].from) < 1e-8 && Math.abs(parts[0].to - 1) < 1e-8;
    });
  };
  for (const cell of assembly.replacements.keys()) {
    const row = Math.floor(cell / columns), column = cell % columns;
    for (const [direction, step] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]] as const) {
      const frame = direction === 'x' ? column + step < 0 || column + step >= columns : row + step < 0 || row + step >= rows;
      const neighbour = frame ? -1 : cell + (direction === 'x' ? step : step * columns);
      const paired = !frame && assembly.replacements.has(neighbour);
      if (paired && step < 0) continue; // Each reciprocal boundary once.
      const bound = direction === 'x' ? field.originX + (column + (step > 0 ? 1 : 0)) * field.spacing
        : field.originZ + (row + (step > 0 ? 1 : 0)) * field.spacing;
      const origin = direction === 'x' ? field.originZ + row * field.spacing : field.originX + column * field.spacing;
      const first = intervals(cell, direction, bound, origin), second = paired ? intervals(neighbour, direction, bound, origin) : [];
      const transition = paired ? sourceTransition(cell, neighbour, direction, bound, origin) : null;
      const same = transition ?? (first.length === second.length && first.every((part, index) => part.role === second[index].role
        && part.appearance === second[index].appearance && Math.abs(part.from - second[index].from) < 1e-8
        && Math.abs(part.to - second[index].to) < 1e-8));
      if (!same) out.push({ cell, neighbour, direction, first, second,
        reason: paired ? 'paired-disagreement' : 'missing-continuation',
        ...(paired ? {} : { terminal: { boundary: frame ? 'frame' : hazards?.[neighbour] ? 'hazard'
          : precise.has(neighbour) ? 'precise-patch' : 'untouched', bound, origin, inward: (step > 0 ? -1 : 1) as -1 | 1 } }) });
    }
  }
  return out;
}
