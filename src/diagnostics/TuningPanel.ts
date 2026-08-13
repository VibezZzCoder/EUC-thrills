/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LiveTuning } from '../data/liveTuning.ts';
import { ensureDiagnosticStyles } from './panelStyles.ts';

/**
 * The tuning panel: change a constant while the game runs.
 *
 * The second half of the M1 exit question — *can I change a constant without a
 * rebuild?* Every control here is generated from `LIVE_TUNABLES`, so adding a
 * tunable is one entry in `tuning.ts` and nothing else; there is no list of
 * sliders to keep in sync, and therefore no way for the two to disagree.
 *
 * Two deliberate refusals:
 *
 *   - **Overrides are not persisted.** A value that survives a reload means a
 *     later session silently rides on numbers nobody remembers setting, and
 *     the symptom — "it feels wrong today" — points nowhere. Copy takes them
 *     to the clipboard; `tuning.ts` is where a value you liked belongs.
 *   - **This is not the options menu.** Player options are firewalled out of
 *     `simulation/` (invariant 5); developer tuning is expected to reach the
 *     controller from M2. Keeping them as two mechanisms is what stops a
 *     player-facing slider from quietly becoming a gameplay constant.
 *
 * Built on first show, like the overlay, so it costs nothing until opened.
 */

interface Row {
  readonly path: string;
  readonly unit: string;
  readonly wrapper: HTMLElement;
  readonly slider: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

export class TuningPanel {
  private readonly doc: Document;
  private readonly tuning: LiveTuning;

  private root: HTMLElement | null = null;
  private rows: Row[] = [];
  private shown = false;
  private unsubscribe: (() => void) | null = null;
  private status: HTMLElement | null = null;

  constructor(tuning: LiveTuning, doc: Document = document) {
    this.tuning = tuning;
    this.doc = doc;
  }

  get visible(): boolean {
    return this.shown;
  }

  toggle(): void {
    this.setVisible(!this.shown);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    if (visible) {
      this.build();
      this.syncAll();
    }
    if (this.root) this.root.hidden = !visible;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root?.remove();
    this.root = null;
    this.rows = [];
    this.status = null;
    this.shown = false;
  }

  /** Pull every control back into agreement with the store. */
  syncAll(): void {
    for (const row of this.rows) this.syncRow(row);
    this.updateStatus();
  }

  private syncRow(row: Row): void {
    const value = this.tuning.get(row.path);
    const overridden = this.tuning.overrides()[row.path] !== undefined;
    const number = String(Number(value.toFixed(4)));
    const text = row.unit ? `${number} ${row.unit}` : number;
    if (row.slider.value !== String(value)) row.slider.value = String(value);
    if (row.output.value !== text) row.output.value = text;
    row.wrapper.classList.toggle('is-overridden', overridden);
  }

  private updateStatus(): void {
    if (!this.status) return;
    const count = this.tuning.overrideCount();
    this.status.textContent = count === 0
      ? 'No overrides. Values shown are the defaults in src/data/tuning.ts.'
      : `${count} override${count === 1 ? '' : 's'} active — session only. `
        + 'Copy them into src/data/tuning.ts to keep them.';
  }

  private build(): void {
    if (this.root) return;
    ensureDiagnosticStyles(this.doc);

    const root = this.doc.createElement('section');
    root.id = 'euc-tuning-panel';
    root.className = 'euc-diag';
    root.setAttribute('aria-label', 'Tuning panel');

    const heading = this.doc.createElement('h2');
    heading.textContent = 'Tuning — F4';
    root.appendChild(heading);

    let currentGroup = '';
    for (const view of this.tuning.views()) {
      if (view.spec.group !== currentGroup) {
        currentGroup = view.spec.group;
        const groupHeading = this.doc.createElement('h3');
        groupHeading.textContent = currentGroup;
        root.appendChild(groupHeading);
      }

      const wrapper = this.doc.createElement('div');
      wrapper.className = 'euc-tunable';
      wrapper.dataset.path = view.spec.path;
      wrapper.title = `${view.spec.path} — ${view.spec.note}`;

      const id = `euc-tunable-${view.spec.path.replace(/\W+/g, '-')}`;

      const label = this.doc.createElement('label');
      label.htmlFor = id;
      label.textContent = view.spec.label;

      const output = this.doc.createElement('output');
      output.htmlFor = id;

      const revert = this.doc.createElement('button');
      revert.type = 'button';
      revert.className = 'euc-revert';
      revert.textContent = '⤺';
      revert.title = `Reset to the default, ${view.defaultValue}`;
      revert.addEventListener('click', () => {
        this.tuning.reset(view.spec.path);
      });

      const slider = this.doc.createElement('input');
      slider.type = 'range';
      slider.id = id;
      slider.min = String(view.spec.min);
      slider.max = String(view.spec.max);
      slider.step = String(view.spec.step);
      slider.value = String(view.value);
      slider.addEventListener('input', () => {
        this.tuning.set(view.spec.path, Number(slider.value));
      });

      wrapper.append(label, output, revert, slider);
      root.appendChild(wrapper);

      this.rows.push({
        path: view.spec.path,
        unit: view.spec.unit,
        wrapper,
        slider,
        output,
      });
    }

    const actions = this.doc.createElement('div');
    actions.className = 'euc-actions';

    const resetAll = this.doc.createElement('button');
    resetAll.type = 'button';
    resetAll.textContent = 'Reset all';
    resetAll.addEventListener('click', () => {
      this.tuning.reset();
    });

    const copy = this.doc.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy overrides';
    copy.addEventListener('click', () => {
      const json = JSON.stringify(this.tuning.overrides(), null, 2);
      // Clipboard access is permission-gated and refused outright in some
      // embedded contexts, so the value is logged as well — a copy button that
      // silently does nothing is worse than no button.
      console.info('[tuning] overrides\n' + json);
      void this.doc.defaultView?.navigator?.clipboard?.writeText(json).catch(() => {
        /* Logged above; nothing further to do. */
      });
    });

    actions.append(resetAll, copy);
    root.appendChild(actions);

    const status = this.doc.createElement('p');
    status.className = 'euc-note';
    root.appendChild(status);
    this.status = status;

    this.doc.body.appendChild(root);
    this.root = root;

    // The QA bridge and the revert buttons both write through the store, so
    // the controls follow the store rather than the other way round.
    this.unsubscribe = this.tuning.onChange((path) => {
      const row = this.rows.find((candidate) => candidate.path === path);
      if (row) this.syncRow(row);
      this.updateStatus();
    });
  }
}
