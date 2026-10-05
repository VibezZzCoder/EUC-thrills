/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** One render-only CPU owner prepared before ordinary/Ultra admission. */
import type { PropPartId } from '../data/renderCost.ts';
import { STREET_LIFE } from '../data/streetLife.ts';
import { ENVIRONMENT_BATCHING } from '../data/tuning.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { exactBuildingBody } from '../level/protectedSiteEligibility.ts';
import { scopedEnvironmentSites as environmentSites, scopedParkCaseSites as parkCaseSites,
  scopedResidentialSites as residentialSites, scopedStreetFronts as streetFronts } from './scopedSiteQueries.ts';
import { buildingSourceRecords, buildingSourcePartCounts } from './buildingSourceRecords.ts';
import { buildMetricFacadePlan, metricFacadeCost, metricFacadeShadowCost, metricExtractionLedger,
  type MetricFacadePlan } from './metricFacadePlan.ts';

export interface MetricFacadeRequest {
  /** Explicit original source indices, including [] for diagnostic disable. */
  readonly propIndices?: readonly number[];
  /** Explicit diagnostic seed bound, retaining the original nearest-neighbour behavior.
   * Omitted means complete compatible source frontage components by default. */
  readonly maximumStreetOwners?: number;
}
const compatible = (plan: LevelPlan, prop: Prop | undefined): prop is Prop => !!prop
  && (prop.look === undefined || prop.look === 'commercial' || prop.look === 'residential' || prop.look === 'industrial')
  && !!exactBuildingBody(plan, prop);
function footprintGap(a: Prop, b: Prop): number {
  // Exact box-to-box horizontal gap is established by vertex/edge distance.
  const corners = (prop: Prop): readonly { x: number; z: number }[] => {
    const c = Math.cos(prop.rotationY), s = Math.sin(prop.rotationY), size = prop.size!;
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) => ({
      x: prop.position.x + c * x * size.x / 2 + s * z * size.z / 2,
      z: prop.position.z - s * x * size.x / 2 + c * z * size.z / 2 }));
  };
  const aa = corners(a), bb = corners(b);
  // Separating axes detect contact/containment as well as crossed edges.
  let separated = false;
  for (const polygon of [aa,bb]) for (let edge=0;edge<4;edge++) {
    const first=polygon[edge], last=polygon[(edge+1)%4], nx=last.z-first.z, nz=first.x-last.x;
    const ap=aa.map(point=>point.x*nx+point.z*nz), bp=bb.map(point=>point.x*nx+point.z*nz);
    if (Math.max(...ap)<Math.min(...bp) || Math.max(...bp)<Math.min(...ap)) separated=true;
  }
  if (!separated) return 0;
  const pointSegment = (p: {x:number;z:number}, q: {x:number;z:number}, r: {x:number;z:number}): number => {
    const dx = r.x-q.x, dz = r.z-q.z, length = dx*dx+dz*dz;
    const t = Math.max(0,Math.min(1,((p.x-q.x)*dx+(p.z-q.z)*dz)/length));
    return Math.hypot(p.x-q.x-t*dx,p.z-q.z-t*dz);
  };
  let gap = Infinity;
  for (const [points, edges] of [[aa,bb],[bb,aa]]) for (const point of points)
    for (let edge=0;edge<4;edge++) gap=Math.min(gap,pointSegment(point,edges[edge],edges[(edge+1)%4]));
  return gap;
}

type MetricRolloutFamily = 'commercial' | 'residential' | 'industrial' | 'untagged';
const rolloutFamily = (prop: Prop | undefined): prop is Prop => !!prop
  && (prop.look === undefined || prop.look === 'commercial' || prop.look === 'residential' || prop.look === 'industrial');

/** Actual admitted source offers only. Collecting facade seeds never creates or
 * expands a shop, room, walk, furnishing, actor or protected opening. */
