/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Plain physical occupancy. No scene graph, roster identity or player option. */
export interface RiderOccupancyPose {
  readonly x: number; readonly y: number; readonly z: number; readonly headingY: number;
  readonly groundPitch: number; readonly groundRoll: number;
  readonly wheelPitch: number; readonly rollAngle: number; readonly riderRoll: number;
  readonly riderPitch: number; readonly riderTurnTwist: number; readonly technicalTurn: number;
  readonly suspensionOffset: number; readonly restFactor: number; readonly reverseBlend: number;
  readonly crouch: number; readonly tuck: number; readonly attack: number; readonly carveStance: number;
  readonly airBlend: number; readonly airHeight: number;
  readonly wobbleYaw: number; readonly wobbleRoll: number; readonly wobbleFight: number;
  readonly wobbleFootCorrection: number; readonly wobbleSway: number; readonly pedalStrike: number;
  readonly styleYaw: number; readonly styleRoll: number; readonly styleSway: number;
  readonly crashBlend: number; readonly crashLateral: number; readonly crashForward: number;
  readonly crashDrop: number; readonly crashTumble: number; readonly crashRoll: number;
  readonly wheelCrashSpin: number; readonly wheelCrashLean: number; readonly wheelCrashPop: number;
  readonly ragdollBlend: number; readonly ragdoll: ArrayLike<number>;
}

export interface RiderOccupancyBounds {
  readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number;
  readonly minZ: number; readonly maxZ: number;
}

/** Numbers are supplied by the composition root's common tuning table. */
export interface RiderOccupancyCoefficients {
  readonly hipHeight: number; readonly pedalHeight: number;
  readonly stance: Readonly<Record<string, number>>;
  readonly wheelBody: RiderOccupancyBounds; readonly wheelTyre: RiderOccupancyBounds;
  readonly torso: RiderOccupancyBounds; readonly boot: RiderOccupancyBounds;
  readonly headLollExpansion: number;
  readonly carriage: { readonly minSplay: number; readonly maxSplay: number; readonly minRise: number; readonly maxRise: number };
  readonly legRadius: number; readonly armRadius: number; readonly handRadius: number;
  readonly handCarry: { readonly axialFrom: number; readonly axialTo: number; readonly radial: number };
  readonly motion: { readonly overLean: number; readonly swayPelvisRoll: number; readonly staggerHips: number;
    readonly staggerArms: number; readonly swayArmSplay: number; readonly swayArmSwing: number };
  readonly trajectoryPointStep: number;
  /**
   * Optional contact-core parts (VIS-CRASH-1, 2026-10-04). `head`: a sphere in
   * the pelvis frame, for a torso box that stops at the shoulders, so a rider
   * pitched over the bars does not carry a box corner a third of a metre ahead
   * of their face. `tightLimbs`: a mounted elbow or knee is bounded by the
   * sphere about its chord that holds its exact circle (the lens), not by the
   * whole upper-bone sphere, and the one-foot air pose's released boot is
   * left out. The lens is exact for the skeleton; what the core leaves out is
   * garment, hair, carried-prop and that boot's slack (`RIDER_CONTACT`).
   */
  readonly head?: { readonly y: number; readonly z: number; readonly radius: number };
  readonly tightLimbs?: boolean;
}

/**
 * The radius of the sphere about the chord point `upper / (upper + lower)` of
 * the way along that holds every elbow (knee) of a two-bone chain whose ends
 * are `reach` apart: sqrt(ul (1 - d^2 / (u + l)^2)), by Stewart's theorem.
 * Overreach leaves the joint on the chord; a fold is the folded sphere's.
 */
const lensRadius = (upper: number, lower: number, squaredReach: number): number =>
  Math.sqrt(Math.max(0, upper * lower * (1 - squaredReach / ((upper + lower) * (upper + lower)))));

/** Signed bounds remain about the wheel-base heading frame, not their centre. */
export interface RiderOccupancyPrism extends RiderOccupancyBounds {
  readonly component: 'wheel' | 'human';
  readonly x: number; readonly y: number; readonly z: number; readonly headingY: number;
  readonly centreX: number; readonly centreY: number; readonly centreZ: number;
  readonly halfWidth: number; readonly halfHeight: number; readonly halfLength: number;
  readonly baseY: number; readonly topY: number;
}

export interface RiderOccupancy {
  readonly wheel: RiderOccupancyPrism;
  readonly human: RiderOccupancyPrism;
}

