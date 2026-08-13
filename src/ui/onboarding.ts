/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The first ride teaches itself — three contextual prompts, and no tutorial.
 *
 * M9's exit question is *"can a new player start riding without being told
 * how?"*, and the owner's answer (2026-08-05) is that it means the game needs
 * no explanation from outside itself, not that it may offer no cues at all.
 * So: **Start Ride stays the primary action, Controls stays available from the
 * title and the pause menu, and the first ride introduces at most three things
 * in at most three dismissible prompts.** The route and its consequences teach
 * everything else — that is what the ten beats of `docs/PLANS.md` §6 are for.
 *
 * Three rules keep this from becoming the tutorial it is not:
 *
 *   1. **A prompt is cleared by doing the thing**, not by reading it. The
 *      player who already knows WASD accelerates within a second and never
 *      finishes reading the first prompt, which is the correct outcome.
 *   2. **One at a time, and never during a crash.** A stack of hints over the
 *      playfield is the thing §8.1 reserves lanes to prevent.
 *   3. **It gives up, and it gives up on the whole sequence.** A prompt that
 *      has been on screen for `PROMPT_TIMEOUT_SECONDS` without being satisfied
 *      hides itself, is marked seen, and stops the remaining prompts for the
 *      rest of the session — as does dismissing one. A player who ignored or
 *      waved away the first hint has told us they are not reading hints, and
 *      answering that by producing two more is the exact behaviour the owner's
 *      standing rule forbids. What was not retired is not saved, so the
 *      remaining prompts get one more chance on a later session, and the pause
 *      menu's Controls list is the permanent answer in the meantime.
 *
 * Seen flags persist through `app/options.ts` and therefore through
 * `platform/storage.ts`, which means they are failure-safe: a player in a
 * private window sees the prompts once per session rather than never or
 * forever.
 *
 * Pure logic, no DOM, driven by simulation seconds — the same clock the HUD
 * uses, and for the same reason.
 */

/** The three things a first ride has to hand over. In order. */
export type PromptId = 'ride' | 'brake' | 'hop';

export const PROMPT_IDS: readonly PromptId[] = ['ride', 'brake', 'hop'];

/** Which device's names to use in the text. */
export type PromptDevice = 'keyboard' | 'gamepad' | 'touch';

export interface OnboardingInput {
  /** True only while the app state is actually a ride. */
  readonly riding: boolean;
  /** Signed throttle intent, as the player is asking for it. */
  readonly throttle: number;
  /** Signed steer intent, +1 to the rider's right. */
  readonly steer: number;
  /** Ground speed, m/s. Signed. */
  readonly speed: number;
  /** True on the update a hop actually left the ground. */
  readonly hopped: boolean;
  readonly crashed: boolean;
  readonly device: PromptDevice;
}

export interface OnboardingView {
  /** The prompt to show, or null for none. */
  readonly prompt: PromptId | null;
  /** Its words, already resolved for the device in the player's hands. */
  readonly text: string;
  /**
   * The prompt that finished on this update, or null.
   *
   * Reported for exactly one update so the caller can persist the seen flag
   * without having to diff anything.
   */
  readonly completed: PromptId | null;
}

/** Seconds of demonstrated input each prompt wants before it is satisfied. */
const ACCELERATE_SECONDS = 0.9;
const CARVE_SECONDS = 0.45;
const BRAKE_SECONDS = 0.3;

/** How hard an axis must be pushed to count as demonstrating anything. */
const AXIS_THRESHOLD = 0.5;
/** Braking below this speed is a rider standing still, not a rider braking. */
const BRAKE_MIN_SPEED = 1.5;

/** Settle before the first prompt, and breathe between prompts. Seconds. */
const FIRST_PROMPT_DELAY_SECONDS = 0.8;
const BETWEEN_PROMPTS_SECONDS = 1.6;
/** After this long on screen unsatisfied, a prompt gives up. Seconds. */
const PROMPT_TIMEOUT_SECONDS = 25;

