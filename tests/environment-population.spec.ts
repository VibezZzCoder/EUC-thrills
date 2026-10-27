/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

const directory = process.env.ENVIRONMENT_POPULATION_SHOTS ?? 'test-results/environment-overhaul/population-r1';

for (const quality of ['high','ultra'] as const) test(`outdoor population current gameplay and motion ${quality}`,async ({page})=>{
  test.setTimeout(180_000); mkdirSync(directory,{recursive:true});
  const errors=collectErrors(page); await page.setViewportSize({width:1280,height:900});
  await bootAtTier(page,'level=generated&seed=euc-thrills',quality,{freezeAtStart:true});
  const inspect=()=>page.evaluate(()=>{
    const game=window.game, population=game.populationState(), presentation=game.renderer.presentation();
    const gl=game.renderer.renderer.getContext(), glErrors:number[]=[];
    for(let i=0;i<16;i++){const error=gl.getError();if(error===gl.NO_ERROR)break;glErrors.push(error);}
    return {population,presentation,resources:game.snapshot().resources,glErrors};
  });
  const initial=await inspect(); expect(initial.population.simulation.actors.length).toBeGreaterThan(0);
  expect(initial.presentation!.population!.actors).toBe(initial.population.simulation.actors.length);
  expect(initial.presentation!.population!.missingPoseIds).toEqual([]);
  expect(initial.presentation!.population!.missingSurfaceSupportIds).toEqual([]);
  expect(initial.glErrors).toEqual([]);
  const kinds=['walker','social','worker','fictionalEuc','parkedVehicle','serviceVehicle','trafficVehicle'];
  const subjects=initial.population.simulation.actors.filter(actor=>
    actor.id===initial.population.simulation.actors.find(other=>other.kind===actor.kind)?.id && kinds.includes(actor.kind));
  const evidence:unknown[]=[];
  for(const subject of subjects){
    const placement=await page.evaluate(subject=>{
      const game=window.game;
      for(const side of [-1,1])for(const back of [8,12,16]){
        const x=subject.x-Math.sin(subject.headingY)*back+Math.cos(subject.headingY)*side*3;
        const z=subject.z-Math.cos(subject.headingY)*back-Math.sin(subject.headingY)*side*3;
        const ground=game.sampleGround(x,z); if(ground.offCourse)continue;
        try {game.clearActions();game.placeRider({x,y:ground.height,z},Math.atan2(subject.x-x,subject.z-z));game.advance(0);
          return {x,z,heading:Math.atan2(subject.x-x,subject.z-z)};} catch { /* Try another physically clear observation spot. */ }
      }
      throw new Error(`No safe gameplay observation for ${subject.id}`);
    },subject);
    await page.screenshot({path:join(directory,`${subject.kind}-${quality}-chase.png`)});
    evidence.push({subject,placement,view:'chase',...await inspect()});
  }
  // The same actual simulation supplies every temporal frame; no render clock
  // drives feet, wheels, traffic or another pane's world.
  const moving=initial.population.simulation.actors.find(actor=>actor.kind==='trafficVehicle')
    ?? initial.population.simulation.actors.find(actor=>actor.kind==='walker')!;
  await page.evaluate(()=>{
    const loop=window.game.loop;
    loop.setRunning(false);
    // Keep real manual stepping alive while preventing asynchronous chase
    // renders from replacing the diagnostic camera between draw and capture.
    const callbacks=(loop as unknown as {callbacks:{render:(alpha:number,synthetic?:boolean)=>void}}).callbacks;
    const draw=callbacks.render;
    callbacks.render=(alpha,synthetic)=>{if(synthetic)draw(alpha,synthetic);};
  });
  let expectedTick=initial.population.simulation.tick;
  const motionPositions:{x:number;z:number}[]=[];
  for(let frame=0;frame<12;frame++){
    const camera=await page.evaluate(({id,frame})=>{
      const game=window.game;game.clearActions();game.advance(24);
      const actor=game.populationState().simulation.actors.find(value=>value.id===id)!;
      const renderer=game.renderer,camera=renderer.camera;
      const reach=actor.kind==='trafficVehicle'?10:5;
      camera.position.set(actor.x+reach*0.7,actor.y+1.8,actor.z-reach);
      camera.lookAt(actor.x,actor.y+0.9,actor.z);camera.updateMatrixWorld();renderer.render();
      return {frame,actor,tick:game.populationState().simulation.tick,
        position:camera.position.toArray(),quaternion:camera.quaternion.toArray()};
    },{id:moving.id,frame});
    expectedTick+=24;expect(camera.tick).toBe(expectedTick);
    motionPositions.push({x:camera.actor.x,z:camera.actor.z});
    await page.screenshot({path:join(directory,`${moving.kind}-${quality}-motion-${String(frame).padStart(2,'0')}.png`)});
    evidence.push({view:'diagnostic-motion',camera,...await inspect()});
  }
  expect(motionPositions.some(value=>Math.hypot(value.x-motionPositions[0].x,value.z-motionPositions[0].z)>0.05),
    'the temporal sequence must include actual actor movement').toBe(true);
  const before=await inspect();
  const reset=await page.evaluate(()=>{
    const game=window.game;game.setActions({reset:true});game.advance(1);game.clearActions();return game.populationState();
  });
  expect(reset.simulation.tick).toBe(before.population.simulation.tick+1);
  expect(reset.simulation.clockSeconds).toBeGreaterThan(before.population.simulation.clockSeconds);
  expect(reset.digest).toBe(before.population.digest);
  expect(errors).toEqual([]); expect((await inspect()).glErrors).toEqual([]);
  writeFileSync(join(directory,`population-${quality}.json`),JSON.stringify({quality,initial,evidence,reset,errors,
    scope:'Actual world population, safe gameplay observations, temporal foot/tyre frames and reset clock. Multi-occupant physical transaction acceptance remains separate.'},null,2));
});

