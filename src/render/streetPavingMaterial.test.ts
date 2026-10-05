/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { materialAppearance } from '../data/surfaces.ts';
import { assertStreetPavingLocal, createStreetPavingMaterial, installStreetPavingPattern,
  STREET_PAVING_ATTRIBUTE, STREET_PAVING_PATTERN, STREET_PAVING_SHADER_ANCHORS,
  streetPavingShade } from './streetPavingMaterial.ts';

function shader() {
  return { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
}

const compile = (material: THREE.Material, source: ReturnType<typeof shader>): void =>
  material.onBeforeCompile(source as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);

test('paving patches the pinned three 0.185.1 anchors, chains prior hooks and keeps all native light/shadow chunks', () => {
  const root = join(import.meta.dirname, '..', '..', 'node_modules', 'three');
  const physical = readFileSync(join(root, 'src', 'renderers', 'shaders', 'ShaderLib', 'meshphysical.glsl.js'), 'utf8');
  const split = physical.indexOf('export const fragment');
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '0.185.1');
  for (const [stage, anchors] of Object.entries(STREET_PAVING_SHADER_ANCHORS)) {
    const file = stage === 'vertex' ? physical.slice(0, split) : physical.slice(split);
    const live = stage === 'vertex' ? THREE.ShaderLib.standard.vertexShader : THREE.ShaderLib.standard.fragmentShader;
    for (const anchor of anchors) {
      assert.equal(file.split(anchor).length - 1, 1, `${stage}: file anchor ${anchor}`);
      assert.equal(live.split(anchor).length - 1, 1, `${stage}: live anchor ${anchor}`);
    }
  }
  const globalBefore = JSON.stringify({ chunks: THREE.ShaderChunk, lib: THREE.ShaderLib });
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = source => { source.vertexShader += '\n// prior-vertex'; source.fragmentShader += '\n// prior-fragment'; };
  material.customProgramCacheKey = () => 'prior-program';
  installStreetPavingPattern(material);
  const key = material.customProgramCacheKey();
  assert.ok(key.startsWith('prior-program/street-paving-metres-v2/'));
  assert.equal(installStreetPavingPattern(material), material, 'installation is idempotent');
  assert.equal(material.customProgramCacheKey(), key);
  const source = shader();
  compile(material, source);
  assert.ok(source.vertexShader.includes('// prior-vertex'));
  assert.ok(source.fragmentShader.includes('// prior-fragment'));
  assert.equal(source.vertexShader.split(`attribute vec2 ${STREET_PAVING_ATTRIBUTE};`).length - 1, 1);
  assert.ok(source.vertexShader.includes(`vStreetPavingLocal = ${STREET_PAVING_ATTRIBUTE};`));
  assert.ok(source.fragmentShader.includes('fwidth(vStreetPavingLocal)'));
  assert.ok(source.fragmentShader.includes('diffuseColor.rgb *='));
  assert.ok(source.fragmentShader.includes('mix(pedestrianPavingShade, 0.940000,'));
  assert.ok(source.vertexShader.includes('vStreetPavingService = streetPavingService;'));
  for (const anchor of ['#include <shadowmap_pars_fragment>', '#include <lights_fragment_begin>',
    '#include <roughnessmap_fragment>', '#include <tonemapping_fragment>']) assert.ok(source.fragmentShader.includes(anchor));
  assert.deepEqual(source.fragmentShader.match(/uniform sampler\w+/g),
    THREE.ShaderLib.standard.fragmentShader.match(/uniform sampler\w+/g), 'the patch adds no sampler');
  assert.deepEqual(source.uniforms, {});
  assert.equal(JSON.stringify({ chunks: THREE.ShaderChunk, lib: THREE.ShaderLib }), globalBefore);
  material.dispose();
});

test('stone material stays medium gray, opaque, texture-free and root-owned', () => {
  const material = createStreetPavingMaterial(), stone = materialAppearance('stone');
  assert.equal(material.color.getHex(), stone.albedo);
  assert.equal(material.roughness, stone.roughness);
  assert.equal(material.metalness, stone.metalness);
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 1);
  assert.equal(material.map, null);
  assert.equal(material.normalMap, null);
  assert.equal(material.bumpMap, null);
  assert.equal(material.displacementMap, null);
  assert.ok(material.polygonOffset && material.polygonOffsetFactor < 0);
  let disposals = 0;
  material.addEventListener('dispose', () => disposals++);
  material.dispose();
  assert.equal(disposals, 1);
});

