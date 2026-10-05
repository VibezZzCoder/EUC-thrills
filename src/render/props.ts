/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { buildAuthoredCanopyAdapter, buildAuthoredCanopyCrownAlias, disposeAuthoredCanopyCrownAlias, type PreparedAuthoredCanopies, type AuthoredCanopyRecord, type AuthoredCanopyBuiltReport } from './authoredCanopyOwner.ts';
import { assertVegetationPriceEmission, type PreparedVegetationPrice } from './sharedVegetationPricePlan.ts';
import { assertOriginalCapSlotEmission, type PreparedOriginalCapSlots } from './originalCapSlotPrice.ts';
import * as THREE from 'three';
import { routeSignPlateGeometry, routeSignInkGeometry } from './routeSignGeometry.ts';
import {
  BUILDING_FACADE,
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
import { enhancedConifer, enhancedCrown, shapedShrub, toneFoliage } from './foliageKit.ts';
import {
  FACADE_ATLAS_SIZE,
  FACADE_PAGES,
  paintFacadeAtlas,
  type FacadeAtlas,
  type FacadePageId,
} from './facadeAtlas.ts';
import { BASELINE_PRESENTATION } from './presentation.ts';
import { buildingSourceRecords } from './buildingSourceRecords.ts';
import { metricExtractionLedger } from './metricFacadePlan.ts';
import type { PreparedMetricFacades } from './metricFacadePreparation.ts';
import { METRIC_PROXY_ATTRIBUTE, metricSourceProxyAttribute, installMetricSourceProxy } from './metricSourceProxy.ts';
import { ULTRA_BUILDING_BUILDERS, ULTRA_FORM_BUILDERS, isReliefPart, ultraCasts } from './ultra/ultraKit.ts';
import {
  ULTRA_SLOT_ATTRIBUTE,
  installUltraSlotFarCaster,
  ultraSlotClosing,
  ultraSlotDepth,
  ultraSlotFarDepth,
} from './ultra/ultraBuildings.ts';
import { ULTRA_STATIC_LAYER, isUltraRecipe } from './ultra/ultraRecipe.ts';
import { ultraPropMaterial, ultraReliefDepthMaterial } from './ultra/ultraMaterials.ts';
import { createUltraFacadeMaps } from './ultra/facadeMaterialAtlas.ts';
import type { BuildRecipe, BuildRecipeId, UltraBuildContext, UltraFacadeMaps } from './ultra/ultraTypes.ts';
import { ordinaryVegetationBuilders, ultraVegetationBuilders, vegetationVariantAt } from './sharedVegetation.ts';
import { toneSharedVegetation } from './ultra/ultraFoliage.ts';
import type { VegetationFamily, VegetationVariant } from './vegetationForms.ts';
import type { SharedVegetationFamilyReport, SharedVegetationReport } from './sharedVegetationCost.ts';
import { ENVIRONMENT_VEGETATION } from '../data/tuning.ts';
import { installConiferDistanceCell, potentialGeometryTriangles, vegetationDistanceRanges,
  type VegetationDistanceDetail } from './vegetationDistance.ts';
import { EMPTY_SPATIAL_BATCHING_DELTA, genericPropSpatialKey, isSpatialGenericPart,
  priceGenericPropSpatialBatching, validateSpatialBatchMetres, type SpatialBatchingDelta } from './spatialBatching.ts';

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

export interface MetricSourceReport {
  readonly removedColourPieces: number;
  readonly proxyColourPieces: number;
  /** Submitted source colour work discarded by the flag; still charged. */
  readonly proxyColourTriangles: number;
  readonly proxyFlagBytes: number;
  readonly omittedByPart: readonly { readonly part: PartId; readonly instances: number }[];
  readonly proxyByPart: readonly { readonly part: PartId; readonly instances: number }[];
}
export interface PropsView {
  /** Render-only potential draw overhead; original admission stays unchanged. */
  readonly spatialBatching: SpatialBatchingDelta;
  readonly capSlotBytes: number;
  readonly farCapExtraDraws: number;
  readonly farCapExtraTriangles: number;
  readonly metricSource: MetricSourceReport | null;
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
   * These are potential draws before light-frustum culling. Historical world
   * batches span the world; opted-in generic cells have local casting bounds.
   */
  readonly shadowDrawCalls: number;
  readonly shadowTriangles: number;
  /**
   * Which topology this view was built with (`render/presentation.ts`), or the
   * Ultra rung it was built with (M39, `render/ultra/ultraRecipe.ts`).
   */
  readonly recipe: BuildRecipeId;
  /**
   * GPU textures this view owns: the facade atlas when a facade is present —
   * or, on an Ultra view with facade maps, the three Ultra facade textures
   * (its own albedo copy, the normal and the ORM pages) in its place.
   */
  readonly textures: number;
  /**
   * Bytes of Ultra-owned GPU data this view holds, for the Ultra ledger: the
   * facade maps, plus the caps' slot-closing attribute (A16, 4 B a cap
   * instance) when any cap closes a slot. Always 0 on an ordinary view.
   */
  readonly bytes: number;
  readonly sharedVegetation: SharedVegetationReport | null;
  dispose(): void;
}

/**
 * One instanced part. A kind is made of one or more of these, and two kinds
 * that share a part share its mesh — the broadleaf tree's crown and the crown
 * that tops one of the level's own trunk colliders are the same triangles in
 * the same draw call.
 */
export type PartId =
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
  | 'routeSignPlate'
  | 'routeSignTech'
  | 'routeSignAir'
  | 'fenceBay'
  | 'buildingBody'
  | 'buildingLow'
  | 'buildingTall'
  | 'buildingCap'
  | 'tyreStack'
  | 'gantrySpan'
  | 'roofGable';

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
  /**
   * Whether the part samples the facade atlas (`render/facadeAtlas.ts`).
   *
   * A facade's window groups, piers, plinth and closed shopfront are texels on
   * the quads the part already has, so the grouping costs no triangle and no
   * draw call. The three facade materials share one `DataTexture` per view.
   */
  readonly atlas?: boolean;
}

