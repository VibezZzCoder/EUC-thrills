/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { PADDLE, SIMULATION } from '../data/tuning.ts';

/**
 * The paddle: a swing state machine and one swept hit query — M14.
 *
 * **Nothing in this file knows what a target is, what a score is, or who is
 * holding the paddle.** That is the milestone's one architectural constraint and
 * it is load-bearing rather than tidy: the owner's chase-mode direction makes the
 * third playable character a cop wielding this same weapon at *riders*
 * (`docs/PLANS.md` §10, "Amendments 2026-08-11"). So the state machine keys off
 * a `swing` request rather than off "the Knockabout player", the hit query takes
 * a **set of hittable spheres** rather than a level's targets, and the mode
 * decides who carries one. Target discs implement `HittableSet` today
 * (`simulation/targets.ts`); the chase's one-rider set implements the same
 * interface. The optional swing side is also wielder-agnostic: the player keeps
 * M14's authored right forehand while the cop may request its mirrored path.
 *
 * It holds no world of its own and imports nothing but the tuning table.
 * Nothing here may import three.js — AGENTS.md invariant 1.
 *
 * ## Why the hit is a swept segment and not a point
 *
 * The head is sampled once per fixed step, and at the shipped constants it moves
 * up to about 0.40 m between two samples — its own arc speed
 * (`reach · sweepRadians / activeSeconds`) plus the rider's translation at top
 * speed. That is **wider than the largest disc the mode places**, so a point
 * test would not merely drop grazing hits: it could miss a *dead-centre* one,
 * with the head sampled a hand's breadth before the disc and a hand's breadth
 * after it. Every test written against the target's centre would pass and the
 * player would experience the game as broken.
 *
 * A closed-form squared distance from the sphere's centre to the segment costs
 * about six more floating-point operations and removes the class entirely. The
 * per-step *sagitta* — how far the true arc bows away from the chord the segment
 * approximates — is `reach · (1 − cos(Δθ/2))`, about four millimetres here, so
 * no sub-stepping and no arc integration are needed. `paddle.test.ts` derives
 * both of those numbers from the constants rather than restating them, so
 * shortening the strike window or raising the top speed fails loudly instead of
 * quietly making the approximation wrong.
 *
 * ## The teleport guard, which is the part that ships broken if it is guessed
 *
 * The previous head position has to be thrown away on every teleport, or the
 * first sweep afterwards is a spear through everything on the line between where
 * the rider was and where they now are — a silent scoring exploit that no
 * forward-riding test can find. There are **four** teleport sources in this game
 * and only one of them is a player action: the manual reset, the challenge
 * run-up reset, the **automatic crash respawn**, and the world swap at the end
 * of `installLevel`.
 *
 * A `teleported` flag handed in from outside is not sufficient, for two separate
 * reasons. `EucController.respawn()` is private and fires on a timer at
 * `crashRecoverAutoSeconds` with no signal out, so the composition root cannot
 * see the commonest teleport in the game; and `Game.step` returns early on a
 * reset step, so a flag raised there is handed to a step that never runs. **The
 * primary defence is therefore unconditional and lives here**: any step longer
 * than a swing could legitimately produce is not a swing, and reseeds instead of
 * querying. `reseed()` is the belt-and-braces half, called from the teleports
 * that *are* visible.
 */

/**
 * Something a paddle head can hit: a sphere with a name.
 *
 * Deliberately the poorest description that is sufficient. A target's stand, its
 * arm, its render geometry and its score are all somebody else's business; what
 * a swing needs to know is where the hittable volume is and how big it is.
 */
