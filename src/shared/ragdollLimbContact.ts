/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {RAGDOLL_BOOT_GROUND_BOX,RAGDOLL_HAND_GROUND_BOX,RAGDOLL_PARTICLE_RADII,RIDER_BLOCKOUT,RIDER_OCCUPANCY} from '../data/tuning.ts';
import {solveRagdollLeg,solveRagdollLimb} from './ragdollBoot.ts';
import {contactBoxFace,contactCapsuleOverlapsBox,contactOrientedBoxOverlaps,contactOrientedBoxSupport,nearestContactCircle,nearestContactSphere,pointMeetsContactPlanes,RAGDOLL_BOX_STRIDE} from './ragdollContact.ts';
const EPS=1e-6;
function radiusOfBox(box:typeof RAGDOLL_BOOT_GROUND_BOX|typeof RAGDOLL_HAND_GROUND_BOX):number {
  const x=Math.max(Math.abs(box.minX),Math.abs(box.maxX)),y=Math.max(Math.abs(box.minY),Math.abs(box.maxY)),z=Math.max(Math.abs(box.minZ),Math.abs(box.maxZ));return Math.sqrt(x*x+y*y+z*z);
}
const BOOT_SPHERE=radiusOfBox(RAGDOLL_BOOT_GROUND_BOX),HAND_SPHERE=radiusOfBox(RAGDOLL_HAND_GROUND_BOX);
/** Visible skin at the solved joint is separate from its smaller point core.
 * The ankle keeps its actual oriented box, rather than this bone allowance. */
export function ragdollJointGroundSupport(leg:boolean):number {
  return leg?Math.max(RIDER_BLOCKOUT.ragdollKneeRadius,RIDER_OCCUPANCY.legRadius):Math.max(RIDER_BLOCKOUT.ragdollElbowRadius+RIDER_BLOCKOUT.ragdollArmGroundLead,RIDER_OCCUPANCY.armRadius);
}
/** One reusable, arithmetic-only contact workspace. No world references or
 * history live here. Its bounded face choices are not a complete wedge solver. */
export class RagdollLimbContact {
  readonly pose=new Float64Array(37);
  readonly initialPose=new Float64Array(37);
  readonly planes=new Float64Array(32);
  readonly endPlanes=new Float64Array(40);
  readonly endOffsets=new Float64Array(10);
  readonly face=new Float64Array(4);
  readonly ranks=new Int8Array(12);
  readonly costs=new Float64Array(12);
  readonly active=new Int16Array(RIDER_BLOCKOUT.ragdollContactActiveBoxes);
  readonly overlaps=new Uint8Array(RIDER_BLOCKOUT.ragdollContactActiveBoxes);
  readonly sphere=new Float64Array(4);
  readonly sat=new Float64Array(12);
  readonly breaks=new Float64Array(8);
  readonly pole=new Float64Array(3);
  readonly requestedPole=new Float64Array(3);
  readonly supportBracket=new Float64Array(6);
  readonly supportAxes=new Float64Array(6);
  private supportAxisMask=0;
  /** xyz and positive separation for a failed local proposal. */
  readonly reaction=new Float64Array(4);
  trials=0;
  narrowphase=0;
  released=false;
  private hx=0;private hy=0;private hz=0;private fx=0;private fy=0;private fz=0;
  private upper=0;private lower=0;private minimum=0;private maximum=0;private boneRadius=0;
  private leg=false;private heading=0;private forwardX=0;private forwardZ=1;
  private planeCount=0;private endCount=0;
  private staticEndPlanes=0;
  private wheelX=0;private wheelZ=0;private wheelTop=0;
  private records:Float64Array=new Float64Array(0);private recordStart=0;private recordCount=0;
  private endpointGround:Float64Array=new Float64Array(0);private endpointAt=0;
  private jointGround:Float64Array=new Float64Array(0);private jointAt=0;

