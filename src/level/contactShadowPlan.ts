/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { PropKind } from '../data/props.ts';
import { fieldHeightAt, planColliders, planSolids } from './buildPlan.ts';
import type { BoxCollider, LevelPlan } from './plan.ts';

/**
 * Contact shadows — where a world's soft blobs go when there is no shadow map
 * (the visual pass of 2026-10-22).
 *
 * The Low tier switches the sun's cascade off (`Renderer.setQuality`), which
 * is the right trade on a phone and leaves every tree, lamp, bench and rider
 * standing on the ground without touching it. A blob is the cheapest honest
 * answer: a soft dark ellipse (or rounded rectangle) lying on the ground
 * under the thing, darkest at its foot. It is ambient occlusion more than a
 * sun shadow — it does not point away from the sun — which is why it can be
 * placed once per world from the plan and never moves with the light.
 *
 * **This file is presentation data with no renderer in it**, in the
 * `level/quayScenery.ts` pattern: the blob list is a pure function of the
 * immutable plan, so `render/contactShadows.ts` draws exactly it and
 * `level/renderBudget.ts:contactShadowRenderCost` prices exactly it. It is
 * not part of admission and changes nothing a seed generates or a rider
 * touches; no simulation state reads it.
 *
 * Nothing here may import three.js (invariant 1).
 */

/** One blob's shape and where it lies. Half extents are along the blob's own axes. */
export interface ContactBlob {
  readonly x: number;
  readonly z: number;
  /** Three's rotation about +Y: local (x, z) lands at (x cos + z sin, −x sin + z cos). */
  readonly rotationY: number;
  readonly halfX: number;
  readonly halfZ: number;
  /** Peak darkness (alpha), 0..1. */
  readonly strength: number;
  /**
   * The flat share of each half extent, 0..1: 0 is an ellipse, toward 1 a
   * rectangle with soft edges (a bench, a fence bay, a stall).
   */
  readonly innerX: number;
  readonly innerZ: number;
  /**
   * Where the ground is: `null` means "lies on the heightfield", sampled per
   * vertex so the blob follows a slope; a number is a flat height for a prop
   * stood on something above the field (a planter, a plinth).
   */
  readonly flatY: number | null;
  /** Vertices per side of the blob's grid: 2 is one quad. */
  readonly grid: 2 | 3 | 4;
}

interface BlobShape {
  readonly halfX: number;
  readonly halfZ: number;
  readonly strength: number;
  readonly innerX?: number;
  readonly innerZ?: number;
  /** Offset of the blob's centre in the prop's own frame, metres. */
  readonly offsetX?: number;
  readonly offsetZ?: number;
}

/**
 * The look, in one table. Sizes are metres at `scale: 1`, read against
 * `data/props.ts` (a broadleaf crown is 2.45 m, a conifer's widest tier 2.2 m,
 * a bench 1.85 × 0.46 m, a fence bay 2.4 m along local Z).
 *
 * Strengths are alpha over the lit ground, so 0.5 leaves the ground at half
 * its sunlit value across a blob's flat core — a little darker than the 0.58
 * a cast shadow keeps under the shade fill (`render/shadeFill.ts`) — and fades to nothing
 * at its edge, because a blob has no edge to earn the full value. The core
 * is mostly under the thing itself, so what reads is the ring around it.
 */
