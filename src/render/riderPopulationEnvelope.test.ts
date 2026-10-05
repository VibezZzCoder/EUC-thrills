/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { machineForCharacter } from '../data/machines.ts';
import { DRUNK_STYLE } from '../data/rideStyles.ts';
import { POPULATION_OCCUPANT, RIDER_OCCUPANCY, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { createOneFootPose, stepOneFootFromController } from '../app/oneFootPose.ts';
import { copyPose, createPose, EucController, lerpPose, type EucPose, type EucTuning } from '../simulation/EucController.ts';
import { buildRiderOccupancy, createRiderOccupancyTrajectory, type RiderOccupancyBounds } from '../shared/riderOccupancy.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { topSpeedPreset } from '../simulation/topSpeedPreset.ts';
import { machineLook } from './machineLook.ts';
import { DRUNKARD_CAN_VERTICES, DRUNKARD_GLOVE_VERTICES, RIDER_LOOKS, type RiderLook } from './riderLook.ts';
import { createRidingRig } from './ridingRig.ts';

/**
 * Evidence probe, not a new physical hull or a pose-space cross product.
 * Scripts follow riderClearanceRidden's controller-driven corner/flick/reversal
 * and flight patterns. Every measured pose comes from the real controller;
 * the production one-foot observer supplies both supported side signs.
 * Vertices are sampled on a bounded tick stride, so these are sampled maxima,
 * not a proof that every reachable pose is contained. Crash geometry is kept
 * separate: a thrown body can be metres from its rolling wheel.
 */

type Bound = 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ';
const BOUNDS: readonly Bound[] = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];
const STEP = 1 / SIMULATION.hz;

export interface EnvelopeVertex {
  readonly mesh: string;
  readonly vertex: number;
  readonly instance: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface HeadingEnvelope {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  vertices: number;
  witnesses: Partial<Record<Bound, EnvelopeVertex>>;
}

const freshEnvelope = (): HeadingEnvelope => ({
  minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity,
  vertices: 0, witnesses: {},
});

interface GeometryScan {
  index: THREE.BufferAttribute | null;
  indexVersion: number;
  positionCount: number;
  start: number;
  end: number;
  groups: string;
  indices: Int32Array | null;
}
const GEOMETRY_SCANS = new WeakMap<THREE.BufferGeometry, GeometryScan>();

/** Static topology is compiled once; changing draw ranges/material groups recompile it. */
function geometryScan(mesh: THREE.Mesh): GeometryScan {
  const geometry = mesh.geometry, index = geometry.index;
  const positionCount = geometry.getAttribute('position').count;
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(index?.count ?? positionCount, start + geometry.drawRange.count);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const partialGroups = Array.isArray(mesh.material) && materials.some((material) => !material.visible);
  const groups = partialGroups ? geometry.groups.map((group) =>
    `${group.start}/${group.count}/${materials[group.materialIndex ?? 0]?.visible ? 1 : 0}`).join(',') : '';
  const cached = GEOMETRY_SCANS.get(geometry);
  if (cached && cached.index === index && cached.indexVersion === (index?.version ?? -1)
    && cached.positionCount === positionCount && cached.start === start && cached.end === end && cached.groups === groups) return cached;
  let indices: Int32Array | null = null;
  if (index || partialGroups) {
    const used = new Set<number>();
    const ranges = partialGroups ? geometry.groups.filter((group) => materials[group.materialIndex ?? 0]?.visible)
      : [{ start, count: end - start }];
    for (const range of ranges) for (let vertex = Math.max(start, range.start);
      vertex < Math.min(end, range.start + range.count); vertex += 1) used.add(index?.getX(vertex) ?? vertex);
    indices = Int32Array.from(used);
  }
  const scan: GeometryScan = { index, indexVersion: index?.version ?? -1, positionCount, start, end, groups, indices };
  GEOMETRY_SCANS.set(geometry, scan);
  return scan;
}

/**
 * All visible rendered vertices, including instance-local transforms, measured
 * about the wheel-base pose in its clean heading frame. getVertexPosition also
 * handles morph/skinned Mesh implementations. Invisible ancestors are skipped.
 */
export function measureRiderHeadingEnvelope(root: THREE.Object3D, pose: Pick<EucPose, 'x' | 'y' | 'z' | 'headingY'>): HeadingEnvelope {
  root.updateWorldMatrix(true, true);
  const frameInverse = new THREE.Matrix4().makeRotationY(pose.headingY)
    .setPosition(pose.x, pose.y, pose.z).invert();
  const transform = new THREE.Matrix4(), instanceMatrix = new THREE.Matrix4();
  const point = new THREE.Vector3(), result = freshEnvelope();
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.every((material) => !material.visible)) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const scan = geometryScan(mesh);
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    for (let instance = 0; instance < instances; instance += 1) {
      transform.multiplyMatrices(frameInverse, mesh.matrixWorld);
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        (mesh as THREE.InstancedMesh).getMatrixAt(instance, instanceMatrix);
        transform.multiply(instanceMatrix);
      }
      const measure = (vertex: number): void => {
        mesh.getVertexPosition(vertex, point).applyMatrix4(transform);
        result.vertices += 1;
        const minX = point.x < result.minX, maxX = point.x > result.maxX;
        const minY = point.y < result.minY, maxY = point.y > result.maxY;
        const minZ = point.z < result.minZ, maxZ = point.z > result.maxZ;
        if (!(minX || maxX || minY || maxY || minZ || maxZ)) return;
        const witness: EnvelopeVertex = { mesh: mesh.name || mesh.parent?.name || '(unnamed mesh)', vertex,
          instance: (mesh as THREE.InstancedMesh).isInstancedMesh ? instance : null, x: point.x, y: point.y, z: point.z };
        if (minX) { result.minX = point.x; result.witnesses.minX = witness; }
        if (maxX) { result.maxX = point.x; result.witnesses.maxX = witness; }
        if (minY) { result.minY = point.y; result.witnesses.minY = witness; }
        if (maxY) { result.maxY = point.y; result.witnesses.maxY = witness; }
        if (minZ) { result.minZ = point.z; result.witnesses.minZ = witness; }
        if (maxZ) { result.maxZ = point.z; result.witnesses.maxZ = witness; }
      };
      if (scan.indices) for (const vertex of scan.indices) measure(vertex);
      else for (let vertex = scan.start; vertex < scan.end; vertex += 1) measure(vertex);
    }
  });
  return result;
}

