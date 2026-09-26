/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { materialAppearance, type MaterialId } from '../../data/surfaces.ts';
import { ULTRA } from '../../data/tuning.ts';
import { ULTRA_GROUND_ATTRIBUTES } from './groundContact.ts';
import {
  createUltraGroundDetail,
  GROUND_DETAIL_KIND,
  groundDetailKind,
  groundScreenKernelCompiled,
  installUltraGroundPatch,
  paintBroadDetail,
  paintedGroundDetail,
  paintGrassDetail,
  paintSoilDetail,
  paintStoneDetail,
  patchUltraGroundFragment,
  patchUltraGroundVertex,
  smoothSampleNormals,
  ULTRA_CONTACT_SLOTS,
  ULTRA_CONTACT_VEC4_PER_SLOT,
  ULTRA_GROUND,
  ULTRA_GROUND_ANCHORS,
  ULTRA_GROUND_EDGE_ATTRIBUTES,
  ULTRA_GROUND_SCREEN_KERNEL,
  ultraDetailMapsSampled,
  ultraLiftFarFetches,
  ultraLiftSurfaceShare,
  undulationScale,
} from './ultraGroundDetail.ts';
import {
  createUltraShared, patchUltraFragment, patchUltraVertex, ultraBlockMaterial, ultraGroundMaterial, ultraMarkingMaterial,
} from './ultraMaterials.ts';
import { applyKitOverride, ULTRA_FULL } from './ultraRecipe.ts';
import type { UltraBuildContext, UltraKitOverride } from './ultraTypes.ts';

/**
 * The Ultra ground's own surface — M39 pre-R1 ground pass
 * (`docs/M39_ULTRA.md` §U2 "Pre-R1 ground (G)").
 *
 * What node can hold, in the order the brief states the promises:
 *
 * - **Procedural, deterministic, mean-preserving.** The maps are painted from
 *   integer hashes (no asset, no `Math.random`), repaint to the same bytes,
 *   and every channel of every level but the 1 × 1 one averages exactly
 *   127.5 — so a `2t − 1` decode is zero-mean and an albedo multiplier built
 *   from it preserves each colour channel's mean at every distance.
 * - **Mipmapped, calming with distance.** Each fine level carries no more
 *   contrast than the one above it.
 * - **The road gets nothing.** Pavement and rough pavement are kind 0 and the
 *   patch returns neutral for it; dirt (Switchback's riding surface) takes
 *   relief only.
 * - **The patch compiles as the GPU would read it**: its anchors are in the
 *   pinned three text, it declares every Ultra name it uses exactly once, its
 *   varyings are written by the vertex stage, and nothing global moves.
 * - **Budget.** The maps' bytes are what the ledger is told, far inside the
 *   pass's 24 MiB.
 * - **Smoothed slopes** hold every road-touching sample to the bit.
 */

const THREE_ROOT = join(import.meta.dirname, '..', '..', '..', 'node_modules', 'three');
const SHADERS = join(THREE_ROOT, 'src', 'renderers', 'shaders');

function contextFor(override: UltraKitOverride | null = null): UltraBuildContext {
  return { recipe: applyKitOverride(ULTRA_FULL, override), shared: createUltraShared(), maxAnisotropy: 1 };
}

/** A29: A28's Trade-2 configuration — the ground filter's screen kernel and the lean's diagonals — built by its define (none ships). */
function withScreenKernel<T extends THREE.Material>(material: T): T {
  material.defines = { ...(material.defines ?? {}), [ULTRA_GROUND_SCREEN_KERNEL]: '' };
  return material;
}

interface FakeShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
}

function compile(material: THREE.Material): FakeShader {
  const lib = THREE.ShaderLib.standard;
  const shader: FakeShader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

// ---------------------------------------------------------------------------
// A small GLSL preprocessor + linter (the shape of ultraMaterials.test.ts's)
// ---------------------------------------------------------------------------

function resolveIncludes(source: string): string {
  return source.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_match, name: string) => {
    const chunk = (THREE.ShaderChunk as Record<string, string>)[name];
    if (chunk === undefined) throw new Error(`unknown chunk ${name}`);
    return resolveIncludes(chunk);
  });
}

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

