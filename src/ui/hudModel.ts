/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { PowerStage } from '../simulation/EucController.ts';
import type { RunPhase } from '../simulation/challenge.ts';
import type { LapPhase } from '../simulation/trackDay.ts';
import { SPEED_UNITS, type SpeedUnit } from '../app/options.ts';
import { AUDIO, CHALLENGE, CHASE, TRACK_DAY } from '../data/tuning.ts';
import {
  overspeedBeepPeriod,
  overspeedLevel,
  type OverspeedLevel,
} from '../shared/overspeed.ts';

/**
 * What the HUD says, decided as arithmetic — `docs/PLANS.md` §8.1.
 *
 * The HUD's layout rule is that **all geometry is in CSS and script never lays
 * out** (master §14). This file is the other half of that rule: script does
 * not *decide* much either. Everything the HUD shows is computed here, as a
 * pure function of the ride plus a clock, so the DOM layer's whole job is to
 * write strings and toggle classes — and so every rule about when a warning
 * appears is `node --test` territory instead of something only a human staring
 * at a screen can check.
 *
 * **The dwell timers are the reason this is not a one-line formatter.** The
 * power ladder's rungs sit on a smoothed load, and a rider holding a climb at
 * exactly the notice threshold would otherwise strobe the warning on and off
 * several times a second. The same is true of the off-route hint at the edge
 * of the course. A flickering warning is worse than no warning — it is the
 * kind of thing that makes a player turn the HUD off — and it is squarely
 * inside the owner's standing rule that nothing may be annoying. So a cue that
 * appears stays up for a minimum time, and a cue that clears waits before it
 * appears again.
 *
 * **M10's split delta is the third dwell and it is the same mechanism**, not a
 * second one. It differs only in which direction needs the help: a checkpoint
 * is crossed on exactly one simulation step, so a split that was not held would
 * be a cue nobody ever saw, where a warning that was not held is a cue seen too
 * many times. Both are the same defect from opposite ends, and both are one
 * comparison against the same clock.
 *
 * The clock is **simulation seconds**, not wall time. That is what keeps
 * `advance(n)` deterministic for a browser spec, and it also means the HUD
 * holds its state while the game is paused rather than ageing behind the pause
 * menu.
 */

/** Which rung of the power ladder the HUD is showing, if any. */
export type HudWarning = 'none' | 'notice' | 'warn' | 'tiltBack';

/**
 * Re-exported so a consumer of the HUD does not have to know that the unit is
 * also a saved option. It is declared in `app/options.ts` because it persists.
 */
export { SPEED_UNITS, type SpeedUnit };

/**
 * What a timed run tells the HUD, once per reading.
 *
 * Deliberately *not* the `ChallengeState` the simulation keeps. That record
 * carries the whole split table, the route's checkpoint count, and a live
 * delta; the HUD needs four things, and taking only those four is what stops
 * the top-right lane from quietly becoming a second results screen. It also
 * keeps this file testable without constructing a `ChallengeRun`.
 *
 * `split` is set **on the reading where a checkpoint was crossed and on no
 * other**. How long it then stays on screen is this model's business, not the
 * caller's — see the dwell in `update`.
 */
export interface ChallengeHudInput {
  readonly phase: RunPhase;
  readonly elapsed: number;
  /** The checkpoint being sought, for the objective line. Empty when none. */
  readonly nextLabel: string;
  /** Gates already crossed, including the start line. */
  readonly passed: number;
  /** Gates in the route, including the start and finish. */
  readonly total: number;
  /** Signed bearing to the active gate relative to the rider's heading. */
  readonly directionRadians: number;
  /**
   * Straight-line metres to that checkpoint. `Infinity` when there is none.
   *
   * **Formatted here rather than by the caller**, which is where it was first
   * done — and the caller only used it while a run was *running*, so the one
   * phase the distance was written for lost it. A rider who has armed the trial
   * and is riding away from the start line has no other cue at all that the
   * game is waiting for them, because nothing has begun.
   */
  readonly distanceMetres: number;
  /** Set when a checkpoint was just crossed; the model owns how long it shows. */
  readonly split: { readonly label: string; readonly delta: number | null } | null;
}

/**
 * What the lane flashes when a line is crossed — M23.
 *
 * A discriminated union rather than a bag of nullable fields, because the three
 * cases want three different sentences and the alternative is a caller in
 * `app/` composing them. `AGENTS.md`'s rule is that the screen owns the words,
 * and this file is the screen: `app/Game.ts` reports what happened and every
 * string below is composed here, from the same formatters the results card
 * uses, so the lap time in the corner of the frame and the one on the card
 * cannot disagree.
 */
export type LapFlash =
  /** A sector line. `label` is the level author's own. */
  | { readonly kind: 'sector'; readonly label: string; readonly delta: number | null }
  /** A lap that counted. */
  | { readonly kind: 'lap'; readonly seconds: number; readonly delta: number | null }
  /** A lap that reached the line and will not count. */
  | { readonly kind: 'void' };

/**
 * How the track day is going — M23. Absent in every other ride.
 *
 * Absent rather than zeroed, exactly as `knockabout` and `chase` are: "not
 * lapping" and "lapping, having set nothing yet" are different things, and the
 * second draws a clock at zero rather than no lane at all.
 *
 * It carries `ChallengeHudInput`'s fields under a lap's names plus the two
 * facts a lap has and a timed run does not — which lap this is, and whether it
 * still counts.
 */
