#!/usr/bin/env node
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, selectTests } from './test-groups.mjs';
import { acquireLock, runCommand } from './test-process.mjs';

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const argv = process.argv.slice(2);
const mode = argv.shift();
const commandSeparator = mode === 'command' ? argv.indexOf('--') : -1;
const forwardedCommand = commandSeparator >= 0 ? argv.splice(commandSeparator).slice(1) : [];
const env = { ...process.env };
// The exporter exercises this CLI from a test fixture. Its intentional child
// runner must execute tests, not inherit Node's already-inside-a-test marker.
delete env.NODE_TEST_CONTEXT;
const takeFlag = (name) => {
  const at = argv.indexOf(name);
  if (at < 0) return false;
  argv.splice(at, 1); return true;
};
const takeValue = (name) => {
  const at = argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (at < 0) return undefined;
  const arg = argv.splice(at, 1)[0];
  const value = arg.includes('=') ? arg.slice(name.length + 1) : argv.splice(at, 1)[0];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value.`);
  return value;
};
const integer = (value, fallback, name) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer.`);
  return n;
};

// Conservative evidence, not an automatic cache: record source/config hashes
// and list changed inputs. A coordinator decides which changes invalidate a
// focused result. Never label a changed-tree full run an integrated pass.
function fingerprint() {
  const hashes = {};
  const walk = (path, allBytes = false) => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file, allBytes);
      else if (entry.isFile() && (allBytes || /\.(ts|mjs|js|json|css|html|md)$/.test(entry.name))) add(file);
    }
  };
  const add = (file) => {
    if (existsSync(file)) hashes[relative(root, file)] = createHash('sha256').update(readFileSync(file)).digest('hex');
  };
  ['src', 'tests', 'tools'].forEach((dir) => walk(join(root, dir)));
  ['assets/live', 'public', 'release'].forEach((dir) => walk(join(root, dir), true));
  ['package.json', 'package-lock.json', 'playwright.config.ts', 'vite.config.ts', 'tsconfig.json', 'index.html'].forEach((file) => add(join(root, file)));
  return hashes;
}

