/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { hash128 } from './planDigest.ts';

/**
 * Named per-domain random streams — M12 Phase 2.
 *
 * `docs/PLANS.md` §2.5 and master §6 both require **named per-domain seed
 * streams** so that "a cosmetic change cannot alter a layout". The failure they
 * exist to prevent is specific and expensive: with one shared generator, adding
 * a single tree changes how many numbers the dressing pass consumes, every
 * subsequent draw shifts, and the *route* comes out different. A seed then
 * stops being a name for a place. Ghosts, personal bests, and "ride seed 4812"
 * all quietly stop meaning anything, and nothing fails while it happens.
 *
 * So there is no shared generator. Five independent streams — `route`,
 * `terrain`, `dressing`, `surfaces`, `hazards` — each seeded from its own name,
 * each consumed only by its own pass. Rerolling the dressing leaves the route's
 * bytes untouched, which `generatedLevel.test.ts` proves by digesting the
 * segments of two plans that differ only in their dressing seed.
 *
 * **A domain may be added without moving one existing world**, and M13 Phase 3
 * is the proof of it. `createStream` seeds from `hash128("<seed>/<domain>")`
 * rather than from a position in a list, so a fifth name is a fifth unrelated
 * state and the four that were already here start exactly where they started.
 * Appending rather than inserting matters for one further reason: `seedLabel`
 * writes overrides in `SEED_DOMAINS` order, so a name inserted in the middle
 * would respell every existing override label and two players comparing
 * `euc[route=y,dressing=x]` would be comparing two strings for one world.
 *
 * ## The generator
 *
 * SplitMix32: one multiply-xorshift round over a 32-bit counter. It is not a
 * cryptographic primitive and does not need to be — what it needs is to be
 * *exactly reproducible in a browser and in `node --test`*, which rules out
 * anything using floating point internally, and to be independent between
 * streams, which the per-domain seeding gives it.
 *
 * `Math.random` is banned here for the same reason it is banned in the terrain
 * mottle and the particles (`DESIGN.md` §4 rule 3): a world that differs
 * between boots makes every regression capture meaningless.
 *
 * Nothing here may import three.js (invariant 1).
 */

/**
 * The six domains. A pass may draw from exactly one of them.
 *
 * Order is the *spelling* order of an override label and nothing else — no pass
 * runs because of where its name sits here. `hazards` is fifth because it was
 * added fifth (M13 Phase 3) and `targets` is sixth because it was added sixth
 * (M14); moving either would respell labels that are already in circulation,
 * and two players comparing `euc[route=y,dressing=x]` would be comparing two
 * strings for one world.
 *
 * **Appended, never inserted, and M14 is the second proof of the paragraph
 * above.** `createStream` seeds from `hash128("<seed>/<domain>")`, so a sixth
 * name is a sixth unrelated state and the five already here start exactly where
 * they started — every existing world is byte-identical across this addition.
 */
export const SEED_DOMAINS = [
  'route',
  'terrain',
  'dressing',
  'surfaces',
  'hazards',
  'targets',
] as const;

export type SeedDomain = (typeof SEED_DOMAINS)[number];

/**
 * A seed, as the player will eventually type it, plus any per-domain override.
 *
 * The base seed names the world. An override reseeds one domain and leaves the
 * others exactly where they were — which is what makes "same route, different
 * trees" a thing the game can offer and a thing a test can prove.
 */
export interface SeedSet {
  readonly seed: string;
  readonly overrides?: Partial<Record<SeedDomain, string>>;
}

export interface RandomStream {
  readonly domain: SeedDomain;
  /** A value in [0, 1). */
  next(): number;
  /** An integer in [0, bound). */
  int(bound: number): number;
  /** A value in [from, to). */
  range(from: number, to: number): number;
  /** One item, uniformly. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** One item, by weight. Weights must be finite and non-negative. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
  /** How many values have been drawn. The evidence that a pass was reached. */
  readonly draws: number;
}