export interface TrackDayHudInput {
  readonly phase: LapPhase;
  /** The lap being ridden, counting from one. Zero on the out lap. */
  readonly lap: number;
  /** Seconds into that lap. */
  readonly elapsed: number;
  /** False once the lap has been written off. */
  readonly valid: boolean;
  /**
   * The time to beat, or null while there is none.
   *
   * The *chased* best rather than the session's: it is whichever of the stored
   * record and this afternoon's best is quicker, decided upstream, because the
   * lane's job is to name one number and a screen that reasoned about which of
   * two to show would be a second opinion about what the player is racing.
   */
  readonly bestLapSeconds: number | null;
  /** The last lap that counted, or null before there is one. */
  readonly lastLapSeconds: number | null;
  /** The line being sought, for the out lap's objective. Empty when there is none. */
  readonly nextLabel: string;
  readonly directionRadians: number;
  readonly distanceMetres: number;
  /** Set on the reading where a line was crossed, and on no other. */
  readonly split: LapFlash | null;
}

/**
 * The run lane, ready to write. Every field is a string or a flag.
 *
 * **One view, two producers** — M23. The time trial and Track Day are
 * alternatives (a ride is one mode, never both), they want the same corner of
 * the screen, and `.euc-hud__challenge` is already the element that owns it.
 * Giving the lap its own view type would have meant a second element in the
 * same grid cell, which CSS resolves by stacking them silently on top of each
 * other; giving it the same one means the DOM layer keeps a single writer and
 * the two modes cannot be on screen together by construction.
 */
export interface ChallengeHudView {
  readonly visible: boolean;
  /**
   * The small line above the clock. Empty in a time trial, which has none.
   *
   * A lap clock without it is a number with no noun — the same objection
   * `modeLaneLabel` exists to answer for the Knockabout score, arriving in the
   * other corner. It is also where a lap that will not count says so, because
   * that belongs beside the lap it is about rather than in a cue lane the
   * player reads for a different reason.
   */
  readonly lapLabel: string;
  readonly time: string;
  /**
   * The always-on bottom row: the time to beat. Empty in a time trial.
   *
   * **Persistent rather than flashed, because the owner's first session said
   * so.** The first build put the finished lap in the split row for four
   * seconds and then gave the row back — so a rider who looked up six seconds
   * after the line found the lane apparently reset, with neither the lap they
   * had just ridden nor the one they were chasing on it. Both now stay.
   */
  readonly bestLabel: string;
  readonly bestValue: string;
  /** Empty when there is nothing to show, which is most of a run. */
  readonly splitLabel: string;
  readonly splitDelta: string;
  /**
   * Whether the split reads as *good news*.
   *
   * Not "delta < 0": a first run has no record to be ahead of, and the lane
   * says `Best` there, which is good news too. The DOM layer turns this into
   * brightness and weight, never into colour alone — `DESIGN.md` §9 and the
   * red/green rule. The sign in `splitDelta` is the other half of the cue and
   * is the half that survives a monochrome screenshot.
   */
  readonly ahead: boolean;
}

export interface HudInput {
  /** Signed along the heading, m/s. Negative is reverse. */
  readonly speed: number;
  /**
   * How the Knockabout run is going — M14. Absent in every other ride.
   *
   * Absent rather than zeroed, so "not in this mode" and "in this mode having
   * hit nothing yet" are different things: the first draws no lane and the
   * second draws `0 / 17`, which is the number a player starting a run wants
   * to see.
   */
  readonly knockabout?: { readonly struck: number; readonly total: number };
  /**
   * How the chase is going — M18. Absent in every other ride.
   *
   * Absent rather than zeroed, exactly as `knockabout` is and for the same
   * reason. Three facts, because three is what the screen has to say: how long
   * is left (the whole mode), whether the rider is outside the route corridor
   * and on the clock for it, and whether the cop is close enough to be about to
   * swing. Everything else about the chase — his position, the record, the
   * outcome — belongs to the results card rather than to a lane the player
   * reads at 50 mph.
   */
  readonly chase?: {
    readonly remaining: number;
    readonly straying: boolean;
    readonly copClose: boolean;
    /**
     * Seconds left before leaving the route ends the run — M20, §4.4.
     *
     * **The defect the owner reported was that this number existed and was
     * invisible**: he wandered off at low speed, the only cue was a small line
     * of text, and the run ended at fourteen seconds with an "Out of bounds"
     * card that explained *afterwards* that a clock had been running. Handed
     * over raw; the rounding is this file's, like every other number on screen.
     */
    readonly strayGrace: number;
    /**
     * Bearing to the nearest point on the route, relative to the rider's
     * heading, radians — the "point the player back toward the course" half of
     * his fix. Positive is to their left, under the project's +Y yaw
     * convention. Non-finite when there is no route to point at, which draws
     * no arrow rather than a wrong one.
     */
    readonly homeRadians: number;
  };
  /**
   * How near the max-speed cutout the wheel is, 0..1 — M20.
   *
   * `EucController.overspeed`. **The screen carries this because the sound
   * might not reach the player**: the owner's own framing was that the beeps
   * are the warning, and a player riding with the phone muted would otherwise
   * meet the cutout with no warning at all. It is the same number the director
   * beeps from, so the glyph and the beep cannot describe different wheels.
   */
  readonly overspeed: number;
  readonly powerStage: PowerStage;
  /** How far tilt-back has engaged, 0..1. */
  readonly tiltBack: number;
  /** True while the wheel is on the surround rather than the authored course. */
  readonly offCourse: boolean;
  readonly crashed: boolean;
  /** Absent in free ride. Present from the moment the player arms a run. */
  readonly challenge?: ChallengeHudInput;
  /**
   * Absent in every ride but Track Day — M23.
   *
   * It and `challenge` share one lane and are mutually exclusive by app state,
   * so `update` prefers this one and never merges them.
   */
  readonly trackDay?: TrackDayHudInput;
}

