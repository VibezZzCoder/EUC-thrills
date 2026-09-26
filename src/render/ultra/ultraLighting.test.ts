/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LiveTuning } from '../../data/liveTuning.ts';
import { LIGHTING, ULTRA } from '../../data/tuning.ts';
import { DAYLIGHT_LOOK, resolveVenueLook } from '../../data/venueLook.ts';
import { SWITCHBACK_LOOK } from '../../level/switchbackLevel.ts';
import {
  defaultUltraLive,
  finaliseShadowFocus,
  lightBasis,
  nearFadeBand,
  nearTexelMetres,
  readUltraLive,
  shadowRigFor,
  ultraFill,
  ultraNearMapSize,
  ULTRA_NEAR_MIN_MAP_SIZE,
  ultraSkyOptions,
  writeShadowRig,
} from './ultraLighting.ts';
import type { ShadowRig } from './ultraTypes.ts';

/**
 * The Ultra lighting maths — M39 W4 (`docs/M39_ULTRA.md` §3.2, §3.6).
 *
 * The one promise that protects every ordinary frame is first: the ordinary
 * rig is today's rig, field for field, read off a light built the way the
 * `GameRenderer` constructor builds it (not off `shadowRigFor` itself — a
 * function compared to itself agrees whatever it has become). Then the near
 * cascade's placement: forward bias, the rider's 35 m inset, and the
 * light-space snap that keeps the map world-locked under sub-texel motion.
 */

/** The sun exactly as `GameRenderer`'s constructor and `createVenueLighting` hang it. */
function constructorSun(): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(DAYLIGHT_LOOK.sunColour, DAYLIGHT_LOOK.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LIGHTING.shadowMapSize);
  sun.shadow.bias = LIGHTING.shadowBias;
  sun.shadow.normalBias = LIGHTING.shadowNormalBias;
  const camera = sun.shadow.camera;
  camera.left = -LIGHTING.shadowRadius;
  camera.right = LIGHTING.shadowRadius;
  camera.top = LIGHTING.shadowRadius;
  camera.bottom = -LIGHTING.shadowRadius;
  camera.near = 1;
  camera.far = LIGHTING.sunDistance * 2;
  camera.updateProjectionMatrix();
  const horizontal = Math.cos(LIGHTING.sunElevation) * LIGHTING.sunDistance;
  sun.position.set(
    Math.sin(LIGHTING.sunAzimuth) * horizontal,
    Math.sin(LIGHTING.sunElevation) * LIGHTING.sunDistance,
    Math.cos(LIGHTING.sunAzimuth) * horizontal,
  );
  return sun;
}

/** Every field a rig writes, off a light, for deep comparison. */
function rigFieldsOf(sun: THREE.DirectionalLight): Record<string, unknown> {
  const camera = sun.shadow.camera;
  return {
    mapSize: [sun.shadow.mapSize.x, sun.shadow.mapSize.y],
    box: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far],
    projection: [...camera.projectionMatrix.elements],
    bias: sun.shadow.bias,
    normalBias: sun.shadow.normalBias,
    radius: sun.shadow.radius,
    intensity: sun.shadow.intensity,
    position: sun.position.toArray(),
    target: sun.target.position.toArray(),
  };
}

test('the ordinary rig is the constructor’s and setQuality’s, field for field', () => {
  const sun = constructorSun();
  const rig = shadowRigFor('ordinary', 'high');
  assert.equal(rig.mapSize, sun.shadow.mapSize.x);
  assert.equal(rig.extent, sun.shadow.camera.right);
  assert.equal(-rig.extent, sun.shadow.camera.left);
  assert.equal(rig.near, sun.shadow.camera.near);
  assert.equal(rig.far, sun.shadow.camera.far);
  assert.equal(rig.bias, sun.shadow.bias);
  assert.equal(rig.normalBias, sun.shadow.normalBias);
  // three's defaults, which the renderer never writes.
  assert.equal(rig.radius, sun.shadow.radius);
  assert.equal(rig.intensity, sun.shadow.intensity);
  assert.ok(Math.abs(rig.lightDistance - sun.position.distanceTo(sun.target.position)) < 1e-9);
  assert.deepEqual([rig.forwardShare, rig.snap, rig.fadeShare], [0, false, 0]);
  // setQuality: 2048 on High, half below it.
  assert.equal(shadowRigFor('ordinary', 'medium').mapSize, LIGHTING.shadowMapSize / 2);
  assert.equal(shadowRigFor('ordinary', 'low').mapSize, LIGHTING.shadowMapSize / 2);
});

