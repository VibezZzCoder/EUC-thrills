/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Street entrances on a building's ground storey (2026-10-22).
 *
 * Which faces of a body look onto a street or a path, and where along those
 * faces a door can stand. **Render-only and pure**: it reads the immutable
 * plan through the same `PlanTerrainSampler` the riders' ground comes from and
 * writes nothing — no collider, no surface, no prop, no seed draw — so every
 * plan digest and every simulated state is exactly what it was. The two
 * building painters, `render/metricFacadePlan.ts` (recessed metric shells) and
 * `render/districtExteriorSites.ts` (relief on the original facade boxes),
 * ask it the same questions and place their own door at the answer.
 *
 * **A door needs somewhere to open onto.** A face is surveyed in half-metre
 * columns, three probes out from the wall; a column is clear when the ground
 * in front stands within a step of the door's sill, nothing solid (another
 * building, a wall, a ramp, a raised deck, a lamp post or a tree trunk) stands
 * below a door's head within three metres, and no shrub bed sits against the
 * wall. Something overhead — a roof deck's slab or parapet — is not in the
 * way. So a face pressed against a neighbour, a wall or a ramp is never
 * offered, a door never opens above a falling pavement, and only pieces
 * standing on the ground are asked about at all: never a deck eleven metres
 * up. Faces are ranked by how much of their length looks onto paved ground,
 * then open space, then facing the nearest street; an authored shop awning
 * names its face outright, and a face continued by a neighbour's wall (a
 * terrace's frontage) beats the terrace's end.
 *
 * **A building set back in lawn still fronts its street** (doors fix,
 * 2026-10-22). Where no face has paving at its foot — the default town's
 * blocks stand in grass on every side — paved share says nothing, and the
 * nearest paved *station* can be a straight stretch hundreds of metres off
 * (curved and short segments report none). There each face also looks out
 * along its own normal for the street ground it fronts, stopping at the
 * first building in the way, and the nearest street wins. Each door reports
 * whether its doorstep is paved and the ground range under a step's depth,
 * so the painters can stand a step in front of a door that opens onto turf.
 */
import type { BuildingPiece } from '../data/buildingLooks.ts';
import type { BoxCollider, LevelPlan, Prop } from '../level/plan.ts';
import { groundSurfaceAt, nearestPavedStreetStation } from '../level/protectedSiteEligibility.ts';
import { positionHash01 } from '../shared/maths.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type GroundSample, type SurfaceId, type Vec3 } from '../simulation/world.ts';

export type EntranceFamily = 'commercial' | 'residential' | 'industrial';

/** One surveyed face of a body piece, in the facade builders' own frame. */
export interface StreetFace {
  /** 0..3, so the face's yaw is the piece's world yaw plus `side · π/2`. */
  readonly side: number;
  /** World yaw; the face's outward normal is `(sin yaw, 0, cos yaw)`. */
  readonly yaw: number;
  readonly width: number;
  /** World point on the face plane at its centre, at the piece's base. */
  readonly origin: Vec3;
  /** Share of the face's length that looks onto paved ground. */
  readonly paved: number;
  /** Share with open space six metres out, rather than an alley. */
  readonly open: number;
  /** How near the street (or, weaker, the path) this face looks onto, 0..1; 0 when none within reach. */
  readonly street: number;
  readonly score: number;
}

export interface StreetDoor {
  /** Along the face, metres from its centre; positive along `(cos yaw, 0, −sin yaw)`. */
  readonly x: number;
  /** Sill height above the piece's base, metres. Never negative. */
  readonly y: number;
  /** Every column right in front of the doorway is paving (a pavement, path or deck): no step is needed. */
  readonly paved: boolean;
  /** Lowest and highest ground within a doorstep's depth of the doorway, above the piece's base, metres. */
  readonly stepLow: number;
  readonly stepHigh: number;
}

export interface StreetEntrance {
  readonly face: StreetFace;
  readonly doors: readonly StreetDoor[];
}