/**
 * The enhanced recipe's geometry, for the parts it rebuilds. Same buckets,
 * same envelopes, same instance transforms; only the triangles differ, and
 * `render/enhancedCatalog.ts` prices them (`render/presentation.ts`).
 */
const ENHANCED_BUILDERS: Readonly<Partial<Record<PartId, () => THREE.BufferGeometry>>> = {
  crown: enhancedCrown,
  coniferFoliage: enhancedConifer,
};

/** The baseline shape with the shared foliage tones written in. */
function tonedFoliage(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  toneFoliage(geometry);
  return geometry;
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
      return tonedFoliage(merge([
        blob(wide, 1, tree.crownHeight / (2 * wide), 0.92, 0, tree.crownCentre, 0),
        blob(tree.upperRadius, 1, 0.85, 1, tree.upperOffset, tree.upperCentre, -0.3),
      ]));
    },
    albedo: PROP_COLOURS.broadleafFoliage,
    roughness: 1,
    metalness: 0,
    tint: PROP_TINT_JITTER.foliage,
    castShadow: true,
  },

  coniferFoliage: {
    build: () => tonedFoliage(merge(
      PROP_SIZES.conifer.tiers.map((tier) => cone(
        tier.radius,
        tier.height,
        PROP_SIZES.conifer.tierSides,
        tier.base,
      )),
    )),
    albedo: PROP_COLOURS.coniferFoliage,
    roughness: 1,
    metalness: 0,
    tint: PROP_TINT_JITTER.foliage,
    castShadow: true,
  },

  shrub: {
    // Shaped rather than a squashed ball since the environment pass: the same
    // twenty faces, lobed and floored (`render/foliageKit.ts`), in every recipe.
    build: () => shapedShrub(),
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

  routeSignPlate: {
    build: routeSignPlateGeometry,
    albedo: PROP_COLOURS.routeSignPlate,
    roughness: 0.72, metalness: 0.04, tint: 0, castShadow: false,
  },
  routeSignTech: {
    build: () => routeSignInkGeometry('TECH'),
    albedo: PROP_COLOURS.routeSignInk,
    roughness: 0.82, metalness: 0, tint: 0, castShadow: false,
  },
  routeSignAir: {
    build: () => routeSignInkGeometry('AIR'),
    albedo: PROP_COLOURS.routeSignInk,
    roughness: 0.82, metalness: 0, tint: 0, castShadow: false,
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
    build: () => facadeBox(BUILDING_FACADE.lowFloors, { ground: 'ground', glass: 'glass' }),
    albedo: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    tint: 0,
    castShadow: false,
    atlas: true,
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
    build: () => facadeBox(BUILDING_FACADE.lowRiseFloors, { ground: 'groundLow', glass: 'glassLow' }),
    albedo: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    tint: 0,
    castShadow: false,
    atlas: true,
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
    build: () => facadeBox(BUILDING_FACADE.highFloors, { ground: 'groundTall', glass: 'glassTall' }),
    albedo: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    tint: 0,
    castShadow: false,
    atlas: true,
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

  /**
   * A pitched roof — M39 Phase 2's one new part. A unit triangular prism
   * standing on its base, the ridge along local z at the top: two slopes, two
   * gable ends and the underside an eave shows from the street. Houses wear
   * one, a shed a row of shallow ones, a spire two crossed at right angles
   * (`data/buildingLooks.ts`). It never casts, like every building part, which
   * is what keeps the library bound at the 160 ceiling.
   */
  roofGable: {
    build: () => roofGable(),
    albedo: 0xffffff,
    roughness: 0.85,
    metalness: 0,
    tint: 0,
    castShadow: false,
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
/** Which atlas pages a facade class wears on its ground floor and its glazing. */
interface FacadePages {
  readonly ground: FacadePageId;
  readonly glass: FacadePageId;
}

function facadeBox(floors: number, pages: FacadePages): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];

  const half = 0.5;
  // Clockwise seen from above, so the outward normal falls out of the cross
  // product rather than being asserted.
  const perimeter: [number, number][] = [
    [-half, -half], [-half, half], [half, half], [half, -half],
  ];

  // Every strip is folded onto one atlas page — the whole page across its
  // width, the whole page up its height — so the page's plinth, piers and
  // sills land where the strip's own edges are, whatever the instance's
  // metric size stretches the box to (`DESIGN.md` §7i). Since the atlas
  // carries the glazing, the colour attribute is white throughout and the
  // building's tone is the instance colour alone.
  const quad = (
    ax: number, az: number, bx: number, bz: number,
    y0: number, y1: number,
    nx: number, nz: number,
    page: FacadePageId,
  ): void => {
    const rect = FACADE_PAGES[page];
    const corners: [number, number, number, number, number][] = [
      [ax, y0, az, rect.u0, rect.v0], [bx, y0, bz, rect.u1, rect.v0], [bx, y1, bz, rect.u1, rect.v1],
      [ax, y0, az, rect.u0, rect.v0], [bx, y1, bz, rect.u1, rect.v1], [ax, y1, az, rect.u0, rect.v1],
    ];
    for (const [x, y, z, u, v] of corners) {
      positions.push(x, y, z);
      normals.push(nx, 0, nz);
      colors.push(1, 1, 1);
      uvs.push(u, v);
    }
  };

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
        quad(ax, az, bx, bz, base, base + bandHeight, nx, nz, pages.ground);
        continue;
      }
      const split = base + bandHeight * spandrel;
      quad(ax, az, bx, bz, base, split, nx, nz, 'spandrel');
      quad(ax, az, bx, bz, split, base + bandHeight, nx, nz, pages.glass);
    }
  }

  // Roof and underside. Plain, and the underside is only ever seen from a
  // block standing on a slope.
  for (const [y, ny] of [[1, 1], [0, -1]] as const) {
    const order: [number, number][] = ny > 0
      ? [[-half, -half], [-half, half], [half, half], [half, -half]]
      : [[-half, -half], [half, -half], [half, half], [-half, half]];
    const [p0, p1, p2, p3] = order;
    const plain = FACADE_PAGES.plain;
    for (const [x, z] of [p0, p1, p2, p0, p2, p3]) {
      positions.push(x, y, z);
      normals.push(0, ny, 0);
      colors.push(1, 1, 1);
      uvs.push(x + half > 0.5 ? plain.u1 : plain.u0, z + half > 0.5 ? plain.v1 : plain.v0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * The facade atlas as a GPU texture: painted once per process, uploaded once
 * per view, disposed with the view.
 *
 * The pixels are pure arithmetic (`render/facadeAtlas.ts`) and are kept after
 * the first paint; the `DataTexture` is not, because a texture is a GPU
 * resource and every one of those has an owner and a disposal path
 * (invariant 10). A world swap therefore re-uploads 1 MiB and repaints
 * nothing, and `renderer.info.memory.textures` plateaus across regeneration.
 */
let facadePixels: FacadeAtlas | null = null;

function createFacadeTexture(): THREE.DataTexture {
  if (facadePixels === null) {
    facadePixels = paintFacadeAtlas({ glassTint: BUILDING_FACADE.glassTint });
  }
  const texture = new THREE.DataTexture(
    facadePixels.data,
    FACADE_ATLAS_SIZE,
    FACADE_ATLAS_SIZE,
    THREE.RGBAFormat,
  );
  // Painted as sRGB bytes; three decodes them to linear in the shader.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The roof prism, wound so every face's `(b - a) × (c - a)` points outward —
 * derived, not flipped until it looked right (`props.test.ts` checks it).
 */
function roofGable(): THREE.BufferGeometry {
  const h = 0.5;
  const triangles: [number, number, number][][] = [
    // The two slopes, ridge at (0, 1, z).
    [[-h, 0, h], [0, 1, h], [0, 1, -h]], [[-h, 0, h], [0, 1, -h], [-h, 0, -h]],
    [[h, 0, -h], [0, 1, -h], [0, 1, h]], [[h, 0, -h], [0, 1, h], [h, 0, h]],
    // The gable ends.
    [[-h, 0, h], [h, 0, h], [0, 1, h]],
    [[h, 0, -h], [-h, 0, -h], [0, 1, -h]],
    // The underside, seen only under an eave.
    [[-h, 0, -h], [h, 0, -h], [h, 0, h]], [[-h, 0, -h], [h, 0, h], [-h, 0, h]],
  ];
  const positions: number[] = [];
  for (const triangle of triangles) for (const vertex of triangle) positions.push(...vertex);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
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
  readonly part: PartId;
  readonly variant: VegetationVariant | null;
  readonly authored: AuthoredCanopyRecord[];
  readonly adapter: boolean;
  /** Sixteen floats per instance. */
  readonly matrices: number[];
  /** Three linear floats per instance. */
  readonly colours: number[];
  /** One source-colour proxy flag for every instance in this exact bucket. */
  readonly metricFlags: boolean[];
}

/**
 * Build a plan's dressing under a recipe.
 *
 * **M39 Ultra** (`docs/M39_ULTRA.md` §6.3 W3): an Ultra rung arrives with a
 * `context` (the shared uniforms, the device's anisotropy) and its kit, and
 * changes only what §4 lets it — each part's triangles (`ULTRA_FORM_BUILDERS`,
 * `ULTRA_BUILDING_BUILDERS`), its material, cast/receive flags, the relief
 * depth material and the static-shadow layer. The buckets, their names, the
 * instance counts, matrices and colours are computed above the branch and are
 * identical to the enhanced world's. Every Ultra statement below sits behind
 * `kit !== null`; with an ordinary recipe (and with no `context`, the
 * default) this function executes exactly the statements it always did.
 */
export function createProps(
  plan: LevelPlan,
  recipe: BuildRecipe = BASELINE_PRESENTATION,
  context?: UltraBuildContext,
  composition: { readonly sharedVegetation?: boolean; readonly metricFacades?: PreparedMetricFacades | null;
    readonly vegetationPrice?: PreparedVegetationPrice | null; readonly authoredCanopies?: PreparedAuthoredCanopies | null; readonly capSlots?: PreparedOriginalCapSlots | null;
    readonly spatialBatchMetres?: number;
    /** The owning renderer's colour-distance rules (RL-1); High's when absent. */
    readonly distanceDetail?: VegetationDistanceDetail } = {},
): PropsView {
  const kit = isUltraRecipe(recipe) ? recipe.ultra : null;
  if (kit !== null && context === undefined) {
    throw new Error(`createProps: the Ultra recipe "${recipe.id}" needs an UltraBuildContext`);
  }
  const spatialMetres = composition.spatialBatchMetres ?? Infinity;
  validateSpatialBatchMetres(spatialMetres);
  const spatialPrice = spatialMetres === Infinity ? null : priceGenericPropSpatialBatching(plan, spatialMetres,
    part => kit === null ? PARTS[part].castShadow : ultraCasts(part, PARTS[part].castShadow, kit), kit?.farShadow === true);
  const group = new THREE.Group();
  group.name = 'level-props';

  const preparedMetric = composition.metricFacades ?? null;
  if (preparedMetric && (preparedMetric.source !== plan || preparedMetric.disposed))
    throw new Error('Metric facade extraction needs the prepared original source world');
  const preparedVegetation = composition.vegetationPrice ?? null, preparedCaps = composition.capSlots ?? null;
  const preparedAuthored = composition.authoredCanopies === undefined ? preparedVegetation?.authored ?? null : composition.authoredCanopies;
  if ((preparedAuthored || preparedVegetation?.authored) && preparedVegetation?.authored !== preparedAuthored)
    throw Error('Authored canopy geometry/projection needs its identical prepared vegetation price owner');
  for (const owner of [preparedVegetation, preparedCaps, preparedAuthored]) if (owner && (owner.source !== plan || owner.disposed))
    throw new Error('Source accounting owner belongs to a different or disposed world');
  const authoredDetail = kit?.forms ? 'ultra' : 'ordinary';
  const selectedAuthored = composition.sharedVegetation ? preparedAuthored?.qualified(authoredDetail) : undefined;
  const metricDescriptor = preparedMetric?.descriptors ?? null;
  const extraction = metricDescriptor ? metricExtractionLedger(metricDescriptor) : null;
  const metricRoofKeys = new Set(metricDescriptor?.replacements.filter(record => record.replacement === 'residential-roof').map(record => record.key) ?? []);
  let removedColourPieces = 0, proxyColourPieces = 0, proxyColourTriangles = 0, proxyFlagBytes = 0;
  const omittedByPart = new Map<PartId, number>(), proxyByPart = new Map<PartId, number>();
  const observedSourceCounts = new Map<PartId, number>();
  const props = plan.props ?? [];
  const buckets = new Map<string, Bucket>();

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const composed = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();

  const emit = (part: PartId, matrix: THREE.Matrix4, linear: THREE.Color, metricProxy = false, authored: AuthoredCanopyRecord | null = null, adapter = false): void => {
    const family = part === 'crown' || part === 'coniferFoliage' || part === 'shrub';
    const variant = composition.sharedVegetation && family
      ? vegetationVariantAt(matrix.elements[12], matrix.elements[14]) : null;
    const pitch = ENVIRONMENT_VEGETATION.treeBatchMetres;
    if (authored && (variant === null || part !== 'crown' || !preparedAuthored || selectedAuthored?.get(authored.propIndex) !== authored)) throw Error('Authored square source bucket refused');
    const cell = `${part}-habit-${variant}-cell-${Math.floor(matrix.elements[12] / pitch)}-${Math.floor(matrix.elements[14] / pitch)}`;
    // Generic cells follow the original prop pivot, independently priced from
    // source data. Full emitted matrices still define each cell's bounds.
    const genericCell = genericPropSpatialKey(part, base.elements[12], base.elements[14], spatialMetres);
    const key = adapter && authored ? `${part}-habit-${variant}-adapter-${authored.key}` : authored ? `${cell}-square`
      : variant === null ? genericCell ?? part : cell;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { part, variant, authored: [], adapter, matrices: [], colours: [], metricFlags: [] };
      buckets.set(key, bucket);
    }
    if (bucket.adapter !== adapter) throw Error('Square source bucket role changed');
    if (authored) bucket.authored.push(authored);
    for (const element of matrix.elements) bucket.matrices.push(element);
    bucket.colours.push(linear.r, linear.g, linear.b);
    bucket.metricFlags.push(metricProxy);
  };

  /** The part's albedo, jittered per instance. Linear throughout. */
  const tintOf = (part: PartId, prop: Prop, salt: number): THREE.Color => {
    const definition = PARTS[part];
    // `Color(hex)` decodes sRGB to linear on its own. A second conversion here
    // would land the value at about a seventh of its authored reflectance —
    // `DESIGN.md` §6b, the trap that has caught this project four times.
    colour.setHex(definition.albedo);
    const tint = part === 'crown' && preparedVegetation ? PROP_TINT_JITTER.structure : definition.tint;
    if (tint > 0) {
      const jitter = 1 + (hash01(prop.position.x, prop.position.z, salt) * 2 - 1) * tint;
      colour.multiplyScalar(jitter);
    }
    return colour;
  };

  const routeSigns = new Map<number, NonNullable<LevelPlan['routeSigns']>[number]>();
  for (const sign of plan.routeSigns ?? []) {
    if (!Number.isInteger(sign.propIndex) || props[sign.propIndex]?.kind !== 'signpost'
      || routeSigns.has(sign.propIndex) || !Number.isFinite(sign.rotationY)
      || (sign.upper.word !== 'TECH' && sign.upper.word !== 'AIR')
      || sign.upper.side !== -1 || sign.lower.word !== 'SAFE' || sign.lower.side !== 1) {
      throw new Error('route sign requires one original pole and a supported face');
    }
    routeSigns.set(sign.propIndex, sign);
  }
  for (const [propIndex, prop] of props.entries()) {
    position.set(prop.position.x, prop.position.y, prop.position.z);
    quaternion.setFromAxisAngle(up, prop.rotationY);
    scale.setScalar(prop.scale);
    base.compose(position, quaternion, scale);

    const sign = routeSigns.get(propIndex);
    if (sign !== undefined) {
      emit('signPost', base, tintOf('signPost', prop, 11));
      local.makeRotationY(sign.rotationY - prop.rotationY);
      composed.multiplyMatrices(base, local);
      emit('routeSignPlate', composed, tintOf('routeSignPlate', prop, 11));
      const ink = sign.upper.word === 'AIR' ? 'routeSignAir' : 'routeSignTech';
      emit(ink, composed, tintOf(ink, prop, 11));
      continue;
    }

    const simple = SIMPLE_PARTS[prop.kind];
    if (simple !== undefined) {
      for (const part of simple) {
        const authored = part === 'crown' && prop.kind === 'treeCanopy' ? selectedAuthored?.get(propIndex) ?? null : null;
        emit(part, base, tintOf(part, prop, 11), false, authored);
        if (authored) emit(part, base, tintOf(part, prop, 11), false, authored, true);
      }
      continue;
    }

    // Original source records are generated by the actual emitting owner,
    // independently of the metric replacement ledger and descriptor builder.
    for (const [pieceIndex, piece] of buildingSourceRecords(prop).entries()) {
      observedSourceCounts.set(piece.part, (observedSourceCounts.get(piece.part) ?? 0) + 1);
      const replaced = extraction?.consume(propIndex, pieceIndex, piece) ?? false;
      // Selected roofs leave both original colour and shadow submissions.
      // Their exact metric hull now casts; original selected wall proxies stay.
      if (replaced && (kit === null || metricRoofKeys.has(`${propIndex}/${pieceIndex}`))) {
        removedColourPieces++;
        omittedByPart.set(piece.part, (omittedByPart.get(piece.part) ?? 0) + 1);
        continue;
      }
      if (replaced) {
        proxyColourPieces++;
        proxyByPart.set(piece.part, (proxyByPart.get(piece.part) ?? 0) + 1);
      }
      quaternion.setFromAxisAngle(up, piece.yaw);
      position.set(piece.x, piece.y, piece.z);
      scale.set(piece.sx, piece.sy, piece.sz);
      local.compose(position, quaternion, scale);
      colour.setHex(piece.tone).multiplyScalar(piece.jitter);
      emit(piece.part, composed.multiplyMatrices(base, local), colour, replaced);
    }
  }
  extraction?.assertComplete();
  if (preparedMetric && (observedSourceCounts.size !== preparedMetric.sourceCounts.size
    || [...observedSourceCounts].some(([part, count]) => preparedMetric.sourceCounts.get(part) !== count)))
    throw new Error('Metric prepared counts differ from actual original source emission');
  const replacedCounts = new Map(omittedByPart);
  for (const [part, count] of proxyByPart) replacedCounts.set(part, (replacedCounts.get(part) ?? 0) + count);
  if (preparedMetric && (replacedCounts.size !== preparedMetric.removedCounts.size
    || [...replacedCounts].some(([part, count]) => preparedMetric.removedCounts.get(part) !== count)))
    throw new Error('Metric prepared omission differs from actual original source extraction');

  if (preparedVegetation) assertVegetationPriceEmission(preparedVegetation, buckets.values(), authoredDetail);
  if (preparedCaps) {
    const capMatrices = buckets.get('buildingCap')?.matrices ?? [];
    // Before allocation: actual independently emitted original matrices.
    assertOriginalCapSlotEmission(preparedCaps, capMatrices, null, false);
  }

  // -- One InstancedMesh per part or opted-in spatial cell -----------------
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const releaseDistanceCells: (() => void)[] = [];
  let instances = 0;
  let triangles = 0;
  let drawCalls = 0;
  let shadowTriangles = 0;
  let shadowDrawCalls = 0;
  let genericColourDraws = 0, genericShadowDraws = 0, genericInstances = 0;

  const matrix = new THREE.Matrix4();
  let atlas: THREE.DataTexture | null = null;
  // M39 Ultra only: the view's facade maps (created once, with the first
  // facade part) and the one relief depth material every relief part shares.
  let maps: UltraFacadeMaps | null = null;
  let reliefDepth: THREE.MeshDepthMaterial | null = null;
  // A16: the cap bucket's own depth material when any cap closes a slot, and
  // the bytes of its per-instance attribute (Ultra-owned, in the ledger).
  let slotDepth: THREE.MeshDepthMaterial | null = null;
  let slotFarDepth: THREE.MeshDepthMaterial | null = null;
  let slotBytes = 0, farCapExtraDraws = 0, farCapExtraTriangles = 0;
  const sharedFamilies = new Map<VegetationFamily, SharedVegetationFamilyReport>();
  const authoredBuilt: AuthoredCanopyBuiltReport[] = [];
  const authoredAliases = new Map<VegetationVariant, THREE.BufferGeometry>();
  // Spatial batches share their habit's immutable geometry and material.
  // Only their instance buffers and local bounds belong to each mesh.
  const sharedResources = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }>();
  const proxyParts = new Set([...buckets.values()].filter(bucket => bucket.metricFlags.some(Boolean)).map(bucket => bucket.part));
  const proxyMaterials = new Set<THREE.MeshStandardMaterial>();
  let disposed = false;
  const releaseResources = (): void => {
    if (disposed) return;
    disposed = true;
    group.clear(); group.removeFromParent(); // Retire every drawable before disposal callbacks.
    for (const release of releaseDistanceCells) release();
    releaseDistanceCells.length = 0;
    // InstancedMesh owns its instance buffers; geometry owns source proxy bytes.
    for (const mesh of meshes) mesh.dispose();
    const aliases = new Set(authoredAliases.values());
    for (const geometry of aliases) disposeAuthoredCanopyCrownAlias(geometry, 'final-owner'); // All drawables retired; any uploaded alias releases shared VBOs.
    for (const geometry of geometries) if (!aliases.has(geometry)) geometry.dispose();
    for (const material of materials) material.dispose();
    atlas?.dispose(); atlas = null;
    maps?.dispose(); maps = null;
    reliefDepth?.dispose(); reliefDepth = null;
    slotDepth?.dispose(); slotDepth = null;
    slotFarDepth?.dispose(); slotFarDepth = null;
    meshes.length = 0; geometries.length = 0; materials.length = 0;
    sharedResources.clear(); authoredAliases.clear(); proxyMaterials.clear();
  };
  try {
  for (const [key, bucket] of buckets) {
    const { part, variant } = bucket;
    const definition = PARTS[part];
    const count = bucket.colours.length / 3;
    if (count === 0) continue;

    const forms = variant === null ? null : kit?.forms
      ? ultraVegetationBuilders(toneSharedVegetation, variant, true) : ordinaryVegetationBuilders(variant, true);
    const build = (forms?.[part as VegetationFamily]) ?? (kit?.forms ? ULTRA_FORM_BUILDERS[part] : undefined)
      ?? (kit?.buildings ? ULTRA_BUILDING_BUILDERS[part] : undefined)
      ?? (recipe.foliage ? ENHANCED_BUILDERS[part] : undefined)
      ?? definition.build;
    const sharedGeneric = spatialMetres !== Infinity && isSpatialGenericPart(part);
    const sharesResource = variant !== null || sharedGeneric;
    const resourceKey = `${part}-habit-${variant}`, known = sharesResource ? sharedResources.get(resourceKey) : undefined;
    // Replacements only admit original body/roof parts, which have one unique
    // source geometry per bucket. Never attach bucket-local flags to a shared
    // foliage geometry, or price a silent clone as if it remained shared.
    if (proxyParts.has(part) && (variant !== null || known)) throw new Error('Metric proxy requires unique original building buckets');
    let geometry = known?.geometry ?? withInstanceColour(build());
    const canonicalGeometry = geometry;
    if (!known) geometries.push(geometry);
    if (kit !== null && kit.facadeMaps && definition.atlas === true) {
      // Ultra samples its own albedo copy (same texels, anisotropy set) with
      // the normal and ORM pages, so the ordinary atlas is never uploaded.
      if (maps === null) maps = createUltraFacadeMaps(context!.maxAnisotropy);
    } else if (definition.atlas === true && atlas === null) atlas = createFacadeTexture();
    const material = known?.material ?? (kit === null
      ? new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: definition.roughness,
        metalness: definition.metalness,
        // Required for `instanceColor` to reach the fragment shader at all. The
        // geometry's white `color` attribute is the other half of it.
        vertexColors: true,
        map: definition.atlas === true ? atlas : null,
      })
      : ultraPropMaterial(part, {
        vegetationWood: geometry.hasAttribute('vegetationWood'),
        roughness: definition.roughness,
        metalness: definition.metalness,
        map: definition.atlas === true ? (maps?.albedo ?? atlas) : null,
      }, context!, definition.atlas === true ? maps : null));
    if (!known) {
      materials.push(material);
      if (sharesResource) sharedResources.set(resourceKey, { geometry, material });
    }

    let allocatedAuthoredBytes = 0;
    if (bucket.authored.length) {
      if (!preparedAuthored || variant === null) throw Error('Authored square has no prepared finite owner');
      if (bucket.adapter) {
        const built = buildAuthoredCanopyAdapter(preparedAuthored, bucket.authored[0], authoredDetail, canonicalGeometry);
        geometry = built.geometry; geometries.push(geometry); authoredBuilt.push(built.report); allocatedAuthoredBytes = built.report.geometryBytes;
      } else {
        const removed = preparedAuthored.profile(bucket.authored[0], authoredDetail).removedRootTriangles;
        if (bucket.authored.some(record => preparedAuthored.profile(record, authoredDetail).removedRootTriangles !== removed)) throw Error('Square shared leader prefix changed');
        const alias = authoredAliases.get(variant);
        if (alias) geometry = alias;
        else { geometry = buildAuthoredCanopyCrownAlias(canonicalGeometry, authoredDetail, removed); geometries.push(geometry);
          authoredAliases.set(variant, geometry); allocatedAuthoredBytes = geometry.index!.array.byteLength; }
      }
    }

    if (proxyParts.has(part)) {
      if (!(material instanceof THREE.MeshStandardMaterial)) throw new Error('Metric proxy requires the original standard colour material');
      const flags = metricSourceProxyAttribute(bucket.metricFlags);
      if (flags.count !== count) throw new Error('Metric proxy instance/flag count mismatch');
      geometry.setAttribute(METRIC_PROXY_ATTRIBUTE, flags);
      proxyFlagBytes += flags.array.byteLength;
      if (!proxyMaterials.has(material)) { installMetricSourceProxy(material); proxyMaterials.add(material); }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    meshes.push(mesh);
    mesh.name = `level-props-${key}`;
    mesh.castShadow = definition.castShadow;
    mesh.receiveShadow = false;
    if (kit !== null) {
      // D2: building parts cast under the Ultra kit; every other part keeps
      // its authored flag. Every part receives once the Ultra lighting is on.
      mesh.castShadow = ultraCasts(part, definition.castShadow, kit);
      mesh.receiveShadow = kit.lighting;
      // A16, round 2 item 3: caps under 2 m from a neighbouring cap close the
      // slot between them in the shadow depth passes only — one byte per side
      // per instance, read by the cap's own near depth material
      // (`ultraSlotDepth`) and by its far-map draw (`ultraSlotFarDepth`).
      const slots = kit.buildings && part === 'buildingCap' ? ultraSlotClosing(bucket.matrices, count) : null;
      if (preparedCaps && part === 'buildingCap') assertOriginalCapSlotEmission(preparedCaps, bucket.matrices, slots, kit.buildings);
      if (slots !== null) {
        geometry.setAttribute(ULTRA_SLOT_ATTRIBUTE, new THREE.InstancedBufferAttribute(slots, 4, true));
        slotBytes += slots.byteLength;
        slotDepth = ultraSlotDepth(ultraReliefDepthMaterial(context!));
        mesh.customDepthMaterial = slotDepth;
        slotFarDepth = ultraSlotFarDepth();
        installUltraSlotFarCaster(mesh, slotFarDepth);
      } else if (kit.buildings && isReliefPart(part)) {
        // The shadow pass draws the relief where the colour pass does.
        if (reliefDepth === null) reliefDepth = ultraReliefDepthMaterial(context!);
        mesh.customDepthMaterial = reliefDepth;
      }
      // What casts is what the static far map freezes (§3.4); nothing else
      // joins its layer.
      if (mesh.castShadow) mesh.layers.enable(ULTRA_STATIC_LAYER);
    }
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
    const distanceRanges = vegetationDistanceRanges(geometry);
    if (distanceRanges) releaseDistanceCells.push(installConiferDistanceCell(mesh, composition.distanceDetail));

    group.add(mesh);
    // Packed distance alternatives allocate all buffers but submit one range.
    // The potential-work ledger keeps the complete accepted near draw.
    const sourceTriangles = potentialGeometryTriangles(geometry);
    const partTriangles = sourceTriangles * count;
    if (part === 'buildingCap' && slotBytes && kit?.farShadow) { farCapExtraDraws++; farCapExtraTriangles += partTriangles; }
    proxyColourTriangles += sourceTriangles * bucket.metricFlags.filter(Boolean).length;
    instances += count;
    triangles += partTriangles;
    drawCalls += 1;
    if (kit === null ? definition.castShadow : mesh.castShadow) {
      shadowDrawCalls += 1;
      shadowTriangles += partTriangles;
    }
    if (sharedGeneric) {
      genericColourDraws++; genericInstances += count;
      if (mesh.castShadow) genericShadowDraws++;
    }
    if (variant !== null) {
      const family = part as VegetationFamily, old = sharedFamilies.get(family);
      const instanceBytes = mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
      sharedFamilies.set(family, { part: family, instances: (old?.instances ?? 0) + count,
        sourceInstances: (old?.sourceInstances ?? 0) + (bucket.adapter ? 0 : count),
        variants: (old?.variants ?? 0) + Number(!known), drawCalls: (old?.drawCalls ?? 0) + 1,
        shadowDrawCalls: (old?.shadowDrawCalls ?? 0) + Number(mesh.castShadow),
        colourTriangles: (old?.colourTriangles ?? 0) + partTriangles,
        shadowTriangles: (old?.shadowTriangles ?? 0) + (mesh.castShadow ? partTriangles : 0),
        geometryBytes: (old?.geometryBytes ?? 0)
          + (known ? 0 : Object.values(canonicalGeometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) + (canonicalGeometry.index?.array.byteLength ?? 0))
          + allocatedAuthoredBytes,
        instanceBytes: (old?.instanceBytes ?? 0) + instanceBytes,
        distance: old?.distance,
        ...(!bucket.authored.length && distanceRanges ? { distance: {
          nearTriangles: distanceRanges.near.triangles,
          middleTriangles: distanceRanges.middle.triangles,
          farTriangles: distanceRanges.far.triangles,
          shadowDetail: 'near' as const,
        } } : {}) });
    }
  }

  // Every mesh receiving an affected program must carry its complete attribute,
  // including any material alias that shares the same shader program key.
  const proxyPrograms = new Set([...proxyMaterials].map(material => material.customProgramCacheKey()));
  for (const mesh of meshes) if (proxyPrograms.has((mesh.material as THREE.Material).customProgramCacheKey())
    && !mesh.geometry.hasAttribute(METRIC_PROXY_ATTRIBUTE)) throw new Error('Metric proxy program has a missing source attribute');
  // Independently counted source instances still prove attribute capacity.
  // Omitted residential roofs allocate no flags; retained body proxies need
  // one byte for EVERY surviving instance in their original source bucket.
  const expectedProxyBytes = kit === null || !preparedMetric ? 0 : [...preparedMetric.removedCounts]
    .reduce((sum, [part, removed]) => {
      const original = preparedMetric.sourceCounts.get(part) ?? 0;
      const omitted = omittedByPart.get(part) ?? 0, retained = proxyByPart.get(part) ?? 0;
      if (omitted > removed || omitted > original || retained !== removed - omitted)
        throw new Error('Metric retained proxy/omitted source partition differs from actual extraction');
      return sum + (retained > 0 ? original - omitted : 0);
    }, 0);
  if (proxyFlagBytes !== expectedProxyBytes) throw new Error('Metric allocated source proxy bytes differ from actual emission price');
  if (spatialPrice && (genericColourDraws !== spatialPrice.colourDraws || genericShadowDraws !== spatialPrice.shadowDraws
    || genericInstances !== spatialPrice.instances)) throw new Error('Generic spatial prop emission differs from source price');
  } catch (error) { releaseResources(); throw error; }
  return {
    spatialBatching: spatialPrice ?? EMPTY_SPATIAL_BATCHING_DELTA,
    capSlotBytes: slotBytes, farCapExtraDraws, farCapExtraTriangles,
    metricSource: metricDescriptor ? { removedColourPieces, proxyColourPieces, proxyColourTriangles, proxyFlagBytes,
      omittedByPart: [...omittedByPart].map(([part, instances]) => ({ part, instances })),
      proxyByPart: [...proxyByPart].map(([part, instances]) => ({ part, instances })) } : null,
    group,
    props: props.length,
    instances,
    drawCalls,
    triangles,
    shadowDrawCalls,
    shadowTriangles,
    recipe: recipe.id,
    textures: (atlas === null ? 0 : 1) + (maps === null ? 0 : 3),
    bytes: (maps === null ? 0 : maps.bytes) + slotBytes + proxyFlagBytes,
    sharedVegetation: !composition.sharedVegetation ? null : {
      recipe, detail: kit?.forms ? 'ultra' : 'ordinary', families: [...sharedFamilies.values()],
      geometryOwners: [...sharedFamilies.values()].reduce((sum, family) => sum + family.variants, 0) + authoredAliases.size + authoredBuilt.length,
      materialOwners: [...sharedFamilies.values()].reduce((sum, family) => sum + family.variants, 0),
      geometryBytes: [...sharedFamilies.values()].reduce((sum, family) => sum + family.geometryBytes, 0),
      instanceBytes: [...sharedFamilies.values()].reduce((sum, family) => sum + family.instanceBytes, 0), textures: 0,
      authoredSupports: authoredBuilt, authoredAliasOwners: authoredAliases.size,
      authoredAliases: [...authoredAliases].map(([variant, geometry]) => { const ranges = vegetationDistanceRanges(geometry)!;
        return { variant, nearTriangles: ranges.near.triangles, middleTriangles: ranges.middle.triangles, farTriangles: ranges.far.triangles, indexBytes: geometry.index!.array.byteLength }; }),
      ordinaryAuthoredTriangleDelta: preparedAuthored ? [...preparedAuthored.qualified('ordinary').values()].reduce((sum, record) => {
        const profile = preparedAuthored.profile(record, 'ordinary'); return sum + profile.adapterTriangles - profile.removedRootTriangles;
      }, 0) : 0,
      ordinaryBatchDrawDelta: preparedVegetation?.familiesFor('ordinary').reduce((sum, family) => sum + family.buckets.length * 2 - 2, 0),
      authoredSupportRefusals: preparedAuthored?.refusals ?? [],
      authoredUnselectedCanopies: props.filter(prop => prop.kind === 'treeCanopy').length - authoredBuilt.length,
    },

    dispose: releaseResources,
  };
}