interface PoseEvidence {
  readonly script: string;
  readonly tick: number;
  readonly mph: number | null;
  readonly oneFoot: number;
  readonly oneFootSide: number;
  readonly speed: number;
  readonly rollAngle: number;
  readonly riderRoll: number;
  readonly riderPitch: number;
  readonly wheelPitch: number;
  readonly crouch: number;
  readonly airHeight: number;
  readonly crashBlend: number;
  readonly ragdollBlend: number;
  readonly styleSway: number;
  readonly headingY: number;
}

interface ProbeBucket extends HeadingEnvelope {
  frames: number;
  at: Partial<Record<Bound, PoseEvidence>>;
  perPoseFit: {
    maxHalfWidth: number; maxHalfLength: number;
    minCentreX: number; maxCentreX: number; minCentreZ: number; maxCentreZ: number;
  };
}

type Bucket = 'stationary' | 'upright' | 'airborne' | 'oneFootLeft' | 'oneFootRight' | 'crash';
const BUCKETS: readonly Bucket[] = ['stationary', 'upright', 'airborne', 'oneFootLeft', 'oneFootRight', 'crash'];
const freshBucket = (): ProbeBucket => ({ ...freshEnvelope(), frames: 0, at: {},
  perPoseFit: { maxHalfWidth: 0, maxHalfLength: 0,
    minCentreX: Infinity, maxCentreX: -Infinity, minCentreZ: Infinity, maxCentreZ: -Infinity } });

function signedBox(sample: HeadingEnvelope) {
  return { minX: sample.minX, maxX: sample.maxX, minY: sample.minY, maxY: sample.maxY, minZ: sample.minZ, maxZ: sample.maxZ,
    centreX: (sample.minX + sample.maxX) / 2, centreZ: (sample.minZ + sample.maxZ) / 2,
    halfWidth: (sample.maxX - sample.minX) / 2, halfLength: (sample.maxZ - sample.minZ) / 2 };
}

/** Exact presentation block for a coordinator replay, including world particles. */
function capturedSourcePose(pose: EucPose) {
  const { ragdoll, ...scalars } = pose;
  return { ...scalars, ragdoll: Array.from(ragdoll) };
}

