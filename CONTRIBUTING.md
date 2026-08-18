# Contributing to EUC Thrills

Thanks for wanting to build on this. Forks are welcome without asking — that
is what the MIT licence is for. This page is about getting a change into the
game everyone plays.

## How changes land here

This repository is a **published snapshot** of a private working tree, updated
once per release. That has two practical consequences:

1. **Open a pull request as usual.** Your diff is reviewed, applied to the
   working tree, and run through the full test suite and a real ride. If it
   holds up, it ships inside the next release.
2. **Your PR will be closed with a note like "landed in v-next", not
   merged.** That is bookkeeping, not rejection — the commit arrives with the
   release snapshot instead of through the merge button. You will be credited
   in the release notes.

Small, focused PRs land fastest. For anything large, open an issue first and
describe the shape — it may already be planned, rejected, or in progress.

## The bar a change has to clear

- `npm run typecheck` and `npm test` pass. New behaviour comes with tests in
  the same style as its neighbours: plain `node --test`, no build step.
- `npm run test:browser` passes if you touched anything a browser can see
  (first run: `npx playwright install chromium`).
- **Arcade over simulation.** The cut-out, the beeps, and speed wobble are
  all in the game — but only in the forms playtests proved fun: the beeps
  live at the very top of the speed range and wobble fires only on visible
  road hazards, never on clean riding. Anything that punishes clean riding,
  nags, or interrupts for realism's sake will be declined no matter how
  authentic it is — fun wins every argument.
- Match the code around you, comments included. Comments here explain *why*,
  not what.

## Licensing of contributions

By submitting a change you agree it is your own work and is contributed under
the project's licences: MIT for code, CC BY 4.0 for original game assets. See
`LICENSE` and `NOTICE.md`.
