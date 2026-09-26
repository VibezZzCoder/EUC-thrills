/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import { materialAppearance, type MaterialId } from '../../data/surfaces.ts';
import type { PartId } from '../props.ts';
import { emptyFarShadowMap, UltraFarShadow } from './ultraFarShadow.ts';
import { defaultUltraLive, shadowRigFor, writeShadowRig } from './ultraLighting.ts';
import {
  createUltraShared,
  patchUltraDepthVertex,
  patchUltraFragment,
  patchUltraVertex,
  tuneUltraShared,
  ULTRA_ATTRIBUTES,
  ULTRA_PATCH_ANCHOR_SITES,
  ULTRA_PATCH_ANCHORS,
  ultraBlockMaterial,
  ultraDiskTaps,
  ultraGroundMaterial,
  ultraGroundShadowFetches,
  ultraHazardGroundMaterial,
  ultraMarkingMaterial,
  ultraNearFilterGlsl,
  ultraProgramKey,
  ultraPropFamily,
  ultraPropMaterial,
  ultraReliefDepthMaterial,
  ultraWaterMaterial,
  updateUltraShared,
} from './ultraMaterials.ts';
import { applyKitOverride, ULTRA_FULL, ULTRA_LIT } from './ultraRecipe.ts';
import type { UltraBuildContext, UltraFacadeMaps, UltraKitOverride, UltraRecipe, UltraShared } from './ultraTypes.ts';
import { holdRiderShadow, riderLightUniforms } from './ultraRiderShadow.ts';
import { createUltraGroundDetail, groundScreenKernelCompiled, ULTRA_GROUND_SCREEN_KERNEL } from './ultraGroundDetail.ts';

/** One view's ground detail maps, so the ground's detail path is linted too (pre-R1 ground pass). */
const GROUND_DETAIL = createUltraGroundDetail(1);

/**
 * The Ultra patch library — M39 W4 (`docs/M39_ULTRA.md` §3.3, §6.3 W4).
 *
 * The browser is the only place a shader really compiles, and this package
 * may not run it (Pace; the integrator boots it in Wave 2). So this file does
 * the strongest checking node can do, in three layers:
 *
 * 1. **The anchors are pinned** to the three 0.185.1 source *files* in
 *    `node_modules` — not only to the live `THREE.ShaderChunk` — so an
 *    upgrade that moves one fails here, by name, rather than as a black
 *    frame.
 * 2. **Nothing global moves**: `THREE.ShaderChunk` and `THREE.ShaderLib` are
 *    deep-equal before and after every material is built and every
 *    `onBeforeCompile` has run (invariant 2).
 * 3. **The patched programs are linted as the GPU would see them**: includes
 *    resolved the way three resolves them, the preprocessor run with the
 *    defines each variant really gets, and then every `ultra*` identifier the
 *    active code uses must be declared in it, exactly once at global scope,
 *    braces must balance, and every Ultra varying the fragment reads must be
 *    written by the vertex stage. That is the class of mistake a string
 *    patch makes — a define guarding a declaration but not its use, a typo,
 *    a helper used before the chunk that declares it — and it is caught
 *    here in milliseconds.
 */

const THREE_ROOT = join(import.meta.dirname, '..', '..', '..', 'node_modules', 'three');
const SHADERS = join(THREE_ROOT, 'src', 'renderers', 'shaders');

function pinnedText(source: string): string {
  if (source === 'meshphysical.vertex' || source === 'meshphysical.fragment') {
    const text = readFileSync(join(SHADERS, 'ShaderLib', 'meshphysical.glsl.js'), 'utf8');
    const split = text.indexOf('export const fragment');
    return source === 'meshphysical.vertex' ? text.slice(0, split) : text.slice(split);
  }
  if (source === 'depth.vertex') {
    const text = readFileSync(join(SHADERS, 'ShaderLib', 'depth.glsl.js'), 'utf8');
    return text.slice(0, text.indexOf('export const fragment'));
  }
  return readFileSync(join(SHADERS, 'ShaderChunk', `${source}.glsl.js`), 'utf8');
}

function liveText(source: string): string {
  if (source === 'meshphysical.vertex') return THREE.ShaderLib.standard.vertexShader;
  if (source === 'meshphysical.fragment') return THREE.ShaderLib.standard.fragmentShader;
  if (source === 'depth.vertex') return THREE.ShaderLib.depth.vertexShader;
  return (THREE.ShaderChunk as Record<string, string>)[source];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function contextFor(recipe: UltraRecipe = ULTRA_FULL, override: UltraKitOverride | null = null): UltraBuildContext {
  return { recipe: applyKitOverride(recipe, override), shared: createUltraShared(), maxAnisotropy: 1 };
}

/**
 * A29: the material as A28's Trade 2 built it — the ground filter with its
 * screen kernel, the far-caster disk and the lift's lean diagonals. No shipped
 * material carries the define (`ULTRA.nearFilter.groundScreenKernel` is
 * false), so the kernel's own tests put it on the materials they build.
 */
function withScreenKernel<T extends THREE.Material>(material: T): T {
  material.defines = { ...(material.defines ?? {}), [ULTRA_GROUND_SCREEN_KERNEL]: '' };
  return material;
}

/** A stand-in for W6's facade maps: the shapes the factory reads, no painting. */
function fakeMaps(): UltraFacadeMaps {
  const make = (name: string): THREE.DataTexture => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    texture.name = name;
    return texture;
  };
  const albedo = make('albedo');
  const normal = make('normal');
  const orm = make('orm');
  return { albedo, normal, orm, bytes: 12, dispose: () => undefined };
}

const PARTS: readonly PartId[] = [
  'trunk', 'crown', 'coniferFoliage', 'shrub', 'lampPost', 'lampHead', 'benchWood', 'benchMetal',
  'litterBin', 'bollardCap', 'signPost', 'signPlate', 'fenceBay', 'buildingBody', 'buildingLow',
  'buildingTall', 'buildingCap', 'tyreStack', 'gantrySpan', 'roofGable',
];
const GROUND: readonly (MaterialId | 'field')[] = [
  'pavement', 'roughPavement', 'brick', 'grass', 'gravel', 'dirt', 'wood', 'spill', 'field',
];
const BLOCKS: readonly MaterialId[] = ['concrete', 'stone', 'metal', 'wood', 'signalRed'];

/** A stand-in for three's `WebGLProgramParametersWithUniforms`, from the real ShaderLib text. */
interface FakeShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
}

function compile(material: THREE.Material): FakeShader {
  const lib = material instanceof THREE.MeshDepthMaterial ? THREE.ShaderLib.depth : THREE.ShaderLib.standard;
  const shader: FakeShader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

/** Every Ultra material the library makes, across the rungs and the kit switches. */
function everyMaterial(): { label: string; material: THREE.Material; instanced: boolean }[] {
  const out: { label: string; material: THREE.Material; instanced: boolean }[] = [];
  const contexts: [string, UltraBuildContext][] = [
    ['full', contextFor(ULTRA_FULL)],
    ['lit', contextFor(ULTRA_LIT)],
    ['full-lighting', contextFor(ULTRA_FULL, { lighting: false })],
    ['full-edgeFill', contextFor(ULTRA_FULL, { edgeFill: false })],
    ['full-ground', contextFor(ULTRA_FULL, { ground: false, blocks: false, buildings: false })],
  ];
  for (const [name, context] of contexts) {
    for (const part of PARTS) {
      const atlas = part === 'buildingBody' || part === 'buildingLow' || part === 'buildingTall';
      const map = atlas ? new THREE.DataTexture(new Uint8Array(4), 1, 1) : null;
      out.push({
        label: `${name}/${part}`,
        material: ultraPropMaterial(part, { roughness: 0.9, metalness: part === 'lampPost' ? 0.6 : 0, map }, context, atlas ? fakeMaps() : null),
        instanced: true,
      });
      if (atlas) {
        out.push({
          label: `${name}/${part}/no-maps`,
          material: ultraPropMaterial(part, { roughness: 0.9, metalness: 0, map }, context, null),
          instanced: true,
        });
      }
    }
    for (const surface of GROUND) {
      const appearance = materialAppearance(surface === 'field' ? 'grass' : surface);
      out.push({ label: `${name}/ground/${surface}`, material: ultraGroundMaterial(appearance, surface, context), instanced: false });
      out.push({ label: `${name}/ground-detail/${surface}`, material: ultraGroundMaterial(appearance, surface, context, GROUND_DETAIL), instanced: false });
    }
    for (const id of BLOCKS) {
      out.push({ label: `${name}/block/${id}`, material: ultraBlockMaterial(materialAppearance(id), id, context), instanced: false });
    }
    out.push({ label: `${name}/water`, material: ultraWaterMaterial({ color: 0xffffff, roughness: 0.1, vertexColors: true }, context), instanced: false });
    out.push({ label: `${name}/marking`, material: ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context), instanced: false });
    out.push({ label: `${name}/hazard`, material: ultraHazardGroundMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true }, context), instanced: false });
    out.push({ label: `${name}/relief-depth`, material: ultraReliefDepthMaterial(context), instanced: true });
    if (name === 'full') {
      // A29: the screen kernel's configuration (A28, Trade 2), built by its define — linted, never shipped.
      for (const surface of ['pavement', 'grass'] as const) {
        out.push({ label: `${name}/kernel/ground/${surface}`, material: withScreenKernel(ultraGroundMaterial(materialAppearance(surface), surface, context, GROUND_DETAIL)), instanced: false });
      }
      out.push({ label: `${name}/kernel/water`, material: withScreenKernel(ultraWaterMaterial({ color: 0xffffff, roughness: 0.1, vertexColors: true }, context)), instanced: false });
      out.push({ label: `${name}/kernel/marking`, material: withScreenKernel(ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context)), instanced: false });
      out.push({ label: `${name}/kernel/hazard`, material: withScreenKernel(ultraHazardGroundMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true }, context)), instanced: false });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A small GLSL preprocessor + linter
// ---------------------------------------------------------------------------

/** three's `resolveIncludes`, recursively, from the live chunks. */
function resolveIncludes(source: string): string {
  return source.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_match, name: string) => {
    const chunk = (THREE.ShaderChunk as Record<string, string>)[name];
    if (chunk === undefined) throw new Error(`unknown chunk ${name}`);
    return resolveIncludes(chunk);
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}

/** Evaluate a `#if` expression: `defined` first, then define values, unknowns 0. */
function evaluate(expression: string, defines: Map<string, string>): boolean {
  let text = expression.replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (_m, a: string, b: string) =>
    (defines.has(a ?? b) ? '1' : '0'));
  text = text.replace(/\b[A-Za-z_]\w*\b/g, (name) => {
    const value = defines.get(name);
    return value !== undefined && /^-?\d+(\.\d+)?$/.test(value.trim()) ? value.trim() : '0';
  });
  // eslint-disable-next-line no-new-func
  return Boolean(new Function(`return (${text});`)());
}

/** Run the preprocessor, returning only the active lines. */
function preprocess(source: string, initial: Record<string, string>): string {
  const defines = new Map(Object.entries(initial));
  const lines = stripComments(source).split('\n');
  const out: string[] = [];
  // Each frame: [this branch active, some branch already taken, parent active]
  const stack: [boolean, boolean, boolean][] = [];
  const active = (): boolean => stack.every((frame) => frame[0]);
  for (const raw of lines) {
    const line = raw.trim();
    const directive = /^#\s*(\w+)\s*(.*)$/.exec(line);
    if (directive === null) {
      if (active()) out.push(raw);
      continue;
    }
    const [, name, rest] = directive;
    if (name === 'ifdef' || name === 'ifndef' || name === 'if') {
      const parent = active();
      const value = name === 'ifdef' ? defines.has(rest.trim())
        : name === 'ifndef' ? !defines.has(rest.trim())
          : evaluate(rest, defines);
      stack.push([parent && value, value, parent]);
    } else if (name === 'elif') {
      const frame = stack[stack.length - 1];
      const value = !frame[1] && evaluate(rest, defines);
      frame[0] = frame[2] && value;
      frame[1] = frame[1] || value;
    } else if (name === 'else') {
      const frame = stack[stack.length - 1];
      frame[0] = frame[2] && !frame[1];
      frame[1] = true;
    } else if (name === 'endif') {
      stack.pop();
    } else if (name === 'define' && active()) {
      const match = /^(\w+)(\([^)]*\))?\s*(.*)$/.exec(rest);
      if (match !== null) defines.set(match[1], match[2] === undefined ? match[3] : '1');
    } else if (name === 'undef' && active()) {
      defines.delete(rest.trim());
    }
  }
  assert.equal(stack.length, 0, 'unbalanced #if/#endif');
  return out.join('\n');
}

const TYPES = 'float|int|bool|vec[234]|ivec[234]|mat[234]|sampler2D|sampler2DShadow|samplerCube';

interface Lint {
  readonly declared: Map<string, number>;
  readonly globals: Map<string, number>;
  readonly varyings: Set<string>;
  readonly used: Set<string>;
}

function lint(active: string, stage: string): Lint {
  let depth = 0;
  let parens = 0;
  for (const character of active) {
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (character === '(') parens += 1;
    if (character === ')') parens -= 1;
    assert.ok(depth >= 0 && parens >= 0, `${stage}: a closing bracket before its opening one`);
  }
  assert.equal(depth, 0, `${stage}: unbalanced braces`);
  assert.equal(parens, 0, `${stage}: unbalanced parentheses`);

  const declared = new Map<string, number>();
  const globals = new Map<string, number>();
  const varyings = new Set<string>();
  const count = (map: Map<string, number>, name: string): void => {
    map.set(name, (map.get(name) ?? 0) + 1);
  };
  const declaration = new RegExp(`\\b(?:(uniform|attribute|varying)\\s+)?(?:(?:highp|mediump|lowp)\\s+)?(?:const\\s+)?(?:in\\s+)?(?:${TYPES})\\s+(\\w+)`, 'g');
  for (const match of active.matchAll(declaration)) {
    count(declared, match[2]);
    if (match[1] !== undefined) count(globals, match[2]);
    if (match[1] === 'varying') varyings.add(match[2]);
  }
  const used = new Set<string>();
  for (const match of active.matchAll(/\b(v?[uU]ltra\w*)\b/g)) used.add(match[1]);
  // GLSL needs a function defined before its first call.
  for (const match of active.matchAll(new RegExp(`\\b(?:void|${TYPES})\\s+(ultra\\w*)\\s*\\(`, 'g'))) {
    const name = match[1];
    const firstUse = active.search(new RegExp(`\\b${name}\\s*\\(`));
    assert.equal(firstUse, (match.index ?? 0) + match[0].indexOf(name), `${stage}: ${name} is called before it is defined`);
  }
  return { declared, globals, varyings, used };
}

