/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { ULTRA_TOGGLE_HELP, ULTRA_TOGGLE_WARNING } from '../src/ui/menus.ts';
import { bootAtTier, bootToTitle, collectErrors } from './harness.ts';

/**
 * M39, Codex QA C3 — the title's Ultra toggle shows its GPU warning at every
 * size (`docs/M39_ULTRA.md` A28, `DESIGN.md` §9g).
 *
 * q201 asked for the toggle *with* a GPU-demand warning. The helper sentence
 * is a button note, and three tiers hide every note: a phone held upright (the
 * helper is clipped to a pixel there), the compact three-column title, and the
 * couch title at 40rem and below. Before C3 each of them showed "Ultra Off"
 * with no warning in sight. The fix shows the helper's first sentence as a
 * small second line inside the button in exactly those tiers.
 *
 * **The contract, at every window here: exactly one of the two is visible.**
 * Where the helper is a note (the stack, the couch two-column tier) the short
 * line is `display: none`, so the warning is never said twice on screen; where
 * the notes are gone the line is visible, inside the button, inside the
 * viewport, unclipped and not painted over. The title never gains anything to
 * scroll to, and the button's accessible description is still the whole
 * helper (the line is `aria-hidden`).
 *
 * The phone project's own sizes are `tests/touch.spec.ts` (the Pixel 7
 * descriptor, a coarse pointer). This file is the desktop project's side: the
 * fine-pointer windows, the couch tiers only a desktop is offered, the
 * compact landscape tier at a desktop's pixel ratio with and without touch,
 * and (FU) a touch tablet with no pad, which is refused the couch at 1000 px
 * and wider and so reaches the wide no-couch tiers no other window does.
 * The longest state word, "Using High", is reached by a real path — a saved
 * Ultra under a diagnostic `?presentation=` override (journey 6 of
 * `m39-ultra.spec.ts`) — at the windows with the least room.
 */

type Shows = 'note' | 'line';

interface TitleSize {
  readonly width: number;
  readonly height: number;
  readonly hasTouch: boolean;
  /** Which of the two carries the warning at this size. */
  readonly shows: Shows;
  /** Whether the couch entrance (and so the couch tiers) is on this title. */
  readonly couch: boolean;
  /** Also measured with the longest state word, "Using High". */
  readonly longest: boolean;
  readonly tier: string;
}

const SIZES: readonly TitleSize[] = [
  { width: 1920, height: 1080, hasTouch: false, shows: 'note', couch: true, longest: false, tier: 'couch stack' },
  { width: 1440, height: 900, hasTouch: false, shows: 'note', couch: true, longest: false, tier: 'couch two-column' },
  { width: 1000, height: 700, hasTouch: false, shows: 'note', couch: true, longest: false, tier: "the suite's own window" },
  { width: 1000, height: 520, hasTouch: false, shows: 'line', couch: true, longest: true, tier: 'couch 40rem' },
  { width: 1280, height: 485, hasTouch: false, shows: 'line', couch: true, longest: true, tier: 'couch 40rem, shortest held' },
  { width: 1600, height: 500, hasTouch: false, shows: 'line', couch: true, longest: false, tier: 'couch 40rem, short and wide' },
  { width: 844, height: 390, hasTouch: false, shows: 'line', couch: false, longest: true, tier: 'compact three-column' },
  { width: 667, height: 375, hasTouch: false, shows: 'line', couch: false, longest: true, tier: 'compact three-column, least room' },
  { width: 740, height: 481, hasTouch: false, shows: 'line', couch: false, longest: false, tier: 'compact, narrow desktop window' },
  { width: 844, height: 390, hasTouch: true, shows: 'line', couch: false, longest: true, tier: 'compact landscape, touch' },
  // **A touch tablet with no pad (FU, 2026-09-23).** Coarse and pad-less, it is
  // refused the couch at any width, so these are the tiers `game.css` gives a
  // wide title without one: two columns with the note under 60rem, the notes
  // gone and the compact line under 40rem, and the stack upright.
  // `tests/m22.spec.ts` holds the same machine's whole-title fit.
  { width: 1024, height: 768, hasTouch: true, shows: 'note', couch: false, longest: true, tier: 'touch tablet, two columns without the couch' },
  { width: 1024, height: 600, hasTouch: true, shows: 'line', couch: false, longest: true, tier: 'touch tablet, 40rem without the couch' },
  { width: 768, height: 1024, hasTouch: true, shows: 'note', couch: false, longest: false, tier: 'touch tablet upright, the stack' },
  // **FU2, 2026-09-23.** The stack under 60rem takes tier one's rhythm: at
  // 801 px it scrolled 67 (fine) and 72 (touch) px before, and these are the
  // tightest windows it now fits (25.7 and 19 px). 740x360 is the compact
  // title under 24rem, which scrolled 12 px with a fine pointer.
  { width: 999, height: 801, hasTouch: false, shows: 'note', couch: false, longest: true, tier: 'the stack under 60rem, tightest (FU2)' },
  { width: 768, height: 801, hasTouch: true, shows: 'note', couch: false, longest: true, tier: 'touch, the stack under 60rem (FU2)' },
  { width: 740, height: 360, hasTouch: false, shows: 'line', couch: false, longest: true, tier: 'compact under 24rem (FU2)' },
];

