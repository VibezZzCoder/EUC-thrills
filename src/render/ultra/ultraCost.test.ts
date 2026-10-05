/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { prepareOriginalCapSlots, priceOriginalCapSlots } from '../originalCapSlotPrice.ts';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { NON_LEVEL_RESERVE, PART_COSTS, PROP_PART_IDS, type PropPartId } from '../../data/renderCost.ts';
import { ULTRA } from '../../data/tuning.ts';
import { generateLevel } from '../../level/generateRoute.ts';
import type { LevelPlan, Prop } from '../../level/plan.ts';
import { planRenderCost } from '../../level/renderBudget.ts';
import { createProvingGround } from '../../level/provingGround.ts';
import { createSliceLevel } from '../../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../../level/switchbackLevel.ts';
import { createTrackLevel } from '../../level/trackLevel.ts';
import { ENHANCED_PART_COSTS } from '../enhancedCatalog.ts';
import { ENHANCED_PRESENTATION, presentationCost } from '../presentation.ts';
import { headlessUltraContext, measureLevelScene, measurePartTriangles } from '../renderCost.ts';
import { createTerrain } from '../terrain.ts';
import { createUltraFacadeMaps } from './facadeMaterialAtlas.ts';
import { createUltraGroundDetail } from './ultraGroundDetail.ts';
import { ULTRA_PART_COSTS } from './ultraCatalog.ts';
import {
  cubeTargetBytes,
  HEADLESS_CAPS,
  judgeUltra,
  mipChainBytes,
  pickUltraRung,
  pmremBuildPass,
  pmremCubeSize,
  ULTRA_JUDGE_BUFFER,
  ultraBytes,
  ultraCost,
  ultraCostBreakdown,
  ultraPartSource,
  ultraEnvironmentSourceBytes,
  ultraPartTriangles,
  ultraTargetBytes,
} from './ultraCost.ts';
import { ULTRA_ENVELOPE, ULTRA_ENVELOPE_AXES } from './ultraEnvelope.ts';
import { createUltraBackgroundCube } from './ultraBackgroundCube.ts';
import { ULTRA_SLOT_ATTRIBUTE } from './ultraBuildings.ts';
import { ultraCasts } from './ultraKit.ts';
import { applyKitOverride, ULTRA_FULL, ULTRA_LADDER, ULTRA_LIT } from './ultraRecipe.ts';
import {
  ULTRA_FULL_MAPS_KEEP_PIXELS,
  ULTRA_FULL_MAPS_MIN_PIXELS,
  ultraShadowMapSizesAfter,
  ultraShadowMapSizesFor,
} from './ultraShadowSizes.ts';

/**
 * The Ultra cost model, held to the built scene — M39 (`docs/M39_ULTRA.md`
 * §5 enforcement layer 2, package W7).
 *
 * `render/renderCost.test.ts` is why `planRenderCost` can be trusted as an
 * admission contract: it measures the scene `createTerrain` really builds and
 * fails on any disagreement, exactly. This file is the same instrument one
 * tier up. `ultraCost` is the number `Renderer.setLevel` refuses Ultra on,
 * and a refusal model that drifted from the world it prices would either
 * refuse a world that fits or build one that does not — silently, because
 * nothing downstream re-counts. So every figure here is compared with
 * `measureLevelScene(plan, rung)` on the six worlds §5 names, under both
 * rungs, and the catalogue it multiplies by is compared with the kit.
 *
 * **When this file fails after a forms change, regenerate, do not edit.**
 * `node tools/render-cost.mjs --write` (or `--write-ultra` for the Ultra side
 * alone) rewrites `ultraCatalog.ts` from the built kit. A catalogue edited by
 * hand to make this pass is the drift the file exists to catch.
 *
 * Draw calls, triangles and bytes are reportable evidence. A frame interval
 * is not (`AGENTS.md`), and nothing here times anything.
 */

const MIB = 1024 * 1024;

const slice = createSliceLevel();
const worlds: readonly (readonly [string, LevelPlan])[] = [
  ['the slice', slice],
  ['BelVar Circuit', createTrackLevel()],
  ['Switchback Park', createSwitchbackLevel()],
  ['the proving ground', createProvingGround()],
  ['the euc town', generateLevel('euc').plan],
  // The heavy seed §5 names: the pinned densest route, built for the 65 mph
  // wheel, which is the most hazards and the most dressing a generated world
  // carries.
  ['the heavy seed (route-41 at 65 mph)', generateLevel('route-41', undefined, undefined, 65).plan],
];

// ---------------------------------------------------------------------------
// Model = built
// ---------------------------------------------------------------------------

