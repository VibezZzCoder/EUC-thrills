/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { CHASE } from '../src/data/tuning.ts';

/**
 * M18 — the police chase, in a real browser.
 *
 * The milestone's gate is the owner's and cannot be automated: *is being chased
 * fun, and is losing to him ever unfair?* What can be automated is everything
 * that question rests on, and three of the claims below can only be made here:
 *
 *   1. **That the cop is actually drawn, and that the ghost is not drawn with
 *      him.** The render budget's whole arithmetic depends on the two being
 *      alternatives (`render/renderCost.ts` reserves the worse of the two
 *      rather than their sum), and the thing that makes it true is one slot in
 *      the renderer. A slot is a runtime fact; only a browser has one.
 *   2. **That a second `EucController` really is a second rider.** Headlessly
 *      the cop is a pose; here he is a rig in a scene graph, posed from that
 *      pose every frame, and the two could silently part company.
 *   3. **That the entrance refuses the worlds it says it refuses**, through the
 *      same menu a player clicks rather than through the bridge.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** A seed the pinned census says is dense, so the cop has a real route. */
const SEED = 'route-41';

/** Boot straight onto a generated route and start a chase through the bridge. */
async function bootChase(page: import('@playwright/test').Page): Promise<void> {
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    window.game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  await page.waitForFunction(() => window.game.snapshot().hud.chase !== '');
}

test('the hand-built city refuses a chase and says what the mode needs', async ({ page }) => {
  // The entrance is always on the title screen (§13 q13's rule, inherited by
  // q26): a control that appears and disappears is a mode nobody learns exists.
  // What it does on a world that cannot host one is name the fix.
  const errors = collectErrors(page);
  await bootToTitle(page);

  expect(await page.evaluate(() => window.game.snapshot().chase.available)).toBe(false);

  await page.locator('.euc-menu--title [data-menu="chase"]').click();
  await expect(page.locator('.euc-menu--routes')).toBeVisible();
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toContainText('chase needs a generated route');
  await expect(page.locator('.euc-menu--routes [data-menu="ride-route"]'))
    .toHaveText('Start the chase on this route');
  await expect(page.locator('.euc-menu--routes [data-menu="trial-route"]')).toBeHidden();

  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');
  expect(errors).toEqual([]);
});

test('a generated route hosts a chase, and the cop rides it', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  const ridden = await page.evaluate(() => {
    const game = window.game;
    const start = game.snapshot();
    // Ride away from him for a few seconds. Full throttle and no steering: the
    // point is that *he* moves and closes, not that the player rides well.
    game.setActions({ throttle: 1 });
    game.advance(600);
    const after = game.snapshot();
    return {
      startGap: start.chase.copGap,
      gap: after.chase.copGap,
      phase: after.chase.phase,
      remaining: after.chase.remaining,
      copMoved: after.chase.copGap !== start.chase.copGap,
      secondRider: after.chase.secondRider,
      // The rig itself, read out of the scene graph by name.
      copInScene: document.title !== '' && (() => {
        const scene = game.renderer.scene;
        const root = scene.getObjectByName('cop-rider');
        return root !== undefined && root.visible;
      })(),
    };
  });

  // He starts the spawn gap behind and is riding by the end of it.
  expect(ridden.startGap).toBeGreaterThan(CHASE.spawnGapMetres * 0.5);
  expect(ridden.copMoved).toBe(true);
  expect(ridden.phase).toBe('running');
  expect(ridden.remaining).toBeLessThan(CHASE.escapeSeconds);
  expect(ridden.secondRider).toBe('cop');
  expect(ridden.copInScene).toBe(true);
  // This corner is shared with Knockabout. The value was correctly changed to
  // the escape clock in M18 while its static label stayed "Targets", which made
  // the live mode describe the wrong objective despite every simulation test
  // passing.
  await expect(page.locator('[data-hud="score-label"]')).toHaveText('Survive');
  expect(errors).toEqual([]);
});

