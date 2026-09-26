/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ultra foliage forms (T3) — M39 (`docs/M39_ULTRA.md` §4, package W3).
 *
 * U0 measured the canopy as the frame's largest dark mass: shaded broadleaf
 * crowns at 25–30 luma with 80 % of their pixels under 32 (defect D1). The
 * lighting package lifts the value; this file gives the value something to
 * describe. At chase-camera distance a tree reads by its *outline* and by
 * the *shade structure inside it*, and the enhanced crown — one lobed
 * icosphere — has a good outline and no inside. So:
 *
 * - **Crown (80 → 400):** five lobe clusters, each an icosphere(1,1) sculpted
 *   through `foliageKit.sculptSphere` with its own swellings and hollows,
 *   merged and fitted **uniformly** into `CROWN_ENVELOPE`. The notches where
 *   clusters meet are real geometry: they catch shade, and the chromatic
 *   tones below put cool hollows in them and warm lit tips on the swellings.
 *   Faceting is kept (the normals are softened half way to each cluster's
 *   own centre, not smoothed into a balloon).
 * - **Conifer (48 → 216):** six turned tiers of nine serrated teeth each, an
 *   18-vertex rim whose tips droop below its notches, leant apexes, and dark,
 *   nearly flat undersides — the "stacked traffic cones" of the baseline
 *   become a spruce. The stack keeps its 0.25 m burial and its 7.9 m top to
 *   the millimetre, and no tooth leaves the 2.2 m footprint. Each tier shades
 *   as a smooth cone with a trace of its facets, so the teeth read in the
 *   outline rather than as light/dark stripes that crawl in motion.
 * - **Shrub (20 → 80):** the shaped shrub's own lobes on an icosphere(1,1),
 *   seated as a mound that grows out of the turf, axis-fitted into
 *   `SHRUB_ENVELOPE` about its base and clamped into its footprint circle,
 *   with a darker foot. `shapedShrub` itself is untouched.
 * - **Trunk (24 → 52):** eight sides with a root flare to the 0.30 m
 *   footprint, and two branch stubs that leave the trunk under the canopy and
 *   end inside the crown — so the crown sits on a tree rather than on a pole.
 *
 * **Tones (§4).** Every corner carries a colour between a *hollow* tone
 * (cooler, darker) and a *lit tip* tone (warmer, lighter), chosen from where
 * it sits — facing up and out, on a swelling, versus under the crown or in a
 * notch between clusters — then normalised **per channel** to a corner mean of
 * exactly 1.0, so the instance tint (and so the authored foliage albedo) is
 * still what the tree averages to. The tones are `ULTRA.forms`'.
 *
 * Deterministic throughout: the sculpt jitter is `foliageKit`'s, keyed on this
 * file's own salts (13 and 29 — neither used by the enhanced shapes' 11, 17
 * and 23), and everything else is an integer hash (`formHash01`) on the
 * remaining Ultra salts. No `Math.random`.
 */
import * as THREE from 'three';
import { PROP_FOOTPRINTS, PROP_SIZES, PROP_SPREADS } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import {
  CONIFER_ENVELOPE,
  CROWN_ENVELOPE,
  CROWN_LOBES,
  SHRUB_ENVELOPE,
  SHRUB_LOBES,
  fitInto,
  nonIndexed,
  sculptSphere,
  softenNormals,
  type Envelope,
  type Lobe,
} from '../foliageKit.ts';
import { formBuilder, lathe, type FormBuilder, type Tone, type Vec3 } from './ultraFurniture.ts';

/**
 * The Ultra foliage salts, all from `ULTRA.forms.salts` (§4: 3, 5, 7, 9 and
 * 11 are the ordinary kit's). `crown` and `shrub` key `foliageKit`'s sculpt
 * jitter; `conifer` and `trunk` key `formHash01`.
 */
export const ULTRA_FOLIAGE_SALTS = Object.freeze({
  crown: ULTRA.forms.salts[0],
  conifer: ULTRA.forms.salts[2],
  shrub: ULTRA.forms.salts[4],
  trunk: ULTRA.forms.salts[5],
});

