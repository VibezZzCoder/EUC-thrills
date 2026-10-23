/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SoftBodyField } from '../simulation/softBodies.ts';
import { EucController,createPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { LaunchPadField } from '../simulation/launchPadField.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { cityLaunchPads } from './launchPadSites.ts';
import { buildPopulationPlan } from './populationPlan.ts';
import type { LevelPlan } from './plan.ts';
import { QUAY_LINES } from './euclaudeLines.ts';
export function quayController(plan:LevelPlan){return new EucController(new PlanTerrainSampler(plan),{spawn:plan.spawn,softBodies:new SoftBodyField(plan.softBodies),launchPads:new LaunchPadField(cityLaunchPads(plan,buildPopulationPlan(plan,plan.populationPaths)))});}
export function naturalRide(plan:LevelPlan,line:typeof QUAY_LINES[number],entrySpeed=0,brakeAfterLanding=true){
 const c=quayController(plan),e=line.entry,pose=createPose();c.reset({position:{x:e.x,y:0,z:e.z},headingY:e.heading},entrySpeed);c.setLaunchPadsArmed(true);
 let hopped=false,lands=0,crashed=false;const events:unknown[]=[],trace:{x:number;y:number;z:number;speed:number;crashed:boolean;body:number[]}[]=[];
 for(let tick=0;tick<2400;tick++){
  const s=c.snapshot(),lip=line.hopLip,hop:boolean=lip!==null&&!hopped&&(e.heading===Math.PI?s.position.z<lip+Math.abs(s.speed)*.125:s.position.z>lip-Math.abs(s.speed)*.125);hopped ||=hop;
  c.step(1/120,{...NEUTRAL_ACTIONS,throttle:brakeAfterLanding&&lands>=line.landings?(s.speed>.03?-1:0):1,hop});const a=c.snapshot();c.writePose(pose);
  if(c.tookOff)events.push({type:'launch',...a.position,speed:a.speed,pad:c.padLaunched});
  if(c.touchedDown){lands++;events.push({type:'land',...a.position,speed:a.speed,quality:c.lastLandingQuality});}
  trace.push({...a.position,speed:a.speed,crashed:a.crashed,body:a.crashed?Array.from(pose.ragdoll):[]});
  crashed ||=a.crashed;
  if(brakeAfterLanding?(a.crashed||(lands>=line.landings&&a.speed<.03)):(crashed&&!a.crashed))break;
 }
 return {line:line.id,entrySpeed,events,lands,end:c.snapshot(),trace};
}

/** Human input margin: no speed servo; 96 held-throttle ticks after the final landing. */
export function runoutRide(plan:LevelPlan,line:typeof QUAY_LINES[number],entrySpeed:number,mode:'reaction'|'coast',jump=true,coastDelayTicks=0){
 const c=quayController(plan),e=line.entry;c.reset({position:{x:e.x,y:0,z:e.z},headingY:e.heading},entrySpeed);c.setLaunchPadsArmed(true);
 let hopped=false,lands=0,landingTick=-1;
 const events:{tick:number;position:{x:number;y:number;z:number};speed:number;quality:string;impact:number}[]=[];
 const trace:{tick:number;x:number;y:number;z:number;speed:number}[]=[];
 for(let tick=0;tick<3600;tick++){
  const s=c.snapshot(),lip=line.hopLip;
  const hop:boolean=jump&&lip!==null&&!hopped&&(e.heading===Math.PI?s.position.z<lip+Math.abs(s.speed)*.125:s.position.z>lip-Math.abs(s.speed)*.125);hopped ||=hop;
  const throttle=landingTick<0?1:mode==='coast'?(tick-landingTick>=coastDelayTicks?0:1):tick-landingTick>=96?(s.speed>.03?-1:0):1;
  c.step(1/120,{...NEUTRAL_ACTIONS,throttle,hop});const a=c.snapshot();
  if(c.touchedDown){
   lands++;events.push({tick,position:{...a.position},speed:a.speed,quality:c.lastLandingQuality,impact:c.lastLandingImpact});
   // Incidental contacts on the stair treads / fast descent are not the final landing.
   if(lands>=line.landings&&landingTick<0&&(line.id!=='L6'||a.position.z< -7)&&(line.id!=='L4'||a.position.z>=21.6))landingTick=tick;
  }
  trace.push({tick,...a.position,speed:a.speed});
  if(a.crashed||(landingTick>=0&&Math.abs(a.speed)<.03))break;
 }
 return {line:line.id,entrySpeed,mode,jump,coastDelayTicks,lands,landingTick,crash:c.snapshot().crashed,events,end:{...c.snapshot().position},speed:c.snapshot().speed,trace};
}
