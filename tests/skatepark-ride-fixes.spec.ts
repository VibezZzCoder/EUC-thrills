/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';

/**
 * 1.4.0 ride fixes — the owner's first Foundry Yard ride (2026-10-31).
 *
 * Two clipping defects from his screenshots, captured in game so a fix can be
 * seen rather than argued:
 *
 * 1. **The tyre through the five-stair's risers.** Ridden up (heading −Z from
 *    the stairs' foot at z ≈ 110), the contact patch only rises when it
 *    crosses a riser, so for most of every 0.35 m tread the tyre circle stood
 *    inside the next step's nose.
 * 2. **The parked rider through the deck's side face.** Stopped beside the
 *    stair block's 0.90 m east face (the euro take-off edge, x = 127), the
 *    rest pose leaned the rider into the face.
 *
 * The frames land in `test-results/skatepark/ride-fixes/` with the tag in
 * `RIDE_FIX_TAG` (default `after`), so a before/after pair is two runs of one
 * spec. Nothing here reads a frame interval (`AGENTS.md`).
 */

const SHOTS = process.env.RIDE_FIX_SHOTS ?? 'test-results/skatepark/ride-fixes';
const TAG = process.env.RIDE_FIX_TAG ?? 'after';

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
}

interface Drawn {
  readonly pose: { x: number; y: number; z: number; speed: number; restFactor: number };
  readonly wheel: { x: number; y: number; z: number };
  readonly ground: number;
  readonly rider: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number } | null;
}

/** Seat 0's drawn wheel height and the rider's drawn world bounds below 0.9 m. */
async function drawn(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const game = window.game as unknown as {
      seats: { renderPose: { x: number; y: number; z: number; speed: number; restFactor: number };
        rig: { group: { position: { x: number; y: number; z: number } }; rider: { root: { traverse(f: (o: unknown) => void): void;
          updateWorldMatrix(a: boolean, b: boolean): void } } } }[];
      sampleGround(x: number, z: number): { height: number };
    };
    const seat = game.seats[0];
    const pose = seat.renderPose;
    seat.rig.rider.root.updateWorldMatrix(true, true);
    let rider: Drawn['rider'] = null;
    seat.rig.rider.root.traverse((object) => {
      const mesh = object as { isMesh?: boolean; visible: boolean; geometry?: { attributes: { position: {
        count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } };
        matrixWorld: { elements: number[] } };
      if (mesh.isMesh !== true || !mesh.visible || mesh.geometry === undefined) return;
      const p = mesh.geometry.attributes.position;
      const e = mesh.matrixWorld.elements;
      for (let i = 0; i < p.count; i += 1) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (wy > 0.88) continue;
        if (rider === null) rider = { minX: wx, maxX: wx, minZ: wz, maxZ: wz, minY: wy };
        else {
          rider.minX = Math.min(rider.minX, wx); rider.maxX = Math.max(rider.maxX, wx);
          rider.minZ = Math.min(rider.minZ, wz); rider.maxZ = Math.max(rider.maxZ, wz);
          rider.minY = Math.min(rider.minY, wy);
        }
      }
    });
    return {
      pose: { x: pose.x, y: pose.y, z: pose.z, speed: pose.speed, restFactor: pose.restFactor },
      wheel: { x: seat.rig.group.position.x, y: seat.rig.group.position.y, z: seat.rig.group.position.z },
      ground: game.sampleGround(pose.x, pose.z).height,
      rider,
    };
  });
}

/**
 * The five-stair's profile along z (x 120–124), from the plan's blocks:
 * the deck (0.90) north of 108.5, four 0.35 m treads falling by 0.18, the
 * floor south of 109.9.
 */
function stairGround(z: number): number {
  if (z < 108.5) return 0.9;
  if (z >= 109.9) return 0;
  return 0.9 - (Math.floor((z - 108.5) / 0.35) + 1) * 0.18;
}