for (const [name, plan] of worlds) {
  for (const rung of ULTRA_LADDER) {
    test(`${name}, ${rung.id}: the Ultra model is the built scene`, () => {
      const predicted = ultraCostBreakdown(plan, rung);
      const measured = measureLevelScene(plan, rung);
      assert.equal(predicted.colourDrawCalls, measured.drawCalls, 'colour-pass draw calls');
      assert.equal(predicted.shadowDrawCalls, measured.shadowDrawCalls,
        'shadow-pass draw calls — a part whose cast flag the kit flips is one more shadow call');
      assert.equal(predicted.colourTriangles, measured.triangles, 'colour-pass triangles');
      assert.equal(predicted.shadowTriangles, measured.shadowTriangles, 'shadow-pass triangles');
      assert.equal(predicted.frame.props.drawCalls, measured.byCategory.props.totalDrawCalls, 'prop family draw calls');
      assert.equal(predicted.frame.props.triangles, measured.byCategory.props.totalTriangles, 'prop family triangles');
      assert.equal(predicted.blockColourTriangles, measured.byCategory.blocks.triangles, 'block colour triangles');
      assert.deepEqual(predicted.frame.solo, {
        drawCalls: measured.totalDrawCalls + NON_LEVEL_RESERVE.drawCalls,
        triangles: measured.totalTriangles + NON_LEVEL_RESERVE.triangles,
      }, 'the solo frame is the level, both passes, plus the whole non-level reserve');
    });

    test(`${name}, ${rung.id}: same buckets, same instances, the rung's own cast flags`, () => {
      // §4's first rule: only triangles, attributes, materials, flags and
      // layers may differ. The buckets and their instance counts are the plan's.
      const expected = planRenderCost(plan).partInstances;
      const built = new Map<string, { instances: number; casts: boolean }>();
      for (const mesh of measureLevelScene(plan, rung).meshes) {
        if (!mesh.name.startsWith('level-props-')) continue;
        built.set(mesh.name.replace('level-props-', ''), { instances: mesh.instances, casts: mesh.castsShadow });
      }
      assert.deepEqual(
        [...built.keys()].sort(),
        [...expected.keys()].sort(),
        'an Ultra world builds exactly the ordinary part buckets',
      );
      for (const [part, count] of expected) {
        const mesh = built.get(part)!;
        assert.equal(mesh.instances, count, `${part} instances`);
        assert.equal(mesh.casts, ultraCasts(part, PART_COSTS[part].castsShadow, rung.ultra), `${part} cast flag`);
      }
    });
  }
}

test('with every geometry switch off, the Ultra model is the enhanced model exactly', () => {
  // A cross-check between two independently written models: an Ultra rung
  // that builds no Ultra forms, no Ultra buildings and no Ultra blocks is the
  // enhanced world with different materials, and must price as one.
  const bare = applyKitOverride(ULTRA_FULL, { forms: false, buildings: false, blocks: false });
  for (const [name, plan] of worlds) {
    const ultra = ultraCostBreakdown(plan, bare);
    const enhanced = presentationCost(plan, ENHANCED_PRESENTATION);
    assert.deepEqual(ultra.castFlips, [], `${name}: nothing flips without the building kit`);
    assert.equal(ultra.colourTriangles, enhanced.colourTriangles, `${name} colour triangles`);
    assert.equal(ultra.shadowTriangles, enhanced.shadowTriangles, `${name} shadow triangles`);
    assert.equal(ultra.colourDrawCalls + ultra.shadowDrawCalls, enhanced.drawCalls, `${name} draw calls`);
    assert.equal(ultra.frame.props.drawCalls, enhanced.propDrawCalls, `${name} prop draw calls`);
    assert.equal(ultra.frame.props.triangles, enhanced.propTriangles, `${name} prop triangles`);
    assert.equal(ultra.blockColourTriangles, enhanced.blockColourTriangles, `${name} block triangles`);
    assert.deepEqual(ultra.frame.solo, enhanced.frame.solo, `${name} solo frame`);
  }
});

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

test('ULTRA_PART_COSTS is what the full rung builds — every part, no more, no fewer', () => {
  const measured = measurePartTriangles(ULTRA_FULL);
  assert.deepEqual([...measured.keys()].sort(), [...PROP_PART_IDS].sort());
  for (const [part, cost] of measured) {
    const line = ULTRA_PART_COSTS[part as PropPartId];
    assert.equal(line.triangles, cost.triangles,
      `${part} triangles per instance — regenerate with node tools/render-cost.mjs --write-ultra`);
    assert.equal(line.castsShadow, cost.castsShadow, `${part} shadow flag under the full rung`);
  }
});

test('the catalogue agrees with the kit tables it is read through', () => {
  for (const part of PROP_PART_IDS) {
    // The cast flag is the full rung's own.
    assert.equal(
      ULTRA_PART_COSTS[part].castsShadow,
      ultraCasts(part, PART_COSTS[part].castsShadow, ULTRA_FULL.ultra),
      `${part} cast flag`,
    );
    // A part the full rung does not rebuild is priced exactly as on an
    // ordinary world, so its line cannot disagree with the model's price.
    const source = ultraPartSource(part, ULTRA_FULL);
    if (source === 'enhanced' || source === 'baseline') {
      assert.equal(
        ULTRA_PART_COSTS[part].triangles,
        (ENHANCED_PART_COSTS[part] ?? PART_COSTS[part]).triangles,
        `${part} is drawn with its ${source} builder and must carry its ${source} price`,
      );
    }
  }
  // The fallback rung never draws an Ultra form: its trees are the enhanced trees.
  for (const part of PROP_PART_IDS) {
    assert.notEqual(ultraPartSource(part, ULTRA_LIT), 'forms', `${part} on ultra-lit`);
    assert.equal(
      ultraPartTriangles(part, applyKitOverride(ULTRA_FULL, { forms: false, buildings: false })),
      (ENHANCED_PART_COSTS[part] ?? PART_COSTS[part]).triangles,
      `${part} with both switches off`,
    );
  }
});