type V = readonly [number, number, number];
type Q = readonly [number, number, number, number];
type Box = { -readonly [K in keyof RiderOccupancyBounds]: number };
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V, n: number): V => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal = (a: V, fallback: V): V => dot(a, a) < 1e-8 ? fallback : scale(a, 1 / Math.hypot(...a));
const mix = (a: V, b: V, t: number): V => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Same XYZ Euler convention used by the articulated rig: Rx * Ry * Rz. */
function euler(x: number, y: number, z: number): Q {
  const cx = Math.cos(x / 2), cy = Math.cos(y / 2), cz = Math.cos(z / 2);
  const sx = Math.sin(x / 2), sy = Math.sin(y / 2), sz = Math.sin(z / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}
function mul(a: Q, b: Q): Q {
  return [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
const inverse = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
function rotate(q: Q, p: V): V {
  const t = scale(cross([q[0], q[1], q[2]], p), 2);
  return add(p, add(scale(t, q[3]), cross([q[0], q[1], q[2]], t)));
}
function slerp(a: Q, b: Q, t: number): Q {
  let cosine = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (cosine < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; cosine = -cosine; }
  if (cosine > 1 - Number.EPSILON) return a;
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  if (sine < 1e-8) {
    const q: Q = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
    const length = Math.hypot(...q); return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  }
  const angle = Math.atan2(sine, cosine), s0 = Math.sin((1 - t) * angle) / sine, s1 = Math.sin(t * angle) / sine;
  return [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1, a[3] * s0 + b[3] * s1];
}
function basisQuaternion(x: V, y: V, z: V): Q {
  const trace = x[0] + y[1] + z[2];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1); return [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, 0.25 / s];
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]); return [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
  }
  if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]); return [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
  }
  const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]); return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s];
}
const freshBox = (): Box => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
function point(box: Box, p: V, radius = 0): void {
  box.minX = Math.min(box.minX, p[0] - radius); box.maxX = Math.max(box.maxX, p[0] + radius);
  box.minY = Math.min(box.minY, p[1] - radius); box.maxY = Math.max(box.maxY, p[1] + radius);
  box.minZ = Math.min(box.minZ, p[2] - radius); box.maxZ = Math.max(box.maxZ, p[2] + radius);
}
function transformedBox(box: Box, local: RiderOccupancyBounds, origin: V, q: Q): void {
  for (const x of [local.minX, local.maxX]) for (const y of [local.minY, local.maxY]) for (const z of [local.minZ, local.maxZ])
    point(box, add(origin, rotate(q, [x, y, z])));
}

/** All points of the axial segment and its perpendicular disc, including caps. */
function axialCylinder(box: Box, endpoint: V, direction: V, carry: RiderOccupancyCoefficients['handCarry']): void {
  const from = add(endpoint, scale(direction, carry.axialFrom)), to = add(endpoint, scale(direction, carry.axialTo));
  const rx = carry.radial * Math.sqrt(Math.max(0, 1 - direction[0] * direction[0]));
  const ry = carry.radial * Math.sqrt(Math.max(0, 1 - direction[1] * direction[1]));
  const rz = carry.radial * Math.sqrt(Math.max(0, 1 - direction[2] * direction[2]));
  box.minX = Math.min(box.minX, from[0] - rx, to[0] - rx); box.maxX = Math.max(box.maxX, from[0] + rx, to[0] + rx);
  box.minY = Math.min(box.minY, from[1] - ry, to[1] - ry); box.maxY = Math.max(box.maxY, from[1] + ry, to[1] + ry);
  box.minZ = Math.min(box.minZ, from[2] - rz, to[2] - rz); box.maxZ = Math.max(box.maxZ, from[2] + rz, to[2] + rz);
}

