/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { PROVING_GROUND, boot as bootGame, collectErrors } from './harness.ts';
import { CAMERA, EUC, LIGHTING, SIMULATION, TERRAIN, WHEEL } from '../src/data/tuning.ts';
import { lateralCeilingG } from '../src/simulation/lateralCeiling.ts';
import { SURFACES, TERRAIN_SURFACE_IDS } from '../src/data/surfaces.ts';

/**
 * M4 — terrain and surfaces.
 *
 * The headless suite already proves the *models*: the slope term against its
 * closed form, per-surface resistance and grip, the step-up ceiling, the wall
 * slide, the suspension's bump stops, the heightfield sampler on both sides of
 * its triangle split, and the socket continuity of every authored segment. All
 * of that is in `src/simulation/` and `src/level/` with no browser at all,
 * which is what architecture invariant 1 is for. Repeating it here would be
 * slower and no truer.
 *
 * What only a browser can prove is the half of invariant 2 that involves
 * three.js: that the renderer builds its ground **from the plan**, that its own
 * copy is gone, that the two readings agree, that the materials are on screen,
 * that the camera's obstruction pull-in finally has real geometry to fire
 * against, and that a long ride over all seven surfaces leaves no console
 * errors and no resource growth.
 *
 * Nothing here asserts a frame time. See `playwright.config.ts`.
 */

/**
 * **This suite rides the M4 proving ground, not the M7 slice level.**
 *
 * `docs/PLANS.md` §2.5 makes the hand-authored level the *measuring instrument*
 * for the whole movement phase: a level that changes cannot measure whether a
 * movement change made riding better or merely different. Every number this
 * file asserts was settled on that course, so M7 kept it — still built, still
 * tested, and reachable only at `?level=proving` (`src/level/levels.ts`).
 * Re-pointing this evidence at new geometry in the same milestone that authored
 * the geometry would leave nothing fixed to measure against.
 */
const boot = (page: Page, query = ''): Promise<void> => (
  bootGame(page, query === '' ? PROVING_GROUND : `${query}&${PROVING_GROUND}`)
);

const STEPS = (seconds: number): number => Math.round(seconds * SIMULATION.hz);

const MAX_STEP_UP = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;

/**
 * Where a beat starts, and which way it runs, read out of the plan.
 *
 * Never hard-coded. Every one of these specs is about a *mechanism* — the
 * step-up ceiling, the slope term, the obstruction probe — and hard-coding the
 * place would turn each of them into a second test of the route's exact
 * dimensions, which is a thing the owner is expected to move.
 */
async function beat(
  page: import('@playwright/test').Page,
  id: string,
  along = 0,
  lateral = 0,
): Promise<{ x: number; z: number; headingY: number }> {
  return page.evaluate(([beatId, s, t]) => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === beatId);
    if (!segment) throw new Error(`no segment called ${String(beatId)}`);
    const heading = segment.entry.headingY;
    const forward = { x: Math.sin(heading), z: Math.cos(heading) };
    // +X is the rider's left at a zero heading, so this is the same `leftOf`
    // the level authoring uses (`src/level/segments.ts`).
    const left = { x: Math.cos(heading), z: -Math.sin(heading) };
    return {
      x: segment.entry.position.x + forward.x * Number(s) + left.x * Number(t),
      z: segment.entry.position.z + forward.z * Number(s) + left.z * Number(t),
      headingY: heading,
    };
  }, [id, along, lateral] as const);
}

// ---------------------------------------------------------------------------
// One plan, two consumers
// ---------------------------------------------------------------------------

test('the renderer builds its ground from the plan, and its own copy is gone', async ({ page }) => {
  await boot(page);

  const scene = await page.evaluate(() => window.qa.terrainScene());
  const snapshot = await page.evaluate(() => window.qa.snap());

  // The M1 placeholder plane and its ten-kilometre grid were the renderer
  // describing the world itself — the same geometry stated twice, which is the
  // arrangement invariant 2 exists to end.
  expect(scene.placeholderGroundPresent).toBe(false);
  expect(scene.placeholderGridPresent).toBe(false);

  expect(scene.heightfieldPresent).toBe(true);
  expect(scene.surroundPresent).toBe(true);
  // One geometry, one material group per surface actually painted.
  expect(scene.heightfieldGroups).toBe(snapshot.level.surfaces.length);
  expect(scene.heightfieldTriangles).toBe(snapshot.level.cellsDrawn * 2);
  // Every surface the plan paints has a distinct albedo on screen. A palette
  // that collapses is a level the player cannot read.
  expect(scene.heightfieldColours.length).toBe(scene.heightfieldGroups);

  // The blocks are merged per material rather than drawn one at a time.
  expect(scene.blockMeshes.length).toBeGreaterThan(2);
  expect(scene.blockTriangles).toBe(snapshot.level.colliders * 12);
});

