/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.ts';
import type { CharacterId } from '../data/riders.ts';
import {
  limbProfile,
  loftGeometry,
  loftProfile,
  mergeGeometries,
  tintOver,
  type LoftProfile,
  type Tint,
} from './blockoutKit.ts';

/**
 * What a rider *looks* like, as data — one entry per character.
 *
 * **The rig is not in here and never will be.** `render/rider.ts` owns the
 * joint hierarchy, the two-link IK, and the entire stance solve; this file owns
 * the cross-sections, the shades, the materials, and the panels that hang on
 * them. That split is the whole reason a second character was a day's work
 * rather than a rewrite: `applyStanceReaction` never touches a mesh, a
 * material, or a profile, so two looks are two sets of numbers under one
 * unchanged animation path.
 *
 * Four rules bind anything added below, and each one cost something to learn:
 *
 * **1. Both looks share `RIDER_BLOCKOUT`'s skeleton.** Every bone length, the
 * stance width, the ankle height above the pedal, the shoulder half-width — all
 * of it is one table for both characters. A silhouette difference comes from
 * ring radii, `square`, and panels; never from a different thigh. The chase
 * camera was tuned at M3 against `RIDER.hipHeight`, the boots-planted-on-the-
 * pedals property is asserted in `render/riderEuc.test.ts`, and half a dozen
 * browser specs check poses against those constants. A second skeleton is a
 * second camera tuning and a second set of expected values, which is a
 * different and much larger job.
 *
 * **2. Mesh *count* is the budget, not mesh *detail*.** The frame ceiling is
 * 150 draw calls and the whole non-level scene already reserves 83 of them; a
 * casting rider mesh costs three (colour pass, shadow pass, and the ghost's
 * copy) and a non-casting one costs one. Triangles are the resource with room —
 * 21 k of 400 k. So Trollina buys her hair, her cap sleeves, her belt and her
 * own seat mesh by *not* having elbow pads, accent panels or a casting
 * shoulder panel, and lands on the same 16 casting meshes Cool Rider has with
 * one fewer mesh overall. `render/renderCost.ts` measures every look and
 * reserves the worst; if a look ever grows past the other, that is where it
 * shows up rather than in a player's frame.
 *
 * **3. `castShadow` means "this carries silhouette", and the ghost reads it.**
 * `render/ghostRider.ts` decides what a replay draws by walking the rig and
 * asking each mesh whether it casts. A flat identity panel that casts becomes a
 * meaningless blue blob on the ghost; a part with real outline that does not
 * cast vanishes from it. Every `casts` flag below is that decision, taken once.
 *
 * **4. Colour lives in `data/tuning.ts`.** Only the *shape* is here. That is
 * invariant 4, and it is also practical: the rider's albedo has to be picked
 * against the wheel's, the ground's, and the sun's, and those all sit together
 * in `BLOCKOUT_COLOURS`.
 */

// -- Material slots ----------------------------------------------------------

/**
 * A material, as parameters rather than as an object.
 *
 * Deliberately not a `THREE.Material`: a look is a frozen module-level
 * constant and a material is a disposable GPU resource, so the table describes
 * one and `render/rider.ts` constructs it per rig and tracks it for disposal.
 * A look that handed out shared material instances would leak on the first
 * character swap and take the ghost's overwritten `mesh.material` with it.
 */
export interface RiderMaterialSpec {
  readonly colour: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
}

/**
 * The six roles a rider mesh can be painted in.
 *
 * Six rather than five because Cool Rider's jacket and his sleeves are one
 * material and Trollina's dress and her arms are emphatically not. Two roles
 * pointing at the *same spec object* are deduplicated by identity when the
 * materials are built, so Cool Rider still ends up with exactly the five
 * materials he had before this file existed.
 */
export interface RiderMaterials {
  /** Torso: a jacket, or a dress. */
  readonly body: RiderMaterialSpec;
  /** Arms, legs, neck: sleeves and trousers, or bare skin. */
  readonly limbs: RiderMaterialSpec;
  /** The identity panels: reflective blue, or a lighter scribble pink. */
  readonly accent: RiderMaterialSpec;
  /** The head shell: a helmet, or a face. */
  readonly head: RiderMaterialSpec;
  /** What sits in the head's aperture: a visor, or two eyes. */
  readonly face: RiderMaterialSpec;
  /** Boots, and whatever else is protective gear. */
  readonly gear: RiderMaterialSpec;
}

export type RiderMaterialRole = keyof RiderMaterials;

// -- Panels ------------------------------------------------------------------

/**
 * Where a panel's `u` span is measured from.
 *
 * A patch is authored as an angular span on a loft, and every panel on a rider
 * is placed relative to one of three landmarks rather than to an absolute
 * angle. Saying so makes a mirrored pair one entry instead of two, and makes a
 * chest chevron unmistakable from a back panel at a glance.
 */
export type PatchAnchor = 'front' | 'back' | 'outboard';

/**
 * One panel lying on a body, in metres and radians.
 *
 * `from`/`to` are **heights on the profile**, not ring indices — the same
 * reason `patchBetween` exists in `render/rider.ts`: inserting a ring into a
 * profile must not silently move a decal.
 */
export interface RiderPatch {
  readonly anchor: PatchAnchor;
  /** Span start, as an offset from the anchor angle. */
  readonly u0: number;
  readonly u1: number;
  /**
   * Multiply both offsets by the side sign (+1 left, -1 right).
   *
   * For a pair that meets at the centreline — the chest chevrons — rather than
   * a pair that sits symmetrically about a landmark, which `anchor: 'outboard'`
   * already handles. `patchGeometry` rewinds a reversed span itself, so a
   * mirrored pair cannot render inside-out.
   */
  readonly mirrored?: boolean;
  readonly from: number;
  readonly to: number;
  readonly uSegments: number;
  readonly vSegments: number;
  readonly lift?: number;
  readonly sink?: number;
  readonly taper?: number;
  /**
   * Shear the height span diagonally across the angular span, expressed as the
   * two heights the shear runs between so it reads in metres like everything
   * else here. Positive `skewFrom` above `skewTo` drops the outer end.
   */
  readonly skewFrom?: number;
  readonly skewTo?: number;
  readonly shade?: number;
}

/** A group of panels drawn as one mesh on one joint. */
export interface RiderPanelGroup {
  readonly patches: readonly RiderPatch[];
  readonly role: RiderMaterialRole;
  /** See rule 3 in the file comment. */
  readonly casts: boolean;
}

// -- Extras ------------------------------------------------------------------

/**
 * A mesh a look adds that the other does not have — today, hair.
 *
 * The geometry is built by a closure rather than described as data because
 * there is exactly one of these and describing 26 pseudo-random spikes as a
 * table would be a worse document than the loop that makes them. The closure
 * must return a geometry carrying **normals and a `color` attribute** or
 * `mergeGeometries` refuses it and, worse, a non-merged mesh without one
 * renders pure black under these `vertexColors: true` materials.
 */
export interface RiderExtra {
  readonly name: string;
  /** Which joint it hangs from. `neck` is where the head is. */
  readonly joint: 'neck' | 'pelvis';
  readonly role: RiderMaterialRole;
  readonly casts: boolean;
  build(): THREE.BufferGeometry;
}

// -- The look ----------------------------------------------------------------

export interface RiderLook {
  readonly id: CharacterId;
  readonly materials: RiderMaterials;

  readonly profiles: {
    /** The torso garment, hem to collar. `y = 0` is the hip joint. */
    readonly torso: LoftProfile;
    /** What closes the torso's open hem — hips under a jacket, shorts under a dress. */
    readonly seat: LoftProfile;
    readonly thigh: LoftProfile;
    readonly shin: LoftProfile;
    readonly upperArm: LoftProfile;
    readonly forearm: LoftProfile;
    readonly neck: LoftProfile;
    /** A helmet, or a head. `y = 0` is the neck joint. */
    readonly head: LoftProfile;
    readonly boot: LoftProfile;
    readonly bootSole: LoftProfile;
    /** A glove, or a bare hand. */
    readonly hand: LoftProfile;
    /**
     * A whole garment sleeve hanging from the shoulder joint, drawn in the
     * body material — Trollina's puff cap sleeve. A *loft*, not a patch, for
     * the same reason her eyes are: a patch band around the top of an arm has
     * an open rim at both ends, and the capture showed exactly that — two
     * rolled cuffs floating with daylight inside. A closed loft has a top
     * over the joint and a hem lining under it, so there is no inside to see.
     * It rides the arm to preserve that join; the bodice overlap is authored
     * separately and proven in `riderLook.test.ts`.
     */
    readonly sleeve?: LoftProfile;
  };

  /** Vertex-colour multipliers on shared materials. 1 is the authored colour. */
  readonly shades: {
    /** The lower garment inside the torso mesh. */
    readonly seat: number;
    /**
     * Thighs and shins.
     *
     * Separate from `seat` because they are only the same thing on a rider
     * whose trousers and hips are one garment. Cool Rider's legs *are* his
     * seat, one step down from the jacket so the figure keeps its form with
     * the sun behind it; Trollina's are bare skin and take the authored
     * colour unchanged.
     */
    readonly legs: number;
    readonly collar: number;
    readonly sole: number;
    readonly neck: number;
  };

  /** Which material role each ambiguous part is painted in. */
  readonly parts: {
    readonly hands: RiderMaterialRole;
    /**
     * The neck — M19. Defaults to `limbs`, which every look before Red Rider
     * was happy with: Cool Rider's neck is his suit, Trollina's is her skin.
     * His is a black gaiter under a red suit, and `shades.neck` cannot say
     * that: a shade is a scalar *multiplier*, so 0.20 × suit-red is not black,
     * it is dark maroon — which on a figure reads as one thing only, bare
     * skin. A hue change needs a material, not a shade.
     */
    readonly neck?: RiderMaterialRole;
    readonly kneePad: RiderMaterialRole;
    /**
     * Thighs and shins — separate from the arms since the second Trollina look
     * pass, because "limbs" stopped being one material the moment she put on
     * tights. Cool Rider names `limbs` here and nothing about him changes.
     *
     * **Tights are also the structural half of the carve-clip fix.** A leg is
     * posed by IK against planted pedals and a garment is rigid on the pelvis,
     * so in a deep compound stance (carve + crouch, or a full tuck) the two
     * *will* eventually intersect — no hem the owner would accept can clear
     * every reachable fold. Below the skirt everything the leg can touch is
     * now the same dark gear material at the same shade, so the intersection
     * class that remains has nothing to show: dark-on-dark, same value, no
     * seam. The pink skirt itself ends high enough to be provably clear —
     * `render/riderClearance.test.ts` is that proof.
     */
    readonly legs: RiderMaterialRole;
    /**
     * What closes the torso's open hem. `'body'` merges it into the torso mesh
     * at `shades.seat`, which is Cool Rider's trousers exactly as they were;
     * any other role builds it as its own non-casting mesh, which is how
     * Trollina's hip shorts join her tights instead of her dress.
     */
    readonly seat: RiderMaterialRole;
  };

  readonly panels: {
    /** Merged into the torso mesh. Closes the loft's neck opening. */
    readonly collar?: RiderPatch;
    readonly shoulders?: RiderPanelGroup;
    readonly torso?: RiderPanelGroup;
    /** On the torso, at the waist: Trollina's belt. One mesh, full wrap. */
    readonly waist?: RiderPanelGroup;
    readonly sleeve?: RiderPanelGroup;
    readonly elbowPad?: RiderPanelGroup;
    /**
     * On the thigh — M22, and the mirror of `elbowPad` sitting on the forearm
     * rather than on the upper arm.
     *
     * **Armour spans a joint; a mesh cannot.** Everything above is parented to
     * the bone it decorates, and the knee is precisely where the two leg bones
     * part company: a guard authored entirely in `kneePad` is parented to the
     * shin, so every millimetre of it above the knee swings off the thigh the
     * moment the leg bends. Adonisb2's guard covers the lower third of his
     * thigh in the reference, which is a third of the guard, so his look is the
     * first that cannot be built without this slot — and the alternative,
     * hanging it off the pelvis as an extra, is the fixed-garment-volume defect
     * `parts.legs` documents at length.
     */
    readonly thighPad?: RiderPanelGroup;
    readonly kneePad?: RiderPanelGroup;
    /** Merged into the head mesh: chin bar, brow, spoiler, rim — or none. */
    readonly head: readonly RiderPatch[];
    /** The aperture: one visor, or two eyes. */
    readonly face?: RiderPanelGroup;
  };

  readonly extras: readonly RiderExtra[];

  /**
   * Optional vertex repaints on the limb and boot meshes, run once at build.
   *
   * **Paint is the only decoration a limb can afford.** A panel group on a leg
   * is a mesh, a mesh is a draw call, and the cop — the look this exists for —
   * has none to spend (`render/copRider.ts`). A vertex colour is an RGB
   * *multiplier* on the mesh's one material, so a repaint can turn a band of
   * skin into navy shorts, a sock, or a black knee pad for nothing but
   * arithmetic — and because it rides the mesh it decorates, it moves with the
   * IK and can never clip the way a pelvis-fixed garment volume does
   * (Trollina's carve-clip lesson). Crisp edges come from the profile: put a
   * seam ring pair at every paint boundary, or the band edge smears across
   * whatever ring gap it lands in.
   *
   * Every painter is handed the **side** it is building (+1 left, −1 right),
   * because each limb gets a fresh geometry per side and a painter that does
   * not know which one it is on cannot place anything asymmetrically. Height
   * bands ignore it; an outboard mark cannot (M19's thigh graphic, which spent
   * one build painted onto the inside of his right leg before this argument
   * existed).
   */
  readonly paint?: {
    readonly thigh?: (geometry: THREE.BufferGeometry, side: number) => void;
    readonly shin?: (geometry: THREE.BufferGeometry, side: number) => void;
    readonly boot?: (geometry: THREE.BufferGeometry, side: number) => void;
    /**
     * The glove — M19. A hand is a single lofted mesh with no panel slot of
     * its own, so knuckle armour that is a different colour from the glove
     * has nowhere else to live.
     */
    readonly hand?: (geometry: THREE.BufferGeometry, side: number) => void;
  };

  /**
   * Static additions to the relaxed hand target, in metres.
   *
   * The rig solves both arms to a base target and every reaction is an offset
   * from it, so a look can carry a whole arm *carriage* — Trollina's arms are
   * wider and higher than Cool Rider's, which is the pose the original doodle
   * is drawn in — without any reaction being able to flatten it away.
   */
  readonly armCarriage: {
    readonly splay: number;
    readonly rise: number;
  };

}

// -- Cool Rider --------------------------------------------------------------
//
// Everything below this line up to Trollina is the M7.5 look pass, moved out
// of `render/rider.ts` unchanged. The numbers, and the reasoning attached to
// them, are the ones the owner accepted; nothing here was re-picked while
// making the file parameterisable.

const TORSO_HALF_WIDTH = RIDER_BLOCKOUT.torsoWidth / 2;
const TORSO_HALF_DEPTH = RIDER_BLOCKOUT.torsoDepth / 2;

/**
 * The jacket, hem to collar. `y = 0` is the hip joint.
 *
 * The hem is two rings 28 mm apart rather than one, which is what makes it a
 * *lip* — a garment ending over the hips — instead of a taper running out. It
 * is the single most valuable pair of rings in the file: without it the torso
 * and the legs are one continuous mass, which is exactly how the M2 figure
 * read.
 */
const JACKET = loftProfile([
  { y: -0.010, halfWidth: 1.03 * TORSO_HALF_WIDTH, halfDepth: 1.01 * TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.018, halfWidth: 0.98 * TORSO_HALF_WIDTH, halfDepth: 0.96 * TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.050, halfWidth: 0.90 * TORSO_HALF_WIDTH, halfDepth: 0.93 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: 0.155, halfWidth: 0.86 * TORSO_HALF_WIDTH, halfDepth: 0.87 * TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.290, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 1.01 * TORSO_HALF_DEPTH, square: 2.6, z: 0.008 },
  { y: 0.400, halfWidth: 1.00 * TORSO_HALF_WIDTH, halfDepth: 0.98 * TORSO_HALF_DEPTH, square: 2.9, z: 0.006 },
  { y: 0.470, halfWidth: 1.00 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 3.1, z: 0.002 },
  { y: 0.500, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.82 * TORSO_HALF_DEPTH, square: 2.9 },
  { y: 0.528, halfWidth: 0.74 * TORSO_HALF_WIDTH, halfDepth: 0.66 * TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.548, halfWidth: 0.44 * TORSO_HALF_WIDTH, halfDepth: 0.50 * TORSO_HALF_DEPTH, square: 2.3 },
]);

/**
 * The hips, as a separate short loft tucked up under the hem.
 *
 * Separate because it is *trousers*, and the whole point of splitting it out is
 * that it can carry a darker shade inside the same mesh and the same material.
 * A rider dressed head to foot in one value is a rider with no internal form in
 * shade. It also closes the gap the M2 figure had between an egg and two legs.
 */
const SEAT = loftProfile([
  { y: -0.088, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.80 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
]);

/**
 * Limbs, tapered, with padding seams where moto armour actually breaks.
 *
 * The seam fractions are not decoration. A padded trouser breaks above and
 * below the knee and a padded sleeve breaks at the bicep, and a rider whose
 * limbs are smooth tubes is wearing a wetsuit.
 */
const THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.079, 0.072, 0.061], [0.30, 0.62], {
  flatten: 0.94,
  square: 2.4,
});
const SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.064, 0.058, 0.046], [0.42], {
  flatten: 0.92,
  square: 2.4,
});
const UPPER_ARM = limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.058, 0.050, 0.043], [0.55], {
  flatten: 0.95,
  square: 2.3,
});
const FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.047, 0.041, 0.033], [0.45], {
  flatten: 0.94,
  square: 2.3,
});

