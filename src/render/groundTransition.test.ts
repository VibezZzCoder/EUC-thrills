/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { createGroundTransitions, paintGroundTransitions } from './groundTransition.ts';
import { createSharedGroundSurface } from './sharedGroundSurface.ts';

function fixture(): LevelPlan {
  return { id: 'transition-fixture', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 4, rows: 3,
      heights: Array(12).fill(0), surfaces: ['grass','dirt','pavement','grass','gravel','pavement'] } };
}

test('neighbour ids retain exact source boundaries and exclude precise/hazard cells', () => {
  const plan = fixture(), original = JSON.stringify(plan);
  const pixels = paintGroundTransitions(plan);
  assert.equal(pixels[0], 32, 'outside left=0, real dirt right=2');
  assert.equal(pixels[4], 65, 'grass left=1, pavement right=4');
  assert.equal(pixels[5], 48, 'outside near=0, gravel far=3');
  assert.equal(pixels[6], 2, 'own source material remains dirt');
  assert.equal(JSON.stringify(plan), original);
  assert.deepEqual(pixels, paintGroundTransitions(plan));
  const protectedPlan: LevelPlan = { ...plan, groundSurfacePatches: [{ id:'precise', surface:'pavement',
    triangles:[{ cell:1, vertices:[{x:1,y:0,z:0},{x:2,y:0,z:0},{x:1,y:0,z:1}] }] }] };
  const protectedPixels = paintGroundTransitions(protectedPlan);
  assert.deepEqual(Array.from(protectedPixels.slice(4,8)), [0,0,0,0]);
  assert.equal(protectedPixels[0], 0, 'the neighbouring grass also cannot borrow protected dirt');
  const hazardous = paintGroundTransitions({ ...plan, hazards: [{ id:'hole', kind:'potholeShallow',
    centre:{x:1.5,y:0,z:0.5}, radius:0.2 }] });
  assert.deepEqual(Array.from(hazardous.slice(4,8)), [0,0,0,0]);
});

test('shared ground retires source-cell tinting while the historical diagnostic owner still disposes once', () => {
  const plan = fixture(), owner = createSharedGroundSurface(1, plan);
  const shader = () => ({ vertexShader:THREE.ShaderLib.standard.vertexShader,
    fragmentShader:THREE.ShaderLib.standard.fragmentShader, uniforms:{} } as THREE.WebGLProgramParametersWithUniforms);
  for (const edge of ['none','ultra'] as const) {
    const material = new THREE.MeshStandardMaterial(); owner.install(material,'grass',edge,true);
    const compiled = shader(); material.onBeforeCompile(compiled, {} as THREE.WebGLRenderer);
    assert.equal(compiled.uniforms.sharedGroundNeighbours, undefined);
    assert.doesNotMatch(compiled.fragmentShader,/transitionGrid|transitionWeight/);
    material.dispose();
  }
  assert.equal(owner.report().transitionBytes,0); owner.dispose(); owner.dispose();
  const direct=createGroundTransitions(plan), map=direct.texture;
  assert.equal(direct.bytes,24); assert.equal(map.image.width,3); assert.equal(map.image.height,2);
  assert.equal(map.generateMipmaps,false); assert.equal(map.minFilter,THREE.NearestFilter);
  let freed=0; map.addEventListener('dispose',()=>freed++);
  direct.dispose(); direct.dispose(); assert.equal(freed,1);
});
