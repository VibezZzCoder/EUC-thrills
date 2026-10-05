/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { DEBUG_BINDINGS } from '../input/bindings.ts';

/** The static HTML shell also covers renderer/session transitions after boot. */
export class LoadingScreen {
  private readonly root = document.getElementById('boot')!;
  private readonly title = document.getElementById('boot-heading')!;
  private readonly detail = document.getElementById('boot-detail')!;
  private readonly status = document.getElementById('boot-status')!;
  private readonly count = document.getElementById('boot-count')!;
  private readonly error = document.getElementById('boot-error')!;
  private readonly retry = document.getElementById('boot-retry')!;
  private readonly track = document.getElementById('boot-track')!;
  private hideTimer: number | null = null;
  private epoch = 0;
  private active = true;
  private disposed = false;
  private previousFocus: HTMLElement | null = null;

  constructor() {
    document.addEventListener('keydown', this.blockKeys, true);
    document.addEventListener('keyup', this.blockKeys, true);
    this.retry.addEventListener('click', this.reload);
  }

  get busy(): boolean { return this.active; }

  begin(kind: 'boot' | 'quality' | 'multiplayer' | 'world', heading: string, detail: string): void {
    if (this.disposed) return;
    this.epoch += 1;
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (!this.active) this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.active = true;
    this.root.hidden = false;
    this.root.classList.remove('is-dismissed');
    this.root.dataset.kind = kind;
    this.root.setAttribute('aria-busy', 'true');
    this.title.textContent = heading;
    this.detail.textContent = detail;
    this.error.hidden = true;
    this.retry.hidden = true;
    this.track.hidden = false;
    this.count.textContent = '';
    this.status.textContent = 'Getting ready';
  }

  /** Count completed, named phases; never an estimated time or byte percentage. */
  stage(label: string, completed: number, total: number): void {
    if (this.disposed || !this.active) return;
    this.status.textContent = label;
    this.count.textContent = `${completed} of ${total} steps complete`;
  }

  complete(): void {
    if (this.disposed || !this.active) return;
    const epoch = this.epoch;
    this.status.textContent = 'Ready to ride';
    this.root.setAttribute('aria-busy', 'false');
    this.root.classList.add('is-dismissed');
    this.active = false;
    // Only a control that is still usable: a load that changed screens hid the
    // button that started it, and the menus re-focus their new panel instead.
    const previous = this.previousFocus;
    if (previous !== null && previous.isConnected && previous.offsetParent !== null && previous.closest('[inert]') === null) {
      previous.focus({ preventScroll: true });
    }
    this.previousFocus = null;
    // Attempt scoped: an old fade must not hide a newer load. Reduced motion
    // never depends on a transitionend event that the browser may suppress.
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      if (!this.disposed && epoch === this.epoch && !this.active) this.root.hidden = true;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }

  fail(message: string, detail?: unknown): void {
    if (this.disposed) return;
    this.epoch += 1;
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.active = true;
    this.root.hidden = false;
    this.root.classList.remove('is-dismissed');
    this.root.setAttribute('aria-busy', 'false');
    this.status.textContent = 'Could not finish loading';
    this.count.textContent = '';
    this.track.hidden = true;
    this.error.textContent = message;
    this.error.hidden = false;
    this.retry.hidden = false;
    this.retry.focus({ preventScroll: true });
    console.error(message, detail);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    document.removeEventListener('keydown', this.blockKeys, true);
    document.removeEventListener('keyup', this.blockKeys, true);
    this.retry.removeEventListener('click', this.reload);
  }

  private readonly reload = (): void => { window.location.reload(); };
  private readonly blockKeys = (event: KeyboardEvent): void => {
    if (!this.active || event.ctrlKey || event.metaKey || event.altKey || event.target === this.retry) return;
    // Browser function keys (F5 reload, F11 full screen, F12 tools) stay the
    // browser's during a long load; only the game's own debug keys are held.
    if (/^F([1-9]|1[0-2])$/.test(event.code) && DEBUG_BINDINGS[event.code] === undefined) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
}

/** Two callbacks provide a painted interval before synchronous work starts.
 * Boot has no game loop yet; the bounded timer also permits background panes.
 * Once the game loop starts, transition scheduling stays with that one owner.
 */
export function loadingPaint(): Promise<void> {
  return new Promise((resolve) => {
    let raf = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 250);
    raf = requestAnimationFrame(() => { if (!done) raf = requestAnimationFrame(finish); });
  });
}