/** The neck, tapering into the collar rather than a cylinder cut off at both ends. */
const NECK = loftProfile([
  { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
  { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
  { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
  { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
]);

/**
 * The helmet. `y = 0` is the neck joint.
 *
 * The lower rings sit forward: a full-face helmet's jaw leads its crown, and
 * that offset is most of what separates "helmet" from "ball" in profile. The
 * chin bar and the rear spoiler are patches on this, not extra meshes.
 */
const HELMET = loftProfile([
  { y: 0.088, halfWidth: 0.070, halfDepth: 0.080, square: 2.3, z: 0.012 },
  { y: 0.118, halfWidth: 0.104, halfDepth: 0.116, square: 2.5, z: 0.012 },
  { y: 0.158, halfWidth: 0.119, halfDepth: 0.130, square: 2.6, z: 0.008 },
  { y: 0.215, halfWidth: 0.124, halfDepth: 0.133, square: 2.5, z: 0.004 },
  { y: 0.268, halfWidth: 0.113, halfDepth: 0.119, square: 2.3 },
  { y: 0.308, halfWidth: 0.084, halfDepth: 0.088, square: 2.2 },
  { y: 0.336, halfWidth: 0.040, halfDepth: 0.042, square: 2.2 },
  { y: 0.348, halfWidth: 0, halfDepth: 0 },
]);

/**
 * The boot, lofted along the foot and then stood up by `render/rider.ts`.
 *
 * Authored heel-to-toe because that is the axis a boot has a shape along. The
 * sole is a separate flat slab: a lofted underside is a rocker, and a rocker on
 * a pedal reads as a boot hovering over it.
 */
const BOOT = loftProfile([
  { y: -0.098, halfWidth: 0.030, halfDepth: 0.026, square: 2.4 },
  { y: -0.080, halfWidth: 0.052, halfDepth: 0.040, square: 2.7 },
  { y: -0.035, halfWidth: 0.062, halfDepth: 0.047, square: 2.9 },
  { y: 0.020, halfWidth: 0.064, halfDepth: 0.040, square: 2.9 },
  { y: 0.082, halfWidth: 0.060, halfDepth: 0.031, square: 2.9 },
  { y: 0.122, halfWidth: 0.043, halfDepth: 0.022, square: 2.6 },
  { y: 0.142, halfWidth: 0.014, halfDepth: 0.009, square: 2.4 },
]);

/**
 * The boot's tread, as a low rounded rectangle rather than a box.
 *
 * The grounded foot exposes the sole directly to the chase camera in the
 * stopped stance, so a stock box reads as a separate rectangle under the boot.
 */
const BOOT_SOLE = loftProfile([
  { y: -0.018, halfWidth: 0.060, halfDepth: RIDER_BLOCKOUT.bootLength * 0.44, square: 4.2 },
  { y: -0.003, halfWidth: 0.065, halfDepth: RIDER_BLOCKOUT.bootLength * 0.47, square: 5.2 },
  { y: 0, halfWidth: 0.062, halfDepth: RIDER_BLOCKOUT.bootLength * 0.45, square: 4.6 },
]);

/** The glove: a cuff, a palm, and a closed end. Never a box with square corners. */
const GLOVE = loftProfile([
  { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
  { y: -0.022, halfWidth: 0.046, halfDepth: 0.040, square: 2.8 },
  { y: -0.040, halfWidth: 0.041, halfDepth: 0.037, square: 2.8 },
  { y: -0.082, halfWidth: 0.039, halfDepth: 0.034, square: 2.9 },
  { y: -0.098, halfWidth: 0.023, halfDepth: 0.020, square: 2.6 },
  { y: -0.105, halfWidth: 0, halfDepth: 0 },
]);

const SUIT: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.riderSuit,
  roughness: 0.82,
  metalness: 0.0,
});

export const COOL_RIDER_LOOK: RiderLook = Object.freeze({
  id: 'cool-rider' as CharacterId,
  materials: Object.freeze({
    body: SUIT,
    // The same object, deliberately: the jacket and the sleeves are one
    // garment, and `render/rider.ts` builds one material per distinct spec.
    limbs: SUIT,
    // Reflective, not merely blue — a material property of the character.
    accent: Object.freeze({
      colour: BLOCKOUT_COLOURS.riderPanel,
      roughness: 0.26,
      metalness: 0.18,
      emissive: 0x0e2c58,
      emissiveIntensity: 0.55,
    }),
    head: Object.freeze({
      colour: BLOCKOUT_COLOURS.riderHelmet,
      roughness: 0.35,
      metalness: 0.05,
    }),
    face: Object.freeze({
      colour: BLOCKOUT_COLOURS.riderVisor,
      roughness: 0.12,
      metalness: 0.35,
    }),
    gear: Object.freeze({
      colour: BLOCKOUT_COLOURS.riderBoot,
      roughness: 0.7,
      metalness: 0.0,
    }),
  }),
  profiles: Object.freeze({
    torso: JACKET,
    seat: SEAT,
    thigh: THIGH,
    shin: SHIN,
    upperArm: UPPER_ARM,
    forearm: FOREARM,
    neck: NECK,
    head: HELMET,
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: GLOVE,
  }),
  shades: Object.freeze({ seat: 0.86, legs: 0.86, collar: 1.14, sole: 0.72, neck: 0.78 }),
  parts: Object.freeze({
    hands: 'gear' as RiderMaterialRole,
    kneePad: 'accent' as RiderMaterialRole,
    // One garment head to toe: the trousers are the jacket's material one
    // shade down, exactly as they were before these two slots existed.
    legs: 'limbs' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    // Opened at the front, so the one rim the slab cannot avoid lands where a
    // jacket has a seam anyway rather than down the middle of the back.
    collar: Object.freeze({
      anchor: 'front' as PatchAnchor,
      u0: 0,
      u1: Math.PI * 2,
      from: 0.502,
      to: 0.545,
      uSegments: 20,
      vSegments: 2,
      lift: 0.011,
      shade: 1.14,
    }),
    // A pair rather than a bar across the top: the blue runs over each shoulder
    // and continues down the outer sleeve, and a single band all the way round
    // reads as a sash. The only blue on the rider that casts — it sits on the
    // widest part of the silhouette.
    shoulders: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: true,
      patches: Object.freeze([Object.freeze({
        anchor: 'outboard' as PatchAnchor,
        u0: -0.72,
        u1: 0.72,
        from: 0.395,
        to: 0.512,
        uSegments: 7,
        vSegments: 4,
        lift: 0.011,
        taper: 0.34,
      })]),
    }),
    // Chest chevrons and the back panel, in one buffer: they share the pelvis
    // and are both too flat to cast. The chevrons are sheared bands climbing
    // toward the centreline; the back panel is the largest single piece of blue
    // on the character, because the chase camera is behind the rider
    // essentially all the time.
    torso: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: 0.10,
          u1: 0.92,
          mirrored: true,
          from: 0.300,
          to: 0.352,
          uSegments: 6,
          vSegments: 2,
          lift: 0.010,
          skewFrom: 0.330,
          skewTo: 0.395,
          taper: 0.25,
        }),
        // Sized between the shoulder blades rather than across the whole back:
        // hem-to-collar at ±50° made the panel the garment rather than an
        // accent, which is neither the reference nor the LOCKED description.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.60,
          u1: 0.60,
          from: 0.205,
          to: 0.492,
          uSegments: 7,
          vSegments: 5,
          lift: 0.010,
          taper: 0.16,
        }),
      ]),
    }),
    // The blue runs down the *outer* sleeve, not around the whole arm: a solid
    // blue upper and a black lower put a hard colour break at the elbow and
    // read as a machine joint rather than as a sleeve.
    sleeve: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'outboard' as PatchAnchor,
        u0: -0.92,
        u1: 0.92,
        from: -0.245,
        to: 0.002,
        uSegments: 6,
        vSegments: 5,
        lift: 0.009,
        taper: 0.22,
      })]),
    }),
    // Elbow armour, on the side the elbow actually points: the chains bend
    // backward, so this is the face a rider lands on.
    elbowPad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: -0.62,
        u1: 0.62,
        from: -0.058,
        to: -0.004,
        uSegments: 5,
        vSegments: 3,
        lift: 0.011,
        taper: 0.3,
      })]),
    }),
    // Kept small: the knee sits at almost exactly the height of the wheel's
    // shell, so a large bright pad there reads as part of the wheel.
    kneePad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.66,
        u1: 0.66,
        from: -0.078,
        to: -0.016,
        uSegments: 5,
        vSegments: 3,
        lift: 0.012,
        taper: 0.3,
      })]),
    }),
    head: Object.freeze([
      // A chin bar wraps to the cheek and stops. At ±54° its outer rim came
      // back round to the jaw, where the shell is narrowest, and stood proud of
      // the silhouette as a square tab.
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.70,
        u1: 0.70,
        from: 0.098,
        to: 0.150,
        uSegments: 6,
        vSegments: 3,
        lift: 0.015,
        taper: 0.42,
      }),
      // The brow, kept off the temples: a rim that crosses the shell's own
      // silhouette reads as a chip out of the helmet.
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.86,
        u1: 0.86,
        from: 0.236,
        to: 0.256,
        uSegments: 7,
        vSegments: 1,
        lift: 0.011,
        taper: 0.3,
      }),
      // The spoiler, low and aft where the shell is widest and a lift is
      // tangent to it. Authored across the crown it was a slab on a dome.
      Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: -0.78,
        u1: 0.78,
        from: 0.150,
        to: 0.206,
        uSegments: 8,
        vSegments: 3,
        lift: 0.012,
        taper: 0.62,
        shade: 1.05,
      }),
      // A rim at the base of the shell, one step lighter, so the helmet ends
      // somewhere instead of dissolving into the collar.
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0,
        u1: Math.PI * 2,
        from: 0.090,
        to: 0.113,
        uSegments: 18,
        vSegments: 1,
        lift: 0.004,
        shade: 1.08,
      }),
    ]),
    // The visor sits *in* the aperture — sunk below the shell and lifted only a
    // little, so it reads as glass in a recess rather than as a bar stuck on.
    face: Object.freeze({
      role: 'face' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.80,
        u1: 0.80,
        from: 0.172,
        to: 0.234,
        uSegments: 9,
        vSegments: 3,
        lift: 0.007,
        sink: -0.014,
        taper: 0.22,
      })]),
    }),
  }),
  extras: Object.freeze([]),
  armCarriage: Object.freeze({ splay: 0, rise: 0 }),
});

// -- Trollina ----------------------------------------------------------------
//
// The joke drawing, built for real — **second design pass, 2026-08-10.** The
// first build followed interpretation B (bare limbs, one long dress, scribble
// panels) and the owner rejected it on sight: "not so great", "too much jank",
// "make her more female", and one hard defect — "when carving the outer leg
// clips the skirt". This pass leans on interpretation A instead, which
// `references/female rider/` describes as the more grounded reading, and which
// turns out to be the *engineering* answer as well as the aesthetic one: a
// skater skirt over black tights is an outfit whose failure modes are
// invisible, where a long dress over bare legs is one long clip waiting for a
// compound stance.
//
// What reads as "her", in the order a player meets it: a mass of wild magenta
// hair that frames the face from every angle, an hourglass silhouette — cinched
// high waist, flared hem, hips wider than the waist — huge cartoon eyes with
// pupils and a grin, arms held wide, and gear that matches Cool Rider's
// language: tights, gloves, belt, boots, magenta knee pads.
//
// What the first pass got wrong, so it stays wrong exactly once:
//
//   - **The waist was at hip height** (y 0.070 over a 0.50 m torso), which is
//     where a man's belt sits. A feminine waist is high — y 0.212 here — and
//     the hem kicks out from it, so the figure is an hourglass rather than a
//     cone standing on two sticks.
//   - **The shoulders were fixed by making them wider** — a squared yoke 1.13×
//     the rig's shoulder width, which closed the join and built a linebacker.
//     The join is now covered by a **cap sleeve wrapped around the arm
//     itself**: it hangs from the shoulder joint and stays centred on the arm,
//     while hidden upper-bodice rings overlap its inboard edge. The visible
//     bodice remains narrower than the puffed shoulders — the silhouette
//     difference between her and him up top.
//   - **The skirt was sized to contain the legs**, and lost anyway: a hem
//     140 mm below the hip needs to clear a thigh that IK folds nearly
//     horizontal in a carve-plus-crouch, and no hem that big reads as a
//     garment. The hem now sits 62 mm below the hip — high enough that
//     `render/riderClearance.test.ts` can *prove* it clear across the whole
//     stance envelope — and everything below it is tights-on-tights, where a
//     graze has nothing to show.

const TROLLINA_HALF_WIDTH = 0.86 * TORSO_HALF_WIDTH;
const TROLLINA_HALF_DEPTH = 0.84 * TORSO_HALF_DEPTH;

/**
 * The dress: a skater skirt kicked out from a cinched high waist, and a fitted
 * bodice that stays narrower than the shoulders.
 *
 * **The hem is at -0.062, and that number is the carve-clip fix.** The first
 * build's hem sat at -0.140, where a thigh the IK has folded through a
 * carve-plus-crouch swings 0.17 m forward of the hip — no wearable hem clears
 * that. At -0.062 the same stance moves the thigh 0.077 m at hem height, and
 * the flare clears it with margin to spare; `render/riderClearance.test.ts`
 * drives the real rig through the whole reachable envelope and measures
 * exactly this. The hem is also swept forward (`z`), because a rider's skirt
 * drapes over working thighs — the clearance is all needed at the front, and a
 * hem that balloons backward reads as a lampshade.
 *
 * **The waist is at 0.212, not 0.070.** High, cinched to 0.74 of her
 * half-width against hips at 1.22 under the skirt — the hourglass is the
 * silhouette fix, and it is most of what "more female" means at thirty metres.
 * A bust ring at 0.330 leads the profile forward; kept subtle, because this is
 * a cartoon and not a pin-up.
 *
 * **The visible bodice is narrower than the shoulder joints again**, which the
 * yoke build was not. Hidden upper rings reach under the cap sleeves without
 * becoming the silhouette, and the neckline still tapers into the neck the
 * way a halter does.
 */
const DRESS = loftProfile([
  { y: -0.062, halfWidth: 1.84 * TROLLINA_HALF_WIDTH, halfDepth: 1.76 * TROLLINA_HALF_DEPTH, square: 2.4, z: 0.036 },
  // The hem lip: two close rings, so the skirt ends at an edge rather than
  // a taper — the same trick Cool Rider's jacket hem records.
  { y: -0.046, halfWidth: 1.80 * TROLLINA_HALF_WIDTH, halfDepth: 1.72 * TROLLINA_HALF_DEPTH, square: 2.4, z: 0.033 },
  { y: 0.008, halfWidth: 1.42 * TROLLINA_HALF_WIDTH, halfDepth: 1.34 * TROLLINA_HALF_DEPTH, square: 2.35, z: 0.024 },
  { y: 0.092, halfWidth: 1.08 * TROLLINA_HALF_WIDTH, halfDepth: 1.10 * TROLLINA_HALF_DEPTH, square: 2.3, z: 0.010 },
  { y: 0.166, halfWidth: 0.83 * TROLLINA_HALF_WIDTH, halfDepth: 0.88 * TROLLINA_HALF_DEPTH, square: 2.25 },
  // The waist. The belt patch sits on this ring.
  { y: 0.212, halfWidth: 0.74 * TROLLINA_HALF_WIDTH, halfDepth: 0.84 * TROLLINA_HALF_DEPTH, square: 2.2 },
  { y: 0.268, halfWidth: 0.82 * TROLLINA_HALF_WIDTH, halfDepth: 0.92 * TROLLINA_HALF_DEPTH, square: 2.2 },
  // The bust, leading the profile forward. One ring, small, deliberate.
  { y: 0.330, halfWidth: 0.93 * TROLLINA_HALF_WIDTH, halfDepth: 1.10 * TROLLINA_HALF_DEPTH, square: 2.1, z: 0.013 },
  { y: 0.392, halfWidth: 0.94 * TROLLINA_HALF_WIDTH, halfDepth: 1.00 * TROLLINA_HALF_DEPTH, square: 2.2, z: 0.009 },
  // The underarm — the widest the bodice gets, and still 44 mm inside the
  // shoulder joint. The armhole daylight above this ring is real: that is what
  // a sleeveless garment looks like beside an arm, and the cap sleeve is what
  // closes the join at the joint itself.
  { y: 0.438, halfWidth: 0.90 * TROLLINA_HALF_WIDTH, halfDepth: 0.90 * TROLLINA_HALF_DEPTH, square: 2.3, z: 0.004 },
  { y: 0.472, halfWidth: 0.78 * TROLLINA_HALF_WIDTH, halfDepth: 0.80 * TROLLINA_HALF_DEPTH, square: 2.3 },
  // Hidden shoulder fabric reaches under the cap sleeve. This does not alter
  // the outer silhouette — the puff is wider — but it removes the daylight
  // while leaving the arm centred in its sleeve opening.
  { y: 0.498, halfWidth: 0.78 * TROLLINA_HALF_WIDTH, halfDepth: 0.72 * TROLLINA_HALF_DEPTH, square: 2.2 },
  { y: 0.522, halfWidth: 0.68 * TROLLINA_HALF_WIDTH, halfDepth: 0.58 * TROLLINA_HALF_DEPTH, square: 2.2 },
  // The halter neckline: the top ring is narrower than the neck at this
  // height, so the garment tucks inside it and seals.
  { y: 0.540, halfWidth: 0.34 * TROLLINA_HALF_WIDTH, halfDepth: 0.36 * TROLLINA_HALF_DEPTH, square: 2.2 },
]);

/**
 * Hip shorts, and from this pass they are **tights, not underskirt**: the seat
 * is its own mesh in the gear material at the same shade as the legs
 * (`parts.seat`), so everything below the pink hem — shorts, thighs, shins —
 * is one continuous dark garment.
 *
 * That continuity is doing structural work, not styling. The thighs *do* pass
 * through this surface in deep stances (a folded thigh leaves any pelvis-fixed
 * volume — that is geometry, not a bug to fix), and same-material-same-shade is
 * what makes the crossing invisible: no colour change, no value change, no
 * silhouette break. The first build had plum shorts inside a pink dress over
 * bare skin, which turned the identical geometry into a visible wound.
 *
 * Wider at the hip than the waist ring above it, because the hourglass has to
 * survive the skirt being seen from below.
 */
const TROLLINA_SEAT = loftProfile([
  { y: -0.098, halfWidth: 1.18 * TROLLINA_HALF_WIDTH, halfDepth: 1.00 * TROLLINA_HALF_DEPTH, square: 2.6 },
  { y: -0.050, halfWidth: 1.22 * TROLLINA_HALF_WIDTH, halfDepth: 1.04 * TROLLINA_HALF_DEPTH, square: 2.6 },
  { y: 0.008, halfWidth: 1.16 * TROLLINA_HALF_WIDTH, halfDepth: 1.00 * TROLLINA_HALF_DEPTH, square: 2.5 },
  { y: 0.060, halfWidth: 1.00 * TROLLINA_HALF_WIDTH, halfDepth: 0.90 * TROLLINA_HALF_DEPTH, square: 2.4 },
]);

/**
 * Legs in tights: slim, seamless, and painted in the gear material
 * (`parts.legs`) — interpretation A's black leggings, which are also what makes
 * the knee pads read as gear on a garment rather than plates on skin.
 *
 * The lengths are `RIDER_BLOCKOUT`'s, unchanged and non-negotiable (rule 1).
 */
const TROLLINA_THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.070, 0.062, 0.052], [], {
  flatten: 0.96,
  square: 2.2,
});
const TROLLINA_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.054, 0.048, 0.039], [], {
  flatten: 0.95,
  square: 2.2,
});
/**
 * Bare arms, and they are *slim* again.
 *
 * The first pass grew the top ring to 0.050 — sleeve-of-padded-jacket
 * territory — because the arm itself was the only thing available to fill the
 * shoulder join, and the owner's "make her more female" is partly these
 * mannequin arms. The cap sleeve owns the join now, so the arm can be an arm.
 */
const TROLLINA_UPPER_ARM = limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.044, 0.037, 0.032], [], {
  flatten: 0.96,
  square: 2.1,
});
const TROLLINA_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.034, 0.030, 0.027], [], {
  flatten: 0.96,
  square: 2.1,
});

/**
 * The puff cap sleeve, in the arm's own frame — `y = 0` is the shoulder joint
 * and the arm hangs down `-y`, so this stays centred through every pose the IK
 * reaches. See `RiderLook.profiles.sleeve` for why it is
 * a loft and not a patch. The top ring closes over the joint, the bottom cap
 * becomes the hem lining around the arm, and its inner side buries itself in
 * the bodice's hidden shoulder fabric. The sleeve stays centred on the arm;
 * moving it inward closes one seam by making the arm emerge from an edge,
 * which is visibly worse in the chase view.
 */
const TROLLINA_SLEEVE = loftProfile([
  { y: -0.100, halfWidth: 0.047, halfDepth: 0.044, square: 2.3 },
  { y: -0.085, halfWidth: 0.064, halfDepth: 0.054, square: 2.4 },
  { y: -0.050, halfWidth: 0.075, halfDepth: 0.060, square: 2.4 },
  { y: -0.008, halfWidth: 0.082, halfDepth: 0.061, square: 2.3 },
  { y: 0.022, halfWidth: 0.045, halfDepth: 0.032, square: 2.2 },
]);

