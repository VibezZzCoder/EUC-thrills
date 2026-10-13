/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Approved Image Gen target reconstructed as closed continuous lofts.
 * Metres, +Y up, +Z muzzle. No image is loaded; colours are authored sRGB.
 * Stable semantic ranges survive one merged instanced draw. */
import * as THREE from 'three';
const COAT=0x887e72, CREAM=0xc7b899, TAIL=0x9c8164, EAR=0x956f5b, DARK=0x35332e;
type Ring=readonly [number,number,number,number]; // y,z, lateral radius, sagittal radius
export interface SquirrelPartRange { name:string; start:number; count:number; joint:number }
interface ModelData { positions:Float32Array; normals:Float32Array; colours:Float32Array; joints:Float32Array; eyes:Float32Array; indices:Uint16Array; parts:readonly SquirrelPartRange[] }
function sculpt():ModelData {
  const positions:number[]=[],indices:number[]=[],colours:number[]=[],joints:number[]=[],eyes:number[]=[],parts:SquirrelPartRange[]=[];
  function vertex(x:number,y:number,z:number,hex:number,joint:number,eye=0):number {
    const id=positions.length/3,c=new THREE.Color(hex);positions.push(x,y,z);colours.push(c.r,c.g,c.b);joints.push(joint);eyes.push(eye);return id;
  }
  function loft(name:string,rings:readonly Ring[],x:number,joint:number,colour:number,sectors=10,cream=false,eye=0,frames?:Readonly<Record<number,readonly [number,number]>>):void {
    const start=indices.length,base=positions.length/3;
    for(let i=0;i<rings.length;i++) {
      const [y,z,rx,rz]=rings[i],a=rings[Math.max(0,i-1)],b=rings[Math.min(rings.length-1,i+1)];
      const direction=frames?.[i]??[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...direction)||1,ty=direction[0]/length,tz=direction[1]/length;
      for(let j=0;j<sectors;j++) {
        const theta=j*Math.PI*2/sectors,front=Math.sin(theta);
        const vy=y-tz*front*rz,vz=z+ty*front*rz;
        vertex(x+Math.cos(theta)*rx,vy,vz,cream&&((name==='body'&&front>(z>.14?.25:.55))||(name==='head-muzzle'&&front>-.55&&z>.267)||(name==='head-muzzle'&&front>.45&&z>.241))?CREAM:colour,joint,eye);
      }
    }
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<sectors;j++) {
      const a=base+i*sectors+j,b=a+sectors,c=base+(i+1)*sectors+(j+1)%sectors,d=base+i*sectors+(j+1)%sectors;
      indices.push(a,b,c,a,c,d);
    }
    const bottom=vertex(x,rings[0][0],rings[0][1],colour,joint,eye),top=vertex(x,rings.at(-1)![0],rings.at(-1)![1],colour,joint,eye);
    for(let j=0;j<sectors;j++){indices.push(bottom,base+j,base+(j+1)%sectors);const at=base+(rings.length-1)*sectors;indices.push(top,at+(j+1)%sectors,at+j);}
    parts.push({name,start,count:indices.length-start,joint});
  }
  function ellipsoid(name:string,x:number,y:number,z:number,rx:number,ry:number,rz:number,joint:number,hex:number,eye=0,sectors=6,rows=3):void {
    loft(name,Array.from({length:rows},(_,i)=>{const t=-.8+1.6*i/(rows-1);return [y+ry*t,z,rx*Math.sqrt(1-t*t),rz*Math.sqrt(1-t*t)] as Ring;}),x,joint,hex,sectors,false,eye);
  }
  // Transverse sections keep the back/cream belly anatomically aligned even
  // where the spine curves: a tangent sweep here turns the chest into a sleeve.
  const transverse=(count:number)=>Object.fromEntries(Array.from({length:count},(_,i)=>[i,[0,1] as const]));
  loft('body',[[.137,-.114,.028,.047],[.140,-.090,.060,.063],[.165,-.052,.084,.080],[.185,.012,.090,.095],[.190,.078,.080,.092],[.213,.175,.058,.056],[.253,.210,.039,.064],[.284,.227,.022,.040]],0,0,COAT,12,true,0,transverse(8));
  loft('head-muzzle',[[.278,.164,.025,.017],[.302,.178,.043,.051],[.306,.212,.055,.053],[.291,.248,.046,.041],[.288,.270,.033,.037],[.267,.295,.024,.020],[.269,.312,.008,.008]],0,1,COAT,12,true,0,transverse(7));
  for(const side of [-1,1]) {
    const fore=side<0?2:3,hind=side<0?4:5,sideName=side<0?'right':'left';
    // The buried shoulder flows through elbow/wrist into its own grounded paw.
    loft(`foreleg-${sideName}`,[[.219,.128,.019,.030],[.178,.135,.031,.037],[.116,.145,.025,.030],[.042,.133,.014,.016],[.013,.168,.022,.012],[.012,.199,.007,.011]],side*.052,fore,COAT,8,false,0,{4:[0,1],5:[0,1]});
    // An integrated oval haunch narrows at the hock and projects into a long
    // flattened hind foot. The top two rings are genuinely buried in the rump.
    loft(`hindleg-${sideName}`,[[.198,-.015,.025,.030],[.145,-.019,.058,.058],[.098,-.034,.066,.068],[.048,-.047,.039,.030],[.018,-.030,.035,.068],[.007,-.023,.030,.061],[.002,-.024,.013,.052]],side*.065,hind,COAT,8,false,0,Object.fromEntries(Array.from({length:7},(_,i)=>[i,[-1,0] as const])));
    const start=indices.length,base=positions.length/3,x=side*.039;
    // Broad leaf base, curved-looking tapered rim; no narrow upright rods.
    const outline=[[-.020,.329],[-.022,.370],[.001,.420],[.020,.374],[.019,.331]];
    for(const depth of [0,1])for(const [dx,y] of outline){const thickness=y>.41?.002:y>.35?.032:.020;vertex(x+dx,y,.211-(y-.329)*.24+(depth-.5)*thickness,depth?EAR:COAT,1);}
    // Same five-point silhouette on each face, opposite winding on the back.
    indices.push(base,base+2,base+1,base,base+3,base+2,base,base+4,base+3,
      base+5,base+6,base+7,base+5,base+7,base+8,base+5,base+8,base+9);
    for(let i=0;i<5;i++){const next=(i+1)%5;indices.push(base+i,base+next,base+next+5,base+i,base+next+5,base+i+5);}
    for(let i=start;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    parts.push({name:`ear-${sideName}`,start,count:indices.length-start,joint:1});
    ellipsoid(`eye-${sideName}`,side*.052,.305,.249,.011,.014,.014,1,DARK,1,8,3);
  }
  ellipsoid('nose',0,.270,.314,.010,.008,.008,1,DARK,1,4);
  loft('mouth-line',[[.256,.286,.014,.001],[.258,.303,.010,.001]],0,1,DARK,3,false,0,transverse(2));
  // Root is embedded in the upper rear pelvis. Every exposed section moves
  // rearward/upward first; the previous downward hook is deliberately absent.
  // Smooth centreline sampling allocates detail to the plume rather than toes.
  // Paired profile contours, rather than a tube on an S centreline. The
  // plume is a broad solid fur mass; a tube wider than its own bend radius
  // necessarily folds on the inside. Both boundaries follow the approved
  // image, with the owner-requested rear-pelvis origin kept above the belly.
  const outer=[[.139,-.098],[.167,-.111],[.193,-.109],[.227,-.095],[.270,-.065],[.328,-.027],[.397,-.007],[.468,-.010],[.535,-.043],[.574,-.096],[.585,-.171],[.557,-.246],[.502,-.299],[.4034,-.3175]];
  const inner=[[.097,-.102],[.115,-.150],[.114,-.203],[.136,-.247],[.191,-.263],[.256,-.244],[.324,-.206],[.387,-.171],[.417,-.171],[.426,-.210],[.419,-.263],[.409,-.299],[.404,-.304],[.4026,-.3095]];
  const widths=[.022,.035,.048,.054,.061,.070,.081,.088,.095,.098,.094,.081,.051,.004];
  const edge=(values:number[][])=>new THREE.CatmullRomCurve3(values.map(([y,z])=>new THREE.Vector3(0,y,z)),false,'centripetal');
  const outside=edge(outer),inside=edge(inner),start=indices.length,base=positions.length/3,sectors=8,rows=18;
  const caps:THREE.Vector3[]=[];
  for(let i=0;i<rows;i++){
    const t=i/(rows-1),a=outside.getPoint(t),b=inside.getPoint(t),centre=a.clone().add(b).multiplyScalar(.5),at=t*(widths.length-1),low=Math.min(widths.length-2,Math.floor(at)),rx=THREE.MathUtils.lerp(widths[low],widths[low+1],at-low);
    if(i===0||i===rows-1)caps.push(centre);
    for(let j=0;j<sectors;j++){const theta=j*Math.PI*2/sectors,amount=Math.sin(theta);vertex(Math.cos(theta)*rx,centre.y+(a.y-b.y)*.5*amount,centre.z+(a.z-b.z)*.5*amount,TAIL,6);}
  }
  for(let i=0;i<rows-1;i++)for(let j=0;j<sectors;j++){const a=base+i*sectors+j,b=a+sectors,c=base+(i+1)*sectors+(j+1)%sectors,d=base+i*sectors+(j+1)%sectors;indices.push(a,b,c,a,c,d);}
  const bottom=vertex(0,caps[0].y,caps[0].z,TAIL,6),top=vertex(0,caps[1].y,caps[1].z,TAIL,6);
  for(let j=0;j<sectors;j++){indices.push(bottom,base+j,base+(j+1)%sectors);const at=base+(rows-1)*sectors;indices.push(top,at+(j+1)%sectors,at+j);}
  parts.push({name:'tail',start,count:indices.length-start,joint:6});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=new Float32Array(geometry.getAttribute('normal').array);geometry.dispose();
  return {positions:new Float32Array(positions),normals,colours:new Float32Array(colours),joints:new Float32Array(joints),eyes:new Float32Array(eyes),indices:new Uint16Array(indices),parts};
}
const DATA=sculpt();
export const SQUIRREL_MODEL_PRICE=Object.freeze({triangles:DATA.indices.length/3,
  geometryBytes:DATA.positions.byteLength+DATA.normals.byteLength+DATA.colours.byteLength+DATA.joints.byteLength+DATA.eyes.byteLength+DATA.indices.byteLength});
