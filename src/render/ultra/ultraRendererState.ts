/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * What a three GPU step leaves on the renderer when it throws — M39
 * (`docs/M39_ULTRA.md` §9 amendment A28, Codex finding C2).
 *
 * three's two conversions that Ultra runs outside a frame —
 * `WebGLCubeRenderTarget.fromEquirectangularTexture` (through
 * `CubeCamera.update`, the sky's background cube) and
 * `PMREMGenerator.fromEquirectangular` (the environment) — save the
 * renderer's render target, cube face, mip level and XR flag (PMREM also its
 * auto-clear) when they start and put them back when they finish, but not in
 * a `finally`. A render that throws between the two leaves the renderer bound
 * to the target being filled, which the failed activation then disposes, so
 * the High frame after the fallback would draw into a deleted framebuffer.
 * Every Ultra caller of those conversions holds the state first and puts it
 * back on a throw. The activation's framebuffer check (A28 C1,
 * `ultraFramebufferStatus`) binds each Ultra target the same way and puts the
 * renderer back with the same hold.
 *
 * Type-only three import: headlessly importable (invariant 13).
 */
import type * as THREE from 'three';

/**
 * Note the renderer state a conversion may leave behind, and return the
 * function that writes it back exactly. Reading it changes nothing.
 */
export function holdRendererState(renderer: THREE.WebGLRenderer): () => void {
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const level = renderer.getActiveMipmapLevel();
  const xr = renderer.xr.enabled;
  const autoClear = renderer.autoClear;
  return (): void => {
    renderer.xr.enabled = xr;
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(target, face, level);
  };
}

/**
 * A28 C1: `gl.checkFramebufferStatus` for an Ultra render target — every
 * face of a cube, answering the first that is incomplete — bound through
 * three's own `setRenderTarget` (so its binding cache stays true) and put
 * back as it was (`holdRendererState`'s target, face and level).
 *
 * Null when it cannot be asked: a lost context (the status would read
 * FRAMEBUFFER_UNSUPPORTED for a reason the restore path owns), a target three
 * has not set up (binding it would allocate it), or a status of 0 — what
 * `checkFramebufferStatus` returns when it fails, as it does if the context
 * is lost between the `isContextLost()` check and the call. A 0 is no
 * framebuffer's status, so it is no finding (Fable finding 6); before, it
 * refused as an incomplete framebuffer named "0x0000".
 */
export function ultraFramebufferStatus(renderer: THREE.WebGLRenderer, target: THREE.RenderTarget): number | null {
  const gl = renderer.getContext();
  if (gl.isContextLost()) return null;
  const properties = renderer.properties;
  if (!properties.has(target)) return null;
  if ((properties.get(target) as { __webglFramebuffer?: unknown }).__webglFramebuffer === undefined) return null;
  // `isWebGLCubeRenderTarget` is three's own flag, read so this module keeps a type-only three import.
  const faces = (target as { isWebGLCubeRenderTarget?: boolean }).isWebGLCubeRenderTarget === true ? 6 : 1;
  const restore = holdRendererState(renderer);
  let status: number = gl.FRAMEBUFFER_COMPLETE;
  try {
    for (let face = 0; face < faces && status === gl.FRAMEBUFFER_COMPLETE; face += 1) {
      renderer.setRenderTarget(target as THREE.WebGLRenderTarget, face);
      status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    }
  } finally {
    restore();
  }
  return status === 0 ? null : status;
}
