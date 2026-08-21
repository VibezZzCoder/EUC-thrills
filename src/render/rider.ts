/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { EUC, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { clamp, clamp01, lerp } from '../shared/maths.ts';
import {
  loftGeometry,
  mapUvInto,
  mergeGeometries,
  patchGeometry,
  vAtHeight,
  type LoftProfile,
} from './blockoutKit.ts';
import {
  COOL_RIDER_LOOK,
  type RiderLook,
  type RiderMaterialRole,
  type RiderMaterialSpec,
  type RiderPanelGroup,
  type RiderPatch,
} from './riderLook.ts';

/**
 * A rider, blocked out — Cool Rider by default, and from M14.5 whichever
 * character the player chose.
 *
 * Deliberately and visibly temporary geometry — but with **the real joint
 * hierarchy already in place** (docs/PLANS.md 7.2). Hips, knees, ankles,
 * shoulders, elbows, and neck are all `Group`s that a later animation layer
 * rotates; the primitives merely hang off them. That is what makes replacing
 * this with a sculpted, rigged Cool Rider a mesh swap rather than a rewrite,
 * and it is why the silhouette being judged at M2 and M3 is the silhouette
 * that ships.
 *
 * Two details are load-bearing rather than cosmetic:
 *
 *   - **The legs are children of the root, and the torso hangs off the
 *     pelvis.** The root rides with the wheel, so the boots stay planted on
 *     the pedals through any amount of lean. In a hard carve the hips lower,
 *     the inside knee bends farther, and the pelvis counter-rotates so the
 *     shoulders stay near level. Rotating the whole figure as one rigid plank
 *     is both visually exaggerated and unlike the owner's real riding form.
 *   - **The blue is reflective, not merely blue.** It is the character's
 *     single strongest identity cue in five years of reference photographs,
 *     and it is what keeps the rider readable against dark asphalt and in
 *     shadow. There is no environment map yet, so the blockout approximates
 *     retroreflection with low roughness and a small emissive term.
 *
 * The suit is authored far lighter than real black moto gear, for the reason
 * recorded in `data/tuning.ts`: a true near-black crushes under ACES into a
 * silhouette with no form, and form is the entire point of a blockout.
 *
 * **What this file stopped owning at M14.5.** Every cross-section, shade,
 * material and panel moved to `render/riderLook.ts`, one entry per character,
 * and `createPlaceholderRider(look)` builds whichever it is handed. Nothing
 * about the rig moved and nothing about the stance solve changed — that is the
 * point of the split, and it is what made a second character a look rather than
 * a rewrite. `applyStanceReaction` below touches joints only: it never names a
 * mesh, a material, or a profile, so it cannot know which rider it is posing.
 */

/**
 * Everything the stance solve reads, in one caller-owned object.
 *
 * A parameter list rather than the pose itself, so `render/rider.ts` stays
 * ignorant of `EucPose` and can be handed a stance by anything — and an
 * object rather than eight positional arguments, because M5 took it past the
 * point where a reader could tell which `number` was which. `ridingRig.ts`
 * keeps one of these and fills it in place; nothing here allocates.
 */
export interface StanceInput {
  /** Wheel and lower-body lean. Signed toward +X, the rider's LEFT. */
  rollAngle: number;
  /** Rendered fore-aft action pitch, radians. Positive leans forward. */
  riderPitch: number;
  /**
   * The torso's whole fore-aft hinge before the tuck, radians (M8.6).
   *
   * The rider's own pitch, less the share the machine already took, plus the
   * constant resting tilt — the value the rig used to write straight onto the
   * pelvis. It arrives on the stance instead so that **one file owns
   * `pelvis.rotation.x`**: the tuck hinges the torso and the neck has to give
   * that hinge back, and splitting those two across two modules is how a
   * tucked rider ends up staring at the tyre.
   */
  torsoPitch: number;
  /** Head yaw toward the corner, radians. */
  lookYaw: number;
  /** Gentle-turn torso twist toward the corner, radians. */
  turnTwist: number;
  /** Signed hard low-speed differential-leg technique blend, -1..1. */
  technicalTurn: number;
  /** Stopped rest-stance blend, 0..1. */
  restFactor: number;
  /**
   * Where the ground plane sits in the rider root's own frame. The root rides
   * the suspension and the ground does not, so this is minus the suspension's
   * current offset.
   */
  groundY: number;
  /** Compression, 0..1: hop preload, air tuck, and landing absorb (M5). */
  crouch: number;
  /**
   * The deliberate held crouch, 0..1 (M8.6).
   *
   * Separate from `crouch` because it is a different pose and not a deeper
   * one: the hips go down *and* the torso hinges forward over the wheel *and*
   * the arms draw back *and* the head cranes up to hold the route. A landing
   * absorb does none of the last three.
   */
  tuck: number;
  /**
   * The attack stance, 0..1 — sustained throttle at speed (M23).
   *
   * Separate from `tuck` for the reason `EucPose.attack` gives: they are two
   * poses that share a hinge, and a rider who crouches inside a long pull is
   * doing both. The joints below add them.
   */
  attack: number;
  /** The hard-carve stance, 0..1 — real roll at real speed (M23). */
  carveStance: number;
  /** Airborne blend, 0..1 (M5). */
  airBlend: number;
  /** True while falling, so the head can look at the landing (M5). */
  falling: boolean;
  /** Pedal-strike overlap, radians, signed by the scraping side (M5). */
  pedalStrike: number;
  /** Experienced-rider foot adjustment currently arresting the wobble, 0..1. */
  wobbleFootCorrection: number;
  /** The machine's current yaw oscillation, radians. Pedal targets follow it. */
  wobbleYaw: number;
  /**
   * The machine's complete local roll, radians. Pedal targets follow it.
   *
   * This is handed over after wobble, stopped-rest lean, and crash lean have
   * been composed on the EUC. Re-deriving only the wobble share here left the
   * stopped pedal-side boot aimed at the wheel's untilted position while the
   * actual pedal moved beneath it.
   */
  pedalRoll: number;
  /**
   * The same oscillation with its amplitude divided out, -1..1 (M13).
   *
   * The boots are phased against the wheel's swing, and *phase* is what that
   * needs rather than the deviation. Carried on the stance rather than
   * recovered by dividing `wobbleYaw` by an amplitude, because that division
   * only has a right answer with the tuning the controller actually ran with,
   * which this module does not have.
   */
  wobbleSway: number;
  /**
   * How hard the rider is fighting the wheel, 0..1 (M13).
   *
   * `wobble` says how far the oscillator has run; this says whether it has run
   * far enough to be an *event*, off the same threshold that names the
   * `wobbling` state. Zero through the small end of a wobble the wheel shows
   * and the rider rides out.
   */
  wobbleFight: number;
  /** How far into a crash the rider is, 0..1 (M6). */
  crash: number;
  /**
   * How far the particle ragdoll owns the body, 0..1 (M15).
   *
   * At zero the five vectors below are never read and every joint solves
   * exactly as it did before the ragdoll existed. Above zero the rig has
   * already placed `rider.root` on the particle frame; what this module adds
   * is the limbs — the ragdoll's hand and foot particles arrive as IK
   * targets for the same two-bone solvers every riding stance uses, so an
   * elbow or a knee can *never* bend backwards no matter what the particles
   * do. The targets are in the rider root's own frame, converted by the rig
   * from the pose's world-space particle block.
   */
  ragdollBlend: number;
  readonly ragdollHead: THREE.Vector3;
  readonly ragdollHandL: THREE.Vector3;
  readonly ragdollHandR: THREE.Vector3;
  readonly ragdollFootL: THREE.Vector3;
  readonly ragdollFootR: THREE.Vector3;
  /**
   * World up, in the rider root's own frame (M15). The knees bend toward
   * this-plus-forward while the particles own the body, so a rider lying
   * flat folds their knees toward the sky instead of the solver bulging
   * them through the pavement — which is what "bend forward in the root's
   * frame" turns into once the root itself is horizontal.
   */
  readonly ragdollUp: THREE.Vector3;
  /**
   * How far into the backwards-riding stance the rider is, 0..1.
   *
   * Chest opens toward the left shoulder, the head turns to look back over
   * it, the arms come a little wider, and the knees flex deeper. Handed over
   * as the controller's smoothed blend rather than derived from the signed
   * speed, because the *glance during the reverse-confirmation dwell* happens
   * while the wheel is still stationary — a speed-derived stance would skip
   * the check and snap.
   */
  reverse: number;
  /**
   * Where the paddle is pointing, as a yaw offset from the clean heading — M14.
   *
   * Radians, negative toward the rider's right, and it is the simulation's own
   * swing angle rather than a second pose curve that resembles it. The right
   * arm is solved toward this direction so the hand ends up where the paddle
   * already is: `render/paddle.ts` aims the shaft at the swept head position,
   * and this is what stops the arm being left behind by it.
   */
  swingAngle: number;
  /**
   * How committed the arm is to the swing, 0..1.
   *
   * Zero is the ordinary carriage every other term here shapes; one is the arm
   * fully out on the paddle. Blended rather than switched so the arm leaves and
   * rejoins the load-and-lean pose instead of snapping to it, and so a rider
   * carrying a paddle but not swinging looks like a rider carrying a paddle.
   */
  swingBlend: number;
}

export function createStanceInput(): StanceInput {
  return {
    rollAngle: 0,
    riderPitch: 0,
    torsoPitch: 0,
    lookYaw: 0,
    turnTwist: 0,
    technicalTurn: 0,
    restFactor: 0,
    groundY: 0,
    crouch: 0,
    tuck: 0,
    attack: 0,
    carveStance: 0,
    airBlend: 0,
    falling: false,
    pedalStrike: 0,
    wobbleFootCorrection: 0,
    wobbleYaw: 0,
    pedalRoll: 0,
    wobbleSway: 0,
    wobbleFight: 0,
    crash: 0,
    ragdollBlend: 0,
    ragdollHead: new THREE.Vector3(),
    ragdollHandL: new THREE.Vector3(),
    ragdollHandR: new THREE.Vector3(),
    ragdollFootL: new THREE.Vector3(),
    ragdollFootR: new THREE.Vector3(),
    ragdollUp: new THREE.Vector3(0, 1, 0),
    reverse: 0,
    swingAngle: 0,
    swingBlend: 0,
  };
}

export interface PlaceholderRider {
  readonly root: THREE.Group;
  /**
   * The hip joint. Everything above the waist hangs off it, so this is where
   * the rider's extra lean and fore-aft pitch are applied.
   */
  readonly pelvis: THREE.Group;
  /** Neck joint. Carries the pitch stabilisation and the look into the turn. */
  readonly neck: THREE.Group;
  /**
   * The right hand's attachment point — M14.
   *
   * A named `THREE.Group` on the right elbow rather than the hand *mesh*, so
   * something can be carried without being welded to the glove geometry. It is
   * exposed here rather than found with `root.getObjectByName`, which is a trap
   * this project has already paid for: `render/ghostRider.ts` prefixes every
   * ghost joint with `ghost-` precisely because duplicate names across two rigs
   * made that lookup return the wrong rig's joint and broke twenty-nine browser
   * scenarios.
   *
   * The rider's right is **-X**, so this is the `side < 0` arm.
   */
  readonly grip: THREE.Group;
  /**
   * Articulate the whole stance: hips shift and drop with braking,
   * acceleration, and compression, both legs re-solve to their planted pedals,
   * the inside knee opens through a carve, the striking-side boot is levered
   * up by a scraping pedal, the arms answer load, lean, and air
   * asymmetrically, and the neck keeps the head route-focused while turning it
   * through the turn and dropping it toward a landing.
   *
   * Everything is an offset solved back to the pedals, which is what keeps the
   * boots planted through a carve, a crouch, and a whole flight.
   */
  applyStanceReaction(stance: StanceInput): void;
  dispose(): void;
}

/** Where a limb chain starts, bends, and ends, in the parent's space. */
interface Chain {
  readonly origin: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly upperLength: number;
  readonly lowerLength: number;
  /** Which way the joint bulges: forward for knees, backward for elbows. */
  readonly bendToward: THREE.Vector3;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

interface ArticulatedLeg {
  /** +X is rider-left; -X is rider-right. */
  readonly side: number;
  readonly hip: THREE.Group;
  readonly knee: THREE.Group;
  readonly ankle: THREE.Group;
  readonly target: THREE.Vector3;
  lastDrop: number;
  lastShift: number;
  lastOpen: number;
  /** How far a scraping pedal has levered this boot up, metres (M5). */
  lastLift: number;
  /** Fore-aft foot repositioning used to arrest a wobble, metres (M6). */
  lastFootAdjust: number;
  /** Last machine yaw/roll used to place this pedal target. */
  lastPedalYaw: number;
  lastPedalRoll: number;
}

interface ArticulatedArm {
  /** +X is rider-left; -X is rider-right. */
  readonly side: number;
  readonly shoulder: THREE.Group;
  readonly elbow: THREE.Group;
  /**
   * The relaxed hand target, in the pelvis's frame, with the static right-arm
   * asymmetry already baked in. Every reaction below is an offset from this,
   * so no reaction can flatten the arms into a mirrored pair.
   */
  readonly baseTarget: THREE.Vector3;
  /** Scratch target the reaction writes each frame. */
  readonly target: THREE.Vector3;
  /** How far outboard the relaxed hand sits from the centreline, metres. */
  readonly baseSplay: number;
  readonly bendToward: THREE.Vector3;
  lastSplay: number;
  lastForward: number;
  lastRise: number;
  /** How committed this arm was to a swing last frame (M14). Right arm only. */
  lastSwing: number;
}

/**
 * Two-link inverse kinematics.
 *
 * Placing joints by hand-tuned Euler angles produces a limb that *nearly*
 * reaches its target, and the gap between the boot and the pedal is then
 * closed by fudging a length until it looks right — which silently encodes the
 * error into the proportions the final model will be built against. Solving
 * for the bend instead means the boot is on the pedal exactly, and every
 * length in `RIDER_BLOCKOUT` still means what it says.
 *
 * **Allocation-free**, because M3 doubled how often it runs: the two legs
 * re-solve whenever the stance moves and the two arms now do the same, which
 * at 60 Hz is four solves a frame. Fresh vectors and quaternions inside would
 * be a couple of thousand short-lived objects a second — precisely the shape
 * of garbage this file's pose interpolation is preallocated to avoid. The
 * scratch values below are module-level and consumed before the function
 * returns; the results are written into caller-owned quaternions.
 */
const SOLVE_TO_TARGET = new THREE.Vector3();
const SOLVE_DIRECTION = new THREE.Vector3();
const SOLVE_PERPENDICULAR = new THREE.Vector3();
const SOLVE_MIDDLE = new THREE.Vector3();
const SOLVE_AIM = new THREE.Vector3();
const SOLVE_INVERSE = new THREE.Quaternion();
// Ragdoll scratch (M15): root-local targets re-expressed per joint frame.
const RAG_TARGET = new THREE.Vector3();
const SWING_TARGET = new THREE.Vector3();
const RAG_INVERSE = new THREE.Quaternion();

function solveChain(
  chain: Chain,
  upperOut: THREE.Quaternion,
  lowerOut: THREE.Quaternion,
): void {
  SOLVE_TO_TARGET.copy(chain.target).sub(chain.origin);
  const reach = SOLVE_TO_TARGET.length();
  if (reach < 1e-9) {
    upperOut.identity();
    lowerOut.identity();
    return;
  }
  SOLVE_DIRECTION.copy(SOLVE_TO_TARGET).multiplyScalar(1 / reach);

  // Distance from the origin to the foot of the perpendicular through the
  // middle joint, along the origin-to-target line.
  const along = Math.min(
    Math.max(
      (chain.upperLength ** 2 - chain.lowerLength ** 2 + reach ** 2) / (2 * reach),
      -chain.upperLength,
    ),
    chain.upperLength,
  );
  const offset = Math.sqrt(Math.max(0, chain.upperLength ** 2 - along ** 2));

  // The bend direction, with any component along the limb removed, so the
  // middle joint sits exactly `offset` away from the line.
  SOLVE_PERPENDICULAR.copy(chain.bendToward)
    .addScaledVector(SOLVE_DIRECTION, -chain.bendToward.dot(SOLVE_DIRECTION));
  if (SOLVE_PERPENDICULAR.lengthSq() < 1e-12) SOLVE_PERPENDICULAR.set(0, 0, 1);
  SOLVE_PERPENDICULAR.normalize();

  SOLVE_MIDDLE.copy(chain.origin)
    .addScaledVector(SOLVE_DIRECTION, along)
    .addScaledVector(SOLVE_PERPENDICULAR, offset);

  upperOut.setFromUnitVectors(
    DOWN,
    SOLVE_AIM.copy(SOLVE_MIDDLE).sub(chain.origin).normalize(),
  );
  // The lower joint is a child of the upper one, so its aim is expressed in
  // the upper joint's frame.
  SOLVE_INVERSE.copy(upperOut).invert();
  lowerOut.setFromUnitVectors(
    DOWN,
    SOLVE_AIM.copy(chain.target).sub(SOLVE_MIDDLE).normalize().applyQuaternion(SOLVE_INVERSE),
  );
}


/** Rider-left is +X, so the outboard side of a limb is +X for the left side. */
function outboardAngle(side: number): number {
  return side > 0 ? 0 : Math.PI;
}
/**
 * Build a rider.
 *
 * The default is Cool Rider, and that default is load-bearing rather than
 * convenience: `render/renderCost.ts`, `render/riderEuc.test.ts`,
 * `render/ghostRider.test.ts` and `tools/rider-views.mjs` all construct a rig
 * with no argument and expect the character every existing baseline was taken
 * against.
 */
export function createPlaceholderRider(look: RiderLook = COOL_RIDER_LOOK): PlaceholderRider {
  const root = new THREE.Group();
  root.name = 'rider-blockout';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const track = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };
  const trackMaterial = <T extends THREE.Material>(material: T): T => {
    materials.push(material);
    return material;
  };

  // **Every material here sets `vertexColors`, and every geometry therefore
  // needs a `color` attribute** — the kit writes one on everything it makes and
  // `shaded()` adds one to a stock three geometry. A geometry without it
  // renders pure black under one of these, which is the trap `DESIGN.md` §7c
  // records from the instanced props and the fifth time this project has
  // nearly shipped something too dark. The attribute is a *multiplier*, so 1
  // is exactly the colour authored in `data/tuning.ts` and nothing below
  // changes what those values mean.
  //
  // **One material per distinct spec, keyed by object identity.** A look names
  // six roles, but Cool Rider's jacket and his sleeves are the same garment and
  // point at the same frozen spec — so he still ends up with exactly the five
  // materials he had before looks existed, and the count in `Game.resources()`
  // does not move for a character who did not change.
  //
  // **The look's printed sheet, if it has one** — M23 Phase A1b. One texture
  // per rig over pixels the atlas module memoises, tracked here so it is freed
  // with everything else the rig owns: a shared texture would be disposed out
  // from under the ghost the first time the player changed character.
  const atlas = look.atlas;
  const sheet = atlas === undefined ? null : atlas.build();
  if (sheet !== null) textures.push(sheet);
  // **Asked of the spec, not of the role**, because `materialFor` deduplicates
  // by spec identity: two roles pointing at one frozen spec are one material,
  // and whether it samples the sheet cannot depend on which of them happened
  // to be built first.
  const mapsRole = (role: RiderMaterialRole): boolean => (
    atlas !== undefined
    && atlas.roles.some((mapped) => look.materials[mapped] === look.materials[role])
  );
  /**
   * Fold a part's own texture square onto its page of that sheet.
   *
   * A no-op for a look with no atlas, and for a material that does not sample
   * one — which is every look but Maribel's and most of hers. Where it is not
   * a no-op it is mandatory: geometry keeping the unit square the kit gave it
   * would sample the whole sheet at once. `maribel.test.ts` walks a built rig
   * and asserts that every mesh drawn in a mapped material landed on a page,
   * which is what makes it safe that only patches and extras are paged here —
   * a look that mapped a role a *loft* is drawn in would fail that test rather
   * than ship a rider wearing her own chest print across both legs.
   */
  const paged = (
    geometry: THREE.BufferGeometry,
    role: RiderMaterialRole,
    art?: string,
  ): THREE.BufferGeometry => (
    atlas !== undefined && mapsRole(role) ? mapUvInto(geometry, atlas.region(art)) : geometry
  );

  const built = new Map<RiderMaterialSpec, THREE.MeshStandardMaterial>();
  const materialFor = (role: RiderMaterialRole): THREE.MeshStandardMaterial => {
    const spec = look.materials[role];
    const existing = built.get(spec);
    if (existing !== undefined) return existing;
    const material = trackMaterial(new THREE.MeshStandardMaterial({
      color: spec.colour,
      roughness: spec.roughness,
      metalness: spec.metalness,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 1,
      vertexColors: true,
      map: sheet !== null && mapsRole(role) ? sheet : null,
    }));
    built.set(spec, material);
    return material;
  };

  const bodyMaterial = materialFor('body');
  const limbMaterial = materialFor('limbs');
  const headMaterial = materialFor('head');
  const gearMaterial = materialFor('gear');
  const handMaterial = materialFor(look.parts.hands);
  // Arms and legs stopped being one garment when Trollina put on tights
  // (M14.5 second pass): the legs take their own role while the neck and arms
  // stay on `limbs`. Cool Rider names `limbs` for both and builds identically.
  const legMaterial = materialFor(look.parts.legs);
  const { profiles, shades, panels } = look;

  /**
   * How many sections a lofted part is built from — M23 Phase A1b.
   *
   * The defaults are the numbers this rig has used since M7, so every look
   * that does not ask builds byte-identically. `RiderLook.density` is the
   * owner's waiver made spendable, and it is spent here rather than in the
   * look because the *rig* is what decides how many parts there are.
   */
  const density = {
    limb: look.density?.limb ?? 14,
    torso: look.density?.torso ?? 24,
    head: look.density?.head ?? 20,
    boot: look.density?.boot ?? 12,
    hand: look.density?.hand ?? 10,
    neck: look.density?.neck ?? 12,
  };

  /**
   * Casting a shadow is also what the ghost reads to decide what to draw
   * (`render/ghostRider.ts`): a part too flat to cast is a part that, in one
   * flat colour, is invisible. So `shadowed` means "this carries silhouette",
   * and the identity panels below deliberately do not call it.
   */
  const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.castShadow = true;
    return mesh;
  };

  /**
   * A limb segment hanging from its joint, already in the joint's own frame.
   *
   * `paintwork` is the look's optional vertex repaint (`RiderLook.paint`) —
   * run here, once, on the built geometry, because a limb is the one place
   * decoration cannot be a panel without costing a mesh.
   *
   * **`side` is handed to the painter, and M19 is why.** Each limb gets a fresh
   * geometry per side, so a painter that does not know which leg it is on can
   * only band by height or by `|x|` — and a mark that should sit on the
   * *outside* of both legs then lands outboard on one and inboard on the other.
   * Red Rider's thigh graphic is exactly that mark. Passing the side costs
   * nothing and every existing painter ignores it.
   */
  const limb = (
    profile: LoftProfile,
    material: THREE.Material,
    shade: number,
    paintwork?: (geometry: THREE.BufferGeometry, side: number) => void,
    side = 1,
  ): THREE.Mesh => {
    const geometry = track(loftGeometry(profile, { radialSegments: density.limb, shade }));
    paintwork?.(geometry, side);
    const mesh = new THREE.Mesh(geometry, material);
    return shadowed(mesh);
  };

  /**
   * A panel lying on a body, spanning two *heights* rather than two ring
   * indices — so "the back panel runs from the waist to the shoulders" is what
   * the call says, and inserting a ring into a profile cannot silently move it.
   */
  const patchBetween = (
    profile: LoftProfile,
    options: Omit<Parameters<typeof patchGeometry>[1], 'v0' | 'v1'> & { from: number; to: number },
  ): THREE.BufferGeometry => {
    const { from, to, ...rest } = options;
    return patchGeometry(profile, {
      ...rest,
      v0: vAtHeight(profile, from),
      v1: vAtHeight(profile, to),
    });
  };

  /**
   * Turn one authored patch into geometry on a profile.
   *
   * The angular span is resolved against its landmark here rather than in the
   * look, so a look states "±0.72 either side of outboard" and never has to
   * know which side it is being built for or that outboard is π on the right.
   */
  const anchorAngle = (patch: RiderPatch, side: number): number => {
    if (patch.anchor === 'outboard') return outboardAngle(side);
    return patch.anchor === 'front' ? Math.PI / 2 : -Math.PI / 2;
  };
  const patchOn = (
    profile: LoftProfile,
    patch: RiderPatch,
    side: number,
  ): THREE.BufferGeometry => {
    const centre = anchorAngle(patch, side);
    const sign = patch.mirrored === true ? side : 1;
    return patchBetween(profile, {
      u0: centre + sign * patch.u0,
      u1: centre + sign * patch.u1,
      from: patch.from,
      to: patch.to,
      uSegments: patch.uSegments,
      vSegments: patch.vSegments,
      lift: patch.lift,
      sink: patch.sink,
      taper: patch.taper,
      bulge: patch.bulge,
      bow: patch.bow,
      // A shear authored as two heights, converted here so the look reads in
      // metres like every other measurement it carries.
      skew: patch.skewFrom !== undefined && patch.skewTo !== undefined
        ? vAtHeight(profile, patch.skewFrom) - vAtHeight(profile, patch.skewTo)
        : undefined,
      shade: patch.shade,
    });
  };

  /**
   * One mesh from however many panels share a joint.
   *
   * Panels on the same bone and the same material are one draw call if they are
   * one buffer, and the §8 budget is the reason the look pass could add form at
   * all. Sibling panels are merged; only a different joint forces a second mesh.
   *
   * `side` is `null` for a group on the pelvis, where a patch that is either
   * `mirrored` or anchored `outboard` expands into a left/right pair inside the
   * same buffer — which is how the shoulder panels and the chest chevrons are
   * one mesh each rather than four.
   */
  const panelMesh = (
    name: string,
    group: RiderPanelGroup,
    profile: LoftProfile,
    side: number | null,
  ): THREE.Mesh => {
    const parts: THREE.BufferGeometry[] = [];
    // A patch's page of the look's atlas, and the one-sided marks: a script
    // that exists once on a person is authored once and blanked on the other
    // leg, rather than being two patches that must be kept in step.
    const pageFor = (patch: RiderPatch, patchSide: number): string | undefined => (
      patch.artOn !== undefined && Math.sign(patch.artOn) !== Math.sign(patchSide)
        ? patch.artElse
        : patch.art
    );
    const add = (patch: RiderPatch, patchSide: number): void => {
      parts.push(paged(patchOn(profile, patch, patchSide), group.role, pageFor(patch, patchSide)));
    };
    for (const patch of group.patches) {
      if (side !== null) {
        add(patch, side);
      } else if (patch.mirrored === true || patch.anchor === 'outboard') {
        for (const pairSide of [-1, 1]) add(patch, pairSide);
      } else {
        add(patch, 1);
      }
    }
    const mesh = new THREE.Mesh(track(mergeGeometries(parts)), materialFor(group.role));
    mesh.name = name;
    if (group.casts) shadowed(mesh);
    return mesh;
  };

  // -- Legs -----------------------------------------------------------------
  // The boots sit on the pedal tread, at the pedal centres, so the stance is
  // the wheel's stance rather than a number invented for the rider.
  const hipHalfWidth = RIDER_BLOCKOUT.torsoWidth * 0.26;
  const ankleY = WHEEL.pedalHeight + RIDER_BLOCKOUT.ankleAbovePedal;
  const legs: ArticulatedLeg[] = [];
  const arms: ArticulatedArm[] = [];

  // Two reusable results for `solveChain`, which writes rather than returns.
  const solvedUpper = new THREE.Quaternion();
  const solvedLower = new THREE.Quaternion();

  for (const side of [-1, 1]) {
    // World convention: +X is the rider's left, so the positive-side joints
    // carry the left names. These names were inverted before this M2 pose fix.
    const sideName = side > 0 ? 'left' : 'right';
    const hip = new THREE.Group();
    hip.name = `rider-hip-${sideName}`;
    hip.position.set(side * hipHalfWidth, RIDER.hipHeight, 0);

    const ankleTarget = new THREE.Vector3(side * RIDER_BLOCKOUT.stanceHalfWidth, ankleY, 0);

    solveChain({
      origin: hip.position,
      target: ankleTarget,
      upperLength: RIDER_BLOCKOUT.thighLength,
      lowerLength: RIDER_BLOCKOUT.shinLength,
      // Knees forward. A knee that bends the other way is the fastest way to
      // make a figure read as broken rather than as temporary.
      bendToward: FORWARD,
    }, solvedUpper, solvedLower);
    hip.quaternion.copy(solvedUpper);
    hip.add(limb(profiles.thigh, legMaterial, shades.legs, look.paint?.thigh, side));

    // The half of a knee guard that lives above the knee, on the bone it is
    // strapped to. See `RiderLook.panels.thighPad`: this is one joint further
    // up than the pad below, and that is the whole point of it.
    if (panels.thighPad) {
      hip.add(panelMesh(`rider-thigh-pad-${sideName}`, panels.thighPad, profiles.thigh, side));
    }

    const knee = new THREE.Group();
    knee.name = `rider-knee-${sideName}`;
    knee.position.y = -RIDER_BLOCKOUT.thighLength;
    knee.quaternion.copy(solvedLower);
    knee.add(limb(profiles.shin, legMaterial, shades.legs, look.paint?.shin, side));
    hip.add(knee);

    const ankle = new THREE.Group();
    ankle.name = `rider-ankle-${sideName}`;
    ankle.position.y = -RIDER_BLOCKOUT.shinLength;
    // The chain arrives at the ankle rotated; the boot is flat on the pedal,
    // so it cancels the accumulated rotation and stands the foot up level.
    ankle.quaternion.copy(solvedUpper).multiply(solvedLower).invert();
    knee.add(ankle);

    // The boot: a lofted upper stood up onto a flat sole, merged into one
    // mesh. The loft's own axis runs heel-to-toe, so it is rotated a quarter
    // turn and then dropped until the sole meets the pedal tread — the ankle
    // ends up over the heel, which is where the M2 box was placed by hand.
    const soleTop = -RIDER_BLOCKOUT.ankleAbovePedal + 0.018;
    const upper = loftGeometry(profiles.boot, { radialSegments: density.boot })
      .rotateX(Math.PI / 2)
      .translate(0, soleTop + 0.047, 0);
    const sole = loftGeometry(profiles.bootSole, { radialSegments: density.boot + 4, shade: shades.sole })
      .translate(0, soleTop, 0.018);
    const bootGeometry = track(mergeGeometries([upper, sole]));
    look.paint?.boot?.(bootGeometry, side);
    const boot = shadowed(new THREE.Mesh(bootGeometry, gearMaterial));
    boot.name = `rider-boot-${sideName}`;
    ankle.add(boot);

    // A knee-armour pad lying *on* the shin rather than as a box floating off
    // it. Kept small for the M2 reason, unchanged: the knee sits at almost
    // exactly the height of the wheel's shell, so a large bright pad there
    // reads as part of the wheel rather than the rider.
    if (panels.kneePad) {
      knee.add(panelMesh(`rider-knee-pad-${sideName}`, panels.kneePad, profiles.shin, side));
    }

    root.add(hip);
    legs.push({
      side, hip, knee, ankle, target: ankleTarget,
      lastDrop: 0, lastShift: 0, lastOpen: 0, lastLift: 0, lastFootAdjust: 0,
      lastPedalYaw: 0, lastPedalRoll: 0,
    });
  }

  // -- Pelvis, and everything above it --------------------------------------
  const pelvis = new THREE.Group();
  pelvis.name = 'rider-pelvis';
  pelvis.position.y = RIDER.hipHeight;
  root.add(pelvis);

  // The garment, whatever is under its hem, and the collar if there is one —
  // one mesh, one material, three shades. The M2 capsule this replaces had no
  // waist, no hem, and nothing between the torso and the legs; a figure whose
  // whole upper body is a single smooth solid reads as an appliance no matter
  // how it is lit.
  //
  // The collar is a patch rather than more rings because a jacket's loft has to
  // *cap* at the neck: an open collar is a hole into the inside of the jacket,
  // and at chase-camera height the player looks down into it. A dress with a
  // neckline tapers closed instead and carries no collar at all.
  const torsoParts = [loftGeometry(profiles.torso, { radialSegments: density.torso })];
  // The seat: merged into the garment when it *is* the garment (Cool Rider's
  // trousers), its own non-casting mesh when it is a different one (Trollina's
  // tights — the role split is the invisibility her carve-clip fix rests on;
  // see `RiderLook.parts.seat`). Non-casting because it lives under the hem:
  // the torso above it carries the silhouette, and the ghost has no use for a
  // second dark volume inside the first.
  if (look.parts.seat === 'body') {
    torsoParts.push(loftGeometry(profiles.seat, { radialSegments: density.torso, shade: shades.seat }));
  }
  if (panels.collar) torsoParts.push(patchOn(profiles.torso, panels.collar, 1));
  const torsoGeometry = track(mergeGeometries(torsoParts));
  // The body repaint — M23. Run after the merge rather than on the garment
  // loft alone, so a panel that runs from the chest to the hip is one field
  // and not one field with a seam where the seat begins. It takes no side:
  // this is a single mesh spanning both halves, so a painter reads the sign of
  // x off the vertex it is looking at (`RiderLook.paint.torso`).
  look.paint?.torso?.(torsoGeometry);
  const torso = shadowed(new THREE.Mesh(torsoGeometry, bodyMaterial));
  pelvis.add(torso);
  if (look.parts.seat !== 'body') {
    const seat = new THREE.Mesh(
      track(loftGeometry(profiles.seat, { radialSegments: density.torso, shade: shades.seat })),
      materialFor(look.parts.seat),
    );
    seat.name = 'rider-seat';
    pelvis.add(seat);
  }

  // The belt, if the look wears one: a full wrap on the torso profile, one
  // mesh, too flat to cast.
  if (panels.waist) {
    pelvis.add(panelMesh('rider-belt', panels.waist, profiles.torso, null));
  }

  const shoulderY = RIDER_BLOCKOUT.torsoLength;

  // Shoulder panels, one per side, lying on the garment's own shoulder.
  //
  // A pair rather than a bar across the top, because that is what the
  // photographs show — the blue runs over each shoulder and continues down the
  // outer sleeve — and because a single band all the way round reads as a sash.
  // **On Cool Rider these are the only blue that casts**: they sit on the widest
  // part of the silhouette, so they are the one piece the ghost's `castShadow`
  // rule should keep, and both are one mesh so keeping them costs it one draw
  // call rather than two. Trollina's straps are the same slot and deliberately
  // do not cast — a strap carries no outline, and that saved call is what pays
  // for her hair.
  if (panels.shoulders) {
    pelvis.add(panelMesh('rider-shoulder-panels', panels.shoulders, profiles.torso, null));
  }

  // The flat identity panels — chest chevrons and a back panel — in one buffer
  // because they share the pelvis and are both too flat to cast (which is what
  // hides them on the ghost — `render/ghostRider.ts`).
  //
  // The chevrons are sheared bands climbing toward the centreline, which is the
  // shape in the reference set. The M2 pair were boxes laid across a curve, so
  // they stood clear of the chest at their outer ends; these *are* the chest.
  // Each span runs centre-to-outboard, so one negative skew drops both outer
  // ends and the pair meets high at the sternum.
  //
  // The back panel is the largest single piece of accent on either character,
  // because the chase camera is behind the rider essentially all the time.
  if (panels.torso) {
    pelvis.add(panelMesh('rider-jacket-panels', panels.torso, profiles.torso, null));
  }

  // -- Arms -----------------------------------------------------------------
  // Filled by the right-hand pass below. M14 hangs the paddle here.
  let rightGrip: THREE.Group | null = null;
  for (const side of [-1, 1]) {
    const sideName = side > 0 ? 'left' : 'right';
    const shoulder = new THREE.Group();
    shoulder.name = `rider-shoulder-${sideName}`;
    shoulder.position.set(side * RIDER_BLOCKOUT.shoulderHalfWidth, shoulderY, 0);

    // Arms low and loose, hands around waist height and slightly forward:
    // the posture every riding photograph in the reference set agrees on.
    // Never a mirrored pair, also per those photographs: the right hand sits
    // a little wider and farther forward than the left. Mechanically
    // symmetrical arms are a named error in the motion reference (8, 29).
    //
    // A look may move the whole carriage — Trollina holds hers wide and high,
    // which is the pose the doodle she came from is drawn in. It is added to
    // the base target rather than replacing it, so the asymmetry survives and
    // every stance reaction still works as an offset from wherever the arms
    // rest.
    const rightArm = side < 0;
    const reach = RIDER_BLOCKOUT.upperArmLength + RIDER_BLOCKOUT.forearmLength;
    const baseSplay = RIDER_BLOCKOUT.shoulderHalfWidth + RIDER_BLOCKOUT.armSplay
      + (rightArm ? RIDER_BLOCKOUT.armAsymmetrySplay : 0)
      + look.armCarriage.splay;
    const baseTarget = new THREE.Vector3(
      side * baseSplay,
      shoulderY - reach * RIDER_BLOCKOUT.armHangFraction + look.armCarriage.rise,
      RIDER_BLOCKOUT.handForward + (rightArm ? RIDER_BLOCKOUT.armAsymmetryForward : 0),
    );
    // Elbows behind, so the arms read as hanging rather than as reaching.
    const bendToward = new THREE.Vector3(0, 0, -1);

    solveChain({
      origin: shoulder.position,
      target: baseTarget,
      upperLength: RIDER_BLOCKOUT.upperArmLength,
      lowerLength: RIDER_BLOCKOUT.forearmLength,
      bendToward,
    }, solvedUpper, solvedLower);
    shoulder.quaternion.copy(solvedUpper);
    // The bicep is painted per side — M23, and the only way an asymmetric
    // livery reaches the arms: a panel group here is built per side but names
    // one material for both, so it can hold one colour and Maribel wears two
    // (`RiderLook.paint.upperArm`).
    shoulder.add(limb(profiles.upperArm, limbMaterial, 1, look.paint?.upperArm, side));

    // The accent runs down the *outer* sleeve, not around the whole arm.
    //
    // The M2 arm was a solid blue upper and a black lower, which put a hard
    // colour break at the elbow and read as a machine joint rather than as a
    // sleeve. A panel on the outboard face is both what the photographs show
    // and what keeps the arm reading as one limb. A bare arm has none.
    if (panels.sleeve) {
      shoulder.add(panelMesh(`rider-sleeve-${sideName}`, panels.sleeve, profiles.upperArm, side));
    }
    // A whole garment sleeve, if the look wears one: a closed loft riding the
    // shoulder joint, in the body material (Trollina's puff cap sleeve — see
    // `RiderLook.profiles.sleeve`). Non-casting: it hugs the casting arm, so
    // the silhouette and the ghost already carry its shape.
    if (profiles.sleeve) {
      const sleeve = new THREE.Mesh(
        track(loftGeometry(profiles.sleeve, { radialSegments: density.limb })),
        bodyMaterial,
      );
      sleeve.name = `rider-cap-sleeve-${sideName}`;
      shoulder.add(sleeve);
    }

    const elbow = new THREE.Group();
    elbow.name = `rider-elbow-${sideName}`;
    elbow.position.y = -RIDER_BLOCKOUT.upperArmLength;
    elbow.quaternion.copy(solvedLower);
    elbow.add(limb(profiles.forearm, limbMaterial, 1, look.paint?.forearm, side));
    // Elbow armour, on the side the elbow actually points: the chains bend
    // backward, so this is the face a rider lands on.
    if (panels.elbowPad) {
      elbow.add(panelMesh(`rider-elbow-pad-${sideName}`, panels.elbowPad, profiles.forearm, side));
    }
    shoulder.add(elbow);

    // A hand may be several lofts — a palm, a thumb, finger lobes — merged
    // into one mesh so the extra volumes cost triangles and never a draw call.
    // Merged *before* the paint hook, so a look's repaint covers every part.
    const handParts = [loftGeometry(profiles.hand, { radialSegments: density.hand })];
    for (const build of look.build?.hand ?? []) handParts.push(build(side));
    const handGeometry = track(mergeGeometries(handParts));
    look.paint?.hand?.(handGeometry, side);
    const hand = shadowed(new THREE.Mesh(
      handGeometry,
      handMaterial,
    ));
    hand.name = `rider-hand-${sideName}`;
    // Set back into the sleeve's rounded end, so a cuff overlaps a wrist
    // instead of a box hanging off one.
    hand.position.y = -RIDER_BLOCKOUT.forearmLength + 0.012;
    elbow.add(hand);

    // The carry point — M14. A zero-cost empty group at the hand, on the elbow
    // rather than on the hand mesh so that carrying something never means
    // welding it to the glove. Both sides get one because the rig is
    // symmetrical and an asymmetry here would be a thing to remember; only the
    // right is used, and `PlaceholderRider.grip` is what says so.
    const grip = new THREE.Group();
    grip.name = `rider-grip-${sideName}`;
    grip.position.copy(hand.position);
    elbow.add(grip);
    if (side < 0) rightGrip = grip;

    pelvis.add(shoulder);
    arms.push({
      side,
      shoulder,
      elbow,
      baseTarget,
      target: baseTarget.clone(),
      baseSplay,
      bendToward,
      lastSplay: 0,
      lastForward: 0,
      lastRise: 0,
      lastSwing: 0,
    });
  }

  // -- Head -----------------------------------------------------------------
  const neck = new THREE.Group();
  neck.name = 'rider-neck';
  neck.position.y = shoulderY;
  pelvis.add(neck);

  // An actual neck. Without one the head floats a visible gap above the
  // shoulders, and a figure whose head is not attached to it reads as broken
  // rather than as temporary.
  const neckMesh = shadowed(new THREE.Mesh(
    track(loftGeometry(profiles.neck, { radialSegments: density.neck, shade: shades.neck })),
    // Its own mesh already, so the role costs nothing: Red Rider's gaiter is
    // the gear material where everyone before him wore `limbs` (see
    // `RiderLook.parts.neck` for why a shade could not say "black").
    materialFor(look.parts.neck ?? 'limbs'),
  ));
  neck.add(neckMesh);

  // A helmet, rather than a sphere with a bar across it — or a head, rather
  // than a helmet.
  //
  // Every feature is a patch on the shell, so the whole head is still one mesh
  // whichever character is wearing it. On Cool Rider that is a **chin bar** (a
  // full-face helmet's jaw leads its crown, and in profile that offset is most
  // of what separates a helmet from a ball), a **brow** over the aperture, a
  // **rim** at the base so the helmet ends somewhere instead of dissolving into
  // the collar, and a **rear spoiler** — which matters more than the other
  // three put together, because the back of the head is the part of the rider
  // the chase camera is looking at. On Trollina it is one patch: the hairline.
  const headParts = [loftGeometry(profiles.head, { radialSegments: density.head })];
  for (const patch of panels.head) headParts.push(patchOn(profiles.head, patch, 1));
  const head = shadowed(new THREE.Mesh(track(mergeGeometries(headParts)), headMaterial));
  neck.add(head);

  // What sits in the aperture. Cool Rider's visor is sunk below the shell and
  // lifted only a little, so it reads as glass in a recess rather than as a bar
  // stuck on; Trollina's eyes are the same slot doing the cartoon version of
  // the same job.
  if (panels.face) {
    neck.add(panelMesh('rider-face', panels.face, profiles.head, null));
  }

  // Anything the look adds that the rig has no slot for — hair, and Maribel's
  // moulded armour. Hair hangs off the neck because that is where the head is.
  //
  // **An extra that `sways` gets a pivot of its own** (M23). A mesh bolted to
  // the neck rotates rigidly with it, and the owner's ride found what that
  // costs on a long mass: folded forward over the wheel, her hair folded into
  // her own back; turned into a corner, it swept through the shoulder. The
  // pivot below is what `applyStanceReaction` gives the body's rotation back
  // to, so the hair keeps hanging where it hung. One node, shared by every
  // swaying extra a look has, because they should all hang together.
  let sway: THREE.Group | null = null;
  for (const extra of look.extras) {
    const mesh = new THREE.Mesh(
      track(paged(extra.build(), extra.role, extra.art)),
      materialFor(extra.role),
    );
    mesh.name = extra.name;
    if (extra.casts) shadowed(mesh);
    const joint = extra.joint === 'neck' ? neck : pelvis;
    if (extra.sways) {
      if (sway === null) {
        sway = new THREE.Group();
        sway.name = 'rider-hair-sway';
        joint.add(sway);
      }
      sway.add(mesh);
    } else {
      joint.add(mesh);
    }
  }
  const hairSway = sway;

  // A constant forward tilt. Nobody rides bolt upright, and a figure that does
  // reads as a mannequin balanced on a wheel rather than as someone riding one.
  pelvis.rotation.x = RIDER_BLOCKOUT.torsoRestPitch;

  /**
   * Where the head sits when nothing is happening — the neck's own resting
   * pitch, which is what `hairFollowPitch` measures its compensation from.
   * Stated as the same expression the stabiliser uses below rather than as a
   * constant, so the two cannot drift apart.
   */
  const HAIR_NECK_REST = -clamp(
    RIDER_BLOCKOUT.torsoRestPitch * RIDER_BLOCKOUT.headStabilizationFactor,
    -RIDER_BLOCKOUT.headStabilizationMax,
    RIDER_BLOCKOUT.headStabilizationMax,
  );

  /** Scratch for the hair's orientation solve. Nothing here allocates. */
  const HAIR_REST = new THREE.Quaternion();
  const HAIR_EULER = new THREE.Euler();
  const HAIR_TARGET = new THREE.Quaternion();
  const HAIR_INVERSE = new THREE.Quaternion();

  const bendScratch = new THREE.Vector3();
  // Reused per-frame results for the four chains the reaction re-solves.
  const reactionUpper = new THREE.Quaternion();
  const reactionLower = new THREE.Quaternion();
  const pedalReactionEuler = new THREE.Euler();
  const pedalReactionQuaternion = new THREE.Quaternion();
  const pedalReactionTarget = new THREE.Vector3();
  // The blended ankle target of the grounded rest foot, and the last rest
  // blend applied. While the blend is non-zero the legs re-solve every frame —
  // resting is a standstill, so those two solves replace the four a moving
  // stance performs, and the change-detection below stays honest.
  const restAnkleTarget = new THREE.Vector3();
  let lastRest = 0;

  if (rightGrip === null) throw new Error('the rider was built without a right grip');
  const grip = rightGrip;

  return {
    root,
    pelvis,
    neck,
    grip,
    applyStanceReaction(stance: StanceInput): void {
      const { rollAngle, riderPitch, lookYaw, groundY } = stance;
      const amount = Math.min(1, Math.abs(rollAngle) / RIDER_BLOCKOUT.carveReactionFullRoll);
      const insideSide = Math.sign(rollAngle);
      const rest = clamp(stance.restFactor, 0, 1);
      const settled = Math.max(rest, clamp(stance.crash, 0, 1));
      const restActive = settled > 1e-6 || Math.abs(settled - lastRest) > 1e-6;
      lastRest = settled;

      // -- Compression (M5) --------------------------------------------------
      // "Knees bend deeply, hips lower, torso compresses" (§12.1) on the
      // preload; "knees compress sharply, hips lower, torso absorbs force"
      // (§12.5) on the landing; a partial version of the same held in the air
      // (§12.3). One depth, three causes, and the controller decides which.
      // Faded out by the rest blend, because a rider standing with one foot
      // down is not preloading anything.
      const crouch = clamp(stance.crouch, 0, 1) * (1 - rest);
      const air = clamp(stance.airBlend, 0, 1) * (1 - rest);
      // -- The held tuck (M8.6) ---------------------------------------------
      // From the owner's ride — "crouching doesn't really crouch that much" —
      // against `108220507_...o.jpg`, which is the pose he means: hips well
      // down, torso folded forward over the wheel, arms drawn back and low
      // alongside the hips, head up and eyes still on the route. Four
      // articulations, and the old crouch had only a fraction of the first.
      //
      // It rides on top of the compression rather than replacing it, so a
      // player who tucks and then hops is one rider deepening one stance.
      // Suppressed by the rest blend for the same reason the crouch is: a
      // rider standing with a foot down is not tucked.
      const tuck = clamp(stance.tuck, 0, 1) * (1 - rest) * (1 - clamp(stance.crash, 0, 1));
      // The two reference stances (M23). Suppressed by rest and by a crash on
      // the same terms as the tuck — a stopped rider is not driving, and a
      // crashing one has stopped choosing anything.
      const attack = clamp(stance.attack, 0, 1) * (1 - rest) * (1 - clamp(stance.crash, 0, 1));
      const carving = clamp(stance.carveStance, 0, 1) * (1 - rest) * (1 - clamp(stance.crash, 0, 1));

      // -- Wobble and crash (M6) --------------------------------------------
      // Wobble is a *stance*, not a shake: "rider lowers centre of mass, knees
      // remain flexible, arms gradually return inward" (§13.3) is what recovery
      // looks like, so the same three offsets running backwards are what the
      // wobble itself looks like. A crash suppresses all of it — a rider on the
      // ground is not correcting anything.
      const crashing = clamp(stance.crash, 0, 1);
      // -- The ragdoll handover (M15) ---------------------------------------
      // Above zero the rig has already put `rider.root` on the particle
      // frame; this solve's job shrinks to limbs-and-head. Every use below is
      // a lerp toward the particle targets by this blend, so at zero the
      // whole feature contributes exactly nothing to any approved pose.
      const rag = clamp01(stance.ragdollBlend);
      const ragActive = rag > 1e-6;
      // **Both wobble remaps are the controller's now, and this file performs
      // neither** (M13). The bracing stance is still gated on the energy that
      // names the `wobbling` state — below it the ground is merely lively and a
      // relaxed rider is the pose M2 and M3 accepted; above it the rider is
      // fighting the wheel and §13 says exactly how that looks — but the remap
      // arrives as `wobbleFight` and the oscillator's phase as `wobbleSway`
      // instead of being re-derived here from the frozen `EUC` table.
      //
      // That re-derivation was wrong twice over. It read defaults, so the F4
      // panel moved the physics and the wheel's rock while leaving the rider
      // posed for tuning nobody was riding; and it divided the phase back out
      // of `wobbleYaw` using a threshold M13 then removed from the amplitude,
      // which collapses the divisor to 1e-6 and square-waves the boots at the
      // wobble frequency through every small wobble. One owner, so the pose
      // cannot disagree with the state and F4 reaches the rider.
      const fighting = clamp01(stance.wobbleFight);
      const wobble = fighting * (1 - rest) * (1 - crashing);
      // -- Backwards riding -------------------------------------------------
      // The look-behind stance: chest open, head over the left shoulder, arms
      // a little wider, knees flexed. Suppressed by rest and crash for the
      // same reason every other reaction is — a rider standing beside the
      // wheel is not checking behind a wheel they are not on. Every term it
      // feeds below is an offset on the existing solve, so at zero blend this
      // block contributes exactly nothing to any approved pose.
      const reverse = clamp01(stance.reverse) * (1 - rest) * (1 - crashing);
      const technical = clamp01(Math.abs(stance.technicalTurn))
        * (1 - rest)
        * (1 - crashing);
      // Experienced riders actively adjust their feet to arrest a wobble. The
      // controller owns when that correction is happening; the rig spends it
      // as a small opposing fore-aft shift on the pedals, in phase with the
      // wheel's yaw. This is deliberate repositioning, so it is the narrow
      // exception to the otherwise load-bearing planted-foot rule.
      const footCorrection = clamp(stance.wobbleFootCorrection, 0, 1)
        * (1 - rest) * (1 - crashing);
      // The phase, straight off the stance. How *far* the boots shift is
      // `footCorrection`, which the controller already gates on its own
      // correction threshold; this only says which way the wheel is currently
      // swinging, so the two boots move against a real oscillation rather than
      // against a divided-out one.
      const footPhase = clamp(stance.wobbleSway, -1, 1);
      // The EUC child yaws and rolls beneath the rider. Rotate the ankle's
      // pedal-centre target through the exact same local transform so the
      // boots follow the pedals through articulated knees instead of the
      // rider root inheriting the machine's oscillation.
      pedalReactionEuler.set(0, stance.wobbleYaw, stance.pedalRoll);
      pedalReactionQuaternion.setFromEuler(pedalReactionEuler);
      // The striking-side pedal is on the ground and the wheel is levered off
      // it, so that boot rises: "inside foot rises slightly with pedal impact"
      // (§14). +X is the rider's left, matching the sign the pose carries.
      const strikeSide = Math.sign(stance.pedalStrike);
      const strikeLift = Math.min(
        1,
        Math.abs(stance.pedalStrike) / EUC.pedalStrikeReferenceDepth,
      ) * RIDER_BLOCKOUT.pedalStrikeFootLift;

      // Fore-aft load: hips ahead of neutral under drive, well behind it under
      // braking, with the knees taking the depth in both cases. This is what
      // keeps braking from being only a backward torso tilt — the exact
      // shortcut the motion reference names as an error (29) — and what makes
      // a launch read as pushing rather than folding.
      const load = clamp(riderPitch / RIDER_BLOCKOUT.loadReactionFullPitch, -1, 1);
      const driving = Math.max(0, load);
      const bracing = Math.max(0, -load);
      const hipShift = driving * RIDER_BLOCKOUT.accelHipShiftMax
        - bracing * RIDER_BLOCKOUT.brakeHipShiftMax;
      // The compression adds to the same hip drop the carve and the load
      // stances already use, so a rider who preloads mid-carve is one rider in
      // one stance rather than two poses arguing.
      // Capped, and the cap is anatomy rather than taste: the hips sit 0.70 m
      // above the ankles with 0.78 m of leg, so past `squatMax` the IK is
      // solving a fold no knee makes and the blockout squats through its own
      // boots. Reachable only now that the tuck is deep enough to matter —
      // before M8.6 every cause at once still came in under it.
      const squat = Math.min(
        RIDER_BLOCKOUT.squatMax,
        RIDER_BLOCKOUT.carveSquatMax * amount * (1 - technical)
          + driving * RIDER_BLOCKOUT.accelSquatMax
          + bracing * RIDER_BLOCKOUT.brakeSquatMax
          + crouch * RIDER_BLOCKOUT.crouchHipDrop
          + tuck * RIDER_BLOCKOUT.tuckHipDrop
          // A third of a tuck's drop while running straight: the attack
          // stance keeps the legs long. A committed carve already owns the
          // same hip compression, so fade this one out with the ordinary
          // carve amount instead of stacking two presentation channels into
          // an unreachable knee fold (and through short garment hems).
          + attack * RIDER_BLOCKOUT.attackHipDrop * (1 - amount)
          // "Rider lowers centre of mass ... knees bend deeper" (§13.2, §13.3).
          + wobble * RIDER_BLOCKOUT.wobbleHipDrop
          // Backwards is less stable than forwards, and flexed knees are how
          // that reads (motion reference §9; the look-behind stance).
          + reverse * RIDER_BLOCKOUT.reverseSquat,
      );

      // The torso's fore-aft hinge, composed once and owned here. The tuck
      // folds the rider down over the wheel on top of whatever load pose is
      // already running, and the ceiling stops a launch out of a tuck from
      // putting the helmet on the tyre.
      const torsoPitch = Math.min(
        RIDER_BLOCKOUT.tuckTorsoPitchMax,
        stance.torsoPitch
          + tuck * RIDER_BLOCKOUT.tuckTorsoPitch
          // Attack and hard-carve are two readings of the same forward torso
          // hinge. Their arms and hips still compose, but adding both hinge
          // angles folded the shared rig twice whenever a charged pull became
          // a committed corner. Keep the stronger signal instead: a hard
          // carve can inherit attack's deeper fold without putting a second
          // copy of the fold through every rider's garment.
          + Math.max(
            attack * RIDER_BLOCKOUT.attackTorsoPitch,
            carving * RIDER_BLOCKOUT.carveStanceTorsoPitch,
          ),
      );
      pelvis.rotation.x = torsoPitch;

      // The torso descends with the shared squat and travels with the hips.
      // The inside leg receives an additional hip drop and its knee opens
      // toward the apex; both chains are solved back to their planted pedal
      // targets so neither boot skates or floats.
      //
      // The rest blend then takes the whole assembly toward the stopped
      // stance: hips sink to standing height (the riding hip height cannot
      // reach the ground — leg reach, see `RIDER_BLOCKOUT`) and shift over
      // the grounded left foot, while the fore-aft carve offsets fade with
      // the motion that caused them.
      pelvis.position.x = RIDER_BLOCKOUT.restHipShift * rest;
      pelvis.position.y = lerp(RIDER.hipHeight - squat, RIDER_BLOCKOUT.restHipHeight, settled);
      // The hips carry back as the torso goes over them — the photograph's
      // rider is not folded at the waist over a static seat, their whole mass
      // has moved behind the pedals. Negative is rearward.
      pelvis.position.z = (hipShift - attack * RIDER_BLOCKOUT.attackHipShift) * (1 - settled);
      if (ragActive) {
        // The root *is* the particle frame, so the pelvis returns to its
        // neutral seat on it: the torso then lies along the spine the
        // particles made, instead of adding a second opinion about it.
        pelvis.position.x *= 1 - rag;
        pelvis.position.y = lerp(pelvis.position.y, RIDER.hipHeight, rag);
        pelvis.position.z *= 1 - rag;
        pelvis.rotation.x *= 1 - rag;
      }
      // The machine now owns its yaw beneath the rider, so an unrotated pelvis
      // already lags the wheel naturally. The old counter-yaw compensated for
      // wobble incorrectly placed on the shared rider root and would now make
      // the torso swing in the opposite direction for no physical reason.
      //
      // The one deliberate twist this joint carries is the look behind: riding
      // backwards, the chest opens toward the left shoulder (+X, so a positive
      // yaw) while the legs stay square on their pedals — the twist is
      // entirely above the hips, which is what separates a rider turning to
      // look from a statue rotated on its base.
      pelvis.rotation.y = stance.turnTwist * (1 - reverse)
        + reverse * RIDER_BLOCKOUT.reverseTorsoTwist;
      for (const leg of legs) {
        const inside = insideSide !== 0 && Math.sign(leg.side) === insideSide;
        const outside = insideSide !== 0 && Math.sign(leg.side) === -insideSide;
        const drop = squat
          + (inside ? RIDER_BLOCKOUT.carveInsideHipDropMax * amount * (1 - technical) : 0)
          + (outside ? RIDER_BLOCKOUT.technicalTurnOutsideHipDropMax * amount * technical : 0);
        const carveOpen = inside
          ? RIDER_BLOCKOUT.carveInsideKneeOpen * amount * (1 - technical)
          : 0;
        // At rest the hips move over the grounded left foot while the right
        // ankle follows a pedal tipped outboard. A forward-only knee solve
        // draws the shin diagonally through the shell between those two fixed
        // points; opening the pedal-side knee routes the relaxed leg around the
        // pad instead. Rest and carve cannot normally coexist, but `Math.max`
        // keeps the stronger anatomical request if a transition overlaps them.
        const restOpen = leg.side < 0 ? RIDER_BLOCKOUT.restPedalKneeOpen * rest : 0;
        const open = Math.max(carveOpen, restOpen);
        // The scraping pedal has stopped going down, so the boot standing on
        // it rises relative to the rest of the rider (motion reference §14).
        const lift = strikeSide !== 0 && Math.sign(leg.side) === strikeSide ? strikeLift : 0;
        const footAdjust = -leg.side * footPhase * footCorrection
          * RIDER_BLOCKOUT.wobbleFootAdjust;
        if (
          !restActive
          // The ragdoll targets move every step, so the change-detection
          // cache must not skip a solve while the particles own the limbs.
          && !ragActive
          && Math.abs(drop - leg.lastDrop) < 1e-6
          && Math.abs(hipShift - leg.lastShift) < 1e-6
          && Math.abs(open - leg.lastOpen) < 1e-6
          && Math.abs(lift - leg.lastLift) < 1e-6
          && Math.abs(footAdjust - leg.lastFootAdjust) < 1e-6
          && Math.abs(stance.wobbleYaw - leg.lastPedalYaw) < 1e-6
          && Math.abs(stance.pedalRoll - leg.lastPedalRoll) < 1e-6
        ) continue;

        leg.lastDrop = drop;
        leg.lastShift = hipShift;
        leg.lastOpen = open;
        leg.lastLift = lift;
        leg.lastFootAdjust = footAdjust;
        leg.lastPedalYaw = stance.wobbleYaw;
        leg.lastPedalRoll = stance.pedalRoll;
        leg.hip.position.x = leg.side * hipHalfWidth + RIDER_BLOCKOUT.restHipShift * rest;
        leg.hip.position.y = lerp(RIDER.hipHeight - drop, RIDER_BLOCKOUT.restHipHeight, settled);
        leg.hip.position.z = hipShift * (1 - settled);

        // The left boot (+X side) is the one that steps down, per the owner's
        // stopped photographs; the right stays planted on its pedal. The
        // ground target aims below the rider root by the suspension's current
        // offset, because the root rides the sprung mass and the ground does
        // not.
        const grounding = leg.side > 0 ? rest : 0;
        // **A crash grounds BOTH boots** (M6). The rest stance grounds one and
        // leaves the other on its pedal; a rider who has come off the wheel is
        // standing on the ground or lying beside it, not holding a riding
        // stance two metres from their pedals (`EUC_RIDER_MOTION_REFERENCE.md`
        // §16). Same machinery, one more reason to use it.
        const settling = Math.max(grounding, crashing);
        const outboard = crashing > grounding
          ? leg.side * RIDER_BLOCKOUT.crashFootOutboard
          : RIDER_BLOCKOUT.restFootOutboard;
        pedalReactionTarget.copy(leg.target).applyEuler(pedalReactionEuler);
        restAnkleTarget.set(
          lerp(pedalReactionTarget.x, outboard, settling),
          lerp(
            pedalReactionTarget.y + lift,
            RIDER_BLOCKOUT.ankleAbovePedal + groundY,
            settling,
          ),
          lerp(pedalReactionTarget.z + footAdjust, -RIDER_BLOCKOUT.restFootBack, settling),
        );
        if (ragActive) {
          // The hip returns to its neutral seat on the particle-framed root,
          // and the ankle chases the foot particle instead of a pedal.
          leg.hip.position.x = lerp(leg.hip.position.x, leg.side * hipHalfWidth, rag);
          leg.hip.position.y = lerp(leg.hip.position.y, RIDER.hipHeight, rag);
          leg.hip.position.z *= 1 - rag;
          restAnkleTarget.lerp(leg.side > 0 ? stance.ragdollFootL : stance.ragdollFootR, rag);
        }
        solveChain({
          origin: leg.hip.position,
          target: restAnkleTarget,
          upperLength: RIDER_BLOCKOUT.thighLength,
          lowerLength: RIDER_BLOCKOUT.shinLength,
          // The inside knee relaxes outward toward the apex; the outside leg
          // keeps its forward bend, pressed against the wheel. A ragdolled
          // leg bends toward forward-plus-sky instead — see `ragdollUp`.
          bendToward: ragActive
            ? bendScratch.copy(FORWARD).multiplyScalar(0.35)
              .addScaledVector(stance.ragdollUp, rag).normalize()
            : open > 0
              ? bendScratch.set(Math.sign(leg.side) * open, 0, 1).normalize()
              : FORWARD,
        }, reactionUpper, reactionLower);
        leg.hip.quaternion.copy(reactionUpper);
        leg.knee.quaternion.copy(reactionLower);
        leg.ankle.quaternion.copy(reactionUpper).multiply(reactionLower).invert()
          .multiply(pedalReactionQuaternion);
      }

      // -- Arms: balance, never steering (motion reference 23) ---------------
      //
      // Braking sends the hands forward and outward to counterbalance hips
      // that have gone behind the axle; hard drive draws them back and
      // compact; a carve opens and lifts the OUTSIDE arm while the inside one
      // tucks, because "inside and outside arms respond differently" and
      // "avoid rigid mirrored poses". Every offset is applied on top of the
      // static right-arm asymmetry rather than replacing it, so no reaction
      // can flatten the pair into a mirror.
      //
      // The magnitudes are all under 6 cm on purpose. The failure mode here is
      // not subtlety, it is a rider who appears to be holding handlebars —
      // which is what hands rising and converging toward the centreline looks
      // like. These only ever move hands down-and-outward or forward at hip
      // height, and the outside hand is the only one that rises at all.
      //
      // In the air both arms open together and lift a little — "arms provide
      // limited correction", "arms open for balance" (§12.3, §12.4). It is the
      // one reaction here that is deliberately symmetric, because it is the
      // one situation where nothing is asymmetric about what the rider is
      // doing; the static right-arm offset still keeps them from mirroring.
      for (const arm of arms) {
        const inside = insideSide !== 0 && Math.sign(arm.side) === insideSide;
        const splay = (driving + bracing) * RIDER_BLOCKOUT.armLoadSplay
          + amount * (inside
            ? -RIDER_BLOCKOUT.armCarveInsideTuck
            : RIDER_BLOCKOUT.armCarveOutsideSplay)
          + air * RIDER_BLOCKOUT.airArmSplay
          // "Arms move outward", then "arms widen" (§13.1, §13.2) — and on the
          // way back down, "arms gradually return inward" (§13.3), which is the
          // same line running backwards as the energy decays.
          + wobble * RIDER_BLOCKOUT.wobbleArmSplay
          + crashing * RIDER_BLOCKOUT.crashArmSplay
          // The tuck opens the arms only slightly. The reference hands are
          // back and low, not out — a wide tuck reads as a tightrope walker.
          + tuck * RIDER_BLOCKOUT.tuckArmSplay
          // The attack stance pins the arms *in*; the hard carve throws the
          // outside one out and leaves the inside one where the ordinary
          // carve reaction put it.
          + attack * RIDER_BLOCKOUT.attackArmSplay
          + (inside ? 0 : carving * RIDER_BLOCKOUT.carveStanceOutsideSplay)
          // Backwards: "arms held slightly outward from the body ... as
          // counterweights". Balance, never bars — down-and-out only.
          + reverse * RIDER_BLOCKOUT.reverseArmSplay;
        const forward = bracing * RIDER_BLOCKOUT.armBrakeForward
          - driving * RIDER_BLOCKOUT.armAccelBack
          // Hands finish *behind* the hips in a tuck, which is both the
          // reference pose and the furthest thing from a handlebar grip.
          - tuck * RIDER_BLOCKOUT.tuckArmBack
          - attack * RIDER_BLOCKOUT.attackArmBack
          // The asymmetry is the carve photograph's whole signature: the
          // outside glove reaches across the machine, the inside one trails.
          + (inside
            ? -carving * RIDER_BLOCKOUT.carveStanceInsideBack
            : carving * RIDER_BLOCKOUT.carveStanceOutsideForward);
        const rise = (inside ? 0 : amount * RIDER_BLOCKOUT.armCarveOutsideRise)
          + air * RIDER_BLOCKOUT.airArmRise
          + wobble * RIDER_BLOCKOUT.wobbleArmRise
          // And drop, so the hands do not ride up as the torso hinges over
          // them — the one way a tuck could still find the handlebar pose.
          - tuck * RIDER_BLOCKOUT.tuckArmDrop
          - attack * RIDER_BLOCKOUT.attackArmDrop
          + (inside
            ? carving * RIDER_BLOCKOUT.carveStanceInsideRise
            : -carving * RIDER_BLOCKOUT.carveStanceOutsideDrop)
          // "Arms protect body" (§16). Symmetric, deliberately: there is
          // nothing asymmetric about coming off.
          + crashing * RIDER_BLOCKOUT.crashArmRise;

        // M14. Only the right arm swings, and only while a swing is running.
        // **This term joins the early-out below or the arm freezes mid-swing**
        // — every other input here is a slow pose curve, and the guard exists
        // because most frames move none of them; a swing moves nothing *but*
        // this, so an unguarded swing is an arm that never leaves its carriage.
        const swinging = arm.side < 0 ? clamp(stance.swingBlend, 0, 1) : 0;

        if (
          !ragActive
          && swinging <= 1e-6
          && Math.abs(swinging - arm.lastSwing) < 1e-6
          && Math.abs(splay - arm.lastSplay) < 1e-6
          && Math.abs(forward - arm.lastForward) < 1e-6
          && Math.abs(rise - arm.lastRise) < 1e-6
        ) continue;

        arm.lastSplay = splay;
        arm.lastForward = forward;
        arm.lastRise = rise;
        arm.lastSwing = swinging;
        arm.target.set(
          Math.sign(arm.side) * (arm.baseSplay + splay),
          arm.baseTarget.y + rise,
          arm.baseTarget.z + forward,
        );
        if (swinging > 0) {
          // Out along the swing, at very nearly full extension.
          //
          // **Nearly, not fully.** Past full reach `solveChain` stops solving a
          // bend and simply points the limb, and every downstream arm reaction
          // then silently stops moving — the ceiling `riderLook.ts` records,
          // and a swing is the one pose in this game that goes looking for it.
          //
          // The target is the *grip*, not the paddle head: the head is
          // `PADDLE.reach` from the shoulder and no arm is that long, which is
          // what the shaft is for. `render/paddle.ts` covers the remainder and
          // aims itself at the simulation's own head position.
          const extent = (RIDER_BLOCKOUT.upperArmLength + RIDER_BLOCKOUT.forearmLength) * 0.94;
          SWING_TARGET.set(
            arm.shoulder.position.x + Math.sin(stance.swingAngle) * extent,
            arm.shoulder.position.y - extent * RIDER_BLOCKOUT.armHangFraction * 0.35,
            arm.shoulder.position.z + Math.cos(stance.swingAngle) * extent,
          );
          arm.target.lerp(SWING_TARGET, swinging);
        }
        if (ragActive) {
          // The hand particle arrives in the root's frame; the arm chain
          // solves in the pelvis's, so re-express it there before blending.
          RAG_INVERSE.copy(pelvis.quaternion).invert();
          RAG_TARGET.copy(arm.side > 0 ? stance.ragdollHandL : stance.ragdollHandR)
            .sub(pelvis.position)
            .applyQuaternion(RAG_INVERSE);
          arm.target.lerp(RAG_TARGET, rag);
        }
        solveChain({
          origin: arm.shoulder.position,
          target: arm.target,
          upperLength: RIDER_BLOCKOUT.upperArmLength,
          lowerLength: RIDER_BLOCKOUT.forearmLength,
          bendToward: arm.bendToward,
        }, reactionUpper, reactionLower);
        arm.shoulder.quaternion.copy(reactionUpper);
        arm.elbow.quaternion.copy(reactionLower);
      }

      // -- Head -------------------------------------------------------------
      //
      // Two independent joints on one group, and the Euler order matters.
      // three.js applies 'XYZ' as Rx * Ry * Rz, so the pitch below is taken in
      // the torso's frame and the yaw then happens about the already-pitched
      // neck axis — a head that turns about its own spine rather than about
      // the world's vertical, which is what keeps a launch pose from swinging
      // the helmet sideways when the rider looks into a corner.
      //
      // Pitch: partial stabilisation against the torso's total fore-aft hinge
      // (wheel share plus pelvis share plus the relaxed rest pitch). Eyes on
      // the route through a launch, no head-throw during hard braking.
      //
      // On the way down the head goes to the landing on top of that: "head
      // tracks landing", "head looks toward landing", "head focused on landing
      // surface" (§12.2-§12.4). Only while falling — a rider on the way up is
      // still looking ahead — and only by the air blend, so it fades in and
      // out with the flight rather than snapping at the apex.
      //
      // The tuck's own hinge is stabilised harder and on its own allowance
      // (M8.6). Head-up is the *defining* feature of that pose — a rider
      // folded over the wheel with their eyes on the tyre is a rider about to
      // hit something — and the general allowance is already spent by the time
      // the torso is 30 degrees further forward, so a shared clamp would have
      // silently buried the head exactly when it matters most.
      const tuckPitch = torsoPitch - stance.torsoPitch;
      neck.rotation.x = -clamp(
        (riderPitch + RIDER_BLOCKOUT.torsoRestPitch) * RIDER_BLOCKOUT.headStabilizationFactor,
        -RIDER_BLOCKOUT.headStabilizationMax,
        RIDER_BLOCKOUT.headStabilizationMax,
      ) - clamp(
        tuckPitch * RIDER_BLOCKOUT.tuckHeadStabilization,
        0,
        RIDER_BLOCKOUT.tuckHeadStabilizationMax,
      ) - (stance.falling ? air * RIDER_BLOCKOUT.airHeadDown : 0);
      // Yaw: the rider looks where they intend to go (motion reference 22).
      // The controller already carries the sign and the smoothing; this joint
      // only spends it.
      //
      // Backwards, where they intend to go is BEHIND them, so the steer-driven
      // look crossfades into the over-the-shoulder look rather than adding to
      // it: on top of the pelvis twist the composed head lands near 86 degrees
      // from the wheel's nose — over the left shoulder, eyes on the travel —
      // and a full-lock steer can never stack the two into an owl pose.
      neck.rotation.y = lerp(lookYaw, RIDER_BLOCKOUT.reverseHeadYaw, reverse);

      // -- Hair that keeps hanging (M23) ------------------------------------
      //
      // The pivot gives back what the body just did. `torsoPitch` is the whole
      // fore-aft hinge and `neck.rotation.x` is the head's share of it, so
      // their sum less the resting tilt is how far the neck frame has folded
      // from the carriage the hair was modelled in — and that is exactly the
      // rotation that used to drive the mass through her back.
      //
      // Yaw is a *lag* rather than a give-back: at full compensation the hair
      // would sit dead still while the head turned inside it, which loses the
      // one thing the owner liked about it ("it moves away and reveals the
      // logo while riding"). A third of the turn is enough to keep the mass
      // out of the shoulder and still swing.
      //
      // Roll hangs the mass out of the corner, which is where gravity puts it
      // on a rider leaned into one, and is the third of the three combinations
      // the owner asked to be checked.
      if (hairSway !== null) {
        // **Solved as an orientation, not as three angles.** The node is a
        // child of the neck, so "give back the head's pitch and lag its yaw"
        // is a composition — and Euler angles do not compose: cancelling a
        // 0.88 rad yaw underneath a 0.45 rad pitch by writing the negative
        // yaw leaves a cross term, which is what put the mass 36 mm further
        // into her torso in the look-behind stance with the yaw already
        // nominally cancelled. Naming the pose the hair should *hold* and
        // dividing out the joint it hangs from has no such residue.
        //
        //   - **Pitch** returns to its resting angle. Draping over a back is
        //     not hanging under gravity: a folded rider's back is tilted, and
        //     hair pinned to world-vertical would pass through it. Holding the
        //     rest angle in the torso's own frame is what a mass lying on a
        //     back does, and it is the only pose that cannot penetrate.
        //   - **Trail** then lifts it *off* the back as the fold deepens —
        //     positive is backward here — which is the wind, and the one
        //     direction that adds clearance rather than spending it.
        //   - **Yaw** follows part of the turn and then stops at the shoulder,
        //     which keeps what the owner liked ("it moves away and reveals the
        //     logo") without sweeping the fall through her.
        //   - **Roll** is deliberately absent; `RIDER_BLOCKOUT` carries the
        //     measurement that ruled it out.
        //
        // **And the pitch never goes below the head's own** — the owner's
        // report, mid-repair: *"the hair detaches when hard breaking."* Every
        // sentence above was reasoned from a rider folding *forward*, where
        // the head cranes up and giving that rotation back is what keeps the
        // mass lying on the back. A hard brake is the same stabiliser running
        // the other way: it settles at −0.70 rad of backward lean and **holds
        // there**, which tips the head 0.39 rad forward, and a mass that
        // insists on the torso's rest angle underneath it swings 0.46 rad down
        // and forward about the neck joint — 55 mm at the middle of the fall,
        // which slides the roots out from under the helmet rim and opens a gap
        // between the two. Hair grows out of a scalp: it may lag a head that
        // turns and it may lift off a back that folds, but it cannot rotate
        // *below* where it is attached. The floor is the head's own pitch,
        // which is a no-op for every forward stance — there the give-back is
        // already above it — and rides the skull rigidly through a brake.
        const fold = Math.max(0, torsoPitch - RIDER_BLOCKOUT.torsoRestPitch);
        HAIR_EULER.set(
          Math.max(
            HAIR_NECK_REST + fold * RIDER_BLOCKOUT.hairTrailPitch,
            neck.rotation.x,
          ),
          clamp(
            neck.rotation.y * (1 - RIDER_BLOCKOUT.hairFollowYaw),
            -RIDER_BLOCKOUT.hairYawMax,
            RIDER_BLOCKOUT.hairYawMax,
          ),
          0,
        );
        HAIR_TARGET.setFromEuler(HAIR_EULER);
        HAIR_INVERSE.copy(neck.quaternion).invert();
        hairSway.quaternion.copy(HAIR_INVERSE).multiply(HAIR_TARGET);
        // The ragdoll owns the body outright; the hair goes back to hanging
        // off the joint it is parented to and lets the particles carry it.
        if (rag > 0) hairSway.quaternion.slerp(HAIR_REST.identity(), rag);
        // And a little back off the shoulder blades as it folds: rotation
        // alone pivots about the nape, which clears the tips and not the
        // roots, and the roots are what press into the yoke of the suit.
        hairSway.position.z = -RIDER_BLOCKOUT.hairFollowLift
          * clamp(fold / RIDER_BLOCKOUT.hairFollowPitchMax, 0, 1) * (1 - rag);
      }

      // -- The ragdoll head (M15) -------------------------------------------
      // The neck leans the head toward its particle, which is what makes the
      // tumble read from the chase camera: a body that rolls while the head
      // stays route-focused is a statue, and a head that lolls with the fall
      // is a person having a bad afternoon. The lean clamps at the horizontal
      // rather than solving a fully inverted hang — a small dignity the
      // non-graphic rule is happy to pay for, and a gimbal headache avoided.
      // `neck.rotation.z` has no other owner; it is restored to zero the
      // frame the blend ends, because this branch runs every frame.
      if (ragActive) {
        RAG_INVERSE.copy(pelvis.quaternion).invert();
        RAG_TARGET.copy(stance.ragdollHead)
          .sub(pelvis.position)
          .applyQuaternion(RAG_INVERSE);
        const towardY = Math.max(0.08, RAG_TARGET.y - shoulderY);
        neck.rotation.x = lerp(neck.rotation.x, Math.atan2(RAG_TARGET.z, towardY), rag);
        neck.rotation.y *= 1 - rag;
        neck.rotation.z = -Math.atan2(RAG_TARGET.x, towardY) * rag;
      } else {
        neck.rotation.z = 0;
      }
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      // The look's printed sheet, if it had one. A texture is a GPU resource
      // like the other two and the M0 resource test counts it as one.
      for (const texture of textures) texture.dispose();
      geometries.length = 0;
      materials.length = 0;
      textures.length = 0;
      root.removeFromParent();
    },
  };
}
