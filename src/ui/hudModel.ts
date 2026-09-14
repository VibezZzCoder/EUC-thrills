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
 * How this seat's Trick Run is going — M38 Phase 2, `docs/PLANS.md` §38.6.
 *
 * **Absent in every other ride**, on `knockabout`'s and `match`'s own terms:
 * absent draws no lane, and a run in its first second draws a clock and a `0`
 * because those are the numbers a rider who has just started wants to see.
 *
 * **Keyed on the referee's phase rather than on a clock this file keeps**, so
 * a paused attempt keeps its numbers on screen: nothing here ages, and the one
 * value that does — `cueSecondsLeft` — is counted down by the referee in the
 * same fixed steps the run is measured in, which is what makes the award cue
 * freeze with the pause instead of expiring behind the menu (§38.6's
 * `TRICK_RUN.cueSeconds`, frozen with the run).
 *
 * **`score` is banked and `pendingPoints` is not, and the two never merge.**
 * A flight in the air has earned nothing yet — a wobble on touchdown halves it
 * and a crash forfeits it — so a lane that added them would be telling the
 * player they have a score they might not keep. They are separate fields here
 * and separate rows on the screen, and the pending one says the word.
 */
export interface TrickRunHudInput {
  readonly phase: 'running' | 'ended';
  readonly remainingSeconds: number;
  /** Banked only. Never the sum of banked and pending. */
  readonly score: number;
  /**
   * The comparable personal best, or null when there is none to compare with.
   *
   * Solo only: a couch seat and a probing/diagnostic run hand over null,
   * because a best is a fact about one rider's own venue record and four panes
   * each naming a different one is four scoreboards. Null is also a solo
   * rider's *first* attempt, which the lane says as "No best yet" — the two
   * cases are one field by agreement, and `game.css` is what keeps the row off
   * a split pane (see `.euc-hud__trick-best`).
   */
  readonly best: number | null;
  /** Unbanked, explicitly pending. Never added to `score`. */
  readonly pendingPoints: number;
  /** The flight that just landed, or null before anything has. */
  readonly lastAward: {
    readonly kinds: readonly ('charged-hop' | 'spin-landed' | 'one-foot-air')[];
    readonly landing: 'clean' | 'heavy' | 'wobble';
    readonly points: number;
    /**
     * The flight landed tricks and launched from no park feature — M38 q189.
     *
     * A flag rather than the feature's id, because the corner never names a
     * feature: the rule is *where you launched*, and the only reading the line
     * has to change is the one where the tricks were not paid for. False for a
     * flight that launched from a feature and false for a plain landing, which
     * had no trick points to lose.
     */
    readonly offFeature: boolean;
  } | null;
  /** Seconds of dwell left on that award line. `> 0` while it should show. */
  readonly cueSecondsLeft: number;
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
   * The race grid's count, seconds remaining — M27 Phase 3 (q88).
   *
   * Absent in every other ride *and* in a race that has already started, which
   * is the same distinction `knockabout` above draws: absent draws nothing,
   * and zero is the moment the room is released. Seconds rather than a
   * rendered number, because how a countdown is spelled is this layer's
   * business and how long is left is the referee's.
   */
  readonly countdown?: number;
  /**
   * How this seat's race is going — M27 Phase 4 (§27.4).
   *
   * Absent in every other ride, on `knockabout`'s and `match`'s terms: absent
   * draws no lane, and a race in its first metre draws `P1 / 4` and `Lap 1 / 3`
   * because those are the numbers a rider on a grid wants to see.
   *
   * **This seat's point of view**, exactly as `match` is: the lane belongs to
   * one person's quarter of the screen, and a scoreboard somebody has to work
   * out which end of is theirs is a scoreboard they look across the seam to
   * read (q80's argument, one mode along).
   */
  readonly race?: {
    readonly position: number;
    readonly seats: number;
    readonly lap: number;
    readonly laps: number;
    /** Seconds behind the leader, or null while nobody has finished. */
    readonly gapSeconds: number | null;
    /** True once this rider has crossed for the last time (q97). */
    readonly finished: boolean;
  };
  /**
   * How the couch match is going — M26 Phase 5, q80. Absent in every other
   * ride, and absent in single-player Knockabout.
   *
   * **Both scores, in every half, this seat's first.** q80's answer, and the
   * reason it is phrased that way rather than "Player 1 – Player 2": each half
   * belongs to one person, and a scoreboard they have to work out which end of
   * is theirs is a scoreboard they look across the divider to read. `seat` is
   * whose half this is; the lane is composed from their point of view.
   *
   * It takes precedence over `knockabout` above, because a match *is* a
   * Knockabout run and the discs it also counts are the side tally rather than
   * the thing on the line.
   */
  readonly match?: {
    readonly seat: number;
    readonly target: number;
    /**
     * Both tallies per seat — `MatchScore`'s own shape, handed over whole.
     *
     * **`discs` joined `knockdowns` on 2026-08-28, from the owner's couch
     * ride**: *"No feedback on Targets Struck. The only screen that shows
     * targets struck in 2p mode knockabout is the final screen after somebody
     * wins."* A side tally that can never win the match (q76) is still a thing
     * two people are competing over for the whole of it, and a score nobody can
     * see until it is settled is not a score anybody is playing for.
     */
    readonly scores: readonly { readonly knockdowns: number; readonly discs: number }[];
    /**
     * Who is fighting, in seat order — M37 §37.5. **Absent at two seats.**
     *
     * Presence is the switch between the two shapes this lane can take, and it
     * is a presence rather than a count because the rule is about what the
     * caller *knows*: a room that can name its riders gets the list, and a room
     * that cannot gets `matchTally`'s fold exactly as it has had it since M26.
     * §37.5 forbids the fold at three and four — `3 – 1 – 0 – 2` in the corner
     * of a quarter-pane is four unlabelled numbers — so the day the composition
     * root hands names over, the lane changes shape rather than growing terms.
     *
     * One entry per *participant*, so `riders.length` is the room and a seat
     * with no name in it is drawn as `Player N` rather than skipped.
     */
    readonly riders?: readonly string[];
    /**
     * Where the bout is, for the one announcement the room gets — M37 §37.5.
     *
     * Read only by `matchAnnounce`, and only when `riders` is present: a
     * two-seat lane announces nothing it did not announce at M26, and the
     * per-pane tally is deliberately not a live region at all (§37.5's "no
     * announcement storm"). Absent means "do not announce", which is what a
     * caller that does not know the phase should get.
     */
    readonly phase?: 'countdown' | 'running' | 'ended';
    /**
     * Who won, once `phase` is `ended`. Null is a draw (q86), and while the
     * bout runs it is *nobody yet* — which is why nothing here reads it without
     * reading `phase` first.
     */
    readonly winner?: number | null;
  };
  /**
   * How the chase is going — M18. Absent in every other ride.
   *
   * Absent rather than zeroed, exactly as `knockabout` is and for the same
   * reason. Three facts, because three is what the screen has to say: how long
   * is left (the whole mode), whether the rider is outside the route corridor
   * and on the clock for it, and whether the cop is close enough to be about to
   * swing. Everything else about the chase — his position, the record, the
   * outcome — belongs to the results card rather than to a lane the player
   * reads at 65 mph.
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
  /**
   * Absent in every ride but a Trick Run — M38 Phase 2, §38.6.
   *
   * **It takes the top-right corner outright**, which is the one precedence
   * rule this mode adds and the reason it is stated rather than left to
   * absence. A trick run is ridden at a lap-capable park (§36), so the ride it
   * is most likely to be handed alongside is a `trackDay`; two producers in the
   * `challenge` grid cell is what CSS resolves by stacking them silently on top
   * of each other, which is exactly the trap `ChallengeHudView`'s own comment
   * records. So `runLane` returns nothing at all while this is present, and
   * `modeLaneLabel`, `modeLane` and `modeSubLane` each answer this first —
   * ahead of the race, the chase, a match and Knockabout. The referees never
   * coexist, so no seat should ever exercise the order; a lane that is only
   * correct while nobody makes a mistake is not a lane, it is a convention.
   */
  readonly trickRun?: TrickRunHudInput;
}

