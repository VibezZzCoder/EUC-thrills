/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R21 SOURCE-ONLY / UNRUN. Conservative native-ground area certificate.
 * Render selection only: reads source ground; authors no path, hole or collider.
 * This is a polygon arrangement, not a regularly sampled walk or nine traces. */
import type { LevelPlan } from '../level/plan.ts';
import type { Vec3, SurfaceId } from '../simulation/world.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { sourceGroundSurfaceAt } from '../level/protectedSiteEligibility.ts';

interface Point { readonly x: number; readonly z: number }
interface Line { readonly x: number; readonly z: number; readonly limit: number }
export interface NativeEntryAreaCertificate {
  readonly bottom: number;
  readonly area: number;
  readonly nativeCells: number;
  readonly regions: number;
  readonly surfaceQualification: 'partition' | 'complete-native-triangles';
  readonly partitionVertices: readonly Vec3[];
}
const SURFACES = new Set<SurfaceId>(['pavement', 'roughPavement', 'brick', 'grass', 'gravel', 'dirt', 'wood', 'spill']);
const PAVED = new Set<SurfaceId>(['pavement', 'roughPavement', 'brick']);
const LIMITS = Object.freeze({ cells: 512, triangles: 1024, lines: 2048, regions: 16384,
  sourceTriangles: 65536, coordinate: 1e6, minimumSpacing: 1e-4 });

/** Sampler order is cell, -X, -Z, -X-Z; within each cell it is source patch
 * order. Every guard compares the ORIGINAL current cell surface, not the
 * preceding patch result. This intentionally matches PlanTerrainSampler. */
export function nativeEntrySurfaceAt(plan: LevelPlan, point: Vec3): SurfaceId | undefined {
  const source = sourceGroundSurfaceAt(plan, point); if (!source || !SURFACES.has(source)) return undefined;
  const f = plan.heightfield, fx = (point.x - f.originX) / f.spacing, fz = (point.z - f.originZ) / f.spacing;
  const column = Math.min(f.columns - 2, Math.floor(fx)), row = Math.min(f.rows - 2, Math.floor(fz));
  const cell = row * (f.columns - 1) + column, cells = [cell];
  if (fx - column < 1e-9 && column > 0) cells.push(cell - 1);
  if (fz - row < 1e-9 && row > 0) cells.push(cell - (f.columns - 1));
  if (fx - column < 1e-9 && fz - row < 1e-9 && column > 0 && row > 0) cells.push(cell - f.columns);
  let surface = source;
  for (const sourceCell of cells) for (const patch of plan.groundSurfacePatches ?? []) {
    if (patch.sourceSurface !== undefined && patch.sourceSurface !== source) continue;
    for (const triangle of patch.triangles) {
      if (triangle.cell !== sourceCell) continue;
      let positive = false, negative = false;
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle.vertices[edge], b = triangle.vertices[(edge + 1) % 3];
        const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
        if (cross > 1e-9) positive = true; if (cross < -1e-9) negative = true;
      }
      if (!(positive && negative)) surface = patch.surface;
    }
  }
  return surface;
}

const area = (polygon: readonly Point[]): number => Math.abs(polygon.reduce((sum, a, index) => {
  const b = polygon[(index + 1) % polygon.length]; return sum + a.x * b.z - a.z * b.x;
}, 0)) / 2;
const distance = (line: Line, point: Point): number => line.x * point.x + line.z * point.z - line.limit;
/** Sufficient coverage only: both original native triangles must be present
 * exactly, including all native support heights. Clipped/approximate fragments
 * never establish coverage by area sum, their bounds or endpoint samples. */
function completeNativeTriangle(plan: LevelPlan, cell: number, vertices: readonly Vec3[]): number {
  const f = plan.heightfield, column = cell % (f.columns - 1), row = Math.floor(cell / (f.columns - 1));
  const at = (u: number, v: number): Vec3 => ({ x: f.originX + (column + u) * f.spacing,
    z: f.originZ + (row + v) * f.spacing, y: f.heights[(row + v) * f.columns + column + u] });
  const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
  const same = (p: Vec3, q: Vec3): boolean => p.x === q.x && p.y === q.y && p.z === q.z;
  const matches = (native: readonly Vec3[]): boolean => native.every(p => vertices.some(q => same(p, q)));
  return matches([a, d, b]) ? 1 : matches([a, c, d]) ? 2 : 0;
}
/** A strict sufficient floating-point bound, never a larger sampler epsilon.
 * On an exact dyadic grid, origin/spacing and integer cell reconstruction are
 * exact. Source-cell subtraction and the two-products cross predicate have
 * errors bounded outward by 128*EPSILON*B^2 (B includes every relevant grid,
 * strip and source-origin coordinate). This also covers a rounded floor's
 * sub-ulp extension beyond its selected native cell. Require that bound to be
 * strictly smaller than the EXISTING 1e-9 membership epsilon. Larger/uncertain
 * grids refuse this shortcut and retain the full arrangement/refusal path. */
