/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MACHINE_IDS } from '../data/machines.ts';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { createBlockoutEUC } from './euc.ts';
import {
  STANDARD_MACHINE_LOOK,
  TROLLINA_MACHINE_LOOK,
  machineLook,
} from './machineLook.ts';
import { measureObject } from './renderCost.ts';

test('every machine id resolves to its own look instead of the silent standard fallback', () => {
  for (const id of MACHINE_IDS) {
    assert.equal(machineLook(id).machine, id, `${id} silently resolved to another machine look`);
  }
});

test("Trollina's machine differs from the standard wheel only in its pink trim palette", () => {
  assert.equal(TROLLINA_MACHINE_LOOK.trim.colour, BLOCKOUT_COLOURS.machineTrollinaAccent);
  assert.equal(TROLLINA_MACHINE_LOOK.trim.emissive, BLOCKOUT_COLOURS.machineTrollinaEmissive);
  assert.notEqual(TROLLINA_MACHINE_LOOK.trim.colour, STANDARD_MACHINE_LOOK.trim.colour);
  assert.notEqual(TROLLINA_MACHINE_LOOK.trim.emissive, STANDARD_MACHINE_LOOK.trim.emissive);

  assert.deepEqual(
    {
      ...TROLLINA_MACHINE_LOOK,
      machine: STANDARD_MACHINE_LOOK.machine,
      trim: {
        ...TROLLINA_MACHINE_LOOK.trim,
        colour: STANDARD_MACHINE_LOOK.trim.colour,
        emissive: STANDARD_MACHINE_LOOK.trim.emissive,
      },
    },
    STANDARD_MACHINE_LOOK,
    'Trollina acquired a shape, light, surface or material-response change beyond the palette swap',
  );
});

test("Trollina's palette swap has the standard wheel's exact render cost", () => {
  const standard = createBlockoutEUC(STANDARD_MACHINE_LOOK);
  const trollina = createBlockoutEUC(TROLLINA_MACHINE_LOOK);
  try {
    const standardCost = measureObject(standard.group);
    const trollinaCost = measureObject(trollina.group);
    assert.deepEqual(
      {
        meshes: trollinaCost.meshes.length,
        calls: trollinaCost.totalDrawCalls,
        triangles: trollinaCost.totalTriangles,
      },
      {
        meshes: standardCost.meshes.length,
        calls: standardCost.totalDrawCalls,
        triangles: standardCost.totalTriangles,
      },
    );
  } finally {
    standard.dispose();
    trollina.dispose();
  }
});
