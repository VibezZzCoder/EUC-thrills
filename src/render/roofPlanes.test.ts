/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import { createEuclaudeLevel } from '../level/euclaudeLevel.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { exactBuildingBody } from '../level/protectedSiteEligibility.ts';
import { streetFronts } from '../level/streetFronts.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { residentialSites, parkCaseSites } from '../level/districtSites.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { buildingSourceRecords } from './buildingSourceRecords.ts';
import { districtExteriorSites, exteriorComposition, type DistrictExteriorSite } from './districtExteriorSites.ts';
import { prepareMetricFacades } from './metricFacadePreparation.ts';

/**
 * One owner per roof surface (2026-10-23). The owner's iPhone showed the long
 * Wharf warehouse's eave flicker: each warehouse's riding slab (y 10…11) and the
 * kit cap under it (y 10…10.75, 75 mm inside the slab's edges) faced down in the
 * same y10 plane, and on twelve Wharf shops and across the town every roof rim's
 * top repeated the inner 28 mm of its cap's top. Both fight in the depth buffer,
 * and which colour wins changes with the view.
 *
 * This scans the composed, installed geometry rather than one family's
 * fixture: every drawn level block, every original building piece the props
 * emit (less those a metric shell replaces), every district exterior box and
 * every metric shell polygon, as the installed preparation selects them. Two
 * faces conflict when they share a plane (0.1 mm) with the same outward normal,
 * overlap by more than 10 mm², and draw differently (another mesh, or another
 * colour in the same one: same-mesh same-colour coincidence cannot be seen). A
 * region is excused only when it is buried: just in front of it lies inside one
 * other solid (a box, a gable prism or a building body), or a downward face
 * lies on the ground.
 *
 * **Why `districtExteriorSites.test.ts`'s F1/F2 trim test (~371) missed both:**
 * it takes only `plinth`, `base-panel` and `entry-frame` boxes, compares only
 * each box's outward *vertical* front plane, and runs on isolated one-building
 * fixtures. A cap is a prop piece, a slab is a level collider and a rim is
 * roof trim, so none was ever an input, and no horizontal face was compared.
 * Its pass was right within that scope; this file is the cross-owner one.
 *
 * Scope: the roof line. A conflict is asserted when either face is a cap, a
 * roof rim or a level block, on ordinary buildings (untagged, commercial,
 * residential, industrial). Landmark compositions stack their own caps and
 * stiles and are outside it, as are wall-trim pairs that meet no roof owner;
 * the scan reports those families and does not judge them.
 */
type V3 = readonly [number, number, number];
interface Face { readonly owner: string; readonly colour: string; readonly roof: boolean; readonly label: string; readonly n: V3; readonly pts: readonly V3[] }
interface Solid { readonly cx: number; readonly cy: number; readonly cz: number; readonly hx: number; readonly hy: number; readonly hz: number;
  readonly c: number; readonly s: number; readonly gable: boolean }
const ORDINARY = new Set([undefined, 'commercial', 'residential', 'industrial']);
const BOX_PARTS = new Set(['buildingBody', 'buildingLow', 'buildingTall', 'buildingCap']);

function installedExterior(plan: LevelPlan) {
  const metric = prepareMetricFacades(plan);
  const sites = districtExteriorSites(plan, [...streetFronts(plan), ...environmentSites(plan), ...residentialSites(plan), ...parkCaseSites(plan)],
    new Set(metric.selectedPropIndices));
  return { metric, sites };
}

