/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, FX, WHEEL } from '../data/tuning.ts';
import { clamp01, lerp } from '../shared/maths.ts';
import {
  loftGeometry,
  loftNormal,
  loftPoint,
  loftProfile,
  mapUvInto,
  mergeGeometries,
  patchGeometry,
  shaded,
  vAtHeight,
  type LoftRing,
} from './blockoutKit.ts';
import { STANDARD_MACHINE_LOOK, type MachineLook, type MachinePatch } from './machineLook.ts';

/**
 * Blocked-out fictional suspension EUC.
 *
 * Still a blockout. The standard machine is built entirely from `WHEEL` in
 * `data/tuning.ts`, so the scale and framing judged at M0 and M3 are unchanged.
 * M19 permits a `MachineLook` to substitute only the cosmetic shell loft; the
 * tyre, pedal contacts and suspension travel remain the shared
 * `MACHINE_CONTRACT`, and simulation/camera geometry cannot vary by look.
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

/**
 * Build the machine, optionally wearing a particular look — M19 Phase 2.
 *
 * The default is the standard wheel for the reason `createRidingRig` defaults
 * to Cool Rider: every existing baseline, measurement and unit test constructs
 * a machine with no argument, and all of them must keep measuring exactly what
 * they measured. Everything a look may vary is appearance; the four
 * `MACHINE_CONTRACT` constants are read from `WHEEL` here and nowhere in any
 * look (`data/machines.test.ts` audits that).
 */
