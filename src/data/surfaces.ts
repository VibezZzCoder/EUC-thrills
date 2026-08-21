/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';
import type { SurfaceId } from '../simulation/world.ts';

/**
 * The surface table — M4, and the second of the project's two data tables.
 *
 * `docs/PLANS.md` §4.3 names this file and the properties it must declare:
 * rolling resistance, grip, roughness amplitude, particle type, tyre-audio id,
 * and wobble-injection coefficient, for pavement, rough pavement, brick, grass,
 * gravel, dirt, and wood bridge. All seven are here, and every one of them is
 * ridden somewhere on the M4 proving ground (`level/provingGround.ts`).
 *
 * **An eighth arrived at M13 Phase 1, and it is not one of the seven.** The
 * spill is a hazard's ground rather than a level's palette, so the id list
 * splits: `TERRAIN_SURFACE_IDS` is what a level is built from and what the
 * coverage tests require every level to use, and `HAZARD_SURFACE_IDS` is what
 * is painted only inside a hazard footprint. The reasoning is on those two
 * exports, because it is a rule about levels rather than about surfaces.
 *
 * **Three of those six properties have no consumer yet, and that is on
 * purpose.** `particle` is M5's, `tyreAudio` is M8's, and `wobbleInjection` is
 * M6's. They are declared now because the table is the thing those milestones
 * will read, and a surface added later without them is a surface that silently
 * throws no dust and makes no sound. A test asserts every surface carries every
 * field, so the omission fails at `node --test` rather than in play.
 *
 * **Nothing here may import three.js** (AGENTS.md invariant 1): `simulation/`
 * reads this table on every step, so a colour lives here as a plain sRGB hex
 * number and `render/` is the only layer that turns one into a material.
 *
 * COLOUR AUTHORING, restated because it has now caught two meshes and a rider
 * (`docs/LESSONS_LEARNED.md`): the hex values below are **sRGB**, three.js
 * decodes them to linear before lighting, and "a bit darker" in a colour picker
 * is far darker after decoding. Every albedo here was chosen as a linear
 * reflectance and raised to the power 1/2.2. The linear value is written beside
 * each one so the next person can check the conversion instead of re-picking
 * by eye against a white canvas.
 */

/**
 * How the tyre marks a surface. M5 consumes it; declared here so it exists.
 *
 * `splash` arrived at M13 Phase 2 with the spill's geometry pass, and it is the
 * only member that is *brighter* than the surface it comes off — see
 * `FX.particleColours`.
 */
export type ParticleId = 'none' | 'dust' | 'grassClipping' | 'grit' | 'splinter' | 'splash';

/**
 * A visual material. Every ground surface has one of the same name; the extra
 * entries are for the things that stand *on* the ground — kerbs, walls, posts —
 * which are not surfaces a rider rolls along and so are not `SurfaceId`s.
 */
export type MaterialId = SurfaceId | 'concrete' | 'stone' | 'metal' | 'signalRed';

/** How a material is lit. `render/terrain.ts` is the only consumer. */
export interface MaterialAppearance {
  readonly id: MaterialId;
  /** Albedo, sRGB hex. Authored in linear terms — see the note above. */
  readonly albedo: number;
  /** Standard-material roughness. 1 is fully diffuse. */
  readonly roughness: number;
  readonly metalness: number;
  /**
   * How hard this surface varies, as a fraction of its own albedo.
   *
   * **This is the M4 replacement for the M1 debug grid, and it is not
   * decoration.** A 10 km one-metre grid was what made speed readable on the
   * empty plane; real terrain deletes the grid, and a large flat expanse of one
   * flat colour has no texture for the eye to track, so the ride reads slower
   * than it is. A small deterministic jitter per heightfield cell restores that
   * without a texture, an asset, or a second draw call — and it doubles as
   * surface identification, because grass mottles far more than pavement does.
   *
   * **One number, five layers.** At M4 this was the amplitude of a single
   * one-metre luminance jitter, and at full contrast on a square lattice that
   * is the definition of a checkerboard — which is what the owner saw at M7.5.
   * It is now the *overall* strength of the stack in `render/groundNoise.ts`:
   * a quieter metre-scale cue plus soft patches at roughly six and thirty
   * metres, plus slow hue and saturation drift. The ratios between the layers
   * belong to the profile there; this stays the per-surface amount, so the
   * ordering below is still what tells grass from pavement at distance.
   */
  readonly mottle: number;

