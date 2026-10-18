/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EUC_STEP_REFERENCE_FIELDS, EucController, eucStepPrimitiveFieldsOf, type EucDynamicWorld } from './EucController.ts';
import { EUC_STEP_PRIMITIVE_FIELDS, copyEucStepPrimitives, type EucStepPrimitiveState } from './eucStepPrimitives.ts';
import { HazardField } from './hazards.ts';
import { LaunchPadField } from './launchPadField.ts';
import { SoftBodyField } from './softBodies.ts';
import type { TerrainSampler } from './world.ts';

/**
 * The generated primitive list and its unrolled copier (perf-actions
 * 2026-10-17, item "controller" B). `copyMutableStateFrom` copies exactly the
 * controller's primitive own fields; the copier names them one by one, so this
 * file proves the list is the controller's, the copier copies every name on
 * it, and a stale list refuses instead of dropping a field. When it fails
 * after a controller field change, regenerate, do not edit by hand.
 */
const REGENERATE = 'node tools/gen-step-primitives.mjs';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1;
  out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const world: EucDynamicWorld = { hull: { halfWidthMetres: 0.3, halfLengthMetres: 0.45, heightMetres: 1.8 },
  ragObstacleBodies: () => [], resolveMotion: () => null, canPlace: () => true, canReact: () => true, occupantKind: 'human' };

/** The list a regeneration would write, ready to paste, with the command that writes it. */
function staleAdvice(where: string, discovered: readonly string[]): string {
  const listed = new Set<string>(EUC_STEP_PRIMITIVE_FIELDS), found = new Set(discovered);
  const rows: string[] = [];
  for (let i = 0; i < discovered.length; i += 6) rows.push(`  ${discovered.slice(i, i + 6).map((k) => `'${k}'`).join(', ')},`);
  return [`EUC_STEP_PRIMITIVE_FIELDS is stale for ${where}.`,
    `  unlisted: ${discovered.filter((k) => !listed.has(k)).join(', ') || 'none'}`,
    `  absent:   ${EUC_STEP_PRIMITIVE_FIELDS.filter((k) => !found.has(k)).join(', ') || 'none'}`,
    `Regenerate src/simulation/eucStepPrimitives.ts with: ${REGENERATE}`,
    'Expected list (declaration order):', ...rows].join('\n');
}

function assertListMatches(where: string, controller: EucController): void {
  const discovered = eucStepPrimitiveFieldsOf(controller);
  assert.deepStrictEqual([...EUC_STEP_PRIMITIVE_FIELDS], [...discovered], staleAdvice(where, discovered));
}

function rideCrashRecover(controller: EucController): EucController {
  for (let i = 0; i < 60; i += 1) controller.step(DT, { ...NEUTRAL_ACTIONS, throttle: 1 });
  assert.equal(controller.hardKnock(3, 0), true);
  assert.equal(controller.crashed, true, 'the knock crashed the rider');
  for (let i = 0; i < 900 && controller.crashed; i += 1) controller.step(DT, NEUTRAL_ACTIONS);
  assert.equal(controller.crashed, false, 'the crash recovered');
  return controller;
}

test('the generated list is every primitive own field, in declaration order, of controllers built every way', () => {
  assertListMatches('a default controller', new EucController(flat));
  const furnished = new EucController(flat, {
    spawn: { position: { x: 4, y: 0, z: -2 }, headingY: 0.7 }, tuning: { cutoutEnabled: 0 },
    hazards: new HazardField([]), softBodies: new SoftBodyField([]), launchPads: new LaunchPadField([]), dynamicWorld: world,
  });
  assertListMatches('a controller with spawn, hazards, soft bodies, pads and a dynamic world', furnished);
  assertListMatches('a controller after a ride, a crash and a recovery', rideCrashRecover(furnished));
  const token = furnished.prepareStep(DT, NEUTRAL_ACTIONS);
  const internals = furnished as unknown as { workingController: EucController | null };
  assert.ok(internals.workingController, 'a prepared step owns a working controller');
  assertListMatches('the prepared step\'s working controller', internals.workingController);
  furnished.resolvePreparedStep(token); furnished.commitPreparedStep(token);
  assertListMatches('a controller after a committed transaction', furnished);
  // The list and the reference set partition the own keys; nothing is in both.
  const references = new Set(EUC_STEP_REFERENCE_FIELDS);
  assert.deepStrictEqual(EUC_STEP_PRIMITIVE_FIELDS.filter((k) => references.has(k)), []);
  assert.deepStrictEqual(Object.keys(furnished).filter((k) => !references.has(k)), [...EUC_STEP_PRIMITIVE_FIELDS]);
  assert.equal(new Set(EUC_STEP_PRIMITIVE_FIELDS).size, EUC_STEP_PRIMITIVE_FIELDS.length, 'no field is listed twice');
});

