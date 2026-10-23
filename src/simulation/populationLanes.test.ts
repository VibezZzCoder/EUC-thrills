/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { POPULATION_AUTHORING as R } from '../data/tuning.ts';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { PopulationSimulation, sweepPopulationHulls } from './population.ts';
import type { TerrainSampler } from './world.ts';

const flat: TerrainSampler = {
  sampleGround(x, _z, out) { out.height=0;out.normal.x=0;out.normal.y=1;out.normal.z=0;
    out.surface='pavement';out.offCourse=Math.abs(x)>2.4;return out; },
  raycast(){return null;},
};
function fixture(count: number, offset=1.1): PopulationPlan {
  const paths: PopulationPath[]=[-1,1].map(sign=>({id:`lane-${sign}`,role:'pedestrian',district:'park',closed:false,serviceShuttle:false,
    lengthMetres:80,clearanceRadiusMetres:R.pedestrianRadiusMetres,connections:[],
    points:Array.from({length:81},(_,i)=>({x:sign*offset,y:0,z:sign<0?i:80-i,headingY:sign<0?0:Math.PI,distanceMetres:i,surface:'pavement',sourceSegmentId:'footway'}))}));
  const actors: ActorSpec[]=paths.flatMap(path=>Array.from({length:count},(_,i)=>({id:`${path.id}-${i}`,kind:'walker',pathId:path.id,
    initialDistanceMetres:10+i*4,direction:1,movement:'shuttle',speedMetresPerSecond:1.25,idleSeconds:1,appearanceIndex:i,
    hull:{halfWidthMetres:R.pedestrianRadiusMetres,halfLengthMetres:R.pedestrianRadiusMetres,heightMetres:R.actorHeightMetres}})));
  return {schema:1,rulesRevision:'living-r1',sourceWorldId:'lane-proof',installedWorldId:'lane-proof',contentDigest:'lane-proof',paths,actors,anchors:[],
    report:{missingAuthoredPaths:false,rejected:[],availableKinds:['walker'],missingKinds:[]}};
}
for(const count of [1,3]) test(`Cut 1: ${count}-v-${count} at ±1.1 m passes without waiting, reversal or penetration`,()=>{
  const p=fixture(count),sim=new PopulationSimulation(p,flat);
  for(let tick=0;tick<40*120;tick++){
    const before=sim.snapshot();sim.step(1/120);const after=sim.snapshot();
    for(const a of after.actors){assert.equal(a.direction,1);assert.notEqual(a.activity,'waiting');assert.ok(Math.abs(a.x)+R.pedestrianRadiusMetres<2.4);}
    for(let i=0;i<after.actors.length;i++)for(let j=i+1;j<after.actors.length;j++)
      assert.equal(sweepPopulationHulls(before.actors[i].footprint,after.actors[i].footprint,before.actors[j].footprint,after.actors[j].footprint),null);
  }
  for(const a of sim.snapshot().actors)assert.ok(p.paths[0].id===a.pathId?a.z>55:a.z<25,`${a.id} failed to pass`);
});
test('coincident opposing lanes are a failing control for the no-wait/no-reversal promise',()=>{
  const sim=new PopulationSimulation(fixture(1,0),flat);let failed=false;
  for(let i=0;i<30*120;i++){sim.step(1/120);failed ||= sim.snapshot().actors.some(a=>a.activity==='waiting'||a.direction!==1);}
  assert.ok(failed);
});
