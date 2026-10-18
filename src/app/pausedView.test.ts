/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RENDER, TUNING } from '../data/tuning.ts';
import { PausedViewGate, type PausedViewFrame, type PausedViewReason } from './pausedView.ts';

/**
 * The held paused view's gate — performance pass 2026-10-17 (idle-audio A).
 *
 * The gate is the whole decision `Game.render` defers to: draw, or leave the
 * last presented picture on the canvas. Exactness rests on two properties
 * proven here — a frame that is not holdable always draws, and every event
 * (a non-holdable frame, `invalidate()`, any surface change) is followed by
 * exactly `settleFrames` drawn holdable frames — plus the negative controls
 * that show each check fails on a gate that ignores the trigger it names.
 * `pausedViewWiring.test.ts` proves `Game` raises those triggers.
 */

const SURFACE_FIELDS = ['bufferWidth', 'bufferHeight', 'pixelRatio', 'views', 'seats'] as const;
type SurfaceField = typeof SURFACE_FIELDS[number];

function pausedFrame(): PausedViewFrame {
  return { holdable: true, bufferWidth: 1280, bufferHeight: 720, pixelRatio: 1, views: 1, seats: 1 };
}

/** Minimal shape of a gate, so a deliberately broken one can stand in for the real class. */
interface Gate {
  invalidate(reason: PausedViewReason): void;
  admit(frame: PausedViewFrame): boolean;
}

/** `count` decisions for the same frame: 1 drew, 0 held. */
function run(gate: Gate, frame: PausedViewFrame, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(gate.admit(frame) ? 1 : 0);
  return out;
}

/** A gate settled into a hold on `frame` (its settle window spent). */
function settled(settleFrames: number, frame: PausedViewFrame): PausedViewGate {
  const gate = new PausedViewGate(settleFrames);
  run(gate, frame, settleFrames + 2);
  assert.equal(gate.admit(frame), false, 'precondition: the gate holds a settled pause');
  return gate;
}

/** What the gate must do right after a trigger: `settle` draws, then holds. */
function expectedAfterTrigger(settle: number, tail = 4): number[] {
  return [...Array<number>(settle).fill(1), ...Array<number>(tail).fill(0)];
}

/** A gate blind to one surface field: what a gate that forgot that field would decide. */
function blindTo(gate: Gate, field: SurfaceField, frozenValue: number): Gate {
  const view: PausedViewFrame = pausedFrame();
  return {
    invalidate: (reason) => gate.invalidate(reason),
    admit: (frame) => {
      Object.assign(view, frame);
      view[field] = frozenValue;
      return gate.admit(view);
    },
  };
}

/** A gate whose `invalidate` is a no-op: what a missed choke point looks like to the gate. */
function deaf(gate: Gate): Gate {
  return { invalidate: () => undefined, admit: (frame) => gate.admit(frame) };
}

test('the settle count is a tuning constant: an integer of at least one, in the TUNING aggregate', () => {
  assert.ok(Number.isInteger(RENDER.pausedViewSettleFrames), 'whole frames');
  assert.ok(RENDER.pausedViewSettleFrames >= 1, 'zero would hold the transition frame itself');
  assert.equal(TUNING.RENDER.pausedViewSettleFrames, RENDER.pausedViewSettleFrames);
  // The design's value, and the one the harness's oracle was run at.
  assert.equal(RENDER.pausedViewSettleFrames, 3);
});

test('the constructor refuses a settle count that could hold the transition frame', () => {
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => new PausedViewGate(bad), /at least one settle frame/, `settleFrames ${bad}`);
  }
  assert.doesNotThrow(() => new PausedViewGate(1));
});

test('a frame that is not holdable always draws, however long it lasts', () => {
  const gate = new PausedViewGate(3);
  const frame = pausedFrame();
  frame.holdable = false;
  assert.deepEqual(run(gate, frame, 50), Array<number>(50).fill(1));
  assert.equal(gate.stats().held, 0);
});

