/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import type { IndustrialBaySite } from '../src/level/environmentSites.ts';
import type { LevelPlan } from '../src/level/plan.ts';
import type { StreetFront } from '../src/level/streetFronts.ts';
import type { ProtectedActivityPose } from '../src/render/protectedActivity.ts';
import { bootAtTier, collectErrors } from './harness.ts';

const shots = process.env.ENVIRONMENT_ACTIVITY_SHOTS ?? 'test-results/environment-upgrade/activity-r1';
const PARTS = 12, EPSILON = 2e-4;
type Subject = 'coffee' | 'industrial';
type View = 'close' | 'principal' | 'oblique';
type Point = { x: number; y: number; z: number };
type Projection = { x: number; y: number; inFront: boolean };
interface Preservation {
  seed: string; world: string; sourceWorld: string; recordWorld: string | undefined; generatedWorld: string;
  originals: Record<string, { same: boolean; unchangedSinceBoot: boolean; sourceDigest: string; installedDigest: string }>;
  coffee: { buildingPropIndex: number; sourceBuildingSame: boolean; streetFacingDot: number; position: Point; yaw: number; width: number };
  industrial: { id: string; buildingPropIndex: number; sourceBuildingSame: boolean; streetFacingDot: number; position: Point; yaw: number };
}
interface ActivityFrame {
  tick: number; seconds: number; lifeClockSeconds: number; views: number; reduced: boolean;
  dpr: number; camera: { mode: string; scriptedOcclusion: boolean };
  rider: { position: Point; speed: number; crashes: number; state: string }; resetCount: number;
  owners: { pilotUuid: string; industrialUuid: string; bodiesUuid: string; headsUuid: string; fanUuid: string;
    pilotGroups: number; industrialGroups: number; bodyMeshes: number; headMeshes: number; fans: number;
    bodyInstances: number; headInstances: number; decorMeshes: number; materials: number; geometries: number;
    mappedMeshes: number; textures: number; casters: number; transparentMeshes: number; fanCaster: boolean; fanReceiver: boolean };
  worker: { matrices: number[][]; headMatrix: number[]; allBodyDigest: string; allHeadDigest: string;
    expected: ProtectedActivityPose; center: Point; yaw: number; centerError: number; yawError: number;
    pivotYawError: number; pivotPitchError: number; armEnvelopeError: number;
    shoeBottoms: number[]; plantedFeet: number; shoeError: number; legEndpointError: number;
    projection: Projection };
  fan: { localMatrix: number[]; worldMatrix: number[]; position: Point; projection: Projection; finite: boolean; sharedClockMatrixError: number };
  report: Record<string, unknown>; lifeReport: { people: number; clockSeconds: number; planters: number };
  tier: { effective: string }; quality: string;
}
interface Observer {
  read(): ActivityFrame;
  preservation(): Preservation;
  place(subject: Subject, view: View, seat?: number): { label: string; subject: Subject; view: View; seat: number; position: Point; headingY: number };
  initialFanMatrix: number[];
}
declare global { interface Window { environmentActivity?: Observer } }

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** Read the real emitted matrices/vertices. No Three constructor import is
 * necessary: vectors, matrices, Euler and quaternion scratch objects clone the
 * existing scene's own types. The pure model predicts; it never poses a mesh. */