/** Metres. Every number is a construction tolerance, not appearance or physics tuning. */
export const STREET_ENTRANCE = Object.freeze({
  column: 0.5,
  probes: [0.45, 1.5, 3.0] as readonly number[],
  openProbe: 6,
  /** A solid this far above the terrain under it is something standing there. */
  solidRise: 0.3,
  /** The sill may sit this far *above* the ground in front (a door never floats higher). */
  floatTolerance: 0.12,
  /** Ground rising this far over the base buries the door; the caller's own cap is tighter. */
  maximumSill: 0.9,
  /** One probe to the next may step this much: a kerb, never a ledge. */
  stepTolerance: 0.45,
  /** A door's own width of ground may not tilt more than this under it. */
  levelTolerance: 0.15,
  /** Below this paved share on every face, a body stands in lawn and its faces are ranked by the street ahead. */
  lawnPaved: 0.2,
  /** How far a face looks out for the street it fronts, and the march step. */
  streetReach: 40,
  streetStep: 1,
  /** A footpath is a frontage, but a weaker one than a street. */
  pathWeight: 0.6,
});

const PAVED = new Set<SurfaceId>(['pavement', 'roughPavement', 'brick', 'gravel', 'wood']);
/** Street ground a face can front, and the weaker footpath ground (`lawnPaved` ranking only). */
const STREETS = new Set<SurfaceId>(['pavement', 'roughPavement', 'brick']);
const PATHS = new Set<SurfaceId>(['gravel', 'wood']);
const SAMPLERS = new WeakMap<LevelPlan, PlanTerrainSampler>();
const GRIDS = new WeakMap<LevelPlan, ColliderGrid>();

/** One sampler per immutable plan, shared by both builders. */
function samplerFor(plan: LevelPlan): PlanTerrainSampler {
  let sampler = SAMPLERS.get(plan);
  if (!sampler) { sampler = new PlanTerrainSampler(plan); SAMPLERS.set(plan, sampler); }
  return sampler;
}

/**
 * Every collider the sampler knows, binned by footprint. The sampler answers
 * only "the highest top here", which cannot tell a roof deck's parapet eleven
 * metres overhead from a wall in front of the door; this answers "what stands
 * between the ground and a door's head".
 */
interface ColliderGrid { readonly cell: number; readonly bins: ReadonlyMap<number, readonly BoxCollider[]>;
  /** Shrub beds and other soft bodies, binned the same way. */
  readonly soft: ReadonlyMap<number, readonly BoxCollider[]> }
const binKey = (bx: number, bz: number): number => (bx + 32768) * 65536 + (bz + 32768);
function gridFor(plan: LevelPlan): ColliderGrid {
  let grid = GRIDS.get(plan);
  if (grid) return grid;
  const cell = 8;
  const binned = (boxes: readonly BoxCollider[], pad: number): Map<number, BoxCollider[]> => {
    const bins = new Map<number, BoxCollider[]>();
    for (const box of boxes) {
      const reach = Math.hypot(box.halfExtents.x, box.halfExtents.z) + pad;
      if (![box.centre.x, box.centre.z, reach].every(Number.isFinite)) continue;
      for (let bx = Math.floor((box.centre.x - reach) / cell); bx <= Math.floor((box.centre.x + reach) / cell); bx += 1)
        for (let bz = Math.floor((box.centre.z - reach) / cell); bz <= Math.floor((box.centre.z + reach) / cell); bz += 1) {
          const key = binKey(bx, bz), list = bins.get(key);
          if (list) list.push(box); else bins.set(key, [box]);
        }
    }
    return bins;
  };
  grid = { cell, bins: binned([...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])], 0),
    soft: binned(plan.softBodies ?? [], SOFT_PAD) };
  GRIDS.set(plan, grid);
  return grid;
}

const at = (origin: Vec3, yaw: number, x: number, y: number, z: number): Vec3 => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: origin.x + c * x + s * z, y: origin.y + y, z: origin.z - s * x + c * z };
};

