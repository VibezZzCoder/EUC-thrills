/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {bootAtTier} from './harness.ts';
// Separate short native window, no video encoding; measures this host only.
test('Quay Cut 1 native population CPU ownership, solo and four seats',async({page})=>{
 await bootAtTier(page,'level=euclaude','high',{freezeAtStart:true,options:{showFps:false}});
 const rows=[];
 for(const seats of [1,4]){
  if(seats===4)await page.evaluate(()=>{window.game.spawnRider('cool-rider');window.game.spawnRider('red-rider');window.game.spawnRider('gnarwheel');});
  await page.evaluate(()=>{
   const g=window.game as unknown as Record<string,any>;g.quayCost={};
   for(const name of ['beginPopulationStep','resolvePopulationPreparedSteps','finishPopulationStep']){
    const original=g[name];g.quayCost[name]={original,samples:[]};
    g[name]=function(...args:unknown[]){const t=performance.now();try{return original.apply(this,args);}finally{g.quayCost[name].samples.push(performance.now()-t);}};
   }
   window.game.placeRider({x:65,y:0,z:10},0);window.game.setActions({throttle:1});window.game.profileBegin();window.game.loop.setRunning(true);
  });
  await page.waitForTimeout(2000);
  const row=await page.evaluate(()=>{
   window.game.setActions({throttle:0});window.game.loop.setRunning(false);
   const g=window.game as unknown as Record<string,any>,cpu:Record<string,unknown>={};
   for(const [name,value]of Object.entries(g.quayCost) as [string,{original:unknown;samples:number[]}][]){const a=value.samples.sort((a,b)=>a-b);cpu[name]={count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],total:a.reduce((a,b)=>a+b,0)};g[name]=value.original;}
   const s=window.game.snapshot();return {world:s.levelPlanId,quality:s.options.quality,seats:window.game.seatCount,cpu,render:s.render,profile:window.game.profile()};
  });
  expect(row.seats).toBe(seats);expect(row.world).toContain('euclaude-r2');rows.push(row);
 }
 const dir=process.env.QUAY_SHOTS??'test-results/quay-stage2';await mkdir(dir,{recursive:true});await writeFile(`${dir}/population-cpu.json`,JSON.stringify({scope:'Native live loop, separate sequential population owners, 2 seconds each. Host observation, not device acceptance or total frame interval.',rows},null,2));
});
