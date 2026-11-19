/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  hashSource,
  inlineBlocks,
  insertPolicy,
  policyFor,
  policyMetas,
  policyProblems,
} from './contentSecurityPolicy.ts';

/**
 * The policy, checked where it is authored.
 *
 * Two halves. The first is the generator and the checker against a small page
 * and a set of planted faults: a checker is only worth trusting once each
 * refusal has been seen to fire. The second reads the project's own
 * `index.html` and UI sources for the things the policy refuses, because those
 * fail only in a production build — the dev server carries no policy — and
 * nobody plays the production build while writing a menu.
 *
 * `tools/content-security-policy.test.mjs` checks the built page itself.
 */

const PAGE = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <!-- a comment with <script>alert(1)</script> and <style>x{}</style> in it -->',
  '    <meta charset="utf-8" />',
  '    <title>t</title>',
  '    <script>window.a = 1;</script>',
  '    <style>body { margin: 0; }</style>',
  '    <link id="game-styles" rel="stylesheet" href="./assets/game.css" media="print" />',
  '    <script type="module" crossorigin src="./assets/index.js"></script>',
  '  </head>',
  '  <body>',
  '    <script>window.b = "é";</script>',
  '    <script type="text/plain" id="notice"><script>not code</script>',
  '  </body>',
  '</html>',
  '',
].join('\n');

const sha = (text: string): string => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

test('only executable inline scripts and style blocks are named', () => {
  const { scripts, styles, markup } = inlineBlocks(PAGE);
  assert.deepEqual(scripts, ['window.a = 1;', 'window.b = "é";']);
  assert.deepEqual(styles, ['body { margin: 0; }']);
  // Offsets are preserved, and nothing inside a comment, a script or a data
  // block is left looking like markup.
  assert.equal(markup.length, PAGE.length);
  assert.ok(!markup.includes('alert'));
  assert.ok(!markup.includes('not code'));
  assert.equal(hashSource('window.a = 1;'), sha('window.a = 1;'));
});

test('the policy is the target policy plus the page’s own hashes', () => {
  assert.equal(
    policyFor(PAGE),
    `default-src 'none'; script-src 'self' ${sha('window.a = 1;')} ${sha('window.b = "é";')}; worker-src 'self'; `
      + `style-src 'self' ${sha('body { margin: 0; }')}; img-src 'self' data:; font-src 'self'; connect-src 'self'; `
      + "media-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'",
  );
});

test('the policy is written once, after the charset and before every script, style and link', () => {
  const written = insertPolicy(PAGE);
  assert.deepEqual(policyProblems(written), []);
  const metas = policyMetas(written);
  assert.equal(metas.length, 1);
  assert.ok(metas[0].offset > written.indexOf('<meta charset'));
  assert.ok(metas[0].offset < written.indexOf('<title>'));
  // Writing it changed no inline block, so the hashes still name the page.
  assert.equal(metas[0].content, policyFor(written));
  assert.throws(() => insertPolicy(written), /already carries/);
  assert.throws(() => insertPolicy(PAGE.replace('<meta charset="utf-8" />', '')), /exactly one <meta charset>/);
});

