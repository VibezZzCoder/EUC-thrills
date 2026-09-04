/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.ts';
import type { CharacterId } from '../data/riders.ts';
import {
  limbProfile,
  loftGeometry,
  loftNormal,
  loftPoint,
  loftProfile,
  mergeGeometries,
  shaded,
  tintOver,
  vAtHeight,
  type LoftProfile,
  type LoftRing,
  type Tint,
  type UvRect,
} from './blockoutKit.ts';
import { ATLAS_REGIONS, createMaribelAtlas, type AtlasRegionName } from './maribelAtlas.ts';
import {
  WIM_REGIONS,
  createWimAtlas,
  type WimRegionName,
  type WimSheetLayout,
} from './wimAtlas.ts';
import {
  DRUNKARD_REGIONS,
  KIT_LABEL,
  KIT_PEAK,
  KIT_PLAIN,
  KIT_STRAP,
  PACK_PLAIN,
  createDrunkardAtlas,
  handCanPageS,
  hatFoamEdge,
  type DrunkardRegionName,
  type DrunkardSheetLayout,
  type PageRect,
} from './drunkardAtlas.ts';

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
  /** Swell the band's height toward its middle — see `PatchOptions.bulge`. */
  readonly bulge?: number;
  /** Slide the band's centre line at its middle — see `PatchOptions.bow`. */
  readonly bow?: number;
  /**
   * Shear the height span diagonally across the angular span, expressed as the
   * two heights the shear runs between so it reads in metres like everything
   * else here. Positive `skewFrom` above `skewTo` drops the outer end.
   */
  readonly skewFrom?: number;
  readonly skewTo?: number;
  readonly shade?: number;
  /**
   * Which page of the look's atlas this panel's own square lands on — M23.
   *
   * **A patch is the right primitive for a printed graphic**, and it took the
   * rejection of Phase A1 to see it. A patch already has its own texture
   * square, its own crisp geometric edge, and a rim that keeps it opaque over
   * whatever it lies on; a body loft has none of those and shares its surface
   * with everything else the garment carries. So a chest print, a leg script
   * and a knee device are patches wearing art, and the body underneath keeps
   * doing what vertex paint is good at.
   *
   * A patch with no `art` in a look that has an atlas is mapped to the blank
   * page, which multiplies by one. That is deliberate and not a default worth
   * skipping: geometry that kept its own unit square would sample the *whole*
   * sheet and wear every other part's graphics smeared across it.
   */
  readonly art?: string;
  /**
   * Restrict the art to one side, +1 left or −1 right; the other side gets the
   * blank page and the same geometry.
   *
   * For a mark that exists once on a person. Her leg script runs down one
   * thigh in the reference, as a leg script does, and a look with no way to say
   * so would either print her name twice or not at all — the same asymmetry
   * problem `paint.upperArm` exists for, one layer up.
   */
  readonly artOn?: number;
  /**
   * The page the *other* side wears when `artOn` restricts the art.
   *
   * Needed, and the first capture is why. A printed patch sets `shade: 1` so
   * its pale material can be inked down; the blank page multiplies by one; so
   * an unpaged printed patch renders as the **pale base itself** — her left
   * thigh came back wearing a white plate where her right wears her name. The
   * unprinted twin needs a page that is plain leather, not a page that is
   * nothing.
   */
  readonly artElse?: string;
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
  /** Its page of the look's atlas, as on `RiderPatch.art`. */
  readonly art?: string;
  /**
   * Hang it from a node that answers to gravity instead of bolting it to the
   * joint — M23, and the owner's ride is what forced it.
   *
   * A mass on the neck rotates *with* the neck, so a rider who folds forty
   * degrees over the wheel folds their hair into their own shoulder blades,
   * and a rider who looks into a corner sweeps it through the shoulder on
   * that side. Both were reported as the hair "sinking inside the body". No
   * amount of reshaping fixes it, because the defect is in the frame rather
   * than the silhouette: real hair keeps hanging where it was while the body
   * moves out from under it.
   *
   * So an extra that sets this gets a pivot between it and the joint, and
   * `render/rider.ts` gives that pivot back most of the body's own rotation —
   * see `RIDER_BLOCKOUT.hairFollow*`. Anything rigid (armour) leaves it unset
   * and is parented exactly as before.
   */
  readonly sways?: boolean;
  build(): THREE.BufferGeometry;
}

// -- The look ----------------------------------------------------------------

/**
 * A look's own printed sheet — M23 Phase A1b.
 *
 * **A texture costs triangles' worth of nothing and meshes' worth of nothing.**
 * The budget this project cannot spend is draw calls; a `map` on a material
 * that is already being drawn adds none, which is why a rider could carry
 * printed graphics at any point in the last twenty milestones and nobody
 * noticed. What it does cost is memory and a build, and both are paid once.
 *
 * The mechanism is deliberately narrow. A look names which **material roles**
 * sample the sheet, and every geometry drawn in one of those materials is
 * folded onto a named page before it is merged (`blockoutKit.mapUvInto`).
 * Everything else in the rig is untouched, so a look can print on its decals
 * without putting a texture lookup on its whole body — and a look with no
 * atlas at all, which is every look but hers, builds exactly as it did.
 */
/** A loft's page: one name, or one per side for a limb whose two sides differ. */
export type LoftPage = string | ((side: number) => string);

export interface RiderAtlas {
  /**
   * One texture per rig, over pixels the module memoises.
   *
   * Per *rig* rather than per look, because `render/rider.ts` disposes what it
   * builds and a shared texture would be freed under the ghost the moment the
   * player changed character. Per *pixels* rather than per texture, because
   * painting a million texels twice for the same sheet would be a stutter on a
   * character swap in exchange for nothing.
   */
  build(): THREE.Texture;
  /** Which materials carry the map. Anything else in the rig is unmapped. */
  readonly roles: readonly RiderMaterialRole[];
  /**
   * Where a named page sits on the sheet. An unknown name — including the
   * absence of one — must return the blank page rather than throw: a part that
   * forgot to name its art should render as though the atlas were not there,
   * not take the rig down.
   */
  region(art: string | undefined): UvRect;
  /**
   * The page each **body loft** lands on, when its material samples the sheet
   * — M28, and the second thing a rider can be printed on.
   *
   * Maribel's sheet reaches her through patches and extras only: her suit is
   * black leather and every mark on it rides a patch, so the lofts under them
   * were never mapped. Wheel in Motion's jersey is the other case — two
   * saturated hues *are* the garment, blue and yellow over the whole torso and
   * both sleeves — and a field that size is a loft's job, not a patch's. So a
   * look may name a page for a loft, and `render/rider.ts` folds the loft's
   * own square (`u` right round the body from the rider's left, `v` up the
   * rings) onto it, built with `splitSeam` so the page wraps instead of
   * reversing inside the last facet.
   *
   * A loft in a mapped material with no page named here lands on the blank
   * page, exactly as an unpaged patch does: it renders as its vertex colours
   * say and cannot sample the whole sheet. `wheelInMotion.test.ts` asserts
   * the fold for every mesh, as `maribel.test.ts` does for hers.
   */
  readonly lofts?: {
    readonly torso?: string;
    readonly seat?: string;
    /** A limb's page may differ by side (+1 left, −1 right): his sleeves do. */
    readonly upperArm?: LoftPage;
    readonly forearm?: LoftPage;
    readonly thigh?: LoftPage;
    readonly shin?: LoftPage;
    readonly neck?: string;
    readonly head?: string;
    readonly hand?: LoftPage;
  };
}

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

  /**
   * How many sections each lofted part is built from — M23 Phase A1b.
   *
   * **The one axis this project has always had room on.** `render/rider.ts`
   * has built every rider at the same densities since M7 (14 around a limb, 24
   * around a torso, 20 around a head), which was right while the budget's
   * scarce axis was draw calls and the abundant one was triangles nobody had a
   * use for. Maribel is the first look with a use for them: the owner waived
   * her mesh-parity target outright — *"break the graphics budget… Her looking
   * good is priority one"* — and density is where that permission is spent,
   * because a section costs triangles and a *mesh* costs calls.
   *
   * Omitted entirely by every look before hers, and the defaults are the
   * numbers the rig has always used, so nothing else moves.
   */
  readonly density?: {
    readonly limb?: number;
    readonly torso?: number;
    readonly head?: number;
    readonly boot?: number;
    readonly hand?: number;
    readonly neck?: number;
  };

  /**
   * Extra lofts merged into a part's own mesh, built per side — A1d.
   *
   * **The channel that exists because a hand is not one tube.** Everything a
   * look could add to a limb until now was either a patch (which offsets the
   * surface outward and so can raise a pad but never cut a crease) or paint
   * (which cannot change a silhouette at all). A thumb is neither: it is a
   * second volume leaving the palm at an angle, and the crease between two
   * fingers is where two volumes intersect.
   *
   * Merging rather than parenting is what makes it free. The parts land in the
   * mesh the part already draws, so a hand with a thumb and two finger lobes
   * is still one mesh and still the same three draw calls, and the look's
   * paint hook — which runs after the merge — covers all of it.
   *
   * `side` is +1 for the rider's left, matching every other hook here.
   */
  readonly build?: {
    readonly hand?: readonly ((side: number) => THREE.BufferGeometry)[];
  };

  /** The look's printed sheet, if it has one. See `RiderAtlas`. */
  readonly atlas?: RiderAtlas;

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
    /**
     * The upper arm — M23, and the one slot Maribel's livery could not be
     * built without.
     *
     * Her identity is **asymmetric**: an aqua ring on her right bicep and a
     * coral one on her left. `panels.sleeve` is already built per side and
     * would place them, but a `RiderPanelGroup` names *one* material role for
     * both sides, so it can put the same colour on both arms and nothing
     * else. Two hues on two arms is a repaint or it is two more meshes, and
     * the repaint costs nothing.
     *
     * It is the same widening M19 made for the glove, one bone up, and it
     * arrives with `side` already meaningful — every painter has been handed
     * its side since M19, which is what makes an asymmetric mark expressible
     * at all.
     */
    readonly upperArm?: (geometry: THREE.BufferGeometry, side: number) => void;
    /**
     * The forearm — M23 Phase A1c, and the hook that a frame ceiling wrote.
     *
     * An earlier note here said there was deliberately no forearm hook
     * because nothing on the roster needed one. Maribel's elbow armour then
     * needed *something*: built as `panels.elbowPad` patches it cost two
     * draw calls, and the §9 measurement found the frame ceiling sitting at
     * exactly 150 with them in — the reserve had no headroom at all. So the
     * elbows became what Red Rider's boot panelling already is: paint. Same
     * grammar (a guard-dark field with one lighter moulded line), zero calls,
     * and the M19 rule again — the surface has no affordable slot left for
     * what has to go on it.
     */
    readonly forearm?: (geometry: THREE.BufferGeometry, side: number) => void;
    /**
     * The body — M23, and the only painter here that takes no side.
     *
     * **On a limb the side is an argument, because each limb is a fresh
     * geometry; on the body it is the vertex's own x, because the torso is one
     * mesh spanning both halves.** That difference is the whole signature.
     *
     * It exists for the same reason `hand` does — the surface has no panel
     * slot left for what has to go on it. The torso's four groups are spoken
     * for by Maribel's collar, her shoulder armour and her chest device, and
     * her suit still needs two more colours on it: the grey flank panels, and
     * the aqua-to-coral gradient across her chest that the reference carries
     * as a halftone of several hundred printed dots. A patch grid cannot draw
     * a gradient and a `shade` is a scalar that cannot change hue, so paint is
     * what is left — and paint is also the honest translation, since at
     * vertex resolution a halftone *is* a fade.
     *
     * The geometry handed over is the merged torso: the garment loft, whatever
     * `parts.seat` put inside it, and the collar patch. A painter that bands by
     * height sees all three, which is correct — a flank panel that stopped at
     * the hem would be a flank panel with a seam in it.
     */
    readonly torso?: (geometry: THREE.BufferGeometry) => void;
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

  /**
   * How this rider moves when the ride style moves them — M29 (`docs/PLANS.md`
   * §29.4). Absent on every look but the Drunkard's, and `render/rider.ts`
   * reads `look.motion ?? MOTION_STILL`, so a look with no table contributes
   * exactly nothing to any approved pose — the same shape `armCarriage` has,
   * and the rig never learns who it is posing. `riderLook.test.ts` asserts
   * the absence on everyone else (safeguard S5).
   */
  readonly motion?: RiderMotion;
}

/**
 * The amplitudes a ride style's channels are spent at — M29.
 *
 * The *controller* decides when and how much the body is asked to move
 * (`EucPose.styleSway`, gated by speed, air, wobble and crash); this table is
 * the look's answer in metres and radians. Every entry is a multiplier on a
 * channel that is zero for a sober seat, so a sober rider wearing this table
 * would still not move — and a drunk seat wearing a look without it does not
 * either, which is Phase 1's proof that the style is keyed to the seat and the
 * table to the look.
 */
export interface RiderMotion {
  /** The sway's pelvis roll into the weave, rad per unit of sway. */
  readonly swayPelvisRoll: number;
  /** The head's tilt with it, rad per unit of sway — the loll the chase camera sees first. */
  readonly swayHeadTilt: number;
  /** The low-side arm out and the high-side arm in, metres per unit of sway. */
  readonly swayArmSplay: number;
  /** A little fore-aft alternation of the hands with the sway, metres. */
  readonly swayArmSwing: number;
  /**
   * The stagger — his real wobble fought bigger and looser: multipliers on
   * the reactions the rig already has. 0 is Cool Rider's own bracing.
   */
  readonly staggerArms: number;
  readonly staggerHips: number;
  /** The head lolling into the wobble's swing, rad at full fight. */
  readonly staggerHeadLoll: number;
  /** The sip: head tilted back to the hat's tubes at rest, rad. */
  readonly sipNeckPitch: number;
  /**
   * The over-lean, 0..1: how much of the upper body's counter-roll in a carve
   * he forgets, so he leans *with* the wheel. Zero is a legal value.
   */
  readonly overLean: number;
}

/** No motion at all: every look's table but his, by omission. */
export const MOTION_STILL: RiderMotion = Object.freeze({
  swayPelvisRoll: 0,
  swayHeadTilt: 0,
  swayArmSplay: 0,
  swayArmSwing: 0,
  staggerArms: 0,
  staggerHips: 0,
  staggerHeadLoll: 0,
  sipNeckPitch: 0,
  overLean: 0,
});

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
  { y: -0.062, halfWidth: 2.410 * TROLLINA_HALF_WIDTH, halfDepth: 2.305 * TROLLINA_HALF_DEPTH, square: 3.45, z: 0.036 },
  // The hem lip: two close rings, so the skirt ends at an edge rather than
  // a taper — the same trick Cool Rider's jacket hem records.
  { y: -0.046, halfWidth: 2.329 * TROLLINA_HALF_WIDTH, halfDepth: 2.226 * TROLLINA_HALF_DEPTH, square: 3.38, z: 0.033 },
  { y: 0.008, halfWidth: 1.726 * TROLLINA_HALF_WIDTH, halfDepth: 1.629 * TROLLINA_HALF_DEPTH, square: 3.10, z: 0.024 },
  { y: 0.092, halfWidth: 1.190 * TROLLINA_HALF_WIDTH, halfDepth: 1.212 * TROLLINA_HALF_DEPTH, square: 2.68, z: 0.010 },
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
 * the jacket hem is at 10 mm with a 20 mm margin. M23's deeper hard-carve fold
 * moved that same corner back to the hem, so the seam now sits another 26 mm
 * down the thigh. It remains well above the first build's 0.78 boundary (which
 * read as a cuff below the knee), but restores the black-trouser buffer in the
 * new presentation channel too.
 */
const ADONISB2_GUARD_TOP = 0.750;

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
          // Shares the paint seam. Keeping this hard-coded at the old value
          // let the proud shell stay green above a correctly lowered limb.
          to: -RIDER_BLOCKOUT.thighLength * ADONISB2_GUARD_TOP,
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

// -- Maribel Vargas ----------------------------------------------------------
//
// M23 Phase A1, and the **third body vocabulary** this file carries. The owner's
// directive while the plan was being drafted is the whole reason it is a third
// and not a reuse: *"don't reuse trollina's body, maribel is a real woman not a
// caricature."* Trollina's proportions are a joke drawing made solid — a 0.74×
// cinched waist against 1.22× hips — and the brief for a real person asks for
// the opposite: *"recognizable adult female anatomy, not sexualization or
// caricature"* (§6).
//
// So the numbers below are an athlete's, read off her own photographs: shoulders
// a shade inside the men's, a waist at 0.78 against hips at 1.03 (a ratio of
// 0.76, where Trollina's is 0.61), a bust ring that leads the profile and does
// nothing else, and limbs slimmer than Cool Rider's but thicker than Trollina's
// — she is wearing armoured leather, not a party dress. **Every bone length is
// `RIDER_BLOCKOUT`'s, unchanged** (rule 1); all of this is ring radii.
//
// What reads as *her*, in the brief's own recognition order (§12): the adult
// female silhouette, a mirrored blue-cyan visor in a matte black shell, black
// leathers over mid-grey panels, **aqua on her right and coral on her left**,
// a white angular chest device, and — the owner's own memory of riding with her
// — a two-tone ponytail out the back of the lid.
//
// **The handedness is written down because a build cannot see it.** In the
// front photograph the aqua band is on her right arm and right ankle, the coral
// on her left. The brief's §9 "left-side accent: aqua" is the *viewer's* left.
// In world axes +X is the rider's left, so **aqua lives at −X and coral at +X**,
// and every painter below states which it is doing.

/** Where her boot's shaft ends on the shin, as a fraction from the knee. */
const MARIBEL_BOOT_TOP = 0.62;
/**
 * Where the accent cuff begins above it.
 *
 * **The band is at the boot's collar, not at the knee, and that is the
 * photographs overruling the render.** The AI render puts her aqua and coral
 * rings just above each knee; both real photographs put them at the top of the
 * boot, where the leather cuff meets the shaft. Brief §5 is explicit that a
 * photograph wins an argument with the render about an identifying detail
 * unless the owner approves the change, and nobody has. It lands mid-shin
 * rather than at the ankle because that is where the reference's boot collar
 * is — high enough to clear the wheel's shell in the chase view, which is the
 * one thing the ankle placement would have risked.
 */
const MARIBEL_CUFF_TOP = 0.46;
/** Where the knee guard's upper wing starts on the thigh. */
const MARIBEL_GUARD_TOP = 0.70;
/** The guard's dark cup, in each bone's own space — thigh side, then shin side. */
const MARIBEL_CUP_TOP = -0.352;
const MARIBEL_CUP_BOTTOM = -0.012;
/** The bicep ring, as fractions of the upper arm from the shoulder. */
const MARIBEL_BICEP_TOP = 0.20;
const MARIBEL_BICEP_BOTTOM = 0.40;

/**
 * Shades on the pale material, and **the arithmetic that the first capture
 * round got wrong.**
 *
 * A `shade` multiplies in **linear** space, and every intuition about "thirty
 * per cent of white" is an intuition about sRGB. The first pass shaded her
 * armour at 0.30 expecting near-black and rendered `#7a7a7c` — a mid grey — so
 * her speed hump came back as a pale shield across her shoulders, which the
 * chase capture made the loudest thing on the character. The conversion is
 * `linear(target) / linear(maribelMark)`, and these four constants are it,
 * applied once and named so a future patch cannot re-guess.
 *
 * **All four moved in Phase A1b, and none of them was re-picked.** The pale
 * base went up (`maribelMark` is now the printing ground and has to sit above
 * every ink) and the leather went down two stops, so the same four *targets*
 * now need different multipliers to land on. They are recomputed, not
 * re-guessed — which is the difference between a palette that was authored and
 * one that drifted:
 *
 *   0.027 → the suit's own near-black; a shell that reads by *relief*.
 *   0.095 → armour: a step above the leather, so an edge exists.
 *   0.378 → a moulded rim catching light along a guard's edge.
 *   1.00  → the printed pages, which carry their own values as ink.
 *
 * Everything the `accent` material carries is one of these, and none of them is
 * picked by eye. (A fourth constant — 0.222, `maribelPanel`'s own value — left
 * with the flat shoulder cups in A1c; the paint tints still reach that grey.)
 */
// **Derived, not typed** — A1d. This is the ratio that turns the pale accent
// base into her leather, and it was a hand-entered 0.027 that matched the suit
// as it was authored in A1b. When A1d lifted the suit out of near-black, every
// part that painted "leather" from the accent material — the aero hump most
// visibly — stayed at the old value and came back as a hole in her back.
// Reading it off the two colours means it can never disagree with them again.
const MARIBEL_LEATHER_SHADE = tintOver(
  BLOCKOUT_COLOURS.maribelMark,
  BLOCKOUT_COLOURS.maribelSuit,
)[0];
/** Guard-dark, held a fixed step under the leather rather than at a typed value. */
const MARIBEL_GUARD_SHADE = MARIBEL_LEATHER_SHADE * 2.4;
const MARIBEL_RIM_SHADE = 0.378;

/**
 * Her torso — twenty-seven rings, A1d.
 *
 * **The blockiness the owner kept naming was here, and it was not a section
 * count.** A1c had sixteen rings averaging 35 mm apart, and `blockoutKit`
 * interpolates between rings *linearly*: every span between two of them is a
 * straight cone in silhouette however many radial sections or `subdivisions`
 * are thrown at it. So the outline of her side was a chain of straight
 * segments, and no density setting could ever curve it. Rings are the only
 * axis that moves an outline; these are 21 mm apart.
 *
 * The flare is also front-loaded now. A ribcage leaves the waist fast and is
 * done by the sternum; A1c spread 34 mm of it over 274 mm as a seven-degree
 * cone, which is a funnel, not a woman.
 */
const MARIBEL_SUIT_TORSO = loftProfile([
  { y: -0.010, halfWidth: 1.060 * TORSO_HALF_WIDTH, halfDepth: 1.020 * TORSO_HALF_DEPTH, square: 2.55 },
  { y: 0.012, halfWidth: 1.025 * TORSO_HALF_WIDTH, halfDepth: 0.985 * TORSO_HALF_DEPTH, square: 2.52 },
  { y: 0.036, halfWidth: 0.965 * TORSO_HALF_WIDTH, halfDepth: 0.935 * TORSO_HALF_DEPTH, square: 2.48 },
  { y: 0.062, halfWidth: 0.900 * TORSO_HALF_WIDTH, halfDepth: 0.885 * TORSO_HALF_DEPTH, square: 2.44 },
  { y: 0.090, halfWidth: 0.845 * TORSO_HALF_WIDTH, halfDepth: 0.850 * TORSO_HALF_DEPTH, z: -0.002, square: 2.4 },
  { y: 0.118, halfWidth: 0.800 * TORSO_HALF_WIDTH, halfDepth: 0.820 * TORSO_HALF_DEPTH, z: -0.004, square: 2.36 },
  { y: 0.148, halfWidth: 0.755 * TORSO_HALF_WIDTH, halfDepth: 0.795 * TORSO_HALF_DEPTH, z: -0.005, square: 2.32 },
  { y: 0.168, halfWidth: 0.723 * TORSO_HALF_WIDTH, halfDepth: 0.780 * TORSO_HALF_DEPTH, z: -0.006, square: 2.3 },
  // The waist — the narrowest ring on the figure.
  { y: 0.185, halfWidth: 0.710 * TORSO_HALF_WIDTH, halfDepth: 0.772 * TORSO_HALF_DEPTH, z: -0.006, square: 2.28 },
  { y: 0.205, halfWidth: 0.730 * TORSO_HALF_WIDTH, halfDepth: 0.800 * TORSO_HALF_DEPTH, z: -0.002, square: 2.28 },
  { y: 0.228, halfWidth: 0.768 * TORSO_HALF_WIDTH, halfDepth: 0.845 * TORSO_HALF_DEPTH, z: 0.004, square: 2.27 },
  { y: 0.252, halfWidth: 0.805 * TORSO_HALF_WIDTH, halfDepth: 0.895 * TORSO_HALF_DEPTH, z: 0.011, square: 2.26 },
  { y: 0.276, halfWidth: 0.838 * TORSO_HALF_WIDTH, halfDepth: 0.945 * TORSO_HALF_DEPTH, z: 0.019, square: 2.24 },
  { y: 0.300, halfWidth: 0.862 * TORSO_HALF_WIDTH, halfDepth: 0.995 * TORSO_HALF_DEPTH, z: 0.028, square: 2.22 },
  { y: 0.318, halfWidth: 0.874 * TORSO_HALF_WIDTH, halfDepth: 1.045 * TORSO_HALF_DEPTH, z: 0.036, square: 2.18 },
  // The bust apex, and **its lead is in `z`, not in `halfDepth`.**
  //
  // A1c pushed depth alone, which moves a ring's *front and back* together: at
  // the apex her back surface stood 24 mm further out than her waist did, so
  // the side capture showed a woman bulging backwards between her shoulder
  // blades and her belt. A loft ring is a closed section — the only way to
  // lead forward without dragging the spine with it is to offset the whole
  // ring. Back surface now runs −0.110 at the waist, −0.104 here, −0.119 at
  // the shoulder blade: a shallow lumbar hollow with the rearmost point where
  // a back's rearmost point is.
  { y: 0.336, halfWidth: 0.882 * TORSO_HALF_WIDTH, halfDepth: 1.085 * TORSO_HALF_DEPTH, z: 0.043, square: 2.14 },
  { y: 0.352, halfWidth: 0.886 * TORSO_HALF_WIDTH, halfDepth: 1.075 * TORSO_HALF_DEPTH, z: 0.042, square: 2.16 },
  { y: 0.370, halfWidth: 0.892 * TORSO_HALF_WIDTH, halfDepth: 1.020 * TORSO_HALF_DEPTH, z: 0.034, square: 2.24 },
  { y: 0.388, halfWidth: 0.900 * TORSO_HALF_WIDTH, halfDepth: 0.965 * TORSO_HALF_DEPTH, z: 0.024, square: 2.34 },
  { y: 0.408, halfWidth: 0.908 * TORSO_HALF_WIDTH, halfDepth: 0.930 * TORSO_HALF_DEPTH, z: 0.014, square: 2.44 },
  { y: 0.430, halfWidth: 0.914 * TORSO_HALF_WIDTH, halfDepth: 0.910 * TORSO_HALF_DEPTH, z: 0.008, square: 2.56 },
  // The shoulders: 0.92 against the men's 1.00, and *visibly inside her own
  // hips*. The arm still hangs from the rig's fixed 0.175 m joint and its top
  // ring still overlaps this wall, so there is no armhole daylight to close.
  { y: 0.452, halfWidth: 0.920 * TORSO_HALF_WIDTH, halfDepth: 0.900 * TORSO_HALF_DEPTH, z: 0.003, square: 2.7 },
  { y: 0.474, halfWidth: 0.906 * TORSO_HALF_WIDTH, halfDepth: 0.868 * TORSO_HALF_DEPTH, z: 0.001, square: 2.78 },
  { y: 0.500, halfWidth: 0.860 * TORSO_HALF_WIDTH, halfDepth: 0.800 * TORSO_HALF_DEPTH, square: 2.8 },
  { y: 0.528, halfWidth: 0.700 * TORSO_HALF_WIDTH, halfDepth: 0.640 * TORSO_HALF_DEPTH, square: 2.5 },
  { y: 0.548, halfWidth: 0.420 * TORSO_HALF_WIDTH, halfDepth: 0.480 * TORSO_HALF_DEPTH, square: 2.3 },
]);

/**
 * Her hips, inside the same garment — and now the widest thing on the figure.
 *
 * 1.06 against her shoulders' 0.92: the inversion of the male frame, which is
 * the half of the silhouette statement the torso cannot make alone. Still a
 * long way inside Trollina's 1.22-on-a-narrowed-frame — hers is a drawing's
 * hip and this is a person's.
 */
const MARIBEL_SEAT = loftProfile([
  { y: -0.098, halfWidth: 0.840 * TORSO_HALF_WIDTH, halfDepth: 0.840 * TORSO_HALF_DEPTH, square: 2.55 },
  { y: -0.078, halfWidth: 0.955 * TORSO_HALF_WIDTH, halfDepth: 0.905 * TORSO_HALF_DEPTH, square: 2.58 },
  { y: -0.062, halfWidth: 1.020 * TORSO_HALF_WIDTH, halfDepth: 0.945 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.046, halfWidth: 1.062 * TORSO_HALF_WIDTH, halfDepth: 0.972 * TORSO_HALF_DEPTH, square: 2.6 },
  // The widest ring on the whole figure, and 20 mm *below* the hem lip —
  // a hip is a curve through a seam, not a step at one.
  { y: -0.030, halfWidth: 1.080 * TORSO_HALF_WIDTH, halfDepth: 0.980 * TORSO_HALF_DEPTH, square: 2.58 },
  { y: -0.014, halfWidth: 1.048 * TORSO_HALF_WIDTH, halfDepth: 0.972 * TORSO_HALF_DEPTH, square: 2.56 },
  { y: 0.008, halfWidth: 0.985 * TORSO_HALF_WIDTH, halfDepth: 0.935 * TORSO_HALF_DEPTH, square: 2.56 },
  { y: 0.030, halfWidth: 0.950 * TORSO_HALF_WIDTH, halfDepth: 0.900 * TORSO_HALF_DEPTH, square: 2.58 },
]);

/**
 * Limbs in fitted leather, authored ring by ring — A1d.
 *
 * **A1c generated these with `limbProfile` and that is what the owner saw as
 * "blocky".** The helper takes three radii and a list of seams and interpolates
 * between them, which gives a cone with collars: no deltoid, no forearm belly,
 * no calf, no knee, and — worse — a *sawtooth*. Every seam it inserts is a ring
 * pair scaled 1.05 then 0.95 across eighteen millimetres, so each accent band
 * on her arm put a five per cent step into the outline and then took it back
 * out. Three of those down an upper arm read exactly as the capture showed
 * them: pipe, collar, pipe, collar.
 *
 * Authored rings fix both halves at once. The seams stay — every one is a paint
 * boundary and the accent bands must still land on a ring pair or their edges
 * smear — but they are now three-millimetre lips rather than ten-millimetre
 * kinks, and the millimetres saved are spent on the events a limb actually
 * has. Nothing here moves a joint: the profiles span exactly the blockout's
 * lengths, so the IK, the stances and every clearance proof are untouched.
 *
 * A note for whoever tries to smooth these further: `subdivisions` will not do
 * it. `blockoutKit`'s ring interpolation is a straight lerp, so an inserted row
 * is collinear with its neighbours by construction — it costs triangles and
 * changes the silhouette by nothing at all. Rings are the only axis that moves
 * an outline.
 */
