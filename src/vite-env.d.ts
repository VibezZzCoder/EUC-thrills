/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Vite's `?url` asset-import suffix, declared by hand.
 *
 * The project deliberately types against `["node"]` rather than pulling in
 * `vite/client` wholesale — the headless suite runs source files directly
 * under `node --test`, and the narrower the ambient surface, the harder it is
 * for browser-only assumptions to leak into files that suite imports. Only
 * the one suffix the game actually uses is declared, and only
 * `audio/samples.ts` (imported solely by the composition root) uses it.
 */
declare module '*.wav?url' {
  const url: string;
  export default url;
}
