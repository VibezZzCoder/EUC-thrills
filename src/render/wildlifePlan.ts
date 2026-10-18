/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-only admission. New positional salts never consume a route seed stream.
 * No plan writes, collision registration, controller input, or per-frame sampler. */
import type { LevelPlan, BoxCollider } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PROP_SIZES } from '../data/props.ts';
import { WILDLIFE as W } from '../data/tuning.ts';
import { positionHash01 } from '../shared/maths.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';
import type { VegetationExclusionDisc } from './environmentVegetationPlan.ts';
import { RouteSpine, createSpineSample } from '../simulation/routeSpine.ts';
export interface SquirrelSite {
  readonly treeIndex: number;
  readonly home: Vec3;
  readonly refuge: Vec3;
  readonly heights: readonly number[];
  readonly normals: readonly Vec3[];
  readonly dodgeMetres:number;
  readonly phase: number;
  readonly climbInset: number;
}
function boxContains(box: BoxCollider, x: number, z: number, margin: number): boolean {
  const dx = x - box.centre.x, dz = z - box.centre.z;
  const c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
  return Math.abs(c * dx - s * dz) < box.halfExtents.x + margin
    && Math.abs(s * dx + c * dz) < box.halfExtents.z + margin;
}
type Point = { x:number;z:number };
function pointSegment(p:Point,a:Point,b:Point):number {
  const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
  const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
function cross(a:Point,b:Point,p:Point):number { return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x); }
function segmentDistance(a:Point,b:Point,c:Point,d:Point):number {
  const ab0=cross(a,b,c),ab1=cross(a,b,d),cd0=cross(c,d,a),cd1=cross(c,d,b);
  if(ab0*ab1<=0&&cd0*cd1<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))
    &&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z)))return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function corridorTouches(a:Point,b:Point,polygon:readonly Point[],radius:number):boolean {
  for(const p of [a,b]) {
    let positive=false,negative=false;
    for(let i=0;i<polygon.length;i++){const v=cross(polygon[i],polygon[(i+1)%polygon.length],p);if(v>0)positive=true;if(v<0)negative=true;}
    if(!(positive&&negative))return true;
  }
  return polygon.some((p,i)=>segmentDistance(a,b,p,polygon[(i+1)%polygon.length])<=radius);
}
/**
 * An exact prefilter for `grassCorridor`'s scan of every non-grass precise
 * paving triangle (2026-10-18, boot CPU). It changes which triangles are
 * *asked*, never what any answer is: the candidates are tested with the same
 * `corridorTouches`, in their original order, and a triangle is skipped only
 * when that call provably returns false.
 *
 * Proof sketch. A triangle is "regular" when its three vertices are finite,
 * |x|,|z| <= coordinateLimit, its longest edge L >= minimumEdgeMetres and its
 * doubled area 2A >= 2·minimumShape·L² (shape ε = minimumShape). Skip it only
 * when its AABB is disjoint from the corridor's AABB grown by r + guardMetres,
 * so both corridor ends lie more than D = guardMetres from it, and every edge's
 * AABB is disjoint from segment ab's AABB by more than r.
 * - The edge part: segmentDistance's overlap test is exact min/max compares,
 *   so it is false; every point-segment distance is > r + D, far above the
 *   ~1e-11 m rounding of hypot at these magnitudes.
 * - The inside part (the "on the line counts as inside" sign test): the three
 *   exact crosses sum to 2A, so one is > A >= εL²/2; a point at distance > D
 *   lies outside the triangle grown by δ = D·r_in/L, so one cross is
 *   < −ε²·L·D/3. Each computed cross errs by at most ~2·3.3e-16·L·W with
 *   W = 2√2·coordinateLimit, and ε² = 1e-6 > 6·3.3e-16·W/D ≈ 2.8e-10, so the
 *   computed signs are mixed and the test says "outside".
 * Every other triangle (degenerate, collinear, non-finite, huge, malformed)
 * is always tested, in place — and so is a regular one whose box would be filed
 * in more than maximumBucketsPerTriangle buckets (one near the coordinate limit
 * would take ~1.6e8; the widest in a shipped world takes 4). Asking a triangle
 * that can be skipped never changes an answer, so that cap is exact. Corridor
 * ends outside the limit, or a patch list of an unexpected shape, use the
 * original full loop. These numbers decide only how much is skipped, never an
 * answer, so they are not tuning.
 */
