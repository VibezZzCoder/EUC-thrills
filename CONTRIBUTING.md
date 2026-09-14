# Contributing to EUC Thrills

Thanks for wanting to build on this. Forks are welcome without asking — that
is what the MIT licence is for. This page is about getting a change into the
game everyone plays.

## How changes land here

This repository is a **published snapshot** of a private working tree, updated
once per release. That has two practical consequences:

1. **Open a pull request as usual.** Your diff is reviewed, applied to the
   working tree, and checked against the affected contracts and a real ride. If it
   holds up, it ships inside the next release.
2. **Your PR will be closed with a note like "landed in v-next", not
   merged.** That is bookkeeping, not rejection — the commit arrives with the
   release snapshot instead of through the merge button. You will be credited
   in the release notes.

Small, focused PRs land fastest. For anything large, open an issue first and
describe the shape — it may already be planned, rejected, or in progress.

## The bar a change has to clear

- Run `npm run typecheck` for TypeScript changes and select headless tests with
  `npm test -- <file>...` or `npm test -- --group=<name>` (`npm run test:groups`
  lists groups). Add tests where they provide useful regression protection,
  in the same style as their neighbours: plain `node --test`, no build step.
- For browser-visible changes, run the affected browser cases with
  `npm run test:browser -- <spec>...` and, when useful, `-g <title pattern>`
  (first run: `npx playwright install chromium`). Check the changed interaction
  and relevant desktop or touch layout. `test:browser:one` and
  `test:browser:serial` require a target and force one Chromium worker.
- Include the commands, scope, results, and any unverified behavior in the PR.
  Full suites are explicit (`test:full` and `test:browser:full`) and need a
  reason, such as a change spanning systems or uncertain dependencies; they
  are not required at every edit or review round. One person coordinates
  expensive runs, and prior results remain useful while their inputs are
  unchanged. Run wall-clock checks separately with `test:performance` on an
  otherwise idle machine. Private release tests are absent from this snapshot,
  and selecting the `release` group reports that it is unavailable.
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
