/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Game } from '../src/app/Game.ts';
import type { RiderSeat } from '../src/app/seats.ts';
import type { EucController, EucPose } from '../src/simulation/EucController.ts';
import { CHARACTER_IDS } from '../src/data/riders.ts';
import { RIDER_BLOCKOUT } from '../src/data/tuning.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

// Fixed-step integration and scene geometry, never a runtime benchmark.
// The coordinator schedules this file only after the implementation is stable.
const EVIDENCE = process.env.RAGDOLL_REPAIR_SHOTS ?? 'test-results/ragdoll-repair-2026-10-13/integration';
type PrivateGame = Omit<Game, 'seats' | 'pursuers'> & { seats: RiderSeat[]; pursuers: {
  controller: EucController; current: EucPose; previous: EucPose; render: EucPose; worldPlaced: boolean;
  role: 'tail' | 'patrol';
}[] };
interface BodySample {
  finite: boolean; lengths: number[]; joints: number[][]; particles: number[];
  blend: number; crashed: boolean; crashes: number; invulnerable: number; state: string;
}
interface RepairToolkit {
  body(seat: number): BodySample;
  knock(seat: number, side?: number): boolean;
  settle(seat: number, maximum?: number): { recovered: boolean; fullBlend: boolean; samples: number; finite: boolean; worstQuietJump: number };
}
declare global { interface Window { ragRepair: RepairToolkit } }

async function prepare(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = window.game as unknown as PrivateGame;
    game.loop.setRunning(false);
    game.setOptions({ showFps: false });
    game.clearActions();
    const names = ['rider-hip-left', 'rider-knee-left', 'rider-ankle-left',
      'rider-hip-right', 'rider-knee-right', 'rider-ankle-right',
      'rider-shoulder-left', 'rider-elbow-left', 'rider-grip-left',
      'rider-shoulder-right', 'rider-elbow-right', 'rider-grip-right'];
    const distance = (a: number[], b: number[]) => Math.hypot(...a.map((x, i) => x - b[i]));
    const body = (index: number): BodySample => {
      const seat = game.seats[index], pose = seat.renderPose, snapshot = game.snapshotFor(index).euc;
      seat.rig.group.updateMatrixWorld(true);
      let finite = true;
      seat.rig.rider.root.traverse(object => {
        finite &&= object.matrixWorld.elements.every(Number.isFinite);
      });
      const joints = names.map(name => {
        const node = seat.rig.group.getObjectByName(name);
        if (!node) throw new Error(`Missing live articulated joint ${name}`);
        return node.getWorldPosition(node.position.clone()).toArray();
      });
      const lengths = [0, 3, 6, 9].flatMap(at => [distance(joints[at], joints[at + 1]), distance(joints[at + 1], joints[at + 2])]);
      return { finite, lengths, joints, particles: Array.from(pose.ragdoll), blend: pose.ragdollBlend,
        crashed: snapshot.crashed, crashes: snapshot.crashes, invulnerable: snapshot.invulnerable, state: snapshot.state };
    };
    window.ragRepair = {
      body,
      knock(index, side = 1) { return game.seats[index].controller.hardKnock(side, 0); },
      settle(index, maximum = 600) {
        let last = body(index), fullBlend = false, finite = true, worstQuietJump = 0, samples = 0;
        for (; samples < maximum; samples++) {
          game.advance(1);
          const now = body(index);
          finite &&= now.finite;
          fullBlend ||= now.blend > .99;
          const particleMove = Math.max(...now.particles.map((value, at) => Math.abs(value - last.particles[at])));
          // A near-stationary endpoint trajectory must not flip a middle joint.
          // Entry/exit interpolation is measured separately, not hidden in this bound.
          if (now.blend > .99 && last.blend > .99 && particleMove < .01)
            worstQuietJump = Math.max(worstQuietJump, ...now.joints.map((joint, at) => distance(joint, last.joints[at])));
          last = now;
          if (fullBlend && !now.crashed && now.blend === 0) break;
        }
        return { recovered: !last.crashed && last.blend === 0, fullBlend, samples, finite, worstQuietJump };
      },
    };
  });
}

