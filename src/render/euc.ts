/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, FX, WHEEL } from '../data/tuning.ts';
import { clamp01, lerp } from '../shared/maths.ts';
import {
  loftGeometry,
  loftNormal,
  loftPoint,
  loftProfile,
  mergeGeometries,
  patchGeometry,
  shaded,
  vAtHeight,
  type LoftRing,
} from './blockoutKit.ts';

/**
 * Blocked-out fictional suspension EUC.
 *
 * Still a blockout, and still built entirely from `WHEEL` in `data/tuning.ts`:
 * every outer dimension below — tyre diameter and width, shell height, width
 * and length, pedal span, height, length and thickness, pad block and travel —
 * is read from there rather than authored here, so the scale and the framing
 * judged at M0 and M3 are unchanged.
 *
 * What changed at the M11 look pass is the *form*, not the size. The machine
 * was a box with a cylinder on top, a puck for a tyre, and four more boxes for
 * the parts that identify an EUC. Every one of those is now a lofted body from
 * `render/blockoutKit.ts`: the shell has a skirt, a waist and a shouldered
 * crown, the tyre is crowned across its tread with a rim and a hub motor cover,
 * the pedals are chamfered plates with a raised outboard lip and grip, and the
 * pads are soft wedges rather than slabs. The accent strips and both lights are
 * *patches of the shell's own surface*, so they follow it instead of hovering
 * over it — the same rule the rider's blue panels follow, for the same reason.
 *
 * **This cost one draw call less than the version it replaces.** The shell's
 * separate top cap and the second accent strip both went away by merging, and
 * the suspension stanchions the machine never had arrived in their place. Form
 * is bought in triangles here, which is the resource with room (`DESIGN.md`
 * §8), never in meshes.
 *
 * **The suspension is visible now**, which is the one thing a machine described
 * as a suspension EUC was not doing. The stanchions hang off `group` — the
 * unsprung side, with the tyre — and the shell's skirt slides down over them as
 * `body` compresses, so the travel `WHEEL.suspensionTravel` allows is something
 * the player can see happen rather than infer.
 *
 * World convention: +Z forward, +Y up, +X the rider's LEFT (see the corrected
 * conventions in `data/tuning.ts` — the original "+X right" claim was the
 * left-handed identity and was fixed at M2). The tyre's rotation axis is X
 * either way, since the wheel is symmetric about it.
 */

/** Everything the caller may need to animate or dispose later. */
export interface BlockoutEUC {
  readonly group: THREE.Group;
  /** Rotates about X as the wheel rolls. Driven from M2. */
  readonly tyre: THREE.Mesh;
  /** Compresses vertically with suspension travel. Driven from M4. */
  readonly body: THREE.Group;
  /** The status light on the shell's rear face. Driven from M6. */
  readonly statusLight: THREE.Mesh;
  /**
   * Set the status light from how near the machine is to its own limit, 0..1.
   *
   * **This is the wheel talking to its rider, not a HUD.** `docs/PLANS.md` §4.5
   * asks the power ladder to be readable through a beep and an amber HUD, and
   * both of those belong to later milestones — audio is M8 and the HUD is M9.
   * A ladder whose readable half does not exist is a mechanic nobody can learn,
   * so the machine gets the affordance a real EUC already has. It carries the
   * worst of the power load and the wobble energy, because two independent
   * warning lights is two nobody reads.
   *
   * `seconds` is the simulation clock, never wall time: `advance(n)` has to
   * reach the same pulse every run or a frozen capture of an amber wheel means
   * nothing.
   *
   * `boot` is the power-on flare, 0..1 — 1 at the instant of a crash
   * recovery, decaying with the recovery blend. It carries the "wheel is
   * back on" message the recovery chirp used to make before the owner
   * silenced it (see `AUDIO.recoverLevel`).
   */
  setStatus(alert: number, seconds: number, boot?: number): void;
  dispose(): void;
}

