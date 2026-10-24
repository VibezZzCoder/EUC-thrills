/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createEuclaudeLevel } from './euclaudeLevel.ts';
import { buildQuayScenery, COPING, copingSolid, QUAY_ROOF_COLOURS, quayRailingGeometry, quaySceneryTriangles, type QuayRect } from './quayScenery.ts';
import { planRenderCost } from './renderBudget.ts';

const plan = createEuclaudeLevel();

test('Quay dressing is deterministic, finite and priced by its own builder', () => {
  const a = buildQuayScenery(plan)!, b = buildQuayScenery(createEuclaudeLevel())!;
  for (const layer of ['ground', 'raised', 'fine'] as const) {
    assert.deepEqual(a[layer].positions, b[layer].positions, `${layer} positions`);
    assert.deepEqual(a[layer].colours, b[layer].colours, `${layer} colours`);
    assert.ok(a[layer].positions.every(Number.isFinite) && a[layer].normals.every(Number.isFinite));
    assert.equal(a[layer].positions.length % 9, 0);
  }
  const t = quaySceneryTriangles(plan);
  // The phone tier draws all of it: keep the dressing a fraction of the frame.
  assert.ok(t.ground + t.raised < 140_000, `${t.ground + t.raised} dressing triangles`);
  assert.equal(buildQuayScenery({ ...plan, quayScenery: undefined }), null);
  assert.ok(planRenderCost(plan).triangles > planRenderCost({ ...plan, quayScenery: undefined }).triangles + t.ground + t.raised - 1);
});

test('each bed outline is exactly the union of its soft bodies, and no bed shrub props remain', () => {
  const spec = plan.quayScenery!;
  assert.equal(spec.beds.length, 6);
  assert.equal((plan.props ?? []).filter(p => p.kind === 'shrub').length, 0);
  for (const body of plan.softBodies ?? []) {
    const { x, z } = body.centre, inside = spec.beds.some(b => x - body.halfExtents.x >= b.x0 - 1e-9 && x + body.halfExtents.x <= b.x1 + 1e-9
      && z - body.halfExtents.z >= b.z0 - 1e-9 && z + body.halfExtents.z <= b.z1 + 1e-9);
    assert.ok(inside, `soft body at ${x},${z} lies outside every drawn bed`);
  }
});

test('ground dressing never paints the carriageway and stays on the island', () => {
  const g = buildQuayScenery(plan)!.ground.positions, { ring, avenue } = plan.quayScenery!;
  for (let i = 0; i < g.length; i += 3) {
    const x = g[i], z = g[i + 2];
    assert.ok(Math.abs(x) <= 120 && Math.abs(z) <= 90, `ground vertex off the island at ${x},${z}`);
  }
  // Slab centres (every quad's first vertex is a corner) keep out of the road bands.
  const qx = (x: number, z: number): number => {
    const ax = Math.abs(x) - (ring.halfX - ring.radius), az = Math.abs(z) - (ring.halfZ - ring.radius);
    return Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0) - ring.radius;
  };
  let inRoad = 0;
  for (let i = 0; i < g.length; i += 18) {
    const cx = (g[i] + g[i + 3] + g[i + 6]) / 3, cz = (g[i + 2] + g[i + 5] + g[i + 8]) / 3;
    if (Math.abs(qx(cx, cz)) < ring.halfWidth - 0.9 || (Math.abs(cx) < avenue.halfWidth - 0.9 && Math.abs(cz) < avenue.halfLength - ring.halfWidth - 1)) inRoad++;
  }
  // Gutters and edge lines sit inside the carriageway's outer 0.9 m; nothing else may.
  assert.equal(inRoad, 0);
});

// -- See-through railings and roof cues (2026-10-22) -------------------------