async function installObserver(page: Page, seed: string): Promise<Preservation> {
  return page.evaluate(async seed => {
    const frontsPath = '/src/level/streetFronts.ts', sitesPath = '/src/level/environmentSites.ts';
    const generatorPath = '/src/level/generateRoute.ts', activityPath = '/src/render/protectedActivity.ts';
    const tuningPath = '/src/data/tuning.ts', livingPath = '/src/app/populationWorld.ts';
    const [{ streetFronts }, { environmentSites }, { generateLevel }, { ProtectedActivity }, { PROTECTED_ACTIVITY },
      { preparePopulationWorld }] = await Promise.all([
      import(frontsPath), import(sitesPath), import(generatorPath), import(activityPath), import(tuningPath), import(livingPath),
    ]);
    // 2026-10-04: every generated world is installed through the living-world
    // preparation (street ground, traffic/parking, district composition), which
    // intentionally appends props/solids and names the plan with a composition
    // hash. The fresh source is therefore that same preparation of a freshly
    // generated plan, computed here in the same engine; the builder identity is
    // still pinned through recordWorldId (`generated-r6-<seed>~living-r1`).
    const game = window.game, plan = game.levelPlan, generated = generateLevel(seed).plan as LevelPlan;
    const source = preparePopulationWorld(generated).level as LevelPlan;
    const coffee = (streetFronts(plan) as StreetFront[]).find(front => front.shop === 'COFFEE');
    const industrial = (environmentSites(plan) as readonly IndustrialBaySite[])[0];
    if (!coffee || !industrial) throw new Error(`Missing selected ${coffee ? '' : 'Coffee '}${industrial ? '' : 'industrial '}site in ${plan.recordWorldId ?? plan.id}`);
    const pilot = game.renderer.scene.getObjectByName('street-life-pilot');
    const decor = game.renderer.scene.getObjectByName('environment-industrial-exemplar');
    const bodies = game.renderer.scene.getObjectByName('street-life-indoor-bodies') as InstancedMesh;
    const heads = game.renderer.scene.getObjectByName('street-life-indoor-heads') as InstancedMesh;
    const fan = decor?.getObjectByName('environment-industrial-ventilation-fan') as Mesh;
    if (!pilot || !decor || !bodies?.isInstancedMesh || !heads?.isInstancedMesh || !fan?.isMesh) {
      throw new Error('Expected single installed worker meshes and industrial ventilation fan');
    }
    if (bodies.count !== heads.count * 12 || heads.count !== 6) throw new Error('Actual population must be six people with twelve body parts each');
    const expectedTuning = { travelMetres: 0.6, walkSeconds: 2.6, turnSeconds: 0.6, idleSeconds: 1.4, strideCyclesPerLeg: 2 };
    for (const [key, value] of Object.entries(expectedTuning)) {
      if (PROTECTED_ACTIVITY[key] !== value) throw new Error(`Canonical worker tuning disagrees with contract: ${key}`);
    }
    for (const [key, value] of Object.entries({ fanPeriodSeconds: 12, fanWidthShare: -0.36, fanHeightMetres: 2.60, fanFrontInsetMetres: 1.40 })) {
      if (PROTECTED_ACTIVITY[key] !== value) throw new Error(`Canonical fan tuning disagrees with contract: ${key}`);
    }
    const fanMount = fan.matrix.clone().makeRotationY(industrial.yaw)
      .setPosition(industrial.position.x, industrial.position.y, industrial.position.z)
      .multiply(fan.matrix.clone().makeTranslation(industrial.roomWidth * -0.36, 2.60, -1.40));
    const model = new ProtectedActivity(PROTECTED_ACTIVITY);
    if (Math.abs(model.periodSeconds - 10.4) > 1e-10) throw new Error('Worker period must be 10.4 seconds');
    const inverseFront = bodies.matrixWorld.clone().makeRotationY(coffee.yaw)
      .setPosition(coffee.position.x, coffee.position.y, coffee.position.z).invert();
    const point = bodies.position.clone(), scale = bodies.scale.clone(), quaternion = bodies.quaternion.clone();
    const euler = bodies.rotation.clone(), instance = bodies.matrix.clone();
    const digest = (value: unknown): string => {
      const text = JSON.stringify(value) ?? ''; let hash = 2166136261;
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const preserved = ['heightfield', 'segments', 'props', 'solids', 'hazards', 'targets', 'checkpoints', 'spawn', 'streetLoops', 'look'] as const;
    const before = Object.fromEntries(preserved.map(key => [key, JSON.stringify(plan[key]) ?? '']));
    const siteFact = (site: StreetFront | IndustrialBaySite) => {
      const index = plan.props!.indexOf(site.building);
      return { buildingPropIndex: index, sourceBuildingSame: index >= 0 && JSON.stringify(site.building) === JSON.stringify(source.props![index]),
        streetFacingDot: (site.street.x - site.position.x) * Math.sin(site.yaw)
          + (site.street.z - site.position.z) * Math.cos(site.yaw), position: site.position, yaw: site.yaw };
    };
    const preservation = (): Preservation => ({ seed, world: plan.id, sourceWorld: source.id,
      recordWorld: plan.recordWorldId, generatedWorld: generated.id,
      originals: Object.fromEntries(preserved.map(key => [key, {
        same: JSON.stringify(plan[key]) === JSON.stringify(source[key]),
        unchangedSinceBoot: (JSON.stringify(plan[key]) ?? '') === before[key],
        sourceDigest: digest(source[key]), installedDigest: digest(plan[key]),
      }])), coffee: { ...siteFact(coffee), width: coffee.width }, industrial: { ...siteFact(industrial), id: industrial.id } });
    const place: Observer['place'] = (subject, view, seat = 0) => {
      const site = subject === 'coffee' ? coffee : industrial;
      const normal = view === 'close' ? 5 : 9, lateral = view === 'oblique' ? 8 : view === 'close' ? 2.5 : 0;
      const x = site.position.x + Math.sin(site.yaw) * normal + Math.cos(site.yaw) * lateral;
      const z = site.position.z + Math.cos(site.yaw) * normal - Math.sin(site.yaw) * lateral;
      const headingY = Math.atan2(site.position.x - x, site.position.z - z);
      game.loop.setRunning(false); game.setActions({ throttle: 0, steer: 0 });
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, headingY, seat); game.advance(0);
      return { label: 'Explicit diagnostic QA placement; production ordinary chase', subject, view, seat,
        position: game.snapshotFor(seat).euc.position, headingY };
    };
    const read = (): ActivityFrame => {
      const snap = game.snapshot(), presentation = game.renderer.presentation();
      if (!presentation) throw new Error('Missing presentation report');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const expected = { ...model.sample(snap.simTimeSeconds, reduced) };
      const matrices = [];
      for (let part = 0; part < 12; part++) {
        bodies.getMatrixAt(part, instance);
        matrices.push(inverseFront.clone().multiply(bodies.matrixWorld).multiply(instance));
      }
      heads.getMatrixAt(0, instance);
      const head = inverseFront.clone().multiply(heads.matrixWorld).multiply(instance);
      const center = point.clone().setFromMatrixPosition(matrices[2]);
      matrices[2].decompose(point, quaternion, scale); euler.setFromQuaternion(quaternion, 'YXZ');
      const yaw = euler.y, centerX = -coffee.width * 0.205 + expected.offsetX;
      const inversePivot = inverseFront.clone().makeRotationY(expected.yaw).setPosition(centerX, 0, -3.195).invert();
      let pivotYawError = 0, pivotPitchError = 0, armEnvelopeError = 0;
      for (const part of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        inversePivot.clone().multiply(part === 12 ? head : matrices[part]).decompose(point, quaternion, scale);
        euler.setFromQuaternion(quaternion, 'YXZ');
        if (part !== 4) {
          pivotYawError = Math.max(pivotYawError, Math.abs(euler.y));
          pivotPitchError = Math.max(pivotPitchError, Math.abs(euler.x));
        } else {
          const roll = (0.18 - 0.06 * expected.armSwing) * (1 - expected.service);
          const serviceQuaternion = quaternion.clone().setFromEuler(euler.clone().set(-1.20 * expected.service, 0, roll));
          armEnvelopeError = Math.max(armEnvelopeError, quaternion.angleTo(serviceQuaternion));
        }
        if (part === 3) armEnvelopeError = Math.max(armEnvelopeError,
          Math.abs(Math.abs(euler.z) - 0.18) - 0.06 * Math.abs(expected.stride));
      }
      const shoeBottoms: number[] = [], ankles = [];
      let shoeError = 0, legEndpointError = 0;
      const positions = bodies.geometry.getAttribute('position');
      for (const side of [0, 1]) {
        const matrix = inversePivot.clone().multiply(matrices[10 + side]);
        const actual = [];
        for (let i = 0; i < positions.count; i++) actual.push(point.clone().fromBufferAttribute(positions, i).applyMatrix4(matrix));
        const minimum = point.clone().set(Infinity, Infinity, Infinity), maximum = point.clone().set(-Infinity, -Infinity, -Infinity);
        for (const p of actual) { minimum.min(p); maximum.max(p); }
        const centerShoe = minimum.clone().add(maximum).multiplyScalar(0.5);
        const direction = side === 0 ? 1 : -1, lift = 0.022 * Math.max(0, direction * expected.stride);
        shoeBottoms.push(minimum.y);
        ankles.push(centerShoe.clone().setY(maximum.y));
        shoeError = Math.max(shoeError, Math.abs(maximum.x - minimum.x - 0.16), Math.abs(maximum.y - minimum.y - 0.10),
          Math.abs(maximum.z - minimum.z - 0.28), Math.abs(minimum.y - 0.062 - lift),
          Math.abs(centerShoe.z - direction * 0.08 * expected.stride), Math.abs(centerShoe.x - (side === 0 ? -0.12 : 0.12)));
      }
      for (const side of [0, 1]) {
        const matrix = inversePivot.clone().multiply(matrices[side]);
        const top = point.clone().set(0, 0.5, 0).applyMatrix4(matrix), bottom = point.clone().set(0, -0.5, 0).applyMatrix4(matrix);
        const hip = point.clone().set(side === 0 ? -0.12 : 0.12, 0.94, 0);
        legEndpointError = Math.max(legEndpointError, top.distanceTo(hip), bottom.distanceTo(ankles[side]));
      }
      let pilotGroups = 0, industrialGroups = 0, bodyMeshes = 0, headMeshes = 0, fans = 0;
      game.renderer.scene.traverse(object => {
        pilotGroups += Number(object.name === 'street-life-pilot'); industrialGroups += Number(object.name === 'environment-industrial-exemplar');
        bodyMeshes += Number(object.name === bodies.name); headMeshes += Number(object.name === heads.name); fans += Number(object.name === fan.name);
      });
      const materialOwners = new Set<object>(), geometryOwners = new Set<object>(), textureOwners = new Set<object>();
      let decorMeshes = 0, mappedMeshes = 0, casters = 0, transparentMeshes = 0;
      decor.traverse(object => {
        const mesh = object as Mesh; if (!mesh.isMesh) return;
        decorMeshes++; casters += Number(mesh.castShadow); geometryOwners.add(mesh.geometry);
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of list) {
          const m = material as MeshStandardMaterial; materialOwners.add(m);
          transparentMeshes += Number(m.transparent); if (m.map) { mappedMeshes++; textureOwners.add(m.map); }
        }
      });
      const fanPosition = point.clone().setFromMatrixPosition(fan.matrixWorld);
      const fanPhase = reduced ? 0 : (snap.simTimeSeconds % 12) / 12;
      const expectedFan = fanMount.clone().multiply(fan.matrix.clone().makeRotationZ(fanPhase * Math.PI * 2));
      const sharedClockMatrixError = Math.max(...fan.matrix.elements.map((value, i) => Math.abs(value - expectedFan.elements[i])));
      const workerWorld = center.clone().applyMatrix4(inverseFront.clone().invert());
      return { tick: snap.tick, seconds: snap.simTimeSeconds, lifeClockSeconds: presentation.streetLife.clockSeconds,
        views: game.renderer.viewCount, reduced, dpr: window.devicePixelRatio, camera: snap.camera,
        rider: { position: snap.euc.position, speed: snap.euc.speed, crashes: snap.euc.crashes, state: snap.euc.state },
        resetCount: snap.consumed.reset ?? 0,
        owners: { pilotUuid: pilot.uuid, industrialUuid: decor.uuid, bodiesUuid: bodies.uuid, headsUuid: heads.uuid, fanUuid: fan.uuid,
          pilotGroups, industrialGroups, bodyMeshes, headMeshes, fans, bodyInstances: bodies.count, headInstances: heads.count,
          decorMeshes, materials: materialOwners.size, geometries: geometryOwners.size, mappedMeshes, textures: textureOwners.size,
          casters, transparentMeshes, fanCaster: fan.castShadow, fanReceiver: fan.receiveShadow },
        worker: { matrices: matrices.map(matrix => matrix.toArray()), headMatrix: head.toArray(),
          allBodyDigest: digest(Array.from(bodies.instanceMatrix.array)), allHeadDigest: digest(Array.from(heads.instanceMatrix.array)),
          expected, center: { x: center.x, y: center.y, z: center.z }, yaw,
          centerError: Math.hypot(center.x - centerX, center.z + 3.195),
          yawError: Math.abs(Math.atan2(Math.sin(yaw - expected.yaw), Math.cos(yaw - expected.yaw))),
          pivotYawError, pivotPitchError, armEnvelopeError, shoeBottoms,
          plantedFeet: shoeBottoms.filter(y => Math.abs(y - 0.062) <= 2e-4).length, shoeError, legEndpointError,
          projection: window.qa.projectPoint(workerWorld.x, workerWorld.y + 0.45, workerWorld.z) },
        fan: { localMatrix: fan.matrix.toArray(), worldMatrix: fan.matrixWorld.toArray(), position: { x: fanPosition.x, y: fanPosition.y, z: fanPosition.z },
          projection: window.qa.projectPoint(fanPosition.x, fanPosition.y, fanPosition.z),
          finite: [...fan.matrix.elements, ...fan.matrixWorld.elements].every(Number.isFinite), sharedClockMatrixError },
        report: presentation.environmentDecor as unknown as Record<string, unknown>, lifeReport: presentation.streetLife,
        tier: presentation.tier, quality: snap.options.quality };
    };
    game.advance(0);
    window.environmentActivity = { read, preservation, place, initialFanMatrix: fan.matrix.toArray() };
    return preservation();
  }, seed);
}
async function read(page: Page) { return page.evaluate(() => window.environmentActivity!.read()); }
async function preserve(page: Page) { return page.evaluate(() => window.environmentActivity!.preservation()); }
async function stageErrors(page: Page) {
  return page.evaluate(() => {
    const gl = window.game.renderer.renderer.getContext(), errors = [];
    for (let i = 0; i < 16; i++) { const error = gl.getError(); if (error === gl.NO_ERROR) break; errors.push(error); }
    return { glErrors: errors, ultraGlErrors: window.game.renderer.presentation()?.ultra?.glErrors ?? [] };
  });
}
function expectPreserved(fact: Preservation) {
  expect(fact.world).toBe(fact.sourceWorld);
  // 2026-10-04: the engine-independent identity of the living world.
  expect(fact.recordWorld).toBe(`${fact.generatedWorld}~living-r1`);
  expect(fact.generatedWorld).toBe(`generated-r6-${fact.seed}`);
  for (const [key, value] of Object.entries(fact.originals)) {
    expect(value.same, `original ${key}`).toBe(true); expect(value.unchangedSinceBoot, `during activity ${key}`).toBe(true);
    expect(value.installedDigest).toBe(value.sourceDigest);
  }
  for (const site of [fact.coffee, fact.industrial]) {
    expect(site.buildingPropIndex).toBeGreaterThanOrEqual(0); expect(site.sourceBuildingSame).toBe(true);
    expect(site.streetFacingDot).toBeGreaterThan(0);
  }
}
function expectFrame(frame: ActivityFrame, views = 1) {
  expect(frame.dpr).toBe(1); expect(frame.views).toBe(views);
  expect(frame.camera).toMatchObject({ mode: 'chase', scriptedOcclusion: false });
  expect(frame.owners).toMatchObject({ pilotGroups: 1, industrialGroups: 1, bodyMeshes: 1, headMeshes: 1, fans: 1,
    bodyInstances: 72, headInstances: 6, decorMeshes: 8, materials: 7, geometries: 8, mappedMeshes: 1, textures: 1,
    casters: 0, transparentMeshes: 0, fanCaster: false, fanReceiver: false });
  expect(frame.report).toMatchObject({ industrialBays: 1, motion: 'ventilation', ventilationFans: 1,
    drawCalls: 8, materialOwners: 7, textureBytes: 1_048_576, shadowDrawCalls: 0 });
  expect(frame.lifeReport).toMatchObject({ people: 6, planters: 1 });
  // The report exposes the fixed reduced-motion pose clock; Game's shared
  // simulation clock continues advancing and is independently traced.
  expect(Math.abs(frame.lifeClockSeconds - (frame.reduced ? 0 : frame.seconds))).toBeLessThan(1e-7);
  expect(frame.worker.matrices).toHaveLength(PARTS);
  for (const matrix of [...frame.worker.matrices, frame.worker.headMatrix]) expect(matrix.every(Number.isFinite)).toBe(true);
  for (const key of ['centerError', 'yawError', 'pivotYawError', 'pivotPitchError', 'armEnvelopeError', 'shoeError', 'legEndpointError'] as const) {
    expect(frame.worker[key], `actual worker ${key} at ${frame.seconds}`).toBeLessThanOrEqual(EPSILON);
  }
  expect(frame.worker.plantedFeet).toBeGreaterThanOrEqual(1);
  expect(Math.min(...frame.worker.shoeBottoms)).toBeGreaterThanOrEqual(0.062 - EPSILON);
  expect(Math.abs(frame.worker.expected.offsetX)).toBeLessThanOrEqual(0.3 + 1e-10);
  expect(Math.abs(frame.worker.yaw)).toBeLessThanOrEqual(Math.PI / 2 + EPSILON);
  expect(frame.fan.finite).toBe(true); expect(frame.fan.sharedClockMatrixError).toBeLessThan(1e-8);
}
function matrixDifference(a: number[], b: number[]): number { return Math.max(...a.map((value, i) => Math.abs(value - b[i]))); }
function workerDifference(a: ActivityFrame, b: ActivityFrame): number {
  return Math.max(...a.worker.matrices.map((matrix, i) => matrixDifference(matrix, b.worker.matrices[i])),
    matrixDifference(a.worker.headMatrix, b.worker.headMatrix));
}

