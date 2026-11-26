/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { createCopRider } from './copRider.ts';
import { loftNormal, loftPoint, vAtHeight } from './blockoutKit.ts';
import { createPlaceholderRider } from './rider.ts';
import { COP_LOOK } from './riderLook.ts';

function meshWithColour(root: THREE.Object3D, colour: number): THREE.Mesh {
  const mesh = root.children.find((object) => object instanceof THREE.Mesh
    && object.material instanceof THREE.MeshStandardMaterial
    && object.material.color.getHex() === colour);
  assert.ok(mesh instanceof THREE.Mesh);
  return mesh;
}

function containsPoint(geometry: THREE.BufferGeometry, point: THREE.Vector3): boolean {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i += 1) {
    if (Math.hypot(positions.getX(i) - point.x, positions.getY(i) - point.y,
      positions.getZ(i) - point.z) < 1e-7) return true;
  }
  return false;
}

test('Dorkins’s built helmet leaves both lenses open at eye level and below', () => {
  const rider = createPlaceholderRider(COP_LOOK);
  try {
    const neck = rider.root.getObjectByName('rider-neck');
    assert.ok(neck);
    const head = meshWithColour(neck, COP_LOOK.materials.head.colour);
    // Test the production geometry in its own head coordinates, through the
    // bottom, pupil and top of each lens. A face mesh merely existing cannot
    // prove that the helmet in front of it lets the player see it.
    const helmet = new THREE.Mesh(head.geometry, head.material);
    for (const x of [-0.043, 0.043]) {
      for (const y of [0.183, 0.198, 0.215]) {
        for (const elevation of [0, -0.2, 0.1]) {
          const towardCamera = new THREE.Vector3(0, elevation, 1).normalize();
          const origin = new THREE.Vector3(x, y, 0.121).addScaledVector(towardCamera, 0.6);
          const ray = new THREE.Raycaster(origin, towardCamera.negate(), 0, 0.6);
          assert.equal(ray.intersectObject(helmet).length, 0,
            `helmet obscures lens at ${x}, ${y}, elevation ${elevation}`);
        }
      }
    }
    // A lowered copy of this same built crown is the old occlusion class.
    helmet.position.y = -0.038;
    helmet.updateMatrixWorld(true);
    const blocked = new THREE.Raycaster(new THREE.Vector3(0.043, 0.215, 0.721),
      new THREE.Vector3(0, 0, -1), 0, 0.6).intersectObject(helmet);
    assert.ok(blocked.length > 0, 'the occlusion probe must reject a low brow');
  } finally { rider.dispose(); }
});

test('Dorkins’s yellow yoke and navy collar share one continuous edge', () => {
  const rider = createPlaceholderRider(COP_LOOK);
  try {
    const pelvis = rider.root.getObjectByName('rider-pelvis');
    assert.ok(pelvis);
    const torso = meshWithColour(pelvis, COP_LOOK.materials.body.colour);
    const yoke = rider.root.getObjectByName('rider-shoulder-panels');
    assert.ok(yoke instanceof THREE.Mesh);
    const profile = COP_LOOK.profiles.torso;
    const v = vAtHeight(profile, 0.502);
    for (let column = 0; column < 24; column += 1) {
      const u = Math.PI / 2 + column * Math.PI * 2 / 24;
      const edge = loftPoint(profile, u, v, new THREE.Vector3());
      edge.addScaledVector(loftNormal(profile, u, v, new THREE.Vector3()), 0.011);
      assert.ok(containsPoint(torso.geometry, edge), `collar misses edge column ${column}`);
      assert.ok(containsPoint(yoke.geometry, edge), `yoke misses edge column ${column}`);
    }
    // Sample between the columns as well: a matching ring must not conceal
    // interleaving chords that leave the navy base visible below the collar.
    const localYoke = new THREE.Mesh(yoke.geometry, yoke.material);
    const localTorso = new THREE.Mesh(torso.geometry, torso.material);
    for (let column = 0; column < 96; column += 1) {
      const u = (column + 0.5) * Math.PI * 2 / 96;
      const below = vAtHeight(profile, 0.496);
      const point = loftPoint(profile, u, below, new THREE.Vector3());
      const normal = loftNormal(profile, u, below, new THREE.Vector3());
      const hit = new THREE.Raycaster(point.addScaledVector(normal, 0.08),
        normal.negate(), 0, 0.2).intersectObjects([localYoke, localTorso])[0];
      assert.equal(hit?.object, localYoke, `navy notch below collar at column ${column}`);
    }
  } finally { rider.dispose(); }
});

test('every chase trim retains the tyre contact-shadow caster', () => {
  for (const options of [{}, { index: 1 }, { index: 2 }, { full: true }]) {
    const cop = createCopRider(options);
    try {
      const prefix = options.index !== undefined ? `cop${options.index + 1}` : 'cop';
      const tyre = cop.group.getObjectByName(`${prefix}-euc-tyre`);
      assert.ok(tyre instanceof THREE.Mesh);
      assert.equal(tyre.visible, true);
      assert.equal(tyre.castShadow, true, `${prefix} tyre lost its ground contact cue`);
    } finally { cop.dispose(); }
  }
});

test('Dorkins’s glasses run from both rims over the ear and curl behind it', () => {
  const rider = createPlaceholderRider(COP_LOOK);
  try {
    const built = rider.root.getObjectByName('rider-cop-face') as THREE.Mesh;
    const face = new THREE.Mesh(built.geometry, built.material);
    const frameTint = new THREE.Color(0x4c4034).r / new THREE.Color(COP_LOOK.materials.limbs.colour).r;
    const colours = face.geometry.getAttribute('color');
    for (const side of [-1, 1]) {
      // Side-on rays hit the outer surface of the frame along the temple. A
      // dark helmet strap crossing the same region cannot satisfy this probe.
      for (const [z, y] of [[.100,.204],[.085,.205],[.056,.205],[.030,.203],[.009,.201],[-.007,.197],[-.012,.189]]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(side * .2, y, z), new THREE.Vector3(-side, 0, 0), 0, .122);
        const frame = ray.intersectObject(face).find(hit => hit.face &&
          Math.abs(colours.getX(hit.face.a) - frameTint) < 1e-6);
        assert.ok(frame, `temple lost above/beyond ear at side ${side}, z=${z}`);
      }
    }
  } finally { rider.dispose(); }
});
