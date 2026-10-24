/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-WHARF (2026-10-23): `populationSupportTargetsInto` (the renderer's
 * caller-owned variant) against the allocating `populationSupportTargets` the
 * simulation keeps, by float bits, over every kind, activity, posture, slope,
 * invalid normal and hull shape the two can be asked about.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  createPopulationSupportTargetsRecord, populationSupportTargets, populationSupportTargetsInto,
  type PopulationSupportInput, type PopulationSupportTargets,
} from './populationSupport.ts';

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
/** Every value as text, numbers by their bits; the key set (not its order) and nulls count. */
function bits(value: unknown): string {
  if (typeof value === 'number') { f64[0] = value; return `${u32[1]!.toString(16)}:${u32[0]!.toString(16)}`; }
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(bits).join(',')}]`;
  return `{${Object.keys(value).filter(key => key !== 'footStore' && key !== 'tyreStore').sort()
    .map(key => `${key}=${bits((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
const view = (targets: PopulationSupportTargets): unknown => ({ ...targets,
  feet: targets.feet && targets.feet.map(target => ({ ...target })),
  tyres: targets.tyres && targets.tyres.map(target => ({ ...target })) });

test('the caller-owned support targets equal the allocating original by float bits', () => {
  let seed = 3;
  const random = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
  const record = createPopulationSupportTargetsRecord();
  const { footStore, tyreStore } = record;
  const seen = new Set<string>();
  for (let index = 0; index < 60_000; index += 1) {
    const kind = pick(['walker', 'jogger', 'worker', 'social', 'fictionalEuc', 'trafficVehicle', 'serviceVehicle', 'parkedVehicle']);
    const vehicle = kind.endsWith('Vehicle');
    const normal = pick([[0, 1, 0], [random() * 0.4 - 0.2, 1, random() * 0.4 - 0.2], [0, 0, 0], [0, -1, 0],
      [Number.NaN, 1, 0], [-0, 1, -0], [3, 4, 0], [random() - 0.5, random(), random() - 0.5]] as const);
    const input: PopulationSupportInput = {
      kind, appearanceIndex: pick([0, 1, 7, 11, -3, 22, 105]),
      x: (random() - 0.5) * 400, y: (random() - 0.5) * 20, z: (random() - 0.5) * 400,
      headingY: pick([0, -0, Math.PI, random() * 20 - 10]),
      speedMetresPerSecond: pick([0, 0.02, -0.04, 1.3, -2.6, 4, random() * 8 - 4]),
      gaitDistanceMetres: pick([0, -0, random() * 300, -random() * 50]),
      activity: pick(['walking', 'jogging', 'waiting', 'social', 'working', 'impacted', 'riding', 'driving', 'turning']),
      groundNormalX: normal[0], groundNormalY: normal[1], groundNormalZ: normal[2],
      hull: vehicle ? { halfWidthMetres: pick([0.9, 1.02, 1.2]), halfLengthMetres: pick([2.2, 2.4, 3.6]), heightMetres: pick([2.1, 2.8, 3.4]) }
        : { halfWidthMetres: pick([0.42, 0.3, 0.65]), halfLengthMetres: pick([0.42, 0.35, 0.65]), heightMetres: pick([1.9, 1.7, 2.06]) },
      ...(random() < 0.5 ? {} : { posture: pick(['standing', 'seated'] as const),
        sittingBlend: pick([undefined, 0, 0.4, 1, 1.6, -0.2]), seatHeightMetres: pick([undefined, 0.45, 0, -1, 1.7, Number.NaN]) }),
    };
    const original = populationSupportTargets(input), written = populationSupportTargetsInto(input, record);
    assert.equal(bits(view(written)), bits(view(original)), JSON.stringify(input));
    assert.equal(written, record, 'the caller\'s record is the answer');
    assert.ok(written.feet === null || written.feet === footStore, 'feet are the record\'s own targets');
    assert.ok(written.tyres === null || written.tyres === tyreStore, 'tyres are the record\'s own targets');
    seen.add(`${kind}/${original.moving}/${original.sittingBlend > 0}/${original.feet?.[0]?.contact ?? 'tyre'}`);
  }
  for (const needed of ['walker/true/false/ground', 'jogger/true/false/ground', 'social/false/true/ground',
    'fictionalEuc/false/false/pedal', 'trafficVehicle/false/false/tyre']) assert.ok(seen.has(needed), `${needed} in ${[...seen]}`);
  // The original keeps returning fresh records for the simulation.
  const input: PopulationSupportInput = { kind: 'walker', appearanceIndex: 0, x: 0, y: 0, z: 0, headingY: 0,
    speedMetresPerSecond: 1, gaitDistanceMetres: 0, activity: 'walking', groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0,
    hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } };
  const first = populationSupportTargets(input), second = populationSupportTargets(input);
  assert.notEqual(first, second); assert.notEqual(first.feet, second.feet); assert.notEqual(first.feet![0], second.feet![0]);
});