/** A paced RAF is only the recording scheduler. It never supplies animation
 * time: each batch explicitly runs real 120 Hz production steps, with no
 * catchup after a screenshot. Screenshots and native timeline offsets remain
 * labelled in the report; native clips can include those held-frame pauses. */
for (const quality of ['high', 'ultra'] as const) for (const subject of ['coffee', 'industrial'] as const) {
  test(`diagnostic complete ${subject} activity cycle: ${quality}`, async ({ page }) => {
    // 2026-10-04: the fresh source is now the full living-world preparation
    // (seconds) on top of the 90 s native recording window.
    test.setTimeout(300_000);
    const directory = join(shots, `${quality}-${subject}`), errors = collectErrors(page), frames: { name: string; frame: ActivityFrame }[] = [];
    mkdirSync(directory, { recursive: true });
    let evidence: unknown = null, initialSource: Preservation | null = null, finalSource: Preservation | null = null, failure = '';
    let graphics: Awaited<ReturnType<typeof stageErrors>> | null = null;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.exposeBinding('captureEnvironmentActivity', async (_source, name: string, frame: ActivityFrame) => {
      if (!/^(cycle-\d+|principal|oblique)$/.test(name)) throw new Error('Unexpected diagnostic screenshot label');
      frames.push({ name, frame }); await page.screenshot({ path: join(directory, `${name}.png`) });
    });
    try {
      await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true });
      initialSource = await installObserver(page, 'euc');
      const placement = await page.evaluate(subject => window.environmentActivity!.place(subject, 'close'), subject);
      const result = await page.evaluate(async ({ subject }) => {
        const game = window.game, observer = window.environmentActivity!, initial = observer.read();
        const phases = subject === 'coffee' ? [0, 0.6, 1.575, 2.225, 3.2, 4.5, 5.2, 6.775, 8.4, 9.7, 10.4, 12] : [0, 3, 6, 9, 12];
        const targets = phases.map(seconds => Math.round(seconds * 120)), totalSteps = 1440;
        const canvas = game.renderer.renderer.domElement;
        if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') throw new Error('Native canvas recording unavailable');
        const stream = canvas.captureStream(), mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
        const chunks: Blob[] = [], trace: (ActivityFrame & { relativeSeconds: number; nativeTimelineSeconds: number; advancedSteps: number })[] = [];
        let recorder: MediaRecorder;
        try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 }); }
        catch (error) { for (const track of stream.getTracks()) track.stop(); throw error; }
        let recorderError = '', stoppedFlag = false, placementCalls = 0, steps = 0, checkpoint = 0, raf = 0, wallTimer = 0, outcome = 'not-started';
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { recorderError = 'MediaRecorder failed'; };
        const stopped = new Promise<void>(resolve => { recorder.onstop = () => { stoppedFlag = true; resolve(); }; });
        const originalPlaceRider = game.placeRider;
        game.placeRider = () => { placementCalls++; throw new Error('Placement forbidden during native activity recording'); };
        let started = 0;
        const sample = async (advancedSteps: number) => {
          const frame = observer.read();
          trace.push({ ...frame, relativeSeconds: frame.seconds - initial.seconds,
            nativeTimelineSeconds: (performance.now() - started) / 1000, advancedSteps });
          if (checkpoint < targets.length && steps === targets[checkpoint]) {
            const capture = (window as unknown as { captureEnvironmentActivity(name: string, frame: ActivityFrame): Promise<void> }).captureEnvironmentActivity;
            await capture(`cycle-${checkpoint}`, frame); checkpoint++;
          }
          return frame;
        };
        try {
          started = performance.now(); recorder.start(1000); await sample(0);
          await new Promise<void>(resolve => {
            let done = false, notBefore = performance.now() + 50;
            const finish = (reason: string) => { if (done) return; done = true; outcome = reason; cancelAnimationFrame(raf); window.clearTimeout(wallTimer); resolve(); };
            wallTimer = window.setTimeout(() => finish('recording-wall-limit'), 90_000);
            const tick = async (now: number) => {
              if (now < notBefore) { raf = requestAnimationFrame(tick); return; }
              try {
                if (recorderError) { finish('recorder-error'); return; }
                const batch = Math.min(6, totalSteps - steps, (targets[checkpoint] ?? totalSteps) - steps);
                if (batch <= 0) { finish('invalid-fixed-schedule'); return; }
                game.advance(batch); steps += batch;
                const frame = await sample(batch);
                if (Math.abs(frame.seconds - initial.seconds - steps / 120) > 1e-7 || frame.tick - initial.tick !== steps) { finish('shared-clock-discontinuity'); return; }
                if (frame.camera.mode !== 'chase' || frame.camera.scriptedOcclusion) { finish('camera-state-changed'); return; }
                if (frame.resetCount !== initial.resetCount || frame.rider.crashes !== initial.rider.crashes) { finish('unexpected-reset-or-crash'); return; }
                if (steps === totalSteps) { finish('complete'); return; }
                notBefore = performance.now() + Math.min(6, (targets[checkpoint] ?? totalSteps) - steps) / 120 * 1000;
                raf = requestAnimationFrame(tick);
              } catch (error) { finish(`recording-error: ${error instanceof Error ? error.message : String(error)}`); }
            };
            raf = requestAnimationFrame(tick);
          });
        } finally {
          cancelAnimationFrame(raf); window.clearTimeout(wallTimer); game.placeRider = originalPlaceRider; game.clearActions();
          if (recorder.state !== 'inactive') recorder.stop();
          let stopTimer = 0;
          await Promise.race([stopped, new Promise<void>(resolve => { stopTimer = window.setTimeout(resolve, 3000); })]);
          window.clearTimeout(stopTimer); for (const track of stream.getTracks()) track.stop();
        }
        const videoBase64 = chunks.length ? await new Promise<string>(resolve => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => { recorderError = 'Completed clip read failed'; resolve(''); }; reader.readAsDataURL(new Blob(chunks, { type: mimeType }));
        }) : '';
        return { outcome, initial, final: observer.read(), trace, phases, capturedCheckpoints: checkpoint, totalSteps: steps,
          nativeRecording: { mimeType, error: recorderError, stopped: stoppedFlag, elapsedWallSeconds: (performance.now() - started) / 1000,
            pacing: 'Fixed advance batches <=6 at 120Hz, bounded phase splits, at most one batch per paced RAF, no catchup' },
          placementCallsAfterStart: placementCalls, videoBase64 };
      }, { subject });
      if (result.videoBase64) writeFileSync(join(directory, 'native-cycle.webm'), Buffer.from(result.videoBase64, 'base64'));
      const { videoBase64, ...metadata } = result;
      evidence = { placement, nativeBytes: Buffer.from(videoBase64, 'base64').length, ...metadata };
      // Preserve all diagnostics before assertions; no rescue/reframing of a recording.
      writeFileSync(join(directory, 'cycle.json'), JSON.stringify(evidence, null, 2) + '\n');
      expect(result.outcome).toBe('complete'); expect(result.totalSteps).toBe(1440); expect(result.placementCallsAfterStart).toBe(0);
      expect(result.initial.seconds).toBe(0); expect(result.final.seconds - result.initial.seconds).toBeCloseTo(12, 7);
      expect(result.nativeRecording).toMatchObject({ error: '', stopped: true });
      expect(result.nativeRecording.elapsedWallSeconds).toBeGreaterThanOrEqual(12);
      expect(Buffer.from(videoBase64, 'base64').length).toBeGreaterThan(10_000);
      expect(result.capturedCheckpoints).toBe(result.phases.length); expect(result.trace.length).toBeGreaterThanOrEqual(241);
      for (const frame of result.trace) { expectFrame(frame); expect(frame.owners).toEqual(result.initial.owners); }
      expect(result.initial.quality).toBe(quality); expect(result.initial.tier.effective).toBe(quality === 'ultra' ? 'ultra' : 'ordinary');
      if (subject === 'coffee') {
        const wrapped = result.trace.find(frame => Math.abs(frame.relativeSeconds - 10.4) < 1e-7)!;
        expect(workerDifference(result.initial, wrapped)).toBeLessThanOrEqual(EPSILON);
        expect(Math.max(...result.trace.map(frame => frame.worker.expected.stride))).toBeGreaterThan(0.75);
        expect(Math.min(...result.trace.map(frame => frame.worker.expected.stride))).toBeLessThan(-0.75);
      } else {
        expect(matrixDifference(result.initial.fan.localMatrix, result.final.fan.localMatrix)).toBeLessThan(1e-6);
        expect(result.trace.some(frame => matrixDifference(result.initial.fan.localMatrix, frame.fan.localMatrix) > 0.1)).toBe(true);
      }
      for (const view of ['principal', 'oblique'] as const) {
        const framing = await page.evaluate(({ subject, view }) => {
          const observer = window.environmentActivity!; const framing = observer.place(subject, view);
          if (view === 'oblique') window.game.advance(subject === 'coffee' ? 432 : 360);
          return framing;
        }, { subject, view });
        const frame = await read(page); frames.push({ name: view, frame });
        await page.screenshot({ path: join(directory, `${view}.png`) }); expectFrame(frame);
        expect((subject === 'coffee' ? frame.worker.projection : frame.fan.projection).inFront, JSON.stringify(framing)).toBe(true);
      }
      finalSource = await preserve(page); expectPreserved(initialSource); expectPreserved(finalSource);
      graphics = await stageErrors(page); expect(graphics.glErrors).toEqual([]); expect(graphics.ultraGlErrors).toEqual([]); expect(errors).toEqual([]);
    } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error; }
    finally {
      writeFileSync(join(directory, 'report.json'), JSON.stringify({ scope: 'Diagnostic QA placement; real shared simulation clock and ordinary chase; not normal spawn',
        quality, subject, viewport: { width: 1280, height: 720, dpr: 1 }, initialSource, finalSource, evidence, frames, graphics, errors, failure,
        acceptance: 'Native motion and pixels require independent visual review; no device, human or listening claim' }, null, 2) + '\n');
      await page.evaluate(() => { delete window.environmentActivity; });
    }
  });
}

