/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.ts';
import type { CharacterId } from '../data/riders.ts';
import {
  limbProfile,
  loftGeometry,
  loftProfile,
  mergeGeometries,
  type LoftProfile,
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
    readonly kneePad?: RiderPanelGroup;
    /** Merged into the head mesh: chin bar, brow, spoiler, rim — or none. */
    readonly head: readonly RiderPatch[];
    /** The aperture: one visor, or two eyes. */
    readonly face?: RiderPanelGroup;
  };

  readonly extras: readonly RiderExtra[];

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

export const RIDER_LOOKS: readonly RiderLook[] = Object.freeze([COOL_RIDER_LOOK, TROLLINA_LOOK]);

/** Resolve a look, falling back to Cool Rider the way `characterSpec` does. */
export function riderLook(id: CharacterId): RiderLook {
  return RIDER_LOOKS.find((look) => look.id === id) ?? COOL_RIDER_LOOK;
}