export interface HudView {
  /** Already rounded and ready to write. No units — the unit has its own element. */
  readonly speed: string;
  readonly speedUnit: SpeedUnit;
  /** True while the rider is travelling backwards, which the number cannot show. */
  readonly reversing: boolean;
  /** One line, top-centre. Empty means the lane is not drawn at all. */
  readonly objective: string;
  readonly warning: HudWarning;
  /** The warning's own words. Empty when there is no warning. */
  readonly warningLabel: string;
  readonly offRoute: boolean;
  /** The top-right lane. `visible: false` in free ride, which is most of the game. */
  readonly challenge: ChallengeHudView;
  /**
   * The Knockabout score, already composed — M14, §13 q14.
   *
   * Empty means the lane is not drawn, which is every ride but this one. A
   * string rather than two numbers for the reason every other field here is
   * one: the screen does no arithmetic and no formatting, so the score in the
   * corner and the score on the results card cannot disagree.
   *
   * **A target the player rides past changes nothing here.** It stays standing,
   * scores nothing, and this lane says nothing — the only answer consistent
   * with the recorded rule against scolding a player for exploring, which is
   * what cut the "Missed: Park gate" line at M10.
   */
  readonly knockabout: string;
  /**
   * The chase clock, already composed — M18.
   *
   * Empty means the lane is not drawn. It shares the corner with the Knockabout
   * score because a ride is one mode or the other and never both, and
   * `ui/hud.ts` picks between them in one expression rather than giving the two
   * modes two elements that would have to be hidden in step.
   */
  readonly chase: string;
  /**
   * What the shared mode lane is counting.
   *
   * Empty whenever the lane is absent. The model owns these words because the
   * DOM cannot infer that `5:00` is survival time rather than a target score.
   */
  readonly modeLabel: string;
  /** The out-of-bounds banner — M20, §4.4. */
  readonly stray: StrayHudView;
  /** The max-speed warning glyph — M20. */
  readonly overspeed: OverspeedHudView;
}

/**
 * The out-of-bounds banner — M20, and the owner's §4.4 report answered
 * literally.
 *
 * He named three things and this carries all three: **make the warning
 * obviously visible** (its own element, big, in the middle of the top edge,
 * where `hud.ts` and `game.css` give it a panel rather than a line of body
 * text), **point the player back toward the course** (`arrow`), and **show the
 * countdown** (`seconds`). His summary of why — *"don't wanna bore the
 * players"*, the punishment isn't the problem, the surprise is.
 *
 * **It is one event, not a repeated cue**, which is how it clears the standing
 * annoyance bar the same feedback file records: it appears once when the rider
 * leaves, it stays for exactly as long as they are outside, and it is gone the
 * moment they are back. Nothing about it pulses or re-announces until the last
 * few seconds, when `urgent` earns it.
 */
export interface StrayHudView {
  readonly visible: boolean;
  /** The instruction. Empty when the banner is not drawn. */
  readonly label: string;
  /** One of the eight bearing glyphs, or empty when there is nothing to aim at. */
  readonly arrow: string;
  /** Whole seconds left, as the banner shows them. Empty when not drawn. */
  readonly seconds: string;
  /** How much of the grace is left, 0..1 — the bar the panel draws. */
  readonly fraction: number;
  /** The last few seconds. The DOM turns this into colour *and* a pulse. */
  readonly urgent: boolean;
}

/**
 * The max-speed warning, for a player who cannot hear the beeps — M20.
 *
 * **Non-obstructive by construction**, which is what the owner asked for: it is
 * a glyph and two words in the same top-centre column as the banner above,
 * never in the middle of the frame, and it does not exist at all below 40 mph —
 * so a player who never goes near the top of the range never sees it once.
 *
 * `pulseSeconds` is the beep period from `shared/overspeed.ts`, handed to CSS
 * as an animation duration. That is the one place this file lets a value become
 * geometry, and it is deliberate: the *rate* is the whole message of this
 * warning, so a glyph that blinked at a fixed rate while the beeps accelerated
 * would be telling the player something false.
 */
export interface OverspeedHudView {
  readonly visible: boolean;
  readonly label: string;
  readonly level: OverspeedLevel;
  readonly pulseSeconds: number;
}

const NO_STRAY: StrayHudView = Object.freeze({
  visible: false,
  label: '',
  arrow: '',
  seconds: '',
  fraction: 1,
  urgent: false,
});

const NO_OVERSPEED: OverspeedHudView = Object.freeze({
  visible: false,
  label: '',
  level: 'none' as OverspeedLevel,
  pulseSeconds: AUDIO.overspeedSlowestPeriodSeconds,
});

/**
 * How long a cue must stay up once shown, and how long it must stay away once
 * cleared, in seconds.
 *
 * Not in `data/tuning.ts`: these are not ride values and no developer will
 * ever tune them against the feel of the wheel. They are here, beside the rule
 * they implement, where a reader asking "why does this warning linger?" is
 * already looking.
 */
const WARNING_MIN_VISIBLE_SECONDS = 0.7;
const OFF_ROUTE_MIN_VISIBLE_SECONDS = 1.1;
/** Distance the wheel must be back on course before the hint may return. */
const OFF_ROUTE_REARM_SECONDS = 0.5;
/**
 * How long the out-of-bounds banner stays after the rider is back inside, s.
 *
 * The referee resets the stray clock the instant the corridor is re-entered, so
 * without this a rider tracking along the 30 m line would blink a full-width
 * panel on and off several times a second — the flicker this whole file exists
 * to prevent, arriving through the newest lane. Short, because the honest thing
 * once a player is back is to get out of their way.
 */
const STRAY_MIN_VISIBLE_SECONDS = 0.6;
/**
 * When the countdown becomes urgent, seconds.
 *
 * A third of the shipped eight-second grace. It is the point at which the
 * banner stops being information and starts being a deadline, and it is the
 * only thing on this HUD besides tilt-back that is allowed to pulse.
 */