  solve(hx:number,hy:number,hz:number,fx:number,fy:number,fz:number,px:number,py:number,pz:number,
    leg:boolean,heading:number,forwardX:number,forwardZ:number,endpointGround:Float64Array,endpointAt:number,jointGround:Float64Array,jointAt:number,
    records:Float64Array,recordStart:number,recordCount:number,wheelX:number,wheelZ:number,wheelTop:number):boolean {
    this.hx=hx;this.hy=hy;this.hz=hz;this.fx=fx;this.fy=fy;this.fz=fz;this.leg=leg;this.heading=heading;this.forwardX=forwardX;this.forwardZ=forwardZ;
    this.upper=leg?RIDER_BLOCKOUT.thighLength:RIDER_BLOCKOUT.upperArmLength;this.lower=leg?RIDER_BLOCKOUT.shinLength:RIDER_BLOCKOUT.forearmLength;
    this.minimum=leg?Math.abs(this.upper-this.lower)+2*EPS:RIDER_BLOCKOUT.ragdollArmContactMinReach+EPS;this.maximum=this.upper+this.lower-2*EPS;
    this.boneRadius=leg?RIDER_OCCUPANCY.legRadius:RIDER_OCCUPANCY.armRadius;
    // Physical endpoints retain a numerical margin inside the renderer's
    // triangle bounds. Its defensive clamp is never the published contact.
    const dx=fx-hx,dy=fy-hy,dz=fz-hz,squared=dx*dx+dy*dy+dz*dz;
    if(squared>this.maximum*this.maximum){const scale=this.maximum/Math.sqrt(squared);fx=hx+dx*scale;fy=hy+dy*scale;fz=hz+dz*scale;}
    else if(squared<this.minimum*this.minimum) {
      const horizontal=Math.sqrt(dx*dx+dz*dz),reach=Math.sqrt(Math.max(0,this.minimum*this.minimum-dy*dy));
      fx=hx+(horizontal>EPS?dx/horizontal:Math.sin(heading))*reach;
      fz=hz+(horizontal>EPS?dz/horizontal:Math.cos(heading))*reach;
    }
    this.fx=fx;this.fy=fy;this.fz=fz;
    this.pole[0]=px;this.pole[1]=py;this.pole[2]=pz;this.requestedPole.set(this.pole);
    this.endpointGround=endpointGround;this.endpointAt=endpointAt;this.jointGround=jointGround;this.jointAt=jointAt;
    this.records=records;this.recordStart=recordStart;this.recordCount=recordCount;this.wheelX=wheelX;this.wheelZ=wheelZ;this.wheelTop=wheelTop;
    this.trials=0;this.narrowphase=0;this.released=false;this.reaction.fill(0);this.active.fill(-1);this.overlaps.fill(0);
    this.writePose(fx,fy,fz);
    let activeCount=0;
    for(let index=0;index<recordCount;index++) {
      const box=recordStart+index*RAGDOLL_BOX_STRIDE,flags=this.boxOverlap(box);
      if(flags===0)continue;
      if(activeCount===this.active.length){this.failureFromBox(box);return false;}
      this.active[activeCount]=box;this.overlaps[activeCount]=flags;activeCount++;
    }
    // A clear initial triangle is already the nearest feasible circle point.
    // Reconstructing it and its terminal basis again cannot improve contact.
    if(activeCount===0&&this.initialClear())return true;
    this.initialPose.set(this.pose);
    if(activeCount===0) {
      if(this.tryChoice(0))return true;
      // A ground-driven endpoint release can meet a box the initial pose did
      // not touch. Earn that finite feature before the fixed face trials.
      for(let index=0;index<recordCount;index++) {
        const box=recordStart+index*RAGDOLL_BOX_STRIDE,flags=this.boxOverlap(box);if(flags===0)continue;
        if(activeCount===this.active.length){this.failureFromBox(box);return false;}
        this.active[activeCount]=box;this.overlaps[activeCount]=flags;activeCount++;
      }
      if(activeCount===0){this.failureFromGround();return false;}
    }
    for(let index=0;index<activeCount;index++) {
      this.rankFaces(this.active[index],true,index*6);
      this.rankFaces(this.active[index],false,index*6+3);
    }
    // A single box has nine joint/end face pairs. Two boxes use the preferred
    // pair plus each single alternative, then three paired alternatives.
    const limit=activeCount===1?9:RIDER_BLOCKOUT.ragdollContactFaceTrials;
    for(let trial=0;trial<limit;trial++) {
      this.trials++;
      this.planeCount=0;this.endCount=0;this.staticEndPlanes=0;this.addGroundPlanes();
      let valid=true;
      for(let index=0;index<activeCount;index++) {
        let upChoice=0,downChoice=0;
        if(activeCount===1){upChoice=trial%3;downChoice=Math.floor(trial/3);}
        else if(trial>0&&trial<=8){const changed=Math.floor((trial-1)/2),rank=(trial-1)%2+1;if(changed===index*2)upChoice=rank;if(changed===index*2+1)downChoice=rank;}
        else if(trial>8){upChoice=(trial-9)%2+1;downChoice=trial===11?2:1;}
        const box=this.active[index],flags=this.overlaps[index];
        if(flags&1) {const face=this.ranks[index*6+upChoice];if(face<0){valid=false;break;}contactBoxFace(this.records,box,face,this.face);
          const root=this.face[0]*hx+this.face[1]*hy+this.face[2]*hz;
          if(root<this.face[3]+this.boneRadius-EPS){this.rememberReaction(this.face[0],this.face[1],this.face[2],this.face[3]+this.boneRadius+RIDER_BLOCKOUT.ragdollBootSupportSlack-root);valid=false;break;}
          this.addPlane(this.planes,this.planeCount++,this.face,this.boneRadius+RIDER_BLOCKOUT.ragdollBootSupportSlack);
        }
        if(flags&2) {const face=this.ranks[index*6+3+downChoice];if(face<0){valid=false;break;}contactBoxFace(this.records,box,face,this.face);
          this.addPlane(this.planes,this.planeCount++,this.face,this.boneRadius+RIDER_BLOCKOUT.ragdollBootSupportSlack);
          this.endOffsets[this.endCount]=this.face[3];this.staticEndPlanes|=1<<this.endCount;
          this.addPlane(this.endPlanes,this.endCount++,this.face,Math.max(this.boneRadius,this.terminalSupport(-this.face[0],-this.face[1],-this.face[2]))+RIDER_BLOCKOUT.ragdollBootSupportSlack);
        }
      }
      if(valid&&this.tryCurrentPlanes())return true;
    }
    if(this.reaction[3]===0)this.failureFromGround();
    if(this.reaction[3]===0&&activeCount>0)this.failureFromBox(this.active[0]);
    return false;
  }
  /** Near finite person-top support preserves the native slide-off response.
   * A side face alone cannot earn a roof beneath a wrist over the void. */
  livingTopSupport():number {
    const o=this.pose,band=RIDER_BLOCKOUT.ragdollBootSupportSlack*2;
    for(let index=0;index<this.recordCount;index++) {
      const box=this.recordStart+index*9,r=this.records;if(r[box]>=0)continue;
      const gap=Math.min(this.hy-this.boneRadius,o[1]-this.boneRadius,o[4]-Math.max(this.boneRadius,this.terminalSupport(0,-1,0)))-r[box+2]-r[box+5];
      if(gap<-EPS||gap>band)continue;
      if(contactCapsuleOverlapsBox(this.hx,this.hy,this.hz,o[0],o[1],o[2],this.boneRadius+band,r,box,this.breaks)
        ||contactCapsuleOverlapsBox(o[0],o[1],o[2],o[3],o[4],o[5],this.boneRadius+band,r,box,this.breaks))return -r[box]-1;
      const b=this.leg?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
      if(contactOrientedBoxOverlaps(o[3],o[4],o[5],o,this.leg?24:15,b.minX-band,b.maxX+band,b.minY-band,b.maxY+band,b.minZ-band,b.maxZ+band,r,box,this.sat))return -r[box]-1;
    }
    return -1;
  }
  private addPlane(out:Float64Array,index:number,source:Float64Array,extra:number,at=0):void {
    const b=index*4;out[b]=source[at];out[b+1]=source[at+1];out[b+2]=source[at+2];out[b+3]=source[at+3]+extra;
  }
  private initialClear():boolean {
    const o=this.pose,g=this.endpointGround,b=this.endpointAt,j=this.jointGround,a=this.jointAt,slack=RIDER_BLOCKOUT.ragdollBootSupportSlack;
    const jointRadius=ragdollJointGroundSupport(this.leg);
    if(j[a]*o[0]+j[a+1]*o[1]+j[a+2]*o[2]<j[a+3]+jointRadius+slack-1e-8)return false;
    if(g[b]*o[3]+g[b+1]*o[4]+g[b+2]*o[5]<g[b+3]+Math.max(this.leg?RAGDOLL_PARTICLE_RADII[9]:RAGDOLL_PARTICLE_RADII[7],this.terminalSupport(-g[b],-g[b+1],-g[b+2]))+slack-1e-8)return false;
    const dx=o[3]-this.wheelX,dz=o[5]-this.wheelZ;
    return o[4]>this.wheelTop||dx*dx+dz*dz>=RIDER_BLOCKOUT.ragdollWheelClearance**2-EPS;
  }
  private addGroundPlanes():void {
    const slack=RIDER_BLOCKOUT.ragdollBootSupportSlack;
    this.addPlane(this.planes,this.planeCount++,this.jointGround,ragdollJointGroundSupport(this.leg)+slack,this.jointAt);
    const g=this.endpointGround,at=this.endpointAt;
    this.addPlane(this.endPlanes,this.endCount++,g,Math.max(this.leg?RAGDOLL_PARTICLE_RADII[9]:RAGDOLL_PARTICLE_RADII[7],this.terminalSupport(-g[at],-g[at+1],-g[at+2]))+slack,at);
    // An earned cylinder tangent is conservative. The bounded released-end
    // construction may find a side-clear endpoint; it does not enumerate
    // every feasible cylinder boundary or introduce a separate top trial.
    const dx=this.fx-this.wheelX,dz=this.fz-this.wheelZ,distance=Math.sqrt(dx*dx+dz*dz),radius=RIDER_BLOCKOUT.ragdollWheelClearance;
    if(this.fy<=this.wheelTop&&distance<radius+RIDER_BLOCKOUT.ragdollStaticSlack) {
      const b=this.endCount++*4;
      this.endPlanes[b]=distance>EPS?dx/distance:Math.cos(this.heading);this.endPlanes[b+1]=0;this.endPlanes[b+2]=distance>EPS?dz/distance:-Math.sin(this.heading);
      this.endPlanes[b+3]=this.endPlanes[b]*this.wheelX+this.endPlanes[b+2]*this.wheelZ+radius;
    }
  }
  private tryChoice(_trial:number):boolean {this.planeCount=0;this.endCount=0;this.staticEndPlanes=0;this.addGroundPlanes();return this.tryCurrentPlanes();}
  /** A released triangle can turn its boot or hand. The earned finite face
   * stays the same; its oriented support must follow the current triangle. */
  private refreshStaticEndSupport():void {
    for(let i=0;i<this.endCount;i++)if(this.staticEndPlanes&(1<<i)) {
      const at=i*4,p=this.endPlanes;
      p[at+3]=this.endOffsets[i]+Math.max(this.boneRadius,this.terminalSupport(-p[at],-p[at+1],-p[at+2]))+RIDER_BLOCKOUT.ragdollBootSupportSlack;
    }
  }
  private tryCurrentPlanes():boolean {
    const o=this.pose;this.pole.set(this.requestedPole);o.set(this.initialPose);this.invalidateTerminalSupport();
    const dx=o[3]-this.hx,dy=o[4]-this.hy,dz=o[5]-this.hz,reach=Math.sqrt(dx*dx+dy*dy+dz*dz),tx=dx/reach,ty=dy/reach,tz=dz/reach;
    const along=(this.upper*this.upper-this.lower*this.lower+reach*reach)/(2*reach),radius=Math.sqrt(Math.max(0,this.upper*this.upper-along*along));
    let circle=false;
    if(pointMeetsContactPlanes(o[3],o[4],o[5],this.endPlanes,this.endCount))circle=nearestContactCircle(this.hx+tx*along,this.hy+ty*along,this.hz+tz*along,tx,ty,tz,radius,o[33],o[34],o[35],this.planes,this.planeCount,this.sphere);
    if(circle){this.setPoleFromTriangle(this.sphere[0],this.sphere[1],this.sphere[2],o[3],o[4],o[5]);this.writePose(o[3],o[4],o[5]);if(this.terminalGroundClear()&&this.geometryClear())return true;}
    if(pointMeetsContactPlanes(o[0],o[1],o[2],this.planes,this.planeCount)) {
      // This point came from the shared valid triangle and already lies on
      // the upper-bone sphere. Its nearest permissible point is itself.
      this.sphere[0]=o[0];this.sphere[1]=o[1];this.sphere[2]=o[2];
    } else if(!nearestContactSphere(this.hx,this.hy,this.hz,this.upper,o[0],o[1],o[2],this.planes,this.planeCount,this.sphere))return false;
    const kx=this.sphere[0],ky=this.sphere[1],kz=this.sphere[2],vx=kx-this.hx,vy=ky-this.hy,vz=kz-this.hz,base=this.lower*this.lower+this.upper*this.upper;
    // Root-to-end reach limits are exactly linear on the lower-bone sphere.
    const first=this.endCount*4;
    this.endPlanes[first]=vx/this.upper;this.endPlanes[first+1]=vy/this.upper;this.endPlanes[first+2]=vz/this.upper;
    this.endPlanes[first+3]=(vx*kx+vy*ky+vz*kz+(this.minimum*this.minimum-base)*.5)/this.upper;
    this.endPlanes[first+4]=-vx/this.upper;this.endPlanes[first+5]=-vy/this.upper;this.endPlanes[first+6]=-vz/this.upper;
    this.endPlanes[first+7]=-(vx*kx+vy*ky+vz*kz+(this.maximum*this.maximum-base)*.5)/this.upper;
    for(let supportPass=0;supportPass<2;supportPass++) {
      const g=this.endpointGround,b=this.endpointAt;
      this.endPlanes[3]=g[b+3]+Math.max(this.leg?RAGDOLL_PARTICLE_RADII[9]:RAGDOLL_PARTICLE_RADII[7],this.terminalSupport(-g[b],-g[b+1],-g[b+2]))+RIDER_BLOCKOUT.ragdollBootSupportSlack;
      this.refreshStaticEndSupport();
      if(!nearestContactSphere(kx,ky,kz,this.lower,this.fx,this.fy,this.fz,this.endPlanes,this.endCount+2,this.sphere))return false;
      const fx=this.sphere[0],fy=this.sphere[1],fz=this.sphere[2];
      this.setPoleFromTriangle(kx,ky,kz,fx,fy,fz);this.writePose(fx,fy,fz);
      if(this.terminalGroundClear()&&pointMeetsContactPlanes(o[0],o[1],o[2],this.planes,this.planeCount)&&this.geometryClear()){this.released=true;return true;}
    }
    return this.supportSafeEndpoint(kx,ky,kz);
  }
  /** Residual-only fallback: a circumsphere supplies a guaranteed safe bracket,
   * not the rest pose. Four fixed arc candidates approach the closest actual
   * oriented support. Every candidate retains both bones and all other planes. */
  private supportSafeEndpoint(kx:number,ky:number,kz:number):boolean {
    const bracket=this.supportBracket,o=this.pose,g=this.endpointGround,b=this.endpointAt;
    bracket[0]=o[3];bracket[1]=o[4];bracket[2]=o[5];
    this.endPlanes[3]=g[b+3]+(this.leg?BOOT_SPHERE:HAND_SPHERE)+RIDER_BLOCKOUT.ragdollBootSupportSlack;
    this.refreshStaticEndSupport();
    if(!nearestContactSphere(kx,ky,kz,this.lower,this.fx,this.fy,this.fz,this.endPlanes,this.endCount+2,this.sphere))return false;
    bracket[3]=this.sphere[0];bracket[4]=this.sphere[1];bracket[5]=this.sphere[2];
    this.setPoleFromTriangle(kx,ky,kz,bracket[3],bracket[4],bracket[5]);this.writePose(bracket[3],bracket[4],bracket[5]);
    if(!this.terminalGroundClear()||!this.geometryClear())return false;
    for(let candidate=0;candidate<RIDER_BLOCKOUT.ragdollContactSupportRefinements;candidate++) {
      let dx=(bracket[0]+bracket[3])*.5-kx,dy=(bracket[1]+bracket[4])*.5-ky,dz=(bracket[2]+bracket[5])*.5-kz,length=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(length<EPS)break;const scale=this.lower/length;dx=kx+dx*scale;dy=ky+dy*scale;dz=kz+dz*scale;
      this.setPoleFromTriangle(kx,ky,kz,dx,dy,dz);this.writePose(dx,dy,dz);
      const safe=pointMeetsContactPlanes(dx,dy,dz,this.endPlanes,this.endCount+1,4)&&this.terminalGroundClear()&&this.geometryClear();
      const at=safe?3:0;bracket[at]=dx;bracket[at+1]=dy;bracket[at+2]=dz;
    }
    this.setPoleFromTriangle(kx,ky,kz,bracket[3],bracket[4],bracket[5]);this.writePose(bracket[3],bracket[4],bracket[5]);
    this.released=true;return true;
  }
  private terminalGroundClear():boolean {
    const g=this.endpointGround,b=this.endpointAt,o=this.pose;
    return g[b]*o[3]+g[b+1]*o[4]+g[b+2]*o[5]>=g[b+3]+Math.max(this.leg?RAGDOLL_PARTICLE_RADII[9]:RAGDOLL_PARTICLE_RADII[7],this.terminalSupport(-g[b],-g[b+1],-g[b+2]))-EPS;
  }
  private failureFromGround():void {
    const o=this.pose,g=this.jointGround,b=this.jointAt;
    const depth=g[b+3]+ragdollJointGroundSupport(this.leg)-g[b]*o[0]-g[b+1]*o[1]-g[b+2]*o[2];
    this.rememberReaction(g[b],g[b+1],g[b+2],depth+RIDER_BLOCKOUT.ragdollBootSupportSlack);
    const e=this.endpointGround,a=this.endpointAt;
    this.rememberReaction(e[a],e[a+1],e[a+2],e[a+3]+Math.max(this.leg?RAGDOLL_PARTICLE_RADII[9]:RAGDOLL_PARTICLE_RADII[7],this.terminalSupport(-e[a],-e[a+1],-e[a+2]))-e[a]*o[3]-e[a+1]*o[4]-e[a+2]*o[5]+RIDER_BLOCKOUT.ragdollBootSupportSlack);
  }
  private writePose(fx:number,fy:number,fz:number):void {
    this.invalidateTerminalSupport();
    if(this.leg)solveRagdollLeg(this.hx,this.hy,this.hz,fx,fy,fz,this.forwardX,this.forwardZ,this.heading,RIDER_BLOCKOUT,this.pose,this.pole,0,false,false);
    else solveRagdollLimb(this.hx,this.hy,this.hz,fx,fy,fz,this.forwardX,this.forwardZ,this.heading,this.upper,this.lower,this.minimum,this.maximum,RIDER_BLOCKOUT.ragdollKneeVerticalBand,this.pose,this.pole,0,false,false);
  }
  private setPoleFromTriangle(kx:number,ky:number,kz:number,fx:number,fy:number,fz:number):void {
    const dx=fx-this.hx,dy=fy-this.hy,dz=fz-this.hz,squared=dx*dx+dy*dy+dz*dz,dot=((kx-this.hx)*dx+(ky-this.hy)*dy+(kz-this.hz)*dz)/squared;
    const px=kx-this.hx-dot*dx,py=ky-this.hy-dot*dy,pz=kz-this.hz-dot*dz,length=Math.sqrt(px*px+py*py+pz*pz);
    if(length>EPS){this.pole[0]=px/length;this.pole[1]=py/length;this.pole[2]=pz/length;}
  }
  private terminalSupport(nx:number,ny:number,nz:number):number {
    const box=this.leg?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    let axis=-1,positive=false;
    if(nx===0&&nz===0&&(ny===1||ny===-1)){axis=1;positive=ny>0;}
    else if(nx===0&&ny===0&&(nz===1||nz===-1)){axis=2;positive=nz>0;}
    else if(ny===0&&nz===0&&(nx===1||nx===-1)){axis=0;positive=nx>0;}
    if(axis<0)return contactOrientedBoxSupport(nx,ny,nz,this.pose,this.leg?24:15,box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ);
    const index=axis*2+(positive?1:0),bit=1<<index;
    if(this.supportAxisMask&bit)return this.supportAxes[index];
    const value=contactOrientedBoxSupport(nx,ny,nz,this.pose,this.leg?24:15,box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ);
    this.supportAxes[index]=value;this.supportAxisMask|=bit;return value;
  }
  private invalidateTerminalSupport():void {this.supportAxisMask=0;}
  private boxOverlap(box:number):number {
    const o=this.pose,r=this.boneRadius;let flags=0;this.narrowphase+=3;
    if(contactCapsuleOverlapsBox(this.hx,this.hy,this.hz,o[0],o[1],o[2],r,this.records,box,this.breaks))flags|=1;
    if(contactCapsuleOverlapsBox(o[0],o[1],o[2],o[3],o[4],o[5],r,this.records,box,this.breaks))flags|=2;
    const b=this.leg?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    if(contactOrientedBoxOverlaps(o[3],o[4],o[5],o,this.leg?24:15,b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ,this.records,box,this.sat))flags|=2;
    return flags;
  }
  private geometryClear():boolean {
    const o=this.pose,dx=o[3]-this.wheelX,dz=o[5]-this.wheelZ;
    if(o[4]<=this.wheelTop&&dx*dx+dz*dz<RIDER_BLOCKOUT.ragdollWheelClearance**2-EPS)return false;
    let clear=true;
    for(let i=0;i<this.recordCount;i++) {
      const box=this.recordStart+i*RAGDOLL_BOX_STRIDE,flags=this.boxOverlap(box);if(flags===0)continue;clear=false;
      for(let active=0;active<this.active.length;active++)if(this.active[active]===box)this.overlaps[active]|=flags;
    }
    if(!clear)return false;
    return true;
  }
  private rankFaces(box:number,upper:boolean,at:number):void {
    for(let i=0;i<3;i++){this.ranks[at+i]=-1;this.costs[at+i]=Infinity;}
    for(let face=0;face<6;face++) {
      contactBoxFace(this.records,box,face,this.face);const n=this.face,o=this.pose;
      const root=n[0]*this.hx+n[1]*this.hy+n[2]*this.hz-n[3],joint=n[0]*o[0]+n[1]*o[1]+n[2]*o[2]-n[3],end=n[0]*o[3]+n[1]*o[4]+n[2]*o[5]-n[3];
      const need=upper?Math.max(this.boneRadius-root,this.boneRadius-joint):Math.max(this.boneRadius-joint,Math.max(this.boneRadius,this.terminalSupport(-n[0],-n[1],-n[2]))-end);
      const cost=Math.max(0,need)+(upper&&root<this.boneRadius-EPS?1:0);
      for(let i=0;i<3;i++)if(cost<this.costs[at+i]-EPS){for(let j=2;j>i;j--){this.costs[at+j]=this.costs[at+j-1];this.ranks[at+j]=this.ranks[at+j-1];}this.costs[at+i]=cost;this.ranks[at+i]=face;break;}
    }
  }
  private rememberReaction(nx:number,ny:number,nz:number,depth:number):void {
    if(depth>EPS&&(this.reaction[3]===0||depth<this.reaction[3])){this.reaction[0]=nx;this.reaction[1]=ny;this.reaction[2]=nz;this.reaction[3]=depth;}
  }
  private failureFromBox(box:number):void {
    let depth=Infinity;
    for(let face=0;face<6;face++) {
      contactBoxFace(this.records,box,face,this.face);const n=this.face,o=this.pose;
      const need=Math.max(n[3]+this.boneRadius-n[0]*this.hx-n[1]*this.hy-n[2]*this.hz,
        n[3]+this.boneRadius-n[0]*o[0]-n[1]*o[1]-n[2]*o[2],
        n[3]+Math.max(this.boneRadius,this.terminalSupport(-n[0],-n[1],-n[2]))-n[0]*o[3]-n[1]*o[4]-n[2]*o[5]);
      if(need>EPS&&need<depth){depth=need;this.reaction.set(n);this.reaction[3]=need+RIDER_BLOCKOUT.ragdollBootSupportSlack;}
    }
  }
}
