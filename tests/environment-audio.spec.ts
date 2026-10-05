/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ENVIRONMENT_AMBIENCE } from '../src/data/tuning.ts';
import type { StreetFront } from '../src/level/streetFronts.ts';
import type { EnvironmentAmbienceEmitter } from '../src/audio/environmentAmbience.ts';
import { bootAtTier, collectErrors } from './harness.ts';

const reports = process.env.ENVIRONMENT_AUDIO_REPORTS ?? 'test-results/environment-upgrade/audio-r1';

function report(name: string, evidence: unknown): void {
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, `${name}.json`), JSON.stringify(evidence, null, 2));
}

async function arm(page: Page): Promise<void> {
  await page.keyboard.press('ShiftLeft');
  await page.waitForFunction(() => window.game.audioSnapshot().contextState === 'running'
    && window.game.audioSnapshot().samplesLoaded);
}

/** Diagnostic listener placements on the installed plan, never a riding claim.
 * The bed is muted solely to isolate environmental signal at the master tap. */
async function listen(page: Page, distance: number | 'far') {
  return page.evaluate(async distance => {
    const frontPath = '/src/level/streetFronts.ts', mapperPath = '/src/app/environmentAudio.ts';
    const [{ streetFronts }, { environmentAudioEmitters }] = await Promise.all([
      import(frontPath), import(mapperPath),
    ]);
    const game = window.game;
    game.setAppState('freeRide');
    game.loop.setRunning(false);
    game.setActions({ throttle: 0, steer: 0 });
    game.audio.setTuning({ bedTrim: 0 });
    const emitters = environmentAudioEmitters(game.levelPlan) as readonly EnvironmentAmbienceEmitter[];
    const front = (streetFronts(game.levelPlan) as StreetFront[]).find(front => front.shop === 'COFFEE');
    if (!front) throw new Error(`No installed coffee source in ${game.levelPlan.id}`);
    const source = emitters.find(emitter => emitter.kind === 'cafe');
    if (!source) throw new Error('The actual coffee front has no sound descriptor');
    const near = { x: front.position.x + Math.sin(front.yaw) * 5,
      z: front.position.z + Math.cos(front.yaw) * 5 };
    const candidates = [game.levelPlan.spawn.position,
      ...game.levelPlan.segments.flatMap(segment => [segment.entry.position, segment.exit.position])];
    const far = candidates.filter(point => {
      const ground = game.sampleGround(point.x, point.z);
      return !ground.offCourse && ['pavement', 'brick', 'roughPavement'].includes(ground.surface)
        && emitters.every(emitter => Math.hypot(point.x - emitter.x, point.z - emitter.z) > 40)
        && !(game.levelPlan.hazards ?? []).some(hazard =>
          Math.hypot(point.x - hazard.centre.x, point.z - hazard.centre.z) < hazard.radius + 1);
    }).sort((a, b) => Math.hypot(b.x - source.x, b.z - source.z)
      - Math.hypot(a.x - source.x, a.z - source.z))[0];
    if (!far) throw new Error('No valid silent exterior listener fixture');
    const point = distance === 'far' ? far : {
      x: front.position.x + Math.sin(front.yaw) * distance,
      z: front.position.z + Math.cos(front.yaw) * distance,
    };
    game.placeRider({ x: point.x, y: game.sampleGround(point.x, point.z).height, z: point.z }, front.yaw);
    game.advance(240);
    return { world: game.levelPlan.id, source, emitters, near, far,
      presented: game.snapshot().euc.position, audio: game.audioSnapshot() };
  }, distance);
}

async function selectWorld(page: Page, seed: string | null): Promise<void> {
  await page.evaluate(() => { window.game.setAppState('title'); window.game.loop.setRunning(false); });
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  if (seed === null) await page.locator('.euc-menu--routes [data-venue="slice"]').click();
  else {
    await page.locator('#euc-seed').fill(seed);
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  }
  // 2026-10-04: plan ids of living worlds are composition hashes; the builder
  // identity is recordWorldId, and a menu world swap now prepares the living
  // world behind the loading cover (seconds, not one synchronous call).
  await expect.poll(() => page.evaluate(() => window.game.levelPlan.recordWorldId), { timeout: 90_000 })
    .toBe(seed === null ? 'm7-slice~living-r1' : `generated-r6-${seed}~living-r1`);
  await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
  await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(0); });
}