test('one shared activity owner serves 2/4 panes and reduced motion changes at unchanged time', async ({ page }) => {
  test.setTimeout(120_000);
  const directory = join(shots, 'shared-panes'), errors = collectErrors(page), frames: ActivityFrame[] = [];
  mkdirSync(directory, { recursive: true }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  let source: Preservation | null = null, failure = '';
  let graphics: Awaited<ReturnType<typeof stageErrors>> | null = null;
  try {
    await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true }); await installObserver(page, 'euc');
    await page.evaluate(() => { window.environmentActivity!.place('coffee', 'close'); window.game.advance(189); });
    const solo = await read(page); frames.push(solo); expectFrame(solo);
    for (const seats of [2, 4] as const) {
      await page.evaluate(seats => {
        const game = window.game, observer = window.environmentActivity!;
        while (game.seatCount < seats) {
          const seat = game.spawnRider(); observer.place(seat % 2 ? 'industrial' : 'coffee', seat > 1 ? 'oblique' : 'principal', seat);
        }
        game.loop.setRunning(false); game.advance(0);
      }, seats);
      const frame = await read(page); frames.push(frame); expectFrame(frame, seats);
      expect(frame.seconds).toBe(solo.seconds); expect(frame.tick).toBe(solo.tick); expect(frame.owners).toEqual(solo.owners);
      expect(frame.worker.matrices).toEqual(solo.worker.matrices); expect(frame.worker.headMatrix).toEqual(solo.worker.headMatrix);
      expect(frame.fan.localMatrix).toEqual(solo.fan.localMatrix); expect(frame.fan.worldMatrix).toEqual(solo.fan.worldMatrix);
      await page.screenshot({ path: join(directory, `${seats}-panes.png`) });
    }
    await page.evaluate(() => window.game.advance(6)); const advancing = await read(page); frames.push(advancing); expectFrame(advancing, 4);
    expect(advancing.seconds - solo.seconds).toBeCloseTo(0.05, 7); expect(workerDifference(advancing, solo)).toBeGreaterThan(0.001);
    expect(matrixDifference(advancing.fan.localMatrix, solo.fan.localMatrix)).toBeGreaterThan(0.001);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => window.game.advance(0));
    const rest = await read(page); frames.push(rest); expectFrame(rest, 4); expect(rest.reduced).toBe(true); expect(rest.seconds).toBe(advancing.seconds);
    expect(rest.worker.expected).toEqual({ offsetX: 0, yaw: 0, stride: 0, armSwing: 0, walking: 0, service: 0 });
    const initialFanMatrix = await page.evaluate(() => window.environmentActivity!.initialFanMatrix);
    expect(matrixDifference(rest.fan.localMatrix, initialFanMatrix)).toBeLessThan(1e-6);
    await page.screenshot({ path: join(directory, '4-panes-reduced-rest.png') });
    await page.evaluate(() => window.game.advance(120)); const held = await read(page); frames.push(held); expectFrame(held, 4);
    expect(held.seconds - rest.seconds).toBeCloseTo(1, 7); expect(held.worker.matrices).toEqual(rest.worker.matrices); expect(held.worker.headMatrix).toEqual(rest.worker.headMatrix);
    expect(held.worker.allBodyDigest).toBe(rest.worker.allBodyDigest); expect(held.worker.allHeadDigest).toBe(rest.worker.allHeadDigest);
    expect(held.fan.localMatrix).toEqual(rest.fan.localMatrix); expect(held.owners).toEqual(solo.owners);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => window.game.advance(0));
    const restored = await read(page); frames.push(restored); expectFrame(restored, 4); expect(restored.reduced).toBe(false); expect(restored.seconds).toBe(held.seconds);
    expect(workerDifference(restored, held)).toBeGreaterThan(0.01); expect(matrixDifference(restored.fan.localMatrix, held.fan.localMatrix)).toBeGreaterThan(0.1);
    expect(restored.owners).toEqual(solo.owners);
    await page.evaluate(() => window.game.advance(0)); const same = await read(page); frames.push(same);
    expect(same.worker.matrices).toEqual(restored.worker.matrices); expect(same.fan.localMatrix).toEqual(restored.fan.localMatrix);
    source = await preserve(page); expectPreserved(source);
    graphics = await stageErrors(page); expect(graphics.glErrors).toEqual([]); expect(graphics.ultraGlErrors).toEqual([]); expect(errors).toEqual([]);
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ scope: 'Diagnostic panes and shared owner/matrix evidence', frames, source, graphics, errors, failure }, null, 2) + '\n');
    await page.evaluate(() => { delete window.environmentActivity; });
  }
});

