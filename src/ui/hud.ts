/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { HudView } from './hudModel.ts';

/**
 * The HUD's DOM — `docs/PLANS.md` §8.1.
 *
 * **This file writes values and toggles attributes. It never lays out and
 * never measures.** Every position, size, and lane is in `game.css`; every
 * decision about *what* to show is in `hudModel.ts`. What is left here is the
 * narrow job of getting a computed view into the document, and it is written
 * to do that as cheaply as possible:
 *
 *   - **The skeleton is parsed once**, from a static template, at construction.
 *     Per-frame work is `textContent` and `hidden`, never element creation.
 *   - **Every write is diffed against the last one.** Assigning the same
 *     string to `textContent` still dirties the node in most engines, and this
 *     runs sixty times a second forever; the speed value and — inside a timed
 *     run — the clock change often, the other nine things almost never.
 *   - **Nothing here reads the DOM.** A layout read in the frame loop is the
 *     classic way a UI layer starts costing milliseconds it does not look like
 *     it should cost.
 *
 * The warning line is `polite` rather than `assertive` on purpose: a
 * screen-reader user riding a hill should hear "ease off" at the next natural
 * break, not have it interrupt whatever they were being told mid-word.
 *
 * **Which elements here speak, and why it is a short list** — M37 §37.5, which
 * asks for *"a single announcer for the shared countdown/results"* and warns
 * that *"duplicated live tallies must not produce an announcement storm"*.
 * Four panes multiply every live region by four, so:
 *
 *   - the **countdown** is `assertive` and exists on every pane but carries the
 *     attribute on exactly one (`HudOptions.announcesCountdown`) — one clock,
 *     one voice, since M27 Phase 3;
 *   - the **match status** (M37) is `polite`, is off screen, and carries its
 *     attributes on the same single pane for the same reason. It is written
 *     only when the lead changes, at match point and at the end, because
 *     `hudModel.matchAnnounce` changes only then;
 *   - the **per-rider tally list** (M37) is **not a live region at all**. It
 *     changes on every knockdown in a room of up to four, and a region that
 *     spoke it would read four rows aloud four times over.
 */

const TEMPLATE = `
<div class="euc-hud__count" data-hud="count" role="status" aria-live="assertive" hidden></div>
<div class="euc-hud__objective">
  <div class="euc-hud__stray" data-hud="stray" data-urgent="false" role="status"
       aria-live="polite" hidden>
    <span class="euc-hud__stray-arrow" data-hud="stray-arrow" aria-hidden="true"></span>
    <span class="euc-hud__stray-label" data-hud="stray-label">Back to the route</span>
    <span class="euc-hud__stray-count" data-hud="stray-count">0</span>
    <span class="euc-hud__stray-bar" aria-hidden="true"><i data-hud="stray-bar"></i></span>
  </div>
  <div class="euc-hud__overspeed" data-hud="overspeed" data-level="none" hidden>
    <span class="euc-hud__overspeed-glyph" aria-hidden="true">&#9888;&#65039;</span>
    <span data-hud="overspeed-label"></span>
  </div>
  <div class="euc-hud__objective-line" data-hud="objective"></div>
  <div class="euc-hud__off-route" data-hud="off-route" hidden>Off route</div>
</div>

<div class="euc-hud__score" data-hud="score" hidden>
  <span class="euc-hud__score-label" data-hud="score-label"></span>
  <span class="euc-hud__score-value" data-hud="score-value">0 / 0</span>
  <span class="euc-hud__score-aside" data-hud="score-aside" hidden>
    <span class="euc-hud__score-aside-label" data-hud="score-aside-label"></span>
    <span class="euc-hud__score-aside-value" data-hud="score-aside-value"></span>
  </span>
  <span class="euc-hud__tally-head" data-hud="tally-head" aria-hidden="true" hidden>targets</span>
  <ol class="euc-hud__tally" data-hud="tally" hidden></ol>
  <span class="euc-hud__tally-field" data-hud="tally-field" hidden></span>
</div>

<div class="euc-hud__match-status" data-hud="match-status" role="status"
     aria-live="polite"></div>

<div class="euc-hud__challenge" data-hud="challenge" hidden>
  <div class="euc-hud__lap" data-hud="lap-label"></div>
  <div class="euc-hud__timer" data-hud="timer">0:00.00</div>
  <div class="euc-hud__splits" data-hud="splits" data-ahead="false" hidden>
    <span class="euc-hud__split-label" data-hud="split-label"></span>
    <span class="euc-hud__split-delta" data-hud="split-delta"></span>
  </div>
  <div class="euc-hud__splits euc-hud__splits--best" data-hud="lap-best" hidden>
    <span class="euc-hud__split-label" data-hud="lap-best-label"></span>
    <span class="euc-hud__split-delta" data-hud="lap-best-value"></span>
  </div>
</div>

<div class="euc-hud__speed">
  <span class="euc-hud__speed-value" data-hud="speed">0</span>
  <span class="euc-hud__speed-unit" data-hud="unit">km/h</span>
  <span class="euc-hud__reverse" data-hud="reverse" hidden>Reverse</span>
</div>

<div class="euc-hud__cues">
  <div class="euc-hud__warning" data-hud="warning" role="status" aria-live="polite" hidden></div>
  <div class="euc-hud__prompt" data-hud="prompt" hidden>
    <span data-hud="prompt-text"></span>
    <button type="button" class="euc-hud__prompt-dismiss" data-hud="prompt-dismiss"
            aria-label="Dismiss this hint">&times;</button>
  </div>
</div>
`;