test('the catalogue file is in the one-line format the generator rewrites', () => {
  // `tools/render-cost.mjs --write` finds each entry with one pattern that
  // spells it out. A part without a line, or a line split by a comment, is a
  // catalogue the generator cannot keep, so it is caught here rather than on
  // the integrator's first regeneration.
  const source = readFileSync(join(import.meta.dirname, 'ultraCatalog.ts'), 'utf8');
  const lines = source.split('\n');
  const found: string[] = [];
  for (const part of PROP_PART_IDS) {
    const pattern = new RegExp(`^\\s*${part}: \\{ triangles: \\d+, castsShadow: (?:true|false) \\},$`);
    const index = lines.findIndex((line) => pattern.test(line));
    assert.ok(index >= 0, `${part} has no generator line in ultraCatalog.ts`);
    found.push(`${index}:${part}`);
  }
  const order = found.map((entry) => Number(entry.split(':')[0]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the lines are in PROP_PART_IDS order');
});

// ---------------------------------------------------------------------------
// Every world lands on a rung
// ---------------------------------------------------------------------------

test('every shipped world and 24 generated seeds land on the full rung, inside the settled envelope', () => {
  const corpus: [string, LevelPlan][] = worlds.map(([name, plan]) => [name, plan]);
  for (let index = 1; index <= 24; index += 1) {
    const seed = `euc-${index}`;
    corpus.push([seed, generateLevel(seed).plan]);
  }
  let worst = { name: '', drawCalls: 0, triangles: 0 };
  const refused: string[] = [];
  const demoted: string[] = [];
  for (const [name, plan] of corpus) {
    const verdict = judgeUltra(plan, HEADLESS_CAPS);
    if (verdict.recipe === null) {
      refused.push(`${name}: ${JSON.stringify(verdict.refusal)}`);
      continue;
    }
    assert.equal(verdict.refusal, null);
    assert.deepEqual(verdict.cost, ultraCost(plan, verdict.recipe), `${name}: the judged cost is the rung's cost`);
    // The U3 settle was computed from this corpus on the rung each world
    // lands on, and every one landed on the full rung. A forms or dressing
    // change that pushes one of them down a rung has outgrown the settle:
    // re-measure and re-settle in §5, never loosen by hand.
    if (verdict.recipe !== ULTRA_FULL) demoted.push(`${name}: ${verdict.recipe.id}`);
    // The model now includes the exact conditional whole-cap repeat.
    const far = verdict.cost!.passes.find((pass) => pass.name === 'far-shadow-build');
    if (far !== undefined) {
      assert.ok(far.drawCalls <= ULTRA_ENVELOPE.farDepthDraws, `${name}: far depth ${far.drawCalls} calls`);
      assert.ok(far.triangles <= ULTRA_ENVELOPE.farDepthTriangles, `${name}: far depth ${far.triangles} triangles`);
    }
    if (verdict.cost!.solo.triangles > worst.triangles) {
      worst = { name, ...verdict.cost!.solo };
    }
  }
  assert.deepEqual(refused, [], `worlds refused Ultra (corpus worst ${JSON.stringify(worst)})`);
  assert.deepEqual(demoted, [], `worlds demoted off the full rung (corpus worst ${JSON.stringify(worst)})`);
});

test('A16\'s far-map slot lid is one draw of the cap bucket, exactly where a cap closes a slot', () => {
  // The model includes the exact original cap owner; compare that conditional
  // repeat against the independently built source bucket, without adding it twice.
  const expected: Record<string, number> = {
    'the slice': 1, 'BelVar Circuit': 0, 'Switchback Park': 0, 'the proving ground': 0,
    'the euc town': 1, 'the heavy seed (route-41 at 65 mph)': 1,
  };
  for (const [name, plan] of worlds) {
    const view = createTerrain(plan, ULTRA_FULL, headlessUltraContext(ULTRA_FULL));
    try {
      const lids: THREE.InstancedMesh[] = [];
      view.group.traverse((object) => {
        const mesh = object as THREE.InstancedMesh;
        if (mesh.isInstancedMesh === true && mesh.geometry.getAttribute(ULTRA_SLOT_ATTRIBUTE) !== undefined) lids.push(mesh);
      });
      assert.equal(lids.length, expected[name], `${name}: slot buckets`);
      const far = ultraCost(plan, ULTRA_FULL).passes.find((pass) => pass.name === 'far-shadow-build')!;
      let lidTriangles = 0;
      for (const mesh of lids) {
        assert.equal(mesh.name, 'level-props-buildingCap', `${name}: only the cap bucket closes slots`);
        const geometry = mesh.geometry;
        const perInstance = (geometry.index !== null ? geometry.index.count : geometry.getAttribute('position').count) / 3;
        assert.equal(perInstance, ULTRA_PART_COSTS.buildingCap.triangles, `${name}: the lid draws the cap geometry`);
        lidTriangles += perInstance * mesh.count;
      }
      const near = ultraCost(plan, ULTRA_FULL).passes.find((pass) => pass.name === 'near-shadow')!;
      assert.equal(far.drawCalls, near.drawCalls + lids.length, `${name}: actual source repeat calls`);
      assert.equal(far.triangles, near.triangles + lidTriangles, `${name}: actual source repeat triangles`);
      assert.ok(far.drawCalls <= ULTRA_ENVELOPE.farDepthDraws, `${name}: far depth as drawn, calls`);
      assert.ok(far.triangles <= ULTRA_ENVELOPE.farDepthTriangles, `${name}: far depth as drawn, triangles`);
      if (name === 'the euc town') assert.equal(lidTriangles, 5_016, 'the euc town: 114 caps × 44');
    } finally {
      view.dispose();
    }
  }
});

// ---------------------------------------------------------------------------
// The pass list
// ---------------------------------------------------------------------------

test('the pass list: two every-frame scene renders, activation-only extras, no post', () => {
  for (const [name, plan] of worlds) {
    for (const rung of ULTRA_LADDER) {
      const cost = ultraCost(plan, rung);
      const everyFrame = cost.passes.filter((pass) => pass.when === 'every-frame');
      assert.deepEqual(everyFrame.map((pass) => pass.name), ['near-shadow', 'colour'],
        `${name}, ${rung.id}: one near shadow and one colour render per frame (§2.3)`);
      assert.equal(everyFrame.length, ULTRA_ENVELOPE.steadySceneRenders);
      const levelCalls = everyFrame.reduce((sum, pass) => sum + pass.drawCalls, 0);
      const levelTriangles = everyFrame.reduce((sum, pass) => sum + pass.triangles, 0);
      assert.deepEqual(cost.solo, {
        drawCalls: levelCalls + NON_LEVEL_RESERVE.drawCalls,
        triangles: levelTriangles + NON_LEVEL_RESERVE.triangles,
      }, `${name}, ${rung.id}: solo is the two passes and the reserve`);

      const far = cost.passes.find((pass) => pass.name === 'far-shadow-build');
      assert.equal(far !== undefined, rung.ultra.farShadow, `${name}, ${rung.id}: far build iff the kit asks`);
      if (far !== undefined) {
        const near = everyFrame[0];
        assert.equal(far.when, 'activation');
        const caps = prepareOriginalCapSlots(plan);
        try { const repeat = priceOriginalCapSlots(caps, rung.ultra.buildings, rung.ultra.farShadow, ultraPartTriangles('buildingCap', rung));
          assert.equal(far.drawCalls, near.drawCalls + repeat.farExtraDraws);
          assert.equal(far.triangles, near.triangles + repeat.farExtraTriangles);
        } finally { caps.dispose(); }
        assert.ok(far.drawCalls <= ULTRA_ENVELOPE.farDepthDraws, `${name}: far depth ${far.drawCalls} calls`);
        assert.ok(far.triangles <= ULTRA_ENVELOPE.farDepthTriangles, `${name}: far depth ${far.triangles} triangles`);
      }
      const pmrem = cost.passes.find((pass) => pass.name === 'pmrem-build');
      assert.equal(pmrem !== undefined, rung.ultra.lighting, `${name}, ${rung.id}: PMREM iff lighting`);
      assert.equal(pmrem?.when ?? 'activation', 'activation');
    }
  }
  const unlit = ultraCost(slice, applyKitOverride(ULTRA_FULL, { lighting: false, farShadow: false }));
  assert.deepEqual(unlit.passes.map((pass) => pass.name), ['near-shadow', 'colour']);
});

test('the PMREM pass is what three 0.185.1 actually draws for the Ultra environment', () => {
  // Three's own generator, driven against a renderer that only counts. The
  // equirect is the size `ULTRA.env` paints and the type `ultraEnvironment.ts`
  // uploads (half float); nothing touches a GL context.
  let drawCalls = 0;
  let triangles = 0;
  const counting = {
    autoClear: true,
    toneMapping: THREE.NoToneMapping,
    xr: { enabled: false },
    getRenderTarget: () => null,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: () => {},
    compile: () => {},
    render: (mesh: THREE.Mesh) => {
      drawCalls += 1;
      const geometry = mesh.geometry;
      triangles += (geometry.index !== null ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    },
  };
  const source = new THREE.DataTexture(
    new Uint16Array(ULTRA.env.width * ULTRA.env.height * 4),
    ULTRA.env.width,
    ULTRA.env.height,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  source.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(counting as unknown as THREE.WebGLRenderer);
  const target = generator.fromEquirectangular(source);
  try {
    assert.deepEqual(pmremBuildPass(ULTRA.env.width), { drawCalls, triangles });
    // "About twenty quad draws" (§5): the model is the count, the envelope the gist.
    assert.ok(Math.abs(drawCalls - ULTRA_ENVELOPE.pmremDraws) <= 2, `${drawCalls} PMREM draws`);
    assert.equal(target.texture.type, THREE.HalfFloatType, 'RGBA16F, 8 bytes a texel');
    const environment = ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER).find((each) => each.name === 'environment')!;
    assert.equal(environment.width, target.width);
    assert.equal(environment.height, target.height);
    assert.equal(environment.bytes, target.width * target.height * 8);
    assert.equal(pmremCubeSize(ULTRA.env.width), target.height / 4);
  } finally {
    target.dispose();
    generator.dispose();
    source.dispose();
  }
});

// ---------------------------------------------------------------------------
// Bytes and the envelope
// ---------------------------------------------------------------------------

test('the byte model: §5\'s ledger, line by line', () => {
  const targets = new Map(ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER).map((target) => [target.name, target]));
  assert.equal(targets.get('near-shadow')!.bytes, 128 * MIB, '4096² at 8 B/texel');
  assert.equal(targets.get('far-shadow')!.bytes, 45 * MIB, '3072² at 5 B/texel (the §5 byte amendment)');
  assert.equal(targets.get('environment')!.bytes, 6 * MIB, 'the 256 cube, RGBA16F');
  assert.equal(targets.get('sky')!.bytes, mipChainBytes(2048, 1024, 4));
  assert.ok(Math.abs(targets.get('sky')!.bytes / MIB - 10.67) < 0.01, 'the Ultra sky with its mips');
  // A22 (Fable F3): three draws the equirect background through a cube of
  // `sky.height` a face; Ultra builds it colour only, with mips.
  assert.equal(targets.get('sky-background-cube')!.bytes, 6 * mipChainBytes(1024, 1024, 4));
  assert.equal(targets.get('sky-background-cube')!.bytes, 33_554_424, '32 MiB less 8 B: the exact chain');
  assert.equal(targets.get('ground-block-attributes (budget)')!.bytes, 8 * MIB);
  // Wave 4 (R-G, round-2 items 0 and 10): at `detail.fine` 0 nothing samples
  // the stone and soil maps, so they are neither built nor charged; the grass
  // map is charged again for the riding-distance tufts alone.
  assert.equal(ULTRA.ground.detail.fine, 0);
  assert.equal(
    targets.get('ground-detail')!.bytes,
    mipChainBytes(512, 512, 4) + mipChainBytes(256, 256, 4),
    'the ground pass\'s grass and broad maps with their chains (stone and soil unsampled at fine 0)',
  );
  assert.equal(targets.get('ground-detail')!.bytes, 1_747_624);
  assert.equal(4_543_824 - 1_747_624, 2 * mipChainBytes(512, 512, 4), 'the bytes item 0 returned and item 10 kept');
  assert.equal(mipChainBytes(1, 1, 4), 4);
  assert.equal(mipChainBytes(4, 2, 4), (8 + 2 + 1) * 4);

  const full = ultraBytes(ULTRA_FULL);
  // A22's re-settled model at the judge buffer (the Air's retina 2880×1800
  // since A26; 2560×1600 before — the same bytes, below).
  assert.equal(full.steady, 255_153_480, '243.33 MiB: §5\'s ledger with the sky cube');
  assert.equal(full.peakSwitch, 265_639_240, '253.33 MiB: steady + PMREM ping-pong 6 + half-float source 4');
  // The switch transient, term by term (Fable N5: the live ledger adds the
  // same half-float source through the same function).
  assert.equal(ultraEnvironmentSourceBytes(), 4 * MIB, '1024×512 RGBA16F, no mips');
  assert.equal(full.peakSwitch - full.steady, targets.get('environment')!.bytes + ultraEnvironmentSourceBytes());
  // A26: raising the budget from 4,096,000 to 5,184,000 moves no Ultra byte —
  // both buffers keep the full maps (A22's line is 2 MP), and nothing else
  // Ultra owns follows the buffer.
  assert.deepEqual(ULTRA_JUDGE_BUFFER, { width: 2880, height: 1800 });
  assert.deepEqual(ultraBytes(ULTRA_FULL, { width: 2560, height: 1600 }), full);
  assert.deepEqual(ultraTargetBytes(ULTRA_FULL, { width: 2560, height: 1600 }), ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER));
  assert.ok(full.steady <= ULTRA_ENVELOPE.bytes, `full rung steady ${(full.steady / MIB).toFixed(1)} MiB`);
  assert.ok(full.peakSwitch <= ULTRA_ENVELOPE.peakSwitchBytes, `full rung peak ${(full.peakSwitch / MIB).toFixed(1)} MiB`);
  assert.ok(full.peakSwitch > full.steady, 'the PMREM ping-pong and its source exist while switching');

  // The fallback rung drops the far map and nothing else that holds bytes.
  const lit = ultraBytes(ULTRA_LIT);
  assert.equal(full.steady - lit.steady, 45 * MIB);
  // A -lighting diagnostic owns no near map, environment or Ultra sky.
  const unlit = ultraTargetBytes(applyKitOverride(ULTRA_FULL, { lighting: false }), ULTRA_JUDGE_BUFFER);
  assert.deepEqual(
    unlit.map((target) => target.name)
      .filter((name) => ['near-shadow', 'environment', 'sky', 'sky-background-cube'].includes(name)),
    [],
  );
});

test('the ground-detail line is what the ground pass allocates, and only with kit.ground', () => {
  const detail = createUltraGroundDetail(1);
  try {
    const line = ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER).find((target) => target.name === 'ground-detail')!;
    assert.equal(line.bytes, detail.bytes, `model ${line.bytes} against the built ${detail.bytes}`);
  } finally {
    detail.dispose();
  }
  const noGround = ultraTargetBytes(applyKitOverride(ULTRA_FULL, { ground: false }), ULTRA_JUDGE_BUFFER);
  assert.equal(noGround.find((target) => target.name === 'ground-detail'), undefined);
});

