/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The system rail beside an upright screen (1.4.6).
 *
 * The iPhone Duo's outer screen keeps its camera, clock and Wi-Fi in a rail
 * down the right-hand side. Safari lays a tab out beside that rail (a 382 px
 * page on a 466 px screen). The installed game is drawn under it: the page is
 * the full 466 px and the rail arrives as `env(safe-area-inset-right)`, 84 px
 * (measured on the iOS 27.1 Simulator). The ride already honours that inset —
 * the HUD lanes and the touch controls read it — but the menus pad only top
 * and bottom, so the title's third place card and the top-right of Settings
 * sat under the clock.
 *
 * A menu cannot simply add the inset to its padding, because its layout tiers
 * are media queries and a media query sees the 466 px viewport, not the
 * 382 px that is left. So this module does the one thing CSS cannot: it reads
 * the inset and says so on the root element, as `data-side-rail="right"` (or
 * `"left"`). `game.css` then keeps every menu out of the rail and applies the
 * narrow-phone rules that the viewport width alone would have skipped — the
 * same layout Safari shows on that screen, which `tests/fold.spec.ts` already
 * holds at 382 px.
 *
 * Upright only. A phone on its side reports insets on both edges for its
 * notch, and the menus have never honoured those: their panels are centred
 * and narrower than the screen, and the landscape tiers are fitted to the
 * pixel without them.
 */

/** Below this an inset is a rounded corner or a notch's edge, not a rail. */
export const SIDE_RAIL_MIN_PX = 40;

export type SideRail = 'left' | 'right' | null;

/** Which side, if either, holds a rail: pure, so it is tested without a DOM. */
export function sideRailFor(width: number, height: number, insetLeft: number, insetRight: number): SideRail {
  if (!(height > width)) return null;
  if (insetRight >= SIDE_RAIL_MIN_PX && insetRight > insetLeft) return 'right';
  if (insetLeft >= SIDE_RAIL_MIN_PX && insetLeft > insetRight) return 'left';
  return null;
}

/**
 * Keep `data-side-rail` on the root element current. Returns the disposer.
 *
 * The insets are read from a hidden element that `game.css` pads with
 * `env(safe-area-inset-*)`: a computed padding is a resolved length, which a
 * custom property holding `env()` is not on every engine. Created with a class
 * and no inline style, which the page's Content-Security-Policy would refuse.
 */
export function watchSideRail(doc: Document = document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  const probe = doc.createElement('div');
  probe.className = 'euc-safe-area-probe';
  probe.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(probe);

  const update = (): void => {
    const style = view.getComputedStyle(probe);
    const rail = sideRailFor(
      view.innerWidth, view.innerHeight,
      Number.parseFloat(style.paddingLeft) || 0, Number.parseFloat(style.paddingRight) || 0,
    );
    const root = doc.documentElement;
    if (rail === null) {
      if (root.dataset.sideRail !== undefined) delete root.dataset.sideRail;
    } else if (root.dataset.sideRail !== rail) {
      root.dataset.sideRail = rail;
    }
  };

  // Folding, unfolding and turning the phone all arrive as a resize; the
  // orientation event is for the engines that settle the insets a beat later.
  const events = ['resize', 'orientationchange', 'pageshow'] as const;
  for (const type of events) view.addEventListener(type, update);
  view.visualViewport?.addEventListener('resize', update);
  update();

  return () => {
    for (const type of events) view.removeEventListener(type, update);
    view.visualViewport?.removeEventListener('resize', update);
    probe.remove();
    delete doc.documentElement.dataset.sideRail;
  };
}