const MARIBEL_THIGH = loftProfile([
  { y: 0, halfWidth: 0.0860, halfDepth: 0.0826, square: 2.30 },
  // The quadriceps: one millimetre *wider* than the hip ring above it, which a
  // three-radius taper cannot express and which is the difference between a
  // thigh and a cone.
  { y: -0.052, halfWidth: 0.0838, halfDepth: 0.0805, square: 2.28 },
  { y: -0.098, halfWidth: 0.0770, halfDepth: 0.0740, square: 2.28 },
  { y: -0.117, halfWidth: 0.0742, halfDepth: 0.0713, square: 2.28 },
  { y: -0.123, halfWidth: 0.0726, halfDepth: 0.0698, square: 2.28 },
  { y: -0.180, halfWidth: 0.0668, halfDepth: 0.0642, square: 2.30 },
  { y: -0.240, halfWidth: 0.0620, halfDepth: 0.0596, square: 2.30 },
  // The slider guard's upper edge — `MARIBEL_GUARD_TOP` of the thigh.
  { y: -0.277, halfWidth: 0.0600, halfDepth: 0.0578, square: 2.32 },
  { y: -0.283, halfWidth: 0.0588, halfDepth: 0.0566, square: 2.32 },
  { y: -0.300, halfWidth: 0.0592, halfDepth: 0.0570, square: 2.34 },
  // The knee itself flares back out. Small, and the one event that stops the
  // leg reading as a single tapering tube from hip to boot.
  { y: -0.344, halfWidth: 0.0578, halfDepth: 0.0566, square: 2.38 },
  { y: -0.349, halfWidth: 0.0570, halfDepth: 0.0558, square: 2.38 },
  { y: -0.355, halfWidth: 0.0556, halfDepth: 0.0546, square: 2.36 },
  { y: -0.400, halfWidth: 0.0540, halfDepth: 0.0524, square: 2.34 },
]);

/**
 * The shin, and **the one section on her that is deeper than it is wide.**
 *
 * A calf is not a flattened cylinder; it is a mass hung on the back of the leg.
 * `limbProfile`'s `flatten` could only ever make `halfDepth` *smaller* than
 * `halfWidth`, so A1c's calf was anatomically inside out — and since the
 * chase camera looks at the backs of her legs for the whole ride, it was
 * inside out in the one view the player actually has. This ring is 1.06 and
 * sits six millimetres rearward.
 */
const MARIBEL_SHIN = loftProfile([
  { y: 0, halfWidth: 0.0580, halfDepth: 0.0540, square: 2.30 },
  { y: -0.070, halfWidth: 0.0575, halfDepth: 0.0552, square: 2.30 },
  { y: -0.108, halfWidth: 0.0620, halfDepth: 0.0657, z: -0.006, square: 2.32 },
  { y: -0.150, halfWidth: 0.0596, halfDepth: 0.0602, z: -0.003, square: 2.32 },
  // The accent cuff's two edges — `MARIBEL_CUFF_TOP` of the shin.
  { y: -0.1718, halfWidth: 0.0545, halfDepth: 0.0520, square: 2.30 },
  { y: -0.1778, halfWidth: 0.0522, halfDepth: 0.0498, square: 2.30 },
  { y: -0.210, halfWidth: 0.0510, halfDepth: 0.0482, square: 2.30 },
  // The boot's collar — `MARIBEL_BOOT_TOP` of the shin.
  { y: -0.2326, halfWidth: 0.0500, halfDepth: 0.0470, square: 2.32 },
  { y: -0.2386, halfWidth: 0.0490, halfDepth: 0.0460, square: 2.32 },
  { y: -0.310, halfWidth: 0.0492, halfDepth: 0.0464, square: 2.32 },
  // Full at the bottom, as Adonisb2's is and for his reason: the lower shin is
  // inside a laced racing boot, which does not narrow into a shoe.
  { y: -0.380, halfWidth: 0.0490, halfDepth: 0.0462, square: 2.32 },
]);

/** The deltoid crest is the widest ring on the arm, and A1c had no such ring. */
const MARIBEL_UPPER_ARM = loftProfile([
  { y: 0, halfWidth: 0.0430, halfDepth: 0.0417, square: 2.30 },
  { y: -0.028, halfWidth: 0.0492, halfDepth: 0.0477, square: 2.25 },
  // The bicep band's upper edge — a three-millimetre lip, where the generated
  // profile put a ten-millimetre kink.
  { y: -0.0545, halfWidth: 0.0498, halfDepth: 0.0478, square: 2.25 },
  { y: -0.0575, halfWidth: 0.0468, halfDepth: 0.0449, square: 2.25 },
  { y: -0.082, halfWidth: 0.0455, halfDepth: 0.0437, square: 2.25 },
  { y: -0.1105, halfWidth: 0.0442, halfDepth: 0.0420, square: 2.25 },
  { y: -0.1135, halfWidth: 0.0468, halfDepth: 0.0445, square: 2.25 },
  { y: -0.140, halfWidth: 0.0440, halfDepth: 0.0418, square: 2.30 },
  { y: -0.172, halfWidth: 0.0412, halfDepth: 0.0387, square: 2.30 },
  { y: -0.2015, halfWidth: 0.0400, halfDepth: 0.0376, square: 2.30 },
  { y: -0.2045, halfWidth: 0.0378, halfDepth: 0.0355, square: 2.30 },
  { y: -0.230, halfWidth: 0.0368, halfDepth: 0.0342, square: 2.35 },
  // The elbow: the radius rises. Nothing generated from three numbers can.
  { y: -0.256, halfWidth: 0.0372, halfDepth: 0.0342, square: 2.40 },
  { y: -0.272, halfWidth: 0.0350, halfDepth: 0.0322, square: 2.30 },
  { y: -0.280, halfWidth: 0.0300, halfDepth: 0.0276, square: 2.20 },
]);

/** The forearm's belly sits a quarter of the way down, not at the elbow. */
const MARIBEL_FOREARM = loftProfile([
  { y: 0, halfWidth: 0.0378, halfDepth: 0.0362, square: 2.30 },
  { y: -0.030, halfWidth: 0.0400, halfDepth: 0.0378, square: 2.35 },
  { y: -0.058, halfWidth: 0.0392, halfDepth: 0.0366, square: 2.35 },
  { y: -0.092, halfWidth: 0.0360, halfDepth: 0.0332, square: 2.30 },
  { y: -0.1155, halfWidth: 0.0345, halfDepth: 0.0316, square: 2.30 },
  { y: -0.1185, halfWidth: 0.0328, halfDepth: 0.0300, square: 2.30 },
  { y: -0.150, halfWidth: 0.0310, halfDepth: 0.0280, square: 2.30 },
  { y: -0.186, halfWidth: 0.0288, halfDepth: 0.0252, square: 2.40 },
  { y: -0.220, halfWidth: 0.0268, halfDepth: 0.0225, square: 2.50 },
  // The wrist flattens before the glove does: depth is four fifths of width.
  { y: -0.246, halfWidth: 0.0252, halfDepth: 0.0206, square: 2.55 },
  { y: -0.262, halfWidth: 0.0242, halfDepth: 0.0198, square: 2.50 },
  { y: -0.266, halfWidth: 0.0180, halfDepth: 0.0150, square: 2.40 },
]);

/** A slimmer neck, and one that still disappears into a gaiter and a collar. */
const MARIBEL_NECK = loftProfile([
  { y: -0.048, halfWidth: 0.058, halfDepth: 0.056, square: 2.4 },
  { y: -0.010, halfWidth: 0.051, halfDepth: 0.049, square: 2.3 },
  { y: 0.050, halfWidth: 0.046, halfDepth: 0.044, square: 2.2 },
  { y: 0.098, halfWidth: 0.044, halfDepth: 0.042, square: 2.2 },
]);

/**
 * Her helmet — A1c, and the first look to bring its own shell.
 *
 * The shared `HELMET` is Cool Rider’s: a neutral road lid on a male head. Hers
 * is authored two millimetres smaller in every section — a helmet over a
 * smaller head, which the narrowed neck below it makes legible — with the
 * whole crown swept *back*: the chin bar leads further, the crown’s rings walk
 * rearward as they rise, and the shell reads as an aero road-racing lid rather
 * than a ball. The visor patch on it is also cut wider and taller than any
 * other rider’s (±1.22 rad against the proven ±1.05), because the brief’s
 * recognition order puts the blue mirror second only to the silhouette and the
 * reviewer’s note asked for exactly this: at thirty metres the visor is the
 * face, and hers should be the widest thing on the front of the helmet.
 */
const MARIBEL_HELMET = loftProfile([
  // The chin bar. It reaches lower and further forward than the crown does,
  // which is what separates a full-face from an open-face with a screen on it
  // — A1d, after two rounds of critics found no jaw under her visor at all.
  //
  // **The rear rim comes down over the nape** — M23, and the measurement
  // behind the owner's second and third notes about a thick neck. Below the
  // shell's widest ring these three rings used to run *forward* as they fell,
  // so the back of the shell tapered onto the neck like a hood and left the
  // nape bare from y = 0.114 down. Hair filled that gap, which is how a mesh
  // that is supposed to be worn *under* a helmet came to stand 101 mm proud
  // of it at the rim. The reference photograph the owner supplied
  // (`hair-example-from-google-search`) shows the real order: shell down to
  // below the ear, then hair, then neck. So the lower rings keep their front
  // — the chin bar and the visor are unmoved, to the millimetre — and grow
  // rearward instead, which puts the shell's back wall vertical from the brow
  // down and gives the hair something to emerge from under. The bottom ring
  // matches the one above it at the back for the same reason: an undercut rear
  // rim is a shelf, and every millimetre of hair tucked behind it comes back
  // out below as a lump.
  { y: 0.052, halfWidth: 0.066, halfDepth: 0.100, square: 2.3, z: 0.000 },
  { y: 0.086, halfWidth: 0.090, halfDepth: 0.110, square: 2.3, z: 0.010 },
  { y: 0.114, halfWidth: 0.104, halfDepth: 0.124, square: 2.5, z: 0.006 },
  { y: 0.152, halfWidth: 0.114, halfDepth: 0.130, square: 2.6, z: 0.008 },
  { y: 0.208, halfWidth: 0.119, halfDepth: 0.134, square: 2.5, z: 0.002 },
  { y: 0.258, halfWidth: 0.109, halfDepth: 0.121, square: 2.3, z: -0.004 },
  { y: 0.300, halfWidth: 0.082, halfDepth: 0.092, square: 2.2, z: -0.010 },
  { y: 0.330, halfWidth: 0.040, halfDepth: 0.048, square: 2.2, z: -0.014 },
  { y: 0.342, halfWidth: 0, halfDepth: 0 },
]);

/**
 * A narrower boot on the same sole footprint.
 *
 * The sole is what stands on the pedal and `render/riderEuc.test.ts` asserts it
 * does, so its plan stays the shared one; only the upper comes in. Seven per
 * cent is not a silhouette on its own — it is the `legs` capture agreeing with
 * everything above it, which is how a proportion reads as deliberate rather
 * than as one part being wrong.
 */
const MARIBEL_BOOT = loftProfile(
  BOOT.map((ring) => ({ ...ring, halfWidth: ring.halfWidth * 0.93, halfDepth: ring.halfDepth * 0.95 })),
);
/**
 * Her glove — A1d, and the part the owner's ride named outright: *"Her hands
 * look amputated."*
 *
 * He was describing something real and measurable. A1c's hand was the shared
 * `GLOVE` scaled to 92%: a hundred and five millimetres long against a
 * two-hundred-and-sixty-millimetre forearm, of which only seventy-eight showed
 * because the sleeve's rounded end sat inside it — under a third of the
 * forearm, where a hand is about three quarters of one. It was also round in
 * section (1.14 wide to deep, against a real hand's two to one), widest at the
 * *cuff* rather than at the knuckles, and it had no wrist ring anywhere. A
 * shape like that cannot read as a hand at any polygon count or under any
 * paint; it reads as a stump with a bracelet, which is exactly what the
 * capture showed.
 *
 * So this is authored as a hand: a flared gauntlet, a wrist that is the
 * narrowest ring on the part, a palm that is nearly twice as wide as it is
 * thick, a knuckle line, and a finger mass that curls forward as it falls.
 * The thumb and the two finger lobes are separate lofts merged into the same
 * mesh — see `RiderLook.build`.
 */
const MARIBEL_HAND = loftProfile([
  // The gauntlet's mouth, tucked up inside the sleeve so no rim can show.
  { y: 0.014, halfWidth: 0.0300, halfDepth: 0.0270, square: 2.5 },
  { y: 0.006, halfWidth: 0.0405, halfDepth: 0.0350, square: 2.7 },
  { y: -0.020, halfWidth: 0.0387, halfDepth: 0.0330, square: 2.8 },
  { y: -0.038, halfWidth: 0.0330, halfDepth: 0.0270, square: 2.8 },
  // The wrist: the narrowest ring on the hand, and the one A1c never had.
  { y: -0.052, halfWidth: 0.0270, halfDepth: 0.0215, square: 2.6 },
  { y: -0.068, halfWidth: 0.0355, halfDepth: 0.0225, square: 3.0 },
  { y: -0.092, halfWidth: 0.0400, halfDepth: 0.0215, square: 3.4 },
  // The knuckles — widest, flattest, 2.08 across to through.
  { y: -0.114, halfWidth: 0.0415, halfDepth: 0.0200, square: 3.6 },
  { y: -0.132, halfWidth: 0.0405, halfDepth: 0.0235, square: 3.2 },
  { y: -0.146, halfWidth: 0.0330, halfDepth: 0.0250, square: 2.9 },
  { y: -0.156, halfWidth: 0.0225, halfDepth: 0.0195, square: 2.6 },
  { y: -0.162, halfWidth: 0.0090, halfDepth: 0.0080, square: 2.4 },
  { y: -0.166, halfWidth: 0, halfDepth: 0 },
]);

/**
 * The thumb, and the two lobes the fingers group into.
 *
 * **Three lofts, because a valley cannot be painted or patched.** A vertex
 * colour on a smooth-shaded surface is a smudge, not a gap, and a patch offsets
 * the surface *outward*, so it can raise a pad and never cut the crease between
 * two fingers. Two closed lofts that intersect do cut one — the overlap is a
 * real concavity in the merged surface — which is why the finger mass is two
 * overlapping lobes rather than one lump with a stripe on it.
 *
 * They merge into the hand's own mesh (`RiderLook.build.hand`), so all of this
 * costs triangles and not one draw call, and the hi-vis repaint runs after the
 * merge and therefore covers them.
 *
 * `side` is +1 for the rider's left; the lobes are mirrored through it so that
 * the thumb is inboard on both hands.
 */
const maribelThumb = (side: number): THREE.BufferGeometry => loftGeometry(loftProfile([
  { y: -0.056, x: -side * 0.0230, z: 0.0060, halfWidth: 0.0135, halfDepth: 0.0150, square: 2.7 },
  { y: -0.070, x: -side * 0.0330, z: 0.0135, halfWidth: 0.0140, halfDepth: 0.0155, square: 2.8 },
  { y: -0.086, x: -side * 0.0395, z: 0.0215, halfWidth: 0.0125, halfDepth: 0.0140, square: 2.7 },
  { y: -0.100, x: -side * 0.0420, z: 0.0285, halfWidth: 0.0100, halfDepth: 0.0115, square: 2.6 },
  { y: -0.108, x: -side * 0.0425, z: 0.0310, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 14 });

/** Index and middle: inboard, and the longer of the two. */
const maribelFingersInner = (side: number): THREE.BufferGeometry => loftGeometry(loftProfile([
  { y: -0.104, x: -side * 0.0115, z: 0.0035, halfWidth: 0.0175, halfDepth: 0.0180, square: 2.8 },
  { y: -0.124, x: -side * 0.0125, z: 0.0075, halfWidth: 0.0195, halfDepth: 0.0210, square: 3.0 },
  { y: -0.144, x: -side * 0.0130, z: 0.0130, halfWidth: 0.0180, halfDepth: 0.0195, square: 2.9 },
  { y: -0.158, x: -side * 0.0130, z: 0.0180, halfWidth: 0.0125, halfDepth: 0.0140, square: 2.6 },
  { y: -0.166, x: -side * 0.0130, z: 0.0205, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 14 });

/** Ring and little: outboard, and nine millimetres shorter, which is the read. */
const maribelFingersOuter = (side: number): THREE.BufferGeometry => loftGeometry(loftProfile([
  { y: -0.104, x: side * 0.0125, z: 0.0030, halfWidth: 0.0160, halfDepth: 0.0170, square: 2.8 },
  { y: -0.122, x: side * 0.0140, z: 0.0068, halfWidth: 0.0175, halfDepth: 0.0195, square: 3.0 },
  { y: -0.138, x: side * 0.0145, z: 0.0115, halfWidth: 0.0155, halfDepth: 0.0175, square: 2.9 },
  { y: -0.150, x: side * 0.0145, z: 0.0155, halfWidth: 0.0105, halfDepth: 0.0120, square: 2.6 },
  { y: -0.157, x: side * 0.0145, z: 0.0175, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 14 });

/** The black leather: torso, hips, sleeves and legs, one garment and one material. */
const MARIBEL_SUIT: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.maribelSuit,
  roughness: 0.70,
  metalness: 0.0,
});

/**
 * The pale material, and **everything it carries is painted down from it.**
 *
 * That inversion is Adonisb2's (§22.3 fact 4) pointed at a different problem.
 * He needed a saturated green that a black base could never be multiplied up
 * to; she needs a *white* chest device, grey shoulder armour, and hair — three
 * values a scalar shade can reach from one near-white base and none of which a
 * near-black base can reach without a multiplier in the tens. So `accent` is
 * the brightest thing she wears and the armour, the guards and the ponytail are
 * all shades of it.
 *
 * Matte, for `RED_ARMOUR`'s reason: the shoulder cups are broad curved surfaces
 * near the top of a sunlit figure, and a glossy pale panel there finds the
 * sun's mirror angle and clips to white.
 */
const MARIBEL_MARK: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.maribelMark,
  roughness: 0.74,
  metalness: 0.0,
});

/** Boots, glove bodies, the gaiter: the glossier near-black half. */
const MARIBEL_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.maribelGear,
  roughness: 0.58,
  metalness: 0.0,
});

// -- Maribel's paintwork ------------------------------------------------------
//
// Her suit is black and every accent on it is lighter, so unlike Adonisb2 these
// tints paint *up*. That is safe here in a way it would not be for his green:
// grey-from-black is a near-uniform multiplier on all three channels
// (×3.5, ×3.7, ×3.2), and the two saturated ones are small fields the sun can
// only wash, not fields the whole figure is made of.

/** Black → the mid-grey stretch panels: flanks, outer arm, outer thigh, shin. */
const MARIBEL_PANEL_TINT = tintOver(
  BLOCKOUT_COLOURS.maribelSuit,
  BLOCKOUT_COLOURS.maribelPanel,
  // **0.55 of the way, not all of it** — A1d. This grey covers the outer
  // thigh, the outer shin and the seat, and once the suit under it was lifted
  // out of near-black the three together made her hips, her backside and her
  // outer legs the brightest surfaces on the character. Both references are a
  // black rider with grey seams; she had become a grey rider with black trim.
  0.55,
);
/**
 * Black → the half-step between them: the yoke over her shoulders and the top
 * of each sleeve.
 *
 * **The value story needs a middle, and this is it.** With the leather taken
 * down to `#24262d` in A1b there is a long way to the panel grey, and a figure
 * whose only two values meet at a hard line reads as two garments. The
 * reference agrees: in the regenerated render her shoulders and upper sleeves
 * catch light a clear step above her ribs, which is what a one-piece suit does
 * over the parts of a body that face the sky.
 */
const MARIBEL_YOKE_TINT = tintOver(
  BLOCKOUT_COLOURS.maribelSuit,
  BLOCKOUT_COLOURS.maribelPanel,
  // **0.22, down from 0.52** — A1d. Half a step toward the panel grey was the
  // right amount over a suit that rendered near-black; over a suit that has a
  // value of its own it put a pale plate across her whole upper back and both
  // shoulders, which the chase camera read as a grey vest worn over the
  // leather. The light on a shoulder is a hint, not a garment.
  0.22,
);
/** Her right — −X. Bicep ring, boot cuff, and the aqua edge of the chest field. */
const MARIBEL_AQUA_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelAqua);
/** Her left — +X. The same three places. */
const MARIBEL_CORAL_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelCoral);
/** Black → the boot's shaft, which is the shin's own lower band. */
const MARIBEL_BOOT_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelGear);
/**
 * The knee guard's own value, painted onto the leg underneath it.
 *
 * **The number has to stay equal to the guard patches' `shade`**, and M22 paid
 * for the reason: a guard spans a hinge, a hinge cannot be sealed, and a
 * bending knee pulls its two halves apart exactly where the player is looking.
 * What shows through the gap is the limb, so the limb is painted the guard's
 * colour and the gap opens onto more guard.
 */
const MARIBEL_GUARD_TINT = tintOver(
  BLOCKOUT_COLOURS.maribelSuit,
  BLOCKOUT_COLOURS.maribelMark,
  MARIBEL_GUARD_SHADE,
);
/** The elbow guard's crest line — the rim shade, quieted for arm's-length. */
const MARIBEL_ELBOW_RIM_TINT = tintOver(
  BLOCKOUT_COLOURS.maribelSuit,
  BLOCKOUT_COLOURS.maribelMark,
  MARIBEL_RIM_SHADE * 0.7,
);
/** Panel lines on a boot: the gear colour one step up, the M19 grammar. */
const MARIBEL_BOOT_PANEL_TINT = tintOver(
  BLOCKOUT_COLOURS.maribelGear,
  BLOCKOUT_COLOURS.maribelGear,
  1.34,
);
/** The fluorescent field on the outer glove — the loudest thing below her chin. */
const MARIBEL_HIVIS_TINT = tintOver(BLOCKOUT_COLOURS.maribelGear, BLOCKOUT_COLOURS.maribelHiVis);
/** The pale mark material → her hair, and → the bleached streaks in it. */
const MARIBEL_HAIR_TINT = tintOver(BLOCKOUT_COLOURS.maribelMark, BLOCKOUT_COLOURS.maribelHair);
/** The shadow half of the mass: the parting, and where it tucks under the lid. */
const MARIBEL_HAIR_DARK_TINT = tintOver(BLOCKOUT_COLOURS.maribelMark, 0x1d1712);
const MARIBEL_HAIR_LIGHT_TINT = tintOver(
  BLOCKOUT_COLOURS.maribelMark,
  BLOCKOUT_COLOURS.maribelHairLight,
);

/** Which accent a side wears. Aqua is her right (−X); coral is her left (+X). */
function maribelAccent(side: number): Tint {
  return side < 0 ? MARIBEL_AQUA_TINT : MARIBEL_CORAL_TINT;
}

/** Blend two tints. `t = 0` is `a`. */
function mixTint(a: Tint, b: Tint, t: number): Tint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A smooth 0→1 ramp between two bounds, clamped outside them. */
function ramp(value: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * The body — grey flanks, and the yoke over her shoulders.
 *
 * **The chest print left this function in Phase A1b, and that is the whole
 * lesson of the phase in one diff.** A1 painted the reference's halftone as a
 * vertex gradient on the reasoning that at a vertex colour's resolution a
 * halftone *is* a fade — true, and the wrong question. The print is the most
 * looked-at surface on the character, and what it needed was not a better
 * approximation of dots but a surface that could hold dots. It is now a
 * printed patch (`panels.torso`), and this painter keeps the two jobs a vertex
 * colour is genuinely the right tool for: broad fields, and side asymmetry.
 *
 * Both are *value* work, which is the other half of what A1 got wrong. The
 * flank panel and the yoke are the figure's internal structure at chase
 * distance, and neither costs a triangle.
 */
function paintMaribelTorso(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < 1e-4) continue;

    // The grey flank: a *strip* down the side of the garment, waist to armpit.
    //
    // **0.86, not the first pass's 0.66**, and it stops above the seat. At 0.66
    // the panel was the whole outboard face and the side capture came back with
    // a grey rider wearing black sleeves — the reference has black in front of
    // the panel and black behind it, which is what makes it a panel. Ending it
    // at the waist matters as much: running it down over the hips turned the
    // seat's wide shallow section into a grey belt, since almost every vertex
    // on a flattened ellipse passes an outboard test.
    if (Math.abs(x) / radius > 0.86 && y > 0.034 && y < 0.436) {
      colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
      continue;
    }

    // The yoke: the half-step, over the shoulders and fading out down the
    // chest and the back. Ramped rather than banded because the light it
    // stands for has no edge — a hard line across a shoulder is a garment
    // seam, and this is not one.
    // **Its lower edge is a V, not a shelf.** A1d's captures showed a
    // light-grey plate with a dead-straight horizontal bottom running across
    // her upper chest — the strongest cardboard-cut-out cue on the model. A
    // yoke's edge follows the collarbone, so the front dips at the sternum and
    // rises toward the shoulder points; the back keeps the authored line.
    const scoop = position.getZ(i) > 0
      ? 0.034 * (1 - ramp(Math.abs(position.getX(i)), 0.018, 0.132))
      : 0;
    const lift = ramp(y, 0.404 - scoop, 0.500 - scoop * 0.4);
    if (lift <= 0.002) continue;
    const tint = mixTint([1, 1, 1], MARIBEL_YOKE_TINT, lift);
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/**
 * The bicep ring, and the grey panel down the outer sleeve.
 *
 * The ring is a **full wrap**, which every other band in this file deliberately
 * is not — Cool Rider's sleeve accent is an outboard panel precisely because a
 * solid band read as a machine joint. This one is a band in both photographs
 * and in the render, it is 56 mm of a 280 mm arm rather than half the limb, and
 * it is the clearest statement of the asymmetry the game has: from directly
 * behind, the two arms are the only place a player sees both accents at once.
 */
function paintMaribelUpperArm(geometry: THREE.BufferGeometry, side: number): void {
  const length = RIDER_BLOCKOUT.upperArmLength;
  const top = -length * MARIBEL_BICEP_TOP;
  const bottom = -length * MARIBEL_BICEP_BOTTOM;
  const accent = maribelAccent(side);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= top && y >= bottom) {
      colour.setXYZ(i, accent[0], accent[1], accent[2]);
      continue;
    }
    // The grey panel runs the outer sleeve below the band, stopping at the
    // elbow seam. Above the band the shoulder armour covers the arm anyway.
    // 0.725 lands the seam mid-pair at −0.203 (−0.2015/−0.2045); 0.74 was one
    // facet past it — the forearm guard's own bug, one limb up.
    if (y > bottom || y < -length * 0.725) continue;
    if (!outboardFace(position.getX(i), position.getZ(i), side, 0.70)) continue;
    colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
  }
}

/**
 * The elbow guard, painted — A1c, and the paint hook's own origin story
 * (`RiderLook.paint.forearm`).
 *
 * Built first as two `elbowPad` patches; they read correctly and cost two
 * draw calls, and the §9 sweep found the frame ceiling at exactly 150 with
 * them in. Red Rider's boots already prove the alternative: at chase
 * distance, a guard is a value story — a dark moulded field with one lighter
 * line along its crest — and a repaint tells it for free. The field wraps the
 * elbow's rear half (the chains bend backward, so that is both where armour
 * goes and what the chase camera sees); the crest line sits inside it.
 */
function paintMaribelForearm(geometry: THREE.BufferGeometry, _side: number): void {
  const length = RIDER_BLOCKOUT.forearmLength;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // 0.45 of the forearm is −0.117 — the middle of the authored lip pair at
    // −0.1155/−0.1185. The first A1d constant said 0.40, which is −0.104: a
    // point between rings, so the guard's lower edge smeared across the whole
    // 23 mm facet band beside the pair that was authored to hold it.
    if (y > -0.006 || y < -length * 0.45) continue;
    const x = position.getX(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < 1e-4) continue;
    // Rear half only: the front of the forearm stays leather, which is what
    // keeps this reading as a pad strapped over a sleeve rather than as a
    // darker sleeve segment (the M2 "machine joint" trap, again).
    if (z / radius > 0.10) continue;
    const crest = z / radius < -0.62 && y < -0.030 && y > -0.062;
    const tint = crest ? MARIBEL_ELBOW_RIM_TINT : MARIBEL_GUARD_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** The grey panel down the outside of the thigh, and the guard's dark cup. */
function paintMaribelThigh(geometry: THREE.BufferGeometry, side: number): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= MARIBEL_CUP_TOP) {
      // Under the guard, and the reason it is painted rather than sealed: a
      // knee is a hinge, the guard spans it in two halves, and what shows
      // through when the leg bends has to be the guard's own value or it reads
      // as a bright line opening in the middle of the armour (M22's lesson,
      // paid for on the owner's ride).
      colour.setXYZ(i, MARIBEL_GUARD_TINT[0], MARIBEL_GUARD_TINT[1], MARIBEL_GUARD_TINT[2]);
      continue;
    }
    // **The aqua/coral band, moved up to the thigh** — A1d. Both bands sat at
    // the ankle, where the reference render puts them just above the knee pod
    // and where they were competing with the purple pads, the taillight and
    // the status lamp inside sixty pixels of screen. Her loudest two colours
    // now sit at the height the reference gives them. The ring pair at −0.240
    // and −0.277 is what makes the edge a crease rather than a smear.
    // Half a millimetre of slack at each edge, because the band's edges *are*
    // authored rings and a float that round-trips through a buffer attribute
    // lands a hair outside an exact compare — which is how the first build of
    // this painted a band nobody could find.
    if (y <= -0.2395 && y >= -0.2775) {
      const band = maribelAccent(side);
      colour.setXYZ(i, band[0], band[1], band[2]);
      continue;
    }
    if (y > -0.020 || y < -RIDER_BLOCKOUT.thighLength * MARIBEL_GUARD_TOP) continue;
    if (!outboardFace(position.getX(i), position.getZ(i), side, 0.55)) continue;
    colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
  }
}

/**
 * The shin: the guard's cup at the top, a grey panel down the outside, then the
 * accent cuff and the boot's shaft.
 *
 * The cuff is the leg's half of the asymmetry and the only accent that is
 * unobstructed from the `legs` angle, so it is a full wrap for the bicep ring's
 * reason.
 */