/** The two bones keep their lengths even if their target is beyond reach. */
function chain(box: Box, origin: V, target: V, bend: V, q: Q, root: V,
  upper: number, lower: number, radius: number, endpointRadius: number,
  carry?: RiderOccupancyCoefficients['handCarry'], envelope = false, lens?: number): V {
  const toward = sub(target, origin), reach = Math.hypot(...toward);
  if (envelope) {
    // Every elbow/knee lies on the upper-bone sphere. Every reachable distal
    // endpoint is its target; an overreaching target leaves the endpoint on
    // the origin-target segment. The lower bone is inside their convex hull.
    // This representation does not inherit a bend-normal fallback jump.
    // A tight chain (`lens`, at least that radius) uses the exact circle's
    // sphere about the chord instead, which no bend normal can leave either.
    const carryRadius = carry ? Math.hypot(Math.max(Math.abs(carry.axialFrom), Math.abs(carry.axialTo)), carry.radial) : 0;
    const distalRadius = Math.max(endpointRadius, carryRadius);
    if (lens === undefined) point(box, add(root, rotate(q, origin)), upper + radius);
    else point(box, add(root, rotate(q, add(origin, scale(toward, upper / (upper + lower))))),
      Math.max(lens, lensRadius(upper, lower, dot(toward, toward))) + radius);
    point(box, add(root, rotate(q, target)), distalRadius);
    if (reach <= Math.abs(upper - lower)) point(box, add(root, rotate(q, origin)), upper + lower + distalRadius);
    return target;
  }
  let middle: V, end: V;
  if (reach < 1e-9) {
    middle = add(origin, [0, -upper, 0]); end = add(middle, [0, -lower, 0]);
  } else {
    const direction = scale(toward, 1 / reach);
    const along = clamp((upper * upper - lower * lower + reach * reach) / (2 * reach), -upper, upper);
    const perpendicular = normal(sub(bend, scale(direction, dot(bend, direction))), [0, 0, 1]);
    middle = add(origin, add(scale(direction, along), scale(perpendicular, Math.sqrt(Math.max(0, upper * upper - along * along)))));
    end = add(middle, scale(normal(sub(target, middle), [0, -1, 0]), lower));
  }
  point(box, add(root, rotate(q, origin)), radius);
  point(box, add(root, rotate(q, middle)), radius);
  point(box, add(root, rotate(q, end)), endpointRadius);
  if (carry) axialCylinder(box, add(root, rotate(q, end)), rotate(q, normal(sub(end, middle), [0, -1, 0])), carry);
  return end;
}

function prism(component: 'wheel' | 'human', b: Box, pose: RiderOccupancyPose): RiderOccupancyPrism {
  const centreX = (b.minX + b.maxX) / 2, centreY = (b.minY + b.maxY) / 2, centreZ = (b.minZ + b.maxZ) / 2;
  const c = Math.cos(pose.headingY), s = Math.sin(pose.headingY);
  return { ...b, component, centreX, centreY, centreZ,
    x: pose.x + centreX * c + centreZ * s, y: pose.y + centreY, z: pose.z - centreX * s + centreZ * c,
    headingY: pose.headingY, halfWidth: (b.maxX - b.minX) / 2, halfHeight: (b.maxY - b.minY) / 2,
    halfLength: (b.maxZ - b.minZ) / 2, baseY: pose.y + b.minY, topY: pose.y + b.maxY };
}

/**
 * Wheel and human stay separate through every crash/recovery blend. A human
 * prism is the union of its own articulated parts, never of the distant wheel.
 * Style/carriage ranges cover every roster member using common coefficients.
 * One-foot presentation is deliberately a both-sign wildcard during flight;
 * no held input or render option can enter this physical contract.
 */
