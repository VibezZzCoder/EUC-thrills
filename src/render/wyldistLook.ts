/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS as C } from '../data/tuning.ts';
import {
  loftGeometry, loftNormal, loftPoint, loftProfile, mergeGeometries, patchGeometry,
  tintOver, vAtHeight, type LoftProfile,
} from './blockoutKit.ts';
import {
  WYLDIST_REGIONS, createWyldistAtlas, wyldistOpeningHalfWidth,
  type WyldistSheetLayout,
} from './wyldistAtlas.ts';
import type { RiderLook, RiderMaterialSpec } from './riderLook.ts';
import {
  WYLDIST_HELMET, WYLDIST_HELMET_SHEET, WYLDIST_NECK as NECK, wyldistFace, wyldistHelmetLining,
  wyldistHelmetShell,
} from './wyldistHelmet.ts';

export { WYLDIST_HELMET, wyldistFace, wyldistHelmetShell };

// M41: the chosen outfit on the existing riding skeleton. Cloth, face and
// helmet share physical landmarks with the painter; no photograph is loaded.
const profile = (rows: readonly (readonly number[])[], square = 2.3): LoftProfile => loftProfile(
  rows.map(([y, halfWidth, halfDepth, z = 0, x = 0]) => ({
    y: y!, halfWidth: halfWidth!, halfDepth: halfDepth!, z, x, square,
  })),
);
const ease=(t:number)=>{const c=Math.max(0,Math.min(1,t));return c*c*(3-2*c);};
// Round C1 → C2: a relaxed straight box. The hem sits on the upper hip (7 cm
// higher than r0), the waist pinch is gone, the back no longer tents behind
// the shoulder blades, and the top rings stand as the collar's band around
// the neck. The lowest ring is the hem's tucked edge, painted inside-fabric.
export const WYLDIST_TORSO = profile([
  [-.008,.202,.122,.024],[-.002,.206,.126,.024],
  [.040,.197,.126,.017],[.100,.186,.126,.011],[.160,.176,.124,.008],
  [.220,.170,.122,.006],[.280,.168,.123,.007],[.330,.169,.130,.010],
  [.375,.173,.138,.012],[.415,.177,.136,.010],[.450,.179,.128,.005],
  [.480,.178,.115],[.505,.164,.100],[.526,.138,.090,-.003],
  [.546,.108,.078,-.005],[.560,.087,.069,-.006],[.570,.077,.062,-.006],
]);
// One seat under the hem (C5): as wide as the hem where it leaves it, so the
// trousers never notch in under the shirt, then a rounded taper into the
// thighs, which take over below it. Its back stays inside the hem's line and
// it closes in a rounded point, so no flat underside, shelf or bustle shows
// from the side, and the crotch from the front is a V of converging cloth.
// The crotch is 22 mm higher than r0 (the hip-dome floor allows Cool Rider's
// hem −25 mm at most).
const SEAT = profile([[-.140,.010,.008,.004],[-.132,.060,.036,.004],[-.118,.124,.062,.004],[-.092,.178,.082,.004],
  [-.062,.194,.092,.004],[-.030,.194,.096,.004],[0,.196,.098,.006],[.030,.190,.100,.008]],2.6);
export const WYLDIST_HIP_DOME_APEX = .115;
// Loose cargos: wider, deeper thighs biased outboard by the painter, a knee
// balloon, two stacked folds and an elastic cuff pinched over the shoe.
// C4 silhouette: the cargo narrows at the hip under the hem, balloons at and
// above the knee (the leg envelope allows it), then gathers into a stacked
// jogger cuff high enough that the chunky shoe stands clear below it.
const THIGH = profile([
  [-.400,.108,.098],[-.372,.110,.098,.004],[-.330,.106,.097,.006],
  [-.280,.098,.095,.004],[-.230,.090,.092,.004],[-.150,.084,.088,.002],
  [-.070,.080,.086],[0,.078,.084],[.030,.074,.068],
  [.062,.064,.054],[.087,.048,.042],[.105,.028,.024],[WYLDIST_HIP_DOME_APEX,0,0],
],2.3);
// The leg below the cuff tucks inside the high-top's padded collar, so the
// elastic cuff (three stacked rings) sits on the collar and about 0.10 H of
// chunky sneaker stands clear beneath it from every side.
const SHIN = profile([[-.382,.034,.040],[-.275,.050,.054],[-.265,.056,.060],[-.255,.060,.064],
  [-.243,.068,.070],[-.232,.064,.066],[-.220,.072,.073],[-.207,.068,.070],[-.192,.080,.080],
  [-.170,.090,.088,.004],[-.110,.100,.095,.002],[-.050,.106,.098],[0,.108,.098]],2.3);
/** The r0 leg: the inboard knee and calf never grow past it beside the wheel. */
const R0_THIGH = profile([[-.400,.071,.070],[-.368,.074,.073],[-.330,.081,.080,.002],
  [-.275,.078,.079,-.001],[-.225,.084,.084],[-.145,.085,.089,.002],[-.070,.086,.091],[0,.085,.090]],2.3);
