/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { RIDER, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { CHARACTER_IDS, type CharacterId } from '../data/riders.ts';
import { machineForCharacter } from '../data/machines.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { createPose, EucController, lerpPose, type EucPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import {
  RD_CHEST, RD_FOOT_L, RD_FOOT_R, RD_HAND_L, RD_HAND_R, RD_HEAD, RD_HIP_L, RD_HIP_R, RD_PELVIS,
  RD_SHOULDER_L, RD_SHOULDER_R,
} from '../simulation/ragdoll.ts';
import { createCopRider, createCopRidingRig } from './copRider.ts';
import { createGhostRider } from './ghostRider.ts';
import { machineLook } from './machineLook.ts';
import { MARIBEL_LOOK, WHEEL_IN_MOTION_LOOK, riderLook } from './riderLook.ts';
import { ATLAS_REGIONS } from './maribelAtlas.ts';
import { WIM_REGIONS } from './wimAtlas.ts';
import { BAKED_PAIRS, createRidingRig, type RidingRig, type RidingRigOptions } from './ridingRig.ts';
import { consolidateRig } from './rigConsolidation.ts';

/**
 * Build-time draw consolidation of a seat rig — perf item "riders",
 * 2026-10-17 (`render/rigConsolidation.ts`).
 *
 * The claim is narrow and this file holds it to the letter: **every triangle
 * the consolidated rig submits is a triangle the unconsolidated rig submitted,
 * with the same raw attribute bits, the same material, the same flags and the
 * same object matrix** — in the colour pass always, and in the shadow pass
 * plus exactly the panels the owner's OD-2 told to cast. The only geometric
 * change is OD-1's pad and pedal bake, held to float32 rounding (3e-8 m;
 * the worst corner measured over the owner-tier corpus is 2.57e-8 m). It
 * is proved by posing both builds through a corpus (ordinary riding, the
 * stances, a swing, the crash blend, a synthetic ragdoll and the controller's
 * own hard knocks) and comparing what three would submit, pass by pass.
 */

type Rig = RidingRig;
/** OD-1's bake: float32 rounding of a re-based corner; measured worst 2.57e-8 m (wheel-in-motion). */
const BAKE_TOLERANCE_METRES = 3e-8;
const SEATS: readonly (CharacterId)[] = [...CHARACTER_IDS, 'cop'];
const seatRig = (id: CharacterId, options: RidingRigOptions = {}): Rig => (
  id === 'cop'
    ? createCopRidingRig(options)
    : createRidingRig(riderLook(id), machineLook(machineForCharacter(id)), options)
);
const BAKED_NAMES = new Set(BAKED_PAIRS.flat());

// -- The corpus ---------------------------------------------------------------

interface Frame {
  readonly label: string;
  readonly pose: EucPose;
  readonly trick?: number;
  readonly swing?: { readonly head: THREE.Vector3; readonly angle: number; readonly blend: number };
}

