/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The two Ultra rungs and the recipe helpers — M39 (`docs/M39_ULTRA.md` §5,
 * §6.2).
 *
 * **Not a rung on M32's ladder, on purpose.** `render/presentation.ts`'s
 * `PRESENTATION_LADDER` is what every Low/Medium/High player gets, selected
 * once per world against Contracts 1–3; inserting Ultra there would choose it
 * for every quality (PLANS §39.6, "do not insert Ultra into that ladder").
 * These are a second, render-owned ladder that `judgeUltra` walks only for an
 * eligible single-player Ultra request, against Ultra's own envelope.
 *
 * Both rungs carry `foliage:true, walls:true`, so every ordinary branch that
 * reads a recipe's flags (the enhanced crowns and conifers, the coursed stone
 * walls) behaves on an Ultra world exactly as on an enhanced one; the kit
 * says what Ultra adds on top.
 *
 * W0 writes this file in its final form; it is frozen through Wave 1 and owned
 * by the integrator (W8) after.
 */
import { ULTRA } from '../../data/tuning.ts';
import type { BuildRecipe, UltraKit, UltraKitOverride, UltraKitSwitch, UltraRecipe } from './ultraTypes.ts';

/**
 * The layer the static far shadow renders (§3.4). A *normal* render tests
 * object layers against its own camera, so `farCamera.layers.set(5)` sees
 * only what joined it: the casting props, building parts and blocks. The
 * rider, cop, ghost, particles, heightfield, markings and hazards never do,
 * so they are never frozen into the map.
 */
export const ULTRA_STATIC_LAYER = 5;

/** Everything on — the full Ultra recipe, when the world fits its envelope. */
export const ULTRA_FULL: UltraRecipe = Object.freeze({
  id: 'ultra-full',
  foliage: true,
  walls: true,
  ultra: Object.freeze({
    forms: true,
    buildings: true,
    facadeMaps: true,
    ground: true,
    edgeFill: ULTRA.edgeFill,
    blocks: true,
    lighting: true,
    // Coordinator amendment A1: on by default on the full rung.
    farShadow: ULTRA.farShadow.enabled,
    ao: false,
  }),
});

/**
 * The fallback rung (A's graft): lighting, surfaces and buildings stay, the
 * foliage and furniture forms fall back to the enhanced builders, and the far
 * shadow stays off — step 6 of the §1 cut order, taken per world when the full
 * rung breaches.
 */
export const ULTRA_LIT: UltraRecipe = Object.freeze({
  id: 'ultra-lit',
  foliage: true,
  walls: true,
  ultra: Object.freeze({
    forms: false,
    buildings: true,
    facadeMaps: true,
    ground: true,
    edgeFill: ULTRA.edgeFill,
    blocks: true,
    lighting: true,
    farShadow: false,
    ao: false,
  }),
});

/** Walked in order by `judgeUltra`: the first rung with no breach is built. */
export const ULTRA_LADDER: readonly UltraRecipe[] = Object.freeze([ULTRA_FULL, ULTRA_LIT]);

/** Whether a recipe is an Ultra rung — the guard every Ultra branch sits behind. */
export function isUltraRecipe(r: BuildRecipe): r is UltraRecipe {
  return 'ultra' in r;
}

/** The kit switches, in `UltraKit` order, for the override walk below. */
const KIT_SWITCHES: readonly UltraKitSwitch[] = Object.freeze([
  'forms',
  'buildings',
  'facadeMaps',
  'ground',
  'edgeFill',
  'blocks',
  'lighting',
  'farShadow',
]);

/**
 * A rung with a diagnostic `?ultrakit=` override applied (`-lighting`,
 * `-edgeFill`, `+farShadow` …).
 *
 * Returns the rung itself when the override is absent or changes nothing, so
 * identity comparisons on the shipped rungs keep working; otherwise a new
 * frozen recipe with the same id. `ao` is not a switch and cannot be widened
 * here (T13 needs a coordinator amendment).
 */
export function applyKitOverride(r: UltraRecipe, o: UltraKitOverride | null): UltraRecipe {
  if (o === null) return r;
  let changed = false;
  const kit: { -readonly [K in keyof UltraKit]: UltraKit[K] } = { ...r.ultra };
  for (const name of KIT_SWITCHES) {
    const value = o[name];
    if (value === undefined || value === kit[name]) continue;
    kit[name] = value;
    changed = true;
  }
  if (!changed) return r;
  return Object.freeze({ ...r, ultra: Object.freeze(kit) });
}
