/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { IndustrialBaySite } from '../src/level/environmentSites.ts';
import type { LevelPlan } from '../src/level/plan.ts';
import { bootAtTier, collectErrors } from './harness.ts';

const shots = process.env.ENVIRONMENT_INDUSTRIAL_RIDE_SHOTS
  ?? 'test-results/environment-upgrade/industrial-r4/ridden';
const seed = 'euc';

interface PortalVisibility {
  camera: { x: number; y: number; z: number };
  points: { label: string; world: { x: number; y: number; z: number };
    projected: { x: number; y: number; inFront: boolean }; distanceMetres: number;
    originalOccluderHitMetres: number | null; unoccluded: boolean; insideViewport: boolean }[];
  unoccludedPoints: number;
  visiblePoints: number;
  visibleLowerPoints: number;
  boundsPixels: { width: number; height: number; area: number };
  qualifies: boolean;
}

interface CaptureCheckpoint {
  label: 'diagnostic-start' | 'approach' | 'pass' | 'departure' | 'moving-frontage' | 'stronger-frontage';
  simTimeSeconds: number;
  progressMetres: number;
  speedMetresPerSecond: number;
  nativeTimelineSeconds: number;
  movingVisibleSeconds: number;
  position: { x: number; y: number; z: number };
  opening: { x: number; y: number; inFront: boolean };
  openingVisibility: PortalVisibility;
}

/** Supplementary industrial evidence: ONE explicit QA placement 25 m upstream
 * on the exact authored street arc, then continuous production-controller
 * driving and the ordinary chase camera. This is NOT a normal-spawn ride or a
 * performance instrument. Failed attempts keep their native clip and trace. */