/**
 * A bare hand, and it is not Cool Rider's glove scaled down.
 *
 * A glove has a cuff — a ring wider than the wrist it slides over — and that
 * cuff is exactly what makes a bare hand read as detached: the first ring came
 * out 12 mm proud of a 30 mm wrist, so the hand met the arm as a step and the
 * front capture showed two blobs floating at the ends of two tubes. This one
 * starts *narrower* than the wrist and widens into the palm, which is the shape
 * a wrist actually is.
 */
const TROLLINA_HAND = loftProfile([
  { y: 0, halfWidth: 0.028, halfDepth: 0.026, square: 2.4 },
  { y: -0.020, halfWidth: 0.034, halfDepth: 0.030, square: 2.7 },
  { y: -0.048, halfWidth: 0.036, halfDepth: 0.031, square: 2.8 },
  { y: -0.078, halfWidth: 0.033, halfDepth: 0.028, square: 2.8 },
  { y: -0.094, halfWidth: 0.020, halfDepth: 0.017, square: 2.6 },
  { y: -0.101, halfWidth: 0, halfDepth: 0 },
]);

/** A bare neck: the same joint, thinner, and with no collar to disappear into. */
const TROLLINA_NECK = loftProfile([
  { y: -0.040, halfWidth: 0.050, halfDepth: 0.049, square: 2.3 },
  { y: 0.010, halfWidth: 0.044, halfDepth: 0.043, square: 2.2 },
  { y: 0.060, halfWidth: 0.041, halfDepth: 0.040, square: 2.2 },
  { y: 0.098, halfWidth: 0.043, halfDepth: 0.042, square: 2.2 },
]);

/**
 * A head, not a helmet. `y = 0` is the neck joint.
 *
 * Smaller than the helmet it replaces — a bare head is, and the difference is
 * most of what makes her read as a *cartoon* rather than as Cool Rider in a
 * wig — with a jaw that narrows toward the chin and a cranium that does not.
 * The crown is deliberately a little flat: the hair sits on it, and a domed
 * crown pushes every spike outward into a halo.
 */
const TROLLINA_HEAD = loftProfile([
  { y: 0.090, halfWidth: 0.046, halfDepth: 0.050, square: 2.3, z: 0.008 },
  { y: 0.116, halfWidth: 0.070, halfDepth: 0.076, square: 2.4, z: 0.010 },
  { y: 0.152, halfWidth: 0.087, halfDepth: 0.094, square: 2.4, z: 0.008 },
  { y: 0.200, halfWidth: 0.094, halfDepth: 0.100, square: 2.4, z: 0.003 },
  { y: 0.246, halfWidth: 0.090, halfDepth: 0.095, square: 2.3 },
  { y: 0.284, halfWidth: 0.072, halfDepth: 0.076, square: 2.2 },
  { y: 0.306, halfWidth: 0.034, halfDepth: 0.036, square: 2.2 },
  { y: 0.316, halfWidth: 0, halfDepth: 0 },
]);

/**
 * One hair spike, as a four-ring taper, built lying along +Y and then aimed.
 *
 * Thin, long, and slightly kinked. The kink is what stops the crown reading as
 * a sea urchin: a straight cone is a spine and a bent one is a *hair*, and the
 * doodle's hair is scribble rather than spikes.
 */
function hairSpike(length: number, thickness: number): THREE.BufferGeometry {
  const profile = loftProfile([
    { y: 0, halfWidth: thickness, halfDepth: thickness * 0.86, square: 2.2 },
    { y: length * 0.34, halfWidth: thickness * 0.74, halfDepth: thickness * 0.64, square: 2.2, z: length * 0.12 },
    { y: length * 0.72, halfWidth: thickness * 0.40, halfDepth: thickness * 0.34, square: 2.1, z: length * 0.07 },
    { y: length, halfWidth: 0, halfDepth: 0 },
  ]);
  return loftGeometry(profile, { radialSegments: 5 });
}

/**
 * The mass the spikes come out of.
 *
 * The first pass pushed the whole mane 35 mm aft to keep the face clear, and
 * the front capture showed the cost: from ahead she read as nearly bald with
 * two horns. The mane is now **wide and shallow** instead of pushed back — an
 * ellipse 0.132 across but only 0.104 deep, still centred aft — so it stands
 * proud of the head at the *sides*, framing the face the way both reference
 * interpretations draw it, while its front edge stays behind the eyes.
 */
const TROLLINA_MANE = loftProfile([
  { y: 0.105, halfWidth: 0.078, halfDepth: 0.062, square: 2.3, z: -0.038 },
  { y: 0.158, halfWidth: 0.126, halfDepth: 0.094, square: 2.4, z: -0.033 },
  { y: 0.205, halfWidth: 0.142, halfDepth: 0.105, square: 2.4, z: -0.030 },
  { y: 0.252, halfWidth: 0.142, halfDepth: 0.108, square: 2.4, z: -0.024 },
  { y: 0.300, halfWidth: 0.120, halfDepth: 0.100, square: 2.3, z: -0.014 },
  { y: 0.338, halfWidth: 0.082, halfDepth: 0.078, square: 2.2, z: -0.004 },
  { y: 0.366, halfWidth: 0.036, halfDepth: 0.036, square: 2.2, z: 0.002 },
  { y: 0.378, halfWidth: 0, halfDepth: 0 },
]);

/**
 * The fringe: a second small loft over the front of the crown, because the
 * mane cannot both wrap the forehead and stay off the eyes — an ellipse has one
 * front edge. This one starts *above* the brows and leans forward over the
 * forehead, which is the single change that puts hair in the front view.
 */
const TROLLINA_FRINGE = loftProfile([
  { y: 0.252, halfWidth: 0.086, halfDepth: 0.052, square: 2.4, z: 0.052 },
  { y: 0.290, halfWidth: 0.104, halfDepth: 0.064, square: 2.4, z: 0.046 },
  { y: 0.330, halfWidth: 0.096, halfDepth: 0.060, square: 2.3, z: 0.032 },
  { y: 0.360, halfWidth: 0.052, halfDepth: 0.040, square: 2.2, z: 0.012 },
  { y: 0.375, halfWidth: 0, halfDepth: 0 },
]);

/**
 * The hair: a mane, a fringe, 48 spikes and 8 long strands off one seeded
 * scatter, merged into a single buffer.
 *
 * **One mesh, and that is a budget decision rather than a tidiness one.** A
 * casting rider mesh costs three draw calls out of a frame that has six spare;
 * fifty-six of them would cost over a hundred and fifty. Merged, the entire
 * head of hair is one draw call in the colour pass, one in the shadow pass,
 * and one on the ghost — the same three the helmet it replaces already spent.
 *
 * The scatter is seeded rather than random for the reason everything else in
 * this project is seeded: an asset that differs from the one that was reviewed
 * is an asset nobody reviewed. The spikes are biased backward — that keeps
 * them out of the face without a rejection test, and puts hair where the chase
 * camera is — and the strands hang down-and-back below them, which is the
 * "wild long hair" half of the reference that the first pass had nothing of.
 */
function trollinaHair(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    loftGeometry(TROLLINA_MANE, { radialSegments: 16 }),
    loftGeometry(TROLLINA_FRINGE, { radialSegments: 12 }),
  ];
  // Mulberry32, inlined. Deterministic, and cheap enough to run at build time.
  let seed = 0x7d0011a;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const up = new THREE.Vector3(0, 1, 0);

  const centre = new THREE.Vector3(0, 0.255, -0.020);
  const radius = 0.105;
  for (let i = 0; i < 36; i += 1) {
    // Spread around the head, jittered off the even ring so no two neighbours
    // are the same distance apart — an even fan reads as a cog.
    const around = ((i + 0.5) / 36 + 0.09 * (random() - 0.5)) * Math.PI * 2;
    // Elevation from below the ears to straight up, weighted upward.
    const climb = -0.12 + 1.12 * random() ** 0.6;
    const lift = Math.sin(climb * Math.PI * 0.5);
    const out = Math.cos(climb * Math.PI * 0.5);

    const direction = new THREE.Vector3(
      Math.sin(around) * out,
      lift,
      Math.cos(around) * out - 0.18,
    ).normalize();

    const length = 0.13 + 0.18 * random();
    const spike = hairSpike(length, 0.013 + 0.010 * random());
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
    // Rooted inside the mane, so no spike floats off the head and every one of
    // them has its wide end buried where nobody can see the join.
    spike.translate(
      centre.x + direction.x * radius * 0.78,
      centre.y + direction.y * radius * 0.78,
      centre.z + direction.z * radius * 0.78,
    );
    parts.push(spike);
  }

  // A second, back-weighted round of spikes. The even scatter above leaves
  // the upper back of the crown smooth — high-climb spikes crowd the top pole
  // and the ring crowds the sides — and the chase camera stares at exactly
  // that patch all day; the first capture set showed it as a swim cap.
  for (let i = 0; i < 12; i += 1) {
    const around = Math.PI + (((i + 0.5) / 12) - 0.5) * 2.4 + 0.12 * (random() - 0.5);
    const climb = 0.18 + 0.5 * random();
    const lift = Math.sin(climb * Math.PI * 0.5);
    const out = Math.cos(climb * Math.PI * 0.5);
    const direction = new THREE.Vector3(
      Math.sin(around) * out,
      lift,
      Math.cos(around) * out - 0.30,
    ).normalize();
    const spike = hairSpike(0.12 + 0.14 * random(), 0.013 + 0.009 * random());
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
    spike.translate(
      centre.x + direction.x * radius * 0.78,
      centre.y + direction.y * radius * 0.78,
      centre.z + direction.z * radius * 0.78,
    );
    parts.push(spike);
  }

  // The strands: longer, thicker, and aimed down the back and sides from a
  // lower root, so the hair falls past the neck instead of ending at the
  // skull. These are what stop the mane reading as a helmet of spikes.
  const nape = new THREE.Vector3(0, 0.205, -0.045);
  for (let i = 0; i < 8; i += 1) {
    const around = Math.PI + (((i + 0.5) / 8) - 0.5) * 2.6 + 0.15 * (random() - 0.5);
    const droop = -(0.18 + 0.5 * random());
    const direction = new THREE.Vector3(
      Math.sin(around) * 0.85,
      droop,
      Math.cos(around) * 0.85 - 0.30,
    ).normalize();
    const strand = hairSpike(0.20 + 0.10 * random(), 0.016 + 0.008 * random());
    strand.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
    strand.translate(
      nape.x + direction.x * 0.070,
      nape.y + direction.y * 0.070,
      nape.z + direction.z * 0.070,
    );
    parts.push(strand);
  }
  return mergeGeometries(parts);
}

/**
 * The face: two sclerae, two pupils, two brows and an open grin, merged into
 * one buffer and painted in the one `face` material.
 *
 * **Two tones out of one material is the vertex-shade trick**, and it is what
 * the first pass missed: its eyes were single dark beads, which read as two
 * dots at distance and as holes up close, and it had no mouth and no brows at
 * all — a mannequin. The `face` material is now the warm white of a sclera,
 * the sclera geometry carries shade 1, and the pupils, brows and mouth carry
 * shades near zero — dark features and bright whites from one draw call.
 *
 * All lofts, no patches, for the recorded reason: `patchGeometry`'s taper is
 * linear, so its outline has six corners at any segment count, and anything on
 * a face that needs a round outline is a loft. Each piece is an ellipsoid
 * squashed front-to-back and sunk so only its front cap stands proud; the
 * pupils stand proud of the *sclerae*, which is what makes the eyes look
 * somewhere rather than at nothing.
 */
function trollinaFaceParts(): THREE.BufferGeometry {
  const ball = (halfWidth: number): LoftProfile => loftProfile([
    { y: -halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
    { y: -halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
    { y: -halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
    { y: halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
    { y: halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
    { y: halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
  ]);

  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // The sclera: big — the eyes are half the face, per both interpretations —
    // flattened so it lies on the head, back half buried.
    const sclera = loftGeometry(ball(0.026), { radialSegments: 12 });
    sclera.scale(1, 1.06, 0.40);
    sclera.translate(side * 0.041, 0.206, 0.089);
    parts.push(sclera);

    // The pupil: proud of the sclera's front cap, very dark, and inboard a
    // touch so she looks ahead rather than walleyed.
    const pupil = loftGeometry(ball(0.0115), { radialSegments: 10, shade: 0.05 });
    pupil.scale(1, 1.1, 0.5);
    pupil.translate(side * 0.037, 0.204, 0.0995);
    parts.push(pupil);

    // A brow: a thin tapered stick, arched well up-and-outward. Cartoon
    // grammar — lifted brows plus a grin is "delighted", which is the
    // doodle's whole expression; the first cut was thicker and flatter and
    // the front capture read it as a scowl.
    const brow = hairSpike(0.040, 0.0046);
    brow.scale(1, 1, 0.5);
    brow.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(side * 0.90, 0.44, 0).normalize(),
    ));
    brow.translate(side * 0.020, 0.2415, 0.0935);
    // Repaint the brow dark: hairSpike writes shade 1.
    const colours = brow.getAttribute('color');
    for (let i = 0; i < colours.count; i += 1) colours.setXYZ(i, 0.06, 0.06, 0.06);
    parts.push(brow);
  }

  // The grin: one wide flattened ellipsoid, mostly sunk, dark. Open-mouthed
  // delight is the one feature every version of the drawing agrees on — the
  // first cut was nearly round and read as a startled "o".
  const mouth = loftGeometry(ball(0.019), { radialSegments: 12, shade: 0.1 });
  mouth.scale(1.9, 0.8, 0.5);
  mouth.translate(0, 0.151, 0.093);
  parts.push(mouth);

  return mergeGeometries(parts);
}

const TROLLINA_SKIN: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.trollinaSkin,
  roughness: 0.74,
  metalness: 0.0,
});

const TROLLINA_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.trollinaGear,
  roughness: 0.68,
  metalness: 0.0,
});

export const TROLLINA_LOOK: RiderLook = Object.freeze({
  id: 'trollina' as CharacterId,
  materials: Object.freeze({
    body: Object.freeze({
      colour: BLOCKOUT_COLOURS.trollinaDress,
      roughness: 0.66,
      metalness: 0.0,
      // A whisper of emissive, and it is doing the same job the blue does for
      // Cool Rider: hot magenta in shadow is brown, and a character whose
      // identity colour disappears under a tree is a character with no identity
      // colour. Half his level — his is a retroreflective panel and hers is
      // cloth.
      emissive: 0x3a0a26,
      emissiveIntensity: 0.28,
    }),
    limbs: TROLLINA_SKIN,
    // The hair, and the knee pads with it: one step brighter than the dress
    // and rougher than his panel, because it is scribble, not trim.
    accent: Object.freeze({
      colour: BLOCKOUT_COLOURS.trollinaHair,
      roughness: 0.52,
      metalness: 0.0,
      emissive: 0x4a0f30,
      emissiveIntensity: 0.30,
    }),
    // Her head is her face, so the head material is skin.
    head: TROLLINA_SKIN,
    // The whites of her eyes — see `trollinaFaceParts` for how one material
    // carries sclera, pupil, brow and mouth. Kept a little glossy so the sun
    // puts a glint on the pupil, which is the cartoon version of being alive;
    // full visor gloss on a white reads as chrome.
    face: Object.freeze({
      colour: BLOCKOUT_COLOURS.trollinaFace,
      roughness: 0.24,
      metalness: 0.06,
    }),
    gear: TROLLINA_GEAR,
  }),
  profiles: Object.freeze({
    torso: DRESS,
    seat: TROLLINA_SEAT,
    thigh: TROLLINA_THIGH,
    shin: TROLLINA_SHIN,
    upperArm: TROLLINA_UPPER_ARM,
    forearm: TROLLINA_FOREARM,
    neck: TROLLINA_NECK,
    head: TROLLINA_HEAD,
    // Chunky black boots, unchanged: she is on a wheel, the reference draws
    // them, and the sole's rounded outline is a property `riderEuc.test.ts`
    // checks for the stopped stance and both riders want.
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: TROLLINA_HAND,
    sleeve: TROLLINA_SLEEVE,
  }),
  // Tights and shorts one step *lighter* than the boots inside the same gear
  // material, so the leg reads as knit over the boot's shell — and so the two
  // halves of the tights (seat mesh and leg meshes) sit at the same value,
  // which is the invisibility the clip fix depends on.
  shades: Object.freeze({ seat: 1.12, legs: 1.12, collar: 1, sole: 0.74, neck: 1 }),
  parts: Object.freeze({
    // Fingerless gloves: the bare-hand profile painted as gear, which is all a
    // glove is at this scale — and interpretation A draws exactly that.
    hands: 'gear' as RiderMaterialRole,
    kneePad: 'accent' as RiderMaterialRole,
    // The tights, and the reason they exist is structural — see the interface.
    legs: 'gear' as RiderMaterialRole,
    seat: 'gear' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    // No collar: the dress ends in a neckline, and a raised band there would be
    // a polo shirt.
    //
    // **No scribble panels either, and that is this pass unlearning its own
    // cleverness.** The first build carried three accent patches trying to be
    // the reference's tangled line, and together they read as smears — "jank"
    // covers them fairly. Interpretation A's dress is plain, fitted, and
    // belted, and that is what survives here: the scribble lives in the hair,
    // where it is real geometry with a real outline, and nowhere else.
    //
    // The belt: a full wrap at the waist ring, in gear black — interpretation
    // A draws one, and it is the single cheapest "this is an outfit, not a
    // pink volume" cue there is. The seam lands at the back, under the hair.
    waist: Object.freeze({
      role: 'gear' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: 0,
        u1: Math.PI * 2,
        from: 0.192,
        to: 0.230,
        uSegments: 22,
        vSegments: 1,
        lift: 0.006,
        sink: -0.006,
      })]),
    }),
    // The cap sleeves are `profiles.sleeve` — whole lofts riding the shoulder
    // joints and centred on the arms. Hidden bodice rings provide the separate
    // body overlap; `riderLook.test.ts` pins both halves.
    //
    // Attempt one authored the bodice against her own narrowed width and left
    // 30 mm of daylight at each shoulder. Attempt two closed the gap with a
    // squared yoke wider than the joint, which connected the arm and built a
    // linebacker. Attempt three centred a sleeve on the arm but left daylight
    // to the bodice; shifting it inward closed that seam and put the arm at the
    // sleeve's edge. The final version keeps the sleeve centred and overlaps it
    // with hidden shoulder fabric, so the visible bodice stays narrower than
    // the puffed shoulders while the dress appears to continue over them.
    //
    // (A patch-band sleeve was tried first and failed on camera: a band around
    // the top of an arm has open rims, and both showed as floating cuffs.)
    //
    // No elbow pads: bare arms keep her a mesh under Cool Rider, which is
    // what pays for the seat being its own mesh.
    kneePad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.78,
        u1: 0.78,
        from: -0.086,
        to: -0.010,
        uSegments: 6,
        vSegments: 3,
        // Proud of the shin, and magenta on black tights — both references
        // draw the pads popping against the leg, and gear-on-gear vanished.
        lift: 0.015,
        taper: 0.26,
      })]),
    }),
    // **No patches on the head at all**, which is the whole difference between
    // her and Cool Rider up here: his head is a helmet and every feature on it
    // is a moulding, and hers is a face with hair in front of it. The first
    // build carried a fringe patch to stop the skull reading bald; the mane in
    // `trollinaHair` does that job in three dimensions, and the patch was
    // buried underneath it.
    head: Object.freeze([]),
  }),
  extras: Object.freeze([
    Object.freeze({
      name: 'rider-hair',
      joint: 'neck' as const,
      role: 'accent' as RiderMaterialRole,
      // The one mesh she adds that Cool Rider has no slot for, and the one that
      // has to cast: the hair *is* the silhouette, and a Trollina ghost with a
      // bald head would be a different character.
      casts: true,
      build: trollinaHair,
    }),
    Object.freeze({
      name: 'rider-face',
      joint: 'neck' as const,
      role: 'face' as RiderMaterialRole,
      // Flat against the head and carrying no outline of its own — the same
      // judgement Cool Rider's visor makes, and the reason neither shows up on
      // a ghost.
      casts: false,
      build: trollinaFaceParts,
    }),
  ]),
  // Arms wide and a little high — the pose the original drawing is in, and the
  // thing that reads as "her" from behind before any colour arrives. Every
  // stance reaction is an offset from this, so a carve still tucks the inside
  // arm and a tuck still draws both back; they simply do it from further out.
  //
  // **The numbers are bounded by reach, not by taste.** The arm is 0.54 m and
  // Cool Rider's relaxed hand already sits 0.529 m from his shoulder — five
  // millimetres of slack. Pushed straight outward hers would pass full
  // extension, and past that the IK stops solving a bend and just points the
  // limb, so every arm reaction downstream would quietly stop moving anything.
  // Out *and up* shortens the diagonal instead: 0.486 m, which leaves 54 mm for
  // the carve, air, wobble and crash splays to spend on top.
  armCarriage: Object.freeze({ splay: 0.16, rise: 0.12 }),
});

