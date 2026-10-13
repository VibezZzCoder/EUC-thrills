/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** A bounded instanced cosmetic family. One colour draw, zero textures/shadow
 * draws; the same allocation survives every pane. No runtime asset loader. */
import * as THREE from 'three';
import { WILDLIFE as W } from '../data/tuning.ts';
import type { PresentationCost } from './presentation.ts';
import type { SupplementCount } from './populationPrice.ts';
import { squirrelState, updateSquirrel, type SquirrelSite, type WildlifeRider } from './wildlifePlan.ts';
import { compactVisibleInstances } from './instanceVisibility.ts';
import { createSquirrelGeometry, SQUIRREL_MODEL_PRICE, squirrelShader } from './squirrelModel.ts';
export function countSquirrels(sites: readonly SquirrelSite[]): SupplementCount {
  return { colourDraws: sites.length ? 1 : 0, shadowDraws: 0,
    colourTriangles: sites.length * SQUIRREL_MODEL_PRICE.triangles, shadowTriangles: 0,
    // Shared P/N/C + analytic joint/eye attributes. No UV/map allocation.
    geometryBytes: sites.length ? SQUIRREL_MODEL_PRICE.geometryBytes : 0,
    instanceBytes: sites.length * 76, textureBytes: 0 };
}
/** Additive runtime accounting after recipe selection: wildlife must never
 * downgrade established terrain/vegetation to buy its own small draw. */
