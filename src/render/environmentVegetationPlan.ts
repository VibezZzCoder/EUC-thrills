/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Original deterministic grass admission and partition, before geometry allocation. */
import { POTHOLE, ENVIRONMENT_VEGETATION as RULES } from '../data/tuning.ts';
import type { BoxCollider, GroundSurfaceTriangle, LevelPlan } from '../level/plan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { positionHash01 } from '../shared/maths.ts';
type Point = { x: number; z: number };
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Exclusion = { bounds: Bounds; contains(x: number, z: number, radius: number): boolean };
export type Clump = { x: number; y: number; z: number; nx: number; ny: number; nz: number;
  height: number; yaw: number; tint: number; rank: number; corridor: boolean };

/** Source surface proximity, not a camera-dependent population. The bounded
 * flood stops after the cover band; it does not treat unknown outer field as
 * road. Exact sampler/footprint admission still owns every accepted root. */
function corridorDistances(plan: LevelPlan): Uint8Array {
  const field = plan.heightfield, columns = field.columns - 1, rows = field.rows - 1;
  const distances = new Uint8Array(columns * rows); distances.fill(255);
  const queue = new Uint32Array(distances.length);
  let read = 0, write = 0;
  for (let index = 0; index < distances.length; index++) if (field.surfaces[index] !== 'grass') {
    distances[index] = 0; queue[write++] = index;
  }
  const reach = Math.min(254, Math.ceil(RULES.corridorCoverReachMetres / field.spacing));
  while (read < write) {
    const at = queue[read++], next = distances[at] + 1;
    if (next > reach) continue;
    const x = at % columns, z = Math.floor(at / columns);
    for (const adjacent of [x > 0 ? at - 1 : -1, x + 1 < columns ? at + 1 : -1,
      z > 0 ? at - columns : -1, z + 1 < rows ? at + columns : -1]) {
      if (adjacent < 0 || distances[adjacent] !== 255) continue;
      distances[adjacent] = next; queue[write++] = adjacent;
    }
  }
  return distances;
}