/**
 * A deterministic value in [0, 1) from two integers and a salt — the
 * `Math.imul` finaliser `facadeAtlas.ts` uses, restated here because that
 * file imports nothing and exports none of its internals.
 */
export function formHash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Mix a hollow tone towards a tip tone by `t` in [0, 1]. */
function mixTone(hollow: readonly number[], tip: readonly number[], t: number): Tone {
  const k = Math.min(1, Math.max(0, t));
  return [
    hollow[0] + (tip[0] - hollow[0]) * k,
    hollow[1] + (tip[1] - hollow[1]) * k,
    hollow[2] + (tip[2] - hollow[2]) * k,
  ];
}

function subVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossVec(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unitVec(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** `share` of the facet normal `face`, the rest the smooth normal `smooth`, renormalised. */
function blendNormal(face: Vec3, smooth: Vec3, share: number): Vec3 {
  return unitVec([
    face[0] * share + smooth[0] * (1 - share),
    face[1] * share + smooth[1] * (1 - share),
    face[2] * share + smooth[2] * (1 - share),
  ]);
}

/** A box no sculpt reaches, so `sculptSphere`'s own fit is a no-op and the merged crown is fitted once. */
const OPEN: Envelope = Object.freeze({ min: [-1e6, -1e6, -1e6] as const, max: [1e6, 1e6, 1e6] as const });

// ---------------------------------------------------------------------------
// Crown
// ---------------------------------------------------------------------------

interface Cluster {
  readonly centre: Vec3;
  readonly radii: Vec3;
  readonly lobes: readonly Lobe[];
  /** Euler turn of the unit icosphere before sculpting, so no two clusters share a facet pattern. */
  readonly turn: Vec3;
}

/**
 * The five clusters, before the uniform fit: a core that swallows the trunk
 * top, a crown cluster high and to one side, and three satellites at three
 * heights on three sides — so the outline is asymmetric from every side the
 * chase camera sees, and a notch opens wherever two meet. Satellite swellings
 * point away from the core, so they widen the silhouette rather than filling
 * the notches.
 */
const CROWN_CLUSTERS: readonly Cluster[] = Object.freeze([
  { centre: [0.05, 4.55, 0], radii: [1.72, 1.75, 1.6], lobes: CROWN_LOBES, turn: [0, 0, 0] },
  {
    centre: [-0.3, 6.0, 0.15], radii: [1.28, 1.1, 1.2], turn: [0.4, 1.1, 0.2],
    lobes: [
      { direction: [-0.4, 0.9, 0.2], amplitude: 0.22, sigma: 0.7 },
      { direction: [0.5, 0.7, -0.4], amplitude: 0.16, sigma: 0.6 },
      { direction: [0.2, -0.8, 0.5], amplitude: -0.15, sigma: 0.6 },
    ],
  },
  {
    centre: [1.15, 4.3, -0.35], radii: [1.1, 1.0, 1.05], turn: [1.2, 0.3, 0.7],
    lobes: [
      { direction: [0.9, 0.3, -0.3], amplitude: 0.2, sigma: 0.65 },
      { direction: [0.6, 0.6, 0.5], amplitude: 0.15, sigma: 0.55 },
      { direction: [0.3, -0.9, 0], amplitude: -0.15, sigma: 0.6 },
    ],
  },
  {
    centre: [-1.18, 4.75, -0.45], radii: [1.05, 1.05, 1.0], turn: [0.7, 2.1, 1.3],
    lobes: [
      { direction: [-0.9, 0.4, -0.2], amplitude: 0.22, sigma: 0.65 },
      { direction: [-0.5, 0.5, -0.7], amplitude: 0.14, sigma: 0.55 },
      { direction: [-0.2, -0.9, 0.3], amplitude: -0.12, sigma: 0.6 },
    ],
  },
  {
    centre: [-0.1, 4.15, 1.05], radii: [1.05, 0.95, 1.0], turn: [2.0, 0.9, 0.4],
    lobes: [
      { direction: [0.1, 0.4, 0.9], amplitude: 0.2, sigma: 0.65 },
      { direction: [-0.6, 0.3, 0.7], amplitude: 0.14, sigma: 0.55 },
      { direction: [0.4, -0.8, 0.4], amplitude: -0.14, sigma: 0.6 },
    ],
  },
] as Cluster[]);

/** The sculpt's soft floor before the fit, and the point the uniform fit scales about. */
const CROWN_FLOOR = 3.0;
const CROWN_FIT_CENTRE: Vec3 = [0, 4.4, 0];

/**
 * The broadleaf crown: 400 faces in five clusters (`ULTRA.forms.crown`),
 * fitted uniformly into the baseline crown's box, its floor under the 3.1 m
 * trunk top.
 */
export function ultraCrown(): THREE.BufferGeometry {
  const form = ULTRA.forms.crown;
  const clusters = CROWN_CLUSTERS.slice(0, form.lobeClusters);
  const positions: number[] = [];
  const normals: number[] = [];
  const reach: number[] = [];
  const owner: number[] = [];

  clusters.forEach((cluster, index) => {
    const geometry = nonIndexed(new THREE.IcosahedronGeometry(1, 1));
    geometry.rotateX(cluster.turn[0]);
    geometry.rotateY(cluster.turn[1]);
    geometry.rotateZ(cluster.turn[2]);
    const displaced = sculptSphere(
      geometry, cluster.centre, cluster.radii, cluster.lobes, CROWN_FLOOR, OPEN, ULTRA_FOLIAGE_SALTS.crown, 'uniform',
    );
    softenNormals(geometry, cluster.centre, form.soften);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      reach.push(displaced[i]);
      owner.push(index);
    }
    geometry.dispose();
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // One uniform fit for the whole crown: proportions as sculpted, box as authored.
  fitInto(merged, CROWN_FIT_CENTRE, CROWN_ENVELOPE, 'uniform');
  const fitted = merged.getAttribute('position');
  // And the spread circle the building guard reads (`PROP_SPREADS`): a box fit
  // leaves its corners free, and a crown's corner is what grazes a wall. The
  // fit centre stands on the prop's axis, so a uniform scale about it is a
  // radial one in plan.
  const spread = (PROP_SPREADS.broadleafTree as { radius: number }).radius;
  let widest = 0;
  for (let i = 0; i < fitted.count; i += 1) widest = Math.max(widest, Math.hypot(fitted.getX(i), fitted.getZ(i)));
  if (widest > spread) {
    const k = spread / widest;
    for (let i = 0; i < fitted.count; i += 1) {
      fitted.setXYZ(
        i,
        CROWN_FIT_CENTRE[0] + (fitted.getX(i) - CROWN_FIT_CENTRE[0]) * k,
        CROWN_FIT_CENTRE[1] + (fitted.getY(i) - CROWN_FIT_CENTRE[1]) * k,
        CROWN_FIT_CENTRE[2] + (fitted.getZ(i) - CROWN_FIT_CENTRE[2]) * k,
      );
    }
  }

  // Where each cluster's centre and mean radius landed after the fit, to tell
  // a corner in a notch (close to another cluster's mass) from one on a tip.
  let scale = 1;
  for (let i = 0; i < fitted.count; i += 1) {
    const before = positions[i * 3 + 1] - CROWN_FIT_CENTRE[1];
    if (Math.abs(before) > 0.5) {
      scale = (fitted.getY(i) - CROWN_FIT_CENTRE[1]) / before;
      break;
    }
  }
  const centres = clusters.map((cluster) => cluster.centre.map((value, axis) => (
    CROWN_FIT_CENTRE[axis] + (value - CROWN_FIT_CENTRE[axis]) * scale
  )));
  const radii = clusters.map((cluster) => ((cluster.radii[0] + cluster.radii[1] + cluster.radii[2]) / 3) * scale);
  let cx = 0; let cy = 0; let cz = 0;
  for (let i = 0; i < fitted.count; i += 1) { cx += fitted.getX(i); cy += fitted.getY(i); cz += fitted.getZ(i); }
  cx /= fitted.count; cy /= fitted.count; cz /= fitted.count;

  const builder = formBuilder();
  const corner = (i: number): Vec3 => [fitted.getX(i), fitted.getY(i), fitted.getZ(i)];
  const normalAt = (i: number): Vec3 => [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
  const toneAt = (i: number): Tone => {
    const p = corner(i);
    const n = normalAt(i);
    const ox = p[0] - cx; const oy = p[1] - cy; const oz = p[2] - cz;
    const length = Math.hypot(ox, oy, oz) || 1;
    const outward = (n[0] * ox + n[1] * oy + n[2] * oz) / length;
    let notch = 0;
    centres.forEach((centre, index) => {
      if (index === owner[i]) return;
      const d = Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]) / radii[index];
      notch = Math.max(notch, Math.min(1, Math.max(0, (1.3 - d) / 0.45)));
    });
    const t = 0.5 + 0.3 * n[1] + 0.22 * outward + 0.9 * reach[i] - 0.7 * notch;
    return mixTone(form.hollowTone, form.tipTone, t);
  };
  for (let i = 0; i < fitted.count; i += 3) {
    builder.tri(corner(i), corner(i + 1), corner(i + 2),
      [toneAt(i), toneAt(i + 1), toneAt(i + 2)],
      [normalAt(i), normalAt(i + 1), normalAt(i + 2)]);
  }
  merged.dispose();
  return builder.geometry();
}

// ---------------------------------------------------------------------------
// Conifer
// ---------------------------------------------------------------------------

/**
 * Six tiers, widest first: `radius` is the tooth tips' radius, `base` the
 * notch height, `apex` the leant point's height, `droop` how far a tip hangs
 * below its notches. Tier 0's tips sit exactly on the 0.25 m burial and tier
 * 5's point is exactly the 7.9 m top; each tier's skirt covers the tier
 * below's cone at that height, so no daylight shows between them.
 *
 * **Wave 3 (R-F, gauntlet round 1 item 5).** The droops were 0.30–0.18 m
 * with a 0.75–1.0 hashed share, and the notches 0.74 of the tips: a skirt of
 * deep, irregular teeth whose sawtooth shadow line and alternating facets
 * crawled in motion (shimmer 1.24 vegetated, 1.93 Switchback) and whose
 * self-shadow read blotchy. They are now 0.20–0.13 m (tier 0 still reaches
 * the burial exactly, from notches at ground level) with a 0.85–1.0 share,
 * the notches 0.84 of the tips and the undersides nearly flat: every tooth
 * and every droop still clears §4's pixel rule (`CONIFER_MIN_TOOTH`, about
 * 3 px at 30 m) and the six turned, leant, serrated tiers still out-draw the
 * enhanced four-tier stack.
 */
export const ULTRA_CONIFER_TIERS: readonly {
  readonly radius: number;
  readonly base: number;
  readonly apex: number;
  readonly droop: number;
  readonly lean: readonly [number, number];
}[] = Object.freeze([
  { radius: 2.20, base: 0.00, apex: 2.85, droop: 0.25, lean: [0.05, -0.03] },
  { radius: 1.92, base: 1.20, apex: 3.85, droop: 0.20, lean: [-0.08, 0.06] },
  { radius: 1.62, base: 2.30, apex: 4.85, droop: 0.18, lean: [0.07, 0.07] },
  { radius: 1.32, base: 3.40, apex: 5.85, droop: 0.16, lean: [-0.05, -0.08] },
  { radius: 1.02, base: 4.45, apex: 6.85, droop: 0.14, lean: [0.08, -0.04] },
  { radius: 0.70, base: 5.50, apex: 7.90, droop: 0.13, lean: [-0.06, 0.05] },
]);

/** A notch's radius as a share of its tier's tips: the serration's depth. */
export const CONIFER_NOTCH = 0.84;
/**
 * The shallowest tooth or droop any tier may draw, metres: §4's pixel rule,
 * about 3 px at 30 m with f ≈ 852 px.
 */
export const CONIFER_MIN_TOOTH = 0.11;
/** How far a skirt's underside rises into its tier above the notches, metres: nearly flat. */
const CONIFER_SKIRT_RISE = 0.05;
/**
 * How much of each side face's own facet normal survives in its shading
 * normal; the rest is the smooth cone's normal at that corner's azimuth. At
 * 1 (the U1 form) the 18 faces of a tier alternated light and dark tooth by
 * tooth — the stripes that flickered as a tree slid across the screen. A
 * quarter keeps a trace of faceting and leaves the teeth to the silhouette
 * and the tones.
 */
const CONIFER_FACET = 0.25;

/**
 * The conifer: `ULTRA.forms.conifer`'s six tiers × nine teeth, 216 faces.
 * Each tier is a closed serrated cone — eighteen side faces to its leant
 * apex and eighteen underside faces to a point on its axis — turned against
 * the tier below by a hashed azimuth.
 */
export function ultraConifer(): THREE.BufferGeometry {
  const form = ULTRA.forms.conifer;
  const footprint = (PROP_FOOTPRINTS.conifer as { radius: number }).radius;
  const top = CONIFER_ENVELOPE.max[1];
  const bottom = CONIFER_ENVELOPE.min[1];
  const builder = formBuilder();
  const salt = ULTRA_FOLIAGE_SALTS.conifer;
  const rimCount = form.rimVertices;
  const tiers = ULTRA_CONIFER_TIERS.slice(0, form.tiers);

  tiers.forEach((tier, index) => {
    const turn = formHash01(index, 1, salt) * Math.PI * 2;
    const apexY = index === tiers.length - 1 ? top : Math.min(top, tier.apex);
    const apex: Vec3 = [tier.lean[0], apexY, tier.lean[1]];
    const rim: Vec3[] = [];
    const azimuths: number[] = [];
    // Inward only, so the widest tier never leaves the footprint.
    const tipRadius = (i: number): number => Math.min(footprint, tier.radius * (1 - 0.08 * formHash01(index * 64 + i, 2, salt)));
    // A notch sits a tooth's depth inside the smaller of the two tips beside
    // it, and never less than §4's pixel rule deep, so the hashed tips cannot
    // shave a tooth on the smallest tiers down to a sub-pixel sliver.
    const toothDepth = Math.max(tier.radius * (1 - CONIFER_NOTCH), CONIFER_MIN_TOOTH);
    for (let i = 0; i < rimCount; i += 1) {
      const angle = turn + (i / rimCount) * Math.PI * 2;
      const tooth = i % 2 === 0;
      const radius = tooth
        ? tipRadius(i)
        : Math.min(tipRadius(i - 1), tipRadius((i + 1) % rimCount)) - toothDepth;
      // Tier 0's teeth sit exactly on the burial line; the others droop by a
      // hashed share of their tier's droop.
      const hang = index === 0 ? tier.droop : tier.droop * (0.85 + 0.15 * formHash01(index * 64 + i, 3, salt));
      const y = tooth ? Math.max(bottom, tier.base - hang) : tier.base;
      rim.push([Math.cos(angle) * radius, y, -Math.sin(angle) * radius]);
      azimuths.push(angle);
    }
    const under: Vec3 = [0, tier.base + CONIFER_SKIRT_RISE, 0];
    const rise = apexY - tier.base;
    const skirtDrop = tier.droop + CONIFER_SKIRT_RISE;
    /** The smooth cone's outward normal at azimuth `angle` (side), or the flat skirt's (under). */
    const coneNormal = (angle: number): Vec3 => unitVec([Math.cos(angle) * rise, tier.radius, -Math.sin(angle) * rise]);
    const skirtNormal = (angle: number): Vec3 => unitVec([-Math.cos(angle) * skirtDrop, -tier.radius, Math.sin(angle) * skirtDrop]);
    const height = index / Math.max(1, tiers.length - 1);
    // Tip against notch was 0.9 against 0.45 of the way to the tip tone: a
    // light/dark stripe every tooth. Half that step keeps the notches reading
    // as recesses without the stripes.
    const tip = mixTone(form.skirtTone, form.tipTone, 0.84 + 0.1 * height);
    const notch = mixTone(form.skirtTone, form.tipTone, 0.6 + 0.1 * height);
    const crest = mixTone(form.skirtTone, form.tipTone, 0.66 + 0.16 * height);
    const skirt = mixTone(form.skirtTone, form.tipTone, 0);
    for (let i = 0; i < rimCount; i += 1) {
      const a = rim[i];
      const b = rim[(i + 1) % rimCount];
      const toneA = i % 2 === 0 ? tip : notch;
      const toneB = i % 2 === 0 ? notch : tip;
      const middle = azimuths[i] + Math.PI / rimCount;
      // Rim counter-clockwise from above, so (b − a) × (apex − a) faces out.
      const face = unitVec(crossVec(subVec(b, a), subVec(apex, a)));
      const side = (angle: number): Vec3 => blendNormal(face, coneNormal(angle), CONIFER_FACET);
      builder.tri(a, b, apex, [toneA, toneB, crest], [side(azimuths[i]), side(azimuths[i] + (Math.PI * 2) / rimCount), side(middle)]);
      builder.tri(b, a, under, skirt, [skirtNormal(azimuths[i] + (Math.PI * 2) / rimCount), skirtNormal(azimuths[i]), skirtNormal(middle)]);
    }
  });

  const geometry = builder.geometry();
  // A no-op by construction, kept as the guard `foliageKit` applies to every
  // enhanced shape: the stack is axis-fitted into the baseline stack's box.
  fitInto(geometry, [0, (bottom + top) / 2, 0], CONIFER_ENVELOPE, 'axis');
  return geometry;
}

// ---------------------------------------------------------------------------
// Shrub
// ---------------------------------------------------------------------------

/**
 * The shrub's seat (Wave 3, R-F; gauntlet round 1 item 11, "pale, weakly
 * grounded shrubs"). The U1 shrub was the shaped shrub's ball: its widest
 * girth 0.54 m up and its underside tucking in to a point at the turf, so
 * from the chase camera it rested *on* the grass, its lit lower half the
 * same value as its top. Now the ellipsoid sits lower and taller, its buried
 * cap is pressed into a flat disc just under the turf, and the fit scales it
 * about that base — so its girth is lower and it meets the ground wider,
 * growing out of the turf rather than lying on it. The lowest visible band
 * carries a baked occlusion (`baseShade` at the turf line, eased out by
 * `baseBand`) and facing down pulls harder to the hollow tone: contact AO
 * (T5) darkens the turf round a shrub, never the shrub's own foot, and in
 * shade nothing else would. The top keeps the 1.36 m the envelope allows
 * and the lobes keep it a bush, not a stone.
 */
const SHRUB_SEAT = Object.freeze({
  /** The ellipsoid's centre before the fit, metres (the U1 shrub: 0.54). */
  centreY: 0.46,
  /** Vertical radius as a share of the placed bush's (the U1 shrub: 1.08). */
  heightShare: 1.2,
  /** The flat buried base: everything under it is pressed toward it. */
  baseY: -0.06,
  /** How much of its depth under `baseY` a corner keeps. */
  basePress: 0.15,
  /**
   * Occlusion multiplier at the turf line, and the height it eases out by,
   * metres. The U1 foot rendered at the grass's own value (both about 83
   * luma on the shaded-contact view), so nothing drew the line where bush
   * meets turf; 0.52 over a 0.45 m band draws it at about 0.5 of the lit
   * body without crushing it (High's crushed foot is 17).
   */
  baseShade: 0.52,
  baseBand: 0.45,
  /** How strongly facing down pulls a corner to the hollow tone (the U1 shrub: 0.35). */
  facing: 0.45,
});

/**
 * The shrub: the shaped shrub's lobes on an icosphere(1,1) — 80 faces —
 * seated as a mound (`SHRUB_SEAT`), axis-fitted into `SHRUB_ENVELOPE` about
 * its base, then pulled into its footprint circle (an axis fit fills the
 * box's corners, and the placement guard reads a circle), with the crown's
 * chromatic tones and a darker foot.
 */
export function ultraShrub(): THREE.BufferGeometry {
  const bush = PROP_SIZES.shrub;
  const seat = SHRUB_SEAT;
  const footprint = (PROP_FOOTPRINTS.shrub as { radius: number }).radius;
  const geometry = nonIndexed(new THREE.IcosahedronGeometry(1, 1));
  geometry.rotateX(0.65);
  geometry.rotateY(0.40);
  const centre: Vec3 = [0, seat.centreY, 0];
  const radii: Vec3 = [
    bush.radius * bush.scaleX * 0.96,
    bush.radius * bush.scaleY * seat.heightShare,
    bush.radius * bush.scaleZ * 0.96,
  ];
  // No soft floor and no fit inside the sculpt: the base below and the fit
  // about it do both, so the mound's girth is not squeezed by its own burial.
  const reach = sculptSphere(geometry, centre, radii, SHRUB_LOBES, -Infinity, OPEN, ULTRA_FOLIAGE_SALTS.shrub, 'axis');
  const position = geometry.getAttribute('position');
  const floor = SHRUB_ENVELOPE.min[1];
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // A function of position alone, so the corners of one vertex agree.
    if (y < seat.baseY) position.setY(i, Math.max(floor, seat.baseY + (y - seat.baseY) * seat.basePress));
  }
  fitInto(geometry, [0, seat.baseY, 0], SHRUB_ENVELOPE, 'axis');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r > footprint) position.setXYZ(i, (x / r) * footprint, position.getY(i), (z / r) * footprint);
  }
  softenNormals(geometry, centre, 0.35);
  const normal = geometry.getAttribute('normal');
  const form = ULTRA.forms.crown;
  const builder = formBuilder();
  const corner = (i: number): Vec3 => [position.getX(i), position.getY(i), position.getZ(i)];
  const normalAt = (i: number): Vec3 => [normal.getX(i), normal.getY(i), normal.getZ(i)];
  const mid = mixTone(form.hollowTone, form.tipTone, 0.5);
  const toneAt = (i: number): Tone => {
    const y = position.getY(i);
    // The buried base is never seen: it takes the middle tone and no shade, so
    // the visible bush still averages to its tint under the per-channel
    // normalisation. (Darkening the buried corners of the faces that cross
    // the turf line drew the foot 4 luma darker but lifted the whole visible
    // bush 5 % — the wrong trade for a bush the critic called pale.)
    if (y < 0) return mid;
    const lit = mixTone(form.hollowTone, form.tipTone, 0.5 + seat.facing * normal.getY(i) + 1.1 * reach[i]);
    const s = Math.min(1, y / seat.baseBand);
    const k = s * s * (3 - 2 * s);
    // At the turf line the tone is the neutral middle one, so the shade is a
    // value step, not a hue swing, and no channel is crushed under it.
    const shade = seat.baseShade + (1 - seat.baseShade) * k;
    return [
      (mid[0] + (lit[0] - mid[0]) * k) * shade,
      (mid[1] + (lit[1] - mid[1]) * k) * shade,
      (mid[2] + (lit[2] - mid[2]) * k) * shade,
    ];
  };
  for (let i = 0; i < position.count; i += 3) {
    builder.tri(corner(i), corner(i + 1), corner(i + 2),
      [toneAt(i), toneAt(i + 1), toneAt(i + 2)],
      [normalAt(i), normalAt(i + 1), normalAt(i + 2)]);
  }
  geometry.dispose();
  return builder.geometry();
}

