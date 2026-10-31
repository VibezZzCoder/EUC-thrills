/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {QUAY_LINES} from '../src/level/euclaudeLines.ts';
import {bootAtTier,collectErrors} from './harness.ts';
const shots=process.env.QUAY_FIX_SHOTS??'test-results/quay-fix';
test.use({video:{mode:'on',size:{width:1280,height:720}}});
test('Quay fix: six native coast arrivals and visible catch returns',async({page})=>{
 test.setTimeout(150000);await mkdir(shots,{recursive:true});await page.setViewportSize({width:1280,height:720});const errors=collectErrors(page);
 await bootAtTier(page,'level=euclaude','high',{freezeAtStart:true,options:{showFps:false}});
 const review=process.env.QUAY_FIX_REVIEW==='1';
 const prior=review?JSON.parse(await readFile(join(shots,'native-coasts.json'),'utf8')):[];
 const rows=[];
 for(const line of QUAY_LINES){
  await page.evaluate(e=>{window.game.placeRider({x:e.x,y:0,z:e.z},e.heading);window.game.setActions({throttle:0,steer:0,hop:false});window.game.advance(1);},line.entry);
  await page.screenshot({path:join(shots,line.id+'-entry.png')});
  if(review&&line.id!=='L2'&&line.id!=='L4'){
   const row=prior.find((r:{line:string})=>r.line===line.id);await page.evaluate(({p,h})=>{window.game.placeRider(p,h);window.game.advance(30);},{p:row.position,h:line.entry.heading});await page.screenshot({path:join(shots,line.id+'-catch.png')});continue;
  }
  const result=await page.evaluate(({line,review})=>new Promise<{lands:number;crashed:boolean;done:boolean;position:{x:number;y:number;z:number};seconds:number}>(resolve=>{
   let landedAt=0;let lands=0,hopped=false,finished=false,previous=window.game.snapshot().euc.grounded;const start=performance.now();
   window.game.loop.setRunning(true);
   const observe=()=>{
    const s=window.game.snapshot().euc;if(!previous&&s.grounded){lands++;if(lands>=line.landings&&(line.id!=='L4'||s.position.z>=21.6)&&(line.id!=='L6'||s.position.z< -7)){finished=true;landedAt=performance.now();}}previous=s.grounded;
    const hop=line.hopLip!==null&&!hopped&&(line.entry.heading===Math.PI?s.position.z<line.hopLip+Math.abs(s.speed)*.125:s.position.z>line.hopLip-Math.abs(s.speed)*.125);hopped ||=hop;
    const done=finished&&Math.abs(s.speed)<.03,seconds=(performance.now()-start)/1000;
    window.game.setActions({throttle:finished&&(!review||performance.now()-landedAt>=800)?0:1,steer:0,hop});
    if(done||s.crashed||seconds>22){window.game.setActions({throttle:0,steer:0,hop:false});window.game.loop.setRunning(false);resolve({lands,crashed:s.crashed,done,position:s.position,seconds});return;}
    requestAnimationFrame(observe);
   };observe();
  }),{line,review});
  rows.push({line:line.id,...result});expect(result.crashed,line.id).toBe(false);expect(result.done,line.id).toBe(true);
  await page.screenshot({path:join(shots,line.id+'-catch.png')});
 }
 for(const [name,x,z,h]of [['stair-close',42,9,0],['stair-landing',48,30,-Math.PI/2],['roof-catch',-68,37,0],['park-catch',63,-37,Math.PI/2],['market-cross',10,46,-Math.PI/2]] as const){
  await page.evaluate(({x,z,h})=>{window.game.placeRider({x,y:0,z},h);window.game.advance(30);},{x,z,h});await page.screenshot({path:join(shots,name+'.png')});
 }
 await page.evaluate(()=>{window.game.placeRider({x:42,y:0,z:9},0);window.game.setCameraMode('orbit');window.game.advance(100);});await page.screenshot({path:join(shots,'stair-oblique.png')});
 await page.evaluate(()=>{window.game.setCameraMode('chase');window.game.advance(1);window.game.setOptions({quality:'low'});window.game.advance(1);});await page.screenshot({path:join(shots,'stair-low.png')});
 await page.evaluate(()=>{window.game.setOptions({quality:'high'});window.game.spawnRider('cool-rider');window.game.spawnRider('red-rider');window.game.spawnRider('gnarwheel');window.game.advance(1);});await page.screenshot({path:join(shots,'split-high.png')});
 await writeFile(join(shots,review?'native-review.json':'native-coasts.json'),JSON.stringify(rows,null,2));expect(errors).toEqual([]);
});