function buildOccupancy(p: RiderOccupancyPose, k: RiderOccupancyCoefficients, envelope: boolean): RiderOccupancy {
  const a = k.stance, rag = clamp01(p.ragdollBlend), rest = clamp01(p.restFactor), crash = clamp01(p.crashBlend);
  // Tight limbs are the mounted body's (the rag certificate keeps its spheres).
  const tight = k.tightLimbs === true && rag <= 0;
  const active = (1 - rest) * (1 - crash), reverse = clamp01(p.reverseBlend) * active;
  const sway = clamp(p.styleSway, -1, 1) * active, wobble = clamp01(p.wobbleFight) * active;
  const groundLean = mul(euler(p.groundPitch, 0, p.groundRoll), euler(p.wheelPitch, 0, -p.rollAngle));
  const machineRoll = -(p.wobbleRoll + p.styleRoll) + a.restWheelLean * p.restFactor - p.wheelCrashLean;
  const machine = mul(groundLean, euler(0, p.wobbleYaw + p.styleYaw + p.wheelCrashSpin, machineRoll));
  const machineOrigin = rotate(groundLean, [0, p.wheelCrashPop, 0]);
  const wheel = freshBox();
  transformedBox(wheel, k.wheelTyre, machineOrigin, machine);
  transformedBox(wheel, k.wheelBody, add(machineOrigin, rotate(machine, [0, p.suspensionOffset, 0])), machine);

  let root = rotate(groundLean, [p.crashLateral, p.suspensionOffset - p.crashDrop, p.crashForward]);
  let rootQ = mul(groundLean, euler(p.crashTumble, 0, p.crashRoll));
  const headingInverse = euler(0, -p.headingY, 0);
  const particle = (index: number): V => rotate(headingInverse,
    [p.ragdoll[index * 3] - p.x, p.ragdoll[index * 3 + 1] - p.y, p.ragdoll[index * 3 + 2] - p.z]);
  if (rag > 0) {
    if (p.ragdoll.length < 33) throw new Error('Active rider occupancy requires eleven world-space ragdoll particles');
    const pelvis = particle(0), up = normal(sub(particle(1), pelvis), rotate(groundLean, [0, 1, 0]));
    const forward = normal(cross(sub(particle(3), particle(4)), up), rotate(groundLean, [0, 0, 1]));
    const lateral = normal(cross(up, forward), rotate(groundLean, [1, 0, 0]));
    const frame = basisQuaternion(lateral, up, forward);
    root = mix(root, sub(pelvis, rotate(frame, [0, k.hipHeight, 0])), rag);
    rootQ = slerp(rootQ, frame, rag);
  }
  const rootInverse = inverse(rootQ);
  const localParticle = (index: number): V => rotate(rootInverse, sub(particle(index), root));
  const human = freshBox(), amount = Math.min(1, Math.abs(p.rollAngle) / a.carveReactionFullRoll);
  const technical = clamp01(Math.abs(p.technicalTurn)) * active;
  const load = clamp(p.riderPitch / a.loadReactionFullPitch, -1, 1), driving = Math.max(0, load), bracing = Math.max(0, -load);
  const tuck = clamp01(p.tuck) * active, attack = clamp01(p.attack) * active, carving = clamp01(p.carveStance) * active;
  const air = clamp01(p.airBlend) * (1 - rest), settled = Math.max(rest, crash);
  const shift = driving * a.accelHipShiftMax - bracing * a.brakeHipShiftMax;
  const pedalQ = euler(0, p.wobbleYaw + p.styleYaw, machineRoll);
  // A common pair of style endpoints; physical channels are never combined
  // into invented maximum poses. Their actual values are used in every case.
  for (const style of [0, 1]) {
    const squat = Math.min(a.squatMax, a.carveSquatMax * amount * (1 - technical)
      + driving * a.accelSquatMax + bracing * a.brakeSquatMax + clamp01(p.crouch) * (1 - rest) * a.crouchHipDrop
      + tuck * a.tuckHipDrop + attack * a.attackHipDrop * (1 - amount)
      + wobble * a.wobbleHipDrop * (1 + style * k.motion.staggerHips) + reverse * a.reverseSquat);
    const torsoPitch = Math.min(a.tuckTorsoPitchMax, p.riderPitch - p.wheelPitch + a.torsoRestPitch
      + tuck * a.tuckTorsoPitch + Math.max(attack * a.attackTorsoPitch, carving * a.carveStanceTorsoPitch)) * (1 - rag);
    const pelvis: V = [a.restHipShift * rest * (1 - rag),
      lerp(lerp(k.hipHeight - squat, a.restHipHeight, settled), k.hipHeight, rag),
      (shift - attack * a.attackHipShift) * (1 - settled) * (1 - rag)];
    const pelvisQ = euler(torsoPitch, p.riderTurnTwist * (1 - reverse) + reverse * a.reverseTorsoTwist,
      -(p.riderRoll - p.rollAngle) * (1 - style * k.motion.overLean)
      - reverse * a.reverseShoulderRoll - sway * style * k.motion.swayPelvisRoll);
    const upperQ = mul(rootQ, pelvisQ), upperRoot = add(root, rotate(rootQ, pelvis));
    const expansion = rag * k.headLollExpansion;
    transformedBox(human, { ...k.torso, minX: k.torso.minX - expansion, maxX: k.torso.maxX + expansion,
      minZ: k.torso.minZ - expansion, maxZ: k.torso.maxZ + expansion }, upperRoot, upperQ);
    if (k.head) point(human, add(upperRoot, rotate(upperQ, [0, k.head.y, k.head.z])), k.head.radius + expansion);
    for (const side of [-1, 1]) {
      for (const role of (envelope ? ['inside', 'outside', 'neutral'] : ['actual'])) {
      const inside = role === 'inside' || (role === 'actual' && Math.sign(p.rollAngle) === side);
      const outside = role === 'outside' || (role === 'actual' && Math.sign(p.rollAngle) === -side);
      const drop = squat + (inside ? a.carveInsideHipDropMax * amount * (1 - technical) : 0)
        + (outside ? a.technicalTurnOutsideHipDropMax * amount * technical : 0);
      let hip: V = [side * a.torsoWidth * 0.26 + a.restHipShift * rest,
        lerp(k.hipHeight - drop, a.restHipHeight, settled), shift * (1 - settled)];
      hip = [lerp(hip[0], side * a.torsoWidth * 0.26, rag), lerp(hip[1], k.hipHeight, rag), hip[2] * (1 - rag)];
      const pedal = rotate(pedalQ, [side * a.stanceHalfWidth, k.pedalHeight + a.ankleAbovePedal, 0]);
      const settling = Math.max(side > 0 ? rest : 0, crash);
      for (const outboard of (envelope ? [side * a.crashFootOutboard, a.restFootOutboard]
        : [crash > (side > 0 ? rest : 0) ? side * a.crashFootOutboard : a.restFootOutboard])) {
      for (const struck of (envelope ? [0, 1] : [Number(Math.sign(p.pedalStrike) === side)])) {
      const footAdjust = -side * clamp(p.wobbleSway, -1, 1) * clamp01(p.wobbleFootCorrection) * active * a.wobbleFootAdjust;
      let foot: V = [lerp(pedal[0], outboard, settling),
        lerp(pedal[1] + a.pedalStrikeFootLift * struck, a.ankleAbovePedal - p.suspensionOffset, settling),
        lerp(pedal[2] + footAdjust, -a.restFootBack, settling)];
      if (rag > 0) foot = mix(foot, localParticle(side > 0 ? 9 : 10), rag);
      const open = Math.max(inside ? a.carveInsideKneeOpen * amount * (1 - technical) : 0, side < 0 ? a.restPedalKneeOpen * rest : 0);
      const ragUp = rotate(inverse(mul(inverse(groundLean), rootQ)), [0, 1, 0]);
      const bend: V = rag > 0 ? normal(add([0, 0, 0.35], scale(ragUp, rag)), [0, 0, 1]) : normal([side * open, 0, 1], [0, 0, 1]);
      const end = chain(human, hip, foot, bend, rootQ, root, a.thighLength, a.shinLength, k.legRadius, k.legRadius, undefined, envelope, tight ? 0 : undefined);
      transformedBox(human, k.boot, add(root, rotate(rootQ, end)), mul(rootQ, pedalQ));
      // IK's knee can leave the endpoint segment. Its upper-bone sphere
      // contains every continuous released-foot amount, for either side.
      // A tight body leaves the one-foot air pose's released boot out: it may
      // overhang behind, and the body never swells as a hop leaves the ground.
      if (!tight && (envelope || p.airHeight > 0 || p.airBlend > 0)) {
        point(human, add(root, rotate(rootQ, hip)), (a.thighLength + k.legRadius) * (1 - rag));
        let freed: V = [pedal[0] + side * a.oneFootOutboard, pedal[1] + a.oneFootRise, pedal[2] - a.oneFootTrail];
        freed = mix(foot, freed, active * (1 - rag));
        const freeEnd = chain(human, hip, freed, bend, rootQ, root, a.thighLength, a.shinLength, k.legRadius, k.legRadius, undefined, envelope);
        transformedBox(human, k.boot, add(root, rotate(rootQ, freeEnd)), mul(rootQ, pedalQ));
      }
      }
      }

      const splay = (driving + bracing) * a.armLoadSplay + amount * (inside ? -a.armCarveInsideTuck : a.armCarveOutsideSplay)
        + air * a.airArmSplay + wobble * a.wobbleArmSplay * (1 + style * k.motion.staggerArms) + crash * a.crashArmSplay
        + sway * side * style * k.motion.swayArmSplay + tuck * a.tuckArmSplay + attack * a.attackArmSplay
        + (inside ? 0 : carving * a.carveStanceOutsideSplay) + reverse * a.reverseArmSplay;
      const forward = bracing * a.armBrakeForward - driving * a.armAccelBack - tuck * a.tuckArmBack - attack * a.attackArmBack
        + (inside ? -carving * a.carveStanceInsideBack : carving * a.carveStanceOutsideForward) + sway * side * style * k.motion.swayArmSwing;
      const rise = (inside ? 0 : amount * a.armCarveOutsideRise) + air * a.airArmRise
        + wobble * a.wobbleArmRise * (1 + style * k.motion.staggerArms) - tuck * a.tuckArmDrop - attack * a.attackArmDrop
        + (inside ? carving * a.carveStanceInsideRise : -carving * a.carveStanceOutsideDrop) + crash * a.crashArmRise;
      const shoulder: V = [side * a.shoulderHalfWidth, a.torsoLength, 0];
      // The elbow circle is contained by this sphere regardless of common
      // carriage interpolation. It avoids treating two endpoints as a bone.
      // A tight arm gives every carriage corner the widest lens over the whole
      // carriage range instead: the chord points of the interpolated hands are
      // inside the corners' hull, and none sits nearer the shoulder.
      let armLens: number | undefined;
      if (tight) {
        const nearest = (first: number, second: number) => Math.max(Math.min(first, second), Math.min(0, Math.max(first, second)));
        const out = a.armSplay + (side < 0 ? a.armAsymmetrySplay : 0) + splay;
        const drop = rise - (a.upperArmLength + a.forearmLength) * a.armHangFraction;
        const x = nearest(out + k.carriage.minSplay, out + k.carriage.maxSplay), y = nearest(drop + k.carriage.minRise, drop + k.carriage.maxRise);
        const z = a.handForward + (side < 0 ? a.armAsymmetryForward : 0) + forward;
        armLens = lensRadius(a.upperArmLength, a.forearmLength, x * x + y * y + z * z);
      } else point(human, add(upperRoot, rotate(upperQ, shoulder)), a.upperArmLength + k.armRadius);
      for (const carriage of [k.carriage.minSplay, k.carriage.maxSplay]) for (const carriageRise of [k.carriage.minRise, k.carriage.maxRise]) {
        let hand: V = [side * (a.shoulderHalfWidth + a.armSplay + (side < 0 ? a.armAsymmetrySplay : 0) + carriage + splay),
          a.torsoLength - (a.upperArmLength + a.forearmLength) * a.armHangFraction + carriageRise + rise,
          a.handForward + (side < 0 ? a.armAsymmetryForward : 0) + forward];
        if (rag > 0) hand = mix(hand, rotate(inverse(pelvisQ), sub(localParticle(side > 0 ? 7 : 8), pelvis)), rag);
        chain(human, shoulder, hand, [0, 0, -1], upperQ, upperRoot,
          a.upperArmLength, a.forearmLength, k.armRadius, k.handRadius, k.handCarry, envelope, armLens);
        point(human, add(upperRoot, rotate(upperQ, hand)), k.handRadius);
        if (Math.hypot(...sub(hand, shoulder)) < Math.abs(a.upperArmLength - a.forearmLength))
          point(human, add(upperRoot, rotate(upperQ, shoulder)), a.upperArmLength + a.forearmLength + k.handRadius);
      }
      }
    }
  }
  return { wheel: prism('wheel', wheel, p), human: prism('human', human, p) };
}