function buildCorpus(): Frame[] {
  const frames: Frame[] = [];
  const synth = (label: string, edit: (p: EucPose) => void, extra: Partial<Frame> = {}): void => {
    const pose = createPose();
    pose.x = 12.3; pose.y = 0.21; pose.z = -4.5; pose.headingY = 0.8;
    edit(pose);
    frames.push({ label, pose, ...extra });
  };
  synth('neutral', () => {});
  synth('fast-carve', (p) => {
    p.speed = 20; p.rollAngle = -0.62; p.riderRoll = -0.5; p.carveStance = 1; p.riderLookYaw = -0.3;
    p.riderTurnTwist = -0.15; p.wheelSpin = 9; p.riderPitch = 0.1;
  });
  synth('crouch', (p) => { p.speed = 6; p.crouch = 1; });
  synth('rest', (p) => { p.speed = 0; p.restFactor = 1; });
  synth('reverse', (p) => { p.speed = -3; p.reverseBlend = 1; p.wheelSpin = -1; });
  synth('one-foot-air', (p) => { p.speed = 10; p.airBlend = 1; p.airHeight = 0.4; p.y += 0.4; }, { trick: 1 });
  synth('swing', (p) => { p.speed = 7; }, { swing: { head: new THREE.Vector3(13.0, 1.2, -3.6), angle: 0.9, blend: 1 } });
  synth('crash-blend', (p) => {
    p.speed = 3; p.crashBlend = 1; p.crashForward = 0.4; p.crashLateral = 0.2; p.crashDrop = 0.3;
    p.crashTumble = 0.5; p.crashRoll = 0.3; p.wheelCrashLean = 1.1; p.wheelCrashSpin = 0.7; p.wheelCrashPop = 0.05;
  });
  for (const blend of [0.3, 0.7, 1]) {
    synth(`rag-${blend}`, (p) => {
      p.crashBlend = 1; p.ragdollBlend = blend;
      const h = RIDER.hipHeight;
      const spine = RIDER_BLOCKOUT.torsoLength;
      const hh = RIDER_BLOCKOUT.torsoWidth * 0.26;
      const sh = RIDER_BLOCKOUT.shoulderHalfWidth;
      const at: [number, [number, number, number]][] = [
        [RD_PELVIS, [0, h, 0]], [RD_CHEST, [0.05, h + spine, 0.1]], [RD_HEAD, [0.08, h + spine + 0.22, 0.15]],
        [RD_HIP_L, [hh, h, 0]], [RD_HIP_R, [-hh, h, 0]], [RD_SHOULDER_L, [sh, h + spine, 0.1]],
        [RD_SHOULDER_R, [-sh, h + spine, 0.1]], [RD_HAND_L, [sh + 0.1, h + 0.2, 0.2]],
        [RD_HAND_R, [-sh - 0.1, h + 0.2, 0.1]], [RD_FOOT_L, [0.185, 0.16, 0.05]], [RD_FOOT_R, [-0.185, 0.16, 0.05]],
      ];
      for (const [index, v] of at) p.ragdoll.set([v[0] + p.x, v[1] + p.y, v[2] + p.z], index * 3);
    });
  }
  // Three native frames of the controller's own hard knock: onset, a partial
  // and a full ragdoll interpolation.
  const plan = buildLevelPlan(
    [{ id: 'flat', length: 400, halfWidth: 50, surface: 'pavement', shoulder: 2 }],
    { id: 'rig-consolidation-test', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'pavement' }, spacing: 4 },
  );
  const controller = new EucController(new PlanTerrainSampler(plan), { spawn: plan.spawn, tuning: { cutoutEnabled: 0 } });
  controller.reset(plan.spawn, 8);
  for (let tick = 0; tick < 20; tick += 1) controller.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: 0.4 });
  assert.ok(controller.hardKnock(3, 0), 'the hard knock was refused');
  const onset = createPose();
  controller.writePose(onset);
  frames.push({ label: 'native-onset', pose: onset });
  const previous = createPose();
  const current = createPose();
  let partial = false;
  let full = false;
  for (let tick = 1; tick <= 40 && !(partial && full); tick += 1) {
    controller.writePose(previous);
    controller.step(1 / 120, NEUTRAL_ACTIONS);
    controller.writePose(current);
    const pose = createPose();
    lerpPose(previous, current, 0.5, pose);
    if (!partial && pose.ragdollBlend > 0 && pose.ragdollBlend < 1) { partial = true; frames.push({ label: 'native-rag-partial', pose }); }
    if (!full && pose.ragdollBlend === 1) { full = true; frames.push({ label: 'native-rag-full', pose }); }
  }
  assert.ok(partial && full, 'the native knock never reached a partial and a full ragdoll frame');
  return frames;
}

const CORPUS = buildCorpus();

function poseRig(rig: Rig, frame: Frame): void {
  rig.setTrickPose(frame.trick ?? 0, RIDER_BLOCKOUT.oneFootReleaseSide);
  if (frame.swing) rig.applySwing(frame.swing.head, frame.swing.angle, frame.swing.blend);
  else rig.applySwing(null, 0, 0);
  rig.apply(frame.pose);
  rig.group.updateMatrixWorld(true);
}

