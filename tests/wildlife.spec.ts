/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';
const out=process.env.WILDLIFE_SHOTS??'test-results/wildlife/current';
for(const quality of ['high','ultra','medium','low'] as const)test(`squirrels ${quality}: world, approach and shared views`,async({page})=>{
  test.setTimeout(180000);mkdirSync(out,{recursive:true});const errors=collectErrors(page);
  await page.setViewportSize({width:1280,height:800});
  await bootAtTier(page,'level=generated&seed=euc',quality,{freezeAtStart:true,options:{showFps:false}});
  const site=await page.evaluate(()=>{
    const g=window.game; const loop=g.loop as unknown as {callbacks:{render(alpha:number,synthetic?:boolean):void}};
    const draw=loop.callbacks.render;loop.callbacks.render=(alpha,synthetic)=>{if(synthetic)draw(alpha,synthetic);};
    return g.renderer.presentation()!.squirrels!.sites[0];
  });
  expect(site).toBeTruthy();
  for(const [name,distance,yaw] of [['close',1.5,.6],['oblique',2.5,1.05],['profile',2.5,1.57],['rear',2.5,3.14],['context',6,.8]] as const){
    await page.evaluate(({site,distance,yaw})=>{
      const r=window.game.renderer,c=r.camera;const facing=Math.atan2(site.home.x-site.refuge.x,site.home.z-site.refuge.z);yaw+=facing;
      c.position.set(site.home.x+Math.sin(yaw)*distance,site.home.y+(distance===2.5&&yaw-facing===1.57?.36:.42+distance*.03),site.home.z+Math.cos(yaw)*distance);
      c.lookAt(site.home.x,site.home.y+.24,site.home.z);c.updateMatrixWorld();r.setShadowFocus(site.home.x,site.home.y,site.home.z);r.render();
    },{site,distance,yaw});
    await page.screenshot({path:join(out,`${quality}-${name}.png`)});
  }
  // Same-depth scale reference, with native full-body rider posing.
  await page.evaluate(site=>{const g=window.game;g.placeRider({x:site.home.x+2,y:site.home.y,z:site.home.z},0);g.advance(0);const r=g.renderer,c=r.camera;c.position.set(site.home.x+1,site.home.y+1.2,site.home.z+6);c.lookAt(site.home.x+1,site.home.y+.8,site.home.z);c.updateMatrixWorld();r.render();},site);
  await page.screenshot({path:join(out,`${quality}-scale.png`)});
  const records=[];
  await page.evaluate(site=>{
    const g=window.game,yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z),a=g.renderer.presentation()!.squirrels!.actors[0];
    g.placeRider({x:a.x-Math.sin(yaw)*3,y:site.home.y,z:a.z-Math.cos(yaw)*3},yaw,0,4);g.setActions({throttle:.15});
  },site);
  await page.evaluate(()=>window.game.advance(0));
  await page.screenshot({path:join(out,`${quality}-chase.png`)});
  for(let i=0;i<(quality==='high'?60:12);i++){
    await page.evaluate(quality=>window.game.advance(quality==='high'?4:20),quality);
    if([0,3,6,12,18,24].includes(i))await page.screenshot({path:join(out,`${quality}-chase-approach-${i}.png`)});
    const record=await page.evaluate(({site,i})=>{
      const g=window.game,r=g.renderer,c=r.camera;
      // Follow the complete home-to-trunk motion from a fixed oblique ground view.
      c.position.set(site.home.x+4,site.home.y+1.8,site.home.z+4);
      c.lookAt(site.refuge.x,site.refuge.y+1,site.refuge.z);c.updateMatrixWorld();r.render();
      const gl=r.renderer.getContext();return {i,wildlife:r.presentation()!.squirrels,resources:g.snapshot().resources,gl:gl.getError(),pose:g.snapshot().euc};
    },{site,i});
    expect(record.gl).toBe(0);records.push(record);
    await page.screenshot({path:join(out,`${quality}-motion-${i}.png`)});
  }
  writeFileSync(join(out,`${quality}-approach.json`),JSON.stringify({site,records,errors},null,2));
  expect(records.some(r=>r.wildlife!.actors[0].escaping||r.wildlife!.actors[0].climbing)).toBe(true);
  // Close bark contact and tail clearance, including the side a tree can hide.
  for(const [name,yaw] of [['climb-side',Math.PI/2],['climb-back',Math.PI*.8],['climb-opposite',-Math.PI/2]] as const){
    await page.evaluate(({site,yaw})=>{const r=window.game.renderer,c=r.camera;yaw+=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z);c.position.set(site.refuge.x+Math.sin(yaw)*2,site.refuge.y+2.7,site.refuge.z+Math.cos(yaw)*2);c.lookAt(site.refuge.x,site.refuge.y+2.6,site.refuge.z);c.updateMatrixWorld();r.render();},{site,yaw});
    await page.screenshot({path:join(out,`${quality}-${name}.png`)});
  }
  if(quality==='high'||quality==='ultra'){
    if(quality==='high'){
      // Close motion exposes limb attachment and bark contact that the normal
      // chase-distance sequence cannot resolve. This camera only follows pixels.
      await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+30,y:site.home.y,z:site.home.z+30},0);g.advance(1440);const a=g.renderer.presentation()!.squirrels!.actors[0],yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z);g.placeRider({x:a.x-Math.sin(yaw)*3,y:site.home.y,z:a.z-Math.cos(yaw)*3},yaw,0,4);g.advance(0);},site);
      for(let i=0;i<36;i++){
        await page.evaluate(site=>{const g=window.game;g.advance(4);const r=g.renderer,c=r.camera,a=r.presentation()!.squirrels!.actors[0];const yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z)+Math.PI/2;c.position.set(a.x+Math.sin(yaw)*1.6,a.y+.6,a.z+Math.cos(yaw)*1.6);c.lookAt(a.x,a.y+.25,a.z);c.updateMatrixWorld();r.render();},site);
        await page.screenshot({path:join(out,`high-follow-${i}.png`)});
      }
    }
    if(quality==='high'){
      for(const side of [-1,1]){
        await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+30,y:site.home.y,z:site.home.z+30},0);g.advance(1440);const a=g.renderer.presentation()!.squirrels!.actors[0],yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z);g.placeRider({x:a.x-Math.sin(yaw)*3,y:site.home.y,z:a.z-Math.cos(yaw)*3},yaw,0,4);g.advance(0);},site);
        for(let i=0;i<18;i++){
          await page.evaluate(({site,side})=>{const g=window.game;g.advance(2);const r=g.renderer,c=r.camera,a=r.presentation()!.squirrels!.actors[0];const yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z)+side*Math.PI/2;c.position.set(a.x+Math.sin(yaw)*1.25,a.y+.25,a.z+Math.cos(yaw)*1.25);c.lookAt(a.x,a.y+.25,a.z);c.updateMatrixWorld();r.render();},{site,side});
          await page.screenshot({path:join(out,`high-tangent-${side}-${i}.png`)});
        }
      }
    }
    await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+30,y:site.home.y,z:site.home.z+30},0);},site);
    for(let i=0;i<30;i++){
      await page.evaluate(({site})=>{const g=window.game;g.advance(20);const r=g.renderer,c=r.camera;const yaw=Math.atan2(site.refuge.x-site.home.x,site.refuge.z-site.home.z)+Math.PI/2;c.position.set(site.refuge.x+Math.sin(yaw)*4.5,site.refuge.y+1.7,site.refuge.z+Math.cos(yaw)*4.5);c.lookAt(site.refuge.x,site.refuge.y+1.4,site.refuge.z);c.updateMatrixWorld();r.render();},{site});
      await page.screenshot({path:join(out,`${quality}-return-${i}.png`)});
    }
  }
  const overlap=await page.evaluate(site=>{
    const g=window.game;const a=g.renderer.presentation()!.squirrels!.actors[0];g.placeRider({x:a.x,y:site.home.y,z:a.z},0);g.advance(1);return g.renderer.presentation()!.squirrels;
  },site);expect(overlap!.actors[0].hidden || overlap!.actors[0].y >= site.home.y + 2.4).toBe(true);
  if(quality==='high'){
    await page.evaluate(site=>{
      const g=window.game,r=g.renderer;while(r.viewCount<4)g.spawnRider();
      for(let i=0;i<4;i++)g.placeRider({x:site.home.x+20+i*3,y:site.home.y,z:site.home.z+20},0,i);
      g.advance(720);
      for(let i=0;i<4;i++){const c=r.cameraFor(i),yaw=i*1.5;c.position.set(site.home.x+Math.sin(yaw)*6,site.home.y+2,site.home.z+Math.cos(yaw)*6);c.lookAt(site.home.x,site.home.y+.3,site.home.z);c.updateMatrixWorld();}r.render();
    },site);await page.screenshot({path:join(out,'quad-high.png')});
  }
  if(quality==='medium'){
    await page.evaluate(site=>{const g=window.game;g.clearActions();g.placeRider({x:site.home.x+30,y:site.home.y,z:site.home.z+30},0);g.advance(720);g.placeRider({x:site.home.x+3,y:site.home.y,z:site.home.z+6},Math.PI);g.advance(240);},site);
    // A frozen diagnostic stops normal redraws: resize explicitly before
    // drawing, so an asynchronous resize cannot clear the screenshot to black.
    for(const [name,width,height] of [['portrait',390,844],['landscape',844,390]] as const){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await page.evaluate(site=>{const g=window.game,r=g.renderer;r.resize();g.placeRider({x:site.home.x+3,y:site.home.y,z:site.home.z+6},Math.PI);g.advance(0);r.render();},site);
      await page.screenshot({path:join(out,`phone-${name}-chase.png`)});
      const pixels=await page.evaluate(()=>{const r=window.game.renderer,c=r.camera,a=r.presentation()!.squirrels!.actors[0];r.resize();c.position.set(a.x+1.2,a.y+.8,a.z+1.5);c.lookAt(a.x,a.y+.3,a.z);c.updateMatrixWorld();r.render();const gl=r.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let colour=0;for(let i=0;i<p.length;i+=4)if(p[i]+p[i+1]+p[i+2]>30)colour++;return colour;});
      expect(pixels).toBeGreaterThan(1000);await page.screenshot({path:join(out,`phone-${name}.png`)});
    }
  }
  expect(errors).toEqual([]);writeFileSync(join(out,`${quality}.json`),JSON.stringify({site,records,overlap,errors},null,2));
});