// -- Officer Dorkins ---------------------------------------------------------
//
// M18's cop, and the first look that is **not** a character the player may be.
// He is built from Cool Rider's own profiles rather than new ones, and that is
// the file's rule 1 doing exactly what it was written for: one skeleton, one
// stance solve, one set of cross-sections, and a different person out of
// nothing but materials, shades and panels. The differences that matter at
// chase distance are the yellow yoke, the chequer band, the white lid and the
// bare legs.
//
// **He is also the cheapest look in the file, and that is a budget rather than
// a taste.** `render/copRider.ts` explains the arithmetic; what it means here
// is that he carries no elbow pads, no sleeve panels and no separate seat mesh,
// because a second rider in the frame has about a third of a rider's worth of
// draw calls to spend and every panel group is one of them.

/** A stockier polo silhouette than Cool Rider's tapered armoured jacket. */
const COP_TORSO = loftProfile([
  { y: -0.010, halfWidth: 1.08 * TORSO_HALF_WIDTH, halfDepth: 1.05 * TORSO_HALF_DEPTH, square: 2.9 },
  { y: 0.035, halfWidth: 1.03 * TORSO_HALF_WIDTH, halfDepth: 1.02 * TORSO_HALF_DEPTH, square: 2.9 },
  { y: 0.145, halfWidth: 0.98 * TORSO_HALF_WIDTH, halfDepth: 1.00 * TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.285, halfWidth: 1.04 * TORSO_HALF_WIDTH, halfDepth: 1.06 * TORSO_HALF_DEPTH, square: 2.8, z: 0.010 },
  { y: 0.405, halfWidth: 1.10 * TORSO_HALF_WIDTH, halfDepth: 1.04 * TORSO_HALF_DEPTH, square: 3.0, z: 0.006 },
  { y: 0.485, halfWidth: 1.04 * TORSO_HALF_WIDTH, halfDepth: 0.94 * TORSO_HALF_DEPTH, square: 3.0 },
  { y: 0.525, halfWidth: 0.83 * TORSO_HALF_WIDTH, halfDepth: 0.76 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: 0.548, halfWidth: 0.48 * TORSO_HALF_WIDTH, halfDepth: 0.52 * TORSO_HALF_DEPTH, square: 2.4 },
]);

/**
 * His legs, and the seam fractions are paint boundaries rather than moto
 * quilting: 0.52 is the cargo shorts' hem and 0.80 the knee pad's top edge,
 * so each colour change in `paintCopThigh` lands on a ring pair and reads as a
 * garment edge instead of smearing across a ring gap. The knee end is thicker
 * than the first pass because there is a pad over it now.
 */
const COP_THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.086, 0.078, 0.068], [0.52, 0.80], {
  flatten: 0.95,
  square: 2.5,
});
/** Seams at the pad's lower edge (0.30) and the sock's top and ring (0.58, 0.655). */
const COP_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.075, 0.063, 0.048], [0.30, 0.58, 0.655], {
  flatten: 0.93,
  square: 2.4,
});
const COP_UPPER_ARM = limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.066, 0.057, 0.045], [0.55], {
  flatten: 0.96,
  square: 2.4,
});
const COP_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.053, 0.046, 0.035], [0.45], {
  flatten: 0.95,
  square: 2.3,
});

/** The skin head under the open helmet: cheeks and jaw, not a painted shell. */
const COP_HEAD = loftProfile([
  { y: 0.088, halfWidth: 0.050, halfDepth: 0.055, square: 2.4, z: 0.010 },
  { y: 0.116, halfWidth: 0.077, halfDepth: 0.083, square: 2.5, z: 0.012 },
  { y: 0.158, halfWidth: 0.101, halfDepth: 0.108, square: 2.5, z: 0.010 },
  { y: 0.207, halfWidth: 0.108, halfDepth: 0.114, square: 2.5, z: 0.004 },
  { y: 0.253, halfWidth: 0.103, halfDepth: 0.108, square: 2.4 },
  { y: 0.291, halfWidth: 0.085, halfDepth: 0.089, square: 2.3 },
  { y: 0.316, halfWidth: 0.045, halfDepth: 0.047, square: 2.2 },
  { y: 0.326, halfWidth: 0, halfDepth: 0 },
]);

/**
 * The white bicycle helmet crown. Its lower edge leaves the whole face open.
 *
 * The crown leans *backward* as it rises — each ring's `z` walks negative —
 * because that sweep is what separates a cycling helmet from a bowl: wide and
 * forward at the brow, tapering aft, which is the reference's aerodynamic
 * read and the second pass's answer to "a miner's hard hat".
 */
const COP_HELMET = loftProfile([
  { y: 0.202, halfWidth: 0.112, halfDepth: 0.128, square: 2.5, z: 0.002 },
  { y: 0.214, halfWidth: 0.130, halfDepth: 0.148, square: 2.7, z: 0.006 },
  { y: 0.248, halfWidth: 0.126, halfDepth: 0.144, square: 2.5, z: 0.000 },
  { y: 0.302, halfWidth: 0.115, halfDepth: 0.128, square: 2.4, z: -0.010 },
  { y: 0.346, halfWidth: 0.086, halfDepth: 0.098, square: 2.3, z: -0.020 },
  { y: 0.374, halfWidth: 0.042, halfDepth: 0.048, square: 2.2, z: -0.028 },
  { y: 0.384, halfWidth: 0, halfDepth: 0, z: -0.030 },
]);

/**
 * `Tint` and `tintOver` live in `render/blockoutKit.ts` from M22 — the machine
 * axis needed the same colour arithmetic, and a `render/machineLook.ts` that
 * imported this file to get it would be a machine depending on the riders. Both
 * names are re-exported here because every caller in the tree learned them at
 * this address.
 */
export { tintOver, type Tint };

/** Repaint one built part a single tint, in place, and hand it back. */
function tinted(geometry: THREE.BufferGeometry, tint: Tint): THREE.BufferGeometry {
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < colour.count; i += 1) colour.setXYZ(i, tint[0], tint[1], tint[2]);
  return geometry;
}

/**
 * Repaint every vertex whose height lands in a band. First matching band wins;
 * heights between bands keep the mesh's authored shade, which is how the bare
 * skin between the shorts and the knee pad costs nothing to state.
 */
function paintBands(
  geometry: THREE.BufferGeometry,
  bands: readonly { readonly top: number; readonly bottom: number; readonly tint: Tint }[],
): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    for (const band of bands) {
      if (y > band.top || y < band.bottom) continue;
      colour.setXYZ(i, band.tint[0], band.tint[1], band.tint[2]);
      break;
    }
  }
}

/**
 * His face, one skin mesh: the head, clear glasses with eyes behind them, a
 * brown moustache over a visible smirk, a nose, ears, and the helmet's chin
 * straps.
 *
 * The first pass painted features onto a full-face helmet; the second gave him
 * a real head but kept the glasses as one dark slab each side — reviewed
 * against the reference, a blindfold. This pass is the difference between
 * "wearing sunglasses" and "a cheerful man in *glasses*": the lens is pale and
 * a pupil stands proud of it, the moustache is hair-brown rather than
 * near-black, and the mouth under it is what makes him look pleased to be
 * chasing you. Everything is still merged into the one extra colour call the
 * 26-call cop ceiling affords — geometry detail is the cheap axis.
 */
function copFaceParts(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [loftGeometry(COP_HEAD, { radialSegments: 18 })];
  const skin = BLOCKOUT_COLOURS.copSkin;

  for (const side of [-1, 1]) {
    // The frame: a dark rounded rectangle, one size up from the lens in it.
    parts.push(loftGeometry(loftProfile([
      { y: 0.170, halfWidth: 0.022, halfDepth: 0.004, square: 2.8, x: side * 0.043, z: 0.108 },
      { y: 0.180, halfWidth: 0.038, halfDepth: 0.008, square: 3.2, x: side * 0.043, z: 0.112 },
      { y: 0.215, halfWidth: 0.038, halfDepth: 0.008, square: 3.2, x: side * 0.043, z: 0.112 },
      { y: 0.225, halfWidth: 0.022, halfDepth: 0.004, square: 2.8, x: side * 0.043, z: 0.108 },
    ]), { radialSegments: 8, shade: 0.28 }));
    // The lens: pale and slightly cool, proud of the frame — reads as glass
    // catching the sky rather than as a hole in the face.
    parts.push(tinted(loftGeometry(loftProfile([
      { y: 0.177, halfWidth: 0.019, halfDepth: 0.003, square: 2.8, x: side * 0.043, z: 0.1135 },
      { y: 0.186, halfWidth: 0.030, halfDepth: 0.005, square: 3.0, x: side * 0.043, z: 0.116 },
      { y: 0.210, halfWidth: 0.030, halfDepth: 0.005, square: 3.0, x: side * 0.043, z: 0.116 },
      { y: 0.218, halfWidth: 0.019, halfDepth: 0.003, square: 2.8, x: side * 0.043, z: 0.1135 },
    ]), { radialSegments: 8 }), [1.06, 1.24, 1.46]));
    // The pupil, proud of the lens and biased inboard so he looks *at* the
    // road ahead rather than walleyed past it.
    parts.push(loftGeometry(loftProfile([
      { y: 0.190, halfWidth: 0.004, halfDepth: 0.002, square: 2.4, x: side * 0.0385, z: 0.117 },
      { y: 0.198, halfWidth: 0.0085, halfDepth: 0.003, square: 2.6, x: side * 0.0385, z: 0.1185 },
      { y: 0.206, halfWidth: 0.004, halfDepth: 0.002, square: 2.4, x: side * 0.0385, z: 0.117 },
    ]), { radialSegments: 8, shade: 0.10 }));
    // An ear: a small flattened bump standing just proud of the head's side.
    parts.push(loftGeometry(loftProfile([
      { y: 0.166, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: side * 0.096, z: 0.008 },
      { y: 0.186, halfWidth: 0.013, halfDepth: 0.018, square: 2.3, x: side * 0.104, z: 0.010 },
      { y: 0.208, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: side * 0.098, z: 0.008 },
    ]), { radialSegments: 8, shade: 0.96 }));
    // The chin strap: a thin band following the cheek's diagonal from the
    // helmet's rim down to the jaw. What says the helmet is *worn*, not rested.
    parts.push(loftGeometry(loftProfile([
      { y: 0.104, halfWidth: 0.005, halfDepth: 0.011, square: 2.4, x: side * 0.024, z: 0.096 },
      { y: 0.148, halfWidth: 0.005, halfDepth: 0.013, square: 2.4, x: side * 0.062, z: 0.070 },
      { y: 0.198, halfWidth: 0.006, halfDepth: 0.014, square: 2.4, x: side * 0.090, z: 0.024 },
    ]), { radialSegments: 6, shade: 0.22 }));
  }

  // The bridge joining the two frames, in the frame's own dark.
  parts.push(loftGeometry(loftProfile([
    { y: 0.190, halfWidth: 0.014, halfDepth: 0.004, square: 3, z: 0.116 },
    { y: 0.197, halfWidth: 0.026, halfDepth: 0.006, square: 3, z: 0.118 },
    { y: 0.204, halfWidth: 0.014, halfDepth: 0.004, square: 3, z: 0.116 },
  ]), { radialSegments: 6, shade: 0.28 }));

  // The nose: a small skin wedge between the lenses, a touch brighter than the
  // face so it catches the sun. Without one the glasses float on a blank.
  parts.push(loftGeometry(loftProfile([
    { y: 0.148, halfWidth: 0.010, halfDepth: 0.006, square: 2.4, z: 0.106 },
    { y: 0.160, halfWidth: 0.015, halfDepth: 0.009, square: 2.5, z: 0.119 },
    { y: 0.176, halfWidth: 0.011, halfDepth: 0.006, square: 2.4, z: 0.112 },
  ]), { radialSegments: 8, shade: 1.06 }));

  // The moustache: broad, two-lobed, and *brown* — the reference's is hair,
  // and the near-black first cut read as a letterbox slot at chase distance.
  parts.push(tinted(loftGeometry(loftProfile([
    { y: 0.126, halfWidth: 0.030, halfDepth: 0.006, square: 2.8, z: 0.112 },
    { y: 0.138, halfWidth: 0.066, halfDepth: 0.013, square: 3.4, z: 0.118 },
    { y: 0.150, halfWidth: 0.056, halfDepth: 0.011, square: 3.2, z: 0.117 },
    { y: 0.160, halfWidth: 0.022, halfDepth: 0.005, square: 2.8, z: 0.111 },
  ]), { radialSegments: 10 }), tintOver(skin, 0x54371c)));

  // The smirk peeking out under it: proud, confident, a little dorky — the
  // reference's whole expression, and the one feature no pass before this had.
  // Kept small and dark: the first size read as a startled shout, which is
  // exactly the wrong man.
  parts.push(tinted(loftGeometry(loftProfile([
    { y: 0.106, halfWidth: 0.009, halfDepth: 0.003, square: 2.6, z: 0.106 },
    { y: 0.112, halfWidth: 0.017, halfDepth: 0.005, square: 2.8, z: 0.110 },
    { y: 0.119, halfWidth: 0.013, halfDepth: 0.004, square: 2.6, z: 0.108 },
  ]), { radialSegments: 8 }), tintOver(skin, 0x552018)));

  // The nape: a crescent of trimmed brown hair hugging the back of the skull.
  // The leaned-back helmet leaves the occiput open, and bare skin there read
  // as a bald man wearing a bowl — the reference's Dorkins has hair under his
  // lid, and this is the eight-ring version of it.
  parts.push(tinted(loftGeometry(loftProfile([
    { y: 0.098, halfWidth: 0.050, halfDepth: 0.032, square: 2.4, z: -0.058 },
    { y: 0.150, halfWidth: 0.076, halfDepth: 0.044, square: 2.5, z: -0.066 },
    { y: 0.205, halfWidth: 0.084, halfDepth: 0.046, square: 2.5, z: -0.060 },
    { y: 0.236, halfWidth: 0.062, halfDepth: 0.036, square: 2.4, z: -0.048 },
  ]), { radialSegments: 12 }), tintOver(skin, 0x54371c)));

  return mergeGeometries(parts);
}

const COP_SKIN: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.copSkin,
  roughness: 0.76,
  metalness: 0.0,
});

const COP_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.copGear,
  roughness: 0.7,
  metalness: 0.0,
});

/**
 * The chequer band and every piece of duty kit, as one panel group.
 *
 * **Two rows of twelve, phase-alternating — a checkerboard, not a stripe.**
 * The single row of eight it replaces read as bunting at chase distance; the
 * reference's band is two courses of small squares, and doubling the rows
 * costs triangles only, which is the cheap axis. All of it — the band, the
 * duty belt, its pouches, the body camera, the shoulder mic and its cord, and
 * the badge — is patches of shade on the *same* police-blue material, which is
 * what makes a whole uniform's worth of kit cost one mesh. `mirrored` is
 * deliberately unused on the band: it wraps, so each patch is an absolute span
 * from the front anchor and the seam lands at the back.
 *
 * Everything proud of the yoke carries a lift above the yoke's 0.011, because
 * two patches at the same lift on the same profile are a shimmer.
 */
const COP_TORSO_MARKINGS: readonly RiderPatch[] = Object.freeze([
  ...Array.from({ length: 24 }, (_, index) => {
    const column = index % 12;
    const row = Math.floor(index / 12);
    return Object.freeze({
      anchor: 'front' as PatchAnchor,
      u0: (column / 12) * Math.PI * 2,
      u1: ((column + 1) / 12) * Math.PI * 2,
      from: row === 0 ? 0.300 : 0.336,
      to: row === 0 ? 0.336 : 0.372,
      uSegments: 2,
      vSegments: 1,
      lift: 0.010,
      // Pale, blue, pale, blue — and the opposite phase on the row above.
      shade: (column + row) % 2 === 0 ? 2.6 : 0.82,
    });
  }),
  // The duty belt, wrapped, with pouches proud of it at the hips and the
  // small of the back, and a pale buckle plate at the front.
  Object.freeze({
    anchor: 'back' as PatchAnchor,
    u0: 0,
    u1: Math.PI * 2,
    from: 0.045,
    to: 0.100,
    uSegments: 20,
    vSegments: 1,
    lift: 0.009,
    shade: 0.16,
  }),
  Object.freeze({
    anchor: 'front' as PatchAnchor,
    u0: 0.50,
    u1: 0.85,
    mirrored: true,
    from: 0.048,
    to: 0.102,
    uSegments: 2,
    vSegments: 1,
    lift: 0.014,
    shade: 0.24,
    taper: 0.12,
  }),
  Object.freeze({
    anchor: 'back' as PatchAnchor,
    u0: 0.28,
    u1: 0.60,
    mirrored: true,
    from: 0.048,
    to: 0.100,
    uSegments: 2,
    vSegments: 1,
    lift: 0.013,
    shade: 0.22,
    taper: 0.12,
  }),
  Object.freeze({
    anchor: 'front' as PatchAnchor,
    u0: -0.10,
    u1: 0.10,
    from: 0.052,
    to: 0.095,
    uSegments: 2,
    vSegments: 1,
    lift: 0.015,
    shade: 1.9,
  }),
  // The body camera, centred on the band the way the reference wears it.
  Object.freeze({
    anchor: 'front' as PatchAnchor,
    u0: -0.14,
    u1: 0.14,
    from: 0.298,
    to: 0.372,
    uSegments: 2,
    vSegments: 2,
    lift: 0.016,
    shade: 0.14,
    taper: 0.10,
  }),
  // The shoulder mic, high on his left, and the coiled cord dropping from it
  // across the band toward the belt — the thin dark line is all a cord is at
  // gameplay scale, and it reads because it crosses the chequer.
  Object.freeze({
    anchor: 'front' as PatchAnchor,
    u0: -0.52,
    u1: -0.28,
    from: 0.430,
    to: 0.492,
    uSegments: 2,
    vSegments: 2,
    lift: 0.017,
    shade: 0.16,
  }),
  Object.freeze({
    anchor: 'front' as PatchAnchor,
    u0: -0.46,
    u1: -0.40,
    from: 0.150,
    to: 0.435,
    uSegments: 1,
    vSegments: 6,
    lift: 0.012,
    shade: 0.18,
  }),
  // An original shield-shaped badge impression, not any real crest — pale
  // toward silver on the blue material, standing proud of the yellow chest.
  Object.freeze({
    anchor: 'front' as PatchAnchor,
    u0: 0.28,
    u1: 0.62,
    from: 0.392,
    to: 0.458,
    uSegments: 3,
    vSegments: 3,
    lift: 0.016,
    taper: 0.34,
    shade: 2.3,
  }),
]);