const STRAY_URGENT_SECONDS = 3;

const MS_PER_KPH = 3.6;
const MS_PER_MPH = 2.236936;

/**
 * What the objective line says before the clock has started.
 *
 * There is no countdown anywhere in this game — the player starts on a short
 * plan-derived run-up and rolls into the line, because a countdown you sit
 * through on every retry is exactly the annoyance rule. That decision only
 * works if the player is *told* what the game is waiting for, and this line is
 * the telling.
 */
const START_LINE_OBJECTIVE = 'Ride to the start line';

/**
 * How far to the next gate, quantised so the digits do not churn.
 *
 * **Both steps are chosen against how fast the number changes, not against how
 * precise it looks.** At 15 m/s a whole-metre readout ticks fifteen times a
 * second, which is exactly the "pulls the eye off the road" problem the split
 * dwell exists to avoid, arriving through a different lane — and the first
 * version of this quantised to ten metres *above* 100 m and to whole metres
 * below it, which put the coarse step on the range where the digit already
 * moved slowest and left the fast-changing one raw.
 *
 * Five metres below 100 m is three changes a second at top speed and one at a
 * walking pace, and it is still precise enough to aim at a gate. Above 100 m
 * nobody is aiming, so ten is plenty.
 *
 * Empty for a distance there is no sensible reading of, which is what the
 * objective line falls back to a bare label on.
 */
function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  const step = metres >= 100 ? 10 : 5;
  return `${Math.round(metres / step) * step} m`;
}

/**
 * A stable eight-way bearing to the active checkpoint.
 *
 * A continuously rotating arrow would churn at every carve and ask for CSS
 * geometry from script. Eight glyphs change only when the useful instruction
 * changes: ahead, a side, a diagonal, or behind. Positive angles are to the
 * rider's left under the project's +Y yaw convention.
 */
function formatDirection(radians: number): string {
  if (!Number.isFinite(radians)) return '';
  let angle = radians;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  const sector = Math.round(angle / (Math.PI / 4));
  if (sector === 0) return '↑';
  if (sector === 1) return '↖';
  if (sector === 2) return '←';
  if (sector === 3) return '↙';
  if (Math.abs(sector) === 4) return '↓';
  if (sector === -3) return '↘';
  if (sector === -2) return '→';
  return '↗';
}

/** The lane, switched off. Frozen and shared: free ride allocates nothing. */
/**
 * The Knockabout score, composed once — M14.
 *
 * A thin space either side of the slash rather than a bare `/`, so `12 / 17`
 * reads as a score at a glance on a phone at speed instead of as a fraction.
 */
function knockaboutLane(run: { struck: number; total: number } | undefined): string {
  if (run === undefined) return '';
  return `${run.struck} / ${run.total}`;
}

/**
 * The chase clock, composed once — M18.
 *
 * **Counting down, and to the second rather than to the hundredth.** The timed
 * run's clock is a *measurement* and hundredths are the difference between two
 * personal bests; this one is a *deadline*, and hundredths on a deadline churn
 * two digits at 100 Hz in the corner of the eye of somebody being chased. It
 * clamps at zero because a negative deadline is not a thing to draw.
 */
function chaseLane(run: { remaining: number } | undefined): string {
  if (run === undefined) return '';
  const whole = Math.max(0, Math.ceil(run.remaining));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole - minutes * 60).padStart(2, '0')}`;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The max-speed glyph — M20.
 *
 * **The words are "Max speed", not "Slow down".** The owner's decision is that
 * riding right underneath the edge is a thing to be *good at* rather than a
 * mistake to be corrected, so the cue names the condition and lets the player
 * decide what to do about it. A HUD that told a rider deliberately holding the
 * fastest speed in the game to slow down would be scolding them for playing
 * well, which is the same rule that cut "Missed: Park gate" at M10.
 *
 * The glyph is `⚠` and it is the whole reason this exists: the owner asked for
 * *"one of those warning emoji things"* for players riding with the sound off.
 * It is `aria-hidden` in the DOM and the words beside it carry the meaning, so
 * a screen reader does not announce "warning sign warning".
 */
function overspeedView(overspeed: number): OverspeedHudView {
  if (!(overspeed > 0)) return NO_OVERSPEED;
  return {
    visible: true,
    label: 'Max speed',
    level: overspeedLevel(overspeed),
    pulseSeconds: overspeedBeepPeriod(
      overspeed,
      AUDIO.overspeedSlowestPeriodSeconds,
      AUDIO.overspeedFastestPeriodSeconds,
    ),
  };
}

/** The label above the one corner shared by Knockabout and the police chase. */
function modeLaneLabel(input: Pick<HudInput, 'knockabout' | 'chase'>): string {
  if (input.chase !== undefined) return 'Survive';
  if (input.knockabout !== undefined) return 'Targets';
  return '';
}

/** What the lane says at the line when the lap will not count. */
const VOID_LAP_FLASH = 'No time';

const NO_CHALLENGE: ChallengeHudView = Object.freeze({
  visible: false,
  lapLabel: '',
  time: '0:00.00',
  bestLabel: '',
  bestValue: '',
  splitLabel: '',
  splitDelta: '',
  ahead: false,
});

/**
 * A run clock as `M:SS.hh`.
 *
 * **Hundredths are rounded, not truncated, and that is a float decision rather
 * than a presentation one.** The obvious stopwatch behaviour is to floor —
 * 1.999 s should read `1.99` and never `2.00`. But a run time arrives as a sum
 * of 1/120 s steps, so a genuine 1.23 s is held as 1.2299999999999998, and
 * flooring `seconds * 100` prints `1.22`: a timer that is visibly one
 * hundredth slow at arbitrary moments, and a results screen whose splits do not
 * add up to its total. Rounding is wrong by at most 5 ms on a value nobody can
 * read at 5 ms resolution, and it is wrong *consistently*.
 *
 * Minutes are not zero-padded. `M:SS.hh` is what the contract asks for and it
 * is what a stopwatch shows; the field is right-aligned in a tabular-numeral
 * font, so a run that crosses ten minutes grows leftwards and the digits the
 * player is actually watching do not move.
 *
 * Anything non-finite or negative reads as zero. A clock is one of the few
 * places where `NaN` on screen is genuinely possible — a delta divided by a
 * zero-length leg upstream — and `NaN:aN.aN` in the corner of the frame is the
 * kind of thing that ends a playtest.
 */
export function formatRunTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hundredths = Math.round(safe * 100);
  const minutes = Math.floor(hundredths / 6000);
  const wholeSeconds = Math.floor(hundredths / 100) % 60;
  const fraction = hundredths % 100;
  return `${minutes}:${pad2(wholeSeconds)}.${pad2(fraction)}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * A signed delta against the record, in seconds, as the lane shows it.
 *
 * **The minus is U+2212, not a hyphen.** In a tabular-numeral font the real
 * minus sign is the same advance width as the plus, so a run that swings
 * between ahead and behind does not shuffle the digits sideways once a second.
 * A hyphen is narrower, and the jitter it causes is small, constant, and
 * exactly the sort of thing the standing annoyance rule is about.
 *
 * A delta that rounds to zero gets no sign at all. `+0.00` claims the player
 * lost time they did not lose, and `−0.00` claims the reverse; a dead-even
 * split is neither, and the missing sign is the honest rendering. The lane
 * reserves the sign's width in CSS, so nothing moves.
 */