const R0_SHIN = profile([[-.382,.046,.050],[-.361,.050,.053],[-.348,.061,.062,.001],
  [-.317,.066,.065,-.001],[-.286,.060,.062,.002],[-.248,.070,.070],
  [-.205,.072,.075,-.001],[-.152,.070,.075],[-.100,.060,.066,.001],
  [-.055,.068,.070],[0,.071,.070]],2.3);
// Lean-muscular arms: the biceps belly deeper than wide and forward, a
// forearm swell below the elbow, then a flattened wrist at 0.6 of it.
const UPPER_ARM = profile([[-.280,.041,.043],[-.262,.043,.046],[-.235,.045,.050,.003],
  [-.200,.047,.053,.005],[-.160,.049,.055,.005],[-.110,.052,.056,.003],[-.060,.053,.054],
  [-.025,.050,.050],[.003,.036,.034],[.010,.012,.012]]);
const FOREARM = profile([[-.265,.029,.022],[-.245,.029,.022],[-.215,.031,.025],
  [-.170,.039,.032,.002],[-.120,.046,.039,.003],[-.070,.049,.044,.004],
  [-.030,.046,.045,.002],[0,.041,.043]]);
// A straight loose tube from a dropped, deflated cap. The lowest ring is the
// tucked hem edge; its band of the page is the dark inside fabric.
// C6: the hem grips the arm (1.6 mm off the skin) and its turned-in edge is
// buried in the arm, so a raised arm never shows what is behind the sleeve
// through the ring; the tube tapers gently to it instead of standing as a drum.
export const WYLDIST_SLEEVE = profile([[-.197,.0455,.0515,.005],[-.192,.0490,.0550,.0045],
  [-.150,.0540,.0595,.004],[-.100,.0570,.0605,.002],[-.055,.0585,.0595],[-.018,.0565,.0540],
  [.003,.046,.042],[.011,.030,.028],[.016,.012,.012]],2.3);
const SLEEVE_SEGMENTS=28;
const SLEEVE_HEM = -.192;
// The camp collar's landmarks, shared by its geometry and the painted shadows.
// The collar's top edge runs from the stand at the back (.570) down to the
// front notch (.505) beside the throat, so a short thick neck shows under the
// chin bar from the front and side while the back still meets the helmet rim.
const COLLAR_TOP=.570, COLLAR_BACK=.540, NOTCH=.505, REVER_FROM=.310, REVER_CORNER=.462, REVER_REACH=.126;
export const WYLDIST_SHEET: WyldistSheetLayout = Object.freeze({
  ...WYLDIST_HELMET_SHEET, torso: WYLDIST_TORSO, upperArm: WYLDIST_SLEEVE, sleeveHem: SLEEVE_HEM, shirtHem: -.002,
  opening: { from: REVER_FROM, to: NOTCH, halfWidth: .066, curve: 1.2, throat: .090 },
  rever: { corner: REVER_CORNER, reach: REVER_REACH }, collarBack: COLLAR_BACK,
});

/** Bisect for the angle on the front of a torso ring where |x| = target. */
function angleAtX(y:number,target:number,side:number):number {
  const v=vAtHeight(WYLDIST_TORSO,y), p=new THREE.Vector3(); let low=0,high=Math.PI/2;
  for(let k=0;k<24;k++) { const mid=(low+high)/2; loftPoint(WYLDIST_TORSO,Math.PI/2-side*mid,v,p); if(Math.abs(p.x)<target)low=mid;else high=mid; }
  return Math.PI/2-side*(low+high)/2;
}

/**
 * One cloth flap lying on the shirt: a lifted outer face over a grid of torso
 * (u, v) points, and rims closing each long edge down into the body. Smooth
 * normals come from the loft, so two mirrored halves shade as one piece.
 * `sample` folds a (u, v) onto the uncut print rather than the chest V.
 */