  /**
   * How hard this material creeps over the one beside it, 0..1. M7.5 stage 4.
   *
   * A surface belongs to a one-metre heightfield cell, so a path crossing the
   * world at any angle but a right one has a boundary made of one-metre steps —
   * the clearest remaining "drawn on graph paper" tell in the frame. An edge
   * cell takes some of its neighbour's colour to break that lattice up
   * (`render/groundNoise.ts`), and this is the amount.
   *
   * **Directional on purpose.** Grass grows over a path and a path does not
   * grow over grass, so colour only ever travels from the higher value to the
   * lower. That is also what protects the ride: the corridor's edge frays green
   * while the meadow keeps its own colour, so the boundary the rider reads for
   * grip is still where it was, to within a metre.
   *
   * Zero for everything laid or built — paving does not spread — which is every
   * paved surface and all three structure materials.
   */
  readonly encroach: number;

  /**
   * Modular paving, for a surface that was laid rather than grown.
   *
   * Present only on brick, which in the slice is the plaza and the arch it
   * returns through. See `pavingShade` in `render/groundNoise.ts` for why a
   * regular module is allowed here when §4b spent a whole stage removing one.
   *
   * Written out structurally rather than imported from `render/groundNoise.ts`,
   * which is where the arithmetic lives: this table is read on every step by
   * `simulation/`, and it stays free of any dependency on a rendering module
   * even a type-only one that erases.
   */
  readonly paving?: {
    /** Size of one paving module, metres. */
    readonly module: number;
    /** How far a module's tone may stray from the surface's own, 0..1. */
    readonly contrast: number;
  };
}

/** Everything the game knows about one ground surface. */
export interface SurfaceProperties {
  readonly id: SurfaceId;
  /** For the debug overlay and, later, the HUD. */
  readonly label: string;

  // -- Consumed by the controller from M4 -----------------------------------

  /**
   * Constant deceleration while rolling, m/s^2.
   *
   * This is the single strongest answer to M4's exit question. On flat ground
   * the drive term is `EUC.leanToAccel * sin(EUC.maxLeanPitch)` = 7.67 m/s^2,
   * and top speed is where quadratic drag plus this balances it — so pavement
   * tops out near 15.1 m/s and grass near 12.3 m/s. The difference is far
   * larger at ordinary speeds, where drag is small: coasting at 6 m/s the wheel
   * sheds 1.5 m/s^2 on pavement and 3.9 m/s^2 on grass.
   */
  readonly rollingResistance: number;
  /**
   * Multiplier on the lateral-acceleration ceiling. Pavement is exactly 1.
   *
   * Applied to `EUC.maxLateralG`, which is the limit that makes a fast turn go
   * wide (`docs/PLANS.md` §4.2). At grass's 0.70 the ceiling falls from 0.75 g
   * to 0.53 g, so the same corner taken at the same speed runs wider and the
   * wheel leans 28 degrees instead of 37.
   *
   * Deliberately **not** applied to braking or drive authority. Rolling
   * resistance already separates the surfaces longitudinally, and folding grip
   * into brake authority would change an approved M2 number for a reason
   * `docs/PLANS.md` does not state. Flagged for the owner instead.
   */
  readonly grip: number;
  /**
   * Peak vertical displacement the surface texture feeds the suspension, m.
   *
   * A spatial field, not a time-varying one (`simulation/roughness.ts`), so a
   * stopped wheel sits still and the same ground always feels the same. The
   * wavelengths below are chosen so that at riding speed the excitation lands
   * near the suspension's own frequency, which is what makes the rider visibly
   * work over grass and sit still on pavement.
   */
  readonly roughnessAmplitude: number;
  /** Dominant wavelength of that roughness, m. See above. */
  readonly roughnessWavelength: number;

  // -- Declared now, consumed later -----------------------------------------

