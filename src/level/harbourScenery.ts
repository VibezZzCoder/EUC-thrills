/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CAMERA } from '../data/tuning.ts';
import type { LevelPlan } from './plan.ts';

/**
 * The harbour outside a walled island (M44 Quay Quarter): open water to the
 * haze, a far shore of low hills with a town and a container quay on it, a
 * striped lighthouse at the harbour mouth, a bridge to the north shore and six
 * moored boats.
 *
 * **Plain data, never meshes** (invariant 2). This module lays the scenery out
 * as a list of simple primitives; `render/riverScenery.ts` turns that list into
 * one vertex-coloured mesh, and `level/renderBudget.ts` prices it through
 * `harbourSceneryTriangles`, the same list and the same per-primitive table, so
 * the predicted and the measured cost cannot drift apart.
 *
 * **Render-only.** Nothing here reaches the sampler, a collider or the
 * population: the island's guard wall stays the edge of the ridden world, and
 * the bridge can never be ridden.
 *
 * **Placed against the camera, not against a map.** Every solid vertex stands
 * within `HARBOUR.reach` of the *farthest* island corner, so no camera on the
 * island can reach the far plane (`CAMERA.far`) on it; the fog (`LIGHTING`
 * 120 → 470 m) softens the far shore from the island's far side instead of the
 * clip cutting it. Only the flat water runs past that, out beyond the fog, where
 * it is already the horizon colour the sky's bottom stop also is.
 *
 * Deterministic: every variation comes from a fixed integer hash.
 */

export type RiverScenery = NonNullable<LevelPlan['riverScenery']>;
export type Point3 = readonly [number, number, number];

export type HarbourPiece =
  /** A flat mitred band around the wall rectangle, `inner`→`outer` metres off it; colours shade across it. */
  | { readonly kind: 'ring'; readonly halfWidth: number; readonly halfDepth: number; readonly inner: number; readonly outer: number; readonly y: number; readonly innerColour: number; readonly outerColour: number }
  /** Four walls and a roof; no floor (it always stands in ground or water). `yaw` turns local x/z like `rotation.y`. */
  | { readonly kind: 'box'; readonly x: number; readonly z: number; readonly y0: number; readonly y1: number; readonly width: number; readonly depth: number; readonly yaw: number; readonly colour: number }
  /** A pitched roof, ridge along local x, eaves at `y0`, ridge at `y1`. */
  | { readonly kind: 'gable'; readonly x: number; readonly z: number; readonly y0: number; readonly y1: number; readonly width: number; readonly depth: number; readonly yaw: number; readonly colour: number }
  /** A rectangular-section member between two points: four faces, and both ends closed when `caps`. */
  | { readonly kind: 'beam'; readonly from: Point3; readonly to: Point3; readonly width: number; readonly height: number; readonly colour: number; readonly caps?: boolean }
  /** An n-sided tapered drum, optionally capped on top. */
  | { readonly kind: 'tower'; readonly x: number; readonly z: number; readonly y0: number; readonly y1: number; readonly r0: number; readonly r1: number; readonly sides: number; readonly cap: boolean; readonly colour: number }
  /** An n-sided cone or pyramid. */
  | { readonly kind: 'cone'; readonly x: number; readonly z: number; readonly y0: number; readonly y1: number; readonly r: number; readonly sides: number; readonly colour: number }
  /** A boat hull: pointed pentagon footprint, sides narrowing to the keel, flat deck. Bow along local +x. */
  | { readonly kind: 'hull'; readonly x: number; readonly z: number; readonly yaw: number; readonly length: number; readonly beam: number; readonly y0: number; readonly y1: number; readonly colour: number; readonly deckColour: number }
  /** A sail: one triangle drawn from both sides. */
  | { readonly kind: 'sail'; readonly a: Point3; readonly b: Point3; readonly c: Point3; readonly colour: number }
  /** A column-major grid of points (`points[column * rows + row]`), one colour per point, facing up. */
  | { readonly kind: 'strip'; readonly columns: number; readonly rows: number; readonly points: readonly Point3[]; readonly colours: readonly number[] };

