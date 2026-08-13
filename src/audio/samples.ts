/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import tyreOffroadUrl from '../../assets/live/audio/tyre_offroad_loop.wav?url';
import tyreSolidUrl from '../../assets/live/audio/tyre_solid_loop.wav?url';
import windHowlUrl from '../../assets/live/audio/wind_howl_loop.wav?url';
import crashUrl from '../../assets/live/audio/crash_wipeout.wav?url';
import crashTrollinaUrl from '../../assets/live/audio/crash_trollina.wav?url';
import sirenFarUrl from '../../assets/live/audio/siren_far_loop.wav?url';
import sirenCloseUrl from '../../assets/live/audio/siren_close_loop.wav?url';

/**
 * The shipped recordings, as URLs the bundler resolves.
 *
 * **Imported only by the composition root (`app/Game.ts`).** The `?url`
 * suffix is Vite syntax, and everything below `audio/` except this file runs
 * headlessly under `node --test` — so the URLs travel *into* `AudioEngine`
 * as plain strings rather than the engine importing them, and the engine
 * stays testable and buildable with no bundler in sight.
 *
 * Every file here has its provenance recorded — the owner's own wipeout
 * recording under CC BY 4.0 with his other original assets, the four CC0
 * recordings in NOTICE.md's third-party table, the toko rotation loop
 * synthesized locally by `tools/make-toko.mjs` (original CC BY 4.0, no
 * external source), and Trollina's crash, which is composed by
 * `tools/make-crash-trollina.mjs` from a generated vocal take and is the one
 * shipped file **not** covered by the CC BY 4.0 claim. NOTICE.md says why.
 */
export interface SampleUrls {
  readonly tyreOffroad: string;
  readonly tyreSolid: string;
  readonly windHowl: string;
  readonly crash: string;
  /**
   * Trollina's crash (M14.5).
   *
   * A second key rather than a per-character record, because `crash` is Cool
   * Rider's and nothing else in the codebase should have to churn for a rider
   * being added. Both are fetched at boot and the *sink* chooses between them
   * at the moment of a crash — see `audio/sink.ts`.
   */
  readonly crashTrollina: string;
  /**
   * The chase siren's two wails (M18) — the far carrier and the close
   * panic, crossfaded by the cop's range. Both CC0 Freesound recordings,
   * owner-auditioned A/B/C/D on 2026-08-13 and recorded in NOTICE.md's
   * third-party table alongside the tyre and wind beds.
   */
  readonly sirenFar: string;
  readonly sirenClose: string;
}

export const SAMPLE_URLS: SampleUrls = {
  tyreOffroad: tyreOffroadUrl,
  tyreSolid: tyreSolidUrl,
  windHowl: windHowlUrl,
  crash: crashUrl,
  crashTrollina: crashTrollinaUrl,
  sirenFar: sirenFarUrl,
  sirenClose: sirenCloseUrl,
};