/**
 * How a race grid's count is spelled — M27 Phase 3.
 *
 * `GO` rather than `0`, because zero is a number and this is an instruction —
 * and the ceiling rather than a round, so "3" is on screen for the whole of
 * the third second and the last thing a player sees before GO is "1".
 *
 * Absent means no countdown, which is every ride but a race about to start;
 * that distinction is the caller's and is drawn the way `modeLane` draws its
 * own (§14's "absent, not zeroed").
 */
function countdownLabel(input: HudInput): string {
  const seconds = input.countdown;
  if (seconds === undefined) return '';
  return seconds > 0 ? `${Math.ceil(seconds)}` : 'GO';
}

/**
 * One rider's line in a three- or four-seat bout's corner — M37 §37.5.
 *
 * Every field is already a string for the reason every other view field here
 * is one: the DOM does no arithmetic, so the number in the corner and the
 * number on the results card cannot disagree.
 *
 * **`you` is a boolean and `name` still carries the word.** §37.5 asks for the
 * current seat to be marked *"in text as well as colour"* — the flag is what
 * the stylesheet keys the emphasis off, and `ui/hud.ts` writes a literal
 * "You" beside the name so the cue survives a monochrome screen, a
 * forced-colours mode and a photograph of a television.
 */
export interface MatchRowView {
  /**
   * `P3 Trollina`, or `P3` for a seat with no roster name — and, on the row the
   * pane's own rider is in, the rider's name alone, because the "You" marker
   * beside it *is* that row's chair. The measurement behind both spellings is
   * in `matchRowViews` below.
   */
  readonly name: string;
  /** Whether this row is the pane's own rider. */
  readonly you: boolean;
  /** The tally that wins the bout. First in the row, and the largest type. */
  readonly knockdowns: string;
  /** The side tally that cannot (q76). Labelled where it is drawn. */
  readonly targets: string;
}

/** No rows. Frozen and shared: every ride but a wide bout allocates nothing. */
const NO_MATCH_ROWS: readonly MatchRowView[] = Object.freeze([]);

