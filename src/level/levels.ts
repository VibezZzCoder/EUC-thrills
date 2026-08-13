/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { generateLevel } from './generateRoute.ts';
import type { LevelPlan } from './plan.ts';
import { createProvingGround } from './provingGround.ts';
import { createSliceLevel } from './sliceLevel.ts';

/**
 * The levels this build can produce, and the decision behind there being two.
 *
 * **M7's brief asked what happens to the M4 proving ground's flat reference
 * pad** (`docs/PLANS.md` §10, M4 decision 5: *"M7 will need to decide whether
 * the slice keeps a reference surface of its own or whether that evidence moves
 * somewhere else"*). The answer taken here, flagged rather than buried:
 *
 * > **The slice level ships. The proving ground stays, as the measuring
 * > instrument, reachable only at `?level=proving`.**
 *
 * Three reasons, in order of weight.
 *
 * **1. The proving ground *is* the instrument, and M7 must not move it.**
 * §2.5 makes the hand-authored level the measuring instrument for the whole
 * movement phase, on the grounds that a level which changes cannot measure
 * whether a movement change made riding better or merely different. Every
 * number the owner accepted at M2 through M6 — the accel curve, top speed,
 * braking distance, the lateral limit, the camera's arm and field of view, the
 * hop height, the landing tiers, the power ladder's rungs — was settled on that
 * course, and the browser suites measure them by riding named beats on it.
 * Rewriting the level *and* re-pointing all of that evidence in one milestone
 * would leave no fixed reference against which to say M7 changed nothing. Kept
 * as it is, the M2–M6 evidence is not merely equivalent; it is identical.
 *
 * **2. A 180 m × 80 m pad does not belong in a designed space.** The pad is
 * 14,400 m² sized from two manoeuvres — thirteen seconds of full throttle and a
 * full-lock carve at top speed. Dropped into a 260 m × 354 m slice it would be
 * a sixth of the world and would read as a car park nobody built. The slice
 * answers the same need differently and in keeping with its own fiction: the
 * plaza is 34 m across for standing-start work, and the boulevard plus the
 * fork's road give a 250 m paved run with two 34 m-radius corners, which is
 * where top-speed riding actually happens here.
 *
 * **3. Two producers of one `LevelPlan` is what invariant 2 has been claiming
 * since M0.** Until now it was one producer and a promise. `simulation/` and
 * `render/` cannot tell these two apart, and M12's generator will be the third
 * — so the plumbing that makes a second level selectable is plumbing M12 needs
 * anyway, built while it is cheap.
 *
 * The proving ground is **not** a player-facing feature and is not offered
 * anywhere in the UI. It is a diagnostic, exactly as the inspection orbit camera
 * is: reachable by typing a query parameter, and never an acceptance view for
 * anything about the slice.
 *
 * **M12 adds a third producer, and it is the one this plumbing was built for.**
 * `?level=generated&seed=<seed>` builds a seeded route from the segment library
 * (`generateRoute.ts`). Reason 3 above said M12's generator "will be the third
 * — so the plumbing that makes a second level selectable is plumbing M12 needs
 * anyway, built while it is cheap". It was, and this is it. M12 Phase 4 then
 * promoted the same URL to a player-facing shared link and added the Fresh
 * route entrance on the title screen; the proving ground alone remains
 * diagnostic-only.
 */
export type LevelId = 'slice' | 'proving' | 'generated';

export const DEFAULT_LEVEL: LevelId = 'slice';

/**
 * The seed a generated level is built from when the query string names none.
 *
 * Fixed rather than random, for the same reason nothing else in this project
 * calls `Math.random`: a world that differs between boots makes every capture,
 * every ghost and every regression test meaningless.
 */
export const DEFAULT_SEED = 'euc';

/**
 * The three builders, each also taking M13 Phase 2's diagnostic hazard cadence.
 *
 * The second parameter is a *diagnostic*, not level identity: it is absent
 * unless `?hazardprobe=` supplied it, it is never part of a seed, and it never
 * reaches `records.ts` — a probe ride is not a run worth keeping and the level
 * id it is filed under does not change. That is the same line `?wobble=` sits
 * on and the opposite side from the seed, which *is* identity (`AGENTS.md`).
 */
const BUILDERS: Readonly<Record<
  LevelId,
  (seed: string, hazardProbeMetres?: number, targetProbeMetres?: number) => LevelPlan