/** The defines three itself adds for a typical Ultra draw (§2.3 frame), per stage-independent set. */
function threeDefines(options: { instanced: boolean; shadows: boolean; maps: boolean }): Record<string, string> {
  const defines: Record<string, string> = {
    NUM_DIR_LIGHTS: '1',
    NUM_HEMI_LIGHTS: '1',
    NUM_POINT_LIGHTS: '0',
    NUM_SPOT_LIGHTS: '0',
    NUM_RECT_AREA_LIGHTS: '0',
    NUM_SPOT_LIGHT_COORDS: '0',
    NUM_SPOT_LIGHT_MAPS: '0',
    NUM_SPOT_LIGHT_SHADOWS: '0',
    NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS: '0',
    NUM_POINT_LIGHT_SHADOWS: '0',
    NUM_DIR_LIGHT_SHADOWS: options.shadows ? '1' : '0',
    NUM_CLIPPING_PLANES: '0',
    UNION_CLIPPING_PLANES: '0',
    HAS_NORMAL: '',
    USE_COLOR: '',
    USE_ENVMAP: '',
    ENVMAP_TYPE_CUBE_UV: '',
    CUBEUV_TEXEL_WIDTH: '0.001',
    CUBEUV_TEXEL_HEIGHT: '0.001',
    CUBEUV_MAX_MIP: '8.0',
    PI: '3.14',
  };
  if (options.shadows) {
    defines.USE_SHADOWMAP = '';
    defines.SHADOWMAP_TYPE_PCF = '';
  }
  if (options.instanced) {
    defines.USE_INSTANCING = '';
    defines.USE_INSTANCING_COLOR = '';
  }
  if (options.maps) {
    for (const name of ['USE_UV', 'USE_MAP', 'USE_NORMALMAP', 'USE_NORMALMAP_TANGENTSPACE', 'USE_ROUGHNESSMAP', 'USE_METALNESSMAP', 'USE_AOMAP']) {
      defines[name] = '';
    }
  }
  return defines;
}

// ---------------------------------------------------------------------------
// 1. Anchors
// ---------------------------------------------------------------------------

test('the patches are written against three 0.185.1, and that is what is installed', () => {
  const pkg = JSON.parse(readFileSync(join(THREE_ROOT, 'package.json'), 'utf8')) as { version: string };
  assert.equal(pkg.version, '0.185.1', 'three moved: every Ultra patch anchor must be re-read against the new chunks');
});

test('every replace anchor exists in the pinned three chunk text, and in the live one', () => {
  assert.ok(ULTRA_PATCH_ANCHOR_SITES.length > 0);
  for (const site of ULTRA_PATCH_ANCHOR_SITES) {
    assert.ok(pinnedText(site.source).includes(site.anchor), `${site.source} (file) lacks: ${site.anchor}`);
    assert.ok(liveText(site.source).includes(site.anchor), `${site.source} (ShaderChunk/ShaderLib) lacks: ${site.anchor}`);
  }
  // The §6.2 list is exactly the anchors the sites name.
  assert.deepEqual(
    [...ULTRA_PATCH_ANCHORS].sort(),
    [...new Set(ULTRA_PATCH_ANCHOR_SITES.map((site) => site.anchor))].sort(),
  );
});

test('the near fade replaces the PCF getShadow return, which is the first of its kind', () => {
  // §3.2 says "the first `return mix( 1.0, shadow, shadowIntensity );`"; that
  // is only right while the PCF variant is the first `getShadow` in the chunk.
  const chunk = pinnedText('shadowmap_pars_fragment');
  const anchor = 'return mix( 1.0, shadow, shadowIntensity );';
  const first = chunk.indexOf(anchor);
  const pcf = chunk.indexOf('float getShadow( sampler2DShadow shadowMap');
  const vsm = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )');
  assert.ok(pcf >= 0 && vsm > pcf, 'the PCF getShadow moved');
  assert.ok(first > pcf && first < vsm, 'the first shadow return is no longer the PCF one');
});

test('the foliage anchor is RE_Direct_Physical’s diffuse line and nothing else', () => {
  const chunk = pinnedText('lights_physical_pars_fragment');
  const anchor = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );';
  const at = chunk.indexOf(anchor);
  assert.equal(chunk.indexOf(anchor, at + 1), -1, 'the anchor is no longer unique');
  const direct = chunk.indexOf('void RE_Direct_Physical(');
  const next = chunk.indexOf('void RE_IndirectDiffuse_Physical(');
  assert.ok(at > direct && at < next, 'the anchor left RE_Direct_Physical');
});

test('each #include anchor names a chunk that exists and occurs once in its program', () => {
  for (const site of ULTRA_PATCH_ANCHOR_SITES) {
    if (!site.anchor.startsWith('#include')) continue;
    const text = liveText(site.source);
    const first = text.indexOf(site.anchor);
    assert.equal(text.indexOf(site.anchor, first + 1), -1, `${site.anchor} occurs twice in ${site.source}`);
    const chunk = /<(\w+)>/.exec(site.anchor)?.[1] ?? '';
    assert.ok(chunk in THREE.ShaderChunk, `${chunk} is not a chunk`);
  }
});

// ---------------------------------------------------------------------------
// 2. Nothing global moves
// ---------------------------------------------------------------------------

test('THREE.ShaderChunk and ShaderLib are deep-equal before and after every Ultra material compiles', () => {
  const chunksBefore = { ...THREE.ShaderChunk };
  const libBefore = Object.fromEntries(
    Object.entries(THREE.ShaderLib).map(([name, shader]) => [name, [shader.vertexShader, shader.fragmentShader]]),
  );
  const built = everyMaterial();
  assert.ok(built.length > 150, `only ${built.length} variants built`);
  for (const { material } of built) compile(material);
  assert.deepEqual({ ...THREE.ShaderChunk }, chunksBefore);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(THREE.ShaderLib).map(([name, shader]) => [name, [shader.vertexShader, shader.fragmentShader]]),
    ),
    libBefore,
  );
});

// ---------------------------------------------------------------------------
// 3. The patched programs, linted
// ---------------------------------------------------------------------------

test('every patched program is ASCII, resolves, and declares every Ultra name it uses', () => {
  const configurations = [
    { shadows: true, label: 'shadowed' },
    { shadows: false, label: 'unshadowed' },
  ];
  let linted = 0;
  for (const { label, material, instanced } of everyMaterial()) {
    const shader = compile(material);
    for (const stage of [shader.vertexShader, shader.fragmentShader]) {
      assert.ok(!/[^\x00-\x7f]/.test(stage), `${label}: non-ASCII in a shader source`);
    }
    const standard = material instanceof THREE.MeshStandardMaterial;
    const maps = standard && (material as THREE.MeshStandardMaterial).normalMap !== null;
    for (const configuration of configurations) {
      const defines = {
        ...threeDefines({ instanced, shadows: configuration.shadows, maps }),
        ...(standard ? { STANDARD: '' } : { DEPTH_PACKING: '3200' }),
        ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])),
      };
      const vertex = lint(preprocess(resolveIncludes(shader.vertexShader), defines), `${label} vertex`);
      const fragment = lint(preprocess(resolveIncludes(shader.fragmentShader), defines), `${label} fragment`);
      for (const [stageName, stage] of [['vertex', vertex], ['fragment', fragment]] as const) {
        for (const name of stage.used) {
          assert.ok(stage.declared.has(name), `${label} (${configuration.label}) ${stageName}: ${name} is used but never declared`);
        }
        for (const [name, times] of stage.globals) {
          if (!/^v?[uU]ltra/.test(name)) continue;
          assert.equal(times, 1, `${label} (${configuration.label}) ${stageName}: ${name} declared ${times} times`);
        }
      }
      for (const name of fragment.varyings) {
        if (!/^vUltra/.test(name)) continue;
        assert.ok(vertex.varyings.has(name), `${label}: the fragment reads ${name} but the vertex stage never writes it`);
      }
      linted += 1;
    }
  }
  assert.ok(linted > 300, `only ${linted} programs linted`);
});

test('the patch lands where §3.2–§3.4 put it, in a shadowed standard program', () => {
  const context = contextFor();
  const shader = compile(ultraGroundMaterial(materialAppearance('brick'), 'brick', context));
  const fragment = preprocess(resolveIncludes(shader.fragmentShader), {
    ...threeDefines({ instanced: false, shadows: true, maps: false }),
    STANDARD: '',
    ULTRA_FAR: '',
    ULTRA_GROUND: '',
    ULTRA_AO: '',
    ULTRA_EDGE: '',
    ULTRA_BRICK: '',
  });
  // The near fade and the far crossfade are inside the compiled getShadow…
  const from = fragment.indexOf('float getShadow(');
  const getShadow = fragment.slice(from, fragment.indexOf('float getPointShadow', from) > 0 ? fragment.indexOf('float getPointShadow', from) : undefined);
  assert.ok(getShadow.includes('float ultraNearCover = ultraEdgeCoverage( shadowCoord.xy, ultraNearFade ) * step( shadowCoord.z, 1.0 );'));
  // The far map is fetched only where the near map does not rule alone.
  assert.ok(getShadow.includes('float ultraFarLit = ultraNearCover < 1.0 ? ultraFarVisibility() : 1.0;'));
  assert.ok(getShadow.includes('ultraSunVisibility = mix( 1.0, mix( ultraFarLit, shadow, ultraNearCover ), shadowIntensity );'));
  assert.ok(getShadow.includes('return ultraSunVisibility;'));
  assert.ok(!getShadow.includes('return mix( 1.0, shadow, shadowIntensity );'), 'three\'s return survived');
  // The fill's hue (pre-R1 "shade is navy") is set where iblIrradiance is
  // final — after the maps chunk added the environment, before three's
  // indirect terms read it — and after the loop that left the sun visibility.
  const maps = fragment.indexOf('iblIrradiance += getIBLIrradiance( geometryNormal );');
  const hue = fragment.indexOf('iblIrradiance = mix( dot( iblIrradiance, ultraLuma ) * ultraHue, iblIrradiance, ultraKeep );');
  assert.ok(maps > 0 && hue > maps && hue < fragment.indexOf('RE_IndirectDiffuse( irradiance'), 'the fill hue is not between the maps and the indirect terms');
  assert.ok(fragment.indexOf('ultraSunShare = ultraSunVisibility') > fragment.indexOf('RE_Direct( directLight'));
  // …the far lookup's normal is handed over before the direct loop calls it…
  const loop = fragment.indexOf('RE_Direct( directLight');
  const normal = fragment.indexOf('ultraShadeNormal = transformNormalByInverseViewMatrix');
  const indirect = fragment.indexOf('RE_IndirectSpecular( radiance');
  assert.ok(normal > 0 && normal < loop && loop < indirect, 'the shade normal is not written before the direct loop');
  // …and nothing multiplies the direct light again after the loop (§3.4's
  // post-loop product is what left a lit stripe in continuous shade).
  assert.ok(!/reflectedLight\.direct(Diffuse|Specular) \*= ultraFar/.test(fragment));
  // AO follows three's own AO and precedes the final sums.
  const threeAo = fragment.indexOf('vec3 totalDiffuse');
  const ultraAo = fragment.indexOf('ultraOcclusion');
  assert.ok(ultraAo > indirect && ultraAo < threeAo);
  // The albedo edits precede the material setup; the floors follow it.
  const setup = fragment.indexOf('material.diffuseColor = diffuseColor.rgb;');
  assert.ok(fragment.indexOf('ultraJoint') < setup);
  // The ground patch's edge cover (ultraGroundDetail.ts) is an albedo edit too.
  assert.ok(fragment.indexOf('ultraEdgeCover') > 0 && fragment.indexOf('ultraEdgeCover') < setup);
  assert.ok(fragment.indexOf('ultraFloor') > setup);
});

test('the relief depth patch divides the metric relief by the instance scale', () => {
  const patched = patchUltraDepthVertex(THREE.ShaderLib.depth.vertexShader);
  assert.ok(patched.includes('transformed += ultraRelief / ultraLocalScale();'));
  assert.ok(patched.includes('length( instanceMatrix[ 0 ].xyz )'));
  assert.ok(patched.includes('length( modelMatrix[ 1 ].xyz )'));
  // And the colour patch applies the same offset, so the shadow matches the pixels.
  assert.ok(patchUltraVertex(THREE.ShaderLib.standard.vertexShader).includes('transformed += ultraRelief / ultraLocalScale();'));
  // Metric under non-uniform scale: a 0.75 m parapet and a 48 m shaft (§4).
  for (const height of [0.75, 48]) {
    const scale = new THREE.Vector3(12, height, 7);
    const local = 0.08 / scale.y; // what the shader adds to a unit-box y
    assert.ok(Math.abs(local * scale.y - 0.08) < 1e-12);
  }
});

test('a missing anchor throws instead of compiling half a patch', () => {
  assert.throws(() => patchUltraFragment('void main() {}'), /Ultra patch anchor missing/);
  assert.throws(() => patchUltraVertex('void main() {}'), /Ultra patch anchor missing/);
});

// ---------------------------------------------------------------------------
// 4. Families, defines and keys
// ---------------------------------------------------------------------------

test('each family shares one program key, and families never share one', () => {
  const byFamily = new Map<string, Set<string>>();
  for (const { material } of everyMaterial()) {
    const family = String(material.userData.ultraFamily);
    const keys = byFamily.get(family) ?? new Set<string>();
    keys.add(material.customProgramCacheKey());
    byFamily.set(family, keys);
  }
  const all = new Set<string>();
  for (const [family, keys] of byFamily) {
    assert.equal(keys.size, 1, `${family} has ${keys.size} keys`);
    const [key] = keys;
    assert.equal(key, ultraProgramKey(family as Parameters<typeof ultraProgramKey>[0]));
    assert.ok(!all.has(key));
    all.add(key);
  }
  assert.deepEqual(
    [...byFamily.keys()].sort(),
    ['block', 'facade', 'foliage', 'furniture', 'ground', 'hazard-ground', 'marking', 'relief', 'relief-depth', 'water'],
  );
});

