/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import {
  BUILDING_FACADE,
  BUILDING_TONES,
  GANTRY_WORDMARK,
  PROP_COLOURS,
  PROP_SIZES,
  PROP_TINT_JITTER,
  type PropKind,
} from '../data/props.ts';
import { materialAppearance } from '../data/surfaces.ts';
import { linearFromHex, wordStrokes } from './inkKit.ts';
import { positionHash01 } from '../shared/maths.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';

/**
 * The world's dressing, built from the `LevelPlan` and from nothing else.
 *
 * M7 finished the slice's geometry and left it empty. A rider came back from it
 * with "the graphics look primitive", and the diagnosis was not the shading: it
 * was that a 1,347 m route ran through bare ground, a few grey frontage slabs,
 * and nothing else. Nothing gave the place scale, nothing identified the city
 * against the park, and nothing went past the camera to say how fast the wheel
 * was going. This file is the answer, and it is procedural primitives in the
 * same spirit as the blockout the rest of the world is built from — no imported
 * models, no textures, no new dependency.
 *
 * Four rules it is built on, each of which is a rule with a reason.
 *
 * **1. Everything is instanced, per (part, material).** A hundred trees are two
 * draw calls, not two hundred. `DESIGN.md` §8 caps the frame at 150 draw calls
 * and 400k triangles and M7 already spends 74 and 144k; the kit's own ceilings
 * are in `data/props.ts` and `props.test.ts` measures the real built scene
 * against them rather than estimating.
 *
 * **2. Silhouette, not surface.** `DESIGN.md` §7 — one rounded shoulder was the
 * difference between "crate on a wheel" and "recognisably an EUC". So a conifer
 * is three stacked cones and a lamp post has a head that reaches out over the
 * road, and neither carries a triangle that only pays off at two metres.
 *
 * **3. Colour lives on the instance, not on the material.** Every part's
 * material is white and every instance carries its own linear albedo through
 * `instanceColor`, which is what lets a hundred trees differ by a few per cent
 * in one draw call — the same job the ground's mottle does (`DESIGN.md` §4) and
 * under the same rule: deterministic from an integer hash, never `Math.random`.
 *
 * **4. Rendering never invents solidity.** M8.6 lets `buildPlan.ts` derive
 * `plan.solids` from the same resolved props, but this file still knows only
 * meshes and never draws collider proxies. `sliceLevel.test.ts` asserts solid
 * dressing stays clear of rideable corridors and that each derived box matches
 * the prop placement that justified it.
 *
 * ## The instance-colour trap
 *
 * `instanceColor` only reaches the fragment shader when `USE_COLOR` is defined,
 * which three derives from `material.vertexColors` — and defining `USE_COLOR`
 * also declares a `color` attribute the vertex shader multiplies by. A geometry
 * without one gets WebGL's default generic attribute, which is **black**, and
 * every prop in the level renders as a silhouette. So every geometry below
 * carries a white `color` attribute and every material sets `vertexColors`.
 * This is the fifth time this project has shipped something too dark
 * (`DESIGN.md` §2), and the first time it would have been all the way to zero.
 *
 * The other half of the same trap is on the authoring side: `new THREE.Color(hex)`
 * already decodes sRGB to linear, so there is no `convertSRGBToLinear()`
 * anywhere below (`DESIGN.md` §6b).
 */

export interface PropsView {
  readonly group: THREE.Group;
  /** Props in the plan. */
  readonly props: number;
  /** Instances across every part. More than `props`: a tree is two. */
  readonly instances: number;
  /**
   * Colour-pass draw calls: exactly one per InstancedMesh.
   *
   * Reportable, as are triangles and GPU object counts. A frame interval is
   * not (`AGENTS.md`).
   */
  readonly drawCalls: number;
  readonly triangles: number;
  /**
   * What the shadow pass adds on top, counted separately because
   * `renderer.info` counts both and the two are worth telling apart.
   *
   * An instanced mesh's bounding sphere spans the world, so the shadow camera
   * never culls one: a casting part is drawn in full every frame, however far
   * its instances are from the cascade.
   */
  readonly shadowDrawCalls: number;
  readonly shadowTriangles: number;
  dispose(): void;
}

/**
 * One instanced part. A kind is made of one or more of these, and two kinds
 * that share a part share its mesh — the broadleaf tree's crown and the crown
 * that tops one of the level's own trunk colliders are the same triangles in
 * the same draw call.
 */
