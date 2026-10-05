/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Pure shared population hull arithmetic. Imports nothing. Author validation,
 * simulation and QA may all use this one transform. No world/render dependency.
 */
export interface PopulationLocalHull {
  readonly halfWidthMetres: number;
  readonly halfLengthMetres: number;
  readonly heightMetres: number;
}
export interface PopulationHullSource {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly headingY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly hull: PopulationLocalHull;
  readonly marginMetres?: number;
  /** Actual support-height excursions beyond the centre-normal box. */
  readonly verticalPaddingBelowMetres?: number;
  readonly verticalPaddingAboveMetres?: number;
}
export interface PopulationHullPrism {
  readonly x: number;
  readonly z: number;
  readonly headingY: number;
  readonly halfWidthMetres: number;
  readonly halfLengthMetres: number;
  readonly minY: number;
  readonly maxY: number;
  readonly velocityX: number;
  readonly velocityZ: number;
  /** Optional exact source for a continuously grade-aligned actor sweep. */
  readonly sourceHull?: PopulationHullSource;
}
export interface PopulationHullCorner { readonly x: number; readonly y: number; readonly z: number }
export interface PopulationHullGeometry {
  readonly footprint: PopulationHullPrism;
  readonly corners: readonly PopulationHullCorner[];
  /** -X/-Z, -X/+Z, +X/-Z, +X/+Z. Actual yaw+grade transformed positions. */
  readonly lowerCorners: readonly PopulationHullCorner[];
}

/**
 * Renderer-equivalent shortest rotation(up -> normalized ground normal) * yaw.
 * Yaw acts first, then the normal rotation. The local box is ±width, ±length,
 * y=0..height. A tall roof shifts on a grade, so its heading-frame prism is
 * recentered rather than pretending the shifted shape is still symmetrical.
 */
export function transformPopulationHull(x: number, y: number, z: number, headingY: number,
  normalX: number, normalY: number, normalZ: number, hull: PopulationLocalHull,
  velocityX = 0, velocityZ = 0): PopulationHullGeometry {
  const corners: PopulationHullCorner[] = [], lowerCorners: PopulationHullCorner[] = [];
  const footprint = transformHull(x, y, z, headingY, normalX, normalY, normalZ, hull, velocityX, velocityZ,
    corners, lowerCorners, null);
  return { corners, lowerCorners, footprint };
}

/** A caller-owned lower-corner slot; the transform overwrites it in place. */
export interface MutablePopulationHullCorner { x: number; y: number; z: number }
/**
 * transformPopulationHull's tilted footprint, writing only its four lower
 * corners (same order) into caller-owned scratch: the per-step actor pose
 * needs no upper corner objects or arrays. Identical validation and arithmetic.
 */
export function transformPopulationHullLowerInto(x: number, y: number, z: number, headingY: number,
  normalX: number, normalY: number, normalZ: number, hull: PopulationLocalHull,
  velocityX: number, velocityZ: number, lowerCorners: readonly MutablePopulationHullCorner[]): PopulationHullPrism {
  return transformHull(x, y, z, headingY, normalX, normalY, normalZ, hull, velocityX, velocityZ, null, null, lowerCorners);
}

