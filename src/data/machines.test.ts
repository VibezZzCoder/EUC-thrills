/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MACHINE,
  MACHINES,
  MACHINE_CONTRACT,
  MACHINE_IDS,
  machineContract,
  machineForCharacter,
  machineSpec,
  type MachineId,
} from './machines.ts';
import { WHEEL } from './tuning.ts';
import { ALL_CHARACTERS } from './riders.ts';

/**
 * The machine roster, and the contract that keeps a second machine a *look*.
 *
 * The interesting test here is the last one. `MACHINE_CONTRACT` claims to be
 * the complete list of `WHEEL` keys that reach the sealed half and the rig, and
 * a claim like that rots the moment somebody reads a fifth constant in
 * `simulation/`. So it is not trusted: the test scans the tree and fails if a
 * `WHEEL.` key turns up in those files that the contract does not name. That is
 * the same shape as `architecture.test.ts` — a layering rule that lives only in
 * a comment gets violated, and this one fails a test instead.
 */

test('every machine is reachable and the default is one of them', () => {
  assert.ok(MACHINES.length >= 1);
  assert.equal(new Set(MACHINE_IDS).size, MACHINE_IDS.length, 'duplicate machine id');
  assert.ok(MACHINE_IDS.includes(DEFAULT_MACHINE));
  for (const machine of MACHINES) {
    assert.equal(machineSpec(machine.id), machine);
    assert.ok(machine.name.length > 0);
    assert.ok(machine.blurb.length > 0);
  }
});

test('an unknown machine id resolves to the first entry rather than throwing', () => {
  // Same hostile-input reasoning as `characterSpec`: an id out of an older
  // build's saved record has to resolve to *something* or the game boots to no
  // machine at all.
  assert.equal(machineSpec('nonexistent' as MachineId), MACHINES[0]);
});

test('every character maps to a machine that exists', () => {
  for (const character of ALL_CHARACTERS) {
    assert.ok(
      MACHINE_IDS.includes(machineForCharacter(character.id)),
      `${character.id} maps to an unknown machine`,
    );
  }
});

test('the two riders with their own wheels get them, and nobody else does', () => {
  // The q29 default, asserted so that changing it is a deliberate act with a
  // failing test attached rather than a quiet edit. Both real people who lent
  // a machine ride that machine; the two fictional riders share the standard
  // wheel until the wheel designer (§13 q29) gives the player the choice.
  assert.equal(machineForCharacter('red-rider'), 'red-rider');
  assert.equal(machineForCharacter('adonisb2'), 'adonisb2');
  assert.equal(machineForCharacter('cool-rider'), 'standard');
  assert.equal(machineForCharacter('trollina'), 'standard');
  // The chase's threat does not ride somebody else's personal machine.
  assert.equal(machineForCharacter('cop'), 'standard');
});

test('the contract reads live values from WHEEL', () => {
  const contract = machineContract();
  for (const key of MACHINE_CONTRACT) {
    assert.equal(contract[key], WHEEL[key], `${key} drifted from WHEEL`);
    assert.ok(Number.isFinite(contract[key]) && contract[key] > 0, `${key} is not a positive number`);
  }
  assert.equal(Object.keys(contract).length, MACHINE_CONTRACT.length);
});

/**
 * The audit: does anything outside `render/euc.ts` read a `WHEEL` key the
 * contract does not name?
 *
 * `render/euc.ts` is the machine itself and may read every shape constant it
 * likes — that is the whole point of the contract being four keys rather than
 * fifteen. Everybody else in this list either simulates the ride or poses a
 * rider against it, and a fifth shared constant appearing there silently is
 * precisely how a second machine stops being safe.
 */
test('MACHINE_CONTRACT names every WHEEL key the sealed half and the rig read', () => {
  const root = join(import.meta.dirname, '..');
  const consumers = [
    'simulation/EucController.ts',
    'simulation/world.ts',
    'simulation/cpuRider.ts',
    'simulation/paddle.ts',
    'simulation/ragdoll.ts',
    'render/rider.ts',
    'render/ridingRig.ts',
    'render/chaseCamera.ts',
  ];

  const named = new Set<string>(MACHINE_CONTRACT);
  const offenders: string[] = [];

  for (const relative of consumers) {
    let source: string;
    try {
      source = readFileSync(join(root, relative), 'utf8');
    } catch {
      // A file that has been renamed is not a contract violation, but a silent
      // skip would make this audit pass by measuring nothing.
      offenders.push(`${relative}: not found — update this list`);
      continue;
    }
    for (const match of source.matchAll(/\bWHEEL\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
      const key = match[1];
      if (!named.has(key)) offenders.push(`${relative}: WHEEL.${key}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'these reads are outside MACHINE_CONTRACT — either add the key to the contract '
      + '(and accept that no machine may vary it) or stop reading it here',
  );
});