/** Triangles each primitive draws — the one table the renderer and the budget share. */
export function pieceTriangles(piece: HarbourPiece): number {
  switch (piece.kind) {
    case 'ring': return 8;
    case 'box': return 10;
    case 'gable': return 6;
    case 'beam': return piece.caps === true ? 12 : 8;
    case 'tower': return 2 * piece.sides + (piece.cap ? piece.sides - 2 : 0);
    case 'cone': return piece.sides;
    case 'hull': return 13;
    case 'sail': return 2;
    case 'strip': return 2 * (piece.columns - 1) * (piece.rows - 1);
  }
}

export const HARBOUR = {
  /** Water surface, m. Above the surround field (y 0) so it never fights it, well under the 1.4 m wall top. */
  waterY: 0.3,
  /** Water reaches this far past the wall foot, m: beyond `LIGHTING.fogFar` (470) from any wall. */
  waterReach: 540,
  /** Farthest any solid vertex may stand from the farthest island corner, m (`CAMERA.far` less a margin for camera travel). */
  reach: CAMERA.far - 25,
  /** The hills ring runs from the south-west headland, round by north, to the south-east headland (degrees, atan2(z, x); +z is south). */
  arcStartDegrees: 140,
  arcEndDegrees: 400,
  arcColumns: 81,
  /** The container quay's straight frontage, m off the east wall. */
  quayOffset: 116,
} as const;

export const HARBOUR_COLOURS = {
  foam: 0xe6f1f2, nearWater: 0x5fa3c2, midWater: 0x4789ae, deepWater: 0x2f6f96, openWater: 0x2b6991,
  sand: 0xd8cba2, meadow: 0x9cb08a, grass: 0x82997f, ridge: 0x6f8a7b,
  tree: 0x5f7b67, treeDark: 0x56705f,
  skyline: [0x8ea3b3, 0x9aaebd, 0x8296a8, 0xa6b6c3, 0xb3aa9a, 0xc4c3bd] as readonly number[],
  tower: [0x7f97ab, 0x93a8b9, 0xa9bac7, 0x8a9eb0] as readonly number[],
  roof: 0xa8705c, roofDark: 0x8f6a5e, cottage: [0xe2ddd0, 0xd8ccb4, 0xcfd3cf] as readonly number[],
  crane: 0xc4573a, containers: [0xb8574a, 0x3f6f8f, 0xc9a13d, 0x4f8a5b, 0x8a6f9a] as readonly number[], shed: 0xa9a59a,
  lighthouseWhite: 0xf2efe8, lighthouseRed: 0xc4423a, gallery: 0x394047, lantern: 0xf3d27a, lighthouseRoof: 0xb5372f,
  rock: 0x6f7479, rockLight: 0x868b8d, concrete: 0xb9b4a8, stone: 0xc3b9a5,
  deck: 0x8d8a84, parapet: 0xc9c3b5, pier: 0xa39d90, lamp: 0x3c4248, lampHead: 0xe9e2c8,
  hullWhite: 0xf1f1ec, hullNavy: 0x2c5d8a, hullRed: 0xb8473b, hullBlue: 0x3a77a8,
  boatDeck: 0xb08a5e, sailCloth: 0xf6f4ec, cabin: 0xe8e6de, glass: 0x3a4a58, mast: 0xd9d6cc,
  shipHull: 0x34495c, shipDeck: 0x8c4a3e,
} as const;

const DEG = Math.PI / 180;

/** A fixed integer hash to [0, 1): the scenery's only source of variety. */
function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const pick = <T>(list: readonly T[], n: number): T => list[Math.floor(hash(n) * list.length) % list.length]!;
const smooth = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How far a point stands from the island's farthest corner — the clip test. */
export function islandReach(x: number, z: number, r: RiverScenery): number {
  return Math.hypot(Math.abs(x) + r.halfWidth, Math.abs(z) + r.halfDepth);
}

/** Distance from the wall rectangle (0 on or inside it). */
const wallDistance = (x: number, z: number, r: RiverScenery): number =>
  Math.hypot(Math.max(Math.abs(x) - r.halfWidth, 0), Math.max(Math.abs(z) - r.halfDepth, 0));

