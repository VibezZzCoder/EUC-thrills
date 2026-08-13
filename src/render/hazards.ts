/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { POTHOLE, PUDDLE } from '../data/tuning.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { outlinePhase } from './groundNoise.ts';
import type { Hazard, LevelPlan } from '../level/plan.ts';
import { isContactHazard } from '../simulation/hazards.ts';

/**
 * The world's hazards, drawn — potholes and the water in and on the road.
 *
 * M13 Phase 2, redrawn after the owner's first look at it. The milestone's open
 * gate is a question about this file: *does a pothole read as a hole at 20 m and
 * at 40 m, on the handset?* The first answer to it read as a tan volcano with a
 * black disc in the middle, and the spill beside it read as a stair-stepped
 * black mat, so both are rebuilt here.
 *
 * ## The constraint that shapes everything, restated because it never goes away
 *
 * **A recess cannot be drawn as a recess.** The heightfield is an opaque surface
 * at road height; a ray from a camera above it to any point below it crosses the
 * surface first, so anything drawn under the road is occluded by the road from
 * every position a player can occupy. Cutting the cell out is not available
 * either — a cell is a square metre, a pothole is smaller than one, and the hole
 * would open a metre of void onto the backstop. Depth is carried by value and by
 * shading, and any real relief has to go up.
 *
 * ## What the first pass got wrong
 *
 * It answered that with height: a 0.23–0.28 m spoil ring, sized by projecting
 * the feature through the real chase camera and finding that a flat 1.5 m hole
 * is under a pixel tall at forty route-metres. The arithmetic was right and the
 * cue was wrong. **A raised ring is the least hole-like shape a road feature can
 * have.** Real asphalt fails *downward*; a crown standing a quarter of a metre
 * proud of the surface is a moulding. It also had to be pale to read, and pale
 * plus warm plus perfectly round is a sandcastle.
 *
 * So the lip here is 5–7 cm — a slab of asphalt on edge — and the distance read
 * is carried by three things that survive the shallow view better than height:
 *
 *   1. **A luminance dipole.** The pit is roughly a quarter of the road's value
 *      and the rim is a third above it. A thin dark mark averages back into the
 *      asphalt as the pixels shrink; a pale ring around a dark core cannot,
 *      because the two halves straddle the road's value and do not cancel.
 *   2. **An irregular outline** (`ringOutline`). Nothing else in the world has a
 *      ragged edge, and the perfect 16-gon was most of what made the first pass
 *      read as manufactured.
 *   3. **Standing water in the deep kind** — the cue every road user already
 *      owns, and the one that puts the hazard that ends a run in a different
 *      visual class from the one that only shakes it.
 *
 * ## The two meshes
 *
 * **`level-hazards-ground`** is crushed asphalt: every pothole's bowl, broken
 * lip and halo, matte, one draw call for the level.
 *
 * **`level-hazards-water`** is standing water: the pool inside every deep
 * pothole *and* the puddle of every spill, in one glossy material. They share it
 * because roughness is the one material property a vertex colour cannot carry
 * and because they are the same substance — the water in the hole and the water
 * on the road should not be two different liquids. One extra draw call buys both.
 *
 * **The interior is still lit as a bowl although it is flat**, by carrying the
 * normals the recess would have had; that part of the first pass was right. What
 * is new is a baked *ambient occlusion* term. A pit's floor sees less sky than
 * the road beside it at every hour and from every angle, so folding that into
 * the vertex colour is a statement about the shape, not a second opinion about
 * the lighting — unlike a baked sun azimuth, which would violate invariant 6 and
 * be wrong the first time the coupled system moved the sun.
 *
 * **Neither mesh casts.** A recess casting into the 2048 cascade draws a dark
 * ring beside every hole — a shadow of a mound that is not physically there.
 * Both receive, because a hazard that kept full brightness under a tree would
 * read as glowing.
 *
 * **Nothing here is a collider and nothing reaches the heightfield.** The wheel
 * rolls through the lip without feeling it. At 28 cm that was a kerb the player
 * rode through; at 5 cm it is a chip of asphalt, which is a much smaller lie and
 * still the right way round — `level/plan.ts` explains at length why a pothole
 * built as a collider would be a slab of road at road height.
 */