/**
 * The four rungs' colours, walked continuously rather than switched.
 *
 * A ramp reads better than four steps — the rider sees the light *moving*
 * toward red, which is a warning arriving rather than a warning that has
 * already arrived — and it interpolates, which four discrete colours do not.
 */
const STATUS_STOPS: readonly number[] = [
  BLOCKOUT_COLOURS.statusNormal,
  BLOCKOUT_COLOURS.statusNotice,
  BLOCKOUT_COLOURS.statusWarn,
  BLOCKOUT_COLOURS.statusCritical,
];

// -- Dimensions, all of them derived --------------------------------------

const TYRE_RADIUS = WHEEL.tyreDiameter / 2;
const TYRE_HALF_WIDTH = WHEEL.tyreWidth / 2;

/** Ground to the shell's lowest point: the axle line, as it always was. */
const SHELL_BOTTOM = TYRE_RADIUS;
const SHELL_SPAN = WHEEL.shellHeight - SHELL_BOTTOM;
const SHELL_HALF_WIDTH = WHEEL.shellWidth / 2;
const SHELL_HALF_LENGTH = WHEEL.shellLength / 2;

/**
 * Where the crown taper begins, as a fraction of the shell's height.
 *
 * `WHEEL.shellCapFraction` used to be the radius of a literal cylinder cap.
 * It still means the same thing — how much of the shell above the axle is the
 * rounded top rather than the body — and the rings below are placed as
 * fractions of the two spans it divides, so any value in (0, 1) stays ordered.
 * A profile whose rings can cross on a tuning change is a profile that throws
 * (`loftProfile` refuses a tie), and a shape constant should not be able to
 * take the machine off the screen.
 */
const SHELL_CROWN = 1 - WHEEL.shellCapFraction;

/** Below the crown, then above it. Both are fractions of their own span. */
const shellY = (t: number): number => SHELL_BOTTOM + SHELL_SPAN * t;
const belowCrown = (f: number): number => SHELL_CROWN * f;
const aboveCrown = (f: number): number => SHELL_CROWN + (1 - SHELL_CROWN) * f;

/**
 * A shell section, authored as fractions of the widest one.
 *
 * `square` is doing most of the work: an EUC shell is close to a rounded
 * rectangle in plan and nothing like an ellipse, and the M0 comment about a
 * hard-cornered box reading as an appliance has the opposite failure waiting
 * on the other side — an elliptical shell reads as a scooter fairing. 3.2 at
 * the waist and 2.2 at the crown is the range that reads as a machine.
 */
const shellRing = (t: number, width: number, length: number, square: number): LoftRing => ({
  y: shellY(t),
  halfWidth: SHELL_HALF_WIDTH * width,
  halfDepth: SHELL_HALF_LENGTH * length,
  square,
});

const SHELL = loftProfile([
  // Skirt. Narrow, so the tyre is exposed and the stanchions have somewhere to
  // be seen — the shell used to be full width all the way down to the axle,
  // which is what made it read as a crate straddling a puck.
  shellRing(belowCrown(0.00), 0.47, 0.57, 2.5),
  shellRing(belowCrown(0.38), 0.87, 0.85, 3.0),
  shellRing(belowCrown(0.78), 1.00, 0.977, 3.2),
  shellRing(belowCrown(1.00), 1.00, 1.00, 3.2),
  shellRing(aboveCrown(0.32), 0.94, 0.94, 2.9),
  shellRing(aboveCrown(0.58), 0.80, 0.83, 2.5),
  // The top face stops well short of `shellHeight`. What is left is the carry
  // handle's arch, and the first capture of this pass is why: at the eighteen
  // millimetres the crown originally left over, the handle read from above as a
  // wart on the shell rather than as something a hand goes through.
  shellRing(aboveCrown(0.78), 0.58, 0.65, 2.3),
]);

/** The flat top the carry handle stands on. */
const SHELL_TOP_FACE = SHELL[SHELL.length - 1]!.y;

const TREAD_RING = (t: number, radius: number): LoftRing => ({
  y: t * TYRE_HALF_WIDTH,
  halfWidth: radius,
  halfDepth: radius,
});

