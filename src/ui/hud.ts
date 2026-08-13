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
 * The one live region is the warning line. It is `polite` rather than
 * `assertive` on purpose: a screen-reader user riding a hill should hear
 * "ease off" at the next natural break, not have it interrupt whatever they
 * were being told mid-word.
 */

const TEMPLATE = `
<div class="euc-hud__objective">
  <div class="euc-hud__objective-line" data-hud="objective"></div>
  <div class="euc-hud__off-route" data-hud="off-route" hidden>Off route</div>
</div>

<div class="euc-hud__score" data-hud="score" hidden>
  <span class="euc-hud__score-label" data-hud="score-label"></span>
  <span class="euc-hud__score-value" data-hud="score-value">0 / 0</span>
</div>

<div class="euc-hud__challenge" data-hud="challenge" hidden>
  <div class="euc-hud__timer" data-hud="timer">0:00.00</div>
  <div class="euc-hud__splits" data-hud="splits" data-ahead="false" hidden>
    <span class="euc-hud__split-label" data-hud="split-label"></span>
    <span class="euc-hud__split-delta" data-hud="split-delta"></span>
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
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly nodes: Record<string, HTMLElement> = {};
  private readonly options: HudOptions;

  /** What was last written, so nothing is written twice. */
  private lastSpeed = '';
  private lastUnit = '';
  private lastReverse = false;
  private lastObjective = '';
  private lastModeLabel = '';
  private lastKnockabout = '';
  private lastWarningLabel = '';
  private lastWarningLevel = '';
  private lastOffRoute = false;
  private lastPrompt = '';
  private lastChallengeVisible = false;
  private lastRunTime = '';
  private lastSplitLabel = '';
  private lastSplitDelta = '';
  private lastSplitAhead = '';

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
      this.nodes.score.hidden = lane === '';
      this.lastKnockabout = lane;
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

    this.writeChallenge(view.challenge);
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
  }

  dispose(): void {
    this.nodes['prompt-dismiss']?.removeEventListener('click', this.onDismiss);
    this.root.remove();
  }

  private readonly onDismiss = (): void => {
    this.options.onDismissPrompt?.();
  };
}