export function createSquirrelGeometry():THREE.BufferGeometry {
  const geometry=new THREE.BufferGeometry();
  for(const [name,array,size] of [['position',DATA.positions,3],['normal',DATA.normals,3],['color',DATA.colours,3],['wildlifeJoint',DATA.joints,1],['wildlifeEye',DATA.eyes,1]] as const)
    geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
  geometry.setIndex(new THREE.BufferAttribute(DATA.indices,1));
  geometry.userData.squirrelParts=DATA.parts;geometry.computeBoundingSphere();return geometry;
}
/** Per-material hooks only; no THREE.ShaderChunk mutation or sampler. */
export function squirrelShader(material:THREE.MeshStandardMaterial,clock:{value:number},reduced:{value:boolean}):void {
  material.customProgramCacheKey=()=> 'euc-squirrel-approved-target-v6-contours';
  material.onBeforeCompile=shader=>{
    shader.uniforms.wildlifeClock=clock;shader.uniforms.wildlifeReduced=reduced;
    const anchors=['#include <common>','#include <beginnormal_vertex>','#include <begin_vertex>'];
    for(const anchor of anchors)if(!shader.vertexShader.includes(anchor))throw new Error(`Squirrel shader anchor missing: ${anchor}`);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float wildlifeJoint;
attribute float wildlifeEye;
attribute vec3 wildlifeState;
uniform float wildlifeClock;
uniform bool wildlifeReduced;
varying float squirrelEye;
vec3 squirrelRotate(vec3 v,vec3 pivot,float angle){float c=cos(angle),s=sin(angle);vec3 p=v-pivot;return pivot+vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
vec3 squirrelPose(vec3 p){
 float run=wildlifeState.x,grip=wildlifeState.y;
 float beat=wildlifeReduced?0.0:sin(wildlifeClock*25.0+mod(wildlifeState.z,100.0));
 float j=wildlifeJoint;
 // Running flattens the upper body coherently; lower limb deformation has
 // zero weight at each buried joint. Climbing rotates the entire anatomy,
 // rather than stretching a shin or foot away from its haunch.
 float activeRun=run*(1.0-grip);
 float upper=smoothstep(.05,.25,p.y);
 if(j<1.5){p.y-=activeRun*.075*upper;p.z+=activeRun*.030*upper;}
 else if(j<5.5){
   bool fore=j<3.5;float rootY=fore?.219:.198;
   float limb=1.0-smoothstep(.025,rootY,p.y);
   float stroke=beat*(fore?1.0:-1.0);
   p.z+=activeRun*stroke*.045*limb;
   if(j<2.5)p.z+=.022*limb*(1.0-grip);
   p.y+=activeRun*max(0.0,-stroke)*.028*limb-activeRun*.070*(1.0-limb);
   // A short alternating bark step keeps all paws near the same contact plane.
   p.z+=grip*stroke*.016*limb*step(100.0,wildlifeState.z);
 }
 else {
   p=squirrelRotate(p,vec3(0.,.118,-.100),-activeRun*.38+activeRun*beat*.07);
   p.x+=wildlifeReduced?0.0:sin(wildlifeClock*1.3+mod(wildlifeState.z,100.0))*.006;
 }
 // Fold close to the bark without lengthening any limb; sole heights stay
 // fixed while shoulder/hip depth compresses into a crouched climbing stance.
 p.y=mix(p.y,.012+(p.y-.012)*.62,grip);
 p=squirrelRotate(p,vec3(0.,.13,.02),-grip*1.57079632679);
 p.z+=grip*.15;
 p.y+=abs(beat)*.045*activeRun;return p;
}`);
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
// Pose the local normal by a finite directional derivative of the same owner.
vec3 squirrelBase=squirrelPose(position);
objectNormal=normalize(squirrelPose(position+objectNormal*.001)-squirrelBase);
`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
transformed=squirrelPose(transformed);squirrelEye=wildlifeEye;`);
    if(!shader.fragmentShader.includes('#include <roughnessmap_fragment>'))throw new Error('Squirrel roughness anchor missing');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float squirrelEye;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.25,squirrelEye);');
  };
}