function compose(plan: LevelPlan, sites: readonly DistrictExteriorSite[], metric: ReturnType<typeof prepareMetricFacades>) {
  const faces: Face[] = [], solids: Solid[] = [];
  const replaced = new Set(metric.descriptors?.replacements.map(record => record.key) ?? []);
  const box = (owner: string, colour: string, roof: boolean, label: string, cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number, yaw: number, drawn = true): void => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    solids.push({ cx, cy, cz, hx, hy, hz, c, s, gable: false });
    if (!drawn) return;
    const axes: V3[] = [[c, 0, -s], [0, 1, 0], [s, 0, c]], half = [hx, hy, hz];
    for (let a = 0; a < 3; a += 1) for (const sign of [-1, 1]) {
      const n = axes[a].map(v => v * sign) as unknown as V3, b = axes[(a + 1) % 3], d = axes[(a + 2) % 3];
      const hb = half[(a + 1) % 3], hd = half[(a + 2) % 3], f = [cx + n[0] * half[a], cy + n[1] * half[a], cz + n[2] * half[a]];
      faces.push({ owner, colour, roof, label, n, pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
        [0, 1, 2].map(k => f[k] + b[k] * hb * u + d[k] * hd * v) as unknown as V3) });
    }
  };
  for (const [si, segment] of plan.segments.entries()) for (const [bi, b] of segment.colliders.entries()) if (b.drawn !== false)
    box(`block/${b.appearance ?? b.surface}`, 'plain', true, `collider ${si}/${bi}`, b.centre.x, b.centre.y, b.centre.z,
      b.halfExtents.x, b.halfExtents.y, b.halfExtents.z, b.rotationY);
  for (const [pi, p] of (plan.props ?? []).entries()) {
    if (p.kind !== 'building') continue;
    const ordinary = ORDINARY.has(p.look), body = exactBuildingBody(plan, p);
    if (body) box('', '', false, '', body.centre.x, body.centre.y, body.centre.z, body.halfExtents.x, body.halfExtents.y, body.halfExtents.z, body.rotationY, false);
    const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY), k = p.scale;
    for (const [index, r] of buildingSourceRecords(p).entries()) {
      if (replaced.has(`${pi}/${index}`)) continue;
      const x = p.position.x + k * (c * r.x + s * r.z), z = p.position.z + k * (-s * r.x + c * r.z), yaw = p.rotationY + r.yaw;
      if (r.part === 'roofGable') solids.push({ cx: x, cy: p.position.y + k * r.y, cz: z, hx: k * r.sx / 2, hy: k * r.sy, hz: k * r.sz / 2,
        c: Math.cos(yaw), s: Math.sin(yaw), gable: true });
      else if (BOX_PARTS.has(r.part)) box(`prop/${r.part}`, `${pi}/${index}`, r.part === 'buildingCap', `prop ${pi} ${r.part}`,
        x, p.position.y + k * (r.y + r.sy / 2), z, k * r.sx / 2, k * r.sy / 2, k * r.sz / 2, yaw, ordinary);
    }
  }
  for (const site of sites) for (const part of site.parts) if (part.shape === 'box')
    box(`exterior/${part.finish}`, `${site.propIndex}/${part.colour ?? part.finish}`, part.kind === 'roof-rim', `${site.id} ${part.kind}`,
      part.position.x, part.position.y, part.position.z, part.size.x / 2, part.size.y / 2, part.size.z / 2, part.yaw, ORDINARY.has(site.look));
  for (const surface of metric.descriptors?.surfaces ?? []) faces.push({ owner: `metric/${surface.batchKey}`, colour: `${surface.propIndex}/${surface.colour ?? surface.finish}`,
    roof: false, label: `metric ${surface.propIndex} ${surface.kind}`, n: [surface.normal.x, surface.normal.y, surface.normal.z],
    pts: surface.vertices.map(v => [v.x, v.y, v.z] as const) });
  return { faces, solids };
}