function distanceToLine(x: number, z: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2)) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function triangleExclusion(triangle: GroundSurfaceTriangle): Exclusion {
  const vertices = triangle.vertices;
  return { bounds: { minX: Math.min(...vertices.map(p => p.x)), maxX: Math.max(...vertices.map(p => p.x)),
    minZ: Math.min(...vertices.map(p => p.z)), maxZ: Math.max(...vertices.map(p => p.z)) },
  contains(x, z, radius) {
    if (vertices.length === 3) {
      // The same three edge signs and edge distances, without per-query arrays.
      const a = vertices[0], b = vertices[1], c = vertices[2];
      const s0 = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
      const s1 = (c.x - b.x) * (z - b.z) - (c.z - b.z) * (x - b.x);
      const s2 = (a.x - c.x) * (z - c.z) - (a.z - c.z) * (x - c.x);
      if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return true;
      return distanceToLine(x, z, a, b) <= radius || distanceToLine(x, z, b, c) <= radius
        || distanceToLine(x, z, c, a) <= radius;
    }
    const signs = vertices.map((a, index) => {
      const b = vertices[(index + 1) % 3];
      return (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    });
    if (signs.every(value => value >= 0) || signs.every(value => value <= 0)) return true;
    return vertices.some((a, index) => distanceToLine(x, z, a, vertices[(index + 1) % 3]) <= radius);
  } };
}

function boxExclusion(box: BoxCollider): Exclusion {
  const c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
  const width = Math.abs(c) * box.halfExtents.x + Math.abs(s) * box.halfExtents.z;
  const depth = Math.abs(s) * box.halfExtents.x + Math.abs(c) * box.halfExtents.z;
  return { bounds: { minX: box.centre.x - width, maxX: box.centre.x + width,
    minZ: box.centre.z - depth, maxZ: box.centre.z + depth }, contains(x, z, radius) {
    const dx = x - box.centre.x, dz = z - box.centre.z;
    return Math.hypot(Math.max(0, Math.abs(c * dx - s * dz) - box.halfExtents.x),
      Math.max(0, Math.abs(s * dx + c * dz) - box.halfExtents.z)) <= radius;
  } };
}

/** Spatial admission index; its borrowed source entries never become meshes. */
function exclusionIndex(plan: LevelPlan): (x: number, z: number) => boolean {
  const buckets = new Map<string, Exclusion[]>(), pitch = RULES.exclusionBucketMetres;
  const add = (entry: Exclusion) => {
    const b = entry.bounds, r = RULES.footprintRadius;
    if (![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) throw new Error('Non-finite vegetation exclusion');
    for (let iz = Math.floor((b.minZ - r) / pitch); iz <= Math.floor((b.maxZ + r) / pitch); iz++) {
      for (let ix = Math.floor((b.minX - r) / pitch); ix <= Math.floor((b.maxX + r) / pitch); ix++) {
        const key = `${ix},${iz}`, bucket = buckets.get(key);
        if (bucket) bucket.push(entry); else buckets.set(key, [entry]);
      }
    }
  };
  for (const box of [...plan.segments.flatMap(segment => segment.colliders),
    ...(plan.solids ?? []), ...(plan.softBodies ?? [])]) {
    if (![box.centre.x, box.centre.y, box.centre.z, box.rotationY,
      box.halfExtents.x, box.halfExtents.y, box.halfExtents.z].every(Number.isFinite)
      || Math.min(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z) < 0) {
      throw new Error('Invalid original vegetation blocker');
    }
    add(boxExclusion(box));
  }
  for (const patch of plan.groundSurfacePatches ?? []) for (const triangle of patch.triangles) {
    if (triangle.vertices.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) throw new Error('Invalid precise vegetation patch');
    add(triangleExclusion(triangle));
  }
  for (const hazard of plan.hazards ?? []) {
    if (![hazard.centre.x, hazard.centre.z, hazard.radius].every(Number.isFinite) || hazard.radius <= 0) {
      throw new Error('Invalid original vegetation hazard');
    }
    const radius = hazard.kind === 'spill' ? hazard.radius : hazard.radius * POTHOLE.haloFraction
      * (1 + POTHOLE.outlineHarmonics.reduce((sum, harmonic) => sum + Math.abs(harmonic), 0));
    add({ bounds: { minX: hazard.centre.x - radius, maxX: hazard.centre.x + radius,
      minZ: hazard.centre.z - radius, maxZ: hazard.centre.z + radius },
    contains: (x, z, margin) => Math.hypot(x - hazard.centre.x, z - hazard.centre.z) <= radius + margin });
  }
  // Even a grass-surfaced authored corridor stays clear. The short original
  // socket-arc chords gain a conservative margin; these are no new routes.
  for (const segment of plan.segments) {
    const a = segment.entry, b = segment.exit, turn = b.headingY - a.headingY;
    const chord = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    const length = Math.abs(turn) < 1e-9 ? chord : chord * (turn / 2) / Math.sin(turn / 2);
    if (![length, turn, a.headingY, a.halfWidth, b.halfWidth].every(Number.isFinite)
      || length <= 0 || Math.min(a.halfWidth, b.halfWidth) < 0) throw new Error('Invalid vegetation source corridor');
    const at = (s: number): Point => {
      const h = a.headingY + turn * s / length, curvature = turn / length;
      return { x: a.position.x + (Math.abs(turn) < 1e-9 ? Math.sin(h) * s : (Math.cos(a.headingY) - Math.cos(h)) / curvature),
        z: a.position.z + (Math.abs(turn) < 1e-9 ? Math.cos(h) * s : (Math.sin(h) - Math.sin(a.headingY)) / curvature) };
    };
    const steps = Math.max(1, Math.ceil(length / RULES.routeSampleMetres));
    const width = Math.max(a.halfWidth, b.halfWidth) + RULES.routeMargin;
    for (let i = 0; i < steps; i++) {
      const p = at(length * i / steps), q = at(length * (i + 1) / steps);
      add({ bounds: { minX: Math.min(p.x, q.x) - width, maxX: Math.max(p.x, q.x) + width,
        minZ: Math.min(p.z, q.z) - width, maxZ: Math.max(p.z, q.z) + width },
      contains: (x, z, r) => distanceToLine(x, z, p, q) <= width + r });
    }
  }
  return (x, z) => buckets.get(`${Math.floor(x / pitch)},${Math.floor(z / pitch)}`)
    ?.some(entry => entry.contains(x, z, RULES.footprintRadius)) ?? false;
}

/** Closed leaf volumes with a curved, tapered spine. Short splayed leaves
 * form a turf clump rather than a handful of upright needles. */

export function prepareEnvironmentVegetation(plan: LevelPlan) {
  const field = plan.heightfield;
  if (![field.originX, field.originZ, field.spacing].every(Number.isFinite) || field.spacing <= 0
    || !Number.isSafeInteger(field.columns) || !Number.isSafeInteger(field.rows) || field.columns < 2 || field.rows < 2
    || field.heights.length !== field.columns * field.rows
    || field.surfaces.length !== (field.columns - 1) * (field.rows - 1)
    || field.heights.some(height => !Number.isFinite(height))) throw new Error('Invalid vegetation heightfield');
  const blocked = exclusionIndex(plan), sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
  const maximumX = field.originX + (field.columns - 1) * field.spacing;
  const maximumZ = field.originZ + (field.rows - 1) * field.spacing;
  const minX = Math.ceil(field.originX / RULES.latticeMetres), maxX = Math.floor(maximumX / RULES.latticeMetres);
  const minZ = Math.ceil(field.originZ / RULES.latticeMetres), maxZ = Math.floor(maximumZ / RULES.latticeMetres);
  let stride = Math.max(1, Math.ceil(Math.sqrt(Math.max(0, maxX - minX + 1) * Math.max(0, maxZ - minZ + 1)
    / RULES.maximumCandidateChecks)));
  while (Math.ceil(Math.max(0, maxX - minX + 1) / stride) * Math.ceil(Math.max(0, maxZ - minZ + 1) / stride)
    > RULES.maximumCandidateChecks) stride++;
  const clumps: Clump[] = [];
  const distances = corridorDistances(plan);
  const near: { ix: number; iz: number; rank: number }[] = [], far: typeof near = [];
  const reach = Math.min(254, Math.ceil(RULES.corridorCoverReachMetres / field.spacing));
  for (let iz = minZ; iz <= maxZ; iz++) for (let ix = minX; ix <= maxX; ix++) {
    const column = Math.floor((ix * RULES.latticeMetres - field.originX) / field.spacing);
    const row = Math.floor((iz * RULES.latticeMetres - field.originZ) / field.spacing);
    if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) continue;
    const distance = distances[row * (field.columns - 1) + column];
    if (distance === 0) continue;
    const corridor = distance <= reach;
    if (!corridor && (ix % stride !== 0 || iz % stride !== 0)) continue;
    (corridor ? near : far).push({ ix, iz, rank: positionHash01(ix, iz, 30) });
  }
  const sort = (a: typeof near[number], b: typeof near[number]) => a.rank - b.rank || a.ix - b.ix || a.iz - b.iz;
  near.sort(sort); far.sort(sort);
  const nearLimit = Math.min(near.length, Math.floor(RULES.maximumCandidateChecks * RULES.corridorCandidateShare));
  const farLimit = Math.min(far.length, RULES.maximumCandidateChecks - nearLimit);
  near.length = Math.min(near.length, RULES.maximumCandidateChecks - farLimit);
  far.length = farLimit;
  let candidateChecks = 0;
  const r = RULES.footprintRadius;
  const grassDisk = (x: number, z: number): boolean => {
    if (x - r < field.originX || x + r > maximumX || z - r < field.originZ || z + r > maximumZ) return false;
    for (let row = Math.floor((z - r - field.originZ) / field.spacing);
      row <= Math.floor((z + r - field.originZ) / field.spacing); row++) {
      for (let column = Math.floor((x - r - field.originX) / field.spacing);
        column <= Math.floor((x + r - field.originX) / field.spacing); column++) {
        if (row >= field.rows - 1 || column >= field.columns - 1) return false;
        const left = field.originX + column * field.spacing, near = field.originZ + row * field.spacing;
        if (Math.hypot(Math.max(left - x, 0, x - left - field.spacing),
          Math.max(near - z, 0, z - near - field.spacing)) <= r
          && field.surfaces[row * (field.columns - 1) + column] !== 'grass') return false;
      }
    }
    return true;
  };
  for (const [population, corridor] of [[near, true], [far, false]] as const) {
    for (const { ix, iz } of population) {
      candidateChecks++;
      const density = RULES.minimumDensity
        + RULES.broadDensity * positionHash01(Math.floor(ix / RULES.broadClusterCells), Math.floor(iz / RULES.broadClusterCells), 21)
        + RULES.fineDensity * positionHash01(Math.floor(ix / RULES.fineClusterCells), Math.floor(iz / RULES.fineClusterCells), 22);
      if (positionHash01(ix, iz, 23) > density) continue;
      const x = (ix + (positionHash01(ix, iz, 24) - 0.5) * RULES.jitterShare) * RULES.latticeMetres;
      const z = (iz + (positionHash01(ix, iz, 25) - 0.5) * RULES.jitterShare) * RULES.latticeMetres;
      if (!grassDisk(x, z) || blocked(x, z)) continue;
      sampler.sampleGround(x, z, sample);
      if (sample.offCourse || sample.surface !== 'grass' || sample.normal.y < RULES.minimumUpNormal) continue;
      const height = sample.height, nx = sample.normal.x, ny = sample.normal.y, nz = sample.normal.z;
      let lift: number = RULES.rootLift;
      let supported = true;
      // A clump rests on this exact source triangle plane. Reject a seam whose
      // neighboring plane cannot support its root volume within 12 mm.
      for (const dx of [-r, 0, r]) for (const dz of [-r, 0, r]) {
        if (dx * dx + dz * dz > r * r) continue;
        sampler.sampleGround(x + dx, z + dz, sample);
        const plane = height - (nx * dx + nz * dz) / ny;
        if (sample.surface !== 'grass' || sample.offCourse || Math.abs(sample.height - plane) > RULES.maximumSupportError) supported = false;
        lift = Math.max(lift, sample.height - plane + RULES.rootLift);
      }
      if (!supported) continue;
      clumps.push({ x, y: height + lift, z, nx, ny, nz,
        height: RULES.minimumHeight + positionHash01(ix, iz, 26) * (RULES.maximumHeight - RULES.minimumHeight),
        yaw: positionHash01(ix, iz, 27) * Math.PI * 2,
        tint: 0.86 + positionHash01(ix, iz, 28) * 0.24,
        rank: (corridor ? 0 : 2) + positionHash01(ix, iz, 29), corridor });
    }
  }
  clumps.sort((a, b) => a.rank - b.rank || a.x - b.x || a.z - b.z);
  const populationCapped = clumps.length > RULES.ultraClumpLimit;
  clumps.length = Math.min(clumps.length, RULES.ultraClumpLimit);
  const ordinaryClumps = Math.min(RULES.ordinaryClumpLimit, Math.ceil(clumps.length * RULES.ordinaryPopulationShare));
  const corridorClumps = clumps.filter(clump => clump.corridor).length;
  let batchPitch: number = RULES.minimumBatchMetres;
  const partition = (pitch: number) => {
    const result = new Map<string, { clump: Clump; ordinary: boolean }[]>();
    clumps.forEach((clump, index) => {
    const key = `${Math.floor(clump.x / pitch)},${Math.floor(clump.z / pitch)}`, bucket = result.get(key);
    const entry = { clump, ordinary: index < ordinaryClumps };
    if (bucket) bucket.push(entry); else result.set(key, [entry]);
    });
    return result;
  };
  let batches = partition(batchPitch);
  while (batches.size > RULES.maximumSpatialBatches) { batchPitch *= 1.5; batches = partition(batchPitch); }

  return { source: plan, clumps, ordinaryClumps, corridorClumps, populationCapped,
    candidateChecks, stride, batches };
}
export type PreparedEnvironmentVegetation = ReturnType<typeof prepareEnvironmentVegetation>;