test('entering a hold draws exactly the settle frames, then holds', () => {
  for (const settle of [1, 2, 3, 5]) {
    const gate = new PausedViewGate(settle);
    const frame = pausedFrame();
    frame.holdable = false;
    run(gate, frame, 10); // riding
    frame.holdable = true; // the pause
    assert.deepEqual(run(gate, frame, settle + 6), expectedAfterTrigger(settle, 6), `settle ${settle}`);
  }
});

test('the very first frames a gate sees draw the settle window, even when holdable from the start', () => {
  const gate = new PausedViewGate(3);
  assert.deepEqual(run(gate, pausedFrame(), 6), expectedAfterTrigger(3, 3));
});

test('every surface field re-draws the settle window when it changes mid-hold — and a gate blind to it would not', () => {
  for (const field of SURFACE_FIELDS) {
    const frame = pausedFrame();
    const gate = settled(3, frame);
    const before = frame[field];
    frame[field] = before + (field === 'pixelRatio' ? 0.25 : 1);
    assert.deepEqual(run(gate, frame, 7), expectedAfterTrigger(3), `${field} change`);
    // And changing it back is a change too.
    frame[field] = before;
    assert.deepEqual(run(gate, frame, 7), expectedAfterTrigger(3), `${field} restored`);

    // Negative control: the same check, through a gate that ignores this field,
    // holds the stale picture straight away — so the check above is not vacuous.
    const blindFrame = pausedFrame();
    const blind = blindTo(settled(3, blindFrame), field, blindFrame[field]);
    blindFrame[field] = before + (field === 'pixelRatio' ? 0.25 : 1);
    assert.notDeepEqual(run(blind, blindFrame, 7), expectedAfterTrigger(3), `blind to ${field} went undetected`);
  }
});

test('invalidate() re-draws the settle window for every reason — and a deaf gate would not', () => {
  const reasons: PausedViewReason[] = [
    'surface', 'state', 'options', 'tuning', 'pose', 'world', 'tier', 'population',
    'reduced-motion', 'visible', 'context', 'layout', 'advance', 'step', 'bridge',
  ];
  for (const reason of reasons) {
    const frame = pausedFrame();
    const gate = settled(3, frame);
    gate.invalidate(reason);
    assert.equal(gate.stats().lastReason, reason);
    assert.deepEqual(run(gate, frame, 7), expectedAfterTrigger(3), reason);

    const deafGate = deaf(settled(3, frame));
    deafGate.invalidate(reason);
    assert.notDeepEqual(run(deafGate, frame, 7), expectedAfterTrigger(3), `a deaf gate passed for ${reason}`);
  }
});

test('an invalidation inside the settle window restarts it rather than adding to it', () => {
  const frame = pausedFrame();
  const gate = settled(3, frame);
  gate.invalidate('tuning');
  assert.deepEqual(run(gate, frame, 2), [1, 1]);
  gate.invalidate('pose');
  assert.deepEqual(run(gate, frame, 6), expectedAfterTrigger(3, 3));
});

test('a non-holdable frame mid-hold (a synthetic advance, Settings, a resume) resets the window', () => {
  const frame = pausedFrame();
  const gate = settled(3, frame);
  frame.holdable = false;
  assert.equal(gate.admit(frame), true, 'the non-holdable frame itself draws');
  frame.holdable = true;
  assert.deepEqual(run(gate, frame, 7), expectedAfterTrigger(3));
  // A longer stretch (Settings simulates behind its card) is the same.
  frame.holdable = false;
  assert.deepEqual(run(gate, frame, 30), Array<number>(30).fill(1));
  frame.holdable = true;
  assert.deepEqual(run(gate, frame, 7), expectedAfterTrigger(3));
});