test('environment audio uses the presented listener, carries real signal and follows distance, buses and pause', async ({ page }) => {
  const errors = collectErrors(page), evidence: Record<string, unknown> = {};
  try {
    await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true, ride: false });
    const boot = await page.evaluate(() => window.game.audioSnapshot()); evidence.boot = boot;
    // 2026-10-04: the ambience is keyed by the installed plan id, which for a
    // living world is a composition hash; the builder identity is recordWorldId.
    // The living world also registers its moving actors' quiet sources, so the
    // count is the installed trades (still exactly 3 at euc) plus those.
    const installed = await page.evaluate(async () => {
      const mapperPath = '/src/app/environmentAudio.ts', populationPath = '/src/app/populationAudio.ts';
      const [{ environmentAudioEmitters }, { populationAudioEmitters }] = await Promise.all([import(mapperPath), import(populationPath)]);
      const game = window.game;
      return { id: game.levelPlan.id, record: game.levelPlan.recordWorldId,
        trades: environmentAudioEmitters(game.levelPlan).length,
        population: populationAudioEmitters((game as unknown as { populationPlan: unknown }).populationPlan).length };
    });
    evidence.installed = installed;
    expect(installed.record).toBe('generated-r6-euc~living-r1');
    expect(installed.trades).toBe(3);
    expect(boot.armed).toBe(false);
    expect(boot.ambience).toMatchObject({ worldId: installed.id, listenerSeat: 0,
      running: false, emitterCount: installed.trades + installed.population, totalGain: 0, permanentNodes: 0, bufferBytes: 0 });
    await arm(page);
    const title = await page.evaluate(async () => ({ audio: window.game.audioSnapshot(), rms: await window.qa.audioOutput(300) }));
    evidence.title = title;
    expect(title.audio.ambience.permanentNodes).toBe(12);
    expect(title.audio.ambience.permanentSources).toBe(1);
    expect(title.audio.ambience.bufferBytes).toBeGreaterThan(0);
    expect(title.rms).toBeLessThan(1e-5);
    await page.evaluate(() => { window.game.setMuted(false); window.game.setVolumes({ master: 1, sfx: 1 }); });
    const near = await listen(page, 5);
    const nearRms = await page.evaluate(() => window.qa.audioOutputMax(400, 5));
    evidence.near = { ...near, rms: nearRms };
    expect(near.audio.ambience.running).toBe(true);
    expect(near.audio.ambience.cafeGain).toBeGreaterThan(0);
    expect(near.audio.ambience.totalGain).toBeLessThanOrEqual(ENVIRONMENT_AMBIENCE.maximumTotalGain);
    expect(nearRms, 'model intent and node counts alone cannot prove a connected graph').toBeGreaterThan(2e-5);
    const gates = await page.evaluate(async () => {
      const game = window.game;
      game.setMuted(true); const muted = await window.qa.audioOutput(350);
      game.setMuted(false); const unmuted = await window.qa.audioOutput(350);
      game.setVolumes({ master: 0 }); const masterZero = await window.qa.audioOutput(350);
      game.setVolumes({ master: 1, sfx: 0 }); const sfxZero = await window.qa.audioOutput(350);
      game.setVolumes({ sfx: 1 }); const restored = await window.qa.audioOutput(350);
      game.setAppState('paused'); game.loop.setRunning(false); game.advance(0);
      const paused = { audio: game.audioSnapshot(), rms: await window.qa.audioOutput(350) };
      return { muted, unmuted, masterZero, sfxZero, restored, paused };
    }); evidence.gates = gates;
    for (const value of [gates.muted, gates.masterZero, gates.sfxZero, gates.paused.rms]) expect(value).toBeLessThan(1e-5);
    for (const value of [gates.unmuted, gates.restored]) expect(value).toBeGreaterThan(2e-5);
    expect(gates.paused.audio.ambience).toMatchObject({ running: false, totalGain: 0, activeEmitters: 0 });
    const middle = await listen(page, 14), middleRms = await page.evaluate(() => window.qa.audioOutputMax(400, 5));
    evidence.middle = { ...middle, rms: middleRms };
    expect(middle.audio.ambience.cafeGain).toBeLessThan(near.audio.ambience.cafeGain * 0.7);
    expect(middleRms).toBeLessThan(nearRms * 0.75);
    const far = await listen(page, 'far'), farRms = await page.evaluate(() => window.qa.audioOutput(350));
    evidence.far = { ...far, rms: farRms };
    expect(far.audio.ambience.activeEmitters).toBe(0);
    expect(farRms).toBeLessThan(nearRms * 0.05);
    await listen(page, 5);
    const empty = await page.evaluate(async () => {
      window.game.audio.clearAmbienceWorld();
      return { audio: window.game.audioSnapshot(), rms: await window.qa.audioOutput(350) };
    }); evidence.emptyNegativeControl = empty;
    expect(empty.audio.ambience.emitterCount).toBe(0);
    expect(empty.rms).toBeLessThan(1e-5);
    expect(errors).toEqual([]);
  } finally { report('signal-distance-gates', { evidence, errors, listening: 'Unverified',
    method: 'QA listener placements; ride bed muted for master-signal isolation; no route or hardware acceptance' }); }
});

