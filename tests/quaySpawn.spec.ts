/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {bootAtTier,collectErrors} from './harness.ts';

test('Quay market first impression at the unchanged spawn',async({page})=>{
 const output=process.env.QUAY_SPAWN_SHOTS??'test-results/quay-spawn';
 await mkdir(output,{recursive:true});
 await page.setViewportSize({width:1280,height:720});
 const errors=collectErrors(page);
 await bootAtTier(page,'level=euclaude','high',{freezeAtStart:true,options:{showFps:false}});
 const state=await page.evaluate(()=>{
  window.game.advance(1);
  const s=window.game.snapshot();
  return {position:s.euc.position,heading:s.euc.headingY,population:window.game.populationState()};
 });
 expect(state.position.x).toBeCloseTo(65);
 expect(state.position.z).toBeCloseTo(10);
 expect(state.population.report.rejected).toEqual([]);
 expect(state.population.simulation.actors.length).toBe(122); // the 2026-10-21 look pass crowd (PLANS §45.11)
 await page.screenshot({path:join(output,'spawn.png')});
 await writeFile(join(output,'spawn-state.json'),JSON.stringify(state,null,2));
 expect(errors).toEqual([]);
});
