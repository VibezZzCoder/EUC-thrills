/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { PART_COSTS, type PropPartId } from '../../data/renderCost.ts';
import { ULTRA } from '../../data/tuning.ts';
import { ENHANCED_PART_COSTS } from '../enhancedCatalog.ts';
import {
  ULTRA_BUILDING_BUILDERS,
  ULTRA_FORM_BUILDERS,
  channelMeans,
  isReliefPart,
  relievedPositions,
  shellReport,
  ultraCasts,
} from './ultraKit.ts';
import { ULTRA_FULL, ULTRA_LIT, applyKitOverride } from './ultraRecipe.ts';
import type { PartId } from '../props.ts';

/**
 * The Ultra form tables and the rules `render/props.ts` applies from them
 * (`docs/M39_ULTRA.md` §4, §6.2). What is rebuilt, what casts, what carries
 * relief — and the triangle table §4 prices, asserted part by part so a form
 * that grows past it fails here before the Ultra catalogue is regenerated.
 */

const ALL_PARTS = Object.keys(PART_COSTS) as PropPartId[];

/** §4's "enhanced → Ultra" column: the ceiling each Ultra part must stay under. */
const SECTION_4_CEILINGS: Readonly<Partial<Record<PartId, number>>> = {
  crown: 400,
  coniferFoliage: 216,
  shrub: 80,
  trunk: 56,
  lampPost: 100,
  lampHead: 44,
  fenceBay: 56,
  tyreStack: 576,
  benchWood: 72,
  benchMetal: 48,
  litterBin: 96,
  signPost: 32,
  signPlate: 40,
  buildingLow: 60,
  buildingBody: 92,
  buildingTall: 204,
  buildingCap: 44,
  roofGable: 32,
};

const BUILDING_PARTS: readonly PartId[] = ['buildingBody', 'buildingLow', 'buildingTall', 'buildingCap', 'roofGable'];

test('the form table rebuilds the foliage and furniture, and nothing §4 leaves unchanged', () => {
  assert.deepEqual(Object.keys(ULTRA_FORM_BUILDERS).sort(), [
    'benchMetal', 'benchWood', 'coniferFoliage', 'crown', 'fenceBay', 'lampHead', 'lampPost',
    'litterBin', 'shrub', 'signPlate', 'signPost', 'trunk', 'tyreStack',
  ]);
  assert.deepEqual(Object.keys(ULTRA_BUILDING_BUILDERS).sort(), [...BUILDING_PARTS].sort());
  // §4: "Bollard cap, gantry span — unchanged".
  for (const part of ['bollardCap', 'gantrySpan'] as PartId[]) {
    assert.equal(ULTRA_FORM_BUILDERS[part], undefined, `${part} is rebuilt`);
    assert.equal(ULTRA_BUILDING_BUILDERS[part], undefined, `${part} is rebuilt`);
  }
  // No part is in both tables: the lookup order in `createProps` never has to break a tie.
  for (const part of Object.keys(ULTRA_FORM_BUILDERS)) assert.equal(ULTRA_BUILDING_BUILDERS[part as PartId], undefined);
});

test('every Ultra part is inside §4\'s triangle table and richer than the world it replaces', () => {
  for (const [part, build] of [...Object.entries(ULTRA_FORM_BUILDERS), ...Object.entries(ULTRA_BUILDING_BUILDERS)]) {
    const geometry = build!();
    const triangles = geometry.getAttribute('position').count / 3;
    const ceiling = SECTION_4_CEILINGS[part as PartId];
    assert.ok(ceiling !== undefined, `${part} has no §4 row`);
    assert.ok(triangles <= ceiling, `${part}: ${triangles} triangles against §4's ${ceiling}`);
    // The enhanced catalogue prices only the parts it rebuilds; every other part is at its baseline price.
    const enhanced = (ENHANCED_PART_COSTS[part as PropPartId] ?? PART_COSTS[part as PropPartId]).triangles;
    assert.ok(triangles > enhanced, `${part}: ${triangles} is no richer than the enhanced ${enhanced}`);
    // The colour attribute every instanced part needs, averaging one.
    assert.ok(geometry.getAttribute('color') !== undefined, `${part} would render black`);
    for (const mean of channelMeans(geometry)) assert.ok(Math.abs(mean - 1) < 1e-6, `${part} mean ${mean}`);
    assert.equal(geometry.index, null, `${part} is indexed; every part is un-indexed and flat`);
    assert.equal(geometry.getAttribute('ultraRelief') !== undefined, isReliefPart(part as PartId), `${part} relief attribute`);
  }
});