export const CONTACT_SHADOW = Object.freeze({
  /** Above the heightfield (Quay paving lies 3 cm up), plus a polygon offset in the material. */
  lift: 0.04,
  /** Blobs at most this far above the field still lie on it; above, the prop stands on something. */
  onFieldTolerance: 0.08,
  /** A grid of 3 past this half extent, 4 past the next: a broad blob follows the slope it lies on. */
  grid3Above: 0.7,
  grid4Above: 1.6,
  /** The shade the blobs darken toward (sRGB hex, like every colour here): a cool near-black. */
  tint: 0x0b1018,
  props: Object.freeze({
    // A canopy pool and a darker foot at the trunk, so a street tree reads as
    // standing in its own shade and not merely beside it.
    broadleafTree: [
      { halfX: 2.2, halfZ: 2.2, strength: 0.42 },
      { halfX: 0.62, halfZ: 0.62, strength: 0.48 },
    ],
    treeCanopy: [
      { halfX: 2.2, halfZ: 2.2, strength: 0.42 },
      { halfX: 0.62, halfZ: 0.62, strength: 0.48 },
    ],
    conifer: [{ halfX: 2.1, halfZ: 2.1, strength: 0.5 }],
    shrub: [{ halfX: 1.3, halfZ: 1.1, strength: 0.42 }],
    lampPost: [{ halfX: 0.42, halfZ: 0.42, strength: 0.5 }],
    bench: [{ halfX: 1.15, halfZ: 0.6, strength: 0.5, innerX: 0.6, innerZ: 0.3 }],
    litterBin: [{ halfX: 0.5, halfZ: 0.5, strength: 0.5 }],
    signpost: [{ halfX: 0.32, halfZ: 0.32, strength: 0.42 }],
    fenceBay: [{ halfX: 0.25, halfZ: 1.3, strength: 0.32, innerZ: 0.85 }],
    tyreStack: [{ halfX: 0.68, halfZ: 0.68, strength: 0.5 }],
  } satisfies Partial<Record<PropKind, readonly BlobShape[]>>),
  /** A market stall counter on the Quay: its plan rectangle plus this skirt. */
  stall: Object.freeze({ skirt: 0.3, strength: 0.42, inner: 0.72 }),
  /**
   * The skirts (second look pass, 2026-10-22): a collider block — a plaza
   * wall, a ledge, a planter, a barrier, a rooftop unit — and a building lay
   * a band of shade round their foot, `reach` metres wide, drawn only outside
   * the footprint. A block shorter than `minHeight` (a kerb, a lip) lays none.
   */
  block: Object.freeze({ reach: 0.45, strength: 0.4, minHeight: 0.3 }),
  building: Object.freeze({ reach: 0.8, strength: 0.3 }),
  /**
   * How far a skirt may leave the heightfield between two of its vertices
   * before its strip is split, and the step it is sampled at. On a flat plaza
   * a side is one quad; on a crowned road or a slope it is as many as it takes.
   */
  skirtSag: 0.02,
  skirtSample: 0.5,
  /** A field-following side whose ground falls or climbs more than this across the reach is a drop: no strip. */
  skirtDrop: 0.3,
  /**
   * The moving blobs (`render/contactShadows.ts` draws these per frame).
   * A rider is the wheel and the body over it, longer along the heading.
   */
  rider: Object.freeze({ halfX: 0.42, halfZ: 0.7, strength: 0.55 }),
  /** The jump fade: gone by `fadeHeight`, and wider as it rises. */
  fadeHeight: 4,
  growPerMetre: 0.18,
  /** A translucent rider casts a translucent blob. */
  ghostStrength: 0.5,
  /** A standing or walking person: a pool a little wider than the stance. */
  person: Object.freeze({ half: 0.5, strength: 0.5 }),
  /** A knocked-down person lies along the fall: this long a blob, this far out. */
  fallen: Object.freeze({ halfX: 0.42, halfZ: 0.95, reach: 0.75 }),
  populationEuc: Object.freeze({ halfX: 0.38, halfZ: 0.62, strength: 0.5 }),
  vehicle: Object.freeze({ skirtX: 0.18, skirtZ: 0.25, strength: 0.55, innerX: 0.55, innerZ: 0.7 }),
});

const gridFor = (halfX: number, halfZ: number): 2 | 3 | 4 => {
  const half = Math.max(halfX, halfZ);
  return half > CONTACT_SHADOW.grid4Above ? 4 : half > CONTACT_SHADOW.grid3Above ? 3 : 2;
};

/** Triangles one blob's grid draws. */
export function contactBlobTriangles(blob: Pick<ContactBlob, 'grid'>): number {
  return 2 * (blob.grid - 1) * (blob.grid - 1);
}

/**
 * Every static blob a plan lies down: its props (in plan order, shapes in
 * table order) and then the Quay's stalls. Buildings, gantries and bollard
 * finials lay no blob — a building's shade is its skirt
 * (`contactShadowSkirts`, below), and a finial sits on a collider post that
 * is a block, which lays a skirt too.
 */