const CORRIDOR_INDEX = Object.freeze({ cellMetres: 16, guardMetres: 2, minimumShape: 1e-3,
  minimumEdgeMetres: 1e-3, coordinateLimit: 1e5, maximumRadiusMetres: 100, maximumBucketsPerTriangle: 64 });
interface CorridorIndex {
  readonly polygons: readonly (readonly Point[])[];
  readonly always: readonly number[];
  readonly minX: Float64Array; readonly maxX: Float64Array;
  readonly minZ: Float64Array; readonly maxZ: Float64Array;
  readonly originX: number; readonly originZ: number;
  readonly columns: number; readonly rows: number;
  readonly buckets: ReadonlyMap<number, readonly number[]>;
  readonly stamp: Int32Array;
  query: number;
}
function finiteWithin(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= CORRIDOR_INDEX.coordinateLimit;
}
/** The non-grass patch triangles in `grassCorridor`'s own visit order, or null
 * when the list is not the plain shape that loop expects (it then runs as is). */
function corridorIndex(plan: LevelPlan): CorridorIndex | null {
  const patches = plan.groundSurfacePatches ?? [];
  if (!Array.isArray(patches)) return null;
  const polygons: (readonly Point[])[] = [], always: number[] = [], regular: number[] = [];
  const bounds: number[] = [];
  for (const patch of patches) {
    if (patch === null || typeof patch !== 'object') return null;
    if (patch.surface === 'grass') continue;
    if (!Array.isArray(patch.triangles)) return null;
    for (const triangle of patch.triangles) {
      if (triangle === null || typeof triangle !== 'object') return null;
      const vertices = triangle.vertices as readonly Point[], index = polygons.length;
      polygons.push(vertices);
      const ok = Array.isArray(vertices) && vertices.length === 3
        && vertices.every(v => v !== null && typeof v === 'object' && finiteWithin(v.x) && finiteWithin(v.z));
      if (!ok) { always.push(index); continue; }
      const [p, q, s] = vertices;
      const longest = Math.max((q.x - p.x) ** 2 + (q.z - p.z) ** 2, (s.x - q.x) ** 2 + (s.z - q.z) ** 2,
        (p.x - s.x) ** 2 + (p.z - s.z) ** 2);
      const doubled = Math.abs((q.x - p.x) * (s.z - p.z) - (q.z - p.z) * (s.x - p.x));
      if (!(Math.sqrt(longest) >= CORRIDOR_INDEX.minimumEdgeMetres
        && doubled >= 2 * CORRIDOR_INDEX.minimumShape * longest)) { always.push(index); continue; }
      regular.push(index);
      bounds.push(Math.min(p.x, q.x, s.x), Math.max(p.x, q.x, s.x), Math.min(p.z, q.z, s.z), Math.max(p.z, q.z, s.z));
    }
  }
  const count = polygons.length;
  const minX = new Float64Array(count), maxX = new Float64Array(count), minZ = new Float64Array(count), maxZ = new Float64Array(count);
  let originX = Infinity, originZ = Infinity, farX = -Infinity, farZ = -Infinity;
  for (let k = 0; k < regular.length; k++) {
    const i = regular[k];
    minX[i] = bounds[k * 4]; maxX[i] = bounds[k * 4 + 1]; minZ[i] = bounds[k * 4 + 2]; maxZ[i] = bounds[k * 4 + 3];
    originX = Math.min(originX, minX[i]); farX = Math.max(farX, maxX[i]);
    originZ = Math.min(originZ, minZ[i]); farZ = Math.max(farZ, maxZ[i]);
  }
  const cell = CORRIDOR_INDEX.cellMetres;
  const columns = regular.length ? Math.floor((farX - originX) / cell) + 1 : 0;
  const rows = regular.length ? Math.floor((farZ - originZ) / cell) + 1 : 0;
  const buckets = new Map<number, number[]>();
  // Monotone floor((x − origin)/cell): any AABB meeting the query box shares a bucket with it.
  for (const i of regular) {
    const c0 = Math.floor((minX[i] - originX) / cell), c1 = Math.floor((maxX[i] - originX) / cell);
    const r0 = Math.floor((minZ[i] - originZ) / cell), r1 = Math.floor((maxZ[i] - originZ) / cell);
    // Too wide to file: asked on every query instead (candidates are sorted).
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > CORRIDOR_INDEX.maximumBucketsPerTriangle) { always.push(i); continue; }
    for (let row = r0; row <= r1; row++) for (let column = c0; column <= c1; column++) {
      const key = row * columns + column, list = buckets.get(key);
      if (list) list.push(i); else buckets.set(key, [i]);
    }
  }
  return { polygons, always, minX, maxX, minZ, maxZ, originX, originZ, columns, rows, buckets,
    stamp: new Int32Array(count), query: 0 };
}
/** Indices `grassCorridor` must ask, ascending (its original order), or null
 * when the corridor ends fall outside the proof's limits. */