function insideBox(box: BoxCollider, x: number, z: number, pad: number): boolean {
  const c = Math.cos(box.rotationY), s = Math.sin(box.rotationY), dx = x - box.centre.x, dz = z - box.centre.z;
  return Math.abs(c * dx - s * dz) <= box.halfExtents.x + pad && Math.abs(s * dx + c * dz) <= box.halfExtents.z + pad;
}

/** How far a shrub bed keeps a doorstep off it, metres. */
const SOFT_PAD = 0.15;
/** A door's head over its sill, metres: anything solid below this in front of it is in the way. */
const DOOR_CLEARANCE = 2.3;

interface Column {
  /** Ground right in front of the wall (a kerb or low deck counts), or NaN when the column is not clear. */
  readonly ground: number;
  readonly paved: boolean;
  readonly open: boolean;
  /** The doorstep itself (the first probe) is paving. */
  readonly step: boolean;
  /** Lowest and highest walking surface over the first two probes (a doorstep's depth). */
  readonly low: number;
  readonly high: number;
}

/** Survey the four faces of one ground-standing body piece. Faces with no clear column are omitted. */
export function surveyStreetFaces(plan: LevelPlan, building: Prop, piece: BuildingPiece): readonly (StreetFace & {
  readonly columns: readonly Column[];
})[] {
  if (building.kind !== 'building' || piece.y !== 0) return [];
  const sampler = samplerFor(plan), grid = gridFor(plan), sample: GroundSample = createGroundSample();
  sample.base = { height: 0, normal: { x: 0, y: 1, z: 0 } };
  const origin = at(building.position, building.rotationY, piece.x, piece.y, piece.z);
  const pieceYaw = building.rotationY + piece.yaw, baseY = origin.y;
  const station = nearestPavedStreetStation(plan, building);
  /** The walking surface at a point and whether something stands on it, up to a door's head. */
  const probe = (p: Vec3, small: boolean): { walk: number; blocked: boolean; paved: boolean } => {
    sampler.sampleGround(p.x, p.z, sample);
    const terrain = sample.base!.height;
    let walk = terrain, blocked = !Number.isFinite(terrain), paved = PAVED.has(groundSurfaceAt(plan, p));
    for (const box of grid.bins.get(binKey(Math.floor(p.x / grid.cell), Math.floor(p.z / grid.cell))) ?? []) {
      if (!insideBox(box, p.x, p.z, 0)) continue;
      const top = box.centre.y + box.halfExtents.y, bottom = box.centre.y - box.halfExtents.y;
      if (top <= terrain + STREET_ENTRANCE.solidRise) {
        // A kerb or a low deck is stood on, not walked into.
        if (top > walk) { walk = top; paved = PAVED.has(box.surface); }
        continue;
      }
      // Overhead (a roof deck's slab or parapet) is not in the way of a door;
      // a post or a tree trunk out past arm's reach of the doorstep is not either.
      if (bottom >= terrain + DOOR_CLEARANCE) continue;
      if (!small && Math.max(box.halfExtents.x, box.halfExtents.z) < 0.5) continue;
      blocked = true;
    }
    return { walk, blocked, paved };
  };
  /** Is a building-height solid standing at this point? */
  const standsTall = (p: Vec3, ground: number): boolean => (grid.bins.get(binKey(Math.floor(p.x / grid.cell), Math.floor(p.z / grid.cell))) ?? [])
    .some(box => insideBox(box, p.x, p.z, 0) && box.centre.y - box.halfExtents.y < ground + 1 && box.centre.y + box.halfExtents.y > ground + 2.5);
  /** A building-sized solid (never a post or a trunk) standing here: a face cannot front a street behind it. */
  const wallAt = (p: Vec3): boolean => (grid.bins.get(binKey(Math.floor(p.x / grid.cell), Math.floor(p.z / grid.cell))) ?? [])
    .some(box => Math.max(box.halfExtents.x, box.halfExtents.z) >= 0.5 && insideBox(box, p.x, p.z, 0)
      && box.centre.y - box.halfExtents.y < baseY + 1 && box.centre.y + box.halfExtents.y > baseY + 2.5);
  /** The street ground a face fronts: three sight lines out along its normal, the nearest street on any. */
  const streetAhead = (face: Vec3, yaw: number, width: number): number => {
    const { streetReach: reach, streetStep: step, pathWeight } = STREET_ENTRANCE;
    let best = 0;
    for (const lateral of [-width / 3, 0, width / 3]) for (let d = step; d <= reach; d += step) {
      const p = at(face, yaw, lateral, 0, d);
      if (wallAt(p)) break;
      const surface = groundSurfaceAt(plan, p), near = 1 - d / (reach + step);
      if (STREETS.has(surface)) { best = Math.max(best, near); break; }
      if (PATHS.has(surface)) best = Math.max(best, near * pathWeight);
    }
    return best;
  };
  const surveyed: (Omit<StreetFace, 'score'> & { awning: boolean; bearing: number; base: number; columns: Column[] })[] = [];
  for (let side = 0; side < 4; side += 1) {
    const yaw = pieceYaw + side * Math.PI / 2;
    const width = side % 2 ? piece.sz : piece.sx, depth = side % 2 ? piece.sx : piece.sz;
    const face = at(origin, yaw, 0, 0, depth / 2);
    const count = Math.max(0, Math.floor((width - 0.5) / STREET_ENTRANCE.column) + 1);
    const start = -((count - 1) * STREET_ENTRANCE.column) / 2;
    const columns: Column[] = [];
    for (let index = 0; index < count; index += 1) {
      const x = start + index * STREET_ENTRANCE.column;
      let clear = true, paved = false, ground = NaN, previous = NaN, step = false, low = Infinity, high = -Infinity;
      for (const [k, distance] of STREET_ENTRANCE.probes.entries()) {
        const p = at(face, yaw, x, 0, distance), hit = probe(p, k < 2);
        if (hit.blocked) { clear = false; break; }
        if (k === 0) {
          if (hit.walk < baseY - STREET_ENTRANCE.floatTolerance || hit.walk > baseY + STREET_ENTRANCE.maximumSill) { clear = false; break; }
          ground = hit.walk; step = hit.paved;
        } else if (Math.abs(hit.walk - previous) > STREET_ENTRANCE.stepTolerance) { clear = false; break; }
        if (k < 2) { low = Math.min(low, hit.walk); high = Math.max(high, hit.walk); }
        if (k < 2 && (grid.soft.get(binKey(Math.floor(p.x / grid.cell), Math.floor(p.z / grid.cell))) ?? [])
          .some(box => insideBox(box, p.x, p.z, SOFT_PAD))) { clear = false; break; }
        if (k > 0 && hit.paved) paved = true;
        previous = hit.walk;
      }
      let open = false;
      if (clear) {
        const far = probe(at(face, yaw, x, 0, STREET_ENTRANCE.openProbe), false);
        open = !far.blocked && Math.abs(far.walk - previous) <= STREET_ENTRANCE.stepTolerance * 2;
      }
      columns.push({ ground: clear ? ground : NaN, paved: clear && paved, open, step: clear && step,
        low: clear ? low : NaN, high: clear ? high : NaN });
    }
    const clearCount = columns.filter(column => Number.isFinite(column.ground)).length;
    if (clearCount === 0) continue;
    const pavedShare = columns.filter(column => column.paved).length / columns.length;
    const openShare = columns.filter(column => column.open).length / columns.length;
    const facing = station ? Math.sin(yaw) * (station.point.x - face.x) + Math.cos(yaw) * (station.point.z - face.z) : 0;
    const toward = station ? Math.max(0, facing / Math.max(1e-6, Math.hypot(station.point.x - face.x, station.point.z - face.z))) : 0;
    // A venue that authored a shop awning on this face has already said which
    // face is the shopfront (Quay Quarter's plaza rows).
    const awning = awningOver(plan, { yaw, origin: face }, 0, width / 2), shopfront = awning ? 1.5 : 0;
    // A face continued by a neighbour's wall in the same plane is a row's
    // frontage, not the end of a terrace: every house in a row keeps its door
    // on the same side, the last one included.
    const flanked = [-1, 1].some(end => [1.5, 3, 4.5].some(gap => standsTall(at(face, yaw, end * (width / 2 + gap), 0, -1), baseY))) ? 0.3 : 0;
    const base = 2 * pavedShare + openShare + 0.5 * toward + 0.25 * clearCount / columns.length + shopfront + flanked;
    surveyed.push({ side, yaw, width, origin: face, paved: pavedShare, open: openShare,
      street: streetAhead(face, yaw, width), awning, bearing: 0.5 * toward, base, columns });
  }
  // A body standing in lawn on every side fronts the street it looks onto
  // (default town): that outranks open lawn, and once any face sees a street
  // the far station's bearing no longer counts at all. An authored awning
  // still names its face outright.
  const lawn = surveyed.every(face => face.paved < STREET_ENTRANCE.lawnPaved);
  const sighted = lawn && surveyed.some(face => face.street > 0);
  const faces = surveyed.map(({ base, awning, bearing, ...face }) => ({ ...face,
    score: base + (lawn ? 2 * (awning ? 1 : face.street) : 0) - (sighted ? bearing : 0) }));
  // Deterministic order: score, then the lower side index.
  return faces.sort((a, b) => b.score - a.score || a.side - b.side);
}

