/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact mounted envelope emissions, compiled once from caller-owned coefficients. */
import type { RiderOccupancyCoefficients, RiderOccupancyIntervalInput } from './riderOccupancy.ts';
import { abs, add, c, clamp, clamp01, euler, fixedVec, lerp, max, min, mix, mul, mulQ, neg, oneMinus, poseDAG, rotate, sqrt01, squareLength, sub, sum, vadd, vec, vsub, type Primitive, type Q, type Scalar, type Vec } from './occupancyExpressions.ts';
export interface FoldedChainField { readonly squaredReach: Scalar; readonly thresholdSquared: number; readonly primitiveIndex: number; readonly strict: boolean }
export interface OccupancyTemplateDAG { readonly primitives: readonly Primitive[]; readonly foldedChains: readonly FoldedChainField[] }
function assertMounted(input: RiderOccupancyIntervalInput): void {
  // Affine blend cannot become positive when both endpoint blends are <= 0.
  if (input.previous.ragdollBlend > 0 || input.current.ragdollBlend > 0)
    throw new RangeError('Mounted human interval rejects active ragdollBlend; use the active-rag certificate for positive blend');
}

/**
 * All live envelope branch unions and coefficients, with the IK bend solve
 * removed exactly as buildOccupancy(..., true) removes it. The sole deliberate
 * widening is an trajectory-owned folded-chain field: if squared reach cannot
 * be certified above the unequal-bone threshold, its full folded sphere is
 * present throughout this graph's interval. POINT consumes that same field.
 * No target samples, angular travel constants or endpoint padding are used.
 */