export function contactShadowBlobs(plan: LevelPlan): ContactBlob[] {
  const blobs: ContactBlob[] = [];
  const table = CONTACT_SHADOW.props as Partial<Record<PropKind, readonly BlobShape[]>>;
  for (const prop of plan.props ?? []) {
    const shapes = table[prop.kind];
    if (shapes === undefined) continue;
    const scale = Number.isFinite(prop.scale) && prop.scale > 0 ? prop.scale : 1;
    const field = fieldHeightAt(plan.heightfield, plan.surround, prop.position.x, prop.position.z);
    const flatY = prop.position.y - field > CONTACT_SHADOW.onFieldTolerance ? prop.position.y : null;
    const cos = Math.cos(prop.rotationY);
    const sin = Math.sin(prop.rotationY);
    for (const shape of shapes) {
      const ox = (shape.offsetX ?? 0) * scale;
      const oz = (shape.offsetZ ?? 0) * scale;
      const halfX = shape.halfX * scale;
      const halfZ = shape.halfZ * scale;
      blobs.push({
        x: prop.position.x + ox * cos + oz * sin,
        z: prop.position.z - ox * sin + oz * cos,
        rotationY: prop.rotationY,
        halfX,
        halfZ,
        strength: shape.strength,
        innerX: shape.innerX ?? 0,
        innerZ: shape.innerZ ?? 0,
        flatY,
        grid: gridFor(halfX, halfZ),
      });
    }
  }
  const stall = CONTACT_SHADOW.stall;
  for (const rect of plan.quayScenery?.stalls ?? []) {
    const halfX = (rect.x1 - rect.x0) / 2 + stall.skirt;
    const halfZ = (rect.z1 - rect.z0) / 2 + stall.skirt;
    blobs.push({
      x: (rect.x0 + rect.x1) / 2,
      z: (rect.z0 + rect.z1) / 2,
      rotationY: 0,
      halfX,
      halfZ,
      strength: stall.strength,
      innerX: stall.inner,
      innerZ: stall.inner,
      flatY: null,
      grid: gridFor(halfX, halfZ),
    });
  }
  return blobs;
}

/** The static blobs' triangles, summed — what the merged mesh draws for them. */
export function staticContactShadowTriangles(blobs: readonly ContactBlob[]): number {
  let triangles = 0;
  for (const blob of blobs) triangles += contactBlobTriangles(blob);
  return triangles;
}

/**
 * A skirt — the shade round the foot of a block or a building (second look
 * pass, 2026-10-22).
 *
 * **Why a skirt and not a blob.** Until now the Low tier's blocks and
 * buildings stood on the ground with nothing under them, a pasted look right
 * beside benches and trees that had pools: a rooftop unit beside a bench that
 * sat in shade, a plaza wall whose High frame carries a dark contact line and
 * whose Low frame carried none. A blob the size of a building would put most
 * of its triangles and fill under the building, follow a slope only at
 * vertices ten metres apart, and darken twice wherever two blocks of a wall
 * meet. A skirt is the same rounded-rectangle shade the blobs draw — the same
 * shader, the same fade — but **drawn only outside the footprint**, as one
 * piece per side between the face and the grown rectangle (two neighbouring
 * pieces meet on the diagonal through their corner, so an isolated block is
 * eight triangles):
 *
 * - the shade is full at the wall and fades to nothing `reach` metres out;
 * - a side whose strip another solid stands on (the next block of a barrier,
 *   a terrace neighbour, a deck the block abuts) lays no piece, and the
 *   pieces beside it end square with the face instead of running on into the
 *   corner, so a chain of blocks reads as one shaded wall with no darker bead
 *   at every joint;
 * - a side that would hang off the edge of what the block stands on, or drape
 *   over a drop, lays none either;
 * - a side on the heightfield is split into as many quads as it takes to stay
 *   within `skirtSag` of the ground, and a flat plaza side is one quad.
 *
 * Coordinates are the box's own: `footX`/`footZ` are its half extents,
 * `rotationY` its yaw (three's, as `ContactBlob`), and the shade's outer
 * rectangle is the footprint grown by `reach`.
 */
export interface ContactSkirt {
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly footX: number;
  readonly footZ: number;
  readonly reach: number;
  readonly strength: number;
  /** As `ContactBlob.flatY`: null lies on the heightfield, a number is the top of what the box stands on. */
  readonly flatY: number | null;
  /** +X, −X, +Z, −Z: which sides lay a strip. A corner lays when both its sides do. */
  readonly sides: readonly [boolean, boolean, boolean, boolean];
  /** Quads along each side's strip, same order (the ±X strips run along Z, the ±Z strips along X). */
  readonly spans: readonly [number, number, number, number];
}

/** Triangles one skirt draws: two per quad of each drawn side. */
export function contactSkirtTriangles(skirt: Pick<ContactSkirt, 'sides' | 'spans'>): number {
  let triangles = 0;
  for (let side = 0; side < 4; side += 1) if (skirt.sides[side]) triangles += 2 * skirt.spans[side];
  return triangles;
}

