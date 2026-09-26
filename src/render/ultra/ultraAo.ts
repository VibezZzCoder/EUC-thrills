/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * T13 — forward, indirect-only ambient occlusion. **Reserved; not built.**
 * M39 (`docs/M39_ULTRA.md` §2.4, amendment A3).
 *
 * This file is a placeholder and is **imported by nothing**. It may be filled
 * only by a written coordinator amendment, and only if gauntlet round 1 has at
 * least three of five critics naming Ultra's contact and form "flat or
 * ungrounded" with T5 (analytic contact AO) already in place.
 *
 * If it is ever built, the shape is fixed in advance so nobody reinvents the
 * rejected versions (§0.3):
 *
 *   1. A half-resolution depth/normal prepass with `shadowMap.autoUpdate =
 *      false`, `scene.background = null` and transparent/Points hidden.
 *   2. `GTAOPass`, imported **lazily and by file path**
 *      (`three/examples/jsm/postprocessing/GTAOPass.js`) from here: construct
 *      it first, then `setGBuffer(depth)` (the constructor throws on
 *      `depthTexture` at `GTAOPass.js:341`), `OUTPUT.Off`, driven by hand with
 *      no `EffectComposer`.
 *   3. Denoise.
 *   4. Ultra lit materials sample the AO **into indirect diffuse and specular
 *      only**, after `#include <aomap_fragment>`. Sky, fog, direct sun,
 *      transparents, tone mapping and MSAA stay untouched.
 *
 * Cost if built: +1 half-res scene render, +2 full-screen passes, about
 * 14.5 MB at 1080p / 28.7 MB at 2560×1600. Proof required: AO strength 0 is
 * pixel-identical to Ultra without T13. `UltraKit.ao` is typed `false` so no
 * recipe can switch it on without that amendment.
 */
export {};
