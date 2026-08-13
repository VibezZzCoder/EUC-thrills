/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Where this game came from, as data.
 *
 * **What this is for.** The project is MIT and forking it is welcome and
 * expected. What is not welcome is a fork stripped of its origin and re-posted
 * as somebody's own invention, which is a thing automated re-uploaders do
 * without a human ever deciding to. So the origin travels *inside* the
 * artifact rather than only beside it: this object is compiled into the
 * bundle, written into the page's metadata, printed once at boot, and checked
 * by `tools/package-github-pages.mjs` before a release is allowed to be
 * written. A copy of the built game carries all four whether or not the copier
 * kept `README.md`.
 *
 * **What it is not.** It is not a protection mechanism, and nothing here is
 * obfuscated or hidden. Anyone determined can delete every line of it in a
 * minute. It is *evidence*: a marker whose removal has to be deliberate, dated,
 * and demonstrable, which is the difference between "they also made a wheel
 * game" and "they took this one". A licence is enforced by a person with a
 * record, not by a string in a bundle — this is the record.
 *
 * **One source of truth.** Every other place these strings appear derives them
 * from here or is checked against here. A URL that is right in three files and
 * stale in the fourth is worse than one that is absent, because the stale one
 * is the one somebody quotes.
 *
 * Plain data, no imports, no behaviour — the same contract as everything else
 * in `src/data/`.
 */

export interface Provenance {
  /** The game's name, as it is published. */
  readonly title: string;
  /** The author, as they publish. A handle is an identity; a URL is proof. */
  readonly author: string;
  /** The author's profile. The one link the owner asked to be carried. */
  readonly authorUrl: string;
  /** The canonical repository. A fork's `origin` is not this; that is the point. */
  readonly repositoryUrl: string;
  /** Where the official build is served. */
  readonly homepageUrl: string;
  /** Copyright year, as a string so it reads the same in every rendering. */
  readonly year: string;
  /** SPDX identifier for the source. Assets are separate; see `NOTICE.md`. */
  readonly licence: string;
  /** SPDX identifier for the original game assets. */
  readonly assetLicence: string;
}

export const PROVENANCE: Provenance = Object.freeze({
  title: 'EUC Thrills',
  author: 'VibezZzCoder',
  authorUrl: 'https://github.com/VibezZzCoder',
  repositoryUrl: 'https://github.com/VibezZzCoder/EUC-thrills',
  // GitHub Pages hostnames are lower-cased by GitHub regardless of how the
  // account name is capitalised; the *path* keeps the repository's own case.
  // Both halves of that sentence have bitten this project once already
  // (`AGENTS.md`, "Casing cannot be verified by serving the build locally").
  homepageUrl: 'https://vibezzzcoder.github.io/EUC-thrills/',
  year: '2026',
  licence: 'MIT',
  assetLicence: 'CC-BY-4.0',
});

/**
 * The one-line origin marker, in the form every embedding uses.
 *
 * Written once so the bundle banner, the page metadata, the boot log, and the
 * packager's own refusal are all looking for the same bytes. A check that
 * builds its expected string differently from the code under test is a check
 * that passes while the artifact is wrong.
 */
export function provenanceLine(): string {
  return `${PROVENANCE.title} — original work by ${PROVENANCE.author} `
    + `(${PROVENANCE.authorUrl}). Source: ${PROVENANCE.repositoryUrl}`;
}

/**
 * The banner the built bundle carries, as a preserved legal comment.
 *
 * `/*!` rather than `/*` on purpose: minifiers strip ordinary comments and keep
 * this form, which is the whole reason the convention exists. If this ever
 * stops surviving the build, the packager refuses the release rather than
 * shipping an unmarked bundle.
 */
export function provenanceHtmlComment(): string {
  // An HTML comment ends at the first `--`, so anything containing one would
  // truncate the document rather than annotate it. Nothing above contains one
  // today; this is here so that editing a string in this file can never be the
  // reason a page stops parsing.
  const body = [
    `${PROVENANCE.title}`,
    provenanceLine(),
    `Play: ${PROVENANCE.homepageUrl}`,
    `Copyright (c) ${PROVENANCE.year} ${PROVENANCE.author}.`,
    `Code ${PROVENANCE.licence}; original game assets ${PROVENANCE.assetLicence}.`,
    '',
    'This page is the published build of that repository. A copy served from',
    'anywhere else is a fork — which the licence allows, and which is expected',
    'to say so rather than to present the work as its own.',
  ].map((line) => `      ${line}`.trimEnd()).join('\n');
  return `<!--\n${body.replaceAll('--', '––')}\n    -->`;
}

export function provenanceBanner(): string {
  return [
    '/*!',
    ` * ${PROVENANCE.title}`,
    ` * ${provenanceLine()}`,
    ` * Play: ${PROVENANCE.homepageUrl}`,
    ` * Copyright (c) ${PROVENANCE.year} ${PROVENANCE.author}.`,
    ` * Code ${PROVENANCE.licence}; original game assets ${PROVENANCE.assetLicence}. See LICENSE and NOTICE.md.`,
    ' *',
    ' * Forks are welcome and the licence allows them. Keep this notice: it is',
    ' * the condition the MIT licence attaches to every copy, and it is how the',
    ' * work stays traceable to the person who did it.',
    ' */',
  ].join('\n');
}