test('the drawn ground and the ridden ground are the same surface, to the millimetre', async ({ page }) => {
  await boot(page);

  // The point of one producer. `sampleGround` walks the plan; the mesh is built
  // from the same two arrays with the same cell diagonal, so a vertex the
  // renderer emitted must be a height the sampler reports.
  const agreement = await page.evaluate(() => {
    const plan = window.game.levelPlan;
    const field = plan.heightfield;
    const blocks = plan.segments.flatMap((segment) => segment.colliders);

    // Points under a kerb, a wall, or a bollard are deliberately excluded: the
    // sampler answers the *highest* thing at a point, and the claim under test
    // is about the terrain the heightfield describes, which the blocks stand on
    // rather than replace.
    const underABlock = (x: number, z: number): boolean => blocks.some((block) => {
      const cos = Math.cos(block.rotationY);
      const sin = Math.sin(block.rotationY);
      const dx = x - block.centre.x;
      const dz = z - block.centre.z;
      return Math.abs(cos * dx - sin * dz) <= block.halfExtents.x
        && Math.abs(sin * dx + cos * dz) <= block.halfExtents.z;
    });

    const mismatches: { x: number; z: number; sampled: number; stored: number }[] = [];
    let checked = 0;
    for (let row = 4; row < field.rows - 4; row += 17) {
      for (let column = 4; column < field.columns - 4; column += 13) {
        const x = field.originX + column * field.spacing;
        const z = field.originZ + row * field.spacing;
        if (underABlock(x, z)) continue;
        checked += 1;
        const stored = field.heights[row * field.columns + column];
        const sampled = window.game.sampleGround(x, z).height;
        if (Math.abs(sampled - stored) > 1e-9) mismatches.push({ x, z, sampled, stored });
      }
    }
    return { checked, mismatches: mismatches.slice(0, 5) };
  });

  expect(agreement.checked).toBeGreaterThan(100);
  expect(agreement.mismatches).toEqual([]);
});

test('all seven terrain surfaces are on the ground and reachable', async ({ page }) => {
  await boot(page);

  const level = (await page.evaluate(() => window.qa.snap())).level;
  // **The terrain palette, not every declared surface** — narrowed at M13 for
  // the same reason as the two headless coverage tests it is the browser half
  // of (`level/provingGround.test.ts`, `level/sliceLevel.test.ts`). The spill is
  // a hazard's ground: it is painted only inside a hazard footprint and, by the
  // owner's §13 q9 answer, only in generated routes, so it can never appear in
  // the proving ground. The equality is kept rather than relaxed to a subset,
  // because a *surplus* surface here would mean a hazard had reached the
  // instrument, which is exactly as wrong as a missing one.
  expect(level.surfaces).toEqual([...TERRAIN_SURFACE_IDS].sort());
  expect(level.segments).toBe(10);
  expect(level.colliders).toBeGreaterThan(5);
});

test('the ground stays inside the triangle budget it shares with everything else', async ({ page }) => {
  await boot(page);

  // Triangles and draw calls only — never a frame time (AGENTS.md). Both are
  // read off the renderer's own counters after a real frame.
  const drawn = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.advance(4);
    return window.qa.snap();
  });

  expect(drawn.render.triangles).toBeLessThan(400_000);
  expect(drawn.render.drawCalls).toBeLessThan(150);
});

// ---------------------------------------------------------------------------
// Surfaces — the exit question, in the browser
// ---------------------------------------------------------------------------

