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
 * Note on what is *not* parameterised here — M25 Phase 4.
 *
 * `rig` below builds the layer with no routing, which means every test in this
 * file that predates Phase 4 exercises the adopt-one rule M9 shipped: first
 * standard pad drives the state, the rest are read for menus and claims only.
 * That is the preservation the plan asked for (§25.5 Phase 4), and it is worth
 * more as untouched tests than as a new assertion.
 */

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
  /**
   * How many buttons the pad defines. Seventeen is the standard mapping's
   * full complement; eleven is the shape Firefox on Linux has shipped for an
   * Xbox pad, whose d-pad lives on hat axes 6/7 instead.
   */
  buttonCount?: number;
}

function pad(shape: PadShape = {}): GamepadReading {
  const down = new Set(shape.down ?? []);
  const buttons: { pressed: boolean; value: number }[] = [];
  for (let i = 0; i < (shape.buttonCount ?? 17); i += 1) {
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

/**
 * A two-pad rig with an explicit routing — M25 Phase 4.
 *
 * Deliberately a *second* helper rather than a parameter on the first: every
 * test above this line runs through the layer's own default routing, and that
 * is the point of them. The adopt-one rule is not preserved by a paragraph
 * saying so; it is preserved because the tests that prove it never learned
 * that routing exists.
 */
function couch(options: Partial<GamepadInputOptions> = {}): {
  seats: ActionState[];
  input: GamepadInput;
  source: FakeSource;
  menu: MenuAction[];
  claims: number[];
  padChanges: [number, boolean][];
  /** Which pad drives which seat. Empty means the default order rule. */
  claim(padIndex: number, seat: number): void;
  present(...shapes: PadShape[]): void;
} {
  const seats = [new ActionState(), new ActionState()];
  const source = new FakeSource();
  const menu: MenuAction[] = [];
  const claims: number[] = [];
  const padChanges: [number, boolean][] = [];
  const routed = new Map<number, number>();
  const input = new GamepadInput(
    seats[0],
    {
      now: () => 0,
      onMenuAction: (action) => menu.push(action),
      onClaimPress: (index) => claims.push(index),
      onPadChange: (index, present) => padChanges.push([index, present]),
      routing: {
        sinkForPad: (padIndex, order) => {
          if (routed.size === 0) return order === 0 ? seats[0] : null;
          const seat = routed.get(padIndex);
          return seat === undefined ? null : seats[seat];
        },
      },
      ...options,
    },
    new FakeWindow() as unknown as Window,
    source,
  );

  return {
    seats,
    input,
    source,
    menu,
    claims,
    padChanges,
    claim: (padIndex, seat) => routed.set(padIndex, seat),
    present: (...shapes) => {
      source.pads = shapes.map((shape) => pad(shape));
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

test('menu repeats run on the menu clock, so a frozen simulation clock cannot stall them', () => {
  // The pause menu is the one place this bites: `paused` runs no simulation
  // steps, so the sim clock the ride presses are stamped with stands still
  // there. Repeats are paced by the second clock — the player's own time.
  const delay = GAMEPAD_DEFAULTS.menuRepeatDelaySeconds;
  const gap = GAMEPAD_DEFAULTS.menuRepeatIntervalSeconds;
  const { input, present, connect, menu } = rig();
  connect();

  const frozenSim = 42;
  present({ down: [STANDARD_BUTTON.dpadDown] });
  input.poll(frozenSim, 0);
  assert.deepEqual(menu, ['down']);

  input.poll(frozenSim, delay - 0.01);
  assert.deepEqual(menu, ['down'], 'nothing repeats before the delay, in menu time');

  input.poll(frozenSim, delay);
  assert.deepEqual(menu, ['down', 'down'], 'the repeat fires though the sim clock never moved');

  input.poll(frozenSim, delay + gap);
  assert.deepEqual(menu, ['down', 'down', 'down']);
});

test('a standard-claiming pad missing its d-pad buttons is read from the hat axes', () => {
  // The documented Firefox-on-Linux shape: fewer buttons than the standard
  // mapping names, eight axes, the d-pad on axes 6/7 quantised to ±1. The
  // buttons that exist are believed; the four that do not fall through to the
  // hat, where the alternative is a d-pad that silently does nothing.
  const shape = { buttonCount: 11, axes: [0, 0, 0, 0, 0, 0, 0, 0] };
  const { state, input, present, connect, menu } = rig();
  connect(shape);

  present({ ...shape, axes: [0, 0, 0, 0, 0, 0, 0, -1] });
  input.poll(1);
  assert.deepEqual(menu, ['up'], 'hat up navigates');
  assert.equal(state.sample(1).throttle, 1, 'and accelerates, exactly as the button would');

  present({ ...shape, axes: [0, 0, 0, 0, 0, 0, 1, 0] });
  input.poll(2);
  assert.deepEqual(menu, ['up', 'right']);
  assert.equal(state.sample(2).steer, 1);

  present(shape);
  input.poll(3);
  assert.deepEqual(state.sample(3), NEUTRAL_ACTIONS, 'letting go of the hat releases');
});

test('a pad with real d-pad buttons never has the hat axes read against it', () => {
  // A full standard pad with junk on axes 6/7 — an extra paddle, a stuck
  // reading. Its defined d-pad buttons are authoritative, including their
  // unpressed state, so the junk must not steer menus or the ride.
  const { state, input, present, connect, menu } = rig();
  connect();

  present({ axes: [0, 0, 0, 0, 0, 0, 1, -1] });
  input.poll(1);
  assert.deepEqual(menu, []);
  assert.deepEqual(state.sample(1), NEUTRAL_ACTIONS);
});

test('an ignored pad is reported once, and a usable or absent pad clears the report', () => {
  const unusable: boolean[] = [];
  const { input, source } = rig({ onUnusablePad: (present) => unusable.push(present) });

  source.pads = [pad({ mapping: '' })];
  input.poll(0);
  input.poll(1);
  assert.deepEqual(unusable, [true], 'a verdict, not a heartbeat');
  assert.equal(input.unusablePadSeen, true);
  assert.equal(input.connected, false);

  // A usable pad arriving beside the ignored one wins, and the settings line
  // must switch from the warning to "connected" — one state at a time.
  source.pads = [pad({ mapping: '' }), pad({ index: 1 })];
  input.poll(2);
  assert.deepEqual(unusable, [true, false]);
  assert.equal(input.connected, true);

  // Everything unplugged: no usable pad, but no ignored one either.
  source.pads = [pad({ mapping: '' })];
  input.poll(3);
  assert.equal(input.unusablePadSeen, true, 'the usable pad leaving re-exposes the ignored one');
  source.pads = [];
  input.poll(4);
  assert.equal(input.unusablePadSeen, false);
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

// ---------------------------------------------------------------------------
// M25 Phase 4 — two pads, and the claim that tells them apart
// ---------------------------------------------------------------------------

test('two claimed pads carve two seats, and neither one writes the other', () => {
  const { seats, input, claim, present } = couch();
  claim(0, 0);
  claim(1, 1);

  present(
    { index: 0, axes: [1, 0] },
    { index: 1, axes: [-1, 0], down: [STANDARD_BUTTON.dpadUp] },
  );
  input.poll(1);

  // The foundation gate of the whole milestone, at the device layer: the two
  // riders are independent because their intent never shared a slot, not
  // because something downstream sorts it out afterwards.
  approx(seats[0].sample(1).steer, 1, 'pad 0 carves right');
  approx(seats[0].sample(1).throttle, 0, 'and asks for no throttle');
  approx(seats[1].sample(1).steer, -1, 'pad 1 carves left');
  approx(seats[1].sample(1).throttle, 1, 'and is on the throttle');
  assert.equal(seats[0].isHeld('accelerate'), false, "pad 1's d-pad is not seat 0's");
});

test('a pad that drives nobody still navigates the menu it is looking at', () => {
  const { input, menu, claims, claim, present } = couch();
  claim(0, 0);

  // The pause card belongs to whoever paused, and the paused player is not
  // necessarily the one holding the pad the game adopted first (§25.5 Phase 4).
  present({ index: 0 }, { index: 1 });
  input.poll(0);
  menu.length = 0;
  claims.length = 0;

  present({ index: 0 }, { index: 1, down: [STANDARD_BUTTON.dpadDown] });
  input.poll(1);
  assert.deepEqual(menu, ['down'], 'the unclaimed pad drives the card');
  assert.deepEqual(claims, [], 'a direction is not a claim');

  present({ index: 0 }, { index: 1, down: [STANDARD_BUTTON.a] });
  input.poll(2);
  assert.deepEqual(menu, ['down', 'confirm']);
  assert.deepEqual(claims, [1], 'and it can still press its way into a seat');
});

test('each pad gets its own edge, so one held button cannot eat another press', () => {
  const { seats, input, claim, present } = couch();
  claim(0, 0);
  claim(1, 1);

  present({ index: 0, down: [STANDARD_BUTTON.a] }, { index: 1 });
  input.poll(0);
  present({ index: 0, down: [STANDARD_BUTTON.a] }, { index: 1 });
  input.poll(1);
  assert.equal(seats[0].consume('hop', 1), false, 'pad 0 is still holding its first press');

  // Two players holding A must each get their own rising edge. One shared
  // `previousButtons` would have made the second player's hop invisible for as
  // long as the first player leaned on the button.
  present({ index: 0, down: [STANDARD_BUTTON.a] }, { index: 1, down: [STANDARD_BUTTON.a] });
  input.poll(2);
  assert.equal(seats[1].consume('hop', 2), true, 'and pad 1 hops on its own');
});

test('a claim needs a fresh edge after the window opens, and a settled stick', () => {
  const { input, claims, present } = couch();

  // The press that opened the panel is not a press aimed at the panel.
  present({ index: 0, down: [STANDARD_BUTTON.a] });
  input.poll(0);
  assert.deepEqual(claims, [], 'the frame a pad appears on is a level, not an edge');

  input.poll(1);
  assert.deepEqual(claims, [], 'and it is still the same press');

  present({ index: 0 });
  input.poll(2);
  present({ index: 0, down: [STANDARD_BUTTON.start] });
  input.poll(3);
  assert.deepEqual(claims, [0], 'Start claims as well as A — both are confirm on a pad');

  // Re-priming is what a panel opening does, and it makes the held button
  // stale all over again.
  input.primeAll();
  present({ index: 0, down: [STANDARD_BUTTON.start] });
  input.poll(4);
  input.poll(5);
  assert.deepEqual(claims, [0], 'a button held when the panel opened claims nothing');
});

test('a pad resting on a cushion with a pushed stick cannot seat a player', () => {
  const { input, claims, present } = couch();

  // The neutral-stick rule (§25.5 Phase 4). A pad face-down with a stick off
  // centre is a pad nobody is holding, and letting it claim means the join
  // panel fills itself while the second player is still in the kitchen.
  present({ index: 0, axes: [0.9, 0] });
  input.poll(0);
  present({ index: 0, axes: [0.9, 0], down: [STANDARD_BUTTON.a] });
  input.poll(1);
  assert.deepEqual(claims, [], 'a deflected stick is not a body');

  present({ index: 0, axes: [0, 0] });
  input.poll(2);
  present({ index: 0, axes: [0, 0], down: [STANDARD_BUTTON.a] });
  input.poll(3);
  assert.deepEqual(claims, [0], 'let go of it and the press counts');
});

test('a pad leaving is named, and only its own seat is handed back', () => {
  const { seats, input, padChanges, claim, present } = couch();
  claim(0, 0);
  claim(1, 1);

  present({ index: 0, axes: [1, 0] }, { index: 1, axes: [-1, 0] });
  input.poll(0);
  input.poll(1);
  padChanges.length = 0;

  present({ index: 0, axes: [1, 0] });
  input.poll(2);

  // A router cannot retain the right seat unless it is told *which* pad went;
  // `onConnectionChange` is a verdict about whether any pad is present at all,
  // and in a couch session one is.
  assert.deepEqual(padChanges, [[1, false]]);
  assert.equal(input.connected, true, 'the other pad is still in somebody’s hands');
  approx(seats[0].sample(2).steer, 1, 'whose carve is untouched');
  assert.equal(seats[1].sample(2).steer, 0, 'while the dead pad stops steering');
});

test('a re-routed pad hands the seat it left back its axes', () => {
  const { seats, input, claim, present } = couch();
  claim(0, 0);
  claim(1, 1);

  present({ index: 0, axes: [1, 0] }, { index: 1, axes: [0, 0] });
  input.poll(0);
  input.poll(1);
  approx(seats[0].sample(1).steer, 1, 'pad 0 is carving seat 0');

  // The panel's Swap, seen from down here. Without the hand-back, seat 0 would
  // carve for ever on a reading nothing is refreshing any more.
  claim(0, 1);
  claim(1, 0);
  input.poll(2);
  assert.equal(seats[0].sample(2).steer, 0);
  approx(seats[1].sample(2).steer, 1, 'and the carve moved with the pad');
});