const UNIT_LABELS = Object.freeze({ kph: 'km/h', mph: 'mph' });

export interface HudOptions {
  /** The player pressed the prompt's dismiss button. */
  onDismissPrompt?(): void;
  /** Where to mount. Injected so a test can hand in a detached container. */
  parent?: HTMLElement;
  /**
   * Whether this HUD's countdown is announced to assistive tech.
   *
   * **True for exactly one pane of a couch** — the first seat's, chosen by the
   * composition root. Every pane *shows* the countdown, but four
   * `aria-live="assertive"` regions changing on the same step would have a
   * screen reader announce "3" four times over itself (QA repair, 2026-08-31).
   * The room shares one clock, so it gets one voice. Defaults true: a solo
   * HUD, and every test that mounts one directly, is the announcing one.
   */
  announcesCountdown?: boolean;
}

export class Hud {
  /**
   * This HUD's own root.
   *
   * Public since M25 Phase 3 so the composition root can find the container it
   * was mounted into and take both away together when a rider leaves. Still
   * write-only from outside in practice: everything that changes what the HUD
   * *says* goes through the methods below.
   */
  readonly root: HTMLDivElement;
  private readonly nodes: Record<string, HTMLElement> = {};
  private readonly options: HudOptions;

  /** What was last written, so nothing is written twice. */
  private lastSpeed = '';
  private lastUnit = '';
  private lastReverse = false;
  private lastObjective = '';
  private lastModeLabel = '';
  private lastKnockabout = '';
  private lastModeSubLabel = '';
  private lastModeSub = '';
  private lastWarningLabel = '';
  private lastWarningLevel = '';
  private lastOffRoute = false;
  private lastCountdown = '';
  private lastPrompt = '';
  private lastStrayVisible = false;
  private lastStrayArrow = '';
  private lastStrayCount = '';
  private lastStrayFraction = '';
  private lastStrayUrgent = '';
  private lastOverspeedLabel = '';
  private lastOverspeedLevel = '';
  private lastOverspeedPulse = '';
  private lastChallengeVisible = false;
  private lastLapLabel = '';
  private lastBestLabel = '';
  private lastBestValue = '';
  private lastRunTime = '';
  private lastSplitLabel = '';
  private lastSplitDelta = '';
  private lastSplitAhead = '';
  /** The tally list, diffed on one composed key — M37 §37.5. */
  private lastTally = '';
  private lastTallyField = '';
  private lastScoreHidden = true;
  /** The template ships the figure visible, so the diff starts from that. */
  private lastValueHidden = false;
  private lastAnnounce = '';

