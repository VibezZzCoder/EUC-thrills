/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact-safe broad phase shared by authoring predicates. Pure data; no plan,
 * world or renderer dependency. */
export interface SpatialBounds { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
const finite = (...values: number[]): boolean => values.every(Number.isFinite);
/** Uniform grid over finite coordinate rectangles. It answers only "does any
 * item satisfy this pure predicate", so the visiting order is immaterial.
 * Every item whose rectangle meets the query rectangle is visited; items with
 * non-finite rectangles are always visited. */
export interface RectGrid<T> {
  readonly values: readonly T[];
  readonly minX: Float64Array; readonly maxX: Float64Array;
  readonly minZ: Float64Array; readonly maxZ: Float64Array;
  readonly originX: number; readonly originZ: number; readonly cell: number;
  readonly columns: number; readonly rows: number;
  /** Compressed buckets: items of cell k are entries[starts[k]..starts[k+1]). */
  readonly starts: Int32Array;
  readonly entries: Int32Array;
  readonly wide: readonly number[];
  readonly unbounded: readonly number[];
  readonly stamps: Uint32Array;
  stamp: number;
}
export function rectGrid<T>(values: readonly T[], rect: (value: T) => SpatialBounds | undefined): RectGrid<T> {
  const count = values.length;
  const minX = new Float64Array(count), maxX = new Float64Array(count);
  const minZ = new Float64Array(count), maxZ = new Float64Array(count);
  const unbounded: number[] = [], bounded: number[] = [];
  let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity;
  for (let index = 0; index < count; index += 1) {
    const bounds = rect(values[index]);
    if (!bounds || !finite(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ)
      || bounds.maxX < bounds.minX || bounds.maxZ < bounds.minZ) { unbounded.push(index); continue; }
    minX[index] = bounds.minX; maxX[index] = bounds.maxX; minZ[index] = bounds.minZ; maxZ[index] = bounds.maxZ;
    bounded.push(index);
    lowX = Math.min(lowX, bounds.minX); highX = Math.max(highX, bounds.maxX);
    lowZ = Math.min(lowZ, bounds.minZ); highZ = Math.max(highZ, bounds.maxZ);
  }
  let cell = 8, columns = 1, rows = 1;
  if (bounded.length) {
    while ((highX - lowX) / cell * ((highZ - lowZ) / cell) > 1 << 20) cell *= 2;
    columns = Math.floor((highX - lowX) / cell) + 1; rows = Math.floor((highZ - lowZ) / cell) + 1;
  }
  const cells = bounded.length ? columns * rows : 0;
  const starts = new Int32Array(cells + 1);
  const wide: number[] = [], placed: number[] = [];
  const range = (index: number): readonly [number, number, number, number] => [
    Math.floor((minX[index] - lowX) / cell), Math.floor((maxX[index] - lowX) / cell),
    Math.floor((minZ[index] - lowZ) / cell), Math.floor((maxZ[index] - lowZ) / cell)];
  // Counting sort into compressed rows: count, prefix sum, scatter.
  for (const index of bounded) {
    const [c0, c1, r0, r1] = range(index);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > 64) { wide.push(index); continue; }
    placed.push(index);
    for (let row = r0; row <= r1; row += 1) for (let column = c0; column <= c1; column += 1) starts[row * columns + column + 1] += 1;
  }
  for (let k = 0; k < cells; k += 1) starts[k + 1] += starts[k];
  const entries = new Int32Array(cells ? starts[cells] : 0), fill = starts.slice(0, Math.max(cells, 1));
  for (const index of placed) {
    const [c0, c1, r0, r1] = range(index);
    for (let row = r0; row <= r1; row += 1) for (let column = c0; column <= c1; column += 1) entries[fill[row * columns + column]++] = index;
  }
  return { values, minX, maxX, minZ, maxZ, originX: bounded.length ? lowX : 0, originZ: bounded.length ? lowZ : 0,
    cell, columns, rows, starts, entries, wide, unbounded, stamps: new Uint32Array(count), stamp: 0 };
}
export function rectGridAny<T>(grid: RectGrid<T>, query: SpatialBounds, predicate: (value: T) => boolean): boolean {
  // A NaN limit proves nothing: every item is then visited.
  if (Number.isNaN(query.minX) || Number.isNaN(query.maxX) || Number.isNaN(query.minZ) || Number.isNaN(query.maxZ)) {
    return grid.values.some(predicate);
  }
  for (const index of grid.unbounded) if (predicate(grid.values[index])) return true;
  const meets = (index: number): boolean => grid.maxX[index] >= query.minX && grid.minX[index] <= query.maxX
    && grid.maxZ[index] >= query.minZ && grid.minZ[index] <= query.maxZ;
  for (const index of grid.wide) if (meets(index) && predicate(grid.values[index])) return true;
  if (grid.starts.length <= 1) return false;
  const low = (value: number, origin: number, size: number): number =>
    Math.max(0, Math.min(size - 1, Math.floor((value - origin) / grid.cell)));
  const fromX = Math.min(query.minX, query.maxX), toX = Math.max(query.minX, query.maxX);
  const fromZ = Math.min(query.minZ, query.maxZ), toZ = Math.max(query.minZ, query.maxZ);
  if (toX < grid.originX || toZ < grid.originZ
    || fromX > grid.originX + grid.columns * grid.cell || fromZ > grid.originZ + grid.rows * grid.cell) return false;
  const c0 = low(fromX, grid.originX, grid.columns), c1 = low(toX, grid.originX, grid.columns);
  const r0 = low(fromZ, grid.originZ, grid.rows), r1 = low(toZ, grid.originZ, grid.rows);
  if (grid.stamp >= 0xffffffff) { grid.stamps.fill(0); grid.stamp = 0; }
  const stamp = ++grid.stamp;
  for (let row = r0; row <= r1; row += 1) for (let column = c0; column <= c1; column += 1) {
    const cell = row * grid.columns + column;
    for (let slot = grid.starts[cell], end = grid.starts[cell + 1]; slot < end; slot += 1) {
      const index = grid.entries[slot];
      if (grid.stamps[index] === stamp) continue;
      grid.stamps[index] = stamp;
      if (meets(index) && predicate(grid.values[index])) return true;
    }
  }
  return false;
}