/** How deep the drawn tyre circle stands inside the stairs, metres (0 = clear). */
function tyreInStairs(wheel: { y: number; z: number }): number {
  const radius = 0.25;
  const centre = wheel.y + radius;
  let deepest = 0;
  for (let step = -250; step <= 250; step += 1) {
    const dz = step / 1000;
    const bottom = centre - Math.sqrt(Math.max(0, radius * radius - dz * dz));
    deepest = Math.max(deepest, stairGround(wheel.z + dz) - bottom);
  }
  return deepest;
}

test('Foundry Yard ride fixes: the five-stair climb and the parked lean against the deck face', async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(SHOTS, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootAtTier(page, 'level=skatepark', 'high', { freezeAtStart: true, options: { showFps: false } });
  expect(await page.evaluate(() => window.game.levelPlan.id)).toMatch(/^foundry-yard-r\d+$/);

  const report: Record<string, unknown> = { tag: TAG };
  if (TAG === 'before') {
    // The defect as shipped: the near-solid channel told "nothing near" every
    // frame, which draws the pose exactly as the rig did before the fix.
    await page.evaluate(() => {
      const game = window.game as unknown as { applyNearSolids: (seat: { rig: {
        setNearSolids(lift: number, faces: number[]): void } }) => void };
      game.applyNearSolids = (seat) => seat.rig.setNearSolids(0, []);
    });
  }

  // -- 1. Up the five-stair at walking pace, framed from the side. ----------
  // Heading π is −Z: up the steps toward the deck. Each frame stops the tyre
  // part-way across a tread, short of the next riser.
  const climb: unknown[] = [];
  for (const [index, z] of [109.68, 109.6, 109.3].entries()) {
    await page.evaluate(({ z }) => {
      const game = window.game;
      game.placeRider({ x: 121.6, y: 0, z }, Math.PI);
      game.setActions({ throttle: 0, steer: 0 });
      game.setCameraMode('side');
      game.advance(2);
    }, { z });
    await settle(page);
    const state = await drawn(page);
    climb.push({ ...state, tyreInStairs: tyreInStairs(state.wheel) });
    await page.screenshot({ path: join(SHOTS, `stairs-side-${index + 1}-${TAG}.png`) });
    // The tyre and the step, close: the side view keeps the rider near this spot.
    await page.screenshot({ path: join(SHOTS, `stairs-side-${index + 1}-close-${TAG}.png`),
      clip: { x: 660, y: 250, width: 240, height: 240 } });
  }
  // Stopped part-way up with the tyre against a riser: the stopped stance
  // comes in, and the drawn tyre rolls back off the nose onto its tread.
  await page.evaluate(() => {
    const game = window.game;
    game.placeRider({ x: 121.6, y: 0, z: 109.62 }, Math.PI);
    game.setActions({ throttle: 0, steer: 0 });
    game.setCameraMode('side');
    game.advance(150);
  });
  await settle(page);
  {
    const state = await drawn(page);
    climb.push({ ...state, parked: true, tyreInStairs: tyreInStairs(state.wheel) });
    await page.screenshot({ path: join(SHOTS, `stairs-side-parked-${TAG}.png`) });
    await page.screenshot({ path: join(SHOTS, `stairs-side-parked-close-${TAG}.png`),
      clip: { x: 660, y: 250, width: 240, height: 240 } });
  }
  // And the chase view the owner saw: rolling up at about 4 mph.
  await page.evaluate(() => {
    const game = window.game;
    game.placeRider({ x: 121.6, y: 0, z: 110.4 }, Math.PI, 0, 1.8);
    game.setCameraMode('chase');
    game.setActions({ throttle: 0.7, steer: 0 });
  });
  const rolling: unknown[] = [];
  for (let frame = 0; frame < 24; frame += 1) {
    await page.evaluate(() => window.game.advance(4));
    await settle(page);
    const state = await drawn(page);
    rolling.push({ ...state, tyreInStairs: tyreInStairs(state.wheel) });
    if (state.pose.z < 110.1 && state.pose.z > 108.4) {
      await page.screenshot({ path: join(SHOTS, `stairs-chase-${frame}-${TAG}.png`) });
    }
  }
  report.climb = climb;
  report.rolling = rolling;

  // -- 2. Parked beside the deck's east face (x = 127), both ways round. ----
  const parked: unknown[] = [];
  for (const [name, heading] of [['face-left', Math.PI], ['face-right', 0]] as const) {
    await page.evaluate(({ heading }) => {
      const game = window.game;
      // Rolled in along the face, then stopped: the standoff decides the gap.
      game.placeRider({ x: 127.2, y: 0, z: 99.5 }, heading);
      game.setActions({ throttle: 0, steer: 0 });
      game.setCameraMode('chase');
      game.advance(240);
    }, { heading });
    await settle(page);
    const state = await drawn(page);
    parked.push({ name, ...state });
    await page.screenshot({ path: join(SHOTS, `wall-${name}-chase-${TAG}.png`) });
    await page.evaluate(() => { window.game.setCameraMode('overlook'); window.game.advance(2); });
    await settle(page);
    await page.screenshot({ path: join(SHOTS, `wall-${name}-overlook-${TAG}.png`) });
  }
  report.parked = parked;
  report.worst = {
    tyreInStairs: Math.max(...[...climb, ...rolling].map((s) => (s as { tyreInStairs: number }).tyreInStairs)),
    bodyInFace: Math.max(...parked.map((s) => 127 - ((s as Drawn).rider?.minX ?? 127))),
  };
  report.errors = errors;
  await writeFile(join(SHOTS, `report-${TAG}.json`), JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
  // The pins are the fix's; a `before` run records the defect and asserts nothing more.
  if (TAG !== 'before') {
    const worst = report.worst as { tyreInStairs: number; bodyInFace: number };
    expect(worst.tyreInStairs).toBeLessThan(0.003);
    expect(worst.bodyInFace).toBeLessThan(0.001);
  }
});

/**
 * The owner's second ride (2026-10-31): pressing into a wall clipped on every
 * world. His clip is in the town, riding at a tall wall at 0–5 mph: the
 * forward lean of a rider driving into it put the head and hands through the
 * face the wheel is held a tyre radius off. Measured here on the same kind of
 * wall, square on and at 45°, first with the channel told "nothing near" (the
 * control: the defect as it was) and then as shipped.
 */
test('the town: riding into a tall wall square on or at an angle, the drawn body stops at the face', async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(SHOTS, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootAtTier(page, '', 'high', { freezeAtStart: true, options: { showFps: false } });

  // The longest tall authored wall in the town: at least 2 m high and 4 m long.
  const wall = await page.evaluate(() => {
    const plan = window.game.levelPlan as unknown as { segments: { colliders: {
      centre: { x: number; y: number; z: number }; halfExtents: { x: number; y: number; z: number }; rotationY: number }[] }[] };
    let best: { centre: { x: number; y: number; z: number }; halfExtents: { x: number; y: number; z: number };
      rotationY: number } | null = null;
    for (const segment of plan.segments) {
      for (const box of segment.colliders) {
        if (box.halfExtents.y * 2 < 2) continue;
        const long = Math.max(box.halfExtents.x, box.halfExtents.z);
        if (long < 2) continue;
        if (best === null || long > Math.max(best.halfExtents.x, best.halfExtents.z)) best = box;
      }
    }
    return best;
  });
  expect(wall, 'the town has no tall wall to ride into').not.toBeNull();
  const box = wall!;

  /** How deep any drawn body vertex stands inside the wall's box, metres (negative: clear). */
  const depth = async (): Promise<number> => page.evaluate((box) => {
    const game = window.game as unknown as { seats: { rig: { rider: { root: {
      traverse(f: (o: unknown) => void): void; updateWorldMatrix(a: boolean, b: boolean): void } } } }[] };
    const root = game.seats[0].rig.rider.root;
    root.updateWorldMatrix(true, true);
    const cos = Math.cos(box.rotationY);
    const sin = Math.sin(box.rotationY);
    let deepest = Number.NEGATIVE_INFINITY;
    root.traverse((object) => {
      const mesh = object as { isMesh?: boolean; name: string; visible: boolean; parent: unknown;
        geometry?: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } };
        matrixWorld: { elements: number[] } };
      if (mesh.isMesh !== true || mesh.name === 'rider-paddle-mesh' || mesh.geometry === undefined) return;
      for (let node = mesh as { visible: boolean; parent: unknown } | null; node !== null && node !== (root as unknown);
        node = node.parent as { visible: boolean; parent: unknown } | null) if (!node.visible) return;
      const p = mesh.geometry.attributes.position;
      const e = mesh.matrixWorld.elements;
      for (let i = 0; i < p.count; i += 1) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const dx = e[0] * x + e[4] * y + e[8] * z + e[12] - box.centre.x;
        const dy = e[1] * x + e[5] * y + e[9] * z + e[13] - box.centre.y;
        const dz = e[2] * x + e[6] * y + e[10] * z + e[14] - box.centre.z;
        // Into the box's own frame (rotation about +Y).
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const inside = Math.min(box.halfExtents.x - Math.abs(lx), box.halfExtents.y - Math.abs(dy), box.halfExtents.z - Math.abs(lz));
        if (inside > deepest) deepest = inside;
      }
    });
    return deepest;
  }, box);

  const report: Record<string, unknown> = { wall: box };
  for (const [name, angle] of [['square', 0], ['angled', Math.PI / 4]] as const) {
    for (const mode of ['control', 'fixed'] as const) {
      await page.evaluate(({ box, angle, mode }) => {
        const game = window.game as unknown as {
          applyNearSolids?: unknown;
          placeRider(at: { x: number; y: number; z: number }, heading: number, seat?: number, speed?: number): void;
          setActions(a: { throttle: number; steer: number }): void; setCameraMode(m: string): void; advance(n: number): void;
        } & Record<string, unknown>;
        if (mode === 'control') {
          (game as unknown as { applyNearSolids: (seat: { rig: { setNearSolids(lift: number, faces: number[]): void } }) => void })
            .applyNearSolids = (seat) => seat.rig.setNearSolids(0, []);
        } else {
          delete (game as Record<string, unknown>).applyNearSolids;
        }
        // Face the box's long side from 2.5 m out, then drive into it.
        const cos = Math.cos(box.rotationY);
        const sin = Math.sin(box.rotationY);
        const alongX = box.halfExtents.x >= box.halfExtents.z;
        // The long face's outward normal in world terms.
        const nx = alongX ? sin : cos;
        const nz = alongX ? cos : -sin;
        const out = (alongX ? box.halfExtents.z : box.halfExtents.x) + 2.5;
        const heading = Math.atan2(-nx, -nz) + angle;
        game.placeRider({ x: box.centre.x + nx * out, y: 0, z: box.centre.z + nz * out }, heading);
        game.setCameraMode('chase');
        game.setActions({ throttle: 0.6, steer: 0 });
        game.advance(240);
      }, { box, angle, mode });
      await settle(page);
      const into = await depth();
      report[`${name}-${mode}`] = into;
      await page.screenshot({ path: join(SHOTS, `town-wall-${name}-${mode}.png`) });
      if (mode === 'control' && name === 'square') expect(into, 'the control no longer reproduces the clip').toBeGreaterThan(0.1);
      if (mode === 'fixed') expect(into, `${name}: the drawn body stands ${into} m inside the wall`).toBeLessThan(0.005);
    }
  }
  await writeFile(join(SHOTS, 'report-town-wall.json'), JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
