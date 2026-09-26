/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash, type Hash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import { planDigest } from '../level/planDigest.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, type PresentationRecipe } from './presentation.ts';
import { createTerrain } from './terrain.ts';

/**
 * Ordinary-path parity, byte for byte, against the tree before Ultra existed —
 * M39 (`docs/M39_ULTRA.md` §6.3 W7, invariant 1).
 *
 * **The claim.** Low, Medium and High are byte-identical after Ultra lands:
 * every Ultra branch is guarded by `isUltraRecipe`/active, ordinary
 * statements are untouched, and `createTerrain`/`createProps` with no
 * context build exactly what they built. The U0 captures prove it for ten
 * frames (`ultra-compare --expect-same`); this file proves it for every
 * vertex of six whole worlds, headlessly, in a few seconds, after every wave.
 *
 * **What is hashed.** Everything the ordinary world is made of, walked in
 * build order: every node's name, type, flags, layers mask and transform;
 * every geometry attribute buffer, index, group and draw range; every
 * instance matrix and instance colour; every material's parameters
 * (colour, roughness, flags, polygon offset, defines — every own field but
 * the identity counters); and every texture's parameters and texels, which
 * is where the facade atlas lives. `onBeforeCompile` and
 * `customProgramCacheKey` are part of a material, so a patch that leaked onto
 * an ordinary material changes its hash. The digests are grouped by the
 * mesh family a cost category names (surround, heightfield, blocks, props,
 * markings, hazards) so a failure names the family — and therefore the
 * package — that moved, plus one digest for the node tree and one for the
 * view's own counters.
 *
 * **Where the goldens came from, and why not from here.** A golden computed
 * from the working tree proves only that the tree agrees with itself. These
 * were computed by *this file*, run unchanged inside the pre-Ultra source
 * (`test-results/m39/ultra/pre-ultra-source-2026-09-22.tgz`, extracted into
 * a scratch directory with `node_modules` symlinked), with
 * `EUC_PARITY_OUT=<file>` set so it writes what it computed instead of
 * asserting:
 *
 *     mkdir <scratch>/pre-ultra && tar -xzf test-results/m39/ultra/pre-ultra-source-2026-09-22.tgz -C <scratch>/pre-ultra
 *     ln -s "$PWD/node_modules" <scratch>/pre-ultra/node_modules
 *     cp src/render/ordinaryParity.test.ts <scratch>/pre-ultra/src/render/
 *     (cd <scratch>/pre-ultra && EUC_PARITY_OUT=<scratch>/goldens.json node --test src/render/ordinaryParity.test.ts)
 *
 * which is why this file imports nothing that tree lacks — no `render/ultra/`
 * module, no M39 export. **Never regenerate the goldens from the working
 * tree**; a genuine ordinary change is a coordinator decision, recorded in
 * `docs/M39_ULTRA.md`, and the goldens then come from a named source again.
 *
 * The digest is a regression guard, not a security primitive, and typed
 * arrays are hashed as the machine's own bytes (little-endian on every
 * machine this project runs on).
 */

// ---------------------------------------------------------------------------
// The hasher
// ---------------------------------------------------------------------------

/** Own fields that are identity or bookkeeping, never appearance. */
const SKIPPED_FIELDS = new Set(['uuid', 'id', 'version', '_listeners', 'parent', 'children']);

