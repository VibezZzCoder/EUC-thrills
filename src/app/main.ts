/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { Game } from './Game.ts';
import { loadingPaint, type LoadingScreen } from '../ui/loadingScreen.ts';
import {
  hazardProbeFromQuery,
  levelFromQuery,
  seedFromQuery,
  chaseProbeFromQuery,
  targetProbeFromQuery,
  topSpeedFromQuery,
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

/** Can this browser give us a WebGL context at all? */
function isWebGLAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
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

export async function start(loading: LoadingScreen): Promise<void> {
  const canvas = document.getElementById('viewport');
  if (!(canvas instanceof HTMLCanvasElement)) {
    loading.fail('The rendering surface is missing from the page.');
    return;
  }

  // Probe WebGL separately rather than blaming any constructor failure on it.
  // A broad try/catch here reports an ordinary programming error to the player
  // as "your browser cannot do WebGL", which sends them off to change graphics
  // settings that were never the problem — and hides the real fault from us.
  if (!isWebGLAvailable()) {
    loading.fail(
      'EUC Thrills needs WebGL, and this browser could not provide it. '
        + 'Try updating the browser, or enabling hardware acceleration in its settings.',
    );
    return;
  }

  let game: Game;
  try {
    // The world the page was opened at. `?level=proving` gets the M4 course,
    // `?level=generated&seed=<seed>` gets a seeded route from M12's segment
    // library, and anything else — including a typo — gets the curated city
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
    game = await Game.create(
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
      // M30 Phase 0's `?mph=<n>` — read here for the probes' reason (Phase 1
      // hands it to the boot world's generator) and written into the
      // live-tuning store by the constructor, so it survives every world swap
      // the way `?wobble=` does. See `level/levels.ts:topSpeedFromQuery`.
      topSpeedFromQuery(window.location.search),
      async (label, completed) => { loading.stage(label, completed, 9); await loadingPaint(); },
    );
  } catch (error) {
    loading.fail('EUC Thrills could not start.', error);
    return;
  }

  game.setLoadingScreen(loading);
  try {
    game.applyDebugQuery(window.location.search);
    loading.stage('Preparing the first view', 8, 9);
    await loadingPaint();
    // Link the first view's programs before its first drawn frame (RP-8): a
    // draw during the parallel compile blocks on each link. Optional work.
    game.renderer.resize();
    try { await game.renderer.warmPrograms(); } catch { /* the first frames link lazily instead */ }
    game.prepareFirstFrame();
  } catch (error) {
    game.dispose();
    loading.fail('The first view could not be prepared. Please try again.', error);
    return;
  }

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

  loading.stage('Ready to ride', 9, 9);
  loading.complete();
  game.start();
  game.preloadOptionalAudio();
}

announceOrigin();