  /** What the tyre throws up. M5. */
  readonly particle: ParticleId;
  /** Tyre-noise voice id. M8 cross-fades these on a surface change. */
  readonly tyreAudio: string;
  /**
   * Wobble energy injected per second per m/s ridden. M6, emptied at M13.
   *
   * `docs/PLANS.md` §4.5 fed `surfaceRoughness` into the wobble oscillator, and
   * every surface below carried a value for it: gravel squirmed most, a wood
   * bridge was smooth and unsettling, pavement did nothing. **All of them are
   * zero now**, because the owner's §13 q8 answer replaced the trigger set with
   * one item — a hazard the rider can see and choose to avoid — and the ground
   * you happened to pick is the opposite of that. Choosing gravel is a texture
   * decision again, not a risk one.
   *
   * The field stays, and it is not vestigial: M13 Phase 1 added the liquid
   * spill as a surface, and it is the only row here with a non-zero injection —
   * asserted in `surfaces.test.ts`, because a second source reintroduced later
   * would quietly undo the paragraph below.
   * That is also what lets the oscillator drop its visibility threshold — with
   * no continuous background source, any energy at all means the rider hit
   * something (`data/tuning.ts`, `wobbleStateEnergy`).
   *
   * Kept separate from `roughnessAmplitude`, which is untouched, because the
   * two were never the same question: one is what the suspension feels, the
   * other is what the steering does about it.
   */
  readonly wobbleInjection: number;

  // -- Presentation ----------------------------------------------------------

  /** Which visual material `render/` builds for this surface. */
  readonly material: MaterialId;
}

/**
 * Visual materials.
 *
 * The ground entries and the structure entries are one table on purpose: they
 * are lit by the same rig, judged in the same frame, and a kerb that reads as
 * the same value as the road it borders is the failure this table exists to
 * prevent. See `DESIGN.md` for the vocabulary these establish.
 */
