/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { createPose } from '../simulation/EucController.ts';
import { createPlaceholderRider } from './rider.ts';
import { SEAL_ON_A_WHEEL_LOOK } from './riderLook.ts';
import { createRidingRig } from './ridingRig.ts';
import { measureObject } from './renderCost.ts';
import { WYLDIST_REGIONS, type WyldistPage } from './wyldistAtlas.ts';
import { vAtHeight } from './blockoutKit.ts';
import {
  WYLDIST_HEAD_NAPE, WYLDIST_HEAD_SCALE, WYLDIST_NECK, wyldistFace, wyldistHelmetLining, wyldistHelmetShell,
} from './wyldistHelmet.ts';
import { WYLDIST_LOOK } from './wyldistLook.ts';
import { WYLDIST_MACHINE_LOOK } from './wyldistMachineLook.ts';

/** Inspect built resources and UVs; no private photograph or identity is read. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

function pagesAt(u: number, v: number): WyldistPage[] {
  return (Object.entries(WYLDIST_REGIONS) as [WyldistPage, typeof WYLDIST_REGIONS.shirt][])
    .filter(([, rect]) => u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6
      && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6)
    .map(([name]) => name);
}

/** A merged mesh may wear several pages, but a triangle may never join them. */
function verifyMappedPages(root: THREE.Object3D): Set<WyldistPage> {
  const used = new Set<WyldistPage>();
  let mapped = 0;
  for (const mesh of meshesOf(root)) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => (material as THREE.MeshStandardMaterial).map != null)) continue;
    mapped += 1;
    const uv = mesh.geometry.getAttribute('uv');
    assert.ok(uv, `${mesh.name || '(unnamed)'} samples the sheet without UVs`);
    const vertexPages: WyldistPage[][] = [];
    for (let i = 0; i < uv.count; i += 1) {
      const pages = pagesAt(uv.getX(i), uv.getY(i));
      assert.ok(pages.length > 0, `${mesh.name || '(unnamed)'} vertex ${i} is off every atlas page`);
      vertexPages.push(pages);
      for (const page of pages) used.add(page);
    }
    const index = mesh.geometry.getIndex();
    const count = index?.count ?? uv.count;
    for (let at = 0; at < count; at += 3) {
      const corners = [0, 1, 2].map((offset) => index?.getX(at + offset) ?? at + offset);
      assert.ok(vertexPages[corners[0]!]!.some((page) => corners.every((i) => vertexPages[i]!.includes(page))),
        `${mesh.name || '(unnamed)'} triangle ${at / 3} crosses atlas pages`);
    }
  }
  assert.ok(mapped > 0, 'the rider must actually sample his painted sheet');
  return used;
}

test('the actual rider and riding rig remain below the shipped Seal graphics ceilings', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  const seal = createPlaceholderRider(SEAL_ON_A_WHEEL_LOOK);
  try {
    const hisCost = measureObject(rider.root);
    const sealCost = measureObject(seal.root);
    assert.ok(hisCost.totalDrawCalls <= 40, `rider costs ${hisCost.totalDrawCalls} calls against 40`);
    assert.ok(hisCost.totalTriangles <= 23484, `rider costs ${hisCost.totalTriangles} triangles against 23484`);
    assert.ok(hisCost.totalDrawCalls <= sealCost.totalDrawCalls, 'rider call cost exceeds the actual Seal build');
    assert.ok(hisCost.totalTriangles <= sealCost.totalTriangles, 'rider triangle cost exceeds the actual Seal build');
  } finally {
    rider.dispose();
    seal.dispose();
  }

  const rig = createRidingRig(WYLDIST_LOOK, WYLDIST_MACHINE_LOOK);
  try {
    const pose = createPose();
    rig.apply(pose);
    const unarmed = measureObject(rig.group);
    assert.ok(unarmed.totalDrawCalls <= 58, `unarmed rig costs ${unarmed.totalDrawCalls} calls against 58`);
    assert.ok(unarmed.totalTriangles <= 29608, `unarmed rig costs ${unarmed.totalTriangles} triangles against 29608`);
    rig.applySwing(new THREE.Vector3(-0.8, 1.1, 0.5), 0, 1);
    rig.apply(pose);
    const armed = measureObject(rig.group);
    assert.ok(armed.totalDrawCalls > unarmed.totalDrawCalls, 'the armed check must show its paddle');
    assert.ok(armed.totalDrawCalls <= 60, `armed rig costs ${armed.totalDrawCalls} calls against 60`);
    assert.ok(armed.totalTriangles <= 30360, `armed rig costs ${armed.totalTriangles} triangles against 30360`);
  } finally {
    rig.dispose();
  }
});

