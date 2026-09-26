/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ultra street-furniture forms (T7) — M39 (`docs/M39_ULTRA.md` §4, package W3),
 * and the small closed-shell toolkit every Ultra form builder shares.
 *
 * The ordinary furniture is boxes and six-sided tubes, which is right for the
 * phone contract and reads as "blockout" the moment the chase camera passes a
 * bench at three metres. Ultra rebuilds the same parts — same buckets, same
 * instance transforms and tints, same `data/props.ts` envelopes — as the
 * shapes a street actually has: an octagonal lamp standard on a flared foot with
 * a curved arm and a hooded lantern, a slatted bench on cast legs, a bin with a
 * rolled rim, fence posts with pyramid caps, fingerposts that point, and
 * tyres that are tyres rather than stacked drums.
 *
 * **Four rules, each carried over from `render/props.ts` and `foliageKit.ts`.**
 *
 * - **Inside the envelope, measured.** Every size is derived from
 *   `PROP_SIZES` or `PROP_FOOTPRINTS` (placement and collision data this file
 *   never edits), and `ultraFurniture.test.ts` measures every vertex against
 *   them: the lamp's top is exactly 4.6 m and its plan stays inside the 1.12 m
 *   spread, the fence stays inside ±0.055 m, the tyres inside r 0.44, the
 *   bench inside its 1.85 × 0.46 × 0.86 m box.
 * - **Closed shells.** Every piece is a closed, outward-wound shell, because
 *   an Ultra part casts into a 4096 map and a hole in a shell is a hole in its
 *   shadow (and, under the far map's `colorWrite:false` depth render, a hole
 *   in the town's shade). The tests walk every directed edge.
 * - **Colour on the instance.** Each part keeps its white material and its
 *   per-instance albedo; the geometry's `color` attribute is at most a small
 *   tone vocabulary (a lantern's glass against its hood, a bin's dark opening)
 *   normalised to a per-channel mean of exactly 1.0, so the instance tint
 *   still states the authored albedo.
 * - **Silhouette before surface.** Anything under about three pixels at 30 m
 *   (≈ 0.1 m) is not spent in triangles (§4's pixel rule). That is why the
 *   sign fingers are arrow-tipped but not bevelled — a 12 mm bevel is
 *   sub-pixel beyond four metres — and why the budget went on the lamp's arm
 *   and the bench's slat gaps instead.
 *
 * **The toolkit.** `formBuilder` accumulates outward-wound triangles with
 * flat or supplied normals and per-corner tones; `lathe` turns a radius/height
 * profile into rings (optionally closed into a loop, which is how a tyre is a
 * torus with flat treads); `prism` extrudes a simple outline. The foliage and
 * building builders use the same kit, so one closed-shell discipline covers
 * every Ultra form. Pure geometry, no DOM: headless-importable (invariant 13).
 */
import * as THREE from 'three';
import { PROP_FOOTPRINTS, PROP_SIZES } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import { loftGeometry, loftProfile } from '../blockoutKit.ts';

// ---------------------------------------------------------------------------
// The toolkit
// ---------------------------------------------------------------------------

export type Vec3 = readonly [number, number, number];
/** A per-channel multiplier on the part's white material (and so on its instance albedo). */
export type Tone = readonly [number, number, number];

export const WHITE: Tone = Object.freeze([1, 1, 1]) as Tone;

export interface FormBuilder {
  /**
   * One triangle, counter-clockwise seen from outside. Its normal is the
   * winding's own unless `normals` gives one per corner (a smoothed tube).
   * `tone` is one tone for the face or one per corner.
   */
  tri(a: Vec3, b: Vec3, c: Vec3, tone?: Tone | readonly Tone[], normals?: readonly Vec3[]): void;
  /** A quad `a b c d`, counter-clockwise from outside, as the triangles `a b c` and `a c d`. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, tone?: Tone | readonly Tone[], normals?: readonly Vec3[]): void;
  /** A planar simple polygon, counter-clockwise from outside, ear-clipped (n − 2 triangles). */
  polygon(points: readonly Vec3[], tone?: Tone): void;
  /** Append a finished geometry (indexed or not) with one tone, keeping its own normals. */
  append(geometry: THREE.BufferGeometry, tone?: Tone): void;
  readonly triangles: number;
  /**
   * The geometry: position, normal and `color`, un-indexed. The tones are
   * normalised per channel to a corner mean of exactly 1.0 unless
   * `normalise` is false.
   */
  geometry(normalise?: boolean): THREE.BufferGeometry;
}

function sub(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  // A degenerate face keeps a finite normal rather than a NaN one: a NaN
  // normal is a part that renders black (`DESIGN.md` §7c).
  if (length < 1e-12) return [0, 1, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Newell's normal of a polygon — robust for any planar, simple outline. */
function newell(points: readonly Vec3[]): [number, number, number] {
  let x = 0; let y = 0; let z = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit([x, y, z]);
}

/**
 * Ear-clip a simple polygon given in 2D, counter-clockwise. Returns index
 * triples, n − 2 of them. O(n³), which is nothing at the eight or ten corners
 * a furniture outline has.
 */
export function earClip(points: readonly (readonly [number, number])[]): [number, number, number][] {
  const indices = points.map((_point, index) => index);
  const out: [number, number, number][] = [];
  const area2 = (a: number, b: number, c: number): number => {
    const [ax, ay] = points[a]; const [bx, by] = points[b]; const [cx, cy] = points[c];
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  };
  // Strictly inside: a vertex on an ear's edge is a collinear neighbour, and
  // blocking on it would stall a polygon with a straight run of corners.
  const inside = (p: number, a: number, b: number, c: number): boolean => (
    area2(a, b, p) > 1e-12 && area2(b, c, p) > 1e-12 && area2(c, a, p) > 1e-12
  );
  let guard = 0;
  while (indices.length > 3 && guard < 10_000) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < indices.length; i += 1) {
      const a = indices[(i + indices.length - 1) % indices.length];
      const b = indices[i];
      const c = indices[(i + 1) % indices.length];
      if (area2(a, b, c) <= 1e-12) continue; // reflex or flat: not an ear
      let blocked = false;
      for (const other of indices) {
        if (other === a || other === b || other === c) continue;
        if (inside(other, a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      out.push([a, b, c]);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('earClip: the outline is not a simple counter-clockwise polygon');
  }
  if (indices.length === 3) out.push([indices[0], indices[1], indices[2]]);
  return out;
}

export function formBuilder(): FormBuilder {
  const positions: number[] = [];
  const normals: number[] = [];
  const tones: number[] = [];

  const toneAt = (tone: Tone | readonly Tone[] | undefined, corner: number): Tone => {
    if (tone === undefined) return WHITE;
    return typeof tone[0] === 'number' ? (tone as Tone) : (tone as readonly Tone[])[corner];
  };

  const builder: FormBuilder = {
    tri(a, b, c, tone, supplied) {
      const face = unit(cross(sub(b, a), sub(c, a)));
      const corners = [a, b, c];
      for (let corner = 0; corner < 3; corner += 1) {
        const p = corners[corner];
        positions.push(p[0], p[1], p[2]);
        const n = supplied === undefined ? face : unit(supplied[corner]);
        normals.push(n[0], n[1], n[2]);
        const t = toneAt(tone, corner);
        tones.push(t[0], t[1], t[2]);
      }
    },
    quad(a, b, c, d, tone, supplied) {
      const corners = tone !== undefined && typeof tone[0] !== 'number' ? tone as readonly Tone[] : undefined;
      const face = corners === undefined ? tone as Tone | undefined : undefined;
      builder.tri(
        a, b, c,
        corners === undefined ? face : [corners[0], corners[1], corners[2]],
        supplied === undefined ? undefined : [supplied[0], supplied[1], supplied[2]],
      );
      builder.tri(
        a, c, d,
        corners === undefined ? face : [corners[0], corners[2], corners[3]],
        supplied === undefined ? undefined : [supplied[0], supplied[2], supplied[3]],
      );
    },
    polygon(points, tone) {
      const normal = newell(points);
      // Project onto the plane most facing the normal, keeping handedness so a
      // counter-clockwise outline stays counter-clockwise in 2D.
      const ax = Math.abs(normal[0]); const ay = Math.abs(normal[1]); const az = Math.abs(normal[2]);
      const flat: [number, number][] = points.map((p) => {
        if (ax >= ay && ax >= az) return normal[0] > 0 ? [p[1], p[2]] : [p[2], p[1]];
        if (ay >= az) return normal[1] > 0 ? [p[2], p[0]] : [p[0], p[2]];
        return normal[2] > 0 ? [p[0], p[1]] : [p[1], p[0]];
      });
      for (const [a, b, c] of earClip(flat)) builder.tri(points[a], points[b], points[c], tone);
    },
    append(geometry, tone = WHITE) {
      const source = geometry.index === null ? geometry : geometry.toNonIndexed();
      const position = source.getAttribute('position');
      const normal = source.getAttribute('normal');
      for (let i = 0; i < position.count; i += 1) {
        positions.push(position.getX(i), position.getY(i), position.getZ(i));
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        tones.push(tone[0], tone[1], tone[2]);
      }
      if (source !== geometry) source.dispose();
      geometry.dispose();
    },
    get triangles() {
      return positions.length / 9;
    },
    geometry(normalise = true) {
      const colours = new Float32Array(tones.length);
      const count = tones.length / 3;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let i = 0; i < count; i += 1) sum += tones[i * 3 + channel];
        const mean = normalise && sum > 0 ? sum / count : 1;
        for (let i = 0; i < count; i += 1) colours[i * 3 + channel] = tones[i * 3 + channel] / mean;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      return geometry;
    },
  };
  return builder;
}

/** One point of a lathe profile: radius from the axis and height, metres. */
export interface LatheRing {
  readonly r: number;
  readonly y: number;
}

export interface LatheOptions {
  /** Sides around the axis. */
  readonly segments: number;
  /** Azimuth of the first side's corner, radians; `π / n` puts a flat, not a corner, on +x. */
  readonly phase?: number;
  /** The axis's position in local XZ. */
  readonly centre?: readonly [number, number];
  /** Per-axis stretch of every ring in local XZ (an oval bin, a waisted tyre). */
  readonly stretch?: readonly [number, number];
  /** Smooth around the axis (each band keeps its own profile slope), crisp between bands. */
  readonly smooth?: boolean;
  /**
   * Smooth like a round tube: each corner's normal points away from this
   * (radius, height) centre of the profile's cross-section. How a six-sided
   * tyre section shades round.
   */
  readonly tube?: readonly [number, number];
  /** The profile is a loop: the last point joins the first (a torus). */
  readonly closed?: boolean;
  /** A flat polygon closing the first ring (it faces down). */
  readonly capBottom?: boolean;
  /** A flat polygon closing the last ring (it faces up). */
  readonly capTop?: boolean;
  /** One tone per band (profile segment), and one for each cap. */
  readonly tones?: readonly Tone[];
  readonly bottomTone?: Tone;
  readonly topTone?: Tone;
}

/** A lathe ring's corners, counter-clockwise seen from above (+y). */
export function ringCorners(ring: LatheRing, options: LatheOptions): Vec3[] {
  const [cx, cz] = options.centre ?? [0, 0];
  const [sx, sz] = options.stretch ?? [1, 1];
  const phase = options.phase ?? 0;
  const out: Vec3[] = [];
  for (let i = 0; i < options.segments; i += 1) {
    const angle = phase + (i / options.segments) * Math.PI * 2;
    // (cos, −sin): increasing angle runs counter-clockwise seen from +y, the
    // convention `foliageKit.enhancedConifer` derives its outward winding from.
    out.push([cx + Math.cos(angle) * ring.r * sx, ring.y, cz - Math.sin(angle) * ring.r * sz]);
  }
  return out;
}

/**
 * Turn a profile about the vertical axis. The profile must run
 * counter-clockwise around the solid's own cross-section in the (radius,
 * height) half-plane — outward along the bottom, up the outside, inward over
 * the top — and every band then faces outward by construction. A point with
 * radius 0 is a pole and closes its band with a fan instead of a cap.
 */
export function lathe(builder: FormBuilder, profile: readonly LatheRing[], options: LatheOptions): void {
  const segments = options.segments;
  const phase = options.phase ?? 0;
  const [sx, sz] = options.stretch ?? [1, 1];
  const rings = profile.map((ring) => ringCorners(ring, options));
  const bands = options.closed === true ? profile.length : profile.length - 1;

  /** A smooth normal at azimuth index `i` from a (radius, height) direction. */
  const around = (i: number, nr: number, ny: number): Vec3 => {
    const angle = phase + (i / segments) * Math.PI * 2;
    // An oval ring's normal leans by the inverse stretch, as a scaled surface's does.
    return unit([(Math.cos(angle) * nr) / sx, ny, (-Math.sin(angle) * nr) / sz]);
  };

  for (let band = 0; band < bands; band += 1) {
    const lower = profile[band];
    const upper = profile[(band + 1) % profile.length];
    const a = rings[band];
    const b = rings[(band + 1) % profile.length];
    const tone = options.tones?.[band] ?? WHITE;
    // The band's own outward normal in the half-plane: its direction turned clockwise.
    const dr = upper.r - lower.r;
    const dy = upper.y - lower.y;
    const length = Math.hypot(dr, dy) || 1;
    const nr = dy / length;
    const ny = -dr / length;
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      let normals: Vec3[] | undefined;
      if (options.tube !== undefined) {
        const [tr, ty] = options.tube;
        const n = (ring: LatheRing, index: number): Vec3 => around(index, ring.r - tr, ring.y - ty);
        normals = [n(lower, i), n(lower, j), n(upper, j), n(upper, i)];
      } else if (options.smooth === true) {
        normals = [around(i, nr, ny), around(j, nr, ny), around(j, nr, ny), around(i, nr, ny)];
      }
      if (lower.r === 0) {
        builder.tri(a[i], b[j], b[i], tone, normals === undefined ? undefined : [normals[0], normals[2], normals[3]]);
      } else if (upper.r === 0) {
        builder.tri(a[i], a[j], b[i], tone, normals === undefined ? undefined : [normals[0], normals[1], normals[3]]);
      } else {
        builder.quad(a[i], a[j], b[j], b[i], tone, normals);
      }
    }
  }
  if (options.capBottom === true && profile[0].r > 0) {
    builder.polygon([...rings[0]].reverse(), options.bottomTone ?? WHITE);
  }
  const last = profile.length - 1;
  if (options.capTop === true && profile[last].r > 0) {
    builder.polygon(rings[last], options.topTone ?? WHITE);
  }
}

/**
 * Extrude a simple outline. `outline` is counter-clockwise in the (u, v)
 * plane of a right-handed frame (u × v = w); the solid runs from `w0` to `w1`
 * along w. `place` maps (u, v, w) to local space. Sides face outward and the
 * `w1` cap faces +w, by construction rather than by flipping.
 */
export function prism(
  builder: FormBuilder,
  outline: readonly (readonly [number, number])[],
  place: (u: number, v: number, w: number) => Vec3,
  w0: number,
  w1: number,
  tone: Tone = WHITE,
  sideTone: Tone = tone,
): void {
  // Accept either winding and make it counter-clockwise, so an outline is
  // authored in whatever order reads best.
  let area = 0;
  for (let i = 0; i < outline.length; i += 1) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % outline.length];
    area += ax * by - bx * ay;
  }
  const ccw = area > 0 ? outline : [...outline].reverse();
  const near = ccw.map(([u, v]) => place(u, v, w0));
  const far = ccw.map(([u, v]) => place(u, v, w1));
  for (let i = 0; i < ccw.length; i += 1) {
    const j = (i + 1) % ccw.length;
    builder.quad(near[i], near[j], far[j], far[i], sideTone);
  }
  builder.polygon(far, tone);
  builder.polygon([...near].reverse(), tone);
}

/** Right-handed frame: u = x, v = y, w = z. An outline drawn in the (x, y) plane, extruded along z. */
const XY_Z = (u: number, v: number, w: number): Vec3 => [u, v, w];
/**
 * Right-handed frame: u = z, v = y, w = −x (z × y = −x). An outline drawn in
 * the bench's side elevation — forward (+z) to the right, up — extruded
 * along the bench's length, where local x = −w.
 */
const ZY_X = (u: number, v: number, w: number): Vec3 => [-w, v, u];

// ---------------------------------------------------------------------------
// The forms
// ---------------------------------------------------------------------------

/**
 * Proportions the forms are built to, metres. Everything that is placement or
 * collision data is read from `data/props.ts`; these are the shapes inside it.
 */
const FORM = Object.freeze({
  lamp: {
    /** Where the flared foot (footprint-wide at the ground) meets the standard. */
    footTop: 0.55,
    /** The standard's radius at the foot's top and at its own top. */
    shaftBase: 0.072,
    shaftTop: 0.056,
    /** The finial's shoulder; its point is `postHeight`, exactly. */
    finialBase: 4.44,
    /**
     * The arm, as (distance out along +z, height above `armBase`) at each of
     * its four rings: out of the standard, up, over, and down a touch to the
     * lantern — a swan neck, not a bracket.
     */
    armBase: 4.36,
    armPath: [[0, 0], [0.22, 0.11], [0.55, 0.168], [0.95, 0.14]] as readonly (readonly [number, number])[],
    /** Lantern: hood top, rim, underside, and glass foot. */
    hoodTop: 4.49,
    hoodRim: 4.42,
    hoodUnder: 4.405,
    glassFoot: 4.27,
  },
  fence: {
    /** The post's square shoulder, below the pyramid cap. */
    capBase: 0.94,
  },
  tyre: {
    /** Radial half-width of the tread section at full size. */
    tread: 0.13,
    /**
     * `ULTRA.forms.tyre`: twelve round the stack's axis and a six-cornered
     * tread section — W0 named them after three's torus arguments the other
     * way round (`radialSegments` 12, `tubularSegments` 6); this is the
     * reading §4's "12 × 6" means. The section must have an even count so
     * its top and bottom are flats the next tyre sits on.
     */
    around: ULTRA.forms.tyre.radialSegments,
    section: ULTRA.forms.tyre.tubularSegments,
  },
  bench: {
    /** Slat counts are `ULTRA.forms.bench`'s (4 seat, 3 back). */
    seatSlats: ULTRA.forms.bench.seatSlats,
    backSlats: ULTRA.forms.bench.backSlats,
    seatSlatThickness: 0.04,
    seatGap: 0.0173,
    /** Seat depth left clear at the back for the leaning back slats and the uprights. */
    seatBackMargin: 0.029,
    backSlatHeight: 0.085,
    backGap: 0.0225,
    backSlatDepth: 0.028,
    /** The back's lean: its front face runs from here at the lowest slat … */
    backFront: -0.165,
    /** … back by this much per metre of height. */
    backLean: 0.1,
    backFoot: 0.56,
    /** A cast leg's plate thickness, and its centre in from the bench end. */
    legThickness: 0.06,
  },
  bin: {
    bodyTop: 0.80,
    rimWidest: 0.845,
    /** The rolled rim's lip, curling back in over the top. */
    lipRadius: 0.284,
  },
  sign: {
    /** The post's shoulder below its point (the point is `postHeight`, exactly). */
    capBase: 2.40,
    /** Arrow shoulders and points along the finger, metres from the post axis. */
    upperShoulder: 0.90,
    upperTip: 1.04,
    lowerShoulder: 0.58,
    lowerTip: 0.70,
  },
});

/** Tones: small, and all normalised away to a mean of 1.0 in the builder. */
const TONES = Object.freeze({
  glass: [1.2, 1.2, 1.2] as Tone,
  hood: [0.84, 0.84, 0.84] as Tone,
  hoodUnder: [0.78, 0.78, 0.78] as Tone,
  binMouth: [0.55, 0.55, 0.55] as Tone,
  binRim: [1.06, 1.06, 1.06] as Tone,
  plateEdge: [0.82, 0.82, 0.82] as Tone,
});

/**
 * Lamp standard and arm (≤ 100 triangles). An octagonal standard on a flared
 * foot exactly the footprint wide at the ground, a pointed finial whose tip is
 * `postHeight` (4.6 m) exactly, and an arm lofted through
 * `blockoutKit.loftGeometry` that rises out of the standard and arches over to
 * the lantern — the swan neck that says "street lamp" rather than "pole".
 * Flats face the axes, so the arm leaves from a face, not an edge.
 */
export function ultraLampPost(): THREE.BufferGeometry {
  const lamp = PROP_SIZES.lampPost;
  const form = FORM.lamp;
  const footprint = (PROP_FOOTPRINTS.lampPost as { radius: number }).radius;
  const builder = formBuilder();
  lathe(builder, [
    { r: footprint, y: 0 },
    { r: form.shaftBase, y: form.footTop },
    { r: form.shaftTop, y: form.finialBase },
    { r: 0, y: lamp.postHeight },
  ], { segments: 8, phase: Math.PI / 8, capBottom: true });

  // The arm, authored along its own length (the loft's y) and turned to run
  // out along +z. `rotateX(π/2)` maps loft (x, y, z) to (x, −z, y), so a
  // ring's `z` offset is minus its height above the arm's root. It thins
  // towards the lantern, and its last ring sits over the lantern's centre.
  const path = form.armPath;
  const arm = loftGeometry(loftProfile(path.map(([out, rise], index) => ({
    y: index === path.length - 1 ? lamp.headReach : out,
    halfWidth: 0.034 - index * 0.0027,
    halfDepth: 0.03 - index * 0.0027,
    z: -rise,
  }))), { radialSegments: 6 });
  arm.deleteAttribute('uv');
  arm.deleteAttribute('color');
  arm.rotateX(Math.PI / 2);
  arm.translate(0, form.armBase, 0);
  builder.append(arm);
  return builder.geometry();
}

/**
 * The lantern (≤ 44 triangles, never casts): a hexagonal glass body under a
 * bevelled hood whose rim oversails it, hung under the arm's end. Its plan
 * stays inside the lamp's 1.12 m spread; the glass carries a lighter tone
 * than the hood so the lantern reads as a lantern and not a box — a tone, not
 * an emissive (§0.3 rejects emissive windows).
 */
export function ultraLampHead(): THREE.BufferGeometry {
  const lamp = PROP_SIZES.lampPost;
  const form = FORM.lamp;
  const builder = formBuilder();
  lathe(builder, [
    { r: 0.10, y: form.glassFoot },
    { r: 0.118, y: form.hoodUnder },
    { r: 0.17, y: form.hoodRim },
    { r: 0.05, y: form.hoodTop },
  ], {
    segments: 6,
    centre: [0, lamp.headReach],
    capBottom: true,
    capTop: true,
    tones: [TONES.glass, TONES.hoodUnder, TONES.hood],
    bottomTone: TONES.hood,
    topTone: TONES.hood,
  });
  return builder.geometry();
}

/**
 * Fence bay (≤ 56 triangles): an octagonal post with a pyramid cap whose
 * point is the bay's 1.02 m exactly, and two rails of diamond section — a
 * rail whose upper facet takes the sun and whose lower facet does not reads
 * as a turned rail at riding distance, which a flat-sided box never did. The
 * post's flats sit on ±0.055 m, the footprint's own half-width.
 */
export function ultraFenceBay(): THREE.BufferGeometry {
  const fence = PROP_SIZES.fenceBay;
  const half = fence.postWidth / 2;
  const builder = formBuilder();
  // Flats on the axes: the circumradius whose apothem is the half-width.
  lathe(builder, [
    { r: half / Math.cos(Math.PI / 8), y: 0 },
    { r: half / Math.cos(Math.PI / 8), y: FORM.fence.capBase },
    { r: 0, y: fence.postHeight },
  ], { segments: 8, phase: Math.PI / 8, capBottom: true });
  const halfRail = fence.railThickness / 2;
  const halfDepth = fence.railHeight / 2;
  for (const height of [fence.railUpper, fence.railLower]) {
    prism(builder, [
      [halfRail, height], [0, height + halfDepth], [-halfRail, height], [0, height - halfDepth],
    ], XY_Z, -fence.length / 2, fence.length / 2);
  }
  return builder.geometry();
}

/**
 * Tyre stack (≤ 576 triangles): four tyres as four tori, twelve around and a
 * six-sided tread section, the alternate waist kept. The section's flat top
 * and bottom are what let the tyres sit on each other; its corners shade
 * round because the normals are the tube's. Outer radius 0.44 m, top 0.84 m,
 * both exact.
 */
export function ultraTyreStack(): THREE.BufferGeometry {
  const stack = PROP_SIZES.tyreStack;
  const builder = formBuilder();
  const halfHeight = stack.tyreHeight / 2;
  for (let tyre = 0; tyre < stack.tyres; tyre += 1) {
    const scale = tyre % 2 === 1 ? stack.waist : 1;
    const tread = FORM.tyre.tread * scale;
    const middle = stack.radius * scale - tread;
    const centre = tyre * stack.tyreHeight + halfHeight;
    // Counter-clockwise round the tread section: the outer equator, up over
    // the flat top, down the inside, back under.
    const section: LatheRing[] = [];
    const corners = FORM.tyre.section;
    for (let corner = 0; corner < corners; corner += 1) {
      const angle = (corner / corners) * Math.PI * 2;
      const r = middle + Math.cos(angle) * tread;
      // The flats are exactly the tyre's height apart, so the stack's top is exact.
      const y = corner === 0 || corner === corners / 2 ? centre : centre + Math.sign(Math.sin(angle)) * halfHeight;
      section.push({ r, y });
    }
    lathe(builder, section, { segments: FORM.tyre.around, closed: true, tube: [middle, centre], phase: tyre * 0.26 });
  }
  return builder.geometry();
}

/**
 * Bench slats (≤ 72 triangles): four seat slats with gaps, and three back
 * slats leaning back, each with a flat face towards the sitter and a ridged
 * back — which is eight triangles a slat instead of twelve and reads, from
 * behind, as a rounded board. Inside the 1.85 × 0.46 × 0.86 m box.
 */
export function ultraBenchWood(): THREE.BufferGeometry {
  const bench = PROP_SIZES.bench;
  const form = FORM.bench;
  const builder = formBuilder();
  const halfLength = bench.length / 2;
  const seatTop = bench.seatHeight + bench.seatThickness / 2;
  const front = bench.seatDepth / 2;
  const slatWidth = (bench.seatDepth - form.seatGap * (form.seatSlats - 1) - form.seatBackMargin) / form.seatSlats;
  for (let slat = 0; slat < form.seatSlats; slat += 1) {
    const z1 = front - slat * (slatWidth + form.seatGap);
    const z0 = z1 - slatWidth;
    prism(builder, [
      [z0, seatTop - form.seatSlatThickness], [z1, seatTop - form.seatSlatThickness], [z1, seatTop], [z0, seatTop],
    ], ZY_X, -halfLength, halfLength);
  }
  const top = bench.seatHeight + bench.backHeight;
  const frontAt = (y: number): number => form.backFront - form.backLean * (y - form.backFoot);
  for (let slat = 0; slat < form.backSlats; slat += 1) {
    const y1 = top - slat * (form.backSlatHeight + form.backGap);
    const y0 = y1 - form.backSlatHeight;
    const middle = (y0 + y1) / 2;
    prism(builder, [
      [frontAt(y0), y0], [frontAt(y1), y1], [frontAt(middle) - form.backSlatDepth, middle],
    ], ZY_X, -halfLength, halfLength);
  }
  return builder.geometry();
}

/**
 * Bench ends (≤ 48 triangles): two cast legs, each a seven-cornered plate —
 * front foot, seat bearer, a raked upright carrying the back, rear foot, and
 * an arch between the feet. The arch is the silhouette; a box leg had none.
 */
export function ultraBenchMetal(): THREE.BufferGeometry {
  const bench = PROP_SIZES.bench;
  const form = FORM.bench;
  const builder = formBuilder();
  const top = bench.seatHeight + bench.backHeight;
  const bearer = bench.seatHeight + bench.seatThickness / 2 - form.seatSlatThickness;
  const back = -bench.seatDepth / 2;
  const outline: [number, number][] = [
    [0.20, 0],
    [0.175, bearer],
    [-0.17, bearer],
    [-0.195, top],
    [back, top],
    [back + 0.005, 0],
    [-0.02, 0.26],
  ];
  for (const side of [1, -1]) {
    // Where the ordinary leg box stands, one leg-thickness in from each end.
    const centre = side * (bench.length / 2 - bench.legThickness);
    // w = −x in this frame, so the plate from x − t/2 to x + t/2 is w from −x − t/2 to −x + t/2.
    prism(builder, outline, ZY_X, -centre - form.legThickness / 2, -centre + form.legThickness / 2);
  }
  return builder.geometry();
}

/**
 * Litter bin (≤ 96 triangles): a twelve-sided tapered body, a rolled rim that
 * flares out to exactly the footprint's 0.302 m and curls back in, and a
 * mouth whose dark tone reads as the opening — a lid-shaped bin reads as a
 * bollard. Smooth round the axis, crisp between the rim's two facets. Top
 * 0.89 m exactly.
 */
export function ultraLitterBin(): THREE.BufferGeometry {
  const bin = PROP_SIZES.litterBin;
  const form = FORM.bin;
  const builder = formBuilder();
  lathe(builder, [
    { r: bin.radiusBase, y: 0 },
    { r: bin.radiusTop - 0.002, y: form.bodyTop },
    { r: (PROP_FOOTPRINTS.litterBin as { radius: number }).radius, y: form.rimWidest },
    { r: form.lipRadius, y: bin.height + bin.rimHeight },
  ], {
    segments: 12,
    smooth: true,
    capBottom: true,
    capTop: true,
    tones: [WHITE, TONES.binRim, TONES.binRim],
    topTone: TONES.binMouth,
  });
  return builder.geometry();
}

/** Sign post (≤ 32 triangles): an octagonal post with a short pyramid point, top 2.45 m exactly. */
export function ultraSignPost(): THREE.BufferGeometry {
  const sign = PROP_SIZES.signpost;
  const builder = formBuilder();
  lathe(builder, [
    { r: sign.postRadius, y: 0 },
    { r: sign.postRadius, y: FORM.sign.capBase },
    { r: 0, y: sign.postHeight },
  ], { segments: 8, phase: Math.PI / 8, capBottom: true });
  return builder.geometry();
}

/**
 * Sign fingers (≤ 40 triangles, never cast): two arrow-tipped boards, the
 * upper pointing to 1.04 m and the lower shorter, inside the 1.05 m spread.
 * An arrow is the silhouette that says "fingerpost"; the board's edge carries
 * a darker tone so it reads as a painted board with thickness.
 */
export function ultraSignPlate(): THREE.BufferGeometry {
  const sign = PROP_SIZES.signpost;
  const form = FORM.sign;
  const builder = formBuilder();
  const halfThickness = sign.plateThickness / 2;
  const finger = (centre: number, height: number, shoulder: number, tip: number): void => {
    const tail = -sign.postRadius;
    prism(builder, [
      [tail, centre - height / 2],
      [shoulder, centre - height / 2],
      [tip, centre],
      [shoulder, centre + height / 2],
      [tail, centre + height / 2],
    ], XY_Z, -halfThickness, halfThickness, WHITE, TONES.plateEdge);
  };
  finger(sign.plateCentre, sign.plateHeight, form.upperShoulder, form.upperTip);
  finger(sign.lowerCentre, sign.lowerHeight, form.lowerShoulder, form.lowerTip);
  return builder.geometry();
}