export function createBlockoutEUC(look: MachineLook = STANDARD_MACHINE_LOOK): BlockoutEUC {
  const group = new THREE.Group();
  group.name = 'euc-blockout';

  // Standard stays on the WHEEL-derived profile exactly. A look may replace
  // only this cosmetic body loft — never the tyre, pedals, suspension, or leg
  // contact positions protected by `MACHINE_CONTRACT`. Resolve it once so
  // every patch, light seat and pedal hanger reads the same visible shell.
  const shellProfile = look.shell.profile
    ? loftProfile(look.shell.profile.map((ring) => ({ ...ring })))
    : SHELL;
  const shellTopFace = shellProfile[shellProfile.length - 1]!.y;

  // The leg pad's section, resolved the same way and for the same reason — a
  // look may restyle the pad it sits against without touching where it sits.
  // Rings are authored about the pad's centre height, so the profile is used
  // as given and the mesh is translated to `WHEEL.padCentreHeight` below.
  const padBlocks = look.pads?.blocks?.length
    ? look.pads.blocks.map((rings) => loftProfile(rings.map((ring) => ({ ...ring }))))
    : [PAD];

  // Tracked so disposal is exhaustive rather than best-effort. Every geometry
  // and material that reaches a mesh is registered the moment it is created;
  // the pieces that go into `mergeGeometries` are disposed by the merge and
  // are deliberately not tracked here.
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

  // **Every material here sets `vertexColors`, so every geometry needs a
  // `color` attribute.** The kit writes one on everything it makes and
  // `shaded()` adds one to a stock three geometry; a geometry that reaches one
  // of these without it renders pure black, which is the trap `DESIGN.md` §7c
  // records and the reason `mergeGeometries` refuses uncoloured input. The
  // attribute is a *multiplier*, so 1 is exactly the colour authored in
  // `data/tuning.ts` and nothing here changes what those values mean.
  const shellMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: look.shell.colour,
      roughness: look.shell.roughness,
      metalness: 0.1,
      vertexColors: true,
    }),
  );
  const tyreMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: look.tyre?.colour ?? BLOCKOUT_COLOURS.tyre,
      roughness: look.tyre?.roughness ?? 0.92,
      metalness: 0.0,
      vertexColors: true,
    }),
  );
  // The look's printed sheet, if it has one — M23 Phase A2. One texture per
  // machine, tracked for disposal beside the materials, exactly as the
  // rider's is (`render/rider.ts`). Built here, ahead of the pad material,
  // because a pad may wear a page of it too (M28).
  const sheet = look.atlas === undefined ? null : look.atlas.build();
  if (sheet !== null) textures.push(sheet);
  const padsPrinted = sheet !== null && look.pads?.art !== undefined;
  const padMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: look.pads?.colour ?? BLOCKOUT_COLOURS.pad,
      roughness: look.pads?.roughness ?? 0.85,
      metalness: 0.0,
      vertexColors: true,
      map: padsPrinted ? sheet : null,
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
      emissive: look.headlight.emissive,
      emissiveIntensity: look.headlight.emissiveIntensity,
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
  // The look's trim material — Cool Rider's reflective blue on the standard
  // machine, satin armour red on Red Rider's. One material for every trim
  // patch a look authors, which is what holds the slot at one draw call.
  const trimMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: look.trim.colour,
      emissive: look.trim.emissive,
      emissiveIntensity: look.trim.emissiveIntensity,
      roughness: look.trim.roughness,
      metalness: look.trim.metalness,
      vertexColors: true,
      map: sheet,
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
    return patchGeometry(shellProfile, {
      ...rest,
      v0: vAtHeight(shellProfile, from),
      v1: vAtHeight(shellProfile, to),
    });
  };

  /**
   * Overwrite a geometry's vertex colours with one RGB multiplier — the
   * saddle's channel, and every trim patch that carries a `tint`. `shaded()`
   * is a scalar and a scalar cannot change hue: 0.06 × armour red is very dark
   * red, not the black a leather cushion is, and no scalar over a pale trim
   * material is the green Adonisb2's nose plate has to be.
   */
  const tinted = <T extends THREE.BufferGeometry>(
    geometry: T,
    tint: readonly [number, number, number],
  ): T => {
    const colour = shaded(geometry).getAttribute('color');
    for (let i = 0; i < colour.count; i += 1) colour.setXYZ(i, tint[0], tint[1], tint[2]);
    return geometry;
  };

  /**
   * A look-authored patch, resolved to geometry — M19 Phase 2.
   *
   * A `shell` patch is `shellPatch` exactly. A `pad` patch is built once per
   * side: mirrored across X (angle θ maps to π − θ, so a plate authored on the
   * left pad's outboard face lands on the right pad's outboard face), then
   * translated to where that pad actually sits. Returns a list because of that
   * doubling; the caller merges everything into the one trim mesh regardless.
   */
  const machinePatch = (patch: MachinePatch): THREE.BufferGeometry[] => {
    const { surface = 'shell', from, to, u0, u1, tint, art, ...rest } = patch;
    // Paint, then page. A look with no atlas skips the fold entirely and the
    // geometry keeps the unit square the kit gave it, which is harmless
    // because its material carries no map; a look *with* one must fold every
    // patch, including the ones with no art, or an undecorated strip would
    // sample the whole sheet.
    const paint = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
      const painted = tint ? tinted(geometry, tint) : geometry;
      return look.atlas === undefined ? painted : mapUvInto(painted, look.atlas.region(art));
    };
    if (surface === 'shell') {
      return [paint(shellPatch({ ...rest, u0, u1, from, to }))];
    }
    const sides: THREE.BufferGeometry[] = [];
    const block = padBlocks[patch.block ?? 0] ?? padBlocks[0]!;
    for (const side of [1, -1]) {
      sides.push(paint(
        patchGeometry(block, {
          ...rest,
          // A mirrored span runs backwards in parameter space, which winds the
          // outer face inward — so the *ends* swap as well as reflecting, and
          // `skew` flips sign with them or a sheared plate lands as its own
          // mirror image on one side only (the chest-chevron lesson in
          // `blockoutKit.ts`, one surface over).
          u0: side > 0 ? u0 : Math.PI - u1,
          u1: side > 0 ? u1 : Math.PI - u0,
          skew: side > 0 ? rest.skew : -(rest.skew ?? 0),
          v0: vAtHeight(block, from),
          v1: vAtHeight(block, to),
        }).translate(side * PAD_CENTRE_X, WHEEL.padCentreHeight, 0),
      ));
    }
    return sides;
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
  const tyreParts: THREE.BufferGeometry[] = [tread, rim, hub];
  // Off-road lugs, when a look asks for them — M22, and merged into the tyre
  // rather than built beside it, so a knobby tyre costs the same draw calls as
  // a slick one. Authored in the loft's own frame: the axle is local +Y and the
  // radial direction sweeps the local XZ plane from +X toward +Z, which is
  // `loftPoint`'s convention one file over. A block is pushed out along +X at
  // its own tread radius and then swung round by −θ, which leaves the axle
  // untouched and puts the block's third dimension on the tangent.
  const lugs = look.tyre?.lugs;
  if (lugs) {
    const [arc, high, long] = lugs.size;
    for (const row of lugs.rows) {
      const axial = row.at * TYRE_HALF_WIDTH;
      // The tread is crowned, so a lug on the shoulder starts lower than one on
      // the centreline. Read the radius off the profile that actually shipped
      // instead of assuming a cylinder, or the shoulder rows float.
      const v = vAtHeight(TREAD, axial);
      const below = TREAD[Math.min(TREAD.length - 2, Math.floor(v))]!;
      const above = TREAD[Math.min(TREAD.length - 1, Math.floor(v) + 1)]!;
      const seat = below.halfWidth
        + (above.halfWidth - below.halfWidth) * (v - Math.floor(v));
      for (let i = 0; i < lugs.count; i += 1) {
        const theta = ((i + row.phase) / lugs.count) * Math.PI * 2;
        tyreParts.push(
          shaded(new THREE.BoxGeometry(high, long, arc), lugs.shade)
            .translate(seat + high / 2 - 0.004, axial, 0)
            .rotateY(-theta),
        );
      }
    }
  }
  const tyre = new THREE.Mesh(track(mergeGeometries(tyreParts)), tyreMaterial);
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
  // `WHEEL.shellHeight` on the standard profile, which is what that constant
  // has always measured. A custom silhouette carries its own cosmetic top and
  // uses the saddle path instead.
  const shellParts: THREE.BufferGeometry[] = [
    loftGeometry(shellProfile, { radialSegments: 28 }),
  ];
  if (look.top.kind === 'handle') {
    const handleGap = shellTopFace + (WHEEL.shellHeight - shellTopFace) * 0.62;
    for (const z of [-0.064, 0.064]) {
      shellParts.push(
        shaded(new THREE.BoxGeometry(0.030, handleGap - shellTopFace, 0.022), HANDLE_SHADE)
          .translate(0, (shellTopFace + handleGap) / 2, z),
      );
    }
    shellParts.push(
      shaded(new THREE.BoxGeometry(0.038, WHEEL.shellHeight - handleGap, 0.166), HANDLE_SHADE)
        .translate(0, (handleGap + WHEEL.shellHeight) / 2, 0),
    );
  } else {
    // The saddle, in the handle's place — a saddle is bolted over the top
    // face, so a handle under it would be triangles spent on a part no hand
    // can reach. Merged into the shell mesh rather than built as its own, so
    // it costs triangles and never a draw call, and it casts with the shell —
    // which is what puts it in the ghost's silhouette too. Rings are authored
    // in absolute metres like the shell's own, so no translate.
    shellParts.push(tinted(
      loftGeometry(loftProfile(look.top.profile.map((ring) => ({ ...ring }))), {
        radialSegments: 20,
      }),
      look.top.tint,
    ));
  }
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
  const shellGeometry = track(mergeGeometries(shellParts));
  // The look's livery, painted into the merged shell's vertex colours — the
  // cop's headlamp-square technique, now a channel every machine reads. After
  // the merge deliberately, so a painter sees the same one geometry the mesh
  // draws and can band off its real bounding box.
  look.paintShell?.(shellGeometry);
  const shell = shadowed(new THREE.Mesh(shellGeometry, shellMaterial));
  shell.receiveShadow = true;
  shell.name = 'euc-shell';
  body.add(shell);

  // -- Trim -----------------------------------------------------------------
  // Patches of the machine's own surfaces, so they curve with it — the
  // standard machine's shoulder stripes and nose blade, or Red Rider's guard
  // and nameplate set. However many patches a look authors, they merge into
  // one mesh under one material, so the slot costs one draw call on every
  // machine. Still named `euc-accent`: the cop's decoration trim and every
  // name-based lookup predate the axis, and a rename would be a silent QA
  // redirect (the ghost's twenty-nine-scenario lesson).
  const trimParts: THREE.BufferGeometry[] = [];
  for (const patch of look.trim.patches) trimParts.push(...machinePatch(patch));
  const accent = new THREE.Mesh(track(mergeGeometries(trimParts)), trimMaterial);
  accent.name = 'euc-accent';
  body.add(accent);

  // -- Leg-contact pads -----------------------------------------------------
  for (const side of [-1, 1]) {
    // However many blocks a look authors, they merge into the one per-side
    // pad mesh — a pad is a slot in the draw-call budget, not a part count.
    const padGeometry = track(mergeGeometries(padBlocks.map((profile) => loftGeometry(
      profile,
      // A pad that wears a page needs its seam split, like any paged loft
      // (`render/rider.ts`), or the last facet draws the page reversed.
      { radialSegments: look.pads?.segments ?? 12, splitSeam: padsPrinted },
    ))));
    if (padsPrinted && look.atlas !== undefined && look.pads?.art !== undefined) {
      // Turn the page so its centre is the outboard face's centre and its
      // seam lies on the inboard face, buried in the shell. The loft's `u`
      // starts at +X, which is the LEFT pad's outboard face and the right
      // pad's inboard one — so the left pad turns by half a wrap and the
      // right pad by none, and the right pad wears the page mirrored, as
      // every `pad` patch always has.
      const uv = padGeometry.getAttribute('uv');
      const turn = side > 0 ? 0.5 : 0;
      for (let i = 0; i < uv.count; i += 1) {
        const u = uv.getX(i) + turn;
        uv.setX(i, u >= 1 ? u - 1 : u);
      }
      mapUvInto(padGeometry, look.atlas.region(look.pads.art));
    }
    look.pads?.paintPad?.(padGeometry, side);
    const pad = shadowed(new THREE.Mesh(padGeometry, padMaterial));
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
    const mountTopX = side * shellProfile[0]!.halfWidth - pedalCentreX;
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
    const pedalGeometry = track(mergeGeometries(parts));
    look.paintPedal?.(pedalGeometry, side);
    const pedal = shadowed(new THREE.Mesh(pedalGeometry, pedalMaterial));
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
    track(mergeGeometries(look.headlight.patches.flatMap(machinePatch))),
    headlightMaterial,
  );
  headlight.name = 'euc-headlight';
  body.add(headlight);

  // Narrower and shorter than the headlight, and tapered at both ends. The
  // first capture had it as a wide slab: at chase distance the machine's whole
  // rear read as a red rectangle, and the status light — which is the one the
  // rider has to read — was competing with it. A look may author its own lamp
  // shape (`MachineLook.taillight` — q61); the material stays this shared one.
  const taillight = new THREE.Mesh(
    track(look.taillight
      ? mergeGeometries(look.taillight.patches.flatMap(machinePatch))
      : shellPatch({
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
  const statusV = vAtHeight(shellProfile, 0.556);
  const statusSeat = loftPoint(shellProfile, -Math.PI / 2, statusV, new THREE.Vector3());
  const statusOut = loftNormal(shellProfile, -Math.PI / 2, statusV, new THREE.Vector3());
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
      for (const texture of textures) texture.dispose();
      geometries.length = 0;
      materials.length = 0;
      textures.length = 0;
      group.removeFromParent();
    },
  };
}
