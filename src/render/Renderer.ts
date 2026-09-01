/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { CAMERA, EUC, FX, LIGHTING, RENDER } from '../data/tuning.ts';
import {
  materialAppearance,
  surfaceProperties,
  type ParticleId,
} from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { GhostSample } from '../simulation/ghost.ts';
import { createPose, type EucPose } from '../simulation/EucController.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createCheckpointGates, type CheckpointGates } from './checkpointGates.ts';
import { createTargets, type TargetFamily } from './targets.ts';
import { createGhostRider, type GhostRider } from './ghostRider.ts';
import { createCopRider, type CopRider } from './copRider.ts';
import { machineForCharacter } from '../data/machines.ts';
import { machineLook } from './machineLook.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';
import { PLAYABLE_RIDER_LOOKS, riderLook } from './riderLook.ts';
import { DEFAULT_CHARACTER, type CharacterId } from '../data/riders.ts';
import { createParticleField, type ParticleField } from './particles.ts';
import { createSky, type SkyTexture } from './sky.ts';
import { createTerrain, type TerrainView } from './terrain.ts';
import { paneBounds, paneGridFor, type PaneRect } from '../shared/paneGrid.ts';

/**
 * Renderer, scene, camera, and the daytime lighting rig.
 *
 * Lighting, tone mapping, exposure, emissive levels, and — from M4 — the
 * distance haze are one coupled system with one owner (AGENTS.md invariant 6).
 * That owner is this file. Change them here, sequentially, and never in
 * parallel with another visual change. The fog's colour is the background
 * colour on purpose: moving one without the other produces a horizon band that
 * does not match the sky.
 *
 * Linear fog is a per-material built-in, not a post-processing pass, so
 * invariant 7 is intact. No post-processing is permitted until the performance
 * budget proves the frame has room for it.
 *
 * **The placeholder ground is gone at M4.** The renderer no longer describes
 * any part of the world; it is handed a `LevelPlan` and `render/terrain.ts`
 * builds the ground from it (invariant 2).
 *
 * **M5's contact effects are owned here** for the same reason as the lighting:
 * particle brightness is a member of the coupled visual system (invariant 6,
 * `DESIGN.md` §6), so the two fields are created, stepped, and disposed
 * alongside the rig they are judged against rather than by whichever system
 * happens to trigger them. `app/Game.ts` says *that* a landing or a scrape
 * happened; this file decides what it looks like.
 *
 * **M10's ghost and checkpoint gates are owned here for the same reason.** The
 * ghost's transparency and the gates' unlit brightness are both members of the
 * coupled visual system (invariant 6): they are judged against this exposure,
 * this tone mapping, and this haze, and one owner changing them sequentially is
 * the rule. `app/Game.ts` says which checkpoint is next and where the ghost is;
 * this file decides what either one looks like. Neither answers any gameplay
 * question — a gate here is three boxes, and the box that actually detects a
 * crossing lives in `simulation/challenge.ts` reading the same `LevelPlan`.
 */

export interface ViewportChange {
  /** True when the CSS-pixel size of the drawing surface actually changed. */
  readonly layoutChanged: boolean;
  readonly width: number;
  readonly height: number;
}

/**
 * What the game does when the GPU goes away and comes back.
 *
 * three.js already handles its own half of a context loss — it prevents the
 * event's default so the browser is allowed to restore, and rebuilds GPU
 * state on `webglcontextrestored`. What it cannot do is stop the simulation,
 * clear the player's held input, or tell anyone: without these callbacks the
 * game keeps running behind a dead canvas.
 */
export interface ContextLossCallbacks {
  onLost(): void;
  onRestored(): void;
}

/** The armed state of the M27 Phase 0 quad probe. See the field on the class. */
interface PerfQuadProbe {
  readonly rigs: { readonly rig: RidingRig; readonly at: { x: number; y: number; z: number } }[];
  readonly cameras: THREE.PerspectiveCamera[];
}

/**
 * Overlap at which a scrape throws its full spark rate. Read from `EUC` so the
 * rider's boot lift and the sparks normalise against the same number: a scrape
 * that looks half as deep also throws half as many sparks.
 */
const EUC_PEDAL_STRIKE_REFERENCE_DEPTH = EUC.pedalStrikeReferenceDepth;

/**
 * Particle colour per `ParticleId`. `none` is absent on purpose — a surface
 * that throws nothing emits nothing rather than a colourless puff.
 */