/** The distance along the ray from the island centre at `theta` where `f` first reaches `target` (f increasing). */
function along(theta: number, target: number, f: (x: number, z: number) => number): number {
  const cx = Math.cos(theta), cz = Math.sin(theta);
  let lo = 0, hi = 4000;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(cx * mid, cz * mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The shore, its hills and the profile across them at one bearing. */
interface ShoreSection { readonly theta: number; readonly ts: readonly number[]; readonly ys: readonly number[] }

function shoreSection(theta: number, r: RiverScenery): ShoreSection {
  const W = HARBOUR.waterY;
  const deg = theta / DEG;
  // The container quay (east) is a straight frontage: a constant offset from the straight east wall.
  const quay = smooth(322, 336, deg) * smooth(394, 380, deg);
  const offset = (1 - quay) * (112 + 10 * Math.sin(3 * theta + 1.3) + 6 * Math.sin(5 * theta + 0.4)) + quay * HARBOUR.quayOffset;
  const tShore = along(theta, offset, (x, z) => wallDistance(x, z, r));
  const tSafe = along(theta, HARBOUR.reach - 4, (x, z) => islandReach(x, z, r));
  const tRidge = Math.min(tShore + 100 + 14 * Math.sin(2 * theta + 0.9), tSafe);
  const zone = deg > 320 && deg < 385 ? 0.72 : deg > 232 && deg < 308 ? 1.12 : 1;
  const ridge = zone * (19 + 6 * Math.sin(2.7 * theta + 0.4) + 4 * Math.sin(6.1 * theta + 2.2) + 2.5 * Math.sin(11.3 * theta + 1.1));
  const taper = smooth(HARBOUR.arcStartDegrees, HARBOUR.arcStartDegrees + 24, deg) * smooth(HARBOUR.arcEndDegrees, HARBOUR.arcEndDegrees - 24, deg);
  const floor = W - 0.8;
  const full = [floor, 1.2, 2.4 - 1.15 * quay, 0.55 * ridge, ridge];
  return {
    theta,
    ts: [tShore, tShore + 5, tShore + 10, tShore + 0.45 * (tRidge - tShore), tRidge],
    ys: full.map((y) => floor + taper * (y - floor)),
  };
}

/** Ground height on the far shore at a bearing and a distance from the centre (linear across the section's rows). */
function groundAt(section: ShoreSection, t: number): number {
  const { ts, ys } = section;
  if (t <= ts[0]!) return ys[0]!;
  for (let i = 1; i < ts.length; i++) if (t <= ts[i]!) return ys[i - 1]! + (ys[i]! - ys[i - 1]!) * (t - ts[i - 1]!) / (ts[i]! - ts[i - 1]!);
  return ys[ys.length - 1]!;
}

/** The island-facing yaw for something standing at bearing `theta` (local +z points away from the island). */
const facing = (theta: number): number => Math.atan2(Math.cos(theta), Math.sin(theta));

/** The harbour's primitives for this plan, in a fixed order. */
export function harbourPieces(r: RiverScenery): readonly HarbourPiece[] {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY, hw = r.halfWidth, hd = r.halfDepth;
  const pieces: HarbourPiece[] = [];
  const near = Math.max(8, r.waterWidth);

  // -- Water: foam at the wall foot, pale near-shore blue, deep open water to the haze.
  const bands: [number, number, number, number][] = [
    [0, 0.7, C.foam, C.foam], [0.7, 2.6, C.foam, C.nearWater], [2.6, near / 2, C.nearWater, C.midWater],
    [near / 2, near, C.midWater, C.deepWater], [near, HARBOUR.waterReach, C.deepWater, C.openWater],
  ];
  for (const [inner, outer, innerColour, outerColour] of bands) pieces.push({ kind: 'ring', halfWidth: hw, halfDepth: hd, inner, outer, y: W, innerColour, outerColour });

  // -- The far shore: one strip of hills from the south-west headland to the south-east one.
  const columns = HARBOUR.arcColumns, sections: ShoreSection[] = [];
  for (let i = 0; i < columns; i++) sections.push(shoreSection((HARBOUR.arcStartDegrees + (HARBOUR.arcEndDegrees - HARBOUR.arcStartDegrees) * i / (columns - 1)) * DEG, r));
  const rowColours = [C.sand, C.sand, C.meadow, C.grass, C.ridge];
  const points: Point3[] = [], colours: number[] = [];
  for (const s of sections) for (let j = 0; j < s.ts.length; j++) {
    points.push([Math.cos(s.theta) * s.ts[j]!, s.ys[j]!, Math.sin(s.theta) * s.ts[j]!]);
    colours.push(rowColours[j]!);
  }
  pieces.push({ kind: 'strip', columns, rows: rowColours.length, points, colours });

  const at = (degrees: number) => shoreSection(degrees * DEG, r);
  const place = (degrees: number, offset: number) => {
    const s = at(degrees), t = Math.min(s.ts[0]! + offset, s.ts[4]! - 8);
    return { s, t, x: Math.cos(s.theta) * t, z: Math.sin(s.theta) * t, ground: groundAt(s, t), yaw: facing(s.theta) };
  };
  const block = (degrees: number, offset: number, width: number, depth: number, height: number, colour: number, roof?: number) => {
    const p = place(degrees, offset);
    pieces.push({ kind: 'box', x: p.x, z: p.z, y0: W - 1, y1: p.ground + height, width, depth, yaw: p.yaw, colour });
    if (roof !== undefined) pieces.push({ kind: 'gable', x: p.x, z: p.z, y0: p.ground + height, y1: p.ground + height + Math.min(width, depth) * 0.38, width: width + 0.6, depth: depth + 0.6, yaw: p.yaw, colour: roof });
  };

  // -- North town behind the bridge landing: two rows of houses and a cluster of towers.
  for (let i = 0; i < 30; i++) {
    const deg = 238 + i * 2.25 + (hash(i * 7 + 1) - 0.5) * 1.2;
    if (Math.abs(deg - 270) < 3.4) continue;
    const back = i % 2 === 1, n = i * 13 + 5;
    const offset = back ? 24 + hash(n) * 14 : 10 + hash(n) * 6;
    const height = back ? 11 + hash(n + 1) * 10 : 6.5 + hash(n + 1) * 6;
    block(deg, offset, 9 + hash(n + 2) * 6, 8 + hash(n + 3) * 4, height, pick(C.skyline, n + 4), !back && hash(n + 5) < 0.55 ? C.roof : undefined);
  }
  for (const [deg, offset, height, n] of [[279, 62, 38, 1], [284.5, 70, 30, 2], [290, 58, 44, 3], [297, 66, 34, 4], [258, 64, 28, 5]] as const) {
    const width = 11 + hash(n * 31) * 4;
    block(deg, offset, width, width * 0.9, height, pick(C.tower, n * 31 + 1));
    if (n % 2 === 1) { const p = place(deg, offset); pieces.push({ kind: 'box', x: p.x, z: p.z, y0: p.ground + height, y1: p.ground + height + 4, width: width * 0.6, depth: width * 0.55, yaw: p.yaw, colour: C.skyline[3]! }); }
  }

  // -- East container quay: a straight concrete apron, two gantry cranes, stacked boxes, sheds, and a skyline behind.
  const shoreX = hw + HARBOUR.quayOffset;
  pieces.push({ kind: 'box', x: shoreX + 5.5, z: -6, y0: W - 1, y1: 1.3, width: 17, depth: 156, yaw: 0, colour: C.concrete });
  for (const cz of [-44, 4]) {
    const pt = (x: number, z: number, y: number): Point3 => [shoreX + x, y, cz + z];
    const x0 = 1.5, x1 = 12.5, top = 23, boom = 26;
    for (const x of [x0, x1]) for (const z of [-6, 6]) pieces.push({ kind: 'beam', from: pt(x, z, 1.3), to: pt(x, z, top), width: 0.9, height: 0.9, colour: C.crane });
    for (const x of [x0, x1]) pieces.push({ kind: 'beam', from: pt(x, -6.45, top), to: pt(x, 6.45, top), width: 1, height: 1.1, colour: C.crane, caps: true });
    for (const z of [-6, 6]) pieces.push({ kind: 'beam', from: pt(x0, z, 6), to: pt(x1, z, top - 1.5), width: 0.5, height: 0.5, colour: C.crane });
    pieces.push({ kind: 'beam', from: pt(-30, 0, boom), to: pt(24, 0, boom), width: 1.7, height: 1.7, colour: C.crane, caps: true });
    for (const z of [-6, 6]) pieces.push({ kind: 'beam', from: pt((x0 + x1) / 2, z, top), to: pt((x0 + x1) / 2, 0, boom + 7), width: 0.4, height: 0.4, colour: C.crane });
    pieces.push({ kind: 'beam', from: pt((x0 + x1) / 2, 0, boom + 7), to: pt(-30, 0, boom + 0.8), width: 0.22, height: 0.22, colour: C.crane });
    pieces.push({ kind: 'box', x: shoreX + 10, z: cz, y0: boom + 0.85, y1: boom + 3.6, width: 7, depth: 4.4, yaw: 0, colour: C.shed });
  }
  for (let i = 0; i < 12; i++) {
    const n = 400 + i * 17, row = i % 3 === 2 ? 1 : 0, z = -76 + i * 12.6 + (hash(n) - 0.5) * 2;
    if (Math.abs(z + 44) < 8 || Math.abs(z - 4) < 8) continue;
    const levels = 1 + Math.floor(hash(n + 1) * 3);
    for (let k = 0; k < levels; k++) pieces.push({ kind: 'box', x: shoreX + 5 + row * 3, z, y0: 1.3 + k * 2.6, y1: 1.3 + (k + 1) * 2.6, width: 2.5, depth: 12, yaw: 0, colour: pick(C.containers, n + k) });
  }
  const groundUnder = (x: number, z: number): number => {
    let deg = Math.atan2(z, x) / DEG; if (deg < HARBOUR.arcEndDegrees - 360) deg += 360;
    return groundAt(shoreSection(deg * DEG, r), Math.hypot(x, z));
  };
  for (const cz of [-58, 46]) {
    const g = Math.max(1.3, groundUnder(shoreX + 25, cz));
    pieces.push({ kind: 'box', x: shoreX + 25, z: cz, y0: W - 1, y1: g + 7.5, width: 16, depth: 34, yaw: 0, colour: C.shed });
    pieces.push({ kind: 'gable', x: shoreX + 25, z: cz, y0: g + 7.5, y1: g + 11, width: 34.6, depth: 16.6, yaw: Math.PI / 2, colour: C.roofDark });
  }
  for (let i = 0; i < 9; i++) {
    const n = 600 + i * 23, deg = 333 + i * 5.6 + (hash(n) - 0.5) * 2;
    const width = 10 + hash(n + 1) * 6, height = 22 + hash(n + 2) * 20;
    block(deg, 56 + hash(n + 3) * 22, width, width * (0.8 + hash(n + 4) * 0.3), height, pick(C.tower, n + 5));
    if (hash(n + 6) < 0.45) { const p = place(deg + 2.6, 44); pieces.push({ kind: 'box', x: p.x, z: p.z, y0: W - 1, y1: p.ground + height * 0.5, width: width * 1.4, depth: width, yaw: p.yaw, colour: pick(C.skyline, n + 7) }); }
  }

  // -- West village: cottages with pitched roofs and a church with a spire.
  for (let i = 0; i < 11; i++) {
    const n = 800 + i * 19, deg = 162 + i * 5.6 + (hash(n) - 0.5) * 2.4;
    if (Math.abs(deg - 196) < 3) continue;
    block(deg, 9 + hash(n + 1) * 22, 7 + hash(n + 2) * 3, 6 + hash(n + 3) * 2, 4 + hash(n + 4) * 2.5, pick(C.cottage, n + 5), hash(n + 6) < 0.8 ? C.roof : C.roofDark);
  }
  {
    const p = place(196, 26);
    pieces.push({ kind: 'box', x: p.x, z: p.z, y0: W - 1, y1: p.ground + 7, width: 7, depth: 15, yaw: p.yaw, colour: C.cottage[0]! });
    pieces.push({ kind: 'gable', x: p.x, z: p.z, y0: p.ground + 7, y1: p.ground + 10.5, width: 15.6, depth: 7.6, yaw: p.yaw + Math.PI / 2, colour: C.roofDark });
    const q = place(196, 17);
    pieces.push({ kind: 'box', x: q.x, z: q.z, y0: W - 1, y1: q.ground + 15, width: 4, depth: 4, yaw: q.yaw, colour: C.cottage[0]! });
    pieces.push({ kind: 'cone', x: q.x, z: q.z, y0: q.ground + 15, y1: q.ground + 23, r: 2.9, sides: 4, colour: C.roofDark });
  }

  // -- Trees on the slopes, kept off the town, the quay and the village.
  for (let i = 0; i < 72; i++) {
    const n = 1000 + i * 29, deg = HARBOUR.arcStartDegrees + 16 + hash(n) * (HARBOUR.arcEndDegrees - HARBOUR.arcStartDegrees - 32);
    const s = at(deg), depth = s.ts[4]! - s.ts[0]!;
    const busy = (deg > 236 && deg < 304) || (deg > 322 && deg < 382) || (deg > 158 && deg < 226);
    const offset = (busy ? 0.62 : 0.3) * depth + hash(n + 1) * (busy ? 0.3 : 0.58) * depth;
    const p = place(deg, offset), height = 6 + hash(n + 2) * 5;
    pieces.push({ kind: 'cone', x: p.x, z: p.z, y0: p.ground - 1, y1: p.ground + height, r: 2.2 + hash(n + 3) * 1.4, sides: 5, colour: hash(n + 4) < 0.5 ? C.tree : C.treeDark });
  }

  // -- The lighthouse on its rock at the harbour mouth, with a short breakwater.
  lighthouse(pieces, 95, hd + 78);

  // -- The north bridge: approach, level spans on piers, landing; parapets and lamps.
  if (r.bridgeWidth) bridge(pieces, r, sections);

  // -- Six boats moored in the channel.
  sailboat(pieces, -40, hd + 38, 0.4, C.hullWhite);
  sailboat(pieces, hw + 48, -28, 1.9, C.hullNavy);
  sailboat(pieces, -hw - 62, 46, -0.6, C.hullWhite);
  motorboat(pieces, -88, hd + 16, 2.6, C.hullRed, 7);
  motorboat(pieces, 52, -hd - 38, 0.9, C.hullWhite, 7.5);
  fishingBoat(pieces, hw + 22, 62, -1.2, C.hullBlue);
  // ... and one coaster at anchor beyond the harbour mouth, far out in the haze.
  cargoShip(pieces, -40, hd + 210, 0.35);
  return pieces;
}

function lighthouse(pieces: HarbourPiece[], x: number, z: number): void {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY;
  pieces.push({ kind: 'tower', x, z, y0: W - 1, y1: W + 1.7, r0: 9, r1: 6.4, sides: 7, cap: true, colour: C.rock });
  // Breakwater east-north-east from the rock, armoured both sides.
  const heading = 0.17, dx = Math.cos(heading), dz = Math.sin(heading), length = 46, mx = x + dx * (length / 2 + 4), mz = z + dz * (length / 2 + 4);
  pieces.push({ kind: 'box', x: mx, z: mz, y0: W - 1, y1: W + 1.5, width: length, depth: 4.6, yaw: -heading, colour: C.concrete });
  for (let i = 0; i < 6; i++) {
    const along = 8 + i * 7.5 + (hash(1500 + i) - 0.5) * 2, lateral = (i % 2 === 0 ? 1 : -1) * 3;
    pieces.push({ kind: 'tower', x: x + dx * along - dz * lateral, z: z + dz * along + dx * lateral, y0: W - 0.6, y1: W + 0.9 + hash(1510 + i) * 0.5, r0: 2.2, r1: 1.2, sides: 5, cap: true, colour: i % 3 === 0 ? C.rockLight : C.rock });
  }
  pieces.push({ kind: 'tower', x, z, y0: W + 1.7, y1: W + 2.8, r0: 3.6, r1: 3.4, sides: 10, cap: true, colour: C.concrete });
  const base = W + 2.8, band = 3, bands = 6, rBase = 2.6, rTop = 1.75;
  for (let i = 0; i < bands; i++) {
    const r0 = rBase + (rTop - rBase) * i / bands, r1 = rBase + (rTop - rBase) * (i + 1) / bands;
    pieces.push({ kind: 'tower', x, z, y0: base + i * band, y1: base + (i + 1) * band, r0, r1, sides: 10, cap: false, colour: i % 2 === 0 ? C.lighthouseWhite : C.lighthouseRed });
  }
  const top = base + bands * band;
  pieces.push({ kind: 'tower', x, z, y0: top, y1: top + 0.5, r0: 2.6, r1: 2.6, sides: 10, cap: true, colour: C.gallery });
  pieces.push({ kind: 'tower', x, z, y0: top + 0.5, y1: top + 2.7, r0: 1.45, r1: 1.45, sides: 10, cap: false, colour: C.lantern });
  pieces.push({ kind: 'cone', x, z, y0: top + 2.7, y1: top + 4.6, r: 1.95, sides: 10, colour: C.lighthouseRoof });
}

function bridge(pieces: HarbourPiece[], r: RiverScenery, sections: readonly ShoreSection[]): void {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY, half = r.bridgeWidth! / 2;
  const north = sections.reduce((best, s) => Math.abs(s.theta - 1.5 * Math.PI) < Math.abs(best.theta - 1.5 * Math.PI) ? s : best);
  const start = -r.halfDepth - 0.2, landing = -north.ts[1]!, level = 3.1, thick = 0.85;
  const rampOut = landing + 26, landY = north.ys[1]! + 0.25;
  // Gate piers just outside the guard wall: the deck starts between them, level, and comes down on the embankment.
  for (const s of [-1, 1]) {
    pieces.push({ kind: 'box', x: s * (half + 1.3), z: start - 1.3, y0: W - 1, y1: 6.6, width: 2.6, depth: 2.6, yaw: 0, colour: C.stone });
    pieces.push({ kind: 'cone', x: s * (half + 1.3), z: start - 1.3, y0: 6.6, y1: 8.6, r: 2.05, sides: 4, colour: C.roofDark });
  }
  const line: [number, number][] = [[start, level], [rampOut, level], [landing, landY]];
  for (let i = 0; i < line.length - 1; i++) {
    const [z0, y0] = line[i]!, [z1, y1] = line[i + 1]!;
    pieces.push({ kind: 'beam', from: [0, y0 - thick / 2, z0], to: [0, y1 - thick / 2, z1], width: 2 * half, height: thick, colour: C.deck, caps: true });
    for (const s of [-1, 1]) pieces.push({ kind: 'beam', from: [s * (half - 0.2), y0 + 0.5, z0], to: [s * (half - 0.2), y1 + 0.5, z1], width: 0.4, height: 1.0, colour: C.parapet, caps: true });
  }
  const first = start - 14, spans = Math.max(1, Math.round((first - rampOut) / 19));
  for (let k = 0; k <= spans; k++) {
    const z = first + (rampOut - first) * k / spans;
    pieces.push({ kind: 'box', x: 0, z, y0: W - 1, y1: level - thick, width: 2 * half + 1.4, depth: 2.4, yaw: 0, colour: C.pier });
  }
  const lamps = Math.max(2, Math.round((start - rampOut) / 20));
  for (let k = 1; k <= lamps; k++) {
    const z = start + (rampOut - start) * k / lamps, sx = (k % 2 === 0 ? -1 : 1) * (half - 0.2);
    pieces.push({ kind: 'beam', from: [sx, level + 1.0, z], to: [sx, level + 6.2, z], width: 0.18, height: 0.18, colour: C.lamp });
    pieces.push({ kind: 'box', x: sx * 0.86, z, y0: level + 6.0, y1: level + 6.35, width: 1.3, depth: 0.5, yaw: 0, colour: C.lampHead });
  }
}

/** A coaster riding at anchor off the harbour mouth, well out in the haze. */
function cargoShip(pieces: HarbourPiece[], x: number, z: number, yaw: number): void {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY, at = boatFrame(x, z, yaw), deck = W + 5.5;
  pieces.push({ kind: 'hull', x, z, yaw, length: 74, beam: 12, y0: W - 2, y1: deck, colour: C.shipHull, deckColour: C.shipDeck });
  for (let i = 0; i < 4; i++) {
    const c = at(14 - i * 11, 0, 0);
    pieces.push({ kind: 'box', x: c[0], z: c[2], y0: deck - 0.2, y1: deck + 2.6 + (i % 2) * 2.6, width: 10, depth: 9.5, yaw, colour: pick(C.containers, 2000 + i) });
  }
  const house = at(-28, 0, 0);
  pieces.push({ kind: 'box', x: house[0], z: house[2], y0: deck - 0.2, y1: deck + 11, width: 9, depth: 11, yaw, colour: C.cabin });
  const funnel = at(-33.5, 0, 0);
  pieces.push({ kind: 'box', x: funnel[0], z: funnel[2], y0: deck + 8, y1: deck + 15, width: 3.2, depth: 3.6, yaw, colour: C.lighthouseRed });
}

/** Local boat frame: bow along +x of the yaw. */
function boatFrame(x: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx: number, y: number, lz: number): Point3 => [x + c * lx + s * lz, y, z - s * lx + c * lz];
}

function sailboat(pieces: HarbourPiece[], x: number, z: number, yaw: number, hull: number): void {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY, at = boatFrame(x, z, yaw), deck = W + 0.85;
  pieces.push({ kind: 'hull', x, z, yaw, length: 9, beam: 3, y0: W - 0.5, y1: deck, colour: hull, deckColour: C.boatDeck });
  const cabin = at(-1.2, 0, 0);
  pieces.push({ kind: 'box', x: cabin[0], z: cabin[2], y0: deck - 0.1, y1: deck + 0.75, width: 3.2, depth: 1.9, yaw, colour: C.cabin });
  const mast = at(0.9, deck, 0), head = at(0.9, deck + 11, 0);
  pieces.push({ kind: 'beam', from: mast, to: head, width: 0.16, height: 0.16, colour: C.mast });
  const boomEnd = at(-3.6, deck + 1.5, 0);
  pieces.push({ kind: 'beam', from: at(0.9, deck + 1.5, 0), to: boomEnd, width: 0.12, height: 0.12, colour: C.mast });
  pieces.push({ kind: 'sail', a: at(0.85, deck + 1.7, 0), b: at(0.85, deck + 10.6, 0), c: at(-3.5, deck + 1.7, 0), colour: C.sailCloth });
  pieces.push({ kind: 'sail', a: at(0.95, deck + 9.8, 0), b: at(4.3, deck + 0.4, 0), c: at(1.1, deck + 1.2, 0), colour: C.sailCloth });
}

function motorboat(pieces: HarbourPiece[], x: number, z: number, yaw: number, hull: number, length: number): void {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY, at = boatFrame(x, z, yaw), deck = W + 0.8;
  pieces.push({ kind: 'hull', x, z, yaw, length, beam: 2.6, y0: W - 0.45, y1: deck, colour: hull, deckColour: C.cabin });
  const cabin = at(-0.6, 0, 0);
  pieces.push({ kind: 'box', x: cabin[0], z: cabin[2], y0: deck - 0.1, y1: deck + 1.0, width: 2.6, depth: 1.9, yaw, colour: C.cabin });
  const glass = at(0.6, 0, 0);
  pieces.push({ kind: 'box', x: glass[0], z: glass[2], y0: deck + 0.6, y1: deck + 1.05, width: 0.35, depth: 1.8, yaw, colour: C.glass });
  pieces.push({ kind: 'beam', from: at(-1.4, deck + 1.0, 0), to: at(-1.4, deck + 2.6, 0), width: 0.08, height: 0.08, colour: C.mast });
}

function fishingBoat(pieces: HarbourPiece[], x: number, z: number, yaw: number, hull: number): void {
  const C = HARBOUR_COLOURS, W = HARBOUR.waterY, at = boatFrame(x, z, yaw), deck = W + 1.0;
  pieces.push({ kind: 'hull', x, z, yaw, length: 10, beam: 3.4, y0: W - 0.6, y1: deck, colour: hull, deckColour: C.boatDeck });
  const house = at(1.2, 0, 0);
  pieces.push({ kind: 'box', x: house[0], z: house[2], y0: deck - 0.1, y1: deck + 2.0, width: 2.4, depth: 2.4, yaw, colour: C.cabin });
  pieces.push({ kind: 'box', x: house[0], z: house[2], y0: deck + 2.0, y1: deck + 2.25, width: 2.8, depth: 2.8, yaw, colour: C.hullRed });
  pieces.push({ kind: 'beam', from: at(-1.6, deck, 0), to: at(-1.6, deck + 6.5, 0), width: 0.18, height: 0.18, colour: C.mast });
  pieces.push({ kind: 'beam', from: at(-1.6, deck + 5.6, 0), to: at(-4.6, deck + 1.2, 0), width: 0.12, height: 0.12, colour: C.mast });
}

/** Triangles the harbour draws for this plan — what `planRenderCost` charges and the built mesh holds. */
export function harbourSceneryTriangles(r: RiverScenery): number {
  let triangles = 0;
  for (const piece of harbourPieces(r)) triangles += pieceTriangles(piece);
  return triangles;
}
