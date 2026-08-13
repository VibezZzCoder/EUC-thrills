/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LIVE_TUNABLES, TUNING, type TunableSpec } from './tuning.ts';

/**
 * Runtime tuning overrides — the half of `tuning.ts` that can change while the
 * game is running.
 *
 * `tuning.ts` holds the frozen defaults and is never written to, so resetting
 * is exact rather than approximately-back-to-where-it-was. This store keeps a
 * sparse map of overrides on top and notifies listeners when one changes; the
 * systems that own the affected state re-read and apply it. Nothing polls.
 *
 * **This is developer tuning, not a player option.** The options firewall
 * (AGENTS.md invariant 5) exists to keep player-configurable presentation out
 * of `simulation/`; developer tuning is the opposite thing and is expected to
 * reach the controller from M2 onward. They are separate mechanisms on
 * purpose — do not route options through here, and do not put a tuning slider
 * in the options menu.
 *
 * Overrides are deliberately **session-only**. Persisting them would mean a
 * later session silently rides on values nobody remembers setting, and the
 * symptom — "the wheel feels wrong today" — points nowhere. Move a value you
 * like into `tuning.ts`; the panel's copy button emits exactly that JSON.
 *
 * No `three` import, no DOM: the store is plain data so it is unit-testable
 * and so `simulation/` can read it later without breaking invariant 1.
 */

export type TuningListener = (path: string, value: number) => void;

/** A tunable together with its current and default values, for the panel. */
export interface TunableView {
  readonly spec: TunableSpec;
  readonly value: number;
  readonly defaultValue: number;
  readonly overridden: boolean;
}

function readPath(root: unknown, path: string): number | undefined {
  let node: unknown = root;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'number' ? node : undefined;
}

export class LiveTuning {
  private readonly specs: readonly TunableSpec[];
  private readonly defaults = new Map<string, number>();
  private readonly overrideValues = new Map<string, number>();
  private readonly listeners = new Set<TuningListener>();

  /**
   * @param specs   Which paths may be changed. Defaults to LIVE_TUNABLES.
   * @param root    Where defaults are read from. Defaults to TUNING.
   *
   * A path that does not resolve to a number is a typo that would otherwise
   * present as a slider doing nothing, so it throws here instead. A test
   * covers the shipped registry, which turns that into a build-time failure.
   */
  constructor(specs: readonly TunableSpec[] = LIVE_TUNABLES, root: unknown = TUNING) {
    this.specs = specs;
    for (const spec of specs) {
      const value = readPath(root, spec.path);
      if (value === undefined || !Number.isFinite(value)) {
        throw new Error(
          `Tunable "${spec.path}" does not resolve to a finite number in the tuning root.`,
        );
      }
      this.defaults.set(spec.path, value);
    }
  }

  /** Every tunable, in registry order, with its current value. */
  views(): TunableView[] {
    return this.specs.map((spec) => ({
      spec,
      value: this.get(spec.path),
      defaultValue: this.defaults.get(spec.path) ?? 0,
      overridden: this.overrideValues.has(spec.path),
    }));
  }

  specFor(path: string): TunableSpec | undefined {
    return this.specs.find((spec) => spec.path === path);
  }

  /** Current value: the override if one is set, otherwise the frozen default. */
  get(path: string): number {
    const override = this.overrideValues.get(path);
    if (override !== undefined) return override;
    const value = this.defaults.get(path);
    if (value === undefined) throw new Error(`"${path}" is not a registered tunable.`);
    return value;
  }

  defaultOf(path: string): number {
    const value = this.defaults.get(path);
    if (value === undefined) throw new Error(`"${path}" is not a registered tunable.`);
    return value;
  }

  /**
   * Set an override, clamped to the spec's range.
   *
   * Clamping rather than rejecting is deliberate: a value typed past the end
   * of a slider should land at the end of the slider, not silently do nothing.
   * A value equal to the default clears the override, so the panel's
   * "overridden" markers stay honest when a slider is dragged back.
   */
  set(path: string, value: number): number {
    const spec = this.specFor(path);
    if (!spec) throw new Error(`"${path}" is not a registered tunable.`);
    if (!Number.isFinite(value)) throw new Error(`"${path}" was given a non-finite value.`);

    const clamped = Math.min(spec.max, Math.max(spec.min, value));
    const previous = this.get(path);

    if (clamped === this.defaultOf(path)) this.overrideValues.delete(path);
    else this.overrideValues.set(path, clamped);

    if (clamped !== previous) this.emit(path, clamped);
    return clamped;
  }

  /** Drop one override, or all of them. Emits only for values that moved. */
  reset(path?: string): void {
    if (path !== undefined) {
      if (!this.overrideValues.has(path)) return;
      this.overrideValues.delete(path);
      this.emit(path, this.get(path));
      return;
    }
    const changed = [...this.overrideValues.keys()];
    this.overrideValues.clear();
    for (const changedPath of changed) this.emit(changedPath, this.get(changedPath));
  }

  /** The overrides alone, as plain JSON-ready data. Sparse by design. */
  overrides(): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [path, value] of this.overrideValues) record[path] = value;
    return record;
  }

  overrideCount(): number {
    return this.overrideValues.size;
  }

  /** Subscribe to changes. Returns the unsubscribe. */
  onChange(listener: TuningListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.overrideValues.clear();
  }

  private emit(path: string, value: number): void {
    // Iterate a copy: a listener that unsubscribes itself while being called
    // would otherwise mutate the set mid-iteration.
    for (const listener of [...this.listeners]) listener(path, value);
  }
}
