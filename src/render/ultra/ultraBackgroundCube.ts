/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra sky's background cube — M39 (`docs/M39_ULTRA.md` §9 amendment A22,
 * Fable finding F3).
 *
 * three 0.185.1 never draws an equirectangular `scene.background` directly: the
 * first frame converts it into a `WebGLCubeRenderTarget(image.height)` inside
 * `WebGLEnvironments.getCube` and draws that cube. For the 2048×1024 Ultra sky
 * that hidden target is six 1024² RGBA8 faces with mips — 32 MiB the Ultra
 * ledger could not see. So on the Ultra tier the conversion is made explicit:
 * this target is created here, filled once by
 * `fromEquirectangularTexture(renderer, sky)` (a GPU step the renderer runs),
 * hung as `scene.background`, and counted in the ledger as
 * `sky-background-cube`. three then finds a cube texture already and converts
 * nothing itself. The ordinary sky is untouched: its conversion stays three's.
 *
 * The target is what three's own conversion would build, minus its depth
 * buffer (a single back-faced box needs no depth test, so the pixels are the
 * same): the conversion copies the sky's type, colour space, filters and
 * `generateMipmaps` onto it, and it is drawn as a render-target cube texture
 * (no handedness flip), exactly as three's cached one is.
 *
 * Constructible headlessly (a plain three object; nothing allocates on the GPU
 * until the conversion renders into it).
 */
import * as THREE from 'three';

/** The background cube for an equirect sky `height` texels tall (face edge = height). */
export function createUltraBackgroundCube(height: number): THREE.WebGLCubeRenderTarget {
  const cube = new THREE.WebGLCubeRenderTarget(height, {
    depthBuffer: false,
    // `createSky` always mipmaps the sky (the cloud field would crawl as the
    // camera yaws without them), and the conversion copies that flag across.
    generateMipmaps: true,
  });
  cube.texture.name = 'ultra-sky-background';
  return cube;
}