function paintMaribelShin(geometry: THREE.BufferGeometry, side: number): void {
  const length = RIDER_BLOCKOUT.shinLength;
  const cuffTop = -length * MARIBEL_CUFF_TOP;
  const bootTop = -length * MARIBEL_BOOT_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < bootTop) {
      colour.setXYZ(i, MARIBEL_BOOT_TINT[0], MARIBEL_BOOT_TINT[1], MARIBEL_BOOT_TINT[2]);
      continue;
    }
    // **The accent moved to the thigh in A1d and this branch had to go with
    // it.** Both fired for one capture round, so each leg wore her colour
    // twice — and the one the eye actually found was this low one, sitting
    // directly beside the machine's purple pads and its status lamps, which is
    // the exact collision moving the band upstairs was written to prevent.
    if (y < cuffTop) {
      colour.setXYZ(i, MARIBEL_BOOT_TINT[0], MARIBEL_BOOT_TINT[1], MARIBEL_BOOT_TINT[2]);
      continue;
    }
    if (y > MARIBEL_CUP_BOTTOM) {
      colour.setXYZ(i, MARIBEL_GUARD_TINT[0], MARIBEL_GUARD_TINT[1], MARIBEL_GUARD_TINT[2]);
      continue;
    }
    if (!outboardFace(position.getX(i), position.getZ(i), side, 0.55)) continue;
    colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
  }
}

/** Ankle band, toe cap and instep strap — the boot grammar M19 established. */
function paintMaribelBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    const ankleBand = t > 0.64 && t < 0.84;
    const toeCap = t < 0.32 && z > 0.055;
    const instepStrap = t > 0.38 && t < 0.52 && z > 0.02;
    if (ankleBand || toeCap || instepStrap) {
      colour.setXYZ(
        i,
        MARIBEL_BOOT_PANEL_TINT[0],
        MARIBEL_BOOT_PANEL_TINT[1],
        MARIBEL_BOOT_PANEL_TINT[2],
      );
    }
  }
}

/**
 * The fluorescent glove.
 *
 * **A field, not a pinstripe**, and that is the reference rather than a liberty:
 * in the photograph the whole outer hand from the cuff to the fingertips is
 * hi-vis, and the render draws it the same way. It is also the M22 micro-accent
 * rule cutting the other way — Adonisb2's green glove seam was removed because
 * a mark that cannot be made small should not be made, and this mark is not
 * small. At chase distance it is two bright points at the ends of two dark
 * arms, which is more identity than anything else she wears below the shoulder.
 */
function paintMaribelHand(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // The gauntlet: sixty-four millimetres of black leather, where A1c had a
    // twenty-six millimetre ring that read as a bracelet. Her real one is a
    // long flared cuff and it is most of what makes the glove look like gear
    // rather than like a mitten.
    if (y > -0.050) continue;
    // The palm is black and everything else is hi-vis. **The palm faces
    // backwards**, which the first A1d capture settled: an arm hanging at rest
    // presents the *back* of the hand forward, which is what both the
    // photograph and the reference render show — hi-vis from the front. The
    // black is therefore −Z, and the yellow wraps the back, both edges, the
    // thumb and the fingers, so the glove keeps a lit edge from behind too.
    if (position.getZ(i) < -0.006) continue;
    // **The fingertips and the thumb are black**, because in both references
    // the hi-vis is a shield that stops before the fingers do. A yellow field
    // ending in dark tips is what the eye reads as *fingers*; hi-vis all the
    // way to the end is one lump, which is what the first A1d capture showed.
    // Half a millimetre of slack, for the thigh band's reason: the boundary is
    // the authored ring at −0.132, and float32 rounds that ring to just above
    // the exact compare — which quietly moved the black down to the next ring
    // and cut the tips from 34 mm to 20.
    if (y < -0.1315) continue;
    if (Math.abs(position.getX(i)) > 0.030 && y < -0.070) continue;
    colour.setXYZ(i, MARIBEL_HIVIS_TINT[0], MARIBEL_HIVIS_TINT[1], MARIBEL_HIVIS_TINT[2]);
  }
}

/**
 * One closed, shallow curtain for the loose hair.
 *
 * A rotational loft is the wrong primitive here: even when it is flattened,
 * its concentric rings make a smooth bulb with one pointed end. Separate lofts
 * solve that outline by creating several pointed ends — the fox-tail failure.
 * This grid owns one perimeter instead. Its bottom row stays broad and varies
 * only by 22 mm, so the silhouette reads as a soft wavy hem rather than locks.
 */
/**
 * How long the lock at this point across the mass is, 0.28 to 1.
 *
 * **Shared by the mesh and the paint, on purpose.** The hem's break and the
 * bleach's onset have to be the *same* wave or the pale becomes a band ruled
 * across the tips rather than the tips themselves — which is exactly what a
 * blind critic measured on the build before this one and called trim. Two
 * waves rather than one, at 2.6 and 5.3 cycles across the width, because a
 * single cosine gives identical teeth at even spacing and reads as bunting.
 *
 * `u` is the mass's own -1..1 coordinate across its width.
 */
function lockLength(u: number): number {
  const wave = 0.5 + 0.5 * Math.cos((u + 0.21) * Math.PI * 2.6);
  const fine = 0.5 + 0.5 * Math.cos((u - 0.37) * Math.PI * 5.3);
  return 0.28 + 0.56 * wave ** 1.2 + 0.16 * fine;
}

function maribelHairCurtain(): THREE.BufferGeometry {
  // **Shoulder-blade length, and the length is a measurement rather than a
  // taste** — the owner's call after his ride of the one-curtain build:
  // *"there's like a fox tail with other tails besides it… maybe shorter hair
  // to the armpits is the way to go. would still show the logo, and can be
  // wider. so the bottom tips of hair right above the logo."*
  //
  // Her back mark spans 0.135–0.356 of the pelvis frame and the neck sits at
  // 0.499, so the print's **top edge is y = -0.143 in this frame**. A curtain
  // that ended at -0.410 hung 46 mm below the print's *bottom* and covered the
  // whole of it — which is what every back capture in this milestone shows and
  // why the mark had to be photographed with `--hide rider-hair`. Ending at
  // -0.130 leaves 13 mm of leather between the tips and the artwork, and the
  // chase camera gets the mark back.
  //
  // Losing 280 mm of length has to be paid for in width or the mass reads as a
  // tail: the widest row goes 0.103 → 0.112 (224 mm across, still inside the
  // 238 mm helmet and well inside the shoulder pods) and it now arrives by the
  // third row instead of the fifth, so the silhouette is a bell that reaches
  // its width at the nape rather than a rope that reaches it at the waist.
  //
  // **And it lies ON her back rather than behind it.** The long build carried
  // 42 mm of half-thickness on a centreline 70 mm off the jacket, which the
  // side capture showed for what it is: a slab hanging in the air off the back
  // of the lid, joined to nothing. Her jacket's back surface sits at z = -0.093
  // under the collar and -0.119 at the blades (measured off `profiles.torso`
  // at each row's own height), and each row's `z` is now that surface minus
  // its own half-thickness and 4 mm of drape — so the *inner* face of the
  // curtain rests on the leather all the way down, whatever the row is doing.
  // The thickness itself comes down with it: 84 mm through the mass was a
  // pillow, and hair on a back is nearer 50.
  //
  // **Widest at three fifths of its height, narrowing to two thirds of that at
  // the tips.** The first short build was widest at the *bottom* and ended
  // flat, and a blind Opus critic named what that is: 55 px wide by 50 px tall
  // at chase distance, a bell terminating at its own maximum — *"the silhouette
  // of a garment. It is never the silhouette of hair."* It read to it as the
  // fold-down hood of a hoodie. Hair tapers.
  //
  // **And it is not a ponytail** — the owner, looking at a hard-brake capture:
  // *"you can just widen the top of the curtain or whatever… it's not a
  // ponytail."* The root row used to be 72 mm across against a helmet rim of
  // 132, so the mass left a bare wedge of neck on each side of it directly
  // under the shell, and the liner's two nape lobes sat in that wedge as
  // separate hair-coloured tabs. The root is 116 mm now, 88% of the rim, and
  // the taper up to it is gentle rather than a stalk.
  //
  // `wrap` is what makes the widening buildable. A row is a straight line in
  // x at a constant z, so widening one alone throws its corners *backwards*
  // off the head: the shell's rim ring falls from z = -0.100 at the spine to
  // -0.055 at x = 0.058, and a flat root row would have hung 41 mm behind it
  // in mid-air. Each row's ends therefore curl forward by `wrap` on the rim
  // ring's own exponent, which holds the root at a constant 4 mm inside the
  // shell all the way round — the same offset it already had at the spine —
  // and fades out by the shoulder blades, where the mass is wider than
  // anything to lie on and hair spans free.
  const rows = [
    { y: 0.050, x: 0.000, z: -0.096, width: 0.058, depth: 0.010, wrap: 0.045 },
    { y: 0.024, x: -0.003, z: -0.112, width: 0.086, depth: 0.016, wrap: 0.038 },
    { y: -0.002, x: -0.004, z: -0.134, width: 0.106, depth: 0.022, wrap: 0.025 },
    { y: -0.026, x: -0.007, z: -0.147, width: 0.118, depth: 0.026, wrap: 0.015 },
    { y: -0.046, x: -0.011, z: -0.146, width: 0.116, depth: 0.025, wrap: 0.009 },
    { y: -0.064, x: -0.014, z: -0.139, width: 0.106, depth: 0.020, wrap: 0.005 },
    { y: -0.080, x: -0.017, z: -0.130, width: 0.092, depth: 0.014, wrap: 0.002 },
    { y: -0.095, x: -0.019, z: -0.121, width: 0.079, depth: 0.008, wrap: 0.000 },
  ] as const;
  /**
   * How far a column has curled forward off its row's centreline, 0..1.
   *
   * The rear arc of a superellipse at the shell's own `square`, normalised to
   * the row's own half-width so a row wider than the helmet still describes
   * one continuous curve instead of running out of ring and going flat.
   */
  const wrapAt = (u: number): number => {
    const t = Math.min(1, Math.abs(u));
    const shell = MARIBEL_HELMET[0]!.square;
    return 1 - (1 - t ** shell) ** (1 / shell);
  };
  const columns = 13;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];

  // Two shallow surfaces, body-side first and camera-side second. The waves
  // move the surfaces together so no groove pinches through the thickness.
  for (const side of [1, -1]) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]!;
      const v = rowIndex / (rows.length - 1);
      for (let column = 0; column < columns; column += 1) {
        const u01 = column / (columns - 1);
        const u = u01 * 2 - 1;
        const edge = Math.cos(Math.abs(u) * Math.PI * 0.5);
        // **The hem is three locks of different lengths, not a ripple.**
        // Measured on the previous build, the bottom edge varied 7 px across a
        // 138 px mass — five per cent — and the critic's word for a flat
        // boundary with a constant pale band above it was *trim*: fleece on a
        // hood rather than tips. This runs the last two rows down by up to
        // 45 mm on a three-lobe wave, which is a quarter of the mass's height,
        // and it squares the ramp so the extra length arrives as points rather
        // than as a shifted edge. The longest lock ends at y = -0.140, three
        // millimetres above the top of her back print.
        const tip = Math.max(0, (v - 0.52) / 0.48);
        const hem = -0.046 * tip * tip * lockLength(u);
        const surfaceWave = Math.sin(v * Math.PI * 2.3 + u * Math.PI * 1.7) * 0.0045 * edge;
        const sideDepth = row.depth * (0.32 + 0.68 * edge ** 0.7);
        positions.push(
          row.x + u * row.width + Math.sin(v * Math.PI * 1.7) * u * 0.003,
          row.y + hem,
          row.z + row.wrap * wrapAt(u) + surfaceWave + side * sideDepth,
        );
        uvs.push(u01, 1 - v);
        colours.push(1, 1, 1);
      }
    }
  }

  const surfaceSize = rows.length * columns;
  for (let side = 0; side < 2; side += 1) {
    const offset = side * surfaceSize;
    for (let row = 0; row < rows.length - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const a = offset + row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        if (side === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }

  // Close the four perimeter edges. Each quad joins the two surface grids;
  // duplicated perimeter vertices are unnecessary because normals are meant
  // to flow softly over this stylised, continuous volume.
  //
  // **Wound body-side first, then across the thickness, then along the edge**
  // — and the order is the whole of a defect an Opus critic measured on two
  // builds running (§23.9m). Written the other way round, every one of these
  // thirty-eight quads faces *inward*: the right-hand edge's normal came out
  // at −x on the +x side of the mass, the top edge's pointed at the floor.
  // Back faces are culled, so the closing band did not draw at all — and in
  // strict profile, where the camera looks straight down the near edge, the
  // gap between the two grids opened onto the sky. What the critic saw as a
  // 4 px hair-coloured ribbon floating clear of her back was the *outer* grid
  // alone, with its edge missing and the world showing through the slot.
  //
  // It is asserted rather than described (`maribel.test.ts`): a closed shell
  // traverses every directed edge exactly once, so a flipped face shows up as
  // an edge walked twice the same way. This build walked seventy-six.
  const close = (a: number, b: number): void => {
    indices.push(a, a + surfaceSize, b, b, a + surfaceSize, b + surfaceSize);
  };
  for (let column = 0; column < columns - 1; column += 1) {
    close(column + 1, column);
    const bottom = (rows.length - 1) * columns;
    close(bottom + column, bottom + column + 1);
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    close(row * columns, (row + 1) * columns);
    close((row + 2) * columns - 1, (row + 1) * columns - 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Her hair — **one mass, worn down her back.** q58 H1, the fourth build.
 *
 * The owner's A1d ride settled the colour ("nailed the hair color") and
 * rejected everything about where it hung: the forward fall clipped through
 * her armpit — structurally, not tunably, because a chest-length mass on the
 * neck joint crosses a torso-jointed shoulder the moment the head turns — it
 * reached her waist where the render stops at the ribs, and the collar tiers
 * read to him as *"a dead animals fur around her neck."*
 *
 * **And then he found the reference that had been missing all along**: two of
 * his own 2019 photographs of her riding in SF, filed in `references/`. They
 * are the project's only pictures of her hair worn loose while riding, and
 * they answer the two questions everything previous was invented around: it
 * hangs OUT THE BACK of the helmet, loose and wind-lifted with flyaway wisps,
 * and it ends at the shoulder blades — not the waist. The back of her hair is
 * no longer an inference.
 *
 * So the length lives in one spine-hugging curtain down the back, weighted to
 * her right as every reference weights her, with nothing in front at all. The
 * A1d rules hold: one outer boundary, separations drawn by shade, no strand
 * geometry, and nothing wider than the shoulder pods. Two new rules join them,
 * one from each source:
 *
 *   - **The mass pinches at the helmet's rim and swells below it.** Roots
 *     start at 0.070–0.082 — under the shell's rear skirt — where A1d rooted
 *     them at 0.092–0.108, flush with the rim band, which is exactly the
 *     "growing out of the helmet" the owner circled. The pinch-then-swell is
 *     the silhouette cue that a helmet is worn OVER hair.
 *   - **A back fall must stay narrower than the story it lies on.** The first
 *     A1d back build died as "cargo" because it was a wide pale slab; this one
 *     is dark with one lit lane and leaves the back mark's arms readable either
 *     side of it.
 *
 * The loose mass is one merged buffer and one casting mesh. The thin liner
 * tucked inside the helmet is a second, non-casting mesh fixed directly to the
 * neck: it belongs to the shell's frame, while the visible falls belong to the
 * sway frame. Keeping those two mechanical jobs separate is what prevents a
 * deep fold from rotating hidden hair out through the crown.
 */
function paintMaribelHair(geometry: THREE.BufferGeometry): void {
  // The colour pass — dark hair *with* highlights, in that order. One lit
  // plane (her right and outboard), a length ramp that only begins below the
  // shoulders, and shadow grooves carrying the internal separations that used
  // to be twelve separate silhouettes. The palette is the accepted A1d pair.
  // **The bleach runs along the strand, not down the world.** The owner's
  // second hair note is *"the highlights/tips are not obvious enough"*,
  // against `hair color ref.webp` — a dark-rooted balayage whose bottom
  // *sixty per cent* goes near-platinum, seeded higher with fine pale ribbons.
  //
  // Two builds got this wrong in opposite directions and both were wrong for
  // the same reason: the ramp was a function of **y**, so on a mass a third of
  // its old length it either covered everything or covered nothing, and
  // whatever it covered was a band of constant thickness parallel to the hem.
  // A blind Opus critic measured the second one: pale over 7% of the length
  // against the reference's ~60%, a strip 7–20 px thick whose top edge varied
  // by ten pixels across the whole width. Its word for that was *trim*.
  //
  // The ramp is `1 - uv.y` now — the fraction of the way down a strand's own
  // length — with its onset modulated by the same three-lobe wave the hem
  // uses. A long lock is pale over a long distance, a short one over a short
  // one, and the top of the pale wanders with the tips instead of ruling a
  // line across them. Coverage lands a little over half the length, which is
  // the reference's.
  //
  // **And the shadow fades out as the bleach comes in.** The previous build
  // measured 40 at the crown, **12 through the middle** and 93 at the tips: a
  // dark band above a pale band separates the pale from the hair and makes it
  // its own object. Hair reads as hair because value runs monotonically from
  // root to tip. `maribel.test.ts` still holds the rest of the shape here:
  // base the majority, shadows below the base, and the bleach a partial one.
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const u = uv.getX(i) * 2 - 1;
    const along = 1 - uv.getY(i);
    const onset = 0.62 - 0.24 * lockLength(u);
    const depth = ramp(along, onset, 0.99) * 0.94;
    const lane = 0.56 + 0.44 * ramp(-0.82 * x - 0.45 * z, -0.04, 0.10);
    const parting = 1 - ramp(Math.abs(x), 0.006, 0.052);
    const tuck = ramp(y, 0.045, 0.105);
    const grooveA = 1 - ramp(Math.abs(x + 0.030), 0.004, 0.019);
    const grooveB = 1 - ramp(Math.abs(x + 0.082), 0.004, 0.017);
    const strandGroove = Math.max(grooveA, grooveB) * ramp(along, 0.10, 0.45);
    const shadow = Math.min(0.34, parting * 0.26 + tuck * 0.26 + strandGroove * 0.10)
      * (1 - depth);
    const lit = mixTint(MARIBEL_HAIR_TINT, MARIBEL_HAIR_LIGHT_TINT, depth * lane);
    const tint = mixTint(lit, MARIBEL_HAIR_DARK_TINT, shadow);
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** The hidden liner, derived from the helmet and fixed in its own frame. */
function maribelHairCap(): THREE.BufferGeometry {
  //
  // A1b wrote it by hand and its comment claimed it was "8% inside the helmet
  // at every height". It was not, and that sentence is most of why the owner
  // has now written three times that the neck looks thick. Below the shell's
  // widest ring the helmet tapers toward the chin bar; a hand-authored cap
  // that kept its own width did not taper with it, so measured against the
  // shell's own surface it stood 24 mm proud at y = 0.12, 40 mm at 0.10 and
  // 101 mm at 0.06 — a brown collar wrapped around the *outside* of the lower
  // helmet, exactly where he keeps circling.
  //
  // Insetting the helmet's own rings makes the claim true by construction, and
  // keeps it true the next time the shell is reshaped. Below 0.086 there is no
  // cap at all: that is the rim, and what shows under it is the yoke.
  const parts: THREE.BufferGeometry[] = [loftGeometry(loftProfile(
    MARIBEL_HELMET
      .filter((ring) => ring.y >= 0.086 && ring.y <= 0.262)
      .map((ring) => ({
        ...ring,
        halfWidth: ring.halfWidth * 0.90,
        halfDepth: ring.halfDepth * 0.90,
        z: ring.z * 0.90,
      })),
  ), { radialSegments: 24, subdivisions: 1 })];

  // The visible nape gather is fixed with the liner too. It covers the pivot
  // seam below the rim while the curtain moves, and because it never rotates
  // relative to the shell it cannot become the next crown bump after the cap
  // has been separated.
  //
  // **One wrapped loft, and no longer three pieces** — the owner, on a brake
  // capture: *"the hair is not stitched together right."* Two extra lobes used
  // to sit either side of this gather, centred at x = ±0.06 and reaching
  // 0.092 — thirty-five millimetres outboard of the loose curtain's root row,
  // which tapers to 0.036 as it goes up under the rim. Below the shell they
  // had nothing behind them, so from the chase camera they read as two
  // hair-coloured tabs standing clear of the mass with the helmet's own black
  // rim in the wedge between. A hard brake tips the head 0.39 rad forward and
  // turns that wedge to face the player, which is the frame he marked up.
  //
  // They were also doing no work: removed, the deepest fold this rig can reach
  // (charged attack, full carve, held crouch, head capture) changed by **four
  // pixels**. This gather is a loft about the neck's own axis, so it wraps
  // where they cornered, and one continuous shape from inside the shell down
  // to the shoulder blades is what "one head of hair" means. Its widest ring
  // comes in to sit inside the curtain's own width at the same height, which
  // is the contract `riderClearance.test.ts` now holds it to.
  parts.push(loftGeometry(loftProfile([
    { y: 0.100, halfWidth: 0.052, halfDepth: 0.032, square: 2.6, z: -0.046 },
    { y: 0.060, halfWidth: 0.054, halfDepth: 0.036, square: 2.5, z: -0.050 },
    { y: 0.020, halfWidth: 0.066, halfDepth: 0.036, square: 2.4, z: -0.050 },
    { y: -0.020, halfWidth: 0.074, halfDepth: 0.032, square: 2.4, z: -0.050 },
    { y: -0.060, halfWidth: 0.066, halfDepth: 0.026, square: 2.4, z: -0.048 },
  ]), { radialSegments: 24, subdivisions: 1 }));
  const cap = mergeGeometries(parts);
  paintMaribelHair(cap);
  for (const part of parts) part.dispose();
  return cap;
}

function maribelHair(): THREE.BufferGeometry {
  const curtain = maribelHairCurtain();
  paintMaribelHair(curtain);
  return curtain;
}

/**
 * Her armour — moulded shoulder pods and hip sliders, as real geometry. A1c.
 *
 * A1b said "armoured shoulders" with a flat pale patch on the torso, and the
 * front capture showed what a patch can say at that size: two grey tabs. The
 * racing photograph shows *equipment* — a hard rounded pod standing over each
 * deltoid, and a slider at each hip point — and equipment is volume, so this
 * is volume: four small lofts in one merged buffer, one mesh, one draw call.
 *
 * The pods also own the shoulder join. Her chest wall now ends 19 mm inside
 * the rig's fixed arm joint, and the pod is what spans that gap — Trollina
 * closed the same join with a puff sleeve; leathers close it with armour,
 * which is the honest version for a racer.
 *
 * `casts: false`, and that is the ghost's 24-call cap making the same trade
 * A1b's cup patch made: the arm behind each pod already carries the casting
 * silhouette there, so the shadow pass and the ghost lose nothing they had.
 */
function maribelArmour(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // The shoulder pod, leaning outboard as it rises so its crest sits over
    // the arm joint at 0.175 while its skirt grips the narrowed chest wall.
    parts.push(loftGeometry(loftProfile([
      { y: 0.415, halfWidth: 0.034, halfDepth: 0.050, x: side * 0.146, z: 0.004, square: 2.5 },
      { y: 0.448, halfWidth: 0.046, halfDepth: 0.064, x: side * 0.158, z: 0.005, square: 2.6 },
      { y: 0.478, halfWidth: 0.048, halfDepth: 0.066, x: side * 0.166, z: 0.004, square: 2.6 },
      { y: 0.504, halfWidth: 0.040, halfDepth: 0.054, x: side * 0.170, z: 0.002, square: 2.5 },
      { y: 0.522, halfWidth: 0.020, halfDepth: 0.030, x: side * 0.170, z: 0, square: 2.4 },
    ]), { radialSegments: 12 }));
    // The hip slider, riding the widest ring of the seat — **seated on the
    // leather rather than half-sunk in it** (§23.9m).
    //
    // A slider is a lens 108 mm long and 20 mm thick lying on a hip that runs
    // the same way, so its surface is very nearly *parallel* to the seat's:
    // the steepest crossing anywhere on its rim changes clearance by 0.3 mm
    // per millimetre of travel. That is a grazing intersection, and a grazing
    // intersection is not a line, it is an amplifier — the 3.9 mm chord
    // sagitta of a ten-segment ring and the seat's own 0.3 mm move the
    // crossing eight millimetres along the pad, and it lands on a different
    // facet each row. Rendered, that is the stair-stepped notch an Opus critic
    // measured out of the rear edge, five pixels deep at chase distance
    // against a pad that is only sixty across.
    //
    // **So the crossing is taken out of the visible half altogether.** Each
    // ring keeps the outer face it already had — 14.8 / 8.4 / 8.9 mm proud,
    // the silhouette is untouched to a tenth of a millimetre — and slides
    // outboard until its whole outboard rim clears the seat by ~4 mm, the
    // thickness giving up exactly what the centre gains. The pale patch's
    // boundary is now the pad's *own* rim, which is a loft edge and cannot
    // step; what still crosses the seat is the inner face, buried 2.8 to
    // 9.3 mm, where nothing outside can see it. Twenty radial segments then
    // keep that rim from reading as a decagon, at a cost of eighty triangles
    // for the pair.
    //
    // The top ring is 3 mm thicker than the arithmetic asks for, and that is
    // load-bearing: solved for rim clearance alone its inner face came out
    // level with the leather, which is a puck floating off her hip.
    parts.push(loftGeometry(loftProfile([
      { y: -0.078, halfWidth: 0.012, halfDepth: 0.038, x: side * 0.165, z: 0.010, square: 2.6 },
      { y: -0.045, halfWidth: 0.008, halfDepth: 0.054, x: side * 0.181, z: 0.012, square: 2.8 },
      { y: -0.012, halfWidth: 0.008, halfDepth: 0.049, x: side * 0.178, z: 0.010, square: 2.7 },
      { y: 0.014, halfWidth: 0.006, halfDepth: 0.032, x: side * 0.169, z: 0.008, square: 2.5 },
    ]), { radialSegments: 20 }));
  }
  const merged = mergeGeometries(parts);
  // Guard-dark, with the moulded crest of each shoulder pod catching a step
  // more light — the same one-lighter-line grammar every guard here uses.
  const position = merged.getAttribute('position');
  const colour = merged.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const crest = y > 0.470 && y < 0.512 ? ramp(y, 0.470, 0.496) : 0;
    const value = MARIBEL_GUARD_SHADE
      + (MARIBEL_RIM_SHADE * 0.78 - MARIBEL_GUARD_SHADE) * crest;
    colour.setXYZ(i, value, value, value);
  }
  for (const part of parts) part.dispose();
  return merged;
}

export const MARIBEL_LOOK: RiderLook = Object.freeze({
  id: 'maribel-vargas' as CharacterId,
  /**
   * **The one look on the roster that spends triangles freely**, by the
   * owner's own instruction on the night he rejected A1: *"we gonna have to
   * tweak the plans, break the graphics budget to get her to look good. If
   * playing as her drops the framerate then so be it. Her looking good is
   * priority one. Whatever you need, more polygons or whatever else, i don't
   * care."*
   *
   * Read exactly, that permission buys less than it sounds like and more than
   * it looks like. Draw calls are the axis a frame ceiling is actually made
   * of, and none of these numbers touches one — a section is triangles, and
   * §9's 400 k ceiling had over a hundred and sixty thousand spare when this
   * was written. What the density buys is a rounder silhouette at the two
   * places a woman's figure is stated (the waist and the shoulder line), paint
   * boundaries that land where they were authored instead of where the nearest
   * facet is, and a chest patch that follows a curved ribcage instead of
   * folding across it. `docs/RENDER_COST.md` carries the measured result.
   */
  density: Object.freeze({ limb: 26, torso: 44, head: 32, boot: 22, hand: 24, neck: 16 }),
  /**
   * Her printed sheet, and the two materials that sample it.
   *
   * **Only two**, deliberately. Her decals are patches and her hair is an
   * extra, and both are drawn in `accent`; the visor is `face`. The suit, the
   * limbs, the boots and the helmet carry no map at all, so the overwhelming
   * majority of her surface is exactly the vertex-tinted loft every other
   * rider is, and a bug in the atlas can only ever be a bug on a decal.
   */
  atlas: Object.freeze({
    build: createMaribelAtlas,
    roles: Object.freeze(['accent', 'face'] as RiderMaterialRole[]),
    region: (art: string | undefined): UvRect => (
      art !== undefined && art in ATLAS_REGIONS
        ? ATLAS_REGIONS[art as AtlasRegionName]
        : ATLAS_REGIONS.blank
    ),
  }),
  materials: Object.freeze({
    body: MARIBEL_SUIT,
    // One garment: a one-piece suit's sleeves and its torso are the same
    // leather, and two roles on one spec build one material.
    limbs: MARIBEL_SUIT,
    accent: MARIBEL_MARK,
    head: Object.freeze({
      colour: BLOCKOUT_COLOURS.maribelHelmet,
      // **Matte, where Red Rider's lid and Adonisb2's are gloss**, and that is
      // the photograph: hers is a matte black shell. It is also the right
      // choice for this character even if it were arguable, because the visor
      // is the identity here and a shiny shell competes with it.
      //
      // A1d took it further to 0.62: at 0.46 the crown was rendering a 2.2x
      // specular bloom over a shell authored near-black, so the comment above
      // was describing something the render did not do and the lid read as
      // glossy plastic — a bicycle helmet, not a race lid.
      roughness: 0.62,
      metalness: 0,
    }),
    face: Object.freeze({
      // The mirrored blue-cyan — recognition item two, and the loudest thing
      // she wears. It borrows Adonisb2's mirror approximation (low roughness,
      // real metalness, a cool emissive that keeps the glass luminous in
      // shade) and points it at a *hue* rather than at a neutral: his mirror
      // is what a chrome visor does to a grey sky, hers is what a blue one
      // does to any sky at all.
      colour: BLOCKOUT_COLOURS.maribelVisor,
      // A1c pushes the mirror further: the reviewer's note — from thirty
      // metres the blue visor should scream her — and the widened patch below
      // give it the area; these give it the light.
      roughness: 0.05,
      metalness: 0.44,
      emissive: 0x1d4f6b,
      emissiveIntensity: 0.58,
    }),
    gear: MARIBEL_GEAR,
  }),
  profiles: Object.freeze({
    torso: MARIBEL_SUIT_TORSO,
    seat: MARIBEL_SEAT,
    thigh: MARIBEL_THIGH,
    shin: MARIBEL_SHIN,
    upperArm: MARIBEL_UPPER_ARM,
    forearm: MARIBEL_FOREARM,
    neck: MARIBEL_NECK,
    head: MARIBEL_HELMET,
    boot: MARIBEL_BOOT,
    bootSole: BOOT_SOLE,
    hand: MARIBEL_HAND,
  }),
  // `seat` barely steps: it is the same leather as the torso on a one-piece,
  // and the waist above it is doing the work a hem does on the men. `legs` at
  // 1.0 because the legs' base *is* the suit and every panel on them is paint.
  // The neck is the gear material well down — a black gaiter under her chin, as
  // Red Rider's and Adonisb2's are.
  shades: Object.freeze({ seat: 0.97, legs: 1.0, collar: 1.10, sole: 0.62, neck: 0.74 }),
  // The thumb and the two finger lobes, merged into the hand's own mesh.
  build: Object.freeze({
    hand: Object.freeze([maribelThumb, maribelFingersInner, maribelFingersOuter]),
  }),
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
    // The moulded shoulder armour does not cast, and the hair does — that is
    // her trade. A ghost is capped and the hair is the one line that says
    // which rider the recording is of; the cups lose because her arm hangs
    // from a joint 10 mm outside her chest, so at chase distance the limb is
    // the silhouette there and the armour is decoration on it — where Cool
    // Rider's shoulder panel, which does cast, is the largest identity element
    // he owns. (`ghostRider.test.ts` holds the cap; the aero hump that used to
    // share this trade is gone — q59.)
    // **The printed chest, as one patch wearing one page of the atlas** — and
    // this single entry is what Phase A1b exists for.
    //
    // A1 spent three patches here drawing an *invented* white device in the
    // shape class of the manufacturer's mark on her real suit, because a mark
    // could not be drawn and a shape could. The owner's answer to that, on his
    // ride, was *"About the logo on her chest, do the one in the real photo"* —
    // and the one in the real photo is a trademark this project may not
    // reproduce (`NOTICE.md`). What ships is the resolution recorded as q57:
    // **her own devil-and-M, in white, at that mark's scale and position**,
    // which is the thing he was actually pointing at — a real, specific,
    // *hers* mark in the place the photograph puts one.
    //
    // The halftone comes with it. §23.4 wrote that the print was "expected to
    // simplify" at this fidelity, §23.9d repealed the clause, and the dots are
    // now dots: several hundred of them, aqua from her right, coral from her
    // left, over a near-white ground with the zip down the middle. All of it —
    // print, mark, zip — is one patch, one page, one draw call's share of a
    // mesh that already existed.
    //
    // `shade: 1` is load-bearing. The page is painted as a *multiplier*, so
    // the pale accent material is the ceiling every ink on it hangs from; a
    // shade here would darken the ground and take the whole print down with it.
    torso: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // **Her full logo, printed large and flat between the shoulder
        // blades** — q59, the owner's own call after his A1d ride, and the
        // photograph agrees with him: IMG_6601 finally shows her real back,
        // and it is smooth — no speed hump. The hump this replaces was an
        // invention twice over: a volume no reference showed, wearing a mark
        // its own curvature stretched into drips ("missing the M and the W
        // merge", in his words, because the letters did not survive the
        // surface). A flat panel is the one canvas that cannot distort her
        // artwork, and losing the pod refunds a casting mesh.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.66,
          u1: 0.66,
          from: 0.135,
          to: 0.356,
          uSegments: 12,
          vSegments: 10,
          lift: 0.004,
          sink: -0.009,
          taper: 0.06,
          shade: 1,
          art: 'backMark',
        }),
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -1.16,
          u1: 1.16,
          from: 0.030,
          to: 0.478,
          // Dense, because this patch is a *screen* now: the print's dots are
          // texels, but the surface they lie on still has to follow a chest
          // that curves in two directions, and a coarse grid would fold the
          // halftone along its own facets.
          uSegments: 24,
          vSegments: 26,
          // Barely proud. A printed panel on a race suit is ink, not armour,
          // and the reason it is a patch at all is the crisp edge and the
          // opaque underside — not relief.
          lift: 0.004,
          sink: -0.009,
          // The lens shape: the field is widest across the chest and narrows
          // toward the waist, which is what the reference's print does and
          // what keeps a rectangle of dots from reading as a bib.
          taper: 0.14,
          shade: 1,
          art: 'chest',
        }),
      ]),
    }),
    // The knee guard's upper half, on the thigh — `RiderLook.panels.thighPad`
    // records why it cannot live with the rest of it. Hers is a low moulded
    // slider rather than Adonisb2's motocross shell: dark, close to the leg,
    // and reading by relief and edge rather than by colour, which is what the
    // photographs show and what keeps a bright pad from merging into the
    // wheel's shell at exactly this height.
    thighPad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // **Centred on the front of the leg** — the owner's bug-hunt ride
        // caught these "inverted inwards", and he was reading the numbers off
        // the screen: the span used to run −0.58…+1.70 about the front, and
        // +u from the front is *inboard* on both legs once `mirrored` does its
        // job, so every cup wrapped the inside of its knee. Her photograph
        // hangs the slider on the outer-front; he settled for straight
        // forward, which is this — the same 2.28 rad of arc, symmetric.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -1.14,
          u1: 1.14,
          mirrored: true,
          from: -0.398,
          to: MARIBEL_CUP_TOP,
          uSegments: 7,
          vSegments: 3,
          lift: 0.016,
          taper: 0.30,
          shade: MARIBEL_GUARD_SHADE,
        }),
        // The moulded rim along the guard's outer edge — the one lighter line
        // on it, and the whole reason a near-black guard on near-black leather
        // is legible at all.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.26,
          u1: 0.26,
          from: -0.374,
          to: -0.344,
          uSegments: 4,
          vSegments: 1,
          lift: 0.021,
          taper: 0.66,
          shade: MARIBEL_RIM_SHADE,
        }),
        // **VARGAS down the outside of her right thigh** — A1b, and the piece
        // of the reference that simply could not exist before this phase.
        //
        // Both the photograph and the regenerated render carry a manufacturer's
        // wordmark here, running the length of the leg. That name never ships
        // (`NOTICE.md`); hers does (q50 — *"she is well known in euc
        // community"*), and it is the better mark anyway, since the only word
        // worth reading off a leg at riding speed is the rider's.
        //
        // `artOn: -1` because a leg script exists once on a person. It is on
        // her right leg, which is −X, which is also the side whose outboard
        // face is furthest from the loft's shared seam — the one place the
        // texture coordinate runs backwards (see `blockoutKit.ts`). Her left
        // thigh builds the identical patch and wears the blank page.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.40,
          u1: 0.40,
          from: -0.300,
          to: -0.052,
          uSegments: 5,
          vSegments: 8,
          lift: 0.004,
          sink: -0.008,
          taper: 0.10,
          shade: 1,
          art: 'legScript',
          artOn: -1,
          artElse: 'legPlain',
        }),
      ]),
    }),
    kneePad: Object.freeze({
      role: 'accent' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // The cup over the knee itself, carrying the proud form across the
        // hinge so the guard does not end in a step at the joint. Centred on
        // the front for the thigh cup's reason — the pair used to wrap inboard.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -1.14,
          u1: 1.14,
          mirrored: true,
          from: MARIBEL_CUP_BOTTOM,
          to: 0.000,
          uSegments: 7,
          vSegments: 1,
          lift: 0.018,
          taper: 0.30,
          shade: MARIBEL_GUARD_SHADE,
        }),
        // The slider plate down the upper shin, stopping well above the accent
        // cuff so the two never argue.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -0.97,
          u1: 0.97,
          mirrored: true,
          from: -0.108,
          to: MARIBEL_CUP_BOTTOM,
          uSegments: 6,
          vSegments: 4,
          lift: 0.015,
          taper: 0.42,
          // **The plate is a printed page in A1b**, and it is the one addition
          // here taken straight off the regenerated render: both her knee cups
          // carry a pale chevron device, which is her own M's inner V with the
          // head taken off it. A knee is at the exact height of the wheel's
          // shell, so this mark does the job A1's near-black guard could not —
          // it says where her knee *is* in a silhouette that otherwise merges
          // rider and machine at that line. The plate's own value comes back as
          // ink, so the guard is the same grey it was.
          shade: 1,
          art: 'kneeDevice',
        }),
        // Its lower strap.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -Math.PI,
          u1: Math.PI,
          from: -0.126,
          to: -0.110,
          uSegments: 14,
          vSegments: 1,
          lift: 0.018,
          taper: 0.26,
          // Webbing: a step *below* the leather it is strapped over.
          shade: MARIBEL_LEATHER_SHADE * 0.88,
        }),
      ]),
    }),
    // Three patches, shaded for a matte black shell: the chin bar and the brow
    // step down toward the visor, and the base rim steps up so the helmet ends
    // somewhere. Every other full-face lid in this file wears a fourth — see
    // the note where hers used to be.
    head: Object.freeze([
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.70,
        u1: 0.70,
        from: 0.098,
        to: 0.146,
        uSegments: 6,
        vSegments: 3,
        lift: 0.015,
        taper: 0.42,
        shade: 0.86,
      }),
      // The brow step. **Its ends were a tab on the outline** — M23: a blind
      // critic traced the shell's right silhouette stepping out two pixels at
      // y ≈ 0.26 and back in fifteen rows later, which a convex loft cannot do.
      // It read as a chip, the same class as the spoiler the owner circled,
      // and it was this band's corner: 11 mm proud, ending over seven segments
      // where the shell is already turning away from a rear camera. The lift
      // comes down and the taper doubles, which keeps the step across the brow
      // — where it is seen head-on and does its job — and lets the ends melt.
      //
      // **And it has to sit ABOVE the eyeport, not inside it** — the owner's
      // *"strips of black on the helmet's front visor"*. A1d gave the visor
      // `bulge: 0.52`, which arches its top edge from a flat 0.250 up to 0.267
      // at the centreline; this band was left where a flat visor had put it,
      // at 0.252–0.270, so the arch spent fifteen thousandths of a ring
      // *inside* the band. Two patches on one shell one millimetre apart in
      // lift (0.007 against the visor's 0.008), tessellated 9 segments against
      // 16, interleave — and what that renders as is a row of dark teeth
      // biting down into the glass, nine of them, across exactly the 0.86/1.22
      // of the visor's width this band spans. Moving it clear of the arch
      // removes the strip outright; raising its lift would only have made a
      // fighting band win. **A patch that overlaps another patch on the same
      // body is a bug, not a stack** — there is no depth order between them.
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.86,
        u1: 0.86,
        from: 0.274,
        to: 0.292,
        uSegments: 9,
        vSegments: 1,
        lift: 0.007,
        taper: 0.62,
        shade: 0.78,
      }),
      // **There is no rear spoiler, and its removal is the owner's note.** He
      // circled a lump on the crown and asked *"not sure what the purpose is.
      // an error?"* — which is the only answer that matters about a detail
      // whose whole job is to be recognised. It was her own lid's fin
      // (IMG_6601), authored as a 39-degree patch lifted 22 mm, and at a
      // helmet 238 mm wide that is a hexagonal tab standing off the shell with
      // its own hard shadow, not a spoiler. M19's pivot boss taught the same
      // lesson on the same surface and this file already carried the note.
      // A fin is a thing you resolve at arm's length; at riding distance the
      // crown is a silhouette, and the honest version of a small aerodynamic
      // detail at that size is no geometry at all.
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
    // The big wrapping shield at Red Rider's proven ±1.05 rad, which is what
    // turns the corner of the shell and makes it glass around a face rather
    // than a letterbox. On this rider it is the loudest identity element on the
    // character, so it is the one patch here with no shade at all.
    //
    // **A1b puts the iridescence on it.** The note above this file's other
    // visor records a mirror blaze tried and removed — a hard bright patch on
    // a face at this polygon count read as "that bandaid white square thing".
    // A texture is the thing that was missing: the whole sweep goes on at once,
    // deep blue at the brow through cyan at the chin with one soft band across
    // it and no edge anywhere for the eye to catch. Generic blue-cyan mirror,
    // no brand on the shield, and none on the shell either.
    face: Object.freeze({
      role: 'face' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          // **±1.22 rad, past Red Rider's proven ±1.05** — A1c. Her helmet is
          // her loudest identity element and it was wearing a visor cut for a
          // neutral lid; this is the widest glass on the roster, wrapped
          // further round the corner of her own swept shell, with the chin
          // bar thinned and the brow raised so the extra glass actually shows.
          u0: -1.22,
          u1: 1.22,
          // **An eyeport, not a letterbox** — A1d. The span is the same
          // height at its ends and half again as tall through the middle, so
          // the brow arcs and the chin edge notches down over the nose. Every
          // gauntlet round called the flat blue rectangle the loudest wrong
          // thing on the front of her, and it was structural: a constant-`v`
          // band is two horizontal rings around the shell and can never be
          // anything else, however wide it is cut.
          // The span is authored *flat* and the swell is what shapes it, so
          // the two numbers have to leave room for the arch: at bulge 0.52 the
          // brow reaches 0.279 at the centreline against a crown at 0.342, and
          // a capture with `to` at 0.296 put the glass on top of her head.
          from: 0.148,
          to: 0.250,
          bulge: 0.52,
          bow: -0.010,
          uSegments: 16,
          vSegments: 5,
          lift: 0.008,
          sink: -0.014,
          taper: 0.18,
          art: 'visor',
        }),
      ]),
    }),
  }),
  extras: Object.freeze([
    Object.freeze({
      name: 'rider-armour',
      joint: 'pelvis' as const,
      role: 'accent' as RiderMaterialRole,
      // Non-casting: the arm behind each pod carries the casting silhouette
      // there, and the ghost's 24-call cap is why that trade exists at all
      // (`ghostRider.test.ts`).
      casts: false,
      build: maribelArmour,
    }),
    Object.freeze({
      name: 'rider-hair-cap',
      joint: 'neck' as const,
      role: 'accent' as RiderMaterialRole,
      // Hidden under the shell and fixed to the head. It must not share the
      // loose hair's sway pivot, and the helmet already casts its silhouette.
      casts: false,
      art: 'hair',
      build: maribelHairCap,
    }),
    Object.freeze({
      name: 'rider-hair',
      joint: 'neck' as const,
      role: 'accent' as RiderMaterialRole,
      // It casts, and Trollina's hair is the precedent: from behind — which is
      // where the player is — the mass *is* the outline, and the ghost should
      // draw it for the same reason. It matters more now than it did for the
      // tail: this is the largest thing on the character that is not the suit.
      casts: true,
      art: 'hair',
      sways: true,
      build: maribelHair,
    }),
  ]),
  paint: Object.freeze({
    torso: paintMaribelTorso,
    upperArm: paintMaribelUpperArm,
    forearm: paintMaribelForearm,
    thigh: paintMaribelThigh,
    shin: paintMaribelShin,
    boot: paintMaribelBoot,
    hand: paintMaribelHand,
  }),
  // A racer's carriage: hands a little narrower and lower than Cool Rider's,
  // which is the compact tuck the carving video holds for its whole thirteen
  // seconds. Small, because it is added to the base target and the rig's own
  // deliberate left/right asymmetry has to survive it.
  armCarriage: Object.freeze({ splay: -0.006, rise: -0.010 }),
});

