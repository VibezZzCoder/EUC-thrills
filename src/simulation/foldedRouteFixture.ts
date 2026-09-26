/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { LevelPlan } from '../level/plan.ts';

/**
 * A route that folds back on itself — test support only.
 *
 * Several chase guarantees are about geometry a generated world used to
 * produce by accident: a hairpin whose arms run a few metres apart, a later
 * lane beside an earlier one, a return that doubles back inside the bust
 * radius. From M39 r6 the town ring keeps unrelated roads eight metres apart
 * edge to edge by construction, so no seed carries them any more — which is
 * the point of the rule, and also why the brain's handling of them now needs a
 * world built to have them.
 *
 * Three straights (250, 250, 200 m) joined by two left-hand hairpins of different radii: the
 * second straight runs back 5 m from the first, and the third runs up again
 * 2.5 m beside the first, the same way — a divided road.
 */
export function foldedRouteFixture(): LevelPlan {
  const straight = (id: string, length = 250) => ({ id, length, halfWidth: 1.1, surface: 'pavement' as const, shoulder: 0.5 });
  const hairpin = (id: string, radius: number, sign: number) => ({
    id, length: Math.PI * radius, curvature: sign / radius, halfWidth: 1.1, surface: 'pavement' as const, shoulder: 0.5,
  });
  return buildLevelPlan({
    main: [
      straight('fold-a'),
      hairpin('fold-turn-a', 2.5, 1),
      straight('fold-b'),
      hairpin('fold-turn-b', 1.25, 1),
      // Shorter, so its far end is nowhere near the first straight's: two ends
      // a few metres apart read as a join to the spine's walk.
      straight('fold-c', 200),
    ],
  }, {
    id: 'folded-fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    checkpoints: [
      { id: 'start', segment: 'fold-a', s: 8, kind: 'start', label: 'Start' },
      { id: 'finish', segment: 'fold-c', s: 190, kind: 'finish', label: 'Finish' },
    ],
  });
}
