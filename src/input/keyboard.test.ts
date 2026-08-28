/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ActionState } from './actions.ts';
import { KeyboardInput } from './keyboard.ts';

/**
 * The keyboard device layer against a fake window.
 *
 * The property under test is per-key bookkeeping: W and ArrowUp both mean
 * `accelerate`, the action state stores one Boolean per action, and the QA
 * pass of 2026-08-02 found that releasing either key cancelled the action
 * while the other was still physically down. That reconciliation lives in
 * `KeyboardInput`, the only file that knows keys have names — so it is
 * tested here, with synthetic events, and not through a browser.
 */

// `isEditingTarget` asks `target instanceof HTMLElement`, which needs the
// name to exist. Node has no DOM, so give it a class no fake event will ever
// be an instance of.
(globalThis as { HTMLElement?: unknown }).HTMLElement ??= class {};

type Listener = (event: unknown) => void;

class FakeWindow {
  visibilityState = 'visible';

  private readonly listeners = new Map<string, Set<Listener>>();

  readonly document = {
    visibilityState: 'visible',
    addEventListener: (type: string, listener: Listener): void => {
      this.register(`document:${type}`, listener);
    },
    removeEventListener: (type: string, listener: Listener): void => {
      this.listeners.get(`document:${type}`)?.delete(listener);
    },
  };