export const MATERIALS: Readonly<Record<MaterialId, MaterialAppearance>> = deepFreeze({
  // linear 0.202 → 0.202^(1/2.2)
  pavement: {
    id: 'pavement', albedo: 0x797b7e, roughness: 0.95, metalness: 0.0, mottle: 0.075, encroach: 0,
  },
  // linear 0.155, warmed slightly. Coarser than pavement in value as well as
  // in mottle, so the two read apart at chase-camera distance.
  // Grit washes off a coarse surface onto a smooth one, which is the only
  // encroachment among the paved surfaces and the reason the plaza's brick does
  // not meet the returning road along a one-metre staircase.
  roughPavement: {
    id: 'roughPavement', albedo: 0x6d6e6c, roughness: 0.98, metalness: 0.0, mottle: 0.12,
    encroach: 0.22,
  },
  // linear (0.16, 0.075, 0.055) — a warm clay plaza, the vision's beat 1.
  // The one laid surface, so the one that carries a paving module: 2.8 m reads
  // as large format slabs from the chase camera rather than as brickwork, which
  // at 80 pixels a metre would alias into noise.
  brick: {
    id: 'brick', albedo: 0x6f5046, roughness: 0.88, metalness: 0.0, mottle: 0.13, encroach: 0,
    paving: { module: 2.8, contrast: 0.06 },
  },
  // linear (0.055, 0.115, 0.042). Dark enough to read as grass under a midday
  // sun without becoming the black hole the M0/M2 lesson warns about.
  // Turf takes back an unswept edge harder than anything else in the palette,
  // so it is the reference the other two encroachments are set against.
  grass: {
    id: 'grass', albedo: 0x435f3c, roughness: 1.0, metalness: 0.0, mottle: 0.20, encroach: 1.0,
  },
  // linear (0.19, 0.178, 0.155) — pale warm grey, the brightest ground here.
  gravel: {
    id: 'gravel', albedo: 0x78746e, roughness: 1.0, metalness: 0.0, mottle: 0.19, encroach: 0.65,
  },
  // linear (0.135, 0.098, 0.062) — packed trail dirt.
  dirt: {
    id: 'dirt', albedo: 0x685a4a, roughness: 0.98, metalness: 0.0, mottle: 0.17, encroach: 0.75,
  },
  // linear (0.115, 0.078, 0.048), lower roughness: planking has a sheen.
  wood: {
    id: 'wood', albedo: 0x615343, roughness: 0.72, metalness: 0.0, mottle: 0.11, encroach: 0,
  },
  // linear (0.125, 0.132, 0.145) — **wet road, not water.** This material is the
  // spill's *footprint*, and a footprint is a set of one-metre heightfield
  // cells: it can only ever be an axis-aligned staircase, and at a quarter of
  // pavement's value that staircase read as a black cardboard mat laid on the
  // street. The first pass asked the cell grid to be the puddle and the grid
  // cannot be one.
  //
  // So the two jobs are split. `render/hazards.ts` draws the water — an organic
  // lobed mesh with a real sheen, inside the footprint — and this row is the
  // damp margin around it, which is what a spill actually has and what makes the
  // staircase honest: the grip penalty covers every painted cell, so every
  // painted cell should look wet, just not deep. Two thirds of pavement, a
  // shade cool, which is enough to see and not enough to read as a hole.
  //
  // **The roughness follows that split.** Standing water is smooth and lives in
  // `PUDDLE.roughness`; damp asphalt is still asphalt. It also removes a real
  // artifact: at 0.25 across a grid, every cell caught the sun as its own square
  // and the footprint shimmered as a chequerboard when the camera moved.
  //
  // **Mottle high, which is the reverse of what this row said when it was
  // trying to be water.** A sheet of standing water that varied per square metre
  // would read as a stain; damp asphalt that *doesn't* reads as a painted
  // rectangle, and a rectangle is precisely the artifact the cell grid keeps
  // producing. Ground dries in patches, so per-cell variation is what breaks the
  // staircase up into something the eye accepts. Encroach is the highest of any
  // paved surface for the same reason, from the other side: damp has no boundary
  // at all, it just runs out.
  spill: {
    id: 'spill', albedo: 0x62666c, roughness: 0.62, metalness: 0.0, mottle: 0.14,
    encroach: 0.85,
  },

  // linear 0.30 — deliberately the lightest value in the kit. A kerb is only
  // useful if the player can see where it is before they hit it.
  concrete: {
    id: 'concrete', albedo: 0x92928d, roughness: 0.92, metalness: 0.0, mottle: 0.04, encroach: 0,
  },
  // linear 0.22 — walls and plaza furniture, a step down from kerb concrete.
  stone: {
    id: 'stone', albedo: 0x807b74, roughness: 0.9, metalness: 0.0, mottle: 0.06, encroach: 0,
  },
  // linear 0.10, with enough metalness to catch the sun on a bollard's cap.
  metal: {
    id: 'metal', albedo: 0x5a5a5e, roughness: 0.45, metalness: 0.65, mottle: 0.0, encroach: 0,
  },
  // linear (0.442, 0.0315, 0.0265) — **painted, not pigmented.** M23 Phase B1's
  // fourth structure material, and the one thing that turns a grey graybox into
  // a race venue: a modular barrier alternates this with `concrete` down both
  // sides of BelVar Circuit.
  //
  // It is a new entry rather than a reuse because the free candidate does not
  // do the job. `brick` is the palette's only existing red and it is a warm
  // clay at linear (0.16, 0.075, 0.055) — a fifth of the red channel and three
  // times the green — which reads as a garden wall at chase-camera distance
  // and never as safety paint. The two draw calls it costs (a colour pass and
  // a shadow pass, `data/renderCost.ts`) are two of the ten the library had
  // spare, spent on the kind `docs/PLANS.md` §23.7 named first.
  //
  // The red channel sits under the 0.6 legibility ceiling with room, and the
  // other two sit above the 0.03 floor as a *luminance* (0.118) rather than
  // per channel — a saturated hue is dark in green and blue by definition, and
  // `surfaces.test.ts` measures the luminance the eye actually reads.
  //
  // Roughness follows the finish: coated panel, not raw concrete, so it holds
  // a little more of the sun than the kerb beside it. Mottle is a structure
  // material's, which is nearly none — a barrier is manufactured and the
  // per-cell jitter is a *ground* effect anyway; a block mesh is built with
  // vertex colours off.
  signalRed: {
    id: 'signalRed', albedo: 0xb03531, roughness: 0.7, metalness: 0.0, mottle: 0.05, encroach: 0,
  },
});

/**
 * The seven slice surfaces, and M13's spill.
 *
 * Ordered as `docs/PLANS.md` §4.3 lists them, which is also roughly the order
 * the vertical slice introduces them in. The spill is last because it is not
 * one of them — see `HAZARD_SURFACE_IDS`.
 */