export function withSquirrelCost<T extends Pick<PresentationCost, 'drawCalls' | 'triangles' | 'colourTriangles' | 'frame'>>(cost: T, sites: readonly SquirrelSite[]): T {
  const p=countSquirrels(sites);
  const frame=(old:{drawCalls:number;triangles:number},panes:number)=>({drawCalls:old.drawCalls+p.colourDraws*panes,triangles:old.triangles+p.colourTriangles*panes});
  return {...cost,drawCalls:cost.drawCalls+p.colourDraws,triangles:cost.triangles+p.colourTriangles,
    colourTriangles:cost.colourTriangles+p.colourTriangles,
    frame:{solo:frame(cost.frame.solo,1),split:frame(cost.frame.split,2),quad:frame(cost.frame.quad,4)}};
}
export interface SquirrelsReport {
  readonly squirrels: number; readonly drawCalls: number; readonly colourTriangles: number;
  readonly geometryBytes: number; readonly instanceBytes: number;
  readonly sites: readonly SquirrelSite[];
  readonly actors: readonly { x: number; y: number; z: number; hidden: boolean; climbing: boolean; running: boolean; escaping:boolean }[];
}
export interface Squirrels {
  readonly group: THREE.Group;
  update(seconds: number, reduced: boolean, riders: readonly WildlifeRider[]): void;
  prepareView(camera: THREE.Camera, panes: number): void;
  restoreView(): void;
  report(): SquirrelsReport;
  dispose(): void;
}
export function createSquirrels(sites: readonly SquirrelSite[]): Squirrels {
  const group = new THREE.Group(); group.name='world-squirrels';
  const states = sites.map(squirrelState);
  const geometry = sites.length ? createSquirrelGeometry() : null;
  const material = geometry ? new THREE.MeshStandardMaterial({ vertexColors:true,roughness:1,metalness:0 }) : null;
  const mesh = geometry && material ? new THREE.InstancedMesh(geometry,material,sites.length) : null;
  if (mesh) { mesh.name='world-squirrels-batch'; mesh.castShadow=false; mesh.receiveShadow=true;
    mesh.frustumCulled=false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh); }
  const visible=new Uint8Array(sites.length),runAmounts=new Float32Array(sites.length);
  const stateAttribute=geometry?new THREE.InstancedBufferAttribute(new Float32Array(sites.length*3),3):null;
  if(geometry&&stateAttribute){geometry.setAttribute('wildlifeState',stateAttribute);stateAttribute.setUsage(THREE.DynamicDrawUsage);}
  const clock={value:0},reducedUniform={value:false};if(material)squirrelShader(material,clock,reducedUniform);
  const slots=sites.map((_,id)=>({id,index:id,visibleForView:true}));
  const matrix=new THREE.Matrix4(), position=new THREE.Vector3(), quaternion=new THREE.Quaternion(), scale=new THREE.Vector3();
  const up=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3();
  const clip=new THREE.Matrix4(), frustum=new THREE.Frustum(), sphere=new THREE.Sphere();
  let last=NaN, lastPose=NaN, lastReduced=false, disposed=false;
  const writeStates=():void=>{
    if(!stateAttribute)return;
    for(const slot of slots){const at=slot.index*3,state=states[slot.id];stateAttribute.array[at]=runAmounts[slot.id];stateAttribute.array[at+1]=Math.min(1,state.climb/.25);stateAttribute.array[at+2]=sites[slot.id].phase+(state.climb>0&&state.climb<W.climbMetres?100:0);}
    stateAttribute.needsUpdate=true;
  };
  const write=(seconds:number,reduced:boolean):void=>{
    if(!mesh)return;clock.value=seconds;reducedUniform.value=reduced;
    for(const slot of slots){const state=states[slot.id];position.set(state.x,state.hidden?-10000:state.y,state.z);
      const ground=Math.max(0,1-state.climb/.25),n=state.groundNormal;
      up.set(n.x*ground,1+(n.y-1)*ground,n.z*ground).normalize();
      forward.set(Math.sin(state.headingY),0,Math.cos(state.headingY)).projectOnPlane(up).normalize();
      right.crossVectors(up,forward);matrix.makeBasis(right,up,forward);quaternion.setFromRotationMatrix(matrix);
      scale.set(1,1,1);matrix.compose(position,quaternion,scale);mesh.setMatrixAt(slot.index,matrix);}
    mesh.instanceMatrix.needsUpdate=true;writeStates();
  };
  write(0,false);
  return { group,
    update(seconds,reduced,riders) {
      if (disposed || !mesh) return;
      // Distant resting animals keep their small resident allocation without
      // animation writes. Resume beyond every normal wildlife draw distance.
      if(riders.length && !sites.some(site=>riders.some(r=>Math.hypot(r.x-site.home.x,r.z-site.home.z)<W.viewMetres+10))
        && states.every(s=>s.progress===0&&s.climb===0&&!s.hidden)) { last=seconds;return; }
      const dt=Number.isFinite(last) ? Math.max(0,seconds-last) : 0;
      // State/avoidance stays current even when all panes look elsewhere.
      // No camera changes the animal's logical position or rider physics.
      for(let i=0;i<sites.length;i++){
        updateSquirrel(sites[i],states[i],seconds,dt,riders);
        const target=states[i].running?1:0;runAmounts[i]+=(target-runAmounts[i])*(1-Math.exp(-dt*20));
      }
      last=seconds;
      if (seconds===lastPose && reduced===lastReduced && !states.some(s=>s.hidden)) return;
      // Bound idle animation writes; evasions always refresh immediately.
      if (reduced===lastReduced && seconds-lastPose<1/W.animationHz && !states.some(s=>s.running||s.hidden||s.climb>0)) return;
      write(seconds,reduced); lastPose=seconds; lastReduced=reduced;
    },
    prepareView(camera,panes) {
      if (!mesh || disposed) return;
      camera.updateMatrixWorld(); clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); frustum.setFromProjectionMatrix(clip);
      const eye=camera.matrixWorld.elements, reach=panes>=3?W.sharedViewMetres:W.viewMetres;
      for (let id=0;id<states.length;id++) {
        const state=states[id]; sphere.center.set(state.x,state.y+.25,state.z); sphere.radius=.9;
        visible[id]=!state.hidden && Math.hypot(state.x-eye[12],state.z-eye[14])<reach && frustum.intersectsSphere(sphere)?1:0;
      }
      for(const slot of slots)slot.visibleForView=visible[slot.id]===1;
      compactVisibleInstances(mesh,slots);writeStates();
    },
    restoreView() { if (mesh) mesh.count=slots.length; },
    report() { const price=countSquirrels(sites); return { squirrels:sites.length,drawCalls:price.colourDraws,
      colourTriangles:price.colourTriangles,geometryBytes:price.geometryBytes,instanceBytes:price.instanceBytes,sites,
      actors:states.map(s=>({x:s.x,y:s.y,z:s.z,hidden:s.hidden,climbing:s.climb>0,running:s.running,escaping:s.escaping})) }; },
    dispose() { if(disposed)return; disposed=true; group.removeFromParent(); mesh?.dispose(); geometry?.dispose(); material?.dispose(); group.clear(); },
  };
}