/** Vertices one skirt's geometry holds: a side of n quads is 2(n + 1). */
export function contactSkirtVertices(skirt: Pick<ContactSkirt, 'sides' | 'spans'>): number {
  let vertices = 0;
  for (let side = 0; side < 4; side += 1) if (skirt.sides[side]) vertices += 2 * (skirt.spans[side] + 1);
  return vertices;
}

/**
 * One side's piece of a skirt in the skirt's own frame: the inner edge runs
 * along the face from `inner[0]` to `inner[1]`, the outer edge `reach` out
 * from `outer[0]` to `outer[1]`. Where the neighbouring side is drawn too, the
 * outer edge runs on to the corner of the grown rectangle, so the two sides
 * share the diagonal through the corner and each corner is covered once;
 * where it is not, the side ends square with the face. Shared by the
 * geometry and the sag check, so the vertices checked are the vertices drawn.
 */
export function skirtSideEdges(skirt: Pick<ContactSkirt, 'footX' | 'footZ' | 'reach' | 'sides'>, side: number): {
  inner: readonly [readonly [number, number], readonly [number, number]];
  outer: readonly [readonly [number, number], readonly [number, number]];
} {
  const fx = skirt.footX;
  const fz = skirt.footZ;
  const ox = fx + skirt.reach;
  const oz = fz + skirt.reach;
  if (side === 0 || side === 1) {
    const x = side === 0 ? fx : -fx;
    const outX = side === 0 ? ox : -ox;
    const lo = skirt.sides[3] ? -oz : -fz;
    const hi = skirt.sides[2] ? oz : fz;
    return { inner: [[x, -fz], [x, fz]], outer: [[outX, lo], [outX, hi]] };
  }
  const z = side === 2 ? fz : -fz;
  const outZ = side === 2 ? oz : -oz;
  const lo = skirt.sides[1] ? -ox : -fx;
  const hi = skirt.sides[0] ? ox : fx;
  return { inner: [[-fx, z], [fx, z]], outer: [[lo, outZ], [hi, outZ]] };
}

/** The static skirts' triangles, summed — what the merged mesh draws for them. */
export function staticContactSkirtTriangles(skirts: readonly ContactSkirt[]): number {
  let triangles = 0;
  for (const skirt of skirts) triangles += contactSkirtTriangles(skirt);
  return triangles;
}

/** Is (x, z) inside a box's footprint grown by `pad`? Tested in the box's own frame. */
function footprintContains(solid: BoxCollider, x: number, z: number, pad = 0): boolean {
  const dx = x - solid.centre.x;
  const dz = z - solid.centre.z;
  const cos = Math.cos(solid.rotationY);
  const sin = Math.sin(solid.rotationY);
  // World → the box's own frame: the inverse of three's rotation about +Y.
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= solid.halfExtents.x + pad && Math.abs(lz) <= solid.halfExtents.z + pad;
}

interface SkirtSource {
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly footX: number;
  readonly footZ: number;
  readonly base: number;
  readonly top: number;
  /** The box this skirt is for, when it is one of the plan's solids — it never covers itself. */
  readonly self: BoxCollider | null;
  readonly reach: number;
  readonly strength: number;
}