/** Does an authored shop awning hang over this stretch of a face (`x ± reach` along it)? */
export function awningOver(plan: LevelPlan, face: { readonly yaw: number; readonly origin: Vec3 }, x: number, reach: number): boolean {
  const nx = Math.sin(face.yaw), nz = Math.cos(face.yaw), lx = Math.cos(face.yaw), lz = -Math.sin(face.yaw);
  return (plan.quayScenery?.awnings ?? []).some(awning => {
    if (awning.nx * nx + awning.nz * nz < 0.99) return false;
    if (Math.abs((awning.x0 - face.origin.x) * nx + (awning.z0 - face.origin.z) * nz) > 0.3) return false;
    const a = (awning.x0 - face.origin.x) * lx + (awning.z0 - face.origin.z) * lz;
    const b = (awning.x1 - face.origin.x) * lx + (awning.z1 - face.origin.z) * lz;
    return Math.max(a, b) > x - reach && Math.min(a, b) < x + reach;
  });
}

/**
 * The sill a door centred at `x` and `halfWidth` wide may take on this face,
 * or null when any column under it is blocked, floats, or tilts.
 */
export function doorSill(face: { readonly width: number; readonly columns: readonly Column[] }, x: number,
  halfWidth: number, baseY: number): number | null {
  if (x - halfWidth < -face.width / 2 || x + halfWidth > face.width / 2) return null;
  const count = face.columns.length, start = -((count - 1) * STREET_ENTRANCE.column) / 2;
  let low = Infinity, high = -Infinity, any = false;
  for (let index = 0; index < count; index += 1) {
    const cx = start + index * STREET_ENTRANCE.column;
    if (cx < x - halfWidth - STREET_ENTRANCE.column / 2 || cx > x + halfWidth + STREET_ENTRANCE.column / 2) continue;
    const ground = face.columns[index].ground;
    if (!Number.isFinite(ground)) return null;
    any = true; low = Math.min(low, ground); high = Math.max(high, ground);
  }
  if (!any || high - low > STREET_ENTRANCE.levelTolerance) return null;
  return Math.max(0, high - baseY);
}