async function evidence(page: Page, info: TestInfo, value: unknown, shot = false): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  const stem = info.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  await writeFile(join(EVIDENCE, `${stem}.json`), JSON.stringify(value, null, 2));
  if (shot) {
    await page.evaluate(() => window.game.setOptions({ showFps: false }));
    await page.screenshot({ path: join(EVIDENCE, `${stem}.png`) });
  }
}

function expectBody(body: BodySample, label: string): void {
  expect(body.finite, label).toBe(true);
  const lengths = [RIDER_BLOCKOUT.thighLength, RIDER_BLOCKOUT.shinLength,
    RIDER_BLOCKOUT.thighLength, RIDER_BLOCKOUT.shinLength,
    RIDER_BLOCKOUT.upperArmLength, RIDER_BLOCKOUT.forearmLength,
    RIDER_BLOCKOUT.upperArmLength, RIDER_BLOCKOUT.forearmLength];
  body.lengths.forEach((value, at) => {
    // The grip has an intentional small offset from the forearm endpoint.
    expect(Math.abs(value - lengths[at]), `${label}: bone ${at}`).toBeLessThan(at === 5 || at === 7 ? .025 : .002);
  });
}

test('every playable look survives crash entry, settling, recovery immunity and reset', async ({ page }, info) => {
  const errors = collectErrors(page);
  await boot(page, 'level=proving');
  await prepare(page);
  const rows = [];
  for (const character of CHARACTER_IDS) {
    const row = await page.evaluate(character => {
      const game = window.game;
      game.setOptions({ character });
      const spawn = game.levelPlan.spawn;
      game.placeRider(spawn.position, spawn.headingY);
      game.setActions({ throttle: .5, steer: 0 });
      game.advance(90);
      game.setActions({ throttle: 0, steer: 0 });
      const before = window.ragRepair.body(0);
      const accepted = window.ragRepair.knock(0);
      game.advance(1);
      const entry = window.ragRepair.body(0);
      const settled = window.ragRepair.settle(0);
      const recovered = window.ragRepair.body(0);
      const immune = recovered.invulnerable > 0 && !window.ragRepair.knock(0);
      game.setActions({ reset: true });
      game.advance(1);
      game.setActions({ reset: false });
      return { character, accepted, before, entry, settled, recovered, immune, reset: window.ragRepair.body(0) };
    }, character);
    expect(row.accepted, character).toBe(true);
    expect(row.entry.crashes - row.before.crashes, character).toBe(1);
    expectBody(row.entry, character);
    expect(row.settled, character).toMatchObject({ finite: true, fullBlend: true, recovered: true });
    expect(row.settled.worstQuietJump, character).toBeLessThan(.10);
    expect(row.immune, character).toBe(true);
    expectBody(row.recovered, character);
    expect(row.reset.blend, character).toBe(0);
    expect(row.reset.crashed, character).toBe(false);
    rows.push(row);
  }
  await evidence(page, info, rows);
  expect(errors).toEqual([]);
});

for (const count of [2, 4] as const) test(`${count} couch seats keep separate simultaneous and staggered crash histories`, async ({ page }, info) => {
  const errors = collectErrors(page);
  await boot(page, 'level=proving');
  await prepare(page);
  const row = await page.evaluate(count => {
    const game = window.game;
    for (let index = 1; index < count; index++) game.spawnRider();
    for (let index = 0; index < count; index++) {
      const spawn = game.levelPlan.spawn;
      game.placeRider({ x: spawn.position.x + index * 5, y: spawn.position.y, z: spawn.position.z }, spawn.headingY, index);
    }
    const before = Array.from({ length: count }, (_, i) => window.ragRepair.body(i));
    const accepted = Array.from({ length: count }, (_, i) => window.ragRepair.knock(i, i % 2 ? -1 : 1));
    game.advance(30);
    const down = Array.from({ length: count }, (_, i) => window.ragRepair.body(i));
    game.advance(500);
    const recovered = Array.from({ length: count }, (_, i) => window.ragRepair.body(i));
    // Reset one seated rider and leave every other's controller/history intact.
    const selected = count - 1;
    const spawn = game.levelPlan.spawn;
    game.placeRider({ x: spawn.position.x + selected * 5, y: spawn.position.y, z: spawn.position.z }, spawn.headingY, selected);
    const secondAccepted = window.ragRepair.knock(selected, -1);
    game.advance(30);
    const staggered = Array.from({ length: count }, (_, i) => window.ragRepair.body(i));
    return { accepted, before, down, recovered, secondAccepted, staggered, seats: game.seatCount };
  }, count);
  expect(row.seats).toBe(count);
  expect(row.accepted).toEqual(Array(count).fill(true));
  row.down.forEach((body, at) => {
    expectBody(body, `seat ${at}`);
    expect(body.blend).toBeGreaterThan(.99);
    expect(body.crashes - row.before[at].crashes).toBe(1);
  });
  expect(row.recovered.every(body => !body.crashed && body.blend === 0)).toBe(true);
  expect(row.secondAccepted).toBe(true);
  expect(row.staggered.map(body => body.crashed)).toEqual(Array.from({ length: count }, (_, at) => at === count - 1));
  await evidence(page, info, row, true);
  expect(errors).toEqual([]);
});

