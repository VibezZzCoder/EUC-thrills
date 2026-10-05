/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import { ordinaryBoundaryAttributes, ordinaryBoundaryField, GROUND_BOUNDARY_ATTRIBUTES } from './ordinaryGroundBoundary.ts';
import { createSharedBoundaryTint } from './sharedBoundaryTint.ts';
import { Color } from 'three';
import { SURFACES, materialAppearance } from '../data/surfaces.ts';
import { SHARED_GROUND } from '../data/tuning.ts';
import { COURSE_MOTTLE, groundTint, linearFromSrgbHex } from './groundNoise.ts';
import { sharedGroundCode } from './sharedGroundCodes.ts';
import { withSharedGroundContours } from './sharedGroundContours.ts';

test('shared boundary uses each world corner instead of copying a neighbour cell tone', () => {
  const plan: LevelPlan = { id: 'continuous-boundary', segments: [], checkpoints: [],
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'grass' },
    heightfield: { originX: 17.3, originZ: -9.1, spacing: 1.5, columns: 5, rows: 4,
      heights: Array(20).fill(0), surfaces: ['grass','dirt','dirt','dirt',
        'grass','grass','dirt','dirt','grass','grass','grass','dirt'] } };
  const drawn = new Map<string, number[]>([['grass',[]],['dirt',[]]]);
  plan.heightfield.surfaces.forEach((surface, cell) => drawn.get(surface)!.push(cell));
  const first = new Map<number, number>(); let count = 0;
  for (const cells of drawn.values()) for (const cell of cells) { first.set(cell, count); count += 4; }
  const colours = Array(count * 3).fill(1);
  const historical = ordinaryBoundaryAttributes(plan, drawn, colours);
  const shared = ordinaryBoundaryAttributes(plan, drawn, colours, true);
  const old = historical.attributes.find(([name]) => name === GROUND_BOUNDARY_ATTRIBUTES.tint)![1];
  const tint = shared.attributes.find(([name]) => name === GROUND_BOUNDARY_ATTRIBUTES.tint)![1];
  const mode = shared.attributes.find(([name]) => name === GROUND_BOUNDARY_ATTRIBUTES.mode)![1];
  const fill = withSharedGroundContours(plan, drawn, ordinaryBoundaryField(plan, drawn));
  const evaluate = createSharedBoundaryTint(plan);
  assert.ok(fill.cells.size > 0, 'real staircase boundary present');
  let differentCorners = false, differsFromLegacy = false;
  for (const [cell, value] of fill.cells) {
    const start = first.get(cell)!, column = cell % 4, row = Math.floor(cell / 4);
    for (let corner = 0; corner < 4; corner++) {
      const expected = { r: 1, g: 1, b: 1 };
      evaluate(plan.heightfield.surfaces[cell], value.towards, column + (corner & 1), row + (corner >> 1), expected);
      const at = start + corner;
      assert.equal(Math.floor(mode.getX(at) / 16),sharedGroundCode(SURFACES[value.towards].material));
      const channels = [tint.getX(at), tint.getY(at), tint.getZ(at)];
      for (const [index, key] of (['r','g','b'] as const).entries()) {
        assert.ok(Math.abs(channels[index] - expected[key]) < Math.max(0.001, expected[key] * 0.001));
      }
      differentCorners ||= Math.abs(tint.getX(at) - tint.getX(start)) > 0.001;
      differsFromLegacy ||= Math.abs(tint.getX(at) - old.getX(at)) > 0.001;
    }
  }
  assert.ok(differentCorners, 'a whole-cell constant would fail the continuous tint requirement');
  assert.ok(differsFromLegacy, 'known-bad neighbour-first-corner policy is distinguishable');
  assert.equal(shared.bytes, historical.bytes);
  assert.equal(shared.fillLines, fill.lines, 'packed accounting follows the actual paired contour field');
});


test('a filled shared corner reconstructs the actual Three material colour, including a custom palette', () => {
  const plan = { heightfield: {originX:13.7,originZ:-9.3,spacing:1.25},
    palette:{grass:0x3b7541,dirt:0x9c754f} } as LevelPlan;
  const evaluate = createSharedBoundaryTint(plan), ratio = {r:1,g:1,b:1};
  const profile = {...COURSE_MOTTLE,cellWeight:SHARED_GROUND.cellWeight,
    midWeight:SHARED_GROUND.midWeight,coarseWeight:SHARED_GROUND.coarseWeight};
  const tint = (id:'grass'|'dirt') => {
    const a=materialAppearance(id), base={r:1,g:1,b:1},out={r:1,g:1,b:1};
    linearFromSrgbHex(plan.palette![id]!,base);
    return groundTint(3,4,13.7+3*1.25,-9.3+4*1.25,a.mottle,base,profile,out);
  };
  evaluate('dirt','grass',3,4,ratio);
  const own=new Color(plan.palette!.dirt),target=new Color(plan.palette!.grass),a=tint('dirt'),b=tint('grass');
  for(const key of ['r','g','b'] as const) assert.ok(Math.abs(own[key]*a[key]*ratio[key]-target[key]*b[key])<1e-12);
  // The historic 2.2 material approximation would leave a visible cell-sized
  // join even though both mottle evaluations use the correct world corner.
  const oldOwn={r:1,g:1,b:1},oldTarget={r:1,g:1,b:1};
  linearFromSrgbHex(plan.palette!.dirt!,oldOwn);linearFromSrgbHex(plan.palette!.grass!,oldTarget);
  const wrong=oldTarget.b*b.b/(oldOwn.b*a.b);
  assert.ok(Math.abs(own.b*a.b*wrong-target.b*b.b)>0.001);
});