function preprocess(source: string, initial: Record<string, string>): string {
  const defines = new Map(Object.entries(initial));
  const lines = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '').split('\n');
  const out: string[] = [];
  const stack: [boolean, boolean, boolean][] = [];
  const active = (): boolean => stack.every((frame) => frame[0]);
  for (const raw of lines) {
    const directive = /^#\s*(\w+)\s*(.*)$/.exec(raw.trim());
    if (directive === null) {
      if (active()) out.push(raw);
      continue;
    }
    const [, name, rest] = directive;
    if (name === 'ifdef' || name === 'ifndef' || name === 'if') {
      const parent = active();
      const value = name === 'ifdef' ? defines.has(rest.trim()) : name === 'ifndef' ? !defines.has(rest.trim()) : evaluate(rest, defines);
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

function lint(active: string, stage: string): { declared: Set<string>; globals: Map<string, number>; varyings: Set<string>; used: Set<string> } {
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
  const declared = new Set<string>();
  const globals = new Map<string, number>();
  const varyings = new Set<string>();
  const declaration = new RegExp(`\\b(?:(uniform|attribute|varying)\\s+)?(?:(?:highp|mediump|lowp)\\s+)?(?:const\\s+)?(?:in\\s+|out\\s+)?(?:${TYPES})\\s+(\\w+)`, 'g');
  for (const match of active.matchAll(declaration)) {
    declared.add(match[2]);
    if (match[1] !== undefined) globals.set(match[2], (globals.get(match[2]) ?? 0) + 1);
    if (match[1] === 'varying') varyings.add(match[2]);
  }
  const used = new Set<string>();
  for (const match of active.matchAll(/\b(v?[uU]ltra\w*)\b/g)) used.add(match[1]);
  for (const match of active.matchAll(new RegExp(`\\b(?:void|${TYPES})\\s+(ultra\\w*)\\s*\\(`, 'g'))) {
    const name = match[1];
    const firstUse = active.search(new RegExp(`\\b${name}\\s*\\(`));
    assert.equal(firstUse, (match.index ?? 0) + match[0].indexOf(name), `${stage}: ${name} is called before it is defined`);
  }
  return { declared, globals, varyings, used };
}

function threeDefines(shadows: boolean): Record<string, string> {
  return {
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
    NUM_DIR_LIGHT_SHADOWS: shadows ? '1' : '0',
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
    STANDARD: '',
    ...(shadows ? { USE_SHADOWMAP: '', SHADOWMAP_TYPE_PCF: '' } : {}),
  };
}

const GROUND: readonly (MaterialId | 'field')[] = ['pavement', 'roughPavement', 'brick', 'grass', 'gravel', 'dirt', 'wood', 'spill', 'field'];

// ---------------------------------------------------------------------------
// The painted maps
// ---------------------------------------------------------------------------

test('the maps are procedural: no image asset, no Math.random, and repainting gives the same bytes', () => {
  const source = readFileSync(join(import.meta.dirname, 'ultraGroundDetail.ts'), 'utf8');
  assert.ok(!/Math\.random\s*\(/.test(source), 'Math.random in the ground painter');
  assert.ok(!/\.(png|jpe?g|webp|ktx2?)\b/i.test(source), 'an image asset in the ground painter');
  const cached = paintedGroundDetail();
  assert.equal(paintedGroundDetail(), cached, 'the painted chains are not cached');
  for (const [name, paint] of [['grass', paintGrassDetail], ['stone', paintStoneDetail], ['soil', paintSoilDetail], ['broad', paintBroadDetail]] as const) {
    const again = paint();
    assert.equal(again.length, cached[name].length);
    for (let level = 0; level < again.length; level += 1) {
      assert.ok(Buffer.from(again[level]).equals(Buffer.from(cached[name][level])), `${name} level ${level} differs on repaint`);
    }
  }
});

test('every channel of every level averages exactly 127.5, so every decoded term is zero-mean', () => {
  const painted = paintedGroundDetail();
  for (const [name, chain] of Object.entries(painted)) {
    let edge = Math.round(Math.sqrt(chain[0].length / 4));
    assert.equal(chain.length, Math.log2(edge) + 1, `${name} lacks a full chain`);
    for (let level = 0; level < chain.length; level += 1) {
      const data = chain[level];
      assert.equal(data.length, edge * edge * 4, `${name} level ${level} is the wrong size`);
      if (edge > 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          let sum = 0;
          for (let i = channel; i < data.length; i += 4) sum += data[i];
          assert.equal(sum, 127.5 * edge * edge, `${name} level ${level} channel ${channel} is not mean-preserving`);
        }
      }
      edge = Math.max(1, edge >> 1);
    }
  }
});

test('the fine maps calm with distance: no level carries more contrast than the one above', () => {
  const painted = paintedGroundDetail();
  for (const name of ['grass', 'stone', 'soil'] as const) {
    const chain = painted[name];
    let previous = Infinity;
    for (let level = 0; level < chain.length - 1; level += 1) {
      const data = chain[level];
      let variance = 0;
      for (let i = 0; i < data.length; i += 4) variance += (data[i] - 127.5) ** 2;
      const sigma = Math.sqrt(variance / (data.length / 4));
      assert.ok(sigma <= previous + 1e-9, `${name} level ${level} is busier (${sigma}) than level ${level - 1} (${previous})`);
      previous = sigma;
    }
    // The contrast has all but gone by the level a whole tile shrinks to a few texels.
    assert.ok(previous < 2, `${name} still carries σ ${previous} at its coarsest levels`);
  }
});

test('the view\'s maps: the sampled ones as repeat-wrapped, mipmapped, max-anisotropy data textures, their bytes on the ledger', () => {
  const detail = createUltraGroundDetail(16);
  try {
    // Wave 4 (R-G, round-2 item 0): a map nothing samples is not built.
    const sampled = ultraDetailMapsSampled();
    assert.equal(detail.grass !== null, sampled.grass);
    assert.equal(detail.stone !== null, sampled.stone);
    assert.equal(detail.soil !== null, sampled.soil);
    if (ULTRA_GROUND.detail.fine <= 0) {
      // Only the grass map survives fine 0, and only for the riding-distance tufts (item 10).
      const ride = ULTRA_GROUND.detail.grass.rideBlade > 0 || ULTRA_GROUND.detail.grass.rideClump > 0;
      assert.deepEqual([sampled.grass, sampled.stone, sampled.soil], [ride, false, false], 'fine 0 builds a map nothing samples');
    }
    const textures = [detail.grass, detail.stone, detail.soil, detail.broad].filter((texture): texture is THREE.DataTexture => texture !== null);
    assert.equal(detail.textures, textures.length);
    let bytes = 0;
    for (const texture of textures) {
      assert.equal(texture.wrapS, THREE.RepeatWrapping);
      assert.equal(texture.wrapT, THREE.RepeatWrapping);
      assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
      assert.equal(texture.generateMipmaps, false, 'the chain is painted, not generated');
      assert.equal(texture.anisotropy, 16);
      assert.equal(texture.colorSpace, THREE.NoColorSpace, 'data, not colour');
      for (const level of texture.mipmaps as { data: Uint8Array }[]) bytes += level.data.byteLength;
    }
    assert.equal(detail.bytes, bytes);
    // The pass's budget is 24 MiB for everything it adds; the maps take a fraction.
    assert.ok(bytes <= 6 * 1024 * 1024, `${bytes} bytes of detail maps`);
    // Dispose frees every one it holds.
    let disposed = 0;
    for (const texture of textures) texture.addEventListener('dispose', () => { disposed += 1; });
    detail.dispose();
    assert.equal(disposed, textures.length);
  } finally {
    detail.dispose();
  }
});

// ---------------------------------------------------------------------------
// Kinds: the road gets nothing
// ---------------------------------------------------------------------------

test('the road, wood and the spill take no detail; grass, gravel, dirt and brick take their own', () => {
  assert.equal(groundDetailKind('pavement'), GROUND_DETAIL_KIND.none);
  assert.equal(groundDetailKind('roughPavement'), GROUND_DETAIL_KIND.none);
  assert.equal(groundDetailKind('wood'), GROUND_DETAIL_KIND.none);
  assert.equal(groundDetailKind('spill'), GROUND_DETAIL_KIND.none);
  assert.equal(groundDetailKind('grass'), GROUND_DETAIL_KIND.grass);
  assert.equal(groundDetailKind('gravel'), GROUND_DETAIL_KIND.gravel);
  assert.equal(groundDetailKind('dirt'), GROUND_DETAIL_KIND.dirt);
  assert.equal(groundDetailKind('brick'), GROUND_DETAIL_KIND.brick);
  // The kinds fit under bit 3, which carries the fill's line mode.
  for (const kind of Object.values(GROUND_DETAIL_KIND)) assert.ok(kind < 8);
  // Dirt — Switchback's riding surface — is relief only: its table has no albedo term.
  assert.deepEqual(Object.keys(ULTRA_GROUND.detail.dirt).sort(), ['fade', 'slope']);
  // Per material: a uniform kind, so the kinds add no program.
  const detail = createUltraGroundDetail(1);
  try {
    const kinds = GROUND.map((surface) => {
      const material = ultraGroundMaterial(materialAppearance(surface === 'field' ? 'grass' : surface), surface, contextFor(), detail);
      return [surface, material.userData.ultraGroundKind, compile(material).uniforms.ultraGroundKind?.value] as const;
    });
    for (const [surface, kind, uniform] of kinds) {
      assert.equal(kind, uniform, `${surface}: the uniform does not carry the kind`);
      assert.equal(kind, groundDetailKind(surface === 'field' ? 'grass' : surface));
    }
  } finally {
    detail.dispose();
  }
});

test('the patch returns neutral detail for kind 0 and never re-normalises an untilted normal', () => {
  const fragment = patchUltraGroundFragment(patchUltraFragment(THREE.ShaderLib.standard.fragmentShader));
  assert.ok(fragment.includes('if ( ultraKind < 0.5 ) return ultraTint;') && fragment.includes('vec3 ultraTint = vec3( 1.0 );'), 'kind 0 is not an early, neutral return');
  assert.ok(fragment.includes('if ( ultraDetailTilt.x != 0.0 || ultraDetailTilt.y != 0.0 ) {'), 'the normal is edited without a tilt');
  // The fill cover is exact and per fragment: two box-filtered half-planes, no clamp.
  assert.ok(fragment.includes('saturate( vUltraEdge.x / max( fwidth( vUltraEdge.x ), 1e-6 ) + 0.5 )'));
  assert.ok(fragment.includes('ultraFillBits >= 7.5'), 'the intersection mode is not read from bit 3');
  // A18 (Wave 4): bit 4 rounds a drivable knee, with the derivative taken in uniform control flow.
  assert.ok(fragment.includes('float ultraEdgeRound = vUltraFillKind >= 15.5 ? 1.0 : 0.0;'), 'the rounded knee is not read from bit 4');
  assert.ok(fragment.includes('ultraEdgeCover = mix( ultraEdgeCover, ultraEdgeRounded, ultraEdgeRound );'));
});

// ---------------------------------------------------------------------------
// The patch, compiled
// ---------------------------------------------------------------------------

test('every ground anchor exists once in the pinned three text, and survives the shared patch', () => {
  const physical = readFileSync(join(SHADERS, 'ShaderLib', 'meshphysical.glsl.js'), 'utf8');
  const split = physical.indexOf('export const fragment');
  const pinned = { vertex: physical.slice(0, split), fragment: physical.slice(split) };
  const shared = {
    vertex: patchUltraVertex(THREE.ShaderLib.standard.vertexShader),
    fragment: patchUltraFragment(THREE.ShaderLib.standard.fragmentShader),
  };
  for (const [name, anchor] of Object.entries(ULTRA_GROUND_ANCHORS)) {
    const stage = name.startsWith('vertex') ? 'vertex' : 'fragment';
    assert.ok(pinned[stage].includes(anchor), `${anchor} is not in the pinned ${stage} text`);
    assert.equal(shared[stage].split(anchor).length - 1, 1, `${anchor} is not unique after the shared patch`);
  }
  assert.throws(() => patchUltraGroundFragment('void main() {}'), /Ultra ground patch anchor missing/);
  assert.throws(() => patchUltraGroundVertex('void main() {}'), /Ultra ground patch anchor missing/);
  // The attribute names are the contract groundContact.ts publishes.
  assert.equal(ULTRA_GROUND_ATTRIBUTES.edge, ULTRA_GROUND_EDGE_ATTRIBUTES.edge);
  assert.equal(ULTRA_GROUND_ATTRIBUTES.fillTint, ULTRA_GROUND_EDGE_ATTRIBUTES.fillTint);
  assert.equal(ULTRA_GROUND_ATTRIBUTES.fillKind, ULTRA_GROUND_EDGE_ATTRIBUTES.fillKind);
  const vertex = patchUltraGroundVertex(shared.vertex);
  assert.ok(vertex.includes(`attribute vec2 ${ULTRA_GROUND_EDGE_ATTRIBUTES.edge};`));
  assert.ok(vertex.includes(`attribute vec3 ${ULTRA_GROUND_EDGE_ATTRIBUTES.fillTint};`));
  assert.ok(vertex.includes(`attribute float ${ULTRA_GROUND_EDGE_ATTRIBUTES.fillKind};`));
});

test('every ground program lints: each Ultra name declared, once at global scope, varyings written, nothing global moved', () => {
  const chunksBefore = { ...THREE.ShaderChunk };
  const detail = createUltraGroundDetail(1);
  let linted = 0;
  try {
    const overrides: (UltraKitOverride | null)[] = [null, { edgeFill: false }, { lighting: false }, { farShadow: false }];
    // A29: and the screen kernel's configuration (by its define; never shipped), with and without the far map.
    const configurations = [...overrides.map((override) => ({ override, kernel: false })), { override: null, kernel: true }, { override: { farShadow: false }, kernel: true }];
    for (const { override, kernel } of configurations) {
      for (const surface of GROUND) {
        for (const withDetail of [true, false]) {
          const built = ultraGroundMaterial(
            materialAppearance(surface === 'field' ? 'grass' : surface),
            surface,
            contextFor(override),
            withDetail ? detail : null,
          );
          const material = kernel ? withScreenKernel(built) : built;
          const shader = compile(material);
          for (const text of [shader.vertexShader, shader.fragmentShader]) assert.ok(!/[^\x00-\x7f]/.test(text), 'non-ASCII in a shader');
          const defines = Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, '']));
          for (const shadows of [true, false]) {
            const all = { ...threeDefines(shadows), ...defines };
            const label = `${surface}/${JSON.stringify(override)}${kernel ? '/kernel' : ''}/${withDetail ? 'detail' : 'plain'}/${shadows}`;
            const vertex = lint(preprocess(resolveIncludes(shader.vertexShader), all), `${label} vertex`);
            const fragment = lint(preprocess(resolveIncludes(shader.fragmentShader), all), `${label} fragment`);
            for (const [stageName, stage] of [['vertex', vertex], ['fragment', fragment]] as const) {
              for (const name of stage.used) assert.ok(stage.declared.has(name), `${label} ${stageName}: ${name} used, never declared`);
              for (const [name, times] of stage.globals) {
                if (/^v?[uU]ltra/.test(name)) assert.equal(times, 1, `${label} ${stageName}: ${name} declared ${times} times`);
              }
            }
            for (const name of fragment.varyings) {
              if (/^vUltra/.test(name)) assert.ok(vertex.varyings.has(name), `${label}: ${name} is read but never written`);
            }
            if (withDetail && surface !== 'wood' && surface !== 'spill') {
              assert.ok(fragment.used.has('ultraGroundDetail'), `${label}: the detail path is not compiled in`);
            }
            linted += 1;
          }
        }
      }
    }
  } finally {
    detail.dispose();
  }
  assert.ok(linted >= 100, `only ${linted} programs linted`);
  assert.deepEqual({ ...THREE.ShaderChunk }, chunksBefore, 'a ShaderChunk moved');
});