/**
 * The tyre, lofted along its own axle.
 *
 * The kit lofts about Y and the wheel turns about X, so the profile below is
 * authored along the axle and the *mesh* is rotated onto X — exactly as the
 * cylinder it replaces was, and deliberately so: `rotation.x` is the spin
 * channel the controller and the ghost both drive, and it has to stay the
 * spin channel.
 *
 * A crowned tread rather than a flat face is the whole point. A cylinder seen
 * from behind at chase distance is a puck; a crown catches the sun along a
 * curve and reads as rubber under load.
 */
const TREAD = loftProfile([
  TREAD_RING(-1.00, TYRE_RADIUS * 0.824),
  TREAD_RING(-0.62, TYRE_RADIUS * 0.928),
  TREAD_RING(-0.30, TYRE_RADIUS * 0.986),
  TREAD_RING(0.00, TYRE_RADIUS),
  TREAD_RING(0.30, TYRE_RADIUS * 0.986),
  TREAD_RING(0.62, TYRE_RADIUS * 0.928),
  TREAD_RING(1.00, TYRE_RADIUS * 0.824),
]);

/**
 * The leg-contact pad, thickened inboard.
 *
 * Its outer face is where it has always been — `shellWidth / 2 + padThickness`
 * from the centreline, which is what the rider's legs meet — but the shell is a
 * curved body now, and a slab standing off a curve leaves a crescent of daylight
 * at the pad's top and bottom. The pad is made deeper than `padThickness` and
 * pushed inboard by the difference, so its inner face is buried in the shell at
 * every height it covers and its outer face has not moved.
 */
const PAD_HALF_THICK = WHEEL.padThickness * 0.8;
const PAD_HALF_LENGTH = WHEEL.padLength / 2;
const PAD_HALF_HEIGHT = WHEEL.padHeight / 2;
const PAD_CENTRE_X = SHELL_HALF_WIDTH + WHEEL.padThickness - PAD_HALF_THICK;

const padRing = (t: number, thick: number, length: number, square: number): LoftRing => ({
  y: t * PAD_HALF_HEIGHT,
  halfWidth: PAD_HALF_THICK * thick,
  halfDepth: PAD_HALF_LENGTH * length,
  square,
});

const PAD = loftProfile([
  padRing(-1.00, 0.34, 0.68, 2.4),
  padRing(-0.80, 0.92, 0.87, 2.9),
  padRing(-0.22, 1.00, 1.00, 3.2),
  padRing(0.16, 0.97, 0.99, 3.2),
  padRing(0.55, 0.86, 0.93, 2.9),
  padRing(0.86, 0.60, 0.78, 2.6),
  padRing(1.00, 0.30, 0.62, 2.3),
]);

/** Pedal plate. `pedalSpan` is outer edge to outer edge across both. */
const PEDAL_HALF_WIDTH = (WHEEL.pedalSpan - WHEEL.shellWidth) / 4;
const PEDAL_HALF_LENGTH = WHEEL.pedalLength / 2;
const PEDAL_HALF_THICK = WHEEL.pedalThickness / 2;

const PEDAL = loftProfile([
  { y: -PEDAL_HALF_THICK, halfWidth: PEDAL_HALF_WIDTH * 0.88, halfDepth: PEDAL_HALF_LENGTH * 0.89, square: 4 },
  { y: -PEDAL_HALF_THICK * 0.45, halfWidth: PEDAL_HALF_WIDTH * 0.985, halfDepth: PEDAL_HALF_LENGTH * 0.985, square: 6 },
  { y: PEDAL_HALF_THICK * 0.45, halfWidth: PEDAL_HALF_WIDTH, halfDepth: PEDAL_HALF_LENGTH, square: 6 },
  { y: PEDAL_HALF_THICK, halfWidth: PEDAL_HALF_WIDTH * 0.90, halfDepth: PEDAL_HALF_LENGTH * 0.91, square: 4 },
]);