// -- Wheel in Motion ----------------------------------------------------------
//
// M28 Phase 1 — the sixth playable look, the fourth real person, and the first
// whose *garment* is printed rather than painted. `references/Wheel-In-Motion/`
// holds the photograph he posted, his channel's mark and an AI target render;
// the brief's recognition order (§14) is the build order here: the blue-and-
// yellow jersey, the blue lid over a dark visor, his mark, the large white
// knee and shin armour, the pack straps, blue trousers, black boots and
// gloves. His wheel is Phase 2 (`docs/PLANS.md` §28.9).
//
// **Three things decide the shape of this section** (`docs/PLANS.md` §28.4):
//
//   - **Two saturated hues on one jersey cannot be reached from either**, so
//     the body material is a near-white printing ground and the whole torso
//     and both sleeves are folded onto pages of his sheet (`RiderAtlas.lofts`,
//     `render/wimAtlas.ts`). Blue is ink, yellow is ink, his mark is his file.
//   - **The legs are Adonisb2's inversion one step paler**: the same pale
//     ground, painted down to the jersey's blue above the guard, held at
//     guard-white under the shell, and down to boot-black below it — three
//     colours from one material at zero draw calls.
//   - **The lid is the roster's road shell in his colours.** The owner's look
//     pass (2026-09-01) struck the off-road lid Phase 1 built — peak, chin
//     bar volume, orange trim — on sight: Cool Rider's rings and patches, a
//     yellow chin bar and yellow sweeps as one extra in the print material
//     wearing a flat yellow page, a dark visor in the aperture. Orange is
//     his wheel's (Phase 2) and his mark's, and nothing else on him.
//
// Parity: at or under Cool Rider's meshes and calls (`redRider.test.ts`), with
// the pack in the shoulders' buffer — no sleeve group, no elbow group; his
// sleeves are print.

/**
 * Where the knee guard's upper shell begins on the thigh — 0.73. The
 * clearance contract of the day chose it: 0.70 put the shell's proud top
 * corner 78 mm under the pelvis in the deepest attack-carve-crouch fold
 * against a 75 mm fitted-bodice ceiling, and 0.72 sat on the ceiling exactly;
 * Adonisb2's 0.75 was tuned to the same contract with a 20 mm shell.
 *
 * **That justification is history, not the reason the number stands** (M30
 * Phase 3, q121). The contract it cites measured a bare height in the pelvis
 * frame and had never applied the pelvis hinge; re-derived on the jacket
 * loft's own section with the hinge written (`riderClearance.test.ts`, the
 * hem-ring and shell metrics), the "78 mm under a 75 mm ceiling" was a knee
 * lifted 293 mm in front of the body by a crouch, and 0.70 clears the honest
 * floor by about 130 mm as 0.735 clears it by 138. The value is kept as the
 * look he accepted; move it for the look, never for that ceiling.
 */
const WIM_GUARD_TOP = 0.735;
/**
 * The knee cup's two edges, thigh side then shin side, in each bone's space.
 *
 * **Small, and that is the gauntlet's finding.** The first round inherited
 * Adonisb2's 65 mm cup and the blind gear critic read the whole brace as
 * black-dominant — the render's brace is white with a modest black cup set
 * into it. The cup is 54 mm now, and the white runs above and below it.
 */
const WIM_CUP_TOP = -0.380;
const WIM_CUP_BOTTOM = -0.030;
/** Where the boot's shaft begins on the shin: laced boots, low on the shin. */
const WIM_BOOT_TOP = 0.72;

/** A profile's cross-section at a height — `adonisb2ShellRing`, for any profile. */
function ringOf(profile: LoftProfile, y: number): LoftProfile[number] {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (y <= first.y) return first;
  if (y >= last.y) return last;
  let lower = first;
  let upper = last;
  for (let i = 1; i < profile.length; i += 1) {
    if (profile[i]!.y < y) continue;
    lower = profile[i - 1]!;
    upper = profile[i]!;
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
 * The jersey: Cool Rider's jacket silhouette, re-rung every 30 mm.
 *
 * **The rings are for the print, not the outline.** A loft's texture row is a
 * ring index, so on the ten-ring jacket one page row covers 6 mm at the hem
 * and 135 mm through the chest, and a mark spanning two of those intervals is
 * stretched inside itself. Sampling the same silhouette at even heights makes
 * `v` linear in metres everywhere the print carries structure, which is what
 * lets `render/wimAtlas.ts` stamp his mark at its own aspect from arithmetic.
 * The hem lip and the collar taper keep their authored rings.
 */
const WIM_JERSEY = loftProfile((() => {
  const heights = [-0.010, 0.018];
  for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030) heights.push(Math.round(y * 1000) / 1000);
  heights.push(0.500, 0.528, 0.548);
  return heights.map((y) => ringOf(JACKET, y));
})());

/**
 * A limb re-rung at chosen heights, keeping `limbProfile`'s taper — for a
 * limb that is going to be **printed on**.
 *
 * **A page over a patch is ring-index space, and the second gauntlet round
 * measured what that costs.** `limbProfile` puts its padding seams down as
 * ring *pairs* a few millimetres apart, and one of its default stops landed a
 * millimetre from a seam ring; a printed shell spanning that region gave forty
 * per cent of its page's height to eight millimetres of leg, and his mark on
 * the knee shell came back crushed to 1.3 : 1 with the *i* squeezed out of it
 * (`DESIGN.md` §7i's "not linear in metres", paid for). The jersey never
 * suffered because it was re-rung evenly for the same reason. So the legs are
 * too: even rings across everything a page lands on, and a close pair only
 * where a paint boundary needs one, placed outside the printed spans.
 */
function limbAtHeights(
  length: number,
  radii: readonly [number, number, number],
  heights: readonly number[],
  options: { flatten: number; square: number },
): LoftProfile {
  const [top, mid, end] = radii;
  const radiusAt = (t: number): number => (
    t < 0.5 ? top + (mid - top) * (t / 0.5) : mid + (end - mid) * ((t - 0.5) / 0.5)
  );
  const rings = heights.map((y) => {
    const radius = radiusAt(Math.min(1, Math.max(0, -y / length)));
    return { y, halfWidth: radius, halfDepth: radius * options.flatten, square: options.square };
  });
  // The hemispherical close, as `limbProfile` makes it.
  for (const [t, scale] of [[0.5, 0.86], [0.85, 0.54], [1, 0]] as const) {
    rings.push({
      y: -length - end * 0.55 * t,
      halfWidth: end * scale,
      halfDepth: end * scale * options.flatten,
      square: options.square,
    });
  }
  return loftProfile(rings);
}

/**
 * The hip dome over the thigh's top, in the thigh's frame (`y` 0 is the hip
 * joint): 60 mm of rounded close, the Drunkard's fix (`DRUNKARD_HIP_DOME`)
 * on the second rider whose trousers are not black. The rig drops the
 * inside hip 85 mm under the pelvis in a carve and the outside hip 150 mm
 * in a technical corner, and counter-rolls the seat's hem up on the outside
 * by 26 mm more, so a thigh that ends in a flat cap at the joint ends in a
 * flat cap below the hem with the seat's underside showing over it — every
 * rider does it, and the owner found it on him (2026-09-03, after the
 * Drunkard's release: *"WiM had the problem!"*). His trouser blue shows the
 * cut the way amber does. Sized with `WIM_SEAT`'s hem so the dome still
 * reaches into the seat through the technical corner's drop and lift;
 * `riderClearance.test.ts` sweeps both riders.
 */
const WIM_HIP_DOME_APEX = 0.060;
const WIM_HIP_DOME: LoftRing[] = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [WIM_HIP_DOME_APEX, 0]].map(([y, scale]) => ({
  y: y!,
  halfWidth: 0.079 * scale!,
  halfDepth: 0.079 * 0.94 * scale!,
  square: 2.4,
}));

/**
 * The thigh: even 20 mm rings under the shell (−0.400 → −0.300), a pair at
 * the guard-white paint boundary just above the shell's top edge, even rings
 * up to the hip, and the hip dome over the joint. The dome's rings sit above
 * `y` 0, so the shell's page (`WIM_THIGH_SHELL`, −0.400 → −0.300) is
 * addressed by height exactly as before.
 */
const WIM_THIGH = loftProfile([
  ...limbAtHeights(
    RIDER_BLOCKOUT.thighLength,
    [0.079, 0.072, 0.061],
    [
      0, -0.040, -0.080, -0.120, -0.160, -0.200, -0.240, -0.270,
      -RIDER_BLOCKOUT.thighLength * WIM_GUARD_TOP + 0.002,
      -RIDER_BLOCKOUT.thighLength * WIM_GUARD_TOP - 0.002,
      -0.300, -0.320, -0.340, -0.360, -0.380, -0.400,
    ],
    { flatten: 0.94, square: 2.4 },
  ),
  ...WIM_HIP_DOME,
]);

/**
 * The seat: Cool Rider's rings with the hem 30 mm lower and the bottom two
 * rings a size wider, so the taper still closes over the thighs instead of
 * pinching them — the other half of the hip fix, as `DRUNKARD_SEAT`. In the
 * technical corner the outside hip drops 150 mm and the counter-roll lifts
 * that side's hem 26 mm, and the dome has to reach the hem through both —
 * 118 + 60 against 150 + 26. Every vertex of it carries `WIM_SEAT_SHADE`
 * and is repainted trouser blue by `paintWimTorso`, so the extra 30 mm is
 * trouser and not a hem line; it lands on the sheet's blank page like the
 * rest of the seat.
 */
const WIM_SEAT = loftProfile([
  { y: -0.118, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.78 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.088, halfWidth: 0.84 * TORSO_HALF_WIDTH, halfDepth: 0.85 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
]);
/**
 * The shin: a pair at the cup's lower edge, even rings under the plate, a
 * pair at the boot's collar, and a boot-sized end radius.
 */
const WIM_SHIN = limbAtHeights(
  RIDER_BLOCKOUT.shinLength,
  [0.064, 0.058, 0.053],
  [
    0, WIM_CUP_BOTTOM + 0.002, WIM_CUP_BOTTOM - 0.002,
    -0.050, -0.080, -0.110, -0.140, -0.170, -0.200, -0.224, -0.250,
    -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP + 0.002,
    -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP - 0.002,
    // A second ring under the collar, so its band is two rows with a hard
    // edge and not one painted ring interpolating into its neighbours.
    -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP - 0.014,
    -0.300, -0.340, -0.380,
  ],
  { flatten: 0.92, square: 2.4 },
);

/**
 * Smooth long sleeves: no padding seams, because the jersey has none — and
 * a **dome over the shoulder joint**, which every other arm on the roster
 * leaves as a flat capped disc under its shoulder panels. He wears no such
 * panel (his shoulders are print), and the gauntlet saw the disc: "a yellow
 * flap juts past the arm silhouette with a knife edge". The dome is the
 * deltoid, and it takes the sleeve page's yellow yoke with it.
 */
const WIM_UPPER_ARM = loftProfile([
  { y: 0.034, halfWidth: 0, halfDepth: 0 },
  { y: 0.028, halfWidth: 0.030, halfDepth: 0.029, square: 2.3 },
  { y: 0.014, halfWidth: 0.050, halfDepth: 0.048, square: 2.3 },
  ...limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.058, 0.050, 0.043], [], {
    flatten: 0.95,
    square: 2.3,
  }).slice().reverse(),
]);
const WIM_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.047, 0.041, 0.033], [], {
  flatten: 0.94,
  square: 2.3,
});

/**
 * The lid: the roster's road shell in rings of his own — Cool Rider's
 * `HELMET` from the temples up, a base ring under it so the shell sits down
 * on the shoulders (he wears no collar), and a chin that leads the visor *in
 * the profile itself* rather than as a patch.
 *
 * **Two look passes by the owner** (2026-09-01). Phase 1 built the off-road
 * lid the brief's §7 asked for — a peak and a chin bar as volumes leaving
 * the shell — and on the ride he saw a snout: *"it's like... a pig!"* The
 * first pass replaced it with Cool Rider's rings and hung the yellow on as
 * lifted patches, a chin bar and four raked sweeps, and he saw those too:
 * *"those yellow panels protruding... it should blend better. the adonis
 * character is a good example of a helmet done right."* Adonisb2's stripes
 * stand three millimetres off a computed shell; this goes the whole way. The
 * shell is folded onto a page of his sheet (`RiderAtlas.lofts.head`), so
 * every colour on it is print lying on the surface (`render/wimAtlas.ts`,
 * `paintHelmet`), and the only geometry on the head is the shell and Cool
 * Rider's brow and base rim, in blue. Not his spoiler: on the third ride the
 * owner saw *"a bump on the back protruding... not sure why its there"*,
 * and a printed lid needs no blade to give the chase camera something.
 *
 * The chin: the rings from the jaw to the visor's lower edge carry more
 * depth and sit further forward than Cool Rider's, so the leading edge at
 * 132 mm up stands 148 mm ahead of the neck against 137 at the visor — the
 * lead Cool Rider's 15 mm chin-bar patch supplies, as a swell of the shell
 * with no rim to catch the light. The crown gains two rings so the dome
 * rounds off at the density the print asks for.
 */
const WIM_HELMET = loftProfile([
  // The three lowest rings hold the jaw's width — the mockup's cheek pads run
  // near-parallel to a broad base (75% of the shell's widest at 90% of its
  // height; the first cut pinched to 58% there, a bulb on a stalk from the
  // chase camera). Depth, lead and `square` are the rings the owner's third
  // ride accepted, untouched.
  { y: 0.058, halfWidth: 0.088, halfDepth: 0.072, square: 2.3, z: 0.012 },
  { y: 0.088, halfWidth: 0.094, halfDepth: 0.086, square: 2.4, z: 0.018 },
  { y: 0.112, halfWidth: 0.104, halfDepth: 0.118, square: 2.5, z: 0.022 },
  { y: 0.132, halfWidth: 0.112, halfDepth: 0.128, square: 2.6, z: 0.020 },
  { y: 0.158, halfWidth: 0.119, halfDepth: 0.130, square: 2.6, z: 0.010 },
  { y: 0.215, halfWidth: 0.124, halfDepth: 0.133, square: 2.5, z: 0.004 },
  { y: 0.268, halfWidth: 0.113, halfDepth: 0.119, square: 2.3 },
  { y: 0.290, halfWidth: 0.101, halfDepth: 0.106, square: 2.25 },
  { y: 0.308, halfWidth: 0.084, halfDepth: 0.088, square: 2.2 },
  { y: 0.324, halfWidth: 0.064, halfDepth: 0.067, square: 2.2 },
  { y: 0.336, halfWidth: 0.040, halfDepth: 0.042, square: 2.2 },
  { y: 0.348, halfWidth: 0, halfDepth: 0 },
]);

/** The print ground: the ceiling every ink on him hangs from. Matte, like a jersey. */
const WIM_PRINT: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.wheelInMotionPrint,
  roughness: 0.82,
  metalness: 0.0,
});

/**
 * The lid: the print ground under the helmet page, glossier than the jersey.
 * A spec of its own rather than `WIM_PRINT` so the shell is plastic while
 * the jersey stays cloth; it samples the sheet because `head` is a mapped
 * role, and the page carries every colour on it.
 */
const WIM_LID: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.wheelInMotionPrint,
  roughness: 0.46,
  metalness: 0.0,
});

/** Boots, gloves, the pack and its straps, the gaiter: the glossier black. */
const WIM_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.wheelInMotionGear,
  roughness: 0.62,
  metalness: 0.0,
});

// -- Wheel in Motion's paintwork ----------------------------------------------
//
// The legs are print-ground based, so every tint below paints *down* — the
// direction the multiplier honours.

/**
 * Pale → the jersey's blue. His trousers are the jersey's own blue by the
 * owner's call (2026-09-01) — *"make his pants same blue as shirt"* — not
 * the photograph's denim. `shades.seat` is overridden to this same tint, so
 * hem and hip agree.
 */
const WIM_TROUSER_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionBlue);
/**
 * Pale → the guard's white under the shell — *above* the ground, as the shell
 * patches are (`WIM_GUARD_SHADE`), so the armour is the brightest thing on
 * the lower body: three gauntlet rounds read it at the ground's value as grey.
 */
