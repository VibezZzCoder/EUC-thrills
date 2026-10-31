/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { NEAR_SOLID, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { clamp01 } from '../shared/maths.ts';
import type { EucPose } from '../simulation/EucController.ts';
import {
  RD_CHEST,
  RD_FOOT_L,
  RD_FOOT_R,
  RD_HAND_L,
  RD_HAND_R,
  RD_HEAD,
  RD_HIP_L,
  RD_HIP_R,
  RD_PELVIS,
} from '../simulation/ragdoll.ts';
import { createBlockoutEUC, type BlockoutEUC } from './euc.ts';
import { STANDARD_MACHINE_LOOK, type MachineLook } from './machineLook.ts';
import { armEaseForSpeed, createPlaceholderRider, createStanceInput, type PlaceholderRider } from './rider.ts';
import { COOL_RIDER_LOOK, MOTION_STILL, type RiderLook } from './riderLook.ts';
import { createPaddle } from './paddle.ts';
import { consolidateRig, type RigConsolidation } from './rigConsolidation.ts';

/**
 * Wheel and rider, assembled into one thing that a pose can be applied to.
 *
 * The whole of `render/`'s knowledge about the EUC controller is the shape of
 * `EucPose` — nine numbers. It asks the simulation no questions and answers
 * none of its own (architecture invariant 3): `apply()` is handed a state and
 * places geometry, and that is the entire relationship.
 *
 * The nesting is what makes the lean read correctly:
 *
 * ```
 * group            position and clean heading — the contact patch, on ground
 *   groundPivot    the surface's own tilt under the wheel (M4)
 *     leanPivot    roll and the wheel's share of the fore-aft lean
 *       euc        machine-only wobble yaw/roll; tyre spins inside this
 *         body     the sprung mass, riding the suspension (M4)
 *       rider      boots planted on the pedals, so they lean with the wheel
 *         pelvis   counter-rolls above articulated, pedal-planted legs
 * ```
 *
 * Rotating the rider as one piece creates the exaggerated plank pose the owner
 * rejected — and the thing he rejected was 1.22 of the wheel's roll *at every
 * speed*, a rider planked over at walking pace. The lower body follows the
 * wheel, the inside knee bends farther, and the pelvis counter-rolls so the
 * shoulders stay near level. Pivoting the whole rig anywhere other than the
 * contact patch would also swing the tyre out from under itself.
 *
 * **From M30 Phase 3 the counter-roll is a schedule, not a constant**
 * (`simulation/riderLean.ts`, `docs/PLANS.md` §30.3c). Below 6 m/s it is what
 * it always was, to the bit — the slow technique above is unchanged. As the
 * speed climbs the rider's share climbs with it, and at `carveLeanFullSpeed`
 * on the shipped `carveLeanShareTop` of 1.0 the rider takes the *whole* of the
 * cornering lean. That is the M30 pose, and it is not the plank — a rider hung
 * out with the machine at 45 mph is the corner the owner asked for, where the
 * same angle at 3 mph was the defect.
 *
 * **From M30 Phase 2 the whole of the lean is more than the wheel's bank**
 * (§30.3b): the machine saturates at `atan(maxLateralG · grip)` — 36.9° on
 * pavement — and the rider carries the rest of the force, so the hinge this
 * file writes is *negative* through a fast corner and the torso hangs inside
 * the wheel's line by up to 9.5°. It is exactly zero only where the wheel is
 * unsaturated, which below the grip limit is every corner. Above a share of
 * 1.0 it hangs further in again. **`riderRoll` arrives on the pose already scheduled**: the rig
 * spends the difference it is handed and never re-derives it from `rollAngle`,
 * which is also what lets the ghost and the player share one expression.
 *
 * **The ground pivot at M4 goes *under* the lean pivot, not over it**, because
 * lean is relative to the surface: a rider carving across a slope leans off the
 * hill's normal, not off world vertical. Adding it as a parent leaves every
 * approved M2/M3 local rotation untouched, which is why the pose tests written
 * against `riding-lean-pivot` still measure exactly what they measured.
 *
 * **One channel here is not on the pose, and that is deliberate** (M36,
 * §36.5). `setTrickPose` carries the one-foot air gesture — the airborne
 * exception to the motion reference's two-foot contact, and the only pose in
 * this game where a boot leaves its pedal while the rider is still riding. It
 * is a sibling method rather than an `EucPose` field so that the controller
 * cannot read it (physical equality is a contract there) and so that the two
 * rigs driven by a pose alone — the cop's and every ghost's — keep both feet
 * planted with no fallback code of their own.
 *
 * **After the owner's M4 ride the ground pivot carries only a *fraction* of
 * the surface's tilt** — zero fore-aft, a quarter across — because an EUC is
 * not a skateboard: the firmware holds the pedals level with gravity, so on a
 * hill the rig stays plumb and the *rider* leans into the slope. That lean
 * arrives here already folded into `pose.riderPitch`; the fractions are
 * decided in the controller (`writeGroundTilt`) and applied here without a
 * second opinion, exactly as before.
 */

export interface RidingRig {
  /** Root. Positioned at the contact patch and yawed to the heading. */
  readonly group: THREE.Group;
  /** The surface's tilt under the wheel. Identity on flat ground. */
  readonly groundPivot: THREE.Group;
  /**
   * The wheel and rider together, leaned. The chase camera's bank is derived
   * from the same `pose.rollAngle` this pivot uses, not read back from it —
   * `render/chaseCamera.ts` owns that sign and states its derivation.
   */
  readonly leanPivot: THREE.Group;
  readonly euc: BlockoutEUC;
  readonly rider: PlaceholderRider;
  apply(pose: EucPose): void;
  /** The fixed-step composition root clears crash pose history independently of drawing. */
  resetCrashPose(): void;
  /**
   * Drive the machine's own status light (M6).
   *
   * Separate from `apply` because it needs the simulation clock and a pose is
   * not a clock. `app/Game.ts` passes `simTimeSeconds`, which advances only
   * inside the fixed step — so a frozen `advance(n)` reaches the same pulse
   * every run, exactly as the particle field does.
   */
  applyStatus(alert: number, seconds: number, boot?: number): void;
  /**
   * Pose the paddle and the arm that carries it — M14.
   *
   * Separate from `apply` for `applyStatus`'s reason: a swing is not a pose.
   * It comes from `simulation/paddle.ts`, which is a `Game` field beside the
   * challenge rather than anything the controller writes into `EucPose`, and
   * the head position is a **world** point because the paddle aims itself at
   * the very point the hit test swept through.
   *
   * `headWorld` of `null` means "not carrying one", which hides the mesh and
   * leaves the arms to their ordinary carriage.
   */
  applySwing(headWorld: THREE.Vector3 | null, angle: number, blend: number): void;
  /**
   * Would the next `apply`, given exactly the same inputs, still move the
   * rig? — performance pass 2026-10-17, for the held paused view
   * (`app/pausedView.ts`).
   *
   * Two channels here count `apply` calls rather than the simulation clock,
   * so they keep moving while every input is frozen: the paddle carry, put
   * down by 1/12 per call once the paddle leaves the hand (a Knockabout
   * pause, the couch-chase cop seat's pause, Knockabout ending), and the
   * falling flag, which compares this call's air height with the last call's.
   * True after an `apply` that left either one mid-change; false means a
   * repeat call with the same pose, swing and trick pose is a no-op.
   * `Game.admitPausedView` keeps a frame drawn while any shown rig says true,
   * so a held picture can never freeze an arm part-way through its put-down.
   * A new channel that counts calls must report here
   * (`app/pausedViewRig.test.ts` is the guard).
   */
  readonly settling: boolean;
  /**
   * The one-foot air pose — M36, `docs/PLANS.md` §36.5.
   *
   * `amount` is 0..1, how far the free foot has left its pedal; `side` is +1
   * for the rider's LEFT foot, -1 for their right, 0 for neither. Plain
   * scalars: no trick name, no character, no device and no `GameOptions`
   * record reaches this rig.
   *
   * **A sibling method rather than an `EucPose` field, and that is the design
   * rather than a style choice.** §36.5 makes physical equality a contract —
   * with the same throttle, steer, crouch and Hop presses, holding the pose
   * must leave position, velocity, bank, impulse, landing tier and lap time
   * identical — and the cheapest structural guarantee of that is a channel the
   * controller cannot read because it never enters the pose. It also settles
   * the other two rigs by construction: `copRider.ts` and `ghostRider.ts`
   * forward `apply(pose)` and never this, so the cop and every ghost keep
   * neutral feet with no fallback code and no recorded field.
   *
   * **Call it before `apply(pose)` in the same frame**, exactly as
   * `applySwing` is called before it: `apply` folds the two numbers into the
   * stance it hands `rider.applyStanceReaction`, so a call afterwards would
   * pose the foot a frame late. `app/Game.ts`'s `renderSeat` is where that
   * order is kept, and it is load-bearing there.
   *
   * Held rather than consumed: a rig told nothing keeps the last value it was
   * given, like every other channel here, so a seat that stops calling it
   * leaves the foot where it was. Callers pass the interpolated amount every
   * render frame.
   */
  setTrickPose(amount: number, side: number): void;
  /**
   * What the drawn rider must be kept out of — 1.4.0 ride fixes
   * (`NEAR_SOLID` in `data/tuning.ts`, `app/nearSolids.ts`).
   *
   * `lift` raises the drawn rig (wheel, rider, ground under the planted
   * boot) so the tyre circle clears a step's nose, and `along` moves it along
   * the heading (+ forward) — a stopped tyre is drawn rolled off a nose.
   * `faces` are the distances to a solid round the drawn root, per band and
   * direction (`NearSolids.faces`); after the stance is solved `apply`
   * measures this rig's own posed body against them and pushes the drawn
   * rider just clear of every face, riding, leaning or parked. `seconds` is
   * the drawn time since the last call, which eases the push back off once a
   * face stops asking for room; arriving at a face is never eased. `normals`
   * are the faces' own outward normals (`NearSolids.normals`); without them a
   * face is taken square to its probe.
   *
   * **A sibling method rather than an `EucPose` field**, for
   * `setTrickPose`'s reason: the controller cannot read what never enters the
   * pose, so this cannot move a ride. Called before `apply(pose)` in the same
   * frame; held between calls. A rig never told — the cop's, every ghost's,
   * every test's — keeps zero lift and no face, and draws exactly the pose.
   */
  setNearSolids(lift: number, faces: ArrayLike<number>, along?: number, seconds?: number,
    normals?: ArrayLike<number>): void;
  /**
   * The world-space push the last `apply` drew the rider by, metres
   * (`[x, z]`, zero with no face near). Read by tests.
   */
  readonly nearPush: readonly [number, number];
  /**
   * What the build-time consolidation merged (`render/rigConsolidation.ts`,
   * perf item "riders" 2026-10-17), or null for a rig built with
   * `{ consolidate: false }` — the ghost's and the CPU-cop trims'. Read by
   * tests; nothing at runtime needs it.
   */
  readonly consolidation: RigConsolidation | null;
  dispose(): void;
}

/** Build options for a riding rig — perf item "riders", 2026-10-17. */
export interface RidingRigOptions {
  /**
   * Merge same-joint, same-material sibling meshes at build
   * (`render/rigConsolidation.ts`): the exact tier, the owner's OD-1 pad and
   * pedal bake (`BAKED_PAIRS`) and his OD-2 cast union. **On (absent) for
   * every seat rig.** `false` keeps the graph `rider.ts` and `euc.ts` built,
   * mesh for mesh — the ghost (translucent: a merge would move its blend
   * order) and the CPU-cop trims (they rewrite the rig by mesh name and by
   * per-mesh triangle count) build that way, as does any test that looks up
   * an absorbed mesh by name.
   */
  readonly consolidate?: boolean;
}

/**
 * The owner's OD-1 (2026-10-17): the machine's pad pair and pedal pair are
 * static build-time translations of one parent (`euc.ts`), baked into one
 * mesh each. Positions change by float32 rounding only (under 26 nm);
 * normals, uvs and colours are copied bit for bit.
 */
export const BAKED_PAIRS: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['euc-pad-right', 'euc-pad-left']),
  Object.freeze(['euc-pedal-right', 'euc-pedal-left']),
]);