test('the ground patch chains the shared one, and the edge and detail follow the kit and the view', () => {
  const detail = createUltraGroundDetail(1);
  try {
    const plain = ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor());
    const rich = ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor(), detail);
    // Same family key whatever the defines (three folds the defines into its own key).
    assert.equal(plain.customProgramCacheKey(), rich.customProgramCacheKey());
    assert.ok('ULTRA_EDGE' in (plain.defines ?? {}) && !('ULTRA_DETAIL' in (plain.defines ?? {})));
    assert.ok('ULTRA_DETAIL' in (rich.defines ?? {}));
    const shader = compile(rich);
    // The shared patch ran first (its declarations are there), then the ground's.
    assert.ok(shader.fragmentShader.includes('varying vec3 vUltraWorld;'));
    assert.ok(shader.fragmentShader.indexOf('varying vec3 vUltraWorld;') < shader.fragmentShader.indexOf('uniform sampler2D ultraDetailBroad;'));
    assert.equal(shader.uniforms.ultraDetailBroad.value, detail.broad);
    // A fine map is bound and declared exactly when the view holds it (item 0).
    for (const [name, texture] of [['ultraDetailGrass', detail.grass], ['ultraDetailStone', detail.stone], ['ultraDetailSoil', detail.soil]] as const) {
      assert.equal(shader.uniforms[name]?.value ?? null, texture, `${name} bound unlike the view`);
      assert.equal(shader.fragmentShader.includes(`uniform sampler2D ${name};`), texture !== null, `${name} declared unlike the view`);
    }
    // The field never carries the edge attributes; the kill flags drop what they promise.
    assert.ok(!('ULTRA_EDGE' in (ultraGroundMaterial(materialAppearance('grass'), 'field', contextFor(), detail).defines ?? {})));
    assert.ok(!('ULTRA_EDGE' in (ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor({ edgeFill: false }), detail).defines ?? {})));
    const bare = ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor({ ground: false }), detail);
    assert.ok(!('ULTRA_EDGE' in (bare.defines ?? {})) && !('ULTRA_DETAIL' in (bare.defines ?? {})));
    // Installing on a plain material leaves it a working patch too.
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = (): void => undefined;
    installUltraGroundPatch(material, { kind: 1, edge: false, detail: null });
    assert.equal(material.userData.ultraGroundKind, 1);
  } finally {
    detail.dispose();
  }
});