test('every mapped vertex and triangle lands within the page it wears', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const used = verifyMappedPages(rider.root);
    for (const page of ['shirt', 'leftSleeve', 'rightSleeve', 'helmet'] as const) {
      assert.ok(used.has(page), `the built rider never wears the ${page} page`);
    }
    const face = rider.root.getObjectByName('rider-wyldist-face') as THREE.Mesh;
    assert.ok(face?.isMesh, 'his bare face is present');
    const material = face.material as THREE.MeshStandardMaterial;
    assert.equal(material.map, null, 'bare skin must not sample clothing or helmet ink');
    assert.equal(material.opacity, 1);
    assert.equal(material.transparent, false);
    assert.equal(material.depthWrite, true);
  } finally {
    rider.dispose();
  }
});

test('the UV guard rejects an unfolded vertex and a triangle joining two valid pages', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const torso = rider.pelvis.children.find((child) => {
      const mesh = child as THREE.Mesh;
      return mesh.isMesh && mesh.castShadow && (mesh.material as THREE.MeshStandardMaterial).map != null;
    }) as THREE.Mesh;
    assert.ok(torso, 'the painted casting torso is present');
    const uv = torso.geometry.getAttribute('uv');
    const index = torso.geometry.getIndex();
    assert.ok(index, 'the torso has indexed triangles');
    const vertex = index.getX(0);
    const before: [number, number] = [uv.getX(vertex), uv.getY(vertex)];
    uv.setXY(vertex, 0, 0);
    assert.throws(() => verifyMappedPages(rider.root), /off every atlas page/);
    const helmet = WYLDIST_REGIONS.helmet;
    uv.setXY(vertex, (helmet.u0 + helmet.u1) / 2, (helmet.v0 + helmet.v1) / 2);
    assert.throws(() => verifyMappedPages(rider.root), /crosses atlas pages/);
    uv.setXY(vertex, ...before);
    verifyMappedPages(rider.root);
  } finally {
    rider.dispose();
  }
});

test('the inner helmet uses matte dark lining independently of the glossy printed shell', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const lining = rider.root.getObjectByName('rider-wyldist-helmet-lining') as THREE.Mesh;
    assert.ok(lining?.isMesh, 'the built helmet must contain its padding');
    const material = lining.material as THREE.MeshStandardMaterial;
    const mesh = new THREE.Mesh(lining.geometry, material);
    lining.geometry.computeBoundingBox();
    const bounds = lining.geometry.boundingBox!;
    const y = (bounds.min.y + bounds.max.y) / 2;
    const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 0), new THREE.Vector3(0, 0, -1));
    const check = (): void => {
      const hit = ray.intersectObject(mesh, false)[0];
      assert.ok(hit?.face, 'the view into the helmet must reach an inner wall');
      assert.equal(material.map, null, 'inner padding must not sample the exterior badge');
      assert.ok(material.roughness >= .85, 'glossy padding can flash as a white plate in a fold');
      const colour = lining.geometry.getAttribute('color');
      for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
        assert.ok(Math.max(colour.getX(vertex) * material.color.r,
          colour.getY(vertex) * material.color.g, colour.getZ(vertex) * material.color.b) < .05,
        'the inner wall must remain dark');
      }
    };
    for (const offset of [-.020, 0, .020]) { ray.ray.origin.y = y + offset; check(); }
    material.roughness = .46;
    assert.throws(check, /glossy padding/, 'the former glossy-lining material must fail');
  } finally { rider.dispose(); }
});

