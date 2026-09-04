/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, CHALLENGE, EUC, WHEEL } from '../data/tuning.ts';
import { approach } from '../shared/maths.ts';
import { createPose, type EucPose } from '../simulation/EucController.ts';
import type { GhostSample } from '../simulation/ghost.ts';
import { riderRollFor, settleStep } from '../simulation/riderLean.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';
import { STANDARD_MACHINE_LOOK, type MachineLook } from './machineLook.ts';
import { COOL_RIDER_LOOK, type RiderLook } from './riderLook.ts';

/**
 * The ghost — a translucent Cool Rider replaying a recorded run (M10).
 *
 * **A full rider, not a marker**, and that was the owner's decision recorded in
 * `docs/PLANS.md`: the thing worth racing is a rider taking a *line*, and a
 * floating dot cannot show a carve, a tuck, or a hop. A blob on the road tells
 * the player where they were slower; a rider tells them why.
 *
 * Three rules shape everything below, and all three are the same rule seen from
 * different sides — **the ghost is a recording, not an object in the world.**
 *
 * **1. One shared material, and it is unlit.** `BLOCKOUT_COLOURS.ghost` is
 * deliberately not a tinted Cool Rider (read the note beside it in
 * `data/tuning.ts`): a see-through copy of the player's own colours reads as a
 * rendering fault, where a single cold body reads as a replay. Unlit is the
 * other half of that — a lit ghost shades exactly like the real rider and
 * invites the same misreading, and it would also go dark under a tree, which
 * is precisely where a racing reference has to stay legible. Emissive and
 * unlit levels are members of the coupled visual system (`AGENTS.md`
 * invariant 6, `DESIGN.md` §6), which is why this file and the gates were one
 * job rather than two.
 *
 * **2. It casts no shadow and receives none.** A second contact shadow under a
 * rider who is not there reads as a bug, not as a ghost. It also buys back the
 * whole shadow pass for the second rig, which is most of how it fits the
 * budget.
 *
 * **3. Nothing may pick it.** The chase camera's occlusion probe already cannot
 * see it — that probe is `TerrainSampler.raycast`, which reads the plan and not
 * the scene graph (`render/chaseCamera.ts`) — but every ghost mesh also gets an
 * empty `raycast`, so a future scene-graph picker cannot pull the camera in
 * around a recording either.
 *
 * ## Alpha, and why `depthWrite` is off
 *
 * A rider is twenty-odd overlapping meshes. With depth writing **on**, whether
 * a pixel ends up one layer of alpha or two depends on the order three happens
 * to sort those meshes in — so the ghost's density would change as the camera
 * moved, which is popping. With it **off** every layer blends, and because
 * every mesh carries the *same colour*, the composite is order-independent:
 * the result depends only on how many layers of ghost are in front of the
 * pixel, which is a property of the silhouette and not of the camera. The
 * ghost is therefore denser through its torso than through an arm, which is
 * what a translucent solid actually looks like, and it never flickers.
 *
 * ## What the second rig costs, and what was dropped
 *
 * A riding rig is 34 meshes, and the frame's ceiling is 150 draw calls against
 * a measured 102 at M9 (`DESIGN.md` §8). A whole second rig would spend a
 * third of the remaining headroom on a recording.
 *
 * **The eleven meshes the real rig does not bother casting a shadow from are
 * hidden here**, and that is a rule rather than a list: a part its own authors
 * judged too small or too flat to cast at chase distance is a part that, in one
 * flat colour, is not merely small but *invisible* — every one of them (the
 * shell's accent strips, the head and tail lamps, the status light, the knee
 * pads, the chest chevrons, the back panel, the visor) exists to be a different
 * colour from the mesh it sits on, and the ghost has no second colour. Nothing
 * with a silhouette is dropped. Reading `castShadow` rather than a hard-coded
 * list also means the rule stays correct the next time somebody adds a
 * reflective panel to Cool Rider.
 */