export function buildRiderOccupancy(pose: RiderOccupancyPose, coefficients: RiderOccupancyCoefficients): RiderOccupancy {
  return buildOccupancy(pose, coefficients, false);
}

/**
 * Common contact model for continuous articulated sweeps. Both limb roles,
 * supported/released feet, strike states and grounding targets are unioned
 * locally around the human. Upper-bone spheres remove IK bend-normal jumps;
 * a carry circumsphere removes its lower-axis discontinuity. No branch unions
 * the human with its wheel. Particle root degeneracies remain explicit input
 * cases for the interval certificate, rather than a sampled travel guarantee.
 */
export function buildRiderOccupancyEnvelope(pose: RiderOccupancyPose, coefficients: RiderOccupancyCoefficients): RiderOccupancy {
  return buildOccupancy(pose, coefficients, true);
}

/** Scalar interpolation rebuilds articulation; interpolating endpoint boxes does not. */
export function interpolateRiderOccupancyPose(a: RiderOccupancyPose, b: RiderOccupancyPose, t: number): RiderOccupancyPose {
  t = clamp01(t);
  const result = { ...a } as { -readonly [K in keyof RiderOccupancyPose]: RiderOccupancyPose[K] };
  for (const key of Object.keys(a) as Array<keyof RiderOccupancyPose>) {
    if (key !== 'ragdoll' && typeof a[key] === 'number' && typeof b[key] === 'number')
      (result as unknown as Record<string, number>)[key] = lerp(a[key] as number, b[key] as number, t);
  }
  const ragdoll = new Float64Array(Math.max(a.ragdoll.length, b.ragdoll.length));
  for (let index = 0; index < ragdoll.length; index += 1) ragdoll[index] = lerp(a.ragdoll[index], b.ragdoll[index], t);
  result.ragdoll = ragdoll;
  return result;
}

