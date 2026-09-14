/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { defineConfig, devices } from '@playwright/test';

/**
 * Browser QA (`npm run test:browser`).
 *
 * These specs answer the one question `node --test` cannot ask: does the whole
 * thing still run in a real browser, end to end, without errors? The headless
 * suite deliberately never touches `three` (AGENTS.md invariant 1), so
 * everything that crosses the renderer or the event layer is proven here or
 * not at all.
 *
 * **This is not a performance harness.** Nothing asserted here is a frame
 * time. An automated tab has its own cadence whatever draws it, and the game's
 * loop keeps rendering even while frozen — so every assertion below is
 * cadence-independent: state transitions, step counts, GPU object counts,
 * console silence. Frame-interval percentiles come from a human at a focused
 * window (AGENTS.md, "Measuring performance").
 */

/**
 * Chromium GL flags.
 *
 * **Permit software rendering; never select it.** `--enable-unsafe-swiftshader`
 * alongside `--enable-gpu` is not a contradiction: it allows the fallback so a
 * machine with no usable GPU still gets a WebGL2 context, instead of every
 * spec failing as "WebGL unavailable" for a reason that says nothing about the
 * game. Pinning ANGLE to SwiftShader instead puts every triangle and every
 * shader compile on the CPU and can cost an order of magnitude.
 *
 * Set `EUC_SOFTWARE_GL=1` to pin the software rasteriser deliberately, for
 * reproducing a software-only bug or checking the fallback still works.
 */
const GL_ARGS = process.env.EUC_SOFTWARE_GL === '1'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];

const PERFORMANCE_ONLY = process.env.EUC_PERFORMANCE === '1';

/** Unattended runs stay bounded; an invalid override must not disable the limit. */
function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(raw)}`);
  }
  return value;
}

export default defineConfig({
  testDir: './tests',
  // Playwright clears its output directory at startup. Keep that cleanup away
  // from the coordinator's live logs and input ledger in test-results/validation.
  outputDir: './test-results/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  maxFailures: positiveInteger('EUC_MAX_FAILURES', 3),
  globalTimeout: positiveInteger('EUC_GLOBAL_TIMEOUT_MS', 45 * 60_000),
  // Wall-clock budgets run only in the explicit, exclusive performance lane.
  // A worker count limits this runner; the coordinator must also keep other
  // browser runs, builds, exports and expensive headless sweeps off the machine.
  ...(PERFORMANCE_ONLY ? { grep: /@performance\b/ } : { grepInvert: /@performance\b/ }),
  /**
   * Playwright's half-core default is the existing functional-suite setting.
   * M17's measured increase from four workers to six made the run slower and
   * introduced contention failures. Each worker composites a real WebGL scene
   * even while a spec waits on `game.advance(n)` or a boot.
   *
   * The suite has grown since then: M36/M37 full runs reached 20–24 minutes,
   * and overlapping agent work multiplied individual fixture costs. Duration
   * alone no longer identifies a boot failure. Read early failures, use focused
   * scopes, and give one coordinator ownership of expensive work across agents.
   *
   * `EUC_WORKERS` changes functional-run concurrency. The performance lane
   * always uses one worker, regardless of that environment override.
   */
  // A count is a number and a share is a "NN%" string; an env var is always a
  // string, and handing Playwright "1" is a config error rather than one worker.
  workers: PERFORMANCE_ONLY
    ? 1
    : process.env.EUC_WORKERS === undefined
      ? undefined
      : process.env.EUC_WORKERS.endsWith('%')
        ? process.env.EUC_WORKERS
        : Number(process.env.EUC_WORKERS),
  reporter: [['list']],
  // Generous on purpose: under a software rasteriser the shader compile at
  // boot costs seconds where a real GPU costs a fraction of one. That is a
  // property of the rasteriser, not of the game, and a tight timeout here
  // would fail specs for a reason that tells us nothing.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // The touch spec is the mobile project's, below. Everything else is a
      // desktop question and answering it twice would double a suite that
      // already takes minutes.
      testIgnore: /touch\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1000, height: 700 },
        // Note the absence of `--disable-frame-rate-limit`. The loop keeps
        // rendering while frozen — that is what makes frame-accurate capture
        // of a transient possible — so uncapping the rate makes the rasteriser
        // draw as fast as it can, forever, on the same thread the automation
        // protocol uses.
        launchOptions: { args: GL_ARGS },
      },
    },
    {
      /*
       * A phone (M11.5).
       *
       * **`hasTouch` is the whole point of this project existing.** It is what
       * makes `(pointer: coarse)` match and what makes `page.touchscreen` and
       * Playwright's `tap()` produce real touch pointers — so the automatic
       * detection, the layout, and the controls are exercised as a player
       * meets them rather than through synthesized events that no phone would
       * ever send.
       *
       * `isMobile` brings the mobile viewport emulation and user agent with
       * it, which is what a real device reports and what the safe-area insets
       * are written against.
       *
       * The viewport here is portrait; the spec resizes to landscape itself,
       * because rotating *while riding* is the case with the interesting
       * failure and a second project could not test it.
       */
      name: 'mobile',
      testMatch: /touch\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        launchOptions: { args: GL_ARGS },
      },
    },
  ],
  webServer: {
    // Vite's default `localhost` can resolve to ::1 in a managed environment
    // where the listen is then rejected. The explicit IPv4 loopback is the
    // launch contract used across this workspace.
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
