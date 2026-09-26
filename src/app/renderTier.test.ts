/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { QUALITY_LEVELS, type OrdinaryQuality, type QualityLevel } from './options.ts';
import {
  ULTRA_NOT_WANTED,
  ULTRA_SWITCH_PAINT_FRAMES,
  ULTRA_SWITCH_SETTLE_FRAMES,
  describeRefusal,
  multiplayerAfter,
  qualityStateFor,
  refusalScope,
  resolveRenderTier,
  returnTierAfter,
  ultraFaultFrom,
  ultraKitOverrideFrom,
  ultraSwitchFor,
  ultraToggleTarget,
  type RenderTierResolution,
  type SessionEvent,
  type UltraLiveState,
} from './renderTier.ts';
import type { UltraFaultStage, UltraRefusal } from '../render/ultra/ultraTypes.ts';

/**
 * M39 W1 — the requested/effective split (`docs/M39_ULTRA.md` §6.3 W1,
 * `docs/PLANS.md` §39.6).
 *
 * Everything the composition root decides about the render tier is pure and
 * lives in `renderTier.ts`, so this file is where the truth table, the
 * session boundary, the toggle's memory and the diagnostics' grammar are held
 * to the plan. `Game.ts` only gathers facts and pushes answers; the browser
 * journeys that prove it does so are W9's (`tests/m39-ultra.spec.ts`).
 */

const ORDINARY: readonly OrdinaryQuality[] = ['low', 'medium', 'high'];

const ACTIVE: UltraLiveState = { active: true, refusal: null };

const ENVELOPE: UltraRefusal = { kind: 'envelope', axis: 'soloDraws', value: 212, ceiling: 190 };
const SETUP_FAILED: UltraRefusal = { kind: 'setup-failed', stage: 'sky', message: 'boom' };
const CAPABILITY: UltraRefusal = { kind: 'capability', missing: 'half-float-render' };
const OVERRIDE: UltraRefusal = { kind: 'presentation-override', recipe: 'enhanced' };

// ---------------------------------------------------------------------------
// resolveRenderTier: the truth table, every row
// ---------------------------------------------------------------------------

test('an ordinary request is drawn as requested, and offered Ultra unless a room owns the frame', () => {
  // All 24 ordinary rows: three tiers × multiplayer × override × refused. The
  // last two facts are about Ultra and must change nothing for a player who
  // never asked for it — which is the ordinary path's parity, stated as data.
  for (const requested of ORDINARY) {
    for (const multiplayerSession of [false, true]) {
      for (const presentationOverride of [false, true]) {
        for (const refused of [false, true]) {
          const resolution = resolveRenderTier({
            requested, multiplayerSession, presentationOverride, refused,
          });
          assert.deepEqual(resolution, {
            ordinary: requested,
            wantUltra: false,
            ultraOffered: !multiplayerSession,
            suspension: null,
          }, `${requested} mp=${multiplayerSession} override=${presentationOverride} refused=${refused}`);
        }
      }
    }
  }
});

test('an Ultra request resolves by the table, in the table\'s order', () => {
  const rows: readonly [boolean, boolean, boolean, RenderTierResolution][] = [
    // multiplayer, override, refused → resolution
    [false, false, false, { ordinary: 'high', wantUltra: true, ultraOffered: true, suspension: null }],
    [false, false, true, { ordinary: 'high', wantUltra: true, ultraOffered: true, suspension: 'refused' }],
    [false, true, false, { ordinary: 'high', wantUltra: true, ultraOffered: true, suspension: 'presentation-override' }],
    // An override outranks a refusal: the override is why nothing was tried.
    [false, true, true, { ordinary: 'high', wantUltra: true, ultraOffered: true, suspension: 'presentation-override' }],
    // Multiplayer outranks everything and is the one row that withdraws the
    // request: a split frame must never be asked to build Ultra at all.
    [true, false, false, { ordinary: 'high', wantUltra: false, ultraOffered: false, suspension: 'multiplayer' }],
    [true, false, true, { ordinary: 'high', wantUltra: false, ultraOffered: false, suspension: 'multiplayer' }],
    [true, true, false, { ordinary: 'high', wantUltra: false, ultraOffered: false, suspension: 'multiplayer' }],
    [true, true, true, { ordinary: 'high', wantUltra: false, ultraOffered: false, suspension: 'multiplayer' }],
  ];
  for (const [multiplayerSession, presentationOverride, refused, expected] of rows) {
    assert.deepEqual(
      resolveRenderTier({ requested: 'ultra', multiplayerSession, presentationOverride, refused }),
      expected,
      `ultra mp=${multiplayerSession} override=${presentationOverride} refused=${refused}`,
    );
  }
});