function corridorCandidates(index: CorridorIndex, a: Point, b: Point, r: number): number[] | null {
  if (!finiteWithin(a.x) || !finiteWithin(a.z) || !finiteWithin(b.x) || !finiteWithin(b.z)
    || !(r >= 0 && r <= CORRIDOR_INDEX.maximumRadiusMetres)) return null;
  const grow = r + CORRIDOR_INDEX.guardMetres;
  const qx0 = Math.min(a.x, b.x) - grow, qx1 = Math.max(a.x, b.x) + grow;
  const qz0 = Math.min(a.z, b.z) - grow, qz1 = Math.max(a.z, b.z) + grow;
  const out = [...index.always];
  if (index.columns > 0) {
    const stamp = ++index.query, cell = CORRIDOR_INDEX.cellMetres;
    const c0 = Math.max(0, Math.floor((qx0 - index.originX) / cell)), c1 = Math.min(index.columns - 1, Math.floor((qx1 - index.originX) / cell));
    const r0 = Math.max(0, Math.floor((qz0 - index.originZ) / cell)), r1 = Math.min(index.rows - 1, Math.floor((qz1 - index.originZ) / cell));
    for (let row = r0; row <= r1; row++) for (let column = c0; column <= c1; column++) {
      const list = index.buckets.get(row * index.columns + column);
      if (!list) continue;
      for (const i of list) {
        if (index.stamp[i] === stamp) continue;
        index.stamp[i] = stamp;
        if (index.maxX[i] < qx0 || index.minX[i] > qx1 || index.maxZ[i] < qz0 || index.minZ[i] > qz1) continue;
        out.push(i);
      }
    }
  }
  return out.sort((x, y) => x - y);
}
/** Closed capsule against every nearby native cell and precise paving triangle;
 * point samples alone can miss a narrow path between two grass probes. */
function grassCorridor(plan:LevelPlan,a:Point,b:Point,index:CorridorIndex|null=null):boolean {
  const f=plan.heightfield,r=W.groundMarginMetres;
  const x0=Math.max(0,Math.floor((Math.min(a.x,b.x)-r-f.originX)/f.spacing));
  const x1=Math.min(f.columns-2,Math.floor((Math.max(a.x,b.x)+r-f.originX)/f.spacing));
  const z0=Math.max(0,Math.floor((Math.min(a.z,b.z)-r-f.originZ)/f.spacing));
  const z1=Math.min(f.rows-2,Math.floor((Math.max(a.z,b.z)+r-f.originZ)/f.spacing));
  for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++) {
    if(f.surfaces[iz*(f.columns-1)+ix]==='grass')continue;
    const x=f.originX+ix*f.spacing,z=f.originZ+iz*f.spacing,d=f.spacing;
    if(corridorTouches(a,b,[{x,z},{x:x+d,z},{x:x+d,z:z+d},{x,z:z+d}],r))return false;
  }
  const candidates=index?corridorCandidates(index,a,b,r):null;
  if(index&&candidates){
    for(const i of candidates)if(corridorTouches(a,b,index.polygons[i],r))return false;
    return true;
  }
  for(const patch of plan.groundSurfacePatches??[])if(patch.surface!=='grass')for(const triangle of patch.triangles)
    if(corridorTouches(a,b,triangle.vertices,r))return false;
  return true;
}
/** Test-only: the exact indexed answer and the full scan, side by side. */
export function grassCorridorForTest(plan: LevelPlan, a: Point, b: Point, indexed: boolean): boolean {
  return grassCorridor(plan, a, b, indexed ? corridorIndex(plan) : null);
}
/** Test-only: which triangles the index always asks, and how many bucket entries it filed. */
export function corridorIndexShapeForTest(plan: LevelPlan): { always: readonly number[]; filed: number } | null {
  const index = corridorIndex(plan);
  if (index === null) return null;
  let filed = 0;
  for (const list of index.buckets.values()) filed += list.length;
  return { always: [...index.always].sort((x, y) => x - y), filed };
}
/** Existing through-line (or exact lap), sampled once during world preparation.
 * No inferred segment ordering, seed consumption or runtime route queries. */