test('every fault the checker exists for is refused', () => {
  const good = insertPolicy(PAGE);
  const policy = policyMetas(good)[0].content;
  const faults: [name: string, page: string, expected: RegExp][] = [
    ['no policy', PAGE, /exactly one/],
    ['two policies', good.replace('<title>', `${policyMetas(good)[0].tag}<title>`), /exactly one/],
    ['a hand-written second policy', good.replace('<title>', "<meta content=\"default-src *\" http-equiv='content-security-policy'><title>"), /exactly one/],
    ['an inline script changed after the build', good.replace('window.a = 1;', 'window.a = 2;'), /does not match/],
    ['the inline style changed after the build', good.replace('margin: 0', 'margin: 1px'), /does not match/],
    ['an inline script added after the build', good.replace('</body>', '<script>fetch("https://csp-probe.invalid/")</script></body>'), /does not match/],
    ['unsafe-inline', good.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"), /'unsafe-inline'/],
    ['unsafe-eval', good.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"), /'unsafe-eval'/],
    ['another host', good.replace("connect-src 'self'", "connect-src 'self' https://csp-probe.invalid"), /connect-src allows https:\/\/csp-probe\.invalid/],
    ['a wildcard', good.replace("img-src 'self' data:", 'img-src *'), /img-src allows \*/],
    ['data: outside img-src', good.replace("connect-src 'self'", "connect-src 'self' data:"), /connect-src allows data:/],
    ['blob:', good.replace("worker-src 'self'", "worker-src 'self' blob:"), /worker-src allows blob:/],
    ['an inline handler', good.replace('media="print" />', 'media="print" onload="this.dataset.loaded=\'true\'" />'), /inline onload handler/],
    ['a style attribute', good.replace('<body>', '<body style="margin:0">'), /style attribute/],
    ['a base element', good.replace('<title>', '<base href="https://csp-probe.invalid/"><title>'), /<base>/],
    ['a carriage return', good.replace('<title>', '\r\n<title>'), /carriage return/],
    [
      'a policy placed after a script',
      PAGE.replace('<link id="game-styles"', `${policyMetas(good)[0].tag}\n    <link id="game-styles"`),
      /comes after a <script>/,
    ],
  ];
  for (const [name, page, expected] of faults) {
    const problems = policyProblems(page);
    assert.ok(problems.some((problem) => expected.test(problem)), `${name}: expected ${expected}, got ${JSON.stringify(problems)}`);
  }
  // The control: the faults above are refused for what was planted, not
  // because the checker refuses everything.
  assert.deepEqual(policyProblems(good), []);
  assert.ok(policy.startsWith("default-src 'none'; "));
});

// -- The project's own page and UI sources ----------------------------------

const ROOT = new URL('../../', import.meta.url);
const SOURCE_PAGE = readFileSync(new URL('index.html', ROOT), 'utf8');

test('index.html can carry the policy as written', () => {
  // The source page, not the built one: this is the early warning. An inline
  // handler or a style attribute typed into `index.html` fails here, at the
  // desk, instead of at the packager.
  const written = insertPolicy(SOURCE_PAGE);
  assert.deepEqual(policyProblems(written), []);
  const { scripts, styles } = inlineBlocks(SOURCE_PAGE);
  // Scroll snap-back, the stylesheet flags, the boot-failure recovery; and the
  // boot styles. A change here is a change to the policy's hash list, which is
  // fine and automatic — the count is pinned so that it is also deliberate.
  assert.equal(scripts.length, 3, 'inline scripts in index.html');
  assert.equal(styles.length, 1, 'inline style blocks in index.html');
});

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) && !/\.test-support\.ts$/.test(entry.name)) found.push(path);
  }
  return found;
}

test('no shipped source builds markup the policy refuses', () => {
  const offenders: string[] = [];
  const files = sourceFiles(new URL('src/', ROOT).pathname.replace(/%20/g, ' '));
  assert.ok(files.length > 100, `expected to scan the source tree, scanned ${files.length}`);
  const refused: [what: string, pattern: RegExp][] = [
    // In a template, `style="…"`; `element.style.x = …` is the CSSOM and fine.
    ['a style attribute in a template', /\sstyle\s*=\s*\\?["'`$]/],
    ['setAttribute("style")', /setAttribute\(\s*['"`]style['"`]/],
    ['an inline event handler in a template', /<[a-z][^>]*\son[a-z]+\s*=\s*\\?["'`$]/i],
    ['eval or new Function', /\beval\(|new Function\(/],
    ['an object URL or a worker', /createObjectURL|new (?:Shared)?Worker\(|serviceWorker\.register/],
  ];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const [what, pattern] of refused) {
        if (pattern.test(line)) offenders.push(`${file.slice(file.indexOf('/src/') + 1)}:${index + 1}: ${what}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'the built page’s Content-Security-Policy would refuse:\n' + offenders.join('\n'));

  // One run-time <style> is known and deliberate: the diagnostics fallback for
  // a browser without constructed style sheets. Any other is a refusal waiting
  // for a production build.
  const styleMakers = files.filter((file) => /createElement\(\s*['"`]style['"`]\s*\)/.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(file.indexOf('/src/') + 1));
  assert.deepEqual(styleMakers, ['src/diagnostics/panelStyles.ts']);
});