test('riding off the pavement onto grass costs speed, immediately and visibly', async ({ page }) => {
  await boot(page);

  const crossing = await page.evaluate(() => {
    // Down the pad at full speed, then straight off the side of it onto the
    // open field. Pavement and grass meet along that edge, which is where the
    // milestone's question is easiest to ask.
    window.qa.resetRide();
    // **Onto the grass at the road's own speed, not at an arbitrary one.**
    // Until M16 this crossed at 14.5 m/s, which was then within a few per cent
    // of what pavement could hold — so the surface difference showed up as an
    // immediate loss. At M16's raised top speed 14.5 m/s was only two thirds
    // of what the road had left to give, and the wheel simply carried on
    // accelerating across the boundary; the entry became 20.5 m/s, which was
    // 92 % of pavement's 22.35. **M30 Phase 4 raised the road again to 65 mph
    // and the same arithmetic moves the entry to 26.5 m/s** — pavement tops
    // out at 29.06 and grass at 23.70, so anything under 23.7 would once more
    // be a speed the wheel is still *gaining* on the grass. The claim is about
    // what each surface tops out at, so the run has to be at the top before it
    // crosses, and the entry is derived from the two tops rather than typed.
    window.qa.rideUntil({ throttle: 1, steer: 0 }, 'speed', 26.5, 8000);
    const onRoad = window.qa.snap().euc;
    // Ninety degrees of heading, then straight until the pad runs out.
    window.qa.drive([{ actions: { throttle: 1, steer: 1 }, steps: 200 }]);
    const trace = window.qa.rideTrace({ throttle: 1, steer: 0 }, 1800, 20);
    return { onRoad, trace };
  });

  expect(crossing.onRoad.surface).toBe('pavement');
  expect(crossing.onRoad.speed).toBeGreaterThan(26);

  const onGrass = crossing.trace.filter((sample) => sample.surface === 'grass');
  expect(onGrass.length).toBeGreaterThan(4);

  const settled = onGrass[onGrass.length - 1];
  expect(settled.rollingResistance).toBeCloseTo(SURFACES.grass.rollingResistance, 5);
  // The ceiling is the M30 Phase 2 speed schedule now, and this sample is at
  // grass's own top speed, well above `carveSpeed` — so the number to compare
  // against is the schedule at that speed. What the surface owns is the
  // multiplier, which is the claim this line makes. Three places rather than
  // five: the clamp reads the speed at the top of the step and the snapshot
  // reports it after the pedal scrub.
  expect(settled.lateralLimitG).toBeCloseTo(
    lateralCeilingG(Math.abs(settled.speed), EUC) * SURFACES.grass.grip,
    3,
  );
  // Immediately: the wheel is losing speed from the first metres of grass,
  // rather than merely gaining it more slowly.
  expect(onGrass[4].speed).toBeLessThan(onGrass[0].speed);
  // And visibly: full throttle on grass will not hold pavement's speed. The
  // gap is the surface table's own — `data/surfaces.test.ts` holds it to at
  // least ten per cent between the two top speeds — expressed here through the
  // real controller, which needs the longer trace above to get there now that
  // the wheel is freer-rolling.
  expect(settled.speed).toBeLessThan(crossing.onRoad.speed * 0.95);
});

test('the suspension works over grass, sits still on pavement, and never at a standstill', async ({ page }) => {
  await boot(page);

  const field = await beat(page, 'pad', 60, -70);

  const travel = await page.evaluate((onGrass: { x: number; z: number; headingY: number }) => {
    const span = (samples: { suspensionOffset: number }[]): number => {
      let low = Infinity;
      let high = -Infinity;
      for (const sample of samples) {
        low = Math.min(low, sample.suspensionOffset);
        high = Math.max(high, sample.suspensionOffset);
      }
      return high - low;
    };

    // Pavement, at speed, down the pad.
    window.qa.resetRide();
    window.qa.rideUntil({ throttle: 1, steer: 0 }, 'speed', 12, 4000);
    const pavement = span(window.qa.rideTrace({ throttle: 1, steer: 0 }, 360, 3));

    // The open field beside the pad is grass.
    window.qa.placeRider(onGrass.x, onGrass.z, onGrass.headingY);
    window.qa.drive([{ actions: { throttle: 1, steer: 0 }, steps: 300 }]);
    const grassAtSpeed = window.qa.snap().euc.surface;
    const grass = span(window.qa.rideTrace({ throttle: 1, steer: 0 }, 360, 3));

    // The same ground, parked.
    window.qa.placeRider(onGrass.x, onGrass.z, onGrass.headingY);
    const parked = span(window.qa.rideTrace({ throttle: 0, steer: 0 }, 360, 3));

    return { pavement, grass, parked, grassAtSpeed };
  }, field);

  expect(travel.grassAtSpeed).toBe('grass');
  expect(travel.grass).toBeGreaterThan(0.02);
  expect(travel.grass).toBeGreaterThan(travel.pavement * 3);
  // Spatial, not temporal: the same patch of grass does nothing at a standstill.
  expect(travel.parked).toBeLessThan(0.001);
});

