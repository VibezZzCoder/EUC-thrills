/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUDIO, CHASE } from '../data/tuning.ts';
import type { AppStateId } from './appState.ts';
import { quietNow, type BarkQuietInput } from './barkQuiet.ts';
import type { ChaseRoomPhase } from '../simulation/chase.ts';

const LINE = CHASE.trackerQuietGapMetres;

function running(patch: Partial<BarkQuietInput> = {}): BarkQuietInput {
  return {
    state: 'chase',
    roomPhase: 'running',
    pursuersHeld: false,
    outlaw: 0,
    nearestCopMetres: 200,
    sirenRangeMetres: 200,
    quietLineMetres: LINE,
    ...patch,
  };
}

test('the quiet line is the shipped tracker quiet gap, which is the siren edge', () => {
  assert.equal(LINE, 60);
  assert.ok(LINE <= AUDIO.sirenFarMetres);
});

test('59, 60 and 61 m: the nearest cop and the siren range each quiet the seat at or inside the line', () => {
  assert.equal(quietNow(running({ nearestCopMetres: LINE - 1 })), true, '59 m cop');
  assert.equal(quietNow(running({ nearestCopMetres: LINE })), true, '60 m cop');
  assert.equal(quietNow(running({ nearestCopMetres: LINE + 1 })), false, '61 m cop');
  assert.equal(quietNow(running({ sirenRangeMetres: LINE - 1 })), true, '59 m siren');
  assert.equal(quietNow(running({ sirenRangeMetres: LINE })), true, '60 m siren');
  assert.equal(quietNow(running({ sirenRangeMetres: LINE + 1 })), false, '61 m siren');
  // Either one is enough: a far cop of mine with another cop's siren near.
  assert.equal(quietNow(running({ nearestCopMetres: 300, sirenRangeMetres: 40 })), true);
  assert.equal(quietNow(running({ nearestCopMetres: 40, sirenRangeMetres: Infinity })), true);
  assert.equal(quietNow(running({ nearestCopMetres: Infinity, sirenRangeMetres: Infinity })), false);
});

test('every room phase but running is quiet, whatever the distances', () => {
  const phases: ChaseRoomPhase[] = ['idle', 'countdown', 'running', 'ended'];
  for (const roomPhase of phases) {
    const quiet = quietNow(running({ roomPhase, nearestCopMetres: Infinity, sirenRangeMetres: Infinity }));
    assert.equal(quiet, roomPhase !== 'running', roomPhase);
  }
});

test('the start hold is quiet although the room is running', () => {
  assert.equal(quietNow(running({ pursuersHeld: true, nearestCopMetres: 500, sirenRangeMetres: Infinity })), true);
  assert.equal(quietNow(running({ pursuersHeld: false, nearestCopMetres: 500, sirenRangeMetres: Infinity })), false);
});

test("the cop's own seat, and a chair outside the room, are always quiet", () => {
  assert.equal(quietNow(running({ outlaw: -1, nearestCopMetres: Infinity, sirenRangeMetres: Infinity })), true);
  assert.equal(quietNow(running({ outlaw: 2, nearestCopMetres: Infinity, sirenRangeMetres: Infinity })), false);
});

test('outside a chase nothing is quiet, whatever the chase room still says', () => {
  const states: AppStateId[] = ['freeRide', 'challenge', 'knockabout', 'trackDay', 'trickRun', 'title', 'paused'];
  for (const state of states) {
    assert.equal(quietNow(running({ state, roomPhase: 'countdown', nearestCopMetres: 1, sirenRangeMetres: 1, outlaw: -1 })), false, state);
  }
});