export interface RiderOccupancyTrajectory {
  readonly from: RiderOccupancy; readonly to: RiderOccupancy;
  /** Suggested sampling only; degenerating particle frames need adaptive refinement. */
  readonly recommendedSubsteps: number;
  readonly intervalInput: RiderOccupancyIntervalInput;
  readonly envelopeFrom: RiderOccupancy; readonly envelopeTo: RiderOccupancy;
  poseAt(amount: number): RiderOccupancyPose;
  envelopeAt(amount: number): RiderOccupancy;
  at(amount: number): RiderOccupancy;
}

export interface RiderOccupancyIntervalInput {
  readonly previous: RiderOccupancyPose;
  readonly current: RiderOccupancyPose;
  readonly coefficients: RiderOccupancyCoefficients;
}

function frozenCopy<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => frozenCopy(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)]))) as T;
}

/**
 * A continuous descriptor for the caller's articulated sweep. Heading inputs
 * are unwrapped physical headings. Samples preserve two component identities;
 * no giant swept wheel/human union is manufactured here. The recommendation
 * accounts for centre, pose-angle and particle travel; it is not a CCD proof.
 */
export function createRiderOccupancyTrajectory(previous: RiderOccupancyPose, current: RiderOccupancyPose,
  coefficients: RiderOccupancyCoefficients): RiderOccupancyTrajectory {
  // Detach caller-owned pose arrays. A later writePose may reuse both buffers.
  const a = frozenCopy({ ...previous, ragdoll: Array.from(previous.ragdoll) });
  const b = frozenCopy({ ...current, ragdoll: Array.from(current.ragdoll) });
  coefficients = frozenCopy(coefficients);
  const intervalInput = Object.freeze({ previous: a, current: b, coefficients });
  const from = buildRiderOccupancy(a, coefficients), to = buildRiderOccupancy(b, coefficients);
  let travel = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  for (const component of ['wheel', 'human'] as const) travel = Math.max(travel,
    Math.hypot(to[component].x - from[component].x, to[component].y - from[component].y, to[component].z - from[component].z));
  const radius = coefficients.hipHeight + coefficients.torso.maxY + coefficients.handRadius;
  for (const angle of ['headingY', 'groundPitch', 'groundRoll', 'wheelPitch', 'rollAngle', 'riderRoll', 'riderPitch',
    'riderTurnTwist', 'wobbleYaw', 'wobbleRoll', 'styleYaw', 'styleRoll', 'crashTumble', 'crashRoll', 'wheelCrashSpin', 'wheelCrashLean'] as const)
    travel += Math.abs(b[angle] - a[angle]) * radius;
  if (a.ragdollBlend > 0 || b.ragdollBlend > 0) {
    for (let index = 0; index < Math.min(a.ragdoll.length, b.ragdoll.length); index += 3)
      travel = Math.max(travel, Math.hypot(b.ragdoll[index] - a.ragdoll[index], b.ragdoll[index + 1] - a.ragdoll[index + 1], b.ragdoll[index + 2] - a.ragdoll[index + 2]));
  }
  const poseAt = (amount: number): RiderOccupancyPose => interpolateRiderOccupancyPose(a, b, amount);
  return { from, to, intervalInput, poseAt,
    envelopeFrom: buildRiderOccupancyEnvelope(a, coefficients), envelopeTo: buildRiderOccupancyEnvelope(b, coefficients),
    recommendedSubsteps: Math.max(1, Math.ceil(travel / coefficients.trajectoryPointStep)),
    at: (amount) => buildRiderOccupancy(poseAt(amount), coefficients),
    envelopeAt: (amount) => buildRiderOccupancyEnvelope(poseAt(amount), coefficients) };
}
