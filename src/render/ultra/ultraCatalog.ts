/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra recipe's part prices — measured, never authored. M39
 * (`docs/M39_ULTRA.md` §5, package W7's generator).
 *
 * The same shape and the same part buckets as `data/renderCost.ts:PART_COSTS`
 * and `render/enhancedCatalog.ts`, and under `render/` for the same reason:
 * nothing in `level/`, `simulation/` or `data/` may import it
 * (`src/architecture.test.ts`), so Ultra's geometry can only ever be priced
 * after a plan is immutable, against Ultra's own envelope.
 *
 * **What a line means.** Each entry is one instance of that part as
 * `render/props.ts` builds it under `ULTRA_FULL` — the full rung, both kit
 * switches on — measured by `render/renderCost.ts:measurePartTriangles`. So
 * a part with an Ultra form or building builder carries that builder's
 * price, and every other part carries the enhanced or baseline price it has
 * on an ordinary world. The cast flag is the full rung's (`ultraCasts`: the
 * building parts cast under `kit.buildings`), which `ultraCost` charges as a
 * cast flip. `ultraCost.ts:ultraPartTriangles` decides, per rung, which lines
 * a rung actually draws: `ultra-lit`'s trees are the enhanced trees.
 *
 * **Nothing below is hand-maintained.** `node tools/render-cost.mjs --write`
 * regenerates every line from the built Ultra kit (the integrator, W8, runs
 * it after W3's forms land), and `ultraCost.test.ts` fails if file and
 * geometry disagree. Every part has a line, in `PROP_PART_IDS` order; the two
 * fields of an entry sit on one line and nothing may come between them — the
 * regenerator rewrites each line with the one pattern `enhancedCatalog.ts`
 * uses, and a part without a line is an error rather than a stale price.
 */
import type { PartCost, PropPartId } from '../../data/renderCost.ts';

export const ULTRA_PART_COSTS: Readonly<Record<PropPartId, PartCost>> = Object.freeze({
  trunk: { triangles: 52, castsShadow: true },
  crown: { triangles: 400, castsShadow: true },
  coniferFoliage: { triangles: 216, castsShadow: true },
  shrub: { triangles: 80, castsShadow: true },
  lampPost: { triangles: 94, castsShadow: true },
  lampHead: { triangles: 44, castsShadow: false },
  benchWood: { triangles: 72, castsShadow: true },
  benchMetal: { triangles: 48, castsShadow: true },
  litterBin: { triangles: 92, castsShadow: true },
  bollardCap: { triangles: 20, castsShadow: false },
  signPost: { triangles: 30, castsShadow: true },
  signPlate: { triangles: 32, castsShadow: false },
  fenceBay: { triangles: 54, castsShadow: true },
  buildingBody: { triangles: 68, castsShadow: true },
  buildingLow: { triangles: 36, castsShadow: true },
  buildingTall: { triangles: 180, castsShadow: true },
  buildingCap: { triangles: 44, castsShadow: true },
  tyreStack: { triangles: 576, castsShadow: true },
  gantrySpan: { triangles: 984, castsShadow: true },
  roofGable: { triangles: 20, castsShadow: true },
});
