/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {QUAY_LINES} from '../src/level/euclaudeLines.ts';
import {bootAtTier,collectErrors} from './harness.ts';
test.use({video:{mode:'on',size:{width:1280,height:720}}});
const shots=process.env.QUAY_SHOTS??'test-results/quay-stage2';
test('Quay Quarter: High journey, Low gap cues, four seats and one phone layout',async({page,browser})=>{
 test.setTimeout(240000);await mkdir(shots,{recursive:true});await page.setViewportSize({width:1280,height:720});const errors=collectErrors(page);
 await bootAtTier(page,'level=euclaude','high',{freezeAtStart:true,options:{showFps:false}});
 const capture=async(name:string)=>{await page.screenshot({path:join(shots,name+'.png')});};
 const place=async(x:number,z:number,h=0)=>page.evaluate(({x,z,h})=>{window.game.placeRider({x,y:0,z},h);window.game.setActions({throttle:0,steer:0});window.game.advance(30);},{x,z,h});
 await capture('spawn-high');
 for(const [name,x,z,h]of [['roof-entry',-74,-59,0],['roof-gap-1',-74,-21,0],['roof-gap-2',-74,7,0],['roof-finale',-74,31,0],['pocket',24,4,0],['park',16,-42,Math.PI/2],['grand-stair',42,15,0],['waterfront',-76,78,Math.PI/2],['kicker',-30,9,Math.PI],['market',65,24,0],['roof-exterior',-90,14,Math.PI/4]] as const){await place(x,z,h);await capture(name+'-high');}
 // Existing diagnostic orbit supplies useful construction views; chase remains the acceptance view.
 for(const [name,x,z] of [['roof-oblique',-78,-7],['grand-stair-oblique',42,25]] as const){await place(x,z);await page.evaluate(()=>{window.game.setActions({cameraCycle:true});window.game.advance(1);window.game.setActions({cameraCycle:false});window.game.advance(100);});await capture(name+'-high');await page.evaluate(()=>{window.game.setActions({cameraCycle:true});window.game.advance(1);window.game.setActions({cameraCycle:false});});}
 const journeys=[];
 for(const line of QUAY_LINES){
  await page.evaluate(e=>{window.game.placeRider({x:e.x,y:0,z:e.z},e.heading);window.game.setActions({throttle:0,steer:0,hop:false});},line.entry);
  // Real loop + animation-frame input observation: video must show continuous travel,
  // not many advance() steps hidden inside one blocked browser task.
  const progress=await page.evaluate(line=>new Promise<{lands:number;crashed:boolean;done:boolean;seconds:number}>(resolve=>{
   let lands=0,hopped=false,previous=window.game.snapshot().euc.grounded;const start=performance.now();
   window.game.loop.setRunning(true);
   const observe=()=>{
    const s=window.game.snapshot().euc;if(!previous&&s.grounded)lands++;previous=s.grounded;
    const hop=line.hopLip!==null&&!hopped&&(line.entry.heading===Math.PI?s.position.z<line.hopLip+Math.abs(s.speed)*.125:s.position.z>line.hopLip-Math.abs(s.speed)*.125);hopped ||=hop;
    const done=s.crashed||(lands>=line.landings&&s.speed<.03),seconds=(performance.now()-start)/1000;
    window.game.setActions({throttle:lands>=line.landings?(s.speed>.03?-1:0):1,steer:0,hop});
    if(done||seconds>25){window.game.setActions({throttle:0,steer:0,hop:false});window.game.loop.setRunning(false);resolve({lands,crashed:s.crashed,done,seconds});return;}
    requestAnimationFrame(observe);
   };observe();
  }),line);
  journeys.push({line:line.id,...progress});expect(progress.crashed,line.id).toBe(false);expect(progress.lands,line.id).toBe(line.landings);expect(progress.done,line.id).toBe(true);
  await capture(line.id+'-stopped');
 }
 await writeFile(join(shots,'journeys-native.json'),JSON.stringify(journeys,null,2));
 // Actual held input at the market, with a real-loop sample (synthetic timing excluded).
 await place(65,10);await page.evaluate(()=>{window.game.setActions({throttle:1});window.game.profileBegin();window.game.loop.setRunning(true);});
 await page.waitForTimeout(1500);await page.evaluate(()=>{window.game.setActions({throttle:0});window.game.loop.setRunning(false);});
 const solo=await page.evaluate(()=>{const s=window.game.snapshot();return {world:s.levelPlanId,quality:s.options.quality,render:s.render,profile:window.game.profile()};});
 await capture('market-motion-end');
 await page.evaluate(()=>window.game.setOptions({quality:'low'}));
 for(const [name,z]of [['gap-1',-21],['gap-2',7]] as const){await place(-74,z);await capture(name+'-low');}
 await page.evaluate(()=>{window.game.setOptions({quality:'high'});window.game.spawnRider('cool-rider');window.game.spawnRider('red-rider');window.game.spawnRider('gnarwheel');window.game.advance(1);});
 await capture('four-seat-high');
 await page.evaluate(()=>{window.game.profileBegin();window.game.loop.setRunning(true);});await page.waitForTimeout(1200);await page.evaluate(()=>window.game.loop.setRunning(false));
 const split=await page.evaluate(()=>{const s=window.game.snapshot();return {world:s.levelPlanId,quality:s.options.quality,render:s.render,profile:window.game.profile(),seatCount:window.game.seatCount};});
 expect(split.seatCount).toBe(4);expect(errors).toEqual([]);
 await writeFile(join(shots,'runtime.json'),JSON.stringify({solo,split},null,2));
 const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const phone=await context.newPage();await bootAtTier(phone,'level=euclaude','high',{freezeAtStart:true,options:{showFps:false}});await phone.screenshot({path:join(shots,'phone-landscape-high.png')});await phone.evaluate(()=>{window.game.placeRider({x:-74,y:0,z:7},0);window.game.advance(1);});await phone.screenshot({path:join(shots,'phone-roof-high.png')});
 expect(await phone.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(true);await context.close();
});