const modes = ['timeTrial', 'trackDay', 'race', 'trickRun', 'knockabout', 'chase'] as const;
for (const mode of modes) test(`${mode} preserves its referee and record rules across a real controller crash`, async ({ page }, info) => {
  const errors = collectErrors(page);
  await bootToTitle(page, mode === 'trickRun' ? 'level=switchback' : 'level=generated&seed=route-41');
  await prepare(page);
  const row = await page.evaluate(mode => {
    const game = window.game;
    if (mode === 'race') { game.setCouchRide('race'); game.spawnRider(); game.endClaiming(); }
    if (mode === 'timeTrial') game.startTimeTrial();
    else if (mode === 'trackDay' || mode === 'race') game.startTrackDay();
    else if (mode === 'trickRun') game.startTrickRun();
    else if (mode === 'knockabout') game.startKnockabout();
    else game.startChase();
    game.loop.setRunning(false);
    game.clearActions();
    // Solo Chase is already running with no countdown. A stationary 400-step
    // warmup lets the real pack strike first, making the diagnostic hardKnock
    // legitimately refuse an already-crashed/immune rider. Start its crash
    // journey immediately; other modes retain their countdown/recording setup.
    game.advance(mode === 'chase' ? 1 : 400);
    if (mode === 'timeTrial' || mode === 'trackDay') {
      const start = game.levelPlan.checkpoints.find(checkpoint => checkpoint.kind === 'start');
      if (!start) throw new Error('The timed venue must own a start checkpoint');
      game.placeRider(start.centre, start.headingY);
      game.advance(14);
    }
    const describe = () => {
      const s = game.snapshot();
      return { app: s.app.state, challenge: s.challenge.phase, lap: s.trackDay.phase, race: s.race.phase,
        trick: s.trickRun.phase, match: s.match.phase, chase: s.chase.phase,
        recordedSamples: s.challenge.recordedSamples + s.trackDay.recordedSamples,
        ghostVisible: s.trackDay.ghostVisible, secondRider: s.chase.secondRider,
        paddle: s.paddle.equipped, targetTotal: s.targets.total, struck: s.targets.struck };
    };
    const before = describe(), bodyBefore = window.ragRepair.body(0), accepted = window.ragRepair.knock(0);
    game.advance(2);
    const down = window.ragRepair.body(0), during = describe();
    // Timed/chase modes may legitimately end or bust. Their player reset path
    // must still return a healthy pose; no test forces a referee back to running.
    game.setActions({ reset: true });
    game.advance(1);
    game.setActions({ reset: false });
    game.advance(1);
    const reset = window.ragRepair.body(0), after = describe();
    return { before, accepted, bodyBefore, down, during, reset, after, seats: game.seatCount };
  }, mode);
  // Preserve a failed precondition and actual referee transitions as well as
  // successful evidence; a rejected diagnostic knock is not a crash trace.
  await evidence(page, info, row);
  expect(row.bodyBefore.crashed, `${mode}: diagnostic crash starts upright`).toBe(false);
  expect(row.bodyBefore.invulnerable, `${mode}: diagnostic crash starts outside recovery immunity`).toBe(0);
  expect(row.accepted).toBe(true);
  expectBody(row.down, mode);
  expect(row.down.crashes - row.bodyBefore.crashes).toBe(1);
  expect(row.reset.crashed).toBe(false);
  expect(row.reset.blend).toBe(0);
  const expected = mode === 'timeTrial' ? 'challenge' : mode === 'race' ? 'trackDay' : mode;
  expect(row.before.app).toBe(expected);
  expect(row.during.recordedSamples).toBeGreaterThanOrEqual(0);
  if (mode === 'timeTrial' || mode === 'trackDay') {
    expect(mode === 'timeTrial' ? row.before.challenge : row.before.lap).toBe('running');
    expect(row.before.recordedSamples).toBeGreaterThan(0);
    expect(row.during.recordedSamples).toBeGreaterThanOrEqual(row.before.recordedSamples);
    expect(row.after.recordedSamples).toBe(0);
  }
  if (mode !== 'timeTrial' && mode !== 'trackDay') expect(row.during.recordedSamples).toBe(0);
  if (mode === 'race') {
    expect(row.seats).toBe(2);
    expect(row.before.race).not.toBe('idle');
    expect(row.during.ghostVisible).toBe(false);
  } else expect(row.before.race).toBe('idle');
  if (mode === 'trickRun') expect(row.before.trick).toBe('running');
  if (mode === 'chase') expect(row.before.chase).toBe('running');
  if (mode === 'knockabout') {
    expect(row.seats).toBe(1);
    expect(row.before.match).toBe('idle');
    expect(row.before.paddle).toBe(true);
    expect(row.before.targetTotal).toBeGreaterThan(0);
    expect(row.during.struck).toBe(row.before.struck);
  }
  expect(errors).toEqual([]);
});