test('a stopped rider remains the quarry instead of being left to chase the cop', async ({ page }) => {
  // The adversarial pursuit case the original Phase 1 gate omitted. Riding all
  // 48 routes alone proved a competent racer; it said nothing about what
  // happens after the cop reaches the rider. The shipped first pass copied the
  // rider's lateral line only while they were ahead, passed a stopped rider,
  // and continued to the route end.
  const errors = collectErrors(page);
  await bootChase(page);

  const pursuit = await page.evaluate(({ swingRange, bustRadius }) => {
    const game = window.game;
    game.clearActions();
    let closest = Infinity;
    let finalGap = game.snapshot().chase.copGap;
    for (let chunk = 0; chunk < 240; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      finalGap = snapshot.chase.copGap;
      closest = Math.min(closest, finalGap);
      if (snapshot.app.state === 'results') break;
    }
    const snapshot = game.snapshot();
    return {
      closest,
      finalGap,
      state: snapshot.app.state,
      outcome: snapshot.chase.outcome,
      reached: closest <= swingRange,
      stillPursuing: finalGap <= bustRadius || snapshot.chase.outcome === 'caught',
    };
  }, { swingRange: CHASE.swingRangeMetres, bustRadius: CHASE.bustRadiusMetres });

  expect(pursuit.reached).toBe(true);
  expect(pursuit.stillPursuing).toBe(true);
  expect(errors).toEqual([]);
});

test('the second-rider slot holds one rider, never two', async ({ page }) => {
  // The assertion the render budget rests on. `NON_LEVEL_RESERVE` reserves the
  // worse of the ghost frame and the cop frame rather than their sum, and on
  // the densest known route the sum does not fit the §9 ceiling — so "they
  // never coexist" has to be a fact about the code rather than a convention.
  const errors = collectErrors(page);
  await bootChase(page);

  const slots = await page.evaluate(() => {
    const game = window.game;
    const seen: string[] = [];
    const both = (): { ghost: boolean; cop: boolean } => {
      const scene = game.renderer.scene;
      return {
        ghost: scene.getObjectByName('ghost-rider')?.visible === true,
        cop: scene.getObjectByName('cop-rider')?.visible === true,
      };
    };

    game.advance(30);
    seen.push(game.renderer.secondRiderShown);
    const during = both();

    // Ask for the ghost while the cop is up. One slot: the cop must go.
    game.renderer.setGhostVisible(true);
    const afterGhost = both();
    seen.push(game.renderer.secondRiderShown);

    game.renderer.setCopVisible(true);
    const afterCop = both();
    seen.push(game.renderer.secondRiderShown);

    return { seen, during, afterGhost, afterCop };
  });

  expect(slots.seen).toEqual(['cop', 'ghost', 'cop']);
  expect(slots.during).toEqual({ ghost: false, cop: true });
  expect(slots.afterGhost).toEqual({ ghost: true, cop: false });
  expect(slots.afterCop).toEqual({ ghost: false, cop: true });
  expect(errors).toEqual([]);
});

test('the drawn cop stands where the simulated cop is', async ({ page }) => {
  // The claim only a browser can make: he is posed from a controller pose every
  // frame, the way the player's rig is. A rig that stopped being updated would
  // sit at the origin while the chase carried on behind the camera.
  const errors = collectErrors(page);
  await bootChase(page);

  const placed = await page.evaluate(() => {
    const game = window.game;
    game.setActions({ throttle: 1 });
    game.advance(420);
    const root = game.renderer.scene.getObjectByName('cop-rider');
    const rig = root?.getObjectByName('cop-riding-rig');
    rig?.updateWorldMatrix(true, false);
    const rider = game.snapshot().euc.position;
    return {
      rig: rig === undefined ? null : { x: rig.position.x, y: rig.position.y, z: rig.position.z },
      rider,
      gap: game.snapshot().chase.copGap,
    };
  });

  expect(placed.rig).not.toBeNull();
  const rig = placed.rig!;
  // The rig is somewhere real, and it is within the reported gap of the rider —
  // one comparison that fails for both of the ways this can break: a rig left
  // at the origin, and a `copGap` computed from a pose nobody drew.
  const distance = Math.hypot(rig.x - placed.rider.x, rig.z - placed.rider.z);
  expect(distance).toBeLessThan(placed.gap + 2);
  expect(distance).toBeGreaterThan(placed.gap - 2);
  expect(errors).toEqual([]);
});