test('the rig rides the suspension, stays plumb on the hill, and the rider leans into it', async ({ page }) => {
  await boot(page);

  // Part-way up the climb, which rises seven metres over fifty-four.
  const onClimb = await beat(page, 'climb', 20);
  const onTheHill = await page.evaluate((start: { x: number; z: number; headingY: number }) => {
    window.qa.placeRider(start.x, start.z, start.headingY);
    window.qa.drive([{ actions: { throttle: 1, steer: 0 }, steps: 120 }]);
    return { rig: window.qa.groundRigTransform(), euc: window.qa.snap().euc };
  }, onClimb);

  expect(onTheHill.euc.surface).toBe('roughPavement');
  expect(onTheHill.euc.slope).toBeGreaterThan(0.1);
  // The M4 rig tilted whole-body to the surface normal here, which leaned the
  // rider *away* from the climb — the owner's ride rejected it. An EUC holds
  // its pedals level with gravity, so the rig stays plumb fore-aft…
  expect(Math.abs(onTheHill.rig.groundPitch)).toBeLessThan(1e-6);
  // A fall-line climb has no cross-slope worth speaking of either way.
  expect(Math.abs(onTheHill.rig.groundRoll)).toBeLessThan(0.05);
  // …and the hill is answered by the rider leaning uphill by the gradient,
  // rendered as a forward hinge above a level wheel. `pelvisPitch` carries the
  // constant relaxed stance pitch on top, so the floor here is the slope lean
  // plus that rest pitch, less the small wheel share of the action pose.
  expect(onTheHill.euc.slopeLean).toBeGreaterThan(0.1);
  expect(onTheHill.euc.riderPitch).toBeGreaterThan(onTheHill.euc.slopeLean);
  expect(onTheHill.rig.pelvisPitch).toBeGreaterThan(0.15);

  // The sprung mass rides the spring; the contact patch does not.
  expect(onTheHill.rig.bodyOffset).toBeCloseTo(onTheHill.euc.suspensionOffset, 6);
  expect(onTheHill.rig.riderOffset).toBeCloseTo(onTheHill.euc.suspensionOffset, 6);
  expect(onTheHill.rig.rigY).toBeCloseTo(onTheHill.euc.position.y, 6);
});

test('a full stop settles into the one-foot-down rest stance, and input leaves it fast', async ({ page }) => {
  await boot(page);

  // Stopped on the spawn pad with no input: after the dwell the rider grounds
  // the left boot and the wheel tips against the pedal-side leg.
  const rested = await page.evaluate(() => {
    window.qa.drive([{ actions: { throttle: 0, steer: 0 }, steps: 260 }]);
    return { rig: window.qa.groundRigTransform(), euc: window.qa.snap().euc };
  });
  expect(rested.euc.state).toBe('mounted');
  expect(rested.euc.restFactor).toBeGreaterThan(0.9);
  expect(rested.rig.eucRestLean).toBeGreaterThan(0.05);

  // Throttle: the stance releases quickly and the wheel is already moving.
  const away = await page.evaluate(() => {
    window.qa.drive([{ actions: { throttle: 1, steer: 0 }, steps: 60 }]);
    return { rig: window.qa.groundRigTransform(), euc: window.qa.snap().euc };
  });
  expect(away.euc.restFactor).toBeLessThan(0.1);
  expect(away.rig.eucRestLean).toBeLessThan(0.01);
  expect(away.euc.speed).toBeGreaterThan(0.5);
});

