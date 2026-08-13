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

function rig(): Rig {
  const state = new ActionState();
  const fake = new FakeWindow();
  const keyboard = new KeyboardInput(state, { now: () => 0 }, fake as unknown as Window);
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
