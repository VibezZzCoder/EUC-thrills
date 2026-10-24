/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { PlacedProp } from './segments.ts';
import type { BuildingLook, PropKind } from '../data/props.ts';
/** Harbour facade colours, sRGB; the facade atlas darkens every face, so these sit bright. */
export const QUAY_HARBOUR_TONES=[0xc4623f,0xd4a043,0x78b09c,0xdc9580,0x7d9cc0,0xe2cf96,0xd98a8f,0x9cbf7a] as const;
/** Terracotta tile, slate and weathered copper. */
export const QUAY_HARBOUR_ROOFS=[0xa8503a,0x4d5868,0x4f7f74] as const;
/** Explicit placements leave all six riding envelopes and complete activity paths clear. */
export function quayDressing():PlacedProp[]{
 const props:PlacedProp[]=[];
 const building=(x0:number,x1:number,z0:number,z1:number,h:number,look?:BuildingLook,rotationY=0,tone?:number,roofTone?:number)=>props.push({kind:'building',x:(x0+x1)/2,z:(z0+z1)/2,lift:0,rotationY,scale:1,size:{x:x1-x0,y:h,z:z1-z0},...(look?{look}:{}),...(tone===undefined?{}:{tone}),...(roofTone===undefined?{}:{roofTone})});
 // A harbour town is painted: neighbours never share a colour, warehouses are brick.
 const H=QUAY_HARBOUR_TONES,R=QUAY_HARBOUR_ROOFS;
 // Facade bodies end at y10, where each riding slab starts; the slab is the roof,
 // so no kit cap shares its underside and fights it at the eave (2026-10-23).
 const warehouse=(x0:number,x1:number,z0:number,z1:number,tone:number)=>{building(x0,x1,z0,z1,10,undefined,0,tone);props[props.length-1].slabRoof=true;};
 warehouse(-83.7,-64.3,-26.7,-11.3,0x9a5443);warehouse(-83.7,-64.3,-6.7,16.7,0xb07a4a);
 warehouse(-83.7,-64.3,25.3,38.7,0x9a5443);warehouse(-83.7,-24.3,39.3,58.7,0x8f6a52);
 // The park's north edge is a terrace of gabled townhouses.
 for(let i=0;i<8;i++)building(16+9*i,23+9*i,-61,-53,[6.4,7,7.6][i%3],'residential',0,H[(i*3)%H.length],R[i%R.length]);
  // Heights sit in the kit's bands: under 8 m draws two storeys, 8–26 m draws four, so a
 // block is ~7 m or ~13 m and never a squashed 8–10 m four-storey.
 for(const [i,[a,b]] of [[16,26],[28,38],[40,46],[56,66],[68,78],[80,88]].entries())building(a,b,53,61,[6.6,7.6,13,7,13.6,7.2][i],'commercial',Math.PI,H[(i*3+1)%H.length]);
 for(const [i,[a,b]] of [[-6,2],[4,12],[14,22],[28,36],[40,48]].entries())building(85,93,a,b,[13.2,7.4,12.8,13.6,7][i],'commercial',Math.PI/2,H[(i*3+2)%H.length]);
 // The west yard becomes a street block, its alleys six metres or wider.
 building(-58,-42,-54,-36,13,'residential',0,H[4],R[1]);building(-58,-44,-28,-8,13.4,'commercial',0,H[6]);building(-58,-42,0,24,12,'residential',0,H[0],R[2]);
 const put=(kind:PropKind,x:number,z:number,rotationY=0,scale=1)=>props.push({kind,x,z,rotationY,scale,lift:0});
 for(const [x,z] of [[20,-24],[38,-24],[58,-24],[77,-24],[34,-48],[68,-48],[111,-56],[111,-26],[111,4],[111,34],[-115,-45],[-115,0],[-115,43],[-90,-81],[90,-81],[111,65]])put('broadleafTree',x,z);
 // Street trees in pits along both quay promenades, each clear of every walk, line, pad and bed.
 for(const [x,z] of [[-112,-86],[-96,-86],[-80,-86],[-60,-86],[60,-86],[84,-74.6],[100,-86],[-112,86],[-96,73.6],[-80,74.6],[-62,86],[-46,86],[-30,86],[-12,86],[54,82],[90,73.6],[106,86]])put('broadleafTree',x,z,(x*7+z)%6);
 // A lamp's arm is its local +Z, so each heading points the head over the walk
 // or road it lights; a bench faces local +Z too, always away from the wall.
 const P=Math.PI;
 for(const x of[-88,-48,0,48,88]){put('lampPost',x,-86,0);put('lampPost',x,x===-48||x===0?73:86,P);}
 for(const z of[-50,-20,10,40]){put('lampPost',-116,z,P/2);put('lampPost',116,z,-P/2);}
 for(const [x,z,h] of [[60,20,0],[82,24,-P/2],[16,25,-P/2],[16,-25,-P/2],[76,-8,0],[56,50,P]])put('lampPost',x,z,h);
 // The bin stands at the bench's end, along the seat, whichever way it faces.
 for(const [x,z,h] of [[69,27,-P/2],[75,43,-P/2],[61,40,P],[18,44,P/2],[-72,-86,0],[-115,22,P/2],[113,-10,-P/2],[84,-24,-P/2]]){put('bench',x,z,h);put('litterBin',x+1.8*Math.cos(h),z-1.8*Math.sin(h),h);}
 for(const [kind,x,z,h] of [['lampPost',-66,8,-P/2],['lampPost',-82,30,P/2],['lampPost',-54,56,P],['bench',-66,3,-P/2],['litterBin',-66,5,-P/2]] as const)props.push({kind,x,z,lift:11,rotationY:h,scale:1});
 return props.map(p=>({...p,onCollider:true}));
}