function flap(grid:readonly (readonly {u:number;v:number;lift:number}[])[],sample:(u:number,v:number)=>[number,number],
  rimShade:number,faceShade:number):THREE.BufferGeometry {
  const positions:number[]=[],normals:number[]=[],colours:number[]=[],uv:number[]=[],index:number[]=[];
  const p=new THREE.Vector3(),n=new THREE.Vector3();
  const vertex=(u:number,v:number,lift:number,shade:number,normal?:THREE.Vector3):number=> {
    loftPoint(WYLDIST_TORSO,u,v,p);loftNormal(WYLDIST_TORSO,u,v,n);
    positions.push(p.x+n.x*lift,p.y+n.y*lift,p.z+n.z*lift);
    const out=normal??n;normals.push(out.x,out.y,out.z);colours.push(shade,shade,shade);
    uv.push(...sample(u,v));return positions.length/3-1;
  };
  const rows=grid.length,cols=grid[0]!.length;
  const at:number[][]=grid.map(row=>row.map(q=>vertex(q.u,q.v,q.lift,faceShade)));
  const face=(a:number,b:number,c:number,ref:THREE.Vector3)=> {
    const pa=new THREE.Vector3().fromArray(positions,a*3),pb=new THREE.Vector3().fromArray(positions,b*3),pc=new THREE.Vector3().fromArray(positions,c*3);
    const fn=pb.sub(pa).cross(pc.sub(pa));
    if(fn.dot(ref)>=0)index.push(a,b,c);else index.push(a,c,b);
  };
  const centre=new THREE.Vector3();
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++) {
    const q=grid[r]![c]!;loftNormal(WYLDIST_TORSO,q.u,q.v,centre);
    face(at[r]![c]!,at[r+1]![c]!,at[r+1]![c+1]!,centre);face(at[r]![c]!,at[r+1]![c+1]!,at[r]![c+1]!,centre);
  }
  // Rims on both long edges: from the lifted edge down below the shirt.
  for(const c of [0,cols-1]) for(let r=0;r<rows-1;r++) {
    const a=grid[r]![c]!,b=grid[r+1]![c]!,inward=grid[r]![c===0?1:cols-2]!;
    const pa=loftPoint(WYLDIST_TORSO,a.u,a.v,new THREE.Vector3()),pb=loftPoint(WYLDIST_TORSO,b.u,b.v,new THREE.Vector3());
    const pi=loftPoint(WYLDIST_TORSO,inward.u,inward.v,new THREE.Vector3());
    const out=pa.clone().add(pb).multiplyScalar(.5).sub(pi);
    if(out.lengthSq()<1e-10)continue;
    out.normalize();
    // Lit with the panel's own normal: a sideways edge normal caught the sun
    // while the panel sat in shade and read as neon piping.
    const i0=vertex(a.u,a.v,a.lift,rimShade),i1=vertex(b.u,b.v,b.lift,rimShade);
    const i2=vertex(b.u,b.v,-.003,rimShade),i3=vertex(a.u,a.v,-.003,rimShade);
    // An edge is a solid binding: print sampled across a 6 mm wall smeared
    // into a barcode. These texels land on the plain field swatch.
    for(const k of [i0,i1,i2,i3])uv.splice(k*2,2,...BINDING);
    face(i0,i1,i2,out);face(i0,i2,i3,out);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(index);return g;
}

const torsoV=(y:number)=>vAtHeight(WYLDIST_TORSO,y);
/** The plain field swatch, expressed before the panel is folded onto the shirt page. */
const BINDING=((page,flat)=>[((flat.u0+flat.u1)/2-page.u0)/(page.u1-page.u0),((flat.v0+flat.v1)/2-page.v0)/(page.v1-page.v0)] as const)(
  WYLDIST_REGIONS.shirt,WYLDIST_REGIONS.shirtFlat);
const pageAt=(u:number,v:number):[number,number]=>[((u/(Math.PI*2))%1+1)%1,v/(WYLDIST_TORSO.length-1)];

/**
 * The camp collar: one rolled rever from the lower sternum up the V to the
 * neck, then the turned-down fall around the back of the neck to the centre
 * seam, where the other side's half meets it. Revers show the print on the
 * fold (sampled from the uncut back); the fall samples its own side panel.
 */
