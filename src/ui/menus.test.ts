/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  COUCH_COP_HINT,
  COUCH_RIDER_HINT,
  QUALITY_ULTRA_WARNING,
  ULTRA_LEAVING_NOTICE,
  ULTRA_LOADING_NOTICE,
  ULTRA_TOGGLE_HELP,
  ULTRA_TOGGLE_WARNING,
  modeChooserNote,
  qualityBusyWords,
  qualityStateWords,
  routeStatusLine,
  stepEnabledOption,
  venueButtonTemplate,
  titleCreditTemplate,
  aboutTemplate,
  aboutScrollStep,
  reflowParagraphs,
  plainNotice,
  ABOUT_SCROLL_KEYS,
} from './menus.ts';
import { PROVENANCE, devlogHandle, versionStamp } from '../data/provenance.ts';
import { VENUE_IDS } from '../app/venues.ts';
import {
  COUCH_RIDES,
  COUCH_RIDE_LABELS,
  COUCH_SEATS,
  cycleSeatCharacter,
  guestRoster,
  rosterForRide,
  type CouchRide,
} from '../app/couch.ts';
import { CHARACTER_IDS, characterSpec, type CharacterId } from '../data/riders.ts';
import { QUALITY_LEVELS, type QualityLevel } from '../app/options.ts';
import type { QualityStateView } from '../app/renderTier.ts';

/**
 * The fresh-route panel's one line, pinned headlessly — M36 Phase 5 (IDM-2).
 *
 * `routeStatusLine` is the whole of what the panel says about its own state,
 * and it needs no document: a tagged status and one fact about the loaded
 * world go in, a tone and a sentence come out. The venue line is the one this
 * file was written for — it replaced a blank line on a press that had
 * succeeded, and a blank line is exactly what a browser spec has the hardest
 * time telling apart from a press that did nothing.
 */

test('a venue press says which place is loaded and where the ride is', () => {
  const [tone, message] = routeStatusLine({ kind: 'venue-ready', venue: 'switchback' }, true);
  // **And it names the action that press just made available** — M38 §38.6.
  // The park is the one venue that hosts a Trick Run, so selecting it reveals
  // a control on this panel, and a line that reported the swap without saying
  // so would be the same silence this function was written to remove.
  assert.equal(
    message,
    'Switchback Park is ready. Trick Run scores your tricks here, or Back to the '
    + 'title to ride it or lap it.',
  );
  // Not a refusal and not a wait: the world is already swapped when this is
  // written, so the line reads as the success it reports.
  assert.equal(tone, 'ready');
});

test('the line never offers a lap to a world that does not close one', () => {
  // The city's Track Day goes to BelVar (`lapVenueName`), so a line that told
  // the city it could be lapped would be the same lie the Track Day note used
  // to tell. The fact is the plan's, carried in rather than looked up here.
  // (The place is "Original city" since M39 Phase 1 made the curated town the
  // plain launch — `docs/M39_PHASE1.md`; the sentence is `VENUE_LABELS`'.)
  const [, city] = routeStatusLine({ kind: 'venue-ready', venue: 'slice' }, false);
  assert.equal(city, 'Original city is ready. Back to the title to ride it.');
  assert.ok(!city.includes('lap'), 'the city was offered a lap it would take elsewhere');

  const [, belvar] = routeStatusLine({ kind: 'venue-ready', venue: 'track' }, true);
  assert.equal(belvar, 'BelVar Circuit is ready. Back to the title to ride it or lap it.');
  // **The scoring clause is withdrawn for a venue that does not host one.**
  // BelVar laps and the city does not, and neither scores tricks — a panel
  // that kept offering the action after the selection moved would be the
  // control lying about the place under it (M38 §38.6).
  assert.ok(!belvar.includes('Trick Run'), 'BelVar was offered a run it does not host');
  assert.ok(!city.includes('Trick Run'), 'the city was offered a run it does not host');
});