/** The status light's own body: a rounded slab at exactly its authored size. */
const STATUS = loftProfile([
  { y: -FX.statusLightHeight / 2, halfWidth: FX.statusLightWidth * 0.38, halfDepth: FX.statusLightDepth * 0.32, square: 3 },
  { y: -FX.statusLightHeight * 0.18, halfWidth: FX.statusLightWidth * 0.5, halfDepth: FX.statusLightDepth * 0.5, square: 4.5 },
  { y: FX.statusLightHeight * 0.18, halfWidth: FX.statusLightWidth * 0.5, halfDepth: FX.statusLightDepth * 0.5, square: 4.5 },
  { y: FX.statusLightHeight / 2, halfWidth: FX.statusLightWidth * 0.38, halfDepth: FX.statusLightDepth * 0.32, square: 3 },
]);

/**
 * Suspension stanchions: unsprung, so the shell slides down over them.
 *
 * **The exposed length is `WHEEL.suspensionTravel` exactly.** That is not a
 * coincidence dressed up after the fact — it is the whole reason the part is
 * here. At rest the rider sees 85 mm of bright stanchion between the axle and
 * the shell's skirt; at full compression the slider has swallowed all of it and
 * the machine is visibly out of travel. A number in `data/tuning.ts` that
 * nothing on screen expresses is a number nobody can feel.
 *
 * They stop below `WHEEL.padCentreHeight - padHeight / 2` so the leg pad, which
 * is a solid body an inch outboard of them, has nothing to intersect.
 */
const STANCHION_X = 0.086;
const STANCHION_RADIUS = 0.020;
const STANCHION_TOP = SHELL_BOTTOM + WHEEL.suspensionTravel;
/** The sprung half of the same joint: a sleeve on the shell, over the leg. */
const SLIDER_RADIUS = STANCHION_RADIUS + 0.006;
const SLIDER_LENGTH = 0.075;

/**
 * Vertex multipliers, and why they go as high as they do.
 *
 * These are the same device as the rider's — one material, one draw call, and
 * value separation written into the mesh — but the numbers are far larger,
 * because the surface they lift is far darker. `BLOCKOUT_COLOURS.tyre` is
 * 0x232427: about 0.016 in linear light. The first pass used 1.6 and 2.4 here
 * and the wheel's whole side came back from the capture as one black disc —
 * the rim and the hub cover were being drawn and neither was visible, because
 * that side of the wheel faces away from the sun and 2.4 times almost nothing
 * is almost nothing. **A multiplier that looks alarming on a near-black base is
 * the correct multiplier.** These reach a dark grey and stop there.
 */
const RIM_SHADE = 3.0;
const HUB_SHADE = 4.6;
const HANDLE_SHADE = 0.50;
const SLIDER_SHADE = 0.55;
const GRIP_SHADE = 0.42;
const PEDAL_LIP_SHADE = 1.14;
const PEDAL_HINGE_SHADE = 0.72;