test('a parked real paddle strike publishes crash entry once and keeps match credit stable', async ({ page }, info) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=route-41');
  await prepare(page);
  const row = await page.evaluate(() => {
    const game = window.game;
    game.setCouchRide('knockabout'); game.spawnRider(); game.endClaiming(); game.startKnockabout();
    game.loop.setRunning(false); game.advance(400);
    const origin = game.levelPlan.spawn.position, z = origin.z + 30;
    game.placeRider({ x: origin.x, y: game.sampleGround(origin.x, z).height, z }, 0, 0);
    game.placeRider({ x: origin.x - 1.15, y: game.sampleGround(origin.x - 1.15, z + .35).height, z: z + .35 }, 0, 1);
    game.setActionsFor(0, { throttle: 0, swing: true });
    game.setActionsFor(1, { throttle: 0 });
    const samples = [];
    for (let tick = 0; tick < 100; tick++) {
      game.advance(1);
      const body = window.ragRepair.body(1);
      samples.push({ tick, body, credit: game.snapshot().match.scores.map(score => score.knockdowns) });
      if (body.blend > .99) break;
    }
    game.setActionsFor(0, { swing: false });
    const credited = game.snapshot().match.scores.map(score => score.knockdowns);
    game.advance(30);
    return { samples, credited, afterCredit: game.snapshot().match.scores.map(score => score.knockdowns) };
  });
  expect(row.samples.some(sample => sample.body.crashed)).toBe(true);
  expect(row.samples.some(sample => sample.body.blend > .99)).toBe(true);
  expect(row.samples.at(-1)!.body.crashes).toBe(1);
  row.samples.forEach(sample => expectBody(sample.body, `strike tick ${sample.tick}`));
  expect(row.credited[0]).toBe(1);
  expect(row.credited).toEqual(row.afterCredit);
  await evidence(page, info, row, true);
  expect(errors).toEqual([]);
});