function splitMix32(state: number): { value: number; state: number } {
  let next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z = z ^ (z >>> 15);
  return { value: (z >>> 0) / 4294967296, state: next };
}

function createStream(domain: SeedDomain, seed: string): RandomStream {
  // The 128-bit digest of "<seed>/<domain>" folded to 32 bits. Two domains of
  // one seed therefore start from unrelated states rather than from adjacent
  // ones, which is what keeps a short seed like "3" from producing four
  // correlated streams.
  const digest = hash128(`${seed}/${domain}`);
  let state = Number.parseInt(digest.slice(0, 8), 16) | 0;
  let draws = 0;

  const next = (): number => {
    const step = splitMix32(state);
    state = step.state;
    draws += 1;
    return step.value;
  };

  return {
    domain,
    next,
    int: (bound) => (bound <= 0 ? 0 : Math.floor(next() * bound) % bound),
    range: (from, to) => from + next() * (to - from),
    pick(items) {
      if (items.length === 0) throw new Error(`${domain}: nothing to pick from`);
      return items[Math.floor(next() * items.length) % items.length];
    },
    weighted(items, weightOf) {
      if (items.length === 0) throw new Error(`${domain}: nothing to pick from`);
      let total = 0;
      for (const item of items) {
        const weight = weightOf(item);
        if (!(weight >= 0) || !Number.isFinite(weight)) {
          throw new Error(`${domain}: a weight of ${weight} is not a weight`);
        }
        total += weight;
      }
      // Every weight zero is a caller error rather than a silent uniform draw:
      // it means a filter left nothing eligible and the route should retry.
      if (total <= 0) throw new Error(`${domain}: every candidate weighs nothing`);
      let target = next() * total;
      for (const item of items) {
        target -= weightOf(item);
        if (target < 0) return item;
      }
      return items[items.length - 1];
    },
    get draws(): number {
      return draws;
    },
  };
}

export type SeedStreams = Readonly<Record<SeedDomain, RandomStream>>;

/**
 * Five streams from one seed.
 *
 * A bare string is the ordinary case. A `SeedSet` with overrides is how one
 * domain is rerolled without touching the others.
 */
export function createSeedStreams(seed: string | SeedSet): SeedStreams {
  const set: SeedSet = typeof seed === 'string' ? { seed } : seed;
  const streams = {} as Record<SeedDomain, RandomStream>;
  for (const domain of SEED_DOMAINS) {
    streams[domain] = createStream(domain, set.overrides?.[domain] ?? set.seed);
  }
  return streams;
}

/**
 * The canonical spelling of a seed set, for a report or a URL.
 *
 * A seed is going to become player-facing at Phase 4, and a seed that has two
 * spellings is a seed two players cannot compare. Overrides are written in
 * domain order rather than in object order for the same reason.
 */
export function seedLabel(seed: string | SeedSet): string {
  const set: SeedSet = typeof seed === 'string' ? { seed } : seed;
  const overrides = SEED_DOMAINS
    .filter((domain) => set.overrides?.[domain] !== undefined)
    .map((domain) => `${domain}=${set.overrides?.[domain] ?? ''}`);
  return overrides.length === 0 ? set.seed : `${set.seed}[${overrides.join(',')}]`;
}

/**
 * A seed derived from another, for a retry.
 *
 * Master §6.4 requires every retry to end in a validated result rather than in
 * a deterministic default, so an attempt that fails validation has to be able
 * to draw a *different* world from the same player-facing seed. Numbering the
 * attempts inside the route domain alone is what keeps that true without the
 * dressing or the terrain moving underneath a retry that had nothing to do with
 * them.
 */
export function attemptSeed(seed: string | SeedSet, attempt: number): SeedSet {
  const set: SeedSet = typeof seed === 'string' ? { seed } : seed;
  if (attempt === 0) return set;
  const base = set.overrides?.route ?? set.seed;
  return { ...set, overrides: { ...set.overrides, route: `${base}#${attempt}` } };
}