  addEventListener(type: string, listener: Listener): void {
    this.register(type, listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  private register(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }
}

function keyEvent(code: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    preventDefault: () => {},
    ...overrides,
  };
}

interface Rig {
  state: ActionState;
  keyboard: KeyboardInput;
  fake: FakeWindow;
  down(code: string, overrides?: Record<string, unknown>): void;
  up(code: string): void;
}

function rig(options: { onClaimPress?: () => void } = {}): Rig {
  const state = new ActionState();
  const fake = new FakeWindow();
  const keyboard = new KeyboardInput(
    state,
    { now: () => 0, ...options },
    fake as unknown as Window,
  );
  return {
    state,
    keyboard,
    fake,
    down: (code, overrides = {}) => fake.dispatch('keydown', keyEvent(code, overrides)),
    up: (code) => fake.dispatch('keyup', keyEvent(code)),
  };
}

test('releasing one key of an alias pair does not release the other', () => {
  const { state, down, up } = rig();

  down('KeyW');
  down('ArrowUp');
  assert.equal(state.isHeld('accelerate'), true);

  up('KeyW');
  assert.equal(state.isHeld('accelerate'), true, 'ArrowUp is still physically down');

  up('ArrowUp');
  assert.equal(state.isHeld('accelerate'), false, 'the last key up releases the action');
});

test('every alias pair reconciles, in either release order', () => {
  const pairs: [string, string, 'accelerate' | 'brake' | 'steerLeft' | 'steerRight' | 'crouch'][] = [
    ['KeyW', 'ArrowUp', 'accelerate'],
    ['KeyS', 'ArrowDown', 'brake'],
    ['KeyA', 'ArrowLeft', 'steerLeft'],
    ['KeyD', 'ArrowRight', 'steerRight'],
    ['ShiftLeft', 'ShiftRight', 'crouch'],
  ];

  for (const [first, second, action] of pairs) {
    const { state, down, up } = rig();
    down(first);
    down(second);
    up(second);
    assert.equal(state.isHeld(action), true, `${first} still holds ${action}`);
    up(first);
    assert.equal(state.isHeld(action), false, `${action} released after both keys`);
  }
});

test('a release with no recorded press still releases', () => {
  const { state, down, up } = rig();

  // The press was swallowed by a modifier — Cmd+W is the browser's — so the
  // key was never recorded. Its keyup must still clear, because a stale
  // "held" is the worse failure (the M0 lesson about full throttle).
  down('KeyW', { metaKey: true });
  assert.equal(state.isHeld('accelerate'), false);
  up('KeyW');
  assert.equal(state.isHeld('accelerate'), false);
});

test('reset clears the per-key bookkeeping along with the semantic state', () => {
  const { state, keyboard, down, up } = rig();

  down('KeyW');
  down('ArrowUp');
  keyboard.reset();
  assert.equal(state.isHeld('accelerate'), false);

  // The bookkeeping must not resurrect the cleared press: after a reset, one
  // fresh press and one release cycle the action cleanly even though the
  // other physical key never sent its keyup.
  down('KeyW');
  assert.equal(state.isHeld('accelerate'), true);
  up('KeyW');
  assert.equal(state.isHeld('accelerate'), false, 'the stale ArrowUp record must not hold it');
});

test('blur clears held aliases so nothing comes back from a tab switch', () => {
  const { state, fake, down } = rig();

  down('KeyW');
  down('ArrowUp');
  fake.dispatch('blur', {});
  assert.equal(state.isHeld('accelerate'), false);
});

// ---------------------------------------------------------------------------
// M25 Phase 4 — the keyboard as one claimable seat
// ---------------------------------------------------------------------------

test('Enter and Space report a claim press, and an auto-repeat does not', () => {
  let claims = 0;
  const { state, down } = rig({ onClaimPress: () => { claims += 1; } });

  down('Enter');
  down('Space');
  assert.equal(claims, 2, 'the confirm family, exactly as every other menu means it');

  // The keyboard gets its *fresh edge* free: a key held when the panel opened
  // delivers only repeats, which is why there is no keyboard `primeAll`.
  down('Space', { repeat: true });
  assert.equal(claims, 2, 'a held key is one press');

  // And the claim is a second reading of the press, never a redirection of it:
  // Space is still hop.
  assert.equal(state.isPending('hop', 0), true);

  down('KeyW');
  assert.equal(claims, 2, 'a throttle is not a claim');
});

test('a claim press is not read from something the player is typing into', () => {
  let claims = 0;
  const { down } = rig({ onClaimPress: () => { claims += 1; } });

  down('Enter', { target: Object.assign(new (globalThis as { HTMLElement: new () => object })
    .HTMLElement(), { tagName: 'INPUT', isContentEditable: false }) });
  assert.equal(claims, 0, 'the seed field takes its own Enter');

  down('Enter', { ctrlKey: true });
  assert.equal(claims, 0, 'and a modified key belongs to the browser');
});

test('a checkbox owns Space and nothing else', () => {
  /*
   * **M26 Phase 2, and the rule is per key rather than per element.** The join
   * panel's contact toggle is an `<input>`, so the tag-only test above gave it
   * every key the moment a room clicked it — and the second player's Enter, the
   * one press that screen exists to receive, was read as typing and dropped.
   *
   * The other direction is the half that a fix can silently break: exempting
   * the checkbox outright sends Space to the binding tables, where it is `hop`
   * and where `ALWAYS_SUPPRESSED` calls `preventDefault` on it — leaving the box
   * unpressable by keyboard at all. Both are asserted, because a spec that only
   * checked Enter would have shipped that.
   */
  let claims = 0;
  let prevented = 0;
  const { state, down } = rig({ onClaimPress: () => { claims += 1; } });
  const box = () => Object.assign(
    new (globalThis as { HTMLElement: new () => object }).HTMLElement(),
    { tagName: 'INPUT', type: 'checkbox', isContentEditable: false },
  );

  down('Enter', { target: box(), preventDefault: () => { prevented += 1; } });
  assert.equal(claims, 1, 'Enter on a checkbox is the guest sitting down');

  down('Space', { target: box(), preventDefault: () => { prevented += 1; } });
  assert.equal(claims, 1, 'Space belongs to the box, not to the claim');
  assert.equal(state.isPending('hop', 0), false, 'and it never reached the bindings');
  assert.equal(prevented, 0, 'so nothing suppressed the browser’s own toggle');

  // A text input is unchanged: every key is the player typing.
  const field = Object.assign(
    new (globalThis as { HTMLElement: new () => object }).HTMLElement(),
    { tagName: 'INPUT', isContentEditable: false },
  );
  down('Enter', { target: field });
  assert.equal(claims, 1, 'the seed field still takes its own Enter');
});

test('a dropdown owns every key except Enter', () => {
  /*
   * **M26 Phase 5's QA repair, and the checkbox spec above from the other
   * side.** The join panel gained a `<select>` for what the couch is playing,
   * and choosing Knockabout with the keyboard left focus on it — after which
   * `Enter`, the press the panel exists to receive, was dropped and neither
   * seat could be claimed. `SELECT` had been in the blanket clause on purpose,
   * so this is a rule being narrowed rather than an omission being filled.
   *
   * Both halves again, because a fix that only freed `Enter` could as easily
   * have freed everything: the arrows walk a dropdown's options and `Space`
   * opens it, and both of those are also this game's — steering and `hop` —
   * so a `<select>` that let them through would be unusable by keyboard.
   */
  let claims = 0;
  let prevented = 0;
  const { state, down } = rig({ onClaimPress: () => { claims += 1; } });
  const menu = () => Object.assign(
    new (globalThis as { HTMLElement: new () => object }).HTMLElement(),
    { tagName: 'SELECT', isContentEditable: false },
  );

  down('Enter', { target: menu(), preventDefault: () => { prevented += 1; } });
  assert.equal(claims, 1, 'Enter on the mode control is still the guest sitting down');

  down('ArrowDown', { target: menu(), preventDefault: () => { prevented += 1; } });
  assert.equal(state.isHeld('brake'), false, 'an arrow walks the options');
  down('Space', { target: menu(), preventDefault: () => { prevented += 1; } });
  assert.equal(state.isPending('hop', 0), false, 'and Space opens it rather than hopping');
  assert.equal(claims, 1, 'neither of those is a claim');
  assert.equal(prevented, 0, 'and nothing suppressed the browser’s own handling');
});

test('moving the keyboard to another seat leaves nothing held on the one it left', () => {
  const { state, keyboard, down } = rig();
  const other = new ActionState();

  down('KeyW');
  down('Space');
  assert.equal(state.isHeld('accelerate'), true);

  keyboard.setSink(other);
  assert.equal(state.isHeld('accelerate'), false, 'a throttle does not outlive the rider');
  assert.equal(state.isPending('hop', 0), false, 'nor does a buffered hop');
  assert.equal(other.isHeld('accelerate'), false, 'and it is not inherited either');

  // The per-key bookkeeping went with it, so the new seat starts from nothing
  // rather than from a set that still remembers KeyW.
  down('KeyW');
  assert.equal(other.isHeld('accelerate'), true);
});

test('moving the keyboard is not a focus loss, so scripted values survive', () => {
  const { state, keyboard } = rig();
  const other = new ActionState();
  state.setScripted({ throttle: 1 }, 0);

  keyboard.setSink(other);
  assert.equal(state.sample(0).throttle, 1, 'a spec that scripted this seat still means it');

  keyboard.setSink(state);
  assert.equal(state.sample(0).throttle, 1);
});

/**
 * A spectator's keyboard — M25 Phase 5 QA.
 *
 * `sinkForPad` has always refused an unclaimed pad in a couch session, on the
 * stated grounds that the alternative is a spectator's controller steering a
 * player. The keyboard was never given the same rule, so on the owner's couch
 * — two controllers, both seats claimed — brushing the keys drove Player 1.
 *
 * What must survive is the reason the rule was hard to apply: pause and mute
 * travel through the same `ActionState` as the throttle, and a couch whose
 * Escape key does nothing is a worse bug than the one being fixed.
 */
test('a spectating keyboard steers nobody and still stops the game', () => {
  const { state, keyboard, down, up } = rig();

  down('KeyW');
  assert.equal(state.isHeld('accelerate'), true, 'it rides while it holds a seat');

  keyboard.setSpectating(true);
  assert.equal(
    state.isHeld('accelerate'),
    false,
    'a throttle held when the second player sat down does not stay latched',
  );

  down('KeyW');
  assert.equal(state.isHeld('accelerate'), false, 'and no new throttle arrives');
  down('Space');
  assert.equal(state.isPending('hop', 0), false, 'a spectator does not hop the rider');
  down('KeyR');
  assert.equal(state.isPending('reset', 0), false, 'nor reset them');

  // The two that are the machine's, not the seat's.
  down('Escape');
  assert.equal(state.isPending('pause', 0), true, 'Escape still pauses');
  down('KeyM');
  assert.equal(state.isPending('muteAudio', 0), true, 'and M still mutes');

  // And it all comes back when the couch breaks up.
  up('KeyW');
  keyboard.setSpectating(false);
  down('KeyW');
  assert.equal(state.isHeld('accelerate'), true, 'the player gets their keyboard back');
});