export interface HazardsView {
  readonly group: THREE.Group;
  /** Potholes drawn into the ground mesh, both kinds. */
  readonly potholes: number;
  /** Deep potholes, which are the ones that hold water. */
  readonly pools: number;
  /** Spills drawn as a puddle. Their grip still comes from the surface grid. */
  readonly spills: number;
  readonly triangles: number;
  /** Colour-pass draw calls: the ground mesh, the water mesh, or neither. */
  readonly drawCalls: number;
  dispose(): void;
}

/** What one depth class looks like. The two rows the `kind` chooses between. */
interface Profile {
  readonly rimHeight: number;
  readonly depth: number;
  readonly floorShade: number;
  readonly wallShade: number;
  readonly holdsWater: boolean;
}

function profileFor(hazard: Hazard): Profile {
  const deep = hazard.kind === 'potholeDeep';
  return {
    // Absolute, because a broken lip is a piece of asphalt rather than a
    // proportion of the hole — capped so a small enough footprint gets a lip
    // rather than a cone (`POTHOLE.maxRimFraction`).
    rimHeight: Math.min(
      deep ? POTHOLE.deepRimHeight : POTHOLE.shallowRimHeight,
      hazard.radius * POTHOLE.maxRimFraction,
    ),
    depth: deep ? POTHOLE.deepDepth : POTHOLE.shallowDepth,
    floorShade: deep ? POTHOLE.deepFloorShade : POTHOLE.shallowFloorShade,
    wallShade: deep ? POTHOLE.deepWallShade : POTHOLE.shallowWallShade,
    holdsWater: deep,
  };
}

/**
 * One ring of the profile: where it is, how high it stands, how its normal
 * leans, what colour it takes and how much sky it sees.
 *
 * `slope` is `dy/du` of the surface this ring belongs to — **the surface being
 * *described*, which for the two inner rings is the bowl that is not there**.
 * A surface rising outward has its normal leaning inward, so a positive slope
 * tilts the normal toward the axis; the mouth leans that way and the halo leans
 * the other, which is what gives the feature an inner shadow and an outer
 * highlight from a single sun.
 *
 * `shade` is baked ambient occlusion, multiplied into the colour. It is a fact
 * about the shape and not about the light — see the file note.
 */
interface Ring {
  readonly fraction: number;
  readonly height: number;
  readonly slope: number;
  readonly colour: number;
  readonly shade: number;
}

function ringsFor(hazard: Hazard): Ring[] {
  const { rimHeight, depth, floorShade, wallShade } = profileFor(hazard);
  const radius = hazard.radius;
  const lift = POTHOLE.lift;
  // The bowl the interior pretends to be: a cone from `-depth` at the centre up
  // to the road at the footprint's edge. Its slope is what the mouth's normals
  // lean by, and it is the strongest of the two kinds' differences under a
  // moving sun — a deep hole's walls turn much further from it.
  const bowlSlope = depth / Math.max(radius, 1e-6);
  const haloSpan = Math.max(POTHOLE.haloFraction - 1, 1e-6) * radius;

  return [
    { fraction: 0, height: lift, slope: 0, colour: POTHOLE.floorColour, shade: floorShade },
    {
      fraction: POTHOLE.floorFraction,
      height: lift,
      slope: bowlSlope,
      colour: POTHOLE.floorColour,
      shade: floorShade,
    },
    {
      fraction: POTHOLE.wallFraction,
      height: lift + rimHeight * 0.25,
      slope: bowlSlope,
      colour: POTHOLE.wallColour,
      shade: wallShade,
    },
    // The lip, at exactly the hit radius before the outline pushes it outward.
    // Its height is per *step* rather than per ring — see `crumbleAt` — so this
    // is the base the crumble is measured from.
    {
      fraction: 1,
      height: lift + rimHeight,
      slope: 0,
      colour: POTHOLE.rimColour,
      shade: POTHOLE.rimShade,
    },
    // The halo falls away outward, so its normal leans outward — the mirror of
    // the mouth, and the other half of the light/dark pair. Its colour is
    // pavement's, so the band ramps from the pale rim to the road and the outer
    // edge of the whole feature is invisible.
    {
      fraction: POTHOLE.haloFraction,
      height: lift,
      slope: -rimHeight / haloSpan,
      colour: POTHOLE.haloColour,
      shade: 1,
    },
  ];
}