const WIM_GUARD_SHADE = 1.30;
const WIM_GUARD_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGuard, WIM_GUARD_SHADE);
/** Pale → the knee cup's near-black — must equal the `cap` page's ink (the hinge rule). */
const WIM_CAP_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGear);
/** Pale → the boot's shaft. */
const WIM_BOOT_TINT = WIM_CAP_TINT;
/** Panel lines on a boot: the gear colour one step up, the M19 grammar. */
// 2.2×, not 1.3×: on a gear black that lands at sRGB 3 under the sun, a
// 1.3× step is one 8-bit level — the third blind round measured the boot's
// collar, laces and the glove's cuff and knuckles as invisible. 2.2× is
// twenty levels and still under the sole's own step and the guard's white.
const WIM_BOOT_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionGear, BLOCKOUT_COLOURS.wheelInMotionGear, 2.2);
/** The same step up, reached from the pale shin the shaft is painted on. */
const WIM_BOOT_PANEL_ON_SHIN_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGear, 2.2);

/**
 * Is this point on the leg under the guard's shell? Adonisb2's arc — from a
 * little inboard of straight ahead, across the front, round the outboard
 * flank toward the back — for his reason: from behind, the player sees the
 * outboard side of both legs and almost none of the front.
 */
function underWimGuard(x: number, z: number, side: number): boolean {
  const angle = Math.atan2(side * x, z);
  return angle > -0.75 && angle < 2.60;
}

/** Trouser blue, except where the shell covers the lower thigh; the cup's black under the cup. */
function paintWimThigh(geometry: THREE.BufferGeometry, side: number): void {
  const top = -RIDER_BLOCKOUT.thighLength * WIM_GUARD_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const under = underWimGuard(position.getX(i), position.getZ(i), side);
    const tint = !under || y > top
      ? WIM_TROUSER_TINT
      : y <= WIM_CUP_TOP
        ? WIM_CAP_TINT
        : WIM_GUARD_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** Guard-white under the shell, trouser blue behind it, the boot's shaft below the collar. */
function paintWimShin(geometry: THREE.BufferGeometry, side: number): void {
  const cuff = -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const x = position.getX(i);
    const z = position.getZ(i);
    let tint: Tint;
    if (y < cuff) {
      // The boot's shaft — with its collar and its laces as the lighter
      // panel lines a boot needs to read as one rather than as dark trouser
      // (the gauntlet's "no shaft" finding): a band at the top of the shaft,
      // and a strip up its front.
      const collar = y > cuff - 0.016;
      // Wide enough to catch the front columns: at 18 segments the nearest
      // sit at |x| = 12.8 mm, and an 11 mm window painted no vertex at all.
      const laces = z > 0 && Math.abs(x) < 0.017 * (Math.hypot(x, z) / 0.05);
      tint = collar || laces ? WIM_BOOT_PANEL_ON_SHIN_TINT : WIM_BOOT_TINT;
    } else if (!underWimGuard(x, z, side)) {
      tint = WIM_TROUSER_TINT;
    } else if (y > WIM_CUP_BOTTOM) {
      tint = WIM_CAP_TINT;
    } else {
      tint = WIM_GUARD_TINT;
    }
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** Ankle band, toe cap, instep strap — and laces, as one lighter line up the front. */
function paintWimBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    const x = position.getX(i);
    const ankleBand = t > 0.62 && t < 0.82;
    const toeCap = t < 0.34 && z > 0.055;
    const laces = t > 0.36 && t < 0.62 && z > 0.02 && Math.abs(x) < 0.014;
    if (ankleBand || toeCap || laces) {
      colour.setXYZ(i, WIM_BOOT_PANEL_TINT[0], WIM_BOOT_PANEL_TINT[1], WIM_BOOT_PANEL_TINT[2]);
    }
  }
}

/** A cuff line at the wrist and a knuckle panel: what makes a black stub a glove. */
/**
 * His glove — the shared `GLOVE` with two rows at the knuckle break and one
 * under the cuff, halfWidth and halfDepth interpolated from it so the
 * silhouette is unchanged. `paintWimHand` had painted a knuckle panel on a
 * band no ring of the shared glove crossed (dead paint) and a cuff on one
 * ring between two unpainted ones (a hump, not an edge); the rows here are
 * what its bands land on. Four rings a hand, 80 triangles, no mesh.
 */
const WIM_GLOVE = loftProfile([
  { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
  { y: -0.016, halfWidth: 0.044, halfDepth: 0.038, square: 2.8 },
  { y: -0.022, halfWidth: 0.046, halfDepth: 0.040, square: 2.8 },
  { y: -0.028, halfWidth: 0.043, halfDepth: 0.037, square: 2.8 },
  // A wrist: the part has a waist between the cuff and the knuckles, so the
  // cuff reads as a step in the outline and not a hump on a tube — the
  // third blind round's glove finding, in Maribel's hand's grammar.
  { y: -0.036, halfWidth: 0.031, halfDepth: 0.024, square: 2.8 },
  { y: -0.046, halfWidth: 0.036, halfDepth: 0.026, square: 2.85 },
  // The widest ring at the knuckles, flattened toward 2:1.
  { y: -0.058, halfWidth: 0.041, halfDepth: 0.022, square: 2.85 },
  { y: -0.072, halfWidth: 0.040, halfDepth: 0.022, square: 2.9 },
  { y: -0.088, halfWidth: 0.033, halfDepth: 0.024, square: 2.8 },
  { y: -0.098, halfWidth: 0.023, halfDepth: 0.020, square: 2.6 },
  { y: -0.105, halfWidth: 0, halfDepth: 0 },
]);

function paintWimHand(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const z = position.getZ(i);
    const cuff = y > -0.024 && y < -0.012;
    const knuckles = y < -0.040 && y > -0.062 && z > 0.012;
    if (cuff || knuckles) colour.setXYZ(i, WIM_BOOT_PANEL_TINT[0], WIM_BOOT_PANEL_TINT[1], WIM_BOOT_PANEL_TINT[2]);
  }
}

/**
 * The seat, painted trouser blue — the one body painter that reads a *shade* as an
 * address. The seat loft is merged into the torso mesh at `shades.seat`, and
 * every other vertex in that mesh is the jersey at 1 or the collar above it;
 * so the vertices carrying exactly the seat shade are the seat, and they are
 * repainted to the same tint the thighs wear, which is what keeps the hip join
 * seamless (`riderClearance.test.ts` holds the two equal).
 */
const WIM_SEAT_SHADE = 0.86;
function paintWimTorso(geometry: THREE.BufferGeometry): void {
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < colour.count; i += 1) {
    if (Math.abs(colour.getX(i) - WIM_SEAT_SHADE) > 1e-6) continue;
    colour.setXYZ(i, WIM_TROUSER_TINT[0], WIM_TROUSER_TINT[1], WIM_TROUSER_TINT[2]);
  }
}

/** The thigh shell and the shin plate, as the sheet needs them for his mark's aspect. */
/** The shell ends on the even ring at −0.300; the paint boundary sits 6 mm above it as the shell's own rim. */
/**
 * The shell wraps from a little inboard of the front round the outboard flank
 * toward the back — and no further back than −1.95 rad: in the deepest fold
 * the thigh lies flat and its back faces up, so the shell's rearmost corner is
 * the one the clearance contract measures.
 */
const WIM_THIGH_SHELL = Object.freeze({
  u0: -1.95,
  u1: 0.90,
  from: -0.400,
  to: -0.300,
});
/** The plate stops 50 mm above the boot's collar, so the boot is a boot and not the end of the greave. */
const WIM_SHIN_PLATE = Object.freeze({ u0: -2.00, u1: 0.70, from: -0.224, to: WIM_CUP_BOTTOM });
/** The sticker on the pack: a back-anchored patch over the pack's face. */
const WIM_PACK_STICKER = Object.freeze({ u0: -0.34, u1: 0.34, from: 0.270, to: 0.395 });

/** What his sheet is painted against — the bodies its pages wrap. */
export const WIM_SHEET_LAYOUT: WimSheetLayout = Object.freeze({
  torso: WIM_JERSEY,
  upperArm: WIM_UPPER_ARM,
  forearm: WIM_FOREARM,
  thigh: WIM_THIGH,
  shin: WIM_SHIN,
  head: WIM_HELMET,
  thighShell: WIM_THIGH_SHELL,
  shinPlate: WIM_SHIN_PLATE,
  packSticker: WIM_PACK_STICKER,
  // 190 mm across the upper chest, its bottom edge 328 mm above the hip: the
  // render's placement — the mark fills the chest between the pack straps,
  // which sit outboard of it.
  chestMark: Object.freeze({ width: 0.190, bottom: 0.328 }),
});

export const WHEEL_IN_MOTION_LOOK: RiderLook = Object.freeze({
  id: 'wheel-in-motion' as CharacterId,
  // A little denser than the men, for the print: the jersey's page follows
  // a chest that curves two ways, and a sleeve stripe on fourteen sections
  // is a fourteen-sided stripe. The head densest of all, because the lid is
  // printed too and its silhouette is what the chase camera looks at.
  // Triangles are the free axis.
  density: Object.freeze({ limb: 18, torso: 30, head: 32 }),
  /**
   * His sheet, and the roles that sample it. **Three of the five are one
   * material** — body, limbs and the accent role all point at the print
   * ground — so his torso, arms and legs are one mapped material and the
   * guards ride it with pages of their own; the visor and the lid are the
   * other two, each a print ground of its own gloss. Only the black gear
   * carries no map.
   */
  atlas: Object.freeze({
    build: () => createWimAtlas(WIM_SHEET_LAYOUT),
    roles: Object.freeze(['body', 'limbs', 'accent', 'face', 'head'] as RiderMaterialRole[]),
    region: (art: string | undefined): UvRect => (
      art !== undefined && art in WIM_REGIONS ? WIM_REGIONS[art as WimRegionName] : WIM_REGIONS.blank
    ),
    // The garment and the lid: the torso, both sleeves and the helmet shell
    // are printed on the lofts. The seat, the legs and the hands are paint or
    // plain gear and land on blank.
    lofts: Object.freeze({ torso: 'jersey', upperArm: 'sleeve', forearm: 'forearm', head: 'helmet' }),
  }),
  materials: Object.freeze({
    body: WIM_PRINT,
    limbs: WIM_PRINT,
    accent: WIM_PRINT,
    // The lid is printed: the shell's blue, its yellow and the mouth vent
    // are all the helmet page's, over this print ground — the owner's call
    // (*"just same blue and yellow as clothes"*), and the way the yellow
    // lies flat on the shell instead of standing off it.
    head: WIM_LID,
    face: Object.freeze({
      // The visor: dark mirrored, with the lens page carrying the sheen.
      colour: BLOCKOUT_COLOURS.wheelInMotionLens,
      roughness: 0.10,
      metalness: 0.30,
      emissive: 0x10161c,
      emissiveIntensity: 0.30,
    }),
    gear: WIM_GEAR,
  }),
  profiles: Object.freeze({
    torso: WIM_JERSEY,
    seat: WIM_SEAT,
    thigh: WIM_THIGH,
    shin: WIM_SHIN,
    upperArm: WIM_UPPER_ARM,
    forearm: WIM_FOREARM,
    neck: NECK,
    head: WIM_HELMET,
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: WIM_GLOVE,
  }),
  // `seat` is an address, not a colour: `paintWimTorso` repaints every vertex
  // carrying it to the trouser blue the thighs wear. `legs` at 1 because the
  // legs' base is the print ground and every colour on them is paint.
  // `sole` above 1: a pale-edged sole under a black boot, which is what
  // separates the boot from the shin's shaft at chase distance.
  shades: Object.freeze({ seat: WIM_SEAT_SHADE, legs: 1.0, collar: 1.0, sole: 1.9, neck: 0.42 }),
  parts: Object.freeze({
    hands: 'gear' as RiderMaterialRole,
    neck: 'gear' as RiderMaterialRole,
    kneePad: 'body' as RiderMaterialRole,
    // The inversion: the legs are the print ground, painted down.
    legs: 'limbs' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    // **No collar.** A motocross jersey has a low crew neck, and the rolled
    // collar every jacket on the roster wears drew a hard crease across the
    // top of his shoulders in the gauntlet's captures — "a lid sitting on a
    // body". The loft's own cap closes the neck; the gaiter meets the jersey.
    // The backpack — Adonisb2's proven pack in black gear, the casting group
    // because the pack changes his outline — and the two straps that carry
    // it, over the shoulders.
    //
    // **Two straps, over the shoulders, and nothing else** — the owner's look
    // pass (2026-09-01). Phase 1 ran Adonisb2's shoulder wraps round the
    // *flank* at shoulder height and hung a sternum strap, buckles and a belt
    // on the chest; the owner saw straps under the armpits and a harness the
    // photograph does not carry: *"just need the two straps (one left one
    // right) to go over the shoulders and not under the armpits."* A strap
    // here is four patches that meet edge to edge: up the chest outboard of
    // the mark (`torso`, below), across the shoulder on the trapezius slope,
    // down the back into the pack's top corner, and a lower wrap round the
    // flank into the pack's side. The angles are measured, not guessed: the
    // chest run's outboard edge is 0.57 rad from the outboard point and the
    // rear run's is −1.03, and the crossing spans exactly that.
    //
    // **The crossing sits on the slope, not on the neck ring** — the owner's
    // third pass: *"the backpack straps connect like one of those dog body
    // harnesses... it like goes around his collar."* The second pass ran the
    // crossing on the loft's top two rings, and the top ring *is* the
    // collar: a band round it is a collar whatever it joins. The crossing
    // now runs between 520 and 536 mm, where the slope is 105–135 mm from
    // the midline — the middle of the shoulder — and both runs stop there
    // instead of climbing to the neck.
    shoulders: Object.freeze({
      role: 'gear' as RiderMaterialRole,
      casts: true,
      patches: Object.freeze([
        // Slim: 52 mm proud, rounded off at the corners, from the small of
        // the back to the shoulder blades — round two called the 72 mm
        // version an oversized slab standing off the body.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.44,
          u1: 0.44,
          from: 0.150,
          to: 0.448,
          uSegments: 6,
          vSegments: 6,
          lift: 0.060,
          taper: 0.30,
          shade: 0.98,
        }),
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: -0.34,
          u1: 0.34,
          from: 0.362,
          to: 0.436,
          uSegments: 4,
          vSegments: 3,
          lift: 0.068,
          taper: 0.34,
          shade: 1.10,
        }),
        // The rear run: from behind the pack's top corner (the pack is ±0.44
        // rad wide, its corner at 0.096 m; this straddles it) up the shoulder
        // blade to the rim.
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: 0.30,
          u1: 0.54,
          mirrored: true,
          from: 0.400,
          to: 0.536,
          uSegments: 3,
          vSegments: 4,
          lift: 0.010,
          shade: 1.08,
        }),
        // Over the shoulder: across the slope, from the rear run round the
        // outboard point to the chest run — the piece that makes the strap
        // pass over the shoulder rather than end at it.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -1.03,
          u1: 0.57,
          mirrored: true,
          from: 0.520,
          to: 0.536,
          uSegments: 8,
          vSegments: 1,
          lift: 0.010,
          shade: 1.08,
        }),
      ]),
    }),
    // The chest run of each strap, flat on the jersey and outboard of the
    // mark — the render and the photograph both put the mark between them —
    // from the shoulder crossing down to the ribs, and then round the flank
    // into the pack. Nothing else on the chest: no sternum strap, no
    // buckles, no belt.
    torso: Object.freeze({
      role: 'gear' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -1.00,
          u1: -0.76,
          mirrored: true,
          from: 0.240,
          to: 0.536,
          uSegments: 3,
          vSegments: 7,
          lift: 0.010,
          shade: 1.08,
        }),
        // The lower wrap: from the chest run's outboard edge, round the flank
        // at rib height, into the pack's side face. A strap that stops on
        // the chest hangs there — the owner's second pass: *"straps are just
        // dangling in front of him. should connect to the back at the sides
        // as well."* — and his third put it where it sits: the pass before
        // ran it at the pack's bottom edge, 150 mm above the hip, *"too low,
        // could go a bit higher above his hip more towards ribs height."*
        // Its span is the pack's own edge (±0.44 rad about the back) to the
        // chest run's edge, so the pieces meet without a gap or a lap.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -Math.PI / 2 + 0.44,
          u1: 0.57,
          mirrored: true,
          from: 0.240,
          to: 0.286,
          uSegments: 8,
          vSegments: 1,
          lift: 0.010,
          shade: 1.08,
        }),
      ]),
    }),
    // **His mark on the pack** — the one surface the chase camera looks at
    // for the whole ride, and the one thing the gauntlet's distance critic
    // and logo critic both asked for: nothing in the references shows his
    // back, so this is a sticker on his own bag rather than a print on the
    // jersey (brief §9 allows the mark on "other appropriate surfaces"). It
    // rides the `waist` slot — a group on the torso profile — because the
    // pack's own group is black gear and a sticker needs the print material.
    waist: Object.freeze({
      role: 'body' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: WIM_PACK_STICKER.u0,
          u1: WIM_PACK_STICKER.u1,
          from: WIM_PACK_STICKER.from,
          to: WIM_PACK_STICKER.to,
          uSegments: 4,
          vSegments: 3,
          lift: 0.065,
          sink: -0.020,
          taper: 0.10,
          shade: 1,
          art: 'packMark',
        }),
      ]),
    }),
    // The knee guard's upper half, on the thigh: a white shell that reads
    // LARGE at the chase camera (brief §10), its dark cup, and the outboard
    // pivot. Every patch here is a printed one — the shell wears the page
    // with his mark and its strap, the cup and the pivot wear the near-black
    // `cap` page — so the group is drawn in the print material.
    thighPad: Object.freeze({
      role: 'body' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        // Lopsided *outboard* on both legs: negative `u` from the front is
        // toward the rider's left, which is outboard on the left leg, and
        // `mirrored` turns it outboard on the right (Maribel's note records
        // the inboard pair the other sign produces).
        // His mark on the right shell only, as the render carries it — and
        // on the page that reads upright there, because a mirrored patch runs
        // its page the other way on the other leg (`render/wimAtlas.ts`,
        // `markRaster`). The left shell wears the same page without the mark.
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: WIM_THIGH_SHELL.u0,
          u1: WIM_THIGH_SHELL.u1,
          mirrored: true,
          from: WIM_THIGH_SHELL.from,
          to: WIM_THIGH_SHELL.to,
          uSegments: 8,
          vSegments: 5,
          // 18 mm, not 24: in the deepest attack-carve-crouch fold the thigh
          // lies nearly flat, so the shell's *lift* is what raises its top
          // corner toward the pelvis, and the seam's position barely moves it
          // — the clearance contract measured 75 mm against a 75 mm ceiling
          // at both 0.72 and 0.73 until the lift came down, and 76 mm again
          // when the span widened to wrap the leg.
          lift: 0.015,
          taper: 0.26,
          shade: WIM_GUARD_SHADE,
          art: 'guardUpper',
          artOn: -1,
          artElse: 'guardPlain',
        }),
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: WIM_THIGH_SHELL.u0,
          u1: WIM_THIGH_SHELL.u1,
          mirrored: true,
          from: -0.400,
          to: WIM_CUP_TOP,
          uSegments: 7,
          vSegments: 2,
          // 32 mm: the cup's front-top corner is the clearance contract's
          // highest white vertex on the left leg in the deep carve fold
          // (a 38 mm cup sat on the 75 mm ceiling exactly).
          lift: 0.032,
          taper: 0.30,
          shade: 1,
          art: 'cap',
        }),
        // The hinge strut down the outside of the thigh — the brace's
        // outer arm in the render, the piece that says the guard is
        // articulated and not a pad — and its pivot, a step prouder still.
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.16,
          u1: 0.16,
          from: -0.400,
          to: WIM_THIGH_SHELL.to + 0.004,
          uSegments: 2,
          vSegments: 4,
          lift: 0.026,
          taper: 0.10,
          shade: WIM_GUARD_SHADE,
          art: 'guardFlat',
        }),
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.24,
          u1: 0.24,
          from: -0.372,
          to: -0.332,
          uSegments: 4,
          vSegments: 2,
          lift: 0.031,
          taper: 0.78,
          shade: WIM_GUARD_SHADE,
          art: 'guardFlat',
        }),
      ]),
    }),
    // The lower half: the cup's lip across the hinge, the long white plate
    // with the vent ladder printed on it, the two pivot bosses, the strap.
    kneePad: Object.freeze({
      role: 'body' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: WIM_THIGH_SHELL.u0,
          u1: WIM_THIGH_SHELL.u1,
          mirrored: true,
          from: WIM_CUP_BOTTOM,
          to: 0.000,
          uSegments: 8,
          vSegments: 1,
          lift: 0.038,
          taper: 0.28,
          shade: 1,
          art: 'cap',
        }),
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: WIM_SHIN_PLATE.u0,
          u1: WIM_SHIN_PLATE.u1,
          mirrored: true,
          from: WIM_SHIN_PLATE.from,
          to: WIM_SHIN_PLATE.to,
          uSegments: 7,
          vSegments: 7,
          lift: 0.018,
          taper: 0.40,
          shade: WIM_GUARD_SHADE,
          art: 'guardLower',
        }),
        ...[-0.104, -0.148].map((from) => Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -0.24,
          u1: 0.24,
          from,
          to: from + 0.028,
          uSegments: 4,
          vSegments: 2,
          lift: 0.027,
          taper: 0.78,
          shade: WIM_GUARD_SHADE,
          art: 'guardFlat',
        })),
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: -Math.PI,
          u1: Math.PI,
          from: -0.240,
          to: -0.226,
          uSegments: 14,
          vSegments: 1,
          lift: 0.020,
          taper: 0.28,
          shade: 1,
          art: 'cap',
        }),
      ]),
    }),
    // The shell's own features, merged, Cool Rider's and blue: the brow over
    // the aperture and the base rim, brought down to his lower base ring.
    // Each wears the flat blue page, because a merged feature keeps its own
    // unit square and would otherwise sample the shell's print across
    // itself. There is no chin bar: the chin is the profile's, and its
    // yellow is the page's. And no rear spoiler — the owner's third pass
    // (*"a bump on the back protruding... looks odd"*): a blade that earns
    // its place on a plain shell is a lump on a printed one, whose chevrons
    // already give the chase camera its read.
    head: Object.freeze([
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
        art: 'blue',
      }),
      Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: 0,
        u1: Math.PI * 2,
        from: 0.058,
        to: 0.076,
        uSegments: 18,
        vSegments: 1,
        lift: 0.004,
        shade: 1.08,
        art: 'blue',
      }),
    ]),
    // The visor: Cool Rider's, sunk into the aperture and lifted only a
    // little, so it reads as glass in a recess — wearing the lens page for
    // its one soft sheen (the photograph's dark mirror, not the render's
    // green window).
    face: Object.freeze({
      role: 'face' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: -0.80,
        u1: 0.80,
        // The mockup's split: crown 36%, visor 33%, chin 31% of the shell.
        // The first cut's visor was 21% and the chin 39% — a letterbox over
        // a tall yellow muzzle, the second blind round measured. Two numbers.
        from: 0.149,
        to: 0.243,
        uSegments: 9,
        vSegments: 3,
        lift: 0.007,
        sink: -0.014,
        taper: 0.22,
        art: 'lens',
      })]),
    }),
  }),
  // Nothing bolted on: the lid's yellow was an extra for one pass and is
  // print now, which is one draw call fewer than Cool Rider's rig.
  extras: Object.freeze([]),
  paint: Object.freeze({
    torso: paintWimTorso,
    thigh: paintWimThigh,
    shin: paintWimShin,
    boot: paintWimBoot,
    hand: paintWimHand,
  }),
  // The photograph stands relaxed; a touch of splay keeps the pack open behind the arms.
  armCarriage: Object.freeze({ splay: 0.012, rise: 0 }),
});

// -- The Drunkard ------------------------------------------------------------
//
// M29 Phase 2 (`docs/PLANS.md` §29.5). The seventh rider, the first parody,
// wholly fictional — and the one look on the roster whose target render is
// the *authority* rather than an interpretation of one: the concept image
// the owner generated (held privately, not distributed) invented the
// character, so a departure from it is a defect and not a liberty. The joke is a rider who has misunderstood what a hydration
// system is for, and the brief's recognition hierarchy is the build order:
// the two-can hat, the tubes, the beer pack, the amber-cream-brown palette,
// the can in his fist, the hop green.
//
// **Three things decide the shape of this section.**
//
//   - **The ground is cream and everything else is paint or print on it.** A
//     vertex colour and a texel are multipliers, so the one colour lighter
//     than every other in every channel — the foam — is the base
//     (`BLOCKOUT_COLOURS.drunkardPrint`), and the amber jersey, the brown
//     waist band, the amber shell, the can labels, the pack's window and the
//     knee pads are one printed material on one sheet
//     (`render/drunkardAtlas.ts`, `RiderAtlas.lofts` for the torso, both
//     arms and the head). The legs are the same ground painted down, Wheel
//     in Motion's inversion one step warmer.
//   - **Three things justify geometry**, and two are the top of the brief's
//     hierarchy: the hat kit (two cans, two tubes, the peak — one casting
//     extra on the neck), the face (one non-casting extra on the neck, in the
//     hat's shadow), and the pack with its hose (one casting extra on the
//     pelvis). Every other part is an existing form in his palette.
//   - **The caricature is rings and carriage, not a skeleton.** The belly is
//     a deeper `halfDepth` through the jersey's middle rings, forward, with
//     the back left where it is; the loose shoulders are `armCarriage`. The
//     stance and the lean are the rig's and do not move for anybody; the
//     casual lean arrives as §29.4's sway, through the `motion` table Phase 1
//     built and the owner accepted.
//
// Cost, stated: against Cool Rider's 35 meshes / 58 calls he lands at 27
// meshes / 55 calls — two casting extras (six) in place of the shoulder,
// sleeve and elbow-pad groups (nine), one non-casting face extra (one) in
// place of the visor (one). Triangles are the free axis and the tubes, the
// cans and a denser head are where they go; `drunkard.test.ts` states the
// number.

/** The cream ground: the ceiling of every ink and every tint on him. Matte, like a jersey. */
const DRUNKARD_PRINT: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.drunkardPrint,
  roughness: 0.80,
  metalness: 0.0,
});
/** The hat: the same ground at a shell's gloss, under the hat page. */
const DRUNKARD_LID: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.drunkardPrint,
  roughness: 0.44,
  metalness: 0.0,
});
/**
 * The skin: the face extra and the neck. Its base is the skin itself, and the
 * palest things on the face — the tooth strip, the lens glints — are vertex
 * *lifts* over it, the cop's own lens trick (`copFaceParts`), so the shades
 * need no second material: the lenses are tinted down to the one near-black
 * on him and the glint is skin lifted to the print ground's value.
 */
const DRUNKARD_SKIN: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.drunkardSkin,
  roughness: 0.74,
  metalness: 0.0,
});
/** Boots, gloves, the soles, and — lifted 1.6× to the printed brown — the straps: the brown gear. */
const DRUNKARD_GEAR: RiderMaterialSpec = Object.freeze({
  colour: BLOCKOUT_COLOURS.drunkardGear,
  roughness: 0.66,
  metalness: 0.0,
});

// -- His tints ----------------------------------------------------------------
//
// Every tint below paints *down* from the print ground except the two lifts
// on the face, which are stated as lifts.

/** Pale → the amber the jersey's field is inked in: the trousers, the tubes, the hose. */
const DRUNKARD_AMBER_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardAmber);
/** Pale → the printed brown: the knee-pad paint under the pads (the hinge rule, M22). */
const DRUNKARD_BROWN_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardBrown);
/** Pale → the gear brown: the gloves and the bite valve, which ride the print material. */
const DRUNKARD_GEAR_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardGear);
/**
 * The glove's cuff and knuckle lines: the gear brown 1.6× up, reached from
 * the pale glove — Wheel in Motion's boot-panel grammar, where 1.3× was one
 * 8-bit level under the sun and invisible.
 */
const DRUNKARD_GEAR_LINE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardGear, 1.6);
/** Panel lines on the gear boot itself: the same step, from the gear base. */
const DRUNKARD_BOOT_LINE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardGear, BLOCKOUT_COLOURS.drunkardGear, 1.6);
/** The cream the can's rim and top band wear: the ground itself — the foam. */
const DRUNKARD_CREAM_TINT: Tint = [1, 1, 1];
/**
 * Pale → the garment's ivory: the trouser panels, the boot collar and its
 * laces (gauntlet round 1). The foam keeps the bare ground; the cloth is a
 * stop warmer so the two stop being one white.
 */
const DRUNKARD_GARMENT_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardIvory);
/**
 * Pale → the hop green: the glove's cuff band, the target's one accent on a
 * surface that *wraps* — the only green on him the chase camera can see.
 */
const DRUNKARD_HOP_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardHop);

/** Skin → the stubble band on the jaw: a cooler, darker skin. */
const DRUNKARD_STUBBLE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0xb6885f);
/**
 * Skin → hair brown: the short hair under the hat's rim. Blue at 44 rather
 * than the first cut's 24: a 5 % blue channel through the tone curve on a
 * shaded face lands on 0 and reads as a hole (gauntlet round 1).
 */
const DRUNKARD_HAIR_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x4f3a2c);
/**
 * Skin → the goatee and the moustache: a step lighter than the rim hair,
 * because they sit against the mouth's dark rather than against lit skin —
 * the target's beard measures 22–37 % of its skin's luminance and the first
 * cut's rendered at 5 %, one black mass with the mouth.
 */
const DRUNKARD_GOATEE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x6b563f);
/** Skin → the lower lip: brighter than the beard, darker than the skin, so the mouth has a bottom edge. */
const DRUNKARD_LIP_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0xa8705c);
/**
 * Skin → the ear's concha (gauntlet round 3): a paint *down* from the skin,
 * the way the target's ear face sits under its cheek (75 against 92), at a
 * luma between the goatee's and the lip's. The ear had no albedo break at
 * all — a 4 % shade, two of 255 — and in profile it was invisible.
 */
const DRUNKARD_EAR_SHADE = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x8a6446);
/** Skin → the lens: the one near-black on him, and a small one. */
const DRUNKARD_LENS_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, BLOCKOUT_COLOURS.drunkardLens);
/** Skin → the shades' frame and bridge: a dark warm grey, a step off the lens so the frame reads. */
const DRUNKARD_FRAME_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x33292c);
/** Skin → the print ground, a *lift*: the tooth strip and the lens glints. */
const DRUNKARD_PALE_LIFT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, BLOCKOUT_COLOURS.drunkardPrint);
/**
 * Skin → the open mouth behind the teeth. `0x5e2f24` rather than the first
 * cut's `0x4a1d18` (gauntlet round 2): at 3.4 % green and 5.3 % blue the
 * cavity rendered (6, 0, 0) — channel-clipped, the exact value of the lens
 * — where the target's cavity sits 1.24× *above* its own lenses. Every
 * channel now clears the 5 %-clips-to-zero line round 1 established for the
 * hair, and the order lens < frame < mouth < rim hair < goatee < ear < lip
 * holds.
 */
