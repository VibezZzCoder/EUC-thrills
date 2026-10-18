/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 2026-10-17 audit §3: boot work is sliced, and **a slice is never a loading
 * checkpoint**. The cover keeps exactly its nine steps and their labels. The
 * composition root and the renderer cannot be built headless, so the wiring
 * is pinned on their source, the way the other `Game.ts` readers pin theirs.
 */
const SOURCE_ROOT = join(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(join(SOURCE_ROOT, file), 'utf8');
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the renderer build yields exactly its three labelled stages; every other yield is a slice or a delegation', () => {
  const renderer = read('render/Renderer.ts');
  const start = renderer.indexOf('private *levelBuildSteps(');
  assert.ok(start > 0, 'Renderer.ts still declares levelBuildSteps');
  const body = stripComments(renderer.slice(start, renderer.indexOf('setCheckpointsVisible(visible: boolean): void {', start)));
  const yields = [...body.matchAll(/\byield\b(\*?)\s*([^;\n]*)/g)].map(([, star, rest]) => (star ? `yield* ${rest}` : rest.trim()));
  const labels = yields.filter(value => /^['"`]/.test(value));
  assert.deepEqual(labels, ["'Building streets and buildings'", "'Finishing streets and storefronts'", "'Planting trees and grass'"]);
  for (const value of yields) {
    if (labels.includes(value)) continue;
    assert.ok(value === 'PREPARATION_SLICE' || value.startsWith('yield* '), `unexpected yield in levelBuildSteps: ${value}`);
  }
  assert.ok(yields.filter(value => value === 'PREPARATION_SLICE').length >= 4, 'the build is sliced');
});

test('no other step generator in the source yields a label', () => {
  const offenders: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const file = relative(SOURCE_ROOT, full);
      const code = stripComments(readFileSync(full, 'utf8'));
      for (const match of code.matchAll(/\byield\s+(['"`][^'"`]*['"`])/g)) {
        if (file !== join('render', 'Renderer.ts')) offenders.push(`${file}: yield ${match[1]}`);
      }
    }
  };
  walk(SOURCE_ROOT);
  assert.deepEqual(offenders, []);
});

test('Game.create still stages 1, 2, 3, the renderer from 4 and 7; main.ts stages 8 and 9 of 9; boot.ts 0', () => {
  const game = read('app/Game.ts');
  const start = game.indexOf('static async create(');
  const create = game.slice(start, game.indexOf('\n  private ', start));
  const stages = [...create.matchAll(/await stage\('([^']+)', (\d+)\)/g)].map(([, label, count]) => [label, Number(count)]);
  assert.deepEqual(stages, [['Building your course', 1], ['Planning street life', 2], ['Preparing graphics', 3],
    ['Preparing riders and controls', 7]]);
  assert.match(create, /let completed = 4;\s*await renderer\.setLevelAsync\(living\.level, presentation, living\.population,\s*\(label\) => stage\(label, completed\+\+\), slicer\.slice\);/);
  assert.match(create, /await driveSteps\(preparePopulationWorldSteps\(world\.level\), \{ slice: slicer\.slice \}\)/,
    'street life is driven with the slice hook only: a label there would be refused');
  assert.match(create, /await stage\('Building your course', 1\);\s*const world = await driveSteps\(bootWorldSteps\(levelId, seed, hazardProbe, targetProbe, topSpeedMph\), \{ slice: slicer\.slice \}\);/,
    'the course build (Phase C) is driven with the slice hook only, inside stage 1');
  // `stage` is the only caller of onStage, and the slicer is never handed onStage.
  assert.equal([...create.matchAll(/onStage\(/g)].length, 1);
  assert.doesNotMatch(create, /slice:\s*\([^)]*\)\s*=>\s*(?:on)?[sS]tage/);

  const main = read('app/main.ts');
  assert.match(main, /async \(label, completed\) => \{ loading\.stage\(label, completed, 9\); await loadingPaint\(\); \}/);
  assert.match(main, /loading\.stage\('Preparing the first view', 8, 9\)/);
  assert.match(main, /loading\.stage\('Ready to ride', 9, 9\)/);
  assert.match(read('app/boot.ts'), /loading\.stage\('Loading the game', 0, 9\)/);
  // The three renderer labels plus the six above: nine visible steps after the first.
  assert.equal(stages.length + 3 + 2, 9);
});