test('Ultra always sits on High: the ordinary tier under it is never Low or Medium', () => {
  // The renderer's `setQuality` is told `ordinary` only when it changes, so a
  // player going High → Ultra → High never re-runs it (§6.3 W1 step 2) — and
  // that is only safe because Ultra's ordinary floor is exactly High.
  for (const multiplayerSession of [false, true]) {
    for (const presentationOverride of [false, true]) {
      for (const refused of [false, true]) {
        const { ordinary } = resolveRenderTier({
          requested: 'ultra', multiplayerSession, presentationOverride, refused,
        });
        assert.equal(ordinary, 'high');
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The session boundary: a flag, not a seat count
// ---------------------------------------------------------------------------

test('the multiplayer session begins at the couch or a second seat and ends only at its close or the title', () => {
  assert.equal(multiplayerAfter(false, 'couch-open'), true);
  assert.equal(multiplayerAfter(false, 'seat-spawn'), true, 'a bridge-spawned seat is a session too');
  assert.equal(multiplayerAfter(true, 'couch-close'), false);
  assert.equal(multiplayerAfter(true, 'title'), false);
  assert.equal(multiplayerAfter(false, 'title'), false);
  assert.equal(multiplayerAfter(false, 'seat-despawn'), false);
});

test('a one-seat remnant stays multiplayer, and so stays High, until the session ends', () => {
  // PLANS §39.6: "A one-seat remnant of a couch session remains multiplayer
  // until that session ends." Walk a couch with a saved Ultra: open, seat a
  // guest, lose the guest, and only the title gives Ultra back.
  const walk: readonly [SessionEvent, boolean][] = [
    ['couch-open', true],
    ['seat-spawn', true],
    ['seat-despawn', true], // the remnant: one seat, still a session
    ['seat-despawn', true],
    ['title', false],
  ];
  let session = false;
  for (const [event, expected] of walk) {
    session = multiplayerAfter(session, event);
    assert.equal(session, expected, `after ${event}`);
    const resolution = resolveRenderTier({
      requested: 'ultra', multiplayerSession: session, presentationOverride: false, refused: false,
    });
    assert.equal(resolution.wantUltra, !session, `Ultra wanted after ${event}`);
    assert.equal(resolution.ordinary, 'high');
  }
});

test('Low, Medium and High are untouched by a couch session', () => {
  // Invariant 18: the ordinary tiers keep working exactly as today in couch.
  for (const requested of ORDINARY) {
    const solo = resolveRenderTier({
      requested, multiplayerSession: false, presentationOverride: false, refused: false,
    });
    const couch = resolveRenderTier({
      requested, multiplayerSession: true, presentationOverride: false, refused: false,
    });
    assert.equal(couch.ordinary, solo.ordinary);
    assert.equal(couch.wantUltra, false);
    assert.equal(couch.suspension, null);
  }
});

// ---------------------------------------------------------------------------
// The effective tier the menus and the bridge are told
// ---------------------------------------------------------------------------

test('effective Ultra is earned from the renderer, never assumed from the request', () => {
  const facts = { requested: 'ultra' as QualityLevel, multiplayerSession: false, presentationOverride: false };

  const drawing = qualityStateFor(facts, ACTIVE);
  assert.deepEqual(drawing, {
    requested: 'ultra', effective: 'ultra', ultraOffered: true, suspension: null, reason: null,
  });

  // A renderer that is not drawing Ultra is refused whether or not it named
  // a reason — the label follows the pixels.
  const silent = qualityStateFor(facts, { active: false, refusal: null });
  assert.equal(silent.effective, 'high');
  assert.equal(silent.suspension, 'refused');
  assert.equal(silent.reason, 'the Ultra renderer did not start');

  // Exhaustively: no combination of facts and live state ever labels an
  // ordinary frame Ultra.
  const lives: readonly UltraLiveState[] = [
    ACTIVE, ULTRA_NOT_WANTED,
    { active: false, refusal: ENVELOPE },
    { active: false, refusal: SETUP_FAILED },
    { active: false, refusal: CAPABILITY },
    { active: false, refusal: OVERRIDE },
  ];
  for (const requested of QUALITY_LEVELS) {
    for (const multiplayerSession of [false, true]) {
      for (const presentationOverride of [false, true]) {
        for (const live of lives) {
          const state = qualityStateFor({ requested, multiplayerSession, presentationOverride }, live);
          if (state.effective === 'ultra') {
            assert.equal(live.active, true, 'Ultra labelled over an ordinary frame');
            assert.equal(multiplayerSession, false);
            assert.equal(presentationOverride, false);
          }
          if (requested !== 'ultra') {
            assert.equal(state.effective, requested);
            assert.equal(state.suspension, null);
            assert.equal(state.reason, null);
          }
          assert.equal(state.ultraOffered, !multiplayerSession);
          assert.equal(state.requested, requested, 'the saved choice is reported as saved');
        }
      }
    }
  }
});

test('each suspension carries its own reason', () => {
  const ultra = 'ultra' as QualityLevel;

  const couch = qualityStateFor(
    { requested: ultra, multiplayerSession: true, presentationOverride: false },
    ULTRA_NOT_WANTED,
  );
  assert.equal(couch.suspension, 'multiplayer');
  assert.equal(couch.effective, 'high');
  assert.equal(couch.ultraOffered, false);
  assert.equal(couch.reason, 'single player only');

  const override = qualityStateFor(
    { requested: ultra, multiplayerSession: false, presentationOverride: true },
    { active: false, refusal: OVERRIDE },
  );
  assert.equal(override.suspension, 'presentation-override');
  assert.equal(override.reason, '?presentation=enhanced is set');

  // The renderer naming the override is enough on its own.
  const named = qualityStateFor(
    { requested: ultra, multiplayerSession: false, presentationOverride: false },
    { active: false, refusal: { kind: 'presentation-override', recipe: 'baseline' } },
  );
  assert.equal(named.suspension, 'presentation-override');
  assert.equal(named.reason, '?presentation=baseline is set');

  const refused = qualityStateFor(
    { requested: ultra, multiplayerSession: false, presentationOverride: false },
    { active: false, refusal: ENVELOPE },
  );
  assert.equal(refused.suspension, 'refused');
  assert.equal(refused.effective, 'high');
  assert.equal(refused.ultraOffered, true, 'a refused Ultra can still be switched off from the title');
  assert.equal(refused.reason, 'this world needs 212 draw calls; Ultra allows 190');
});

test('sticky and world refusals keep the intent; only their scope differs', () => {
  // The renderer does the refusing, so the app keeps asking under every
  // refusal: a world-scoped breach is judged afresh on the next world, and a
  // session-sticky one keeps refusing on the renderer's side.
  assert.equal(refusalScope(ENVELOPE), 'world');
  assert.equal(refusalScope(SETUP_FAILED), 'session');
  assert.equal(refusalScope(CAPABILITY), 'session');
  assert.equal(refusalScope(OVERRIDE), 'boot');

  const facts = { requested: 'ultra' as QualityLevel, multiplayerSession: false, presentationOverride: false };
  for (const refusal of [ENVELOPE, SETUP_FAILED, CAPABILITY]) {
    const resolution = resolveRenderTier({ ...facts, refused: true });
    assert.equal(resolution.wantUltra, true, `${refusal.kind} withdrew the request`);
    assert.equal(qualityStateFor(facts, { active: false, refusal }).suspension, 'refused');
  }

  // World-scoped: this world breaches, the next one fits — Ultra returns
  // with nothing the app had to remember.
  const heavy = qualityStateFor(facts, { active: false, refusal: ENVELOPE });
  const light = qualityStateFor(facts, ACTIVE);
  assert.equal(heavy.effective, 'high');
  assert.equal(light.effective, 'ultra');

  // Session-sticky: the renderer still reports the failure on the next
  // world, and the state stays refused with the same words.
  const first = qualityStateFor(facts, { active: false, refusal: SETUP_FAILED });
  const next = qualityStateFor(facts, { active: false, refusal: SETUP_FAILED });
  assert.deepEqual(next, first);
  assert.equal(first.reason, 'the Ultra sky could not be painted');
});

test('every refusal has distinct, short, parenthesis-ready words', () => {
  const stages: readonly UltraFaultStage[] = [
    'build', 'sky', 'environment', 'shadow', 'far-shadow', 'shader', 'gl-error',
  ];
  const refusals: UltraRefusal[] = [
    OVERRIDE,
    { kind: 'capability', missing: 'webgl2' },
    { kind: 'capability', missing: 'half-float-render' },
    { kind: 'capability', missing: 'max-texture-size' },
    ...stages.map((stage): UltraRefusal => ({ kind: 'setup-failed', stage, message: 'x' })),
    { kind: 'envelope', axis: 'soloDraws', value: 212, ceiling: 190 },
    { kind: 'envelope', axis: 'soloTriangles', value: 1_234_567, ceiling: 1_100_000 },
    { kind: 'envelope', axis: 'propDraws', value: 50, ceiling: 46 },
    { kind: 'envelope', axis: 'propTriangles', value: 460_000, ceiling: 450_000 },
    { kind: 'envelope', axis: 'bytes', value: 230 * 1024 * 1024, ceiling: 200 * 1024 * 1024 },
    { kind: 'envelope', axis: 'programs', value: 40, ceiling: 36 },
    { kind: 'envelope', axis: 'shadowMap', value: 8192, ceiling: 4096 },
  ];
  const words = refusals.map(describeRefusal);
  assert.equal(new Set(words).size, words.length, 'two refusals share their words');
  for (const phrase of words) {
    assert.ok(phrase.length > 0 && phrase.length <= 80, `too long for the readout: ${phrase}`);
    assert.ok(!phrase.includes('(') && !phrase.includes(')'), `nests parentheses: ${phrase}`);
    assert.equal(phrase[0], phrase[0].toLowerCase(), `not lower-case: ${phrase}`);
  }
  // A setup failure is named by its stage, never by whatever the exception
  // said — the message stays on the report for diagnosis.
  assert.equal(
    describeRefusal({ kind: 'setup-failed', stage: 'shader', message: 'TypeError: at line 41' }),
    'an Ultra shader failed to compile',
  );
  // Locale-free grouping, and memory in MiB.
  assert.equal(
    describeRefusal({ kind: 'envelope', axis: 'soloTriangles', value: 1_234_567, ceiling: 1_100_000 }),
    'this world needs 1,234,567 triangles; Ultra allows 1,100,000',
  );
  assert.equal(
    describeRefusal({ kind: 'envelope', axis: 'bytes', value: 230 * 1024 * 1024, ceiling: 200 * 1024 * 1024 }),
    'this world needs 230 MiB of GPU memory; Ultra allows 200 MiB',
  );
});

// ---------------------------------------------------------------------------
// The title toggle and its return-tier memory
// ---------------------------------------------------------------------------

test('the toggle turns Ultra on from any ordinary tier and off to the remembered one', () => {
  for (const tier of ORDINARY) {
    assert.equal(ultraToggleTarget(tier, null, false), 'ultra');
    assert.equal(ultraToggleTarget('ultra', tier, false), tier);
  }
  // Nothing remembered — a saved Ultra at boot — returns to High.
  assert.equal(ultraToggleTarget('ultra', null, false), 'high');
});

test('the toggle is refused while a multiplayer session owns the frame', () => {
  for (const requested of QUALITY_LEVELS) {
    assert.equal(ultraToggleTarget(requested, 'medium', true), null, requested);
  }
});

test('the return tier is recorded on ordinary → Ultra from either entrance and forgotten on the way out', () => {
  // On from Medium (title toggle or Settings select — one preference).
  let memory = returnTierAfter('medium', 'ultra', null);
  assert.equal(memory, 'medium');
  // Nothing about Ultra changing again moves it.
  memory = returnTierAfter('ultra', 'ultra', memory);
  assert.equal(memory, 'medium');
  // The toggle off returns there…
  const back = ultraToggleTarget('ultra', memory, false);
  assert.equal(back, 'medium');
  // …and leaving Ultra forgets it.
  memory = returnTierAfter('ultra', back as QualityLevel, memory);
  assert.equal(memory, null);

  // Boot with a saved Ultra: no previous tier, nothing remembered → High.
  assert.equal(returnTierAfter(null, 'ultra', null), null);
  assert.equal(ultraToggleTarget('ultra', returnTierAfter(null, 'ultra', null), false), 'high');

  // Choosing an ordinary tier in Settings turns the shortcut off — the
  // memory with it — and the next On records afresh.
  memory = returnTierAfter('low', 'ultra', null);
  memory = returnTierAfter('ultra', 'high', memory);
  assert.equal(memory, null);
  memory = returnTierAfter('high', 'ultra', memory);
  assert.equal(memory, 'high');

  // Ordinary → ordinary never records anything.
  for (const from of ORDINARY) {
    for (const to of ORDINARY) assert.equal(returnTierAfter(from, to, 'low'), null);
  }
});

// ---------------------------------------------------------------------------
// The loading notice: which choices are a switch the player waits for
// ---------------------------------------------------------------------------

/** Solo, no override: the facts a title or Settings press is judged with. */
const solo = (requested: QualityLevel) => ({ requested, multiplayerSession: false, presentationOverride: false });

test('only a choice that moves the renderer across Ultra is a switch; ordinary tiers stay instant', () => {
  // Decided from the intent, not the tier a press came from: with Ultra not
  // applied (any ordinary tier), Ultra is entering and every ordinary tier nothing.
  assert.equal(ultraSwitchFor(solo('ultra'), false), 'entering');
  for (const to of ORDINARY) assert.equal(ultraSwitchFor(solo(to), false), null, to);
  // From an applied Ultra: every ordinary tier is leaving, Ultra again nothing.
  for (const to of ORDINARY) assert.equal(ultraSwitchFor(solo(to), true), 'leaving', to);
  assert.equal(ultraSwitchFor(solo('ultra'), true), null);
});

test('a couch session is never a switch — Ultra is not applied there — but an override or refusal still is', () => {
  const couch = (requested: QualityLevel) => ({ requested, multiplayerSession: true, presentationOverride: false });
  // A saved Ultra under a couch already draws High, so leaving it changes nothing on the renderer.
  for (const to of ORDINARY) assert.equal(ultraSwitchFor(couch(to), false), null, to);
  // And asking for Ultra there (the option is disabled; the toggle refuses) builds nothing.
  assert.equal(ultraSwitchFor(couch('ultra'), false), null);
  // A `?presentation=` override keeps the intent, so the renderer is asked (and refuses quickly).
  assert.equal(ultraSwitchFor({ requested: 'ultra', multiplayerSession: false, presentationOverride: true }, false), 'entering');
});

test('the notice paints before the switch, and outlasts it', () => {
  // One frame is the least that paints (a rAF callback runs before its frame's paint);
  // the second is the compositor's margin. The busy state then outlives the freeze.
  assert.ok(ULTRA_SWITCH_PAINT_FRAMES >= 1 && ULTRA_SWITCH_PAINT_FRAMES <= 3);
  assert.ok(ULTRA_SWITCH_SETTLE_FRAMES >= 1 && ULTRA_SWITCH_SETTLE_FRAMES <= 3);
  assert.equal(ULTRA_SWITCH_PAINT_FRAMES, 2);
  assert.equal(ULTRA_SWITCH_SETTLE_FRAMES, 2);
});

// ---------------------------------------------------------------------------
// The diagnostics: `?ultrakit=` and `?ultrafault=`
// ---------------------------------------------------------------------------

test('?ultrakit= reads signed switches, and a + typed into an address still means on', () => {
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=-lighting'), { lighting: false });
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=-edgeFill'), { edgeFill: false });
  // `+` decodes to a space in a query string; both spellings mean on.
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=+farShadow'), { farShadow: true });
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=%2BfarShadow'), { farShadow: true });
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=farShadow'), { farShadow: true });
  assert.deepEqual(
    ultraKitOverrideFrom('?ultrakit=-lighting+farShadow,-EDGEFILL'),
    { lighting: false, farShadow: true, edgeFill: false },
  );
  // A later mention wins.
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=-forms,forms'), { forms: true });
  // Beside other parameters, as it will be in a real address.
  assert.deepEqual(
    ultraKitOverrideFrom('?level=switchback&ultrakit=-lighting&presentation=enhanced'),
    { lighting: false },
  );
  assert.ok(Object.isFrozen(ultraKitOverrideFrom('?ultrakit=-lighting')));
});

test('?ultrakit= ignores what it does not know, and ao can never be named', () => {
  for (const search of [
    '', '?level=slice', '?ultrakit=', '?ultrakit=%20', '?ultrakit=ao', '?ultrakit=-ao',
    '?ultrakit=sparkles', '?ultrakit=-', '?ultrakit=,,,',
  ]) {
    assert.equal(ultraKitOverrideFrom(search), null, search);
  }
  assert.deepEqual(ultraKitOverrideFrom('?ultrakit=+ao,-lighting'), { lighting: false });
});

test('?ultrafault= names exactly one stage or nothing', () => {
  const stages: readonly UltraFaultStage[] = [
    'build', 'sky', 'environment', 'shadow', 'far-shadow', 'shader', 'gl-error',
  ];
  for (const stage of stages) {
    assert.equal(ultraFaultFrom(`?ultrafault=${stage}`), stage);
    assert.equal(ultraFaultFrom(`?ultrafault=${stage.toUpperCase()}`), stage, 'case is ignored');
  }
  // A28 C1: the genuine-GL-error plants, which are not refusal stages.
  for (const plant of ['gl-sky', 'gl-framebuffer', 'gl-enum'] as const) {
    assert.equal(ultraFaultFrom(`?ultrafault=${plant}`), plant);
    assert.equal(ultraFaultFrom(`?ultrafault=${plant.toUpperCase()}`), plant, 'case is ignored');
  }
  for (const search of [
    '', '?ultrafault=', '?ultrafault=everything', '?ultrafault=far_shadow', '?ultrafault=toString',
    '?ultrafault=__proto__',
  ]) {
    assert.equal(ultraFaultFrom(search), null, search);
  }
});