test('a hill measurably changes climb and descent', async ({ page }) => {
  await boot(page);

  const climbStart = await beat(page, 'climb', 2);
  const descentStart = await beat(page, 'descent', 2);
  const hill = await page.evaluate(([up, down]) => {
    window.qa.placeRider(up.x, up.z, up.headingY);
    const climbing = window.qa.rideTrace({ throttle: 1, steer: 0 }, 660, 30);
    // The descent runs the other way down the same seven metres, on gravel.
    window.qa.placeRider(down.x, down.z, down.headingY);
    const dropping = window.qa.rideTrace({ throttle: 1, steer: 0 }, 660, 30);
    return { climbing, dropping };
  }, [climbStart, descentStart] as const);

  // The steepest point each way rather than the last sample: both profiles are
  // eased, so a ride long enough to cross the beat finishes on the flat at the
  // far end of it, where the gradient is zero by construction.
  const steepestClimb = Math.max(...hill.climbing.map((sample) => sample.slope));
  const steepestDrop = Math.min(...hill.dropping.map((sample) => sample.slope));
  const highest = Math.max(...hill.climbing.map((sample) => sample.y));
  const lowest = Math.min(...hill.dropping.map((sample) => sample.y));

  expect(highest).toBeGreaterThan(4);
  expect(steepestClimb).toBeGreaterThan(0.08);
  expect(steepestDrop).toBeLessThan(-0.08);
  expect(lowest).toBeLessThan(1);

  // And the hill is felt, not merely reported: the climb costs speed the
  // descent gives back.
  const climbingSpeed = Math.min(...hill.climbing.slice(2).map((sample) => sample.speed));
  const droppingSpeed = Math.max(...hill.dropping.map((sample) => sample.speed));
  expect(droppingSpeed).toBeGreaterThan(climbingSpeed + 2);
});

// ---------------------------------------------------------------------------
// Kerbs and blocks
// ---------------------------------------------------------------------------

test('the boulevard kerb is a step the wheel mounts, and it costs speed', async ({ page }) => {
  await boot(page);

  // On the road beside the sidewalk, part-way along the boulevard.
  const onRoad = await beat(page, 'boulevard', 20, -3);
  const overKerb = await beat(page, 'boulevard', 40, -7);
  const overRoad = await beat(page, 'boulevard', 40, -3);

  const kerb = await page.evaluate(([start, kerbPoint, roadPoint]) => {
    window.qa.placeRider(start.x, start.z, start.headingY);
    window.qa.rideUntil({ throttle: 1, steer: 0 }, 'speed', 11, 2000);
    const before = window.qa.snap().euc;
    // Sampled every single step, deliberately: `lastStepUp` describes the step
    // that was mounted *this* step and is zero on the next one, so a trace that
    // samples every fourth would find it three times out of four by luck.
    // Turning right puts the sidewalk directly ahead.
    const trace = window.qa.rideTrace({ throttle: 1, steer: 1 }, 300, 1);
    return {
      before,
      trace,
      kerbTop: window.qa.groundAt(kerbPoint.x, kerbPoint.z).height,
      roadTop: window.qa.groundAt(roadPoint.x, roadPoint.z).height,
    };
  }, [onRoad, overKerb, overRoad] as const);

  expect(kerb.roadTop).toBe(0);
  expect(kerb.kerbTop).toBeCloseTo(0.15, 6);

  const mountedAt = kerb.trace.findIndex((sample) => sample.lastStepUp > 0);
  expect(mountedAt, 'the wheel never mounted the kerb').toBeGreaterThan(0);
  const mounted = kerb.trace[mountedAt];
  const approaching = kerb.trace[mountedAt - 1];
  expect(mounted.lastStepUp).toBeCloseTo(0.15, 2);
  // Seen coming before it was hit — the feeler `docs/PLANS.md` §4.3 asks for.
  expect(kerb.trace.some((sample) => sample.curbAhead > 0.1 && sample.y === 0)).toBe(true);
  // On top of the step it just mounted. Read at the moment of the mount rather
  // than at the end of the trace: the sidewalk is four metres wide and the
  // rider is still turning, so a long enough ride leaves it again.
  expect(approaching.y).toBe(0);
  expect(mounted.y).toBeCloseTo(0.15, 6);
  // And it cost speed, measured across the step that mounted it. Against the
  // approach speed instead, full throttle would be quietly paying part of it
  // back over the seconds in between.
  expect(approaching.speed - mounted.speed).toBeGreaterThan(2.5);
  expect(kerb.before.speed).toBeGreaterThan(10);
});