// ---------------------------------------------------------------------------
// Trunk
// ---------------------------------------------------------------------------

/** The trunk's rings: root flare to the footprint, the bole, the top inside the crown. */
const TRUNK = Object.freeze({
  flareTop: 0.42,
  bole: 0.205,
  top: 0.165,
  /** Each stub: azimuth, where it leaves the bole, and its tip (radius out, height). */
  stubs: [
    { azimuth: 0.55, from: 2.25, reach: 1.0, tipY: 3.55 },
    { azimuth: 3.15, from: 2.5, reach: 0.85, tipY: 3.75 },
  ] as readonly { azimuth: number; from: number; reach: number; tipY: number }[],
  /** Half-thickness of a stub where it leaves the bole, metres. */
  stubRadius: 0.075,
});

/** A closed four-faced spike, every face wound away from its own centroid. */
function spike(builder: FormBuilder, base: readonly Vec3[], tip: Vec3): void {
  const faces: [Vec3, Vec3, Vec3][] = [
    [base[0], base[1], tip], [base[1], base[2], tip], [base[2], base[0], tip], [base[2], base[1], base[0]],
  ];
  const centroid: Vec3 = [
    (base[0][0] + base[1][0] + base[2][0] + tip[0]) / 4,
    (base[0][1] + base[1][1] + base[2][1] + tip[1]) / 4,
    (base[0][2] + base[1][2] + base[2][2] + tip[2]) / 4,
  ];
  for (const [a, b, c] of faces) {
    const n = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const out = (a[0] - centroid[0]) * n[0] + (a[1] - centroid[1]) * n[1] + (a[2] - centroid[2]) * n[2];
    if (out >= 0) builder.tri(a, b, c);
    else builder.tri(a, c, b);
  }
}