export const SURFACES: Readonly<Record<SurfaceId, SurfaceProperties>> = deepFreeze({
  pavement: {
    id: 'pavement',
    label: 'pavement',
    rollingResistance: 0.35,
    grip: 1.0,
    roughnessAmplitude: 0.004,
    roughnessWavelength: 3.0,
    particle: 'none',
    tyreAudio: 'tyre-smooth',
    wobbleInjection: 0,
    material: 'pavement',
  },
  roughPavement: {
    id: 'roughPavement',
    label: 'rough pavement',
    rollingResistance: 0.85,
    grip: 0.92,
    roughnessAmplitude: 0.020,
    roughnessWavelength: 2.2,
    particle: 'none',
    tyreAudio: 'tyre-coarse',
    wobbleInjection: 0,
    material: 'roughPavement',
  },
  brick: {
    id: 'brick',
    label: 'brick',
    rollingResistance: 0.55,
    grip: 0.96,
    roughnessAmplitude: 0.012,
    roughnessWavelength: 1.6,
    particle: 'none',
    tyreAudio: 'tyre-brick',
    wobbleInjection: 0,
    material: 'brick',
  },
  grass: {
    id: 'grass',
    label: 'grass',
    rollingResistance: 2.80,
    grip: 0.70,
    roughnessAmplitude: 0.032,
    roughnessWavelength: 2.6,
    particle: 'grassClipping',
    tyreAudio: 'tyre-grass',
    wobbleInjection: 0,
    material: 'grass',
  },
  gravel: {
    id: 'gravel',
    label: 'gravel',
    rollingResistance: 1.90,
    grip: 0.58,
    roughnessAmplitude: 0.040,
    roughnessWavelength: 1.9,
    particle: 'dust',
    tyreAudio: 'tyre-gravel',
    wobbleInjection: 0,
    material: 'gravel',
  },
  dirt: {
    id: 'dirt',
    label: 'dirt',
    rollingResistance: 1.10,
    grip: 0.80,
    roughnessAmplitude: 0.026,
    roughnessWavelength: 3.1,
    particle: 'dust',
    tyreAudio: 'tyre-dirt',
    wobbleInjection: 0,
    material: 'dirt',
  },
  wood: {
    id: 'wood',
    label: 'wood bridge',
    rollingResistance: 0.45,
    grip: 0.86,
    roughnessAmplitude: 0.010,
    roughnessWavelength: 2.4,
    particle: 'splinter',
    tyreAudio: 'tyre-wood',
    wobbleInjection: 0,
    material: 'wood',
  },
  /**
   * Standing water — M13 Phase 1, and the only ground in the game that can end
   * a run. Painted inside a spill hazard's footprint and nowhere else.
   *
   * **`wobbleInjection: 11`, which is where the milestone lives.** The
   * controller integrates `injection × speed × EUC.wobbleSurfaceGain` (0.012)
   * against damping proportional to the energy, so the puddle is an exponential
   * approach to a ceiling rather than an impulse:
   *
   *   per metre of water:  11 × 0.012          = 0.132 energy/m, at any speed
   *   at 12 m/s, in:       11 × 12 × 0.012     = 1.584 energy/s
   *   damping, driving:    0.55 aggressive + 1.00 automatic foot correction
   *   ceiling:             1.584 / 1.55        = 1.02
   *
   * Read three ways. **The `wobbling` state (0.35) arrives about three metres
   * in whatever speed you entered at**, because early on the decay term is
   * negligible and both the injection and the distance scale with speed — so
   * the announcement is a property of the puddle, not of the approach. **Speed
   * decides where the climb stops**: the ceiling passes `wobbleCrashEnergy`
   * (1.0) above 1.55 / (11 × 0.012) = 11.7 m/s, which makes the owner's §13 q8
   * sentence — "if the rider does not reduce speed to correct it, they crash" —
   * literally true, and makes "reduce speed" a reachable instruction rather
   * than a figure of speech. Below 11.7 m/s no puddle of any length can crash
   * anyone. **And easing off is the other correction**: at or under
   * `wobbleSmoothThrottle` on a held line the damping is 2.40 + 1.00, so the
   * ceiling at 12 m/s falls to 0.47 — still weaving, still visible, no longer
   * fatal.
   *
   * Sized so the exit is always real. Four metres of water at 12 m/s leaves
   * 0.46 and twelve leaves 0.83; the crash at that speed needs 35 m of
   * continuous water (14 m flat out at 15 m/s), which is a chain of puddles
   * rather than a puddle. Off the water the injection stops dead and the energy
   * halves every 0.45 s, so 0.97 is back under the state threshold in 0.6 s
   * driving or 0.3 s eased. You ride *out* of a spill; you have already hit the
   * pothole (`data/tuning.ts`, the hazard energies).
   *
   * The rest of the row is deliberately mild, because one surface should punish
   * one mistake once: see the material above for the look, and note that grip
   * is the one number that must not go lower — a wheel that cannot be steered
   * toward the far edge cannot take the exit this whole design rests on.
   */
  spill: {
    id: 'spill',
    label: 'liquid spill',
    // Water over paving, so the wheel is displacing a slug rather than digging
    // in: between dirt and gravel, and no higher. The threat here is the
    // oscillator, and taking a gravel's worth of speed as well would charge the
    // same mistake twice.
    rollingResistance: 1.20,
    // Half of grass, the loosest ground the slice has. Against
    // `EUC.maxLateralG` that is a 0.26 g ceiling, so a 12 m/s carve holding a
    // 20 m radius on pavement runs out to 56 m and the line the rider chose is
    // simply gone.
    grip: 0.35,
    // The smoothest ground in the game, on the longest wavelength — and the
    // inversion is the point. Gravel is the roughest surface and, since M13's
    // trigger set, entirely harmless; water is flat, quiet underfoot, and the
    // only surface that can kill. Nothing arrives through the suspension to
    // warn the rider, which is why the hazard has to be *seen*.
    roughnessAmplitude: 0.002,
    roughnessWavelength: 4.0,
    // **Spray, added at Phase 2 with the rest of the look.** Phase 1 shipped
    // this as `none` on the argument that a puddle throwing dust would be a
    // worse answer than one throwing nothing, and that argument held only
    // because no water-coloured id existed yet. It does now, and it is the one
    // particle in the table that is brighter than the ground it leaves —
    // which is what makes it visible against the darkest surface in the game.
    //
    // Unlike every other id here it is emitted continuously rather than on a
    // landing, because a spill is a place and not an impact: the spray is the
    // rider being *told they are still in it*, which is the half of the
    // readability problem the mesh family cannot solve (`DESIGN.md` §6d).
    particle: 'splash',
    tyreAudio: 'tyre-spill',
    wobbleInjection: 11,
    material: 'spill',
  },
});