async function main() {
  if (mode === 'groups') {
    for (const [name, group] of Object.entries(GROUPS)) console.log(`${name}: ${group.description}`);
    return 0;
  }
  if (!['headless', 'browser', 'performance', 'command'].includes(mode)) {
    throw new Error('Use headless, browser, performance, groups, or command. See docs/TESTING.md in the development tree.');
  }
  const dryRun = takeFlag('--dry-run');
  const list = takeFlag('--list');
  const timeoutMs = integer(takeValue('--timeout-ms') ?? env.EUC_TEST_TIMEOUT_MS,
    mode === 'browser' ? 45 * 60_000 : mode === 'performance' ? 5 * 60_000 : 30 * 60_000, 'Run timeout');
  const full = takeFlag('--full');
  const smoke = takeFlag('--smoke');
  const serial = takeFlag('--serial');
  const commands = [];
  let selection;
  let nameFiltered = false;
  if (mode === 'headless') {
    if (smoke || serial) throw new Error('Use --group=smoke or --test-concurrency=1 for headless tests.');
    const groups = (takeValue('--group') ?? '').split(',').filter(Boolean);
    const pattern = takeValue('--test-name-pattern');
    nameFiltered = !!pattern;
    if (full && pattern) throw new Error('--full cannot be narrowed by --test-name-pattern. Select files instead.');
    const concurrency = integer(takeValue('--test-concurrency') ?? env.EUC_TEST_CONCURRENCY, 2, 'Test concurrency');
    selection = selectTests(root, { full, groups, files: argv });
    commands.push({ command: process.execPath, args: ['--test', '--test-reporter=spec', `--test-concurrency=${concurrency}`, `--test-timeout=${timeoutMs}`, ...(pattern ? [`--test-name-pattern=${pattern}`] : []), ...selection] });
    if (list) { console.log(selection.join('\n')); return 0; }
  } else if (mode === 'command') {
    if (full || smoke || serial || list) throw new Error('command accepts only --timeout-ms, --dry-run and a command after --.');
    if (argv.length || !forwardedCommand.length) throw new Error('command requires an executable and arguments after --.');
    commands.push({ command: forwardedCommand[0], args: forwardedCommand.slice(1) });
    selection = ['explicit command'];
  } else {
    const playwright = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
    if (!existsSync(playwright)) throw new Error('Playwright is unavailable; install the project development dependencies first.');
    if (mode === 'performance') {
      if (argv.length || full || smoke || serial) throw new Error('The performance lane is exclusive: no file, filter, project or worker overrides.');
      env.EUC_PERFORMANCE = '1';
      env.EUC_WORKERS = '1';
      selection = ['@performance'];
    } else {
      // A remembered shell environment cannot quietly switch functional QA.
      delete env.EUC_PERFORMANCE;
      let hasScope = false;
      if (full && (smoke || serial)) throw new Error('--full cannot be combined with --smoke or --serial.');
      const valueFlags = new Set(['--project', '--workers', '--grep', '-g', '--reporter', '--timeout', '--global-timeout', '--max-failures', '--repeat-each', '--shard']);
      for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('-')) {
          const flag = arg.split('=')[0];
          if (!valueFlags.has(flag)) throw new Error(`Unsupported browser option: ${arg}`);
          const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
          if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
          if ((full || smoke) && ['--project', '--grep', '-g', '--shard'].includes(flag)) throw new Error(`${flag} cannot narrow a named full/smoke scope; select specs explicitly.`);
          if (['--timeout', '--global-timeout', '--max-failures', '--repeat-each'].includes(flag)) integer(value, undefined, flag);
          if (flag === '--grep' || flag === '-g') hasScope = true;
          if (serial && flag === '--workers' && value !== '1') throw new Error('Serial selection requires one worker.');
        } else {
          const file = arg.replace(/:\d+(?::\d+)?$/, '');
          if (!/^tests\/[^.][\w/.-]*\.spec\.ts$/.test(file) || !existsSync(join(root, file)) || relative(root, realpathSync(join(root, file))).startsWith('..')) {
            throw new Error(`Specify an existing tests/*.spec.ts file (optionally :line), or -g for a test name: ${arg}`);
          }
          hasScope = true;
        }
      }
      if ((full || smoke) && hasScope) throw new Error('Choose --full, --smoke, or explicit test selectors, not a combination.');
      if (!full && !smoke && !hasScope) throw new Error('Choose browser spec files or -g NAME; test:browser:full explicitly selects the complete functional suite. One worker is not a test selection.');
      if (smoke) argv.push('tests/m9.spec.ts', '-g', 'the game boots to a title screen with the ride one click away|a key pressed at the title screen does not ride the wheel away');
      if (serial) argv.push('--project=chromium', '--workers=1');
      env.EUC_WORKERS ??= '2';
      selection = full ? ['all functional browser tests'] : [...argv];
      // Check boot before paying for a broad suite. Keep output visible and
      // stop here if it fails; this is not a second full validation pass.
      if (full && !list) commands.push({ command: process.execPath, args: [playwright, 'test', 'tests/m9.spec.ts', '--project=chromium', '--workers=1', '-g', '^.*the game boots to a title screen with the ride one click away$'] });
    }
    commands.push({ command: process.execPath, args: [playwright, 'test', ...argv, ...(list ? ['--list'] : [])] });
  }
  if (dryRun) { console.log(JSON.stringify({ mode, selection, timeoutMs, commands }, null, 2)); return 0; }
  if (list) {
    // Listing imports specs but launches no browser; still supervise the process.
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(commands[0].command, commands[0].args, { cwd: root, env, stdio: 'inherit', timeout: 30_000 });
    if (result.error) throw result.error;
    return result.status ?? 1;
  }
  const lock = acquireLock(env.EUC_VALIDATION_LOCK_DIR ?? join(tmpdir(), 'euc-validation.lock'), `${mode}: ${selection.join(', ')}`);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const output = join(root, 'test-results', 'validation', runId);
  const results = [];
  let before;
  const start = Date.now();
  try {
    mkdirSync(output, { recursive: true });
    before = fingerprint();
    writeFileSync(join(output, 'inputs-before.json'), JSON.stringify(before, null, 2));
    console.log(`[validation] ${selection.join(', ')}\n[validation] evidence: ${output}`);
    for (let i = 0; i < commands.length; i++) {
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) { results.push({ code: 124, reason: 'timeout' }); break; }
      const { command, args } = commands[i];
      const result = await runCommand(command, args, { cwd: root, env, timeoutMs: remaining, logPath: join(output, `${i + 1}.log`), onSpawn: (pid) => lock.child(pid) });
      if (mode === 'headless' && result.code === 0) {
        const log = readFileSync(join(output, `${i + 1}.log`), 'utf8').replace(/\u001b\[[0-9;]*m/g, '');
        // Node can report an empty filtered file as one passing file wrapper.
        // It is not a matched test case, despite the positive aggregate count.
        const passes = log.split('\n').filter((line) => /^\s*✔ /.test(line));
        const onlyFileWrappers = nameFiltered && passes.length > 0 && passes.every((line) => selection.some((file) => line.startsWith(`✔ ${file} (`)));
        if (/^ℹ (?:tests|pass) 0\s*$/m.test(log) || onlyFileWrappers) {
          result.code = 2; result.reason = 'empty-selection';
          console.error('[validation] No tests matched this selection; no pass is recorded.');
        }
      }
      results.push({ command, args, ...result });
      if (result.code !== 0) break;
    }
    const after = fingerprint();
    const changedInputs = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => before[f] !== after[f]);
    const code = results.at(-1)?.code ?? 1;
    writeFileSync(join(output, 'result.json'), JSON.stringify({ mode, selection, node: process.version, startedAt: new Date(start).toISOString(), durationMs: Date.now() - start, code, changedInputs, fingerprintCoverage: 'Source/test/tool text, root configuration and all runtime/public/release asset bytes. Private reference files and installed dependency contents are not fingerprinted.', environment: Object.fromEntries(Object.entries(env).filter(([key]) => /^EUC_(WORKERS|PERFORMANCE|SOFTWARE_GL|TEST_CONCURRENCY|MAX_FAILURES|GLOBAL_TIMEOUT_MS)$/.test(key))), results }, null, 2));
    writeFileSync(join(output, 'inputs-after.json'), JSON.stringify(after, null, 2));
    if (changedInputs.length) console.error(`[validation] ${changedInputs.length} input files changed during the run. Review result.json before reusing this result; it is not stable integrated evidence.`);
    return code;
  } finally { lock.release(); }
}

try { process.exitCode = await main(); }
catch (error) { console.error(`validation: ${error.message}`); process.exitCode = 2; }