test('actual warning and siren decisions duck the real ambience graph while its resources stay fixed', async ({ page }) => {
  const errors = collectErrors(page); let evidence: unknown = null;
  try {
    await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true });
    await arm(page); await listen(page, 5);
    evidence = await page.evaluate(async (parameterGlideSeconds) => {
      const game = window.game, audio = game.audio;
      const listener = game.snapshot().euc.position;
      // This page is an explicit engine probe after the Game fixture installs
      // its real world/listener. Stop rendering as well as simulation so no
      // composition-root write can replace these diagnostic priority inputs.
      // The other specs retain the normal render path and prove Game wiring.
      game.loop.dispose();
      const owner = audio as unknown as { context: AudioContext; sink: { ambience: { nodes: AudioNode[] } } };
      const output = owner.sink.ambience.nodes[0], tap = owner.context.createAnalyser();
      tap.fftSize = 8192; tap.smoothingTimeConstant = 0;
      const data = new Float32Array(new ArrayBuffer(tap.fftSize * Float32Array.BYTES_PER_ELEMENT));
      // An analyser retains its complete pre-change waveform window, even
      // with spectral smoothing disabled. Drain that window and five gain
      // glide time constants before comparing settled branch amplitudes.
      const settlingMs = Math.ceil(1000 * (tap.fftSize / owner.context.sampleRate
        + parameterGlideSeconds * 5));
      output.connect(tap);
      const read = async (): Promise<number> => {
        await new Promise(resolve => window.setTimeout(resolve, settlingMs));
        let power = 0;
        for (let windowIndex = 0; windowIndex < 5; windowIndex++) {
          await new Promise(resolve => window.setTimeout(resolve, 80));
          tap.getFloatTimeDomainData(data);
          let sum = 0; for (const sample of data) sum += sample * sample;
          power += sum / data.length;
        }
        return Math.sqrt(power / 5);
      };
      try {
        const before = audio.snapshot(), baseline = await read();
        // Explicit engine priority probes. Listener/world wiring is exercised
        // by the other specs; these do not claim a physical overspeed/chase.
        audio.input.overspeed = 0.6; audio.update(0.15);
        const warning = { rms: await read(), audio: audio.snapshot() };
        audio.reset(); audio.input.overspeed = 0;
        audio.input.copRangeMetres = Number.POSITIVE_INFINITY;
        audio.setAmbienceListener(listener.x, listener.y, listener.z, true);
        audio.update(2);
        const recovered = { rms: await read(), audio: audio.snapshot() };
        audio.input.copRangeMetres = 8; audio.update(4);
        const siren = { rms: await read(), audio: audio.snapshot() };
        audio.input.overspeed = 0.6; audio.input.copRangeMetres = 8; audio.update(0.15);
        const both = { rms: await read(), audio: audio.snapshot() };
        return { before, baseline, warning, recovered, siren, both,
          loopMode: game.loop.stats().mode,
          sampling: { fftSize: tap.fftSize, sampleRate: owner.context.sampleRate, settlingMs,
            windows: 5, windowSpacingMs: 80 },
          graphResources: [before, warning.audio, recovered.audio, siren.audio, both.audio].map(snapshot => ({
            nodes: snapshot.ambience.permanentNodes, sources: snapshot.ambience.permanentSources,
            bytes: snapshot.ambience.bufferBytes, totalNodes: snapshot.permanentNodes,
          })), measurementNode: 'One test-owned analyser, disconnected in finally' };
      } finally {
        output.disconnect(tap); tap.disconnect(); audio.reset();
      }
    }, ENVIRONMENT_AMBIENCE.parameterGlideSeconds);
    const measured = evidence as { baseline: number; before: { played: { overspeed: number }; overspeedSamplePlays: number };
      warning: { rms: number; audio: { played: { overspeed: number }; overspeedSamplePlays: number; ambience: { duckGain: number } } };
      recovered: { rms: number }; siren: { rms: number; audio: { sirenGain: number; ambience: { duckGain: number } } };
      both: { rms: number; audio: { ambience: { duckGain: number } } };
      loopMode: string; graphResources: { nodes: number; sources: number; bytes: number; totalNodes: number }[] };
    expect(measured.loopMode).toBe('stopped');
    expect(measured.baseline).toBeGreaterThan(2e-5);
    expect(measured.warning.audio.played.overspeed).toBeGreaterThan(measured.before.played.overspeed);
    expect(measured.warning.audio.overspeedSamplePlays).toBeGreaterThan(measured.before.overspeedSamplePlays);
    expect(measured.warning.audio.ambience.duckGain).toBeLessThan(0.3);
    expect(measured.warning.rms).toBeLessThan(measured.baseline * 0.45);
    expect(measured.recovered.rms).toBeGreaterThan(measured.baseline * 0.75);
    expect(measured.siren.audio.sirenGain).toBeGreaterThan(0.1);
    expect(measured.siren.audio.ambience.duckGain).toBeCloseTo(ENVIRONMENT_AMBIENCE.sirenFloor, 2);
    expect(measured.siren.rms).toBeLessThan(measured.recovered.rms * 0.65);
    expect(measured.both.audio.ambience.duckGain).toBeLessThan(0.15);
    expect(measured.both.rms).toBeLessThan(measured.siren.rms * 0.45);
    for (const resources of measured.graphResources) expect(resources).toEqual(measured.graphResources[0]);
    expect(measured.graphResources[0]).toMatchObject({ nodes: 12, sources: 1 });
    expect(errors).toEqual([]);
  } finally { report('priority-signal', { evidence, errors, listening: 'Unverified',
    method: 'Existing-context analyser tap before SFX; actual engine cue/siren priority probes; no physical chase claim' }); }
});