test('only the shadow maps follow the drawing buffer, by the runtime\'s own rule (A22, Fable F5)', () => {
  const at = (width: number, height: number) => ultraTargetBytes(ULTRA_FULL, { width, height });
  const named = <T extends { readonly name: string }>(list: readonly T[], name: string): T => list.find((target) => target.name === name)!;
  // The q205 reference (1920×1080, 2.07 MP) and the Air (2560×1600) keep the
  // 4096 near and 3072 far maps: their lists are identical.
  assert.deepEqual(at(1920, 1080), at(2560, 1600));
  // A phone at the DPR-2 cap (Pixel 7: 412×839 CSS → 824×1678, 1.38 MP) gets
  // 2048 / 2048; nothing else in the list moves.
  const phone = at(824, 1678);
  const air = at(2560, 1600);
  assert.deepEqual(ultraShadowMapSizesFor(824, 1678), { near: 2048, far: 2048 });
  assert.deepEqual(ultraShadowMapSizesFor(2560, 1600), { near: ULTRA.near.mapSize, far: ULTRA.farShadow.mapSize });
  assert.equal(named(phone, 'near-shadow').width, 2048);
  assert.equal(named(phone, 'near-shadow').bytes, 32 * MIB);
  assert.equal(named(phone, 'far-shadow').width, 2048);
  assert.equal(named(phone, 'far-shadow').bytes, 20 * MIB);
  assert.deepEqual(
    phone.filter((target) => !target.name.endsWith('-shadow')),
    air.filter((target) => !target.name.endsWith('-shadow')),
    'only the two shadow maps follow the buffer',
  );
  assert.equal(ultraBytes(ULTRA_FULL, { width: 824, height: 1678 }).steady, 128_275_784, '122.33 MiB on the phone');
  // Every row's edge is what the rule answers, at every buffer tried — the
  // model restates nothing.
  for (const [width, height] of [[1920, 1080], [2560, 1600], [1440, 900], [824, 1678], [780, 1688], [1366, 1464]]) {
    const sizes = ultraShadowMapSizesFor(width, height);
    const list = at(width, height);
    assert.equal(named(list, 'near-shadow').width, sizes.near, `${width}×${height}`);
    assert.equal(named(list, 'far-shadow').width, sizes.far, `${width}×${height}`);
  }
  assert.throws(() => at(0, 0), /not a buffer/);
});

