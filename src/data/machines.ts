/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { WHEEL } from './tuning.ts';
import type { CharacterId } from './riders.ts';

/**
 * The machines — which wheel a rider is standing on, as plain data.
 *
 * **This file exists because a second machine does.** M19 gives Red Rider the
 * customized red wheel he actually rides, and until now there was exactly one
 * machine in the game: `render/euc.ts` took no arguments, and every rider, the
 * Time-trial ghost and M18's cop all stood on the same grey shell.
 *
 * It is deliberately the same shape as `data/riders.ts`, for the same reasons
 * and under the same three rules — plain data with no `three` import, so
 * `simulation/` may read it (invariant 1); appearance only, so the choice can
 * live in `GameOptions` without breaching the options firewall (invariant 5);
 * and never part of level identity, so a best time survives a machine swap.
 * The *geometry* of a machine lives in `render/machineLook.ts` and its colours
 * live in `data/tuning.ts` with every other colour (invariant 4).
 *
 * ## The one rule this file adds: `MACHINE_CONTRACT`
 *
 * A machine may vary its shell, its panels, its lights, its paint and whatever
 * it bolts on. It may **not** vary the four numbers below, and that is not
 * conservatism — it is the difference between a second *look* and a second
 * *milestone*. Those four are the complete set of `WHEEL` values that reach
 * `simulation/`, `render/rider.ts` or `render/chaseCamera.ts`, measured across
 * the tree rather than remembered:
 *
 *   - `tyreDiameter` — the contact patch, the rolling radius, and the height
 *     the whole rig is built up from.
 *   - `pedalSpan` and `pedalHeight` — where the boots are planted. The IK
 *     solves both legs against them, `render/riderEuc.test.ts` asserts the
 *     planted-boots property, and `render/riderClearance.test.ts` proves
 *     garment clearance in poses derived from them.
 *   - `suspensionTravel` — how far the sprung mass moves, which M4's ride and
 *     the chase camera's spring were both tuned against.
 *
 * A machine free to move any of those is a second chase-camera tuning and a
 * second set of expected pose values. `render/riderLook.ts` rule 1 refuses
 * exactly this for riders — one skeleton, many looks — and this is that rule
 * again, one layer down.
 */

/** Every machine the renderer can build. */
export type MachineId = 'standard' | 'red-rider';

export interface MachineSpec {
  readonly id: MachineId;
  /** Shown wherever a machine is named. Not a manufacturer — see `NOTICE.md`. */
  readonly name: string;
  /** One line. Says what it is, not what it does. */
  readonly blurb: string;
}

export const MACHINES: readonly MachineSpec[] = Object.freeze([
  Object.freeze({
    id: 'standard' as MachineId,
    name: 'Standard wheel',
    blurb: 'The fictional suspension EUC the game has always shipped. '
      + 'Grey shell, blue accents, one honest headlight.',
  }),
  /**
   * Red Rider's own machine, and the reason this table exists.
   *
   * The reference notes are explicit that it is *"a personally customized
   * machine, not a generic stock EUC"* and that replacing it with a black
   * wheel carrying small red accents is the wrong answer. Red bodywork over a
   * black core, a saddle, red guards, and his nameplate bolted to both sides.
   */
  Object.freeze({
    id: 'red-rider' as MachineId,
    name: "Red Rider's wheel",
    blurb: 'Red bodywork over black, a saddle, and his name on the side. '
      + 'Built by hand, and it shows.',
  }),
]);

export const MACHINE_IDS: readonly MachineId[] =
  Object.freeze(MACHINES.map((machine) => machine.id));

export const DEFAULT_MACHINE: MachineId = 'standard';

/**
 * The `WHEEL` keys a machine look may never carry. See the file comment.
 *
 * A list of *names* rather than of values, because the point is to name the
 * boundary: `machineContract()` below reads the live numbers through it, so
 * the contract and the tuning table cannot drift apart the way a hand-copied
 * constant would.
 */
export const MACHINE_CONTRACT = Object.freeze([
  'tyreDiameter',
  'pedalSpan',
  'pedalHeight',
  'suspensionTravel',
] as const);

export type MachineContractKey = (typeof MACHINE_CONTRACT)[number];

/** The four shared numbers, live from `WHEEL`. Every machine measures to these. */
export function machineContract(): Readonly<Record<MachineContractKey, number>> {
  return Object.freeze({
    tyreDiameter: WHEEL.tyreDiameter,
    pedalSpan: WHEEL.pedalSpan,
    pedalHeight: WHEEL.pedalHeight,
    suspensionTravel: WHEEL.suspensionTravel,
  });
}

/**
 * Which machine a rider turns up on.
 *
 * **The map is here and nowhere else, because §13 q29 is open.** The
 * architecture decision is taken: a machine is a *separate axis* from a
 * character, so the wheel designer arrives later as a screen rather than as a
 * refactor. The player-facing half — whether Cool Rider may also ride the red
 * wheel — is the owner's, and answering it either way is an edit to this one
 * function rather than a change to any type.
 *
 * The cop rides the standard machine deliberately: he is not a character the
 * player may be, and giving the chase's threat somebody else's personal wheel
 * would read as a stolen bike.
 */
export function machineForCharacter(character: CharacterId): MachineId {
  return character === 'red-rider' ? 'red-rider' : DEFAULT_MACHINE;
}

/** Look a machine up, falling back the way `characterSpec` does, and for the same reason. */
export function machineSpec(id: MachineId): MachineSpec {
  return MACHINES.find((machine) => machine.id === id) ?? MACHINES[0];
}