test('running bond has human tile dimensions and ten-millimetre subdued grout, without checker alternation', () => {
  const p = STREET_PAVING_PATTERN;
  assert.equal(p.tileWidth, 0.6);
  assert.equal(p.tileDepth, 0.4);
  assert.equal(p.groutWidth, 0.01);
  // Even/odd courses shift their vertical seam by half a tile.
  assert.ok(streetPavingShade(0, 0.20) < 0.86);
  assert.ok(streetPavingShade(0, 0.60) > 0.97);
  assert.ok(streetPavingShade(0.30, 0.20) > 0.97);
  assert.ok(streetPavingShade(0.30, 0.60) < 0.86);
  assert.ok(streetPavingShade(0.006, 0.20) > 0.97, 'a point beyond the five-millimetre half-joint is tile');
  const samples: number[] = [];
  for (let row = -5; row <= 5; row++) for (let column = -8; column <= 8; column++) {
    const offset = (row - Math.floor(row / 2) * 2) * p.tileWidth / 2;
    const x = (column + 0.5) * p.tileWidth - offset, y = (row + 0.5) * p.tileDepth;
    const shade = streetPavingShade(x, y);
    assert.ok(shade >= 1 - p.tileVariation - 1e-9 && shade <= 1 + p.tileVariation + 1e-9);
    assert.equal(shade, streetPavingShade(x, y), 'the pattern is deterministic');
    samples.push(shade);
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.015, 'tile variation is present but gentle');
  assert.ok(Math.max(...samples) - Math.min(...samples) <= 0.05 + 1e-9, 'no dark alternating checker');
});

test('derivative integration suppresses subpixel dark joints and fades detail to uniform stone at distance', () => {
  const close = streetPavingShade(0, 0.20, 0.001, 0.001);
  const distant = streetPavingShade(0, 0.20, 0.10, 0.10);
  assert.ok(close < 0.86);
  assert.ok(distant > 0.95 && distant <= 1.025, 'a narrow joint keeps its area instead of becoming a wide dark stripe');
  for (const point of [[0, 0], [0.3, 0.6], [1.13, -0.21]]) {
    assert.equal(streetPavingShade(point[0], point[1], 0.36, 0.36), 1);
  }
  assert.throws(() => streetPavingShade(Number.NaN, 0), /finite/);
  assert.throws(() => streetPavingShade(0, 0, -0.1, 0), /finite/);
});

test('missing shader anchors and missing/malformed local coordinates fail visibly before drawing', () => {
  const material = createStreetPavingMaterial(), source = shader();
  source.vertexShader = source.vertexShader.replace('#include <begin_vertex>', '');
  assert.throws(() => compile(material, source), /expected one/);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  assert.throws(() => assertStreetPavingLocal(geometry), /vec2/);
  geometry.setAttribute(STREET_PAVING_ATTRIBUTE, new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3));
  assert.throws(() => assertStreetPavingLocal(geometry), /vec2/);
  geometry.setAttribute(STREET_PAVING_ATTRIBUTE, new THREE.Float32BufferAttribute([0, 0, 1, 0], 2));
  assert.throws(() => assertStreetPavingLocal(geometry), /vec2/);
  geometry.setAttribute('streetPavingService', new THREE.BufferAttribute(new Uint8Array([0, 0, 1]), 1));
  geometry.setAttribute('streetPavingFrame', new THREE.Float32BufferAttribute([10, 0, 9, 10, 0, 9, 10, 0, 9], 3));
  geometry.setAttribute(STREET_PAVING_ATTRIBUTE, new THREE.Float32BufferAttribute([0, 0, 1, 0, Number.NaN, 1], 2));
  assert.throws(() => assertStreetPavingLocal(geometry), /non-finite/);
  geometry.setAttribute(STREET_PAVING_ATTRIBUTE, new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  assert.doesNotThrow(() => assertStreetPavingLocal(geometry));
  geometry.deleteAttribute('streetPavingFrame');
  assert.throws(() => assertStreetPavingLocal(geometry), /streetPavingFrame/);
  geometry.setAttribute('streetPavingFrame', new THREE.Float32BufferAttribute([10, 0, 9, 10, 0, 9, 10, 0, 9], 3));
  geometry.getAttribute('streetPavingService').setX(0, 2);
  assert.throws(() => assertStreetPavingLocal(geometry), /invalid streetPavingService/);
  geometry.deleteAttribute('streetPavingService');
  assert.throws(() => assertStreetPavingLocal(geometry), /service flag/);
  geometry.dispose(); material.dispose();
});
