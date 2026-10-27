/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { createSquirrels, countSquirrels, withSquirrelCost, type Squirrels, type SquirrelsReport } from './squirrels.ts';
import type { WildlifeRider } from './wildlifePlan.ts';
import { PART_COSTS } from '../data/renderCost.ts';
import { ultraCasts } from './ultra/ultraKit.ts';
import { priceFeatureBlockBuild } from './featureBlockBuildPrice.ts';
import { authoredCanopyRequestFromSearch } from './authoredCanopyOwner.ts';
import { beginConstructionScope, withConstructionScope } from './constructionScope.ts';
import { scopedEnvironmentSites, scopedResidentialSites, scopedStreetFronts } from './scopedSiteQueries.ts';
import { prepareEnvironmentSupplementsSteps, priceEnvironmentSupplements, priceEnvironmentSpatialBatching,
  withSpatialBatchingSupplementPrice, type PreparedEnvironmentSupplements } from './environmentSupplementPrice.ts';
import { admitSharedGroundEdgesSteps, type GroundEdgeRefusal } from './sharedGroundEdgeAdmission.ts';
import { driveSteps, PREPARATION_SLICE, runSteps, type PreparationSlice, type Steps } from '../shared/preparationSteps.ts';
import type { PreparedGroundEdges } from './sharedGroundEdgePlan.ts';
import * as THREE from 'three';
import { CAMERA, CHASE, EUC, FX, LIGHTING, RENDER, VEGETATION_COUCH_DETAIL } from '../data/tuning.ts';
import { vegetationDetailFor, type VegetationDistanceDetail } from './vegetationDistance.ts';
import {
  materialAppearance,
  surfaceProperties,
  type ParticleId,
} from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { GhostSample } from '../simulation/ghost.ts';
import { createPose, type EucPose } from '../simulation/EucController.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import { createPopulationView, type PopulationView, type PopulationViewReport,
  type PopulationPainter, type PopulationRenderSnapshot } from './populationView.ts';
import { PRICED_POPULATION_LAYER, populationRosterAdmitted, pricedPopulationRoster } from './pricedPopulation.ts';
import { createCheckpointGates, type CheckpointGates } from './checkpointGates.ts';
import { createTargets, type TargetFamily } from './targets.ts';
import { createStreetLife, streetFronts, EMPTY_STREET_LIFE_REPORT, type StreetLife, type StreetLifeReport } from './streetLife.ts';
import { createEnvironmentDecor, EMPTY_ENVIRONMENT_DECOR_REPORT,
  type EnvironmentDecor, type EnvironmentDecorReport } from './environmentDecor.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { residentialSites, parkCaseSites } from '../level/districtSites.ts';
import { createDistrictDecor, EMPTY_DISTRICT_DECOR_REPORT,
  type DistrictDecor, type DistrictDecorReport } from './districtDecor.ts';
import { installStreetFacadeOpenings } from './streetFacadeOpenings.ts';
import { createDistrictExterior, type DistrictExterior, type DistrictExteriorReport } from './districtExterior.ts';
import { createDistrictExteriorAppearance } from './districtExteriorAppearance.ts';
import { createInstalledMetricFacade, type MetricFacade, type MetricFacadeReport } from './metricFacade.ts';
import { metricFacadeRequestFromSearch } from './metricFacadePreparation.ts';
import { UltraSupplements } from './ultra/ultraSupplements.ts';
import { createEnvironmentVegetation, type EnvironmentVegetation, type EnvironmentVegetationReport } from './environmentVegetation.ts';
import { createLaunchPadView, EMPTY_LAUNCH_PAD_REPORT, type LaunchPadView, type LaunchPadViewReport } from './launchPadView.ts';
import { createBirds, EMPTY_BIRDS_REPORT, type Birds, type BirdsReport } from './birds.ts';
import { type SharedVegetationReport } from './sharedVegetationCost.ts';
import { createGhostRider, type GhostRider } from './ghostRider.ts';
import { createCopRider, type CopRider } from './copRider.ts';
import { machineForCharacter } from '../data/machines.ts';
import { machineLook } from './machineLook.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';
import { createPaneShadowTrim } from './paneShadowTrim.ts';
import { PLAYABLE_RIDER_LOOKS, riderLook } from './riderLook.ts';
import { DEFAULT_CHARACTER, type CharacterId } from '../data/riders.ts';
import { createParticleField, type ParticleField } from './particles.ts';
import { createSky, type SkyTexture } from './sky.ts';
import { ORDINARY_SHADE_FILL, ordinaryBounceHex, ordinaryHemisphereIntensity } from './shadeFill.ts';
import { createContactShadows, riderBlobFade, type ContactShadows, type MovingBlob } from './contactShadows.ts';
import { CONTACT_SHADOW, createContactGround, type ContactGround } from '../level/contactShadowPlan.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import {
  DAYLIGHT_LOOK,
  resolveVenueLook,
  sameSkyPaint,
  type ResolvedVenueLook,
  type VenueLook,
} from '../data/venueLook.ts';
import { createTerrainSteps, type TerrainView, type OrdinaryBoundaryReport } from './terrain.ts';
import { freezeStaticTransforms } from './staticTransforms.ts';
import { DEFAULT_SPATIAL_BATCH_METRES, sumSpatialBatchingDeltas, withSpatialBatchingCost,
  type SpatialBatchingDelta } from './spatialBatching.ts';
import { releaseForLostContext } from './contextLoss.ts';
import {
  presentationRecipe,
  type PresentationRecipeId,
  type PresentationSelection,
  type PresentationVerdict,
} from './presentation.ts';
import { paneBounds, paneGridFor, type PaneRect } from '../shared/paneGrid.ts';
import { judgeUltra, ultraPartTriangles, type UltraCaps } from './ultra/ultraCost.ts';
import { buildUltraEnvironment } from './ultra/ultraEnvironment.ts';
import { ultraSkyOptions } from './ultra/ultraLighting.ts';
import { ultraFramebufferStatus } from './ultra/ultraRendererState.ts';
import {
  bakeUltraSkyBackground,
  measuredPropColourTriangles,
  ultraPresentationCost,
  UltraRuntime,
  UltraSkyCache,
  type BuiltPresentationCost,
  type ShaderErrorHook,
  type UltraHost,
} from './ultra/ultraRuntime.ts';
import type {
  BuildRecipe,
  UltraBuildContext,
  UltraFaultPlant,
  UltraKitOverride,
  UltraLiveTuning,
  UltraRefusal,
  UltraReport,
  UltraTierResult,
} from './ultra/ultraTypes.ts';

/**
 * Renderer, scene, camera, and the daytime lighting rig.
 *
 * Lighting, tone mapping, exposure, emissive levels, and — from M4 — the
 * distance haze are one coupled system with one owner (AGENTS.md invariant 6).
 * That owner is this file. Change them here, sequentially, and never in
 * parallel with another visual change. The fog's colour is the background
 * colour on purpose: moving one without the other produces a horizon band that
 * does not match the sky.
 *
 * Linear fog is a per-material built-in, not a post-processing pass, so
 * invariant 7 is intact. No post-processing is permitted until the performance
 * budget proves the frame has room for it.
 *
 * **The placeholder ground is gone at M4.** The renderer no longer describes
 * any part of the world; it is handed a `LevelPlan` and `render/terrain.ts`
 * builds the ground from it (invariant 2).
 *
 * **M5's contact effects are owned here** for the same reason as the lighting:
 * particle brightness is a member of the coupled visual system (invariant 6,
 * `DESIGN.md` §6), so the two fields are created, stepped, and disposed
 * alongside the rig they are judged against rather than by whichever system
 * happens to trigger them. `app/Game.ts` says *that* a landing or a scrape
 * happened; this file decides what it looks like.
 *
 * **M10's ghost and checkpoint gates are owned here for the same reason.** The
 * ghost's transparency and the gates' unlit brightness are both members of the
 * coupled visual system (invariant 6): they are judged against this exposure,
 * this tone mapping, and this haze, and one owner changing them sequentially is
 * the rule. `app/Game.ts` says which checkpoint is next and where the ghost is;
 * this file decides what either one looks like. Neither answers any gameplay
 * question — a gate here is three boxes, and the box that actually detects a
 * crossing lives in `simulation/challenge.ts` reading the same `LevelPlan`.
 */

export interface ViewportChange {
  /** True when the CSS-pixel size of the drawing surface actually changed. */
  readonly layoutChanged: boolean;
  readonly width: number;
  readonly height: number;
}

/**
 * What the game does when the GPU goes away and comes back.
 *
 * three.js already handles its own half of a context loss — it prevents the
 * event's default so the browser is allowed to restore, and rebuilds GPU
 * state on `webglcontextrestored`. What it cannot do is stop the simulation,
 * clear the player's held input, or tell anyone: without these callbacks the
 * game keeps running behind a dead canvas.
 */
export interface ContextLossCallbacks {
  onLost(): void;
  onRestored(): void;
}

/** The armed state of the M27 Phase 0 quad probe. See the field on the class. */
interface PerfQuadProbe {
  readonly rigs: { readonly rig: RidingRig; readonly at: { x: number; y: number; z: number } }[];
  readonly cameras: THREE.PerspectiveCamera[];
}

/**
 * Overlap at which a scrape throws its full spark rate. Read from `EUC` so the
 * rider's boot lift and the sparks normalise against the same number: a scrape
 * that looks half as deep also throws half as many sparks.
 */
const EUC_PEDAL_STRIKE_REFERENCE_DEPTH = EUC.pedalStrikeReferenceDepth;

/**
 * Particle colour per `ParticleId`. `none` is absent on purpose — a surface
 * that throws nothing emits nothing rather than a colourless puff.
 */
const PARTICLE_COLOURS: Partial<Record<ParticleId, number>> = FX.particleColours;

/**
 * The pack's trims — M39 Part P (§39.6b.3, q207). The most CPU cops the rule
 * ever fields is the solo face's `CHASE.roomSize − 1`, derived rather than
 * written because `roomSize` is the rule's one constant.
 */
const PACK_TRIMS = CHASE.roomSize - 1;

/**
 * Moving contact-shadow slots kept for riders beyond the population's own
 * (2026-10-22): four seats, the pack's three trims and the ghost.
 */
const CONTACT_RIDER_SLOTS = 4 + PACK_TRIMS + 1;

/** Shortest signed turn from `a` to `b`, radians. */
const contactAngleDelta = (a: number, b: number): number => {
  const d = (b - a) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
};

/**
 * The one place a venue's light is composed — M36 Phase 4.
 *
 * ## Why this is a unit and not four assignments in `setLevel`
 *
 * Sun direction, sun colour, hemisphere, sky, haze and exposure are ONE system
 * with ONE owner (invariant 6), and §36.7 restates it for the park: *"change
 * sun direction/colour, hemisphere, sky and exposure as one sequentially owned
 * system."* Gathered here, a venue swap is a single call that cannot leave half
 * a look behind, the fog colour and the sky's bottom stop are written from the
 * same field so a horizon band cannot come back, and — the reason that matters
 * most in practice — **the whole composition can be asserted at `node --test`**
 * with a plain `THREE.Scene` and two lights, because nothing in it needs a GL
 * context. `render/levelLifecycle.test.ts` drives park → slice → park through
 * this and checks every value and the texture count; a version of this welded
 * into `GameRenderer` could only ever be checked in a browser.
 *
 * It creates no light and no scene object. One directional light, one
 * hemisphere, one shadow map, no post-processing (invariant 7) — the rig is
 * handed the two lights the renderer already built and writes their fields.
 *
 * ## Which value wins: the venue or the F4 panel
 *
 * Both write exposure and the two intensities, from different directions, and
 * the rule is written down here because it is the only place that can enforce
 * it. `app/Game.ts:applyTuning` pushes **all three values on every change**,
 * including at boot, so an untouched panel arrives as exactly
 * `LIGHTING.exposure`, `LIGHTING.sunIntensity` and
 * `LIGHTING.hemisphereIntensity`. Treating "still equal to its shipped
 * default" as *unset* is therefore what lets a venue's authored value survive
 * a push nobody asked for, while any value a human has actually dragged is
 * different from its default and overrides the venue for as long as it is
 * dragged — which is what a tuning panel is for.
 *
 * Two consequences, stated rather than discovered:
 *
 *   1. Dragging a slider back to its exact default hands the value back to the
 *      venue rather than pinning the daylight number. On a world with no look
 *      those are the same number, so only the park can tell; there it is the
 *      behaviour wanted, because "untouched" is what the slider now reads.
 *   2. A live override **survives a venue swap**: `apply` re-states the tuned
 *      values after the venue's, so switching BelVar → park → BelVar with
 *      exposure dragged to 1.3 leaves it at 1.3 throughout.
 *
 * ## The tier — M39 (`docs/M39_ULTRA.md` §3.1–§3.2, §3.6)
 *
 * The rig is hung at a tier. `'ordinary'` is every Low, Medium and High frame
 * and is exactly the composition above, line for line. `'ultra'` changes three
 * things and only through the hooks the renderer hands in: the fill moves from
 * the hemisphere (kept, and written to W4's value — zero) to a PMREM
 * environment painted from this look's own sky; the sky is the Ultra painter's;
 * and both fill values are W4's `ultraFill`. Every value is absolute — nothing
 * is multiplied in and divided back out — so leaving Ultra is simply the
 * ordinary composition written again, and `applyTuned` stays last on both
 * tiers so the F4 panel still wins (§3.1).
 *
 * The sky's repaint key includes the tier, and the environment is rebuilt when
 * the look moves, so a venue swap at Ultra paints its sky and environment once.
 * An Ultra sky or environment that cannot be built is **never left half-hung**:
 * the rig falls back to the ordinary tier by itself, records `failure`, and the
 * runtime reads that to name the stage it refuses on.
 */
export type LightingTier = 'ordinary' | 'ultra';

/** The painted-sky PMREM environment an Ultra light is filled by (T1). */
export interface UltraEnvironment {
  readonly texture: THREE.Texture;
  /** The filtered target, when the builder names it: the activation checks its framebuffer (A28 C1). */
  readonly target?: THREE.RenderTarget;
  readonly bytes: number;
  readonly cubeSize: number;
  dispose(): void;
}

/**
 * What the Ultra tier needs that an ordinary rig never builds. The renderer
 * hands in `UltraRuntime.lightingHooks` (which time each build and are where a
 * `?ultrafault=` sky or environment failure is planted);
 * `levelLifecycle.test.ts` hands in counting fakes, which is how the whole tier
 * walk is asserted without a GL context.
 */
/**
 * An Ultra sky as the hook hands it to the rig: the painted equirect
 * (`texture`, what the report and the ledger read) and, when the runtime made
 * one, the colour-only cube it is drawn through (`background`, Fable F3 /
 * A22). `dispose` takes both. With no `background` the rig hangs `texture`,
 * and three converts it itself, as on the ordinary tier.
 */
export interface UltraSkyTexture extends SkyTexture {
  readonly background?: THREE.Texture;
}

export interface VenueLightingHooks {
  /** The Ultra sky for a look (T8). */
  ultraSky(look: ResolvedVenueLook): UltraSkyTexture;
  /**
   * The part of the Ultra sky's repaint key a look does not carry: the
   * installed plan's cumulus seed (`cumulusSeedFor(plan.id)`, gauntlet round
   * 1 item 4). The rig repaints an Ultra sky when it moves on an unchanged
   * look and tier, so two daylight worlds do not share one sky. Only ever
   * read on the Ultra tier; absent reads 0.
   */
  ultraSkyKey?(): number;
  /** The painted-sky environment for a look (T1), filtered once. */
  ultraEnvironment(look: ResolvedVenueLook): UltraEnvironment;
  /** The Ultra fill: W4's `ultraFill` with the live values bound. */
  ultraFill(look: ResolvedVenueLook, tunedHemisphere: number | undefined): {
    hemisphereIntensity: number;
    environmentIntensity: number;
  };
}

/** An Ultra piece the rig could not build, and fell back to the ordinary tier from. */
export interface VenueLightingFailure {
  readonly stage: 'sky' | 'environment';
  readonly message: string;
}

export interface VenueLighting {
  /** The look the scene is wearing, with every gap filled from `LIGHTING`. */
  readonly look: ResolvedVenueLook;
  /**
   * The sun's position relative to whatever it is lighting — the vector
   * `setShadowFocus` carries the single cascade around with, so the light's
   * *direction* is fixed and only the region it can cast into moves.
   */
  readonly sunOffset: THREE.Vector3;
  /** The painted sky on `scene.background`. Replaced, never accumulated. */
  readonly sky: SkyTexture;
  /** The tier the light is hung at — M39. `'ordinary'` unless the renderer asked. */
  readonly tier: LightingTier;
  /** The Ultra environment on `scene.environment`; always null on the ordinary tier. */
  readonly environment: UltraEnvironment | null;
  /** Why the last attempt to hang the Ultra tier fell back; null when it did not. */
  readonly failure: VenueLightingFailure | null;
  /**
   * Wear a venue's look, or daylight when it has authored none — at `tier`,
   * which defaults to the current one, so a look and a tier change together
   * paint once.
   */
  apply(authored: VenueLook | undefined, tier?: LightingTier): void;
  /** Re-hang the current look at another tier. A no-op at the current one. */
  setTier(tier: LightingTier): void;
  /**
   * Ultra only: re-run the fill (κ moved) and, when asked, rebuild the
   * environment (β moved, or the GL context was restored).
   */
  refreshUltra(rebuildEnvironment: boolean): void;
  /**
   * Ultra only: the GL context was lost (A28, FE, `UltraRuntime.onContextLost`).
   * The environment comes off the scene and is disposed while the lost
   * context makes its deletes no-ops. `refreshUltra(true)` builds the next one
   * on the restore, with no pre-loss object left to delete.
   */
  releaseUltraEnvironment(): void;
  /** What the F4 panel pushes. See the precedence rule above. */
  tune(values: {
    exposure?: number;
    sunIntensity?: number;
    hemisphereIntensity?: number;
  }): void;
  dispose(): void;
}