const PROMPT_TEXT: Readonly<Record<PromptId, Readonly<Record<PromptDevice, string>>>> =
  Object.freeze({
    ride: Object.freeze({
      keyboard: 'Hold W to ride — A and D to carve',
      gamepad: 'Right trigger to ride — left stick to carve',
      // Named by what they do rather than by where they are: the layout
      // mirrors for a left-handed player, so "the left pad" would be wrong for
      // some players and right for others, and neither would know which.
      touch: 'Push the stick up to ride — sideways to carve',
    }),
    brake: Object.freeze({
      keyboard: 'Hold S to brake',
      gamepad: 'Left trigger to brake',
      touch: 'Pull the stick down to brake',
    }),
    hop: Object.freeze({
      keyboard: 'Space to hop a kerb',
      gamepad: 'A to hop a kerb',
      touch: 'Tap HOP to jump — hold CHARGE first for a bigger one',
    }),
  });

export class Onboarding {
  private readonly seen: Set<string>;

  private active: PromptId | null = null;
  private shownAt = 0;
  /** When the next prompt becomes eligible. Also the initial settle. */
  private eligibleAt = Number.NEGATIVE_INFINITY;
  private started = false;
  /**
   * Whether the seen set has grown since the caller last asked.
   *
   * A flag rather than an event, because a prompt can also retire *silently*
   * — the player demonstrated the skill before the prompt was due — and that
   * has to be persisted just as much as one that was shown and satisfied.
   * Reporting only visible completions would show a competent player the same
   * retired prompt again on their next session.
   */
  private seenChanged = false;
  /** Set by a timeout or a dismissal. Session-lifetime; never persisted. */
  private stopped = false;

  private accelerateHeld = 0;
  private carveHeld = 0;
  private brakeHeld = 0;
  private hopSeen = false;

  constructor(seen: readonly string[] = []) {
    this.seen = new Set(seen);
  }

  /** True once there is nothing left to teach. */
  get finished(): boolean {
    return PROMPT_IDS.every((id) => this.seen.has(id));
  }

  /**
   * Start over from a given seen set.
   *
   * Exists for one caller: the settings screen's "reset everything to
   * defaults", which clears the saved flags. Without this the live instance
   * would keep its own set and the prompts would never come back — the button
   * would appear to work, the record would say the prompts were unseen, and
   * the player would never see one again. The demonstrated-skill counters are
   * cleared too, or a reset mid-ride would retire every prompt instantly on
   * the evidence of the ride that preceded it.
   */
  restart(seen: readonly string[] = []): void {
    this.seen.clear();
    for (const id of seen) this.seen.add(id);
    this.active = null;
    this.stopped = false;
    this.started = false;
    this.seenChanged = false;
    this.accelerateHeld = 0;
    this.carveHeld = 0;
    this.brakeHeld = 0;
    this.hopSeen = false;
  }

  get current(): PromptId | null {
    return this.active;
  }

  /**
   * The player asked for the prompt to go away.
   *
   * Dismissing counts as seen. A player who dismisses a hint has told us
   * something, and showing it again on the next ride would be arguing.
   */
  dismiss(): PromptId | null {
    const dismissed = this.active;
    if (dismissed === null) return null;
    this.seen.add(dismissed);
    this.seenChanged = true;
    this.active = null;
    this.stopped = true;
    return dismissed;
  }

  /**
   * Whether anything needs saving, cleared by asking.
   *
   * The caller owns storage and this file owns the teaching, so persistence is
   * a question the caller asks rather than something this file reaches out to
   * do — which is also why nothing here imports the options store.
   */
  takeSeenChanged(): boolean {
    const changed = this.seenChanged;
    this.seenChanged = false;
    return changed;
  }

