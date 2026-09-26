/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra shadow maps' sizes, from the drawing buffer — M39 (`docs/M39_ULTRA.md`
 * §9 amendment A22, Fable finding F5).
 *
 * The near map (4096², 128 MiB) and the far map (3072², 45 MiB) were sized for
 * the reference Air's 2560×1600 panel and allocated whatever the display. On a
 * phone that draws 1.3 MP they are oversampled several times over and are most
 * of Ultra's GPU memory. So both are chosen per activation from the buffer the
 * Ultra frame will draw into:
 *
 * - **At or above 2,000,000 device pixels** — the Air (2880×1800, 5,184,000,
 *   under A26's pixel budget; 2560×1600 under the earlier 4,096,000) and the
 *   GU captures' 1920×1080 (2,073,600) — the ceilings
 *   stand: `ULTRA.near.mapSize` and `ULTRA.farShadow.mapSize`.
 * - **Below it** — a phone's 780×1688 (1,316,640), or a large phone's 880×1912
 *   (1,682,560) — both maps are 2048² (32 MiB near, 20 MiB far).
 *
 * **A band, not a line, once Ultra draws** (last-mile fix, Fable N1). A window
 * dragged back and forth across 2,000,000 px would otherwise reallocate the
 * 128 MiB near map and rebuild the far map at every crossing. So a *fresh*
 * choice (every activation from the ordinary tier, and the cost model) is the
 * line above, while a *re-choice* from maps already held
 * (`ultraShadowMapSizesAfter`: a resize, the F4 pixel knob, a world swap under
 * Ultra) steps up at 2,000,000 px as before but steps back down only below
 * 1,800,000 px. Inside the band the maps held stay, whichever they are.
 *
 * A leaf module (tuning and nothing else), because two sides read the one rule:
 * the runtime sizes the live maps with it at activation, and the cost model
 * (`ultraCost.ts`) prices a buffer with it. The runtime imports the cost model,
 * so the rule cannot live in the runtime without a cycle.
 *
 * Pure and headless: no DOM, no GL, no enum, no parameter properties.
 */
import { ULTRA } from '../../data/tuning.ts';

/** Device pixels at and above which the drawing buffer keeps the map ceilings. */
export const ULTRA_FULL_MAPS_MIN_PIXELS = 2_000_000;

/**
 * Device pixels under which a buffer that holds the full maps gives them up
 * (N1's hysteresis): 10 % under the line, about 5 % in each dimension, so a
 * drag has to be a real resize, not a wobble across the line, to move them.
 */
export const ULTRA_FULL_MAPS_KEEP_PIXELS = 1_800_000;

/** The map edge a smaller buffer gets, near and far alike (never above a ceiling). */
export const ULTRA_SMALL_MAP_SIZE = 2048;

/** The two Ultra shadow maps' edges, texels. */
export interface UltraShadowMapSizes {
  readonly near: number;
  readonly far: number;
}

/**
 * The near and far map edges for a `width × height` device-pixel drawing
 * buffer. A buffer that is not a number, or is empty, is a small one: the rule
 * never grows a map it cannot justify (the runtime decides separately what to
 * do while the canvas has not been measured yet).
 */
export function ultraShadowMapSizesFor(width: number, height: number): UltraShadowMapSizes {
  const pixels = width * height;
  if (pixels >= ULTRA_FULL_MAPS_MIN_PIXELS) {
    return { near: ULTRA.near.mapSize, far: ULTRA.farShadow.mapSize };
  }
  return {
    near: Math.min(ULTRA_SMALL_MAP_SIZE, ULTRA.near.mapSize),
    far: Math.min(ULTRA_SMALL_MAP_SIZE, ULTRA.farShadow.mapSize),
  };
}

/** Whether `sizes` are the full maps (the table's ceilings), rather than the small ones. */
function holdsFullMaps(sizes: UltraShadowMapSizes): boolean {
  return sizes.near === ULTRA.near.mapSize && sizes.far === ULTRA.farShadow.mapSize;
}

/**
 * The map edges for a `width × height` buffer when `held` are the maps
 * already standing (Fable N1): the fresh rule, except that held full maps
 * are kept down to `ULTRA_FULL_MAPS_KEEP_PIXELS`. With `held` null this is
 * exactly `ultraShadowMapSizesFor`. Returns `held` itself when nothing moves,
 * so a caller can compare by identity or by value.
 */
export function ultraShadowMapSizesAfter(
  held: UltraShadowMapSizes | null,
  width: number,
  height: number,
): UltraShadowMapSizes {
  const fresh = ultraShadowMapSizesFor(width, height);
  if (held === null) return fresh;
  // An unmeasured buffer (a canvas not laid out, a hidden tab) says nothing
  // about the display, so the maps already standing stay.
  if (!(width > 0 && height > 0)) return held;
  if (holdsFullMaps(held) && !holdsFullMaps(fresh) && width * height >= ULTRA_FULL_MAPS_KEEP_PIXELS) return held;
  return fresh.near === held.near && fresh.far === held.far ? held : fresh;
}