test('world replacement, tier changes and separated couch panes retain one graph and seat-0 listener', async ({ page }) => {
  // 2026-10-04: six menu world swaps now each prepare a living world behind
  // the loading cover (~5–6 s apiece on a quiet machine); the default 120 s
  // no longer covers the fixture.
  test.setTimeout(300_000);
  const errors = collectErrors(page), rounds: unknown[] = []; let shared: unknown = null;
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true });
    await arm(page); await listen(page, 5); await page.evaluate(() => window.qa.audioOutput(300));
    const baseline = await page.evaluate(() => {
      const owner = window.game.audio as unknown as { sink: { ambience: object } };
      (window as unknown as { environmentAudioOriginalGraph: object }).environmentAudioOriginalGraph = owner.sink.ambience;
      const snapshot = window.game.audioSnapshot();
      return { nodes: snapshot.permanentNodes, ambientNodes: snapshot.ambience.permanentNodes,
        sources: snapshot.ambience.permanentSources, bytes: snapshot.ambience.bufferBytes };
    });
    for (const seed of ['corner', 'euc', 'corner']) {
      await selectWorld(page, null);
      const abandoned = await page.evaluate(() => ({ ...window.game.audioSnapshot().ambience,
        installedPlanId: window.game.levelPlan.id }));
      // 2026-10-04: keyed by the installed (composition-hash) plan id; selectWorld
      // already proved that plan is the slice by its recordWorldId.
      expect(abandoned.worldId).toBe(abandoned.installedPlanId);
      expect(abandoned.totalGain).toBe(0);
      await selectWorld(page, seed); const placement = await listen(page, 5);
      const rebuilt = await page.evaluate(async () => {
        const mapperPath = '/src/app/environmentAudio.ts', populationPath = '/src/app/populationAudio.ts';
        const [{ environmentAudioEmitters }, { populationAudioEmitters }] = await Promise.all([import(mapperPath), import(populationPath)]);
        const game = window.game, snapshot = game.audioSnapshot();
        const graph = (game.audio as unknown as { sink: { ambience: object } }).sink.ambience;
        // 2026-10-04: trades plus the living world's moving actor sources.
        return { audio: snapshot, expectedEmitters: environmentAudioEmitters(game.levelPlan).length
          + populationAudioEmitters((game as unknown as { populationPlan: unknown }).populationPlan).length,
          installedPlanId: game.levelPlan.id, recordWorldId: game.levelPlan.recordWorldId,
          sameGraph: graph === (window as unknown as { environmentAudioOriginalGraph: object }).environmentAudioOriginalGraph,
          resources: { nodes: snapshot.permanentNodes, ambientNodes: snapshot.ambience.permanentNodes,
            sources: snapshot.ambience.permanentSources, bytes: snapshot.ambience.bufferBytes } };
      }); rounds.push({ seed, abandoned, placement, rebuilt });
      expect(rebuilt.recordWorldId).toBe(`generated-r6-${seed}~living-r1`);
      expect(rebuilt.audio.ambience.worldId).toBe(rebuilt.installedPlanId);
      expect(rebuilt.audio.ambience.emitterCount).toBe(rebuilt.expectedEmitters);
      expect(rebuilt.audio.ambience.totalGain).toBeGreaterThan(0);
      expect(rebuilt.sameGraph).toBe(true);
      expect(rebuilt.resources).toEqual(baseline);
    }
    const placement = await listen(page, 5);
    shared = await page.evaluate(({ near, far }) => {
      const game = window.game;
      while (game.seatCount < 4) game.spawnSecondRider();
      game.loop.setRunning(false); game.setActions({ throttle: 0, steer: 0 });
      game.audio.setTuning({ bedTrim: 0 });
      game.placeRider({ x: far.x, y: game.sampleGround(far.x, far.z).height, z: far.z }, 0, 0);
      game.placeRider({ x: near.x, y: game.sampleGround(near.x, near.z).height, z: near.z }, 0, 1);
      game.advance(240);
      const distantHost = { audio: game.audioSnapshot(), host: game.snapshotFor(0).euc.position,
        guest: game.snapshotFor(1).euc.position, views: game.renderer.viewCount };
      const tiers = [];
      for (const quality of ['low', 'high', 'ultra', 'high'] as const) {
        game.setOptions({ quality }); game.advance(0);
        const snapshot = game.audioSnapshot();
        tiers.push({ quality, audio: snapshot, nodes: snapshot.permanentNodes });
      }
      game.placeRider({ x: near.x, y: game.sampleGround(near.x, near.z).height, z: near.z }, 0, 0);
      game.placeRider({ x: far.x, y: game.sampleGround(far.x, far.z).height, z: far.z }, 0, 1);
      game.advance(240);
      return { distantHost, tiers, nearHost: game.audioSnapshot() };
    }, placement);
    const measured = shared as { distantHost: { audio: { ambience: { activeEmitters: number; totalGain: number; listenerSeat: number } }; views: number };
      tiers: { nodes: number; audio: { ambience: { permanentNodes: number; permanentSources: number; bufferBytes: number } } }[];
      nearHost: { ambience: { totalGain: number; activeEmitters: number; listenerSeat: number } } };
    expect(measured.distantHost.views).toBe(4);
    expect(measured.distantHost.audio.ambience.activeEmitters).toBe(0);
    expect(measured.distantHost.audio.ambience.totalGain).toBeLessThan(1e-4);
    expect(measured.distantHost.audio.ambience.listenerSeat).toBe(0);
    expect(measured.nearHost.ambience.totalGain).toBeGreaterThan(0.001);
    expect(measured.nearHost.ambience.listenerSeat).toBe(0);
    for (const tier of measured.tiers) {
      expect(tier.nodes).toBe(baseline.nodes);
      expect(tier.audio.ambience).toMatchObject({ permanentNodes: 12, permanentSources: 1, bufferBytes: baseline.bytes });
    }
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => { delete (window as unknown as { environmentAudioOriginalGraph?: object }).environmentAudioOriginalGraph; }).catch(() => undefined);
    report('world-couch-resources', { rounds, shared, errors, listening: 'Unverified' });
  }
});
