/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra form tables `render/props.ts` consults — M39 (`docs/M39_ULTRA.md`
 * §4, §6.2, §6.3 W3).
 *
 * `createProps` picks a part's builder as
 * `(kit.forms ? ULTRA_FORM_BUILDERS[part]) ?? (kit.buildings ?
 * ULTRA_BUILDING_BUILDERS[part]) ?? (recipe.foliage ? ENHANCED_BUILDERS[part])
 * ?? definition.build`, so a part missing from these tables simply keeps its
 * enhanced/ordinary geometry — same bucket, same instances, same matrices and
 * colours; only triangles, attributes, materials, flags and layers ever differ
 * (§4's rules). `ultra-lit` turns `forms` off, which is how its foliage and
 * furniture fall back to the enhanced kit while its buildings keep relief.
 *
 * **What is deliberately absent.** `bollardCap` and `gantrySpan` are
 * "unchanged" in §4: a 0.27 m finial and a truss that already spends 984
 * triangles have nothing a chase camera would read in richer triangles, so
 * they keep their enhanced geometry and their authored cast flags.
 *
 * **Casting (D2).** Under `kit.buildings` every building part — the three
 * facades, the cap (parapets, shafts, tanks: one bucket) and the gable —
 * casts, so the town finally stripes its own streets with shade. Every other
 * part keeps the flag it was authored with; that is what keeps a sign's plate
 * and a lamp's head out of the shadow pass exactly as on High.
 *
 * **Relief.** The same five building parts carry the metric `ultraRelief`
 * attribute (`ultraBuildings.ts`) and so need the relief depth material,
 * which mirrors the relief vertex patch in the shadow pass: a recessed pane
 * must cast from where it is drawn, not from the unit box it came from.
 *
 * The verification helpers at the foot of the file — relieved positions at a
 * metric scale, a directed-edge shell walk, per-channel colour means — are the
 * measuring instruments the form tests share, exported so the cost and
 * verification packages can use the same ones rather than a second copy.
 */
import * as THREE from 'three';
import type { PartId } from '../props.ts';
import { ultraBuildingCap, ultraFacadeBox, ultraRoofGable } from './ultraBuildings.ts';
import { ultraConifer, ultraCrown, ultraShrub, ultraTrunk } from './ultraFoliage.ts';
import {
  ultraBenchMetal,
  ultraBenchWood,
  ultraFenceBay,
  ultraLampHead,
  ultraLampPost,
  ultraLitterBin,
  ultraSignPlate,
  ultraSignPost,
  ultraTyreStack,
} from './ultraFurniture.ts';
import type { UltraKit } from './ultraTypes.ts';

/** Foliage and furniture forms (T3, T7), used when `kit.forms`. */
export const ULTRA_FORM_BUILDERS: Readonly<Partial<Record<PartId, () => THREE.BufferGeometry>>> = Object.freeze({
  crown: ultraCrown,
  coniferFoliage: ultraConifer,
  shrub: ultraShrub,
  trunk: ultraTrunk,
  lampPost: ultraLampPost,
  lampHead: ultraLampHead,
  fenceBay: ultraFenceBay,
  tyreStack: ultraTyreStack,
  benchWood: ultraBenchWood,
  benchMetal: ultraBenchMetal,
  litterBin: ultraLitterBin,
  signPost: ultraSignPost,
  signPlate: ultraSignPlate,
});

/** Facade, cap and gable forms (T4), used when `kit.buildings`. Every one carries `ultraRelief`. */
export const ULTRA_BUILDING_BUILDERS: Readonly<Partial<Record<PartId, () => THREE.BufferGeometry>>> = Object.freeze({
  buildingBody: () => ultraFacadeBox('buildingBody'),
  buildingLow: () => ultraFacadeBox('buildingLow'),
  buildingTall: () => ultraFacadeBox('buildingTall'),
  buildingCap: ultraBuildingCap,
  roofGable: ultraRoofGable,
});

/** The parts `ULTRA_BUILDING_BUILDERS` rebuilds: they cast under `kit.buildings` and carry relief. */
const BUILDING_PARTS: ReadonlySet<PartId> = new Set<PartId>([
  'buildingBody',
  'buildingLow',
  'buildingTall',
  'buildingCap',
  'roofGable',
]);

/**
 * Whether a part casts on an Ultra world: the building parts when
 * `kit.buildings` (D2 — "no building part casts" was the second half of
 * U0's most visible defect), every other part exactly as authored.
 */
export function ultraCasts(part: PartId, ordinary: boolean, kit: UltraKit): boolean {
  if (kit.buildings && BUILDING_PARTS.has(part)) return true;
  return ordinary;
}

/**
 * Whether a part carries `ultraRelief` and so needs the relief
 * `customDepthMaterial` (§4: facades, cap, gable). `props.ts` asks only when
 * `kit.buildings`, which is the only time these parts are built by
 * `ultraBuildings.ts`.
 */
export function isReliefPart(part: PartId): boolean {
  return BUILDING_PARTS.has(part);
}

// ---------------------------------------------------------------------------
// Measuring instruments, shared by the form tests
// ---------------------------------------------------------------------------

/**
 * A geometry's positions as an instance of metric size `scale` draws them:
 * `position × scale + ultraRelief`. That is exactly what the relief vertex
 * patch computes before the instance matrix — it adds `ultraRelief` divided by
 * the matrix's column lengths, and the matrix multiplies it back — so a test
 * of this array is a test of the drawn metres, with no shader. A geometry
 * without the attribute is simply scaled.
 */
export function relievedPositions(
  geometry: THREE.BufferGeometry,
  scale: readonly [number, number, number] = [1, 1, 1],
): Float64Array {
  const position = geometry.getAttribute('position');
  const relief = geometry.getAttribute('ultraRelief');
  const out = new Float64Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    out[i * 3] = position.getX(i) * scale[0] + (relief === undefined ? 0 : relief.getX(i));
    out[i * 3 + 1] = position.getY(i) * scale[1] + (relief === undefined ? 0 : relief.getY(i));
    out[i * 3 + 2] = position.getZ(i) * scale[2] + (relief === undefined ? 0 : relief.getZ(i));
  }
  return out;
}