test('the ground family’s defines follow the surface and the kit', () => {
  const defines = (surface: MaterialId | 'field', override: UltraKitOverride | null = null): string[] =>
    Object.keys(ultraGroundMaterial(materialAppearance(surface === 'field' ? 'grass' : surface), surface, contextFor(ULTRA_FULL, override)).defines ?? {})
      .filter((name) => name.startsWith('ULTRA_')).sort();
  // The edge field is the ground patch's own `ULTRA_EDGE` (pre-R1 ground pass);
  // Wave 3 (R-G) adds the static-shade lift (`ULTRA_SHADE_LIFT`, a lighting
  // response, A7) and the rider/cop contact (`ULTRA_CONTACT_DYNAMIC`, with the
  // ground's other grounding, A9).
  assert.deepEqual(defines('brick'), ['ULTRA_AO', 'ULTRA_BRICK', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_EDGE', 'ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_SHADE_LIFT']);
  // The road never takes joints, and never lets AO touch direct light.
  assert.deepEqual(defines('pavement'), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_EDGE', 'ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_ROAD', 'ULTRA_SHADE_LIFT']);
  assert.deepEqual(defines('roughPavement'), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_EDGE', 'ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_ROAD', 'ULTRA_SHADE_LIFT']);
  assert.deepEqual(defines('grass'), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_EDGE', 'ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_SHADE_LIFT']);
  // The surround field carries AO alone (and the lift and the rider's contact).
  assert.deepEqual(defines('field'), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_SHADE_LIFT']);
  // Kill flags: the attributes the builders will not attach are never declared.
  assert.deepEqual(defines('grass', { edgeFill: false }), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_SHADE_LIFT']);
  assert.deepEqual(defines('brick', { ground: false }), ['ULTRA_FAR', 'ULTRA_GROUND', 'ULTRA_SHADE_LIFT']);
  assert.deepEqual(defines('grass', { farShadow: false }), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_EDGE', 'ULTRA_GROUND', 'ULTRA_SHADE_LIFT']);
  // `-lighting` keeps the surfaces and drops the response.
  assert.deepEqual(defines('grass', { lighting: false }), ['ULTRA_AO', 'ULTRA_CONTACT_DYNAMIC', 'ULTRA_EDGE', 'ULTRA_FAR']);
  // ultra-lit keeps the far map off (A1).
  assert.ok(!Object.keys(ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor(ULTRA_LIT)).defines ?? {}).includes('ULTRA_FAR'));
});

test('road paint takes the road’s lift and contact under the same kit switches, and nothing of the ground’s surfaces (U2 stabilizer)', () => {
  const defines = (override: UltraKitOverride | null = null, recipe: UltraRecipe = ULTRA_FULL): string[] =>
    Object.keys(ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, contextFor(recipe, override)).defines ?? {})
      .filter((name) => name.startsWith('ULTRA_')).sort();
  // Wave 4 (R-L): paint filters the near map as the road does (`ULTRA_GROUND_SHADOW`, a lighting response).
  assert.deepEqual(defines(), ['ULTRA_CONTACT_DYNAMIC', 'ULTRA_FAR', 'ULTRA_GROUND_SHADOW', 'ULTRA_SHADE_LIFT']);
  assert.deepEqual(defines({ lighting: false }), ['ULTRA_CONTACT_DYNAMIC', 'ULTRA_FAR']);
  assert.deepEqual(defines({ ground: false }), ['ULTRA_FAR', 'ULTRA_GROUND_SHADOW', 'ULTRA_SHADE_LIFT']);
  assert.deepEqual(defines({ lighting: false, ground: false }), ['ULTRA_FAR']);
  assert.ok(!defines(null, ULTRA_LIT).includes('ULTRA_FAR'));

  // The same light block as the ground's, after `aomap_fragment`; no edge field and no detail.
  const paint = compile(ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, contextFor(ULTRA_FULL))).fragmentShader;
  const ground = compile(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', contextFor(ULTRA_FULL))).fragmentShader;
  const lightBlock = (source: string): string => {
    const start = source.indexOf('#ifdef ULTRA_SHADE_LIFT', source.indexOf('#include <aomap_fragment>'));
    return source.slice(start, source.indexOf('#endif', source.indexOf('#ifdef ULTRA_CONTACT_DYNAMIC', start)) + 6);
  };
  assert.ok(lightBlock(paint).includes('ultraDynamicContact( vUltraWorld.xz, ultraPoolShade )'));
  assert.equal(lightBlock(paint), lightBlock(ground));
  assert.ok(paint.includes('float ultraDynamicContact('));
  assert.ok(!paint.includes('vUltraEdge') && !paint.includes('ultraGroundDetail('));
  // The contact reads the shared uniforms by reference.
  const context = contextFor(ULTRA_FULL);
  const uniforms = compile(ultraMarkingMaterial({ color: 0xffffff }, context)).uniforms;
  assert.equal(uniforms.ultraContactPoints, context.shared.uniforms.ultraContactPoints);
  assert.equal(uniforms.ultraContactCount, context.shared.uniforms.ultraContactCount);
});

test('prop parts are patched as the family §3.3 names, with relief only where the builders attach it', () => {
  assert.equal(ultraPropFamily('crown'), 'foliage');
  assert.equal(ultraPropFamily('coniferFoliage'), 'foliage');
  assert.equal(ultraPropFamily('shrub'), 'foliage');
  assert.equal(ultraPropFamily('trunk'), 'furniture');
  assert.equal(ultraPropFamily('buildingTall'), 'facade');
  assert.equal(ultraPropFamily('buildingCap'), 'relief');
  assert.equal(ultraPropFamily('roofGable'), 'relief');
  assert.equal(ultraPropFamily('gantrySpan'), 'furniture');

  const defines = (part: PartId, override: UltraKitOverride | null = null, maps = true): string[] => {
    const atlas = part.startsWith('building') && part !== 'buildingCap';
    const material = ultraPropMaterial(
      part,
      { roughness: 0.9, metalness: 0, map: atlas ? new THREE.DataTexture() : null },
      contextFor(ULTRA_FULL, override),
      maps && atlas ? fakeMaps() : null,
    );
    return Object.keys(material.defines ?? {}).filter((name) => name.startsWith('ULTRA_')).sort();
  };
  assert.deepEqual(defines('crown'), ['ULTRA_FAR', 'ULTRA_FOLIAGE']);
  assert.deepEqual(defines('crown', { lighting: false }), ['ULTRA_FAR']);
  // Wave 4 (R-L): the facade's own receive (`ULTRA_FACADE_RECEIVE`) is a lighting response;
  // so is the final wave's cast-shade lift (`ULTRA_FACADE_LIFT`, P-LT).
  assert.deepEqual(defines('buildingBody'), ['ULTRA_BASE_AO', 'ULTRA_FACADE_LIFT', 'ULTRA_FACADE_RECEIVE', 'ULTRA_FAR', 'ULTRA_GLASS', 'ULTRA_RELIEF']);
  assert.deepEqual(defines('buildingBody', null, false), ['ULTRA_BASE_AO', 'ULTRA_FACADE_LIFT', 'ULTRA_FACADE_RECEIVE', 'ULTRA_FAR', 'ULTRA_RELIEF']);
  assert.deepEqual(defines('buildingBody', { buildings: false }), ['ULTRA_BASE_AO', 'ULTRA_FACADE_LIFT', 'ULTRA_FACADE_RECEIVE', 'ULTRA_FAR', 'ULTRA_GLASS']);
  assert.deepEqual(defines('buildingBody', { lighting: false }), ['ULTRA_BASE_AO', 'ULTRA_FAR', 'ULTRA_RELIEF']);
  assert.deepEqual(defines('buildingCap'), ['ULTRA_FAR', 'ULTRA_RELIEF']);
  assert.deepEqual(defines('roofGable'), ['ULTRA_FAR', 'ULTRA_RELIEF', 'ULTRA_TILES']);
  assert.deepEqual(defines('lampPost'), ['ULTRA_FAR']);

  const depth = (override: UltraKitOverride | null): string[] =>
    Object.keys(ultraReliefDepthMaterial(contextFor(ULTRA_FULL, override)).defines ?? {});
  assert.deepEqual(depth(null), ['ULTRA_RELIEF']);
  assert.deepEqual(depth({ buildings: false }), []);
});

test('a prop keeps its ordinary material literal, and a facade wears the Ultra maps', () => {
  const context = contextFor();
  const atlas = new THREE.DataTexture();
  const plain = ultraPropMaterial('benchWood', { roughness: 0.72, metalness: 0, map: null }, context, null);
  assert.equal(plain.color.getHex(), 0xffffff);
  assert.equal(plain.roughness, 0.72);
  assert.equal(plain.metalness, 0);
  assert.equal(plain.vertexColors, true);
  assert.equal(plain.map, null);

  const withoutMaps = ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: atlas }, context, null);
  assert.equal(withoutMaps.map, atlas);
  assert.equal(withoutMaps.roughness, 0.92);
  assert.equal(withoutMaps.normalMap, null);

  const maps = fakeMaps();
  const facade = ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: atlas }, context, maps);
  assert.equal(facade.map, maps.albedo);
  assert.equal(facade.normalMap, maps.normal);
  assert.equal(facade.roughnessMap, maps.orm);
  assert.equal(facade.metalnessMap, maps.orm);
  assert.equal(facade.aoMap, maps.orm);
  // The ORM page's texels are absolute: the scalars they multiply are 1.
  assert.equal(facade.roughness, 1);
  assert.equal(facade.metalness, 1);

  // A cap never samples the atlas, so maps passed to it are ignored.
  const cap = ultraPropMaterial('buildingCap', { roughness: 0.9, metalness: 0, map: null }, context, maps);
  assert.equal(cap.normalMap, null);
  assert.equal(cap.map, null);
});

test('street metal gets the 0.35 roughness floor; everything else floors at 0', () => {
  const context = contextFor();
  const floorOf = (material: THREE.Material): number => Number(compile(material).uniforms.ultraRoughnessFloor.value);
  assert.equal(floorOf(ultraPropMaterial('lampPost', { roughness: 0.4, metalness: 0.6, map: null }, context, null)), ULTRA.specular.metalRoughnessFloor);
  assert.equal(floorOf(ultraPropMaterial('benchWood', { roughness: 0.72, metalness: 0, map: null }, context, null)), 0);
  assert.equal(floorOf(ultraBlockMaterial(materialAppearance('metal'), 'metal', context)), ULTRA.specular.metalRoughnessFloor);
  assert.equal(floorOf(ultraBlockMaterial(materialAppearance('concrete'), 'concrete', context)), 0);
});

test('markings, hazard ground and water keep every parameter they were given', () => {
  const context = contextFor();
  const params = { color: 0xffffff, roughness: 0.82, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  for (const make of [ultraMarkingMaterial, ultraHazardGroundMaterial, ultraWaterMaterial]) {
    const material = make(params, context);
    assert.equal(material.roughness, 0.82);
    assert.equal(material.vertexColors, true);
    assert.equal(material.polygonOffset, true);
    assert.equal(material.polygonOffsetFactor, -2);
    assert.equal(material.polygonOffsetUnits, -2);
  }
});

// ---------------------------------------------------------------------------
// 5. Shared uniforms and the writers
// ---------------------------------------------------------------------------

test('every material holds the shared uniforms by reference, so one write reaches all', () => {
  const context = contextFor();
  const a = compile(ultraGroundMaterial(materialAppearance('grass'), 'grass', context));
  const b = compile(ultraPropMaterial('crown', { roughness: 1, metalness: 0, map: null }, context, null));
  for (const name of Object.keys(context.shared.uniforms)) {
    assert.equal(a.uniforms[name], context.shared.uniforms[name], `${name} is copied, not shared`);
    assert.equal(b.uniforms[name], context.shared.uniforms[name]);
  }
  // …and the per-material floor is per material.
  assert.notEqual(a.uniforms.ultraRoughnessFloor, b.uniforms.ultraRoughnessFloor);
  tuneUltraShared(context.shared, { ...defaultUltraLive(), groundSpec: 0.3 });
  assert.equal(a.uniforms.ultraGroundSpec.value, 0.3);
  assert.equal(b.uniforms.ultraGroundSpec.value, 0.3);
});

test('createUltraShared starts at the ULTRA table, headless', () => {
  const u = createUltraShared().uniforms;
  assert.equal(u.ultraGroundSpec.value, ULTRA.groundSpec);
  assert.equal(u.ultraGlassSpec.value, ULTRA.glassSpec);
  assert.equal(u.ultraWaterSpec.value, ULTRA.waterSpec);
  assert.equal(u.ultraFoliageWrap.value, ULTRA.foliageWrap);
  assert.equal(u.ultraFoliageTransmission.value, ULTRA.foliageTransmission);
  assert.equal(u.ultraContactDirect.value, ULTRA.contactDirectShare);
  assert.equal(u.ultraContactFloor.value, ULTRA.contact.floor);
  assert.equal(u.ultraSpecAA.value, ULTRA.specAA);
  assert.equal(u.ultraShadeLift.value, ULTRA.shade.lift);
  assert.equal(u.ultraShadeLiftFar.value, ULTRA.shade.liftFar);
  assert.equal(u.ultraNearFade.value, ULTRA.near.fadeShare / 2);
  assert.equal(u.ultraFarEnabled.value, 0);
  // F-A3: never null — the uploaded empty far map until a frame writes one.
  assert.equal(u.ultraFarMap.value, emptyFarShadowMap());
  assert.equal(u.ultraBrickModule.value, 2.8);
  // Pre-R1 calibration (L): the fill's hue, the canopy's sky light, the
  // back-light lobe and the far map's filter are table constants.
  assert.equal(u.ultraFillSaturation.value, ULTRA.env.fillSaturation);
  assert.equal(u.ultraFillSunSaturation.value, ULTRA.env.fillSunSaturation);
  assert.equal(u.ultraFillHazeTint.value, ULTRA.env.fillHazeTint);
  assert.equal(u.ultraFoliageSkyFill.value, ULTRA.foliage.skyFill);
  assert.equal(u.ultraFoliageTransmissionPower.value, ULTRA.foliage.transmissionPower);
  assert.equal(u.ultraFarSpread.value, ULTRA.farShadow.pcfSpreadTexels);
});

test('pre-R1 lighting: shade fill is desaturated toward the haze, rough reflections take the surface hue, pits see only sky', () => {
  const context = contextFor();
  const defines = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_ENVMAP: '', ENVMAP_TYPE_CUBE_UV: '', USE_FOG: '' };
  const lit = (material: THREE.Material, extra: Record<string, string>): string =>
    preprocess(resolveIncludes(compile(material).fragmentShader), { ...defines, ...extra });

  // Every lit family: the hue treatment runs after the maps chunk added the
  // environment, keeps luminance (an affine mix toward luma × a unit-luma hue),
  // and reads the sun visibility the patched getShadow left.
  const trunk = lit(ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, context, null), { ULTRA_FAR: '' });
  const maps = trunk.indexOf('iblIrradiance += getIBLIrradiance( geometryNormal );');
  const hue = trunk.indexOf('ultraHue = mix( ultraHue, fogColor / max( dot( fogColor, ultraLuma ), 1e-4 ), ultraFillHazeTint );');
  assert.ok(maps > 0 && hue > maps, 'the haze hue is not after the environment');
  assert.ok(trunk.includes('float ultraKeep = mix( 1.0, mix( ultraFillSaturation, ultraFillSunSaturation, ultraSunShare ), ultraSkyShare );'));
  assert.ok(trunk.includes('radiance = mix( radiance, dot( radiance, ultraLuma ) * ultraSurfaceHue, ultraRough );'));
  assert.ok(!trunk.includes('iblIrradiance *= ultraFoliageSkyFill;'), 'a trunk is not a canopy');
  assert.ok(!/ULTRA_CAVITY|iblIrradiance = getIBLIrradiance/.test(trunk.replace(/#if[^\n]*ULTRA_CAVITY[^\n]*/g, '')));
  // Four bilinear compare fetches on the far map, skipped inside the near box.
  assert.equal((trunk.match(/textureLod\( ultraFarMap,/g) ?? []).length, 4);

  // Foliage takes the canopy's sky light, on the fill only.
  const crown = lit(ultraPropMaterial('crown', { roughness: 0.9, metalness: 0, map: null }, context, null), { ULTRA_FOLIAGE: '' });
  assert.ok(crown.indexOf('iblIrradiance *= ultraFoliageSkyFill;') > crown.indexOf('iblIrradiance = mix( dot( iblIrradiance, ultraLuma ) * ultraHue, iblIrradiance, ultraKeep );'));
  assert.ok(crown.includes('pow( saturate( dot( geometryViewDir, - directLight.direction ) ), ultraFoliageTransmissionPower )'));

  // Pothole ground: the bowl's fill is the up-facing face's, and its sheen is
  // the road's share — only when the kit lights the world.
  const pothole = ultraHazardGroundMaterial({ roughness: 0.95 }, context);
  assert.ok('ULTRA_CAVITY' in pothole.defines!);
  assert.ok(!('ULTRA_CAVITY' in ultraHazardGroundMaterial({ roughness: 0.95 }, contextFor(ULTRA_FULL, { lighting: false })).defines!));
  const pit = lit(pothole, { ULTRA_CAVITY: '' });
  const up = pit.indexOf('iblIrradiance = getIBLIrradiance( normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );');
  assert.ok(up > pit.indexOf('iblIrradiance += getIBLIrradiance( geometryNormal );') && up < pit.indexOf('float ultraKeep'));
  assert.equal((pit.match(/reflectedLight\.indirectSpecular \*= ultraGroundSpec;/g) ?? []).length, 1);
});

test('Wave 3 (R-L): foliage filters its own shade — a fixed tent and a receive bias — and nothing else does', () => {
  const context = contextFor();
  const defines = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_FOG: '' };
  const lit = (material: THREE.Material, extra: Record<string, string>): string =>
    preprocess(resolveIncludes(compile(material).fragmentShader), { ...defines, ...extra });
  const call = 'if ( frustumTest ) shadow = ultraFoliageShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFoliageReceiveBias ), shadowMapSize );';

  const conifer = lit(ultraPropMaterial('coniferFoliage', { roughness: 1, metalness: 0, map: null }, context, null), { ULTRA_FOLIAGE: '', ULTRA_FAR: '' });
  // Inside the PCF getShadow, after three's own taps and before the near fade reads `shadow`.
  const at = conifer.indexOf(call);
  assert.ok(at > conifer.indexOf('vogelDiskSample( 4, 5, phi )'), 'the foliage filter is not after three’s taps');
  assert.ok(at < conifer.indexOf('float ultraNearCover'), 'the foliage filter is after the near fade');
  // A fixed 3×3 tent: nine compare fetches with (1, 2, 1)² weights over 16, no noise.
  const helper = conifer.slice(conifer.indexOf('float ultraFoliageShadow('), conifer.indexOf('uniform float ultraEnvResponse;'));
  assert.ok(helper.includes('( 2.0 - abs( float( i ) ) ) * ( 2.0 - abs( float( j ) ) )'));
  assert.ok(helper.includes('return sum / 16.0;'));
  assert.ok(!helper.includes('interleavedGradientNoise'));

  // Every other family keeps three's five dithered taps, untouched.
  const trunk = lit(ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, context, null), { ULTRA_FAR: '' });
  assert.ok(!trunk.includes('ultraFoliageShadow'));
  // …and so does foliage under the -lighting attribution diagnostic.
  const plain = ultraPropMaterial('coniferFoliage', { roughness: 1, metalness: 0, map: null }, contextFor(ULTRA_FULL, { lighting: false }), null);
  assert.ok(!('ULTRA_FOLIAGE' in plain.defines!));

  // The receive bias is metres along the light, in the rig's own depth units.
  const shared = createUltraShared();
  const sun = new THREE.DirectionalLight();
  sun.position.set(30, 40, 0);
  const rig = shadowRigFor('ultra', 'high');
  updateUltraShared(shared, { sun, rig, far: null });
  const u = shared.uniforms;
  assert.ok(Math.abs(u.ultraFoliageReceiveBias.value - ULTRA.foliage.receiveBiasMetres / (rig.far - rig.near)) < 1e-15);
  assert.equal(u.ultraFoliageShadowSpread.value, ULTRA.foliage.shadowSpreadTexels);
  // Starts at the Ultra rig's value before the first frame writes it.
  assert.equal(createUltraShared().uniforms.ultraFoliageReceiveBias.value, ULTRA.foliage.receiveBiasMetres / (ULTRA.near.far - ULTRA.near.near));
});

test('Wave 4 (R-L): the ground, its paint and the facades filter with a fixed disk; facades add a receive bias, a slope-scaled offset and a grazing fade', () => {
  const context = contextFor();
  const base = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_FOG: '' };
  const text = (source: string, material: THREE.Material): string => preprocess(resolveIncludes(source), {
    ...base,
    ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])),
  });
  const fragmentOf = (material: THREE.Material): string => text(compile(material).fragmentShader, material);
  const vertexOf = (material: THREE.Material): string => text(compile(material).vertexShader, material);
  const groundCall = 'if ( frustumTest ) shadow = ultraGroundShadow( shadowMap, shadowCoord.xyz, shadowMapSize, shadowRadius );';
  const facadeCall = 'if ( frustumTest ) shadow = ultraDiskShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFacadeReceiveBias ), shadowMapSize, ultraFacadeShadowRadius( shadowRadius ) );';
  const fade = 'ultraSunVisibility *= smoothstep( ultraFacadeNlFade.x, ultraFacadeNlFade.y, dot( ultraShadeNormal, ultraSunDirection ) );';
  const slope = 'shadowWorldNormal *= 1.0 + ultraFacadeSlopeNormal * ( 1.0 - saturate( dot( shadowWorldNormal, ultraSunDirection ) ) );';

  // The ground and everything that lies on it: the disk, after three's taps
  // and before the near fade reads `shadow`; no facade receive.
  const flatMaterials = (): THREE.MeshStandardMaterial[] => [
    ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context),
    ultraGroundMaterial(materialAppearance('grass'), 'field', context),
    ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context),
    ultraHazardGroundMaterial({ roughness: 0.95 }, context),
    ultraWaterMaterial({ color: 0xffffff, roughness: 0.1 }, context),
  ];
  const flat = flatMaterials();
  for (const material of flat) {
    const source = fragmentOf(material);
    const at = source.indexOf(groundCall);
    assert.ok(at > source.indexOf('vogelDiskSample( 4, 5, phi )'), `${material.userData.ultraFamily}: no ground disk after three's taps`);
    assert.ok(at < source.indexOf('float ultraNearCover'));
    assert.ok(!source.includes(facadeCall) && !source.includes(fade));
    // Final wave (P-LT): the edge-reconstructed disk near the camera, handed to the plain far disk along the ramp.
    assert.ok(source.includes('float ultraRamp = smoothstep( ultraGroundShadowRamp.x, ultraGroundShadowRamp.y, length( vViewPosition ) );'));
    // A29: as shipped, U5's filter — the plain disk, no screen kernel, no far-caster disk.
    assert.ok(!groundScreenKernelCompiled(material), `${material.userData.ultraFamily}: a shipped material carries the kernel`);
    assert.ok(source.includes('float ultraLit = ultraDiskShadow( map, coord, size, mix( ultraNear, max( ultraNear, ultraGroundShadowSpread ), ultraRamp ) );'));
    assert.ok(source.includes('return ultraLit + ( ultraEdgeSharpen( ultraLit ) - ultraLit ) * ( 1.0 - ultraRamp );'));
    for (const kernelName of ['ultraGroundDiskShadow', 'ultraGroundScreenKernel', 'ultraGroundKernelOn', 'ultraGroundKernelX', 'ultraGroundPenumbraDepth', 'ultraFarCaster', 'ultraScreenRadius']) {
      assert.ok(!compile(material).fragmentShader.includes(kernelName), `${material.userData.ultraFamily}: ${kernelName} is in a shipped program's text`);
    }
  }
  // The kernel's configuration (A28, Trade 2), built by its define.
  for (const material of flatMaterials().map(withScreenKernel)) {
    const source = fragmentOf(material);
    assert.ok(source.includes('float ultraRamp = smoothstep( ultraGroundShadowRamp.x, ultraGroundShadowRamp.y, length( vViewPosition ) );'));
    assert.ok(source.includes('float ultraRadius = mix( ultraNear, max( ultraNear, ultraGroundShadowSpread ), ultraRamp );'));
    assert.ok(source.includes('float ultraLit = ultraGroundDiskShadow( map, coord, size, ultraRadius, ultraKernel );'));
    assert.ok(source.includes('return ultraLit + ( ultraEdgeSharpen( ultraLit ) - ultraLit ) * ( 1.0 - ultraRamp );'));
    // A28 (Trade 2): the same 16 taps, each also offset by the screen kernel,
    // which main() writes before the light loop from the fragment's own
    // derivatives — a disk of a fixed angle on screen, zero inside its ramp —
    // and only where a far caster shades its reach (a PCSS blocker test: the
    // same disk, twice as wide, compared the caster height nearer the light).
    assert.ok(source.includes('sum += ultraDisk[ i ].z * texture( map, vec3( coord.xy + ultraTap * ultraScale + ultraScreen * ultraTap, coord.z ) );'));
    assert.ok(source.includes('mat2 ultraScreen = ultraGroundScreenKernel * kernel;'));
    assert.ok(source.includes('float ultraFarCaster = 1.0 - ultraGroundDiskShadow( map, vec3( coord.xy, coord.z - ultraGroundPenumbraDepth ), size, ultraRadius, 2.0 );'));
    assert.ok(source.includes('if ( ultraGroundKernelOn > 0.5 ) {'), 'the blocker test runs inside the kernel\'s ramp');
    const kernel = source.indexOf('ultraGroundScreenKernel = mat2( dFdx( vDirectionalShadowCoord[ 0 ].xy ), dFdy( vDirectionalShadowCoord[ 0 ].xy ) ) * ultraScreenRadius;');
    const loop = source.indexOf('getDirectionalLightInfo( directionalLight, directLight );');
    assert.ok(kernel > source.indexOf('void main()') && loop > kernel, 'the kernel is not written in main() before the light loop');
    const radians = (ULTRA.nearFilter.groundScreenSpreadDegrees * Math.PI) / 180;
    // A fixed angle on screen, capped at groundScreenMaxMetres of ground along the pixel's longer axis.
    assert.ok(source.includes(`float ultraScreenRadius = min( ${radians.toFixed(8)} / max( ultraPixelAngle, 1e-7 ), `
      + `${ULTRA.nearFilter.groundScreenMaxMetres.toFixed(6)} / max( ultraFootprint, 1e-4 ) )`));
    assert.ok(source.includes('float ultraFootprint = max( length( ultraFootX ), length( ultraFootY ) );'));
    const [r0, r1] = ULTRA.nearFilter.groundScreenRampMetres;
    assert.ok(source.includes(`* smoothstep( ${r0.toFixed(6)}, ${r1.toFixed(6)}, length( vViewPosition ) );`));
    assert.ok(source.includes('ultraGroundKernelX = ultraFootX * ultraScreenRadius;'));
  }
  // A28: the screen kernel starts past the rider's own shadow (the chase
  // camera stands about 6 m behind the wheel, and the shadow reaches a few
  // metres past it), only a far caster's shade takes it (trees top out under
  // the caster height), and it stays a small angle and a bounded width.
  const screen = ULTRA.nearFilter;
  assert.ok(screen.groundScreenRampMetres[0] >= 10 && screen.groundScreenRampMetres[1] > screen.groundScreenRampMetres[0]);
  assert.ok(screen.groundScreenCasterMetres >= 10, 'a tree crown (≤ 10 m at the largest placed scale) would take the kernel');
  assert.ok(screen.groundScreenSpreadDegrees > 0 && screen.groundScreenSpreadDegrees < 1);
  assert.ok(screen.groundScreenMaxMetres > 0 && screen.groundScreenMaxMetres <= 2);

  // The facade: its own call, the fade on the final visibility, the slope-scaled offset in the vertex stage.
  const body = ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture() }, context, fakeMaps());
  const facade = fragmentOf(body);
  assert.ok(facade.indexOf(facadeCall) > facade.indexOf('vogelDiskSample( 4, 5, phi )'));
  assert.ok(facade.indexOf(fade) > facade.indexOf('ultraSunVisibility = mix( 1.0, mix( ultraFarLit, shadow, ultraNearCover ), shadowIntensity );'));
  assert.ok(facade.indexOf(fade) < facade.indexOf('return ultraSunVisibility;'));
  assert.ok(!facade.includes(groundCall));
  const facadeVertex = vertexOf(body);
  assert.ok(facadeVertex.indexOf(slope) > facadeVertex.indexOf('vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );'));
  assert.ok(facadeVertex.indexOf(slope) < facadeVertex.indexOf('shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );'));

  // Everything else keeps three's five dithered taps (and foliage its tent):
  // street furniture, caps and gables, blocks — and the -lighting diagnostic.
  const untouched = [
    ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, context, null),
    ultraPropMaterial('buildingCap', { roughness: 0.9, metalness: 0, map: null }, context, null),
    ultraBlockMaterial(materialAppearance('concrete'), 'concrete', context),
    ultraGroundMaterial(materialAppearance('pavement'), 'pavement', contextFor(ULTRA_FULL, { lighting: false })),
    ultraMarkingMaterial({ color: 0xffffff }, contextFor(ULTRA_FULL, { lighting: false })),
    ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture() }, contextFor(ULTRA_FULL, { lighting: false }), fakeMaps()),
  ];
  for (const material of untouched) {
    const source = fragmentOf(material);
    assert.ok(!source.includes('ultraDiskShadow(') && !source.includes(fade), `${material.userData.ultraFamily} took the disk`);
    assert.ok(!vertexOf(material).includes(slope));
  }

  // The disk: a fixed Vogel spiral inside the unit disk, no noise, no repeats,
  // weighted 1 − r² (Epanechnikov) with weights that sum to exactly 1.
  const taps = ultraDiskTaps();
  assert.equal(taps.length, ULTRA.nearFilter.taps);
  for (const [x, y, w] of taps) {
    assert.ok(Math.hypot(x, y) < 1);
    assert.ok(Math.abs(w - (1 - Math.hypot(x, y) ** 2) * (2 / taps.length)) < 1e-12, 'weight ∝ 1 − r²');
  }
  assert.equal(new Set(taps.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`)).size, taps.length);
  assert.equal(taps.reduce((sum, [, , w]) => sum + w, 0), 1);
  // Every weight is a whole number of 256ths at 16 taps: exact in float32, so a lit pixel stays exactly 1.
  for (const [, , w] of taps) assert.ok(Number.isInteger(w * 256));
  const helper = facade.slice(facade.indexOf('float ultraDiskShadow('), facade.indexOf('uniform float ultraFacadeReceiveBias;'));
  assert.ok(helper.includes('sum += ultraDisk[ i ].z * texture( map, vec3( coord.xy + ultraDisk[ i ].xy * ultraScale, coord.z ) );'));
  assert.ok(!helper.includes('interleavedGradientNoise') && !helper.includes('gl_FragCoord'));
  const table = facade.slice(facade.indexOf('const vec3 ultraDisk['), facade.indexOf('float ultraDiskShadow('));
  assert.equal((table.match(/vec3\( -?\d/g) ?? []).length, taps.length);
  assert.ok(table.includes(`vec3( ${taps[0][0].toFixed(6)}, ${taps[0][1].toFixed(6)}, 0.12109375 )`));

  // The receive bias sits under every real facade shadow's distance along the ray.
  assert.ok(ULTRA.facade.receiveBiasMetres < ULTRA.relief.revealDepth);
  assert.ok(ULTRA.facade.receiveBiasMetres < ULTRA.relief.capGrooveDepth);
  assert.ok(ULTRA.facade.nlFade[0] < ULTRA.facade.nlFade[1] && ULTRA.facade.nlFade[1] <= 0.12);

  // Uniforms: table values, and the bias in the rig's own depth units per frame.
  const shared = createUltraShared();
  const u = shared.uniforms;
  assert.equal(u.ultraGroundShadowSpread.value, ULTRA.nearFilter.groundFarSpreadTexels);
  assert.deepEqual((u.ultraGroundShadowRamp.value as THREE.Vector2).toArray(), [...ULTRA.nearFilter.groundRampMetres]);
  assert.equal(u.ultraFacadeSlopeNormal.value, ULTRA.facade.slopeNormalScale);
  assert.deepEqual((u.ultraFacadeNlFade.value as THREE.Vector2).toArray(), [...ULTRA.facade.nlFade]);
  assert.equal(u.ultraFacadeGrazeSpread.value, ULTRA.facade.grazeSpread);
  assert.equal(u.ultraFacadeSpreadScale.value, ULTRA.facade.spreadScale);
  // The radius scales the live one (so the planted radius 0 stays hard), and widens only as the sun grazes.
  assert.ok(facade.includes('float ultraNear = radius * ( ultraFacadeSpreadScale + ultraFacadeGrazeSpread * ( 1.0 - smoothstep( 0.0, 0.5, ultraNL ) ) );'));
  // Final wave (P-LT): past 30 m it grows as the ground's does, still a multiple of the live radius.
  const farScale = ULTRA.facade.farSpreadTexels / ULTRA.nearRadius;
  assert.ok(facade.includes(`float ultraFar = max( ultraNear, radius * ${farScale.toFixed(6)} );`));
  assert.ok(facade.includes(`return mix( ultraNear, ultraFar, smoothstep( ${ULTRA.facade.farRampMetres[0].toFixed(6)}, ${ULTRA.facade.farRampMetres[1].toFixed(6)}, length( vViewPosition ) ) );`));
  assert.ok(ULTRA.facade.farRampMetres[0] >= 30, 'Wave 4\'s measured facades (23–27 m) keep their radius');
  // At the live 1.25 the taps stay ≤ ~1.5 texels apart (16 taps in a disk: spacing ≈ 0.44 × radius).
  assert.ok(ULTRA.nearRadius * (ULTRA.facade.spreadScale + ULTRA.facade.grazeSpread) * 0.443 <= 1.6);
  assert.equal(u.ultraFacadeReceiveBias.value, ULTRA.facade.receiveBiasMetres / (ULTRA.near.far - ULTRA.near.near));
  const sun = new THREE.DirectionalLight();
  sun.position.set(30, 40, 0);
  const rig = { ...shadowRigFor('ultra', 'high'), near: 2, far: 202 };
  updateUltraShared(shared, { sun, rig, far: null });
  assert.ok(Math.abs(u.ultraFacadeReceiveBias.value - ULTRA.facade.receiveBiasMetres / 200) < 1e-15);
});

test('Fable finding 8: the near-map fetches the Ultra cost report prints are the ground filter\'s own', () => {
  const fetches = ultraGroundShadowFetches();
  assert.equal(fetches.disk, ULTRA.nearFilter.taps);
  const context = contextFor();
  const lying = (): THREE.MeshStandardMaterial[] => [
    ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context),
    ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context),
    ultraHazardGroundMaterial({ roughness: 0.95 }, context),
    ultraWaterMaterial({ color: 0xffffff, roughness: 0.1 }, context),
  ];
  // A29: as shipped, the filter runs the plain disk once — `disk` compares, and no far-caster disk at any distance.
  for (const material of lying()) {
    const text = compile(material).fragmentShader;
    const family = String(material.userData.ultraFamily);
    const filter = blockAround(text, 'float ultraRamp = smoothstep( ultraGroundShadowRamp.x');
    assert.equal(filter.split('ultraDiskShadow(').length - 1, 1, `${family}: the shipped filter runs the disk other than once`);
    assert.ok(!text.includes('ultraGroundDiskShadow(') && !text.includes('ultraGroundKernelOn'), `${family}: the far-caster disk ships`);
    const disk = text.slice(text.indexOf('float ultraDiskShadow('), text.indexOf('float ultraEdgeSharpen('));
    assert.ok(disk.includes(`for ( int i = 0; i < ${fetches.disk}; i ++ ) {`), `${family}: the disk is not ${fetches.disk} taps`);
    assert.equal(disk.split('texture( map,').length - 1, 1, `${family}: a tap is not one compare`);
  }
  // The kernel's configuration (A28, Trade 2; built by its define): the far-caster disk as well.
  for (const material of lying().map(withScreenKernel)) {
    const text = compile(material).fragmentShader;
    const family = String(material.userData.ultraFamily);
    const disk = text.slice(text.indexOf('float ultraGroundDiskShadow('), text.indexOf('float ultraGroundShadow('));
    // One compare a tap, `disk` taps.
    assert.ok(disk.includes(`for ( int i = 0; i < ${fetches.disk}; i ++ ) {`), `${family}: the disk is not ${fetches.disk} taps`);
    assert.equal(disk.split('texture( map,').length - 1, 1, `${family}: a tap is not one compare`);
    // The filter runs that disk once, and once more (the far-caster test) only where the kernel is on.
    const filter = blockAround(text, 'float ultraRamp = smoothstep( ultraGroundShadowRamp.x');
    assert.equal(filter.split('ultraGroundDiskShadow(').length - 1, 2, `${family}: the disk runs other than twice`);
    const gated = blockAround(filter.slice(1), 'float ultraFarCaster = 1.0 - ultraGroundDiskShadow(');
    assert.ok(filter.includes(`if ( ultraGroundKernelOn > 0.5 ) ${gated}`), `${family}: the far-caster disk is not gated by the kernel`);
    assert.equal(fetches.farCaster, fetches.disk);
  }
});

test('A29: no shipped program compiles the ground\'s screen kernel — only its define brings it in, on the ground-lying families, under their own keys', () => {
  // Round 5 rejected A28's graded slab: the kernel, its far-caster disk and
  // the lift's lean diagonals are compiled out, not merely zeroed.
  assert.equal(ULTRA.nearFilter.groundScreenKernel, false);
  const kernelNames = ['ultraGroundScreenKernel', 'ultraGroundDiskShadow', 'ultraGroundPenumbraDepth', 'ultraGroundKernelX', 'ultraFarCaster', 'vec3 ultraRay = normalize( vViewPosition );'];
  // The lift's lean diagonals, where the lift runs (the ground and its paint).
  const leanName = 'ultraKernelA';
  const lifted = new Set(['ground', 'marking']);
  const lying = new Set(['ground', 'marking', 'hazard-ground', 'water']);
  let shipped = 0;
  let kernel = 0;
  for (const { label, material } of everyMaterial()) {
    const text = compile(material).fragmentShader;
    const family = String(material.userData.ultraFamily);
    if (label.includes('/kernel/')) {
      kernel += 1;
      assert.ok(lying.has(family), `${label}: the kernel on a family that does not lie on the ground`);
      assert.ok(groundScreenKernelCompiled(material));
      for (const name of kernelNames) assert.ok(text.includes(name), `${label}: the kernel's configuration lacks ${name}`);
      assert.equal(text.includes(leanName), lifted.has(family), `${label}: the lean's diagonals unlike the lift`);
      // The same family key: three folds the define into its own program key, so these never share a shipped program.
      assert.equal(material.customProgramCacheKey(), ultraProgramKey(family as Parameters<typeof ultraProgramKey>[0]));
    } else {
      shipped += 1;
      assert.ok(!groundScreenKernelCompiled(material), `${label} carries the kernel's define`);
      for (const name of [...kernelNames, leanName]) assert.ok(!text.includes(name), `${label}: ${name} is in a shipped program's text`);
    }
  }
  assert.ok(shipped > 150 && kernel === 5, `${shipped} shipped, ${kernel} kernel variants`);
});

