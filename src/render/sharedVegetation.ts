/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared vegetation templates. Original physical envelopes remain authoritative. */
import { PROP_FOOTPRINTS, PROP_SIZES, PROP_SPREADS } from '../data/props.ts';
import {
  CROWN_ENVELOPE, CONIFER_ENVELOPE, SHRUB_ENVELOPE, toneFoliage,
} from './foliageKit.ts';
import { positionHash01 } from '../shared/maths.ts';
import {
  createVegetationBuilders,
  buildConiferDistanceForms,
  buildBroadleafDistanceForms,
  type VegetationContracts,
  type VegetationDetail,
  type VegetationPainter,
  type VegetationVariant,
} from './vegetationForms.ts';
import { packConiferDistanceForms } from './vegetationDistance.ts';
import { finishVegetationWood } from './vegetationWoodFinish.ts';
import { ultraTrunkRootJoin } from './ultra/ultraFoliage.ts';

function circleRadius(footprint: { readonly shape: string; readonly radius?: number }): number {
  if (footprint.shape !== 'circle' || footprint.radius === undefined) throw new Error('Expected original circular vegetation spread');
  return footprint.radius;
}

/** Derived references: no copied physical dimensions and no LevelPlan write. */
export const SHARED_VEGETATION_CONTRACTS: VegetationContracts = Object.freeze({
  crown: Object.freeze({
    min: CROWN_ENVELOPE.min,
    max: CROWN_ENVELOPE.max,
    spreadRadius: circleRadius(PROP_SPREADS.broadleafTree),
    rootY: PROP_SIZES.broadleafTree.trunkHeight,
    rootJoin: Object.freeze({ radiusTop: PROP_SIZES.broadleafTree.trunkRadiusTop,
      radiusBase: PROP_SIZES.broadleafTree.trunkRadiusBase, sides: PROP_SIZES.broadleafTree.trunkSides,
      ultra: ultraTrunkRootJoin() }),
  }),
  coniferFoliage: Object.freeze({
    min: CONIFER_ENVELOPE.min,
    max: CONIFER_ENVELOPE.max,
    spreadRadius: circleRadius(PROP_FOOTPRINTS.conifer),
    rootY: 0,
  }),
  shrub: Object.freeze({
    min: SHRUB_ENVELOPE.min,
    max: SHRUB_ENVELOPE.max,
    spreadRadius: circleRadius(PROP_FOOTPRINTS.shrub),
    rootY: 0,
  }),
});

/** Only if finite per-instance variant buckets are intentionally installed. */
export function vegetationVariantAt(x: number, z: number): VegetationVariant {
  return Math.floor(positionHash01(x, z, 617) * 3) as VegetationVariant;
}

/** Ordinary callback reuses the existing tone vocabulary without changing it. */
export const ordinaryVegetationPainter: VegetationPainter = (geometry, context) => {
  toneFoliage(geometry, context.reach);
  finishVegetationWood(geometry, context);
};

export function ordinaryVegetationBuilders(variant: VegetationVariant = 0, distanceDetail = false) {
  const builders = createVegetationBuilders(SHARED_VEGETATION_CONTRACTS, 'ordinary', variant, ordinaryVegetationPainter);
  if (!distanceDetail) return builders;
  return Object.freeze({ ...builders,
    crown: () => packConiferDistanceForms(buildBroadleafDistanceForms('crown', 'ordinary', variant,
      SHARED_VEGETATION_CONTRACTS.crown, ordinaryVegetationPainter)),
    shrub: () => packConiferDistanceForms(buildBroadleafDistanceForms('shrub', 'ordinary', variant,
      SHARED_VEGETATION_CONTRACTS.shrub, ordinaryVegetationPainter)),
    coniferFoliage: () => packConiferDistanceForms(
      buildConiferDistanceForms('ordinary', variant, SHARED_VEGETATION_CONTRACTS.coniferFoliage, ordinaryVegetationPainter)) });
}

/**
 * The Ultra material/tone owner supplies its existing palette painter. It is
 * required deliberately: a neutral-white Ultra shape is not a finished look.
 * No Ultra palette, AO, lighting or exposure constant is invented in this kit.
 */
export function ultraVegetationBuilders(paint: VegetationPainter, variant: VegetationVariant = 0, distanceDetail = false) {
  const builders = createVegetationBuilders(SHARED_VEGETATION_CONTRACTS, 'ultra', variant, paint);
  if (!distanceDetail) return builders;
  return Object.freeze({ ...builders,
    crown: () => packConiferDistanceForms(buildBroadleafDistanceForms('crown', 'ultra', variant,
      SHARED_VEGETATION_CONTRACTS.crown, paint)),
    shrub: () => packConiferDistanceForms(buildBroadleafDistanceForms('shrub', 'ultra', variant,
      SHARED_VEGETATION_CONTRACTS.shrub, paint)),
    coniferFoliage: () => packConiferDistanceForms(
      buildConiferDistanceForms('ultra', variant, SHARED_VEGETATION_CONTRACTS.coniferFoliage, paint)) });
}

export function neutralVegetationBuilders(detail: VegetationDetail, variant: VegetationVariant = 0) {
  return createVegetationBuilders(SHARED_VEGETATION_CONTRACTS, detail, variant);
}

