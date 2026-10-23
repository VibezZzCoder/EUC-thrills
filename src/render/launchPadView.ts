/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 — the city launch pads, drawn (`docs/PLANS.md` §42.3a "Pad look";
 * R16, 2026-10-10: an obvious ramp, never a hole; critic repair r4: a
 * kicker's silhouette — a tall lip over a concave run, no apron).
 *
 * One `InstancedMesh` holds every pad of a world: one draw, no shadow pass,
 * 112 triangles a pad (104 without the direction cue) and 7,044 B per world
 * plus a 64 B matrix per pad. The template is a raised octagonal kicker,
 * painted in code (vertex colours, invariant 12):
 *
 * - a **light top** — pale concrete, gently crowned — whose faces touch the
 *   trigger circle (`LAUNCH_PAD.triggerRadiusMetres`, derived, never typed),
 *   `LAUNCH_PAD.domeHeightMetres` over the lawn: every launch leaves it;
 * - a **light steel coping** along its edge (`LAUNCH_PAD_LOOK.copingSlopeMetres`
 *   down the lip): the kicker's edge;
 * - a **signal-yellow concave skirt**: per side three planar facets — a steep
 *   lip, a middle and a shallow foot (`LAUNCH_PAD.domeKnees`) — from the
 *   coping down to the foot octagon (its corners on
 *   `LAUNCH_PAD.domeFootRadiusMetres`, a face on local +Z), smooth-shaded down
 *   each side so the run reads as one curve and crisp between sides, its paint
 *   darkening towards the foot (`skirtShades`) where it meets the lawn;
 * - **bold dark diagonal hazard stripes** on every side's lip facet;
 * - (q237's switch, `LAUNCH_PAD_LOOK.markerShown`, on by default) a **painted
 *   direction cue**: a bold dark arrowhead on every side's middle facet,
 *   pointing up the ramp at its lip (`LAUNCH_PAD_CUE`). The visual-quality
 *   pass of 2026-10-22 (owner-approved) replaced R14's hovering 3.4 m
 *   waypoint arrow with it: smaller, lower and part of the kicker, it reads
 *   from a riding distance of 15–20 m and adds no height at all, so it can
 *   never stand where a rider flies. It is in the same mesh — one draw, no
 *   collider, no shadow, never in the sampler or the plan — hidden and priced
 *   with the pad, and still (nothing turns or uploads per frame).
 *
 * No apron (the critic: a flat 7 m mat was two thirds of the pad's pixels and
 * read as a decal); `LAUNCH_PAD.apronRadiusMetres` stays the finder's
 * decor-free radius around the pad.
 *
 * **The top and skirt are the drawn surface a human seat rides.** Their
 * heights are `simulation/launchPadField.ts`'s `launchPadDomeRise` of the
 * octagonal distance (planar per facet, so the mesh and the formula agree
 * everywhere but the skirt's 1 cm foot); the controller rides that profile
 * rolled by its wheel (`launchPadRideRise`), so the tyre rests on the ramp
 * instead of cutting into it — never the shared sampler.
 *
 * Each instance stands at its site, turned by the site's `yaw` about +Y
 * (three's convention, so the face on local +Z faces (sin yaw, cos yaw)), on
 * the ground plane fitted under its foot and lifted by the largest residual,
 * so no ground pokes through it.
 *
 * Hidden by mode costs zero draws (`setVisible(false)`), and the pads are
 * priced either way (`countLaunchPads`). Receives shadows and casts none;
 * layers mask 1, never `ULTRA_STATIC_LAYER`; its group (`launch-pads`) joins
 * the Ultra supplement roots so Ultra re-materials it. A world without sites
 * allocates nothing and reports zeros.
 */
import * as THREE from 'three';
import { LAUNCH_PAD, LAUNCH_PAD_LOOK as LOOK } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { LaunchPadSite } from '../level/launchPadSites.ts';
import { launchPadDomeRise } from '../simulation/launchPadField.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample, type TerrainSampler } from '../simulation/world.ts';
import type { SupplementCount } from './populationPrice.ts';

export interface LaunchPadViewReport {
  /** The drawn sites' ids, in site order (what the QA bridge compares with the armed ids). */
  readonly ids: readonly string[];
  /** Whether the pads draw: the renderer's own state. */
  readonly visible: boolean;
  readonly pads: number;
  /** Installed (priced) colour draws, whether or not hidden. */
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
}

export const EMPTY_LAUNCH_PAD_REPORT: LaunchPadViewReport = Object.freeze({
  ids: Object.freeze([]), visible: false, pads: 0, drawCalls: 0, colourTriangles: 0,
  geometryBytes: 0, instanceBytes: 0,
});

export interface LaunchPadView {
  readonly group: THREE.Group;
  setVisible(visible: boolean): void;
  /**
   * Once per drawn frame (`GameRenderer.updateStreetLife`). The painted
   * direction cue is part of the kicker and never moves, so this writes
   * nothing and uploads nothing; it stays so the frame's owner keeps one call.
   */
  update(seconds: number, reducedMotion: boolean): void;
  report(): LaunchPadViewReport;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// The template, as arithmetic
// ---------------------------------------------------------------------------

/** Placement samples per ring (`launchPadPlacement`): the octagon's face midpoints and corners. */
export function launchPadRingSegments(): number {
  return LOOK.octagonSides * 2;
}

/** Bytes per vertex: position, normal and colour, three floats each. */
const VERTEX_BYTES = 3 * 3 * Float32Array.BYTES_PER_ELEMENT;
/** Bytes one instance matrix holds. */
const INSTANCE_MATRIX_BYTES = 16 * Float32Array.BYTES_PER_ELEMENT;
/** The skirt's rings down each side, from the coping's foot to the lawn: coping foot, lip knee, middle knee, foot. */
const SKIRT_RINGS = 4;
/** One hazard stripe: a parallelogram decal, four corners of its own, two triangles. */
const STRIPE_VERTICES = 4;
const STRIPE_TRIANGLES = 2;
/** The painted direction cue: one arrowhead a side, a decal triangle of its own corners. */
const CUE_VERTICES = 3;
const CUE_TRIANGLES = 1;

/**
 * The painted direction cue's shape on each side's middle facet (≈ 30°, the
 * steepest face a low chase camera sees squarely from the lawn), in the
 * facet's own frame: its apex this far down the slope from the lip's knee,
 * its length down the slope and its half-base across the face, m. 1.2 m
 * across at its base is ≈ 27 px at 20 m on the widest 720p chase lens.
 */
export const LAUNCH_PAD_CUE = Object.freeze({
  apexDownMetres: 0.05,
  lengthMetres: 0.44,
  halfBaseMetres: 0.6,
});

/**
 * What one pad template holds, derived from `LAUNCH_PAD_LOOK`: the top (an
 * apex fanned to the top octagon), the coping band (two octagons), the
 * skirt's sides (`SKIRT_RINGS` rings each, unshared between sides), the
 * hazard stripes on them and the painted direction cue when `marker` is on.
 * `render/launchPadView.test.ts` holds the built geometry to these numbers.
 */
export function launchPadTemplateCounts(marker: boolean = LOOK.markerShown): { readonly vertices: number;
  readonly triangles: number; readonly geometryBytes: number; readonly indexBytes: number } {
  const sides = LOOK.octagonSides;
  const stripes = sides * LOOK.hazardStripes;
  const vertices = 1 + sides + 2 * sides + sides * SKIRT_RINGS * 2 + stripes * STRIPE_VERTICES
    + (marker ? sides * CUE_VERTICES : 0);
  const triangles = sides + 2 * sides + sides * (SKIRT_RINGS - 1) * 2 + stripes * STRIPE_TRIANGLES
    + (marker ? sides * CUE_TRIANGLES : 0);
  const indexBytes = triangles * 3 * (vertices <= 65_536 ? 2 : 4);
  return { vertices, triangles, indexBytes, geometryBytes: vertices * VERTEX_BYTES + indexBytes };
}

/**
 * What a world's pads cost per pane: one colour draw for all of them, the
 * template's triangles per pad, the template's bytes once and a matrix per
 * pad. **Priced whether or not the mode shows them**: installed resources are
 * priced regardless of mode, which keeps recipe selection independent of it.
 * `marker` is the painted direction cue (`LAUNCH_PAD_LOOK.markerShown`).
 */
export function countLaunchPads(sites: readonly LaunchPadSite[], marker: boolean = LOOK.markerShown): SupplementCount {
  if (sites.length === 0) {
    return { colourDraws: 0, shadowDraws: 0, colourTriangles: 0, shadowTriangles: 0,
      geometryBytes: 0, instanceBytes: 0, textureBytes: 0 };
  }
  const template = launchPadTemplateCounts(marker);
  return {
    colourDraws: 1, shadowDraws: 0, colourTriangles: template.triangles * sites.length, shadowTriangles: 0,
    geometryBytes: template.geometryBytes, instanceBytes: INSTANCE_MATRIX_BYTES * sites.length, textureBytes: 0,
  };
}

/**
 * The template's heights above the fitted ground plane, m: the skirt's foot
 * (`base`), the top's edge (`top`, the ridden lip height) and the top's
 * crowned centre (`apex`), the highest thing a pad draws.
 */
export function launchPadHeights(): { readonly base: number; readonly top: number; readonly apex: number } {
  const base = LOOK.baseLiftMetres;
  const top = LAUNCH_PAD.domeHeightMetres;
  return { base, top, apex: top + LAUNCH_PAD.domeCrownMetres };
}

/** A ring of the skirt: its apothem and height over the fitted plane, m. */
export interface LaunchPadRing { readonly apothem: number; readonly height: number }

/**
 * The kicker's side profile, as rings from the top's edge down: the top's
 * edge (the trigger apothem, `domeHeightMetres`), the coping's foot
 * (`copingSlopeMetres` down the lip facet), the lip's knee, the middle knee
 * and the foot (the foot octagon's apothem, at the base lift). Every ring but
 * the foot is on `launchPadDomeRise`. `angles` are the three facets' slopes
 * from the lip down, rad; `lipLength` the lip facet's slant length, m.
 */
export function launchPadSkirt(): { readonly topApothem: number; readonly baseApothem: number; readonly run: number;
  readonly rings: readonly LaunchPadRing[]; readonly angles: readonly number[]; readonly lipLength: number } {
  const topApothem = LAUNCH_PAD.triggerRadiusMetres;
  const baseApothem = LAUNCH_PAD.domeFootRadiusMetres * Math.cos(Math.PI / LOOK.octagonSides);
  const run = baseApothem - topApothem;
  const height = LAUNCH_PAD.domeHeightMetres;
  const knots: LaunchPadRing[] = [{ apothem: topApothem, height }];
  for (const [out, share] of LAUNCH_PAD.domeKnees) knots.push({ apothem: topApothem + run * out, height: height * share });
  knots.push({ apothem: baseApothem, height: 0 });
  const angles = knots.slice(1).map((knot, k) => Math.atan2(knots[k].height - knot.height, knot.apothem - knots[k].apothem));
  const lipLength = Math.hypot(knots[1].apothem - topApothem, height - knots[1].height);
  const coping = Math.min(LOOK.copingSlopeMetres, lipLength / 2);
  const copingFoot: LaunchPadRing = { apothem: topApothem + coping * Math.cos(angles[0]),
    height: height - coping * Math.sin(angles[0]) };
  const rings: LaunchPadRing[] = [knots[0], copingFoot, knots[1], knots[2],
    { apothem: baseApothem, height: LOOK.baseLiftMetres }];
  return { topApothem, baseApothem, run, rings, angles, lipLength };
}

export interface LaunchPadTemplate {
  readonly positions: Float32Array;
  /** Linear RGB per vertex (three reads the `color` attribute as linear). */
  readonly colours: Float32Array;
  readonly indices: Uint16Array;
  /** The first direction-cue vertex (the vertex count without the cue): the cue is the template's tail. */
  readonly markerFirst: number;
}

/**
 * The pad template in its own frame (origin on the fitted ground plane at the
 * centre, +Y up, a face midpoint on +Z), as plain arrays, with the painted
 * direction cue when `marker` is on. Pure.
 */
export function launchPadTemplate(marker: boolean = LOOK.markerShown): LaunchPadTemplate {
  const sides = LOOK.octagonSides;
  const counts = launchPadTemplateCounts(marker);
  const heights = launchPadHeights();
  const skirt = launchPadSkirt();
  const positions = new Float32Array(counts.vertices * 3);
  const colours = new Float32Array(counts.vertices * 3);
  const indices = new Uint16Array(counts.triangles * 3);
  const paint = (hex: number, shade = 1): readonly [number, number, number] => {
    const colour = new THREE.Color(hex);
    return [colour.r * shade, colour.g * shade, colour.b * shade];
  };
  const topPaint = paint(LOOK.topColour);
  const ink = paint(LOOK.inkColour), copingPaint = paint(LOOK.copingColour);
  let vertex = 0, index = 0;
  const put = (x: number, y: number, z: number, colour: readonly [number, number, number]): number => {
    positions.set([x, y, z], vertex * 3);
    colours.set(colour, vertex * 3);
    return vertex++;
  };
  /** Wind (a, b, c) so its face looks along `n` (every pad face looks at the sky, and the skirt's out too). */
  const facing = (a: number, b: number, c: number, n: readonly [number, number, number]): void => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
    const vx = positions[c * 3] - ax, vy = positions[c * 3 + 1] - ay, vz = positions[c * 3 + 2] - az;
    const along = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (along >= 0) { indices[index++] = a; indices[index++] = b; indices[index++] = c; }
    else { indices[index++] = a; indices[index++] = c; indices[index++] = b; }
  };
  const quad = (a: number, b: number, c: number, d: number, n: readonly [number, number, number]): void => {
    facing(a, b, c, n);
    facing(a, c, d, n);
  };
  const upward = [0, 1, 0] as const;
  /** Corner `j` of an octagon of apothem `apothem`: between faces j and j + 1, at bearing (j + ½)·45°. */
  const cornerAt = (j: number, apothem: number): readonly [number, number] => {
    const angle = ((j + 0.5) * Math.PI * 2) / sides;
    const r = apothem / Math.cos(Math.PI / sides);
    return [Math.sin(angle) * r, Math.cos(angle) * r];
  };
  /** An octagon's corners at a ring, in bearing order; returns the first. */
  const octagon = (ring: LaunchPadRing, colour: readonly [number, number, number]): number => {
    const first = vertex;
    for (let j = 0; j < sides; j += 1) {
      const [x, z] = cornerAt(j, ring.apothem);
      put(x, ring.height, z, colour);
    }
    return first;
  };
  /** Face `face`'s outward-and-up unit normal on a facet of slope `angle`. */
  const faceNormal = (face: number, angle: number): readonly [number, number, number] => {
    const bearing = (face * Math.PI * 2) / sides;
    return [Math.sin(bearing) * Math.sin(angle), Math.cos(angle), Math.cos(bearing) * Math.sin(angle)];
  };
  const [edge, copingFoot] = skirt.rings;
  const lipAngle = skirt.angles[0];

  // The light top: its crowned centre fanned to the top octagon, whose faces touch the trigger circle.
  const apex = put(0, heights.apex, 0, topPaint);
  const topRing = octagon(edge, topPaint);
  for (let j = 0; j < sides; j += 1) facing(apex, topRing + j, topRing + (j + 1) % sides, upward);
  // The coping: a light band from the top's edge down the lip, all the way round.
  const copingTop = octagon(edge, copingPaint);
  const copingBottom = octagon(copingFoot, copingPaint);
  for (let face = 0; face < sides; face += 1) {
    const a = (face + sides - 1) % sides, b = face;
    quad(copingTop + a, copingBottom + a, copingBottom + b, copingTop + b, faceNormal(face, lipAngle));
  }
  // The yellow skirt: per side, the coping's foot down the lip, the middle and
  // the foot facet — shared down the side (one smooth curve), apart between
  // sides (crisp corners) — darkening towards the lawn.
  const skirtRings = skirt.rings.slice(1);
  for (let face = 0; face < sides; face += 1) {
    // Face `face` (bearing face·45°) lies between corners face − 1 and face.
    const a = (face + sides - 1) % sides, b = face;
    const first = vertex;
    skirtRings.forEach((ring, k) => {
      const colour = paint(LOOK.rimColour, LOOK.skirtShades[k]);
      const [xa, za] = cornerAt(a, ring.apothem), [xb, zb] = cornerAt(b, ring.apothem);
      put(xa, ring.height, za, colour);
      put(xb, ring.height, zb, colour);
    });
    for (let k = 0; k < SKIRT_RINGS - 1; k += 1) {
      const upper = first + k * 2, lower = upper + 2;
      // The facet's slope: the coping's foot and the lip knee are on the lip facet.
      quad(upper, lower, lower + 1, upper + 1, faceNormal(face, skirt.angles[k]));
    }
  }
  // Bold hazard stripes on each side's lip facet, between the coping's foot and
  // the lip's knee: parallelograms leaning along the lip, laid in the facet's
  // own frame (u across it, s down the slope) and lifted off it along its normal.
  const band = skirt.lipLength - Math.hypot(copingFoot.apothem - edge.apothem, edge.height - copingFoot.height);
  const cosLip = Math.cos(lipAngle), sinLip = Math.sin(lipAngle), lift = LOOK.decalLiftMetres;
  const width = LOOK.hazardStripeWidthMetres, lean = LOOK.hazardStripeLeanMetres;
  for (let face = 0; face < sides; face += 1) {
    const bearing = (face * Math.PI * 2) / sides;
    const nx = Math.sin(bearing), nz = Math.cos(bearing);
    const at = (u: number, s: number): number => {
      const v = copingFoot.apothem + s * cosLip + lift * sinLip;
      return put(nx * v + nz * u, copingFoot.height - s * sinLip + lift * cosLip, nz * v - nx * u, ink);
    };
    for (let stripe = 0; stripe < LOOK.hazardStripes; stripe += 1) {
      const centre = (stripe - (LOOK.hazardStripes - 1) / 2) * LOOK.hazardStripePitchMetres;
      const foot = centre - (width + lean) / 2;
      quad(at(foot + lean, 0), at(foot, band), at(foot + width, band), at(foot + lean + width, 0), faceNormal(face, lipAngle));
    }
  }
  const markerFirst = vertex;
  if (marker) {
    // The direction cue: a dark arrowhead on each side's middle facet (the lip's
    // knee down to the middle knee), its apex up the slope on the face's centre
    // line and its base across the face, lifted off the facet like the stripes.
    const lipKnee = skirt.rings[2], middleAngle = skirt.angles[1];
    const cosMiddle = Math.cos(middleAngle), sinMiddle = Math.sin(middleAngle);
    for (let face = 0; face < sides; face += 1) {
      const bearing = (face * Math.PI * 2) / sides;
      const nx = Math.sin(bearing), nz = Math.cos(bearing);
      const at = (u: number, s: number): number => {
        const v = lipKnee.apothem + s * cosMiddle + lift * sinMiddle;
        return put(nx * v + nz * u, lipKnee.height - s * sinMiddle + lift * cosMiddle, nz * v - nx * u, ink);
      };
      const apexAt = LAUNCH_PAD_CUE.apexDownMetres, baseAt = apexAt + LAUNCH_PAD_CUE.lengthMetres;
      facing(at(0, apexAt), at(-LAUNCH_PAD_CUE.halfBaseMetres, baseAt), at(LAUNCH_PAD_CUE.halfBaseMetres, baseAt),
        faceNormal(face, middleAngle));
    }
  }
  if (vertex !== counts.vertices || index !== counts.triangles * 3) {
    throw new Error(`Launch pad template built ${vertex} vertices / ${index / 3} triangles, priced ${counts.vertices} / ${counts.triangles}`);
  }
  return { positions, colours, indices, markerFirst };
}

/** The drawn dome's height over the fitted plane at a template-frame point (the mesh's own formula). */
export function launchPadDrawnRise(x: number, z: number): number {
  const skirt = launchPadSkirt();
  const ax = Math.abs(x), az = Math.abs(z);
  const p = Math.max(ax, az, (ax + az) * Math.SQRT1_2);
  return launchPadDomeRise(p, skirt.topApothem, skirt.baseApothem);
}


// ---------------------------------------------------------------------------
// Placement on the lawn
// ---------------------------------------------------------------------------

export interface LaunchPadPlacement {
  /** The template origin, world metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The fitted ground plane's unit normal. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly yaw: number;
  /** Largest ground height above the fitted plane under the pad, m (≥ 0): how far the pad was raised. */
  readonly raise: number;
  /** Largest gap between the fitted plane and the ground below it, m (≥ 0): how far any edge floats beyond the base lift. */
  readonly float: number;
}

/**
 * Where a site's template stands: the least-squares ground plane under its
 * foot (rings at the centre, half and full trigger, footprint, between it and
 * the foot, and the foot's corners, every segment), raised by the largest
 * residual so the ground never pokes through, at the site's (x, z) and yaw.
 * Pure.
 */
export function launchPadPlacement(sampler: TerrainSampler, site: LaunchPadSite): LaunchPadPlacement {
  const segments = launchPadRingSegments();
  const radii = [0, LAUNCH_PAD.triggerRadiusMetres / 2, LAUNCH_PAD.triggerRadiusMetres, LAUNCH_PAD.footprintRadiusMetres,
    (LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.domeFootRadiusMetres) / 2, LAUNCH_PAD.domeFootRadiusMetres];
  const sample = createGroundSample();
  const points: { dx: number; dz: number; h: number }[] = [];
  for (const radius of radii) {
    for (let k = 0; k < (radius === 0 ? 1 : segments); k += 1) {
      const angle = (k * Math.PI * 2) / segments;
      const dx = Math.sin(angle) * radius, dz = Math.cos(angle) * radius;
      sampler.sampleGround(site.x + dx, site.z + dz, sample);
      points.push({ dx, dz, h: sample.height });
    }
  }
  // h ≈ a + b·dx + c·dz by least squares; the rings are symmetric, so the
  // normal equations are diagonal.
  let sum = 0, sx = 0, sz = 0, sxx = 0, szz = 0;
  for (const point of points) {
    sum += point.h; sx += point.h * point.dx; sz += point.h * point.dz;
    sxx += point.dx * point.dx; szz += point.dz * point.dz;
  }
  const a = sum / points.length, b = sxx > 0 ? sx / sxx : 0, c = szz > 0 ? sz / szz : 0;
  let raise = 0, float = 0;
  for (const point of points) {
    const residual = point.h - (a + b * point.dx + c * point.dz);
    raise = Math.max(raise, residual);
    float = Math.max(float, -residual);
  }
  const length = Math.hypot(b, 1, c);
  return { x: site.x, y: a + raise, z: site.z, nx: -b / length, ny: 1 / length, nz: -c / length, yaw: site.yaw,
    raise, float: float + raise };
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * Build a world's pads from its sites (`cityLaunchPads`, never re-derived
 * here); `marker` is the painted direction cue, priced by `countLaunchPads`
 * with the same flag.
 */
export function createLaunchPadView(plan: LevelPlan, sites: readonly LaunchPadSite[],
  marker: boolean = LOOK.markerShown): LaunchPadView {
  const group = new THREE.Group();
  group.name = 'launch-pads';
  const ids: readonly string[] = Object.freeze(sites.map((site) => site.id));
  let disposed = false;
  if (sites.length === 0) {
    // Nothing allocated: no geometry, no material, no mesh.
    return {
      group,
      setVisible(visible) { group.visible = visible; },
      update() { /* no pads, no marker */ },
      report: () => ({ ...EMPTY_LAUNCH_PAD_REPORT, ids, visible: group.visible }),
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
      },
    };
  }

  const template = launchPadTemplate(marker);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(template.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(template.colours, 3));
  geometry.setIndex(new THREE.BufferAttribute(template.indices, 1));
  // Decals (stripes and the cue) own their corners, so they take their facet's normal.
  geometry.computeVertexNormals();
  // The colour attribute only reaches the shader with `vertexColors` (the
  // LESSONS `instanceColor` trap); both are asserted in the test.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: LOOK.roughness, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geometry, material, sites.length);
  mesh.name = 'launch-pad-instances';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;

  const sampler = new PlanTerrainSampler(plan);
  const matrix = new THREE.Matrix4(), tilt = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const position = new THREE.Vector3(), normal = new THREE.Vector3(), unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  sites.forEach((site, index) => {
    const placed = launchPadPlacement(sampler, site);
    tilt.setFromUnitVectors(up, normal.set(placed.nx, placed.ny, placed.nz));
    turn.setFromAxisAngle(up, placed.yaw);
    matrix.compose(position.set(placed.x, placed.y, placed.z), tilt.multiply(turn), unit);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  // Once: the pads never move, so three never rescans the instances.
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  group.add(mesh);

  const geometryBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
  const colourTriangles = (template.indices.length / 3) * sites.length;
  return {
    group,
    setVisible(visible) { group.visible = visible; },
    update() { /* the cue is paint on the kicker: nothing turns, nothing uploads */ },
    report: () => ({ ids, visible: group.visible, pads: sites.length, drawCalls: 1, colourTriangles,
      geometryBytes, instanceBytes: mesh.instanceMatrix.array.byteLength }),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
