/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** UNWIRED render-only proposal. Replaces one authored canopy's old basal
 * leader with its actual square support continuation; caller owns integration,
 * pricing and disposal. No source prop/collider/plan or material is changed. */
import * as THREE from 'three';
import type { BoxCollider, Prop } from '../level/plan.ts';
import { buildVegetationGrowthPlan } from './vegetationGrowthPlan.ts';
import type { VegetationContract, VegetationForm } from './vegetationForms.ts';

type Point = readonly [number, number, number];
type Triangle = readonly [Point, Point, Point];
const EPSILON = 1e-9; // Same numerical degeneracy value as the native root controls.
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Point, n: number): Point => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Point): Point => { const n = Math.hypot(...a); if (!(n > 0)) throw Error('Degenerate woody axis'); return scale(a, 1 / n); };
const stored = (a: Point): Point => a.map(Math.fround) as unknown as Point;
const point = (a: THREE.BufferAttribute, corner: number): Point => [a.getX(corner), a.getY(corner), a.getZ(corner)];
const key = (p: Point): string => p.join('/');
const directions: readonly Point[] = [[1, .371, .219], [.317, 1, .613], [.271, .433, 1]].map(a => unit(a as unknown as Point));

function onTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const e = sub(b, a), f = sub(c, a), n = cross(e, f), length = Math.hypot(...n);
  if (length <= EPSILON || Math.abs(dot(sub(p, a), n)) / length > EPSILON) return false;
  const o = sub(p, a), ee = dot(e, e), ef = dot(e, f), ff = dot(f, f), denominator = ee * ff - ef * ef;
  if (!(denominator > 0)) return false;
  const u = (dot(o, e) * ff - dot(o, f) * ef) / denominator;
  const v = (dot(o, f) * ee - dot(o, e) * ef) / denominator;
  return u >= -EPSILON && v >= -EPSILON && u + v <= 1 + EPSILON;
}
function rayHit(p: Point, direction: Point, a: Point, b: Point, c: Point): number | null {
  const e = sub(b, a), f = sub(c, a), h = cross(direction, f), determinant = dot(e, h);
  if (Math.abs(determinant) <= EPSILON) return null;
  const inverse = 1 / determinant, offset = sub(p, a), u = dot(offset, h) * inverse;
  if (u < -EPSILON || u > 1 + EPSILON) return null;
  const q = cross(offset, e), v = dot(direction, q) * inverse;
  if (v < -EPSILON || u + v > 1 + EPSILON) return null;
  const distance = dot(f, q) * inverse;
  return distance > EPSILON ? distance : null;
}
function interior(triangles: readonly Triangle[], p: Point): boolean {
  if (triangles.some(([a, b, c]) => onTriangle(p, a, b, c))) return false;
  return directions.every(direction => {
    const hits = triangles.flatMap(([a, b, c]) => { const hit = rayHit(p, direction, a, b, c); return hit === null ? [] : [hit]; }).sort((a, b) => a - b);
    let count = 0, last = -Infinity;
    for (const hit of hits) if (hit - last > EPSILON) { count++; last = hit; }
    return count % 2 === 1;
  });
}
function closedOutward(triangles: readonly Triangle[]): boolean {
  const edges = new Map<string, number>(); let volumeSix = 0;
  for (const [a, b, c] of triangles) {
    if ([a, b, c].some(p => !p.every(Number.isFinite)) || Math.hypot(...cross(sub(b, a), sub(c, a))) <= EPSILON) return false;
    volumeSix += dot(a, cross(b, c));
    const vertices = [a, b, c];
    for (let i = 0; i < 3; i++) { const edge = `${key(vertices[i])}|${key(vertices[(i + 1) % 3])}`; edges.set(edge, (edges.get(edge) ?? 0) + 1); }
  }
  return volumeSix > 1e-10 && [...edges].every(([edge, walks]) => walks === 1 && edges.get(edge.split('|').reverse().join('|')) === 1);
}
function trianglesFrom(position: THREE.BufferAttribute, first: number, count: number): Triangle[] {
  return Array.from({ length: count }, (_, i) => [point(position, (first + i) * 3), point(position, (first + i) * 3 + 1), point(position, (first + i) * 3 + 2)] as Triangle);
}

/** Source terrain owner stores world corners as Float32. Convert those actual
 * corners through this prop's inverse transform, then store the proposal in
 * that same native Float32 format. No guessed circle or yaw quantization. */