export interface GhostRider {
  /** Root. Added to the scene by `render/Renderer.ts`, hidden by default. */
  readonly group: THREE.Group;
  /** Colour-pass draw calls while visible. Zero while hidden. */
  readonly drawCalls: number;
  /** Triangles drawn while visible. */
  readonly triangles: number;
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /**
   * Pose the rig from one interpolated recorded sample.
   *
   * Called from the render frame, because the sample is already interpolated —
   * there is no second interpolation to do and no fixed-step state to advance
   * except the wheel spin, which is integrated against the *recording's* own
   * clock (`sample.t`) rather than against wall time. So `advance(n)` reaches
   * the same ghost every run for the same reason `euc.ts`'s status light does.
   */
  apply(sample: GhostSample): void;
  dispose(): void;
}

/**
 * The same look, built at half the sections — M23 Phase A1d.
 *
 * **A ghost is an outline, and an outline does not need a character's
 * density.** The rig it copies is drawn in one flat translucent colour with no
 * lighting to break over its facets, so a section that earns its triangles on
 * the player's own rider — a rounder waist, a hand that reads as a hand — buys
 * literally nothing here. Maribel's A1d density pass is what made that
 * concrete: it took her ghost from under budget to 16,968 triangles against a
 * twelve-thousand ceiling, on a mesh nobody can see the shape of.
 *
 * Halving is deliberately blunt. It cannot change *which* meshes exist, so the
 * ghost's silhouette, its draw calls and every name in it are untouched, and
 * the assertions in `ghostRider.test.ts` that compare the ghost to the rig
 * part for part still compare the same parts. A look with no density table
 * comes back unchanged, which is every rider before her.
 */
function ghostDensity(look: RiderLook): RiderLook {
  if (look.density === undefined) return look;
  const half = (value: number | undefined): number | undefined => (
    value === undefined ? undefined : Math.max(6, Math.round(value / 2))
  );
  return {
    ...look,
    density: {
      limb: half(look.density.limb),
      torso: half(look.density.torso),
      head: half(look.density.head),
      boot: half(look.density.boot),
      hand: half(look.density.hand),
      neck: half(look.density.neck),
    },
  };
}

/**
 * Which recorded numbers reach the rig, and which are invented.
 *
 * A `GhostSample` is eight numbers and an `EucPose` is thirty-odd, so most of
 * the pose is reconstructed or neutral. The distinction matters enough to state
 * once here and again at each site:
 *
 * | Pose field | Source |
 * |---|---|
 * | `x`, `y`, `z`, `headingY`, `rollAngle`, `speed`, `crouch` | **recorded** |
 * | `groundY` | **recorded** |
 * | `riderRoll` | derived — the controller's own lean schedule, from `rollAngle` and `speed` |
 * | `wheelSpin` | derived — integrated from `speed` against `sample.t` |
 * | `airHeight`, `airBlend` | derived — from `y - groundY` |
 * | `tuck` | derived — a grounded crouch, with a named imperfection |
 * | everything else | neutral |
 *
 * Nothing here guesses at a quantity the recording could have carried and did
 * not. `riderPitch` in particular stays at zero: the drive/brake lean comes
 * from acceleration, the recording carries speed and not acceleration, and
 * numerically differentiating an *interpolated* speed at frame rate produces
 * noise — a ghost pumping back and forth from differentiation noise is the
 * annoyance rule (`AGENTS.md`), and a neutral riding stance is not.
 */