/**
 * Build the rig, optionally wearing a particular rider — and, from M19, a
 * particular machine.
 *
 * Both looks are forwarded and nothing else about this file knows a character
 * or a machine exists: `apply(pose)` writes joints, and joints are the same on
 * every rider and every machine because both axes are built to one skeleton —
 * `RIDER_BLOCKOUT` for the rider, the four `MACHINE_CONTRACT` constants for
 * the wheel. The defaults are Cool Rider on the standard wheel for the reason
 * `createPlaceholderRider` documents — every existing baseline, measurement
 * and unit test constructs a rig with no argument.
 */
export function createRidingRig(
  look: RiderLook = COOL_RIDER_LOOK,
  machine: MachineLook = STANDARD_MACHINE_LOOK,
  options: RidingRigOptions = {},
): RidingRig {
  const group = new THREE.Group();
  group.name = 'riding-rig';
  // The look's answer to the ride style's channels — M29. `MOTION_STILL` for
  // every look but the Drunkard's, so the two lines below that read it are
  // products of zero on everybody else's rig.
  const motion = look.motion ?? MOTION_STILL;

  const groundPivot = new THREE.Group();
  groundPivot.name = 'riding-ground-pivot';
  group.add(groundPivot);

  const leanPivot = new THREE.Group();
  leanPivot.name = 'riding-lean-pivot';
  groundPivot.add(leanPivot);

  const euc = createBlockoutEUC(machine);
  const rider = createPlaceholderRider(look);
  leanPivot.add(euc.group);
  leanPivot.add(rider.root);
  // **Consolidated before the paddle is hung** (perf item "riders",
  // 2026-10-17): the paddle mesh is shown and hidden at runtime, so it must
  // never join a merge. Everything below this line that holds a rig part —
  // the hands, the tyre, the grip, the joints — holds one consolidation does
  // not touch (`rigConsolidation.ts` says why, structurally).
  const consolidation: RigConsolidation | null = options.consolidate === false
    ? null
    : consolidateRig(group, { bake: BAKED_PAIRS, castUnion: true });

  // The paddle hangs off the rider's own grip, so it goes wherever the hand
  // goes — including through the M15 crash ragdoll, which is the owner's
  // confirmed call: the paddle stays in hand, no drop state, no new physics.
  const paddle = createPaddle();
  rider.grip.add(paddle.group);

  // One stance object, filled in place every frame. `rider.ts` reads nine
  // values and the alternative is nine positional arguments, which M5 took
  // past the point where a reader could tell which `number` was which.
  const stance = createStanceInput();
  /** Last frame's height above the ground, so the rig can tell rising from
   *  falling without the pose having to carry a vertical velocity. */
  let lastAirHeight = 0;
  /**
   * Where the swing wants the paddle head, in world space — M14, or null when
   * the rider is carrying nothing. Copied rather than referenced, so the caller
   * is free to reuse its own vector between frames.
   */
  const swingHeadWorld = new THREE.Vector3();
  let swingHead: THREE.Vector3 | null = null;
  let swingBlend = 0;
  /**
   * How far the right hand still holds its paddle carry, 0..1 (round 2,
   * 2026-10-10) — `StanceInput.carry`. Taken up in the frame the paddle
   * appears, because the paddle hangs off the forearm and an arm easing into
   * the carry would sweep a visible shaft in across the legs; put down over
   * twelve drawn frames (≈ 0.2 s at 60 Hz), so a paddle leaving the hand —
   * Knockabout ending, a pause — relaxes the arm instead of snapping it 45 mm
   * and turning the glove 52° in one frame. Render frames, not the sim clock:
   * `apply` carries no clock, and nothing simulated reads this.
   */
  let carry = 0;
  /**
   * The last `apply`'s answer to `settling` (performance pass 2026-10-17):
   * the carry still on its way down, or the falling flag set (a repeat call
   * at the same air height clears it).
   */
  let settlingAfterApply = false;
  /**
   * The one-foot air pose — M36, §36.5. Two numbers, recorded by
   * `setTrickPose` and spent inside `apply`, held between calls.
   */
  let trickOneFoot = 0;
  let trickSide = 0;
  /**
   * The near-solid channel — 1.4.0 ride fixes. Held between calls like the
   * trick pose; zero lift and no face until `setNearSolids` says otherwise.
   */
  const bandCount = NEAR_SOLID.bandHeights.length;
  const directionCount = NEAR_SOLID.directions;
  let solidLift = 0;
  let solidAlong = 0;
  let solidSeconds = 0;
  let solidAny = false;
  const solidFaces = new Float64Array(bandCount * directionCount).fill(Number.POSITIVE_INFINITY);
  /** Each face's outward normal in the rig's frame, `(x, z)` pairs, refreshed per call. */
  const solidNormals = new Float64Array(2 * bandCount * directionCount);
  const worldNormals = new Float64Array(2 * bandCount * directionCount);
  let solidHasNormals = false;
  /** Per face: the body's least reach along its normal, and the face's own offset. */
  const nearest = new Float64Array(bandCount * directionCount);
  const offsets = new Float64Array(bandCount * directionCount);
  let posed = new Float64Array(0);
  const directionX = new Float64Array(directionCount);
  const directionZ = new Float64Array(directionCount);
  for (let index = 0; index < directionCount; index += 1) {
    const angle = (2 * Math.PI * index) / directionCount;
    directionX[index] = Math.sin(angle);
    directionZ[index] = Math.cos(angle);
  }
  /** The drawn push, world metres, held for the ease back off a face. */
  const push: [number, number] = [0, 0];
  let hull: { readonly mesh: THREE.Mesh; readonly points: Float32Array }[] | null = null;
  const groupInverse = new THREE.Matrix4();
  const toRoot = new THREE.Matrix4();

  // Ragdoll scratch (M15), preallocated for the same reason the solver's is:
  // a crash runs this every frame, and fresh matrices would be steady garbage.
  const ragLean = new THREE.Matrix4();
  const ragStage = new THREE.Matrix4();
  const ragEuler = new THREE.Euler();
  const ragPelvis = new THREE.Vector3();
  const ragUp = new THREE.Vector3();
  const ragLateral = new THREE.Vector3();
  const ragForward = new THREE.Vector3();
  const ragBasis = new THREE.Matrix4();
  const ragQuat = new THREE.Quaternion();
  const ragOffset = new THREE.Vector3();
  const ragRootPos = new THREE.Vector3();
  const ragRootInverse = new THREE.Quaternion();
  const ragWorldRootInverse = new THREE.Quaternion();
  const ragParentInverse = new THREE.Quaternion();
  const ragBootQuaternion = new THREE.Quaternion();

  /** Read particle `index` from the pose block into lean-pivot-local space. */
  const ragLocal = (pose: EucPose, index: number, out: THREE.Vector3): THREE.Vector3 => {
    const base = index * 3;
    return out
      .set(pose.ragdoll[base], pose.ragdoll[base + 1], pose.ragdoll[base + 2])
      .applyMatrix4(ragLean);
  };

  /**
   * Each body mesh's hull points, once per rig: the local vertices that are
   * furthest along `NEAR_SOLID.hullDirections` directions spread over the
   * sphere. Every mesh under the rider's root is rigid in its own frame, so
   * its extreme point toward a face is always one of these — the face test
   * transforms a few dozen points per mesh instead of every vertex. The
   * paddle is not the body: it swings through walls in Knockabout as it
   * always has, and is left out.
   */
  const buildHull = (): { readonly mesh: THREE.Mesh; readonly points: Float32Array }[] => {
    const count = NEAR_SOLID.hullDirections;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const axes: [number, number, number][] = [];
    for (let index = 0; index < count; index += 1) {
      const y = 1 - (2 * (index + 0.5)) / count;
      const radius = Math.sqrt(1 - y * y);
      axes.push([Math.cos(golden * index) * radius, y, Math.sin(golden * index) * radius]);
    }
    const entries: { readonly mesh: THREE.Mesh; readonly points: Float32Array }[] = [];
    rider.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true || mesh.name === 'rider-paddle-mesh') return;
      const position = mesh.geometry.getAttribute('position');
      if (position === undefined || position.count === 0) return;
      const chosen = new Set<number>();
      for (const [ax, ay, az] of axes) {
        let best = 0;
        let most = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < position.count; index += 1) {
          const along = position.getX(index) * ax + position.getY(index) * ay + position.getZ(index) * az;
          if (along > most) {
            most = along;
            best = index;
          }
        }
        chosen.add(best);
      }
      const points = new Float32Array(chosen.size * 3);
      let write = 0;
      for (const index of chosen) {
        points[write] = position.getX(index);
        points[write + 1] = position.getY(index);
        points[write + 2] = position.getZ(index);
        write += 3;
      }
      entries.push({ mesh, points });
    });
    return entries;
  };

  /** Whether a mesh is drawn: itself and every group up to the rider's root shown. */
  const shown = (mesh: THREE.Object3D): boolean => {
    for (let node: THREE.Object3D | null = mesh; node !== null && node !== rider.root; node = node.parent) {
      if (!node.visible) return false;
    }
    return true;
  };

  /**
   * The drawn push out of every face, in the rig's own frame (+X the
   * rider's left, +Z ahead), written to `push` turned into world terms.
   *
   * The body as posed this frame is measured — its hull points, each in the
   * band its height falls in — and every face a probe hit is a plane: the
   * hit point, and the face's outward normal. The body's least reach along
   * that normal must stay `faceGap` on the rider's side of the plane. A few
   * relaxation passes settle two faces at once (a corner); the push is
   * capped, because a probe that starts inside a solid answers 0.
   */
  const facePushFor = (pose: EucPose): void => {
    let localX = 0;
    let localZ = 0;
    const sin = Math.sin(pose.headingY);
    const cos = Math.cos(pose.headingY);
    if (solidAny) {
      hull ??= buildHull();
      let total = 0;
      for (const entry of hull) total += entry.points.length / 3;
      if (posed.length < total * 3) posed = new Float64Array(total * 3);
      group.updateMatrixWorld(true);
      groupInverse.copy(group.matrixWorld).invert();
      const heights = NEAR_SOLID.bandHeights;
      let write = 0;
      for (const entry of hull) {
        if (!shown(entry.mesh)) continue;
        toRoot.multiplyMatrices(groupInverse, entry.mesh.matrixWorld);
        const e = toRoot.elements;
        const points = entry.points;
        for (let read = 0; read < points.length; read += 3) {
          const px = points[read];
          const py = points[read + 1];
          const pz = points[read + 2];
          const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
          let band = 0;
          while (band + 1 < bandCount && y >= heights[band + 1]) band += 1;
          posed[write] = e[0] * px + e[4] * py + e[8] * pz + e[12];
          posed[write + 1] = band;
          posed[write + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
          write += 3;
        }
      }
      for (let entry = 0; entry < solidFaces.length; entry += 1) {
        const face = solidFaces[entry];
        if (!(face < Number.POSITIVE_INFINITY)) continue;
        const index = entry % directionCount;
        const band = (entry - index) / directionCount;
        let normalX = -directionX[index];
        let normalZ = -directionZ[index];
        if (solidHasNormals && (worldNormals[2 * entry] !== 0 || worldNormals[2 * entry + 1] !== 0)) {
          // World to the rig's frame, as the body points are.
          const wx = worldNormals[2 * entry];
          const wz = worldNormals[2 * entry + 1];
          normalX = wx * cos - wz * sin;
          normalZ = wx * sin + wz * cos;
        }
        solidNormals[2 * entry] = normalX;
        solidNormals[2 * entry + 1] = normalZ;
        offsets[entry] = face * (directionX[index] * normalX + directionZ[index] * normalZ);
        let least = Number.POSITIVE_INFINITY;
        for (let read = 0; read < write; read += 3) {
          if (posed[read + 1] !== band) continue;
          const reach = posed[read] * normalX + posed[read + 2] * normalZ;
          if (reach < least) least = reach;
        }
        nearest[entry] = least;
      }
      for (let pass = 0; pass < NEAR_SOLID.solveIterations; pass += 1) {
        for (let entry = 0; entry < solidFaces.length; entry += 1) {
          if (!(solidFaces[entry] < Number.POSITIVE_INFINITY) || nearest[entry] === Number.POSITIVE_INFINITY) continue;
          const normalX = solidNormals[2 * entry];
          const normalZ = solidNormals[2 * entry + 1];
          const short = offsets[entry] + NEAR_SOLID.faceGap - (nearest[entry] + localX * normalX + localZ * normalZ);
          if (short > 0) {
            localX += normalX * short;
            localZ += normalZ * short;
          }
        }
      }
      const length = Math.hypot(localX, localZ);
      if (length > NEAR_SOLID.maxPush) {
        localX *= NEAR_SOLID.maxPush / length;
        localZ *= NEAR_SOLID.maxPush / length;
      }
    }
    const targetX = localX * cos + localZ * sin;
    const targetZ = -localX * sin + localZ * cos;
    // Arriving at a face is never eased; leaving one is, so a wall that ends
    // (or a rider who turns away) does not snap him sideways.
    if (Math.hypot(targetX, targetZ) >= Math.hypot(push[0], push[1]) - 1e-9 || !(solidSeconds > 0)) {
      push[0] = targetX;
      push[1] = targetZ;
    } else {
      const keep = Math.exp(-solidSeconds / NEAR_SOLID.releaseSeconds);
      push[0] = targetX + (push[0] - targetX) * keep;
      push[1] = targetZ + (push[1] - targetZ) * keep;
    }
  };

  const self: RidingRig = {
    group,
    groundPivot,
    leanPivot,
    euc,
    rider,
    consolidation,
    resetCrashPose(): void { rider.resetCrashPose(); },

    apply(pose: EucPose): void {
      // The near-solid channel (1.4.0 ride fixes) moves the drawn rig only:
      // up by the tyre's clearance over a step's nose and along the heading
      // off one here, and out of any face the posed body would enter at the
      // end of this call (`facePushFor`). All zero unless `setNearSolids` said
      // otherwise, so every rig nobody tells — and every pose with no step and
      // no face near it — is drawn as before.
      const crashing = pose.crashBlend > 0 || pose.ragdollBlend > 0;
      const along = crashing ? 0 : solidAlong;
      const sin = Math.sin(pose.headingY);
      const cos = Math.cos(pose.headingY);
      group.position.set(
        pose.x + sin * along,
        pose.y + solidLift,
        pose.z + cos * along,
      );
      // The root and camera carry the rider's chosen heading. Wobble belongs
      // to the machine child below: putting it here rotates the rider as one
      // rigid object, which is exactly the Phase 0 defect the owner reported.
      group.rotation.y = pose.headingY;

      // Already in this frame's convention, derived once from the sampled
      // normal in `simulation/EucController.ts`. Applied without a second
      // opinion on the sign, which is precisely how a terrain tilt avoids
      // becoming the next "+X is right" (`docs/LESSONS_LEARNED.md`).
      groundPivot.rotation.x = pose.groundPitch;
      groundPivot.rotation.z = pose.groundRoll;

      // A rotation about +Z takes +Y toward -X, so the sign is inverted to
      // make a positive roll lean toward +X. (+X is the rider's left in this
      // world, so a right turn arrives here as a negative roll and leans the
      // rig toward -X — into the corner. See `data/tuning.ts`.) Positive pitch
      // leans forward toward +Z, which a rotation about +X does directly.
      //
      // **Wobble does not own this shared roll pivot.** Carve remains its only
      // lateral-roll owner. The rapid coupled roll-yaw resonance belongs to
      // `euc.group`, so the tyre and pedals move beneath a rider whose legs can
      // articulate to the moving pedal targets.
      leanPivot.rotation.z = -pose.rollAngle;
      leanPivot.rotation.x = pose.wheelPitch;

      // A real speed wobble couples steering and tilt: yaw left with roll left,
      // then continuously through centre to the other side. Both arrive from
      // one fixed-step phase, so there is no stop/start envelope between axes.
      // Applied to the EUC child only — tyre, shell and pedals — never to the
      // rider root or the camera. A positive pose roll leans toward rider-left;
      // the rendering sign is inverted for the same +Z convention as carve.
      // The crash flourish's spin-out rides the same machine-only yaw (M15):
      // a hard stop sends the riderless wheel pirouetting while the ragdoll
      // flies, and both angles are zero in every other frame of the game.
      // The stumble's yaw joins the wobble's here (M29): the same machine-only
      // axis, the same pedal targets, and nothing on the rider root or the
      // camera. Zero on every sober seat by the controller's arithmetic.
      euc.group.rotation.y = pose.wobbleYaw + pose.styleYaw + pose.wheelCrashSpin;
      // Its bounce lifts the whole machine — tyre included, because the tyre
      // has left the ground — and is likewise zero outside a hard crash.
      euc.group.position.y = pose.wheelCrashPop;

      // The sprung mass — shell, pads, pedals, lights, and the rider standing
      // on them — rides the suspension; the tyre does not, because it is the
      // thing in contact with the ground. The roughness driving this is not
      // drawn anywhere, so what the player sees is the rider working over a
      // surface rather than a wheel floating above one.
      euc.body.position.y = pose.suspensionOffset;

      // **The crash separation** (M6). Three offsets and two rotations, all
      // decided in the controller and applied here without a second opinion —
      // the same contract the ground tilt has followed since M4. There is no
      // second body: the rider is still a child of the lean pivot and simply
      // ends up somewhere else in the wheel's own frame, which is what
      // `docs/PLANS.md` §4.5's "animation-driven, not ragdoll" buys.
      rider.root.position.set(
        pose.crashLateral,
        pose.suspensionOffset - pose.crashDrop,
        pose.crashForward,
      );
      rider.root.rotation.set(pose.crashTumble, 0, pose.crashRoll);

      // **The ragdoll takes the root** (M15). The particles arrive in world
      // space; the rider is a child of the lean pivot, so the pose's own
      // numbers — the ones applied a few lines up — are composed into that
      // pivot's transform and inverted, rather than read back from a scene
      // graph whose matrices are only current after the render. The root's
      // frame is then built from the particles themselves: spine up, hip bar
      // across, their cross forward — and blended over the scripted transform
      // by `ragdollBlend`, so the handover from the riding pose is a short
      // crossfade instead of a snap, and at zero blend this block never runs.
      const rag = clamp01(pose.ragdollBlend);
      stance.ragdollBlend = rag;
      if (rag > 0) {
        // From the drawn root, so a near-solid offset (zero in a crash, by
        // `app/nearSolids.ts`) could never part the body from its particles.
        ragLean.makeRotationY(pose.headingY).setPosition(group.position);
        ragEuler.set(pose.groundPitch, 0, pose.groundRoll);
        ragLean.multiply(ragStage.makeRotationFromEuler(ragEuler));
        ragEuler.set(pose.wheelPitch, 0, -pose.rollAngle);
        ragLean.multiply(ragStage.makeRotationFromEuler(ragEuler));
        ragLean.invert();

        ragLocal(pose, RD_PELVIS, ragPelvis);
        ragLocal(pose, RD_CHEST, ragUp).sub(ragPelvis);
        ragLocal(pose, RD_HIP_L, ragLateral);
        ragLocal(pose, RD_HIP_R, ragOffset);
        ragLateral.sub(ragOffset);
        if (ragUp.lengthSq() < 1e-8) ragUp.set(0, 1, 0);
        ragUp.normalize();
        ragForward.crossVectors(ragLateral, ragUp);
        if (ragForward.lengthSq() < 1e-8) ragForward.set(0, 0, 1);
        ragForward.normalize();
        ragLateral.crossVectors(ragUp, ragForward).normalize();
        ragQuat.setFromRotationMatrix(ragBasis.makeBasis(ragLateral, ragUp, ragForward));
        // The model's pelvis sits `hipHeight` up the root's own +Y, so the
        // root origin hangs that far below the pelvis particle.
        ragOffset.set(0, RIDER.hipHeight, 0).applyQuaternion(ragQuat);
        ragRootPos.copy(ragPelvis).sub(ragOffset);

        rider.root.position.lerp(ragRootPos, rag);
        rider.root.quaternion.slerp(ragQuat, rag);

        // Limb and head targets, re-expressed in the blended root's frame for
        // the stance solve's two-bone chains.
        ragRootInverse.copy(rider.root.quaternion).invert();
        ragLocal(pose, RD_HEAD, stance.ragdollHead)
          .sub(rider.root.position).applyQuaternion(ragRootInverse);
        ragLocal(pose, RD_HAND_L, stance.ragdollHandL)
          .sub(rider.root.position).applyQuaternion(ragRootInverse);
        ragLocal(pose, RD_HAND_R, stance.ragdollHandR)
          .sub(rider.root.position).applyQuaternion(ragRootInverse);
        ragLocal(pose, RD_FOOT_L, stance.ragdollFootL)
          .sub(rider.root.position).applyQuaternion(ragRootInverse);
        ragLocal(pose, RD_FOOT_R, stance.ragdollFootR)
          .sub(rider.root.position).applyQuaternion(ragRootInverse);
        // Remove heading, ground/wheel tilt AND the blended root before the
        // rider removes its two shin joints. Neither pedal nor knee pole can
        // leak into the shared released boot frame.
        ragWorldRootInverse.copy(ragRootInverse)
          .multiply(ragParentInverse.setFromRotationMatrix(ragLean));
        stance.ragdollJointPoles.set(pose.ragdollJointPoles);
        stance.ragdollHeadingY = pose.headingY;
        stance.ragdollRootWorldQuaternion.copy(ragWorldRootInverse).invert();
        stance.ragdollRootWorldPosition.copy(rider.root.position).applyMatrix4(ragStage.copy(ragLean).invert());
        stance.ragdollForwardWorld.copy(ragForward).applyQuaternion(ragBootQuaternion.copy(ragParentInverse).invert());
        // Complete world up for the tiny unequal-bone contact fallback.
        stance.ragdollUp.set(0, 1, 0).applyQuaternion(ragWorldRootInverse);
      }

      // The tyre's own axis already lies along X (see euc.ts), so this is a
      // spin about it rather than a second tilt.
      euc.tyre.rotation.x = pose.wheelSpin;

      // At rest the wheel tips gently toward the pedal-side leg — an EUC
      // cannot stand on its own, and the resting rider props it against their
      // right shin. Applied to the EUC alone, about its own origin (the
      // contact patch), so the standing rider does not inherit it. A positive
      // rotation about +Z takes +Y toward -X, which is the rider's right —
      // the side whose boot stays on the pedal.
      // The riderless wheel lies down on top of that, about the same axis and
      // for the same reason it is applied to the EUC alone: the rider is no
      // longer standing on it.
      euc.group.rotation.z = -(pose.wobbleRoll + pose.styleRoll)
        + RIDER_BLOCKOUT.restWheelLean * pose.restFactor
        - pose.wheelCrashLean;

      // Only the difference, because the rider is already carrying the wheel's
      // deliberate carve lean through the pivot above. Wobble belongs to the
      // EUC child and reaches the rider through the moving pedal targets, not
      // through a pelvis counter-transform.
      //
      // The look-behind adds a small lead-shoulder drop on the same axis: the
      // chest opens toward the left shoulder (`render/rider.ts` owns that yaw)
      // and the shoulder the rider looks over dips as it pulls back. Negative,
      // because a positive rotation about +Z raises the +X (left) side. This
      // joint axis keeps its single owner — the stance solve never writes
      // `pelvis.rotation.z`.
      // `rider.ts` suppresses every other reverse offset during rest and a
      // crash. This axis is owned here, so it has to spend the same effective
      // blend here rather than the raw controller value; otherwise a reverse
      // crash briefly loses the look and squat while keeping one dropped
      // shoulder as the controller's blend eases away.
      const reverseStance = clamp01(pose.reverseBlend)
        * (1 - clamp01(pose.restFactor))
        * (1 - clamp01(pose.crashBlend));
      // The ride style spends two things on this axis (M29), both from the
      // look's `motion` table and both zero on every look but one: the
      // over-lean forgets a share of the counter-roll so he leans *with* the
      // wheel in a carve, and the sway rolls the pelvis into the weave —
      // negative toward +X, the rider's left, which is where a positive sway
      // is turning. The sway channel is already gated by the controller, and
      // the rest and crash blends fade it here as `rider.ts` fades its own.
      const styleSway = clamp01(1 - clamp01(pose.restFactor))
        * (1 - clamp01(pose.crashBlend))
        * Math.max(-1, Math.min(1, pose.styleSway));
      rider.pelvis.rotation.z = (-(pose.riderRoll - pose.rollAngle) * (1 - motion.overLean)
        - reverseStance * RIDER_BLOCKOUT.reverseShoulderRoll
        - styleSway * motion.swayPelvisRoll) * (1 - rag);
      // The rider root rides the sprung mass, the ground does not, so the
      // ground plane sits at minus the suspension offset in the root's frame —
      // which is where the resting boot has to land.
      stance.rollAngle = pose.rollAngle;
      stance.riderPitch = pose.riderPitch;
      // The torso's fore-aft hinge is *handed over* rather than applied here
      // (M8.6). The tuck adds to it and the neck has to give the total back,
      // so `render/rider.ts` owns `pelvis.rotation.x` outright; a rig that
      // wrote it first and a stance solve that added to it afterwards would be
      // two owners of one joint, which is how a tucked rider ends up staring
      // at the tyre the first time somebody reorders these lines.
      stance.torsoPitch = pose.riderPitch - pose.wheelPitch + RIDER_BLOCKOUT.torsoRestPitch;
      stance.turnTwist = pose.riderTurnTwist;
      stance.technicalTurn = pose.technicalTurn;
      // `riderLookYaw` is the intended composed head direction. A gentle turn
      // spends part of it at the torso, so the neck supplies only the rest.
      stance.lookYaw = pose.riderLookYaw - pose.riderTurnTwist;
      stance.reverse = pose.reverseBlend;
      stance.restFactor = pose.restFactor;
      // A lifted rig (a tyre on a step's nose) still stands its planted boot
      // on the ground the contact patch is on, which is below the drawn root.
      stance.groundY = -pose.suspensionOffset - solidLift;
      stance.crouch = pose.crouch;
      stance.tuck = pose.tuck;
      stance.attack = pose.attack;
      stance.carveStance = pose.carveStance;
      stance.airBlend = pose.airBlend;
      // "Falling" from the pose rather than from a velocity the rig does not
      // have: the rider is above the ground and the gap is closing, which is
      // what the head should be reacting to. Interpolation between two steps
      // cannot make this flicker, because both endpoints agree about which
      // side of the apex the flight is on for all but one frame.
      stance.falling = pose.airHeight > 0 && pose.airHeight < lastAirHeight;
      lastAirHeight = pose.airHeight;
      stance.pedalStrike = pose.pedalStrike;
      stance.wobbleFootCorrection = pose.wobbleFootCorrection;
      // The pedal targets follow the stumble as they follow the wobble (M29):
      // one yaw, summed here, so the boots ride the shimmying pedals through
      // articulated knees instead of the rider root inheriting it.
      stance.wobbleYaw = pose.wobbleYaw + pose.styleYaw;
      // Hand over the transform the pedals actually inherit, after every roll
      // owner has composed it. Passing only `pose.wobbleRoll` left the stopped
      // rider solving their right boot to an untilted pedal while the EUC's
      // rest lean moved the real one outboard and down.
      stance.pedalRoll = euc.group.rotation.z;
      // Handed over rather than derived (M13). The stance solve phases the
      // boots against the wheel's swing and brackets the bracing pose against
      // the `wobbling` threshold; both remaps are the controller's, which is
      // the only place that knows the tuning the step actually ran with.
      stance.wobbleSway = pose.wobbleSway;
      // The stumble borrows the bracing stance (M29): its envelope is handed
      // over as a fight the way a real wobble's is, so the arms and hips
      // answer it the way they answer a wobble — with none of a wobble's
      // energy, which is why `pose.wobble` stays at zero through it.
      stance.wobbleFight = Math.max(pose.wobbleFight, pose.styleStumble);
      stance.styleSway = pose.styleSway;
      stance.crash = pose.crashBlend;
      // The one-foot air pose (M36, §36.5) — recorded by `setTrickPose` and
      // spent here, in the same place and for the same reason the swing is:
      // the stance solve is what poses the leg, and this is the last moment
      // before it runs. Nothing on the pose carries it, so a rig nobody calls
      // `setTrickPose` on — the cop's, every ghost's — keeps both boots on
      // their pedals through this line without a branch.
      stance.oneFoot = trickOneFoot;
      stance.oneFootSide = trickSide;
      // Arms ease out of the balance carriage when slow (owner, 2026-10-10);
      // the pose's own speed, so the cop and every ghost relax the same way.
      stance.armEase = armEaseForSpeed(pose.speed);
      // The carry from *this* frame's swing state (`applySwing` ran first),
      // before the solve — the paddle's own visibility is only set below.
      carry = swingHead !== null ? 1 : Math.max(0, carry - 1 / 12);
      stance.carry = carry;
      // The two call-counted channels (`settling`): a carry still on its way
      // down moves again next call, and so does a set falling flag, because a
      // repeat at the same air height is not falling.
      settlingAfterApply = (swingHead === null && carry > 0) || stance.falling;
      rider.applyStanceReaction(stance);
      // The body as posed, out of every face (1.4.0, the owner's second ride).
      // After the stance solve, because what is measured is this frame's
      // body; before the paddle, which aims from the grip's world matrix.
      // A crash or a tumble is drawn exactly where the pose says: the ragdoll
      // frame above was built from the unpushed root.
      if (crashing) {
        push[0] = 0;
        push[1] = 0;
      } else {
        facePushFor(pose);
        if (push[0] !== 0 || push[1] !== 0) {
          group.position.x += push[0];
          group.position.z += push[1];
          group.updateMatrixWorld(true);
        }
      }
      // Last, because the paddle aims itself from the grip's world matrix and
      // the line above is what just moved the grip. The ground height is the
      // root's own frame's ground (`stance.groundY`) put back into world
      // terms, so the carried tip can be kept out of the grass.
      paddle.aim(swingHead, swingBlend, pose.y - pose.suspensionOffset);
    },

    applySwing(headWorld: THREE.Vector3 | null, angle: number, blend: number): void {
      // **Recorded here and consumed inside `apply`, in that order.** The arm
      // is posed from `stance` and the paddle is aimed from the grip's *world*
      // matrix, so the two want opposite sides of the stance solve: setting the
      // stance after `apply` would leave the arm a frame behind the swing, and
      // aiming before it would point the paddle at where the hand used to be.
      // `apply` does both in the right order; this only says what to do.
      stance.swingAngle = angle;
      stance.swingBlend = headWorld === null ? 0 : blend;
      swingBlend = stance.swingBlend;
      if (headWorld === null) {
        swingHead = null;
        return;
      }
      swingHeadWorld.copy(headWorld);
      swingHead = swingHeadWorld;
    },

    get settling(): boolean {
      return settlingAfterApply;
    },

    applyStatus(alert: number, seconds: number, boot = 0): void {
      euc.setStatus(alert, seconds, boot);
    },

    setTrickPose(amount: number, side: number): void {
      // **Recorded here and consumed inside `apply`**, the order `applySwing`
      // documents: the leg is posed from `stance`, and setting the stance
      // after `apply` would leave the foot a frame behind the gesture.
      //
      // Clamped rather than trusted, and the side reduced to its sign, so a
      // caller cannot put the ankle target somewhere the leg cannot reach:
      // this is the only line between whatever drives the pose and the IK.
      trickOneFoot = clamp01(amount);
      trickSide = trickOneFoot > 0 ? Math.sign(side) : 0;
    },

    setNearSolids(lift: number, faces: ArrayLike<number>, along = 0, seconds = 0, normals?: ArrayLike<number>): void {
      solidLift = Number.isFinite(lift) && lift > 0 ? lift : 0;
      solidAlong = Number.isFinite(along) ? along : 0;
      solidSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
      solidHasNormals = normals !== undefined;
      for (let entry = 0; entry < worldNormals.length; entry += 1) {
        const value = normals?.[entry];
        worldNormals[entry] = value === undefined || !Number.isFinite(value) ? 0 : value;
      }
      solidAny = false;
      for (let entry = 0; entry < solidFaces.length; entry += 1) {
        const face = faces[entry];
        const value = face === undefined || Number.isNaN(face) ? Number.POSITIVE_INFINITY : face;
        solidFaces[entry] = value;
        if (value < Number.POSITIVE_INFINITY) solidAny = true;
      }
    },

    get nearPush(): readonly [number, number] {
      return push;
    },

    dispose(): void {
      paddle.dispose();
      euc.dispose();
      rider.dispose();
      // The merged buffers are this rig's own; every member's original stays
      // the factory's and went with the two calls above.
      consolidation?.dispose();
      group.removeFromParent();
    },
  };
  return self;
}

