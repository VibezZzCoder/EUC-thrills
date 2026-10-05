/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared fill-only ground-boundary arithmetic.
 * Policy and protected cell masks are explicit; no heights, meshes or runtime resources.
 * Derived by moving the existing algorithm without changing ordering or arithmetic.
 */
import type { SurfaceId } from '../simulation/world.ts';

export interface BoundaryGrid {
  readonly columns: number;
  readonly rows: number;
  readonly surfaces: readonly SurfaceId[];
}
export interface BoundaryPolicy {
  readonly surfaces: readonly { readonly id: SurfaceId; readonly rank: number;
    readonly encroach: number; readonly drivable: boolean }[];
  readonly capCells: number;
  readonly drivableCapCells: number;
  readonly kneeRoundCells: number;
  readonly kneeLiftShare: number;
  readonly minKeptArea: number;
}

/**
 * One straight fill boundary, in heightfield **grid units** — `gx` is the
 * column coordinate and `gz` the row coordinate, one unit a cell, so cell
 * `(column, row)` spans `[column, column + 1] × [row, row + 1]`. Its signed
 * distance is `nx·gx + nz·gz − d` (a unit normal, so the distance is in
 * cells), positive on the filled side.
 */
export interface EdgeLine {
  readonly nx: number;
  readonly nz: number;
  readonly d: number;
}

/** A line's signed distance at a grid point, in cells; positive is filled. */
export function edgeSignedDistance(line: EdgeLine, gx: number, gz: number): number {
  return line.nx * gx + line.nz * gz - line.d;
}

/**
 * How a filled cell was drawn: a `chain` cell lies under a straightened
 * staircase (a taut line through the band's corridor), a `chamfer` cell
 * takes the 45° half-cell at a corner no chain straightens.
 */
export type EdgePocket = 'chain' | 'chamfer';

/** One filled cell: its lines, how they combine, the surface it fills toward, and the tile whose tone it takes. */
export interface EdgeFillCell {
  /** One or two half-planes. */
  readonly lines: readonly EdgeLine[];
  /**
   * `union` — covered where any line is positive (a boundary that bends
   * toward the band); `intersection` — where every line is (one that bends
   * away from it). One line is the same either way.
   */
  readonly mode: 'union' | 'intersection';
  readonly towards: SurfaceId;
  /** A drawn cell of `towards` beside this one: the fill continues its tile tone. */
  readonly source: number;
  readonly pocket: EdgePocket;
  /**
   * A drivable chain's knee (Wave 4, R-G; A18, round-2 item 8): the two lines
   * of a `union` — where the string bends over the cap — meet in a rounded,
   * tangent-continuous corner (the smooth maximum of their signed distances
   * over `the caller's knee rounding width`) instead of a kink. The knee's
   * gate was lifted by the rounding's dip first, so the ½-cell cap holds.
   */
  readonly round?: boolean;
  /** Shared symmetric contour: packed distance / pair-width adjustment.
   * The geometric line remains unit-normal and metric; absent is legacy 1. */
  readonly distanceScale?: number;
}

/** The edge field over one plan's drawn cells. */
export interface EdgeFillField {
  /** Drawn cell → its fill. Absent = no fill. */
  readonly cells: ReadonlyMap<number, EdgeFillCell>;
  /** Lines drawn in total (the report). */
  readonly lines: number;
  /** The cap every filled point keeps to, in cells (`edgeCapCells`). */
  readonly capCells: number;
  /** The cap into a drivable cell (A12), in cells: every chain with a drivable cell under it keeps to this. */
  readonly drivableCapCells: number;
  /** Filled cells by construction. */
  readonly pockets: Readonly<Record<EdgePocket, number>>;
  /** Straightened staircase chains, and the columns (or rows) they span. */
  readonly chains: number;
  readonly chainCells: number;
  /** Cells whose claims conflicted and were left alone. */
  readonly dropped: number;
}

/**
 * A rounded knee's signed distance (Wave 4, R-G): the polynomial smooth
 * maximum of two lines' signed distances, `max(a, b) + h²·k/4` with `h =
 * max(k − |a − b|, 0) / k` and `k = the caller's knee rounding width` — the
 * ground patch's `ultraEdgeD` exactly. It is never less than `max(a, b)`: a
 * rounded union covers the kinked one and a fillet under its corner, which
 * is why `edgeFillFor` lifts a knee's gate by `kneeLiftShare × k` first.
 */