function sourceOffers(plan: LevelPlan): { readonly offered: ReadonlySet<number>;
  readonly streets: ReadonlyMap<number, ReadonlySet<string>> } {
  const props = plan.props ?? [], originals = new Map<Prop,number>(props.map((prop,index) => [prop,index]));
  const offered = new Set<number>(), streets = new Map<number,Set<string>>();
  const offer = (index: number, street?: string): void => {
    if (!compatible(plan,props[index])) return;
    offered.add(index);
    if (street !== undefined) { const ids=streets.get(index)??new Set<string>(); ids.add(street); streets.set(index,ids); }
  };
  for (const front of plan.districtAdjacency?.frontages ?? []) offer(front.propIndex,front.streetSegmentId);
  for (const site of [...streetFronts(plan), ...environmentSites(plan), ...residentialSites(plan)]) {
    const index = originals.get(site.building);
    if (index !== undefined) {
      offer(index, 'streetSegmentId' in site && typeof site.streetSegmentId === 'string' ? site.streetSegmentId : undefined);
    }
  }
  return { offered,streets };
}

/** Explicit bounded diagnostics preserve the original seed ranking, nearest
 * neighbour, source-family identity and thresholds exactly. */
function boundedMetricFacadeOwners(plan: LevelPlan, maximum: number, offered: ReadonlySet<number>): readonly number[] {
  if (!(maximum > 0) || (!Number.isInteger(maximum) && maximum !== Infinity)) throw new Error('Metric street-owner maximum must be positive');
  const props=plan.props??[];
  const ranked = [...offered].sort((a,b) => Math.hypot(props[a].position.x-plan.spawn.position.x,props[a].position.z-plan.spawn.position.z)
    - Math.hypot(props[b].position.x-plan.spawn.position.x,props[b].position.z-plan.spawn.position.z) || a-b);
  const selected = new Set(ranked.slice(0,maximum));
  for (const owner of [...selected]) {
    const source=props[owner];
    const neighbours=props.map((prop,index) => ({prop,index})).filter(({prop,index}) => index!==owner
      && compatible(plan,prop) && prop.look===source.look && Math.abs(Math.sin(prop.rotationY-source.rotationY))<0.25)
      .map(({prop,index}) => ({index,gap:footprintGap(source,prop)})).filter(entry=>entry.gap<=12)
      .sort((a,b)=>a.gap-b.gap || a.index-b.index);
    if (neighbours[0]) selected.add(neighbours[0].index);
  }
  return [...selected].sort((a,b)=>a-b);
}

export interface MetricFacadeDefaultEdge {
  readonly fromPropIndex: number;
  readonly toPropIndex: number;
  readonly gapMetres: number;
}
export interface MetricFacadeDefaultGroup {
  readonly family: MetricRolloutFamily;
  readonly propIndices: readonly number[];
  readonly seedPropIndices: readonly number[];
  readonly streetSegmentIds: readonly string[];
}
export interface MetricFacadeDefaultSelection {
  /** Finite exact-body commercial/residential/industrial/untagged source nodes, including unseeded ones. */
  readonly eligiblePropIndices: readonly number[];
  readonly seedPropIndices: readonly number[];
  /** Complete selected component edges; source indices and actual footprint gap. */
  readonly edges: readonly MetricFacadeDefaultEdge[];
  readonly groups: readonly MetricFacadeDefaultGroup[];
  /** Remaining explicit non-rollout fallback, if any. */
  readonly fallbackPropIndices: readonly number[];
  readonly selectedPropIndices: readonly number[];
}

/** Pure, finite source witness for the no-query default. It is constructed only
 * during preparation, not stored globally or evaluated by a frame hook. All
 * source-family pairs are considered, then entire seeded components are kept. */
