/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Requested quality versus the tier the renderer actually draws — M39
 * (`docs/PLANS.md` §39.6, `docs/M39_ULTRA.md` §6.3 W1).
 *
 * **One preference, two facts.** The options store holds what the player
 * *requested* (`GameOptions.quality`, which may be `ultra`); this file decides
 * what is *effective* for this session and world. A couch session, a
 * `?presentation=` diagnostic override or a refused recipe draws ordinary
 * High without ever overwriting the saved choice, and says why — never an
 * "Ultra active" label over the ordinary path.
 *
 * The resolution is pure and headless: `app/Game.ts` gathers the session
 * facts, calls `resolveRenderTier`, pushes the ordinary tier to
 * `renderer.setQuality` (only when it changed) and the Ultra intent to
 * `renderer.setUltraWanted`, and hands the menus a `QualityStateView`.
 *
 * **The truth table (§6.3 W1):**
 *
 *   - low, medium or high → effective = requested; Ultra offered unless a
 *     multiplayer session owns the frame;
 *   - ultra in a multiplayer session → High, suspension `multiplayer`, not
 *     offered (a one-seat remnant stays multiplayer until the session ends);
 *   - ultra under a presentation override → High, `presentation-override`;
 *   - ultra with a refusal → High, `refused`;
 *   - otherwise → Ultra, drawn over the ordinary High settings.
 *
 * **Everything else here is the rest of W1's decision-making, pulled out of
 * `Game.ts` so it can be proved without a browser.** The composition root is
 * twelve thousand lines of DOM, WebGL and audio, and none of it can run under
 * `node --test`; the rules for when a couch session ends, which tier the title
 * toggle returns to, what a refusal is called and what a diagnostic query
 * means are all pure, so they live here and `renderTier.test.ts` holds them to
 * the table. `Game.ts` only gathers facts and pushes answers.
 *
 * Nothing in this file is imported at runtime from `render/` — the Ultra
 * vocabulary arrives as types only, so the ordinary boot pulls no Ultra code
 * in through this door (the switch and stage lists below are written out and
 * held exhaustive by their `Record` types instead).
 */
import type { OrdinaryQuality, QualityLevel } from './options.ts';
import type {
  UltraEnvelopeAxis,
  UltraFaultPlant,
  UltraFaultStage,
  UltraKitOverride,
  UltraKitSwitch,
  UltraRefusal,
} from '../render/ultra/ultraTypes.ts';

export type { OrdinaryQuality } from './options.ts';

/** What the menus show: the requested and effective tiers, and why they differ. */
export interface QualityStateView {
  requested: QualityLevel;
  effective: QualityLevel;
  ultraOffered: boolean;
  suspension: 'multiplayer' | 'presentation-override' | 'refused' | null;
  /**
   * Why a requested Ultra is not drawing, as a short lower-case phrase, or
   * null when nothing is suspended. Written to sit inside the readout's
   * parentheses ("Ultra couldn't start here — using High (<reason>)"), so a
   * refusal's phrase is the one that matters; the multiplayer and override
   * phrases are there for the QA bridge, since the menus word those two
   * suspensions themselves. See `qualityStateFor`.
   */
  reason: string | null;
}

/** The session facts the resolution depends on. */
export interface RenderTierInput {
  requested: QualityLevel;
  multiplayerSession: boolean;
  presentationOverride: boolean;
  refused: boolean;
}

/**
 * What the renderer is told: the ordinary tier underneath (Ultra draws over
 * High's pixel and shadow settings), whether Ultra is wanted, whether the
 * title may offer it, and why a requested Ultra is suspended.
 */
export interface RenderTierResolution {
  ordinary: OrdinaryQuality;
  wantUltra: boolean;
  ultraOffered: boolean;
  suspension: QualityStateView['suspension'];
}

export function resolveRenderTier(input: RenderTierInput): RenderTierResolution {
  const ultraOffered = !input.multiplayerSession;
  if (input.requested !== 'ultra') {
    return { ordinary: input.requested, wantUltra: false, ultraOffered, suspension: null };
  }
  if (input.multiplayerSession) {
    return { ordinary: 'high', wantUltra: false, ultraOffered: false, suspension: 'multiplayer' };
  }
  // The two below keep the *intent*: the renderer is the one that refuses
  // (it reports `presentation-override` itself while Ultra is wanted, §6.3
  // W5 step 6), and a world-scoped refusal must be re-judged on the next
  // world rather than forgotten. Only multiplayer withdraws the request.
  if (input.presentationOverride) {
    return { ordinary: 'high', wantUltra: true, ultraOffered, suspension: 'presentation-override' };
  }
  if (input.refused) {
    return { ordinary: 'high', wantUltra: true, ultraOffered, suspension: 'refused' };
  }
  return { ordinary: 'high', wantUltra: true, ultraOffered, suspension: null };
}