type PartId =
  | 'trunk'
  | 'crown'
  | 'coniferFoliage'
  | 'shrub'
  | 'lampPost'
  | 'lampHead'
  | 'benchWood'
  | 'benchMetal'
  | 'litterBin'
  | 'bollardCap'
  | 'signPost'
  | 'signPlate'
  | 'fenceBay'
  | 'buildingBody'
  | 'buildingLow'
  | 'buildingTall'
  | 'buildingCap'
  | 'tyreStack'
  | 'gantrySpan';

interface PartDefinition {
  /** Built once, on first use. Local space, origin at the prop's base. */
  readonly build: () => THREE.BufferGeometry;
  readonly albedo: number;
  readonly roughness: number;
  readonly metalness: number;
  /** How far the instance tint may stray from the albedo, as a fraction. */
  readonly tint: number;
  /**
   * Whether this part casts into the single 2048 cascade.
   *
   * Two draw calls' worth of thought: a shadow is what stops a prop looking
   * like a sticker on the ground, so anything with a footprint casts. Anything
   * whose shadow is smaller than a shadow-map texel at the cascade's 18 m
   * radius — a bollard's finial, a sign's plate, a lamp's head — does not, and
   * the skyline does not because it is hundreds of metres outside the cascade.
   */
  readonly castShadow: boolean;
}

const WOOD = materialAppearance('wood');
const METAL = materialAppearance('metal');