/**
 * The outline of one closed ring, as a radius multiplier and an angle offset per
 * step.
 *
 * **Angular harmonics, not per-vertex noise, and the difference is the whole
 * result.** An independent random radius at each step gives a spiky star:
 * neighbouring vertices are uncorrelated so the edge zig-zags at the sampling
 * frequency, and the seam where the last step meets the first is a visible
 * discontinuity because nothing makes the loop close. A sum of whole-numbered
 * harmonics closes by construction, stays smooth between samples, and puts its
 * lobes at the scale of the feature instead of the scale of the mesh — which is
 * what "irregular" has to mean to read as broken asphalt rather than as a bug.
 *
 * The phases come from the hazard's own position (`outlinePhase`), so two holes
 * are never the same shape and one hole is the same shape every rebuild.
 *
 * `base` and the amplitudes decide which side of the hit radius the drawn edge
 * falls on, and the two callers deliberately disagree: a pothole runs outward
 * from 1, so the mouth is never smaller than the radius the simulation charges
 * for and clipping the visible edge is free; a spill runs inward to 1, so water
 * is only ever drawn where the ground is genuinely slippery.
 */
interface Outline {
  readonly radiusScale: readonly number[];
  readonly angle: readonly number[];
}

function ringOutline(
  hazard: Hazard,
  segments: number,
  base: number,
  harmonics: readonly number[],
  angleJitter: number,
): Outline {
  // Orders 1, 2, 3 and 5. Skipping 4 keeps the set free of a common factor, so
  // no two of them line up into a symmetry — a lobe pattern with a mirror plane
  // still reads as designed.
  const orders = [1, 2, 3, 5];
  const phases = orders.map((order) => outlinePhase(hazard.centre.x, hazard.centre.z, order));
  const anglePhase = outlinePhase(hazard.centre.x, hazard.centre.z, 7);
  const step = (Math.PI * 2) / segments;

  const radiusScale: number[] = [];
  const angle: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const theta = index * step;
    let scale = base;
    for (let k = 0; k < harmonics.length; k += 1) {
      // `0.5 + 0.5·sin` rather than `sin`, so every term is non-negative and the
      // sum of the amplitudes is the exact reach of the outline past `base`.
      scale += harmonics[k] * (0.5 + 0.5 * Math.sin(orders[k] * theta + phases[k]));
    }
    radiusScale.push(scale);
    angle.push(theta + angleJitter * step * Math.sin(2 * theta + anglePhase));
  }
  return { radiusScale, angle };
}

/**
 * How much of the lip is standing at one step, 0..1.
 *
 * A ring at a constant height is a moulding however low it is; a lip that is
 * gone in places and full height in others is a break. Its own harmonics, at
 * higher orders than the outline's, so the crumble does not simply follow the
 * lobes. Floored at 0.15 so the lip never disappears entirely, which would leave
 * a gap the halo shows straight through.
 */
function crumbleAt(hazard: Hazard, theta: number): number {
  const a = outlinePhase(hazard.centre.x, hazard.centre.z, 11);
  const b = outlinePhase(hazard.centre.x, hazard.centre.z, 13);
  const wave = 0.5 * Math.sin(3 * theta + a) + 0.5 * Math.sin(5 * theta + b);
  return 0.15 + 0.85 * (0.5 + 0.5 * wave);
}