test('N1: once held, the full maps are kept down to 1.8 MP — a band, not a line — and the report can price the held maps', () => {
  const full = { near: ULTRA.near.mapSize, far: ULTRA.farShadow.mapSize };
  const small = { near: 2048, far: 2048 };
  assert.equal(ULTRA_FULL_MAPS_MIN_PIXELS, 2_000_000);
  assert.equal(ULTRA_FULL_MAPS_KEEP_PIXELS, 1_800_000);
  // Nothing held: exactly the fresh rule (activation from the ordinary tier, the model).
  for (const [width, height] of [[1920, 1080], [2000, 1000], [1999, 1000], [1900, 1000], [1700, 1000], [0, 0]]) {
    assert.deepEqual(ultraShadowMapSizesAfter(null, width, height), ultraShadowMapSizesFor(width, height), `${width}×${height}`);
  }
  // Held full: kept anywhere at or above 1.8 MP (the same object back), given up below.
  assert.equal(ultraShadowMapSizesAfter(full, 1999, 1000), full, '1.999 MP keeps the full maps');
  assert.equal(ultraShadowMapSizesAfter(full, 1900, 1000), full, '1.9 MP keeps the full maps');
  assert.equal(ultraShadowMapSizesAfter(full, 1800, 1000), full, 'exactly 1.8 MP keeps them');
  assert.deepEqual(ultraShadowMapSizesAfter(full, 1799, 1000), small, 'under 1.8 MP gives them up');
  assert.deepEqual(ultraShadowMapSizesAfter(full, 780, 1688), small, 'a phone-sized buffer gives them up');
  // Held small: taken up only at 2.0 MP, as before.
  assert.equal(ultraShadowMapSizesAfter(small, 1999, 1000), small, 'in the band the small maps stay too');
  assert.deepEqual(ultraShadowMapSizesAfter(small, 2000, 1000), full, 'the line itself takes the full maps');
  // An unmeasured buffer changes nothing already standing.
  assert.equal(ultraShadowMapSizesAfter(full, 0, 1080), full);
  assert.equal(ultraShadowMapSizesAfter(small, Number.NaN, 1080), small);
  // A drag across the line, to and fro: one change up, none back while in the band.
  let held = ultraShadowMapSizesFor(1900, 1000);
  let changes = 0;
  for (let step = 0; step < 40; step += 1) {
    const next = ultraShadowMapSizesAfter(held, step % 2 === 0 ? 2001 : 1999, 1000);
    if (next.near !== held.near || next.far !== held.far) changes += 1;
    held = next;
  }
  assert.equal(changes, 1, 'a window oscillating across 2 MP reallocates once, not at every crossing');
  // The report prices the maps held, not the fresh rule's, where the two differ.
  const inBand = { width: 1900, height: 1000 };
  const named = (list: ReturnType<typeof ultraTargetBytes>, name: string) => list.find((target) => target.name === name)!;
  assert.equal(named(ultraTargetBytes(ULTRA_FULL, inBand), 'near-shadow').width, 2048);
  assert.equal(named(ultraTargetBytes(ULTRA_FULL, inBand, full), 'near-shadow').width, ULTRA.near.mapSize);
  assert.equal(named(ultraTargetBytes(ULTRA_FULL, inBand, full), 'far-shadow').width, ULTRA.farShadow.mapSize);
  assert.deepEqual(ultraTargetBytes(ULTRA_FULL, inBand, small), ultraTargetBytes(ULTRA_FULL, inBand));
});