export function metricFacadeDefaultSelection(plan: LevelPlan): MetricFacadeDefaultSelection {
  const props=plan.props??[], offers=sourceOffers(plan);
  const eligible=props.flatMap((prop,index)=>rolloutFamily(prop)&&compatible(plan,prop)?[index]:[]);
  const eligibleSet=new Set(eligible), seeds=[...offers.offered].filter(index=>eligibleSet.has(index)).sort((a,b)=>a-b);
  // Nearby legacy office masses form the visible spawn plaza. Upgrade their
  // construction without inventing shops/entries or expanding physical content.
  const sceneReachMetres=96;
  for (const index of eligible) {
    const prop=props[index]; if(prop.look!==undefined)continue;
    const dx=plan.spawn.position.x-prop.position.x,dz=plan.spawn.position.z-prop.position.z;
    const c=Math.cos(prop.rotationY),sn=Math.sin(prop.rotationY);
    const gap=Math.hypot(Math.max(0,Math.abs(c*dx-sn*dz)-prop.size!.x/2),
      Math.max(0,Math.abs(sn*dx+c*dz)-prop.size!.z/2));
    if(gap<=sceneReachMetres&&!seeds.includes(index))seeds.push(index);
  }
  seeds.sort((a,b)=>a-b);
  const seedSet=new Set(seeds), neighbours=new Map<number,number[]>(eligible.map(index=>[index,[]]));
  const allEdges:MetricFacadeDefaultEdge[]=[];
  for(let first=0;first<eligible.length;first++)for(let last=first+1;last<eligible.length;last++){
    const a=eligible[first],b=eligible[last],aa=props[a],bb=props[b];
    if(aa.look!==bb.look||Math.abs(Math.sin(aa.rotationY-bb.rotationY))>=0.25)continue;
    const gap=footprintGap(aa,bb);if(!Number.isFinite(gap)||gap>12)continue;
    neighbours.get(a)!.push(b);neighbours.get(b)!.push(a);
    allEdges.push({fromPropIndex:a,toPropIndex:b,gapMetres:gap});
  }
  const visited=new Set<number>(), selected=new Set<number>(), groups:MetricFacadeDefaultGroup[]=[];
  for(const first of eligible){
    if(visited.has(first))continue;
    const pending=[first];visited.add(first);
    for(let cursor=0;cursor<pending.length;cursor++)for(const next of neighbours.get(pending[cursor])!){
      if(!visited.has(next)){visited.add(next);pending.push(next);}
    }
    const members=pending.sort((a,b)=>a-b),componentSeeds=members.filter(index=>seedSet.has(index));
    if(componentSeeds.length===0)continue;
    for(const member of members)selected.add(member);
    const streets=new Set(componentSeeds.flatMap(index=>[...(offers.streets.get(index)??[])]));
    groups.push({family:(props[first].look??'untagged') as MetricRolloutFamily,propIndices:members,seedPropIndices:componentSeeds,
      streetSegmentIds:[...streets].sort()});
  }
  const edges=allEdges.filter(edge=>selected.has(edge.fromPropIndex));
  // Exact original source bodies only. Non-building landmarks remain untouched.
  const fallback=boundedMetricFacadeOwners(plan,1,offers.offered).filter(index=>!rolloutFamily(props[index]));
  return {eligiblePropIndices:eligible,seedPropIndices:seeds,edges,groups,fallbackPropIndices:fallback,
    selectedPropIndices:[...new Set([...selected,...fallback])].sort((a,b)=>a-b)};
}

/** No query selects complete compatible source components seeded by actual frontage offers or nearby untagged spawn masses.
 * Explicit source lists and explicitly bounded diagnostics keep their identity. */
export function selectMetricFacadeOwners(plan: LevelPlan, request: MetricFacadeRequest = {}): readonly number[] {
  if (request.propIndices !== undefined) {
    const selected = [...request.propIndices];
    if (new Set(selected).size !== selected.length || selected.some(index => !Number.isInteger(index)
      || !compatible(plan, plan.props?.[index]))) throw new Error('Metric explicit selection needs unique compatible original prop indices');
    return selected;
  }
  if(request.maximumStreetOwners===undefined)return metricFacadeDefaultSelection(plan).selectedPropIndices;
  const maximum=request.maximumStreetOwners;
  if (!(maximum > 0) || (!Number.isInteger(maximum) && maximum !== Infinity)) throw new Error('Metric street-owner maximum must be positive');
  return boundedMetricFacadeOwners(plan,maximum,sourceOffers(plan).offered);
}