export function createGhostRider(
  look: RiderLook = COOL_RIDER_LOOK,
  machine: MachineLook = STANDARD_MACHINE_LOOK,
): GhostRider {
  const group = new THREE.Group();
  group.name = 'ghost-rider';
  // Hidden until there is a record and a run. Free ride must cost nothing.
  group.visible = false;

  // The machine is forwarded for the silhouette: the ghost draws only the
  // rig's shadow-casting parts, and Red Rider's saddle is merged into the
  // shell — a ghost of him on a saddleless wheel would be a different outline
  // than the rider it replays.
  const rig: RidingRig = createRidingRig(ghostDensity(look), machine);
  group.add(rig.group);

  // **Every name in the ghost's copy of the rig is prefixed, and this is a
  // correctness fix rather than tidiness.**
  //
  // The ghost is built by the same factory as the player's rig, so it arrived
  // carrying the same names on every joint — two `riding-rig`s, two
  // `rider-pelvis`s, two `euc-tyre`s in one scene. `getObjectByName` walks the
  // graph depth-first and returns whichever it reaches first, so the whole QA
  // harness silently began measuring the ghost's frozen pose instead of the
  // player's: twenty-nine browser scenarios across M2 through M9 failed at
  // once, none of them in a file this milestone touched, and every one of them
  // reporting a rider that would not move.
  //
  // Prefixing here rather than parameterising `createRidingRig` keeps the
  // player's rig — which every existing name-based lookup in the project
  // depends on — exactly as it was, and makes the ghost impossible to mistake
  // for it by construction.
  rig.group.traverse((object) => {
    if (object.name !== '') object.name = `ghost-${object.name}`;
  });

  // `Color(hex)` already decodes sRGB to linear, so there is no
  // `convertSRGBToLinear()` here — that second decode is the trap `DESIGN.md`
  // §6b records, and it has caught this project five times.
  const material = new THREE.MeshBasicMaterial({
    color: BLOCKOUT_COLOURS.ghost,
    transparent: true,
    opacity: CHALLENGE.ghostOpacity,
    // See the alpha note in the file comment. Off, so the composite is
    // order-independent and the ghost cannot pop as the camera swings.
    depthWrite: false,
    // On, so the world still occludes it: a ghost visible through a building
    // is a rendering fault, not a replay.
    depthTest: true,
    // Judged in the same frame and under the same haze as everything else.
    fog: true,
  });

  /** Nothing may pick a recording. See rule 3 in the file comment. */
  const unpickable = (): void => {};

  let drawCalls = 0;
  let triangles = 0;

  rig.group.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh !== true) return;
    const mesh = object as THREE.Mesh;

    // Read `castShadow` *before* clearing it — it is the rule that decides
    // which parts the ghost draws at all. See the file comment.
    const carriesSilhouette = mesh.castShadow;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = unpickable;
    mesh.material = material;

    if (!carriesSilhouette) {
      mesh.visible = false;
      return;
    }

    drawCalls += 1;
    const geometry = mesh.geometry;
    const index = geometry.getIndex();
    triangles += (index !== null ? index.count : geometry.getAttribute('position').count) / 3;
  });

  // Reused every frame. The real rig's pose is preallocated for the same
  // reason (`render/rider.ts`): a fresh pose object per frame is exactly the
  // garbage this half of the codebase is written to avoid.
  const pose: EucPose = createPose();

  /** The recording's own clock at the previous `apply`, or null before one. */
  let lastSampleTime: number | null = null;
  let wheelSpin = 0;
  let airBlend = 0;
  /** The previous sample's wheel roll, for the settle's rate (M30 Phase 3b). */
  let lastSampleRoll = 0;
  /** The lean schedule's settle, integrated over the recording's own clock. */
  let leanSettle = 1;

  const wheelRadius = WHEEL.tyreDiameter / 2;

  return {
    group,
    get drawCalls(): number {
      return drawCalls;
    },
    get triangles(): number {
      return triangles;
    },
    get visible(): boolean {
      return group.visible;
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    apply(sample: GhostSample): void {
      // A run that restarts hands back a smaller `t`. Rewinding the integrated
      // state here rather than exposing a `reset()` keeps the restart correct
      // however the caller reaches it — including a player who hits `R` in the
      // same frame the ghost was placed.
      const previous = lastSampleTime;
      const dt = previous === null || sample.t < previous ? 0 : sample.t - previous;
      if (previous === null || sample.t < previous) {
        wheelSpin = 0;
        airBlend = 0;
        // The settle is rewound with them: a restarted ghost is placed on a
        // held bank, not mid-flick (M30 Phase 3b).
        leanSettle = 1;
        lastSampleRoll = sample.rollAngle;
      }
      lastSampleTime = sample.t;

      // -- Recorded, straight through -------------------------------------
      pose.x = sample.x;
      pose.y = sample.y;
      pose.z = sample.z;
      pose.headingY = sample.headingY;
      pose.rollAngle = sample.rollAngle;
      pose.speed = sample.speed;
      pose.groundY = sample.groundY;
      pose.crouch = sample.crouch;

      // -- Derived ----------------------------------------------------------
      // The upper body's share of the lean, through the *same* schedule
      // `EucController.writePose` uses (M30 Phase 3, `simulation/riderLean.ts`).
      // Calling the shared function rather than copying its arithmetic is what
      // keeps the ghost and the player from drifting apart when the *table*
      // changes. The frozen table, deliberately: a ghost is a replay of the
      // shipped wheel, and the F4 panel is a diagnostic the ghost has never
      // followed (it did not follow `riderUpperBodyRollFactor` before M30
      // either) — with `EUC.carveLeanShareTop` slid to 0.5 the player's torso
      // sits 18° off the ghost's in a grip-limit corner, which is the panel
      // showing on the one rider it reaches.
      //
      // Two arguments are not recorded and are honest substitutions rather
      // than guesses (q116, and `DESIGN.md`'s rule that a neutral pose beats
      // an invented one):
      //
      //   - The **force lean** is given the recorded `rollAngle`. A recording
      //     carries the wheel's roll, not the cornering force, and **from M30
      //     Phase 2 those are different numbers**: the bank saturates at
      //     `atan(maxLateralG)` and the rider carries the rest, so a ghost
      //     replaying a saturated corner leans as far as the machine and no
      //     further. At full lock on a `?mph=65` build — the deepest corner
      //     the game can record — the player's torso is at `atan(1.05)`
      //     = 46.4° and the ghost's at `atan(0.75)` = 36.9°: **9.5° less**,
      //     and only where the corner is at the grip limit. Below it the two
      //     are equal to the bit and the derivation adds nothing of its own.
      //     **Left as it is, per q116**: closing it means a ninth recorded
      //     field on every ghost track for a pose the player is not looking
      //     at, and `DESIGN.md`'s rule is that a neutral pose beats an
      //     invented one. What remains beside it is the recording's own: 20 Hz
      //     samples and `ghostAngleStep`'s quantisation put the ghost's torso
      //     within about 2.3° of the player's over an ordinary ride (M30's QA
      //     measured it), a gap the torso now shows about five times larger
      //     than it did at a 0.18 share because it takes the whole of a
      //     recorded roll instead of a fifth.
      //   - `technicalTurn` stays **neutral**, exactly as it was before M30:
      //     the recording has never carried it, and above `carveLeanSpeed` —
      //     which is `technicalTurnFadeSpeed` — the technique has faded out
      //     anyway, so it can only matter in the slow band it always did.
      //
      // **And the settle, from M30 Phase 3b**: the same `settleStep` the
      // controller runs, integrated over the sample's own clock rather than
      // the simulation's, exactly as `wheelSpin` and `airBlend` above are.
      // The rate is taken from consecutive samples' `rollAngle`, which is the
      // only rate a recording can offer: at 20 Hz a flick is three or four
      // samples wide and `ghostAngleStep`'s 0.005 rad quantisation is worth
      // 0.1 rad/s of jitter — a fifth of `carveLeanHoldRate`, so a ghost
      // holding a bank still reads as holding it. A ghost therefore
      // transitions like the player, one sample at a time.
      //
      // **Close across frame rates, not identical — and the difference is
      // named rather than claimed away** (M30 Phase 3b QA, correcting this
      // block's first draft). `Game.updateGhost` calls
      // `GhostPlayer.sample(elapsed)` once per *rendered* frame, and that
      // method writes `out.t = runSeconds` — so `sample.t` is the display
      // clock, not the recorder's, and `sample.rollAngle` is a lerp between
      // two recorded knots. A frame that straddles a knot therefore reads the
      // *average* slope across it instead of either side's, and the target
      // that slope feeds is clamped at both ends and non-linear between them,
      // so two frame rates enter the ramp from different heights and a linear
      // ramp cannot close the gap again. Measured over a recorded flick:
      // worst |settle(hz) − settle(20 Hz)| **0.294**, at 90 Hz; worst torso
      // roll between a 60 Hz and a 144 Hz replay of one track **4.01°**, on
      // six frames out of 420. A **held** bank is untouched — the settle is
      // exactly 1 at every rate, which is what the baselines and the capture
      // sets depend on — so only transition frames move, by a few degrees,
      // behind a 42% alpha. Stepping the integration knot by knot would
      // remove it and is deliberately not done: it would buy those degrees
      // with a second clock and a second code path beside the controller's,
      // on the one rider nobody is riding.
      const rollRate = dt > 0 ? (sample.rollAngle - lastSampleRoll) / dt : 0;
      leanSettle = settleStep(leanSettle, rollRate, dt, EUC);
      lastSampleRoll = sample.rollAngle;
      pose.riderRoll = riderRollFor(
        sample.rollAngle,
        sample.rollAngle,
        0,
        sample.speed,
        EUC,
        leanSettle,
      );

      // The tyre turns by the distance travelled over its radius, which is
      // what the controller integrates from its resolved displacement. Against
      // the *recording's* clock, so a frozen `advance(n)` reaches the same
      // spin, and signed, so a ghost rolling backwards rolls its wheel
      // backwards. Unwrapped on purpose: `wheelSpin` is applied as a rotation
      // and a wrapped one would snap once a revolution.
      wheelSpin += (sample.speed * dt) / wheelRadius;
      pose.wheelSpin = wheelSpin;

      // Airborne without a boolean, which is exactly why `groundY` is
      // recorded. The threshold is one position quantisation step, because
      // `y` and `groundY` are quantised independently and a grounded rider can
      // therefore show a centimetre of gap that is arithmetic rather than air.
      const airHeight = Math.max(0, sample.y - sample.groundY);
      const airborne = airHeight > CHALLENGE.ghostPositionStep;
      pose.airHeight = airHeight;
      // Smoothed at both edges with the controller's own response, so the
      // ghost's arms open into a flight rather than snapping open at the lip.
      airBlend = approach(airBlend, airborne ? 1 : 0, EUC.crouchResponseSeconds, Infinity, dt);
      pose.airBlend = airBlend;

      // **Invented, and the imperfection is named.** The recording carries one
      // crouch scalar. In the controller a crouch held with the wheel on the
      // ground is what produces the whole-body tuck — hips down, torso folded
      // over the wheel, arms back, head up — and that silhouette is the single
      // most useful thing a ghost can show a player about a fast line, so it
      // is worth reconstructing. The cost is that a landing absorb is also a
      // grounded crouch, so the ghost tucks for the fifth of a second it takes
      // to soak up a landing. That is a wrong pose, it is brief, it is behind
      // a 42% alpha, and the alternative is a ghost that never tucks at all.
      pose.tuck = airborne ? 0 : sample.crouch;

      // -- Neutral ----------------------------------------------------------
      // Everything below is a quantity the recording does not carry. They are
      // left at the values `createPose()` gives them and listed here so a
      // reader can see the set is deliberate rather than forgotten:
      //
      //   riderPitch, wheelPitch  — need acceleration; see the table above.
      //   riderLookYaw            — driven by steering *intent* in the
      //                             controller, which no recording sees.
      //   groundPitch, groundRoll — the rig aligns to gravity rather than to
      //                             the surface (`DESIGN.md` §7b), so these
      //                             are zero and a quarter of the side slope
      //                             respectively; zero is nearly right and the
      //                             normal is not recorded.
      //   suspensionOffset        — a few centimetres of travel, invisible
      //                             through a translucent body.
      //   restFactor              — the clock starts at the start gate, so a
      //                             ghost is never stopped long enough to put
      //                             a foot down.
      //   pedalStrike, wobble*, alert, crash*, tiltBack, recoverBlend —
      //                             a ghost is a line, not an incident. A
      //                             translucent rider crashing beside the
      //                             player would read as the player crashing.
      //
      // `applyStatus` is deliberately never called: the status light is one of
      // the eleven hidden meshes, and a recording has no battery.
      rig.apply(pose);
    },

    dispose(): void {
      // The rig owns and disposes the materials it built; overwriting
      // `mesh.material` above did not detach them from its own tracking
      // arrays, so this is exhaustive rather than best-effort.
      rig.dispose();
      material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}