>> = {
  slice: (_seed, hazardProbeMetres, targetProbeMetres) =>
    createSliceLevel(hazardProbeMetres, targetProbeMetres),
  proving: (_seed, hazardProbeMetres, targetProbeMetres) =>
    createProvingGround(hazardProbeMetres, targetProbeMetres),
  generated: (seed, hazardProbeMetres, targetProbeMetres) =>
    generateLevel(seed, hazardProbeMetres, targetProbeMetres).plan,
};

/** Every level id, for tests and diagnostics. */
export const LEVEL_IDS: readonly LevelId[] = Object.keys(BUILDERS) as LevelId[];

export function isLevelId(value: string | null | undefined): value is LevelId {
  // Query parameters are untrusted. `in` also accepts inherited names such as
  // `toString`, which would then be invoked as if it were a LevelPlan builder
  // and crash boot before the title screen exists.
  return value !== null && value !== undefined && Object.hasOwn(BUILDERS, value);
}

/**
 * Build a level by id.
 *
 * An unknown id is the shipped level rather than a throw: this is reached from a
 * query parameter, and a typo in one should start the game rather than replace
 * it with an error page.
 */
export function createLevel(
  id: LevelId = DEFAULT_LEVEL,
  seed: string = DEFAULT_SEED,
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
): LevelPlan {
  return (BUILDERS[id] ?? BUILDERS[DEFAULT_LEVEL])(seed, hazardProbeMetres, targetProbeMetres);
}

/** Read a level id out of a query string. Absent or unknown is the default. */
export function levelFromQuery(search: string): LevelId {
  const requested = new URLSearchParams(search).get('level');
  return isLevelId(requested) ? requested : DEFAULT_LEVEL;
}

/**
 * Read a generated level's seed out of a query string.
 *
 * **`?level=generated&seed=…` began as a diagnostic, on exactly the terms
 * `?level=proving` is**, so M12 Phase 2's owner ride-gate could exercise a
 * curated handful of seeds. Phase 4 made it the canonical shareable spelling
 * of a player-facing Fresh route as well; it is still not an acceptance view
 * for anything about the hand-authored slice.
 * and answer whether they feel like places, and he cannot do that without a way
 * in.
 *
 * **Phase 4 settled `docs/PLANS.md` §13 question 5 and built the entrance**, so
 * this is no longer the only way in: the title screen offers a fresh route, the
 * seed is visible and enterable, and the slice remains the default world. The
 * query parameter survives as the diagnostic it always was — and as the shape
 * of a shared link, which is why `normaliseSeed` runs on it. A seed typed into
 * the field and the same seed arriving in a URL have to mean one place.
 */
export function seedFromQuery(search: string): string {
  const requested = new URLSearchParams(search).get('seed');
  if (requested === null) return DEFAULT_SEED;
  const seed = normaliseSeed(requested);
  return seed.length > 0 ? seed : DEFAULT_SEED;
}

/**
 * Read M13 Phase 2's diagnostic hazard cadence out of a query string.
 *
 * `?hazardprobe=<metres>` scatters hazards through whatever world was asked
 * for, so Phase 2's owner gate can be ridden before Phase 3 teaches the
 * generator to place them — see `BuildOptions.hazardProbeMetres`. Absent,
 * unreadable, or non-positive all mean the same thing and mean it silently: no
 * probe, and the world every player gets.
 *
 * **Read at boot rather than from `applyDebugQuery`, unlike `?wobble=`.** That
 * one writes a number into the live-tuning store, which the controller reads
 * afterwards; this one decides what is *in* the world, and the world is settled
 * before the first frame (`app/main.ts`). A cadence applied after construction
 * would need a rebuild the player never asked for.
 *
 * The floor is not arbitrary: below one hazard every few metres the scatter
 * stops being a road with holes in it and becomes a wall of them, which is
 * neither the picture the gate is about nor anything anybody would ride.
 */
export function hazardProbeFromQuery(search: string): number | undefined {
  const requested = new URLSearchParams(search).get('hazardprobe');
  if (requested === null) return undefined;
  // Parse the whole value. `parseFloat('30metres') === 30`, which makes a
  // malformed diagnostic URL silently mean a different, valid URL. `Number`
  // alone is not the grammar either: it accepts JavaScript-only spellings such
  // as `0x20`, which nobody means as thirty-two metres in a shared ride URL.
  const value = requested.trim();
  if (!DECIMAL_NUMBER.test(value)) return undefined;
  const metres = Number(value);
  if (!Number.isFinite(metres) || metres < MIN_HAZARD_PROBE_METRES) return undefined;
  return metres;
}