export function wyldistCollar(side:number):THREE.BufferGeometry {
  const opening=(y:number)=>wyldistOpeningHalfWidth(WYLDIST_SHEET,y);
  const cols=4, lapel:{u:number;v:number;lift:number}[][]=[];
  const lift=(t:number,fold:number,flat:number)=>flat+(fold-flat)*(1-t)**2;
  // Rever: rows climb the V. Each row runs from the fold (the V edge) out to
  // the rever's outer edge, which widens to its corner below the collarbone.
  // It lies flat on the chest; only the roll at the fold stands a little. The
  // fold laps 3 mm over the V edge everywhere (more over its lowest 8 cm), so
  // the cut edge of the print never shows and the panels close at the point.
  const rowsA=9;
  for(let r=0;r<=rowsA;r++) {
    const y=REVER_FROM+.003+(REVER_CORNER-REVER_FROM-.003)*r/rowsA, f=opening(y);
    const reach=f+(REVER_REACH-opening(REVER_CORNER))*(y-REVER_FROM)/(REVER_CORNER-REVER_FROM);
    // Lower down, the roll at the fold stands a little prouder: seen along
    // the chest in a deep fold, it hides the narrow foot of the V.
    const inset=.003+.004*(1-ease((y-REVER_FROM)/.08)), roll=.0060+.0040*(1-ease((y-REVER_FROM)/.10));
    const u0=angleAtX(y,Math.max(.0005,f-inset),side),u1=angleAtX(y,Math.max(f+.0005,reach),side);
    lapel.push(Array.from({length:cols},(_,c)=>({u:u0+(u1-u0)*c/(cols-1),v:torsoV(y),lift:lift(c/(cols-1),roll,.0030)})));
  }
  // The rever's top fans from its corner up the V to the front notch.
  const corner={u:angleAtX(REVER_CORNER,REVER_REACH,side),v:torsoV(REVER_CORNER)};
  const rowsB=3;
  for(let r=1;r<=rowsB;r++) {
    const y=REVER_CORNER+(NOTCH-REVER_CORNER)*r/rowsB, u0=angleAtX(y,opening(y)-.003,side);
    lapel.push(Array.from({length:cols},(_,c)=>{const t=c/(cols-1);
      return {u:u0+(corner.u-u0)*t,v:torsoV(y)+(corner.v-torsoV(y))*t,lift:lift(t,.0060,.0030)};}));
  }
  // Print on the fold, sampled from the uncut back at the same height, so it
  // is body scale and never meets the V.
  const reverPage=(u:number,v:number)=>pageAt(u+Math.PI,v);
  const rever=flap(lapel,reverPage,.62,1.08);
  // Fall: a soft band turned down from the stand round the neck to the centre
  // back seam. Its top edge drops from the stand at the back to the front
  // notch; at the front its lower edge runs out to a collar point lying flat
  // on the chest over the rever's top, pointing down and out.
  const fall:{u:number;v:number;lift:number}[][]=[];
  const back=side>0?-Math.PI/2:Math.PI*1.5;
  const point={y:.452,u:angleAtX(.452,.112,side)};
  const rowsC=12;
  for(let r=0;r<=rowsC;r++) {
    const s=r/rowsC, front=1-ease(s/.32), top=NOTCH+(COLLAR_TOP-NOTCH)*ease(s/.50);
    const u=angleAtX(top,opening(Math.min(top,NOTCH))+.0005,side)*(1-s)+back*s;
    const lowY=COLLAR_BACK+(point.y-COLLAR_BACK)*front, lowU=u+(point.u-u)*front;
    fall.push(Array.from({length:cols},(_,c)=>{const t=c/(cols-1);
      return {u:u+(lowU-u)*t,v:torsoV(top)+(torsoV(lowY)-torsoV(top))*t,lift:lift(t,.0085,.0035)};}));
  }
  // The fall carries the shirt's own print at body scale: the same height,
  // shifted half a radian round so motifs do not run straight on from the
  // yoke below. The left half reads the mirror of the right, so no triangle
  // crosses the page's seam at +X (one that did sampled a barcode).
  // A different shift per half, so the centre back is a seam, not a mirror.
  const fallPage=(u:number,v:number)=>pageAt((side>0?Math.PI-u+.85:u)+.55,v);
  const collar=flap(fall,fallPage,.62,1.04);
  return mergeGeometries([rever,collar]);
}


function shapeShirt(g:THREE.BufferGeometry):void {
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    // Level the hem in the world: the pelvis rides pitched 0.10 rad forward,
    // which would otherwise drop the front hem 27 mm below the back.
    if(y<.0)p.setY(i,y+.10*(z-.024));
    // The shoulder corners tuck inside the sleeve caps (C6): the body's
    // square back stood behind the caps and read as a vest over the sleeves,
    // a crease from behind. The centre back, chest and armpit width stay.
    const band=ease((y-.395)/.035)*(1-ease((y-.535)/.02));
    if(band>0 && z<0) p.setZ(i,z*(1-.45*band*ease((Math.abs(x)-.110)/.05)));
    else if(band>0) p.setZ(i,z*(1-.25*band*ease((Math.abs(x)-.130)/.04)));
  }
  // The hem is open like cloth, with the trouser seat inside it. A cap fan
  // would stretch the entire wrap across its underside in a deep crouch.
  g.computeVertexNormals();
}

// A chunky black high-top: tall padded collar at the heel, low toe box, on a
// light-grey midsole (the sole loft) that separates the foot from the pedal.
const BOOT=loftProfile([
  {y:-.112,halfWidth:.050,halfDepth:.040,z:0,square:3},
  {y:-.103,halfWidth:.062,halfDepth:.052,z:0,square:3.3},
  {y:-.075,halfWidth:.068,halfDepth:.058,z:0,square:3.6},
  {y:-.030,halfWidth:.070,halfDepth:.057,z:0,square:3.5},
  {y:.010,halfWidth:.069,halfDepth:.050,z:0,square:3.4},
  {y:.050,halfWidth:.068,halfDepth:.041,z:0,square:3.5},
  {y:.090,halfWidth:.064,halfDepth:.031,z:0,square:3.5},
  {y:.118,halfWidth:.054,halfDepth:.021,z:0,square:3.4},
  {y:.130,halfWidth:.038,halfDepth:.012,z:0,square:3},
].map(r=>({...r,z:.047-r.halfDepth})));
/** The high-top's padded ankle collar, which the jogger cuff sits on (ankle-local). */
function bootCollar():THREE.BufferGeometry {
  return loftGeometry(profile([[.052,.062,.060,-.010],[.114,.055,.053,-.012]],2.6),{radialSegments:8,capBottom:false,capTop:false});
}
const SOLE=profile([[-.018,.064,.121],[-.012,.073,.127],[-.004,.073,.127],[-.001,.070,.124]],4);
const SOLE_TOP=-.042;
function paintBoot(g:THREE.BufferGeometry):void {
  const p=g.getAttribute('position'),c=g.getAttribute('color');
  const upper=tintOver(C.wyldistGear,0x252525),mid=tintOver(C.wyldistGear,0x7a7a7b),outsole=tintOver(C.wyldistGear,0x3e3e3f);
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i);
    c.setXYZ(i,...(y>SOLE_TOP-.0005?upper:y>SOLE_TOP-.014?mid:outsole));
  }
}