/** Two frames, so a resize or a boot has laid out before anything is measured. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
  }));
}

/**
 * Where the warning is and whether an eye can see it. "Seen" is strict: laid
 * out, `visibility: visible`, larger than the visually-hidden pattern's one
 * pixel and not clipped by a `clip-path`.
 */
async function warningFacts(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.euc-menu--title')!;
    const toggle = root.querySelector<HTMLElement>('[data-menu="ultra"]')!;
    const warn = toggle.querySelector<HTMLElement>('.euc-ultra__warn');
    const help = toggle.querySelector<HTMLElement>('#euc-ultra-help');
    const seen = (node: HTMLElement | null): boolean => {
      if (node === null) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility === 'visible'
        && box.width > 1 && box.height > 1 && style.clipPath === 'none';
    };
    const edges = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const shown = warn !== null && seen(warn) ? warn : help !== null && seen(help) ? help : null;
    let onTop = false;
    if (shown !== null) {
      const box = shown.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      onTop = hit !== null && (hit === shown || shown.contains(hit));
    }
    return {
      couch: root.getAttribute('data-couch') === 'true',
      warnSeen: seen(warn),
      helpSeen: seen(help),
      warnText: warn?.textContent ?? '',
      warnAriaHidden: warn?.getAttribute('aria-hidden') ?? null,
      shown: shown === null ? null : edges(shown),
      clipped: shown === null ? 0 : Math.max(shown.scrollWidth - shown.clientWidth, shown.scrollHeight - shown.clientHeight),
      onTop,
      toggle: edges(toggle),
      overflow: root.scrollHeight - root.clientHeight,
    };
  });
}

async function expectWarning(page: Page, size: TitleSize, state: string): Promise<void> {
  const where = `${size.width}x${size.height}${size.hasTouch ? ' touch' : ''}, ${size.tier}, ${state}`;
  const toggle = page.locator('.euc-menu--title [data-menu="ultra"]');
  await expect(toggle, where).toBeVisible();
  await expect(toggle, where).toBeEnabled();
  await expect(toggle.locator('[data-ultra-text]'), where).toHaveText(state);

  const facts = await warningFacts(page);
  expect(facts.couch, `the couch entrance is not what this size expects at ${where}`).toBe(size.couch);
  expect(facts.warnSeen && facts.helpSeen, `the warning is on screen twice at ${where}`).toBe(false);
  expect(facts.warnSeen || facts.helpSeen, `no visible GPU warning beside the toggle at ${where}`).toBe(true);
  expect(size.shows === 'line' ? facts.warnSeen : facts.helpSeen,
    `the warning is not carried by the ${size.shows} at ${where}`).toBe(true);
  expect(facts.warnText).toBe(ULTRA_TOGGLE_WARNING);
  expect(facts.warnAriaHidden, 'the compact line would be read twice').toBe('true');

  const [shown, button] = [facts.shown!, facts.toggle];
  expect(shown.left, `the warning leaves the button at ${where}`).toBeGreaterThanOrEqual(button.left - 0.5);
  expect(shown.right, `the warning leaves the button at ${where}`).toBeLessThanOrEqual(button.right + 0.5);
  expect(shown.top, `the warning leaves the button at ${where}`).toBeGreaterThanOrEqual(button.top - 0.5);
  expect(shown.bottom, `the warning leaves the button at ${where}`).toBeLessThanOrEqual(button.bottom + 0.5);
  expect(shown.left, `the warning starts off screen at ${where}`).toBeGreaterThanOrEqual(-0.5);
  expect(shown.top, `the warning starts off screen at ${where}`).toBeGreaterThanOrEqual(-0.5);
  expect(shown.right, `the warning ends off screen at ${where}`).toBeLessThanOrEqual(size.width + 0.5);
  expect(shown.bottom, `the warning ends below the fold at ${where}`).toBeLessThanOrEqual(size.height + 0.5);
  expect(facts.clipped, `the warning's words are clipped at ${where}`).toBeLessThanOrEqual(1);
  expect(facts.onTop, `something covers the warning at ${where}`).toBe(true);
  expect(facts.overflow, `the title has ${facts.overflow}px to scroll at ${where}`).toBeLessThanOrEqual(1);

  await expect(toggle, where).toHaveAccessibleName('Ultra Graphics');
  await expect(toggle, where).toHaveAccessibleDescription(ULTRA_TOGGLE_HELP);
}

test('the compact warning is the helper’s own first sentence', () => {
  expect(ULTRA_TOGGLE_HELP.startsWith(`${ULTRA_TOGGLE_WARNING}.`)).toBe(true);
});

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}${size.hasTouch ? ' touch' : ''}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.hasTouch });

    test(`the title shows the Ultra GPU warning (${size.tier}) and still fits`, async ({ page }) => {
      const errors = collectErrors(page);
      await bootToTitle(page);
      await settle(page);
      await expectWarning(page, size, 'Off');

      if (size.longest) {
        await bootAtTier(page, 'level=slice&presentation=enhanced', 'ultra', { ride: false });
        await expect(page.locator('.euc-menu--title [data-menu="ultra"]')).toHaveAttribute('aria-pressed', 'true');
        await settle(page);
        await expectWarning(page, size, 'Using High');
        await page.evaluate(() => window.game.resetOptions());
      }
      expect(errors).toEqual([]);
    });
  });
}