test('writing the ordinary rig onto a default light reproduces the constructor’s light', () => {
  const reference = constructorSun();
  const written = new THREE.DirectionalLight();
  written.position.copy(reference.position);
  writeShadowRig(written, shadowRigFor('ordinary', 'high'));
  assert.deepEqual(rigFieldsOf(written), rigFieldsOf(reference));
});

test('ordinary → Ultra → ordinary lands back on today’s rig, with the Ultra map released', () => {
  const reference = constructorSun();
  const sun = constructorSun();
  const released: string[] = [];
  const ultra = shadowRigFor('ultra', 'high');
  writeShadowRig(sun, ultra);
  assert.equal(sun.shadow.mapSize.x, 4096);
  assert.equal(sun.shadow.camera.right, 55);
  assert.ok(Math.abs(sun.position.distanceTo(sun.target.position) - 150) < 1e-9);
  // Pretend three allocated the 4096 map; the ordinary write must drop it.
  const map = new THREE.WebGLRenderTarget(1, 1);
  map.addEventListener('dispose', () => released.push('map'));
  sun.shadow.map = map;
  writeShadowRig(sun, shadowRigFor('ordinary', 'high'));
  assert.deepEqual(released, ['map']);
  assert.equal(sun.shadow.map, null);
  const back = rigFieldsOf(sun);
  const expected = rigFieldsOf(reference);
  // The light is 60 m out along the same direction again; the renderer's
  // ordinary `setShadowFocus` rewrites it from `sunOffset` the next frame.
  assert.ok(sun.position.distanceTo(reference.position) < 1e-9);
  delete (back as Record<string, unknown>).position;
  delete (expected as Record<string, unknown>).position;
  assert.deepEqual(back, expected);
});

test('the Ultra rig is §3.2’s near cascade, with the live near values when given', () => {
  const rig = shadowRigFor('ultra', 'high');
  assert.deepEqual({ ...rig }, {
    mapSize: 4096,
    extent: 55,
    near: 1,
    far: 320,
    bias: ULTRA.nearBias,
    normalBias: ULTRA.nearNormalBias,
    radius: ULTRA.nearRadius,
    intensity: 1,
    lightDistance: 150,
    forwardShare: 0.35,
    snap: true,
    fadeShare: 0.12,
  });
  const live = { ...defaultUltraLive(), nearBias: -0.001, nearNormalBias: 0.05, nearRadius: 2 };
  const tuned = shadowRigFor('ultra', 'high', live);
  assert.deepEqual([tuned.bias, tuned.normalBias, tuned.radius], [-0.001, 0.05, 2]);
  // The live set never reaches the ordinary rig.
  assert.deepEqual(shadowRigFor('ordinary', 'high', live), shadowRigFor('ordinary', 'high'));
  // 2.69 cm texels (§3.2).
  assert.ok(Math.abs((2 * rig.extent) / rig.mapSize - 0.02686) < 1e-4);
});

test('final wave (A22, Fable F5): the Ultra rig takes the runtime\'s buffer-sized map, never past the table; the ordinary rig ignores it', () => {
  const live = defaultUltraLive();
  // Omitted (or not a number): the table's 4096, exactly the rig as before.
  assert.deepEqual(shadowRigFor('ultra', 'high', live), shadowRigFor('ultra', 'high', live, undefined));
  assert.equal(shadowRigFor('ultra', 'high', live, Number.NaN).mapSize, ULTRA.near.mapSize);
  // A phone's 2048 (ultraShadowSizes.ts), and only the map size moves.
  const phone = shadowRigFor('ultra', 'high', live, 2048);
  assert.equal(phone.mapSize, 2048);
  assert.deepEqual({ ...phone, mapSize: ULTRA.near.mapSize }, { ...shadowRigFor('ultra', 'high', live) });
  // Clamped: never grows past the table (the envelope's shadowMap ceiling), never below the floor; rounded.
  assert.equal(ultraNearMapSize(8192), ULTRA.near.mapSize);
  assert.equal(ultraNearMapSize(16), ULTRA_NEAR_MIN_MAP_SIZE);
  assert.equal(ultraNearMapSize(3071.6), 3072);
  // The ordinary rig is today's whatever the buffer.
  assert.deepEqual(shadowRigFor('ordinary', 'high', live, 2048), shadowRigFor('ordinary', 'high'));
  assert.deepEqual(shadowRigFor('ordinary', 'medium', undefined, 4096), shadowRigFor('ordinary', 'medium'));

  // writeShadowRig takes it: a 2048 rig reallocates the map, and the snap reads the new texel.
  const sun = new THREE.DirectionalLight();
  sun.position.set(30, 40, 0);
  writeShadowRig(sun, shadowRigFor('ultra', 'high', live));
  sun.shadow.map = { dispose: () => undefined } as unknown as THREE.WebGLRenderTarget;
  writeShadowRig(sun, phone);
  assert.equal(sun.shadow.mapSize.x, 2048);
  assert.equal(sun.shadow.map, null, 'the 4096 map is released for three to reallocate at 2048');
  assert.ok(Math.abs(nearTexelMetres(sun, phone) - (2 * ULTRA.near.extent) / 2048) < 1e-12);
});