test('negative control: a one-frame gate holds the second paused frame, the shipped gate does not', () => {
  const frame = pausedFrame();
  const riding = { ...frame, holdable: false };
  const one = new PausedViewGate(1);
  const shipped = new PausedViewGate(RENDER.pausedViewSettleFrames);
  one.admit(riding);
  shipped.admit(riding);
  assert.deepEqual(run(one, frame, 2), [1, 0], 'one settle frame holds from frame 2');
  assert.deepEqual(run(shipped, frame, 2), [1, 1], 'the shipped settle window still draws frame 2');
});

test('stats() counts drawn, held, the current held run and the last reason, in a fresh record', () => {
  const gate = new PausedViewGate(3);
  assert.deepEqual(gate.stats(), { drawn: 0, held: 0, heldRun: 0, holding: false, lastReason: 'start' });
  const frame = pausedFrame();
  run(gate, frame, 10); // the first admit changes the surface key: 3 drawn, 7 held
  const first = gate.stats();
  assert.deepEqual(first, { drawn: 3, held: 7, heldRun: 7, holding: true, lastReason: 'surface' });
  gate.invalidate('visible');
  run(gate, frame, 1);
  assert.deepEqual(gate.stats(), { drawn: 4, held: 7, heldRun: 0, holding: false, lastReason: 'visible' });
  assert.notEqual(gate.stats(), gate.stats(), 'a fresh record per call, never a live view');
  assert.equal(first.held, 7, 'an earlier record does not move');
});

test('the gate matches an independently written oracle over a long random session', () => {
  // A restatement from the design's words (draw when not holdable, when the
  // surface key changed, or while settle frames are owed), driven by a
  // deterministic PRNG through every trigger kind.
  const oracle = (settle: number) => {
    let owed = settle;
    let key = '';
    return {
      invalidate: () => { owed = settle; },
      admit: (f: PausedViewFrame) => {
        const next = `${f.bufferWidth}|${f.bufferHeight}|${f.pixelRatio}|${f.views}|${f.seats}`;
        if (next !== key) { key = next; owed = settle; }
        if (!f.holdable) { owed = settle; return true; }
        if (owed > 0) { owed -= 1; return true; }
        return false;
      },
    };
  };
  let seed = 0x5eed;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (const settle of [1, 3, 4]) {
    const gate = new PausedViewGate(settle);
    const reference = oracle(settle);
    const frame = pausedFrame();
    let mismatches = 0;
    let held = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const roll = random();
      if (roll < 0.01) frame.holdable = !frame.holdable;
      else if (roll < 0.012) frame.bufferWidth += random() < 0.5 ? 1 : -1;
      else if (roll < 0.014) frame.bufferHeight += random() < 0.5 ? 1 : -1;
      else if (roll < 0.016) frame.pixelRatio = random() < 0.5 ? 1 : 1.5;
      else if (roll < 0.018) frame.views = 1 + Math.floor(random() * 4);
      else if (roll < 0.020) frame.seats = 1 + Math.floor(random() * 4);
      else if (roll < 0.025) { gate.invalidate('bridge'); reference.invalidate(); }
      const a = gate.admit(frame);
      const b = reference.admit(frame);
      if (a !== b) mismatches += 1;
      if (!a) held += 1;
    }
    assert.equal(mismatches, 0, `settle ${settle}`);
    assert.ok(held > 1000, `the session must actually hold (held ${held})`);
  }
});

test('a steady hold keeps holding and never writes the frame record Game fills in place', () => {
  // Heap cost per call is the harness's measurement (`paused-parity.mjs`,
  // about 0 bytes and a few ns per admit); this pins the behaviour.
  const gate = new PausedViewGate(3);
  const frame = pausedFrame();
  run(gate, frame, 10);
  const snapshot = JSON.stringify(frame);
  for (let i = 0; i < 1000; i += 1) assert.equal(gate.admit(frame), false);
  assert.equal(JSON.stringify(frame), snapshot, 'the gate never writes the frame Game fills');
});
