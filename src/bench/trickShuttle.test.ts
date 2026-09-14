/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { recordTrickShuttle } from './trickShuttle.ts';
import { replayTrickRun, recordRide, TRICK_BENCH_WHEEL } from './trickRunBench.ts';
import { installedFeature, installedFixture } from './installedPark.ts';
import { apexStepsBeforeLip } from './jumpBench.ts';

test('q191 has continuous real travel from the normal start, not a synthetic zone rotation', () => {
  const ride = recordTrickShuttle();
  const replay = replayTrickRun([ride.recording]);
  assert.equal(ride.recording.steps.length, 10800);
  assert.ok(ride.recording.steps.every((facts) => !facts.reset && !facts.crashed));
  assert.ok(ride.distance > 190, 'the approach and shuttling must actually be ridden');
  assert.equal(replay.awardSteps[0] / 120, 29.2);
  assert.deepEqual([...new Set(replay.awards.map((award) => award.zone))], ['stepUp', 'skinny']);
  assert.ok(ride.launchSpeeds.every((speed) => speed === 0));
  // This pin exposes the known balance weakness; it is not balance acceptance.
  assert.equal(replay.scores[0], 1782);
});

test('a legitimate two-mph skinny mount scores; its no-hop control cannot mount', () => {
  const feature = installedFeature('skinny');
  const fixture = installedFixture(feature);
  const ride = (hop: boolean) => recordRide('slow-mount', 'slow technical riding',
    fixture, TRICK_BENCH_WHEEL, {
      targetMph: 2, startMph: 2, lipS: feature.lipS,
      hopStepsFromLip: hop ? apexStepsBeforeLip('full') : null,
      charge: 'full', holdHop: true, maxSteps: 4000, rideThroughCrash: true,
    });
  const mounted = ride(true);
  const control = ride(false);
  assert.equal(mounted.reachedEnd, true);
  assert.equal(mounted.crashed, false);
  assert.equal(replayTrickRun([mounted.recording]).scores[0], 234);
  assert.equal(control.reachedEnd, false);
  assert.equal(control.takeoffs, 0);
  assert.equal(replayTrickRun([control.recording]).scores[0], 0);
});
