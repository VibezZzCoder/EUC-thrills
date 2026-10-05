/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { SHARED_GROUND } from '../data/tuning.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { SURFACES, materialAppearance } from '../data/surfaces.ts';
import { createTerrain } from './terrain.ts';
import { createSharedGroundSurface, paintSharedGround } from './sharedGroundSurface.ts';
import { installOrdinaryGroundBoundary } from './ordinaryGroundBoundary.ts';
import { installUltraGroundPatch } from './ultra/ultraGroundDetail.ts';
import { SHARED_GROUND_KINDS } from './sharedGroundCodes.ts';

test('shared boundary shoulders are priced in metres and preserve paved edge definition', () => {
  const plan = createSliceLevel(), owner = createSharedGroundSurface(1, plan);
  for (const id of ['dirt','pavement'] as const) {
    const material = new THREE.MeshStandardMaterial(); installOrdinaryGroundBoundary(material, false);
    owner.install(material, id, 'ordinary', true);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const width = Math.min(SHARED_GROUND.shoulderMetres * (id === 'pavement' ? SHARED_GROUND.pavedShoulderShare : 1) / plan.heightfield.spacing, 0.45);
    assert.ok(shader.fragmentShader.includes(`max(fwidth(boundaryD), ${width.toFixed(8)})`));
    assert.ok(shader.fragmentShader.includes(`max(fwidth(vGroundBoundaryEdge.x), ${width.toFixed(8)})`));
    material.dispose();
  }
  owner.dispose();
});

test('code-painted material families are deterministic, bounded and distinct', () => {
  const hashes = new Set<string>();
  for (const kind of ['grass', 'dirt', 'gravel', 'pavement', 'roughPavement', 'wood', 'concrete'] as const) {
    const data = paintSharedGround(kind, 32);
    assert.deepEqual(data, paintSharedGround(kind, 32));
    assert.equal(data.length, 32 * 32 * 4);
    assert.ok(data.some((value, at) => at % 4 === 0 && value > 145));
    assert.ok(data.some((value, at) => at % 4 === 0 && value < 110));
    hashes.add(Buffer.from(data).toString('base64'));
  }
  assert.equal(hashes.size, 7);
});

test('shared shader cache distinguishes captured spacing without embedding world grids or palettes', () => {
  const keyOf = (plan: ReturnType<typeof createSliceLevel>) => {
    const field = plan.heightfield;
    plan.heightfield = { ...field, heights: Array(field.columns * field.rows).fill(0),
      surfaces: Array((field.columns - 1) * (field.rows - 1)).fill('grass') };
    const owner = createSharedGroundSurface(1, plan), material = new THREE.MeshStandardMaterial();
    owner.install(material, 'grass', 'none', true);
    const key = material.customProgramCacheKey();
    owner.dispose(); material.dispose(); return key;
  };
  const source = createSliceLevel(), original = keyOf(source);
  assert.equal(keyOf(structuredClone(source)), original, 'equal worlds reuse one shader');
  for (const [field, delta] of [['originX', 1], ['originZ', 1], ['columns', 1], ['rows', 1]] as const) {
    const plan = structuredClone(source); plan.heightfield[field] += delta;
    assert.equal(keyOf(plan), original, `${field} no longer embeds a source-cell repaint grid`);
  }
  const spacing = structuredClone(source); spacing.heightfield.spacing += 0.5;
  assert.notEqual(keyOf(spacing), original, 'shoulder width captures the grid spacing');
  const palette = structuredClone(source); palette.palette = { ...palette.palette, grass: 0x699f3c };
  assert.equal(keyOf(palette), original, 'material colour and fill attributes carry the palette without GLSL literals');
});

test('partial Ultra material-code decoder drift refuses compilation', () => {
  const owner = createSharedGroundSurface(), material = new THREE.MeshStandardMaterial();
  installUltraGroundPatch(material, {kind:3, edge:true, detail:null});
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('float ultraFillBits = vUltraFillKind - 16.0',
      'float ultraFillBits = vUltraFillKind + -16.0');
  };
  owner.install(material, 'dirt', 'ultra');
  const shader = {vertexShader:THREE.ShaderLib.standard.vertexShader,
    fragmentShader:THREE.ShaderLib.standard.fragmentShader, uniforms:{}} as THREE.WebGLProgramParametersWithUniforms;
  assert.throws(() => material.onBeforeCompile(shader, {} as THREE.WebGLRenderer), /decoder anchor changed/);
  owner.dispose(); material.dispose();
});

