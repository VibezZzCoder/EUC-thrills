/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { shareableWorldLink } from './shareLink.ts';
import { PROVENANCE } from '../data/provenance.ts';

const HOME = PROVENANCE.homepageUrl;

test('a page served over http shares its own address unchanged', () => {
  const href = 'http://localhost:5173/?level=generated&seed=ABCD-1234&debug=1#top';
  assert.equal(shareableWorldLink(href, HOME), href);
});

test('a page served over https shares its own address unchanged, fork or not', () => {
  const official = `${HOME}?level=track`;
  assert.equal(shareableWorldLink(official, HOME), official);
  const fork = 'https://example.org/some/fork/index.html?level=switchback';
  assert.equal(shareableWorldLink(fork, HOME), fork);
});

test('a file page shares the official address with the world query and nothing of the file', () => {
  const cases = [
    // A mac download folder, with an account name in the path.
    'file:///Users/someone/Downloads/EUC-Thrills-1.0.0.html?level=generated&seed=RIVER-42#frag',
    // A Windows drive path, which a URL parser keeps in `pathname`.
    'file:///C:/Users/x/Downloads/EUC-Thrills-1.0.0.html?level=generated&seed=RIVER-42',
  ];
  for (const href of cases) {
    const shared = shareableWorldLink(href, HOME);
    assert.equal(shared, `${HOME}?level=generated&seed=RIVER-42`);
    const url = new URL(shared);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.searchParams.get('level'), 'generated');
    assert.equal(url.searchParams.get('seed'), 'RIVER-42');
    assert.equal(url.hash, '');
    for (const fragment of ['Users', 'someone', 'Downloads', 'C:', 'EUC-Thrills-1.0.0.html', 'frag']) {
      assert.ok(!shared.includes(fragment), `${fragment} leaked into ${shared}`);
    }
  }
});

test('a file page with no query shares the official address exactly', () => {
  assert.equal(shareableWorldLink('file:///Users/someone/Downloads/EUC-Thrills-1.0.0.html', HOME), HOME);
  assert.equal(shareableWorldLink('file:///C:/Users/x/game.html#seed', HOME), HOME);
});

test('blob, data and unparseable addresses also share the official address', () => {
  assert.equal(shareableWorldLink('blob:null/4a6c-11?level=track', HOME), `${HOME}?level=track`);
  assert.equal(shareableWorldLink('data:text/html,hello', HOME), HOME);
  assert.equal(shareableWorldLink('not a url', HOME), HOME);
});
