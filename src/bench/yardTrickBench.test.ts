/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SHIPPED_TRICK_RULES, trickRulesRevision } from '../simulation/trickRun.ts';
import { validTrickZones } from '../level/trickZones.ts';
import {
  YARD_ATTACKS,
  YARD_CLOCKS,
  YARD_LEGS,
  YARD_PLAN,
  YARD_RECIPES,
  measureYard,
  yardAttempts,
  yardBermWallAir,
  yardQ191,
} from './yardTrickBench.ts';

/**
 * Foundry Yard's Trick Run bench — the numbers `docs/TRICK_BENCH.md`'s Foundry
 * Yard section prints and the q191 decision (D16) is taken on. Headless; one
 * measurement shared by every test (about 2 s).
 */

const AT_90 = YARD_CLOCKS.indexOf(90);
const m = measureYard();
const at90 = (id: string): number => {
  const line = [...m.honest, ...m.attacks].find((candidate) => candidate.id === id);
  assert.ok(line, `no line ${id}`);
  return line.replays[AT_90].scores[0];
};

test('the yard is scored by the shipped referee, unchanged (Switchback\'s bests stay comparable)', () => {
  assert.equal(trickRulesRevision(SHIPPED_TRICK_RULES), 'm38b/10800/10/25/200/100/2/50/1.25/1/0.5/60/0.5/0/60/1');
  for (const line of [...m.honest, ...m.attacks]) {
    assert.equal(line.replays[AT_90].rulesRevision, trickRulesRevision({ ...SHIPPED_TRICK_RULES, durationSteps: 10800 }));
  }
  assert.equal(validTrickZones(YARD_PLAN.trickZones ?? []), true);
  assert.equal(YARD_PLAN.trickZones?.length, 17);
});

test('the honest line: seventeen legs in §51.5.4\'s order, each banking on its own feature', () => {
  for (const key of ['greedy', 'brisk', 'greedyNo180', 'briskNo180'] as const) {
    const legs = m.routes[key].legs;
    assert.deepEqual(legs.map((leg) => leg.attempt.leg.zone), YARD_LEGS.map((leg) => leg.zone), key);
    for (const leg of legs) {
      assert.ok(leg.attempt.ridesOn);
      assert.equal(leg.attempt.ride.crashed, false);
      for (const award of leg.attempt.replay.awards) {
        if (award.kinds.length > 0) assert.equal(award.zone, leg.attempt.leg.zone, `${key} ${leg.attempt.leg.zone}`);
      }
      if (key.endsWith('No180')) assert.equal(leg.attempt.recipe.spinTap, undefined);
    }
  }
  assert.equal(at90('routed-greedy'), 7549);
  // QA R2-TR2's face brake: the brisk routing's wall exits roll down the
  // faces rather than braking on them, and its lap misses one wall flight at
  // 90 s (7,649 before); the greediest routing is unchanged.
  assert.equal(at90('routed-brisk'), 7170);
  assert.equal(at90('routed-greedyNo180'), 4132);
  assert.equal(at90('routed-briskNo180'), 4603);
  assert.equal(m.honestAt90, 7170);
});

test('q191 (D16): the stair-deck ↔ euro-gap shuttle is ridden from the normal start and stays under half the honest run', () => {
  const pair = m.attacks.find((line) => line.id === 'pair-stair-euro');
  assert.ok(pair);
  const replay = pair.replays[AT_90];
  assert.equal(pair.crashed, false);
  assert.ok(pair.recording.steps.every((facts) => !facts.reset && !facts.crashed));
  assert.ok((pair.distance ?? 0) > 100, 'the approach and the shuttling are ridden');
  assert.deepEqual([...new Set(replay.awards.map((award) => award.zone))], ['stair-deck', 'euro-gap']);
  assert.equal(replay.scores[0], 1790);
  const verdict = yardQ191(m);
  assert.equal(verdict.pair, 1790);
  assert.equal(verdict.merge, false, 'D16: M2 is applied only if the pair reaches half the honest run');
  assert.ok(verdict.ratio < 0.5);
  // The stricter reading — the honest line with no 180 at all — keeps the same verdict.
  assert.ok(verdict.pair / at90('routed-greedyNo180') < 0.5);
});

