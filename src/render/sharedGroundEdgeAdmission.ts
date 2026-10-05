/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { edgeAssemblyJoinMismatches } from './sharedGroundEdgeAssembly.ts';
import { sharedEdgeSourceIntegrityFailures } from './sharedGroundEdgeSelective.ts';
import type { PreparedEnvironmentSupplements } from './environmentSupplementPrice.ts';
/** Whole construction admission, before GPU allocation. Physical plan unchanged. */
import type { LevelPlan } from '../level/plan.ts';
import { prepareSharedGroundEdges, type PreparedGroundEdges } from './sharedGroundEdgePlan.ts';
import { selectPresentation, type PresentationRecipeId, type PresentationSelection } from './presentation.ts';
export interface GroundEdgeRefusal {
  readonly reason: 'source-edge-join' | 'source-edge-selection' | 'ordinary-envelope';
  readonly detail: readonly string[];
  readonly proposed: PreparedGroundEdges['price'];
}
export function admitSharedGroundEdges(plan: LevelPlan, forced?: PresentationRecipeId, supplements: PreparedEnvironmentSupplements | null = null): {
  readonly prepared: PreparedGroundEdges | null;
  readonly refusal: GroundEdgeRefusal | null;
  readonly selection: PresentationSelection;
} {
  return judgePreparedGroundEdges(plan, prepareSharedGroundEdges(plan), forced, supplements);
}
/** Same pure decision used by the runtime, exposed for known-bad controls. */
export function judgePreparedGroundEdges(plan: LevelPlan, prepared: PreparedGroundEdges, forced?: PresentationRecipeId, supplements: PreparedEnvironmentSupplements | null = null): {
  readonly prepared: PreparedGroundEdges | null;
  readonly refusal: GroundEdgeRefusal | null;
  readonly selection: PresentationSelection;
} {
  if (prepared.source !== plan) throw new Error('Ground edge admission source world mismatch');
  const priced = selectPresentation(plan, prepared.price, supplements);
  // The legacy selector always returns baseline, even if it breaches. Added
  // construction cannot use that exception. Refuse the complete assembly;
  // keep all physical ground and old render geometry, with an honest report.
  const baseline = priced.verdicts.find(verdict => verdict.recipe === 'baseline');
  if (!baseline) throw new Error('Ground edge admission needs the baseline verdict');
  const forcedVerdict = forced ? priced.verdicts.find(verdict => verdict.recipe === forced) : null;
  if (forced && !forcedVerdict) throw new Error('Ground edge admission cannot price the forced recipe');
  const detail = [...baseline.breaches, ...(forcedVerdict?.breaches ?? [])];
  const joinFailures = prepared.joinFailures.length ? prepared.joinFailures : edgeAssemblyJoinMismatches(plan.heightfield, prepared.assembly, plan);
  const integrity = sharedEdgeSourceIntegrityFailures(plan, prepared.assembly);
  const refusal: GroundEdgeRefusal | null = joinFailures.length
    ? { reason: 'source-edge-join', proposed: prepared.price,
      detail: joinFailures.map(failure => JSON.stringify(failure)) }
    : integrity.length ? { reason: 'source-edge-selection', proposed: prepared.price, detail: integrity.map(failure => JSON.stringify(failure)) }
    : prepared.assembly.report.selectionRefusal
      ? { reason: 'source-edge-selection', proposed: prepared.price, detail: [prepared.assembly.report.selectionRefusal] }
      : detail.length ? { reason: 'ordinary-envelope', proposed: prepared.price, detail } : null;
  return { prepared: refusal ? null : prepared, refusal,
    selection: refusal ? selectPresentation(plan, null, supplements) : priced };
}