// -- The cop's paintwork ------------------------------------------------------
//
// `RiderLook.paint` exists for him: shorts, knee pads, socks and sneakers are
// exactly the things a second rider cannot buy as meshes. Every boundary here
// has a matching seam ring pair in `COP_THIGH` / `COP_SHIN`, which is what
// keeps a hem a hem rather than a gradient. The "briefs" defect this replaces
// was structural — his seat mesh ended at the hip line and the whole leg was
// skin — and the fix is a garment that rides the limb, so no reachable stance
// can pull it off him (the carve-clip lesson, applied in advance this time).

const COP_SHORTS_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copShirt, 0.88);
const COP_PAD_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copGear, 0.92);
const COP_SOCK_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copShirt, 0.78);
const COP_SOCK_RING_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copHiVis);

/** Cargo shorts to mid-thigh; a black knee pad over the knee's end. */
function paintCopThigh(geometry: THREE.BufferGeometry): void {
  const length = RIDER_BLOCKOUT.thighLength;
  paintBands(geometry, [
    { top: Infinity, bottom: -length * 0.52, tint: COP_SHORTS_TINT },
    { top: -length * 0.80, bottom: -Infinity, tint: COP_PAD_TINT },
  ]);
}

/** The pad's lower half, bare shin, then a navy crew sock with a hi-vis ring. */
function paintCopShin(geometry: THREE.BufferGeometry): void {
  const length = RIDER_BLOCKOUT.shinLength;
  paintBands(geometry, [
    { top: Infinity, bottom: -length * 0.30, tint: COP_PAD_TINT },
    { top: -length * 0.58, bottom: -length * 0.655, tint: COP_SOCK_RING_TINT },
    { top: -length * 0.655, bottom: -Infinity, tint: COP_SOCK_TINT },
  ]);
}

const COP_LACE_TINT: Tint = [1.65, 1.68, 1.75];
// Dimmed hard: at full hi-vis the first capture's cop wore glowing yellow
// shoes that outshouted the yoke. A flash is a detail, not a signal.
const COP_HEEL_TINT = tintOver(BLOCKOUT_COLOURS.copGear, BLOCKOUT_COLOURS.copHiVis, 0.38);

/**
 * Chunky sneakers instead of moto boots: a grey lace panel over the forefoot
 * and a hi-vis flash on the heel. Banded by the boot's own bounding box rather
 * than by rig constants, because the boot is built in the ankle's frame by
 * `render/rider.ts` and this painter should not have to know its arithmetic.
 */
function paintCopBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    if (t > 0.40 && z > 0.030) {
      colour.setXYZ(i, COP_LACE_TINT[0], COP_LACE_TINT[1], COP_LACE_TINT[2]);
    } else if (t > 0.18 && t < 0.42 && z < -0.078) {
      colour.setXYZ(i, COP_HEEL_TINT[0], COP_HEEL_TINT[1], COP_HEEL_TINT[2]);
    }
  }
}

export const COP_LOOK: RiderLook = Object.freeze({
  id: 'cop' as CharacterId,
  materials: Object.freeze({
    body: Object.freeze({
      colour: BLOCKOUT_COLOURS.copShirt,
      roughness: 0.72,
      metalness: 0.0,
    }),
    // Bare arms and legs: he is in shorts, and the skin is what separates his
    // silhouette from a rider in a suit at a glance.
    limbs: COP_SKIN,
    accent: Object.freeze({
      colour: BLOCKOUT_COLOURS.copHiVis,
      roughness: 0.44,
      metalness: 0.0,
      // Hi-vis is *retroreflective*, and the emissive term is how a blockout
      // says so: without it the yoke goes the colour of mud under a tree, which
      // is exactly where a player most needs to know a cop is behind them. Held
      // to Cool Rider's panel level rather than above it — the coupled visual
      // system has one owner and one exposure (invariant 6).
      emissive: 0x3a3208,
      emissiveIntensity: 0.5,
    }),
    head: Object.freeze({
      colour: BLOCKOUT_COLOURS.copHelmet,
      roughness: 0.42,
      metalness: 0.03,
    }),
    face: Object.freeze({
      colour: BLOCKOUT_COLOURS.copBand,
      roughness: 0.54,
      metalness: 0.04,
    }),
    gear: COP_GEAR,
  }),
  profiles: Object.freeze({
    torso: COP_TORSO,
    seat: SEAT,
    thigh: COP_THIGH,
    shin: COP_SHIN,
    upperArm: COP_UPPER_ARM,
    forearm: COP_FOREARM,
    neck: TROLLINA_NECK,
    head: COP_HELMET,
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: GLOVE,
  }),
  // Shorts one step down from the polo so the hem reads; bare legs at the
  // authored skin colour; the collar a touch up, as a collar is.
  shades: Object.freeze({ seat: 0.88, legs: 1, collar: 1.1, sole: 0.72, neck: 1 }),
  parts: Object.freeze({
    hands: 'gear' as RiderMaterialRole,
    kneePad: 'gear' as RiderMaterialRole,
    // Skin, not cloth — the one part of him that is bare below the belt.
    legs: 'limbs' as RiderMaterialRole,
    // Merged into the torso mesh, as Cool Rider's trousers are: navy shorts
    // under a navy polo is one garment as far as the geometry is concerned,
    // and a separate mesh for them would be a draw call spent on a seam.
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    collar: Object.freeze({
      anchor: 'front' as PatchAnchor,
      u0: 0,
      u1: Math.PI * 2,
      from: 0.502,
      to: 0.545,
      uSegments: 20,
      vSegments: 2,
      lift: 0.011,
      shade: 1.1,
    }),
    // The yoke: hi-vis over both shoulders and the *whole* upper chest and
    // back, everywhere above the chequer band — the reference's shirt is
    // yellow from band to collar, and the first cut's shoulder-only pair left
    // navy Vs at the sternum and spine that read as a costume rather than a
    // uniform. Still one mesh: the fills ride a lower lift than the outboard
    // pair so their overlaps stack instead of shimmer. It does not cast: a
    // flat identity panel that casts is a meaningless blob on anything that
    // reads `castShadow` (rule 3), and the cop's shadow budget is spent on his
    // silhouette instead. The badge lives in the markings group now — it is
    // silver, and this material only does yellow.
    shoulders: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -1.28,
          u1: 1.28,
          from: 0.372,
          to: 0.520,
          uSegments: 10,
          vSegments: 4,
          lift: 0.011,
          taper: 0.22,
        }),
        // Untapered, and run up under the collar patch: a taper notched dark
        // triangles of shirt out of the yoke's top edge on the first capture.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.72,
          u1: 0.72,
          from: 0.372,
          to: 0.512,
          uSegments: 6,
          vSegments: 4,
          lift: 0.009,
        }),
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.72,
          u1: 0.72,
          from: 0.372,
          to: 0.512,
          uSegments: 6,
          vSegments: 4,
          lift: 0.009,
        }),
      ]),
    }),
    torso: Object.freeze({
      role: 'face' as RiderMaterialRole,
      casts: false,
      patches: COP_TORSO_MARKINGS,
    }),
    // The helmet's dark vents merge into its white crown. The face is real
    // skin geometry below it (`copFaceParts`) rather than features painted
    // onto a full-face shell. The visual pass added the brow lip and two more
    // vent pairs: a bicycle helmet's read is *many* slots radiating back from
    // a peaked brow, and three patches were a hard hat with a stripe.
    head: Object.freeze([
      // The brow lip: a white peak standing proud over the glasses.
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.60,
        u1: 0.60,
        from: 0.206,
        to: 0.230,
        uSegments: 6,
        vSegments: 2,
        lift: 0.017,
        taper: 0.35,
        shade: 1.03,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.18,
        u1: 0.18,
        from: 0.236,
        to: 0.342,
        uSegments: 3,
        vSegments: 5,
        lift: 0.008,
        shade: 0.18,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0.38,
        u1: 0.62,
        mirrored: true,
        from: 0.244,
        to: 0.326,
        uSegments: 2,
        vSegments: 4,
        lift: 0.007,
        shade: 0.25,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0.68,
        u1: 0.88,
        mirrored: true,
        from: 0.242,
        to: 0.312,
        uSegments: 2,
        vSegments: 3,
        lift: 0.007,
        shade: 0.25,
      }),
      Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: 0.26,
        u1: 0.46,
        mirrored: true,
        from: 0.252,
        to: 0.318,
        uSegments: 2,
        vSegments: 3,
        lift: 0.007,
        shade: 0.22,
      }),
      Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: -0.92,
        u1: 0.92,
        from: 0.208,
        to: 0.228,
        uSegments: 8,
        vSegments: 1,
        lift: 0.010,
        shade: 0.88,
      }),
    ]),
  }),
  extras: Object.freeze([Object.freeze({
    name: 'rider-cop-face',
    joint: 'neck' as const,
    role: 'limbs' as RiderMaterialRole,
    casts: false,
    build: copFaceParts,
  })]),
  // The shorts, knee pads, socks and sneakers — paint on the limb meshes,
  // because he has no draw calls left to buy them as panels. See the tint
  // block above `paintCopThigh` for the fix this is (the "briefs" defect).
  paint: Object.freeze({
    thigh: paintCopThigh,
    shin: paintCopShin,
    boot: paintCopBoot,
  }),
  // Hands forward and low: he is holding a paddle out in front of him, and the
  // carriage is what makes that read as intent rather than as a man carrying a
  // stick. Well inside the reach bound Trollina's entry documents.
  armCarriage: Object.freeze({ splay: 0.04, rise: -0.01 }),
});

// -- Red Rider ---------------------------------------------------------------
//
// M19, and the first look in this file taken from a **real person**. He asked
// to be in the game, the owner agreed publicly, and the permission evidence
// sits with the reference material under `references/red-rider/` — none of
// which ships. What ships is his read, and the notes filed with the reference
// are specific about which parts of it are load-bearing: red full-face lid,
// dark visor, red-and-black outfit, protective armour, gloves.
//
// **He is Cool Rider's chassis in his own colours, plus one new silhouette.**
// Rule 1 again — one skeleton, one stance solve — and beyond that he reuses
// nine of Cool Rider's ten profiles outright, because a full-face lid over a
// jacket over boots is the same figure. The two things that make him himself at
// 30 m are the colour field and the **chest harness**, which is the one piece
// of kit no rider in this file has had, and which is why his shoulder group
// casts where the cop's does not: it is a real strap standing off a real chest,
// not a flat identity panel (rule 3).
//
// **Everything below the belt is paint.** The knee guard's lower half, the boot
// cuff and the outer-leg piping are vertex repaints on the limb meshes — the
// mechanism the cop introduced, used here for the same reason the cop needed
// it: a panel on a leg is a mesh, and he is spending his meshes on the harness.

/**
 * Seams at the thigh graphic's two edges (0.30, 0.68) and the knee guard's top
 * (0.78).
 *
 * **The first two exist entirely so the graphic has something to end on.**
 * `limbProfile` turns each seam into a ring *pair* at `f ± 0.018`, and a
 * painted boundary that does not land on a ring smears across whatever gap it
 * falls in — which for the default stops is a tenth of a metre. The first build
 * of the mark spanned two such gaps and rendered as a white fog down his leg.
 *
 * They moved out from 0.34/0.60 on the owner's second look: the mark between
 * them was square, and the reference's is a tall narrow panel running down the
 * leg. A graphic's proportions are its seams' spacing.
 */
const RED_THIGH = limbProfile(
  RIDER_BLOCKOUT.thighLength,
  [0.079, 0.072, 0.061],
  [0.30, 0.68, 0.78],
  { flatten: 0.94, square: 2.4 },
);
/** Seams at the guard's lower edge (0.55) and the boot cuff's top (0.74). */
const RED_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.064, 0.058, 0.046], [0.55, 0.74], {
  flatten: 0.92,
  square: 2.4,
});

/** The red field: his top, his sleeves and his trousers, as one garment. */
const RED_SUIT: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.redRiderSuit,
  roughness: 0.68,
  metalness: 0.0,
});

/**
 * The hard armour — harness, elbow and knee guards.
 *
 * It parts company with the boots in **roughness**, not in hue: moulded
 * plastic catches a highlight along its edge and matte leather does not, and
 * that highlight is the whole difference between "armour" and "a black shape"
 * once both are two metres of dark on a red rider.
 *
 * **Matte, at 0.88 — and the roles are the inverse of what the first build
 * assumed.** The waist strap is the only patch on any rider that wraps a full
 * 360°, so somewhere along it the surface normal *always* hits the mirror
 * angle to the sun. On a near-black albedo that put a hard white line across
 * his stomach, following the band's curve. 0.34 made it unmissable, 0.46 and
 * 0.60 only thinned it, and a bisection against a fully-rough control proved
 * it was specular rather than a patch edge: a dark glossy surface at a grazing
 * angle is a mirror, and ACES clips the reflection to white however dark the
 * albedo underneath it is.
 *
 * So armour is now the *matte* half of the pair and `RED_GEAR` is the glossier
 * one, which is the opposite of how this file was first written and is the
 * more honest reading anyway: moulded impact plastic is textured and dull,
 * worn leather boots are burnished. The two materials stay separate because
 * that contrast is still what tells a guard from a boot at chase distance —
 * only the direction changed. Metalness is 0 because none of it is metal; the
 * buckle gets its hardware read from a vertex shade instead.
 */
const RED_ARMOUR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.redRiderArmour,
  roughness: 0.88,
  metalness: 0.0,
});

const RED_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.redRiderGear,
  roughness: 0.66,
  metalness: 0.0,
});

// -- Red Rider's paintwork ----------------------------------------------------

const RED_GUARD_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderArmour);
const RED_CUFF_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderGear);
const RED_MARK_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderMark, 0.70);
/** A brighter red than the suit, for the accent strips moulded into his guards. */
const RED_ACCENT_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderHelmet);
/** Red knuckles and fingers on a black glove — the loudest detail he wears. */
const RED_KNUCKLE_TINT = tintOver(BLOCKOUT_COLOURS.redRiderGear, BLOCKOUT_COLOURS.redRiderSuit, 1.25);
/** Panel lines on a boot: the same gear colour, one step up so an edge reads. */
const RED_BOOT_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.redRiderGear, BLOCKOUT_COLOURS.redRiderGear, 1.7);

/**
 * Is this vertex on the *outboard* face of a limb built for `side`?
 *
 * Rider-left is +X, so outboard is +X on the left leg and −X on the right. The
 * ratio against the radius rather than an absolute metre band, because a limb
 * tapers and a fixed threshold would widen toward the ankle.
 */
function outboardFace(x: number, z: number, side: number, sharpness: number): boolean {
  const radius = Math.hypot(x, z);
  return radius > 1e-4 && (x * side) / radius > sharpness;
}

/**
 * The knee guard's upper cup, and his thigh graphic on the outer-left face.
 *
 * The graphic is an original angular mark standing in for the gear brand's
 * wordmark the reference photograph carries — see `BLOCKOUT_COLOURS.
 * redRiderMark` for why it is not the original, and why this is the second
 * attempt at placing it.
 */
function paintRedRiderThigh(geometry: THREE.BufferGeometry, side: number): void {
  const length = RIDER_BLOCKOUT.thighLength;
  paintBands(geometry, [{ top: -length * 0.78, bottom: -Infinity, tint: RED_GUARD_TINT }]);

  // The reference carries one mark, on the rider's left thigh (+X). The first
  // side-aware pass proved that it could paint either outer face, then painted
  // both and accidentally turned an asymmetric identity mark into uniform
  // piping. Armour remains symmetric; only the mark stops here.
  if (side < 0) return;

  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // Between the 0.30 and 0.68 seam pairs in `RED_THIGH`, which is what makes
    // the top and bottom edges land on rings instead of fogging out.
    if (y > -length * 0.31 || y < -length * 0.67) continue;
    // 0.88 rather than the 0.68 of the square first version: a ~28° half-angle
    // instead of ~47°, over a span half again as tall. The reference's graphic
    // is a long thin panel down the outside of the leg, near 3:1; anything
    // wider than this reads as a patch sewn on rather than as a marking.
    if (!outboardFace(position.getX(i), position.getZ(i), side, 0.88)) continue;
    colour.setXYZ(i, RED_MARK_TINT[0], RED_MARK_TINT[1], RED_MARK_TINT[2]);
  }
}

/**
 * The guard's long lower half over the shin, its red accent strip, then the
 * boot's cuff.
 *
 * The guard runs to 0.55 rather than the 0.34 of the first build: his are
 * full-length moulded shin guards, and stopping a third of the way down left a
 * band of red trouser between armour and boot that read as a striped sock. The
 * accent strip is the red channel the reference moulds down the centre of the
 * guard — repainted *back* toward red from the armour band that has just been
 * laid over it, which is the cheapest possible way to state a two-tone part.
 */
function paintRedRiderShin(geometry: THREE.BufferGeometry): void {
  const length = RIDER_BLOCKOUT.shinLength;
  paintBands(geometry, [
    { top: Infinity, bottom: -length * 0.55, tint: RED_GUARD_TINT },
    { top: -length * 0.74, bottom: -Infinity, tint: RED_CUFF_TINT },
  ]);

  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < -length * 0.50 || y > -length * 0.12) continue;
    const x = position.getX(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    // The front centre line of the guard only — a narrow channel, not a face.
    if (radius > 1e-4 && z / radius > 0.86) {
      colour.setXYZ(i, RED_ACCENT_TINT[0], RED_ACCENT_TINT[1], RED_ACCENT_TINT[2]);
    }
  }
}

/**
 * Panel lines on a moto boot — an ankle band and a toe cap.
 *
 * Both are the boot's own colour one step up rather than a new value: what
 * makes a boot read as a *boot* rather than a black lump is that it has parts,
 * and an edge between two nearly-equal darks is enough to say so. Banded by the
 * boot's own bounding box, as `paintCopBoot` is and for the same reason — the
 * boot is built in the ankle's frame and a painter should not know its
 * arithmetic.
 */
function paintRedRiderBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    const ankleBand = t > 0.62 && t < 0.82;
    const toeCap = t < 0.34 && z > 0.055;
    // The retention strap across the instep, between cuff and toe — the
    // reference's boots close with a broad strap over the top, and it is the
    // one line that separates "riding shoe" from "rubber boot". Front half
    // only: a band that wrapped the heel too would just be a second ankle
    // band.
    const instepStrap = t > 0.38 && t < 0.52 && z > 0.02;
    if (ankleBand || toeCap || instepStrap) {
      colour.setXYZ(i, RED_BOOT_PANEL_TINT[0], RED_BOOT_PANEL_TINT[1], RED_BOOT_PANEL_TINT[2]);
    }
  }
}