function encounterRoute(plan:LevelPlan):readonly {x:number;z:number;halfWidth:number;distance:number}[] {
  if(plan.lap){let distance=0;return plan.lap.points.map((p,i)=>{
    if(i)distance+=Math.hypot(p.x-plan.lap!.points[i-1].x,p.z-plan.lap!.points[i-1].z);
    return {...p,distance};
  });}
  const spine=RouteSpine.fromPlan(plan);if(!spine)return [];
  const sample=createSpineSample(),points=[];
  for(let d=0;d<spine.length;d+=W.routeSampleMetres)points.push({...spine.sample(d,sample)});
  points.push({...spine.sample(spine.length,sample)});return points;
}
function routeLocation(p:Point,route:ReturnType<typeof encounterRoute>,spawn:Point):{distance:number;offset:number;edge:number;aim:Point} {
  let offset=Infinity,distance=0,edge=Infinity,aim=spawn;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
    const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;
    const x=a.x+dx*t,z=a.z+dz*t,gap=Math.hypot(p.x-x,p.z-z);
    if(gap<offset){offset=gap;distance=a.distance+(b.distance-a.distance)*t;edge=gap-a.halfWidth-(b.halfWidth-a.halfWidth)*t;aim={x,z};}
  }
  if(!route.length){offset=Math.hypot(p.x-spawn.x,p.z-spawn.z);distance=offset;edge=offset;}
  return {distance,offset,edge,aim};
}
/** One predictor for both admission's contact probes and runtime placement. */
function cachedGround(heights:readonly number[],normals:readonly Vec3[],progress:number,out:Vec3):number {
  const index=progress*(heights.length-1),a=Math.min(heights.length-1,Math.floor(index)),b=Math.min(heights.length-1,a+1),t=index-a;
  out.x=normals[a].x+(normals[b].x-normals[a].x)*t;
  out.y=normals[a].y+(normals[b].y-normals[a].y)*t;
  out.z=normals[a].z+(normals[b].z-normals[a].z)*t;
  const magnitude=Math.hypot(out.x,out.y,out.z);out.x/=magnitude;out.y/=magnitude;out.z/=magnitude;
  return heights[a]+(heights[b]-heights[a])*t;
}
export function squirrelSites(plan: LevelPlan, exclusions: readonly VegetationExclusionDisc[] = []): readonly SquirrelSite[] {
  return runSteps(squirrelSitesSteps(plan, exclusions));
}
/** `squirrelSites` as slices, one per candidate tree (`shared/preparationSteps.ts`). */
export function* squirrelSitesSteps(plan: LevelPlan, exclusions: readonly VegetationExclusionDisc[] = []): Steps<readonly SquirrelSite[]> {
  const route=encounterRoute(plan),spawn=plan.spawn.position,normalFloor=Math.cos(W.maximumGroundSlopeRadians);
  const trees = (plan.props ?? []).map((p, treeIndex) => ({ p, treeIndex, rank: positionHash01(p.position.x, p.position.z, 9671) }))
    // Conifers have no exposed trunk in this kit; do not pretend they do.
    .filter(({ p }) => p.kind === 'broadleafTree' && p.scale >= 0.9)
    .map(t=>({...t,at:routeLocation(t.p.position,route,spawn)}))
    .filter(t=>!route.length||t.at.edge<W.encounterVergeMetres+W.forageRadiusMetres)
    .sort((a, b) => a.at.distance-b.at.distance||a.rank-b.rank||a.treeIndex-b.treeIndex);
  if (!trees.length) return [];
  const sampler = new PlanTerrainSampler({ ...plan, solids: [], softBodies: [],
    segments: plan.segments.map(segment => ({ ...segment, colliders: [] })) }), sample = createGroundSample();
  const candidates:{site:SquirrelSite;at:ReturnType<typeof routeLocation>;rank:number}[]=[];
  const boxes = [...plan.segments.flatMap(s => s.colliders), ...(plan.solids ?? []), ...(plan.softBodies ?? [])];
  // Built on the first corridor question; local to this call, so nothing outlives it.
  let corridors: CorridorIndex | null | undefined;
  for (const { p, treeIndex, at, rank } of trees) {
    yield PREPARATION_SLICE;
    const nearbyBoxes=boxes.filter(b=>Math.abs(b.centre.x-p.position.x)<W.forageRadiusMetres+W.groundMarginMetres+Math.hypot(b.halfExtents.x,b.halfExtents.z)
      &&Math.abs(b.centre.z-p.position.z)<W.forageRadiusMetres+W.groundMarginMetres+Math.hypot(b.halfExtents.x,b.halfExtents.z));
    // CylinderGeometry's polygon face, not its circumscribed circle. Align
    // the refuge to an actual face so the two paw pairs can reach flat bark.
    const sides=PROP_SIZES.broadleafTree.trunkSides, faceAngle=Math.PI*2/sides;
    const faceFactor=Math.cos(Math.PI/sides);
    const radius = PROP_SIZES.broadleafTree.trunkRadiusBase * p.scale*faceFactor;
    const directions=Array.from({length:sides},(_,direction)=>direction);
    const wantedYaw=Math.atan2(at.aim.x-p.position.x,at.aim.z-p.position.z);
    // Prefer the actual route-facing polygon face; every fallback still has to
    // prove the complete grass corridor and existing exclusion contracts.
    let best:{site:SquirrelSite;at:ReturnType<typeof routeLocation>;rank:number}|null=null;
    for (const reach of [W.forageRadiusMetres,(W.forageRadiusMetres+W.minimumForageRadiusMetres)/2,W.minimumForageRadiusMetres]) {
    for (const direction of directions) {
      const firstFace=p.rotationY+faceAngle/2;
      const turn=direction===0?0:Math.ceil(direction/2)*(direction%2?1:-1);
      const yaw=firstFace+(Math.round((wantedYaw-firstFace)/faceAngle)+turn)*faceAngle;
      const sx = Math.sin(yaw), sz = Math.cos(yaw);
      const home = { x: p.position.x + sx * reach, y: 0, z: p.position.z + sz * reach };
      const homeAt=routeLocation(home,route,spawn);
      if(route.length&&(homeAt.edge>W.encounterVergeMetres||homeAt.offset>=at.offset))continue;
      if(best&&homeAt.offset>=best.at.offset)continue;
      // The idle chest faces outward; a climber turns inward with soles on bark.
      const refuge = { x: p.position.x + sx * (radius + 0.29), y: p.position.y, z: p.position.z + sz * (radius + 0.29) };
      if(corridors===undefined)corridors=corridorIndex(plan);
      if(!grassCorridor(plan,home,refuge,corridors))continue;
      if(nearbyBoxes.some(box=>{
        const host=Math.hypot(box.centre.x-p.position.x,box.centre.z-p.position.z)<.05
          &&Math.max(box.halfExtents.x,box.halfExtents.z)<radius+.1;
        if(host)return false;
        const c=Math.cos(box.rotationY),s=Math.sin(box.rotationY),hx=box.halfExtents.x,hz=box.halfExtents.z;
        const corners=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([x,z])=>({x:box.centre.x+c*x+s*z,z:box.centre.z-s*x+c*z}));
        return corridorTouches(home,refuge,corners,W.groundMarginMetres);
      }))continue;
      const heights: number[] = [],normals:Vec3[]=[]; let valid = true,dodgeMetres=W.dodgeMetres;
      for (let i = 0; i <= W.pathSamples && valid; i++) {
        const t = i / W.pathSamples, x = home.x + (refuge.x - home.x) * t, z = home.z + (refuge.z - home.z) * t;
        // Complete corridor plus a grass shoulder. Reject finished paving, slopes,
        // pads, gates, targets and foreign solids rather than relocating them.
        for (let ring = 0; ring < 9; ring++) {
          const angle = ring * Math.PI / 4, margin = ring === 8 ? 0 : W.groundMarginMetres;
          const px = x + Math.sin(angle) * margin, pz = z + Math.cos(angle) * margin;
          sampler.sampleGround(px, pz, sample);
          if (sample.surface !== 'grass' || sample.offCourse || sample.normal.y < normalFloor
            || exclusions.some(d => Math.hypot(px - d.x, pz - d.z) < d.radius + 0.5)
            || plan.checkpoints.some(c => boxContains({ ...c, rotationY: c.headingY, surface: 'grass' }, px, pz, 2))
            || (plan.targets ?? []).some(c => Math.hypot(px - c.base.x, pz - c.base.z) < 3)) { valid = false; break; }
        }
        sampler.sampleGround(x, z, sample); heights.push(sample.height);normals.push({...sample.normal});
      }
      if (!valid) continue;
      // A bow can cross a native terrain crease. Only retain a lateral reach
      // whose cached plane agrees with actual grass at preparation time.
      // Half-row checks expose creases between the stored centreline samples.
      const distance=Math.hypot(refuge.x-home.x,refuge.z-home.z),px=(refuge.z-home.z)/distance,pz=-(refuge.x-home.x)/distance;
      const cachedNormal={x:0,y:1,z:0};
      for(let i=0;i<=W.pathSamples*2;i++){
        const t=i/(W.pathSamples*2),x=home.x+(refuge.x-home.x)*t,z=home.z+(refuge.z-home.z)*t;
        const h=cachedGround(heights,normals,t,cachedNormal),nx=cachedNormal.x,ny=cachedNormal.y,nz=cachedNormal.z;
        sampler.sampleGround(x,z,sample);if(Math.abs(h-sample.height)>W.groundContactToleranceMetres){valid=false;break;}
        for(const reach of [W.dodgeMetres,W.dodgeMetres/2,W.dodgeMetres/4]){
          if(reach>dodgeMetres)continue;
          for(const side of [-1,1]){const offset=reach*side;sampler.sampleGround(x+px*offset,z+pz*offset,sample);
            if(Math.abs(sample.height-(h-(nx*px+nz*pz)*offset/ny))>W.groundContactToleranceMetres)dodgeMetres=reach>W.dodgeMetres/4?reach/2:0;
          }
        }
      }
      if(!valid)continue;
      home.y = heights[0]; refuge.y = heights[heights.length - 1];
      const climbInset=faceFactor*(PROP_SIZES.broadleafTree.trunkRadiusBase-PROP_SIZES.broadleafTree.trunkRadiusTop)*p.scale
        *Math.min(1,(W.climbMetres+.20)/(PROP_SIZES.broadleafTree.trunkHeight*p.scale));
      if(!best||homeAt.offset<best.at.offset)best={site:{ treeIndex, home, refuge, heights, normals, dodgeMetres, climbInset, phase: positionHash01(p.position.x, p.position.z, 9673) * Math.PI * 2 },at:homeAt,rank};
    }
    }
    if(best)candidates.push(best);
  }
  const sites:SquirrelSite[]=[];
  // An early encounter, then coverage along the ride instead of eight arbitrary
  // trees in the world. No-route instruments deliberately use spawn proximity.
  const length=route.at(-1)?.distance??0;
  for(let slot=0;slot<W.maximumSquirrels;slot++){
    const available=candidates.filter(c=>sites.every(s=>s.treeIndex!==c.site.treeIndex
      &&Math.hypot(s.refuge.x-c.site.refuge.x,s.refuge.z-c.site.refuge.z)>=W.treeSpacingMetres));
    if(!available.length)break;
    const ahead=slot<2?available.filter(c=>c.at.distance>=W.minimumEarlyEncounterMetres&&c.at.distance<=W.earlyEncounterMetres):[];
    const early=ahead.length?ahead:slot===0?available.filter(c=>c.at.distance<=W.earlyEncounterMetres):[];
    const target=slot===2?W.followingEncounterMetres:Math.max(0,slot-2)*length/(W.maximumSquirrels-2);
    const pool=early.length?early:available;
    pool.sort((a,b)=>{
      const score=(c:typeof a)=>!route.length?c.at.offset:early.length?c.at.offset/(c.at.distance+W.minimumEarlyEncounterMetres)
        :Math.abs(c.at.distance-target)+c.at.offset*2;
      return score(a)-score(b)||a.rank-b.rank||a.site.treeIndex-b.site.treeIndex;
    });sites.push(pool[0].site);
  }
  return sites;
}
export interface SquirrelState {
  progress: number; climb: number; hiddenUntil: number; x: number; y: number; z: number;
  headingY: number; hidden: boolean; running: boolean; escaping: boolean; refugeUntil: number;
  escapeFrom:number;escapeSide:number;groundNormal:Vec3;
}
export function squirrelState(site: SquirrelSite): SquirrelState {
  return { progress: 0, climb: 0, hiddenUntil: -Infinity, ...site.home,
    headingY: Math.atan2(site.home.x - site.refuge.x, site.home.z - site.refuge.z), hidden: false, running: false, escaping:false,refugeUntil:-Infinity,
    escapeFrom:0,escapeSide:1,groundNormal:{...site.normals[0]} };
}
/** Runtime velocity comes from actual pose endpoints, including aerial spins,
 * wobble and contact. Heading/signed speed are a fallback for simple fixtures. */