// ---------------------------------------------------------------------------
// The effective tier as the menus and the QA bridge are told it
// ---------------------------------------------------------------------------

/**
 * What the renderer says about Ultra *after* it has acted on the intent —
 * `renderer.effectiveTier() === 'ultra'` and `renderer.ultraReport().refusal`.
 *
 * `ULTRA_NOT_WANTED` is the value for every moment Ultra was not asked for,
 * so the ordinary path never has to query the renderer to be described.
 */
export interface UltraLiveState {
  readonly active: boolean;
  readonly refusal: UltraRefusal | null;
}

export const ULTRA_NOT_WANTED: UltraLiveState = Object.freeze({ active: false, refusal: null });

/**
 * The second resolution — `applyRenderTier`'s step 5 (§6.3 W1): the session
 * facts plus what the renderer actually did, as the one state the title
 * toggle, the Settings readout and `snapshot().quality` all show.
 *
 * **Effective Ultra is earned, never assumed.** `refused` is derived from the
 * renderer's own `active` rather than from whether it happened to name a
 * refusal, so a renderer that is not drawing Ultra for a reason it did not
 * state still reads as High here — the label follows the pixels, which is
 * PLANS §39.6's "never … an 'Ultra active' label over the ordinary path"
 * made structural rather than hoped for. A multiplayer session and an
 * override are decided from the facts first, exactly as the truth table
 * orders them, so the live state only ever decides the last two rows.
 *
 * A renderer-reported `presentation-override` counts as an override even if
 * the caller's own flag missed it, for the same reason.
 */
export function qualityStateFor(
  facts: Omit<RenderTierInput, 'refused'>,
  live: UltraLiveState,
): QualityStateView {
  const overrideRecipe = live.refusal?.kind === 'presentation-override' ? live.refusal.recipe : null;
  const presentationOverride = facts.presentationOverride || overrideRecipe !== null;
  const resolution = resolveRenderTier({
    requested: facts.requested,
    multiplayerSession: facts.multiplayerSession,
    presentationOverride,
    refused: !live.active,
  });
  const effective: QualityLevel = facts.requested !== 'ultra'
    ? facts.requested
    : resolution.suspension === null ? 'ultra' : resolution.ordinary;
  return {
    requested: facts.requested,
    effective,
    ultraOffered: resolution.ultraOffered,
    suspension: resolution.suspension,
    reason: reasonFor(resolution.suspension, live.refusal, overrideRecipe),
  };
}

function reasonFor(
  suspension: QualityStateView['suspension'],
  refusal: UltraRefusal | null,
  overrideRecipe: string | null,
): string | null {
  switch (suspension) {
    case null: return null;
    case 'multiplayer': return 'single player only';
    case 'presentation-override':
      return overrideRecipe === null
        ? 'the ?presentation= diagnostic is set'
        : `?presentation=${overrideRecipe} is set`;
    case 'refused':
      // A refusal the renderer did not name is still a refusal: the frame is
      // ordinary, so the readout says so rather than going quiet.
      return refusal === null ? 'the Ultra renderer did not start' : describeRefusal(refusal);
  }
}

// ---------------------------------------------------------------------------
// Refusals: how long they last, and what they are called
// ---------------------------------------------------------------------------

/**
 * How long a refusal holds (the scopes `UltraRefusal` documents in §6.2).
 *
 *   - `boot`: a `?presentation=` override, fixed for the page's life;
 *   - `session`: a missing capability or a failed setup — the renderer keeps
 *     refusing without trying again until the page reloads;
 *   - `world`: an envelope breach, which is a fact about *this* plan, so the
 *     next world is judged afresh.
 *
 * The app does not act on the scope — the renderer owns the refusing, which
 * is why `resolveRenderTier` keeps the intent under every refusal — but the
 * scope is what the Settings wording and the tests have to agree on.
 */
export type RefusalScope = 'boot' | 'session' | 'world';

export function refusalScope(refusal: UltraRefusal): RefusalScope {
  switch (refusal.kind) {
    case 'presentation-override': return 'boot';
    case 'capability': return 'session';
    case 'envelope': return 'world';
    case 'setup-failed': return 'session';
  }
}