test('the gateway wall stops the wheel instead of letting it ride over', async ({ page }) => {
  await boot(page);

  // Straight at the solid half of the gateway, well clear of the opening.
  const runUp = await beat(page, 'plaza', 14, 6);
  const atWall = await beat(page, 'plaza', 38, 6);

  const wall = await page.evaluate(([start, gate]) => {
    window.qa.placeRider(start.x, start.z, start.headingY);
    const trace = window.qa.rideTrace({ throttle: 1, steer: 0 }, 900, 20);
    return { trace, wallTop: window.qa.groundAt(gate.x, gate.z).height, gateZ: gate.z };
  }, [runUp, atWall] as const);

  expect(wall.wallTop).toBeGreaterThan(1.5);

  const final = wall.trace[wall.trace.length - 1];
  expect(final.blocked).toBe(true);
  expect(final.y).toBe(0);
  expect(final.z).toBeLessThan(wall.gateZ - 2);
  expect(final.speed).toBeLessThan(0.5);
  // The approach was real, or the wall proved nothing.
  expect(Math.max(...wall.trace.map((sample) => sample.speed))).toBeGreaterThan(8);
});

test('the wheel mounts a rollable rock and is turned back by the taller one', async ({ page }) => {
  await boot(page);

  const rocks = await page.evaluate(() => {
    const trail = window.game.levelPlan.segments.find((segment) => segment.id === 'trail');
    if (!trail) throw new Error('the trail is missing');
    return trail.colliders.map((rock) => ({
      x: rock.centre.x,
      z: rock.centre.z,
      top: rock.centre.y + rock.halfExtents.y,
      ground: window.game.sampleGround(rock.centre.x, rock.centre.z).height,
    }));
  });

  expect(rocks.length).toBe(2);
  // The ceiling is derived from the wheel's pedal height, so a rock either side
  // of it is a rock the player can learn the difference between.
  expect(rocks.some((rock) => rock.top < MAX_STEP_UP)).toBe(true);
  expect(rocks.some((rock) => rock.top > MAX_STEP_UP)).toBe(true);
  // And each one is actually in the world the sampler answers for.
  for (const rock of rocks) expect(rock.ground).toBeCloseTo(rock.top, 6);
});

// ---------------------------------------------------------------------------
// Camera obstruction — M3's mechanism, against M4's geometry
// ---------------------------------------------------------------------------

test('the camera pulls in behind real geometry and gives it back slowly', async ({ page }) => {
  await boot(page);

  // M3 could only prove this with a test double and a scripted probe: the flat
  // plane had nothing above the ground to hide behind. This is the same code
  // path, driven by the level.
  // Just through the gateway and off to one side, so the wall is directly
  // behind — the commonest place a third-person camera meets a wall.
  const pastTheGate = await beat(page, 'plaza', 41.5, -2.6);
  const behindTheGate = await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
    window.qa.placeRider(spot.x, spot.z, spot.headingY);
    window.qa.advance(240);
    const parked = window.qa.snap();
    const restoring = window.qa.occlusionTrace({ throttle: 0.6, steer: 0 }, 300, 20);
    return { parked, restoring };
  }, pastTheGate);

  expect(behindTheGate.parked.camera.scriptedOcclusion).toBe(false);
  expect(behindTheGate.parked.camera.armDistance)
    .toBeCloseTo(CAMERA.obstructionMinDistance, 2);
  expect(behindTheGate.parked.camera.distance).toBeCloseTo(CAMERA.distanceAtRest, 2);

  // Restores as the rider leaves, and does it slowly: still short of the arm it
  // wants after two and a half seconds, which is what stops a pop.
  const restored = behindTheGate.restoring[behindTheGate.restoring.length - 1];
  expect(restored.armDistance).toBeGreaterThan(CAMERA.obstructionMinDistance + 1);
  expect(restored.ratio).toBeLessThan(1);
  for (let i = 1; i < behindTheGate.restoring.length; i += 1) {
    expect(behindTheGate.restoring[i].armDistance)
      .toBeGreaterThanOrEqual(behindTheGate.restoring[i - 1].armDistance - 1e-6);
  }
});