// ---------------------------------------------------------------------------
// Fable finding 10: the ground's screen kernel, run
// ---------------------------------------------------------------------------

/** A GLSL value: a scalar, a vector, a column-major `mat2`, or an array (`vDirectionalShadowCoord`). */
type GlslValue = number | boolean | readonly number[] | { readonly mat2: readonly number[] } | { readonly items: readonly GlslValue[] };
/**
 * One value per lane of a 2×2 quad: the fragment, its right neighbour and
 * the one above it in window coordinates — the lanes a GPU differences for
 * `dFdx` / `dFdy` (coarse derivatives).
 */
type Lanes = readonly GlslValue[];

const GLSL_SWIZZLE: Readonly<Record<string, number>> = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };
const GLSL_TYPES = new Set(['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat2']);

function glslComponents(value: GlslValue): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return [...(value as readonly number[])];
  throw new Error('not a scalar or vector');
}

function glslBinary(op: string, a: GlslValue, b: GlslValue): GlslValue {
  if (op === '&&') return Boolean(a) && Boolean(b);
  if (op === '||') return Boolean(a) || Boolean(b);
  if (op === '<' || op === '>' || op === '<=' || op === '>=' || op === '==' || op === '!=') {
    const [x, y] = [a as number, b as number];
    return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : op === '>=' ? x >= y : op === '==' ? x === y : x !== y;
  }
  const apply = (x: number, y: number): number => (op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : x / y);
  const isMat = (value: GlslValue): value is { mat2: readonly number[] } => typeof value === 'object' && 'mat2' in (value as object);
  if (isMat(a) || isMat(b)) {
    assert.equal(op, '*', `mat2 ${op}`);
    if (isMat(a) && typeof b === 'number') return { mat2: a.mat2.map((m) => m * b) };
    if (typeof a === 'number' && isMat(b)) return { mat2: b.mat2.map((m) => a * m) };
    // Column-major, as GLSL: M * v sums the columns by v; v * M is the transpose's.
    if (isMat(a) && Array.isArray(b)) return [a.mat2[0] * b[0] + a.mat2[2] * b[1], a.mat2[1] * b[0] + a.mat2[3] * b[1]];
    if (Array.isArray(a) && isMat(b)) return [a[0] * b.mat2[0] + a[1] * b.mat2[1], a[0] * b.mat2[2] + a[1] * b.mat2[3]];
    throw new Error('mat2 * mat2 is not needed here');
  }
  const x = glslComponents(a);
  const y = glslComponents(b);
  if (typeof a === 'number' && typeof b === 'number') return apply(a, b);
  const size = Math.max(x.length, y.length);
  assert.ok((x.length === 1 || x.length === size) && (y.length === 1 || y.length === size), `${op} of mismatched sizes`);
  return Array.from({ length: size }, (_, i) => apply(x[x.length === 1 ? 0 : i], y[y.length === 1 ? 0 : i]));
}

function glslSmoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

function glslCall(name: string, args: readonly GlslValue[]): GlslValue {
  const v = (i: number): number[] => glslComponents(args[i]);
  const s = (i: number): number => args[i] as number;
  const constructed = (size: number): number[] => {
    const all = args.flatMap((arg) => glslComponents(arg));
    return all.length === 1 ? new Array<number>(size).fill(all[0]) : all.slice(0, size);
  };
  switch (name) {
    case 'vec2': return constructed(2);
    case 'vec3': return constructed(3);
    case 'vec4': return constructed(4);
    case 'mat2': return args.length === 1 ? { mat2: [s(0), 0, 0, s(0)] } : { mat2: [...v(0), ...v(1)] };
    case 'length': return Math.hypot(...v(0));
    case 'normalize': {
      const c = v(0);
      const l = Math.hypot(...c);
      return c.map((x) => x / l);
    }
    case 'dot': return v(0).reduce((sum, x, i) => sum + x * v(1)[i], 0);
    case 'max': return typeof args[0] === 'number' ? Math.max(s(0), s(1)) : v(0).map((x, i) => Math.max(x, v(1)[i]));
    case 'min': return typeof args[0] === 'number' ? Math.min(s(0), s(1)) : v(0).map((x, i) => Math.min(x, v(1)[i]));
    case 'smoothstep': return glslSmoothstep(s(0), s(1), s(2));
    default: throw new Error(`the evaluator has no ${name}()`);
  }
}

/**
 * A small GLSL evaluator for straight-line code (Fable finding 10: the
 * kernel's tests pinned its text, never what the text computes). It parses
 * the shipped text itself — declarations and assignments in a block, and
 * expressions with GLSL's precedence, swizzles, indexing, constructors and
 * column-major `mat2` — and runs every lane of a quad side by side, so `dFdx`
 * and `dFdy` are the GPU's own differences between the lanes. No control
 * flow, no functions of its own: what it cannot read, it refuses.
 */
function runGlsl(source: string, scope: Map<string, Lanes>, lanes: number): Map<string, Lanes> {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const tokens = code.match(/\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?|[A-Za-z_]\w*|&&|\|\||[<>=!]=|[-+*/]=|[-+*/<>=!?:.,;()[\]{}]/g) ?? [];
  let at = 0;
  const peek = (): string | undefined => tokens[at];
  const next = (): string => {
    const token = tokens[at];
    assert.ok(token !== undefined, 'the GLSL ends early');
    at += 1;
    return token;
  };
  const expect = (token: string): void => assert.equal(next(), token);
  const each = (...values: Lanes[]): ((f: (...lane: GlslValue[]) => GlslValue) => Lanes) =>
    (f) => Array.from({ length: lanes }, (_, l) => f(...values.map((value) => value[l])));
  const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];
  const expression = (): Lanes => {
    const condition = binary(0);
    if (peek() !== '?') return condition;
    next();
    const yes = expression();
    expect(':');
    const no = expression();
    return each(condition, yes, no)((c, y, n) => (c ? y : n));
  };
  const binary = (level: number): Lanes => {
    if (level === LEVELS.length) return unary();
    let left = binary(level + 1);
    while (LEVELS[level].includes(peek() ?? '')) {
      const op = next();
      const right = binary(level + 1);
      left = each(left, right)((a, b) => glslBinary(op, a, b));
    }
    return left;
  };
  const unary = (): Lanes => {
    if (peek() === '-') {
      next();
      return each(unary())((a) => glslBinary('*', -1, a));
    }
    return postfix();
  };
  const postfix = (): Lanes => {
    let value = primary();
    for (;;) {
      if (peek() === '.') {
        next();
        const picks = [...next()].map((letter) => GLSL_SWIZZLE[letter]);
        value = each(value)((a) => {
          const c = glslComponents(a);
          return picks.length === 1 ? c[picks[0]] : picks.map((i) => c[i]);
        });
      } else if (peek() === '[') {
        next();
        const index = expression();
        expect(']');
        value = each(value, index)((a, i) => (typeof a === 'object' && 'items' in (a as object)
          ? (a as { items: readonly GlslValue[] }).items[i as number] : glslComponents(a)[i as number]));
      } else {
        return value;
      }
    }
  };
  const primary = (): Lanes => {
    const token = next();
    if (token === '(') {
      const value = expression();
      expect(')');
      return value;
    }
    if (/^[\d.]/.test(token)) return new Array<GlslValue>(lanes).fill(Number(token));
    if (peek() === '(') {
      next();
      const args: Lanes[] = [];
      while (peek() !== ')') {
        args.push(expression());
        if (peek() === ',') next();
      }
      expect(')');
      if (token === 'dFdx' || token === 'dFdy') {
        assert.equal(lanes, 3, `${token} needs a quad`);
        const from = token === 'dFdx' ? 1 : 2;
        const difference = glslBinary('-', args[0][from], args[0][0]);
        return new Array<GlslValue>(lanes).fill(difference);
      }
      return each(...args)((...values) => glslCall(token, values));
    }
    const value = scope.get(token);
    assert.ok(value !== undefined, `the GLSL reads ${token}, which the case never set`);
    return value;
  };
  const statement = (): void => {
    if (peek() === '{') {
      next();
      while (peek() !== '}') statement();
      next();
      return;
    }
    if (GLSL_TYPES.has(peek() ?? '')) next();
    const name = next();
    const op = next();
    assert.ok(op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=', `unreadable statement at ${name} ${op}`);
    const value = expression();
    expect(';');
    const before = scope.get(name);
    scope.set(name, op === '=' ? value : each(before ?? [], value)((a, b) => glslBinary(op[0], a, b)));
  };
  while (at < tokens.length) statement();
  return scope;
}