/** Player-facing words for each thing `setUltraFault` can plant. */
const STAGE_PHRASES: Readonly<Record<UltraFaultStage, string>> = Object.freeze({
  build: 'the Ultra world could not be built',
  sky: 'the Ultra sky could not be painted',
  environment: 'the Ultra environment light could not be built',
  shadow: 'the Ultra shadow map could not be set up',
  'far-shadow': 'the Ultra far shadow could not be built',
  shader: 'an Ultra shader failed to compile',
  'gl-error': 'the GPU reported an error starting Ultra',
});

const CAPABILITY_PHRASES: Readonly<
  Record<Extract<UltraRefusal, { kind: 'capability' }>['missing'], string>
> = Object.freeze({
  webgl2: 'this browser has no WebGL2',
  'half-float-render': "this GPU can't render half-float targets",
  'max-texture-size': "this GPU's texture size limit is under 4096",
});

/**
 * Each envelope axis's words, so "needs 212 draw calls; Ultra allows 190"
 * reads: the value carries the unit and the noun, the ceiling the unit only.
 */
const AXIS_WORDS: Readonly<Record<
  UltraEnvelopeAxis,
  { readonly scale: number; readonly unit: string; readonly noun: string }
>> = Object.freeze({
  soloDraws: { scale: 1, unit: '', noun: 'draw calls' },
  soloTriangles: { scale: 1, unit: '', noun: 'triangles' },
  propDraws: { scale: 1, unit: '', noun: 'prop draw calls' },
  propTriangles: { scale: 1, unit: '', noun: 'prop triangles' },
  bytes: { scale: 1 / (1024 * 1024), unit: ' MiB', noun: 'of GPU memory' },
  programs: { scale: 1, unit: '', noun: 'shader programs' },
  shadowMap: { scale: 1, unit: '', noun: 'shadow-map texels a side' },
});

/**
 * A refusal as the short phrase the Settings readout puts in parentheses.
 *
 * Deliberately built from the refusal's *kind and stage* and never from a
 * `setup-failed` message: a message is whatever an exception said, which can
 * be a stack-trace fragment, and the player needs the stage. The raw message
 * stays on `renderer.ultraReport().refusal` for anyone diagnosing it. Each
 * fault stage has its own phrase, so the `?ultrafault=<stage>` journey can
 * tell every stage apart from the words alone.
 */
export function describeRefusal(refusal: UltraRefusal): string {
  switch (refusal.kind) {
    case 'presentation-override':
      return `?presentation=${refusal.recipe} is set`;
    case 'capability':
      return CAPABILITY_PHRASES[refusal.missing];
    case 'envelope': {
      const { scale, unit, noun } = AXIS_WORDS[refusal.axis];
      const value = `${grouped(refusal.value * scale)}${unit}`;
      const ceiling = `${grouped(refusal.ceiling * scale)}${unit}`;
      return `this world needs ${value} ${noun}; Ultra allows ${ceiling}`;
    }
    case 'setup-failed':
      return STAGE_PHRASES[refusal.stage];
  }
}

/** A whole number with comma thousands, independent of the browser's locale. */
function grouped(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded));
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ',';
    out += digits[index];
  }
  return rounded < 0 ? `-${out}` : out;
}

// ---------------------------------------------------------------------------
// The multiplayer session, as a flag rather than a seat count
// ---------------------------------------------------------------------------

/**
 * The moments `Game.ts` reports to the session flag.
 *
 *   - `couch-open`: the join panel opens (the first line of `openCouch`);
 *   - `seat-spawn`: a seat beyond the first is about to join the scene —
 *     from the couch or straight from the QA bridge;
 *   - `seat-despawn`: a seat leaves;
 *   - `couch-close`: `closeCouch` has sent every guest home;
 *   - `title`: the title screen is entered.
 */
export type SessionEvent = 'couch-open' | 'seat-spawn' | 'seat-despawn' | 'couch-close' | 'title';

/**
 * Whether a multiplayer session owns the frame after `event`.
 *
 * **A flag, not a seat count** (PLANS §39.6): "a one-seat remnant of a couch
 * session remains multiplayer until that session ends." A guest leaving is not
 * the session ending, so `seat-despawn` changes nothing, and a session only
 * ends where the couch is closed or the title is reached — which is what
 * stops Ultra being rebuilt under a room that is still mid-session and is
 * about to seat somebody again.
 */
export function multiplayerAfter(current: boolean, event: SessionEvent): boolean {
  switch (event) {
    case 'couch-open':
    case 'seat-spawn':
      return true;
    case 'seat-despawn':
      return current;
    case 'couch-close':
    case 'title':
      return false;
  }
}