test('tail and both patrol brains enter natural cutout, draw their own rigs and recover', async ({ page }, info) => {
  const errors = collectErrors(page);
  await boot(page, 'level=generated&seed=route-41&chaseprobe=1');
  await prepare(page);
  const rows = await page.evaluate(() => {
    const game = window.game as unknown as PrivateGame;
    if (game.pursuers.length !== 3) throw new Error('The fixture must install a tail and two patrols');
    if (game.pursuers.map(cop => cop.role).join(',') !== 'tail,patrol,patrol')
      throw new Error('The fixture must exercise the actual tail and both actual patrol roles');
    const starts = game.pursuers.map(cop => ({ position: { x: cop.current.x, y: cop.current.y, z: cop.current.z }, headingY: cop.current.headingY }));
    const rows = [];
    for (let index = 0; index < game.pursuers.length; index++) {
      for (let other = 0; other < game.pursuers.length; other++) {
        const cop = game.pursuers[other];
        cop.controller.setTuning({ cutoutEnabled: other === index ? 1 : 0, cutoutSpeedShare: .02, cutoutHoldSeconds: .01 });
        // Native reset with an ordinary rolling speed triggers the detector
        // through the actual brain/controller path; no scripted crash pose.
        if (!cop.worldPlaced || !cop.controller.reset(starts[other], other === index ? 2 : 0))
          throw new Error(`CPU ${other} native fixture reset was not admitted`);
        cop.controller.writePose(cop.current); cop.controller.writePose(cop.previous);
      }
      const playerSpawn = game.levelPlan.spawn;
      game.placeRider(playerSpawn.position, playerSpawn.headingY);
      game.setActions({ throttle: .8, steer: 0 });
      const cop = game.pursuers[index];
      let down = false, full = false, recovered = false, rendered = false, finite = true, crashes = 0;
      let causeAtCrash = 'none';
      for (let tick = 0; tick < 1000; tick++) {
        game.advance(1);
        const s = cop.controller.snapshot();
        if (s.crashed) { if (!down) causeAtCrash = s.crashCause; down = true; crashes = Math.max(crashes, s.crashes); }
        full ||= cop.current.ragdollBlend > .99;
        const prefix = index === 0 ? 'cop-' : `cop${index + 1}-`;
        const rig = game.renderer.scene.getObjectByName(`${prefix}rider`);
        rendered ||= !!rig && rig.visible && cop.worldPlaced;
        if (rig) rig.traverse(node => { finite &&= node.matrixWorld.elements.every(Number.isFinite); });
        if (down && !s.crashed && s.invulnerable > 0) { recovered = true; break; }
      }
      rows.push({ index, role: cop.role, down, full, recovered, rendered, finite, crashes, causeAtCrash,
        recoveryBlend: cop.current.ragdollBlend, recoveryInvulnerable: cop.controller.snapshot().invulnerable });
    }
    return rows;
  });
  expect(rows).toHaveLength(3);
  expect(rows.map(row => row.role)).toEqual(['tail', 'patrol', 'patrol']);
  for (const row of rows) {
    expect(row).toMatchObject({ down: true, full: true, recovered: true, rendered: true, finite: true, causeAtCrash: 'cutout' });
    expect(row.crashes).toBe(1);
    expect(row.recoveryBlend).toBe(0);
    expect(row.recoveryInvulnerable).toBeGreaterThan(0);
  }
  await evidence(page, info, rows, true);
  expect(errors).toEqual([]);
});

test('a human cop can crash and recover while the couch outlaw remains upright', async ({ page }, info) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=route-41');
  await prepare(page);
  const row = await page.evaluate(() => {
    const game = window.game;
    game.setCouchRide('chase'); game.spawnRider('cop'); game.endClaiming(); game.startChase();
    game.loop.setRunning(false); game.clearActions(); game.advance(400);
    const spawn = game.levelPlan.spawn;
    game.placeRider({ x: spawn.position.x - 5, y: spawn.position.y, z: spawn.position.z }, spawn.headingY, 0);
    game.placeRider({ x: spawn.position.x + 5, y: spawn.position.y, z: spawn.position.z }, spawn.headingY, 1);
    const copId = game.snapshotFor(1).rider.installed;
    const before = [window.ragRepair.body(0), window.ragRepair.body(1)];
    const accepted = window.ragRepair.knock(1, -1);
    game.advance(30);
    const down = [window.ragRepair.body(0), window.ragRepair.body(1)];
    const settled = window.ragRepair.settle(1);
    return { copId, accepted, before, down, settled, after: [window.ragRepair.body(0), window.ragRepair.body(1)],
      app: game.snapshot().app.state, couch: game.snapshot().chase.room.couch };
  });
  expect(row.copId).toBe('cop'); expect(row.couch).toBe(true);
  expect(row.accepted).toBe(true);
  expect(row.down[0].crashed).toBe(false);
  expect(row.down[0].crashes).toBe(row.before[0].crashes);
  expect(row.down[1].crashed).toBe(true); expect(row.down[1].blend).toBeGreaterThan(.99);
  expectBody(row.down[1], 'human cop');
  expect(row.settled).toMatchObject({ fullBlend: true, finite: true, recovered: true });
  expect(row.after[0].crashed).toBe(false);
  expect(row.after[1].crashed).toBe(false);
  await evidence(page, info, row, true);
  expect(errors).toEqual([]);
});