function accumulate(bucket: ProbeBucket, sample: HeadingEnvelope, evidence: PoseEvidence): void {
  bucket.frames += 1; bucket.vertices += sample.vertices;
  const fit = signedBox(sample), perPose = bucket.perPoseFit;
  perPose.maxHalfWidth = Math.max(perPose.maxHalfWidth, fit.halfWidth);
  perPose.maxHalfLength = Math.max(perPose.maxHalfLength, fit.halfLength);
  perPose.minCentreX = Math.min(perPose.minCentreX, fit.centreX); perPose.maxCentreX = Math.max(perPose.maxCentreX, fit.centreX);
  perPose.minCentreZ = Math.min(perPose.minCentreZ, fit.centreZ); perPose.maxCentreZ = Math.max(perPose.maxCentreZ, fit.centreZ);
  for (const bound of BOUNDS) {
    if (bound.startsWith('min') ? sample[bound] < bucket[bound] : sample[bound] > bucket[bound]) {
      bucket[bound] = sample[bound]; bucket.witnesses[bound] = sample.witnesses[bound]; bucket.at[bound] = evidence;
    }
  }
}

/** A compact signed box plus its optional off-centre prism fit. Neither is tuning. */
function summarize(bucket: ProbeBucket) {
  if (bucket.frames === 0) return null;
  return { ...bucket,
    halfWidthAboutWheel: Math.max(Math.abs(bucket.minX), Math.abs(bucket.maxX)),
    halfLengthAboutWheel: Math.max(Math.abs(bucket.minZ), Math.abs(bucket.maxZ)),
    centredFit: { x: (bucket.minX + bucket.maxX) / 2, z: (bucket.minZ + bucket.maxZ) / 2,
      halfWidth: (bucket.maxX - bucket.minX) / 2, halfLength: (bucket.maxZ - bucket.minZ) / 2,
      minY: bucket.minY, maxY: bucket.maxY },
    currentPrismShortfall: { width: Math.max(0, Math.max(Math.abs(bucket.minX), Math.abs(bucket.maxX)) - POPULATION_OCCUPANT.halfWidthMetres),
      length: Math.max(0, Math.max(Math.abs(bucket.minZ), Math.abs(bucket.maxZ)) - POPULATION_OCCUPANT.halfLengthMetres),
      belowBase: Math.max(0, -bucket.minY), aboveTop: Math.max(0, bucket.maxY - POPULATION_OCCUPANT.heightMetres) },
  };
}

export interface RiderEnvelopeProbeOptions {
  readonly looks?: readonly RiderLook[];
  readonly presets?: readonly (number | null)[];
  /** Measure every Nth fixed step; all intermediary rig poses still apply. */
  readonly sampleStride?: number;
  /** Assert the common plain-pose component contract against actual vertices. */
  readonly checkOccupancy?: boolean;
  /** Real adjacent controller poses, at these presentation interpolation times. */
  readonly interpolationFractions?: readonly number[];
  /** A genuine planar heightfield grade (metres rise per metre X/Z). */
  readonly grade?: { readonly x: number; readonly z: number };
  /** Keep the real full trace but measure only this exact diagnostic frame. */
  readonly sampleFilter?: { readonly script: string; readonly tick: number };
}

export interface RiderOccupancyFailureContext {
  readonly look: string; readonly machine: string; readonly sourcePose: ReturnType<typeof capturedSourcePose>;
  readonly script: string; readonly tick: number; readonly mph: number | null; readonly fraction?: number;
}

export class RiderOccupancyContainmentFailure extends Error {
  readonly evidence: unknown;
  constructor(message: string, evidence: unknown) { super(message); this.name = 'RiderOccupancyContainmentFailure'; this.evidence = evidence; }
}

export function assertRiderOccupancyContains(observed: RiderOccupancyBounds, physical: RiderOccupancyBounds, label: string,
  context?: RiderOccupancyFailureContext): number {
  let clearance = Infinity;
  for (const bound of BOUNDS) {
    const margin = bound.startsWith('min') ? observed[bound] - physical[bound] : physical[bound] - observed[bound];
    if (!(margin >= -1e-6)) throw new RiderOccupancyContainmentFailure(
      `${label}/${bound}: visible ${observed[bound]} outside physical ${physical[bound]} by ${-margin} m`,
      { label, bound, margin, context, observed, physical, witness: (observed as HeadingEnvelope).witnesses?.[bound] ?? null });
    clearance = Math.min(clearance, margin);
  }
  return clearance;
}