test('every venue the chooser offers is named rather than spelt', () => {
  // The roster drives this rather than a list typed here, so a fourth venue
  // arrives with a sentence or fails on the way in. The id must never reach
  // the screen: `slice` and `switchback` are file names, not places.
  for (const venue of VENUE_IDS) {
    const [tone, message] = routeStatusLine({ kind: 'venue-ready', venue }, true);
    assert.equal(tone, 'ready');
    assert.ok(message.endsWith('.'), `${venue} was left mid-sentence`);
    assert.ok(!message.includes(venue), `${venue} reached the player as an id`);
    assert.ok(message.includes('is ready.'), `${venue} lost the shape`);
    assert.ok(
      message.includes('Back to the title to ride it'),
      `${venue} stopped saying where the ride is`,
    );
  }
});

/**
 * A venue button's markup, split into what a browser would make of it.
 *
 * There is no document here, so this is the parse done by hand for the one
 * shape the template emits: the `<svg>` blocks are counted and read whole, and
 * `textContent` is every character outside a tag — which is what the browser's
 * own `textContent` is for markup with no entities and no comments, and this
 * markup has neither.
 */
function venueButtonParts(venue: (typeof VENUE_IDS)[number]): {
  readonly button: string;
  readonly svgs: readonly string[];
  readonly text: string;
} {
  const html = venueButtonTemplate(venue);
  const button = /<button\b[\s\S]*<\/button>/.exec(html)?.[0] ?? '';
  const svgs = button.match(/<svg\b[\s\S]*?<\/svg>/g) ?? [];
  const text = button.replace(/<[^>]*>/g, '').trim();
  return { button, svgs, text };
}

test('Wheelhouse Wharf carries one decorative picture and keeps its name as its words (M44)', () => {
  // DESIGN §9t / PLANS §44 D3: the Ultra flame's terms. The picture is hidden
  // from assistive tech and from the Tab walk, and it has no <title>, so the
  // button's name is the label and nothing else — the browser census reads
  // `textContent.trim()` as the label, and a <title> would have been read into
  // it.
  const { button, svgs, text } = venueButtonParts('euclaude');
  assert.ok(button.length > 0, 'the template drew no button');
  assert.equal(svgs.length, 1, 'one picture, no more');
  const [svg] = svgs;
  assert.match(svg, /^<svg\b[^>]*\baria-hidden="true"/);
  assert.match(svg, /^<svg\b[^>]*\bfocusable="false"/);
  assert.ok(!/<title\b/i.test(svg), 'a <title> would join the button\'s name');
  assert.ok(!/<text\b/i.test(svg), 'drawn text inside the picture would join its words');
  assert.equal(text, 'Wheelhouse Wharf');
  // The M44 repair pass (the critic: "two blue boxes", single-pixel dots):
  // the buildings carry windows, and the jump is five separate round dots
  // rather than dashes whose last one a renderer may drop.
  assert.match(svg, /class="euc-venue__icon-windows"/, 'the buildings lost their windows');
  const arc = /class="euc-venue__icon-arc" d="([^"]*)"/.exec(svg)?.[1] ?? '';
  assert.equal(arc.match(/M/g)?.length ?? 0, 5, 'the jump arc is five dots');
  // Still the chooser's own control: the same hook, the same state attribute,
  // the picture before the words and never a second label.
  assert.match(button, /data-menu="venue"/);
  assert.match(button, /data-venue="euclaude"/);
  assert.match(button, /aria-pressed="false"/);
  assert.ok(button.indexOf('<svg') < button.indexOf('Wheelhouse Wharf'), 'the picture follows the name');
});

test('every venue button is its label in words, and any picture obeys the same rules', () => {
  // A map rather than a branch (`VENUE_ICONS`): a place may have a picture or
  // not, and either way its button's words are exactly the name the status
  // line uses for it — the two are read out of the same label map.
  for (const venue of VENUE_IDS) {
    const { svgs, text } = venueButtonParts(venue);
    assert.ok(svgs.length <= 1, `${venue} has more than one picture`);
    for (const svg of svgs) {
      assert.match(svg, /^<svg\b[^>]*\baria-hidden="true"/, `${venue}'s picture is announced`);
      assert.match(svg, /^<svg\b[^>]*\bfocusable="false"/, `${venue}'s picture is focusable`);
      assert.ok(!/<title\b/i.test(svg), `${venue}'s picture has a <title>`);
    }
    assert.ok(text.length > 0, `${venue}'s button has no words`);
    assert.ok(!text.includes(venue), `${venue} reached the button as an id`);
    const [, message] = routeStatusLine({ kind: 'venue-ready', venue }, false);
    assert.ok(message.startsWith(`${text} is ready.`), `${venue}'s button and status line disagree`);
  }
});