/**
 * Read the M14 target cadence out of a query string — `?targetprobe=<metres>`.
 *
 * **`?hazardprobe=`'s exact terms**, deliberately, including this parser's
 * grammar: the whole value or nothing. `parseFloat('30metres') === 30` would
 * make a malformed diagnostic URL silently mean a different, valid URL, and
 * `Number` alone accepts JavaScript-only spellings such as `0x20` that nobody
 * means as thirty-two metres in a URL they are sending somebody.
 *
 * It exists because phase 2's owner gate — does a target read as something to
 * hit far enough ahead to set the line up for it — cannot be ridden in a world
 * that has nothing to look at, and until phase 3 teaches the generator to place
 * one, no world in the game carries a target at all.
 *
 * **It is not level identity.** `worldLink` never writes it, records are still
 * filed under the same level id, and it never enters `GameOptions` — a target
 * is a fact about the world rather than presentation a player configures
 * (invariant 5). What it *does* do is refuse records for the session, which is
 * `Game.probing`: a probe changes the course without changing its id, so a best
 * set on one would be filed against a world nobody else can ride.
 */
export function targetProbeFromQuery(search: string): number | undefined {
  const requested = new URLSearchParams(search).get('targetprobe');
  if (requested === null) return undefined;
  const value = requested.trim();
  if (!DECIMAL_NUMBER.test(value)) return undefined;
  const metres = Number(value);
  if (!Number.isFinite(metres) || metres < MIN_TARGET_PROBE_METRES) return undefined;
  return metres;
}

/** One ordinary decimal number, with an optional scientific exponent. */
const DECIMAL_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** The closest together the diagnostic will put two hazards, metres. */
export const MIN_HAZARD_PROBE_METRES = 5;

/**
 * The closest together the diagnostic will put two targets, metres.
 *
 * Higher than the hazard floor, and derived from the mechanic rather than
 * chosen: a whole swing cycle is about 0.44 s, which at top speed is nearly ten
 * metres of road. Two targets closer together than that cannot both be struck
 * however well the player rides, so a probe that placed them would be asking
 * the owner to judge a reachability question the generator will never pose.
 */
export const MIN_TARGET_PROBE_METRES = 12;

// ---------------------------------------------------------------------------
// A seed as something a player types — M12 Phase 4
// ---------------------------------------------------------------------------

/**
 * How long a seed may be.
 *
 * **Derived from the record store, not chosen.** A generated plan's id is
 * `generated-r3-<seed>` (`generateRoute.ts`, `GENERATED_LEVEL_PREFIX`), personal
 * bests are filed under that id, and both `app/records.ts` and
 * `simulation/ghost.ts` cap a level id at 64 characters — independently, in two
 * files that may not import each other. A seed long enough to breach it
 * produces a run that is silently never saved and a ghost that encodes and then
 * refuses to decode, which is the worst pair of symptoms this feature could
 * have. Thirteen characters of prefix plus this leaves twenty-seven of
 * headroom, so the cap can only be reached deliberately — and the prefix grew
 * by three at M13 Phase 3, which is exactly the kind of change this arithmetic
 * is written down to survive.
 */
export const MAX_SEED_LENGTH = 24;

/**
 * The one spelling of a seed.
 *
 * A seed stopped being a developer's query parameter at Phase 4 and became a
 * string one player sends another, so it has to survive the journey: typed on a
 * phone with autocapitalisation on, read aloud, pasted with a trailing space,
 * copied out of a chat that title-cased it. All four have to arrive at the same
 * route or "same seed, same place" is a promise the game does not keep.
 *
 * So the seed is folded to lower case, every run of anything that is not a
 * letter or a digit becomes a single hyphen, and the ends are trimmed. `Sunset
 * Ridge`, `sunset ridge`, `Sunset—Ridge` and `  sunset-ridge  ` are one seed.
 *
 * **It also removes a collision nobody would ever have found.** `attemptSeed`
 * spells its retries `<seed>#<n>`, so a typed `a#1` drew the same route stream
 * as the second attempt at `a`. Two seeds quietly meaning one place is exactly
 * the failure this function exists to prevent, arriving from the other side.
 *
 * Applied to the query parameter as well as to the field, because a shared link
 * and a typed seed must mean the same world — that is the whole of "shareable".
 */