for (const quality of ['high', 'ultra'] as const) {
  test(`industrial chase ride from diagnostic upstream start: ${quality}`, async ({ page }) => {
    test.setTimeout(180_000);
    const began = Date.now();
    const directory = join(shots, quality);
    mkdirSync(directory, { recursive: true });
    const errors = collectErrors(page);
    const captures: CaptureCheckpoint[] = [];
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.exposeBinding('environmentIndustrialRideCapture', async ({ page: currentPage }, checkpoint: CaptureCheckpoint) => {
      if (!['diagnostic-start', 'approach', 'pass', 'departure', 'moving-frontage', 'stronger-frontage'].includes(checkpoint.label)) {
        throw new Error('Unknown industrial ridden checkpoint');
      }
      await currentPage.screenshot({ path: join(directory, `${checkpoint.label}.png`) });
      captures.push(checkpoint);
    });

    try {
      await bootAtTier(page, `level=generated&seed=${seed}`, quality, { freezeAtStart: true });
      const recordingBudgetMs = Math.max(1_000, Math.min(120_000, 165_000 - (Date.now() - began)));
      const result = await page.evaluate(async ({ requestedSeed, requestedQuality, wallLimitMs }) => {
        const game = window.game;
        const sitesPath = '/src/level/environmentSites.ts', generatorPath = '/src/level/generateRoute.ts';
        const groundPath = '/src/level/buildPlan.ts', samplerPath = '/src/simulation/planSampler.ts';
        const livingPath = '/src/app/populationWorld.ts';
        const [{ environmentSites, industrialPersonnelDoorOffset }, { generateLevel }, { fieldHeightAt },
          { PlanTerrainSampler }, { preparePopulationWorld }] = await Promise.all([
          import(sitesPath), import(generatorPath), import(groundPath), import(samplerPath), import(livingPath),
        ]);
        // 2026-10-04: generated worlds install through the living-world
        // preparation, which intentionally appends props/solids and names the
        // plan with a composition hash. The untouched source is that same
        // preparation of a freshly generated plan (same engine); the builder
        // identity is pinned through recordWorldId.
        const plan = game.levelPlan, generated: LevelPlan = generateLevel(requestedSeed).plan;
        const source: LevelPlan = preparePopulationWorld(generated).level;
        const boot = game.snapshot();
        if (boot.world.seed !== requestedSeed || boot.levelPlanId !== source.id
          || plan.recordWorldId !== `generated-r6-${requestedSeed}~living-r1`
          || boot.world.levelId !== 'generated') throw new Error('The requested generated world did not load');
        if (!boot.app.acceptsRideInput || boot.loop.running || boot.camera.mode !== 'chase'
          || boot.camera.scriptedOcclusion) throw new Error('The frozen production free-ride chase state is unavailable');
        if (boot.quality.requested !== requestedQuality || boot.quality.effective !== requestedQuality) {
          throw new Error(`Requested ${requestedQuality} is not the effective drawn tier`);
        }
        const presentation = game.renderer.presentation();
        if (presentation?.environmentDecor.industrialBays !== 1) throw new Error('The industrial exemplar is not installed');
        const site = (environmentSites(plan) as readonly IndustrialBaySite[])[0];
        if (!site) throw new Error('No protected industrial site was selected');

        const preserved = ['heightfield', 'surround', 'segments', 'props', 'solids', 'hazards', 'targets',
          'checkpoints', 'spawn', 'streetLoops', 'look', 'markings'] as const;
        const digest = (value: unknown): string => {
          const text = JSON.stringify(value) ?? '';
          let hash = 2166136261;
          for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
          return (hash >>> 0).toString(16).padStart(8, '0');
        };
        const originalJson = Object.fromEntries(preserved.map(key => [key, JSON.stringify(plan[key]) ?? '']));
        const originals = Object.fromEntries(preserved.map(key => [key, {
          sameAsGeneratedSource: JSON.stringify(plan[key]) === JSON.stringify(source[key]),
          sourceDigest: digest(source[key]), installedDigest: digest(plan[key]),
        }]));
        if (Object.values(originals).some(fact => !fact.sameAsGeneratedSource)) {
          throw new Error('The installed world changed an original plan field');
        }
        const patchJson = JSON.stringify(plan.groundSurfacePatches ?? []);
        const propIndex = plan.props!.indexOf(site.building);
        const solidIndex = plan.solids?.findIndex(body => Math.hypot(body.centre.x - site.building.position.x,
          body.centre.z - site.building.position.z) < 0.001) ?? -1;
        if (propIndex < 0 || solidIndex < 0) throw new Error('The selected bay has no original prop/solid identity');

        const ring = plan.streetLoops?.find(loop => loop.alternate.length === 0);
        if (!ring) throw new Error('The generated plan has no required authored street ring');
        type Arc = { segment: LevelPlan['segments'][number]; start: number; length: number;
          turn: number; curvature: number; reconstructedExitGapMetres: number };
        const arcs: Arc[] = [];
        let ringMetres = 0;
        function at(arc: Arc, distance: number) {
          const entry = arc.segment.entry, exit = arc.segment.exit;
          const s = Math.max(0, Math.min(arc.length, distance));
          const headingY = entry.headingY + arc.curvature * s;
          return { x: entry.position.x + (Math.abs(arc.turn) < 1e-9 ? Math.sin(entry.headingY) * s
            : (Math.cos(entry.headingY) - Math.cos(headingY)) / arc.curvature),
          y: entry.position.y + (exit.position.y - entry.position.y) * s / arc.length,
          z: entry.position.z + (Math.abs(arc.turn) < 1e-9 ? Math.cos(entry.headingY) * s
            : (Math.sin(headingY) - Math.sin(entry.headingY)) / arc.curvature), headingY };
        }
        for (const id of ring.main) {
          const segment = plan.segments.find(candidate => candidate.id === id);
          if (!segment) throw new Error(`Missing required street segment ${id}`);
          const turn = segment.exit.headingY - segment.entry.headingY;
          const chord = Math.hypot(segment.exit.position.x - segment.entry.position.x,
            segment.exit.position.z - segment.entry.position.z);
          const length = Math.abs(turn) < 1e-9 ? chord : chord * (turn / 2) / Math.sin(turn / 2);
          if (!Number.isFinite(length) || length <= 0) throw new Error(`Invalid authored arc ${id}`);
          const arc: Arc = { segment, start: ringMetres, length, turn, curvature: turn / length,
            reconstructedExitGapMetres: 0 };
          const end = at(arc, length);
          arc.reconstructedExitGapMetres = Math.hypot(end.x - segment.exit.position.x, end.z - segment.exit.position.z);
          arcs.push(arc);
          ringMetres += length;
        }

        // Locate the selector's actual nearest street point on an authored
        // gentle paved arc; a line between its sockets is not the road.
        let watched: { arc: Arc; distance: number; gap: number } | undefined;
        for (const arc of arcs) {
          if (Math.abs(arc.turn) > 0.20 || arc.reconstructedExitGapMetres > 0.03
            || !['pavement', 'brick', 'roughPavement'].includes(arc.segment.entry.surface)) continue;
          const gapAt = (distance: number) => {
            const point = at(arc, distance);
            return Math.hypot(point.x - site.street.x, point.z - site.street.z);
          };
          let low = 0, high = arc.length;
          for (let iteration = 0; iteration < 40; iteration++) {
            const first = low + (high - low) / 3, second = high - (high - low) / 3;
            if (gapAt(first) < gapAt(second)) high = second; else low = first;
          }
          const distance = (low + high) / 2, gap = gapAt(distance);
          if (!watched || gap < watched.gap) watched = { arc, distance, gap };
        }
        if (!watched || watched.gap > 0.001) throw new Error('The selected bay street point does not match an authored arc');
        const targetStation = watched.arc.start + watched.distance;
        const startStation = targetStation - 25, endStation = targetStation + 26;
        if (startStation < 0 || endStation > ringMetres) throw new Error('The diagnostic approach/departure cannot fit the authored ring');
        const selectedArcs = arcs.filter(arc => arc.start < endStation && arc.start + arc.length > startStation);
        const points: { x: number; z: number }[] = [], station: number[] = [];
        let maximumSocketGap = 0;
        for (let index = 0; index < selectedArcs.length; index++) {
          const arc = selectedArcs[index];
          if (arc.reconstructedExitGapMetres > 0.03) throw new Error(`The authored arc does not meet its exit: ${arc.segment.id}`);
          if (index > 0) {
            const previous = selectedArcs[index - 1].segment.exit, next = arc.segment.entry;
            const gap = Math.hypot(previous.position.x - next.position.x,
              previous.position.y - next.position.y, previous.position.z - next.position.z);
            maximumSocketGap = Math.max(maximumSocketGap, gap);
            if (gap > 0.03) throw new Error('The diagnostic route would bridge disconnected source sockets');
          }
          const from = Math.max(0, startStation - arc.start), through = Math.min(arc.length, endStation - arc.start);
          const count = Math.max(1, Math.ceil((through - from) / 1));
          for (let sample = 0; sample <= count; sample++) {
            const distance = from + (through - from) * sample / count;
            const point = at(arc, distance), progress = arc.start + distance - startStation;
            if (station.length > 0 && Math.abs(progress - station[station.length - 1]) < 1e-6) continue;
            points.push({ x: point.x, z: point.z });
            station.push(progress);
          }
        }
        if (points.length < 2) throw new Error('The exact industrial approach has no usable route');
        // The untouched original street must support this diagnostic approach.
        // Do not invent a chord, move a blocker or route through grass.
        const solids = [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])];
        const deepHazards = (plan.hazards ?? []).filter(hazard => hazard.kind === 'potholeDeep');
        let clearanceSamples = 0, minimumDeepHazardClearance = Infinity;
        let maximumGroundHeightError = 0;
        for (const arc of selectedArcs) {
          const from = Math.max(0, startStation - arc.start), through = Math.min(arc.length, endStation - arc.start);
          const count = Math.max(1, Math.ceil((through - from) / 0.5));
          for (let sample = 0; sample <= count; sample++) {
            const point = at(arc, from + (through - from) * sample / count);
            const ground = game.sampleGround(point.x, point.z);
            const originalHeight = fieldHeightAt(source.heightfield, source.surround, point.x, point.z);
            clearanceSamples++;
            maximumGroundHeightError = Math.max(maximumGroundHeightError, Math.abs(ground.height - originalHeight));
            if (ground.offCourse || !['pavement', 'brick', 'roughPavement'].includes(ground.surface)
              || Math.abs(ground.height - originalHeight) > 1e-7) {
              throw new Error(`The original street is not clear paved ground: ${arc.segment.id}, s=${from + (through - from) * sample / count}`);
            }
            for (const solid of solids) {
              if (solid.centre.y + solid.halfExtents.y <= originalHeight + 0.25) continue;
              const dx = point.x - solid.centre.x, dz = point.z - solid.centre.z;
              const c = Math.cos(solid.rotationY), s = Math.sin(solid.rotationY);
              if (Math.abs(c * dx - s * dz) < solid.halfExtents.x + 0.6
                && Math.abs(s * dx + c * dz) < solid.halfExtents.z + 0.6) {
                throw new Error(`An original solid blocks the industrial street: ${arc.segment.id}`);
              }
            }
            for (const hazard of deepHazards) {
              const clearance = Math.hypot(point.x - hazard.centre.x, point.z - hazard.centre.z) - hazard.radius;
              minimumDeepHazardClearance = Math.min(minimumDeepHazardClearance, clearance);
              if (clearance < 0.9) throw new Error(`An original deep pothole blocks the industrial street: ${hazard.id}`);
            }
          }
        }
        const totalMetres = endStation - startStation;
        const startArc = selectedArcs[0], start = at(startArc, startStation - startArc.start);
        const ground = game.sampleGround(start.x, start.z);
        if (ground.offCourse || !['pavement', 'brick', 'roughPavement'].includes(ground.surface)) {
          throw new Error('The upstream diagnostic start is outside the original paved corridor');
        }
        game.clearActions();
        // The only placement in this test. It establishes a labelled diagnostic
        // start; it is neither normal-spawn evidence nor a mid-ride rescue.
        game.placeRider({ x: start.x, y: ground.height, z: start.z }, start.headingY);
        game.advance(0);
        const initial = game.snapshot();
        const startGap = Math.hypot(initial.euc.position.x - start.x, initial.euc.position.z - start.z);
        if (startGap > 0.01 || Math.abs(initial.euc.headingY - start.headingY) > 0.01) {
          throw new Error('The diagnostic placement did not reach the exact upstream street station');
        }
        const target = { id: site.id, buildingPropIndex: propIndex, sourceSolidIndex: solidIndex,
          building: site.building, originalBody: plan.solids![solidIndex], position: site.position,
          yaw: site.yaw, street: site.street, roomWidth: site.roomWidth, roomDepth: site.roomDepth,
          faceWidth: site.faceWidth, height: site.height, sourceStreetSegmentId: watched.arc.segment.id,
          sourceStreetStationMetres: watched.distance, sourceStreetGapMetres: watched.gap,
          progressMetres: targetStation - startStation };
        const captureStations = [{ label: 'approach' as const, at: 3 },
          { label: 'pass' as const, at: target.progressMetres },
          { label: 'departure' as const, at: target.progressMetres + 22 }];
        const captured = new Set<string>();
        const originalPlaceRider = game.placeRider;
        let teleportCalls = 0;
        const dt = game.loop.stepSeconds, stride = 6, maximumSteps = Math.floor(60 / dt);
        const movingFrontagePredicate = { minimumSpeedMetresPerSecond: 4, minimumProgressMetres: 2,
          maximumNormalizedProjection: 0.8, minimumContinuousSeconds: 1.5, beforePass: true,
          minimumVisiblePortalPoints: 3, totalPortalPoints: 4, minimumVisibleLowerPoints: 1,
          maximumPortalNormalizedProjection: 0.95, minimumWidthPixels: 90, minimumHeightPixels: 28,
          minimumAreaPixels: 3_000, frontPlaneOffsetMetres: 0.04, rayEndpointMarginMetres: 0.02 };
        const serviceSpeedPolicy = { targetMetresPerSecond: 4.8, throttleFeedforward: 0.2,
          throttleGainPerMetrePerSecond: 0.7, minimumThrottle: -0.35, maximumThrottle: 1 };
        type MovingInterval = { firstTraceIndex: number; lastTraceIndex: number;
          startSimTimeSeconds: number; endSimTimeSeconds: number; durationSeconds: number;
          startNativeTimelineSeconds: number; endNativeTimelineSeconds: number;
          startProgressMetres: number; endProgressMetres: number; minimumSpeedMetresPerSecond: number;
          minimumVisiblePortalPoints: number; minimumWidthPixels: number; minimumHeightPixels: number;
          minimumAreaPixels: number };
        const movingFrontageIntervals: MovingInterval[] = [];
        let movingInterval: MovingInterval | null = null;
        let firstMovingCaptureArea = 0, firstMovingCaptureSeconds = Infinity;
        let recordedAtMs = 0;
        const trace: { steps: number; tick: number; simTimeSeconds: number;
          position: { x: number; y: number; z: number }; headingY: number; speed: number;
          distanceTravelled: number; progressMetres: number; routeGapMetres: number;
          target: { x: number; z: number }; headingError: number; throttle: number; steer: number;
          blocked: boolean; offCourse: boolean; grounded: boolean; crashes: number;
          cameraMode: string; scriptedOcclusion: boolean; armDistance: number;
          lifeClockSeconds: number | null; sharedClockErrorSeconds: number;
          drawCalls: number; triangles: number; quality: string;
          nativeTimelineSeconds: number; movingFrontageVisible: boolean; movingVisibleSeconds: number;
          opening: { x: number; y: number; inFront: boolean }; openingVisibility: PortalVisibility }[] = [];
        let progress = 0, cursor = 0, steps = 0, lastProgressSteps = 0, lastMeaningfulProgress = 0;
        let blockedSteps = 0, offCourseSteps = 0, greatestDisplacement = 0, greatestClockError = 0;
        let previous = initial, end = initial, outcome = 'not-started';
        let recorderError = '', recorderStopped = false, raf = 0, wallTimer = 0;
        let videoBase64 = '';
        const canvas = document.querySelector('canvas');
        if (!canvas || typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
          throw new Error('Native canvas recording is unavailable');
        }
        const openingProjection = () => window.qa.projectPoint(site.position.x, site.position.y + 2, site.position.z);
        // The original host remains a closed physics/shadow proxy. Sample just
        // OUTSIDE its actual front plane; rays to inset contents would hit that
        // proxy even when the rendered colour opening is visible. Keep every
        // original solid, including the host and the climb retaining walls.
        // This proves portal exposure; the saved pixels must prove its contents.
        const originalVisibilitySampler = new PlanTerrainSampler(source);
        const doorOffset = industrialPersonnelDoorOffset(site);
        const portalPoints = [
          { label: 'lower-left', x: -site.roomWidth / 2 + 0.55, y: 0.65 },
          { label: 'lower-right', x: doorOffset - 1.15, y: 0.65 },
          { label: 'upper-left', x: -site.roomWidth / 2 + 0.55, y: 2.55 },
          { label: 'upper-right', x: doorOffset - 1.15, y: 2.55 },
        ].map(point => ({ label: point.label, world: {
          x: site.position.x + Math.cos(site.yaw) * point.x
            + Math.sin(site.yaw) * movingFrontagePredicate.frontPlaneOffsetMetres,
          y: site.position.y + point.y,
          z: site.position.z - Math.sin(site.yaw) * point.x
            + Math.cos(site.yaw) * movingFrontagePredicate.frontPlaneOffsetMetres,
        } }));
        const portalVisibility = (): PortalVisibility => {
          const camera = game.renderer.camera;
          camera.updateMatrixWorld();
          const matrix = camera.matrixWorld.elements;
          const origin = { x: matrix[12], y: matrix[13], z: matrix[14] };
          const checks = portalPoints.map(point => {
            const direction = { x: point.world.x - origin.x, y: point.world.y - origin.y,
              z: point.world.z - origin.z };
            const distance = Math.hypot(direction.x, direction.y, direction.z);
            const hit = originalVisibilitySampler.raycast(origin, direction,
              distance - movingFrontagePredicate.rayEndpointMarginMetres);
            const projected = window.qa.projectPoint(point.world.x, point.world.y, point.world.z);
            const insideViewport = projected.inFront && Number.isFinite(projected.x) && Number.isFinite(projected.y)
              && Math.abs(projected.x) <= movingFrontagePredicate.maximumPortalNormalizedProjection
              && Math.abs(projected.y) <= movingFrontagePredicate.maximumPortalNormalizedProjection;
            return { ...point, projected, distanceMetres: distance, originalOccluderHitMetres: hit,
              unoccluded: distance > movingFrontagePredicate.rayEndpointMarginMetres && hit === null, insideViewport };
          });
          const visible = checks.filter(point => point.unoccluded && point.insideViewport);
          const rect = canvas.getBoundingClientRect();
          const width = visible.length < 2 ? 0 : (Math.max(...visible.map(point => point.projected.x))
            - Math.min(...visible.map(point => point.projected.x))) * rect.width / 2;
          const height = visible.length < 2 ? 0 : (Math.max(...visible.map(point => point.projected.y))
            - Math.min(...visible.map(point => point.projected.y))) * rect.height / 2;
          const lower = visible.filter(point => point.label.startsWith('lower')).length;
          return { camera: origin, points: checks, unoccludedPoints: checks.filter(point => point.unoccluded).length,
            visiblePoints: visible.length, visibleLowerPoints: lower, boundsPixels: { width, height, area: width * height },
            qualifies: visible.length >= movingFrontagePredicate.minimumVisiblePortalPoints
              && lower >= movingFrontagePredicate.minimumVisibleLowerPoints
              && width >= movingFrontagePredicate.minimumWidthPixels
              && height >= movingFrontagePredicate.minimumHeightPixels
              && width * height >= movingFrontagePredicate.minimumAreaPixels };
        };
        const capture = async (label: CaptureCheckpoint['label']) => {
          await (window as unknown as { environmentIndustrialRideCapture(checkpoint: CaptureCheckpoint): Promise<void> })
            .environmentIndustrialRideCapture({ label, simTimeSeconds: end.simTimeSeconds,
              progressMetres: progress, speedMetresPerSecond: end.euc.speed,
              nativeTimelineSeconds: Math.max(0, (performance.now() - recordedAtMs) / 1000),
              movingVisibleSeconds: movingInterval?.durationSeconds ?? 0,
              position: { ...end.euc.position }, opening: openingProjection(), openingVisibility: portalVisibility() });
          captured.add(label);
        };
        function projection(x: number, z: number, from: number, through: number) {
          let best = { station: 0, gap: Infinity, segment: from };
          for (let index = from; index <= through; index++) {
            const a = points[index], b = points[index + 1], dx = b.x - a.x, dz = b.z - a.z;
            const length2 = dx * dx + dz * dz;
            const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2));
            const gap = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
            if (gap < best.gap) best = { station: station[index] + t * (station[index + 1] - station[index]), gap, segment: index };
          }
          return best;
        }
        function pointAt(distance: number) {
          let index = cursor;
          while (index < points.length - 2 && station[index + 1] < distance) index++;
          const t = Math.max(0, Math.min(1, (distance - station[index]) / (station[index + 1] - station[index])));
          return { x: points[index].x + t * (points[index + 1].x - points[index].x),
            z: points[index].z + t * (points[index + 1].z - points[index].z) };
        }

        // Negative controls prove that the reusable source sampler still sees
        // the selected closed host and original terrain. Neither is removed to
        // make a view pass; the portal endpoints alone sit outside the host.
        const initialVisibility = portalVisibility(), originalBody = plan.solids![solidIndex];
        const hostDirection = { x: originalBody.centre.x - initialVisibility.camera.x,
          y: originalBody.centre.y - initialVisibility.camera.y, z: originalBody.centre.z - initialVisibility.camera.z };
        const hostDistance = Math.hypot(hostDirection.x, hostDirection.y, hostDirection.z);
        const occlusionControls = {
          originalHostHitMetres: originalVisibilitySampler.raycast(initialVisibility.camera, hostDirection, hostDistance),
          originalHostCentreDistanceMetres: hostDistance,
          originalTerrainHitMetres: originalVisibilitySampler.raycast(
            { x: start.x, y: ground.height + 0.5, z: start.z }, { x: 0, y: -1, z: 0 }, 1),
        };
        const stream = canvas.captureStream();
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
        let recorder: MediaRecorder;
        try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 }); }
        catch (error) { for (const track of stream.getTracks()) track.stop(); throw error; }
        const chunks: Blob[] = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { recorderError = 'Native canvas recording failed'; };
        const stopped = new Promise<void>(resolve => { recorder.onstop = () => { recorderStopped = true; resolve(); }; });
        game.placeRider = () => {
          teleportCalls++;
          throw new Error('Placement is forbidden after the single labelled diagnostic start');
        };
        try {
          recordedAtMs = performance.now();
          recorder.start(1_000);
          await capture('diagnostic-start');
          await new Promise<void>(resolve => {
            let done = false, notBefore = performance.now() + stride * dt * 1000;
            const finish = (reason: string) => {
              if (done) return;
              done = true; outcome = reason;
              cancelAnimationFrame(raf); window.clearTimeout(wallTimer); resolve();
            };
            wallTimer = window.setTimeout(() => finish('recording-wall-limit'), wallLimitMs);
            const draw = async (now: number): Promise<void> => {
              if (done) return;
              if (now < notBefore) { raf = requestAnimationFrame(draw); return; }
              try {
                if (recorderError) { finish('recorder-error'); return; }
                const before = game.snapshot(), euc = before.euc;
                const nearest = projection(euc.position.x, euc.position.z,
                  Math.max(0, cursor - 2), Math.min(points.length - 2, cursor + 16));
                progress = Math.max(progress, nearest.station);
                while (cursor < points.length - 2 && station[cursor + 1] <= progress) cursor++;
                const aim = pointAt(Math.min(totalMetres, progress + Math.max(7, Math.min(10, 7 + Math.abs(euc.speed) * 0.25))));
                let error = Math.atan2(aim.x - euc.position.x, aim.z - euc.position.z) - euc.headingY;
                while (error > Math.PI) error -= Math.PI * 2;
                while (error < -Math.PI) error += Math.PI * 2;
                const steer = Math.max(-1, Math.min(1, -error * 1.8));
                // Signed production throttle: feedback approaches a service
                // speed gently and ordinary braking opposes any overshoot.
                const throttle = Math.max(serviceSpeedPolicy.minimumThrottle, Math.min(serviceSpeedPolicy.maximumThrottle,
                  serviceSpeedPolicy.throttleFeedforward + serviceSpeedPolicy.throttleGainPerMetrePerSecond
                    * (serviceSpeedPolicy.targetMetresPerSecond - euc.speed)));
                game.setActions({ throttle, steer });
                const batch = Math.min(stride, maximumSteps - steps);
                game.advance(batch); steps += batch; end = game.snapshot();
                const after = end.euc;
                const ridden = projection(after.position.x, after.position.z,
                  Math.max(0, cursor - 2), Math.min(points.length - 2, cursor + 16));
                progress = Math.max(progress, ridden.station);
                while (cursor < points.length - 2 && station[cursor + 1] <= progress) cursor++;
                if (progress > lastMeaningfulProgress + 0.25) { lastMeaningfulProgress = progress; lastProgressSteps = steps; }
                blockedSteps = after.blocked ? blockedSteps + batch : 0;
                offCourseSteps = after.offCourse ? offCourseSteps + batch : 0;
                const displacement = Math.hypot(after.position.x - previous.euc.position.x, after.position.z - previous.euc.position.z);
                greatestDisplacement = Math.max(greatestDisplacement, displacement);
                const life = game.renderer.presentation()?.streetLife;
                const clockError = Math.max(Math.abs(end.simTimeSeconds - initial.simTimeSeconds - steps * dt),
                  life ? Math.abs(life.clockSeconds - end.simTimeSeconds) : Infinity);
                greatestClockError = Math.max(greatestClockError, clockError);
                const opening = openingProjection();
                const openingVisibility = portalVisibility();
                const nativeTimelineSeconds = (performance.now() - recordedAtMs) / 1000;
                const movingFrontageVisible = after.speed >= movingFrontagePredicate.minimumSpeedMetresPerSecond
                  && progress >= movingFrontagePredicate.minimumProgressMetres && progress < target.progressMetres
                  && opening.inFront && Math.abs(opening.x) <= movingFrontagePredicate.maximumNormalizedProjection
                  && Math.abs(opening.y) <= movingFrontagePredicate.maximumNormalizedProjection
                  && openingVisibility.qualifies;
                if (movingFrontageVisible) {
                  if (!movingInterval) {
                    movingInterval = { firstTraceIndex: trace.length, lastTraceIndex: trace.length,
                      startSimTimeSeconds: end.simTimeSeconds, endSimTimeSeconds: end.simTimeSeconds,
                      durationSeconds: 0, startNativeTimelineSeconds: nativeTimelineSeconds,
                      endNativeTimelineSeconds: nativeTimelineSeconds, startProgressMetres: progress,
                      endProgressMetres: progress, minimumSpeedMetresPerSecond: after.speed,
                      minimumVisiblePortalPoints: openingVisibility.visiblePoints,
                      minimumWidthPixels: openingVisibility.boundsPixels.width,
                      minimumHeightPixels: openingVisibility.boundsPixels.height,
                      minimumAreaPixels: openingVisibility.boundsPixels.area };
                    movingFrontageIntervals.push(movingInterval);
                  }
                  movingInterval.lastTraceIndex = trace.length;
                  movingInterval.endSimTimeSeconds = end.simTimeSeconds;
                  movingInterval.durationSeconds = end.simTimeSeconds - movingInterval.startSimTimeSeconds;
                  movingInterval.endNativeTimelineSeconds = nativeTimelineSeconds;
                  movingInterval.endProgressMetres = progress;
                  movingInterval.minimumSpeedMetresPerSecond = Math.min(movingInterval.minimumSpeedMetresPerSecond, after.speed);
                  movingInterval.minimumVisiblePortalPoints = Math.min(movingInterval.minimumVisiblePortalPoints, openingVisibility.visiblePoints);
                  movingInterval.minimumWidthPixels = Math.min(movingInterval.minimumWidthPixels, openingVisibility.boundsPixels.width);
                  movingInterval.minimumHeightPixels = Math.min(movingInterval.minimumHeightPixels, openingVisibility.boundsPixels.height);
                  movingInterval.minimumAreaPixels = Math.min(movingInterval.minimumAreaPixels, openingVisibility.boundsPixels.area);
                } else movingInterval = null;
                trace.push({ steps, tick: end.tick, simTimeSeconds: end.simTimeSeconds,
                  position: { ...after.position }, headingY: after.headingY, speed: after.speed,
                  distanceTravelled: after.distanceTravelled, progressMetres: progress, routeGapMetres: ridden.gap,
                  target: aim, headingError: error, throttle, steer, blocked: after.blocked, offCourse: after.offCourse,
                  grounded: after.grounded, crashes: after.crashes, cameraMode: end.camera.mode,
                  scriptedOcclusion: end.camera.scriptedOcclusion, armDistance: end.camera.armDistance,
                  lifeClockSeconds: life?.clockSeconds ?? null, sharedClockErrorSeconds: clockError,
                  drawCalls: end.render.drawCalls, triangles: end.render.triangles, quality: end.quality.effective,
                  nativeTimelineSeconds, movingFrontageVisible, movingVisibleSeconds: movingInterval?.durationSeconds ?? 0,
                  opening, openingVisibility });
                if (after.crashes > initial.euc.crashes) { finish('controller-crash'); return; }
                if (displacement > Math.max(1.2, Math.abs(previous.euc.speed) * batch * dt * 1.8 + 0.25)) {
                  finish('position-discontinuity'); return;
                }
                if (clockError > 1e-7 || end.tick !== initial.tick + steps) { finish('shared-clock-discontinuity'); return; }
                if (end.camera.mode !== 'chase' || end.camera.scriptedOcclusion) { finish('camera-state-changed'); return; }
                if (end.quality.effective !== requestedQuality) { finish('effective-tier-changed'); return; }
                if (blockedSteps * dt > 2) { finish('controller-blocked'); return; }
                if (offCourseSteps * dt > 2) { finish('left-authored-route'); return; }
                if ((steps - lastProgressSteps) * dt > 8) { finish('route-progress-stalled'); return; }
                if (ridden.gap > 3) { finish('route-deviation'); return; }
                if ((end.consumed.reset ?? 0) !== (initial.consumed.reset ?? 0)) { finish('unexpected-reset'); return; }
                previous = end;

                // A stationary initial glimpse cannot satisfy moving evidence.
                // Require a sustained interval of actual controller motion in
                // the ordinary chase view before saving its labelled screenshot.
                if (!captured.has('moving-frontage') && movingInterval
                  && movingInterval.durationSeconds + 1e-9 >= movingFrontagePredicate.minimumContinuousSeconds) {
                  firstMovingCaptureArea = openingVisibility.boundsPixels.area;
                  firstMovingCaptureSeconds = end.simTimeSeconds;
                  await capture('moving-frontage'); if (done) return;
                }
                // At most one additional later shot, only when the same honest
                // moving visibility gate holds and the exposed portal is larger.
                if (captured.has('moving-frontage') && !captured.has('stronger-frontage') && movingInterval
                  && movingInterval.durationSeconds + 1e-9 >= movingFrontagePredicate.minimumContinuousSeconds
                  && end.simTimeSeconds >= firstMovingCaptureSeconds + 0.4
                  && openingVisibility.boundsPixels.area >= firstMovingCaptureArea * 1.12) {
                  await capture('stronger-frontage'); if (done) return;
                }
                for (const checkpoint of captureStations) {
                  if (progress < checkpoint.at || captured.has(checkpoint.label)) continue;
                  await capture(checkpoint.label); if (done) return;
                }
                const last = points[points.length - 1];
                if (progress >= totalMetres - 1
                  && Math.hypot(last.x - after.position.x, last.z - after.position.z) < 2) {
                  finish('finished'); return;
                }
                if (steps >= maximumSteps) { finish('simulation-limit'); return; }
                // One batch per paced RAF, with a full simulated duration
                // after all work. Slow rendering/screenshots never cause catchup.
                notBefore = performance.now() + batch * dt * 1000;
                raf = requestAnimationFrame(draw);
              } catch (error) { finish(`driver-error: ${error instanceof Error ? error.message : String(error)}`); }
            };
            raf = requestAnimationFrame(draw);
          });
        } finally {
          cancelAnimationFrame(raf); window.clearTimeout(wallTimer);
          game.clearActions(); game.placeRider = originalPlaceRider;
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
            reader.onerror = () => { recorderError = 'Reading the completed native clip failed'; resolve(''); };
            reader.readAsDataURL(new Blob(chunks, { type: mimeType }));
          });
        }
        const finalPresentation = game.renderer.presentation();
        const originalPlanPreservation = Object.fromEntries(preserved.map(key => [key, { ...originals[key],
          unchangedDuringRide: (JSON.stringify(plan[key]) ?? '') === originalJson[key], finalDigest: digest(plan[key]) }]));
        return { seed: requestedSeed, requestedQuality, outcome,
          scope: 'Single upstream QA diagnostic placement, followed by continuous production-controller/chase driving; NOT normal spawn',
          target, routeMetres: totalMetres, targetRingStationMetres: targetStation,
          startRingStationMetres: startStation, endRingStationMetres: endStation, maximumSocketGapMetres: maximumSocketGap,
          routeArcs: selectedArcs.map(arc => ({ id: arc.segment.id, entry: arc.segment.entry, exit: arc.segment.exit,
            lengthMetres: arc.length, curvature: arc.curvature, reconstructedExitGapMetres: arc.reconstructedExitGapMetres,
            sampledFromMetres: Math.max(0, startStation - arc.start), sampledThroughMetres: Math.min(arc.length, endStation - arc.start) })),
          routePoints: points, routeStationsMetres: station, originalPlanPreservation,
          surfacePatchesUnchangedDuringRide: JSON.stringify(plan.groundSurfacePatches ?? []) === patchJson,
          sourceCounts: { props: source.props?.length ?? 0, solids: source.solids?.length ?? 0, hazards: source.hazards?.length ?? 0 },
          diagnosticStart: { label: 'QA placement on exact original street arc; NOT normal spawn', placementCalls: 1,
            upstreamMetres: 25, startGapMetres: startGap, ground, sourceSpawn: plan.spawn,
            distanceFromNormalSpawnMetres: Math.hypot(start.x - plan.spawn.position.x, start.z - plan.spawn.position.z) },
          routeClearance: { samples: clearanceSamples, spacingMetres: 0.5, expandedSolidMarginMetres: 0.6,
            maximumGroundHeightErrorMetres: maximumGroundHeightError,
            minimumDeepHazardClearanceMetres: deepHazards.length > 0 ? minimumDeepHazardClearance : null },
          movingFrontage: { predicate: movingFrontagePredicate, serviceSpeedPolicy, portalPoints, occlusionControls,
            visibilityMethod: 'Four representative portal corners 0.04 m OUTSIDE the original facade plane, cast from the actual production camera using PlanTerrainSampler of the untouched generated source. All original occluding solids, including the closed host proxy and retaining walls, plus original terrain remain included. Rays prove exposure of the opening; contents remain a pixel-review gate.',
            intervals: movingFrontageIntervals,
            qualifiedIntervals: movingFrontageIntervals.filter(interval => interval.durationSeconds + 1e-9
              >= movingFrontagePredicate.minimumContinuousSeconds),
            centreOnlyFalsePositiveSamples: trace.filter(sample => sample.speed >= movingFrontagePredicate.minimumSpeedMetresPerSecond
              && sample.progressMetres >= movingFrontagePredicate.minimumProgressMetres && sample.progressMetres < target.progressMetres
              && sample.opening.inFront && Math.abs(sample.opening.x) <= movingFrontagePredicate.maximumNormalizedProjection
              && Math.abs(sample.opening.y) <= movingFrontagePredicate.maximumNormalizedProjection
              && !sample.openingVisibility.qualifies).length,
            laterCapture: 'At most one stronger-frontage shot: at least 0.4 simulated seconds after the first moving shot, still in a qualifying 1.5 s interval, and with at least 12% more exposed portal pixel area. Omitted when no later improvement qualifies.',
            playbackClock: 'Native timeline seconds are wall time since MediaRecorder.start, including paused screenshots; encoded first-frame origin can add a small scheduling offset. Use this range rather than simulated seconds to locate the native clip.' },
          initial: { tick: initial.tick, simTimeSeconds: initial.simTimeSeconds, position: initial.euc.position,
            headingY: initial.euc.headingY, speed: initial.euc.speed, crashes: initial.euc.crashes,
            distanceTravelled: initial.euc.distanceTravelled, quality: initial.quality },
          end: { tick: end.tick, simTimeSeconds: end.simTimeSeconds, position: end.euc.position,
            headingY: end.euc.headingY, speed: end.euc.speed, crashes: end.euc.crashes,
            distanceTravelled: end.euc.distanceTravelled, camera: end.camera, quality: end.quality },
          steps, stepSeconds: dt, batchSteps: stride, simulationSeconds: steps * dt, maximumSimulationSeconds: 60,
          progressMetres: progress, controllerDistanceMetres: end.euc.distanceTravelled - initial.euc.distanceTravelled,
          teleportCallsAfterDiagnosticStart: teleportCalls, resetDelta: (end.consumed.reset ?? 0) - (initial.consumed.reset ?? 0),
          crashDelta: end.euc.crashes - initial.euc.crashes, greatestDisplacementMetres: greatestDisplacement,
          greatestClockErrorSeconds: greatestClockError, captured: [...captured],
          decor: finalPresentation?.environmentDecor, renderCost: finalPresentation?.cost,
          ultraGlErrors: finalPresentation?.ultra?.glErrors ?? [], resources: end.resources,
          recorder: { mimeType, error: recorderError, stopped: recorderStopped, pacing: 'At most one production step batch per RAF, at or below simulated real time' },
          videoBase64, trace };
      }, { requestedSeed: seed, requestedQuality: quality, wallLimitMs: recordingBudgetMs });

      const { videoBase64, trace, ...report } = result;
      writeFileSync(join(directory, 'trace.json'), JSON.stringify(trace, null, 2) + '\n');
      writeFileSync(join(directory, 'report.json'), JSON.stringify({ ...report, captures, errors,
        evidence: 'Diagnostic upstream start; production controller and chase camera; native canvas recording; hardware performance and listening unverified' }, null, 2) + '\n');
      if (videoBase64) writeFileSync(join(directory, 'diagnostic-industrial-ride.webm'), Buffer.from(videoBase64, 'base64'));
      await page.screenshot({ path: join(directory, 'final.png') });

      // Artifacts precede assertions: a failed ride is evidence, never rescued.
      expect(result.outcome, JSON.stringify(report)).toBe('finished');
      expect(result.diagnosticStart.placementCalls).toBe(1);
      expect(result.diagnosticStart.upstreamMetres).toBe(25);
      expect(result.diagnosticStart.startGapMetres).toBeLessThanOrEqual(0.01);
      expect(result.teleportCallsAfterDiagnosticStart).toBe(0);
      expect(result.resetDelta).toBe(0);
      expect(result.crashDelta).toBe(0);
      expect(result.simulationSeconds).toBeLessThanOrEqual(60);
      expect(result.maximumSocketGapMetres).toBeLessThanOrEqual(0.03);
      expect(result.target.sourceStreetGapMetres).toBeLessThanOrEqual(0.001);
      expect(result.routeClearance.samples).toBeGreaterThan(100);
      expect(result.routeClearance.maximumGroundHeightErrorMetres).toBeLessThanOrEqual(1e-7);
      if (result.routeClearance.minimumDeepHazardClearanceMetres !== null) {
        expect(result.routeClearance.minimumDeepHazardClearanceMetres).toBeGreaterThanOrEqual(0.9);
      }
      expect(result.progressMetres).toBeGreaterThanOrEqual(result.routeMetres - 1);
      expect(result.controllerDistanceMetres).toBeGreaterThan(result.routeMetres * 0.9);
      expect(result.greatestClockErrorSeconds).toBeLessThan(1e-7);
      expect(result.captured.filter(label => !['moving-frontage', 'stronger-frontage'].includes(label)))
        .toEqual(['diagnostic-start', 'approach', 'pass', 'departure']);
      expect(result.captured).toContain('moving-frontage');
      expect(result.movingFrontage.qualifiedIntervals.length).toBeGreaterThan(0);
      expect(result.movingFrontage.occlusionControls.originalHostHitMetres).not.toBeNull();
      expect(result.movingFrontage.occlusionControls.originalHostHitMetres!)
        .toBeLessThan(result.movingFrontage.occlusionControls.originalHostCentreDistanceMetres);
      expect(result.movingFrontage.occlusionControls.originalTerrainHitMetres).not.toBeNull();
      expect(result.movingFrontage.occlusionControls.originalTerrainHitMetres!).toBeGreaterThan(0.45);
      expect(result.movingFrontage.occlusionControls.originalTerrainHitMetres!).toBeLessThan(0.55);
      const visible = captures.find(checkpoint => checkpoint.label === 'moving-frontage');
      expect(visible?.opening.inFront).toBe(true);
      expect(Math.abs(visible!.opening.x)).toBeLessThanOrEqual(0.8);
      expect(Math.abs(visible!.opening.y)).toBeLessThanOrEqual(0.8);
      expect(visible!.progressMetres).toBeLessThan(result.target.progressMetres);
      expect(visible!.speedMetresPerSecond).toBeGreaterThanOrEqual(4);
      expect(visible!.progressMetres).toBeGreaterThanOrEqual(2);
      expect(visible!.movingVisibleSeconds + 1e-9).toBeGreaterThanOrEqual(1.5);
      expect(visible!.nativeTimelineSeconds).toBeGreaterThan(0);
      for (const checkpoint of captures.filter(checkpoint => ['moving-frontage', 'stronger-frontage'].includes(checkpoint.label))) {
        expect(checkpoint.openingVisibility.qualifies).toBe(true);
        expect(checkpoint.openingVisibility.visiblePoints).toBeGreaterThanOrEqual(3);
        expect(checkpoint.openingVisibility.visibleLowerPoints).toBeGreaterThanOrEqual(1);
        expect(checkpoint.openingVisibility.boundsPixels.width).toBeGreaterThanOrEqual(90);
        expect(checkpoint.openingVisibility.boundsPixels.height).toBeGreaterThanOrEqual(28);
        expect(checkpoint.openingVisibility.boundsPixels.area).toBeGreaterThanOrEqual(3_000);
        expect(checkpoint.openingVisibility.points.filter(point => point.unoccluded && point.insideViewport)
          .every(point => point.originalOccluderHitMetres === null && point.projected.inFront)).toBe(true);
        expect(checkpoint.speedMetresPerSecond).toBeGreaterThanOrEqual(4);
        expect(checkpoint.progressMetres).toBeGreaterThanOrEqual(2);
        expect(checkpoint.progressMetres).toBeLessThan(result.target.progressMetres);
        expect(checkpoint.movingVisibleSeconds + 1e-9).toBeGreaterThanOrEqual(1.5);
      }
      const stronger = captures.find(checkpoint => checkpoint.label === 'stronger-frontage');
      if (stronger) {
        expect(stronger.simTimeSeconds).toBeGreaterThanOrEqual(visible!.simTimeSeconds + 0.4);
        expect(stronger.openingVisibility.boundsPixels.area).toBeGreaterThanOrEqual(visible!.openingVisibility.boundsPixels.area * 1.12);
      }
      for (const interval of result.movingFrontage.qualifiedIntervals) {
        const samples = trace.slice(interval.firstTraceIndex, interval.lastTraceIndex + 1);
        expect(samples.every(sample => sample.movingFrontageVisible && sample.speed >= 4
          && sample.progressMetres >= 2 && sample.progressMetres < result.target.progressMetres
          && sample.openingVisibility.qualifies && sample.openingVisibility.visiblePoints >= 3
          && sample.openingVisibility.visibleLowerPoints >= 1)).toBe(true);
        expect(interval.durationSeconds + 1e-9).toBeGreaterThanOrEqual(1.5);
        expect(interval.minimumVisiblePortalPoints).toBeGreaterThanOrEqual(3);
        expect(interval.minimumWidthPixels).toBeGreaterThanOrEqual(90);
        expect(interval.minimumHeightPixels).toBeGreaterThanOrEqual(28);
        expect(interval.minimumAreaPixels).toBeGreaterThanOrEqual(3_000);
        expect(interval.endProgressMetres - interval.startProgressMetres).toBeGreaterThanOrEqual(5);
        expect(interval.endNativeTimelineSeconds).toBeGreaterThan(interval.startNativeTimelineSeconds);
      }
      for (const [key, fact] of Object.entries(result.originalPlanPreservation)) {
        expect(fact.sameAsGeneratedSource, `original ${key}`).toBe(true);
        expect(fact.unchangedDuringRide, `ridden ${key}`).toBe(true);
      }
      expect(result.surfacePatchesUnchangedDuringRide).toBe(true);
      expect(result.initial.quality.effective).toBe(quality);
      expect(result.end.quality.effective).toBe(quality);
      expect(result.decor?.industrialBays).toBe(1);
      expect(result.ultraGlErrors).toEqual([]);
      expect(result.recorder.error).toBe('');
      expect(result.recorder.stopped).toBe(true);
      expect(videoBase64.length).toBeGreaterThan(1000);
      expect(trace.length).toBeGreaterThan(100);
      expect(trace.every(sample => sample.cameraMode === 'chase' && !sample.scriptedOcclusion && sample.quality === quality)).toBe(true);
      expect(trace.some(sample => sample.speed > 4)).toBe(true);
      expect(trace.every((sample, index) => index === 0 || sample.progressMetres >= trace[index - 1].progressMetres)).toBe(true);
      expect(errors).toEqual([]);
    } catch (error) {
      writeFileSync(join(directory, 'failure.json'), JSON.stringify({ seed, quality,
        scope: 'Single upstream diagnostic placement; NOT normal spawn',
        error: error instanceof Error ? error.message : String(error), captures, errors }, null, 2) + '\n');
      await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => undefined);
      throw error;
    }
  });
}