test('the seed refusal is still the seed refusal, and is no longer what a venue press earns', () => {
  // The defect this replaced: a place was chosen, the line went idle, and the
  // next press answered a question about places with a sentence about seeds.
  const [, blank] = routeStatusLine({ kind: 'blank' }, true);
  assert.equal(blank, 'Type a route name, or choose Surprise me.');
  const [, venue] = routeStatusLine({ kind: 'venue-ready', venue: 'switchback' }, true);
  assert.notEqual(venue, blank);
  assert.ok(!venue.includes('route name'), 'the venue line refused the player about a seed');
});

// -- M39: the quality preference's two entrances ------------------------------
//
// The title's Ultra Graphics toggle and the Settings readout are composed by
// `qualityStateWords` from the saved request and the renderer's answer, and
// `Menus.sync` only copies the result into the DOM — so every wording, and the
// one honesty rule the plan cares most about, is pinned here without a
// document. PLANS §39.6: "never a blank frame or an 'Ultra active' label over
// the ordinary path".

/** A renderer answer, filled with the ordinary single-player case. */
function view(overrides: Partial<QualityStateView> & { requested: QualityLevel }): QualityStateView {
  return {
    effective: overrides.requested,
    ultraOffered: true,
    suspension: null,
    reason: null,
    ...overrides,
  };
}

test('every ordinary tier reads Off, unpressed and offered, with nothing to explain', () => {
  for (const requested of ['low', 'medium', 'high'] as const) {
    const words = qualityStateWords(requested, view({ requested }));
    assert.deepEqual(words, {
      pressed: false,
      disabled: false,
      kind: 'off',
      state: 'Off',
      readout: '',
    }, `${requested} did not read as an ordinary Off`);
  }
});

test('On is earned by an Ultra frame, never by the request', () => {
  const on = qualityStateWords('ultra', view({ requested: 'ultra', effective: 'ultra' }));
  assert.equal(on.state, 'On');
  assert.equal(on.kind, 'on');
  assert.equal(on.pressed, true);
  assert.equal(on.readout, '', 'a working Ultra has nothing to explain');

  // Asked for and not yet confirmed — before `app/Game.ts` has said anything,
  // or while the renderer is still drawing High — is pressed and says so.
  const unconfirmed = qualityStateWords('ultra', null);
  assert.equal(unconfirmed.pressed, true);
  assert.equal(unconfirmed.state, 'Using High');
  assert.equal(unconfirmed.kind, 'fallback');

  // **A view describing another request is not trusted.** Game pushes the
  // saved options and the tier facts in two calls; between them the toggle
  // must not borrow the previous request's "effective" and light itself.
  const stale = qualityStateWords('ultra', view({ requested: 'high', effective: 'high' }));
  assert.equal(stale.state, 'Using High');
  const staleOn = qualityStateWords('high', view({ requested: 'ultra', effective: 'ultra' }));
  assert.equal(staleOn.state, 'Off', 'a leftover Ultra view lit an ordinary request');
  assert.equal(staleOn.pressed, false);
});

test('no combination of facts ever says On over an ordinary frame', () => {
  const tiers: readonly QualityLevel[] = QUALITY_LEVELS;
  const suspensions: readonly QualityStateView['suspension'][] =
    [null, 'multiplayer', 'presentation-override', 'refused'];
  let checked = 0;
  for (const requested of tiers) {
    for (const viewRequested of tiers) {
      for (const effective of tiers) {
        for (const ultraOffered of [true, false]) {
          for (const suspension of suspensions) {
            const state = view({ requested: viewRequested, effective, ultraOffered, suspension });
            const words = qualityStateWords(requested, state);
            checked += 1;
            if (words.state === 'On') {
              assert.equal(requested, 'ultra');
              assert.equal(state.requested, 'ultra');
              assert.equal(state.effective, 'ultra', 'On was printed over an ordinary frame');
              assert.equal(words.disabled, false);
            }
            // Pressed is the request and nothing else.
            assert.equal(words.pressed, requested === 'ultra');
            // Disabled is the session and nothing else.
            assert.equal(words.disabled, !ultraOffered);
            assert.ok(!/ultra is on|ultra active/i.test(words.readout), words.readout);
          }
        }
      }
    }
  }
  assert.equal(checked, 4 * 4 * 4 * 2 * 4);
});