export function authoredCapInPropCoordinates(prop: Prop, support: BoxCollider): readonly Point[] {
  if (prop.kind !== 'treeCanopy' || ![prop.position.x, prop.position.y, prop.position.z, prop.rotationY, prop.scale,
    support.centre.x, support.centre.y, support.centre.z, support.halfExtents.x, support.halfExtents.y, support.halfExtents.z, support.rotationY].every(Number.isFinite)
    || !(prop.scale > 0) || !(support.halfExtents.x > 0 && support.halfExtents.y > 0 && support.halfExtents.z > 0)
    || support.appearance !== 'wood' || prop.position.x !== support.centre.x || prop.position.z !== support.centre.z)
    throw Error('Authored canopy needs its exact unique finite native wood support');
  const cs = Math.cos(support.rotationY), ss = Math.sin(support.rotationY), cp = Math.cos(prop.rotationY), sp = Math.sin(prop.rotationY);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const lx = sx * support.halfExtents.x, lz = sz * support.halfExtents.z;
    const x = Math.fround(support.centre.x + cs * lx + ss * lz) - prop.position.x;
    const z = Math.fround(support.centre.z - ss * lx + cs * lz) - prop.position.z;
    return stored([(cp * x - sp * z) / prop.scale,
      (Math.fround(support.centre.y + support.halfExtents.y) - prop.position.y) / prop.scale,
      (sp * x + cp * z) / prop.scale]);
  });
}
function centre(ring: readonly Point[]): Point {
  return scale(ring.reduce<Point>((sum, p) => add(sum, p), [0, 0, 0]), 1 / ring.length);
}
function ringSorted(ring: readonly Point[]): { readonly points: readonly Point[]; readonly angles: readonly number[] } {
  const c = centre(ring), records = ring.map(p => ({ p, angle: Math.atan2(p[2] - c[2], p[0] - c[0]) })).sort((a, b) => a.angle - b.angle);
  return { points: records.map(record => record.p), angles: records.map(record => record.angle) };
}
/** Join unequal convex native rings without a hidden cap or a crossed quad.
 * Each advance emits one triangle; directed-edge/volume checks are mandatory. */
function sides(lower: readonly Point[], upper: readonly Point[]): Triangle[] {
  const a = ringSorted(lower), b = ringSorted(upper), out: Triangle[] = [];
  let i = 0, j = 0;
  while (i < a.points.length || j < b.points.length) {
    const ai = a.points[i % a.points.length], bj = b.points[j % b.points.length];
    const nextA = i < a.points.length ? (i + 1 === a.points.length ? a.angles[0] + Math.PI * 2 : a.angles[i + 1]) : Infinity;
    const nextB = j < b.points.length ? (j + 1 === b.points.length ? b.angles[0] + Math.PI * 2 : b.angles[j + 1]) : Infinity;
    if (nextA <= nextB) { out.push([ai, bj, a.points[(i + 1) % a.points.length]]); i++; }
    else { out.push([ai, bj, b.points[(j + 1) % b.points.length]]); j++; }
  }
  return out;
}
function cap(ring: readonly Point[], top: boolean): Triangle[] {
  const p = ringSorted(ring).points, c = stored(centre(p));
  return p.map((a, i): Triangle => top ? [c, p[(i + 1) % p.length], a] : [c, a, p[(i + 1) % p.length]]);
}
function tube(from: Point, to: Point, radius: number, sectors: number): Triangle[] {
  const axis = unit(sub(to, from)), side = unit(Math.hypot(axis[0], axis[2]) < EPSILON ? [1, 0, 0] : [-axis[2], 0, axis[0]]), depth = unit(cross(side, axis));
  const ring = (at: Point): Point[] => Array.from({ length: sectors }, (_, i) => stored(add(at,
    add(scale(side, radius * Math.cos(i / sectors * Math.PI * 2)), scale(depth, radius * Math.sin(i / sectors * Math.PI * 2))))));
  // These rings are in perpendicular planes, so connect by the common native
  // sector order rather than the horizontal loft's angle-sorted zipper.
  const bottom = ring(from), top = ring(to), out: Triangle[] = [];
  for (let i = 0; i < sectors; i++) {
    const next = (i + 1) % sectors;
    out.push([stored(from), bottom[i], bottom[next]], [bottom[i], top[i], bottom[next]],
      [bottom[next], top[i], top[next]], [stored(to), top[next], top[i]]);
  }
  return out;
}
export interface AuthoredCanopySupportProposal {
  readonly geometry: THREE.BufferGeometry;
  readonly rootTriangles: number;
  readonly connectors: number;
  readonly connectorTriangles: number;
  readonly removedRootTriangles: number;
  readonly unchangedSourceFromCorner: number;
  readonly geometryBytes: number;
  /** Caller must use its existing owner; this proposal allocates no material. */
  readonly context: VegetationForm['context'];
}

/** One actual support; no cache, scene, price/admission or physical mutation.
 * Leaves and all existing primary/secondary boughs remain untouched. The caller
 * must omit only the old first leader's native triangles, then append this
 * replacement. This unwired proposal refuses any unproved attachment/bounds. */
