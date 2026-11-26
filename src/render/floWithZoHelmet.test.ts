/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { configureFloPewter, configureFloSmoke } from './floWithZoHelmet.ts';
import { holdRiderShadow, releaseRiderShadow } from './ultra/ultraRiderShadow.ts';

function source(): Parameters<THREE.Material['onBeforeCompile']>[0] {
  return {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as Parameters<THREE.Material['onBeforeCompile']>[0];
}

test('Flo’s metal response composes with Ultra and restores the authored shader', () => {
  for (const configure of [configureFloPewter, configureFloSmoke]) {
    const material = new THREE.MeshStandardMaterial();
    let chained = 0;
    material.onBeforeCompile = (shader): void => { chained += 1; shader.fragmentShader += '\n// authored-before-Flo'; };
    material.customProgramCacheKey = (): string => 'authored-before-Flo';
    configure(material);
    const authoredCompile = material.onBeforeCompile, authoredKey = material.customProgramCacheKey();
    const ordinary = source();
    material.onBeforeCompile(ordinary, {} as THREE.WebGLRenderer);
    assert.equal(chained, 1);
    assert.ok(ordinary.fragmentShader.includes('// authored-before-Flo'));
    assert.ok(ordinary.fragmentShader.includes('reflect(-geometryViewDir, normal)'));
    assert.ok(ordinary.fragmentShader.includes('#ifndef USE_ENVMAP'), 'Ultra would receive a second environment');
    assert.ok(ordinary.fragmentShader.includes('#include <tonemapping_fragment>'));
    assert.ok(ordinary.fragmentShader.includes('#include <colorspace_fragment>'));
    assert.ok(ordinary.fragmentShader.includes('#include <shadowmap_pars_fragment>'));
    const held = holdRiderShadow(material);
    const ultra = source();
    material.onBeforeCompile(ultra, {} as THREE.WebGLRenderer);
    assert.equal(chained, 2, 'Ultra dropped the authored/Flo hook chain');
    assert.ok(ultra.fragmentShader.includes('floRadiance'));
    assert.ok(material.customProgramCacheKey().startsWith(authoredKey));
    releaseRiderShadow(material, held);
    assert.equal(material.onBeforeCompile, authoredCompile);
    assert.equal(material.customProgramCacheKey(), authoredKey);
    material.dispose();
  }
});

test('pewter and smoked silver have stable distinct programs without per-pose state', () => {
  const pewter = new THREE.MeshStandardMaterial(), smoke = new THREE.MeshStandardMaterial();
  configureFloPewter(pewter); configureFloSmoke(smoke);
  assert.notEqual(pewter.customProgramCacheKey(), smoke.customProgramCacheKey());
  const key = smoke.customProgramCacheKey();
  for (let i = 0; i < 4; i += 1) {
    const shader = source();
    smoke.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    assert.deepEqual(shader.uniforms, {}, 'the response allocates a runtime resource');
    assert.equal(smoke.customProgramCacheKey(), key);
  }
  pewter.dispose(); smoke.dispose();
});