/**
 * Bounded headless roster probe. Ten native rigs on the shipped recipe,
 * about 16,500 posed frames but only ~700 complete vertex scans at stride 24.
 * Pass presets:[90] for the targeted faster-wheel follow-up.
 * Warmup advances physics without doing redundant rig/vertex work on a flat
 * straight. Expected coordinator budget: one 60 s process; runtime is unmeasured.
 * Optional grades and between-tick checks extend this same reachable trace;
 * no full phase ladder, obstacles, paddle swings or exhaustive pose claim.
 */
export function probeRiderPopulationEnvelopes(options: RiderEnvelopeProbeOptions = {}) {
  const looks = options.looks ?? RIDER_LOOKS, presets = options.presets ?? [null];
  const stride = options.sampleStride ?? 24;
  if (!Number.isInteger(stride) || stride < 1) throw new RangeError('rider hull probe needs a positive integer stride');
  const fractions = options.interpolationFractions ?? [];
  if (fractions.some((fraction) => fraction <= 0 || fraction >= 1 || !Number.isFinite(fraction)))
    throw new RangeError('interpolation checks require finite interior fractions');
  const plan = buildLevelPlan([{ id: 'hull-probe-flat', length: 4000, halfWidth: 400, surface: 'pavement', shoulder: 2 }], {
    id: 'rider-hull-probe', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'pavement' }, spacing: 20,
  });
  if (options.grade) {
    const field = plan.heightfield, grade = options.grade;
    plan.heightfield = { ...field, heights: field.heights.map((_, index) =>
      (field.originX + (index % field.columns) * field.spacing) * grade.x
      + (field.originZ + Math.floor(index / field.columns) * field.spacing) * grade.z) };
  }
  const sampler = new PlanTerrainSampler(plan);
  let simulatedSteps = 0, posedSteps = 0, measuredFrames = 0, visitedVertices = 0, interpolationChecks = 0;
  let minimumContainmentClearance = Infinity, legacyPrismRefused = false;
  const records = [];
  for (const look of looks) {
    const machine = machineForCharacter(look.id), rig = createRidingRig(look, machineLook(machine));
    const buckets = Object.fromEntries(BUCKETS.map((name) => [name, freshBucket()])) as Record<Bucket, ProbeBucket>;
    const wheelBuckets = Object.fromEntries(BUCKETS.map((name) => [name, freshBucket()])) as Record<Bucket, ProbeBucket>;
    const riderBuckets = Object.fromEntries(BUCKETS.map((name) => [name, freshBucket()])) as Record<Bucket, ProbeBucket>;
    const samples: Array<{ bucket: Bucket; pose: PoseEvidence; sourcePose: ReturnType<typeof capturedSourcePose>;
      box: ReturnType<typeof signedBox>; wheelBox: ReturnType<typeof signedBox>; riderBox: ReturnType<typeof signedBox> }> = [];
    const coverage = { positiveBank: 0, negativeBank: 0, crouch: 0, air: 0, oneFootLeft: 0, oneFootRight: 0, crash: 0 };
    try {
      for (const mph of presets) {
        const preset = mph === null ? null : topSpeedPreset(mph);
        const tuning: Partial<EucTuning> = preset ? { dragCoefficient: preset.dragCoefficient,
          powerComfortSpeed: preset.powerComfortSpeed, powerLimitSpeed: preset.powerLimitSpeed } : {};
        const euc = new EucController(sampler, { tuning, spawn: plan.spawn });
        if (look.id === 'drunkard') euc.setRideStyle(DRUNK_STYLE);
        const pose = createPose(), previousPose = createPose(), betweenPose = createPose();
        let previousValid = false;
        let tick = 0, side = 1, foot = createOneFootPose(side);
        const read = (script: string, force: boolean): void => {
          const hadPrevious = previousValid, previousFoot = foot.oneFoot;
          if (hadPrevious) copyPose(pose, previousPose);
          euc.writePose(pose);
          previousValid = true;
          stepOneFootFromController(foot, euc, pose.recoverBlend, STEP, script.startsWith('charged-hop'), false);
          rig.setTrickPose(foot.oneFoot, side); rig.apply(pose); posedSteps += 1;
          coverage.positiveBank = Math.max(coverage.positiveBank, pose.riderRoll);
          coverage.negativeBank = Math.min(coverage.negativeBank, pose.riderRoll);
          coverage.crouch = Math.max(coverage.crouch, pose.crouch);
          coverage.air = Math.max(coverage.air, pose.airHeight);
          coverage.oneFootLeft = Math.max(coverage.oneFootLeft, side > 0 ? foot.oneFoot : 0);
          coverage.oneFootRight = Math.max(coverage.oneFootRight, side < 0 ? foot.oneFoot : 0);
          coverage.crash = Math.max(coverage.crash, pose.ragdollBlend);
          if (options.sampleFilter && (script !== options.sampleFilter.script || tick !== options.sampleFilter.tick)) return;
          if (!force && tick % stride !== 0 && !euc.tookOff && !euc.touchedDown) return;
          const envelope = measureRiderHeadingEnvelope(rig.group, pose);
          const wheelEnvelope = measureRiderHeadingEnvelope(rig.euc.group, pose);
          const riderEnvelope = measureRiderHeadingEnvelope(rig.rider.root, pose);
          if (!euc.crashed && Math.max(Math.abs(riderEnvelope.minX), Math.abs(riderEnvelope.maxX)) > POPULATION_OCCUPANT.halfWidthMetres)
            legacyPrismRefused = true;
          if (options.checkOccupancy) {
            const physical = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
            const context = { look: look.id, machine, script, tick, mph, sourcePose: capturedSourcePose(pose) };
            minimumContainmentClearance = Math.min(minimumContainmentClearance,
              assertRiderOccupancyContains(wheelEnvelope, physical.wheel, `${look.id}/${mph}/${script}/${tick}/wheel`, context),
              assertRiderOccupancyContains(riderEnvelope, physical.human, `${look.id}/${mph}/${script}/${tick}/human`, context));
          }
          if (hadPrevious && fractions.length > 0) {
            const trajectory = createRiderOccupancyTrajectory(previousPose, pose, RIDER_OCCUPANCY);
            for (const fraction of fractions) {
              lerpPose(previousPose, pose, fraction, betweenPose);
              rig.setTrickPose(previousFoot + (foot.oneFoot - previousFoot) * fraction, side); rig.apply(betweenPose);
              const betweenWheel = measureRiderHeadingEnvelope(rig.euc.group, betweenPose);
              const betweenRider = measureRiderHeadingEnvelope(rig.rider.root, betweenPose);
              const physical = trajectory.at(fraction);
              const context = { look: look.id, machine, script, tick, mph, fraction, sourcePose: capturedSourcePose(betweenPose) };
              minimumContainmentClearance = Math.min(minimumContainmentClearance,
                assertRiderOccupancyContains(betweenWheel, physical.wheel, `${look.id}/${mph}/${script}/${tick}/${fraction}/wheel`, context),
                assertRiderOccupancyContains(betweenRider, physical.human, `${look.id}/${mph}/${script}/${tick}/${fraction}/human`, context));
              interpolationChecks += 1; visitedVertices += betweenWheel.vertices + betweenRider.vertices;
            }
            rig.setTrickPose(foot.oneFoot, side); rig.apply(pose);
          }
          assert.ok(envelope.vertices > 0 && BOUNDS.every((bound) => Number.isFinite(envelope[bound])), 'posed rig has a finite vertex envelope');
          const evidence: PoseEvidence = { script, tick, mph, oneFoot: foot.oneFoot, oneFootSide: side,
            speed: pose.speed, rollAngle: pose.rollAngle, riderRoll: pose.riderRoll, riderPitch: pose.riderPitch,
            wheelPitch: pose.wheelPitch, crouch: pose.crouch, airHeight: pose.airHeight,
            crashBlend: pose.crashBlend, ragdollBlend: pose.ragdollBlend, styleSway: pose.styleSway, headingY: pose.headingY };
          const bucket: Bucket = euc.crashed ? 'crash' : pose.airHeight > 0 ? 'airborne' : 'upright';
          samples.push({ bucket, pose: evidence, sourcePose: capturedSourcePose(pose), box: signedBox(envelope),
            wheelBox: signedBox(wheelEnvelope), riderBox: signedBox(riderEnvelope) });
          accumulate(buckets[bucket], envelope, evidence);
          accumulate(wheelBuckets[bucket], wheelEnvelope, evidence); accumulate(riderBuckets[bucket], riderEnvelope, evidence);
          if (script === 'stationary') {
            accumulate(buckets.stationary, envelope, evidence);
            accumulate(wheelBuckets.stationary, wheelEnvelope, evidence); accumulate(riderBuckets.stationary, riderEnvelope, evidence);
          }
          if (!euc.crashed && foot.oneFoot > 0) {
            const footBucket = side > 0 ? 'oneFootLeft' : 'oneFootRight';
            accumulate(buckets[footBucket], envelope, evidence);
            accumulate(wheelBuckets[footBucket], wheelEnvelope, evidence); accumulate(riderBuckets[footBucket], riderEnvelope, evidence);
          }
          measuredFrames += 1; visitedVertices += envelope.vertices + wheelEnvelope.vertices + riderEnvelope.vertices;
        };
        const step = (script: string, partial: Partial<ActionSnapshot> = {}, force = false): void => {
          const input = { ...NEUTRAL_ACTIONS, throttle: euc.overspeed > 0.6 ? -0.3 : 1, ...partial };
          euc.step(STEP, input); tick += 1; simulatedSteps += 1; read(script, force);
        };
        step('stationary', { throttle: 0 }, true);
        for (let warm = 0; warm < 1800; warm += 1) {
          euc.step(STEP, { ...NEUTRAL_ACTIONS, throttle: euc.overspeed > 0.6 ? -0.3 : 1 });
          tick += 1; simulatedSteps += 1;
        }
        previousValid = false; // Warmup skipped presentation; this is not an adjacent pose pair.
        for (const steer of [1, -1]) for (let held = 0; held < 180; held += 1) step(`held-bank-${steer}`, { steer });
        for (let flick = 0; flick < 180; flick += 1) step('ten-tick-flick', { steer: Math.floor(flick / 10) % 2 ? -1 : 1 });
        for (let held = 0; held < 120; held += 1) step('saturated-reversal-entry', { steer: 1 });
        for (let gentle = 0; gentle < 90; gentle += 1) step('gentle-opposite-reversal', { steer: -0.2 });
        for (let crouch = 0; crouch < 90; crouch += 1) step('held-crouch', { steer: 0.4, crouch: true });
        for (const sign of [1, -1]) {
          side = sign; foot = createOneFootPose(side);
          for (let settle = 0; settle < 120; settle += 1) step(`hop-settle-${side}`, { steer: 0 });
          for (let charge = 0; charge < 60; charge += 1) step(`charged-hop-${side}`, { crouch: true, steer: 0 });
          let tookOff = false, landed = false;
          for (let flight = 0; flight < 240; flight += 1) {
            step(`charged-hop-${side}`, { hop: flight === 0, crouch: flight < 2, steer: 0 }, flight === 0);
            tookOff ||= euc.tookOff;
            if (tookOff && euc.touchedDown) { landed = true; break; }
          }
          assert.ok(tookOff && landed, `${look.id}/${mph}: the charged hop must actually fly and land`);
        }
        // This is a real sanctioned crash entry, not fabricated crashBlend or
        // particle coordinates. Both throw directions and the actual body beats.
        for (const crashSide of [1, -1]) {
          assert.equal(euc.reset(plan.spawn, Math.max(5, pose.speed)), true);
          foot = createOneFootPose(side); rig.setTrickPose(0, side);
          assert.equal(euc.hardKnock(crashSide, 0), true);
          previousValid = false;
          for (let beat = 0; beat < 150; beat += 1) step(`hard-knock-${crashSide}`, { throttle: 0 }, beat === 0 || beat === 149);
        }
      }
    } finally { rig.dispose(); }
    assert.ok(coverage.positiveBank > 0.1 && coverage.negativeBank < -0.1, `${look.id}: both banks were ridden`);
    assert.ok(coverage.crouch > 0.3 && coverage.air > 0.1 && coverage.crash > 0.5, `${look.id}: crouch/flight/ragdoll were ridden`);
    assert.ok(coverage.oneFootLeft > 0.9 && coverage.oneFootRight > 0.9, `${look.id}: both one-foot signs were reached`);
    records.push({ look: look.id, machine, coverage, samples,
      envelopes: Object.fromEntries(BUCKETS.map((name) => [name, summarize(buckets[name])])),
      componentEnvelopes: {
        wheel: Object.fromEntries(BUCKETS.map((name) => [name, summarize(wheelBuckets[name])])),
        rider: Object.fromEntries(BUCKETS.map((name) => [name, summarize(riderBuckets[name])])),
      },
    });
  }
  if (options.checkOccupancy && !options.sampleFilter) assert.ok(legacyPrismRefused, 'the same reachable trace must reject the legacy fixed wheel-centred rider prism');
  if (options.sampleFilter) assert.ok(measuredFrames > 0, 'the requested exact diagnostic frame must exist in the real trace');
  return { basis: 'visible mesh vertices in clean wheel-base heading frame; native rigs; real controller scripts',
    sampleStride: stride, presets, grade: options.grade ?? null, currentPrism: POPULATION_OCCUPANT,
    omissions: ['full style phase ladder', ...(!options.grade ? ['slopes'] : []), 'obstacles', 'paddle swings',
      ...(fractions.length === 0 ? ['between-tick interpolation'] : []), 'exhaustive reachable-pose proof'],
    occupancyChecks: options.checkOccupancy ?? false, interpolationChecks, legacyPrismRefused,
    minimumContainmentClearance: Number.isFinite(minimumContainmentClearance) ? minimumContainmentClearance : null,
    simulatedSteps, posedSteps, measuredFrames, visitedVertices, records };
}