export function formatDelta(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds)) return '';
  const hundredths = Math.round(deltaSeconds * 100);
  const magnitude = (Math.abs(hundredths) / 100).toFixed(2);
  if (hundredths === 0) return magnitude;
  return hundredths < 0 ? `−${magnitude}` : `+${magnitude}`;
}

/**
 * The words on each rung.
 *
 * `docs/PLANS.md` §4.5 gives the ladder three rungs and M8 gave each one its
 * own beep. The amber HUD it also asks for is this, and the wording is chosen
 * so a player who has never read a manual can act on it: the first says the
 * wheel is working, the second says to back off, the third says the machine
 * has stopped asking.
 */
const WARNING_LABELS: Readonly<Record<HudWarning, string>> = Object.freeze({
  none: '',
  notice: 'Working hard',
  warn: 'Ease off',
  tiltBack: 'Tilt-back — slow down',
});

export function formatSpeed(speedMetresPerSecond: number, unit: SpeedUnit): string {
  const magnitude = Math.abs(speedMetresPerSecond) * (unit === 'mph' ? MS_PER_MPH : MS_PER_KPH);
  // Rounded to whole units: a speed readout with a decimal invites reading it
  // rather than glancing at it, and a glance is all a rider has.
  const rounded = Math.round(magnitude);
  // `-0` is a real value that `Math.round` produces and `String` prints.
  return rounded === 0 ? '0' : String(rounded);
}

function warningFor(stage: PowerStage): HudWarning {
  if (stage === 'tiltBack') return 'tiltBack';
  if (stage === 'warn') return 'warn';
  if (stage === 'notice') return 'notice';
  return 'none';
}

export interface HudModelOptions {
  readonly speedUnit?: SpeedUnit;
  /** The one line at top-centre. M10 replaces this while a challenge runs. */
  readonly objective?: string;
}

export class HudModel {
  private speedUnit: SpeedUnit;
  private objective: string;

  private warning: HudWarning = 'none';
  private warningSince = Number.NEGATIVE_INFINITY;

  private offRoute = false;
  private offRouteSince = Number.NEGATIVE_INFINITY;
  private onRouteSince = Number.NEGATIVE_INFINITY;

  /**
   * When the out-of-bounds banner was last asserted — M20.
   *
   * One timestamp rather than the pair the off-route hint keeps, because this
   * cue is asymmetric: it must appear the *instant* the boundary is crossed
   * (the whole defect was a warning nobody noticed in time) and may only linger
   * on the way out.
   */
  private strayingSince = Number.NEGATIVE_INFINITY;

  /**
   * The split the lane is currently holding, and when it was latched.
   *
   * Same shape as the warning dwell above, on the same simulation clock, for
   * the same reason: a checkpoint arrives on exactly one step, and a cue that
   * appeared for one step would be a cue nobody ever saw. The difference is
   * that this one only ever *clears* on time — there is nothing to re-assert,
   * because a gate cannot be crossed twice.
   */
  private splitLabel = '';
  private splitDelta: number | null = null;
  private splitSince = Number.NEGATIVE_INFINITY;
  /**
   * How long the latched flash stays up, seconds.
   *
   * A field rather than a constant because a lap and a sector are not the same
   * announcement: a sector split is a progress report and a lap time is the
   * number the rider came for, arriving at the moment they are accelerating out
   * of the last corner and cannot look away for long. The time trial writes
   * `CHALLENGE.splitHoldSeconds` here and never changes it.
   */
  private splitHold: number = CHALLENGE.splitHoldSeconds;

  constructor(options: HudModelOptions = {}) {
    this.speedUnit = options.speedUnit ?? 'kph';
    this.objective = options.objective ?? '';
  }

  setSpeedUnit(unit: SpeedUnit): void {
    this.speedUnit = unit;
  }

  /**
   * Set the top-centre line for free ride.
   *
   * M9 predicted that M10's challenge would write through here. It does not,
   * and the reason is in `objectiveFor` below: a run's line is derived from the
   * run rather than pushed, so it cannot go stale and it can be asserted
   * headlessly. What is set here is what the lane says whenever no run is
   * live — which is still most of the game.
   */
  setObjective(objective: string): void {
    this.objective = objective;
  }

