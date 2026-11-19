/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { createHash } from 'node:crypto';

/**
 * The page's Content-Security-Policy: what it is, how it is written into a
 * built page, and how a built page is checked against it.
 *
 * The build loads nothing from another host, and `three` is pinned with a
 * locked integrity hash. This is the enforcement of that: if a script, import,
 * style, image or request pointing at another host ever reached the page, the
 * browser refuses it instead of running it.
 *
 * GitHub Pages cannot send response headers, so the policy is a
 * `<meta http-equiv>` in the page. A meta policy cannot carry
 * `frame-ancestors`, `report-uri` or `sandbox`, and it governs only what the
 * parser reaches after it, so it sits directly after `<meta charset>` and
 * before every script, style and link.
 *
 * Inline code is allowed **by hash, never by `'unsafe-inline'`**. The hashes
 * are computed from the final built page, not from `index.html`: Vite rewrites
 * the page, and a hash of the source would refuse the page's own boot script
 * on the day a build step touched one byte of it. `vite.config.ts` writes the
 * policy into production builds only (the dev server's client injects inline
 * code of its own), and `tools/package-github-pages.mjs` refuses a page that
 * `policyProblems` faults. So: **after changing an inline script or the inline
 * style block in `index.html`, rebuild** — nothing is edited by hand.
 *
 * What each directive is for, in this game:
 *
 *   - `script-src 'self'` + hashes — the two bundled chunks, and the page's
 *     inline classic scripts. No `eval`, no `new Function`, no WebAssembly.
 *   - `style-src 'self'` + one hash — `game.css`, and the inline boot styles
 *     that paint the loading shell before anything downloads. A `style=`
 *     attribute and a run-time `<style>` are refused; the CSSOM
 *     (`element.style`, constructed sheets) is not inline style and is allowed.
 *   - `img-src 'self' data:` — the icons, and the rider logos `ui/menus.ts`
 *     embeds as `data:image/png` inside its SVG portraits.
 *   - `connect-src 'self'` — `fetch` of the recordings (`audio/AudioEngine.ts`)
 *     and Vite's module-preload polyfill.
 *   - `worker-src`, `font-src`, `media-src`, `manifest-src 'self'` — the
 *     manifest is used; the other three load nothing today and are kept at
 *     `'self'` so the policy is the one the spin-off cities ship.
 *   - `base-uri 'none'`, `form-action 'none'` — the page has no `<base>` and
 *     no form.
 *
 * Nothing needs `blob:`: there is no worker, no object URL and no service
 * worker. Navigation is not governed by this policy, so the links to the
 * repository, the devlog and the spin-off cities are unaffected.
 *
 * Node-only (`node:crypto`) and never imported by the game itself: the bundle
 * does not carry it.
 */

/** Directives in the order they are written. `{scripts}`/`{styles}` take the hashes. */
const DIRECTIVES: readonly (readonly [name: string, value: string])[] = Object.freeze([
  ['default-src', "'none'"],
  ['script-src', "'self'{scripts}"],
  ['worker-src', "'self'"],
  ['style-src', "'self'{styles}"],
  ['img-src', "'self' data:"],
  ['font-src', "'self'"],
  ['connect-src', "'self'"],
  ['media-src', "'self'"],
  ['manifest-src', "'self'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
]);

/** Script types a browser executes. Anything else is a data block and needs no hash. */
const EXECUTABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);

const BLOCKS = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi;
const POLICY_META = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/gi;
const ANY_POLICY_META = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy\b[^>]*>/gi;
const CHARSET_META = /<meta\s+charset=[^>]*>/gi;

export interface InlineBlocks {
  /** Bodies of inline scripts a browser would execute, in page order. */
  readonly scripts: readonly string[];
  /** Bodies of `<style>` elements, in page order. */
  readonly styles: readonly string[];
  /**
   * The page with every comment and every script and style *body* blanked to
   * spaces, offsets preserved: what is left is markup, so a tag-shaped string
   * inside a comment, a script or the NOTICE text block is not mistaken for one.
   */
  readonly markup: string;
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attributes);
  if (match) return match[1] ?? match[2] ?? match[3] ?? '';
  return new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, 'i').test(attributes) ? '' : null;
}

export function inlineBlocks(html: string): InlineBlocks {
  const scripts: string[] = [];
  const styles: string[] = [];
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  const markup = html.replace(BLOCKS, (whole: string, scriptAttributes?: string, scriptBody?: string, styleAttributes?: string, styleBody?: string) => {
    if (scriptAttributes !== undefined && scriptBody !== undefined) {
      const type = (attribute(scriptAttributes, 'type') ?? '').trim().toLowerCase();
      if (attribute(scriptAttributes, 'src') === null && EXECUTABLE_TYPES.has(type)) scripts.push(scriptBody);
      const open = whole.indexOf('>') + 1;
      return whole.slice(0, open) + blank(scriptBody) + whole.slice(open + scriptBody.length);
    }
    if (styleAttributes !== undefined && styleBody !== undefined) {
      styles.push(styleBody);
      const open = whole.indexOf('>') + 1;
      return whole.slice(0, open) + blank(styleBody) + whole.slice(open + styleBody.length);
    }
    return blank(whole);
  });
  return { scripts, styles, markup };
}