// A riding glove, not a mitt: a short flared cuff lip over a slim wrist, the
// back of the hand widening to 1.35× the wrist at a knuckle ridge, then four
// curled fingers and a thumb as their own lofts in the same mesh. The palm
// never exceeds 46 mm half-width, so the inboard thumb is still the widest
// thing in its band.
const HAND=profile([[-.096,.039,.024,-.002],[-.088,.043,.029],[-.070,.045,.030,.002],[-.050,.046,.030,.002],
  [-.028,.040,.028,.001],[-.010,.034,.026],[.006,.034,.027],[.016,.035,.027]],2.6);
const HAND_SEGMENTS=16, CUFF=-.027, KNUCKLES=-.088;
/** The palm loft's own triangles come first in the merged glove; the rest are digits. */
const PALM_TRIANGLES=(()=>{const g=loftGeometry(HAND,{radialSegments:HAND_SEGMENTS}),n=g.getIndex()!.count/3;g.dispose();return n;})();
/**
 * The thumb lies along the index finger, rolled toward the palm, as a relaxed
 * hand's does. After the wrist's turn it still reaches 52 mm inboard, past the
 * palm's 46, so the front reads a thumb (`riderLook.test.ts` asks 50).
 * (Clip fix, 2026-10-10: it stood straight out sideways, 7 cm from the hand's
 * axis, and was the deepest thing in his thigh when he crouched riding
 * backwards — `riderClearanceRidden.test.ts`, "Wyldist's gloves".)
 */
function gloveThumb(side:number):THREE.BufferGeometry {
  return loftGeometry(profile([[-.026,.016,.016,-.004,-side*.030],[-.046,.016,.016,-.018,-side*.043],
    [-.068,.012,.012,-.022,-side*.038],[-.084,0,0,-.022,-side*.034]],2.4),{radialSegments:10});
}
/** Index (inboard, beside the thumb) to little finger, each curled toward the palm. */
function gloveFingers(side:number):THREE.BufferGeometry {
  const fingers=[[-.033,.056],[-.011,.061],[.011,.057],[.033,.047]].map(([at,length])=>{
    const x=side*at!, l=length!;
    return loftGeometry(profile([[-.086,.0105,.0120,0,x],[-.086-l*.45,.0098,.0110,-.010,x],
      [-.086-l*.82,.0084,.0094,-.022,x],[-.086-l,.0025,.0030,-.028,x]],2.3),{radialSegments:6,capTop:false});
  });
  return mergeGeometries(fingers);
}
/**
 * Shapes and paints the merged glove. The hand turns outboard at the wrist (no
 * animation changes) so a hanging glove clears the cargo pocket, and a glove
 * laid on his thigh riding backwards clears the cloth: 0.18 of the drop below
 * the cuff, about 10° (0.08 before the 2026-10-10 clip fix), with a 3 mm
 * knuckle ridge (4 mm before), which was the back of the hand's deepest point.
 * Each facet then takes one colour, never a gradient: a red cuff band all
 * round and a red back panel ending exactly on the knuckle ring (a clean
 * line, nothing red below it), and black fingers, thumb and palm.
 */
function paintGlove(g:THREE.BufferGeometry,side:number):void {
  const q=g.getAttribute('position');
  for(let i=0;i<q.count;i++) {
    const y=q.getY(i),z=q.getZ(i);
    q.setX(i,q.getX(i)+side*.18*Math.max(0,-(y+.010)));
    if(z>0)q.setZ(i,z+.003*Math.exp(-(((y-KNUCKLES)/.007)**2)));
  }
  g.computeVertexNormals();
  const flat=g.toNonIndexed();
  for(const name of ['position','normal','color','uv'] as const) {
    const attribute=flat.getAttribute(name); if(attribute) g.setAttribute(name,attribute);
  }
  g.setIndex(null);flat.dispose();
  const p=g.getAttribute('position'),c=g.getAttribute('color');
  const red=tintOver(C.wyldistGear,C.wyldistRed),black=tintOver(C.wyldistGear,0x101011);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3) {
    let colour=black;
    if(i/3<PALM_TRIANGLES) {
      let x=0,y=0,z=0;
      for(let k=0;k<3;k++){x+=p.getX(i+k)/3;y+=p.getY(i+k)/3;z+=p.getZ(i+k)/3;}
      a.set(p.getX(i+1)-p.getX(i),p.getY(i+1)-p.getY(i),p.getZ(i+1)-p.getZ(i));
      b.set(p.getX(i+2)-p.getX(i),p.getY(i+2)-p.getY(i),p.getZ(i+2)-p.getZ(i));
      n.crossVectors(a,b).normalize();
      const back=y>KNUCKLES && ((n.z>.30 && z>.006) || (side*n.x>.55 && side*x>.030));
      if(y>CUFF||back)colour=red;
    }
    for(let k=0;k<3;k++)c.setXYZ(i+k,...colour);
  }
}