/**
 * Red knuckle armour and finger segments on a black glove.
 *
 * The single most distinctive thing he wears after the helmet, and the reason
 * `RiderLook.paint.hand` exists at all: a hand is one lofted mesh with no panel
 * slot, so two-tone gloves have nowhere else to live. The band is the outer
 * half of the lower glove — knuckles and fingers — which is the face turned
 * toward the camera whenever the arms are carried forward.
 */
function paintRedRiderHand(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // Below the cuff, above the fingertip taper — with a black break at the
    // finger roots, so the red splits into a knuckle bar and a finger band
    // instead of one mitten-shaped field. Two bands are what "articulated
    // glove" costs in this system: one skipped strip of paint.
    if (y > -0.030 || y < -0.098) continue;
    if (y < -0.050 && y > -0.062) continue;
    const z = position.getZ(i);
    const radius = Math.hypot(position.getX(i), z);
    if (radius > 1e-4 && z / radius > 0.10) {
      colour.setXYZ(i, RED_KNUCKLE_TINT[0], RED_KNUCKLE_TINT[1], RED_KNUCKLE_TINT[2]);
    }
  }
}

export const RED_RIDER_LOOK: RiderLook = Object.freeze({
  id: 'red-rider' as CharacterId,
  materials: Object.freeze({
    body: RED_SUIT,
    // The same object, as Cool Rider's is: red sleeves and a red top are one
    // garment, and two roles pointing at one spec build one material.
    limbs: RED_SUIT,
    accent: RED_ARMOUR,
    head: Object.freeze({
      colour: BLOCKOUT_COLOURS.redRiderHelmet,
      // Gloss, where Cool Rider's lid is satin. His is the shiniest thing on
      // the character and it is what the chase camera looks at all day.
      roughness: 0.18,
      metalness: 0.06,
    }),
    face: Object.freeze({
      colour: BLOCKOUT_COLOURS.redRiderVisor,
      roughness: 0.10,
      metalness: 0.42,
    }),
    gear: RED_GEAR,
  }),
  profiles: Object.freeze({
    torso: JACKET,
    seat: SEAT,
    thigh: RED_THIGH,
    shin: RED_SHIN,
    upperArm: UPPER_ARM,
    forearm: FOREARM,
    neck: NECK,
    head: HELMET,
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: GLOVE,
  }),
  // Trousers a hair under the top so the hem still reads on a rider who is one
  // colour from collar to ankle. The neck is the *gear* material at a modest
  // shade rather than the suit crushed to 0.20: what is under his lid is a
  // black gaiter, and a fifth of red is not black, it is maroon — which the
  // capture read as a bare neck on an otherwise fully-covered figure.
  shades: Object.freeze({ seat: 0.92, legs: 0.94, collar: 1.10, sole: 0.70, neck: 0.62 }),
  parts: Object.freeze({
    hands: 'gear' as RiderMaterialRole,
    neck: 'gear' as RiderMaterialRole,
    kneePad: 'accent' as RiderMaterialRole,
    legs: 'limbs' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    collar: Object.freeze({
      anchor: 'front' as PatchAnchor,
      u0: 0,
      u1: Math.PI * 2,
      from: 0.502,
      to: 0.545,
      uSegments: 20,
      vSegments: 2,
      lift: 0.011,
      shade: 1.10,
    }),
    // The two continuous shoulder wraps, plus a padded crown standing proud of
    // each one. They cast because this is the one part of the harness that
    // genuinely changes the silhouette — rule 3.
    //
    // The old wrap stopped at ±0.62 from outboard. The original chest and back
    // straps began 0.97 rad from outboard, leaving a visible 0.35 rad gap on all four
    // joins. Matching the front and back *spacing* did not make one harness;
    // the wrap now reaches the straps and overlaps them literally.
    shoulders: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: true,
      patches: Object.freeze([
        // Rear half: climbs from the back drop to the shoulder crown.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -1.05,
          u1: 0.04,
          from: 0.405,
          to: 0.465,
          uSegments: 6,
          vSegments: 3,
          lift: 0.012,
          taper: 0.02,
          skewFrom: 0.440,
          skewTo: 0.400,
        }),
        // Front half: descends from the crown into the chest strap. Together
        // these two pieces make an arch instead of a horizontal T-junction.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.04,
          u1: 1.05,
          from: 0.405,
          to: 0.465,
          uSegments: 6,
          vSegments: 3,
          lift: 0.012,
          taper: 0.02,
          skewFrom: 0.400,
          skewTo: 0.440,
        }),
        // A short padded section over the shoulder crown. The webbing beneath
        // it remains visible front and back, so this reads as padding on a
        // continuous strap rather than as an unrelated shoulder plate.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.42,
          u1: 0.42,
          from: 0.425,
          to: 0.492,
          uSegments: 4,
          vSegments: 3,
          lift: 0.019,
          taper: 0.26,
          shade: 1.22,
        }),
      ]),
    }),
    // The rest of the harness, in one mesh: the two chest straps running down
    // from the shoulders, the buckle plate they meet at, the waist strap that
    // wraps him, and the back panel between the shoulder blades. All flat on
    // the torso, so none of it casts — and all of it is the same armour
    // material, which is what lets a whole rig cost one draw call. The red
    // showing *between* the straps is the perforated chest panel of the
    // reference; it needs no geometry of its own.
    torso: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // A broad near-vertical pair running without a capped gap from the
        // shoulder wraps into the sternum bridge, framing the red chest.
        // The torso profile supplies the slight convergence of worn webbing;
        // adding an unrelated diagonal over this pair was the source of the
        // black zigzag in the owner's screenshots.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: 0.42,
          u1: 0.75,
          mirrored: true,
          from: 0.302,
          to: 0.438,
          uSegments: 3,
          vSegments: 6,
          lift: 0.010,
          taper: 0.02,
        }),
        // The sternum strap bridging the pair, under the buckle — the thin
        // horizontal that makes two straps read as one garment. It sits high,
        // leaving the camera and waist hardware below as a separate layer.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.46,
          u1: 0.46,
          from: 0.306,
          to: 0.336,
          uSegments: 4,
          vSegments: 1,
          lift: 0.010,
          taper: 0.16,
          shade: 0.92,
        }),
        // The buckle where the straps meet. **Small, central and black.**
        //
        // It spent one build as a large plate driven to shade 7.0, on the
        // theory that a metal buckle was where a light value belonged on this
        // character. The owner's screenshot settled it: nothing on his rig is
        // grey. It read as a grey plate bolted to his sternum, which is not a
        // buckle and is not anything he wears. The reference's hardware is
        // black-on-black and is legible only as a *shape*, so that is what this
        // is now — narrower, shorter, and one step up from the strap rather
        // than seven.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.10,
          u1: 0.10,
          from: 0.300,
          to: 0.344,
          uSegments: 2,
          vSegments: 2,
          lift: 0.018,
          taper: 0.18,
          shade: 1.30,
        }),
        // The waist strap, wrapped. Anchored at the back so its one seam lands
        // behind him rather than down the buckle. **Tapered**, unlike the
        // collar it is otherwise shaped like: a hard-edged wall at lift height
        // is a second surface for the sun to catch, and this is the patch that
        // had to stop catching it (see `RED_ARMOUR`).
        // Wide — 66 mm against the first build's 44. The reference's belt is
        // the broadest single piece of webbing on him, and the base the whole
        // rig visually stands on; too thin and the vertical straps float.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: 0,
          u1: Math.PI * 2,
          from: 0.156,
          to: 0.222,
          uSegments: 20,
          vSegments: 2,
          lift: 0.009,
          taper: 0.30,
        }),
        // The vest's flanks. The reference's rig is a *garment* wrapping his
        // ribs, not two braces on bare chest, and without these the straps
        // floated on red either side of him.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.42,
          u1: 0.42,
          from: 0.208,
          to: 0.396,
          uSegments: 5,
          vSegments: 4,
          lift: 0.007,
          taper: 0.26,
        }),
        // The action camera/holster hangs immediately inboard of the rider-left
        // vertical, with its clip overlapping the sternum bridge. This is a
        // small three-layer object with empty red around it — not a seventh
        // black line crossing the chest. Negative offsets put it on the same
        // side as the reference when viewed from the front.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.30,
          u1: -0.06,
          from: 0.214,
          to: 0.315,
          uSegments: 3,
          vSegments: 4,
          lift: 0.024,
          taper: 0.10,
          shade: 0.86,
        }),
        // Its lens: a small charcoal port standing proud of the black body.
        // The former near-black-on-black port disappeared completely; glass
        // needs one readable value edge before it can make the box a camera.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.24,
          u1: -0.10,
          from: 0.267,
          to: 0.302,
          uSegments: 2,
          vSegments: 1,
          lift: 0.033,
          shade: 3.00,
        }),
        // The clip that hooks the camera over the sternum bridge.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.24,
          u1: -0.12,
          from: 0.306,
          to: 0.340,
          uSegments: 2,
          vSegments: 1,
          lift: 0.034,
          taper: 0.10,
          shade: 1.28,
        }),
        // One loose end below the rider-left strap. Two short central tails
        // read as fringe and merged into the camera/belt knot; one longer,
        // side-biased tail reads as adjusted webbing.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.54,
          u1: -0.43,
          from: 0.078,
          to: 0.166,
          uSegments: 2,
          vSegments: 2,
          lift: 0.011,
          taper: 0.12,
        }),
        // The harness's back: two vertical straps dropping from the shoulder
        // pair to the waist wrap, and nothing between them.
        //
        // **This replaces a solid back panel, and the capture is why.** A panel
        // the size of Cool Rider's blue one, in armour black on a red back, did
        // not read as a garment at all — it read as a hole punched through him,
        // which is the same failure mode his own entry warns about from the
        // other direction (a *bright* pad reading as part of the wheel). Straps
        // carry the harness better anyway: the chase camera is behind the rider
        // essentially all the time, and what should be legible back there is
        // that he is wearing a rig, not that he has a dark rectangle.
        //
        // They share the front pair's angular span, overlap the shoulder wraps
        // above, and overlap the belt below. These three overlaps — not merely
        // matching numbers — are what make each route one continuous strap.
        ...[-1, 1].map((side) => Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: side > 0 ? 0.42 : -0.75,
          u1: side > 0 ? 0.75 : -0.42,
          from: 0.212,
          to: 0.438,
          uSegments: 3,
          vSegments: 5,
          lift: 0.010,
          taper: 0.02,
        })),
      ]),
    }),
    // Three uneven bands down the outer sleeve rather than one long panel: the
    // reference's sleeves are red with black accent stripes of *different*
    // lengths, and an even ladder reads as a uniform rather than as a graphic.
    // A single band the length of Cool Rider's would make the arm black with
    // red ends.
    //
    // **Sheared, and wider than the first build** — the reference's stripes
    // cut *diagonally* across the sleeve, and a level band ending mid-arm read
    // in the capture as a vent slot rather than a graphic. The skews differ
    // per stripe on the same argument as the lengths: matched diagonals are a
    // uniform's piping, unmatched ones are a livery.
    sleeve: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -1.30,
          u1: 1.30,
          from: -0.052,
          to: -0.024,
          uSegments: 8,
          vSegments: 1,
          lift: 0.009,
          taper: 0.20,
          skewFrom: -0.052,
          skewTo: -0.030,
        }),
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -1.10,
          u1: 1.10,
          from: -0.100,
          to: -0.076,
          uSegments: 7,
          vSegments: 1,
          lift: 0.009,
          taper: 0.20,
          skewFrom: -0.100,
          skewTo: -0.084,
        }),
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.90,
          u1: 0.90,
          from: -0.142,
          to: -0.122,
          uSegments: 6,
          vSegments: 1,
          lift: 0.009,
          taper: 0.20,
          skewFrom: -0.134,
          skewTo: -0.142,
        }),
      ]),
    }),
    // **The whole forearm, not an elbow patch.** This group mounts on the
    // *forearm* profile at the elbow joint, so it can carry the reference's
    // complete arm armour in one mesh: the moulded elbow cup, a plate running
    // down the forearm, the strap between them, and a wrist closure. Cool
    // Rider's single 56 mm pad is a piece of reflective tape by comparison, and
    // the difference is most of what "he is wearing armour" looks like from
    // behind. `forearmLength` is 0.26, so the plate reaches roughly the wrist.
    elbowPad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.86,
          u1: 0.86,
          from: -0.076,
          to: 0.006,
          uSegments: 7,
          vSegments: 4,
          lift: 0.015,
          taper: 0.26,
        }),
        // The strap holding the cup on — a **full loop**, as of the outside
        // review. At ±0.98 rad it stopped just past the sides of the arm, and
        // a strap with visible ends is a tab stuck on; webbing that holds
        // armour goes *around*. The seam lands at the inner elbow, the one
        // face of the arm the camera never gets. Tapered like the waist wrap,
        // for the waist wrap's reason: a full-circumference band always shows
        // the sun a mirror angle somewhere.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -Math.PI,
          u1: Math.PI,
          from: -0.098,
          to: -0.080,
          uSegments: 14,
          vSegments: 1,
          lift: 0.008,
          taper: 0.28,
        }),
        // The forearm plate.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.72,
          u1: 0.72,
          from: -0.184,
          to: -0.102,
          uSegments: 6,
          vSegments: 3,
          lift: 0.013,
          taper: 0.24,
          shade: 1.12,
        }),
        // The wrist closure — a full loop, same argument as the strap above.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -Math.PI,
          u1: Math.PI,
          from: -0.216,
          to: -0.192,
          uSegments: 14,
          vSegments: 1,
          lift: 0.008,
          taper: 0.28,
        }),
      ]),
    }),
    // **The whole knee-and-shin guard**, on the same argument as the arm above:
    // this group mounts on the *shin* profile at the knee, so the cup, the
    // strap under it and the long plate down the shin are one mesh. The
    // reference's guards are the largest pieces of kit he wears and they run
    // most of the way to the boot. `paintRedRiderShin` colours the trouser
    // underneath to match and lays the red accent channel down the middle, so
    // the proud geometry only has to carry the parts that catch light.
    // `shinLength` is 0.38.
    kneePad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.88,
          u1: 0.88,
          from: -0.104,
          to: -0.004,
          uSegments: 7,
          vSegments: 4,
          lift: 0.016,
          taper: 0.28,
        }),
        // The strap under the cup — a full loop, as on the arm; the seam lands
        // in the back of the knee.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -Math.PI,
          u1: Math.PI,
          from: -0.132,
          to: -0.110,
          uSegments: 14,
          vSegments: 1,
          lift: 0.008,
          taper: 0.28,
        }),
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.70,
          u1: 0.70,
          from: -0.228,
          to: -0.140,
          uSegments: 6,
          vSegments: 3,
          lift: 0.013,
          taper: 0.24,
          shade: 1.12,
        }),
      ]),
    }),
    // The same four helmet patches Cool Rider has, because it is the same class
    // of lid. The shades differ: on a red shell a light rim goes pink and a
    // dark one goes maroon, so the chin bar and spoiler step *down* toward the
    // visor's black and only the base rim steps up.
    head: Object.freeze([
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.70,
        u1: 0.70,
        from: 0.098,
        to: 0.152,
        uSegments: 6,
        vSegments: 3,
        lift: 0.015,
        taper: 0.42,
        shade: 0.84,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.86,
        u1: 0.86,
        from: 0.236,
        to: 0.256,
        uSegments: 7,
        vSegments: 1,
        lift: 0.011,
        taper: 0.3,
        shade: 0.78,
      }),
      Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: -0.78,
        u1: 0.78,
        from: 0.150,
        to: 0.206,
        uSegments: 8,
        vSegments: 3,
        lift: 0.012,
        taper: 0.62,
        shade: 0.88,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0,
        u1: Math.PI * 2,
        from: 0.090,
        to: 0.113,
        uSegments: 18,
        vSegments: 1,
        lift: 0.004,
        shade: 1.06,
      }),
      // Chin vents: three slots angling back across each cheek, the detail the
      // reference's shell carries below the visor. Dark on the red lid rather
      // than a separate material, which is what a vent is anyway — a hole.
      ...[0, 1, 2].map((index) => Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0.36 + index * 0.17,
        u1: 0.47 + index * 0.17,
        mirrored: true,
        from: 0.120,
        to: 0.148,
        uSegments: 2,
        vSegments: 1,
        lift: 0.006,
        shade: 0.22,
      })),
      // **No pivot boss.** One was built here — a small dark patch at the
      // visor's outer edge each side, standing for the shell's hinge — and the
      // owner's screenshot caught it as "a black oddity on the side of the
      // helmet". It was right: at 0.019 of lift on the widest part of the
      // shell it broke the helmet's outline into a tab, and a hinge is a
      // detail nobody resolves at riding distance anyway. The helmet's read is
      // its gloss and its visor; nothing else on it earns silhouette.
    ]),
    // **Much wider and deeper than Cool Rider's**, because the reference's lid
    // is a modern full-face with a big wrapping shield rather than a letterbox
    // slot — at ±1.05 rad it reaches the widest part of the shell and turns the
    // corner, which is what makes it read as glass wrapped around a face. It is
    // the only place on the character where the red stops, and after the
    // helmet it is the thing that identifies him at any distance.
    face: Object.freeze({
      role: 'face' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -1.05,
        u1: 1.05,
        from: 0.158,
        to: 0.246,
        uSegments: 12,
        vSegments: 4,
        lift: 0.007,
        sink: -0.014,
        taper: 0.18,
      })]),
    }),
  }),
  extras: Object.freeze([]),
  paint: Object.freeze({
    thigh: paintRedRiderThigh,
    shin: paintRedRiderShin,
    boot: paintRedRiderBoot,
    hand: paintRedRiderHand,
  }),
  // A shade wider than Cool Rider's and no higher: the reference stands square
  // and armoured rather than tucked, and the harness needs the chest open to
  // read at all. Well inside the reach bound Trollina's entry documents.
  armCarriage: Object.freeze({ splay: 0.022, rise: 0 }),
});

// -- Adonisb2 ----------------------------------------------------------------
//
// M22 Phase 1, and the second look in this file taken from a **real person** —
// one who *asked* to be here so he could share it. The photograph and the
// permission evidence sit under `references/guest-rider/` and never ship; the
// reference document ranks what recognition rests on, and this build follows
// that ranking: the black + neon-green palette, the helmet with its mirrored
// visor and green striping, the LARGE green knee/shin guards, and the backpack.
//
// **He is Cool Rider's chassis with the colour logic inverted.** Red Rider is
// red-field/black-structure; Adonisb2 is black-field/green-structure, and that
// inversion decides where paint can go (§22.3 fact 4): a vertex colour
// multiplies *down*, so the saturated green must live in a base material and be
// painted down to black — never black painted up to green. His **legs are
// therefore the accent material**: green moulded plastic as the base, with the
// trousers painted down to the suit's black above the guards and the boot cuff
// painted down below them. The guards are not decorations on his legs; on this
// rider the legs are guards wearing trousers.
//
// **The backpack is the one genuinely new silhouette element** — M19's
// chest-harness logic aimed at the back: the pack and the shoulder wraps cast
// (they change his outline), the strap runs down the chest are flat and do not.
// He spends no meshes on sleeve stripes or elbow armour because the photograph
// shows plain black sleeves; those two omissions are what pay for the pack, the
// green buckle hardware, and the helmet striping.