/** Every surface id, in table order. The completeness test iterates it. */
export const SURFACE_IDS: readonly SurfaceId[] = deepFreeze(
  Object.keys(SURFACES) as SurfaceId[],
);

/**
 * The surfaces that exist only inside a hazard's footprint — M13 Phase 1.
 *
 * **The split is here because it is a rule about levels, and every level has to
 * obey it.** A terrain surface is what a segment declares and what a verge band
 * chooses; it belongs to a corridor, it stretches for as long as that corridor
 * does, and `sliceLevel.test.ts` and `provingGround.test.ts` require every
 * level to use all of them somewhere, so that a surface cannot be declared,
 * tuned, given a voice and then never ridden. A hazard surface answers to none
 * of that: `buildPlan` paints it inside a `Hazard` circle and nothing else may
 * ask for it, and by the owner's §13 q9 answer it appears in **generated routes
 * only** — the hand-authored slice and the proving ground stay pristine, so a
 * new player gets a hazard-free ramp before a fresh route introduces one.
 *
 * Without the split those coverage tests would demand a spill in a world the
 * owner decided cannot contain one, and the only way to satisfy them would be
 * to weaken the guard for all eight. Two lists keep both claims whole: every
 * terrain surface is ridden, and the hazard surface is not there at all.
 *
 * The consequence that makes this worth enforcing rather than documenting: the
 * spill carries the table's only non-zero `wobbleInjection`, so a hazard
 * surface reaching a segment or a band would not be a wrong colour — it would
 * be a corridor-length wobble source, and it would be the milestone's central
 * promise broken (`level/segmentLibrary.test.ts` proves no spec can).
 */
export const HAZARD_SURFACE_IDS: readonly SurfaceId[] = deepFreeze<SurfaceId[]>(['spill']);

/**
 * The palette levels are built from: everything that is not a hazard surface.
 *
 * Derived rather than written out a second time, so a ninth surface lands in
 * exactly one of the two lists by construction and `surfaces.test.ts` proves
 * the pair still partitions `SURFACE_IDS`. A hand-maintained copy would answer
 * a new surface by silently omitting it from both, which is the one outcome
 * neither guard would catch.
 */
export const TERRAIN_SURFACE_IDS: readonly SurfaceId[] = deepFreeze(
  SURFACE_IDS.filter((id) => !HAZARD_SURFACE_IDS.includes(id)),
);

/**
 * Look one up, falling back to pavement.
 *
 * A missing surface is a level-authoring bug, and the honest response is the
 * one that keeps the wheel rideable while the debug overlay shows an id nobody
 * recognises — not a throw inside the 120 Hz step.
 */
export function surfaceProperties(id: SurfaceId): SurfaceProperties {
  return SURFACES[id] ?? SURFACES.pavement;
}

/** The visual material for a surface or a structure. */
export function materialAppearance(id: MaterialId): MaterialAppearance {
  return MATERIALS[id] ?? MATERIALS.pavement;
}