test('shared hooks preserve prior compiler, cache identity and bound sampler lifetime', () => {
  const owner = createSharedGroundSurface(4);
  const first = new THREE.MeshStandardMaterial(), second = new THREE.MeshStandardMaterial();
  let prior = 0; first.onBeforeCompile = () => { prior++; };
  owner.install(first, 'grass'); owner.install(second, 'grass');
  assert.equal(owner.report().textures, 1);
  const shader = () => ({ vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms);
  const a = shader(), b = shader();
  first.onBeforeCompile(a, {} as THREE.WebGLRenderer); second.onBeforeCompile(b, {} as THREE.WebGLRenderer);
  assert.equal(prior, 1);
  assert.match(a.fragmentShader, /sharedBrickCover/);
  assert.match(a.fragmentShader, /dFdx\(sharedHeight\)/);
  const texture = a.uniforms.sharedGroundMap.value as THREE.DataArrayTexture;
  assert.equal(texture, b.uniforms.sharedGroundMap.value);
  assert.equal(texture.isDataArrayTexture, true);
  assert.equal(texture.image.depth, SHARED_GROUND_KINDS.length);
  assert.equal(owner.report().textureLayers, SHARED_GROUND_KINDS.length);
  assert.equal(owner.report().bytes, SHARED_GROUND_KINDS.length * 349524);
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
  assert.equal(texture.generateMipmaps, true);
  assert.equal(texture.anisotropy, 4);
  let calls = 0; texture.addEventListener('dispose', () => calls++);
  owner.dispose(); owner.dispose(); assert.equal(calls, 1);
  assert.throws(() => owner.install(first, 'dirt'), /disposed/);
  first.dispose(); second.dispose();
});

test('shared paving has no map and replaces the coarse Ultra module', () => {
  const owner = createSharedGroundSurface();
  const material = new THREE.MeshStandardMaterial(); material.defines = { ULTRA_BRICK: '' };
  owner.install(material, 'brick', 'ultra');
  assert.equal(material.defines.ULTRA_BRICK, undefined);
  assert.equal(owner.report().textures, 0);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.match(shader.fragmentShader, /0\.42000000/);
  assert.match(shader.fragmentShader, /0\.21000000/);
  assert.match(shader.fragmentShader, /ultraFillKindOnly/);
  assert.doesNotMatch(shader.fragmentShader, /uniform sampler2D sharedGroundMap/);
  owner.dispose(); material.dispose();
});

test('shared terrain preserves physical triangles and makes grass tint continuous across cells', () => {
  const plan = createSliceLevel();
  const old = createTerrain(plan), current = createTerrain(plan, undefined, undefined,
    { ordinaryBoundary: true, sharedSurface: true });
  const before = old.group.getObjectByName('level-heightfield') as THREE.Mesh;
  const after = current.group.getObjectByName('level-heightfield') as THREE.Mesh;
  assert.deepEqual(after.geometry.getAttribute('position').array, before.geometry.getAttribute('position').array);
  assert.deepEqual(after.geometry.index!.array, before.geometry.index!.array);
  assert.deepEqual(after.geometry.groups, before.geometry.groups);
  // Ground positions/indices/groups above remain exact. Whole-view triangles
  // intentionally grow with the independently accounted shared vegetation.
  assert.equal(SHARED_GROUND.cellWeight, 0);
  const pos = after.geometry.getAttribute('position'), colour = after.geometry.getAttribute('color');
  const materials = after.material as THREE.MeshStandardMaterial[];
  const grass = new THREE.Color(plan.palette?.grass ?? materialAppearance('grass').albedo);
  const grassGroup = after.geometry.groups.find(group => materials[group.materialIndex!].color.equals(grass));
  // Resolve from actual material colour; fail if an incorrect palette masks the assertion.
  const grassAppearance = SURFACES.grass.material;
  assert.equal(grassAppearance, 'grass');
  assert.ok(grassGroup, 'actual grass group present');
  const seen = new Map<string, number[]>(); let matches = 0;
  for (let at = grassGroup.start; at < grassGroup.start + grassGroup.count; at++) {
    const vertex = after.geometry.index!.getX(at);
    const key = `${pos.getX(vertex)},${pos.getY(vertex)},${pos.getZ(vertex)}`;
    const rgb = [colour.getX(vertex), colour.getY(vertex), colour.getZ(vertex)];
    const previous = seen.get(key);
    if (previous) { assert.deepEqual(rgb, previous); matches++; } else seen.set(key, rgb);
  }
  assert.ok(matches > 100);
  assert.equal(current.sharedGround!.textures, 1);
  assert.equal(current.sharedGround!.transitionBytes, 0);
  assert.equal(current.sharedGround!.textureLayers, 7);
  assert.equal(current.textures - old.textures, current.sharedGround!.textures);
  assert.equal((current.sharedGround!.bytes - current.sharedGround!.transitionBytes) % 349524, 0);
  old.dispose(); current.dispose();
});


test('filled fragments decode actual material bits without corrupting edge flags, and every shared sampler is uploaded', () => {
  const plan = createSliceLevel();
  for (const edges of ['ordinary','ultra'] as const) {
    const owner = createSharedGroundSurface(1,plan), material = new THREE.MeshStandardMaterial();
    if (edges === 'ordinary') installOrdinaryGroundBoundary(material,false,true);
    else installUltraGroundPatch(material,{kind:3,edge:true,detail:null});
    owner.install(material,'dirt',edges,true);
    const shader = {vertexShader:THREE.ShaderLib.standard.vertexShader,
      fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}} as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
    assert.ok(shader.fragmentShader.includes(edges === 'ordinary'
      ? 'floor(vGroundBoundaryMode / 16.0)' : 'floor(vUltraFillKind / 32.0)'));
    assert.ok(shader.fragmentShader.includes(edges === 'ordinary'
      ? 'mod(vGroundBoundaryMode, 16.0)' : 'mod(vUltraFillKind,32.0) - 16.0'));
    assert.ok(shader.fragmentShader.includes('sharedFillSample = sharedDetailOf(sharedFillCode)'));
    assert.ok(shader.fragmentShader.includes('sharedSurfaceCover) * (1.0-sharedBrickCover)'));
    const declarations = [...shader.fragmentShader.matchAll(/uniform\s+(?:highp\s+)?(sampler\w*)\s+(shared\w*)\s*;/g)];
    assert.equal(declarations.length,1,'one array sampler, independent of fill material count');
    for (const [,type,name] of declarations) {
      const value = shader.uniforms[name]?.value;
      assert.ok(value instanceof THREE.Texture && value.version>0,`${name} always owns an uploaded texture`);
      if (type === 'sampler2DArray') assert.equal((value as THREE.DataArrayTexture).isDataArrayTexture,true);
    }
    owner.dispose();material.dispose();
  }
});