const DRUNKARD_MOUTH_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x5e2f24);
/**
 * The nose, brighter than the face so it catches the sun: 1.14× rather than
 * the first cut's 1.05×, which moved a shaded cheek by two 8-bit levels and
 * left the nose a 3 px highlight.
 */
const DRUNKARD_NOSE_TINT: Tint = [1.14, 1.12, 1.09];

// -- His profiles --------------------------------------------------------------

/**
 * The belly: where it sits, how far it spreads, and how much deeper the
 * jersey's rings are through it. Centred 190 mm above the hip — below the
 * chest, above the belt — with the depth added *forward only*: each ring's
 * `z` moves by the same amount its half-depth grows, so the back stays
 * exactly where Cool Rider's is and the pack derived from it does not move.
 */
const DRUNKARD_BELLY_CENTRE = 0.190;
const DRUNKARD_BELLY_SPREAD = 0.115;
const DRUNKARD_BELLY_DEPTH = 0.22;

/**
 * The jersey: Cool Rider's jacket silhouette, re-rung every 30 mm for the
 * print (Wheel in Motion's reason — a page row is a ring index), with the
 * belly through its middle rings.
 */
const DRUNKARD_JERSEY = loftProfile((() => {
  const heights = [-0.010, 0.018];
  for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030) heights.push(Math.round(y * 1000) / 1000);
  heights.push(0.500, 0.528, 0.548);
  return heights.map((y) => {
    const ring = ringOf(JACKET, y);
    const bump = Math.exp(-(((y - DRUNKARD_BELLY_CENTRE) / DRUNKARD_BELLY_SPREAD) ** 2));
    const deeper = ring.halfDepth * DRUNKARD_BELLY_DEPTH * bump;
    return {
      ...ring,
      halfWidth: ring.halfWidth * (1 + 0.06 * bump),
      halfDepth: ring.halfDepth + deeper,
      z: ring.z + deeper,
    };
  });
})());

/** Where the knee pad's brown begins on the thigh, as a fraction of its length. */
const DRUNKARD_PAD_TOP = 0.87;
/**
 * Where the trousers' dark outer-thigh block begins, as a fraction of the
 * thigh's length (gauntlet round 3): the target's block starts 33 % down the
 * thigh and runs into the knee band, one of its three brown anchors below
 * the belt, and the trousers had no outboard brown at all.
 */
const DRUNKARD_THIGH_BLOCK_TOP = 0.33;
/** The pad's lower edge on the shin, and the boot shaft's collar, in each bone's space. */
const DRUNKARD_PAD_BOTTOM = -0.088;
const DRUNKARD_BOOT_TOP = 0.72;

/**
 * The hip dome over the thigh's top, in the thigh's frame (`y` 0 is the hip
 * joint): 60 mm of rounded close, the way `DRUNKARD_UPPER_ARM` domes the
 * shoulder and for the same reason — no garment covers the end of this bone
 * in every stance. The rig drops the inside hip 85 mm under the pelvis in a
 * carve and the outside hip 150 mm in a technical corner, and the pelvis
 * counter-rolls the seat's hem *up* on the outside by 26 mm more, so a
 * thigh that ends in a flat cap at the joint ends in a flat cap below the
 * hem, with the seat's dark underside showing over it — the owner's ride,
 * 2026-09-03: "in some tight turns the legs kinda detach from the torso
 * (upper back end of the legs)". Every rider does exactly this (measured:
 * 70 % of the cap below the hem in a full carve on Cool Rider, Wheel in
 * Motion and him alike) and hides it in black; his amber cannot. Sized with
 * `DRUNKARD_SEAT`'s hem so the dome still reaches into the seat through the
 * technical corner's drop and lift; `drunkard.test.ts` sweeps it.
 */
const DRUNKARD_HIP_DOME_APEX = 0.060;
const DRUNKARD_HIP_DOME: LoftRing[] = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [DRUNKARD_HIP_DOME_APEX, 0]].map(([y, scale]) => ({
  y: y!,
  halfWidth: 0.083 * scale!,
  halfDepth: 0.083 * 0.94 * scale!,
  square: 2.4,
}));

/**
 * The thigh: even 40 mm rings (nothing is printed on the legs, so the rings
 * are for the silhouette), a pair at the pad's top edge so the brown starts
 * on a seam, a little more radius than Cool Rider's — he is a heavier man —
 * and the hip dome over the joint.
 */
const DRUNKARD_THIGH = loftProfile([
  ...limbAtHeights(
    RIDER_BLOCKOUT.thighLength,
    [0.083, 0.076, 0.064],
    [
      0, -0.040, -0.080, -0.120, -0.160, -0.200, -0.240, -0.280, -0.320,
      -RIDER_BLOCKOUT.thighLength * DRUNKARD_PAD_TOP + 0.002,
      -RIDER_BLOCKOUT.thighLength * DRUNKARD_PAD_TOP - 0.002,
      -0.375, -0.400,
    ],
    { flatten: 0.94, square: 2.4 },
  ),
  ...DRUNKARD_HIP_DOME,
]);

/**
 * The seat: Cool Rider's rings with the hem 30 mm lower and the bottom two
 * rings a size wider, so the taper still closes over the thighs instead of
 * pinching them. The other half of the hip fix (`DRUNKARD_HIP_DOME`): in
 * the technical corner the outside hip drops 150 mm and the counter-roll
 * lifts that side's hem 26 mm, and the dome has to reach the hem through
 * both — 118 + 60 against 150 + 26. Painted trouser amber by
 * `paintDrunkardTorso` off the seat shade, so the extra 30 mm is trouser,
 * not a hem line, and it stops 14 mm above the outer-thigh block's top.
 */
const DRUNKARD_SEAT = loftProfile([
  { y: -0.118, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.78 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.088, halfWidth: 0.84 * TORSO_HALF_WIDTH, halfDepth: 0.85 * TORSO_HALF_DEPTH, square: 2.6 },
  { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
  { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
]);
/**
 * The shin: a pair at the pad's lower edge, a pair at the boot's collar and
 * one more ring under it so the collar band is two rows with a hard edge.
 */
const DRUNKARD_SHIN = limbAtHeights(
  RIDER_BLOCKOUT.shinLength,
  [0.066, 0.060, 0.054],
  [
    0, -0.040, DRUNKARD_PAD_BOTTOM + 0.002, DRUNKARD_PAD_BOTTOM - 0.002,
    -0.120, -0.150, -0.180, -0.210, -0.235, -0.256,
    -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP + 0.002,
    -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP - 0.002,
    -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP - 0.014,
    -0.310, -0.340, -0.380,
  ],
  { flatten: 0.92, square: 2.4 },
);

/**
 * Smooth sleeves with a dome over the shoulder joint (Wheel in Motion's
 * deltoid, for the same reason: no shoulder panel covers the arm's top disc),
 * a size up from his because the man is heavier.
 */
const DRUNKARD_UPPER_ARM = loftProfile([
  { y: 0.034, halfWidth: 0, halfDepth: 0 },
  { y: 0.028, halfWidth: 0.032, halfDepth: 0.031, square: 2.3 },
  { y: 0.014, halfWidth: 0.053, halfDepth: 0.051, square: 2.3 },
  ...limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.062, 0.053, 0.045], [], {
    flatten: 0.95,
    square: 2.3,
  }).slice().reverse(),
]);
const DRUNKARD_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.050, 0.043, 0.035], [], {
  flatten: 0.94,
  square: 2.3,
});

/**
 * The hat: an amber open-face shell. `y = 0` is the neck joint.
 *
 * Its base ring sits at the brow — 208 mm up, above the shades, where the
 * cop's helmet sits — with a lip under it that flares out as a brim, then
 * the widest ring at the temples (the cans stand on its flanks) and a dome
 * that rounds off at the density the printed foam asks for. The peak is a
 * piece of the hat *kit* rather than a patch on this shell: a patch stands
 * off the surface along its normal, and a peak is a plate leaving the rim
 * horizontally (`drunkardHatKit`).
 */
const DRUNKARD_HAT = loftProfile([
  { y: 0.208, halfWidth: 0.110, halfDepth: 0.118, square: 2.5, z: 0.008 },
  { y: 0.218, halfWidth: 0.126, halfDepth: 0.136, square: 2.6, z: 0.010 },
  { y: 0.240, halfWidth: 0.129, halfDepth: 0.139, square: 2.6, z: 0.008 },
  { y: 0.270, halfWidth: 0.130, halfDepth: 0.140, square: 2.5, z: 0.004 },
  { y: 0.305, halfWidth: 0.121, halfDepth: 0.129, square: 2.4 },
  { y: 0.338, halfWidth: 0.101, halfDepth: 0.107, square: 2.3 },
  { y: 0.364, halfWidth: 0.070, halfDepth: 0.074, square: 2.2 },
  { y: 0.380, halfWidth: 0.032, halfDepth: 0.034, square: 2.2 },
  { y: 0.388, halfWidth: 0, halfDepth: 0 },
]);
/** The shell's widest half-width: the flank the cans stand outboard of. */
const DRUNKARD_HAT_WIDEST = Math.max(...DRUNKARD_HAT.map((ring) => ring.halfWidth));

/**
 * The skin head under the hat: an authored face from the chin to the brow —
 * a round jaw, full cheeks — and, above the hat's rim, **the hat's own rings
 * inset** (the M22 rule: a part meant to sit inside another is derived from
 * it, so the claim that the skull is under the shell is structural).
 */
const DRUNKARD_HEAD_INSET = 0.012;
const DRUNKARD_HEAD = loftProfile([
  { y: 0.086, halfWidth: 0.050, halfDepth: 0.054, square: 2.4, z: 0.016 },
  { y: 0.104, halfWidth: 0.076, halfDepth: 0.082, square: 2.5, z: 0.016 },
  { y: 0.128, halfWidth: 0.094, halfDepth: 0.100, square: 2.5, z: 0.014 },
  { y: 0.160, halfWidth: 0.106, halfDepth: 0.112, square: 2.5, z: 0.010 },
  { y: 0.200, halfWidth: 0.111, halfDepth: 0.117, square: 2.5, z: 0.006 },
  ...DRUNKARD_HAT.filter((ring) => ring.y >= 0.240).map((ring) => ({
    y: ring.y,
    halfWidth: Math.max(0, ring.halfWidth - DRUNKARD_HEAD_INSET),
    halfDepth: Math.max(0, ring.halfDepth - DRUNKARD_HEAD_INSET),
    square: ring.square,
    z: ring.z,
  })),
]);

/** Where a profile's front surface is at a height: the ring's lead plus its depth. */
function frontAt(profile: LoftProfile, y: number): number {
  const ring = ringOf(profile, y);
  return ring.z + ring.halfDepth;
}

/**
 * Where a profile's front surface is at a height *and* a lateral offset: the
 * superellipse solved for `z`, so a feature that runs across a cheek can be
 * seated on the cheek at every station instead of standing off it at the
 * corners (the first grin's corners stood 17 mm proud at 1.3× its width, and
 * a tube end laid across them). Past the ring's half-width it returns the
 * ring's centre line — the surface has gone round the side.
 */
function surfaceZAt(profile: LoftProfile, y: number, x: number): number {
  const ring = ringOf(profile, y);
  const a = Math.abs(x - ring.x) / Math.max(1e-6, ring.halfWidth);
  if (a >= 1) return ring.z;
  return ring.z + ring.halfDepth * (1 - a ** ring.square) ** (1 / ring.square);
}

/**
 * The grin's half-width across the face, metres: 1.30× the first cut's,
 * which measured 41 % of the shades' width against the target's 60 %.
 */
const DRUNKARD_MOUTH_HALF = 0.064;
/**
 * The mouth's centre height, and how far its corners rise above it (the
 * laugh's lift). 23 mm rather than round 1's 7 mm (gauntlet round 2): a
 * feature's top edge lifts by `rise − halfHeight` at the corner, so at 7 mm
 * the tooth strip's lit edge rose 0.45 mm — sub-pixel, a flat white bar —
 * while the target's band lifts 12–17 % of the mouth's width. At 23 mm the
 * strip's corners rise 14 mm (11 % of the 128 mm grin) and the cavity's top
 * edge rises 7 mm instead of falling 9.
 */
const DRUNKARD_MOUTH_Y = 0.128;
const DRUNKARD_MOUTH_CORNER_RISE = 0.023;

/**
 * The mouth corner, in the neck's frame: where the hat tubes end — on the
 * cheek at the grin's corner, seated on the head's own surface at that
 * offset, and clear of the tooth strip (the first cut's tube ends lay
 * across the strip's corners and took 31 % of the grin with them).
 */
function drunkardMouthCorner(side: number): THREE.Vector3 {
  const x = side * (DRUNKARD_MOUTH_HALF + 0.010);
  const y = DRUNKARD_MOUTH_Y + DRUNKARD_MOUTH_CORNER_RISE;
  return new THREE.Vector3(x, y, surfaceZAt(DRUNKARD_HEAD, y, x) + 0.002);
}

/**
 * The hat kit's numbers, stated once for the builder and the tests.
 *
 * **Gauntlet round 1 resized the cans against the head.** The target's can
 * is 0.37–0.42 of its dome's width and stands off the shell with sky in the
 * gap; the first cut's was 0.25, buried 10 mm into the shell, and read as an
 * ear cup at chase distance. Now: radius 45 mm (0.35 of the 260 mm dome —
 * short of the target on purpose, because this rider's head is far bigger
 * against his shoulders than the target's, and 0.37 would take the can
 * past the target's can-to-shoulder ratio), a 12 mm standoff from the
 * widest ring held by a bracket band, and the bottom 8 mm under the brim
 * so the can breaks the head's silhouette beside the temple the way the
 * target's hangs beside the cheek. The outboard face stands
 * `standoff + 2 × radius` = 102 mm outboard of the widest ring — what reads
 * at chase distance; the cradle's outboard rail (round 2) takes the kit's
 * widest point to 108 mm, and the pin is a 50 mm floor. The brim is a
 * full-circumference plate (the target is a hard hat), derived from the
 * shell's ring at its height.
 *
 * **Gauntlet round 2 gave the cans a mount.** Round 1's bracket was a
 * 15 × 14 mm peg (0.085 of the can's height, wrapping 0 % of its surface),
 * and a 165 mm can on a peg reads as a can stuck to a head. The target's
 * cans sit in a black C-shaped cradle — an inboard rail, a cup under the
 * base, an outboard rail — with a bold retaining strap round the waist,
 * and that hardware is a large part of why it reads as a *drinking hat*.
 * Every piece is derived from `DRUNKARD_CAN`'s own rings in the can's
 * frame (the M22 rule) and merges into the kit's one buffer.
 */
export const DRUNKARD_KIT = Object.freeze({
  canRadius: 0.045,
  canHeight: 0.165,
  canStandoff: 0.012,
  canBottom: 0.200,
  canAxisX: DRUNKARD_HAT_WIDEST + 0.012 + 0.045,
  canZ: 0.006,
  /**
   * Thick enough to read (brief §8): 13 mm. The target's tube is a tenth of
   * its dome's width; 9 mm was 0.07 and rendered as a 3 px wire at chase.
   */
  tubeRadius: 0.013,
  /**
   * The straw — the last 70 mm across the cheek into the grin's corner
   * (round 2). The target steps its tube down through a tan ferrule to a
   * pale straw of 0.52 the tube's diameter before the mouth, which is what
   * keeps the gag reading as sipping; the first cut drove the full 26 mm
   * amber bore into a mouth that opens 24 mm. 0.013 × 0.52 = 0.0068.
   */
  strawRadius: 0.0068,
  /** The ferrule joining tube to straw: 1.5× the tube's radius (the target's fitting is 1.5× its tube) and 14 mm long. */
  ferrule: Object.freeze({ half: 0.0175, length: 0.014 }),
  /**
   * The brim: the shell's own ring at the peak's height (half-width 0.1188,
   * front 0.137, rear −0.1188) pushed out 65 mm at the front — the first
   * cut's peak, so the front silhouette does not move — and 20 mm at the
   * sides and rear, which is what fits inboard of the cans' standoff.
   */
  peak: Object.freeze({ y: 0.2135, z: 0.0316, halfWidth: 0.139, halfDepth: 0.1704 }),
  /**
   * The cradle's inboard rail, holding each can off the shell: its centre
   * height and half-height. 22 mm (a 44 mm plate) rather than round 1's
   * 7 mm peg: the target's inboard rail is ~90 mm, and 44 is the half
   * measure that does not swallow the can.
   */
  bracket: Object.freeze({ y: 0.282, half: 0.022 }),
  /**
   * The retaining strap round the can's waist: its centre as a fraction of
   * the can's height up from its base, its height, and how far it stands
   * proud of the can. 36 mm is 0.22 of the can (the target's strap is 0.21);
   * 5 mm proud against the target's 3–4.
   */
  strap: Object.freeze({ centre: 0.46, height: 0.036, proud: 0.005 }),
  /**
   * The cradle's cup under the base and its outboard rail: the bar's
   * half-width, how far the cup drops below the can's base, and how deep the
   * rail is buried in the can so no seam shows (the way the arm is).
   */
  cradle: Object.freeze({ bar: 0.007, cupDrop: 0.018, railBury: 0.002 }),
  /**
   * The foam mound as geometry (gauntlet round 3): a cap over the shell's
   * crown whose rim is the painted foam's own edge (`hatFoamEdge`, the same
   * hash, so the two cannot disagree), stood off the shell along its normal
   * by `proud(y)` — `temple` at and below `gradeFrom`, grading to `crown`
   * by `gradeTo` and held to the apex — and closed with a `lip` skirt back
   * onto the shell so the edge is a visible step rather than a knife. The
   * foam was paint only, and a paint cannot break a silhouette: from every
   * angle the helmet's outline was one smooth ovoid and the hat read as a
   * two-tone helmet, where the target's mound stands ~10 mm proud of its
   * dome at the edge. 6 mm at the temple, because the cans' inboard face
   * is 12 mm off the widest ring: max lateral 136 mm, 6 mm clear of the
   * can at 142 and inboard of the brim's 139; 14 mm over the crown, where
   * the silhouette is read. Triangles only — it merges into the kit.
   */
  foam: Object.freeze({ crown: 0.014, temple: 0.006, gradeFrom: 0.270, gradeTo: 0.320, lip: 0.003, columns: 48, rows: 5 }),
  mouthCorner: drunkardMouthCorner,
  /**
   * A tube's route, in the neck's frame: up out of the can's top (the first
   * knot 13 mm *inside* the can, under a grommet — round 2: an open tube end
   * standing on a domed cap floated 10 mm clear of it at the rear), up into
   * a **hoop over the can**, then **down the rear flank, outboard of the
   * can's own outer face** — every knot of the descent outboard of the can
   * *and* behind the hat's widest ring — hooking forward under the ear to a
   * knot beside the jaw where the straw takes over.
   *
   * Round 1 took the descent outboard in `x` but left it at `z` 0.14–0.17,
   * ahead of a face whose front is at 0.07–0.15: the leg flew out along the
   * +x/+z diagonal, which is the quarter camera's own axis, and 52 % of the
   * route lay over the face in that view. Round 2 moved it onto the rear
   * flank. **Round 3 measured that flank against the chase camera**: the
   * descent sat 17–29 mm inboard of the can's axis and 124–156 mm behind
   * it, so from the player's seat 93 % of the tube inside the can's height
   * band projected *in front of* the can, splitting its cream band with an
   * amber bar; and the loop's plane was fore-aft — the chase camera's own
   * depth axis — so its apex, 44 mm over the crown in 3D, rose 8 px over
   * the helmet with zero sky inside it. Now the crown of the hoop is 117 mm
   * over the shell's apex with its plane tilted into x–y, so the chase sees
   * an open loop over each can, and the whole descent runs at 0.260–0.262,
   * outboard of the can's outer face at 0.232. Cost stated: the kit's
   * half-width goes 237 → 275 mm past the shoulder line (round 1's
   * can-to-shoulder argument was about the *cans*, which do not move).
   * `drunkard.test.ts` projects the built tube at the three capture
   * azimuths and `riderClearance.test.ts` sweeps it against the shoulders.
   */
  tube: (side: number): THREE.Vector3[] => [
    new THREE.Vector3(side * (DRUNKARD_HAT_WIDEST + 0.012 + 0.045), 0.352, 0.006),
    new THREE.Vector3(side * 0.205, 0.420, 0.000),
    // The hoop's inboard shoulder and its apex: 104 and 117 mm over the
    // crown, the apex 30 mm outboard of the shoulder so the loop opens.
    new THREE.Vector3(side * 0.160, 0.492, -0.030),
    new THREE.Vector3(side * 0.205, 0.505, -0.075),
    // The outboard leg, past the can's outer face (0.187 + 0.045 = 0.232)
    // by the tube's own radius plus a 2 px chase gap, and the descent
    // behind the head at the depth round 2 chose.
    new THREE.Vector3(side * 0.262, 0.430, -0.125),
    new THREE.Vector3(side * 0.260, 0.300, -0.150),
    new THREE.Vector3(side * 0.236, 0.174, -0.118),
    // The hand-off under the ear: without this knot the last segment swept
    // 100 mm inboard and 148 mm forward over 28 mm of drop and read as a
    // buttress at the jaw.
    new THREE.Vector3(side * 0.200, 0.158, -0.040),
    new THREE.Vector3(side * 0.136, 0.146, 0.030),
  ],
  /**
   * The straw: from the tube's last knot beside the jaw, in across the cheek
   * to the corner of the grin, with a short stub into the mouth. Split from
   * the tube below the 165 mm line, so the silhouette pin samples only the
   * fat stretch, and thinner and cream (`strawRadius`, the garment's ivory).
   */
  straw: (side: number): THREE.Vector3[] => [
    new THREE.Vector3(side * 0.136, 0.146, 0.030),
    // A knot standing 13 mm off the cheek, so the straw approaches the
    // grin through the air and only its last 30 mm lie on the face: run
    // straight from the jaw to the corner its middle sat 2 mm off the
    // cheek with its inner vertices 4 mm into the skin.
    new THREE.Vector3(side * 0.100, 0.152, 0.080),
    drunkardMouthCorner(side),
    new THREE.Vector3(side * 0.052, DRUNKARD_MOUTH_Y + 0.004, surfaceZAt(DRUNKARD_HEAD, DRUNKARD_MOUTH_Y + 0.004, side * 0.052) - 0.009),
  ],
});

/**
 * A hat can in its own frame, `y` 0 at its bottom: chamfered rims, a
 * straight body, a necked top — the chamfers and the neck as fractions of
 * the radius and the height, so a resize keeps its rim.
 */
const DRUNKARD_CAN = loftProfile((() => {
  const r = DRUNKARD_KIT.canRadius;
  const h = DRUNKARD_KIT.canHeight;
  return [
    { y: 0, halfWidth: 0, halfDepth: 0 },
    { y: h * 0.024, halfWidth: r * 0.82, halfDepth: r * 0.82, square: 2 },
    { y: h * 0.072, halfWidth: r, halfDepth: r, square: 2 },
    // Three rings through the barrel (gauntlet round 2): a page row is a
    // ring index, so the barrel — 76 % of the can — was one ring span and
    // took a sixth of the label's rows, 0.12 rows per millimetre, and the
    // cone on it came out as a vertical smear. Four spans give it 0.33.
    { y: h * 0.262, halfWidth: r, halfDepth: r, square: 2 },
    { y: h * 0.452, halfWidth: r, halfDepth: r, square: 2 },
    { y: h * 0.642, halfWidth: r, halfDepth: r, square: 2 },
    { y: h * 0.832, halfWidth: r, halfDepth: r, square: 2 },
    { y: h * 0.912, halfWidth: r * 0.91, halfDepth: r * 0.91, square: 2 },
    { y: h * 0.968, halfWidth: r * 0.82, halfDepth: r * 0.82, square: 2 },
    { y: h, halfWidth: 0, halfDepth: 0 },
  ];
})());

/** Fold a geometry's own unit square onto a sub-rectangle of the page its extra will wear. */
function foldOnto<T extends THREE.BufferGeometry>(geometry: T, rect: PageRect): T {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, rect.s0 + uv.getX(i) * (rect.s1 - rect.s0), rect.t0 + uv.getY(i) * (rect.t1 - rect.t0));
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * A swept tube along a spline, carrying the colour attribute the merge needs,
 * tinted. `segments` overrides the derived count for a short piece — a
 * 90 mm finger at 22 segments is ten times the cost for nothing.
 */
function sweptTube(points: readonly THREE.Vector3[], radius: number, tint: Tint, segments?: number): THREE.BufferGeometry {
  // Centripetal, so the spline cannot loop between knots that turn hard —
  // a uniform Catmull-Rom overshoots at the mouth corner.
  const curve = new THREE.CatmullRomCurve3([...points], false, 'centripetal');
  // One segment per ~24 mm of route, never fewer than 22: a route half a
  // metre long at 14 segments was a polyline, and the tubes are a
  // silhouette (brief §8). Derived from the length so a longer route (the
  // hat tubes' outboard descent, gauntlet round 1) keeps the same facet.
  const along = segments ?? Math.max(22, Math.round(curve.getLength() / 0.024));
  const tube = shaded(new THREE.TubeGeometry(curve, along, radius, 6, false));
  return tinted(tube, tint);
}

/**
 * A short cylinder along a direction, in the neck's frame: a loft built up
 * its own `y`, turned onto `axis` and stood at `at`. The ferrule on each
 * hat tube.
 */
function collarAlong(at: THREE.Vector3, axis: THREE.Vector3, half: number, length: number, tint: Tint): THREE.BufferGeometry {
  const collar = tinted(loftGeometry(loftProfile([
    { y: -length / 2, halfWidth: half * 0.9, halfDepth: half * 0.9, square: 2 },
    { y: -length / 2 + 0.002, halfWidth: half, halfDepth: half, square: 2 },
    { y: length / 2 - 0.002, halfWidth: half, halfDepth: half, square: 2 },
    { y: length / 2, halfWidth: half * 0.9, halfDepth: half * 0.9, square: 2 },
  ]), { radialSegments: 8, capBottom: true, capTop: true }), tint);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  collar.applyQuaternion(turn);
  collar.translate(at.x, at.y, at.z);
  return collar;
}

/**
 * The hat kit: two cans on the shell's flanks, each in its cradle with a
 * retaining strap and a grommet on its top; a tube from each grommet over
 * the crown and down the rear flank to a ferrule beside the jaw, and a
 * straw from there into the grin; and the peak — one casting extra in the
 * print material, wearing the kit page.
 *
 * Each can is built in its own frame and turned a quarter so the label's
 * front (`s = 0.25`, where the hop cone is) looks outboard on both sides;
 * its texture square is folded onto the label band before the merge, and
 * the strap, built in the same frame, onto the peak's amber row. The tubes,
 * the straws and the cradle's brown wear the page's plain strip and carry
 * their colour as a vertex tint.
 */