  constructor(options: HudOptions = {}) {
    this.options = options;

    const root = document.createElement('div');
    root.className = 'euc-hud euc-ui';
    root.hidden = true;
    root.innerHTML = TEMPLATE;

    for (const node of root.querySelectorAll<HTMLElement>('[data-hud]')) {
      const name = node.dataset.hud;
      if (name !== undefined) this.nodes[name] = node;
    }

    this.nodes['prompt-dismiss']?.addEventListener('click', this.onDismiss);

    // A pane that is not the room's announcer still *shows* the count — the
    // attribute comes off, the element stays (see `HudOptions`).
    if (options.announcesCountdown === false) {
      this.nodes.count.removeAttribute('aria-live');
      this.nodes.count.removeAttribute('role');
      // **The same rule, and the same single pane, for M37's match status.**
      // One room, one polite voice: a bout's lead changing is a fact about the
      // room rather than about a quarter of the screen, so three more copies of
      // it would say the same sentence four times over. The element stays on
      // every pane — it is a millimetre of nothing, and a HUD whose DOM depends
      // on which seat it is would be a second shape to keep in step.
      this.nodes['match-status'].removeAttribute('aria-live');
      this.nodes['match-status'].removeAttribute('role');
    }

    (options.parent ?? document.body).appendChild(root);
    this.root = root;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /**
   * Move the lanes off the bottom of the frame, because thumbs are there.
   *
   * One attribute; the stylesheet owns every consequence of it. Both lanes it
   * moves are bottom-anchored — the speed under the steering hand, the warnings
   * and prompts under the drive hand — and a cue nobody can see is a cue that
   * may as well not exist.
   */
  setTouchLayout(active: boolean): void {
    const value = active ? 'true' : 'false';
    if (this.root.dataset.touch === value) return;
    this.root.dataset.touch = value;
  }

  /**
   * Which half of a split screen this HUD is, or `null` for the whole of it —
   * M25 Phase 3.
   *
   * Written onto the HUD root **and** onto the container it was mounted into,
   * because both need it: the container is what becomes half-width, and the
   * HUD is what has to re-grid its lanes inside that half. One attribute each,
   * and `game.css` owns every consequence — the same rule `setTouchLayout`
   * above follows, and the reason neither method measures anything.
   *
   * **Not a media query, and this is the whole point of the attribute.** An
   * `@media (max-width: 34rem)` rule measures the window, which stays
   * desktop-wide while each pane is 500 px — so the objective-versus-clock
   * collision that rule exists to prevent would silently return inside both
   * halves of every split frame.
   *
   * **`row` is M27 Phase 1's second axis.** Three or four seats are a 2x2 grid
   * (`shared/paneGrid.ts`), so a pane is a side *and* a row; two halves pass
   * `null` and keep every rule they had, which is what makes a two-seat frame
   * the frame Contract 2 was measured on. The horizontal treatment is shared
   * deliberately — a quadrant is exactly as wide as a half, so `--hud-vw` is
   * already right for it and only the box changes.
   */
  setSplit(side: 'left' | 'right' | null, row: 'top' | 'bottom' | null = null): void {
    const value = side ?? 'none';
    const rowValue = side === null ? 'none' : row ?? 'none';
    // **Both halves of the answer, or neither.** The early return used to test
    // the side alone, which was complete while a pane could only be a half;
    // a pane that keeps its side and changes its row — seat 1 when a third
    // player sits down — would have kept the full-height geometry and drawn
    // its lanes over the rider below it.
    if (this.root.dataset.split === value && this.root.dataset.row === rowValue) return;
    this.root.dataset.split = value;
    this.root.dataset.row = rowValue;
    const container = this.root.parentElement;
    if (container === null) return;
    container.dataset.split = side === null ? 'false' : 'true';
    container.dataset.side = value;
    container.dataset.row = rowValue;
  }

  setVisible(visible: boolean): void {
    // The stylesheet carries an explicit `[hidden] { display: none }` rule for
    // every element this layer hides, because the UA rule loses to any
    // `display` a class sets — the trap `ui/notice.ts` records having cost a
    // Playwright run.
    this.root.hidden = !visible;
  }

  /**
   * Write one frame of HUD.
   *
   * `promptText` is empty for "no prompt", rather than a second nullable
   * parameter, because the caller already has a string and an empty one is
   * exactly what "nothing to say" looks like everywhere else in this layer.
   */
  update(view: HudView, promptText: string): void {
    if (view.speed !== this.lastSpeed) {
      this.nodes.speed.textContent = view.speed;
      this.lastSpeed = view.speed;
    }

    const unit = UNIT_LABELS[view.speedUnit];
    if (unit !== this.lastUnit) {
      this.nodes.unit.textContent = unit;
      this.lastUnit = unit;
    }

    if (view.reversing !== this.lastReverse) {
      this.nodes.reverse.hidden = !view.reversing;
      this.lastReverse = view.reversing;
    }

    // The Knockabout score — M14. Written on change only, like everything else
    // here: the HUD is repainted every frame and a `textContent` write that did
    // not change anything is still a layout invalidation.
    // One corner, two modes, one writer. A ride is Knockabout or a chase and
    // never both (M18), so the lane shows whichever is live rather than each
    // mode owning an element that the other has to remember to hide.
    const lane = view.chase !== '' ? view.chase : view.knockabout;
    if (view.modeLabel !== this.lastModeLabel) {
      this.nodes['score-label'].textContent = view.modeLabel;
      this.lastModeLabel = view.modeLabel;
    }
    if (lane !== this.lastKnockabout) {
      this.nodes['score-value'].textContent = lane;
      this.lastKnockabout = lane;
    }
    this.writeTally(view, lane);
    // The second row under it — the owner's 2026-08-28 ride, and a couch match
    // is the only ride that has one. Two writes rather than one composed
    // string, because the label is set-and-forget for a whole match while the
    // count moves: the diff is what keeps the row free in every other mode, and
    // the whole row is `hidden` there rather than merely empty, so it costs no
    // grid line either.
    if (view.modeSubLabel !== this.lastModeSubLabel) {
      this.nodes['score-aside-label'].textContent = view.modeSubLabel;
      this.nodes['score-aside'].hidden = view.modeSubLabel === '';
      this.lastModeSubLabel = view.modeSubLabel;
    }
    if (view.modeSub !== this.lastModeSub) {
      this.nodes['score-aside-value'].textContent = view.modeSub;
      this.lastModeSub = view.modeSub;
    }

    if (view.objective !== this.lastObjective) {
      this.nodes.objective.textContent = view.objective;
      this.lastObjective = view.objective;
    }

    if (view.warningLabel !== this.lastWarningLabel) {
      this.nodes.warning.textContent = view.warningLabel;
      this.nodes.warning.hidden = view.warningLabel === '';
      this.lastWarningLabel = view.warningLabel;
    }
    if (view.warning !== this.lastWarningLevel) {
      // The level drives the colour, which comes from the same four values as
      // the light on the back of the wheel (`DESIGN.md` §6c).
      this.nodes.warning.dataset.level = view.warning;
      this.lastWarningLevel = view.warning;
    }

    if (view.offRoute !== this.lastOffRoute) {
      this.nodes['off-route'].hidden = !view.offRoute;
      this.lastOffRoute = view.offRoute;
    }

    if (promptText !== this.lastPrompt) {
      this.nodes['prompt-text'].textContent = promptText;
      this.nodes.prompt.hidden = promptText === '';
      this.lastPrompt = promptText;
    }

    if (view.countdown !== this.lastCountdown) {
      // **Its own element, centred, hidden when empty** — M27 Phase 3. It is
      // outside the lane grid because a countdown is not a lane: it is the one
      // moment in the mode when the room should be looking at the middle of
      // their own pane rather than at a corner of it.
      //
      // `aria-live="assertive"` and not `polite`, uniquely on this element:
      // every other cue here reports a state a player can read when they get
      // to it, and this one is an instruction with a deadline. On a couch only
      // the first seat's pane carries the attribute at all — one shared clock,
      // one voice (`HudOptions.announcesCountdown`).
      this.nodes.count.textContent = view.countdown;
      this.nodes.count.hidden = view.countdown === '';
      this.lastCountdown = view.countdown;
    }

    this.writeStray(view.stray);
    this.writeOverspeed(view.overspeed);
    this.writeChallenge(view.challenge);
  }

  /**
   * The per-rider tally, the field's total, and the room's one announcement —
   * M37 §37.5.
   *
   * **One composed key for the whole list**, `IdlePane.setCard`'s rule rather
   * than the per-cell diffs above it: a list is rebuilt with `createElement`,
   * a match changes it a handful of times in several minutes, and a per-cell
   * diff over four rows would be twelve string compares a frame to save an
   * allocation that happens twice a minute. The key carries every field that
   * is written, so a row that changes only its "You" marker still redraws.
   *
   * `textContent` per node rather than one `innerHTML`, for `IdlePane`'s
   * reason one surface along: a rider's name is data.
   *
   * `lane` is the duel's own figure, handed over rather than recomposed: the
   * corner's visibility depends on both shapes, and two expressions deciding
   * which mode this corner is in are two expressions that can disagree.
   */
  private writeTally(view: HudView, lane: string): void {
    const rows = view.matchRows;
    const key = rows.map((row) => `${row.name}|${row.you}|${row.knockdowns}|${row.targets}`)
      .join('\n');
    if (key !== this.lastTally) {
      this.lastTally = key;
      this.nodes.tally.hidden = rows.length === 0;
      // The column caption lives and dies with the column it names.
      this.nodes['tally-head'].hidden = rows.length === 0;
      this.nodes.tally.replaceChildren(...rows.map((row) => {
        const line = document.createElement('li');
        line.className = 'euc-hud__tally-row';
        // The emphasis the stylesheet keys off. The *word* is written below,
        // because §37.5 asks for the current seat to be marked in text as well
        // as colour and a data attribute is not text.
        line.dataset.you = row.you ? 'true' : 'false';

        // **One cell for who this is**, so the marker and the name share a
        // track and every row's figures line up whether or not the marker is
        // there. The marker goes *first* inside it for two reasons: an ellipsis
        // cuts from the tail, so a "You" at the tail would be the first thing
        // lost — and it stands exactly where the other rows print their chair,
        // which is the chair this row spends on it (`ui/hudModel.ts`).
        const who = document.createElement('span');
        who.className = 'euc-hud__tally-who';
        if (row.you) {
          const you = document.createElement('span');
          you.className = 'euc-hud__tally-you';
          you.textContent = 'You';
          who.appendChild(you);
        }
        const name = document.createElement('span');
        name.className = 'euc-hud__tally-name';
        name.textContent = row.name;
        who.appendChild(name);
        line.appendChild(who);

        const knockdowns = document.createElement('span');
        knockdowns.className = 'euc-hud__tally-kos';
        knockdowns.textContent = row.knockdowns;
        line.appendChild(knockdowns);

        // The subordinate count, and its word for a screen reader only.
        //
        // **§9j's "the label sits beside the number" is a rule about *one*
        // row.** Printed on four, the word `targets` cost 36 px of a 134 px
        // name track — a quarter of the list's width spent saying one thing
        // four times — and that width is the difference between a roster name
        // painted whole and a roster name cut to `P1 Whee…`. So the word is
        // drawn once, in the caption over this column (`tally-head`), and the
        // per-row copy stays in the DOM at 1 px: a row read aloud is still
        // "P2 Seal on a Wheel, 4, 7 targets", because a screen reader does not
        // get to see which column a figure is under.
        const targets = document.createElement('span');
        targets.className = 'euc-hud__tally-targets';
        const count = document.createElement('span');
        count.className = 'euc-hud__tally-count';
        count.textContent = row.targets;
        const unit = document.createElement('span');
        unit.className = 'euc-hud__tally-unit';
        unit.textContent = 'targets';
        targets.appendChild(count);
        targets.appendChild(unit);
        line.appendChild(targets);

        return line;
      }));
    }

    if (view.matchField !== this.lastTallyField) {
      this.nodes['tally-field'].textContent = view.matchField;
      this.nodes['tally-field'].hidden = view.matchField === '';
      this.lastTallyField = view.matchField;
    }

    // **The figure hides with its own text, and the box no longer does.** Until
    // M37 the corner was exactly this one number, so "no number" and "no
    // corner" were the same boolean and one write served both. A three- or
    // four-seat bout draws a list instead of a headline (§37.5), so the box is
    // shown whenever *either* shape has something in it and the figure carries
    // its own `hidden`.
    //
    // **Both booleans are diffed here rather than inside the lane's own diff**,
    // which is where the first attempt put the figure's: a wide bout's lane is
    // empty from the first frame to the last, so a write guarded on the lane
    // *changing* never ran at all and the template's own `0 / 0` sat over the
    // list. Nothing about the duel moves either way — its lane is non-empty for
    // the whole of a match.
    if ((lane === '') !== this.lastValueHidden) {
      this.lastValueHidden = lane === '';
      this.nodes['score-value'].hidden = this.lastValueHidden;
    }
    const hidden = lane === '' && rows.length === 0;
    if (hidden !== this.lastScoreHidden) {
      this.nodes.score.hidden = hidden;
      this.lastScoreHidden = hidden;
    }

    // **Diffed like everything else, which is what makes it event-shaped.**
    // `matchAnnounce` is a pure function of the tallies that changes only when
    // the lead moves, at match point and at the end, so an unchanged sentence
    // is never re-announced and a knockdown that settles nothing is silent.
    if (view.matchAnnounce !== this.lastAnnounce) {
      this.nodes['match-status'].textContent = view.matchAnnounce;
      this.lastAnnounce = view.matchAnnounce;
    }
  }

  /**
   * The out-of-bounds banner — M20, §4.4.
   *
   * Five writes behind one visibility check, on the challenge lane's own
   * pattern: the banner is absent for the whole of every ride but a chase, and
   * for almost all of a chase, so it must cost one boolean compare there.
   *
   * **The bar is the one place this file writes a length**, and it does it the
   * way `game.css` permits — a custom property the stylesheet turns into a
   * width. Script still measures nothing and lays nothing out; it hands over a
   * number between 0 and 1 and the geometry belongs to the sheet.
   */
  private writeStray(stray: HudView['stray']): void {
    if (stray.visible !== this.lastStrayVisible) {
      this.nodes.stray.hidden = !stray.visible;
      this.lastStrayVisible = stray.visible;
    }
    if (!stray.visible) return;

    if (stray.arrow !== this.lastStrayArrow) {
      this.nodes['stray-arrow'].textContent = stray.arrow;
      this.lastStrayArrow = stray.arrow;
    }
    if (stray.seconds !== this.lastStrayCount) {
      this.nodes['stray-count'].textContent = stray.seconds;
      this.lastStrayCount = stray.seconds;
    }
    // Quantised to a percent before the diff, because the fraction changes
    // every frame and the string it becomes does not.
    const fraction = `${Math.round(stray.fraction * 100)}`;
    if (fraction !== this.lastStrayFraction) {
      this.nodes['stray-bar'].style.setProperty('--stray-left', `${fraction}%`);
      this.lastStrayFraction = fraction;
    }
    const urgent = stray.urgent ? 'true' : 'false';
    if (urgent !== this.lastStrayUrgent) {
      this.nodes.stray.dataset.urgent = urgent;
      this.lastStrayUrgent = urgent;
    }
  }

  /**
   * The max-speed glyph — M20.
   *
   * `--beep-period` is the second and last custom property this layer writes,
   * and it carries the beep rate into the CSS animation so the blink and the
   * sound stay in step. Quantised to 10 ms before the diff: the underlying
   * period changes continuously with speed, and restarting a CSS animation
   * sixty times a second would make it hold still.
   */
  private writeOverspeed(overspeed: HudView['overspeed']): void {
    if (overspeed.label !== this.lastOverspeedLabel) {
      this.nodes['overspeed-label'].textContent = overspeed.label;
      this.nodes.overspeed.hidden = !overspeed.visible;
      this.lastOverspeedLabel = overspeed.label;
    }
    if (!overspeed.visible) return;

    if (overspeed.level !== this.lastOverspeedLevel) {
      this.nodes.overspeed.dataset.level = overspeed.level;
      this.lastOverspeedLevel = overspeed.level;
    }
    const pulse = `${Math.round(overspeed.pulseSeconds * 100) / 100}s`;
    if (pulse !== this.lastOverspeedPulse) {
      this.nodes.overspeed.style.setProperty('--beep-period', pulse);
      this.lastOverspeedPulse = pulse;
    }
  }

  /**
   * The top-right lane: run clock and the split that just landed.
   *
   * **The whole block is behind a visibility check**, because free ride is most
   * of the game and this must cost one boolean compare there rather than four
   * string compares. Inside a run the timer is the second thing on the HUD that
   * changes nearly every frame — the speed is the first — and it is still
   * diffed, so a paused game and a stationary rider both write nothing.
   *
   * Ahead/behind travels as a data attribute rather than a class for the same
   * reason the warning level does: one attribute write replaces a class
   * add/remove pair, and the stylesheet can key off both states plus the
   * neither-of-them default without the script knowing any of the three.
   */
  private writeChallenge(challenge: HudView['challenge']): void {
    if (challenge.visible !== this.lastChallengeVisible) {
      this.nodes.challenge.hidden = !challenge.visible;
      this.lastChallengeVisible = challenge.visible;
    }
    if (!challenge.visible) return;

    if (challenge.lapLabel !== this.lastLapLabel) {
      this.nodes['lap-label'].textContent = challenge.lapLabel;
      // Hidden rather than left empty, so its own bottom margin goes with it —
      // which is what keeps a time trial's lane pixel-identical to the one it
      // had before Track Day existed. `:empty` would do the same and would
      // also fire on the frame between two labels; a boolean the diff already
      // owns cannot.
      this.nodes['lap-label'].hidden = challenge.lapLabel === '';
      this.lastLapLabel = challenge.lapLabel;
    }

    if (challenge.time !== this.lastRunTime) {
      this.nodes.timer.textContent = challenge.time;
      this.lastRunTime = challenge.time;
    }

    if (challenge.splitLabel !== this.lastSplitLabel) {
      this.nodes['split-label'].textContent = challenge.splitLabel;
      // The row is hidden rather than emptied, so the delta beside the label
      // goes with it. The stylesheet carries an explicit
      // `[hidden] { display: none }` for it, because this row sets a `display`
      // of its own and the UA rule loses to any class that does.
      this.nodes.splits.hidden = challenge.splitLabel === '';
      this.lastSplitLabel = challenge.splitLabel;
    }

    if (challenge.splitDelta !== this.lastSplitDelta) {
      this.nodes['split-delta'].textContent = challenge.splitDelta;
      this.lastSplitDelta = challenge.splitDelta;
    }

    const ahead = challenge.ahead ? 'true' : 'false';
    if (ahead !== this.lastSplitAhead) {
      this.nodes.splits.dataset.ahead = ahead;
      this.lastSplitAhead = ahead;
    }

    // The bottom row. Hidden by its label for the row above's reason: hiding
    // the row takes the value beside it with it, and an empty label with a
    // number next to it reads as a bug.
    if (challenge.bestLabel !== this.lastBestLabel) {
      this.nodes['lap-best-label'].textContent = challenge.bestLabel;
      this.nodes['lap-best'].hidden = challenge.bestLabel === '';
      this.lastBestLabel = challenge.bestLabel;
    }
    if (challenge.bestValue !== this.lastBestValue) {
      this.nodes['lap-best-value'].textContent = challenge.bestValue;
      this.lastBestValue = challenge.bestValue;
    }
  }

  dispose(): void {
    this.nodes['prompt-dismiss']?.removeEventListener('click', this.onDismiss);
    this.root.remove();
  }

  private readonly onDismiss = (): void => {
    this.options.onDismissPrompt?.();
  };
}