// -- What three submits ---------------------------------------------------------

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((object) => { if ((object as THREE.Mesh).isMesh === true) out.push(object as THREE.Mesh); });
  return out;
}

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
const mix = (h: number, x: number): number => {
  h = Math.imul(h ^ x, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
};
const mwBits = (object: THREE.Object3D): string => {
  let h = 0x1234567;
  for (const e of object.matrixWorld.elements) {
    F64[0] = e === 0 ? 0 : e;
    h = mix(h, U32[0]);
    h = mix(h, U32[1]);
  }
  return h.toString(16);
};

/** Order-free multiset of a geometry's triangles over every attribute's raw bits, cached per version. */
const geometryCache = new WeakMap<THREE.BufferGeometry, { version: string; count: number; a: number; b: number }>();
function triangleMultiset(geometry: THREE.BufferGeometry): { count: number; a: number; b: number } {
  const names = Object.keys(geometry.attributes).sort();
  const version = names.map((name) => `${name}:${(geometry.attributes[name] as THREE.BufferAttribute).version}`).join('|')
    + `|${geometry.index?.version ?? -1}`;
  const cached = geometryCache.get(geometry);
  if (cached !== undefined && cached.version === version) return cached;
  const attributes = names.map((name) => geometry.attributes[name] as THREE.BufferAttribute);
  const words = attributes.map((attribute) => (
    attribute.array instanceof Float32Array
      ? new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length)
      : null
  ));
  const index = geometry.index;
  const corners = index !== null ? index.count : geometry.attributes.position.count;
  let a = 0;
  let b = 0;
  let count = 0;
  for (let t = 0; t + 2 < corners; t += 3) {
    let h1 = 0x9e3779b9;
    let h2 = 0x7f4a7c15;
    for (let k = 0; k < 3; k += 1) {
      const vertex = index !== null ? index.getX(t + k) : t + k;
      h1 = mix(h1, k + 1);
      h2 = mix(h2, 977 * (k + 1));
      for (let n = 0; n < attributes.length; n += 1) {
        const attribute = attributes[n];
        const w = words[n];
        for (let c = 0; c < attribute.itemSize; c += 1) {
          const at = vertex * attribute.itemSize + c;
          const bits = w !== null ? w[at] : ((F64[0] = attribute.array[at]), U32[0] ^ U32[1]);
          h1 = mix(h1, bits);
          h2 = mix(h2 ^ 0x2545f491, bits);
        }
      }
    }
    a = (a + h1) >>> 0;
    b = (b + h2) >>> 0;
    count += 1;
  }
  const result = { version, count, a, b };
  geometryCache.set(geometry, result);
  return result;
}

type Census = Map<string, { count: number; a: number; b: number }>;

/**
 * Both passes as three would submit them (frustum culling aside: a culled
 * triangle draws nothing either way). `ordinal` names a material by the
 * unconsolidated rig's own order, so two builds compare material for material.
 * `skip` leaves a mesh out (the baked sets, compared on their own).
 */
function census(root: THREE.Object3D, ordinal: (mesh: THREE.Mesh) => number, skip: (mesh: THREE.Mesh) => boolean): Census {
  const out: Census = new Map();
  const add = (key: string, geometry: THREE.BufferGeometry): void => {
    const set = triangleMultiset(geometry);
    const entry = out.get(key) ?? { count: 0, a: 0, b: 0 };
    entry.count += set.count;
    entry.a = (entry.a + set.a) >>> 0;
    entry.b = (entry.b + set.b) >>> 0;
    out.set(key, entry);
  };
  const walk = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && !skip(mesh)) {
      const flags = [
        ordinal(mesh), mesh.receiveShadow, mesh.renderOrder, mesh.frustumCulled, mesh.layers.mask,
        mesh.matrixWorld.determinant() < 0, mwBits(mesh),
      ].join('|');
      add(`colour|${flags}`, mesh.geometry);
      if (mesh.castShadow) add(`shadow|${flags}`, mesh.geometry);
    }
    for (const child of object.children) walk(child);
  };
  walk(root);
  return out;
}

function sameCensus(actual: Census, expected: Census, what: string): void {
  for (const [key, value] of expected) {
    const other = actual.get(key);
    assert.ok(other !== undefined, `${what}: ${key.split('|')[0]} submission ${key.slice(0, 60)}… is gone`);
    assert.deepEqual(other, value, `${what}: ${key.split('|')[0]} triangles changed under ${key.slice(0, 60)}…`);
  }
  for (const key of actual.keys()) assert.ok(expected.has(key), `${what}: a new ${key.split('|')[0]} submission ${key.slice(0, 60)}…`);
}