/** AGENTS #17 on welded positions: each directed edge once, each with a reverse twin. */
function closedVolume(parts: readonly THREE.BufferGeometry[]): number {
  const ids = new Map<string, number>(), edges = new Map<string, number>();
  let volume = 0;
  for (const g of parts) {
    const p = g.getAttribute('position'), index = g.getIndex()!;
    const id = (i: number): number => {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e5)).join();
      if (!ids.has(key)) ids.set(key, ids.size);
      return ids.get(key)!;
    };
    for (let at = 0; at < index.count; at += 3) {
      const [a, b, c] = [index.getX(at), index.getX(at + 1), index.getX(at + 2)];
      const corners = [id(a), id(b), id(c)];
      assert.equal(new Set(corners).size, 3, 'no degenerate helmet triangle');
      for (let k = 0; k < 3; k += 1) {
        const key = `${corners[k]}>${corners[(k + 1) % 3]}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      const [A, B, C] = [a, b, c].map((i) => new THREE.Vector3().fromBufferAttribute(p, i));
      volume += A!.dot(B!.clone().cross(C!)) / 6;
    }
  }
  for (const [key, count] of edges) {
    assert.equal(count, 1, `edge ${key} is walked ${count} times the same way`);
    const [from, to] = key.split('>');
    assert.ok(edges.has(`${to}>${from}`), `edge ${key} has no opposite twin`);
  }
  return volume;
}

test('the helmet is one closed shell whose chin bar is its own surface, seated on the collar over a neck roll', () => {
  const shell = wyldistHelmetShell(), lining = wyldistHelmetLining(), face = wyldistFace();
  try {
    // Shell, spoiler, port walls and padding weld into one outward solid.
    assert.ok(closedVolume([shell, lining]) > 0, 'the helmet solid is wound inward');
    const flipped = lining.clone(), index = flipped.getIndex()!;
    index.setX(1, index.getX(2)); index.setX(2, lining.getIndex()!.getX(1));
    assert.throws(() => closedVolume([shell, flipped]), /walked|twin/, 'one reversed padding facet must fail');
    flipped.dispose();
    // r0 bolted a flat, separately shaded box on as the chin bar; C3's prow
    // jutted 0.2 of the depth as a duck bill under a notch. Now the shell itself
    // comes to a prow 0.05–0.11 of its depth past the brow, most forward at
    // mouth level rather than on the rim, with the face's nose within 0.05 of the
    // depth behind it (a convex front, no cave), and its front centreline is one
    // smooth seam (no lit crease).
    const p = shell.getAttribute('position'), n = shell.getAttribute('normal'), uv = shell.getAttribute('uv');
    face.computeBoundingBox(); shell.computeBoundingBox();
    // The lid is built smaller than designed about its nape (owner 2026-10-10,
    // "a bit big headed": .292 m wide then); design heights map onto it here.
    const lidY = (y: number): number => WYLDIST_HEAD_NAPE.y + (y - WYLDIST_HEAD_NAPE.y) * WYLDIST_HEAD_SCALE;
    const lidZ = (z: number): number => WYLDIST_HEAD_NAPE.z + (z - WYLDIST_HEAD_NAPE.z) * WYLDIST_HEAD_SCALE;
    const width = shell.boundingBox!.max.x - shell.boundingBox!.min.x, tall = shell.boundingBox!.max.y - shell.boundingBox!.min.y;
    assert.ok(width <= .262 && tall <= .280, `the lid is ${width.toFixed(3)} m wide and ${tall.toFixed(3)} m tall`);
    let chinFront = -Infinity, chinFrontY = 0, browFront = -Infinity, rimLow = Infinity, rimBack = Infinity, seams = 0;
    let chinBase = Infinity, earBase = -Infinity;
    const front = new Map<string, number[]>();
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < lidY(.13) && Math.abs(x) < .02 && z > chinFront) { chinFront = z; chinFrontY = y; }
      if (y > lidY(.228) && y < lidY(.26) && Math.abs(x) < .02) browFront = Math.max(browFront, z);
      if (z < -.05 && Math.abs(x) < .02 && Math.abs(uv.getY(i) - .02) > 1e-6) rimLow = Math.min(rimLow, y);
      if (y < .072) rimBack = Math.min(rimBack, z);
      // The base edge (row 0): its height under the chin and under the ear.
      if (Math.abs(uv.getY(i) - .065) < 1e-6) {
        if (z > lidZ(.1)) chinBase = Math.min(chinBase, y);
        if (Math.abs(z - lidZ(.02)) < .03) earBase = Math.max(earBase, y);
      }
      if (Math.abs(x) < 1e-7 && z > .05) {
        const key = [y, z].map((v) => v.toFixed(5)).join();
        const normal = [n.getX(i), n.getY(i), n.getZ(i)];
        const twin = front.get(key);
        if (twin) { seams += 1; assert.ok(Math.hypot(...twin.map((v, k) => v - normal[k]!)) < 1e-6, `lit crease on the prow at ${key}`); }
        else front.set(key, normal);
      }
    }
    const depth = shell.boundingBox!.max.z - shell.boundingBox!.min.z, nose = face.boundingBox!.max.z;
    assert.ok(nose < chinFront && chinFront - nose <= .05 * depth, `nose ${nose.toFixed(3)} sits in a cave behind the prow ${chinFront.toFixed(3)}`);
    const prow = (chinFront - browFront) / depth;
    assert.ok(prow >= .05 && prow <= .11, `the prow juts ${prow.toFixed(3)} of the depth past the brow`);
    // Its tip is the port's V apex, lowered (round 2, owner: the goatee) to
    // .0914 in design height; still 4 cm over the chin rim (.045), never on it.
    assert.ok(chinFrontY >= lidY(.088), `the prow's most forward point sits at ${chinFrontY.toFixed(3)}, on the rim`);
    assert.ok(seams >= 5, 'examine the closed front seam down the chin and over the crown');
    // The rear rim reaches the collar (r0 stopped .101 above the joint; the
    // collar's back stands to .078) yet stays within .085 of the pivot so a
    // ridden head-up tuck clears the back. In profile the base edge is an S, not
    // a straight cut (C2 critic F6): lowest under the chin bar, high under the
    // ear, dipping again at the nape.
    assert.ok(rimLow <= .072, `rear rim stops ${rimLow.toFixed(3)} above the neck joint`);
    assert.ok(rimBack >= -.085, `rear rim reaches ${rimBack.toFixed(3)} behind the pivot`);
    assert.ok(earBase >= chinBase + .025 && earBase >= rimLow + .010,
      `base edge chin ${chinBase.toFixed(3)} / ear ${earBase.toFixed(3)} / nape ${rimLow.toFixed(3)} is not an S`);
    // The padding rolls in to within 8 mm of the neck all round: from below a
    // padded ring tapering onto the neck, never a flat disc or open bowl.
    const q = lining.getAttribute('position'), gaps = new Array(12).fill(Infinity);
    for (let i = 0; i < q.count; i += 1) {
      const y = q.getY(i);
      if (y < .060 || y > .112) continue;
      const v = vAtHeight(WYLDIST_NECK, y), r = Math.min(WYLDIST_NECK.length - 2, Math.floor(v)), t = v - r;
      const a = WYLDIST_NECK[r]!, b = WYLDIST_NECK[r + 1]!, mix = (m: number, o: number): number => m + (o - m) * t;
      const x = q.getX(i) / mix(a.halfWidth, b.halfWidth), z = (q.getZ(i) - mix(a.z, b.z)) / mix(a.halfDepth, b.halfDepth);
      const bin = Math.floor(((Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 12);
      // Along the ray from the neck's axis: (1 − 1/ρ) of the vertex's own reach,
      // ρ in the neck's own superellipse (its square), not an ellipse.
      const reach = Math.hypot(q.getX(i), q.getZ(i) - mix(a.z, b.z)), sq = mix(a.square, b.square);
      gaps[bin] = Math.min(gaps[bin], (1 - 1 / (Math.abs(x) ** sq + Math.abs(z) ** sq) ** (1 / sq)) * reach);
    }
    for (const gap of gaps) assert.ok(gap >= 0 && gap <= .008, `the neck roll stands ${gap.toFixed(4)} m off the neck`);
  } finally {
    shell.dispose(); lining.dispose(); face.dispose();
  }
});

test('at the full 0.55 rad head-up tuck the printed shell stays out of the upper back and sleeves', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  try {
    const neck = rider.root.getObjectByName('rider-neck')!;
    const shell = neck.children.find((child) => {
      const mesh = child as THREE.Mesh;
      return mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).map != null;
    }) as THREE.Mesh;
    const torso = rider.pelvis.children.find((child) => {
      const mesh = child as THREE.Mesh;
      return mesh.isMesh && mesh.castShadow && (mesh.material as THREE.MeshStandardMaterial).map != null;
    }) as THREE.Mesh;
    const bodies = [torso, ...['left', 'right'].map((side) => rider.root.getObjectByName(`rider-sleeve-${side}`) as THREE.Mesh)];
    assert.ok(shell?.isMesh && bodies.every((body) => body?.isMesh), 'examine the built shell, torso and sleeves');
    const check = (pitch: number): void => {
      neck.rotation.x = pitch;
      rider.root.updateMatrixWorld(true);
      const probes = bodies.map((body) => { const m = new THREE.Mesh(body.geometry, material); m.matrixAutoUpdate = false; m.matrixWorld.copy(body.matrixWorld); return m; });
      const position = shell.geometry.getAttribute('position'), point = new THREE.Vector3(), ray = new THREE.Raycaster();
      const direction = new THREE.Vector3(.13, .97, -.21).normalize();
      let examined = 0;
      for (let i = 0; i < position.count; i += 1) {
        point.fromBufferAttribute(position, i).applyMatrix4(shell.matrixWorld);
        for (const probe of probes) {
          ray.set(point, direction);
          const hits = ray.intersectObject(probe, false);
          const crossings = hits.filter((hit, at) => at === 0 || Math.abs(hit.distance - hits[at - 1]!.distance) > 1e-6);
          assert.equal(crossings.length % 2, 0, `shell vertex ${i} sinks into the body in the tuck`);
        }
        examined += 1;
      }
      assert.ok(examined > 500, 'sample the whole shell');
    };
    // The stabiliser's limit (RIDER_BLOCKOUT.headStabilizationMax) applied as head-up pitch.
    check(-.55);
    // Beyond the rig's reach the lowered rim does meet the back: the predicate can fail.
    assert.throws(() => check(-.85), /sinks into the body/);
  } finally {
    material.dispose();
    rider.dispose();
  }
});