// Undrawn boxes are railings, except the rear stair masonry's coping solid, drawn as that wall's coping (2026-10-23).
const undrawn = plan.segments.flatMap(s => s.colliders).filter(c => c.drawn === false);
const copingSolids = undrawn.filter(c => Math.abs(c.halfExtents.y - COPING.depth / 2) < 1e-9);
const hidden = undrawn.filter(c => !copingSolids.includes(c));
const footprint = (c: (typeof hidden)[number]): QuayRect => ({ x0: c.centre.x - c.halfExtents.x, x1: c.centre.x + c.halfExtents.x, z0: c.centre.z - c.halfExtents.z, z1: c.centre.z + c.halfExtents.z });
const within = (r: QuayRect, x: number, z: number, m = 1e-9): boolean => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

test('every undrawn box is drawn as railing: its footprint plinthed, its top a rail, its face the railing face', () => {
  const spec = plan.quayScenery!;
  // The island edge (masonry, top rail, posts) and the ten roof parapets; ramp and stair guards stay walls.
  assert.equal(hidden.length, 4 + 4 + 59 * 2 + 44 * 2 + 10);
  for (const c of hidden) {
    const f = footprint(c), top = c.centre.y + c.halfExtents.y, nx = Math.ceil((f.x1 - f.x0) / 0.5), nz = Math.ceil((f.z1 - f.z0) / 0.5);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = f.x0 + (f.x1 - f.x0) * i / nx, z = f.z0 + (f.z1 - f.z0) * j / nz, runs = spec.railings.filter(r => within(r.plinth, x, z));
      assert.ok(runs.length > 0, `undrawn box footprint at ${x},${z} has no plinth over it`);
      // Nothing invisible stands above a visible rail.
      assert.ok(runs.some(r => r.base + r.rails[r.rails.length - 1] >= top - 1e-9), `box top ${top} at ${x},${z} stands over its railing`);
    }
  }
  const solid = (x: number, z: number): boolean => hidden.some(c => within(footprint(c), x, z, 0));
  for (const r of spec.railings) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len, top = r.base + r.rails[r.rails.length - 1];
    // What stops a wheel is what is drawn: free just in front of the face, solid just behind it.
    for (let t = 0.3; t < len - 0.3; t += 0.5) {
      const x = r.x0 + ux * t, z = r.z0 + uz * t;
      assert.equal(solid(x - r.nx * 0.02, z - r.nz * 0.02), false, `riding side of the face at ${x},${z} is solid`);
      assert.equal(solid(x + r.nx * 0.02, z + r.nz * 0.02), true, `railing face at ${x},${z} has no box behind it`);
    }
    // The top rail is the boxes' own top, never above it.
    const tops = hidden.filter(c => within(r.plinth, c.centre.x, c.centre.z)).map(c => c.centre.y + c.halfExtents.y);
    assert.ok(Math.abs(Math.max(...tops) - top) < 1e-9, `run top ${top} against box tops ${Math.max(...tops)}`);
  }
  // Every drawn railing vertex lies behind its face and no higher than its top rail.
  const parts = quayRailingGeometry(spec), g = Float32Array.from([...parts.raised.positions, ...parts.fine.positions]);
  assert.ok(g.length / 9 > 1000 && g.length / 9 < 12_000, `${g.length / 9} railing triangles`);
  for (let i = 0; i < g.length; i += 3) {
    const x = g[i], y = g[i + 1], z = g[i + 2];
    const ok = spec.railings.some(r => within(r.plinth, x, z, 0.1)
      && (x - r.x0) * r.nx + (z - r.z0) * r.nz >= -1e-4 && y <= r.base + r.rails[r.rails.length - 1] + 1e-4 && y >= (r.look === 'harbour' ? -1e-4 : r.base - 1e-4));
    assert.ok(ok, `railing vertex at ${x},${y},${z} stands proud of its face or top`);
  }
});

