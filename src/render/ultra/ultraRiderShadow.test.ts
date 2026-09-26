/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import {
  hasRiderShadow,
  holdRiderShadow,
  patchRiderShadowFragment,
  releaseRiderShadow,
  RIDER_SHADOW_ANCHORS,
  patchRiderLightFragment,
  patchRiderLightVertex,
  rekeyRiderLight,
  RIDER_LIGHT_ANCHORS,
  riderLightHasFar,
  riderLightUniforms,
  riderShadowParsChunk,
  ULTRA_RIDER_FAR_KEY,
  ULTRA_RIDER_SHADOW_KEY,
  type RiderLightUniforms,
} from './ultraRiderShadow.ts';
import { createUltraShared, ultraNearFilterGlsl } from './ultraMaterials.ts';

/**
 * The rider's near-map filter — the ground's own (`ultraNearFilterGlsl()`) —
 * M39 round 3 item 3
 * (`ultraRiderShadow.ts`). Headless: the patch is a string edit and the hooks
 * are plain functions, so what is pinned here is the anchors against the
 * three 0.185.1 source, that the edit lands where it must and nowhere else,
 * that `THREE.ShaderChunk` is only read, and that a held material comes back
 * exactly. The pixels are checked in the browser (`docs/M39_ULTRA.md` §U2,
 * "Final wave — P-RT").
 */

const THREE_SHADERS = new URL('../../../node_modules/three/src/renderers/shaders/', import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, THREE_SHADERS), 'utf8');
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

test('every anchor is in the pinned three source and in the live chunks', () => {
  const pars = source('ShaderChunk/shadowmap_pars_fragment.glsl.js');
  const physical = source('ShaderLib/meshphysical.glsl.js');
  assert.ok(pars.includes(RIDER_SHADOW_ANCHORS.pcfGetShadow), 'the PCF getShadow signature moved');
  assert.ok(pars.includes(RIDER_SHADOW_ANCHORS.shadowReturn), 'the PCF return moved');
  assert.ok(physical.includes(RIDER_SHADOW_ANCHORS.include), 'the standard fragment no longer includes the chunk');
  assert.ok(THREE.ShaderChunk.shadowmap_pars_fragment.includes(RIDER_SHADOW_ANCHORS.pcfGetShadow));
  assert.ok(THREE.ShaderLib.standard.fragmentShader.includes(RIDER_SHADOW_ANCHORS.include));
  // The first getShadow in the chunk is the PCF one, and its return is the
  // chunk's first return of that text — the edit relies on both.
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  assert.equal(chunk.indexOf('float getShadow('), chunk.indexOf(RIDER_SHADOW_ANCHORS.pcfGetShadow));
  assert.ok(
    chunk.lastIndexOf('#if defined( SHADOWMAP_TYPE_PCF )', chunk.indexOf(RIDER_SHADOW_ANCHORS.pcfGetShadow))
      > chunk.indexOf('float interleavedGradientNoise('),
    'the PCF getShadow is not in its own PCF branch after the noise',
  );
  assert.ok(chunk.indexOf(RIDER_SHADOW_ANCHORS.shadowReturn) > chunk.indexOf(RIDER_SHADOW_ANCHORS.pcfGetShadow));
  assert.ok(
    chunk.indexOf(RIDER_SHADOW_ANCHORS.shadowReturn) < chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )'),
    'the first return is not the PCF one',
  );
});