/** Diagnostic only, never options/persistence/simulation. */
export function metricFacadeRequestFromSearch(search: string): MetricFacadeRequest {
  const value=new URLSearchParams(search).get('metricfacades');
  if (value===null) return {};
  if (value==='off') return {propIndices:[]};
  if (value==='all') return {maximumStreetOwners:Infinity};
  if (!/^\d+(,\d+)*$/.test(value)) throw new Error('Invalid diagnostic metricfacades original-index list');
  return {propIndices:value.split(',').map(Number)};
}
export interface PreparedMetricFacades {
  readonly source: LevelPlan;
  readonly selectedPropIndices: readonly number[];
  readonly descriptors: MetricFacadePlan | null;
  readonly sourceCounts: ReadonlyMap<PropPartId,number>;
  readonly removedCounts: ReadonlyMap<PropPartId,number>;
  readonly price: (ReturnType<typeof metricFacadeCost> & ReturnType<typeof metricFacadeShadowCost>) | null;
  readonly disposed: boolean;
  dispose(): void;
}
export function prepareMetricFacades(plan: LevelPlan, request: MetricFacadeRequest = {}): PreparedMetricFacades {
  const selected=selectMetricFacadeOwners(plan,request);
  // RL-4: draw-batch and split pitches come from ENVIRONMENT_BATCHING.
  let descriptors: MetricFacadePlan|null=selected.length ? buildMetricFacadePlan(plan,{propIndices:selected,protectedOpenings:[
    ...streetFronts(plan),...environmentSites(plan),...residentialSites(plan),...parkCaseSites(plan),
  ].map(front=>({...front,height:('height' in front ? front.height : undefined)??STREET_LIFE.frontageHeight})),
    batchMetres:ENVIRONMENT_BATCHING.metricFacadeBatchMetres,chunkMetres:ENVIRONMENT_BATCHING.metricFacadeChunkMetres}) : null;
  let price=descriptors ? {...metricFacadeCost(descriptors),...metricFacadeShadowCost(descriptors)} : null;
  const sourceCounts=new Map(buildingSourcePartCounts(plan)), removedCounts=new Map<PropPartId,number>();
  if (descriptors) {
    // Independent actual-emitter records validate every descriptor's omission.
    const ledger=metricExtractionLedger(descriptors);
    for (const [index,prop] of (plan.props??[]).entries()) for (const [pieceIndex,piece] of buildingSourceRecords(prop).entries())
      if (ledger.consume(index,pieceIndex,piece)) removedCounts.set(piece.part,(removedCounts.get(piece.part)??0)+1);
    ledger.assertComplete();
  }
  let disposed=false;
  return {source:plan,selectedPropIndices:selected,
    get descriptors(){if(disposed)throw new Error('Disposed metric preparation');return descriptors;},
    sourceCounts,removedCounts,get price(){if(disposed)throw new Error('Disposed metric preparation');return price;},
    get disposed(){return disposed;},dispose(){if(disposed)return;disposed=true;descriptors=null;price=null;sourceCounts.clear();removedCounts.clear();}};
}
export function metricSourcePrice(prepared: PreparedMetricFacades, ultra: boolean, triangles: (part:PropPartId)=>number,
  nearCasts: (part:PropPartId)=>boolean = () => false): {
  colourDrawDelta:number;colourTriangleDelta:number;shadowDrawDelta:number;shadowTriangleDelta:number;
  proxyBytes:number;discardedColourTriangles:number;
} {
  if(prepared.disposed)throw new Error('Disposed metric source price');
  let colourDrawDelta=0,colourTriangleDelta=0,shadowDrawDelta=0,shadowTriangleDelta=0,proxyBytes=0,discardedColourTriangles=0;
  const roofCounts=new Map<PropPartId,number>();
  for(const record of prepared.descriptors?.replacements??[]) if(record.replacement==='residential-roof') {
    if(record.source.part!=='roofGable')throw new Error('Metric roof ownership escaped original residential gable');
    roofCounts.set(record.source.part,(roofCounts.get(record.source.part)??0)+1);
  }
  for(const [part,removed] of prepared.removedCounts){
    const all=prepared.sourceCounts.get(part)??0,omitted=ultra?(roofCounts.get(part)??0):removed;
    if(removed>all||omitted>removed)throw new Error('Metric extraction exceeds actual original emission count');
    colourTriangleDelta-=omitted*triangles(part);
    if(omitted>0&&omitted===all)colourDrawDelta--;
    if(nearCasts(part)){
      shadowTriangleDelta-=omitted*triangles(part);
      if(omitted>0&&omitted===all)shadowDrawDelta--;
    }
    const retainedProxies=ultra?removed-omitted:0;
    if(retainedProxies){proxyBytes+=all-omitted;discardedColourTriangles+=retainedProxies*triangles(part);}
  }
  return {colourDrawDelta,colourTriangleDelta,shadowDrawDelta,shadowTriangleDelta,proxyBytes,discardedColourTriangles};
}