/** The one corner loop: corners are pushed to the sinks or written to scratch. */
function transformHull(x: number, y: number, z: number, headingY: number,
  normalX: number, normalY: number, normalZ: number, hull: PopulationLocalHull,
  velocityX: number, velocityZ: number, corners: PopulationHullCorner[] | null,
  lowerCorners: PopulationHullCorner[] | null, lowerScratch: readonly MutablePopulationHullCorner[] | null): PopulationHullPrism {
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(headingY)
    && Number.isFinite(normalLength) && Number.isFinite(hull.halfWidthMetres) && Number.isFinite(hull.halfLengthMetres)
    && Number.isFinite(hull.heightMetres) && Number.isFinite(velocityX) && Number.isFinite(velocityZ))
    || normalLength === 0 || normalY <= 0 || hull.halfWidthMetres <= 0
    || hull.halfLengthMetres <= 0 || hull.heightMetres <= 0) {
    throw new RangeError('Population hull requires finite positive dimensions and an upward normal');
  }
  const nx = normalX / normalLength, ny = normalY / normalLength, nz = normalZ / normalLength;
  const denominator = 1 + ny, c = Math.cos(headingY), s = Math.sin(headingY);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity, lower = 0;
  for (let xSide = 0; xSide < 2; xSide += 1) {
    const localX = xSide ? hull.halfWidthMetres : -hull.halfWidthMetres;
    for (let zSide = 0; zSide < 2; zSide += 1) {
      const localZ = zSide ? hull.halfLengthMetres : -hull.halfLengthMetres;
      const yawX = c * localX + s * localZ, yawZ = -s * localX + c * localZ;
      for (let ySide = 0; ySide < 2; ySide += 1) {
        const localY = ySide ? hull.heightMetres : 0;
        const worldX = (1 - nx * nx / denominator) * yawX + nx * localY - nx * nz / denominator * yawZ;
        const worldY = -nx * yawX + ny * localY - nz * yawZ;
        const worldZ = -nx * nz / denominator * yawX + nz * localY + (1 - nz * nz / denominator) * yawZ;
        const projectedX = worldX * c - worldZ * s, projectedZ = worldX * s + worldZ * c;
        minX = Math.min(minX, projectedX); maxX = Math.max(maxX, projectedX);
        minZ = Math.min(minZ, projectedZ); maxZ = Math.max(maxZ, projectedZ);
        minY = Math.min(minY, y + worldY); maxY = Math.max(maxY, y + worldY);
        if (corners !== null) {
          const corner = { x: x + worldX, y: y + worldY, z: z + worldZ };
          corners.push(corner); if (localY === 0) lowerCorners!.push(corner);
        } else if (lowerScratch !== null && localY === 0) {
          const corner = lowerScratch[lower++];
          corner.x = x + worldX; corner.y = y + worldY; corner.z = z + worldZ;
        }
      }
    }
  }
  const centreX = (minX + maxX) * 0.5, centreZ = (minZ + maxZ) * 0.5;
  return {
    x: x + c * centreX + s * centreZ, z: z - s * centreX + c * centreZ, headingY,
    halfWidthMetres: (maxX - minX) * 0.5, halfLengthMetres: (maxZ - minZ) * 0.5,
    minY, maxY, velocityX, velocityZ,
    sourceHull: { x, y, z, headingY, normalX: nx, normalY: ny, normalZ: nz, hull: { ...hull } },
  };
}

export function physicalPopulationHull(x: number, y: number, z: number, headingY: number,
  normalX: number, normalY: number, normalZ: number, hull: PopulationLocalHull,
  velocityX = 0, velocityZ = 0): PopulationHullPrism {
  // The prism never reads the transform's corners; none are formed.
  return physicalPopulationPrism(transformHull(x, y, z, headingY, normalX, normalY, normalZ, hull,
    velocityX, velocityZ, null, null, null));
}

/** Reuse the exact grade transform when its lower corners are also needed. */
export function physicalPopulationHullFromTransform(transformed: PopulationHullGeometry): PopulationHullPrism {
  return physicalPopulationPrism(transformed.footprint);
}

/** The physical prism of a transform's tilted footprint (see physicalPopulationHullFromTransform). */
export function physicalPopulationPrism(tilted: PopulationHullPrism): PopulationHullPrism {
  const source = tilted.sourceHull;
  if (!source) throw new RangeError('A transformed population hull needs its original source frame');
  const { x, y, z, headingY, hull } = source;
  // Human anatomy stays plumb while vehicles follow the grade. One conservative
  // prism contains both source boxes, at the ACTUAL normal, so an upright head
  // or shoulder cannot escape the roof-shifted prism on the uphill side.
  const c = Math.cos(headingY), s = Math.sin(headingY);
  const dx = tilted.x - x, dz = tilted.z - z;
  const cx = dx * c - dz * s, cz = dx * s + dz * c;
  const minX = Math.min(cx - tilted.halfWidthMetres, -hull.halfWidthMetres);
  const maxX = Math.max(cx + tilted.halfWidthMetres, hull.halfWidthMetres);
  const minZ = Math.min(cz - tilted.halfLengthMetres, -hull.halfLengthMetres);
  const maxZ = Math.max(cz + tilted.halfLengthMetres, hull.halfLengthMetres);
  const midX = (minX + maxX) * 0.5, midZ = (minZ + maxZ) * 0.5;
  return { ...tilted, x: x + c * midX + s * midZ, z: z - s * midX + c * midZ,
    halfWidthMetres: (maxX - minX) * 0.5, halfLengthMetres: (maxZ - minZ) * 0.5,
    minY: Math.min(y, tilted.minY), maxY: Math.max(y + hull.heightMetres, tilted.maxY) };
}
