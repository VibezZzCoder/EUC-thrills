/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ultra building geometry (T4) — M39 (`docs/M39_ULTRA.md` §4, package W3).
 *
 * U0's most visible defect was "dark flat boxes": a facade is a painted box,
 * a parapet is a thinner box and a roof is a prism with knife edges, so once
 * the lighting package gives the town real shade there is nothing on a
 * building for that shade to describe. This file adds the three pieces of
 * relief that read from the chase camera — a set-back shopfront, a cornice
 * line under every parapet and shaft top, and a framed, recessed gable —
 * and nothing smaller (the upper-floor reveals are the W6 normal/ORM pages).
 *
 * **Metric relief on a unit box.** Every building part is one unit geometry
 * scaled per instance to anything from a 0.6 m cornice band to a 48 m beacon
 * shaft (`data/buildingLooks.ts`), and relief baked in unit space would
 * scale with it: a 0.3 m groove on a parapet would be 19 m on the shaft. So
 * each vertex keeps its **unit** position and carries an `ultraRelief`
 * attribute — a vec3 in metres along the part's local axes. The relief vertex
 * patch (W4) divides it by the instance matrix's column lengths before the
 * matrix multiplies it back, so the drawn point is `position × size +
 * ultraRelief` in local metres, and a 0.75 m parapet and a 48 m shaft carry
 * the same 0.08 m step. `ultraKit.relievedPositions` computes exactly that for
 * the tests. A renderer that ignores the attribute (the W0 stub material)
 * draws the unit positions: every relief face collapses to zero area and the
 * part is its ordinary self, which is the graceful failure.
 *
 * **Inward only, and why that shaped two of the three.** Every relief vector
 * points into the part, so every vertex stays inside the unit box — inside the
 * collider box, `BUILDING_CLEARANCE` and the cap's own oversail — for every
 * instance this kit composes (`ultraBuildings.test.ts` walks them).
 *
 * - **Facade (T4 shopfront, +8 triangles):** each side's ground-floor band is
 *   set back `ULTRA.relief.revealDepth` (0.25 m) along its inward normal and
 *   mitred at the corners, with a soffit on the `plain` page closing the
 *   recess under the first floor. A mitred arcade rather than corner piers:
 *   a pier needs a flush face beside every jamb, which is 56 more triangles
 *   than §4's ≤ +32 allows, and the soffit's shadow line is the read either
 *   way. Every face is axis-aligned, so the normals are exact at any scale.
 * - **Cap (cornice, 12 → 44):** the vertical edges chamfered by
 *   `capChamfer` (0.15 m) and everything below `capGrooveDrop` (0.3 m) under
 *   the top stepped in by `capGrooveDepth` (0.08 m), under a square coping
 *   band. The step's downward-facing ring is the groove's shadow line — the
 *   same dark line at 0.3 m under every roofline — and 44 is exactly the
 *   budget; a true groove (flush below it) and the chamfers do not both fit.
 * - **Gable (fascia/barge, 8 → 20):** each gable end a recessed tympanum
 *   framed by bevelled verge boards of `eaveFascia` (0.25 m) width, its foot
 *   on the eave line. (U1 also had a ridge cap and a raised sill; both were
 *   sub-pixel lit slivers and Wave 3 removed them — see `GABLE`.) A vertical eave
 *   fascia is not buildable inward-only: any point on a slope is fixed in unit
 *   space (a metric offset slides it off the slope by an amount that depends
 *   on the instance's aspect), so an eave board's top edge can never be a
 *   metric height above the eave inside the prism. The fascia depth therefore
 *   frames the gable end, where the street sees it.
 *
 * **The one outward exception: slot closing, depth pass only (A16).** Where
 * two caps stand under 2 m apart, the cap's shadow-depth footprint dilates
 * sideways by up to half the gap (`ultraSlotClosing`, `ultraSlotDepth`), so
 * a narrow alley between two blocks no longer lays a sunlit sliver across
 * the street. Nothing drawn moves: the colour pass, the colliders and the
 * geometry are exactly the inward-only forms above.
 *
 * **Normals under non-uniform scale.** three transforms an instanced normal
 * by the inverse of the instance scale, which is exact for any face that lies
 * in unit space (every unrelieved face here) and approximate for a face whose
 * orientation the relief sets (a chamfer, a ring face). Those normals are
 * computed at a reference size per part (`REFERENCE`), so a square shaft's
 * chamfers are exact and a long parapet's lean a little toward its long face.
 *
 * Pure geometry, deterministic, headless-importable (invariant 13).
 */
import * as THREE from 'three';
import { BUILDING_FACADE } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import { FACADE_PAGES, type FacadePageId } from '../facadeAtlas.ts';
import type { Vec3 } from './ultraFurniture.ts';
import { patchUltraDepthVertex, ultraProgramKey } from './ultraMaterials.ts';
import { ULTRA_STATIC_LAYER } from './ultraRecipe.ts';

/** One corner: a unit position, a metric relief along the local axes, and (facades only) a UV. */
interface Corner {
  readonly p: Vec3;
  readonly r: Vec3;
  readonly uv: readonly [number, number];
}

const ZERO: Vec3 = [0, 0, 0];
const NO_UV: readonly [number, number] = [0, 0];

function corner(p: Vec3, r: Vec3 = ZERO, uv: readonly [number, number] = NO_UV): Corner {
  return { p, r, uv };
}

/**
 * The size each part's relief-oriented normals are exact at: a square shaft
 * for the cap (every chamfer is 45° on a square), a typical block for the
 * facade (whose faces are all axis-aligned anyway), a typical house roof.
 */
const REFERENCE = Object.freeze({
  facade: [12, 18, 12] as Vec3,
  cap: [5, 10, 5] as Vec3,
  gable: [8, 3.4, 10] as Vec3,
});

interface ReliefBuilder {
  tri(a: Corner, b: Corner, c: Corner): void;
  quad(a: Corner, b: Corner, c: Corner, d: Corner): void;
  /** A convex polygon, counter-clockwise from outside, as a fan. */
  fan(points: readonly Corner[]): void;
  readonly triangles: number;
  geometry(withUv: boolean): THREE.BufferGeometry;
}

/**
 * Accumulates relief triangles and writes position (unit), `ultraRelief`
 * (metres), normal (exact at `reference`, see the file comment), a white
 * `color`, and a `uv` when asked. Un-indexed, flat-shaded, like every part.
 */
function reliefBuilder(reference: Vec3): ReliefBuilder {
  const corners: Corner[] = [];
  const builder: ReliefBuilder = {
    tri(a, b, c) { corners.push(a, b, c); },
    quad(a, b, c, d) { corners.push(a, b, c, a, c, d); },
    fan(points) {
      for (let i = 1; i < points.length - 1; i += 1) corners.push(points[0], points[i], points[i + 1]);
    },
    get triangles() { return corners.length / 3; },
    geometry(withUv) {
      const count = corners.length;
      const positions = new Float32Array(count * 3);
      const relief = new Float32Array(count * 3);
      const normals = new Float32Array(count * 3);
      const uvs = new Float32Array(count * 2);
      const metric = (c: Corner): Vec3 => [
        c.p[0] * reference[0] + c.r[0],
        c.p[1] * reference[1] + c.r[1],
        c.p[2] * reference[2] + c.r[2],
      ];
      for (let face = 0; face < count / 3; face += 1) {
        const [a, b, c] = [corners[face * 3], corners[face * 3 + 1], corners[face * 3 + 2]];
        const ma = metric(a); const mb = metric(b); const mc = metric(c);
        const ux = mb[0] - ma[0]; const uy = mb[1] - ma[1]; const uz = mb[2] - ma[2];
        const vx = mc[0] - ma[0]; const vy = mc[1] - ma[1]; const vz = mc[2] - ma[2];
        // The metric normal, carried back into unit space (× the scale), so that
        // three's inverse-scale normal transform returns it at the reference size.
        let nx = (uy * vz - uz * vy) * reference[0];
        let ny = (uz * vx - ux * vz) * reference[1];
        let nz = (ux * vy - uy * vx) * reference[2];
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        for (let k = 0; k < 3; k += 1) {
          const c0 = corners[face * 3 + k];
          const i = face * 3 + k;
          positions.set(c0.p, i * 3);
          relief.set(c0.r, i * 3);
          normals[i * 3] = nx; normals[i * 3 + 1] = ny; normals[i * 3 + 2] = nz;
          uvs[i * 2] = c0.uv[0]; uvs[i * 2 + 1] = c0.uv[1];
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
      if (withUv) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setAttribute('ultraRelief', new THREE.BufferAttribute(relief, 3));
      return geometry;
    },
  };
  return builder;
}

// ---------------------------------------------------------------------------
// Facade
// ---------------------------------------------------------------------------

/** Which atlas pages a facade class wears on its ground floor and its glazing. */
interface FacadePages {
  readonly ground: FacadePageId;
  readonly glass: FacadePageId;
}

const FACADES: Readonly<Record<'buildingBody' | 'buildingLow' | 'buildingTall', { floors: number; pages: FacadePages }>> = Object.freeze({
  buildingBody: { floors: BUILDING_FACADE.lowFloors, pages: { ground: 'ground', glass: 'glass' } },
  buildingLow: { floors: BUILDING_FACADE.lowRiseFloors, pages: { ground: 'groundLow', glass: 'glassLow' } },
  buildingTall: { floors: BUILDING_FACADE.highFloors, pages: { ground: 'groundTall', glass: 'glassTall' } },
});

/**
 * A facade body: `render/props.ts:facadeBox`'s banded unit box on the same
 * pages — every upper storey, the roof and the page folding unchanged — with
 * each side's ground-floor band set back `revealDepth` and mitred at the
 * corners, a soffit on the `plain` page closing the recess, and the
 * underside inset to meet it. Low 36 / Body 68 / Tall 180 triangles.
 */
export function ultraFacadeBox(part: 'buildingBody' | 'buildingLow' | 'buildingTall'): THREE.BufferGeometry {
  const { floors, pages } = FACADES[part] ?? FACADES.buildingBody;
  const depth = ULTRA.relief.revealDepth;
  const builder = reliefBuilder(REFERENCE.facade);
  const half = 0.5;
  // Clockwise seen from above, exactly as `facadeBox` walks it, so the outward
  // normal falls out of (b − a) × up.
  const perimeter: [number, number][] = [
    [-half, -half], [-half, half], [half, half], [half, -half],
  ];
  const bandHeight = 1 / floors;
  const spandrel = 1 - BUILDING_FACADE.glazing;
  const plain = FACADE_PAGES.plain;

  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = perimeter[side];
    const [bx, bz] = perimeter[(side + 1) % 4];
    const nx = -(bz - az);
    const nz = bx - ax;
    // Unit edge direction a → b. The recess is pulled in along the normal and,
    // at each end, along the edge towards the middle, so neighbouring sides'
    // recesses meet in a mitre at the inset corner.
    const ex = bx - ax;
    const ez = bz - az;
    const reliefA: Vec3 = [(-nx + ex) * depth, 0, (-nz + ez) * depth];
    const reliefB: Vec3 = [(-nx - ex) * depth, 0, (-nz - ez) * depth];

    const quad = (y0: number, y1: number, page: FacadePageId, recessed: boolean): void => {
      const rect = FACADE_PAGES[page];
      const rA = recessed ? reliefA : ZERO;
      const rB = recessed ? reliefB : ZERO;
      const a0 = corner([ax, y0, az], rA, [rect.u0, rect.v0]);
      const b0 = corner([bx, y0, bz], rB, [rect.u1, rect.v0]);
      const b1 = corner([bx, y1, bz], rB, [rect.u1, rect.v1]);
      const a1 = corner([ax, y1, az], rA, [rect.u0, rect.v1]);
      builder.tri(a0, b0, b1);
      builder.tri(a0, b1, a1);
    };

    for (let floor = 0; floor < floors; floor += 1) {
      const base = floor * bandHeight;
      const glazed = floor > 0 || !BUILDING_FACADE.solidGroundFloor;
      const recessed = floor === 0;
      if (!glazed) {
        quad(base, base + bandHeight, pages.ground, recessed);
      } else {
        const split = base + bandHeight * spandrel;
        quad(base, split, 'spandrel', recessed);
        quad(split, base + bandHeight, pages.glass, recessed);
      }
    }

    // The soffit: the recess's ceiling, from the first floor's flush bottom
    // edge back to the set-back top of the shopfront. It faces down.
    const outerA = corner([ax, bandHeight, az], ZERO, [plain.u0, plain.v1]);
    const outerB = corner([bx, bandHeight, bz], ZERO, [plain.u1, plain.v1]);
    const innerB = corner([bx, bandHeight, bz], reliefB, [plain.u1, plain.v0]);
    const innerA = corner([ax, bandHeight, az], reliefA, [plain.u0, plain.v0]);
    builder.quad(outerA, innerA, innerB, outerB);
  }

  // Roof, as `facadeBox` writes it; the underside inset to the recess's mitred
  // footprint so the shell closes.
  for (const [y, ny] of [[1, 1], [0, -1]] as const) {
    const order: [number, number][] = ny > 0
      ? [[-half, -half], [-half, half], [half, half], [half, -half]]
      : [[-half, -half], [half, -half], [half, half], [-half, half]];
    const points = order.map(([x, z]) => corner(
      [x, y, z],
      ny > 0 ? ZERO : [-Math.sign(x) * depth, 0, -Math.sign(z) * depth],
      [x + half > 0.5 ? plain.u1 : plain.u0, z + half > 0.5 ? plain.v1 : plain.v0],
    ));
    builder.tri(points[0], points[1], points[2]);
    builder.tri(points[0], points[2], points[3]);
  }
  return builder.geometry(true);
}

// ---------------------------------------------------------------------------
// Cap
// ---------------------------------------------------------------------------

/** The four unit-box corners in plan, counter-clockwise seen from above (the lathe convention). */
const CAP_CORNERS: readonly [number, number][] = [[0.5, -0.5], [-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];

/**
 * The parapet/cap — parapets 0.6–0.9 m, landmark shafts to 48 m, water-tank
 * drums, one bucket (44 triangles). An octagonal body (the square stepped in
 * `capGrooveDepth` and its vertical edges chamfered `capChamfer`) under a
 * square coping band `capGrooveDrop` deep; the step between them faces down
 * and draws the cornice's shadow line. The smallest cap any look composes is
 * 0.6 m tall and 0.8 m wide, which clears the 0.3 m drop and the 0.46 m the
 * chamfered octagon needs (`ultraBuildings.test.ts`).
 */
export function ultraBuildingCap(): THREE.BufferGeometry {
  const relief = ULTRA.relief;
  const inset = relief.capGrooveDepth;
  const chamfer = relief.capChamfer;
  const drop = relief.capGrooveDrop;
  const builder = reliefBuilder(REFERENCE.cap);

  /** The octagon at unit height `y` with vertical relief `ry`, two vertices a corner, in order. */
  const octagon = (y: number, ry: number): Corner[] => {
    const out: Corner[] = [];
    for (const [qx, qz] of CAP_CORNERS) {
      const sx = Math.sign(qx);
      const sz = Math.sign(qz);
      // The vertex on the x-facing side and the one on the z-facing side.
      const onX = corner([qx, y, qz], [-sx * inset, ry, -sz * (inset + chamfer)]);
      const onZ = corner([qx, y, qz], [-sx * (inset + chamfer), ry, -sz * inset]);
      // Counter-clockwise from above, the walk reaches (+,−) and (−,+) along
      // an x-facing side and (−,−) and (+,+) along a z-facing one.
      if (sx * sz < 0) out.push(onX, onZ);
      else out.push(onZ, onX);
    }
    return out;
  };
  const square = (y: number, ry: number): Corner[] => CAP_CORNERS.map(([qx, qz]) => corner([qx, y, qz], [0, ry, 0]));

  const foot = octagon(0, 0);
  const waist = octagon(1, -drop);
  const coping = square(1, -drop);
  const top = square(1, 0);

  builder.fan([...foot].reverse());
  for (let i = 0; i < 8; i += 1) {
    const j = (i + 1) % 8;
    builder.quad(foot[i], foot[j], waist[j], waist[i]);
  }
  // The step, from the octagon out to the coping's square: a trapezoid along
  // each side and a triangle under each corner. Inner to outer, it faces down.
  for (let k = 0; k < 4; k += 1) {
    const next = (k + 1) % 4;
    builder.tri(waist[k * 2], waist[k * 2 + 1], coping[k]);
    builder.quad(waist[k * 2 + 1], waist[next * 2], coping[next], coping[k]);
  }
  for (let k = 0; k < 4; k += 1) {
    const next = (k + 1) % 4;
    builder.quad(coping[k], coping[next], top[next], top[k]);
  }
  builder.fan(top);
  return builder.geometry(false);
}

// ---------------------------------------------------------------------------
// Gable
// ---------------------------------------------------------------------------

/**
 * The roof prism's detail, metres. The tympanum's corners stand `frame` in
 * from the eave corners and down from the apex, and `recess` behind the gable
 * plane; its foot is on the eave line (`sill` 0).
 *
 * **Wave 3 (R-F, gauntlet round 1 item 10).** Two faces of the U1 gable were
 * slivers of lit geometry, and both are gone:
 *
 * - **The sill.** The tympanum's foot stood `sill` 0.06 m up and 0.12 m back,
 *   so the sill was a 0.13 m strip facing 63° up. From the chase camera an
 *   eave is above the eye but under 27° of elevation, which is exactly where
 *   that strip is front-facing: a sub-pixel, sun-facing line along every
 *   gable's foot while the gable itself stood in shade — the dotted fascia
 *   line the near map's PCF broke into dots (`?ultrakit=-lighting` drew it
 *   continuous, `-buildings` removed it). With the foot on the eave line the
 *   sill is flat and faces up, back-facing to every eye below the eave, and
 *   the underside under it is the ordinary soffit.
 * - **The ridge cap.** Inward-only, a ridge "cap" could only be a 0.11 m fin
 *   standing out of slopes lowered 0.19 m beside it (its feet had to clear
 *   the steeple spire's 4.2 pitch), so the ridge drew as two parallel lines —
 *   the fin's lit face and its foot — and at the steeple's 107 m both are a
 *   pixel. The slopes run to the prism's own ridge again.
 *
 * What stays is the part that reads: the verge boards, `frame` wide and
 * bevelled `recess` deep round a recessed tympanum, ≥ 0.13 m on every face
 * at any composed pitch (≥ 3 px at 30 m, §4's pixel rule).
 */
const GABLE = Object.freeze({
  frame: ULTRA.relief.eaveFascia,
  sill: 0,
  recess: 0.12,
});

/**
 * The pitched roof (20 triangles): the prism's two slopes and soffit, and
 * each gable end a tympanum set back `recess` inside a frame of bevelled
 * verge boards — the fascia's depth running up the verges where the street
 * sees it (see the file comment for why not along the eave). Reads the same
 * as a house roof, a shed bay, a crossed spire or a tank cap: the prism's
 * outline is untouched.
 */
export function ultraRoofGable(): THREE.BufferGeometry {
  const g = GABLE;
  const builder = reliefBuilder(REFERENCE.gable);
  const h = 0.5;

  /** The ring of points one gable end needs, at `z` (±0.5), with z-relief sign `s` (inward is −s). */
  const end = (z: number) => {
    const s = Math.sign(z);
    return {
      eaveL: corner([-h, 0, z]),
      eaveR: corner([h, 0, z]),
      apex: corner([0, 1, z]),
      innerL: corner([-h, 0, z], [g.frame, g.sill, -s * g.recess]),
      innerR: corner([h, 0, z], [-g.frame, g.sill, -s * g.recess]),
      innerApex: corner([0, 1, z], [0, -g.frame, -s * g.recess]),
    };
  };
  const front = end(h);
  const back = end(-h);

  // The slopes, eave to ridge; each quad runs back → front along the ridge so
  // its winding faces out.
  builder.quad(front.eaveR, back.eaveR, back.apex, front.apex);
  builder.quad(front.apex, back.apex, back.eaveL, front.eaveL);
  // The underside, seen only under an eave.
  builder.quad(front.eaveL, back.eaveL, back.eaveR, front.eaveR);

  /** One gable end: frame and tympanum, counter-clockwise from outside when `facing` is +1. */
  const gableEnd = (e: ReturnType<typeof end>, facing: number): void => {
    const faces: Corner[][] = [
      [e.eaveL, e.eaveR, e.innerR, e.innerL], // sill: flat, on the eave line
      [e.eaveR, e.apex, e.innerApex, e.innerR], // right verge
      [e.apex, e.eaveL, e.innerL, e.innerApex], // left verge
      [e.innerL, e.innerR, e.innerApex], // tympanum
    ];
    for (const face of faces) {
      const ordered = facing > 0 ? face : [...face].reverse();
      if (ordered.length === 3) builder.tri(ordered[0], ordered[1], ordered[2]);
      else builder.quad(ordered[0], ordered[1], ordered[2], ordered[3]);
    }
  };
  gableEnd(front, 1);
  gableEnd(back, -1);
  return builder.geometry(false);
}

// ---------------------------------------------------------------------------
// Slot closing (A16): the depth pass only
// ---------------------------------------------------------------------------

/**
 * Depth-only slot closing — gauntlet round 2, item 3 (`docs/M39_ULTRA.md` §U2
 * and amendment A16).
 *
 * **The defect.** On the commercial street two neighbouring blocks stand with
 * their facades 1.35 m apart (parapets 0.90 m). The sun runs within 12° of
 * that alley's axis, so a ray that clears the lower parapet can travel down
 * the alley and out of its street end, and the near map lays it across the
 * road as a thin sunlit band — read by all five critics in both rounds as a
 * light leak, a painted line or a low obstacle. It is real sun through a real
 * slot; the cap's chamfer and groove widen it by about 18 %.
 *
 * **Why a lid at the parapet closes it.** A ray can reach the street end only
 * from above the roofline: its sideways drift across the alley (0.15 m per
 * metre of drop at this sun) crosses a 1.35 m alley within 9 m of drop, far
 * less than the ~17 m it would need to travel along the alley from its back
 * end. So the shadow pass pushes each cap's side toward a neighbouring cap
 * by half the gap between them, and the two footprints meet over the alley.
 *
 * **What it may touch (A16).** Only the cap's shadow-depth footprint —
 * the near map's `customDepthMaterial` (`ultraSlotDepth`) and the static far
 * map's one extra draw (`ultraSlotFarDepth`, which says why the far map needs
 * it too) — sideways, by at most half the gap to the neighbour. The colour
 * pass, every visible vertex, the colliders, the colour triangles and the
 * buckets are unchanged. The data is one normalised byte per side per cap
 * instance (4 B an instance), computed here from the plan's own cap matrices.
 *
 * **Which sides.** A side of cap A is pushed toward cap B when:
 *
 * - their axes agree within 1° (a street's frontage shares one yaw; a
 *   skewed neighbour leaves a wedge, not a slot, and is left alone);
 * - B's facing side stands more than 0 and under `maxGap` from A's;
 * - B runs along at least `minRun` of the shorter facing side (a slot, not
 *   two corners).
 *
 * Both caps of a pair dilate, whatever their heights. A first cut let only
 * the lower cap grow (so no lip would hang over a lower roof), and the node
 * trace of the commercial view kept 278 of 1,248 sunlit samples: a tail of
 * the band made of rays that clear the lower parapet and rise beside the
 * taller block, missing its cornice by 5 cm. The taller cap's lip is what
 * catches them (0 of 8,280 samples lit). Its one cost is a deeper band under
 * that lip on the taller block's step face, and only when the sun faces that
 * face: on every shipped town the step faces either face away from the sun
 * or meet it at N·L ≈ 0.12, where the facade is already fading to form shade.
 *
 * With several neighbours on one side, the smallest half-gap wins, so no
 * dilation ever reaches past any neighbour's midline.
 */
export const SLOT_CLOSING = Object.freeze({
  /** Facing cap sides closer than this, metres (A16: "under 2 m apart"). */
  maxGap: 2,
  /** The neighbour must run along at least this share of the shorter facing side. */
  minRun: 0.5,
  /** Axes agree within 1°. */
  alignment: Math.cos(Math.PI / 180),
});

/**
 * The per-instance attribute: four normalised bytes, the metres (0–1) each
 * local side is pushed out in the depth pass — −x, +x, −z, +z. Half of any
 * gap under `maxGap` is under 1 m, so a byte step is 1/255 m (3.9 mm), and
 * every value is rounded down so the push never passes the midline.
 */
export const ULTRA_SLOT_ATTRIBUTE = 'ultraSlot';

/** The side order of `ultraSlot`: −x, +x, −z, +z. */
const SLOT_SIDES: readonly { axis: 'x' | 'z'; sign: -1 | 1 }[] = [
  { axis: 'x', sign: -1 }, { axis: 'x', sign: 1 }, { axis: 'z', sign: -1 }, { axis: 'z', sign: 1 },
];

interface PlanBox {
  readonly cx: number;
  readonly cz: number;
  readonly bottom: number;
  readonly top: number;
  /** Unit plan directions of the local x and z axes. */
  readonly ux: readonly [number, number];
  readonly uz: readonly [number, number];
  readonly hx: number;
  readonly hz: number;
}

/**
 * An instance's plan box from its matrix (column-major, `Matrix4.elements`
 * order), or null when the matrix is not a yawed, upright box — a cap is
 * always one, and anything else is simply never dilated.
 */
function planBox(e: ArrayLike<number>, o: number): PlanBox | null {
  const sx = Math.hypot(e[o], e[o + 1], e[o + 2]);
  const sy = Math.hypot(e[o + 4], e[o + 5], e[o + 6]);
  const sz = Math.hypot(e[o + 8], e[o + 9], e[o + 10]);
  if (!(sx > 1e-6 && sy > 1e-6 && sz > 1e-6)) return null;
  const tilt = 1e-4;
  if (Math.abs(e[o + 1]) > tilt * sx || Math.abs(e[o + 9]) > tilt * sz
    || Math.abs(e[o + 4]) > tilt * sy || Math.abs(e[o + 6]) > tilt * sy || e[o + 5] <= 0) return null;
  return {
    cx: e[o + 12],
    cz: e[o + 14],
    bottom: e[o + 13],
    top: e[o + 13] + sy,
    ux: [e[o] / sx, e[o + 2] / sx],
    uz: [e[o + 8] / sz, e[o + 10] / sz],
    hx: sx / 2,
    hz: sz / 2,
  };
}

/** A box's half extent along a plan direction. */
function halfAlong(box: PlanBox, dx: number, dz: number): number {
  return Math.abs(dx * box.ux[0] + dz * box.ux[1]) * box.hx + Math.abs(dx * box.uz[0] + dz * box.uz[1]) * box.hz;
}

/**
 * The slot-closing bytes for the cap bucket: `count` instances of 16 matrix
 * elements each (the bucket's own world matrices), four bytes an instance in
 * `ULTRA_SLOT_ATTRIBUTE` order. Null when no cap has a neighbour to close
 * against, so a world without slots carries no attribute at all.
 */
export function ultraSlotClosing(matrices: ArrayLike<number>, count: number): Uint8Array | null {
  const boxes: (PlanBox | null)[] = [];
  let reach = 0;
  for (let i = 0; i < count; i += 1) {
    const box = planBox(matrices, i * 16);
    boxes.push(box);
    if (box !== null) reach = Math.max(reach, Math.hypot(box.hx, box.hz));
  }
  const out = new Uint8Array(count * 4);
  let any = false;
  const { maxGap, minRun, alignment } = SLOT_CLOSING;
  for (let i = 0; i < count; i += 1) {
    const a = boxes[i];
    if (a === null) continue;
    for (let side = 0; side < 4; side += 1) {
      const { axis, sign } = SLOT_SIDES[side];
      const [nx, nz] = axis === 'x' ? a.ux : a.uz;
      const n: [number, number] = [nx * sign, nz * sign];
      const t = axis === 'x' ? a.uz : a.ux;
      const hn = axis === 'x' ? a.hx : a.hz;
      const ht = axis === 'x' ? a.hz : a.hx;
      let best = Infinity;
      for (let j = 0; j < count; j += 1) {
        const b = boxes[j];
        if (j === i || b === null) continue;
        const dx = b.cx - a.cx;
        const dz = b.cz - a.cz;
        if (Math.hypot(dx, dz) > 2 * reach + maxGap) continue;
        const aligned = Math.max(
          Math.abs(n[0] * b.ux[0] + n[1] * b.ux[1]),
          Math.abs(n[0] * b.uz[0] + n[1] * b.uz[1]),
        );
        if (aligned < alignment) continue;
        const gap = (dx * n[0] + dz * n[1]) - halfAlong(b, n[0], n[1]) - hn;
        if (!(gap > 0 && gap < maxGap)) continue;
        const along = dx * t[0] + dz * t[1];
        const bt = halfAlong(b, t[0], t[1]);
        const run = Math.min(ht, along + bt) - Math.max(-ht, along - bt);
        if (run < minRun * 2 * Math.min(ht, bt)) continue;
        best = Math.min(best, gap / 2);
      }
      if (best === Infinity) continue;
      const value = Math.floor(best * 255);
      if (value <= 0) continue;
      out[i * 4 + side] = value;
      any = true;
    }
  }
  return any ? out : null;
}

/** Depth vertex declarations, after `#include <common>`. */
const SLOT_DECLARATIONS = /* glsl */ `
#ifdef ULTRA_SLOT
	attribute vec4 ultraSlot;
#endif
`;

/**
 * After `#include <begin_vertex>`: each unit side of the cap (every corner
 * sits on x = ±0.5 and z = ±0.5) moves out by its own metres, divided by the
 * instance scale like the relief, so the push is metric at any cap size.
 */
const SLOT_VERTEX = /* glsl */ `
#ifdef ULTRA_SLOT
	vec3 ultraSlotScale = ultraLocalScale();
	transformed.x += ( position.x > 0.0 ? ultraSlot.y : - ultraSlot.x ) / ultraSlotScale.x;
	transformed.z += ( position.z > 0.0 ? ultraSlot.w : - ultraSlot.z ) / ultraSlotScale.z;
#endif
`;

/** Insert the slot patch into a relief-patched depth vertex shader (which declares `ultraLocalScale`). */
export function patchUltraSlotVertex(source: string): string {
  const common = '#include <common>';
  const begin = '#include <begin_vertex>';
  if (source.split(common).length !== 2 || source.split(begin).length !== 2) {
    throw new Error('patchUltraSlotVertex: the depth vertex shader must carry one common and one begin_vertex include');
  }
  if (!source.includes('vec3 ultraLocalScale()')) {
    throw new Error('patchUltraSlotVertex: the relief depth patch must be applied first (ultraLocalScale)');
  }
  return source.replace(common, `${common}\n${SLOT_DECLARATIONS}`).replace(begin, `${begin}\n${SLOT_VERTEX}`);
}

/** Bumped whenever the slot patch's text changes, so a stale program is never reused. */
const SLOT_PATCH_VERSION = 1;

/**
 * Turn a relief depth material (`ultraMaterials.ultraReliefDepthMaterial`,
 * made for this purpose alone) into the cap's slot-closing depth material:
 * the same relief, plus `ULTRA_SLOT` and the slot patch after it, under its
 * own program key. Only a mesh whose geometry carries `ULTRA_SLOT_ATTRIBUTE`
 * may wear it.
 */
export function ultraSlotDepth(relief: THREE.MeshDepthMaterial): THREE.MeshDepthMaterial {
  const reliefCompile = relief.onBeforeCompile;
  const key = `${relief.customProgramCacheKey()}-slot-v${SLOT_PATCH_VERSION}`;
  relief.defines = { ...(relief.defines ?? {}), ULTRA_SLOT: '' };
  relief.userData.ultraFamily = 'slot-depth';
  relief.onBeforeCompile = (shader, renderer): void => {
    reliefCompile.call(relief, shader, renderer);
    shader.vertexShader = patchUltraSlotVertex(shader.vertexShader);
  };
  relief.customProgramCacheKey = (): string => key;
  return relief;
}

/**
 * **The far map's half of A16.** The near map alone is not enough. The
 * static-shade lift (A7/A14, `ultraGroundDetail.ultraShadeLiftGlsl`) lifts a
 * shaded road pixel only where the static far map (`ultraFarShadow.ts`) also
 * reads it as shaded — near-only shade is the rider's own, which keeps its
 * darkness. The far map draws every static caster through one depth-only
 * override material with no relief, so it still saw the slot open: with the
 * near map closed, the band's near end turned from a sunlit sliver into an
 * unlifted dark smudge (luma 39–57 against 75, locked capture `rf4/cap-a`).
 *
 * So the slot cap bucket also casts its dilated footprint into the far map:
 * during that one activation-time render (a camera that sees only
 * `ULTRA_STATIC_LAYER`, under an override material), the cap's
 * `onBeforeRender` draws the bucket once more with this material — back faces
 * only, depth only, the slot push and no relief, the far map's own
 * conventions — before three draws it with the override. The undilated draw
 * is nested inside the dilated one, so the depth test keeps it wherever it
 * was, and the lips are all that is added: one activation-only draw call,
 * 44 triangles a cap. Every other render is untouched.
 */
export function ultraSlotFarDepth(): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ side: THREE.BackSide });
  material.colorWrite = false;
  material.defines = { ULTRA_SLOT: '' };
  material.userData.ultraFamily = 'slot-far-depth';
  material.onBeforeCompile = (shader): void => {
    shader.vertexShader = patchUltraSlotVertex(patchUltraDepthVertex(shader.vertexShader));
  };
  const key = `${ultraProgramKey('relief-depth')}-slot-far-v${SLOT_PATCH_VERSION}`;
  material.customProgramCacheKey = (): string => key;
  return material;
}