const area = (poly: readonly (readonly number[])[]): number => poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
/** Sutherland–Hodgman: the convex overlap of two convex plane polygons. */
function clip(subject: readonly (readonly number[])[], by: readonly (readonly number[])[]): number[][] {
  let out = subject.map(p => [...p]); const turn = area(by) > 0 ? 1 : -1;
  for (let i = 0; i < by.length && out.length; i += 1) {
    const a = by[i], b = by[(i + 1) % by.length], input = out, side = (p: readonly number[]) => turn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    out = [];
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
const within = (v: Solid, p: readonly number[]): boolean => {
  const dx = p[0] - v.cx, dy = p[1] - v.cy, dz = p[2] - v.cz, lx = v.c * dx - v.s * dz, lz = v.s * dx + v.c * dz, e = 1e-6;
  if (v.gable) return dy >= -e && dy <= v.hy + e && Math.abs(lz) <= v.hz + e && Math.abs(lx) <= v.hx * (1 - dy / v.hy) + e;
  return Math.abs(lx) <= v.hx + e && Math.abs(dy) <= v.hy + e && Math.abs(lz) <= v.hz + e;
};

/** Every visible conflict, with the families outside the roof-line scope counted rather than judged. */
function sharedPlanes(plan: LevelPlan, faces: readonly Face[], solids: readonly Solid[]) {
  const groups = new Map<string, { f: Face; d: number }[]>();
  for (const f of faces) {
    const key = f.n.map(v => Math.round(v * 1e5)).join(','), d = f.n[0] * f.pts[0][0] + f.n[1] * f.pts[0][1] + f.n[2] * f.pts[0][2];
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({ f, d });
  }
  const conflicts: string[] = [], outside = new Map<string, number>();
  for (const list of groups.values()) {
    const n = list[0].f.n, ref: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]], length = Math.hypot(...u);
    for (let i = 0; i < 3; i += 1) u[i] /= length;
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const flat = new Map(list.map(({ f }) => [f, f.pts.map(p => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]])]));
    list.sort((a, b) => a.d - b.d);
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length && list[j].d - list[i].d <= 1e-4; j += 1) {
      const a = list[i].f, b = list[j].f;
      if (a.owner === b.owner && a.colour === b.colour) continue;
      const pa = flat.get(a)!, pb = flat.get(b)!;
      if (Math.max(...pa.map(p => p[0])) <= Math.min(...pb.map(p => p[0])) || Math.max(...pb.map(p => p[0])) <= Math.min(...pa.map(p => p[0]))
        || Math.max(...pa.map(p => p[1])) <= Math.min(...pb.map(p => p[1])) || Math.max(...pb.map(p => p[1])) <= Math.min(...pa.map(p => p[1]))) continue;
      const overlap = clip(pa, pb);
      if (Math.abs(area(overlap)) <= 1e-5) continue;
      // Half a millimetre in front of the shared region: buried in one solid, or under the ground.
      const front = overlap.map(([x, y]) => [0, 1, 2].map(k => list[i].d * n[k] + x * u[k] + y * v[k] + n[k] * 5e-4));
      if (n[1] < -0.999 && front.every(p => p[1] <= fieldHeightAt(plan.heightfield, plan.surround, p[0], p[2]) + 1e-6)) continue;
      if (solids.some(solid => front.every(p => within(solid, p)))) continue;
      const pair = `${a.label} / ${b.label} (${Math.abs(area(overlap)).toFixed(4)} m², n ${n.map(x => +x.toFixed(3)).join(',')}, plane ${list[i].d.toFixed(4)})`;
      if (a.roof || b.roof) conflicts.push(pair);
      else { const family = [a.label, b.label].map(l => l.replace(/^\S+\s+(\d+\s+)?/, '')).sort().join(' / '); outside.set(family, (outside.get(family) ?? 0) + 1); }
    }
  }
  return { conflicts, outside };
}

const wharf = preparePopulationWorld(createEuclaudeLevel()).level;

