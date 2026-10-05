/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { inStreetFacadeOpening, installStreetFacadeOpenings } from './streetFacadeOpenings.ts';

test('a combined facade hook carries independent family heights without duplicate declarations or new samplers', () => {
  const openings = [
    { position: { x: 2, y: 0, z: 3 }, yaw: 0, faceWidth: 12, height: 4.3, depth: 1.2 },
    { position: { x: 30, y: 1, z: 20 }, yaw: 0.71, faceWidth: 18, height: 3.2 },
  ];
  const material = new THREE.MeshStandardMaterial();
  let chained = 0;
  material.onBeforeCompile = () => { chained++; };
  material.customProgramCacheKey = () => 'original-builder';
  installStreetFacadeOpenings(material, openings);
  const shader = {
    uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.equal(chained, 1);
  assert.equal(shader.fragmentShader.match(/varying vec3 vStreetWorld;/g)?.length, 1);
  assert.equal(shader.fragmentShader.match(/uniform float streetHeights\[2\];/g)?.length, 1);
  assert.deepEqual(shader.uniforms.streetHeights.value, [4.3, 3.2]);
  assert.deepEqual(shader.uniforms.streetDepths.value, [1.2, 0.8]);
  assert.equal(inStreetFacadeOpening(openings[0], { x: 2, y: 1, z: 1.9 }), true);
  assert.equal(inStreetFacadeOpening(openings[1], { x: 30 + Math.sin(0.71) * -1.1, y: 2,
    z: 20 + Math.cos(0.71) * -1.1 }), false);
  assert.deepEqual(shader.fragmentShader.match(/uniform sampler\w+/g),
    THREE.ShaderLib.standard.fragmentShader.match(/uniform sampler\w+/g));
  for (const opening of openings) {
    assert.equal(inStreetFacadeOpening(opening, { ...opening.position, y: opening.position.y + 3 }), true);
    assert.equal(inStreetFacadeOpening(opening, { ...opening.position, y: opening.position.y + opening.height }), false);
    assert.equal(inStreetFacadeOpening(opening, { ...opening.position, z: opening.position.z + 4 }), false);
  }
  assert.ok(material.customProgramCacheKey().startsWith('original-builder/'));
  material.dispose();
});
