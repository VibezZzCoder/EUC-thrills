/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The painted-sky environment (T1) — M39 (`docs/M39_ULTRA.md` §3.2, package
 * W4, the lighting owner).
 *
 * The venue's own sky, painted by `paintEnvironment(look)` at
 * `ULTRA.env.width × height` — sun core removed, aureole halved, lower half
 * the ground bounce × β (`bounceLift`) blended from `horizonColour` — and
 * PMREM-filtered **once per activation** (never per frame, no HDRI, no
 * `RoomEnvironment`). It becomes `scene.environment`, which is what kills the
 * value crush (D1) and lets glass, metal, rider and wheel catch the painted
 * sky. The PMREM generator and its target are Ultra-ledger resources,
 * disposed by `teardownUltra` and rebuilt on context restore.
 *
 * **Half-float source, on purpose.** β is live (F4 slider up to 3), and a
 * lifted bounce is brighter than 1 in linear; an 8-bit sRGB source would clip
 * it. Half floats are linearly filterable in core WebGL2 (float32 needs an
 * extension phones may lack), and the renderer's capability probe already
 * requires half-float rendering before Ultra activates. No mip chain on the
 * source: at 1024 wide it meets the 256 cube faces at about one texel per
 * texel, so PMREM's own sampling does not alias.
 *
 * **Cost.** 1024 / 4 = 256 is the cube size three picks for this source
 * (`PMREMGenerator._fromTexture`), so the target is `3·256 × 4·256` RGBA16F —
 * 6 MiB steady — plus a same-size ping-pong target that lives only for the
 * build (6 MiB transient). The build is about twenty quad draws, activation
 * only.
 */
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import type { ResolvedVenueLook } from '../../data/venueLook.ts';
import { skyConstruction } from '../sky.ts';
import { paintEnvironment } from '../skyImage.ts';
import { holdRendererState } from './ultraRendererState.ts';
import type { UltraLiveTuning } from './ultraTypes.ts';

/**
 * The GPU bytes of a PMREM cube-UV target of `cubeSize`: three's own layout,
 * `3·max(cubeSize, 112)` wide by `4·cubeSize` tall, RGBA16F (8 bytes a
 * texel). The same arithmetic W7's `ultraTargetBytes` prices, so the ledger
 * and the envelope agree by construction.
 */
export function environmentBytes(cubeSize: number): number {
  if (cubeSize <= 0) return 0;
  return 3 * Math.max(cubeSize, 16 * 7) * 4 * cubeSize * 8;
}

/**
 * The cube size three will filter this source into: `2^⌊log2(width / 4)⌋`
 * (`PMREMGenerator._setSize`). 256 for the 1024-wide environment.
 */
export function environmentCubeSize(sourceWidth: number): number {
  return 2 ** Math.floor(Math.log2(sourceWidth / 4));
}

/**
 * The equirectangular source the PMREM is filtered from, as a half-float
 * `DataTexture` (linear, `EquirectangularReflectionMapping`). Pure: no
 * renderer, so a headless test can hold its texels to the painter.
 *
 * β comes from the live set (`bounceLift`), so dragging the F4 slider and
 * rebuilding (the renderer rebuilds on a `bounceLift` change) repaints the
 * lower half and nothing else.
 */