// ---------------------------------------------------------------------------
// The title toggle's memory
// ---------------------------------------------------------------------------

/**
 * The ordinary tier the title toggle returns to, after the requested quality
 * moves from `previous` to `next` (null `previous` is the boot pass).
 *
 * PLANS §39.6: "turning the shortcut on records the previous ordinary tier
 * for the session; turning it off restores that tier, or High if none is
 * remembered." Recorded here on **every** ordinary → Ultra move, whichever
 * entrance made it — the title toggle and Settings' select are one
 * preference, so choosing Ultra in Settings and then pressing the toggle off
 * returns where Settings left. Cleared when Ultra is left, so the memory only
 * ever describes the current Ultra stretch; a saved Ultra at boot has none,
 * and the toggle then returns to High. Session-only by construction: nothing
 * here is persisted.
 */
export function returnTierAfter(
  previous: QualityLevel | null,
  next: QualityLevel,
  current: OrdinaryQuality | null,
): OrdinaryQuality | null {
  if (next !== 'ultra') return null;
  if (previous !== null && previous !== 'ultra') return previous;
  return current;
}

/**
 * What pressing the title's Ultra Graphics toggle asks the options store for,
 * or null when the press is refused.
 *
 * Refused in a multiplayer session ("Single player only"), so a stray press
 * can never overwrite the saved preference while a room owns the frame. On →
 * `ultra` (the return tier is recorded by `returnTierAfter` as the value
 * lands); off → the remembered tier, or High.
 */
export function ultraToggleTarget(
  requested: QualityLevel,
  returnTier: OrdinaryQuality | null,
  multiplayerSession: boolean,
): QualityLevel | null {
  if (multiplayerSession) return null;
  return requested === 'ultra' ? returnTier ?? 'high' : 'ultra';
}

// ---------------------------------------------------------------------------
// A switch the player has to wait for — the loading notice
// ---------------------------------------------------------------------------

/**
 * Which way a quality change moves the renderer across Ultra.
 *
 * The owner's desktop and iPhone rides, 2026-09-25: turning Ultra on froze the
 * game "for a few seconds" with nothing on screen to say why, and a player who
 * cannot tell whether a press landed presses again. **Entering** builds
 * Ultra's world, sky, environment light, far shadow map and first frame (every
 * Ultra program compiles there) in one synchronous `reconcileUltra` — measured
 * at 0.94–1.75 s on an M1 in the headless browser harness (town first entry
 * 1.75 s: build 0.85, sky 0.38, compile 0.34), about 3.2 s in the desktop
 * app's Chromium on the same M1 (the first-frame compile alone 2.1 s), and
 * "a couple of secs" on his iPhone.
 * **Leaving** tears that down and rebuilds the ordinary world, 0.12–0.23 s.
 * Either way `app/Game.ts` shows the notice, lets it paint, and only then
 * does the work.
 */
export type UltraSwitch = 'entering' | 'leaving';

/**
 * The switch a change of the requested tier to `facts.requested` would make,
 * or null when it makes none — decided from the *intent*, what
 * `resolveRenderTier` wants for the new request against what the renderer was
 * last told (`appliedUltraWanted`), exactly the two facts `applyRenderTier`
 * acts on. So Low ↔ Medium ↔ High stays the instant change it always was, and
 * so does Ultra → High inside a couch session, which already draws High. A
 * request the renderer will go on to refuse (a `?presentation=` override, a
 * session refusal) still counts as `entering`: finding the refusal is the
 * renderer's job, and a notice that turns out to be brief costs two frames.
 */
export function ultraSwitchFor(
  facts: Omit<RenderTierInput, 'refused'>,
  appliedUltraWanted: boolean,
): UltraSwitch | null {
  const wanted = resolveRenderTier({ ...facts, refused: false }).wantUltra;
  if (wanted === appliedUltraWanted) return null;
  return wanted ? 'entering' : 'leaving';
}

/**
 * Loop frames between writing the notice and starting the switch.
 *
 * A `requestAnimationFrame` callback runs *before* its own frame's paint, so
 * work started in the first frame after a press would block before the notice
 * was drawn (the `pendingRoute` lesson, M12 Phase 4). One frame is the minimum
 * that paints; the second is margin for the compositor to put that frame on
 * the glass before the GPU is asked for anything. Two frames is ~33 ms against
 * a switch of one to three seconds.
 */
export const ULTRA_SWITCH_PAINT_FRAMES = 2;