export interface HudView {
  /** Already rounded and ready to write. No units — the unit has its own element. */
  readonly speed: string;
  readonly speedUnit: SpeedUnit;
  /** True while the rider is travelling backwards, which the number cannot show. */
  readonly reversing: boolean;
  /** One line, top-centre. Empty means the lane is not drawn at all. */
  readonly objective: string;
  /**
   * The race count, already spelled — M27 Phase 3.
   *
   * Empty means no countdown is on screen, which is every ride but a race
   * about to start. `GO` rather than `0`, because zero is a number and this is
   * an instruction.
   */
  readonly countdown: string;
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
  /**
   * The small line *under* the mode lane's number — the owner's 2026-08-28
   * ride. Empty means it is not drawn, which is every ride but a couch match.
   *
   * **A second row rather than a second corner.** The two numbers a match is
   * played on are the knockdowns and the discs, they belong to the same two
   * people in the same order, and splitting them across the screen would make
   * a player read q80's "your number first" rule twice in two places. Under
   * the score, in smaller type, is what "below the knockdowns scores" meant.
   *
   * It is composed from the same fold as the lane above it, so the two rows
   * cannot disagree about whose number is first.
   */
  readonly modeSubLabel: string;
  readonly modeSub: string;
  /**
   * One row per rider in a three- or four-seat bout — M37 §37.5.
   *
   * **Empty at two seats and outside a match**, which is what keeps the M26
   * lane byte-identical: the fold above (`modeLabel`/`knockabout`/`modeSub`)
   * is still the whole of what a duel draws, and this list is still the whole
   * of what a wider room draws. The two shapes never appear together —
   * `modeLane` and `modeSubLane` answer empty whenever this is filled — so the
   * corner never prints a tally twice in two spellings.
   *
   * Seat order, not score order. §37.5: *"Keep rows in stable seat order"* —
   * a list that re-sorted itself as the fight swung would be four rows
   * changing places in the corner of somebody's eye at 65 mph, and the ranking
   * belongs to the room's own card (the idle quadrant) and to the results
   * table, both of which are read standing still.
   */
  readonly matchRows: readonly MatchRowView[];
  /**
   * How many targets the route carries, said **once** — M37 §37.5.
   *
   * Empty when there is no list to caption. The rows count each rider's own
   * discs; the field's total is a fact about the world, and repeating it on
   * every row would read as a per-rider quota, which §37.5 names as the
   * misreading to avoid.
   */
  readonly matchField: string;
  /**
   * The room's one polite announcement, or empty — M37 §37.5.
   *
   * **One sentence for the room, not one per pane.** `ui/hud.ts` writes this
   * into an element every pane carries but only one of them announces — seat 0,
   * the same pane that already owns the countdown — and it is composed so that
   * it changes only when the *lead* changes, when the leader reaches match point,
   * or when the bout ends. A knockdown that moves nobody to the front writes
   * nothing at all, which is how four panes and twelve directed pairs stay
   * inside §37.5's "duplicated live tallies must not produce an announcement
   * storm".
   *
   * Empty at two seats, on `matchRows`' terms: M26's lane announced nothing
   * and must go on announcing nothing.
   */
  readonly matchAnnounce: string;
  /** The Trick Run's extra rows in the mode lane — M38 Phase 2, §38.6. */
  readonly trickRun: TrickRunHudView;
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
 * never in the middle of the frame, and it does not exist at all below
 * `EUC.overspeedBeepShare` (0.785) of the derived top speed — **52 mph on the
 * shipped 65 mph wheel**. It is a share, not an absolute, so it keeps its place
 * in the range whatever wheel ships, including under a `?mph=` diagnostic: a
 * player who never goes near the top of it never sees it once.
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

/**
 * The Trick Run's own rows inside the mode lane — M38 Phase 2, §38.6.
 *
 * **Three of the mode's five facts are the lane's existing fold**: the label
 * over the corner (`modeLabel`), the banked score in the figure the Knockabout
 * tally and the chase clock already share (`knockabout`), and the clock in the
 * second row a couch match's discs opened (`modeSubLabel`/`modeSub`). Only what
 * has no home comes through here — the best, the pending total and the award
 * line — which is what keeps this mode from being a fourth shape the corner
 * has to switch between.
 *
 * Every field is a string, on this file's standing rule: the screen does no
 * arithmetic and no formatting, so the score in the corner and the score on
 * the results card cannot disagree about a thousands separator.
 */
export interface TrickRunHudView {
  readonly visible: boolean;
  /**
   * `Best 1,240`, or `No best yet`. Never empty while the lane is drawn.
   *
   * **One string rather than a label and a value**, unlike the lap lane's
   * `Best` row: the two states are different sentences rather than the same
   * sentence with a different number in it, and a label whose value is
   * sometimes a whole phrase is a row that has to be laid out twice.
   */
  readonly best: string;
  /**
   * `Pending +25`, or empty when nothing is in the air.
   *
   * **The word is in the string and not only in a stylesheet**, because the
   * whole job of this row is to say that the number beside it is not yet the
   * player's. A cue that carried the meaning in its dimness would lose it on
   * the results screenshot, in forced colours, and to anybody riding a bright
   * park in the afternoon.
   */
  readonly pending: string;
  /** `180 + One-foot`, or the landing's own words. Empty while no cue is up. */
  readonly awardLabel: string;
  /** `+448`. Empty exactly when `awardLabel` is. */
  readonly awardPoints: string;
}

const NO_STRAY: StrayHudView = Object.freeze({
  visible: false,
  label: '',
  arrow: '',
  seconds: '',
  fraction: 1,
  urgent: false,
});

/** The lane's extra rows, switched off. Frozen: every other ride allocates none. */
const NO_TRICK_RUN: TrickRunHudView = Object.freeze({
  visible: false,
  best: '',
  pending: '',
  awardLabel: '',
  awardPoints: '',
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
 * One tally of a couch match, from one seat's point of view — M26 Phase 5, q80.
 *
 * **This seat's number first, then everybody else's.** Written as a fold over
 * the other seats rather than as `scores[0]` and `scores[1]`, so the day a
 * four-player couch is measured (§26.7 says it has not been) this lane already
 * reads for whoever is looking at it instead of quietly naming two of four.
 *
 * An en dash with thin spaces either side, on `knockaboutLane`'s own argument:
 * `3 – 1` reads as a score at a glance where `3-1` reads as arithmetic.
 *
 * **`of` is the parameter that stopped this being one lane** — the owner's
 * 2026-08-28 ride put the disc tally on screen beside the knockdowns, and two
 * rows composed by two functions are two chances to disagree about which end
 * of the match a player is sitting at. One fold, read twice.
 */
function matchTally(
  match: NonNullable<HudInput['match']>,
  of: (score: { readonly knockdowns: number; readonly discs: number }) => number,
): string {
  const scores = match.scores;
  const mine = scores[match.seat] === undefined ? 0 : of(scores[match.seat]);
  const theirs = scores.filter((_, seat) => seat !== match.seat).map(of);
  if (theirs.length === 0) return `${mine}`;
  return [mine, ...theirs].join(' – ');
}

/**
 * One row per rider, in seat order — M37 §37.5.
 *
 * **The replacement for the fold at three and four, not an extension of it.**
 * `matchTally` above reads `3 – 1 – 0 – 2`, which §37.5 rules out for a wide
 * room in as many words: four unlabelled numbers in the corner of a 500×350
 * pane say nothing about who anybody is. So a room that hands its names over
 * gets rows with names on them, and a room that does not gets the duel's own
 * lane unchanged.
 *
 * Empty — and therefore drawing nothing — whenever `riders` is absent, which
 * is every two-seat match and every ride that is not a match at all.
 */
function matchRowViews(match: HudInput['match']): readonly MatchRowView[] {
  const riders = match?.riders;
  if (match === undefined || riders === undefined || riders.length === 0) return NO_MATCH_ROWS;
  return riders.map((rider, seat) => {
    const score = match.scores[seat];
    const you = seat === match.seat;
    // **The chair and the rider in it**, because a room reads the first to find
    // its own pane and the second to find its friend.
    //
    // **`P1`, not `Player 1`, and the abbreviation is a measurement.** A
    // 500x350 quadrant gives this list 37% of its width before it would reach
    // the pane's own playfield centre — 185 px at the couch's minimum window —
    // and the two figures take 44 of that. Spelled out, every roster name but
    // the shortest was cut to `Player 1 · Cool R…`; abbreviated, the whole of
    // every roster name fits, measured at the longest four the chooser reaches
    // (`tests/m37.spec.ts` asserts no row is truncated). The screens that are
    // read standing still — the room's card and the results table — carry the
    // full names and no abbreviation at all.
    //
    // **The pane's own row spends its chair on the marker instead.** The "You"
    // chip is 26 px of a 132 px name track, so a row carrying both it and `P1`
    // was the one row in the list that could not paint its rider's name: the
    // first build cut `P1 Wheel in Motion` to `P1 Whee…` in every pane, on the
    // row §37.5 most needs to be identifiable. `You` and `P1` answer the same
    // question on this pane — which of these four is me — so the row says it
    // once, and the other three panes still show this seat as `P1`.
    const name = rider === '' ? `P${seat + 1}` : you ? rider : `P${seat + 1} ${rider}`;
    return {
      name,
      you,
      knockdowns: `${score?.knockdowns ?? 0}`,
      targets: `${score?.discs ?? 0}`,
    };
  });
}

/**
 * The field's own total, said once under the rows — M37 §37.5.
 *
 * *"Show the field's total targets once, not as a misleading per-rider quota"*
 * — so it is a line of its own rather than an `of 17` glued to four different
 * riders' counts, which would read as four riders each chasing seventeen.
 *
 * Empty when the room is not drawing rows, and empty when the world has not
 * said how many it carries (the same refusal `modeSubLane` makes one lane up:
 * a fight is readable without knowing how much scenery is left).
 */
function matchFieldLine(input: HudInput): string {
  if (input.match?.riders === undefined) return '';
  const total = input.knockabout?.total;
  if (total === undefined) return '';
  return `${total} targets on the route`;
}

/**
 * The one sentence the room is told, or nothing — M37 §37.5.
 *
 * **Event-shaped, although it is computed from state every frame.** `ui/hud.ts`
 * diffs every write, so a string that is a pure function of the tallies and
 * only *changes* on a discrete event behaves exactly like an event stream and
 * needs no second clock to go stale against. The three things worth saying are
 * the three §37.5 names: who is in front, that somebody is one knockdown away,
 * and how it ended.
 *
 * What it deliberately does **not** say is every knockdown. At four seats a
 * single step can credit several attackers (q171, q173), and a region that
 * spoke each of them would be the announcement storm §37.5 forbids — so a
 * knockdown that moves nobody to the front changes this string not at all.
 *
 * Nil-nil is silence rather than "everybody leads": at 0/0/0 nobody is behind,
 * which is honest arithmetic (`MatchState.leaders`) and a useless thing to say
 * out loud.
 */
function matchAnnounce(match: HudInput['match']): string {
  const riders = match?.riders;
  if (match === undefined || riders === undefined || match.phase === undefined) return '';
  const nameOf = (seat: number): string => {
    const rider = riders[seat];
    return rider === undefined || rider === '' ? `Player ${seat + 1}` : rider;
  };
  if (match.phase === 'ended') {
    const winner = match.winner;
    return winner === null || winner === undefined ? 'Match drawn' : `${nameOf(winner)} wins`;
  }
  if (match.phase === 'countdown') return '';
  let best = 0;
  for (const score of match.scores) best = Math.max(best, score.knockdowns);
  if (best <= 0) return '';
  const leaders: number[] = [];
  for (let seat = 0; seat < riders.length; seat += 1) {
    if ((match.scores[seat]?.knockdowns ?? 0) === best) leaders.push(seat);
  }
  // **"and", not a comma, for the last pair** — the sentence is read aloud by a
  // screen reader and nothing else, so it is written to be heard.
  const names = leaders.map(nameOf);
  const who = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'leads' : 'lead';
  // Match point is the one state worth interrupting the arithmetic for, and it
  // is stated rather than implied: a room that has to subtract to notice
  // somebody is one swing from winning has not been told.
  const point = best === match.target - 1 ? ' — match point' : '';
  return `${who} ${verb} on ${best}${point}`;
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
  return formatDeadline(run.remaining);
}

/**
 * A deadline as `M:SS`, ceiled — the chase's spelling, shared with M38's run.
 *
 * **Ceiled rather than rounded**, which is what every countdown in the world
 * does and the opposite of `formatRunTime` a few rules up: a rounded deadline
 * shows `0:00` for half a second while the clock is still alive, and a player
 * looking at a zero has already stopped trying. Ceiling makes the number
 * reaching zero and the run ending the same instant.
 *
 * **Whole seconds rather than hundredths**, for the chase's own reason: a
 * measurement wants hundredths because two personal bests differ by them, and
 * a deadline that churned two more digits at 120 Hz in the corner of the eye
 * would be the standing annoyance rule arriving through a clock. Anything
 * non-finite or negative reads as `0:00`, because a `NaN:aN` deadline in the
 * corner of the frame is the kind of thing that ends a playtest.
 */
function formatDeadline(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const whole = Math.ceil(safe);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole - minutes * 60).padStart(2, '0')}`;
}

/**
 * A score, grouped in threes — M38 Phase 2.
 *
 * **Grouped by hand rather than by `toLocaleString`**, which would spell the
 * same run's score four ways on four machines and put a space, a dot or an
 * Eastern Arabic digit where the results card (whose own numbers come from
 * this layer) puts a comma. The screen's words are the screen's (`AGENTS.md`),
 * and a number the player is asked to compare against their own best has to be
 * spelled the same way every time it is drawn.
 *
 * Negative and non-finite read as `0`: no rule in `TRICK_RUN` can produce
 * either, which is precisely why the lane must not print one if something
 * upstream ever does.
 */
function formatPoints(points: number): string {
  const safe = Number.isFinite(points) && points > 0 ? Math.round(points) : 0;
  const digits = String(safe);
  let grouped = '';
  for (let index = 0; index < digits.length; index += 1) {
    const fromEnd = digits.length - index;
    grouped += digits[index];
    if (fromEnd > 1 && fromEnd % 3 === 1) grouped += ',';
  }
  return grouped;
}

/**
 * What each counted trick is called in one line of a corner — §38.6.
 *
 * **Short, because they are combined.** §38.6 asks for "180 + One-foot" rather
 * than a sentence, so each word is chosen to survive being joined to another
 * one: the spin is named by the angle a rider already says out loud, and the
 * one-foot air drops the noun the whole lane is about. The long forms belong
 * to the results card, which is read standing still and has room to explain
 * the bonus these labels deliberately do not mention.
 */
const TRICK_KIND_LABELS: Readonly<Record<'charged-hop' | 'spin-landed' | 'one-foot-air', string>> =
  Object.freeze({
    'charged-hop': 'Charged hop',
    'spin-landed': '180',
    'one-foot-air': 'One-foot',
  });

/**
 * The order the labels are joined in, and it is fixed rather than the caller's.
 *
 * A flight that scored a hop, a spin and a one-foot air reads the same way
 * every time it happens. Ordered by when the trick occurs in the flight — the
 * hop launches it, the spin is carried through it, the foot comes off in it —
 * so the line reads as the flight the player just rode rather than as whatever
 * order an observer happened to append its facts in.
 */
const TRICK_KIND_ORDER = ['charged-hop', 'spin-landed', 'one-foot-air'] as const;

/**
 * What a landing alone is called, when the flight had no trick in it.
 *
 * **A landing is the mode's floor, not a failure**, so all three are named the
 * same way and none of them is an instruction. §38.6 puts the *why* — the
 * multiplier, the forfeit, the bonus — on the results card; the corner says
 * what happened and what it was worth, which is the same rule that keeps the
 * max-speed pill saying `MAX SPEED` rather than "slow down" (`DESIGN.md` §9e).
 */
const LANDING_LABELS: Readonly<Record<'clean' | 'heavy' | 'wobble', string>> = Object.freeze({
  clean: 'Clean landing',
  heavy: 'Heavy landing',
  wobble: 'Wobble landing',
});

/**
 * The award line's words — M38 Phase 2, §38.6.
 *
 * **The tricks win the line, and the landing speaks only when there are none.**
 * A flight that scored a 180 and a one-foot air already has two things to say
 * in a corner read at speed, and the landing's quality is visible in the points
 * beside them and explained on the card. A flight that scored nothing but a
 * touchdown has one thing to say, and saying it is how a player learns that
 * landing clean is itself worth something.
 *
 * Deduplicated as well as ordered: one flight cannot score the same kind twice
 * (`TRICK_RUN.oneFootAirPoints` is "once per flight"), so a repeat is an
 * upstream fault and printing `One-foot + One-foot` would dress it as a score.
 *
 * **`off feature` is a qualifier on the tricks, not a fourth trick** — M38
 * q189, the owner's rule that trick points bank only on flights launched from
 * one of the park's nine features. The line still names what was ridden,
 * because the player *did* ride it and a corner that silently dropped the
 * words would read as a missed trick rather than as a rule; what follows it
 * says why the number beside it is only the landing's. Separated by a middle
 * dot rather than another ` + `, which is the join that means "and this too
 * scored". The feature is never named: the rule is *from a feature*, and a
 * player chasing eight ids in a corner is the progression §38.2 forbids.
 */
function trickAwardLabel(award: NonNullable<TrickRunHudInput['lastAward']>): string {
  const named = TRICK_KIND_ORDER.filter((kind) => award.kinds.includes(kind))
    .map((kind) => TRICK_KIND_LABELS[kind]);
  if (named.length === 0) return LANDING_LABELS[award.landing] ?? '';
  const tricks = named.join(' + ');
  return award.offFeature ? `${tricks} · off feature` : tricks;
}

/**
 * The lane's Trick Run rows at one reading — M38 Phase 2, §38.6.
 *
 * **No dwell of its own, and that is the difference between this cue and every
 * other one in this file.** The split, the warning and the stray banner all
 * hold themselves up against `nowSeconds`, because the events behind them
 * arrive on a single simulation step and vanish. This one is handed
 * `cueSecondsLeft` by the referee that owns the run's fixed-step clock, so the
 * cue freezes when the game pauses instead of ageing behind the pause menu —
 * which is §38.6's "keyed on the referee phase, so pause keeps the numbers
 * visible", and the reason `HudModel` gains no fourth timestamp.
 */
function trickRunView(run: TrickRunHudInput | undefined): TrickRunHudView {
  if (run === undefined) return NO_TRICK_RUN;
  // **Nothing is pending once the run is over**, whatever the referee's last
  // reading said: a flight still in the air at the bell has nowhere to land.
  const pending = run.phase === 'running' && run.pendingPoints > 0
    ? `Pending +${formatPoints(run.pendingPoints)}`
    : '';
  const award = run.lastAward !== null && run.cueSecondsLeft > 0 ? run.lastAward : null;
  return {
    visible: true,
    best: run.best === null ? 'No best yet' : `Best ${formatPoints(run.best)}`,
    pending,
    awardLabel: award === null ? '' : trickAwardLabel(award),
    awardPoints: award === null ? '' : `+${formatPoints(award.points)}`,
  };
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
function modeLaneLabel(
  input: Pick<HudInput, 'knockabout' | 'chase' | 'match' | 'race' | 'trickRun'>,
): string {
  // **The trick run before all of them** — M38 Phase 2, §38.6, and the reason
  // is on `HudInput.trickRun`: the referees never coexist, so the order is
  // never exercised, and a corner that is only correct while nobody makes a
  // mistake is a convention rather than a lane.
  //
  // **The label changes at the bell, because the number under it does.** While
  // the clock runs it names the mode a player may have pressed out of
  // curiosity; once the run has ended the same figure has stopped being a live
  // tally and become the thing the results card is about, and saying so is
  // what stops a frozen number reading as a HUD that has hung.
  if (input.trickRun !== undefined) {
    return input.trickRun.phase === 'ended' ? 'Final score' : 'Trick run';
  }
  // **The race first, because it is the only one of these that can be over
  // while the rider is still riding** (q97): a finished rider keeps their
  // position on screen under a banner, and a lane that went on counting laps
  // would be describing a race they are no longer in.
  if (input.race !== undefined) {
    return input.race.finished ? 'Finished' : `Lap ${input.race.lap} / ${input.race.laps}`;
  }
  if (input.chase !== undefined) return 'Survive';
  // **Ahead of `knockabout`**, because a match is a Knockabout run and the
  // discs are its side tally rather than the thing on the line — M26 Phase 5.
  // The label says whose number is first so the half never has to be counted
  // from the other end of the screen (q80).
  if (input.match !== undefined) {
    // **Three and four are a different sentence, not a longer one** — M37
    // §37.5. "You – them" names two ends of a fight and there are no two ends
    // at four; the label over a list of riders says what the column of numbers
    // beside their names is, and what it takes to win.
    return input.match.riders === undefined
      ? `You – them (to ${input.match.target})`
      : `Knockdowns · first to ${input.match.target}`;
  }
  if (input.knockabout !== undefined) return 'Targets';
  return '';
}

/**
 * Which of the two things this corner can be showing — M26 Phase 5.
 *
 * One place decides, so the label and the value cannot disagree about whether
 * this is a route being cleared or a fight being had. A method rather than a
 * free function only because it sits beside the other lane composers the view
 * is assembled from.
 */
function modeLane(input: HudInput): string {
  // **The banked score, and only the banked score** — §38.6. The headline
  // figure of a scoring mode is the number the player gets to keep; adding the
  // flight still in the air to it would be a total that can go *down* when a
  // wobble halves it, which is a scoreboard nobody can trust twice.
  if (input.trickRun !== undefined) return formatPoints(input.trickRun.score);
  if (input.race !== undefined) return positionLabel(input.race.position);
  if (input.match !== undefined) {
    // **The headline figure steps aside for the list** — M37 §37.5. A wide
    // room's numbers are on the rows, one per rider and each with a name in
    // front of it, so a fold printed above them would be the same tallies said
    // twice in two spellings. Empty, not zeroed: `ui/hud.ts` hides the figure
    // rather than drawing a blank line where it used to be.
    if (input.match.riders !== undefined) return '';
    return matchTally(input.match, (score) => score.knockdowns);
  }
  return knockaboutLane(input.knockabout);
}

/**
 * `1st`, `2nd`, `3rd`, `4th` — M27 Phase 4.
 *
 * An ordinal rather than `P2`, because the lane is one glance in a quarter of
 * a screen and "second" is the word a room says out loud. The general form is
 * here rather than a four-entry table for the same reason `guestBeside` is
 * derived: a fifth seat would silently print nothing from a table.
 */
function positionLabel(position: number): string {
  const tens = position % 100;
  if (tens >= 11 && tens <= 13) return `${position}th`;
  const ones = position % 10;
  if (ones === 1) return `${position}st`;
  if (ones === 2) return `${position}nd`;
  if (ones === 3) return `${position}rd`;
  return `${position}th`;
}

/** The second row, switched off. Frozen and shared: every ride but a match. */
const NO_SUB_LANE = Object.freeze({ label: '', value: '' });

/**
 * The row under the mode lane, and what it is called — the owner's 2026-08-28
 * ride.
 *
 * **Only a match has one, and only because a match has two things to count.**
 * A single-player Knockabout's discs are already the headline
 * (`knockaboutLane`), a chase counts one clock, and a lane whose second row was
 * sometimes a repeat of its first would be furniture rather than information.
 *
 * `Targets` is the single-player lane's own word for the same objects, so a
 * player who rode the mode alone first does not have to learn a second name for
 * the things they are knocking over. The count is **struck against placed**,
 * exactly as that lane says it — the two sides' scores are what the pair are
 * competing on, and the total is what tells them how much of the route is
 * left. Both go in one row: `1 – 10 of 17`.
 */
function modeSubLane(input: HudInput): { readonly label: string; readonly value: string } {
  // **The clock rides in the second row, under the score** — M38 Phase 2.
  // §38.6 wants remaining time, banked score and the best in one lane, and the
  // order is the mode's own argument: the score is the thing on the line, so it
  // keeps the corner's largest figure (§9j's rule, one mode along), and the
  // clock is the deadline the score is being chased against. `Time` names it
  // because a bare `1:23` under a score reads as a lap.
  //
  // **The row goes with the run rather than sitting at `0:00`.** Once the bell
  // has gone there is no time left to report, and a deadline frozen at zero
  // over a final score is a second number claiming to still be live.
  if (input.trickRun !== undefined) {
    return input.trickRun.phase === 'ended'
      ? NO_SUB_LANE
      : { label: 'Time', value: formatDeadline(input.trickRun.remainingSeconds) };
  }
  if (input.race !== undefined) {
    // **The live gap, and only once there is one to be behind.** Before the
    // leader finishes there is no number here that means anything — a gap
    // measured mid-lap is a distance dressed as a time — so the row says how
    // many people are in the race instead, which is the other thing a rider
    // glancing at a quarter-pane actually wants. Once the leader is home the
    // referee's gap is live for everybody: counting up for a rider still out,
    // frozen by their own crossing (QA repair, 2026-08-31 — it used to wait
    // for *this* rider's finish, so the promise above was never kept).
    //
    // `Winner` needs the finish as well as the zero: a rider still riding on
    // the leader's own step has a gap of zero and has won nothing.
    const gap = input.race.gapSeconds;
    if (gap === null) return { label: 'Riders', value: `${input.race.seats}` };
    if (input.race.finished && gap <= 0) return { label: 'Gap', value: 'Winner' };
    return { label: 'Gap', value: `+${Math.max(0, gap).toFixed(2)}` };
  }
  if (input.match === undefined) return NO_SUB_LANE;
  // **And the second row steps aside with the first** — M37 §37.5. The wide
  // room's discs are a column of the list (`matchRowViews`), and the field's
  // total is said once underneath it rather than as an `of 17` behind four
  // riders' counts, which would read as four riders each chasing seventeen.
  if (input.match.riders !== undefined) return NO_SUB_LANE;
  const struck = matchTally(input.match, (score) => score.discs);
  const total = input.knockabout?.total;
  return {
    label: 'Targets',
    value: total === undefined ? struck : `${struck} of ${total}`,
  };
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
      const down = modeSubLane(input);
      return {
        speed: formatSpeed(input.speed, this.speedUnit),
        speedUnit: this.speedUnit,
        reversing: false,
        objective: this.objectiveFor(input),
        countdown: countdownLabel(input),
        warning: 'none',
        warningLabel: '',
        offRoute: false,
        challenge: this.runLane(nowSeconds, input),
        knockabout: modeLane(input),
        chase: chaseLane(input.chase),
        modeLabel: modeLaneLabel(input),
        modeSubLabel: down.label,
        modeSub: down.value,
        // The wide room's rows survive a crash for the reason both lanes above
        // do: being knocked down is exactly the moment a player looks at the
        // scoreboard, and a list that blinked out then would be hiding the
        // answer to the question the fall just asked (M37 §37.5).
        matchRows: matchRowViews(input.match),
        matchField: matchFieldLine(input),
        matchAnnounce: matchAnnounce(input.match),
        // **And the trick run's rows survive a crash too**, on the tally's own
        // argument one mode along: falling off is exactly the moment a player
        // looks at what they had banked, and a lane that blinked out then would
        // hide the answer to the question the crash just asked. The referee is
        // what decides a crashed flight forfeits its pending points; this file
        // draws what it is handed and invents no forfeit of its own.
        trickRun: trickRunView(input.trickRun),
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

    const sub = modeSubLane(input);
    return {
      speed: formatSpeed(input.speed, this.speedUnit),
      speedUnit: this.speedUnit,
      reversing: input.speed < -0.1,
      objective: this.objectiveFor(input),
      countdown: countdownLabel(input),
      warning,
      warningLabel: WARNING_LABELS[warning],
      offRoute: this.offRoute,
      challenge: this.runLane(nowSeconds, input),
      knockabout: modeLane(input),
      chase: chaseLane(input.chase),
      modeLabel: modeLaneLabel(input),
      modeSubLabel: sub.label,
      modeSub: sub.value,
      matchRows: matchRowViews(input.match),
      matchField: matchFieldLine(input),
      matchAnnounce: matchAnnounce(input.match),
      trickRun: trickRunView(input.trickRun),
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
    input: Pick<HudInput, 'challenge' | 'trackDay' | 'chase' | 'race'>,
  ): string {
    // **The finished rider's banner** — q97. They keep riding, so the pane is
    // not dead; what changes is that the line above them names where they came
    // rather than what is left to do. It takes the objective lane because that
    // lane is already the one sentence the mode is allowed to say, and a race
    // that has ended for this rider has exactly one thing to tell them.
    // **The finished rider's banner** — q97. They keep riding, so the pane is
    // not dead; what changes is that the line above them names where they came
    // rather than what is left to do. It takes the objective lane because that
    // lane is already the one sentence the mode is allowed to say, and a race
    // that has ended for this rider has exactly one thing to tell them.
    if (input.race !== undefined && input.race.finished) {
      return `Finished — ${positionLabel(input.race.position)}`;
    }
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
    // **A trick run empties this lane rather than sharing it** — M38 Phase 2.
    // The mode is ridden at a lap-capable park, so a `trackDay` arriving beside
    // it is the plausible mistake, and both lanes draw into the same grid cell:
    // CSS resolves that by stacking them silently on top of each other. The
    // `challengeView(undefined)` call rather than a bare `NO_CHALLENGE` is the
    // same latch-clearing trick the `else` below is written for — a session
    // that ended mid-flash must not leave its delta on a corner the trick run
    // has taken over.
    if (input.trickRun !== undefined) return this.challengeView(nowSeconds, undefined);
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