test('Wave 3: the shade lift and the rider contact are the ground\'s own, between the AO and the sum, and fine 0 samples no fine map', () => {
  const detail = createUltraGroundDetail(1);
  try {
    const context = contextFor();
    const shader = compile(ultraGroundMaterial(materialAppearance('grass'), 'grass', context, detail));
    const text = shader.fragmentShader;
    assert.equal(text.split(`uniform vec4 ultraContactPoints[ ${ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_VEC4_PER_SLOT} ];`).length - 1, 1);
    assert.equal(text.split('uniform int ultraContactCount;').length - 1, 1);
    // The contact uniforms are the shared ones, by reference: one write per frame reaches every ground material.
    assert.equal(shader.uniforms.ultraContactPoints, context.shared.uniforms.ultraContactPoints);
    assert.equal(shader.uniforms.ultraContactCount, context.shared.uniforms.ultraContactCount);
    assert.equal((context.shared.uniforms.ultraContactPoints.value as THREE.Vector4[]).length, ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_VEC4_PER_SLOT);
    const aomap = text.indexOf('#include <aomap_fragment>');
    const lift = text.indexOf('ultraLiftShade');
    const contact = text.indexOf('float ultraDyn = ultraDynamicContact( vUltraWorld.xz, ultraPoolShade );');
    // A15: the body pool reads the static shade the lift found (whole in a canyon, its sunShare in sun).
    assert.ok(text.indexOf('float ultraPoolShade = 1.0;') < lift, 'the pool shade is not declared before the lift');
    assert.ok(text.includes('ultraPoolShade = ultraLiftStatic;'), 'the lift does not hand the pool its static shade');
    const total = text.indexOf('vec3 totalDiffuse');
    assert.ok(aomap >= 0 && aomap < lift && lift < contact && contact < total, 'the lift and contact are not between the AO and the sum');
    // The lift touches the diffuse fill only, and only where the sun is shadowed (and the far map says a caster is there).
    assert.ok(text.includes('reflectedLight.indirectDiffuse += ultraLifted;'));
    assert.ok(text.includes('vec3 ultraLifted = reflectedLight.indirectDiffuse * ( ultraLiftAmount * ultraLiftShade );'));
    assert.ok(text.includes('float ultraLiftShade = ( 1.0 - ultraSunVisibility * ultraLiftFacing ) * ultraLiftUp;'));
    // Final touch (post round 4): the gate reads the far map leaning toward
    // static — the most shade of the filter's four taps at the point itself,
    // no normal offset — so no unlifted rim runs inside the near map's edge.
    assert.ok(text.includes('ultraFarShadeAround( vUltraWorld ) );'), 'the lift is not gated by the static far map');
    assert.ok(!text.includes('1.0 - ultraFarVisibility()'), 'the gate still reads the averaged, offset far lookup');
    assert.equal(text.split('float ultraFarShadeAround( const in vec3 ultraPoint ) {').length - 1, 1);
    const aroundOf = (fragment: string): string => fragment.slice(fragment.indexOf('float ultraFarShadeAround('), fragment.indexOf('float ultraTallCaster()'));
    const around = aroundOf(text);
    // A29: as shipped, the lean is U5's — the filter's four taps, no kernel diagonals.
    assert.equal(around.split('textureLod( ultraFarMap,').length - 1, 4, 'the shipped lean is not the filter\'s four taps');
    assert.ok(!around.includes('ultraKernelA') && !text.includes('ultraGroundKernelX'), 'the kernel\'s lean ships');
    assert.ok(around.includes('min(') && !around.includes('ultraFarNormalOffset') && around.includes('ultraEdgeCoverage( ultraFarAt.xy, ultraFarEdge )'));
    // A28 (Trade 2), the kernel's configuration: on the ground (and its paint)
    // the lean also reaches the screen kernel's diagonals — four more taps,
    // only where the kernel is not zero, each at the offset point's own
    // light-space depth.
    const kernelAround = aroundOf(compile(withScreenKernel(ultraGroundMaterial(materialAppearance('grass'), 'grass', context, detail))).fragmentShader);
    assert.equal(kernelAround.split('textureLod( ultraFarMap,').length - 1, 8, 'the leaning lookup is not the filter\'s four taps and the kernel\'s four');
    assert.ok(kernelAround.includes('vec3 ultraKernelA = ultraGroundKernelX + ultraGroundKernelY;'));
    assert.ok(kernelAround.includes('vec3 ultraKernelB = ultraGroundKernelX - ultraGroundKernelY;'));
    assert.ok(kernelAround.includes('if ( dot( ultraKernelA, ultraKernelA ) + dot( ultraKernelB, ultraKernelB ) > 1e-8 ) {'), 'the kernel taps run at zero kernel');
    assert.ok(kernelAround.includes('min( ultraFarAt.z + ultraFarA.z, 1.0 )') && kernelAround.includes('min( ultraFarAt.z - ultraFarB.z, 1.0 )'));
    // A28 (Trade 3): the lift's share by surface — this material's (a
    // per-material uniform), blended toward the filling surface's by the edge
    // cover — scales the far-classified cast part only; grass takes its share,
    // the road none. (What it does is run on the CPU below: "Fable finding 5".)
    assert.ok(text.includes('float ultraLiftAmount = mix( ultraShadeLift, ultraShadeLiftFar,'));
    // …on the cast (static) part only: a bank's form shade keeps its lift.
    const selfShare = String(ULTRA.shade.selfShadeShare).includes('.') ? String(ULTRA.shade.selfShadeShare) : `${ULTRA.shade.selfShadeShare}.0`;
    assert.ok(text.includes(`ultraLiftShade *= max( ${selfShare} * ( 1.0 - ultraLiftFacing ), ultraLiftStatic * ultraLiftSurface );`),
      'the surface share does not reach the cast part of the lift');
    // Fable finding 5: the amount is the whole lift; the share rides nothing else.
    assert.ok(!text.includes('ultraLiftCast'), 'the share still rides the amount where the far map cannot split cast from form shade');
    assert.ok(text.includes('ultraLiftSurface = mix( ultraLiftSurface, ultraLiftShareOfKind( ultraFillKindOnly ), ultraEdgeCover );'));
    assert.equal(text.split('uniform float ultraLiftSurfaceShare;').length - 1, 1);
    assert.equal((shader.uniforms.ultraLiftSurfaceShare as THREE.IUniform<number>).value, ULTRA.shade.surfaceShare.grass);
    // Wave 4 (A14): the near lift ramps to the far one with view distance, the
    // lifted share takes the bounce's hue, and only a tall caster's shade lifts.
    // Final touch: the two amounts are the shared live uniforms (F4 ULTRA.shade.lift / .liftFar).
    const glsl = (value: number): string => (String(value).includes('.') ? String(value) : `${value}.0`);
    assert.ok(text.includes('float ultraLiftAmount = mix( ultraShadeLift, ultraShadeLiftFar,'));
    for (const name of ['ultraShadeLift', 'ultraShadeLiftFar']) {
      assert.equal(text.split(`uniform float ${name};`).length - 1, 1, `${name} is not declared once`);
      assert.equal(shader.uniforms[name], context.shared.uniforms[name], `${name} is not the shared uniform`);
    }
    assert.equal(context.shared.uniforms.ultraShadeLift.value, ULTRA.shade.lift);
    assert.equal(context.shared.uniforms.ultraShadeLiftFar.value, ULTRA.shade.liftFar);
    assert.ok(text.includes(`smoothstep( ${glsl(ULTRA.shade.liftDistance[0])}, ${glsl(ULTRA.shade.liftDistance[1])}, length( vViewPosition ) )`));
    assert.ok(text.includes('getIBLIrradiance( ( viewMatrix * vec4( 0.0, - 1.0, 0.0, 0.0 ) ).xyz )'), 'the lift is not warmed toward the bounce');
    assert.ok(text.includes('if ( ultraLiftStatic > 0.0 ) ultraLiftStatic *= ultraTallCaster();'), 'the tall-caster test is not applied');
    assert.equal(text.split('float ultraTallCaster() {').length - 1, 1, 'the tall-caster test is not declared once');
    // …whose ray point leans toward shade as the gate does; the vertical point stays one fetch.
    assert.ok(text.includes('float ultraAlong = ultraFarShadeAround( vUltraWorld + ultraSunDirection *'));
    assert.ok(text.includes('ultraFarShadeAt( vUltraWorld + vec3( 0.0,'));
    if (ULTRA_GROUND.detail.fine === 0) {
      for (const map of ['ultraDetailStone', 'ultraDetailSoil']) {
        assert.ok(!text.includes(`ultraDetailSample( ${map},`), `${map} is still sampled at fine 0`);
      }
      // Wave 4 (round-2 item 10): the grass map is sampled by the riding-distance tufts alone, faded in by footprint.
      const ride = ULTRA_GROUND.detail.grass.rideBlade > 0 || ULTRA_GROUND.detail.grass.rideClump > 0;
      assert.equal(text.includes('ultraDetailSample( ultraDetailGrass,'), ride, 'the grass map is sampled unlike the tufts\' switch');
      if (ride) {
        assert.equal(text.split('ultraDetailSample( ultraDetailGrass,').length - 1, 2, 'the tufts take two grass samples');
        assert.ok(text.includes('float ultraRide = smoothstep('), 'the tufts are not faded in by footprint');
        assert.ok(!/ultraSlope = [^;]*ultraRide/.test(text), 'the tufts tilt the normal');
      }
      assert.ok(text.includes('ultraDetailSample( ultraDetailBroad,'), 'the low-frequency layer went with the fine one');
    }
  } finally {
    detail.dispose();
  }
});