test('the shirt wrap has no reversed seam facet even when garment edging shares a mesh', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const torso = rider.pelvis.children.find((child) => {
      const mesh = child as THREE.Mesh;
      return mesh.isMesh && mesh.castShadow && (mesh.material as THREE.MeshStandardMaterial).map != null;
    }) as THREE.Mesh;
    assert.ok(torso, 'the painted torso is present');
    const uv = torso.geometry.getAttribute('uv');
    const index = torso.geometry.getIndex();
    assert.ok(index, 'the torso must be indexed');
    const shirt = WYLDIST_REGIONS.shirt;
    const onShirt = (i: number): boolean => pagesAt(uv.getX(i), uv.getY(i)).includes('shirt');
    const capCentre = (i: number): boolean => Math.abs(uv.getX(i) - (shirt.u0 + shirt.u1) / 2) < 1e-6
      && (Math.abs(uv.getY(i) - shirt.v0) < 1e-6 || Math.abs(uv.getY(i) - shirt.v1) < 1e-6);
    let widest = 0;
    let low = Infinity;
    let high = -Infinity;
    let triangles = 0;
    for (let at = 0; at < index.count; at += 3) {
      const corners = [index.getX(at), index.getX(at + 1), index.getX(at + 2)];
      if (!corners.every(onShirt) || corners.some(capCentre)) continue;
      triangles += 1;
      const us = corners.map((i) => uv.getX(i));
      widest = Math.max(widest, Math.max(...us) - Math.min(...us));
      low = Math.min(low, ...us);
      high = Math.max(high, ...us);
    }
    assert.ok(triangles > 0, 'the wrap check must examine actual shirt surface triangles');
    assert.ok(widest < (shirt.u1 - shirt.u0) * 0.10, `one shirt facet spans ${widest} UV units`);
    assert.ok(low <= shirt.u0 + 1e-6 && high >= shirt.u1 - 1e-6, 'the shirt reaches both edges of its page');
  } finally {
    rider.dispose();
  }
});