/** World-space corners plus raw normal/uv/colour bits, in index order. */
function worldCorners(meshes: readonly THREE.Mesh[]): { positions: number[]; bits: number[] } {
  const positions: number[] = [];
  const bits: number[] = [];
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const index = g.index!;
    for (let i = 0; i < index.count; i += 1) {
      const vertex = index.getX(i);
      v.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, vertex).applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
      for (const name of Object.keys(g.attributes).sort()) {
        if (name === 'position') continue;
        const attribute = g.attributes[name] as THREE.BufferAttribute;
        const words = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length);
        for (let c = 0; c < attribute.itemSize; c += 1) bits.push(words[vertex * attribute.itemSize + c]);
      }
    }
  }
  return { positions, bits };
}

// -- The equivalence --------------------------------------------------------------

test('every seat rig submits the same triangles consolidated — OD-2 panels cast, OD-1 pads within float32 rounding', () => {
  for (const id of SEATS) {
    // `plain`: the graph `rider.ts` and `euc.ts` built. `shipped`: the seat rig
    // as the game builds it. `mapped`: a second plain build consolidated by
    // hand with the shipped options, so every member it absorbs can be traced
    // back to its twin in `plain` by traversal position.
    const plain = seatRig(id, { consolidate: false });
    const shipped = seatRig(id);
    const mapped = seatRig(id, { consolidate: false });
    try {
      const plainMeshes = meshesOf(plain.group);
      const mappedMeshes = meshesOf(mapped.group);
      assert.equal(mappedMeshes.length, plainMeshes.length);
      const position = new Map(mappedMeshes.map((mesh, index) => [mesh, index]));
      const materialOrder = new Map<THREE.Material, number>();
      for (const mesh of plainMeshes) {
        const material = mesh.material as THREE.Material;
        if (!materialOrder.has(material)) materialOrder.set(material, materialOrder.size);
      }
      const plainOrdinal = (mesh: THREE.Mesh): number => materialOrder.get(mesh.material as THREE.Material)!;
      const mappedOrdinal = (mesh: THREE.Mesh): number => plainOrdinal(plainMeshes[position.get(mesh)!]);
      const consolidation = consolidateRig(mapped.group, { bake: BAKED_PAIRS, castUnion: true });

      // OD-2: the plain rig with every absorbed non-casting panel of a casting
      // set switched to cast — exactly what the owner approved, and nothing else.
      const bakedKeeps = new Set<THREE.Mesh>();
      for (const [keep, members] of consolidation.absorbed) {
        if (BAKED_NAMES.has(keep.name)) bakedKeeps.add(keep);
        if (!keep.castShadow) continue;
        for (const member of members) {
          if (!member.castShadow) plainMeshes[position.get(member)!].castShadow = true;
        }
      }
      const plainBaked = plainMeshes.filter((mesh) => BAKED_NAMES.has(mesh.name));
      assert.equal(plainBaked.length, 4, `${id}: the pad and pedal pairs are not all there`);
      // A merge never mixes material objects (the key is the object, not its values).
      for (const [keep, members] of consolidation.absorbed) {
        for (const member of members) assert.equal(member.material, keep.material, `${id}: ${keep.name} merged another material`);
      }

      for (const frame of CORPUS) {
        poseRig(plain, frame);
        poseRig(mapped, frame);
        poseRig(shipped, frame);
        const expected = census(plain.group, plainOrdinal, (mesh) => BAKED_NAMES.has(mesh.name));
        sameCensus(census(mapped.group, mappedOrdinal, (mesh) => bakedKeeps.has(mesh)), expected, `${id}/${frame.label}`);

        // The baked sets: the same corners within float32 rounding, every
        // other attribute bit for bit, in concatenation (creation) order.
        for (const names of BAKED_PAIRS) {
          const before = plainBaked.filter((mesh) => names.includes(mesh.name)).sort((a, b) => a.id - b.id);
          const after = [...bakedKeeps].filter((mesh) => names.includes(mesh.name));
          assert.equal(after.length, 1, `${id}: ${names.join(' + ')} is not one mesh`);
          const a = worldCorners(before);
          const b = worldCorners(after);
          assert.equal(b.positions.length, a.positions.length);
          let worst = 0;
          for (let i = 0; i < a.positions.length; i += 1) worst = Math.max(worst, Math.abs(a.positions[i] - b.positions[i]));
          assert.ok(worst <= BAKE_TOLERANCE_METRES, `${id}/${frame.label}: ${names.join(' + ')} moved ${worst} m`);
          assert.deepEqual(b.bits, a.bits, `${id}/${frame.label}: ${names.join(' + ')} changed a normal, uv or colour bit`);
          assert.equal(after[0].castShadow, before[0].castShadow);
          assert.equal(after[0].receiveShadow, before[0].receiveShadow);
        }

        // And the shipped rig is that consolidation, submission for submission.
        // Its own materials, so it is named by its own traversal order — which
        // is the mapped rig's, because both were built and merged identically.
        const shippedMeshes = meshesOf(shipped.group);
        const mappedNow = meshesOf(mapped.group);
        assert.equal(shippedMeshes.length, mappedNow.length, `${id}: the shipped rig is not the shipped options`);
        const twin = new Map(shippedMeshes.map((mesh, index) => [mesh, mappedNow[index]]));
        sameCensus(
          census(shipped.group, (mesh) => mappedOrdinal(twin.get(mesh)!), () => false),
          census(mapped.group, mappedOrdinal, () => false),
          `${id}/${frame.label} shipped`,
        );
      }
      consolidation.dispose();
    } finally {
      plain.dispose();
      shipped.dispose();
      mapped.dispose();
    }
  }
});