/** A number, spelt so that -0, NaN and the infinities are all distinct. */
function num(value: number): string {
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

interface Hasher {
  readonly hash: Hash;
  readonly textures: Map<THREE.Texture, string>;
  readonly materials: Map<THREE.Material, string>;
}

function feed(hasher: Hasher, text: string): void {
  hasher.hash.update(text);
  hasher.hash.update('\u0000');
}

function feedBytes(hasher: Hasher, view: ArrayBufferView): void {
  feed(hasher, `${view.constructor.name}[${view.byteLength}]`);
  hasher.hash.update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

/**
 * Any value a material, texture or object field can hold, canonically:
 * sorted keys, typed arrays as bytes, three's value types through their own
 * `toArray`, textures and materials by content (and once per instance).
 */
function value(hasher: Hasher, input: unknown, depth = 0): void {
  if (depth > 12) throw new Error('ordinaryParity: a value nests deeper than any three object should');
  if (input === null) { feed(hasher, 'null'); return; }
  switch (typeof input) {
    case 'undefined': feed(hasher, 'undefined'); return;
    case 'number': feed(hasher, `n:${num(input)}`); return;
    case 'string': feed(hasher, `s:${input}`); return;
    case 'boolean': feed(hasher, `b:${input}`); return;
    case 'function': feed(hasher, `f:${input.toString()}`); return;
    case 'bigint': feed(hasher, `i:${input}`); return;
    default: break;
  }
  if (ArrayBuffer.isView(input)) { feedBytes(hasher, input); return; }
  const object = input as Record<string, unknown> & { isTexture?: boolean; isMaterial?: boolean; toArray?: () => unknown[] };
  if (object.isTexture === true) { feed(hasher, `texture:${textureDigest(hasher, input as THREE.Texture)}`); return; }
  if (object.isMaterial === true) { feed(hasher, `material:${materialDigest(hasher, input as THREE.Material)}`); return; }
  if (Array.isArray(input)) {
    feed(hasher, `[${input.length}`);
    for (const item of input) value(hasher, item, depth + 1);
    feed(hasher, ']');
    return;
  }
  if (typeof object.toArray === 'function' && !(input instanceof THREE.BufferAttribute)) {
    feed(hasher, `${input.constructor.name}(`);
    for (const item of object.toArray()) value(hasher, item, depth + 1);
    feed(hasher, ')');
    return;
  }
  feed(hasher, `{${input.constructor?.name ?? 'Object'}`);
  for (const key of Object.keys(object).sort()) {
    if (SKIPPED_FIELDS.has(key)) continue;
    feed(hasher, `.${key}`);
    value(hasher, object[key], depth + 1);
  }
  feed(hasher, '}');
}

/** A sub-digest, so a texture or material shared by many meshes is hashed once. */
function subDigest(fill: (hasher: Hasher) => void, parent: Hasher): string {
  const child: Hasher = { hash: createHash('sha256'), textures: parent.textures, materials: parent.materials };
  fill(child);
  return child.hash.digest('hex');
}

function textureDigest(hasher: Hasher, texture: THREE.Texture): string {
  const cached = hasher.textures.get(texture);
  if (cached !== undefined) return cached;
  const digest = subDigest((inner) => {
    feed(inner, `Texture:${texture.constructor.name}`);
    const image = texture.image as { data?: ArrayBufferView; width?: number; height?: number; depth?: number } | null;
    feed(inner, `image:${image?.width}x${image?.height}x${image?.depth}`);
    if (image?.data !== undefined) feedBytes(inner, image.data);
    for (const key of Object.keys(texture).sort()) {
      if (SKIPPED_FIELDS.has(key) || key === 'source') continue;
      feed(inner, `.${key}`);
      value(inner, (texture as unknown as Record<string, unknown>)[key]);
    }
  }, hasher);
  hasher.textures.set(texture, digest);
  return digest;
}

function materialDigest(hasher: Hasher, material: THREE.Material): string {
  const cached = hasher.materials.get(material);
  if (cached !== undefined) return cached;
  const digest = subDigest((inner) => {
    feed(inner, `Material:${material.type}`);
    // Whether a shader patch is installed, and what program it keys: an
    // ordinary material has neither, and a leaked Ultra patch has both.
    feed(inner, `patched:${material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile}`);
    feed(inner, `programKey:${material.customProgramCacheKey()}`);
    for (const key of Object.keys(material).sort()) {
      if (SKIPPED_FIELDS.has(key)) continue;
      feed(inner, `.${key}`);
      value(inner, (material as unknown as Record<string, unknown>)[key]);
    }
  }, hasher);
  hasher.materials.set(material, digest);
  return digest;
}

function attribute(hasher: Hasher, name: string, input: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void {
  feed(hasher, `attribute:${name}:${input.constructor.name}:${input.itemSize}:${input.normalized}:${input.count}`);
  if ((input as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true) {
    const interleaved = input as THREE.InterleavedBufferAttribute;
    feed(hasher, `interleaved:${interleaved.offset}:${interleaved.data.stride}`);
    feedBytes(hasher, interleaved.data.array as unknown as ArrayBufferView);
    return;
  }
  const plain = input as THREE.BufferAttribute;
  feed(hasher, `usage:${plain.usage}:gpuType:${plain.gpuType}`);
  const perInstance = (plain as THREE.InstancedBufferAttribute).meshPerAttribute;
  if (perInstance !== undefined) feed(hasher, `meshPerAttribute:${perInstance}`);
  feedBytes(hasher, plain.array as unknown as ArrayBufferView);
}

function geometry(hasher: Hasher, input: THREE.BufferGeometry): void {
  feed(hasher, `geometry:${input.type}:${input.name}`);
  const index = input.getIndex();
  if (index === null) feed(hasher, 'index:none');
  else attribute(hasher, 'index', index);
  for (const name of Object.keys(input.attributes).sort()) attribute(hasher, name, input.attributes[name]);
  const morphs = input.morphAttributes as Record<string, (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[] | undefined>;
  for (const name of Object.keys(morphs).sort()) {
    (morphs[name] ?? []).forEach((each, at) => attribute(hasher, `morph:${name}:${at}`, each));
  }
  feed(hasher, `morphRelative:${input.morphTargetsRelative}`);
  for (const group of input.groups) feed(hasher, `group:${group.start}:${group.count}:${group.materialIndex}`);
  feed(hasher, `drawRange:${num(input.drawRange.start)}:${num(input.drawRange.count)}`);
  value(hasher, input.boundingBox);
  value(hasher, input.boundingSphere);
  value(hasher, input.userData);
}

/** One node: its own fields, and for a renderable its geometry and materials. */
function node(hasher: Hasher, object: THREE.Object3D): void {
  feed(hasher, `node:${object.type}:${object.name}:${object.visible}:${object.castShadow}:${object.receiveShadow}`);
  feed(hasher, `:${object.frustumCulled}:${object.renderOrder}:${object.layers.mask}:${object.matrixAutoUpdate}`);
  value(hasher, object.position);
  value(hasher, object.quaternion);
  value(hasher, object.scale);
  value(hasher, object.userData);
  const mesh = object as THREE.Mesh & Partial<THREE.InstancedMesh>;
  if (mesh.isMesh !== true && (object as THREE.Points).isPoints !== true && (object as THREE.Line).isLine !== true) return;
  geometry(hasher, mesh.geometry);
  value(hasher, mesh.material);
  value(hasher, mesh.customDepthMaterial);
  value(hasher, mesh.customDistanceMaterial);
  if (mesh.isInstancedMesh === true) {
    feed(hasher, `instances:${mesh.count}`);
    attribute(hasher, 'instanceMatrix', mesh.instanceMatrix!);
    if (mesh.instanceColor === null || mesh.instanceColor === undefined) feed(hasher, 'instanceColor:none');
    else attribute(hasher, 'instanceColor', mesh.instanceColor);
    value(hasher, mesh.morphTexture ?? null);
  }
}

/** The mesh families a cost category names — `render/renderCost.ts:categoryOf`'s rule, restated. */
type Family = 'surround' | 'heightfield' | 'blocks' | 'props' | 'markings' | 'hazards';

function familyOf(name: string): Family {
  if (name === 'level-heightfield') return 'heightfield';
  if (name.startsWith('level-blocks-')) return 'blocks';
  if (name.startsWith('level-props-')) return 'props';
  if (name.startsWith('level-markings')) return 'markings';
  if (name.startsWith('level-hazards')) return 'hazards';
  return 'surround';
}

/** What one built world digests to: one hash per family, the node tree, and the view's counters. */
type WorldDigest = Readonly<Record<Family | 'tree' | 'view', string>>;

/** Sixteen hex digits: 64 bits, plenty for a regression guard, short enough to read in a diff. */
const short = (hash: Hash): string => hash.digest('hex').slice(0, 16);

function digestWorld(plan: LevelPlan, recipe: PresentationRecipe | undefined): WorldDigest {
  const view = recipe === undefined ? createTerrain(plan) : createTerrain(plan, recipe);
  try {
    const textures = new Map<THREE.Texture, string>();
    const materials = new Map<THREE.Material, string>();
    const families = new Map<Family, Hasher>();
    const hasherFor = (family: Family): Hasher => {
      let hasher = families.get(family);
      if (hasher === undefined) {
        hasher = { hash: createHash('sha256'), textures, materials };
        families.set(family, hasher);
      }
      return hasher;
    };
    const tree: Hasher = { hash: createHash('sha256'), textures, materials };
    view.group.traverse((object) => {
      feed(tree, `${object.type}:${object.name}:${object.children.length}:${object.visible}:${object.layers.mask}`);
      value(tree, object.position);
      value(tree, object.quaternion);
      value(tree, object.scale);
      const renderable = (object as THREE.Mesh).isMesh === true || (object as THREE.Points).isPoints === true;
      if (renderable) node(hasherFor(familyOf(object.name)), object);
    });
    // The view's counters, by name — the pre-Ultra view's own fields and only
    // those, so an Ultra-only addition (`TerrainView.ultra`) cannot move them.
    const counters: Hasher = { hash: createHash('sha256'), textures, materials };
    feed(counters, `cells:${view.cellsDrawn}:triangles:${view.triangles}:recipe:${view.recipe}`);
    feed(counters, `blocks:${view.blockTriangles}:textures:${view.textures}`);
    const out: Record<string, string> = {};
    for (const family of ['surround', 'heightfield', 'blocks', 'props', 'markings', 'hazards'] as const) {
      const hasher = families.get(family);
      out[family] = hasher === undefined ? 'none' : short(hasher.hash);
    }
    out.tree = short(tree.hash);
    out.view = short(counters.hash);
    return out as WorldDigest;
  } finally {
    view.dispose();
  }
}

// ---------------------------------------------------------------------------
// The worlds
// ---------------------------------------------------------------------------

/** The six worlds §5 names, built exactly as the game builds them. */
const WORLDS: readonly (readonly [string, () => LevelPlan])[] = [
  ['slice', () => createSliceLevel()],
  ['belvar', () => createTrackLevel()],
  ['switchback', () => createSwitchbackLevel()],
  ['proving', () => createProvingGround()],
  ['euc', () => generateLevel('euc').plan],
  ['heavy', () => generateLevel('route-41', undefined, undefined, 65).plan],
];
const RECIPES: readonly PresentationRecipe[] = [BASELINE_PRESENTATION, ENHANCED_PRESENTATION];

interface WorldGolden {
  readonly plan: string;
  readonly baseline: WorldDigest;
  readonly enhanced: WorldDigest;
}

/**
 * Computed from the pre-Ultra tarball on 2026-09-23 by the W7 package, with
 * the command in the file comment. Never from the working tree.
 */
const GOLDENS: Readonly<Record<string, WorldGolden>> = {
  // GOLDENS-BEGIN
  slice: {
    plan: '76a2d24495a2a0e333497b2111b1a6af',
    baseline: {
      surround: '92262c0cdfb1ea25', heightfield: 'dc9fd6b39397f1ca', blocks: '7711c37132d5a26f', props: '3ce4874e28915664',
      markings: '97a9d5bc35b477ce', hazards: 'none', tree: 'c69efcb5b250aca6', view: '4f32018184ffe4be',
    },
    enhanced: {
      surround: '92262c0cdfb1ea25', heightfield: 'dc9fd6b39397f1ca', blocks: 'c20fecc900dc1137', props: 'fcc2a2aff59e348c',
      markings: '97a9d5bc35b477ce', hazards: 'none', tree: 'c69efcb5b250aca6', view: 'd46ade427516c8d2',
    },
  },
  belvar: {
    plan: 'd6c4c194d57d3ecf8ec27b9f5fc5eef5',
    baseline: {
      surround: 'a9f1a31afddb49ce', heightfield: 'd2a7264034917231', blocks: '954b3f03dde19f3c', props: '6d149c29a851a6fc',
      markings: 'db5f443384535b3d', hazards: 'none', tree: '68b103681cbf7556', view: 'cfb644091e7dce8f',
    },
    enhanced: {
      surround: 'a9f1a31afddb49ce', heightfield: 'd2a7264034917231', blocks: '954b3f03dde19f3c', props: 'b2383e7f93842712',
      markings: 'db5f443384535b3d', hazards: 'none', tree: '68b103681cbf7556', view: '9a2bf146adb725f0',
    },
  },
  switchback: {
    plan: '9907f2028681250bcb20e63b17600011',
    baseline: {
      surround: '631c48bd8233cd89', heightfield: '4973589a69efabdb', blocks: '3127a0547017cd42', props: '6367377848879145',
      markings: '14a84693a1292adb', hazards: 'none', tree: 'e538894f1b0bc6aa', view: 'b843456f5c340238',
    },
    enhanced: {
      surround: '631c48bd8233cd89', heightfield: '4973589a69efabdb', blocks: '76e61ff79ae492bb', props: 'a3f2b3f129826cf8',
      markings: '14a84693a1292adb', hazards: 'none', tree: 'e538894f1b0bc6aa', view: 'ea6c83adb4e9fd17',
    },
  },
  proving: {
    plan: '6f5e47adbe23beb05dbc717ca89cc672',
    baseline: {
      surround: 'cb25ec58310e9957', heightfield: '1e6f4aebbd94fe15', blocks: '08b91dfb55c88a15', props: 'none',
      markings: 'none', hazards: 'none', tree: '417e46e8f1d4ac23', view: '1eeab372a3b7033a',
    },
    enhanced: {
      surround: 'cb25ec58310e9957', heightfield: '1e6f4aebbd94fe15', blocks: '8f49c11740debd41', props: 'none',
      markings: 'none', hazards: 'none', tree: '417e46e8f1d4ac23', view: '0ec555a9ae992f2f',
    },
  },
  euc: {
    plan: '9bfe7a8b3252a3951f6468c6ac089f80',
    baseline: {
      surround: '5c6a2827b54b7a02', heightfield: '341f71516e017119', blocks: '770d4357d5cc0cc5', props: 'd88615985a8a2522',
      markings: '94495db000435a47', hazards: '76f9cfed878beacd', tree: '972cebc87d082e88', view: 'fe78ce13582d0efb',
    },
    enhanced: {
      surround: '5c6a2827b54b7a02', heightfield: '341f71516e017119', blocks: '646ddfc35e1d488f', props: '2e8f38626bd4ebf7',
      markings: '94495db000435a47', hazards: '76f9cfed878beacd', tree: '972cebc87d082e88', view: '640ed11341a637d9',
    },
  },
  heavy: {
    plan: 'a52c703c354f3fd2d3f4a3697b16d74b',
    baseline: {
      surround: 'fd2cfd2b9c467786', heightfield: '2be4336e35ec8a0b', blocks: 'ca02aeb4f41423f0', props: 'f23654f4f272490a',
      markings: '81f2625b329ae728', hazards: '879b95c481d118ea', tree: 'd166ba0b927856d3', view: '12c00a62cafff458',
    },
    enhanced: {
      surround: 'fd2cfd2b9c467786', heightfield: '2be4336e35ec8a0b', blocks: '5414e9d837b31118', props: 'aa07b4446bdcf211',
      markings: '81f2625b329ae728', hazards: '879b95c481d118ea', tree: 'd166ba0b927856d3', view: '36c9bc8a84b07311',
    },
  },
  // GOLDENS-END
};

const computed = new Map<string, { plan: LevelPlan; digest: string }>();
function planFor(name: string, build: () => LevelPlan): { plan: LevelPlan; digest: string } {
  let entry = computed.get(name);
  if (entry === undefined) {
    const plan = build();
    entry = { plan, digest: planDigest(plan) };
    computed.set(name, entry);
  }
  return entry;
}

const printing = process.env.EUC_PARITY_OUT;

if (printing !== undefined && printing !== '') {
  test('compute the ordinary parity digests (golden generation, run in the pre-Ultra tree)', () => {
    const out: Record<string, unknown> = {};
    for (const [name, build] of WORLDS) {
      const { plan, digest } = planFor(name, build);
      out[name] = {
        plan: digest,
        baseline: digestWorld(plan, BASELINE_PRESENTATION),
        enhanced: digestWorld(plan, ENHANCED_PRESENTATION),
      };
    }
    writeFileSync(printing, `${JSON.stringify(out, null, 2)}\n`);
  });
} else {
  for (const [name, build] of WORLDS) {
    test(`${name}: the plan is the plan the goldens were taken on`, () => {
      const golden = GOLDENS[name];
      assert.ok(golden !== undefined, `no golden for ${name}`);
      assert.equal(planFor(name, build).digest, golden.plan,
        'the plan itself moved, so the scene digests below cannot be compared — that is a level change, not a render one');
    });
    for (const recipe of RECIPES) {
      test(`${name}, ${recipe.id}: the ordinary world is byte-identical to the pre-Ultra tree`, () => {
        const golden = GOLDENS[name];
        assert.ok(golden !== undefined, `no golden for ${name}`);
        const { plan } = planFor(name, build);
        assert.deepEqual(
          digestWorld(plan, recipe),
          golden[recipe.id],
          `the ${recipe.id} ${name} world differs from the pre-Ultra tree; the family that moved names the package `
            + '(props → W3, heightfield/surround/blocks/hazards/markings → W6). Ordinary statements must be untouched.',
        );
      });
    }
  }

  test('the defaults build the baseline world, with no context', () => {
    // `createTerrain(plan)` with no recipe and no context is the call every
    // pre-M32 caller makes; it must stay the baseline world exactly.
    const { plan } = planFor('slice', WORLDS[0][1]);
    assert.deepEqual(digestWorld(plan, undefined), digestWorld(plan, BASELINE_PRESENTATION));
  });

  test('the hasher sees a one-byte change, a flag and a leaked patch', () => {
    // An audit that cannot fail is not an audit.
    const { plan } = planFor('proving', WORLDS[3][1]);
    const before = digestWorld(plan, BASELINE_PRESENTATION);
    const probe = (mutate: (group: THREE.Group) => void): WorldDigest => {
      const view = createTerrain(plan, BASELINE_PRESENTATION);
      try {
        mutate(view.group);
        const textures = new Map<THREE.Texture, string>();
        const materials = new Map<THREE.Material, string>();
        const hasher: Hasher = { hash: createHash('sha256'), textures, materials };
        view.group.traverse((object) => { if ((object as THREE.Mesh).isMesh === true && familyOf(object.name) === 'heightfield') node(hasher, object); });
        return { ...before, heightfield: short(hasher.hash) };
      } finally {
        view.dispose();
      }
    };
    const heightfield = (group: THREE.Group): THREE.Mesh => group.getObjectByName('level-heightfield') as THREE.Mesh;
    const unchanged = probe(() => {});
    assert.deepEqual(unchanged, before, 'the probe itself reproduces the digest');
    assert.notEqual(probe((group) => {
      const position = heightfield(group).geometry.getAttribute('position') as THREE.BufferAttribute;
      position.setY(0, position.getY(0) + 1e-3);
    }).heightfield, before.heightfield, 'a moved vertex');
    assert.notEqual(probe((group) => { heightfield(group).layers.enable(5); }).heightfield, before.heightfield, 'a layer');
    assert.notEqual(probe((group) => {
      const material = (heightfield(group).material as THREE.Material[])[0];
      material.onBeforeCompile = () => {};
    }).heightfield, before.heightfield, 'a shader patch on an ordinary material');
    assert.notEqual(probe((group) => {
      const material = (heightfield(group).material as THREE.MeshStandardMaterial[])[0];
      material.roughness += 0.01;
    }).heightfield, before.heightfield, 'a material parameter');
  });
}
