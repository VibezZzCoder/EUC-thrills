/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import tyreOffroadUrl from '../../assets/live/audio/tyre_offroad_loop.wav?url';
import tyreSolidUrl from '../../assets/live/audio/tyre_solid_loop.wav?url';
import windHowlUrl from '../../assets/live/audio/wind_howl_loop.wav?url';
import crashUrl from '../../assets/live/audio/crash_wipeout.wav?url';
import crashTrollinaUrl from '../../assets/live/audio/crash_trollina.wav?url';
import crashRedRiderUrl from '../../assets/live/audio/crash_red_rider.wav?url';
import crashAdonisb2Url from '../../assets/live/audio/crash_adonisb2.wav?url';
import crashMaribelUrl from '../../assets/live/audio/crash_maribel.wav?url';
import crashWheelInMotionUrl from '../../assets/live/audio/crash_wheel_in_motion.wav?url';
import sirenFarUrl from '../../assets/live/audio/siren_far_loop.wav?url';
import sirenCloseUrl from '../../assets/live/audio/siren_close_loop.wav?url';
import overspeedBeepUrl from '../../assets/live/audio/overspeed_beep.wav?url';

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
 *
 * Red Rider's crash is the one to *not* read across from hers. It is the
 * owner's own recording with 0.8 s of one band re-textured from elsewhere in
 * the same take, so nothing generated enters it and it stays inside the CC BY
 * 4.0 claim with the owner's other originals. NOTICE.md says that too, in as
 * many words, so the two are not assumed to share a standing.
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
   * Red Rider's (M19).
   *
   * The owner's own wipeout recording with the owner's *voice* taken out of it
   * by `tools/make-crash-red-rider.mjs` — a third rider must not crash to the
   * sound of somebody else swearing. Same length as `crash` to the sample,
   * because `audio/director.ts` ducks the mix on one envelope whoever is
   * riding.
   */
  readonly crashRedRider: string;
  /**
   * Adonisb2's (M22) — **his own fall, and the file with the shortest story
   * behind it of anything in this table.**
   *
   * The rider recorded himself coming off on a mountain and sent the owner the
   * file for this use. `tools/make-crash-adonisb2.mjs` takes 3.4 s of it,
   * mono-sums the near-identical channels, and matches the level to `crash`.
   * Nothing is removed, substituted, modelled or generated — which is what
   * separates it from Trollina's, and what it shares with Red Rider's without
   * needing any of that file's arithmetic. Same length as `crash` to the
   * sample, for the reason every entry here repeats.
   *
   * It is **not** covered by the project's CC BY 4.0 claim and it is not a
   * third-party CC0 download either: it is licensed material contributed by a
   * named person under a narrow grant. NOTICE.md holds the terms.
   */
  readonly crashAdonisb2: string;
  /**
   * Maribel's (M23) — **and the only one a rider made on purpose.**
   *
   * The others are recordings of something that happened. Hers is a
   * performance: the owner asked her for something usable, so she rode an
   * older EUC into a lift, powered the wheel off, dropped it on the floor and
   * yelled. `tools/make-crash-maribel.mjs` takes one continuous 3.4 s slice of
   * it — the drop, her shout, her yell — and copies her own power-off beep
   * into the empty tail, onset on the sample her voice stops ringing, because
   * a real wheel lying on its side goes on beeping. Nothing else is moved,
   * nothing is substituted, and no sound is in the file that she did not
   * record.
   *
   * Two of its details are hers rather than choices. It takes the **right**
   * channel instead of mono-summing, because summing her two mics nulls
   * 12.6 dB at 630 Hz in the middle of the yell; and it is unfiltered, because
   * the weight under the thud is the thud. Same length as `crash` to the
   * sample, for the reason every entry here repeats.
   *
   * Standing is Adonisb2's, not the owner's: a **narrow grant from a named
   * person**, outside the CC BY 4.0 claim and not sublicensable. NOTICE.md
   * holds the terms.
   */
  readonly crashMaribel: string;
  /**
   * Wheel in Motion's (M28) — Red Rider's crash again, as a different file.
   *
   * The owner asked for exactly that: the same crash as Red Rider's, his own
   * wipeout with his own voice removed, as a new file for the sixth rider
   * until the rider supplies a recording of his own. `crashVoices.test.ts`
   * refuses a byte copy by design, so `tools/make-crash-red-rider.mjs` was
   * run a second time with `--avoid` keeping it off the donor Red Rider's
   * render took: the same 0.76–1.56 s window, the same band, voice-free
   * texture from 1.74 s of the same take instead of 2.56 s. Outside that
   * window the two files are the owner's recording sample for sample, and
   * identical to each other; inside it they differ, and the test says both.
   * Same length as `crash` to the sample.
   *
   * Standing is Red Rider's exactly: inside the CC BY 4.0 claim, nothing
   * generated, and **no recording of Wheel in Motion's voice anywhere in
   * it** (`NOTICE.md`). If his own recording arrives, this file is
   * superseded on the Adonisb2/Maribel path and nothing here changes.
   */
  readonly crashWheelInMotion: string;
  /**
   * The chase siren's two wails (M18) — the far carrier and the close
   * panic, crossfaded by the cop's range. Both CC0 Freesound recordings,
   * owner-auditioned A/B/C/D on 2026-08-13 and recorded in NOTICE.md's
   * third-party table alongside the tyre and wind beds.
   */
  readonly sirenFar: string;
  readonly sirenClose: string;
  /**
   * The max-speed warning beep (M20).
   *
   * **Original, CC BY 4.0, with the owner's other originals** — and it is worth
   * saying why, because the owner supplied a reference video and the obvious
   * reading is that this file came out of it. It did not. The video is a public
   * one he did not film, so its audio is somebody else's recording and cannot
   * be redistributed here; what shipped is a *measured replica* of the piezo
   * alarm on it, built by `tools/make-overspeed-beep.mjs` from the measurement
   * that tool records — 2565 Hz, one partial 17.4 dB down, a 10 ms attack. The
   * alarm is a two-partial tone with no fine structure, so there is nothing in
   * the recording a replica can fail to carry; the tool's header states the
   * whole argument and how to hear the two side by side.
   */
  readonly overspeedBeep: string;
}

export const SAMPLE_URLS: SampleUrls = {
  tyreOffroad: tyreOffroadUrl,
  tyreSolid: tyreSolidUrl,
  windHowl: windHowlUrl,
  crash: crashUrl,
  crashTrollina: crashTrollinaUrl,
  crashRedRider: crashRedRiderUrl,
  crashAdonisb2: crashAdonisb2Url,
  crashMaribel: crashMaribelUrl,
  crashWheelInMotion: crashWheelInMotionUrl,
  sirenFar: sirenFarUrl,
  sirenClose: sirenCloseUrl,
  overspeedBeep: overspeedBeepUrl,
};