  /** One update, at a simulation time. */
  update(nowSeconds: number, dt: number, input: OnboardingInput): OnboardingView {
    // Outside a ride there is nothing to teach and nothing to see. The delay
    // clock restarts, so returning from a pause does not drop a prompt on the
    // player at the same instant the menu disappears.
    if (!input.riding || this.finished || this.stopped) {
      this.active = null;
      this.eligibleAt = nowSeconds + (this.started ? BETWEEN_PROMPTS_SECONDS : 0);
      return { prompt: null, text: '', completed: null };
    }

    if (!this.started) {
      this.started = true;
      this.eligibleAt = nowSeconds + FIRST_PROMPT_DELAY_SECONDS;
    }

    // A rider on the ground after a crash has a different problem than the one
    // the prompt is about. It comes back when they are riding again.
    if (input.crashed) {
      return {
        prompt: null,
        text: '',
        completed: null,
      };
    }

    // Demonstrations count whenever the player is riding, not only while the
    // prompt about them is up. A rider who accelerates, carves, brakes and
    // hops a kerb in their first ten seconds has said everything these prompts
    // were going to ask for, and should be shown as close to none of them as
    // the timing allows rather than three in a row about things they have
    // already done.
    this.record(dt, input);

    let completed: PromptId | null = null;

    if (this.active === null) {
      if (nowSeconds >= this.eligibleAt) this.show(this.nextPrompt(), nowSeconds);
    } else if (this.satisfied(this.active)) {
      completed = this.finish(nowSeconds);
    } else if (nowSeconds - this.shownAt >= PROMPT_TIMEOUT_SECONDS) {
      completed = this.finish(nowSeconds);
      this.stopped = true;
    }

    const prompt = this.active;
    return {
      prompt,
      text: prompt === null ? '' : PROMPT_TEXT[prompt][input.device],
      completed,
    };
  }

  /**
   * Which prompts have been dealt with. Handed back so the caller can persist
   * them; the caller owns storage, this file owns the teaching.
   */
  seenPrompts(): readonly string[] {
    return [...this.seen];
  }

  /**
   * The next thing worth saying.
   *
   * A prompt whose skill has already been demonstrated is retired silently
   * rather than flashed for one frame and then dismissed — a hint that appears
   * and vanishes before it can be read is worse than one that never appears,
   * because the player saw *something* move and cannot tell what.
   */
  private nextPrompt(): PromptId | null {
    for (const id of PROMPT_IDS) {
      if (this.seen.has(id)) continue;
      if (this.satisfied(id)) {
        this.seen.add(id);
        this.seenChanged = true;
        continue;
      }
      return id;
    }
    return null;
  }

  private show(prompt: PromptId | null, nowSeconds: number): void {
    if (prompt === null) return;
    this.active = prompt;
    this.shownAt = nowSeconds;
  }

  private finish(nowSeconds: number): PromptId | null {
    const done = this.active;
    if (done === null) return null;
    this.seen.add(done);
    this.seenChanged = true;
    this.active = null;
    this.eligibleAt = nowSeconds + BETWEEN_PROMPTS_SECONDS;
    return done;
  }

  /**
   * Accumulate demonstrated input.
   *
   * Cumulative rather than continuous: a player feathering the throttle in
   * three short pushes has demonstrated the throttle, and requiring an
   * unbroken hold would leave the prompt up while they were visibly already
   * doing it.
   */
  private record(dt: number, input: OnboardingInput): void {
    if (dt <= 0) return;
    if (input.throttle > AXIS_THRESHOLD) this.accelerateHeld += dt;
    if (Math.abs(input.steer) > AXIS_THRESHOLD) this.carveHeld += dt;
    if (input.throttle < -AXIS_THRESHOLD && Math.abs(input.speed) > BRAKE_MIN_SPEED) {
      this.brakeHeld += dt;
    }
    if (input.hopped) this.hopSeen = true;
  }

  private satisfied(prompt: PromptId): boolean {
    if (prompt === 'ride') {
      return this.accelerateHeld >= ACCELERATE_SECONDS && this.carveHeld >= CARVE_SECONDS;
    }
    if (prompt === 'brake') return this.brakeHeld >= BRAKE_SECONDS;
    return this.hopSeen;
  }
}