/** A CSP hash source for one inline block: the SHA-256 of its exact text, as UTF-8. */
export function hashSource(body: string): string {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

/** The policy this page must carry, computed from its own inline blocks. */
export function policyFor(html: string): string {
  const { scripts, styles } = inlineBlocks(html);
  const list = (bodies: readonly string[]): string => [...new Set(bodies.map(hashSource))].map((hash) => ` ${hash}`).join('');
  return DIRECTIVES
    .map(([name, value]) => `${name} ${value.replace('{scripts}', list(scripts)).replace('{styles}', list(styles))}`)
    .join('; ');
}

export function policyMetaTag(policy: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
}

/** Every policy meta in the page's markup, as written, with its content. */
export function policyMetas(html: string): { tag: string; content: string; offset: number }[] {
  const { markup } = inlineBlocks(html);
  return [...markup.matchAll(POLICY_META)].map((match) => ({ tag: match[0], content: match[1], offset: match.index }));
}

/**
 * Write the policy into a built page, directly after `<meta charset>`.
 *
 * Throws rather than guessing: a page that already has a policy, or has no
 * single charset line to anchor on, is not the page this was written for.
 */
export function insertPolicy(html: string): string {
  const { markup } = inlineBlocks(html);
  if ([...markup.matchAll(ANY_POLICY_META)].length > 0) {
    throw new Error('the page already carries a Content-Security-Policy; it is generated, never hand-written.');
  }
  const charsets = [...markup.matchAll(CHARSET_META)];
  if (charsets.length !== 1) throw new Error(`expected exactly one <meta charset> to place the policy after; found ${charsets.length}.`);
  const at = charsets[0].index + charsets[0][0].length;
  const indent = /\n([ \t]*)$/.exec(html.slice(0, charsets[0].index))?.[1] ?? '';
  const written = `${html.slice(0, at)}\n${indent}${policyMetaTag(policyFor(html))}${html.slice(at)}`;
  const problems = policyProblems(written);
  if (problems.length > 0) throw new Error(`the page cannot carry the policy:\n  - ${problems.join('\n  - ')}`);
  return written;
}

/**
 * Everything wrong with a built page's policy; empty when it is sound.
 *
 * Exact equality with `policyFor` already implies most of what follows. The
 * rest is spelled out so that a refusal names the fault, and so that a change
 * to `DIRECTIVES` which loosened the policy would be caught by the checks
 * rather than vouched for by them.
 */
export function policyProblems(html: string): string[] {
  const problems: string[] = [];
  const { markup } = inlineBlocks(html);
  if (html.includes('\r')) problems.push('the page contains a carriage return; a browser hashes inline blocks after normalising line ends, so the hashes would not match.');

  const any = [...markup.matchAll(ANY_POLICY_META)];
  const metas = policyMetas(html);
  if (any.length !== 1 || metas.length !== 1) {
    problems.push(`expected exactly one <meta http-equiv="Content-Security-Policy" content="…">; found ${any.length} (${metas.length} in the generated form).`);
    return problems;
  }
  const { content, offset } = metas[0];

  const expected = policyFor(html);
  if (content !== expected) problems.push(`the policy does not match the page's inline scripts and styles. Rebuild (npm run build:pages).\n      page:     ${content}\n      expected: ${expected}`);

  const charset = [...markup.matchAll(CHARSET_META)][0];
  if (!charset || charset.index > offset) problems.push('the policy is not after <meta charset>.');
  const first = /<(?:script|style|link)\b/i.exec(markup);
  if (first && first.index < offset) problems.push(`the policy comes after a <${first[0].slice(1)}> element, which it therefore does not govern.`);

  for (const keyword of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'", "'strict-dynamic'"]) {
    if (content.includes(keyword)) problems.push(`the policy contains ${keyword}.`);
  }
  for (const directive of content.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    for (const source of sources) {
      const allowed = source === "'self'" || source === "'none'"
        || /^'sha256-[A-Za-z0-9+/]{43}='$/.test(source)
        || (source === 'data:' && name === 'img-src');
      if (!allowed) problems.push(`${name} allows ${source}; only 'self', 'none', sha256 hashes and (for img-src) data: may appear.`);
    }
  }
  if (!/(?:^|;\s*)default-src 'none'(?:;|$)/.test(content)) problems.push("the policy does not start from default-src 'none'.");

  for (const tag of markup.matchAll(/<[a-zA-Z][^<>]*>/g)) {
    const names = tag[0].replace(/"[^"]*"|'[^']*'/g, '""');
    const handler = /\s(on[a-z]+)\s*=/i.exec(names);
    if (handler) problems.push(`an inline ${handler[1]} handler, which the policy refuses: ${tag[0].slice(0, 80)}`);
    if (/\sstyle\s*=/i.test(names)) problems.push(`a style attribute, which the policy refuses: ${tag[0].slice(0, 80)}`);
    if (/^<base\b/i.test(tag[0])) problems.push("a <base> element, which base-uri 'none' refuses.");
    if (/=\s*["']?\s*javascript:/i.test(tag[0])) problems.push(`a javascript: URL, which the policy refuses: ${tag[0].slice(0, 80)}`);
  }
  return problems;
}