test('heading envelope applies complete parent and instance transforms and skips invisible geometry', () => {
  const pose = { x: 12, y: 2, z: -7, headingY: 0.8 };
  const root = new THREE.Group(); root.position.set(pose.x, pose.y, pose.z); root.rotation.y = pose.headingY;
  const parent = new THREE.Group(); parent.position.set(0.2, 0.4, -0.3); parent.scale.set(2, 1, 0.5); root.add(parent);
  const geometry = new THREE.BoxGeometry(1, 2, 3), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 2); mesh.name = 'instance-control'; parent.add(mesh);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-2, 0, 0));
  const hidden = new THREE.Group(); hidden.visible = false; root.add(hidden);
  const distant = new THREE.Mesh(geometry, material); distant.position.x = 100; hidden.add(distant);
  try {
    const measured = measureRiderHeadingEnvelope(root, pose);
    assert.ok(Math.abs(measured.minX - (-4.8)) < 1e-6 && Math.abs(measured.maxX - 3.2) < 1e-6);
    assert.ok(Math.abs(measured.minY - (-0.6)) < 1e-6 && Math.abs(measured.maxY - 1.4) < 1e-6);
    assert.ok(Math.abs(measured.minZ - (-1.05)) < 1e-6 && Math.abs(measured.maxZ - 0.45) < 1e-6);
    assert.equal(measured.witnesses.minX!.instance, 1);
    hidden.visible = true;
    assert.ok(measureRiderHeadingEnvelope(root, pose).maxX > 90, 'visibility negative control detects the added rendered body');
  } finally { geometry.dispose(); material.dispose(); }
});

