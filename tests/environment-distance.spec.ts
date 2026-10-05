/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type * as THREE from 'three';
import type { VegetationDistanceRanges } from '../src/render/vegetationDistance.ts';
import { bootAtTier, collectErrors } from './harness.ts';
const directory = process.env.ENVIRONMENT_DISTANCE_SHOTS ?? 'test-results/environment-overhaul/distance-r14';
interface Draw { cell:string; camera:string; perspective:boolean; level:string; count:number; instances:number;
 cameraPosition:number[]; cameraQuaternion:number[] }
interface DistanceReport { rows:Draw[]; colourTriangles:number; shadowTriangles:number; glErrors:number[]; calls:number; triangles:number }
declare global { interface Window { environmentDistance:{ reset():void; report():DistanceReport; forceNear(value:boolean):void;
  pose(distance:number, tangent?:number):{position:number[]; quaternion:number[]; radius:number}; restore():void } } }
for (const world of ['generated&seed=euc','generated&seed=corner','switchback']) {
 for (const quality of ['high','ultra'] as const) test(`actual conifer submissions and threshold motion ${world} ${quality}`, async ({page}) => {
  test.setTimeout(150_000);mkdirSync(directory,{recursive:true});const errors=collectErrors(page);
  await page.setViewportSize({width:1280,height:900});
  await bootAtTier(page,`level=${world}`,quality,{freezeAtStart:true});
  // Record real native motion before disposing the RAF scheduler. A stopped
  // loop intentionally refuses advance(), so this belongs before camera work.
  const ride=await page.evaluate(()=>{const game=window.game;game.clearActions();const before=game.snapshot();
   game.setActions({throttle:.28,steer:0});game.advance(120);game.clearActions();const after=game.snapshot();
   return {before:{clock:before.simTimeSeconds,pose:before.euc},after:{clock:after.simTimeSeconds,pose:after.euc},population:game.populationState()};});
  expect(ride.after.clock-ride.before.clock).toBeCloseTo(1,6);
  // Frozen simulation continues rendering on RAF. Diagnostic cameras must own
  // the canvas until its pixels are captured, as in the foundation views.
  await page.evaluate(() => window.game.loop.dispose());
  const installed=await page.evaluate(async()=>{
   const path='/src/render/vegetationDistance.ts', kit=await import(path);
   const game=window.game, owner=game.renderer, renderer=owner.renderer;
   const cells:{mesh:THREE.InstancedMesh;ranges:VegetationDistanceRanges}[]=[];
   owner.scene.updateMatrixWorld(true);
   owner.scene.traverse(object=>{const mesh=object as THREE.InstancedMesh;
    if(mesh.isInstancedMesh && mesh.name.startsWith('level-props-coniferFoliage')){
     const ranges=kit.vegetationDistanceRanges(mesh.geometry) as VegetationDistanceRanges|null;
     if(ranges && mesh.boundingSphere)cells.push({mesh,ranges});
    }});
   if(!cells.length)throw new Error('No actual packed conifer cells');
   cells.sort((a,b)=>b.mesh.count-a.mesh.count);
   const subject=cells[0], sphere=subject.mesh.boundingSphere!.clone().applyMatrix4(subject.mesh.matrixWorld);
   const draw=renderer.renderBufferDirect;let rows:Draw[]=[], force=false;
   renderer.renderBufferDirect=function(...args:Parameters<typeof draw>):void{
    const [camera,,geometry,,object]=args, cell=cells.find(value=>value.mesh===object);
    if(cell){
     if(force && (camera as THREE.PerspectiveCamera).isPerspectiveCamera)geometry.setDrawRange(cell.ranges.near.start,cell.ranges.near.count);
     const level=['near','middle','far'].find(level=>cell.ranges[level as 'near'|'middle'|'far'].start===geometry.drawRange.start
      &&cell.ranges[level as 'near'|'middle'|'far'].count===geometry.drawRange.count) ?? 'INVALID';
     rows.push({cell:object.name,camera:camera.uuid,perspective:(camera as THREE.PerspectiveCamera).isPerspectiveCamera===true,
      level,count:geometry.drawRange.count,instances:cell.mesh.count,
      cameraPosition:camera.position.toArray(),cameraQuaternion:camera.quaternion.toArray()});
    }
    draw.call(this,...args);
   };
   window.environmentDistance={
    reset(){rows=[];renderer.shadowMap.needsUpdate=true;},forceNear(value){force=value;},
    pose(distance,tangent=0){const camera=owner.camera, angle=.65+tangent, radius=sphere.radius;
     camera.position.set(sphere.center.x+Math.sin(angle)*(distance+radius),sphere.center.y,
      sphere.center.z+Math.cos(angle)*(distance+radius));camera.lookAt(sphere.center);camera.updateMatrixWorld();
     return {position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),radius};},
    report(){const gl=renderer.getContext(),glErrors:number[]=[];
     for(let i=0;i<16;i++){const error=gl.getError();if(error===gl.NO_ERROR)break;glErrors.push(error);}
     return {rows:[...rows],colourTriangles:rows.filter(row=>row.perspective).reduce((sum,row)=>sum+row.count/3*row.instances,0),
      shadowTriangles:rows.filter(row=>!row.perspective).reduce((sum,row)=>sum+row.count/3*row.instances,0),glErrors,
      calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
    restore(){renderer.renderBufferDirect=draw;for(const {mesh,ranges}of cells)mesh.geometry.setDrawRange(ranges.near.start,ranges.near.count);}
   };
   return {id:game.levelPlan.id,pose:game.snapshot().euc,clock:game.populationState().simulation.clockSeconds,
    subject:{cell:subject.mesh.name,instances:subject.mesh.count,centre:sphere.center.toArray(),radius:sphere.radius},
    resources:game.resources(),presentation:owner.presentation()};
  });
  const frames:unknown[]=[],name=`${world.replaceAll('&','-').replaceAll('=','-')}-${quality}`;
  const observedSubjectLevels = new Set<string>();
  let previousPixels:Buffer|null = null;
  for(const [frame,distance]of [58,62,64,66,70,146,149,150,151,154,150,146,70,66,64,62].entries()){
   const evidence=await page.evaluate(({distance,frame})=>{
    const capture=window.environmentDistance;capture.reset();const requested=capture.pose(distance);window.game.renderer.render();
    return {frame,distance,requested,captured:{position:window.game.renderer.camera.position.toArray(),quaternion:window.game.renderer.camera.quaternion.toArray()},report:capture.report()};
   },{distance,frame});
   expect(evidence.captured.position).toEqual(evidence.requested.position);expect(evidence.captured.quaternion).toEqual(evidence.requested.quaternion);
   expect(evidence.report.glErrors).toEqual([]);expect(evidence.report.rows.every(row=>row.level!=='INVALID')).toBe(true);
   expect(evidence.report.rows.filter(row=>!row.perspective).every(row=>row.level==='near')).toBe(true);
   const subjectDraws = evidence.report.rows.filter(row=>row.perspective && row.cell===installed.subject.cell);
   expect(subjectDraws.length, 'the actual subject cell must be submitted in each threshold view').toBeGreaterThan(0);
   for (const draw of subjectDraws) {
    observedSubjectLevels.add(draw.level);
    expect(draw.cameraPosition).toEqual(evidence.requested.position);
    expect(draw.cameraQuaternion).toEqual(evidence.requested.quaternion);
   }
   const pixels = await page.screenshot({path:join(directory,`${name}-boundary-${String(frame).padStart(2,'0')}.png`)});
   if(previousPixels)expect(pixels.equals(previousPixels), 'distinct camera positions must produce fresh canvas pixels').toBe(false);
   previousPixels=pixels;frames.push(evidence);
  }
  expect([...observedSubjectLevels].sort(), 'the actual sweep must exercise all three colour detail ranges').toEqual(['far','middle','near']);
  const ablation=await page.evaluate(()=>{
   const game=window.game,capture=window.environmentDistance,draw=(force:boolean)=>{
    capture.forceNear(force);capture.reset();capture.pose(160);game.renderer.render();return capture.report();};
   const selected=draw(false),allNear=draw(true);capture.forceNear(false);return {selected,allNear};
  });
  expect(ablation.selected.colourTriangles).toBeLessThan(ablation.allNear.colourTriangles);
  expect(ablation.selected.rows.filter(row=>row.perspective).length).toBe(ablation.allNear.rows.filter(row=>row.perspective).length);
  expect(ablation.selected.shadowTriangles).toBe(ablation.allNear.shadowTriangles);
  expect(ablation.selected.glErrors).toEqual([]);expect(ablation.allNear.glErrors).toEqual([]);
  const final=await page.evaluate(()=>{const game=window.game;window.environmentDistance.restore();return {id:game.levelPlan.id,resources:game.resources(),presentation:game.renderer.presentation()};});
  expect(final.id).toBe(installed.id);expect(errors).toEqual([]);
  writeFileSync(join(directory,`${name}.json`),JSON.stringify({world,quality,installed,frames,ablation,ride,final,errors,
   scope:'Actual WebGL buffer submissions, diagnostic same-world forward/reverse threshold camera sweep, all-near colour ablation with unchanged shadows, plus native one-second motion. Not sustained-device or full lifecycle acceptance.'},null,2));
 });
}