function ownedResources(root: THREE.Object3D): {
  geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material>; textures: Set<THREE.Texture>;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const mesh of meshesOf(root)) {
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value !== null && typeof value === 'object' && (value as THREE.Texture).isTexture) {
          textures.add(value as THREE.Texture);
        }
      }
    }
  }
  return { geometries, materials, textures };
}

test('sheared sleeves keep continuous shading across their outward printed seam', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const check = (mesh: THREE.Mesh, page: 'leftSleeve' | 'rightSleeve'): void => {
      const position = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      const uv = mesh.geometry.getAttribute('uv');
      const bounds = WYLDIST_REGIONS[page];
      let pairs = 0;
      for (let a = 0; a < uv.count; a += 1) {
        if (Math.abs(uv.getX(a) - bounds.u0) > 1e-6) continue;
        for (let b = 0; b < uv.count; b += 1) {
          if (Math.abs(uv.getX(b) - bounds.u1) > 1e-6 || Math.abs(uv.getY(a) - uv.getY(b)) > 1e-6) continue;
          assert.ok(Math.hypot(position.getX(a) - position.getX(b), position.getY(a) - position.getY(b),
            position.getZ(a) - position.getZ(b)) < 1e-6, 'the seam is one physical point');
          assert.ok(Math.hypot(normal.getX(a) - normal.getX(b), normal.getY(a) - normal.getY(b),
            normal.getZ(a) - normal.getZ(b)) < 1e-6, 'the seam normals must agree after deformation');
          pairs += 1;
        }
      }
      assert.ok(pairs >= 5, 'check the outward seam throughout the sleeve, not one cap');
    };
    for (const side of ['left', 'right'] as const) {
      const mesh = rider.root.getObjectByName(`rider-sleeve-${side}`) as THREE.Mesh;
      assert.ok(mesh?.isMesh);
      const page = side === 'left' ? 'leftSleeve' : 'rightSleeve';
      check(mesh, page);
      mesh.geometry.computeVertexNormals();
      assert.throws(() => check(mesh, page), /seam normals/, 'unsmoothed duplicated columns must fail');
    }
  } finally {
    rider.dispose();
  }
});

