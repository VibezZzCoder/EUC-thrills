/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { StreetFront } from '../src/level/streetFronts.ts';
import { bootAtTier, collectErrors } from './harness.ts';

const shots = process.env.ENVIRONMENT_RIDE_SHOTS ?? 'test-results/street-life/revision-7/ridden-r2';

interface CaptureCheckpoint {
  label: 'approach' | 'pass' | 'departure' | 'visible-frontage';
  simTimeSeconds: number;
  progressMetres: number;
  position: { x: number; y: number; z: number };
  sign: { x: number; y: number; inFront: boolean };
}

/**
 * Controller/camera evidence, not a performance instrument. Both seeds start
 * at their normal spawn. The driver has no placement/reset/recovery path, and
 * recording advances at most one small production-controller step batch per
 * paced RAF callback. Failed rides leave their trace, clip and final frame.
 */
for (const seed of ['euc', 'corner']) {
  test(`environment chase presentation rides from normal spawn through commercial streets: ${seed}`, async ({ page }) => {
    test.setTimeout(180_000);
    const began = Date.now();
    const directory = join(shots, seed);
    mkdirSync(directory, { recursive: true });
    const errors = collectErrors(page);
    const captures: CaptureCheckpoint[] = [];
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.exposeBinding('environmentRideCapture', async ({ page: currentPage }, checkpoint: CaptureCheckpoint) => {
      if (!['approach', 'pass', 'departure', 'visible-frontage'].includes(checkpoint.label)) throw new Error('Unknown ridden checkpoint');
      await currentPage.screenshot({ path: join(directory, `${checkpoint.label}.png`) });
      captures.push(checkpoint);
    });

    try {
      await bootAtTier(page, `level=generated&seed=${seed}`, 'high', { freezeAtStart: true });
      await page.screenshot({ path: join(directory, 'normal-spawn.png') });
      const recordingBudgetMs = Math.max(5_000, Math.min(150_000, 170_000 - (Date.now() - began)));
      const result = await page.evaluate(async ({ requestedSeed, wallLimitMs }) => {
        const game = window.game;
        const modulePath = '/src/level/streetFronts.ts';
        const { streetFronts } = await import(modulePath);
        const initial = game.snapshot();
        const spawn = game.levelPlan.spawn;
        const spawnGap = Math.hypot(
          initial.euc.position.x - spawn.position.x,
          initial.euc.position.z - spawn.position.z,
        );
        // 2026-10-04: a living world's plan id is a composition hash; the
        // builder identity is recordWorldId (`generated-r6-<seed>~living-r1`).
        if (initial.world.seed !== requestedSeed || initial.world.levelId !== 'generated'
          || game.levelPlan.recordWorldId !== `generated-r6-${requestedSeed}~living-r1`) throw new Error('The requested generated world did not load');
        if (spawnGap > 0.01 || Math.abs(initial.euc.headingY - spawn.headingY) > 0.01) {
          throw new Error('The rider did not begin at the normal authored spawn');
        }
        if (!initial.app.acceptsRideInput || initial.camera.mode !== 'chase' || initial.loop.running
          || initial.camera.scriptedOcclusion) throw new Error('The normal frozen free-ride chase state is unavailable');

        const ring = game.levelPlan.streetLoops?.find(loop => loop.alternate.length === 0);
        if (!ring) throw new Error('The generated plan has no required town-ring route');
        const commercialExit = ring.main.indexOf('city-commercial-exit');
        if (commercialExit < 0) throw new Error('The required ring has no commercial exit');
        const ids = ring.main.slice(0, commercialExit + 1);
        const raw = window.qa.routePoints(ids, 2);
        const points: { x: number; z: number }[] = [];
        const station: number[] = [];
        for (const point of raw) {
          const previous = points[points.length - 1];
          const length = previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0;
          if (previous && length < 1e-6) continue;
          station.push((station[station.length - 1] ?? 0) + length);
          points.push(point);
        }
        if (points.length < 2) throw new Error('The commercial approach needs a continuous polyline');
        if (Math.hypot(points[0].x - spawn.position.x, points[0].z - spawn.position.z) > 0.01) {
          throw new Error('The required route does not begin at the authored spawn');
        }
        let totalMetres = station[station.length - 1];

        function projection(x: number, z: number, from: number, through: number) {
          let best = { station: 0, gap: Infinity, segment: from };
          for (let i = from; i <= through; i += 1) {
            const a = points[i], b = points[i + 1];
            const dx = b.x - a.x, dz = b.z - a.z;
            const length2 = dx * dx + dz * dz;
            const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2));
            const gap = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
            if (gap < best.gap) best = { station: station[i] + t * Math.sqrt(length2), gap, segment: i };
          }
          return best;
        }

        // This is a driver's route choice around original hazards, not a
        // product repair. Keep the hazard array, surfaces and controller intact.
        const hazardIdentity = JSON.stringify(game.levelPlan.hazards ?? []);
        const deepHazards = (game.levelPlan.hazards ?? []).filter(hazard => hazard.kind === 'potholeDeep');
        const basePoints = points.map(point => ({ ...point }));
        const baseStation = [...station];
        const baseRouteMetres = totalMetres;
        const solids = [...game.levelPlan.segments.flatMap(segment => segment.colliders), ...(game.levelPlan.solids ?? [])];
        const modified = points.map(() => false);
        const hazardDetours: {
          id: string; centre: { x: number; y: number; z: number }; radius: number;
          baseStationMetres: number; baseRouteGapMetres: number;
          signedLateralMetres: number; peakOffsetMetres: number;
          plateauHalfMetres: number; rampMetres: number; plannedClearanceMetres: number;
        }[] = [];
        const threats = deepHazards.map(hazard => ({ hazard,
          route: projection(hazard.centre.x, hazard.centre.z, 0, points.length - 2),
        })).filter(threat => threat.route.gap < threat.hazard.radius + 1.1)
          .sort((a, b) => a.route.station - b.route.station || a.hazard.id.localeCompare(b.hazard.id));

        function normalAt(index: number): { x: number; z: number } {
          const a = basePoints[Math.max(0, index - 1)], b = basePoints[Math.min(basePoints.length - 1, index + 1)];
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          return { x: (b.z - a.z) / length, z: -(b.x - a.x) / length };
        }

        function clearDetour(candidate: readonly { x: number; z: number }[], affected: readonly boolean[]) {
          let minimumClearance = Infinity;
          for (let i = 0; i < candidate.length - 1; i += 1) {
            if (!affected[i] && !affected[i + 1]) continue;
            const a = candidate[i], b = candidate[i + 1];
            const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
            for (let sample = 0; sample <= count; sample += 1) {
              const t = sample / count;
              const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
              const ground = game.sampleGround(x, z);
              if (ground.offCourse || ground.surface === 'grass') return { okay: false, minimumClearance, reason: 'outside-corridor' };
              const baseX = basePoints[i].x + (basePoints[i + 1].x - basePoints[i].x) * t;
              const baseZ = basePoints[i].z + (basePoints[i + 1].z - basePoints[i].z) * t;
              if (Math.abs(ground.height - game.sampleGround(baseX, baseZ).height) > 0.35) {
                return { okay: false, minimumClearance, reason: 'ground-or-obstacle-step' };
              }
              for (const solid of solids) {
                if (solid.centre.y + solid.halfExtents.y <= ground.height + 0.25) continue;
                const dx = x - solid.centre.x, dz = z - solid.centre.z;
                const c = Math.cos(solid.rotationY), s = Math.sin(solid.rotationY);
                if (Math.abs(c * dx - s * dz) < solid.halfExtents.x + 0.6
                  && Math.abs(s * dx + c * dz) < solid.halfExtents.z + 0.6) {
                  return { okay: false, minimumClearance, reason: 'solid-clearance' };
                }
              }
              for (const hazard of deepHazards) {
                const clearance = Math.hypot(x - hazard.centre.x, z - hazard.centre.z) - hazard.radius;
                minimumClearance = Math.min(minimumClearance, clearance);
                if (clearance < 0.9) return { okay: false, minimumClearance, reason: 'deep-hazard-clearance' };
              }
            }
          }
          return { okay: true, minimumClearance, reason: 'clear' };
        }

        for (const threat of threats) {
          const index = threat.route.segment;
          const a = basePoints[index], b = basePoints[index + 1];
          const length = baseStation[index + 1] - baseStation[index];
          const t = (threat.route.station - baseStation[index]) / length;
          const normal = normalAt(index);
          const lateral = (threat.hazard.centre.x - a.x - t * (b.x - a.x)) * normal.x
            + (threat.hazard.centre.z - a.z - t * (b.z - a.z)) * normal.z;
          const preferred = lateral >= 0 ? -1 : 1;
          const plateau = 12;
          const ramp = 18;
          const minimumOffset = Math.max(2, threat.hazard.radius + 1.2 - Math.abs(lateral));
          let accepted = false;
          let refusal = 'no-candidate';
          for (const direction of [preferred, -preferred]) {
            for (const extra of [0, 0.6, 1.2]) {
              const peakOffset = direction * (minimumOffset + extra);
              const affected = [...modified];
              const candidate = points.map((point, pointIndex) => {
                const distance = Math.abs(baseStation[pointIndex] - threat.route.station);
                const u = Math.max(0, Math.min(1, (plateau + ramp - distance) / ramp));
                const weight = Math.min(1, Math.max(0, u * u * u * (u * (6 * u - 15) + 10)));
                if (weight === 0) return { ...point };
                affected[pointIndex] = true;
                const sideways = normalAt(pointIndex);
                return { x: point.x + sideways.x * peakOffset * weight,
                  z: point.z + sideways.z * peakOffset * weight };
              });
              const check = clearDetour(candidate, affected);
              refusal = check.reason;
              if (!check.okay) continue;
              for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
                points[pointIndex] = candidate[pointIndex];
                modified[pointIndex] = affected[pointIndex];
              }
              hazardDetours.push({ id: threat.hazard.id, centre: threat.hazard.centre, radius: threat.hazard.radius,
                baseStationMetres: threat.route.station, baseRouteGapMetres: threat.route.gap,
                signedLateralMetres: lateral, peakOffsetMetres: peakOffset,
                plateauHalfMetres: plateau, rampMetres: ramp, plannedClearanceMetres: check.minimumClearance });
              accepted = true;
              break;
            }
            if (accepted) break;
          }
          if (!accepted) throw new Error(`No physical driver detour for ${threat.hazard.id}: ${refusal}`);
        }
        if (hazardDetours.length > 0) {
          const finalCheck = clearDetour(points, modified);
          if (!finalCheck.okay) throw new Error(`Combined hazard detours are invalid: ${finalCheck.reason}`);
          station[0] = 0;
          for (let i = 1; i < points.length; i += 1) {
            station[i] = station[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
          }
          totalMetres = station[station.length - 1];
        }

        const fronts: StreetFront[] = streetFronts(game.levelPlan);
        const candidates = fronts.map(front => ({
          front, route: projection(front.street.x, front.street.z, 0, points.length - 2),
        })).filter(candidate => candidate.route.station > 30 && candidate.route.station < totalMetres - 30)
          .sort((a, b) => a.route.gap - b.route.gap || a.route.station - b.route.station);
        const watched = candidates[0];
        if (!watched || watched.route.gap > 12) throw new Error('No selected shop has a meaningful view from the required commercial route');
        const target = {
          shop: watched.front.shop,
          position: watched.front.position,
          street: watched.front.street,
          yaw: watched.front.yaw,
          progressMetres: watched.route.station,
          routeGapMetres: watched.route.gap,
        };
        const captureStations = [
          { label: 'approach' as const, at: target.progressMetres - 25 },
          { label: 'pass' as const, at: target.progressMetres },
          { label: 'departure' as const, at: target.progressMetres + 22 },
        ];
        const captured = new Set<string>();

        const originalPlaceRider = game.placeRider;
        let teleportCalls = 0;
        game.clearActions();
        const dt = game.loop.stepSeconds;
        const stride = 6;
        const maximumSteps = Math.floor(120 / dt);
        const trace: {
          steps: number; tick: number; simTimeSeconds: number;
          position: { x: number; y: number; z: number };
          headingY: number; speed: number; distanceTravelled: number;
          progressMetres: number; routeGapMetres: number;
          target: { x: number; z: number }; headingError: number;
          throttle: number; steer: number; blocked: boolean; offCourse: boolean;
          grounded: boolean; crashes: number; cameraMode: string; armDistance: number;
          scriptedOcclusion: boolean; lifeClockSeconds: number | null;
          sharedClockErrorSeconds: number; drawCalls: number; triangles: number;
          sign: { x: number; y: number; inFront: boolean };
        }[] = [];
        let progress = 0;
        let cursor = 0;
        let steps = 0;
        let lastProgressSteps = 0;
        let lastMeaningfulProgress = 0;
        let blockedSteps = 0;
        let offCourseSteps = 0;
        let greatestDisplacement = 0;
        let greatestClockError = 0;
        let minimumRiddenDeepClearance = Infinity;
        let previous = initial;
        let outcome = 'not-started';
        let recorderError = '';
        let recorderStopped = false;
        let raf = 0;
        let wallTimer = 0;
        const canvas = document.querySelector('canvas');
        if (!canvas) throw new Error('There is no rendered game canvas');
        if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
          throw new Error('Canvas recording is unavailable in this browser');
        }
        const stream = canvas.captureStream();
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8' : 'video/webm';
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
        } catch (error) {
          for (const track of stream.getTracks()) track.stop();
          throw error;
        }
        const chunks: Blob[] = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { recorderError = 'Canvas recording failed'; };
        const stopped = new Promise<void>(resolve => { recorder.onstop = () => { recorderStopped = true; resolve(); }; });
        game.placeRider = () => {
          teleportCalls += 1;
          throw new Error('Placement is forbidden after the normal-spawn boot');
        };

        function pointAt(distance: number): { x: number; z: number } {
          let index = cursor;
          while (index < points.length - 2 && station[index + 1] < distance) index += 1;
          const t = Math.max(0, Math.min(1, (distance - station[index]) / (station[index + 1] - station[index])));
          return { x: points[index].x + t * (points[index + 1].x - points[index].x),
            z: points[index].z + t * (points[index + 1].z - points[index].z) };
        }

        let end = initial;
        let videoBase64 = '';
        try {
          recorder.start(1_000);
          await new Promise<void>(resolve => {
            let done = false;
            let notBefore = performance.now() + stride * dt * 1000;
            const finish = (reason: string): void => {
              if (done) return;
              done = true;
              outcome = reason;
              cancelAnimationFrame(raf);
              window.clearTimeout(wallTimer);
              resolve();
            };
            wallTimer = window.setTimeout(() => finish('recording-wall-limit'), wallLimitMs);
            const draw = async (now: number): Promise<void> => {
              if (done) return;
              if (now < notBefore) { raf = requestAnimationFrame(draw); return; }
              try {
                if (recorderError) { finish('recorder-error'); return; }
                const before = game.snapshot();
                const euc = before.euc;
                const nearest = projection(euc.position.x, euc.position.z,
                  Math.max(0, cursor - 2), Math.min(points.length - 2, cursor + 16));
                progress = Math.max(progress, nearest.station);
                while (cursor < points.length - 2 && station[cursor + 1] <= progress) cursor += 1;
                const lookAhead = Math.max(7, Math.min(10, 7 + Math.abs(euc.speed) * 0.25));
                const aim = pointAt(Math.min(totalMetres, progress + lookAhead));
                let error = Math.atan2(aim.x - euc.position.x, aim.z - euc.position.z) - euc.headingY;
                while (error > Math.PI) error -= Math.PI * 2;
                while (error < -Math.PI) error += Math.PI * 2;
                const steer = Math.max(-1, Math.min(1, -error * 1.8));
                const throttle = euc.speed > 8 ? 0 : Math.max(0.25, 1 - Math.abs(error));
                game.setActions({ throttle, steer });
                game.advance(Math.min(stride, maximumSteps - steps));
                steps += Math.min(stride, maximumSteps - steps);
                end = game.snapshot();
                const after = end.euc;
                const afterProjection = projection(after.position.x, after.position.z,
                  Math.max(0, cursor - 2), Math.min(points.length - 2, cursor + 16));
                progress = Math.max(progress, afterProjection.station);
                while (cursor < points.length - 2 && station[cursor + 1] <= progress) cursor += 1;
                if (progress > lastMeaningfulProgress + 0.25) {
                  lastMeaningfulProgress = progress;
                  lastProgressSteps = steps;
                }
                blockedSteps = after.blocked ? blockedSteps + stride : 0;
                offCourseSteps = after.offCourse ? offCourseSteps + stride : 0;
                const displacement = Math.hypot(after.position.x - previous.euc.position.x,
                  after.position.z - previous.euc.position.z);
                greatestDisplacement = Math.max(greatestDisplacement, displacement);
                const life = game.renderer.presentation()?.streetLife;
                const clockError = Math.max(
                  Math.abs((end.simTimeSeconds - initial.simTimeSeconds) - steps * dt),
                  life ? Math.abs(life.clockSeconds - end.simTimeSeconds) : Infinity,
                );
                greatestClockError = Math.max(greatestClockError, clockError);
                const sign = window.qa.projectPoint(target.position.x, target.position.y + 3.75, target.position.z);
                for (const hazard of deepHazards) {
                  minimumRiddenDeepClearance = Math.min(minimumRiddenDeepClearance,
                    Math.hypot(after.position.x - hazard.centre.x, after.position.z - hazard.centre.z) - hazard.radius);
                }
                trace.push({
                  steps, tick: end.tick, simTimeSeconds: end.simTimeSeconds,
                  position: { ...after.position }, headingY: after.headingY, speed: after.speed,
                  distanceTravelled: after.distanceTravelled, progressMetres: progress,
                  routeGapMetres: afterProjection.gap, target: aim, headingError: error,
                  throttle, steer, blocked: after.blocked, offCourse: after.offCourse,
                  grounded: after.grounded, crashes: after.crashes, cameraMode: end.camera.mode,
                  armDistance: end.camera.armDistance, scriptedOcclusion: end.camera.scriptedOcclusion,
                  lifeClockSeconds: life?.clockSeconds ?? null, sharedClockErrorSeconds: clockError,
                  drawCalls: end.render.drawCalls, triangles: end.render.triangles, sign,
                });
                if (end.euc.crashes > initial.euc.crashes) { finish('controller-crash'); return; }
                if (displacement > Math.max(1.2, Math.abs(previous.euc.speed) * stride * dt * 1.8 + 0.25)) {
                  finish('position-discontinuity'); return;
                }
                if (clockError > 1e-7 || end.tick !== initial.tick + steps) { finish('shared-clock-discontinuity'); return; }
                if (end.camera.mode !== 'chase' || end.camera.scriptedOcclusion) { finish('camera-state-changed'); return; }
                if (blockedSteps * dt > 2) { finish('controller-blocked'); return; }
                if (offCourseSteps * dt > 2) { finish('left-authored-route'); return; }
                if ((steps - lastProgressSteps) * dt > 8) { finish('route-progress-stalled'); return; }
                if (afterProjection.gap > 14) { finish('route-deviation'); return; }
                if ((end.consumed.reset ?? 0) !== (initial.consumed.reset ?? 0)) { finish('unexpected-reset'); return; }
                previous = end;

                // Route stations remain honest even when a side facade has
                // naturally passed out of the chase view. This extra image
                // captures its real ordinary-camera approach while on screen.
                if (!captured.has('visible-frontage') && progress < target.progressMetres
                  && progress > target.progressMetres - 40
                  && Math.hypot(after.position.x - target.position.x, after.position.z - target.position.z) < 50
                  && sign.inFront && Math.abs(sign.x) <= 0.8 && Math.abs(sign.y) <= 0.8) {
                  await (window as unknown as {
                    environmentRideCapture(checkpoint: CaptureCheckpoint): Promise<void>;
                  }).environmentRideCapture({ label: 'visible-frontage', simTimeSeconds: end.simTimeSeconds,
                    progressMetres: progress, position: { ...after.position }, sign });
                  captured.add('visible-frontage');
                  if (done) return;
                }

                for (const checkpoint of captureStations) {
                  if (progress < checkpoint.at || captured.has(checkpoint.label)) continue;
                  await (window as unknown as {
                    environmentRideCapture(checkpoint: CaptureCheckpoint): Promise<void>;
                  }).environmentRideCapture({ label: checkpoint.label, simTimeSeconds: end.simTimeSeconds,
                    progressMetres: progress, position: { ...after.position }, sign });
                  captured.add(checkpoint.label);
                  if (done) return;
                }
                const last = points[points.length - 1];
                if (progress >= totalMetres - 10
                  && Math.hypot(last.x - after.position.x, last.z - after.position.z) < 7) {
                  finish('finished'); return;
                }
                if (steps >= maximumSteps) { finish('simulation-limit'); return; }
                // Wait a full simulated batch duration after the work. Never
                // catch up many batches when a draw/screenshot was slow.
                notBefore = performance.now() + stride * dt * 1000;
                raf = requestAnimationFrame(draw);
              } catch (error) {
                finish(`driver-error: ${error instanceof Error ? error.message : String(error)}`);
              }
            };
            raf = requestAnimationFrame(draw);
          });
        } finally {
          cancelAnimationFrame(raf);
          window.clearTimeout(wallTimer);
          game.clearActions();
          game.placeRider = originalPlaceRider;
          if (recorder.state !== 'inactive') recorder.stop();
          let stopTimer = 0;
          await Promise.race([stopped, new Promise<void>(resolve => { stopTimer = window.setTimeout(resolve, 3_000); })]);
          window.clearTimeout(stopTimer);
          for (const track of stream.getTracks()) track.stop();
        }
        if (chunks.length > 0) {
          videoBase64 = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => { recorderError = 'Reading the completed clip failed'; resolve(''); };
            reader.readAsDataURL(new Blob(chunks, { type: mimeType }));
          });
        }
        return {
          seed: requestedSeed, outcome, routeIds: ids, routeMetres: totalMetres, baseRouteMetres, target,
          hazardDetours, hazardsUnchanged: JSON.stringify(game.levelPlan.hazards ?? []) === hazardIdentity,
          minimumRiddenDeepClearanceMetres: deepHazards.length > 0 ? minimumRiddenDeepClearance : null,
          initial: { tick: initial.tick, simTimeSeconds: initial.simTimeSeconds, position: initial.euc.position,
            headingY: initial.euc.headingY, spawn, spawnGapMetres: spawnGap,
            crashes: initial.euc.crashes, distanceTravelled: initial.euc.distanceTravelled },
          end: { tick: end.tick, simTimeSeconds: end.simTimeSeconds, position: end.euc.position,
            headingY: end.euc.headingY, speed: end.euc.speed, crashes: end.euc.crashes,
            distanceTravelled: end.euc.distanceTravelled, cameraMode: end.camera.mode },
          steps, simulationSeconds: steps * dt, progressMetres: progress,
          controllerDistanceMetres: end.euc.distanceTravelled - initial.euc.distanceTravelled,
          teleportCalls, resetDelta: (end.consumed.reset ?? 0) - (initial.consumed.reset ?? 0),
          crashDelta: end.euc.crashes - initial.euc.crashes,
          greatestDisplacementMetres: greatestDisplacement, greatestClockErrorSeconds: greatestClockError,
          captured: [...captured], recorderError, recorderStopped,
          videoBase64, trace,
        };
      }, { requestedSeed: seed, wallLimitMs: recordingBudgetMs });

      const { videoBase64, trace, ...report } = result;
      writeFileSync(join(directory, 'trace.json'), JSON.stringify(trace, null, 2) + '\n');
      writeFileSync(join(directory, 'report.json'), JSON.stringify({ ...report, captures,
        evidence: 'Normal-spawn production-controller ride; paced synthetic stepping; sustained hardware performance unverified' }, null, 2) + '\n');
      if (videoBase64) writeFileSync(join(directory, 'ride.webm'), Buffer.from(videoBase64, 'base64'));
      await page.screenshot({ path: join(directory, 'final.png') });

      // Preserve every artifact before rejecting a blocked/crashed driver.
      expect(result.outcome, JSON.stringify(report)).toBe('finished');
      expect(result.teleportCalls).toBe(0);
      expect(result.resetDelta).toBe(0);
      expect(result.crashDelta).toBe(0);
      expect(result.simulationSeconds).toBeLessThanOrEqual(120);
      expect(result.initial.spawnGapMetres).toBeLessThanOrEqual(0.01);
      expect(result.progressMetres).toBeGreaterThan(result.routeMetres - 10);
      expect(result.controllerDistanceMetres).toBeGreaterThan(result.routeMetres * 0.8);
      expect(result.greatestClockErrorSeconds).toBeLessThan(1e-7);
      expect(result.captured.filter(label => label !== 'visible-frontage')).toEqual(['approach', 'pass', 'departure']);
      expect(result.captured).toContain('visible-frontage');
      const visible = captures.find(checkpoint => checkpoint.label === 'visible-frontage');
      expect(visible?.sign.inFront).toBe(true);
      expect(Math.abs(visible!.sign.x)).toBeLessThanOrEqual(0.8);
      expect(Math.abs(visible!.sign.y)).toBeLessThanOrEqual(0.8);
      expect(visible!.progressMetres).toBeLessThan(result.target.progressMetres);
      expect(result.hazardsUnchanged).toBe(true);
      if (result.minimumRiddenDeepClearanceMetres !== null) expect(result.minimumRiddenDeepClearanceMetres).toBeGreaterThan(0.15);
      expect(result.recorderError).toBe('');
      expect(result.recorderStopped).toBe(true);
      expect(videoBase64.length).toBeGreaterThan(1000);
      expect(trace.length).toBeGreaterThan(100);
      expect(trace.every(sample => sample.cameraMode === 'chase' && !sample.scriptedOcclusion)).toBe(true);
      expect(trace.some(sample => sample.speed > 4)).toBe(true);
      expect(trace.every((sample, index) => index === 0 || sample.progressMetres >= trace[index - 1].progressMetres)).toBe(true);
      expect(errors).toEqual([]);
    } catch (error) {
      writeFileSync(join(directory, 'failure.json'), JSON.stringify({ seed,
        error: error instanceof Error ? error.message : String(error), captures, errors }, null, 2) + '\n');
      await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => undefined);
      throw error;
    }
  });
}