test('a refusal is explained in the renderer’s words, without a doubled full stop', () => {
  const refused = (reason: string | null) => qualityStateWords('ultra', view({
    requested: 'ultra', effective: 'high', suspension: 'refused', reason,
  }));

  const withReason = refused('this GPU cannot render half-float targets.');
  assert.equal(withReason.state, 'Using High');
  assert.equal(withReason.pressed, true);
  assert.equal(withReason.disabled, false, 'a refusal is not a couch: Settings stays usable');
  assert.equal(
    withReason.readout,
    'Ultra couldn’t start here — using High (this GPU cannot render half-float targets)',
  );

  // No reason, or an empty one, drops the brackets rather than printing "()".
  assert.equal(refused(null).readout, 'Ultra couldn’t start here — using High');
  assert.equal(refused('  ').readout, 'Ultra couldn’t start here — using High');
});

test('a diagnostic override is named as one, and is not called a failure', () => {
  const words = qualityStateWords('ultra', view({
    requested: 'ultra', effective: 'high', suspension: 'presentation-override',
  }));
  assert.equal(words.readout, 'Diagnostic override — using High');
  assert.equal(words.state, 'Using High');
  assert.ok(!words.readout.includes('couldn'), 'an override read as a refusal');
});

test('a couch session disables the choice and never touches the request', () => {
  // A saved Ultra under a couch session: still pressed (the preference is
  // untouched), not choosable, and the readout says why the frame is High.
  const saved = qualityStateWords('ultra', view({
    requested: 'ultra', effective: 'high', ultraOffered: false, suspension: 'multiplayer',
  }));
  assert.deepEqual(saved, {
    pressed: true,
    disabled: true,
    kind: 'unavailable',
    state: 'Single player only',
    readout: 'Single player only — this session uses High',
  });

  // An ordinary tier in the same session: the option is disabled too, and
  // there is nothing to explain, because the player is seeing what they chose.
  const medium = qualityStateWords('medium', view({ requested: 'medium', ultraOffered: false }));
  assert.equal(medium.disabled, true);
  assert.equal(medium.pressed, false);
  assert.equal(medium.readout, '');

  // **The session fact survives a stale view** — whether a couch owns the
  // frame does not depend on which request the view was describing.
  const stale = qualityStateWords('high', view({ requested: 'ultra', ultraOffered: false }));
  assert.equal(stale.disabled, true);
});

test('the helper and the warning say what the plan asked, and pass the phone’s offers scan', () => {
  assert.equal(ULTRA_TOGGLE_HELP, 'Higher GPU demand. Single player only.');
  // Codex QA C3: the compact title's visible warning is the helper's own
  // first sentence, so a phone shows the words a screen reader hears first.
  assert.equal(ULTRA_TOGGLE_WARNING, 'Higher GPU demand');
  assert.ok(ULTRA_TOGGLE_HELP.startsWith(`${ULTRA_TOGGLE_WARNING}.`));
  assert.equal(
    QUALITY_ULTRA_WARNING,
    'Requires a capable GPU; smoothness and battery use vary by device.',
  );
  // `tests/touch.spec.ts` fails any visible title control whose text mentions
  // a second player on a phone. The helper is visually hidden there but still
  // in the button's text, so it has to pass the same pattern — and every
  // state word it can sit beside, too.
  const offersScan = /2 player|two player|couch|split/;
  for (const text of [ULTRA_TOGGLE_HELP, ULTRA_TOGGLE_WARNING, 'Ultra Graphics', 'On', 'Off', 'Using High', 'Single player only']) {
    assert.ok(!offersScan.test(text.toLowerCase()), `"${text}" reads as a multiplayer offer`);
  }
});