test('every supported native rig emits finite stationary physical envelope evidence', () => {
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
    try {
      const pose = createPose(); rig.apply(pose);
      const envelope = measureRiderHeadingEnvelope(rig.group, pose);
      assert.ok(envelope.vertices > 100 && BOUNDS.every((bound) => Number.isFinite(envelope[bound])), look.id);
      assert.ok(envelope.maxY > envelope.minY && envelope.maxX > envelope.minX && envelope.maxZ > envelope.minZ);
      const physical = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
      assertRiderOccupancyContains(measureRiderHeadingEnvelope(rig.euc.group, pose), physical.wheel, `${look.id}/stationary/wheel`);
      assertRiderOccupancyContains(measureRiderHeadingEnvelope(rig.rider.root, pose), physical.human, `${look.id}/stationary/human`);
    } finally { rig.dispose(); }
  }
});

test('bounded posed roster probe reports all controller-driven modes', {
  skip: process.env.EUC_RIDER_HULL_PROBE !== 'test' ? 'opt-in measurement; run the coordinator probe' : false,
}, (context) => { context.diagnostic(JSON.stringify(probeRiderPopulationEnvelopes())); });

test('component containment has a known-bad fixed rider prism control', () => {
  const rig = createRidingRig(RIDER_LOOKS.find((look) => look.id === 'trollina')!);
  try {
    const pose = createPose(); rig.apply(pose);
    const actual = measureRiderHeadingEnvelope(rig.rider.root, pose);
    assert.throws(() => assertRiderOccupancyContains(actual,
      { minX: -0.30, maxX: 0.30, minY: 0, maxY: 2.10, minZ: -0.70, maxZ: 0.70 }, 'undersized control'), /outside physical/);
  } finally { rig.dispose(); }
});