  /** Forget every dwell timer. Called on a reset, and on leaving a ride. */
  reset(): void {
    this.resetCues();
    this.splitLabel = '';
    this.splitDelta = null;
    this.splitSince = Number.NEGATIVE_INFINITY;
  }

  /**
   * Forget the ride's own cues, leaving the challenge lane alone.
   *
   * The two halves are separate because a crash needs one and not the other:
   * the power ladder was describing a rider who is no longer on the wheel, but
   * **the run's clock does not stop for a crash**, so the lane must keep
   * reading, and a split the rider earned a second ago is still a true fact
   * about the run they are still in the middle of. Blanking it would make the
   * timer appear to restart, which is worse than saying nothing.
   */
  private resetCues(): void {
    this.warning = 'none';
    this.warningSince = Number.NEGATIVE_INFINITY;
    this.offRoute = false;
    this.offRouteSince = Number.NEGATIVE_INFINITY;
    this.onRouteSince = Number.NEGATIVE_INFINITY;
    this.strayingSince = Number.NEGATIVE_INFINITY;
  }

  /**
   * One reading of the HUD, at a simulation time.
   *
   * Allocates one small object per call and is called once per drawn frame,
   * which is deliberate: it is a plain value the DOM layer diffs against what
   * it last wrote, and sixty of these a second is nothing next to the garbage
   * a per-frame DOM read would cause.
   */
  update(nowSeconds: number, input: HudInput): HudView {
    // **A crash is a discontinuity, not a fluctuation.** The dwell timers
    // exist to smooth a wobbling input; a rider who is no longer on the wheel
    // is not a wobbling input, and holding the warning they were given a
    // moment ago over the top of a crash would be describing a situation that
    // has stopped existing.
    if (input.crashed) {
      this.resetCues();
      this.onRouteSince = nowSeconds;
      return {
        speed: formatSpeed(input.speed, this.speedUnit),
        speedUnit: this.speedUnit,
        reversing: false,
        objective: this.objectiveFor(input),
        warning: 'none',
        warningLabel: '',
        offRoute: false,
        challenge: this.runLane(nowSeconds, input),
        knockabout: knockaboutLane(input.knockabout),
        chase: chaseLane(input.chase),
        modeLabel: modeLaneLabel(input),
        // Both M20 cues go with the rest of them, and for the paragraph above:
        // a rider on the floor is neither about to leave the route nor about to
        // cut out, and the controller has already zeroed both anyway.
        stray: NO_STRAY,
        overspeed: NO_OVERSPEED,
      };
    }

    const target = warningFor(input.powerStage);

    // Rising is immediate — a warning that waited to appear would be a warning
    // arriving after the moment it was about. Only *clearing* is held back.
    if (rank(target) > rank(this.warning)) {
      this.warning = target;
      this.warningSince = nowSeconds;
    } else if (target === this.warning) {
      // **Re-asserting refreshes the dwell**, which is what actually stops the
      // flicker. Timing the hold from when the warning first appeared instead
      // would let a load oscillating across a rung clear the warning the
      // moment the dwell lapsed and re-raise it on the following frame — a
      // slower strobe rather than no strobe.
      this.warningSince = nowSeconds;
    } else if (nowSeconds - this.warningSince >= WARNING_MIN_VISIBLE_SECONDS) {
      this.warning = target;
      this.warningSince = nowSeconds;
    }

    // Off-route is symmetric and both directions are held: it is a hint rather
    // than a warning, and a hint that blinks at the kerb line is noise.
    if (input.offCourse && !this.offRoute) {
      if (nowSeconds - this.onRouteSince >= OFF_ROUTE_REARM_SECONDS) {
        this.offRoute = true;
        this.offRouteSince = nowSeconds;
      }
    } else if (!input.offCourse && this.offRoute) {
      if (nowSeconds - this.offRouteSince >= OFF_ROUTE_MIN_VISIBLE_SECONDS) {
        this.offRoute = false;
        this.onRouteSince = nowSeconds;
      }
    } else if (!input.offCourse) {
      this.onRouteSince = nowSeconds;
    } else {
      this.offRouteSince = nowSeconds;
    }

    // Tilt-back is the machine physically refusing, so it outranks the ladder's
    // own wording whenever it is actually engaged rather than merely latched.
    const warning: HudWarning = input.tiltBack > 0.02 ? 'tiltBack' : this.warning;

    return {
      speed: formatSpeed(input.speed, this.speedUnit),
      speedUnit: this.speedUnit,
      reversing: input.speed < -0.1,
      objective: this.objectiveFor(input),
      warning,
      warningLabel: WARNING_LABELS[warning],
      offRoute: this.offRoute,
      challenge: this.runLane(nowSeconds, input),
      knockabout: knockaboutLane(input.knockabout),
      chase: chaseLane(input.chase),
      modeLabel: modeLaneLabel(input),
      stray: this.strayView(nowSeconds, input.chase),
      overspeed: overspeedView(input.overspeed),
    };
  }