test('generated corner/city/rider retain source placement and protected activity facing', async ({ page }) => {
  test.setTimeout(180_000);
  const directory = join(shots, 'generated'), errors = collectErrors(page), evidence: unknown[] = [];
  mkdirSync(directory, { recursive: true }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  let failure = '';
  try {
    for (const seed of ['corner', 'city', 'rider']) {
      await bootAtTier(page, `level=generated&seed=${seed}`, 'high', { freezeAtStart: true });
      const original = await installObserver(page, seed); evidence.push({ seed, original }); expectPreserved(original);
      for (const subject of ['coffee', 'industrial'] as const) {
        const framing = await page.evaluate(subject => {
          const framing = window.environmentActivity!.place(subject, subject === 'coffee' ? 'principal' : 'oblique');
          window.game.advance(subject === 'coffee' ? 189 : 360); return framing;
        }, subject);
        const frame = await read(page), preserved = await preserve(page); evidence.push({ seed, subject, framing, frame, preserved });
        await page.screenshot({ path: join(directory, `${seed}-${subject}.png`) }); expectFrame(frame); expectPreserved(preserved);
        const projection = subject === 'coffee' ? frame.worker.projection : frame.fan.projection;
        expect(projection.inFront).toBe(true); expect(Math.abs(projection.x)).toBeLessThan(0.95); expect(Math.abs(projection.y)).toBeLessThan(0.95);
      }
      const gl = await stageErrors(page); evidence.push({ seed, graphics: gl }); expect(gl.glErrors).toEqual([]); expect(gl.ultraGlErrors).toEqual([]);
    }
    expect(errors).toEqual([]);
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ scope: 'Generated-course diagnostic QA placements; original source identities and shared-time poses',
      seeds: ['corner', 'city', 'rider'], viewport: { width: 1280, height: 720, dpr: 1 }, evidence, errors, failure }, null, 2) + '\n');
    await page.evaluate(() => { delete window.environmentActivity; });
  }
});
