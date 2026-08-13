/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { Game } from './Game.ts';
import {
  hazardProbeFromQuery,
  levelFromQuery,
  seedFromQuery,
  chaseProbeFromQuery,
  targetProbeFromQuery,
} from '../level/levels.ts';
import { PROVENANCE, provenanceLine } from '../data/provenance.ts';

/**
 * Boot entry.
 *
 * Deliberately thin: probe the one capability whose absence has a useful
 * message, build the game, expose the QA bridge, dismiss the loading shell.
 * Everything with behaviour lives in `Game.ts` and the modules it owns, so
 * that none of it is reachable only through a page load.
 */

const boot = document.getElementById('boot');
const bootStatus = document.getElementById('boot-status');
const bootError = document.getElementById('boot-error');

function fail(message: string, detail?: unknown): void {
  const text = detail instanceof Error ? `${message}\n\n${detail.message}` : message;
  if (bootError) {
    bootError.textContent = text;
    bootError.hidden = false;
  }
  if (bootStatus) bootStatus.textContent = 'Could not start';
  const track = document.getElementById('boot-track');
  if (track) track.hidden = true;
  console.error(message, detail);
}

/** Can this browser give us a WebGL context at all? */
function isWebGLAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function dismissBootShell(): void {
  if (!boot) return;
  boot.classList.add('is-dismissed');
  const hide = () => {
    boot.hidden = true;
  };
  boot.addEventListener('transitionend', hide, { once: true });
  // Belt and braces: if the transition is suppressed by reduced-motion or the
  // element is already opaque-zero, transitionend never fires.
  window.setTimeout(hide, 400);
}

/**
 * Say where this build came from, once, before anything else runs.
 *
 * The third of the four places the origin lives — bundle banner, page
 * metadata, here, and the packager's refusal. This one is the copy a *player*
 * can check without reading source: open the console on any page serving this
 * game and it names the repository it was built from. `console.info` rather
 * than `console.log` so it is filterable, and one line rather than a splash so
 * it costs a curious developer nothing.
 *
 * Deliberately not gated on the build mode. A marker that only appears in
 * production is missing from exactly the copy somebody is inspecting.
 */
function announceOrigin(): void {
  console.info(`${provenanceLine()} · Play: ${PROVENANCE.homepageUrl}`);
}

function start(): void {
  const canvas = document.getElementById('viewport');
  if (!(canvas instanceof HTMLCanvasElement)) {
    fail('The rendering surface is missing from the page.');
    return;
  }

  // Probe WebGL separately rather than blaming any constructor failure on it.
  // A broad try/catch here reports an ordinary programming error to the player
  // as "your browser cannot do WebGL", which sends them off to change graphics
  // settings that were never the problem — and hides the real fault from us.
  if (!isWebGLAvailable()) {
    fail(
      'EUC Thrills needs WebGL, and this browser could not provide it. '
        + 'Try updating the browser, or enabling hardware acceleration in its settings.',
    );
    return;
  }

  let game: Game;
  try {
    // The world the page was opened at. `?level=proving` gets the M4 course,
    // `?level=generated&seed=<seed>` gets a seeded route from M12's segment
    // library, and anything else — including a typo — gets the shipped slice
    // (`level/levels.ts`).
    //
    // **This is no longer the only way the world can be chosen.** Until M12
    // Phase 4 it was, and this comment said a mid-life swap "would be three
    // teardowns for a developer diagnostic" — true while the only other world
    // was reached by typing a query parameter. Choosing a route is a player's
    // decision now, taken from a menu, and `Game.installLevel` performs those
    // three teardowns deliberately. What survives unchanged is that the world
    // is settled *before the first frame*, so a boot never draws one frame of
    // a place the player did not ask for.
    game = new Game(
      canvas,
      levelFromQuery(window.location.search),
      seedFromQuery(window.location.search),
      // M13 Phase 2's diagnostic. Read here rather than in `applyDebugQuery`
      // because it decides what is *in* the world, and the world is settled
      // before the first frame — see `level/levels.ts:hazardProbeFromQuery`.
      hazardProbeFromQuery(window.location.search),
      // M14 phase 2's, read here for the same reason and on the same terms.
      targetProbeFromQuery(window.location.search),
      chaseProbeFromQuery(window.location.search),
    );
  } catch (error) {
    fail('EUC Thrills could not start.', error);
    return;
  }

  game.applyDebugQuery(window.location.search);

  // There is deliberately no `resize` listener here. The loop polls the
  // renderer's idempotent `resize()` every frame, which already covers window
  // resizes, container resizes, and pixel-ratio changes without a listener for
  // each — and a second caller is worse than redundant. `resize()` reports
  // *whether the layout changed*, and it can only report that once: whichever
  // caller runs first consumes the change and the other sees "nothing
  // happened". The loop is the caller that acts on it, so the loop is the only
  // caller. This cost a Playwright timeout to find.
  const teardown = (): void => {
    window.removeEventListener('pagehide', teardown);
    game.dispose();
  };
  window.addEventListener('pagehide', teardown);

  // The QA bridge. Durable tooling rather than a development-only hook: the
  // browser suite runs against the built artifact too, and a diagnostic that
  // only exists in a dev build is missing at exactly the moment a released
  // build misbehaves (master starter 16.1).
  (window as Window & { game?: Game }).game = game;

  game.start();
  dismissBootShell();
}

announceOrigin();

try {
  start();
} catch (error) {
  fail('EUC Thrills failed to start.', error);
}
