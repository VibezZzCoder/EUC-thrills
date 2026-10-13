/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Staged nearest passages use native chase cameras, actual human seat positions
 * and the production update. These prove visibility/avoidance, not driving feel. */
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {bootAtTier,collectErrors} from './harness.ts';
const out=process.env.WILDLIFE_SHOTS??'test-results/wildlife/current';
for(const shape of ['portrait','quad'] as const)test(`wildlife ${shape}: closest ordinary-camera encounter`,async({page})=>{
 test.setTimeout(120000);mkdirSync(out,{recursive:true});const errors=collectErrors(page);
 await page.setViewportSize(shape==='portrait'?{width:390,height:844}:{width:1280,height:800});
 await bootAtTier(page,'level=generated&seed=euc','medium',{freezeAtStart:true,options:{showFps:false}});
 const site=await page.evaluate(shape=>{const g=window.game,l=g.loop as unknown as {callbacks:{render(alpha:number,synthetic?:boolean):void}},draw=l.callbacks.render;l.callbacks.render=(a,s)=>{if(s)draw(a,s);};
  if(shape==='quad')while(g.renderer.viewCount<4)g.spawnRider();return g.renderer.presentation()!.squirrels!.sites[0];},shape);
 const records=[];
 // Reset in cover, then let this site return before the staged approach.
 await page.evaluate(site=>{const g=window.game;g.clearActions();for(let i=0;i<g.renderer.viewCount;i++)g.placeRider({x:site.home.x+30+i*2,y:site.home.y,z:site.home.z+30},0,i);g.advance(720);},site);
 for(let i=0;i<42;i++){
  const result=await page.evaluate(({site,shape,i})=>{const g=window.game;const outward=Math.atan2(site.home.x-site.refuge.x,site.home.z-site.refuge.z),distance=12-i*.32;
   // Tangential arrival exposes the sideways retreat in the native camera;
   // a head-on arrival can place the player's body over the whole sightline.
   for(let seat=0;seat<g.renderer.viewCount;seat++){const yaw=outward+Math.PI/2+(shape==='quad'?seat*Math.PI/2:0);g.placeRider({x:site.home.x+Math.sin(yaw)*distance,y:site.home.y,z:site.home.z+Math.cos(yaw)*distance},yaw+Math.PI,seat,6.4);}
   g.advance(3);const r=g.renderer,w=r.presentation()!.squirrels!,a=w.actors[0],gl=r.renderer.getContext();
   const riders=Array.from({length:r.viewCount},(_,seat)=>g.snapshotFor(seat).euc.position);
   return {i,distance,animal:a,riders,views:r.viewCount,gl:gl.getError()};
  },{site,shape,i});expect(result.gl).toBe(0);records.push(result);
  if(i%3===0||i>=36)await page.screenshot({path:join(out,`${shape}-encounter-${i}.png`)});
 }
 writeFileSync(join(out,`${shape}-encounter.json`),JSON.stringify({site,records,errors,scope:'Staged moving player passages, native per-seat chase cameras. No altered animal state or camera inspection.'},null,2));
 expect(records.some(v=>v.animal.escaping&&v.animal.running)).toBe(true);
 expect(records.filter(v=>v.distance>4).every(v=>!v.animal.escaping&&!v.animal.climbing&&!v.animal.hidden)).toBe(true);
 expect(records.every(v=>v.animal.hidden||v.riders.every(r=>Math.hypot(r.x-v.animal.x,r.z-v.animal.z)>=.65||Math.abs(r.y-v.animal.y)>=1.5))).toBe(true);
 expect(records.at(-1)!.animal.hidden||records.at(-1)!.animal.climbing||records.at(-1)!.animal.escaping).toBe(true);
 expect(errors).toEqual([]);
});