/**
 * Where the outer edge of one pedal is in the world, for a given pose.
 *
 * Computed analytically rather than read out of the scene graph, and that is
 * deliberate: the sparks are emitted from the **fixed step**, so a frozen
 * `advance(n)` produces the same particle field every run, and the scene
 * graph's matrices are only up to date after the render frame. Reading them in
 * `step` would give last frame's transform, which is exactly the kind of
 * one-frame lie that reads as a bug in a screenshot and cannot be explained.
 *
 * The chain is the same one `apply` builds — contact patch, heading, lean —
 * with the ground pivot's fraction of a degree left out, because a spark is
 * being spawned to within a couple of centimetres of a contact that is itself
 * a blockout approximation.
 *
 * `side` is +1 for the rider's LEFT pedal (+X) and -1 for their right.
 */
export function pedalEdgeWorld(
  pose: EucPose,
  side: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const lateral = side * (WHEEL.pedalSpan / 2);
  const height = WHEEL.pedalHeight + pose.suspensionOffset;

  // The lean pivot rotates by -rollAngle about +Z, so a point at (lateral,
  // height) in the wheel's own frame lands here. Positive roll leans the rig
  // toward +X, which drops the +X pedal — hence the signs.
  const cos = Math.cos(pose.rollAngle);
  const sin = Math.sin(pose.rollAngle);
  const localX = lateral * cos + height * sin;
  const localY = height * cos - lateral * sin;

  // Then the heading, about +Y: local +X maps to (cos h, -sin h).
  const headingCos = Math.cos(pose.headingY);
  const headingSin = Math.sin(pose.headingY);
  return out.set(
    pose.x + localX * headingCos,
    pose.y + localY,
    pose.z - localX * headingSin,
  );
}