function drunkardHatKit(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const { canAxisX, canBottom, canZ, canRadius, canHeight } = DRUNKARD_KIT;
  /** A part built in the can's own frame, turned and stood where the can is. */
  const inCanFrame = (side: number, geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
    geometry.rotateY(side * Math.PI / 2);
    geometry.translate(side * canAxisX, canBottom, canZ);
    return geometry;
  };
  for (const side of [-1, 1]) {
    const can = inCanFrame(side, loftGeometry(DRUNKARD_CAN, { radialSegments: 14, splitSeam: true }));
    parts.push(foldOnto(can, KIT_LABEL));

    // The tube, its ferrule and the straw: one route in three gauges. The
    // ferrule is stood on the joint along the straw's own tangent, so the
    // step down from 13 to 6.8 mm is a fitting and not a bare shoulder.
    const tubeKnots = DRUNKARD_KIT.tube(side);
    const strawKnots = DRUNKARD_KIT.straw(side);
    parts.push(foldOnto(sweptTube(tubeKnots, DRUNKARD_KIT.tubeRadius, DRUNKARD_AMBER_TINT), KIT_PLAIN));
    const strawCurve = new THREE.CatmullRomCurve3([...strawKnots], false, 'centripetal');
    const joint = strawKnots[0]!;
    const tangent = strawCurve.getTangentAt(0);
    parts.push(foldOnto(collarAlong(joint, tangent, DRUNKARD_KIT.ferrule.half, DRUNKARD_KIT.ferrule.length, DRUNKARD_GEAR_LINE_TINT), KIT_PLAIN));
    parts.push(foldOnto(sweptTube(strawKnots, DRUNKARD_KIT.strawRadius, DRUNKARD_GARMENT_TINT), KIT_PLAIN));

    // The grommet the tube leaves the can through (round 2): a dark collar
    // on the can's axis, seated on the can's own cap ring — the first ring
    // down from the apex whose half-width clears the collar by 4 mm — and
    // standing 11 mm proud of it with a lip wider than its body, the way
    // the target's tube plugs into a fitting rather than resting on a dome.
    const apex = canBottom + canHeight;
    const grommet = tinted(loftGeometry(loftProfile([
      { y: apex - 0.0065, halfWidth: 0.020, halfDepth: 0.020, square: 2, x: side * canAxisX, z: canZ },
      { y: apex + 0.004, halfWidth: 0.021, halfDepth: 0.021, square: 2, x: side * canAxisX, z: canZ },
      { y: apex + 0.008, halfWidth: 0.0235, halfDepth: 0.0235, square: 2, x: side * canAxisX, z: canZ },
      { y: apex + 0.011, halfWidth: 0.0175, halfDepth: 0.0175, square: 2, x: side * canAxisX, z: canZ },
    ]), { radialSegments: 10, capBottom: true, capTop: true }), DRUNKARD_GEAR_TINT);
    parts.push(foldOnto(grommet, KIT_PLAIN));

    // The cradle's inboard rail: a gear-brown plate from the shell's flank
    // to the can's inboard face at the can's middle, derived from the
    // shell's own ring at that height (the M22 rule) — a can standing off a
    // shell with nothing holding it floats. Buried 6 mm into the shell and
    // 4 mm into the can so neither joint shows a seam.
    const { y: bracketY, half } = DRUNKARD_KIT.bracket;
    const flank = ringOf(DRUNKARD_HAT, bracketY).halfWidth;
    const inboardFace = canAxisX - canRadius;
    const bracketX = side * ((flank - 0.006 + inboardFace + 0.004) / 2);
    const reach = (inboardFace + 0.004 - (flank - 0.006)) / 2;
    const bracket = tinted(loftGeometry(loftProfile([
      { y: bracketY - half, halfWidth: reach, halfDepth: 0.011, square: 3.5, x: bracketX, z: canZ },
      { y: bracketY + half, halfWidth: reach, halfDepth: 0.011, square: 3.5, x: bracketX, z: canZ },
    ]), { radialSegments: 8, capBottom: true, capTop: true }), DRUNKARD_GEAR_TINT);
    parts.push(foldOnto(bracket, KIT_PLAIN));

    // The retaining strap round the can's waist, in the can's frame: the
    // can's own ring at that height stood `proud` off it, chamfered at both
    // edges. Untinted, on the peak's amber row — the vertex colour stays at
    // 1, which is load-bearing: the tests select tube vertices by the amber
    // *tint*, and a strap tinted amber would enrol itself as tube.
    const { centre, height, proud } = DRUNKARD_KIT.strap;
    const strapY = canHeight * centre;
    const strapRing = ringOf(DRUNKARD_CAN, strapY);
    const strapHalf = strapRing.halfWidth + proud;
    const strap = loftGeometry(loftProfile([
      { y: strapY - height / 2, halfWidth: strapHalf - 0.002, halfDepth: strapHalf - 0.002, square: 2 },
      { y: strapY - height / 2 + 0.002, halfWidth: strapHalf, halfDepth: strapHalf, square: 2 },
      { y: strapY + height / 2 - 0.002, halfWidth: strapHalf, halfDepth: strapHalf, square: 2 },
      { y: strapY + height / 2, halfWidth: strapHalf - 0.002, halfDepth: strapHalf - 0.002, square: 2 },
    ]), { radialSegments: 14, capBottom: true, capTop: true });
    parts.push(foldOnto(inCanFrame(side, strap), KIT_STRAP));

    // The cradle's cup under the base — the can's bottom ring, proud by the
    // strap's margin, dropped `cupDrop` below the base and closed top and
    // bottom — and its outboard rail, a bar buried `railBury` into the can's
    // outboard face from the cup up to the strap's top. Gear brown, the
    // target's black cradle.
    const { bar, cupDrop, railBury } = DRUNKARD_KIT.cradle;
    const cupHalf = canRadius + proud;
    const cup = loftGeometry(loftProfile([
      { y: -cupDrop, halfWidth: cupHalf, halfDepth: cupHalf, square: 2 },
      { y: 0.004, halfWidth: cupHalf, halfDepth: cupHalf, square: 2 },
    ]), { radialSegments: 14, capBottom: true, capTop: true });
    parts.push(foldOnto(inCanFrame(side, tinted(cup, DRUNKARD_GEAR_TINT)), KIT_PLAIN));
    const railX = side * (canAxisX + canRadius - railBury);
    const rail = tinted(loftGeometry(loftProfile([
      { y: canBottom - cupDrop + 0.002, halfWidth: bar, halfDepth: bar * 2, square: 3.5, x: railX, z: canZ },
      { y: canBottom + strapY + height / 2, halfWidth: bar, halfDepth: bar * 2, square: 3.5, x: railX, z: canZ },
    ]), { radialSegments: 8, capBottom: true, capTop: true }), DRUNKARD_GEAR_TINT);
    parts.push(foldOnto(rail, KIT_PLAIN));
  }
  parts.push(foldOnto(drunkardHatFoam(), KIT_PLAIN));
  const { y, z, halfWidth, halfDepth } = DRUNKARD_KIT.peak;
  const peak = loftGeometry(loftProfile([
    { y: y - 0.0075, halfWidth: 0, halfDepth: 0, z },
    { y: y - 0.004, halfWidth: halfWidth * 0.95, halfDepth: halfDepth * 0.95, square: 2.3, z },
    { y, halfWidth, halfDepth, square: 2.3, z },
    { y: y + 0.004, halfWidth: halfWidth * 0.95, halfDepth: halfDepth * 0.95, square: 2.3, z },
    { y: y + 0.0075, halfWidth: 0, halfDepth: 0, z },
  ]), { radialSegments: 20 });
  parts.push(foldOnto(peak, KIT_PEAK));
  return mergeGeometries(parts);
}

/**
 * The foam cap on the hat's crown (`DRUNKARD_KIT.foam`): a grid, not a
 * loft, because a loft's ring is one height all the way round and a foam
 * edge drips. `columns` columns round the shell (`s = k / columns`, the
 * same `s` `paintWrapped` hands the hat page, so the rim lands on the
 * painted edge), `rows` rows from the rim up to the apex, each vertex the
 * shell's own point at that `(u, v)` pushed out along its normal, and one
 * skirt row under the rim at zero proud. Untinted on the kit page's plain
 * strip — the same bare cream the painted foam already wears, so no page
 * changes and the paint direction rule is untouched. The winding follows
 * the loft's: `cross(tangent v, tangent u)` is outward (`loftNormal`).
 */