export function createBlockoutEUC(): BlockoutEUC {
  const group = new THREE.Group();
  group.name = 'euc-blockout';

  // Tracked so disposal is exhaustive rather than best-effort. Every geometry
  // and material that reaches a mesh is registered the moment it is created;
  // the pieces that go into `mergeGeometries` are disposed by the merge and
  // are deliberately not tracked here.
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const track = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };
  const trackMaterial = <T extends THREE.Material>(material: T): T => {
    materials.push(material);
    return material;
  };

  // **Every material here sets `vertexColors`, so every geometry needs a
  // `color` attribute.** The kit writes one on everything it makes and
  // `shaded()` adds one to a stock three geometry; a geometry that reaches one
  // of these without it renders pure black, which is the trap `DESIGN.md` §7c
  // records and the reason `mergeGeometries` refuses uncoloured input. The
  // attribute is a *multiplier*, so 1 is exactly the colour authored in
  // `data/tuning.ts` and nothing here changes what those values mean.
  const shellMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: BLOCKOUT_COLOURS.shell,
      roughness: 0.45,
      metalness: 0.1,
      vertexColors: true,
    }),
  );
  const tyreMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: BLOCKOUT_COLOURS.tyre,
      roughness: 0.92,
      metalness: 0.0,
      vertexColors: true,
    }),
  );
  const padMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: BLOCKOUT_COLOURS.pad,
      roughness: 0.85,
      metalness: 0.0,
      vertexColors: true,
    }),
  );
  const pedalMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: BLOCKOUT_COLOURS.pedal,
      roughness: 0.55,
      metalness: 0.75,
      vertexColors: true,
    }),
  );
  const headlightMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: BLOCKOUT_COLOURS.headlight,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      vertexColors: true,
    }),
  );
  const taillightMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x501014,
      emissive: BLOCKOUT_COLOURS.taillight,
      emissiveIntensity: 1.1,
      roughness: 0.4,
      vertexColors: true,
    }),
  );
  // Cool Rider's identity colour, previewed on the wheel's accent strips so the
  // black/reflective-blue language is present from the first frame.
  const accentMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: BLOCKOUT_COLOURS.accent,
      emissive: 0x1c4f9c,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.2,
      vertexColors: true,
    }),
  );

  /**
   * Casting a shadow is also what the ghost reads to decide what to draw
   * (`render/ghostRider.ts`): a part too flat to cast is a part that, in one
   * flat colour, is invisible. So this means "carries silhouette", and the
   * accent strips, the lights and the status light deliberately do not call it.
   */
  const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.castShadow = true;
    return mesh;
  };

  /**
   * A panel lying on the shell, spanning two *heights* rather than two ring
   * indices — so "the accent runs along the shoulder" is what the call says,
   * and inserting a ring into the profile cannot silently move it.
   */
  const shellPatch = (
    options: Omit<Parameters<typeof patchGeometry>[1], 'v0' | 'v1'> & { from: number; to: number },
  ): THREE.BufferGeometry => {
    const { from, to, ...rest } = options;
    return patchGeometry(SHELL, {
      ...rest,
      v0: vAtHeight(SHELL, from),
      v1: vAtHeight(SHELL, to),
    });
  };

  /** Sprung mass: everything except the contact patch. Compresses from M4. */
  const body = new THREE.Group();
  body.name = 'euc-body';
  group.add(body);

  // -- Tyre -----------------------------------------------------------------
  // One mesh: crowned tread, a rim closing the sidewalls a millimetre proud of
  // the bead, and the hub motor cover standing out of both sides. The rim and
  // the hub are the same material at a higher vertex multiplier, which is what
  // keeps a wheel that now reads as a wheel down to the single draw call the
  // flat cylinder cost.
  const tread = loftGeometry(TREAD, { radialSegments: 20, capBottom: false, capTop: false });
  const rim = shaded(
    new THREE.CylinderGeometry(TYRE_RADIUS * 0.828, TYRE_RADIUS * 0.828, WHEEL.tyreWidth, 20),
    RIM_SHADE,
  );
  const hub = shaded(
    new THREE.CylinderGeometry(TYRE_RADIUS * 0.46, TYRE_RADIUS * 0.46, WHEEL.tyreWidth + 0.016, 16),
    HUB_SHADE,
  );
  const tyre = new THREE.Mesh(track(mergeGeometries([tread, rim, hub])), tyreMaterial);
  // A cylinder's axis is Y by default and the loft's is too, so the mesh is
  // rotated onto X exactly as the cylinder it replaces was. `rotation.x` stays
  // free for the spin the controller and the ghost drive.
  tyre.rotation.z = Math.PI / 2;
  tyre.position.y = TYRE_RADIUS;
  tyre.castShadow = true;
  tyre.receiveShadow = true;
  tyre.name = 'euc-tyre';
  group.add(tyre);

  // -- Suspension -----------------------------------------------------------
  // On `group` rather than `body`: these are the unsprung side, and the shell's
  // skirt sliding down over them is the whole reason they are here.
  // Bright already — these are on `pedalMaterial`, which is the machine's one
  // metal — so they need no multiplier, only the `color` attribute the merge
  // and the material both insist on.
  const axle = shaded(
    new THREE.CylinderGeometry(0.016, 0.016, STANCHION_X * 2 + 0.018, 12),
  ).rotateZ(Math.PI / 2).translate(0, SHELL_BOTTOM, 0);
  const stanchions: THREE.BufferGeometry[] = [axle];
  for (const side of [-1, 1]) {
    stanchions.push(
      shaded(
        new THREE.CylinderGeometry(
          STANCHION_RADIUS,
          STANCHION_RADIUS,
          STANCHION_TOP - SHELL_BOTTOM,
          10,
        ),
      ).translate(side * STANCHION_X, (SHELL_BOTTOM + STANCHION_TOP) / 2, 0),
    );
  }
  const suspension = shadowed(
    new THREE.Mesh(track(mergeGeometries(stanchions)), pedalMaterial),
  );
  suspension.name = 'euc-suspension';
  group.add(suspension);

  // -- Shell ----------------------------------------------------------------
  // One mesh: the lofted body plus the carry handle on its top face. The handle
  // is the cheapest identity cue on the machine — nothing else in a silhouette
  // says "this is picked up and carried" — and it stays inside
  // `WHEEL.shellHeight`, which is what that constant has always measured.
  const shellParts: THREE.BufferGeometry[] = [
    loftGeometry(SHELL, { radialSegments: 20 }),
  ];
  const handleGap = SHELL_TOP_FACE + (WHEEL.shellHeight - SHELL_TOP_FACE) * 0.62;
  for (const z of [-0.064, 0.064]) {
    shellParts.push(
      shaded(new THREE.BoxGeometry(0.030, handleGap - SHELL_TOP_FACE, 0.022), HANDLE_SHADE)
        .translate(0, (SHELL_TOP_FACE + handleGap) / 2, z),
    );
  }
  shellParts.push(
    shaded(new THREE.BoxGeometry(0.038, WHEEL.shellHeight - handleGap, 0.166), HANDLE_SHADE)
      .translate(0, (handleGap + WHEEL.shellHeight) / 2, 0),
  );
  // The sprung half of the suspension joint, riding on `body` with the shell.
  // It sits just proud of the skirt at rest and descends over the stanchion as
  // the machine compresses, which is the movement that makes the travel legible.
  for (const side of [-1, 1]) {
    shellParts.push(
      shaded(
        new THREE.CylinderGeometry(SLIDER_RADIUS, SLIDER_RADIUS, SLIDER_LENGTH, 10),
        SLIDER_SHADE,
      ).translate(side * STANCHION_X, STANCHION_TOP + SLIDER_LENGTH / 2 - 0.002, 0),
    );
  }
  const shell = shadowed(new THREE.Mesh(track(mergeGeometries(shellParts)), shellMaterial));
  shell.receiveShadow = true;
  shell.name = 'euc-shell';
  body.add(shell);

  // -- Accent ---------------------------------------------------------------
  // Patches of the shell's own surface, so they curve with it. Both shoulder
  // stripes and the nose blade are one mesh: same material, same parent, and
  // the pair of separate boxes this replaces cost two draw calls between them.
  //
  // They sit on the shoulder and the nose deliberately. The leg pads cover the
  // shell's mid flank completely, so a stripe there is a stripe nobody sees.
  const accentParts: THREE.BufferGeometry[] = [];
  for (const centre of [0, Math.PI]) {
    accentParts.push(shellPatch({
      u0: centre - 0.55,
      u1: centre + 0.55,
      from: 0.545,
      to: 0.575,
      lift: 0.005,
      sink: -0.010,
      uSegments: 8,
      vSegments: 2,
    }));
  }
  accentParts.push(shellPatch({
    u0: Math.PI / 2 - 0.62,
    u1: Math.PI / 2 + 0.62,
    from: 0.430,
    to: 0.468,
    lift: 0.005,
    sink: -0.010,
    uSegments: 8,
    vSegments: 2,
    taper: 0.35,
  }));
  const accent = new THREE.Mesh(track(mergeGeometries(accentParts)), accentMaterial);
  accent.name = 'euc-accent';
  body.add(accent);

  // -- Leg-contact pads -----------------------------------------------------
  for (const side of [-1, 1]) {
    const pad = shadowed(
      new THREE.Mesh(track(loftGeometry(PAD, { radialSegments: 12 })), padMaterial),
    );
    pad.position.set(side * PAD_CENTRE_X, WHEEL.padCentreHeight, 0);
    pad.name = `euc-pad-${side > 0 ? 'left' : 'right'}`;
    body.add(pad);
  }

  // -- Pedals ---------------------------------------------------------------
  // A chamfered plate with rounded corners in plan, a dark grip inset on the
  // tread, a raised outboard lip, the fold hinge inboard, and a diagonal hanger
  // that visibly joins that hinge to the shell's narrow skirt — all one mesh
  // per pedal, which is what the pair of bare boxes cost. The hanger matters
  // most in the stopped stance: one boot is on the ground and exposes the empty
  // pedal, so a plate with nine centimetres of air above it reads as detached
  // even though it shares the machine's scene-graph parent.
  for (const side of [-1, 1]) {
    const pedalCentreX = side * (SHELL_HALF_WIDTH + PEDAL_HALF_WIDTH);
    const mountBottomX = -side * PEDAL_HALF_WIDTH;
    const mountTopX = side * SHELL[0]!.halfWidth - pedalCentreX;
    const mountRise = SHELL_BOTTOM - WHEEL.pedalHeight;
    const mountRun = mountTopX - mountBottomX;
    const mountLength = Math.hypot(mountRun, mountRise);
    const mountAngle = Math.atan2(-mountRun, mountRise);
    const parts: THREE.BufferGeometry[] = [
      loftGeometry(PEDAL, { radialSegments: 14 }),
      shaded(new THREE.BoxGeometry(PEDAL_HALF_WIDTH * 1.40, 0.005, PEDAL_HALF_LENGTH * 1.36), GRIP_SHADE)
        .translate(0, PEDAL_HALF_THICK, 0),
      shaded(new THREE.BoxGeometry(0.010, 0.019, PEDAL_HALF_LENGTH * 1.46), PEDAL_LIP_SHADE)
        .translate(side * PEDAL_HALF_WIDTH * 0.93, PEDAL_HALF_THICK * 0.4, 0),
      shaded(new THREE.CylinderGeometry(0.011, 0.011, PEDAL_HALF_LENGTH * 0.44, 8), PEDAL_HINGE_SHADE)
        .rotateX(Math.PI / 2)
        .translate(-side * PEDAL_HALF_WIDTH * 0.96, 0, 0),
      shaded(new THREE.BoxGeometry(0.024, mountLength, 0.050), PEDAL_HINGE_SHADE)
        .rotateZ(mountAngle)
        .translate((mountBottomX + mountTopX) / 2, mountRise / 2, 0),
    ];
    const pedal = shadowed(new THREE.Mesh(track(mergeGeometries(parts)), pedalMaterial));
    pedal.position.set(pedalCentreX, WHEEL.pedalHeight, 0);
    pedal.receiveShadow = true;
    pedal.name = `euc-pedal-${side > 0 ? 'left' : 'right'}`;
    body.add(pedal);
  }

  // -- Lights ---------------------------------------------------------------
  // Both are patches of the shell rather than boxes stuck to it, so each one
  // sits in the nose or the tail the way a moulded lens does. Separate meshes
  // because they are separate materials, which they have to be.
  const headlight = new THREE.Mesh(
    track(shellPatch({
      u0: Math.PI / 2 - 0.44,
      u1: Math.PI / 2 + 0.44,
      from: 0.502,
      to: 0.530,
      lift: 0.004,
      sink: -0.012,
      uSegments: 6,
      vSegments: 2,
      taper: 0.40,
    })),
    headlightMaterial,
  );
  headlight.name = 'euc-headlight';
  body.add(headlight);

  // Narrower and shorter than the headlight, and tapered at both ends. The
  // first capture had it as a wide slab: at chase distance the machine's whole
  // rear read as a red rectangle, and the status light — which is the one the
  // rider has to read — was competing with it.
  const taillight = new THREE.Mesh(
    track(shellPatch({
      u0: -Math.PI / 2 - 0.26,
      u1: -Math.PI / 2 + 0.26,
      from: 0.500,
      to: 0.521,
      lift: 0.004,
      sink: -0.012,
      uSegments: 6,
      vSegments: 2,
      taper: 0.45,
    })),
    taillightMaterial,
  );
  taillight.name = 'euc-taillight';
  body.add(taillight);

  // -- Status light (M6) ----------------------------------------------------
  // High on the shell's rear shoulder, tipped back toward the camera, because
  // the chase view is behind the rider essentially all the time — the same
  // reasoning that put Cool Rider's largest blue panel on their back. Its own
  // material, so nothing else on the wheel changes colour with the power
  // ladder. Placed *on the surface* by asking the shell where its surface is,
  // rather than at a guessed offset that a reshaped shell would bury.
  const statusMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x101216,
      emissive: BLOCKOUT_COLOURS.statusNormal,
      emissiveIntensity: FX.statusCalmIntensity,
      roughness: 0.35,
      metalness: 0.1,
      vertexColors: true,
    }),
  );
  const statusLight = new THREE.Mesh(
    track(loftGeometry(STATUS, { radialSegments: 12 })),
    statusMaterial,
  );
  statusLight.name = 'euc-status-light';
  const statusV = vAtHeight(SHELL, 0.556);
  const statusSeat = loftPoint(SHELL, -Math.PI / 2, statusV, new THREE.Vector3());
  const statusOut = loftNormal(SHELL, -Math.PI / 2, statusV, new THREE.Vector3());
  statusLight.position.copy(statusSeat).addScaledVector(statusOut, FX.statusLightDepth * 0.42);
  statusLight.rotation.x = -0.55;
  body.add(statusLight);

  // Preallocated: `setStatus` runs on every drawn frame, and three `Color`
  // objects a frame is the same class of garbage the pose interpolation is
  // preallocated to avoid.
  const statusFrom = new THREE.Color();
  const statusTo = new THREE.Color();

  return {
    group,
    tyre,
    body,
    statusLight,

    setStatus(alert: number, phase: number, boot = 0): void {
      const level = clamp01(alert) * (STATUS_STOPS.length - 1);
      const index = Math.min(STATUS_STOPS.length - 2, Math.floor(level));
      statusFrom.setHex(STATUS_STOPS[index]);
      statusTo.setHex(STATUS_STOPS[index + 1]);
      statusMaterial.emissive.copy(statusFrom).lerp(statusTo, level - index);

      // The pulse quickens as the ladder climbs, and does not exist at all when
      // there is nothing to say: a light that blinks during ordinary riding is
      // a light the rider learns to ignore.
      const urgency = clamp01(alert);
      const rate = lerp(FX.statusNoticeHz, FX.statusCriticalHz, urgency);
      const pulse = urgency <= 0
        ? 1
        : 1 - FX.statusPulseDepth * urgency
          * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * phase));
      statusMaterial.emissiveIntensity = lerp(
        FX.statusCalmIntensity,
        FX.statusAlarmIntensity,
        urgency,
      ) * pulse;

      // The power-on flare: over whatever the ladder decided, the light leans
      // toward cool boot white and flares, hardest at the instant of the
      // recovery and gone half a second later. This is the silenced recovery
      // chirp's job, moved to the picture.
      const flare = clamp01(boot);
      if (flare > 0) {
        statusFrom.setHex(FX.statusBootColour);
        statusMaterial.emissive.lerp(statusFrom, flare);
        statusMaterial.emissiveIntensity = Math.max(
          statusMaterial.emissiveIntensity,
          FX.statusBootIntensity * flare,
        );
      }
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.length = 0;
      materials.length = 0;
      group.removeFromParent();
    },
  };
}