function exactNativeCoverageArithmetic(plan: LevelPlan, strip: readonly Point[], cells: ReadonlySet<number>): boolean {
  const f = plan.heightfield, exponent = Math.log2(f.spacing);
  if (!Number.isInteger(exponent) || 2 ** exponent !== f.spacing
    || !Number.isSafeInteger(f.originX / f.spacing) || !Number.isSafeInteger(f.originZ / f.spacing)) return false;
  let bound = Math.max(1, Math.abs(f.originX), Math.abs(f.originZ), f.spacing,
    ...strip.flatMap(p => [Math.abs(p.x), Math.abs(p.z)]));
  for (const cell of cells) {
    const column = cell % (f.columns - 1), row = Math.floor(cell / (f.columns - 1));
    for (const [origin, station] of [[f.originX, column], [f.originZ, row]] as const) {
      if (!Number.isSafeInteger(origin / f.spacing + station + 1)) return false;
      bound = Math.max(bound, Math.abs(origin + station * f.spacing), Math.abs(origin + (station + 1) * f.spacing));
    }
  }
  const error = 128 * Number.EPSILON * bound * bound;
  return Number.isFinite(error) && error < 1e-9;
}
function split(polygon: readonly Point[], line: Line): readonly (readonly Point[])[] | null {
  const negative: Point[] = [], positive: Point[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length], da = distance(line, a), db = distance(line, b);
    if (![da, db].every(Number.isFinite)) return null;
    if (da <= 0) negative.push(a); if (da >= 0) positive.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      // Start at the nearer endpoint and calculate its small weight directly.
      // Computing 1-t after t rounds to 1 loses a real boundary intersection.
      // The independent opposite-end fraction does not suffer that cancellation.
      const nearA = Math.abs(da) <= Math.abs(db), near = nearA ? a : b, far = nearA ? b : a;
      const nearDistance = nearA ? da : db, farDistance = nearA ? db : da;
      const t = nearDistance / (nearDistance - farDistance);
      const point = { x: near.x + (far.x - near.x) * t, z: near.z + (far.z - near.z) * t };
      if (!(t > 0 && t < 1) || ![point.x, point.z].every(Number.isFinite)
        || (point.x === a.x && point.z === a.z) || (point.x === b.x && point.z === b.z)) return null;
      negative.push(point); positive.push(point);
    }
  }
  const clean = (points: Point[]): Point[] => points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return point.x !== previous.x || point.z !== previous.z;
  });
  const pieces = [clean(negative), clean(positive)].filter(piece => piece.length >= 3 && area(piece) > 0);
  // Never silently discard a positive-area sliver or accept a numerical loss.
  if (!pieces.length || pieces.some(piece => !Number.isFinite(area(piece)))) return null;
  const before = area(polygon), after = pieces.reduce((sum, piece) => sum + area(piece), 0);
  if (Math.abs(after - before) > Math.max(1e-10, before * 1e-10)) return null;
  return pieces;
}

/** Certifies the entire closed 0.55m-wide strip, including both complete door
 * widths. Native cells/diagonals and patch membership half-space boundaries
 * partition it into convex regions. In the general arrangement, surface
 * classification is constant on each open region. The sufficient complete-cell
 * path instead proves every possible classification is paved. Source support
 * height is affine on each native triangle in both paths.
 * Vertices, edge midpoints and interior witnesses also check boundary priority.
 * Ill-conditioned/invalid/over-budget input returns null rather than sampling. */