test('the Wharf: every slab, cap and rim owns its roof plane alone', () => {
  const { metric, sites } = installedExterior(wharf);
  try {
    const { faces, solids } = compose(wharf, sites, metric), found = sharedPlanes(wharf, faces, solids);
    assert.deepEqual(found.conflicts, [], 'roof surfaces with two owners');
    console.log('Wharf shared planes outside the roof line', JSON.stringify(Object.fromEntries(found.outside)));
    // The warehouses' roofs are their slabs: no cap under any of them (`Prop.slabRoof`).
    const warehouses = (wharf.props ?? []).filter(p => p.slabRoof);
    assert.equal(warehouses.length, 4);
    for (const p of warehouses) {
      assert.ok(p.look === undefined && !buildingSourceRecords(p).some(r => r.part === 'buildingCap') && !exteriorComposition(p).some(r => r.part === 'buildingCap'));
      const top = p.position.y + p.size!.y;
      assert.ok(wharf.segments[0].colliders.some(b => b.drawn !== false && Math.abs(b.centre.y - b.halfExtents.y - top) < 1e-9
        && b.centre.x - b.halfExtents.x <= p.position.x - p.size!.x / 2 && b.centre.x + b.halfExtents.x >= p.position.x + p.size!.x / 2
        && b.centre.z - b.halfExtents.z <= p.position.z - p.size!.z / 2 && b.centre.z + b.halfExtents.z >= p.position.z + p.size!.z / 2),
      'a slab-roofed building stands under a drawn slab that starts at its top and covers it');
    }
    // Controls: the scan finds the owner's flicker when a warehouse keeps its cap, and the old 28 mm rim lap.
    const capped = { ...wharf, props: wharf.props!.map(({ slabRoof: _roof, ...p }) => p) };
    const cappedScan = compose(capped, sites, metric), caps = sharedPlanes(capped, cappedScan.faces, cappedScan.solids).conflicts;
    assert.equal(caps.filter(c => /^collider 0\/\d+ \/ prop \d+ buildingCap .* n 0,-1,0, plane -10\.0000/.test(c)).length, 4, caps.join('\n'));
    const lapped = sites.map(site => ({ ...site, parts: site.parts.map(part => part.shape === 'box' && part.kind === 'roof-rim'
      ? { ...part, size: { ...part.size, z: part.size.z + 0.028 }, position: { x: part.position.x - Math.sin(part.yaw) * 0.014, y: part.position.y, z: part.position.z - Math.cos(part.yaw) * 0.014 } } : part) }));
    const lappedScan = compose(wharf, lapped, metric), laps = sharedPlanes(wharf, lappedScan.faces, lappedScan.solids).conflicts;
    assert.equal(laps.filter(c => /roof-rim \/ prop \d+ buildingCap|buildingCap \/ district-exterior\/\d+ roof-rim/.test(c) && / n 0,1,0,/.test(c)).length, 48, 'twelve shops, four rims each');
  } finally { metric.dispose(); }
});

test('the town: district roof rims meet their caps edge to edge, never in the cap top', () => {
  const town = preparePopulationWorld(generateLevel('euc').plan).level, { metric, sites } = installedExterior(town);
  try {
    const { faces, solids } = compose(town, sites, metric), found = sharedPlanes(town, faces, solids);
    assert.deepEqual(found.conflicts, [], 'roof surfaces with two owners');
    console.log('Town shared planes outside the roof line', JSON.stringify(Object.fromEntries(found.outside)));
    // The outline is the old one: each rim stands on its cap's face, flush with its top, 52 mm proud.
    let rims = 0;
    for (const site of sites) for (const part of site.parts) {
      if (part.shape !== 'box' || part.kind !== 'roof-rim' || !ORDINARY.has(site.look)) continue;
      const b = site.building, cap = exteriorComposition(b).find(piece => piece.part === 'buildingCap'
        && Math.abs(b.position.y + piece.y + piece.sy - (part.position.y + part.size.y / 2)) < 1e-9);
      assert.ok(cap, `${site.id} rim top is a cap top`);
      const c = Math.cos(b.rotationY), s = Math.sin(b.rotationY), x = b.position.x + c * cap.x + s * cap.z, z = b.position.z - s * cap.x + c * cap.z;
      const out = Math.sin(part.yaw) * (part.position.x - x) + Math.cos(part.yaw) * (part.position.z - z);
      const face = Math.abs(Math.sin(part.yaw - b.rotationY - cap.yaw)) > 0.5 ? cap.sx / 2 : cap.sz / 2;
      assert.ok(Math.abs(out - part.size.z / 2 - face) < 1e-6 && Math.abs(part.size.z - 0.052) < 1e-9, `${site.id} rim stands on the cap face`);
      rims++;
    }
    assert.ok(rims > 300, `${rims} rims checked`);
  } finally { metric.dispose(); }
});
