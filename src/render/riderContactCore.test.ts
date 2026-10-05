/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The living world's contact core (`RIDER_CONTACT`, VIS-CRASH-1; 2026-10-04),
 * measured against every look's rendered rider as the real controller rides:
 * cruising, at full throttle, carving, braking, and in a held one-foot hop. In
 * plan no rendered vertex lies more than `RIDER_CONTACT_OVERHANG_METRES` outside
 * the core (only tall hair and a hat stand above its head sphere), which stays
 * inside the containment envelope (`RIDER_OCCUPANCY`) in plan and is
 * the materially smaller body the living world now meets: the envelope's front
 * edge stood 1.5 m ahead of the wheel at full throttle and crashed riders into
 * people they had not reached.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { machineForCharacter } from '../data/machines.ts';
import { DRUNK_STYLE } from '../data/rideStyles.ts';
import { EUC, RIDER_CONTACT, RIDER_CONTACT_OVERHANG_METRES, RIDER_OCCUPANCY, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { createOneFootPose, stepOneFootFromController } from '../app/oneFootPose.ts';
import { createPose, EucController } from '../simulation/EucController.ts';
import { PopulationContactHarness, flatPavement, populationPlanOf, stationaryPerson } from '../simulation/populationContactHarness.test-support.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { machineLook } from './machineLook.ts';
import { RIDER_LOOKS } from './riderLook.ts';
import { createRidingRig } from './ridingRig.ts';

const DT = 1 / SIMULATION.hz;
type Box = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
const BOUNDS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const;

/** Every rendered vertex of the rider, in the wheel's clean heading frame. */
function rendered(root: THREE.Object3D, pose: { x: number; y: number; z: number; headingY: number }): Box {
  root.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().makeRotationY(pose.headingY).setPosition(pose.x, pose.y, pose.z).invert();
  const transform = new THREE.Matrix4(), point = new THREE.Vector3();
  const box: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  root.traverseVisible(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => !material.visible)) return;
    const position = mesh.geometry.getAttribute('position'); if (!position) return;
    transform.multiplyMatrices(inverse, mesh.matrixWorld);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      mesh.getVertexPosition(vertex, point).applyMatrix4(transform);
      box.minX = Math.min(box.minX, point.x); box.maxX = Math.max(box.maxX, point.x); box.minY = Math.min(box.minY, point.y);
      box.maxY = Math.max(box.maxY, point.y); box.minZ = Math.min(box.minZ, point.z); box.maxZ = Math.max(box.maxZ, point.z);
    }
  });
  return box;
}
/** In plan, where the living world's standing bodies meet a rider. Above the head
 * sphere only tall hair and a hat stand, over every actor's own height band. */
const PLAN = ['minX', 'maxX', 'minZ', 'maxZ'] as const;
const overhang = (visible: Box, core: Box, keys: readonly (typeof BOUNDS)[number][] = PLAN) =>
  Math.max(...keys.map(key => key.startsWith('min') ? core[key] - visible[key] : visible[key] - core[key]));

/** Riding scripts through the real controller's input path; the hop holds its one-foot pose. */
const SCRIPTS: readonly [string, number, (euc: EucController, tick: number) => ActionSnapshot][] = [
  ['cruise', 240, euc => ({ ...NEUTRAL_ACTIONS, throttle: euc.snapshot().speed > 6 ? -0.3 : 0.05 })],
  ['throttle', 200, () => ({ ...NEUTRAL_ACTIONS, throttle: 1 })],
  ['carve', 200, euc => ({ ...NEUTRAL_ACTIONS, throttle: euc.snapshot().speed > 8 ? 0 : 0.6, steer: 1 })],
  ['brake', 90, () => ({ ...NEUTRAL_ACTIONS, throttle: -1 })],
  ['one-foot hop', 150, (_euc, tick) => ({ ...NEUTRAL_ACTIONS, throttle: 0.3, crouch: tick < Math.ceil((EUC.hopChargeSeconds + .1) / DT) + 2,
    hop: tick === Math.ceil((EUC.hopChargeSeconds + .1) / DT), hopHeld: tick >= Math.ceil((EUC.hopChargeSeconds + .1) / DT) })],
];