function drunkardHatFoam(): THREE.BufferGeometry {
  const { columns, rows, crown, temple, gradeFrom, gradeTo, lip } = DRUNKARD_KIT.foam;
  const proud = (y: number): number => {
    const grade = Math.min(1, Math.max(0, (y - gradeFrom) / (gradeTo - gradeFrom)));
    return temple + (crown - temple) * grade;
  };
  const apexV = DRUNKARD_HAT.length - 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  // Rows: the skirt (row 0, on the shell), the rim (row 1, proud), then up
  // to the apex. Every row has `columns + 1` vertices so the seam is split
  // and the page can wrap.
  const rowCount = rows + 2;
  for (let j = 0; j < rowCount; j += 1) {
    for (let k = 0; k <= columns; k += 1) {
      const s = k / columns;
      const u = s * Math.PI * 2;
      const edge = hatFoamEdge(s);
      const rimV = vAtHeight(DRUNKARD_HAT, edge);
      const v = j === 0
        ? vAtHeight(DRUNKARD_HAT, edge - lip)
        : rimV + (apexV - rimV) * ((j - 1) / rows);
      loftPoint(DRUNKARD_HAT, u, v, point);
      loftNormal(DRUNKARD_HAT, u, v, normal);
      const out = j === 0 ? 0 : proud(point.y);
      point.addScaledVector(normal, out);
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(s, j / (rowCount - 1));
    }
  }
  const at = (row: number, k: number): number => row * (columns + 1) + k;
  for (let j = 0; j < rowCount - 1; j += 1) {
    for (let k = 0; k < columns; k += 1) {
      const a = at(j, k);
      const b = at(j, k + 1);
      const c = at(j + 1, k);
      const d = at(j + 1, k + 1);
      indices.push(a, d, b, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return shaded(geometry);
}

/**
 * The ear's rings, in the face's frame for the left ear (`x` mirrored by
 * side): named so the concha can be derived from them (the M22 rule).
 */
const DRUNKARD_EAR: readonly (LoftRing & { readonly x: number; readonly z: number })[] = Object.freeze([
  { y: 0.164, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: 0.104, z: 0.006 },
  { y: 0.184, halfWidth: 0.013, halfDepth: 0.018, square: 2.3, x: 0.114, z: 0.008 },
  { y: 0.206, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: 0.108, z: 0.006 },
]);

/** A squashed ball for a face feature — Trollina's, restated here so this section reads on its own. */
function drunkardBall(halfWidth: number): LoftProfile {
  return loftProfile([
    { y: -halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
    { y: -halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
    { y: -halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
    { y: halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
    { y: halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
    { y: halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
  ]);
}

/**
 * His face, one skin mesh under the hat: the head, dark wraparound shades
 * with a frame, a bridge and a glint on each lens (a dark slab across a face
 * is a blindfold — the cop's lens rule, §29.3 fact 9), a wide grin with a
 * cream tooth strip proud of it, a goatee, stubble as a tint band on the
 * jaw, a nose, ears, and short hair under the rim. Every piece a loft, no
 * patches on a face (A1d's reason: a patch outline has six corners at any
 * segment count). Every feature sits at a depth derived from the head's own
 * rings (`frontAt`), so a ring change moves the face with it.
 *
 * Non-casting: it lives in the hat's shadow, and the ghost has the hat.
 */
function drunkardFaceParts(): THREE.BufferGeometry {
  const head = loftGeometry(DRUNKARD_HEAD, { radialSegments: 22 });
  // The stubble band round the jaw, and the hair under the hat's rim at the
  // back and sides: tints on the head's own vertices.
  {
    const position = head.getAttribute('position');
    const colour = head.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const z = position.getZ(i);
      if (y > 0.092 && y < 0.150 && z > 0.02) {
        colour.setXYZ(i, DRUNKARD_STUBBLE_TINT[0], DRUNKARD_STUBBLE_TINT[1], DRUNKARD_STUBBLE_TINT[2]);
      } else if (y <= 0.200 && ((y > 0.170 && z < 0.045) || (y > 0.150 && z < 0.010) || (y > 0.118 && z < -0.060))) {
        colour.setXYZ(i, DRUNKARD_HAIR_TINT[0], DRUNKARD_HAIR_TINT[1], DRUNKARD_HAIR_TINT[2]);
      }
    }
  }
  const parts: THREE.BufferGeometry[] = [head];
  const front = (y: number): number => frontAt(DRUNKARD_HEAD, y);

  for (const side of [-1, 1]) {
    // The frame: a dark rounded rectangle, one size up from the lens in it.
    // Centred 51 mm out with the inner edge at 13 mm, so 26 mm of skin shows
    // between the two frames — the target's keystone bridge is 15 % of its
    // frame's width; the first cut's 8 mm was 4.5 % and read as one band.
    parts.push(tinted(loftGeometry(loftProfile([
      { y: 0.174, halfWidth: 0.024, halfDepth: 0.005, square: 3.0, x: side * 0.051, z: front(0.174) - 0.006 },
      { y: 0.182, halfWidth: 0.038, halfDepth: 0.010, square: 3.2, x: side * 0.051, z: front(0.182) - 0.002 },
      { y: 0.210, halfWidth: 0.038, halfDepth: 0.010, square: 3.2, x: side * 0.051, z: front(0.210) - 0.002 },
      { y: 0.218, halfWidth: 0.024, halfDepth: 0.005, square: 3.0, x: side * 0.051, z: front(0.218) - 0.006 },
    ]), { radialSegments: 10 }), DRUNKARD_FRAME_TINT));
    // The lens: dark, proud of the frame.
    parts.push(tinted(loftGeometry(loftProfile([
      { y: 0.180, halfWidth: 0.020, halfDepth: 0.004, square: 3.0, x: side * 0.051, z: front(0.180) + 0.001 },
      { y: 0.187, halfWidth: 0.031, halfDepth: 0.007, square: 3.1, x: side * 0.051, z: front(0.187) + 0.003 },
      { y: 0.205, halfWidth: 0.031, halfDepth: 0.007, square: 3.1, x: side * 0.051, z: front(0.205) + 0.003 },
      { y: 0.212, halfWidth: 0.020, halfDepth: 0.004, square: 3.0, x: side * 0.051, z: front(0.212) + 0.001 },
    ]), { radialSegments: 10 }), DRUNKARD_LENS_TINT));
    // The glint: a small pale lens proud of the dark one, high and outboard
    // — the reflection that says glass rather than hole.
    const glint = tinted(loftGeometry(drunkardBall(0.0075), { radialSegments: 8 }), DRUNKARD_PALE_LIFT);
    glint.scale(1.5, 0.7, 0.45);
    glint.translate(side * 0.065, 0.203, front(0.203) + 0.0105);
    parts.push(glint);
    // An ear: a flattened bump standing just proud of the head's side, with
    // a concha sunk into its outboard face (gauntlet round 3 — a convex
    // lozenge at a 4 % shade carried no albedo break and no internal
    // spread, and in the profile capture the ear was flat skin with the
    // tube across it). Ten radial segments rather than eight: an 8-gon
    // shows its corners at the 42 × 34 px it fills in that view. The
    // bottom ring is seated with a shadow (0.88) where it meets the jaw.
    const ear = loftGeometry(loftProfile(DRUNKARD_EAR.map((ring) => ({ ...ring, x: side * ring.x }))), { radialSegments: 10, shade: 0.96 });
    {
      const position = ear.getAttribute('position');
      const colour = ear.getAttribute('color');
      for (let i = 0; i < position.count; i += 1) {
        if (position.getY(i) < DRUNKARD_EAR[0]!.y + 1e-6) colour.setXYZ(i, 0.88, 0.88, 0.88);
      }
    }
    parts.push(ear);
    // The concha: a dark almond derived from the ear's own rings, its face
    // 4 mm inside the ear's outboard face — sunk, not proud, so the ear's
    // reach (the widest thing on the face) does not change.
    parts.push(tinted(loftGeometry(loftProfile(
      [[0.172, 0], [0.184, 1], [0.198, 2]].map(([y, i]) => {
        const ring = DRUNKARD_EAR[i]!;
        return { y, halfWidth: 0.0045, halfDepth: 0.0085, square: 2.2, x: side * (ring.x + ring.halfWidth - 0.004), z: ring.z + 0.002 };
      }),
    ), { radialSegments: 6 }), DRUNKARD_EAR_SHADE));
  }

  // The brow bar joining the two frames, in the frame's own dark — across
  // the *top* of the frames rather than their middle, so the skin between
  // them is open from the frame's bottom edge up to it (the target's bridge
  // is open over ~80 % of the frame's height; the first cut's solid mid
  // bridge closed it to 0 %).
  parts.push(tinted(loftGeometry(loftProfile([
    { y: 0.199, halfWidth: 0.014, halfDepth: 0.005, square: 3, z: front(0.199) + 0.002 },
    { y: 0.2065, halfWidth: 0.026, halfDepth: 0.007, square: 3, z: front(0.2065) + 0.004 },
    { y: 0.214, halfWidth: 0.014, halfDepth: 0.005, square: 3, z: front(0.214) + 0.002 },
  ]), { radialSegments: 6 }), DRUNKARD_FRAME_TINT));

  // The nose: a skin wedge under the bridge, brighter so it catches the sun.
  parts.push(tinted(loftGeometry(loftProfile([
    { y: 0.146, halfWidth: 0.011, halfDepth: 0.007, square: 2.4, z: front(0.146) + 0.002 },
    { y: 0.160, halfWidth: 0.017, halfDepth: 0.011, square: 2.5, z: front(0.160) + 0.012 },
    { y: 0.178, halfWidth: 0.012, halfDepth: 0.007, square: 2.4, z: front(0.178) + 0.004 },
  ]), { radialSegments: 8 }), DRUNKARD_NOSE_TINT));

  // The grin — open-mouthed delight is the brief's whole expression (§3:
  // cheerful, never miserable) — as four features that run *across* the
  // face and are seated on it station by station (`drunkardAcross`): the
  // mouth's dark, the tooth strip inside it with dark showing above and
  // below (the target's order: line, teeth, cavity), a lower lip under it,
  // and the moustache over it. The first cut's mouth was one ellipsoid at
  // one depth, buried in the head above its middle, so no dark ever showed
  // above the cream and the corners could not rise.
  parts.push(drunkardAcross({
    halfWidth: DRUNKARD_MOUTH_HALF, y: DRUNKARD_MOUTH_Y, halfHeight: 0.016, thickness: 0.010,
    sink: -0.004, rise: DRUNKARD_MOUTH_CORNER_RISE, tint: DRUNKARD_MOUTH_TINT,
  }));
  parts.push(drunkardAcross({
    halfWidth: 0.055, y: DRUNKARD_MOUTH_Y + 0.0035, halfHeight: 0.0055, thickness: 0.006,
    sink: 0.0045, rise: DRUNKARD_MOUTH_CORNER_RISE * 0.85, tint: DRUNKARD_PALE_LIFT,
  }));
  parts.push(drunkardAcross({
    halfWidth: 0.050, y: DRUNKARD_MOUTH_Y - 0.0185, halfHeight: 0.0045, thickness: 0.006,
    sink: 0.001, rise: DRUNKARD_MOUTH_CORNER_RISE * 0.6, tint: DRUNKARD_LIP_TINT,
  }));
  // The moustache: the beard's dark as a short bar in the slot between the
  // nose and the grin, narrower than the tooth strip — the cop's near-black
  // first cut "read as a letterbox slot at chase distance".
  // Its ends rise (+4 mm) with the grin's corners, which now lift 23 mm:
  // at round 1's −3 mm droop the two features crossed at the corners.
  parts.push(drunkardAcross({
    halfWidth: 0.026, y: 0.1478, halfHeight: 0.0032, thickness: 0.006,
    sink: 0.002, rise: 0.004, tint: DRUNKARD_GOATEE_TINT,
  }));

  // The goatee: a spade under the lip — widest just under the chin's
  // curve, narrowing to a point that lands on the collar's top edge (the
  // target's hangs below the chin and converges to one point over the
  // collar). 52 mm wide at its widest, 0.29 of the shades' span (the
  // target's beard is 0.31; round 1's 28 mm was 0.16 and read as a drip
  // off the chin), and its top ring butts the lip's underside across its
  // whole width — the target's beard wraps the lower lip with no bare skin
  // between. **It hangs down off the chin, not back onto the throat**
  // (gauntlet round 3): round 2's spine dropped 34.5 mm while receding 43,
  // leaving the chin 51° back from vertical and landing on the throat 14 mm
  // above the collar, so in the front capture the beard projected 33 × 22
  // px — a blunt wedge, 2.5× too short for its width — and foreshortened
  // to a blob the moment the head pitched. Now the drop is 54.5 mm against
  // the 52 mm width, the underside runs almost straight down from the
  // chin's front, and the four rings below the head's lowest ring are still
  // derived from the *neck's* rings (M22, a clamp below 86 mm floats),
  // only with a larger normal offset — a beard hangs off a chin rather than
  // hugging a throat.
  parts.push(tinted(loftGeometry(loftProfile([
    { y: 0.052, halfWidth: 0, halfDepth: 0, z: frontAt(NECK, 0.052) + 0.019 },
    { y: 0.061, halfWidth: 0.007, halfDepth: 0.008, square: 2.4, z: frontAt(NECK, 0.061) + 0.021 },
    { y: 0.070, halfWidth: 0.012, halfDepth: 0.010, square: 2.5, z: frontAt(NECK, 0.070) + 0.023 },
    { y: 0.080, halfWidth: 0.017, halfDepth: 0.011, square: 2.5, z: frontAt(NECK, 0.080) + 0.025 },
    { y: 0.090, halfWidth: 0.022, halfDepth: 0.012, square: 2.6, z: front(0.090) + 0.002 },
    { y: 0.099, halfWidth: 0.026, halfDepth: 0.011, square: 2.6, z: front(0.099) + 0.001 },
    { y: 0.1065, halfWidth: 0.023, halfDepth: 0.008, square: 2.6, z: front(0.1065) - 0.001 },
  ]), { radialSegments: 10 }), DRUNKARD_GOATEE_TINT));

  return mergeGeometries(parts);
}

/**
 * A face feature that runs *across* the face — a mouth, a tooth strip, a
 * lip, a moustache — built as a loft whose rings are stations from the left
 * corner to the right, each seated on the head's own surface at that
 * offset (`surfaceZAt`, the M22 rule read across rather than down), then
 * turned to lie along `x`. `halfHeight` is the feature's vertical half-extent
 * at its middle, tapering to nothing at the corners; `sink` moves its
 * centre line behind (negative) or ahead of the surface; `rise` lifts the
 * corners above the centre by that much (a laugh), or drops them.
 */
function drunkardAcross(spec: {
  readonly halfWidth: number;
  readonly y: number;
  readonly halfHeight: number;
  readonly thickness: number;
  readonly sink: number;
  readonly rise: number;
  readonly tint: Tint;
}): THREE.BufferGeometry {
  // Thirteen stations: with a 23 mm corner rise the nine-station parabola
  // was a four-segment polyline per half (gauntlet round 2).
  const stations = 13;
  const rings: LoftRing[] = [];
  for (let i = 0; i < stations; i += 1) {
    const t = -1 + (2 * i) / (stations - 1);
    const x = t * spec.halfWidth;
    const y = spec.y + spec.rise * t * t;
    // A crescent: full height at the middle, a point at each corner, and
    // the band holding 78 % of its thickness at the last interior station
    // (a square-root lens held 66 % and its ends dissolved into the dark
    // — the target's band keeps half its thickness at the corners).
    const height = spec.halfHeight * Math.max(0, 1 - t * t) ** 0.3;
    rings.push({
      y: x,
      halfWidth: Math.max(0, height),
      halfDepth: spec.thickness / 2,
      square: 2.2,
      x: -y,
      z: surfaceZAt(DRUNKARD_HEAD, y, x) + spec.sink,
    });
  }
  // The loft's axis is `y`; turned a quarter it lies along `x`, and a
  // ring's `x` offset (authored as `-y`) becomes its height.
  const geometry = loftGeometry(loftProfile(rings), { radialSegments: 10 });
  geometry.rotateZ(-Math.PI / 2);
  return tinted(geometry, spec.tint);
}

// -- The pack and hose ----------------------------------------------------------

/**
 * The pack's centre-line depth, derived from the jersey's own back: its
 * inner face is buried 10 mm into the deepest of the back's rings across
 * its height, so a ring change moves the pack with the back (the M22 rule).
 */
const DRUNKARD_PACK_HALF_DEPTH = 0.045;
const DRUNKARD_PACK_Z = (() => {
  const point = new THREE.Vector3();
  let back = Infinity;
  for (const y of [0.20, 0.26, 0.32, 0.38, 0.44]) {
    loftPoint(DRUNKARD_JERSEY, -Math.PI / 2, vAtHeight(DRUNKARD_JERSEY, y), point);
    back = Math.min(back, point.z);
  }
  return back - DRUNKARD_PACK_HALF_DEPTH + 0.010;
})();

/**
 * The pack: a loft box on Adonisb2's proven anatomy — between the shoulder
 * blades and the small of the back, a lid a step prouder over it — standing
 * off the back as a closed volume rather than a lifted slab (A1d's fourth
 * finding: only a volume grows out of a body). Its page wraps it, and the
 * window is printed on the face that looks backward.
 */
/**
 * **No vessel above the box** — Codex's QA after Phase 2 (2026-09-03), and
 * it undoes gauntlet round 1's pint. Round 1 stood a pint 138 mm over the
 * box so its crown broke the shoulder line, and the head's arc owns that
 * space: the neck counter-pitches 0.68 rad in an ordinary attack stance
 * and up to 0.97 in a launch held in a crouch, and the skull's back is
 * 190 mm from the neck joint, so it sweeps down to ~470 mm behind the
 * pelvis in the composite. Measured, the pint's front face was 48 mm
 * inside the skull on every fast ride, and no crown height saved it — at
 * 485 mm it was still 31 mm inside. So the box keeps its window face and
 * the beer band all round, and closes with a 16 mm lid 54 mm under the
 * shoulder ring; `riderClearance.test.ts` sweeps the skull and the hat
 * against the whole pack through the folds and the launch.
 */
/** The box's top ring: the lid begins here, and so does the band's top on the page (`PACK_BAND.top`, pinned to this). */
const DRUNKARD_BOX_TOP = 0.446;

const DRUNKARD_PACK = loftProfile([
  { y: 0.168, halfWidth: 0.060, halfDepth: 0.028, square: 2.6, z: DRUNKARD_PACK_Z },
  { y: 0.182, halfWidth: 0.092, halfDepth: 0.043, square: 3.4, z: DRUNKARD_PACK_Z },
  { y: 0.205, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
  // Three rings through the window, each the ring it sits between: the page
  // row is a ring index, and the window at two rings had sixteen texel rows
  // for its foam line — a 12.5 mm quantum that flattened every drip.
  { y: 0.255, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
  { y: 0.305, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
  { y: 0.355, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
  { y: 0.405, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
  { y: 0.418, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: DRUNKARD_PACK_Z },
  { y: DRUNKARD_BOX_TOP, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: DRUNKARD_PACK_Z },
  // The lid: a rounded close in the printed brown, low enough that the
  // skull clears it at the neck's full extension with the look and the
  // sway composed.
  { y: 0.452, halfWidth: 0.088, halfDepth: 0.043, square: 3.0, z: DRUNKARD_PACK_Z },
  { y: 0.458, halfWidth: 0.060, halfDepth: 0.030, square: 2.6, z: DRUNKARD_PACK_Z },
  { y: 0.462, halfWidth: 0, halfDepth: 0, z: DRUNKARD_PACK_Z },
]);

/**
 * The straps' vertex shade over the gear brown: 1.60 lifts `0x46301b` to
 * `#583d24`, two levels off the printed brown the pack's frame, the belt and
 * the pads wear (`0x5a3b1c`) — one dark for the whole harness. At the first
 * cut's 1.08 the straps were 17 levels of red under the pack they hold and
 * read as black webbing on a brown box (gauntlet round 1).
 */
const DRUNKARD_STRAP_SHADE = 1.60;
/**
 * The bite valve's tint (gauntlet round 2): the garment's ivory at 0.45,
 * a pale moulded fitting on dark webbing. Round 1 gave it the glove's line
 * brown (gear × 1.6) while the straps were at 1.08, then lifted the straps
 * to 1.60 — and gear × 1.60 over the print ground *is* gear × 1.6 to 0.3 %:
 * the valve and the strap it lands on became one colour in every light and
 * the fitting vanished. Stated against the strap rather than as a hex, and
 * `drunkard.test.ts` pins the ratio: the valve's worn red is at least 2.5×
 * the strap's. 0.45 also keeps its red under the 0.5 the hose selector
 * starts at, so the census can still tell valve from hose.
 */
const DRUNKARD_VALVE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardIvory, 0.45);

/** The strap's chest run and the crossing on the slope — Wheel in Motion's measured angles, inherited. */
const DRUNKARD_STRAP = Object.freeze({
  chestOuter: -1.00,
  chestInner: -0.76,
  crossingFrom: 0.520,
  crossingTo: 0.536,
  wrapFrom: 0.240,
  wrapTo: 0.286,
  /** The pack's side face, as an angle either side of straight back: where the wraps and the rear run end. */
  packHalfAngle: 0.45,
});

/**
 * The hose, in the pelvis frame: from the pack's top corner over the RIGHT
 * shoulder to the collarbone (q105's mirror ruling — the free side is not
 * the crowded side), where it ends in a bite valve clipped to the strap.
 * It crosses the slope at 132 mm from the midline, on the strap's crossing
 * and clear of the arm's dome, 12 mm under the strap's crossing height so
 * it lies on the strap with its top under the neck ring, which is the pin.
 * It never reaches the mouth: a tube from the pelvis to the neck spans two
 * joints (§29.2).
 *
 * 24 mm across (gauntlet round 3; 17 at rounds 1–2), 92 % of the hat
 * tube's 26: brief §8 lists the hydration tube beside the two hat tubes
 * with one thickness requirement, and at 17 mm it was a 3 px thread at
 * chase against the hat tubes' 5 — decoration, not plumbing.
 */
const DRUNKARD_HOSE_RADIUS = 0.012;
/** The collarbone: on the chest run's line, 478 mm up, 20 mm off the jersey. */
const DRUNKARD_VALVE: THREE.Vector3 = (() => {
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const v = vAtHeight(DRUNKARD_JERSEY, 0.478);
  loftPoint(DRUNKARD_JERSEY, Math.PI / 2 + 0.90, v, point);
  loftNormal(DRUNKARD_JERSEY, Math.PI / 2 + 0.90, v, normal);
  return point.addScaledVector(normal, 0.020);
})();
/**
 * How far the hose's centre line stands off the jersey where it runs over
 * the body: the strap's lift (10 mm) plus the hose's radius (12 mm) plus
 * 5.5 mm for the spline's sag between knots — stated as that sum so a
 * fatter hose cannot re-enter the strap sheet. The first cut stated its
 * clearance as an offset in `y` while the strap is lifted along the
 * *normal*, which on the chest and the back is nearly horizontal — so the
 * hose's axis was coincident with the strap sheet and half the tube ran
 * behind it (gauntlet round 1).
 */
const DRUNKARD_HOSE_LIFT = 0.010 + DRUNKARD_HOSE_RADIUS + 0.0055;
/** A point on the jersey at an angle and a height, stood off along its normal by the hose's lift. */
function drunkardOnJersey(u: number, y: number): THREE.Vector3 {
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const v = vAtHeight(DRUNKARD_JERSEY, y);
  loftPoint(DRUNKARD_JERSEY, u, v, point);
  loftNormal(DRUNKARD_JERSEY, u, v, normal);
  return point.addScaledVector(normal, DRUNKARD_HOSE_LIFT);
}

/** The valve's half-width at its middle ring: wider than the chest strap's half-band (round 2), and the test pins that. */
const DRUNKARD_VALVE_HALF_WIDTH = 0.019;

export const DRUNKARD_HOSE = Object.freeze({
  radius: DRUNKARD_HOSE_RADIUS,
  crossingX: -0.132,
  valve: DRUNKARD_VALVE,
  valveHalfWidth: DRUNKARD_VALVE_HALF_WIDTH,
  valveTint: DRUNKARD_VALVE_TINT,
  strapShade: DRUNKARD_STRAP_SHADE,
  /**
   * From the box's top right corner (the pint it left from is gone — see
   * `DRUNKARD_BOX_TOP`), over the shoulder blade, across the slope at
   * 508 mm (12 mm under the strap's crossing at 520 — round 3 dropped it
   * from 515 with the radius, or the fatter tube's top overran the neck
   * ring by 0.2 mm), down the chest run to the valve. The three over-body
   * knots are derived from the jersey (`drunkardOnJersey`), so the hose
   * lies *on* the strap rather than through it, and its top stays under
   * the neck ring — the pin.
   */
  points: (): THREE.Vector3[] => [
    new THREE.Vector3(-0.100 + 0.008, DRUNKARD_BOX_TOP - 0.006, DRUNKARD_PACK_Z - 0.006),
    drunkardOnJersey(-2.231, 0.488),
    drunkardOnJersey(-3.060, 0.508),
    drunkardOnJersey(2.309, 0.497),
    DRUNKARD_VALVE.clone(),
  ],
});

/** The pack, its hose and the bite valve — one casting extra on the pelvis, wearing the pack page. */
function drunkardPack(): THREE.BufferGeometry {
  const pack = loftGeometry(DRUNKARD_PACK, { radialSegments: 24, splitSeam: true });
  const hose = foldOnto(sweptTube(DRUNKARD_HOSE.points(), DRUNKARD_HOSE_RADIUS, DRUNKARD_AMBER_TINT), PACK_PLAIN);
  // The bite valve: a knob at the hose's end in the pale valve tint (see
  // `DRUNKARD_VALVE_TINT` for why not a brown), and 38 mm across where the
  // chest strap under it is 30 mm (gauntlet round 2): a fitting narrower
  // than the band it sits on has no side silhouette, and in the chest's
  // shade a value step alone is worth six levels. Its end rings grew 2 mm
  // with the hose (round 3) so the fitting stays proud of a 24 mm tube.
  const { x, y, z } = DRUNKARD_HOSE.valve;
  const valve = tinted(loftGeometry(loftProfile([
    { y: y - 0.017, halfWidth: 0, halfDepth: 0, x, z },
    { y: y - 0.013, halfWidth: 0.014, halfDepth: 0.012, square: 2.4, x, z },
    { y: y - 0.002, halfWidth: DRUNKARD_VALVE_HALF_WIDTH, halfDepth: 0.015, square: 2.6, x, z },
    { y: y + 0.010, halfWidth: 0.017, halfDepth: 0.014, square: 2.4, x, z },
    { y: y + 0.016, halfWidth: 0, halfDepth: 0, x, z },
  ]), { radialSegments: 10 }), DRUNKARD_VALVE_TINT);
  return mergeGeometries([pack, hose, foldOnto(valve, PACK_PLAIN)]);
}

// -- The can in his fist --------------------------------------------------------

/**
 * The can in his LEFT fist (q105), in the hand's frame: `y` 0 at the wrist,
 * the fingers closing at −105 mm. The can stands upright through the fist,
 * its axis 18 mm ahead of the glove's so its body shows through the
 * fingers, gripped by its top third: its top 43 mm under the wrist and its
 * bottom 115 mm below the fingertips — the way a can is carried at the
 * side, and the length that reads at chase distance (gauntlet round 1:
 * held by the middle, 42 mm showed and the glove hid the rest from behind
 * — an 8 px sliver where the hat cans read at 23). Printed, since round 2,
 * on its own page (`DRUNKARD_HAND_CAN_BANDS`, `paintHandCan`): cream rim,
 * amber label with the hop cone, the cream top dripping into the amber.
 *
 * **The same can as the hat cans** (gauntlet round 3): 90 mm across by
 * 165 mm — `DRUNKARD_KIT.canRadius` and `canHeight` — where rounds 1–2's
 * 66 × 135 was 0.73× its own hat can and narrower than the fist (92 mm)
 * and the forearm (86 mm) holding it, so at chase it read as a two-tone
 * cuff on the end of the glove. The target's fist can is ~1.4× its hat
 * can, so this is still the conservative step. `top` and `z` are
 * unchanged: the grip, the fingertip boundary and the show-through all
 * stay anchored where rounds 1–2 put them.
 */
export const DRUNKARD_HAND_CAN = Object.freeze({
  radius: 0.045,
  top: -0.055,
  bottom: -0.220,
  z: 0.018,
  /**
   * **How far outboard of the fist's axis he carries it, metres** — 8 mm, and
   * it is a clearance measurement rather than a look decision (M30 Phase 2's
   * QA, `render/riderClearanceRidden.test.ts`).
   *
   * Phase 2's hang brings the pelvis — and the fist under it — inside the
   * machine's line at speed, and the can's inboard flank near its base is the
   * one thing on him that comes near his thigh. With the ride's *phase* swept
   * as well as its steering, the worst approach on a `?mph=65` build at the
   * shipped share was **28.3 mm against a 40 mm floor**. §30.3d's rule points
   * at the slider, q114 points at this: the can's carry is the lever, and the
   * floor is never the lever.
   *
   * The direction is measured, not chosen. Perturbing the carried can a
   * millimetre at a time through the production rig at the worst pose, the gap
   * moves **0.96 mm per mm outboard**, 0.27 per mm up and 0.13 per mm back —
   * outboard is very nearly the thigh's own normal there, and the other two
   * would need tens of millimetres and would move the grip off the fingertips
   * and the can out of the fist. 7 mm is the smallest whole millimetre that
   * holds the floor (40.1 mm, converged over 600 phase rungs); 8 mm is what is
   * carried, because a tenth of a millimetre is a number, not a margin.
   *
   * The grip is derived from this circle (`drunkardHandGrip`), so the fingers
   * come with it: what moves is where the fist holds the can, not the can
   * inside the fist.
   */
  x: 0.008,
});

/** The look's densities — stated once, because the glove's vertex count below is derived from the hand's. */
const DRUNKARD_DENSITY = Object.freeze({ limb: 18, torso: 30, head: 28, hand: 12 });

/**
 * How many vertices the glove loft has in the merged hand: the can's
 * vertices follow it, so the hand painter knows which is which by index
 * rather than by an address shade. Derived from the same profile and
 * density the rig builds with, so it cannot drift from them.
 */
const DRUNKARD_GLOVE_VERTICES = (() => {
  const glove = loftGeometry(WIM_GLOVE, { radialSegments: DRUNKARD_DENSITY.hand });
  const count = glove.getAttribute('position').count;
  glove.dispose();
  return count;
})();

/** A geometry the hand merge accepts as nothing: the right hand carries no can. */
function emptyPart(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
  return geometry;
}

/**
 * The can's label bands, metres from its bottom and its top: a cream rim, a
 * brown line, the amber label, the cream top with its foam dripping down
 * into the amber. **Print, since gauntlet round 2** — the can wears its own
 * wrapped page (`DRUNKARD_REGIONS.handCan`, `paintHandCan`) the way the hat
 * cans do, so it can carry the target's foam edge and its hop cone; round
 * 1's vertex-coloured bands could carry neither, and the hand can was the
 * one printed-looking object on him with no print.
 */
const DRUNKARD_HAND_CAN_RIM = 0.010;
const DRUNKARD_HAND_CAN_LINE = 0.004;
/**
 * 80 mm of cream from the top: the boundary lands 30 mm below the
 * fingertips (round 1's 60 mm put it 10 mm below, and at chase distance
 * that was a 3 px cap on an amber stub the same amber as the trousers —
 * gauntlet round 2), so the visible can is two-tone; the foam tongues take
 * it a further 12 mm down. Not the 90 mm the round asked for, because the
 * hop cone under the cream needs amber to sit in: 41 mm at round 2's can,
 * 71 since round 3 grew the can.
 */
const DRUNKARD_HAND_CAN_TOP_BAND = 0.080;
/** How far the top band's foam drips down into the amber, metres. */
const DRUNKARD_HAND_CAN_DRIP = 0.012;
/** The label's bands in the can's own frame, metres up from its base — what its page is painted against. */
export const DRUNKARD_HAND_CAN_BANDS = Object.freeze({
  rim: DRUNKARD_HAND_CAN_RIM,
  line: DRUNKARD_HAND_CAN_LINE,
  top: DRUNKARD_HAND_CAN.top - DRUNKARD_HAND_CAN.bottom - DRUNKARD_HAND_CAN_TOP_BAND,
  drip: DRUNKARD_HAND_CAN_DRIP,
});

/**
 * The can in its own frame, `y` 0 at its base: chamfered rims and a necked
 * top like the hat can's, and the barrel re-rung every ~10 mm between the
 * brown line and the cream boundary — a page row is a ring index, and the
 * cone lives in that band.
 */
const DRUNKARD_HAND_CAN_PROFILE = loftProfile((() => {
  const { radius, top, bottom, z } = DRUNKARD_HAND_CAN;
  const height = top - bottom;
  const { rim, line, top: cream } = DRUNKARD_HAND_CAN_BANDS;
  const full = { halfWidth: radius, halfDepth: radius, square: 2, z };
  const barrel: LoftRing[] = [];
  for (let k = 0; k <= 4; k += 1) barrel.push({ y: rim + line + ((cream - rim - line) * k) / 4, ...full });
  return [
    { y: 0, halfWidth: 0, halfDepth: 0, z },
    { y: 0.003, halfWidth: radius * 0.82, halfDepth: radius * 0.82, square: 2, z },
    { y: rim, ...full },
    ...barrel,
    { y: height - 0.011, halfWidth: radius * 0.91, halfDepth: radius * 0.91, square: 2, z },
    { y: height - 0.004, halfWidth: radius * 0.82, halfDepth: radius * 0.82, square: 2, z },
    { y: height, halfWidth: 0, halfDepth: 0, z },
  ];
})());

function drunkardHandCan(side: number): THREE.BufferGeometry {
  if (side < 0) return emptyPart();
  // Its own seam column, so the page can wrap it: without one the last
  // facet's texture runs backwards across the whole label.
  const can = loftGeometry(DRUNKARD_HAND_CAN_PROFILE, { radialSegments: 12, splitSeam: true });
  // Outboard by the carry, mirrored by the side so a right-fist can would sit
  // where its own thigh needs it rather than 16 mm nearer.
  can.translate(side * DRUNKARD_HAND_CAN.x, DRUNKARD_HAND_CAN.bottom, 0);
  return can;
}

/** How many vertices the can loft has in the merged hand, derived as the glove's is: the grip's follow it. */
const DRUNKARD_CAN_VERTICES = (() => {
  const can = drunkardHandCan(1);
  const count = can.getAttribute('position').count;
  can.dispose();
  return count;
})();

/**
 * The grip (gauntlet round 2): two finger bars and a thumb wrapping the
 * can's front, in the hand's frame — the target's glove laps over the can's
 * body, and the fist loft (a closed mitten with no fingers) stood 29 mm
 * *behind* the can's front face, so nothing of the glove was ever in front
 * of the can from any camera. Every knot is **derived from the can's own
 * circle** (axis `x` 0, `z` `DRUNKARD_HAND_CAN.z`) at a stated bury, so
 * the bars bed into whatever radius the can has — round 3 grew it 33 →
 * 45 mm, and rounds 1–2's absolute knots would have sat 17 mm under the
 * new skin, a grip swallowed whole (the derivation rule, M22, on a prop).
 * The bars end at the fist's own tip (−105 mm), so the 85 mm of can below
 * the fist and the cream under the fingertips are untouched. Three swept
 * tubes at six segments each, merged into the hand at no draw call (the
 * Maribel grammar, `build.hand`).
 */
const DRUNKARD_GRIP = Object.freeze({ finger: 0.008, thumb: 0.009, upper: -0.079, lower: -0.097 });
function drunkardHandGrip(side: number): THREE.BufferGeometry {
  if (side < 0) return emptyPart();
  const { finger, thumb, upper, lower } = DRUNKARD_GRIP;
  const { radius, z: canZ, x: canX } = DRUNKARD_HAND_CAN;
  // A knot on the can's circle: `deg` from straight ahead (+z) toward the
  // signed x of the old layout (negative = the bar's root side), buried
  // `bury` under the can's skin. The wrap knots bury 2 mm of the tube's
  // 8 mm radius, so most of each ring stands clear of the skin — fingers
  // lapping the can, not floating off it and not drowned in it.
  const at = (deg: number, bury: number, y: number): THREE.Vector3 => {
    const a = (deg * Math.PI) / 180;
    return new THREE.Vector3(
      side * (canX + Math.sin(a) * (radius - bury)),
      y,
      canZ + Math.cos(a) * (radius - bury),
    );
  };
  const bar = (y: number, rootDeg: number): THREE.Vector3[] => [
    // The root dives 8 mm in at the flank, where the can and the fist
    // overlap, so the bar grows out of the glove rather than hanging in
    // front of it.
    at(rootDeg, 0.008, y),
    at(-65, 0.002, y),
    at(-21, 0.002, y - 0.002),
    at(26, 0.002, y - 0.002),
    at(69, 0.002, y),
  ];
  const parts = [
    sweptTube(bar(upper, -100), finger, DRUNKARD_GEAR_TINT, 6),
    // The lower bar's root sits a few degrees shallower: at the fist's
    // taper the flank overlap is thinner and a deeper root read as a
    // detached finger in rounds 1–2's absolute layout.
    sweptTube(bar(lower, -92), finger, DRUNKARD_GEAR_TINT, 6),
    sweptTube([
      at(101, 0.008, -0.058),
      at(86, 0.004, -0.070),
      at(63, 0.004, -0.084),
    ], thumb, DRUNKARD_GEAR_TINT, 6),
  ];
  return mergeGeometries(parts);
}

// -- His paintwork ---------------------------------------------------------------
//
// The legs and the hands are print-ground based, so every tint below paints
// *down* — the direction the multiplier honours.

/** The seat, painted trouser amber: the one body painter that reads a shade as an address (Wheel in Motion's). */
const DRUNKARD_SEAT_SHADE = 0.86;
function paintDrunkardTorso(geometry: THREE.BufferGeometry): void {
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < colour.count; i += 1) {
    if (Math.abs(colour.getX(i) - DRUNKARD_SEAT_SHADE) > 1e-6) continue;
    colour.setXYZ(i, DRUNKARD_AMBER_TINT[0], DRUNKARD_AMBER_TINT[1], DRUNKARD_AMBER_TINT[2]);
  }
}

/** Is this point on the leg under the knee pad's arc — the front, either side of it? */
function underDrunkardPad(x: number, z: number): boolean {
  return Math.abs(Math.atan2(x, z)) < 1.20;
}

/**
 * The cream panel's edges, radians from straight ahead toward the outside
 * of the leg, and the outer-thigh block's (gauntlet round 3). The panel was
 * 0.45–1.05 rad, which on an 18-column leg was exactly two columns (34°
 * and 51°) — one pale lobe, 9 % of the thigh flat, where the target's
 * cream is 31 % of it. Now 0.18–0.92: the target's measured inboard edge
 * (10.4°) and an outer edge past the 51° column, so the flat cream runs
 * 14→51° (the target's 38° of arc) with one ramp each side. The block
 * starts where the panel stops, so cream meets brown with no amber gap,
 * the way the target's do, and stops at 2.10 rad (120°): the target never
 * shows the rear of the leg.
 */
const DRUNKARD_PANEL = Object.freeze({ inner: 0.18, outer: 0.92 });
const DRUNKARD_THIGH_BLOCK_END = 2.10;

/** Is this point on the cream panel: a stripe down the *outboard* front of the leg — the render's cream trouser panels. */
function onDrunkardPanel(x: number, z: number, side: number): boolean {
  const angle = Math.atan2(side * x, z);
  return angle > DRUNKARD_PANEL.inner && angle < DRUNKARD_PANEL.outer;
}

/** Amber trousers with the cream panel and the dark outer-thigh block; brown under the pad's arc at the knee end. */
function paintDrunkardThigh(geometry: THREE.BufferGeometry, side: number): void {
  const padTop = -RIDER_BLOCKOUT.thighLength * DRUNKARD_PAD_TOP;
  const blockTop = -RIDER_BLOCKOUT.thighLength * DRUNKARD_THIGH_BLOCK_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const x = position.getX(i);
    const z = position.getZ(i);
    const outer = Math.atan2(side * x, z);
    const tint = y <= padTop && underDrunkardPad(x, z)
      ? DRUNKARD_BROWN_TINT
      : y <= blockTop && outer >= DRUNKARD_PANEL.outer && outer < DRUNKARD_THIGH_BLOCK_END
        ? DRUNKARD_BROWN_TINT
        : onDrunkardPanel(x, z, side) && y > padTop + 0.02
          ? DRUNKARD_GARMENT_TINT
          : DRUNKARD_AMBER_TINT;
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** Brown under the pad, amber with the panel below it, then the boot's amber shaft with a cream collar and laces. */
function paintDrunkardShin(geometry: THREE.BufferGeometry, side: number): void {
  const cuff = -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP;
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const x = position.getX(i);
    const z = position.getZ(i);
    let tint: Tint;
    if (y < cuff) {
      // The shaft: amber, a cream collar band at its top and a cream lace
      // strip up its front — what says boot rather than trouser.
      const collar = y > cuff - 0.016;
      const laces = z > 0 && Math.abs(x) < 0.016 * (Math.hypot(x, z) / 0.05);
      tint = collar || laces ? DRUNKARD_GARMENT_TINT : DRUNKARD_AMBER_TINT;
    } else if (y >= DRUNKARD_PAD_BOTTOM && underDrunkardPad(x, z)) {
      tint = DRUNKARD_BROWN_TINT;
    } else if (onDrunkardPanel(x, z, side) && y < DRUNKARD_PAD_BOTTOM - 0.02) {
      tint = DRUNKARD_GARMENT_TINT;
    } else {
      tint = DRUNKARD_AMBER_TINT;
    }
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
}

/** The gear boot: an ankle band and laces one step lighter — the M19 grammar. */
function paintDrunkardBoot(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height;
    const z = position.getZ(i);
    const x = position.getX(i);
    const ankleBand = t > 0.62 && t < 0.82;
    const laces = t > 0.36 && t < 0.62 && z > 0.02 && Math.abs(x) < 0.014;
    if (ankleBand || laces) {
      colour.setXYZ(i, DRUNKARD_BOOT_LINE_TINT[0], DRUNKARD_BOOT_LINE_TINT[1], DRUNKARD_BOOT_LINE_TINT[2]);
    }
  }
}

/**
 * The hand: the glove painted down to the gear brown with its knuckle line,
 * a hop-green cuff band (the target's wrist band, on both wrists — the one
 * green on him that wraps, so it is the one the chase camera sees), and —
 * on the left, after the glove's own vertices — the can, left at the print
 * ground and **re-folded onto its own page** (round 2), then the grip's
 * fingers in the glove's brown.
 *
 * The rig folds the whole hand onto the blank page before this runs
 * (`rider.ts`, `paged`), so the can's texture coordinates are unfolded from
 * it here, affinely per axis, and folded onto `handCan` — with the
 * circumference run through `handCanPageS`, so the faces a camera sees get
 * three quarters of the page's width. Done here rather than in `rider.ts`
 * so the loft's own seam column survives and Maribel's `build.hand`
 * contract is untouched.
 */
function paintDrunkardHand(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  const uv = geometry.getAttribute('uv');
  const blank = DRUNKARD_REGIONS.blank;
  const page = DRUNKARD_REGIONS.handCan;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    let tint: Tint;
    if (i < DRUNKARD_GLOVE_VERTICES) {
      const z = position.getZ(i);
      const cuff = y > -0.024 && y < -0.012;
      const knuckles = y < -0.040 && y > -0.062 && z > 0.012;
      tint = cuff ? DRUNKARD_HOP_TINT : knuckles ? DRUNKARD_GEAR_LINE_TINT : DRUNKARD_GEAR_TINT;
    } else if (i < DRUNKARD_GLOVE_VERTICES + DRUNKARD_CAN_VERTICES) {
      tint = DRUNKARD_CREAM_TINT;
      const u01 = (uv.getX(i) - blank.u0) / (blank.u1 - blank.u0);
      const v01 = (uv.getY(i) - blank.v0) / (blank.v1 - blank.v0);
      uv.setXY(i, page.u0 + (page.u1 - page.u0) * handCanPageS(u01), page.v0 + (page.v1 - page.v0) * v01);
    } else {
      tint = DRUNKARD_GEAR_TINT;
    }
    colour.setXYZ(i, tint[0], tint[1], tint[2]);
  }
  uv.needsUpdate = true;
}

/**
 * The knee pad's patch, as the sheet needs it for the cone's aspect.
 *
 * Gauntlet round 2: ±0.58 rad rather than ±1.15 — the pad was 161 mm wide
 * by 93 tall (1.74:1) and read as a rolled cuff; the target's cup is
 * 0.77–0.93:1. Now 91 × 92 mm. And its foot at −0.086, the *upper* ring of
 * the shin's seam pair, not −0.088 between them: a patch's `t` is linear in
 * ring index, and authored between the pair the bottom 27 % of the knee
 * page mapped onto 2.9 mm of pad — the cone's whole tip crushed into the
 * rim. The painted brown under it still runs to −0.088.
 */
const DRUNKARD_KNEE_PAD = Object.freeze({ u0: -0.58, u1: 0.58, from: DRUNKARD_PAD_BOTTOM + 0.002, to: -0.010, lift: 0.022 });

/** What his sheet is painted against — the bodies its pages wrap. */
export const DRUNKARD_SHEET_LAYOUT: DrunkardSheetLayout = Object.freeze({
  torso: DRUNKARD_JERSEY,
  upperArm: DRUNKARD_UPPER_ARM,
  forearm: DRUNKARD_FOREARM,
  shin: DRUNKARD_SHIN,
  hat: DRUNKARD_HAT,
  // 118 mm across, centred 370 mm above the hip — 35 % of the chest's
  // projected width, the target's 34 % by the collar-to-belt ruler; the
  // first cut's 56 mm was 17 % and a badge nobody saw. The mark now sizes
  // the amber centre panel, not the other way round: the panel widens
  // below it and the flanks run to the belt (`paintJersey`).
  chestHop: Object.freeze({ width: 0.118, centre: 0.370 }),
  kneePad: DRUNKARD_KNEE_PAD,
  can: DRUNKARD_CAN,
  handCan: DRUNKARD_HAND_CAN_PROFILE,
  handCanBands: DRUNKARD_HAND_CAN_BANDS,
  pack: DRUNKARD_PACK,
});

export const DRUNKARD_LOOK: RiderLook = Object.freeze({
  id: 'drunkard' as CharacterId,
  // Wheel in Motion's densities for the print, and a denser hand for the can
  // through the fist. Triangles are the free axis.
  density: DRUNKARD_DENSITY,
  /**
   * His sheet, and the roles that sample it: the print ground (body and
   * limbs are one material) and the hat. The skin and the gear carry no map.
   */
  atlas: Object.freeze({
    build: () => createDrunkardAtlas(DRUNKARD_SHEET_LAYOUT),
    roles: Object.freeze(['body', 'head'] as RiderMaterialRole[]),
    region: (art: string | undefined): UvRect => (
      art !== undefined && art in DRUNKARD_REGIONS ? DRUNKARD_REGIONS[art as DrunkardRegionName] : DRUNKARD_REGIONS.blank
    ),
    // The garment and the hat are printed on the lofts; the seat, the legs
    // and the hands are paint and land on blank.
    lofts: Object.freeze({ torso: 'jersey', upperArm: 'sleeve', forearm: 'forearm', head: 'hat' }),
  }),
  materials: Object.freeze({
    body: DRUNKARD_PRINT,
    limbs: DRUNKARD_PRINT,
    accent: DRUNKARD_SKIN,
    head: DRUNKARD_LID,
    // The same spec as the skin, deliberately: the shades are lofts in the
    // face extra, so the aperture role has nothing of its own to draw and
    // a second material would be a second material for nothing.
    face: DRUNKARD_SKIN,
    gear: DRUNKARD_GEAR,
  }),
  profiles: Object.freeze({
    torso: DRUNKARD_JERSEY,
    seat: DRUNKARD_SEAT,
    thigh: DRUNKARD_THIGH,
    shin: DRUNKARD_SHIN,
    upperArm: DRUNKARD_UPPER_ARM,
    forearm: DRUNKARD_FOREARM,
    neck: NECK,
    head: DRUNKARD_HAT,
    boot: BOOT,
    bootSole: BOOT_SOLE,
    hand: WIM_GLOVE,
  }),
  // `seat` is an address, repainted to the trouser amber; `legs` at 1 because
  // every colour on them is paint; the sole a step under the gear boot.
  shades: Object.freeze({ seat: DRUNKARD_SEAT_SHADE, legs: 1.0, collar: 1.0, sole: 0.78, neck: 1.0 }),
  parts: Object.freeze({
    // The hands ride the print material so the glove can be painted brown
    // and the can in the left fist amber and cream by the same painter — a
    // can merged into a dark gear glove could never be amber.
    hands: 'body' as RiderMaterialRole,
    neck: 'accent' as RiderMaterialRole,
    kneePad: 'body' as RiderMaterialRole,
    legs: 'limbs' as RiderMaterialRole,
    seat: 'body' as RiderMaterialRole,
  }),
  panels: Object.freeze({
    // No collar: a crew-neck jersey, the loft's own cap closes the neck.
    //
    // **The two pack straps, and nothing else on the chest** — Wheel in
    // Motion's four-patch anatomy and all three of the owner's M28 rulings,
    // inherited as pins: the chest run outboard of the centre panel, the
    // crossing on the trapezius slope and never on the neck ring, the rear
    // run down into the pack's top, and the lower wrap round the flank at
    // rib height into the pack's side. One non-casting group in gear: a
    // strap carries no outline, and the pack extra carries the silhouette.
    torso: Object.freeze({
      role: 'gear' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([
        Object.freeze({
          anchor: 'front' as PatchAnchor,
          u0: DRUNKARD_STRAP.chestOuter,
          u1: DRUNKARD_STRAP.chestInner,
          mirrored: true,
          from: DRUNKARD_STRAP.wrapFrom,
          to: DRUNKARD_STRAP.crossingTo,
          uSegments: 3,
          vSegments: 7,
          lift: 0.010,
          shade: DRUNKARD_STRAP_SHADE,
        }),
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -Math.PI / 2 + DRUNKARD_STRAP.packHalfAngle,
          u1: Math.PI / 2 + DRUNKARD_STRAP.chestOuter,
          mirrored: true,
          from: DRUNKARD_STRAP.wrapFrom,
          to: DRUNKARD_STRAP.wrapTo,
          uSegments: 8,
          vSegments: 1,
          lift: 0.010,
          shade: DRUNKARD_STRAP_SHADE,
        }),
        Object.freeze({
          anchor: 'back' as PatchAnchor,
          u0: 0.30,
          u1: 0.54,
          mirrored: true,
          from: 0.400,
          to: DRUNKARD_STRAP.crossingTo,
          uSegments: 3,
          vSegments: 4,
          lift: 0.010,
          shade: DRUNKARD_STRAP_SHADE,
        }),
        Object.freeze({
          anchor: 'outboard' as PatchAnchor,
          u0: -Math.PI / 2 + 0.54,
          u1: Math.PI / 2 + DRUNKARD_STRAP.chestOuter,
          mirrored: true,
          from: DRUNKARD_STRAP.crossingFrom,
          to: DRUNKARD_STRAP.crossingTo,
          uSegments: 8,
          vSegments: 1,
          lift: 0.010,
          shade: DRUNKARD_STRAP_SHADE,
        }),
      ]),
    }),
    // Round brown knee pads carrying the hop cone — knee pads only, no shin
    // plate, no thigh pad; the render has none. The cup's brown is painted
    // onto both bones under it (the hinge rule).
    kneePad: Object.freeze({
      role: 'body' as RiderMaterialRole,
      casts: false,
      patches: Object.freeze([Object.freeze({
        anchor: 'front' as PatchAnchor,
        u0: DRUNKARD_KNEE_PAD.u0,
        u1: DRUNKARD_KNEE_PAD.u1,
        from: DRUNKARD_KNEE_PAD.from,
        to: DRUNKARD_KNEE_PAD.to,
        // Ten columns and five rows on a pad half as wide (round 2): the
        // bottom edge in ten columns instead of eight, the cone's rows on
        // enough rows to bend with the shin. A patch is a constant-thickness
        // shell of the body it lies on — `PatchOptions` has no crown axis —
        // so the target's dome is not available here; the aspect is.
        uSegments: 10,
        vSegments: 5,
        lift: DRUNKARD_KNEE_PAD.lift,
        // A taper and a swell together are a rounded pad rather than a band.
        taper: 0.36,
        bulge: 0.20,
        shade: 1,
        art: 'knee',
      })]),
    }),
    // Nothing on the shell: the foam, the brim band and the amber are print,
    // and the peak lives in the kit.
    head: Object.freeze([]),
  }),
  extras: Object.freeze([
    Object.freeze({
      name: 'rider-drunkard-hat-kit',
      joint: 'neck' as const,
      role: 'body' as RiderMaterialRole,
      casts: true,
      art: 'kit',
      build: drunkardHatKit,
    }),
    // Casting, because the skull is in this mesh (Codex QA after Phase 2):
    // `castShadow` is what the ghost draws, and a non-casting face left the
    // ghost with a hat floating 110 mm over a neck — and his shadow with the
    // same hole. One more shadow-pass call, still under Cool Rider's 40.
    Object.freeze({
      name: 'rider-drunkard-face',
      joint: 'neck' as const,
      role: 'accent' as RiderMaterialRole,
      casts: true,
      build: drunkardFaceParts,
    }),
    Object.freeze({
      name: 'rider-drunkard-pack',
      joint: 'pelvis' as const,
      role: 'body' as RiderMaterialRole,
      casts: true,
      art: 'pack',
      build: drunkardPack,
    }),
  ]),
  build: Object.freeze({
    hand: Object.freeze([drunkardHandCan, drunkardHandGrip]),
  }),
  paint: Object.freeze({
    torso: paintDrunkardTorso,
    thigh: paintDrunkardThigh,
    shin: paintDrunkardShin,
    boot: paintDrunkardBoot,
    hand: paintDrunkardHand,
  }),
  // Loose and wide, on Trollina's side of the table: the brief's relaxed
  // shoulders, and the splay is also what keeps the can in his fist clear of
  // his own thigh through the held envelope (`riderClearance.test.ts`).
  armCarriage: Object.freeze({ splay: 0.050, rise: 0.015 }),
  motion: Object.freeze({
    // Raised from 0.09 / 0.14 / 0.05 after the first in-app look: at chase
    // distance the sway was there in the numbers and hard to read on the
    // body. The stumble read at once. His ride is the gate on all nine.
    swayPelvisRoll: 0.12,
    swayHeadTilt: 0.20,
    swayArmSplay: 0.07,
    swayArmSwing: 0.04,
    staggerArms: 0.8,
    staggerHips: 0.6,
    staggerHeadLoll: 0.20,
    sipNeckPitch: 0.35,
    overLean: 0.25,
  }),
});

/** The pieces the tests measure against: the profiles the built rig is derived from. */
export {
  DRUNKARD_HAT,
  DRUNKARD_HEAD,
  DRUNKARD_PACK,
  DRUNKARD_BOX_TOP,
  DRUNKARD_HIP_DOME_APEX,
  WIM_HIP_DOME_APEX,
  DRUNKARD_JERSEY,
  DRUNKARD_STRAP,
  DRUNKARD_GLOVE_VERTICES,
  DRUNKARD_CAN_VERTICES,
};

export const RIDER_LOOKS: readonly RiderLook[] = Object.freeze([
  COOL_RIDER_LOOK,
  TROLLINA_LOOK,
  RED_RIDER_LOOK,
  ADONISB2_LOOK,
  MARIBEL_LOOK,
  WHEEL_IN_MOTION_LOOK,
  DRUNKARD_LOOK,
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
  MARIBEL_LOOK,
  WHEEL_IN_MOTION_LOOK,
  DRUNKARD_LOOK,
]);

/** Resolve a look, falling back to Cool Rider the way `characterSpec` does. */
export function riderLook(id: CharacterId): RiderLook {
  return RIDER_LOOKS.find((look) => look.id === id) ?? COOL_RIDER_LOOK;
}
