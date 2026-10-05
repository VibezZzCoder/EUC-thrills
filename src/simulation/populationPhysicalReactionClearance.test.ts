/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { recordedClearParkedReaction } from './physicalContactYieldRecordedClear.test-support.ts';
import { certifiedReactionTrajectoryClear } from './populationPhysicalReactionClearance.ts';
import { resolvePopulationCompoundMotionBatch as skinChronology } from './populationCompound.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { PopulationSimulation, sweepPopulationHulls } from './population.ts';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { createPose } from './EucController.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from './world.ts';
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
function recordedBlocker() {
  const human = buildRiderOccupancyEnvelope(createPose(), RIDER_OCCUPANCY).human, z = human.z + human.halfLength + .3 + 2.4;
  const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'recorded', installedWorldId: 'recorded/living-r1', contentDigest: 'recorded', anchors: [],
    paths: [{ id: 'line', role: 'traffic', district: 'commercial', points: [-10, 10].map((offset, index) => ({ x: 0, y: 0, z: z + offset, headingY: 0, distanceMetres: index * 20, surface: 'pavement', sourceSegmentId: 'recorded-native-witness' })), lengthMetres: 20, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'parked', kind: 'parkedVehicle', pathId: 'line', initialDistanceMetres: 10, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } }],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
  return new PopulationSimulation(plan, flat).snapshot().actors[0].footprint;
}
// 2026-10-04 (R2C-6): below `sweepResolutionMetres` an interval is decided by
// its own linear sweep, so this sub-millimetre witness now proves in one query
// instead of narrowing; it is still a whole-interval decision, never samples.
test('the exact coordinator-recorded native clear response is proved below traffic skin by its whole linear interval, not by its samples', () => {
  const { before, after } = recordedClearParkedReaction(), blocker = recordedBlocker(), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, before);
  const component = certificates.components('human', before, after, 0, 'moving').find(value => value.componentId === 'human')!;
  assert.ok(component.intervalEnvelopeMetres(0, 1) > .0009 && component.intervalEnvelopeMetres(0, 1) < .001);
  assert.equal(skinChronology([{ id: 'parked', previous: blocker, current: blocker }], [component]).hits.length, 1,
    'retained normal skin chronology must demonstrate the recorded conservative false rejection');
  let queries = 0, narrowed = false; const traced = { ...component, intervalEnvelopeMetres: (low: number, high: number) => { queries += 1; narrowed ||= high - low < 1; return component.intervalEnvelopeMetres(low, high); } };
  assert.equal(certifiedReactionTrajectoryClear(traced, blocker), true, 'admission must prove EVERY narrowed interval clear using the same compiled graph');
  assert.equal(narrowed, false); assert.ok(queries >= 1 && queries <= 2, 'a sub-resolution enclosure is decided without refinement');
});
test('refined admission still rejects an actual native human translated inward through the parked body', () => {
  const { before } = recordedClearParkedReaction(), after = { ...before, z: before.z + .02 }, blocker = recordedBlocker(), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, before);
  const component = certificates.components('human', before, after, 0, 'moving').find(value => value.componentId === 'human')!;
  assert.equal(certifiedReactionTrajectoryClear(component, blocker), false);
});
test('unresolved interval proof budget conservatively refuses rather than treating positive point samples as clearance', () => {
  const blocker = recordedBlocker(), first = { ...blocker, x: blocker.x + 10, sourceHull: undefined };
  let queries = 0;
  const component = { ownerId: 'human', componentId: 'human', stopGroupId: 'physical', at: () => first,
    intervalEnvelopeMetres: () => { queries += 1; return 100; } };
  assert.equal(certifiedReactionTrajectoryClear(component, blocker), false); assert.ok(queries <= 20);
});

test('late-reaction clearance keeps the actual raw-heading interior contact that endpoint shortest wrapping misses', () => {
  const blocker = { x: 1.4, z: 0, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 1, velocityX: 0, velocityZ: 0 };
  const component = { ownerId: 'human', componentId: 'human', stopGroupId: 'physical', at: (time: number) => ({ ...blocker, x: 0, headingY: 3.12 - 6.24 * time, halfLengthMetres: 2 }), intervalEnvelopeMetres: () => 0 };
  assert.equal(sweepPopulationHulls(component.at(0), component.at(1), blocker, blocker), null, 'known-bad wrapped endpoint sweep must miss the interior long arc');
  assert.equal(certifiedReactionTrajectoryClear(component, blocker), false);
});