test('riding into the surround runs the boundary out and busts the run', async ({ page }) => {
  // §13 q27, "not cheatable by going far off road". The strategy the boundary
  // exists to refuse is precisely this one: point away from the route and hold
  // throttle until the clock runs out.
  const errors = collectErrors(page);
  await bootChase(page);

  const strayed = await page.evaluate(async ({ limit, grace }) => {
    const game = window.game;
    // **Teleported rather than ridden out there**, and deliberately: what is
    // under test is the boundary, not the ninety seconds of riding it takes to
    // reach it. Riding out also ends the run for the *other* reason half the
    // time — a rider ploughing across a surround at full throttle crashes into
    // the dressing with the cop still on them, which is a bust rather than a
    // stray and would make this spec measure something else on some seeds.
    const start = game.snapshot().euc;
    const away = limit * 2.5;
    const x = start.position.x + Math.cos(start.headingY) * away;
    const z = start.position.z - Math.sin(start.headingY) * away;
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, start.headingY);
    game.clearActions();

    let sawWarning = false;
    let sawObjective = false;
    for (let chunk = 0; chunk < 200; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      if (snapshot.chase.straying) sawWarning = true;
      if (snapshot.hud.objective.includes('Back to the route')) sawObjective = true;
      if (snapshot.chase.phase !== 'running') {
        return {
          outcome: snapshot.chase.outcome,
          sawWarning,
          sawObjective,
          offRoute: snapshot.chase.offRoute,
          limit,
          grace,
        };
      }
    }
    const end = game.snapshot();
    return {
      outcome: end.chase.outcome,
      sawWarning,
      sawObjective,
      offRoute: end.chase.offRoute,
      limit,
      grace,
    };
  }, { limit: CHASE.strayLimitMetres, grace: CHASE.strayGraceSeconds });

  expect(strayed.offRoute).toBeGreaterThan(CHASE.strayLimitMetres);
  expect(strayed.sawWarning).toBe(true);
  expect(strayed.sawObjective).toBe(true);
  expect(strayed.outcome).toBe('strayed');
  expect(errors).toEqual([]);
});

test('camping off the road inside the stray limit brings the cop across the grass', async ({ page }) => {
  // The owner's own first-ride exploit, as a fixture. The stray rule busts a
  // rider who goes *far*; between the road's edge and that limit there was a
  // band where standing still was safe — the cop chased along the tarmac
  // below and would not step onto the verge. The field pursuit is the fix,
  // and the browser is where the whole of it can be watched at once: brain,
  // controller, paddle and referee.
  const errors = collectErrors(page);
  await bootChase(page);

  const camped = await page.evaluate(({ limit, swingRange }) => {
    const game = window.game;
    // Half the stray limit off the route: far enough that reaching the rider
    // means leaving the road, near enough that the stray rule never fires.
    const start = game.snapshot().euc;
    const away = limit * 0.5;
    const x = start.position.x + Math.cos(start.headingY) * away;
    const z = start.position.z - Math.sin(start.headingY) * away;
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, start.headingY);
    game.clearActions();

    let closest = Infinity;
    let sawWarning = false;
    for (let chunk = 0; chunk < 400; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      closest = Math.min(closest, snapshot.chase.copGap);
      if (snapshot.chase.straying) sawWarning = true;
      if (snapshot.app.state === 'results') break;
    }
    const end = game.snapshot();
    return {
      closest,
      reached: closest <= swingRange,
      sawWarning,
      outcome: end.chase.outcome,
    };
  }, { limit: CHASE.strayLimitMetres, swingRange: CHASE.swingRangeMetres });

  // He came across the grass all the way to swing range — a cop who will not
  // leave the tarmac can get no closer than the rider's own off-route
  // distance minus the road's half width.
  expect(camped.reached).toBe(true);
  // The rider never neared the limit, so the boundary must not have fired.
  expect(camped.sawWarning).toBe(false);
  // Standing still under a paddle is not safe: the run either was still being
  // pressured or ended as a bust. It must never end as a stray from here.
  expect(['none', 'caught']).toContain(camped.outcome);
  expect(errors).toEqual([]);
});