export function nativeEntryWalkArea(plan: LevelPlan, origin: Vec3, yaw: number,
  x: number, servedX: number, doorHalfWidth: number): NativeEntryAreaCertificate | null {
  const f = plan.heightfield;
  if (![origin.x, origin.y, origin.z, yaw, x, servedX, doorHalfWidth].every(Number.isFinite)
    || !(doorHalfWidth > 0) || !Number.isFinite(f.spacing) || f.spacing < LIMITS.minimumSpacing
    || !Number.isSafeInteger(f.columns) || !Number.isSafeInteger(f.rows) || f.columns < 2 || f.rows < 2
    || !Number.isSafeInteger(f.columns * f.rows) || f.heights.length !== f.columns * f.rows
    || f.surfaces.length !== (f.columns - 1) * (f.rows - 1)) return null;
  const left = Math.min(servedX, x) - doorHalfWidth, right = Math.max(servedX, x) + doorHalfWidth;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (u: number, v: number): Point => ({ x: origin.x + c * u + s * v, z: origin.z - s * u + c * v });
  const strip = [at(left, 0.35), at(right, 0.35), at(right, 0.90), at(left, 0.90)];
  if (!strip.every(p => [p.x, p.z].every(value => Number.isFinite(value) && Math.abs(value) <= LIMITS.coordinate)
    && sourceGroundSurfaceAt(plan, { ...p, y: origin.y }) !== undefined)) return null;
  const minX = Math.min(...strip.map(p => p.x)), maxX = Math.max(...strip.map(p => p.x));
  const minZ = Math.min(...strip.map(p => p.z)), maxZ = Math.max(...strip.map(p => p.z));
  const firstColumn = Math.max(0, Math.floor((minX - f.originX) / f.spacing) - 1);
  const lastColumn = Math.min(f.columns - 2, Math.floor((maxX - f.originX) / f.spacing));
  const firstRow = Math.max(0, Math.floor((minZ - f.originZ) / f.spacing) - 1);
  const lastRow = Math.min(f.rows - 2, Math.floor((maxZ - f.originZ) / f.spacing));
  const cellCount = (lastColumn - firstColumn + 1) * (lastRow - firstRow + 1);
  if (!(cellCount > 0 && cellCount <= LIMITS.cells)) return null;
  const lines: Line[] = [], lineKeys = new Set<string>(), cells = new Set<number>();
  const addLine = (x: number, z: number, limit: number): boolean => {
    if (![x, z, limit].every(Number.isFinite) || Math.hypot(x, z) === 0) return false;
    const line = { x, z, limit }, ds = strip.map(p => distance(line, p));
    if (ds.every(d => d < 0) || ds.every(d => d > 0)) return true;
    // Exact numeric keys only: nearby epsilon membership boundaries must not
    // be merged into one line, or a thin priority/gap band could disappear.
    const key = [x, z, limit].join('/'); if (lineKeys.has(key)) return true;
    if (lines.length >= LIMITS.lines) return false;
    lineKeys.add(key); lines.push(line); return true;
  };
  for (let row = firstRow; row <= lastRow; row++) for (let column = firstColumn; column <= lastColumn; column++) {
    const cell = row * (f.columns - 1) + column, base = row * f.columns + column;
    cells.add(cell);
    if (!SURFACES.has(f.surfaces[cell]) || ![f.heights[base], f.heights[base + 1], f.heights[base + f.columns],
      f.heights[base + f.columns + 1]].every(Number.isFinite)) return null;
    const gx = f.originX + column * f.spacing, gz = f.originZ + row * f.spacing;
    // +epsilon lines delimit the sampler's touching-neighbour bands.
    for (const offset of [0, f.spacing * 1e-9]) {
      if (!addLine(1, 0, gx + offset) || !addLine(0, 1, gz + offset)) return null;
    }
    if (!addLine(1, -1, gx - gz)) return null;
  }
  const nativeLineCount = lines.length, completeCells = new Map<number, number>();
  let onlyPavedWrites = true;
  let sourceTriangles = 0, relevantTriangles = 0;
  for (const patch of plan.groundSurfacePatches ?? []) {
    if (!SURFACES.has(patch.surface) || (patch.sourceSurface !== undefined && !SURFACES.has(patch.sourceSurface))) return null;
    sourceTriangles += patch.triangles.length; if (sourceTriangles > LIMITS.sourceTriangles) return null;
    for (const triangle of patch.triangles) {
      if (!Number.isSafeInteger(triangle.cell) || triangle.cell < 0 || triangle.cell >= f.surfaces.length
        || triangle.vertices.length !== 3 || !triangle.vertices.every(p => [p.x, p.y, p.z].every(Number.isFinite))) return null;
      if (!cells.has(triangle.cell)) continue;
      if (++relevantTriangles > LIMITS.triangles) return null;
      const column = triangle.cell % (f.columns - 1), row = Math.floor(triangle.cell / (f.columns - 1));
      const gx = f.originX + column * f.spacing, gz = f.originZ + row * f.spacing;
      const vs = triangle.vertices;
      // Unknown malformed fragments cannot be treated as source ground.
      const winding = (vs[1].x - vs[0].x) * (vs[2].z - vs[0].z) - (vs[1].z - vs[0].z) * (vs[2].x - vs[0].x);
      if (!(winding < -1e-12) || area(vs) <= 1e-12 || vs.some(p => p.x < gx || p.x > gx + f.spacing || p.z < gz || p.z > gz + f.spacing
        || Math.abs(p.y - fieldHeightAt(f, plan.surround, p.x, p.z)) > 1e-8)) return null;
      const diagonals = vs.map(p => (p.x - gx) - (p.z - gz));
      if (diagonals.some(d => d < -1e-9) && diagonals.some(d => d > 1e-9)) return null;
      // A later/touching cell write may have a different original-source
      // guard. Reject the shortcut for ANY possibly encountered nonpaved
      // write; do not prune one by patch order, centre samples or its bounds.
      if (!PAVED.has(patch.surface)) onlyPavedWrites = false;
      else if (patch.sourceSurface === undefined || patch.sourceSurface === f.surfaces[triangle.cell]) {
        const native = completeNativeTriangle(plan, triangle.cell, vs);
        if (native) completeCells.set(triangle.cell, (completeCells.get(triangle.cell) ?? 0) | native);
      }
      for (let edge = 0; edge < 3; edge++) {
        const a = vs[edge], b = vs[(edge + 1) % 3], dx = b.x - a.x, dz = b.z - a.z;
        if (dx === 0 && dz === 0) return null;
        // Cross-product membership changes at -EPS/0/+EPS, exactly as the
        // sampler predicate. Do not assume the visually drawn edge is enough.
        for (const epsilon of [-1e-9, 0, 1e-9])
          if (!addLine(-dz, dx, -dz * a.x + dx * a.z + epsilon)) return null;
      }
    }
  }
  // Every source/touching cell is covered by raw paving or BOTH exact native
  // source triangles with a guard matching that cell's ORIGINAL surface.
  // Since every encountered patch write is paved, arbitrary cell/patch
  // priority still yields paved. This proves the complete cell area before
  // avoiding unnecessary epsilon patch boundaries; it does not sample them.
  // All source, triangle and line-work validation above remains mandatory.
  const needsPatchCoverage = [...cells].some(cell => !PAVED.has(f.surfaces[cell]));
  const completePaving = onlyPavedWrites && [...cells].every(cell => PAVED.has(f.surfaces[cell])
    || completeCells.get(cell) === 3) && (!needsPatchCoverage || exactNativeCoverageArithmetic(plan, strip, cells));
  const partitionLines = completePaving ? lines.slice(0, nativeLineCount) : lines;
  let regions: readonly (readonly Point[])[] = [strip];
  for (const line of partitionLines) {
    const next: (readonly Point[])[] = [];
    for (const region of regions) {
      const ds = region.map(p => distance(line, p));
      if (ds.every(d => d <= 0) || ds.every(d => d >= 0)) next.push(region);
      else { const parts = split(region, line); if (!parts) return null; next.push(...parts); }
      if (next.length > LIMITS.regions) return null;
    }
    regions = next;
  }
  const expectedArea = (right - left) * 0.55, actualArea = regions.reduce((sum, region) => sum + area(region), 0);
  if (!Number.isFinite(actualArea) || Math.abs(actualArea - expectedArea) > Math.max(1e-8, expectedArea * 1e-9)) return null;
  const partitionVertices: Vec3[] = []; let bottom = 0;
  for (const region of regions) {
    const centre = { x: region.reduce((sum, p) => sum + p.x, 0) / region.length,
      z: region.reduce((sum, p) => sum + p.z, 0) / region.length };
    const witnesses = [...region, centre, ...region.map((a, index) => {
      const b = region[(index + 1) % region.length]; return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    })];
    for (const p of witnesses) {
      const y = fieldHeightAt(f, plan.surround, p.x, p.z), point = { ...p, y };
      const surface = nativeEntrySurfaceAt(plan, point);
      if (!Number.isFinite(y) || Math.abs(y - origin.y) > 0.12 || !surface || !PAVED.has(surface)) return null;
      // Using the strip maximum is conservative for the closed door's foot.
      bottom = Math.max(bottom, y - origin.y);
    }
    partitionVertices.push(...region.map(p => ({ ...p, y: fieldHeightAt(f, plan.surround, p.x, p.z) })));
  }
  return { bottom, area: actualArea, nativeCells: cellCount, regions: regions.length,
    surfaceQualification: completePaving ? 'complete-native-triangles' : 'partition', partitionVertices };
}