/**
 * Where the guard's upper wing begins, as a fraction of the thigh.
 *
 * Measured off the reference and then given back a centimetre. In the mockup
 * the green starts about 95 px above the knee where knee-to-boot is 265 px, so
 * the wing climbs roughly 0.36 of a shin above the joint — 0.136 m, which on a
 * 0.40 m thigh is 0.655. `render/riderClearance.test.ts` refused that by a
 * millimetre: in a hard carve held under a full crouch the thigh swings up far
 * enough to bring the wing's proud top corner to 29 mm below the pelvis, and
 * the jacket hem is at 10 mm with a 20 mm margin. So the guard sits 12 mm
 * lower than the reference implies, which is invisible beside a 138 mm shell
 * and is the difference between armour and green showing through a jacket hem
 * in exactly one reachable stance. The first build stopped the green at 0.78
 * and the guard read as a cuff below the knee rather than a shell spanning it.
 */
const ADONISB2_GUARD_TOP = 0.685;

/**
 * The knee cup's two edges, in each bone's own space: where its dark starts on
 * the thigh, and where it ends on the shin. Named because five things have to
 * agree on them — two cup patches, the plate that butts against the lower one,
 * the two leg painters that darken the limb beneath, and the seam rings those
 * paint boundaries must land on.
 */
const ADONISB2_CUP_TOP = -0.348;
/**
 * **Halved on the owner's ride.** The cup ran to −0.078, which with the thigh
 * half above it made 130 mm of unbroken black across the joint, and his verdict
 * was that the lower half of that lip should be the guard's green: "split in
 * half, use top black and bottom green". So the black is 65 mm now — the
 * thigh's 52 mm plus this — and everything below the joint that used to be cup
 * is plate. The photograph's cup does reach further down his shin than this,
 * but the photograph is a dome under directional light and this is flat
 * shading on a low-poly leg, where the same proportion reads as a much heavier
 * band; the owner is judging the render, which is the thing being built.
 */
const ADONISB2_CUP_BOTTOM = -0.013;

/**
 * Seams at the guard's upper wing plus Cool Rider's padding breaks. The wing
 * seam is where trouser-black meets guard-green above the knee, and a paint
 * boundary that does not land on a ring smears (M19's fog lesson).
 */
const ADONISB2_THIGH = limbProfile(
  RIDER_BLOCKOUT.thighLength,
  [0.079, 0.072, 0.061],
  [0.30, 0.52, ADONISB2_GUARD_TOP, -ADONISB2_CUP_TOP / RIDER_BLOCKOUT.thighLength],
  { flatten: 0.94, square: 2.4 },
);
/**
 * Where the boot's shaft begins, as a fraction of the shin.
 *
 * **His boots are tall, and the boot mesh is a foot.** The photograph is a
 * laced motocross boot whose shaft covers the bottom third of the shin, and
 * the owner's ride called the first build's footwear "shoes" — correctly,
 * because everything above the ankle was leg. The shaft is the shin's own
 * lower band painted in the gear material, which is what `parts.legs` and the
 * paint hooks exist for and costs nothing; the guard's lower strap lands on
 * this boundary and reads as the boot's collar. Measured off the photograph at
 * 68% down the shin, and the guard's plate now stops here instead of lapping
 * over it.
 */
const ADONISB2_BOOT_TOP = 0.66;

/**
 * One seam, at the boot's collar. A paint boundary that does not land on a
 * ring pair smears (M19's fog lesson), and this is the only one the shin has.
 */
const ADONISB2_SHIN = limbProfile(
  RIDER_BLOCKOUT.shinLength,
  // The end radius carries the boot rather than an ankle: every other look
  // tapers to 0.046 because a trouser leg narrows into a shoe, and his lower
  // shin is inside a laced boot that does not.
  [0.064, 0.058, 0.053],
  [-ADONISB2_CUP_BOTTOM / RIDER_BLOCKOUT.shinLength, ADONISB2_BOOT_TOP],
  { flatten: 0.92, square: 2.4 },
);

/** The black field: jacket, sleeves and (as paint) the trousers. */
const ADONISB2_SUIT: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.adonisb2Suit,
  roughness: 0.80,
  metalness: 0.0,
});

/**
 * The neon-green moulded plastic: guards, helmet striping, buckle hardware —
 * and the *base* of both legs, per the paint-direction rule above.
 *
 * Matte, for `RED_ARMOUR`'s reason: the knee group carries full-loop straps,
 * and a full-circumference band on a glossy material always finds the sun's
 * mirror angle somewhere and clips to white. Moulded impact plastic is dull;
 * the green does its work in hue, not in highlight.
 */
const ADONISB2_GUARD: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.adonisb2Guard,
  roughness: 0.86,
  metalness: 0.0,
});

/** Gloves, boots, backpack, straps, neck gaiter: the glossier black half. */
const ADONISB2_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.adonisb2Gear,
  roughness: 0.62,
  metalness: 0.0,
});

// -- Adonisb2's paintwork -----------------------------------------------------
//
// The legs are green-based, so every tint below paints *down* from the guard
// colour — the direction the multiplier honours.

/** Green → the trousers. ×0.92 matches `shades.seat`, so hem and hip agree. */
const ADONISB2_TROUSER_TINT = tintOver(
  BLOCKOUT_COLOURS.adonisb2Guard,
  BLOCKOUT_COLOURS.adonisb2Suit,
  0.92,
);
/** Green → the boot cuff under the guard. */
const ADONISB2_CUFF_TINT = tintOver(BLOCKOUT_COLOURS.adonisb2Guard, BLOCKOUT_COLOURS.adonisb2Gear);
/**
 * The knee cup's near-black, painted onto the leg beneath it.
 *
 * **A hinge cannot be sealed, so what shows through it has to be the right
 * colour.** The cup spans the knee and is therefore two patches on two bones,
 * and a bending knee *stretches* its front — the patella side is the outside
 * of the bend — so the halves pull apart exactly where they are most visible.
 * The owner's ride caught the result: a bright green line between two blacks,
 * which is the "sandwich" neither reference has. Sealing the halves is not
 * possible at every angle the leg can reach, so the limb under the cup is
 * painted to the cup's own value instead, and the gap opens onto more black.
 *
 * The number is the cup patches' `shade` and has to stay equal to it.
 */
const ADONISB2_CUP_TINT: readonly [number, number, number] = Object.freeze([0.10, 0.10, 0.10]);
/** Panel lines on the boot: the gear colour one step up, as Red Rider's. */
const ADONISB2_BOOT_PANEL_TINT = tintOver(
  BLOCKOUT_COLOURS.adonisb2Gear,
  BLOCKOUT_COLOURS.adonisb2Gear,
  1.28,
);
// **His gloves carry no green, and that is a decision rather than an
// omission.** The mockup pipes a hairline seam down the back of each glove and
// two builds tried to reproduce it. A glove is a ten-segment loft about 80 mm
// long, so the narrowest band its vertices can express spans a fifth of the
// circumference — which, since only one side of a glove is ever visible, is
// most of the visible face. Both attempts rendered as green mittens on a rider
// whose gloves are black in every reference, and a mark that cannot be made
// small is a mark that should not be made: at the distance the chase camera
// works at, the seam it is standing in for is under a pixel wide anyway.

/**
 * Is this point on the leg under the guard's shell?
 *
 * **The guard is a shell strapped to a black leg, not a green leg.** The first
 * build painted the whole limb green below the knee and every capture read it
 * as a sock: with no black behind it, nothing said *armour*, because armour is
 * only legible against the thing it is bolted to. Both references agree — the
 * calf and the inboard face are black in each, and the green stops at a hard
 * moulded edge.
 *
 * The arc runs from a little inboard of straight ahead, across the front, and
 * round the outboard flank until it is a good way toward the back of the leg.
 * It is deliberately lopsided, and the capture that set it is the *chase* one:
 * a mask that stopped at the flank left him reading as a black rider with a
 * green helmet from the only angle the game shows for most of a run, because
 * from behind the player sees the outboard side of both legs and almost none
 * of the front. The reference's shell wraps that far too — what stays black is
 * the inboard face and the back of the calf.
 *
 * Angles are measured on the limb's own axes, so `side` is what makes outboard
 * outboard — a mask that did not know its side would armour one leg's calf.
 */
function underAdonisb2Guard(x: number, z: number, side: number): boolean {
  const angle = Math.atan2(side * x, z);
  return angle > -0.55 && angle < 2.30;
}

/**
 * Trousers, except where the guard's upper wing covers the lower thigh.
 *
 * The green survives only under the shell; everything the shell does not cover
 * is painted down to exactly the seat's black.
 */
function paintAdonisb2Thigh(geometry: THREE.BufferGeometry, side: number): void {
  const top = -RIDER_BLOCKOUT.thighLength * ADONISB2_GUARD_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const under = underAdonisb2Guard(position.getX(i), position.getZ(i), side);
    const tint = !under || y > top
      ? ADONISB2_TROUSER_TINT
      : y <= ADONISB2_CUP_TOP
        ? ADONISB2_CUP_TINT
        : null;
    if (tint !== null) colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The shin: guard-green under the shell, trouser-black behind it, and the
 * boot's shaft all the way round below `ADONISB2_BOOT_TOP`.
 *
 * The photograph's vent slots were painted here once and removed on the
 * capture: the proud plate patch covers the whole front channel they lived in,
 * so the paint could never show — the moulded read is the plate's, the vents'
 * and the straps'.
 */
function paintAdonisb2Shin(geometry: THREE.BufferGeometry, side: number): void {
  const cuff = -RIDER_BLOCKOUT.shinLength * ADONISB2_BOOT_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const tint = y < cuff
      ? ADONISB2_CUFF_TINT
      : !underAdonisb2Guard(position.getX(i), position.getZ(i), side)
        ? ADONISB2_TROUSER_TINT
        : y > ADONISB2_CUP_BOTTOM
          ? ADONISB2_CUP_TINT
          : null;
    if (tint !== null) colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** Ankle band, toe cap and instep strap — the boot grammar M19 established. */
function paintAdonisb2Boot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    const ankleBand = t > 0.62 && t < 0.82;
    const toeCap = t < 0.34 && z > 0.055;
    const instepStrap = t > 0.38 && t < 0.52 && z > 0.02;
    if (ankleBand || toeCap || instepStrap) {
      colour.setXYZ(
        i,
        ADONISB2_BOOT_PANEL_TINT[0],
        ADONISB2_BOOT_PANEL_TINT[1],
        ADONISB2_BOOT_PANEL_TINT[2],
      );
    }
  }
}

/**
 * The helmet shell at a height: the ring anything decorating it must sit on.
 *
 * `docs/LESSONS_LEARNED.md` carries the entry this exists to obey — geometry
 * that decorates a curved shell must *compute* the shell, not estimate it.
 * Two capture rounds of the first build went on stripes tabulated by eye
 * against a dome they turned out not to be on, surfacing as dashes wherever
 * they happened to break through. Nothing below carries a hand-picked offset
 * any more: every ring asks the profile where the surface is and steps a
 * stated few millimetres outside it.
 */
function adonisb2ShellRing(y: number): LoftProfile[number] {
  const first = HELMET[0]!;
  const last = HELMET[HELMET.length - 1]!;
  if (y <= first.y) return first;
  if (y >= last.y) return last;
  let lower = first;
  let upper = last;
  for (let i = 1; i < HELMET.length; i += 1) {
    if (HELMET[i]!.y < y) continue;
    lower = HELMET[i - 1]!;
    upper = HELMET[i]!;
    break;
  }
  const f = (y - lower.y) / (upper.y - lower.y);
  const blend = (a: number, b: number): number => a + (b - a) * f;
  return {
    y,
    halfWidth: blend(lower.halfWidth, upper.halfWidth),
    halfDepth: blend(lower.halfDepth, upper.halfDepth),
    x: blend(lower.x, upper.x),
    z: blend(lower.z, upper.z),
    square: blend(lower.square, upper.square),
  };
}

/**
 * How far forward (`sign` +1) or back (−1) the shell reaches at a height, at a
 * lateral offset from its midline — the section `|x/w|^s + |z/d|^s = 1` solved
 * for z. A crown stripe set beside the midline needs this and not the plain
 * half-depth: the front face is only the front face *at* x = 0.
 */
function adonisb2ShellDepth(y: number, x: number, sign: number): number {
  const ring = adonisb2ShellRing(y);
  if (ring.halfWidth <= 0) return ring.z;
  const t = Math.min(1, Math.abs(x - ring.x) / ring.halfWidth);
  return ring.z + sign * ring.halfDepth * (1 - t ** ring.square) ** (1 / ring.square);
}

/** The same section solved for x: how far out the flank reaches at a depth. */
function adonisb2ShellWidth(y: number, z: number): number {
  const ring = adonisb2ShellRing(y);
  if (ring.halfDepth <= 0) return ring.halfWidth;
  const t = Math.min(1, Math.abs(z - ring.z) / ring.halfDepth);
  return ring.halfWidth * (1 - t ** ring.square) ** (1 / ring.square);
}

/**
 * The helmet's green striping, as one merged extra on the neck joint.
 *
 * The head's own patches are merged into the head mesh and can only *shade*
 * the black shell — a scalar cannot make green — and the face group already
 * carries the visor's material. So the striping is what `RiderExtra` exists
 * for: real geometry in the accent material, following the shell.
 *
 * Three families, all from the reference: a tight triple running brow-to-nape
 * over the crown; four long swept stripes on each cheek, the mark both
 * references carry beside the chin bar; and a band down the centre of the chin
 * itself. Everything stands a few millimetres off whatever surface it
 * decorates — the shell, or the head patch already lifted off it — because
 * M19's pivot boss taught what a proud tab on a helmet's silhouette reads as.
 */