function skirtFor(plan: LevelPlan, index: SolidIndex, source: SkirtSource): ContactSkirt | null {
  const field = (x: number, z: number): number => fieldHeightAt(plan.heightfield, plan.surround, x, z);
  const tolerance = CONTACT_SHADOW.onFieldTolerance;
  const others = (x: number, z: number): BoxCollider[] =>
    index.near(x, z).filter((solid) => solid !== source.self && footprintContains(solid, x, z));
  const topOf = (solid: BoxCollider): number => solid.centre.y + solid.halfExtents.y;
  const bottomOf = (solid: BoxCollider): number => solid.centre.y - solid.halfExtents.y;

  // What it stands on: the field (its base is at or under it), or the top of
  // another solid under its centre. A box with neither under it — a beam, an
  // overhang — has no foot to shade.
  let flatY: number | null = null;
  let contact = field(source.x, source.z);
  if (source.base > contact + tolerance) {
    const supported = others(source.x, source.z).some((solid) => Math.abs(topOf(solid) - source.base) <= tolerance);
    if (!supported) return null;
    flatY = source.base;
    contact = source.base;
  }
  if (source.top - contact < CONTACT_SHADOW.block.minHeight) return null;

  const cos = Math.cos(source.rotationY);
  const sin = Math.sin(source.rotationY);
  const world = (lx: number, lz: number): [number, number] => [source.x + lx * cos + lz * sin, source.z - lx * sin + lz * cos];
  const reach = source.reach;
  // Each side: its outward axis in the box's frame and its half length.
  const frames: readonly { readonly out: readonly [number, number]; readonly along: readonly [number, number]; readonly half: number; readonly offset: number }[] = [
    { out: [1, 0], along: [0, 1], half: source.footZ, offset: source.footX },
    { out: [-1, 0], along: [0, 1], half: source.footZ, offset: source.footX },
    { out: [0, 1], along: [1, 0], half: source.footX, offset: source.footZ },
    { out: [0, -1], along: [1, 0], half: source.footX, offset: source.footZ },
  ];
  const sides: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  frames.forEach((frame, side) => {
    const point = (t: number, d: number): [number, number] => world(
      frame.out[0] * (frame.offset + d) + frame.along[0] * t * frame.half,
      frame.out[1] * (frame.offset + d) + frame.along[1] * t * frame.half,
    );
    let blocked = 0;
    let grounded = true;
    for (const t of [-0.9, 0, 0.9]) {
      const [mx, mz] = point(t, reach * 0.5);
      const ground = flatY ?? field(mx, mz);
      // Another solid rising through the strip: its next block, a neighbour, a deck it abuts.
      if (others(mx, mz).some((solid) => bottomOf(solid) <= ground + 0.05 && topOf(solid) >= ground + 0.15)) blocked += 1;
      const [ox, oz] = point(t, reach * 0.9);
      if (flatY === null) {
        const [wx, wz] = point(t, 0);
        if (Math.abs(field(ox, oz) - field(wx, wz)) > CONTACT_SHADOW.skirtDrop) grounded = false;
      } else if (Math.abs(field(ox, oz) - flatY) > tolerance
        && !others(ox, oz).some((solid) => Math.abs(topOf(solid) - flatY!) <= tolerance)) {
        grounded = false;
      }
    }
    sides[side] = blocked < 3 && grounded;
  });
  // As few quads per side as keep both of its edges within `skirtSag` of the
  // field; a skirt on a support's flat top is one quad a side.
  const spans: [number, number, number, number] = [1, 1, 1, 1];
  if (flatY === null) {
    const shape = { footX: source.footX, footZ: source.footZ, reach, sides };
    for (let side = 0; side < 4; side += 1) {
      if (!sides[side]) continue;
      const { inner, outer } = skirtSideEdges(shape, side);
      const length = Math.hypot(inner[1][0] - inner[0][0], inner[1][1] - inner[0][1]);
      const most = Math.max(1, Math.ceil(length));
      const samples = Math.max(2, Math.ceil((length + 2 * reach) / CONTACT_SHADOW.skirtSample));
      // The field along each edge, sampled once; each trial span count only
      // reads its own vertices from the field.
      const edges = [inner, outer].map((edge) => {
        const at = (u: number): number => {
          const [px, pz] = world(edge[0][0] + (edge[1][0] - edge[0][0]) * u, edge[0][1] + (edge[1][1] - edge[0][1]) * u);
          return field(px, pz);
        };
        const heights: number[] = [];
        for (let k = 0; k <= samples; k += 1) heights.push(at(k / samples));
        return { at, heights };
      });
      for (let n = 1; n <= most; n += 1) {
        let fits = true;
        for (const { at, heights } of edges) {
          const vertices: number[] = [];
          for (let k = 0; k <= n; k += 1) vertices.push(at(k / n));
          for (let k = 0; k <= samples && fits; k += 1) {
            const u = (k / samples) * n;
            const i = Math.min(n - 1, Math.floor(u));
            const line = vertices[i] + (vertices[i + 1] - vertices[i]) * (u - i);
            if (Math.abs(heights[k] - line) > CONTACT_SHADOW.skirtSag) fits = false;
          }
          if (!fits) break;
        }
        spans[side] = n;
        if (fits) break;
      }
    }
  }
  if (!sides.some(Boolean)) return null;
  return {
    x: source.x,
    z: source.z,
    rotationY: source.rotationY,
    footX: source.footX,
    footZ: source.footZ,
    reach,
    strength: source.strength,
    flatY,
    sides,
    spans,
  };
}