export interface ShellReport {
  readonly triangles: number;
  /** Every directed edge is walked exactly once, and its reverse exactly once. */
  readonly closed: boolean;
  /** Directed edges without a partner walked the other way. */
  readonly openEdges: number;
  /** Signed enclosed volume: positive for an outward-wound shell. */
  readonly volume: number;
}

/**
 * Walk every directed edge of a triangle soup (un-indexed positions, three
 * corners a face). A closed, consistently wound shell — or a union of them —
 * walks each undirected edge twice, once each way; a hole, a T-junction or a
 * flipped face leaves an edge unpartnered. The signed volume of a closed
 * surface is independent of the origin, so its sign is the winding's.
 */
export function shellReport(positions: ArrayLike<number>, digits = 5): ShellReport {
  const scale = 10 ** digits;
  // `${-0}` is "0", so a coordinate that rounds to negative zero keys as zero.
  const key = (i: number): string => `${Math.round(positions[i * 3] * scale)},${Math.round(positions[i * 3 + 1] * scale)},${Math.round(positions[i * 3 + 2] * scale)}`;
  const directed = new Map<string, number>();
  let volume = 0;
  const triangles = positions.length / 9;
  for (let face = 0; face < triangles; face += 1) {
    const a = face * 3;
    const ids = [key(a), key(a + 1), key(a + 2)];
    for (let corner = 0; corner < 3; corner += 1) {
      const edge = `${ids[corner]}>${ids[(corner + 1) % 3]}`;
      directed.set(edge, (directed.get(edge) ?? 0) + 1);
    }
    const ax = positions[a * 3]; const ay = positions[a * 3 + 1]; const az = positions[a * 3 + 2];
    const bx = positions[a * 3 + 3]; const by = positions[a * 3 + 4]; const bz = positions[a * 3 + 5];
    const cx = positions[a * 3 + 6]; const cy = positions[a * 3 + 7]; const cz = positions[a * 3 + 8];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  let openEdges = 0;
  for (const [edge, count] of directed) {
    const [from, to] = edge.split('>');
    if (count !== 1 || directed.get(`${to}>${from}`) !== 1) openEdges += 1;
  }
  return { triangles, closed: openEdges === 0, openEdges, volume };
}

/** The per-channel mean of a geometry's `color` attribute over its corners. */
export function channelMeans(geometry: THREE.BufferGeometry): [number, number, number] {
  const colour = geometry.getAttribute('color');
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < colour.count; i += 1) {
    r += colour.getX(i);
    g += colour.getY(i);
    b += colour.getZ(i);
  }
  return [r / colour.count, g / colour.count, b / colour.count];
}