test('the savings are pinned per look — a look change moved a merge, re-pin after checking the harness', () => {
  // Colour calls saved / shadow calls saved / triangles OD-2 made cast, per
  // seat rig. OD-1 is the +2/+2 every rig carries (pads and pedals); the exact
  // tier and OD-2 are the rest. The ghost and the CPU-cop trims save nothing:
  // they build unconsolidated.
  const PINNED: Record<string, readonly [number, number, number]> = {
    'cool-rider': [4, 2, 2272],
    trollina: [4, 3, 0],
    'red-rider': [3, 2, 1096],
    adonisb2: [7, 2, 2836],
    'maribel-vargas': [3, 2, 0],
    'wheel-in-motion': [8, 2, 2388],
    drunkard: [6, 4, 520],
    'flo-with-zo': [4, 2, 136],
    'seal-on-a-wheel': [2, 2, 0],
    wyldist: [3, 3, 0],
    gnarwheel: [2, 2, 0],
    cop: [3, 2, 1098],
  };
  assert.deepEqual(Object.keys(PINNED).sort(), [...SEATS].sort(), 'a seat rig joined or left the roster');
  for (const id of SEATS) {
    const rig = seatRig(id);
    try {
      const c = rig.consolidation;
      assert.ok(c !== null);
      assert.deepEqual(
        [c.savedColourCalls, c.savedShadowCalls, c.addedShadowTriangles],
        PINNED[id],
        `${id}: a look change moved a merge — re-pin after checking the harness`,
      );
    } finally {
      rig.dispose();
    }
  }
});

// -- Ownership and disposal -------------------------------------------------------