test('final wave (P-GR): A20\'s nearer ramp, I2\'s undulation compiled out by A25, the plaza joints faded in past the wheel', () => {
  // A20: within 20 m the lift is the near one; the aerial ramp starts no nearer and only rises.
  assert.ok(ULTRA.shade.liftDistance[0] >= 20, `the shade ramp starts at ${ULTRA.shade.liftDistance[0]} m`);
  assert.ok(ULTRA.shade.liftDistance[1] > ULTRA.shade.liftDistance[0] && ULTRA.shade.liftFar >= ULTRA.shade.lift);
  // A25 (coordinator, 2026-09-23): I2's grass undulation is off — §0.3 rejects
  // grass normal undulation, and the u4 capture showed it reading as smudges
  // on the vegetated bank. A slope of 0 compiles the term out entirely: no
  // declaration, no call in any surface branch, and no scale.
  const u = ULTRA_GROUND.detail.undulation;
  assert.equal(u.slope, 0, 'A25: the undulation is off');
  assert.equal(undulationScale(), 0);
  assert.ok(u.fadeMetres[0] < u.fadeMetres[1] && u.fadeMetres[1] <= 25, 'the record of I2 is left as measured');
  const fragment = patchUltraGroundFragment(patchUltraFragment(THREE.ShaderLib.standard.fragmentShader));
  assert.equal(fragment.includes('ultraUndulation'), false, 'A25: the undulation is still compiled in');
  assert.equal(fragment.includes('ultraFadeU'), false);
  // The surface branches are all still there, in order — only the term left.
  const body = fragment.slice(fragment.indexOf('vec3 ultraGroundDetail('));
  const road = body.indexOf('if ( ultraKind < 0.5 )');
  const grass = body.indexOf('if ( ultraKind < 1.5 )');
  const gravel = body.indexOf('if ( ultraKind < 2.5 )');
  const dirt = body.indexOf('if ( ultraKind < 3.5 )');
  const brick = body.indexOf('ultraWearA', dirt);
  assert.ok(road >= 0 && road < grass && grass < gravel && gravel < dirt && dirt < brick);
  // The joints: 3.5 cm at most (A18), faded in by footprint on the brick material and on a brick-filled region alike.
  assert.ok(ULTRA.brickJoints.jointMetres <= 0.035 + 1e-12, `joints ${ULTRA.brickJoints.jointMetres} m`);
  const [near0, near1] = ULTRA.brickJoints.nearFadeFootprintMetres;
  assert.ok(near0 > 0 && near0 < near1 && near1 < ULTRA.brickJoints.fadeFootprintMetres[0]);
  const numbers = (text: string, pattern: RegExp): number[][] => [...text.matchAll(pattern)].map((match) => [Number(match[1]), Number(match[2])]);
  const detail = createUltraGroundDetail(1);
  try {
    const brickText = compile(ultraGroundMaterial(materialAppearance('brick'), 'brick', contextFor(), detail)).fragmentShader;
    assert.deepEqual(numbers(brickText, /ultraJoint \*= smoothstep\( ([\d.]+), ([\d.]+), ultraFootprint \);/g), [[near0, near1]]);
    const grassText = compile(ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor(), detail)).fragmentShader;
    assert.deepEqual(numbers(grassText, /ultraLineJ \*= smoothstep\( ([\d.]+), ([\d.]+), ultraFootprintJ \);/g), [[near0, near1]]);
  } finally {
    detail.dispose();
  }
});