test('building parts cast under the Ultra buildings kit; every other part keeps its authored flag', () => {
  const offBuildings = applyKitOverride(ULTRA_FULL, { buildings: false });
  for (const part of ALL_PARTS) {
    const ordinary = PART_COSTS[part].castsShadow;
    const building = BUILDING_PARTS.includes(part);
    assert.equal(ultraCasts(part, ordinary, ULTRA_FULL.ultra), building ? true : ordinary, `${part} on ultra-full`);
    assert.equal(ultraCasts(part, ordinary, ULTRA_LIT.ultra), building ? true : ordinary, `${part} on ultra-lit`);
    assert.equal(ultraCasts(part, ordinary, offBuildings.ultra), ordinary, `${part} with -buildings`);
    // It is a rule about the part, not a copy of today's flag.
    assert.equal(ultraCasts(part, !ordinary, offBuildings.ultra), !ordinary);
  }
  // The parts §4 keeps out of the shadow pass stay out.
  for (const part of ['lampHead', 'signPlate', 'bollardCap'] as PartId[]) {
    assert.equal(ultraCasts(part, PART_COSTS[part].castsShadow, ULTRA_FULL.ultra), false, `${part} casts`);
  }
});

test('exactly the building parts carry relief', () => {
  for (const part of ALL_PARTS) assert.equal(isReliefPart(part), BUILDING_PARTS.includes(part), part);
});

test('the Ultra salts are §4\'s new ones, clear of the ordinary kit\'s', () => {
  assert.deepEqual([...ULTRA.forms.salts], [13, 17, 19, 23, 29, 31]);
  for (const salt of ULTRA.forms.salts) assert.ok(![3, 5, 7, 9, 11].includes(salt));
});

test('the shell walk catches a hole, a flipped face and a T-junction, and relieved positions scale then add', () => {
  const box = new THREE.BoxGeometry(1, 2, 3).toNonIndexed();
  const soup = Array.from(box.getAttribute('position').array);
  const whole = shellReport(soup);
  assert.ok(whole.closed);
  assert.ok(Math.abs(whole.volume - 6) < 1e-9, `a 1 × 2 × 3 box encloses ${whole.volume}`);
  // A hole.
  assert.ok(!shellReport(soup.slice(9)).closed);
  // A flipped face.
  const flipped = [...soup];
  for (let k = 0; k < 3; k += 1) [flipped[3 + k], flipped[6 + k]] = [flipped[6 + k], flipped[3 + k]];
  assert.ok(!shellReport(flipped).closed);
  // A T-junction: one edge of one face split at its midpoint, its neighbour not.
  const split = soup.slice(9);
  const [a, b, c] = [soup.slice(0, 3), soup.slice(3, 6), soup.slice(6, 9)];
  const m = [0, 1, 2].map((k) => (a[k] + b[k]) / 2);
  split.push(...a, ...m, ...c, ...m, ...b, ...c);
  assert.ok(!shellReport(split).closed, 'a T-junction passed as closed');
  // Inside out.
  const inverted: number[] = [];
  for (let f = 0; f < soup.length / 9; f += 1) inverted.push(...soup.slice(f * 9, f * 9 + 3), ...soup.slice(f * 9 + 6, f * 9 + 9), ...soup.slice(f * 9 + 3, f * 9 + 6));
  const inside = shellReport(inverted);
  assert.ok(inside.closed && inside.volume < 0);

  const plain = new THREE.BufferGeometry();
  plain.setAttribute('position', new THREE.Float32BufferAttribute([1, 1, 1], 3));
  assert.deepEqual(Array.from(relievedPositions(plain, [2, 3, 4])), [2, 3, 4]);
  plain.setAttribute('ultraRelief', new THREE.Float32BufferAttribute([-0.25, 0, 0.5], 3));
  assert.deepEqual(Array.from(relievedPositions(plain, [2, 3, 4])), [1.75, 3, 4.5]);
});
