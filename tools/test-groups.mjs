/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Groups select existing tests; they never infer that other contracts are safe.
// Keep discovery inside the two authored roots so scratch copies cannot join a run.
export function discoverTests(root) {
  const found = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && /\.test\.(ts|mjs|js)$/.test(entry.name)) {
        found.push(relative(root, path).split(sep).join('/'));
      }
    }
  }
  walk(join(root, 'src'));
  walk(join(root, 'tools'));
  return found.sort();
}

const named = (...names) => (file) => names.includes(file);
export const GROUPS = Object.freeze({
  smoke: { description: 'Small headless checks of app states, actions and pane layout.', match: named(
    'src/app/appState.test.ts', 'src/input/actions.test.ts', 'src/shared/paneGrid.test.ts',
  ) },
  ui: { description: 'UI models and menu navigation; add affected browser journeys.', match: (f) => f.startsWith('src/ui/') },
  input: { description: 'Device routing, bindings, keyboard, pads and touch.', match: (f) => f.startsWith('src/input/') },
  simulation: { description: 'Simulation contracts, including potentially expensive rides.', match: (f) => f.startsWith('src/simulation/') },
  render: { description: 'All render tests, including expensive clearance sweeps.', match: (f) => f.startsWith('src/render/') },
  level: { description: 'All level tests, including expensive generation surveys.', match: (f) => f.startsWith('src/level/') },
  audio: { description: 'Audio ownership, synthesis and arithmetic.', match: (f) => f.startsWith('src/audio/') },
  contracts: { description: 'Shared source-reading architecture, tuning and provenance guards.', match: named(
    'src/architecture.test.ts', 'src/data/liveTuning.test.ts',
    'src/data/rideStyles.test.ts', 'src/data/provenance.test.ts',
  ) },
  release: { description: 'Local publication-tool contracts; unavailable in public source snapshots.', match: (f) => /^tools\/(export-source|package-github-pages|private-tokens|public-suite|install-manifest)\.test\.mjs$/.test(f) },
  slow: { description: 'Known expensive clearance, generation and render-accounting sweeps.', match: named(
    'src/render/riderClearance.test.ts', 'src/render/riderClearanceRidden.test.ts',
    'src/level/generatedLevel.test.ts', 'src/level/topSpeedRoutes.test.ts',
    'src/render/renderCost.test.ts', 'tools/render-cost.test.mjs',
  ) },
});

export function selectTests(root, { full = false, groups = [], files = [] } = {}) {
  root = realpathSync(root);
  if (full && (groups.length || files.length)) throw new Error('--full cannot be combined with a targeted scope.');
  if (!full && !groups.length && !files.length) {
    throw new Error('Choose test files or --group=NAME. Use npm run test:groups for choices; npm run test:full explicitly selects everything.');
  }
  const all = discoverTests(root);
  const selected = new Set(full ? all : []);
  for (const group of groups) {
    if (!GROUPS[group]) throw new Error(`Unknown test group: ${group}`);
    const matches = all.filter(GROUPS[group].match);
    if (!matches.length) throw new Error(`Group ${group} has no available tests in this tree.`);
    matches.forEach((f) => selected.add(f));
  }
  for (const file of files) {
    const path = resolve(root, file);
    const local = relative(root, path).split(sep).join('/');
    if (!all.includes(local) || realpathSync(path) !== path) {
      throw new Error(`Not an authored test file under src/ or tools/: ${file}`);
    }
    selected.add(local);
  }
  if (!selected.size) throw new Error('The selected scope contains no tests.');
  return [...selected].sort();
}