test('every other q191 attack: pairs saturate two clocks, three-zone lines travel, one zone is capped', () => {
  assert.deepEqual(m.attacks.map((line) => [line.id, line.replays[AT_90].scores[0]]), [
    ['pair-stair-euro', 1790],
    ['pair-stair-l2', 1791],
    ['cluster-euro-stair-l2', 2464],
    ['wall-three', 2517],
    ['wall-pair', 1910],
    ['wall-one', 958],
    ['wall-mini', 958],
    ['wall-bowl', 958],
    // QA TR-2: the east wall's deck strip, clipped to the coping — 1,792 and
    // 2,212 before; now only the landings, off-feature.
    ['deck-qp-pair', 20],
    ['deck-qp-three', 20],
    // QA R2-TR2: the same seams on the wall's own face — 1,792 (pair) and
    // 2,212 (three) before the face brake, at any settle rate. The human
    // settle's one banked flight is a climb that stalled facing up (a wall
    // stall, not a stand-still).
    ['face-qp-pair', 20],
    ['face-qp-pair-top', 20],
    ['face-qp-pair-low', 20],
    ['face-qp-pair-human', 466],
    ['face-qp-three', 20],
    // QA R2-Q191-SNAKE: flat floor to flat floor, a stand-still pair at the
    // cap; the cluster was 2,604 before the face brake (the rollers' lip park).
    ['pair-berm-planter', 1790],
    ['cluster-berm-planter-rollers', 1727],
    ['camp-stair', 896],
    ['paced-stair', 896],
  ]);
  assert.equal(m.attacks.length, YARD_ATTACKS.length);
  for (const line of m.attacks) {
    assert.equal(line.crashed, false, line.id);
    assert.ok(line.replays[AT_90].scores[0] < 0.5 * m.honestAt90, line.id);
  }
  // Stand-still attacks stand still: every launch of a shuttle is from rest.
  for (const id of ['pair-stair-euro', 'pair-stair-l2', 'cluster-euro-stair-l2', 'deck-qp-pair', 'deck-qp-three',
    'pair-berm-planter', 'cluster-berm-planter-rollers', 'camp-stair', 'paced-stair']) {
    const line = m.attacks.find((candidate) => candidate.id === id);
    assert.ok(line?.launchSpeeds && line.launchSpeeds.length > 0 && line.launchSpeeds.every((speed) => speed === 0), id);
  }
  // No launch from the wall's face is from rest any more, and none banks a section.
  for (const id of ['face-qp-pair', 'face-qp-pair-top', 'face-qp-pair-low', 'face-qp-three']) {
    const line = m.attacks.find((candidate) => candidate.id === id);
    assert.ok(line, id);
    assert.ok(line.replays[AT_90].awards.every((award) => !award.zone?.startsWith('qp-east-')), id);
  }
  const three = m.attacks.find((line) => line.id === 'wall-three');
  assert.deepEqual([...new Set(three?.replays[AT_90].awards.map((award) => award.zone))],
    ['qp-east-north', 'qp-east-mid', 'qp-east-south']);
});

test('D19 in the referee: a come-back air pays its landing, hop and one-foot, and the 180 only when tapped', () => {
  let wallFlights = 0;
  for (const leg of YARD_LEGS.filter((candidate) => candidate.zone.startsWith('qp-east-'))) {
    for (const value of yardAttempts(leg)) {
      for (const award of value.replay.awards) {
        if (award.zone !== leg.zone) continue;
        wallFlights += 1;
        const spins = award.kinds.filter((kind) => kind === 'spin-landed').length;
        assert.equal(spins, value.recipe.spinTap === undefined ? 0 : spins);
        assert.ok(spins <= 1);
      }
    }
  }
  assert.ok(wallFlights > 150);
  const mid = YARD_LEGS.find((leg) => leg.zone === 'qp-east-mid');
  assert.ok(mid);
  const pick = (id: string, speed: number) => {
    const value = yardAttempts(mid).find((candidate) => candidate.recipe.id === id && candidate.speed === speed
      && candidate.presses === mid.presses[1]);
    assert.ok(value, `${id} ${speed}`);
    assert.equal(value.ride.comeBackAirs, 1, `${id} ${speed}: one come-back air`);
    const wall = value.replay.awards.find((award) => award.zone === 'qp-east-mid');
    assert.ok(wall, `${id} ${speed}: the come-back air is a flight the referee banks`);
    return wall;
  };
  assert.ok(YARD_RECIPES.some((recipe) => recipe.id === 'lightFoot'));
  for (const speed of mid.speeds) {
    assert.deepEqual(pick('roll', speed).kinds, []);
    assert.equal(pick('roll', speed).points, 10);
    assert.deepEqual(pick('lightFoot', speed).kinds, ['one-foot-air']);
    assert.deepEqual(pick('oneFoot', speed).kinds, ['charged-hop', 'one-foot-air']);
    assert.deepEqual(pick('both', speed).kinds, ['charged-hop', 'spin-landed', 'one-foot-air']);
  }
});

test('QA TR-1: a come-back air off the snake berm\'s outer wall is paid on the berm', () => {
  const { ride, replay } = yardBermWallAir();
  assert.equal(ride.crashed, false);
  assert.equal(ride.comeBackAirs, 1);
  const tricked = replay.awards.filter((award) => award.kinds.length > 0);
  assert.equal(tricked.length, 1);
  assert.equal(tricked[0].zone, 'snake-berm');
  assert.deepEqual(tricked[0].kinds, ['charged-hop', 'spin-landed', 'one-foot-air']);
  assert.equal(tricked[0].landing, 'clean');
  assert.equal(tricked[0].points, 479);
});