export function proposeAuthoredCanopySupport(form: VegetationForm, contract: VegetationContract,
  prop: Prop, support: BoxCollider): AuthoredCanopySupportProposal {
  if (form.context.family !== 'crown' || form.geometry.index !== null) throw Error('Authored support requires actual non-indexed crown source');
  const position = form.geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!(position.array instanceof Float32Array) || position.itemSize !== 3 || position.count % 3 !== 0) throw Error('Native triangle layout required');
  const plan = buildVegetationGrowthPlan('crown', form.context.detail, form.context.variant);
  const recordCounts = plan.branches.map(branch => (branch.sectors ?? plan.branchSectors) * (branch.sections?.length ?? 2) * 2);
  const removedRootTriangles = recordCounts[0], sectors = plan.branches[0].sectors ?? plan.branchSectors, perSector = removedRootTriangles / sectors;
  const originalRoot = trianglesFrom(position, 0, removedRootTriangles);
  if (!closedOutward(originalRoot)) throw Error('Original native root is not a closed outward shell');
  const top = Array.from({ length: sectors }, (_, i) => point(position, (i * perSector + perSector - 1) * 3 + 2));
  const capRing = authoredCapInPropCoordinates(prop, support), capCentre = centre(capRing), topCentre = centre(top);
  if (capRing.some(p => p[1] !== capRing[0][1]) || top.some(p => p[1] !== top[0][1])
    || !(contract.min[1] < capRing[0][1] && capRing[0][1] < top[0][1])) throw Error('Actual square cap cannot fit beneath the retained native leader tip');
  // The old vertical square sleeve overlaid the unchanged native shaft.
  // Its new basal ring is buried halfway toward the actual cap axis; only the
  // exact cap edge reaches the host side plane. No visible collar is enlarged.
  const bottom = capRing.map(p => stored([(p[0] + capCentre[0]) * .5, contract.min[1], (p[2] + capCentre[2]) * .5]));
  const root = [...cap(bottom, false), ...sides(bottom, capRing), ...sides(capRing, top), ...cap(top, true)];
  if (!closedOutward(root) || !interior(root, capCentre)) throw Error('Square native leader failed closure or cap-axis containment');
  const chunks: Triangle[][] = [root]; let first = removedRootTriangles, connectors = 0;
  for (let branchIndex = 1; branchIndex < plan.branches.length; branchIndex++) {
    const count = recordCounts[branchIndex], branch = plan.branches[branchIndex];
    if (branch.parent === 0) {
      const native = trianglesFrom(position, first, count), n = branch.sectors ?? plan.branchSectors, segment = count / n;
      if (!closedOutward(native)) throw Error('Native primary bough is not closed outward');
      const branchRoot = point(position, first * 3), branchTip = point(position, (first + segment - 1) * 3);
      if (!interior(root, branchRoot)) {
        if (!(branchRoot[1] > bottom[0][1] && branchRoot[1] < top[0][1])) throw Error('Primary bough is outside the finite native leader band');
        const share = branchRoot[1] <= capRing[0][1] ? 0 : (branchRoot[1] - capRing[0][1]) / (top[0][1] - capRing[0][1]);
        const at = add(scale(capCentre, 1 - share), scale(topCentre, share));
        const anchor = stored([at[0], branchRoot[1], at[2]]), entered = stored(add(branchRoot, scale(sub(branchTip, branchRoot), .10)));
        if (!interior(root, anchor) || !interior(native, entered)) throw Error('Connector centres do not enter both real native owners');
        const branchRing = Array.from({ length: n }, (_, i) => point(position, (first + i * segment) * 3 + 1));
        let radius = Math.min(...branchRing.map(p => Math.hypot(...sub(p, branchRoot)))) * .25;
        let accepted: Triangle[] | undefined;
        // This bounded search shrinks proposed wood only. No safety predicate,
        // source dimension or tolerance changes; uncertainty refuses the input.
        for (let attempt = 0; attempt < 8; attempt++, radius *= .5) {
          const candidate = tube(anchor, entered, radius, n);
          const bottomRing = candidate.filter((_, i) => i % 4 === 0).flatMap(t => [t[1], t[2]]);
          const topRing = candidate.filter((_, i) => i % 4 === 3).flatMap(t => [t[1], t[2]]);
          if (closedOutward(candidate) && bottomRing.every(p => interior(root, p)) && topRing.every(p => interior(native, p))) { accepted = candidate; break; }
        }
        if (!accepted) throw Error('Finite connector search cannot prove actual owner penetration');
        chunks.push(accepted); connectors++;
      }
    }
    first += count;
  }
  if (connectors > plan.branches.filter(branch => branch.parent === 0).length) throw Error('Finite connector cap drift');
  for (const triangle of chunks.flat()) for (const p of triangle) if (p.some((value, axis) => value < contract.min[axis] || value > contract.max[axis])
    || Math.hypot(p[0], p[2]) > contract.spreadRadius) throw Error('Authored woody adapter left the existing canopy envelope');
  const all = chunks.flat(), p = new Float32Array(all.length * 9), normal = new Float32Array(p.length), color = new Float32Array(p.length);
  const sourceColor = form.geometry.getAttribute('color') as THREE.BufferAttribute;
  const shade: Point = [sourceColor.getX(0), sourceColor.getY(0), sourceColor.getZ(0)];
  if (!shade.every(Number.isFinite)) throw Error('Source wood finish is not finite');
  let corner = 0;
  for (const triangle of all) {
    const n = unit(cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0])));
    for (const q of triangle) { p.set(q, corner * 3); normal.set(n, corner * 3); color.set(shade, corner * 3); corner++; }
  }
  const wood = new Uint8Array(corner); wood.fill(1); const mass = new Uint8Array(corner); mass.fill(form.context.mass[0]);
  const reach = new Float32Array(corner); reach.fill(form.context.reach[0]);
  const height = new Float32Array(corner); for (let i = 0; i < corner; i++) height[i] = (p[i * 3 + 1] - contract.min[1]) / (contract.max[1] - contract.min[1]);
  const context = { ...form.context, wood, mass, reach, height, leaf: new Uint8Array(corner) };
  const geometry = new THREE.BufferGeometry();
  try {
    geometry.setAttribute('position', new THREE.BufferAttribute(p, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    if (form.context.detail === 'ultra') geometry.setAttribute('vegetationWood', new THREE.Float32BufferAttribute(wood, 1));
    if (!authoredSquareSleeveBuried(geometry, root.length, prop, support)) throw Error('Basal woody sleeve is not strictly buried within the native shaft');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = 'authored-canopy-square-support-proposal';
    return { geometry, context, rootTriangles: root.length, connectors, connectorTriangles: all.length - root.length,
      removedRootTriangles, unchangedSourceFromCorner: removedRootTriangles * 3,
      geometryBytes: Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) };
  } catch (error) { geometry.dispose(); throw error; }
}