test('the results card names the outcome and the mode keeps its own best', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  const finished = await page.evaluate(async () => {
    const game = window.game;
    // Shorten the clock rather than riding five real minutes: the tunable is
    // the shipped one, and the mode reads it at `arm`.
    game.tuning.set('CHASE.escapeSeconds', 30);
    game.startChase();
    game.setActions({ throttle: 0.6 });
    for (let chunk = 0; chunk < 300; chunk += 1) {
      game.advance(30);
      if (game.snapshot().app.state === 'results') break;
    }
    const snapshot = game.snapshot();
    return {
      state: snapshot.app.state,
      outcome: snapshot.chase.outcome,
      best: snapshot.chase.best,
      bestEscaped: snapshot.chase.bestEscaped,
    };
  });

  expect(finished.state).toBe('results');
  // Either ending is a legitimate result of a scripted ride; what must hold is
  // that the run *ended*, that it was filed, and that the card says which.
  expect(['escaped', 'caught', 'strayed']).toContain(finished.outcome);
  expect(finished.best).not.toBeNull();

  const heading = await page.locator('.euc-menu--results [data-menu="results-heading"]').textContent();
  expect(['Escaped', 'Escaped — new record', 'Busted', 'Out of bounds']).toContain(heading?.trim());

  // A chase best is not a lap time and must never be filed as one: the timed
  // run's own record for this world is still empty.
  const timed = await page.evaluate(() => window.game.snapshot().record.totalSeconds);
  expect(timed).toBeNull();
  expect(errors).toEqual([]);
});

test('the chase probe puts a cop on the road with no rules attached', async ({ page }) => {
  // Phase 2's owner gate: ride behind him and look at him, before the mode
  // exists to be ridden. It changes nothing about the world, so unlike the
  // hazard and target probes it does not refuse records.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}&chaseprobe=1`);

  const probed = await page.evaluate(() => {
    const game = window.game;
    game.setAppState('freeRide');
    const before = game.snapshot().chase.copGap;
    game.setActions({ throttle: 1 });
    game.advance(600);
    const after = game.snapshot();
    return {
      before,
      gap: after.chase.copGap,
      phase: after.chase.phase,
      state: after.app.state,
      secondRider: after.chase.secondRider,
      // The probe must not refuse records — it changes no world.
      hudChase: after.hud.chase,
    };
  });

  expect(probed.state).toBe('freeRide');
  // He is riding, and the chase's rules are not.
  expect(probed.phase).toBe('idle');
  expect(probed.gap).not.toBe(probed.before);
  expect(probed.secondRider).toBe('cop');
  // No mode, so no lane: the probe is a look at a rider, not a run.
  expect(probed.hudChase).toBe('');
  expect(errors).toEqual([]);
});

