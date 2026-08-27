/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { ActionSnapshot, PressedAction } from './actions.ts';

/**
 * The seat's view of intent — the seam M25 rests on (docs/PLANS.md §25.3).
 *
 * Exactly what `Game` consumes *per rider* from `ActionState`, and nothing
 * more: `sample` at each read site, `consume` for each claimed one-shot. The
 * narrowness is the design, settled before Phase 0 froze the vocabulary:
 * everything else `ActionState` can do — device writes, the layout-change
 * reset, the QA bridge's scripted values — is device *lifecycle*, and
 * lifecycle belongs to whoever owns devices. Today that is `Game` holding
 * the concrete `ActionState`; at M25 Phase 4 it becomes the input router. A
 * source that could clear devices would be a seat reaching into hardware it
 * does not own.
 *
 * `ActionState` satisfies this interface structurally, with no edits —
 * which is the Phase 0 proof that the seam renames reality rather than
 * changing it. A scripted source is a dozen lines (`riderSource.test.ts`
 * builds one); `CpuRider` already fills an `ActionSnapshot` per step and
 * could be wrapped the day a mode needs it.
 *
 * Nothing under `simulation/` learns this word. The controller keeps taking
 * an `ActionSnapshot` per step, exactly as it has since M1 — a source is
 * how a seat *gets* snapshots, not a new thing snapshots know about.
 */
export interface RiderSource {
  /** One plain snapshot of current intent. See `ActionState.sample`. */
  sample(nowSeconds: number): ActionSnapshot;
  /** Claim a pending one-shot. True at most once per press. */
  consume(action: PressedAction, nowSeconds: number): boolean;
}