test('the slim railing bars cast nothing; the posts and handrails still do', () => {
  const spec = plan.quayScenery!, { raised, fine } = quayRailingGeometry(spec), built = buildQuayScenery(plan)!;
  const extent = (P: Float32Array, i: number): number => Math.max(P[i + 1], P[i + 4], P[i + 7]) - Math.min(P[i + 1], P[i + 4], P[i + 7]);
  // Six faces of two triangles per slim bar: the harbour's two mid rails and its guard rail, the roofs' two mid rails.
  const runs = (look: 'harbour' | 'roof'): number => spec.railings.filter(r => r.look === look).length;
  assert.equal(fine.positions.length / 9, 12 * (3 * runs('harbour') + 2 * runs('roof')));
  assert.deepEqual(built.fine.positions, fine.positions, 'the scenery draws the same fine layer');
  for (let i = 0; i < fine.positions.length; i += 9) assert.ok(extent(fine.positions, i) <= 0.05 + 1e-6, 'only slim bars are fine');
  // Nothing as slim stays in the casting layer: every face there is flat or deeper than a slim bar.
  let handrails = 0;
  for (let i = 0; i < raised.positions.length; i += 9) {
    const e = extent(raised.positions, i);
    assert.ok(e < 1e-6 || e > 0.05 + 1e-6, `a ${e} m face still casts at ${raised.positions[i]},${raised.positions[i + 2]}`);
    const y = raised.positions[i + 1];
    if (e > 0.055 && e < 0.07 && ((y > 1.3 && y < 1.45) || (y > 12.5 && y < 12.65))) handrails++;
  }
  assert.ok(handrails >= 4 * (runs('harbour') + runs('roof')), `${handrails} handrail faces cast`);
});

test('the walls the railings replace keep no coping', () => {
  const r = buildQuayScenery(plan)!.raised.positions;
  for (let i = 0; i < r.length; i += 3) {
    const x = r[i], y = r[i + 1], z = r[i + 2];
    const edge = Math.abs(x) > 117.5 || Math.abs(z) > 87.5, parapet = hidden.some(c => c.centre.y > 11 && within(footprint(c), x, z, 0.1));
    if (edge) assert.ok(Math.abs(y - 1.48) > 1e-3, `island coping left at ${x},${z}`);
    if (parapet) assert.ok(Math.abs(y - 12.68) > 1e-3, `parapet coping left at ${x},${z}`);
  }
});

test('the rear stair wall stops a wheel at its drawn coping, and the ramp-wall joint has one coping either side', () => {
  // 2026-10-23: the masonry's coping is solid (its step from the deck is 0.28 m), exactly where it is drawn.
  assert.equal(copingSolids.length, 1);
  const [solid] = copingSolids, f = footprint(solid), base = solid.centre.y - solid.halfExtents.y;
  const wall = plan.segments.flatMap(s => s.colliders).find(c => c.drawn !== false && Math.abs(c.centre.y + c.halfExtents.y - base) < 1e-9
    && within(footprint(c), solid.centre.x, solid.centre.z));
  assert.ok(wall && Math.abs(base - 1.4) < 1e-9);
  assert.deepEqual(solid, copingSolid(wall));
  const r = buildQuayScenery(plan)!.raised.positions;
  let corners = 0;
  for (let i = 0; i < r.length; i += 3) {
    const x = r[i], y = r[i + 1], z = r[i + 2];
    if (y < base - 1e-6 || y > base + COPING.depth + 1e-6 || !within(f, x, z, 0.2) || z < -1) continue;
    assert.ok(within(f, x, z, 1e-5), `coping drawn outside its solid at ${x},${y},${z}`);
    if ((Math.abs(z - f.z0) < 1e-5 || Math.abs(z - f.z1) < 1e-5) && (Math.abs(x - f.x0) < 1e-5 || Math.abs(x - f.x1) < 1e-5)) corners++;
  }
  assert.ok(corners >= 8, 'and the coping fills the solid to its corners');
  // The deck's east guard meets the return ramp's wall at x 49.8: no coping crosses that joint (no shallow-angle crease).
  for (let i = 0; i < r.length; i += 9) {
    const v = [0, 3, 6].map(k => [r[i + k], r[i + k + 1], r[i + k + 2]]);
    if (v.some(p => p[1] < 2.3 || p[2] <= 1 || p[2] >= 12 || p[0] < 48 || p[0] > 51)) continue;
    const lo = Math.min(...v.map(p => p[0])), hi = Math.max(...v.map(p => p[0]));
    assert.ok(hi <= 49.8 + 1e-5 || lo >= 49.8 - 1e-5, `a coping triangle crosses the joint at x ${lo.toFixed(3)}…${hi.toFixed(3)}`);
  }
});