test('the contact core holds every rendered rider within its measured overhang, inside the envelope, and is the tighter body (VIS-CRASH-1)', () => {
  let worst = 0, worstAt = '', above = 0;
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
    try {
      for (const [script, ticks, input] of SCRIPTS) {
        const euc = new EucController(flatPavement, { spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 } });
        if (look.id === 'drunkard') euc.setRideStyle(DRUNK_STYLE);
        for (let tick = 0; tick < 360; tick += 1) euc.step(DT, { ...NEUTRAL_ACTIONS, throttle: euc.snapshot().speed > 6 ? -0.3 : 0.4 });
        const pose = createPose(), foot = createOneFootPose();
        let footOut = 0;
        for (let tick = 0; tick < ticks; tick += 1) {
          const actions = input(euc, tick); euc.step(DT, actions); euc.writePose(pose);
          stepOneFootFromController(foot, euc, pose.recoverBlend, DT, actions.hopHeld, false);
          footOut = Math.max(footOut, foot.oneFoot);
          if (tick % 5 !== 0 && !(foot.oneFoot > 0.99)) continue;
          rig.setTrickPose(foot.oneFoot, foot.side); rig.apply(pose);
          const visible = rendered(rig.rider.root, pose), core = buildRiderOccupancyEnvelope(pose, RIDER_CONTACT).human;
          const envelope = buildRiderOccupancyEnvelope(pose, RIDER_OCCUPANCY).human, value = overhang(visible, core);
          if (value > worst) { worst = value; worstAt = `${look.id}/${script}/${tick}`; }
          above = Math.max(above, visible.maxY - core.maxY);
          assert.ok(visible.minY >= core.minY - RIDER_CONTACT_OVERHANG_METRES, `${look.id}/${script}/${tick}: nothing hangs below the core`);
          // In plan; a crouched knee's lens may reach below the envelope's thigh sphere.
          for (const key of PLAN) assert.ok(key.startsWith('min') ? core[key] >= envelope[key] - 1e-9 : core[key] <= envelope[key] + 1e-9, `${look.id}/${script}/${tick}: core ${key} inside the envelope`);
          if (script === 'throttle' && tick > 100) {
            assert.ok(core.maxZ <= envelope.maxZ - 0.3, `${look.id}: the core's front stands well inside the envelope's at full throttle (${core.maxZ.toFixed(2)} vs ${envelope.maxZ.toFixed(2)})`);
            assert.ok(core.halfWidth <= envelope.halfWidth - 0.15, `${look.id}: and its sides (${core.halfWidth.toFixed(2)} vs ${envelope.halfWidth.toFixed(2)})`);
          }
        }
        if (script === 'one-foot hop') assert.ok(footOut > 0.99, `${look.id}: the hop really holds the one-foot pose`);
      }
    } finally { rig.dispose(); }
  }
  assert.ok(worst <= RIDER_CONTACT_OVERHANG_METRES, `worst rendered overhang past the contact core in plan: ${worst.toFixed(3)} m at ${worstAt}`);
  assert.ok(above <= 0.35, `hair and hats above the head sphere: ${above.toFixed(3)} m`);
  console.log(JSON.stringify({ contactCoreOverhangPlan: +worst.toFixed(3), at: worstAt, aboveHead: +above.toFixed(3) }));
});

/** The rendered person in its own frame: the walker's measured sides and stride (inside its 0.42 m hull). */
const PERSON_VISIBLE_HALF_WIDTH = 0.32, PERSON_VISIBLE_HALF_LENGTH = 0.42;

// Review r3 (2026-10-04): approached slowly or off-line at full throttle, the
// crash fired on the envelope's corner 1.4-1.5 m ahead of the wheel, a metre
// short of the person, and the body did a headstand in front of them. The
// crash now starts at the rendered rider's touch, give or take the core's
// overhang and the person's hull, and the falling body reaches them.
test('VIS-CRASH-1: off-line at full throttle, the crash starts at the rendered touch and the body reaches the person', () => {
  const look = RIDER_LOOKS.find(value => value.id === 'cool-rider')!, rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
  try {
    for (const lateral of [0, .45, .9]) {
      const person = stationaryPerson('walker-0', lateral, 30, 'walker');
      const harness = new PopulationContactHarness(populationPlanOf([person]), { position: { x: 0, y: 0, z: 25.5 }, headingY: 0 });
      const actor = harness.population.snapshot().actors[0].footprint;
      let before = harness.pose(), crash: ReturnType<typeof createPose> | null = null, speed = 0;
      for (let i = 0; i < 600 && !crash && harness.controller.snapshot().position.z < 32; i += 1) {
        before = harness.pose(); speed = harness.controller.snapshot().speed;
        harness.step({ ...NEUTRAL_ACTIONS, throttle: 1 });
        if (harness.controller.crashed) crash = harness.pose();
      }
      if (!crash) { assert.equal(lateral, .9, `${lateral} m: a rider aimed at the person crashes on them`); console.log(JSON.stringify({ visCrash: lateral, passed: true })); continue; }
      assert.ok(speed > 5 && speed < 8, `${lateral} m: met at ${speed.toFixed(2)} m/s under full throttle`);
      rig.apply(before);
      const visible = rendered(rig.rider.root, before);
      // Plan gap between the rendered rider (heading frame = world here) and the person's rendered box.
      const gapX = Math.abs(actor.x - before.x) - PERSON_VISIBLE_HALF_WIDTH - Math.max(-visible.minX, visible.maxX);
      const gapZ = (actor.z - PERSON_VISIBLE_HALF_LENGTH) - (before.z + visible.maxZ);
      const gap = Math.max(gapX, gapZ);
      assert.ok(gap <= 0.3, `${lateral} m: the crash starts within 0.3 m of the rendered touch (${gap.toFixed(2)} m)`);
      let nearest = Infinity;
      for (let tick = 0; tick < 72 && harness.controller.crashed; tick += 1) {
        harness.step({ ...NEUTRAL_ACTIONS }); const pose = harness.pose();
        for (let index = 0; index < 11; index += 1) nearest = Math.min(nearest, Math.max(
          Math.abs(pose.ragdoll[index * 3] - actor.x) - actor.halfWidthMetres, Math.abs(pose.ragdoll[index * 3 + 2] - actor.z) - actor.halfLengthMetres));
      }
      // Aimed at them the body reaches them; a graze at 0.9 m glances off to its own side.
      if (lateral < .9) assert.ok(nearest < 0.15, `${lateral} m: the falling body reaches the person (${nearest.toFixed(2)} m)`);
      else assert.ok(nearest >= -1e-6 && nearest < 0.5, `${lateral} m: the graze goes down beside them (${nearest.toFixed(2)} m)`);
      console.log(JSON.stringify({ visCrash: lateral, speed: +speed.toFixed(2), renderedGapAtCrash: +gap.toFixed(3), bodyToHull: +nearest.toFixed(3) }));
    }
  } finally { rig.dispose(); }
});