/**
 * Exact controller frame from preserved component-r4 evidence. The first full
 * containment validation (21-44-47-502Z-573cee1b) failed by 50.140365 mm at
 * drunkard / 90 mph / hard-knock-1 / tick3312 / human maxZ. This is a replay
 * of that actual state, not a constructed cross product of channel maxima.
 */
export function recordedDrunkard90CrashPose(): EucPose {
  return Object.assign(createPose(), {
    z: 31.63506726478276, wheelSpin: 126.54026905913103,
    suspensionOffset: -0.00033322566258938693, speed: 29.065786564084053,
    crashBlend: 0.6824305751252547, crashForward: 0.7165521038815175,
    crashLateral: 0.8871597476628312, crashDrop: 0.06824305751252548,
    crashRoll: 0.905161178267115, wheelCrashLean: 0.9895243339316194,
    wheelCrashSpin: -3.9652238467217407, ragdollBlend: 1,
    ragdoll: Float32Array.from([
      0.41067034006118774, 0.14000000059604645, 6.036489963531494,
      0.4061499238014221, 0.14000000059604645, 6.536549091339111,
      0.40287554264068604, 0.11999999731779099, 6.755771160125732,
      0.4907739460468292, 0.10000000149011612, 6.0373759269714355,
      0.32362088561058044, 0.15729959309101105, 6.035799980163574,
      0.5799219608306885, 0.1128053367137909, 6.537757396697998,
      0.23066532611846924, 0.13714304566383362, 6.534643650054932,
      0.5156385898590088, 0.05273155868053436, 7.066773891448975,
      0.39426666498184204, 0.05271805077791214, 7.0377349853515625,
      0.2285277545452118, 0.07237642258405685, 6.760343074798584,
      0.41662195324897766, 0.09258371591567993, 6.718786239624023,
    ]),
  });
}