/** The text of the `{ … }` block that holds `marker`, braces balanced. */
function blockAround(text: string, marker: string): string {
  const inside = text.indexOf(marker);
  assert.ok(inside >= 0, `${marker} not in the shader`);
  const open = text.lastIndexOf('{', inside);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') depth -= 1;
    if (depth === 0) return text.slice(open, i + 1);
  }
  throw new Error('unbalanced block');
}

test('Fable finding 10: the ground\'s screen kernel, run on known geometry — zero inside its ramp, a fixed angle, a 1.5 m cap, one ellipse for the filter and the lean', () => {
  const context = contextFor();
  // A29: the kernel is in no shipped program; its configuration is built by its define.
  assert.equal(ULTRA.nearFilter.groundScreenKernel, false, 'A29: the screen kernel ships off');
  assert.ok(!compile(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context)).fragmentShader.includes('vec3 ultraRay = normalize( vViewPosition );'));
  const fragment = compile(withScreenKernel(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context))).fragmentShader;
  const kernelText = blockAround(fragment, 'vec3 ultraRay = normalize( vViewPosition );');
  const disk = fragment.slice(fragment.indexOf('float ultraGroundDiskShadow('), fragment.indexOf('float ultraGroundShadow('));
  const screenLine = /mat2 ultraScreen = ([^;]+);/.exec(disk);
  const tapOffset = /texture\( map, vec3\( ([^;]+), coord\.z \) \);/.exec(disk);
  const blockerRef = /ultraGroundDiskShadow\( map, (vec3\( coord\.xy, [^)]+\)), size, ultraRadius, 2\.0 \)/.exec(fragment);
  assert.ok(screenLine !== null && tapOffset !== null && blockerRef !== null, 'the filter\'s kernel lines moved');

  const f = ULTRA.nearFilter;
  const angle = (f.groundScreenSpreadDegrees * Math.PI) / 180;
  const [ramp0, ramp1] = f.groundScreenRampMetres;
  // The sun of a town afternoon, from the front left: its light axes are turned from the view's.
  const sun = new THREE.DirectionalLight();
  sun.position.set(0.5, 0.75, -0.43).multiplyScalar(100);
  const rig = shadowRigFor('ultra', 'high');
  writeShadowRig(sun, rig);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  const light = (world: THREE.Vector3): THREE.Vector4 => new THREE.Vector4(world.x, world.y, world.z, 1).applyMatrix4(sun.shadow.matrix);

  /** One quad on flat ground: the kernel's outputs and what the camera and light say they should be. */
  const quad = (eye: number, pitchTo: number, metres: number, height: number) => {
    const width = Math.round((height * 16) / 9);
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, eye, 0);
    camera.lookAt(0, 0, pitchTo);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const along = Math.sqrt(metres * metres - eye * eye);
    const centre = new THREE.Vector3(0, 0, along).project(camera);
    // Window coordinates (y up), where dFdy differences upward.
    const sx = ((centre.x + 1) / 2) * width + 0.25;
    const sy = ((centre.y + 1) / 2) * height;
    const ground = (x: number, y: number): THREE.Vector3 => {
      const through = new THREE.Vector3((x / width) * 2 - 1, (y / height) * 2 - 1, 0.5).unproject(camera);
      const ray = through.sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(ray, -camera.position.y / ray.y);
    };
    const worlds = [ground(sx, sy), ground(sx + 1, sy), ground(sx, sy + 1)];
    const scope = new Map<string, Lanes>([
      ['vViewPosition', worlds.map((w) => w.clone().applyMatrix4(camera.matrixWorldInverse).negate().toArray())],
      ['vUltraWorld', worlds.map((w) => w.toArray())],
      ['vDirectionalShadowCoord', worlds.map((w) => ({ items: [light(w).toArray()] }))],
    ]);
    const out = runGlsl(kernelText, scope, 3);
    // The camera's own answer: the angle between neighbouring pixels' rays, the ground they span, the ramp.
    const rays = worlds.map((w) => w.clone().sub(camera.position).normalize());
    const pixelAngle = (rays[0].angleTo(rays[1]) + rays[0].angleTo(rays[2])) / 2;
    const footX = worlds[1].clone().sub(worlds[0]);
    const footY = worlds[2].clone().sub(worlds[0]);
    const distance = worlds[0].distanceTo(camera.position);
    const capBinds = f.groundScreenMaxMetres / Math.max(footX.length(), footY.length()) < angle / pixelAngle;
    const radius = Math.min(angle / pixelAngle, f.groundScreenMaxMetres / Math.max(footX.length(), footY.length()))
      * glslSmoothstep(ramp0, ramp1, distance);
    const uvX = [light(worlds[1]).x - light(worlds[0]).x, light(worlds[1]).y - light(worlds[0]).y];
    const uvY = [light(worlds[2]).x - light(worlds[0]).x, light(worlds[2]).y - light(worlds[0]).y];
    return {
      distance, radius, capBinds, pixelAngle, footX, footY, uvX, uvY, coord: light(worlds[0]),
      kernel: out.get('ultraGroundScreenKernel')?.[0] as { mat2: readonly number[] },
      kernelX: out.get('ultraGroundKernelX')?.[0] as readonly number[],
      kernelY: out.get('ultraGroundKernelY')?.[0] as readonly number[],
      on: out.get('ultraGroundKernelOn')?.[0] as number,
    };
  };
  const near = (actual: number, expected: number, scale: number, what: string): void => {
    assert.ok(Math.abs(actual - expected) <= 1e-6 * Math.max(scale, 1e-9), `${what}: ${actual}, expected ${expected}`);
  };

  // Inside the ramp's start: exactly nothing — the rider's shadow and every near edge keep their filter.
  const inside = quad(2.4, 20, ramp0 - 1, 1080);
  assert.ok([...inside.kernel.mat2, ...inside.kernelX, ...inside.kernelY].every((value) => value === 0),
    `the kernel is not zero inside ${ramp0} m`);
  assert.equal(inside.on, 0);

  const cases = [
    // A grazing chase view: the cap binds past the ramp's middle.
    { label: 'chase camera, mid-ramp', eye: 2.4, pitch: 20, metres: (ramp0 + ramp1) / 2 },
    { label: 'chase camera, 30 m', eye: 2.4, pitch: 20, metres: 30 },
    { label: 'chase camera, 45 m', eye: 2.4, pitch: 20, metres: 45 },
    // A steep view down from a height: the angle binds, not the cap.
    { label: 'steep view, 30 m', eye: 15, pitch: 20, metres: 30 },
  ];
  const measured = new Map<string, { radius: number; extent: number }>();
  const branches = new Set<string>();
  for (const { label, eye, pitch, metres } of cases) {
    for (const height of [1080, 2160]) {
      const q = quad(eye, pitch, metres, height);
      const what = `${label} @${height}`;
      assert.equal(q.on, 1, `${what}: the kernel is off`);
      // The world axes are the pixel's own ground footprint times the radius the camera predicts.
      const r = Math.hypot(...q.kernelX) / q.footX.length();
      near(r, q.radius, q.radius, `${what}: radius`);
      near(Math.hypot(...q.kernelY) / q.footY.length(), q.radius, q.radius, `${what}: radius along y`);
      const extent = Math.max(Math.hypot(...q.kernelX), Math.hypot(...q.kernelY));
      if (q.capBinds && metres >= ramp1) near(extent, f.groundScreenMaxMetres, 1, `${what}: the ${f.groundScreenMaxMetres} m cap`);
      if (!q.capBinds && metres >= ramp1) {
        assert.ok(extent < f.groundScreenMaxMetres, `${what}: the cap should not bind`);
        near(r * q.pixelAngle, angle, angle, `${what}: the kernel spans groundScreenSpreadDegrees`);
      }
      measured.set(what, { radius: r, extent });
      if (metres >= ramp1) branches.add(q.capBinds ? 'cap' : 'angle');
      // One ellipse: the filter's light-UV kernel is the lean's world axes seen by the light, and the
      // camera's own pixel-to-light differences times the radius (a transposed mat2 fails both).
      const kernel = q.kernel.mat2;
      near(kernel[0], q.uvX[0] * q.radius, Math.hypot(...q.uvX) * q.radius, `${what}: column x`);
      near(kernel[1], q.uvX[1] * q.radius, Math.hypot(...q.uvX) * q.radius, `${what}: column x`);
      near(kernel[2], q.uvY[0] * q.radius, Math.hypot(...q.uvY) * q.radius, `${what}: column y`);
      near(kernel[3], q.uvY[1] * q.radius, Math.hypot(...q.uvY) * q.radius, `${what}: column y`);
      // Each of the disk's taps, through the shipped tap expression (kernel 1, no light-space radius):
      // the light-UV offset of the screen offset `tap × radius` pixels.
      const scope = new Map<string, Lanes>([
        ['ultraGroundScreenKernel', [q.kernel]],
        ['kernel', [1]],
        ['coord', [[q.coord.x, q.coord.y, q.coord.z]]],
        ['ultraScale', [[0, 0]]],
      ]);
      runGlsl(`mat2 ultraScreen = ${screenLine[1]};`, scope, 1);
      for (const [tx, ty] of ultraDiskTaps()) {
        scope.set('ultraTap', [[tx, ty]]);
        const at = runGlsl(`vec2 ultraAt = ${tapOffset[1]};`, scope, 1).get('ultraAt')?.[0] as readonly number[];
        const offset = [at[0] - q.coord.x, at[1] - q.coord.y];
        // The lean's world offset for the same tap, seen by the light (orthographic: exactly linear).
        const world = new THREE.Vector3(...q.kernelX).multiplyScalar(tx).add(new THREE.Vector3(...q.kernelY).multiplyScalar(ty));
        const seen = light(world).sub(light(new THREE.Vector3()));
        const scale = Math.hypot(...offset);
        near(offset[0], seen.x, scale, `${what}: tap (${tx.toFixed(3)}, ${ty.toFixed(3)}) against the lean, x`);
        near(offset[1], seen.y, scale, `${what}: tap against the lean, y`);
        near(offset[0], (q.uvX[0] * tx + q.uvY[0] * ty) * q.radius, scale, `${what}: tap against the camera, x`);
        near(offset[1], (q.uvX[1] * tx + q.uvY[1] * ty) * q.radius, scale, `${what}: tap against the camera, y`);
      }
    }
  }
  assert.deepEqual([...branches].sort(), ['angle', 'cap'], 'the cases no longer reach both of the radius\'s bounds');
  // The same angle at any drawing buffer: twice the pixels, the same metres of ground.
  for (const { label, metres } of cases) {
    const one = measured.get(`${label} @1080`);
    const two = measured.get(`${label} @2160`);
    assert.ok(one !== undefined && two !== undefined);
    // (Loose: dFdx is a one-pixel forward difference, and a pixel at 45 m spans more of the ramp at 1080.)
    assert.ok(Math.abs(two.radius / one.radius - 2) < 0.05, `${label}: ${one.radius} → ${two.radius} px at twice the buffer`);
    assert.ok(Math.abs(two.extent / one.extent - 1) < 0.02, `${label} (${metres} m): ${one.extent} → ${two.extent} m of ground`);
  }

  // The far-caster test compares its disk groundScreenCasterMetres up the sun ray: the shipped
  // reference, with the shared uniform this sun and rig write, is that point's own light coordinate.
  const shared = createUltraShared();
  updateUltraShared(shared, { sun, rig, far: null });
  const up = sun.position.clone().sub(sun.target.position).normalize();
  const ground = new THREE.Vector3(3, 0, 25);
  const raised = ground.clone().addScaledVector(up, f.groundScreenCasterMetres / up.y);
  assert.ok(Math.abs(raised.y - f.groundScreenCasterMetres) < 1e-9);
  const coord = light(ground);
  const reference = runGlsl(`vec3 ultraRef = ${blockerRef[1]};`, new Map<string, Lanes>([
    ['coord', [[coord.x, coord.y, coord.z]]],
    ['ultraGroundPenumbraDepth', [shared.uniforms.ultraGroundPenumbraDepth.value as number]],
  ]), 1).get('ultraRef')?.[0] as readonly number[];
  const expected = light(raised);
  near(reference[0], expected.x, 1, 'the far-caster reference, x (the same light ray)');
  near(reference[1], expected.y, 1, 'the far-caster reference, y');
  near(reference[2], expected.z, 1, 'the far-caster reference depth: nearer the light by the caster height');
  assert.ok(reference[2] < coord.z, 'the far-caster reference is not nearer the light');
});

/**
 * A headless model of the hardware compare (final wave, P-LT; Fable F4): a
 * straight caster edge rasterised into a binary texel lattice, read through
 * bilinear compares at the disk's taps. Returns the ½ isoline's high-pass
 * ripple (its deviation from a 3-texel moving average: the per-texel beads)
 * and the 20–80 % penumbra width, both in texels, averaged over the angles.
 */