export function normaliseSeed(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SEED_LENGTH)
    // Twice, and both are needed: once to drop the hyphens the substitution
    // put on the ends, and once more because the length cap can cut a word off
    // and leave a fresh one behind.
    .replace(/^-+|-+$/g, '');
}

/** Why a seed did not become a route. The words are `ui/menus.ts`'s. */
export type RouteRefusal = 'blank' | 'no-route';

export type RouteOutcome =
  | { readonly ok: true; readonly seed: string; readonly plan: LevelPlan }
  | { readonly ok: false; readonly seed: string; readonly refusal: RouteRefusal };

/**
 * Build a route for a seed a player chose, or refuse the seed.
 *
 * **This is the one entrance that does not silently hand back the slice**, and
 * that is the owner's decision of 2026-08-08 (`docs/PLANS.md` §13, under q6):
 * *reject and ask for another — no silent world swap, ever.*
 *
 * `generateLevel` emits the hand-authored slice when twelve attempts all fail,
 * which is master §6.4's self-validating fallback and is exactly right as an
 * *internal* guarantee: the generator always emits a world that passes the
 * validator. It is wrong as a *player-facing* answer. About one seed in 360
 * fails, and a player who types the seed a friend sent and is quietly given a
 * different world has been lied to about the one promise a seed makes.
 *
 * So the fallback plan is discarded here and the seed is refused. The slice is
 * still reachable — it is the default world and one button away — but it is
 * never something a player asked for by name and did not get.
 */
export function requestRoute(
  rawSeed: string,
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
): RouteOutcome {
  const seed = normaliseSeed(rawSeed);
  if (seed.length === 0) return { ok: false, seed, refusal: 'blank' };

  const generated = generateLevel(seed, hazardProbeMetres, targetProbeMetres);
  if (generated.report.usedFallback) return { ok: false, seed, refusal: 'no-route' };
  return { ok: true, seed, plan: generated.plan };
}

/**
 * Seed words, so a seed can be said out loud.
 *
 * A random seed has to come from somewhere, and `k7f2x9` is a seed nobody
 * passes to anybody: it cannot be read down a phone, retyped from memory, or
 * recognised a week later. Two words and an optional number can be all three,
 * and 57,600 of them is far more than anyone will ride.
 *
 * Both lists are ordinary place-and-material words with no proper nouns, no
 * marks, and nothing that could name a real person or product — the same rule
 * `AGENTS.md` applies to manufacturers, applied to text the game invents.
 */
const SEED_FIRST: readonly string[] = [
  'amber', 'brisk', 'copper', 'dusty', 'ember', 'fern', 'glass', 'harbour',
  'ivory', 'jetty', 'kestrel', 'lantern', 'marble', 'nimbus', 'opal', 'pewter',
  'quarry', 'rust', 'slate', 'tidal', 'umber', 'velvet', 'willow', 'zephyr',
];

const SEED_SECOND: readonly string[] = [
  'arch', 'bay', 'cove', 'drift', 'edge', 'fall', 'gate', 'hill',
  'isle', 'junction', 'kerb', 'lane', 'mill', 'nook', 'orchard', 'pier',
  'quay', 'ridge', 'span', 'tower', 'underpass', 'vault', 'wharf', 'yard',
];

/**
 * Turn any integer into a readable seed.
 *
 * Pure, so the randomness stays where the project keeps it: `Math.random` is
 * called in `app/Game.ts` and nowhere under `level/`, for the same reason
 * `records.ts` refuses to read a clock. A test can walk this function's whole
 * range without deciding what random means.
 *
 * Every output normalises to itself, which the colocated test asserts — a
 * "surprise me" button that hands the field a seed the field then rewrites
 * would be the game disagreeing with itself in front of the player.
 */
export function routeSeedFrom(value: number): string {
  const index = Math.abs(Math.trunc(value));
  const first = SEED_FIRST[index % SEED_FIRST.length];
  const pair = Math.floor(index / SEED_FIRST.length);
  const second = SEED_SECOND[pair % SEED_SECOND.length];
  const tail = Math.floor(pair / SEED_SECOND.length) % 100;
  return tail === 0 ? `${first}-${second}` : `${first}-${second}-${tail}`;
}

/** How many distinct seeds `routeSeedFrom` can produce. */
export const ROUTE_SEED_SPACE = SEED_FIRST.length * SEED_SECOND.length * 100;