test('the gateway’s opening does not pull the camera in, so the probe is honest', async ({ page }) => {
  await boot(page);

  // The other half of the claim. A probe that fires everywhere is not a
  // feature, and open ground three metres away must never move the camera.
  const inTheOpening = await beat(page, 'plaza', 41.5, 0);
  const clear = await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
    window.qa.placeRider(spot.x, spot.z, spot.headingY);
    window.qa.advance(240);
    const inTheGap = window.qa.snap().camera;

    // And the open pad, carved hard, where nothing stands above the ground.
    window.qa.resetRide();
    const openGround = window.qa.occlusionTrace({ throttle: 0.35, steer: 1 }, 720, 30);
    return { inTheGap, openGround };
  }, inTheOpening);

  expect(clear.inTheGap.armDistance).toBeCloseTo(clear.inTheGap.distance, 2);
  for (const sample of clear.openGround) {
    expect(sample.ratio).toBeGreaterThan(0.98);
  }
});

// ---------------------------------------------------------------------------
// The rig, the lighting rig, and the whole thing running
// ---------------------------------------------------------------------------

test('the ground carries the mottle that replaced the debug grid', async ({ page }) => {
  await boot(page);

  const scene = await page.evaluate(() => window.qa.terrainScene());
  expect(scene.heightfieldHasVertexColours).toBe(true);
  // The distance haze that hides the surround's edge is on the scene, and its
  // far distance is inside the camera's own far plane.
  expect(scene.fog).not.toBeNull();
  expect(scene.fog!.near).toBe(LIGHTING.fogNear);
  expect(scene.fog!.far).toBe(LIGHTING.fogFar);
  expect(scene.fog!.far).toBeLessThan(CAMERA.far);
});

test('leaving the course lands on the surround rather than in a void', async ({ page }) => {
  await boot(page);

  const away = await page.evaluate(() => {
    window.qa.placeRider(0, 0, Math.PI);
    const trace = window.qa.rideTrace({ throttle: 1, steer: 0 }, 120 * 20, 240);
    return { trace, surround: window.game.levelPlan.surround };
  });

  const last = away.trace[away.trace.length - 1];
  expect(last.offCourse).toBe(true);
  expect(last.surface).toBe(away.surround.surface);
  expect(last.y).toBe(away.surround.height);
  expect(last.speed).toBeGreaterThan(8);
  // And the backstop keeps drawing ground under the rider wherever they go.
  const scene = await page.evaluate(() => window.qa.terrainScene());
  expect(Math.abs(scene.surroundCentre.x - last.x)).toBeLessThan(1);
  expect(Math.abs(scene.surroundCentre.z - last.z)).toBeLessThan(1);
});

test('a surface value changed through F4 reaches the running wheel', async ({ page }) => {
  await boot(page);

  const onField = await beat(page, 'pad', 60, -70);
  const tuned = await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
    window.qa.placeRider(spot.x, spot.z, spot.headingY);
    window.qa.drive([{ actions: { throttle: 1, steer: 0 }, steps: 300 }]);
    const before = window.qa.snap().euc;

    window.game.tuning.set('SURFACES.grass.rollingResistance', 5.5);
    window.qa.advance(4);
    const after = window.qa.snap().euc;

    window.game.tuning.reset('SURFACES.grass.rollingResistance');
    window.qa.advance(4);
    const restored = window.qa.snap().euc;

    return { before, after, restored };
  }, onField);

  expect(tuned.before.surface).toBe('grass');
  expect(tuned.before.rollingResistance).toBeCloseTo(SURFACES.grass.rollingResistance, 5);
  expect(tuned.after.rollingResistance).toBeCloseTo(5.5, 5);
  expect(tuned.restored.rollingResistance).toBeCloseTo(SURFACES.grass.rollingResistance, 5);
});