/**
 * Every static skirt a plan lays: its drawn collider blocks (segment order),
 * then its buildings (plan order). A block the Quay already shades as a
 * market stall, one that is not drawn (the see-through railings' boxes), and
 * one too low to have a foot lay none.
 */
export function contactShadowSkirts(plan: LevelPlan): ContactSkirt[] {
  const skirts: ContactSkirt[] = [];
  const index = indexSolids(planSolids(plan));
  const stalls = plan.quayScenery?.stalls ?? [];
  const block = CONTACT_SHADOW.block;
  for (const solid of planColliders(plan)) {
    if (solid.drawn === false) continue;
    const { x, z } = solid.centre;
    if (stalls.some((rect) => x >= rect.x0 - 0.05 && x <= rect.x1 + 0.05 && z >= rect.z0 - 0.05 && z <= rect.z1 + 0.05)) continue;
    const skirt = skirtFor(plan, index, {
      x,
      z,
      rotationY: solid.rotationY,
      footX: solid.halfExtents.x,
      footZ: solid.halfExtents.z,
      base: solid.centre.y - solid.halfExtents.y,
      top: solid.centre.y + solid.halfExtents.y,
      self: solid,
      reach: block.reach,
      strength: block.strength,
    });
    if (skirt !== null) skirts.push(skirt);
  }
  const building = CONTACT_SHADOW.building;
  for (const prop of plan.props ?? []) {
    if (prop.kind !== 'building') continue;
    // The footprint `buildPlan.ts:solidOf` and `render/props.ts` give it.
    const scale = Number.isFinite(prop.scale) && prop.scale > 0 ? prop.scale : 1;
    const size = prop.size ?? { x: 12, y: 18, z: 12 };
    const skirt = skirtFor(plan, index, {
      x: prop.position.x,
      z: prop.position.z,
      rotationY: prop.rotationY,
      footX: 0.5 * scale * size.x,
      footZ: 0.5 * scale * size.z,
      base: prop.position.y,
      top: prop.position.y + scale * size.y,
      self: null,
      reach: building.reach,
      strength: building.strength,
    });
    if (skirt !== null) skirts.push(skirt);
  }
  return skirts;
}

/**
 * The height a moving blob lies at under (x, z) for something whose contact
 * point is at `y`: the highest solid top at or a little above it, else the
 * heightfield. A rider on a wall's top or a deck keeps a blob under the
 * wheel; one jumping off it sees the blob drop to the ground below.
 *
 * A coarse spatial hash over the plan's solids, built once per world. Solids
 * are boxes rotated about +Y, tested in their own frame.
 */
export interface ContactGround {
  below(x: number, z: number, y: number): number;
}

const CELL = 8;

/** A coarse spatial hash over solids: `near` lists every solid whose reach touches the cell (x, z) falls in. */
interface SolidIndex {
  near(x: number, z: number): readonly BoxCollider[];
}

const NO_SOLIDS: readonly BoxCollider[] = Object.freeze([]);

function indexSolids(solids: readonly BoxCollider[]): SolidIndex {
  const cells = new Map<number, BoxCollider[]>();
  const key = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);
  for (const solid of solids) {
    const c = Math.abs(Math.cos(solid.rotationY));
    const s = Math.abs(Math.sin(solid.rotationY));
    const reachX = solid.halfExtents.x * c + solid.halfExtents.z * s;
    const reachZ = solid.halfExtents.x * s + solid.halfExtents.z * c;
    const x0 = Math.floor((solid.centre.x - reachX) / CELL);
    const x1 = Math.floor((solid.centre.x + reachX) / CELL);
    const z0 = Math.floor((solid.centre.z - reachZ) / CELL);
    const z1 = Math.floor((solid.centre.z + reachZ) / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) continue;
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const k = key(cx, cz);
        const list = cells.get(k);
        if (list === undefined) cells.set(k, [solid]);
        else list.push(solid);
      }
    }
  }
  return {
    near(x: number, z: number): readonly BoxCollider[] {
      return cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NO_SOLIDS;
    },
  };
}

export function createContactGround(plan: LevelPlan): ContactGround {
  const index = indexSolids(planSolids(plan));
  return {
    below(x: number, z: number, y: number): number {
      let ground = fieldHeightAt(plan.heightfield, plan.surround, x, z);
      for (const solid of index.near(x, z)) {
        const top = solid.centre.y + solid.halfExtents.y;
        if (top <= ground || top > y + 0.15) continue;
        if (footprintContains(solid, x, z)) ground = top;
      }
      return ground;
    },
  };
}
