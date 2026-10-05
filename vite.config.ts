/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
import { PROVENANCE, provenanceBanner, provenanceHtmlComment } from './src/data/provenance.ts';

/**
 * Stamp the page with where it came from.
 *
 * Injected at build time from `src/data/provenance.ts` rather than typed into
 * `index.html`, because the packager refuses a release whose page is missing
 * these strings — and a hand-maintained copy of a checked value is a release
 * that fails on the day somebody edits one of the two. The dev server runs the
 * same transform, so what is inspected locally is what ships.
 */
function provenancePlugin() {
  return {
    name: 'euc-thrills-provenance',
    transformIndexHtml(html: string) {
      return {
        html: html.replace('<head>', `<head>\n    ${provenanceHtmlComment()}`),
        tags: [
          { tag: 'meta', attrs: { name: 'author', content: PROVENANCE.author }, injectTo: 'head' as const },
          { tag: 'link', attrs: { rel: 'author', href: PROVENANCE.authorUrl }, injectTo: 'head' as const },
          // The canonical location of *this* build. A fork served elsewhere
          // either points here, or has removed the line on purpose.
          { tag: 'link', attrs: { rel: 'canonical', href: PROVENANCE.homepageUrl }, injectTo: 'head' as const },
          { tag: 'link', attrs: { rel: 'code-repository', href: PROVENANCE.repositoryUrl }, injectTo: 'head' as const },
          {
            tag: 'meta',
            attrs: {
              name: 'license',
              content: `${PROVENANCE.licence} (code), ${PROVENANCE.assetLicence} (original assets)`,
            },
            injectTo: 'head' as const,
          },
          { tag: 'meta', attrs: { property: 'og:title', content: PROVENANCE.title }, injectTo: 'head' as const },
          { tag: 'meta', attrs: { property: 'og:url', content: PROVENANCE.homepageUrl }, injectTo: 'head' as const },
        ],
      };
    },
  };
}

/**
 * Minify the stylesheet the page links for itself.
 *
 * `index.html` links `src/ui/game.css` with `media="print"` and swaps it in
 * when it has loaded, so the stylesheet never blocks the static loading shell
 * (`docs/LOADING.md`, 2026-10-03). Vite bundles a linked stylesheet only when
 * the tag has no `media` attribute; with one, it copies the file as a plain
 * asset, comments and all. That shipped the 213 KB source in place of its
 * 52 KB minified form and put the Pages package over its 8 MB transfer budget
 * (`tools/package-github-pages.mjs`). This minifies such assets with the same
 * esbuild CSS minifier Vite applies to every stylesheet it bundles: same file,
 * same link, same attributes, same loading — fewer bytes.
 */
function minifyLinkedCssPlugin(): Plugin {
  return {
    name: 'euc-thrills-minify-linked-css',
    apply: 'build',
    async generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        const source = typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
        file.source = (await transformWithEsbuild(source, file.fileName, { minify: true })).code;
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const githubPages = mode === 'github-pages';

  return {
    plugins: [provenancePlugin(), minifyLinkedCssPlugin()],
    // GitHub Pages serves project sites below /<repository>/. Relative asset
    // URLs keep the generated package independent of the eventual repo name,
    // and of whether it is served from a subpath at all. A default production
    // build emits absolute /assets/... URLs that break under a subpath, so
    // public packaging is an explicit mode rather than the default.
    base: githubPages ? './' : '/',
    server: {
      // `PORT` is how the editor's preview launcher hands over a free port
      // when more than one session wants a dev server at once, and Vite does
      // not read that variable on its own. Falls back to Vite's usual 5173,
      // which is the port AGENTS.md documents and the one
      // `playwright.config.ts` waits on — that run sets no `PORT`, so the
      // suite is unaffected.
      port: Number(process.env.PORT) || 5173,
      strictPort: false,
    },
    // Keep the origin banner through minification. esbuild's default for a
    // production build is to drop legal comments entirely, which would remove
    // the one marker a copied bundle carries — `/*!` only means "preserve this"
    // to a minifier that has been told to preserve them.
    esbuild: {
      legalComments: 'inline',
    },
    build: {
      target: 'es2022',
      // Keep maps in local production builds for debugging, but do not ship
      // the private source tree inside the player-facing snapshot.
      sourcemap: !githubPages,
      rollupOptions: {
        output: {
          // The bundle says where it came from, in the artifact itself rather
          // than only in the repository around it. `src/data/provenance.ts`
          // explains what this is and is not for; the short version is that a
          // fork re-posted by an automated uploader carries it, and removing it
          // has to be a deliberate act rather than an accident of tooling.
          banner: provenanceBanner(),
        },
      },
    },
  };
});