test('A28 (Trade 3): tree shade on non-drivable ground lifts less than on the road; rank-1 road, paint and block tops keep the whole lift', () => {
  const share = ULTRA.shade.surfaceShare;
  const K = GROUND_DETAIL_KIND;
  // Kind none — the road (rank 1), wood, the spill — is always the whole lift.
  assert.equal(ultraLiftSurfaceShare(K.none), 1);
  for (const surface of ['pavement', 'roughPavement', 'wood', 'spill'] as MaterialId[]) {
    assert.equal(ultraLiftSurfaceShare(groundDetailKind(surface)), 1, `${surface} does not keep the whole lift`);
  }
  // The non-drivable turf and verges lift less (A28: grass shade darker than road shade); the trail's dirt does not.
  assert.ok(share.grass > 0 && share.grass < 1 && share.gravel > 0 && share.gravel < 1, 'grass and gravel must take a share under 1');
  assert.equal(share.dirt, 1, 'the riding trail keeps the whole lift (Switchback trail mean)');
  assert.ok(share.brick >= 1, 'the kerb band may not lift less than the road beside it (kerb band ≥ High)');
  const detail = createUltraGroundDetail(1);
  try {
    const context = contextFor();
    const uniformOf = (material: THREE.Material): number | undefined =>
      (compile(material).uniforms.ultraLiftSurfaceShare as THREE.IUniform<number> | undefined)?.value;
    assert.equal(uniformOf(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context, detail)), 1);
    assert.equal(uniformOf(ultraGroundMaterial(materialAppearance('grass'), 'grass', context, detail)), share.grass);
    assert.equal(uniformOf(ultraGroundMaterial(materialAppearance('gravel'), 'gravel', context, detail)), share.gravel);
    assert.equal(uniformOf(ultraGroundMaterial(materialAppearance('brick'), 'brick', context, detail)), share.brick);
    // The surround field takes its appearance's share (a grass field is grass).
    assert.equal(uniformOf(ultraGroundMaterial(materialAppearance('grass'), 'field', context, detail)), share.grass);
    // The share of a filling kind is baked, in order, for the edge field.
    const text = compile(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context, detail)).fragmentShader;
    const f = (value: number): string => (String(value).includes('.') ? String(value) : `${value}.0`);
    assert.ok(text.includes(`? ${f(share.grass)}`) && text.includes(`? ${f(share.gravel)}`) && text.includes(`: ${f(share.brick)};`));
    // Without the lighting kit there is no lift and no share.
    const unlit = ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor({ lighting: false }), detail);
    assert.ok(!('ULTRA_SHADE_LIFT' in (unlit.defines ?? {})) && compile(unlit).uniforms.ultraLiftSurfaceShare === undefined);
    // Road paint and block tops keep the whole lift. The paint runs the
    // ground's light snippet, whose share stays 1 without ULTRA_GROUND (the
    // ground family's define, which paint never carries); it declares no share.
    const marking = ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context);
    const paint = compile(marking);
    assert.ok(!('ULTRA_GROUND' in (marking.defines ?? {})) && 'ULTRA_SHADE_LIFT' in (marking.defines ?? {}));
    assert.ok(paint.fragmentShader.includes('float ultraLiftSurface = 1.0;'));
    assert.ok(!paint.fragmentShader.includes('uniform float ultraLiftSurfaceShare;') && paint.uniforms.ultraLiftSurfaceShare === undefined);
    const block = compile(ultraBlockMaterial(materialAppearance('concrete'), 'concrete', context)).fragmentShader;
    assert.ok(block.includes('ultraLiftAmount') && !block.includes('ultraLiftSurface'));
  } finally {
    detail.dispose();
  }
});

/** One fragment's inputs to the ground's lift (`liftRunner`). */
interface LiftFragment {
  /** View distance, metres. */
  readonly metres: number;
  /** The world normal's y (`ultraLiftN.y`). */
  readonly up: number;
  /** N·L of the geometry normal and the sun. */
  readonly nDotL: number;
  /** The patched `getShadow`'s sun visibility (0 in the near map's shade). */
  readonly sunVisibility: number;
  /** What `ultraFarShadeAround( vUltraWorld )` reads: 1 in a static caster's shade. */
  readonly farShade: number;
  /** What `ultraTallCaster()` answers. */
  readonly tall: number;
  /** `ultraFarEnabled`: 0 when the far box is empty. */
  readonly farEnabled: number;
}

/**
 * Fable finding 5 (A28): the ground's lift as the GPU runs it, on the CPU. It
 * takes the material's own compiled text — from `float ultraPoolShade` to the
 * rider contact, the whole `ULTRA_SHADE_LIFT` part `fragmentLight()` emits —
 * preprocesses it with the material's defines (no environment map, so the
 * bounce hue, a colour-only term, drops out), declares each `float`/`vecN` a
 * JS `let`, and runs it as scalar JavaScript: one colour channel of
 * `reflectedLight.indirectDiffuse`, every input a stub the fragment sets. The
 * answer is the lift factor, `indirect / before − 1`. Nothing is re-derived:
 * change the emitted arithmetic and this answer changes.
 */
function liftRunner(material: THREE.Material): (fragment: LiftFragment) => number {
  const shader = compile(material);
  const text = shader.fragmentShader;
  const start = text.indexOf('float ultraPoolShade = 1.0;');
  const open = text.indexOf('#ifdef ULTRA_SHADE_LIFT', start);
  assert.ok(start >= 0 && open > start, 'the lift is not where the ground runs it');
  // Through the #endif that closes the lift (the rider contact after it is not the lift's).
  let depth = 0;
  let end = -1;
  for (let at = open; at < text.length && end < 0;) {
    const next = text.indexOf('\n', at);
    const line = text.slice(at, next < 0 ? text.length : next).trim();
    if (line.startsWith('#if')) depth += 1;
    if (line.startsWith('#endif')) depth -= 1;
    at = next < 0 ? text.length : next + 1;
    if (depth === 0) end = at;
  }
  assert.ok(end > open, 'the lift block does not close');
  const defines = { NUM_DIR_LIGHTS: '1', ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])) };
  const body = preprocess(text.slice(start, end), defines)
    .replace(/\b(?:const\s+)?(?:float|int|bool|vec[234])\s+(\w+)\s*=/g, 'let $1 =');
  assert.ok(!/\b(?:float|int|bool|vec[234]|mat[234])\b/.test(body), 'a GLSL type the scalar runner cannot read');
  const smoothstep = (e0: number, e1: number, x: number): number => {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return t * t * (3 - 2 * t);
  };
  const own = (shader.uniforms.ultraLiftSurfaceShare as THREE.IUniform<number> | undefined)?.value ?? 1;
  const stubs = {
    smoothstep,
    mix: (a: number, b: number, t: number): number => a * (1 - t) + b * t,
    max: Math.max,
    min: Math.min,
    length: (v: readonly number[]): number => Math.hypot(...v),
    dot: (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    ultraLiftSurfaceShare: own,
    // No filled band edge here: whatever the cover, the material's own share.
    ultraLiftShareOfKind: (): number => own,
    ultraFillKindOnly: 0,
    ultraEdgeCover: 0,
    ultraShadeLift: (shader.uniforms.ultraShadeLift as THREE.IUniform<number>).value,
    ultraShadeLiftFar: (shader.uniforms.ultraShadeLiftFar as THREE.IUniform<number>).value,
    nonPerturbedNormal: null,
    viewMatrix: null,
    vUltraWorld: null,
  };
  const names = [...Object.keys(stubs), 'transformNormalByInverseViewMatrix', 'geometryNormal', 'directionalLights',
    'ultraSunVisibility', 'vViewPosition', 'ultraFarShadeAround', 'ultraTallCaster', 'ultraFarEnabled', 'reflectedLight'];
  // eslint-disable-next-line no-new-func
  const run = new Function(...names, `${body}\nreturn reflectedLight.indirectDiffuse;`) as (...values: unknown[]) => number;
  return (fragment) => {
    const across = Math.sqrt(1 - fragment.nDotL * fragment.nDotL);
    const before = 0.25;
    const after = run(
      ...Object.values(stubs),
      (): { y: number } => ({ y: fragment.up }),
      [0, 1, 0],
      [{ direction: [across, fragment.nDotL, 0] }],
      fragment.sunVisibility,
      [0, 0, fragment.metres],
      (): number => fragment.farShade,
      (): number => fragment.tall,
      fragment.farEnabled,
      { indirectDiffuse: before },
    );
    return after / before - 1;
  };
}