export function ultraEnvironmentSource(look: ResolvedVenueLook, live: UltraLiveTuning): THREE.DataTexture {
  const { width, height } = ULTRA.env;
  const linear = paintEnvironment(look, {
    width,
    height,
    bounceLift: live.bounceLift,
    sunCoreStrength: ULTRA.env.sunCoreStrength,
    aureoleScale: ULTRA.env.aureoleScale,
    horizonBlendDegrees: ULTRA.env.horizonBlendDegrees,
    construction: skyConstruction(),
  });
  const half = new Uint16Array(linear.length);
  for (let index = 0; index < linear.length; index += 1) {
    half[index] = THREE.DataUtils.toHalfFloat(linear[index]);
  }
  const texture = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'ultra-environment-source';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // Painted in linear, so it is data three must not decode.
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The part of `THREE.PMREMGenerator` this module uses — named so a headless
 * test can hand in a recording fake (three has no GL context under
 * `node --test`), and so the real generator is constructed in exactly one
 * place.
 *
 * A28 C2: `allocated` names the filtered target the last
 * `fromEquirectangular` allocated, whether or not it returned it, so a filter
 * that throws does not strand it. A generator without it frees its own.
 */
export interface EnvironmentGenerator {
  fromEquirectangular(source: THREE.Texture): THREE.WebGLRenderTarget;
  allocated?(): THREE.WebGLRenderTarget | null;
  dispose(): void;
}

/** three 0.185.1's private allocator, which `_fromTexture` calls before it filters. */
interface PMREMInternals {
  _allocateTargets(): THREE.WebGLRenderTarget;
}

const allocateTargets = (THREE.PMREMGenerator.prototype as unknown as PMREMInternals)._allocateTargets;

/**
 * three's generator, remembering the filtered target it allocates (A28 C2).
 * `_fromTexture` allocates it, filters into it, and hands it back only when
 * the filter finishes; a render that throws in between leaves it unreachable,
 * rendered-into and never disposed. `ultraEnvironment.test.ts` pins the name
 * of the allocator this wraps, so a three upgrade that renames it fails there.
 */
class LedgeredPMREMGenerator extends THREE.PMREMGenerator {
  allocated: THREE.WebGLRenderTarget | null = null;

  _allocateTargets(): THREE.WebGLRenderTarget {
    const target = allocateTargets.call(this);
    this.allocated = target;
    return target;
  }
}

/**
 * The real generator. A filter that throws puts back the renderer state three
 * leaves behind (`holdRendererState`) before the error leaves here; the build
 * then frees the target the generator allocated.
 */
function pmremGenerator(renderer: THREE.WebGLRenderer): EnvironmentGenerator {
  const generator = new LedgeredPMREMGenerator(renderer);
  return {
    fromEquirectangular(source: THREE.Texture): THREE.WebGLRenderTarget {
      const restore = holdRendererState(renderer);
      try {
        return generator.fromEquirectangular(source);
      } catch (error) {
        restore();
        throw error;
      }
    },
    allocated: () => generator.allocated,
    dispose: () => generator.dispose(),
  };
}

/**
 * Paint, filter and hand over the Ultra environment (T1).
 *
 * The source texture and the generator (with its ping-pong target, blur
 * material and quad meshes) are disposed before this returns — only the
 * filtered target survives, and its `dispose` is the one the Ultra ledger
 * calls. PMREM saves and restores the renderer's target, tone mapping and
 * auto-clear itself; the renderer calls this outside `beginFrame`, so its
 * quad draws never reach a frame's counters.
 *
 * The optional last argument is a test seam only (`EnvironmentGenerator`).
 */
export function buildUltraEnvironment(
  renderer: THREE.WebGLRenderer,
  look: ResolvedVenueLook,
  live: UltraLiveTuning,
  createGenerator: (renderer: THREE.WebGLRenderer) => EnvironmentGenerator = pmremGenerator,
): { texture: THREE.Texture; target: THREE.WebGLRenderTarget; bytes: number; cubeSize: number; dispose(): void } {
  const source = ultraEnvironmentSource(look, live);
  const generator = createGenerator(renderer);
  let target: THREE.WebGLRenderTarget;
  try {
    target = generator.fromEquirectangular(source);
  } catch (error) {
    // A28 C2: the filtered target is allocated before the filter that threw.
    generator.allocated?.()?.dispose();
    throw error;
  } finally {
    generator.dispose();
    source.dispose();
  }
  target.texture.name = 'ultra-environment';
  // The cube-UV target is `4·cubeSize` tall whatever its width floor is.
  const cubeSize = Math.round(target.height / 4);
  let disposed = false;
  return {
    texture: target.texture,
    // A28 C1: the activation checks this target's framebuffer.
    target,
    bytes: environmentBytes(cubeSize),
    cubeSize,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      target.dispose();
    },
  };
}