test('the sky-background-cube row is the cube Ultra builds: colour only, mips on (A22, Fable F3)', () => {
  const row = ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER).find((target) => target.name === 'sky-background-cube')!;
  const cube = createUltraBackgroundCube(ULTRA.sky.height);
  try {
    assert.equal(cube.width, ULTRA.sky.height, 'one face per sky row, as three\'s own conversion sizes it');
    assert.equal(cube.depthBuffer, false, 'a depth-buffered cube adds 6 × 1024² × 4 B = 24 MiB the ledger does not carry');
    assert.equal(cube.texture.generateMipmaps, true, 'the Ultra sky mips, so its cube does');
    assert.equal(row.bytes, cubeTargetBytes(cube), 'the model row is the runtime cube\'s own bytes');
  } finally {
    cube.dispose();
  }
  // The arithmetic the ledger shares: depth is six 24-bit renderbuffers (4 B a texel).
  const face = { width: 1024, texture: { generateMipmaps: true } };
  assert.equal(
    cubeTargetBytes({ ...face, depthBuffer: true }) - cubeTargetBytes({ ...face, depthBuffer: false }),
    24 * MIB,
  );
  assert.equal(cubeTargetBytes({ width: 512, depthBuffer: false, texture: { generateMipmaps: false } }), 6 * 512 * 512 * 4);
  // The ordinary sky's cube (512 a face) is not Ultra-owned and never charged.
  const ordinary = ultraTargetBytes(applyKitOverride(ULTRA_FULL, { lighting: false }), ULTRA_JUDGE_BUFFER);
  assert.equal(ordinary.find((target) => target.name === 'sky-background-cube'), undefined);
});