/** The doorstep in front of a door at `x`: whether it is all paving, and the ground range under a step's depth. */
function doorstep(face: { readonly columns: readonly Column[] }, x: number, halfWidth: number, baseY: number):
  { paved: boolean; stepLow: number; stepHigh: number } {
  const count = face.columns.length, start = -((count - 1) * STREET_ENTRANCE.column) / 2;
  let paved = true, low = Infinity, high = -Infinity;
  for (let index = 0; index < count; index += 1) {
    const cx = start + index * STREET_ENTRANCE.column;
    if (cx < x - halfWidth - STREET_ENTRANCE.column / 2 || cx > x + halfWidth + STREET_ENTRANCE.column / 2) continue;
    const column = face.columns[index];
    paved &&= column.step; low = Math.min(low, column.low); high = Math.max(high, column.high);
  }
  return { paved, stepLow: low - baseY, stepHigh: high - baseY };
}

export interface EntranceRequest {
  /** Half the clear width a door position needs, metres, centred on the door. */
  readonly halfWidth: number;
  /** Candidate door centres along a face of this width, best first within each group. */
  readonly candidates: (face: StreetFace) => readonly number[];
  /** How many doors this face should carry. */
  readonly doorsOnFace: (face: StreetFace, primary: boolean) => number;
  /** Doors on a face are at least this far apart, centre to centre. */
  readonly spacing: number;
  /** Highest sill the caller's storey allows. */
  readonly maximumSill: number;
  /** Faces after the best one that may carry doors (a corner shop's second front). */
  readonly secondaryFaces: number;
}

