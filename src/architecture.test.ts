/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

/**
 * Architecture invariants 1 and 5, enforced rather than documented.
 *
 * **Invariant 1**: simulation/ and level/ must not import three.js. A layering
 * rule that lives only in a document gets violated; this one fails a test. It
 * is also the single reason the entire EUC controller can be unit-tested
 * headlessly — the moment a three import lands in simulation/, every test in
 * that directory needs a WebGL context, and fast tuning iteration is over.
 *
 * **Invariant 5, the options firewall** — added at M9, when the first
 * player-configurable value in the project's history came into existence.
 * Nothing the player configures may reach `simulation/`. Before M9 this was
 * vacuously true and therefore untested; the risk `docs/PLANS.md` names is
 * that it "either holds or quietly stops holding" during this milestone. The
 * second test below is what makes the difference audible: `simulation/` and
 * `level/` may not import from the presentation half of the codebase at all,
 * which makes `app/options.ts` unreachable from a controller by construction
 * rather than by discipline.
 *
 * The detectors below are themselves tested against known-positive and
 * known-negative sources. An audit that cannot fail is not an audit.
 */

const SEALED_DIRECTORIES = ['simulation', 'level'];

/**
 * Directories the sealed half may not reach into.
 *
 * `data/`, `shared/`, and `input/` are deliberately absent: the tuning table,
 * the pure maths, and the `ActionSnapshot` type are all things the controller
 * legitimately reads, and all three are free of both three.js and player
 * state. `input/` is the interesting one — a controller reads *intent*, which
 * is what makes it drivable identically by a keyboard, a gamepad, and a
 * Playwright spec. What it must never read is *configuration*, and that lives
 * in `app/`.
 */
const FORBIDDEN_LAYERS = ['app', 'ui', 'render', 'platform', 'audio', 'diagnostics'];

const SOURCE_ROOT = join(import.meta.dirname);

/**
 * Finds imports of three.js in a source file.
 *
 * Matches static imports, `export ... from`, and dynamic `import()`, for
 * `three` itself and any subpath such as `three/examples/jsm/...`.
 */