test('the facade companions are priced as W6 allocates them', () => {
  // `createUltraFacadeMaps` reports what it holds; the albedo's chain is
  // generated on the GPU and W6 charges it at a third over its base level,
  // which differs from the exact chain by a byte — hence the slack.
  const maps = createUltraFacadeMaps(16);
  try {
    const modelled = ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER)
      .filter((target) => target.name.startsWith('facade-'))
      .reduce((sum, target) => sum + target.bytes, 0);
    assert.ok(Math.abs(modelled - maps.bytes) <= 4, `model ${modelled} against W6's ${maps.bytes}`);
    const normal = ultraTargetBytes(ULTRA_FULL, ULTRA_JUDGE_BUFFER).find((target) => target.name === 'facade-normal')!;
    assert.equal(normal.width, maps.normal.image.width);
  } finally {
    maps.dispose();
  }
});

test('the envelope is §5\'s table, and it bounds the configuration it judges', () => {
  assert.deepEqual(
    {
      soloDraws: ULTRA_ENVELOPE.soloDraws,
      soloTriangles: ULTRA_ENVELOPE.soloTriangles,
      propDraws: ULTRA_ENVELOPE.propDraws,
      propTriangles: ULTRA_ENVELOPE.propTriangles,
      bytes: ULTRA_ENVELOPE.bytes,
      programs: ULTRA_ENVELOPE.programs,
      shadowMap: ULTRA_ENVELOPE.shadowMap,
      farShadowMap: ULTRA_ENVELOPE.farShadowMap,
      farDepthDraws: ULTRA_ENVELOPE.farDepthDraws,
      farDepthTriangles: ULTRA_ENVELOPE.farDepthTriangles,
      peakSwitchBytes: ULTRA_ENVELOPE.peakSwitchBytes,
      drawingBufferPixels: ULTRA_ENVELOPE.drawingBufferPixels,
      msaaSamples: ULTRA_ENVELOPE.msaaSamples,
      fullScreenPasses: ULTRA_ENVELOPE.fullScreenPasses,
      perFrameTargets: ULTRA_ENVELOPE.perFrameTargets,
      safetyDemotions: ULTRA_ENVELOPE.safetyDemotions,
    },
    {
      // §5's envelope settle (U3 stabilizer, 2026-09-23): the lower of §5's
      // value and ceil(corpus worst × 1.10) — see the corpus test below.
      // M39 Part P (2026-09-23, R-1, q209): re-settled with the pack-wearing
      // solo reserve, 161 → 218 and 1,031,090 → 1,035,070 (the draw axis
      // above §5's 190 by the authorised raise). QA r2 (2026-09-24): the
      // reserve counts both particle fields live, +2 calls, 218 → 220.
      soloDraws: 220,
      soloTriangles: 1_035_070,
      propDraws: 37,
      propTriangles: 450_000,
      // §5 amendment (stabilizer, 2026-09-23): far map 3072 + ground detail;
      // re-settled by A22 (final wave, P-TL) with the sky's background cube.
      bytes: 244 * MIB,
      // Environment R22: fixed Full material/cache owners enumerate 76 slots.
      // Historical standalone GPU observations remain preserved.
      programs: 76,
      shadowMap: 4096,
      farShadowMap: 3072,
      farDepthDraws: 24,
      farDepthTriangles: 249_080,
      peakSwitchBytes: 254 * MIB,
      // A26 (coordinator, 2026-09-23; the retina pair): §5's 4,096,000 → 5,184,000.
      drawingBufferPixels: 5_184_000,
      msaaSamples: 4,
      fullScreenPasses: 0,
      perFrameTargets: 0,
      safetyDemotions: 0,
    },
    'a ceiling moved: U2 settles each to min(corpus worst × 1.10, §5) and records why in §U2',
  );
  assert.deepEqual([...ULTRA_ENVELOPE_AXES].sort(), [
    'bytes', 'programs', 'propDraws', 'propTriangles', 'shadowMap', 'soloDraws', 'soloTriangles',
  ]);
  assert.ok(ULTRA.near.mapSize <= ULTRA_ENVELOPE.shadowMap, 'the near map fits its own axis');
  assert.ok(ULTRA.farShadow.mapSize <= ULTRA_ENVELOPE.farShadowMap, 'the far map fits its ceiling');
  assert.equal(ULTRA.pixelBudget, ULTRA_ENVELOPE.drawingBufferPixels, 'one pixel budget, stated twice');
  assert.equal(ULTRA_JUDGE_BUFFER.width * ULTRA_JUDGE_BUFFER.height, ULTRA.pixelBudget);
});

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