/** A closed cloth shell must contain the actual skin crown it dresses. */
function checkShoulderCoverage(root: THREE.Object3D): void {
  for (const side of ['left', 'right'] as const) {
    const shoulder = root.getObjectByName(`rider-shoulder-${side}`)!;
    const sleeve = root.getObjectByName(`rider-sleeve-${side}`) as THREE.Mesh;
    const skin = shoulder.children.find((child) => {
      const mesh = child as THREE.Mesh;
      return mesh.isMesh && mesh.castShadow && mesh !== sleeve;
    }) as THREE.Mesh;
    assert.ok(skin?.isMesh && sleeve?.isMesh, 'examine the built skin and cloth on each shoulder');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const shell = new THREE.Mesh(sleeve.geometry, material);
    shell.updateMatrixWorld(true);
    sleeve.geometry.computeBoundingBox();
    const hem = sleeve.geometry.boundingBox!.min.y;
    const points = skin.geometry.getAttribute('position');
    const direction = new THREE.Vector3(.37, .23, .89).normalize();
    const ray = new THREE.Raycaster();
    let examined = 0;
    try {
      for (let i = 0; i < points.count; i += 1) {
        if (points.getY(i) < hem + .002) continue; // below the actual cloth hem is intentionally bare
        const origin = new THREE.Vector3().fromBufferAttribute(points, i);
        ray.set(origin, direction);
        const hits = ray.intersectObject(shell, false);
        // A seam can report one crossing twice; count distinct distances.
        const crossings = hits.filter((hit, at) => at === 0 || Math.abs(hit.distance - hits[at - 1]!.distance) > 1e-6);
        assert.equal(crossings.length % 2, 1, `${side} shoulder skin vertex ${i} escapes the printed cloth`);
        examined += 1;
      }
      assert.ok(examined >= 50, 'sample the complete crown, not one central point');
    } finally {
      material.dispose();
    }
  }
}

