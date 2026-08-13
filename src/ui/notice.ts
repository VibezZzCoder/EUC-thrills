/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Full-viewport screen notices: the pause card and the WebGL context-loss
 * recovery panel.
 *
 * This is deliberately not the M9 menu system — it is the smallest surface
 * that makes two states *visible*: a simulation the player froze on purpose,
 * and a GPU the browser took away. Both existed silently before this file,
 * which is worse than not existing at all: a paused game with no pause card is
 * indistinguishable from a hang, and a lost context leaves a dead canvas with
 * a live simulation behind it. M9 replaces the pause card with the real pause
 * menu; the context-loss panel is permanent stability tooling.
 *
 * The DOM is built on first show, so a boot that never needs a notice pays a
 * constructor and nothing else — same rule the debug overlay follows.
 */

export interface ScreenNoticeOptions {
  readonly id: string;
  /**
   * `alert` interrupts assistive tech immediately and moves focus to the
   * action button; `status` announces politely and never steals focus. A
   * context loss is an alert; a pause the player asked for is not.
   */
  readonly role: 'alert' | 'status';
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export class ScreenNotice {
  private readonly options: ScreenNoticeOptions;
  private root: HTMLDivElement | null = null;
  private action: HTMLButtonElement | null = null;

  constructor(options: ScreenNoticeOptions) {
    this.options = options;
  }

  get visible(): boolean {
    return this.root !== null && !this.root.hidden;
  }

  show(): void {
    const root = this.ensureDom();
    if (!root.hidden) return;
    // Display is toggled alongside the attribute because an inline
    // `display: grid` outranks the UA stylesheet's `[hidden] { display:
    // none }` — with the attribute alone the notice stays visible. Same trap
    // `index.html` guards its boot shell against with an explicit
    // `#boot[hidden]` rule.
    root.hidden = false;
    root.style.display = 'grid';
    // An alert's one recovery action should already be under the keyboard —
    // a player who cannot see the canvas may also not be able to find it.
    if (this.options.role === 'alert') this.action?.focus();
  }

  hide(): void {
    if (!this.root) return;
    this.root.hidden = true;
    this.root.style.display = 'none';
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
    this.action = null;
  }

  private ensureDom(): HTMLDivElement {
    if (this.root) return this.root;

    const root = document.createElement('div');
    root.id = this.options.id;
    root.setAttribute('role', this.options.role);
    root.hidden = true;
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      placeContent: 'center',
      justifyItems: 'center',
      gap: '0.75rem',
      padding: '2rem',
      textAlign: 'center',
      background: 'rgba(9, 12, 16, 0.62)',
      color: '#eef2f7',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      zIndex: '30',
      // The canvas keeps receiving input through the notice; only the action
      // button is interactive.
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = this.options.title;
    Object.assign(title.style, {
      fontSize: '1.6rem',
      fontWeight: '800',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(title);

    const message = document.createElement('p');
    message.textContent = this.options.message;
    Object.assign(message.style, {
      margin: '0',
      maxWidth: '38ch',
      color: '#97a3b4',
      fontSize: '0.95rem',
      lineHeight: '1.5',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(message);

    if (this.options.actionLabel && this.options.onAction) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = this.options.actionLabel;
      Object.assign(button.style, {
        marginTop: '0.5rem',
        padding: '0.6rem 1.4rem',
        border: 'none',
        borderRadius: '0.4rem',
        background: '#1f6fe0',
        color: '#ffffff',
        font: 'inherit',
        fontWeight: '600',
        cursor: 'pointer',
        pointerEvents: 'auto',
      } satisfies Partial<CSSStyleDeclaration>);
      button.addEventListener('click', this.options.onAction);
      root.appendChild(button);
      this.action = button;
    }

    document.body.appendChild(root);
    this.root = root;
    return root;
  }
}