const PARTS: Readonly<Record<PartId, PartDefinition>> = {
  trunk: {
    build: () => {
      const tree = PROP_SIZES.broadleafTree;
      return cylinder(
        tree.trunkRadiusTop,
        tree.trunkRadiusBase,
        tree.trunkHeight,
        tree.trunkSides,
        0,
      );
    },
    albedo: WOOD.albedo,
    roughness: 0.95,
    metalness: 0,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  crown: {
    build: () => {
      const tree = PROP_SIZES.broadleafTree;
      const wide = tree.crownRadius;
      return merge([
        blob(wide, 1, tree.crownHeight / (2 * wide), 0.92, 0, tree.crownCentre, 0),
        blob(tree.upperRadius, 1, 0.85, 1, tree.upperOffset, tree.upperCentre, -0.3),
      ]);
    },
    albedo: PROP_COLOURS.broadleafFoliage,
    roughness: 1,
    metalness: 0,
    tint: PROP_TINT_JITTER.foliage,
    castShadow: true,
  },

  coniferFoliage: {
    build: () => merge(
      PROP_SIZES.conifer.tiers.map((tier) => cone(
        tier.radius,
        tier.height,
        PROP_SIZES.conifer.tierSides,
        tier.base,
      )),
    ),
    albedo: PROP_COLOURS.coniferFoliage,
    roughness: 1,
    metalness: 0,
    tint: PROP_TINT_JITTER.foliage,
    castShadow: true,
  },

  shrub: {
    build: () => {
      const bush = PROP_SIZES.shrub;
      return blob(bush.radius, bush.scaleX, bush.scaleY, bush.scaleZ, 0, bush.centre, 0);
    },
    albedo: PROP_COLOURS.shrubFoliage,
    roughness: 1,
    metalness: 0,
    tint: PROP_TINT_JITTER.foliage,
    castShadow: true,
  },

  lampPost: {
    build: () => {
      const lamp = PROP_SIZES.lampPost;
      return merge([
        cylinder(lamp.postRadius, lamp.postRadius * 1.35, lamp.postHeight, lamp.postSides, 0),
        // The arm, reaching out over what it lights. A vertical pole with a box
        // on top is a bollard with delusions; the reach is the silhouette.
        box(
          lamp.armThickness,
          lamp.armThickness,
          lamp.armLength,
          0,
          lamp.postHeight - lamp.armThickness / 2,
          lamp.armLength / 2,
        ),
      ]);
    },
    albedo: METAL.albedo,
    roughness: METAL.roughness,
    metalness: METAL.metalness,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  lampHead: {
    build: () => {
      const lamp = PROP_SIZES.lampPost;
      return box(
        lamp.headWidth,
        lamp.headHeight,
        lamp.headDepth,
        0,
        lamp.postHeight - lamp.armThickness - lamp.headHeight / 2,
        lamp.headReach,
      );
    },
    albedo: PROP_COLOURS.lampHead,
    roughness: 0.55,
    metalness: 0.1,
    tint: PROP_TINT_JITTER.structure,
    castShadow: false,
  },

  benchWood: {
    build: () => {
      const bench = PROP_SIZES.bench;
      return merge([
        box(bench.length, bench.seatThickness, bench.seatDepth, 0, bench.seatHeight, 0),
        box(
          bench.length,
          bench.backHeight,
          bench.backThickness,
          0,
          bench.seatHeight + bench.backHeight / 2,
          -bench.seatDepth / 2 + bench.backThickness / 2,
        ),
      ]);
    },
    albedo: WOOD.albedo,
    roughness: WOOD.roughness,
    metalness: 0,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  benchMetal: {
    build: () => {
      const bench = PROP_SIZES.bench;
      return merge([1, -1].map((side) => box(
        bench.legThickness,
        bench.seatHeight,
        bench.seatDepth * 0.8,
        side * (bench.length / 2 - bench.legThickness),
        bench.seatHeight / 2,
        0,
      )));
    },
    albedo: METAL.albedo,
    roughness: METAL.roughness,
    metalness: METAL.metalness,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  litterBin: {
    build: () => {
      const bin = PROP_SIZES.litterBin;
      return merge([
        cylinder(bin.radiusTop, bin.radiusBase, bin.height, bin.sides, 0),
        // A proud rim, because a plain tapered tube reads as a plant pot.
        cylinder(bin.radiusTop * 1.12, bin.radiusTop * 1.12, bin.rimHeight, bin.sides, bin.height),
      ]);
    },
    albedo: METAL.albedo,
    roughness: 0.6,
    metalness: 0.5,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  bollardCap: {
    build: () => {
      const cap = PROP_SIZES.bollardCap;
      return blob(cap.radius, 1, cap.scaleY, 1, 0, 0, 0);
    },
    albedo: METAL.albedo,
    roughness: METAL.roughness,
    metalness: METAL.metalness,
    tint: PROP_TINT_JITTER.structure,
    castShadow: false,
  },

  signPost: {
    build: () => {
      const sign = PROP_SIZES.signpost;
      return cylinder(sign.postRadius, sign.postRadius, sign.postHeight, sign.postSides, 0);
    },
    albedo: METAL.albedo,
    roughness: METAL.roughness,
    metalness: METAL.metalness,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  signPlate: {
    build: () => {
      const sign = PROP_SIZES.signpost;
      return merge([
        box(
          sign.plateWidth,
          sign.plateHeight,
          sign.plateThickness,
          sign.plateWidth / 2 - sign.postRadius,
          sign.plateCentre,
          0,
        ),
        box(
          sign.lowerWidth,
          sign.lowerHeight,
          sign.plateThickness,
          sign.lowerWidth / 2 - sign.postRadius,
          sign.lowerCentre,
          0,
        ),
      ]);
    },
    albedo: PROP_COLOURS.signPlate,
    roughness: 0.5,
    metalness: 0.15,
    tint: PROP_TINT_JITTER.structure,
    castShadow: false,
  },

  fenceBay: {
    build: () => {
      const fence = PROP_SIZES.fenceBay;
      return merge([
        box(fence.postWidth, fence.postHeight, fence.postWidth, 0, fence.postHeight / 2, 0),
        ...[fence.railUpper, fence.railLower].map((height) => box(
          fence.railThickness,
          fence.railHeight,
          fence.length,
          0,
          height,
          0,
        )),
      ]);
    },
    albedo: WOOD.albedo,
    roughness: WOOD.roughness,
    metalness: 0,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  buildingBody: {
    // A unit box standing on its base, scaled per instance by the prop's own
    // metric size. A box stretched is still a box, which is the one case master
    // §9.3's warning about instance-scaled cubes does not apply to.
    //
    // From M7.5 stage 5b its four sides carry glazing bands, which is why it is
    // built here rather than by `box()`: the strips need their own values in
    // the `color` attribute, and that attribute already had to exist for
    // `instanceColor` to reach the shader at all. Windows therefore cost no
    // draw call and no material — only the strips' own triangles.
    build: () => facadeBox(BUILDING_FACADE.lowFloors),
    albedo: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    tint: 0,
    castShadow: false,
  },

  /**
   * The same box with two storeys, for anything too short for four.
   *
   * **A third geometry, and the second one that exists because band count is
   * baked per part rather than per instance.** `buildingTall` was added
   * because four bands on a sixty-metre tower are ten-metre floors; this is
   * the same argument from the other end. Four bands on a four-metre paddock
   * shed are one-metre floors, and `BUILDING_FACADE.minFloorHeight` already
   * called that striping — the renderer just never applied its own rule to a
   * short *body*, only to a short rooftop tower.
   *
   * A solid ground floor and one glazed strip above it, which is a workshop.
   * Nothing shorter than `lowRiseFloors × minFloorHeight` gets a facade that
   * fits: `props.test.ts` measures every instance and is meant to say so.
   */
  buildingLow: {
    build: () => facadeBox(BUILDING_FACADE.lowRiseFloors),
    albedo: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    tint: 0,
    castShadow: false,
  },

  /**
   * The same box with more storeys, for anything tall.
   *
   * **One extra draw call, and the alternative was worse.** The box is scaled
   * per instance, so a single band count gives a sixty-metre tower ten-metre
   * floors — which reads as a warehouse rather than as a tower, and is the one
   * thing a facade is supposed to fix. Two geometries let a block pick the
   * pattern whose floor height lands nearest a real one; a genuinely metric
   * facade would need per-instance UVs and a custom shader, which is a
   * different milestone's cost.
   */
  buildingTall: {
    build: () => facadeBox(BUILDING_FACADE.highFloors),
    albedo: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    tint: 0,
    castShadow: false,
  },

  buildingCap: {
    build: () => box(1, 1, 1, 0, 0.5, 0),
    albedo: PROP_COLOURS.buildingCap,
    roughness: 0.9,
    metalness: 0,
    tint: PROP_TINT_JITTER.structure,
    castShadow: false,
  },

  /**
   * A bundle of tyres — M23's venue furniture, and eight sides of it.
   *
   * The waist is the whole read. A stack of equal cylinders is a bin; every
   * other tyre pulled in by a tenth gives the silhouette the four steps that
   * say *tyres* at the distance this is seen from. It casts, because a stack
   * that does not is a sticker on the grass beside a barrier that does.
   */
  tyreStack: {
    build: () => {
      const stack = PROP_SIZES.tyreStack;
      return merge(Array.from({ length: stack.tyres }, (_ignored, tyre) => {
        const radius = stack.radius * (tyre % 2 === 1 ? stack.waist : 1);
        return cylinder(radius, radius, stack.tyreHeight, stack.sides, tyre * stack.tyreHeight);
      }));
    },
    albedo: PROP_COLOURS.tyreStack,
    roughness: 0.95,
    metalness: 0,
    tint: PROP_TINT_JITTER.structure,
    castShadow: true,
  },

  /**
   * The overhead half of BelVar's start gantry: truss, banner, and the venue's
   * own name.
   *
   * **Three things it is not.** It is not the legs — those are two authored
   * blocks in `metal`, because a prop cannot span a road and a block cannot
   * leave the ground, and this is authored `onCollider` on top of them. It is
   * not solid — `PROP_SOLIDS.gantrySpan` is null and says why. And the
   * wordmark is not a texture: the letters are the *same stroke paths* the
   * rider atlas prints, extruded into plates standing off the banner face, so
   * the project's lettering has one alphabet and one set of metrics
   * (`render/inkKit.ts`). That keeps invariant 12 at two textures rather than
   * three, and it costs triangles, which is the axis this phase was told to
   * spend on.
   *
   * The banner is red through the `color` attribute rather than through a
   * material of its own — the same mechanism a building's glazing bands use,
   * and the reason a two-colour object here is still one draw call.
   */
  gantrySpan: {
    build: () => buildGantrySpan(),
    albedo: PROP_COLOURS.gantryPlate,
    roughness: 0.62,
    metalness: 0.25,
    // Zero. Two of this part's three colours are carried in the `color`
    // attribute, and a per-instance tint would drag the banner's red and the
    // wordmark with the truss.
    tint: 0,
    castShadow: true,
  },
};

/** Which parts each kind emits. Buildings are the one kind that computes. */
const SIMPLE_PARTS: Readonly<Partial<Record<PropKind, readonly PartId[]>>> = {
  broadleafTree: ['trunk', 'crown'],
  treeCanopy: ['crown'],
  conifer: ['coniferFoliage'],
  shrub: ['shrub'],
  lampPost: ['lampPost', 'lampHead'],
  bench: ['benchWood', 'benchMetal'],
  litterBin: ['litterBin'],
  bollardCap: ['bollardCap'],
  signpost: ['signPost', 'signPlate'],
  fenceBay: ['fenceBay'],
  tyreStack: ['tyreStack'],
  gantrySpan: ['gantrySpan'],
};

// ---------------------------------------------------------------------------
// Geometry helpers — flat-shaded, un-indexed, position and normal only
// ---------------------------------------------------------------------------

/**
 * Flat shading, and it is not a style choice.
 *
 * `IcosahedronGeometry` carries radial normals, so a twenty-face solid shades
 * as a smooth sphere with a faceted outline — a ball with a lie on it. Faceted
 * normals make the same twenty triangles read as a low-poly canopy, which is
 * what they are. Un-indexing first is what makes `computeVertexNormals` per
 * face rather than per shared vertex, and it also makes merging a concatenation.
 */
function flat(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index === null ? source : source.toNonIndexed();
  if (geometry !== source) source.dispose();
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Give a finished part geometry the white `color` attribute it cannot live
 * without, and its bounding sphere.
 *
 * **Applied to every part, in one place, on purpose.** The first pass added it
 * inside `merge`, which meant the seven parts made of a single primitive — the
 * shrub, the trunk, the bollard's finial, a building's box — never got one and
 * rendered black. See the instance-colour trap at the top of this file.
 */
function withInstanceColour(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.getAttribute('color') === undefined) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3),
    );
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Concatenate parts into one geometry. */
function merge(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const part of parts) {
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    }
    part.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function box(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  return flat(new THREE.BoxGeometry(width, height, depth)).translate(x, y, z);
}

/** A cylinder standing on `base`, centred on the local origin in XZ. */
function cylinder(
  radiusTop: number,
  radiusBase: number,
  height: number,
  sides: number,
  base: number,
): THREE.BufferGeometry {
  return flat(new THREE.CylinderGeometry(radiusTop, radiusBase, height, sides, 1, false))
    .translate(0, base + height / 2, 0);
}

/** A cone standing on `base`. */
function cone(
  radius: number,
  height: number,
  sides: number,
  base: number,
): THREE.BufferGeometry {
  return flat(new THREE.ConeGeometry(radius, height, sides, 1, false))
    .translate(0, base + height / 2, 0);
}

/**
 * The venue's start gantry, from the top of its legs upward.
 *
 * Local frame: `x` runs along the span, `y` up from the truss's underside, `z`
 * along the corridor the rider travels. The rider meets it head on, so the
 * wordmark is on the `-z` face and nowhere else — a real gantry's back is
 * blank, and a second copy would be three hundred triangles nobody sees.
 *
 * **Three colours, one draw call, no second material.** Every vertex carries a
 * ratio of `PROP_COLOURS.gantryPlate` in the `color` attribute — 1 on the
 * letters, the truss's own value on the frame, and `signalRed` on the banner,
 * each derived from the palette rather than typed here, so a change to the
 * barrier's red carries the banner with it. The same mechanism a building's
 * glazing bands use.
 */
function buildGantrySpan(): THREE.BufferGeometry {
  const size = PROP_SIZES.gantrySpan;
  const plate = linearFromHex(PROP_COLOURS.gantryPlate);
  /** One colour, as the ratio that reproduces it over the plate's albedo. */
  const over = (hex: number): [number, number, number] => {
    const target = linearFromHex(hex);
    return [target[0] / plate[0], target[1] / plate[1], target[2] / plate[2]];
  };
  const truss = over(PROP_COLOURS.gantryTruss);
  const banner = over(materialAppearance('signalRed').albedo);
  const white: [number, number, number] = [1, 1, 1];

  const pieces: THREE.BufferGeometry[] = [];
  const tones: [number, number, number][] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    tone: [number, number, number],
  ): void => {
    pieces.push(geometry);
    tones.push(tone);
  };

  /** A bar of `length` lying along local +x, turned by `angle` about +z. */
  const bar = (
    length: number,
    thickness: number,
    angle: number,
    x: number,
    y: number,
    z: number,
  ): THREE.BufferGeometry => (
    flat(new THREE.BoxGeometry(length, thickness, thickness))
      .rotateZ(angle)
      .translate(x, y, z)
  );

  // The two chords, and a post closing each end.
  const span = size.halfSpan * 2;
  add(bar(span, size.chord, 0, 0, size.chord / 2, 0), truss);
  add(bar(span, size.chord, 0, 0, size.trussHeight - size.chord / 2, 0), truss);
  for (const end of [-1, 1]) {
    add(
      bar(size.trussHeight, size.chord, Math.PI / 2, end * (size.halfSpan - size.chord / 2), size.trussHeight / 2, 0),
      truss,
    );
  }

  // Diagonals, zig-zagging between the chords. `braces` per half-span, so the
  // pattern is symmetric about the centre where the banner hangs.
  const bays = size.braces * 2;
  const bay = span / bays;
  const rise = size.trussHeight - size.chord * 2;
  const diagonal = Math.hypot(bay, rise);
  for (let index = 0; index < bays; index += 1) {
    const x = -size.halfSpan + bay * (index + 0.5);
    const up = index % 2 === 0;
    add(
      bar(diagonal, size.brace, Math.atan2(up ? rise : -rise, bay), x, size.trussHeight / 2, 0),
      truss,
    );
  }

  // The banner, standing proud of both chord faces.
  add(
    flat(new THREE.BoxGeometry(size.bannerHalfWidth * 2, size.bannerHeight, size.bannerThickness))
      .translate(0, size.trussHeight / 2, 0),
    banner,
  );

  // BELVAR, as plates standing off the face the rider arrives at. The strokes
  // are `render/inkKit.ts`'s own — one alphabet for the whole project — and a
  // stroke becomes one box per segment rather than a texture, which is why
  // invariant 12 still says two textures.
  const strokes = wordStrokes(GANTRY_WORDMARK, size.letterHeight);
  let widest = 0;
  for (const stroke of strokes) for (const [x] of stroke) if (x > widest) widest = x;
  const left = widest / 2;
  const top = size.trussHeight / 2 + size.letterHeight / 2;
  const face = -(size.bannerThickness / 2 + size.letterRelief / 2);
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      const [ax, ay] = stroke[index - 1];
      const [bx, by] = stroke[index];
      // Mirrored in x: the reader stands at -z looking along +z, so their
      // right is -x and a word laid out left to right runs the other way.
      const x0 = left - ax;
      const x1 = left - bx;
      const y0 = top - ay;
      const y1 = top - by;
      const length = Math.hypot(x1 - x0, y1 - y0);
      if (length < 1e-6) continue;
      add(
        bar(
          length + size.letterWeight,
          size.letterWeight,
          Math.atan2(y1 - y0, x1 - x0),
          (x0 + x1) / 2,
          (y0 + y1) / 2,
          face,
        ),
        white,
      );
    }
  }

  return mergeToned(pieces, tones);
}

/**
 * Merge parts that each carry their own flat colour into one geometry.
 *
 * `merge` above drops the `color` attribute because every other part in the
 * kit is one flat colour and takes its white in `withInstanceColour`. This is
 * the same concatenation with a tone per piece, which is what lets a gantry be
 * grey, red and white in one draw call.
 */
function mergeToned(
  pieces: readonly THREE.BufferGeometry[],
  tones: readonly (readonly [number, number, number])[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const tone = tones[index];
    const position = piece.getAttribute('position');
    const normal = piece.getAttribute('normal');
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      colours.push(tone[0], tone[1], tone[2]);
    }
    piece.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/**
 * A unit box standing on its base, with glazing bands up its four sides.
 *
 * Built by hand rather than from `BoxGeometry` for one reason: the strips need
 * different values in the `color` attribute, and every helper above fills that
 * attribute with white afterwards. Positions and normals are written directly,
 * un-indexed and flat-shaded like everything else in the kit.
 *
 * The perimeter is walked so that `(b - a) × up` points *outward* on every
 * side, which is what makes each strip's front face the one the sun lights —
 * derived rather than found by flipping signs until it looked right.
 */
function facadeBox(floors: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const glass = BUILDING_FACADE.glassTint;
  const half = 0.5;
  // Clockwise seen from above, so the outward normal falls out of the cross
  // product rather than being asserted.
  const perimeter: [number, number][] = [
    [-half, -half], [-half, half], [half, half], [half, -half],
  ];

  const quad = (
    ax: number, az: number, bx: number, bz: number,
    y0: number, y1: number,
    nx: number, nz: number,
    tone: { r: number; g: number; b: number },
  ): void => {
    const corners: [number, number, number][] = [
      [ax, y0, az], [bx, y0, bz], [bx, y1, bz],
      [ax, y0, az], [bx, y1, bz], [ax, y1, az],
    ];
    for (const [x, y, z] of corners) {
      positions.push(x, y, z);
      normals.push(nx, 0, nz);
      colors.push(tone.r, tone.g, tone.b);
    }
  };

  const white = { r: 1, g: 1, b: 1 };
  const bandHeight = 1 / floors;
  const spandrel = 1 - BUILDING_FACADE.glazing;

  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = perimeter[side];
    const [bx, bz] = perimeter[(side + 1) % 4];
    // (b - a) × up, normalised. Both terms are unit-length box edges, so the
    // result is already unit-length.
    const nx = -(bz - az);
    const nz = bx - ax;

    for (let floor = 0; floor < floors; floor += 1) {
      const base = floor * bandHeight;
      const glazed = floor > 0 || !BUILDING_FACADE.solidGroundFloor;
      if (!glazed) {
        quad(ax, az, bx, bz, base, base + bandHeight, nx, nz, white);
        continue;
      }
      const split = base + bandHeight * spandrel;
      quad(ax, az, bx, bz, base, split, nx, nz, white);
      quad(ax, az, bx, bz, split, base + bandHeight, nx, nz, glass);
    }
  }

  // Roof and underside. Plain, and the underside is only ever seen from a
  // block standing on a slope.
  for (const [y, ny] of [[1, 1], [0, -1]] as const) {
    const order: [number, number][] = ny > 0
      ? [[-half, -half], [-half, half], [half, half], [half, -half]]
      : [[-half, -half], [half, -half], [half, half], [-half, half]];
    const [p0, p1, p2, p3] = order;
    for (const [x, z] of [p0, p1, p2, p0, p2, p3]) {
      positions.push(x, y, z);
      normals.push(0, ny, 0);
      colors.push(1, 1, 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** A faceted lobe: the canopy, the shrub, and the bollard's finial. */
function blob(
  radius: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  return flat(new THREE.IcosahedronGeometry(radius, 0))
    .scale(scaleX, scaleY, scaleZ)
    .translate(x, y, z);
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/**
 * A deterministic value in [0, 1) from a world position and a salt.
 *
 * The same rule as the terrain's mottle and M5's particles (`DESIGN.md` §4
 * rule 3): an integer hash, never `Math.random`. A world that differs between
 * boots makes every visual regression capture meaningless, and it would make
 * this file's own tests meaningless with it.
 *
 * **It moved to `shared/maths.ts` at M12 Phase 0** and is re-exported under its
 * local name here, because the setback tower this hash decides is part of a
 * building's render cost and `data/renderCost.ts` has to predict that cost
 * without importing the renderer. The function is unchanged.
 */
const hash01 = positionHash01;

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

interface Bucket {
  /** Sixteen floats per instance. */
  readonly matrices: number[];
  /** Three linear floats per instance. */
  readonly colours: number[];
}

export function createProps(plan: LevelPlan): PropsView {
  const group = new THREE.Group();
  group.name = 'level-props';

  const props = plan.props ?? [];
  const buckets = new Map<PartId, Bucket>();

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const composed = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();

  const emit = (part: PartId, matrix: THREE.Matrix4, linear: THREE.Color): void => {
    let bucket = buckets.get(part);
    if (bucket === undefined) {
      bucket = { matrices: [], colours: [] };
      buckets.set(part, bucket);
    }
    for (const element of matrix.elements) bucket.matrices.push(element);
    bucket.colours.push(linear.r, linear.g, linear.b);
  };

  /** The part's albedo, jittered per instance. Linear throughout. */
  const tintOf = (part: PartId, prop: Prop, salt: number): THREE.Color => {
    const definition = PARTS[part];
    // `Color(hex)` decodes sRGB to linear on its own. A second conversion here
    // would land the value at about a seventh of its authored reflectance —
    // `DESIGN.md` §6b, the trap that has caught this project four times.
    colour.setHex(definition.albedo);
    if (definition.tint > 0) {
      const jitter = 1 + (hash01(prop.position.x, prop.position.z, salt) * 2 - 1) * definition.tint;
      colour.multiplyScalar(jitter);
    }
    return colour;
  };

  for (const prop of props) {
    position.set(prop.position.x, prop.position.y, prop.position.z);
    quaternion.setFromAxisAngle(up, prop.rotationY);
    scale.setScalar(prop.scale);
    base.compose(position, quaternion, scale);

    const simple = SIMPLE_PARTS[prop.kind];
    if (simple !== undefined) {
      for (const part of simple) emit(part, base, tintOf(part, prop, 11));
      continue;
    }

    // The one computed kind. Its body, parapet, and optional setback tower are
    // three instances of two parts at three metric scales, rather than three
    // authored geometries — a skyline is only interesting because no two of its
    // blocks are the same shape.
    const size = prop.size ?? { x: 12, y: 18, z: 12 };
    const shape = PROP_SIZES.building;
    /** Which facade a box of this height wears. See `buildingTall`. */
    const facade = (height: number): PartId => {
      if (height >= BUILDING_FACADE.highRiseHeight) return 'buildingTall';
      return height >= BUILDING_FACADE.lowRiseHeight ? 'buildingBody' : 'buildingLow';
    };
    // A setback tower keeps the original two, and stays suppressed when
    // neither fits it. That suppression is a statement about roof features
    // rather than about band heights, so giving short towers the low-rise
    // facade would restyle every skyline in the city to fix a paddock.
    const towerFacade = (height: number): PartId => (
      height >= BUILDING_FACADE.highRiseHeight ? 'buildingTall' : 'buildingBody'
    );

    colour.setHex(BUILDING_TONES[
      Math.floor(hash01(prop.position.x, prop.position.z, 3) * BUILDING_TONES.length)
      % BUILDING_TONES.length
    ]);
    colour.multiplyScalar(
      1 + (hash01(prop.position.x, prop.position.z, 5) * 2 - 1) * PROP_TINT_JITTER.building,
    );
    const tone = colour.clone();

    emit(
      facade(size.y),
      composed.multiplyMatrices(base, local.makeScale(size.x, size.y, size.z)),
      tone,
    );

    local.makeScale(size.x + shape.capOversail, shape.capHeight, size.z + shape.capOversail);
    local.setPosition(0, size.y, 0);
    emit('buildingCap', composed.multiplyMatrices(base, local), tintOf('buildingCap', prop, 7));

    if (hash01(prop.position.x, prop.position.z, 9) > 0.55) {
      const towerHeight = size.y * shape.towerHeightFraction;
      const towerPart = towerFacade(towerHeight);
      const towerFloors = towerPart === 'buildingTall'
        ? BUILDING_FACADE.highFloors
        : BUILDING_FACADE.lowFloors;
      // A short setback box is a roof feature, not a miniature four-storey
      // building. Suppress it when the shared facade would turn its bands into
      // sub-human stripes; the body and parapet still supply the roofline.
      if (towerHeight / towerFloors < BUILDING_FACADE.minFloorHeight) continue;
      local.makeScale(
        size.x * shape.towerWidthFraction,
        towerHeight,
        size.z * shape.towerWidthFraction,
      );
      local.setPosition(0, size.y + shape.capHeight, 0);
      emit(towerPart, composed.multiplyMatrices(base, local), tone);
    }
  }

  // -- One InstancedMesh per part -----------------------------------------
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  let instances = 0;
  let triangles = 0;
  let drawCalls = 0;
  let shadowTriangles = 0;
  let shadowDrawCalls = 0;

  const matrix = new THREE.Matrix4();
  for (const [part, bucket] of buckets) {
    const definition = PARTS[part];
    const count = bucket.colours.length / 3;
    if (count === 0) continue;

    const geometry = withInstanceColour(definition.build());
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: definition.roughness,
      metalness: definition.metalness,
      // Required for `instanceColor` to reach the fragment shader at all. The
      // geometry's white `color` attribute is the other half of it.
      vertexColors: true,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `level-props-${part}`;
    mesh.castShadow = definition.castShadow;
    mesh.receiveShadow = false;
    for (let index = 0; index < count; index += 1) {
      matrix.fromArray(bucket.matrices, index * 16);
      mesh.setMatrixAt(index, matrix);
      // `setRGB` with no colour space named writes the working space, which is
      // linear — which is what the values in the bucket already are.
      colour.setRGB(
        bucket.colours[index * 3],
        bucket.colours[index * 3 + 1],
        bucket.colours[index * 3 + 2],
      );
      mesh.setColorAt(index, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();

    group.add(mesh);
    meshes.push(mesh);
    geometries.push(geometry);
    materials.push(material);
    const partTriangles = (geometry.getAttribute('position').count / 3) * count;
    instances += count;
    triangles += partTriangles;
    drawCalls += 1;
    if (definition.castShadow) {
      shadowDrawCalls += 1;
      shadowTriangles += partTriangles;
    }
  }

  return {
    group,
    props: props.length,
    instances,
    drawCalls,
    triangles,
    shadowDrawCalls,
    shadowTriangles,

    dispose(): void {
      // InstancedMesh owns the GPU buffers behind instanceMatrix and
      // instanceColor. Disposing only its geometry/material leaves both alive
      // across a level rebuild even though renderer.info.memory appears flat.
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      meshes.length = 0;
      geometries.length = 0;
      materials.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