  /**
   * The out-of-bounds banner at a simulation time — M20, §4.4.
   *
   * The dwell is the only state here and it is one-sided: rising is immediate,
   * because the defect being fixed is a warning that arrived too quietly to act
   * on, and clearing waits out `STRAY_MIN_VISIBLE_SECONDS` so a rider tracking
   * along the boundary does not strobe a panel.
   *
   * **The seconds are ceiled, not rounded**, which is the same decision every
   * countdown in the world makes and the opposite of the run clock's a hundred
   * lines up. A rounded countdown shows `0` for half a second while the run is
   * still alive, and a rider looking at a zero has already given up. Ceiling
   * means the number reaching 0 and the run ending are the same instant.
   */
  private strayView(
    nowSeconds: number,
    chase: HudInput['chase'],
  ): StrayHudView {
    if (chase === undefined) {
      this.strayingSince = Number.NEGATIVE_INFINITY;
      return NO_STRAY;
    }

    if (chase.straying) this.strayingSince = nowSeconds;
    else if (nowSeconds - this.strayingSince >= STRAY_MIN_VISIBLE_SECONDS) return NO_STRAY;

    // The full grace is not a field on the input: the referee's own reset makes
    // `strayGrace` equal to it whenever the rider is inside, and reading it
    // from there rather than being told means the bar cannot disagree with the
    // rule if the owner drags `CHASE.strayGraceSeconds` on F4 mid-ride.
    const seconds = Math.max(0, chase.strayGrace);
    return {
      visible: true,
      label: 'Back to the route',
      arrow: formatDirection(chase.homeRadians),
      seconds: String(Math.ceil(seconds)),
      fraction: clamp01(seconds / Math.max(1e-6, CHASE.strayGraceSeconds)),
      urgent: chase.straying && seconds <= STRAY_URGENT_SECONDS,
    };
  }

  /**
   * The top-centre line, which a live run takes over.
   *
   * **A run derives the line rather than pushing it through `setObjective`**,
   * and the difference matters for the same reason the rest of this file
   * exists: derived, the wording is arithmetic over a value the caller already
   * has, and `node --test` can assert that a rider who has not reached the
   * start line is told to. Pushed, it would be a sequence of calls in
   * `app/Game.ts` that only a browser could check, and the one it forgot to
   * make would leave a stale checkpoint name on screen for the rest of the run.
   *
   * `setObjective` keeps its job for free ride, and is what the lane says
   * whenever there is no run — including after the finish, where the line goes
   * quiet so the finish itself is the only thing happening on screen.
   */
  private objectiveFor(
    input: Pick<HudInput, 'challenge' | 'trackDay' | 'chase'>,
  ): string {
    const challenge = input.challenge;
    const chase = input.chase;
    // **The chase takes the line before the timed run gets a look at it**, and
    // the ordering is the mode's own: the two never run together.
    //
    // **Straying no longer speaks here at all** — M20. It used to return "Back
    // to the route" into this one line of body text, and the owner's §4.4
    // report is that the line was *"super subtle and hard to notice"* while
    // riding. It has its own banner now (`strayView`), and the line goes quiet
    // underneath it rather than saying the same thing twice in two sizes —
    // which would be the M10 results-screen defect, where two live copies of
    // one number read as an unfinished screen.
    if (chase !== undefined) {
      if (chase.straying) return '';
      if (chase.copClose) return 'He is right behind you';
      return '';
    }
    // **Track Day speaks only on the out lap**, and that is a decision rather
    // than an omission. A circuit tells a rider where to go by being a circuit:
    // naming the next sector line every lap would be a line of text changing
    // three times a lap for a rider who already knows the way round, which is
    // the standing rule against anything annoying. Before the first crossing
    // there is no such cue, because nothing has begun and nothing on screen
    // would say so.
    const lap = input.trackDay;
    if (lap !== undefined) {
      if (lap.phase !== 'outLap') return '';
      const distance = formatDistance(lap.distanceMetres);
      const direction = formatDirection(lap.directionRadians);
      const lead = direction === '' ? '' : `${direction} `;
      return `${lead}${START_LINE_OBJECTIVE}${distance === '' ? '' : ` · ${distance}`}`;
    }
    if (challenge === undefined || challenge.phase === 'idle') return this.objective;
    const away = formatDistance(challenge.distanceMetres);
    const direction = formatDirection(challenge.directionRadians);
    const lead = direction === '' ? '' : `${direction} `;
    const distance = away === '' ? '' : ` · ${away}`;
    if (challenge.phase === 'armed') {
      return `${lead}${START_LINE_OBJECTIVE}${distance}`;
    }
    if (challenge.phase === 'running') {
      const scoredGates = Math.max(0, challenge.total - 1);
      const progress = scoredGates > 0 && challenge.passed > 0
        ? ` · ${Math.min(challenge.passed, scoredGates)}/${scoredGates}`
        : '';
      return `${lead}${challenge.nextLabel}${progress}${distance}`;
    }
    return '';
  }

  /**
   * The challenge lane at a simulation time.
   *
   * The dwell is the whole of the interesting part. `CHALLENGE.splitHoldSeconds`
   * is long enough to read a delta at speed and short enough that it is gone
   * before the next corner needs the player's eyes — a number still sitting in
   * the corner while a rider sets up a turn is the same defect as a warning
   * that strobes, one milestone later.
   *
   * A second checkpoint inside the hold **replaces** the first rather than
   * queueing behind it. Two gates 2.6 s apart is a fast section, not a bug, and
   * a lane showing the previous gate's delta while the rider is already past
   * the next one is worse than showing nothing.
   */
  private challengeView(
    nowSeconds: number,
    challenge: ChallengeHudInput | undefined,
  ): ChallengeHudView {
    if (challenge === undefined || challenge.phase === 'idle') {
      // Leaving a run drops the latch as well as hiding the lane. Without this
      // a player who abandons a run mid-split and immediately arms another one
      // would be shown the abandoned run's delta on the new run's clock.
      this.splitLabel = '';
      this.splitDelta = null;
      this.splitSince = Number.NEGATIVE_INFINITY;
      return NO_CHALLENGE;
    }

    // `armed` is the state a quick reset returns to, and nothing has been
    // crossed in it by definition. Clearing here is what makes `R` mid-run
    // wipe the lane as well as the clock.
    if (challenge.phase === 'armed' && challenge.split === null) {
      this.splitLabel = '';
      this.splitDelta = null;
      this.splitSince = Number.NEGATIVE_INFINITY;
    }

    if (challenge.split !== null) {
      this.splitLabel = challenge.split.label;
      this.splitDelta = challenge.split.delta;
      this.splitSince = nowSeconds;
      this.splitHold = CHALLENGE.splitHoldSeconds;
    }

    const holding = this.splitLabel !== '' && nowSeconds - this.splitSince < this.splitHold;

    if (!holding) {
      return {
        visible: true,
        lapLabel: '',
        bestLabel: '',
        bestValue: '',
        time: formatRunTime(challenge.elapsed),
        splitLabel: '',
        splitDelta: '',
        ahead: false,
      };
    }

    // A null delta is a leg with nothing to compare against — the player's
    // first run on this route, or their first run since clearing the record.
    // `Best` rather than a blank: it is true, it is the encouraging reading,
    // and a label with an empty value beside it looks like a bug.
    const delta = this.splitDelta;
    return {
      visible: true,
      lapLabel: '',
      bestLabel: '',
      bestValue: '',
      time: formatRunTime(challenge.elapsed),
      splitLabel: this.splitLabel,
      splitDelta: delta === null ? 'Best' : formatDelta(delta),
      ahead: delta === null || Math.round(delta * 100) < 0,
    };
  }

