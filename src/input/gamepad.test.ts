/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { INPUT } from '../data/tuning.ts';
import { ActionState, NEUTRAL_ACTIONS } from './actions.ts';
import {
  GAMEPAD_DEFAULTS,
  GamepadInput,
  STANDARD_BUTTON,
  radialDeadZoneScale,
  type GamepadInputOptions,
  type GamepadReading,
  type MenuAction,
} from './gamepad.ts';

/**
 * The gamepad device layer against fake pads and a fake window.
 *
 * Everything the pad layer does is arithmetic and edge bookkeeping over a
 * plain object, so none of it needs a browser — which is the reason the pad is
 * injected rather than read off `navigator`. What is worth proving here is the
 * handful of behaviours a player would notice and nobody would find by
 * reading: the Gamepad API's inverted Y, a dead zone that rescales instead of
 * cutting, a held button that presses once, and an unplugged pad that does not
 * leave the rider carving.
 */

type Listener = (event: unknown) => void;

class FakeWindow {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeSource {
  pads: (GamepadReading | null)[] = [];

  getGamepads(): readonly (GamepadReading | null)[] {
    return this.pads;
  }
}

interface PadShape {
  index?: number;
  mapping?: string;
  connected?: boolean;
  /** Left stick X, left stick Y. Y is negative when pushed away, as real pads report it. */
  axes?: number[];
  /** Button indices held down. */
  down?: number[];
  /** Analog overrides, for the triggers. */
  values?: Record<number, number>;
}

function pad(shape: PadShape = {}): GamepadReading {
  const down = new Set(shape.down ?? []);
  const buttons: { pressed: boolean; value: number }[] = [];
  for (let i = 0; i < 17; i += 1) {
    const analog = shape.values?.[i];
    const value = analog ?? (down.has(i) ? 1 : 0);
    // Real pads report a trigger as pressed past roughly half travel.
    buttons.push({ pressed: down.has(i) || value >= 0.5, value });
  }
  return {
    index: shape.index ?? 0,
    connected: shape.connected ?? true,
    mapping: shape.mapping ?? 'standard',
    axes: shape.axes ?? [0, 0, 0, 0],
    buttons,
  };
}

interface Rig {
  state: ActionState;
  input: GamepadInput;
  fake: FakeWindow;
  source: FakeSource;
  menu: MenuAction[];
  connections: boolean[];
  /** Present a pad reading to the next poll. */
  present(shape?: PadShape): void;
  /**
   * Adopt a pad and burn the priming frame.
   *
   * Browsers do not expose a pad until it is used, so the reading that reveals
   * one carries the press that woke it; the layer treats that first frame as a
   * level rather than an edge, and every test that is not about *that* has to
   * get past it first.
   */
  connect(shape?: PadShape): void;
}

function rig(options: Partial<GamepadInputOptions> = {}): Rig {
  const state = new ActionState();
  const fake = new FakeWindow();
  const source = new FakeSource();
  const menu: MenuAction[] = [];
  const connections: boolean[] = [];
  const input = new GamepadInput(
    state,
    {
      now: () => 0,
      onMenuAction: (action) => menu.push(action),
      onConnectionChange: (connected) => connections.push(connected),
      ...options,
    },
    fake as unknown as Window,
    source,
  );

  return {
    state,
    input,
    fake,
    source,
    menu,
    connections,
    present: (shape = {}) => {
      source.pads = [pad(shape)];
    },
    connect: (shape = {}) => {
      source.pads = [pad(shape)];
      input.poll(0);
      menu.length = 0;
    },
  };
}

function approx(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

test('the left stick drives the axes, and the Gamepad API reports up as negative', () => {
  const { state, input, present, connect } = rig();
  connect();

  present({ axes: [0, -1] });
  input.poll(1);
  assert.equal(state.sample(1).throttle, 1, 'pushed away from the player is accelerate');

  present({ axes: [0, 1] });
  input.poll(2);
  assert.equal(state.sample(2).throttle, -1, 'pulled back is brake');

  // +1 steer is the rider's right, the player's word for it. Which world axis
  // that is belongs to the controller — see data/tuning.ts.
  present({ axes: [1, 0] });
  input.poll(3);
  assert.equal(state.sample(3).steer, 1);

  present({ axes: [-1, 0] });
  input.poll(4);
  assert.equal(state.sample(4).steer, -1);
});

test('the dead zone is radial and rescaled, so the stick eases in and still reaches 1', () => {
  const zone = GAMEPAD_DEFAULTS.stickDeadZone;
  const { state, input, present, connect } = rig();
  connect();

  present({ axes: [zone - 0.01, 0] });
  input.poll(1);
  assert.equal(state.sample(1).steer, 0, 'inside the zone the stick is silent');

  // Just outside, the reading is small rather than jumping to the zone's edge.
  // A plain cutoff would step from 0 to 0.18 here, which reads as a notchy
  // stick with a lump of steering hiding behind the slack.
  present({ axes: [zone + 0.02, 0] });
  input.poll(2);
  const eased = state.sample(2).steer;
  approx(eased, 0.02 / (1 - zone), 'the remaining travel is rescaled across the full range');
  assert.ok(eased > 0 && eased < 0.05, 'a nudge past the zone is still a nudge');

  // Radial, not per-axis: neither component clears the zone on its own, but
  // the stick is plainly pushed and a square dead zone would ignore it.
  present({ axes: [0.17, 0.17] });
  input.poll(3);
  assert.ok(Math.abs(state.sample(3).steer) > 0, 'a diagonal push out of the zone counts');
});

test('radialDeadZoneScale rescales to full deflection and caps at unit magnitude', () => {
  const zone = GAMEPAD_DEFAULTS.stickDeadZone;

  assert.equal(radialDeadZoneScale(zone, zone), 0, 'the zone edge is still nothing');
  assert.equal(radialDeadZoneScale(0, zone), 0);
  assert.equal(radialDeadZoneScale(Number.NaN, zone), 0, 'a junk reading is neutral');
  assert.equal(radialDeadZoneScale(1, zone) * 1, 1, 'full deflection survives the rescale');

  // Pads with a square gate report 1.41 in the corners. The magnitude is
  // capped rather than the components, so the direction is preserved.
  const corner = Math.hypot(1, 1);
  approx(radialDeadZoneScale(corner, zone) * corner, 1, 'a corner is capped, not bent');
});

test('the triggers combine with the stick by magnitude, never by sum', () => {
  const threshold = GAMEPAD_DEFAULTS.triggerThreshold;
  const stickHalf = 0.5 * (radialDeadZoneScale(0.5, GAMEPAD_DEFAULTS.stickDeadZone));
  const { state, input, present, connect } = rig();
  connect();

  present({ values: { [STANDARD_BUTTON.rightTrigger]: 1 } });
  input.poll(1);
  assert.equal(state.sample(1).throttle, 1, 'a buried right trigger is full throttle');

  present({ values: { [STANDARD_BUTTON.leftTrigger]: 1 } });
  input.poll(2);
  assert.equal(state.sample(2).throttle, -1, 'the left trigger brakes');

  present({ values: { [STANDARD_BUTTON.rightTrigger]: threshold * 0.5 } });
  input.poll(3);
  assert.equal(state.sample(3).throttle, 0, 'a resting trigger is not throttle');

  present({ axes: [0, -0.5] });
  input.poll(4);
  approx(state.sample(4).throttle, stickHalf, 'half a stick is half a stick');

  // The whole point: half a stick plus half a trigger is the stronger of the
  // two, not their sum. A sum would clamp, and every partial input would
  // behave like a full one the moment both were touched.
  present({ axes: [0, -0.5], values: { [STANDARD_BUTTON.rightTrigger]: 0.5 } });
  input.poll(5);
  const combined = state.sample(5).throttle;
  const triggerHalf = (0.5 - threshold) / (1 - threshold);
  approx(combined, triggerHalf, 'the trigger is asking for more');
  assert.ok(combined < stickHalf + triggerHalf, 'nothing was summed');
});

test('the d-pad means what the arrow keys mean', () => {
  const { state, input, present, connect } = rig();
  connect();

  present({ down: [STANDARD_BUTTON.dpadUp] });
  input.poll(1);
  assert.equal(state.sample(1).throttle, 1);

  present({ down: [STANDARD_BUTTON.dpadDown, STANDARD_BUTTON.dpadRight] });
  input.poll(2);
  assert.equal(state.sample(2).throttle, -1);
  assert.equal(state.sample(2).steer, 1);

  present({ down: [STANDARD_BUTTON.dpadLeft, STANDARD_BUTTON.leftShoulder] });
  input.poll(3);
  assert.equal(state.sample(3).steer, -1);
  assert.equal(state.sample(3).crouch, true, 'the left shoulder crouches');

  present();
  input.poll(4);
  assert.deepEqual(state.sample(4), NEUTRAL_ACTIONS, 'letting go releases everything');
});

test('a one-shot fires once, however long the button is held', () => {
  const { state, input, present, connect } = rig();
  connect();

  present({ down: [STANDARD_BUTTON.a] });
  input.poll(1);
  assert.equal(state.consume('hop', 1), true);

  // Still physically down. A polled device has no repeat flag to filter, so
  // the edge has to come from the previous frame's reading.
  input.poll(1.01);
  input.poll(1.02);
  assert.equal(state.consume('hop', 1.02), false, 'one press, one hop');

  present();
  input.poll(1.03);
  present({ down: [STANDARD_BUTTON.a] });
  input.poll(1.04);
  assert.equal(state.consume('hop', 1.04), true, 'a fresh press is a fresh hop');
});

test('every face and start button reaches its action', () => {
  const { state, input, present, connect } = rig();
  connect();

  const bindings: [number, 'hop' | 'swing' | 'reset' | 'cameraCycle' | 'pause'][] = [
    [STANDARD_BUTTON.a, 'hop'],
    [STANDARD_BUTTON.x, 'reset'],
    [STANDARD_BUTTON.y, 'cameraCycle'],
    [STANDARD_BUTTON.start, 'pause'],
    // M14, §13 q18. This row is the renegotiation of a written reservation:
    // until now the right shoulder asserted *nothing*, on the recorded grounds
    // that binding it early would mean unbinding it later. The owner spent it
    // on the paddle. The reservation was never a rule, it was a promise not to
    // spend it carelessly, and the assertion below still holds B to it.
    [STANDARD_BUTTON.rightShoulder, 'swing'],
  ];

  for (const [button, action] of bindings) {
    present({ down: [button] });
    input.poll(1);
    assert.equal(state.consume(action, 1), true, `button ${button} is ${action}`);
    present();
    input.poll(1.01);
  }

  // B is still deliberately unbound while riding: it is "back" everywhere else
  // on this pad, and a rider tapping it to leave must not hop instead.
  present({ down: [STANDARD_BUTTON.b] });
  input.poll(2);
  assert.deepEqual(state.sample(2), NEUTRAL_ACTIONS);
});

test('the frame a pad appears on is a level, not an edge', () => {
  const { state, input, source, menu } = rig();

  // The player pressed A, which is what made the browser expose the pad at
  // all. Honouring it would confirm a menu item they had not looked at yet.
  source.pads = [pad({ down: [STANDARD_BUTTON.a] })];
  input.poll(0);
  assert.equal(input.connected, true);
  assert.equal(state.consume('hop', 0), false);
  assert.deepEqual(menu, []);

  input.poll(0.1);
  assert.equal(state.consume('hop', 0.1), false, 'still the same press');

  source.pads = [pad()];
  input.poll(0.2);
  source.pads = [pad({ down: [STANDARD_BUTTON.a] })];
  input.poll(0.3);
  assert.equal(state.consume('hop', 0.3), true, 'the next real press counts');
});

test('a pad that does not report the standard mapping is ignored, not guessed at', () => {
  const { state, input, source, connections } = rig();

  // A flight yoke, a dance mat, or a pad the browser has no layout for. Its
  // button indices mean nothing, so a "reasonable default" would put brake on
  // a face button and the player would have no way to tell why.
  source.pads = [pad({ mapping: '', axes: [1, -1], down: [STANDARD_BUTTON.a] })];
  input.poll(0);
  input.poll(1);

  assert.equal(input.connected, false);
  assert.deepEqual(connections, [], 'the UI is never told to show button prompts');
  assert.deepEqual(state.sample(1), NEUTRAL_ACTIONS);
});

test('an idle pad is indistinguishable from no pad at all', () => {
  const empty = rig();
  empty.input.poll(0);
  empty.input.poll(1);

  const idle = rig();
  idle.connect();
  idle.input.poll(1);

  assert.deepEqual(idle.state.sample(1), empty.state.sample(1));
  assert.deepEqual(idle.state.sample(1), NEUTRAL_ACTIONS);
  assert.equal(idle.state.isHeld('accelerate'), false);
  assert.equal(idle.state.isHeld('crouch'), false);
});

test('a disconnect clears the pad and leaves the keyboard holding its key', () => {
  const { state, input, fake, source, present, connect, connections } = rig();
  state.setHeld('accelerate', true, 'keyboard');
  connect();

  present({ axes: [1, 0] });
  input.poll(1);
  assert.equal(state.sample(1).steer, 1);
  assert.equal(state.sample(1).throttle, 1, 'the key and the stick coexist');

  source.pads = [];
  fake.dispatch('gamepaddisconnected', { gamepad: { index: 0 } });

  assert.equal(input.connected, false);
  assert.equal(state.sample(2).steer, 0, 'an unplugged pad must not steer forever');
  assert.equal(state.sample(2).throttle, 1, 'the key nobody touched is still held');
  assert.deepEqual(connections, [true, false]);
});

test('a pad that vanishes from the poll releases even without an event', () => {
  const { state, input, source, present, connect, connections } = rig();
  connect();

  present({ axes: [-1, 0] });
  input.poll(1);
  assert.equal(state.sample(1).steer, -1);

  // Some browsers only stop listing the pad; the disconnect event is not
  // guaranteed to arrive, and a rider stuck in a left turn is the cost.
  source.pads = [];
  input.poll(2);

  assert.equal(input.connected, false);
  assert.deepEqual(state.sample(2), NEUTRAL_ACTIONS);
  assert.deepEqual(connections, [true, false]);
});

test('a held menu direction repeats slowly rather than flying through a list', () => {
  const delay = GAMEPAD_DEFAULTS.menuRepeatDelaySeconds;
  const gap = GAMEPAD_DEFAULTS.menuRepeatIntervalSeconds;
  const { input, present, connect, menu } = rig();
  connect();

  present({ down: [STANDARD_BUTTON.dpadUp] });
  input.poll(0);
  assert.deepEqual(menu, ['up'], 'the press itself moves immediately');

  input.poll(delay * 0.5);
  input.poll(delay - 0.01);
  assert.deepEqual(menu, ['up'], 'nothing repeats before the delay');

  input.poll(delay);
  assert.deepEqual(menu, ['up', 'up']);

  input.poll(delay + gap - 0.01);
  assert.deepEqual(menu, ['up', 'up'], 'and nothing repeats faster than the gap');

  input.poll(delay + gap);
  assert.deepEqual(menu, ['up', 'up', 'up']);

  // Letting go and pressing again is a fresh press, not a queued repeat.
  present();
  input.poll(delay + gap + 0.01);
  present({ down: [STANDARD_BUTTON.dpadUp] });
  input.poll(delay + gap + 0.02);
  assert.deepEqual(menu, ['up', 'up', 'up', 'up']);
});

test('the stick navigates menus past a threshold well beyond the dead zone', () => {
  const { input, present, connect, menu } = rig();
  connect();

  present({ axes: [0, -0.4] });
  input.poll(1);
  assert.deepEqual(menu, [], 'a thumb resting on the stick does not navigate');

  present({ axes: [0, -0.9] });
  input.poll(2);
  assert.deepEqual(menu, ['up']);

  // A diagonal resolves to its dominant axis. Moving down *and* left from one
  // flick lands somewhere the player did not aim.
  present();
  input.poll(3);
  present({ axes: [-0.9, 0.7] });
  input.poll(4);
  assert.deepEqual(menu, ['up', 'left']);
});

test('A confirms and B goes back, once per press and with no repeat', () => {
  const { input, present, connect, menu } = rig();
  connect();

  present({ down: [STANDARD_BUTTON.a] });
  input.poll(0);
  input.poll(1);
  input.poll(2);
  assert.deepEqual(menu, ['confirm'], 'a held A must not re-confirm whatever it opened');

  present({ down: [STANDARD_BUTTON.b] });
  input.poll(3);
  assert.deepEqual(menu, ['confirm', 'back']);
});

test('menu mode keeps the pad out of ActionState entirely', () => {
  const { state, input, present, connect, menu } = rig();
  connect();

  present({ axes: [1, 0] });
  input.poll(1);
  assert.equal(state.sample(1).steer, 1);
  // Menu intents fire whatever the mode: this layer does not know what a menu
  // is, and a caller that is riding simply has no listener for them.
  assert.deepEqual(menu, ['right']);
  menu.length = 0;

  // Entering with the stick already pushed: nothing will overwrite that
  // reading until riding resumes, so it is dropped now.
  input.setMenuMode(true);
  assert.equal(state.sample(1).steer, 0);

  present({
    axes: [1, -1],
    down: [STANDARD_BUTTON.a, STANDARD_BUTTON.dpadUp, STANDARD_BUTTON.leftShoulder],
    values: { [STANDARD_BUTTON.rightTrigger]: 1 },
  });
  input.poll(2);
  assert.deepEqual(state.sample(2), NEUTRAL_ACTIONS, 'a menu is not riding');
  assert.deepEqual(menu, ['up', 'confirm'], 'but it still navigates');

  // Leaving a menu with a button still held must not fire it: the press
  // belonged to the menu.
  input.setMenuMode(false);
  input.poll(3);
  assert.equal(state.consume('hop', 3), false);
  assert.equal(state.sample(3).throttle, 1, 'and the stick is read again immediately');
});

test('dispose stops listening and hands back the axes', () => {
  const { state, input, fake, source, present, connect } = rig();
  connect();

  present({ axes: [1, 0] });
  input.poll(1);
  assert.equal(state.sample(1).steer, 1);

  input.dispose();
  assert.deepEqual(state.sample(1), NEUTRAL_ACTIONS, 'a torn-down layer leaves nothing behind');

  source.pads = [pad()];
  fake.dispatch('gamepadconnected', { gamepad: pad() });
  assert.equal(input.connected, false, 'the listener is gone');
});

test('the fallback defaults agree with the shipped tuning values', () => {
  // Two sources for one number is how they drift. The module keeps its own
  // defaults so it is provable with no tuning table (every test above
  // constructs it bare), and `app/Game.ts` passes the shipped values in —
  // this is what stops the pair from quietly disagreeing.
  assert.equal(GAMEPAD_DEFAULTS.stickDeadZone, INPUT.gamepadStickDeadZone);
  assert.equal(GAMEPAD_DEFAULTS.triggerThreshold, INPUT.gamepadTriggerThreshold);
  assert.equal(GAMEPAD_DEFAULTS.menuStickThreshold, INPUT.menuStickThreshold);
  assert.equal(GAMEPAD_DEFAULTS.menuRepeatDelaySeconds, INPUT.menuRepeatDelaySeconds);
  assert.equal(GAMEPAD_DEFAULTS.menuRepeatIntervalSeconds, INPUT.menuRepeatIntervalSeconds);
});
