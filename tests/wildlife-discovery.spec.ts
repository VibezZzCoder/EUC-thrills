/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Ordinary starting ride plus close harmless/closing encounters. Animal state
 * and cameras are never relocated for the discovery/approach sequences. */
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {bootAtTier,collectErrors} from './harness.ts';
const out=process.env.WILDLIFE_SHOTS??'test-results/wildlife/discovery';
test('squirrels: natural opening ride, calm observation and two late escapes',async({page})=>{
 test.setTimeout(180000);mkdirSync(out,{recursive:true});const errors=collectErrors(page);
 await page.setViewportSize({width:1280,height:800});
 await bootAtTier(page,'level=generated&seed=euc','high',{freezeAtStart:true,options:{showFps:false}});
 const initial=await page.evaluate(()=>{const g=window.game,l=g.loop as unknown as {callbacks:{render(alpha:number,synthetic?:boolean):void}},draw=l.callbacks.render;
  l.callbacks.render=(a,s)=>{if(s)draw(a,s);};g.clearActions();g.advance(0);return {wildlife:g.renderer.presentation()!.squirrels!,spawn:g.snapshot().euc.position};});
 expect(initial.wildlife.squirrels).toBe(8);expect(initial.wildlife.drawCalls).toBe(1);
 const site=initial.wildlife.sites[0];
 expect(Math.hypot(site.home.x-initial.spawn.x,site.home.z-initial.spawn.z)).toBeLessThan(65);
 const natural=[];
 await page.evaluate(()=>window.game.setActions({throttle:.55}));
 for(let i=0;i<14;i++){
  const record=await page.evaluate(()=>{const g=window.game;g.advance(30);const r=g.renderer,w=r.presentation()!.squirrels!,c=r.camera,probe=c.position.clone();
   return {pose:g.snapshot().euc,animals:w.actors.map(a=>{probe.set(a.x,a.y+.3,a.z).project(c);return {...a,ndc:{x:probe.x,y:probe.y,z:probe.z}};}),gl:r.renderer.getContext().getError()};});
  expect(record.gl).toBe(0);natural.push(record);
  await page.screenshot({path:join(out,`natural-${i}.png`)});
 }
 expect(natural.some(r=>r.animals.some(a=>!a.hidden&&Math.abs(a.ndc.x)<.95&&Math.abs(a.ndc.y)<.95&&a.ndc.z>-1&&a.ndc.z<1))).toBe(true);
 expect(natural.every(r=>!r.animals[0].escaping&&!r.animals[0].climbing)).toBe(true);
 // Continue along the actual route through the first bends using ordinary
 // semantic steering/throttle. The controller and living traffic stay active.
 await page.evaluate(async()=>{
  const {RouteSpine,createSpineLocation,createSpineSample}=await import('/src/simulation/routeSpine.ts' as string);
  const g=window.game,route=RouteSpine.fromPlan((g as unknown as {levelPlan:Parameters<typeof RouteSpine.fromPlan>[0]}).levelPlan),at=createSpineLocation(),aim=createSpineSample();
  let previousHeading=g.snapshot().euc.headingY;
  (window as unknown as {wildlifeRouteStep:()=>unknown}).wildlifeRouteStep=()=>{
   for(let j=0;j<5;j++){
    const p=g.snapshot().euc;route.locate(p.position.x,p.position.z,-1,at);route.sample(at.distance+8+Math.max(0,p.speed)*1.2,aim);
    const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
    const bearing=wrap(Math.atan2(aim.x-p.position.x,aim.z-p.position.z)-p.headingY),turnRate=wrap(p.headingY-previousHeading)/.1;previousHeading=p.headingY;
    g.setActions({throttle:Math.max(-.4,Math.min(.6,(8-p.speed)*.35+.05)),steer:Math.max(-1,Math.min(1,-bearing*2.7+turnRate*.3))});g.advance(12);
   }
   const r=g.renderer,w=r.presentation()!.squirrels!,c=r.camera,probe=c.position.clone(),p=g.snapshot().euc;route.locate(p.position.x,p.position.z,-1,at);
   return {pose:p,distance:at.distance,animals:w.actors.map(a=>{probe.set(a.x,a.y+.3,a.z).project(c);return {...a,ndc:{x:probe.x,y:probe.y,z:probe.z}};}),gl:r.renderer.getContext().getError()};
  };
 });
 const routeRide=[];
 for(let i=0;i<60;i++){
  const record=await page.evaluate(()=>(window as unknown as {wildlifeRouteStep:()=>{pose:{crashed:boolean};distance:number;gl:number}}).wildlifeRouteStep());
  expect(record.gl).toBe(0);routeRide.push(record);await page.screenshot({path:join(out,`route-ride-${i}.png`)});
  if(record.distance>220)break;
 }
 writeFileSync(join(out,'route-ride.json'),JSON.stringify(routeRide,null,2));
 expect(Math.max(...routeRide.map(r=>r.distance))).toBeGreaterThan(200);
 // Additional occupied sites from the same world, viewed from its existing
 // riding line. These are staged route views, distinct from the opening ride.
 const routeViews=await page.evaluate(async()=>{
  const {RouteSpine,createSpineLocation,createSpineSample}=await import('/src/simulation/routeSpine.ts' as string);
  const g=window.game,plan=(g as unknown as {levelPlan:Parameters<typeof RouteSpine.fromPlan>[0]}).levelPlan;
  const route=RouteSpine.fromPlan(plan),at=createSpineLocation(),sample=createSpineSample(),views=[];
  for(const index of [2,3,4,5]){const site=g.renderer.presentation()!.squirrels!.sites[index];route.locate(site.home.x,site.home.z,-1,at);
   for(const ahead of [25,12])views.push({index,ahead,pose:{...route.sample(at.distance-ahead,sample)}});
  }return views;
 });
 for(const view of routeViews){
  await page.evaluate(view=>{const g=window.game;g.clearActions();let placed=false;
   for(const offset of [0,2,-2]){const x=view.pose.x+Math.cos(view.pose.headingY)*offset,z=view.pose.z-Math.sin(view.pose.headingY)*offset;
    try{g.placeRider({x,y:g.sampleGround(x,z).height,z},view.pose.headingY);placed=true;break;}catch{}}
   if(!placed)throw new Error('No clear staged route viewpoint');g.advance(0);
  },view);
  await page.screenshot({path:join(out,`route-site-${view.index}-ahead-${view.ahead}.png`)});
 }
 await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+2.5,y:site.home.y,z:site.home.z-3},0);g.advance(30);},site);
 const calm=await page.evaluate(()=>window.game.renderer.presentation()!.squirrels!.actors[0]);
 expect(calm.escaping).toBe(false);expect(calm.hidden).toBe(false);expect(calm.climbing).toBe(false);
 await page.screenshot({path:join(out,'calm-nearby.png')});
 const cycles=[];
 for(let cycle=0;cycle<2;cycle++){
  await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+30,y:site.home.y,z:site.home.z+30},0);g.advance(1440);
   const yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z),a=g.renderer.presentation()!.squirrels!.actors[0];
   g.placeRider({x:a.x-Math.sin(yaw)*3,y:site.home.y,z:a.z-Math.cos(yaw)*3},yaw,0,4);g.setActions({throttle:.15});g.advance(0);},site);
  const approach=[];
  for(let i=0;i<55;i++){
   const record=await page.evaluate(()=>{const g=window.game;g.advance(4);const r=g.renderer,a=r.presentation()!.squirrels!.actors[0],p=g.snapshot().euc;
    return {animal:a,pose:p,gap:Math.hypot(p.position.x-a.x,p.position.z-a.z),gl:r.renderer.getContext().getError()};});
   expect(record.gl).toBe(0);approach.push(record);
   if(i%3===0)await page.screenshot({path:join(out,`cycle-${cycle}-approach-${i}.png`)});
  }
  writeFileSync(join(out,`cycle-${cycle}.json`),JSON.stringify({site,approach},null,2));
  const escape=approach.findIndex(r=>r.animal.escaping);
  expect(escape).toBeGreaterThan(0);expect(approach.slice(0,escape).some(r=>r.gap>2.5&&!r.animal.hidden)).toBe(true);
  expect(approach[escape].gap).toBeLessThan(4.5);
  expect(approach.some(r=>r.animal.climbing&&!r.animal.hidden)).toBe(true);
  await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+30,y:site.home.y,z:site.home.z+30},0);},site);
  const recovery=[];
  for(let i=0;i<24;i++){
   const record=await page.evaluate(()=>{window.game.advance(30);return window.game.renderer.presentation()!.squirrels!.actors[0];});recovery.push(record);
   if(i%3===0)await page.screenshot({path:join(out,`cycle-${cycle}-recovery-${i}.png`)});
  }
  expect(recovery.at(-1)!.climbing).toBe(false);expect(recovery.at(-1)!.hidden).toBe(false);
  cycles.push({approach,recovery});
 }
 expect(errors).toEqual([]);writeFileSync(join(out,'discovery.json'),JSON.stringify({initial,natural,routeRide,routeViews,calm,cycles,errors,
  scope:'Actual controller starting ride and two driven approaches, native chase camera; staged close observation. No animal/camera edits or timing metrics.'},null,2));
});