/**
 * Whether a render is the static far map's (§3.4): a camera that sees the
 * static layer and nothing else, with a scene override material in force.
 */
export function isUltraFarStaticRender(scene: THREE.Scene, camera: THREE.Camera, material: THREE.Material): boolean {
  return camera.layers.mask === 1 << ULTRA_STATIC_LAYER
    && scene.overrideMaterial !== null
    && scene.overrideMaterial === material;
}

/**
 * Hang the far map's slot draw on the slot cap bucket (see `ultraSlotFarDepth`).
 * The mesh's own `onBeforeRender` is otherwise three's no-op; it is replaced
 * only on a bucket that carries `ULTRA_SLOT_ATTRIBUTE`.
 */
export function installUltraSlotFarCaster(mesh: THREE.InstancedMesh, far: THREE.MeshDepthMaterial): void {
  if (mesh.geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE) === undefined) {
    throw new Error('installUltraSlotFarCaster: the mesh carries no slot attribute');
  }
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group): void => {
    if (!isUltraFarStaticRender(scene, camera, material)) return;
    // three computes these for the override draw after this hook returns; the
    // extra draw needs them now, for the far camera.
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);
    // three passes the render item's geometry group here — null for a
    // single-material mesh, which `renderBufferDirect` expects (it tests
    // `!== null`) — whatever the two declared types say.
    renderer.renderBufferDirect(camera, scene, geometry, far, mesh, (group ?? null) as unknown as THREE.GeometryGroup);
  };
}

/**
 * A cap's corners as the slot depth pass draws them, metres in its own frame:
 * `relievedPositions` plus each side's push. The CPU twin of `SLOT_VERTEX`,
 * for the tests.
 */
export function slotDilatedPositions(
  relieved: ArrayLike<number>,
  unit: ArrayLike<number>,
  slot: readonly [number, number, number, number],
): Float64Array {
  const out = Float64Array.from(relieved);
  for (let i = 0; i < out.length / 3; i += 1) {
    out[i * 3] += unit[i * 3] > 0 ? slot[1] : -slot[0];
    out[i * 3 + 2] += unit[i * 3 + 2] > 0 ? slot[3] : -slot[2];
  }
  return out;
}