/**
 * Doors for one body piece: the best face always (when any face is clear),
 * and up to `secondaryFaces` more that look onto paving nearly as well.
 * Positions are taken from the caller's candidates nearest evenly spaced
 * targets along the face, so a long frontage carries several entrances.
 */
export function streetEntrances(plan: LevelPlan, building: Prop, piece: BuildingPiece,
  request: EntranceRequest): readonly StreetEntrance[] {
  const faces = surveyStreetFaces(plan, building, piece);
  const baseY = at(building.position, building.rotationY, piece.x, piece.y, piece.z).y;
  const chosen: StreetEntrance[] = [];
  for (const face of faces) {
    const primary = chosen.length === 0;
    if (!primary) {
      if (chosen.length > request.secondaryFaces) break;
      if (face.paved < 0.6 || face.score < chosen[0].face.score * 0.75) continue;
    }
    const wanted = Math.max(0, Math.floor(request.doorsOnFace(face, primary)));
    if (wanted === 0) continue;
    const candidates = request.candidates(face).filter(x => Number.isFinite(x));
    const doors: StreetDoor[] = [];
    for (let k = 0; k < wanted; k += 1) {
      const target = -face.width / 2 + face.width * (k + 0.5) / wanted;
      const ranked = [...candidates].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
      for (const x of ranked) {
        if (doors.some(door => Math.abs(door.x - x) < request.spacing)) continue;
        const y = doorSill(face, x, request.halfWidth, baseY);
        if (y === null || y > request.maximumSill) continue;
        doors.push({ x, y, ...doorstep(face, x, request.halfWidth, baseY) }); break;
      }
    }
    if (doors.length === 0) continue;
    doors.sort((a, b) => a.x - b.x);
    const { columns: _columns, ...plain } = face;
    chosen.push({ face: plain, doors });
    if (chosen.length > request.secondaryFaces) break;
  }
  return chosen;
}

/** A doorstep in front of a door that opens onto turf, metres (2026-10-22). */
export const DOOR_STEP = Object.freeze({ depth: 1.1, rise: 0.09, footing: 0.25, overhang: 0.15 });

/**
 * The painted name on a shop's fascia board (2026-10-22): three to five
 * word-bars of varied length, centred on the board, at most a shop name's
 * width. `x` is from the board's centre. Seeded by the door's own world point,
 * so a rebuild paints the same name.
 */
export function signLettering(boardWidth: number, seedX: number, seedZ: number):
  readonly { readonly x: number; readonly width: number }[] {
  const rank = (k: number): number => positionHash01(seedX, seedZ, 911 + k);
  const count = 3 + Math.min(2, Math.floor(rank(0) * 3));
  const span = Math.min(boardWidth * 0.62, 3.4), gap = Math.min(0.12, span * 0.06);
  const weights = Array.from({ length: count }, (_, k) => 0.55 + rank(k + 1) * 0.9);
  const unit = (span - gap * (count - 1)) / weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = -span / 2;
  return weights.map(weight => {
    const width = weight * unit, x = cursor + width / 2;
    cursor += width + gap;
    return { x, width };
  });
}
