/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Reusable wheel topology for the same compiled scratch evaluator as human. */
import type { RiderOccupancyIntervalInput } from './riderOccupancy.ts';
import type { Primitive } from './occupancyExpressions.ts';
import type { FoldedChainField } from './mountedHumanTemplate.ts';
import { add, c, euler, fixedVec, mul, mulQ, neg, poseDAG, rotate, sub, vadd, vec } from './occupancyExpressions.ts';
export function buildWheelTemplate(input: RiderOccupancyIntervalInput) {
  const p = poseDAG(input), k = input.coefficients;
  const ground = mulQ(euler(p.groundPitch, c(0), p.groundRoll), euler(p.wheelPitch, c(0), neg(p.rollAngle)));
  const machineRoll = sub(add(neg(add(p.wobbleRoll, p.styleRoll)), mul(c(k.stance.restWheelLean), p.restFactor)), p.wheelCrashLean);
  const machine = mulQ(ground, euler(c(0), add(add(p.wobbleYaw, p.styleYaw), p.wheelCrashSpin), machineRoll));
  const origin = rotate(ground, vec(c(0), p.wheelCrashPop, c(0))), bodyOrigin = vadd(origin, rotate(machine, vec(c(0), p.suspensionOffset, c(0))));
  const primitives: Primitive[] = [];
  for (const [at, dimensions] of [[origin, k.wheelTyre], [bodyOrigin, k.wheelBody]] as const)
    for (const x of [dimensions.minX, dimensions.maxX]) for (const y of [dimensions.minY, dimensions.maxY]) for (const z of [dimensions.minZ, dimensions.maxZ])
      primitives.push({ component: 'wheel', kind: 'sphere', centre: vadd(at, rotate(machine, fixedVec(x, y, z))), radius: c(0) });
  return { primitives, foldedChains: [] as FoldedChainField[] };
}