/**
 * Painted form on the bare arms, so a lean arm reads as muscle over bone even
 * in shade: the underside and back a little darker, a biceps/triceps groove on
 * the outer face, a brachioradialis ridge below the elbow, a lit elbow point
 * behind and a crease in front, and a slim darker wrist. The welded elbow ring
 * gets the same value from both sides, so the join stays invisible.
 */
function shadeArm(g:THREE.BufferGeometry,side:number,elbowAt:number,forearm:boolean):void {
  const p=g.getAttribute('position'),c=g.getAttribute('color');
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=Math.hypot(x,z)||1;
    const back=Math.max(0,-z/r), front=Math.max(0,z/r), out=Math.max(0,side*x/r);
    const near=Math.exp(-(((y-elbowAt)/.028)**2));
    let shade=1-.10*back-.07*near*front+.06*near*back;
    if(forearm) {
      shade+=.06*out*front*Math.exp(-(((y+.070)/.040)**2));
      shade-=.12*ease((-.200-y)/.03);
    } else {
      shade-=.08*out*Math.exp(-((z/r/.25)**2))*Math.exp(-(((y+.130)/.060)**2));
      shade+=.05*front*Math.exp(-(((y+.120)/.050)**2));
    }
    c.setXYZ(i,c.getX(i)*shade,c.getY(i)*shade,c.getZ(i)*shade);
  }
}
function paintForearm(g:THREE.BufferGeometry,side:number):void { shadeArm(g,side,0,true); }
function paintUpperArm(g:THREE.BufferGeometry,side:number):void { slopeShoulder(g,side); shadeArm(g,side,-.280,false); }

/** Smooth crown slope, shared by the skin and the sleeve over it. */
function slopeShoulder(g:THREE.BufferGeometry,side:number):void {
  const p=g.getAttribute('position');
  // Skin and cloth share this crown shape. Moving only the sleeve leaves a
  // bare shoulder island outside its upper edge; the joint stays unchanged.
  for(let i=0;i<p.count;i++) p.setX(i,p.getX(i)-side*.014*ease((p.getY(i)+.060)/.090));
  g.computeVertexNormals();
}
function sleeve(side:number):THREE.BufferGeometry {
  const g=loftGeometry(WYLDIST_SLEEVE,{radialSegments:SLEEVE_SEGMENTS,splitSeam:true,capBottom:false});
  slopeShoulder(g,side);
  // Recomputing after the shoulder shear splits the UV seam's normals again.
  // Restore the shared shading across its coincident first/last columns.
  const normal=g.getAttribute('normal');
  for(let row=0;row<WYLDIST_SLEEVE.length;row++) {
    const a=row*(SLEEVE_SEGMENTS+1),b=a+SLEEVE_SEGMENTS;
    const x=normal.getX(a)+normal.getX(b),y=normal.getY(a)+normal.getY(b),z=normal.getZ(a)+normal.getZ(b);
    const length=Math.hypot(x,y,z)||1;
    normal.setXYZ(a,x/length,y/length,z/length);normal.setXYZ(b,x/length,y/length,z/length);
  }
  // No separate facing: the turned-in edge (the page's dark inside-fabric
  // band) disappears into the arm, which closes the ring.
  return g;
}

/** Outboard bias: wider cargos without crossing at the crotch or growing at the calf. */
function biasThigh(g:THREE.BufferGeometry,side:number):void {
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    // Outboard volume toward the knee only; the hip stays narrow under the hem.
    const y=p.getY(i), w=ease((y+.400)/.080)*(1-ease((y+.200)/.080)), knee=ease((-.320-y)/.040);
    p.setX(i,p.getX(i)+side*(.008*w+.004*knee));
  }
  foldLeg(g,THIGH,[[-.350,.010,1],[-.300,.007,-1],[-.250,.006,1]],-.385,.2);
}
/**
 * The leg's inboard half keeps r0's width from the lower thigh through the
 * knee and calf — the loose cargo grows outboard only — and is 15 % flatter
 * through the pad window, so the knee and calf sink less into the shell.
 * `reach` is the distance down the leg from the hip; the thigh's last ring
 * and the shin's first are the same ring, so the welded knee stays exact.
 */
function inboard(g:THREE.BufferGeometry,side:number,now:LoftProfile,old:LoftProfile,reach:(y:number)=>number):void {
  const p=g.getAttribute('position'),a=new THREE.Vector3(),b=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i);
    if(side*x>=0) continue;
    const l=reach(y), w=ease((l-.28)/.08)*(1-ease((l-.64)/.05));
    if(w===0) continue;
    loftPoint(old,0,vAtHeight(old,y),a);loftPoint(now,0,vAtHeight(now,y),b);
    const flat=1-.15*ease((l-.42)/.04)*(1-ease((l-.62)/.04));
    const scale=Math.min(1,a.x/Math.max(1e-6,b.x))*flat;
    p.setX(i,x*(1-w+w*scale));
  }
}
/**
 * The thigh's back faces down and away from a high sun, so seen from the chase
 * camera it fell to a quarter of the shin's value: bend its back-facing
 * normals up the bone so cloth shades like the near-vertical shin below it.
 */
