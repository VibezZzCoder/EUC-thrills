/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * One stylesheet, shared by the debug overlay and the tuning panel, injected
 * the first time either of them is shown.
 *
 * Lazy on purpose. A developer tool that costs nothing until someone opens it
 * costs nothing in a player's build, which is what lets both panels ship
 * unconditionally instead of behind a build flag — and a debug tool that only
 * exists in development is a debug tool that is unavailable at exactly the
 * moment a released build misbehaves.
 *
 * Everything is scoped under `.euc-diag` and all geometry is CSS. Script
 * writes values and reads state; it never lays out (master starter 14).
 */

const STYLE_ID = 'euc-diagnostics-style';

const CSS = `
.euc-diag {
  position: fixed;
  z-index: 30;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #dfe6ef;
  background: rgba(10, 14, 19, 0.82);
  border: 1px solid rgba(140, 165, 195, 0.28);
  border-radius: 8px;
  backdrop-filter: blur(6px);
  padding: 0.6rem 0.75rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
  overscroll-behavior: contain;
}

.euc-diag[hidden] { display: none; }

.euc-diag h2 {
  margin: 0 0 0.5rem;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8fa3bb;
  font-weight: 600;
}

.euc-diag h3 {
  margin: 0.7rem 0 0.3rem;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6f8098;
  font-weight: 600;
}

.euc-diag h3:first-of-type { margin-top: 0.2rem; }

#euc-debug-overlay {
  top: 1rem;
  left: 1rem;
  width: 20rem;
  pointer-events: none;
}

#euc-tuning-panel {
  top: 1rem;
  right: 1rem;
  width: 20.5rem;
}

/* Both tools are useful together, including in the narrow viewport used by
   browser QA. Below the width where they fit side by side, give each half of
   the screen and its own scroll area instead of letting the tuning panel hide
   the authoritative state underneath it. */
@media (max-width: 45rem) {
  #euc-debug-overlay,
  #euc-tuning-panel {
    width: calc(100vw - 2rem);
    max-height: calc(50vh - 1.5rem);
  }

  #euc-tuning-panel {
    top: auto;
    bottom: 1rem;
  }
}

.euc-diag dl {
  display: grid;
  grid-template-columns: 8.5rem 1fr;
  gap: 0.1rem 0.6rem;
  margin: 0;
}

.euc-diag dt { color: #8395ab; }
.euc-diag dd { margin: 0; font-variant-numeric: tabular-nums; }
.euc-diag dd.warn { color: #ffc46b; }

.euc-tunable {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin: 0 0 0.35rem;
}

.euc-tunable label { grid-column: 1 / 2; color: #b9c6d6; }
.euc-tunable output {
  grid-column: 2 / 3;
  font-variant-numeric: tabular-nums;
  color: #dfe6ef;
  min-width: 4.5rem;
  text-align: right;
}
.euc-tunable .euc-revert {
  grid-column: 3 / 4;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border-radius: 4px;
  border: 1px solid rgba(140, 165, 195, 0.3);
  background: transparent;
  color: #8395ab;
  cursor: pointer;
  visibility: hidden;
}
.euc-tunable.is-overridden .euc-revert { visibility: visible; }
.euc-tunable.is-overridden label { color: #7ec8ff; }
.euc-tunable input[type="range"] {
  grid-column: 1 / 4;
  width: 100%;
  margin: 0;
  accent-color: #1f6fe0;
}

.euc-diag .euc-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.7rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(140, 165, 195, 0.22);
}

.euc-diag button {
  font: inherit;
  padding: 0.25rem 0.55rem;
  border-radius: 5px;
  border: 1px solid rgba(140, 165, 195, 0.35);
  background: rgba(31, 111, 224, 0.16);
  color: #dfe6ef;
  cursor: pointer;
}

.euc-diag button:hover { background: rgba(31, 111, 224, 0.3); }
.euc-diag button:focus-visible { outline: 2px solid #7ec8ff; outline-offset: 2px; }

.euc-diag .euc-note {
  margin: 0.55rem 0 0;
  color: #7b8ca3;
  font-size: 11px;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .euc-diag { backdrop-filter: none; }
}
`;

export function ensureDiagnosticStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