function edgeModel(filter: (lit: (x: number, y: number) => number, x: number, y: number) => number): { ripple: number; width: number } {
  const angles = [8, 22, 31].map((degrees) => (degrees * Math.PI) / 180);
  let ripple = 0;
  let width = 0;
  for (const angle of angles) {
    const n = [-Math.sin(angle), Math.cos(angle)];
    const t = [Math.cos(angle), Math.sin(angle)];
    const c = 0.3 + 100 * (n[0] + n[1]);
    const texel = (i: number, j: number): number => ((i + 0.5) * n[0] + (j + 0.5) * n[1] - c > 0 ? 1 : 0);
    const lit = (x: number, y: number): number => {
      const fx = x - 0.5;
      const fy = y - 0.5;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const ax = fx - i;
      const ay = fy - j;
      return (texel(i, j) * (1 - ax) + texel(i + 1, j) * ax) * (1 - ay) + (texel(i, j + 1) * (1 - ax) + texel(i + 1, j + 1) * ax) * ay;
    };
    const du = 0.05;
    const level = (u: number, value: number): number => {
      // Bisect along the normal for the isoline at `value` (lit rises along +n).
      let lo = -4;
      let hi = 4;
      for (let k = 0; k < 40; k += 1) {
        const d = (lo + hi) / 2;
        const x = 0.3 * n[0] + u * t[0] + d * n[0] + 100;
        const y = 0.3 * n[1] + u * t[1] + d * n[1] + 100;
        if (filter(lit, x, y) < value) lo = d; else hi = d;
      }
      return (lo + hi) / 2;
    };
    const half: number[] = [];
    let w = 0;
    for (let u = 0; u < 24; u += du) {
      half.push(level(u, 0.5));
      w += level(u, 0.8) - level(u, 0.2);
    }
    width += w / half.length;
    const window = Math.round(3 / du);
    let sum = 0;
    let count = 0;
    for (let k = window; k < half.length - window; k += 1) {
      let mean = 0;
      for (let m = k - window / 2; m < k + window / 2; m += 1) mean += half[m];
      sum += (half[k] - mean / window) ** 2;
      count += 1;
    }
    ripple += Math.sqrt(sum / count);
  }
  return { ripple: ripple / angles.length, width: width / angles.length };
}

test('final wave (P-LT, Fable F4): the ground reconstructs the near edge — a wider disk, its contrast restored — and hands it to the plain disk with distance', () => {
  const context = contextFor();
  const base = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_FOG: '' };
  const fragmentOf = (material: THREE.Material): string => preprocess(resolveIncludes(compile(material).fragmentShader), {
    ...base,
    ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])),
  });
  const widen = ULTRA.nearFilter.edgeWiden;
  assert.ok(widen > 1 && widen <= 2, 'the edge widening is on, and modest');
  const lo = 0.5 - 0.75 / widen;
  const hi = 0.5 + 0.75 / widen;
  const sharpen = (v: number): number => {
    const x = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    return x * x * (3 - 2 * x);
  };
  // The curve: 0 and 1 exactly, slope `widen` at ½, monotone.
  assert.equal(sharpen(0), 0);
  assert.equal(sharpen(1), 1);
  assert.ok(Math.abs((sharpen(0.5 + 1e-6) - sharpen(0.5 - 1e-6)) / 2e-6 - widen) < 1e-6);

  // The patch text carries that curve, baked, for the ground and its paint.
  const road = fragmentOf(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context));
  assert.ok(road.includes(`const float ultraEdgeWiden = ${widen.toFixed(6)};`));
  assert.ok(road.includes(`return smoothstep( ${lo.toFixed(8)}, ${hi.toFixed(8)}, lit );`));
  assert.ok(road.includes('return ultraEdgeSharpen( ultraDiskShadow( map, coord, size, radius * ultraEdgeWiden ) );'));
  // Nothing noisy: no screen-space or per-fragment turn.
  const filter = road.slice(road.indexOf('const float ultraEdgeWiden'), road.indexOf('uniform float ultraGroundShadowSpread;'));
  assert.ok(!filter.includes('interleavedGradientNoise') && !filter.includes('gl_FragCoord'));

  // The facade keeps Wave 4's plain disk (2.5–3.5 texels already; its combing measurements stand).
  const facade = fragmentOf(ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture() }, context, fakeMaps()));
  assert.ok(facade.includes('shadow = ultraDiskShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFacadeReceiveBias ), shadowMapSize, ultraFacadeShadowRadius( shadowRadius ) );'));
  assert.ok(!facade.includes('ultraGroundShadow('));

  // The same text is handed to the rider materials (P-RT), unguarded and self-contained.
  const snippet = ultraNearFilterGlsl();
  assert.ok(snippet.includes('float ultraNearEdgeShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size, const in float radius )'));
  assert.ok(!snippet.includes('#if') && !snippet.includes('uniform '));
  assert.equal(road.match(/float ultraNearEdgeShadow\(/g)?.length, 1, 'the ground declares the same filter once');

  // What it buys, in the headless model of the hardware compare: the beads
  // (the ½ isoline's per-texel ripple) fall by more than a third, and the
  // penumbra does not soften.
  const taps = ultraDiskTaps();
  const disk = (lit: (x: number, y: number) => number, x: number, y: number, radius: number): number => {
    let sum = 0;
    for (const [dx, dy, w] of taps) sum += w * lit(x + dx * radius, y + dy * radius);
    return sum;
  };
  const plain = edgeModel((lit, x, y) => disk(lit, x, y, ULTRA.nearRadius));
  const rebuilt = edgeModel((lit, x, y) => sharpen(disk(lit, x, y, ULTRA.nearRadius * widen)));
  assert.ok(rebuilt.ripple < 0.65 * plain.ripple, `beads ${rebuilt.ripple.toFixed(4)} against ${plain.ripple.toFixed(4)}`);
  assert.ok(rebuilt.width <= plain.width * 1.02, `penumbra ${rebuilt.width.toFixed(3)} against ${plain.width.toFixed(3)}`);
  // The planted radius 0 is still a hard stair-step: one bilinear compare, only sharpened.
  const planted = edgeModel((lit, x, y) => sharpen(disk(lit, x, y, 0)));
  assert.ok(planted.ripple > plain.ripple && planted.width < plain.width);
});

test('final wave (P-LT, round 3 item 4): a sun-facing facade in cast shade lifts its indirect light toward form shade; nothing else does', () => {
  const context = contextFor();
  const base = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_FOG: '' };
  const fragmentOf = (material: THREE.Material): string => preprocess(resolveIncludes(compile(material).fragmentShader), {
    ...base,
    ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])),
  });
  const lift = `if ( ultraCastShade > 0.0 ) reflectedLight.indirectDiffuse *= 1.0 + ${ULTRA.facade.castShadeLift.toFixed(6)} * ultraCastShade;`;
  const body = ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture() }, context, fakeMaps());
  const facade = fragmentOf(body);
  assert.ok(ULTRA.facade.castShadeLift > 0 && ULTRA.facade.castShadeLift <= ULTRA.shade.lift, 'no more than the ground\'s own lift');
  assert.ok(facade.includes(lift));
  // Sun-facing (the fill's own N·L ramp) shade from casters more than
  // liftCasterMetres up the sun ray: the near map compared that much nearer
  // the sun, only where getShadow found shade; no far-map gate (it streaked a
  // distant wall).
  assert.ok(facade.includes('float ultraCastShade = ultraFacadeTallShade * smoothstep( 0.0, 0.25, dot( geometryNormal, directionalLights[ 0 ].direction ) );'));
  const tallCall = 'if ( frustumTest && shadow < 1.0 ) ultraTallNear = 1.0 - ultraDiskShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFacadeCasterDepth ), shadowMapSize, ultraFacadeShadowRadius( shadowRadius ) );';
  const tallWrite = 'ultraFacadeTallShade = mix( 1.0 - ultraFarLit, ultraTallNear, ultraNearCover ) * shadowIntensity;';
  assert.ok(facade.indexOf(tallCall) > facade.indexOf('shadow = ultraDiskShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFacadeReceiveBias )'));
  assert.ok(facade.indexOf(tallWrite) > facade.indexOf('float ultraFarLit'));
  assert.ok(facade.indexOf(tallWrite) < facade.indexOf('return ultraSunVisibility;'));
  assert.ok(!facade.includes('ultraTallCaster') && !facade.includes('1.0 - ultraFarVisibility()'));
  // After the base AO, so the plinth keeps its grounding relative to the wall.
  assert.ok(facade.indexOf(lift) > facade.indexOf('reflectedLight.indirectDiffuse *= ultraOcclusion;'));
  // The caster test clears the facade's own relief along the ray, and is in the rig's depth units per frame.
  assert.ok(ULTRA.facade.liftCasterMetres > 4 * ULTRA.relief.revealDepth && ULTRA.facade.liftCasterMetres <= 3);
  const shared = createUltraShared();
  assert.equal(shared.uniforms.ultraFacadeCasterDepth.value, ULTRA.facade.liftCasterMetres / (ULTRA.near.far - ULTRA.near.near));
  const sun = new THREE.DirectionalLight();
  sun.position.set(30, 40, 0);
  updateUltraShared(shared, { sun, rig: { ...shadowRigFor('ultra', 'high'), near: 2, far: 202 }, far: null });
  assert.ok(Math.abs(shared.uniforms.ultraFacadeCasterDepth.value - ULTRA.facade.liftCasterMetres / 200) < 1e-15);

  // The same on ultra-lit (no far map).
  const lit = fragmentOf(ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture() }, contextFor(ULTRA_LIT), fakeMaps()));
  assert.ok(lit.includes(lift));

  // Nothing else takes it: caps, furniture, foliage, the ground, blocks, and the -lighting facade.
  const others = [
    ultraPropMaterial('buildingCap', { roughness: 0.9, metalness: 0, map: null }, context, null),
    ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, context, null),
    ultraPropMaterial('crown', { roughness: 0.9, metalness: 0, map: null }, context, null),
    ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context),
    ultraBlockMaterial(materialAppearance('concrete'), 'concrete', context),
    ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture() }, contextFor(ULTRA_FULL, { lighting: false }), fakeMaps()),
  ];
  for (const material of others) assert.ok(!fragmentOf(material).includes('ultraCastShade'), `${material.userData.ultraFamily} took the facade lift`);
});

test('Wave 4 (R-L): the far-map helper answers for a point up the sun ray, and at 0 is the plain lookup', () => {
  const context = contextFor();
  const defines = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_FOG: '' };
  const trunk = preprocess(resolveIncludes(compile(ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, context, null)).fragmentShader), { ...defines, ULTRA_FAR: '' });
  assert.ok(trunk.includes('float ultraFarVisibilityToward( const in float towardSun ) {'));
  assert.ok(trunk.includes('vec4 farCoord = ultraFarMatrix * vec4( vUltraWorld + ultraShadeNormal * ultraFarNormalOffset + ultraSunDirection * towardSun, 1.0 );'));
  assert.ok(trunk.includes('return ultraFarVisibilityToward( 0.0 );'));
  // Still four bilinear compare fetches in all.
  assert.equal((trunk.match(/textureLod\( ultraFarMap,/g) ?? []).length, 4);
  // With no far map it is 1 and declares nothing it cannot read.
  const lit = preprocess(resolveIncludes(compile(ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, contextFor(ULTRA_LIT), null)).fragmentShader), defines);
  const helper = lit.slice(lit.indexOf('float ultraFarVisibilityToward('), lit.indexOf('float ultraFarVisibility()'));
  assert.ok(!helper.includes('ultraFarMap') && helper.includes('return 1.0;'));
});

test('Wave 3 (R-L): the hazard-read props take less of the environment, per material, in the same program', () => {
  const context = contextFor();
  const responseOf = (material: THREE.Material): number => Number(compile(material).uniforms.ultraEnvResponse.value);
  const metal = { roughness: 0.45, metalness: 0.65, map: null };
  const rubber = { roughness: 0.95, metalness: 0, map: null };
  const cap = ultraPropMaterial('bollardCap', metal, context, null);
  const tyre = ultraPropMaterial('tyreStack', rubber, context, null);
  const lamp = ultraPropMaterial('lampPost', metal, context, null);
  assert.equal(responseOf(cap), ULTRA.hazardRead.bollardCap);
  assert.equal(responseOf(tyre), ULTRA.hazardRead.tyreStack);
  assert.ok(ULTRA.hazardRead.bollardCap < 1 && ULTRA.hazardRead.tyreStack < 1);
  assert.equal(responseOf(lamp), 1);
  assert.equal(cap.userData.ultraEnvResponse, ULTRA.hazardRead.bollardCap);
  for (const part of PARTS) {
    if (part === 'bollardCap' || part === 'tyreStack') continue;
    assert.equal(responseOf(ultraPropMaterial(part, rubber, context, null)), 1, `${part} lost its environment`);
  }
  assert.equal(responseOf(ultraGroundMaterial(materialAppearance('grass'), 'grass', context)), 1);
  // A uniform, not a define: the bollard's finial shares the lamp's program.
  assert.deepEqual(cap.defines, lamp.defines);
  assert.equal(cap.customProgramCacheKey(), lamp.customProgramCacheKey());
  // The -lighting diagnostic keeps every response whole.
  assert.equal(responseOf(ultraPropMaterial('bollardCap', metal, contextFor(ULTRA_FULL, { lighting: false }), null)), 1);
  // It scales the fill and the reflection, after every other fill edit.
  const defines = { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '', USE_FOG: '' };
  const text = preprocess(resolveIncludes(compile(cap).fragmentShader), { ...defines, ULTRA_FAR: '' });
  const fill = text.indexOf('iblIrradiance *= ultraEnvResponse;');
  assert.ok(fill > text.indexOf('iblIrradiance = mix( dot( iblIrradiance, ultraLuma ) * ultraHue, iblIrradiance, ultraKeep );'));
  assert.ok(text.indexOf('radiance *= ultraEnvResponse;') > fill);
});

