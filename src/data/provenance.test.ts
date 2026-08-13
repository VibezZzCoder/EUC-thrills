/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  PROVENANCE,
  provenanceBanner,
  provenanceHtmlComment,
  provenanceLine,
} from './provenance.ts';

/**
 * The origin marker, checked where it is authored.
 *
 * These are string properties rather than behaviour, and they are worth a test
 * for one reason: every consumer of this file embeds it into something with its
 * own syntax — a JavaScript comment, an HTML comment, an attribute value — and
 * each of those has a character that would end it early. A URL that truncates
 * the document it was meant to annotate is worse than no URL at all, and it is
 * the kind of thing nobody re-reads once it has shipped working.
 *
 * `tools/package-github-pages.test.mjs` asserts the other half: that what is
 * authored here reaches the built artifact, and that a release which lost it is
 * refused.
 */

test('every published URL is absolute and https', () => {
  // Relative anywhere here would resolve against whichever page is *serving* a
  // copy, which points a fork's attribution at the fork.
  for (const [field, value] of Object.entries(PROVENANCE)) {
    if (!field.endsWith('Url')) continue;
    assert.match(value, /^https:\/\/[a-z0-9.-]+\//i, `${field} is not an absolute https URL: ${value}`);
  }
  assert.ok(
    PROVENANCE.repositoryUrl.startsWith(PROVENANCE.authorUrl),
    'the repository must live under the author it names',
  );
});

test('the GitHub Pages host is lower case, whatever the account looks like', () => {
  // GitHub lower-cases the hostname of a project site regardless of how the
  // account is capitalised, and keeps the repository's own case in the path.
  // Getting this backwards produces a URL that works when clicked from a
  // rendered README and 404s when typed — the same case-sensitivity trap
  // `AGENTS.md` records for the build's own asset paths.
  const host = new URL(PROVENANCE.homepageUrl).hostname;
  assert.equal(host, host.toLowerCase(), `the Pages hostname must be lower case: ${host}`);
  assert.ok(
    host.startsWith(`${PROVENANCE.author.toLowerCase()}.`),
    `the Pages host does not belong to ${PROVENANCE.author}: ${host}`,
  );
});

test('the origin line names the author and the source', () => {
  const line = provenanceLine();
  for (const needle of [PROVENANCE.title, PROVENANCE.author, PROVENANCE.authorUrl, PROVENANCE.repositoryUrl]) {
    assert.ok(line.includes(needle), `the origin line omits "${needle}"`);
  }
});

test('the bundle banner is a legal comment a minifier keeps', () => {
  const banner = provenanceBanner();
  assert.ok(banner.startsWith('/*!'), 'only /*! survives minification');
  assert.ok(banner.trimEnd().endsWith('*/'), 'the comment has to close');
  // A `*/` in the middle would end the comment early and leave the rest of the
  // banner as syntax errors at the top of the bundle.
  assert.equal(banner.slice(0, -2).includes('*/'), false, 'the banner closes itself early');
  assert.ok(banner.includes(PROVENANCE.repositoryUrl), 'the banner is the packager’s needle');
});

test('the page comment cannot truncate the document', () => {
  const comment = provenanceHtmlComment();
  assert.ok(comment.startsWith('<!--'), 'it has to be a comment');
  assert.ok(comment.trimEnd().endsWith('-->'), 'and it has to close');
  // An HTML comment ends at the first `--`, so the only one allowed is the
  // closing delimiter's own.
  assert.equal(comment.slice(4, -3).includes('--'), false, 'a bare -- would end the comment early');
  for (const needle of [PROVENANCE.author, PROVENANCE.authorUrl, PROVENANCE.repositoryUrl, PROVENANCE.homepageUrl]) {
    assert.ok(comment.includes(needle), `the page comment omits "${needle}"`);
  }
});
