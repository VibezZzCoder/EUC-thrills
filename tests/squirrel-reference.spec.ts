/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Reference captures use the real game material/light and visible footprint. */
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {bootAtTier,collectErrors} from './harness.ts';
const out=process.env.SQUIRREL_REFERENCE_SHOTS??'test-results/wildlife/reference-current';
test('approved squirrel reference: fixed and off-axis visible footprints',async({page})=>{
 test.setTimeout(120000);mkdirSync(out,{recursive:true});const errors=collectErrors(page);
 await page.setViewportSize({width:1280,height:800});await bootAtTier(page,'level=generated&seed=euc','high',{freezeAtStart:true,options:{showFps:false}});
 const site=await page.evaluate(()=>{const g=window.game,l=g.loop as unknown as {callbacks:{render(alpha:number,synthetic?:boolean):void}};const draw=l.callbacks.render;l.callbacks.render=(a,s)=>{if(s)draw(a,s);};return g.renderer.presentation()!.squirrels!.sites[0];});expect(site).toBeTruthy();
 const frames=[];
 for(const [name,angle] of [['front',0],['hero',.8],['profile',Math.PI/2],['rear',Math.PI],['other',-Math.PI/2]] as const){
  const state=await page.evaluate(({site,angle,name})=>{const r=window.game.renderer,c=r.camera,yaw=Math.atan2(site.home.x-site.refuge.x,site.home.z-site.refuge.z)+angle;
   const distance=name==='rear'?1.2:6;c.position.set(site.home.x+Math.sin(yaw)*distance,site.home.y+.31+.05*distance/6,site.home.z+Math.cos(yaw)*distance);c.lookAt(site.home.x,site.home.y+.31,site.home.z);c.zoom=3.75*distance/6;c.updateProjectionMatrix();c.updateMatrixWorld();r.setShadowFocus(site.home.x,site.home.y,site.home.z);r.render();
   const gl=r.renderer.getContext(),vertices=c.position.clone();const bounds={minX:gl.drawingBufferWidth,maxX:0,minY:gl.drawingBufferHeight,maxY:0};
   for(const x of [-.6,.6])for(const y of [-.01,.85])for(const z of [-.6,.6]){vertices.set(site.home.x+x,site.home.y+y,site.home.z+z).project(c);const px=(vertices.x*.5+.5)*gl.drawingBufferWidth,py=(-vertices.y*.5+.5)*gl.drawingBufferHeight;bounds.minX=Math.min(bounds.minX,px);bounds.maxX=Math.max(bounds.maxX,px);bounds.minY=Math.min(bounds.minY,py);bounds.maxY=Math.max(bounds.maxY,py);}
   const owner=(r as unknown as {squirrels:{group:{visible:boolean}}}).squirrels;
   const mesh=owner.group as unknown as {children:{geometry:{userData:{squirrelParts:unknown[]};attributes:Record<string,{array:{byteLength:number}}>}}[]};
   return {bounds,wildlife:r.presentation()!.squirrels,resources:window.game.snapshot().resources,parts:mesh.children[0].geometry.userData.squirrelParts,gl:gl.getError()};
  },{site,angle,name});expect(state.gl).toBe(0);
  await page.screenshot({path:join(out,`${name}.png`)});
  await page.evaluate(()=>{const r=window.game.renderer;(r as unknown as {squirrels:{group:{visible:boolean}}}).squirrels.group.visible=false;r.render();});
  await page.screenshot({path:join(out,`${name}-without.png`)});
  await page.evaluate(()=>{const r=window.game.renderer;(r as unknown as {squirrels:{group:{visible:boolean}}}).squirrels.group.visible=true;r.render();});
  frames.push({name,angle,...state});
 }
 expect(errors).toEqual([]);writeFileSync(join(out,'captures.json'),JSON.stringify({site,frames,errors,scope:'Existing world shading and renderer, visible-footprint differences; no altered lighting or imported model.'},null,2));
});