export function createHazards(plan: LevelPlan): HazardsView {
  const group = new THREE.Group();
  group.name = 'level-hazards';

  const hazards = plan.hazards ?? [];
  const potholes = hazards.filter(isContactHazard);
  const spills = hazards.filter((hazard) => hazard.kind === 'spill');
  const pools = potholes.filter((hazard) => profileFor(hazard).holdsWater);

  const colour = new THREE.Color();

  /**
   * The finished ground under a point, plus an offset.
   *
   * Sampled per vertex rather than taken once from `hazard.centre.y`, for the
   * reason `render/markings.ts` samples every ribbon edge: a crowned or banked
   * road puts the two sides of a two-metre footprint at different heights, and a
   * ring drawn on one plane would bury one side and float the other. It is the
   * *finished heightfield*, which is the surface `Hazard.centre` is already
   * resolved against and the one the contact patch is resolved against — the
   * two-grounds rule in `AGENTS.md` asks for that to be said out loud.
   */
  const groundAt = (x: number, z: number, offset: number): number =>
    fieldHeightAt(plan.heightfield, plan.surround, x, z) + offset;

  // -- The ground mesh: bowls, lips and halos ------------------------------
  const ground = new Buffers();
  for (const hazard of potholes) {
    const rings = ringsFor(hazard);
    const { rimHeight } = profileFor(hazard);
    const segments = POTHOLE.radialSegments;
    const outline = ringOutline(
      hazard,
      segments,
      1,
      POTHOLE.outlineHarmonics,
      POTHOLE.outlineAngleJitter,
    );
    const first = ground.vertexCount();

    // -- The centre, one vertex ------------------------------------------
    setShaded(colour, rings[0].colour, rings[0].shade);
    ground.push(
      hazard.centre.x,
      groundAt(hazard.centre.x, hazard.centre.z, rings[0].height),
      hazard.centre.z,
      0, 1, 0,
      colour,
    );

    // -- Four rings of `segments` vertices each ---------------------------
    for (let ring = 1; ring < rings.length; ring += 1) {
      const { fraction, height, slope } = rings[ring];
      const isLip = ring === 3;
      const isWall = ring === 2;
      // A surface with slope `dy/du` has the normal `(-slope · û + ŷ)`,
      // normalised. Resolved once per ring because it depends only on the
      // slope, and then spun around with the radial direction.
      const lean = 1 / Math.hypot(slope, 1);
      const leanRadial = -slope * lean;
      const arc = (Math.PI * 2 * hazard.radius * fraction) / segments;

      for (let step = 0; step < segments; step += 1) {
        const theta = outline.angle[step];
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const radius = hazard.radius * fraction * outline.radiusScale[step];
        const x = hazard.centre.x + cos * radius;
        const z = hazard.centre.z + sin * radius;

        // Tone swings with the crumble on the two rings that are made of broken
        // material, and only on those: a chunk still standing catches the light
        // and the gap where one broke away does not. The wall takes half the
        // swing, because it is already the shaded side of the same chunks. Four
        // flat rings joined by linear ramps is an airbrush; this is what stops
        // it being one (`POTHOLE.rimMottle`).
        //
        // `setHex` decodes sRGB to linear on its own; a second conversion is the
        // trap this project has now walked into five times in five files
        // (`DESIGN.md` §6b).
        const swing = isLip ? 1 : isWall ? 0.5 : 0;
        setShaded(
          colour,
          rings[ring].colour,
          rings[ring].shade
            * (swing === 0
              ? 1
              : 1 + POTHOLE.rimMottle * swing * (crumbleAt(hazard, theta) * 2 - 1)),
        );

        let y = height;
        let normalX = cos * leanRadial;
        let normalY = lean;
        let normalZ = sin * leanRadial;
        if (isLip) {
          // The lip's height varies along the ring, so its normal has to as
          // well — otherwise the geometry breaks up and the shading does not,
          // which is the tell-tale of authored normals and reads as a smooth
          // ring with a jagged silhouette. The tilt is the local slope of the
          // crumble *along* the ring, which lights alternate facets.
          y = rings[ring].height - rimHeight + rimHeight * crumbleAt(hazard, theta);
          const ahead = crumbleAt(hazard, theta + (Math.PI * 2) / segments);
          const behind = crumbleAt(hazard, theta - (Math.PI * 2) / segments);
          const along = arc > 1e-6 ? (rimHeight * (ahead - behind)) / (2 * arc) : 0;
          const tilt = 1 / Math.hypot(along, 1);
          const leanAlong = -along * tilt;
          normalX = -sin * leanAlong;
          normalY = tilt;
          normalZ = cos * leanAlong;
        }
        ground.push(x, groundAt(x, z, y), z, normalX, normalY, normalZ, colour);
      }
    }

    ground.fanAndBands(first, rings.length - 1, segments);
  }

  // -- The water mesh: pothole pools, then spill puddles --------------------
  const water = new Buffers();
  for (const hazard of pools) {
    const segments = POTHOLE.radialSegments;
    // The pool takes the hole's own outline, scaled down: the water sits in the
    // shape the break made, which is the whole reason it reads as *in* it.
    const outline = ringOutline(
      hazard,
      segments,
      1,
      POTHOLE.outlineHarmonics,
      POTHOLE.outlineAngleJitter,
    );
    const first = water.vertexCount();
    colour.setHex(PUDDLE.poolColour);
    pushWater(water, hazard, hazard.centre.x, hazard.centre.z, groundAt, colour);
    const poolRings = [PUDDLE.poolCoreFraction, PUDDLE.poolFraction];
    for (let ring = 0; ring < poolRings.length; ring += 1) {
      // The pool's own meniscus, dimmer than the open-road one because it is
      // sitting in a shadowed pit. It is what says *water* rather than *void*
      // about a very dark disc at the bottom of a hole.
      colour.setHex(ring === 1 ? PUDDLE.poolEdgeColour : PUDDLE.poolColour);
      for (let step = 0; step < segments; step += 1) {
        const theta = outline.angle[step];
        const radius = hazard.radius * poolRings[ring] * outline.radiusScale[step];
        const x = hazard.centre.x + Math.cos(theta) * radius;
        const z = hazard.centre.z + Math.sin(theta) * radius;
        pushWater(water, hazard, x, z, groundAt, colour);
      }
    }
    water.fanAndBands(first, poolRings.length, segments);
  }

  for (const hazard of spills) {
    const segments = PUDDLE.radialSegments;
    const outline = ringOutline(
      hazard,
      segments,
      // Runs inward to 1 rather than outward from it: everywhere the player can
      // see water, the ground is genuinely slippery, and the damp cells the
      // surface grid paints outside the puddle are the warning that the
      // slippery part is wider than the shiny part.
      1 - PUDDLE.outlineHarmonics.reduce((sum, amplitude) => sum + amplitude, 0),
      PUDDLE.outlineHarmonics,
      PUDDLE.outlineAngleJitter,
    );
    const first = water.vertexCount();

    colour.setHex(PUDDLE.spillColour);
    pushWater(water, hazard, hazard.centre.x, hazard.centre.z, groundAt, colour);
    const fractions = [
      PUDDLE.spillCoreFraction,
      PUDDLE.spillBodyFraction,
      PUDDLE.spillFringeFraction,
    ];
    for (let ring = 0; ring < fractions.length; ring += 1) {
      // Core and body are the water; the outer ring is the meniscus — the one
      // value in the whole hazard family that goes above the road, and the piece
      // that stops a dark shape reading as a shadow. `PUDDLE` says why a
      // highlight has to be built rather than lit for.
      colour.setHex(ring === 2 ? PUDDLE.meniscusColour : PUDDLE.spillColour);
      for (let step = 0; step < segments; step += 1) {
        const theta = outline.angle[step];
        const radius = hazard.radius * fractions[ring] * outline.radiusScale[step];
        const x = hazard.centre.x + Math.cos(theta) * radius;
        const z = hazard.centre.z + Math.sin(theta) * radius;
        pushWater(water, hazard, x, z, groundAt, colour);
      }
    }
    water.fanAndBands(first, fractions.length, segments);
  }

  const meshes: THREE.Mesh[] = [];
  const groundMesh = ground.build('level-hazards-ground', POTHOLE.roughness);
  if (groundMesh !== undefined) meshes.push(groundMesh);
  const waterMesh = water.build('level-hazards-water', PUDDLE.roughness);
  if (waterMesh !== undefined) meshes.push(waterMesh);
  for (const mesh of meshes) group.add(mesh);

  return {
    group,
    potholes: potholes.length,
    pools: pools.length,
    spills: spills.length,
    triangles: ground.triangles() + water.triangles(),
    drawCalls: meshes.length,

    dispose(): void {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      meshes.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}

/**
 * One water vertex: at a constant lift above the finished ground, rippled only
 * in its normal.
 *
 * **The vertices follow the road and only the normals ripple.** A perfectly
 * uniform normal field
 * catches the sun on exactly one approach bearing — the one that satisfies the
 * mirror condition — so on the rest of a route the water would be flat dark and
 * indistinguishable from the stain this whole revision exists to stop it being.
 * Tilting the normals a few degrees smears that one bearing into a band of them,
 * so some part of every puddle lights up from almost anywhere, and it reads as a
 * liquid surface rather than a decal besides. Adding ripple displacement to the
 * *vertices* instead would make a thin film visibly corrugated; their Y position
 * therefore remains exactly `PUDDLE.lift` above the finished ground under each
 * one, including on a crowned road.
 *
 * Sampled in world space rather than in the puddle's own frame, so two spills
 * that overlap ripple in step instead of showing a seam.
 */
function pushWater(
  buffers: Buffers,
  hazard: Hazard,
  x: number,
  z: number,
  groundAt: (x: number, z: number, offset: number) => number,
  colour: THREE.Color,
): void {
  const k = Math.PI * 2 * PUDDLE.rippleWavesPerMetre;
  const phase = outlinePhase(hazard.centre.x, hazard.centre.z, 17);
  const tiltX = PUDDLE.rippleRadians * Math.sin(k * x + phase);
  const tiltZ = PUDDLE.rippleRadians * Math.sin(k * z + phase * 0.5);
  const length = Math.hypot(tiltX, tiltZ, 1);
  buffers.push(
    x,
    groundAt(x, z, PUDDLE.lift),
    z,
    -tiltX / length,
    1 / length,
    -tiltZ / length,
    colour,
  );
}

/** Baked occlusion, applied to an authored open-daylight colour. */
function setShaded(colour: THREE.Color, hex: number, shade: number): THREE.Color {
  colour.setHex(hex);
  colour.multiplyScalar(shade);
  return colour;
}

/**
 * One mesh under construction.
 *
 * Both families are built the same way and differ only in material, so the
 * winding and the buffer bookkeeping live here once rather than twice — the
 * fan-and-bands topology in particular is the part that is easy to get subtly
 * backwards, and a second copy of it is a second chance to.
 */
class Buffers {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  vertexCount(): number {
    return this.positions.length / 3;
  }

  triangles(): number {
    return this.indices.length / 3;
  }

  push(
    x: number, y: number, z: number,
    normalX: number, normalY: number, normalZ: number,
    colour: THREE.Color,
  ): void {
    this.positions.push(x, y, z);
    this.normals.push(normalX, normalY, normalZ);
    this.colors.push(colour.r, colour.g, colour.b);
  }

  /**
   * A triangle fan from `first` out to the first ring, then one band per ring
   * gap. `rings` counts the rings *after* the centre vertex.
   *
   * Wound counter-clockwise seen from above, matching `render/terrain.ts`: with
   * +X to the left of +Z, that is the face the sun lights.
   */
  fanAndBands(first: number, rings: number, segments: number): void {
    const ringStart = (ring: number): number => first + 1 + (ring - 1) * segments;
    for (let step = 0; step < segments; step += 1) {
      const next = (step + 1) % segments;
      this.indices.push(first, ringStart(1) + next, ringStart(1) + step);
    }
    for (let ring = 1; ring < rings; ring += 1) {
      const inner = ringStart(ring);
      const outer = ringStart(ring + 1);
      for (let step = 0; step < segments; step += 1) {
        const next = (step + 1) % segments;
        this.indices.push(inner + step, outer + next, outer + step);
        this.indices.push(inner + step, inner + next, outer + next);
      }
    }
  }

  build(name: string, roughness: number): THREE.Mesh | undefined {
    if (this.indices.length === 0) return undefined;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness,
      metalness: 0,
      // Every tone in the family in one material, exactly as the two road paints
      // share one (`render/markings.ts`).
      vertexColors: true,
    });
    // The offset pair is `render/markings.ts`'s, for its reasons: the 12 mm lift
    // alone loses at a hundred metres where the depth buffer coarsens, and the
    // offset alone loses between two heightfield samples, where the ground can
    // rise above a straight line drawn across them.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }
}