export function findThreeImports(source: string): string[] {
  const specifierPattern = /(?:^|\s)(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  const bareImportPattern = /(?:^|\s)import\s*['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requirePattern = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const found: string[] = [];
  for (const pattern of [
    specifierPattern,
    bareImportPattern,
    dynamicImportPattern,
    requirePattern,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === 'three' || specifier.startsWith('three/')) {
        found.push(specifier);
      }
    }
  }
  return found;
}

/**
 * Every module specifier a source file imports, in any form.
 *
 * Same four patterns as the three.js detector, without the filter — the
 * options firewall cares about a whole set of directories rather than one
 * package name, and a second regex that drifted from the first would be a
 * firewall with a hole in it that nothing would ever notice.
 */
export function findImports(source: string): string[] {
  const patterns = [
    /(?:^|\s)(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\s)import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Which forbidden layer a specifier reaches into, or null. */
export function forbiddenLayerFor(specifier: string, forbidden: readonly string[]): string | null {
  // Only relative specifiers can reach another source directory. A bare
  // specifier is a package, which invariant 8 already caps at one.
  if (!specifier.startsWith('.')) return null;
  const segments = specifier.split('/');
  for (const segment of segments) {
    if (forbidden.includes(segment)) return segment;
  }
  return null;
}

function collectSourceFiles(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

test('the three.js detector recognises every import form', () => {
  assert.deepEqual(findThreeImports(`import * as THREE from 'three';`), ['three']);
  assert.deepEqual(findThreeImports(`import { Vector3 } from "three";`), ['three']);
  assert.deepEqual(
    findThreeImports(`import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';`),
    ['three/examples/jsm/loaders/GLTFLoader.js'],
  );
  assert.deepEqual(findThreeImports(`export { Vector3 } from 'three';`), ['three']);
  assert.deepEqual(findThreeImports(`import 'three';`), ['three']);
  assert.deepEqual(findThreeImports(`const t = await import('three');`), ['three']);
  assert.deepEqual(findThreeImports(`const t = require('three');`), ['three']);
});

test('the three.js detector does not fire on unrelated sources', () => {
  assert.deepEqual(findThreeImports(`import { join } from 'node:path';`), []);
  assert.deepEqual(findThreeImports(`import x from './three-ways-to-fall.ts';`), []);
  assert.deepEqual(findThreeImports(`// three is not imported here`), []);
  assert.deepEqual(findThreeImports(`const three = 3;`), []);
});

test('simulation/ and level/ do not import three.js', () => {
  const offenders: string[] = [];
  let scanned = 0;

  for (const directoryName of SEALED_DIRECTORIES) {
    const files = collectSourceFiles(join(SOURCE_ROOT, directoryName));

    // A sealed directory that does not exist yet would make this test pass
    // for the wrong reason. Require at least one file so the assertion always
    // measures something real.
    assert.ok(
      files.length > 0,
      `Expected source files under src/${directoryName}/. `
        + 'An empty sealed directory makes this invariant vacuously true.',
    );

    for (const file of files) {
      scanned += 1;
      const imports = findThreeImports(readFileSync(file, 'utf8'));
      for (const specifier of imports) {
        offenders.push(`${relative(SOURCE_ROOT, file)} imports "${specifier}"`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'simulation/ and level/ must stay free of three.js so they remain headlessly '
      + 'testable (AGENTS.md invariant 1). Move rendering concerns into render/, '
      + 'and pass plain data across the boundary.\n'
      + offenders.join('\n'),
  );

  assert.ok(scanned >= 2, `Expected to scan at least 2 files, scanned ${scanned}.`);
});

test('the layer detector recognises a reach into a forbidden directory', () => {
  assert.equal(forbiddenLayerFor('../app/options.ts', FORBIDDEN_LAYERS), 'app');
  assert.equal(forbiddenLayerFor('../../src/render/Renderer.ts', FORBIDDEN_LAYERS), 'render');
  assert.equal(forbiddenLayerFor('./ui/hud.ts', FORBIDDEN_LAYERS), 'ui');

  // The permitted neighbours, and the one specifier shape that cannot reach a
  // directory at all.
  assert.equal(forbiddenLayerFor('../data/tuning.ts', FORBIDDEN_LAYERS), null);
  assert.equal(forbiddenLayerFor('../input/actions.ts', FORBIDDEN_LAYERS), null);
  assert.equal(forbiddenLayerFor('../shared/maths.ts', FORBIDDEN_LAYERS), null);
  assert.equal(forbiddenLayerFor('node:assert', FORBIDDEN_LAYERS), null);
  // A file whose *name* contains a forbidden word is not a directory reach.
  assert.equal(forbiddenLayerFor('./appearance.ts', FORBIDDEN_LAYERS), null);
});

test('the options firewall holds: simulation/ and level/ cannot reach player state', () => {
  const offenders: string[] = [];
  let scanned = 0;

  for (const directoryName of SEALED_DIRECTORIES) {
    const files = collectSourceFiles(join(SOURCE_ROOT, directoryName));
    assert.ok(files.length > 0, `Expected source files under src/${directoryName}/.`);

    for (const file of files) {
      scanned += 1;
      for (const specifier of findImports(readFileSync(file, 'utf8'))) {
        const layer = forbiddenLayerFor(specifier, FORBIDDEN_LAYERS);
        if (layer !== null) {
          offenders.push(`${relative(SOURCE_ROOT, file)} imports "${specifier}" (${layer}/)`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'The options firewall (AGENTS.md invariant 5, master §4.3): nothing the '
      + 'player configures may reach simulation/. Player options live in '
      + 'app/options.ts and are pushed into presentation systems as plain '
      + 'scalars by the composition root — a controller must never import them, '
      + 'nor anything else from app/, ui/, render/, platform/, audio/, or '
      + 'diagnostics/. If the simulation needs a number, it belongs in '
      + 'data/tuning.ts, where it is the same for every player.\n'
      + offenders.join('\n'),
  );

  assert.ok(scanned >= 2, `Expected to scan at least 2 files, scanned ${scanned}.`);
});

test('the sealed half really is reachable from a test that could catch a breach', () => {
  // A guard on the guard. Both audits above scan whatever they find; if the
  // forbidden list were ever emptied, or the sealed list, they would pass by
  // scanning nothing meaningful. Assert the lists themselves are populated and
  // disjoint, so a future edit that neuters the firewall fails here first.
  assert.ok(FORBIDDEN_LAYERS.length >= 4);
  assert.ok(SEALED_DIRECTORIES.length >= 2);
  for (const sealed of SEALED_DIRECTORIES) {
    assert.equal(
      FORBIDDEN_LAYERS.includes(sealed),
      false,
      'A sealed directory in the forbidden list would ban simulation/ from '
        + 'importing itself, which passes for the wrong reason.',
    );
  }
});