/**
 * Loop frames the busy state outlives the switch.
 *
 * Presses made while the page is frozen are not lost — the browser queues
 * them and delivers them when the long task ends, and a pad still held is
 * read by the first poll after it. Clearing the notice the instant the work
 * returns would hand every one of those to an idle toggle, which is the
 * mashing the owner described. Two frames outlast both: queued input is
 * delivered ahead of the next frames (and on WebKit a display refresh queued
 * during the freeze can run one frame first), and the first pad poll after
 * the work lands in the first of them.
 */
export const ULTRA_SWITCH_SETTLE_FRAMES = 2;

// ---------------------------------------------------------------------------
// The two Ultra diagnostics: `?ultrakit=` and `?ultrafault=`
// ---------------------------------------------------------------------------

/**
 * Every kit switch `?ultrakit=` may name, keyed by its lower-case spelling.
 *
 * A `Record` over `UltraKitSwitch` rather than an array so the compiler
 * refuses a missing or invented switch; `ao` is not a switch (T13 is
 * reserved) and so cannot be named from an address.
 */
const KIT_SWITCHES: Readonly<Record<UltraKitSwitch, true>> = Object.freeze({
  forms: true,
  buildings: true,
  facadeMaps: true,
  ground: true,
  edgeFill: true,
  blocks: true,
  lighting: true,
  farShadow: true,
});

const KIT_SWITCH_BY_LOWER: ReadonlyMap<string, UltraKitSwitch> = new Map(
  (Object.keys(KIT_SWITCHES) as UltraKitSwitch[]).map((name) => [name.toLowerCase(), name]),
);

/**
 * Everything `?ultrafault=` may plant; exhaustive by the same device: every
 * stage, and A28 C1's genuine GL errors (`gl-sky`, `gl-framebuffer`,
 * `gl-enum`), which refuse on `gl-error` or not at all.
 */
const FAULT_PLANTS: Readonly<Record<UltraFaultPlant, true>> = Object.freeze({
  build: true,
  sky: true,
  environment: true,
  shadow: true,
  'far-shadow': true,
  shader: true,
  'gl-error': true,
  'gl-sky': true,
  'gl-framebuffer': true,
  'gl-enum': true,
});

/**
 * Read `?ultrakit=` — the U1 attribution diagnostic (§8.1: `-lighting` shows
 * the forms and surfaces gain alone).
 *
 * The grammar is a list of switch names separated by commas or spaces, each
 * with an optional sign: `-name` turns a switch off, `+name` or a bare `name`
 * turns it on. **A `+` typed into an address arrives as a space**
 * (`URLSearchParams` decodes it that way), which is why a space separates
 * tokens: `?ultrakit=-lighting+farShadow` means what it says. Names match
 * without regard to case; a later mention of a switch wins.
 *
 * `null` for absent, blank, and a value that names no real switch — the
 * `presentationOverrideFrom` rule: a typo in a diagnostic must start the game,
 * not replace it with an error page. It is read from the address only, never
 * saved, never written back and not part of `probing`, because it changes
 * nothing the simulation can see.
 */
export function ultraKitOverrideFrom(search: string): UltraKitOverride | null {
  const raw = new URLSearchParams(search).get('ultrakit');
  if (raw === null) return null;
  const override: Partial<Record<UltraKitSwitch, boolean>> = {};
  let named = 0;
  for (const token of raw.split(/[\s,]+/)) {
    if (token === '') continue;
    const sign = token[0];
    const on = sign !== '-';
    const bare = sign === '-' || sign === '+' ? token.slice(1) : token;
    const name = KIT_SWITCH_BY_LOWER.get(bare.toLowerCase());
    if (name === undefined) continue;
    override[name] = on;
    named += 1;
  }
  return named === 0 ? null : Object.freeze(override);
}

/**
 * Read `?ultrafault=<stage>` — plant an Ultra activation failure so the
 * fallback can be seen from outside (§8, W9 journey 7): the next activation
 * throws at that stage and the game must land on High with the stage's reason
 * and Settings still reachable.
 *
 * One plant or `null`, on `ultraKitOverrideFrom`'s exact terms: absent, blank
 * and unknown values are `null`, case is ignored, and it is never saved,
 * written back or counted as probing.
 */
export function ultraFaultFrom(search: string): UltraFaultPlant | null {
  const raw = new URLSearchParams(search).get('ultrafault');
  if (raw === null) return null;
  const plant = raw.trim().toLowerCase();
  return Object.hasOwn(FAULT_PLANTS, plant) ? plant as UltraFaultPlant : null;
}