test('the copier is one same-name assignment per listed field, in list order, and nothing else', () => {
  const source = readFileSync(new URL('./eucStepPrimitives.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function copyEucStepPrimitives'));
  const statements = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')).trim().split('\n').map((line) => line.trim());
  const expected = EUC_STEP_PRIMITIVE_FIELDS.map((k) => `to.${k} = from.${k};`);
  assert.deepStrictEqual(statements, expected, `the copier was edited by hand; regenerate with: ${REGENERATE}`);
});

test('sentinel copy: every listed field arrives, through copyMutableStateFrom and the copier alone', () => {
  const from = new EucController(flat), to = new EucController(flat);
  const fromFields = from as unknown as Record<string, unknown>, toFields = to as unknown as Record<string, unknown>;
  EUC_STEP_PRIMITIVE_FIELDS.forEach((key, index) => { fromFields[key] = 1000 + index; });
  EUC_STEP_PRIMITIVE_FIELDS.forEach((key, index) => assert.notEqual(toFields[key], 1000 + index, `${key} is not already the sentinel`));
  to.copyMutableStateFrom(from);
  const missed = EUC_STEP_PRIMITIVE_FIELDS.filter((key, index) => toFields[key] !== 1000 + index);
  assert.deepStrictEqual(missed, [], `the checkpoint copy dropped ${missed.join(', ')}; regenerate with: ${REGENERATE}`);
  // The copier itself, on plain records: each name once, nothing invented.
  const a = Object.fromEntries(EUC_STEP_PRIMITIVE_FIELDS.map((k, i) => [k, -i - 1])) as EucStepPrimitiveState;
  const b = {} as EucStepPrimitiveState;
  copyEucStepPrimitives(b, a);
  assert.deepStrictEqual(Object.entries(b), Object.entries(a));
});

/** A module instance of its own, so its first copy runs the one-time list check. */
async function freshControllerModule(tag: string): Promise<typeof import('./EucController.ts')> {
  return await import(new URL(`./EucController.ts?${tag}`, import.meta.url).href) as typeof import('./EucController.ts');
}

test('a stale list refuses the first copy and names the field and the regeneration command', async () => {
  const unlisted = await freshControllerModule('stale-unlisted');
  const a = new unlisted.EucController(flat), b = new unlisted.EucController(flat);
  (a as unknown as Record<string, unknown>).unlistedClock = 0;
  assert.throws(() => b.copyMutableStateFrom(a),
    (error: Error) => /primitive list is stale: unlisted unlistedClock; absent none/.test(error.message) && error.message.includes(REGENERATE));
  const absent = await freshControllerModule('stale-absent');
  const c = new absent.EucController(flat), d = new absent.EucController(flat);
  delete (c as unknown as Record<string, unknown>).crashSide;
  assert.throws(() => d.copyMutableStateFrom(c), /primitive list is stale: unlisted none; absent crashSide/);
  // An unclassified reference still refuses before the list is consulted.
  const reference = await freshControllerModule('unclassified');
  const e = new reference.EucController(flat), f = new reference.EucController(flat);
  (e as unknown as Record<string, unknown>).latchCallback = () => 0;
  assert.throws(() => f.copyMutableStateFrom(e), /EUC transaction needs an explicit state copy for latchCallback/);
  // Refusal is not sticky: the same module copies once the controller agrees.
  f.copyMutableStateFrom(new reference.EucController(flat));
});