test('the siren follows the cop, and only while the pursuit is live', async ({ page }) => {
  // The audio model runs whether or not a context is armed — the engine's own
  // design promise — so a spec can watch the siren as arithmetic without ever
  // owning a microphone. What only a browser can prove is the *wiring*: that
  // `Game.updateAudio` actually hands the chase's range to the director.
  const errors = collectErrors(page);
  await bootChase(page);

  const watched = await page.evaluate(() => {
    const game = window.game;
    game.clearActions();
    const atStart = game.snapshot().audio.sirenGain;

    // Stand still and let him come. Sampled along the way, because the run
    // may end in a bust before the last sample — which is itself the fade
    // half of the claim.
    let peak = 0;
    let peakRate = 1;
    let closestGap = Infinity;
    let sirenWhileFar = 0;
    for (let round = 0; round < 12; round += 1) {
      game.advance(300);
      const snap = game.snapshot();
      if (snap.chase.phase !== 'running') break;
      if (snap.audio.sirenGain > peak) {
        peak = snap.audio.sirenGain;
        peakRate = snap.audio.sirenRate;
      }
      closestGap = Math.min(closestGap, snap.chase.copGap);
      if (snap.chase.copGap > 70) {
        sirenWhileFar = Math.max(sirenWhileFar, snap.audio.sirenGain);
      }
    }
    const end = game.snapshot();
    return {
      atStart,
      peak,
      peakRate,
      closestGap,
      sirenWhileFar,
      endPhase: end.chase.phase,
      endSiren: end.audio.sirenGain,
    };
  });

  // He closed, and the siren rose with him.
  expect(watched.closestGap).toBeLessThan(30);
  expect(watched.peak).toBeGreaterThan(0.02);
  // Beyond the onset range it contributed nothing.
  expect(watched.sirenWhileFar).toBe(0);
  // The Doppler lean stays inside its cap — a detuned siren is an alarm bell.
  expect(watched.peakRate).toBeGreaterThan(0.96);
  expect(watched.peakRate).toBeLessThan(1.04);
  // However the minute ended — still running, or busted by the strike on a
  // standing rider — the siren's answer is consistent with it: a live pursuit
  // keeps a live siren; an ended one is fading through the release.
  if (watched.endPhase !== 'running') {
    expect(watched.endSiren).toBeLessThanOrEqual(watched.peak);
  } else {
    expect(watched.endSiren).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('the siren reaches the real output bus and obeys mute', async ({ page }) => {
  // The model-level chase spec above can stay green if a gain is disconnected.
  // Park the wheel so the siren is the only sustained signal, then read the
  // analyser downstream of the master bus: this is audible output, not intent.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);

  // Arm Web Audio with a trusted gesture while the title still owns input, so
  // the key cannot move the rider or contaminate the parked baseline.
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

  const measured = await page.evaluate(async () => {
    window.qa.freeze();
    const idle = await window.qa.audioOutputMax(220, 3);
    window.game.startChase();
    window.game.clearActions();

    let peakModel = 0;
    let closest = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 20; round += 1) {
      window.game.advance(120);
      const snapshot = window.game.snapshot();
      peakModel = Math.max(peakModel, snapshot.audio.sirenGain);
      closest = Math.min(closest, snapshot.chase.copGap);
      if (peakModel > 0.12 || snapshot.chase.phase !== 'running') break;
    }

    const audible = await window.qa.audioOutputMax(250, 6);
    window.game.setMuted(true);
    // A regular reading after the parameter glide settles, rather than a peak
    // hold that would deliberately retain the pre-mute signal.
    const muted = await window.qa.audioOutput(320);
    window.game.setMuted(false);
    const restored = await window.qa.audioOutputMax(250, 4);
    return { idle, peakModel, closest, audible, muted, restored };
  });

  expect(measured.idle).toBeLessThan(0.002);
  expect(measured.closest).toBeLessThan(30);
  expect(measured.peakModel).toBeGreaterThan(0.05);
  expect(measured.audible).toBeGreaterThan(0.005);
  expect(measured.muted).toBeLessThan(1e-4);
  expect(measured.restored).toBeGreaterThan(0.005);
  expect(errors).toEqual([]);
});