test('Fable finding 5 (A28): the surface share scales only the far-classified cast lift; without the far map every surface keeps the whole lift', () => {
  const detail = createUltraGroundDetail(1);
  try {
    const s = ULTRA.shade;
    const share = s.surfaceShare.grass;
    assert.ok(share < 1, 'the case needs a turf share under 1');
    const [fadeIn, whole] = s.surfaceShareMetres;
    // Past the share's fade-in and the lift's ramp (A29: [20, 36] m again).
    const far = Math.max(whole, s.liftDistance[1]) + 10;
    assert.ok(far >= s.liftDistance[1], 'the far case sits past the lift ramp, at liftFar');
    const lifts = (override: UltraKitOverride | null): { grass: (fragment: LiftFragment) => number; road: (fragment: LiftFragment) => number } => ({
      grass: liftRunner(ultraGroundMaterial(materialAppearance('grass'), 'grass', contextFor(override), detail)),
      road: liftRunner(ultraGroundMaterial(materialAppearance('pavement'), 'pavement', contextFor(override), detail)),
    });
    const withFar = lifts({ farShadow: true });
    const noFar = lifts({ farShadow: false });
    // Up-facing ground the sun meets, shaded in the near map.
    const shaded = { up: 1, nDotL: 0.6, sunVisibility: 0, farEnabled: 1 };
    // A building's shade (tall, in the far map); the rider's own (in neither far lookup); a bank turned from the sun.
    const cast = { ...shaded, farShade: 1, tall: 1 };
    const rider = { ...shaded, farShade: 0, tall: 0 };
    const bank = { up: 1, nDotL: -0.3, sunVisibility: 0, farShade: 0, tall: 0, farEnabled: 1 };
    const close = (actual: number, expected: number, what: string): void => {
      assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: lift ${actual}, expected ${expected}`);
    };

    // With the far map, on ultra-full: cast shade on turf takes the share past the fade-in, the road the whole lift.
    close(withFar.road({ ...cast, metres: far }), s.liftFar, 'road, cast shade, far map');
    close(withFar.grass({ ...cast, metres: far }), s.liftFar * share, 'turf, cast shade, far map');
    // The share fades in over surfaceShareMetres: whole inside, half-way at the midpoint (smoothstep 0.5).
    close(withFar.grass({ ...cast, metres: fadeIn - 1 }), s.lift, 'turf, cast shade, inside the fade-in');
    close(withFar.grass({ ...cast, metres: (fadeIn + whole) / 2 }), s.lift * (1 + share) / 2, 'turf, cast shade, mid fade-in');
    // A bank's form shade keeps its selfShadeShare of the lift on turf as on the road; the rider's shadow never lifts.
    close(withFar.grass({ ...bank, metres: far }), s.liftFar * s.selfShadeShare, 'turf, form shade');
    close(withFar.road({ ...bank, metres: far }), s.liftFar * s.selfShadeShare, 'road, form shade');
    close(withFar.grass({ ...rider, metres: far }), 0, 'turf, the rider\'s shadow');
    close(withFar.grass({ ...cast, sunVisibility: 1, metres: far }), 0, 'sunlit turf');

    // The finding: where nothing splits cast from form shade — no far map
    // (ultra-lit, ?ultrakit=-farShadow) or an empty far box — the lift was
    // multiplied by the share whole, form shade and the rider's shadow with
    // it. Now every surface keeps the whole lift there, as before A28.
    for (const [what, lift, fragment] of [
      ['no far map', noFar, cast],
      ['no far map, the rider\'s shadow', noFar, rider],
      ['no far map, form shade', noFar, bank],
      ['an empty far box', withFar, { ...cast, farEnabled: 0 }],
      ['an empty far box, form shade', withFar, { ...bank, farEnabled: 0 }],
    ] as const) {
      close(lift.grass({ ...fragment, metres: far }), s.liftFar, `turf, ${what}`);
      close(lift.road({ ...fragment, metres: far }), s.liftFar, `road, ${what}`);
    }
  } finally {
    detail.dispose();
  }
});

test('Fable finding 8: the far fetches the Ultra cost report prints are the lift\'s own, on the ground, its paint and the blocks', () => {
  const fetches = ultraLiftFarFetches();
  const detail = createUltraGroundDetail(1);
  try {
    const context = contextFor({ farShadow: true });
    const kernel = '#if defined( ULTRA_GROUND ) || defined( ULTRA_GROUND_SHADOW )';
    const between = (text: string, from: string, to: string): string => {
      const start = text.indexOf(from);
      const end = text.indexOf(to, start + from.length);
      assert.ok(start >= 0 && end > start, `${from} … ${to} not found`);
      return text.slice(start, end);
    };
    const taps = (text: string): number => text.split('textureLod( ultraFarMap,').length - 1;
    // A29: every shipped family compiles the lean alone (no kernel diagonals);
    // the kernel's configuration (its define, on the ground and its paint)
    // adds them behind the ground's define. The blocks never take it.
    const families = [
      ['ground', ultraGroundMaterial(materialAppearance('grass'), 'grass', context, detail), false],
      ['paint', ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context), false],
      ['blocks', ultraBlockMaterial(materialAppearance('concrete'), 'concrete', context), false],
      ['ground + kernel', withScreenKernel(ultraGroundMaterial(materialAppearance('grass'), 'grass', context, detail)), true],
      ['paint + kernel', withScreenKernel(ultraMarkingMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true }, context)), true],
    ] as const;
    for (const [family, material, kernelTaps] of families) {
      const raw = compile(material).fragmentShader;
      assert.ok('ULTRA_FAR' in (material.defines ?? {}) && raw.includes('float ultraLiftAmount'), `${family} runs no lift`);
      assert.equal(groundScreenKernelCompiled(material), kernelTaps);
      // As written: the lean's filter taps, then (the kernel's configuration only) its diagonals behind the ground's define.
      const around = between(raw, 'float ultraFarShadeAround( const in vec3 ultraPoint ) {', 'float ultraTallCaster() {');
      const split = around.indexOf(kernel);
      assert.equal(split >= 0, kernelTaps, `${family}: the kernel diagonals are written unlike its define`);
      assert.equal(taps(split < 0 ? around : around.slice(0, split)), fetches.lean, `${family}: the lean's own taps`);
      if (kernelTaps) assert.equal(taps(around.slice(split)), fetches.kernelLean, `${family}: the kernel diagonals`);
      assert.equal(taps(between(raw, 'float ultraFarShadeAt( const in vec3 ultraPoint ) {', 'float ultraFarShadeAround(')),
        fetches.vertical, `${family}: the vertical point`);
      // As compiled for this family: the kernel diagonals only where the ground filter (and its kernel) runs.
      const defines = { NUM_DIR_LIGHTS: '1', ...Object.fromEntries(Object.keys(material.defines ?? {}).map((name) => [name, ''])) };
      const compiled = preprocess(raw, defines);
      const compiledAround = between(compiled, 'float ultraFarShadeAround( const in vec3 ultraPoint ) {', 'float ultraTallCaster() {');
      assert.equal(taps(compiledAround), fetches.lean + (kernelTaps ? fetches.kernelLean : 0), `${family}: taps as compiled`);
      // Asked once by the gate and once more at the tall caster's ray point, beside one vertical fetch.
      const tall = between(compiled, 'float ultraTallCaster() {', '}');
      assert.equal(tall.split('ultraFarShadeAround(').length - 1, 1, `${family}: the ray point`);
      assert.equal(tall.split('ultraFarShadeAt(').length - 1, 1, `${family}: the vertical point`);
      assert.equal(compiled.split('ultraFarShadeAround( vUltraWorld )').length - 1, 1, `${family}: the gate`);
      assert.ok(compiled.indexOf('if ( ultraLiftStatic > 0.0 ) ultraLiftStatic *= ultraTallCaster();') > compiled.indexOf('ultraFarShadeAround( vUltraWorld )'),
        `${family}: the tall caster is not asked only where the lean found static shade`);
    }
  } finally {
    detail.dispose();
  }
});