function liftBackNormals(g:THREE.BufferGeometry,amount:number):void {
  const n=g.getAttribute('normal'),v=new THREE.Vector3();
  for(let i=0;i<n.count;i++) {
    v.fromBufferAttribute(n,i); if(v.z>=0) continue;
    v.y+=amount*-v.z; v.normalize(); n.setXYZ(i,v.x,v.y,v.z);
  }
}
/**
 * The thigh's back below the hip is cut flat, a box-pleated seat panel: when
 * the leg lifts in a carve, a round back here became a glossy buttock with a
 * cleft against its twin. The dome over the joint keeps its width.
 */
function flattenSeat(g:THREE.BufferGeometry):void {
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),z=p.getZ(i);
    if(z<0) p.setZ(i,z*(1-.38*ease((y+.170)/.110)));
  }
}
function paintThigh(g:THREE.BufferGeometry,side:number):void {
  inboard(g,side,THIGH,R0_THIGH,y=>-y); biasThigh(g,side); flattenSeat(g); g.computeVertexNormals(); liftBackNormals(g,.55);
}
function paintShin(g:THREE.BufferGeometry,side:number):void {
  inboard(g,side,SHIN,R0_SHIN,y=>.400-y);
  // The gathered cuff pulls in hardest on the outside, where the wide stance
  // would otherwise carry the ankle as far out as the knee seen from the front.
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    if(side*p.getX(i)>0) p.setX(i,p.getX(i)*(1-.28*ease((-.180-p.getY(i))/.03)));
    // The thigh's extra knee volume continues 4 cm down the shin, so the
    // welded knee ring stays one ring.
    p.setX(i,p.getX(i)+side*.004*(1-ease((-.040-p.getY(i))/.040)));
  }
  foldLeg(g,SHIN,[[-.060,.009,1],[-.120,.006,-1],[-.190,.006,1]],-.5,-.015);
  g.computeVertexNormals();
}
/** Broad cloth folds: a bulge on the front (+1) or back (−1) of a leg loft. */
function foldLeg(g:THREE.BufferGeometry,loft:LoftProfile,folds:readonly (readonly [number,number,number])[],
  low:number,high:number):void {
  const p=g.getAttribute('position'),c=g.getAttribute('color');
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),z=p.getZ(i);
    // The welded knee ring itself never moves: both lofts must still meet.
    if(y<=low||y>=high) continue;
    let push=0,crease=0;
    for(const [at,depth,face] of folds) {
      if(Math.sign(z)!==face) continue;
      push+=depth*Math.exp(-(((y-at)/.016)**2));
      crease+=Math.exp(-(((y-at-.022)/.007)**2))+Math.exp(-(((y-at+.022)/.007)**2));
    }
    if(push===0) continue;
    const ring=loft[Math.min(loft.length-1,Math.round(vAtHeight(loft,y)))]!;
    const across=Math.abs(z-ring.z)/Math.max(1e-6,ring.halfDepth);
    p.setZ(i,z+Math.sign(z)*push*across);
    // The valleys either side of a fold catch less light.
    const dim=1-.22*Math.min(1,crease)*across;
    c.setXYZ(i,c.getX(i)*dim,c.getY(i)*dim,c.getZ(i)*dim);
  }
}
/**
 * Bellows cargo pocket and flap on the outer mid-thigh, biased with the leg.
 * It sits where C2 has it, the flap at the hanging glove's fingertips: 5 cm
 * higher than its first cut, which took his left fingertips in the slow
 * full-lock turn and his right knuckles riding backwards (clip fix,
 * 2026-10-10). Heights are down the thigh from the hip joint.
 */