test('a switch across Ultra says so in the owner’s words, and never in a word the settled toggle uses', () => {
  // The owner, 2026-09-25: "needs like a 'loading...' message". Entering is
  // the long switch and gets his word; leaving says what it is doing.
  assert.equal(ULTRA_LOADING_NOTICE, 'Loading Ultra graphics…');
  assert.equal(ULTRA_LEAVING_NOTICE, 'Turning Ultra off…');
  for (const from of ['low', 'medium', 'high'] as const) {
    assert.deepEqual(qualityBusyWords({ direction: 'entering', from, to: 'ultra' }), {
      state: 'Loading…',
      notice: ULTRA_LOADING_NOTICE,
    });
    assert.deepEqual(qualityBusyWords({ direction: 'leaving', from: 'ultra', to: from }), {
      state: 'Switching…',
      notice: ULTRA_LEAVING_NOTICE,
    });
  }
  // The busy state word can never be mistaken for a settled one, so anything
  // waiting for "On", "Off" or "Using High" waits for the switch to finish.
  for (const busy of ['Loading…', 'Switching…']) {
    assert.ok(!['On', 'Off', 'Using High', 'Single player only'].includes(busy));
  }
  // The same offers scan as the helper: nothing here reads as a second player.
  const offersScan = /2 player|two player|couch|split/;
  for (const text of [ULTRA_LOADING_NOTICE, ULTRA_LEAVING_NOTICE, 'Loading…', 'Switching…']) {
    assert.ok(!offersScan.test(text.toLowerCase()), `"${text}" reads as a multiplayer offer`);
  }
});

test('a disabled option is stepped over by confirm and by a press, and nothing else changes', () => {
  // Nothing disabled: exactly the old arithmetic — confirm is (i + 1) % n,
  // a press is clamp(i ± 1). Every ordinary select steps as it always did.
  const open = [false, false, false, false];
  for (let from = 0; from < open.length; from += 1) {
    assert.equal(stepEnabledOption(open, from, 1, true), (from + 1) % open.length);
    assert.equal(stepEnabledOption(open, from, 1, false), Math.min(open.length - 1, from + 1));
    assert.equal(stepEnabledOption(open, from, -1, false), Math.max(0, from - 1));
  }

  // The quality list in a couch session: Ultra (last) disabled.
  const couch = QUALITY_LEVELS.map((level) => level === 'ultra');
  const at = (level: QualityLevel) => QUALITY_LEVELS.indexOf(level);
  // A's lap goes round the ordinary three and never lands on Ultra.
  assert.equal(stepEnabledOption(couch, at('high'), 1, true), at('low'));
  // From a saved Ultra (selected, disabled), A leaves it for the next choosable one.
  assert.equal(stepEnabledOption(couch, at('ultra'), 1, true), at('low'));
  // Right from High stays on High: the clamped walk does not jump past the end.
  assert.equal(stepEnabledOption(couch, at('high'), 1, false), at('high'));
  // Left from a saved Ultra reaches High, and Right from it goes nowhere.
  assert.equal(stepEnabledOption(couch, at('ultra'), -1, false), at('high'));
  assert.equal(stepEnabledOption(couch, at('ultra'), 1, false), at('ultra'));

  // A disabled option in the middle is stepped *over*, not onto.
  assert.equal(stepEnabledOption([false, true, false], 0, 1, false), 2);
  assert.equal(stepEnabledOption([false, true, false], 2, -1, false), 0);
  assert.equal(stepEnabledOption([false, true, false], 2, 1, true), 0);

  // Nowhere to go stays put rather than throwing or spinning.
  assert.equal(stepEnabledOption([true, true], 0, 1, true), 0);
  assert.equal(stepEnabledOption([false, true], 0, 1, true), 0);
  assert.equal(stepEnabledOption([], 0, 1, true), 0);
});

test('Ultra is the last quality, so single player’s A-lap from High passes through it', () => {
  // `tests/m24.spec.ts` presses A round the whole list from the default; the
  // first press from High is Ultra, and the ordinary three keep their order.
  assert.deepEqual(QUALITY_LEVELS, ['low', 'medium', 'high', 'ultra']);
  const open = QUALITY_LEVELS.map(() => false);
  assert.equal(QUALITY_LEVELS[stepEnabledOption(open, QUALITY_LEVELS.indexOf('high'), 1, true)], 'ultra');
});

// -- M39 Part P: the chase on the couch's two doors and its wheel ------------