test('A14: the tall-caster test lifts a building\'s or a tree\'s whole shade and none of a kicker\'s, against back-face depth', () => {
  // The far map stores each light ray's first *back* face (a caster's far
  // side), so a point is shaded when its ray toward the sun meets a caster and
  // the point is not inside it. In the sun's vertical plane (x toward the sun):
  const h = ULTRA.shade.tallCasterMetres;
  // `lean`: the ray point's lookup leans toward shade (final touch, post round
  // 4, `ultraFarShadeAround`): it counts as shaded when a point up to `lean`
  // metres across the light (in this plane) is.
  const covers = (box: { x0: number; x1: number; top: number }, elevation: number, lean = 0): { shade: number; tall: number } => {
    const [cx, cy] = [Math.cos(elevation), Math.sin(elevation)];
    const inside = (x: number, y: number): boolean => x > box.x0 && x < box.x1 && y > 0 && y < box.top;
    const shaded = (x: number, y: number): boolean => {
      if (inside(x, y)) return false;
      for (let t = 0; t < 200; t += 0.01) if (inside(x + cx * t, y + cy * t)) return true;
      return false;
    };
    let shade = 0;
    let tall = 0;
    for (let x = box.x0 - 60; x < box.x0; x += 0.05) {
      if (!shaded(x, 0)) continue;
      shade += 1;
      // The patch's two points: straight up, and the same height up the ray.
      const [ax, ay] = [x + (cx * h) / cy, h];
      const along = shaded(ax, ay) || (lean > 0 && (shaded(ax - lean * cy, ay + lean * cx) || shaded(ax + lean * cy, ay - lean * cx)));
      if (shaded(x, h) || along) tall += 1;
    }
    return { shade, tall };
  };
  assert.ok(h > 2.2 && h < 3.1, `tallCasterMetres ${h}: a 2.2 m box must pass under it, a 3.1 m crown base over it`);
  for (const degrees of [55, 33]) {
    const elevation = (degrees * Math.PI) / 180;
    // A building (any footprint, a thin wall too) a little over 2h tall: every point of its shade is tall
    // (at exactly 2h the two points' regions only touch).
    for (const [depth, top] of [[8, 2 * h + 0.25], [12, 10], [20, 24], [0.4, 12]]) {
      const { shade, tall } = covers({ x0: 0, x1: depth, top }, elevation);
      assert.ok(shade > 20 && tall === shade, `${degrees}°: a ${top} m caster ${depth} m deep lifts ${tall} of ${shade} shade points`);
    }
    // A kicker, a box, a step, a bollard: none of its shade is tall — also
    // with the ray point leaning toward shade by the town's worst case, the
    // filter's reach of 1.75 far texels (0.445 m) across the light.
    for (const [depth, top] of [[2, 1], [1.5, 2.2], [0.2, 1.1], [6, 0.3]]) {
      for (const lean of [0, 1.75 * 0.445]) {
        const { shade, tall } = covers({ x0: 0, x1: depth, top }, elevation, lean);
        assert.ok(shade > 0 && tall === 0, `${degrees}°: a ${top} m obstacle lifts ${tall} of ${shade} shade points (lean ${lean} m)`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Smoothed slopes
// ---------------------------------------------------------------------------

test('smoothSampleNormals keeps every sample touching a kept cell to the bit, and smooths a crease elsewhere', () => {
  const columns = 21;
  const rows = 11;
  const normals = new Float32Array(columns * rows * 3);
  // A crease down column 10: two planes meeting.
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const at = (row * columns + column) * 3;
      const tilt = column < 10 ? -0.3 : column > 10 ? 0.3 : 0;
      const length = Math.hypot(tilt, 1);
      normals[at] = tilt / length;
      normals[at + 1] = 1 / length;
      normals[at + 2] = 0;
    }
  }
  // Keep the cells of rows 0–1 (a road along the bottom).
  const keep = (cell: number): boolean => Math.floor(cell / (columns - 1)) <= 1;
  const out = smoothSampleNormals(columns, rows, normals, keep, 2, 2);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const at = (row * columns + column) * 3;
      assert.ok(Math.abs(Math.hypot(out[at], out[at + 1], out[at + 2]) - 1) < 1e-5, 'not unit');
      if (row <= 2) {
        assert.equal(out[at], normals[at], `sample (${column}, ${row}) touches the road and moved`);
        assert.equal(out[at + 1], normals[at + 1]);
      }
    }
  }
  // Far from the road the crease is softened: the samples beside it lean less.
  const far = (6 * columns + 9) * 3;
  assert.ok(Math.abs(out[far]) < Math.abs(normals[far]), 'the crease was not smoothed');
  // A flat field stays flat.
  const flat = new Float32Array(columns * rows * 3);
  for (let i = 0; i < columns * rows; i += 1) flat[i * 3 + 1] = 1;
  const same = smoothSampleNormals(columns, rows, flat, () => false);
  assert.deepEqual([...same], [...flat]);
});
