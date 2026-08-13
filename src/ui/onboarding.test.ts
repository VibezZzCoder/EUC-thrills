/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Onboarding, PROMPT_IDS, type OnboardingInput } from './onboarding.ts';

const IDLE: OnboardingInput = Object.freeze({
  riding: true,
  throttle: 0,
  steer: 0,
  speed: 0,
  hopped: false,
  crashed: false,
  device: 'keyboard' as const,
});

const DT = 1 / 60;

/**
 * Run `seconds` of updates at 60 Hz.
 *
 * `completed` is reported for exactly one update, so it is collected across
 * the whole run rather than read off the last view — a helper that only kept
 * the final frame would miss every completion that did not happen to land on
 * it, which is nearly all of them.
 */
function run(
  onboarding: Onboarding,
  fromSeconds: number,
  seconds: number,
  input: Partial<OnboardingInput>,
): { now: number; view: ReturnType<Onboarding['update']>; completed: string | null } {
  let now = fromSeconds;
  let view = onboarding.update(now, 0, { ...IDLE, ...input });
  let completed: string | null = view.completed;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    now += DT;
    view = onboarding.update(now, DT, { ...IDLE, ...input });
    if (view.completed !== null) completed = view.completed;
  }
  return { now, view, completed };
}

test('nothing is shown before the ride settles', () => {
  const onboarding = new Onboarding();
  assert.equal(onboarding.update(0, 0, IDLE).prompt, null);
  assert.equal(run(onboarding, 0, 0.5, {}).view.prompt, null);
  assert.equal(run(onboarding, 0.5, 0.5, {}).view.prompt, 'ride');
});

test('nothing is shown outside a ride', () => {
  const onboarding = new Onboarding();
  const { view } = run(onboarding, 0, 5, { riding: false });
  assert.equal(view.prompt, null);
});

test('the first prompt is cleared by doing the thing, not by reading it', () => {
  const onboarding = new Onboarding();
  let now = run(onboarding, 0, 1, {}).now;
  assert.equal(onboarding.current, 'ride');

  // Accelerating alone is not enough — the prompt names two things.
  now = run(onboarding, now, 1.5, { throttle: 1 }).now;
  assert.equal(onboarding.current, 'ride');

  const after = run(onboarding, now, 0.6, { throttle: 1, steer: 1 });
  assert.equal(after.completed, 'ride');
  assert.equal(after.view.prompt, null);
});

test('prompts arrive one at a time, in order, with a gap', () => {
  const onboarding = new Onboarding();
  let now = run(onboarding, 0, 1, {}).now;
  now = run(onboarding, now, 2, { throttle: 1, steer: 1 }).now;
  assert.equal(onboarding.current, null, 'a gap follows the one that just cleared');

  now = run(onboarding, now, 2, {}).now;
  assert.equal(onboarding.current, 'brake');

  now = run(onboarding, now, 0.6, { throttle: -1, speed: 6 }).now;
  now = run(onboarding, now, 2, {}).now;
  assert.equal(onboarding.current, 'hop');

  const after = run(onboarding, now, 0.1, { hopped: true });
  assert.equal(after.completed, 'hop');
  assert.equal(onboarding.finished, true);
});

test('braking at a standstill does not count as braking', () => {
  const onboarding = new Onboarding();
  let now = run(onboarding, 0, 1, {}).now;
  now = run(onboarding, now, 2, { throttle: 1, steer: 1 }).now;
  now = run(onboarding, now, 2, {}).now;
  assert.equal(onboarding.current, 'brake');

  now = run(onboarding, now, 2, { throttle: -1, speed: 0 }).now;
  assert.equal(onboarding.current, 'brake', 'a rider standing still is not braking');
});

test('a player who already knows the controls is barely told anything', () => {
  // The correct outcome for a competent player: the first prompt is
  // unavoidable and brief, and the other two are retired without ever being
  // shown, because the skills they name were demonstrated before they were due.
  const onboarding = new Onboarding();
  const shown = new Set<string>();
  let now = 0;
  for (let i = 0; i < 60 * 10; i += 1) {
    now += DT;
    const view = onboarding.update(now, DT, {
      ...IDLE,
      throttle: i % 120 < 90 ? 1 : -1,
      steer: 1,
      speed: 8,
      hopped: i === 60,
    });
    if (view.prompt !== null) shown.add(view.prompt);
  }

  assert.deepEqual([...shown], ['ride']);
  assert.equal(onboarding.finished, true);
});

test('an ignored prompt stops the whole sequence rather than queueing two more', () => {
  const onboarding = new Onboarding();
  const { view } = run(onboarding, 0, 40, {});

  assert.equal(view.prompt, null);
  // The one that timed out is marked seen — a player doing something else does
  // not need it again, and the pause menu carries the controls permanently.
  assert.deepEqual(onboarding.seenPrompts(), ['ride']);
  // The other two are neither shown nor retired: they get one more chance on a
  // later session rather than being produced at somebody who is ignoring them.
  assert.equal(onboarding.finished, false);
});

test('dismissing one dismisses the sequence for the session', () => {
  const onboarding = new Onboarding();
  run(onboarding, 0, 1, {});
  onboarding.dismiss();

  const { view } = run(onboarding, 1, 20, {});
  assert.equal(view.prompt, null, 'waving away a hint must not summon the next one');
});

test('a crash hides the prompt and it comes back afterwards', () => {
  const onboarding = new Onboarding();
  run(onboarding, 0, 1, {});
  assert.equal(onboarding.current, 'ride');

  assert.equal(run(onboarding, 1, 0.5, { crashed: true }).view.prompt, null);
  assert.equal(run(onboarding, 1.5, 0.2, {}).view.prompt, 'ride');
});

test('dismissing counts as seen', () => {
  const onboarding = new Onboarding();
  run(onboarding, 0, 1, {});
  assert.equal(onboarding.dismiss(), 'ride');
  assert.equal(onboarding.current, null);
  assert.ok(onboarding.seenPrompts().includes('ride'));
  assert.equal(onboarding.dismiss(), null, 'dismissing nothing is not an error');
});

test('a returning player who has seen everything is never prompted', () => {
  const onboarding = new Onboarding(PROMPT_IDS);
  assert.equal(onboarding.finished, true);
  assert.equal(run(onboarding, 0, 30, { throttle: 1, steer: 1 }).view.prompt, null);
});

test('a partly-taught player resumes where they left off', () => {
  const onboarding = new Onboarding(['ride']);
  const { view } = run(onboarding, 0, 1.2, {});
  assert.equal(view.prompt, 'brake');
});

test('silent retirement is still worth saving', () => {
  const onboarding = new Onboarding();
  onboarding.takeSeenChanged();
  run(onboarding, 0, 3, { throttle: 1, steer: 1 });

  assert.equal(onboarding.takeSeenChanged(), true);
  assert.equal(onboarding.takeSeenChanged(), false, 'asking clears it');
});

test('the words follow the device in the player hands', () => {
  const onboarding = new Onboarding();
  assert.match(run(onboarding, 0, 1, {}).view.text, /W/);
  assert.match(
    run(onboarding, 1, 0.1, { device: 'gamepad' }).view.text,
    /trigger/i,
    'a pad player must not be told to press W',
  );
});