test('both printed sleeves contain the skin crown; moving only cloth fails the same predicate', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  const broken = createPlaceholderRider({
    ...WYLDIST_LOOK, paint: { ...WYLDIST_LOOK.paint, upperArm: undefined },
  });
  try {
    checkShoulderCoverage(rider.root);
    assert.throws(() => checkShoulderCoverage(broken.root), /escapes the printed cloth/);
  } finally {
    rider.dispose();
    broken.dispose();
  }
});

test('three complete rig replacements free each owned resource once and restore the detached scene', () => {
  const scene = new THREE.Scene();
  const anchor = new THREE.Group();
  scene.add(anchor);
  let expected: number[] | undefined;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const rig = createRidingRig(WYLDIST_LOOK, WYLDIST_MACHINE_LOOK);
    scene.add(rig.group);
    rig.apply(createPose());
    rig.applyStatus(0.85, cycle + 0.25);
    const resources = ownedResources(rig.group);
    const counts = [resources.geometries.size, resources.materials.size, resources.textures.size];
    assert.ok(counts[0]! > 0 && counts[1]! > 0);
    assert.equal(resources.textures.size, 1, 'one runtime sheet belongs to this rider');
    if (expected === undefined) expected = counts;
    else assert.deepEqual(counts, expected, 'rebuilding the same rig must plateau at the same owned counts');
    const released = new Map<object, number>();
    for (const resource of [...resources.geometries, ...resources.materials, ...resources.textures]) {
      released.set(resource, 0);
      resource.addEventListener('dispose', () => released.set(resource, released.get(resource)! + 1));
    }
    rig.dispose();
    assert.deepEqual(scene.children, [anchor]);
    assert.equal(rig.group.parent, null);
    assert.equal(rig.rider.root.parent, null);
    assert.equal(rig.euc.group.parent, null);
    for (const count of released.values()) assert.equal(count, 1, 'each owned resource is released exactly once');
    const remaining = ownedResources(scene);
    assert.deepEqual([remaining.geometries.size, remaining.materials.size, remaining.textures.size], [0, 0, 0]);
  }
});