test('final wave (Fable F7): finaliseShadowFocus allocates nothing — no array or object literal, no `new`', () => {
  // Node strips the types, so this is the function as it runs every Ultra frame.
  const source = finaliseShadowFocus.toString();
  const body = source.slice(source.indexOf('{'));
  assert.ok(!/\[/.test(body), 'no array literal or index');
  assert.ok(!/\bnew\b/.test(body), 'no constructor');
  assert.ok(!/[=(,]\s*\{/.test(body), 'no object literal');
});

test('the 48 m beacon clears the light distance at 55° and at 33° (§3.2)', () => {
  const rig = shadowRigFor('ultra', 'high');
  for (const look of [DAYLIGHT_LOOK, resolveVenueLook(SWITCHBACK_LOOK)]) {
    const el = look.sunElevation;
    const depth = rig.extent * Math.cos(el) + 48 * Math.sin(el);
    assert.ok(depth < rig.lightDistance - rig.near, `${depth.toFixed(1)} m at ${(el * 180 / Math.PI).toFixed(0)}°`);
    // And the box's far plane reaches the ground at the box edge beneath it.
    assert.ok(rig.lightDistance + rig.extent * Math.cos(el) < rig.far);
  }
  // The spec's own arithmetic at 55°: 70.9 m.
  assert.ok(Math.abs(55 * Math.cos((55 * Math.PI) / 180) + 48 * Math.sin((55 * Math.PI) / 180) - 70.9) < 0.05);
});

/** A sun hung for a look, with the Ultra rig written. */
function ultraSun(look = DAYLIGHT_LOOK, rig: ShadowRig = shadowRigFor('ultra', 'high')): {
  sun: THREE.DirectionalLight; unit: THREE.Vector3; rig: ShadowRig;
} {
  const sun = new THREE.DirectionalLight();
  const unit = new THREE.Vector3(
    Math.sin(look.sunAzimuth) * Math.cos(look.sunElevation),
    Math.sin(look.sunElevation),
    Math.cos(look.sunAzimuth) * Math.cos(look.sunElevation),
  );
  sun.position.copy(unit).multiplyScalar(60);
  writeShadowRig(sun, rig);
  return { sun, unit, rig };
}

function lightSpace(point: THREE.Vector3, unit: THREE.Vector3): [number, number, number] {
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  lightBasis(unit, x, y, z);
  return [point.dot(x), point.dot(y), point.dot(z)];
}

test('the light basis is the one three’s shadow camera wears', () => {
  for (const look of [DAYLIGHT_LOOK, resolveVenueLook(SWITCHBACK_LOOK)]) {
    const { sun, unit } = ultraSun(look);
    sun.target.position.set(3, 1, -4);
    sun.position.copy(sun.target.position).addScaledVector(unit, 150);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const camera = sun.shadow.camera;
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    lightBasis(unit, x, y, z);
    const cx = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const cy = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const cz = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    assert.ok(cx.distanceTo(x) < 1e-9 && cy.distanceTo(y) < 1e-9 && cz.distanceTo(z) < 1e-9);
  }
});

test('the cascade is pushed 19.25 m ahead along the camera’s horizontal forward', () => {
  const { sun, unit, rig } = ultraSun();
  const pose = new THREE.Vector3(12, 3, -40);
  // A camera pitched down at the road: the push stays horizontal.
  const forward = new THREE.Vector3(0.6, -0.5, 0.8).normalize();
  finaliseShadowFocus(sun, pose, forward, unit, rig);
  const texel = nearTexelMetres(sun, rig);
  const expected = pose.clone().add(new THREE.Vector3(0.6, 0, 0.8).multiplyScalar(0.35 * 55));
  const delta = sun.target.position.clone().sub(expected);
  const [dx, dy, dz] = lightSpace(delta, unit);
  // Off only by the snap: under a texel on each light axis, nothing in depth.
  assert.ok(Math.abs(dx) < texel + 1e-9 && Math.abs(dy) < texel + 1e-9, `${dx}, ${dy}`);
  assert.ok(Math.abs(dz) < 1e-9);
  assert.ok(Math.abs(sun.position.distanceTo(sun.target.position) - 150) < 1e-9);
  const direction = sun.position.clone().sub(sun.target.position).normalize();
  assert.ok(direction.distanceTo(unit.clone().normalize()) < 1e-12);
});

test('the rider stays ≥ 35 m inside every edge, for every heading, at both suns', () => {
  const looks = [DAYLIGHT_LOOK, resolveVenueLook(SWITCHBACK_LOOK)];
  const shipped = shadowRigFor('ultra', 'high');
  // A tuned share far past the shipped one must engage the clamp.
  const greedy: ShadowRig = { ...shipped, forwardShare: 0.95 };
  for (const look of looks) {
    for (const rig of [shipped, greedy]) {
      const { sun, unit } = ultraSun(look, rig);
      for (let heading = 0; heading < 32; heading += 1) {
        const angle = (heading / 32) * Math.PI * 2;
        const pose = new THREE.Vector3(Math.cos(angle) * 300, 5, Math.sin(angle) * 170);
        const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        finaliseShadowFocus(sun, pose, forward, unit, rig);
        const [dx, dy] = lightSpace(pose.clone().sub(sun.target.position), unit);
        const inside = rig.extent - Math.max(Math.abs(dx), Math.abs(dy));
        assert.ok(inside >= ULTRA.near.rearInsetMetres - 1e-9, `rider ${inside.toFixed(3)} m inside at heading ${heading}`);
      }
    }
  }
});

test('the snap is world-locked: sub-texel moves never shift the texel grid', () => {
  for (const look of [DAYLIGHT_LOOK, resolveVenueLook(SWITCHBACK_LOOK)]) {
    const { sun, unit, rig } = ultraSun(look);
    const texel = nearTexelMetres(sun, rig);
    const forward = new THREE.Vector3(0.3, 0, 0.95).normalize();
    const landmark = new THREE.Vector3(7.3, 0.4, 11.9);
    const [lx, ly] = lightSpace(landmark, unit);
    let previous: [number, number] | null = null;
    for (let step = 0; step < 400; step += 1) {
      // The rider creeps a fifth of a texel a frame, with a little weave.
      const pose = new THREE.Vector3(step * texel * 0.2, 0.1, step * texel * 0.13 + Math.sin(step * 0.3) * texel * 0.1);
      finaliseShadowFocus(sun, pose, forward, unit, rig);
      const [tx, ty] = lightSpace(sun.target.position, unit);
      // The landmark's position on the map, in texels from the box corner,
      // keeps one fractional part for ever: the grid never moved under it.
      const u = (lx - tx + rig.extent) / texel;
      const v = (ly - ty + rig.extent) / texel;
      const fracU = u - Math.round(u - (lx / texel - Math.floor(lx / texel)));
      const fracV = v - Math.round(v - (ly / texel - Math.floor(ly / texel)));
      assert.ok(Math.abs(fracU - (lx / texel - Math.floor(lx / texel))) < 1e-6, `u phase drifted at ${step}`);
      assert.ok(Math.abs(fracV - (ly / texel - Math.floor(ly / texel))) < 1e-6, `v phase drifted at ${step}`);
      // And the box moves only in whole texels, at most one per axis a frame here.
      if (previous !== null) {
        const stepU = (tx - previous[0]) / texel;
        const stepV = (ty - previous[1]) / texel;
        assert.ok(Math.abs(stepU - Math.round(stepU)) < 1e-6 && Math.abs(stepU) <= 1 + 1e-6);
        assert.ok(Math.abs(stepV - Math.round(stepV)) < 1e-6 && Math.abs(stepV) <= 1 + 1e-6);
      }
      previous = [tx, ty];
    }
  }
});

test('the snap reads the map size three actually allocated', () => {
  const { sun, rig } = ultraSun();
  assert.ok(Math.abs(nearTexelMetres(sun, rig) - 110 / 4096) < 1e-12);
  // three writes a clamped size back to `mapSize` after the first frame.
  sun.shadow.mapSize.setScalar(2048);
  assert.ok(Math.abs(nearTexelMetres(sun, rig) - 110 / 2048) < 1e-12);
});

test('the near fade band is 6.6 m of the 110 m box — 0.06 of the map — and 0 on the ordinary rig', () => {
  assert.ok(Math.abs(nearFadeBand(shadowRigFor('ultra', 'high')) - 0.06) < 1e-12);
  assert.ok(Math.abs(nearFadeBand(shadowRigFor('ultra', 'high')) * 110 - 6.6) < 1e-9);
  assert.equal(nearFadeBand(shadowRigFor('ordinary', 'high')), 0);
});

test('the Ultra fill zeroes the hemisphere and hands κ·fill/π to the environment', () => {
  const live = defaultUltraLive();
  const day = ultraFill(DAYLIGHT_LOOK, undefined, live);
  assert.equal(day.hemisphereIntensity, 0);
  assert.ok(Math.abs(day.environmentIntensity - 0.350 * live.envKappa) < 1e-3);
  const park = ultraFill(resolveVenueLook(SWITCHBACK_LOOK), undefined, live);
  assert.ok(Math.abs(park.environmentIntensity - 0.388 * live.envKappa) < 1e-3);
  // κ scales it; a dragged hemisphere slider still wins, as on every tier.
  const doubled = ultraFill(DAYLIGHT_LOOK, undefined, { ...live, envKappa: 2 });
  assert.ok(Math.abs(doubled.environmentIntensity - 2 * 1.1 / Math.PI) < 1e-12);
  const tuned = ultraFill(DAYLIGHT_LOOK, 1.5, live);
  assert.ok(Math.abs(tuned.environmentIntensity - live.envKappa * 1.5 / Math.PI) < 1e-12);
  // Absolute: the same inputs give the same numbers, however often.
  assert.deepEqual(ultraFill(DAYLIGHT_LOOK, undefined, live), day);
});

test('the Ultra sky is 2048×1024 with the fine octave, the cumulus and anisotropy capped by the device', () => {
  assert.deepEqual({ ...ultraSkyOptions(16) }, {
    width: 2048,
    height: 1024,
    anisotropy: 4,
    fineOctaveAmplitude: ULTRA.sky.fineOctaveAmplitude,
    daylightClouds: true,
    cloudSoftnessScale: ULTRA.sky.cloudSoftnessScale,
  });
  assert.equal(ultraSkyOptions(1).anisotropy, 1);
  assert.equal(ultraSkyOptions(2).anisotropy, 2);
  // Wave 3 (R-L): a plan's cumulus seed rides along; none (or 0) is the seedless set.
  assert.equal(ultraSkyOptions(16, 1234).cloudSeed, 1234);
  assert.deepEqual({ ...ultraSkyOptions(16, 0) }, { ...ultraSkyOptions(16) });
  // Wave 4 (R-L): a hook that passes no seed, or not a finite number, paints the seedless sky.
  for (const seed of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -Number.POSITIVE_INFINITY]) {
    assert.deepEqual({ ...ultraSkyOptions(16, seed) }, { ...ultraSkyOptions(16) }, String(seed));
  }
  // …and a seed is a signed 32-bit integer, as `cumulusSeedFor` returns it.
  assert.equal(ultraSkyOptions(16, -1234.7).cloudSeed, -1234);
});

test('readUltraLive reads the fifteen registered paths, and they start at the ULTRA table', () => {
  const tuning = new LiveTuning();
  const live = readUltraLive((path) => tuning.get(path));
  assert.deepEqual({ ...live }, { ...defaultUltraLive() });
  assert.equal(Object.keys(live).length, 15);
  assert.equal(live.shadeLift, ULTRA.shade.lift);
  assert.equal(live.shadeLiftFar, ULTRA.shade.liftFar);
  tuning.set('ULTRA.envKappa', 1.4);
  tuning.set('ULTRA.nearBias', 0);
  tuning.set('ULTRA.shade.lift', 2.4);
  tuning.set('ULTRA.shade.liftFar', 2.9);
  const moved = readUltraLive((path) => tuning.get(path));
  assert.equal(moved.envKappa, 1.4);
  // The owner's trade levers (final touch, post round 4).
  assert.equal(moved.shadeLift, 2.4);
  assert.equal(moved.shadeLiftFar, 2.9);
  // The gauntlet's planted acne is reachable (§8.1).
  assert.equal(moved.nearBias, 0);
});
