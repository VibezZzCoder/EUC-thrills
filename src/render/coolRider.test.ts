/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { COOL_RIDER_LOOK, coolFace, coolFlank, coolHelmetShell, coolVisor } from './coolRiderLook.ts';
import { COOL_REGIONS } from './coolRiderAtlas.ts';
import { createPlaceholderRider } from './rider.ts';
import { createGhostRider } from './ghostRider.ts';

test('the helmet opening exposes the eyes and nose, while the rear shell remains closed', () => {
  const geometry = coolHelmetShell();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  for (const x of [-.032, 0, .032]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, .22, .5), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObject(mesh);
    assert.ok(hits.length > 0, 'the rear shell is missing');
    assert.ok(hits.every(hit => hit.point.z < 0), 'a closed helmet face hides the rider');
  }
  const chin = new THREE.Raycaster(new THREE.Vector3(0, .11, .5), new THREE.Vector3(0, 0, -1));
  assert.ok(chin.intersectObject(mesh).some(hit => hit.point.z > .10), 'the chin guard lost its volume');
  geometry.dispose(); material.dispose();
});

test('both continuous jacket inserts are closed, outward-wound, mirrored volumes', () => {
  const geometries = [-1, 1].map(coolFlank);
  try {
    const volumes: number[] = [];
    for (const g of geometries) {
      const p = g.getAttribute('position'), index = g.getIndex()!;
      const edges = new Map<string, number>();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      let volume = 0;
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        a.fromBufferAttribute(p, ids[0]!); b.fromBufferAttribute(p, ids[1]!); c.fromBufferAttribute(p, ids[2]!);
        volume += a.dot(b.cross(c)) / 6;
        for (let j = 0; j < 3; j++) {
          const key = `${ids[j]}:${ids[(j + 1) % 3]}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      for (const [edge, count] of edges) {
        assert.equal(count, 1, 'a panel edge is walked twice in one direction');
        assert.equal(edges.get(edge.split(':').reverse().join(':')), 1, 'a panel has an open edge');
      }
      assert.ok(volume > 0, `a blue panel faces inward: ${volume}`);
      volumes.push(volume);
    }
    assert.ok(Math.abs(volumes[0]! - volumes[1]!) < 1e-8, 'the paired panels differ in volume');
  } finally { geometries.forEach(g => g.dispose()); }
});

test('the tinted visor stays ahead of the eyes and nose without hiding the face or ghost', () => {
  const rider = createPlaceholderRider(COOL_RIDER_LOOK), ghost = createGhostRider(COOL_RIDER_LOOK);
  const pane = new THREE.Mesh(coolVisor(), new THREE.MeshBasicMaterial());
  const face = new THREE.Mesh(coolFace(), new THREE.MeshBasicMaterial());
  pane.updateMatrixWorld(true); face.updateMatrixWorld(true);
  try {
    const visor = rider.root.getObjectByName('rider-cool-visor') as THREE.Mesh;
    const material = visor.material as THREE.MeshStandardMaterial;
    assert.equal(material.transparent, true);
    assert.equal(material.depthWrite, false, 'glass must not mask other transparent effects');
    assert.ok(material.opacity > .05 && material.opacity < .35, 'light tint became opaque');
    assert.equal(material.map, null, 'the garment sheet leaked onto glass');
    assert.equal(visor.castShadow, false, 'glass shadow conceals the face');
    for (const [x, y] of [[-.031, .220], [.031, .220], [0, .19]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, .5), new THREE.Vector3(0, 0, -1));
      const glassHits = ray.intersectObject(pane), faceHits = ray.intersectObject(face);
      assert.ok(glassHits.length > 0, 'the pane is missing or inverted');
      // A ray on a shared triangle edge hits both faces at the same depth.
      assert.ok(glassHits.every(hit => Math.abs(hit.distance - glassHits[0]!.distance) < 1e-6),
        'the pane draws two overlapping layers');
      assert.ok(faceHits.length > 0);
      assert.ok(glassHits[0]!.point.z - faceHits[0]!.point.z > .005, 'visor intersects a facial feature');
    }
    assert.equal(ghost.group.getObjectByName('ghost-rider-cool-visor')?.visible, false);
    assert.equal(ghost.group.getObjectByName('ghost-rider-cool-face')?.visible, true);
    let disposed = 0; material.addEventListener('dispose', () => disposed++);
    rider.dispose(); assert.equal(disposed, 1, 'the separate glass material leaked');
  } finally {
    ghost.dispose(); pane.geometry.dispose(); face.geometry.dispose();
    (pane.material as THREE.Material).dispose(); (face.material as THREE.Material).dispose();
  }
});

test('every printed mesh is folded onto atlas pages and every attribute is finite', () => {
  const rider = createPlaceholderRider(COOL_RIDER_LOOK);
  let printed = 0;
  try {
    rider.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const attribute of Object.values((object.geometry as THREE.BufferGeometry).attributes)) {
        for (const n of attribute.array) assert.ok(Number.isFinite(n), `${object.name}: nonfinite geometry`);
      }
      const material = object.material as THREE.MeshStandardMaterial;
      if (!material.map) return;
      printed++;
      const uv = object.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i), epsilon = 1e-6;
        assert.ok(Object.values(COOL_REGIONS).some(r => u >= r.u0 - epsilon && u <= r.u1 + epsilon
          && v >= r.v0 - epsilon && v <= r.v1 + epsilon), `${object.name}: unpaged texel ${u},${v}`);
      }
    });
    assert.ok(printed >= 12, 'the tailoring sheet is no longer worn by the garment');
  } finally { rider.dispose(); }
});

test('the entire cut edge of the visor sits inside the opaque helmet seal', () => {
  const glass = coolVisor(), helmet = new THREE.Mesh(coolHelmetShell(), new THREE.MeshBasicMaterial());
  helmet.updateMatrixWorld(true);
  try {
    const edges = new Map<string, { a: number; b: number; count: number }>();
    const index = glass.getIndex()!, position = glass.getAttribute('position');
    for (let i = 0; i < index.count; i += 3) {
      const face = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      for (let j = 0; j < 3; j++) {
        const a = face[j]!, b = face[(j + 1) % 3]!;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const edge = edges.get(key);
        if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
      }
    }
    const boundary = [...edges.values()].filter(e => e.count === 1);
    assert.ok(boundary.length > 20, 'the pane has no inspectable cut edge');
    const point = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3();
    for (const edge of boundary) for (const t of [0, .25, .5, .75]) {
      start.fromBufferAttribute(position, edge.a); end.fromBufferAttribute(position, edge.b);
      point.lerpVectors(start, end, t);
      for (const direction of [[0, 0, 1], [.65, 0, .75], [-.65, 0, .75], [0, .5, .85], [0, -.5, .85]]) {
        const outward = new THREE.Vector3(...direction).normalize();
        const ray = new THREE.Raycaster(point.clone().addScaledVector(outward, .05), outward.negate(), 0, .05);
        assert.ok(ray.intersectObject(helmet).length > 0,
          `glass cut edge ${point.toArray()} is exposed beyond the seal from ${direction}`);
      }
    }
  } finally { glass.dispose(); helmet.geometry.dispose(); (helmet.material as THREE.Material).dispose(); }
});

test('the face remains present in the ghost and textures are owned by each rig', () => {
  const a = createPlaceholderRider(COOL_RIDER_LOOK), b = createPlaceholderRider(COOL_RIDER_LOOK);
  const ghost = createGhostRider(COOL_RIDER_LOOK);
  try {
    const face = ghost.group.getObjectByName('ghost-rider-cool-face');
    assert.ok(face?.visible, 'the face disappeared from the replay');
    const textures = (root: THREE.Object3D) => {
      const found = new Set<THREE.DataTexture>();
      root.traverse(o => { if (o instanceof THREE.Mesh) {
        const map = (o.material as THREE.MeshStandardMaterial).map;
        if (map instanceof THREE.DataTexture) found.add(map);
      } });
      return [...found];
    };
    const [ta] = textures(a.root), [tb] = textures(b.root);
    assert.ok(ta && tb); assert.notEqual(ta, tb, 'two rigs share one disposable texture');
    assert.deepEqual(ta.image.data, tb.image.data, 'tailoring changes between builds');
    let disposed = 0; ta.addEventListener('dispose', () => disposed++);
    a.dispose(); assert.equal(disposed, 1, 'the tailoring texture leaked');
  } finally { b.dispose(); ghost.dispose(); }
});