test('two rigs of one look share nothing, and each disposes its own — the merged buffers exactly once', () => {
  for (const id of ['cool-rider', 'drunkard', 'cop'] as const) {
    const a = seatRig(id);
    const b = seatRig(id);
    const resources = (rig: Rig): { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material>; textures: Set<THREE.Texture>; merged: Set<THREE.BufferGeometry> } => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      const merged = new Set<THREE.BufferGeometry>();
      const take = (mesh: THREE.Mesh): void => {
        geometries.add(mesh.geometry);
        const material = mesh.material as THREE.Material;
        materials.add(material);
        for (const value of Object.values(material)) if ((value as THREE.Texture)?.isTexture === true) textures.add(value as THREE.Texture);
      };
      for (const mesh of meshesOf(rig.group)) take(mesh);
      for (const [keep, members] of rig.consolidation!.absorbed) {
        merged.add(keep.geometry);
        for (const member of members) take(member);
      }
      return { geometries, materials, textures, merged };
    };
    const ra = resources(a);
    const rb = resources(b);
    for (const geometry of rb.geometries) assert.ok(!ra.geometries.has(geometry), `${id}: two rigs share a geometry`);
    for (const material of rb.materials) assert.ok(!ra.materials.has(material), `${id}: two rigs share a material`);
    for (const texture of rb.textures) assert.ok(!ra.textures.has(texture), `${id}: two rigs share a texture`);
    assert.ok(ra.merged.size > 0, `${id}: nothing was merged`);

    // The absorbed members' originals are not in the graph any more; they
    // are still the factories', and they still go when the rig goes.
    const events = new Map<THREE.BufferGeometry, number>();
    const listen = (geometry: THREE.BufferGeometry): void => {
      if (events.has(geometry)) return;
      events.set(geometry, 0);
      geometry.addEventListener('dispose', () => { events.set(geometry, events.get(geometry)! + 1); });
    };
    for (const geometry of [...ra.geometries, ...rb.geometries]) listen(geometry);
    a.dispose();
    for (const geometry of rb.geometries) assert.equal(events.get(geometry), 0, `${id}: disposing one rig disposed the other's geometry`);
    for (const geometry of ra.geometries) assert.ok(events.get(geometry)! >= 1, `${id}: a geometry of the disposed rig was never disposed`);
    for (const geometry of ra.merged) assert.equal(events.get(geometry), 1, `${id}: a merged buffer was not disposed exactly once`);
    b.dispose();
    for (const geometry of rb.merged) assert.equal(events.get(geometry), 1);
  }
});

// -- Negative controls ------------------------------------------------------------

test('what must stay its own mesh stays its own mesh', () => {
  const absorbedAnywhere = (rig: Rig): Set<THREE.Mesh> => {
    const out = new Set<THREE.Mesh>();
    for (const [keep, members] of rig.consolidation!.absorbed) { out.add(keep); for (const m of members) out.add(m); }
    return out;
  };

  // The visor is transparent: its blend order is the camera's business.
  const cool = seatRig('cool-rider');
  try {
    const visor = cool.group.getObjectByName('rider-cool-visor') as THREE.Mesh;
    assert.ok(visor && visor.parent?.name === 'rider-neck', 'the visor left the neck');
    assert.ok(!absorbedAnywhere(cool).has(visor), 'the transparent visor joined a merge');

    // The hands carry their own runtime roll: kept separate, and still turned.
    for (const side of ['left', 'right']) {
      const hand = cool.group.getObjectByName(`rider-hand-${side}`) as THREE.Mesh;
      assert.ok(hand && !absorbedAnywhere(cool).has(hand), `the ${side} hand joined a merge`);
      poseRig(cool, CORPUS.find((frame) => frame.label === 'neutral')!);
      const eased = hand.quaternion.clone();
      poseRig(cool, CORPUS.find((frame) => frame.label === 'fast-carve')!);
      assert.ok(!hand.quaternion.equals(eased), `the ${side} hand no longer turns between an eased stop and a fast carve`);
    }
    // The tyre spins; the paddle is hung after consolidation.
    assert.ok(!absorbedAnywhere(cool).has(cool.euc.tyre));
    assert.ok(!absorbedAnywhere(cool).has(cool.group.getObjectByName('rider-paddle-mesh') as THREE.Mesh));
  } finally {
    cool.dispose();
  }

  // The surface-updated lofts are dynamic buffers: never merged, still moving.
  for (const id of ['wyldist', 'gnarwheel'] as const) {
    const rig = seatRig(id);
    try {
      const dynamic = meshesOf(rig.group).filter((mesh) => (
        Object.values(mesh.geometry.attributes).some((attribute) => (attribute as THREE.BufferAttribute).usage === THREE.DynamicDrawUsage)
      ));
      assert.ok(dynamic.length >= 4, `${id}: only ${dynamic.length} surface-updated lofts`);
      const merged = absorbedAnywhere(rig);
      for (const mesh of dynamic) assert.ok(!merged.has(mesh), `${id}: a surface-updated loft joined a merge`);
      poseRig(rig, CORPUS.find((frame) => frame.label === 'neutral')!);
      const before = dynamic.map((mesh) => Float32Array.from(mesh.geometry.attributes.position.array as Float32Array));
      poseRig(rig, CORPUS.find((frame) => frame.label === 'fast-carve')!);
      assert.ok(
        dynamic.some((mesh, index) => !(mesh.geometry.attributes.position.array as Float32Array).every((x, i) => x === before[index][i])),
        `${id}: the surface updaters stopped moving the lofts`,
      );
    } finally {
      rig.dispose();
    }
  }

  // The opt-out: a part marked dynamic is never merged.
  const trollina = seatRig('trollina', { consolidate: false });
  try {
    const belt = trollina.group.getObjectByName('rider-belt') as THREE.Mesh;
    assert.ok(belt, 'Trollina lost her belt');
    belt.userData.dynamic = true;
    const result = consolidateRig(trollina.group, {});
    for (const [keep, members] of result.absorbed) {
      assert.ok(keep !== belt && !members.includes(belt), 'a part marked userData.dynamic was merged');
    }
    assert.equal(belt.parent?.name, 'rider-pelvis');
    result.dispose();
  } finally {
    trollina.dispose();
  }

  // OD-1 throws rather than baking a pad that stopped being a static translation.
  const turned = seatRig('cool-rider', { consolidate: false });
  try {
    (turned.group.getObjectByName('euc-pad-left') as THREE.Mesh).rotation.y = 0.1;
    assert.throws(() => consolidateRig(turned.group, { bake: BAKED_PAIRS }), /no longer a bakeable static set/);
  } finally {
    turned.dispose();
  }
});