function adonisb2HelmetStripes(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stripe = (rings: Parameters<typeof loftProfile>[0]): void => {
    parts.push(loftGeometry(loftProfile(rings), { radialSegments: 8 }));
  };

  // -- A triple over the crown ----------------------------------------------
  //
  // Three lanes, not the first build's two, and bundled close to the midline:
  // that is what the reference wears. Each lane's lateral offset is a
  // *fraction of the shell's own half-width* at its height, so the three
  // converge toward the apex the way lines of longitude do — a fixed offset
  // walks off a narrowing dome, which is half of what buried the first build.
  //
  // Clearances rise where a head patch is already lifted off the shell: the
  // brow step is 11 mm proud, so a stripe crossing it at the 3 mm the open
  // dome needs would run underneath it and disappear exactly where the
  // reference's stripes are most visible.
  const CROWN_FRONT: ReadonlyArray<readonly [number, number]> = [
    [0.244, 0.015], [0.254, 0.015], [0.266, 0.009],
    [0.282, 0.005], [0.300, 0.003], [0.318, 0.003], [0.3335, 0.003],
  ];
  const CROWN_REAR: ReadonlyArray<readonly [number, number]> = [
    [0.3335, 0.003], [0.320, 0.003], [0.302, 0.003],
    [0.280, 0.003], [0.254, 0.004], [0.228, 0.008], [0.206, 0.015],
  ];
  for (const lane of [-1, 0, 1]) {
    const ringAt = ([y, clear]: readonly [number, number], sign: number, taper: number) => {
      const x = lane * 0.26 * adonisb2ShellRing(y).halfWidth;
      return {
        y,
        halfWidth: 0.0075 * taper,
        halfDepth: 0.005,
        square: 2.6,
        x,
        z: adonisb2ShellDepth(y, x, sign) + sign * clear,
      };
    };
    // The one ring both halves share, sitting just clear of the closed apex.
    // The first build ended each half on the shell's own face at the top,
    // which left 50 mm of bald crown between the two sets of tips — a gap
    // right where a crown stripe is a crown stripe. The lanes are nudged apart
    // here so three tips meet without three coincident solids.
    const apex = {
      y: 0.3495,
      halfWidth: 0.0055,
      halfDepth: 0.010,
      square: 2.6,
      x: lane * 0.005,
      z: 0,
    };
    stripe([...CROWN_FRONT.map((step, i) => ringAt(step, 1, i === 0 ? 0.7 : 1)), apex]);
    stripe([
      apex,
      ...CROWN_REAR.map((step, i) => ringAt(step, -1, i === CROWN_REAR.length - 1 ? 0.5 : 1)),
    ]);
  }

  // -- Four swept stripes per cheek -----------------------------------------
  //
  // The mark both references carry beside the chin bar: long thin lines
  // sweeping down and *forward*, from behind the temple to just outboard of
  // the chin. The first build made them three short dashes centred at z 0.020,
  // which is the back of the cheek — the head capture read them as tally marks
  // behind the ear, and the front capture did not see them at all.
  //
  // Each ring sits on the flank the shell actually presents at that height and
  // depth, which is what lets a line cross a curving cheek without either end
  // lifting off. The front ends stop short of ±0.70 rad, where the chin-bar
  // patch's own 15 mm lift begins.
  for (const side of [-1, 1]) {
    for (let lane = 0; lane < 4; lane += 1) {
      const rings = [];
      for (let step = 0; step <= 3; step += 1) {
        const t = step / 3;
        const y = 0.163 - lane * 0.009 - t * 0.024;
        // Starting at the temple, not behind it: at z 0.016 the run began on
        // the widest part of the shell, where the head capture caught four
        // proud tips serrating the silhouette from *behind* — the mark is a
        // cheek mark, so it starts where the cheek does.
        const z = 0.032 + t * 0.060;
        rings.push({
          y,
          halfWidth: 0.004,
          halfDepth: 0.0085,
          square: 2.6,
          x: side * (adonisb2ShellWidth(y, z) + 0.002),
          z,
        });
      }
      stripe(rings);
    }
  }

  // -- The chin band --------------------------------------------------------
  //
  // Down the chin bar, not across it: the reference's mark runs the length of
  // the chin, and the first build's short horizontal dash read as a smudge.
  // Its z clears the chin-bar *patch* (lift 0.015 over the shell) rather than
  // the bare shell — the first build anchored to the shell and the patch
  // swallowed it whole.
  stripe(([[0.102, 0.013], [0.118, 0.015], [0.134, 0.015], [0.149, 0.013]] as const)
    .map(([y, clear], i) => ({
      y,
      // Narrow. The pass before this ran 36 mm across a chin bar barely three
      // times that wide and stood it 18 mm off the shell, which the front
      // capture read as a green blob stuck to his jaw rather than as a band
      // moulded into it.
      halfWidth: i === 0 || i === 3 ? 0.009 : 0.012,
      halfDepth: 0.005,
      square: 3.0,
      z: adonisb2ShellDepth(y, 0, 1) + clear,
    })));

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

export const ADONISB2_LOOK: RiderLook = Object.freeze({
  id: 'adonisb2' as CharacterId,
  materials: Object.freeze({
    body: ADONISB2_SUIT,
    // One black garment, jacket and sleeves — the same dedup Cool Rider's is.
    limbs: ADONISB2_SUIT,
    accent: ADONISB2_GUARD,
    head: Object.freeze({
      colour: BLOCKOUT_COLOURS.adonisb2Helmet,
      // Gloss, like Red Rider's lid and for his reason: the shell in the
      // photograph is the shiniest black he wears, and the chase camera looks
      // at the back of a head all day.
      roughness: 0.24,
      metalness: 0.05,
    }),
    face: Object.freeze({
      // The mirrored visor — pale where every other visor in this file is
      // dark, because *mirror* is the read the reference names. There is no
      // environment map, so this borrows the retroreflection approximation
      // Cool Rider's blue established: low roughness plus a small cool
      // emissive, which keeps the glass luminous in shade the way a real
      // mirror stays bright with the sky in it.
      colour: BLOCKOUT_COLOURS.adonisb2Visor,
      roughness: 0.06,
      metalness: 0.35,
      emissive: 0x2e3a46,
      emissiveIntensity: 0.40,
    }),
    gear: ADONISB2_GEAR,
  }),
  profiles: Object.freeze({
    torso: JACKET,
    seat: SEAT,
    thigh: ADONISB2_THIGH,
    shin: ADONISB2_SHIN,
    upperArm: UPPER_ARM,
    forearm: FOREARM,
    neck: NECK,
    head: HELMET,
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: GLOVE,
  }),
  // `seat` at 0.92 is load-bearing: `ADONISB2_TROUSER_TINT` paints the legs to
  // exactly suit × 0.92, so the trousers agree across the hip join. `legs` at
  // 1.0 because the legs' base *is* the green and the green is the identity.
  // The neck is the gear material darkened — a black gaiter, as Red Rider's is.
  // `neck` dropped with the gear material's rise: the gaiter under his chin is
  // the darkest thing he wears, and a scalar that read as black against the
  // old gear reads as pale grey against the new one.
  shades: Object.freeze({ seat: 0.92, legs: 1.0, collar: 1.12, sole: 0.62, neck: 0.40 }),
  parts: Object.freeze({
    hands: 'gear' as RiderMaterialRole,
    neck: 'gear' as RiderMaterialRole,
    kneePad: 'accent' as RiderMaterialRole,
    // The inversion, stated where it takes effect: his legs are built in the
    // green accent material and painted down to trousers, never black painted
    // up to green (§22.3 fact 4).
    legs: 'accent' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    collar: Object.freeze({
      anchor: 'front' as PatchAnchor,
      u0: 0,
      u1: Math.PI * 2,
      from: 0.502,
      to: 0.545,
      uSegments: 20,
      vSegments: 2,
      lift: 0.011,
      shade: 1.12,
    }),
    // The backpack and its shoulder routes — the casting group, because the
    // pack is the one thing that changes his outline (rule 3). The wrap
    // patches are Red Rider's proven shoulder arch, re-rolled in black gear.
    shoulders: Object.freeze({
      role: 'gear' as RiderMaterialRole,
      casts: true,
      patches: Object.freeze([
        // The pack body: the largest single piece of kit he wears after the
        // guards, high on the back between the shoulder blades. Narrower than
        // the first build's ±0.60 — at that span its top edge wrapped past
        // the shoulder curve and showed from the *front* as a mantle around
        // the neck — and prouder, because a backpack is a volume and the flat
        // first build repeated M19's back panel mistake in luggage form.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.46,
          u1: 0.46,
          from: 0.200,
          to: 0.452,
          uSegments: 6,
          vSegments: 5,
          lift: 0.050,
          taper: 0.26,
          shade: 0.98,
        }),
        // Its lid: a top compartment standing prouder and lighter, kept
        // strictly inside the body's span — the first build let its corners
        // reach past the body's top edge, and they stood off the shoulder
        // curve as floating tabs in every capture that saw them.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.36,
          u1: 0.36,
          from: 0.352,
          to: 0.440,
          uSegments: 4,
          vSegments: 3,
          lift: 0.060,
          taper: 0.32,
          shade: 1.10,
        }),
        // Rear half of each shoulder wrap: climbs from the pack to the crown.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -1.05,
          u1: 0.04,
          from: 0.405,
          to: 0.465,
          uSegments: 6,
          vSegments: 3,
          lift: 0.012,
          taper: 0.02,
          skewFrom: 0.440,
          skewTo: 0.400,
        }),
        // Front half: descends from the crown into the chest strap.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.04,
          u1: 1.05,
          from: 0.405,
          to: 0.465,
          uSegments: 6,
          vSegments: 3,
          lift: 0.012,
          taper: 0.02,
          skewFrom: 0.400,
          skewTo: 0.440,
        }),
        // Padding over each crown, standing proud of the strap beneath.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.42,
          u1: 0.42,
          from: 0.425,
          to: 0.492,
          uSegments: 4,
          vSegments: 3,
          lift: 0.019,
          taper: 0.26,
          shade: 1.10,
        }),
      ]),
    }),
    // The strap runs down the chest, the buckle housings, the zip and the
    // belt — flat on the jacket, so none of it casts.
    //
    // These shades used to run as high as 1.65 because the gear material was
    // authored *darker* than the suit and every piece of kit had to be lifted
    // back out of it one patch at a time. That was fixing the wrong thing, and
    // the owner's ride found what it missed: the pack and straps on his back,
    // where no shade was rescuing them, disappeared into the jacket entirely.
    // `adonisb2Gear` is a lighter material now and these multipliers describe
    // surfaces again — a strap slightly catching the light, a belt plate
    // brighter than its webbing.
    torso: Object.freeze({
      role: 'gear' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // Down to 0.170, not the first build's 0.262: a strap that stopped
        // mid-chest read as two dangling tabs, and the photograph's straps
        // run to his waist.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: 0.42,
          u1: 0.72,
          mirrored: true,
          from: 0.170,
          to: 0.438,
          uSegments: 3,
          vSegments: 6,
          lift: 0.010,
          taper: 0.02,
          shade: 1.12,
        }),
        // The buckle housing on each strap. A mirrored pair, because that is
        // what the mockup wears: an intermediate pass followed the photograph
        // here instead and built two differently sized units, which reads as
        // damage rather than as kit at the distance the game is played at.
        // Their green faces live in the `waist` group below; these bodies
        // share the strap's gear material and add only triangles.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: 0.42,
          u1: 0.68,
          mirrored: true,
          from: 0.286,
          to: 0.370,
          uSegments: 3,
          vSegments: 3,
          lift: 0.017,
          taper: 0.16,
          shade: 1.06,
        }),
        // The zip, down the centre of the jacket. One narrow raised placket:
        // the mockup's strongest bit of jacket structure, and the reason its
        // chest reads as a garment rather than as a black volume with straps
        // laid over it.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.055,
          u1: 0.055,
          from: 0.075,
          to: 0.470,
          uSegments: 1,
          vSegments: 8,
          lift: 0.006,
          taper: 0.10,
          shade: 1.06,
        }),
        // The waist belt and its plate. Dropped from the first build on the
        // grounds that the photograph does not show one; the mockup does, and
        // it is what ends the jacket — without it the black torso runs into
        // the black trousers and the figure loses its waist from every angle
        // except the one the guards are lit from.
        //
        // A full loop, and safe as one for the reason `ADONISB2_GUARD` is
        // matte: M19's white-line lesson is about a band bright enough to find
        // the sun's mirror angle. This is near-black webbing at 0.62 roughness
        // and has nothing to clip.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: 0,
          u1: Math.PI * 2,
          from: 0.012,
          to: 0.062,
          uSegments: 20,
          vSegments: 1,
          lift: 0.010,
          shade: 1.02,
        }),
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.20,
          u1: 0.20,
          from: 0.008,
          to: 0.066,
          uSegments: 3,
          vSegments: 2,
          lift: 0.018,
          taper: 0.30,
          shade: 1.24,
        }),
      ]),
    }),
    // The green face of each chest buckle — the mockup's one green mark above
    // the waist, and the only thing that carries his colour on the upper body
    // from the front. It is a *material* choice and not a shade: the housings
    // it sits on are near-black gear, and no scalar multiplier on near-black
    // makes green (the same argument `parts.neck` records for Red Rider's
    // gaiter, one colour over).
    waist: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: 0.46,
          u1: 0.64,
          mirrored: true,
          from: 0.298,
          to: 0.340,
          uSegments: 2,
          vSegments: 2,
          lift: 0.023,
          taper: 0.14,
          shade: 1.04,
        }),
      ]),
    }),
    // The upper half of the knee guard, on the thigh — see
    // `RiderLook.panels.thighPad` for why it cannot live with the rest of the
    // guard. The reference's shell covers the lower third of the thigh, wraps
    // wider than the leg, and carries the guard's largest pivot; without it
    // the green starts at the knee and the whole assembly reads as a sock
    // rather than as armour spanning a joint.
    thighPad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // The flared shell itself, wider than the leg it is strapped to, and
        // lopsided outboard for the reason `underAdonisb2Guard` records: the
        // chase camera is behind him.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.60,
          u1: 1.90,
          mirrored: true,
          from: -0.400,
          to: -0.274,
          uSegments: 8,
          vSegments: 5,
          // Proud enough to change the leg's outline, which is the property
          // the reference guard has and a painted band never will: measured
          // against the capture, the green mass the chase camera sees is
          // almost all silhouette, so a shell that only hugs the leg reads as
          // a stripe from behind no matter how far round it is painted.
          lift: 0.020,
          taper: 0.30,
          shade: 1.06,
        }),
        // **The upper half of the black knee cup.** In the photograph the cup
        // is a dark dome sitting *on* the joint with green wrapped round it,
        // and the first build put the whole cup below the knee — which is why
        // the owner's ride reported the knee pads "down to the shins": a cup
        // entirely on the shin is not a knee pad, it is a shin pad, and no
        // amount of green above it says otherwise. The cup is therefore split
        // across the joint, half here and half on the shin. The two halves
        // hinge, and that is safe because they meet on the *front* of the
        // knee: a bend closes them into each other rather than opening a gap,
        // and both halves are the same near-black.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          // As wide as the wing above it, so the cup is a complete dark ring
          // at knee height rather than a dark face with green shoulders that
          // meet across the hinge.
          u0: -0.60,
          u1: 1.90,
          mirrored: true,
          from: -0.400,
          to: ADONISB2_CUP_TOP,
          uSegments: 7,
          vSegments: 2,
          lift: 0.030,
          taper: 0.30,
          shade: 0.10,
        }),
        // **No strap crosses the guard.** There was a dark full loop here and
        // another below the cup, and together they did something neither did
        // alone: a full loop is a closed black ring, so two of them cut the
        // guard's green into an isolated slice with black above and black
        // below. The owner's ride named it — "there is no sandwich of blacks
        // sandwiching a green" in either reference — and he is right about
        // why. In the photograph the webbing runs *down* the side of the
        // guard, not across its face, so the green stays one connected shape
        // and the black cup sits in it as an island. Any strap added here
        // later has to run lengthwise or stay off the green entirely.
        //
        // The guard's big outboard pivot, the mechanical circle the reference
        // wears at the top of the wing.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.24,
          u1: 0.24,
          from: -0.360,
          to: -0.320,
          uSegments: 4,
          vSegments: 2,
          lift: 0.024,
          taper: 0.78,
          shade: 0.18,
        }),
      ]),
    }),
    // **The whole knee-and-shin guard**, Red Rider's proven anatomy in the
    // inverse palette: the shin mesh beneath is already guard-green, so the
    // proud geometry carries only what catches light — the dark knee cap, the
    // strap loops, and the long moulded plate.
    kneePad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // A flared green carrier around the black cap. The reference's guard
        // is much wider than the trouser leg at the knee; leaving the cap on
        // the bare shin profile made it read as a painted sleeve.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.62,
          u1: 1.95,
          mirrored: true,
          // **It starts below the cup, not at the joint.** It used to run to
          // −0.002, two millimetres under the knee, and its bright top edge
          // was what showed through the hinge — a thin green line with black
          // above and black below, which is the defect the owner circled. A
          // collar that flares the guard does not need to reach the joint to
          // do it, and reaching the joint is the one thing that could put
          // green there.
          from: -0.150,
          to: ADONISB2_CUP_BOTTOM,
          uSegments: 8,
          vSegments: 2,
          lift: 0.016,
          taper: 0.20,
          shade: 1.06,
        }),
        // The knee cap: the one *dark* piece of the guard, exactly as the
        // photograph wears it — a black cup in a green surround. Shade does
        // the darkening; at 0.10 the green base reads as near-black moulding.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.62,
          u1: 1.95,
          mirrored: true,
          // The cup's lower lip. It carries the proud form across the hinge so
          // the cup does not end in a step at the joint; the depth it used to
          // have below the knee is the plate's now.
          from: ADONISB2_CUP_BOTTOM,
          to: 0.000,
          uSegments: 8,
          vSegments: 1,
          lift: 0.030,
          taper: 0.28,
          shade: 0.10,
        }),
        // The strap that used to sit under the cup is gone — see the thigh
        // group for the argument. It was the lower half of the sandwich.
        //
        // The long green plate down the shin. The first pass called a 108 mm
        // patch "long" while the photograph's moulded plate covers most of
        // the shin; it left a smooth green tube below the knee. This one runs
        // nearly to the boot and stays narrow enough that its lower corners
        // cannot float off the tapering leg.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.55,
          u1: 1.45,
          mirrored: true,
          // It stops where the boot shaft starts. It used to run to −0.305,
          // 80% of the way down the shin, which left the guard lapping over
          // the top of the footwear — the other half of the owner's "down to
          // the shins" report, and the reason the boots read as shoes: there
          // was no boot above the ankle to see.
          // Butted against the cup's lower edge, so the guard reads as one
          // moulding with a dark cup set into it rather than as parts.
          from: -0.252,
          to: ADONISB2_CUP_BOTTOM,
          uSegments: 7,
          vSegments: 7,
          lift: 0.019,
          taper: 0.42,
          shade: 1.08,
        }),
        // The vent ladder — the guard's largest surface detail in both
        // references, and the thing that says *moulded plastic* rather than
        // *painted tube*. Dark lifted insets keep the perforated read without
        // holes, textures, or another material.
        //
        // A staggered single column stepping outboard as it descends, which is
        // how the mockup's slots run; the pass before this one used three
        // symmetric pairs down the centre line and they read, at any distance
        // the game is played at, as a smudge rather than as louvres. `mirrored`
        // is what makes the stagger lean away from the centre on *both* legs
        // instead of leaning the same way in world space on each.
        ...[0.16, 0.24, 0.32, 0.40, 0.48].map((centre, i) => {
          const from = -0.128 - i * 0.0245;
          return Object.freeze({
            anchor: 'front' as PatchAnchor,
            u0: centre - 0.22,
            u1: centre + 0.22,
            mirrored: true,
            from,
            to: from + 0.016,
            uSegments: 2,
            vSegments: 1,
            lift: 0.023,
            taper: 0.46,
            shade: 0.10,
          });
        }),
        // The two pivot bosses on the outer edge — large mechanical circles in
        // the photograph, approximated as tapered low-poly pads in the
        // existing guard mesh.
        //
        // **Dark pads on the green plate, not green pads on the dark cup.**
        // They were authored bright and sat at cup height, which put a green
        // island in the middle of the black — the thing the owner circled, and
        // the last of his "blacks sandwiching a green". The photograph has it
        // the other way round: the pivots are the dark hardware and the guard
        // around them is the green. Moving them down onto the plate is what
        // makes that reading available at all, since a dark boss inside a dark
        // cup is nothing.
        //
        // Three millimetres proud of the plate and no more, with the edges
        // pulled hard: the carve capture caught these standing far enough off
        // the guard to read as tabs snagged on its rim, which is M19's helmet
        // pivot in a second place.
        ...[-0.104, -0.148].map((from) => Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.24,
          u1: 0.24,
          from,
          to: from + 0.028,
          uSegments: 4,
          vSegments: 2,
          lift: 0.024,
          taper: 0.78,
          shade: 0.18,
        })),
        // Its lower strap, holding the plate to the shin at the boot's collar.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -Math.PI,
          u1: Math.PI,
          from: -0.268,
          to: -0.248,
          uSegments: 14,
          vSegments: 1,
          lift: 0.022,
          taper: 0.28,
          shade: 0.16,
        }),
      ]),
    }),
    // The same four patches every full-face lid in this file wears, shaded
    // for a black shell: the chin bar and brow step down toward the visor,
    // the spoiler sits near the shell, and the base rim steps up so the
    // helmet ends somewhere. No chin vents — the wing stripes own the cheeks.
    head: Object.freeze([
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.70,
        u1: 0.70,
        from: 0.098,
        to: 0.152,
        uSegments: 6,
        vSegments: 3,
        lift: 0.015,
        taper: 0.42,
        shade: 0.86,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.86,
        u1: 0.86,
        from: 0.236,
        to: 0.256,
        uSegments: 7,
        vSegments: 1,
        lift: 0.011,
        taper: 0.3,
        shade: 0.80,
      }),
      Object.freeze({
        anchor: 'back' as PatchAnchor,
        u0: -0.78,
        u1: 0.78,
        from: 0.150,
        to: 0.206,
        uSegments: 8,
        vSegments: 3,
        lift: 0.012,
        taper: 0.62,
        shade: 1.04,
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0,
        u1: Math.PI * 2,
        from: 0.090,
        to: 0.113,
        uSegments: 18,
        vSegments: 1,
        lift: 0.004,
        shade: 1.08,
      }),
    ]),
    // The big wrapping shield, Red Rider's span: at ±1.05 rad it turns the
    // corner of the shell, which is what makes it glass around a face rather
    // than a letterbox — and on this rider it is the *pale* thing on a black
    // head, the single strongest identity cue the photograph has.
    face: Object.freeze({
      role: 'face' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -1.05,
          u1: 1.05,
          // Down to the chin bar rather than stopping short of it. The chin
          // patch is lifted further than this one, so it overlaps the shield's
          // lower edge from in front — which is how a chin bar meets a visor.
          from: 0.150,
          to: 0.246,
          uSegments: 12,
          vSegments: 4,
          lift: 0.007,
          sink: -0.014,
          taper: 0.18,
        }),
        // **A mirror blaze was tried here and removed on the owner's ride.**
        // The mockup's visor carries a hard bright streak, and with one sun
        // and no environment map the only way to have one from every heading
        // is to author it as a second, brighter patch. It worked as a picture
        // and failed as a game object: at this polygon count a hard-edged
        // white rectangle sitting on a face does not read as a reflection, it
        // reads as a sticking plaster — the owner's word for it was "that
        // bandaid white square thing". A fake highlight needs enough
        // surrounding detail to be read as light rather than as paint, and
        // this rider's head does not have it. The shield is one value again.
      ]),
    }),
  }),
  extras: Object.freeze([
    Object.freeze({
      name: 'rider-helmet-stripes',
      joint: 'neck' as const,
      role: 'accent' as RiderMaterialRole,
      casts: false,
      build: adonisb2HelmetStripes,
    }),
  ]),
  paint: Object.freeze({
    thigh: paintAdonisb2Thigh,
    shin: paintAdonisb2Shin,
    boot: paintAdonisb2Boot,
  }),
  // A touch of splay so the pack's silhouette stays open behind the arms;
  // otherwise Cool Rider's carriage — the photograph stands relaxed.
  armCarriage: Object.freeze({ splay: 0.012, rise: 0 }),
});

export const RIDER_LOOKS: readonly RiderLook[] = Object.freeze([
  COOL_RIDER_LOOK,
  TROLLINA_LOOK,
  RED_RIDER_LOOK,
  ADONISB2_LOOK,
  COP_LOOK,
]);

/**
 * The looks a *player* can be wearing — M18.
 *
 * Its own list because the render budget asks two different questions of these
 * tables. "Which rig might the player's own be" is answered by this one, and
 * measuring the cop as a candidate player rig would measure a cheaper rig and
 * quietly under-reserve nothing at all; "which looks exist" is `RIDER_LOOKS`,
 * and the cop is in it because he has to be built.
 */
export const PLAYABLE_RIDER_LOOKS: readonly RiderLook[] = Object.freeze([
  COOL_RIDER_LOOK,
  TROLLINA_LOOK,
  RED_RIDER_LOOK,
  ADONISB2_LOOK,
]);

/** Resolve a look, falling back to Cool Rider the way `characterSpec` does. */
export function riderLook(id: CharacterId): RiderLook {
  return RIDER_LOOKS.find((look) => look.id === id) ?? COOL_RIDER_LOOK;
}