/** Actual native complete cap edges, closed root and three-ray axis interior.
 * A circular-only or displaced hull cannot pass by covering a sampled centre. */
export function authoredSquareCapContact(geometry: THREE.BufferGeometry, rootTriangles: number,
  prop: Prop, support: BoxCollider): boolean {
  if (geometry.index !== null) return false;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!(position.array instanceof Float32Array) || !Number.isInteger(rootTriangles) || rootTriangles <= 0 || rootTriangles * 3 > position.count) return false;
  const root = trianglesFrom(position, 0, rootTriangles);
  if (!closedOutward(root)) return false;
  const actualEdges = new Set(root.flatMap(triangle => triangle.map((a, i) => `${key(a)}|${key(triangle[(i + 1) % 3])}`)));
  const expected = authoredCapInPropCoordinates(prop, support);
  if (!expected.every((a, i) => actualEdges.has(`${key(a)}|${key(expected[(i + 1) % 4])}`)
    && actualEdges.has(`${key(expected[(i + 1) % 4])}|${key(a)}`))) return false;
  return interior(root, centre(expected));
}

/** Every root triangle below the actual native cap must enter the host interior.
 * Convex native cap half-planes and the host vertical interval prove the whole
 * planar face lies inside; no vertex sample substitutes for a curved surface.
 * Cap-edge vertices may meet their exact source edge, but each basal triangle
 * needs a strictly buried vertex, so no outward host-plane face is retained. */
export function authoredSquareSleeveBuried(geometry: THREE.BufferGeometry, rootTriangles: number,
  prop: Prop, support: BoxCollider): boolean {
  if (!authoredSquareCapContact(geometry, rootTriangles, prop, support)) return false;
  const p = geometry.getAttribute('position') as THREE.BufferAttribute, capRing = authoredCapInPropCoordinates(prop, support), capY = capRing[0][1];
  const lowerY = (Math.fround(support.centre.y - support.halfExtents.y) - prop.position.y) / prop.scale;
  const horizontalInside = (q: Point): boolean => capRing.every((a, i) => {
    const b = capRing[(i + 1) % capRing.length]; return (b[0] - a[0]) * (q[2] - a[2]) - (b[2] - a[2]) * (q[0] - a[0]) > 0;
  });
  let basalFaces = 0;
  for (const triangle of trianglesFrom(p, 0, rootTriangles)) {
    if (!triangle.some(q => q[1] < capY)) continue;
    basalFaces++;
    if (!triangle.some(q => q[1] < capY && horizontalInside(q))) return false;
    for (const q of triangle) {
      if (q[1] < capY) { if (!(q[1] > lowerY) || !horizontalInside(q)) return false; }
      else if (q[1] !== capY || !capRing.some(a => key(a) === key(q))) return false;
    }
  }
  return basalFaces > 0;
}