test('the edited chunk: the ground filter inside the PCF branch, at the PCF return, and nothing else moved', () => {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const edited = riderShadowParsChunk();
  // The filter sits inside the PCF branch (after three's noise) and before the PCF getShadow.
  const helper = edited.indexOf('float ultraNearEdgeShadow(');
  assert.ok(helper > edited.indexOf('float interleavedGradientNoise('));
  assert.ok(helper < edited.indexOf(RIDER_SHADOW_ANCHORS.pcfGetShadow));
  // The PCF return is preceded by the filter; the other returns are three's.
  assert.equal(count(edited, 'shadow = ultraNearEdgeShadow( shadowMap, shadowCoord.xyz, shadowMapSize, shadowRadius );'), 1);
  assert.equal(count(edited, RIDER_SHADOW_ANCHORS.shadowReturn), count(chunk, RIDER_SHADOW_ANCHORS.shadowReturn));
  const call = edited.indexOf('ultraNearEdgeShadow( shadowMap,');
  assert.ok(call > edited.indexOf(RIDER_SHADOW_ANCHORS.pcfGetShadow));
  assert.ok(call < edited.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )'));
  // The inserted text is the ground's filter verbatim, and removing the two
  // insertions gives three's chunk back, byte for byte.
  const inserted = `\n\t\t// ---- M39 Ultra: the rider's near-map filter (render/ultra/ultraRiderShadow.ts) ----\n${ultraNearFilterGlsl()}\n\t\t`;
  assert.equal(count(edited, inserted), 1, 'the ground filter, verbatim');
  const restored = edited
    .replace(inserted, '')
    .replace(/if \( frustumTest \) shadow = ultraNearEdgeShadow\([^\n]*\n\t\t\t/, '');
  assert.equal(restored, chunk);
  // No noise of its own: the only noise calls left are three's (in its other branches).
  assert.equal(count(edited, 'interleavedGradientNoise('), count(chunk, 'interleavedGradientNoise('));
});

test('the disk is the patched families’ disk: taps and weights', () => {
  const edited = riderShadowParsChunk();
  const taps = ULTRA.nearFilter.taps;
  assert.ok(edited.includes(`const vec3 ultraDisk[ ${taps} ] = vec3[ ${taps} ](`));
  const block = edited.slice(edited.indexOf('const vec3 ultraDisk'), edited.indexOf(');', edited.indexOf('const vec3 ultraDisk')));
  const weights = [...block.matchAll(/vec3\( (-?[\d.]+), (-?[\d.]+), ([\d.]+) \)/g)];
  assert.equal(weights.length, taps);
  const sum = weights.reduce((total, match) => total + Number(match[3]), 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `the weights sum to ${sum}`);
  for (const match of weights) assert.ok(Math.hypot(Number(match[1]), Number(match[2])) <= 1 + 1e-6, 'a tap outside the unit disk');
});

test('the standard fragment takes the edited chunk once; a shader with no shadow lookup is left alone', () => {
  const fragment = THREE.ShaderLib.standard.fragmentShader;
  const patched = patchRiderShadowFragment(fragment);
  assert.equal(count(patched, RIDER_SHADOW_ANCHORS.include), 0);
  assert.equal(count(patched, 'float ultraNearEdgeShadow('), 1);
  assert.equal(count(patched, 'float ultraDiskShadow('), 1);
  assert.ok(patched.includes(riderShadowParsChunk()));
  const basic = THREE.ShaderLib.basic.fragmentShader;
  const plain = '#include <common>\nvoid main() { gl_FragColor = vec4( 1.0 ); }';
  assert.equal(patchRiderShadowFragment(plain), plain);
  assert.equal(patchRiderShadowFragment(basic).includes('ultraNearEdgeShadow'), basic.includes(RIDER_SHADOW_ANCHORS.include));
});

test('THREE.ShaderChunk is only ever read', () => {
  const before = { ...THREE.ShaderChunk };
  const material = new THREE.MeshStandardMaterial();
  holdRiderShadow(material);
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
  riderShadowParsChunk();
  assert.deepEqual({ ...THREE.ShaderChunk }, before);
});

test('hold and release: the prototype hooks are uncovered, own hooks come back as themselves, keys are distinct', () => {
  const bare = new THREE.MeshStandardMaterial();
  const ordinaryKey = bare.customProgramCacheKey();
  const version = bare.version;
  const held = holdRiderShadow(bare);
  assert.equal(held.ownCompile, false);
  assert.equal(held.ownKey, false);
  assert.ok(hasRiderShadow(bare));
  assert.ok(bare.version > version, 'a program change is flagged');
  assert.notEqual(bare.customProgramCacheKey(), ordinaryKey, 'a held material never shares the ordinary program');
  assert.ok(bare.customProgramCacheKey().endsWith(`|${ULTRA_RIDER_SHADOW_KEY}`));
  const heldVersion = bare.version;
  releaseRiderShadow(bare, held);
  assert.equal(Object.prototype.hasOwnProperty.call(bare, 'onBeforeCompile'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(bare, 'customProgramCacheKey'), false);
  assert.equal(bare.customProgramCacheKey(), ordinaryKey, 'the ordinary program key, exactly');
  assert.equal(hasRiderShadow(bare), false);
  assert.ok(bare.version > heldVersion, 'and a program change back');

  const own = new THREE.MeshStandardMaterial();
  const order: string[] = [];
  const compile = (shader: { fragmentShader: string }): void => {
    order.push('authored');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n// authored');
  };
  const key = (): string => 'rider-atlas-v2';
  own.onBeforeCompile = compile;
  own.customProgramCacheKey = key;
  const ownHeld = holdRiderShadow(own);
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  own.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
  assert.deepEqual(order, ['authored'], 'the authored hook runs, once, first');
  assert.ok(shader.fragmentShader.includes('// authored'));
  assert.ok(shader.fragmentShader.includes('float ultraNearEdgeShadow('));
  assert.equal(own.customProgramCacheKey(), `rider-atlas-v2|${ULTRA_RIDER_SHADOW_KEY}`);
  releaseRiderShadow(own, ownHeld);
  assert.equal(own.onBeforeCompile, compile);
  assert.equal(own.customProgramCacheKey, key);
});

// ---------------------------------------------------------------------------
// A28, Trade 1: the rider's light in static shade
// ---------------------------------------------------------------------------

function heldShader(light?: RiderLightUniforms): { shader: THREE.WebGLProgramParametersWithUniforms; material: THREE.MeshStandardMaterial } {
  const material = new THREE.MeshStandardMaterial();
  holdRiderShadow(material, light);
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
  return { shader, material };
}

/** An Ultra world whose far map is built (the runtime's shared uniforms after `updateUltraShared`). */
function worldWithFar(): { world: ReturnType<typeof createUltraShared>; map: THREE.DepthTexture } {
  const world = createUltraShared();
  const map = new THREE.DepthTexture(4, 4);
  world.uniforms.ultraFarMap.value = map;
  world.uniforms.ultraFarEnabled.value = 1;
  world.uniforms.ultraFarEdge.value = 0.01;
  return { world, map };
}

/** A light whose far map exists: what a held rider reads on `ultra-full`. */
function farLight(): RiderLightUniforms {
  const { world } = worldWithFar();
  return riderLightUniforms(() => world);
}

test('A28: the rider light\'s anchors are in the pinned three source, once each', () => {
  const physical = source('ShaderLib/meshphysical.glsl.js');
  const [vertex, fragment] = physical.split('export const fragment');
  assert.equal(count(vertex, RIDER_LIGHT_ANCHORS.common), 1);
  assert.equal(count(vertex, RIDER_LIGHT_ANCHORS.worldpos), 1);
  assert.equal(count(fragment, RIDER_LIGHT_ANCHORS.common), 1);
  assert.equal(count(fragment, RIDER_LIGHT_ANCHORS.lightsMaps), 1);
  // The environment's irradiance is complete after lights_fragment_maps and spent in lights_fragment_end.
  assert.ok(source('ShaderChunk/lights_fragment_maps.glsl.js').includes('iblIrradiance += getIBLIrradiance( geometryNormal );'));
  assert.ok(source('ShaderChunk/lights_fragment_end.glsl.js').includes('RE_IndirectSpecular( radiance, iblIrradiance,'));
  assert.ok(fragment.indexOf(RIDER_LIGHT_ANCHORS.lightsMaps) < fragment.indexOf('#include <lights_fragment_end>'));
  assert.ok(THREE.ShaderLib.standard.vertexShader.includes(RIDER_LIGHT_ANCHORS.worldpos));
});

test('A28: the held rider program weighs only the environment\'s irradiance toward the sky, and only in static shade', () => {
  const { shader } = heldShader(farLight());
  const vertex = shader.vertexShader;
  const fragment = shader.fragmentShader;
  // F-A1: the program that carries the light says so in both stages.
  assert.equal(count(vertex, '#define ULTRA_RIDER_FAR'), 1);
  assert.equal(count(fragment, '#define ULTRA_RIDER_FAR'), 1);
  // The world position is written after three's, from the same transformed point.
  assert.equal(count(vertex, 'varying vec3 vUltraRiderWorld;'), 1);
  assert.ok(vertex.indexOf('vUltraRiderWorld = ( modelMatrix * ultraRiderWorld ).xyz;') > vertex.indexOf(RIDER_LIGHT_ANCHORS.worldpos));
  // Declared once; the lookup is the far map only (static casters: never a rider's own shadow).
  for (const line of ['uniform sampler2DShadow ultraRiderFarMap;', 'uniform mat4 ultraRiderFarMatrix;', 'uniform vec3 ultraRiderFar;',
    'varying vec3 vUltraRiderWorld;', 'float ultraRiderStaticShade() {']) {
    assert.equal(count(fragment, line), 1, `${line} not once`);
  }
  const lookup = fragment.slice(fragment.indexOf('float ultraRiderStaticShade() {'), fragment.indexOf('return ( 1.0 - ultraLit ) * ultraCover;'));
  assert.equal(count(lookup, 'textureLod( ultraRiderFarMap,'), 4, 'the far filter\'s four taps');
  assert.ok(lookup.includes('if ( ultraRiderFar.x < 0.5 ) return 0.0;'), 'no far map, no light');
  assert.ok(!lookup.includes('shadowMap') && !lookup.includes('directionalShadowMap'), 'the near map (the rider\'s own shadow) is not read');
  // The term: after the maps, before the sum; only iblIrradiance, scaled, gated by the static shade.
  const term = fragment.slice(fragment.indexOf('float ultraRiderShade = ultraRiderStaticShade();'));
  const termEnd = term.indexOf('#include <lights_fragment_end>');
  const body = term.slice(0, termEnd);
  assert.ok(fragment.indexOf('float ultraRiderShade = ultraRiderStaticShade();') > fragment.indexOf(RIDER_LIGHT_ANCHORS.lightsMaps));
  assert.ok(termEnd > 0, 'the term is not before lights_fragment_end');
  assert.ok(body.includes('if ( ultraRiderShade > 0.0 ) {'));
  for (const untouched of ['directDiffuse', 'directSpecular', 'diffuseColor', 'totalEmissiveRadiance', 'gl_FragColor', 'reflectedLight']) {
    assert.ok(!new RegExp(`\\b${untouched}\\b[\\w.]*\\s*[*+-]?=`).test(body), `the term writes ${untouched}`);
  }
  // Only two writes, both scales toward 1 at no shade: the fill, and the sheen off the ground below.
  assert.equal(body.split('iblIrradiance *= mix( 1.0, ').length - 1, 1, 'the term does not scale iblIrradiance once');
  assert.equal(body.split('radiance *= mix( 1.0, ').length - 1, 2, 'the sheen is not scaled once (and the fill once)');
  assert.ok(!/radiance\s*[+-]?=/.test(body.replace(/radiance \*= /g, '')), 'radiance is written other than scaled');
  assert.ok(body.includes('reflect( - geometryViewDir, geometryNormal )'), 'the sheen is not weighed by its reflection');
  // The shipped weights: a key from above no darker than the body, the body and sheen kept in (0, 1].
  const light = ULTRA.rider.shadeLight;
  assert.ok(light.bodyKeep > 0 && light.bodyKeep <= 1 && light.skyGain >= 1 && light.skyGain <= 5);
  assert.ok(light.sheenKeep > 0 && light.sheenKeep <= 1);
  assert.ok(light.keyUp[0] < light.keyUp[1] && light.keyUp[0] >= -1 && light.keyUp[1] <= 1);
  assert.ok(light.sheenSky[0] < light.sheenSky[1] && light.sheenSky[0] >= -1 && light.sheenSky[1] <= 1);
  // No non-ASCII in either stage.
  for (const text of [vertex, fragment]) assert.ok(!/[^\x00-\x7f]/.test(text), 'non-ASCII in a shader');
});

test('A28: the light uniforms read the current world, never a swapped-out one; with none, the light is off', () => {
  let current: { uniforms: Record<string, THREE.IUniform> } | null = null;
  const light = riderLightUniforms(() => current);
  const { shader } = heldShader(light);
  // The program's uniforms are the runtime's objects, by reference.
  assert.equal(shader.uniforms.ultraRiderFarMap, light.ultraRiderFarMap);
  assert.equal(shader.uniforms.ultraRiderFarMatrix, light.ultraRiderFarMatrix);
  assert.equal(shader.uniforms.ultraRiderFar, light.ultraRiderFar);
  // No world: off.
  assert.equal(light.ultraRiderFarMap.value, null);
  assert.equal(light.ultraRiderFar.value.x, 0);
  assert.equal(riderLightHasFar(light), false);
  // A world with its far map: on, that map and matrix.
  const { world: worldA, map: mapA } = worldWithFar();
  (worldA.uniforms.ultraFarMatrix.value as THREE.Matrix4).makeScale(2, 3, 4);
  current = worldA;
  assert.equal(light.ultraRiderFarMap.value, mapA);
  assert.equal(riderLightHasFar(light), true);
  assert.equal(light.ultraRiderFarMatrix.value, worldA.uniforms.ultraFarMatrix.value);
  assert.deepEqual(light.ultraRiderFar.value.toArray(), [1, ULTRA.farShadow.pcfSpreadTexels, 0.01]);
  // A swap: the next read is the new world's, and a world whose far map is off is off.
  const worldB = createUltraShared();
  current = worldB;
  assert.equal(light.ultraRiderFarMap.value, null, 'a swapped-out far map is still read');
  assert.equal(light.ultraRiderFar.value.x, 0);
  assert.equal(riderLightHasFar(light), false);
  // A far map that is built but switched off is no far map either.
  const { world: worldC } = worldWithFar();
  worldC.uniforms.ultraFarEnabled.value = 0;
  current = worldC;
  assert.equal(riderLightHasFar(light), false);
  mapA.dispose();
});

test('F-A1: no held program declares a shadow sampler that could be bound null — the light is compiled, and keyed, only with a far map', () => {
  let current: { uniforms: Record<string, THREE.IUniform> } | null = null;
  const light = riderLightUniforms(() => current);
  // No far map (ultra-lit, `?ultrakit=-farShadow`, no world): the round-3
  // shadow program exactly — no sampler of ours, no varying, no define.
  const off = heldShader(light);
  const shadowOnly = patchRiderShadowFragment(THREE.ShaderLib.standard.fragmentShader);
  assert.equal(off.shader.fragmentShader, shadowOnly, 'without a far map the held fragment is the shadow patch alone');
  assert.equal(off.shader.vertexShader, THREE.ShaderLib.standard.vertexShader, 'and the vertex stage is three\'s');
  for (const text of [off.shader.vertexShader, off.shader.fragmentShader]) {
    assert.ok(!text.includes('ultraRiderFarMap'), 'a sampler three would bind null is declared');
    assert.ok(!text.includes('ULTRA_RIDER_FAR'));
    assert.ok(!text.includes('vUltraRiderWorld'));
  }
  // Every shadow sampler the held fragment declares is three's own (bound by its shadow pass).
  const samplers = [...off.shader.fragmentShader.matchAll(/uniform sampler2DShadow (\w+)/g)].map((match) => match[1]);
  assert.ok(samplers.every((name) => /^(directional|spot|point)ShadowMap/.test(name)), `samplers ${samplers.join(', ')}`);
  const offKey = off.material.customProgramCacheKey();
  assert.ok(offKey.endsWith(`|${ULTRA_RIDER_SHADOW_KEY}`) && !offKey.includes(ULTRA_RIDER_FAR_KEY), offKey);
  assert.ok(hasRiderShadow(off.material));
  // A hold without a runtime compiles the same as a runtime with no far map.
  const bare = heldShader();
  assert.equal(bare.shader.fragmentShader, off.shader.fragmentShader);
  assert.equal(bare.shader.vertexShader, off.shader.vertexShader);
  // The uniforms are handed over either way (three uploads only what a program declares).
  assert.equal(off.shader.uniforms.ultraRiderFarMap, light.ultraRiderFarMap);

  // With a far map: the light, its sampler once, and the far key — the key
  // and the text are read in the same compile, so they cannot disagree.
  const { world, map } = worldWithFar();
  current = world;
  const on = heldShader(light);
  assert.equal(count(on.shader.fragmentShader, 'uniform sampler2DShadow ultraRiderFarMap;'), 1);
  assert.equal(count(on.shader.fragmentShader, '#define ULTRA_RIDER_FAR'), 1);
  const onKey = on.material.customProgramCacheKey();
  assert.ok(onKey.endsWith(`|${ULTRA_RIDER_FAR_KEY}|${ULTRA_RIDER_SHADOW_KEY}`), onKey);
  assert.ok(hasRiderShadow(on.material));
  // The two variants differ in the far key alone (the authored part is the same hook).
  assert.equal(onKey, `${offKey.slice(0, -(ULTRA_RIDER_SHADOW_KEY.length + 1))}|${ULTRA_RIDER_FAR_KEY}|${ULTRA_RIDER_SHADOW_KEY}`);
  // The same held material's key follows the far map (three reads it at every program change).
  current = null;
  assert.ok(!on.material.customProgramCacheKey().includes(ULTRA_RIDER_FAR_KEY));
  current = world;
  assert.ok(on.material.customProgramCacheKey().includes(ULTRA_RIDER_FAR_KEY));
  map.dispose();
});

test('F-A1: the frame hook re-keys the held set when the far map comes or goes, and only then', () => {
  let current: { uniforms: Record<string, THREE.IUniform> } | null = null;
  const light = riderLightUniforms(() => current);
  const materials = new Set<THREE.Material>([new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]);
  const disposed: THREE.Material[] = [];
  materials.forEach((material) => {
    holdRiderShadow(material, light);
    material.addEventListener('dispose', () => { disposed.push(material); });
  });
  const { world, map } = worldWithFar();
  // A hold's first frame: nothing compiled yet, nothing released; keyed for what exists.
  current = world;
  let keyed = rekeyRiderLight(materials, light, null);
  assert.equal(keyed, true);
  assert.equal(disposed.length, 0);
  // Steady frames with the far map: nothing released.
  for (let frame = 0; frame < 3; frame += 1) keyed = rekeyRiderLight(materials, light, keyed);
  assert.equal(disposed.length, 0);
  // The far map goes (a world swap onto a rung without one): every held
  // program is released before the frame draws, once.
  current = createUltraShared();
  keyed = rekeyRiderLight(materials, light, keyed);
  assert.equal(keyed, false);
  assert.deepEqual(disposed, [...materials]);
  keyed = rekeyRiderLight(materials, light, keyed);
  assert.equal(disposed.length, 2, 'released again with nothing changed');
  // And comes back: released again, once.
  current = world;
  keyed = rekeyRiderLight(materials, light, keyed);
  assert.equal(keyed, true);
  assert.equal(disposed.length, 4);
  // A held material is still held after a release (only its programs went).
  materials.forEach((material) => assert.ok(hasRiderShadow(material)));
  // The first frame of a new hold never releases, whatever it finds.
  current = null;
  assert.equal(rekeyRiderLight(materials, light, null), false);
  assert.equal(disposed.length, 4);
  map.dispose();
});

test('A28: a shader without the anchors is left alone, and ShaderChunk is still only read', () => {
  const before = { ...THREE.ShaderChunk };
  const plain = 'void main() { gl_FragColor = vec4( 1.0 ); }';
  assert.equal(patchRiderLightFragment(plain), plain);
  assert.equal(patchRiderLightVertex(plain), plain);
  heldShader(riderLightUniforms(() => null));
  assert.deepEqual({ ...THREE.ShaderChunk }, before);
});