test('Wave 3 (R-L): glass mirroring the ground below the horizon keeps glassGroundReflect of it', () => {
  const context = contextFor();
  const body = ultraPropMaterial('buildingBody', { roughness: 0.92, metalness: 0, map: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, context, fakeMaps());
  assert.ok('ULTRA_GLASS' in body.defines!);
  const defines = { ...threeDefines({ instanced: true, shadows: true, maps: true }), STANDARD: '', USE_FOG: '' };
  const text = preprocess(resolveIncludes(compile(body).fragmentShader), { ...defines, ULTRA_GLASS: '', ULTRA_BASE_AO: '', ULTRA_RELIEF: '', ULTRA_FAR: '' });
  assert.ok(text.includes('radiance *= mix( 1.0, mix( ultraGlassGroundReflect, 1.0, ultraAbove ), texelRoughness.a );'));
  assert.equal(createUltraShared().uniforms.ultraGlassGroundReflect.value, ULTRA.specular.glassGroundReflect);
  // Nothing but glass reads it.
  const trunk = preprocess(resolveIncludes(compile(ultraPropMaterial('trunk', { roughness: 0.9, metalness: 0, map: null }, context, null)).fragmentShader), { ...threeDefines({ instanced: true, shadows: true, maps: false }), STANDARD: '' });
  assert.ok(!trunk.includes('ultraGlassGroundReflect'));
});

test('tuneUltraShared writes absolutely and holds the spec’s two caps', () => {
  const shared = createUltraShared();
  tuneUltraShared(shared, {
    ...defaultUltraLive(),
    glassSpec: 2.2,
    waterSpec: 0.6,
    contactStrength: 1.2,
    contactDirectShare: 0.9,
    foliageWrap: 0.4,
    foliageTransmission: 0.5,
    specAA: 0.5,
    shadeLift: 2.4,
    shadeLiftFar: -1,
  });
  const u = shared.uniforms;
  // Final touch: the static-shade lift's two, as they come (floored at no lift).
  assert.equal(u.ultraShadeLift.value, 2.4);
  assert.equal(u.ultraShadeLiftFar.value, 0);
  assert.equal(u.ultraGlassSpec.value, 2.2);
  assert.equal(u.ultraWaterSpec.value, 0.6);
  assert.equal(u.ultraContactStrength.value, 1.2);
  assert.equal(u.ultraContactDirect.value, 0.3);
  assert.equal(u.ultraFoliageWrap.value, 0.4);
  assert.equal(u.ultraFoliageTransmission.value, 0.22);
  assert.equal(u.ultraSpecAA.value, 0.5);
  // Twice is the same as once: no accumulation.
  tuneUltraShared(shared, defaultUltraLive());
  tuneUltraShared(shared, defaultUltraLive());
  assert.equal(u.ultraGlassSpec.value, ULTRA.glassSpec);
  assert.equal(u.ultraShadeLift.value, ULTRA.shade.lift);
  assert.equal(u.ultraShadeLiftFar.value, ULTRA.shade.liftFar);
});

test('updateUltraShared writes the fade band, the sun and the far map — or no far map', () => {
  const shared = createUltraShared();
  const sun = new THREE.DirectionalLight();
  sun.position.set(30, 40, 0);
  sun.target.position.set(0, 0, 0);

  updateUltraShared(shared, { sun, rig: shadowRigFor('ultra', 'high'), far: null });
  const u = shared.uniforms;
  assert.ok(Math.abs(u.ultraNearFade.value - 0.06) < 1e-12);
  assert.ok((u.ultraSunDirection.value as THREE.Vector3).distanceTo(new THREE.Vector3(0.6, 0.8, 0)) < 1e-12);
  assert.equal(u.ultraFarEnabled.value, 0);
  // F-A3: no far map is the empty far map, never null (three would bind a never-uploaded one).
  assert.equal(u.ultraFarMap.value, emptyFarShadowMap());
  // A28: the ground screen kernel's far-caster height, up the ray (sun y 0.8), in the rig's depth units.
  const rig = shadowRigFor('ultra', 'high');
  assert.ok(Math.abs(u.ultraGroundPenumbraDepth.value - ULTRA.nearFilter.groundScreenCasterMetres / 0.8 / (rig.far - rig.near)) < 1e-12);

  // The ordinary rig turns the fade off entirely (the -lighting diagnostic).
  updateUltraShared(shared, { sun, rig: shadowRigFor('ordinary', 'high'), far: null });
  assert.equal(u.ultraNearFade.value, 0);

  // An unbuilt far map is no far map.
  const far = new UltraFarShadow(2048);
  updateUltraShared(shared, { sun, rig: shadowRigFor('ultra', 'high'), far });
  assert.equal(u.ultraFarEnabled.value, 0);
  assert.equal(u.ultraFarMap.value, emptyFarShadowMap());

  // A built one (faked: the fields the writer reads).
  const depth = new THREE.DepthTexture(4, 4);
  const built = {
    texture: depth,
    matrix: new THREE.Matrix4().makeScale(2, 3, 4),
    texelMetres: 0.4,
    mapSize: 2048,
  } as unknown as UltraFarShadow;
  updateUltraShared(shared, { sun, rig: shadowRigFor('ultra', 'high'), far: built });
  assert.equal(u.ultraFarEnabled.value, 1);
  assert.equal(u.ultraFarMap.value, depth);
  assert.deepEqual((u.ultraFarMatrix.value as THREE.Matrix4).elements, built.matrix.elements);
  assert.ok(Math.abs(u.ultraFarNormalOffset.value - 0.4 * ULTRA.farShadow.normalOffsetTexels) < 1e-12);
  assert.ok(Math.abs(u.ultraFarEdge.value - ULTRA.farShadow.fadeMetres / (0.4 * 2048)) < 1e-12);

  // And gone again (a world swap onto one with nothing on layer 5): the empty map, not null.
  updateUltraShared(shared, { sun, rig: shadowRigFor('ultra', 'high'), far: null });
  assert.equal(u.ultraFarEnabled.value, 0);
  assert.equal(u.ultraFarMap.value, emptyFarShadowMap());
});

/**
 * A28, F-A3 — the sampler sweep. Every sampler an Ultra patch declares itself
 * (a live `uniform sampler*` named `ultra…` once the program is preprocessed
 * with its material's defines and a shadowed draw's) must be handed a texture
 * at every point its program can draw: straight from `createUltraShared`,
 * after a frame with no far map, with an unbuilt one, with a built one and
 * with it gone again. `null` is never acceptable: three binds a never-uploaded
 * empty texture for it, and for a `sampler2DShadow` ANGLE then rejects every
 * draw of the program. A shadow sampler's texture is a compare-mode depth
 * texture; any texture the patch owns is flagged for upload (`version > 0`).
 * three's own samplers (`map`, `normalMap`, `envMap`, `directionalShadowMap`)
 * are declared only for what three itself binds, and are not the patches'.
 */
test('F-A3 sweep: every sampler an Ultra patch declares is handed an uploaded texture, never null, with or without a far map', () => {
  const samplerDeclaration = /\buniform\s+(?:(?:highp|mediump|lowp)\s+)?(sampler\w*)\s+(ultra\w*)\s*;/g;
  const declaredIn = (shader: FakeShader, defines: Record<string, string>): Map<string, string> => {
    const out = new Map<string, string>();
    for (const stage of [shader.vertexShader, shader.fragmentShader]) {
      for (const match of preprocess(resolveIncludes(stage), defines).matchAll(samplerDeclaration)) out.set(match[2], match[1]);
    }
    return out;
  };
  const expectBound = (where: string, shader: FakeShader, samplers: Map<string, string>, far: THREE.DepthTexture | null): void => {
    for (const [name, type] of samplers) {
      const uniform = shader.uniforms[name] as THREE.IUniform | undefined;
      const value = uniform?.value as THREE.Texture | null | undefined;
      assert.ok(value instanceof THREE.Texture, `${where}: ${type} ${name} is handed ${uniform === undefined ? 'no uniform' : String(value)}`);
      if (type === 'sampler2DShadow') {
        const depth = value as THREE.DepthTexture;
        assert.equal(depth.isDepthTexture, true, `${where}: ${name} is not a depth texture`);
        assert.notEqual(depth.compareFunction, null, `${where}: ${name} is not in compare mode`);
        if (far !== null) {
          assert.equal(value, far, `${where}: ${name} is not the far map`);
        } else {
          assert.equal(value, emptyFarShadowMap(), `${where}: ${name} is not the empty far map`);
          assert.ok(value.version > 0, `${where}: ${name}'s empty far map is never uploaded`);
        }
      } else {
        assert.ok(value.version > 0, `${where}: ${type} ${name} is never uploaded`);
      }
    }
  };
  const definesFor = (material: THREE.Material, instanced: boolean): Record<string, string> => {
    const standard = material instanceof THREE.MeshStandardMaterial;
    const maps = standard && (material as THREE.MeshStandardMaterial).normalMap !== null;
    return {
      ...threeDefines({ instanced, shadows: true, maps }),
      ...(standard ? { STANDARD: '' } : { DEPTH_PACKING: '3200' }),
      ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])),
    };
  };

  // Every family, plus the far map switched on explicitly (whatever it ships as).
  const far = contextFor(ULTRA_FULL, { farShadow: true });
  const materials = [
    ...everyMaterial(),
    { label: 'far/ground', material: ultraGroundMaterial(materialAppearance('pavement'), 'pavement', far, GROUND_DETAIL), instanced: false },
    { label: 'far/field', material: ultraGroundMaterial(materialAppearance('grass'), 'field', far, GROUND_DETAIL), instanced: false },
    { label: 'far/block', material: ultraBlockMaterial(materialAppearance('concrete'), 'concrete', far), instanced: false },
    { label: 'far/facade', material: ultraPropMaterial('buildingBody', { roughness: 1, metalness: 0, map: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, far, fakeMaps()), instanced: true },
    { label: 'far/crown', material: ultraPropMaterial('crown', { roughness: 1, metalness: 0, map: null }, far, null), instanced: true },
    { label: 'far/bench', material: ultraPropMaterial('benchMetal', { roughness: 0.4, metalness: 0.6, map: null }, far, null), instanced: true },
    { label: 'far/water', material: ultraWaterMaterial({ color: 0xffffff, roughness: 0.1, vertexColors: true }, far), instanced: false },
    { label: 'far/marking', material: ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, far), instanced: false },
    { label: 'far/hazard', material: ultraHazardGroundMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true }, far), instanced: false },
  ];
  const compiled = materials.map(({ label, material, instanced }) => {
    const shader = compile(material);
    return { label, shader, samplers: declaredIn(shader, definesFor(material, instanced)) };
  });

  // 1. Before any frame hook has run: what `createUltraShared` hands over.
  for (const each of compiled) expectBound(`${each.label} (no frame yet)`, each.shader, each.samplers, null);

  // 2. The frame hook's far states, written through each program's own uniforms.
  const sun = new THREE.DirectionalLight();
  sun.position.set(30, 40, 0);
  const rig = shadowRigFor('ultra', 'high');
  const depth = new THREE.DepthTexture(4, 4);
  depth.compareFunction = THREE.LessEqualCompare;
  const built = { texture: depth, matrix: new THREE.Matrix4(), texelMetres: 0.4, mapSize: 2048 } as unknown as UltraFarShadow;
  const states: readonly [string, UltraFarShadow | null, THREE.DepthTexture | null][] = [
    ['no far map', null, null],
    ['an unbuilt far map (nothing on layer 5)', new UltraFarShadow(1024), null],
    ['a built far map', built, depth],
    ['the far map gone again', null, null],
  ];
  let checked = 0;
  for (const each of compiled) {
    // A program with no sampler of ours (the relief depth material, which
    // takes no shared uniforms at all) has nothing to bind.
    if (each.samplers.size === 0) continue;
    const shared = { uniforms: each.shader.uniforms } as unknown as UltraShared;
    for (const [state, frameFar, bound] of states) {
      updateUltraShared(shared, { sun, rig, far: frameFar });
      expectBound(`${each.label} (${state})`, each.shader, each.samplers, bound);
      checked += each.samplers.size;
    }
  }
  const seen = new Set(compiled.flatMap((each) => [...each.samplers.keys()]));
  assert.ok(seen.has('ultraFarMap'), 'no program declared the far sampler: the sweep measured nothing');
  assert.ok(seen.has('ultraDetailBroad'), 'no program declared the ground detail samplers');
  const known = new Set(['ultraFarMap', 'ultraDetailGrass', 'ultraDetailStone', 'ultraDetailSoil', 'ultraDetailBroad']);
  for (const name of seen) assert.ok(known.has(name), `a new Ultra sampler, ${name}: add it to this sweep and to FS's table`);
  assert.ok(checked > 1000, `only ${checked} sampler bindings checked`);

  // 3. The held rider, wheel and cop (F-A1, `ultraRiderShadow.ts`): their far
  //    sampler is in the program only with a far map, and is then bound to it.
  const world = createUltraShared();
  const light = riderLightUniforms(() => world);
  const held = (): { shader: FakeShader; samplers: Map<string, string> } => {
    const material = new THREE.MeshStandardMaterial();
    holdRiderShadow(material, light);
    const shader = compile(material);
    return { shader, samplers: declaredIn(shader, definesFor(material, false)) };
  };
  assert.deepEqual([...held().samplers.keys()], [], 'a held rider declares a far sampler before any frame');
  updateUltraShared(world, { sun, rig, far: new UltraFarShadow(1024) });
  assert.deepEqual([...held().samplers.keys()], [], 'a held rider declares a far sampler with nothing on layer 5');
  updateUltraShared(world, { sun, rig, far: built });
  const lit = held();
  assert.deepEqual([...lit.samplers.entries()], [['ultraRiderFarMap', 'sampler2DShadow']]);
  expectBound('held rider (a built far map)', lit.shader, lit.samplers, depth);
});

test('F-A3: the empty far map is a 1×1 compare depth texture that always answers lit, flagged for upload, and survives its release', () => {
  const empty = emptyFarShadowMap();
  assert.equal(emptyFarShadowMap(), empty, 'one per module');
  assert.equal(empty.isDepthTexture, true);
  assert.deepEqual([empty.image.width, empty.image.height], [1, 1]);
  assert.equal(empty.format, THREE.DepthFormat);
  assert.equal(empty.type, THREE.UnsignedIntType);
  // Compare mode is what a sampler2DShadow's unit needs; ALWAYS makes every
  // lookup 1 (lit) whatever the texel holds — no far map means no far shade.
  assert.equal(empty.compareFunction, THREE.AlwaysCompare);
  assert.equal(empty.generateMipmaps, false);
  assert.equal(empty.minFilter, THREE.NearestFilter);
  assert.ok(empty.version > 0, 'three would never upload it, which is the defect itself');
  assert.equal(empty.name, 'ultra-far-shadow-empty');
});

test('water follows the scene environment itself, at environmentIntensity × waterSpec', () => {
  const context = contextFor();
  const water = ultraWaterMaterial({ color: 0xffffff, roughness: 0.1, vertexColors: true }, context);
  const scene = new THREE.Scene();
  const environment = new THREE.Texture();
  scene.environment = environment;
  scene.environmentIntensity = 0.35;
  const call = (): void => water.onBeforeRender(
    {} as THREE.WebGLRenderer, scene, new THREE.PerspectiveCamera(), new THREE.BufferGeometry(), new THREE.Mesh(), {} as THREE.Group,
  );
  call();
  assert.equal(water.envMap, environment);
  assert.ok(Math.abs(water.envMapIntensity - 0.35 * ULTRA.waterSpec) < 1e-12);
  tuneUltraShared(context.shared, { ...defaultUltraLive(), waterSpec: 1.2 });
  call();
  assert.ok(Math.abs(water.envMapIntensity - 0.35 * 1.2) < 1e-12);
  // Torn down: the water's environment goes with the scene's.
  scene.environment = null;
  call();
  assert.equal(water.envMap, null);

  // -lighting keeps the ordinary behaviour: no hook, no explicit map.
  const plain = ultraWaterMaterial({ roughness: 0.1 }, contextFor(ULTRA_FULL, { lighting: false }));
  plain.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.PerspectiveCamera(), new THREE.BufferGeometry(), new THREE.Mesh(), {} as THREE.Group);
  assert.equal(plain.envMap, null);
});

test('the attribute names are the published contract', () => {
  // The ground's edge attributes are the ground patch's own
  // (ultraGroundDetail.test.ts pins them); this patch declares these.
  assert.deepEqual({ ...ULTRA_ATTRIBUTES }, { ao: 'ultraAo', relief: 'ultraRelief' });
  // Each attribute appears in the vertex patch under a define.
  const vertex = patchUltraVertex(THREE.ShaderLib.standard.vertexShader);
  for (const name of Object.values(ULTRA_ATTRIBUTES)) {
    assert.ok(new RegExp(`attribute (float|vec2|vec3) ${name};`).test(vertex), `${name} is not declared`);
  }
});