test('capability refusals are the probe\'s three, in the probe\'s order', () => {
  assert.deepEqual(
    judgeUltra(slice, { ...HEADLESS_CAPS, webgl2: false }).refusal,
    { kind: 'capability', missing: 'webgl2' },
  );
  assert.deepEqual(
    judgeUltra(slice, { ...HEADLESS_CAPS, halfFloatRenderable: false }).refusal,
    { kind: 'capability', missing: 'half-float-render' },
  );
  const small = { ...HEADLESS_CAPS, maxTextureSize: 2048 };
  const refused = judgeUltra(slice, small);
  assert.deepEqual(refused.refusal, { kind: 'capability', missing: 'max-texture-size' });
  assert.equal(refused.recipe, null);
  assert.equal(refused.cost, null);
  assert.equal(refused.rungs.length, ULTRA_LADDER.length, 'refused rungs are still priced, for the report');
  // Only a rung's own textures count: a diagnostic that owns no 4096 map is
  // not refused on a device that cannot hold one.
  const unlit = judgeUltra(slice, small, { lighting: false });
  assert.equal(unlit.refusal, null);
  assert.equal(unlit.recipe?.ultra.lighting, false);
});

test('the override is applied to every rung, and an empty one keeps the shipped rung', () => {
  const plain = judgeUltra(slice, HEADLESS_CAPS);
  assert.equal(plain.recipe, ULTRA_FULL, 'identity: the shipped rung itself, not a copy');
  assert.equal(judgeUltra(slice, HEADLESS_CAPS, {}).recipe, ULTRA_FULL);
  assert.equal(judgeUltra(slice, HEADLESS_CAPS, null).recipe, ULTRA_FULL);

  const noFar = judgeUltra(slice, HEADLESS_CAPS, { farShadow: false });
  assert.equal(noFar.recipe?.id, 'ultra-full');
  assert.equal(noFar.recipe?.ultra.farShadow, false);
  assert.equal(noFar.cost?.passes.some((pass) => pass.name === 'far-shadow-build'), false);
  for (const rung of noFar.rungs) assert.equal(rung.recipe.ultra.farShadow, false, rung.id);
});

test('the ladder takes the first rung that fits, and none when none does', () => {
  const clean = { breaches: [], textureEdge: 4096 };
  const over = { breaches: [{ axis: 'soloTriangles' as const, value: 2, ceiling: 1 }], textureEdge: 4096 };
  assert.equal(pickUltraRung([clean, clean], 16384), 0);
  assert.equal(pickUltraRung([over, clean], 16384), 1);
  assert.equal(pickUltraRung([over, over], 16384), null);
  assert.equal(pickUltraRung([{ breaches: [], textureEdge: 8192 }, clean], 4096), 1, 'a texture the device cannot hold');
});

test('a world no rung can afford is refused on the cheapest rung\'s first breach', () => {
  // The slice with a forest nobody could draw: twelve thousand canopies
  // breach the frame and the prop family on both rungs.
  const forest: Prop[] = [];
  for (let index = 0; index < 12_000; index += 1) {
    forest.push({ kind: 'treeCanopy', position: { x: (index % 120) * 3, y: 0, z: Math.floor(index / 120) * 3 }, rotationY: 0, scale: 1 });
  }
  const plan: LevelPlan = { ...slice, props: [...(slice.props ?? []), ...forest] };
  const verdict = judgeUltra(plan, HEADLESS_CAPS);
  assert.equal(verdict.recipe, null);
  assert.equal(verdict.cost, null);
  for (const rung of verdict.rungs) assert.ok(rung.breaches.length > 0, `${rung.id} breaches`);
  const cheapest = verdict.rungs[verdict.rungs.length - 1];
  assert.deepEqual(verdict.refusal, { kind: 'envelope', ...cheapest.breaches[0] });
  // Breaches are named in the envelope's own axis order.
  const order = cheapest.breaches.map((breach) => ULTRA_ENVELOPE_AXES.indexOf(breach.axis));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(cheapest.breaches.some((breach) => breach.axis === 'programs'), false,
    'programs are held live, never guessed at admission');
});

test('a rung is judged on its own cost and bytes, never on an ordinary contract', () => {
  // Contracts 1–3 and `PROP_BUDGET` never enter Ultra's verdict (§5, PLANS
  // §39.6): every value a rung is judged on is that rung's own model.
  const town = worlds.find(([name]) => name === 'the euc town')![1];
  const verdict = judgeUltra(town, HEADLESS_CAPS);
  for (const rung of verdict.rungs) {
    assert.deepEqual(rung.cost, ultraCost(town, rung.recipe), rung.id);
    const caps = prepareOriginalCapSlots(town);
    try { const price = priceOriginalCapSlots(caps, rung.recipe.ultra.buildings, rung.recipe.ultra.farShadow, ultraPartTriangles('buildingCap', rung.recipe));
      assert.equal(rung.bytes, ultraBytes(rung.recipe, ULTRA_JUDGE_BUFFER, null, null, price.flagBytes).steady, rung.id);
    } finally { caps.dispose(); }
    assert.equal(rung.textureEdge, rung.recipe.ultra.lighting ? ULTRA.near.mapSize : rung.textureEdge);
  }
});