const POCKET_BOTTOM=-.255, POCKET_TOP=-.145, FLAP_BOTTOM=-.163, FLAP_TOP=-.135;
function cargoPocket(side:number):THREE.BufferGeometry {
  const out=side>0?0:Math.PI;
  const span=(u0:number,u1:number)=>side>0?[out+u0,out+u1]:[out-u1,out-u0];
  const [a0,a1]=span(-.52,.52),[f0,f1]=span(-.56,.56);
  const body=patchGeometry(THIGH,{u0:a0!,u1:a1!,v0:vAtHeight(THIGH,POCKET_BOTTOM),v1:vAtHeight(THIGH,POCKET_TOP),
    uSegments:5,vSegments:3,lift:.0180,sink:-.004,taper:.06});
  // The flap's lower rim and the band under it are painted as its shadow; it
  // stands to the stationary 0.13 m leg envelope, no further.
  const pc=body.getAttribute('position'),cc=body.getAttribute('color'),nc=body.getAttribute('normal');
  for(let i=0;i<pc.count;i++) {
    const y=pc.getY(i), under=Math.exp(-(((y-FLAP_BOTTOM-.002)/.012)**2)), rim=Math.abs(nc.getY(i))>.6||Math.abs(nc.getX(i)*side)<.35;
    const shade=(1-.38*under)*(rim?.78:1);
    cc.setXYZ(i,cc.getX(i)*shade,cc.getY(i)*shade,cc.getZ(i)*shade);
  }
  const flapGeometry=patchGeometry(THIGH,{u0:f0!,u1:f1!,v0:vAtHeight(THIGH,FLAP_BOTTOM),v1:vAtHeight(THIGH,FLAP_TOP),
    uSegments:5,vSegments:1,lift:.0215,sink:-.002,taper:.05,shade:.92});
  const fp=flapGeometry.getAttribute('position'),fc=flapGeometry.getAttribute('color'),fn=flapGeometry.getAttribute('normal');
  for(let i=0;i<fp.count;i++) if(fn.getY(i)<-.5){const d=.42;fc.setXYZ(i,fc.getX(i)*d,fc.getY(i)*d,fc.getZ(i)*d);}
  const g=mergeGeometries([body,flapGeometry]);
  biasThigh(g,side);
  return g;
}

const cloth:RiderMaterialSpec=Object.freeze({colour:C.wyldistPrint,roughness:.88,metalness:0});
const skin:RiderMaterialSpec=Object.freeze({colour:C.wyldistSkin,roughness:.72,metalness:0});
const gear:RiderMaterialSpec=Object.freeze({colour:C.wyldistGear,roughness:.92,metalness:0});
// The cargos wear their own matte neutral charcoal (C4). A faint neutral
// self-light is the fill, so shaded cloth stays a readable charcoal above the
// shell and tyre without greying the lit side; it no longer lifts the black
// gloves, shoes or helmet lining, which share the gear material.
const cargo:RiderMaterialSpec=Object.freeze({colour:C.wyldistCargo,roughness:.95,metalness:0,emissive:0x1b1b1b,emissiveIntensity:1});
export const WYLDIST_LOOK:RiderLook=Object.freeze({
  id:'wyldist',materials:Object.freeze({body:cloth,limbs:skin,accent:cargo,
    head:Object.freeze({colour:C.wyldistHelmetGround,roughness:.34,metalness:0}),face:skin,gear}),
  profiles:Object.freeze({torso:WYLDIST_TORSO,seat:SEAT,thigh:THIGH,shin:SHIN,
    upperArm:UPPER_ARM,forearm:FOREARM,neck:NECK,head:WYLDIST_HELMET,boot:BOOT,bootSole:SOLE,hand:HAND}),
  density:Object.freeze({torso:36,limb:18,head:28,neck:16,boot:18,hand:HAND_SEGMENTS}),
  continuousJoints:true,drapedHem:true,
  // The seat faces down and back, so it is lifted to read as the same cloth.
  shades:Object.freeze({seat:1.22,legs:1,collar:1,sole:1,neck:.92}),
  parts:Object.freeze({hands:'gear',neck:'limbs',kneePad:'accent',legs:'accent',seat:'accent'}),
  atlas:Object.freeze({build:()=>createWyldistAtlas(WYLDIST_SHEET),roles:Object.freeze(['body','head'] as const),
    region:(art:string|undefined)=>WYLDIST_REGIONS[art as keyof typeof WYLDIST_REGIONS]??WYLDIST_REGIONS.blank,
    lofts:Object.freeze({torso:'shirt',head:'helmet'})}),
  build:Object.freeze({head:wyldistHelmetShell,hand:Object.freeze([gloveThumb,gloveFingers]),boot:Object.freeze([bootCollar])}),
  paint:Object.freeze({torso:shapeShirt,upperArm:paintUpperArm,forearm:paintForearm,hand:paintGlove,boot:paintBoot,thigh:paintThigh,shin:paintShin}),
  panels:Object.freeze({
    torso:Object.freeze({patches:Object.freeze([]),build:wyldistCollar,art:'shirt',role:'body' as const,casts:false}),
    sleeve:Object.freeze({patches:Object.freeze([]),build:sleeve,
      art:(side:number)=>side>0?'leftSleeve':'rightSleeve',role:'body' as const,casts:false,ghostSilhouette:true}),
    thighPad:Object.freeze({role:'accent' as const,casts:false,patches:Object.freeze([]),build:cargoPocket}),
    head:Object.freeze([]),
  }),
  extras:Object.freeze([
    {name:'rider-wyldist-face',joint:'neck' as const,role:'face' as const,casts:true,build:wyldistFace},
    // Hidden inside the casting shell, so it carries no silhouette of its own.
    {name:'rider-wyldist-helmet-lining',joint:'neck' as const,role:'gear' as const,casts:false,build:wyldistHelmetLining},
  ]),
  // A broader chest needs the hanging arms 20 mm wider to keep their gap.
  armCarriage:Object.freeze({splay:.02,rise:0}),
});