test('the couch chooser offers a fifth button, Police chase, last (A-9)', () => {
  // The chooser is emitted from `COUCH_RIDES` in all three places it stands
  // (the join panel, the pause card, the results card), so the list is the
  // markup: the fifth entry is the fifth button, and its words are the title's.
  assert.equal(COUCH_RIDES.length, 5);
  assert.equal(COUCH_RIDES[4], 'chase');
  assert.deepEqual(COUCH_RIDES.map((ride) => COUCH_RIDE_LABELS[ride]),
    ['Free ride', 'Race', 'Knockabout', 'Trick Run', 'Police chase']);
  // And the paragraph under it says what the fifth one is, both faces in one
  // clause — without the word the trick paragraph must never carry (§36.6).
  const note = modeChooserNote('BelVar Circuit');
  assert.match(note, /Police chase sets Officer Dorkins on everybody, unless one of you rides as him\.$/);
  assert.ok(!/score/i.test(note), 'the chooser note said "score"');
});

/**
 * Walk one seat's wheel the way the join panel's arrows do: `Game` answers
 * each press with `cycleSeatCharacter`, and the card draws
 * `characterSpec(id).name`. Returns the names the card shows, press by press.
 */
function walkWheel(start: CharacterId, taken: readonly CharacterId[], ride: CouchRide, presses: number): string[] {
  const shown: string[] = [];
  let current = start;
  for (let press = 0; press < presses; press += 1) {
    current = cycleSeatCharacter(current, taken, 1, ride);
    shown.push(characterSpec(current).name);
  }
  return shown;
}

test('the wheel offers Officer Dorkins on the chase only, and once (q215)', () => {
  const lap = CHARACTER_IDS.length + 1;
  const others = guestRoster('cool-rider', COUCH_SEATS).slice(1);
  // Seat 1's wheel with seats 0, 2 and 3 dressed: one lap of presses.
  for (const ride of COUCH_RIDES) {
    const shown = walkWheel(others[0], ['cool-rider', others[1], others[2]], ride, lap);
    const cops = shown.filter((name) => name === 'Officer Dorkins').length;
    assert.equal(cops, ride === 'chase' ? 1 : 0, `${ride}: Dorkins offered ${cops} times in one lap`);
  }
  // A seat already holding him takes him off every other seat's wheel.
  const held = walkWheel('cool-rider', ['cop', 'trollina'], 'chase', lap * 2);
  assert.ok(!held.includes('Officer Dorkins'), 'a second seat was offered the cop');
});

test('a door away from the chase re-deals the cop before the card is drawn (M26)', () => {
  const room: CharacterId[] = ['cool-rider', 'cop', 'trollina'];
  for (const ride of COUCH_RIDES) {
    const dealt = rosterForRide(room, ride);
    const cops = dealt.filter((id) => id === 'cop').length;
    assert.equal(cops, ride === 'chase' ? 1 : 0, `${ride} kept ${cops} cops`);
    assert.equal(new Set(dealt).size, dealt.length, `${ride} dressed two seats alike (q68)`);
  }
});

test('the seat holding Dorkins says it holds the slot, in fewer words than it replaces', () => {
  assert.equal(COUCH_COP_HINT, 'The cop');
  assert.equal(COUCH_RIDER_HINT, 'Change rider');
  // The fit argument in `setCouchView`: the line swaps in place, so it must
  // never be the longer of the two.
  assert.ok(COUCH_COP_HINT.length <= COUCH_RIDER_HINT.length);
  // The card draws the cop by his own spec, not the playable roster's first.
  assert.equal(characterSpec('cop').name, 'Officer Dorkins');
});


// -- M40: the title's colophon and About and licences -------------------------

test('the title credit reads PROVENANCE and its stamp is text, not a stop (M40)', () => {
  const html = titleCreditTemplate();
  assert.ok(html.includes(`href="${PROVENANCE.repositoryUrl}"`));
  assert.ok(html.includes(`>${PROVENANCE.author}</a>`));
  const stamp = /<span class="euc-credit__stamp" data-note="stamp">([^<]*)<\/span>/.exec(html);
  assert.ok(stamp !== null, 'the stamp span is missing');
  assert.equal(stamp[1], versionStamp());
  assert.equal(stamp[1], `v${PROVENANCE.version}`);
  // One link and nothing else a pad could stop on; no action hook at all.
  assert.equal((html.match(/<a\b/g) ?? []).length, 1);
  assert.ok(!/tabindex|<button|data-menu/.test(html));
});