export function edgeRoundedDistance(a: number, b: number, k: number): number {
  if (!(k > 0)) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/**
 * The rule the ground patch implements per fragment, stated once in plain
 * arithmetic (without the `fwidth` antialiasing, which only softens the
 * line): is the grid point `(gx, gz)` inside this cell covered?
 */
export function edgeCovers(fill: EdgeFillCell, gx: number, gz: number, kneeRoundCells: number): boolean {
  if (fill.round === true && fill.mode === 'union' && fill.lines.length === 2) {
    return edgeRoundedDistance(edgeSignedDistance(fill.lines[0], gx, gz), edgeSignedDistance(fill.lines[1], gx, gz), kneeRoundCells) > 0;
  }
  if (fill.mode === 'intersection') {
    for (const line of fill.lines) if (edgeSignedDistance(line, gx, gz) <= 0) return false;
    return true;
  }
  for (const line of fill.lines) if (edgeSignedDistance(line, gx, gz) > 0) return true;
  return false;
}

/**
 * The shortest path through a row of vertical gates — the taut string.
 *
 * Gate `i` stands at `x[i]` (strictly increasing) and admits `lo[i] ≤ z ≤
 * hi[i]`; the first and last gates are single points. Returns the path's
 * height at every gate. The classic funnel: from the current apex, keep the
 * tightest upper and lower rays; a gate whose top falls below the lower ray
 * bends the path down over the gate that set it, one whose bottom rises
 * above the upper ray bends it up under that gate's top. In 1D this path is
 * straight between the gates it touches, and it is the one that minimises
 * every convex measure of bending at once — which is why it is the right
 * "straightest boundary" and not merely a short one.
 */
export function tautString(x: readonly number[], lo: readonly number[], hi: readonly number[]): number[] {
  const count = x.length;
  const vertices: [number, number][] = [[0, lo[0]]];
  let apex = 0;
  let apexZ = lo[0];
  let i = 1;
  while (i < count) {
    let upSlope = Infinity;
    let upAt = -1;
    let loSlope = -Infinity;
    let loAt = -1;
    let bent = false;
    for (let k = apex + 1; k < count; k += 1) {
      const dx = x[k] - x[apex];
      const su = (hi[k] - apexZ) / dx;
      const sl = (lo[k] - apexZ) / dx;
      if (su < loSlope - 1e-12) {
        // Bend down over the lower gate that set the lower ray.
        apex = loAt;
        apexZ = lo[loAt];
        vertices.push([apex, apexZ]);
        bent = true;
        break;
      }
      if (sl > upSlope + 1e-12) {
        apex = upAt;
        apexZ = hi[upAt];
        vertices.push([apex, apexZ]);
        bent = true;
        break;
      }
      if (su < upSlope) {
        upSlope = su;
        upAt = k;
      }
      if (sl > loSlope) {
        loSlope = sl;
        loAt = k;
      }
    }
    if (!bent) {
      vertices.push([count - 1, lo[count - 1]]);
      break;
    }
    i = apex + 1;
  }
  const z = new Array<number>(count);
  for (let v = 0; v + 1 < vertices.length; v += 1) {
    const [a, za] = vertices[v];
    const [b, zb] = vertices[v + 1];
    for (let k = a; k <= b; k += 1) z[k] = za + ((zb - za) * (x[k] - x[a])) / (x[b] - x[a]);
  }
  z[count - 1] = lo[count - 1];
  return z;
}

/** One cell's claim on the fill, before conflicts are resolved. */
interface Claim {
  readonly lines: readonly EdgeLine[];
  readonly mode: 'union' | 'intersection';
  readonly towards: SurfaceId;
  /** Tone sources, in preference order. */
  readonly sources: readonly number[];
  readonly pocket: EdgePocket;
  /** A chain claim's chain length (longer wins); 0 for a chamfer. */
  readonly length: number;
  /** A drivable chain's two-line knee, drawn rounded (`EdgeFillCell.round`). */
  readonly round: boolean;
}

/**
 * A view of the cell grid in which the band is *above*: canonical column
 * `j` runs along the staircase and canonical row `r` across it, with the
 * band at larger `r`. The four frames are the two axes times the two sides,
 * so one chain builder serves every orientation.
 */
interface Frame {
  readonly width: number;
  readonly height: number;
  /** The real cell at canonical `(j, r)`, both in range. */
  cell(j: number, r: number): number;
  /** A canonical line `sd' = A·x' + B·z' + C` as a real grid line. */
  line(a: number, b: number, c: number): EdgeLine;
}

/**
 * The fill-only edge field over the cells `render/terrain.ts` draws
 * (`terrainCells(plan).bySurface`).
 *
 * **Staircase chains.** In each of four frames (the band above, along
 * either axis), every grid edge with a cell of an outranking surface B above
 * and a fillable cell below is a node; a node links to the next column's
 * node of the same B whose level differs by at most one — a straight run or
 * a unit riser. A maximal linked run is a *chain*: a band boundary crossing
 * the grid at a slope of at most 1:1 in that frame, stored as its level
 * `L[j]` per column (a 1:n line is runs of n and risers of one).
 *
 * **The corridor, and the taut line through it.** The visual boundary of
 * a chain is a path `z(x)` under B — never inside a B cell, so the band only
 * ever grows — and never more than the cap from a B cell, so the ride's
 * truth stays within `capCells`. Both are exact as gates at the column
 * edges (`z ≤ min L`, and down to `min L − cap`, which rounds the band's
 * convex corners outward) and at the *knee* `cap` into a column past a
 * riser, where the cap region steps from the riser's reach to the run's
 * (`L − cap ≤ z ≤ L`). The boundary is the taut string through those gates:
 * for a regular 1:n staircase that is exactly the straight line through the
 * band's convex corners while `n/(n+1) ≤ cap` (1:1 to 1:3 at 0.75), and past
 * that the kneed ramp — steeply to the knee, then straight to the next
 * corner — which turns a one-cell jog into a 0.25-cell bump over three
 * quarters of a cell. An irregular digital line (runs of 2 and 3, the odd
 * 1) comes out one straight line wherever the corridor allows it, instead of
 * a zig-zag of per-step chords. The ends of a chain are held on the band's
 * own edge so the field meets whatever the grid does beyond.
 *
 * **Everything else is a chamfer.** A concave corner no chain straightens —
 * a genuine corner of a band, a U-shaped notch, a one-column tooth — takes
 * the 45° half-cell triangle at the corner, what a kerb corner reads as from
 * the chase camera.
 *
 * **The laws** (asserted by `groundContact.test.ts` on synthetic staircases
 * and on the shipped worlds): only a drawn, non-excluded cell of a lower
 * rank is ever filled, and only toward a surface that outranks it, so a band
 * never loses a cell and its width can only grow; every filled point is
 * within `capCells` of a cell of the surface it fills toward; a filled cell
 * keeps at least `minKeptArea` of itself and a share of every edge it shares
 * with its own surface, so no surface loses a cell or a 4-connection; spill,
 * wood and every cell a hazard is drawn over never take part, as the filled
 * cell or as a band cell the field is read from.
 *
 * **Conflicts.** A cell claimed toward two surfaces takes the stronger. A
 * cell under two chains (the two axes of a near-45° line) takes the longer
 * chain's lines. Chamfers alone combine (two adjacent corners of a notch make
 * a V); two opposite chamfers — a one-cell diagonal path — are left alone
 * rather than drawn lopsided, and a cell no claim leaves enough of is left
 * alone.
 */
export function edgeFillForGrid(
  field: BoundaryGrid,
  cells: ReadonlyMap<SurfaceId, readonly number[]>,
  policy: BoundaryPolicy,
  protectedCells: Uint8Array,
): EdgeFillField {
  const columns = field.columns;
  const rows = field.rows;
  const { capCells, drivableCapCells: drivableCap } = policy;
  const total = columns * rows;
  const surfaces = field.surfaces;

  const drawn = new Uint8Array(total);
  for (const list of cells.values()) for (const cell of list) drawn[cell] = 1;

  // Rank and encroach per surface id, resolved once — and, because the
  // chains below ask "does B outrank A" hundreds of thousands of times on the
  // town, as a small table over per-cell surface codes.
  const ids = policy.surfaces.map(surface => surface.id);
  const codeOf = new Map<SurfaceId, number>(ids.map((id, index) => [id, index]));
  const rankByCode = policy.surfaces.map(surface => surface.rank);
  const encroachByCode = policy.surfaces.map(surface => surface.encroach);
  const beats = new Uint8Array(ids.length * ids.length);
  for (let b = 0; b < ids.length; b += 1) {
    for (let a = 0; a < ids.length; a += 1) {
      const win = rankByCode[b] > rankByCode[a] || (rankByCode[b] === rankByCode[a] && encroachByCode[b] > encroachByCode[a]);
      beats[b * ids.length + a] = win ? 1 : 0;
    }
  }
  const drivableByCode = policy.surfaces.map(surface => surface.drivable);
  // A18: a drivable knee's rounding width, and how far its gate is lifted first (the rounding's dip, with a margin).
  const kneeRound = policy.kneeRoundCells;
  const kneeLift = kneeRound > 0 ? kneeRound * policy.kneeLiftShare : 0;
  const codes = new Uint8Array(total);
  const codeByName: Record<string, number> = Object.fromEntries(ids.map((id, index) => [id, index]));
  for (let cell = 0; cell < total; cell += 1) codes[cell] = codeByName[surfaces[cell]] ?? 0;
  const outranks = (b: SurfaceId, a: SurfaceId): boolean =>
    beats[(codeOf.get(b) ?? 0) * ids.length + (codeOf.get(a) ?? 0)] === 1;

  // Every cell a hazard is drawn over, and every cell with no rank.
  const excluded = new Uint8Array(protectedCells);
  for (let cell = 0; cell < total; cell += 1) {
    if (rankByCode[codes[cell]] === 0) excluded[cell] = 1;
  }

  const inside = (column: number, row: number): boolean => column >= 0 && row >= 0 && column < columns && row < rows;
  const surfaceAt = (column: number, row: number): SurfaceId | null => (inside(column, row) ? surfaces[row * columns + column] : null);
  /** A cell of B the fill may be read from: B, and not under a hazard. */
  const isBCell = (cell: number, b: SurfaceId): boolean => surfaces[cell] === b && excluded[cell] === 0;
  /** A cell the fill may paint toward B: drawn, not excluded, outranked by B. */
  const fillableCell = (cell: number, b: SurfaceId): boolean =>
    drawn[cell] === 1 && excluded[cell] === 0 && beats[(codeOf.get(b) ?? 0) * ids.length + codes[cell]] === 1;

  const claims = new Map<number, Claim[]>();
  const claim = (cell: number, entry: Claim): void => {
    const list = claims.get(cell);
    if (list === undefined) claims.set(cell, [entry]);
    else list.push(entry);
  };

  // -- Chains, in four frames ---------------------------------------------
  const frames: Frame[] = [
    {
      width: columns,
      height: rows,
      cell: (j, r) => r * columns + j,
      line: (a, b, c) => ({ nx: a, nz: b, d: -c }),
    },
    {
      width: columns,
      height: rows,
      cell: (j, r) => (rows - 1 - r) * columns + j,
      // z' = rows − gz
      line: (a, b, c) => ({ nx: a, nz: -b, d: -(b * rows + c) }),
    },
    {
      width: rows,
      height: columns,
      cell: (j, r) => j * columns + r,
      // x' = gz, z' = gx
      line: (a, b, c) => ({ nx: b, nz: a, d: -c }),
    },
    {
      width: rows,
      height: columns,
      cell: (j, r) => j * columns + (columns - 1 - r),
      // x' = gz, z' = columns − gx
      line: (a, b, c) => ({ nx: -b, nz: a, d: -(b * columns + c) }),
    },
  ];

  // Nodes: per frame and canonical column, the levels of every edge with
  // an outranking band cell on one side and a fillable cell on the other —
  // found from the fillable cells (a fifth of the grid on the town), each
  // asking its four neighbours, rather than by scanning the grid four times.
  const nodeLevels: number[][][] = frames.map((frame) => Array.from({ length: frame.width }, () => [] as number[]));
  const nodeBands: SurfaceId[][][] = frames.map((frame) => Array.from({ length: frame.width }, () => [] as SurfaceId[]));
  const nodeAt = (f: number, j: number, r: number, b: SurfaceId): void => {
    nodeLevels[f][j].push(r);
    nodeBands[f][j].push(b);
  };
  for (const list of cells.values()) {
    for (const cell of list) {
      if (excluded[cell] === 1) continue;
      const row = Math.floor(cell / columns);
      const column = cell - row * columns;
      const own = codes[cell];
      // frame 0: the band above (+z); frame 1: below (−z); 2: at +x; 3: at −x.
      for (let f = 0; f < 4; f += 1) {
        const nc = f === 2 ? column + 1 : f === 3 ? column - 1 : column;
        const nr = f === 0 ? row + 1 : f === 1 ? row - 1 : row;
        if (nc < 0 || nr < 0 || nc >= columns || nr >= rows) continue;
        const neighbour = nr * columns + nc;
        if (excluded[neighbour] === 1 || beats[codes[neighbour] * ids.length + own] !== 1) continue;
        const j = f < 2 ? column : row;
        const r = f === 0 ? row + 1 : f === 1 ? rows - row : f === 2 ? column + 1 : columns - column;
        nodeAt(f, j, r, surfaces[neighbour]);
      }
    }
  }

  let chainCount = 0;
  let chainColumns = 0;
  for (let f = 0; f < frames.length; f += 1) {
    const frame = frames[f];
    const levels = nodeLevels[f];
    const bands = nodeBands[f];
    // Each column's nodes in level order.
    for (let j = 0; j < frame.width; j += 1) {
      if (levels[j].length < 2) continue;
      const order = levels[j].map((_level, index) => index).sort((p, q) => levels[j][p] - levels[j][q]);
      levels[j] = order.map((index) => levels[j][index]);
      bands[j] = order.map((index) => bands[j][index]);
    }
    // The unique neighbour of a node in the next (or previous) column.
    const linkOf = (j: number, index: number, step: 1 | -1): number => {
      const next = j + step;
      if (next < 0 || next >= frame.width) return -1;
      const level = levels[j][index];
      const band = bands[j][index];
      let found = -1;
      for (let k = 0; k < levels[next].length; k += 1) {
        if (bands[next][k] !== band || Math.abs(levels[next][k] - level) > 1) continue;
        if (found >= 0) return -1;
        found = k;
      }
      return found;
    };
    const visited = levels.map((at) => new Uint8Array(at.length));
    for (let j = 0; j < frame.width; j += 1) {
      for (let index = 0; index < levels[j].length; index += 1) {
        if (visited[j][index] === 1) continue;
        // Start only where no mutual link comes from the left.
        const back = linkOf(j, index, -1);
        if (back >= 0 && linkOf(j - 1, back, 1) === index) continue;
        const chain: number[] = [];
        let column = j;
        let at = index;
        const band = bands[j][index];
        for (;;) {
          visited[column][at] = 1;
          chain.push(levels[column][at]);
          const forward = linkOf(column, at, 1);
          if (forward < 0 || linkOf(column + 1, forward, -1) !== at || visited[column + 1][forward] === 1) break;
          column += 1;
          at = forward;
        }
        // Split at one-column teeth of the lower surface (both neighbours
        // lower): a column there would need a knee from each side.
        let start = 0;
        for (let k = 0; k <= chain.length; k += 1) {
          const tooth = k > 0 && k < chain.length - 1 && chain[k - 1] < chain[k] && chain[k + 1] < chain[k];
          if (k < chain.length && !tooth) continue;
          if (k - start >= 2) {
            chainCount += 1;
            chainColumns += k - start;
            straighten(frame, j + start, chain.slice(start, k), band);
          }
          start = k + 1;
        }
      }
    }
  }

  /**
   * One chain: its gates, its taut path, and a claim on every cell the path
   * fills — the cell under B in each column, and the one below it where the
   * path rounds a riser's corner.
   */
  function straighten(frame: Frame, j0: number, level: readonly number[], band: SurfaceId): void {
    const n = level.length;
    // A12: a chain with any drivable cell under it keeps to the drivable cap
    // along its whole length (one cap per chain keeps the taut line one line).
    let drivable = false;
    for (let k = 0; k < n && !drivable; k += 1) {
      const under = level[k] - 1;
      if (under >= 0 && drivableByCode[codes[frame.cell(j0 + k, under)]]) drivable = true;
    }
    const m = drivable ? drivableCap : capCells;
    const x: number[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    const push = (at: number, low: number, high: number): void => {
      x.push(at);
      lo.push(low);
      hi.push(high);
    };
    push(j0, level[0], level[0]);
    const kneeAt: number[] = new Array(n).fill(-1);
    for (let k = 0; k < n; k += 1) {
      const j = j0 + k;
      const own = level[k];
      if (k > 0 && level[k - 1] < own) {
        kneeAt[k] = x.length;
        push(j + m, own - m, own);
      } else if (k < n - 1 && level[k + 1] < own) {
        kneeAt[k] = x.length;
        push(j + 1 - m, own - m, own);
      }
      if (k === n - 1) {
        push(j + 1, own, own);
        break;
      }
      const next = level[k + 1];
      const lower = Math.min(own, next);
      let low = lower - m;
      if (own !== next) {
        // Below `lower` the higher column's second cell fills too: it must be fillable.
        const higher = own > next ? j : j + 1;
        const deeper = lower - 1;
        if (deeper < 0 || !fillableCell(frame.cell(higher, deeper), band)) low = lower;
      }
      push(j + 1, low, lower);
    }
    let z = tautString(x, lo, hi);
    if (drivable && kneeRound > 0) {
      // A18 (round-2 item 8): a knee is where the string bends over a gate's
      // lower bound — the cap — and turns less steep (a union of two lines).
      // It is drawn rounded, and the rounding dips below the corner by up to
      // about a quarter of its width, so each such gate's bound is first
      // lifted by that much and the string pulled again: the rounded knee
      // then keeps to the cap. A straight run (1:1 at ½) has no bend and is
      // not touched. A lifted bound can move the bend to a neighbour; a few
      // passes settle it.
      const lifted = new Uint8Array(x.length);
      for (let pass = 0; pass < 4; pass += 1) {
        let changed = false;
        for (let g = 1; g + 1 < x.length; g += 1) {
          if (lifted[g] === 1 || z[g] > lo[g] + 1e-9 || hi[g] - lo[g] < kneeLift + 1e-9) continue;
          const before = (z[g] - z[g - 1]) / (x[g] - x[g - 1]);
          const after = (z[g + 1] - z[g]) / (x[g + 1] - x[g]);
          if (before - after < 1e-6) continue;
          lo[g] += kneeLift;
          lifted[g] = 1;
          changed = true;
        }
        if (!changed) break;
        z = tautString(x, lo, hi);
      }
    }
    // Gate index of each column's left edge.
    const leftEdge: number[] = [];
    {
      let gate = 0;
      for (let k = 0; k < n; k += 1) {
        leftEdge.push(gate);
        gate += kneeAt[k] >= 0 ? 2 : 1;
      }
    }
    for (let k = 0; k < n; k += 1) {
      const j = j0 + k;
      const own = level[k];
      const g0 = leftEdge[k];
      const knee = kneeAt[k];
      const g1 = knee >= 0 ? g0 + 2 : g0 + 1;
      const points: [number, number][] = knee >= 0
        ? [[x[g0], z[g0]], [x[knee], z[knee]], [x[g1], z[g1]]]
        : [[x[g0], z[g0]], [x[g1], z[g1]]];
      let deepest = Infinity;
      for (const [, value] of points) deepest = Math.min(deepest, value);
      if (deepest >= own - 1e-9) continue;
      // The path's segments in this column; a kink at the knee decides the mode.
      const segments: [number, number, number, number][] = [];
      for (let p = 0; p + 1 < points.length; p += 1) segments.push([points[p][0], points[p][1], points[p + 1][0], points[p + 1][1]]);
      let mode: 'union' | 'intersection' = 'union';
      if (segments.length === 2) {
        const s1 = (segments[0][3] - segments[0][1]) / (segments[0][2] - segments[0][0]);
        const s2 = (segments[1][3] - segments[1][1]) / (segments[1][2] - segments[1][0]);
        if (Math.abs(s1 - s2) < 1e-9) segments.splice(0, 2, [segments[0][0], segments[0][1], segments[1][2], segments[1][3]]);
        else mode = s2 < s1 ? 'union' : 'intersection';
      }
      const lines = segments.map(([xa, za, xb, zb]) => {
        const slope = (zb - za) / (xb - xa);
        const length = Math.hypot(1, slope);
        // sd' = (z' − za − slope·(x' − xa)) / length: positive above the path.
        return frame.line(-slope / length, 1 / length, (slope * xa - za) / length);
      });
      const above = frame.cell(j, own);
      const neighbours = [k > 0 ? frame.cell(j - 1, level[k - 1]) : -1, k < n - 1 ? frame.cell(j + 1, level[k + 1]) : -1];
      // A18 (round-2 item 8): a drivable chain's knee is drawn rounded.
      const round = drivable && kneeRound > 0 && mode === 'union' && lines.length === 2;
      claim(frame.cell(j, own - 1), { lines, mode, towards: band, sources: [above, ...neighbours], pocket: 'chain', length: n, round });
      if (deepest < own - 1 - 1e-9 && own - 2 >= 0) {
        // Rounding a riser's corner: the adjacent lower column's B is the tile beside it.
        const lowerSide = k > 0 && level[k - 1] < own ? frame.cell(j - 1, own - 1) : k < n - 1 && level[k + 1] < own ? frame.cell(j + 1, own - 1) : -1;
        claim(frame.cell(j, own - 2), { lines, mode, towards: band, sources: [lowerSide, above], pocket: 'chain', length: n, round });
      }
    }
  }

  // -- Chamfers at the corners no chain straightens -----------------------
  for (const list of cells.values()) {
    for (const cell of list) {
      if (excluded[cell] === 1) continue;
      const row = Math.floor(cell / columns);
      const column = cell - row * columns;
      for (let bit = 0; bit < 4; bit += 1) {
        const cu = bit === 1 || bit === 2 ? 1 : 0;
        const cv = bit >= 2 ? 1 : 0;
        const sx = cu === 0 ? -1 : 1;
        const sz = cv === 0 ? -1 : 1;
        if (!inside(column + sx, row)) continue;
        const neighbour = row * columns + column + sx;
        if (beats[codes[neighbour] * ids.length + codes[cell]] !== 1) continue;
        const b = surfaces[neighbour];
        if (!inside(column + sx, row + sz)) continue;
        const bx = row * columns + column + sx;
        const bz = (row + sz) * columns + column;
        const bd = (row + sz) * columns + column + sx;
        if (!isBCell(bx, b) || !isBCell(bz, b) || !isBCell(bd, b)) continue;
        // s ≤ 1 − t in the corner's frame: the half-cell triangle at C.
        const cx = column + cu;
        const cz = row + cv;
        const dx = -sx;
        const dz = -sz;
        const length = Math.SQRT2;
        claim(cell, {
          lines: [{ nx: -dx / length, nz: -dz / length, d: -(1 + dx * cx + dz * cz) / length }],
          mode: 'union',
          towards: b,
          sources: [bz, bx, bd],
          pocket: 'chamfer',
          length: 0,
          round: false,
        });
      }
    }
  }

  // -- Resolve ------------------------------------------------------------
  const { minKeptArea } = policy;
  const samples = 12;
  /** A cell drawn this way keeps enough of itself and of every edge it shares with its own surface. */
  const keeps = (cell: number, fill: Omit<EdgeFillCell, 'source' | 'pocket' | 'towards'>): boolean => {
    const row = Math.floor(cell / columns);
    const column = cell - row * columns;
    const probe = fill as EdgeFillCell;
    let open = 0;
    for (let i = 0; i < samples; i += 1) {
      for (let k = 0; k < samples; k += 1) {
        if (!edgeCovers(probe, column + (i + 0.5) / samples, row + (k + 0.5) / samples, kneeRound)) open += 1;
      }
    }
    if (open < minKeptArea * samples * samples) return false;
    const own = surfaces[cell];
    const edges: readonly [number, number, (t: number) => [number, number]][] = [
      [-1, 0, (t) => [column, row + t]],
      [1, 0, (t) => [column + 1, row + t]],
      [0, -1, (t) => [column + t, row]],
      [0, 1, (t) => [column + t, row + 1]],
    ];
    for (const [dc, dr, point] of edges) {
      if (surfaceAt(column + dc, row + dr) !== own || drawn[(row + dr) * columns + column + dc] !== 1) continue;
      let clear = false;
      for (let k = 1; k < samples; k += 1) {
        const [gx, gz] = point(k / samples);
        if (!edgeCovers(probe, gx, gz, kneeRound)) {
          clear = true;
          break;
        }
      }
      if (!clear) return false;
    }
    return true;
  };
  const same = (p: EdgeLine, q: EdgeLine): boolean =>
    Math.abs(p.nx - q.nx) < 1e-6 && Math.abs(p.nz - q.nz) < 1e-6 && Math.abs(p.d - q.d) < 1e-6;
  const sameClaim = (p: Claim, q: Claim): boolean =>
    p.mode === q.mode && p.lines.length === q.lines.length && p.lines.every((line) => q.lines.some((other) => same(line, other)));

  const accepted = new Map<number, EdgeFillCell>();
  const pockets: Record<EdgePocket, number> = { chain: 0, chamfer: 0 };
  let lineCount = 0;
  let dropped = 0;
  for (const cell of [...claims.keys()].sort((p, q) => p - q)) {
    const list = claims.get(cell)!;
    let target = list[0].towards;
    for (const entry of list) if (outranks(entry.towards, target)) target = entry.towards;
    const mine = list.filter((entry) => entry.towards === target);
    const chainClaims = mine.filter((entry) => entry.pocket === 'chain').sort((p, q) => q.length - p.length);
    let chosen: { lines: readonly EdgeLine[]; mode: 'union' | 'intersection'; pocket: EdgePocket; sources: number[]; round: boolean } | null = null;
    // Distinct chain fills, and whether any two come from opposite sides (a
    // strip of the lower surface between two runs of the band).
    const distinct: Claim[] = [];
    for (const entry of chainClaims) if (!distinct.some((seen) => sameClaim(seen, entry))) distinct.push(entry);
    const facing = (entry: Claim): [number, number] => {
      let x = 0;
      let z = 0;
      for (const line of entry.lines) {
        x += line.nx;
        z += line.nz;
      }
      return [x, z];
    };
    let opposed = false;
    for (let p = 0; p < distinct.length; p += 1) {
      for (let q = p + 1; q < distinct.length; q += 1) {
        const [ax, az] = facing(distinct[p]);
        const [bx, bz] = facing(distinct[q]);
        if (ax * bx + az * bz < 0) opposed = true;
      }
    }
    if (opposed) {
      // Both sides at once or neither: one line from each, if the cell keeps enough of itself.
      const lines: EdgeLine[] = [];
      let merge = distinct.every((entry) => entry.lines.length === 1);
      for (const entry of distinct) for (const line of entry.lines) if (!lines.some((seen) => same(seen, line))) lines.push(line);
      merge = merge && lines.length <= 2;
      if (merge && keeps(cell, { lines, mode: 'union' })) {
        chosen = { lines, mode: 'union', pocket: 'chain', sources: chainClaims.flatMap((entry) => [...entry.sources]), round: false };
      }
    } else {
      for (const entry of chainClaims) {
        if (keeps(cell, entry)) {
          chosen = { lines: entry.lines, mode: entry.mode, pocket: 'chain', sources: [...entry.sources], round: entry.round };
          for (const other of chainClaims) if (other !== entry && sameClaim(other, entry)) chosen.sources.push(...other.sources);
          break;
        }
      }
    }
    if (chosen === null) {
      const chamfers = mine.filter((entry) => entry.pocket === 'chamfer');
      const lines: EdgeLine[] = [];
      for (const entry of chamfers) for (const line of entry.lines) if (!lines.some((seen) => same(seen, line))) lines.push(line);
      if (lines.length > 0 && lines.length <= 2 && keeps(cell, { lines, mode: 'union' })) {
        chosen = { lines, mode: 'union', pocket: 'chamfer', sources: chamfers.flatMap((entry) => [...entry.sources]), round: false };
      }
    }
    if (chosen === null) {
      dropped += 1;
      continue;
    }
    const source = chosen.sources.find((candidate) => candidate >= 0 && candidate < total && drawn[candidate] === 1 && surfaces[candidate] === target) ?? -1;
    if (source < 0) {
      dropped += 1;
      continue;
    }
    const mode = chosen.lines.length === 1 ? 'union' : chosen.mode;
    const round = chosen.round && chosen.lines.length === 2 && mode === 'union';
    accepted.set(cell, { lines: chosen.lines, mode, towards: target, source, pocket: chosen.pocket, ...(round ? { round } : {}) });
    pockets[chosen.pocket] += 1;
    lineCount += chosen.lines.length;
  }

  return { cells: accepted, lines: lineCount, capCells, drivableCapCells: drivableCap, pockets, chains: chainCount, chainCells: chainColumns, dropped };
}

/** A linear RGB triple, as the fill tone arithmetic reads it. */
interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The fill tone: the linear multiplier that turns this cell's own colour
 * into the source neighbour's, inside the filled region.
 *
 * The ground shader's diffuse colour is `material.color × vertexColour` — A's
 * material, A's tile tone — and the patch multiplies the fill tone onto
 * exactly that (`diffuseColor.rgb *= mix(1, ultraFillTint, cover)`). The
 * source tile draws `B.color × B.tint`. So the region carries
 * `(B.color × B.tint) / (A.color × A.tint)`, per channel, in the same linear
 * decode three applies to the material colours — the caller passes those
 * decoded values. A cell's four vertices share one tile tone, so the ratio is
 * exact across the whole cell.
 */
export function fillTint(
  ownLinear: Rgb,
  ownTint: Rgb,
  towardLinear: Rgb,
  towardTint: Rgb,
  out: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  const r = ownLinear.r * ownTint.r;
  const g = ownLinear.g * ownTint.g;
  const b = ownLinear.b * ownTint.b;
  out.r = r > 0 ? (towardLinear.r * towardTint.r) / r : 1;
  out.g = g > 0 ? (towardLinear.g * towardTint.g) / g : 1;
  out.b = b > 0 ? (towardLinear.b * towardTint.b) / b : 1;
  return out;
}