export function buildMountedHumanTemplateDAG(input: RiderOccupancyIntervalInput): OccupancyTemplateDAG {
  assertMounted(input);
  const p = poseDAG(input), k = input.coefficients, a = k.stance;
  const rest = clamp01(p.restFactor), crash = clamp01(p.crashBlend), active = mul(oneMinus(rest), oneMinus(crash));
  const reverse = mul(clamp01(p.reverseBlend), active), sway = mul(clamp(p.styleSway, -1, 1), active), wobble = mul(clamp01(p.wobbleFight), active);
  const groundLean = mulQ(euler(p.groundPitch, c(0), p.groundRoll), euler(p.wheelPitch, c(0), neg(p.rollAngle)));
  const machineRoll = sub(add(neg(add(p.wobbleRoll, p.styleRoll)), mul(c(a.restWheelLean), p.restFactor)), p.wheelCrashLean);
  const root = rotate(groundLean, vec(p.crashLateral, sub(p.suspensionOffset, p.crashDrop), p.crashForward));
  const rootQ = mulQ(groundLean, euler(p.crashTumble, c(0), p.crashRoll));
  const amount = min(c(1), mul(abs(p.rollAngle), c(1 / a.carveReactionFullRoll)));
  const technical = mul(clamp01(abs(p.technicalTurn)), active);
  const load = clamp(mul(p.riderPitch, c(1 / a.loadReactionFullPitch)), -1, 1), driving = max(c(0), load), bracing = max(c(0), neg(load));
  const tuck = mul(clamp01(p.tuck), active), attack = mul(clamp01(p.attack), active), carving = mul(clamp01(p.carveStance), active);
  const air = mul(clamp01(p.airBlend), oneMinus(rest)), settled = max(rest, crash);
  const shift = sub(mul(driving, c(a.accelHipShiftMax)), mul(bracing, c(a.brakeHipShiftMax)));
  const pedalQ = euler(c(0), add(p.wobbleYaw, p.styleYaw), machineRoll);
  const bootQ = mulQ(rootQ, pedalQ), primitives: Primitive[] = [], foldedChains: FoldedChainField[] = [];
  const sphere = (centre: Vec, radius: number | Scalar): void => { primitives.push({ component: 'human', kind: 'sphere', centre, radius: typeof radius === 'number' ? c(radius) : radius }); };
  // `tightLimbs` (2026-10-04): buildOccupancy's lens, and no released boot, exactly.
  const tight = k.tightLimbs === true;
  const lens = (upper: number, lower: number, squaredReach: Scalar): Scalar =>
    sqrt01(mul(c(upper * lower), sub(c(1), mul(squaredReach, c(1 / ((upper + lower) * (upper + lower)))))));
  const at = (q: Q, root: Vec, local: Vec): Vec => vadd(root, rotate(q, local));
  const box = (dimensions: RiderOccupancyCoefficients['torso'], origin: Vec, q: Q): void => {
    for (const x of [dimensions.minX, dimensions.maxX]) for (const y of [dimensions.minY, dimensions.maxY]) for (const z of [dimensions.minZ, dimensions.maxZ])
      sphere(at(q, origin, fixedVec(x, y, z)), 0);
  };
  const folded = (_name: string, origin: Vec, target: Vec, q: Q, root: Vec, upper: number, lower: number, radius: number, strict = false): void => {
    const squaredReach = squareLength(vsub(target, origin));
    const thresholdSquared = (upper - lower) ** 2;
    foldedChains.push({ squaredReach, thresholdSquared, primitiveIndex: primitives.length, strict });
    sphere(at(q, root, origin), radius);
  };
  const chain = (name: string, origin: Vec, target: Vec, q: Q, root: Vec, upper: number, lower: number,
    radius: number, endpointRadius: number, carry?: RiderOccupancyCoefficients['handCarry'], widest?: Scalar): void => {
    const carryRadius = carry ? Math.hypot(Math.max(Math.abs(carry.axialFrom), Math.abs(carry.axialTo)), carry.radial) : 0;
    const distalRadius = Math.max(endpointRadius, carryRadius);
    if (!tight) sphere(at(q, root, origin), upper + radius);
    else sphere(at(q, root, mix(origin, target, c(upper / (upper + lower)))),
      add(widest ? max(widest, lens(upper, lower, squareLength(vsub(target, origin)))) : lens(upper, lower, squareLength(vsub(target, origin))), c(radius)));
    sphere(at(q, root, target), distalRadius);
    folded(name, origin, target, q, root, upper, lower, upper + lower + distalRadius);
    // The live envelope returns target rather than an IK-normalized endpoint.
  };
  for (const style of [0, 1]) {
    const squat = min(c(a.squatMax), sum(
      mul(mul(mul(c(a.carveSquatMax), amount), oneMinus(technical)), c(1)),
      mul(driving, c(a.accelSquatMax)), mul(bracing, c(a.brakeSquatMax)),
      mul(mul(clamp01(p.crouch), oneMinus(rest)), c(a.crouchHipDrop)),
      mul(tuck, c(a.tuckHipDrop)), mul(mul(attack, c(a.attackHipDrop)), oneMinus(amount)),
      mul(mul(wobble, c(a.wobbleHipDrop)), c(1 + style * k.motion.staggerHips)), mul(reverse, c(a.reverseSquat))));
    const torsoPitch = min(c(a.tuckTorsoPitchMax), sum(sub(p.riderPitch, p.wheelPitch), c(a.torsoRestPitch),
      mul(tuck, c(a.tuckTorsoPitch)), max(mul(attack, c(a.attackTorsoPitch)), mul(carving, c(a.carveStanceTorsoPitch)))));
    const pelvis = vec(mul(c(a.restHipShift), rest), lerp(sub(c(k.hipHeight), squat), c(a.restHipHeight), settled),
      mul(sub(shift, mul(attack, c(a.attackHipShift))), oneMinus(settled)));
    const pelvisQ = euler(torsoPitch, add(mul(p.riderTurnTwist, oneMinus(reverse)), mul(reverse, c(a.reverseTorsoTwist))),
      sub(sub(mul(neg(sub(p.riderRoll, p.rollAngle)), c(1 - style * k.motion.overLean)), mul(reverse, c(a.reverseShoulderRoll))),
        mul(mul(sway, c(style)), c(k.motion.swayPelvisRoll))));
    const upperQ = mulQ(rootQ, pelvisQ), upperRoot = at(rootQ, root, pelvis);
    box(k.torso, upperRoot, upperQ);
    if (k.head) sphere(at(upperQ, upperRoot, fixedVec(0, k.head.y, k.head.z)), k.head.radius);
    for (const side of [-1, 1]) for (const role of ['inside', 'outside', 'neutral']) {
      const inside = role === 'inside', outside = role === 'outside', name = `${style}/${side}/${role}`;
      const drop = sum(squat, inside ? mul(mul(c(a.carveInsideHipDropMax), amount), oneMinus(technical)) : c(0),
        outside ? mul(mul(c(a.technicalTurnOutsideHipDropMax), amount), technical) : c(0));
      const hip = vec(add(c(side * a.torsoWidth * .26), mul(c(a.restHipShift), rest)),
        lerp(sub(c(k.hipHeight), drop), c(a.restHipHeight), settled), mul(shift, oneMinus(settled)));
      const pedal = rotate(pedalQ, fixedVec(side * a.stanceHalfWidth, k.pedalHeight + a.ankleAbovePedal, 0));
      const settling = max(side > 0 ? rest : c(0), crash);
      const footAdjust = mul(mul(mul(mul(c(-side), clamp(p.wobbleSway, -1, 1)), clamp01(p.wobbleFootCorrection)), active), c(a.wobbleFootAdjust));
      for (const outboard of [side * a.crashFootOutboard, a.restFootOutboard]) for (const struck of [0, 1]) {
        const foot = vec(lerp(pedal.x, c(outboard), settling),
          lerp(add(pedal.y, c(a.pedalStrikeFootLift * struck)), sub(c(a.ankleAbovePedal), p.suspensionOffset), settling),
          lerp(add(pedal.z, footAdjust), c(-a.restFootBack), settling));
        const footName = `${name}/${outboard}/${struck}`;
        chain(`${footName}/supported`, hip, foot, rootQ, root, a.thighLength, a.shinLength, k.legRadius, k.legRadius);
        box(k.boot, at(rootQ, root, foot), bootQ);
        // Envelope mode always includes both release signs, even on the ground.
        if (tight) continue;
        sphere(at(rootQ, root, hip), a.thighLength + k.legRadius);
        const freed = mix(foot, vec(add(pedal.x, c(side * a.oneFootOutboard)), add(pedal.y, c(a.oneFootRise)), sub(pedal.z, c(a.oneFootTrail))), active);
        chain(`${footName}/released`, hip, freed, rootQ, root, a.thighLength, a.shinLength, k.legRadius, k.legRadius);
        box(k.boot, at(rootQ, root, freed), bootQ);
      }
      const splay = sum(mul(add(driving, bracing), c(a.armLoadSplay)), mul(amount, c(inside ? -a.armCarveInsideTuck : a.armCarveOutsideSplay)),
        mul(air, c(a.airArmSplay)), mul(mul(wobble, c(a.wobbleArmSplay)), c(1 + style * k.motion.staggerArms)), mul(crash, c(a.crashArmSplay)),
        mul(mul(mul(sway, c(side)), c(style)), c(k.motion.swayArmSplay)), mul(tuck, c(a.tuckArmSplay)), mul(attack, c(a.attackArmSplay)),
        inside ? c(0) : mul(carving, c(a.carveStanceOutsideSplay)), mul(reverse, c(a.reverseArmSplay)));
      const forward = add(add(sub(sub(sub(mul(bracing, c(a.armBrakeForward)), mul(driving, c(a.armAccelBack))), mul(tuck, c(a.tuckArmBack))), mul(attack, c(a.attackArmBack))),
        mul(carving, c(inside ? -a.carveStanceInsideBack : a.carveStanceOutsideForward))), mul(mul(mul(sway, c(side)), c(style)), c(k.motion.swayArmSwing)));
      const rise = add(add(sub(sub(sum(inside ? c(0) : mul(amount, c(a.armCarveOutsideRise)), mul(air, c(a.airArmRise)),
        mul(mul(wobble, c(a.wobbleArmRise)), c(1 + style * k.motion.staggerArms))), mul(tuck, c(a.tuckArmDrop))), mul(attack, c(a.attackArmDrop))),
        mul(carving, c(inside ? a.carveStanceInsideRise : -a.carveStanceOutsideDrop))), mul(crash, c(a.crashArmRise)));
      const shoulder = fixedVec(side * a.shoulderHalfWidth, a.torsoLength, 0);
      let armLens: Scalar | undefined;
      if (tight) {
        const nearest = (first: Scalar, second: Scalar) => max(min(first, second), min(c(0), max(first, second)));
        const out = add(c(a.armSplay + (side < 0 ? a.armAsymmetrySplay : 0)), splay);
        const drop = sub(rise, c((a.upperArmLength + a.forearmLength) * a.armHangFraction));
        const x = nearest(add(out, c(k.carriage.minSplay)), add(out, c(k.carriage.maxSplay)));
        const y = nearest(add(drop, c(k.carriage.minRise)), add(drop, c(k.carriage.maxRise)));
        const z = add(c(a.handForward + (side < 0 ? a.armAsymmetryForward : 0)), forward);
        armLens = lens(a.upperArmLength, a.forearmLength, squareLength(vec(x, y, z)));
      } else sphere(at(upperQ, upperRoot, shoulder), a.upperArmLength + k.armRadius);
      for (const carriage of [k.carriage.minSplay, k.carriage.maxSplay]) for (const carriageRise of [k.carriage.minRise, k.carriage.maxRise]) {
        const hand = vec(mul(c(side), sum(c(a.shoulderHalfWidth + a.armSplay + (side < 0 ? a.armAsymmetrySplay : 0) + carriage), splay)),
          add(c(a.torsoLength - (a.upperArmLength + a.forearmLength) * a.armHangFraction + carriageRise), rise),
          add(c(a.handForward + (side < 0 ? a.armAsymmetryForward : 0)), forward));
        const handName = `${name}/${carriage}/${carriageRise}`;
        chain(`${handName}/arm`, shoulder, hand, upperQ, upperRoot, a.upperArmLength, a.forearmLength, k.armRadius, k.handRadius, k.handCarry, armLens);
        sphere(at(upperQ, upperRoot, hand), k.handRadius);
        folded(`${handName}/hand-extra`, shoulder, hand, upperQ, upperRoot, a.upperArmLength, a.forearmLength,
          a.upperArmLength + a.forearmLength + k.handRadius, true);
      }
    }
  }
  return { primitives, foldedChains };
}