test('recorded 90 mph fallen hand keeps the full authored can in its human component', () => {
  const look = RIDER_LOOKS.find((look) => look.id === 'drunkard')!;
  const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
  try {
    const pose = recordedDrunkard90CrashPose(); rig.apply(pose);
    const visible = measureRiderHeadingEnvelope(rig.rider.root, pose), witness = visible.witnesses.maxZ!;
    assert.ok(Math.abs(visible.maxZ - (-24.360528341283267)) < 1e-6, 'the saved controller state reproduces the failed extent');
    assert.equal(witness.mesh, 'rider-hand-left', 'the can-bearing hand is the actual failed mesh');
    assert.ok(witness.vertex >= DRUNKARD_GLOVE_VERTICES && witness.vertex < DRUNKARD_GLOVE_VERTICES + DRUNKARD_CAN_VERTICES,
      'the extremal vertex belongs to the carried can, beyond the glove vertex range');
    const corrected = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
    assertRiderOccupancyContains(visible, corrected.human, 'recorded Drunkard90 fallen can');
    const omitted = buildRiderOccupancy(pose, { ...RIDER_OCCUPANCY, handCarry: { axialFrom: 0, axialTo: 0, radial: 0 } });
    assert.ok(Math.abs(visible.maxZ - omitted.human.maxZ - 0.05014036544690015) < 1e-6,
      'omitting only the diagnosed axial carry reproduces the original 50 mm failure');
    assert.throws(() => assertRiderOccupancyContains(visible, omitted.human, 'omitted carried can'), /maxZ.*outside physical/);
  } finally { rig.dispose(); }
});