  /**
   * Which producer fills the run lane this frame.
   *
   * Track Day wins when it is present, and the two can never both be: they are
   * different app states and `app/Game.ts` sends one or the other. The `else`
   * still runs `challengeView(undefined)` rather than being skipped, because
   * that call is also what *clears the latch* — a session that ends mid-flash
   * and a time trial armed straight afterwards would otherwise open with the
   * last lap's delta sitting on a clock that has nothing to do with it.
   */
  private runLane(nowSeconds: number, input: HudInput): ChallengeHudView {
    if (input.trackDay !== undefined && input.trackDay.phase !== 'idle') {
      return this.trackDayView(nowSeconds, input.trackDay);
    }
    return this.challengeView(nowSeconds, input.challenge);
  }

  /**
   * The lap lane at a simulation time.
   *
   * The same three rows the time trial uses — a label, a clock and a line under
   * it — with the label carrying which lap this is and the line under the clock
   * doing double duty. **While nothing has just been crossed it names the time
   * to beat**, which is the one number a rider chasing a lap wants permanently
   * in view and the one a time trial does not need (its own delta is the
   * comparison). While a crossing is fresh, the flash replaces it, because two
   * numbers in a lane read at 40 mph is one too many.
   */
  private trackDayView(nowSeconds: number, lap: TrackDayHudInput): ChallengeHudView {
    if (lap.split !== null) {
      const flash = lap.split;
      if (flash.kind === 'sector') {
        this.splitLabel = flash.label;
        this.splitDelta = flash.delta;
        this.splitHold = CHALLENGE.splitHoldSeconds;
      } else if (flash.kind === 'lap') {
        // The lap time itself, because the number a rider crosses the line for
        // is the lap and not the delta — the delta is the second reading, in
        // the column beside it.
        this.splitLabel = `Lap ${formatRunTime(flash.seconds)}`;
        this.splitDelta = flash.delta;
        this.splitHold = TRACK_DAY.lapHoldSeconds;
      } else {
        // **Said once, at the line, and then let go.** The lap label has been
        // carrying "no time" for however long the lap had left; repeating it
        // here is the confirmation that the lap really has ended and the next
        // one is clean.
        this.splitLabel = VOID_LAP_FLASH;
        this.splitDelta = null;
        this.splitHold = TRACK_DAY.lapHoldSeconds;
      }
      this.splitSince = nowSeconds;
    }

    const holding = this.splitLabel !== '' && nowSeconds - this.splitSince < this.splitHold;
    const label = lap.phase === 'outLap'
      ? 'Out lap'
      : lap.valid ? `Lap ${lap.lap}` : `Lap ${lap.lap} · no time`;

    // **The bottom row never moves.** The time to beat is the number a rider
    // chasing a lap wants permanently in view, so nothing borrows its row —
    // the flash lands one row up, over `Last`, which is the row that can afford
    // to be interrupted because the value it holds is repeated on the card.
    const best = lap.bestLapSeconds === null
      ? { bestLabel: '', bestValue: '' }
      : { bestLabel: 'Best', bestValue: formatRunTime(lap.bestLapSeconds) };

    if (holding) {
      const delta = this.splitDelta;
      return {
        visible: true,
        lapLabel: label,
        ...best,
        time: formatRunTime(lap.elapsed),
        splitLabel: this.splitLabel,
        // A void lap has no delta to show and `Best` would be a lie, so the
        // column is empty and the label carries the whole message.
        splitDelta: this.splitLabel === VOID_LAP_FLASH
          ? ''
          : delta === null ? 'Best' : formatDelta(delta),
        ahead: this.splitLabel !== VOID_LAP_FLASH && (delta === null || Math.round(delta * 100) < 0),
      };
    }

    return {
      visible: true,
      lapLabel: label,
      ...best,
      time: formatRunTime(lap.elapsed),
      // Nothing yet means an empty row rather than a placeholder: a rider on
      // their first lap has no last lap, and inventing a dash for it would be
      // furniture.
      splitLabel: lap.lastLapSeconds === null ? '' : 'Last',
      splitDelta: lap.lastLapSeconds === null ? '' : formatRunTime(lap.lastLapSeconds),
      ahead: false,
    };
  }
}

function rank(warning: HudWarning): number {
  if (warning === 'tiltBack') return 3;
  if (warning === 'warn') return 2;
  if (warning === 'notice') return 1;
  return 0;
}