test('GPU objects plateau across repeated rides over every surface', async ({ page }) => {
  await boot(page);

  const downhill = await beat(page, 'descent', 4);
  const trace = await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
    const counts = [];
    for (let round = 0; round < 6; round += 1) {
      window.qa.resetRide();
      window.qa.drive([
        { actions: { throttle: 1, steer: 0 }, steps: 600 },
        { actions: { throttle: 1, steer: 1 }, steps: 300 },
        { actions: { throttle: -1, steer: 0 }, steps: 120 },
      ]);
      window.qa.placeRider(spot.x, spot.z, spot.headingY);
      window.qa.drive([{ actions: { throttle: 1, steer: 0 }, steps: 600 }]);
      counts.push(window.game.resources());
    }
    return counts;
  }, downhill);

  const settled = trace.slice(1);
  for (const counts of settled) {
    expect(counts.geometries).toBe(settled[0].geometries);
    expect(counts.textures).toBe(settled[0].textures);
    expect(counts.programs).toBe(settled[0].programs);
    expect(counts.sceneObjects).toBe(settled[0].sceneObjects);
    expect(counts.lights).toBe(settled[0].lights);
  }
});

test('a long ride over every surface produces no console errors', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page);

  await page.evaluate(() => {
    window.qa.thaw();
    window.qa.resetRide();
  });

  // Every beat of the proving ground, entered a few metres into it and ridden
  // through: the pad, brick, pavement and the kerb, the grass-shouldered sweep,
  // the climb, the crest, gravel, dirt and its rocks, wood, and pavement again.
  const ids = await page.evaluate(
    () => window.game.levelPlan.segments.map((segment) => segment.id),
  );
  for (const id of ids) {
    const start = await beat(page, id, 4);
    await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
      window.qa.placeRider(spot.x, spot.z, spot.headingY);
      window.qa.drive([
        { actions: { throttle: 1, steer: 0 }, steps: 240 },
        { actions: { throttle: 1, steer: 0.6 }, steps: 120 },
        { actions: { throttle: -1, steer: 0 }, steps: 60 },
      ]);
    }, start);
  }

  const visited = await page.evaluate(() => window.qa.snap());
  await testInfo.attach('m4-proving-ground', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(visited.euc.grounded).toBe(true);
  expect(errors).toEqual([]);
});

test('the debug overlay reports the ground the wheel is on', async ({ page }) => {
  await boot(page);

  const onClimb = await beat(page, 'climb', 20);
  await page.evaluate(([spot, steps]) => {
    window.game.setOverlayVisible(true);
    window.qa.placeRider(spot.x, spot.z, spot.headingY);
    window.qa.thaw();
    window.qa.drive([{ actions: { throttle: 1, steer: 0 }, steps: Number(steps) }]);
  }, [onClimb, STEPS(1)] as const);
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-field="slope"]');
    return value !== null && value.textContent !== '—';
  });

  const overlay = await page.evaluate(() => ({
    surface: document.querySelector('[data-field="surface"]')?.textContent ?? '',
    resistance: document.querySelector('[data-field="resistance"]')?.textContent ?? '',
    slope: document.querySelector('[data-field="slope"]')?.textContent ?? '',
    suspension: document.querySelector('[data-field="suspension"]')?.textContent ?? '',
    contact: document.querySelector('[data-field="contact"]')?.textContent ?? '',
  }));

  expect(overlay.surface).toContain('roughPavement');
  expect(overlay.resistance).toContain('m/s²');
  expect(overlay.slope).toContain('rad');
  expect(overlay.suspension).toContain('cm');
  expect(overlay.contact.length).toBeGreaterThan(0);
});

test('the level plan survives being sent over the wire as plain data', async ({ page }) => {
  await boot(page);

  // Invariant 2 says the plan is plain serializable data, never meshes. A
  // round trip through JSON is the assertion that says so — and it is the same
  // property M12's generator will need when a seed has to reproduce a world.
  const roundTrip = await page.evaluate(() => {
    const plan = window.game.levelPlan;
    const copy = JSON.parse(JSON.stringify(plan)) as typeof plan;
    return {
      sameId: copy.id === plan.id,
      sameHeights: copy.heightfield.heights.length === plan.heightfield.heights.length,
      sameSurfaces: copy.heightfield.surfaces.length === plan.heightfield.surfaces.length,
      sameColliders: copy.segments.reduce((total, segment) => total + segment.colliders.length, 0),
      firstHeight: copy.heightfield.heights[0] === plan.heightfield.heights[0],
    };
  });

  expect(roundTrip.sameId).toBe(true);
  expect(roundTrip.sameHeights).toBe(true);
  expect(roundTrip.sameSurfaces).toBe(true);
  expect(roundTrip.firstHeight).toBe(true);
  expect(roundTrip.sameColliders).toBeGreaterThan(5);
});