test('the About template carries the three links, the stamp and no long text of its own (M40)', () => {
  const html = aboutTemplate();
  assert.ok(html.includes('About and licences'));
  assert.ok(html.includes(versionStamp()));
  for (const [hook, href] of [
    ['author', PROVENANCE.authorUrl],
    ['play', PROVENANCE.homepageUrl],
    ['source', PROVENANCE.repositoryUrl],
    ['devlog', PROVENANCE.devlogUrl],
  ] as const) {
    const link = new RegExp(`<a [^>]*data-about="${hook}" href="([^"]*)"[^>]*target="_blank" rel="noopener">`).exec(html);
    assert.ok(link !== null, `${hook} link`);
    assert.equal(link[1], href);
  }
  assert.ok(html.includes(`>${devlogHandle()} on YouTube</a>`));
  // The texts arrive at open time through textContent; the pre blocks are empty.
  assert.ok(/<pre class="euc-about__pre" data-about="licence"><\/pre>/.test(html));
  assert.ok(/<pre class="euc-about__pre" data-about="notice"><\/pre>/.test(html));
  // The region is the safe first focus, and its hook is never an action.
  assert.ok(/data-about="text" tabindex="0"[^>]*data-focus-first/.test(html));
  assert.equal((html.match(/data-menu="/g) ?? []).length, 1);
  assert.ok(html.includes('data-menu="about-back"'));
});

test('the About text scrolls by six keys and a step that reads rather than skims (M40)', () => {
  assert.deepEqual(Object.keys(ABOUT_SCROLL_KEYS).sort(),
    ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp']);
  assert.equal(aboutScrollStep(0), 24);
  assert.equal(aboutScrollStep(120), 40);
  assert.equal(aboutScrollStep(400), 56);
  for (const height of [60, 90, 150, 300, 900]) {
    assert.ok(aboutScrollStep(height) <= Math.max(24, height / 3) + 0.5);
  }
});

test('the About panel reflows LICENSE paragraphs for narrow screens without losing a word (M40)', async () => {
  const { readFileSync } = await import('node:fs');
  const licence = readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8');
  const shown = reflowParagraphs(licence);
  const words = (text: string): string => text.split(/\s+/).filter(Boolean).join(' ');
  assert.equal(words(shown), words(licence), 'every word, in order');
  assert.equal(shown.split('\n\n').length, licence.trim().split(/\n{2,}/).length, 'paragraphs kept');
  assert.ok(!/[^\n]\n[^\n]/.test(shown), 'no hard break inside a paragraph');
});

test('NOTICE is shown as plain text: no Markdown marks, every word and link kept (M40)', async () => {
  const { readFileSync } = await import('node:fs');
  const notice = readFileSync(new URL('../../NOTICE.md', import.meta.url), 'utf8');
  const shown = plainNotice(notice);
  // Letters and digits only, lower-cased: headings are upper-cased for display and
  // NOTICE bolds parts of words ("Mari**bel**"), so word splits differ while
  // the character stream must not.
  const letters = (text: string): string => (text.toLowerCase().match(/[a-z0-9]/g) ?? []).join('');
  const body = notice.replace(/^\s*#\s[^\n]*\n/, '');
  assert.ok(body.length < notice.length, 'NOTICE.md opens with its own # title');
  assert.equal(letters(shown), letters(body), 'every letter and digit after the title, in order');
  for (const line of shown.split('\n')) {
    assert.ok(!/^[\s|:-]+$/.test(line) || line.trim() === '', `a line of table rules survived: ${line}`);
    assert.ok(!/^\s*#/.test(line), `a heading mark survived: ${line}`);
    assert.ok(!line.includes('**') && !line.includes('|'), `markup survived: ${line}`);
  }
  for (const url of notice.match(/https?:\/\/[^\s)>|]+/g) ?? []) assert.ok(shown.includes(url), `a link went missing: ${url}`);
  assert.equal(plainNotice('| Source | <https://x.example/a> |\n|---|---|\n| | |'), 'Source: https://x.example/a\n');
  assert.equal(plainNotice('*EUC Thrills* is **bold** with [a link](https://x.example/)'), 'EUC Thrills is bold with a link (https://x.example/)\n');
});
