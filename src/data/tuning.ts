/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';
import { MATERIALS, SURFACES } from './surfaces.ts';

/**
 * Central tuning configuration.
 *
 * Every constant that shapes how the game looks, feels, or performs lives
 * here — grouped, documented, and stated with units. Controller and renderer
 * files must not carry unexplained numeric literals (AGENTS.md invariant 4).
 *
 * **One table is not here: the per-surface one.** `data/surfaces.ts` owns
 * rolling resistance, grip, roughness, particles, tyre voices, and materials,
 * because `docs/PLANS.md` §4.3 names that file and because those values are
 * indexed by surface rather than global. It is re-exported into the frozen root
 * at the bottom of this file so the tuning panel can still address one by path.
 *
 * WORLD CONVENTIONS, applied everywhere without exception:
 *   - Units are metres, seconds, radians, and kilograms.
 *   - +Y is up.
 *   - +Z is forward (the direction the rider faces at rest).
 *   - **+X is the rider's LEFT. Their right is -X.**
 *   - **A positive yaw about +Y turns LEFT. Steering right is negative yaw.**
 *
 * Right-handed, so `right = forward x up`. At rest that is
 * `(0,0,1) x (0,1,0) = (-1,0,0)`.
 *
 * **Corrected at M2, and worth reading before deriving anything from it.**
 * This block previously said "+X is right, right-handed: right = up x
 * forward". Those two claims cannot both hold. `up x forward` is the
 * *left*-handed (Unity, DirectX) identity; three.js is right-handed, and in a
 * right-handed frame with +Y up and +Z forward, +X necessarily lands on the
 * rider's left. The consequence was not academic: steering right carved left
 * on screen, and the rider leaned out of every corner instead of into it.
 *
 * Derive facings and steering signs from the two axis facts above rather than
 * eyeballing which way looks correct — and when in doubt, check it the way the
 * error was actually found: project a point on the rider's right to screen
 * space and confirm it lands on the right. `tests/m2.spec.ts` does exactly
 * that, and it is the only test that can.
 *
 * COLOUR AUTHORING: hex values below are sRGB and three.js decodes them to
 * linear before lighting. "6% darker" in sRGB is not 6% darker in linear —
 * 0.86 sRGB is about 0.70 linear. Pick the darkening you want in linear terms
 * and raise it to the power 1/2.2 to get the hex value. Values that look
 * almost white in a colour picker are often the correct ones.
 */

/**
 * Fictional suspension EUC, 18-inch class.
 *
 * Dimensions are chosen to sit in the real range for a suspension trail wheel
 * so that rider proportions, pedal clearance, curb heights, and camera framing
 * are all judged against something honest. They are original: no commercial
 * product's shell geometry or proportions are reproduced.
 */
export const WHEEL = {
  /** Outer diameter of the tyre, including tread. 18in rim with a fat tyre. */
  tyreDiameter: 0.50,
  /** Tyre section width. Roughly a 3in trail tyre. */
  tyreWidth: 0.075,

  /** Ground to the top of the shell, with the suspension at rest. */
  shellHeight: 0.62,
  /** Widest point of the shell body, excluding pedals. */
  shellWidth: 0.22,
  /** Fore-aft length of the shell. */
  shellLength: 0.52,
  /**
   * How much of the shell's height above the axle is the rounded top cap,
   * 0 being a hard-cornered box. The shouldered silhouette is most of what
   * makes the blockout read as an EUC rather than as a crate.
   */
  shellCapFraction: 0.42,

  /** Ground to the pedal tread, suspension at rest. Sets pedal clearance. */
  pedalHeight: 0.16,
  /** Outer edge to outer edge across both pedals. */
  pedalSpan: 0.52,
  /** Fore-aft length of one pedal. */
  pedalLength: 0.26,
  /** Thickness of the pedal plate. */
  pedalThickness: 0.022,

  /** Leg-contact pad block, per side. */
  padHeight: 0.20,
  padLength: 0.30,
  padThickness: 0.035,
  /** Height of the pad's centre above the ground. */
  padCentreHeight: 0.44,

  /** Suspension travel available. Cosmetic at M0; used from M4. */
  suspensionTravel: 0.085,
} as const;

/**
 * Rider scale reference. The placeholder and final riders are both built to
 * this height so that camera framing tuned at M3 stays valid.
 */
export const RIDER = {
  /** Standing height, helmet included. */
  height: 1.75,
  /** Ground to hip joint when riding, knees softly bent. */
  hipHeight: 0.92,
} as const;

/**
 * Placeholder rider proportions, in metres.
 *
 * A jointed figure of primitives with the correct joint hierarchy, built to
 * RIDER.height so the silhouette judged at M2 and M3 is the silhouette that
 * ships (docs/PLANS.md 7.2). Deliberately and visibly temporary: replacing it
 * with Cool Rider later is a mesh swap onto the same joints, not a rewrite.
 *
 * The riding stance comes from the reference set, which is consistent across
 * five years of photographs: upright and relaxed, feet flat and roughly
 * parallel on the pedals, knees softly bent, arms low and loose.
 */
export const RIDER_BLOCKOUT = {
  /** Ankle joint height above the pedal tread. */
  ankleAbovePedal: 0.06,
  /**
   * Ankle to knee, and knee to hip.
   *
   * Slightly shorter than a 1.75 m person's real segments, and deliberately.
   * `RIDER.hipHeight` is 0.92 m from the ground and the ankle sits at 0.22 m
   * on the pedal, leaving 0.70 m of span. Anatomically correct segments
   * totalling 0.84 m have to fold 0.25 m of knee to cover that, which renders
   * as a deep squat rather than as the upright, relaxed stance every riding
   * photograph in the reference set shows. Hip height is the constant the
   * camera gets tuned against at M3, so the legs give, not the hip.
   */
  shinLength: 0.38,
  thighLength: 0.40,
  /** Half the distance between the two feet. Matches the pedal centres. */
  stanceHalfWidth: 0.185,

  legThickness: 0.115,
  bootLength: 0.24,
  bootHeight: 0.075,

  /** Hip to the base of the neck. */
  torsoLength: 0.50,
  /** Shoulder to shoulder. The torso is an ellipse of this width by its depth. */
  torsoWidth: 0.34,
  torsoDepth: 0.27,
  /** Constant forward tilt of the torso even at rest. Nobody rides bolt upright. */
  torsoRestPitch: 0.10,

  // -- Hair that hangs (M23) ---------------------------------------------
  //
  // **The owner's ride: "when going all the way forward it sinks inside the
  // body. Same when turning."** Maribel's hair hangs off the neck joint, so
  // every degree the torso hinges forward was a degree the hair hinged *into*
  // her back, and every degree the head turned swept the mass through the
  // shoulder on that side. `RiderExtra.sways` puts a pivot between the joint
  // and the mesh; these four numbers are what that pivot spends.
  //
  // **The pitch term gives back the HEAD's rotation, not the torso's**, and
  // which of the two it is was the whole bug. The head stabilises: it cranes
  // *up* as the rider folds down, so the neck joint rotates backwards by more
  // than half a radian in a deep lean — and anything hanging from that joint
  // swings the other way, forward, straight through her chest. Measured at a
  // 0.70 lean it put the mass 133 mm inside the torso.
  //
  // Draping over a back is not the same as hanging under gravity, either. A
  // rider folded forward has hair lying *along* their back, which is tilted;
  // hair pinned to world-vertical would pass through it. So the rest position
  // is held in the torso's own frame — 1.0, exactly cancelling the head — and
  // the wind is a separate, smaller term that lifts the mass *off* the back
  // as the fold deepens, which is the direction that also cannot penetrate.
  /** How much of the head's own pitch the hair refuses to inherit, 0..1. */
  hairFollowPitch: 1,
  /** Ceiling on that, radians. The head's stabiliser cannot exceed it. */
  hairFollowPitchMax: 0.85,
  /** How far the fold trails the mass back off the shoulders, per radian. */
  hairTrailPitch: 0.26,
  /**
   * How much of the head's yaw the hair *lags* by, 0..1.
   *
   * A lag rather than a give-back, because full compensation loses the one
   * thing the owner liked: *"i like the behavior of how it moves away and
   * reveals the logo while riding... that's cool"*. Measured against the
   * torso across the whole stance envelope, the mass sits deepest when the
   * head turns toward her left and sweeps the fall across her spine; at 0.34
   * that reached 36 mm inside her, at 0.52 it reaches 24 mm — which is the
   * depth the hair already rests at, so no turn is worse than standing still.
   * Above that it only costs movement.
   */
  hairFollowYaw: 0.52,
  /**
   * How far the mass may swing around her, radians — the shoulder's own stop.
   *
   * A lag is a fraction, and a fraction of the look-behind is still enormous:
   * riding backwards turns the head 1.5 rad and half of that swept the whole
   * fall across her spine and into the far shoulder (76 mm inside). Real hair
   * does not wrap around a neck when someone looks over their shoulder — it
   * stays on the back, because the back is in the way. This is that stop.
   */
  hairYawMax: 0.30,
  // **There is no roll term, and that is a measurement rather than an
  // omission.** Hanging the mass out of a corner is what gravity would do and
  // it looks right in a still; across the envelope it was also the single
  // largest source of penetration, because a fall swung sideways at chest
  // height goes around her ribs rather than past them (43 mm inside at a full
  // carve against 31 mm without it). The rig already rolls the whole rider, so
  // the hair leans with the body regardless; what this would have added is the
  // *extra* lean, and it is not worth what it cost.
  /** How far the mass swings back off the shoulders at full fold, metres. */
  hairFollowLift: 0.016,

  /**
   * Wheel roll that produces the full hard-carve body reaction, radians.
   * Approximately the controller's 0.75 g lateral limit.
   */
  carveReactionFullRoll: 0.64,
  /** Both hips lower this far at a full carve, metres. */
  carveSquatMax: 0.065,
  /**
   * Additional drop of the inside hip at a full carve, metres.
   * Re-solving that leg to the planted pedal produces the characteristic
   * single bent knee described by the owner; it is not a whole-body tilt.
   */
  carveInsideHipDropMax: 0.085,
  /**
   * How far the inside knee's bend direction tilts outward at a full carve,
   * as a lateral fraction blended into the forward bend axis.
   *
   * A carving rider's inner knee relaxes outward toward the apex while the
   * outer leg keeps pressing the wheel (EUC_RIDER_MOTION_REFERENCE.md 7.2 and
   * 7.3). Bending the inside knee straight forward reads as a squat rather
   * than as a carve, and this is what separates the two silhouettes.
   */
  carveInsideKneeOpen: 0.45,
  /**
   * Extra outside-hip drop in the low-speed differential-leg technique.
   * The inside leg stays long while the outside leg bends and loads its pedal.
   */
  technicalTurnOutsideHipDropMax: 0.15,

  /**
   * Rendered rider pitch that produces the full fore-aft stance reaction,
   * radians. Matches the default `EUC.maxRiderPitch` the same way
   * `carveReactionFullRoll` matches the lateral limit.
   */
  loadReactionFullPitch: 0.70,
  /**
   * Hip translation at the full acceleration pose, metres, forward (+Z).
   *
   * A hard-accelerating rider drives the hips ahead of neutral and loads the
   * forefoot; the torso hinge alone reads as folding rather than pushing
   * (EUC_RIDER_MOTION_REFERENCE.md 6.4).
   */
  accelHipShiftMax: 0.08,
  /**
   * Hip translation at the full braking pose, metres, backward (-Z).
   * Deliberately larger than the acceleration shift: hard braking is a deep
   * hips-behind-the-axle semi-squat, not only a backward torso tilt — the
   * motion reference names that exact shortcut as an error to avoid (29).
   */
  brakeHipShiftMax: 0.15,
  /** Extra hip drop at the full acceleration pose, metres. Knees load. */
  accelSquatMax: 0.03,
  /** Extra hip drop at the full braking pose, metres. The braking semi-squat. */
  brakeSquatMax: 0.09,

  /**
   * Fraction of the torso's total fore-aft pitch the neck counter-rotates,
   * and the anatomical ceiling on that counter-rotation, radians.
   *
   * A rider hinged 40 degrees forward keeps their eyes on the route, not on
   * the contact patch; a braking rider does not throw their head at the sky
   * (EUC_RIDER_MOTION_REFERENCE.md 22). Partial rather than full, because a
   * perfectly stabilised head reads as robotic.
   */
  headStabilizationFactor: 0.65,
  headStabilizationMax: 0.55,

  /**
   * Static stance asymmetry on the rider's right arm: extra outward splay and
   * extra forward hand offset, metres.
   *
   * The reference photographs are consistent across five years: the owner's
   * relaxed arms are never a mirrored pair. Mechanically mirrored arms are one
   * of the motion reference's named errors (8, 29). Kept small enough that the
   * blockout still reads as deliberate rather than as damaged.
   */
  armAsymmetrySplay: 0.03,
  armAsymmetryForward: 0.035,

  /**
   * Arm reaction (M3). Hand-target offsets in metres, at the full pose.
   *
   * "Arms should communicate balance, not steering input"
   * (`EUC_RIDER_MOTION_REFERENCE.md` 23). Every number here is deliberately
   * smaller than the static asymmetry is wide, because the failure mode is not
   * subtlety — it is a rider who appears to be holding handlebars. The hands
   * never rise above the bottom of the ribcage and never converge toward the
   * centreline, which is what a handlebar pose actually looks like.
   *
   * The static right-arm asymmetry above is applied on top of all of these, so
   * no reaction can mirror the arms into a matched pair (23, 29).
   */
  /** Hands travel forward this far at the full braking pose, counterbalancing
   *  the hips going behind the axle (23, "Braking: move forward or outward"). */
  armBrakeForward: 0.055,
  /** Hands drift back and compact under hard drive (23, "Acceleration"). */
  armAccelBack: 0.035,
  /** Extra outward splay at either full fore/aft load pose. */
  armLoadSplay: 0.030,
  /**
   * At a full carve the OUTSIDE arm opens and rises while the INSIDE arm draws
   * in — the asymmetric turning response the reference asks for (23, 8), and
   * the pose in `IMG_E1270.JPG`, where the owner's outside arm is extended.
   */
  armCarveOutsideSplay: 0.055,
  armCarveOutsideRise: 0.045,
  armCarveInsideTuck: 0.030,

  shoulderHalfWidth: 0.175,
  upperArmLength: 0.28,
  forearmLength: 0.26,
  armThickness: 0.085,
  /**
   * How far out from the shoulder the hands sit, and how far down the arm
   * hangs as a fraction of its full reach. The reference set is unanimous
   * across five years: arms low and loose, hands at about waist height, rarely
   * higher except mid-carve. An arm splayed much wider than this reads as a
   * tightrope walker rather than as someone relaxed on a wheel.
   */
  armSplay: 0.115,
  armHangFraction: 0.93,
  /** Hands slightly forward of the shoulder, elbows slightly behind. */
  handForward: 0.12,

  neckLength: 0.09,
  /** Helmet is a sphere of this radius; a bare head would read as smaller. */
  helmetRadius: 0.125,

  /**
   * The stopped rest stance (M4.5): left boot on the ground, right boot
   * resting on its pedal, weight over the ground leg, wheel tipped gently
   * against the pedal-side shin. From the owner's photographs of full stops —
   * an EUC cannot stand unattended, so a stopped rider always grounds a foot.
   *
   * The hip height is not styled, it is reach: the legs total 0.78 m and the
   * ground ankle sits at 0.06 m, so hips at the riding 0.92 m literally cannot
   * reach the ground. Standing on the ground foot puts the hips where flat
   * ground puts anyone's hips — a shade under full leg length.
   */
  /** Ankle target of the grounded foot: outboard of the pedal, metres (+X). */
  restFootOutboard: 0.30,
  /** And slightly behind the axle line, metres. */
  restFootBack: 0.05,
  /** Hip height while standing on the grounded foot, metres. */
  restHipHeight: 0.80,
  /** Hips (and torso) shift toward the grounded foot, metres (+X). */
  restHipShift: 0.10,
  /**
   * Outward bend direction of the pedal-side knee in the stopped stance.
   *
   * The hips move over the grounded left foot while the right ankle follows a
   * pedal tipped the other way. Leaving the knee's solve purely forward makes
   * the resulting diagonal shin pass through the wheel shell; opening it
   * outward keeps the relaxed leg around the pad while preserving both contact
   * points. This is a direction ratio, not an angle.
   */
  restPedalKneeOpen: 0.55,
  /**
   * The wheel's resting tilt toward the pedal-side leg, radians.
   *
   * Applied to the EUC only, about the contact patch, toward -X — the side
   * whose boot is still on the pedal — so the shell rests against that shin.
   * The rider does not inherit it: they are standing, not leaning.
   */
  restWheelLean: 0.10,

  /**
   * Hop, air, and landing pose (M5).
   *
   * All of these are *offsets solved back to the planted pedals*, exactly like
   * the carve and load stances above. Dropping the hips and re-solving both
   * legs is what produces "knees bend deeply, hips lower, torso compresses"
   * (`EUC_RIDER_MOTION_REFERENCE.md` §12.1) without a single hand-authored
   * joint angle, and it is why the boots stay on the pedals through a hop.
   */
  /** Hip drop at a full crouch — the preload and the landing absorb, metres. */
  crouchHipDrop: 0.17,

  /**
   * The held tuck (M8.6), from the owner's ride: "crouching doesn't really
   * crouch that much".
   *
   * **A deliberate held crouch is a different pose from a hop preload, and
   * that is why it needed its own scalar rather than a bigger number on
   * `crouchHipDrop`.** The controller's `crouch` blend is one depth for three
   * causes — the preload, the tuck held in the air, and the landing absorb —
   * and all three are knee events with the torso staying where it was. A
   * landing absorb that folded the rider forward would be wrong, and a preload
   * deep enough to read as a crouch would put the hips through the pedals.
   *
   * `108220507_3330388273671835_8307057301061654842_o.jpg` is what the owner
   * means by crouching, and it is a whole-body shape rather than a hip
   * height: hips well down, the torso hinged far forward over the wheel, the
   * arms drawn back and low alongside the hips, and the head up with the eyes
   * still on the route. Four things, so four constants — the depth alone was
   * the reason a 9 cm hip drop was all the player could see.
   *
   * `EucPose.tuck` carries it, and it is exactly zero unless the player is
   * holding crouch with the wheel on the ground. Nothing about the accepted
   * M5 hop, air, or landing pose moves, and the suspension preload still reads
   * `crouch` alone — the physics of a hop are untouched by any number here.
   */
  /**
   * Extra hip drop at a full held tuck, metres, on top of the crouch blend's
   * own drop.
   *
   * The two together reach about 25 cm, which puts the hips 0.45 m above the
   * ankles against 0.78 m of leg — a genuine deep squat rather than a knee
   * bend, and the depth the photograph shows.
   */
  tuckHipDrop: 0.16,
  /**
   * Extra forward hinge of the torso at a full held tuck, radians.
   *
   * The single biggest tell in the reference, and the one the old crouch had
   * none of: the rider folds over the wheel. Composed on top of the resting
   * tilt and whatever fore/aft load pose is already running, then clamped by
   * `tuckTorsoPitchMax` below, because a hard launch out of a tuck would
   * otherwise put the helmet on the tyre.
   */
  tuckTorsoPitch: 0.50,
  /**
   * Ceiling on the torso's composed forward hinge, radians.
   *
   * About 54 degrees. Past this the blockout stops reading as a rider folding
   * down over the wheel and starts reading as one falling off the front of it.
   */
  tuckTorsoPitchMax: 0.95,
  /**
   * Ceiling on the whole shared hip drop, metres, from every cause at once.
   *
   * Carve, drive, brake, crouch, tuck, and wobble all spend the same `squat`,
   * and they are allowed to stack because a rider preloading mid-carve is one
   * rider in one stance. What they are not allowed to do is ask the legs for
   * a fold they do not have: the hips sit 0.70 m above the ankles and the legs
   * total 0.78 m, so past about 0.30 m of drop the IK is solving a shape no
   * knee makes and the blockout squats through its own boots.
   */
  squatMax: 0.30,
  /**
   * The tucked arms, metres, at a full held tuck.
   *
   * Back, out a little, and down: the hands finish behind the hips rather than
   * in front of them, which is the reference pose and also the furthest thing
   * from the handlebar silhouette every other arm constant here is sized
   * against. `tuckArmDrop` is what keeps the hands from riding up as the torso
   * hinges over them.
   */
  tuckArmBack: 0.115,
  tuckArmSplay: 0.025,
  tuckArmDrop: 0.045,
  /**
   * How much of the tuck's own torso hinge the neck gives back, and how much
   * further that is allowed to crane the head, radians.
   *
   * Higher than the general `headStabilizationFactor` on purpose. Head-up is
   * the defining feature of the pose — a rider tucked with their eyes on the
   * tyre is a rider about to hit something — and the reference photograph
   * shows the neck craned hard against a torso that is nearly horizontal.
   */
  tuckHeadStabilization: 0.92,
  tuckHeadStabilizationMax: 0.45,

  // -- The attack stance (M23) ----------------------------------------------
  //
  // `references/movement-photos/forward-lean-ref.jpeg`: a racer two seconds
  // into a pull, torso well past forty-five degrees, hips carried *back*
  // rather than dropped, both arms swept behind the body like a skater's, and
  // the helmet up — eyes on the road, not on the tyre.
  //
  // **It is not a deeper tuck, and the numbers say so.** A tuck drops the hips
  // 160 mm and folds the torso half a radian; this hinges further and drops
  // less, because a rider who is *driving* keeps their legs long and their
  // weight over the pedals. Both stack when a player crouches inside a long
  // pull, which is the pose at the very front of the photograph.
  /** Extra torso hinge at the full attack stance, rad. */
  attackTorsoPitch: 0.42,
  /** Hip drop it adds, m — a third of a tuck's, on purpose. */
  attackHipDrop: 0.055,
  /** How far back the hips travel as the torso goes over them, m. */
  attackHipShift: 0.045,
  /** Arms swept behind the hips, m. Further than a tuck's; it is the pose. */
  attackArmBack: 0.155,
  /** And drawn in, not out — the photograph's arms are pinned to the body. */
  attackArmSplay: -0.020,
  /** And down, so they trail rather than ride up as the torso goes over. */
  attackArmDrop: 0.055,

  // -- The hard-carve stance (M23) ------------------------------------------
  //
  // `references/movement-photos/carve-lean-ref.jpeg`: four riders in one
  // left-hander, and the shape they share is asymmetric. The **outside** arm
  // reaches forward and down across the machine — it is the counterweight and
  // the thing that reads at forty pixels — while the **inside** arm trails
  // back and high behind the hip. The torso folds forward as well as rolling,
  // which is what stops a leaned rider reading as a plank on a hinge.
  //
  // These are offsets on top of the carve reaction the game already has
  // (`armCarveOutsideSplay` and friends), not replacements for it: that one
  // arrives with any roll at any speed, and this one only when the corner is
  // real.
  /**
   * Extra torso hinge at the full carve stance, rad.
   *
   * Raised from 0.16 after a blind critic's fair point: at gameplay distance
   * the corner read as the machine's steering angle rather than as the
   * rider's body, because the torso was folding nine degrees where the
   * photograph's riders are draped over the machine. It stays well short of
   * the photograph — those are mini-moto racers on a track with no traffic —
   * because this rig has a documented failure mode at the other end, the
   * "exaggerated plank pose the owner rejected" (`render/ridingRig.ts`).
   */
  carveStanceTorsoPitch: 0.24,
  /** How far the outside hand reaches forward, m. */
  carveStanceOutsideForward: 0.105,
  /** And down — the photograph's outside glove is below the hip. */
  carveStanceOutsideDrop: 0.070,
  /** And out, past the ordinary carve splay. */
  carveStanceOutsideSplay: 0.045,
  /** How far the inside hand trails behind, m. */
  carveStanceInsideBack: 0.075,
  /** And up, behind the hip, where the photographs put it. */
  carveStanceInsideRise: 0.050,

  /**
   * Arm reaction while airborne, metres.
   *
   * "Arms provide limited correction" and "arms open for balance" (§12.3,
   * §12.4). Small, and outward-and-slightly-up rather than forward, because
   * hands rising toward the centreline is what reads as holding handlebars —
   * the failure the M3 arm constants are all sized against.
   */
  airArmSplay: 0.045,
  airArmRise: 0.030,
  /**
   * How far a scraping pedal levers the striking-side boot up, metres, at
   * `EUC.pedalStrikeReferenceDepth` of overlap.
   *
   * "Inside foot rises slightly with pedal impact"
   * (`EUC_RIDER_MOTION_REFERENCE.md` §14). Two centimetres, because the pedal
   * really has only stopped going down — anything larger reads as the rider
   * lifting their foot off, which is a different and much worse event.
   */
  pedalStrikeFootLift: 0.022,
  /**
   * The one-foot air gesture — M36, `docs/PLANS.md` §36.5.
   *
   * **The airborne exception to two-foot contact, and nothing else.** The
   * motion reference has both boots on their pedals at all times; this is the
   * one pose that leaves, it happens only in flight, and the three offsets
   * below are the whole of it. They are an *ankle target* — the existing
   * two-bone leg solve does the articulation, so there is no new joint, no new
   * geometry and no second opinion about where a knee may bend.
   *
   * Offsets from the free foot's own pedal target, after the pedal's yaw and
   * roll have been applied to it: the gesture rides the machine's pedal the
   * way every other foot offset does, so a wobbling wheel does not leave the
   * gesture behind. `render/rider.ts` blends toward them by the channel's
   * 0..1 amount, so entry, hold and the return before touchdown are one
   * scalar and every interior value is a real pose.
   *
   * **The foot trails; it does not kick out sideways, and that was measured
   * rather than chosen.** The first build took the ankle out and up — 0.20 m
   * outboard, 0.14 m above the pedal — and it did not fit anybody's clothes.
   * Swept through `render/riderClearance.test.ts`, it put a leg 60 mm out
   * through Trollina's flare and 208 mm out through Seal's tied band, dropped
   * all four hip domes below their seat hems (7.6 mm against a 20 mm floor)
   * and took both jacket-hem contracts 6 mm under theirs. The cause is
   * anatomy: raising the ankle toward a fixed hip shortens the chain, the
   * knee has to bulge somewhere, and a knee only bulges *forward* — measured,
   * the thigh's top swept 190 mm out in front of the rider, which is what
   * walks through everything worn at the waist. §36.5's instruction where that
   * happens is to **reduce or redirect the gesture, never the floor**, so the
   * pose was redirected: the foot swings *back* and up and a little out, which
   * folds the shin behind the rider and leaves the thigh where it was. At
   * these numbers the two contracts that had failed worst read exactly their
   * gesture-free values, and every other floor holds untouched.
   *
   * It is also the direction the game can see. The chase camera sits behind
   * the rider, so a boot that swings back and up crosses the silhouette the
   * player is looking at, where the same distance sideways is mostly hidden
   * behind the machine.
   *
   * Sized against reach rather than taste: the free ankle ends about 0.63 m
   * from its hip, inside the 0.78 m the thigh and shin total, so the knee
   * keeps a real bend at the full gesture instead of solving a locked leg
   * that would stand the boot somewhere the constants do not say.
   *
   * **The hips do not move.** A weighted one-foot stance on the ground shifts
   * the mass over the supporting pedal; a rider in the air has no weight to
   * shift, and a hip shift here would move every garment on the pelvis through
   * every clearance contract in `render/riderClearance.test.ts` for a pose that
   * lasts a fraction of a second. The supporting foot stays exactly on its
   * pedal.
   */
  /** How far the free ankle rises above its pedal target, metres. */
  oneFootRise: 0.16,
  /** How far outboard of its pedal target the free ankle travels, metres. */
  oneFootOutboard: 0.08,
  /** How far *behind* its pedal target the free ankle trails, metres. */
  oneFootTrail: 0.28,
  /**
   * Which foot leaves: **-1, the rider's RIGHT** (+1 would be their left).
   *
   * One side for every look, chosen by the clearance sweep and never by a
   * character branch (§36.5). The sweep measures both signs on all ten rigs
   * (`render/riderClearance.test.ts`, "the one-foot air gesture is measured on
   * both sides"), and every garment on the roster reads the same on either
   * side to the last place — the rig is mirror-symmetric and the sweep carries
   * both signs of the carve. One thing is not mirrored: **the Drunkard carries
   * his can in his LEFT fist**, a hand's width outboard of a left thigh the
   * ridden contract holds at 41.0 mm with 1.0 mm of reserve. Measured over the
   * airborne family, releasing the left foot takes the can to **40.1 mm** of
   * that thigh and releasing the right leaves it at **50.8 mm** — so the right
   * foot is the side, by 10.7 mm, and the assertion that says so is in the
   * sweep rather than in a comment.
   */
  oneFootReleaseSide: -1,
  /**
   * How far the head drops toward the landing in the air, radians.
   *
   * "Head tracks landing" / "head looks toward landing" / "head focused on
   * landing surface" (§12.2-§12.4). Applied only while falling: a rider on the
   * way up is still looking ahead, and one on the way down is looking at the
   * ground they are about to meet.
   */
  airHeadDown: 0.20,

  /**
   * Wobble and crash pose (M6).
   *
   * `EUC_RIDER_MOTION_REFERENCE.md` §13 describes wobble as "a layered
   * rider-and-wheel event" rather than as a shaking mesh: the knees bend
   * deeper, the arms move outward, the hips lag the wheel, and the head stays
   * comparatively stable. All four are here, driven from the single
   * `wobbleEnergy` scalar, and every one is an offset on the stance solve the
   * carve and the crouch already use — so a rider wobbling through a corner is
   * one rider in one stance rather than two poses arguing.
   */
  /** Extra hip drop at full wobble, metres. "Rider lowers centre of mass." */
  wobbleHipDrop: 0.055,
  /** Hand splay at full wobble, metres. "Arms move outward", "arms widen". */
  wobbleArmSplay: 0.075,
  /** Hand rise at full wobble, metres. Small — never a handlebar pose. */
  wobbleArmRise: 0.030,
  /**
   * Fore-aft travel of each boot during active wobble correction, metres.
   *
   * Experienced riders arrest a wobble by adjusting foot pressure and
   * placement. The feet counter-shift on the pedals by only 2.5 cm — enough
   * to read through the knees without looking like they have lost contact.
   */
  wobbleFootAdjust: 0.025,
  /**
   * The backwards-riding stance (shared-playtest feedback, 2026-08-10).
   *
   * Riding backwards is the one stance that is inherently asymmetric
   * front-to-back: the rider's eyes face away from the travel, so a real rider
   * opens their chest toward one side, looks back over that shoulder, drops
   * the lead shoulder slightly, keeps the knees flexed, and carries the arms a
   * little wider for balance. The M2–M13 rig rode backwards posed exactly like
   * a forward rider — square shoulders, eyes dead ahead — which every real EUC
   * rider in the shared playtest read as wrong at a glance.
   *
   * The side is fixed: Cool Rider checks over the LEFT shoulder (+X), the
   * same side the owner's photographs ground a foot at every stop. Riders
   * habitually favour one side, and a shoulder check that switched sides with
   * steering would read as indecision. All of it is driven by
   * `EucPose.reverseBlend` and every offset rides the existing stance solve,
   * so the boots stay planted and no approved forward pose moves: at blend
   * zero each term below contributes exactly nothing.
   */
  /**
   * Chest rotation toward the look side at full blend, radians, about the
   * torso's own vertical. ~36 degrees — the observed range is 40–60 on a real
   * rider, but past ~40 the blockout's jacket loft starts reading as twisted
   * damage rather than as an open chest. The legs stay square on the pedals;
   * the twist is entirely above the hips.
   */
  reverseTorsoTwist: 0.62,
  /**
   * Head yaw at full blend, radians, relative to the twisted torso. The neck
   * CROSSFADES from the steer-driven look to this (it does not add), so the
   * composed head-vs-wheel yaw settles near 86 degrees — looking back over
   * the shoulder at where the wheel is actually going — and can never stack
   * with a full-lock steer glance into an owl pose.
   */
  reverseHeadYaw: 0.88,
  /**
   * The lead shoulder drops slightly as the chest opens, radians of upper-body
   * roll toward the look side. Small on purpose: it is what keeps the twist
   * reading as a rider turning to look rather than as a rotated statue.
   */
  reverseShoulderRoll: 0.07,
  /** Extra outward hand splay at full blend, metres. Balance, never bars. */
  reverseArmSplay: 0.045,
  /**
   * Extra hip drop at full blend, metres. Backwards riding is less stable
   * than forwards for a human, and the flexed-knee crouch is how that shows;
   * it joins the shared squat, so it stacks safely under `squatMax`.
   */
  reverseSquat: 0.035,

  /**
   * The crash separation, as offsets on the rider root in the wheel's frame.
   *
   * Non-graphic and deliberately readable rather than realistic: the rider
   * leaves the wheel, ends up on their feet or on their side a couple of metres
   * away, and comes back. There is no impact geometry, no injury, and nothing
   * to look at that a nine-year-old could not watch (the vision, §9).
   */
  /** Arm splay while crashing, metres. "Arms protect body" (§16). */
  crashArmSplay: 0.13,
  crashArmRise: 0.16,
  /**
   * How far apart the boots land when the rider comes off, metres (+X side).
   *
   * Wider than the pedal stance and narrower than the one-foot-down rest
   * stance: a rider stepping off or running out plants both feet, and a rider
   * on their side has them out in front of them. Reuses the rest stance's own
   * ground solve, so the boots meet the ground rather than hanging at pedal
   * height two metres from the wheel.
   */
  crashFootOutboard: 0.24,
} as const;

/**
 * Common physical occupancy of the ten native rider/machine rigs, metres.
 *
 * These are component bounds, not a wheel-centred rider radius. The evidence
 * probe's shipped/90 mph scripts found a 0.539 m stationary human half-width,
 * 0.749 m same-pose bank half-width and a fallen human centre over 32 m behind
 * its wheel. Each component therefore follows its own transformed centre.
 * Source frames/skin allowances below are conservative common coefficients;
 * render/riderPopulationEnvelope.test.ts checks their actual posed vertices.
 * They remain a sampled containment contract, not an exhaustive pose proof.
 */
export const RIDER_OCCUPANCY = {
  hipHeight: RIDER.hipHeight,
  pedalHeight: WHEEL.pedalHeight,
  stance: RIDER_BLOCKOUT,
  /** Machine bounds include the widest pedals and largest native trim. */
  wheelBody: { minX: -0.27, maxX: 0.27, minY: 0.13, maxY: 0.67, minZ: -0.31, maxZ: 0.32 },
  /** Rotationally complete tyre/tread envelope, separate from suspension. */
  wheelTyre: { minX: -0.06, maxX: 0.06, minY: -0.02, maxY: 0.52, minZ: -0.27, maxZ: 0.27 },
  /** Pelvis-local garment, head and hair envelope, without the arm chains. */
  torso: { minX: -0.37, maxX: 0.37, minY: -0.27, maxY: 1.18, minZ: -0.46, maxZ: 0.46 },
  /** Additional head/hair reach as its ragdoll loll leaves the mounted frame. */
  headLollExpansion: 0.30,
  /** Common arm carriage range: narrowest sober through the widest native rig. */
  carriage: { minSplay: -0.01, maxSplay: 0.16, minRise: -0.01, maxRise: 0.12 },
  /** Maximum skin/guard distance from the solved leg/arm bone centre lines. */
  legRadius: 0.13,
  armRadius: 0.10,
  /** Includes the largest carried hand prop, which remains physical. */
  handRadius: 0.15,
  /**
   * The carried can along the solved lower-arm axis, relative to its distal
   * endpoint. Its authored Y span -0.220..-0.055 and the hand's +0.012 m
   * inset give 0.043..0.208 m. Radial reach includes the 8 mm carry offset,
   * 18 mm depth offset and 45 mm barrel radius. Kept axial rather than
   * enlarging every hand/torso axis: the 90 mph fallen-hand replay needs it.
   */
  handCarry: { axialFrom: 0.043, axialTo: 0.208, radial: Math.hypot(0.008 + 0.045, 0.018 + 0.045) },
  boot: { minX: -0.10, maxX: 0.10, minY: -0.075, maxY: 0.04, minZ: -0.15, maxZ: 0.15 },
  /** Common style interval: sober through the shipped loose/staggered stance. */
  motion: { overLean: 0.25, swayPelvisRoll: 0.12, staggerHips: 0.6,
    staggerArms: 0.8, swayArmSplay: 0.07, swayArmSwing: 0.04 },
  /** Metres per recommended articulated sweep sample; caller may refine it. */
  trajectoryPointStep: 0.06,
} as const;

/**
 * The mounted body the living world meets (VIS-CRASH-1, R2C-4, R2C-5;
 * 2026-10-04): `RIDER_OCCUPANCY`'s skeleton and solve with a contact core in
 * place of its roster-wide garment envelope. People, cars and the population's
 * certificates, actor yields and placements answer to this; nothing else does,
 * and `RIDER_OCCUPANCY` stays the containment proof for every rendered vertex.
 *
 * The envelope box held the tallest hair, the widest hand carriage and the
 * Drunkard's can for every rider, as one box pitched with the torso. Under
 * full throttle its front edge stood 1.5 m ahead of the wheel when the face is
 * 0.9 m ahead, and 0.7 m to each side when the hands are 0.4 m out, so a rider
 * crashed into people they visibly passed and stopped a metre and a half short
 * of a walker. Here the torso box stops at the shoulders, the head is a sphere,
 * elbows and knees take their exact lens (`tightLimbs`), and hands are gloves.
 *
 * **The tolerance, measured** (`render/riderContactCore.test.ts`, every look
 * cruising, at full throttle, carving, braking and in a held one-foot hop): in
 * plan no rendered vertex lies more than `RIDER_CONTACT_OVERHANG_METRES` outside
 * this body (0.144 m, Trollina's wide carriage and hair; every other look is
 * within 0.12 m), never a limb or a head; above its head sphere only tall hair
 * and a hat stand (0.33 m). A person's square hull stands about that far outside
 * their own rendered sides, so a rider may brush that hull, rarely them; a car's
 * hull is its body, so a hem or a hand may graze its paint for the frames before
 * a crash. The contact sweep's own resolution (`sweepResolutionMetres`) adds at
 * most 2.5 cm to that brush; a body is never passed through.
 */
export const RIDER_CONTACT = {
  ...RIDER_OCCUPANCY,
  /** Pelvis to shoulders; the head is its own sphere. */
  torso: { minX: -0.24, maxX: 0.24, minY: -0.27, maxY: 0.56, minZ: -0.22, maxZ: 0.22 },
  head: { y: 0.72, z: 0.02, radius: 0.17 },
  tightLimbs: true,
  /** The narrow and median carriages; the widest rig's hands may overhang. */
  carriage: { minSplay: -0.01, maxSplay: 0.02, minRise: -0.01, maxRise: 0.12 },
  legRadius: 0.09,
  armRadius: 0.06,
  /** A glove; the carried can is not a contact part. */
  handRadius: 0.06,
  handCarry: { axialFrom: 0, axialTo: 0, radial: 0 },
} as const;
/** Measured worst rendered overhang past `RIDER_CONTACT`, metres (see there). */
export const RIDER_CONTACT_OVERHANG_METRES = 0.15;

/**
 * Gravity, and nothing else.
 *
 * Its own group because it is not the EUC's property: the hop impulse (M5),
 * the airborne trajectory (M5), and the slope term in the longitudinal model
 * (M4) all read the same number, and a controller-local copy is how two of
 * them end up disagreeing.
 */
export const PHYSICS = {
  /** m/s^2. */
  gravity: 9.81,
} as const;

/**
 * The EUC controller — M2, and the design decision the whole project rests on.
 *
 * **The game inverts the real EUC control loop.** On a real wheel the rider
 * leans and the controller accelerates the wheel to stay underneath them. Here
 * `leanPitch` is a *state variable* driven toward the input target, and
 * acceleration is a function of lean. The player never balances. The rendered
 * rider pitch is a second state derived from actual acceleration, so a hard
 * launch or stop reads strongly while steady-speed riding settles nearer
 * upright. That is what "arcade, not simulation" means concretely
 * (docs/PLANS.md 4).
 *
 * Everything below is a designed feel rather than a derived quantity, so the
 * numbers are chosen for what they produce at the extremes rather than for
 * physical fidelity. The consequences worth knowing, on flat ground:
 *
 *   - Full lean gives `leanToAccel * sin(maxLeanPitch)` = about 7.7 m/s^2 away
 *     from a standstill, and quadratic drag balances it at 29.1 m/s on
 *     pavement (about 105 km/h, **65 mph**) — raised at M16 to 50 and again at
 *     M30 Phase 4 to 65 on the owner's decision, both times by cutting drag
 *     rather than by adding drive, so the launch the owner approved at M2 is
 *     unchanged and the wheel simply never stops pulling.
 *   - Full lean back gives about 10.5 m/s^2 before drag, keeping the stop from
 *     top speed short and forceful. The vision explicitly does not want long
 *     stopping distances.
 *   - The ordinary lateral clamp starts binding at about 4.6 m/s, so a fast
 *     turn goes wide because of a limit the rider can feel, not because an
 *     input was silently throttled. A hard low-speed input can add a
 *     speed-faded technical-turn allowance: every delivered degree of yaw is
 *     still counted as path curvature and shown in the wheel and rider.
 */
export const EUC = {
  // -- Longitudinal ---------------------------------------------------------

  /**
   * Force-demand lean at full throttle, radians (about 29 degrees).
   *
   * This is the controller state that produces force, not the rendered torso
   * angle. The owner is an experienced rider and asked for more authority than
   * the initial 24-degree setting after riding M2 in Chrome.
   */
  maxLeanPitch: 0.50,
  /**
   * Time constant for lean chasing the input target, seconds.
   *
   * The single most important number for how responsive the game feels. Too
   * short and the wheel is twitchy and the rider animation snaps; too long and
   * the controls feel like they are underwater.
   */
  leanResponseSeconds: 0.14,
  /**
   * Ceiling on how fast lean may change, rad/s.
   *
   * Shapes the onset of a slammed key without slowing an ordinary input: at
   * 3 rad/s a full-lean reversal takes at least 0.28 s, which is what stops a
   * keyboard tap from reading as an instantaneous torque step.
   */
  leanRateLimit: 3.0,
  /**
   * Drive authority, m/s^2 per unit of sin(lean).
   *
   * `accel = leanToAccel * sin(leanPitch)`.
   */
  leanToAccel: 16.0,
  /**
   * Brake authority, m/s^2 per unit of sin(lean). Deliberately larger than
   * `leanToAccel` — a wheel stops far harder than it accelerates, and the
   * vision asks for braking that feels powerful. Applied only when lean
   * opposes travel.
   */
  brakeAuthority: 22.0,
  /**
   * Quadratic drag, 1/m. `drag = dragCoefficient * v * |v|`.
   *
   * Quadratic rather than linear so that top speed emerges from the model
   * instead of being clamped, which is also what makes a hill descent
   * naturally faster than flat ground when M4 adds the slope term.
   *
   * **This number is the top speed. M16 halved it to reach 50 mph and M30
   * Phase 4 halved it again to reach 65.** With drive authority held at its
   * approved value, `sqrt((driveAccel − rollingResistance) / drag)` lands on
   * pavement at exactly the wheel's own advertised speed. Raising
   * `leanToAccel` instead would have reached the same ceiling while quietly
   * re-tuning every launch, every hill climb and every low-speed manoeuvre the
   * owner has already accepted; cutting drag changes one thing, which is how
   * long the wheel keeps pulling. The costs are real and were accepted twice:
   * the run to top speed is about eight seconds at 50 and about eleven at 65
   * rather than five, and a released throttle at mid speed coasts further
   * again. Both read as a faster, freer machine, which is the point.
   *
   * **65 MPH IS THE SHIPPED WHEEL SINCE M30 PHASE 4** (the owner's decision of
   * 2026-09-03, after riding both: *“we will ship at 65. i pre-approve.”*).
   * This literal and its five partners below are **not hand-typed numbers**:
   * they are what `simulation/topSpeedPreset.ts` writes for 65 mph applied to
   * the pre-M30 (50 mph) table, transcribed as the shortest decimal that
   * round-trips to the same double — which is why they carry sixteen digits
   * and must never be tidied. `topSpeedPreset.test.ts` re-derives all six from
   * the recorded pre-M30 base and asserts this table equals them **to the
   * bit**, so a hand edit here fails there. The six are `EUC.dragCoefficient`,
   * `EUC.powerComfortSpeed`, `EUC.powerLimitSpeed`, `CAMERA.speedReference`,
   * `AUDIO.speedReference` and `CAMERA.crashDistance`; everything else that
   * knows about the top speed is a *share* of `EucController.derivedTopSpeed`
   * and followed on its own (M16's lesson, pre-applied — the beeps, the
   * cutout, the cop's cap and the hazard spacing all moved without a line of
   * code naming a speed).
   *
   * 0.0147 was the pre-M30 wheel's drag. It is no longer a reference wheel
   * (M38 §38.7 retired that role): `?mph=<n>` remains a generic diagnostic at
   * any supported speed, and every diagnostic ride refuses records (§30.2
   * fact 8, q181).
   *
   * `level/routeValidator.ts` derives hazard fairness from the top speed this
   * produces, so a change here legitimately re-spaces generated hazards — and
   * this change did (`src/data/renderCost.ts`, re-measured at 65).
   */
  dragCoefficient: 0.008670408739376268,
  /**
   * Rolling resistance moved to `data/surfaces.ts` at M4, exactly as the M2
   * note here predicted: the controller now looks the value up per surface and
   * scales it by `TERRAIN.rollingResistanceScale`. Pavement's entry is 0.35,
   * the single value M2 shipped, so the ride the owner accepted is unchanged
   * on the surface they accepted it on. Nothing else about the longitudinal
   * model moved.
   */
  /**
   * Speed below which the wheel is treated as stopped, m/s.
   *
   * Keeps resistance from oscillating around zero, and keeps the state readout
   * from flickering between rolling and coasting at a standstill.
   */
  stoppedSpeed: 0.05,

  // -- Reverse --------------------------------------------------------------

  /**
   * Reverse is only reachable below this speed, m/s (docs/PLANS.md 4.1).
   *
   * Reverse is explicitly not a primary fantasy; it exists so that
   * repositioning, turning around, and recovering from a bad approach are
   * forgiving.
   */
  reverseEntrySpeed: 0.6,
  /**
   * How long lean-back must be held at a near standstill before reverse
   * engages, seconds.
   *
   * Without this, every hard stop rolls backwards the instant it completes,
   * which is not what "brake" meant. With it, reverse is something the player
   * asks for a second time.
   */
  reverseEngageSeconds: 0.35,
  /**
   * Reverse speed cap, m/s.
   *
   * **M16 moved this from walking pace to riding pace** — 6.7 m/s, 15 mph — on
   * the owner's judgement that backing up at 2.2 m/s was "way too slow" to be
   * any fun. The gate above is untouched and is what keeps the change honest:
   * reverse is still only reachable from a near standstill and still has to be
   * asked for twice, so nothing about a hard stop or a hill changed. What
   * changed is what happens once the rider has asked. Deliberately well under
   * the forward ceiling — backwards is a party trick, not a second top speed —
   * and slow enough that the look-behind stance still reads as a shoulder check
   * rather than as a rider facing the wrong way down a road.
   *
   * The consequence worth knowing: at 6.7 m/s a reverse corner can now reach
   * the full lateral limit, so the reverse stance composes with a real carve.
   * `render/riderClearance.test.ts` holds that envelope.
   */
  maxReverseSpeed: 6.7,
  /**
   * Share of the full look-behind pose shown during the confirmation dwell.
   *
   * The dwell above is deliberate friction — reverse is asked for twice — but
   * it used to be *invisible* friction: the player held lean-back at a
   * standstill and nothing on screen acknowledged it. The shared-playtest
   * riders called backwards riding out, and this is half of the answer. As the
   * dwell accumulates, the rider turns a partial shoulder check, which is what
   * a real rider does before rolling backwards; the moment reverse engages,
   * the check completes into the full look-behind stance. Releasing the lean
   * cancels the glance exactly as it cancels the dwell.
   */
  reverseGlanceFactor: 0.5,
  /**
   * Time constant for the look-behind stance blend, seconds.
   *
   * Fast enough that the glance visibly answers the held input inside the
   * 0.35 s dwell, slow enough that a head and torso turning ~90 degrees reads
   * as a movement rather than a snap. Also the unwind rate when the rider
   * leaves reverse or crashes out of it.
   */
  reversePoseSeconds: 0.22,
  /**
   * Steer backwards relative to travel (1) or to the nose (0). M17.
   *
   * At 0 — how it always behaved — yaw is applied in the machine's own frame
   * whichever way the wheel is rolling. That is faithful to the real thing: a
   * rider twists right and the wheel yaws right, forwards or backwards. It is
   * also what a reversing car does, and it reads to a player exactly the way
   * reversing a car reads: pressing right sent the rider backwards *left*.
   *
   * **The lean had already picked a side.** Roll follows `speed * yawRate`, so
   * it inverts with the direction of travel on its own — at 0 the rider pressed
   * right, leaned right, and travelled left. Two of those three agreed with
   * each other and disagreed with the button. At 1 the request flips with
   * travel and all three agree.
   *
   * The owner found it in play on desktop and phone; a player had reported it
   * on Facebook before that. It mattered little while reverse was a walking-
   * pace nudge and matters now that M16 made it a 15 mph mechanic. Kept as an
   * A/B switch rather than deleted because the 0 case is the honest physics and
   * someone may want to feel it again.
   */
  reverseSteerTravelRelative: 1,

  // -- Steering and carving -------------------------------------------------

  /**
   * Yaw authority at a standstill, rad/s.
   *
   * High on purpose: an EUC pivots on the spot, and tight technical spaces are
   * one of the things the wheel is genuinely better at than anything else.
   *
   * **M16 raised it from 2.4.** The owner's note is the specification: in real
   * life it is very easy to make tight turns and be playful with the wheel at
   * slow speed, and the game was not letting them. This is the limit approached
   * just above `stoppedSpeed`; ordinary steering does not perform the separate
   * emergency body-pivot technique while stationary. Nothing above
   * `carveSpeed` moved.
   */
  yawRateLow: 3.6,
  /** Yaw authority at and above `carveSpeed`, rad/s. Deliberately lower. */
  yawRateHigh: 0.85,
  /** Speed at which yaw authority has fully decayed to `yawRateHigh`, m/s. */
  carveSpeed: 9.0,
  /**
   * Shape of the decay from `yawRateLow` to `yawRateHigh`, dimensionless.
   *
   * `factor = (speed / carveSpeed) ** yawFalloffExponent`, and the authority is
   * the lerp across that factor. At 1.0 this is the straight line the model
   * shipped with from M2, in which half of the low-speed authority is already
   * gone by 4.5 m/s — ten miles an hour, which is not a speed at which a real
   * wheel has stopped being nimble. Above 1.0 the authority holds up through
   * the slow band and then falls away faster near the carve speed, which is the
   * shape the owner described.
   *
   * The moving endpoints are exactly preserved at any value: the first moving
   * step gets `yawRateLow` and `carveSpeed` gets `yawRateHigh`, so this cannot
   * touch the committed high-speed carve the owner already approved. It only
   * decides how the wheel gets between them.
   */
  yawFalloffExponent: 1.5,
  /**
   * Lateral acceleration ceiling, in g.
   *
   * **Clamping lateral acceleration rather than steering input is the key
   * detail of the whole steering model.** A high-speed turn goes wide because
   * of a physical limit the rider can feel and learn, not because the game
   * quietly ignored part of the input. At 0.75 g the wheel leans about 37
   * degrees at the limit, which is where a real carve looks committed without
   * looking like a crash in progress.
   */
  maxLateralG: 0.75,
  /**
   * **The give at speed** — the lateral ceiling the wheel reaches at
   * `carveGripFullSpeed`, in g (M30 Phase 2, `docs/PLANS.md` §30.3b;
   * `simulation/lateralCeiling.ts` is the schedule).
   *
   * The owner's ask was the racers': *"i need the rider to do the hang like
   * u say to corner at higher speeds. i'm trying to satisfy the real racers
   * that play my game now."* At the ordinary 0.75 g a full-lock corner needs
   * `v² / (0.75 g)` of radius — 68 m at 50 mph and 115 m at 65 — and no route
   * the generator draws has 115 m of radius, so the fast wheel had grip it
   * could not spend. 1.05 g takes 65 mph full lock to 82 m, which the route
   * has.
   *
   * **Nothing below `carveSpeed` (9 m/s) moves**: the schedule's first anchor
   * is that constant, so the ordinary clamp, M16's technical-turn bonus and
   * the whole reverse band are textually and numerically what they were.
   *
   * On F4 (0.75 is today's ride exactly, which is what makes the panel the
   * A/B; 1.6 is the slider's top). The **wheel's bank does not follow it**:
   * the roll saturates at `atan(maxLateralG · grip)` and `riderLean` carries
   * the rest, so the extra grip buys a tighter line and a rider hanging
   * inside, never a machine leaned onto its pedals (§30.3b, the fourth scope
   * answer).
   */
  carveGripTopG: 1.05,
  /**
   * Shape of the rise from `maxLateralG` to `carveGripTopG`, dimensionless.
   *
   * `u ** this`, where `u` is the fraction of the way from `carveSpeed` to
   * `carveGripFullSpeed`. 1.0 is the straight line the plan specifies: the
   * give arrives in proportion to the speed, which is the shape a rider can
   * learn. Above 1 it holds today's grip through the middle band and gives it
   * all up near the top; below 1 the opposite. On F4, because where the give
   * arrives is a taste his ride has an opinion about.
   */
  carveGripExponent: 1.0,
  /**
   * Speed at which the ceiling has fully risen to `carveGripTopG`, m/s.
   *
   * **22.25, and absolute** — the same anchor `carveLeanFullSpeed` uses and
   * for the same measured reason: 22.25 m/s is the **50 mph** wheel's flat
   * terminal *as the controller reaches it* (that wheel's `straight` digest
   * pinned 22.2523 after thirty seconds flat out), while §30.2 fact 1's 22.3
   * is the analytic figure before the wheel's own losses — an anchor there
   * left a flat-out ride at 0.9971 of the schedule and put the plateau
   * permanently a hundredth of a metre a second out of reach.
   *
   * Absolute is the third scope answer (§30.3): the anchors do not follow the
   * top speed. That decision was taken while 50 was the shipped wheel and it
   * **survived the switch to 65 unchanged** (M30 Phase 4), so the give now
   * plateaus at 0.747 of the shipped terminal and the last quarter of the
   * speed range corners on the same ceiling as 50 mph did. 40 mph therefore
   * corners identically on this build and on `?mph=50`, which is what keeps
   * the A/B honest. **Whether it should instead keep rising to 29 m/s is
   * q118, and it is open** — an answer is a ride, not an argument. Not on F4
   * either way: a `?mph=` build must not be able to move it.
   */
  carveGripFullSpeed: 22.25,
  /**
   * Extra lateral authority for a hard technical turn, in g.
   *
   * M16 first expressed this as a "free pivot": the heading and therefore the
   * velocity path turned, but that share of yaw was deliberately omitted from
   * `lateralAccel`. At 3.7 m/s the wheel followed a 1.3 m radius — about 1.1 g
   * of actual curvature — while the pose was told that most of it had not
   * happened. The wheel rotated tightly without the tilt and differential leg
   * work that make a real EUC turn recognisable.
   *
   * The allowance now widens the honest low-speed ceiling only for a hard
   * input. Every delivered yaw contributes `speed * yawRate`, so the wheel
   * banks, the outside leg bends, surface grip still matters, and a committed
   * turn can still scrape. At walking pace the request is below even the
   * ordinary ceiling, so a playful turn stays clear of the pedals.
   */
  technicalTurnBonusG: 1.2,
  /** Speed at which the technical-turn allowance has faded to zero, m/s. */
  technicalTurnFadeSpeed: 6.0,
  /** Analog steer magnitude where the hard leg-and-wheel technique begins. */
  technicalTurnSteerStart: 0.55,
  /** Analog steer magnitude where the hard technique is fully selected. */
  technicalTurnSteerFull: 0.90,
  /** Time constant for blending between gentle-twist and technical-turn poses. */
  turnTechniqueResponseSeconds: 0.12,
  /** Torso yaw at the peak of a gentle analog turn, radians. */
  gentleTurnTorsoTwist: 0.18,
  /** Upper-body roll share during a full low-speed technical turn. */
  technicalTurnUpperBodyRollFactor: 0.08,

  // -- Lean, roll, and what the rider does about it -------------------------

  /**
   * Time constant for roll chasing the lateral-acceleration target, seconds.
   *
   * Shorter than the pitch response: a carve should bite immediately, while
   * throttle should feel like it is asking the wheel for something.
   */
  rollResponseSeconds: 0.11,
  /**
   * Fraction of wheel roll retained by the rider's upper body **below
   * `carveLeanSpeed`** — the low-speed share (M30 Phase 3).
   *
   * A hard carve at walking and jogging pace happens mostly below the waist:
   * the wheel and lower body tilt into the turn while a bent inside knee and
   * shallow squat let the shoulders stay close to level. The first M2 rig used
   * 1.22 here and leaned the torso farther than the wheel, producing a
   * 45-degree plank at the 37-degree wheel limit *at every speed*. The owner
   * rejected that pose. 0.18 keeps a little readable commitment without
   * turning the upper body into the lean pivot.
   *
   * From M30 Phase 3 this is the *start* of a schedule rather than the whole
   * of it (`simulation/riderLean.ts`): above `carveLeanSpeed` the share blends
   * toward `carveLeanShareTop`, because a rider at 40 mph sitting upright over
   * a wheel banked to 37° is the pose the owner called out at M30 — "the
   * character being upright while turning at high speed looks weird…
   * centrifugal force would throw him out". Below 6 m/s nothing changed, to
   * the bit.
   */
  riderUpperBodyRollFactor: 0.18,
  /**
   * Speed where the rider's lean begins to follow the wheel, m/s (M30 Phase 3).
   *
   * Equal to `technicalTurnFadeSpeed` by design: the lean starts exactly where
   * M16's hard low-speed technique has fully faded, so the two never overlap
   * and the low-speed band is the approved M16 band to the bit — a test holds
   * the two equal. **Absolute**, not a share of the top speed (the third scope
   * answer of `docs/PLANS.md` §30.3), and not on F4.
   */
  carveLeanSpeed: 6.0,
  /**
   * Speed where the rider's lean share reaches `carveLeanShareTop`, m/s.
   *
   * The **50 mph** wheel's flat-pavement terminal **as the controller reached
   * it** — 22.25 m/s (that wheel's `straight` digest pinned 22.2523 after
   * thirty seconds flat out; §30.2 fact 1's 22.32 is the analytic figure
   * before the wheel's own losses, and an anchor set there left the line one
   * hundredth of a metre a second out of reach on the flat). **Absolute**:
   * the anchor did not follow the top speed when 65 shipped at M30 Phase 4,
   * so the lean reaches its full share at 22.25 m/s and holds it to the
   * cutout, and 40 mph leans exactly as it does on `?mph=50`. **q118 is
   * whether it should keep rising to 29 m/s instead, and it is open** — the
   * answer is a ride. Not on F4 either way. A full-lock carve settles at
   * 27.0 m/s on the shipped 65 wheel and at 20.6 on `?mph=50` (the pedal
   * scrub and the wheel's drag); the 65 carve is past the anchor and is the
   * full share — one whole line of cornering force, which past the saturated
   * bank is already a hang — while the 50 carve is 0.90 of the way up the
   * schedule, about 3° of hinge.
   */
  carveLeanFullSpeed: 22.25,
  /**
   * The upper body's share of the cornering lean at and above
   * `carveLeanFullSpeed`.
   *
   * **1.0 is the whole of the cornering lean, and since M30 Phase 2 that is
   * already a hang rather than one line.** Before Phase 2 the wheel banked to
   * the same `atan(a / g)` the rider did, so a share of 1.0 was rider and
   * machine on one line and the pelvis hinge was exactly zero. Phase 2
   * saturates the wheel at the ordinary ceiling — `atan(maxLateralG · grip)`,
   * 36.9° on pavement — and leaves this lean at the force, so at the 1.05 g
   * top the body sits 9.5° inside the machine's line at share 1.0: the pose of
   * the §30.1 photographs. Above 1.0 it leans further in again (q115, his
   * ride's call).
   *
   * The F4 slider's maximum is **1.00 — the shipped value itself** — and it is
   * a measurement, not a taste: the clearance contracts sweep the rider's roll
   * to the slider's maximum and a maximum they cannot clear is lowered, never
   * the other way round (§30.3d). `render/riderClearanceRidden.test.ts` drives
   * the production controller through the production rig over every `?mph=`
   * preset and reads the Drunkard's beer can against his thigh — a 40 mm floor.
   *
   * Phase 2 first set that maximum at 1.04 on a sweep whose *phase* was fixed;
   * its QA found the Drunkard's sway oscillator effectively sampled at one
   * value, and with the phase swept the same rides read 28.3 mm at share 1.00
   * on a 65 mph build — under the floor before this slider multiplied anything.
   * The repair was q114's named lever, the can's carry: it is now carried 8 mm
   * outboard of the fist's axis (`render/riderLook.ts`,
   * `DRUNKARD_HAND_CAN.x`), which buys 0.96 mm of thigh per millimetre and
   * restores the floor at 1.00 with 1.1 mm to spare. What it does not restore
   * is headroom above it: **each further 0.01 of share costs about 1.3 mm of
   * clearance**, so 1.01 reads 39.8 mm on the 80 mph wheel and the largest
   * step that holds is 1.00.
   *
   * So q115's *upward* half is closed until the can moves again — about 13 mm
   * of carry would return the slider to 1.04 — and the slider's remaining
   * travel is downward, its floor of 0.5 being half a lean for his taste.
   */
  carveLeanShareTop: 1.0,
  /**
   * **The settle** — how the lean *transitions*, M30 Phase 3b, and it is the
   * owner's first ride on Phase 3: *"the characters go V like a motorcycle…
   * from leaning all the way left to all the way right, and vice versa (very
   * stiff) meaning there is no transition. no animation. it is awkward
   * looking… make it: new hard left lean > old left lean > standup > old right
   * lean > new hard right lean."*
   *
   * The share above is right for a bank that is **held** and wrong for the
   * swing between two banks: at the top of the schedule the pelvis hinge is
   * zero and the whole body whips with the wheel at its own
   * `rollResponseSeconds`. `simulation/riderLean.ts` gives the schedule a
   * second clock, `leanSettle`, driven by the wheel's roll **rate**, and
   * multiplies the speed blend by it — so a flick slides the rider back down
   * the same schedule to the M16 pose (`riderUpperBodyRollFactor`, the pelvis
   * articulating) and the full lean returns when the bank does.
   *
   * The two rates below are the gate; the two times are the ramp.
   *
   * -- The gate ------------------------------------------------------------
   *
   * Wheel roll rate at or below which the bank counts as **held**, rad/s.
   *
   * 0.5 rad/s. A settled full-lock carve creeps at 2.5 × 10⁻³ rad/s (measured
   * on the production controller at 22.4 m/s), three orders of magnitude
   * under this, so stick jitter and a corner tightening under the rider both
   * count as held. Not on F4: it is the floor of the gate rather than its
   * shape, and the swing rate is the number a ride has an opinion about.
   */
  carveLeanHoldRate: 0.5,
  /**
   * Wheel roll rate at and above which the body is fully back at the old
   * pose, rad/s.
   *
   * 3.0 rad/s. A full flick at speed peaks at about 10.5 rad/s and stays over
   * this for the first sixteen ticks — the whole of the swing, both sides of
   * upright — while a corner entered deliberately drops under it as the bank
   * establishes. On F4, because how *early* the lean comes back is exactly the
   * taste his ride is judging (q123).
   */
  carveLeanSwingRate: 3.0,
  /**
   * Seconds from the old pose to the full lean once the bank holds.
   *
   * 0.35 s, about four times the wheel's own roll response, so the body
   * arrives *after* the machine — which is the transition the owner asked for
   * rather than a second plank. Measured: after a flick at 27 m/s the wheel is
   * held (under `carveLeanHoldRate`) at tick 42 and the body is back on the
   * line at tick 59.
   */
  carveLeanSettleIn: 0.35,
  /**
   * Seconds from the full lean back to the old pose when the wheel swings.
   *
   * 0.06 s — six times faster than the return, and the asymmetry is the
   * mechanism rather than a taste. The settle has to reach zero **before the
   * wheel crosses upright**: a share still shrinking while the new bank grows
   * makes the body's angle fall on the far side of a flick, which is a wobble
   * where the owner asked for a transition. Measured over 21 flicks (shipped,
   * 65 and 90 mph builds, six steering magnitudes): at 0.06 s the settle is
   * zero two ticks before the crossing on the tightest of them and every ride
   * is monotonic on both sides; at 0.08 s the margin is zero ticks, which is
   * why the F4 slider's useful range starts well under it.
   */
  carveLeanSettleOut: 0.06,
  /**
   * Maximum action pitch added to the rider's relaxed stance, radians.
   *
   * About 40 degrees, so the torso can reach roughly 46 degrees from vertical
   * once `torsoRestPitch` is included. This is deliberately transient: the
   * acceleration term below reaches it, while a settled cruise does not. The
   * earlier 0.50-radian cap changed the old pose by only about three degrees
   * and was not readable from the actual chase view.
   */
  maxRiderPitch: 0.70,
  /**
   * Fraction of force-demand lean retained in the steady visual pose.
   *
   * A rider still leans a little to hold speed against drag, but should not
   * remain in the launch pose once speed has stopped changing.
   */
  riderCruisePitchFactor: 0.18,
  /**
   * Additional rendered pitch per m/s^2 of active longitudinal acceleration.
   *
   * Actual acceleration, not held input, is the important distinction: at top
   * speed the value approaches zero even while W remains held, so the rider
   * settles. Coasting resistance is excluded because it is not a rider demand.
   */
  riderAccelerationPitchGain: 0.10,
  /** Time constant for the rendered rider pitch chasing its target, seconds. */
  riderPitchResponseSeconds: 0.08,
  /**
   * How much of the rendered rider pitch the wheel itself takes, as a fraction.
   * Less than 1: the pedals tilt, the rider leans. Zero would make acceleration
   * invisible on the wheel; 1 would make the wheel look like it is falling
   * over with the rider still upright on top of it.
   */
  wheelPitchFactor: 0.45,

  // -- Look into the turn (M3) ---------------------------------------------

  /**
   * How far the head turns toward the corner at full steering lock, radians.
   *
   * `docs/PLANS.md` 4.2 has held a line for this since the plan was approved —
   * `riderLookYaw = steerInput x LOOK_INTO_TURN`, marked "(M3)". About 24
   * degrees: a rider looks *through* a corner rather than at the wheel
   * (`EUC_RIDER_MOTION_REFERENCE.md` 22), but a placeholder head cranked
   * further than this reads as an owl rather than as someone riding.
   *
   * It is driven from steering *intent*, not from achieved yaw rate, for two
   * reasons. The head leads the turn rather than following it, which is what
   * the motion reference describes. And yaw rate is throttled at speed by the
   * lateral-acceleration clamp, so reading it would turn the head *less* in
   * exactly the fast committed carve where a rider looks furthest ahead.
   *
   * This is additive presentation. It changes no force, no steering, and no
   * approved M2 pose magnitude.
   */
  riderLookIntoTurn: 0.42,
  /**
   * Time constant for the head chasing that target, seconds.
   *
   * Steering input is a hard step from the keyboard and the controller
   * deliberately does not pre-smooth it (`input/actions.ts`), so without this
   * the helmet would snap. Shorter than the wheel's roll response, because the
   * head arrives at the corner before the wheel does.
   */
  riderLookResponseSeconds: 0.16,

  // -- Slope lean (M4.5) -----------------------------------------------------

  /**
   * Rider lean toward the uphill side per radian of gradient along the
   * heading, dimensionless.
   *
   * The physics behind the default: a rider holding steady speed on a slope of
   * angle theta needs the wheel's thrust to cancel gravity's along-slope pull,
   * and for the contact force to keep passing through the combined centre of
   * mass, that centre of mass must sit uphill of the contact patch by exactly
   * theta from vertical — `tan(lean) = g sin(theta) cos(theta) / g cos²(theta)
   * = tan(theta)`. So 1.0 is not a styled number; it is the equilibrium. It is
   * what the owner's own riding does on a climb, and what the M4 rig got
   * backwards by tilting the whole rig to the surface normal instead — the
   * rider read as leaning *away* from the hill, which on a real wheel is how
   * you get hurt.
   *
   * Signed by the gradient along the heading, so it is forward on a climb,
   * backward on a descent, and — because reversing keeps the heading — toward
   * the hill while backing down a slope, which is also correct: the wheel is
   * braking against gravity and the rider hangs uphill of it.
   */
  riderSlopeLeanFactor: 1.0,
  /**
   * Speed at which the slope lean is fully expressed, m/s.
   *
   * At a standstill the pedals hold the rider level and no traction force is
   * being commanded, so the balance argument above evaluates to vertical — a
   * stationary rider on a hill stands straight up. The lean fades in over the
   * first metre-and-a-half per second of travel rather than switching.
   */
  riderSlopeLeanFullSpeed: 1.5,

  // -- Stopped rest (M4.5) ---------------------------------------------------

  /**
   * How long the wheel must be stopped, with no throttle and no steering,
   * before the rider steps a foot down to rest, seconds.
   *
   * An EUC cannot stand on its own: fully stopped, a real rider always puts
   * one foot on the ground and keeps one on a pedal (the owner's photographs
   * agree across five years, and `EUC_RIDER_MOTION_REFERENCE.md` §15 lists the
   * sequence). Long enough that a rolling stop into an immediate pull-away
   * never flickers the foot; short enough that a deliberate stop reads.
   */
  restDelaySeconds: 0.75,
  /** Time constant for settling into the rest stance, seconds. Relaxed. */
  restResponseSeconds: 0.30,
  /**
   * Time constant for stepping back onto the pedal when input returns,
   * seconds. Much faster than the settle: "controls restore rapidly"
   * (`EUC_RIDER_MOTION_REFERENCE.md` §15), and the wheel starts moving on the
   * next step whether or not the boot has visually landed.
   */
  restReleaseSeconds: 0.12,

  // -- Hop, air, landing, pedal strike (M5) ---------------------------------
  //
  // `docs/PLANS.md` §4.4 settled the shape of all four before any of them was
  // built: one hop button with an optional held-crouch bonus, ballistic air
  // with limited yaw and no steerable velocity, a three-input landing score,
  // and a pedal strike that turns cornering into something with a learnable
  // ceiling. The numbers below are what those sentences cost.

  /**
   * Dwell between the hop press and the impulse, seconds.
   *
   * `docs/PLANS.md` §4.4 asks for "~90 ms `Compressing` (rider visibly
   * crouches) → impulse". It is not input latency being added for flavour: it
   * is the preload, and it is what makes the wheel look like it is being
   * *pushed* off the ground rather than teleported upward. The one-shot press
   * is buffered for 0.15 s upstream (`INPUT.actionBufferSeconds`), so a hop
   * asked for slightly early still fires — the buffer and this dwell shape
   * opposite ends of the same press.
   */
  hopCompressSeconds: 0.09,
  /**
   * Vertical launch speed at zero charge, m/s.
   *
   * Chosen from the height it produces rather than picked as a velocity:
   * `v²/2g` = 0.46 m, which clears the 0.15 m kerb of `docs/PLANS.md` §6 beat 3
   * with room to spare and lands about 0.61 s later. That air time is the real
   * number to judge — long enough for the hop to read as a hop from a chase
   * camera, short enough that ordinary riding is not spent waiting to land.
   */
  hopLaunchSpeed: 3.0,
  /**
   * How long crouch must be held before the hop bonus is full, seconds.
   *
   * Short on purpose. The bonus is a reward for *setting up*, and a charge
   * meter is explicitly what §4.4 does not want — so the window is about the
   * length of an approach to a kerb the rider has already seen.
   */
  hopChargeSeconds: 0.40,
  /**
   * Extra hop HEIGHT at full charge, as a fraction. §4.4's "up to 40%".
   *
   * Height goes as the square of launch speed, so this is applied as
   * `v * sqrt(1 + bonus)` — 40% more height is 18% more speed. Writing it as a
   * height is what keeps the constant meaning the thing the plan promised.
   */
  hopChargeHeightBonus: 0.40,
  /**
   * Suspension extension velocity released at launch, per m/s of launch speed.
   *
   * "Suspension rebounds, tire leaves ground"
   * (`EUC_RIDER_MOTION_REFERENCE.md` §12.2). The preload below goes *into* the
   * spring during the compression; this is it coming back out.
   */
  hopSuspensionRebound: 0.35,
  /**
   * How far a full crouch pushes the suspension down, m.
   *
   * Fed to the spring as a displacement of its input rather than applied to
   * the offset directly, so the compression and its rebound both come out of
   * the damper that already exists instead of being animated on top of it.
   * Under the wheel's 0.085 m of travel, so a preload never sits on the stop.
   */
  suspensionPreload: 0.055,

  /**
   * Fraction of ground yaw authority available in the air. §4.4's "~25%".
   *
   * **Yaw is the only air control that changes an outcome, and that is the
   * point.** The travel direction is frozen at takeoff (§4.4: "velocity
   * direction is never steerable in the air — takeoff choices must matter"),
   * so turning the wheel mid-flight does not move the landing spot; it changes
   * how *aligned* the wheel is when it gets there, which the landing score
   * reads directly. Air control that cannot rescue a bad takeoff but can
   * rescue a bad attitude is exactly the trade the plan asks for.
   */
  airYawFactor: 0.25,
  /**
   * How fast the 180° spin jump sweeps the heading, rad/s — M24.
   *
   * The spin is the deliberate airborne about-face (pressing hop again while
   * airborne), so its rate is scripted rather than borrowed from steering:
   * π radians at this rate takes ~0.42 s, inside an uncharged hop's ~0.61 s
   * of air, so a tap thrown straight off the ground completes with margin —
   * while a tap thrown at the top of the arc lands part-turned and pays for
   * it through the landing score, which is the skill.
   */
  spinYawRate: 7.5,
  /**
   * How hard steer must be held at the spin press to choose its direction.
   *
   * Below it the spin goes left (positive yaw, the world's positive
   * direction); past it, the spin follows the stick. A threshold rather than
   * a raw sign so drift on a worn pad cannot decide which way a trick turns.
   */
  spinSteerThreshold: 0.35,
  /**
   * Fraction of the drag coefficient that still applies with no wheel on the
   * ground, dimensionless.
   *
   * **`dragCoefficient` is a top-speed shaper, not an aerodynamic model**, and
   * that distinction only starts to matter at M5. It is sized so that drive
   * authority balances it at the wheel's own terminal — 29.1 m/s since M30
   * Phase 4, 22.3 before it — which is about 7.3 m/s² up there either way,
   * because the product is pinned at the drive. Against the air resistance a
   * rider and a wheel actually meet that was roughly four times over at 22.3
   * and is a smaller multiple at 29.1, since the real force grows with the
   * square and this one does not move.
   * The rest of it stands in for motor limits and driveline losses, and none of
   * those act on a wheel that is off the ground.
   *
   * Applied in full, a 0.6 s hop at top speed cost 3.7 m/s — a quarter of the
   * wheel's speed for one kerb, which is a straightforward answer of "no" to
   * *is hopping a curb satisfying enough that I do it for no reason?* At 0.18
   * the same hop costs about 0.8 m/s, which is a real but small price, and an
   * unhopped kerb still costs 3 m/s. Hopping stays the fast line and stops
   * being a punishment.
   *
   * It cannot become an exploit: there is no drive authority in the air
   * either, so a hop can only ever lose speed, never gain it.
   */
  airDragFactor: 0.18,
  /**
   * Fore-aft pitch the rider can set in the air at full throttle input, rad.
   *
   * §4.4's "small pitch correction for landing alignment". Presentation
   * rather than mechanism — it changes no force and no landing score — because
   * a real rider absolutely does set the wheel's attitude in flight and a
   * blockout that stays rigidly level through a drop looks dead.
   */
  airPitchAuthority: 0.16,
  airPitchResponseSeconds: 0.18,
  /**
   * How bent the knees are while airborne, 0..1 of a full crouch.
   *
   * "Knees partially bent, feet remain planted, rider retains wheel between
   * legs" (`EUC_RIDER_MOTION_REFERENCE.md` §12.3). Partial, not full: a rider
   * tucked as hard in the air as they were on the preload has nothing left to
   * absorb the landing with.
   */
  airTuck: 0.30,
  /** How deep a deliberate held crouch goes on the ground, 0..1. */
  crouchHeldAmount: 0.55,
  /** Time constant for the crouch blend chasing its target, seconds. */
  crouchResponseSeconds: 0.07,

  // -- The two riding stances off the owner's photographs (M23) -------------
  //
  // He put two pictures of real riders in `references/movement-photos/` and
  // asked for the poses in them: *"my idea is that the current behavior of
  // leaning/carving at speed initiate with the current animation and into the
  // reference animation"*. Both photographs are the same lesson — a racer's
  // stance is not the cruising stance turned up, it is a **different shape**,
  // and it arrives after the input has been *held*.
  //
  // The forward-lean picture is a rider pinned over the wheel: torso near
  // horizontal, hips back, arms swept behind, helmet up on the horizon. The
  // carve picture is four riders folded into a left-hander with the outside
  // arm reaching down across the machine and the inside arm trailing.
  //
  // Both are gated on *time* and *speed*, per his note that a carve pose at
  // walking pace is somebody "fooling around doing playful turns, not
  // carving".

  /** Throttle that counts as driving forward for the attack stance, 0..1. */
  attackThrottle: 0.55,
  /** Speed below which the attack stance never arrives, m/s. */
  attackSpeed: 7.0,
  /** How long the throttle must be held before it starts, s. */
  attackDelaySeconds: 1.6,
  /** How long from there to the full stance, s. */
  attackRampSeconds: 1.1,
  /** Easing on the blend itself, s — and how fast it lets go. */
  attackResponseSeconds: 0.30,

  /** Roll where the hard-carve stance starts to arrive, rad. */
  carveStanceRoll: 0.30,
  /** Roll where it is fully in, rad. */
  carveStanceFullRoll: 0.58,
  /** Speed where it starts to arrive, m/s. */
  carveStanceSpeed: 8.0,
  /** Speed where speed stops holding it back, m/s. */
  carveStanceFullSpeed: 13.0,
  /** Easing on the blend, s. Slower in than out is deliberate — see below. */
  carveStanceResponseSeconds: 0.34,
  /**
   * Time constant for the landing absorb decaying back out, seconds.
   *
   * Separate from the crouch response because the two are different motions:
   * the crouch is something the rider does, and this is something the ground
   * does to them. "Knees compress sharply, hips lower, torso absorbs force,
   * rebound follows" (§12.5) — sharp in, unhurried out.
   */
  landingAbsorbSeconds: 0.30,

  /**
   * Closing speed along the surface normal that scores 1.0, m/s.
   *
   * The landing score is the sum of three terms — impact, misalignment, and
   * surface — each normalised by its own reference so that "1.0" means the
   * same amount of trouble whichever produced it. 5 m/s is a 1.27 m free fall,
   * comfortably above the 0.46 m hop and above §6 beat 9's 1.2 m kicker, which
   * is what §4.4 means by "thresholds are deliberately generous in the slice".
   */
  landingImpactReference: 5.0,
  /**
   * Angle between the wheel's heading and its travel direction that scores
   * 1.0, radians. About 46 degrees — landing properly sideways.
   */
  landingMisalignReference: 0.80,
  /** Weight of the surface term, at the reference roughness below. */
  landingSurfaceWeight: 0.30,
  /**
   * Roughness amplitude that produces the full surface term, m.
   *
   * The surface's own `roughnessAmplitude` rather than a new table column:
   * what a landing costs is a question about what the *suspension* has to
   * absorb, which is exactly what that number already means. Gravel's 0.040
   * scores the full weight; pavement's 0.004 scores a tenth of it.
   */
  landingRoughnessReference: 0.040,
  /** Score at which a landing stops being clean. */
  landingHeavyScore: 1.0,
  /**
   * Score at which a landing stops being merely heavy.
   *
   * **A name, not a consequence, since M13.** M6 made this tier inject wobble;
   * the owner's §13 q8 trigger set left no room for it, so what survives is the
   * classification — `landingQuality` reports `wobble`, the results screen shows
   * it, and the landing still costs speed and power headroom like any other. The
   * tier is kept rather than folded into `heavy` because it is the rung the
   * crash tier is measured against, and because a landing this bad should read
   * as a distinct event even when it no longer unsettles the wheel.
   */
  landingWobbleScore: 1.8,
  /** Score at which a landing would crash. M6 owns the consequence. */
  landingCrashScore: 2.8,
  /**
   * Fraction of speed lost per point of score above `landingHeavyScore`.
   *
   * Continuous rather than stepped: the four names are labels for the HUD and
   * for M6, and a rider should feel a landing getting worse before it changes
   * category. The misaligned component of the velocity is scrubbed *before*
   * this, so a sideways landing is paid for twice — once in geometry and once
   * in the score, which is what makes lining up worth doing.
   */
  landingSpeedLossPerScore: 0.20,
  landingMaxSpeedLoss: 0.75,
  /** How long the wheel reports `landing` after touchdown, seconds. */
  landingStateSeconds: 0.18,
  /** Suspension velocity absorbed per m/s of normal impact, dimensionless. */
  landingSuspensionKick: 0.16,

  /**
   * Deceleration while a pedal is scraping, m/s² per radian of overlap.
   *
   * **Pedal clearance itself is derived, not written down** — see
   * `defaultEucTuning`. The pedal's outer edge sits `pedalSpan/2` from the
   * centreline at `pedalHeight` above the tread, so it reaches the ground at
   * `atan(height / halfSpan)` = 0.55 rad (31.7°) of lean. That is the same
   * rule `TERRAIN.stepUpPedalFactor` follows and for the same reason: the
   * number that matters is a property of the wheel.
   *
   * The consequence is worth stating because it is a design decision. The
   * lateral limit allows 0.64 rad of lean on pavement, so a full-lock carve at
   * speed on a hard surface *will* scrape — that is §4.4's "learnable limit",
   * not a bug. Grass and gravel never reach it, because their grip caps the
   * lean below the clearance angle first, which makes pedal strike a hard-
   * surface phenomenon exactly as it is in life.
   *
   * **The coefficient is chosen from what a sustained scrape costs**, not from
   * a peak. With `pedalStrikeGraceAngle` in front of the clearance, the
   * deepest overlap the lateral ceiling can produce is ≈ 0.037 rad, so 38 is
   * about the same 1.4 m/s² the accepted M5 value of 15 produced over the
   * old 0.092 rad — a full-lock carve settles 10% slower at full throttle
   * and about a quarter slower at cruising throttle. That is roughly what
   * clipping the unhopped kerb costs, spread over a corner instead of
   * arriving all at once, which is the right size for a limit meant to be
   * learned rather than feared. (The original calibration note stands: at
   * double this cost the wheel sat on the lateral clamp's own boundary and
   * the radius stopped settling.)
   */
  pedalStrikeDecel: 38,
  /**
   * One-shot suspension velocity at the moment a scrape begins, m/s.
   *
   * "Sharp lower-body jolt ... inside foot rises slightly with pedal impact"
   * (`EUC_RIDER_MOTION_REFERENCE.md` §14). Applied on the onset edge rather
   * than continuously, so a long scrape is one kick and then a scrape instead
   * of a rattle that fights the damper.
   */
  pedalStrikeJolt: 0.22,
  /**
   * Extra lean beyond the geometric pedal clearance before a strike begins,
   * radians.
   *
   * **Owner, second ride of the third audio pass (2026-08-04): "the pedals
   * scrape too easily, and loudly... save it for hard carves not every basic
   * turn like it is now."** The geometric clearance is atan2(pedalHeight,
   * pedalSpan/2) ≈ 0.552 rad against pavement's 0.644 rad lean ceiling, so a
   * carve at 86% of maximum lean was already sparking — and roll transients
   * during ordinary direction changes brush that all the time. The grace
   * angle models the honest half-truth that a glancing touch neither sparks
   * nor sounds: the strike (sound, sparks, jolt, and drag together — they all
   * key off `pedalStrike`) now begins at ≈ 0.607 rad, about 94% of the
   * ceiling. The clearance angle itself stays purely geometric — the M5
   * evidence asserts it and §4.4 wants a constant — this is a margin *on top*
   * of it, not a new source of truth.
   */
  pedalStrikeGraceAngle: 0.055,
  /**
   * Overlap at which the strike's presentation is fully expressed, radians.
   *
   * The single reference both consumers normalise against — the rider's boot
   * lift and the spark rate — so a scrape that looks half as deep also throws
   * half as many sparks. A full-lock carve on pavement reaches about 0.10 rad,
   * so this is deliberately just above what ordinary riding can produce.
   */
  pedalStrikeReferenceDepth: 0.12,

  // -- Wobble, power, crash, recovery (M6, wobble retriggered at M13) -------
  //
  // `docs/PLANS.md` §4.5 settled all three before any was built: wobble is a
  // driven damped roll-yaw oscillator whose damping rises sharply with smooth
  // input, power is *one* scalar driving a four-stage ladder that ends in
  // tilt-back, and a crash is a short non-graphic separation with a fast
  // recovery at the last validated safe position.
  //
  // **Every number below is sized against one hard constraint: the ride the
  // owner accepted at M2 through M5 must be bit-for-bit unchanged.** Flat
  // pavement is the ground that ride was accepted on, and on it every term
  // here evaluates to exactly zero — and after M13 that is true of *every*
  // surface but the spill, because the trigger set is the owner's and it is
  // hazards only (§13 q8). The power ladder's tilt-back stage stays out of
  // reach without a hill, a bad landing, or a fight with the wheel. A headless
  // test asserts that reduction directly, the same way M4's and M5's do.
  //
  // **M13 deleted seven constants rather than zeroing them**, because a tuning
  // value nobody reads is a value that rots: `wobbleComfortSpeed`,
  // `wobbleSpeedGain`, `wobbleSteerReversalGain`, `wobbleReversalMemorySeconds`,
  // `wobblePedalStrikeGain`, `wobbleCurbGain` and `wobbleLandingGain` are gone
  // with the sources they scaled. The kerb still costs speed and the harsh
  // landing still spends power headroom; neither starts an oscillation now.

  /**
   * Wobble oscillation frequency at rest, and at the crash threshold, Hz.
   *
   * **Frequency was the recorded defect of the wobble the owner rejected**, and
   * this pair is M13's answer to it. Real EUC speed wobble sits around 3-5 Hz,
   * so M6 picked a fixed 4.0 — but the number that matters is not the frequency,
   * it is the *wavelength down the camera axis*. At 15 m/s, 4 Hz puts a full
   * left-right cycle in 3.8 m of travel, which viewed from a 6 m chase arm is a
   * shimmer on a narrow figure rather than a machine visibly fighting its rider.
   * DESIGN.md §6d records the same lesson from the other side: judge an
   * oscillation against the axis it will actually be seen down.
   *
   * The owner's second Phase 0 ride corrected that interpretation against
   * video evidence: a real EUC wobble is a rapid 3–8 Hz coupled roll-yaw
   * resonance, not a slow scenic weave. The base therefore begins at 3 Hz and
   * tightens to 7 Hz near the crash threshold. The line still traces the
   * sinusoid, but the high-frequency pedal and tyre alternation is now the
   * primary read. At the 120 Hz step even the top of the range has more than
   * seventeen samples per cycle.
   */
  wobbleFrequencyHz: 3.0,
  wobbleFrequencyAtCrashHz: 7.0,
  /**
   * Yaw amplitude at the crash threshold, radians.
   *
   * **This is a real deviation, not a decoration.** The oscillation is added to
   * the heading the wheel actually travels along, so a full wobble weaves the
   * line by about ±6 cm at riding speed. It averages to zero over a cycle, so
   * it costs the rider their *line* and their nerve without stealing the
   * direction they chose — which is what separates wobble from a random walk.
   */
  wobbleMaxYaw: 0.10,
  /**
   * Machine roll amplitude at the crash threshold, radians.
   *
   * Coupled in phase with `wobbleMaxYaw`: when the tyre yaws left it also tips
   * left. Applied only to the EUC and its pedals, around the contact patch;
   * the rider's legs solve back to those moving pedals instead of inheriting
   * one rigid whole-body roll.
   */
  wobbleMaxRoll: 0.14,
  /**
   * Energy at which wobble becomes a crash (`docs/PLANS.md` §4.5).
   *
   * Exactly 1, so `wobbleEnergy` is readable as a fraction of the way to
   * losing it and every gain below is stated in "how much of a crash per
   * second" rather than in units of nothing.
   */
  wobbleCrashEnergy: 1.0,
  /**
   * Passive damping per second under hard input, and damping while easing off.
   *
   * Easing or slowing remains the player's strongest recovery choice. Active
   * foot correction is a separate term below: the two stack, so an experienced
   * rider arrests a mistake automatically and the player can settle it faster
   * by getting smooth instead of being trapped in a persistent penalty.
   */
  wobbleDampingAggressive: 0.55,
  wobbleDampingSmooth: 2.40,
  /** Throttle magnitude at or below which the rider counts as eased off. */
  wobbleSmoothThrottle: 0.35,
  /** Steering must be unchanged this long to count as smooth, seconds. */
  wobbleSmoothSteerSeconds: 0.30,
  /**
   * Time constant for the smoothness blend, seconds.
   *
   * Blended rather than switched, so damping cannot chatter between its two
   * values on a rider hovering at the throttle threshold — and so that
   * recovering reads as the wobble *settling* rather than as it being switched
   * off the instant a key is released.
   */
  wobbleSmoothResponseSeconds: 0.25,
  /**
   * Experienced-rider foot correction.
   *
   * A wobble that reaches this energy makes Cool Rider actively re-centre
   * their feet. The correction adds damping regardless of throttle, while
   * easing off still adds the stronger input-driven damping above. The low
   * onset lets a curb, bad landing, or hard reversal get a visible answer;
   * ordinary gravel settles below it and cannot manufacture a permanent
   * wobble merely because the player chose that surface.
   */
  wobbleFootCorrectionStart: 0.30,
  wobbleFootCorrectionDamping: 1.00,
  wobbleFootCorrectionResponseSeconds: 0.12,
  /**
   * Master gate on every wobble energy source, 0..1. **One since 2026-08-09:
   * the owner opened the gate on the M13 Phase 4 exit ride** — seven years of
   * gate-keeping in three sentences, so the history stays legible:
   *
   * The M6 build was ridden 2026-08-02 and judged "works, but not fun"; the
   * owner zeroed this gate and recorded that the pre-rework *look* (amplitude
   * simply proportional to energy, no visibility threshold) was right and the
   * defect was **frequency**. M13 rebuilt the frequency and — the owner's own
   * §13 q8 half — replaced the *trigger set*: wobble stopped being what the
   * ride does to a player who went fast, chose gravel, scraped a pedal or
   * reversed a carve, and became what a visible, avoidable hazard does. On the
   * clean Phase 4 re-ride (after the Phase 0 cadence probe was removed as an
   * illegitimate second trigger) his verdict was: wobble only on the correct
   * hazards, no carving wobbles, ship it on. M15 then classified visible bushes
   * as soft foliage hazards: they may charge one impulse on entry while
   * remaining pass-through. The slice therefore has foliage-triggered wobble;
   * the proving ground remains hazard-free.
   *
   * Zero still means what it always did — no energy ever enters the
   * oscillator: no weave, no `wobbling` state, no foot correction, no bracing
   * stance, no wobble-driven crash, no status-light rung. `?wobble=<gain>`
   * still writes this through live tuning, which now makes it the *off* switch
   * for diagnostic rides rather than the on switch it spent M13 being.
   */
  wobbleMasterGain: 1,
  /**
   * Energy per second per m/s ridden, per unit of the ground's own
   * `wobbleInjection` (`data/surfaces.ts`).
   *
   * **After M13 this scales exactly one surface.** Every other surface's
   * injection went to zero with the old trigger set, so gravel, grass and dirt
   * are lively underfoot and no longer feed the oscillator at all; the spill is
   * the only ground that does. That is what lets the amplitude threshold go
   * (see `wobbleStateEnergy`): with no continuous background source, any energy
   * at all means the rider hit something, so a weave can never become the
   * permanent state of riding a rough surface.
   */
  wobbleSurfaceGain: 0.012,
  /**
   * Energy at or above which the wheel reports the `wobbling` state.
   *
   * **M13 narrowed this to one job.** Until M13 it did two: it named the state
   * *and* it was the threshold below which the oscillation was invisible. The
   * second job existed because ordinary rough ground fed the oscillator
   * continuously, and without a dead band choosing gravel would have meant
   * weaving forever. With the trigger set reduced to hazards that ground no
   * longer supplies anything, so the dead band was protecting against a case
   * that can no longer happen — while costing every real wobble its visible
   * onset, which is exactly the "amplitude simply proportional to the energy"
   * the owner asked to have back. Amplitude now starts at zero energy.
   *
   * What survives is the question of when a wobble is an *event*: at or above
   * this the wheel reports `wobbling`, the rider drops their hips and opens
   * their arms, and the status light counts its second rung. Below it the wheel
   * visibly swings and Cool Rider rides it out without ceremony. **The rider's
   * bracing stance is gated on this same number**, which is why there is one
   * and not two — two would drift apart and the state name would stop meaning
   * what the pose shows. Both remaps are computed in `EucController.writePose`
   * so the rig cannot re-derive them against a stale table.
   */
  wobbleStateEnergy: 0.35,
  /**
   * The bench probe: metres of ground between impulses, and their size.
   * **Zero metres is off, it ships off, and since Phase 4 no URL can arm it.**
   *
   * It was born as M13 Phase 0's ride diagnostic: at Phase 0 no world contained
   * a hazard, so nothing could start a wobble for the owner to judge, and
   * `?wobble=1` armed this cadence to supply hazard-shaped hits on a timer.
   * Phase 3 put real hazards on every generated route, and on the Phase 4 exit
   * ride the leftover cadence made the weave feel "always on" — the road was
   * wobbling the rider every sixty metres regardless of what he rode over. The
   * owner's standing rule is that **nothing but a hazard may ever trigger
   * wobble**, so the URL path was deleted (`Game.applyWobbleQuery` sets the
   * master gain and nothing else).
   *
   * What remains is a test instrument. The wobble suites charge the oscillator
   * through this cadence because it is deterministic on the fixed step —
   * `advance(n)` reaches the same wobble every run — which riding over a
   * placed hazard cannot promise. Only a test or the F4 panel can raise it,
   * and the energy stays sized as a hazard-shaped hit: over the state
   * threshold, well short of the crash threshold.
   */
  wobbleProbeMetres: 0,
  wobbleProbeEnergy: 0.55,

  /**
   * What hitting a pothole costs — M13 Phase 1.
   *
   * **These are the wobble's trigger set, and after M13 they are all of it.**
   * The owner named the shape at §13 q8: a shallow hole starts a wobble, a deep
   * one is a wipeout. Everything the ride used to inject with — speed, rough
   * ground, a scraped pedal, a reversed carve, an unhopped kerb, a hard landing
   * — was deleted at Phase 0, so a player who is never careless around a hole
   * never meets the oscillator at all.
   *
   * **A spill is not here, because a spill is not an event.** It is ground, and
   * it injects continuously through `wobbleSurfaceGain` for exactly as long as
   * the wheel is on it (`data/surfaces.ts`). That difference is the whole
   * reason the two hazard families are modelled differently, and it is also the
   * gameplay difference: you ride *out* of a puddle, and you have already hit
   * the pothole.
   *
   * Both wobble impulses go through `injectWobble`, so `wobbleMasterGain`
   * silences them together with everything else — one switch, and it turns the
   * milestone on whole. The speed costs and the deep-hole crash are **not**
   * gated by it, because losing speed in a hole is not a wobble and a wipeout
   * is not a weave; the gate that keeps those out of a default player's ride is
   * that no default world contains a hazard at all.
   */
  /**
   * A shallow hole: energy injected, and speed taken, on entry.
   *
   * Sized against `wobbleStateEnergy` (0.35) rather than against the crash
   * threshold — a shallow hole is meant to *announce* a wobble, so this clears
   * the `wobbling` state by a clear margin and leaves most of the runway to the
   * crash. The speed cost is what makes hitting one cost a time even when the
   * weave is ridden out cleanly, which is what stops the fastest line being the
   * one that ignores hazards entirely.
   */
  hazardShallowEnergy: 0.55,
  hazardShallowSpeedCost: 1.60,
  /**
   * A deep hole ridden slowly enough to survive: energy, and speed taken.
   *
   * Deliberately close to `wobbleCrashEnergy` (1.0). Below the crash speed a
   * deep hole is not a free pass — it is the worst wobble in the game and a
   * recovery the player has to actually make, on top of a speed cost heavy
   * enough to end a competitive run. "Survivable" and "cheap" are different
   * words and this is where they separate.
   */
  hazardDeepEnergy: 0.88,
  hazardDeepSpeedCost: 5.00,
  /**
   * Speed at or above which a deep hole is a crash rather than a save, m/s.
   *
   * **This is the owner's speed gate** (§13, deep potholes), and the number the
   * Phase 2 readability ride exists to confirm: it is only fair if a deep hole
   * can be *seen* far enough out to slow down for. Against a 29.1 m/s top
   * speed (22.3 before M30 Phase 4), 6.5 leaves a wide band of ordinary
   * cruising in which a deep hole ends the run, and a genuine reward for
   * having braked. On F4 so the ride can
   * move it against what the eye can actually do at 20 and 40 metres.
   *
   * **Deliberately left where it was at M16 when the top speed rose.** It is an
   * absolute speed the wheel survives a hole at, not a fraction of the ride, so
   * a faster wheel means slowing down further rather than slowing down less.
   * The fairness half of the bargain scales on its own: `routeValidator.ts`
   * derives the sight line a hazard needs from the top speed, so a hole is
   * still shown early enough to brake for.
   */
  hazardCrashSpeed: 6.50,

  /**
   * The power ladder (`docs/PLANS.md` §4.5), as one `loadFactor` scalar.
   *
   * "The system should not require the player to understand electrical
   * engineering" (the vision, §8.2). There is no battery, no temperature, and
   * no motor curve here: there is how fast the wheel is going, how steep the
   * ground is, how hard the rider is asking, and what the last landing cost —
   * which is exactly the four inputs §4.5 names, summed into one number between
   * 0 and about 1.5.
   *
   * **Cutout is DEFERRED and the slice's "generous invisible assist" is that
   * there is no failure stage at all.** The ladder ends at tilt-back, which
   * caps speed until the demand falls; ordinary play cannot lose the wheel to
   * power, only to wobble, and only after being shown the wobble.
   */
  /**
   * Speed at which the load term starts, and the speed that scores 1.0, m/s.
   *
   * **Both were scaled with the top speed at M16, by the same 1.476, and that
   * is what keeps the whole ladder where the owner left it.** These are not
   * absolute speeds a motor dislikes; they are the shape of "how near its own
   * limit is the wheel", and the limit moved. Left at 11.5/17.0 against a
   * 22.3 m/s top speed, flat-out riding on flat pavement would have scored 1.0
   * and tilted the rider back on an empty straight — the speed limiter the
   * owner had already removed once for being annoying, reintroduced by
   * accident as a side effect of going faster.
   *
   * Scaling both preserves every rung arithmetically, because the slope term
   * below divides by `powerLimitSpeed` and climbs now happen proportionally
   * faster: an 11° climb at full throttle scored 0.586 before and 0.585 after,
   * and flat-out on the flat scored 0.658 before and 0.657 after.
   *
   * **Scaled a second time at M30 Phase 4**, by the 65 mph preset's ratio
   * 1.3020836382364829, for exactly the same reason and by the same recipe:
   * 17.0 → 22.135421850020208 and 25.1 → 32.68229931973572. Derived, not
   * typed — see `EUC.dragCoefficient` above and `topSpeedPreset.test.ts`.
   */
  powerComfortSpeed: 22.135421850020208,
  powerLimitSpeed: 32.68229931973572,
  /**
   * Load per unit of sin(gradient) while climbing. Descending contributes 0.
   *
   * **Sized against the fact that climbing also slows the wheel down.** A hill
   * costs speed through `-g sin(slope)` (§4.1), which pulls the speed term
   * *down* as the slope term pushes up — so at 1.6 the two nearly cancelled and
   * the authored 11° gradient produced less load than flat-out riding on the
   * pad, which is exactly backwards. At 4.0, against the speed scaling the
   * controller applies to this term (climbing costs *power*, not torque — see
   * `stepPower`), a settled climb at full throttle sits in the amber rung and
   * *charging* a hill at speed spikes into tilt-back, which is what makes hill
   * climbing "consume power headroom" in the way §4.1 promises it would.
   */
  powerSlopeLoad: 4.00,
  /** Load at full drive authority. Small: a launch is brief and low-speed. */
  powerAccelLoad: 0.25,
  /** Load added per unit of normalised landing impact, and how fast it fades. */
  powerLandingLoad: 0.55,
  powerLandingDecaySeconds: 1.40,
  /**
   * Time constants for the load rising and falling, seconds.
   *
   * Asymmetric, and that is what makes the ladder about *sustained* demand
   * rather than about instantaneous numbers: a second of full throttle does not
   * climb it, a long climb at speed does, and relief takes longer to arrive
   * than trouble did. It is also what keeps a faceted heightfield normal from
   * flickering the stage on a rolling hill.
   */
  powerResponseSeconds: 0.55,
  powerReliefSeconds: 1.20,
  /**
   * The three rungs (`docs/PLANS.md` §4.5: normal → beep → stronger beep and
   * amber → tilt-back).
   *
   * `notice` sits just above what flat-out riding on flat pavement produces
   * (0.66), so the wheel warns in the last metre-per-second of its own top
   * speed and is silent everywhere else. `warn` is out of reach on the flat
   * entirely. `tiltBack` needs a climb at speed, or a heavy landing while
   * already fast — the vision's own cutout conditions (§8.4), applied to a
   * stage the rider can ride out of.
   */
  powerNoticeLoad: 0.60,
  powerWarnLoad: 0.82,
  powerTiltBackLoad: 1.00,
  /**
   * Fraction of the engage load the demand must fall back to before tilt-back
   * releases.
   *
   * **A ratio rather than a second absolute number, so the two cannot invert.**
   * `powerTiltBackLoad` is on F4, and an owner who drags it below a fixed
   * release threshold would get a stage that engages and releases on the same
   * step forever. Expressed against the engage load, the hysteresis holds
   * wherever the slider is put.
   */
  powerTiltBackRelease: 0.80,
  /**
   * Where tilt-back holds the force lean, radians, and its two time constants.
   *
   * A real wheel tilts its pedals back until the rider has no choice but to
   * lean back with them. In this game's inverted control loop the same thing is
   * a *ceiling* on the force lean pulled down past neutral: the throttle stops
   * answering, the wheel brakes gently against the rider's demand, and speed
   * falls until the load does. Engaging faster than it releases, so the cap
   * arrives decisively and lets go without a lurch.
   *
   * Kept small deliberately. Most of what tilt-back costs is the drive
   * authority it removes — at terminal that is 7.7 m/s² of the 7.7 the wheel
   * was spending against drag and rolling resistance, on either wheel, since
   * the two balance there by construction — so 0.06 rad adds a further 1.3 m/s² of push-back
   * and reads as the machine leaning on the rider rather than as a brake
   * slamming on. Braking is untouched: a rider who asks for more lean-back
   * than this still gets all of it.
   */
  tiltBackLeanBack: 0.06,
  tiltBackEngageSeconds: 0.35,
  tiltBackReleaseSeconds: 0.50,
  /**
   * Extra rearward pitch of the machine itself at full tilt-back, radians.
   *
   * On top of the pose the forced lean already produces. Tilt-back is something
   * the *wheel* does to the rider, so the pedals have to visibly tip back
   * underneath them rather than the rider merely choosing to lean.
   */
  tiltBackPedalPitch: 0.18,

  /**
   * The max-speed cutout, and the beeps that warn about it — M20.
   *
   * **Reopened by the owner on 2026-08-14**, and reopened narrowly. Cut-outs,
   * over-speed beeps and the alarm-then-cutout ladder were implemented once,
   * playtested, and removed as annoying; §2 of the feedback triage records that
   * decision and it still stands for all of it *except* this: *"just for max
   * speed, so i would need the beeps"*. So there is one failure condition, it
   * sits at the very top of the speed range, and everything below it is exactly
   * the ride the owner has already accepted. The full realism — a cutout that
   * can arrive under load on a hill, an alarm ladder, a battery model — stays
   * REJECTED and stays Simulation Mode's if it is ever anybody's.
   *
   * **Everything here is a share of the wheel's own top speed, never a speed.**
   * That is M16's lesson applied before it can bite again: four constants that
   * were secretly defined as the old top speed had to be found and rescaled by
   * hand when the top speed moved, and one of them silently reintroduced a
   * feature the owner had removed. `EucController.derivedTopSpeed` recomputes
   * `sqrt(driveAccel / dragCoefficient)` from its own live tuning every time it
   * is asked, so dragging `EUC.dragCoefficient` on F4 moves the beeps and the
   * cutout with the ride instead of leaving them stranded at an old number.
   *
   * **The beeps are the whole safety net.** There is no HUD-only version of
   * this and no silent version: a cutout the player did not hear coming is the
   * unfairness §18.6 says is removed rather than tuned. `ui/hudModel.ts` draws
   * a warning glyph on the same schedule for a player riding with the sound
   * off, and that glyph is not optional either.
   *
   * **Tightened by the owner on 2026-09-22, after riding the 65 mph build**:
   * *"the high speed beeps maybe start too early and it is a bit hard to crash
   * due to overspeeding (cut out). it just beeps a lot at the top speed before
   * the wipeout. players have given feedback that they like the high speed
   * cutout, so the current safeguard is too strong. overspeed wipeouts should
   * trigger more easily than they currently do."* Measured through the real
   * controller, flat pavement, full throttle: the shipped 65 wheel beeped for
   * **6.5 s (30 beeps)** from 52.3 mph at 4.6 s to the cutout at 11.1 s, and
   * the `?mph=50` wheel for 5.2 s (24 beeps). With the band moved to
   * 0.87 → 0.94 the 65 wheel first beeps at 57.9 mph at 5.8 s and cuts out at
   * 8.5 s — **2.7 s, 10 beeps** — and the 50 wheel beeps for 2.2 s (8 beeps)
   * before cutting out at 6.7 s. Every rule above still holds: the beeps are
   * still the whole net, the glyph still mandatory, the edge still a share,
   * and riding the beeps is still a skill — only the band is narrower and
   * nearer the edge. **The cop does not follow this edge**; his wheel keeps
   * the pre-change one (`CHASE.copCutoutSpeedShare`), so a chase the owner
   * already finds too easy did not get easier by the player's wheel getting
   * touchier.
   */
  /**
   * Where the beeps start, as a share of top speed.
   *
   * **0.87 since 2026-09-22 — 57.9 mph on the shipped 65, 44.5 on the 50.**
   * The owner's words are in the block above: the beeps started too early and
   * went on too long. The number offered to him was about 0.84 (~56 mph); the
   * measurement said 0.84 still left 3.2 s and 13 beeps of warning flat out on
   * the 65, against the roughly two seconds that was the point, so the share
   * went on to 0.87. It still leaves a 4.6 mph band below the edge to ride
   * the beeps in, and ten beeps on the way through it. Everything below this
   * paragraph is the constant's history and still true of its *direction*.
   *
   * 0.785 was **40 mph on the 50 mph wheel** and is **52 mph on the shipped
   * 65** (M30 Phase 4). The owner's first number was 30 mph; he rode that
   * build on 2026-08-14 and moved it himself — *"30mph is too soon for the
   * beeping to start. it should beep no earlier than 40mph"* — so the share
   * was chosen to put the first beep a shade *above* 40 rather than a shade
   * below it. Stated as a share so it keeps its *place in the speed range*
   * rather than becoming an arbitrary absolute the day the wheel changes —
   * and the day came: M30 Phase 4 moved the wheel and this constant did not
   * have to be found by hand, which is the whole point of writing it this way.
   * His floor of 40 mph is honoured with room to spare, and the warning still
   * arrives at the same fraction of the way to the edge. (That fraction was
   * 0.785 until 2026-09-22; see above.)
   */
  overspeedBeepShare: 0.87,
  /**
   * Where the wheel gives up, as a share of top speed.
   *
   * **Below 1, and it has to be**, because top speed is where drag balances
   * drive and the wheel approaches it asymptotically — a threshold at 1.00
   * would be a cutout that can never fire on the flat, and one at 0.99 would
   * be a cutout that can never fire on the flat *either*, because rolling
   * resistance puts the real pavement terminal near 0.975 of the drag-only
   * figure this is a share of.
   *
   * It shipped at 0.965, where a rider holding full throttle on flat pavement
   * on the 65 wheel reached it after 11.1 s. **0.94 since 2026-09-22**, by the
   * owner's *"overspeed wipeouts should trigger more easily than they
   * currently do"*: 62.5 mph on the shipped 65 (49.4 → 48.1 on the 50), and
   * flat out now reaches it at 8.5 s (6.7 s on the 50). A rider who backs off
   * by a few percent still sits underneath it indefinitely with the beeps at
   * their fastest. That gap is the mechanic: **riding the beeps**, in the
   * owner's words, is a real thing to be good at rather than a warning to
   * obey — it is simply a smaller gap to ride in than it was.
   *
   * **The cop's wheel is not moved by this constant** — see
   * `CHASE.copCutoutSpeedShare`, which keeps his edge, and so his top speed,
   * where they were before the owner tightened the player's.
   */
  cutoutSpeedShare: 0.94,
  /**
   * How long the wheel must be over that speed before it lets go, seconds.
   *
   * The owner's shape is "very fast beeps shortly before the cutout", and this
   * is the shortly. It is also what stops a downhill blip or a single fast step
   * from taking a rider off with no beat of warning at maximum rate first.
   */
  cutoutHoldSeconds: 0.45,
  /**
   * The master switch, 0 or 1. **On F4**, like `ragdollEnabled`.
   *
   * A feature that was removed once for being annoying comes back behind a
   * switch the owner can throw mid-ride, so the gate ride can A/B it without a
   * rebuild. At zero the beeps and the glyph go with it: they exist to warn
   * about this and warning about nothing is the annoyance rule.
   */
  cutoutEnabled: 1,

  /**
   * Crash and recovery (`docs/PLANS.md` §4.5, `EUC_RIDER_MOTION_REFERENCE.md`
   * §16, the vision §9).
   *
   * **Non-graphic and animation-driven — but no longer over in a blink.**
   * The rider separates along a scripted path with a decaying tumble, the
   * wheel rolls on and falls over, and the whole thing plays out over about
   * three and a half seconds. §4.5's original "recovery in ≤1.2 s, auto at
   * ~1.5 s" is superseded by owner decision (2026-08-04): his recorded
   * wipeout — the "whoa", the wheel's frantic beeping, the tumbling thuds —
   * runs 3.4 s, and he asked for the *animation* to stretch to meet it
   * ("don't make the audio shorter, make the animation longer, more wipeout
   * ish") rather than the sound to be cut. "Avoid long realistic recovery"
   * (§15) still holds in spirit: the extra time is spectacle, not a
   * get-back-up minigame. M15 replaces the default statue-like path with a
   * crash-only particle ragdoll while retaining this scripted motion behind
   * the A/B switch. A persistent dismounted body and general world ragdoll
   * remain deferred.
   */
  /** Deceleration of the riderless wheel, m/s². It rolls on, then stops. */
  crashWheelDecel: 2.2,
  /**
   * Normal speed into an unclimbable obstacle that takes the rider off, m/s.
   *
   * The component into the face is used rather than total travel speed, so a
   * shallow scrape can carry speed along a wall while a much slower square hit
   * produces the vision's named obstacle-collision crash. At 3.5 m/s this is a
   * brisk running pace: below it the wheel can scrub to a stop and the rider
   * catches the machine; above it Cool Rider takes the fast side-fall path.
   */
  obstacleCrashSpeed: 3.5,
  /** How long the riderless wheel takes to lie down, seconds, and how far. */
  crashWheelFallSeconds: 0.85,
  crashWheelLean: 1.45,
  /**
   * Recovery timing, seconds — stretched to the owner's wipeout recording.
   *
   * The crash sound is his own 3.4 s take, and it ends when the tumbling
   * ends. Auto-recovery lands just past it so the picture never stands the
   * rider up while the audio is still rolling them over — the exact mismatch
   * he reported after riding the third pass. The earliest manual recovery
   * waits out the tumble itself (the wave in `writePose` has decayed to a
   * few percent by then); the trailing second of audio is quiet aftermath a
   * recovery can talk over without lying.
   *
   * Available means the rider can ask for it with any riding input; the
   * automatic one exists so a player who lets go still gets going again.
   */
  crashRecoverEarliestSeconds: 2.5,
  crashRecoverAutoSeconds: 3.6,
  /**
   * Fraction of the pre-crash speed the rider is restored with.
   *
   * **A decision worth the owner's eye.** Quick reset puts the rider back
   * stationary, and a crash recovery that did the same would answer "do I
   * immediately want another go?" with two seconds of re-acceleration every
   * time. Restoring at a third of the speed that was lost keeps the run moving
   * while still making the crash expensive. Set it to 0 on F4 for a full stop.
   */
  crashRecoverSpeedFactor: 0.35,
  /**
   * How long the ride must have been unremarkable before a position counts as
   * safe, seconds, and the wobble ceiling that disqualifies it.
   *
   * "Restoring the rider at the last validated safe position" (§4.5). Validated
   * means grounded, on the authored course, not refused by anything solid, and
   * not already in trouble — so a wobble crash restores well before the wobble
   * started, and hitting a wall restores just short of the wall.
   */
  crashSafeDelaySeconds: 0.80,
  crashSafeWobbleCeiling: 0.25,
  /**
   * The "brief invulnerable fade-in" (§4.5), in seconds.
   *
   * Wobble energy and load are held at zero for the invulnerable window, so a
   * rider restored into the middle of a gravel spur is not immediately crashed
   * again by the ground that got them. The rider fades in over the shorter
   * blend, which is also how long the `recovering` state lasts.
   */
  crashInvulnerableSeconds: 0.90,
  crashRecoverBlendSeconds: 0.45,
  /**
   * Speed boundaries between the crash motions the reference describes
   * (`EUC_RIDER_MOTION_REFERENCE.md` §16), m/s.
   *
   * Below the first it is a step-off; between them a run-out; above it a side
   * fall. A pedal-strike crash is a side fall at any speed, because the wheel
   * has been deflected out from under the rider rather than left behind them.
   */
  crashStepOffSpeed: 3.0,
  crashRunOutSpeed: 9.0,
  /**
   * Where the rider ends up relative to the wheel, metres, and how long the
   * separation takes.
   *
   * Expressed in the wheel's own frame and applied to the rider root, so the
   * separation costs no second body in the simulation and no second transform
   * in the level: the crash is a scripted offset on a rig that already exists,
   * which is exactly what "animation-driven, not ragdoll" buys.
   */
  crashSeparationForward: 2.1,
  crashSeparationLateral: 1.3,
  crashSeparationSeconds: 0.85,
  /**
   * The tumble: a decaying bounce layered over the separation, giving the
   * stretched crash something to *do* — "more wipeout ish" (owner,
   * 2026-08-04) — instead of freezing in the final pose for two seconds.
   *
   * One damped sine drives all of it: a side-falling rider's roll rocks past
   * flat and settles, their body bounces off the ground and lands again, and
   * a run-out's forward stumble bobs. The rate is about two impacts a
   * second decaying over the first second and a half, which is also roughly
   * what the thuds in the recording do; nothing is frame-synced to the
   * audio, and nothing needs to be — coincidence at this rate reads as sync.
   */
  crashTumbleHz: 2.0,
  /** Time constant of the tumble's decay, seconds. */
  crashTumbleDampSeconds: 0.55,
  /** Extra roll swing at full tumble, radians. Side falls only. */
  crashTumbleRoll: 0.45,
  /** Forward-pitch swing for the on-their-feet motions, radians. */
  crashTumblePitch: 0.16,
  /** How high the tumbling body bounces off the ground, metres. */
  crashTumbleBounce: 0.09,
  /**
   * How far a rider who came off *on their feet* drops, metres.
   *
   * The difference between riding hips and standing hips, and nothing more: a
   * run-out or a step-off ends with somebody upright next to a wheel, not with
   * somebody sinking into the ground. `RIDER_BLOCKOUT.restHipHeight` records
   * the same 0.12 m for the stopped rest stance, and for the same reason.
   */
  crashRiderDrop: 0.12,
  /**
   * Forward lean of a rider running the wheel off, radians.
   *
   * Only the run-out and the step-off take it. A side fall lies the rider down
   * by *rotating* them (see `crashSideFallRoll`), and pitching them forward as
   * well reads as a face-plant rather than as the non-graphic lateral fall
   * `EUC_RIDER_MOTION_REFERENCE.md` §16 describes.
   */
  crashRiderTumble: 0.28,
  /**
   * How far the hips drop in a side fall, metres.
   *
   * Small, because the roll does the work. The rider root sits at the contact
   * patch, so rolling 1.35 rad swings hips that were 0.92 m up out to 0.90 m
   * aside and 0.21 m above the ground — a person on their side. Dropping the
   * root as well put the whole figure through the floor, which is exactly what
   * the first browser capture of a crash showed.
   */
  crashSideFallDrop: 0.10,
  /**
   * Roll of the whole rider at a full side fall, radians.
   *
   * Here rather than in `RIDER_BLOCKOUT` with the crash arm splay, because the
   * controller is what scripts the separation: the pose carries plain metres
   * and radians and the rig applies them without a second opinion, exactly as
   * it does for the ground tilt. Constants the *renderer* decides stay in
   * `RIDER_BLOCKOUT`.
   */
  crashSideFallRoll: 1.35,

  // -- The crash ragdoll (M15) ----------------------------------------------
  /**
   * Whether a crash hands the rider to the particle ragdoll, 0 or 1.
   *
   * A number rather than a boolean because it rides the live-tuning store for
   * the owner's A/B ride: at 0 every crash is the scripted M6 separation,
   * bit-for-bit, and a headless test pins that reduction. Developer tuning,
   * not a player option (invariant 5) — if the ragdoll is annoying the
   * standing rule applies and it is removed, not left as a toggle.
   */
  ragdollEnabled: 1,
  /** How long the rig takes to blend from the riding pose into the particles, s. */
  ragdollBlendSeconds: 0.12,
  /**
   * Fraction of particle velocity shed per second.
   *
   * High on purpose: `EUC_RIDER_MOTION_REFERENCE.md` §15 wants the crash
   * over quickly, and a body that is visibly settled before manual recovery
   * opens (2.5 s) is what keeps the tumble funny rather than harrowing.
   */
  ragdollDamping: 1.6,
  /** Constraint relaxation passes per step. 3 at 120 Hz holds the body stiff. */
  ragdollIterations: 3,
  /** Tangential velocity shed per second of ground contact — skid vs slide. */
  ragdollFriction: 9.0,
  /** Fraction of impact velocity returned by ground and wall contacts. */
  ragdollRestitution: 0.3,
  /** Pull of the hands toward the head, 1/s² — §16's "arms protect body". */
  ragdollCurlGain: 26,
  /** Gentler pull of the feet toward the pelvis, 1/s² — the tuck half. */
  ragdollTuckGain: 9,
  /** Upward launch as a fraction of crash speed, and its ceiling, m/s. */
  ragdollLaunchPop: 0.28,
  ragdollLaunchPopMax: 3.0,
  /** How much of the ride's momentum the flung upper body keeps over a solid. */
  ragdollLaunchCarry: 1.0,
  /** Lateral shove of a side fall, m/s. */
  ragdollLaunchSide: 1.7,
  /** Extra head-over velocity when the wheel stops dead against a solid, m/s. */
  ragdollLaunchTumble: 1.5,
  /**
   * What share of those two a crash at a **standstill** keeps — the owner's
   * 2026-08-27 couch ride.
   *
   * **The two impulses above are the only ones in the seed that are not made of
   * speed**, and that is the defect he reported: *"the rider flies out even at
   * very slow speed … as if they were colliding at very high speed. too
   * exagerated."* Everything else scales — the forward carry is the ride
   * velocity, the pop is a fraction of it, and the wheel's own flourish is
   * gated at `crashWheelFlourishSpeed` — so a crawl already read as a crawl
   * everywhere except the side shove and the head-over tumble, which fired at
   * full strength from a dead stop.
   *
   * They now ride a ramp from this share at rest to full at
   * **`crashRunOutSpeed`**, which is a derived speed rather than a chosen one
   * and that is the point (M16's lesson). Above 9 m/s a side fall is *already*
   * classified by speed alone, so pinning full strength there makes "every
   * crash the speed bands chose is untouched" true by construction instead of
   * by a coincidence between two numbers somebody has to keep in step.
   *
   * The floor exists because zero is not the right answer either: a rider
   * knocked off a parked wheel still has to go over, and a launch that faded to
   * nothing would leave them sagging where they stood. A quarter of the shove
   * is a topple; the whole of it is being hit by a car.
   *
   * What this reaches, and nothing else: `pedalStrike`, `obstacle` and `struck`
   * below 9 m/s — which since the same ride is every paddle strike in the game
   * that lands on somebody who was not moving (`PADDLE.hardKnockShare`).
   */
  crashLaunchFloor: 0.25,
  /** Extra damping per second while a particle is inside soft foliage. */
  ragdollSoftDamping: 7.0,

  // -- The wheel's own crash flourish (M15, owner-approved §15.5 q4) --------
  /**
   * A hard stop deserves a machine with an opinion: at or above this impact
   * speed (m/s), an obstacle or side-fall crash bounces the wheel and spins
   * it out before it lies down. Below it the wheel keeps the quiet M6 fall.
   */
  crashWheelFlourishSpeed: 5.0,
  /** Initial spin-out rate about +Y, rad/s, and its decay time constant, s. */
  crashWheelSpinRate: 7.0,
  crashWheelSpinDampSeconds: 0.8,
  /** Upward bounce as a fraction of impact speed, its ceiling (m/s), and the
   *  fraction of fall speed each ground contact returns. */
  crashWheelPopFactor: 0.16,
  crashWheelPopMax: 2.4,
  crashWheelPopRestitution: 0.45,

  // -- Soft foliage (M15) ---------------------------------------------------
  /**
   * Deceleration while the wheel is inside a soft body, m/s², plus a v²
   * term — a bush is a cushion, not a wall. Riding through one at walking
   * pace costs a lurch; hitting one flat-out sheds most of the run's speed
   * inside a couple of metres and never manufactures a crash.
   */
  softBodyDrag: 6.5,
  softBodyDragQuadratic: 0.04,
  /**
   * Speed below which the constant drag term fades out, m/s — M24.
   *
   * Without the fade, a wheel that came to rest *inside* a bush was trapped:
   * 6.5 m/s² of constant drag beats the drive a standing start can build, so
   * full throttle produced 0.00 m/s forever — measured on a bare controller,
   * six seconds, no exaggeration. A player could only reset out, and the
   * chase's CPU deterministically parked himself into one and besieged a
   * fixture on it. Scaling the constant term by `|speed| / this` leaves the
   * cushion untouched at riding speeds and gives a stopped wheel an
   * equilibrium push-through at about walking pace, which is what shoving a
   * wheel out of a hedge should feel like.
   */
  softBodyDragFadeSpeed: 1.0,
  /** Wobble energy injected once on entering a soft foliage hazard. */
  softBodyWobbleEnergy: 0.35,
} as const;

/**
 * Bright clear daytime. LOCKED for the vertical slice (docs/PLANS.md 2.2),
 * chosen for terrain readability over photogenic warmth.
 *
 * Lighting, tone mapping, exposure, emissive levels, and grading are ONE
 * coupled system with ONE owner (AGENTS.md invariant 6). Change them
 * sequentially. Never in parallel with anything else.
 */
export const LIGHTING = {
  /** Sun elevation above the horizon. High enough to keep shadows short. */
  sunElevation: 0.96,
  /** Sun compass bearing, measured from +Z (forward) toward +X (right). */
  sunAzimuth: 2.36,
  /** Distance at which the sun is placed. Directional light, so cosmetic. */
  sunDistance: 60,
  /** Slightly warm midday white. */
  sunColour: 0xfff4e6,
  sunIntensity: 2.6,

  /** Clear-sky upper hemisphere. */
  skyColour: 0x9dc4ea,
  /**
   * Ground bounce. Downward-facing surfaces sample this — the underside of
   * the rider, the wheel, and every overhang. Too dark and the wheel's
   * underside becomes a void; too bright and nothing reads as sitting on
   * the ground.
   */
  groundBounceColour: 0xb2ab97,
  hemisphereIntensity: 1.10,

  /**
   * The value the sky reaches at the horizon, and the colour of the haze.
   *
   * Until M7.5 this was the whole background: one flat clear colour behind
   * everything. It is now the *bottom stop* of a painted sky, which is what
   * keeps the contract in `DESIGN.md` §6 true — the haze still dissolves the
   * surround's far edge into exactly the value the sky has where that edge
   * meets it, so there is no band. Move this and the sky moves with it.
   */
  horizonColour: 0xbcd6ee,

  /**
   * The sky — added at M7.5, and it is the largest single reason the slice
   * read as a diagram of a place rather than a place. A flat background colour
   * has no depth cue in it at all: nothing tells the eye where up is, the
   * horizon is a hard division between two flat fields, and the sun that casts
   * every shadow in the frame is nowhere to be seen.
   *
   * Painted procedurally into one equirectangular `DataTexture`
   * (`render/skyImage.ts`) and hung on `scene.background`, so it costs no
   * scene object, no draw call in the forward pass, and no post-processing —
   * invariant 7 is intact.
   *
   * **The sun's position in the painted sky is derived from `sunAzimuth` and
   * `sunElevation` above, never authored separately.** A painted sun that
   * disagrees with the light casting the shadows is the kind of error nobody
   * sees directly and everybody feels.
   */
  skyTextureWidth: 1024,
  skyTextureHeight: 512,

  /**
   * Straight up. Deeper and more saturated than the horizon, as a real clear
   * sky is. linear (0.098, 0.287, 0.687) — see `DESIGN.md` §2 before changing
   * this by eye in a colour picker. The §2 legibility ceiling of 0.6 bounds
   * ground *materials*, which are lit and judged against each other; the sky
   * is unlit background and is allowed to be the brightest thing in the frame.
   */
  skyZenithColour: 0x5892d8,
  /**
   * Shapes the horizon-to-zenith ramp. Below 1 keeps the pale band thin and
   * close to the horizon, which is both what the sky does and what keeps the
   * bright value away from the part of the frame the terrain sits against.
   */
  skyGradientExponent: 0.62,

  /** The sun's core and aureole in the painted sky. Warmer than the sky. */
  skySunColour: 0xfff2dc,
  /** Angular radius of the bright core, radians. */
  skySunCoreSpread: 0.055,
  /** Angular radius of the wide aureole, radians. */
  skySunGlowSpread: 0.34,
  /** How much of the aureole reaches the sky, 0–1. */
  skySunGlowStrength: 0.75,

  /**
   * Forward scattering low in the sun's compass direction.
   *
   * Measured, not chosen: the sun is at 55° and the chase camera sees about
   * the first 25° above the horizon, so without this the entire painted sun
   * is out of frame during play. Zero exactly at the horizon, by contract —
   * see `render/skyImage.ts`.
   */
  skySunHorizonWarmth: 0.30,
  skySunHorizonSpread: 1.05,
  skySunHorizonPeak: 0.20,

  /**
   * Clouds. Coverage is a threshold on a noise field rather than a count, so
   * raising it grows the clouds that are already there instead of reshuffling
   * the sky — which is what makes it tunable by eye.
   *
   * Kept deliberately light. The mood is LOCKED as bright clear daytime
   * (`docs/PLANS.md` §2.2) and a heavy sky is a different mood; these exist to
   * give the eye something to place the horizon against, not to overcast it.
   */
  skyCloudLitColour: 0xfdfeff,
  skyCloudShadeColour: 0xb9c8da,
  skyCloudCoverage: 0.46,
  skyCloudSoftness: 0.26,
  /**
   * Noise frequency on the cloud plane, in units of the cloud height.
   *
   * The projection is `1 / sin(elevation)`, so the plane coordinate runs from
   * about 1 straight overhead to about 20 near the horizon. A frequency chosen
   * against the *sphere* rather than against that range puts the entire
   * visible sky inside one noise cell and paints nothing at all — which is
   * exactly what the first pass did.
   */
  skyCloudScale: 0.55,
  /**
   * Sky height, as sin(elevation), below which clouds have faded out. Two
   * jobs: real cloud does thin into haze at the horizon, and the plane
   * projection the cloud field uses runs away as it approaches the horizon,
   * where unclamped it aliases into stripes.
   */
  skyCloudHorizonFade: 0.045,

  /**
   * Distance haze — added at M4, and it does a job rather than setting a mood.
   *
   * The world now has an outside: a level surround the renderer draws as one
   * large plane centred on the rider. Any finite plane has an edge, and at eye
   * height that edge lands a fraction of a degree below the horizon, where it
   * reads as a hard line with sky underneath it. Fading the far distance into
   * the horizon colour hides the edge completely and buys honest atmospheric
   * perspective on the way — which is a genuine terrain-reading aid, and the
   * reason it is here rather than in a later "polish" milestone.
   *
   * It is linear fog, which is a per-material built-in and not post-processing
   * (invariant 7 is intact). It belongs to the coupled visual system this file
   * documents and `render/Renderer.ts` owns (invariant 6): the colour is the
   * background colour, and moving one without the other produces a horizon
   * band that does not match the sky.
   *
   * `far` sits inside the camera's own far plane so the surround is fully faded
   * before anything could be clipped by it.
   */
  fogNear: 120,
  fogFar: 470,

  /** ACES filmic tone mapping exposure. */
  exposure: 1.0,

  /**
   * Single shadow cascade. The budget allows one 2048 map; its orthographic
   * extent is kept tight around the rider so texels stay dense where they
   * are actually read.
   */
  shadowMapSize: 2048,
  shadowRadius: 30,
  shadowBias: -0.0005,
  shadowNormalBias: 0.02,
} as const;

/**
 * The chase camera — M3, and the second-most important system in the game.
 *
 * A spring arm anchored at the rider's hip, aimed at a point ahead of them,
 * lagging their heading, banking into the corner, and pulling in when
 * something solid gets between the two. Everything below is a designed feel;
 * the numbers are chosen for what they produce at the extremes.
 *
 * **Priority when goals conflict** (`EUC_THRILLS_GAME_VISION.md` 10,
 * `docs/PLANS.md` 5), and the order the step function applies them in:
 *
 *   1. Playability — the obstruction pull-in overrides everything else, and it
 *      is applied last for exactly that reason.
 *   2. Terrain visibility — the look-ahead offset, which is what puts ground
 *      the rider has not reached yet into the frame.
 *   3. Speed sensation — the eased arm length and field of view.
 *   4. Rider readability — the anchor height and the capped bank, which is why
 *      the bank is a sixth of the rider's lean rather than matching it.
 *   5. Cinematic presentation — nothing here is for a screenshot.
 *
 * **Motion sickness is a hard constraint, not a preference.** Every response
 * below is a first-order `approach`, which cannot overshoot; the bank is
 * capped; the field of view moves more slowly than the arm so it reads as a
 * build rather than a pulse; and the pull-in restores an order of magnitude
 * more slowly than it engages so the camera can never pop.
 *
 * These are developer tuning values. The player-facing FOV trim arrives
 * through a separate mechanism and must not be routed through here — see the
 * options firewall, invariant 5.
 */
export const CAMERA = {
  /** Vertical field of view, radians. Eased between these with speed. */
  fovAtRest: 1.13,
  fovAtSpeed: 1.36,

  /**
   * How the split view widens the two above, and where the widening stops —
   * M25 Phase 3.
   *
   * A vertical split halves each view's aspect, and a perspective camera's
   * horizontal angle comes out of the vertical one through it. Left alone,
   * `fovAtRest` on a half-width view drops the horizontal angle from 96.8
   * degrees to 58.8 on a 1920x1080 screen: half the screen, but far less than
   * half the road. Recovering the horizontal exactly needs 103 degrees of
   * vertical at rest and 116 at speed, which this file's own header rules out
   * in its first line.
   *
   * So the split multiplies by the gain and stops at the cap. The gain buys
   * most of the lost horizontal back; the cap keeps the widest frame inside
   * what the paragraph above tolerates — and the two are separate numbers
   * rather than one clamped angle so that the speed ease *survives the split*.
   * A single cap applied to both ends would flatten `fovAtRest` and
   * `fovAtSpeed` onto the same value and delete the strongest speed cue in the
   * game at exactly the moment two players are racing each other.
   *
   * Both are live-tunable because `docs/PLANS.md` §25.5 gives the owner's own
   * look the final say on the split projection.
   */
  splitFovGain: 1.22,
  splitFovCap: 1.52,

  /**
   * The same question for a **quadrant**, whose answer is "almost nothing" —
   * M27 Phase 1 (§27.2).
   *
   * Everything above is an argument about a *half*, and every number in it
   * comes from halving the aspect on one axis. Three or four seats halve both
   * axes, so each pane keeps the canvas's own 16:9 and the keyhole the gain
   * exists to reopen never closes: a 960x540 quadrant of a 1920x1080 canvas
   * frames exactly what the full canvas frames, at a quarter of the pixels.
   *
   * So it ships at 1 — **the value that switches the treatment off**, which is
   * this project's way of recording a decision where it will be found rather
   * than leaving four players silently sharing two players' widening. It is
   * live-tunable beside the other two because §27.6 gives the same owner look
   * the final say on the grid's projection that §25.5 gave it on the split's,
   * and because a shape nobody has ridden yet is exactly the shape worth being
   * able to move by eye.
   */
  quadFovGain: 1,
  /** Spring-arm length, metres, eased with speed. */
  distanceAtRest: 4.2,
  distanceAtSpeed: 6.0,
  /** Height of the look target above the rider's hip. */
  targetHeightOffset: 0.35,

  /**
   * Speed at which the speed expression is fully applied, m/s.
   *
   * The controller's drag balances drive authority at 29.1 m/s on pavement, so
   * this is the wheel's own top speed rather than an invented ceiling: full arm
   * length, full field of view, and the shortest yaw lag all coincide with the
   * fastest the rider can actually go.
   *
   * **Moved with the top speed at M16** (from 15.0), which is the whole reason
   * it is written as "the wheel's top speed" rather than as a number. Left
   * behind, every camera expression would have been fully spent at two thirds
   * of the new speed range and 50 mph would have been framed exactly like
   * 34 mph. The cost is real and was taken deliberately: the same 10 m/s now
   * sits lower up the curve than it used to, so ordinary cruising is framed a
   * little calmer — which is what leaves the top end somewhere to go.
   *
   * **Moved again at M30 Phase 4** with the shipped 65 mph wheel, to that
   * wheel's own flat-pavement terminal 29.0576 m/s (65 × 0.44704 exactly).
   * The preset writes it rather than scaling it, because "the wheel's own top
   * speed" is its definition rather than a number to rescale. Same cost taken
   * a second time: cruising is framed calmer still, and the top end has
   * somewhere to go.
   */
  speedReference: 29.0576,

  /**
   * Height of the arm's far end above the contact patch, metres.
   *
   * With the look target at hip height plus `targetHeightOffset` (1.27 m) this
   * puts the camera about 0.68 m above what it is aiming at, which is a gentle
   * downward pitch at rest and a flatter one at speed — because the look-ahead
   * offset lengthens the run to the target while the rise stays constant. The
   * camera getting *flatter* as speed rises is what keeps upcoming ground in
   * frame exactly when the rider needs it.
   *
   * The M2 parked chase used 2.1 m at 4.6 m back and the owner accepted the
   * ride from it; this sits slightly lower because the arm now grows to 6.0 m.
   */
  armHeight: 1.95,

  /**
   * How far ahead of the rider the camera aims, expressed as seconds of
   * travel, and the ceiling on that offset in metres.
   *
   * Seconds rather than metres because it states the thing that actually
   * matters — *the camera looks at where the rider will be a fifth of a second
   * from now* — and because it then scales with speed for free. At the wheel's
   * top speed this is about 3.3 m of ground, which is roughly one wheel-length
   * short of the cap.
   *
   * Reverse contributes nothing: a rider backing up at walking pace to
   * reposition does not want the camera aiming behind them.
   */
  lookAheadSeconds: 0.22,
  lookAheadMax: 3.6,
  /** Time constant for the look-ahead offset chasing its target, seconds. */
  lookAheadResponseSeconds: 0.35,

  /**
   * Time constant for the arm length chasing its speed target, seconds.
   *
   * Slow enough that a launch reads as the camera being *left behind* and then
   * settling, which is most of the sensation of accelerating.
   */
  distanceResponseSeconds: 0.55,
  /**
   * Time constant for the field of view, seconds. Deliberately slower than the
   * arm: field of view is the strongest speed cue available and also the
   * easiest one to make somebody ill with. A slow follower cannot pulse.
   */
  fovResponseSeconds: 0.70,

  /**
   * Yaw-follow time constants, seconds. The lag SHORTENS as speed rises.
   *
   * Backwards from the intuitive choice, and deliberately so. At low speed the
   * wheel can pivot at 2.4 rad/s in a tight space, and a camera that chased
   * that would whip; a long lag lets the rider spin under a nearly stationary
   * camera. At speed the heading changes slowly and the player wants to feel
   * locked in behind the wheel, so the camera tracks almost rigidly.
   */
  yawLagAtRest: 0.42,
  yawLagAtSpeed: 0.14,

  /**
   * Camera bank, as a fraction of the rider's lean, and its cap in radians.
   *
   * `docs/PLANS.md` 5 specifies `riderRoll x 0.15`. Read literally against the
   * pose field of that name — the upper-body roll — it was one degree at a
   * full carve when the M2 reassessment held that roll at 0.18 of the wheel's
   * lean, which is not a feature; since M30 Phase 3 the upper body follows a
   * speed schedule (`simulation/riderLean.ts`) and takes the whole of the
   * cornering lean from 22.25 m/s up — which the shipped 65 wheel's full-lock
   * carve, settling at 27.0 m/s, is past; `?mph=50`'s settles at 20.6 m/s and
   * takes 0.92 of it — so the literal reading would now bank within 8 % of
   * the chosen one at worst and exactly on it at speed. The
   * decision is unchanged either way: the plan predates the split and means
   * the rider's lean into the corner, which is the wheel and lower-body angle,
   * `pose.rollAngle` — and M30's fourth answer keeps the camera on the wheel
   * on purpose, so a rider hanging inside a saturated bank (Phase 2) does not
   * tilt the horizon further. At the controller's 0.75 g lateral limit that
   * lean is 0.64 rad, so the bank reaches 0.096 rad (5.5 degrees) — present,
   * subtle, and short of the cap. Flagged for the owner rather than settled
   * silently, because it is a documented number being reinterpreted.
   *
   * The cap exists because uncapped bank is a motion-sickness trap and because
   * a tilted horizon costs terrain readability, which outranks speed sensation.
   */
  bankFactor: 0.15,
  bankMaxRadians: 0.10,
  /** Time constant for the bank chasing the lean, seconds. */
  bankResponseSeconds: 0.18,

  /**
   * Obstruction: the radius kept clear around the camera, the closest the arm
   * may ever be pulled, and the two response times.
   *
   * **The rates are asymmetric on purpose.** Pulling in has to be nearly
   * instant or the camera spends a frame or two inside a wall; restoring has
   * to be slow or every pillar the rider passes throws the camera outward in a
   * visible snap. Fast in, slow out, and neither is a step.
   */
  obstructionRadius: 0.35,
  obstructionMinDistance: 1.6,
  obstructionPullInSeconds: 0.05,
  obstructionRestoreSeconds: 0.55,

  // -- Airborne and landing (M5) --------------------------------------------
  //
  // `docs/PLANS.md` §5: "Airborne: freeze pitch-follow, keep the rider framed,
  // ease back on landing." Until M5 the camera's anchor was the rider's exact
  // height, which is right on the ground and wrong the instant they leave it —
  // a 0.46 m hop would throw the whole view up half a metre in a fifth of a
  // second, taking the horizon and the upcoming ground with it.

  /**
   * Fraction of the rider's height above the ground the camera follows while
   * airborne, 0..1.
   *
   * Zero would pin the camera to the take-off height and let the rider fly out
   * of the top of the frame; one is the old behaviour and is the thing that
   * makes people ill. A third keeps the rider comfortably framed while leaving
   * two thirds of the hop visible *as* a hop, which is the only way the player
   * can see how much air they got.
   *
   * On the ground the followed height is the rider's exactly, so every M3 and
   * M4 camera number is untouched: this can only differ from zero while the
   * wheel is off the ground or easing back after a landing.
   */
  airHeightFollow: 0.35,
  /** Time constant for the camera tracking the hop, seconds. Short: it must
   *  keep up with the rise rather than lag it into a lurch. */
  airHeightResponseSeconds: 0.10,
  /**
   * Time constant for easing the height offset back out after touchdown, s.
   *
   * The "ease back on landing" half of §5. Longer than the rise, because a
   * snap back to the ground reference at the moment of impact is a pop, and
   * the landing already has the dip below to say something happened.
   */
  landingRestoreSeconds: 0.45,
  /**
   * Camera drop per m/s of normal impact, m, and its ceiling.
   *
   * §4.4 names a "camera dip" as part of a heavy landing. It is deliberately
   * *not* shake: one smooth first-order impulse that decays to zero, capped,
   * with no oscillation and no per-frame noise. It remains the one authored
   * landing response after the owner removed continuous camera shake at M9.
   */
  landingDipPerImpact: 0.028,
  landingDipMax: 0.14,
  landingDipRecoverSeconds: 0.42,

  // -- Crash framing (M6) -----------------------------------------------------
  //
  // `docs/PLANS.md` §5: "Crash: detach and ease to a wider framing keeping both
  // rider and wheel in shot." The rider separates by up to 2.4 m from a wheel
  // that is still rolling, so the ordinary 4.2-6.0 m arm loses one of them out
  // of the bottom or the side of the frame.

  /**
   * Arm length and height the camera eases to during a crash, metres.
   *
   * **The arm grew at M16 with the top speed** (from 8.6). The separation this
   * has to frame is thrown by the impact, so raising the speed a wipeout can
   * happen at raises how far the ragdoll travels before it settles — and a
   * 50 mph crash put the rider out through the *top* of the frame at the old
   * length, which is the one thing §5 says this framing exists to prevent.
   * Pulling back was the correct lever rather than raising the height: the
   * camera looks down at the pair, so a taller arm pushes a high-flying body
   * further up the frame rather than catching it.
   *
   * **And again at M30 Phase 4** with the shipped 65 mph wheel, by the
   * preset's ratio (`CRASH_DISTANCE_EXPONENT` 1) to 14.973961839719554 — but
   * for a *different* reason than M16's, and Phase 0 measured which. At 65 the
   * body does not leave through the top of the frame and never did: it leaves
   * through the **bottom**, because the camera is anchored on a riderless
   * wheel that rolls on at ~28 m/s while the ragdoll stops in a few metres,
   * and the arm has barely begun to ease when that happens. Arm lengths from
   * 11.5 to 18.0 m all put the body behind the camera at 0.35–0.37 s. What
   * the arm still decides is the *eventual* wide shot, three seconds in, which
   * frames the wheel's run-off — and that run-off grows with the speed it was
   * rolling at, so the arm scales with the wheel. Keeping a 65 mph body in
   * shot is an anchor or an easing decision, not an arm length, and it is
   * `docs/PLANS.md` §30.4 item 2's surfaced finding rather than a thing this
   * milestone settled.
   */
  crashDistance: 14.973961839719554,
  crashArmHeight: 2.35,
  /** Vertical field of view held during a crash, radians. Wider takes both in. */
  crashFov: 1.30,
  /** Time constants for taking the wider framing and for giving it back, s. */
  crashFrameSeconds: 0.45,
  crashRestoreSeconds: 0.35,

  near: 0.1,
  far: 500,
} as const;

/**
 * Terrain — M4. How the ground reaches the wheel, and what it costs.
 *
 * **The M1 placeholder plane and its ten-kilometre debug grid are gone.** They
 * were the same geometry stated twice — the renderer built one copy and the
 * level plan described another — which is exactly the arrangement architecture
 * invariant 2 exists to end. `level/buildPlan.ts` is now the single producer,
 * and both consumers read it.
 *
 * Everything below is a designed feel. The consequences worth knowing:
 *
 *   - A 0.15 m kerb is mountable and costs about 3 m/s. A 0.30 m ledge is not,
 *     and stops the wheel.
 *   - The suspension's own frequency is low enough that riding surface texture
 *     at 5-12 m/s excites it, which is what makes grass visibly work the rider
 *     while pavement does not.
 *   - Hills change speed through `-g sin(slope)` and nothing else. There is no
 *     separate climb penalty; the power ladder that makes a climb *expensive*
 *     is M6's.
 */
export const TERRAIN = {
  /**
   * Rise under the contact patch that counts as a step rather than a slope, m.
   *
   * Below this the ground is simply sloped and the wheel rolls up it. The value
   * is a couple of centimetres above the largest height difference the
   * heightfield produces between two adjacent samples on the steepest authored
   * gradient, so a hill is never mistaken for a kerb.
   */
  curbThreshold: 0.04,
  /**
   * The tallest step the wheel can lever itself onto, as a multiple of the
   * wheel's own pedal height.
   *
   * **Derived rather than written down**, which is the same rule master §6.1
   * puts on generated clearance and for the same reason: the number that
   * matters is a property of the wheel, and a hand-picked constant silently
   * stops agreeing with it the first time the wheel changes. At the blocked-out
   * pedal height of 0.16 m this gives 0.216 m — comfortably above a 0.15 m
   * sidewalk kerb and comfortably below a 0.30 m ledge, which is precisely the
   * distinction `docs/PLANS.md` §6 beat 3 and beat 8 depend on.
   */
  stepUpPedalFactor: 1.35,
  /**
   * Speed lost per metre of step mounted, (m/s) per m.
   *
   * A 0.15 m kerb taken unhopped costs 3 m/s, which is a fifth of top speed —
   * enough that hopping it will be worth learning at M5, and not so much that
   * clipping one ends the run. M13 removed the former kerb wobble injection;
   * authored hazards are now the only intended trigger, with M15 soft foliage
   * as the non-road member of that set.
   */
  curbImpactPerMetre: 20,
  /**
   * Deceleration while scraping something the wheel cannot climb, m/s^2.
   *
   * Scaled by how square-on the contact is, so a glancing scrape along a wall
   * barely costs and riding straight into one stops the wheel in about a third
   * of a second. Below the obstacle-crash threshold there is no bounce: the
   * wheel refuses the part of the move that goes into the wall and keeps the
   * part that goes along it, which lets a walking-speed touch be caught and a
   * glancing contact keep sliding rather than becoming a dead stop.
   */
  wallScrubDecel: 42,
  /**
   * Closest the centreline may rest to a solid face, measured sideways, m.
   *
   * **The collision was always right; the resting place was not** (M17). The
   * obstacle cast reaches one wheel radius *along the direction of travel*, so
   * a head-on stop leaves exactly a tyre radius of air and nothing clips. Ride
   * at a shallow angle instead and that same cast buys only
   * `wheelRadius · sin(angle)` of sideways room, which goes to zero as the
   * heading turns parallel: creeping along a wall at 1.4 m/s parked the
   * centreline 0.04 m from the face, burying a fifth of a metre of tyre, pedal,
   * boot and shoulder in the mesh. A player reported it as riding through the
   * wall (`references/PublicFeedback/FEEDBACK-TRIAGE.md` §4.1).
   *
   * **Why a standoff rather than a wider cast.** The sampler already carries a
   * sideways sweep, and it is deliberately withheld from walls and fences:
   * applied there it makes the axis-slide resolver refuse both candidates along
   * a face, so the rider *sticks* to every wall instead of sliding along it.
   * Trading visible clipping for a wheel that grabs at scenery is a bad trade.
   * A push-out after the move refuses nothing, so sliding, the crash funnel and
   * the authored corridors are all bit-identical to before.
   *
   * **The value is not a new constraint.** `ROUTE_CLEARANCE.actorRadius` is
   * `pedalSpan / 2` and every generated gap is validated at twice that plus a
   * tyre diameter, so the level builder has always assumed the machine occupies
   * this much on each side of the centreline. This only makes the collision
   * enforce the width the routes were already cut for, and the narrowest legal
   * gap keeps half a metre of slack. Measured along the machine's own pedal
   * axis, which is exactly where the pedal tip is — so the test is the pedal's
   * position, not an approximation of it.
   *
   * Set to 0 on F4 to ride the old behaviour back.
   */
  wallStandoff: WHEEL.pedalSpan / 2,
  /**
   * Ceiling on how fast the standoff above may move the wheel, m/s.
   *
   * The push exists to stop a rest position being wrong, not to shove anyone.
   * Uncapped, a wall arriving beside a reset or a spawn would snap the machine
   * sideways by a fifth of a metre in one frame. Capped here, a full standoff's
   * worth of correction takes about 45 ms — five fixed steps, two or three
   * drawn frames — which reads as the pedal refusing to enter rather than as a
   * teleport.
   *
   * **Chosen against the sideways closing speed it has to beat, not by feel.**
   * At 3 m/s a 14 m/s pass angled 17 degrees at a wall out-ran the correction
   * and clipped 0.16 m for a few frames while the scrub took over; at 6 the
   * same pass holds the full standoff. Anything closing faster sideways than
   * this is arriving square enough that the forward cast stops it first.
   */
  wallStandoffRate: 6.0,
  /**
   * How far ahead of the contact patch the kerb feeler looks, m.
   *
   * `docs/PLANS.md` §4.3 asks for "one short forward feeler ray at pedal height
   * for curb detection ahead of contact". Slightly more than one tyre radius,
   * so a kerb is reported while there is still time for something to be done
   * about it — which is what M5's hop assist reads. The M13 hazards-only
   * decision removed the M6 wobble consumer; the feeler still drives the debug
   * overlay and snapshot.
   */
  feelerDistance: 0.55,
  /**
   * Unexplained fall under the contact patch that puts the wheel in the air, m.
   *
   * The mirror of `curbThreshold`, and it uses the same trick: a slope's fall
   * is *predicted* by the surface the wheel is already on, so only the excess
   * beyond that prediction is a ledge. On a hill the excess is zero at any
   * gradient and any speed, so a descent never launches; at the lip of the
   * boulevard kerb it is the kerb's whole height, so riding off one does.
   *
   * Slightly above `curbThreshold` because a false launch is worse than a
   * missed one: an intermittent airborne state on rolling ground would break
   * contact, cut rolling resistance, and cost the rider their steering for a
   * frame at a time, for a drop nobody can see.
   */
  dropLaunchThreshold: 0.05,

  /**
   * Suspension natural frequency, Hz, and damping ratio.
   *
   * **The frequency is chosen against riding speed, not against realism.** The
   * surface roughness field is spatial, so its excitation frequency is
   * `speed / wavelength`; with the surface wavelengths in `data/surfaces.ts`
   * sitting between 1.6 m and 3.1 m, riding at 5-12 m/s excites the spring at
   * roughly 2-7 Hz. A stiffer spring would sit still through all of it and a
   * softer one would wallow. At a standstill the field is constant, so the
   * wheel is still — which is correct, and is why the roughness is a function
   * of position rather than of time.
   */
  suspensionFrequencyHz: 2.6,
  suspensionDamping: 0.42,
  /**
   * Time constant for the rendered ground tilt chasing the surface normal, s.
   *
   * The sampler returns the exact plane of the triangle the wheel is on, which
   * is what the slope force must use — but it steps at every cell boundary on a
   * curved hill. Smoothing the *presentation* removes the faceting without
   * touching the force, and short enough that a crest still reads as a crest.
   */
  groundTiltResponseSeconds: 0.09,
  /** Ceiling on the rendered ground tilt, radians. Presentation only. */
  maxGroundTilt: 0.6,
  /**
   * Fraction of the surface's fore-aft tilt the rig visually adopts, 0..1.
   *
   * **Zero, and the zero is the point** (owner's ride, 2026-08-02). The M4 rig
   * tilted whole-body to the surface normal, which is right for a skateboard
   * and wrong for an EUC: the firmware's entire job is holding the pedals
   * level *relative to gravity*, so on a climb the machine and rider stay
   * plumb and the rider leans into the hill (`EUC.riderSlopeLeanFactor`).
   * Surface-normal alignment made the rider lean *away* from a climb — the
   * exact pose that gets a real rider hurt. The round tyre clipping a few
   * centimetres into a steep face is the cheap end of this trade.
   */
  groundTiltPitchFollow: 0.0,
  /**
   * Fraction of the surface's cross-slope tilt the rig visually adopts, 0..1.
   *
   * Small but not zero. Laterally the wheel is rider-balanced, not
   * firmware-held, and on a side slope the tyre's contact patch rolls onto its
   * downhill shoulder — the wheel genuinely tips a little with the ground
   * while the rider stays nearer plumb ("shoulders remain more level than
   * wheel", `EUC_RIDER_MOTION_REFERENCE.md` §11). A quarter of an 11° authored
   * cross-slope is under 3°: a grounding cue, not a lean.
   */
  groundTiltRollFollow: 0.25,

  /**
   * Global multiplier on every surface's rolling resistance.
   *
   * The one live control that moves all seven surfaces together, so the owner
   * can tune how much the ground costs in general before tuning how much any
   * one surface costs in particular.
   */
  rollingResistanceScale: 1.0,

  /**
   * The world outside the authored course, in two parts.
   *
   * **The field** is a static mottled grid extending `surroundMargin` beyond the
   * heightfield on every side, at `surroundCellSize` per patch. Static because
   * the mottle is what makes speed readable (see `data/surfaces.ts`), and a
   * pattern carried by a mesh that follows the rider does not move relative to
   * them — which is the same as having no pattern at all. The margin is chosen
   * against `LIGHTING.fogFar`: from anywhere on the course the field's edge is
   * further than the haze can see, so a finite plane reads as an endless one.
   *
   * **The backstop** is one uniform plane a few centimetres lower that *does*
   * follow the rider, so a rider who goes far enough to run out of field still
   * has ground under them rather than sky. It carries no mottle, so moving it
   * is invisible, and the drop to it is an order of magnitude below the kerb
   * threshold and half a kilometre away besides.
   *
   * The sampler answers `surround.height` for every point off the heightfield,
   * which is the field's height — the backstop is presentation only and no
   * gameplay question is ever asked of it.
   */
  surroundMargin: 480,
  surroundCellSize: 8,
  surroundBackstopHalfExtent: 340,
  surroundBackstopDrop: 0.08,
} as const;


/**
 * What a pothole looks like — M13 Phase 2, redrawn after the owner's first look.
 *
 * **The constraint has not changed and never will: a recess cannot be drawn as
 * a recess.** The heightfield is an opaque surface at road height, so a ray from
 * the chase camera to any point below it crosses it first, and there is no cell
 * to cut either — a cell is a square metre, a pothole is smaller than one, and
 * cutting it would open a metre of void onto the backstop. Depth is carried by
 * *value* and by *shading*, and any real relief has to go up.
 *
 * **What changed is how much of it goes up, and why.** The first pass answered
 * the readability question with 0.23–0.28 m of spoil ring — the height a
 * projected-pixel measurement said was needed at 40 m — and the ring it produced
 * read as a tan volcano sitting on the asphalt. It was the right arithmetic
 * applied to the wrong cue. A raised ring is the *least* pothole-like shape a
 * road feature can have: a real hole crumbles **downward**, and a crown standing
 * a quarter of a metre proud of the road is a moulding, not a break.
 *
 * The relief here is now 0.05–0.07 m — a broken lip, the height of a chunk of
 * asphalt — and it is deliberately *not* the distance cue. Three other things
 * are, and each survives the shallow view better than height does:
 *
 *   1. **A luminance dipole.** Pale ring, dark core. A thin dark mark on grey
 *      asphalt averages back into the road as the pixels shrink; a light ring
 *      around a dark centre keeps a contrast edge, because the two halves fall
 *      on opposite sides of the road's value and cannot cancel. That is why the
 *      halo below is *brighter* than pavement and the pit is far darker.
 *   2. **An irregular outline.** Nothing else in the world has a ragged edge,
 *      so the shape alone is a signal — and the perfect 16-gon of the first pass
 *      was most of what made it read as manufactured. See `outlineHarmonics`.
 *   3. **Standing water**, in the deep kind only (`PUDDLE`). It is the cue every
 *      driver already owns, and it puts the crash-severity hazard in a different
 *      visual class from the wobble-severity one instead of merely a larger one.
 *
 * **The interior is still lit as a bowl although it is flat**, by carrying the
 * normals the recess would have had. That part was right and is kept. What is
 * added is a *baked ambient occlusion* term (`floorShade`, `wallShade`): a
 * cavity is occluded at the bottom no matter where the sun is, so this is a fact
 * about the shape rather than a second opinion about the lighting, and it does
 * not violate invariant 6 the way a baked sun azimuth would. Author the colours
 * below as the material in open daylight and let the shade terms dig the hole.
 *
 * **The drawn mouth is never smaller than the hit radius.** A `Hazard.radius` is
 * the distance at which the contact *point* is in the hole, and the jitter below
 * only ever pushes the rim *outward* from it, so a rider who clips the visible
 * edge is not charged. Generous in the direction a rider forgives. (The spill's
 * jitter runs the other way, and `PUDDLE` says why.)
 *
 * A pothole is **never a collider** (`level/plan.ts`): the wheel rolls through
 * the lip without feeling it. That is the honest cost, and at 5 cm it is a much
 * smaller lie than the 28 cm kerb the first pass asked the player to ride
 * through unchanged.
 */
/**
 * How big each kind of hazard is authored, metres — M13.
 *
 * **One home for three numbers that two modules had to agree about.** The
 * diagnostic scatter in `level/buildPlan.ts` and the generator's own
 * `placeHazards` in `level/generateRoute.ts` both author footprints, and the
 * whole point of `?hazardprobe=` was that the owner's readability gate should
 * be ridden against *the sizes the generator will use* — two copies of these
 * numbers is a gate that silently stops being about the shipped world. Neither
 * module may import the other (the dependency runs one way), so the table is
 * the place they meet, which is what invariant 4 asks for anyway.
 *
 * The sizes themselves are Phase 2's: a pothole around the wheel's own
 * footprint, a deep one half again as wide because it is the one that ends a
 * run and has to be told apart at 40 m, and a spill wide enough to be a stretch
 * of wet road rather than a puddle to thread. `DESIGN.md` §6j records what each
 * measured at gameplay scale. The spill is also comfortably above the
 * `spacing · √2 / 2` ≈ 0.71 m floor below which a footprint can fall between
 * four heightfield cell centres and paint none of them.
 */
export const HAZARD = {
  /** A shallow pothole: wobble and a speed cost. */
  shallowRadius: 0.75,
  /** A deep pothole: a wipeout above `EUC.hazardCrashSpeed`. */
  deepRadius: 1.05,
  /** A liquid spill: low grip over a stretch of road. */
  spillRadius: 2.30,
  /**
   * The smallest a spill may be shrunk to and still be worth placing, metres.
   *
   * **Spills shrink to fit a narrow road and potholes do not**, and that is a
   * readability decision rather than an arithmetic one. A spill is a region —
   * two thirds of one is still a stretch of wet road and still reads as one. A
   * pothole is a shape, and Phase 2 measured its contrast at an authored size;
   * a shrunken one is a mark the rider cannot identify and is charged full
   * price for. So a corridor too narrow for a pothole gets no pothole.
   *
   * The floor is above the cell-centre radius above, so a shrunken spill can
   * never trip the refusal `buildLevelPlan` raises for a footprint that paints
   * nothing.
   */
  minSpillRadius: 0.90,
  /**
   * The distance a hazard is expected to read from, metres — M13.
   *
   * **Measured, not chosen.** Phase 2's owner gate asks whether a pothole reads
   * as a hole at 20 m and at 40 m on the handset, and Phase 2's evidence
   * measured the mark through the real chase camera at exactly those distances:
   * a deep hole at 40 m is a 37 × 3 px mark carrying a 30:1 luminance dipole
   * (`DESIGN.md` §6j). Forty is therefore the furthest distance this project
   * has actually looked at a hazard from, which makes it the honest window for
   * Phase 3's rule that *the ground must not hide one inside it*.
   *
   * **What the machine needs has caught up with it — M30 Phase 4.** About
   * sixteen metres of road is still enough to steer one clear lane aside at
   * half the lateral authority, but braking below `EUC.hazardCrashSpeed` from
   * the shipped 65 mph top speed now takes **33.5 m in 1.86 s** (terminal
   * 28.98 m/s), which leaves **6.5 m of the forty** in reserve rather than the
   * twenty-one the 50 mph wheel had (20.1 m in 1.35 s). Those three numbers
   * are measured, not estimated: `src/simulation/topSpeedPreset.test.ts`
   * prints them for all three wheels on every run. Using the measured sight
   * line rather than either physical one is still the strict choice, and it is
   * what makes the two phases compose — the mark reads at forty metres, and
   * the ground does not hide it inside forty. Read the reserve before touching
   * this constant: at 65 the braking distance, not the eye, is what forty
   * metres is now sized against.
   *
   * This is **not** a claim about perception. It says nothing about fog, the
   * props the dressing stream places, or the camera. Whether a hazard is
   * genuinely readable stays the owner's ride to decide.
   */
  readMetres: 40,
  /**
   * How the hazard density follows the wheel's top speed, as an exponent — M30.
   *
   * **The density is a taste; the separation beside it is fairness. This
   * exponent is what keeps the two apart.** `HAZARD_PLACEMENT.chancePerStation`
   * was derived at M13 from the *live* wheel's own separation — "a hazard about
   * every two recovery distances" — and that derivation, handed a faster wheel
   * at M30 Phase 1, emptied the road: a longer recovery distance is a lower
   * chance per station, and a sixty-seed sweep lost a quarter of its holes at
   * 65 mph. That is the wrong way round. A faster wheel exists to be more
   * *thrilling* (the decision of 2026-09-03), so the road must not get emptier
   * as the wheel gets faster. The chance is therefore anchored on the
   * **shipped** wheel's derivation — which is what keeps a default build
   * byte-identical, since the anchor is then the same expression M13 wrote —
   * and scaled from it by the top-speed ratio raised to this power.
   *
   * The separation floor does **not** move with this taste and is not scaled by
   * it: two hazards inside one recovery is a crash the rider could not have
   * avoided, and an unavoidable crash is annoying, which this project removes
   * rather than tunes.
   *
   * **The number is chosen against a measured ladder, not against the
   * arithmetic**, because the arithmetic is an *offer* and the contracts refuse
   * most of it. At exponent 1 only 27 % of the extra placements landed: the
   * fairness floor above is wider at 65 in exactly the proportion the offer is
   * denser, and the zone, sight, gate, surface and lane rules absorb the rest.
   * So the offer has to be steep before the road reads as busier. What each
   * exponent actually lands at 65 mph, sixty seeds (`euc-1..60`), per route and
   * per minute of riding at the 28.98 m/s terminal over the sweep's own mean
   * required route of 1,080 m, with `route-41` and `x67` by name — no exponent
   * produced a fallback, and the shipped wheel is 5.07 a route and 6.26 a
   * minute for comparison:
   *
   *   - **0** — 4.62 a route (1–8), 7.43 a minute; `route-41` 6, `x67` 5. The
   *     offer is the shipped wheel's exactly, and the road still thins out,
   *     because the fairness floor is a third wider at 65 and refuses what the
   *     unchanged dice hand it. **Holding the offer still is not holding the
   *     count still** — that is the whole reason this constant exists.
   *   - **1** — 5.48 (3–8), 8.83 a minute; `route-41` 6, `x67` 9. Hazards per
   *     *metre* scale with the top speed, so per *second* they scale with its
   *     square. Only 27 % of the extra placements land: +8 % of a route, which
   *     is not a road anybody would call busier.
   *   - **2** — 6.12 (4–9), 9.85 a minute; `route-41` 6, `x67` 9.
   *   - **3** — 6.98 (5–9), 11.24 a minute; `route-41` 7, `x67` 10. **The
   *     shipped choice**: a 65 route carries about two more holes than the same
   *     road at 50 and meets them four-fifths again as often, and the floor
   *     still refuses every pair the rider could not recover between.
   *   - **6** — 8.60 (6–11), 13.84 a minute; `route-41` 10, `x67` 12. Recorded
   *     as the far end of the ladder rather than as a candidate.
   *
   * **The ride settles it.** This is a taste and the numbers above only say
   * what each setting costs; whether 65 mph reads as dangerous rather than as
   * a slalom is a question for the owner's gate, and §13 q9's "nothing may be
   * annoying" is the rule that would send it back down the ladder.
   *
   * **Not a live tunable.** The generator reads this frozen table and the
   * session's own mph and nothing else, so a route stays a function of its seed
   * and its wheel rather than of whatever the F4 panel last did.
   */
  densityTopSpeedExponent: 3,
} as const;

export const POTHOLE = {
  /**
   * Sides of every ring, whatever the footprint's radius.
   *
   * Constant so that a pothole's triangle count is a constant the render budget
   * can multiply (`data/renderCost.ts`), and safe to be constant because the
   * outline is no longer a circle: the harmonics below carry the shape, so the
   * segment count only has to be fine enough to resolve them. Sixteen resolves
   * up to the fifth harmonic with three samples a lobe, which is the highest
   * order `outlineHarmonics` uses.
   */
  radialSegments: 16,
  /**
   * Ring radii, as fractions of `Hazard.radius`, before the outline jitter.
   *
   * Floor disc, then the bowl wall, then the broken lip at exactly 1 — the hit
   * radius — then a flush halo of crumbled aggregate outside it. Four rings and
   * a centre vertex: one fan plus three bands, which is `7 · radialSegments`
   * triangles and the same count the first pass cost.
   *
   * **All four are pushed outward from where they started, and the reason is
   * that vertex colours interpolate.** Every ring gap is a linear ramp across
   * the band, so a wide gap between two very different values is an airbrushed
   * gradient — which is exactly what the first attempt at this revision looked
   * like: a soft smoke puff with a dark middle, because the dark floor ramped to
   * the pale rim across 60% of the radius and the rim ramped back to the road
   * across another 34%. Asphalt does not fade. The floor now fills most of the
   * footprint, the wall is a narrow band, and the halo is a 14% skirt, so every
   * value change happens over a few centimetres and the feature has edges.
   */
  floorFraction: 0.70,
  wallFraction: 0.90,
  haloFraction: 1.14,
  /**
   * How far the flush parts sit above the ground, metres.
   *
   * The same job `MARKINGS.lift` does and a hair smaller, because this surface
   * is horizontal where paint follows a crown. Both halves of the anti-z-fight
   * pair are needed here for the reason `render/markings.ts` states: the lift
   * alone loses at distance where the depth buffer coarsens, and the polygon
   * offset alone loses between two heightfield samples.
   */
  lift: 0.012,
  /**
   * Height of the broken lip above the road, metres, per kind.
   *
   * **A tenth of what the first pass used, and the correction is the point of
   * this revision.** 0.23 m of ring is a kerb; the eye reads a moulded collar
   * and stops looking for a hole. Five to seven centimetres is a slab of asphalt
   * standing on edge where the surface failed, which is what actually happens,
   * and it still breaks the specular sheet of the road along the rim so the lip
   * catches a highlight the flat halo does not.
   *
   * It buys about 0.6–0.9 px at 40 route-metres, which is honestly nothing at
   * that distance. The distance read is the halo's dipole and the outline; this
   * is a close-range cue and is sized as one. `docs/PLANS.md` records the
   * fallback the milestone plan already named: if a hole still cannot be read in
   * time, `EUC.hazardCrashSpeed` is the number that moves, not the mesh.
   */
  shallowRimHeight: 0.05,
  deepRimHeight: 0.07,
  /**
   * Ceiling on the lip, as a fraction of the footprint's own radius.
   *
   * Kept from the first pass for its original reason — on a small enough hole an
   * absolute height turns the family into a cone — though at these heights it
   * binds only under a 0.2 m radius, which no kind is authored near. It costs
   * one `Math.min` and it means the family cannot be broken by a future
   * generator asking for a very small hole.
   */
  maxRimFraction: 0.45,
  /**
   * Depth the interior's *normals* are computed for, metres. Nothing is drawn at
   * this depth — see the note above. It sets how far the bowl's faked walls tilt,
   * which is what makes the cavity shade as a cavity under whatever the sun is
   * doing, and the deep kind's steeper tilt is part of what tells the two apart.
   */
  shallowDepth: 0.18,
  deepDepth: 0.62,
  /**
   * Baked ambient occlusion, as a multiplier on the authored colours.
   *
   * **Not baked light — baked *occlusion*.** A pit's floor sees less of the sky
   * than the road beside it does, and that is true at every hour and from every
   * angle, so it can be folded into the vertex colour without taking a second
   * opinion on where the sun is (invariant 6, and the reason the sun's direction
   * is emphatically *not* baked). It is the term that makes the hole read as a
   * hole in the hemisphere fill as well as in the sun.
   *
   * The deep kind is occluded harder because it is deeper. Together with the
   * palette this puts a deep floor near 0.048 linear and a shallow one near
   * 0.072, against the halo's 0.215 and pavement's 0.202 — a dipole of roughly
   * 4:1 across two metres, which is what survives being three pixels tall.
   */
  shallowFloorShade: 0.45,
  shallowWallShade: 0.62,
  deepFloorShade: 0.30,
  deepWallShade: 0.50,
  /** The lip and the halo are lit as they are; only the pit is occluded. */
  rimShade: 0.95,
  /**
   * How far the lip's and the wall's tone swing with the crumble, as a fraction.
   *
   * **The single change that stops the family looking airbrushed.** Four rings of
   * flat tone joined by linear ramps is a set of smooth annuli however well the
   * values are chosen, and smooth annuli on a road read as a soft shadow rather
   * than as broken material. Tying the tone to `crumbleAt` — the same field that
   * decides how much lip is standing at each step — makes the ring mottle at the
   * mesh's own frequency, and it does so for a physical reason rather than as
   * noise: a chunk still standing catches the light, and the gap where one broke
   * away does not.
   */
  rimMottle: 0.34,
  /**
   * The family's palette, sRGB hex, authored in linear terms (see the colour
   * note at the top of this file) as the material would look in open daylight —
   * the shade terms above do the darkening.
   *
   * **Cool grey, where the first pass was warm.** Beige on grey asphalt reads as
   * sand or dried mud sitting *on* the road; broken asphalt exposes pale grey
   * aggregate and is the same family of colour as the road it came out of. That
   * one change is most of the difference between a spoil heap and a break.
   *
   * The value ordering `DESIGN.md` §3 fixes is unchanged and is what caps the
   * palette. Measured as linear luminance: pavement is 0.197 and kerb concrete
   * 0.286, and the freshly broken rim sits at 0.237 — a fifth above the road it
   * came out of and a sixth under the kerb, ragged rather than straight, so it
   * cannot be mistaken for a step. It was 0.265 for one build and that was
   * already wrong: within 8% of a kerb, the ring stops being broken asphalt and
   * becomes a cast concrete collar, which is the one thing §3 forbids.
   *
   * **The halo is pavement's own value**, which is what makes it a halo instead
   * of a disc: the band from the bright rim outward ramps to the road and the
   * outer edge of the whole feature disappears. An outer ring at any other value
   * would put a second hard circle around the first, which is the mark of a
   * decal pasted on rather than a surface that failed.
   */
  floorColour: 0x6d6862,
  wallColour: 0x74767a,
  rimColour: 0x83868a,
  haloColour: 0x797b7e,
  /** Standard-material roughness. Crushed asphalt is the matte end of the kit. */
  roughness: 0.96,
  /**
   * The outline, as amplitudes on the first, second, third and fifth angular
   * harmonics — fractions of the radius.
   *
   * **Harmonics rather than per-vertex noise, and the difference is the whole
   * result.** An independent random radius at each of sixteen steps produces a
   * spiky star: adjacent vertices are uncorrelated, the edge zig-zags at the
   * sampling frequency, and the seam between the last step and the first is a
   * visible discontinuity because nothing makes the loop close. A sum of whole-
   * numbered harmonics closes by construction, stays smooth between samples, and
   * gives lobes at the scale of the feature rather than at the scale of the mesh
   * — which is what "irregular" has to mean for it to read as broken asphalt.
   *
   * The phases come from the hazard's own position, so two holes are never the
   * same shape and one hole is the same shape every time the world is rebuilt.
   *
   * Amplitudes sum to 0.28, and the offset below keeps the result strictly
   * positive: the rim can reach 1.28 × radius and never falls under 1.0, which
   * is what makes the drawn mouth at least the hit radius everywhere.
   */
  outlineHarmonics: [0.10, 0.09, 0.06, 0.03],
  /**
   * The angular wander of the ring's steps, radians, as a fraction of one step.
   *
   * A second, smaller irregularity: without it the *vertices* still sit on a
   * perfectly regular 22.5° lattice even when their radii do not, and a long
   * straight chord between two of them reads as a facet. Kept well under half a
   * step so the ring can never fold through itself.
   */
  outlineAngleJitter: 0.28,
} as const;

/**
 * What standing water looks like — the pool in a deep pothole and the puddle of
 * a spill, which are one material because they are one substance.
 *
 * **This is the second hazard mesh and the second draw call, and what it buys is
 * the only material property vertex colours cannot carry: roughness.** The rest
 * of the hazard family is crushed asphalt at 0.96; water is the one thing in the
 * world that has to be smooth. Sharing one material between the pothole's pool
 * and the spill's puddle keeps that to a single added call for both — and states
 * the useful thing, which is that the water in the hole and the water on the
 * road are the same water.
 *
 * ## There is no sun glint here, and there cannot be. Measured, not assumed.
 *
 * The obvious way to make a dark patch read as liquid is a specular highlight,
 * and two builds were spent trying to get one before the geometry was actually
 * worked out. **It is unreachable in this rig.** The sun sits at 55° of
 * elevation. The chase camera's eye is about 2 m up looking at road 6–40 m
 * ahead, so its line of sight meets the ground at 10–20°. A microfacet lobe
 * peaks when the surface normal equals the half-vector between the view and the
 * light, and for that pair the half-vector sits at about 41° of elevation —
 * which asks the water's normal to tilt roughly **49° from vertical**. That is
 * not a ripple, it is a wave, and there is no environment map to reflect
 * instead: one sun and one hemisphere is the whole rig (invariant 7 has already
 * ruled out the post pass that would fake it).
 *
 * So the read is built out of what this renderer *can* deliver:
 *
 *   1. **Value.** The body is roughly a seventh of the road's luminance, which
 *      measures as a 7:1 dipole at gameplay scale — plenty at any distance.
 *   2. **A bright meniscus.** A thin ring at the water's edge, brighter than the
 *      road and distinctly blue. This is the piece that stops the puddle reading
 *      as a shadow, and it is not a cheat: the edge of standing water is where
 *      the film is thinnest and the angle to the sky most grazing, so it really
 *      is the brightest part of a real puddle. It is also sun-independent, which
 *      a baked highlight would not be (invariant 6).
 *   3. **Hue.** Everything here is cool where the asphalt and the crushed stone
 *      around it are neutral-to-warm. Water takes its diffuse from the sky, and
 *      at the distance where neither hazard is more than a mark, hue is what
 *      says which one it is.
 *
 * The ripple survives all of that, at a much smaller amplitude and with a
 * smaller job: it varies the *diffuse* term across the pool by about a quarter,
 * so the water is not a single flat tone. That is worth having and it is all it
 * does. `pushWater` says why only the normals move.
 */
export const PUDDLE = {
  /**
   * Sides of the spill's outline. Higher than a pothole's because a spill is
   * three times the radius and its lobes have to stay smooth at the edge the
   * rider is steering around.
   */
  radialSegments: 24,
  /**
   * How far the water sits above the ground it lies on, metres.
   *
   * Above `POTHOLE.lift`, because the pool is drawn over the pothole's own floor
   * disc and the two would otherwise z-fight along their whole overlap.
   */
  lift: 0.018,
  /**
   * The pool inside a deep pothole, as fractions of `Hazard.radius`: the body,
   * then the meniscus ring at its edge.
   *
   * Sized to fill the floor disc and stop short of the wall, so the bowl's
   * shaded rim still reads all the way round it. Deep holes only: a shallow one
   * stays a dry break, which is the cheapest possible way to say *this one will
   * only shake you* and *this one will put you down* without a HUD.
   */
  poolCoreFraction: 0.40,
  poolFraction: 0.62,
  /**
   * The spill's puddle, as fractions of `Hazard.radius`: a core, the body, then
   * the meniscus.
   *
   * The core ring exists for the ripple rather than for the shape. A fan from a
   * single centre vertex interpolates the whole interior from the rim inward, so
   * the ripple would only ever be sampled around the edge and the middle of
   * every puddle would be a flat average. Three rings put a normal in the middle
   * of the water, which is where the eye looks.
   *
   * The meniscus is 7% of the radius — 13 cm on a 2.3 m spill — because it is a
   * meniscus and not a gradient. A wide bright ring is a halo; a narrow one is
   * an edge, and an edge is what tells the player where the grip stops.
   *
   * **The jitter runs inward here, the opposite way to a pothole's.** A spill's
   * charged footprint is the set of heightfield cells it painted, so water drawn
   * inside the radius means *everywhere you can see water is slippery*, and the
   * damp cells outside the puddle are the warning that the slippery part is
   * wider than the shiny part. Drawing the water outward instead would put a
   * gleaming, fully-grippy margin around every spill, which teaches the player
   * the wrong lesson in the one place they are trying to read the ground.
   */
  spillCoreFraction: 0.55,
  spillBodyFraction: 0.93,
  spillFringeFraction: 1.0,
  /**
   * Outline harmonics for the spill, on the first, second, third and fifth —
   * `POTHOLE.outlineHarmonics` for why harmonics rather than noise.
   *
   * Deeper than a pothole's, because this is the difference between a puddle and
   * a disc: liquid pools into lobes wherever the camber lets it, and a circle of
   * water on a road is the one shape a spill is never in. They sum to 0.40 and
   * the ring is offset to run from 0.60 to 1.0 of the fractions above, so the
   * body is always inside the footprint.
   */
  outlineHarmonics: [0.16, 0.12, 0.08, 0.04],
  /** Angular wander, as a fraction of one step. `POTHOLE.outlineAngleJitter`. */
  outlineAngleJitter: 0.3,
  /**
   * How far the surface normals tilt across the water, radians.
   *
   * Twelve degrees, which swings the diffuse term by about a quarter across a
   * pool — enough that the water is not one flat tone, and well short of the
   * point where it starts to read as domed. It is **not** trying to catch the
   * sun; see the note above for why nothing in this range could.
   *
   * Only the normals move; `pushWater` says why the vertices must not.
   */
  rippleRadians: 0.21,
  /**
   * Ripples per metre — deliberately long, about one and a half wavelengths
   * across a 2.3 m spill.
   *
   * The mesh is a fan and three rings: roughly fifty vertices for four and a
   * half metres of water. A ripple much shorter than the puddle aliases against
   * that sampling into a scatter of light and dark, which is noise rather than
   * water. One broad swell that lifts half the pool and drops the other is what
   * this geometry can actually carry.
   */
  rippleWavesPerMetre: 0.35,
  /**
   * The palette, sRGB hex, authored in linear terms and quoted here as linear
   * luminance, against pavement's 0.197 and kerb concrete's 0.286.
   *
   * The pool (0.035) is darker than the spill body (0.050) because it is deeper
   * and because it sits inside an occluded pit, and its own meniscus (0.108) is
   * dimmer than the open-road one (0.224) for the same reason — a bright rim
   * inside a shadowed hole would read as a light fitting.
   *
   * The meniscus is the only value in the hazard family that goes *above* the
   * road, and it is allowed there by the same clause that lets road paint out-
   * brighten kerb concrete in `DESIGN.md` §6g: it is a few centimetres wide, it
   * never sits on a collider, and it is unmistakably blue. It stays a fifth
   * below the kerb regardless.
   */
  poolColour: 0x2f3540,
  poolEdgeColour: 0x545d6b,
  spillColour: 0x3f4753,
  meniscusColour: 0x76839a,
  /**
   * Standard-material roughness.
   *
   * Kept smooth even though nothing in this scene can produce a highlight off
   * it, because roughness is not only about the sun: it is what the material
   * *is*, and the day the lighting rig gains a low sun or an environment map,
   * water that was quietly authored as matte would be the last place anyone
   * looked. `data/surfaces.ts`'s spill row makes the opposite choice for the
   * damp cells around this, and says why.
   */
  roughness: 0.22,
} as const;

/**
 * Blockout albedo values.
 *
 * Deliberately lighter than a photograph of a black wheel would be. These
 * values are chosen in linear terms and converted (see the colour note at the
 * top of this file): a shell authored at the "true" near-black of a real EUC
 * lands around 0.02 linear, which crushes to a featureless silhouette under
 * ACES and makes proportion impossible to judge. Readability outranks realism
 * for temporary geometry — the shipped wheel can be as dark as it likes once
 * there is real material detail to carry the form.
 */
export const BLOCKOUT_COLOURS = {
  shell: 0x4a5058,
  tyre: 0x232427,
  pad: 0x2b2d31,
  pedal: 0x9aa0a8,
  /** Cool Rider's identity blue, previewed on the wheel's accent strip. */
  accent: 0x1f6fe0,
  /**
   * Trollina's standard-wheel livery. The albedo starts at her dress pink but
   * owns a separate tuning key because reflective trim and cloth do not land
   * at the same value under the midday sun. The deeper emissive keeps the
   * strip pink without turning it into a lamp or crowding the red status cue.
   */
  machineTrollinaAccent: 0xc22c8a,
  machineTrollinaEmissive: 0x7d1658,
  headlight: 0xfff0d0,
  taillight: 0xff2233,

  /**
   * Red Rider's machine — M19 Phase 3 (`render/machineLook.ts`).
   *
   * The reference addendum is explicit that his wheel is red-*dominant*, not a
   * black wheel with red accents, so the red is the shell's **base** colour and
   * the black structure is painted down from it — a vertex colour is a
   * multiplier, and red can be painted to black where black can never be
   * painted to red. Two reds rather than one: the bodywork at the shell's own
   * satin roughness, and the bolt-on armour trim slightly brighter and
   * glossier, so panel and body separate the way plastic and paint actually
   * do. The headlight is deliberately **cool** against Cool Rider's warm
   * `headlight` above — the mockup's projector reads blue-white, and the two
   * machines should not share a light signature.
   *
   * The one hue collision this palette walks into on purpose:
   * `statusCritical` two entries up is also red. The light itself is its own
   * emissive mesh and survives, but a red shell behind it would bury the power
   * ladder's only readable warning — so his livery paints a dark bezel column
   * behind the status light (`docs/PLANS.md` §19.7), which is also simply what
   * the real machine's black spine looks like.
   */
  machineRed: 0xc01824,
  machineTrimRed: 0xd8202c,
  machineHeadlightCool: 0xdff0ff,

  /**
   * Adonisb2's machine — M22 Phase 2 (`render/machineLook.ts`).
   *
   * **The inverse of the entry above, and it has to be built the other way
   * round.** His wheel is black bodywork carrying green personalization, so
   * unlike Red Rider's the shell's base is *not* the identity colour: it is
   * `machineAdonisb2`, a graphite dark enough to read black under the level's
   * one hard sun and light enough that the painter can still take the recesses
   * further down. A base actually at 0x000000 would be a base no paint could
   * move, which is the same direction rule stated from the dark end.
   *
   * The green lives on the trim instead — and `machineAdonisb2Trim` is
   * deliberately **pale**, not green, because his nose plate holds four values
   * on one material: the green plate, the white of the eyes, the near-black of
   * the pupils and brows, and the blue chevrons between his light panels. A
   * scalar shade cannot change hue and a green base cannot be painted white,
   * so the base is the brightest thing on the plate and everything else is
   * painted down from it (`MachinePatch.tint`, `docs/PLANS.md` §22.4).
   *
   * `machineAdonisb2Green` is the same lime as his knee guards
   * (`adonisb2Guard`) rather than a second green: the whole point of the
   * personalization is that the rider and the machine match. His light panels
   * are the warm `headlight` above — the photograph's panels are cream, not
   * the projector white Red Rider's wheel uses — and `machineAdonisb2Blue` is
   * the one cool mark on the machine, the chevron stack on the centre spine.
   */
  machineAdonisb2: 0x303338,
  machineAdonisb2Trim: 0xf2f0ea,
  machineAdonisb2Green: 0x6fc814,
  machineAdonisb2Blue: 0x1f5fd0,
  /**
   * The teal strips on his side brackets — the machine's own running lights in
   * the photograph, and the only colour on it that is neither green nor black.
   * They ride the trim material like everything else, so they cost nothing.
   */
  machineAdonisb2Teal: 0x22c8c0,

  /**
   * The machine's own status light (M6), in its four ladder colours.
   *
   * **This is the wheel telling the rider something, not a HUD.**
   * `docs/PLANS.md` §4.5 asks the power ladder to be readable through "a beep +
   * subtle HUD", then "a stronger beep + amber HUD" — and both of those
   * channels belong to later milestones (audio is M8, the HUD is M9). A ladder
   * whose readable half does not exist is a mechanic the player cannot learn,
   * so M6 gives the machine an affordance real EUCs already have: a status
   * light on the shell, which every rider reads without being taught. It costs
   * one mesh and one material, it sits inside the world rather than on top of
   * it, and it needs no options firewall because it is not presentation the
   * player configures.
   *
   * It carries the worst of the power stage and the wobble energy, because a
   * machine with two independent warning lights is a machine nobody reads.
   *
   * **Emissive values are members of the coupled visual system** (invariant 6,
   * `DESIGN.md` §6): these are authored here beside the head and tail lights
   * and judged against the same exposure and tone mapping, and changing one is
   * changing that system.
   */
  statusNormal: 0x2fd36b,
  statusNotice: 0xffd23f,
  statusWarn: 0xff8a1f,
  statusCritical: 0xff2f2f,

  /**
   * Cool Rider, blocked out. LOCKED as black padded moto trousers and a black
   * padded jacket with reflective blue panels (docs/PLANS.md 2.3).
   *
   * `riderSuit` is nowhere near the true black of the real gear, for the same
   * reason the shell is not: read the colour note at the top of this file.
   * Authored at a true near-black it crushes under ACES into a silhouette with
   * no form at all, and form is the entire point of a blockout.
   *
   * These values were raised once already, after the first build: a suit
   * picked by eye as "dark grey" landed near 0.035 linear and rendered as an
   * unreadable void with the sun behind it — the M0 lesson, repeated on a
   * different mesh. They now sit a little under the wheel's shell in linear
   * terms, which keeps the rider distinguishable from the wheel while still
   * reading as black gear.
   */
  riderSuit: 0x474b53,
  /** Cool Rider's detailed garment palette; the legacy colours remain shared by older looks. */
  coolFabric: 0x606570,
  coolHelmet: 0x424b59,
  coolVisor: 0x8daab5,
  coolLash: 0x302a23,
  coolGear: 0x4c5059,
  coolSkin: 0xb98a6b,
  coolSkinShadow: 0x87614f,
  coolSole: 0xa6a69b,
  coolStitch: 0x727982,
  coolInk: 0x20252c,
  coolPrint: 0xbac2cc,
  /**
   * The identity cue. Reflective is a *material property* of the character,
   * not decoration: it is what keeps the rider readable against dark asphalt
   * and in shadow, and it is the natural hook for an evening variant later.
   * The blockout approximates retroreflection with a low roughness and a small
   * emissive term, because there is no environment map to reflect yet.
   */
  riderPanel: 0x2f7fe8,
  /**
   * The helmet, and it is deliberately the **lightest** thing the rider wears.
   *
   * It was `0x3a3d43` — a shade *under* the jacket — until the rider look pass,
   * where a capture from behind at head height showed the result: the head read
   * as a dark void sitting on a lighter body, which is a silhouette with the
   * character's most recognisable shape subtracted from it. A gloss helmet is
   * the brightest thing on a real rider too, so this costs nothing in
   * plausibility. Same family of mistake as the suit two lines up, and the
   * shell at the top of this file: read the colour note there.
   */
  riderHelmet: 0x50555e,
  riderVisor: 0x22252b,
  riderBoot: 0x33363c,

  /**
   * Trollina — the second rider (M14.5), and a deliberately different problem
   * from the five values above.
   *
   * Cool Rider's palette is an exercise in keeping *black* readable: every one
   * of those numbers is lighter than the gear it represents because a true
   * near-black crushes under ACES into a silhouette with no form. Trollina's is
   * the opposite exercise. Hot magenta is already near the top of the sRGB
   * gamut, the sun is strong, and ACES rolls a saturated highlight toward white
   * — so authored at the picker value the reference image shows, her hair and
   * dress bleach into one pale pink mass at midday and lose every bit of the
   * scribble that makes her recognisable.
   *
   * These are therefore authored **darker and slightly less saturated than the
   * reference**, with the *hair* one step brighter than the *dress* rather than
   * the other way round: the chase camera looks at the back of the head
   * essentially all the time, so the hair is the piece that has to survive
   * being the brightest lit thing on the character.
   *
   * The joke is the point and the colour is most of the joke — see
   * `references/female rider/FEMALE_EUC_CHARACTER_ORIGIN.md`. Nothing here may
   * drift toward a tasteful pink.
   */
  trollinaDress: 0xc22c8a,
  trollinaHair: 0xe0389f,
  /**
   * Bare arms, her face, and nothing else since the second look pass put her
   * legs in tights. Not a cartoon decision: it sits between the wheel's black
   * and the dress so the skin reads against both, and it is warm enough not to
   * look like plastic under a low sun.
   */
  trollinaSkin: 0xc08e6e,
  /**
   * The whites of her eyes — and the second look pass is why it is a white.
   *
   * The first build authored `face` as near-black and drew each whole eye in
   * it, which at 30 m was two dots and at 3 m was two beads: no sclera, no
   * pupil, no expression, which is most of what the owner meant by "jank". The
   * eye is now built the way every cartoon builds one — a big pale ball with a
   * dark pupil standing proud of it — and both tones come out of this ONE
   * material: the sclera at vertex shade 1, the pupil, brows and mouth at
   * shades near zero, because a vertex colour *multiplies* the material. Warm
   * rather than pure white, or ACES pushes the brightest thing on her face
   * toward a lamp.
   */
  trollinaFace: 0xf2ece1,
  /** Tights, boots, belt, gloves and knee-pad straps. Real gear, worn by a scribble. */
  trollinaGear: 0x2c2e34,

  /**
   * Officer Dorkins — M18, and picked to be read at chase distance rather than
   * admired up close.
   *
   * The owner's reference (`docs/PLANS.md` §13 q23) is a hi-vis yellow yoke
   * over a navy polo with a blue-and-white chequer band, navy shorts, a white
   * vented helmet and black gear. **The chequer is the generic police-marking
   * idiom and the badge is an original shape**: no force's mark, crest or
   * wordmark is reproduced anywhere (`AGENTS.md`, "Use fictional manufacturers
   * and original designs"), and the reference image itself is AI-generated and
   * never ships.
   *
   * Two of these are picked against each other rather than against the
   * reference. The yoke has to be the brightest thing in the frame that is not
   * the sun, because "there is a cop behind you" has to be legible in a mirror
   * glance at 50 mph; and the navy has to stay *navy* rather than going black
   * in shade, because a dark silhouette with a yellow blob on it reads as a
   * hazard sign rather than as a person. Both are sRGB and are decoded to
   * linear before lighting, so they look lighter here than they will on screen
   * (`AGENTS.md`, colour authoring).
   */
  copShirt: 0x1e2a4c,
  /** The hi-vis shoulder yoke. Kept separate from the blue chequer band. */
  copHiVis: 0xd8c22a,
  /**
   * The chequer band, blue at shade 1 and driven toward white above it.
   *
   * M18's first pass used the yellow yoke material for both halves, producing a
   * mustard stripe instead of the reference's police read. One blue material
   * with vertex shades still costs one draw call and can carry the belt and
   * body-camera silhouettes at its dark end.
   */
  copBand: 0x2d6da8,
  /** The helmet. White, vented, and the top of the silhouette. */
  copHelmet: 0xdfe2e6,
  /**
   * Bare arms and legs — he is in shorts, which is most of the joke.
   *
   * Lightened in the owner's visual pass (2026-08-13): the first value went
   * muddy under the sun-and-sky rig and the head read as a different material
   * from the arms at chase distance. The reference's skin is a light warm
   * peach, and the cheerful face only reads if it is *bright*.
   */
  copSkin: 0xe2ab82,
  /** Boots, gloves, knee pads, duty belt. Slightly warmer than the wheel's black. */
  copGear: 0x2f3138,

  /**
   * Red Rider — M19, and the first palette in this file taken from a **real
   * person** rather than invented.
   *
   * He asked to be in the game and the owner agreed publicly; the reference
   * photograph, a polished character render and three stills of his customized
   * wheel are held under `references/red-rider/` and never ship. What the build
   * takes from them is his read: **red is the field and black is the
   * structure**, and that ratio is the character. Gloss red full-face lid, red
   * top and trousers, and every protective piece — chest harness, elbow and
   * knee armour, gloves, boots — in black.
   *
   * **Authored well below the reference's red, and Trollina's entry above is
   * why.** A saturated primary sits near the top of the sRGB gamut, the sun is
   * strong, and ACES rolls a bright saturated highlight toward white — a true
   * pillar-box red bleaches to salmon on the lit side at midday and takes the
   * character's whole identity with it. These are picked to survive full sun on
   * the shoulders while still reading red in the shade of a tree, which is the
   * same two-ended test the hi-vis yoke had to pass.
   *
   * Two of them are picked against the *machine* rather than against each
   * other, and that constraint is new in this file. `statusCritical` two
   * hundred lines up is `0xff2f2f`, and M19 puts a red machine under a red
   * rider — so the suit is held deliberately deeper and less orange than any
   * warning value the wheel can reach, and the wheel's own red (see
   * `machineRedRider*` below) is separated from it again. A rider whose gear
   * is the same red as "you are about to be thrown off" is a rider wearing a
   * warning light.
   */
  redRiderSuit: 0xba262b,
  /**
   * The lid, and it is **lighter than the suit** for exactly the reason
   * `riderHelmet` is: the chase camera looks at the back of a head all day, and
   * a helmet darker than the body subtracts the character's most recognisable
   * shape from the silhouette. His is gloss where Cool Rider's is satin, so it
   * carries a little more of the sky and can afford to sit further up.
   */
  redRiderHelmet: 0xd4333a,
  /** The dark smoked visor. Deeper than Cool Rider's — his reads near-black. */
  redRiderVisor: 0x1b1d22,
  /**
   * The hard armour: chest harness, elbow and knee guards.
   *
   * A separate value from `redRiderGear` and only just — armour is moulded
   * plastic and boots are matte leather, so they part company in *roughness*
   * far more than in hue (see the two material specs in `render/riderLook.ts`).
   * Kept a touch cooler than the boots so the harness reads as a piece of kit
   * laid over the chest rather than as a hole in it.
   */
  redRiderArmour: 0x26282e,
  /** Boots, gloves, and the harness webbing. Matte, and warmer than the armour. */
  redRiderGear: 0x2e3036,
  /**
   * The graphic down his outer **left** thigh — the one light value he wears.
   *
   * **It was removed once and is back deliberately.** The first build painted
   * it symmetrically, because the limb painters were handed no side, and it
   * landed on the *inside* of his right leg where it read as a lighting seam.
   * `RiderLook.paint` now carries the side, so it sits outboard on the
   * rider-left leg only, the way the reference wears it. Painting the same
   * mark on both legs was a later symmetry error, not a reference fact.
   *
   * The reference's own graphic is a commercial gear brand's wordmark and is
   * **not reproduced** (`NOTICE.md`, "Fictional designs and real-world brands";
   * `AGENTS.md`, original designs). The owner's decision of 2026-08-14 is that
   * the only branding Red Rider carries is his own name, so what ships is an
   * original angular mark in the same place, at the same size, doing the same
   * job for the silhouette.
   *
   * Warm rather than pure white: ACES drives the brightest thing on a sunlit
   * character toward the top of the range, and a true white here flares.
   */
  redRiderMark: 0xd8d2c6,

  /**
   * Adonisb2 — M22, the second palette taken from a real person, and the
   * exact inverse of Red Rider's problem: **black is the field and neon green
   * is the structure**. His photograph (under `references/guest-rider/`, never
   * shipped) is black kit head to toe — full-face lid, jacket, trousers,
   * gloves, boots, backpack — with the identity carried entirely by the
   * neon-green pieces: helmet striping, and knee/shin guards the reference
   * document forbids shrinking.
   *
   * The blacks are the Cool Rider exercise: authored lighter than the real
   * gear so form survives ACES. The green is the Trollina/Red Rider exercise
   * pointed at the other primary: picker-neon green (#39ff14 territory) sits
   * at the top of the gamut and bleaches to lime-white on a sunlit shoulder,
   * so it is authored well below the reference and must still read *neon*
   * against the blacks beside it — the contrast does most of that work.
   *
   * **One rule these values exist to enforce (§22.3 fact 4): a vertex colour
   * is a multiplier, so green must live in base materials and be painted
   * *down* to black — a black base can never be painted up to green.** The
   * Phase 1 look is built around that direction, and these are its starting
   * values, refined on captures like every palette above.
   */
  adonisb2Suit: 0x2b2d31,
  /**
   * Gloves, boots, backpack, its straps, and the boot shafts.
   *
   * **A step *lighter* than the suit, not deeper.** It was authored deeper on
   * the reasoning that laid-over kit is darker gear, which is true of the real
   * clothing and useless on screen: the owner's ride found the backpack, its
   * straps and the belt invisible, because near-black kit on near-black
   * clothing under one hard sun has nothing left to separate it. Every shade
   * above 1 in his panel groups was a patch on that. The gear reads as its own
   * material now, and the multipliers came back down to where they describe a
   * surface rather than rescue one.
   */
  adonisb2Gear: 0x46474b,
  /**
   * The lid — lighter than the suit for the reason every helmet in this file
   * is: the chase camera looks at the back of a head all day.
   */
  adonisb2Helmet: 0x34373d,
  /**
   * The one saturated value he wears: guards, helmet striping, and later the
   * angry-eye art on his wheel (M22 Phase 2).
   *
   * **Lime, not grass.** The first value here was a pure green picked by eye,
   * and the reference comparison measured the miss rather than argued it: the
   * neon mass of the owner's mockup averages rgb(103,172,11) and the
   * photograph's rgb(85,166,60), while the render of the first value averaged
   * rgb(75,165,34) — the same brightness at the wrong hue, short of red and
   * long on blue. Moulded hi-vis plastic is a yellow-green, and this walks the
   * albedo there while keeping the value that survived the ACES argument
   * above.
   */
  adonisb2Guard: 0x6fc814,
  /**
   * The large mirrored visor — pale where every other visor in this file is
   * dark, because *mirrored* is the read the reference names. Most of that
   * read is roughness, not albedo; this stays below white because a curved
   * reflective surface already catches the sun's mirror angle and ACES clips
   * it toward white (the M19 waist-strap lesson — on a visor that may be the
   * look, and the Phase 1 captures decide).
   */
  adonisb2Visor: 0x9cabb9,

  /**
   * Maribel Vargas — M23, the third palette taken from a real person, and the
   * first one that is **asymmetric**.
   *
   * Everything here was measured off `references/Maribel-Vargas/IMG_6600`
   * rather than picked by eye, which matters more than usual: that photograph
   * was taken in hard overhead sun, which is the light this game has, so its
   * readings are close to what the *render* should produce and the albedos
   * below sit a step under them. Where the AI render disagrees with the
   * photograph it loses (brief §5), and it disagrees loudly — it drives every
   * accent to picker saturation, which is exactly the value ACES throws away.
   *
   * **The structure is black with mid-grey panels**, which is what separates
   * her from the two black-suited riders already on the roster: Adonisb2 is
   * black head to foot with green armour, Cool Rider is one mid-grey-blue
   * garment. Hers is two values of neutral before any accent is applied.
   *
   * ---
   *
   * **Re-authored for value, M23 Phase A1b — and this block is the record of
   * why the measured version failed.**
   *
   * A1 shipped every one of her materials inside a ten-per-cent band of
   * brightness: suit `#33353e`, helmet `#36383f`, gear `#3d3f46`, hair
   * `#2f2622`. Each one was measured honestly off her own photographs, and
   * together they rendered a black void with a blue visor floating on it. The
   * owner's verdict was *"I am not happy with the design, at all"*, and the
   * §23.9c audit agreed with him and found the cause here rather than in the
   * polygon count.
   *
   * **A palette is a value story, and measuring reality does not author one.**
   * A photograph is a record of one light on one day; a game character is read
   * at forty pixels tall against a grey road, and every rider on this roster
   * that works has a two-step value story in it — Cool Rider's mid-grey against
   * black, Red Rider's red against charcoal, Adonisb2's green armour on black.
   * So from here the **hues stay measured** (they are hers, and the accents
   * below still sit where the photographs put them) and the **values are
   * designed**: helmet darkest, gear near it, suit a step up, panels a long
   * step above that, hair a light mass, the mark near-white. That spread is
   * the arcade-over-authenticity rule, applied for the first time to value
   * rather than to hue.
   *
   * The measurements stay in each comment as provenance. The shipped number is
   * a decision.
   *
   * Down from `#33353e`: the leather has to be the *floor* the panels step off,
   * and it was sitting where the panels should have been.
   */
  // **A1d lifted this from 0x24262d.**
  //
  // Her leather was authored as the darkest value on the roster and it made
  // her a hole rather than a character: measured against the game's own grass
  // at luminance 79, her suit rendered at 38 and her thighs at almost zero.
  // Everything printed on her is a *multiplier* over this base — the halftone,
  // her mark, every panel — so a near-black ground meant the atlas could paint
  // whatever it liked and none of it could show. The chest page is fully
  // saturated on the sheet and rendered monochrome on the rider.
  //
  // It is also more faithful, not less. Black leather in direct sun is a
  // mid-dark grey, which is exactly what the photograph of her in the van
  // shows and what the reference render paints.
  maribelSuit: 0x3a3d45,
  /**
   * The mid-grey stretch and panel material — flanks, outer arm, outer thigh,
   * shin, and (shaded down from the mark below) the shoulder armour.
   *
   * Measured at rgb(154,148,143) on a sunlit shin and rgb(61,48,46) in shade;
   * this is the albedo between them. It is the second-largest surface she
   * wears and the reason her silhouette has internal structure at distance
   * without a single extra mesh — every square millimetre of it is paint.
   *
   * **A1b lifts it and widens the gap below it.** Against the darker leather
   * this is now a full stop of separation rather than a hint of one, which is
   * what makes the flank, the outer sleeve and the outer thigh read as panels
   * at chase distance instead of as a slightly different black.
   */
  maribelPanel: 0x6b6f7a,
  /**
   * The lid — matte, where Red Rider's and Adonisb2's are gloss.
   *
   * Hers is a matte black road-racing shell in both photographs and the
   * roughness carries that; the albedo is a step lighter than the suit for
   * the reason every helmet in this file is, since the chase camera looks at
   * the back of a head all day. It also has to *lose* to the visor: on this
   * character the glass is the identity and the shell is its frame.
   *
   * **A1b inverts the "step lighter" reasoning for this one part**, and the
   * capture is why: her head now carries a loose hair mass on both sides of it
   * and a mirrored shield across the front, so the shell is no longer a lone
   * dark ball needing to be found — it is the *frame* two brighter things are
   * read against, and the darkest value on the character is the right one for
   * it. What separates it from the suit below is that nothing else here is
   * this dark.
   */
  // Lifted with the suit. A matte black lid still reads as black beside a
  // 0x3a3d45 suit; what it gains is the internal structure — chin bar, brow,
  // spoiler, rim — that was authored below what the display could show.
  maribelHelmet: 0x2e3138,
  /**
   * **The single loudest thing she wears**, and the second item in the
   * brief's own recognition order.
   *
   * A mirrored blue-cyan, where Cool Rider's and Red Rider's visors are
   * near-black and Adonisb2's is a neutral pale mirror — so no two riders'
   * glass reads alike. Measured across the shield in the front photograph:
   * rgb(65,133,195) over the main field and rgb(90,185,205) where the
   * iridescence turns cyan near the brow. This is the blend, and the *mirror*
   * comes from roughness and a cool emissive rather than from albedo, the
   * approximation Cool Rider's blue established.
   *
   * **A1b hands the iridescence to the atlas and keeps this as the mirror's
   * mid-tone.** `render/maribelAtlas.ts` paints the shield's whole sweep —
   * deep blue at the brow, cyan toward the chin — as a multiplier over this
   * value, which is the thing a single albedo could never hold and the reason
   * the render's visor looks like glass and A1's looked like a blue card.
   */
  maribelVisor: 0x63c8ea,
  /**
   * Her right-hand accent — bicep ring, ankle cuff, and the aqua half of the
   * chest gradient. **Aqua lives at −X**, which is her right; the brief's
   * "left-side accent: aqua" is the viewer's left and the photographs decide
   * (§23.2).
   *
   * The photograph reads rgb(142,199,205) on a sunlit bicep and rgb(154,216,216)
   * at the ankle — both washed by the sun, both at a third of the saturation
   * the AI render draws. This is authored between the two: deep enough that
   * the sun leaves it turquoise rather than white, light enough that it never
   * disappears into the black beside it.
   *
   * **A1b takes it up to arcade weight.** Against a leather floor two stops
   * darker than A1's, the restrained turquoise had nothing to be restrained
   * against; this is the same hue with the value the print needs to survive
   * ACES on a small surface.
   */
  maribelAqua: 0x35cbc3,
  /**
   * Her left-hand accent — the same three places, at +X. Measured
   * rgb(230,69,107), and lifted with the aqua so the two halves of the livery
   * stay each other's equal.
   */
  maribelCoral: 0xe63a61,
  /**
   * The gloves. **A large field, not a knuckle pinstripe** — the photograph's
   * gloves are fluorescent from cuff to fingertip on the outer face, and at
   * chase distance they are two bright marks at the ends of the arms, which
   * is more identity than anything else below the shoulders.
   *
   * A yellow-green (H67°) rather than the cop's amber hi-vis (H50°) or
   * Adonisb2's lime (H85°), which is where the measurement put it.
   */
  // The measured value off her own gloves. A1d's captures showed the hi-vis
  // dying to olive at chase distance — the one cue on her hands that carries
  // at forty pixels — because the authored value had a blue lift in it.
  maribelHiVis: 0xc7dd0f,
  /**
   * Boots, glove bodies, and the gaiter under her chin.
   *
   * A1 made this a step *lighter* than the suit on the M22 reasoning that
   * near-black kit on near-black clothing has nothing to separate it. A1b
   * takes the other road, because the M22 lesson was about two materials that
   * had to be told apart and these two do not: her boots are what the figure
   * *stands on*, and a character whose feet are lighter than her legs floats.
   * The separation now comes from the boots being the darkest thing below the
   * knee against a leg that is a step up, plus the panel-lit boot detailing —
   * which is a value story rather than an offset.
   */
  // Lifted with the suit, and for the same reason plus one of its own: this
  // is the gaiter under her chin, and at 0x17181d it was the darkest value on
  // the character — so the helmet's lower half and her neck merged into one
  // silhouette and she had no chin.
  maribelGear: 0x2a2d36,
  /**
   * The white angular chest device, and the base the shoulder armour is shaded
   * down from.
   *
   * Warm-neutral and below white for `redRiderMark`'s reason — ACES drives the
   * brightest thing on a sunlit character toward the top of the range, and a
   * true white flares. Being the *pale* base is deliberate: the armour, the
   * hair and everything else this material carries is painted **down** from
   * it, which is the direction a vertex multiplier honours (§22.3 fact 4).
   *
   * **A1b makes it the printing ground as well**, which is a second job with
   * one hard requirement: `render/maribelAtlas.ts` paints a *multiplier*, and
   * a multiplier can only ever darken. Every colour on her printed sheet — the
   * leather it dissolves into, the aqua and coral dots, the white of her mark
   * — is reached down from this one value, so it has to sit above all of them.
   * A pale base is no longer only the direction a vertex tint honours; it is
   * the ceiling the whole print hangs from.
   */
  maribelMark: 0xdcdde1,
  /**
   * Her hair, dark — and it is here because the owner said so, not because a
   * reference showed it: every racing photograph has her helmeted, and the AI
   * render guessed a plain dark brown.
   *
   * Measured off the reference he then supplied
   * (`references/Maribel-Vargas/hair color ref.webp`): the darkest decile of
   * that hair mass is rgb(23,20,21) and the roots read rgb(43,34,32). This is
   * authored above both, because dark hair against a dark helmet under one
   * hard sun is the exact case where an honest albedo becomes a bigger helmet.
   *
   * **A1 was authored above the darkest decile and still came back as a bigger
   * helmet.** The same reference read in *sunlight* rather than in its shadows
   * gives a mid-brown around rgb(90,75,70) across the mass, and that is the
   * value a player sees. A1b authors to the lit reading: still unmistakably
   * dark brown, no longer a silhouette hole. The hue is untouched — it is
   * hers, and the render's warmer caramel loses to the photograph (brief §5).
   * A1c holds this value: the rebuilt mass is much larger, and the owner's
   * direction is that the hair itself stays dark brown — the highlights, one
   * entry down, are what came toward it.
   */
  // **Dark brown, and A1d's first pass was not.** 0x554b45 measured as a mid
  // grey-taupe on screen; both references put her hair's core between
  // rgb(30,22,17) and rgb(37,31,27), and the owner's standing note is that it
  // *"should remain dark brown"*.
  // **Lifted again once the suit stopped being black.** 0x342a22 was measured
  // against her references' own hair core and was right — against black
  // leather. A1d lifted the leather to 0x3a3d45, and a capture then measured
  // her hair at rgb(29,22,17) against a suit at rgb(33,34,39): the hair was
  // *darker* than the garment, so at forty pixels she had no hair at all, only
  // a dark silhouette. What the references actually show is brown hair against
  // black leather — a relationship, not a pair of absolute values — and this
  // is that relationship restated against the new ground.
  maribelHair: 0x33281f,
  /**
   * The unnatural blonde in it — the second authored value the ponytail needs,
   * and the reason it reads as hair at thirty metres rather than as a dark
   * blob hanging off a dark shell.
   *
   * **Ashy, not golden.** The brightest decile of the same reference measures
   * rgb(162,151,140): a bleached, low-saturation greige. A warm blonde here
   * would be somebody else's hair.
   *
   * **A1b lifted it to a near-greige and A1c brings it back down.** At
   * rgb(196,184,169) across fifteen alternating locks, the "highlights" were
   * half the hair's area and the chase capture read as grey dreadlocks — the
   * owner's reviewer said the hair must read dark brown first, with
   * highlights that *catch light*, not carry the mass. An ash mid-brown a
   * long step above the base does exactly that: the bleach ramp in
   * `maribelHair()` now confines it to the ends besides, so this value is the
   * tip of a dark mass rather than half of a striped one.
   */
  // Ash, at 1.9x the base rather than 2.4x. The first A1d pass put this at
  // 0xc0b6a5 and the ends came back as near-white ropes hanging below the mass
  // — bleached bone rather than sunlit hair.
  //
  // **2.4x again at M23's fourth hair pass, and the difference is where it
  // lands rather than how bright it is.** 0xc0b6a5 failed on fifteen
  // alternating locks, where a bright value *was* half the mass; 0x8d8177 was
  // the retreat from that. The owner's note against `hair color ref.webp` —
  // *"the highlights/tips are not obvious enough"* — is about the one thing
  // both of those got wrong: the reference is a dark-rooted balayage whose
  // ends go pale and whose crown does not. One curtain with a ramp confined to
  // its bottom two rows can hold a genuinely pale tip without the mass ever
  // becoming blonde, which fifteen locks could not. Still ashy greige, still
  // a long way under the reference's own brightest decile — and **ashier than
  // the first cut of it**: 0xa79b8c rendered at 22–24% saturation and hue
  // 33–38°, where the reference's pale measures 5–15% at hue 0–13°. A sandy
  // blonde is a different woman's hair. This is the same value, desaturated.
  maribelHairLight: 0xa39d97,

  /**
   * Her purple — M23 Phase A2, and it comes from her own logo.
   *
   * The lightning-M and the devil head she had drawn for herself are purple,
   * the AI render puts purple pads on her machine, and the two agree, which is
   * rare enough to take. It is also the only strongly saturated colour on any
   * machine in the game that is neither a warning nor a lamp — Red Rider's
   * bodywork is red, Adonisb2's plate is green, and both of those are large
   * fields; hers is four pads on a black wheel, which is the arrangement that
   * lets a colour this loud be a signature rather than a paint job.
   */
  maribelPurple: 0x8b46dc,
  /**
   * **Her logo's purple, which is not her wheel's purple** — A1d.
   *
   * Sampled off the artwork she sent: the mark ramps from a warm mauve at the
   * brow down to a deep violet at the point of the V. `maribelPurple` above is
   * the blue-violet of the pads she rides on, and the two are close enough to
   * be confused and far enough apart that using one for the other is visibly
   * the wrong logo. The owner's standing instruction on this mark is that it
   * *"must look exact to the original"*, and a colour is part of an original.
   */
  maribelLogo: 0x9d4fa6,
  maribelLogoDeep: 0x543080,

  /**
   * The shell those pads are bolted to: the blackest bodywork in the game, a
   * shade under her helmet so the machine sits *below* the rider in value the
   * way a dark wheel under a dark rider has to if either is to be found.
   */
  maribelMachine: 0x1b1c21,

  /**
   * Wheel in Motion — M28 Phase 1. A real rider's kit, read off his own
   * photograph first and the target render second (brief §5), and authored
   * under the value floor `DESIGN.md` §7k set: every field below has headroom
   * under the sun, and the black gear is a mid-dark grey in albedo.
   *
   * **The print ground is the ceiling of the jersey.** His jersey is two
   * saturated hues on one garment — blue and yellow — and neither can be
   * painted *up* from the other (a vertex colour and a texel are both
   * multipliers). So the garment is a printed one: a near-white base with the
   * blue field, the yellow sweeps and his mark laid on as ink
   * (`render/wimAtlas.ts`), which makes this the one albedo every other jersey
   * colour hangs from. It sits above the yellow in every channel on purpose.
   *
   * **His blue is not Cool Rider's blue** — the owner's own note. Cool Rider's
   * panels are `riderPanel` 0x2f7fe8, hue 214°, lit further by an emissive;
   * the photograph clusters his jersey at hue 203° (a cyan-leaning azure,
   * `#1f8bd0` lit). It is stated here as its own value, cooler than his and
   * with no emissive — and since the owner's look pass (2026-09-01) it is
   * the shell's blue and the trousers' too: *"just same blue and yellow as
   * clothes"*, *"make his pants same blue as shirt."*
   */
  wheelInMotionPrint: 0xfbfbf7,
  wheelInMotionBlue: 0x1490dc,
  wheelInMotionYellow: 0xfad414,
  /**
   * His wheel's orange (Phase 2, `docs/PLANS.md` §28.5) — and nowhere on the
   * rider. The target render dressed his helmet in it and Phase 1 followed;
   * the owner struck it on the ride (2026-09-01): *"leave orange for the
   * wheel."* The orange in his mark is the file's own.
   */
  wheelInMotionOrange: 0xf07a1a,
  /**
   * The visor. Dark mirrored with a subtle sheen — the photograph's lens,
   * not the render's green window. The page over it can only darken, so this
   * is the visor's brightest value and the gradient works down from it.
   */
  wheelInMotionLens: 0x3a4652,
  /** The knee and shin shell — white plastic, a step under the print ground. */
  wheelInMotionGuard: 0xe8e9e4,
  /** Boots, gloves, the pack and its straps, the gaiter, the knee cups. */
  wheelInMotionGear: 0x2e3136,
  /**
   * His wheel — M28 Phase 2 (`render/machineLook.ts`).
   *
   * The brief's §11 relationship, **black base + blue structures + orange
   * pads**, in the direction the multiplier honours. `machineWheelInMotion`
   * is the shell: a graphite black with headroom, like Adonisb2's, so the
   * painter can still take the recesses down. The blue is the leg pads' own
   * material — `machineWheelInMotionBlue`, the cyan-leaning azure the
   * photograph's side structures cluster at, a step lighter than his
   * jersey's `wheelInMotionBlue` because moulded plastic under the sun reads
   * a stop brighter than knit — and the orange is `wheelInMotionOrange`
   * above, reached as a tint over the pale trim base
   * `machineWheelInMotionTrim`, which is also the white of the plate his
   * mark sits on.
   */
  machineWheelInMotion: 0x24262b,
  machineWheelInMotionBlue: 0x1eaaf0,
  machineWheelInMotionTrim: 0xf4f3ef,

  /**
   * The Drunkard — M29 Phase 2 (`docs/PLANS.md` §29.5). A fictional parody
   * rider whose target render is the authority, in the brief's palette:
   * amber, cream, brown, hop green.
   *
   * **The print ground is cream, and it is the ceiling of the whole rider.**
   * A vertex colour and a texel are multipliers, so the one colour that is
   * lighter than every other in every channel has to be the base: the foam
   * on his hat, the foam line on the pack, the cans' top bands, the cream
   * yoke and the sleeve stripes are this ground *left unpainted*, and the
   * amber, the browns and the hop green are ink on it (`render/
   * drunkardAtlas.ts`) or paint (`RiderLook.paint`). Warm rather than white —
   * Wheel in Motion's ground is `0xfbfbf7`; his sits a stop under it with a
   * yellow cast so the foam reads as beer foam beside the amber rather than
   * as the guard-white of the rider before him.
   *
   * **The amber is the card's swatch** (`0xe8951f`, hue 35°, q106): the
   * identity colour, 13° from Wheel in Motion's yellow and separated from it
   * by saturation and depth. It is the jersey field, the hat shell, the can
   * labels, the trousers, the tubes and the pack's window, all one value so
   * that the sun paints the differences.
   *
   * **The browns have headroom** (`DESIGN.md` §7k). `drunkardBrown` is the
   * printed brown — the waist band, the pack's frame, the knee pads — a
   * mid-dark chocolate that renders as brown under the sun rather than as a
   * hole. `drunkardGear` is the boots, gloves, straps, valve and soles: a
   * step darker so the kit sits under the garment in value, and still far
   * from the `0x24262d` this project has learned not to author.
   *
   * **The hop green is the one accent** (brief §4): on the chest, the knees
   * and the can labels, and nowhere on any other rider's sheet — his test
   * samples theirs for this exact ink.
   *
   * **The skin is the face material's base**, and the palest things on the
   * face — the tooth strip and the lens glints — are vertex *lifts* over it,
   * the cop's own lens trick, so the shades need no second material and the
   * lens is the one near-black on him, small and glossy by tint.
   */
  drunkardPrint: 0xf4e9cf,
  drunkardAmber: 0xe8951f,
  drunkardBrown: 0x5a3b1c,
  drunkardGear: 0x46301b,
  drunkardHop: 0x5f9a2c,
  drunkardSkin: 0xd8a273,
  drunkardLens: 0x1e1c22,
  /**
   * The garment's cream — gauntlet round 1: the print ground is the *foam*,
   * and the target's jersey cream measures 1.4–1.9× more saturated than its
   * foam (boot-to-boot, the one like-for-like pair: 0.182 against 0.126).
   * Red held at 244 so no value is lost; a paint down from the ground in the
   * green and blue only (0.887, 0.696 as multipliers), which is what lets it
   * be ink and tint under the same rule as everything else on him.
   */
  drunkardIvory: 0xf4ddb0,
  /**
   * His wheel — M29 Phase 3 (`render/machineLook.ts`, `docs/PLANS.md` §29.6).
   *
   * The brief's §10 wheel, in the direction the multiplier honours: a dark
   * brown body, amber pads, cream trim. `machineDrunkard` is the shell — a
   * near-black *brown* with headroom, just under `drunkardGear` and a step
   * under `drunkardBrown`, so the painter can still take the status
   * light's bezel and the nose recess down from it and the body still reads
   * brown beside the tyre's neutral black rather than as a second tyre.
   *
   * `machineDrunkardAmber` is the pads' amber, reached as ink over the cream
   * trim base (a printed pad is the pale base and its amber is the page's):
   * the same hue as the jersey's `drunkardAmber` (35°) and a stop under it,
   * so the rider stays the brightest amber in the frame and the pad reads as
   * moulded plastic rather than the garment continued. It is deliberately
   * not the status light's amber rung (`statusWarn`, 29° and fully
   * saturated); the light sits in an amber field on this wheel, and the dark
   * painted bezel is what protects it (fact 11).
   *
   * `machineDrunkardTrim` is the cream: the trim material's base, the pad
   * material under its page, and what every amber and brown on the wheel is
   * painted down from. A stop under the rider's `drunkardPrint` so the foam
   * on his hat stays the palest thing on him — and, since gauntlet round 2,
   * a *paint* down from that ground in the green and blue rather than a
   * value step: `0xefe3c6` kept only 60 % of the garment ivory's warmth, and
   * under the blue sky fill and the tone curve it rendered as a neutral
   * grey-white, the headlight's own family, on every skyward face. This is
   * the rider's ivory lane (HSV saturation 0.289 against `drunkardIvory`'s
   * 0.279, hue 43°), luma 0.741 — still over the 0.7 the test holds it to.
   * Every ink over it (`render/drunkardMachineAtlas.ts`) still solves under 1.
   */
  machineDrunkard: 0x42301e,
  machineDrunkardAmber: 0xd98a1d,
  machineDrunkardTrim: 0xf2deac,

  /**
   * FloWithZo — M34 (`docs/PLANS.md` §34.4 for the rider, §34.5 for the
   * wheel). A real EUC racer, in the game by permission, read off his own two
   * photographs first and the target render second. **Phase 0 lands all
   * eleven keys at once** so that Phases 1 and 2 tune *values* on lines they
   * each own rather than adding blocks to this file at the same time; the
   * names are fixed, the numbers may move.
   *
   * **The ground is the ceiling, and it is silver.** Fact 9 (`§34.3`) is the
   * whole reason there is no sheet on him: every accent he wears — the vest's
   * mid-grey, the charcoal gear, the cyan and the gold at the hem — is
   * *darker* than the suit in every channel, and a vertex colour is a
   * multiplier, so all of it is reached by painting **down** from
   * `floWithZoSilver`. Only the guard white is above the suit, and the guards
   * are patches in the `accent` role with their own material. That leaves the
   * rider with no atlas, no print and no page anywhere on him — the first
   * real-person rider on the roster where that is true.
   *
   * **`floWithZoPanel` is the paint target of the vest, the shoulder cap and
   * the outer thigh**, warm-neutral so it does not compete with the cyan for
   * the eye, and **0.58 of the ground in linear since the r2 gauntlet** — it
   * was authored at 0.37 on a reading of PHOTO 1 that turned out to be the
   * panel's own shadowed side. Two blind critics in that round measured the
   * same tier from opposite ends: the chest plate rendered at **0.43 × the
   * light suit beside it** where PHOTO 1 gives 0.56–0.67, and the shoulder cap
   * at **0.47–0.55 ×** where PHOTO 1's shoulder panelling gives 0.78 and
   * PHOTO 2's lit shoulder 1.00, so a critic asked for the caps to be deleted
   * as charcoal the photographs do not carry. The verifier's ruling was
   * *repaint, do not delete* (`flo-views/_scratch/gauntlet-r2-record.md` §D
   * 2b / 2c), and one value serves all four surfaces the key paints, since the
   * vest, the cap, the outer thigh and the collar are one tint by
   * construction. `0xacaba5` holds the key's own hue (51°) and saturation
   * (0.046) and lands the rendered pair at ≈ 0.63 and ≈ 0.81 — and it stays
   * one step **above** `floWithZoBronze`'s 0.54, so the value ladder from suit
   * to panel to lid still falls in one direction.
   *
   * **`floWithZoGuard` is the knee and thigh armour** — moulded plastic reads
   * a stop above knit under the same sun (`tuning.ts:4344`, Wheel in
   * Motion's), which is what keeps the biggest volume on his legs from
   * reading as more trouser.
   *
   * **`floWithZoGear` is the value floor, not black.** Gloves, collar, elbow
   * patches, the guards' joints and the sole: a real black in sun is a
   * mid-dark grey in albedo (`DESIGN.md` §7k), so the red byte is 60 and no
   * lower, and the hue is held clear of the seven near-blacks already taken.
   *
   * **`floWithZoBronze` is the lid** — a near-neutral pewter since the r1
   * gauntlet, and the key keeps its name because `docs/PLANS.md` §34 is
   * frozen until Phase 4 (the name is the plan's, the value is the
   * photographs'). It was authored warm (`0xb2a28e`, hue 33°) and two blind
   * critics scored the same defect independently: measured head-against-suit
   * inside one frame, the game read R−B **+26** on the shell against **+3**
   * on the suit where both photographs run 1 to 10 points **cooler** than
   * the body, so the head's colour temperature was inverted against the
   * rider wearing it. `0xa8a5a1` normalises warmth to R−B / L 0.042 against
   * the suit's 0.041 (the photographs' pairs are 1.01 × and 1.17 ×) and
   * **holds the value**: Ylin 0.378 against the bronze's 0.373, still
   * ≈ 0.53 × the suit's and inside the 0.47–0.60 window a lid may take
   * before it reads as a void from behind (`flo-views/_scratch/gauntlet-r1-record.md`
   * §C 1a / 6a). Its roughness stays where a capture of the crown put it.
   *
   * **`floWithZoLens` is the visor's brightest value** (the page over it can
   * only darken): a dark cool smoke sitting between `wheelInMotionLens` and
   * Red Rider's.
   *
   * **The hem band is two hues, and handedness is a test.** `floWithZoCyan`
   * at hue 188° threads the gap between the roster's teals (177°) and its
   * azures (202°, 214°); `floWithZoGold` at hue 38° is PHOTO 2's `#ecba70`.
   * They meet at the spine — cyan on his **right**, gold on his **left**
   * (`docs/PLANS.md` §34.4; `floWithZo.test.ts` asserts the multiplier on the
   * built torso rather than trusting the author's mirror).
   *
   * **His wheel** (§34.5), in the direction the multiplier honours:
   * `machineFloWithZo` is a neutral graphite shell with headroom — 1.5 × the
   * luminance of Wheel in Motion's `0x24262b` and under Adonisb2's
   * `0x303338`, so the bezel behind the status light and the nose recess can
   * still be painted down from it. `machineFloWithZoTrim` is the pale trim
   * base *and* the pads' own colour (the first pale pedals on the roster),
   * and every accent on the machine is tinted down from it.
   * `machineFloWithZoOrange` is the one warm accent — hue ≈ 22°, between
   * PHOTO 1's badge at 17° and PHOTO 2's rim at 28°, ≥ 5° from the
   * Drunkard's amber on the `drunkard.test.ts:1210` precedent and
   * deliberately not `wheelInMotionOrange`'s hex. The photographs put that
   * orange on the *tyre*, which has no paint hook and no per-channel tint, so
   * it lives low on the flanks and on a nose badge instead (§34.5).
   */
  floWithZoSilver: 0xdcdad3,
  floWithZoPanel: 0xacaba5,
  floWithZoGuard: 0xe6e7e2,
  floWithZoGear: 0x3c3e44,
  floWithZoBronze: 0xa8a5a1,
  floWithZoLens: 0x3b4148,
  floWithZoCyan: 0x1eb4cc,
  floWithZoGold: 0xdcae5c,
  machineFloWithZo: 0x2c2f35,
  machineFloWithZoTrim: 0xd9d8d3,
  machineFloWithZoOrange: 0xe8661c,

  /**
   * Seal on a Wheel — M35 (`docs/PLANS.md` §35.4 for the rider, §35.5 for the
   * wheel). A real EUC rider, in the game on a public ask of his own, read off
   * three frames of his own riding video first and the target render second.
   * **Phase 0 lands all eighteen keys at once** so that Phases 1 and 2 tune
   * *values* on lines they each own rather than adding blocks to this file at
   * the same time; the names are fixed, the numbers may move.
   *
   * **Every hue below is quoted twice, and the two are not interchangeable.**
   * The sRGB hue is what a picker and the reference photographs speak; the
   * linear hue is what `new THREE.Color(hex).getHSL()` returns and what the
   * per-rider separation tests actually measure (`floWithZo.test.ts:100`).
   * They diverge by up to 13° on this rider's colours, and in the reds they
   * *compress* — see the lid below, which is the one place a rule and a space
   * disagree.
   *
   * **He is the mirror image of FloWithZo, and that decides the whole family.**
   * Everything he wears is black, so the ground is the *floor* rather than the
   * ceiling: his two bright things — the tied sweatshirt and the lid's white —
   * are far lighter than the kit and cannot be reached by a vertex-colour
   * multiplier from it at all, which is why `sealGarment` and
   * `sealHelmetWhite` are their own roles rather than paint (§35.2, and
   * `floWithZoGuard`'s precedent at the other end of the same argument).
   *
   * **`sealGear` is the ground and the value floor**: the short-sleeved black
   * top, authored as the mid-dark grey a real black garment is in sun, red
   * byte **70** and no lower (`DESIGN.md` §7k, the rule `floWithZoGear` states
   * as "60 and no lower"). sRGB hue 228°, linear 229°.
   *
   * **The rest of the blacks are separated by value, in the order the
   * references rank them**, because there is no hue room left — the shipped
   * table already holds eight near-black gear greys inside 218–228° and five
   * near-black machine bodies, and in the target render every black surface on
   * him sits between Ylin 0.004 and 0.047. The ladder authored here, in linear
   * luminance: `sealPack` **0.047** (the darkest thing he wears — a black
   * day-pack reads as a hole beside knit), `sealBoot` 0.051, `sealGlove`
   * 0.056, `sealHelmetBlack` 0.059, `sealTrouser` 0.061, `sealGear` **0.065**
   * (the ground), `sealPad` **0.089**. The pads are the only surface lifted a
   * whole stop: moulded plastic reads a stop above knit under the same sun
   * (`tuning.ts:4344`, Wheel in Motion's), and his knee shells are the biggest
   * volume on his legs. `sealTrouser` sits at the top's value a touch warmer
   * and greyer — sRGB 245° against the top's 228°, the direction the
   * photographs give (trousers 250–252°, top 222–240°) rather than their
   * shade-lit absolute.
   *
   * **`sealGarment` is the sweatshirt knotted at his waist, and it carries the
   * whole value range on the body.** A cool light grey at Ylin **0.718** — the
   * brightest thing on him by ten to thirty times and still below
   * `floWithZoGuard` (0.795) and well below `wheelInMotionPrint` (0.962), so
   * the roster's brightest garment does not change hands. Authored grey and
   * not white: the target render's sunlit `#dcdce8` is the saturated extreme
   * and the photographs' shade-lit `#a3a8c3` the other, and a white here would
   * blow out under ACES the way a saturated primary does.
   *
   * **Phase 1 moved it up its own band, from Ylin 0.681 to 0.718, because it
   * is also the lid's printing ground** — hue held exactly (sRGB 229.1°,
   * linear 229.4°), value taken to the top of §35.2's authorized 0.62–0.72.
   * The helmet is a code-painted page and `inkOver` divides and clamps at one,
   * so the page's ground has to stand at or above every ink on it in every
   * channel; none of the lid's own three colours does, and adding a
   * fifteenth key for a surface no player can see would be a colour nobody
   * could point at. The garment's grey clears the red's red byte exactly and
   * the white and black comfortably, so `materials.head` wears it and every
   * texel of the lid inks over it. `sealOnAWheel.test.ts` holds that relation
   * rather than this paragraph: the ground dominates every ink in every
   * channel, or the page would clamp and the red would quietly render as the
   * ground.
   *
   * **The lid is three colours and one of them is the tightest hue in the
   * build.** `sealHelmetRed` is authored at sRGB **351.5°** — q148's default,
   * 5.1° clear of `maribelCoral` (346.4°) and 5.9° clear of `redRiderHelmet`
   * (357.4°), the two *rider* reds, and 3.9° from `taillight` (355.4°) on
   * `redRiderHelmet`'s own precedent that a rider colour may sit a degree from
   * a machine lamp. **In linear space that clearance is not there and cannot
   * be**: the whole red arc this roster owns compresses into 353.8–359.1°
   * (`maribelCoral` 353.8, `taillight` and `machineRed` 359.0,
   * `redRiderHelmet` 359.1, `statusCritical` 0.0), a span of 6.2° in which no
   * red clears any other by five. His lands at linear 356.9 — 3.1° from
   * `maribelCoral` and 2.3° from `redRiderHelmet` — so the honest statement of
   * the separation is sRGB hue plus value and saturation, and Phase 1's test
   * says so rather than asserting a bar that no red on this roster could pass.
   * **Phase 1 held both hues and the saturation and lowered the value one
   * notch — Ylin 0.195 → 0.175, sRGB 351.5°, HSV S 0.78 unchanged — because
   * the lid is printed and its ground has to stand above it** (see
   * `sealGarment`). A uniform scale of the gamma-encoded channels is a uniform
   * scale of the linear ones, so neither hue moved and the 5.1°/5.9° sRGB
   * clearances are the numbers above; 0.175 is inside §35.2's authored
   * 0.17–0.22 band, and the lid is still the brightest thing above his waist
   * by 2.7 × the top.
   * `sealHelmetWhite` is a cool off-white at Ylin **0.681**, a hair under the
   * garment; `sealHelmetBlack` is the brow band, the eye-port surround and the
   * lower chin bar, on the same floor as the kit. Area order on the page is
   * **red > black > white**, which is what the photographs give.
   *
   * **The white rose 17 % in M35's r3 fix pass, and it is the round's one
   * colour miss.** Two blind critics reached it from opposite ends of the rider
   * — the helmet's and the chase camera's — and the albedo settles it without
   * either one's pixel box: the shipped pair rendered the sash at **1.235 ×**
   * the lid's white, where all three stills rank them the other way (PHOTO 2
   * waist cloth ÷ chin flash **0.66**, PHOTO 1 rear pale band **0.60**, PHOTO 3
   * at the knot 0.94). That inversion is what made the garment the loudest
   * thing on him at gameplay distance. **The lid is the only lever**: the
   * garment's floor is spoken for by `sealNeon` at 0.685 and a shipped
   * assertion that the rand stays under it, so `sealGarment` can fall 3 % and
   * no further without reversing r2's blocker fix. `0xd0d8e3` lands the ratio
   * at **1.054**, moves the sRGB hue 217.5° → **214.7°** and the saturation
   * 0.076 → 0.084 — the blue-cast half of the finding was refuted on PHOTO 1's
   * own lid whites (hue 218–219 at S 0.14–0.15, at least as blue as this key),
   * so the hue stays inside five degrees and only the value is the fix. The
   * print ground still dominates it on every channel, with blue the tightest at
   * **98.0 %** of the ground. **The residual is recorded rather than rounded
   * away**: §35.2's two authoring bands — the lid at 0.55–0.62, the garment at
   * 0.62–0.72 — cannot both hold with the photographs' own ratio, and closing
   * the rest needs a fifteenth colour key (a near-white print ground of the
   * lid's own) that §35.2 and §35.4 declined on purpose
   * (`seal-views/_scratch/gauntlet-r3-record.md` §C-3 and §E 1).
   *
   * **`sealVisor` is the visor's brightest value** (the print over it can only
   * darken): a dark cool smoke at Ylin 0.028, between `floWithZoLens` (0.052)
   * and `redRiderVisor` (0.012). It is the one deliberate departure from the
   * photographs, where the visor is up and his face is visible in all three
   * frames — the roster is helmeted and a real person's face is the wrong call
   * (§35.2, the brief and the render agree).
   *
   * **`sealGloveRed` is real, not invented**: the photographs give a red
   * palm-and-knuckle section at sRGB 337–341° and the target render `#90131f`
   * at 354°. It is authored as the lid's own red taken down to Ylin 0.072 —
   * one family, two values — so a patch the size of a knuckle does not
   * introduce a tenth red to the table.
   *
   * **`sealNeon` is the shoe accent, and it is yellow rather than lime.** The
   * photographs give sRGB 49–62° and the render 65°; 58.5° is the one slot
   * that clears both `copHiVis` (52.4°, by 6.1) and `maribelHiVis` (66.4°, by
   * 7.9), and in linear the same pair is 10.7° and 15.3° away. It is authored
   * for the rand *above* the pedal line, because the pedal covers the bottom
   * quarter of the sole at every capture angle (`paintFloBoot`'s device).
   *
   * **Its saturation fell by a quarter in M35's r3 fix pass and its hue did
   * not** (§E 2, the gauntlet's second-largest measured miss). Hue-filtered
   * inside one frame, PHOTO 1's sunlit sole reads p95 **S 0.31 at v 0.94**
   * where `0xd8d43b` rendered p95 **S 0.66 at v 0.73** — double the saturation
   * at two thirds the value, a lime rather than a pale yellow — and the
   * within-frame ordering flipped with it: the photograph's sole peaks *above*
   * its own garment and the road line, the shipped rand peaked *below* its own
   * sash. This milestone's own measurement sheet says the same thing against
   * the key (`research/reference-measure.md` records the photographs at S 0.34
   * and the target render at 0.60–0.77): the authored value took the target's
   * saturation. `0xe0dd65` is **S 0.549, V 0.878, Ylin 0.685** at sRGB 58.6°,
   * and both narrowings off the critic's literal S 0.30–0.35 at V 0.95 are the
   * plan's own — §35.7's caveat runs a shade-lit still 0.15–0.30 under the
   * paint, and §35.2 makes the tied sweatshirt the brightest thing on the body,
   * which caps this under `sealGarment`'s 0.717. The hue moves by a tenth of a
   * degree, so both five-degree clearances above survive in sRGB and in linear.
   *
   * **`sealSkin` is the roster's first fair skin**: sRGB 17.0°, S 0.25,
   * Ylin 0.611 — paler and cooler than the four tans already here
   * (`coolSkin` 23.8°, `trollinaSkin` 23.4°, `copSkin` 25.6°, `drunkardSkin`
   * 27.9°), which is what the photographs give. It matters more on him than on
   * anyone: his sleeve hem is high on the upper arm and his glove cuff is
   * short, so bare forearm and upper arm are the only large warm area anywhere
   * on an all-black rider, and they are a real read cue at chase distance.
   *
   * **The value rose 9.5 % in M35's r2 fix pass and the hue did not.** A skin
   * key cannot be judged against the roster, because every other rider stands
   * in different kit, so r1's piece 4 judged it the only way a photograph
   * allows — as a ratio inside one frame. PHOTO 1's sunlit frame gives forearm
   * ÷ garment **0.77–0.93** and upper arm ÷ garment **1.28–1.55**; `0xd4b5a9`
   * stood at 0.696 against his own sweatshirt and rendered 0.48, a full step
   * dark beside the brightest thing he wears. `0xe8c6b9` is the same three
   * bytes scaled by 1.093, which lands the ratio at 0.851 and leaves HSV hue
   * and saturation where they were to a rounding step — the warmth half of the
   * finding is a shade-lit read and was not confirmed
   * (`seal-views/_scratch/gauntlet-r1-record.md` §E 8).
   *
   * **And the chroma came up in the r3 pass, with the hue held again.** This is
   * the one axis of the key three rounds agree on against the shipped value:
   * §35.2's authoring row asks **S 0.30–0.35** and the stills, measured
   * in-frame, give **0.22–0.26** (PHOTO 2 0.26 at 10°, PHOTO 1 0.22 at 3°,
   * PHOTO 3 0.23 at 12°), so `0xe8c6b9`'s 0.203 sat under even the unadjusted
   * floor. What it cost is visible rather than theoretical: a red-dominant
   * albedo under a blue ambient loses its green channel fastest, so his shaded
   * forearms rendered **S 0.05–0.07 at hue 320–324** — a grey-mauve, on the one
   * large warm area an all-black rider has. `0xefc4b3` is **S 0.251** at sRGB
   * **17.0°** and linear 14.7°, so the hue moves by less than half a degree in
   * both spaces, the four tans still clear it by five (`coolSkin` by 6.8°), and
   * **Ylin 0.6105 → 0.6109 holds r1's confirmed skin ÷ garment 0.851 to three
   * decimals**. The warm half is refused for the third time on the same
   * reading: the stills run 10–20° bluer than the paint, and a skin hue reading
   * bluer reads *lower* on the circle (r3 §C-5, §E 4a).
   *
   * **His wheel** (§35.5). **`machineSealCyan` is the shell, and this is the
   * one axis where the render is the authority over the photographs.** The
   * stills give sRGB 200–202°, which is `machineWheelInMotionBlue`'s hue
   * exactly and unusable under the 5° rule; the render's 194° lands in the only
   * open slot. Authored at sRGB **194.1°** (linear 205.1): 5.8° from
   * `floWithZoCyan` (188.3°) and 5.9° from `machineWheelInMotionBlue` (200.0°)
   * in sRGB, 10.1° and 7.7° in linear, so it clears both machine cyans in both
   * spaces. **The one neighbour it does not clear is `maribelVisor`**
   * (sRGB 195.1°, linear 201.1°) at 1.0° and 4.0° — there is no hue between
   * `floWithZoCyan` and `wheelInMotionBlue` that clears it, and it is a
   * *rider's visor* rather than a machine accent, three stops brighter
   * (Ylin 0.499 against 0.339) and never seen beside a wheel. Stated here so a
   * critic scoring the arc is not surprised by it. The value is authored a stop
   * deeper than the render's lit `#32ccfd` for `redRiderSuit`'s reason: a
   * saturated primary at the top of the gamut bleaches under ACES in sun.
   * `machineSealPad` is the same hue a stop above the body (Ylin 0.429 against
   * 0.339) — q149's Option A, cyan pads, because the shin-height mass is cyan
   * in all three references and the brief's "what to avoid" names the wrong
   * balance.
   *
   * **`machineSealPink` is the trim, and it is the only pink on the roster
   * that is not Trollina's.** sRGB **331.0°** against her three magentas at
   * 321.6–323.4° — 7.6° to 9.4° clear in sRGB and 9.0° to 10.2° in linear
   * (342.9° against 332.7–334.3°) — which is the margin §35.2 asks for.
   * Cyan stays dominant by area (the references run 0.23–0.44 pink to cyan);
   * the pink is the high-front pad plate, the flank bars, the bumper wedges
   * and the rear shoulders.
   *
   * **`machineSealTrim` is not a colour you will see** — it is the pale base
   * every pink patch is tinted *down* from, and its contract is arithmetic:
   * `tintOver` divides, so the base has to be **greater than or equal to the
   * pink in every channel** or a patch would need a material of its own.
   * `0xe4e6ea` is (228, 230, 234) against the pink's (226, 48, 134), which
   * holds with two counts of headroom on the tightest channel. It is a cool
   * near-white rather than FloWithZo's warm one so that nothing on this wheel
   * reads as his.
   *
   * **No red goes anywhere near the wheel**, and nothing is lost by that: the
   * references put none there, and a machine red collides with
   * `statusCritical` (`tuning.ts:3637-3644`).
   */
  sealGear: 0x464850,
  sealTrouser: 0x464550,
  sealPad: 0x50545f,
  sealPack: 0x3a3d48,
  sealGlove: 0x41424e,
  sealGloveRed: 0x941a2a,
  sealGarment: 0xdadce5,
  sealHelmetRed: 0xda3048,
  sealHelmetWhite: 0xd0d8e3,
  sealHelmetBlack: 0x44444d,
  sealVisor: 0x292f39,
  sealBoot: 0x3d4049,
  sealNeon: 0xe0dd65,
  sealSkin: 0xefc4b3,
  machineSealCyan: 0x14aad8,
  machineSealPad: 0x37bde6,
  machineSealPink: 0xe23086,
  machineSealTrim: 0xe4e6ea,

  /**
   * The ghost, and the checkpoint gates (M10).
   *
   * **Authored here rather than in the render modules that draw them, because
   * both are members of the coupled visual system** (invariant 6, `DESIGN.md`
   * §6). The ghost is a transparent rider standing in the same light as the
   * real one and the gates carry an emissive term, so neither can be picked in
   * isolation — they are judged against the same exposure and tone mapping as
   * the status light and the head and tail lamps above.
   *
   * `ghost` is deliberately *not* a tinted Cool Rider. A translucent copy of
   * the player's own colours reads as a rendering fault — "why is my rider
   * see-through" — where a single cold, unlit-looking body reads as a
   * recording. One colour for the whole ghost also collapses it to one
   * material, which is most of how a second riding rig fits in the draw-call
   * budget at all.
   *
   * The two gate colours are the same hue at two intensities, so a player
   * learns the shape once: `gate` is a checkpoint still ahead, `gatePassed` is
   * one already taken. Never red and green — the pair has to survive the most
   * common colour-vision deficiency, and brightness carries the difference.
   */
  ghost: 0x8fd4ff,
  gate: 0x2f7fe8,
  gatePassed: 0x1a3c66,
  gateFinish: 0xffd23f,
  /**
   * The paddle and the Knockabout targets — M14, and members of the same
   * coupled system for the same reason the gates are.
   *
   * The paddle is one warm colour at two vertex shades: a dark grip and a pale
   * padded face, so the end that matters is the end that reads. It is
   * deliberately unlike the machine and unlike either rider's kit — a weapon
   * the player is aiming has to be findable in the frame at a glance, and both
   * riders wear dark.
   *
   * The targets are **one hue at two brightnesses**, never a hue pair: standing
   * is bright and struck is dim, so the state survives every colour-vision
   * deficiency, and it survives `prefers-reduced-motion` suppressing the
   * knock-down as well. The hue is held well away from `gate` so a target and a
   * checkpoint are never mistaken for one another in a timed route.
   */
  paddle: 0xe86a2f,
  target: 0xf2c14a,
} as const;

/**
 * Contact effects — M5. The two things the ground throws up.
 *
 * **Particle brightness belongs to the coupled visual system** (AGENTS.md
 * invariant 6, `DESIGN.md` §6): these values are authored here and the field
 * itself is owned by `render/Renderer.ts`, alongside the lighting, exposure,
 * tone mapping and haze they are judged against. Changing a colour here is
 * changing that system, and the rule about doing it sequentially applies.
 *
 * Two fields rather than one, because a spark and a dust puff differ in the
 * one property `THREE.PointsMaterial` cannot vary per particle — size. Two
 * `Points` objects cost two draw calls and only when something is alive; the
 * alternative is a custom shader, which is a bigger commitment than the effect
 * is worth at blockout stage.
 *
 * **Deterministic, never random** (`DESIGN.md` §4, rule 3). Every spread below
 * is spent through an integer hash of a spawn counter, so `advance(n)` reaches
 * the same particle field every run and a frozen capture means something.
 */
export const FX = {
  /** Pooled spark particles. A scrape spends about a third of these. */
  sparkCount: 96,
  /** Sparks emitted per second while a pedal is scraping. */
  sparkRatePerSecond: 150,
  sparkLifeSeconds: 0.40,
  /** Ejection speed, m/s, and how wide the cone opens, radians. */
  sparkSpeed: 2.4,
  sparkSpread: 0.55,
  /** Sparks are hot and light; they arc faster than they fall. */
  sparkGravity: 11,
  /**
   * Sprite size, metres.
   *
   * **Sized against the chase camera, not against a real spark.** At the arm's
   * six metres and a 78-degree field of view, a 1000-pixel-wide viewport gives
   * about 80 pixels per metre — so the first pass's 5 cm sparks were four
   * pixels each and were, correctly, invisible in a gameplay-scale capture.
   * Readability outranks realism for blockout FX (`DESIGN.md` §7), and a pedal
   * strike that cannot be seen is not a pedal strike.
   */
  sparkSize: 0.09,
  /** Hot metal against a midday sun. Read the colour note at the top. */
  sparkColour: 0xffd489,
  /**
   * How far above white the spark's linear colour is pushed.
   *
   * Sparks are incandescent, and an unlit sprite at an ordinary albedo simply
   * cannot look hot under ACES against sunlit pavement — the tone curve pulls
   * it toward the same mid-grey as the road. Taking the linear colour above 1
   * is what a bright emitter genuinely is, and ACES maps the excess to a
   * white-hot core with a warm fringe, which is what a spark looks like.
   */
  sparkIntensity: 2.0,
  /**
   * What a spark fades to as it dies: cooling metal, not sky.
   *
   * Dust dissolves into the air and fades toward the horizon colour; a spark
   * cools and goes out, so it needs its own target. Fading one to the other's
   * colour is the sort of detail that reads as "the effect is wrong" without
   * anyone being able to say why.
   */
  sparkFadeColour: 0x3a1204,

  /** Pooled surface particles: what the tyre throws up on a landing. */
  dustCount: 96,
  /** Particles per landing at the full reference impact. */
  dustPerLanding: 22,
  dustLifeSeconds: 0.62,
  dustSpeed: 2.2,
  dustSpread: 0.9,
  dustGravity: 2.2,
  /** Also sized against the chase camera. See `sparkSize`. */
  dustSize: 0.14,
  /**
   * One colour per `ParticleId` that produces anything.
   *
   * `data/surfaces.ts` already declares which particle each surface throws —
   * it has since M4, marked "M5" — so this is only what that id looks like.
   * A surface whose particle is `none` emits nothing at all rather than a
   * colourless puff.
   *
   * **`splash` is M13 Phase 2's, and it is the one that is brighter than what
   * it came off.** Every other id here is loose material lifted from the
   * surface and settling back into it, so §6b fades it toward that surface's
   * own albedo; water is the opposite — it is dark lying flat and bright once
   * it is broken into droplets, which is the entire reason a puddle is visible
   * from a moving vehicle at all. Authored near the sky's own value so it reads
   * against dark asphalt without going incandescent, which is a spark's trick
   * and would be wrong here (`FX.sparkIntensity`).
   */
  particleColours: {
    dust: 0xbfae95,
    grassClipping: 0x6f8f5c,
    grit: 0x9a958c,
    splinter: 0x8a7458,
    splash: 0xc6d3da,
  },
  /**
   * Spray thrown by a wheel crossing standing water — M13 Phase 2.
   *
   * **A rate, like the pedal scrape, and not a burst like a landing**, because
   * a spill is a *place* rather than an impact (`DESIGN.md` §6d): the rider is
   * in it for as long as they are in it, and the spray is what says so. It
   * shares the dust pool rather than opening a third field, so
   * `NON_LEVEL_RESERVE` does not move — and sharing is safe because nothing can
   * land and cross a puddle in the same step at a rate that would starve
   * either: the pool holds 96 and a full second of spray is 34 of them.
   *
   * Scaled by speed against the wheel's top speed, so a rider trickling through
   * a puddle disturbs it and a rider crossing it flat out throws a sheet. The
   * debt accumulator in `render/Renderer.ts` is what lets a rate under one
   * particle per 120 Hz step emit anything at all.
   */
  splashRatePerSecond: 55,
  splashLifeSeconds: 0.38,
  /**
   * Ejection speed, m/s, and the cone's half-angle, radians.
   *
   * **Sized against how high the sheet rises, not against how fast water
   * moves.** Sharing the dust pool means sharing `dustGravity`, so the arc is
   * `speed × life − ½g·life²` — about 0.45 m at these values, which is a wheel
   * throwing water rather than a fountain. A third field with its own gravity
   * is what it would take to do better, and it would cost a draw call and two
   * more of the reserve for a difference nobody would name.
   */
  splashSpeed: 1.8,
  splashSpread: 0.80,
  /** Speed at which the spray reaches full rate, m/s. Around top speed. */
  splashReferenceSpeed: 15,
  /**
   * What spray fades to as it dies: the water it fell back into, not the air.
   *
   * §6b's rule, applied to the one surface whose particle is brighter than its
   * ground — a droplet that faded toward the horizon would get brighter as it
   * died and read as a pale disc, which is exactly the failure that rule was
   * written about the first time.
   */
  splashFadeColour: 0x3e4146,

  /**
   * The machine's status light (M6). Geometry, brightness, and pulse.
   *
   * Mounted on the top rear face of the shell, angled back and up, because the
   * chase camera is behind the rider essentially all the time — the same
   * reasoning that put Cool Rider's largest blue panel on their back
   * (`render/rider.ts`). Its four colours live in `BLOCKOUT_COLOURS` beside the
   * head and tail lights, which is where the coupled visual system's emissive
   * values are authored.
   *
   * **The pulse is stepped, never wall-clock.** It advances inside the fixed
   * step exactly as the particles do, so `advance(n)` reaches the same phase
   * every run and a frozen capture of an amber wheel means something.
   */
  statusLightWidth: 0.10,
  statusLightHeight: 0.028,
  statusLightDepth: 0.012,
  /** Emissive intensity at the two ends of the ladder. */
  statusCalmIntensity: 0.55,
  statusAlarmIntensity: 2.6,
  /** Pulse rate at the notice rung and at the critical one, Hz. */
  statusNoticeHz: 1.6,
  statusCriticalHz: 6.0,
  /** How deep the pulse cuts, as a fraction of the intensity. */
  statusPulseDepth: 0.55,
  /**
   * The power-on flare after a crash recovery.
   *
   * The recovery chirp was silenced by owner decision (2026-08-04 — see
   * `AUDIO.recoverLevel`), and this is where the "wheel is back on" moment
   * went instead: for the recovery blend's half second the status light
   * flares cool white and decays into whatever the ladder says, which is
   * what a real wheel's LEDs do at boot. Bright on purpose — it carries the
   * message alone now — and brief by construction, because it rides
   * `recoverBlend` rather than a timer of its own.
   */
  statusBootIntensity: 5.0,
  statusBootColour: 0xcfe9ff,
} as const;

/**
 * How one tyre voice sounds. Keyed by the `tyreAudio` id in `data/surfaces.ts`.
 *
 * A surface's sound is two filtered noise layers, not one: a band that carries
 * the *texture* — the hiss of pavement, the crunch of gravel, the hollow ring
 * of planking — and a low layer that carries the *body*, which is what tells a
 * loaded tyre on soft ground from a light one on hard ground. One band alone
 * gives seven surfaces that differ only in brightness, and brightness is the
 * one axis a laptop speaker flattens.
 */
export interface TyreVoice {
  /** Bandpass centre of the texture layer, Hz. The voice's identity. */
  readonly centreHz: number;
  /** Its Q. Low is broadband hiss; high is a resonance with a pitch to it. */
  readonly q: number;
  /** Relative loudness, against `AUDIO.tyreLevel`. Gravel is the reference 1. */
  readonly level: number;
  /** Lowpass cutoff of the body layer, Hz. */
  readonly lowHz: number;
  /** How much body, as a fraction of the texture layer. */
  readonly lowLevel: number;
  /**
   * How hard suspension activity modulates the voice, 0..1.
   *
   * The surface table already says how rough a surface is, and the suspension
   * is already answering it — so the tyre gets louder exactly when the wheel is
   * actually working, rather than at a rate invented here. It is what makes a
   * gravel spur *sound* like it feels, and it is the reason pavement stays
   * silent over its own tiny 4 mm texture instead of pulsing.
   */
  readonly grain: number;
  /**
   * How much of this voice is carried by the recorded offroad loop, 0..1.
   *
   * 1 replaces the noise-and-filters voice with the owner-approved recording
   * (`assets/live/audio/tyre_offroad_loop.wav`); 0 is pure synthesis. The
   * slot's crossfade, speed envelope, and grain apply identically either way,
   * so a dirt-to-pavement boundary is still one equal-power fade.
   */
  readonly sample: number;
  /**
   * Playback-rate trim on the recorded loop, so two sampled surfaces read as
   * two surfaces rather than the same recording twice. Meaningless when
   * `sample` is 0.
   */
  readonly sampleRate: number;
  /**
   * How much of this voice is carried by the toko rotation loop, 0..1
   * (`assets/live/audio/tyre_solid_loop.wav` — the owner's pick from the
   * tyre-rotation audition, 2026-08-04: "the D sound is the only useable one
   * (but if made very faint subtle)"). This is the "tokotokotok" a solid
   * surface makes instead of "shhhhhh": alternating low taps at the wheel's
   * own revolution rate, synthesized by `tools/make-toko.mjs`. Shares one
   * slot budget with `sample` — a voice's `1 - sample - toko` remainder is
   * what the noise-and-filters path still carries.
   */
  readonly toko: number;
}

/**
 * Quiet district texture before the existing SFX/master buses.
 *
 * Five broad noise bands share one fixed graph. World descriptors are capped
 * at twelve, and coincident emitters cannot exceed the 0.025 aggregate linear
 * gain. These levels are technical bounds; owner listening remains a gate.
 */
export const ENVIRONMENT_AMBIENCE = {
  /** Twelve established premises plus sixteen selected outdoor activity sources.
   * The five fixed graph branches and maximumTotalGain remain unchanged. */
  maximumEmitters: 28,
  maximumTotalGain: 0.025,
  /** Distance envelope and priority responses, seconds. */
  proximityResponseSeconds: 0.35,
  duckAttackSeconds: 0.035,
  duckReleaseSeconds: 0.65,
  /** Retained fraction at full warning/siren priority. */
  warningFloor: 0.20,
  sirenFloor: 0.45,
  /** Gain glide on the existing audio clock, seconds. */
  parameterGlideSeconds: 0.018,
  /** Actual warning cues retain priority through this additional decay, s. */
  warningTailSeconds: 0.08,
  /** Bound even a malformed or unusually delayed warning cue, seconds. */
  maximumWarningHoldSeconds: 0.5,
  /** Independent deterministic noise stream; never advances a world stream. */
  noiseSeed: 0x7a11bc41,
  /** Peak linear gains, distances in metres, filter frequencies in hertz. */
  voices: {
    cafe: { peakGain: 0.011, nearMetres: 3, farMetres: 22, filterType: 'bandpass', filterHz: 480, filterQ: 0.55 },
    workshop: { peakGain: 0.009, nearMetres: 3, farMetres: 20, filterType: 'bandpass', filterHz: 210, filterQ: 0.65 },
    park: { peakGain: 0.006, nearMetres: 8, farMetres: 32, filterType: 'lowpass', filterHz: 800, filterQ: 0.5 },
    home: { peakGain: 0.004, nearMetres: 3, farMetres: 14, filterType: 'bandpass', filterHz: 320, filterQ: 0.45 },
    industrial: { peakGain: 0.010, nearMetres: 5, farMetres: 30, filterType: 'bandpass', filterHz: 135, filterQ: 0.65 },
  },
} as const;

/** Quiet outdoor beds on the existing ambience graph; no extra AudioNodes. */
export const POPULATION_AMBIENCE = Object.freeze({
  maximumEmitters: 16,
  /** Source origin above physical foot/tyre ground, metres. */
  sourceHeightMetres: 0.85,
  /** Vehicle bed reaches its full authored strength at this speed, m/s. */
  vehicleFullSpeedMetresPerSecond: 5,
  vehicleIdleStrength: 0.08,
  vehicleMovingStrength: 0.40,
  humanStandingStrength: 0.12,
  humanMovingStrength: 0.22,
  workerStrength: 0.30,
  socialStrength: 0.30,
});

/**
 * Audio (M8).
 *
 * **Hybrid since the third pass (2026-08-04): recorded loops for texture,
 * synthesis for everything parametric.** The offroad tyre, the wind, and the
 * crash are the owner's approved sample loops (`assets/live/audio/`,
 * provenance in NOTICE.md); the warning ladder, transient thumps, and the
 * solid-surface tyre hiss remain synthesized, because they are either
 * parametric or too quiet to be worth a download. The synthesized motor stack
 * below still exists but is **silenced by design** — see the fifth rule.
 *
 * **Levels are linear amplitudes before the bus, not decibels.** They are
 * summed by `audio/director.ts` and trimmed by `bedTrim`, which is set so that
 * a full-throttle wheel on gravel with the wind up still leaves room for a
 * tilt-back warning and a landing on top of it. The limiter below is a safety
 * net for the case nobody predicted, never a part of the sound: if it is
 * working audibly, the levels are wrong.
 *
 * **The exit question has two halves.** "Does the wheel sound alive" is
 * synthesis — the harmonic stack below, the load tracking, the low hum a real
 * EUC makes while you stand on it holding still. "Is the right thing the
 * loudest thing" is *mixing*, and it is answered by the duck depths at the
 * bottom of this group rather than by making warnings louder. A warning turned
 * up until it beats a full-throttle motor is a warning that hurts when the
 * wheel is quiet; a warning that ducks the motor is exactly as loud as it needs
 * to be at every speed.
 *
 * ---
 *
 * **ARCADE, NOT SIMULATION — and no sound here may be annoying.** Stated by the
 * owner on 2026-08-03, and it outranks authenticity everywhere the two
 * disagree. The vision says the same thing about the whole game (§2): real EUC
 * behaviour *inspires*; fun decides. Four concrete rules follow. Each of them
 * has already overruled something a real wheel does, and rules 1 and 4 were
 * written after the owner rode the first pass and did not like what he heard:
 *
 *   1. **The motor is an electric machine, so it may not be synthesised like a
 *      combustion one.** The first pass used two sawtooths a few cents apart
 *      over a sub-octave with a 7 Hz tremolo. Every one of those is a standard
 *      ingredient of an engine patch — detuning is how you get cylinders out of
 *      phase, a modulated sub-octave is how you get a stroke — and together at
 *      a 143 Hz fundamental they read as a two-stroke, which is exactly what
 *      the owner heard. What replaced it is a stack of *exact* harmonics with
 *      no detuning and no modulation anywhere, brightened by a filter under
 *      load. Nothing here may beat, chorus, or pulse.
 *   2. **No isolated sustained tone above about 1.5 kHz.** A real EUC's PWM
 *      carrier sings at 8–16 kHz. The first pass had it at 7.8 kHz measuring
 *      66 dB clear of its neighbours, then at 1.9 kHz — and it is now gone
 *      entirely, because a fixed-pitch pure tone that plays whenever the player
 *      stops is the single most fatiguing shape a sustained sound can have at
 *      any level. A parked wheel is a soft low hum and nothing else.
 *   3. **A warning wins by ducking, never by hurting.** Real tilt-back alarms
 *      run at 90–95 dB deliberately. Here the top rung is a rounded tone at a
 *      moderate level over a bed pushed halfway down — the same message, and
 *      it can sound for a whole climb without becoming a reason to stop
 *      playing.
 *   4. **Nothing sustained is amplitude-modulated at all.** Modulation near
 *      100 Hz is a wasp, and the tyre is the one voice that plays continuously
 *      for minutes at a time. The tread pattern was authentic, audible, and the
 *      second thing the owner disliked; there is no LFO left in the ride bed.
 *   5. **Near-silence over solid surfaces — the motor makes no sound.** The
 *      owner, a real rider, after reviewing years of his own ride footage
 *      (2026-08-04): a real EUC over solid terrain is *nearly silent*; the
 *      only authentic sounds are a faint tyre note and the very ear-ring rule
 *      2 outlaws. Both synthesized passes failed not in timbre but in
 *      existing — any audible motor bed is more sound than the machine makes.
 *      So the motor levels below default to zero (the stack is kept, and F4
 *      can raise it, so the decision is reversible by ear), solid surfaces
 *      carry only a faint tyre bed, offroad carries a real recording, speed is
 *      told by wind, and danger by the warning ladder and the crash.
 *
 * A player should be able to ride for an hour. That is the test every value
 * below is set against, and it is a test the first pass failed.
 */
export const AUDIO = {
  // -- Mix and headroom -----------------------------------------------------

  /**
   * Static trim on the ride bed — motor, wind, tyre, scrape.
   *
   * Set from the honest worst case rather than by ear: the loudest steady
   * combination the game can produce (full load, top speed, gravel) sums to
   * about 0.91 in power, and 0.55 puts that at 0.50 — half of full scale, one
   * bit of headroom, with the other half left for transients and warnings.
   */
  bedTrim: 0.55,
  /** Trim on one-shots, applied after their own per-cue level. */
  transientTrim: 0.85,
  /**
   * Safety limiter. Threshold in dBFS, then a hard-ish ratio.
   *
   * Deliberately above where the mix normally sits, so ordinary riding never
   * touches it. Its whole job is the pile-up nobody predicted — a crash on a
   * curb during tilt-back — clipping instead of distorting.
   */
  limiterThresholdDb: -6,
  limiterKneeDb: 6,
  limiterRatio: 12,
  limiterAttackSeconds: 0.004,
  limiterReleaseSeconds: 0.18,
  /**
   * Time constant used when writing a continuous parameter to the graph.
   *
   * Web Audio's `setTargetAtTime` runs at audio rate, so this is what makes a
   * value that only updates on the render frame arrive as a glide rather than
   * as a staircase of clicks. Roughly one render frame at 60 Hz, so parameters
   * never lag perceptibly behind the picture.
   */
  paramGlideSeconds: 0.018,
  /**
   * Longest step the audio model is ever advanced by, seconds.
   *
   * A drawn frame normally carries at most `SIMULATION.maxStepsPerFrame`
   * steps — 42 ms — so in play this changes nothing. It exists because the QA
   * bridge's `advance(240)` runs two seconds of simulation and then *one*
   * render, and an audio model handed a two-second step would decrement its
   * beep timer once and emit one beep where a real two seconds emits eight.
   * Chunking makes what the game sounds like independent of how the caller
   * batched its steps, which is the same property the fixed step gives the
   * simulation and for the same reason.
   */
  modelStepSeconds: 1 / 60,
  /**
   * Reference speed for every "how fast are we going" curve, m/s.
   *
   * The wheel's approximate flat-pavement top speed. Curves saturate above it
   * rather than continuing, so a steep descent cannot drive the wind or the
   * whine past what has been listened to.
   *
   * **Moved with the top speed at M16** (from 15.0). It is a saturation point,
   * so leaving it behind would have made every sound in the game identical
   * from 34 mph to 50 — the wind at its ceiling, the tyre at its ceiling, and
   * the last third of the new speed range silent about being the last third.
   * The rotation loop's rate is derived from this and `tyreReferenceSpeed`, so
   * a wheel at top speed now taps 2.48 times per revolution-at-9-m/s rather
   * than 1.67, which is simply what a wheel spinning that much faster does.
   *
   * **Moved again at M30 Phase 4** to the shipped 65 mph wheel's terminal
   * 29.0576 m/s, for the identical reason: left at 22.3 the wind, the tyre and
   * the whine would all sit at their ceilings from 50 mph upward and the last
   * quarter of the speed range would say nothing about being the last quarter.
   * The rotation loop taps faster again, which is what a wheel spinning that
   * much faster does.
   */
  speedReference: 29.0576,

  // -- Motor ----------------------------------------------------------------

  /**
   * Pole pairs of the hub motor.
   *
   * The one number that decides whether the wheel sounds like an EUC or like a
   * petrol engine. A BLDC hub motor's audible fundamental is the *electrical*
   * one — rotational frequency times pole pairs — not the rotational frequency
   * itself. At 15 pole pairs and a 0.5 m tyre, top speed lands the fundamental
   * near 143 Hz, which is where a real wheel sits. Drop this to 1 and the same
   * code produces a 9.5 Hz flutter, which is the sound of getting this wrong.
   */
  motorPolePairs: 15,
  /**
   * Floor under the fundamental, Hz.
   *
   * A stopped wheel is not a silent wheel — a balancing EUC holds you up, and
   * that low hum is most of what "alive" means when nothing is moving. Below
   * this the pitch stops falling and only the level drops.
   *
   * **Deliberately below hearing rather than at the bottom of it.** The floor
   * is also a dead zone: while the wheel is slower than it, pitch says nothing,
   * and at 15 pole pairs on this tyre a 48 Hz floor freezes the motor for
   * everything under 5 m/s, which is a great deal of ordinary riding. At 22 Hz
   * the dead zone ends by walking pace. What the player actually hears when
   * parked is the third harmonic — see `motorSingIdleShare` — which puts the
   * parked hum at a comfortable 66 Hz without costing the pitch its low end.
   */
  motorIdleHz: 22,
  /** Ceiling, Hz. A descent past the reference speed stops rising in pitch. */
  motorMaxHz: 240,

  /**
   * The two upper partials, as **exact** integer harmonics of the fundamental.
   *
   * Exactness is the entire point, and it is what separates this from the
   * first pass. Two oscillators a few cents apart beat, and beating at a low
   * fundamental is how an engine patch is built — it is the sound of pistons
   * out of phase. Two oscillators at an exact 1:3:6 fuse instead: the ear
   * hears one brighter *timbre* rather than three voices, because that is what
   * a harmonic series is. Nothing in the motor is detuned by any amount.
   *
   * 3 and 6 are an octave apart, so they also agree with each other. At the
   * reference speed the stack lands at roughly 143 / 429 / 858 Hz, which is a
   * spectral sweep from a hum you feel to a turbine you hear as the wheel
   * winds up — the "electric machine" read, from three sine-ish partials and
   * no noise at all.
   */
  motorSingHarmonic: 3,
  motorAirHarmonic: 6,

  /**
   * **All four motor levels default to zero — rule 5.** The wheel is electric
   * and the real one is nearly silent; the owner asked for that silence after
   * two synthesized motors failed by ear. The stack, the filter, the load
   * brightening, and the regen sweep are all still computed and still wired,
   * so raising these on F4 brings the whole M8-rework motor back exactly as
   * it was measured — the decision is one slider deep, not one rewrite deep.
   */
  motorIdleLevel: 0.0,
  /** Gain the fundamental adds at full load. Zero: rule 5. */
  motorLoadLevel: 0.0,
  /** Gain of the third harmonic at the reference speed, and its curve. */
  motorSingLevel: 0.0,
  /**
   * Below one, so the third harmonic arrives *early* — most of it is present
   * by half speed. It is the body of the motor sound; without it a wheel at
   * town speed is a bare sine and reads as a fridge rather than a machine.
   */
  motorSingCurve: 0.7,
  /**
   * How much of the third harmonic is present at a standstill.
   *
   * **This is the parked sound of the game**, and it is the whole replacement
   * for the deleted PWM carrier. The fundamental at rest is 66 Hz below where
   * a laptop speaker starts working, so without this a parked wheel would be
   * silent — which reads as switched off, not as balancing. The third harmonic
   * is at 66 Hz when stopped: audible on anything, felt rather than piercing,
   * and about as far from a dog whistle as a sound can get.
   */
  motorSingIdleShare: 0.55,
  /** Gain of the sixth harmonic at the reference speed, and its curve. */
  motorAirLevel: 0.0,
  /**
   * Above one, so the sixth arrives *late*. This is the top of the turbine and
   * the only thing in the bed that says "this is fast" rather than "this is
   * moving", so it has to be scarce at the speeds the player spends most of
   * their time at or it says nothing at all.
   */
  motorAirCurve: 1.6,

  /**
   * The motor's lowpass: **this is where load is heard**, not in a tremolo.
   *
   * A harder-working electric motor does not chug, it brightens — the current
   * is higher, the harmonics come up, and the whole voice opens. So load moves
   * the cutoff rather than adding a modulated sub-octave, which is what the
   * first pass did and what made it sound like a lawnmower. Speed sets the
   * base cutoff so the upper partials are only allowed through once they exist
   * to be heard; `motorLoadBrighten` is the multiplier at full load.
   */
  motorCutoffAtRest: 220,
  motorCutoffAtSpeed: 1500,
  motorLoadBrighten: 2.2,
  /** Resting Q. Gentle — a shaping filter, not a resonance. */
  motorFilterQ: 0.7,
  /** Time constant for the motor's gain and pitch chasing the ride. */
  motorResponseSeconds: 0.07,

  /**
   * Free spin: an unloaded wheel in the air runs away from its rider.
   *
   * The reference's §8 — lift a wheel and it sweeps up to its free-spin limit
   * in a fifth of a second. A real EUC's lift sensor cuts power before that
   * gets far; the game's hops are short, so this is deliberately a fraction of
   * the real effect. The pitch lifts, the drive unloads, and the landing thump
   * resolves it — which turns a hop from a gap in the mix into an event with a
   * shape.
   */
  airSpinFactor: 1.28,
  airDriveFactor: 0.45,

  /**
   * Regenerative braking: a *descending resonant sweep*, not an added interval.
   *
   * On a real wheel, braking hard is audibly a different event from
   * accelerating hard — the motor sings rather than growls, and the song falls
   * as the wheel slows. The first pass wrote that as a triangle a fifth above
   * the fundamental, which is a musical interval sitting on top of a harmonic
   * stack: a dissonance against the third harmonic, and one more voice in a
   * mix that already had too many.
   *
   * Now it is the filter's own job. Braking pulls the cutoff down toward the
   * partials and lifts Q into a resonant peak, so the motor's existing
   * harmonics are swept through a formant that falls with the wheel — which is
   * both what regen actually sounds like and one node's worth of work. The
   * extra partial that remains is at the *octave*, which fuses.
   */
  regenHarmonic: 2,
  regenLevel: 0.0,
  /** Filter Q under full braking, and how far braking pulls the cutoff down. */
  regenResonance: 3.0,
  regenCutoffFactor: 0.45,
  regenResponseSeconds: 0.10,

  // -- Wind -----------------------------------------------------------------

  /**
   * Below this speed there is no wind at all, m/s.
   *
   * **Raised from 3.2 after the owner rode the third pass**: "the wind still
   * a bit loud and playing too soon; should be more like at the top end of
   * the speed". The wheel tops out at `speedReference`, so onset at 9 makes
   * wind a top-half sound: silence below 9, a suggestion around 13, and the
   * full howl only where the ride is actually committed. Left at 9 when M16
   * raised the top speed, which widened the ramp rather than moving it —
   * exactly the "more like at the top end" the owner asked for.
   */
  windOnsetSpeed: 9.0,
  /**
   * **The wind is now the owner's approved howl loop** (freesound #117611,
   * CC0), played through the same bandpass sweep — pink noise remains only as
   * the fallback while the sample decodes. With the motor silent, wind is the
   * whole speed voice, and the level is set low on the owner's explicit
   * instruction when he approved the sample: "not too loud or it will be
   * annoying". He then called 0.22 "still a bit loud" on the ride, hence
   * this. Turning it up needs his ear, not a better argument.
   */
  windLevel: 0.17,
  /**
   * Curve of wind gain against speed.
   *
   * Above one, so wind stays out of the way at town speeds and arrives late
   * and hard. Real aerodynamic noise grows faster than linearly with speed;
   * more to the point, a linear ramp makes every speed sound like the same
   * amount of committed, and the whole job of the wind layer is to make top
   * speed feel different from 8 m/s. The ramp runs over the 9–29.1 m/s window
   * since M30 Phase 4 (9–22.3 before it; see `windOnsetSpeed`), so the
   * exponent shapes the upper two thirds of the speedometer rather than the
   * whole thing — the widening the owner asked for at 50, taken further.
   */
  windExponent: 1.7,
  /**
   * Centre of the wind band at rest and at the reference speed, Hz, and a Q
   * low enough that "band" means a broad hump rather than a filter.
   *
   * **Brought down from 2800 Hz, which was a hiss.** Wind heard from inside a
   * helmet is a low, broad rush; a band centred near 3 kHz is instead a
   * continuous sibilant that sits in the ear's most sensitive octave for the
   * entire time the player is going fast, which is most of the game. A hump at
   * 1200 Hz with a Q of 0.4 still masks the motor's top partial — which is the
   * job wind does in a real ride — without living up there.
   */
  windCutoffAtRest: 240,
  windCutoffAtSpeed: 1200,
  windQ: 0.40,
  windResponseSeconds: 0.22,
  /**
   * Multiplier while airborne.
   *
   * The tyre goes silent in the air and the motor unloads, so without this a
   * hop is a hole in the mix. It is also true: off the ground, wind is all
   * there is.
   */
  windAirBoost: 1.30,

  // -- Tyre -----------------------------------------------------------------

  /** Master level for the tyre bed, before the per-voice `level`. */
  tyreLevel: 0.44,
  /** Speed at which a voice reaches its stated level, m/s. */
  tyreReferenceSpeed: 9.0,
  /** Level retained at a standstill — a stopped tyre makes no noise. */
  tyreStandstillLevel: 0.0,
  /**
   * Equal-power crossfade time on a surface change, seconds.
   *
   * Short enough that a kerb reads as an edge, long enough that the boundary
   * between two heightfield cells is not a click. The slice crosses surfaces
   * constantly, so this is heard far more often than any transient here.
   */
  tyreCrossfadeSeconds: 0.20,
  /**
   * How much the texture band brightens between rest and the reference speed.
   *
   * Modest on purpose: this is a multiplier on a band that plays for the whole
   * ride, so it decides the highest frequency the player is continuously
   * exposed to. Enough that a fast pass over pavement does not sound like a
   * slow one played louder, and no more.
   */
  tyreCutoffRise: 1.25,
  /** How much suspension activity a voice's `grain` of 1 turns into gain. */
  tyreGrainGain: 0.85,
  /** Suspension speed that counts as full grain excitation, m/s. */
  tyreGrainReference: 0.35,
  tyreResponseSeconds: 0.05,
  //
  // **There is deliberately no tread modulation here, and this is rule 4.**
  // The first pass gave every voice a tread depth and swung its gain at the
  // wheel's own rotation times a block count — authentic, audible, and a wasp:
  // amplitude modulation between roughly 20 and 130 Hz, on the one voice that
  // plays continuously for minutes at a time. It was the second thing the
  // owner named after riding it. What tells the player the wheel is *rotating*
  // is now the motor's pitch, which is locked to the same rotation and cannot
  // buzz, and the grain term above, which is driven by the suspension and so
  // only speaks when the ground actually does something.

  /**
   * One voice per `tyreAudio` id in `data/surfaces.ts`.
   *
   * A colocated test asserts every surface's id resolves here, so a surface
   * added later without a voice fails at `node --test` rather than rolling
   * silently in play — the same guarantee the surface table already gives for
   * particles and grip.
   */
  tyreVoices: {
    // **The centres are ordered by feature size, not by taste.** A tyre band
    // sits where the surface's grain does: the bigger the feature the tyre is
    // crossing, the lower the band. That ordering is what makes planking the
    // lowest voice and fine tarmac the highest, and it also puts real spacing
    // between neighbours — a colocated test requires each step to be at least
    // a quarter of an octave, because two voices a hundred Hz apart pass a
    // structural check and sound identical to the player.
    //
    // **The whole table was moved down about three-quarters of an octave after
    // the owner rode the first pass.** The ordering and the spacing are the
    // same; what changed is where the ladder starts. Pavement was at 3100 Hz,
    // which is the ear's most sensitive octave, and pavement is the surface
    // the slice is mostly made of — so the loudest continuous voice in the
    // game sat exactly where a continuous sound is hardest to tolerate. Road
    // noise heard from a wheel under your feet is not a sibilant hiss anyway;
    // it is a rush with weight to it, which is what these values give.
    //
    // **Solid-surface levels were cut to about a third at the third pass** —
    // rule 5. These are the "faint tyre rotation sound" the owner named as the
    // only thing a solid surface should make. The centres, Qs, and ordering
    // are unchanged; only how much of it there is.
    //
    // Pavement: mostly the toko rotation loop with a whisper of hiss left
    // under it — the owner heard the pure hiss and named the fix: solid
    // ground should go "tokotokotokotok not shhhhhh". The pavements carry
    // the biggest toko share because they are where the rotation is all
    // there is to hear.
    'tyre-smooth': {
      centreHz: 1750, q: 0.60, level: 0.15, lowHz: 180, lowLevel: 0.16, grain: 0.10,
      sample: 0, sampleRate: 1, toko: 0.55,
    },
    // Gravel: **the owner-approved offroad recording**, played a shade fast so
    // it reads looser and brighter than dirt. Offroad is where a real wheel
    // actually makes noise, so these two stay the loudest surfaces in the game
    // — the contrast against the faint solid surfaces is the point, and it is
    // real: his own footage review found exactly this split.
    //
    // **Cut from 1.00 at the fourth pass — rule 6 — after the owner rode the
    // gravel spur and called the terrain sound way too loud.** Rule 5 cut the
    // solid surfaces to a third and deliberately left these two at their
    // pre-rule-5 levels, and the arithmetic of that decision was never checked
    // afterwards. In the effective domain below, gravel came out 23.5 dB over
    // pavement and dirt 16.8, while every other voice in the table lived inside
    // one 8 dB band — so crossing onto a shoulder was not a contrast, it was a
    // cliff, and a bed that plays continuously for minutes is the last place
    // one belongs. These put gravel about 9 dB over pavement and dirt about 6:
    // still, by a clear margin, the loudest thing the ground can say.
    'tyre-gravel': {
      centreHz: 1380, q: 0.35, level: 0.19, lowHz: 260, lowLevel: 0.42, grain: 1.00,
      sample: 1, sampleRate: 1.12, toko: 0,
    },
    // Rough pavement: coarse aggregate. Recognisably the same family as
    // pavement — lower, wider, with real body under it — which is the point.
    'tyre-coarse': {
      centreHz: 1080, q: 0.50, level: 0.26, lowHz: 240, lowLevel: 0.34, grain: 0.45,
      sample: 0, sampleRate: 1, toko: 0.45,
    },
    // Brick: a laid surface, so it has a module and therefore a pitch. The
    // higher Q is what makes the plaza sound like slabs rather than like road.
    // A smaller toko share, because the slab joints already give brick its
    // own periodicity and two rhythms at once is a limp.
    'tyre-brick': {
      centreHz: 850, q: 1.10, level: 0.21, lowHz: 220, lowLevel: 0.30, grain: 0.35,
      sample: 0, sampleRate: 1, toko: 0.35,
    },
    // Grass: broad, soft — a swish rather than a hiss. Soft ground rather than
    // solid, so it keeps more level than the pavements, but it is not the
    // crunch the recording carries; the low Q swish stays synthesized.
    // Cut from 0.45 to 0.28 after the owner's first ride, then to 0.13 after
    // the Safari follow-up and an analyser comparison against same-speed
    // pavement: changing white noise to pink fixed the hiss colour, but the
    // grass bed still metered more than twice as loud. No toko: soft ground
    // swallows the taps in life, and the swish is already not a hiss.
    'tyre-grass': {
      centreHz: 640, q: 0.40, level: 0.13, lowHz: 140, lowLevel: 0.32, grain: 0.50,
      sample: 0, sampleRate: 1, toko: 0,
    },
    // Dirt: **the owner-approved offroad recording at its native rate** —
    // it *is* a dirt trail, which is why he approved it. Cut from 0.66 with
    // grass (first ride note), then from 0.46 with gravel (fourth pass, above).
    // The loose-surface ladder still reads gravel > dirt > grass, which is the
    // part of rule 5 that was worth keeping.
    'tyre-dirt': {
      centreHz: 490, q: 0.50, level: 0.13, lowHz: 200, lowLevel: 0.36, grain: 0.55,
      sample: 1, sampleRate: 1, toko: 0,
    },
    // Wood: the one hollow surface. High Q on a low band is a resonant box,
    // which is what a plank deck over air is, and it is the most immediately
    // identifiable voice here — the bridge announces itself. Kept a little
    // above the other solids because identifying it is a gameplay read.
    // No toko for the same reason as brick, doubled: the knock *is* wood's
    // rhythm, and it must stay unmistakable.
    'tyre-wood': {
      centreHz: 330, q: 2.40, level: 0.30, lowHz: 130, lowLevel: 0.48, grain: 0.75,
      sample: 0, sampleRate: 1, toko: 0,
    },
    // Spill: standing water, and **the lowest voice in the game** — which is a
    // physical claim before it is a mixing one. The reflex is a wet-motorway
    // hiss, but that is a car tyre at 30 m/s throwing a sheet sideways; a 20 cm
    // wheel at 15 m/s displaces a slug of water and the sound is the
    // displacement, low and broad, not the spray.
    //
    // It is also the only slot the table had left. The two tests above are a
    // 1.25 separation floor and a `centreHz * tyreCutoffRise < 2400` ceiling,
    // and between them the seven existing centres leave exactly one gap: below
    // 330 / 1.25 = 264 Hz. Above pavement is walled off by the ceiling and the
    // 330–490 gap is too narrow to split. That the honest sound and the only
    // free slot are the same place is luck, and it is recorded here so a
    // future eighth surface knows the table is now full.
    //
    // Broad where wood is narrow — a low Q against wood's 2.40 — so the two
    // nearest neighbours in the table are still nothing like each other: a
    // plank deck is a resonant box and a puddle is a dull surge. Full grain and
    // the heaviest low shelf here, no toko: water swallows the rotation taps
    // completely, which is itself the tell that you have left solid ground.
    'tyre-spill': {
      centreHz: 250, q: 0.30, level: 0.24, lowHz: 110, lowLevel: 0.55, grain: 0.85,
      sample: 0, sampleRate: 1, toko: 0,
    },
  } as Readonly<Record<string, TyreVoice>>,

  /**
   * Playback rate of the offroad recording between rest and the reference
   * speed, multiplied by the voice's own `sampleRate`.
   *
   * The recording is one bike at one speed; this is the one degree of freedom
   * that lets it track the ride. Kept well inside ±15% — pitch-shifting a
   * recording much further than that is audibly a tape effect, which is the
   * classic failure of sample-based vehicle audio.
   */
  tyreSampleRateAtRest: 0.94,
  tyreSampleRateAtSpeed: 1.10,
  /**
   * Loudness-domain bridges between the recordings and the synthesis they sit
   * beside. The voice levels above were all calibrated against the synth
   * noise buffers (white RMS −4.8 dBFS, pink −13.0); the recorded loops are
   * RMS-matched to −20 dBFS by `tools/make-loop.mjs` — the offroad loop only
   * reaches −26.4, its peak ceiling — so without these trims a sampled voice
   * meters right in the model and sounds a tenth as loud as its level says.
   * Set from measurement (the first wiring shipped exactly that bug: gravel,
   * the loudest voice in the table, was inaudible under the faint pavement
   * hiss). These are asset compensation, not mix decisions: retune the mix
   * through `tyreLevel`/`windLevel`, and re-derive these only when an asset
   * is re-cut to a different RMS.
   */
  tyreSampleTrim: 3.0,
  windSampleTrim: 2.3,
  /**
   * Same loudness-domain bridge for the toko rotation loop. Smaller than the
   * offroad trim on purpose twice over: the loop is RMS-matched at a full
   * −20 dBFS (no peak-ceiling shortfall to make up), and the owner's approval
   * came with its own level instruction — "very faint subtle" — so this is
   * set for *presence*, not parity with the hiss it replaces.
   */
  tokoSampleTrim: 1.6,

  // -- Pedal scrape ---------------------------------------------------------

  /**
   * The scrape is a *voice*, not a transient, because the strike is continuous.
   *
   * `EucSnapshot.pedalStrike` is a signed overlap that lasts as long as the
   * lean does, and M5 already draws a continuous spark stream off it. A
   * one-shot here would fire once at the start of a long carve and then say
   * nothing while the pedal is still on the ground.
   */
  // Adversarial QA after the owner's Safari ride found the prior "quieter"
  // version still put a 2.0 kHz peak 11 dB above the rest of the full-speed
  // mix. A hard carve may announce its limit; it may not become the loudest
  // sustained thing in the game. The onset remains owner-approved simulation
  // tuning, while this voice is now one restrained mid-band rasp.
  scrapeLevel: 0.10,
  scrapeCentreHz: 1100,
  scrapeQ: 3.0,
  /**
   * Overlap, radians, at which the scrape reaches full level.
   *
   * Rescaled with `EUC.pedalStrikeGraceAngle`: the deepest overlap the
   * lateral ceiling can now produce is ≈ 0.037 rad, so 0.09 would have left
   * even a full-lock carve at 40% of its own voice. 0.04 puts full lock near
   * full expression again — of the much quieter `scrapeLevel` above.
   */
  scrapeFullOverlap: 0.04,
  /** Speed at which a scrape reaches full level, m/s. A parked lean is silent. */
  scrapeReferenceSpeed: 6.0,
  scrapeResponseSeconds: 0.03,
  /** One low ring under the rasp: metal identity without a beating pair. */
  scrapeRingLevel: 0.08,
  scrapeRingHz: 880,

  // -- The siren (M18) ------------------------------------------------------

  /**
   * Master level of the cop's siren at point-blank range.
   *
   * The siren is a *threat radar the player hears*: its level follows the
   * cop's range, so knowing how close he is never requires looking back. Two
   * CC0 recordings (owner-auditioned A/B/C/D, 2026-08-13) crossfade by range —
   * the far wail carries the chase, the close wail carries the panic — and the
   * whole voice lives on the ride bed, so pause, ducking, and the crash duck
   * all treat it as part of the ride. Both loops are RMS-matched to −20 dBFS
   * by `tools/make-loop.mjs`, so this level is the mix decision and there is
   * no asset trim to bridge.
   *
   * Subject to the standing rule that nothing may be annoying: if the owner's
   * ride finds the loop wearing, the fallback design is burst-only
   * punctuation, not a louder or softer loop.
   */
  sirenLevel: 0.4,
  /** Range at which the siren becomes audible at all, metres. */
  sirenFarMetres: 60,
  /**
   * Range at which it reaches full level, metres — swing range, roughly: by
   * the time he can hit you, the siren has nothing left to add.
   */
  sirenNearMetres: 8,
  /**
   * Curve on the range-to-level map. Above 1 pushes the loudness toward close
   * range, which reads as distance the way real 1/r falloff does — linear
   * makes a cop 50 m back sound nearly on top of you.
   */
  sirenDistanceCurve: 1.5,
  /**
   * The A⇄D crossfade span: fully the far wail outside the first number,
   * fully the close wail inside the second. Equal-power, like the tyre's
   * surface fades and for the same reason — the two recordings are
   * uncorrelated, so an amplitude fade dips 3 dB in the middle.
   */
  sirenBlendFarMetres: 40,
  sirenBlendNearMetres: 12,
  /** Smoothing on the blend position, seconds. */
  sirenBlendSeconds: 0.6,
  /** Smoothing on the level while the chase is live, seconds. */
  sirenResponseSeconds: 0.35,
  /**
   * Fade-out when the chase stops being a chase — escape, bust, quit. Long
   * enough to be a fade rather than a click, short enough that the results
   * card is not shouted over.
   */
  sirenReleaseSeconds: 1.6,
  /**
   * Doppler lean: playback-rate offset per m/s of closing speed, clamped at
   * `sirenDopplerMax`. ±3% is below conscious notice and still sells
   * "he is gaining" — a real Doppler shift at these speeds is about 4%/25 mph.
   * Applied to both loops identically so the crossfade never detunes.
   */
  sirenDopplerPerMs: 0.006,
  sirenDopplerMax: 0.03,
  /** Smoothing on the Doppler rate, seconds. */
  sirenRateSeconds: 0.5,

  // -- Warnings -------------------------------------------------------------

  /**
   * Master level for the power-ladder beeps. **Zero by owner decision
   * (2026-08-04): "get rid of the tiltback beeps, no reason to have that
   * annoyance in arcade (this not a sim)."** The ladder still exists — the
   * HUD light climbs it and tilt-back still tips the pedals — it just no
   * longer beeps at the player. The rungs below keep their pitches, rates,
   * and per-rung levels so one slider (F4) revives the whole ladder for
   * comparison; at zero the director emits no beep cues and no beep ducking.
   *
   * The one beeping the game still makes is in the crash recording, where it
   * belongs — the owner's own wheel complaining as it tumbles.
   */
  beepLevel: 0.0,
  /**
   * The power ladder, as three square-wave patterns (`docs/PLANS.md` §8.3).
   *
   * Rising in pitch *and* in rate, because either alone is ambiguous over a
   * motor that is itself changing pitch. Real wheels do exactly this, and a
   * rider who has heard the middle rung once knows what the top one means
   * without being told — which is the only kind of warning that works.
   */
  beepSeconds: 0.075,
  // Long enough that the onset is a note rather than a click. A 4 ms attack on
  // a 1.3 kHz tone is a tick with a tone behind it, and at the top rung the
  // player hears it three times a second.
  beepAttackSeconds: 0.009,
  beepReleaseSeconds: 0.034,
  /**
   * Lowpass over the square, Hz.
   *
   * Low enough that only the third and fifth harmonics survive: enough edge to
   * read as a machine warning rather than a flute, without the 5-10 kHz fizz
   * that makes a real piezo painful. The arcade rule again — the top rung can
   * sound for a whole climb, so it has to be bearable for a whole climb.
   */
  beepCutoffHz: 2600,
  /** Gap between the two beeps of the warn pattern, seconds. */
  beepDoubleGapSeconds: 0.105,

  // The ladder was moved down a whole tone with everything else. The pitches
  // still rise, the rates still double, and the top rung is a fifth below the
  // 1568 Hz it used to sit at — which is a long way out of the band that makes
  // a repeated tone ring in the ear afterwards.
  noticeHz: 784,
  noticePeriodSeconds: 1.30,
  noticeLevel: 0.16,
  warnHz: 1046,
  warnPeriodSeconds: 0.60,
  warnLevel: 0.25,
  tiltBackHz: 1320,
  // Exactly half the warn rung's period, which is half the notice rung's: the
  // ladder is a clean doubling, so each step up is unmistakable without the
  // top one becoming the frantic stream a real wheel produces.
  tiltBackPeriodSeconds: 0.30,
  tiltBackLevel: 0.29,

  // -- The over-speed beeps (M20) -------------------------------------------

  /**
   * The max-speed warning, and **the one beep the owner asked to have back**.
   *
   * Deliberately a separate system from the power ladder above rather than a
   * fifth rung on it, and the separation is the design:
   *
   *   - **The ladder is about load; this is about speed.** A rider grinding up
   *     a hill at 20 mph is on the ladder's top rung and is in no danger from
   *     this; a rider flat out on level tarmac is barely on the ladder and is
   *     about to lose the wheel. They answer different questions and a rung
   *     that meant both would answer neither.
   *   - **The ladder stays silenced.** `beepLevel` is still 0 by the owner's
   *     2026-08-04 decision and this does not reopen it. Reviving the ladder to
   *     carry a new warning would have quietly restored the tilt-back beeping
   *     he removed, which is exactly the M16 failure in a different subsystem.
   *   - **It is a recording, not a synthesized tone**, which no rung above is.
   *     `assets/live/overspeed_beep.wav` is a measured replica of the piezo
   *     alarm on the owner's reference video — 2565 Hz with its second harmonic
   *     17.4 dB down, its 10 ms attack, and a tightened release so beeps at the
   *     top of the ramp do not smear into each other. `tools/make-overspeed-
   *     beep.mjs` holds the measurement and the reasoning, including why the
   *     video's own audio is not the shipped file.
   *
   * **On rule 2 of the arcade rules above** — no isolated sustained tone over
   * ~1.5 kHz. A 75 ms one-shot is not a sustained tone, and this one is the
   * sound the machine it is imitating actually makes; the rule was written
   * against a PWM carrier that played whenever the player *stopped*. What keeps
   * it inside the spirit of the rule is the range: nothing beeps below 40 mph,
   * so a rider pottering about hears none of this ever.
   *
   * 0.04 is the level's **third cut, and the first two are the reason it is
   * this deep**. It first shipped at 0.34; the owner rode that and asked for
   * quieter (*"irl it is loud too, but this is a videogame"*), so M20.1 halved
   * it to 0.17; he then rode the published 0.17 on his handset and reported
   * *"the beeps are still way too loud"*. One halving having already proven
   * insufficient, M20.2 cut it past half to 0.08. His next handset ride still
   * found that too loud, so this pass halves it again instead of asking the
   * warning to win a loudness contest it does not need to win —
   * and 2565 Hz sits near the ear's most sensitive band *and* near a phone
   * speaker's resonant peak, so the tone reads hotter on the handset he
   * actually plays on than on the desktop where levels get set. A
   * fidelity-versus-comfort call that goes comfort's way by the arcade rules
   * at the top of this block; the warning also has a silent partner (the HUD
   * glyph), so audibility is not load-bearing for fairness.
   */
  overspeedLevel: 0.04,
  /**
   * The beep's own length, seconds — and it is the shipped recording's length
   * rather than a free choice.
   *
   * `assets/live/audio/overspeed_beep.wav` is 75 ms: a 10 ms measured attack,
   * 40 ms of hold, and a 25 ms release. The number is here because the duck's
   * hold is derived from it and because the synthesized fallback has to match
   * the recording it stands in for. Change the tool's envelope and change this.
   */
  overspeedBeepSeconds: 0.075,
  /**
   * The synthesized fallback's pitch, Hz.
   *
   * The measured fundamental of the reference alarm, so a player whose sample
   * bank has not landed yet hears the right note through the wrong synthesis
   * rather than a different warning. It is not a tuning knob; it is the
   * measurement, and `tools/make-overspeed-beep.mjs` is where it came from.
   */
  overspeedFallbackHz: 2565,
  /**
   * The beep period at the bottom and the top of the ramp, seconds.
   *
   * **Both ends are measured off the owner's reference video**, at his own
   * request after riding the first build — *"maybe best for it to beep the same
   * intervals real euc beeps"*. The first build used his sketch numbers (2.00 s
   * at the bottom, 0.11 s at the top); the real alarm on the video never beeps
   * that lazily or that frantically. Gating the video's 2565 Hz tone and
   * reading beep-onset gaps gives a rapid alarm at 0.125–0.165 s and a
   * slowest structured cadence around 0.9–1.1 s, so the ramp now runs 1.10 s
   * down to 0.14 s: every interval the game plays is one the real machine
   * produces. At 0.14 s a 75 ms beep still leaves clear silence between beeps.
   *
   * **Interpolated geometrically**, not linearly. Linear in period spends most
   * of the speed range sounding almost identical and then collapses in the last
   * mile per hour; geometric makes every extra mile per hour a fixed *ratio*
   * faster, which is what a rider actually feels as the wheel running out of
   * room. `audio/director.ts` does the arithmetic.
   */
  overspeedSlowestPeriodSeconds: 1.10,
  overspeedFastestPeriodSeconds: 0.14,
  /**
   * How far the beep ducks the ride bed, 0..1 — rule 3, "a warning wins by
   * ducking, never by hurting".
   *
   * Shallower than the tilt-back rung's 0.54 even though this warning is more
   * serious, and for a reason that is specific to this one: at the top of the
   * ramp the beeps arrive faster than the duck releases, so a deep duck would
   * hold the wind bed down for the whole of the fastest riding in the game —
   * and the wind *is* the sense of speed (§5's own entry). The beep wins on
   * being a different sound in a quiet band rather than on flattening the ride.
   */
  overspeedDuck: 0.22,

  // -- Transients -----------------------------------------------------------

  /**
   * Every one-shot is the same two ingredients in different proportions: a
   * pitched thump that falls, and a noise burst shaped by a filter. Impacts
   * differ in how hard, how deep, and how bright — not in kind — which is why
   * they share one synthesis path and only these numbers change.
   */
  // Hop and landing were both cut about a third after the owner's second
  // ride: "the jump and landing also sounds a bit loud". The ordering the
  // duck ladder asserts (landing louder news than a hop) is unchanged.
  hopLevel: 0.20,
  hopThumpFromHz: 150,
  hopThumpToHz: 60,
  hopThumpSeconds: 0.14,
  hopNoiseHz: 900,
  hopNoiseSeconds: 0.09,

  landingLevel: 0.36,
  landingThumpFromHz: 190,
  landingThumpToHz: 55,
  landingThumpSeconds: 0.20,
  landingNoiseSeconds: 0.16,
  /** Landing level floor, so the gentlest touchdown is still heard. */
  landingMinScale: 0.28,

  curbLevel: 0.46,
  curbThumpFromHz: 260,
  curbThumpToHz: 80,
  curbThumpSeconds: 0.12,
  curbNoiseHz: 1800,
  curbNoiseSeconds: 0.07,
  /** Impact speed, m/s, at which a solid hit reaches full level. */
  curbImpactReference: 6.0,
  /**
   * Shortest gap between two solid-hit sounds, seconds.
   *
   * **A solid impact is not an edge.** The controller reports every step in
   * which it refused part of a move into geometry, and a wheel grinding along
   * a wall refuses one at 120 Hz — which without this fires 120 impact sounds
   * a second, exhausts the voice cap in a fifth of a second, and turns a
   * scrape into a buzzsaw that also swallows every other sound in the game.
   * Found by the voice-drop counter in `tests/m8.spec.ts` during a crash run,
   * which is exactly the situation that produces it.
   *
   * A louder hit inside the window is still allowed through, so a real
   * collision at the end of a scrape is not swallowed by the scrape.
   */
  impactRetriggerSeconds: 0.14,

  /**
   * The paddle — a whoosh, a thump, and silence on a miss (§13 q22) — M14.
   *
   * **Both synthesised, and no file ships for either.** The mode adds nothing to
   * `audio/samples.ts`; a whoosh is a short filtered noise burst and a hit is
   * the same thump-plus-noise pair every other impact in this game is made of.
   *
   * **A miss is silence and that is a design decision, not an omission.** The
   * whoosh already told the player they swung; a "you missed" sound would fire
   * several times a route, and the owner's standing rule is that anything
   * annoying is removed rather than tuned. The recorded precedent is the cut
   * "Missed: Park gate" line, dropped for scolding a player who was exploring.
   *
   * **The bed is nearly empty here**, so these levels are chosen against a tyre
   * voice and wind and not against a motor: `motorLevel` is zero by owner
   * decision. A level picked by eye against the pre-M8 bed would make a paddle
   * the loudest thing in the game.
   */
  swingLevel: 0.16,
  /**
   * Whoosh band, Hz, and how tight it is.
   *
   * High and broad: air moving past a flat padded face is mostly hiss, and a
   * narrow band at this length reads as a tone rather than as movement. There
   * is deliberately no thump on a swing — nothing has been struck yet, and a
   * pitched component would be the sound of a hit that did not happen.
   */
  swingNoiseHz: 2400,
  swingNoiseQ: 0.7,
  swingNoiseSeconds: 0.13,

  /**
   * The hit. The one sound in this mode the player is actually playing for.
   *
   * Lower and longer than the kerb knock, because a padded face on a padded pad
   * is a *dull* impact — the reference is a boxing mitt, not a bat on a ball.
   * It outranks the whoosh through the duck below rather than through level,
   * which is the same ordering rule the rest of this table follows.
   */
  hitLevel: 0.42,
  hitThumpFromHz: 210,
  hitThumpToHz: 62,
  hitThumpSeconds: 0.16,
  hitNoiseHz: 1150,
  hitNoiseSeconds: 0.10,

  /**
   * The Drunkard's stumble — two cans knocking and a hic — M29 Phase 4 (q112).
   *
   * Three-eighths of `crashLevel`, and placed by the ladder rather than by
   * ear: under the kerb (0.46) and the hit (0.42), because those are events
   * and this is a *beat* that comes round eleven times a minute at top speed;
   * above the hop (0.20), because a joke nobody can hear is the one thing the
   * owner's q112 "yes" did not ask for. The recording is peak-normalised to
   * −6 dBFS, so at this level its peak lands about 6 dB under the crash
   * recording's (`crashLevel × crashSampleTrim` on a −7 dBFS file). Zero is
   * the annoyance kill-switch: the stumble still moves the wheel and the cue
   * still counts, it just stops sounding.
   */
  stumbleLevel: 0.30,

  /**
   * The race countdown, and the release — M27 Phase 3 (§27.3).
   *
   * **Its own cue, its own timer, its own duck**, and the plan says so in as
   * many words for M20's reason: routing a new warning through `beepPattern`
   * is how the removed over-speed beeping came back. This is a tone, not a
   * beep pattern, and nothing here touches the power ladder.
   *
   * Two pitches, an octave apart, so a room hears the difference between "not
   * yet" and "go" without being told which is which — the count is the lower
   * one because a rising interval is what every start light in the world does.
   * Short, because a countdown that rings into the first corner is the kind of
   * thing the standing annoyance rule removes rather than tunes.
   */
  raceCountLevel: 0.34,
  raceCountToneHz: 660,
  raceCountToneSeconds: 0.12,
  raceGoLevel: 0.46,
  raceGoToneHz: 1320,
  raceGoToneSeconds: 0.30,

  crashLevel: 0.80,
  crashThumpFromHz: 130,
  crashThumpToHz: 38,
  crashThumpSeconds: 0.42,
  crashNoiseHz: 1200,
  crashNoiseSeconds: 0.55,
  /**
   * The crash is the owner's own wipeout, and this trims the recording.
   *
   * When the sample bank is loaded, a crash plays
   * `assets/live/audio/crash_wipeout.wav` — his real "whoa", the wheel's
   * frantic beeping, the tumble — at `crashLevel × the speed scale × this`,
   * in place of the synthesized thump-and-burst (which remains the fallback
   * before the bank lands). Trimmed below 1 because the recording is
   * peak-normalised and carries far more sustained energy than the burst the
   * ducking was balanced against.
   */
  crashSampleTrim: 0.85,
  /**
   * Deterministic playback-rate rotation across successive crashes, so the
   * fifth crash of a session is not audibly the same recording five times.
   * Small: the beeps in the recording are pitched, and a large shift would
   * turn a real wheel's alarm into a cartoon.
   */
  crashSampleRateSpread: 0.05,

  /**
   * Recovery: a short rising two-tone, the machine coming back.
   *
   * **Silenced by owner decision (2026-08-04, second ride): "extremely loud
   * beep when euc turns on after recovering from a wipeout".** The moment
   * moved to the picture instead — the status light flares white as the
   * rider fades back in (`FX.statusBootIntensity`), which is what a real
   * wheel's LEDs do at power-on and costs the ears nothing. The cue still
   * fires at zero gain so the counters and the duck ordering keep their
   * meaning; 0.26 restores the second-pass chirp.
   */
  recoverLevel: 0.0,
  recoverLowHz: 660,
  recoverHighHz: 990,
  recoverSeconds: 0.20,

  // -- Ducking --------------------------------------------------------------

  /**
   * How far each source pushes the ride bed down while it is sounding.
   *
   * This is the answer to the second half of the exit question, and the
   * ordering is the whole design: a crash beats tilt-back beats the warn rung
   * beats an impact beats a hop. Nothing here silences the bed — a wheel that
   * goes quiet is a wheel that has stopped, which is a different and much
   * worse message than "listen to this".
   */
  duckAttackSeconds: 0.030,
  duckReleaseSeconds: 0.30,
  duckNotice: 0.20,
  duckWarn: 0.34,
  // The top rung takes its authority from here rather than from its level —
  // the note on `tiltBackLevel`'s slider says exactly this, so it is what the
  // defaults do.
  duckTiltBack: 0.54,
  duckHop: 0.10,
  duckLanding: 0.20,
  duckCurb: 0.26,
  // M14, and placed in the ladder rather than appended to it. A swing is the
  // quietest thing here — it happens whether or not anything came of it, so it
  // must not push the ride down every time the player tries. A landed hit is
  // the payoff and ducks like a landing does.
  duckSwing: 0.06,
  /**
   * How far the bed ducks under the countdown — M27 Phase 3.
   *
   * Deeper than a swing and shallower than a crash: the room is meant to hear
   * it over four wheels idling on a grid, and it is the one moment in a race
   * where nothing else is happening.
   */
  duckRaceCue: 0.16,
  duckHit: 0.22,
  duckCrash: 0.55,
  /** The crash duck alone releases slowly: the aftermath is part of the crash. */
  duckCrashReleaseSeconds: 1.10,

  /**
   * How far the whole bed falls while the rider is off the wheel.
   *
   * Not a duck — a state. The motor is still running and the tyre is still
   * turning, but nobody is riding, and the mix says so by pulling the ride
   * back to a fraction of itself until the recovery.
   */
  crashedBedGain: 0.30,
  crashedBedSeconds: 0.18,
} as const;

/**
 * Simulation cadence. Fixed step with an accumulator; rendering interpolates
 * between the two most recent states.
 */
export const SIMULATION = {
  /** Fixed steps per second. */
  hz: 120,
  /** Catch-up ceiling. Beyond this, drop time rather than spiral. */
  maxStepsPerFrame: 5,

  /**
   * How long to wait for the first animation-frame callback before giving up
   * on requestAnimationFrame and switching the single loop owner to a timer
   * chain.
   *
   * A browser can expose requestAnimationFrame and never deliver the first
   * callback — the DOM renders, the canvas stays black, and even the debug
   * overlay is frozen, because it is drawn by the loop that never started
   * (master starter 12). 900 ms is well beyond any honest first-frame latency,
   * including a cold shader compile, and short enough that a player does not
   * conclude the page is dead.
   */
  firstFrameProbeMs: 900,
  /**
   * Interval for the fallback timer chain, in milliseconds. Roughly 60 Hz.
   * One timer at a time — the loop keeps exactly one owner in either mode.
   * Timings taken on this path are never performance evidence.
   */
  fallbackIntervalMs: 16,
} as const;

/** Renderer quality ceilings. */
export const RENDER = {
  /**
   * Device pixel ratio ceiling. Above 2 the cost roughly doubles for a
   * difference most displays cannot show at gameplay distance.
   */
  maxPixelRatio: 2,
} as const;

/** Fill-only ground-boundary constants. ULTRA.ground.edge aliases this unchanged table. */
export const GROUND_BOUNDARY = {
  /**
   * The most a filled point may sit from the outranking surface, in cells.
   * §6's rule is ½ cell; the exact straight line needs `n/(n+1)` for a 1:n
   * staircase — 0.667 at 1:2 and 0.75 at 1:3 — so the cap is 0.75, the
   * ceiling the brief allows for a shallow diagonal. At ½ a 1:2 line would
   * zig-zag between 45° and 18° segments with a half-cell amplitude.
   */
  capCells: 0.75,
  /**
   * …and never more than this many metres, whatever the spacing: the
   * visual boundary is a gameplay honesty, and Switchback's 1.5 m cells
   * would otherwise let turf cover 1.1 m of the riding trail.
   */
  capMetres: 0.75,
  /**
   * The cap into a **drivable** cell, in cells (coordinator amendment
   * A12; Wave 3, R-G): the rank-1 road (pavement, rough pavement) and the
   * dirt the riding trails are laid in. The visual edge of what is ridden
   * never moves more than half a cell from the ridden grid, so the ridden
   * width reads true; `capCells` (¾) stays between non-drivable surfaces —
   * and on the gravel verges, where a ½ cap drew the grass edge back into
   * a visible sawtooth at the steeple (measured, `M39_ULTRA.md` §U2). A
   * 1:1 boundary is still exact at ½ (it needs n/(n+1) = ½); a shallower
   * one becomes a kneed ramp with a bump of at most ½ − ½/n.
   */
  drivableCapCells: 0.5,
  /**
   * The rounded knee on a drivable edge, in cells (coordinator amendment
   * A18; Wave 4, R-G; round-2 item 8): at the ½ cap a 1:2 or 1:3 boundary
   * is a kneed ramp, and its knee — where the ramp meets the cap — is
   * drawn as the smooth maximum of the two lines' signed distances over
   * this width, a tangent-continuous turn instead of a kink.
   */
  kneeRoundCells: 0.5,
  /**
   * …and the knee's gate is lifted by this share of that width before the
   * boundary is pulled taut, because the rounding dips under the corner by
   * about a quarter of it: the rounded knee keeps to the ½ cap.
   */
  kneeLiftShare: 0.28,
  /** A filled cell keeps at least this share of its area uncovered. */
  minKeptArea: 0.1,
  /** `ultraEdge` for "no line here", in cells: far outside every cell. */
  sentinel: -4,
} as const;

/** Ground cover at real source height; near corridors receive the bounded
 * population first rather than spending most instances in unseen far fields. */
/** Render-only static terrain/furniture partitions. 64 m created excess
 * submissions in the installed R32 world; broad cells retain native frustum
 * rejection without multiplying cheap scenery draws. Trees keep their own
 * existing distance cells. Units: world metres. */
export const ENVIRONMENT_BATCHING = Object.freeze({ spatialBatchMetres: 256,
  /** RL-4: metric facades split polygons at the accepted 32 m and draw one
   * batch per finish, 256 m batch cell and caster role (owner, 2026-10-04).
   * The same polygons and triangles cut the city spawn's facade calls from
   * 96 to 16; moved batch origins flip isolated edge pixels through Float32
   * rounding, a trade the owner accepted. */
  metricFacadeBatchMetres: 256, metricFacadeChunkMetres: 32 });

export const ENVIRONMENT_VEGETATION = Object.freeze({
  /** Local tree/shrub instance bounds allow colour and shadow frustum culling. */
  treeBatchMetres: 64,
  /** Lower-detail colour only, beyond the nearest point of a conservative
   * cell sphere. Shadows always keep the accepted near silhouette. */
  treeDetailStartMetres: 64,
  treeFarStartMetres: 150,
  /** Narrower camera lenses retain detail farther out; wider panes never
   * pull the near-detail boundary toward the player. Degrees. */
  treeDetailReferenceFovDegrees: 55,
  latticeMetres: 1.0, jitterShare: 0.88, broadClusterCells: 9, fineClusterCells: 3,
  minimumDensity: 0.12, broadDensity: 0.52, fineDensity: 0.24,
  ordinaryClumpLimit: 12288, ultraClumpLimit: 24576, maximumCandidateChecks: 98304,
  ordinaryPopulationShare: 0.68, ordinaryBlades: 9, enrichmentBlades: 4,
  corridorCoverReachMetres: 6, corridorCandidateShare: 0.88,
  minimumHeight: 0.08, maximumHeight: 0.18, footprintRadius: 0.50,
  maximumSupportError: 0.012, rootLift: 0.001, minimumUpNormal: 0.82,
  routeSampleMetres: 0.5, routeMargin: 0.30, exclusionBucketMetres: 16,
  maximumSpatialBatches: 96, minimumBatchMetres: 24,
  windMetres: 0.018, windPeriodSeconds: 512,
  windCycles: Object.freeze([59, 95, 50, 84] as const), fadeStartMetres: 60, fadeEndMetres: 100,
  roughness: 0.88, rootColour: 0x56623d, tipColour: 0x839258,
});

/** Colour-distance boundaries per ordinary tier (RL-1, 2026-10-03). High, and
 * Ultra drawn over it, keeps ENVIRONMENT_VEGETATION's accepted values exactly.
 * Low and Medium move the same per-camera boundaries nearer: tree, crown and
 * shrub cells reach their middle and far ranges sooner and ground cover fades
 * sooner. Render-only: generation, collision, population and the shadow
 * silhouette are untouched. Metres. */
export const VEGETATION_TIER_DETAIL = Object.freeze({
  high: Object.freeze({ treeDetailStartMetres: ENVIRONMENT_VEGETATION.treeDetailStartMetres,
    treeFarStartMetres: ENVIRONMENT_VEGETATION.treeFarStartMetres,
    grassFadeStartMetres: ENVIRONMENT_VEGETATION.fadeStartMetres, grassFadeEndMetres: ENVIRONMENT_VEGETATION.fadeEndMetres }),
  // TIER-LOW-1 (2026-10-04): the middle tree form is open enough to read as a
  // see-through lattice against a bright sky from 24 m (Low) or 40 m
  // (Medium) — the trees beside Switchback's trail — so it starts at 40 m and
  // 56 m; the far boundaries and the grass fades keep their savings.
  medium: Object.freeze({ treeDetailStartMetres: 56, treeFarStartMetres: 100, grassFadeStartMetres: 40, grassFadeEndMetres: 64 }),
  low: Object.freeze({ treeDetailStartMetres: 40, treeFarStartMetres: 60, grassFadeStartMetres: 24, grassFadeEndMetres: 40 }),
});

/** Couch detail (PERF-R2-1, 2026-10-04). From three panes on, every pane is
 * a quarter of the canvas, so a tree or tuft d metres away covers the pixels
 * it would at d / paneScale alone. Such panes use their tier's boundaries
 * scaled by paneScale, and each tier keeps its own way of judging a tree
 * cell (High the cell sphere), so every form switches at the on-screen size
 * solo play at that tier does. One and two panes, and Ultra (always one),
 * keep their tier's rules exactly. Render-only, like VEGETATION_TIER_DETAIL. */
export const VEGETATION_COUCH_DETAIL = (() => {
  const minimumPanes = 3, paneScale = 0.5;
  const scaled = (rules: (typeof VEGETATION_TIER_DETAIL)[keyof typeof VEGETATION_TIER_DETAIL]) => Object.freeze({
    treeDetailStartMetres: rules.treeDetailStartMetres * paneScale, treeFarStartMetres: rules.treeFarStartMetres * paneScale,
    grassFadeStartMetres: rules.grassFadeStartMetres * paneScale, grassFadeEndMetres: rules.grassFadeEndMetres * paneScale });
  return Object.freeze({ minimumPanes, paneScale, high: scaled(VEGETATION_TIER_DETAIL.high),
    medium: scaled(VEGETATION_TIER_DETAIL.medium), low: scaled(VEGETATION_TIER_DETAIL.low) });
})();

/** Living-world authoring clearances, dimensions and density. All lengths in metres, speeds in metres per second. */
export const POPULATION_AUTHORING = Object.freeze({
  revision: 'living-r1' as const,
  traceSpacingMetres: 0.5,
  groundProbeSpacingMetres: 0.25,
  joinToleranceMetres: 0.02,
  joinHeadingToleranceRadians: 0.03,
  maximumSourceSpacingMetres: 1,
  maximumPeople: 20,
  /** Hashed into new purposeful-walk physical identity; old prepared plans keep their prior actor policy. */
  activityWalkPolicyRevision: 'district-walk-r15e' as const,
  /** Power-of-two fallback lattice: 63 interior stations plus two authored endpoints, only after legacy primary choices fail. */
  activityFallbackStationDivisions: 64,
  maximumRiders: 4,
  maximumParkedVehicles: 3,
  maximumServiceVehicles: 1,
  maximumTrafficVehicles: 2,
  /** Rectangular actor half-extents; authoring clears their diagonal, not one side. */
  pedestrianRadiusMetres: 0.42,
  riderRadiusMetres: 0.65,
  vehicleHalfWidthMetres: 1.02,
  vehicleHalfLengthMetres: 2.4,
  vehicleHeightMetres: 2.8,
  actorHeightMetres: 1.9,
  staticClearanceMetres: 0.12,
  spawnClearanceMetres: 9,
  checkpointClearanceMetres: 4,
  featureClearanceMetres: 3,
  hazardClearanceMetres: 1.25,
  targetClearanceMetres: 2,
  lapClearanceMetres: 2,
  maximumGroundGrade: 0.12,
  maximumCrossGrade: 0.12,
  maximumStepMetres: 0.12,
  /** A source corridor frame cannot silently become a roof/solid-top route. */
  maximumGroundReferenceDifferenceMetres: 0.5,
  minimumWalkMetres: 8,
  minimumRideMetres: 20,
  minimumTrafficMetres: 45,
  maximumServiceShuttleMetres: 16,
  minimumVehicleTurnRadiusMetres: 7,
  actorSpacingMetres: 10,
  socialSpacingMetres: 1.4,
  anchorMaximumPropDistanceMetres: 14,
  walkSpeedMetresPerSecond: 1.1,
  jogSpeedMetresPerSecond: 2.6,
  eucSpeedMetresPerSecond: 3.8,
  serviceSpeedMetresPerSecond: 1,
  trafficSpeedMetresPerSecond: 5.5,
  idleSeconds: 3,
  epsilon: 1e-8,
});


/** Shared material detail; lengths in metres, amplitudes in linear space.
 * No displacement or changes to physical terrain normals. */
export const DISTRICT_EXTERIOR = Object.freeze({
  masonry: { roughness: 0.91, metalness: 0 },
  frame: { roughness: 0.74, metalness: 0.05 },
  roofEdge: { roughness: 0.63, metalness: 0.08 },
  planting: { roughness: 0.91, metalness: 0 },
  entry: { roughness: 0.72, metalness: 0.08 },
  glazing: { roughness: 0.28, metalness: 0.12 },
  entryColour: 0x49646b,
  entryColours: [0x49646b, 0x605048, 0x484f41] as const,
  glazingColour: 0x334951,
  wallTone: 1.10,
  frameTone: 0.72,
  roofTone: 0.85,
  plantingTone: 1.04,
} as const);

export const SHARED_GROUND = Object.freeze({
  textureSize: 256,
  /** Albedo shoulder wholly inside the unchanged source ground region. */
  shoulderMetres: 0.55,
  pavedShoulderShare: 0.45,
  cellWeight: 0,
  midWeight: 0.44,
  coarseWeight: 0.42,
  fieldMidMetres: 5.7,
  fieldCoarseMetres: 27,
  grass: { metres: 2.8, contrast: 0.48, macroContrast: 0.38, reliefMetres: 0.024, roughnessVariation: 0.08 },
  dirt: { metres: 3.1, contrast: 0.42, macroContrast: 0.30, reliefMetres: 0.018, roughnessVariation: 0.10 },
  gravel: { metres: 1.65, contrast: 0.44, macroContrast: 0.18, reliefMetres: 0.028, roughnessVariation: 0.10 },
  pavement: { metres: 2.4, contrast: 0.18, macroContrast: 0.20, reliefMetres: 0.003, roughnessVariation: 0.06 },
  roughPavement: { metres: 2.4, contrast: 0.26, macroContrast: 0.24, reliefMetres: 0.006, roughnessVariation: 0.08 },
  concrete: { metres: 2.0, contrast: 0.095, macroContrast: 0.10, reliefMetres: 0.002, roughnessVariation: 0.05 },
  wood: { metres: 2.4, contrast: 0.18, macroContrast: 0.08, reliefMetres: 0.003, roughnessVariation: 0.08 },
  /** Shared low riding blocks: compacted earth / weathered timber tops
   * separate from their exposed sides. Linear reflectance multipliers,
   * height is exposed above real source support, never the buried base.
   * The takeoff band partitions the original top plane without changing grip,
   * source hull, hazard colour, material response or light/exposure. */
  feature: { maximumHeightMetres: 1.4, minimumShortSideMetres: 0.7, minimumLongSideMetres: 2,
    minimumTakeoffDropMetres: 0.30, takeoffBandWidthMetres: 0.14,
    takeoffBandRelativeReflectance: 0.62,
    earthTop: 1.42, timberTop: 1.30, sideFoot: 0.76, sideLip: 0.96 },
} as const);

/** Shared brick paving: albedo detail within the original material region. */
export const GROUND_PAVING = Object.freeze({
  /** Running-bond paver dimensions, in metres. */
  lengthMetres: 0.42,
  widthMetres: 0.21,
  /** Mortar seam width, in metres; it is filtered over the pixel footprint. */
  jointMetres: 0.018,
  /** Linear albedo reduction at a fully resolved seam, and per-paver variation. */
  jointDarken: 0.24,
  toneVariation: 0.045,
  /** Fade subpixel detail over this world-space footprint interval, in metres. */
  fadeStartMetres: 0.055,
  fadeEndMetres: 0.16,
} as const);

/**
 * The optional Ultra graphics recipe — M39 (`docs/PLANS.md` §39.6,
 * `docs/M39_ULTRA.md` §§2–4). **Start values**, written by W0 and owned from
 * Wave 1 by the lighting owner (W4); U2 tunes them against the measured gates
 * and records every change and its reason in `M39_ULTRA.md` §U2.
 *
 * **Nothing here reaches Low, Medium or High.** Every reader of this block is
 * an Ultra branch in `render/ultra/*` (or `render/Renderer.ts` on the Ultra
 * path), so an ordinary frame is byte-identical whatever these say — that is
 * invariant 1 of `M39_ULTRA.md` §7.1, and the U0 parity captures are its
 * evidence. The block lives here rather than in `render/` because invariant 4
 * puts every constant that shapes the look in this file; it is deliberately
 * outside the architecture scan that keeps the word `ultra` out of `level/`,
 * `simulation/` and admission data (§6.3 W7).
 *
 * **Two kinds of number.** The thirteen top-level scalars (`nearBias` …
 * `specAA`) are the fields of `UltraLiveTuning` and are registered on the F4
 * panel as `ULTRA.<field>`, so the owner's eye and the U2 tuning captures can
 * move them live (`--tune ULTRA.nearBias=0` is the gauntlet's planted defect).
 * Everything nested is a construction constant — a size, a band, a count —
 * read at build time and changed only here, with two exceptions since the
 * final touch (post round 4): `shade.lift` and `shade.liftFar`, the last two
 * `UltraLiveTuning` fields, are on F4 as `ULTRA.shade.lift` / `.liftFar` for
 * the owner's round-4 trades.
 *
 * **Absolute, never a delta** (§3.1). The lighting writers compute every
 * value from the resolved look, this table and the live set; nothing here is
 * multiplied into an ordinary value and later divided back out, so leaving
 * Ultra re-runs the ordinary writers and lands exactly where High was.
 */
export const ULTRA = {
  /**
   * The drawing-buffer pixel budget, device pixels (T0, §2.1): 2880×1800, the
   * MacBookAir10,1's retina buffer in its default "looks like 1440×900" mode.
   * Ultra's ratio is `min(dpr, maxPixelRatio, √(pixelBudget / cssPixels))`,
   * applied as a separate tier cap so `applyTuning`'s `setMaxPixelRatio` push
   * (q206) cannot clobber it — and so Ultra never draws more pixels than High.
   * **A26** raised it from the panel's native 2560×1600 (4,096,000): the
   * retina pair measured Ultra 1.33–1.41× softer than High there at 4.1 MP
   * and 1.01–1.04× at 5.18 MP, the pixel count High already draws. Equal to
   * `ULTRA_ENVELOPE.drawingBufferPixels` (`ultraCost.test.ts`); live on F4.
   */
  pixelBudget: 5_184_000,

  // -- The thirteen live values (`UltraLiveTuning`, F4 `ULTRA.<field>`) -----
  /** Near cascade depth bias (T2). High's is −0.0005; the 4096 map's 2.69 cm texel wants less. */
  nearBias: -0.00025,
  /** Near cascade normal bias, metres (T2). High's is 0.02. */
  nearNormalBias: 0.025,
  /** Near cascade PCF radius, texels (T2). High's is 1. */
  nearRadius: 1.25,
  /**
   * κ — scales the environment fill: `environmentIntensity = κ·fill/π`, with
   * `fill` the tuned-or-venue hemisphere intensity (daylight 0.350κ,
   * Switchback 0.388κ). Calibrated so **up-facing** shade matches High.
   * 1 was the uncalibrated start (first light: canyon road luma 31; sunlit
   * road −2.6 % against High on the shaded-contact view).
   * **1.25 (pre-R1 calibration, `M39_ULTRA.md` §U2):** measured shaded/sunlit
   * road within −1 … +4.4 % of High's and sunlit road within −1.6 … +0.1 %
   * on every town, slice and BelVar view; 1.35 overshot the shade by 5–9 %.
   * The painted zenith's cosine-weighted sky is 0.76 × High's hemisphere in
   * luminance, so the analytic parity is 1.32; the ratio gate measures High's
   * rider- and tree-shadow penumbra too, which is why it lands lower.
   */
  envKappa: 1.25,
  /**
   * β — the environment's lower hemisphere is the venue's `groundBounceColour`
   * × β (T1, §3.2): the warm ground bounce that lifts walls, undersides and
   * canopies out of navy-black (defect D1). A change rebuilds the PMREM.
   */
  bounceLift: 1.5,
  /** Ground indirect-specular multiplier (§3.3): the road stays the calmest plane. */
  groundSpec: 0.5,
  /**
   * Glass indirect-specular multiplier (§3.3): the painted sky on shaded glass.
   * 1.6 at W4. **1.2 (Wave 3, R-L):** round 1 read the steeple view's glazing
   * as washed out; on its shaded face the windows measured 0.80 × the wall
   * (High 0.64), the sky reflection lifting them toward the wall. 1.2 keeps
   * the sky in the glass and gives the window back its dark read.
   */
  glassSpec: 1.2,
  /**
   * Water `envMapIntensity` multiplier (T11): body/road 0.55–0.85, meniscus
   * brightest. 0.8 at W4 measured body/road 0.955 on the shaded-contact
   * puddle (pre-R1 calibration, §U2); 0.45 measures 0.73 there and 0.79 on
   * the steeple's.
   */
  waterSpec: 0.45,
  /** Overall scale on the analytic contact-AO occluders below (T5). 1 = as authored. */
  contactStrength: 1.0,
  /**
   * Share of contact AO applied to *direct* light (§3.3). **0 by default:**
   * AO is indirect-only so the sunlit road cannot darken. The lighting owner
   * may raise it to ≤ 0.3 on non-road surfaces only if the sunlit-road ±2 %
   * gate still passes; the slider's ceiling is that rule.
   */
  contactDirectShare: 0,
  /** Foliage wrap diffuse (T3/§3.3), inside the shadowed direct term. */
  foliageWrap: 0.30,
  /**
   * Foliage back-light transmission (T3/§3.3), `≤ 0.22` by the spec and
   * already shadowed — there is deliberately no shadow floor (judge 3: trees
   * would glow in building shade). The slider's ceiling is that rule.
   */
  foliageTransmission: 0.22,
  /** k in the geometric specular-AA floor `roughness = max(r, k·|fwidth(n)|)` (§2.2). */
  specAA: 0.35,

  /**
   * The near cascade (T2, §3.2): one 4096 map, ±55 m, pushed ahead of the
   * rider along the camera's horizontal forward, texel-snapped in light space
   * and faded to unshadowed over its outer edge band. The bias/normal-bias/
   * radius live above because they are live.
   */
  near: {
    /** Map edge, texels. 128 MiB as three allocates it (High: 2048, 32 MiB). Cut order step 4 is 3072. */
    mapSize: 4096,
    /** Half-extent of the orthographic box, metres (High: `LIGHTING.shadowRadius` 30). */
    extent: 55,
    /** Box centre = rider + forwardShare × extent along camera-horizontal forward (19.25 m). */
    forwardShare: 0.35,
    /** The rider stays at least this far inside the box's rear edge, metres. */
    rearInsetMetres: 35,
    /** Sun distance from the box centre, metres. Clears the 48 m beacon at 55° and 33°. */
    lightDistance: 150,
    near: 1,
    far: 320,
    intensity: 1,
    /** Outer share of the box over which shadow fades to 1 (≈ 6.6 m), so there is no switch-on line. */
    fadeShare: 0.12,
    /** Light-space texel snap, so the map does not crawl as the rider moves. */
    snap: true,
  },

  /**
   * The near map's filter on the ground and its paint (Wave 4, R-L; gauntlet
   * round 2 items 2b and 5). three's PCF is five taps turned per pixel by
   * interleaved-gradient noise: a dithered penumbra MSAA never resolves (the
   * player's "wavy, noisy penumbra" under the Switchback kicker), and a
   * one-texel edge wherever the shadow lies, so at 45 m the industrial slab
   * read as a hard-edged cut-out ("a hole", 5/5). The ground, markings,
   * pothole ground and water take a **fixed** 16-tap disk instead (no noise,
   * so it holds still in motion) whose radius grows with view distance: the
   * live `nearRadius` (1.25 texels, today's softness, and the planted
   * `nearRadius 0` still stair-steps) out to `groundRampMetres[0]`, rising to
   * `groundFarSpreadTexels` by `groundRampMetres[1]` — the aerial perspective
   * of a shadow's edge, as the fog is of its value. On level ground at 45 m a
   * pixel spans most of a metre of depth, so it softens the along-road edges;
   * the across-road ones are the static-shade lift's (R-G).
   */
  nearFilter: {
    /** Taps in the fixed disk (a Vogel spiral with no per-pixel turn). */
    taps: 16,
    /** The disk's radius at the far end of the ramp, texels (±0.32 m on the 2.69 cm texel). */
    groundFarSpreadTexels: 12,
    /** View distance, metres, over which the radius grows from `nearRadius` to the far spread. */
    groundRampMetres: [15, 45],
    /**
     * The edge reconstruction (final wave, P-LT; Fable F4): near the camera
     * the ground's disk is this many times the live radius wide, and a
     * smoothstep of slope `edgeWiden` at ½ restores the edge's contrast
     * (`ultraMaterials.ts` `NEAR_FILTER_GLSL`). The fixed disk at the rig's
     * 1.25 texels drew the rider's cast shadow with one bead per texel along
     * its edge (residential, 1×); at 1.6 the beads' ripple falls 42 % and the
     * penumbra is a touch crisper (1.05 texels 20–80 % against 1.12). Handed
     * over to the plain disk across `groundRampMetres`. 1 turns it off.
     * A construction constant, baked into the patch text.
     */
    edgeWiden: 1.6,
    /**
     * A28, Trade 2 (Codex's post-GU QA; the industrial crest slab): the
     * ground's disk also spans this angular **radius on screen**, degrees
     * (0.35° is about 5 pixels at 1080 lines), reached over
     * `groundScreenRampMetres` of view distance (nothing inside 12 m, so the
     * rider's shadow and every near edge keep today's). Measured on the slab:
     * its edges' 10–90 % widths 0.8 → 4.4 px (near) and 2.2 → 7.0 px (far),
     * with the dashes still 66 luma off the shaded road inside it (High's
     * sunlit road: 55). Why a screen kernel: the ramp above is isotropic in
     * light space, and on the crest one pixel spans about 0.2 m of depth
     * against 0.03 m across the road (7:1), so any kernel isotropic in metres
     * is either under a pixel on the across-road edges (the slab's "hard
     * polygon", A20's "cannot be softened in light space") or mush along the
     * road. The disk's taps are mapped from screen pixels into the near map
     * through the fragment's own screen derivatives (`ultraMaterials.ts`
     * `GROUND_SCREEN_KERNEL`), so every ground shadow edge past the ramp is
     * graded over the same few pixels in every direction, whatever its angle
     * to the camera — the aerial perspective of an edge. The same 16 taps; the
     * lift's static classification leans out by the same kernel
     * (`ultraFarShadeAround`), so the widened penumbra lifts whole and no
     * unlifted rim returns. Construction constants, baked into the patch text.
     */
    /**
     * **A29 (round 5): the screen kernel is off, and compiled out.** Round 5
     * judged A28's paler, graded slab worse than U5's on every count (five of
     * five critics read it as "a floating smudge with no caster"), so the
     * crest slab returns to U5. While this is false no program carries the
     * kernel: not its main() block, not its PCSS far-caster disk (16 near-map
     * taps) and not the static-shade lean's four far-map diagonals — the
     * ground filter is U5's text. True puts it back on the ground, paint,
     * pothole ground and water, behind the define `ULTRA_GROUND_SCREEN_KERNEL`
     * (`ultraGroundDetail.ts`), which is also how the kernel's own tests build
     * it. The values below stay as A28 measured them.
     */
    groundScreenKernel: false,
    groundScreenSpreadDegrees: 0.35,
    groundScreenRampMetres: [12, 24],
    /**
     * …and never more than this many metres of ground along the pixel's
     * longer axis (the view's depth on flat ground): at 45 m on the flat one
     * pixel spans about a metre, and a far building-shade strip a few pixels
     * tall kept its shape only under this cap (the commercial canyon's
     * 35–65 m bands).
     */
    groundScreenMaxMetres: 1.5,
    /**
     * …and only under a far caster, metres of height: the screen kernel
     * applies where the near map finds an occluder more than this far above
     * the receiver along the sun ray (a second pass of the same disk, twice as
     * wide, compared that much nearer the light) — the rule of a
     * percentage-closer soft shadow, whose penumbra grows with the distance
     * from receiver to occluder. A building's shade far from its walls (the
     * crest slab) is graded; a tree's (crowns top out under about 10 m at the
     * largest placed scale), a lamp's, an obstacle's and the rider's keep
     * today's edge, so tree shade still grounds its tree (Trade 3).
     */
    groundScreenCasterMetres: 10,
  },

  /**
   * The static far shadow (T12, §3.4): a manual depth render of the layer-5
   * casters into an Ultra-owned 3072² target, **once per world activation**
   * and after context restore — never mid-ride — sampled only by Ultra
   * patches and blended against the near map's own edge fade.
   *
   * **On by default (coordinator amendment A1, 2026-09-23)** on `ultra-full`;
   * `ultra-lit` keeps it off. Gauntlet round 1 judges it: blockiness or a seam
   * turns it off, or raises the map to 3072 under a byte-envelope amendment.
   */
  farShadow: {
    enabled: true,
    /**
     * Map edge, texels. The box is a per-instance light-space rectangle
     * (pre-R1 calibration, §U2); at 2048 its coarser axis drew 0.667 m texels
     * in town (1366 × 1160 m; the first-light square fit drew 0.92 m), 0.34 m
     * on the slice, 0.25 m at BelVar and 0.15 m at Switchback.
     * **3072 (stabilizer, 2026-09-23, under the §5 byte-envelope amendment
     * A1 names):** the town's texel is 0.445 m, measured in a locked capture,
     * for +25 MiB steady (45 MiB at 5 B/texel). `ULTRA_ENVELOPE.farShadowMap`
     * and `bytes` were amended with it (`M39_ULTRA.md` §5); a raise past
     * 3072 needs another amendment.
     */
    mapSize: 3072,
    /**
     * Width of the far map's own edge fade, metres (§6.2 start value; W4's
     * use): the far term eases to unshadowed over this band inside the far
     * box's light-space edge, so a caster clipped by the world-fitted box can
     * never draw a hard line where the map ends. Receivers outside the box are
     * correctly unshadowed anyway — a shadow lands at its caster's light-space
     * (x, y) — so the band is a guard, not a look.
     */
    fadeMetres: 40,
    /**
     * Hardware PCF taps on the far map (`sampler2DShadow`, `LessEqualCompare`):
     * four bilinear compare fetches of four taps each, on a square
     * `pcfSpreadTexels` either side of the lookup — a tent about three texels
     * wide. One fetch (W4's 4 taps) left the far shade's edges stair-stepped
     * in town (pre-R1 calibration, §U2). Fetched only where the far map is
     * seen: inside the near box, where the near map alone rules, it is skipped.
     */
    pcfTaps: 16,
    /** Offset of the four far-map fetches from the lookup, texels, on each axis. */
    pcfSpreadTexels: 0.75,
    /**
     * Receiver normal offset, in far-map texels (0.2–0.5 m). The far map is
     * rendered back faces only (three's own shadow convention), so a lit face
     * sits in front of its own caster's stored depth and needs no depth bias;
     * this offset only keeps the bilinear footprint off the contact line.
     */
    normalOffsetTexels: 1,
    /** Margin around the casters' world bounds in the fitted light box, metres. */
    boxMarginMetres: 2,
    /** Depth margin in front of the highest and behind the lowest caster, metres. */
    depthMarginMetres: 10,
  },

  /**
   * The painted-sky environment (T1, §3.2): `paintEnvironment(look)` at
   * 1024×512, PMREM-filtered once per activation. Upper half the venue's own
   * sky with the sun core removed and the aureole halved; lower half the
   * ground bounce × β (`bounceLift`), blended from `horizonColour` over 6°.
   */
  env: {
    width: 1024,
    height: 512,
    /** The painted sun core's strength in the environment: removed, so no fake specular sun. */
    sunCoreStrength: 0,
    /** The aureole's share of the painted sky's own. */
    aureoleScale: 0.5,
    /** The horizon → bounce blend, degrees below the horizon. */
    horizonBlendDegrees: 6,
    /** The hemisphere light is kept (lights === 2) and zeroed; the environment is the fill. */
    hemisphereIntensity: 0,
    /**
     * Fill chroma (pre-R1 calibration, `M39_ULTRA.md` §U2): the share of the
     * painted sky's own colour its *diffuse* fill keeps on sky-facing faces.
     * The painted zenith is a deep blue, so an up-facing face in cast shade
     * (the whole canyon road once buildings cast) went navy at first light;
     * the fill is desaturated toward its own luminance instead, in the shader
     * (`ultraMaterials.ts`, after `lights_fragment_maps`), so κ still sets the
     * value and this only sets the hue. Weighted by the face's sky share
     * `(1 + n·up)/2`: a down-facing soffit keeps the warm bounce whole.
     * Glossy specular — sky on glass, metal and water — is untouched and
     * stays blue; a rough surface's reflection takes its own hue instead.
     * 0.15 measured the shaded road's OKLCH chroma at 0.22–0.49 × High's.
     */
    fillSaturation: 0.15,
    /**
     * The same share **in sun** (shadow visibility × a steep N·L ramp): a
     * sunlit face keeps most of the fill's sky hue, as High's hemisphere gives
     * it, so the sunlit road keeps High's faint coolness. Measured (§U2): at
     * 0.15 in sun too the road went neutral and road-dominated frames fell
     * under High's chroma; at 1 the painted zenith (B/R 2.97 against High's
     * hemisphere 2.44) tinted sunlit grass bluer than High's. 0.8 is where
     * the painted fill's B/R meets High's (analytic 0.77); the rest of the
     * greying of sunlit grass and brick was their rough specular, which now
     * takes the surface's own hue (`FILL_CHROMA`).
     */
    fillSunSaturation: 0.8,
    /**
     * How far the desaturated fill leans toward the venue's haze hue (the fog
     * colour, which is `horizonColour` by contract — derived, never authored
     * per venue): the town's cool pale haze gives "slightly cool, not blue"
     * shade, Switchback's warm haze the warm late-afternoon fill.
     */
    fillHazeTint: 0.4,
  },

  /**
   * The Ultra sky (T8, §3.2): the same painter at 2048×1024 with one finer
   * cloud octave, sampled with anisotropy 4 — magnified 3.5× instead of 7×
   * (defect D7). The horizon row stays `horizonColour` exactly.
   */
  sky: {
    width: 2048,
    height: 1024,
    /**
     * Amplitude of the extra fine cloud octave, relative to the next coarser
     * one. 0.5 at W4; 0.75 from the pre-R1 calibration (§U2), with the edge
     * sharpening below, which is what makes it visible at all.
     */
    fineOctaveAmplitude: 0.75,
    /**
     * The wisps' edge softness on the Ultra sky, as a share of the
     * construction's (pre-R1 calibration, §U2). At 1 Switchback's authored
     * streaks painted at 2048 looked the same as the 1024 sky: the soft ramp
     * blurred away the fine octave. 0.6 draws the same clouds in the same
     * places with defined, detailed edges. Only on a venue that authors its
     * own sky: on the daylight skies it moved the rooftop haze band (§U2),
     * and their Ultra detail is the cumulus, which has its own softness.
     */
    cloudSoftnessScale: 0.6,
    anisotropy: 4,
    /**
     * Sparse fair-weather cumulus on the **daylight** venues' Ultra sky (town,
     * slice, BelVar) — coordinator amendment A2. Same deterministic painter;
     * Switchback keeps its authored clouds; the ΔE ≤ 2 gate applies to
     * non-cloud pixels only. The mood keeper judges it.
     */
    daylightClouds: true,
    /**
     * The cumulus layer's construction (A2), painted over the ordinary wisps
     * by `render/skyImage.ts` (`cumulusLayout`, `cumulusPixel`).
     *
     * **Rebuilt after gauntlet round 1 (R-L, 2026-09-23, `M39_ULTRA.md` §U2
     * "Wave 3 — R-L").** Five of five critics read W4's noise cumulus as a
     * grey smudge or smoke: a threshold on fBm has no top and no base, so its
     * shading invented a grey core and a grey underside darker than the haze;
     * it sat anywhere, so a cloud's dark base filled the rooftop haze band and
     * another's tail hung off the frame's top edge; and one field for every
     * plan put the same cloud in the same place on the plaza and at BelVar.
     * These are **discrete** fair-weather cumulus instead: seeded slots on a
     * ring, perspective-sized, each a smooth union of dome puffs cut flat at
     * its base, with a one-texel edge, white tops under the clip line and a
     * base no darker than the haze.
     *
     * **The band is measured, not guessed.** The chase camera draws 64.74°
     * vertically with the horizon on row ≈ 410 of 1080 (pitch ≈ 8.7° down),
     * so its top edge is at 23.7° elevation mid-frame and **16.9° in the top
     * corners**. `topDegrees` 16 keeps every cloud clear of the frame top
     * everywhere; `baseMinDegrees` 10 puts every base above the rooftop haze
     * band of a typical street (distant roofs at ≈ 5–8°, and the band is the
     * 40 sky rows over them, ≈ 2.5°).
     */
    cumulus: {
      /** Slots around the full 360° ring; each may hold one cloud, jittered across its slot. */
      count: 16,
      /** The chance a slot holds a cloud: ≈ 10 on the ring, 1–4 in a 97° frame, uneven gaps. */
      fill: 0.62,
      /** The lowest and highest base elevation, degrees. */
      baseMinDegrees: 10,
      baseMaxDegrees: 12.5,
      /** No cloud top above this, degrees — under the frame's 16.9° top corners. */
      topDegrees: 16,
      /** Width at the lowest base, degrees; ×tan(base)/tan(baseMin) higher up. */
      widthMinDegrees: 4.5,
      widthMaxDegrees: 16,
      /** Dome height / width. */
      aspect: 0.42,
      /** Domes in a cloud's lower course (a middle course of 60 % and 1–2 turrets are added). */
      puffs: 6,
      /** Cauliflower relief on the upper edge, share of the cloud's height. */
      billow: 0.06,
      /** Bumps per cloud height along that edge. */
      billowFrequency: 3.2,
      /** Edge half-width, degrees: half a 2048 texel (0.176°), so crisp but anti-aliased. */
      edgeDegrees: 0.09,
      /** Sunlit tops, sRGB hex: luma ≈ 247, under the clip gate's 250. */
      litColour: 0xf5f7fb,
      /** The flat base, sRGB hex: luma ≈ 214, over the daylight haze's 210. */
      shadeColour: 0xccd7e5,
      /** How far the base band falls toward the base colour. */
      baseShade: 0.7,
      /** The least sun a face keeps: a back-lit body stays pale (no grey core). */
      lightFloor: 0.45,
      /** Aerial perspective: the lowest (farthest) clouds take this share of the haze. */
      haze: 0.15,
      /** Fair-weather cumulus is opaque. */
      opacity: 1,
    },
  },

  /**
   * Material response and specular AA (§2.2, §3.3, T11). Roughness floors
   * stop the new glossy glass, metal and water sparkling at 60–120 m.
   */
  specular: {
    glassRoughness: 0.10,
    glassF0: 0.04,
    glassRoughnessFloor: 0.08,
    metalRoughnessFloor: 0.35,
    /**
     * Glass reflecting *below* the horizon keeps this share of it (Wave 3,
     * R-L). Street-level panes look down, so they mirror the environment's
     * lower half — the ground bounce × β, a lifted grey brighter than any real
     * street — and at `glassSpec` that washed the ground-floor glazing out
     * (round 1, pair-13). Upper windows reflect the sky and are untouched.
     */
    glassGroundReflect: 0.4,
  },

  /**
   * The hazard-read families (Wave 3, R-L; A11's obstacle-face gate): what a
   * rider must read *as an obstacle* keeps High's dark face against the
   * ground. Round 1 measured the plaza bollards lifted from 22 to 46 luma —
   * painted metal reflecting the painted sky — and the mood keeper and hawk
   * read them as lower-contrast. `envResponse` is the share of the
   * environment (diffuse fill and reflection) these materials take; the sun
   * and its shadow are untouched. Props: the bollard finial and the tyre
   * stack (`ULTRA_HAZARD_READ_PARTS`); the bollard posts and barriers are
   * collider blocks and take the same argument in the block family.
   *
   * Per part, measured against u0-high (obstacle face luma against the
   * adjacent ground ring, Weber): the painted-metal finial reflects the sky
   * and needs 0.4; the rubber stack only takes the diffuse fill, and at 0.4 it
   * fell back to High's 21-luma black box (round 1 counted that a High
   * defect), so 0.7 keeps its form at ≥ 0.9 × High's contrast.
   */
  hazardRead: {
    bollardCap: 0.4,
    tyreStack: 0.7,
  },

  /**
   * Foliage response beyond the two live values (pre-R1 calibration,
   * `M39_ULTRA.md` §U2). Construction constants, read by the foliage patch.
   */
  foliage: {
    /**
     * Sky light through the canopy: foliage takes this multiple of the
     * environment's diffuse fill. Leaves are thin and a crown is mostly gaps,
     * so a canopy's shaded side sees the sky through itself — which is why a
     * tree in shade is a readable green mass and not a black hole. At 1 the
     * crowns' self-shaded halves measured 33–40 luma (§8.3 wants ≥ 45); 1.5
     * left four views at 41–45; 1.75 passed every view, and 2.0 lifts the
     * conifers standing in building shade (industrial yard, about 31 luma)
     * over the frame's dark threshold. Indirect only, so a tree in building
     * shade gains exactly as much as its fill and no more: the crown-in-shade
     * / shaded-facade ratio (≤ 1.3, "no glow"; 0.3–0.8 measured at 1.75) is
     * the ceiling this number answers to.
     */
    skyFill: 2.0,
    /**
     * The back-light lobe's exponent: `pow(sat(V·−L), p)`. 4 at W4 hid the
     * rim unless the camera looked almost straight into the sun; 2 lets
     * Switchback's low warm sun rim the conifers across a wider arc. Still
     * inside the shadowed direct term, so still never in shade.
     */
    transmissionPower: 2,
    /**
     * Foliage's own near-map filter (Wave 3, R-L): a fixed 3×3 tent of
     * hardware-PCF fetches this many texels apart, in place of three's five
     * taps turned per pixel by interleaved-gradient noise. On the serrated
     * conifer tiers that dither drew blotchy teeth that crawled in motion
     * (round 1: pair-04, motion-01/04/05). At 2.5 texels (6.7 cm on the 4096
     * map) the tent's footprint is about ±9 cm, so a tier's shade under the
     * one above is one soft band; it is fixed, so it holds still.
     */
    shadowSpreadTexels: 2.5,
    /**
     * Foliage's receive bias along the light, metres (Wave 3, R-L): a leaf
     * surface is not shadowed by occluders within this distance of it along
     * the sun ray. It removes the self-shadow of a tier's own teeth and facet
     * creases — which is what speckled — and keeps the shade of the tier above
     * (its tooth tips hang about 0.5 m over the tier below's cone, more along
     * a 33–55° ray), of other trees and of buildings. For R-F's serration: any
     * tooth relief under this depth no longer self-shadows at all.
     */
    receiveBiasMetres: 0.15,
  },

  /**
   * Facades (T4, §4): companion normal + ORM pages on `FACADE_PAGES` with
   * painted mips and a Toksvig roughness rise, the Ultra albedo copy's
   * anisotropy, per-region roughness, and the metric base AO on indirect.
   */
  facade: {
    /** Normal and ORM page edge, texels (2 × 5.6 MiB with mips). */
    mapSize: 1024,
    /** Gutter around each page rect, texels, copying its edge so mips never bleed. */
    gutterTexels: 16,
    /** Albedo anisotropy = min(this, the device's maximum). */
    anisotropyCap: 16,
    wallRoughness: 0.92,
    spandrelRoughness: 0.85,
    plinthRoughness: 0.9,
    /** Base AO `mix(baseAoFloor, 1, smoothstep(0, baseAoMetres, h))`, indirect only. */
    baseAoFloor: 0.70,
    baseAoMetres: 2,
    /**
     * The facade's own receive (Wave 4, R-L; gauntlet round 2 item 6). At a
     * grazing sun (the residential block's street face, N·L ≈ 0.1) three's
     * dithered five-tap penumbra of the shopfront soffit's shadow is smeared
     * down the recessed band as vertical combing, and PCF taps that straddle
     * the soffit's own edge a few centimetres off drew serrated teeth along
     * the first-floor ledge (3 critics). Facades therefore take the ground's
     * fixed disk at the live `nearRadius`, and:
     *
     * - `receiveBiasMetres`: a receive bias along the light. A face is not
     *   shadowed by occluders within this distance of it along the sun ray.
     *   Every real facade shadow comes from farther: the soffit sits 0.25 m
     *   (`relief.revealDepth`) proud of its band along any ray, and a cap's
     *   groove step 0.08 m (`relief.capGrooveDepth`).
     * - `slopeNormalScale`: the near rig's normal offset × (1 + k·(1 − N·L)),
     *   slope-scaled, so a grazing face looks up its shadow a little farther
     *   off its own surface.
     * - `nlFade`: the sun faded to form shade as N·L falls from the second
     *   number to the first, so the last few per cent of a grazing face's sun
     *   (where a shadow texel smears across a metre of wall) cannot comb.
     */
    receiveBiasMetres: 0.06,
    slopeNormalScale: 1,
    nlFade: [0.02, 0.12],
    /**
     * The facade disk's radius is the live `nearRadius` × (`spreadScale` +
     * `grazeSpread` × (1 − smoothstep(0, 0.5, N·L))). A caster edge's
     * one-texel stair steps stretch ≈ 1/(N·L) down a wall: at the rig's own
     * 1.25 texels the commercial soffit's shadow line kept small regular
     * teeth (N·L ≈ 0.55), and on the residential block the sun grazes
     * (N·L ≈ 0.1) the comb went but streaks stayed; at 2 texels (× 1.6) the
     * soffit's teeth were softer but still there. 2 × 1.25 = 2.5 texels on a
     * face the sun meets, up to 3.5 as it grazes; the 16 taps stay about
     * 1.5 texels apart at most — at radius 4 they sat 1.8 apart and the
     * stair steps came back as separate stripes (measured). Both scale the
     * live radius, so the planted `nearRadius 0` still stair-steps.
     */
    spreadScale: 2,
    grazeSpread: 0.8,
    /**
     * The facade's cast-shade lift (final wave, P-LT; round 3 item 4): where
     * a sun-facing facade is in cast shade, its indirect diffuse is
     * × (1 + this × shade), a floor at about the facade's form shade instead
     * of a dark patch (the slice's crown-shaped "lump" on its plinth: core
     * luma 46 → 70, against 107 sunlit and the view's form-shade mean of 69).
     * Only shade from casters more than `liftCasterMetres` up the sun ray
     * lifts (the near map compared that far nearer the sun), so the facade's
     * own relief — a soffit's line, a reveal, a cap groove — keeps its
     * darkness (`ultraMaterials.ts` `FACADE_CAST_LIFT`).
     * A construction constant, baked into the patch text.
     */
    castShadeLift: 1.0,
    /**
     * The facade lift's caster test, metres along the sun ray: shade from an
     * occluder nearer the wall than this is the wall's own relief and does
     * not lift. Over a soffit's or reveal's reach at a moderate sun (0.25 m
     * proud: well under a metre along the ray), under the few metres from a
     * plinth to a street tree's crown or to the next building.
     */
    liftCasterMetres: 2,
    /**
     * The facade disk's distance ramp (final wave, P-LT; round 3 item 4):
     * past `farRampMetres[0]` of view distance the radius grows, by
     * `farRampMetres[1]`, to `farSpreadTexels` at the shipped `nearRadius`
     * (a multiple of the live radius, so the planted radius 0 stays hard) —
     * the ground's aerial softening of a shade edge (`nearFilter`), so a
     * crown's shade that runs from the grass up a plinth 55 m off keeps one
     * softness instead of turning crisp on the wall. It starts at 30 m, past
     * the residential recess and the commercial soffit Wave 4 measured
     * (23–27 m), which stay exactly as they were.
     */
    farSpreadTexels: 12,
    farRampMetres: [30, 60],
  },

  /**
   * Geometric relief (T4, §4), all metric through the `ultraRelief` attribute
   * and all **inward only**, so every vertex stays inside the collider box and
   * `BUILDING_CLEARANCE`, and mirrored in `customDepthMaterial`.
   */
  relief: {
    /** Ground-floor shopfront pane set back from the facade, metres. */
    revealDepth: 0.25,
    /** Building-cap vertical-edge chamfer, metres. */
    capChamfer: 0.15,
    /** Cap groove: this far below the top, metres … */
    capGrooveDrop: 0.3,
    /** … and recessed this far, metres. */
    capGrooveDepth: 0.08,
    /** Roof-gable eave fascia depth, metres. */
    eaveFascia: 0.25,
    /** Tile courses as a world-metric slope stripe: pitch, metres … */
    tilePitch: 0.35,
    /** … ± tone share … */
    tileTone: 0.05,
    /** … faded out by `fwidth` past about this distance, metres. */
    tileFadeMetres: 40,
  },

  /**
   * Ultra forms (T3, T7, §4). Envelopes are `data/props.ts`'s and are never
   * restated here; these are the shape budgets and tones the builders start
   * from. Integer hashes only, with the new salts 13, 17, 19, 23, 29, 31.
   */
  forms: {
    crown: {
      /** Merged icosphere(1,1) lobe clusters, fitted uniformly into `CROWN_ENVELOPE`. */
      lobeClusters: 5,
      /** Normal softening toward the radial direction; faceting kept. */
      soften: 0.5,
      /** Chromatic tones, normalised per channel to a mean of exactly 1.0. */
      tipTone: [1.14, 1.18, 0.86],
      hollowTone: [0.84, 0.90, 1.04],
    },
    conifer: {
      tiers: 6,
      sides: 9,
      /** Vertices around each serrated rim. */
      rimVertices: 18,
      tipTone: [1.12, 1.15, 0.90],
      skirtTone: [0.82, 0.88, 1.05],
    },
    trunk: {
      sides: 8,
      /** Root flare, metres (trunk r ≤ 0.30 m by the envelope). */
      rootFlare: 0.30,
      /** Branch stubs, each ending inside the crown. */
      branchStubs: 2,
    },
    tyre: {
      tori: 4,
      radialSegments: 12,
      tubularSegments: 6,
    },
    bench: {
      seatSlats: 4,
      backSlats: 3,
    },
    /** New integer-hash salts (3, 5, 7, 9 and 11 are in use). */
    salts: [13, 17, 19, 23, 29, 31],
  },

  /**
   * Analytic contact AO (T5, §4): per heightfield corner, from `plan.props`
   * and colliders through a spatial hash so shared corners agree. The product
   * of every occluder's term is darken-only and clamped at `floor`.
   */
  contact: {
    floor: 0.55,
    /**
     * Band, metres, and strength per occluder class.
     *
     * **Building 0.40 → 0.22 (Wave 3, R-G; gauntlet round 1 item 9):** at 0.40
     * the footprint band drew a black strip along wall bases (the blue house on
     * the residential view) and, over the grass and brick at canyon wall feet,
     * carried most of the share-under-32 fails. 0.22 keeps a readable contact
     * line at the wall foot without the crush.
     */
    building: { band: 2.5, strength: 0.22 },
    /**
     * The share of the analytic contact AO the ground's *non-road* surfaces
     * take on direct light (Wave 4, R-G; A18, round-2 item 10: "baked contact
     * occlusion where the ground meets buildings, walls, trees and props",
     * three of five critics). Applied by the ground patch alone, on top of
     * the shared `contactDirectShare` (0), and never on the rank-1 road
     * (`ULTRA_ROAD`), so the sunlit road cannot darken; the two together stay
     * within §3.3's 0.3.
     */
    groundDirectShare: 0.15,
    /** Walls and blocks: band = min(bandMax, bandHeightShare × height). */
    wall: { bandMax: 1.2, bandHeightShare: 0.8, strength: 0.35 },
    /** Crown canopy disc — sky occlusion under the tree. */
    crown: { band: 2.45, strength: 0.22 },
    trunk: { band: 1.0, strength: 0.35 },
    shrub: { band: 1.3, strength: 0.30 },
    tyre: { band: 0.8, strength: 0.35 },
    fence: { band: 0.35, strength: 0.20 },
    /** Lamp, bollard, bin and sign. */
    furniture: { band: 0.5, strength: 0.25 },
    /**
     * The dynamic contact occluders (coordinator amendment A9; Wave 3, R-G):
     * the rider's wheel and body footprint, and the cop's when he is out, fed
     * every solo frame from `ultraRuntime.ts` as the shared uniforms
     * `ultraContactPoints` (x, z, radius, strength) / `ultraContactCount` and
     * read by the ground patch alone. In cast shade only indirect light is
     * left, so nothing static can ground a moving rider there — five of five
     * round-1 critics called the canyon rider "ungrounded". Each occluder is
     * `1 − strength·(1 − t²)²` at `t = d / radius` (soft centre, zero slope at
     * the rim, so no halo line), the product clamped at `floor`, on indirect
     * light and on `directShare` of the direct.
     */
    riders: {
      /**
       * Round the tyre's contact patch. It too keeps only `sunShare` of its
       * strength outside static shade (Wave 4), where the tyre's own cast
       * shadow is its contact line.
       */
      wheel: { radius: 0.6, strength: 0.6, sunShare: 0.125 },
      /**
       * Round the rider's pelvis, projected to the ground: the body's sky
       * occlusion. **Directional (Wave 4, R-G; A15, round-2 item 1c):** a
       * round pool read as "only a blob" to four of five round-2 critics in
       * the canyon. It is stretched `stretch` × `radius` along the sun's
       * ground azimuth and `across` × `radius` across it, its centre
       * `downSunMetres` down-sun of the pelvis — so it reads as the rider's
       * shade, pointing the way his cast shadow does in sun. It keeps
       * `sunShare` of its strength where no static shade lies (the far map):
       * in sun his real cast shadow grounds him, and a whole pool along it only
       * deepened it (0.17–0.21 × the sunlit road against High's 0.26–0.31).
       * **Final wave (P-GR; A20, round-3 item 1b):** still "a blob" to five
       * of five round-3 critics — the Wave-4 ellipse (2.1 m along, 0.84 m
       * across, 0.5 m down-sun) lay almost centred on the rider. Now a streak:
       * 1.9 m along and 0.47 m across, centred 1.05 m down-sun, so it runs from
       * just behind the wheel to about 3 m out along his shadow's azimuth,
       * denser (0.45, and the wheel's core 0.6); in sun each keeps no more
       * than Wave 4's darkening (`sunShare` × strength 0.06 and 0.075), so the
       * rider's cast shadow stays at High's value (0.25–0.29 × sunlit).
       * **A28:** this streak is the pool's *sun* shape only; in static shade
       * it gives way to `shade` below (and the wheel's to its own round core).
       */
      body: {
        radius: 1.05, strength: 0.45, stretch: 1.8, across: 0.45, downSunMetres: 1.05, sunShare: 0.13,
        /**
         * **The body's pool in static shade (A28, Trade 1; Codex's post-GU
         * QA, five of five round-4 critics: "a formless, diffuse down-sun
         * streak").** Where a building or a tree shades the ground there is
         * no sun, so the streak above has no business there: the ground
         * patch weighs the streak by `sunShare × (1 − shade)` and this
         * compact, round pool by `shade` (the static shade the lift finds at
         * each ground point), so in a canyon the contact sits under the wheel
         * and feet and at a shade edge each point blends continuously back to
         * the sun shape. `radius` in metres, `strength` as the others;
         * centred `towardPelvis` of the way from the wheel's contact to the
         * pelvis's ground point, so it follows a lean. Measured (scratchpad
         * `codexqa/vr`): with the wheel's core (0.6 m, 0.6) it reads as one
         * soft oval pedal to pedal and about 0.9 m either side of the wheel,
         * darkest under the tyre; the ring round the rider keeps its median
         * (the separation row's ground, 92.44 luma at lift 2.1, unmoved).
         */
        shade: { radius: 0.8, strength: 0.3, towardPelvis: 0.5 },
      },
      /** The product never darkens below this. */
      floor: 0.4,
      /**
       * Share of the occlusion applied to direct light. Small: in sun the
       * rider's real cast shadow grounds him, and a large share would draw a
       * blob on the sunlit side.
       */
      directShare: 0.06,
      /** The wheel's height above the ground, metres, over which both occluders fade out (a hop, a jump). */
      liftFade: [0.12, 1.1],
      /** The pelvis's height above the ground, metres, over which the body occluder fades (a ragdoll in flight). */
      bodyLiftFade: [1.5, 2.6],
    },
  },

  /**
   * Shade on up-facing ground (coordinator amendment A7; Wave 3, R-G). The
   * painted-sky fill alone left a canyon road in building shade at about
   * 0.30 × the sunlit road — the near-black "hole, pit or oil" all five
   * round-1 critics named and both hawk vetoes rested on. A7 wants large cast
   * shade on the road at 0.45–0.62 × sunlit, sunlit road untouched and the
   * rider's own shadow no lighter than 0.45 × sunlit.
   *
   * The ground and block patches therefore scale **indirect diffuse** by
   * `1 + lift·shade·up`, where `shade` is where the sun is shadowed (the
   * patched `getShadow`'s visibility × a steep N·L ramp, exactly the fill's
   * own "sun share") **and** the static far map says a building or tree
   * casts there, and `up` is how up-facing the face is. The far-map gate is
   * what keeps the rider's own shadow (and a lamp post's, a fence's) at its
   * High darkness: the far map holds only static casters, never a rider, so
   * only large static shade lifts. On a rung with no far map every shade
   * lifts. Sunlit ground has `shade` 0 and is untouched to the bit.
   */
  shade: {
    /**
     * Indirect diffuse × (1 + lift) in full static shade on an up-facing face.
     * Measured (Wave 3, R-G; cast shade on the road over High's sunlit road,
     * same view): 0 → 0.31 (commercial canyon, industrial slab), 1.6 → 0.65
     * on both — over A7's 0.62 ceiling and a canyon that read overcast. 1.05
     * sat in the band's middle (see `M39_ULTRA.md` §U2 "Wave 3 — R-G"), and
     * still read as dusk: low *and* blue (road B/R 1.27).
     * **1.3 (Wave 4, R-G; A14's 0.50–0.70 within 30 m):** with the lifted
     * share warmed (`liftWarmth`) the canyon measures 0.588 × its sunlit road
     * at B/R 1.11, the industrial crest 0.605 (≤ 30 m) and 0.59 (30–45 m).
     * This is the lift at the camera; `liftFar` takes over with distance.
     * **1.7 (final wave, P-GR; A20, round-3 item 1a):** 0.588 read gloomy or
     * overcast to five of five round-3 critics, and the dark suit sank into
     * the road; A20 aims the canyon at 0.66–0.68. Measured (scratchpad
     * `pgr/c4`): the canyon ≤ 20 m 0.663 × its sunlit road at B/R 1.10, the
     * rider's absolute separation 0.56 → 0.64 × High's, the kerb band still
     * ≥ High's (0.685 against 0.673), the obstacle rows unmoved (the lift
     * stays tall-caster-gated).
     * **Live on F4 (final touch, post round 4)** as `ULTRA.shade.lift`, the
     * shared `ultraShadeLift` uniform: the owner's Trade 1(b) lever.
     * **2.1 (A28, Codex's post-GU QA; Trade 1 reopened):** the near street
     * shade may rise to 0.70–0.76 × sunlit while it still reads as shade, and
     * helps the rider's separation. Measured (scratchpad `codexqa/vs`): the
     * canyon ≤ 20 m 0.663 → 0.738 × its sunlit road, B/R 1.103 → 1.089; the
     * kerb band held over High's by `surfaceShare.brick` (the raise alone put
     * it at 0.668 against 0.673: a quarter of that band is sunlit, the road
     * beside it is not); the obstacle and rider-shadow rows unmoved (the lift
     * stays tall-caster-gated).
     * **2.2 (A28, Fable F-A2; builder FR):** the rider may no longer buy his
     * separation with a black body (`ULTRA.rider.shadeLight`), so the street
     * carries more of it, inside A28's 0.76 ceiling. Measured on commercial
     * (scratchpad `codexqa/fr`): **2.2 → the canyon 0.755 × its sunlit road,
     * B/R 1.085, the kerb band 0.684 (High 0.673), 20–35 m 0.757 against its
     * 0.769 ceiling**, the far bands unmoved; 2.22 gave 0.758, too close to
     * 0.76 (and off the F4 slider's grid). Elsewhere the change is under two
     * levels but for 18 pixels. Both A28 rider rows cannot pass at once
     * inside 0.76 (see `ULTRA.rider.shadeLight`).
     */
    lift: 2.2,
    /**
     * A14's aerial perspective of shade (Wave 4, R-G; round-2 item 2a): the
     * lift rises from `lift` to `liftFar` as the view distance goes over
     * `liftDistance` (metres, smoothstep), so a distant slab of cast shade
     * reads lighter than the shade at the wheel — as fog does to everything
     * else — and never as a hole (the industrial crest, 5/5 round-2 critics).
     * A14 holds cast shade within 30 m at 0.50–0.70 × the sunlit road and lets
     * it ramp to ≤ 0.80 by 80 m; the ramp starts at 10 m and stays under that
     * rising ceiling (measured: the commercial far band 0.68 at 51 m against
     * 0.74, the industrial crest 0.59 at 33 m against 0.71).
     * **2.2 over [20, 36] m (final wave, P-GR; A20, round-3 item 2):** A20
     * holds the first 20 m at the near band and lets the lift ramp from there
     * to about 0.75 by 35 m and ≤ 0.80 by 80 m, so the industrial crest slab
     * (27–33 m; "oil, pothole or hole" to five of five critics) reads as
     * distant shade. Measured (`pgr/c4`): the slab 0.70 over 20–35 m (0.725 at
     * 30–35 m) against the ramp's 0.73; the commercial far bands 0.74–0.75 at
     * 45–57 m against 0.76–0.77. A steeper or higher ramp broke the commercial
     * 50–65 m ceiling, where fog already lifts the ratio.
     * **Live on F4 (final touch)** as `ULTRA.shade.liftFar`, the shared
     * `ultraShadeLiftFar` uniform: the owner's Trade 2(b) lever.
     * **2.5 over [20, 30] m (A28, Trade 2 reopened):** the crest slab
     * (27–36 m, "oil or wet patch" to the hawk in every round) paler, at
     * 0.76–0.82 × sunlit, and — with the ground filter's screen kernel
     * (`nearFilter.groundScreen*`) — graded rather than cut. Measured
     * (scratchpad `codexqa/vs`): the slab 0.720 → 0.797 over 27–36 m; its
     * edges' 10–90 % widths 0.8 → 4.4 px (near) and 2.2 → 7.0 px (far). A28
     * amends A20's gate ramp to match (`tools/ultra-metrics.mjs` `A14`: 0.76 at
     * 20 m, 0.82 at 35 m, 0.85 at 80 m); the commercial far bands read 0.81 at
     * 45 m and 0.80 at 57 m under it (A20's 2.2 over [20, 36] left them 0.75).
     * **2.2 over [20, 36] m again (A29, round 5):** the paler, graded slab
     * came out worse than U5's on every count (richer 5/0 → 3/2, reads slower
     * 2/5 → 4/5, score preference 5/5 → 1/5), read by all five critics as "a
     * floating smudge with no caster", so Trade 2 reverts to U5: these values,
     * the screen kernel off (`nearFilter.groundScreenKernel`), and the slab
     * row back on A20's ramp (`tools/ultra-metrics.mjs` `A29`). With `lift`
     * at A28's 2.2 the two amounts are now equal, so the lift is 2.2 at every
     * distance; U5's slab (under `lift` 1.7) ramped from about 1.9 at 27 m to
     * 2.2 at 36 m. See `M39_ULTRA.md` §U2 "A29".
     */
    liftFar: 2.2,
    liftDistance: [20, 36],
    /**
     * The share of the lifted light that takes the ground bounce's hue rather
     * than the sky fill's (A14; round-2 item 1a). The lift had multiplied the
     * sky-blue fill, so the lifted canyon stayed blue — B/R 1.27 on the road,
     * read as dusk or overcast by five of five critics. The lifted share is
     * light off the sunlit street and facades, so it takes the environment's
     * own down-facing irradiance hue (the look's `groundBounceColour` × β):
     * A14 wants shaded-road B/R ≤ 1.12 (High's sunlit road 1.06). At 1 the
     * canyon went neutral grey (B/R 1.045) and the frame's chroma fell under
     * High's (0.0156 against 0.0175); 0.65 keeps a trace of the sky's blue:
     * B/R 1.11, chroma 0.0178.
     * **0.6 (final wave, P-GR):** at `lift` 1.7 the warmed share is most of
     * the canyon's light, so 0.65 left it B/R 1.09 with the frame's chroma
     * level with High's (0.0175 against 0.0175); 0.55 gave 1.116 against the
     * 1.12 ceiling; 0.6 gives B/R 1.10 and chroma 0.0181 (`pgr/c4`).
     */
    liftWarmth: 0.6,
    /**
     * A28, Trade 3 (and Trade 1's kerb): the lift's share by ground surface —
     * a multiplier on `lift`/`liftFar` for each detail kind (`GROUND_DETAIL_KIND`
     * in `ultraGroundDetail.ts`), taken per material and, across a filled band
     * edge, blended by the edge field's cover toward the filling surface's.
     * The road, wood and the spill (kind none) and the dirt trail keep the whole
     * lift, so rank-1 road stays exactly at A20/A28. Road paint and block tops
     * keep the whole lift as well. It takes the lift's *cast* part only: a
     * bank's form shade (`selfShadeShare`) keeps its lift.
     *
     * - **Turf (grass, gravel verges) 0.4:** tree shade on the slice's grass
     *   read weak at 0.47 × the sunlit grass (High 0.21; three round-4 critics,
     *   "slightly floaty"); A28 aims at about 0.30–0.40. Measured: the slice
     *   0.474 → 0.357 (the `tree shade on turf` gate row).
     * - **Brick 1.1:** the kerb band. Trade 1's raise lifts the whole
     *   commercial road but only three quarters of its kerb band (the rest is
     *   sunlit), so kerb/road fell under High's (0.668 against 0.673); a
     *   little more lift on shaded brick holds it (0.689 at 1.1, 0.710 at 1.2).
     */
    surfaceShare: { grass: 0.4, gravel: 0.4, dirt: 1, brick: 1.1 },
    /**
     * View distance, metres, over which a share under 1 (turf) comes in from
     * the whole lift. At 0.4 all the way in, the vegetated bank's conifer
     * shade 6–18 m from the camera fell to 23–31 luma over 44k px — the
     * near-black band the final touch had lifted — and the town's share < 32
     * gate read 0.0325 against 0.03. The slice's tree shadows lie 21–36 m out.
     */
    surfaceShareMetres: [8, 20],
    /**
     * The tall-caster test (A14; round-2 item 5), metres: only shade from a
     * static caster taller than this lifts. Kickers, boxes, steps, bollards,
     * benches and shrubs (≤ 2.2 m) keep their cast shadow at High's darkness;
     * buildings and trees (crowns from 3.1 m) lift. See
     * `ultraShadeLiftDeclarationsGlsl` for how the far map answers it.
     */
    tallCasterMetres: 2.5,
    /** `up = smoothstep(a, b, n.y)` on the world normal: a block's top against its faces. */
    upFacing: [0.35, 0.85],
    /**
     * The same ramp on the ground, which has no walls: a bank is ground too.
     * At the blocks' ramp the vegetated view's 40° hillside, in conifer shade,
     * kept only half its lift and sat at luma 28–31 (share < 32 0.029).
     */
    groundUpFacing: [0.0, 0.5],
    /**
     * The lift's share on a face turned from the sun (N·L ≤ 0: a bank's form
     * shade), which the far map does not see because the heightfield never
     * casts. No rider's shadow can fall there, so it is safe to lift; less
     * than the whole lift, so a hill keeps its modelling. The vegetated
     * view's far bank sat at luma 27 (share < 32 0.029 of the frame).
     */
    selfShadeShare: 0.6,
    /** `static = smoothstep(a, b, 1 − farVisibility)`: how far-map shade gates the lift. */
    staticShade: [0.12, 0.55],
    /**
     * Collider blocks (item 7 of the round-1 list): vertical faces take this
     * share of the environment's diffuse fill. The fill's bright horizon and
     * β-lifted bounce had raised shaded step, kicker and bollard faces (the
     * Switchback kicker 30 → 58) until obstacles merged into the ground
     * around them. Tops keep the whole fill and take the ground's lift.
     */
    blockSideFill: 0.5,
    /**
     * …and this share of the environment's sky sheen. The plaza's metal
     * bollards reflected the painted sky from 23 to 42–46 luma against the
     * brick (High's are near-black posts), halving their contrast; a hazard
     * post must read as one before it reads as painted metal.
     */
    blockSideSpec: 0.4,
    /**
     * …and a block's top keeps this share of its sky sheen (the ground keeps
     * `groundSpec`, 0.5). High reflects no sky, so a step's top read a little
     * darker than the trail around it; at a grazing chase-camera view the
     * smoother deck wood caught enough painted sky to close that gap
     * (vegetated step tops 0.60 × High's contrast at the ground's 0.5). The
     * other way round, a top lighter than the ground around it (Switchback's
     * decks, BelVar's barrier) loses contrast as its sheen falls: 0.2 put
     * those at 0.78–0.79 and the vegetated steps at 0.90. 0.28 is inside
     * every view's ≥ 0.8 (measured, `M39_ULTRA.md` §U2 "Wave 3 — R-G").
     */
    blockTopSpec: 0.28,
  },

  /**
   * The rider, his wheel and the cop on the Ultra tier (coordinator amendment
   * A15; Wave 4, R-G; round-2 item 4).
   */
  rider: {
    /**
     * The share of the Ultra environment the rider, wheel and cop materials
     * take (`envMapIntensity = environmentIntensity × envResponse`, through an
     * explicit `envMap` — the same PMREM, the same cube-UV program — written
     * and restored exactly by `ultraRuntime.ts`). The whole painted sky lifted
     * the dark suit toward the ground behind it: on every daylight view the
     * rider's contrast against his ring was 0.57–0.86 × High's (plaza lowest),
     * and two round-2 critics read him "washed" or "veiled". A15 wants ≥ 0.9 ×
     * High in sun and ≥ 0.8 × High in shade on every view. No rim light, suit
     * colour, geometry, UV or animation change (invariant 8; A28 widens it
     * for `shadeLight` below only, in static shade).
     *
     * **0.56 (measured, Wave 4):** the rider's mean luma lands within about
     * 1.5 of High's on every view, and A8 reads 1.01–1.08 × High (the canyon
     * 1.02 in shade). The window is narrow at Switchback, where the grey suit
     * and the brown dirt are within ten luma at both tiers, so the ratio swung
     * 0.67–1.22 across the calibration captures (0.56 with the shipped pools:
     * 0.97). Lower darkens BelVar's rider past High's share < 32.
     */
    envResponse: 0.56,
    /**
     * **The rider's light in static shade (A28, Trade 1).** In a building's
     * or a tree's shade the suit sank into the road: 5/5 round-4 critics
     * read High faster on commercial, and the rider's absolute separation
     * was 0.640 × High's (rider 15.65 on 84.44 luma) against A28's 0.80.
     * Where the static far map says a caster shades a point *of the rider*
     * (per fragment, so a kicker's low shade reaches only his shins; never
     * his own shadow, which the far map never holds), the rider, wheel and
     * cop materials re-weight the environment toward the sky above them
     * (`ultraRiderShadow.ts`):
     *
     * - the diffuse fill × `mix(bodyKeep, skyGain, key)`, `key` a smoothstep
     *   of the world normal's y over `keyUp` — the helmet crown, shoulders,
     *   upper arms, a leaning back and the pedals catch the sky strip; the
     *   sides and underside keep `bodyKeep` of the painted environment, whose
     *   lower half is a *sunlit* street's bounce × β, not the shaded one
     *   around him;
     * - the sheen (the specular `radiance`) × `sheenKeep` where the
     *   reflection looks below the horizon (a smoothstep of its y over
     *   `sheenSky`), for the same reason: the rough suit mirrored the
     *   β-lifted bounce, a grey veil over the whole body.
     *
     * The sun, the albedo, the geometry and the animation are untouched, and
     * outside static shade the term is exactly 1 (the other nine views'
     * rider rows are unmoved). Measured on commercial (scratchpad
     * `codexqa/vr`, the separation row, median |ΔL|; High 107.42): lift 2.2
     * and no term 0.734 (rider 15.65); {0.55, 2.2, [0.2, 0.9]} 0.797
     * (8.87); {0.5, 3.2, [0.05, 0.75]} 0.779 (10.72, too wide a key);
     * {0.4, 4.5, [0.2, 0.7]} 0.807 at lift 2.2, 0.788 at lift 2.1 (7.79);
     * with the sheen at 0.4, 0.815 (4.86); **at 0.55, 0.813 (5.08) at lift
     * 2.1** (near shade 0.7395 × sunlit), the Weber row 1.107 × High. The
     * lit tops hold p90 ≈ 44 luma (High's sunlit suit 64), so nothing
     * glows. The ground ring is `ULTRA.shade.lift`'s: at this rider the row
     * reaches 0.80 once the near shade is ≥ about 0.727 × sunlit.
     *
     * **`bodyKeep` 0.4 → 0.8 (Fable 5.1's QA of A28, F-A2; builder FR).**
     * That 0.813 was bought mostly with a black body: rider median 15.65 →
     * 5.08 luma, p25 4.07, 58 % of his pixels under 8 — the legs, the lower
     * torso and the wheel one black mass. A28 now says separation may not be
     * bought with darkness, and the rider row carries a black-crush guard
     * (`tools/ultra-metrics.mjs`: p25 ≥ 10 luma in static shade; High's
     * sunlit rider 14.65). Measured on commercial (scratchpad `codexqa/fr`),
     * the sky key and the sheen cut kept: `bodyKeep` 0.75 → p25 9.79, median
     * 10.87, share < 8 10.2 % (separation 0.759 at lift 2.1); **0.8 → p25
     * 10.72, median 11.8, share < 8 8.3 %** (separation 0.769 at the
     * shipped lift 2.2, 0.779 at 2.22; the rider's pixels do not depend on
     * the lift). The shorts, calves and boots read apart from the wheel
     * shell again; Weber 1.037 × High, and in sun nothing changes. **The two rows cannot both pass inside A28's 0.76 street
     * ceiling, for any rider:** p25 ≤ median, so p25 ≥ 10 caps the median
     * separation at (ring − 10) / 107.42, and the ring at 0.76 × sunlit is
     * about 95.6 luma — 0.797 at most, 0.78 with this body's own median − p25
     * gap of about 1 luma. The separation row stays under 0.80 here; the
     * trade is the coordinator's (FR.md).
     */
    shadeLight: { bodyKeep: 0.8, skyGain: 4.5, keyUp: [0.2, 0.7], sheenKeep: 0.55, sheenSky: [-0.2, 0.3] },
  },

  /**
   * Fill-only corner edge fill (T6, §4) — the kill flag. A corner is filled
   * only where the other three cells around it are one outranking surface;
   * bands never lose a cell. Off drops the attributes and the patch.
   */
  edgeFill: true,

  /**
   * Brick paving joints (T10): running bond at the 2.8 m module in world XZ,
   * on `brick` only and never on a rank-1 (road) surface, faded by `fwidth`.
   */
  brickJoints: {
    moduleMetres: 2.8,
    /**
     * 0.02 at W6, kept (Wave 4, R-G): round 2's item 10 allowed about 3.5 cm
     * so the plaza's joints could be seen at chase distance, but measured it
     * cost the plaza strip's shimmer index 1.127 → 1.159, over the 1.15 gate
     * (the joints under the wheel stream across the screen). Widening them
     * needs a near-field fade-in in the shared joint GLSL first.
     * **0.035 (final wave, P-GR; A18, Fable I2)** with that fade-in
     * (`nearFadeFootprintMetres`): the joints under the wheel, which stream
     * across the screen, are not drawn; from a few metres out they are. The
     * plaza strip's shimmer index went 1.129 → 1.102 (`pgr/c4-strip`): the
     * near joints were what streamed. At ≤ 6 % darker they are still subtle.
     */
    jointMetres: 0.035,
    /**
     * The near-field fade-in (final wave, P-GR): a joint is drawn only as one
     * pixel's ground footprint grows from the first number to the second,
     * metres — so not under the wheel (about 0.01 m a pixel on the plaza's
     * chase view) and fully by a few metres ahead. Baked into the patch text.
     */
    nearFadeFootprintMetres: [0.014, 0.028],
    /** At most this much darker than the brick. */
    darken: 0.06,
    /**
     * The `fwidth` fade: a joint is drawn box-filtered (its coverage of the
     * pixel, so it never widens to a pixel-wide line), and fades out entirely
     * as one pixel's ground footprint grows from the first number to the
     * second, metres. Stability beats detail: past that the joints are sub-
     * pixel texture and would only shimmer.
     */
    fadeFootprintMetres: [0.08, 0.16],
  },

  /**
   * Collider blocks (T9): vertical-face base AO and plank courses on faces at
   * least `minFaceHeight` tall. Tops and lip edges are never touched, and
   * BelVar's barrier vertices stay byte-identical (attributes added only).
   */
  blocks: {
    minFaceHeight: 0.6,
    /** Base AO `0.75 → 1` over the bottom `baseAoMetres`. */
    baseAoFloor: 0.75,
    baseAoMetres: 0.6,
    /** Plank course height, metres … */
    plankCourse: 0.25,
    /** … and its ± tone share. */
    plankTone: 0.04,
  },

  /**
   * The Ultra ground's own surface (pre-R1 ground pass, `M39_ULTRA.md` §U2
   * "Pre-R1 ground (G)"): the smooth band-boundary edge field (T6 revised),
   * the painted per-surface detail maps and the smoothed turf normals. Built
   * by `render/ultra/ultraGroundDetail.ts` and `groundContact.ts`, which read
   * it as `ULTRA_GROUND`. Migrated here from that module's frozen table by
   * the stabilizer (2026-09-23), values unchanged. Construction constants,
   * read at build time; the road (pavement, rough pavement) never takes any
   * of it (§7.1 invariant 7).
   */
  ground: {
    /**
     * The smooth edge field (T6 revised). A band boundary is the taut line
     * through the corridor between the outranking band and `capCells` into the
     * lower surface: for a regular 1:n staircase, the straight line through
     * the band's convex corners while `n/(n+1) ≤ capCells`, a kneed ramp past
     * that, and one near-straight line through an irregular digital staircase
     * (see `groundContact.ts`, `edgeFillFor`).
     */
    edge: GROUND_BOUNDARY,

    /** The painted detail maps and the per-surface detail they feed. */
    detail: {
      enabled: true,
      /** Texel edges. Power-of-two, so the painted chain halves exactly. */
      grassSize: 512,
      stoneSize: 512,
      soilSize: 512,
      broadSize: 256,
      /**
       * Contrast kept per mip level of the fine maps (level 0 first; the last
       * entry repeats). Mean-preserving by construction (it scales deviations
       * from 127.5), it is what keeps sub-pixel blades and pebbles from
       * sparkling before the `fwidth` fade has taken them out.
       */
      fineRolloff: [1, 1, 0.85, 0.65, 0.45, 0.3, 0.2, 0.12, 0.06, 0],
      /** Blades a texel² of the grass map, their length and width in texels. */
      grassBlades: 0.075,
      bladeLength: [6, 15],
      bladeWidth: 1.25,
      /** Clump lattice cells across the grass map (mid-scale tufting). */
      grassClumpCells: 8,
      /** Pebble lattice cells across the stone map, and pebble radius as a share of a cell. */
      stoneCells: 32,
      pebbleRadius: [0.42, 0.74],
      /**
       * The soil map (packed trail dirt): value-noise undulation from this
       * lattice up (five octaves), and this many small stones a texel² pressed
       * into it, their radius in texels.
       */
      soilCells: 12,
      soilStones: 0.005,
      soilStoneRadius: [1.4, 3.2],
      /** Lattice cells of the broad map's three noise channels (R luma, G hue, B wear). */
      broadCells: [4, 3, 12],
      /** A channel is encoded so its decoded standard deviation is 1 / this (clipped beyond). */
      encodeSpread: 3,

      /**
       * Each sample's frame: period in metres and rotation in radians. Two
       * samples of one map at incommensurate periods and angles, averaged, so
       * no tile repeat reads across a lawn.
       */
      frames: {
        grassA: { period: 1.9, angle: 0 },
        grassB: { period: 3.1, angle: 0.7 },
        gravelA: { period: 0.9, angle: 0.3 },
        gravelB: { period: 1.37, angle: 1.9 },
        dirtA: { period: 3.3, angle: 0.45 },
        dirtB: { period: 5.1, angle: 2.2 },
        broadA: { period: 64, angle: 0.2 },
        broadB: { period: 157, angle: 1.4 },
        /**
         * The turf's mid-scale patches (Wave 3, R-G; round-1 item 12): one
         * more sample of the broad map at a riding-distance scale, so a lawn
         * or a bank breaks into lusher and drier drifts a few metres across
         * where the 64/157 m layers read as one flat plane from the chase
         * camera. Smooth and mipmapped: nothing in it can shimmer.
         */
        broadMid: { period: 13, angle: 2.9 },
        wearA: { period: 23, angle: 0.9 },
        wearB: { period: 37, angle: 2.6 },
        /** I2's metre-scale undulation (final wave, P-GR): the broad map's luma channel read as a height, one repeat per 14 m (features about 1–3.5 m). */
        undulation: { period: 14, angle: 1.1 },
      },

      /**
       * One scale on every *fine* term below — the slopes and the blade,
       * clump and pebble tones — leaving the low-frequency albedo alone. It is
       * the knob between surface texture and the §8.3 shimmer index: that
       * index is Ultra's frame-to-frame |Δ luma| in a rolling strip over
       * High's, and a textured ground streaming past at 8 m/s differs frame to
       * frame where High's flat tiles do not, aliasing or no aliasing (see
       * `docs/M39_ULTRA.md` §U2 "Pre-R1 ground (G)" for the measured split).
       * 0 keeps only the slow variation, which moves smoothly.
       *
       * **0 (coordinator amendment A10; Wave 3, R-G).** Two round-1 critics
       * saw the fine layer as grain crawling on the vegetated hillside and the
       * Switchback dirt, and it cost the shimmer index 1.24 and 1.91 there. A
       * near-field-only variant could not be shown to pass: Switchback's strip
       * reads 1.26 at 0 on its non-ground content alone. At 0 the fine terms
       * are not compiled at all; the low-frequency variation, the edge field
       * and the smoothed turf stay.
       */
      fine: 0,
      /**
       * Per-surface amplitudes. `slope` is the standard deviation of the world
       * slope the normal is tilted by; the tint terms are standard deviations
       * of a zero-mean multiplier (so ±2σ is the range the brief names).
       * `fade` is the pixel footprint in metres (the geometric mean of the
       * screen-space derivatives of world XZ) over which the fine layers
       * leave, so nothing sub-pixel is left to shimmer.
       */
      grass: {
        slope: 0.1,
        blade: 0.02,
        clump: 0.02,
        /** ±7 % at 2σ: the brief's ±6–8 % low-frequency variation. */
        lowLuma: 0.035,
        /** Olive ↔ blue-green: σ of the per-channel shift along the hue axis. */
        hue: [0.018, 0.004, -0.03],
        /** σ of the mid-scale drifts' luma (±10 % at 2σ) and of their hue (drier yellow-green ↔ lusher). */
        midLuma: 0.05,
        midHue: [0.02, 0.008, -0.025],
        /**
         * …faded in by pixel footprint (metres), so they live at riding
         * distance and not under the wheel, where the ground streams past
         * fastest: at full strength everywhere they cost the plaza strip's
         * shimmer index 0.012 (1.132 → 1.144 against the 1.15 gate).
         */
        midFade: [0.012, 0.035],
        /**
         * Tufts at riding distance (Wave 4, R-G; A18, round-2 item 10 — "grass
         * blade and colour noise", five of five critics): the grass map's blade
         * tone and clump field as albedo only (no slope), σ `rideBlade` /
         * `rideClump`, faded in by pixel footprint over `rideFade` (metres) so
         * the ground streaming under the wheel carries none of it — that is
         * where a world-locked pattern costs the shimmer index — and faded out
         * at distance by the map's own painted mip roll-off. Independent of
         * `fine`: at `fine` 0 this is the only term that samples the grass map.
         * Measured against the shimmer index: blades 0.02 + clumps 0.025 from
         * a 0.007–0.016 m footprint took the vegetated strip 1.064 → 1.138;
         * clumps alone at 0.02 from 0.015–0.04 m, 1.074.
         */
        rideBlade: 0,
        rideClump: 0.02,
        rideFade: [0.015, 0.04],
        fade: [0.008, 0.035],
        clumpFade: [0.03, 0.12],
      },
      /**
       * I2 (Fable; final wave, P-GR): a metre-scale undulation of the shading
       * normal on grass and gravel — never the road, the riding trail's dirt,
       * wood or a deck — so turf stops reading as flat faceted cells at chase
       * distance. `slope` is the standard deviation of the world slope it tilts
       * by (the broad map's luma channel as a height at `frames.undulation`, its
       * slope by forward differences, scaled from the painted map itself); it
       * fades out over `fadeMetres` of view distance and over `fadeFootprint`
       * of pixel footprint (metres), so nothing distant or grazing can shimmer.
       * Shading only: the shadow lookups keep the geometric normal.
       * Measured (`pgr/c3`, `pgr/c4`): at 0.08 the turf's luma moved by σ 2.2–2.9
       * (about 3 %), barely seen; at 0.14 the banks roll visibly and the shimmer
       * index holds (vegetated strip 1.083 → 1.100, Switchback 1.082, both
       * ≤ 1.15). The diamonds that still read as facets are the per-cell tint
       * (§4 keeps it), which a normal cannot remove.
       *
       * **Off: A25** (coordinator, 2026-09-23). §0.3 rejects grass normal
       * undulation, and the u4 capture showed it reading as smudges on the
       * vegetated bank. `slope` 0 compiles the term out of the ground GLSL
       * entirely (`undulationGlsl` / `undulationCall` emit nothing); the rest
       * of this block stays as the measured record of I2.
       */
      undulation: {
        slope: 0,
        fadeMetres: [12, 25],
        fadeFootprint: [0.08, 0.2],
      },
      gravel: {
        slope: 0.12,
        tone: 0.02,
        lowLuma: 0.02,
        fade: [0.015, 0.05],
      },
      /**
       * The riding surface at Switchback: relief only, low amplitude, and no
       * albedo term at all — the trail's mean luma gate ([56, 66]) is about
       * lighting, not paint.
       */
      dirt: {
        slope: 0.035,
        fade: [0.015, 0.07],
      },
      /**
       * Brick bands: slow wear blotches only. A fine grit was tried and cut —
       * on the plaza it tripled the near ground's frame-to-frame difference
       * for texture nobody reads at riding speed.
       */
      brick: {
        wear: 0.022,
      },
    },

    /**
     * Smooth-shaded turf slopes (optional, attribute-only): each heightfield
     * corner's normal on the grass banks and verges is the Gaussian mean of
     * its neighbours' within `radiusCells`, eased in over `rampCells` from any
     * other surface's corner, so the road, the riding trail, the decks and
     * every edge of them keep today's normals exactly.
     */
    smoothNormals: {
      enabled: true,
      radiusCells: 2,
      rampCells: 2,
    },
  },
} as const;

/**
 * The one-foot air pose's clock — M36 (`docs/PLANS.md` §36.5).
 *
 * The pose is *presentation*: `app/oneFootPose.ts` steps it once per fixed
 * step from the Hop control's held level and the controller's air facts, and
 * the shared rig draws it. Nothing physical reads these numbers — §36.5 makes
 * that a contract, and `app/oneFootPose.test.ts` proves it by digest — so this
 * block tunes when a held Hop *shows* and never what a hop *does*. Seconds
 * throughout; every one is spent against the fixed step, so a keyboard, a pad,
 * a phone and a scripted QA hold all measure the same dwell.
 *
 * The numbers are sized against the **shortest flight the machine makes**: an
 * uncharged standing hop leaves at `EUC.hopLaunchSpeed` and lands ~0.60 s
 * later (72 fixed steps, measured). Held from the press, the pose qualifies
 * 0.15 s after takeoff, is fully out by 0.25 s, holds until 0.15 s of air
 * remain (0.45 s), and is back on the pedal by 0.55 s with 0.05 s to spare —
 * so the plainest hop in the game carries a readable one-foot air rather than
 * only the charged ones. A charged hop (+40 % height, ~0.72 s) and Switchback
 * Park's kickers only widen that.
 */
export const ONE_FOOT = {
  /**
   * How long Hop must stay held **in the air** before any blend begins.
   *
   * This is what keeps a 180 tap from flashing a foot (§36.5: "a brief tap
   * does not produce a visible one-foot flash"). It is the same 0.15 s the
   * one-shot buffer holds a press for (`INPUT.actionBufferSeconds`), stated
   * separately because it means something different: a hold shorter than the
   * buffer *is* a press, a hold longer than it is a hold. Counted only while
   * the pose is eligible (airborne, not crashing, not counting down), so a
   * Space held from the ground reads the same dwell as one re-pressed in the
   * air, and the dwell restarts on every release. Not a delay on hopping or
   * spinning — neither reads it.
   */
  holdQualifySeconds: 0.15,
  /** The free foot's travel from its pedal to the full gesture, seconds. */
  enterSeconds: 0.10,
  /** The free foot's return to its pedal, seconds — the ordinary recovery. */
  returnSeconds: 0.10,
  /**
   * The least time the pose must be able to hold at full before it is worth
   * starting. With the two travels and the margin this is the *readable
   * window* a late request is refused against (§36.5: "if a late request
   * leaves no readable pose-and-return window, do not start it").
   */
  readableSeconds: 0.08,
  /**
   * Air kept in hand at the return, seconds.
   *
   * The controller's `secondsToTouchdown` is the closed ballistic form with
   * **no** margin — the ground it falls to is the ground under the wheel now
   * — and the fixed step lands within one step of it (measured worst 0.005 s).
   * Six steps here cover that quantisation and a landing that arrives a
   * little early on a rising face; a landing that keeps dropping away only
   * gives the pose more air, which it reads every step and spends.
   */
  touchdownMarginSeconds: 0.05,
  /**
   * The return when the pose is *suppressed* rather than released — the wheel
   * touched down with the foot still out (a prediction the ground broke), a
   * crash, a compression, a countdown. Faster than `returnSeconds` so the
   * grounded frame gets its pedal contact back inside the landing's own
   * absorb, and never an instant snap.
   */
  abortSeconds: 0.05,
} as const;

/**
 * Trick events — M36 §36.6. One number, and it decides one word: *full*.
 *
 * `simulation/trickEvents.ts` counts a charged hop only for a hop launched
 * with a full crouch charge, and §36.6 is explicit that a partial charge may
 * be diagnostic but must never round up into the tally. That leaves exactly
 * one judgement to make, and it is here rather than as a literal beside the
 * comparison because a threshold nobody can find is a threshold nobody can
 * move.
 */
export const TRICKS = {
  /**
   * The least captured crouch charge a hop must have spent to be a *charged*
   * hop, 0..1.
   *
   * **Not 1, and the missing hundredths are quantisation rather than
   * generosity.** `EucController.lastHopCharge` is `crouchHold /
   * EUC.hopChargeSeconds` with the hold clamped to the window, so a rider who
   * holds past the window reads exactly 1 — but the hold grows one fixed step
   * at a time, and a rider who presses on the same step the window closes
   * lands a step short of it. At the shipped 0.40 s window and the 1/120 s
   * step, one step is 0.021 of the charge; 0.95 forgives two of them and
   * nothing else. The half charge §36.6 calls diagnostic is 0.5, which is not
   * close to this, and a flick reads 0.
   */
  chargedHopMinCharge: 0.95,
} as const;

/**
 * The Trick Run — M38 §38.3. Every number the scoring referee reads, and the
 * only place any of them lives.
 *
 * **Proposed starting values, not measured balance.** §38.3 is explicit: these
 * are the values the owner rides against at G1, and the ride decides them. They
 * are here rather than beside the arithmetic in `simulation/trickRun.ts` for
 * `TRICKS`'s reason — a number nobody can find is a number nobody can move —
 * and they are **not** player options (invariant 5) and not F4 sliders: the
 * bench may evaluate an alternate rule object, a menu may not.
 *
 * `TRICKS.chargedHopMinCharge` stays where it is. It decides whether a hop
 * *was* charged, which is the observer's question; this group decides what a
 * charged hop is *worth*, which is the referee's, and the two must never be
 * one table.
 *
 * Points are integers. A flight's trick subtotal is
 * `round((distinct trick base points + eligible flight bonus) × landing
 * multiplier)`, rounded once, and the clean-landing award sits outside the
 * multiplier. At these values: a plain clean landing is 10, a charged clean hop
 * 41, a clean 180 with a one-foot air 448, the same two on a heavy landing
 * 350, and a crash 0 for that flight (§38.3's arithmetic examples).
 */
export const TRICK_RUN = {
  /**
   * The run's length in fixed steps — a count, never wall time, so a couch of
   * four shares one clock and `advance(n)` reproduces a run exactly.
   *
   * **Provisional (q182).** 10 800 steps is 90 s at `SIMULATION.hz`, the
   * middle of §38.8's 60/90/120 s trial candidates; Phase 0's measured
   * routed attempts choose the shipped value and the owner's ride confirms
   * it. A saved best carries the duration that produced it, so moving this
   * cannot compare unlike runs.
   */
  durationSteps: 10800,
  /** Banked once per surviving **clean** touchdown of a flight this run opened. */
  cleanLandingPoints: 10,
  /** A full-charge hop (the observer's `charged-hop`), banked only if that flight lands. */
  chargedHopPoints: 25,
  /** The observer's completed-and-landed 180. Never the controller's arming counter. */
  spinLandedPoints: 200,
  /** The observer's qualified-and-landed one-foot air, once per flight. */
  oneFootAirPoints: 100,
  /**
   * How many *distinct* trick kinds one flight needs for the flight bonus.
   * Charged hop, landed 180 and one-foot air are the kinds; a clean landing
   * is not a second trick for this test.
   */
  multiTrickMinKinds: 2,
  /** One bonus per qualifying flight. Three kinds earn the same single bonus. */
  multiTrickBonusPoints: 50,
  /** Landing multipliers on the flight's trick subtotal, by the controller's touchdown tier. */
  cleanMultiplier: 1.25,
  heavyMultiplier: 1.0,
  wobbleMultiplier: 0.5,
  /**
   * Diminishing repeats — the owner's q185 decision, revised to **per feature**
   * on 2026-09-14 (the fourth and final scoring decision of the milestone).
   *
   * **What a repeat is.** Landing a flight that launched from the **same
   * feature** as an earlier flight, within `repeatWindowSeconds` of that
   * flight banking. The first repeat pays `repeatDecay` of the whole flight
   * (tricks, bonus and clean landing together), the second `repeatDecay²`,
   * never below `repeatFloor`; the run of repeats fades one level for every
   * `repeatFadeSeconds` of rest since that feature last paid, and never
   * resets outright. Off the features is a "feature" of its own for this
   * clock, so flat-ground clean landings decay the same way. Everything is
   * timed on the run's own fixed steps, so a pause recovers nothing.
   *
   * **Why per feature and not per trick.** `docs/TRICK_BENCH.md` records the
   * road here: at the proposed values a rider who never moved out-scored the
   * routed line 37×; per-trick clocks (10 s, half then a quarter) closed
   * mindless spam but left a burst-then-rest farmer at 4×; fading instead of
   * resetting closed that but left a stander pacing one hop per window at
   * 4.9×; the launch gate (`featureLaunchRequired`) made flat ground worth
   * its landing alone — and Codex's follow-up found the same paced stander
   * *inside* a feature's zone still banking 4,032 in ninety seconds. Every
   * one of those clocks was keyed on the trick, and a trick is what a
   * feature and a stander have in common. The place is what they do not: a
   * routed lap revisits a feature once every ~90 s, so with a one-minute
   * window the honest rider is never docked (the per-trick clocks docked a
   * routed lap 33–56 %, because the timber corridor's three features sit
   * within forty metres), while camping one feature is worth about two
   * flights a run and rotating the corridor's three about five against the
   * lap's eight.
   *
   * **What that leaves open, measured by the blind QA pass (2026-09-14) and
   * pinned rather than decided.** The cap is two flights' worth *per feature*,
   * so it multiplies by however many features a stationary rider can reach:
   * the geometric sum is 896 points a feature at the measured 448-point
   * standing bundle, against a routed 90 s attempt's 1,363–1,457. Switchback's
   * `skinny` and `stepUp` zones are 1.8 m apart on one straight and `stairs`
   * is on the same corridor, so camping two of them banks 1,708 and three of
   * them 2,352 with no displacement worth the name. The pins are
   * `trickRun.qa.test.ts`'s two camping cases and `tests/m38-blind.spec.ts`;
   * a further scoring decision is the owner's and moves all of them with the
   * bench's camping rows.
   */
  repeatWindowSeconds: 60,
  repeatDecay: 0.5,
  repeatFloor: 0,
  /** Seconds of rest that forget one repeat level on a feature. Zero would reset on leaving the window. */
  repeatFadeSeconds: 60,
  /**
   * Feature identity — the owner's third q185 decision (q189, 2026-09-13).
   *
   * `1`: the three trick kinds and the flight bonus bank only on a flight that
   * **launched from one of the park's features** (`LevelPlan.trickZones`, the
   * feature's own half of its corridor to 1.5 m past the lip). The clean
   * landing banks anywhere. `0` turns the gate off, for the bench.
   *
   * Why the repeats were not enough: `docs/TRICK_BENCH.md` S3 measured a
   * rider standing still and hopping once every 10.5 s — just outside the
   * window, never docked — at 4,032 points in ninety seconds against the
   * routed line's 685–1,109, because the park's own feature clustering docks
   * the honest rider and a cadence rule cannot tell a stander from a rider.
   * Where the flight left the ground can. A flat-ground 180 or one-foot air
   * remains exactly as rideable as before; it is worth the landing and no
   * more.
   */
  featureLaunchRequired: 1,
  /**
   * How long the HUD's one-line award cue dwells, seconds. Frozen with the
   * run: a paused game does not step, so a cue does not age.
   */
  cueSeconds: 2.5,
} as const;

/**
 * Input semantics. Device bindings live in `src/input/bindings.ts`; only the
 * timing that shapes how an action *feels* belongs here.
 */
export const INPUT = {
  /**
   * How long a one-shot press stays available to be consumed, in seconds.
   *
   * Reading a one-shot as a held level drops a tap that begins and ends
   * between two fixed steps — worst at low frame rates, which is exactly when
   * the player is already suffering. The press is edge-latched and stays
   * claimable for this long, so a hop pressed just before the wheel touches
   * down still fires (master starter 8.1).
   */
  actionBufferSeconds: 0.15,

  // -- Gamepad (M9) -----------------------------------------------------------
  //
  // Device shaping, not ride tuning: these change how a stick's position
  // becomes an `ActionSnapshot`, and the controller downstream cannot tell a
  // pad from a keyboard from a Playwright spec. The dead zone is also exposed
  // as a player option, because it is the one number that depends on hardware
  // nobody but the player can see the condition of.

  /**
   * Radial dead zone on the left stick, as a fraction of full deflection.
   *
   * Sized for a worn pad rather than a new one: a stick that has been carved
   * with for a year rests around 0.1 off centre, and a rider who cannot let go
   * of the throttle blames the game, not the hardware. Radial and rescaled, so
   * the usable range still reaches 1.0 — see `input/gamepad.ts`.
   */
  gamepadStickDeadZone: 0.18,
  /**
   * Trigger dead zone, as a fraction of full pull.
   *
   * Much smaller than the stick's, because a trigger's resting position is
   * mechanically defined by a spring against a stop while a stick's is not,
   * and because the first millimetre of trigger travel is where fine throttle
   * control lives.
   */
  gamepadTriggerThreshold: 0.08,
  /** Stick deflection at which a menu direction fires. Well past the dead zone. */
  menuStickThreshold: 0.5,
  /**
   * Seconds a menu direction must be held before it repeats, and the interval
   * once it does.
   *
   * Long enough that a deliberate single step never double-steps, short enough
   * that holding down through a long options list does not feel stuck.
   */
  menuRepeatDelaySeconds: 0.42,
  menuRepeatIntervalSeconds: 0.14,

  // -- Touch (M11.5) ----------------------------------------------------------
  //
  // Device shaping again, and in **CSS pixels** rather than device pixels: a
  // thumb is the same size on every phone, so a travel expressed in device
  // pixels would be four times heavier on a dense screen than on a cheap one.
  // The player's control-size setting multiplies all of it, so a bigger drawn
  // control also gets a proportionally bigger throw — see `input/touch.ts`.

  /**
   * Thumb travel from touch-down to full lock, CSS px.
   *
   * Sized against a thumb, not a screen: an adult thumb pivots comfortably
   * about a centimetre and a half either side of where it lands, which is
   * roughly this at a typical phone's scale. Far enough that a gentle carve has
   * real resolution, near enough that full lock never needs the hand to move.
   */
  touchStickTravelPx: 84,
  /**
   * Slack around either axis at the floating stick origin, CSS px.
   *
   * A finger resting on glass drifts and a pressing thumb rolls. Deliberately
   * small: this is the centre of the control, and every pixel here is
   * straight-line dither the player has to hold through.
   */
  touchStickDeadZonePx: 5,
  /**
   * Shaping exponent on the normalised deflection, > 1 for a softer centre.
   *
   * There is no mechanical centring force under a thumb the way there is under
   * a stick, so a linear map turns holding a straight line into a constant
   * correction. Full lock is still reachable, so this is comfort rather than
   * an advantage over the other two devices.
   */
  touchStickCurve: 1.35,
} as const;

/**
 * Debug instrumentation.
 *
 * A diagnostic that runs whether or not anyone is looking is part of the frame
 * budget (master starter 16.2), so these values exist to keep it cheap rather
 * than to make it pretty.
 */
export const DIAGNOSTICS = {
  /** Overlay redraw rate. Faster than a human reads, and no faster. */
  overlayRefreshHz: 5,
  /**
   * Millisecond samples retained per measurement window, preallocated. At
   * 60 Hz this is four seconds of frames — long enough for a p99 to mean
   * something, short enough to sort cheaply.
   */
  sampleWindow: 240,
} as const;

/**
 * The inspection orbit — a diagnostic view, cycled with `C`.
 *
 * **Kept deliberately at M3, and renamed to say what it is.** It was the M1
 * placeholder; the parked chase beside it was M2's placeholder and is gone,
 * replaced by the real spring arm. This one earns its place as QA tooling: it
 * is the only view that can show the rider's fore/aft articulation, which the
 * chase camera looks almost straight down the axis of (see the
 * inspection-camera lesson in `docs/LESSONS_LEARNED.md`). It is a diagnostic,
 * never an acceptance view — a pose is only proven readable from the chase
 * camera the player actually rides behind.
 *
 * It is stepped rather than driven from wall time, so `advance(n)` moves it
 * deterministically for a frozen capture.
 */
export const INSPECTION_CAMERA = {
  /** Orbit rate, radians per second. Zero holds an angle for a screenshot. */
  orbitRate: 0.22,
  /** Orbit radius as a fraction of CAMERA.distanceAtRest. */
  distanceFactor: 0.72,
  /** Orbit height as a multiple of the wheel's shell height. */
  heightFactor: 1.9,
  /** Look target height as a fraction of the rider's hip height. */
  targetHeightFactor: 0.72,
} as const;

/**
 * The timed route — M10.
 *
 * **Everything here is a rule of the challenge, not a property of the wheel.**
 * The ride is bit-identical whether a run is active or not: no value below
 * reaches `EucController`, and a personal best set in one session is comparable
 * with one set in another because nothing about the machine changed between
 * them. That is also why none of it is a player option (invariant 5) — a
 * checkpoint a player could widen is a leaderboard nobody can read.
 *
 * The volume sizes are derived against the wheel rather than chosen by eye, and
 * the derivation is worth stating because getting it wrong produces the worst
 * bug this system can have: a checkpoint the player rode through and the game
 * did not see.
 */
export const CHALLENGE = {
  /**
   * Stopped run-up behind the start gate for a new attempt, metres.
   *
   * Derived from the checkpoint's own centre and heading, never from the
   * level spawn. Eighteen metres gives the wheel room to build speed without
   * making every retry replay the slice's fifty-metre plaza approach; a future
   * generated course gets the same retry cost from the same plain plan data.
   */
  startRunupMetres: 18,
  /**
   * How far beyond the corridor's own half-width a gate volume reaches, metres.
   *
   * A checkpoint is a gate across the route, and the route has shoulders. A
   * volume that stopped at the painted edge would miss a rider cutting the
   * inside line onto the grass — which is a legal, encouraged line (§6 beat 6)
   * and must not silently void a run. Wide enough to catch the shoulder,
   * narrow enough that a rider genuinely off exploring does not trip it.
   */
  gateWidthMargin: 2.4,
  /**
   * Half-thickness along the route, metres.
   *
   * **This is the tunnelling number.** Detection is a point-in-box test on the
   * contact patch once per fixed step, so the volume has to be thicker than the
   * furthest the wheel can travel in one step or a fast rider passes straight
   * through it. Top speed is 29.1 m/s at a 120 Hz step, which is 0.242 m per
   * step; 1.8 m is over seven times that. The margin is what let M16 raise the
   * top speed by half and M30 Phase 4 raise it again to 65 without anyone
   * having to remember this paragraph, and it is still over seven times over —
   * but a wheel twice as fast again would need this number looked at.
   */
  gateHalfDepth: 1.8,
  /**
   * Half-height, metres, about a centre one `gateHalfHeight` above the surface.
   *
   * So the box stands *on* the ground and reaches 2× this above it. Tall enough
   * to catch a rider crossing mid-hop (0.45 m of hop off a 0.30 m step) and
   * short enough that the alley ledge, 0.55 m up and walled off from the route,
   * cannot trigger a gate the rider is not actually riding through.
   */
  gateHalfHeight: 1.6,

  /**
   * Ghost recording rate, samples per second.
   *
   * Twenty is chosen against the *shape of a line*, not against the frame rate:
   * at the shipped top speed (29.0576 m/s) it is a sample every 1.45 m — it was
   * 1.1 m on the 22.3 m/s wheel — and the ghost is interpolated between them,
   * so a carve still reads as a carve. Doubling it would double the saved
   * record to describe motion the player cannot see at chase distance.
   */
  ghostSampleHz: 20,
  /**
   * Longest run the ghost will record, seconds.
   *
   * A clean lap is about three minutes (§6). This is the cap that stops a
   * player who parks in the park for an hour from writing a megabyte into
   * `localStorage`; a run that reaches it stops recording and still times
   * normally, because losing the ghost is a much smaller failure than losing
   * the run.
   */
  ghostMaxSeconds: 420,
  /** Position quantisation, metres. A centimetre is far below what is visible. */
  ghostPositionStep: 0.01,
  /** Angle quantisation, radians. About a third of a degree. */
  ghostAngleStep: 0.005,
  /** How transparent the ghost is. Solid enough to read, clearly not the player. */
  ghostOpacity: 0.42,

  /**
   * How long a split delta stays on the HUD after a checkpoint, seconds.
   *
   * Long enough to read at speed, short enough to be gone before the next
   * corner needs the player's eyes. A number that lingers is the same class of
   * annoyance as a warning that strobes (`ui/hudModel.ts`).
   */
  splitHoldSeconds: 2.6,
  /**
   * The pause between crossing the finish and the results screen, seconds.
   *
   * Not politeness. The finish line is the payoff and a results dialog that
   * appears on the frame the wheel crosses it steals the moment the player just
   * earned — they see a menu instead of themselves finishing.
   */
  resultsDelaySeconds: 1.4,
  /**
   * The widest gate that still gets a bar across the top, half-width in metres.
   *
   * **Found by looking at it, which is the only way this one could have been
   * found.** Every headless assertion about the gates passed: the geometry was
   * outside the opening, the colours were right, the yaw matched. The picture
   * was still wrong. The plaza carries 17 m of half-width, so its start and
   * finish gates resolve to nearly 39 m across, and a 39 m header drew as a
   * beam crossing the sky at an angle — with the *finish* gantry hanging over
   * the rider on their way to the start line, which is the first thing anyone
   * would have reported.
   *
   * Above this width the gate is drawn as one capped overhead marker and no
   * ground posts. Narrowing posts inward would put intangible geometry on
   * ground the rider legally rides; keeping them on the volume edge made the
   * active plaza start invisible behind architecture. The overhead-only form
   * avoids both failures.
   *
   * Ten metres spans every beat that reads as a corridor and leaves only the
   * two plaza gates unspanned, which are the two the player crosses in open
   * ground where a gantry never made sense.
   */
  gateDrawnMaxHalfWidth: 10,
  /** Half-span of a centred overhead marker for a plaza-wide checkpoint. */
  gateWideMarkerHalfWidth: 5.5,

  /**
   * The gate flare — how long it lasts, and how bright it peaks.
   *
   * **Authored here rather than borrowed from `FX`, which is what the first
   * implementation did.** A flare built from `FX.sparkLifeSeconds` and
   * `FX.statusBootIntensity` is semantically right and structurally a trap: a
   * developer tuning how long a pedal-strike spark lives would silently retune
   * every checkpoint in the game, discover it much later, and have nothing
   * connecting the two. Values start identical to the ones they replace, so
   * this changes no pixel today and unpicks the coupling before anybody trips
   * on it.
   *
   * The flare is the whole crossing cue, because **there is deliberately no
   * checkpoint sound**. The owner had M8's recovery beep replaced by a light
   * flare on exactly this reasoning, and a tone that fires six times a lap and
   * again on every retry is the shape of thing his standing rule rejects — it
   * fails on how often it plays rather than on how loud it is.
   */
  gateFlareSeconds: 0.40,
  gateFlareIntensity: 5.0,

  /**
   * How much faster than the record counts as a meaningfully better run,
   * seconds. Below this the results screen says the run matched rather than
   * beat it, so a hundredth of a second does not get a celebration.
   */
  recordEpsilonSeconds: 0.01,
} as const;

/**
 * Track Day — M23 Phase B2.
 *
 * **Its own group rather than three more fields in `CHALLENGE`**, and the split
 * is the one `PADDLE` makes against `TARGET` a few groups down: `CHALLENGE`
 * describes a *gate* — how thick it is so nobody tunnels through it, how wide
 * so the shoulder counts, how long a split lingers — and every one of those
 * numbers is as true of a lap as it is of a timed run, which is exactly why
 * `simulation/trackDay.ts` reads them from there. What is here is what a *lap*
 * adds, and there turned out to be very little of it, which is the evidence
 * that a circuit really is the same machinery pointed at a closed course.
 *
 * Nothing here reaches `EucController`. The ride is bit-identical whether a
 * session is running or not, for `CHALLENGE`'s reason and with the same
 * consequence: a lap set this afternoon is comparable with one set next month.
 */
export const TRACK_DAY = {
  /**
   * How far outside the corridor the contact patch must get before the lap
   * stops counting, metres.
   *
   * **Measured from the corridor edge, not from the racing surface.** BelVar's
   * corridor is 10 m each side of the centreline and only its middle 5 m is
   * asphalt; the verge between them is where a rider who runs wide ends up and
   * is legal ground that the surface system already punishes with grip. The
   * barrier stands at 8.4 m, so the only way past the corridor edge at all is
   * through one of the two authored gaps in it — which means this margin is not
   * deciding *whether* a rider left the circuit, only insisting they have
   * clearly finished doing it before the lap is written off.
   *
   * Two and a half metres is four metres past the barrier line and about five
   * wheel-widths past the corridor's edge. It also swallows, three orders of
   * magnitude over, the 36 mm by which the sampled centreline departs from the
   * hairpin's true arc (`level/buildPlan.ts`, `LAP_SAMPLE_SPACING`).
   */
  offCourseMarginMetres: 2.5,

  /**
   * How long the lap that just ended stays on the HUD, seconds.
   *
   * Longer than `CHALLENGE.splitHoldSeconds` — a lap time is the number the
   * rider came for and a sector split is a progress report, and the moment it
   * appears is also the moment they are accelerating out of the last corner
   * and cannot look away for long. Still short enough to be gone well before
   * the braking point for the sweeper, which is the constraint that stops it
   * simply lasting until the next crossing.
   */
  lapHoldSeconds: 4,
} as const;

/**
 * The paddle — M14.
 *
 * **A weapon, not a mode.** Everything here describes a thing somebody is
 * holding and how it moves when they swing it; nothing here knows what is being
 * hit, who is holding it, or that a score exists. That is deliberate and it is
 * the milestone's one architectural constraint: the owner's chase-mode direction
 * makes the third playable character a cop wielding this same paddle at *riders*
 * (`docs/PLANS.md` §10, "Amendments 2026-08-11"), so the swing arithmetic is
 * written once against a wielder pose and a set of hittable spheres. Targets and
 * scoring live under `TARGET` below and in the mode; none of it reaches here.
 *
 * ## Every distance below is stated, not derived from the rider
 *
 * **`reach` is its own constant and must never be computed from
 * `RIDER_BLOCKOUT`.** That group's own comment calls it "deliberately and
 * visibly temporary": it is the blockout skeleton, and `docs/PLANS.md` §7.3 will
 * replace it with a hero rider. A reach derived from an arm length would mean
 * the art pass silently changed how far the player can hit, in a milestone whose
 * exit question is about feel. The renderer solves the arm to the paddle rather
 * than the paddle to the arm, for the same reason in the other direction.
 *
 * ## The swing is a three-part window and only the middle one hits
 *
 * `windup` draws back, `active` sweeps and is the only phase that can strike,
 * `recover` returns to rest and ignores further input. A miss is a full cycle
 * spent, which is what makes timing a skill rather than a mash — and the whole
 * cycle is short enough that spending it never costs the line, which is phase
 * 1's owner gate.
 *
 * ## Why `maxStepSweep` exists and why it is not 0.4
 *
 * The hit test is a swept segment from the head's previous position to its
 * current one, and the arithmetic is settled in `simulation/paddle.ts`. What
 * this constant guards is the *other* case: on a teleport — a manual reset, a
 * challenge run-up, the automatic crash respawn, or a world swap — the previous
 * position is somewhere else entirely, and the first sweep afterwards is a spear
 * through every target on the line between them. Any step longer than a swing
 * could legitimately produce is therefore not a swing and reseeds instead of
 * querying. It sits well above the legitimate maximum rather than snugly on it,
 * and `paddle.test.ts` derives that maximum from the constants around it so that
 * shortening `activeSeconds` or raising the top speed fails loudly here instead
 * of quietly disarming the guard.
 */
export const PADDLE = {
  /**
   * Swing pivot to the centre of the head, metres.
   *
   * A padded paddle at roughly arm-plus-handle. Long enough that a target on the
   * verge is reachable from a line the rider would take anyway, short enough
   * that the head is a thing swung rather than a boom swept.
   */
  reach: 1.40,
  /**
   * The head's own hit radius, metres.
   *
   * The padded face, as a sphere. Combined with `TARGET.discRadius` this is the
   * whole of the hit condition — a swept capsule against a sphere — so it is the
   * single strongest control over how forgiving a swing is, and it is on F4.
   */
  headRadius: 0.16,
  /**
   * Height of the swing plane above the contact patch, metres.
   *
   * The head sweeps a horizontal circle at this height. Flat rather than arced
   * because the drawn paddle is placed at the position this arithmetic produces
   * — the simulation's head *is* the rendered head — so any curve here would be
   * a curve the player watches, and a level sweep at chest height is what the
   * reference photographs show a padded paddle actually doing.
   *
   * It is stated against the wheel's contact patch, which is the one point every
   * other system in the simulation already measures from.
   */
  pivotHeight: 1.42,
  /**
   * How far to the rider's right the pivot sits, metres.
   *
   * The rider swings right (§13 q18), so the shoulder the paddle hangs off is
   * offset onto that side. **The rider's right is −X** (AGENTS.md world
   * conventions); this constant is a magnitude and `simulation/paddle.ts` owns
   * the sign, once, where a screen-space test can check it.
   */
  pivotOffset: 0.24,
  /** Draw-back before the strike window opens, seconds. */
  windupSeconds: 0.10,
  /**
   * The strike window, seconds. The only phase in which a hit can happen.
   *
   * **This is the number the 50 mph pass put under pressure, and M30 Phase 4
   * pressed harder.** The metres of road over which a verge target is inside
   * `reach` do not change with speed; the seconds do. At M16's 50 mph that was
   * about 0.13 s and at the shipped 65 it is about 0.10 s, so the active window
   * is now slightly *longer* than the whole opportunity and a swing thrown
   * early or late simply misses. That is the intended difficulty at the top of the
   * speed range and the wrong difficulty at the bottom, which is why it is the
   * first slider to reach for if phase 5's ride says the mode is fussy rather
   * than sharp.
   */
  activeSeconds: 0.12,
  /** Return to rest, seconds. Input is ignored throughout. */
  recoverSeconds: 0.22,
  /**
   * Where the strike window opens, as a yaw offset from the rider's heading.
   *
   * Radians, and **negative is toward the rider's right**, because positive yaw
   * about +Y turns left. At −2.05 rad the head starts behind the rider's right
   * shoulder.
   */
  startAngle: -2.05,
  /**
   * How far the head sweeps during the strike window, radians.
   *
   * **Positive, and the sign is a second thing world space cannot check.** With
   * yaw positive toward the rider's left, a right-side forehand sweeps with the
   * angle *increasing* — from behind the right shoulder, out through the rider's
   * right, and forward across the front. A negative sweep on the right side is a
   * backhand played with forehand art, and every world-space assertion about
   * "the head was on the right" passes either way.
   */
  sweepRadians: 2.20,
  /**
   * The longest step the head may legitimately move before the sweep is treated
   * as a teleport instead of a swing, metres.
   *
   * See the note above. The legitimate maximum is the head's own arc speed
   * (`reach · sweepRadians / activeSeconds`) plus the rider's translation at
   * `RIDEABILITY.topSpeed`, divided by `SIMULATION.hz` — about 0.40 m at the
   * values shipped here. One metre is two and a half times that.
   */
  maxStepSweep: 1.00,
  /**
   * The suspension kick a landed hit puts through the machine, metres — §13 q17.
   *
   * **Presentation only, and it reaches the suspension rather than the wobble.**
   * The owner's standing rule from the M13 exit ride is that nothing but a real
   * hazard may trigger wobble in play, and any other trigger found later is
   * removed rather than tuned. A jolt on impact reads as an obvious fit for the
   * oscillator, which is exactly why it is written down here: it is the pedal
   * strike's own compression kick, and `injectWobble` is never called.
   */
  hitJolt: 0.028,
  /**
   * Speed a landed hit costs the rider, m/s — §13 q17.
   *
   * **Ships at zero, on F4.** The owner's answer was that connecting should not
   * punish the player in v1; the lever exists because "a hit should have weight"
   * is the most likely thing phase 5's ride asks for, and it is a slider rather
   * than a rebuild.
   */
  hitSpeedCost: 0,
  /**
   * How committed a swing has to be to put a rider down — M26 Phase 3 (q74),
   * **and it ships at zero since the owner's 2026-08-27 ride**.
   *
   * **Zero means every landed strike is a knockdown**, which is a reversal of
   * what this constant was built to express and the owner's own words are the
   * whole of the argument: *"realize hitting and not dropping is not fun. even
   * at slow speed/stationary getting hit with paddle should knock u out"*. The
   * same ride found the consequence in the chase — a cop whose paddle landed
   * and did nothing — and named it a regression against the live build, where
   * he *"almost had a heart attack"* seeing it broken (§26.11).
   *
   * The lever survives the reversal because the arithmetic under it is still
   * the right arithmetic, and the day a ride asks for a wind-up back it is a
   * slider rather than a rebuild. `PADDLE.hitSpeedCost` is the same shape and
   * the same precedent: a knob shipped at the value that switches it off,
   * because the owner's answer to the question it asks was "no".
   *
   * **A share of the paddle's own arc speed, never a number in m/s.** The head
   * sweeps `reach · sweepRadians / activeSeconds` all by itself — about 25.7 m/s
   * at the values above — and that is exactly the speed a *parked* wielder's tap
   * lands at, so 1.0 *is* a standing tap and every share above it asks for speed
   * the wielder brought. Expressed against the swing rather than against the
   * world because M20's rule says so: a raw threshold in m/s is a constant
   * secretly defined as today's `activeSeconds`, and the day somebody shortens
   * the strike window it would quietly become "every tap" anyway.
   *
   * At 1.25 — what shipped between Phase 3 and the ride — a rider carrying
   * roughly 7.5 m/s into a mid-arc strike put the other one down and a standing
   * tap shoved. `simulation/paddle.test.ts` still proves that band, by setting
   * the share rather than by reading it, which is what keeps the lever real.
   */
  hardKnockShare: 0,
} as const;

/**
 * What a Knockabout target is, and how big — M14.
 *
 * **Sizes and presentation only.** Where targets go is placement arithmetic
 * derived from the machine, and it lives with the other placement rules in
 * `level/routeValidator.ts` (`TARGET_RULES`), exactly as `HAZARD` above splits
 * from `HAZARD_RULES`. The split is the same one and for the same reason: this
 * table is what two modules that may not import each other have to agree about,
 * and a placement rule derived from `RIDEABILITY` cannot live in a file
 * `routeValidator.ts` imports.
 *
 * **A target is never a collider.** `level/plan.ts` states the trap at length;
 * the number that matters here is that `strikeHeight` puts the pad at chest
 * height, which is precisely the height at which a collider would be a slab of
 * ground the rider lands on.
 *
 * **One hue at two brightnesses, never a hue pair.** Brightness carries state —
 * standing is bright, struck is dim — so the signal survives every colour-vision
 * deficiency, and a red-against-green pair would not. It also has to survive
 * `prefers-reduced-motion`: the knock-down is WebGL motion that no CSS media
 * query can reach, and the brightness step is what remains when it is
 * suppressed, so the step is authored to be legible on its own rather than as a
 * garnish on the animation (the tilt-back pulse's precedent).
 */
export const TARGET = {
  /**
   * The strike disc's hit radius, metres.
   *
   * With `PADDLE.headRadius` this is the whole hit condition. Authored into
   * `Target.radius` when the plan is built, so a live change here moves the next
   * world rather than the one being ridden — the same as every hazard size.
   */
  discRadius: 0.34,
  /**
   * Height of the disc's centre above the road under it, metres.
   *
   * Below `PADDLE.pivotHeight` by less than the two radii sum, so a swing at the
   * right moment through the right lane connects without the player having to
   * think about height at all. `targets.test.ts` derives that relationship
   * rather than restating it, so moving either constant past the other fails.
   */
  strikeHeight: 1.30,
  /**
   * How close in plan the rider must pass to knock a target out with their
   * body, metres — the owner's 2026-08-12 ride.
   *
   * The second way a target goes down. Paddle-only scoring at the top of the
   * speed range asked for more precision than the ride is about, and the owner
   * chose contact over tuning the swing wider: riding into a target counts,
   * and it costs the rider a bush — one soft wobble and a speed cost, never a
   * crash. This is the rider trunk's half-width, swept against the visible
   * stand: its post and cantilever arm, plus the strike disc at their end.
   * The exact union keeps a visible hit while refusing a nearby empty lane.
   */
  bodyKnockRadius: 0.35,
  /**
   * How far above the contact patch the rider's body reaches for that test,
   * metres. Helmet height — the pad has to overlap the rider, not their shadow.
   */
  bodyKnockHeight: 1.90,
  /**
   * Speed a body knock costs, m/s — the "like hitting a bush" half of the
   * owner's decision. Nonzero, unlike `PADDLE.hitSpeedCost`: a clean swing is
   * skill and costs nothing, riding through the target is the clumsy way and
   * should feel like one. Applied toward zero, so it can stop a slow rider but
   * never bounce one backwards.
   */
  bodyKnockSpeedCost: 4.5,
  /** Drawn thickness of the disc, metres. Render only. */
  discThickness: 0.09,
  /**
   * The stand's post radius, metres. Shared by render and body contact.
   *
   * Raised from 0.055 after looking at one: at the `readMetres` the gate is
   * ridden against, a post that thin is a hairline the renderer resolves away
   * and the pad reads as floating. The same radius grows the post-and-arm
   * segment for the body-knock test; paddle collision remains disc-only.
   */
  postRadius: 0.075,
  /**
   * How far the pad is cantilevered in from the stand, metres — §13 q19.
   *
   * The stand is on the verge and the pad reaches in over the road, so the thing
   * the rider swings at is in reach of a line they would ride anyway while the
   * thing standing in the world is not in the road. Nothing is solid either way;
   * this is about where the player *believes* the obstacle is.
   */
  cantilever: 0.90,
  /**
   * Ground the stand's foot needs to itself, metres.
   *
   * The clearance predicate `placeTargets` shares with its contract. It must be
   * measured against `plan.softBodies` as well as the colliders and solids:
   * M15 moved all 196 shrubs out of `solids` into their own array, so a
   * clearance test written against colliders alone silently stops covering
   * bushes and plants stands inside them (`docs/PLANS.md`, the sixth silent
   * failure).
   */
  standClearance: 0.45,
  /**
   * Targets per hundred metres of required route — §13 q20.
   *
   * Two, matching `HAZARD_RULES.perHundredMetres` and settled on the same
   * argument: often enough that the mode is in every stretch of the ride, rare
   * enough that the route is a route rather than a slalom. The owner deliberately
   * left the *connector* half of this question — whether the graded joins between
   * beats should carry targets at all — for the phase 5 ride, as he left q10.
   */
  perHundredMetres: 2,
  /**
   * How long a struck target takes to fall, seconds.
   *
   * The knock-down is the confirmation that a hit landed, and it is the channel
   * `prefers-reduced-motion` removes. Short enough to read at speed while the
   * rider is already past it.
   */
  knockdownSeconds: 0.45,
  /** How far a struck target tips, radians. Render only. */
  knockdownRadians: 1.45,
  /** Unlit brightness of a standing target. State, carried on one hue. */
  standingBrightness: 1.00,
  /**
   * Unlit brightness of a struck one.
   *
   * The step has to be legible with the knock-down suppressed, so it is a large
   * fraction rather than a tint: a struck target is plainly a dark version of a
   * bright one at chase distance, standing still.
   */
  struckBrightness: 0.34,
  /** How long the strike flare lasts, seconds. Authored here, not borrowed from `FX`. */
  strikeFlareSeconds: 0.30,
  strikeFlareIntensity: 4.0,
  /**
   * The distance a target is expected to read from, metres.
   *
   * `HAZARD.readMetres`, and deliberately the same number: it is the furthest
   * distance this project has actually measured a mark in the road from, and the
   * phase 2 owner gate asks the same question of a target that phase 2 of M13
   * asked of a pothole — can I see it far enough ahead to set up the line.
   */
  readMetres: 40,
} as const;

/**
 * A couch Knockabout match — M26 Phase 4 (`docs/PLANS.md` §26.5), widened to
 * three and four riders by M37 (§37.4).
 *
 * **Two numbers, and one of them is on F4.** `matchKnockdowns` has its
 * `LIVE_TUNABLES` row; `countdownSeconds` does not, and the reason changed
 * with M37 Phase 3 Stage B rather than going away. It is no longer "no call
 * site reads it" — `enterKnockabout` hands it to `KnockaboutMatch.arm` — it is
 * that `arm` takes the count as an **argument** rather than holding it in a
 * field the way `RaceRun` does, so a slider moved mid-session would change
 * nothing until the next bout was armed: a knob that lies in a quieter way.
 * Giving it a row means giving the referee a field or re-arming on change, and
 * G2 may retire the count altogether, so the count is changed here for now.
 * q76 settles the rest:
 * knockdowns decide the match, there is no clock to run out (§13 q14's
 * "elapsed is worth nothing" survives), discs are a side tally that can never
 * win it, and nothing is stored (q77). None of those are quantities, so none of
 * them are here — a group that grew a `discsAreWorth` would be a group that had
 * quietly reopened a settled design decision as a slider. M37 adds no scoring
 * quantity either: q168 kept first-to-five, and the second number below is a
 * presentation duration, not a rule.
 */
export const KNOCKABOUT = {
  /**
   * How many knockdowns win a couch match — q76's "first to five".
   *
   * Five because a match should be long enough to turn around and short enough
   * to want another one straight away; whether that is right is what the
   * owner's Phase 5 ride answers, which is why it is on F4.
   */
  matchKnockdowns: 5,

  /**
   * How long a three- or four-rider bout is held before GO, seconds — q170.
   *
   * **N=3/4 only; N=2 passes 0.** The two-player match starts the instant it is
   * armed and that is its regression contract (§37.1), so the duration is handed
   * to `KnockaboutMatch.arm` by the composition root rather than read by the
   * referee: one call site decides which rooms count down, and the referee is
   * handed the fact like every other one it holds.
   *
   * Three seconds because the race's standing start is three (`RACE.countdown-
   * Seconds`) and a room that has just learned one count should not have to
   * learn a second — §37.4 asks for the race's 3-2-1-GO convention, not a new
   * one. Zero is a legal setting here too and means the N=2 start at every N,
   * which is how the count is switched off — edited in this file and not on
   * F4, for the reason the group header gives. G2 can remove the count
   * entirely if it annoys the owner.
   */
  countdownSeconds: 3,
} as const;

/**
 * Where three or four riders are stood at the start of a bout — M37 Phase 2
 * (`docs/PLANS.md` §37.4).
 *
 * **Distances, and only distances.** The *shape* of an N-way start — a regular
 * ring, everybody facing the shared meeting area, seats dealt to positions by a
 * match-placement seed — is a decision §37.4 already made, and a
 * `GROUP_SPAWN.shape` would be that decision quietly reopened as a slider.
 * What is genuinely a quantity is how much daylight the weapon needs, how far
 * the bounded search is allowed to look, and how far ahead of each rider the
 * road has to still be road.
 *
 * **The ring's radius is not here on purpose.** It is
 * `separation / (2·sin(π/N))`, rounded up to `ringRadiusStepMetres`, and the
 * separation is read off the real `Paddle` — so a retune of the arm, the head,
 * the pivot or the rider radius moves the ring rather than leaving a copied
 * 2.15 m behind. `simulation/groupSpawn.ts` derives it and
 * `simulation/groupSpawn.test.ts` swings a real paddle at it.
 */
export const GROUP_SPAWN = {
  /**
   * Daylight added to the paddle's own reach when two riders are stood apart, m.
   *
   * The pair bound is `Paddle.reachAgainst(CHASE.riderHitRadius)` — 2.15 m at
   * the shipped tuning, and a *ceiling*: a real swing measured over every
   * bearing lands at 2.14 m abeam and misses at 2.16 m (M37 Phase 0). A quarter
   * of a metre on top of a bound that is already the maximum over bearings is
   * the same kind of daylight `DUEL_LATERAL_METRES` buys at two seats, and it
   * costs nothing on the road: 2.40 m of separation is a ring 2.77 m (N=3) or
   * 3.39 m (N=4) across, against a narrowest measured corridor of 5.5 m of
   * half-width at any shipped spawn.
   *
   * It is also the gap demanded from every handed-in solid, soft body and
   * hazard, on top of the rider's own footprint — one margin, one meaning.
   */
  pairMarginMetres: 0.25,
  /**
   * The step the derived ring radius is rounded **up** to, metres.
   *
   * So the pack's nearest chord is a hair outside the bound rather than exactly
   * on it, and so two builds that disagree in the last bits of `sin(π/N)` still
   * stand riders in the same place. Five centimetres is small against the
   * 0.25 m margin it sits inside, which is what keeps the rounding a rounding.
   */
  ringRadiusStepMetres: 0.05,
  /**
   * How far one forward translation of the search moves the pack, metres.
   *
   * Two metres, because the thing a translation is escaping is the verge band
   * immediately behind a plan's spawn — the ring's rearmost point lands on it
   * on 28 of the 29 worlds measured at Phase 0 — and one ring radius is enough
   * to clear it. Smaller steps would multiply the candidate list without
   * reaching anywhere the larger ones do not.
   */
  forwardStepMetres: 2.0,
  /**
   * How far forward of the plan's spawn the search may look, metres.
   *
   * The bound in "bounded search". Six metres is three translations, it is
   * inside the shortest forward run measured at any shipped spawn, and it keeps
   * the pack close enough that the world's own start still reads as the start.
   * A world that needs more than this has something wrong with its entrance,
   * and §37.4 asks for that to be reported rather than searched around.
   */
  forwardSearchMetres: 6.0,
  /**
   * The greatest height difference allowed across a whole pack, metres.
   *
   * **Not a step test** — the local-plane residual below `curbThreshold` is
   * what refuses a kerb, a wall top or a ditch, and it is deliberately blind to
   * an honest gradient (the flat window it replaces admitted nothing larger
   * than r = 1.26 m on a 3.18 % route, which is under the N=3 ring). This is
   * the other half: a perfectly planar 30 % bank is not a step and is still not
   * somewhere to stand four riders. Half a metre across a 3.4 m pack is a 15 %
   * grade — five times the steepest grade measured at any shipped spawn, and
   * far short of the wheel's own stall.
   */
  maxPackRiseMetres: 0.5,
  /**
   * How far ahead of each rider's facing the road is checked, metres.
   *
   * §37.4's "clear initial departure": a stationary ground sample cannot see
   * that a rider is facing a wall. Four metres is slightly further than the
   * production controller actually travels in the two-second gentle-throttle
   * ride `groupSpawn.test.ts` runs from every accepted position, so the test's
   * ride stays inside the ground the validator checked.
   */
  departureMetres: 4.0,
  /**
   * How finely that departure is sampled, metres.
   *
   * Consecutive samples are compared to each other rather than to the pack's
   * plane, because a departure leaves the patch the plane was fitted to and a
   * road is allowed to curve away. A quarter of a metre is well under the
   * heightfield's own cell, so a kerb cannot hide between two probes.
   */
  departureSampleMetres: 0.25,
} as const;

/**
 * The couch race — M27 (`docs/PLANS.md` §27.3, §27.4).
 *
 * Three numbers, and every one of them is an owner answer rather than a
 * default. The group is deliberately small on `KNOCKABOUT`'s exact argument: a
 * `RACE.gridRows` or a `RACE.pointsForSecond` would be a slider that had
 * quietly reopened a settled design decision, and §27.9 lists what this
 * milestone does *not* do.
 *
 * All three reach F4, because §27.6's Phase 5 ride gate is what judges them
 * and a number the owner can only report is a number he has to wait on. The
 * suite holds each of them to M26's rule — **a tunable is only testable by
 * moving it** — so two far-apart settings of every one of these must be
 * visibly distinguishable.
 */
export const RACE = {
  /**
   * How many laps a race is — q91's "fixed three laps, no picker".
   *
   * Three because BelVar's lap is 40-70 seconds, which makes a 2-4 minute
   * race: long enough for a mistake to cost something and short enough to want
   * another one immediately. **No picker UI** — the join panel does not reflow
   * for a number nobody asked to choose.
   */
  laps: 3,

  /**
   * The standing start's count, seconds — q88, q96.
   *
   * Every seat's intent is replaced with neutral at the composition root until
   * this reaches zero, so nobody creeps and nobody jump-starts. **Zero is a
   * legal setting and means an instant start**, which is the same code path
   * rather than a branch: one shape is what makes the knob testable.
   */
  countdownSeconds: 3,

  /**
   * How long the race waits for the field after the leader finishes, seconds.
   *
   * **Ships at 0, and 0 switches the cap off** — `PADDLE.hardKnockShare`'s
   * precedent, and the rule `AGENTS.md` states: a tunable shipped at the value
   * that disables it is a decision recorded where it will be found. q89's
   * answer is the kart convention — the leader's finish ends the race and
   * everybody else finishes the lap they are on — and the owner chose it
   * knowing a rider a lap down can hold the room up for one lap. If a real
   * couch is ever annoyed by that wait, this is the named constant it becomes,
   * not a design argument: riders still out past leader-finish plus this are
   * classified by progress.
   */
  finishGraceSeconds: 0,
} as const;

/**
 * Rider-to-rider contact — M26.
 *
 * Contact is resolved in the ground plane as one symmetric soft-body bump:
 * equal separation speed, equal speed cost, and no crash at any closing speed.
 * These are developer-tunable physical quantities, never player options
 * (AGENTS.md invariant 5). The couch session decides whether contact exists;
 * the pure contact primitive only answers what one overlap costs.
 *
 * Every value is a starting point for the Phase 2 ride gate, not a conclusion.
 */
export const CONTACT = {
  /** Centre-to-centre overlap radius, metres: two 0.35 m bodies plus skin. */
  radiusMetres: 0.80,
  /** Time before one continuously merged pair may produce another bump, s. */
  cooldownSeconds: 0.40,
  /** Equal-and-opposite velocity added to each body along the contact axis, m/s. */
  separationSpeed: 1.2,
  /** Speed each body sheds after separation is applied, m/s toward zero. */
  speedCost: 1.5,
} as const;

/**
 * The police chase — M18.
 *
 * Every number the mode and the cop's brain read, in one group, because the
 * owner's phase-4 ride is where this milestone is decided and "the knobs move
 * at F4 in the session" is the plan's own remedy for anything that is not fun.
 * Each is registered in `LIVE_TUNABLES` below.
 *
 * **Three rules bind what may live here.**
 *
 * **1. Nothing here is a speed cheat** (§13 q27). The cop rides the same
 * `EucController` with the same tuning as the player, so there is no top speed,
 * no acceleration multiplier and no drag scale in this group — and there must
 * never be one. `copSkill` buys *line quality and braking earliness*, which is
 * a cop who corners better rather than a cop who is faster, and that is the
 * only shape of difficulty the "two players ride the same wheel" promise (§13
 * q3) leaves available.
 *
 * **2. Distances that are really *times* are stated as times.** The M16 speed
 * pass is the reason: four constants that were secretly defined as the old top
 * speed had to move with it. A lookahead in metres would be a lookahead that
 * silently shortens the day somebody changes `EUC.dragCoefficient` again, so
 * the lookahead is seconds of travel with a floor, and braking distances are
 * derived from `EUC.brakeAuthority` at the speed the cop is actually doing.
 *
 * **3. The rider carries no paddle** (§13 q28), so there is no rider-side
 * strike constant here and adding one is a design change rather than a tune.
 */
export const CHASE = {
  /** M39 authored-block navigation; metres except the anticipation in seconds.
   * This selects a local road aim; the ordinary controller/grip/brakes apply. */
  streetMargin: 3,
  streetJoinReach: 35,
  streetCloseMetres: 10,
  streetAnticipationSeconds: 3,
  streetSampleMetres: 5,
  // -- The run ---------------------------------------------------------------

  /**
   * How long the rider must survive to win, seconds — §13 q24.
   *
   * Five minutes, the owner's answer. It is the mode's whole shape rather than
   * a difficulty knob: the win condition is identical on every seed, which is
   * what makes one player's escape comparable with another's, and there is no
   * finish line anywhere in the mode.
   */
  escapeSeconds: 300,
  /**
   * How far behind the rider the cop starts, metres.
   *
   * Close enough that the first ten seconds are already a chase — a mode whose
   * opening is quiet teaches the player that the opening is quiet — and far
   * enough that the rider is never struck before they have moved. Measured
   * along the rider's heading and resolved against the ground, so a spawn on a
   * hill does not bury him.
   */
  spawnGapMetres: 20,
  /**
   * The super tracker — M20.2, and the owner's second reopening of the easy
   * escape. M20.1 made the straight-line race dead even, and his next night
   * ride found the leak that was left: *"i can still loose him easily by
   * getting far away from him… the mode is about the tension, not
   * freeriding."* Two equal wheels can never re-close a gap honestly, and the
   * measurement agrees — a cop pursuing an identical full-skill route rider
   * bleeds ~1.3 m/s to pursuit overhead (the quarry's line instead of the
   * racing line, caution, detours) and is 125 m behind inside 90 seconds.
   *
   * So the cop is allowed the one power the owner asked for by name: **he
   * always knows where the rider is, and when the gap blows out he turns up
   * again**. When `copGap` stays beyond `trackerGapMetres` for
   * `trackerHoldSeconds` continuously, he is placed back on the route
   * `trackerReturnMetres` behind the rider, arriving at the rider's own pace
   * (clamped by his own cutout ceiling, so this grants position, never a
   * faster wheel). The fiction is a tracker, not a teleport the player can
   * see: the trigger sits beyond any distance the chase camera shows of the
   * road behind, and the return sat beyond `AUDIO.sirenFarMetres` at M20.2 —
   * he arrived silent and the siren *faded in* as he closed, which reads as
   * being found rather than as being spawned on. The chase pass (§31) moved
   * the return inside the siren's onset for the reason the director's note
   * below gives; the fade-in survives at about 8 % of point-blank.
   *
   * The hold seconds are what make a momentary blowout — a building between
   * them, one long corner — survive on its own: only a gap that *stays* open
   * regroups him. Inside `trackerGapMetres` nothing whatsoever changes, so
   * every close-range behaviour (§4.2 wall choreography included) is
   * untouched.
   */
  //
  // **The brutal pass (2026-09-25)** — the owner's ride: *"it was still easy
  // to escape him by speeding away. it took a while of riding in silence
  // before i ran into the next cop. We can be a lot less merciful in this
  // mode."* Every clock below was shortened, and every one stays nested as
  // before (`chase.test.ts`): the gap line 130 → 100 m and its hold 3 → 1.5 s;
  // the return 50 → 30 m, still behind the rider's camera and inside the quiet
  // reset line, so an accepted return is heard at once; the quiet spell
  // 12 → 3 s; the respite 8 → 4 s; the stall 6 → 2.5 s. A quiet spell is now
  // answered from both ends at once (`simulation/chase.ts`): the tail behind
  // him and a patrol parked ahead of him on his road. The measured cost and
  // effect are in `docs/M39_CHASE.md` "Brutal pass".
  trackerGapMetres: 100,
  trackerReturnMetres: 30,
  trackerHoldSeconds: 1.5,
  /**
   * The pressure director — the chase pass (`docs/PLANS.md` §31), and the
   * owner's third reopening of the easy escape: *"once Officer Dorkins falls
   * behind, too much of the five-minute chase feels like free riding."*
   *
   * Distance alone was an incomplete measure of a cop who is no threat. He
   * can sit 90 m back for a minute — inside the tracker gap, outside the
   * siren — and the player hears nothing; he can be wedged on a bollard at
   * 40 m and never trip a gap rule at all. So the referee also keeps a
   * **quiet clock**: seconds the gap has sat beyond `trackerQuietGapMetres`,
   * which is `AUDIO.sirenFarMetres` exactly, so "quiet" means exactly what
   * the player hears; the clock's hysteresis is on its *reset* (a few metres
   * inside the line, `simulation/chase.ts`), not on its start — the first
   * cut set the line 10 m past the siren's edge as "a little hysteresis" and
   * Codex's M31 QA showed the band that left: a cop holding 61–70 m ran no
   * clock and no siren for five minutes. A quiet spell of
   * `trackerQuietSeconds` regroups him, on the same terms as a blown-out gap. And a **stall clock**:
   * a cop below `trackerStallSpeed` for `trackerStallSeconds` while more than
   * `trackerStallGapMetres` from the rider is stuck on something, whatever the
   * gap reads, and is brought back the same way.
   *
   * **A baited crash buys a respite.** Leading him into a spill or a deep hole
   * is the counterplay the mode was built around (§13 q28), and a tracker that
   * teleported him back three seconds after he stood up would erase every
   * success with a teleport. For `trackerRespiteSeconds` after he stands up,
   * every regroup clock is held at zero: the crash itself (about 3.6 s down)
   * plus the respite is the breathing room a clever line earns.
   *
   * The return distance comes down from 85 m to 50 m with the director,
   * because the old return was measured to convert into nothing: two equal
   * wheels cannot close a gap on a straight, so a cop dropped 85 m back —
   * 25 m outside the siren — arrived silent and stayed silent until the next
   * blow-out cycled him again. At 50 m the siren's distance curve puts him at
   * about 8 % of point-blank, which is the fade-in the fiction asks for, and
   * he is close enough that the rider's next corner, hazard or turn at the
   * route's end is his to use.
   */
  // Brutal pass: quiet 12 → 3 s, respite 8 → 4 s, stall 6 → 2.5 s (see above).
  trackerQuietGapMetres: 60,
  trackerQuietSeconds: 3,
  trackerRespiteSeconds: 4,
  trackerStallSeconds: 2.5,
  trackerStallSpeed: 1.0,
  trackerStallGapMetres: 20,
  /**
   * How close the cop must be for a crash to be a bust, metres — §13 q25.
   *
   * The whole difference between pressure and tag. A rider who crashes with the
   * cop on their shoulder is caught; a rider who crashes alone loses the
   * recovery time and nothing else, which is already punishment enough and is
   * the same crash free ride has always had.
   */
  bustRadiusMetres: 12,
  /**
   * How close counts as *touching* Officer Dorkins, metres — M24, Dario's
   * publicly promised "the police should arrest you if you touch the police
   * officer".
   *
   * Centre-to-centre in the ground plane, sized as two `riderHitRadius`
   * bodies brushing plus a hand's width, so the bust fires when the two
   * machines visibly meet and never from riding *near* him. Deliberately far
   * inside `bustRadiusMetres`, which answers a different question (whose
   * fault a crash was) at shoulder distance.
   */
  touchBustMetres: 1.1,
  /**
   * How fast the rider must be closing on the cop for a touch to be their
   * ram, m/s.
   *
   * The design guard made arithmetic: the touch busts only when the *rider*
   * is doing the closing (and doing more of it than the cop — see
   * `ChaseRun.step`), so the cop gains no new way to score by ramming. Above
   * wobble drift, below a deliberate creep: a rider who noses into him at
   * walking pace chose to.
   */
  touchBustClosingSpeed: 0.5,
  /**
   * How far from the route the rider may stray before the warning starts,
   * metres — §13 q27, "not cheatable by going far off road".
   *
   * Measured from the route spine, so it is a corridor rather than a circle,
   * and generous: the widest authored beat is about 9 m of rideable surface, so
   * this is several road widths of shoulder, verge and grass. It exists to
   * refuse the one strategy that would beat the mode without riding — pointing
   * at the surround and holding throttle for five minutes — not to keep the
   * player on the tarmac. **Outside this mode nothing changes**: go-anywhere is
   * LOCKED and the rest of the game has no boundary at all.
   */
  strayLimitMetres: 30,
  /**
   * How long the rider may stay out there before it ends the run, seconds.
   *
   * Long enough that overshooting a corner onto the grass and coming back is
   * never a bust, short enough that "ride away and wait" is not a strategy.
   * The clock resets the moment the rider is back inside the corridor.
   */
  strayGraceSeconds: 8,
  /**
   * How long the results card waits after a bust or an escape, seconds.
   *
   * `CHALLENGE.resultsDelaySeconds`' twin, and deliberately its own number: the
   * end of a chase is a crash or a clock hitting zero, and both want a beat to
   * land before a panel covers them.
   */
  resultsDelaySeconds: 1.6,

  // -- The cop's brain -------------------------------------------------------

  /**
   * How well the cop rides, 0..1 — §13 q27.
   *
   * Ships at 1 because the owner asked for an aggressive CPU. **It is not a
   * speed multiplier and must never become one** (rule 1 above): at 1 the cop
   * takes the spine's own line and brakes at the distance the physics actually
   * needs; below it he wanders off the line and leaves his braking later, which
   * is a cop who makes mistakes rather than a cop who is slow. Phase 1's
   * headless sweep asserts both halves — clean at 1, measurably worse below.
   */
  copSkill: 1,
  /**
   * How far ahead the cop aims, as seconds of travel.
   *
   * A pure-pursuit lookahead. Too short and he saws at the wheel; too long and
   * he cuts corners onto the verge. Seconds rather than metres by rule 2.
   */
  lookaheadSeconds: 0.55,
  /** The lookahead's floor, metres, so a stopped cop still has a point to aim at. */
  lookaheadMinMetres: 5,
  /**
   * Steering per radian of bearing error toward the aim point.
   *
   * `ActionSnapshot.steer` is ±1 and the controller owns what that means, so
   * this is the brain's only steering authority — there is no second gain
   * anywhere and no direct write to a yaw rate.
   */
  steerGain: 1.9,
  /**
   * Steering opposed to the cop's own turn rate, per rad/s.
   *
   * The damping term that stops the pursuit oscillating. Without it a lookahead
   * this short weaves visibly at speed, and a weaving cop reads as a bug rather
   * than as a character.
   */
  steerDamping: 0.30,
  /**
   * Throttle per m/s of speed error. Above about 1 the cop pumps the throttle
   * on every small correction, which is audible before it is visible.
   */
  throttleGain: 0.55,
  /**
   * How close to the wheel's own cutout speed the cop will ride, as a share of
   * it — M20.
   *
   * The max-speed cutout applies to the cop, because he rides the player's ride
   * and never gets a private physics path. What this stops is the *brain*
   * riding him into it: before M20 he held the throttle open whenever nothing
   * was clamping him, which on a long straight is now a wipeout, and a pursuit
   * that ends because the pursuer fell off is not a pursuit.
   *
   * 0.995 leaves him about a quarter of a mile per hour under the edge — he
   * rides the beeps like a good player instead of cruising with a polite gap.
   * It shipped at 0.97 (~1.5 mph of room) and the owner escaped him by simply
   * holding speed: *"still very easy to lose him by speeding away"*, with the
   * follow-up that a hard mode is the point. The margin can sit this close
   * because his throttle law brakes him the moment he is over the cap, and
   * the cutout needs `EUC.cutoutHoldSeconds` of *sustained* trespass to fire —
   * a transient brush with the edge never accrues it. The other half of the
   * same fix is in `cpuRider.ts`: a proportional-only throttle sagged ~4 mph
   * below any cap it was given, so the cap was never the binding number.
   *
   * A share of **his** wheel's cutout, `copCutoutSpeedShare` below, not the
   * player's since 2026-09-22.
   */
  cutoutMarginShare: 0.995,
  /**
   * Where the cop's own wheel cuts out, as a share of its derived top speed —
   * **the player's pre-2026-09-22 edge, pinned.**
   *
   * The owner tightened the player's cutout that day (`EUC.cutoutSpeedShare`
   * 0.965 → 0.94, his words there) and in the same breath the chase is already
   * too easy. The cop's ceiling had always been derived from the player's edge
   * — top × `EUC.cutoutSpeedShare` × `cutoutMarginShare` — so following it
   * would have cut his top speed by 1.1 mph on the 65 wheel and handed every
   * player an easier escape nobody asked for. This constant keeps the whole
   * old relationship for him instead: his brain rides to top × 0.965 × 0.995
   * (28.56 m/s, 63.9 mph on the shipped 65; 21.97 m/s, 49.1 mph under
   * `?mph=50`), and `Game.applyTuning` hands his *controller* the same 0.965 so
   * his wheel cannot now cut out underneath the ceiling his brain rides to.
   *
   * It is the one field of the ride tuning his wheel does not share with the
   * player's, and it is a share of the same live derived top speed, so a drag
   * change or a `?mph=` preset still moves him with everyone. Not on F4: the
   * *Cop speed ceiling* slider (`cutoutMarginShare`) is the knob for how hard
   * he rides, and the cutout-enabled switch still governs his wheel as it
   * governs the player's.
   */
  copCutoutSpeedShare: 0.965,
  /**
   * Share of the wheel's lateral limit the cop will spend in a corner.
   *
   * Under 1 because a cornering machine at its exact limit is a machine one
   * bump from the ground, and because the margin is what `copSkill` eats into.
   */
  corneringMargin: 0.70,
  /**
   * Extra room the cop leaves either side of a hazard he steers around, metres.
   *
   * Added to the hazard's own radius. A pothole he clips is a pothole he
   * crashes in, and the crash the player wants to watch is the one they lured
   * him into rather than one the brain gave away for free.
   */
  hazardClearanceMetres: 1.2,
  /**
   * How far off the spine the cop will move to pass a hazard, as a share of the
   * corridor's own half-width. Past this he brakes instead of swerving.
   */
  hazardSwerveShare: 0.75,
  /**
   * Safety factor on the braking distance the cop leaves for a hazard he cannot
   * pass. Above 1 because a brake applied at exactly the required distance
   * arrives at the hazard doing exactly the speed that crashes.
   */
  brakeSafety: 1.35,
  /**
   * How far the cop's line wanders off the spine at `copSkill = 0`, metres.
   *
   * Deterministic rather than random — it is a function of distance along the
   * route, so the same seed and the same skill produce the same ride to the
   * step, which is what Phase 1's determinism test asserts.
   */
  skillWanderMetres: 2.4,
  /** How many wander cycles per hundred metres. Slow enough to read as a line. */
  skillWanderPerHundredMetres: 3.5,
  /**
   * Share of the needed braking distance the cop still has at `copSkill = 0`.
   *
   * The other half of the skill knob: a poor cop brakes at 45% of the distance
   * he needs, which is how he ends up in the pothole the player rode around.
   */
  skillBrakeLateness: 0.45,
  /**
   * How much of the quarry's own offset across the road the cop copies, 0..1.
   *
   * What makes the chase *close* rather than run parallel: he takes the line
   * the rider is taking. Lateral only, and clamped to the corridor — this is
   * the road half of the pursuit. A rider clear of the road entirely is
   * `fieldRangeMetres`'s job. Not a slider: at 1 he mirrors and at 0 he
   * ignores, and neither end is a ride the owner would be judging.
   */
  pursuitLateralFollow: 0.85,
  /**
   * Catching up is not the same as closing in — the chase pass.
   *
   * The lateral follow above and the cornering margin below are close-pursuit
   * habits: copying the rider's line sets up the strike, and a margin under
   * the grip limit keeps the strike's approach tidy. Far behind they are
   * only losses — a cop 80 m back weaving to match a line the rider chose for
   * a corner he has not reached, and braking for a margin the rider is not
   * keeping — and Codex's probe measured the copying alone at zero seconds
   * inside siren range on route-41 against 33 with it off. So both fade with
   * range: inside `pursuitNearMetres` the shipped habits, beyond
   * `pursuitFarMetres` his own racing line at `hotCorneringMargin`, a blend
   * between. Still line quality and braking earliness, never speed (§13 q27):
   * he is on the player's wheel and the margin is a share of a limit the
   * player rides at 1.0.
   */
  pursuitNearMetres: 20,
  pursuitFarMetres: 50,
  hotCorneringMargin: 0.85,
  /**
   * How close an off-road quarry has to be before the cop leaves the road for
   * them, metres of straight line.
   *
   * The owner's first ride found the hole this closes: the stray rule busts a
   * rider who goes *far*, but between the road's edge and that limit was a band
   * where standing still was safe — the cop chased along the tarmac below and
   * would not step onto the grass. Inside this range he now comes across the
   * field directly. Sized past the stray limit plus the road's own half-width,
   * so the band has no safe outer edge; a quarry who stays out of even this is
   * spending stray grace they cannot spend twice. Out of range, the chase runs
   * along the road until he draws level — which is the leapfrog that keeps a
   * moving off-road rider pressured without making grass his fastest surface.
   */
  fieldRangeMetres: 45,
  /**
   * The close-quarters search — the brutal pass (2026-09-25), the owner's
   * *"hiding behind obstacles (on the outside) and watching it run side to
   * side (on the inside) like i'm invisible"*.
   *
   * Inside `navRangeMetres` (straight line) of a quarry who is off the road or
   * slower than `navSlowQuarrySpeed` — parked, shuffling, creeping round a
   * corner — the cop stops reasoning along the spine and **finds his way to
   * him** on the world's navigation grid (`simulation/navGrid.ts`): a bounded
   * A* round the solids the plan states, re-planned four times a second, and
   * steered corner to corner with the ordinary pursuit law. A moving rider on
   * the road is the spine's, as ever; the search is local, not a route
   * planner (AGENTS, the M18 rules). The ladder under it — the stuck crawl,
   * the spin escape — stays the backup for what the plan does not draw.
   *
   * Past the field range on purpose, so every off-road camp inside the stray
   * limit is inside it, and short enough that a search window of 128 m holds
   * any detour round a town block.
   */
  navRangeMetres: 55,
  navSlowQuarrySpeed: 3.5,
  /**
   * How fast the cop rides through a strike on a quarry who is standing
   * still, m/s — the brutal pass.
   *
   * A parked rider is not met at arm's length and matched at zero (the
   * standoff that held the M18 cop hovering half a metre off a rider his
   * paddle could not reach from there): he is passed at a jog, a paddle's
   * reach to one side, with the swing led onto him, and passed again from the
   * other way if it misses. Every landed strike is a knockdown
   * (`PADDLE.hardKnockShare` 0), so the pass is the bust — which is why it
   * can be a jog: under the wheel's own obstacle crash speed
   * (`EUC.obstacleCrashSpeed`, 3.5), so a pass that brushes the wall a rider
   * hides against scrapes it instead of putting the cop down (the field
   * wall-camp fixture crashed him five times a minute at 5 m/s).
   */
  attackPassSpeed: 3.2,
  /**
   * How far to one side of a standing quarry the attack pass aims, metres:
   * the paddle's reach, less a little, so the head sweeps through him.
   */
  attackOffsetMetres: 1.2,
  /**
   * How far ahead a kerb has to be for the cop to hop it, metres of feeler
   * reading. Read off the controller's own `curbAhead`, so he hops the things
   * the game already knows are in front of a wheel rather than things the brain
   * guessed at.
   */
  hopCurbHeight: 0.10,
  /**
   * The tallest step the cop will try to hop, metres — M24.
   *
   * The feeler reports *any* face ahead, and a wall is a face: without a
   * ceiling the cop hop-spammed every wall he wedged against — 27 to 43 hops
   * in the §4.2 reproduction, each buying a few degrees of airborne yaw,
   * which is exactly the owner's "slowly jumping to correct himself". The
   * barrier faces that trigger the pogo read 1.0 m and taller on the feeler;
   * this sits well under them and well over every step the ride can actually
   * mount (an uncharged hop's own apex is ≈ 0.46 m, and momentum, slope and
   * suspension legitimately stretch what a moving wheel clears — the first
   * cut at 0.42 refused mid-height street furniture the §4.2 camp flank was
   * genuinely using, and the fixture caught it).
   */
  hopMaxCurbHeight: 0.8,

  // -- The strike ------------------------------------------------------------

  /**
   * How close the quarry must be before the cop throws a swing, metres.
   *
   * Slightly beyond `PADDLE.reach` plus a rider's own radius, so he starts the
   * wind-up while closing rather than when already alongside — a swing thrown
   * at the exact moment of arrival always lands late.
   */
  swingRangeMetres: 3.4,
  /**
   * Half-angle of the cone ahead of the cop inside which a swing is worth
   * throwing, radians. Wider than the paddle's own arc, because the arc sweeps
   * during the swing and the quarry is moving through it.
   */
  swingConeRadians: 1.05,
  /**
   * The shortest gap between two of the cop's swings, seconds.
   *
   * Not a fairness tax — the swing's own cycle already costs him most of this —
   * but a floor that keeps a cop riding alongside from becoming a metronome.
   */
  swingCooldownSeconds: 1.1,
  /**
   * The rider's hittable radius when the cop swings at them, metres.
   *
   * The one number that makes a rider a `HittableVolume`. It is the trunk's own
   * half-width rather than an arm span: a strike that lands has to look like it
   * landed on the rider, and `TARGET.bodyKnockRadius` is the same measurement
   * taken for the same reason.
   */
  riderHitRadius: 0.35,
  /**
   * How far up the rider the strike sphere's centre sits above the contact
   * patch, metres. Chest height, so the paddle's own `pivotHeight` sweeps
   * through it.
   */
  riderHitHeight: 1.25,
  /**
   * Speed a landed strike costs the rider, m/s.
   *
   * Spent through `EucController.softKnock` — the M14 body-knock caller, the
   * fourth and last sanctioned wobble caller — so a strike is one soft-body
   * wobble and a shove, never a crash and never a stop-dead. What ends the run
   * is the crash a rider fails to ride out of (§13 q25), not this.
   */
  strikeSpeedCost: 5.0,

  // -- The pack and the room — M39 Part P (docs/PLANS.md §39.6b) ------------
  //
  // The owner's rule of 2026-09-23, verbatim in §39.6b: up to THREE outlaws
  // against ONE cop slot; the slot held by the CPU is a pack that fills the
  // room to four, held by a human it is his seat and nobody beside him. Every
  // number below is a rule's parameter rather than a speed: rule 1 of this
  // group still binds (§13 q27, "no faster cop wheel, for the CPU and for a
  // human alike"), so difficulty arrives by numbers and coordination and
  // nothing here touches the wheel. `docs/M39_CHASE.md` is the build contract
  // that names who reads each one.

  /**
   * How many bodies a chase room holds — the rule's one constant (§39.6b.3b).
   *
   * The cop slot is a role, not a chair: held by the CPU it is a pack of
   * `roomSize − outlaws` Officer Dorkins pursuers (one human → three, two →
   * two, three → one); held by a human it is one seat and no CPU beside him,
   * so 1v1, 2v1 and 3v1 are all legal. The solo face — the owner's one
   * player against three cops — is simply the rule at one human, and his
   * count is frozen: *"fixed at 3. no more mr nice guy. people what it to be
   * HARD"* (q207). So the pack size is derived (`simulation/chase.ts`,
   * `cpuPackSize`) and never stored — there is no `packSize` — and this is
   * **deliberately not on F4**: a room size is not a tune, q207 declined the
   * 1/2/3 ladder rather than deferring it, and `?cops=` is the solo A/B probe
   * that files no record. The CPU never fills anything but the cop slot.
   */
  roomSize: 4,
  /**
   * How far a patrol post stands off the through line, metres — q206's
   * patrol posts (§39.6b.3 "Posts").
   *
   * A parked cop is a visible, readable thing the rider rides toward with
   * open eyes — the reading the route-end head-on already has — and never an
   * obstacle on the racing line: off the kerb on the roomier side, clamped
   * inside the corridor so a post never stands in a hedge or a wall, and
   * judged by the brain's own `landingAllowance` like any rung. 3.5 m puts
   * him a lane's width off the line on the town's roads. Read once per world
   * when the posts are chosen, so a slider change applies from the next
   * world.
   */
  postStandoffMetres: 3.5,
  /**
   * How close a rider must come for a parked patrol to wake, metres — q206
   * (§39.6b.3 "Waking"). Straight line.
   *
   * **Equal to `AUDIO.sirenFarMetres` on purpose**, so the wake is *heard* as
   * it happens: the siren reaches the rider at the same metre the cop starts
   * rolling, and a patrol can never wake silently inside earshot or sit
   * audible and asleep. Pinned against the audio table by
   * `data/liveTuning.test.ts`, the way `trackerQuietGapMetres` is pinned by
   * `simulation/chase.test.ts` — move the siren and that test says which of
   * the two lines has to follow.
   */
  patrolWakeMetres: 60,
  /**
   * The least distance ahead a patrol may be returned to a post, metres, and
   * the far edge of "a pane frames it" — §39.6b.3 "Returning", q127's rule
   * restated.
   *
   * A patrol's regroup parks him at a post the player cannot see: beyond the
   * tracker line from his quarry and either behind the rider's travel or
   * further ahead than this, outside every pane's forward cone
   * (`returnConeRadians`). So a re-entry from the front is always a parked,
   * visible cop the player rides toward, never a rider materialising ahead.
   *
   * **Measured against the camera, QA r1 (2026-09-24)** — the measurement
   * §39.6b.7 ordered at P2, which the first value never had. The chase
   * camera draws every rig to the fog's far edge, `LIGHTING.fogFar` 470 m
   * (fog from 120 m; `CAMERA.far` 500; no distance cull on the cop trims), so
   * 200 m is not the camera's reach. What 200 m is:
   * - **Down the road, beyond the frame.** No corpus ring has a straight
   *   approach to a post longer than this line (the road within 6 m of the
   *   sight line, the post within 20° of the rider's nose; the longest is
   *   184 m, on `harbour-spark-42`), so a post "further ahead than 200 m" is
   *   never in view down the rider's own street.
   *   `bench/chaseBench.test.ts` pins that on the corpus, so a replaced seed
   *   cannot silently reopen it.
   * - **A size-and-fog threshold across the ring's open interior.** A pane
   *   has clear forward sightlines of 424–462 m across the interior. Of the
   *   bench's accepted post returns, 4 of 22–30 landed inside a pane's drawn
   *   frustum, 222–390 m ahead and 38–53° off his heading, 28–77 % fogged;
   *   1–3 of them had a clear line of sight (by how tree trunks are counted):
   *   a 4–6 px figure at 1080p, in the edge of the frame.
   * 470 (the drawn range) was measured as the alternative and is **not** the
   * default: with the quiet clock's QA r1 repair in, it refused most forward
   * returns (post-return refusals on the bench: solo3 3 → 30, 2v2 0 → 21) and
   * cost the evader's pressure — solo3 audible share, median 81.8 → 68.9 %,
   * and a 46.1 s worst quiet spell on `euc` (18.6 s at 200). Whether a 4–6 px
   * figure appearing off-axis is worth that is the owner's call on F4 at GP:
   * raise it toward 470 if a far cop ever reads as materialising.
   */
  patrolReturnMetres: 200,
  /**
   * Where a patrol sent ahead of a rider may stand, metres of road ahead of
   * him — the brutal pass's roadblock (`copPack.chooseIntercept`).
   *
   * The referee sends one whenever a rider's quiet clock runs out (beside the
   * tail's return behind him) and whenever a patrol's own gap or stall clock
   * fires, where it used to park him at a fixed post a third of the ring away.
   * The walk takes the **nearest** spot on the rider's line that no human
   * pane frames, past the wake line in a straight line, clear, level and
   * judged: on a straight that is past `patrolReturnMetres`, round a bend it
   * can be the near end. Past the far end he falls back to a post.
   */
  interceptMinAheadMetres: 100,
  interceptMaxAheadMetres: 420,
  /**
   * How long a parked patrol stands further than `patrolReturnMetres` from
   * his quarry before he is sent ahead of him anyway, seconds — the brutal
   * pass. Posts are where the pack starts and falls back to, not where it
   * waits: a patrol nobody is riding toward is a roadblock waiting to be
   * placed.
   */
  roadblockIdleSeconds: 10,
  /**
   * The pack's pitch, metres by route — §39.6b.3 "Not stacking".
   *
   * A cop whose packmate is within this by route takes the roomier side of
   * him by this much (the lateral-follow offset, `simulation/copPack.ts`), so
   * the echelon forms without anyone braking for anyone; and a return rung or
   * a post within this of another cop is occupied and refused like a folded
   * rung. 5 m is a wheel-and-rider's length with room to swerve.
   */
  packSpacingMetres: 5,
  /**
   * The couch chase's bell, seconds — q217 ("sweep before the bell").
   *
   * A human cop wins only by busting every outlaw before it; anyone standing
   * at it means the outlaws win. The solo five minutes (`escapeSeconds`)
   * until his ride says otherwise, and a separate number because q217 put it
   * on F4 for the couch alone: a shorter bell is one of the three remedies on
   * record for a human cop who cannot close (§21.7), and shortening it must
   * not shorten the solo chase. Handed to the referee when a round is armed.
   */
  couchEscapeSeconds: 300,
  /**
   * How long a cop keeps the outlaw he was dealt before the referee may deal
   * him another, seconds — q221 ("one quarry per cop ... latched with
   * hysteresis").
   *
   * §21.8 warned that a naive per-step nearest pick thrashes the brain's
   * range memory, which feeds the head-on swing lead. Six seconds is long
   * enough that a cop commits to a corner, short enough that a nearer
   * unchased outlaw is taken inside a straight. A deal also never changes
   * while his paddle is armed or he is inside `pursuitNearMetres` of his
   * quarry, and always changes when the quarry goes down for good.
   */
  // Brutal pass: 6 → 2.5 s — it must stay inside the quiet spell (q221's
  // latch cannot outlast the clock it answers; `liveTuning.test.ts` pins it).
  dealHoldSeconds: 2.5,
  /**
   * Half-angle of a pane's forward cone for the return rule, radians —
   * §39.6b.3b "Returns with several cameras": no body appears where anyone
   * is looking.
   *
   * A CPU return (a tail rung or a patrol post) is refused when any human
   * pane frames it: inside this angle of that seat camera's heading and
   * within `patrolReturnMetres` of it.
   *
   * **Measured at P6 (2026-09-24), no longer provisional.** A pane's
   * horizontal half-angle is `atan(tan(v / 2) × aspect)`, where `v` is the
   * vertical angle it is drawn at: `CAMERA.fovAtSpeed` 1.36 (plus seat 0's
   * trim, up to 12° = 0.209), then the split's widening — halves × 1.22,
   * quadrants × 1, both capped at 1.52. Read in a running couch chase, the
   * renderer's drawn cameras agreeing to 0.0003 rad:
   * - 16:9 solo or quadrant: atan(tan(0.68) × 1.778) = 0.962 (1.036 trimmed);
   * - 16:9 half: atan(tan(0.8296) × 0.889) = 0.702;
   * - 21:9 quadrant: 1.092 (1.156 trimmed) — the widest on any 16:9 to 21:9
   *   window;
   * - 19.5:9 phone, solo: about 1.05 (1.14 trimmed).
   * 1.2 is that widest measured pane, 1.156, plus 0.044 for a camera trailing
   * its rider through a turn. Only a 32:9 quadrant (1.235, 1.283 trimmed) or
   * a 3.2:1 test window (1.201) is wider, and Game refuses a return on
   * `max(returnConeRadians, the widest pane measured live)` in both faces, so
   * this value is the tuned floor plus margin, not a cap every pane must fit
   * under (docs/M39_CHASE.md "P6 — room wiring notes").
   */
  returnConeRadians: 1.2,
  /**
   * How long every pursuer is held after GO, seconds — q224's
   * hide-and-seek start.
   *
   * **Ships at 0, and 0 switches the hold off**: the 20 m spawn gap is the
   * head start, as in the solo chase. It is on F4 so the owner's ride can try
   * five seconds if a human cop never closes (the likelier case, by §21.7)
   * or closes too fast. It is one of the three remedies on record, and the
   * director's clocks are held with the pursuers.
   */
  copHoldSeconds: 0,
} as const;

/**
 * The Drunken Master's numbers — M29 (`docs/PLANS.md` §29.4).
 *
 * **A style is theatre; a stat would be a different rider.** Nothing in this
 * block is a physical quantity of the wheel: no speed, no grip, no launch, no
 * damping, no threshold. It is the shape of what the path and the pose do
 * when the player is *not* doing something — a slow weave when the stick is
 * centred, a half-second shimmy every so many metres — and it reaches exactly
 * one rider, through `data/rideStyles.ts` → `DRUNK_STYLE` → the roster's
 * `rideStyleFor('drunkard')`. Every other seat rides on `SOBER_STYLE`, which
 * is every one of these at zero, and the six sober digests in
 * `simulation/EucController.test.ts` hold that a zero here is a `+ 0` there.
 *
 * The F4 group below reaches these through the live-tuning path like any
 * other block (safeguard S7) — the sliders move *his* numbers, and no control
 * on the panel can put a style on a seat.
 */
export const DRUNK = {
  // -- The weave ------------------------------------------------------------
  //
  // The path with the hands off: a slow, *irregular* S made of two sines at
  // incommensurate rates, so it never reads as a metronome. It is a bounded,
  // zero-mean *heading offset*, and the controller feeds the offset's
  // per-step change to the steering request ahead of the lateral clamp — so
  // grip bounds it like any steering, and so the heading returns exactly to
  // where it was whenever the gate closes. The first cut was a yaw *rate*,
  // and a rate gated on and off mid-cycle left a residual heading every time:
  // measured at up to 2° and 19 m of sideways drift over a minute hands-off.
  /**
   * Peak heading offset at full gate, rad — about 1.3°.
   *
   * Above `weaveSpeedFull` the amplitude falls as `weaveSpeedFull / speed`,
   * which holds the *lateral excursion* — the thing the eye reads — constant
   * rather than letting it grow with speed, and the neutrality suite bounds
   * that excursion at 0.35 m **from the line the ride started on**, standing
   * start and gate ramp included, at every speed. **The band is one-sided,
   * and that is arithmetic rather than a bug**: the lateral position is the
   * integral of the heading offset, the offset's first quarter-lobe is spent
   * under the opening gate, and what is left integrates to a band that runs
   * from the line to twice the amplitude on one side of it. So the number
   * here is half the excursion the plan states, not the whole of it. It was
   * 0.030 until an independent QA pass measured from a fixed origin rather
   * than around the trace's own midpoint and found 0.56 m; 0.022 with the
   * gate full from 5 m/s is where a full-throttle start, a half-throttle
   * start and a held 22 m/s all sit inside 0.33 m (measured, nine
   * combinations swept). Zero is a legal value that leaves the sway, the
   * stumble, the stagger and the sip standing; the owner's ride is where
   * this gets its number.
   */
  weaveHeading: 0.022,
  /** The first sine, Hz — a 6.3 s period. */
  weaveRateA: 0.16,
  /** The second sine, Hz — an 8.7 s period, incommensurate with the first. */
  weaveRateB: 0.115,
  /** Below walking pace there is no weave, m/s. Also zero in reverse and at rest. */
  weaveSpeedFloor: 3.0,
  /**
   * Full amplitude from here, m/s — a jog rather than the plan's cruising
   * 8, because the ramp between the floor and this is the part of the first
   * lobe the band loses (see `weaveHeading`): 3 → 8 at full throttle is a
   * second and a half of gate ramp, 3 → 5 is half that, and the fixed-origin
   * excursion came down with it.
   */
  weaveSpeedFull: 5.0,
  /**
   * How fast the weave and the body sway fade at the gates, 1/s — about a
   * third of a second, so letting go of the stick brings the weave back as a
   * settling rather than a switch, and a hop or a wobble takes it away the
   * same way.
   */
  weaveFadeRate: 3.0,

  // -- The stumble ----------------------------------------------------------
  //
  // Every so many metres of riding — counted on the fixed step, so
  // `advance(n)` reaches the same one every run — a short 3 Hz roll-yaw
  // shimmy of the *machine*, with the feet, knees and arms answering it the
  // way they answer a wobble. **A wobble's look with none of its energy**: it
  // enters no oscillator, damps nothing, stacks with nothing, and cannot
  // crash. Never in the air, in a wobble, in a crash, or below walking pace.
  /** Metres of riding between stumbles. 0 is never. */
  stumbleEvery: 110,
  /** How long one lasts, s. */
  stumbleSeconds: 0.5,
  /** The shimmy, Hz. Real EUC wobble is 3–8 Hz and this sits at its slow end. */
  stumbleRate: 3.0,
  /** Peak machine roll, rad — under `EUC.wobbleMaxRoll`'s 0.14. */
  stumbleRoll: 0.10,
  /**
   * Peak machine yaw, rad — spent on the travel heading like `wobbleYaw` is,
   * so the contact patch really shimmies, and never on `headingY`, so the
   * camera does not saw and nothing accumulates into a turn.
   */
  stumbleYaw: 0.07,
} as const;

/** Render-owned activity inside original protecting building bodies only.
 * This table supplies the one shared world-clock pose; it reaches no rider
 * controller, referee, source level or player option. Distances are metres,
 * angles radians, times seconds, and shares/cycle counts dimensionless. */
export const PROTECTED_ACTIVITY = {
  travelMetres: 0.6,
  walkSeconds: 2.6,
  turnSeconds: 0.6,
  idleSeconds: 1.4,
  strideCyclesPerLeg: 2,
  workerWidthShare: -0.205,
  workerDepthMetres: -3.195,
  armRestRadians: 0.18,
  armStrideRadians: 0.06,
  armServicePitchRadians: -1.20,
  shoeWidthMetres: 0.16,
  shoeHeightMetres: 0.10,
  shoeDepthMetres: 0.28,
  shoeCenterYMetres: 0.112,
  ankleYMetres: 0.162,
  hipYMetres: 0.94,
  footStrideMetres: 0.08,
  footLiftMetres: 0.022,
  /** Slow protected ventilation; its fixed guard stands in front of the rotor. */
  fanPeriodSeconds: 12,
  fanWidthShare: -0.36,
  fanHeightMetres: 2.60,
  fanFrontInsetMetres: 1.40,
} as const;

/**
 * The one frozen tuning root (AGENTS.md invariant 4).
 *
 * The named exports above stay, because a controller reading `WHEEL.tyreWidth`
 * is clearer than one reading `TUNING.WHEEL.tyreWidth`. This object exists so
 * that a value can also be addressed *by path* — which is what makes the M1
 * tuning panel possible without every system growing a setter.
 *
 * Frozen shallowly and deeply: nothing may write a default. The panel writes
 * overrides into `LiveTuning` (`src/data/liveTuning.ts`), which reads through
 * to these values and never mutates them, so "reset" is always exact.
 */
export const TUNING = deepFreeze({
  WHEEL,
  RIDER,
  RIDER_BLOCKOUT,
  RIDER_OCCUPANCY,
  PHYSICS,
  EUC,
  TERRAIN,
  LIGHTING,
  CAMERA,
  INSPECTION_CAMERA,
  BLOCKOUT_COLOURS,
  HAZARD,
  POTHOLE,
  PUDDLE,
  PADDLE,
  TARGET,
  KNOCKABOUT,
  RACE,
  CONTACT,
  CHASE,
  DRUNK,
  FX,
  AUDIO,
  ENVIRONMENT_AMBIENCE,
  PROTECTED_ACTIVITY,
  CHALLENGE,
  SIMULATION,
  RENDER,
  GROUND_BOUNDARY,
  GROUND_PAVING,
  SHARED_GROUND,
  DISTRICT_EXTERIOR,
  ENVIRONMENT_VEGETATION,
  POPULATION_AUTHORING,
  // M39: addressed by path (`ULTRA.nearBias`, `ULTRA.shade.lift` …) for the fifteen live values.
  ULTRA,
  INPUT,
  DIAGNOSTICS,
  // Re-exported rather than redefined: `data/surfaces.ts` is the table, and
  // this is only how the tuning panel addresses one of its numbers by path.
  // Already frozen there; freezing twice is free and says so at both ends.
  SURFACES,
  MATERIALS,
});

/** A numeric tuning value the debug panel may change while the game runs. */
export interface TunableSpec {
  /** Dotted path into TUNING, e.g. 'LIGHTING.exposure'. */
  readonly path: string;
  /** Panel grouping header. */
  readonly group: string;
  readonly label: string;
  /** Displayed after the value. Empty for dimensionless ratios. */
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Why a rider or a developer would move this. Shown as the control's title. */
  readonly note: string;
}

/**
 * What the tuning panel exposes.
 *
 * Deliberately a short list. Every entry here must be a value some system
 * actually re-reads at runtime — a slider that moves a number nothing consults
 * is worse than no slider, because it teaches you to distrust the panel. The
 * list grows as each milestone lands the systems that read from it.
 *
 * These are NOT player options. The options firewall (invariant 5) keeps
 * player-configurable presentation out of `simulation/`; developer tuning is
 * the opposite thing and is expected to reach the controller from M2. Do not
 * merge the two mechanisms.
 */
export const LIVE_TUNABLES: readonly TunableSpec[] = deepFreeze([
  // The ride comes first in the panel because from M2 onward it is what the
  // panel is for. Tune with F4 open, then move the values you keep into the
  // defaults above — overrides are session-only on purpose.
  {
    path: 'EUC.maxLeanPitch',
    group: 'Ride — power',
    label: 'Force lean',
    unit: 'rad',
    min: 0.1,
    max: 0.8,
    step: 0.005,
    note: 'Force-demand lean at full throttle. Drive force is proportional to '
      + 'its sine, so raising this raises acceleration and top speed together. '
      + 'The rendered rider pose has its own transient controls below.',
  },
  {
    path: 'EUC.leanToAccel',
    group: 'Ride — power',
    label: 'Drive authority',
    unit: 'm/s²',
    min: 4,
    max: 40,
    step: 0.25,
    note: 'Acceleration per unit of sin(lean). With drag fixed, this sets both '
      + 'how hard the wheel pulls away and where it tops out.',
  },
  {
    path: 'EUC.brakeAuthority',
    group: 'Ride — power',
    label: 'Brake authority',
    unit: 'm/s²',
    min: 4,
    max: 50,
    step: 0.25,
    note: 'Used instead of drive authority whenever lean opposes travel. Keep '
      + 'it above drive authority: a wheel stops far harder than it pulls.',
  },
  {
    path: 'EUC.leanResponseSeconds',
    group: 'Ride — power',
    label: 'Lean response',
    unit: 's',
    min: 0.02,
    max: 0.6,
    step: 0.005,
    note: 'Time constant for lean chasing the input. The single strongest '
      + 'control over whether the game feels crisp or soggy.',
  },
  {
    path: 'EUC.leanRateLimit',
    group: 'Ride — power',
    label: 'Lean rate limit',
    unit: 'rad/s',
    min: 0.5,
    max: 12,
    step: 0.1,
    note: 'Ceiling on how fast lean may change. Shapes the onset of a slammed '
      + 'key without slowing an ordinary input.',
  },
  {
    path: 'EUC.maxRiderPitch',
    group: 'Ride — power',
    label: 'Rider pitch limit',
    unit: 'rad',
    min: 0.1,
    max: 0.8,
    step: 0.005,
    note: 'Largest fore-aft action pose, on top of the relaxed torso pitch. '
      + 'Launch and hard braking may reach it; steady cruising should not.',
  },
  {
    path: 'EUC.riderCruisePitchFactor',
    group: 'Ride — power',
    label: 'Cruise lean',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'Fraction of force lean retained in the steady visual pose. Lower '
      + 'values bring the rider nearer upright once acceleration tapers.',
  },
  {
    path: 'EUC.riderAccelerationPitchGain',
    group: 'Ride — power',
    label: 'Accel lean gain',
    unit: 'rad/(m/s²)',
    min: 0,
    max: 0.12,
    step: 0.002,
    note: 'Extra rendered pitch per unit of active acceleration or braking. '
      + 'This is what makes the strong pose transient instead of speed-held.',
  },
  {
    path: 'EUC.riderPitchResponseSeconds',
    group: 'Ride — power',
    label: 'Rider pitch response',
    unit: 's',
    min: 0.02,
    max: 0.6,
    step: 0.005,
    note: 'Time constant for the rendered fore-aft pose. It does not change '
      + 'the force curve or the user-approved wheel/lower-body side angle.',
  },
  {
    path: 'EUC.riderSlopeLeanFactor',
    group: 'Ride — power',
    label: 'Slope lean',
    unit: '×',
    min: 0,
    max: 2,
    step: 0.05,
    note: 'Rider lean into the hill per radian of gradient. 1.0 is the '
      + 'physical equilibrium for holding a slope; 0 stands them bolt upright '
      + 'on every hill.',
  },
  {
    path: 'EUC.dragCoefficient',
    group: 'Ride — power',
    label: 'Drag',
    unit: '1/m',
    // 0.004 rather than 0.005 and a step of 0.0001 rather than 0.001 — M30
    // Phase 0. `?mph=` writes the preset through this slider's range and
    // `LiveTuning.set` clamps to it, so the range has to hold the whole
    // 20–90 mph window (90 mph is 0.0045) and the step has to land on 65 mph's
    // 0.0087, which the old grid could only approach as 0.008 or 0.009.
    min: 0.004,
    max: 0.15,
    step: 0.0001,
    note: 'Quadratic drag. Top speed emerges from this against drive '
      + 'authority rather than being clamped, so lowering it raises top speed '
      + 'without touching how the wheel launches. 0.00867 is the shipped '
      + '65 mph on pavement, 0.0147 is the old 50; `?mph=<n>` sets it with '
      + 'its partners.',
  },
  {
    path: 'EUC.maxReverseSpeed',
    group: 'Ride — power',
    label: 'Reverse cap',
    unit: 'm/s',
    min: 0.5,
    max: 12,
    step: 0.1,
    note: 'How fast backwards riding is allowed to get. 6.7 is 15 mph. The '
      + 'gate is separate and unaffected: reverse is still only reachable from '
      + 'a near standstill, and still has to be asked for twice.',
  },
  // Steering, and specifically the slow end of it — M16. The exit question is
  // the owner's own: *is the wheel playful at walking pace?* Ride a car park
  // with F4 open and move these until weaving between two lamp posts is fun.
  {
    path: 'EUC.yawRateLow',
    group: 'Ride — steering',
    label: 'Slow-speed yaw',
    unit: 'rad/s',
    min: 0.5,
    max: 8,
    step: 0.05,
    note: 'Yaw authority approached at the slowest moving speed. Ordinary steer '
      + 'does not perform the separate emergency body pivot while stationary. '
      + 'The high-speed carve has its own value and is not touched by this.',
  },
  {
    path: 'EUC.reverseSteerTravelRelative',
    group: 'Ride — steering',
    label: 'Reverse steer',
    unit: 'travel/nose',
    min: 0,
    max: 1,
    step: 1,
    note: 'At 1 backwards steering follows the direction of travel, so right '
      + 'goes backwards-right. At 0 it follows the nose, which is the real '
      + 'machine and reads like reversing a car — press right, travel left. '
      + 'Forward riding is identical either way.',
  },
  {
    path: 'EUC.yawFalloffExponent',
    group: 'Ride — steering',
    label: 'Yaw falloff',
    unit: 'exp',
    min: 0.5,
    max: 3,
    step: 0.05,
    note: 'Shape of the decay from slow-speed yaw to carve yaw. 1 is a straight '
      + 'line, which spends half the low-speed authority by 4.5 m/s. Higher '
      + 'holds the authority through the slow band. Both endpoints are fixed.',
  },
  {
    path: 'EUC.technicalTurnBonusG',
    group: 'Ride — steering',
    label: 'Technical grip',
    unit: 'g',
    min: 0,
    max: 1.5,
    step: 0.05,
    note: 'Extra hard-turn authority at low speed, fading out by the speed '
      + 'below. Every delivered turn still banks the wheel and counts against '
      + 'surface grip. Zero restores the ordinary carve ceiling.',
  },
  {
    path: 'EUC.technicalTurnFadeSpeed',
    group: 'Ride — steering',
    label: 'Technique fade',
    unit: 'm/s',
    min: 0.5,
    max: 12,
    step: 0.1,
    note: 'Speed by which the technical allowance is gone. Above it the steering '
      + 'is bit-for-bit what M2 shipped.',
  },
  {
    path: 'EUC.technicalTurnSteerStart',
    group: 'Ride — steering',
    label: 'Technique start',
    unit: 'input',
    min: 0.1,
    max: 0.79,
    step: 0.01,
    note: 'Steer magnitude where the hard technical-turn stance and its extra '
      + 'low-speed authority begin. Softer input remains the gentle torso-twist '
      + 'technique.',
  },
  {
    path: 'EUC.technicalTurnSteerFull',
    group: 'Ride — steering',
    label: 'Technique full',
    unit: 'input',
    min: 0.8,
    max: 1,
    step: 0.01,
    note: 'Steer magnitude where the technical-turn stance reaches full weight. '
      + 'Keep this above Technique start so analog input has a blend band.',
  },
  {
    path: 'EUC.turnTechniqueResponseSeconds',
    group: 'Ride — steering',
    label: 'Technique response',
    unit: 's',
    min: 0.03,
    max: 0.5,
    step: 0.01,
    note: 'Time constant for blending between gentle and technical body '
      + 'mechanics. It changes presentation, never the delivered yaw.',
  },
  {
    path: 'EUC.gentleTurnTorsoTwist',
    group: 'Ride — steering',
    label: 'Gentle torso twist',
    unit: 'rad',
    min: 0,
    max: 0.5,
    step: 0.01,
    note: 'Maximum hips-and-shoulders twist used by a gentle analog turn. Hard '
      + 'technical turns fade it out and keep the torso facing forward.',
  },
  {
    path: 'EUC.technicalTurnUpperBodyRollFactor',
    group: 'Ride — steering',
    label: 'Technical torso bank',
    unit: 'ratio',
    min: 0,
    max: 0.4,
    step: 0.01,
    note: 'Share of wheel bank inherited by the upper body during a hard '
      + 'technical turn. A small value leaves the wheel and legs tilted while '
      + 'the torso stays nearly upright.',
  },
  {
    path: 'EUC.maxLateralG',
    group: 'Ride — steering',
    label: 'Grip ceiling',
    unit: 'g',
    min: 0.2,
    max: 1.5,
    step: 0.01,
    note: 'Lateral acceleration ceiling, and so the lean angle at full carve: '
      + '0.75 g is about 37 degrees. Raising it makes fast corners tighter and '
      + 'the rider lean harder — and scrape a pedal sooner.',
  },
  // Hop and air are the milestone the panel is for at M5, and the exit
  // question — *is hopping a curb satisfying enough that I do it for no
  // reason?* — is one the owner answers by riding the boulevard kerb with F4
  // open and moving these until the answer is yes.
  {
    path: 'EUC.hopLaunchSpeed',
    group: 'Ride — hop & air',
    label: 'Hop launch',
    unit: 'm/s',
    min: 0.5,
    max: 6,
    step: 0.05,
    note: 'Vertical speed at take-off, uncharged. Height is v²/2g, so 3.0 m/s '
      + 'is a 0.46 m hop and 0.61 s of air. Judge it by the air time, not the '
      + 'height: that is what the chase camera actually shows.',
  },
  {
    path: 'EUC.hopCompressSeconds',
    group: 'Ride — hop & air',
    label: 'Compression',
    unit: 's',
    min: 0,
    max: 0.35,
    step: 0.005,
    note: 'Dwell between the press and the impulse, during which the rider '
      + 'crouches and the suspension loads. Zero fires instantly and looks '
      + 'like a teleport; too long and the hop stops answering the key.',
  },
  {
    path: 'EUC.hopChargeHeightBonus',
    group: 'Ride — hop & air',
    label: 'Crouch bonus',
    unit: '×height',
    min: 0,
    max: 1.2,
    step: 0.02,
    note: 'Extra height from holding Shift before the press. This is the whole '
      + 'skill in the hop — zero makes every hop identical.',
  },
  {
    path: 'EUC.airYawFactor',
    group: 'Ride — hop & air',
    label: 'Air steering',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'Fraction of ground yaw authority in the air. It turns the wheel, '
      + 'never the travel direction, so it can only fix your alignment for the '
      + 'landing — which is exactly what it is for.',
  },
  {
    path: 'EUC.pedalStrikeDecel',
    group: 'Ride — hop & air',
    label: 'Pedal scrape',
    unit: 'm/s²/rad',
    min: 0,
    max: 150,
    step: 1,
    note: 'Speed cost while a pedal is on the ground, per radian past the '
      + 'clearance angle. Clearance itself is derived from the wheel, not set '
      + 'here: a full-lock carve on pavement is meant to scrape.',
  },
  {
    path: 'EUC.landingImpactReference',
    group: 'Ride — landing',
    label: 'Impact reference',
    unit: 'm/s',
    min: 1,
    max: 15,
    step: 0.1,
    note: 'Closing speed along the surface normal that scores a full point. '
      + 'Lower it to make landings punishing; raise it to make them forgiving.',
  },
  {
    path: 'EUC.landingSpeedLossPerScore',
    group: 'Ride — landing',
    label: 'Landing cost',
    unit: '×/point',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'Fraction of speed lost per point of score above clean. The '
      + 'misaligned part of the velocity is already scrubbed before this, so '
      + 'a sideways landing is paid for twice.',
  },
  {
    path: 'CAMERA.airHeightFollow',
    group: 'Ride — landing',
    label: 'Camera air follow',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How much of the hop the camera takes with the rider. 1 is the '
      + 'pre-M5 behaviour and throws the horizon upward; 0 pins the camera to '
      + 'the take-off height and lets the rider leave the frame.',
  },
  {
    path: 'CAMERA.landingDipMax',
    group: 'Ride — landing',
    label: 'Landing dip',
    unit: 'm',
    min: 0,
    max: 0.4,
    step: 0.01,
    note: 'Ceiling on the camera drop a landing produces. One smooth decaying '
      + 'impulse, never oscillation. Set it to zero if any camera motion on '
      + 'impact is unwelcome.',
  },
  // Wobble, power, and crash are the milestone the panel is for at M6, and the
  // exit question — *do I understand what went wrong, and do I immediately want
  // another go?* — is one the owner answers by making and then correcting a
  // riding error with F4 open.
  {
    path: 'EUC.wobbleDampingAggressive',
    group: 'Ride — wobble',
    label: 'Passive damping',
    unit: '1/s',
    min: 0.05,
    max: 3,
    step: 0.05,
    note: 'Baseline damping while the player is still hard on the throttle or '
      + 'steering. Active foot correction and easing-off damping stack on top.',
  },
  {
    path: 'EUC.wobbleDampingSmooth',
    group: 'Ride — wobble',
    label: 'Damping (easing off)',
    unit: '1/s',
    min: 0.1,
    max: 8,
    step: 0.1,
    note: 'Extra input-driven damping once the rider eases off and steers '
      + 'smoothly. It stacks with Cool Rider’s automatic foot correction.',
  },
  {
    path: 'EUC.wobbleFootCorrectionDamping',
    group: 'Ride — wobble',
    label: 'Foot correction',
    unit: '1/s',
    min: 0,
    max: 8,
    step: 0.1,
    note: 'Automatic damping from Cool Rider adjusting their feet after a '
      + 'mistake. Zero removes the experienced-rider assist; easing still works.',
  },
  {
    path: 'EUC.wobbleMaxYaw',
    group: 'Ride — wobble',
    label: 'Wobble amplitude',
    unit: 'rad',
    min: 0,
    max: 0.3,
    step: 0.005,
    note: 'Yaw deviation at the crash threshold. It is added to the direction '
      + 'the wheel actually travels, so this is how far the line weaves — not '
      + 'a decoration on top of a straight one.',
  },
  {
    path: 'EUC.wobbleMaxRoll',
    group: 'Ride — wobble',
    label: 'Wobble tyre roll',
    unit: 'rad',
    min: 0,
    max: 0.3,
    step: 0.005,
    note: 'Coupled tyre-and-pedal roll at the crash threshold. It moves the '
      + 'machine under the rider; it is never applied to the shared rider pivot.',
  },
  {
    path: 'EUC.wobbleFrequencyHz',
    group: 'Ride — wobble',
    label: 'Wobble rate',
    unit: 'Hz',
    min: 1,
    max: 9,
    step: 0.1,
    note: 'Oscillation frequency at the small end. Real EUC wobble is a rapid '
      + 'coupled roll-yaw resonance; 3 Hz is the mild end of the ride gate.',
  },
  {
    path: 'EUC.wobbleFrequencyAtCrashHz',
    group: 'Ride — wobble',
    label: 'Wobble rate at crash',
    unit: 'Hz',
    min: 1,
    max: 9,
    step: 0.1,
    note: 'Frequency the oscillator tightens to as the energy approaches a '
      + 'crash. The gap between this and the rate above IS the warning — set '
      + 'them equal for M6\'s fixed-frequency behaviour.',
  },
  {
    path: 'EUC.wobbleSurfaceGain',
    group: 'Ride — wobble',
    label: 'Surface injection',
    unit: '/s per m/s',
    min: 0,
    max: 0.15,
    step: 0.005,
    note: 'Wobble fed by the ground, per unit of its own wobble injection per '
      + 'm/s ridden. After M13 the spill is the only surface with a non-zero '
      + 'injection, so this moves nothing on any other ground.',
  },
  {
    path: 'EUC.wobbleMasterGain',
    group: 'Ride — wobble',
    label: 'Wobble enabled',
    unit: '0..1',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'Master gate on every wobble energy source, the probe below included. '
      + 'One by owner decision (2026-08-09, the M13 exit ride): hazards-only '
      + 'wobble ships on. Zero silences the system whole; between scales every '
      + 'injection.',
  },
  {
    path: 'EUC.wobbleProbeMetres',
    group: 'Ride — wobble',
    label: 'Probe cadence',
    unit: 'm',
    min: 0,
    max: 200,
    step: 5,
    note: 'Bench instrument only, and zero is off. Metres of ground between '
      + 'hazard-shaped test impulses. No URL arms this since Phase 4 — the owner'
      + "'s rule is that only a real hazard may trigger wobble in play; M15 "
      + 'soft foliage counts as one. Needs '
      + 'the gate above open.',
  },
  {
    path: 'EUC.wobbleProbeEnergy',
    group: 'Ride — wobble',
    label: 'Probe strength',
    unit: '0..1',
    min: 0.05,
    max: 1,
    step: 0.05,
    note: 'Size of each probe impulse as a fraction of a crash. Above the state '
      + 'threshold it is a genuine event; at 1 it wipes out on contact, which is '
      + 'the deep pothole rather than the thing this phase is judging.',
  },
  // The Drunkard's ride style — M29. His numbers and nobody else's: the
  // sliders reach `DRUNK_STYLE` through `Game.applyTuning`, which re-reads the
  // roster for every seat, so a sober seat cannot catch a style from the
  // panel (safeguard S7). The annoyance gate is the owner's ride, and every
  // amplitude here is one constant with zero as a legal value.
  {
    path: 'DRUNK.weaveHeading',
    group: 'Ride — the Drunkard',
    label: 'Weave',
    unit: 'rad',
    min: 0,
    max: 0.12,
    step: 0.002,
    note: 'Peak heading offset of the hands-off weave at cruising speed. Held '
      + 'to a constant lateral excursion above it. Zero removes the weave and keeps '
      + 'the sway, the stumble, the stagger and the sip.',
  },
  {
    path: 'DRUNK.weaveRateA',
    group: 'Ride — the Drunkard',
    label: 'Weave rate A',
    unit: 'Hz',
    min: 0.05,
    max: 0.5,
    step: 0.005,
    note: 'The first of the two sines. Keep the two incommensurate or the '
      + 'weave reads as a metronome.',
  },
  {
    path: 'DRUNK.weaveRateB',
    group: 'Ride — the Drunkard',
    label: 'Weave rate B',
    unit: 'Hz',
    min: 0.05,
    max: 0.5,
    step: 0.005,
    note: 'The second sine.',
  },
  {
    path: 'DRUNK.weaveSpeedFloor',
    group: 'Ride — the Drunkard',
    label: 'Weave from',
    unit: 'm/s',
    min: 0,
    max: 10,
    step: 0.25,
    note: 'No weave below this speed — walking pace. Reverse and rest are '
      + 'always zero.',
  },
  {
    path: 'DRUNK.weaveSpeedFull',
    group: 'Ride — the Drunkard',
    label: 'Weave full at',
    unit: 'm/s',
    min: 0.5,
    max: 22,
    step: 0.25,
    note: 'Full amplitude from this speed. Above it the excursion is held '
      + 'constant rather than growing with speed.',
  },
  {
    path: 'DRUNK.weaveFadeRate',
    group: 'Ride — the Drunkard',
    label: 'Weave fade',
    unit: '1/s',
    min: 0.5,
    max: 12,
    step: 0.25,
    note: 'How fast the weave and the sway come and go at their gates — the '
      + 'stick, the air, a wobble, a crash.',
  },
  {
    path: 'DRUNK.stumbleEvery',
    group: 'Ride — the Drunkard',
    label: 'Stumble every',
    unit: 'm',
    min: 0,
    max: 400,
    step: 5,
    note: 'Metres of riding between stumbles, counted on the fixed step. '
      + 'Zero is never.',
  },
  {
    path: 'DRUNK.stumbleSeconds',
    group: 'Ride — the Drunkard',
    label: 'Stumble length',
    unit: 's',
    min: 0.1,
    max: 1.5,
    step: 0.05,
    note: 'How long one shimmy lasts.',
  },
  {
    path: 'DRUNK.stumbleRate',
    group: 'Ride — the Drunkard',
    label: 'Stumble rate',
    unit: 'Hz',
    min: 1,
    max: 8,
    step: 0.25,
    note: 'The shimmy frequency. A wobble is 3–8 Hz; this is its look with '
      + 'none of its energy.',
  },
  {
    path: 'DRUNK.stumbleRoll',
    group: 'Ride — the Drunkard',
    label: 'Stumble roll',
    unit: 'rad',
    min: 0,
    max: 0.3,
    step: 0.01,
    note: 'Peak machine roll during a stumble.',
  },
  {
    path: 'DRUNK.stumbleYaw',
    group: 'Ride — the Drunkard',
    label: 'Stumble yaw',
    unit: 'rad',
    min: 0,
    max: 0.2,
    step: 0.005,
    note: 'Peak machine yaw during a stumble, spent on the travel heading '
      + 'like a wobble and never on the camera heading.',
  },
  {
    path: 'EUC.hazardCrashSpeed',
    group: 'Ride — hazards',
    label: 'Deep hole crash speed',
    unit: 'm/s',
    min: 0,
    max: 20,
    step: 0.25,
    note: 'At or above this a deep pothole ends the run; below it the rider keeps '
      + 'the wheel and pays in speed and a near-crash wobble. Zero makes every '
      + 'deep hole fatal, and above top speed makes none of them are. The number '
      + 'the readability ride is really judging.',
  },
  {
    path: 'EUC.hazardShallowEnergy',
    group: 'Ride — hazards',
    label: 'Shallow hole wobble',
    unit: '0..1',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'Energy a shallow pothole injects, as a fraction of a crash. Needs the '
      + 'wobble gate open. Below the state threshold (0.35) hitting one is a '
      + 'twitch rather than an event.',
  },
  {
    path: 'EUC.hazardShallowSpeedCost',
    group: 'Ride — hazards',
    label: 'Shallow hole speed cost',
    unit: 'm/s',
    min: 0,
    max: 10,
    step: 0.1,
    note: 'Speed taken on contact, ungated by the wobble master. This is what '
      + 'makes dodging worth the metres it costs even on a run where the weave '
      + 'is ridden out cleanly.',
  },
  {
    path: 'EUC.hazardDeepEnergy',
    group: 'Ride — hazards',
    label: 'Deep hole wobble',
    unit: '0..1',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'Energy a survived deep pothole injects. Near 1 on purpose: under the '
      + 'crash speed a deep hole is a recovery the rider has to make, not a free '
      + 'pass. At 1 it crashes at any speed and the gate above stops mattering.',
  },
  {
    path: 'EUC.hazardDeepSpeedCost',
    group: 'Ride — hazards',
    label: 'Deep hole speed cost',
    unit: 'm/s',
    min: 0,
    max: 15,
    step: 0.25,
    note: 'Speed taken by a survived deep pothole. Heavy enough to end a '
      + 'competitive run, which is the half of the punishment that lands even '
      + 'when the wobble master is closed.',
  },

  // M14 — Knockabout. Every path below is re-read by `Game.applyTuning` and
  // pushed onto the live `Paddle`, so a gate answer is a slider move rather
  // than a rebuild. Sizes that are *authored into a plan* — the disc radius,
  // the cantilever, the density — deliberately do not appear: moving one of
  // those changes the next world rather than the one being ridden, and a
  // slider that appears to do nothing is worse than no slider.
  {
    path: 'PADDLE.reach',
    group: 'Ride — Knockabout',
    label: 'Paddle reach',
    unit: 'm',
    min: 0.8,
    max: 2.2,
    step: 0.02,
    note: 'Swing pivot to the centre of the head. The single strongest control '
      + 'over whether a verge target is reachable from the line you were '
      + 'already riding. Raising it also speeds the head up, because the sweep '
      + 'is an angle.',
  },
  {
    path: 'PADDLE.headRadius',
    group: 'Ride — Knockabout',
    label: 'Head radius',
    unit: 'm',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    note: 'The padded face, as a sphere. With the disc radius this is the whole '
      + 'hit condition — reach for it first if connecting feels like luck.',
  },
  {
    path: 'PADDLE.windupSeconds',
    group: 'Ride — Knockabout',
    label: 'Wind-up',
    unit: 's',
    min: 0,
    max: 0.5,
    step: 0.01,
    note: 'Draw-back before the strike window opens. This is the lag between '
      + 'pressing and the paddle meaning anything; it is what makes the swing '
      + 'something you time rather than something you spam.',
  },
  {
    path: 'PADDLE.activeSeconds',
    group: 'Ride — Knockabout',
    label: 'Strike window',
    unit: 's',
    min: 0.03,
    max: 0.4,
    step: 0.01,
    note: 'The only phase that can hit. At the shipped 65 mph a verge target is in '
      + 'reach for about 0.10 s (0.13 at 50), so shortening this much makes top-speed swings very nearly '
      + 'impossible — and it speeds the head up, so the teleport guard is checked '
      + 'against it in the headless suite.',
  },
  {
    path: 'PADDLE.recoverSeconds',
    group: 'Ride — Knockabout',
    label: 'Recovery',
    unit: 's',
    min: 0,
    max: 0.8,
    step: 0.01,
    note: 'Return to rest, with input ignored throughout. The cost of a miss, and '
      + 'the reason two targets close together are a choice rather than a double '
      + 'tap.',
  },
  {
    path: 'PADDLE.startAngle',
    group: 'Ride — Knockabout',
    label: 'Swing start',
    unit: 'rad',
    min: -3.0,
    max: 0,
    step: 0.05,
    note: 'Where the strike window opens, as a yaw offset from the heading. '
      + 'Negative is toward the rider’s right. Together with the sweep it '
      + 'decides whether you hit things beside you or ahead of you.',
  },
  {
    path: 'PADDLE.sweepRadians',
    group: 'Ride — Knockabout',
    label: 'Swing arc',
    unit: 'rad',
    min: 0.5,
    max: 3.5,
    step: 0.05,
    note: 'How far the head travels during the strike window. Positive is a '
      + 'right-side forehand; a negative value here is a backhand played with '
      + 'forehand art and nothing in world space would notice.',
  },
  {
    path: 'PADDLE.hitJolt',
    group: 'Ride — Knockabout',
    label: 'Hit jolt',
    unit: 'm',
    min: 0,
    max: 0.12,
    step: 0.002,
    note: 'Suspension kick a landed hit puts through the machine. Presentation '
      + 'only — it is the pedal strike’s own compression, and nothing here '
      + 'reaches the wobble oscillator.',
  },
  {
    path: 'PADDLE.hitSpeedCost',
    group: 'Ride — Knockabout',
    label: 'Hit speed cost',
    unit: 'm/s',
    min: 0,
    max: 6,
    step: 0.1,
    note: 'Speed a landed hit costs. Ships at zero by owner decision: connecting '
      + 'should not punish you. Raise it if a hit needs to feel like it weighed '
      + 'something.',
  },
  {
    path: 'PADDLE.hardKnockShare',
    group: 'Ride — Knockabout',
    label: 'Hard knock threshold',
    unit: '× arc',
    min: 0,
    max: 3,
    step: 0.05,
    note: 'How fast the head must be moving through the world to put a rider '
      + 'down, as a multiple of the swing’s own arc speed. Zero — where it '
      + 'ships — means every landed strike is a knockdown. 1.0 is a standing '
      + 'tap, so anything above it asks the wielder to carry speed into the '
      + 'swing before it puts anybody down.',
  },
  {
    path: 'TARGET.bodyKnockRadius',
    group: 'Ride — Knockabout',
    label: 'Body knock radius',
    unit: 'm',
    min: 0,
    max: 1.2,
    step: 0.05,
    note: 'How close the rider must pass to knock a target out with their body. '
      + 'Zero turns the body knock off and makes the paddle the only way again.',
  },
  {
    path: 'TARGET.bodyKnockSpeedCost',
    group: 'Ride — Knockabout',
    label: 'Body knock speed cost',
    unit: 'm/s',
    min: 0,
    max: 10,
    step: 0.25,
    note: 'Speed riding into a target costs — the bush half of the owner’s '
      + 'call. The wobble that comes with it is the bush’s own and is not a '
      + 'slider, by the standing rule.',
  },
  {
    path: 'TARGET.knockdownSeconds',
    group: 'Ride — Knockabout',
    label: 'Knock-down time',
    unit: 's',
    min: 0.05,
    max: 1.5,
    step: 0.05,
    note: 'How long a struck target takes to fall. It is the confirmation that a '
      + 'hit landed, and it has to finish while the rider can still see it.',
  },
  {
    path: 'TARGET.struckBrightness',
    group: 'Ride — Knockabout',
    label: 'Struck brightness',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.02,
    note: 'A struck target’s share of a standing one’s brightness. This '
      + 'is the whole hit signal when reduced motion suppresses the fall, so it '
      + 'must stay a plain step rather than a tint.',
  },
  {
    path: 'EUC.powerComfortSpeed',
    group: 'Ride — power',
    label: 'Power comfort speed',
    unit: 'm/s',
    min: 4,
    // 32 rather than 18 — M30 Phase 0: `?mph=90` scales this to 30.6, and a
    // range the preset cannot reach is a preset the store quietly bends.
    max: 32,
    step: 0.25,
    note: 'Speed at which the wheel starts spending its headroom. Lower it and '
      + 'the wheel warns earlier; take it under about 8 and tilt-back starts '
      + 'reaching into ordinary flat riding. Defined as a share of the top '
      + 'speed (M16), so `?mph=` scales it with the drag.',
  },
  {
    path: 'EUC.powerLimitSpeed',
    group: 'Ride — power',
    label: 'Power limit speed',
    unit: 'm/s',
    min: 6,
    max: 48,
    step: 0.25,
    note: 'Speed that scores the whole load term on the flat, and the divisor '
      + 'of the climb term (M16). Live since M30 Phase 0 so `?mph=` can scale '
      + 'it with the drag; keep it above the comfort speed or the ladder '
      + 'collapses to a step.',
  },
  {
    path: 'EUC.powerSlopeLoad',
    group: 'Ride — power',
    label: 'Climb load',
    unit: '×',
    min: 0,
    max: 5,
    step: 0.05,
    note: 'Load per unit of gradient while climbing. This is what makes a hill '
      + 'expensive rather than merely slow, and it is the main route to '
      + 'tilt-back on the proving ground.',
  },
  {
    path: 'EUC.powerTiltBackLoad',
    group: 'Ride — power',
    label: 'Tilt-back at',
    unit: 'load',
    min: 0.3,
    max: 1.6,
    step: 0.01,
    note: 'Load at which the wheel stops answering the throttle and tilts back. '
      + 'Flat-out on flat pavement produces about 0.66, so anything above that '
      + 'keeps the accepted flat ride untouched.',
  },
  {
    path: 'EUC.tiltBackLeanBack',
    group: 'Ride — power',
    label: 'Tilt-back strength',
    unit: 'rad',
    min: 0,
    max: 0.4,
    step: 0.005,
    note: 'How far past neutral tilt-back holds the force lean. Zero merely '
      + 'cuts the throttle; larger values brake against the rider until the '
      + 'load falls.',
  },
  {
    path: 'EUC.obstacleCrashSpeed',
    group: 'Ride — crash',
    label: 'Obstacle crash speed',
    unit: 'm/s',
    min: 1,
    max: 12,
    step: 0.25,
    note: 'Normal speed into a solid face that takes the rider off. Shallow '
      + 'scrapes spend only their into-wall component, so they can stay below '
      + 'this while carrying speed along the obstacle.',
  },
  {
    path: 'EUC.crashRecoverSpeedFactor',
    group: 'Ride — crash',
    label: 'Recovery speed',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'Fraction of the pre-crash speed the rider is restored with. Zero is '
      + 'a full stop, like quick reset; the default keeps the run moving so a '
      + 'crash costs a couple of seconds rather than a re-launch.',
  },
  {
    path: 'EUC.crashRecoverAutoSeconds',
    group: 'Ride — crash',
    label: 'Auto recovery',
    unit: 's',
    min: 0.4,
    max: 4,
    step: 0.05,
    note: 'How long the crash runs before the rider is restored without being '
      + 'asked. Any riding input recovers earlier. Long values are realistic '
      + 'and, per the motion reference, exactly wrong for this game.',
  },
  {
    path: 'EUC.cutoutEnabled',
    group: 'Ride — cutout',
    label: 'Max-speed cutout',
    unit: 'on/off',
    min: 0,
    max: 1,
    step: 1,
    note: 'M20, reopened by the owner 2026-08-14 — the wheel gives up at the '
      + 'top of its speed range and the rider goes down. At 0 there is no '
      + 'cutout, no beeps and no glyph, which is the ride as it shipped before '
      + 'M20. The rest of the removed realism stays removed.',
  },
  {
    path: 'EUC.overspeedBeepShare',
    group: 'Ride — cutout',
    label: 'First beep',
    unit: 'x top speed',
    min: 0.30,
    max: 0.95,
    step: 0.005,
    note: 'Where the beeps start, as a share of the wheel\'s own top speed. '
      + '0.87 is about 58 mph on the shipped 65 mph ride — the owner moved it '
      + 'up from 30 mph, then asked on 2026-09-22 for later, shorter beeps. A '
      + 'share rather than a speed so it follows a drag change.',
  },
  {
    path: 'EUC.cutoutSpeedShare',
    group: 'Ride — cutout',
    label: 'Cutout speed',
    unit: 'x top speed',
    min: 0.80,
    max: 1.00,
    step: 0.005,
    note: 'Where the wheel lets go. Must stay under about 0.975 or rolling '
      + 'resistance means flat pavement never reaches it and the cutout can '
      + 'only ever fire downhill. The gap between this and 1.0 is the room a '
      + 'rider has to sit just underneath it — "riding the beeps". 0.94 since '
      + 'the owner asked for easier cutouts on 2026-09-22; the cop\'s wheel '
      + 'keeps its own edge (CHASE.copCutoutSpeedShare) and does not follow '
      + 'this slider.',
  },
  {
    path: 'EUC.cutoutHoldSeconds',
    group: 'Ride — cutout',
    label: 'Cutout delay',
    unit: 's',
    min: 0,
    max: 2,
    step: 0.05,
    note: 'How long past the cutout speed before it fires. This is the "very '
      + 'fast beeps shortly before" — at 0 the wheel lets go the instant the '
      + 'edge is touched, which reads as an ambush.',
  },
  {
    path: 'EUC.ragdollEnabled',
    group: 'Ride — crash',
    label: 'Ragdoll',
    unit: 'on/off',
    min: 0,
    max: 1,
    step: 1,
    note: 'The owner A/B switch (M15). At 0 every crash is the scripted M6 '
      + 'separation bit-for-bit; at 1 the particle ragdoll takes the body. '
      + 'If it is annoying, the standing rule applies: removed, not tuned.',
  },
  {
    path: 'EUC.ragdollDamping',
    group: 'Ride — crash',
    label: 'Ragdoll settle',
    unit: '/s',
    min: 0.2,
    max: 4,
    step: 0.05,
    note: 'Velocity shed per second. Higher settles the tumble sooner; the '
      + 'body should be still before manual recovery opens at 2.5 s.',
  },
  {
    path: 'EUC.ragdollFriction',
    group: 'Ride — crash',
    label: 'Ragdoll skid',
    unit: '/s',
    min: 1,
    max: 20,
    step: 0.5,
    note: 'Ground friction on sliding particles. Low slides a crash out '
      + 'along the road; high plants it where it fell.',
  },
  {
    path: 'EUC.ragdollRestitution',
    group: 'Ride — crash',
    label: 'Ragdoll bounce',
    unit: '×',
    min: 0,
    max: 0.8,
    step: 0.02,
    note: 'Fraction of impact speed returned by the ground and by walls.',
  },
  {
    path: 'EUC.ragdollCurlGain',
    group: 'Ride — crash',
    label: 'Protective curl',
    unit: '1/s²',
    min: 0,
    max: 60,
    step: 1,
    note: 'Pull of the hands toward the head — "arms protect body". Zero is '
      + 'a limp doll, which reads as creepy rather than funny.',
  },
  {
    path: 'EUC.ragdollLaunchPop',
    group: 'Ride — crash',
    label: 'Launch pop',
    unit: '×speed',
    min: 0,
    max: 0.8,
    step: 0.02,
    note: 'Upward launch as a fraction of crash speed. The comedy knob.',
  },
  {
    path: 'EUC.crashLaunchFloor',
    group: 'Ride — crash',
    label: 'Slow-crash launch',
    unit: '× full',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How much of the side shove and the head-over tumble a crash at a '
      + 'standstill keeps. Those two are the only launch impulses with no '
      + 'speed in them, so at 1 a rider knocked off a parked wheel is thrown '
      + 'exactly as hard as one hit at forty. The ramp reaches full strength '
      + 'at the run-out speed, above which nothing changes.',
  },
  {
    path: 'EUC.crashWheelFlourishSpeed',
    group: 'Ride — crash',
    label: 'Wheel flourish at',
    unit: 'm/s',
    min: 1,
    max: 12,
    step: 0.25,
    note: 'Impact speed at which an obstacle or side-fall crash bounces and '
      + 'spins the wheel out instead of the quiet M6 lie-down.',
  },
  {
    path: 'EUC.crashWheelSpinRate',
    group: 'Ride — crash',
    label: 'Wheel spin-out',
    unit: 'rad/s',
    min: 0,
    max: 15,
    step: 0.25,
    note: 'Initial pirouette rate of the flourishing wheel.',
  },
  {
    path: 'EUC.softBodyDrag',
    group: 'Ride — crash',
    label: 'Foliage drag',
    unit: 'm/s²',
    min: 0,
    max: 20,
    step: 0.25,
    note: 'Deceleration inside a bush (M15). A cushion, not a wall: no speed '
      + 'manufactures a crash against one.',
  },
  {
    path: 'CAMERA.crashDistance',
    group: 'Ride — crash',
    label: 'Crash framing',
    unit: 'm',
    min: 4,
    // 24 rather than 16 — M30 Phase 0: `?mph=` scales this with the top speed
    // and the 90 mph end of its window needs the room.
    max: 24,
    step: 0.2,
    note: 'Arm length the camera eases to during a crash. It has to hold both '
      + 'the rider and a wheel that is still rolling away from them. 11.5 was '
      + 'measured against a 50 mph ragdoll (M16) and 15.0 is that scaled to '
      + 'the shipped 65; `?mph=` scales it.',
  },
  // Terrain and surfaces are the milestone the panel is for at M4, and the
  // exit question — *can I feel the difference between pavement and grass with
  // my eyes shut?* — is one the owner answers by riding with F4 open and moving
  // these until the answer is yes. Move the values you keep into the tables.
  {
    path: 'TERRAIN.rollingResistanceScale',
    group: 'Terrain — surfaces',
    label: 'Surface drag',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.01,
    note: 'Scales every surface’s rolling resistance together. Raise it to make '
      + 'the ground matter more in general before tuning any one surface below.',
  },
  {
    path: 'SURFACES.pavement.rollingResistance',
    group: 'Terrain — surfaces',
    label: 'Pavement drag',
    unit: 'm/s²',
    min: 0,
    max: 4,
    step: 0.01,
    note: 'The reference surface. 0.35 is the single value M2 shipped, so the '
      + 'ride the owner accepted is this slider left alone.',
  },
  {
    path: 'SURFACES.grass.rollingResistance',
    group: 'Terrain — surfaces',
    label: 'Grass drag',
    unit: 'm/s²',
    min: 0,
    max: 6,
    step: 0.05,
    note: 'The other half of the M4 gate. Top speed on grass falls as the '
      + 'square root of what is left of drive authority after this.',
  },
  {
    path: 'SURFACES.grass.grip',
    group: 'Terrain — surfaces',
    label: 'Grass grip',
    unit: '×',
    min: 0.2,
    max: 1,
    step: 0.01,
    note: 'Multiplies the lateral limit on grass. Lower values make the same '
      + 'corner run wider and the wheel lean less — felt, not seen.',
  },
  {
    path: 'SURFACES.gravel.rollingResistance',
    group: 'Terrain — surfaces',
    label: 'Gravel drag',
    unit: 'm/s²',
    min: 0,
    max: 6,
    step: 0.05,
    note: 'Gravel should cost less speed than grass and more grip. Tune the '
      + 'pair against each other, not in isolation.',
  },
  {
    path: 'SURFACES.gravel.grip',
    group: 'Terrain — surfaces',
    label: 'Gravel grip',
    unit: '×',
    min: 0.2,
    max: 1,
    step: 0.01,
    note: 'The loosest surface in the slice. This is what makes the descent '
      + 'ask for wider lines than the climb did.',
  },
  {
    path: 'SURFACES.grass.roughnessAmplitude',
    group: 'Terrain — surfaces',
    label: 'Grass roughness',
    unit: 'm',
    min: 0,
    max: 0.12,
    step: 0.002,
    note: 'How far the surface texture pushes the suspension. Visible as the '
      + 'rider working over the ground; zero makes grass feel like a carpet.',
  },
  {
    path: 'TERRAIN.curbImpactPerMetre',
    group: 'Terrain — contact',
    label: 'Kerb cost',
    unit: '(m/s)/m',
    min: 0,
    max: 60,
    step: 0.5,
    note: 'Speed lost per metre of step mounted. At 20 a 0.15 m kerb costs '
      + '3 m/s — enough that hopping it will be worth learning at M5.',
  },
  {
    path: 'TERRAIN.wallStandoff',
    group: 'Terrain — contact',
    label: 'Wall standoff',
    unit: 'm',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'Closest the machine may rest to a wall, measured across the pedals. '
      + 'Zero restores the old behaviour, where riding along a face parked the '
      + 'centreline on it and buried the pedals in the mesh. Refuses no move: '
      + 'crashes, sliding and route corridors are the same either way.',
  },
  {
    path: 'TERRAIN.suspensionFrequencyHz',
    group: 'Terrain — contact',
    label: 'Suspension rate',
    unit: 'Hz',
    min: 0.8,
    max: 8,
    step: 0.05,
    note: 'The spring’s own frequency. Roughness excites it at speed divided by '
      + 'the surface wavelength, so raising this quietens the ride at speed.',
  },
  {
    path: 'TERRAIN.suspensionDamping',
    group: 'Terrain — contact',
    label: 'Suspension damping',
    unit: 'ζ',
    min: 0.05,
    max: 1.5,
    step: 0.01,
    note: 'Damping ratio. Below about 0.3 the wheel pogos after a bump; above '
      + '1 it stops moving at all and the surfaces stop reading apart.',
  },
  {
    path: 'TERRAIN.groundTiltPitchFollow',
    group: 'Terrain — contact',
    label: 'Rig pitch follow',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How much of the hill’s fore-aft tilt the rig visually adopts. Zero '
      + 'is the EUC truth — the firmware holds the pedals level to gravity; '
      + '1 is the M4 skateboard behaviour the owner rejected.',
  },
  {
    path: 'TERRAIN.groundTiltRollFollow',
    group: 'Terrain — contact',
    label: 'Rig roll follow',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How much of a cross-slope the rig visually adopts. A small value '
      + 'keeps the tyre reading grounded on side slopes without laying the '
      + 'rider over with the hill.',
  },
  {
    path: 'EUC.yawRateLow',
    group: 'Ride — carve',
    label: 'Yaw at rest',
    unit: 'rad/s',
    min: 0.2,
    max: 5,
    step: 0.05,
    note: 'Turn authority at a standstill. High on purpose — pivoting on the '
      + 'spot is something the wheel is genuinely good at.',
  },
  {
    path: 'EUC.yawRateHigh',
    group: 'Ride — carve',
    label: 'Yaw at speed',
    unit: 'rad/s',
    min: 0.1,
    max: 3,
    step: 0.05,
    note: 'Turn authority at and above carve speed. Keep it below yaw at rest '
      + 'or high-speed steering becomes twitchy.',
  },
  {
    path: 'EUC.carveSpeed',
    group: 'Ride — carve',
    label: 'Carve speed',
    unit: 'm/s',
    min: 2,
    max: 25,
    step: 0.25,
    note: 'Speed at which yaw authority has fully decayed to its high-speed '
      + 'value.',
  },
  {
    path: 'EUC.maxLateralG',
    group: 'Ride — carve',
    label: 'Lateral limit',
    unit: 'g',
    min: 0.2,
    max: 1.6,
    step: 0.01,
    note: 'The ceiling on cornering acceleration, and the reason a fast turn '
      + 'goes wide. Also sets the lean angle at the limit: atan(this).',
  },
  // The give at speed (M30 Phase 2). Two of the schedule's three constants
  // are here; `carveGripFullSpeed` is absent for the reason the lean
  // schedule's two speed anchors are — it is absolute on purpose, so that a
  // `?mph=` build cannot move it and the A/B isolates the top speed
  // (§30.3, the third scope answer). A diagnostic panel, not an option.
  {
    path: 'EUC.carveGripTopG',
    group: 'Ride — carve',
    label: 'Grip at speed',
    unit: 'g',
    min: 0.75,
    max: 1.6,
    step: 0.01,
    note: 'The lateral ceiling at and above 22.25 m/s, where the ordinary '
      + 'limit above is what the wheel holds up to 9 m/s. Drag it to 0.75 and '
      + 'the give is gone — that is the shipped ride, exactly, which makes '
      + 'this slider the A/B. Raising it tightens a fast corner without '
      + 'banking the wheel any further: the extra force is spent on the '
      + "rider's hang, not the machine's lean. The garment floors are measured "
      + 'at the shipped 1.05 and not at this maximum: the hang is '
      + 'atan(this) − atan(the ordinary limit), so 1.6 takes it to 21° and the '
      + "Drunkard's can through his thigh. A ride that wants to keep a value "
      + 'up here re-measures `render/riderClearanceRidden.test.ts` first.',
  },
  {
    path: 'EUC.carveGripExponent',
    group: 'Ride — carve',
    label: 'Grip rise shape',
    unit: '×',
    min: 0.5,
    max: 2,
    step: 0.05,
    note: 'How the give arrives between 9 and 22.25 m/s. 1 is a straight '
      + 'line; above 1 holds the ordinary grip through the middle band and '
      + 'gives it all up near the top; below 1 hands it over early.',
  },
  {
    path: 'EUC.rollResponseSeconds',
    group: 'Ride — carve',
    label: 'Roll response',
    unit: 's',
    min: 0.02,
    max: 0.6,
    step: 0.005,
    note: 'Time constant for the wheel rolling into a carve. Shorter than the '
      + 'lean response so a turn bites immediately.',
  },
  {
    path: 'EUC.riderUpperBodyRollFactor',
    group: 'Ride — carve',
    label: 'Upper-body roll (slow)',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'Fraction of wheel roll retained above the hips below 6 m/s — the '
      + 'low-speed share. A low value lets the bent inside knee and shallow '
      + 'squat keep the shoulders near level in a slow corner. Above 6 m/s the '
      + 'share climbs toward the lean share at speed, below.',
  },
  {
    path: 'EUC.carveLeanShareTop',
    group: 'Ride — carve',
    label: 'Lean share at speed',
    unit: '×',
    min: 0.5,
    // **1.00 — the shipped value — after M30 Phase 2's QA.** §30.3d's rule, and
    // the third time it has been applied: 1.2 → 1.04 the day the hang landed,
    // 1.04 → 1.00 when the ridden sweep gained the Drunkard's sway *phase* as
    // an axis. Phase 2 gives the wheel 1.05 g at speed and saturates its bank
    // at the ordinary 0.75, so the rider hangs inside the machine's line by up
    // to 9.5° before this share multiplies anything, and the can in the
    // Drunkard's fist rides that much nearer his thigh. Measured as ridden
    // across the `?mph=` window with the phase swept
    // (`render/riderClearanceRidden.test.ts`): the worst approach is **41.1 mm
    // at share 1.00 and 39.8 mm at 1.01**, against a 40 mm floor, with the can
    // already carried 8 mm further out than Phase 2 shipped it. Each 0.01 of
    // this slider costs about 1.3 mm of that clearance; the lever for more is
    // the can's carry again, never the floor (q114).
    max: 1,
    step: 0.01,
    note: 'Share of the cornering lean the upper body takes at and above '
      + '22.25 m/s, the shipped terminal (M30). 1.0 is the whole of the '
      + "cornering lean — which, past the wheel's own bank ceiling, already "
      + 'hangs the rider inside the machine. Reached linearly from the slow '
      + 'share at 6 m/s; nothing below 6 m/s moves.',
  },
  // The settle (M30 Phase 3b). Three of its four constants are here because
  // the owner's ride is what judges a transition; `carveLeanHoldRate` is the
  // gate's floor and stays off the panel for the reason the two speed anchors
  // do. A diagnostic panel, not an option (AGENTS.md §30.11).
  {
    path: 'EUC.carveLeanSettleIn',
    group: 'Ride — carve',
    label: 'Lean settle-in (s)',
    unit: 's',
    min: 0.05,
    max: 1.0,
    step: 0.01,
    note: 'How long the upper body takes to climb back to the lean share once '
      + 'the wheel holds its bank. Longer is a lazier, later transition.',
  },
  {
    path: 'EUC.carveLeanSettleOut',
    group: 'Ride — carve',
    label: 'Lean settle-out (s)',
    unit: 's',
    min: 0.02,
    max: 0.3,
    step: 0.01,
    note: 'How fast the body drops back to the slow-speed pose when the wheel '
      + 'starts swinging. Must finish before the wheel crosses upright, or the '
      + "body's angle dips on the far side of a flick.",
  },
  {
    path: 'EUC.carveLeanSwingRate',
    group: 'Ride — carve',
    label: 'Lean swing rate',
    unit: 'rad/s',
    min: 1,
    max: 8,
    step: 0.1,
    note: 'Wheel roll rate at which the body is fully back at the old pose. '
      + 'Lower makes more of a corner count as a swing; higher keeps the full '
      + 'lean through faster flicks.',
  },
  {
    path: 'EUC.wheelPitchFactor',
    group: 'Ride — carve',
    label: 'Wheel pitch',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'Fraction of the rider’s rendered fore-aft pitch that the wheel itself '
      + 'takes. Zero makes acceleration invisible on the wheel.',
  },
  {
    path: 'LIGHTING.exposure',
    group: 'Lighting',
    label: 'Exposure',
    unit: '×',
    min: 0.3,
    max: 2.0,
    step: 0.01,
    note: 'ACES tone-mapping exposure. Lighting is one coupled system — move '
      + 'this, the sun, and the fill one at a time.',
  },
  {
    path: 'LIGHTING.sunIntensity',
    group: 'Lighting',
    label: 'Sun',
    unit: '',
    min: 0,
    max: 6,
    step: 0.05,
    note: 'Directional key light. The only shadow caster.',
  },
  {
    path: 'LIGHTING.hemisphereIntensity',
    group: 'Lighting',
    label: 'Sky fill',
    unit: '',
    min: 0,
    max: 3,
    step: 0.05,
    note: 'Hemisphere fill. Too low and undersides become voids; too high and '
      + 'nothing reads as sitting on the ground.',
  },
  {
    path: 'EUC.riderLookIntoTurn',
    group: 'Ride — carve',
    label: 'Look into turn',
    unit: 'rad',
    min: 0,
    max: 1.0,
    step: 0.01,
    note: 'How far the head turns toward the corner at full lock. Zero makes '
      + 'the rider stare straight ahead through every carve.',
  },
  // The camera is the milestone the panel is for at M3. Tune with F4 open at
  // speed, then move the values you keep into the defaults above.
  {
    path: 'CAMERA.distanceAtRest',
    group: 'Camera',
    label: 'Arm at rest',
    unit: 'm',
    min: 2,
    max: 10,
    step: 0.05,
    note: 'Spring-arm length at a standstill. Together with the value below '
      + 'this is half the speed expression; the other half is field of view.',
  },
  {
    path: 'CAMERA.distanceAtSpeed',
    group: 'Camera',
    label: 'Arm at speed',
    unit: 'm',
    min: 2,
    max: 14,
    step: 0.05,
    note: 'Spring-arm length at the reference speed. Keep it above the rest '
      + 'value or accelerating pulls the camera in, which reads as braking.',
  },
  {
    path: 'CAMERA.speedReference',
    group: 'Camera',
    label: 'Speed reference',
    unit: 'm/s',
    min: 5,
    max: 45,
    step: 0.1,
    note: 'The speed at which the arm, the field of view and the yaw lag are '
      + 'fully spent — the wheel\'s own flat-pavement top speed, 29.1 at the '
      + 'shipped drag. Live since M30 Phase 0 so `?mph=` moves it with the '
      + 'wheel; left behind, 65 mph would be framed exactly like 50.',
  },
  {
    path: 'CAMERA.armHeight',
    group: 'Camera',
    label: 'Arm height',
    unit: 'm',
    min: 0.8,
    max: 5,
    step: 0.05,
    note: 'Height of the camera above the contact patch. Raising it looks '
      + 'further down onto the ground; lowering it exaggerates speed and hides '
      + 'terrain, which the priority order says loses.',
  },
  {
    path: 'CAMERA.fovAtRest',
    group: 'Camera',
    label: 'FOV at rest',
    unit: 'rad',
    min: 0.6,
    max: 1.8,
    step: 0.01,
    note: 'Vertical field of view at a standstill. Eased toward the value '
      + 'below with speed — the strongest speed cue available, and the easiest '
      + 'one to make somebody ill with.',
  },
  {
    path: 'CAMERA.fovAtSpeed',
    group: 'Camera',
    label: 'FOV at speed',
    unit: 'rad',
    min: 0.6,
    max: 2.0,
    step: 0.01,
    note: 'Vertical field of view at the reference speed. A wide gap between '
      + 'the two is the strongest speed sensation and the fastest route to '
      + 'motion sickness; move it a little at a time.',
  },
  {
    path: 'CAMERA.splitFovGain',
    group: 'Camera',
    label: 'Split FOV gain',
    unit: 'x',
    min: 1,
    max: 1.6,
    step: 0.01,
    note: 'How much wider the vertical field of view goes when the screen is '
      + 'split two ways. 1.0 is a keyhole — half the screen and far less than '
      + 'half the road. Single-player frames ignore this entirely.',
  },
  {
    path: 'CAMERA.splitFovCap',
    group: 'Camera',
    label: 'Split FOV cap',
    unit: 'rad',
    min: 1.1,
    max: 1.9,
    step: 0.01,
    note: 'Where the widening above stops. Set it at or below the gained '
      + 'resting angle and the speed ease disappears, because both ends clamp '
      + 'to the same value.',
  },
  {
    path: 'CAMERA.quadFovGain',
    group: 'Camera',
    label: 'Quad FOV gain',
    unit: 'x',
    min: 0.8,
    max: 1.6,
    step: 0.01,
    note: 'The same widening for a three- or four-way grid, which needs almost '
      + 'none: a quadrant keeps the whole screen\'s 16:9 and loses no '
      + 'horizontal angle. Ships at 1.0 — off. The cap above still applies.',
  },
  {
    path: 'CAMERA.lookAheadSeconds',
    group: 'Camera',
    label: 'Look-ahead',
    unit: 's',
    min: 0,
    max: 0.8,
    step: 0.01,
    note: 'How far ahead the camera aims, in seconds of travel. This is what '
      + 'answers "can I see where I am going"; zero aims at the rider.',
  },
  {
    path: 'CAMERA.yawLagAtRest',
    group: 'Camera',
    label: 'Yaw lag at rest',
    unit: 's',
    min: 0.02,
    max: 1.2,
    step: 0.01,
    note: 'Follow time constant at a standstill. Long on purpose: the wheel '
      + 'pivots at 2.4 rad/s down there and a tight camera would whip.',
  },
  {
    path: 'CAMERA.yawLagAtSpeed',
    group: 'Camera',
    label: 'Yaw lag at speed',
    unit: 's',
    min: 0.02,
    max: 1.2,
    step: 0.01,
    note: 'Follow time constant at the reference speed. Keep it below the rest '
      + 'value — locked-in at speed, forgiving when manoeuvring.',
  },
  {
    path: 'CAMERA.bankFactor',
    group: 'Camera',
    label: 'Bank',
    unit: '×',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'Camera roll as a fraction of the wheel’s lean, into the corner and '
      + 'capped. Raising it tilts the horizon, which costs terrain '
      + 'readability — and uncapped bank is a motion-sickness trap.',
  },
  {
    path: 'INSPECTION_CAMERA.orbitRate',
    group: 'Camera',
    label: 'Inspection orbit',
    unit: 'rad/s',
    min: 0,
    max: 1.5,
    step: 0.01,
    note: 'Rate of the diagnostic orbit reached with C. Zero holds a fixed '
      + 'angle for a screenshot. Never an acceptance view.',
  },
  {
    path: 'SIMULATION.maxStepsPerFrame',
    group: 'Loop',
    label: 'Max catch-up steps',
    unit: 'steps',
    min: 1,
    max: 12,
    step: 1,
    note: 'Catch-up ceiling per frame. Lower it to see the loop deliberately '
      + 'drop time instead of spiralling.',
  },
  {
    path: 'RENDER.maxPixelRatio',
    group: 'Render',
    label: 'Pixel ratio cap',
    unit: '×',
    min: 0.5,
    max: 3,
    step: 0.05,
    note: 'Device-pixel ceiling. Changing only this must not be treated as a '
      + 'viewport change.',
  },

  // Ultra graphics (M39, `docs/M39_ULTRA.md`). The fifteen `UltraLiveTuning`
  // fields, in that interface's order (the thirteen W4 values, then the
  // static-shade lift's two). **Ultra-only:** Low, Medium and High
  // never read one, so on an ordinary tier these sliders move nothing — which
  // is why every note says so rather than leaving the panel to teach it.
  // `Game.applyTuning` forwards them through `readUltraLive` (W1), and the
  // U2 captures move them with `ultra-compare --tune`.
  {
    path: 'ULTRA.nearBias',
    group: 'Ultra — shadow',
    label: 'Near shadow bias',
    unit: '',
    // Up to +0.001 so the gauntlet's planted acne (`nearBias=0`) is reachable.
    min: -0.002,
    max: 0.001,
    step: 0.00005,
    note: 'Ultra only. Depth bias of the 4096 near cascade. Toward zero brings '
      + 'acne on sunlit faces; too negative lifts shadows off their casters.',
  },
  {
    path: 'ULTRA.nearNormalBias',
    group: 'Ultra — shadow',
    label: 'Near normal bias',
    unit: 'm',
    min: 0,
    max: 0.1,
    step: 0.001,
    note: 'Ultra only. Normal offset of the near cascade. Check at Switchback’s '
      + '33° sun, where acne shows first.',
  },
  {
    path: 'ULTRA.nearRadius',
    group: 'Ultra — shadow',
    label: 'Near PCF radius',
    unit: 'texels',
    min: 0,
    max: 4,
    step: 0.05,
    note: 'Ultra only. Softness of the near cascade’s edge. Wider hides crawl '
      + 'and costs crispness under the rider.',
  },
  {
    path: 'ULTRA.envKappa',
    group: 'Ultra — fill',
    label: 'Environment κ',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.01,
    note: 'Ultra only. Scales the painted-sky environment fill against the '
      + 'venue’s hemisphere value. Calibrated so up-facing shade matches High.',
  },
  {
    path: 'ULTRA.bounceLift',
    group: 'Ultra — fill',
    label: 'Ground bounce β',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.05,
    note: 'Ultra only. Brightness of the environment’s lower half — the warm '
      + 'bounce that lifts walls and canopies. Rebuilds the environment.',
  },
  {
    path: 'ULTRA.groundSpec',
    group: 'Ultra — response',
    label: 'Ground reflection',
    unit: '×',
    min: 0,
    max: 1.5,
    step: 0.05,
    note: 'Ultra only. Indirect specular on the ground. The road must stay the '
      + 'calmest plane in the frame.',
  },
  {
    path: 'ULTRA.glassSpec',
    group: 'Ultra — response',
    label: 'Glass reflection',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.05,
    note: 'Ultra only. How much painted sky the glass shows. Glass should never '
      + 'outshine the lit wall except for a sun glint.',
  },
  {
    path: 'ULTRA.waterSpec',
    group: 'Ultra — response',
    label: 'Water reflection',
    unit: '×',
    min: 0,
    max: 2,
    step: 0.05,
    note: 'Ultra only. Puddle sky tint. The body stays 0.55–0.85 of the road and '
      + 'the meniscus the brightest ring.',
  },
  {
    path: 'ULTRA.contactStrength',
    group: 'Ultra — response',
    label: 'Contact AO strength',
    unit: '×',
    min: 0,
    max: 1.5,
    step: 0.05,
    note: 'Ultra only. Scales the analytic contact darkening under props and '
      + 'walls. Darken-only, never below its floor.',
  },
  {
    path: 'ULTRA.contactDirectShare',
    group: 'Ultra — response',
    label: 'Contact AO on sun',
    unit: '',
    min: 0,
    max: 0.3,
    step: 0.01,
    note: 'Ultra only. Share of contact AO applied to direct light, on non-road '
      + 'surfaces. Zero keeps the sunlit road exactly as bright as High.',
  },
  {
    path: 'ULTRA.foliageWrap',
    group: 'Ultra — response',
    label: 'Foliage wrap',
    unit: '',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'Ultra only. Wrap lighting on crowns and conifers, so the terminator '
      + 'is soft rather than a black half.',
  },
  {
    path: 'ULTRA.foliageTransmission',
    group: 'Ultra — response',
    label: 'Foliage back-light',
    unit: '',
    min: 0,
    max: 0.22,
    step: 0.01,
    note: 'Ultra only. Warm back-lit rims on leaves, already shadowed. Capped at '
      + '0.22 so trees never glow in building shade.',
  },
  {
    path: 'ULTRA.specAA',
    group: 'Ultra — response',
    label: 'Specular AA',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'Ultra only. Geometric roughness floor against sparkle on glossy glass, '
      + 'metal and water at distance.',
  },
  // The static-shade lift's two amounts (A14/A20; final touch, post round 4):
  // `UltraLiveTuning.shadeLift` / `.shadeLiftFar`, forwarded like the thirteen
  // above to the shared `ultraShadeLift` / `ultraShadeLiftFar` uniforms that
  // the ground, road-paint and block patches read. On the panel so the owner
  // can judge the round-4 trades on his ride: Trade 1(b), a lighter near
  // street in building shade (the rider's only separation lever), and
  // Trade 2(b), a paler distant slab. The near value is A28's (Codex's
  // post-GU QA reopened Trades 1 and 2); the far one is U5's again (A29:
  // round 5 rejected A28's paler slab).
  {
    path: 'ULTRA.shade.lift',
    group: 'Ultra — shade',
    label: 'Street shade lift (near)',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.05,
    note: 'Ultra only. Raise to brighten building shade on the street; the '
      + 'critics’ Trade 1/2. The lift within 20 m of the camera (2.2 holds the '
      + 'commercial canyon at 0.755 × its sunlit road, A28); 0 turns the lift off. '
      + 'Turf takes 0.4 of it past 20 m (tree shade on grass, Trade 3). '
      + 'The rider’s own shadow stays dark, except within about 0.8 m of '
      + 'building or tree shade.',
  },
  {
    path: 'ULTRA.shade.liftFar',
    group: 'Ultra — shade',
    label: 'Street shade lift (far)',
    unit: '×',
    min: 0,
    max: 4,
    step: 0.05,
    note: 'Ultra only. Raise to brighten building shade on the street; the '
      + 'critics’ Trade 1/2. The lift from 36 m out, ramped from the near one '
      + 'over 20–36 m: raise it for a paler industrial crest slab (Trade 2b). '
      + '2.2 is U5’s value (A29: round 5 preferred U5’s slab to A28’s paler 2.5).',
  },
  // The owner's pixel knob (M39 §2.1 and §9 q4; Fable I4): not one of the
  // fifteen `UltraLiveTuning` values, so it travels on its own push
  // (`Game.applyTuning` → `GameRenderer.setUltraPixelBudget`). The runtime
  // reads it only while Ultra draws; an ordinary tier's ratio never sees it.
  {
    path: 'ULTRA.pixelBudget',
    group: 'Ultra — pixels',
    label: 'Ultra pixel budget',
    unit: 'px',
    // From about 1 MP to past a 4K panel's 8,294,400, on a 64,000 grid that
    // lands on the shipped 5,184,000 (A26, the Air's retina buffer) and on
    // the earlier 4,096,000 (its native panel).
    min: 1_024_000,
    max: 8_320_000,
    step: 64_000,
    note: 'Ultra only. Most device pixels an Ultra frame may draw; never more '
      + 'than High’s own ratio. 5,184,000 draws an Air at retina; 8,294,400 a 4K '
      + 'panel at 1×. Under 2,000,000 px the shadow maps drop to 2048, live (once '
      + 'on, they drop only under 1,800,000).',
  },

  // Audio (M8). Balance is the whole of this milestone's exit question, and
  // balance is judged by ear on a real ride — so the levels that decide it are
  // on the panel rather than only in the defaults above. These are developer
  // tuning, NOT the player's volume sliders: those are a separate mechanism
  // that arrives with the M9 options screen and never routes through here
  // (AGENTS.md invariant 5).
  //
  // The four motor sliders default to ZERO since the third pass — rule 5, the
  // owner's near-silence decision. They are kept on the panel because raising
  // them revives the measured M8-rework motor unchanged, which is exactly the
  // experiment "was silence right?" needs to stay cheap.
  {
    path: 'AUDIO.bedTrim',
    group: 'Audio',
    label: 'Ride bed trim',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'Everything the wheel and the world make — motor, wind, tyre, '
      + 'scrape — against warnings and impacts, which are trimmed separately. '
      + 'Lower it if the beeps have to shout.',
  },
  {
    path: 'AUDIO.speedReference',
    group: 'Audio',
    label: 'Speed reference',
    unit: 'm/s',
    min: 5,
    max: 45,
    step: 0.1,
    note: 'Where the wind, the tyre and the whine saturate — the wheel\'s own '
      + 'flat-pavement top speed, 29.1 at the shipped drag. Live since M30 '
      + 'Phase 0 so `?mph=` moves it with the wheel; left behind, every '
      + 'sound would be identical from 50 mph to 65.',
  },
  {
    path: 'AUDIO.motorPolePairs',
    group: 'Audio',
    label: 'Motor pole pairs',
    unit: '',
    min: 1,
    max: 30,
    step: 1,
    note: 'Multiplies wheel rotation to reach the electrical fundamental. The '
      + 'single number that decides whether it sounds like a hub motor or like '
      + 'an engine. 15 puts top speed near 143 Hz, where a real wheel sits.',
  },
  {
    path: 'AUDIO.motorIdleLevel',
    group: 'Audio',
    label: 'Motor idle hum',
    unit: '',
    min: 0,
    max: 0.4,
    step: 0.01,
    note: 'The fundamental at zero load — the parked hum. Zero since rule 5: '
      + 'a real EUC is nearly silent, and the owner asked for that silence. '
      + '0.09 restores the measured second-pass hum.',
  },
  {
    path: 'AUDIO.motorLoadLevel',
    group: 'Audio',
    label: 'Motor load response',
    unit: '',
    min: 0,
    max: 0.8,
    step: 0.01,
    note: 'How much louder the fundamental gets between coasting and full '
      + 'demand. This is what makes the motor answer the throttle rather than '
      + 'merely track the speedometer.',
  },
  {
    path: 'AUDIO.motorSingLevel',
    group: 'Audio',
    label: 'Motor third harmonic',
    unit: '',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'The exact third harmonic at the reference speed — the body of the '
      + 'motor. Raise it for a more present machine; it cannot growl, because '
      + 'it is locked to the fundamental rather than detuned against it.',
  },
  {
    path: 'AUDIO.motorAirLevel',
    group: 'Audio',
    label: 'Motor sixth harmonic',
    unit: '',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'The top of the turbine, arriving late so that it means speed rather '
      + 'than motion. This is the partial that says top speed is not 8 m/s from '
      + 'inside the machine, as the wind says it from outside.',
  },
  {
    path: 'AUDIO.regenLevel',
    group: 'Audio',
    label: 'Regen braking',
    unit: '',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'The octave partial under the braking filter sweep. It is what makes '
      + 'slowing down a different event from speeding up.',
  },
  {
    path: 'AUDIO.motorLoadBrighten',
    group: 'Audio',
    label: 'Load brightness',
    unit: '×',
    min: 1,
    max: 5,
    step: 0.05,
    note: 'How far full load opens the motor filter. This is where working '
      + 'hard is heard — an electric motor under load brightens, it does not '
      + 'chug, and a modulated sub-octave here is what a lawnmower sounds like.',
  },
  {
    path: 'AUDIO.windLevel',
    group: 'Audio',
    label: 'Wind',
    unit: '',
    min: 0,
    max: 0.8,
    step: 0.01,
    note: 'The approved howl loop, rising faster than linearly with speed — '
      + 'with the motor silent this is the whole speed voice. The owner set '
      + 'its ceiling by ear: "not too loud or it will be annoying".',
  },
  {
    path: 'AUDIO.tyreLevel',
    group: 'Audio',
    label: 'Tyre',
    unit: '',
    min: 0,
    max: 0.9,
    step: 0.01,
    note: 'Master level over the per-surface voices. Raise it to make surface '
      + 'changes more obvious; the relative voices keep their proportions.',
  },
  {
    path: 'AUDIO.sirenLevel',
    group: 'Audio',
    label: 'Siren',
    unit: '',
    min: 0,
    max: 1,
    step: 0.02,
    note: 'The cop\'s siren at point-blank range; its level follows his '
      + 'distance, so this is the ceiling, not the constant. Zero silences '
      + 'the whole voice — the annoyance kill-switch the standing rule '
      + 'demands.',
  },
  {
    path: 'AUDIO.overspeedLevel',
    group: 'Audio',
    label: 'Over-speed beeps',
    unit: '',
    min: 0,
    max: 1,
    step: 0.02,
    note: 'The max-speed warning (M20). Its *rate* is what carries the '
      + 'message, so this is loudness only and nothing here changes the '
      + 'timing. Zero silences the beeps but does NOT remove the cutout — '
      + 'use "Max-speed cutout" for that, because a cutout with no warning '
      + 'is the unfairness this whole feature is built to avoid.',
  },
  {
    path: 'AUDIO.beepLevel',
    group: 'Audio',
    label: 'Warning beeps',
    unit: '',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'Master over the whole power-ladder beep set, silenced by owner '
      + 'decision — arcade, not sim; the HUD light still climbs the ladder. '
      + '1 restores all three rungs exactly as they shipped in the second '
      + 'pass.',
  },
  {
    path: 'AUDIO.tiltBackLevel',
    group: 'Audio',
    label: 'Tilt-back beep',
    unit: '',
    min: 0,
    max: 0.8,
    step: 0.01,
    note: 'The top rung of the power ladder, under the Warning beeps master. '
      + 'It should be unmissable without being painful — if it needs to go '
      + 'above about 0.5, duck harder instead.',
  },
  {
    path: 'AUDIO.swingLevel',
    group: 'Audio',
    label: 'Paddle whoosh',
    unit: '',
    min: 0,
    max: 0.6,
    step: 0.01,
    note: 'The sound of a swing, whether or not it connects. It fires on every '
      + 'attempt, so it is the one in this mode most at risk of becoming '
      + 'annoying — keep it under the hit.',
  },
  {
    path: 'AUDIO.raceCountLevel',
    group: 'Audio',
    label: 'Race countdown',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'The 3-2-1 tone on a race grid. Its own cue and its own duck — it '
      + 'shares nothing with the power ladder, so turning it down cannot '
      + 'revive the over-speed beeping M13 removed.',
  },
  {
    path: 'AUDIO.raceGoLevel',
    group: 'Audio',
    label: 'Race GO',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    note: 'The release, an octave above the count. Louder on purpose: it is '
      + 'the one instruction in the mode and four people are listening for it.',
  },
  {
    path: 'AUDIO.hitLevel',
    group: 'Audio',
    label: 'Paddle hit',
    unit: '',
    min: 0,
    max: 0.9,
    step: 0.01,
    note: 'The payoff. It should read as clearly different from the whoosh at a '
      + 'glance rather than merely louder — if it needs to go much above the '
      + 'default to be unmistakable, the two are too alike in tone.',
  },
  {
    path: 'AUDIO.duckTiltBack',
    group: 'Audio',
    label: 'Tilt-back duck',
    unit: '',
    min: 0,
    max: 0.9,
    step: 0.01,
    note: 'How far the ride bed drops while the top warning sounds. This, not '
      + 'the beep level, is the real answer to "is the right thing the loudest '
      + 'thing?"',
  },

  {
    path: 'KNOCKABOUT.matchKnockdowns',
    group: 'Ride — Knockabout',
    label: 'Knockdowns to win',
    unit: '',
    min: 1,
    max: 15,
    step: 1,
    note: 'How many knockdowns end a two-player match. Discs never count '
      + 'toward it — they are a side tally, so nobody wins a fight by farming '
      + 'scenery.',
  },

  // Rider contact — M26 Phase 0. These move during the parked-rider ride gate;
  // they are physical developer tuning and never enter GameOptions.
  {
    path: 'RACE.laps',
    group: 'Ride — race',
    label: 'Laps',
    unit: '',
    min: 1,
    max: 10,
    step: 1,
    note: 'How many laps a couch race is. Three makes a 2-4 minute race at '
      + 'BelVar. There is deliberately no picker on the join panel — this is '
      + 'the knob, and the ride gate is what it is for.',
  },
  {
    path: 'RACE.countdownSeconds',
    group: 'Ride — race',
    label: 'Countdown',
    unit: 's',
    min: 0,
    max: 10,
    step: 0.5,
    note: 'How long the grid is held before GO. Nobody can steer, throttle or '
      + 'hop until it runs out. Zero is a legal setting and means an instant '
      + 'start.',
  },
  {
    path: 'RACE.finishGraceSeconds',
    group: 'Ride — race',
    label: 'Finish grace',
    unit: 's',
    min: 0,
    max: 60,
    step: 1,
    note: 'How long the race waits for the field after the leader crosses. '
      + 'Ships at 0, which switches the cap off and lets everybody finish the '
      + 'lap they are on; anything above it ends the race there and classifies '
      + 'whoever is still out by how far round they are.',
  },
  {
    path: 'CONTACT.radiusMetres',
    group: 'Ride — contact',
    label: 'Contact radius',
    unit: 'm',
    min: 0.4,
    max: 1.5,
    step: 0.02,
    note: 'Centre-to-centre distance that counts as contact. Start at two rider '
      + 'hit radii plus a thin skin; larger values make a bump happen before the '
      + 'machines visibly meet.',
  },
  {
    path: 'CONTACT.cooldownSeconds',
    group: 'Ride — contact',
    label: 'Contact cooldown',
    unit: 's',
    min: 0,
    max: 2,
    step: 0.02,
    note: 'How long one continuously merged pair waits before another bump. It '
      + 'must outlast the separation or one collision chatters.',
  },
  {
    path: 'CONTACT.separationSpeed',
    group: 'Ride — contact',
    label: 'Separation push',
    unit: 'm/s',
    min: 0,
    max: 6,
    step: 0.1,
    note: 'Velocity added to each rider away from the other. Tune for a readable '
      + 'shove without turning contact into a launch.',
  },
  {
    path: 'CONTACT.speedCost',
    group: 'Ride — contact',
    label: 'Contact speed cost',
    unit: 'm/s',
    min: 0,
    max: 10,
    step: 0.1,
    note: 'Speed each rider loses after the separation push. A shoulder stays '
      + 'well below the paddle strike cost and may never become a crash.',
  },

  // The chase — M18. A long block on purpose: the milestone is decided by one
  // owner ride, the plan's remedy for anything unfun is "the mode's knobs move
  // at F4 in the session", and a knob that is not here cannot move during it.
  {
    path: 'CHASE.copSkill',
    group: 'Ride — chase',
    label: 'Cop skill',
    unit: '',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How well the cop rides — his line and how early he brakes, never his '
      + 'speed. He is on the player’s own wheel with the player’s own tuning, so '
      + 'this is the only honest difficulty control the mode has.',
  },
  {
    path: 'CHASE.escapeSeconds',
    group: 'Ride — chase',
    label: 'Escape time',
    unit: 's',
    min: 30,
    max: 600,
    step: 10,
    note: 'How long you have to survive. Five minutes is the owner’s answer; '
      + 'lower it to reach the results screen quickly while tuning anything else '
      + 'in this group.',
  },
  {
    path: 'CHASE.spawnGapMetres',
    group: 'Ride — chase',
    label: 'Spawn gap',
    unit: 'm',
    min: 5,
    max: 80,
    step: 1,
    note: 'How far behind you the cop starts. Small numbers make the opening '
      + 'frantic; large ones give you a quiet minute, which teaches the wrong '
      + 'thing about the mode.',
  },
  {
    path: 'CHASE.bustRadiusMetres',
    group: 'Ride — chase',
    label: 'Bust radius',
    unit: 'm',
    min: 2,
    max: 40,
    step: 1,
    note: 'How close he has to be for a crash to end the run. This is the whole '
      + 'difference between pressure and tag — raise it and every crash is a '
      + 'bust, drop it and crashing costs only the recovery.',
  },
  {
    path: 'CHASE.touchBustMetres',
    group: 'Ride — chase',
    label: 'Touch-bust reach',
    unit: 'm',
    min: 0.5,
    max: 4,
    step: 0.1,
    note: 'How close counts as touching Officer Dorkins. The bust fires only '
      + 'when the rider is the one closing, so raising this widens the ram '
      + 'zone without ever letting him score by ramming you.',
  },
  {
    path: 'CHASE.touchBustClosingSpeed',
    group: 'Ride — chase',
    label: 'Touch-bust closing',
    unit: 'm/s',
    min: 0.1,
    max: 5,
    step: 0.1,
    note: 'How fast you must be moving into him for a touch to be your ram. '
      + 'Below it, brushing past costs nothing; drop it toward 0.1 and wobble '
      + 'drift near him starts to count.',
  },
  {
    path: 'CHASE.trackerGapMetres',
    group: 'Ride — chase',
    label: 'Tracker gap',
    unit: 'm',
    min: 60,
    max: 400,
    step: 10,
    note: 'How far you can stretch the gap before the super tracker regroups '
      + 'him onto your tail. Raise it toward 400 and distance becomes an escape '
      + 'again; the mode is about the tension.',
  },
  {
    path: 'CHASE.trackerReturnMetres',
    group: 'Ride — chase',
    label: 'Tracker return',
    unit: 'm',
    min: 20,
    max: 200,
    step: 5,
    note: 'How far behind you he turns up again. Just inside the siren’s far '
      + 'edge (60 m) he arrives at a few per cent and fades in; past it he '
      + 'arrives silent and, two equal wheels never closing a straight, stays '
      + 'silent. Keep it under the quiet gap.',
  },
  {
    path: 'CHASE.trackerHoldSeconds',
    group: 'Ride — chase',
    label: 'Tracker hold',
    unit: 's',
    min: 1,
    max: 15,
    step: 0.5,
    note: 'How long the gap must stay blown out before he regroups. Long '
      + 'enough that a building or one long corner between you never counts.',
  },
  {
    path: 'CHASE.trackerQuietGapMetres',
    group: 'Ride — chase',
    label: 'Quiet gap',
    unit: 'm',
    min: 40,
    max: 200,
    step: 5,
    note: 'Beyond this the chase counts as quiet — the siren’s far edge (60 m), '
      + 'so quiet means what you hear; the clock only resets 5 m inside it. '
      + 'Keep it above the tracker return or every regroup re-demands.',
  },
  {
    path: 'CHASE.trackerQuietSeconds',
    group: 'Ride — chase',
    label: 'Quiet seconds',
    unit: 's',
    min: 1,
    max: 60,
    step: 0.5,
    note: 'How long a quiet spell may last before he is brought back. The '
      + 'longest stretch of free riding the mode allows.',
  },
  {
    path: 'CHASE.trackerRespiteSeconds',
    group: 'Ride — chase',
    label: 'Crash respite',
    unit: 's',
    min: 0,
    max: 30,
    step: 1,
    note: 'After he stands up from a crash you led him into, no regroup for '
      + 'this long. The breathing room a clever line earns.',
  },
  {
    path: 'CHASE.trackerStallSeconds',
    group: 'Ride — chase',
    label: 'Stall seconds',
    unit: 's',
    min: 1,
    max: 30,
    step: 0.5,
    note: 'A cop going nowhere for this long, well away from you, is stuck on '
      + 'something and is brought back.',
  },
  {
    path: 'CHASE.pursuitNearMetres',
    group: 'Ride — chase',
    label: 'Close pursuit',
    unit: 'm',
    min: 5,
    max: 60,
    step: 5,
    note: 'Inside this he copies your line and keeps his cornering margin. '
      + 'Between here and the far edge those habits fade.',
  },
  {
    path: 'CHASE.pursuitFarMetres',
    group: 'Ride — chase',
    label: 'Far pursuit',
    unit: 'm',
    min: 20,
    max: 150,
    step: 5,
    note: 'Beyond this he rides his own racing line at the hot margin. Set it '
      + 'below the close edge and the far habits win everywhere.',
  },
  {
    path: 'CHASE.hotCorneringMargin',
    group: 'Ride — chase',
    label: 'Hot margin',
    unit: '×',
    min: 0.5,
    max: 1,
    step: 0.05,
    note: 'His cornering margin when far behind. 1 is the grip limit you ride '
      + 'at; the shipped 0.85 is a cop who corners hard and never crashes on '
      + 'the pinned sweep.',
  },
  {
    path: 'CHASE.strayLimitMetres',
    group: 'Ride — chase',
    label: 'Stray limit',
    unit: 'm',
    min: 8,
    max: 120,
    step: 2,
    note: 'How far off the route you may ride before the warning starts. It '
      + 'exists to refuse "point at the grass and hold throttle", not to keep '
      + 'you on the tarmac — nothing outside this mode has a boundary.',
  },
  {
    path: 'CHASE.strayGraceSeconds',
    group: 'Ride — chase',
    label: 'Stray grace',
    unit: 's',
    min: 1,
    max: 30,
    step: 0.5,
    note: 'How long you may stay out there. Long enough that running wide onto '
      + 'the verge and coming back is never a bust.',
  },
  {
    path: 'CHASE.fieldRangeMetres',
    group: 'Ride — chase',
    label: 'Cop field range',
    unit: 'm',
    min: 10,
    max: 120,
    step: 5,
    note: 'How close an off-road rider has to be before the cop leaves the '
      + 'tarmac and comes across the grass at them. Keep it past the stray '
      + 'limit or standing just off the road becomes safe again.',
  },
  {
    path: 'CHASE.lookaheadSeconds',
    group: 'Ride — chase',
    label: 'Cop lookahead',
    unit: 's',
    min: 0.15,
    max: 2,
    step: 0.05,
    note: 'How far ahead the cop aims, in seconds of his own travel. Short and '
      + 'he saws at the wheel; long and he cuts corners onto the verge.',
  },
  {
    path: 'CHASE.steerGain',
    group: 'Ride — chase',
    label: 'Cop steering',
    unit: '',
    min: 0.2,
    max: 5,
    step: 0.1,
    note: 'Steering per radian of bearing error. His only steering authority — '
      + 'there is no second gain and nothing writes a yaw rate directly.',
  },
  {
    path: 'CHASE.steerDamping',
    group: 'Ride — chase',
    label: 'Cop steer damping',
    unit: '',
    min: 0,
    max: 1.5,
    step: 0.02,
    note: 'Counter-steer against his own turn rate. This is what stops the '
      + 'pursuit weaving, and a weaving cop reads as a bug rather than a rival.',
  },
  {
    path: 'CHASE.cutoutMarginShare',
    group: 'Chase — brain',
    label: 'Cop speed ceiling',
    unit: 'x cutout speed',
    min: 0.80,
    max: 1.00,
    step: 0.005,
    note: 'How close to the max-speed cutout the cop is willing to ride. At 1 '
      + 'he rides straight into it and wipes out on long straights, which is '
      + 'a real (and funny) higher-tier option rather than a bug — but it is a '
      + 'design change, not a tune.',
  },
  {
    path: 'CHASE.throttleGain',
    group: 'Ride — chase',
    label: 'Cop throttle',
    unit: '',
    min: 0.05,
    max: 2,
    step: 0.05,
    note: 'Throttle per m/s of speed error. Too high and he pumps the throttle '
      + 'on every correction, which you hear before you see.',
  },
  {
    path: 'CHASE.corneringMargin',
    group: 'Ride — chase',
    label: 'Cop cornering margin',
    unit: '×',
    min: 0.3,
    max: 1,
    step: 0.02,
    note: 'Share of the wheel’s lateral limit he will spend in a corner. At 1 he '
      + 'is one bump from the ground, which is a cop who crashes for reasons the '
      + 'player did not cause.',
  },
  {
    path: 'CHASE.brakeSafety',
    group: 'Ride — chase',
    label: 'Cop brake safety',
    unit: '×',
    min: 1,
    max: 3,
    step: 0.05,
    note: 'Safety factor on the braking distance he leaves for a hazard he '
      + 'cannot swerve around. At 1 he arrives doing exactly the speed that '
      + 'crashes.',
  },
  {
    path: 'CHASE.hazardClearanceMetres',
    group: 'Ride — chase',
    label: 'Cop hazard clearance',
    unit: 'm',
    min: 0,
    max: 4,
    step: 0.1,
    note: 'Room he leaves either side of a hazard he passes. Drop it and he '
      + 'clips potholes — which is a crash you did not earn by leading him '
      + 'there.',
  },
  {
    path: 'CHASE.swingRangeMetres',
    group: 'Ride — chase',
    label: 'Cop swing range',
    unit: 'm',
    min: 1,
    max: 8,
    step: 0.1,
    note: 'How close he has to be before he throws a swing. Beyond the paddle’s '
      + 'own reach on purpose: a swing started on arrival always lands late.',
  },
  {
    path: 'CHASE.swingCooldownSeconds',
    group: 'Ride — chase',
    label: 'Cop swing cooldown',
    unit: 's',
    min: 0,
    max: 5,
    step: 0.1,
    note: 'Shortest gap between two of his swings. The swing cycle already costs '
      + 'most of this; the floor keeps a cop riding alongside from becoming a '
      + 'metronome.',
  },
  {
    path: 'CHASE.riderHitRadius',
    group: 'Ride — chase',
    label: 'Your hit radius',
    unit: 'm',
    min: 0.1,
    max: 2,
    step: 0.05,
    note: 'How big a target you are to his paddle. It is the trunk’s own '
      + 'half-width, so raising it makes him land strikes you would say missed.',
  },
  {
    path: 'CHASE.strikeSpeedCost',
    group: 'Ride — chase',
    label: 'Strike speed cost',
    unit: 'm/s',
    min: 0,
    max: 15,
    step: 0.25,
    note: 'Speed a landed strike costs you. The wobble that comes with it is the '
      + 'soft-body knock’s own and is not a slider, by the standing rule — what '
      + 'ends the run is the crash you fail to ride out of.',
  },

  // The pack and the room — M39 Part P (§39.6b.7). The solo face's four
  // knobs, then the couch face's four; `CHASE.roomSize` is deliberately
  // absent (q207 froze the count, and `?cops=` is the A/B probe).
  {
    path: 'CHASE.postStandoffMetres',
    group: 'Ride — chase',
    label: 'Post stand-off',
    unit: 'm',
    min: 1,
    max: 8,
    step: 0.5,
    note: 'How far a parked patrol stands off the through line — off the kerb '
      + 'on the roomier side, clamped inside the corridor. The posts are chosen '
      + 'once per world, so a change applies from the next route.',
  },
  {
    path: 'CHASE.patrolWakeMetres',
    group: 'Ride — chase',
    label: 'Wake range',
    unit: 'm',
    min: 20,
    max: 150,
    step: 5,
    note: 'How close you come before a parked patrol wakes. At 60 m it is the '
      + 'siren’s own onset, so the wake is heard as it happens; below it a '
      + 'parked patrol stays silent until you are that close and the siren '
      + 'starts as he wakes; above it one wakes in silence beyond the siren line.',
  },
  {
    path: 'CHASE.patrolReturnMetres',
    group: 'Ride — chase',
    label: 'Patrol return',
    unit: 'm',
    min: 100,
    max: 500,
    step: 10,
    note: 'The least distance ahead a patrol may be returned to a post, and how '
      + 'far a pane counts as seeing. Lower it and returns land closer ahead — '
      + 'too low and a cop can reappear where you could have seen him. At 470 m '
      + '(the fog’s far edge) nothing can appear in view, but most forward '
      + 'returns are refused and the chase goes quieter.',
  },
  {
    path: 'CHASE.packSpacingMetres',
    group: 'Ride — chase',
    label: 'Pack spacing',
    unit: 'm',
    min: 2,
    max: 15,
    step: 0.5,
    note: 'The pack’s pitch by route: a cop this close behind a packmate takes '
      + 'the roomier side of him, and a return spot this close to another cop is '
      + 'refused. Raise it if the cops ride in a line; lower it for a tighter box.',
  },
  {
    path: 'CHASE.couchEscapeSeconds',
    group: 'Ride — chase',
    label: 'Couch bell',
    unit: 's',
    min: 30,
    max: 600,
    step: 10,
    note: 'How long the outlaws must last in a couch chase; a human cop wins '
      + 'only by busting everyone before it. The solo five minutes until the '
      + 'ride says otherwise. Shortening it never shortens the solo chase.',
  },
  {
    path: 'CHASE.dealHoldSeconds',
    group: 'Ride — chase',
    label: 'Deal hold',
    unit: 's',
    min: 0,
    max: 30,
    step: 0.5,
    note: 'How long a CPU cop keeps the outlaw he was dealt before he may be '
      + 'dealt another. Long enough to commit to a corner; short enough that a '
      + 'nearer unchased outlaw is taken inside a straight.',
  },
  {
    path: 'CHASE.returnConeRadians',
    group: 'Ride — chase',
    label: 'Return cone',
    unit: 'rad',
    min: 0.5,
    max: 2,
    step: 0.05,
    note: 'Half-angle of every player’s view for the return rule: no cop is '
      + 'returned where anyone is looking. The widest pane measured on a 16:9 '
      + 'to 21:9 window is 1.16 rad; a wider pane is measured live and always '
      + 'honoured, so narrowing this only removes the turn margin.',
  },
  {
    path: 'CHASE.copHoldSeconds',
    group: 'Ride — chase',
    label: 'Cop hold',
    unit: 's',
    min: 0,
    max: 15,
    step: 0.5,
    note: 'How long every cop is held after GO — hide-and-seek. 0 switches it '
      + 'off and the 20 m spawn gap is the head start; try 5 s if a human cop '
      + 'never closes, or closes too fast.',
  },
]);


/** Shared living-world simulation tuning. Units are metres, seconds, metres/second and radians. */
/** Whole-source ground observation caps, counts per query. Exceeding one returns
 * UNKNOWN/overflow; no checked prefix is ever called a complete certificate.
 * These are work bounds, not terrain tolerances or new physical admission limits. */
export const GROUND_CERTIFICATE = Object.freeze({
  maximumFieldCells: 256,
  maximumGridCells: 64,
  maximumColliderReferences: 512,
  maximumHazardReferences: 128,
});

export const POPULATION = Object.freeze({
  maximumStepSeconds: 0.25,
  humanAccelerationMetresPerSecondSquared: 2.2,
  humanBrakingMetresPerSecondSquared: 3.4,
  vehicleAccelerationMetresPerSecondSquared: 0.9,
  vehicleBrakingMetresPerSecondSquared: 2.5,
  humanLookAheadSeconds: 0.8,
  vehicleLookAheadSeconds: 1.8,
  humanWaitingGapMetres: 0.25,
  vehicleWaitingGapMetres: 0.65,
  /** Behavioral compact-body forecast uncertainty, metres; never collision skin. */
  compactAnticipationUncertaintyMetres: 0.25,
  /** At most this many detached wheel/human rows; overflow waits every moving vehicle. */
  compactAnticipationMaximumComponents: 64,
  /** Per moving vehicle, original source spans visited in one behavior forecast. */
  compactAnticipationMaximumSpans: 64,
  /** Per moving vehicle, bounded span/blocker tests; overflow is a stop request. */
  compactAnticipationMaximumBlockerTests: 8192,
  endpointTurnRadiansPerSecond: 2.2,
  endpointTurnToleranceRadians: 0.005,
  workerExcursionMetres: 2.5,
  contactCooldownSeconds: 0.7,
  impactPauseSeconds: 1.2,
  separationMetresPerSecond: 1.8,
  recoveryMarginMetres: 0.35,
  /** A committed placement reserves its destination through the next NPC look-ahead. */
  placementReservationSeconds: 1.8,
  /** CPU reaction allowance and nearest living-body scan floor, seconds/metres. */
  copReactionSeconds: 0.35,
  copMinimumLookAheadMetres: 6,
  contactSkinMetres: 0.001,
  /** Extra endpoint reserve for a native fall/air side contact projection, metres:
   * the sealed retry's, and since 2026-10-03 (CP-1) any unheld one that must move
   * the body anyway, so it never rests a skin apart and costs thousands of proof
   * evaluations. Nonlinear body support can protrude between skin-clear endpoints. This
   * constructs a different native candidate; unchanged continuous admission,
   * static/uphill guards and original dt still decide whether it may commit. */
  nativePhaseRetryReserveMetres: 0.025,
  closedPositionToleranceMetres: 0.02,
  closedHeadingToleranceRadians: 0.03,
  sweepAngularToleranceRadians: 0.0001,
  sweepMaximumSubdivisionDepth: 18,
  /** Work bounds, not tolerances (CP-1, 2026-10-03). Fresh compiled enclosure
   * evaluations one owner may spend per fixed step, and search nodes (remembered
   * evaluations included) per owner per contact batch, before its earliest
   * unproved contact time counts as contact: a refusal, never an admission. An
   * evaluation costs ~0.02 ms for the wheel, ~0.16 ms for a mounted human and
   * ~0.21 ms for a ragdoll (M1, unloaded). An ordinary step needs 1-33; a rag
   * falling within ~2.5 m of a person needs up to ~130 in a step or two, which
   * the held identical retry finishes over the next steps from the kept table.
   * The late-reaction bounds are per admission, across every blocker and part
   * (a crashed body's smaller: its evaluations are dearer), and within a fixed
   * step they share what the whole-step proof left of `stepRefinementBudget`. */
  sweepRefinementBudget: 48,
  sweepRefinementNodeBudget: 1024,
  stepRefinementBudget: 64,
  /** The same work bound for one whole fixed step across EVERY owner and late
   * reaction (R2C-6, 2026-10-04): seats beside one actor share it rather than
   * each spending a full owner budget in the same step. ~5 ms of mounted
   * enclosures at worst; a proof it cuts short waits as a held, resumed proof. */
  stepTotalRefinementBudget: 32,
  /** Below this enclosure residual an interval is decided by its own linear
   * sweep, not bisected to the skin (R2C-6, 2026-10-04): a body may brush an
   * actor's hull by at most this, never pass through it, and a legal pass a
   * centimetre clear no longer costs a whole step's budget and a held step. */
  sweepResolutionMetres: 0.025,
  reactionClearanceNodeBudget: 48,
  ragReactionClearanceNodeBudget: 24,
  /** How far a crashed body's contact shape can reach beyond its particles' own
   * box, metres: the garment/head envelope around the spine and the limb chains
   * (R2C-1, 2026-10-04). A crashed owner is admitted against an actor only
   * within this of its actual particles, never by a frame-gain bound. */
  ragAdmissionReachMetres: 1.2,
  epsilon: 1e-9,
});

/**
 * How a rider answers a refused whole step against the living world, and how a
 * crash recovers beside it (CP-1..CP-4, POP-3/POP-4, 2026-10-03). Seconds and
 * metres. None of these is a collision margin: admission still decides every
 * physical pose, and every recovery candidate passes the same placement check.
 */
export const POPULATION_CONTACT = Object.freeze({
  /** Held time in the last half second (60 fixed steps, counted over a sliding
   * window so alternating hold/advance cannot run in slow motion, R2C-6) after
   * which a rider stops waiting for an unfinished proof (a held identical retry
   * resumes it) and takes the contact response, and an airborne rider held by a
   * contact bails out (R2C-2). A crashed body is never held (2026-10-04). */
  holdWatchdogSeconds: 0.25,
  /** A recovery refused this long tries the older safe trail, then short sideways
   * offsets. Never the spawn: only a mode's own reset may void a lap (Track Day). */
  recoveryFallbackSeconds: 0.5,
  /** Older validated safe points kept for that fallback, and their minimum spacing. */
  recoveryRingPoints: 8,
  recoveryRingSpacingMetres: 1,
  /** Sideways offsets tried from the newest safe point, along its own lateral axis. */
  recoveryLateralMetres: Object.freeze([1.2, -1.2, 2.4, -2.4]),
  /** A rider sliding along a person or car eases this much further off them each step,
   * so a lean that grows toward them keeps the slide going; the second is tried
   * when the first is refused (2026-10-04). */
  slideStandoffMetres: Object.freeze([0.004, 0.03]),
  /** Less sideways travel than this in one step, or than this share of the step's
   * travel (about 14 degrees off straight in), is head-on: no slide, the scrub in
   * place answers it, as a wall's face does (2026-10-04). */
  slideMinimumMetres: 0.001,
  slideHeadOnShare: 0.25,
  /** A pinned rider's refused pivot first eases this far back along the contact normal. */
  pivotBackOffMetres: 0.02,
});


/** Conservative live rider/wheel interaction prism, metres. Independent of quality.
 * Verify emitted posed-rig bounds before final population acceptance. */
export const POPULATION_OCCUPANT = Object.freeze({
  halfWidthMetres: 0.65, halfLengthMetres: 0.70, heightMetres: 2.10,
});