/**
 * The trunk: an eight-sided bole on a root flare exactly the 0.30 m footprint
 * wide (`ULTRA.forms.trunk`), 3.1 m tall with its top inside the crown, and two
 * branch stubs that leave the bole under the canopy and end inside it.
 * Smooth round the bole, a touch darker at the root.
 */
export function ultraTrunk(): THREE.BufferGeometry {
  const tree = PROP_SIZES.broadleafTree;
  const form = ULTRA.forms.trunk;
  const flare = Math.min(form.rootFlare, (PROP_FOOTPRINTS.broadleafTree as { radius: number }).radius);
  const builder = formBuilder();
  const phase = formHash01(1, 1, ULTRA_FOLIAGE_SALTS.trunk) * Math.PI;
  lathe(builder, [
    { r: flare, y: 0 },
    { r: TRUNK.bole, y: TRUNK.flareTop },
    { r: TRUNK.top, y: tree.trunkHeight },
  ], {
    segments: form.sides,
    phase,
    smooth: true,
    capBottom: true,
    capTop: true,
    tones: [[0.9, 0.9, 0.9], [1.03, 1.03, 1.03]],
  });
  for (const stub of TRUNK.stubs.slice(0, form.branchStubs)) {
    const c = Math.cos(stub.azimuth);
    const s = -Math.sin(stub.azimuth);
    // The stub's root sits inside the bole, on its axis side, so the spike
    // grows out of the bark rather than standing on it.
    const root: Vec3 = [c * 0.06, stub.from, s * 0.06];
    const tip: Vec3 = [c * stub.reach, stub.tipY, s * stub.reach];
    const d = [tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]];
    const dl = Math.hypot(d[0], d[1], d[2]);
    const dir = [d[0] / dl, d[1] / dl, d[2] / dl];
    // Two unit vectors across the stub.
    let e1 = [dir[2], 0, -dir[0]];
    const e1l = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    e1 = [e1[0] / e1l, e1[1] / e1l, e1[2] / e1l];
    const e2 = [
      dir[1] * e1[2] - dir[2] * e1[1],
      dir[2] * e1[0] - dir[0] * e1[2],
      dir[0] * e1[1] - dir[1] * e1[0],
    ];
    const base: Vec3[] = [0, 1, 2].map((k) => {
      const angle = (k / 3) * Math.PI * 2;
      const u = Math.cos(angle) * TRUNK.stubRadius;
      const v = Math.sin(angle) * TRUNK.stubRadius;
      return [root[0] + e1[0] * u + e2[0] * v, root[1] + e1[1] * u + e2[1] * v, root[2] + e1[2] * u + e2[2] * v];
    });
    spike(builder, base, tip);
  }
  return builder.geometry();
}