test('population survives graphics rebuilds and all supported pane counts without advancing twice',async({page})=>{
  test.setTimeout(180_000);mkdirSync(directory,{recursive:true});
  const errors=collectErrors(page);await page.setViewportSize({width:1440,height:1000});
  await bootAtTier(page,'level=generated&seed=euc-thrills','high',{freezeAtStart:true});
  const original=await page.evaluate(()=>window.game.populationState());
  // M47: Ultra draws High, so the two share one density roster and a switch
  // between them never restarts the living world.
  expect(original.densityLayer).toBe('high');
  const tierEvidence:unknown[]=[], resources=new Map<string,unknown>();
  for(let round=0;round<3;round++)for(const quality of ['ultra','high']as const){
    const current=await page.evaluate(quality=>{
      const game=window.game;game.setOptions({quality});game.advance(0);
      return {population:game.populationState(),resources:game.snapshot().resources,presentation:game.renderer.presentation()};
    },quality);
    expect(current.population.simulation).toEqual(original.simulation);
    expect(current.population.digest).toBe(original.digest);
    expect(current.population.densityLayer).toBe('high');
    expect(current.population.rosterActors).toBe(original.rosterActors);
    if(round>0)expect(current.resources).toEqual(resources.get(quality));
    resources.set(quality,current.resources);tierEvidence.push({round,quality,...current});
  }
  const panes:unknown[]=[];
  for(const count of [2,4]){
    const current=await page.evaluate(count=>{
      const game=window.game;while(game.renderer.viewCount<count)game.spawnRider();
      const before=game.populationState();game.clearActions();game.advance(120);const after=game.populationState();
      return {views:game.renderer.viewCount,before,after,presentation:game.renderer.presentation()};
    },count);
    expect(current.views).toBe(count);expect(current.after.simulation.tick-current.before.simulation.tick).toBe(120);
    expect(current.presentation!.population!.actors).toBe(current.after.simulation.actors.length);
    // M47: the 2×2 grid rides at most the Medium roster; two panes keep High's.
    expect(current.after.densityLayer).toBe(count>=3?'medium':'high');
    expect(current.after.rosterActors).toBe(current.after.simulation.actors.length);
    if(count<3)expect(current.after.digest).toBe(original.digest);
    else expect(current.after.rosterActors).toBeLessThan(original.rosterActors);
    await page.screenshot({path:join(directory,`population-${count}-panes.png`)});panes.push(current);
  }
  expect(errors).toEqual([]);
  writeFileSync(join(directory,'population-lifecycle.json'),JSON.stringify({tierEvidence,panes,errors},null,2));
});

test('M47: a live tier change never restarts an actor inside a standing rider; it is taken once the rider is clear',async({page})=>{
  test.setTimeout(120_000);
  const errors=collectErrors(page);
  await bootAtTier(page,'level=generated&seed=euc','low',{freezeAtStart:true});
  const result=await page.evaluate(async()=>{
    const game=window.game as any, modulePath='/src/level/populationDensity.ts';
    const {populationRoster}=await import(modulePath);
    const prepared=game.preparedPopulation, high=populationRoster(prepared,'high');
    // The rider stands on the start station of High's first extra van.
    const van=high.actors.slice(prepared.actors.length).find((actor:any)=>actor.kind==='trafficVehicle');
    const points=high.paths.find((path:any)=>path.id===van.pathId).points;
    const at=points.findIndex((point:any)=>point.distanceMetres>=van.initialDistanceMetres);
    const a=points[Math.max(0,at-1)], b=points[at];
    const spawn=game.snapshot().euc;
    game.placeRider({x:b.x,y:0,z:b.z},Math.atan2(b.x-a.x,b.z-a.z));game.clearActions();game.advance(2);
    const read=()=>{const state=game.populationState();return {layer:state.densityLayer,pending:state.densityPending,actors:state.rosterActors};};
    game.setOptions({quality:'high'});game.advance(0);const held=read();
    game.advance(360);const stillHeld=read();
    game.placeRider({x:spawn.position.x,y:0,z:spawn.position.z},spawn.headingY);game.clearActions();game.advance(240);
    return {held,stillHeld,taken:read(),vanStarted:game.population.snapshot().actors.some((actor:any)=>actor.id===van.id)};
  });
  expect(result.held).toEqual({layer:'base',pending:true,actors:28});
  expect(result.stillHeld).toEqual(result.held);
  expect(result.taken).toEqual({layer:'high',pending:false,actors:76});
  expect(result.vanStarted).toBe(true);
  expect(errors).toEqual([]);
});