export interface WildlifeRider extends Vec3 {
  readonly velocityX?:number;readonly velocityZ?:number;
  readonly headingY?:number; readonly speed?:number;
}
export function updateSquirrel(site: SquirrelSite, state: SquirrelState, seconds: number, dt: number,
  riders: readonly WildlifeRider[]): void {
  let threatened=false,overlap=false;
  for(const r of riders){
    if(Math.abs(r.y-state.y)>=W.verticalClearanceMetres)continue;
    const dx=state.x-r.x,dz=state.z-r.z,gap=Math.hypot(dx,dz);
    if(gap<W.safetyMetres)overlap=true;
    if(gap>W.maximumAlertMetres)continue;
    const speed=r.speed??0,yaw=r.headingY??0,vx=r.velocityX??Math.sin(yaw)*speed,vz=r.velocityZ??Math.cos(yaw)*speed,v2=vx*vx+vz*vz;
    if(v2<W.minimumApproachMetresPerSecond**2)continue;
    const toward=dx*vx+dz*vz;if(toward<=0)continue;
    const time=toward/v2,miss2=Math.max(0,dx*dx+dz*dz-toward*toward/v2);
    // Entering the wheel's short swept corridor, not merely visiting its tree.
    if(miss2<W.collisionPathMetres**2&&time<=W.escapeLeadSeconds+W.collisionPathMetres/Math.sqrt(v2))threatened=true;
  }
  // A placed/very fast rider must never meet an animal's body: a cosmetic
  // fallback, not a collision or recovery branch in the controller.
  if(overlap)state.hiddenUntil=seconds+W.hideSeconds;
  if((threatened||overlap)&&!state.escaping){
    state.escapeFrom=state.progress;
    const dx=site.refuge.x-site.home.x,dz=site.refuge.z-site.home.z,d=Math.hypot(dx,dz),px=dz/d,pz=-dx/d;
    let left=Infinity,right=Infinity;
    for(const r of riders){const vx=r.velocityX??Math.sin(r.headingY??0)*(r.speed??0),vz=r.velocityZ??Math.cos(r.headingY??0)*(r.speed??0);
      const x=r.x+vx*W.escapeLeadSeconds,z=r.z+vz*W.escapeLeadSeconds;
      left=Math.min(left,Math.hypot(state.x+px*site.dodgeMetres-x,state.z+pz*site.dodgeMetres-z));
      right=Math.min(right,Math.hypot(state.x-px*site.dodgeMetres-x,state.z-pz*site.dodgeMetres-z));
    }
    state.escapeSide=Math.abs(left-right)<1e-6?(Math.sin(site.phase)>=0?1:-1):left>right?1:-1;
    state.escaping=true;
  }
  const clear = riders.every(r => Math.hypot(r.x - site.home.x, r.z - site.home.z) > W.returnClearMetres
    && Math.hypot(r.x - site.refuge.x, r.z - site.refuge.z) > W.returnClearMetres);
  const distance = Math.hypot(site.home.x - site.refuge.x, site.home.z - site.refuge.z);
  const old = state.progress;
  if (state.escaping) {
    const travel=(1-state.progress)*distance/W.runMetresPerSecond;
    state.progress = Math.min(1, state.progress + dt * W.runMetresPerSecond / distance);
    if (state.progress === 1) state.climb = Math.min(W.climbMetres, state.climb + Math.max(0,dt-travel) * W.climbMetresPerSecond);
    if(state.climb===W.climbMetres){state.escaping=false;state.refugeUntil=seconds+W.refugeSeconds;}
  } else if (clear&&seconds>=state.refugeUntil&&seconds>=state.hiddenUntil) {
    state.climb = Math.max(0, state.climb - dt * W.climbMetresPerSecond * 0.5);
    if (state.climb === 0) {
      // Quiet forage around one short admitted corridor, never a nav agent.
      const wanted = Math.sin(seconds * 0.17 + site.phase) > 0.8 ? 0.42 : 0;
      state.progress += Math.sign(wanted - state.progress) * Math.min(Math.abs(wanted - state.progress), dt * 0.6 / distance);
    }
  }
  if(dt>0)state.running = Math.abs(state.progress - old) > 0.00001;
  state.x = site.home.x + (site.refuge.x - site.home.x) * state.progress;
  state.z = site.home.z + (site.refuge.z - site.home.z) * state.progress;
  // A small sideways bow leaves the wheel's line while staying inside the
  // already admitted grass capsule. Rebase at the current forage position.
  const remaining=Math.max(1e-6,1-state.escapeFrom),phase=(state.progress-state.escapeFrom)/remaining;
  const dodging=state.escaping&&state.climb===0&&state.progress<1;
  const bow=dodging?state.escapeSide*site.dodgeMetres*Math.sin(Math.PI*phase):0;
  const px=(site.refuge.z-site.home.z)/distance,pz=-(site.refuge.x-site.home.x)/distance;
  state.x+=px*bow;state.z+=pz*bow;
  // Follow the actual source trunk taper rather than climbing a cylinder
  // of its ground-level radius. Paws reach bark; the torso stays outside.
  const inset=site.climbInset*state.climb/W.climbMetres;
  state.x-=(site.home.x-site.refuge.x)/distance*inset;
  state.z-=(site.home.z-site.refuge.z)/distance*inset;
  const normal=state.groundNormal;
  state.y = cachedGround(site.heights,site.normals,state.progress,normal)+state.climb
    -(normal.x*px+normal.z*pz)*bow/normal.y;
  if (state.running){const tangent=dodging?state.escapeSide*site.dodgeMetres*Math.PI*Math.cos(Math.PI*phase)/remaining:0;
    state.headingY = Math.atan2(site.refuge.x-site.home.x+px*tangent,site.refuge.z-site.home.z+pz*tangent)+(state.progress<old?Math.PI:0);
  }
  if (state.climb > 0) state.headingY = Math.atan2(site.refuge.x - site.home.x, site.refuge.z - site.home.z);
  state.hidden = seconds < state.hiddenUntil || riders.some(r => Math.hypot(r.x - state.x, r.z - state.z) < W.safetyMetres
    && Math.abs(r.y - state.y) < W.verticalClearanceMetres);
}