// -- The ghost, the trims, and the atlas -------------------------------------------

test('the ghost and the CPU-cop trims are built from the unconsolidated rig', () => {
  for (const id of CHARACTER_IDS) {
    const look = riderLook(id);
    const machine = machineLook(machineForCharacter(id));
    const plain = createRidingRig(look, machine, { consolidate: false });
    const ghost = createGhostRider(look, machine);
    try {
      assert.equal(meshesOf(ghost.group).length, meshesOf(plain.group).length, `${id}: the ghost is not a whole rig`);
    } finally {
      plain.dispose();
      ghost.dispose();
    }
  }
  // The trim's own build-time counters, the frozen baseline's to the call and
  // the triangle (`renderCost.test.ts` prices it at 26 calls once its paddle
  // is armed, and holds `measureCopRig({ full: true })` to
  // `measureSeatRig('cop')`).
  for (const index of [0, 1, 2]) {
    const cop = createCopRider({ index });
    try {
      assert.equal(cop.drawCalls, 23);
      assert.equal(cop.shadowDrawCalls, 3);
      assert.equal(cop.triangles, 8902);
    } finally {
      cop.dispose();
    }
  }
  const full = createCopRider({ full: true });
  const seat = createCopRidingRig();
  try {
    let visible = 0;
    seat.group.traverse((object) => { if ((object as THREE.Mesh).isMesh === true && object.visible) visible += 1; });
    assert.equal(full.drawCalls, visible, 'the full cop is not the consolidated seat cop');
  } finally {
    full.dispose();
    seat.dispose();
  }
});

test('every mapped mesh of a consolidated atlas rig still lands on a page (invariant 13)', () => {
  for (const [look, regions] of [[MARIBEL_LOOK, ATLAS_REGIONS], [WHEEL_IN_MOTION_LOOK, WIM_REGIONS]] as const) {
    const pages = Object.entries(regions as Record<string, { u0: number; u1: number; v0: number; v1: number }>);
    const rig = createRidingRig(look, machineLook(machineForCharacter(look.id)));
    try {
      let mapped = 0;
      for (const mesh of meshesOf(rig.rider.root)) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material.map === null) continue;
        mapped += 1;
        const uv = mesh.geometry.getAttribute('uv');
        assert.ok(uv, `${look.id}'s ${mesh.name || '(unnamed)'} samples the sheet with no texture coordinates`);
        for (let i = 0; i < uv.count; i += 1) {
          const u = uv.getX(i);
          const v = uv.getY(i);
          assert.ok(
            pages.some(([, r]) => u >= r.u0 - 1e-6 && u <= r.u1 + 1e-6 && v >= r.v0 - 1e-6 && v <= r.v1 + 1e-6),
            `${look.id}'s ${mesh.name || '(unnamed)'} samples (${u.toFixed(3)}, ${v.toFixed(3)}), off every page`,
          );
        }
      }
      assert.ok(mapped >= 4, `${look.id}: only ${mapped} meshes sample the sheet`);
    } finally {
      rig.dispose();
    }
  }
});