export interface HittableVolume {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * A world's live hittable volumes, indexed for a swept query.
 *
 * The one thing `Paddle` asks of whatever it is swinging at. Implementations
 * decide what "live" means — `TargetField` drops targets already struck; a rider
 * set would drop riders already down.
 */
export interface HittableSet {
  /**
   * Visit every live volume whose own bounds overlap this box.
   *
   * The box is the swept segment's bounds already grown by the head's radius, so
   * an implementation compares it against each volume's bounds grown by that
   * volume's radius. Each volume is visited **at most once** however many cells
   * of an internal grid it occupies, and in a stable order, because a duplicate
   * visit would score one target twice and an unstable order would make
   * `advance(n)` non-reproducible.
   */
  eachNear(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    visit: (volume: HittableVolume) => void,
  ): void;
}

/**
 * Where a swing is in its cycle.
 *
 * `active` is the only phase that can strike, and a miss costs the whole cycle —
 * which is what makes the swing something the player times rather than mashes.
 */
export type SwingPhase = 'idle' | 'windup' | 'active' | 'recover';

/**
 * Which side the strike travels through.
 *
 * The ordinary player swing remains the right-side forehand. A CPU wielder may
 * choose the mirrored left-side path when its quarry is on that side; the
 * choice is latched when the request is accepted so an actor crossing the nose
 * cannot reverse a swing that is already under way.
 */
export type SwingSide = 'right' | 'left';

/** A wielder, as far as a paddle is concerned. */
export interface WielderPose {
  /** The contact patch — the point every other system already measures from. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * The **clean** heading, radians about +Y. Never `headingY + wobbleYaw`.
   *
   * The wobble yaw lives on the machine child and the clean heading on the root,
   * deliberately and by M13's own visual-ownership rule. A hit test run on the
   * wobbled heading would disagree with the drawn paddle *exactly when the player
   * is wobbling*, which is the worst possible moment for the two to part company
   * and the hardest case to catch in a screenshot.
   */
  readonly headingY: number;
}

/** One landed hit, in the order the sweep reached them. */
export interface PaddleHit {
  readonly id: string;
  /** Where along the swept segment it landed, 0 at the previous head position. */
  readonly t: number;
}

const NO_HITS: readonly PaddleHit[] = Object.freeze([]);

/** Smooth in and out. Used either side of the strike window, never inside it. */
function smoothstep(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

export class Paddle {
  // -- Live tuning. Seeded from the frozen defaults, replaced by F4 ----------
  //
  // Mutable fields rather than reads through the tuning table, on the pattern
  // every other simulation object uses: `Game.applyTuning` writes them, and a
  // world swap constructs a fresh object and replays the same writes.
  // Annotated `: number` rather than inferred: the tuning table is `as const`,
  // so an inferred field would take the *literal* type of today's default and
  // refuse every value F4 could write into it.
  reach: number = PADDLE.reach;
  headRadius: number = PADDLE.headRadius;
  pivotHeight: number = PADDLE.pivotHeight;
  pivotOffset: number = PADDLE.pivotOffset;
  windupSeconds: number = PADDLE.windupSeconds;
  activeSeconds: number = PADDLE.activeSeconds;
  recoverSeconds: number = PADDLE.recoverSeconds;
  startAngle: number = PADDLE.startAngle;
  sweepRadians: number = PADDLE.sweepRadians;
  maxStepSweep: number = PADDLE.maxStepSweep;

  private phaseValue: SwingPhase = 'idle';
  /** Side latched when an idle paddle accepts a swing request. */
  private swingSideValue: SwingSide = 'right';
  /** Seconds spent in the current phase. */
  private elapsed = 0;
  /**
   * Was the head inside the strike arc at any point during this step?
   *
   * **Not the same question as "is the phase active now", and the difference is
   * a real hole.** A phase span rarely divides evenly into the fixed step, so
   * the step that carries the swing out of `active` ends with the phase already
   * reading `recover` — while the head, during that step, travelled through the
   * last sliver of the arc. Testing on the phase alone leaves that sliver
   * untested, and a target sitting in it is a dead-centre miss. It shows up
   * first at high speed, because the faster the wielder travels the more arc
   * each step covers and the bigger the untested tail gets.
   *
   * The same argument applies at the other end, where the step that enters
   * `active` starts from the wind-up's final position — which is the arc's own
   * start, so the segment is continuous and worth testing.
   */
  private activeDuringStep = false;

  private headX = 0;
  private headY = 0;
  private headZ = 0;
  private previousX = 0;
  private previousY = 0;
  private previousZ = 0;
  /** False until a head position exists to sweep *from*. */
  private seeded = false;
  /** Set by the guard or by `reseed`, cleared once acted on. Diagnostics read it. */
  private reseededThisStep = false;

  private readonly hits: PaddleHit[] = [];
  private readonly headScratch = { x: 0, y: 0, z: 0 };

  get phase(): SwingPhase {
    return this.phaseValue;
  }

  /** True whenever the paddle is not at rest, so the renderer can pose the arm. */
  get swinging(): boolean {
    return this.phaseValue !== 'idle';
  }

  /** True only inside the strike window. */
  get striking(): boolean {
    return this.phaseValue === 'active';
  }

  /** The side chosen for the current or most recently completed swing. */
  get swingSide(): SwingSide {
    return this.swingSideValue;
  }

  /** How far through the current phase, 0..1. Idle is always 0. */
  get phaseProgress(): number {
    const span = this.spanOf(this.phaseValue);
    if (span <= 0) return this.phaseValue === 'idle' ? 0 : 1;
    const progress = this.elapsed / span;
    return progress < 0 ? 0 : progress > 1 ? 1 : progress;
  }

  /**
   * The head's current yaw offset from the wielder's heading, radians.
   *
   * Negative is toward the wielder's right. This is what the renderer poses the
   * paddle by, so the drawn head and the swept head are one arithmetic rather
   * than two that agree today.
   */
  get angle(): number {
    const strikeStart = this.swingAngle(this.startAngle);
    const strikeEnd = this.swingAngle(this.startAngle + this.sweepRadians);
    switch (this.phaseValue) {
      case 'idle':
        return this.restAngle;
      case 'windup':
        return this.restAngle + (strikeStart - this.restAngle) * smoothstep(this.phaseProgress);
      case 'active':
        // **Linear, and that is not a stylistic choice.** The teleport guard and
        // the sagitta bound are both derived from a constant angular rate; an
        // eased strike window would exceed the rate they were computed at,
        // exactly in the middle where the hits happen.
        return strikeStart + (strikeEnd - strikeStart) * this.phaseProgress;
      case 'recover':
      default: {
        return strikeEnd + (this.restAngle - strikeEnd) * smoothstep(this.phaseProgress);
      }
    }
  }

  /** Where the head is carried at rest: the middle of its own arc. */
  get restAngle(): number {
    return this.startAngle + this.sweepRadians / 2;
  }

  get headPosition(): { x: number; y: number; z: number } {
    return { x: this.headX, y: this.headY, z: this.headZ };
  }

  /**
   * How committed the arm is to the swing, 0..1. What the renderer poses with.
   *
   * Eased into the wind-up and out of the recovery so the arm leaves and
   * rejoins its ordinary carriage rather than snapping to and from it; flat at
   * 1 through the strike window, because that is the part the player is timing
   * and an eased arm there would be an arm lagging the thing that hits.
   */
  get armCommitment(): number {
    switch (this.phaseValue) {
      case 'idle':
        return 0;
      case 'windup':
        return smoothstep(this.phaseProgress);
      case 'active':
        return 1;
      case 'recover':
      default:
        return 1 - smoothstep(this.phaseProgress);
    }
  }

  /**
   * Where the head would be for an arbitrary pose, at the current swing angle.
   *
   * **For the render frame, which interpolates.** The head the hit test swept
   * through belongs to a fixed step; the rider drawn on screen is somewhere
   * between two of them. Drawing the paddle at the stepped head would leave it
   * lagging its own rider by up to a frame at 50 mph — about a fifth of a metre
   * — so the renderer asks for the head at the *interpolated* pose instead,
   * through the same arithmetic and the same angle.
   *
   * Writes into a caller-owned object; allocates nothing.
   */
  writeHeadFor(pose: WielderPose, out: { x: number; y: number; z: number }): void {
    const cos = Math.cos(pose.headingY);
    const sin = Math.sin(pose.headingY);
    const yaw = pose.headingY + this.angle;
    out.x = pose.x - cos * this.pivotOffset + Math.sin(yaw) * this.reach;
    out.y = pose.y + this.pivotHeight;
    out.z = pose.z + sin * this.pivotOffset + Math.cos(yaw) * this.reach;
  }

  /** True if the last step threw its previous position away instead of sweeping. */
  get reseeded(): boolean {
    return this.reseededThisStep;
  }

  /**
   * The longest step the head can legitimately take, metres.
   *
   * Its own arc speed plus a wielder travelling at `speed`, over one fixed step.
   * Exported as arithmetic rather than as a comment so `paddle.test.ts` can
   * assert `maxStepSweep` still clears it after somebody retunes either side.
   */
  legitimateStepSweep(speed: number): number {
    const arc = this.activeSeconds > 0
      ? (this.reach * Math.abs(this.sweepRadians)) / this.activeSeconds
      : 0;
    return (arc + Math.max(0, speed)) / SIMULATION.hz;
  }

  /**
   * How far the chord the sweep tests bows away from the true arc, metres.
   *
   * The reason there is no sub-stepping. Millimetric at any sane tuning; the
   * test asserts it stays far below the head radius, because the day it does not
   * is the day the segment stops being a fair approximation of the swing.
   */
  get stepSagitta(): number {
    const steps = Math.max(1, this.activeSeconds * SIMULATION.hz);
    const perStep = Math.abs(this.sweepRadians) / steps;
    return this.reach * (1 - Math.cos(perStep / 2));
  }

  /**
   * Throw the previous head position away, so the next step seeds instead of
   * sweeping.
   *
   * Called on every teleport the composition root can see. The unconditional
   * distance guard in `step` is the primary defence and this is the half that
   * does not depend on a threshold being right.
   */
  reseed(): void {
    this.seeded = false;
  }

  /** Drop out of a swing entirely — a crash, a pause, a world swap. */
  cancel(): void {
    this.phaseValue = 'idle';
    this.elapsed = 0;
    this.seeded = false;
    this.activeDuringStep = false;
  }

  /**
   * One fixed step.
   *
   * Returns the volumes struck this step, nearest first along the sweep. The
   * caller decides what a hit *means*; nothing here scores, sounds, or jolts —
   * and in particular nothing here calls `injectWobble`, under the owner's
   * standing rule that nothing but a real hazard may trigger wobble in play.
   */
  step(
    dt: number,
    pose: WielderPose,
    swingRequested: boolean,
    hittables: HittableSet | null,
    swingSide: SwingSide = 'right',
  ): readonly PaddleHit[] {
    this.reseededThisStep = false;
    this.advancePhase(dt, swingRequested, swingSide);

    this.previousX = this.headX;
    this.previousY = this.headY;
    this.previousZ = this.headZ;
    this.writeHead(pose);

    // The guard, unconditional and before anything reads the segment. A step
    // longer than a swing can produce is a teleport whatever caused it.
    const dx = this.headX - this.previousX;
    const dy = this.headY - this.previousY;
    const dz = this.headZ - this.previousZ;
    const travelled = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!this.seeded || travelled > this.maxStepSweep) {
      this.previousX = this.headX;
      this.previousY = this.headY;
      this.previousZ = this.headZ;
      this.seeded = true;
      this.reseededThisStep = true;
      return NO_HITS;
    }

    if (!this.activeDuringStep || hittables === null) return NO_HITS;
    return this.sweep(hittables);
  }

  // -- Internals ------------------------------------------------------------

  private spanOf(phase: SwingPhase): number {
    switch (phase) {
      case 'windup':
        return Math.max(0, this.windupSeconds);
      case 'active':
        return Math.max(0, this.activeSeconds);
      case 'recover':
        return Math.max(0, this.recoverSeconds);
      default:
        return 0;
    }
  }

  /**
   * Walk the cycle.
   *
   * A `while` rather than an `if` because a phase span can be tuned below one
   * fixed step — `windupSeconds` may legitimately go to zero on F4 — and a
   * single transition per step would then stretch a swing back out to one step
   * per phase and make the slider appear to do nothing below 8.3 ms.
   */
  private advancePhase(dt: number, swingRequested: boolean, swingSide: SwingSide): void {
    this.activeDuringStep = this.phaseValue === 'active';
    if (this.phaseValue === 'idle') {
      // Only idle accepts a request. Re-pressing during recovery is a player
      // asking for a second swing before the first finished, and granting it
      // would make the whole cycle cost nothing.
      if (!swingRequested) return;
      this.swingSideValue = swingSide;
      this.phaseValue = 'windup';
      this.elapsed = 0;
    }

    this.elapsed += Math.max(0, dt);
    let guard = 0;
    while (this.phaseValue !== 'idle' && this.elapsed >= this.spanOf(this.phaseValue)) {
      this.elapsed -= this.spanOf(this.phaseValue);
      this.phaseValue = this.phaseValue === 'windup'
        ? 'active'
        : this.phaseValue === 'active'
          ? 'recover'
          : 'idle';
      if (this.phaseValue === 'active') this.activeDuringStep = true;
      // Three phases; a fourth iteration would mean every span is zero, and the
      // swing is then instantaneous rather than infinite.
      guard += 1;
      if (guard > 3) {
        this.phaseValue = 'idle';
        this.elapsed = 0;
        break;
      }
    }
    if (this.phaseValue === 'idle') this.elapsed = 0;
  }

  /** Mirror one authored right-side strike angle across the forward axis. */
  private swingAngle(rightSideAngle: number): number {
    return this.swingSideValue === 'left' ? -rightSideAngle : rightSideAngle;
  }

  /**
   * Put the head where the pose and the angle say it is.
   *
   * **The one place either sign lives.** Forward at yaw φ is `(sin φ, 0, cos φ)`,
   * so the wielder's left is φ + π/2 = `(cos φ, 0, −sin φ)` — which is +X at φ=0,
   * matching the world convention that +X is the rider's left. The right is
   * therefore `(−cos φ, 0, sin φ)`, and `pivotOffset` is a magnitude carried onto
   * it here rather than a signed constant anybody could get backwards elsewhere.
   *
   * This is checked in **screen space** by the browser suite, not in world
   * space: this project has already shipped a steering sign that the entire
   * headless suite agreed with, because every assertion was written in the same
   * wrong frame.
   */
  private writeHead(pose: WielderPose): void {
    // Through `writeHeadFor`, so the head the hit test sweeps and the head the
    // renderer draws are one arithmetic rather than two that agree today.
    this.writeHeadFor(pose, this.headScratch);
    this.headX = this.headScratch.x;
    this.headY = this.headScratch.y;
    this.headZ = this.headScratch.z;
  }

  /**
   * The swept segment against everything near it.
   *
   * Allocation-free apart from the reused hit array, which is empty on the
   * overwhelming majority of steps.
   */
  private sweep(hittables: HittableSet): readonly PaddleHit[] {
    this.hits.length = 0;

    const p0x = this.previousX;
    const p0y = this.previousY;
    const p0z = this.previousZ;
    const dx = this.headX - p0x;
    const dy = this.headY - p0y;
    const dz = this.headZ - p0z;
    const lengthSquared = dx * dx + dy * dy + dz * dz;

    const grow = this.headRadius;
    hittables.eachNear(
      Math.min(p0x, this.headX) - grow,
      Math.min(p0y, this.headY) - grow,
      Math.min(p0z, this.headZ) - grow,
      Math.max(p0x, this.headX) + grow,
      Math.max(p0y, this.headY) + grow,
      Math.max(p0z, this.headZ) + grow,
      (volume) => {
        const toX = volume.x - p0x;
        const toY = volume.y - p0y;
        const toZ = volume.z - p0z;
        // A stationary head is a degenerate segment, and clamping the parameter
        // to zero makes it a plain point-sphere test rather than a division by
        // nothing. It happens on the first active step of a swing thrown from a
        // standstill with zero wind-up.
        const t = lengthSquared > 0
          ? Math.min(1, Math.max(0, (toX * dx + toY * dy + toZ * dz) / lengthSquared))
          : 0;
        const nearestX = toX - dx * t;
        const nearestY = toY - dy * t;
        const nearestZ = toZ - dz * t;
        const reach = this.headRadius + volume.radius;
        if (nearestX * nearestX + nearestY * nearestY + nearestZ * nearestZ > reach * reach) return;
        this.hits.push({ id: volume.id, t });
      },
    );

    // Nearest first along the sweep, and by id where two are equidistant. The
    // order is what a caller scoring one hit per step would depend on, and a
    // tie broken by array order would make `advance(n)` disagree with itself
    // after the generator reordered its output.
    this.hits.sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return this.hits;
  }
}