test('roof cues: a run-up lane to each gap, a hazard band rail to rail, a white landing edge and a tinted zone', () => {
  const paint = plan.quayScenery!.roofPaint!, g = buildQuayScenery(plan)!.ground, P = g.positions, C = g.colours;
  const same = (i: number, c: readonly number[]): boolean => C[i] === Math.fround(c[0]) && C[i + 1] === Math.fround(c[1]) && C[i + 2] === Math.fround(c[2]);
  /** Triangles of one flat colour with their centroid in a z band, as x extent and summed z length. */
  const span = (c: readonly number[] | ((i: number) => boolean), z0: number, z1: number, x0 = -Infinity, x1 = Infinity) => {
    let lo = Infinity, hi = -Infinity, n = 0;
    for (let i = 0; i < P.length; i += 9) {
      if (P[i + 1] < 10.9) continue;
      const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      if (cz < z0 || cz > z1 || cx < x0 || cx > x1 || !(typeof c === 'function' ? c(i) : same(i, c))) continue;
      n++; for (let k = 0; k < 9; k += 3) { lo = Math.min(lo, P[i + k]); hi = Math.max(hi, P[i + k]); }
    }
    return { lo, hi, n };
  };
  const width = paint.x1 - paint.x0;
  assert.equal(paint.gaps.length, 2);
  for (const gap of paint.gaps) {
    // The takeoff edge is unmistakable from the run-up: yellow and ink, rail to rail, at the lip.
    for (const c of [QUAY_ROOF_COLOURS.hazard, QUAY_ROOF_COLOURS.ink]) {
      const s = span(c, gap.lip - 0.65, gap.lip);
      assert.ok(s.n > 10 && s.hi - s.lo > width - 0.6, `hazard band at ${gap.lip}: ${s.lo}..${s.hi}`);
    }
    // The far side: a white edge across the whole landing deck, then the tinted zone.
    const edge = span(QUAY_ROOF_COLOURS.line, gap.landing, gap.landing + 0.7);
    assert.ok(edge.hi - edge.lo > width - 0.4, `landing edge at ${gap.landing}: ${edge.lo}..${edge.hi}`);
    // The landing box: the lane's width, tinted teal over bare deck, closed by a white line, 3.5 m deep at most.
    const zone = span(i => C[i + 1] > C[i] * 1.15 && C[i + 2] > C[i], gap.landing + 0.6, gap.zone);
    assert.ok(zone.n > 20 && zone.hi - zone.lo > paint.laneHalf * 2 - 0.4, `landing zone at ${gap.landing}`);
    assert.ok(gap.zone - (gap.landing + 0.68) <= 3.6, `landing box ${gap.zone - gap.landing - 0.68} m deep`);
    const close = span(QUAY_ROOF_COLOURS.line, gap.zone - 0.15, gap.zone, paint.laneX - paint.laneHalf, paint.laneX + paint.laneHalf);
    // The far line runs between the two side lines, 0.15 m wide each.
    assert.ok(close.hi - close.lo > paint.laneHalf * 2 - 0.35, `landing box at ${gap.landing} is closed: ${close.lo}..${close.hi}`);
    // Both lane lines lead unbroken from the run-up's start to the takeoff band.
    for (const side of [-1, 1]) {
      const x = paint.laneX + side * (paint.laneHalf - 0.075);
      let covered = 0;
      for (let i = 0; i < P.length; i += 18) {
        if (P[i + 1] < 10.9 || !same(i, QUAY_ROOF_COLOURS.line)) continue;
        const xs = [P[i], P[i + 3], P[i + 6]], zs = [P[i + 2], P[i + 5], P[i + 8]];
        if (Math.min(...xs) <= x && Math.max(...xs) >= x && Math.min(...zs) >= gap.from - 1e-6 && Math.max(...zs) <= gap.lip) covered += Math.max(...zs) - Math.min(...zs);
      }
      assert.ok(covered >= gap.lip - 0.62 - gap.from - 1e-3, `lane line ${side} covers ${covered} of the run-up to ${gap.lip}`);
    }
    // A clay-red strip up the lane's middle to the pad, bare deck between it and the lines.
    const run = span(i => C[i] > C[i + 1] * 1.8, gap.from, gap.pad);
    assert.ok(run.n > 20 && run.hi - run.lo > paint.stripHalf * 2 - 0.1, `run-up strip before ${gap.lip}`);
    assert.ok(run.lo >= paint.laneX - paint.stripHalf - 1e-4 && run.hi <= paint.laneX + paint.stripHalf + 1e-4, `run-up strip ${run.lo}..${run.hi} stays in the lane's middle`);
  }
  // Rubber wear darkens the coating softly and nothing else on the deck is dark: outside the hazard
  // band no paint is more than 30% of the way from the coating's darkest tone to rubber, so no dark
  // sliver can read as a crack or sit under the camera. The wear itself is there, in the wheel line.
  const floor = QUAY_ROOF_COLOURS.trackDark.map((c, k) => c * 0.7 + QUAY_ROOF_COLOURS.rubber[k] * 0.3);
  for (let i = 0; i < P.length; i += 9) {
    if (P[i + 1] < paint.y + 0.011 || P[i + 1] > paint.y + 0.019 || same(i, QUAY_ROOF_COLOURS.hazard) || same(i, QUAY_ROOF_COLOURS.ink)) continue;
    for (let v = i; v < i + 9; v += 3) for (let k = 0; k < 3; k++) assert.ok(C[v + k] >= floor[k] - 1e-6, `paint at ${P[v]},${P[v + 2]} too dark`);
  }
  for (const gap of paint.gaps) {
    let line = 0, nLine = 0, aside = 0, nAside = 0;
    for (let v = 0; v < P.length; v += 3) {
      if (Math.abs(P[v + 1] - (paint.y + 0.012)) > 1e-4 || P[v + 2] < gap.pad - 1.5 || P[v + 2] > gap.pad || !(C[v] > C[v + 1] * 1.8)) continue;
      const dx = Math.abs(P[v] - paint.laneX);
      if (dx < 0.3) { line += C[v]; nLine++; } else if (dx > 0.6) { aside += C[v]; nAside++; }
    }
    assert.ok(nLine > 0 && nAside > 0 && line / nLine < (aside / nAside) * 0.95, `the wheel line before the pad at ${gap.pad} is worn darker`);
  }
  // Readable against the deck: white well over the concrete, ink far under the yellow.
  const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const concrete = ((hex: number) => [16, 8, 0].map(s => { const v = ((hex >> s) & 255) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }))(plan.palette!.concrete!);
  assert.ok(lum(QUAY_ROOF_COLOURS.line) > lum(concrete) * 1.8);
  assert.ok(lum(QUAY_ROOF_COLOURS.hazard) > lum(QUAY_ROOF_COLOURS.ink) * 8);
  // The finale's lane reaches the down ramp's top.
  const last = paint.route[paint.route.length - 1];
  assert.ok(last.x > -32 && last.x < -24 && last.z < 40 && last.z > 39, 'route lane ends on the ramp top');
});