const PARTICLE_COLOURS: Partial<Record<ParticleId, number>> = FX.particleColours;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /**
   * The frame's first view — M25 Phase 3.
   *
   * `viewCameras[0]` and this field are the same object, deliberately: every
   * reader that predates the split (the QA snapshot's `tuning.fieldOfView`,
   * four browser specs, `tools/rider-views.mjs`) means "the camera the player
   * is looking through", and in a left|right split that is still the left
   * half. A second camera is an addition, never a replacement.
   */
  readonly camera: THREE.PerspectiveCamera;

  /**
   * One camera per drawn view, left to right — M25 Phase 3.
   *
   * The array *is* the split: `viewCount === 1` is the single-player frame
   * this game has always drawn, and nothing about the two-view path is
   * conditional anywhere else. Cameras hold no GPU resource — no buffers, no
   * programs, nothing `renderer.info.memory` counts — so seating and
   * dismissing a second view costs an object and a projection matrix, which
   * is why `setViewCount` can be called at runtime without a plateau test of
   * its own.
   */
  private readonly viewCameras: THREE.PerspectiveCamera[] = [];

  /**
   * How much the split widens the vertical field of view, and where it stops.
   *
   * Pushed from `Game.applyTuning` rather than read from `CAMERA` here, for
   * the reason `setQuality` takes its ceiling as an argument: the tuning
   * store is the app layer's, and a renderer that reached into it would be a
   * second reader of a value the F4 panel can move. See `splitFieldOfView`.
   */
  private splitFovGain: number = CAMERA.splitFovGain;
  private splitFovCap: number = CAMERA.splitFovCap;

  /**
   * The same widening for a quadrant, which needs almost none — M27 Phase 1.
   *
   * A separate number rather than a shape-aware expression, because the two
   * shapes have different geometry and the owner judges each by eye: a half
   * loses 38 horizontal degrees and a quadrant loses none at all (§27.2). It
   * ships at `CAMERA.quadFovGain` and moves through the same F4 push.
   */
  private quadFovGain: number = CAMERA.quadFovGain;

  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly disposables: { dispose(): void }[] = [];

  /**
   * The M27 Phase 0 quad probe — an *instrument*, never a mode.
   *
   * `tools/perf-window.js --views 4` needs the honest four-seat frame — four
   * full passes of the real world, each with its own shadow render, through
   * four quadrant cameras — before any seat model for four exists, because the
   * scope lock that would *open* that seat model is decided on this frame
   * (`docs/PLANS.md` §27.6). So the renderer owns the whole arrangement: three
   * planted rigs standing beside the ridden one, three probe cameras framing
   * them chase-style, and a 2×2 pass loop. No seat, no input, no HUD, no
   * option, no URL — the surface is the QA bridge's `game.renderer`, which is
   * `spawnSecondRider`'s discipline exactly, and it is what keeps the phone
   * contract's unreachability argument intact (`tests/touch.spec.ts` still
   * pins one rider, one view, one HUD on mobile).
   */
  private perfProbe: PerfQuadProbe | null = null;

  /** The world, built from a `LevelPlan`. Disposed and rebuilt with the level. */
  private terrain: TerrainView | null = null;
  /**
   * What the current level repainted, held for anything that must match the
   * ground rather than the table. See `LevelPlan.palette`.
   *
   * Not a second palette: it is the same object the terrain resolved through,
   * kept because a particle that settles into the grass has to settle into
   * *this* level's grass.
   */
  private palette: LevelPlan['palette'] = undefined;

  /**
   * M10's checkpoint markers, built from the same plan. Rebuilt with the level
   * because a checkpoint belongs to a level; disposed with it for the same
   * reason.
   */
  private gates: CheckpointGates | null = null;
  /** The Knockabout target family — M14. Rebuilt with the level, like the gates. */
  private targets: TargetFamily | null = null;
  /**
   * Which targets are down, held **here** rather than only on the family.
   *
   * The same argument the two checkpoint fields above make, and a stronger case
   * for it: `setLevel` throws the instanced family away and builds a new one, so
   * without this a rebuild in the middle of a run repaints every struck target
   * standing — and the player who knocked them down watches the score stay put
   * while the world says otherwise. A WebGL context restore is the same event
   * wearing different clothes.
   */
  private struckTargets = new Set<string>();
  /** Whether the knock-down animation is suppressed. See `TargetFamily`. */
  private targetsReducedMotion = false;

  /**
   * What the challenge last asked the gates to show.
   *
   * Held on the renderer rather than only on the gates so a level rebuild
   * cannot silently drop it. `setLevel` throws away the markers and builds new
   * ones; without these two the gates would come back hidden and at index -1
   * in the middle of a run, which is the class of bug that only ever appears
   * on a retry.
   */
  private checkpointsVisible = false;
  private nextCheckpointIndex = -1;

  /**
   * M10's ghost. One at a time, for the life of the renderer.
   *
   * Built eagerly and left hidden rather than created on demand: it costs no
   * draw call while hidden, and a rig built mid-run would upload two dozen
   * geometries and compile a program at the moment the player is being timed.
   * A constant resource count across every mode is also the easier thing for
   * the QA bridge's plateau check to assert.
   *
   * **It stopped being `readonly` at M14.5**, when it became possible for the
   * player to be somebody else. A ghost is the player's own earlier run, so it
   * wears the player's own rider; a Cool Rider ghost racing a Trollina would
   * read as somebody else's time. `setCharacter` is the only place it is
   * replaced, and it is built to `setLevel`'s rule — one at a time, and a
   * second call disposes the first.
   */
  private ghost: GhostRider;
  /** Which rider the ghost is currently built as, so a repeat is a no-op. */
  private ghostCharacter: CharacterId = DEFAULT_CHARACTER;
  /**
   * M18's cop. Built once and hidden, exactly as the ghost is.
   *
   * See `secondRider` below for why he and the ghost are one slot.
   */
  private cop: CopRider;
  /**
   * **Which second rider the frame is showing, and it is one field on purpose.**
   *
   * A Time-trial ghost and a chase cop are different modes and could have been
   * left as two independent booleans that simply never happened to be true
   * together. They are not, because the render budget depends on it: the
   * non-level reserve is measured as the *worse* of the two frames rather than
   * their sum (`render/renderCost.ts`), and on the densest known route the sum
   * does not fit the §9 ceiling. Two booleans would make that a convention
   * anybody could break by adding a call site; one field makes showing either
   * hide the other, in one expression, for good.
   */
  private secondRider: 'none' | 'ghost' | 'cop' = 'none';

  /** M5's two contact effects. Stepped from the fixed step, not the frame. */
  private readonly sparks: ParticleField;
  private readonly dust: ParticleField;

  /** M7.5's painted sky. Background only — no geometry, no draw call. */
  private readonly sky: SkyTexture;

  /** Sun position relative to whatever it is lighting. Constant, so the light
   *  direction never changes as the cascade follows the rider. */
  private readonly sunOffset = new THREE.Vector3();

  private lastWidth = 0;
  private lastHeight = 0;
  private lastPixelRatio = 0;

  private contextCallbacks: ContextLossCallbacks | null = null;

  /**
   * Live copy of RENDER.maxPixelRatio. Held as a field rather than read from
   * the frozen defaults so the tuning panel can move it, and so a future
   * adaptive-quality step has one place to write.
   */
  private maxPixelRatio: number = RENDER.maxPixelRatio;

  /**
   * Fractional sparks owed from previous steps, **per emitter**.
   *
   * A scrape emits at a rate, and one 120 Hz step at 90 particles a second is
   * three quarters of a particle. Rounding that to zero would emit nothing
   * ever; rounding it to one would emit at 120 a second whatever the rate
   * says. Carrying the remainder makes the rate mean what it says.
   *
   * **An array rather than a number since M25 Phase 2.** The pool is shared
   * and stays shared — one `ParticleField`, one draw call, one `stepParticles`
   * clock — but the *remainder* is a fact about one rider's continuous scrape,
   * and two riders sharing one remainder hand each other's fractions back and
   * forth. `source` is the seat index, so the array grows with the seats and
   * a seat that never scrapes never costs a slot.
   */
  private readonly sparkDebt: number[] = [];

  /**
   * Fractional spray owed from previous steps — M13 Phase 2, per emitter since
   * M25 Phase 2.
   *
   * `sparkDebt`'s job for the other continuous emitter, and it is reset rather
   * than carried whenever the wheel leaves the water: a rider who crosses three
   * puddles should get three sprays that each start from nothing, not one that
   * remembers a fraction of a droplet from the last one.
   *
   * **This one had to become per-emitter or a second rider would have deleted
   * the feature.** The reset above fires from a caller who is *not* in water,
   * and `emitSurfaceSpray` is called every step by every rider — so with one
   * shared remainder, a dry seat 1 stepped after a wet seat 0 would zero the
   * debt every step. At 55 droplets a second and a 120 Hz step no single step
   * ever accrues a whole one, so the spray would have gone from a sheet of
   * water to nothing at all, silently, on the day a second seat existed.
   */
  private readonly splashDebt: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap is deprecated as of three 0.185 and silently falls back
    // to PCFShadowMap, so ask for what we actually get.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // **Both of these exist because a frame may now be more than one pass**
    // (M25 Phase 3, docs/PLANS.md §25.4).
    //
    // `autoClear` would clear at the top of *every* `render()` call, so the
    // second pass would wipe the first: the left half would be drawn and then
    // erased, every frame, and the canvas would show one rider on a full-width
    // view. `beginFrame` does the one clear instead.
    //
    // `info.autoReset` would reset the draw-call counters at the top of every
    // `render()` call, so the two runtime diagnostics that read them — the QA
    // snapshot's `render` block and the F3 overlay — would silently report the
    // *right-hand half only* and a split frame would look cheaper than a
    // single-player one. `beginFrame` resets once instead, which makes
    // `info.render.calls` the sum of every pass. That sum is precisely the
    // definition §25.4 gives for what a split frame costs.
    //
    // Both are set for the single-view path too. Two paths that reported
    // differently would be worse than either.
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();

    // **The sky, from M7.5.** Until then the background was one flat colour,
    // which is where most of the slice's "diagram of a place" reading came
    // from: no up cue, a hard horizon division, and no sign of the sun that
    // casts every shadow in the frame.
    //
    // The haze contract in `DESIGN.md` §6 is unchanged and is the reason the
    // fog still takes `horizonColour`: that value is now the sky's *bottom
    // stop* rather than the whole background, so the far edge of the surround
    // still dissolves into exactly the value the sky has where it meets it.
    // Moving one without the other puts the horizon band back.
    this.sky = createSky();
    this.scene.background = this.sky.texture;
    this.scene.fog = new THREE.Fog(LIGHTING.horizonColour, LIGHTING.fogNear, LIGHTING.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      THREE.MathUtils.radToDeg(CAMERA.fovAtRest),
      1,
      CAMERA.near,
      CAMERA.far,
    );
    this.viewCameras.push(this.camera);

    // Hemisphere fill. Downward-facing surfaces sample groundBounceColour —
    // the underside of the wheel and, from M2, the rider. Too dark and those
    // become voids; too bright and nothing reads as sitting on the ground.
    this.hemisphere = new THREE.HemisphereLight(
      LIGHTING.skyColour,
      LIGHTING.groundBounceColour,
      LIGHTING.hemisphereIntensity,
    );
    this.scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(LIGHTING.sunColour, LIGHTING.sunIntensity);
    const horizontal = Math.cos(LIGHTING.sunElevation) * LIGHTING.sunDistance;
    this.sunOffset.set(
      Math.sin(LIGHTING.sunAzimuth) * horizontal,
      Math.sin(LIGHTING.sunElevation) * LIGHTING.sunDistance,
      Math.cos(LIGHTING.sunAzimuth) * horizontal,
    );
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(LIGHTING.shadowMapSize);
    this.sun.shadow.bias = LIGHTING.shadowBias;
    this.sun.shadow.normalBias = LIGHTING.shadowNormalBias;

    // A single cascade kept tight around the subject so texels stay dense
    // where they are actually read. It follows the rider from M3.
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -LIGHTING.shadowRadius;
    shadowCamera.right = LIGHTING.shadowRadius;
    shadowCamera.top = LIGHTING.shadowRadius;
    shadowCamera.bottom = -LIGHTING.shadowRadius;
    shadowCamera.near = 1;
    shadowCamera.far = LIGHTING.sunDistance * 2;
    shadowCamera.updateProjectionMatrix();

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Dust dissolves into the air, so it fades toward the same horizon colour
    // the fog uses — a particle that ends by becoming the air it is in never
    // shows a hard edge as it dies. A spark does not dissolve; it cools and
    // goes out, so it has its own target.
    this.sparks = createParticleField({
      name: 'fx-sparks',
      capacity: FX.sparkCount,
      size: FX.sparkSize,
      gravity: FX.sparkGravity,
      fadeTo: FX.sparkFadeColour,
    });
    this.dust = createParticleField({
      name: 'fx-dust',
      capacity: FX.dustCount,
      size: FX.dustSize,
      gravity: FX.dustGravity,
      fadeTo: LIGHTING.horizonColour,
    });
    this.scene.add(this.sparks.points);
    this.scene.add(this.dust.points);

    this.ghost = createGhostRider();
    this.scene.add(this.ghost.group);
    this.cop = createCopRider();
    this.scene.add(this.cop.group);

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  /**
   * A pedal scraping the ground, at a world point.
   *
   * `depth` is the overlap past pedal clearance in radians; `side` is +1 for
   * the rider's left pedal. Sparks are thrown outward and back along the
   * ground rather than up, because that is where a scraped pedal actually
   * sends them and because upward sparks read as an explosion.
   *
   * Rate rather than count: the caller passes the step it is spending, so a
   * scrape lasting a tenth of a second and one lasting a second differ in how
   * much they throw rather than in whether they throw anything.
   *
   * `source` is which rider is scraping — the seat index (M25 Phase 2). It
   * addresses this rider's fractional remainder and nothing else: the pool,
   * the colour, the rate and the draw call are all still one thing.
   */
  emitSparks(
    source: number,
    x: number,
    y: number,
    z: number,
    depth: number,
    side: number,
    headingY: number,
    dt: number,
  ): void {
    const intensity = Math.min(1, depth / EUC_PEDAL_STRIKE_REFERENCE_DEPTH);
    if (intensity <= 0 || dt <= 0) return;
    const owed = (this.sparkDebt[source] ?? 0) + FX.sparkRatePerSecond * intensity * dt;
    const count = Math.floor(owed);
    this.sparkDebt[source] = owed - count;
    if (count <= 0) return;

    // Outward from the wheel on the scraping side and back along the travel,
    // in the rider's frame: +X is their left, +Z is forward.
    const outwardX = side * Math.cos(headingY);
    const outwardZ = side * -Math.sin(headingY);
    this.sparks.emit({
      x,
      y,
      z,
      count,
      speed: FX.sparkSpeed * (0.5 + 0.5 * intensity),
      spread: FX.sparkSpread,
      axisX: outwardX - Math.sin(headingY) * 0.6,
      axisY: 0.35,
      axisZ: outwardZ - Math.cos(headingY) * 0.6,
      lifeSeconds: FX.sparkLifeSeconds,
      colour: FX.sparkColour,
      intensity: FX.sparkIntensity,
    });
  }

  /**
   * What the tyre throws up on landing.
   *
   * The `particle` id comes from `data/surfaces.ts`, which has declared one
   * per surface since M4 marked the column "M5". A surface whose particle is
   * `none` throws nothing at all, which is what pavement should do.
   */
  emitLandingParticles(
    x: number,
    y: number,
    z: number,
    surface: SurfaceId,
    intensity: number,
  ): void {
    const properties = surfaceProperties(surface);
    const colour = PARTICLE_COLOURS[properties.particle];
    if (colour === undefined) return;
    const strength = Math.min(1, Math.max(0, intensity));
    const count = Math.round(FX.dustPerLanding * strength);
    if (count <= 0) return;
    this.dust.emit({
      x,
      y,
      z,
      count,
      speed: FX.dustSpeed * (0.4 + 0.6 * strength),
      // A hemisphere: the tyre displaces the surface outward in every
      // direction, not into a cone.
      spread: Math.PI * 0.5,
      axisX: 0,
      axisY: 1,
      axisZ: 0,
      lifeSeconds: FX.dustLifeSeconds,
      colour,
      // **Clippings settle back into the grass they came off.** Fading every
      // surface's dust toward the horizon makes a puff over dark grass get
      // brighter as it dies — the opposite of settling, and it reads as a pale
      // disc rather than as anything the wheel threw up.
      fadeTo: this.palette?.[properties.material]
        ?? materialAppearance(properties.material).albedo,
    });
  }

  /**
   * Spray thrown by a wheel crossing standing water — M13 Phase 2.
   *
   * **The one particle in the game emitted continuously rather than on an
   * event**, and the asymmetry is the design rather than an oversight. Every
   * other `ParticleId` is material lifted by an impact and settling back, so it
   * belongs to the landing that lifted it. A spill is a *place* (`DESIGN.md`
   * §6d): the rider is in it until they are out of it, and the spray is the
   * feedback that says which. That is the half of the spill's readability
   * problem the mesh family cannot solve, because a puddle has no relief to
   * give it.
   *
   * Driven off the surface table rather than off a hazard record, for the same
   * reason the ride response is: a spill reaches this layer as *ground*, and
   * `data/surfaces.ts` is what says which ground sprays. Any later surface that
   * wants continuous spray gets it by declaring `splash` and nothing else.
   *
   * Shares the dust pool, so `NON_LEVEL_RESERVE` does not move.
   *
   * `source` is which rider is riding through it — the seat index (M25 Phase
   * 2). It addresses only this rider's owed fraction, and it is the parameter
   * that keeps the "leaving the water clears the debt" rule below a statement
   * about *that* rider rather than about whoever called last.
   */
  emitSurfaceSpray(
    source: number,
    contact: boolean,
    x: number,
    y: number,
    z: number,
    surface: SurfaceId,
    speed: number,
    headingY: number,
    dt: number,
  ): void {
    // **Called on every step, including the ones that throw nothing**, because
    // the debt has to be cleared by leaving the water and a caller that simply
    // stopped calling would leave a fraction of a droplet owed across a jump.
    // `contact` is the caller's answer to "is the wheel on this surface" — the
    // renderer must not derive it, because that is a gameplay question
    // (invariant 3).
    const properties = surfaceProperties(surface);
    if (!contact || properties.particle !== 'splash' || dt <= 0) {
      this.splashDebt[source] = 0;
      return;
    }
    const colour = PARTICLE_COLOURS[properties.particle];
    if (colour === undefined) return;

    const strength = Math.min(1, Math.abs(speed) / FX.splashReferenceSpeed);
    // A stopped wheel sits in water without disturbing it, which is also what
    // keeps a crashed rider from spraying forever where they came off.
    if (strength <= 0) {
      this.splashDebt[source] = 0;
      return;
    }

    const owed = (this.splashDebt[source] ?? 0) + FX.splashRatePerSecond * strength * dt;
    const count = Math.floor(owed);
    this.splashDebt[source] = owed - count;
    if (count <= 0) return;

    // Up and *back* along the travel, which is where a tyre actually throws
    // water and what keeps the sheet behind the rider instead of in front of
    // the camera. +Z is forward, so the backward axis is the negated heading.
    this.dust.emit({
      x,
      y,
      z,
      count,
      speed: FX.splashSpeed * (0.35 + 0.65 * strength),
      spread: FX.splashSpread,
      axisX: -Math.sin(headingY) * 0.5,
      axisY: 1,
      axisZ: -Math.cos(headingY) * 0.5,
      lifeSeconds: FX.splashLifeSeconds,
      colour,
      fadeTo: FX.splashFadeColour,
    });
  }

  /**
   * Advance both fields. Called from the fixed step, not the render frame, so
   * `advance(n)` reaches the same field every run.
   */
  stepParticles(dt: number): void {
    this.sparks.step(dt);
    this.dust.step(dt);
  }

  /**
   * Forget what one emitter was owed — M25 Phase 2.
   *
   * A remainder belongs to the *rider* who accrued it, so a rider who leaves
   * takes theirs with them. Without this the next rider seated at the same
   * index would inherit up to one droplet and one spark of somebody else's
   * scrape: bounded and invisible, and still a resource with no disposal path,
   * which is the half of invariant 10 that is about discipline rather than
   * about memory.
   */
  forgetEmitter(source: number): void {
    this.sparkDebt[source] = 0;
    this.splashDebt[source] = 0;
  }

  /** Kill every particle. A reset must not leave sparks hanging in the air. */
  clearParticles(): void {
    this.sparks.clear();
    this.dust.clear();
    // Every emitter's owed fraction, not seat 0's: this clears the *pool*, and
    // a remainder left behind by a rider whose particles have just been thrown
    // away is a droplet owed for a scrape that no longer happened.
    this.sparkDebt.fill(0);
    this.splashDebt.fill(0);
  }

  /** How many particles are alive, for the QA bridge and the overlay. */
  particleCounts(): { sparks: number; dust: number } {
    return { sparks: this.sparks.live, dust: this.dust.live };
  }

  /**
   * Build the world from a plan. One level at a time; a second call disposes
   * the first, so a restart cannot leave the old terrain in the scene.
   *
   * The renderer takes a plan and returns nothing. It answers no gameplay
   * question about what it built (invariant 3) — `simulation/planSampler.ts`
   * reads the same plan for that, and neither consumer can see the other.
   */
  setLevel(plan: LevelPlan): TerrainView {
    this.terrain?.dispose();
    this.palette = plan.palette;
    const terrain = createTerrain(plan);
    this.terrain = terrain;
    this.scene.add(terrain.group);

    // The gates are part of the level and are rebuilt with it. `plan.checkpoints`
    // is an empty array on the proving ground and on every test fixture, and
    // `createCheckpointGates` treats that as "no gates" rather than as an
    // error — no geometry, no material, no mesh, nothing to dispose.
    this.gates?.dispose();
    const gates = createCheckpointGates(plan.checkpoints);
    this.gates = gates;
    this.scene.add(gates.group);
    // Restore whatever the challenge last asked for, so a rebuild in the
    // middle of a run does not hide the markers or forget which one is next.
    gates.setProgress(this.nextCheckpointIndex);
    gates.setVisible(this.checkpointsVisible);

    // The targets, on exactly the same terms — including the empty case, which
    // is every world but a generated one under §13 q12.
    this.targets?.dispose();
    const targets = createTargets(plan.targets ?? []);
    this.targets = targets;
    this.scene.add(targets.group);
    targets.setReducedMotion(this.targetsReducedMotion);
    // Restore the run's own state onto the new family. A rebuild mid-run must
    // not stand a struck target back up; the ids survive because they are the
    // plan's, and a rebuild of the *same* plan carries the same ones.
    for (const id of this.struckTargets) targets.strike(id);

    return terrain;
  }

  // ---------------------------------------------------------------------------
  // The challenge's two visual systems (M10)
  //
  // Both live behind this file for the reason in the file comment: a
  // translucent rider and an unlit emissive marker are members of the coupled
  // visual system, and the frame has one owner. `app/Game.ts` supplies state
  // and reads nothing back.
  // ---------------------------------------------------------------------------

  /**
   * Show or hide every checkpoint marker.
   *
   * **False in free ride, and hidden rather than faded.** Hidden costs exactly
   * zero draw calls, which is what free ride — the mode the owner's
   * five-minute no-objective test is judged in — should pay for a system it is
   * not using.
   */
  setCheckpointsVisible(visible: boolean): void {
    this.checkpointsVisible = visible;
    this.gates?.setVisible(visible);
  }

  /**
   * Which `routeIndex` the run is seeking; lower indices read as passed.
   * `-1` for none, which is what an unarmed or abandoned run reports.
   */
  setCheckpointProgress(nextRouteIndex: number): void {
    this.nextCheckpointIndex = nextRouteIndex;
    this.gates?.setProgress(nextRouteIndex);
  }

  /** Flare the gate just crossed. Called from the fixed step. */
  flareCheckpoint(routeIndex: number): void {
    this.gates?.flare(routeIndex);
  }

  /** Knock a target down — M14. Called from the fixed step, on a landed hit. */
  strikeTarget(id: string): void {
    this.struckTargets.add(id);
    this.targets?.strike(id);
  }

  /** Stand every target back up. A new run on the same world, never a reload. */
  resetTargets(): void {
    this.struckTargets.clear();
    this.targets?.reset();
  }

  /**
   * Suppress the knock-down, leaving the brightness step to carry the signal.
   *
   * `prefers-reduced-motion` is a CSS media query and the knock-down is WebGL,
   * so nothing about the preference reaches the family on its own — this is the
   * only path, and `app/Game.ts` drives it from the options store.
   */
  setTargetsReducedMotion(reduced: boolean): void {
    this.targetsReducedMotion = reduced;
    this.targets?.setReducedMotion(reduced);
  }

  /** Advance the knock-downs on the simulation clock, beside the gate flares. */
  stepTargets(stepSeconds: number): void {
    this.targets?.step(stepSeconds);
  }

  /**
   * Advance the gate flares on the simulation clock. Called from the fixed
   * step, alongside `stepParticles`, so `advance(n)` reaches the same frame
   * every run.
   */
  stepCheckpoints(stepSeconds: number): void {
    this.gates?.step(stepSeconds);
  }

  /**
   * Rebuild the ghost as this rider (M14.5).
   *
   * Guarded on the current character rather than trusting the caller, because
   * the caller is `applyOptions`, which is re-entered whenever any option
   * changes — and an unguarded rebuild would dispose and re-upload two dozen
   * geometries every time the player moved a volume slider.
   *
   * Visibility is carried across: a swap can land mid-run with the ghost on
   * course, and a ghost that vanished because the player changed rider would
   * be a lost racing reference with no explanation.
   */
  setCharacter(character: CharacterId): void {
    if (character === this.ghostCharacter) return;
    this.ghostCharacter = character;
    const visible = this.ghost.visible;
    this.scene.remove(this.ghost.group);
    this.ghost.dispose();
    this.ghost = createGhostRider(riderLook(character), machineLook(machineForCharacter(character)));
    this.ghost.setVisible(visible);
    this.scene.add(this.ghost.group);
    // The cop is deliberately untouched: he is not a rider the player chose,
    // so a rider swap has nothing to say about him.
  }

  /**
   * Put one rider — or nobody — in the second-rider slot.
   *
   * The single writer, so "the ghost is up" and "the cop is up" cannot both be
   * true however the callers are reordered. See `secondRider`.
   */
  setSecondRider(who: 'none' | 'ghost' | 'cop'): void {
    if (who === this.secondRider) return;
    this.secondRider = who;
    this.ghost.setVisible(who === 'ghost');
    this.cop.setVisible(who === 'cop');
  }

  /** Which second rider is on screen. For the QA bridge and the budget. */
  get secondRiderShown(): 'none' | 'ghost' | 'cop' {
    return this.secondRider;
  }

  /**
   * Show or hide the ghost. False when there is no record or no run.
   *
   * **"Hide me" only hides *me*.** `Game.updateGhost` calls this with false on
   * every frame that is not a timed run against a record — which is almost
   * every frame in the game — so a version that cleared the slot outright would
   * evict the cop from it sixty times a second, and a chase would draw a cop
   * for exactly one frame after each of its own render passes.
   */
  setGhostVisible(visible: boolean): void {
    if (visible) this.setSecondRider('ghost');
    else if (this.secondRider === 'ghost') this.setSecondRider('none');
  }

  /** Show or hide the cop — M18. Hides the ghost by construction, and vice versa. */
  setCopVisible(visible: boolean): void {
    if (visible) this.setSecondRider('cop');
    else if (this.secondRider === 'cop') this.setSecondRider('none');
  }

  /**
   * Pose the cop from a controller pose and aim his paddle — M18.
   *
   * Called from the render frame with an *interpolated* pose, exactly as the
   * player's rig is: he is a live rider stepped at the fixed rate, so drawing
   * him at the stepped pose would leave him juddering beside a smooth player.
   */
  applyCop(pose: EucPose, head: THREE.Vector3 | null, angle: number, blend: number): void {
    this.cop.applySwing(head, angle, blend);
    this.cop.apply(pose);
  }

  /**
   * Place the ghost from one interpolated sample. Called from the render
   * frame, because the sample the caller holds is already interpolated.
   */
  applyGhost(sample: GhostSample): void {
    this.ghost.apply(sample);
  }

  /**
   * What the challenge's two systems cost while they are showing, for the
   * budget and the QA bridge. Draw calls and triangles are reportable; a frame
   * interval is not (`AGENTS.md`).
   */
  challengeCosts(): {
    gateDrawCalls: number;
    gateTriangles: number;
    ghostDrawCalls: number;
    ghostTriangles: number;
    copDrawCalls: number;
    copTriangles: number;
  } {
    return {
      gateDrawCalls: this.gates?.visible === true ? this.gates.drawCalls : 0,
      gateTriangles: this.gates?.visible === true ? this.gates.triangles : 0,
      ghostDrawCalls: this.ghost.visible ? this.ghost.drawCalls : 0,
      ghostTriangles: this.ghost.visible ? this.ghost.triangles : 0,
      // Colour and shadow together, because that is what the frame is charged
      // and what `NON_LEVEL_RESERVE` reserves.
      copDrawCalls: this.cop.visible ? this.cop.drawCalls + this.cop.shadowDrawCalls : 0,
      copTriangles: this.cop.visible ? this.cop.triangles : 0,
    };
  }

  /** Register the game-level reaction to a context loss. One consumer. */
  setContextLossCallbacks(callbacks: ContextLossCallbacks): void {
    this.contextCallbacks = callbacks;
  }

  private readonly onContextLost = (event: Event): void => {
    // three's own listener also prevents the default; doing it here as well
    // keeps the restore path alive even if listener ordering ever changes —
    // without preventDefault the browser never fires `webglcontextrestored`.
    event.preventDefault();
    this.contextCallbacks?.onLost();
  };

  private readonly onContextRestored = (): void => {
    this.contextCallbacks?.onRestored();
  };

  /**
   * Idempotent and cheap enough to call every frame — which is how it is
   * called, deliberately.
   *
   * A canvas that is hidden, or simply not laid out yet, measures zero. A
   * resize that runs at that moment and then never runs again leaves the
   * renderer stuck at its 300x150 default, and the symptom is a stretched or
   * blank view with nothing in the console. Ignoring the zero measurement is
   * only half the fix; the other half is measuring again until it succeeds
   * (master starter 9.1). Polling from the frame loop covers that, plus
   * container changes and pixel-ratio changes, without a listener for each.
   *
   * Reports whether the CSS-pixel layout actually changed, so callers can
   * distinguish a real viewport change — which must invalidate cached control
   * geometry and release in-flight gestures — from a pixel-ratio-only change,
   * which must not (master starter 8.6, 8.7).
   */
  resize(): ViewportChange {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, this.maxPixelRatio);

    if (width === 0 || height === 0) {
      return { layoutChanged: false, width: this.lastWidth, height: this.lastHeight };
    }

    const layoutChanged = width !== this.lastWidth || height !== this.lastHeight;
    const pixelRatioChanged = pixelRatio !== this.lastPixelRatio;
    if (!layoutChanged && !pixelRatioChanged) {
      return { layoutChanged: false, width, height };
    }

    this.lastWidth = width;
    this.lastHeight = height;
    this.lastPixelRatio = pixelRatio;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    // Only a real layout change alters the projection. A pixel-ratio-only
    // change backs the same CSS box with more device pixels.
    if (layoutChanged) this.applyViewAspects();

    return { layoutChanged, width, height };
  }

  /**
   * The whole coupled visual system, set together.
   *
   * Exposure, key light, and fill are one system with one owner (invariant 6),
   * and this file is that owner. The tuning panel changes them through here
   * rather than reaching into the lights, so there is exactly one place where
   * "what does the rig currently look like" is answered — and so a future
   * change to any one of them cannot be made in ignorance of the other two.
   */
  applyLighting(values: {
    exposure?: number;
    sunIntensity?: number;
    hemisphereIntensity?: number;
  }): void {
    if (values.exposure !== undefined) this.renderer.toneMappingExposure = values.exposure;
    if (values.sunIntensity !== undefined) this.sun.intensity = values.sunIntensity;
    if (values.hemisphereIntensity !== undefined) {
      this.hemisphere.intensity = values.hemisphereIntensity;
    }
  }

  /**
   * Move the single shadow cascade to sit over a world point.
   *
   * The budget allows one 2048 map, so its orthographic extent is kept tight
   * (`LIGHTING.shadowRadius`) to keep texels dense where they are actually
   * read. Tight and stationary means the rider rides out of their own shadow
   * within a couple of seconds — the contact shadow simply stops being drawn,
   * with nothing in the console to say so. Moving the light and its target
   * together keeps the sun's *direction* fixed, so the lighting rig is
   * unchanged; only the region it can cast into moves.
   */
  setShadowFocus(x: number, y: number, z: number): void {
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + this.sunOffset.x, y + this.sunOffset.y, z + this.sunOffset.z);
  }

  /**
   * Vertical field of view for one view, in radians. Driven by speed from M3;
   * addressed per view since M25 Phase 3.
   *
   * **The early-out is per camera and that is the whole reason this is not a
   * loop.** It compares against the camera it is about to write; a single
   * shared guard would skip the second view for exactly as long as the two
   * riders happened to be going the same speed, which is most of a couch ride
   * and all of the first second of one.
   */
  setFieldOfView(view: number, radians: number): void {
    const camera = this.cameraFor(view);
    const degrees = THREE.MathUtils.radToDeg(this.splitFieldOfView(radians));
    if (camera.fov === degrees) return;
    camera.fov = degrees;
    camera.updateProjectionMatrix();
  }

  /**
   * How wide the split's vertical field of view should be — M25 Phase 3
   * (docs/PLANS.md §25.5, "the split projection must keep the road readable,
   * not just halve the aspect").
   *
   * A vertical split halves each view's aspect, and a perspective camera's
   * *horizontal* angle is derived from the vertical one through it. So halving
   * the aspect and changing nothing else does not give each player half the
   * view — it gives them a keyhole. On a 1920x1080 window the numbers are
   * exact: horizontal falls from 96.8 degrees to 58.8, and 38 degrees of the
   * road either side of the rider simply stop existing.
   *
   * **Preserving the horizontal angle exactly is not available.** It needs a
   * vertical angle of 103 degrees at rest and 116 at speed, against a tuning
   * table whose header calls motion sickness a hard constraint rather than a
   * preference. And a bare cap is worse than it looks: applied to both ends of
   * the speed ease it clamps both, which would delete the strongest speed cue
   * in the game exactly where two players are most likely to be racing.
   *
   * So: **gain, then cap.** The gain recovers most of the lost horizontal and
   * the cap keeps the widest frame inside what the same table already
   * tolerates, while leaving enough travel between the two ends for the ease
   * to survive. Both numbers are F4-tunable through `setSplitFieldOfView`,
   * because §25.5 gives the owner's own look the final say and a number he can
   * only report is a number he has to wait on.
   *
   * **The treatment is per frame *shape*, not per split — M27 Phase 1.** The
   * paragraphs above are an argument about a *half*, and every one of their
   * numbers comes from halving the aspect. A quadrant halves both axes, so it
   * keeps the canvas's own 16:9 and loses no horizontal angle at all; running
   * the gain on it would hand four players a wider view than one player gets,
   * which is a different game rather than the same one shared. So the gain is
   * the shape's own (`quadFovGain` ships near unity) and **the cap is one
   * number for both**, because the cap is a statement about how wide this
   * project will ever draw before the tuning table's first line starts
   * mattering, and that does not depend on how the screen is cut.
   */
  private splitFieldOfView(radians: number): number {
    const views = this.viewCameras.length;
    if (views < 2) return radians;
    const gain = paneGridFor(views).rows > 1 ? this.quadFovGain : this.splitFovGain;
    return Math.min(this.splitFovCap, radians * gain);
  }

  /**
   * The split's field-of-view widening, from the tuning table.
   *
   * `Game.applyTuning` pushes this the way it pushes the quality ceiling: the
   * store belongs to the app layer, and a renderer that read it would be a
   * second reader of a value the F4 panel can move underneath it.
   */
  setSplitFieldOfView(gain: number, capRadians: number, quadGain: number): void {
    if (
      gain === this.splitFovGain
      && capRadians === this.splitFovCap
      && quadGain === this.quadFovGain
    ) return;
    this.splitFovGain = gain;
    this.splitFovCap = capRadians;
    this.quadFovGain = quadGain;
    // The cameras are holding a previously widened angle; the next frame
    // rewrites them, but a paused game does not have a next frame.
    for (const camera of this.viewCameras) camera.updateProjectionMatrix();
  }

  /** How many views this frame draws, left to right. One, until asked. */
  get viewCount(): number {
    return this.viewCameras.length;
  }

  /**
   * Draw `count` views side by side from now on — M25 Phase 3.
   *
   * Called when a seat is added or removed, so the number of views and the
   * number of riders are the same number by construction rather than by two
   * places agreeing. Idempotent, so the caller does not have to know whether
   * it is already true.
   */
  setViewCount(count: number): void {
    const wanted = Math.max(1, Math.floor(count));
    if (wanted === this.viewCameras.length) return;
    while (this.viewCameras.length < wanted) {
      this.viewCameras.push(new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(CAMERA.fovAtRest),
        1,
        CAMERA.near,
        CAMERA.far,
      ));
    }
    // Never below one, and never the *first* camera: `this.camera` is the same
    // object and is public.
    this.viewCameras.length = wanted;
    this.applyViewAspects();
  }

  /** The camera for one view. Throws rather than drawing the wrong half. */
  cameraFor(view: number): THREE.PerspectiveCamera {
    const camera = this.viewCameras[view];
    if (camera === undefined) {
      throw new Error(`no such view: ${view} (views: ${this.viewCameras.length})`);
    }
    return camera;
  }

  /**
   * Where one view sits across the canvas, in whole CSS pixels.
   *
   * **The partition is by rounded boundaries, not by a divided width, and an
   * odd number of pixels is exactly why.** `width / views` on a 1001 px canvas
   * is 500.5, and two passes of 500.5 both floor to 500 — leaving the final
   * column drawn by nobody. It shows as a one-pixel stripe of untouched page
   * down the right edge of the game, which a Codex QA pass found on the day
   * this shipped: even widths were flawless and 1001x701 was not.
   *
   * Taking each edge as `round(width * view / views)` makes every boundary a
   * single number shared by the pane that ends there and the pane that starts
   * there, so the views tile the canvas exactly once with no gap and no
   * overlap, at any width and any view count. The panes are then not
   * necessarily equal — 1001 splits into 500 and 501 — which is why the
   * aspects below are taken from these same widths rather than from a halved
   * canvas.
   *
   * **The rule gained its second axis at M27 Phase 1 and did not otherwise
   * change.** Three or four seats are a 2x2 grid (four 480x1080 strips are
   * unusable), so the same rounded boundary is now taken on the height too and
   * the arithmetic moved to `shared/paneGrid.ts`, where a headless sweep can
   * check odd widths and odd heights together without a GPU. One and two views
   * come back exactly where they always did — full canvas, then vertical
   * halves at full height — which is what keeps Contract 2 a statement about
   * the frame the game still draws.
   *
   * `y` is measured **up from the bottom**, because that is the frame
   * `setViewport` and `setScissor` take. Panes are numbered in reading order,
   * so pane 0 is top-left and its `y` is the middle boundary rather than zero.
   */
  viewBounds(view: number): PaneRect {
    const views = this.viewCameras.length;
    if (view < 0 || view >= views) {
      throw new Error(`no such view: ${view} (views: ${views})`);
    }
    return paneBounds(this.lastWidth, this.lastHeight, paneGridFor(views), view);
  }

  /**
   * Where the pane nobody is sitting in would be — M27 Phase 1 (q95).
   *
   * A three-seat frame is a 2x2 grid with a hole, and the hole is the room's
   * shared scoreboard: DOM over a quadrant no pass draws. `Game` needs the box
   * to place that card, and it must be **the same arithmetic the passes use**
   * or the card would sit a pixel off the seam it is supposed to fill.
   *
   * Null whenever the grid is full or has no hole at all, which is every other
   * seat count — the caller asks rather than counting seats itself.
   */
  idleViewBounds(): PaneRect | null {
    const views = this.viewCameras.length;
    const grid = paneGridFor(views);
    const panes = grid.columns * grid.rows;
    if (views >= panes) return null;
    return paneBounds(this.lastWidth, this.lastHeight, grid, views);
  }

  /**
   * Give every view the aspect of its own pane.
   *
   * **Each view's aspect is its own pane's width over the height, not the
   * canvas's.** A camera left on the full-canvas aspect while drawing into
   * half of it stretches the world horizontally, which reads as the rider
   * being fatter rather than as the frame being wrong — the kind of defect
   * that survives a review and is obvious the moment somebody rides it.
   *
   * Read from `viewBounds`, so an odd canvas gives its two panes slightly
   * different aspects rather than one shared approximation. The alternative —
   * halving the canvas — would put both cameras half a pixel out on the wider
   * pane, which is invisible, and would be a second definition of where the
   * panes are, which is not.
   */
  private applyViewAspects(): void {
    if (this.lastWidth === 0 || this.lastHeight === 0) return;
    for (let view = 0; view < this.viewCameras.length; view += 1) {
      const camera = this.viewCameras[view];
      // The pane's own height too since M27 Phase 1 — a quadrant is half as
      // tall as the canvas, and a camera left on the canvas height while
      // drawing into a quadrant is the same stretch in the other direction.
      const pane = this.viewBounds(view);
      camera.aspect = pane.height === 0 ? 1 : pane.width / pane.height;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Change the device-pixel ceiling.
   *
   * Deliberately calls `resize()` and nothing else. Backing the same CSS box
   * with a different number of device pixels is not a viewport change
   * (master starter 8.7): routing it through the full viewport-change path
   * would also drop cached control geometry and release the in-flight gesture,
   * which is right after a rotation and catastrophic here — it would take the
   * controls out of the player's hands at exactly the moment the game decided
   * the frame was struggling.
   */
  setMaxPixelRatio(ratio: number): void {
    const clamped = Math.max(0.5, ratio);
    if (clamped === this.maxPixelRatio) return;
    this.maxPixelRatio = clamped;
    this.resize();
  }

  /**
   * The quality preset, from the M9 settings screen.
   *
   * **Two levers, and neither is a re-grade.** Resolution and shadow detail
   * are the two things on this frame that cost real time on integrated
   * graphics and that a player can trade away without the game looking like a
   * different game. Exposure, tone mapping, light intensities, fog, and
   * particle brightness are deliberately untouched: they are one coupled
   * system with one owner (invariant 6), and a quality preset that dimmed the
   * sun would be a second owner changing the look behind the first one's back.
   *
   * Owned by this file for the same reason `applyLighting` is — it is the
   * renderer's business how much effort a frame costs. `app/Game.ts` passes a
   * word and the ceiling from the tuning table, and learns nothing about
   * shadow maps.
   *
   * `castShadow` is toggled rather than `shadowMap.enabled`, because three
   * keys its programs on the number of shadow-casting lights and so
   * recompiles by itself; flipping the renderer-wide flag needs every material
   * marked dirty by hand, and a missed one renders black.
   */
  setQuality(level: 'low' | 'medium' | 'high', maxPixelRatio: number): void {
    const shadows = level !== 'low';
    if (this.sun.castShadow !== shadows) this.sun.castShadow = shadows;

    const mapSize = level === 'high' ? LIGHTING.shadowMapSize : LIGHTING.shadowMapSize / 2;
    if (shadows && this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.setScalar(mapSize);
      // three allocates the depth target from `mapSize` once and then reuses
      // it. Without disposing it here the new size is ignored for the life of
      // the page, and the setting appears to do nothing.
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }

    const ceiling = level === 'high' ? maxPixelRatio : level === 'medium' ? 1.5 : 1;
    this.setMaxPixelRatio(Math.min(maxPixelRatio, ceiling));
  }

  /** Current drawing-surface state, for the QA bridge and the overlay. */
  viewport(): { width: number; height: number; pixelRatio: number } {
    return {
      width: this.lastWidth,
      height: this.lastHeight,
      pixelRatio: this.lastPixelRatio,
    };
  }

  /**
   * Start a frame: reset the counters, and clear the canvas exactly once.
   *
   * **Once, whatever the view count**, which is why `autoClear` is off (see
   * the constructor). Clearing per pass would erase the half drawn before it;
   * clearing inside the scissor box would work and would still be two clears
   * for one canvas.
   */
  beginFrame(): void {
    this.renderer.info.reset();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.lastWidth, this.lastHeight);
    this.renderer.clear();
  }

  /**
   * Draw one view into its own half of the canvas — M25 Phase 3.
   *
   * The caller sets whatever is per-pass *before* calling: this view's camera
   * transform, the shadow cascade's focus, and the surround plane's centre.
   * Each half is its own rider's window on the world, and all three of those
   * are singular objects that have to be moved between the passes rather than
   * duplicated — one directional light, one depth target, one backstop mesh.
   *
   * **Viewport and scissor are set every pass, every frame, on purpose.**
   * `WebGLRenderer.setSize` ends by resetting the viewport to the full canvas,
   * and `resize()` is polled once per frame — so state set once at a split
   * would be silently undone by the next pixel-ratio change or container
   * resize, and the symptom would be one rider drawn across both halves.
   *
   * Arguments to `setViewport`/`setScissor` are in CSS pixels; three applies
   * the device-pixel ratio itself.
   */
  renderView(view: number): void {
    // The armed quad probe takes over the frame — M27 Phase 0. `Game` still
    // believes the session is single-view (one seat, one camera, unsplit HUD,
    // ungained FOV — `splitFieldOfView` sees one view camera and stays out)
    // and calls this exactly once per frame with the shadow focus and the
    // surround centre already pointed at the ridden rider; the probe answers
    // with the four quadrant passes instead of the one full-canvas pass.
    if (this.perfProbe !== null && this.viewCameras.length === 1) {
      this.renderPerfQuadFrame(this.perfProbe);
      return;
    }
    const camera = this.cameraFor(view);
    if (this.viewCameras.length === 1) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.lastWidth, this.lastHeight);
    } else {
      // Whole pixels from `viewBounds`, which tiles the canvas exactly once —
      // on both axes since M27 Phase 1, so a quadrant's own y and height come
      // from the same partition rather than from a second opinion here.
      const pane = this.viewBounds(view);
      this.renderer.setViewport(pane.x, pane.y, pane.width, pane.height);
      // Without the scissor, a pass would draw its sky and its fog across the
      // whole canvas and only the depth-tested geometry would stay in its
      // half.
      this.renderer.setScissor(pane.x, pane.y, pane.width, pane.height);
      this.renderer.setScissorTest(true);
    }
    this.renderer.render(this.scene, camera);
  }

  /**
   * A whole frame from the state already set.
   *
   * `Game` does not use this — it has to move the shadow focus and the
   * surround plane between passes, so it drives `beginFrame` and `renderView`
   * itself. This is for the callers that just want a frame on the canvas: the
   * four browser specs that force a redraw, and anything that follows them.
   */
  render(): void {
    this.beginFrame();
    for (let view = 0; view < this.viewCameras.length; view += 1) this.renderView(view);
  }

  // -------------------------------------------------------------------------
  // The M27 Phase 0 quad probe — see the `perfProbe` field for what it is for
  // -------------------------------------------------------------------------

  /**
   * Arm the probe: plant three rigs beside `at` and draw every frame from now
   * on as a 2×2 quadrant grid, until `clearPerfQuadProbe`.
   *
   * Planting again re-plants — `tools/perf-window.js` offers that as a button
   * so the owner can carry the grid to whatever corner of a world he wants to
   * measure. The rigs stand at `at.y` because the probe plants them beside a
   * rider who is on the ground there; the renderer cannot ask the ground
   * itself (`TerrainSampler` is the simulation's, invariant 3), and an
   * instrument does not need it to.
   */
  plantPerfQuadProbe(at: { x: number; y: number; z: number }, headingY: number): void {
    if (this.viewCameras.length !== 1) {
      throw new Error('the quad probe is a solo instrument; a couch split is active');
    }
    this.clearPerfQuadProbe();

    // Three distinct playables, none of them the ridden character, so the
    // scene holds four different riders and four different machines — the
    // frame the four-seat measurement is about (q68's spirit). The ridden
    // character is `ghostCharacter`: `setCharacter` stores it for the ghost's
    // sake and it is the one place the renderer knows who is riding.
    const looks = PLAYABLE_RIDER_LOOKS
      .filter((look) => look.id !== this.ghostCharacter)
      .slice(0, 3);
    const sin = Math.sin(headingY);
    const cos = Math.cos(headingY);
    // Offsets in the rider's frame (+X their left, +Z forward): a loose grid
    // beside and behind, near enough that pane 0's surround centre and shadow
    // neighbourhood cover everyone, far enough apart to read as four riders.
    const offsets = [
      { x: 2.2, z: 0 },
      { x: -2.2, z: -1.6 },
      { x: 0.4, z: -3.2 },
    ];

    const probe: PerfQuadProbe = { rigs: [], cameras: [] };
    for (const [index, look] of looks.entries()) {
      const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
      // Not 'riding-rig': `tools/rider-views.mjs` finds the player's rig by
      // that name and relies on it being unique in the scene.
      rig.group.name = `perf-probe-rig-${index}`;
      const offset = offsets[index];
      const x = at.x + offset.x * cos + offset.z * sin;
      const z = at.z - offset.x * sin + offset.z * cos;
      // From `createPose()`, never a bare literal — it seeds `recoverBlend`
      // to 1, and a pose built from zeros is a faded ghost of a rider.
      // `restFactor` 1 is the one-foot-down stand, so a planted rig reads as
      // parked rather than as frozen mid-ride.
      const pose = createPose();
      pose.x = x;
      pose.y = at.y;
      pose.z = z;
      pose.groundY = at.y;
      pose.headingY = headingY;
      pose.restFactor = 1;
      rig.apply(pose);
      this.scene.add(rig.group);
      probe.rigs.push({ rig, at: { x, y: at.y, z } });

      // A chase-style frame on the planted rig: the spring arm's rest length
      // and height, looking at the chest — hip height plus
      // `CAMERA.targetHeightOffset`, the 1.27 m the tuning table's own note
      // derives. Static, because the subject is; nothing else writes these
      // cameras (`setFieldOfView` and `applyViewAspects` walk `viewCameras`,
      // which the probe deliberately never touches).
      const camera = new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(CAMERA.fovAtRest),
        1,
        CAMERA.near,
        CAMERA.far,
      );
      camera.position.set(
        x - sin * CAMERA.distanceAtRest,
        at.y + CAMERA.armHeight,
        z - cos * CAMERA.distanceAtRest,
      );
      camera.lookAt(x, at.y + 1.27, z);
      probe.cameras.push(camera);
    }
    this.perfProbe = probe;
  }

  /** Disarm: give the rigs back, and the game camera its full-canvas aspect. */
  clearPerfQuadProbe(): void {
    if (this.perfProbe === null) return;
    for (const planted of this.perfProbe.rigs) {
      // Remove before disposing — the plateau rule (`Game.despawnSecondRider`
      // records why): `RidingRig.dispose` self-detaches, and the explicit
      // removal is the rule rather than the call.
      this.scene.remove(planted.rig.group);
      planted.rig.dispose();
    }
    this.perfProbe = null;
    this.applyViewAspects();
  }

  /** Whether the probe is armed. The self-test's question, answered plainly. */
  get perfQuadArmed(): boolean {
    return this.perfProbe !== null;
  }

  /**
   * Where one probe pane sits, in CSS pixels with WebGL's bottom-left origin.
   *
   * Rounded boundaries on **both** axes, for the reason `viewBounds` records
   * on one: `round(size * n / 2)` makes every edge a single number shared by
   * the pane that ends there and the pane that starts there, so the four
   * panes tile the canvas exactly once at any width and any height, odd ones
   * included. Panes 0|1 are the top row, 2|3 the bottom.
   *
   * **It is `viewBounds`' arithmetic, not a copy of it, since M27 Phase 1.**
   * The probe measured a four-pass frame a milestone before any seat could ask
   * for one, so it had to own the grid itself; now the real partition draws
   * the same grid, and two functions rounding the same edges independently is
   * exactly how a probe ends up measuring a frame the game does not draw.
   */
  perfQuadBounds(pane: number): PaneRect {
    if (this.perfProbe === null) throw new Error('the quad probe is not armed');
    if (!Number.isInteger(pane) || pane < 0 || pane > 3) {
      throw new Error(`no such probe pane: ${pane} (panes: 4)`);
    }
    return paneBounds(this.lastWidth, this.lastHeight, paneGridFor(4), pane);
  }

  /**
   * The four passes. Pane 0 is the ridden rider through the game's own camera,
   * with the shadow focus and surround centre the caller already pointed at
   * them; panes 1–3 each move the shadow focus to their planted rig first,
   * exactly as `Game.render` moves it between real seat passes — the surround
   * plane stays centred on the ridden rider, whom the rigs stand beside by
   * construction. The focus is left on the last rig at frame end and the next
   * frame's caller re-points it, the same hand-back the real split performs.
   */
  private renderPerfQuadFrame(probe: PerfQuadProbe): void {
    for (let pane = 0; pane < 4; pane += 1) {
      const rect = this.perfQuadBounds(pane);
      let camera: THREE.PerspectiveCamera;
      if (pane === 0) {
        camera = this.camera;
      } else {
        const planted = probe.rigs[pane - 1];
        this.setShadowFocus(planted.at.x, planted.at.y, planted.at.z);
        camera = probe.cameras[pane - 1];
      }
      // Each pane's aspect is its own rect's — a quadrant of an even canvas is
      // the canvas's own 16:9, which is §27.2's whole geometric argument, and
      // an odd canvas gives its four panes their honest slightly-different
      // answers. Pane 0 writes the game camera and `applyViewAspects` writes
      // it back on the next layout change; the next probe frame re-asserts.
      const aspect = rect.height === 0 ? 1 : rect.width / rect.height;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      this.renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
      this.renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, camera);
    }
  }

  dispose(): void {
    this.clearPerfQuadProbe();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.terrain?.dispose();
    this.terrain = null;
    this.gates?.dispose();
    this.gates = null;
    this.targets?.dispose();
    this.targets = null;
    this.ghost.dispose();
    this.cop.dispose();
    this.scene.background = null;
    this.sky.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    this.sun.shadow.dispose();
    this.sun.dispose();
    this.hemisphere.dispose();
    this.renderer.dispose();
  }
}