/** Every field of two resolved looks equal — the environment's rebuild key. */
function sameLook(a: ResolvedVenueLook, b: ResolvedVenueLook): boolean {
  for (const key of Object.keys(a) as (keyof ResolvedVenueLook)[]) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function createVenueLighting(
  parts: {
    readonly scene: THREE.Scene;
    readonly sun: THREE.DirectionalLight;
    readonly hemisphere: THREE.HemisphereLight;
    setExposure(exposure: number): void;
  },
  hooks?: VenueLightingHooks,
): VenueLighting {
  const { scene, sun, hemisphere, setExposure } = parts;

  const sunOffset = new THREE.Vector3();
  let look: ResolvedVenueLook = DAYLIGHT_LOOK;

  // M39: the tier the light is hung at, the tier the live sky was painted for,
  // and the Ultra environment (with the look it was filtered from). All three
  // stay at their ordinary values for the life of an ordinary session.
  let tier: LightingTier = 'ordinary';
  let skyTier: LightingTier = 'ordinary';
  // The Ultra sky's key beyond the look (the plan's cumulus seed), as painted.
  // Written and read on the Ultra tier only.
  let skyKey = 0;
  let environment: UltraEnvironment | null = null;
  let environmentLook: ResolvedVenueLook | null = null;
  let failure: VenueLightingFailure | null = null;

  const ultraHooks = (): VenueLightingHooks => {
    if (hooks === undefined) throw new Error('the Ultra lighting tier needs the renderer’s hooks');
    return hooks;
  };

  /**
   * The Ultra sky's current key beyond the look; 0 when the hooks carry none,
   * or a key that is not a finite number (Wave 4, R-L) — a NaN key would never
   * equal itself and repaint the sky on every apply.
   */
  const ultraSkyKeyNow = (): number => {
    const key = ultraHooks().ultraSkyKey?.();
    return typeof key === 'number' && Number.isFinite(key) ? key | 0 : 0;
  };

  // Painted once here so the first `apply` has something to compare against and
  // the no-descriptor path repaints nothing at all.
  let sky = createSky(look);
  scene.background = sky.texture;

  const fog = new THREE.Fog(look.horizonColour, look.fogNear, look.fogFar);
  scene.fog = fog;

  /**
   * Values a human has moved away from their shipped defaults. Empty on a
   * game nobody has opened the panel in, which is every shipped session.
   */
  const tuned: {
    exposure?: number;
    sunIntensity?: number;
    hemisphereIntensity?: number;
  } = {};

  const applyTuned = (): void => {
    setExposure(tuned.exposure ?? look.exposure);
    sun.intensity = tuned.sunIntensity ?? look.sunIntensity;
    // 2026-10-22, the shade fill (`render/shadeFill.ts`): the ordinary tier
    // hangs the venue's (or the panel's) hemisphere brighter, mostly in its
    // bounce half, so a face the sun cannot see reads as shade instead of a
    // black slab. Absolute multipliers of the authored numbers, written here
    // every time so a venue swap, a slider and a tier change all land on the
    // same composition. Sun, exposure, haze and sky are untouched on both tiers.
    const fill = tuned.hemisphereIntensity ?? look.hemisphereIntensity;
    hemisphere.intensity = ordinaryHemisphereIntensity(fill);
    hemisphere.groundColor.setHex(ordinaryBounceHex(look.groundBounceColour));
    // M39: on the Ultra tier the fill moves from the hemisphere to the
    // environment. Both values are W4's, computed from this look and the tuned
    // hemisphere — written over the lines above, never multiplied into them —
    // so the ordinary tier is the lines above and nothing else.
    if (tier === 'ultra') {
      const fill = ultraHooks().ultraFill(look, tuned.hemisphereIntensity);
      hemisphere.intensity = fill.hemisphereIntensity;
      scene.environmentIntensity = fill.environmentIntensity;
    }
  };

  /** The environment off the scene and disposed; the fill back to three's default. */
  const dropEnvironment = (): void => {
    scene.environment = null;
    scene.environmentIntensity = 1;
    const outgoing = environment;
    environment = null;
    environmentLook = null;
    outgoing?.dispose();
  };

  /** Drop back to the ordinary tier after an Ultra piece failed, saying which. Never throws. */
  const fallBack = (stage: VenueLightingFailure['stage'], error: unknown): void => {
    failure = { stage, message: error instanceof Error ? error.message : String(error) };
    tier = 'ordinary';
    dropEnvironment();
  };

  /**
   * Paint the sky for `target` at the current tier.
   *
   * The ordinary branch is the M36 sequence exactly — the outgoing texture is
   * disposed *before* the replacement is built. The Ultra branch paints first:
   * an Ultra painter can fail (a planted fault or a real one), and a failure
   * must never leave `scene.background` on a disposed texture. Nothing uploads
   * between the two statements either way — a `DataTexture` reaches the GPU on
   * its first frame — so the GPU never holds two skies on either tier.
   */
  const repaintSky = (target: ResolvedVenueLook): void => {
    if (tier === 'ultra') {
      let painted: UltraSkyTexture | null = null;
      const key = ultraSkyKeyNow();
      try {
        painted = ultraHooks().ultraSky(target);
      } catch (error) {
        fallBack('sky', error);
      }
      if (painted !== null) {
        sky.dispose();
        sky = painted;
        // F3: the Ultra sky is drawn through its own colour-only cube when
        // the runtime made one; `sky.texture` stays the painted equirect.
        scene.background = painted.background ?? sky.texture;
        skyTier = 'ultra';
        skyKey = key;
        return;
      }
    }
    sky.dispose();
    sky = createSky(target);
    scene.background = sky.texture;
    skyTier = 'ordinary';
  };

  /**
   * Ultra only: the PMREM environment for the current look, rebuilt when the
   * look moved (or when `force`d — β moved, or the context came back). The
   * outgoing one goes first, so two PMREM targets never coexist (§5's switch
   * peak). A failure falls the whole rig back, sky included.
   */
  const syncEnvironment = (force: boolean): void => {
    if (!force && environment !== null && environmentLook !== null && sameLook(environmentLook, look)) {
      return;
    }
    dropEnvironment();
    let built: UltraEnvironment | null = null;
    try {
      built = ultraHooks().ultraEnvironment(look);
    } catch (error) {
      fallBack('environment', error);
    }
    if (built === null) {
      if (skyTier !== tier) repaintSky(look);
      return;
    }
    environment = built;
    environmentLook = look;
    scene.environment = built.texture;
  };

  /**
   * Leave the tier the rig is hung at for `nextTier`, before the look is
   * composed: entering Ultra needs the hooks (checked first, so a refused
   * change moves nothing) and clears the last failure; leaving it takes the
   * environment off. The sky and the fill follow in `apply`.
   */
  const enterTier = (nextTier: LightingTier): void => {
    if (nextTier === 'ultra') {
      ultraHooks();
      failure = null;
    }
    tier = nextTier;
    if (tier === 'ordinary') dropEnvironment();
  };

  const rig: VenueLighting = {
    get look(): ResolvedVenueLook {
      return look;
    },
    sunOffset,
    get sky(): SkyTexture {
      return sky;
    },
    get tier(): LightingTier {
      return tier;
    },
    get environment(): UltraEnvironment | null {
      return environment;
    },
    get failure(): VenueLightingFailure | null {
      return failure;
    },

    apply(authored: VenueLook | undefined, nextTier: LightingTier = tier): void {
      const next = resolveVenueLook(authored);
      // M39: a look and a tier changed together are composed once, at the
      // tier they end on. An ordinary session never takes this branch.
      if (nextTier !== tier) enterTier(nextTier);

      // **The sky is the one part of a look that costs a GPU resource**, so it
      // is the one part that is skipped when nothing about it moved — which is
      // every venue swap in the game today, because only the park authors a
      // look at all. When it has moved, the outgoing texture is disposed
      // *before* the replacement is built: nothing renders between these two
      // statements, so the count never has two 1024x512 skies in it and
      // `resources().textures` plateaus across repeated rebuilds (invariant 10,
      // `tests/m36.spec.ts`). From M39 the key also carries the tier the live
      // sky was painted for (§3.2), which on an ordinary session never differs,
      // and the painting itself is `repaintSky`, whose ordinary branch is the
      // three statements that stood here. On the Ultra tier only, the key
      // also carries the plan's cumulus seed (`ultraSkyKey`), so a world swap
      // between two daylight plans repaints; an ordinary rig never asks.
      if (
        !sameSkyPaint(next, look)
        || skyTier !== tier
        || (tier === 'ultra' && ultraSkyKeyNow() !== skyKey)
      ) {
        repaintSky(next);
      }
      look = next;

      // The haze and the sky's bottom stop are the same field, written here in
      // the same breath as the background above. `DESIGN.md` §6.
      fog.color.setHex(look.horizonColour);
      fog.near = look.fogNear;
      fog.far = look.fogFar;

      hemisphere.color.setHex(look.skyColour);
      // The bounce colour is written by `applyTuned` below, with the shade
      // fill's scale on it (2026-10-22).
      sun.color.setHex(look.sunColour);

      // The same derivation the painted sun uses, from the same two numbers, so
      // a venue cannot light its shadows from one bearing and draw its sun at
      // another. `sunDistance` stays global: it is cosmetic for a directional
      // light and it sizes the shadow camera's far plane, which is budget.
      const horizontal = Math.cos(look.sunElevation) * LIGHTING.sunDistance;
      sunOffset.set(
        Math.sin(look.sunAzimuth) * horizontal,
        Math.sin(look.sunElevation) * LIGHTING.sunDistance,
        Math.cos(look.sunAzimuth) * horizontal,
      );
      // Re-hung on the cascade's current target rather than on the origin, so a
      // venue swap in the middle of a run does not teleport the key light off
      // the rider it was following. At construction the target is the origin
      // and this is exactly `position.copy(sunOffset)`.
      sun.position.copy(sun.target.position).add(sunOffset);

      // M39: the environment is this look's own sky, so it follows the look.
      if (tier === 'ultra') syncEnvironment(false);

      // Last, so a slider a human is holding outlives the venue under it.
      applyTuned();
    },

    setTier(nextTier: LightingTier): void {
      if (nextTier === tier) return;
      // The current look, re-stated: every value it resolves to is the one
      // already hung, so only the tier's own pieces move.
      rig.apply(look, nextTier);
    },

    refreshUltra(rebuildEnvironment: boolean): void {
      if (tier !== 'ultra') return;
      if (rebuildEnvironment) syncEnvironment(true);
      applyTuned();
    },

    releaseUltraEnvironment(): void {
      if (tier !== 'ultra') return;
      dropEnvironment();
    },

    tune(values): void {
      // "Equal to the shipped default" is the definition of untouched — see the
      // precedence rule on the interface. A value that matches is forgotten
      // rather than recorded, which is what hands it back to the venue.
      if (values.exposure !== undefined) {
        if (values.exposure === LIGHTING.exposure) delete tuned.exposure;
        else tuned.exposure = values.exposure;
      }
      if (values.sunIntensity !== undefined) {
        if (values.sunIntensity === LIGHTING.sunIntensity) delete tuned.sunIntensity;
        else tuned.sunIntensity = values.sunIntensity;
      }
      if (values.hemisphereIntensity !== undefined) {
        if (values.hemisphereIntensity === LIGHTING.hemisphereIntensity) {
          delete tuned.hemisphereIntensity;
        } else tuned.hemisphereIntensity = values.hemisphereIntensity;
      }
      applyTuned();
    },

    dispose(): void {
      scene.background = null;
      sky.dispose();
      // M39: an Ultra environment goes with the rig. The renderer tears Ultra
      // down before this, so on every path but a failed one it is already null.
      dropEnvironment();
    },
  };

  // Daylight, stated rather than assumed: the lights and the exposure are
  // written from the resolved look on the way in, so the rig's fields and the
  // scene agree from the first frame.
  rig.apply(undefined);
  return rig;
}

/**
 * The selection a diagnostic recipe override installs.
 *
 * The ladder's own verdicts are kept whole — both rungs, priced from the same
 * immutable plan — and only *which* of them the scene was built from changes,
 * so `presentation()` can never report the selector's cost beside the other
 * rung's geometry. The named rung is always on the ladder, so the lookup
 * cannot miss; `?? selected.cost` is there for the type, not for a case.
 *
 * **Exported for the reason `createVenueLighting` is**: it is the whole of
 * `setLevel`'s second parameter, and it is the half of it a headless test can
 * reach — `new GameRenderer(canvas)` wants a WebGL context and this project
 * has no headless one, so the composer is tested in
 * `render/presentation.test.ts` and the installed rungs are measured live in
 * `tests/m36_4.spec.ts`. Nothing in the game calls it but `setLevel`.
 */
export function forcedPresentation(
  selected: PresentationSelection,
  recipe: PresentationRecipeId,
): PresentationSelection {
  const verdict = selected.verdicts.find((candidate) => candidate.recipe === recipe);
  if (!verdict) throw new Error('Forced presentation has no priced recipe verdict');
  return {
    recipe: presentationRecipe(recipe),
    cost: verdict.cost,
    verdicts: selected.verdicts,
  };
}

/**
 * M42 (docs/PLANS.md §42): the free-ride launch pads, as `presentation()`
 * reports them (`render/launchPadView.ts`). `ids` and `visible` are what the
 * QA bridge and the parity spec read, and `visible` is the renderer's own
 * state (the pad group's), never a flag `Game` stores. Priced whether shown
 * or not: `drawCalls`/`colourTriangles`/bytes describe what is installed.
 */
export type LaunchPadPresentationReport = LaunchPadViewReport;

/**
 * M42: the render-only bird flock, as `presentation()` reports it
 * (`render/birds.ts`). `drawn` is set by the flock mesh's `onBeforeRender` in
 * the last rendered frame; `nextPass` and `clockSeconds` are world-clock
 * seconds (the simulation clock since the world's first drawn frame); both
 * are null/zero for a world with no flock.
 */
export type BirdPresentationReport = BirdsReport;

/**
 * `GameRenderer.presentation()` from M39: the ordinary `PresentationSelection`
 * fields, unchanged in name and meaning — they describe what was **actually
 * built**, which on an Ultra world is the Ultra rung — plus the tier the frame
 * is drawn at and the Ultra report (§6.3 W5).
 */
export interface RendererPresentation {
  readonly recipe: BuildRecipe;
  readonly cost: BuiltPresentationCost;
  /** The ordinary ladder's verdicts, both rungs, whatever was built. */
  readonly verdicts: readonly PresentationVerdict[];
  readonly tier: {
    readonly effective: 'ultra' | 'ordinary';
    readonly refusal: UltraRefusal | null;
  };
  /** `ultraReport()`, once Ultra has been asked for this session; null before. */
  readonly ultra: UltraReport | null;
  /** Installed owner reports; supplements are inclusively priced before selection. */
  readonly streetLife: StreetLifeReport;
  readonly environmentDecor: EnvironmentDecorReport;
  readonly districtDecor: DistrictDecorReport;
  readonly districtExterior: DistrictExteriorReport | null;
  readonly metricFacade: MetricFacadeReport | null;
  readonly districtExteriorMaterialOwners: number;
  readonly ordinaryBoundary: OrdinaryBoundaryReport | null;
  readonly sharedGround: import('./sharedGroundSurface.ts').SharedGroundReport | null;
  readonly sharedEdges: import('./sharedGroundEdgeMesh.ts').SharedGroundEdgeMeshReport | null;
  readonly featureBlocks: import('./featureBlockPlan.ts').FeatureBlockPrice | null;
  readonly groundEdgeRefusal: GroundEdgeRefusal | null;
  readonly sharedVegetation: SharedVegetationReport | null;
  readonly vegetation: EnvironmentVegetationReport | null;
  /** The roster drawn now (the active tier's, M47). */
  readonly population: PopulationViewReport | null;
  /**
   * M47: the roster `cost` and every admission verdict priced: the High roster
   * (`render/pricedPopulation.ts`), the largest any tier draws, so `cost`
   * reads the same at every tier. Null before a world, or when the world has
   * no density layer (it prices the one roster it draws). `population` is the
   * drawn roster's own report.
   */
  readonly pricedPopulation: { readonly layer: typeof PRICED_POPULATION_LAYER; readonly actors: number } | null;
  readonly supplementMaterialOwners: number;
  /** Installed cullable partitions; source admission/recipe verdicts stay historical. */
  readonly spatialBatching: SpatialBatchingDelta;
  readonly spatialGeometry: import('./terrain.ts').TerrainSpatialGeometryReport | null;
  /** M42: the free-ride launch pads (zeros until Builder B's view is installed). */
  readonly launchPads: LaunchPadPresentationReport;
  /** M42: the bird flock (zeros until Builder B's flock is installed). */
  readonly birds: BirdPresentationReport;
  readonly squirrels: SquirrelsReport | null;
}

/** A failed program's logs, for the Ultra shader-error hook (three's own report is silenced by a hook). */
function describeShaderError(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): string {
  const logs = [
    gl.getProgramInfoLog(program),
    gl.getShaderInfoLog(vertexShader),
    gl.getShaderInfoLog(fragmentShader),
  ]
    .map((log) => (log ?? '').trim())
    .filter((log) => log.length > 0);
  return logs.length > 0 ? logs.join('\n') : 'a program failed to link and left no log';
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /**
   * The frame's first view — M25 Phase 3.
   *
   * `viewCameras[0]` and this field are the same object, deliberately: every
   * reader that predates the split (the QA snapshot's `tuning.fieldOfView`,
   * four browser specs, `tools/rider-views.mjs`) means "the camera the player
   * is looking through", and in a left|right split that is still the left
   * half. A second camera is an addition, never a replacement.
   */
  readonly camera: THREE.PerspectiveCamera;

  /**
   * One camera per drawn view, left to right — M25 Phase 3.
   *
   * The array *is* the split: `viewCount === 1` is the single-player frame
   * this game has always drawn, and nothing about the two-view path is
   * conditional anywhere else. Cameras hold no GPU resource — no buffers, no
   * programs, nothing `renderer.info.memory` counts — so seating and
   * dismissing a second view costs an object and a projection matrix, which
   * is why `setViewCount` can be called at runtime without a plateau test of
   * its own.
   */
  private readonly viewCameras: THREE.PerspectiveCamera[] = [];

  /**
   * How much the split widens the vertical field of view, and where it stops.
   *
   * Pushed from `Game.applyTuning` rather than read from `CAMERA` here, for
   * the reason `setQuality` takes its ceiling as an argument: the tuning
   * store is the app layer's, and a renderer that reached into it would be a
   * second reader of a value the F4 panel can move. See `splitFieldOfView`.
   */
  private splitFovGain: number = CAMERA.splitFovGain;
  private splitFovCap: number = CAMERA.splitFovCap;

  /**
   * The same widening for a quadrant, which needs almost none — M27 Phase 1.
   *
   * A separate number rather than a shape-aware expression, because the two
   * shapes have different geometry and the owner judges each by eye: a half
   * loses 38 horizontal degrees and a quadrant loses none at all (§27.2). It
   * ships at `CAMERA.quadFovGain` and moves through the same F4 push.
   */
  private quadFovGain: number = CAMERA.quadFovGain;

  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly disposables: { dispose(): void }[] = [];

  /**
   * The M27 Phase 0 quad probe — an *instrument*, never a mode.
   *
   * `tools/perf-window.js --views 4` needs the honest four-seat frame — four
   * full passes of the real world, each with its own shadow render, through
   * four quadrant cameras — before any seat model for four exists, because the
   * scope lock that would *open* that seat model is decided on this frame
   * (`docs/PLANS.md` §27.6). So the renderer owns the whole arrangement: three
   * planted rigs standing beside the ridden one, three probe cameras framing
   * them chase-style, and a 2×2 pass loop. No seat, no input, no HUD, no
   * option, no URL — the surface is the QA bridge's `game.renderer`, which is
   * `spawnSecondRider`'s discipline exactly, and it is what keeps the phone
   * contract's unreachability argument intact (`tests/touch.spec.ts` still
   * pins one rider, one view, one HUD on mobile).
   */
  private perfProbe: PerfQuadProbe | null = null;

  /**
   * The couch's per-pane rider shadow trim — the owner's OD-3, 2026-10-17
   * (`render/paneShadowTrim.ts`). `app/Game.ts` hands it the seats' rigs
   * every frame (`syncSeatRigs`) and each pane's subject (`setPaneSubject`);
   * `renderView` switches every *other* seat rider's limb, boot and hand
   * shadows off for its own pass and back on in a `finally`. Only a frame of
   * more than one pane trims: one full-canvas view — solo, or the couch join
   * panel posing two to four chairs before a second claim splits it — keeps
   * every rider's whole shadow.
   */
  private readonly paneShadowTrim = createPaneShadowTrim();
  /**
   * The rig each pane is about, by view: the seat's own, the one a watching
   * outlaw follows, or null when it follows a CPU cop. Unset (or naming a rig
   * that is no longer seated) falls back to the seat of the same index.
   */
  private readonly paneSubjects: (RidingRig | null | undefined)[] = [];

  /** The world, built from a `LevelPlan`. Disposed and rebuilt with the level. */
  private terrain: TerrainView | null = null;
  private streetLife: StreetLife | null = null;
  private environmentDecor: EnvironmentDecor | null = null;
  private districtExterior: DistrictExterior | null = null;
  private metricFacade: MetricFacade | null = null;
  private districtExteriorAppearance: ReturnType<typeof createDistrictExteriorAppearance> | null = null;
  private districtDecor: DistrictDecor | null = null;
  private vegetation: EnvironmentVegetation | null = null;
  /** M42: the world's launch pads (one instanced mesh; priced shown or hidden). */
  private launchPadView: LaunchPadView | null = null;
  /**
   * M42: whether the mode shows the pads — the app's call, held here for the
   * reason `checkpointsVisible` is: a rebuild re-applies it, so a world swap
   * can never bring the pads back in the wrong state.
   */
  private launchPadsVisible = false;
  /**
   * M42: how many `warmPrograms` calls are in flight, each holding the pads
   * shown for upload. A count, not a flag, so overlapping warms never hide
   * the next world's pads between its compile and its zero-area draw.
   */
  private padWarms = 0;
  /** M42: the render-only flock; parked, never hidden, between passes. */
  private birds: Birds | null = null;
  private squirrels: Squirrels | null = null;
  /** One physical world's view, retained through pane/tier/context changes. */
  private population: PopulationView | null = null;
  /**
   * 2026-10-22: the contact shadows a frame without a shadow map lays down
   * (`render/contactShadows.ts`). One layer per world; its moving blobs are
   * rewritten once a frame, at the first pane, from what the frame draws.
   */
  private contactShadows: ContactShadows | null = null;
  private contactPlan: LevelPlan | null = null;
  private contactGround: ContactGround | null = null;
  /** Set by `beginFrame`, spent by the frame's first `renderView`. */
  private contactPending = true;
  /** This frame's population endpoints, as `updatePopulation` was handed them. */
  private contactPopulation: { previous: PopulationRenderSnapshot; current: PopulationRenderSnapshot; alpha: number } | null = null;
  private readonly contactActors = new Map<string, ActorSpec>();
  private readonly contactPrevious = new Map<string, PopulationRenderSnapshot['actors'][number]>();
  private readonly contactBlob: MovingBlob = { x: 0, y: 0, z: 0, headingY: 0, halfX: 0, halfZ: 0, strength: 0,
    innerX: 0, innerZ: 0, normalX: 0, normalY: 1, normalZ: 0 };
  private readonly contactRoots = new WeakMap<THREE.Object3D, THREE.Object3D>();
  private readonly supplements = new UltraSupplements();
  /**
   * Which presentation recipe the installed world was built with, and what
   * the selector priced it at. Chosen once in `setLevel`, after the plan is
   * immutable, and kept while seats join and leave (`render/presentation.ts`).
   */
  private presentationSelection: PresentationSelection | null = null;
  private preparedEnvironmentSupplements: PreparedEnvironmentSupplements | null = null;
  private preparedGroundEdges: PreparedGroundEdges | null = null;
  private groundEdgeRefusal: GroundEdgeRefusal | null = null;
  /**
   * What the current level repainted, held for anything that must match the
   * ground rather than the table. See `LevelPlan.palette`.
   *
   * Not a second palette: it is the same object the terrain resolved through,
   * kept because a particle that settles into the grass has to settle into
   * *this* level's grass.
   */
  private palette: LevelPlan['palette'] = undefined;

  /**
   * M10's checkpoint markers, built from the same plan. Rebuilt with the level
   * because a checkpoint belongs to a level; disposed with it for the same
   * reason.
   */
  private gates: CheckpointGates | null = null;
  /** The Knockabout target family — M14. Rebuilt with the level, like the gates. */
  private targets: TargetFamily | null = null;
  /**
   * Which targets are down, held **here** rather than only on the family.
   *
   * The same argument the two checkpoint fields above make, and a stronger case
   * for it: `setLevel` throws the instanced family away and builds a new one, so
   * without this a rebuild in the middle of a run repaints every struck target
   * standing — and the player who knocked them down watches the score stay put
   * while the world says otherwise. A WebGL context restore is the same event
   * wearing different clothes.
   */
  private struckTargets = new Set<string>();
  /** Whether the knock-down animation is suppressed. See `TargetFamily`. */
  private targetsReducedMotion = false;

  /**
   * What the challenge last asked the gates to show.
   *
   * Held on the renderer rather than only on the gates so a level rebuild
   * cannot silently drop it. `setLevel` throws away the markers and builds new
   * ones; without these two the gates would come back hidden and at index -1
   * in the middle of a run, which is the class of bug that only ever appears
   * on a retry.
   */
  private checkpointsVisible = false;
  private nextCheckpointIndex = -1;

  /**
   * M10's ghost. One at a time, for the life of the renderer.
   *
   * Built eagerly and left hidden rather than created on demand: it costs no
   * draw call while hidden, and a rig built mid-run would upload two dozen
   * geometries and compile a program at the moment the player is being timed.
   * A constant resource count across every mode is also the easier thing for
   * the QA bridge's plateau check to assert.
   *
   * **It stopped being `readonly` at M14.5**, when it became possible for the
   * player to be somebody else. A ghost is the player's own earlier run, so it
   * wears the player's own rider; a Cool Rider ghost racing a Trollina would
   * read as somebody else's time. `setCharacter` is the only place it is
   * replaced, and it is built to `setLevel`'s rule — one at a time, and a
   * second call disposes the first.
   */
  private ghost: GhostRider;
  /** Which rider the ghost is currently built as, so a repeat is a no-op. */
  private ghostCharacter: CharacterId = DEFAULT_CHARACTER;
  /**
   * M18's cop — and since M39 Part P the whole pack. Built once and hidden,
   * exactly as the ghost is.
   *
   * **One trim per pursuer the rule can field** (`CHASE.roomSize − 1`, three:
   * the solo face's pack, q207). Index 0 is the tail, built with
   * `createCopRider()` so every existing lookup — `cop-rider`, `cop-riding-rig`,
   * `cop-rider-pelvis` in the M18 and M30 specs and Ultra's rig names — still
   * finds him byte for byte; 1 and 2 are the patrols, `createCopRider({ index })`
   * naming them `cop2-` and `cop3-` so no two nodes share a name (R-7). Plain
   * rigs, not instanced (§39.6b.4: the instanced pack is modelled in the cost
   * tool and held as GP's remedy, not shipped). All built here, at once,
   * because a rig built mid-chase would upload two dozen geometries at the
   * moment the player is being hunted — the ghost's argument, three times.
   *
   * See `secondRider` below for why the pack and the ghost are one slot.
   */
  private readonly cops: readonly CopRider[];
  /**
   * How many trims of the pack the slot is showing: `cpuPackSize` in the solo
   * face (three, or `?cops=`'s count), zero whenever the slot is not `cop`.
   */
  private packShown = 0;
  /**
   * **Which second rider the frame is showing, and it is one field on purpose.**
   *
   * M39 Part P (R-7) keeps the words: `cop` now shows the pack — 1..3 trims,
   * `packShown` of them — and is still the one alternative to the ghost, so
   * the solo reserve is the worse of the ghost frame and the *pack* frame
   * (`render/renderCost.ts`, q209), never their sum.
   *
   * A Time-trial ghost and a chase cop are different modes and could have been
   * left as two independent booleans that simply never happened to be true
   * together. They are not, because the render budget depends on it: the
   * non-level reserve is measured as the *worse* of the two frames rather than
   * their sum (`render/renderCost.ts`), and on the densest known route the sum
   * does not fit the §9 ceiling. Two booleans would make that a convention
   * anybody could break by adding a call site; one field makes showing either
   * hide the other, in one expression, for good.
   */
  private secondRider: 'none' | 'ghost' | 'cop' = 'none';

  /** M5's two contact effects. Stepped from the fixed step, not the frame. */
  private readonly sparks: ParticleField;
  private readonly dust: ParticleField;

  /**
   * M7.5's painted sky, M4's haze, the key and the fill and the exposure, as
   * one unit — M36 Phase 4.
   *
   * The sky is background only: no geometry, no draw call. The rig replaces it
   * when a venue's look paints a different one and leaves it alone when it does
   * not, which is every swap between the worlds that ship today.
   */
  private readonly lighting: VenueLighting;

  private lastWidth = 0;
  private lastHeight = 0;
  private lastPixelRatio = 0;

  private contextCallbacks: ContextLossCallbacks | null = null;

  /**
   * Live copy of RENDER.maxPixelRatio. Held as a field rather than read from
   * the frozen defaults so the tuning panel can move it, and so a future
   * adaptive-quality step has one place to write.
   */
  private maxPixelRatio: number = RENDER.maxPixelRatio;

  /**
   * The ordinary tier `setQuality` last wrote — M39. The one fact about the
   * ordinary rig the Ultra teardown needs, so it can write that rig back
   * through W4's `shadowRigFor('ordinary', quality)` rather than remembering
   * the sun's fields (§3.1: no snapshot restore). The constructor's rig is
   * High's, so High is the answer until the app says otherwise.
   */
  private ordinaryQuality: 'low' | 'medium' | 'high' = 'high';

  /**
   * This renderer's colour-distance rules (RL-1), read by every vegetation
   * cell at draw time. Low and Medium move the existing near → middle → far
   * and grass-fade boundaries nearer; High, and Ultra drawn over it, keep the
   * accepted ones exactly. Per renderer, never module state. Three or more
   * panes (and the armed quad probe, which draws four) take the tier's couch
   * rules, whose quarter panes switch forms at the on-screen size solo play
   * at that tier does (PERF-R2-1); the rules are frozen objects, so the grass
   * program re-keys only when the pane count crosses that line.
   */
  private readonly vegetationDetail: VegetationDistanceDetail = () => vegetationDetailFor(this.ordinaryQuality,
    this.vegetationWarmPanes ?? (this.perfProbe !== null ? 4 : this.viewCameras.length), this.ultra.active);

  /** Set only inside `warmPrograms`, to link the other pane count's grass program. */
  private vegetationWarmPanes: number | null = null;

  /**
   * The Ultra runtime — M39 (`render/ultra/ultraRuntime.ts`). Every Ultra
   * decision, resource and exit lives there; this file calls into it at a few
   * guarded points and implements its `UltraHost`, the GPU-touching half.
   * Constructed before the venue rig, whose Ultra hooks it supplies.
   */
  private readonly ultra: UltraRuntime;

  /**
   * The painted Ultra skies, CPU-side (Fable I1): a world swap or a return to
   * the title under Ultra reuses a sky it has painted rather than painting
   * 2048×1024 again. Empty on a session that never asks for Ultra, and
   * emptied when Ultra is no longer wanted.
   */
  private readonly ultraSkies = new UltraSkyCache();

  /**
   * Fractional sparks owed from previous steps, **per emitter**.
   *
   * A scrape emits at a rate, and one 120 Hz step at 90 particles a second is
   * three quarters of a particle. Rounding that to zero would emit nothing
   * ever; rounding it to one would emit at 120 a second whatever the rate
   * says. Carrying the remainder makes the rate mean what it says.
   *
   * **An array rather than a number since M25 Phase 2.** The pool is shared
   * and stays shared — one `ParticleField`, one draw call, one `stepParticles`
   * clock — but the *remainder* is a fact about one rider's continuous scrape,
   * and two riders sharing one remainder hand each other's fractions back and
   * forth. `source` is the seat index, so the array grows with the seats and
   * a seat that never scrapes never costs a slot.
   */
  private readonly sparkDebt: number[] = [];

  /**
   * Fractional spray owed from previous steps — M13 Phase 2, per emitter since
   * M25 Phase 2.
   *
   * `sparkDebt`'s job for the other continuous emitter, and it is reset rather
   * than carried whenever the wheel leaves the water: a rider who crosses three
   * puddles should get three sprays that each start from nothing, not one that
   * remembers a fraction of a droplet from the last one.
   *
   * **This one had to become per-emitter or a second rider would have deleted
   * the feature.** The reset above fires from a caller who is *not* in water,
   * and `emitSurfaceSpray` is called every step by every rider — so with one
   * shared remainder, a dry seat 1 stepped after a wet seat 0 would zero the
   * debt every step. At 55 droplets a second and a 120 Hz step no single step
   * ever accrues a whole one, so the spray would have gone from a sheet of
   * water to nothing at all, silently, on the day a second seat existed.
   */
  private readonly splashDebt: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap is deprecated as of three 0.185 and silently falls back
    // to PCFShadowMap, so ask for what we actually get.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // **Both of these exist because a frame may now be more than one pass**
    // (M25 Phase 3, docs/PLANS.md §25.4).
    //
    // `autoClear` would clear at the top of *every* `render()` call, so the
    // second pass would wipe the first: the left half would be drawn and then
    // erased, every frame, and the canvas would show one rider on a full-width
    // view. `beginFrame` does the one clear instead.
    //
    // `info.autoReset` would reset the draw-call counters at the top of every
    // `render()` call, so the two runtime diagnostics that read them — the QA
    // snapshot's `render` block and the F3 overlay — would silently report the
    // *right-hand half only* and a split frame would look cheaper than a
    // single-player one. `beginFrame` resets once instead, which makes
    // `info.render.calls` the sum of every pass. That sum is precisely the
    // definition §25.4 gives for what a split frame costs.
    //
    // Both are set for the single-view path too. Two paths that reported
    // differently would be worse than either.
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();

    // **The sky, from M7.5.** Until then the background was one flat colour,
    // which is where most of the slice's "diagram of a place" reading came
    // from: no up cue, a hard horizon division, and no sign of the sun that
    // casts every shadow in the frame.
    //
    // The haze contract in `DESIGN.md` §6 is unchanged and is the reason the
    // fog still takes `horizonColour`: that value is now the sky's *bottom
    // stop* rather than the whole background, so the far edge of the surround
    // still dissolves into exactly the value the sky has where it meets it.
    // Moving one without the other puts the horizon band back — which is why,
    // from M36, one field on a venue's look carries both and
    // `createVenueLighting` below builds the sky and the fog together, once the
    // two lights it also writes exist. Until then they were four assignments
    // here, and a venue would have needed four more in `setLevel`.

    this.camera = new THREE.PerspectiveCamera(
      THREE.MathUtils.radToDeg(CAMERA.fovAtRest),
      1,
      CAMERA.near,
      CAMERA.far,
    );
    this.viewCameras.push(this.camera);

    // Hemisphere fill. Downward-facing surfaces sample groundBounceColour —
    // the underside of the wheel and, from M2, the rider. Too dark and those
    // become voids; too bright and nothing reads as sitting on the ground.
    //
    // Colour and intensity are handed to both lights by `createVenueLighting`
    // at the end of this block, from the resolved daylight look — the same
    // `LIGHTING` numbers, stated in one place instead of two. What stays here
    // is the part a venue may not touch: that there is exactly one of each,
    // and what the single shadow cascade costs.
    this.hemisphere = new THREE.HemisphereLight(
      DAYLIGHT_LOOK.skyColour,
      DAYLIGHT_LOOK.groundBounceColour,
      DAYLIGHT_LOOK.hemisphereIntensity,
    );
    this.scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(DAYLIGHT_LOOK.sunColour, DAYLIGHT_LOOK.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(LIGHTING.shadowMapSize);
    this.sun.shadow.bias = LIGHTING.shadowBias;
    this.sun.shadow.normalBias = LIGHTING.shadowNormalBias;
    // 2026-10-22, the shade fill's third number (`render/shadeFill.ts`): a cast
    // shadow keeps 22 % of the sun instead of none, so shadowed ground reads as
    // shade rather than a black hole. The map and its edges are unchanged. The
    // ordinary shadow rig (`ultraLighting.ts` `ordinaryRig`) restates it, which
    // is what the Ultra teardown writes back.
    this.sun.shadow.intensity = ORDINARY_SHADE_FILL.shadow;

    // A single cascade kept tight around the subject so texels stay dense
    // where they are actually read. It follows the rider from M3.
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -LIGHTING.shadowRadius;
    shadowCamera.right = LIGHTING.shadowRadius;
    shadowCamera.top = LIGHTING.shadowRadius;
    shadowCamera.bottom = -LIGHTING.shadowRadius;
    shadowCamera.near = 1;
    shadowCamera.far = LIGHTING.sunDistance * 2;
    shadowCamera.updateProjectionMatrix();

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // M39: the Ultra runtime, before the rig it hands its hooks to. It builds
    // nothing and writes nothing until the app asks for Ultra.
    this.ultra = new UltraRuntime(this.createUltraHost());

    // The sky, the haze, both light colours, both intensities and the exposure,
    // composed together (invariant 6). Daylight until a plan authors a look.
    this.lighting = createVenueLighting({
      scene: this.scene,
      sun: this.sun,
      hemisphere: this.hemisphere,
      setExposure: (exposure: number): void => {
        this.renderer.toneMappingExposure = exposure;
      },
    }, this.ultra.lightingHooks);

    // Dust dissolves into the air, so it fades toward the same horizon colour
    // the fog uses — a particle that ends by becoming the air it is in never
    // shows a hard edge as it dies. A spark does not dissolve; it cools and
    // goes out, so it has its own target.
    this.sparks = createParticleField({
      name: 'fx-sparks',
      capacity: FX.sparkCount,
      size: FX.sparkSize,
      gravity: FX.sparkGravity,
      fadeTo: FX.sparkFadeColour,
    });
    this.dust = createParticleField({
      name: 'fx-dust',
      capacity: FX.dustCount,
      size: FX.dustSize,
      gravity: FX.dustGravity,
      fadeTo: LIGHTING.horizonColour,
    });
    this.scene.add(this.sparks.points);
    this.scene.add(this.dust.points);

    this.ghost = createGhostRider();
    this.scene.add(this.ghost.group);
    // The pack's trims (M39 Part P): the tail first, un-indexed, so `cop-rider`
    // is still him; then the patrols as `cop2-`, `cop3-`. Hidden until a chase.
    const cops: CopRider[] = [];
    for (let index = 0; index < PACK_TRIMS; index += 1) {
      const cop = index === 0 ? createCopRider() : createCopRider({ index });
      cops.push(cop);
      this.scene.add(cop.group);
    }
    this.cops = cops;

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  /**
   * A pedal scraping the ground, at a world point.
   *
   * `depth` is the overlap past pedal clearance in radians; `side` is +1 for
   * the rider's left pedal. Sparks are thrown outward and back along the
   * ground rather than up, because that is where a scraped pedal actually
   * sends them and because upward sparks read as an explosion.
   *
   * Rate rather than count: the caller passes the step it is spending, so a
   * scrape lasting a tenth of a second and one lasting a second differ in how
   * much they throw rather than in whether they throw anything.
   *
   * `source` is which rider is scraping — the seat index (M25 Phase 2). It
   * addresses this rider's fractional remainder and nothing else: the pool,
   * the colour, the rate and the draw call are all still one thing.
   */
  emitSparks(
    source: number,
    x: number,
    y: number,
    z: number,
    depth: number,
    side: number,
    headingY: number,
    dt: number,
  ): void {
    const intensity = Math.min(1, depth / EUC_PEDAL_STRIKE_REFERENCE_DEPTH);
    if (intensity <= 0 || dt <= 0) return;
    const owed = (this.sparkDebt[source] ?? 0) + FX.sparkRatePerSecond * intensity * dt;
    const count = Math.floor(owed);
    this.sparkDebt[source] = owed - count;
    if (count <= 0) return;

    // Outward from the wheel on the scraping side and back along the travel,
    // in the rider's frame: +X is their left, +Z is forward.
    const outwardX = side * Math.cos(headingY);
    const outwardZ = side * -Math.sin(headingY);
    this.sparks.emit({
      x,
      y,
      z,
      count,
      speed: FX.sparkSpeed * (0.5 + 0.5 * intensity),
      spread: FX.sparkSpread,
      axisX: outwardX - Math.sin(headingY) * 0.6,
      axisY: 0.35,
      axisZ: outwardZ - Math.cos(headingY) * 0.6,
      lifeSeconds: FX.sparkLifeSeconds,
      colour: FX.sparkColour,
      intensity: FX.sparkIntensity,
    });
  }

  /**
   * What the tyre throws up on landing.
   *
   * The `particle` id comes from `data/surfaces.ts`, which has declared one
   * per surface since M4 marked the column "M5". A surface whose particle is
   * `none` throws nothing at all, which is what pavement should do.
   */
  emitLandingParticles(
    x: number,
    y: number,
    z: number,
    surface: SurfaceId,
    intensity: number,
  ): void {
    const properties = surfaceProperties(surface);
    const colour = PARTICLE_COLOURS[properties.particle];
    if (colour === undefined) return;
    const strength = Math.min(1, Math.max(0, intensity));
    const count = Math.round(FX.dustPerLanding * strength);
    if (count <= 0) return;
    this.dust.emit({
      x,
      y,
      z,
      count,
      speed: FX.dustSpeed * (0.4 + 0.6 * strength),
      // A hemisphere: the tyre displaces the surface outward in every
      // direction, not into a cone.
      spread: Math.PI * 0.5,
      axisX: 0,
      axisY: 1,
      axisZ: 0,
      lifeSeconds: FX.dustLifeSeconds,
      colour,
      // **Clippings settle back into the grass they came off.** Fading every
      // surface's dust toward the horizon makes a puff over dark grass get
      // brighter as it dies — the opposite of settling, and it reads as a pale
      // disc rather than as anything the wheel threw up.
      fadeTo: this.palette?.[properties.material]
        ?? materialAppearance(properties.material).albedo,
    });
  }

  /**
   * Spray thrown by a wheel crossing standing water — M13 Phase 2.
   *
   * **The one particle in the game emitted continuously rather than on an
   * event**, and the asymmetry is the design rather than an oversight. Every
   * other `ParticleId` is material lifted by an impact and settling back, so it
   * belongs to the landing that lifted it. A spill is a *place* (`DESIGN.md`
   * §6d): the rider is in it until they are out of it, and the spray is the
   * feedback that says which. That is the half of the spill's readability
   * problem the mesh family cannot solve, because a puddle has no relief to
   * give it.
   *
   * Driven off the surface table rather than off a hazard record, for the same
   * reason the ride response is: a spill reaches this layer as *ground*, and
   * `data/surfaces.ts` is what says which ground sprays. Any later surface that
   * wants continuous spray gets it by declaring `splash` and nothing else.
   *
   * Shares the dust pool, so `NON_LEVEL_RESERVE` does not move.
   *
   * `source` is which rider is riding through it — the seat index (M25 Phase
   * 2). It addresses only this rider's owed fraction, and it is the parameter
   * that keeps the "leaving the water clears the debt" rule below a statement
   * about *that* rider rather than about whoever called last.
   */
  emitSurfaceSpray(
    source: number,
    contact: boolean,
    x: number,
    y: number,
    z: number,
    surface: SurfaceId,
    speed: number,
    headingY: number,
    dt: number,
  ): void {
    // **Called on every step, including the ones that throw nothing**, because
    // the debt has to be cleared by leaving the water and a caller that simply
    // stopped calling would leave a fraction of a droplet owed across a jump.
    // `contact` is the caller's answer to "is the wheel on this surface" — the
    // renderer must not derive it, because that is a gameplay question
    // (invariant 3).
    const properties = surfaceProperties(surface);
    if (!contact || properties.particle !== 'splash' || dt <= 0) {
      this.splashDebt[source] = 0;
      return;
    }
    const colour = PARTICLE_COLOURS[properties.particle];
    if (colour === undefined) return;

    const strength = Math.min(1, Math.abs(speed) / FX.splashReferenceSpeed);
    // A stopped wheel sits in water without disturbing it, which is also what
    // keeps a crashed rider from spraying forever where they came off.
    if (strength <= 0) {
      this.splashDebt[source] = 0;
      return;
    }

    const owed = (this.splashDebt[source] ?? 0) + FX.splashRatePerSecond * strength * dt;
    const count = Math.floor(owed);
    this.splashDebt[source] = owed - count;
    if (count <= 0) return;

    // Up and *back* along the travel, which is where a tyre actually throws
    // water and what keeps the sheet behind the rider instead of in front of
    // the camera. +Z is forward, so the backward axis is the negated heading.
    this.dust.emit({
      x,
      y,
      z,
      count,
      speed: FX.splashSpeed * (0.35 + 0.65 * strength),
      spread: FX.splashSpread,
      axisX: -Math.sin(headingY) * 0.5,
      axisY: 1,
      axisZ: -Math.cos(headingY) * 0.5,
      lifeSeconds: FX.splashLifeSeconds,
      colour,
      fadeTo: FX.splashFadeColour,
    });
  }

  /**
   * Advance both fields. Called from the fixed step, not the render frame, so
   * `advance(n)` reaches the same field every run.
   */
  stepParticles(dt: number): void {
    this.sparks.step(dt);
    this.dust.step(dt);
  }

  /**
   * Forget what one emitter was owed — M25 Phase 2.
   *
   * A remainder belongs to the *rider* who accrued it, so a rider who leaves
   * takes theirs with them. Without this the next rider seated at the same
   * index would inherit up to one droplet and one spark of somebody else's
   * scrape: bounded and invisible, and still a resource with no disposal path,
   * which is the half of invariant 10 that is about discipline rather than
   * about memory.
   */
  forgetEmitter(source: number): void {
    this.sparkDebt[source] = 0;
    this.splashDebt[source] = 0;
  }

  /** Kill every particle. A reset must not leave sparks hanging in the air. */
  clearParticles(): void {
    this.sparks.clear();
    this.dust.clear();
    // Every emitter's owed fraction, not seat 0's: this clears the *pool*, and
    // a remainder left behind by a rider whose particles have just been thrown
    // away is a droplet owed for a scrape that no longer happened.
    this.sparkDebt.fill(0);
    this.splashDebt.fill(0);
  }

  /** How many particles are alive, for the QA bridge and the overlay. */
  particleCounts(): { sparks: number; dust: number } {
    return { sparks: this.sparks.live, dust: this.dust.live };
  }

  /**
   * Build the world from a plan. One level at a time; a second call disposes
   * the first, so a restart cannot leave the old terrain in the scene.
   *
   * The renderer takes a plan and returns nothing. It answers no gameplay
   * question about what it built (invariant 3) — `simulation/planSampler.ts`
   * reads the same plan for that, and neither consumer can see the other.
   *
   * **`recipe` is a diagnostic override and nothing else.** The selector is
   * the default and is what every player gets; naming a rung builds *that*
   * topology instead, so a browser can install the baseline over a world the
   * ladder would have enhanced and compare live GPU counters between the two
   * (M36 Phase 4, `p34-browser`'s open issue 1 — "both recipes render the
   * park" was previously only half-provable from outside). Three properties
   * keep it honest: the plan is never re-priced, so admission is untouched;
   * the reported `presentation()` still carries **both** rungs' verdicts, so
   * the cost named is the cost of the topology actually built; and nothing in
   * the game passes it — `app/Game.ts` reads it from a diagnostic URL
   * parameter, never from an option (the options firewall: a recipe is not
   * something a player configures).
   *
   * **M39: the world's tier is decided here too** (§6.3 W5). With Ultra
   * wanted, no override and no sticky refusal, W7's `judgeUltra` prices the
   * plan against the Ultra envelope *after* the ordinary selection has been
   * made (its verdicts are always computed and always reported); a pass builds
   * the Ultra rung and activates it, and a breach, a failure or a refusal
   * builds the ordinary selection exactly as before and records why. The plan
   * is never re-priced for admission and never trimmed. An override present
   * while Ultra is wanted is itself the refusal (`presentation-override`), so
   * a forced recipe can never be described as active Ultra.
   */
  setLevel(plan: LevelPlan, recipe?: PresentationRecipeId, populationPlan: PopulationPlan | null = null): TerrainView {
    const steps = this.levelBuildSteps(plan, recipe, populationPlan);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }

  /** Boot yields between real construction phases, without a second world
   * builder or a change to Ultra's ordered activation/GL-error sequence.
   * `onStage` receives only the three labelled stages; `onSlice` is asked at
   * every label-free `PREPARATION_SLICE` inside them (null = carry on), so
   * the boot can yield to the browser without a slice ever being a checkpoint.
   * The Ultra branch of `installWorld` stays one uninterrupted step. */
  async setLevelAsync(plan: LevelPlan, recipe: PresentationRecipeId | undefined,
    populationPlan: PopulationPlan, onStage: (label: string) => Promise<void>,
    onSlice: () => Promise<void> | null = () => null): Promise<TerrainView> {
    return driveSteps(this.levelBuildSteps(plan, recipe, populationPlan), { stage: onStage, slice: onSlice });
  }

  private *levelBuildSteps(plan: LevelPlan, recipe?: PresentationRecipeId,
    populationPlan: PopulationPlan | null = null): Generator<string | PreparationSlice, TerrainView, void> {
    yield 'Building streets and buildings';
    const oldPreparedSupplements = this.preparedEnvironmentSupplements;
    this.population?.dispose();
    this.population = null;
    this.contactShadows?.dispose();
    this.contactShadows = null;
    this.contactPlan = null;
    this.contactGround = null;
    this.contactPopulation = null;
    this.contactActors.clear();
    this.vegetation?.dispose();
    this.vegetation = null;
    this.preparedEnvironmentSupplements = null;
    this.preparedGroundEdges = null;
    this.groundEdgeRefusal = null;
    this.supplements.dispose();
    // M42: after the Ultra overlay has handed the pads their own material back.
    this.launchPadView?.dispose();
    this.launchPadView = null;
    this.squirrels?.dispose();
    this.squirrels = null;
    this.birds?.dispose();
    this.birds = null;
    this.metricFacade?.dispose();
    this.metricFacade = null;
    this.districtExterior?.dispose();
    this.districtExterior = null;
    this.districtExteriorAppearance?.dispose();
    this.districtExteriorAppearance = null;
    this.streetLife?.dispose();
    this.streetLife = null;
    this.environmentDecor?.dispose();
    this.environmentDecor = null;
    this.districtDecor?.dispose();
    this.districtDecor = null;
    this.terrain?.dispose();
    this.terrain = null;
    oldPreparedSupplements?.dispose();
    this.palette = plan.palette;
    // Presentation is a question asked of an immutable plan, never of the
    // generator: the richer topology is built only where every frame contract
    // still fits, and the plan is never trimmed to make it fit.
    // Pricing, admission and the terrain build ask the same pure questions of
    // this plan (site lists, vegetation form recipes) many times; one
    // construction scope answers each once (`render/constructionScope.ts`).
    let supplements: PreparedEnvironmentSupplements, terrain: TerrainView;
    const endConstruction = beginConstructionScope();
    try {
    // M47: priced at the High roster, the largest any tier draws (`render/pricedPopulation.ts`),
    // so the recipe, edges, supplements, pads and Ultra admission hold at every tier.
    supplements = yield* prepareEnvironmentSupplementsSteps(plan, pricedPopulationRoster(populationPlan), metricFacadeRequestFromSearch(window.location.search), authoredCanopyRequestFromSearch(window.location.search));
    this.preparedEnvironmentSupplements = supplements;
    yield PREPARATION_SLICE;
    const edgeAdmission = yield* admitSharedGroundEdgesSteps(plan, recipe, supplements);
    this.preparedGroundEdges = edgeAdmission.prepared;
    this.groundEdgeRefusal = edgeAdmission.refusal;
    const selected = edgeAdmission.selection;
    const selection = recipe === undefined || recipe === selected.recipe.id
      ? selected
      : forcedPresentation(selected, recipe);
    this.presentationSelection = selection;
    // **The single rebuild path is the single place a venue's light is hung**,
    // which is what makes park → BelVar → park restore each look without a
    // second mechanism to keep in step: every venue swap in the game reaches
    // here (`app/Game.ts:installLevel`), and a plan that authors no look
    // resolves to the daylight every world but the park is judged at. The rig
    // owns the ordering of sky, haze, key, fill and exposure (invariant 6).
    //
    // From M39 the runtime hangs it (`lighting.apply(plan.look, tier)`), because
    // the tier has to be decided first for the sky and environment to be
    // painted once; on an ordinary session that is `apply(plan.look,
    // 'ordinary')` followed by `createTerrain(plan, selection.recipe)`, the
    // two calls this method always made, installed the way it always was.
    // Roof casters must exist before Ultra bakes its once-per-world far map.
    // Their owner and borrowed appearance survive the tier rebuild, so this
    // installs them once rather than adding a second shadow pass later.
    this.districtExteriorAppearance = createDistrictExteriorAppearance();
    // The view owns the emitted geometry; the prepared owner keeps what terrain
    // rebuilds and pricing read (`createInstalledMetricFacade`, audit §5).
    this.metricFacade = createInstalledMetricFacade(plan, supplements.metric, this.districtExteriorAppearance);
    if (this.metricFacade) this.scene.add(this.metricFacade.group);
    if (this.metricFacade) freezeStaticTransforms(this.metricFacade.group);
    yield PREPARATION_SLICE;
    terrain = yield* this.ultra.installWorldSteps(plan, selection, recipe);
    } finally { endConstruction(); }
    yield 'Finishing streets and storefronts';
    this.streetLife = createStreetLife(plan, supplements.street);
    yield PREPARATION_SLICE;
    this.environmentDecor = createEnvironmentDecor(plan, supplements.environment);
    yield PREPARATION_SLICE;
    this.districtDecor = createDistrictDecor(plan, supplements.district);
    yield PREPARATION_SLICE;
    this.districtExterior = createDistrictExterior(plan, { ...this.districtExteriorAppearance,
      spatialBatchMetres: DEFAULT_SPATIAL_BATCH_METRES,
      protectedOpenings: [...streetFronts(plan), ...environmentSites(plan), ...residentialSites(plan), ...parkCaseSites(plan)] }, supplements.exterior);
    this.districtExterior.setDetail(this.effectiveTier() === 'ultra');
    yield 'Planting trees and grass';
    this.vegetation = createEnvironmentVegetation(plan, supplements.grass, this.vegetationDetail);
    this.vegetation.setDetail(this.effectiveTier() === 'ultra');
    yield PREPARATION_SLICE;
    this.scene.add(this.streetLife.group);
    this.scene.add(this.environmentDecor.group);
    this.scene.add(this.districtDecor.group);
    this.scene.add(this.districtExterior.group);
    this.scene.add(this.vegetation.group);
    freezeStaticTransforms(this.districtExterior.group);
    freezeStaticTransforms(this.vegetation.group);
    // M42: the pads (the memoised finder's sites, priced in every mode) and the
    // flock. The pads re-apply the mode's flag and join the Ultra roots; the
    // flock moves by its own matrix, so it is neither a root nor frozen.
    this.launchPadView = createLaunchPadView(plan, supplements.launchPads);
    this.launchPadView.setVisible(this.launchPadsVisible || this.padWarms > 0);
    this.scene.add(this.launchPadView.group);
    freezeStaticTransforms(this.launchPadView.group);
    this.birds = createBirds(supplements.birds);
    this.scene.add(this.birds.group);
    this.squirrels = createSquirrels(supplements.squirrels);
    this.scene.add(this.squirrels.group);
    this.supplements.setRoots([this.streetLife.group, this.environmentDecor.group, this.districtDecor.group, this.districtExterior.group,
      ...(this.metricFacade ? [this.metricFacade.group] : []), this.launchPadView.group]);
    this.supplements.sync(this.ultra.supplementContext());

    // The gates are part of the level and are rebuilt with it. `plan.checkpoints`
    // is an empty array on the proving ground and on every test fixture, and
    // `createCheckpointGates` treats that as "no gates" rather than as an
    // error — no geometry, no material, no mesh, nothing to dispose.
    this.gates?.dispose();
    const gates = createCheckpointGates(plan.checkpoints);
    this.gates = gates;
    this.scene.add(gates.group);
    // Restore whatever the challenge last asked for, so a rebuild in the
    // middle of a run does not hide the markers or forget which one is next.
    gates.setProgress(this.nextCheckpointIndex);
    gates.setVisible(this.checkpointsVisible);

    // The targets, on exactly the same terms — including the empty case, which
    // is every world but a generated one under §13 q12.
    this.targets?.dispose();
    const targets = createTargets(plan.targets ?? []);
    this.targets = targets;
    this.scene.add(targets.group);
    targets.setReducedMotion(this.targetsReducedMotion);
    // Restore the run's own state onto the new family. A rebuild mid-run must
    // not stand a struck target back up; the ids survive because they are the
    // plan's, and a rebuild of the *same* plan carries the same ones.
    for (const id of this.struckTargets) targets.strike(id);

    // 2026-10-22: the world's contact shadows (`render/contactShadows.ts`) —
    // shown only while the sun casts nothing, which is the ordinary Low tier.
    // Sized from the plan as handed in (M47: the prepared base roster), never
    // the priced one; `setPopulation` resizes it to the roster actually drawn.
    const contact = createContactShadows(plan, CONTACT_RIDER_SLOTS + (populationPlan?.actors.length ?? 0));
    contact.setVisible(!this.sun.castShadow);
    this.contactShadows = contact;
    this.contactPlan = plan;
    this.contactGround = createContactGround(plan);
    this.scene.add(contact.group);

    return terrain;
  }

  // ---------------------------------------------------------------------------
  // The challenge's two visual systems (M10)
  //
  // Both live behind this file for the reason in the file comment: a
  // translucent rider and an unlit emissive marker are members of the coupled
  // visual system, and the frame has one owner. `app/Game.ts` supplies state
  // and reads nothing back.
  // ---------------------------------------------------------------------------

  /**
   * Show or hide every checkpoint marker.
   *
   * **False in free ride, and hidden rather than faded.** Hidden costs exactly
   * zero draw calls, which is what free ride — the mode the owner's
   * five-minute no-objective test is judged in — should pay for a system it is
   * not using.
   */
  setCheckpointsVisible(visible: boolean): void {
    this.checkpointsVisible = visible;
    this.gates?.setVisible(visible);
  }

  /** M42: free-ride pads. Hidden costs zero draws; the pads stay priced either way. */
  setLaunchPadsVisible(visible: boolean): void {
    // Stored, so every rebuild re-applies it (`levelBuildSteps`). While the
    // warm pass holds the pads shown for upload, the last warm's `finally` applies it.
    this.launchPadsVisible = visible;
    if (this.padWarms === 0) this.launchPadView?.setVisible(visible);
  }

  /**
   * Which `routeIndex` the run is seeking; lower indices read as passed.
   * `-1` for none, which is what an unarmed or abandoned run reports.
   */
  setCheckpointProgress(nextRouteIndex: number): void {
    this.nextCheckpointIndex = nextRouteIndex;
    this.gates?.setProgress(nextRouteIndex);
  }

  /** Flare the gate just crossed. Called from the fixed step. */
  flareCheckpoint(routeIndex: number): void {
    this.gates?.flare(routeIndex);
  }

  /** Knock a target down — M14. Called from the fixed step, on a landed hit. */
  strikeTarget(id: string): void {
    this.struckTargets.add(id);
    this.targets?.strike(id);
  }

  /** Stand every target back up. A new run on the same world, never a reload. */
  resetTargets(): void {
    this.struckTargets.clear();
    this.targets?.reset();
  }

  /**
   * Suppress the knock-down, leaving the brightness step to carry the signal.
   *
   * `prefers-reduced-motion` is a CSS media query and the knock-down is WebGL,
   * so nothing about the preference reaches the family on its own — this is the
   * only path, and `app/Game.ts` drives it from the options store.
   */
  setTargetsReducedMotion(reduced: boolean): void {
    this.targetsReducedMotion = reduced;
    this.targets?.setReducedMotion(reduced);
  }

  /** Advance the knock-downs on the simulation clock, beside the gate flares. */
  stepTargets(stepSeconds: number): void {
    this.targets?.step(stepSeconds);
  }

  /** One shared presentation clock, before any pane draws; no actor physics. */
  updateStreetLife(seconds: number, reducedMotion: boolean, riders: readonly WildlifeRider[] = []): void {
    this.squirrels?.update(seconds, reducedMotion, riders);
    this.supplements.sync(this.ultra.supplementContext());
    this.streetLife?.update(seconds, reducedMotion);
    this.environmentDecor?.update(seconds, reducedMotion);
    this.vegetation?.setDetail(this.effectiveTier() === 'ultra');
    this.districtExterior?.setDetail(this.effectiveTier() === 'ultra');
    this.vegetation?.update(seconds, reducedMotion);
    // M42: the flock's world clock; the cameras still hold last frame's poses,
    // which is all the pass-start/end guard and a pass's aim (laid across one
    // view's heading, out of everyone's sight) ask of them.
    this.birds?.update(seconds, reducedMotion, this.viewCameras);
    // M42 R14: the pads' hovering marker turns slowly (nothing while hidden).
    this.launchPadView?.update(seconds, reducedMotion);
  }

  /** Install after setLevel. This owns GPU presentation only; Game owns the
   * fixed-step population and supplies the roster the effective tier draws
   * (M47). Any roster of the prepared plan `setLevel` priced is accepted (it
   * shares the priced plan's paths and every actor in it was counted); the
   * contact-blob capacity follows the roster drawn, so Low draws exactly the
   * living-r1 world. May be called again on the same world to change roster. */
  setPopulation(plan: PopulationPlan | null, painter?: PopulationPainter): void {
    if (!populationRosterAdmitted(this.preparedEnvironmentSupplements?.populationPlan ?? null, plan)) {
      throw new Error('Population roster must be supplied to setLevel before render admission');
    }
    this.population?.dispose();
    this.population = null;
    this.contactActors.clear();
    this.contactPopulation = null;
    this.contactShadows?.setDynamicCapacity(CONTACT_RIDER_SLOTS + (plan?.actors.length ?? 0));
    if (plan === null) return;
    for (const actor of plan.actors) this.contactActors.set(actor.id, actor);
    const population = createPopulationView(plan, painter);
    this.population = population;
    this.scene.add(population.group);
  }

  /** Once before the pane loop. Repeating this call never advances a clock. */
  updatePopulation(previous: PopulationRenderSnapshot, current: PopulationRenderSnapshot, alpha: number): void {
    this.population?.update(previous, current, alpha);
    // Read (never written) by this frame's contact shadows.
    this.contactPopulation = { previous, current, alpha };
  }

  /**
   * Advance the gate flares on the simulation clock. Called from the fixed
   * step, alongside `stepParticles`, so `advance(n)` reaches the same frame
   * every run.
   */
  stepCheckpoints(stepSeconds: number): void {
    this.gates?.step(stepSeconds);
  }

  /**
   * Rebuild the ghost as this rider (M14.5).
   *
   * Guarded on the current character rather than trusting the caller, because
   * the caller is `applyOptions`, which is re-entered whenever any option
   * changes — and an unguarded rebuild would dispose and re-upload two dozen
   * geometries every time the player moved a volume slider.
   *
   * Visibility is carried across: a swap can land mid-run with the ghost on
   * course, and a ghost that vanished because the player changed rider would
   * be a lost racing reference with no explanation.
   */
  setCharacter(character: CharacterId): void {
    if (character === this.ghostCharacter) return;
    this.ghostCharacter = character;
    const visible = this.ghost.visible;
    this.scene.remove(this.ghost.group);
    this.ghost.dispose();
    this.ghost = createGhostRider(riderLook(character), machineLook(machineForCharacter(character)));
    this.ghost.setVisible(visible);
    this.scene.add(this.ghost.group);
    // The cop is deliberately untouched: he is not a rider the player chose,
    // so a rider swap has nothing to say about him.
  }

  /**
   * Put one rider — or nobody — in the second-rider slot.
   *
   * The single writer, so "the ghost is up" and "the cop is up" cannot both be
   * true however the callers are reordered. See `secondRider`.
   */
  setSecondRider(who: 'none' | 'ghost' | 'cop', packSize = 1): void {
    // How many trims `cop` shows (M39 Part P): clamped to the trims built, and
    // zero whenever the slot holds anything else, so a hidden pack is never
    // half-shown and a ghost frame never carries a cop.
    const shown = who === 'cop' ? Math.max(1, Math.min(PACK_TRIMS, Math.floor(packSize))) : 0;
    if (who === this.secondRider && shown === this.packShown) return;
    this.secondRider = who;
    this.packShown = shown;
    this.ghost.setVisible(who === 'ghost');
    for (let index = 0; index < this.cops.length; index += 1) {
      this.cops[index].setVisible(index < shown);
    }
  }

  /** Which second rider is on screen. For the QA bridge and the budget. */
  get secondRiderShown(): 'none' | 'ghost' | 'cop' {
    return this.secondRider;
  }

  /**
   * Show or hide the ghost. False when there is no record or no run.
   *
   * **"Hide me" only hides *me*.** `Game.updateGhost` calls this with false on
   * every frame that is not a timed run against a record — which is almost
   * every frame in the game — so a version that cleared the slot outright would
   * evict the cop from it sixty times a second, and a chase would draw a cop
   * for exactly one frame after each of its own render passes.
   */
  setGhostVisible(visible: boolean): void {
    if (visible) this.setSecondRider('ghost');
    else if (this.secondRider === 'ghost') this.setSecondRider('none');
  }

  /**
   * Show or hide the cop — M18. Hides the ghost by construction, and vice versa.
   *
   * `packSize` (M39 Part P) is how many of the pack's trims ride: the tail and
   * `packSize − 1` patrols. Absent is today's one cop.
   */
  setCopVisible(visible: boolean, packSize = 1): void {
    if (visible) this.setSecondRider('cop', packSize);
    else if (this.secondRider === 'cop') this.setSecondRider('none');
  }

  /** A refused initial world placement must leave its private scratch rig hidden. */
  setPackmateVisible(index: number, visible: boolean): void {
    const cop = this.cops[index];
    if (cop) cop.setVisible(this.secondRider === 'cop' && visible);
  }

  /**
   * Pose the cop from a controller pose and aim his paddle — M18.
   *
   * Called from the render frame with an *interpolated* pose, exactly as the
   * player's rig is: he is a live rider stepped at the fixed rate, so drawing
   * him at the stepped pose would leave him juddering beside a smooth player.
   */
  applyCop(pose: EucPose, head: THREE.Vector3 | null, angle: number, blend: number): void {
    this.applyPackmate(0, pose, head, angle, blend);
  }
  /** Fixed-step placement/crash boundaries clear a cop's transported poles before any draw. */
  resetCopCrashPose(index = 0): void { this.cops[index]?.resetCrashPose(); }

  /**
   * Pose one trim of the pack — M39 Part P (§2h). Index 0 is the tail
   * (`applyCop`'s path); 1 and 2 the patrols. Each is posed from his own
   * interpolated controller pose every frame, as the tail always was: three
   * riders who moved differently from a player would read as scripted
   * obstacles. An index past the trims built is ignored rather than thrown.
   */
  applyPackmate(index: number, pose: EucPose, head: THREE.Vector3 | null, angle: number, blend: number): void {
    const cop = this.cops[index];
    if (cop === undefined) return;
    cop.applySwing(head, angle, blend);
    cop.apply(pose);
  }

  /**
   * Is any shown trim of the pack still settling (`RidingRig.settling`)? For
   * the held paused view (performance pass 2026-10-17): `Game.admitPausedView`
   * keeps such a frame drawn. A hidden trim is not posed and not drawn, so
   * its flag is not asked. Allocation-free; at most three trims.
   */
  get packSettling(): boolean {
    for (let index = 0; index < this.cops.length; index += 1) {
      const cop = this.cops[index];
      if (cop.visible && cop.settling) return true;
    }
    return false;
  }

  /**
   * Place the ghost from one interpolated sample. Called from the render
   * frame, because the sample the caller holds is already interpolated.
   */
  applyGhost(sample: GhostSample): void {
    this.ghost.apply(sample);
  }

  /**
   * The installed world's presentation recipe and its predicted cost, for the
   * diagnostics panel and the QA bridge. `null` before the first level.
   *
   * The recipe named here is the one the scene was built with, and the cost
   * is the selector's prediction for it — `render/presentation.test.ts`
   * asserts the prediction equals the built scene for both recipes, so a
   * reported cost always names the representation it describes. **From M47 the
   * population inside `cost` is the High roster's on a generated city at every
   * tier** (`pricedPopulation` says so); `population` is the drawn roster's.
   *
   * **M39 extends it and changes none of its fields** (§6.3 W5). `tier` says
   * which tier the frame is drawn at and why a requested Ultra is not; `ultra`
   * is the whole `ultraReport()` once Ultra has been asked for (null on a
   * session that never asked). `recipe` and `cost` keep describing what was
   * **actually built**: while an Ultra rung is drawing, `recipe.id` is the
   * Ultra id and `cost.frame.solo` is Ultra's own model (see
   * `ultraPresentationCost` for the rest of the restatement), and `verdicts`
   * are still the ordinary ladder's, both rungs, as always.
   */
  presentation(): RendererPresentation | null {
    const selection = this.presentationSelection;
    if (selection === null) return null;
    const tier = { effective: this.effectiveTier(), refusal: this.ultra.refusal };
    const ultra = this.ultra.requested || this.ultra.active ? this.ultraReport() : null;
    const built = this.ultra.builtUltra();
    const terrain = this.terrain;
    const streetLife = this.streetLife?.report() ?? EMPTY_STREET_LIFE_REPORT;
    const environmentDecor = this.environmentDecor?.report() ?? EMPTY_ENVIRONMENT_DECOR_REPORT;
    const districtDecor = this.districtDecor?.report() ?? EMPTY_DISTRICT_DECOR_REPORT;
    const districtExterior = this.districtExterior?.report() ?? null;
    const metricFacade = this.metricFacade?.report() ?? null;
    const districtExteriorMaterialOwners = this.districtExteriorAppearance?.materialOwners ?? 0;
    const vegetation = this.vegetation?.report() ?? null;
    const population = this.population?.report() ?? null;
    const priced = this.preparedEnvironmentSupplements?.populationPlan ?? null;
    const pricedPopulation = priced?.densityLayer === PRICED_POPULATION_LAYER ? { layer: PRICED_POPULATION_LAYER, actors: priced.actors.length } : null;
    const spatialBatching = sumSpatialBatchingDeltas(terrain?.spatialBatching, districtExterior?.spatialBatching);
    const spatialGeometry = terrain?.spatialGeometry ?? null;
    // M42: the installed pads and flock (zeros before a world is built).
    const launchPads: LaunchPadPresentationReport = this.launchPadView?.report()
      ?? { ...EMPTY_LAUNCH_PAD_REPORT, visible: this.launchPadsVisible };
    const birds: BirdPresentationReport = this.birds?.report() ?? EMPTY_BIRDS_REPORT;
    if (built === null || terrain === null) return {
      ...selection,
      cost: withSquirrelCost(withSpatialBatchingCost(selection.cost, spatialBatching), this.preparedEnvironmentSupplements?.squirrels ?? []),
      tier, ultra, streetLife, environmentDecor, districtDecor, ordinaryBoundary: terrain?.ordinaryBoundary ?? null,
      sharedGround: terrain?.sharedGround ?? null,
      sharedEdges: terrain?.sharedEdges ?? null, groundEdgeRefusal: this.groundEdgeRefusal,
      featureBlocks: terrain?.featureBlocks ?? null,
      sharedVegetation: terrain?.sharedVegetation ?? null,
      vegetation, population, pricedPopulation, districtExterior, metricFacade, districtExteriorMaterialOwners,
      supplementMaterialOwners: this.supplements.materialOwners(),
      spatialBatching, spatialGeometry, launchPads, birds, squirrels: this.squirrels?.report() ?? null,
    };
    return {
      recipe: built.recipe,
      cost: withSquirrelCost(withSpatialBatchingCost(ultraPresentationCost(selection.cost, built.recipe, built.cost, {
        propColourTriangles: measuredPropColourTriangles(terrain.group), blockColourTriangles: terrain.blockTriangles }), spatialBatching), this.preparedEnvironmentSupplements?.squirrels ?? []),
      verdicts: selection.verdicts,
      tier,
      ultra,
      streetLife,
      environmentDecor,
      districtDecor,
      ordinaryBoundary: terrain.ordinaryBoundary,
      sharedGround: terrain.sharedGround,
      sharedEdges: terrain.sharedEdges, groundEdgeRefusal: this.groundEdgeRefusal,
      featureBlocks: terrain.featureBlocks ?? null,
      sharedVegetation: terrain.sharedVegetation,
      vegetation, population, pricedPopulation, districtExterior, metricFacade, districtExteriorMaterialOwners,
      supplementMaterialOwners: this.supplements.materialOwners(),
      spatialBatching, spatialGeometry, launchPads, birds, squirrels: this.squirrels?.report() ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // M39 Ultra (`docs/M39_ULTRA.md` §6.2, §6.3 W5)
  //
  // The public face of `render/ultra/ultraRuntime.ts`. The app (`app/Game.ts`,
  // through `app/renderTier.ts`) says what it wants; the runtime decides,
  // builds, refuses and tears down; everything here is a one-line forward or
  // the GPU-touching half of `UltraHost`. None of it runs on an ordinary frame.
  // ---------------------------------------------------------------------------

  /**
   * Record whether the app wants Ultra and any `?ultrakit=` override. Takes
   * effect at the next `setLevel` or `reconcileUltra`, never by itself — so a
   * saved Ultra at boot is built once, by the first `setLevel`.
   */
  setUltraWanted(wanted: boolean, override?: UltraKitOverride | null): void {
    this.ultra.setWanted(wanted, override ?? null);
    if (!wanted) this.ultraSkies.clear();
  }

  /**
   * The F4 `ULTRA.pixelBudget` knob (Fable I4; `Game.applyTuning` forwards
   * it): T0's budget in device pixels. While Ultra draws the buffer follows at
   * once, and the shadow maps follow it across A22's line; on an ordinary tier
   * it moves nothing until Ultra is next built.
   */
  setUltraPixelBudget(pixels: number): void {
    this.ultra.setPixelBudget(pixels);
  }

  /**
   * Bring the built world in line with the intent (§6.3 W5): rebuilds only
   * when the built recipe differs from what the intent resolves to now, and
   * touches only the terrain and the tier's own resources — never gates,
   * targets, ghost, cop or the plan. `terrainChanged` says whether the
   * installed view was replaced (`app/Game.ts` reads it through
   * `currentTerrain()`, so it never holds a disposed one).
   */
  reconcileUltra(): UltraTierResult {
    return withConstructionScope(() => this.ultra.reconcile());
  }

  /** The tier the frame is drawn at: `'ultra'` only while an Ultra rung is built and drawing. */
  effectiveTier(): 'ultra' | 'ordinary' {
    return this.ultra.active ? 'ultra' : 'ordinary';
  }

  /**
   * Everything Ultra reports — for the QA bridge, `ultra-compare`, the spec's
   * envelope checks and the auditor. The sky, drawing buffer and program count
   * are read live here; the recipe, refusal, model, ledger, rigs, timings and
   * the safety-demotion count come from the runtime. On an ordinary session it
   * is the ordinary frame's facts with an empty ledger and no tier cap.
   */
  ultraReport(): UltraReport {
    const sky = this.lighting.sky.texture;
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return this.ultra.report({
      sky: { width: sky.image.width, height: sky.image.height, anisotropy: sky.anisotropy },
      drawingBuffer: {
        width: buffer.x,
        height: buffer.y,
        ratio: this.lastPixelRatio,
        tierCap: this.ultra.tierPixelCap(this.lastWidth, this.lastHeight),
      },
      programs: this.renderer.info.programs?.length ?? 0,
    });
  }

  /**
   * The terrain view the scene is drawing — the one `app/Game.ts` reads
   * through its `terrainView` getter from W1, so a tier rebuild can never
   * leave Game holding a disposed view. Throws before the first `setLevel`.
   */
  currentTerrain(): TerrainView {
    if (this.terrain === null) throw new Error('no level is installed yet');
    return this.terrain;
  }

  /**
   * Plant an Ultra activation failure at a stage (`?ultrafault=`): the next
   * activation fails there, tears down and refuses truthfully (sticky
   * `setup-failed` with that stage). A28 C1's `gl-*` plants raise a genuine
   * GL error at one allocation stage instead. Null clears the plant.
   */
  setUltraFault(plant: UltraFaultPlant | null): void {
    this.ultra.setFault(plant);
  }

  /**
   * The fifteen live Ultra values from the F4 panel (`Game.applyTuning`
   * forwards `readUltraLive`). The runtime writes them through W4's functions:
   * the shared uniforms (the shade lift's two among them), the near rig's
   * three live values, the fill — and a PMREM rebuild only when `bounceLift`
   * moved.
   */
  setUltraTuning(values: UltraLiveTuning): void {
    this.ultra.setLive(values);
  }

  /**
   * The GPU-touching half of the Ultra lifecycle, as `UltraRuntime` asks for
   * it. Each member is the few lines only a live renderer can run; the
   * runtime's state machine is tested headlessly against a fake of this.
   */
  private environmentSupplementBytes(): number {
    let bytes = 0;
    const prepared = this.preparedEnvironmentSupplements;
    // The primitive collectors expose exact texture mip bytes while existing
    // reports retain their historical ceil(4/3) diagnostic allowance.
    if (this.streetLife && prepared) bytes += this.streetLife.report().geometryBytes + prepared.street.price.textureBytes; // street report already includes instances
    if (this.environmentDecor && prepared) { const report = this.environmentDecor.report(); bytes += report.geometryBytes + report.instanceBytes + prepared.environment.price.textureBytes; }
    if (this.districtDecor && prepared) { const report = this.districtDecor.report(); bytes += report.geometryBytes + report.instanceBytes + prepared.district.price.textureBytes; }
    // M42: the pads and the flock, whose model rows are `countLaunchPads` and `countBirds`.
    for (const report of [this.terrain?.sharedVegetation, this.vegetation?.report(), this.districtExterior?.report(), this.metricFacade?.report(), this.population?.report(),
      this.launchPadView?.report(), this.birds?.report(), this.squirrels?.report()]) {
      if (report) bytes += report.geometryBytes + report.instanceBytes;
    }
    return bytes;
  }

  private createUltraHost(): UltraHost {
    return {
      scene: this.scene,
      sun: this.sun,
      lighting: () => this.lighting,
      ordinaryQuality: () => this.ordinaryQuality,
      // The armed quad probe draws four panes, and says so: Ultra is solo only.
      viewCount: () => (this.perfProbe !== null ? 4 : this.viewCameras.length),
      probeCaps: () => this.probeUltraCaps(),
      maxAnisotropy: () => this.renderer.capabilities.getMaxAnisotropy(),
      judge: (plan, caps, override) => judgeUltra(plan, caps, override, this.preparedGroundEdges?.price ?? null, this.preparedEnvironmentSupplements),
      installedTerrain: () => this.terrain,
      environmentSupplementPrice: (recipe) => {
        const prepared = this.preparedEnvironmentSupplements;
        if (!prepared) return null;
        const policy = { nearCasts: (part: import('../data/renderCost.ts').PropPartId) => ultraCasts(part, PART_COSTS[part].castsShadow, recipe.ultra),
          buildings: recipe.ultra.buildings, farShadow: recipe.ultra.farShadow };
        const price = priceEnvironmentSupplements(prepared, recipe.ultra.forms ? 'ultra' : 'ordinary', true,
          part => ultraPartTriangles(part, recipe), policy, priceFeatureBlockBuild(prepared.featureBlocks, recipe));
        const wildlife = countSquirrels(prepared.squirrels);
        const installedPrice = { ...price, colourDraws: price.colourDraws + wildlife.colourDraws,
          colourTriangles: price.colourTriangles + wildlife.colourTriangles,
          geometryBytes: price.geometryBytes + wildlife.geometryBytes,
          instanceBytes: price.instanceBytes + wildlife.instanceBytes,
          resourceBytes: price.resourceBytes + wildlife.geometryBytes + wildlife.instanceBytes };
        return withSpatialBatchingSupplementPrice(installedPrice, sumSpatialBatchingDeltas(this.terrain?.terrainSpatialBatching,
          priceEnvironmentSpatialBatching(prepared, DEFAULT_SPATIAL_BATCH_METRES, true, policy)));
      },
      environmentSupplementBytes: () => this.environmentSupplementBytes(),
      programOwnerRoots: () => [...this.supplements.programOwnerRoots(),
        ...(this.population ? [this.population.group] : [])],
      installTerrain: (plan, recipe, context, beforeBuild) => this.installTerrain(plan, recipe, context, beforeBuild),
      installTerrainSteps: (plan, recipe, context, beforeBuild) => this.installTerrainSteps(plan, recipe, context, beforeBuild),
      // I1: painted once per sky, `createSky(look, options)` on a miss.
      paintUltraSky: (look, cloudSeed) =>
        this.ultraSkies.paint(look, ultraSkyOptions(this.renderer.capabilities.getMaxAnisotropy(), cloudSeed)),
      bakeSkyBackground: (sky) => bakeUltraSkyBackground(this.renderer, sky),
      canvas: () => ({
        width: this.renderer.domElement.clientWidth,
        height: this.renderer.domElement.clientHeight,
        pixelRatio: Math.min(window.devicePixelRatio, this.maxPixelRatio),
      }),
      buildEnvironment: (look, live) => buildUltraEnvironment(this.renderer, look, live),
      buildFarShadow: (far, sunOffsetUnit) => far.build(this.renderer, this.scene, sunOffsetUnit),
      drawFirstFrame: () => this.drawUltraFirstFrame(),
      readGlErrors: (limit) => {
        const gl = this.renderer.getContext();
        const codes: number[] = [];
        for (let read = 0; read < limit; read += 1) {
          const code = gl.getError();
          if (code === gl.NO_ERROR) break;
          codes.push(code);
        }
        return codes;
      },
      framebufferStatus: (target) => ultraFramebufferStatus(this.renderer, target),
      raiseGlError: (code) => this.raiseUltraGlError(code),
      setShaderErrorHook: (hook) => this.setShaderErrorHook(hook),
      resize: () => {
        this.resize();
      },
      setShadowFocus: (x, y, z) => this.setShadowFocus(x, y, z),
      now: () => performance.now(),
    };
  }

  /**
   * One world at a time (§3.6 step 5): whatever is installed is disposed
   * *before* the next view is built. `context` null is the ordinary call,
   * the ordinary call with the explicit environment ground composition.
   */
  private installTerrain(
    plan: LevelPlan,
    recipe: BuildRecipe,
    context: UltraBuildContext | null,
    beforeBuild?: () => void,
  ): TerrainView {
    return runSteps(this.installTerrainSteps(plan, recipe, context, beforeBuild));
  }

  /** `installTerrain` as slices (`shared/preparationSteps.ts`); the boot drives
   * it through `UltraRuntime.installWorldSteps`' ordinary branch only. The
   * construction scope spans the slices and closes on every exit. */
  private *installTerrainSteps(
    plan: LevelPlan,
    recipe: BuildRecipe,
    context: UltraBuildContext | null,
    beforeBuild?: () => void,
  ): Steps<TerrainView> {
    this.terrain?.dispose();
    this.terrain = null;
    // The planted `?ultrafault=build` (Fable F1): here, with the old world
    // already gone, exactly where a real builder exception would land.
    beforeBuild?.();
    let terrain: TerrainView;
    const endTerrainConstruction = beginConstructionScope();
    try {
      terrain = yield* createTerrainSteps(plan, recipe, context ?? undefined,
        { ordinaryBoundary: context === null, sharedSurface: true, sharedEdges: this.preparedGroundEdges,
          environmentSupplements: this.preparedEnvironmentSupplements, spatialBatchMetres: DEFAULT_SPATIAL_BATCH_METRES,
          distanceDetail: this.vegetationDetail });
    } finally { endTerrainConstruction(); }
    // The selected display bays augment composition after the unchanged
    // terrain builder. Its atlas/shadow owners remain the same; shared edge
    // triangles are already emitted and inclusively priced before this step.
    const fronts = [...scopedStreetFronts(plan), ...scopedEnvironmentSites(plan), ...scopedResidentialSites(plan)];
    // The original clock-tower shaft uses the cap bucket. It receives only
    // localized closed park cases; body materials receive no park descriptor.
    const parkFronts = parkCaseSites(plan);
    const hookedMaterials = new Set<THREE.MeshStandardMaterial>();
    if (fronts.length || parkFronts.length) terrain.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)
        || hookedMaterials.has(object.material)) return;
      const openings = /^level-props-building(?:Body|Low|Tall)$/.test(object.name)
        ? fronts : object.name === 'level-props-buildingCap' ? parkFronts : [];
      if (openings.length === 0) return;
      hookedMaterials.add(object.material);
      // One installation preserves the material's existing compile/key chain.
      installStreetFacadeOpenings(object.material, openings);
    });
    this.terrain = terrain;
    this.scene.add(terrain.group);
    freezeStaticTransforms(terrain.group, object => object.name === 'level-surround');
    // Install the supplemental response before the Ultra activation's first
    // frame; an ordinary rebuild restores its original materials immediately.
    this.supplements.sync(context);
    return terrain;
  }

  /**
   * Activation step 1: WebGL2, a renderable half-float target (the PMREM
   * filter renders into one) and a texture limit that fits the near map.
   */
  private probeUltraCaps(): UltraCaps {
    const gl = this.renderer.getContext();
    const extensions = this.renderer.extensions;
    return {
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      halfFloatRenderable:
        extensions.has('EXT_color_buffer_half_float') || extensions.has('EXT_color_buffer_float'),
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
    };
  }

  /**
   * Activation step 9: one solo Ultra frame, drawn now, then `gl.getError()`.
   *
   * It is `beginFrame` + the single-view `renderView`, minus `beginFrame`'s
   * demotion check — this *is* the activation that check would demote.
   * Every Ultra program compiles and the 4096 near map allocates here, so an
   * out-of-memory is found at the switch rather than mid-ride. Nothing
   * pending is drained first (A28 C1, Codex's post-GU finding): the
   * activation drained the stale errors once, before its first allocation,
   * and has read each stage's since, so a code pending here is Ultra's and is
   * kept — the drain that stood here discarded the sky's, the environment's
   * and the far map's.
   */
  private drawUltraFirstFrame(): number {
    const gl = this.renderer.getContext();
    this.renderer.info.reset();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.lastWidth, this.lastHeight);
    this.renderer.clear();
    this.ultra.beforeSoloRender(this.camera);
    this.renderer.render(this.scene, this.camera);
    return gl.getError();
  }

  /**
   * `?ultrafault=gl-*` (A28 C1): raise a genuine GL error on this context
   * now, so a journey proves that an error from a real allocation stage
   * reaches the activation's check. INVALID_FRAMEBUFFER_OPERATION is a clear
   * into a draw framebuffer with no attachments; INVALID_ENUM is a
   * `getParameter` of no parameter. The draw binding three believes in is put
   * back exactly. Never called unless the address planted it.
   */
  private raiseUltraGlError(code: number): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (code === gl.INVALID_ENUM) {
      gl.getParameter(0);
      return;
    }
    if (code === gl.INVALID_FRAMEBUFFER_OPERATION) {
      const bound = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const empty = gl.createFramebuffer();
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, empty);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, bound);
      gl.deleteFramebuffer(empty);
      return;
    }
    throw new Error(`?ultrafault= cannot raise GL error 0x${code.toString(16)}`);
  }

  /**
   * Install (or with null remove) the runtime's shader-error hook on
   * `renderer.debug.onShaderError`. three calls it in place of its own report
   * when a program fails to link, so the hook is handed the logs.
   */
  private setShaderErrorHook(hook: ShaderErrorHook | null): void {
    this.renderer.debug.onShaderError = hook === null
      ? null
      : (gl, program, vertexShader, fragmentShader): void => {
        hook(describeShaderError(gl, program, vertexShader, fragmentShader));
      };
  }

  /**
   * What the challenge's two systems cost while they are showing, for the
   * budget and the QA bridge. Draw calls and triangles are reportable; a frame
   * interval is not (`AGENTS.md`).
   */
  challengeCosts(): {
    gateDrawCalls: number;
    gateTriangles: number;
    ghostDrawCalls: number;
    ghostTriangles: number;
    copDrawCalls: number;
    copTriangles: number;
  } {
    return {
      gateDrawCalls: this.gates?.visible === true ? this.gates.drawCalls : 0,
      gateTriangles: this.gates?.visible === true ? this.gates.triangles : 0,
      ghostDrawCalls: this.ghost.visible ? this.ghost.drawCalls : 0,
      ghostTriangles: this.ghost.visible ? this.ghost.triangles : 0,
      // Colour and shadow together, because that is what the frame is charged
      // and what `NON_LEVEL_RESERVE` reserves — summed over the pack's shown
      // trims since M39 Part P, because the solo reserve wears the pack (q209).
      copDrawCalls: this.packCost('calls'),
      copTriangles: this.packCost('triangles'),
    };
  }

  /** The shown trims' colour + shadow calls, or their triangles. Zero while the pack is hidden. */
  private packCost(axis: 'calls' | 'triangles'): number {
    let total = 0;
    for (const cop of this.cops) {
      if (!cop.visible) continue;
      total += axis === 'calls' ? cop.drawCalls + cop.shadowDrawCalls : cop.triangles;
    }
    return total;
  }

  /** Register the game-level reaction to a context loss. One consumer. */
  setContextLossCallbacks(callbacks: ContextLossCallbacks): void {
    this.contextCallbacks = callbacks;
  }

  private readonly onContextLost = (event: Event): void => {
    // three's own listener also prevents the default; doing it here as well
    // keeps the restore path alive even if listener ordering ever changes —
    // without preventDefault the browser never fires `webglcontextrestored`.
    event.preventDefault();
    // M39 (A28, FE): Ultra releases what the restore will rebuild while the
    // context is lost, when WebGL makes every delete a no-op; a restore that
    // deleted them instead raised INVALID_OPERATION. A no-op unless Ultra is
    // active. Then (A28 follow-up, CL) everything else three set up before
    // the loss is released the same way, on every tier (`releaseLostContext`).
    // The game hears about the loss whatever happens in either.
    try {
      this.ultra.onContextLost();
    } finally {
      try {
        this.releaseLostContext();
      } finally {
        this.contextCallbacks?.onLost();
      }
    }
  };

  /**
   * Everything three set up before a context loss, sent its `dispose` event
   * while the loss makes each delete a no-op — A28 follow-up (CL;
   * `render/contextLoss.ts` has the mechanism).
   *
   * Without it, the first `dispose()` after a restore of anything drawn
   * before the loss — a world swap, a quality change, an Ultra exit, a rider
   * swap — deleted WebGL objects of the lost context through three's
   * pre-loss bookkeeping and raised INVALID_OPERATION, on every tier, and
   * that bookkeeping stayed reachable. The scene graph is everything this
   * renderer draws except the painted sky under Ultra, which is drawn
   * through its own cube (the extra here); Ultra's off-scene maps were
   * released by `ultra.onContextLost` just before. Nothing is taken off the
   * scene: three sets each object up again the first time it is drawn after
   * the restore, as it always did. Runs on a loss only — never on a frame.
   */
  private releaseLostContext(): void {
    releaseForLostContext([this.scene], [this.lighting.sky.texture], this.renderer.properties);
  }

  private readonly onContextRestored = (): void => {
    // M39: three has re-initialised by now (its listener was added first), so
    // the Ultra resources that held *rendered* content — the sky's background
    // cube, the PMREM environment and the far map, all released at the loss —
    // are rebuilt before the game hears the context is back. A no-op unless
    // Ultra is active. Nothing else needs a rebuild: everything else was
    // released at the loss and is set up again from its CPU data when drawn.
    this.ultra.onContextRestored();
    this.contextCallbacks?.onRestored();
  };

  /**
   * Idempotent and cheap enough to call every frame — which is how it is
   * called, deliberately.
   *
   * A canvas that is hidden, or simply not laid out yet, measures zero. A
   * resize that runs at that moment and then never runs again leaves the
   * renderer stuck at its 300x150 default, and the symptom is a stretched or
   * blank view with nothing in the console. Ignoring the zero measurement is
   * only half the fix; the other half is measuring again until it succeeds
   * (master starter 9.1). Polling from the frame loop covers that, plus
   * container changes and pixel-ratio changes, without a listener for each.
   *
   * Reports whether the CSS-pixel layout actually changed, so callers can
   * distinguish a real viewport change — which must invalidate cached control
   * geometry and release in-flight gestures — from a pixel-ratio-only change,
   * which must not (master starter 8.6, 8.7).
   */
  resize(): ViewportChange {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // M39 T0 (§2.1): Ultra's pixel budget is a third term here and never a
    // write to `maxPixelRatio`, so the `applyTuning` push (q206) cannot clobber
    // it and Ultra's ratio is never above High's. On every ordinary tier the
    // term is `Infinity`, and `Math.min` is exactly the two-term answer.
    const pixelRatio = Math.min(
      window.devicePixelRatio,
      this.maxPixelRatio,
      this.ultra.tierPixelCap(width, height),
    );

    if (width === 0 || height === 0) {
      return { layoutChanged: false, width: this.lastWidth, height: this.lastHeight };
    }

    const layoutChanged = width !== this.lastWidth || height !== this.lastHeight;
    const pixelRatioChanged = pixelRatio !== this.lastPixelRatio;
    if (!layoutChanged && !pixelRatioChanged) {
      return { layoutChanged: false, width, height };
    }

    this.lastWidth = width;
    this.lastHeight = height;
    this.lastPixelRatio = pixelRatio;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    // M39 A22: the Ultra shadow maps follow the drawing buffer across its
    // size line. Guarded: an ordinary tier never makes the call.
    if (this.ultra.active) this.ultra.onDrawingBuffer(canvas.width, canvas.height);

    // Only a real layout change alters the projection. A pixel-ratio-only
    // change backs the same CSS box with more device pixels.
    if (layoutChanged) this.applyViewAspects();

    return { layoutChanged, width, height };
  }

  /**
   * The whole coupled visual system, set together.
   *
   * Exposure, key light, and fill are one system with one owner (invariant 6),
   * and this file is that owner. The tuning panel changes them through here
   * rather than reaching into the lights, so there is exactly one place where
   * "what does the rig currently look like" is answered — and so a future
   * change to any one of them cannot be made in ignorance of the other two.
   */
  applyLighting(values: {
    exposure?: number;
    sunIntensity?: number;
    hemisphereIntensity?: number;
  }): void {
    this.lighting.tune(values);
  }

  /**
   * The look the scene is currently wearing, for the QA bridge — M36 Phase 4.
   *
   * Every field resolved, so a browser spec can assert what a venue swap
   * actually composed rather than reading four three.js objects and hoping it
   * has found all of them.
   */
  venueLook(): ResolvedVenueLook {
    return this.lighting.look;
  }

  /**
   * Move the single shadow cascade to sit over a world point.
   *
   * The budget allows one 2048 map, so its orthographic extent is kept tight
   * (`LIGHTING.shadowRadius`) to keep texels dense where they are actually
   * read. Tight and stationary means the rider rides out of their own shadow
   * within a couple of seconds — the contact shadow simply stops being drawn,
   * with nothing in the console to say so. Moving the light and its target
   * together keeps the sun's *direction* fixed, so the lighting rig is
   * unchanged; only the region it can cast into moves.
   */
  setShadowFocus(x: number, y: number, z: number): void {
    const offset = this.lighting.sunOffset;
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + offset.x, y + offset.y, z + offset.z);
  }

  /**
   * Vertical field of view for one view, in radians. Driven by speed from M3;
   * addressed per view since M25 Phase 3.
   *
   * **The early-out is per camera and that is the whole reason this is not a
   * loop.** It compares against the camera it is about to write; a single
   * shared guard would skip the second view for exactly as long as the two
   * riders happened to be going the same speed, which is most of a couch ride
   * and all of the first second of one.
   */
  setFieldOfView(view: number, radians: number): void {
    const camera = this.cameraFor(view);
    const degrees = THREE.MathUtils.radToDeg(this.splitFieldOfView(radians));
    if (camera.fov === degrees) return;
    camera.fov = degrees;
    camera.updateProjectionMatrix();
  }

  /**
   * How wide the split's vertical field of view should be — M25 Phase 3
   * (docs/PLANS.md §25.5, "the split projection must keep the road readable,
   * not just halve the aspect").
   *
   * A vertical split halves each view's aspect, and a perspective camera's
   * *horizontal* angle is derived from the vertical one through it. So halving
   * the aspect and changing nothing else does not give each player half the
   * view — it gives them a keyhole. On a 1920x1080 window the numbers are
   * exact: horizontal falls from 96.8 degrees to 58.8, and 38 degrees of the
   * road either side of the rider simply stop existing.
   *
   * **Preserving the horizontal angle exactly is not available.** It needs a
   * vertical angle of 103 degrees at rest and 116 at speed, against a tuning
   * table whose header calls motion sickness a hard constraint rather than a
   * preference. And a bare cap is worse than it looks: applied to both ends of
   * the speed ease it clamps both, which would delete the strongest speed cue
   * in the game exactly where two players are most likely to be racing.
   *
   * So: **gain, then cap.** The gain recovers most of the lost horizontal and
   * the cap keeps the widest frame inside what the same table already
   * tolerates, while leaving enough travel between the two ends for the ease
   * to survive. Both numbers are F4-tunable through `setSplitFieldOfView`,
   * because §25.5 gives the owner's own look the final say and a number he can
   * only report is a number he has to wait on.
   *
   * **The treatment is per frame *shape*, not per split — M27 Phase 1.** The
   * paragraphs above are an argument about a *half*, and every one of their
   * numbers comes from halving the aspect. A quadrant halves both axes, so it
   * keeps the canvas's own 16:9 and loses no horizontal angle at all; running
   * the gain on it would hand four players a wider view than one player gets,
   * which is a different game rather than the same one shared. So the gain is
   * the shape's own (`quadFovGain` ships near unity) and **the cap is one
   * number for both**, because the cap is a statement about how wide this
   * project will ever draw before the tuning table's first line starts
   * mattering, and that does not depend on how the screen is cut.
   */
  private splitFieldOfView(radians: number): number {
    const views = this.viewCameras.length;
    if (views < 2) return radians;
    const gain = paneGridFor(views).rows > 1 ? this.quadFovGain : this.splitFovGain;
    return Math.min(this.splitFovCap, radians * gain);
  }

  /**
   * The split's field-of-view widening, from the tuning table.
   *
   * `Game.applyTuning` pushes this the way it pushes the quality ceiling: the
   * store belongs to the app layer, and a renderer that read it would be a
   * second reader of a value the F4 panel can move underneath it.
   */
  setSplitFieldOfView(gain: number, capRadians: number, quadGain: number): void {
    if (
      gain === this.splitFovGain
      && capRadians === this.splitFovCap
      && quadGain === this.quadFovGain
    ) return;
    this.splitFovGain = gain;
    this.splitFovCap = capRadians;
    this.quadFovGain = quadGain;
    // The cameras are holding a previously widened angle; the next frame
    // rewrites them, but a paused game does not have a next frame.
    for (const camera of this.viewCameras) camera.updateProjectionMatrix();
  }

  /** How many views this frame draws, left to right. One, until asked. */
  get viewCount(): number {
    return this.viewCameras.length;
  }

  /**
   * Draw `count` views side by side from now on — M25 Phase 3.
   *
   * Called when a seat is added or removed, so the number of views and the
   * number of riders are the same number by construction rather than by two
   * places agreeing. Idempotent, so the caller does not have to know whether
   * it is already true.
   */
  setViewCount(count: number): void {
    const wanted = Math.max(1, Math.floor(count));
    if (wanted === this.viewCameras.length) return;
    // M39: Ultra is one view. The app leaves it before any split (`openCouch`'s
    // first line), so this is only ever the backstop — a safety demotion that
    // counts itself and says so once, never a throw (§6.3 W5, invariant 11).
    if (wanted > 1 && this.ultra.active) this.ultra.safetyDemote(wanted);
    while (this.viewCameras.length < wanted) {
      this.viewCameras.push(new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(CAMERA.fovAtRest),
        1,
        CAMERA.near,
        CAMERA.far,
      ));
    }
    // Never below one, and never the *first* camera: `this.camera` is the same
    // object and is public.
    this.viewCameras.length = wanted;
    this.applyViewAspects();
  }

  /** The camera for one view. Throws rather than drawing the wrong half. */
  cameraFor(view: number): THREE.PerspectiveCamera {
    const camera = this.viewCameras[view];
    if (camera === undefined) {
      throw new Error(`no such view: ${view} (views: ${this.viewCameras.length})`);
    }
    return camera;
  }

  /**
   * Where one view sits across the canvas, in whole CSS pixels.
   *
   * **The partition is by rounded boundaries, not by a divided width, and an
   * odd number of pixels is exactly why.** `width / views` on a 1001 px canvas
   * is 500.5, and two passes of 500.5 both floor to 500 — leaving the final
   * column drawn by nobody. It shows as a one-pixel stripe of untouched page
   * down the right edge of the game, which a Codex QA pass found on the day
   * this shipped: even widths were flawless and 1001x701 was not.
   *
   * Taking each edge as `round(width * view / views)` makes every boundary a
   * single number shared by the pane that ends there and the pane that starts
   * there, so the views tile the canvas exactly once with no gap and no
   * overlap, at any width and any view count. The panes are then not
   * necessarily equal — 1001 splits into 500 and 501 — which is why the
   * aspects below are taken from these same widths rather than from a halved
   * canvas.
   *
   * **The rule gained its second axis at M27 Phase 1 and did not otherwise
   * change.** Three or four seats are a 2x2 grid (four 480x1080 strips are
   * unusable), so the same rounded boundary is now taken on the height too and
   * the arithmetic moved to `shared/paneGrid.ts`, where a headless sweep can
   * check odd widths and odd heights together without a GPU. One and two views
   * come back exactly where they always did — full canvas, then vertical
   * halves at full height — which is what keeps Contract 2 a statement about
   * the frame the game still draws.
   *
   * `y` is measured **up from the bottom**, because that is the frame
   * `setViewport` and `setScissor` take. Panes are numbered in reading order,
   * so pane 0 is top-left and its `y` is the middle boundary rather than zero.
   */
  viewBounds(view: number): PaneRect {
    const views = this.viewCameras.length;
    if (view < 0 || view >= views) {
      throw new Error(`no such view: ${view} (views: ${views})`);
    }
    return paneBounds(this.lastWidth, this.lastHeight, paneGridFor(views), view);
  }

  /**
   * Where the pane nobody is sitting in would be — M27 Phase 1 (q95).
   *
   * A three-seat frame is a 2x2 grid with a hole, and the hole is the room's
   * shared scoreboard: DOM over a quadrant no pass draws. `Game` needs the box
   * to place that card, and it must be **the same arithmetic the passes use**
   * or the card would sit a pixel off the seam it is supposed to fill.
   *
   * Null whenever the grid is full or has no hole at all, which is every other
   * seat count — the caller asks rather than counting seats itself.
   */
  idleViewBounds(): PaneRect | null {
    const views = this.viewCameras.length;
    const grid = paneGridFor(views);
    const panes = grid.columns * grid.rows;
    if (views >= panes) return null;
    return paneBounds(this.lastWidth, this.lastHeight, grid, views);
  }

  /**
   * Give every view the aspect of its own pane.
   *
   * **Each view's aspect is its own pane's width over the height, not the
   * canvas's.** A camera left on the full-canvas aspect while drawing into
   * half of it stretches the world horizontally, which reads as the rider
   * being fatter rather than as the frame being wrong — the kind of defect
   * that survives a review and is obvious the moment somebody rides it.
   *
   * Read from `viewBounds`, so an odd canvas gives its two panes slightly
   * different aspects rather than one shared approximation. The alternative —
   * halving the canvas — would put both cameras half a pixel out on the wider
   * pane, which is invisible, and would be a second definition of where the
   * panes are, which is not.
   */
  private applyViewAspects(): void {
    if (this.lastWidth === 0 || this.lastHeight === 0) return;
    for (let view = 0; view < this.viewCameras.length; view += 1) {
      const camera = this.viewCameras[view];
      // The pane's own height too since M27 Phase 1 — a quadrant is half as
      // tall as the canvas, and a camera left on the canvas height while
      // drawing into a quadrant is the same stretch in the other direction.
      const pane = this.viewBounds(view);
      camera.aspect = pane.height === 0 ? 1 : pane.width / pane.height;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Change the device-pixel ceiling.
   *
   * Deliberately calls `resize()` and nothing else. Backing the same CSS box
   * with a different number of device pixels is not a viewport change
   * (master starter 8.7): routing it through the full viewport-change path
   * would also drop cached control geometry and release the in-flight gesture,
   * which is right after a rotation and catastrophic here — it would take the
   * controls out of the player's hands at exactly the moment the game decided
   * the frame was struggling.
   */
  setMaxPixelRatio(ratio: number): void {
    const clamped = Math.max(0.5, ratio);
    if (clamped === this.maxPixelRatio) return;
    this.maxPixelRatio = clamped;
    this.resize();
  }

  /**
   * The quality preset, from the M9 settings screen.
   *
   * **Two levers, and neither is a re-grade.** Resolution and shadow detail
   * are the two things on this frame that cost real time on integrated
   * graphics and that a player can trade away without the game looking like a
   * different game. Exposure, tone mapping, light intensities, fog, and
   * particle brightness are deliberately untouched: they are one coupled
   * system with one owner (invariant 6), and a quality preset that dimmed the
   * sun would be a second owner changing the look behind the first one's back.
   *
   * Owned by this file for the same reason `applyLighting` is — it is the
   * renderer's business how much effort a frame costs. `app/Game.ts` passes a
   * word and the ceiling from the tuning table, and learns nothing about
   * shadow maps.
   *
   * `castShadow` is toggled rather than `shadowMap.enabled`, because three
   * keys its programs on the number of shadow-casting lights and so
   * recompiles by itself; flipping the renderer-wide flag needs every material
   * marked dirty by hand, and a missed one renders black.
   */
  setQuality(level: 'low' | 'medium' | 'high', maxPixelRatio: number): void {
    // M39: remembered for the Ultra teardown, which writes this tier's rig back.
    this.ordinaryQuality = level;
    const shadows = level !== 'low';
    if (this.sun.castShadow !== shadows) this.sun.castShadow = shadows;
    // 2026-10-22: the blobs stand in for the cascade exactly when it is off.
    this.contactShadows?.setVisible(!this.sun.castShadow);

    const mapSize = level === 'high' ? LIGHTING.shadowMapSize : LIGHTING.shadowMapSize / 2;
    if (shadows && this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.setScalar(mapSize);
      // three allocates the depth target from `mapSize` once and then reuses
      // it. Without disposing it here the new size is ignored for the life of
      // the page, and the setting appears to do nothing.
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }

    const ceiling = level === 'high' ? maxPixelRatio : level === 'medium' ? 1.5 : 1;
    this.setMaxPixelRatio(Math.min(maxPixelRatio, ceiling));

    // M39: while an Ultra rig stands, the ordinary rig just written is written
    // over again. The app only moves the ordinary tier under Ultra on its way
    // out, and nothing renders between those two calls; a no-op otherwise.
    this.ultra.onOrdinaryQuality();
  }

  /** Current drawing-surface state, for the QA bridge and the overlay. */
  viewport(): { width: number; height: number; pixelRatio: number } {
    return {
      width: this.lastWidth,
      height: this.lastHeight,
      pixelRatio: this.lastPixelRatio,
    };
  }

  /**
   * Start a frame: reset the counters, and clear the canvas exactly once.
   *
   * **Once, whatever the view count**, which is why `autoClear` is off (see
   * the constructor). Clearing per pass would erase the half drawn before it;
   * clearing inside the scissor box would work and would still be two clears
   * for one canvas.
   */
  beginFrame(): void {
    // M39: a shader that failed while Ultra was active demotes here, at the top
    // of the next frame — before the caller points the shadow focus and the
    // surround plane, so the rebuilt ordinary world is drawn whole.
    if (this.ultra.demotionPending) this.ultra.demote();
    this.contactPending = true;
    this.renderer.info.reset();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.lastWidth, this.lastHeight);
    this.renderer.clear();
  }

  /**
   * The seats' rigs, in seat order — OD-3's other riders (perf item
   * "riders", 2026-10-17). Read every frame by `Game.render` before its view
   * loop: allocation-free while the seating is unchanged, so no seat path
   * (spawn, despawn, a character swap, a boot) has to remember to call it.
   */
  syncSeatRigs(seats: readonly { readonly rig: RidingRig }[]): void {
    this.paneShadowTrim.sync(seats);
  }

  /** Which rig pane `view` is about (OD-3): its own rider, a followed seat's, or null. */
  setPaneSubject(view: number, rig: RidingRig | null): void {
    this.paneSubjects[view] = rig;
  }

  /** The rig pane `view` keeps whole, resolved against the seats as last synced. */
  private paneSubject(view: number): RidingRig | null {
    const rigs = this.paneShadowTrim.rigs;
    const named = this.paneSubjects[view];
    if (named === null) return null;
    if (named !== undefined && rigs.includes(named)) return named;
    return rigs[view] ?? null;
  }

  /**
   * Switch off the limb shadows of every seated rider the pane is not about,
   * plus — inside the quad probe — every planted rig it is not about. A no-op
   * with shadows off, and in a frame of one pane (`panes`): OD-3 is a
   * split-screen trim, so a single full-canvas view — solo, or the join
   * panel's posed chairs — trims nothing whatever is seated.
   */
  private trimOtherRiders(panes: number, subject: RidingRig | null): void {
    if (panes <= 1 || !this.sun.castShadow) return;
    const rigs = this.paneShadowTrim.rigs;
    for (let index = 0; index < rigs.length; index += 1) {
      if (rigs[index] !== subject) this.paneShadowTrim.trim(rigs[index]);
    }
    const probe = this.perfProbe;
    if (probe === null) return;
    for (let index = 0; index < probe.rigs.length; index += 1) {
      const rig = probe.rigs[index].rig;
      if (rig !== subject) this.paneShadowTrim.trim(rig);
    }
  }

  /**
   * Draw one view into its own half of the canvas — M25 Phase 3.
   *
   * The caller sets whatever is per-pass *before* calling: this view's camera
   * transform, the shadow cascade's focus, and the surround plane's centre.
   * Each half is its own rider's window on the world, and all three of those
   * are singular objects that have to be moved between the passes rather than
   * duplicated — one directional light, one depth target, one backstop mesh.
   *
   * **Viewport and scissor are set every pass, every frame, on purpose.**
   * `WebGLRenderer.setSize` ends by resetting the viewport to the full canvas,
   * and `resize()` is polled once per frame — so state set once at a split
   * would be silently undone by the next pixel-ratio change or container
   * resize, and the symptom would be one rider drawn across both halves.
   *
   * Arguments to `setViewport`/`setScissor` are in CSS pixels; three applies
   * the device-pixel ratio itself.
   */
  renderView(view: number): void {
    // Once a frame, before any pane: every rig is posed and every seat synced.
    if (this.contactPending) {
      this.contactPending = false;
      this.updateContactShadows();
    }
    this.supplements.sync(this.ultra.supplementContext());
    // The armed quad probe takes over the frame — M27 Phase 0. `Game` still
    // believes the session is single-view (one seat, one camera, unsplit HUD,
    // ungained FOV — `splitFieldOfView` sees one view camera and stays out)
    // and calls this exactly once per frame with the shadow focus and the
    // surround centre already pointed at the ridden rider; the probe answers
    // with the four quadrant passes instead of the one full-canvas pass.
    if (this.perfProbe !== null && this.viewCameras.length === 1) {
      this.renderPerfQuadFrame(this.perfProbe);
      return;
    }
    const camera = this.cameraFor(view);
    if (this.viewCameras.length === 1) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.lastWidth, this.lastHeight);
      // M39: the Ultra frame hook — finalise the near cascade from the focus
      // the caller just set, and hand the Ultra materials this frame's rig and
      // far map. Only while Ultra is active; the ordinary frame runs nothing.
      if (this.ultra.active) this.ultra.beforeSoloRender(camera);
    } else {
      // Whole pixels from `viewBounds`, which tiles the canvas exactly once —
      // on both axes since M27 Phase 1, so a quadrant's own y and height come
      // from the same partition rather than from a second opinion here.
      const pane = this.viewBounds(view);
      this.renderer.setViewport(pane.x, pane.y, pane.width, pane.height);
      // Without the scissor, a pass would draw its sky and its fog across the
      // whole canvas and only the depth-tested geometry would stay in its
      // half.
      this.renderer.setScissor(pane.x, pane.y, pane.width, pane.height);
      this.renderer.setScissorTest(true);
    }
    // Select separately for every pane, retaining actors in the actual shadow
    // volume as well as those in the eye's frustum. Warm-up still draws all.
    this.sun.updateMatrixWorld(true); this.sun.target.updateMatrixWorld(true);
    this.sun.shadow.updateMatrices(this.sun);
    this.squirrels?.prepareView(camera, this.viewCameras.length);
    this.population?.prepareView(camera, this.sun.castShadow ? this.sun.shadow.camera : undefined);
    try {
      // OD-3: in a split frame, this pane's shadow pass carries every other
      // seat rider's machine, torso and head, never their limbs, boots or
      // hands; put back below whatever happens, so no flag outlives its pane.
      this.trimOtherRiders(this.viewCameras.length, this.paneSubject(view));
      this.renderer.render(this.scene, camera);
    } finally {
      this.paneShadowTrim.restore();
      this.population?.restoreView();
      this.squirrels?.restoreView();
    }
  }

  /**
   * This frame's moving contact shadows (2026-10-22, `render/contactShadows.ts`).
   *
   * Shown only while the sun casts nothing; then rewritten from what the frame
   * is about to draw — every seated rig, each shown cop trim, the ghost, and
   * the outdoor population at the same interpolation `updatePopulation` was
   * handed. Reads poses and plan geometry only; writes nothing anyone reads.
   */
  private updateContactShadows(): void {
    const layer = this.contactShadows;
    if (layer === null) return;
    const shown = !this.sun.castShadow;
    layer.setVisible(shown);
    if (!shown) return;
    layer.beginDynamic();
    const rigs = this.paneShadowTrim.rigs;
    for (let index = 0; index < rigs.length; index += 1) this.pushRiderContact(layer, rigs[index].group, 1);
    for (let index = 0; index < this.cops.length; index += 1) {
      const cop = this.cops[index];
      if (cop.visible) this.pushRiderContact(layer, cop.group, 1);
    }
    if (this.ghost.visible) this.pushRiderContact(layer, this.ghost.group, CONTACT_SHADOW.ghostStrength);
    this.pushPopulationContact(layer);
    layer.endDynamic();
  }

  /** The node a rider's contact patch is: the `…riding-rig` root under `group`, or `group`. */
  private contactRoot(group: THREE.Object3D): THREE.Object3D {
    const known = this.contactRoots.get(group);
    if (known !== undefined) return known;
    let found: THREE.Object3D = group;
    if (!group.name.endsWith('riding-rig')) {
      group.traverse((node) => {
        if (found === group && node.name.endsWith('riding-rig')) found = node;
      });
    }
    this.contactRoots.set(group, found);
    return found;
  }

  private pushRiderContact(layer: ContactShadows, group: THREE.Object3D, share: number): void {
    if (!group.visible) return;
    const root = this.contactRoot(group);
    if (!root.visible) return;
    root.updateWorldMatrix(true, false);
    const m = root.matrixWorld.elements;
    const x = m[12];
    const y = m[13];
    const z = m[14];
    const ground = this.contactGround?.below(x, z, y) ?? y;
    const { strength, grow } = riderBlobFade(y - ground);
    const blob = this.contactBlob;
    const rider = CONTACT_SHADOW.rider;
    blob.x = x; blob.y = ground; blob.z = z;
    blob.headingY = Math.atan2(m[8], m[10]);
    blob.halfX = rider.halfX * grow; blob.halfZ = rider.halfZ * grow;
    blob.strength = rider.strength * strength * share;
    blob.innerX = 0; blob.innerZ = 0;
    this.contactNormal(blob, x, z, ground);
    layer.pushDynamic(blob);
  }

  /** The heightfield's normal under (x, z) when `ground` is the field there; flat on a solid's top. */
  private contactNormal(blob: MovingBlob, x: number, z: number, ground: number): void {
    blob.normalX = 0; blob.normalY = 1; blob.normalZ = 0;
    const plan = this.contactPlan;
    if (plan === null) return;
    const field = (px: number, pz: number): number => fieldHeightAt(plan.heightfield, plan.surround, px, pz);
    if (Math.abs(field(x, z) - ground) > 1e-3) return;
    const e = 0.5;
    const dx = (field(x + e, z) - field(x - e, z)) / (2 * e);
    const dz = (field(x, z + e) - field(x, z - e)) / (2 * e);
    blob.normalX = -dx; blob.normalY = 1; blob.normalZ = -dz;
  }

  private pushPopulationContact(layer: ContactShadows): void {
    const frame = this.contactPopulation;
    if (frame === null || this.contactActors.size === 0) return;
    const alpha = Number.isFinite(frame.alpha) ? Math.min(1, Math.max(0, frame.alpha)) : 1;
    const previous = this.contactPrevious;
    previous.clear();
    for (const pose of frame.previous.actors) previous.set(pose.id, pose);
    const blob = this.contactBlob;
    for (const b of frame.current.actors) {
      const spec = this.contactActors.get(b.id);
      if (spec === undefined || spec.kind !== b.kind) continue;
      const candidate = previous.get(b.id);
      const a = candidate !== undefined && candidate.kind === b.kind ? candidate : b;
      blob.x = a.x + (b.x - a.x) * alpha;
      blob.y = a.y + (b.y - a.y) * alpha;
      blob.z = a.z + (b.z - a.z) * alpha;
      blob.headingY = a.headingY + contactAngleDelta(a.headingY, b.headingY) * alpha;
      const hasNormal = Number.isFinite(b.groundNormalX) && Number.isFinite(b.groundNormalY) && Number.isFinite(b.groundNormalZ);
      blob.normalX = hasNormal ? b.groundNormalX! : 0;
      blob.normalY = hasNormal ? b.groundNormalY! : 1;
      blob.normalZ = hasNormal ? b.groundNormalZ! : 0;
      const hull = spec.hull;
      if (b.kind === 'parkedVehicle' || b.kind === 'serviceVehicle' || b.kind === 'trafficVehicle') {
        const vehicle = CONTACT_SHADOW.vehicle;
        blob.halfX = hull.halfWidthMetres + vehicle.skirtX;
        blob.halfZ = hull.halfLengthMetres + vehicle.skirtZ;
        blob.strength = vehicle.strength;
        blob.innerX = vehicle.innerX; blob.innerZ = vehicle.innerZ;
      } else if (b.kind === 'fictionalEuc') {
        const euc = CONTACT_SHADOW.populationEuc;
        blob.halfX = euc.halfX; blob.halfZ = euc.halfZ; blob.strength = euc.strength;
        blob.innerX = 0; blob.innerZ = 0;
      } else if (b.impactReaction === 'knockdown') {
        // Lying along the fall: a longer blob reaching out the way they went.
        const fallen = CONTACT_SHADOW.fallen;
        const yaw = blob.headingY + (b.impactFallYaw ?? 0);
        blob.x += Math.sin(yaw) * fallen.reach;
        blob.z += Math.cos(yaw) * fallen.reach;
        blob.headingY = yaw;
        blob.halfX = fallen.halfX; blob.halfZ = fallen.halfZ;
        blob.strength = CONTACT_SHADOW.person.strength;
        blob.innerX = 0; blob.innerZ = 0;
      } else {
        const person = CONTACT_SHADOW.person;
        blob.halfX = person.half;
        blob.halfZ = person.half;
        blob.strength = person.strength;
        blob.innerX = 0; blob.innerZ = 0;
      }
      layer.pushDynamic(blob);
    }
  }

  /**
   * A whole frame from the state already set.
   *
   * `Game` does not use this — it has to move the shadow focus and the
   * surround plane between passes, so it drives `beginFrame` and `renderView`
   * itself. This is for the callers that just want a frame on the canvas: the
   * four browser specs that force a redraw, and anything that follows them.
   */
  render(): void {
    this.beginFrame();
    for (let view = 0; view < this.viewCameras.length; view += 1) this.renderView(view);
  }

  /** Longest `warmPrograms` waits for parallel links before drawing anyway. */
  private static readonly warmCompileLimitMs = 10_000;

  /**
   * Link every program the installed world can draw, and upload its buffers,
   * while a loading cover still hides the canvas (RP-8). Call it after the
   * cover's first drawn frame at the current tier: boot's first frame, a world
   * swap, a quality switch and a multiplayer split.
   *
   * 1. `compile` walks the whole graph, hidden owners included (the ghost,
   *    the pack, Ultra-cached grass), with this frame's lights, fog and the
   *    default framebuffer's tone mapping, so each colour program is the one
   *    a later frame asks for. Distance and LOD ranges share their owner's
   *    program; the grass fade is keyed per tier and is current. Parallel
   *    links are awaited as `compileAsync` would, but bounded, because a lost
   *    context never reports a program ready.
   * 2. One draw with frustum culling off submits every visible owner to the
   *    shadow and colour passes: depth programs link and lazy geometry and
   *    instance buffers upload. A zero-area scissor keeps every canvas pixel;
   *    each pane redraws its own shadow map on its next frame.
   *
   * Nothing is created, hidden or moved, and no cost is priced. A world swap,
   * disposal or context loss during the wait skips the draw: that world's own
   * cover warms it.
   *
   * **M42: the pads are the one thing shown.** A mode that hides them (Chase,
   * Knockabout, Challenge) would otherwise leave their program and buffers to
   * upload the moment free ride shows them, mid-session — a plateau failure.
   * So the pad group is made visible *before* `compile` (and the zero-area
   * draw uploads it), and the mode's flag is restored in a `finally` spanning
   * the whole warm body — by the last of any overlapping warms (a count, not
   * a flag); a `setLaunchPadsVisible` meanwhile is stored and applied there.
   * The flock needs nothing: it is parked, never hidden.
   */
  async warmPrograms(): Promise<{ readonly programs: number; readonly milliseconds: number; readonly drawn: boolean }> {
    const pads = this.launchPadView;
    this.padWarms += 1;
    pads?.setVisible(true);
    try {
      return await this.warmVisiblePrograms();
    } finally {
      this.padWarms -= 1;
      // Only the last warm out restores the mode's flag: a warm that overlaps
      // this one (a world swapped in during its wait) still holds the current
      // pads shown through its own compile and zero-area draw (QA-B r1 m2).
      if (this.padWarms === 0) {
        pads?.setVisible(this.launchPadsVisible);
        // A world swapped in during the wait applied the flag at its build.
        this.launchPadView?.setVisible(this.launchPadsVisible);
      }
    }
  }

  /** `warmPrograms`' body: compile, then one zero-area draw of every visible owner. */
  private async warmVisiblePrograms(): Promise<{ readonly programs: number; readonly milliseconds: number; readonly drawn: boolean }> {
    const started = performance.now();
    const camera = this.cameraFor(0), world = this.terrain, gl = this.renderer.getContext();
    const report = (drawn: boolean) => ({ programs: this.renderer.info.programs?.length ?? 0,
      milliseconds: performance.now() - started, drawn });
    if (world === null || gl.isContextLost()) return report(false);
    this.supplements.sync(this.ultra.supplementContext());
    this.renderer.setRenderTarget(null);
    const linked = async (pending: Set<THREE.Material>): Promise<void> => {
      while (pending.size > 0 && performance.now() - started < GameRenderer.warmCompileLimitMs && !gl.isContextLost()) {
        for (const material of pending) {
          const program = (this.renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram;
          if (program === undefined || program.isReady()) pending.delete(material);
        }
        if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    // The grass fade re-keys at its next draw; key it now, so the compile
    // links the variant this tier and pane count draw.
    this.vegetation?.syncDetail();
    await linked(this.renderer.compile(this.scene, camera));
    // The grass program is keyed by its fade, which the couch rules move from
    // the third pane on (PERF-R2-1). Link the other pane count's variant too,
    // so a player sitting down never waits on a link; three keeps both.
    const vegetation = this.vegetation;
    if (!this.ultra.active && vegetation !== null && this.terrain === world && !gl.isContextLost()) {
      const panes = this.perfProbe !== null ? 4 : this.viewCameras.length;
      try {
        this.vegetationWarmPanes = panes >= VEGETATION_COUCH_DETAIL.minimumPanes ? 1 : VEGETATION_COUCH_DETAIL.minimumPanes;
        vegetation.syncDetail();
        // Only the grass owner, lit and fogged as the scene draws it.
        const pending = this.renderer.compile(vegetation.group, camera, this.scene);
        this.vegetationWarmPanes = null;
        await linked(pending);
      } finally { this.vegetationWarmPanes = null; vegetation.syncDetail(); }
    }
    if (this.terrain !== world || gl.isContextLost()) return report(false);
    const culled: THREE.Object3D[] = [];
    this.scene.traverseVisible((object) => {
      if (object.frustumCulled) { object.frustumCulled = false; culled.push(object); }
    });
    try {
      this.renderer.setRenderTarget(null);
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(0, 0, 0, 0);
      if (this.ultra.active && this.viewCameras.length === 1) this.ultra.beforeSoloRender(camera);
      this.renderer.render(this.scene, camera);
    } finally {
      for (const object of culled) object.frustumCulled = true;
      this.renderer.setScissorTest(false);
      this.renderer.setScissor(0, 0, this.lastWidth, this.lastHeight);
      this.renderer.setViewport(0, 0, this.lastWidth, this.lastHeight);
    }
    return report(true);
  }

  // -------------------------------------------------------------------------
  // The M27 Phase 0 quad probe — see the `perfProbe` field for what it is for
  // -------------------------------------------------------------------------

  /**
   * Arm the probe: plant three rigs beside `at` and draw every frame from now
   * on as a 2×2 quadrant grid, until `clearPerfQuadProbe`.
   *
   * Planting again re-plants — `tools/perf-window.js` offers that as a button
   * so the owner can carry the grid to whatever corner of a world he wants to
   * measure. The rigs stand at `at.y` because the probe plants them beside a
   * rider who is on the ground there; the renderer cannot ask the ground
   * itself (`TerrainSampler` is the simulation's, invariant 3), and an
   * instrument does not need it to.
   */
  plantPerfQuadProbe(at: { x: number; y: number; z: number }, headingY: number): void {
    if (this.viewCameras.length !== 1) {
      throw new Error('the quad probe is a solo instrument; a couch split is active');
    }
    // M39: the probe measures the ordinary four-seat frame, and Ultra never
    // draws more than one view — so it refuses rather than measuring a frame
    // the game cannot draw (invariant 11).
    if (this.ultra.active) {
      throw new Error('the quad probe measures ordinary tiers; Ultra is active');
    }
    this.clearPerfQuadProbe();

    // Three distinct playables, none of them the ridden character, so the
    // scene holds four different riders and four different machines — the
    // frame the four-seat measurement is about (q68's spirit). The ridden
    // character is `ghostCharacter`: `setCharacter` stores it for the ghost's
    // sake and it is the one place the renderer knows who is riding.
    const looks = PLAYABLE_RIDER_LOOKS
      .filter((look) => look.id !== this.ghostCharacter)
      .slice(0, 3);
    const sin = Math.sin(headingY);
    const cos = Math.cos(headingY);
    // Offsets in the rider's frame (+X their left, +Z forward): a loose grid
    // beside and behind, near enough that pane 0's surround centre and shadow
    // neighbourhood cover everyone, far enough apart to read as four riders.
    const offsets = [
      { x: 2.2, z: 0 },
      { x: -2.2, z: -1.6 },
      { x: 0.4, z: -3.2 },
    ];

    const probe: PerfQuadProbe = { rigs: [], cameras: [] };
    for (const [index, look] of looks.entries()) {
      const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
      // Not 'riding-rig': `tools/rider-views.mjs` finds the player's rig by
      // that name and relies on it being unique in the scene.
      rig.group.name = `perf-probe-rig-${index}`;
      const offset = offsets[index];
      const x = at.x + offset.x * cos + offset.z * sin;
      const z = at.z - offset.x * sin + offset.z * cos;
      // From `createPose()`, never a bare literal — it seeds `recoverBlend`
      // to 1, and a pose built from zeros is a faded ghost of a rider.
      // `restFactor` 1 is the one-foot-down stand, so a planted rig reads as
      // parked rather than as frozen mid-ride.
      const pose = createPose();
      pose.x = x;
      pose.y = at.y;
      pose.z = z;
      pose.groundY = at.y;
      pose.headingY = headingY;
      pose.restFactor = 1;
      rig.apply(pose);
      this.scene.add(rig.group);
      probe.rigs.push({ rig, at: { x, y: at.y, z } });

      // A chase-style frame on the planted rig: the spring arm's rest length
      // and height, looking at the chest — hip height plus
      // `CAMERA.targetHeightOffset`, the 1.27 m the tuning table's own note
      // derives. Static, because the subject is; nothing else writes these
      // cameras (`setFieldOfView` and `applyViewAspects` walk `viewCameras`,
      // which the probe deliberately never touches).
      const camera = new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(CAMERA.fovAtRest),
        1,
        CAMERA.near,
        CAMERA.far,
      );
      camera.position.set(
        x - sin * CAMERA.distanceAtRest,
        at.y + CAMERA.armHeight,
        z - cos * CAMERA.distanceAtRest,
      );
      camera.lookAt(x, at.y + 1.27, z);
      probe.cameras.push(camera);
    }
    this.perfProbe = probe;
  }

  /** Disarm: give the rigs back, and the game camera its full-canvas aspect. */
  clearPerfQuadProbe(): void {
    if (this.perfProbe === null) return;
    for (const planted of this.perfProbe.rigs) {
      // Remove before disposing — the plateau rule (`Game.despawnSecondRider`
      // records why): `RidingRig.dispose` self-detaches, and the explicit
      // removal is the rule rather than the call.
      this.scene.remove(planted.rig.group);
      planted.rig.dispose();
    }
    this.perfProbe = null;
    this.applyViewAspects();
  }

  /** Whether the probe is armed. The self-test's question, answered plainly. */
  get perfQuadArmed(): boolean {
    return this.perfProbe !== null;
  }

  /**
   * Where one probe pane sits, in CSS pixels with WebGL's bottom-left origin.
   *
   * Rounded boundaries on **both** axes, for the reason `viewBounds` records
   * on one: `round(size * n / 2)` makes every edge a single number shared by
   * the pane that ends there and the pane that starts there, so the four
   * panes tile the canvas exactly once at any width and any height, odd ones
   * included. Panes 0|1 are the top row, 2|3 the bottom.
   *
   * **It is `viewBounds`' arithmetic, not a copy of it, since M27 Phase 1.**
   * The probe measured a four-pass frame a milestone before any seat could ask
   * for one, so it had to own the grid itself; now the real partition draws
   * the same grid, and two functions rounding the same edges independently is
   * exactly how a probe ends up measuring a frame the game does not draw.
   */
  perfQuadBounds(pane: number): PaneRect {
    if (this.perfProbe === null) throw new Error('the quad probe is not armed');
    if (!Number.isInteger(pane) || pane < 0 || pane > 3) {
      throw new Error(`no such probe pane: ${pane} (panes: 4)`);
    }
    return paneBounds(this.lastWidth, this.lastHeight, paneGridFor(4), pane);
  }

  /**
   * The four passes. Pane 0 is the ridden rider through the game's own camera,
   * with the shadow focus and surround centre the caller already pointed at
   * them; panes 1–3 each move the shadow focus to their planted rig first,
   * exactly as `Game.render` moves it between real seat passes — the surround
   * plane stays centred on the ridden rider, whom the rigs stand beside by
   * construction. The focus is left on the last rig at frame end and the next
   * frame's caller re-points it, the same hand-back the real split performs.
   */
  private renderPerfQuadFrame(probe: PerfQuadProbe): void {
    for (let pane = 0; pane < 4; pane += 1) {
      const rect = this.perfQuadBounds(pane);
      let camera: THREE.PerspectiveCamera;
      if (pane === 0) {
        camera = this.camera;
      } else {
        const planted = probe.rigs[pane - 1];
        this.setShadowFocus(planted.at.x, planted.at.y, planted.at.z);
        camera = probe.cameras[pane - 1];
      }
      // Each pane's aspect is its own rect's — a quadrant of an even canvas is
      // the canvas's own 16:9, which is §27.2's whole geometric argument, and
      // an odd canvas gives its four panes their honest slightly-different
      // answers. Pane 0 writes the game camera and `applyViewAspects` writes
      // it back on the next layout change; the next probe frame re-asserts.
      const aspect = rect.height === 0 ? 1 : rect.width / rect.height;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      this.renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
      this.renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
      this.renderer.setScissorTest(true);
      // The probe measures the four-seat frame the game draws, so each pane
      // trims the riders it is not about exactly as a real seat pass does
      // (OD-3): pane 0 is the ridden rider's, pane n the n-th planted rig's.
      try {
        this.trimOtherRiders(4, pane === 0 ? this.paneSubject(0) : probe.rigs[pane - 1].rig);
        this.renderer.render(this.scene, camera);
      } finally {
        this.paneShadowTrim.restore();
      }
    }
  }

  dispose(): void {
    const oldPreparedSupplements = this.preparedEnvironmentSupplements;
    this.preparedGroundEdges = null;
    this.groundEdgeRefusal = null;
    this.preparedEnvironmentSupplements = null;
    this.presentationSelection = null;
    this.population?.dispose();
    this.population = null;
    this.contactShadows?.dispose();
    this.contactShadows = null;
    this.vegetation?.dispose();
    this.vegetation = null;
    this.supplements.dispose();
    // M39: every Ultra-owned resource first, through the one teardown — minus
    // re-hanging an ordinary light and rebuilding a world nobody will see.
    this.ultra.teardown('dispose');
    this.clearPerfQuadProbe();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.terrain?.dispose();
    this.terrain = null;
    this.streetLife?.dispose();
    this.streetLife = null;
    this.environmentDecor?.dispose();
    this.environmentDecor = null;
    this.districtDecor?.dispose();
    this.districtDecor = null;
    this.districtExterior?.dispose();
    this.districtExterior = null;
    this.metricFacade?.dispose();
    this.metricFacade = null;
    this.launchPadView?.dispose();
    this.launchPadView = null;
    this.squirrels?.dispose();
    this.squirrels = null;
    this.birds?.dispose();
    this.birds = null;
    this.districtExteriorAppearance?.dispose();
    this.districtExteriorAppearance = null;
    oldPreparedSupplements?.dispose();
    this.gates?.dispose();
    this.gates = null;
    this.targets?.dispose();
    this.targets = null;
    this.ghost.dispose();
    for (const cop of this.cops) cop.dispose();
    this.lighting.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    this.sun.shadow.dispose();
    this.sun.dispose();
    this.hemisphere.dispose();
    this.renderer.dispose();
  }
}
