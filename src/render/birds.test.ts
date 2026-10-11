/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 — the render-only flock (`render/birdFlight.ts`, `render/birds.ts`;
 * `docs/PLANS.md` §42.2j/§42.3b, BUILD_MAP Builder B tests (a)–(g)).
 *
 * (a) the price is what is built; (b) the plan is never touched; (c) dispose
 * frees each owner once; (d) the flock clears the skyline; (e) it is born and
 * retired beyond every far plane, and parks beyond them; (f) one clock, no
 * drift, reduced motion parks, and (R13) each pass is laid across one view's
 * heading when it starts, steers in, and (R17, critic r3 2c) never steps in
 * bank, turn, altitude or pitch, retiring out of every pane's sight; (g) the
 * on-screen time over simulated rides of real chase-camera poses, PINNED on
 * the town at ordinary riding (R13: a flock within five minutes of any load;
 * R17: a readable pass about every minute or two, the first within about a
 * minute and a half, couch pane 1 too, still absent most of the time; owner
 * round 2: twice as often, about every half minute, the first about 20 s in,
 * still absent over half the time).
 * No frame-interval or FPS figure appears anywhere (invariant 11).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BIRDS, CAMERA, LIGHTING, SIMULATION } from '../data/tuning.ts';
import { PROP_VERTICAL_SPANS } from '../data/props.ts';
import { createGroundSample } from '../simulation/world.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import { planDigest } from '../level/planDigest.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { RouteSpine, createSpineSample } from '../simulation/routeSpine.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { buildRouteField } from '../simulation/routeField.ts';
import { ScriptedOutlaw, buildEvaderCourse, hazardsOnLine, writeView } from '../bench/chaseScripts.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import {
  BirdFlightClock,
  birdEntryDistance,
  birdFlockRadius,
  birdGuardDistance,
  birdLocalPose,
  birdSchedule,
  countBirds,
  createBirdLocalPose,
  createBirdPass,
  createFlockFrame,
  distanceToBox,
  fillBirdPass,
  fillBirdProfile,
  flockFrameAt,
  prepareBirdFlight,
  skylineAt,
  type FlockFrame,
  type PositionedLike,
  type PreparedBirdFlight,
  walkRoad,
} from './birdFlight.ts';
import { birdColourLinear, createBirds, EMPTY_BIRDS_REPORT } from './birds.ts';
import { buildingSourceRecords } from './buildingSourceRecords.ts';
import { ChaseCamera, createChaseCameraState, createChaseCameraView, resolveChaseView } from './chaseCamera.ts';
import { BASELINE_PRESENTATION, presentationCost } from './presentation.ts';
import { prepareEnvironmentSupplements } from './environmentSupplementPrice.ts';

const town = generateLevel('euc').plan;
const slice = createSliceLevel();
const NO_CAMERAS: readonly PositionedLike[] = [];

function flockMesh(group: THREE.Group): THREE.InstancedMesh {
  const mesh = group.getObjectByName('world-birds-flock');
  assert.ok(mesh instanceof THREE.InstancedMesh, 'the flock is one instanced mesh');
  return mesh;
}

/** World positions of every bird at world time `t` (heading frame → world). */
function birdPositions(prepared: PreparedBirdFlight, frame: FlockFrame, t: number): { x: number; y: number; z: number }[] {
  const pose = createBirdLocalPose();
  const cos = Math.cos(frame.headingY), sin = Math.sin(frame.headingY);
  const out = [];
  for (let bird = 0; bird < BIRDS.count; bird += 1) {
    birdLocalPose(prepared.worldKey, bird, t, pose);
    out.push({ x: frame.x + pose.x * cos + pose.z * sin, y: frame.y + pose.y, z: frame.z - pose.x * sin + pose.z * cos });
  }
  return out;
}

/** The highest ground in (x, z)'s skyline cell (the surround outside the grid). */
function groundAt(prepared: PreparedBirdFlight, x: number, z: number): number {
  const c = Math.floor((x - prepared.gridOriginX) / prepared.cellMetres), r = Math.floor((z - prepared.gridOriginZ) / prepared.cellMetres);
  return c >= 0 && r >= 0 && c < prepared.columns && r < prepared.rows ? prepared.terrain[r * prepared.columns + c] : prepared.surroundHeight;
}

test('(a) the flock costs what it builds: one draw, 72 triangles, exact bytes, no shadow, layer 1 only', () => {
  const prepared = prepareBirdFlight(town);
  assert.equal(prepared.eligible, true);
  const birds = createBirds(prepared);
  try {
    const mesh = flockMesh(birds.group);
    const price = countBirds(prepared);
    const geometryBytes = Object.values(mesh.geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
      + mesh.geometry.index!.array.byteLength;
    assert.equal(birds.group.children.length, 1, 'one mesh, one draw');
    assert.equal(price.colourDraws, 1);
    assert.equal(price.shadowDraws, 0);
    assert.equal(price.shadowTriangles, 0);
    assert.equal(price.textureBytes, 0);
    assert.equal(mesh.count, BIRDS.count * 2);
    assert.equal(price.colourTriangles, mesh.count * mesh.geometry.index!.count / 3);
    assert.equal(price.colourTriangles, 72, 'R17: nine birds, two half-birds of four triangles each');
    assert.equal(price.geometryBytes, geometryBytes);
    assert.equal(price.geometryBytes, 120, 'eight Float32 positions and twelve Uint16 indices');
    assert.equal(price.instanceBytes, mesh.instanceMatrix.array.byteLength);
    assert.equal(price.instanceBytes, 1152, 'eighteen 64-byte matrices');
    assert.equal(mesh.geometry.index!.array.BYTES_PER_ELEMENT, 2);
    assert.deepEqual(Object.keys(mesh.geometry.attributes), ['position'], 'position only');
    const report = birds.report();
    assert.equal(report.drawCalls, price.colourDraws);
    assert.equal(report.colourTriangles, price.colourTriangles);
    assert.equal(report.geometryBytes, price.geometryBytes);
    assert.equal(report.instanceBytes, price.instanceBytes);
    // Never a shadow pass, never the Ultra static layer (5), never a receiver.
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, false);
    assert.equal(mesh.layers.mask, 1);
    assert.equal(birds.group.layers.mask, 1);
    assert.equal(birds.group.name, 'world-birds');
    assert.ok(!/^level-|^knockabout-|rider$/.test(birds.group.name), 'no categoryOf prefix and no receiving-rig name');
    // Unlit dark slate, fogged, no colour channel that could silently drop.
    const material = mesh.material as THREE.MeshBasicMaterial;
    assert.ok(material instanceof THREE.MeshBasicMaterial);
    assert.equal(material.fog, true);
    assert.equal(material.side, THREE.DoubleSide);
    assert.equal(material.vertexColors, false);
    assert.equal(material.map, null);
    assert.equal(mesh.instanceColor, null);
    assert.equal(material.customProgramCacheKey(), new THREE.MeshBasicMaterial().customProgramCacheKey(), 'no shader patch');
    const c = material.color, linear = birdColourLinear();
    const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    assert.ok(Math.abs(luminance - BIRDS.colourLinear) < 1e-6, `luminance ${luminance}`);
    assert.ok(luminance >= 0.03 && luminance <= 0.6, 'DESIGN §2 legibility band');
    assert.ok(Math.abs(c.r - linear.r) < 1e-6 && Math.abs(c.b - linear.b) < 1e-6);
    assert.ok(c.b > c.r, 'slate: a touch blue');
    // The sphere is set once from the formation; the mesh moves by its matrix.
    assert.equal(mesh.frustumCulled, true);
    assert.equal(mesh.matrixAutoUpdate, false);
    assert.ok(mesh.boundingSphere);
    assert.equal(mesh.boundingSphere.radius, birdFlockRadius());
    assert.equal(mesh.boundingSphere.center.length(), 0);
  } finally { birds.dispose(); }

  // Every frame shape pays it once per pane (×1/×2/×4), and only it.
  const supplements = prepareEnvironmentSupplements(slice);
  try {
    assert.equal(supplements.birds.eligible, true);
    const without = { ...supplements, birds: prepareBirdFlight({ ...slice, props: [] }) };
    const withBirds = presentationCost(slice, BASELINE_PRESENTATION, null, supplements);
    const withoutBirds = presentationCost(slice, BASELINE_PRESENTATION, null, without);
    for (const [frame, panes] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
      assert.equal(withBirds.frame[frame].drawCalls - withoutBirds.frame[frame].drawCalls, 1 * panes);
      assert.equal(withBirds.frame[frame].triangles - withoutBirds.frame[frame].triangles, 72 * panes);
    }
    assert.equal(withBirds.shadowTriangles, withoutBirds.shadowTriangles);
  } finally { supplements.dispose(); }

  // Nothing at all for the proving ground or an empty fixture.
  for (const plan of [createProvingGround(), { ...slice, props: [] }]) {
    const prepared = prepareBirdFlight(plan);
    assert.equal(prepared.eligible, false);
    assert.deepEqual(countBirds(prepared), { colourDraws: 0, shadowDraws: 0, colourTriangles: 0, shadowTriangles: 0,
      geometryBytes: 0, instanceBytes: 0, textureBytes: 0 });
    const empty = createBirds(prepared);
    assert.equal(empty.group.children.length, 0);
    empty.update(120, false, NO_CAMERAS);
    assert.deepEqual(empty.report(), EMPTY_BIRDS_REPORT);
    empty.dispose();
    empty.dispose();
  }
});

test('(b) prepare, create, update and dispose never touch the plan', () => {
  for (const plan of [slice, town]) {
    const digest = planDigest(plan), text = JSON.stringify(plan);
    const prepared = prepareBirdFlight(plan);
    const birds = createBirds(prepared);
    const pass = birdSchedule(prepared, 1)[0];
    birds.update(0, false, NO_CAMERAS);
    for (let seconds = pass.startSeconds; seconds < pass.endSeconds; seconds += 7.3) birds.update(seconds, false, NO_CAMERAS);
    birds.update(pass.endSeconds + 1, true, NO_CAMERAS);
    birds.dispose();
    assert.equal(planDigest(plan), digest);
    assert.equal(JSON.stringify(plan), text);
  }
  assert.notEqual(planDigest({ ...town, props: town.props!.slice(1) }), planDigest(town), 'the digest would see a change');
});

test('(c) repeated teardown frees every unique owner exactly once', () => {
  const scene = new THREE.Scene();
  for (let generation = 0; generation < 4; generation += 1) {
    const birds = createBirds(prepareBirdFlight(town));
    scene.add(birds.group);
    const mesh = flockMesh(birds.group);
    const counts = [0, 0, 0];
    mesh.addEventListener('dispose', () => { counts[0] += 1; });
    mesh.geometry.addEventListener('dispose', () => { counts[1] += 1; });
    (mesh.material as THREE.Material).addEventListener('dispose', () => { counts[2] += 1; });
    birds.dispose();
    birds.dispose();
    birds.update(200, false, NO_CAMERAS);
    assert.equal(scene.children.length, 0);
    assert.deepEqual(counts, [1, 1, 1]);
    assert.equal(birds.report().drawn, false);
  }
});

test('(d) over ten passes per world every bird clears the skyline and the ground', () => {
  // Below the flock centre at most: formation + wander + bob, and a wing.
  const extent = BIRDS.formationVerticalMetres + BIRDS.wanderMetres + BIRDS.bobMetres + BIRDS.wingspanMetres / 2;
  for (const [name, plan] of [['euc', town], ['track', createTrackLevel()], ['switchback', createSwitchbackLevel()], ['slice', slice]] as const) {
    const prepared = prepareBirdFlight(plan);
    assert.equal(prepared.eligible, true, name);
    const pass = createBirdPass(), profile = new Float32Array(prepared.profileCapacity), frame = createFlockFrame();
    let checked = 0, closest = Infinity, highest = -Infinity, lowest = Infinity;
    for (let index = 0; index < 10; index += 1) {
      fillBirdPass(prepared, index, pass);
      const count = fillBirdProfile(prepared, pass, profile);
      for (let d = 0; d <= pass.length; d += 3.1) {
        flockFrameAt(pass, profile, count, d, frame);
        highest = Math.max(highest, frame.y);
        lowest = Math.min(lowest, frame.y);
        for (const bird of birdPositions(prepared, frame, d / BIRDS.speed)) {
          const sky = skylineAt(prepared, bird.x, bird.z);
          if (Number.isFinite(sky)) closest = Math.min(closest, bird.y - sky);
          assert.ok(bird.y >= sky + BIRDS.clearanceMetres - extent,
            `${name} pass ${index} at ${d.toFixed(0)} m: bird ${bird.y.toFixed(1)} m over a ${sky.toFixed(1)} m top`);
          assert.ok(bird.y >= groundAt(prepared, bird.x, bird.z) + BIRDS.terrainFloorMetres - extent,
            `${name} pass ${index} at ${d.toFixed(0)} m: bird ${bird.y.toFixed(1)} m too near the ground`);
          checked += 1;
        }
      }
      // The climb is slope-limited.
      for (let i = 1; i < count; i += 1) {
        assert.ok(Math.abs(profile[i] - profile[i - 1]) <= BIRDS.climbSlope * BIRDS.altitudeSampleMetres + 1e-4);
      }
    }
    assert.ok(checked > 10_000, `${name}: a vacuous sweep proves nothing (${checked})`);
    console.log(JSON.stringify({ bird: 'clearance', world: name, closestOverTopMetres: +closest.toFixed(1),
      centreAltitudeMetres: [+lowest.toFixed(1), +highest.toFixed(1)] }));
  }
  // The positive control: a skyline the flock must climb for.
  const tower = { ...slice, props: [...slice.props!, { kind: 'building' as const, position: { x: 40, y: 0, z: 150 }, rotationY: 0,
    scale: 1, size: { x: 10, y: 120, z: 10 } }] };
  const prepared = prepareBirdFlight(tower);
  assert.ok(skylineAt(prepared, 40, 150) >= 120);
});

test('(e) passes are born and retired beyond every far plane; the parked flock is beyond them too', () => {
  assert.equal(birdEntryDistance(), CAMERA.far + BIRDS.entryMarginMetres);
  assert.equal(birdEntryDistance(), 540);
  assert.ok(BIRDS.entryMarginMetres >= birdFlockRadius(), 'the margin covers the flock radius');
  assert.ok(birdGuardDistance() < birdEntryDistance(), 'a camera anywhere over the field never holds a pass back');
  for (const plan of [town, createTrackLevel(), createSwitchbackLevel()]) {
    const prepared = prepareBirdFlight(plan);
    const pass = createBirdPass(), profile = new Float32Array(prepared.profileCapacity), frame = createFlockFrame();
    for (let index = 0; index < 12; index += 1) {
      fillBirdPass(prepared, index, pass);
      const count = fillBirdProfile(prepared, pass, profile);
      for (const d of [0, pass.length]) {
        flockFrameAt(pass, profile, count, d, frame);
        assert.ok(distanceToBox(prepared.box, frame.x, frame.z) >= birdEntryDistance() - 1e-6,
          `pass ${index} ${d === 0 ? 'entry' : 'exit'} only ${distanceToBox(prepared.box, frame.x, frame.z).toFixed(1)} m out`);
      }
      // It does cross the field.
      let inside = false;
      for (let d = 0; d <= pass.length && !inside; d += 8) {
        flockFrameAt(pass, profile, count, d, frame);
        inside = distanceToBox(prepared.box, frame.x, frame.z) === 0;
      }
      assert.ok(inside, `pass ${index} never crosses the field`);
    }
  }
  // Parked: far below every camera a field can hold.
  const birds = createBirds(prepareBirdFlight(town));
  try {
    birds.update(0, false, NO_CAMERAS);
    const mesh = flockMesh(birds.group);
    mesh.updateMatrixWorld(true);
    const centre = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    assert.equal(centre.y, BIRDS.parkY);
    const highestCamera = 200; // above any field's ground plus the arm
    assert.ok(Math.abs(BIRDS.parkY) - highestCamera > CAMERA.far + birdFlockRadius());
    assert.equal(mesh.visible, true, 'parked, never hidden: the warm pass uploads it');
    assert.equal(birds.report().active, false);
  } finally { birds.dispose(); }
});

test('(f) one clock: the same seconds give the same flock, a repeat does nothing, reduced motion parks', () => {
  const prepared = prepareBirdFlight(town);
  const [first, second] = birdSchedule(prepared, 2);
  assert.ok(first.startSeconds === BIRDS.quietStartSeconds, 'nothing flies in the quiet start');
  const gap = second.startSeconds - first.endSeconds;
  assert.ok(gap >= BIRDS.gapSeconds[0] && gap <= BIRDS.gapSeconds[1]);
  const birds = createBirds(prepared);
  try {
    const mesh = flockMesh(birds.group);
    const snapshot = (): number[] => [...mesh.matrix.elements, ...mesh.instanceMatrix.array];
    birds.update(1000, false, NO_CAMERAS); // the epoch: world second 0
    assert.equal(birds.report().clockSeconds, 0);
    assert.equal(birds.report().active, false);
    birds.update(1000 + BIRDS.quietStartSeconds - 0.5, false, NO_CAMERAS);
    assert.equal(birds.report().active, false, 'still quiet');
    const mid = 1000 + (first.startSeconds + first.endSeconds) / 2;
    birds.update(mid, false, NO_CAMERAS);
    const report = birds.report();
    assert.equal(report.active, true);
    assert.equal(report.passIndex, 0);
    assert.deepEqual(report.nextPass, { startSeconds: first.startSeconds, endSeconds: first.endSeconds });
    const at = snapshot(), version = mesh.instanceMatrix.version;
    birds.update(mid, false, NO_CAMERAS);
    assert.deepEqual(snapshot(), at, 'another pane drawing the same frame changes nothing');
    assert.equal(mesh.instanceMatrix.version, version, 'and uploads nothing');
    birds.update(mid + 0.5, false, NO_CAMERAS);
    assert.notDeepEqual(snapshot(), at, 'the clock moved it');
    birds.update(mid, false, NO_CAMERAS);
    assert.deepEqual(snapshot(), at, 'the same seconds give identical matrices');
    // A second flock from the same plan agrees exactly.
    const twin = createBirds(prepareBirdFlight(town));
    twin.update(1000, false, NO_CAMERAS);
    twin.update(mid, false, NO_CAMERAS);
    const twinMesh = flockMesh(twin.group);
    assert.deepEqual([...twinMesh.matrix.elements, ...twinMesh.instanceMatrix.array], at);
    twin.dispose();
    // Reduced motion parks at once, even at an unchanged clock, and that pass stays parked.
    birds.update(mid, true, NO_CAMERAS);
    assert.equal(birds.report().active, false);
    assert.equal(new THREE.Vector3().setFromMatrixPosition(mesh.matrix).y, BIRDS.parkY);
    birds.update(mid + 2, false, NO_CAMERAS);
    assert.equal(birds.report().active, false, 'never pops back in mid-sky');
    birds.update(1000 + (second.startSeconds + second.endSeconds) / 2, false, NO_CAMERAS);
    assert.equal(birds.report().active, true, 'the next pass flies');
    assert.equal(birds.report().passIndex, 1);
  } finally { birds.dispose(); }
});

test('(f) the camera guard defers a pass start while a view camera is near the entry, and an exit while near the exit', () => {
  const prepared = prepareBirdFlight(town);
  const [first] = birdSchedule(prepared, 1);
  const pass = fillBirdPass(prepared, 0, createBirdPass());
  const profile = new Float32Array(prepared.profileCapacity);
  const count = fillBirdProfile(prepared, pass, profile);
  const entry = flockFrameAt(pass, profile, count, 0, createFlockFrame());
  const exit = flockFrameAt(pass, profile, count, pass.length, createFlockFrame());
  const camera = { position: { x: entry.x, y: entry.y - 30, z: entry.z } };
  const clock = new BirdFlightClock(prepared), frame = createFlockFrame();
  assert.equal(clock.advance(0, false, [camera], frame), false);
  assert.equal(clock.advance(first.startSeconds + 1, false, [camera], frame), false, 'held back: somebody is out there');
  assert.equal(clock.advance(first.startSeconds + 20, false, [camera], frame), false);
  camera.position = { x: 0, y: 2, z: 0 };
  assert.equal(clock.advance(first.startSeconds + 21, false, [camera], frame), true);
  // One step (a metre a frame at most here: 14 m over the second since the last check) past the entry, not mid-sky.
  assert.ok(distanceToBox(prepared.box, frame.x, frame.z) >= birdEntryDistance() - BIRDS.speed - 1, 'it starts from the entry');
  // At the exit a camera out there keeps it flying on, past the exit, until it is clear.
  const late = first.endSeconds + 20 + 5;
  camera.position = { x: exit.x, y: exit.y, z: exit.z };
  assert.equal(clock.advance(late, false, [camera], frame), true, 'still flying beyond the exit');
  camera.position = { x: 0, y: 2, z: 0 };
  assert.equal(clock.advance(late + 1, false, [camera], frame), false, 'retired once clear');
  assert.equal(clock.pass.index, 1);
});

/** A three camera at (x, 3, z) looking level along yaw (forward (−sin, −cos)), its world matrix current. */
function levelCamera(x: number, z: number, yaw: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, CAMERA.far);
  camera.position.set(x, 3, z);
  camera.rotation.set(0, yaw, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/** A rider's camera riding a closed street loop at `pace`: position, heading and a world matrix, as the game's would be. */
function loopCamera(plan: LevelPlan, pace: number): { camera: THREE.PerspectiveCamera; step(dt: number): void } {
  const ring = plan.streetLoops?.find((loop) => loop.alternate.length === 0);
  assert.ok(ring, 'the town has a closed street loop');
  const spine = RouteSpine.fromTraversal(plan, ring.main.map((id) => ({ id, forward: true })), { closeWhenJoined: true });
  const sampler = new PlanTerrainSampler(plan), ground = createGroundSample(), at = createSpineSample();
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, CAMERA.far);
  let travelled = 0;
  const place = (): void => {
    spine.sample(travelled % spine.length, at);
    const hx = Math.sin(at.headingY), hz = Math.cos(at.headingY);
    const y = sampler.sampleGround(at.x, at.z, ground).height;
    camera.position.set(at.x - hx * 5, y + 2.4, at.z - hz * 5);
    camera.lookAt(at.x + hx * 20, y + 0.4, at.z + hz * 20);
    camera.updateMatrixWorld(true);
  };
  place();
  return { camera, step(dt) { travelled += pace * dt; place(); } };
}

test('(f) a pass is born beside its rider beyond every far plane, steers in while far, flies straight near him, never steps and retires out of sight', () => {
  const prepared = prepareBirdFlight(town);
  const extent = BIRDS.formationVerticalMetres + BIRDS.wanderMetres + BIRDS.bobMetres + BIRDS.wingspanMetres / 2;
  // Per 50 ms frame (birds critic r3, 2c): the altitude runs on at its vertical
  // speed (at most the emergency climb) and its speed changes by at most one
  // step's acceleration across a step; the pitch moves at most its slew.
  const frameClimb = BIRDS.climbEmergencyMetresPerSecond * 0.05
    + BIRDS.verticalAccelerationMetresPerSecondSquared * BIRDS.steerStepSeconds * BIRDS.steerStepSeconds;
  const framePitch = BIRDS.pitchSlewRadiansPerSecond * 0.05;
  assert.ok(frameClimb < 0.3 && framePitch < (2 * Math.PI) / 180, 'inside the critic\'s 0.3 m and 2° per frame');
  // Owner round 2: beyond `farRateToMetres` of every camera (beyond
  // `framedMetres`: no pane can frame it there) its own clock runs up to
  // `farRate` times faster, so the per-frame rules hold wherever a pane can
  // frame it — inside this, with a step's flight to spare — and beyond it the
  // same eased path only runs on faster: still continuous, at most this per frame.
  const watchedRange = BIRDS.farRateToMetres - 5;
  assert.ok(watchedRange >= BIRDS.framedMetres - 1e-9, 'every range a pane can frame it at flies at its own pace');
  const farStep = BIRDS.farRate * BIRDS.steerStepSeconds;
  const farClimb = BIRDS.climbEmergencyMetresPerSecond * BIRDS.farRate * 0.05 + BIRDS.verticalAccelerationMetresPerSecondSquared * farStep * farStep;
  for (const pace of [9, 14]) {
    const rider = loopCamera(town, pace), views = [rider.camera];
    const clock = new BirdFlightClock(prepared), frame = createFlockFrame();
    let pass = -1, born = 0, nearest = Infinity, committedHeading: number | null = null, retired = 0, checked = 0, timedOut = 0;
    let committedAt = -1, bankedAway = 0, maxRateChange = 0, maxClimb = 0, maxPitchStep = 0, retiredNear = 0;
    let relaid = 0, hidden = false, bankAwayAt = -1, flight = 0, straightFor = 0;
    /** Flown straight this long, s, a turn either way is a new turn. */
    const STRAIGHT_RESETS_SECONDS = 2;
    const forward = new THREE.Vector3();
    const previous = { pass: -1, tick: -2, roll: 0, heading: 0, rate: Number.NaN, sign: 0, y: 0, pitch: 0, watched: false };
    let farFrames = 0;
    const reversals = new Map<number, number>(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
    const last = { x: 0, y: 0, z: 0, inFrame: false, range: 0 };
    const sphere = new THREE.Sphere(new THREE.Vector3(), birdFlockRadius());
    for (let tick = 0, seconds = 0; seconds < 900 && retired < 4; tick += 1, seconds = tick * 0.05) {
      rider.step(0.05);
      const flying = clock.advance(seconds, false, views, frame);
      if (!flying) {
        previous.pass = -1;
        // Born again ahead of him (the birds critic r4: a pass he has not seen
        // never trails him and retires): it vanished out of his frame.
        if (pass >= 0 && clock.pass.index === pass && !hidden) {
          assert.ok(!last.inFrame || last.range >= birdGuardDistance(), `pace ${pace} pass ${pass}: re-laid in his frame ${last.range.toFixed(0)} m out`);
          hidden = true;
          relaid += 1;
        }
        if (pass >= 0 && clock.pass.index !== pass) {
          // Retired out of sight: beyond every far plane, or (R17) where his
          // pane cannot show it — never while it is in his frame.
          assert.ok(!last.inFrame || last.range >= birdGuardDistance(),
            `pace ${pace} pass ${pass}: retired in his frame ${last.range.toFixed(0)} m out`);
          if (last.range < birdGuardDistance()) retiredNear += 1;
          // After flying straight past its rider, or (a rider it never caught) after its approach.
          if (committedAt >= 0) {
            assert.ok(nearest <= BIRDS.framedMetres, `pace ${pace} pass ${pass}: closest ${nearest.toFixed(0)} m, never near enough to frame`);
            retired += 1;
          } else timedOut += 1;
          pass = -1;
        }
        continue;
      }
      const range = Math.hypot(frame.x - rider.camera.position.x, frame.z - rider.camera.position.z);
      if (clock.pass.index !== pass || hidden) {
        pass = clock.pass.index;
        hidden = false;
        flight += 1;
        born = seconds;
        nearest = Infinity;
        committedHeading = null;
        committedAt = -1;
        bankAwayAt = -1;
        assert.equal(clock.aimedView, 0, 'laid for the only view');
        // Born 540 m out; by the first frame it has flown at most one frame at its far rate.
        assert.ok(range >= birdEntryDistance() - (BIRDS.speed * BIRDS.farRate + pace) * 0.05 - 1,
          `pace ${pace} pass ${pass}: born ${range.toFixed(0)} m out`);
        assert.ok(Math.hypot(frame.x - rider.camera.position.x, frame.y - rider.camera.position.y, frame.z - rider.camera.position.z) >= birdGuardDistance(),
          `pace ${pace} pass ${pass}: first drawn ${range.toFixed(0)} m out, inside a far plane`);
      }
      nearest = Math.min(nearest, range);
      rider.camera.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(rider.camera.projectionMatrix, rider.camera.matrixWorldInverse));
      sphere.center.set(frame.x, frame.y, frame.z);
      last.inFrame = frustum.intersectsSphere(sphere);
      last.range = rider.camera.position.distanceTo(sphere.center);
      assert.ok(Math.abs(frame.pitch) <= BIRDS.pitchLimitRadians + 1e-9, `pace ${pace} pass ${pass}: pitch ${frame.pitch.toFixed(3)}`);
      // Nothing steps (birds critic r2): between consecutive frames the bank
      // moves at most its slew, and the turn rate at most its slew per step —
      // wherever a pane can frame it (owner round 2: beyond, the same eased
      // path runs on at up to `farRate` times its pace, continuous).
      const watched = last.range <= watchedRange;
      if (previous.pass === pass && previous.tick === tick - 1 && !(watched && previous.watched)) {
        farFrames += 1;
        assert.ok(Math.abs(frame.roll - previous.roll) <= BIRDS.bankSlewRadiansPerSecond * BIRDS.farRate * 0.05 + 1e-9,
          `pace ${pace} pass ${pass}: bank ${previous.roll.toFixed(3)} → ${frame.roll.toFixed(3)} in one frame, ${last.range.toFixed(0)} m out`);
        assert.ok(Math.abs(frame.y - previous.y) <= farClimb + 1e-9,
          `pace ${pace} pass ${pass}: altitude ${previous.y.toFixed(2)} → ${frame.y.toFixed(2)} m in one frame, ${last.range.toFixed(0)} m out`);
        assert.ok(Math.abs(frame.pitch - previous.pitch) <= framePitch * BIRDS.farRate + 1e-9);
        previous.rate = Number.NaN;
        previous.sign = 0;
      } else if (previous.pass === pass && previous.tick === tick - 1) {
        assert.ok(Math.abs(frame.roll - previous.roll) <= BIRDS.bankSlewRadiansPerSecond * 0.05 + 1e-9,
          `pace ${pace} pass ${pass}: bank ${previous.roll.toFixed(3)} → ${frame.roll.toFixed(3)} in one frame`);
        const climb = Math.abs(frame.y - previous.y), pitchStep = Math.abs(frame.pitch - previous.pitch);
        maxClimb = Math.max(maxClimb, climb);
        maxPitchStep = Math.max(maxPitchStep, pitchStep);
        assert.ok(climb <= frameClimb + 1e-9, `pace ${pace} pass ${pass}: altitude ${previous.y.toFixed(2)} → ${frame.y.toFixed(2)} m in one frame`);
        assert.ok(pitchStep <= framePitch + 1e-9, `pace ${pace} pass ${pass}: pitch ${previous.pitch.toFixed(3)} → ${frame.pitch.toFixed(3)} rad in one frame`);
        const rate = Math.atan2(Math.sin(frame.headingY - previous.heading), Math.cos(frame.headingY - previous.heading)) / 0.05;
        if (Number.isFinite(previous.rate)) {
          maxRateChange = Math.max(maxRateChange, Math.abs(rate - previous.rate));
          assert.ok(Math.abs(rate - previous.rate) <= BIRDS.turnSlewRadiansPerSecondSquared * BIRDS.steerStepSeconds + 1e-6,
            `pace ${pace} pass ${pass}: turn rate ${previous.rate.toFixed(3)} → ${rate.toFixed(3)} rad/s in one frame`);
        }
        // A turn-sign reversal while the flock is in his pane.
        const inPane = frustum.containsPoint(new THREE.Vector3(frame.x, frame.y, frame.z));
        // A turn under ≈ 0.7°/s leans the flock under 1°: no visible bank, no visible reversal.
        const sign = Math.abs(rate) < 0.0125 ? 0 : Math.sign(rate);
        // (Per flight: a pass born again ahead of him flies anew. A turn the
        // other way after flying straight a while — the bank-away after the
        // straight run — is a new turn, not a rocking flip.)
        straightFor = sign === 0 ? straightFor + 0.05 : 0;
        if (straightFor >= STRAIGHT_RESETS_SECONDS) previous.sign = 0;
        if (inPane && sign !== 0 && previous.sign !== 0 && sign !== previous.sign) reversals.set(flight, (reversals.get(flight) ?? 0) + 1);
        if (sign !== 0) previous.sign = sign;
        previous.rate = rate;
      } else { previous.rate = Number.NaN; previous.sign = 0; }
      previous.pass = pass; previous.tick = tick; previous.roll = frame.roll; previous.heading = frame.headingY;
      previous.y = frame.y; previous.pitch = frame.pitch; previous.watched = watched;
      // Near its rider it flies straight: once the turn has eased out (≤ 1.5 s), one heading and no bank for `lingerSeconds`; then it may bank away.
      if (clock.committed) {
        if (committedAt < 0) committedAt = seconds;
        const since = seconds - committedAt;
        if (since >= 1.5 && committedHeading === null) committedHeading = frame.headingY;
        if (committedHeading !== null && frame.headingY !== committedHeading) {
          // One heading and no bank until it banks away: after `lingerSeconds`,
          // or (the birds critic r4) closing on him within `bankAwayNearMetres`
          // once it has flown straight `lingerMinSeconds` — away, not to meet him.
          if (bankAwayAt < 0) {
            bankAwayAt = seconds;
            assert.ok(since >= BIRDS.lingerSeconds - 0.2 || (since >= BIRDS.lingerMinSeconds - 0.2 && range <= BIRDS.bankAwayNearMetres + 3),
              `pace ${pace} pass ${pass}: turned near the rider ${since.toFixed(1)} s after committing, ${range.toFixed(0)} m out`);
          }
          bankedAway += 1;
        } else if (since >= 1.5) assert.ok(frame.roll === 0, `pace ${pace} pass ${pass}: banked flying straight`);
        assert.ok(seconds >= born, 'monotonic');
      } else {
        // Not yet straight (the birds critic r4): never while his pane already shows it near.
        rider.camera.getWorldDirection(forward);
        const off = Math.acos(Math.max(-1, Math.min(1, ((frame.x - rider.camera.position.x) * forward.x + (frame.z - rider.camera.position.z) * forward.z)
          / (Math.max(range, 1e-6) * Math.hypot(forward.x, forward.z)))));
        const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(rider.camera.fov) / 2) * rider.camera.aspect);
        assert.ok(!(off <= halfWidth - 0.05 && range <= BIRDS.commitInViewMetres - 3), `pace ${pace} pass ${pass}: steering in his view ${range.toFixed(0)} m out`);
        assert.ok(Math.abs(frame.roll) <= BIRDS.bankLimitRadians + 1e-9);
      }
      // Over every steered metre it clears the skyline and the ground.
      for (const bird of birdPositions(prepared, frame, clock.worldSeconds)) {
        const sky = skylineAt(prepared, bird.x, bird.z);
        assert.ok(bird.y >= sky + BIRDS.clearanceMetres - extent, `pace ${pace} pass ${pass}: ${bird.y.toFixed(1)} m over a ${sky.toFixed(1)} m top`);
        assert.ok(bird.y >= groundAt(prepared, bird.x, bird.z) + BIRDS.terrainFloorMetres - extent);
        checked += 1;
      }
    }
    assert.ok(retired >= 3, `pace ${pace}: ${retired} passes flown past the rider in 15 min (${timedOut} never caught him)`);
    const mostReversals = Math.max(0, ...reversals.values());
    console.log(JSON.stringify({ bird: 'steered loop passes', pace, retired, timedOut, samplesBankingAway: bankedAway,
      maxTurnRateChangePerFrame: +maxRateChange.toFixed(4), maxAltitudeStepPerFrame: +maxClimb.toFixed(3),
      maxPitchStepPerFrameDegrees: +((maxPitchStep * 180) / Math.PI).toFixed(2), retiredInsideFarPlane: retiredNear,
      inPaneTurnReversals: [...reversals.values()], reLaid: relaid, framesBeyondWatchedRange: farFrames }));
    assert.ok(farFrames > 0, `pace ${pace}: no frame flew the far stretch`);
    assert.ok(retiredNear > 0, `pace ${pace}: no pass retired out of his view inside the far plane: the R17 rule never ran`);
    assert.ok(mostReversals <= 1, `pace ${pace}: ${mostReversals} turn reversals in his pane in one pass (≤ 1)`);
    assert.ok(checked > 5000, 'a vacuous clearance sweep proves nothing');
  }

  // A road walk follows the road it starts on, either way along it.
  const ring = town.streetLoops!.find((loop) => loop.alternate.length === 0)!;
  const spine = RouteSpine.fromTraversal(town, ring.main.map((id) => ({ id, forward: true })), { closeWhenJoined: true });
  const at = createSpineSample(), walk = { x: 0, z: 0, heading: 0 }, sample = createSpineSample();
  let onRoad = 0;
  for (let start = 0; start < spine.length; start += spine.length / 24) {
    spine.sample(start, at);
    walkRoad(prepared, at.x, at.z, at.headingY, 120, walk);
    let best = Infinity;
    for (let s = 0; s < spine.length; s += 2) {
      spine.sample(s, sample);
      best = Math.min(best, Math.hypot(sample.x - walk.x, sample.z - walk.z));
    }
    if (best <= 12) onRoad += 1;
  }
  assert.ok(onRoad >= 20, `a 120 m road walk ends on the town loop from ${onRoad} of 24 starts`);

  // The clock lays each pass for one view after another; with no heading (a
  // position alone, or a camera looking straight down) it keeps the field chord.
  const cameras = [levelCamera(0, 0, 0.4), levelCamera(220, -160, 2.1)];
  const clock = new BirdFlightClock(prepared), at2 = createFlockFrame();
  clock.advance(0, false, cameras, at2);
  assert.equal(clock.aimedView, null, 'nothing is laid before the pass starts');
  const views: (number | null)[] = [];
  let flown = -1;
  for (let seconds = 0; seconds < 1500 && views.length < 4; seconds += 0.5) {
    if (clock.advance(seconds, false, cameras, at2) && clock.pass.index !== flown) {
      flown = clock.pass.index;
      views.push(clock.aimedView);
    }
  }
  // The first pass goes to seat 0; each later one to the seat that has waited
  // longest for a flock (birds critic r4), so every couch seat gets its turn.
  assert.equal(views[0], 0, 'the first pass is seat 0\'s');
  assert.ok(views.length === 4 && views.includes(0) && views.includes(1), `every couch seat gets its turn (${views.join(', ')})`);
  const twin = new BirdFlightClock(prepared), twinFrame = createFlockFrame();
  const positionsOnly = cameras.map((camera) => ({ position: camera.position }));
  const [first] = birdSchedule(prepared, 1);
  twin.advance(0, false, positionsOnly, twinFrame);
  assert.equal(twin.advance((first.startSeconds + first.endSeconds) / 2, false, positionsOnly, twinFrame), true);
  assert.equal(twin.aimedView, null, 'no heading: the field chord');
  assert.deepEqual(twin.window(), { startSeconds: first.startSeconds, endSeconds: first.endSeconds });
  const down = new THREE.PerspectiveCamera();
  down.position.set(0, 50, 0);
  down.lookAt(0, 0, 0.001);
  down.updateMatrixWorld(true);
  const looking = new BirdFlightClock(prepared), lookingFrame = createFlockFrame();
  looking.advance(0, false, [down], lookingFrame);
  looking.advance(first.startSeconds + 1, false, [down], lookingFrame);
  assert.equal(looking.aimedView, null, 'a camera looking straight down lays nothing');
  // A pass no pane framed is followed by the short unseen gap, a framed one by the ordinary quiet.
  for (const framed of [false, true]) {
    const solo = new BirdFlightClock(prepared), soloFrame = createFlockFrame(), view = [cameras[0]];
    let started = -1, ended = -1, next = -1;
    for (let seconds = 0; seconds < 1500 && next < 0; seconds += 0.25) {
      const flying = solo.advance(seconds, false, view, soloFrame);
      if (flying && solo.pass.index === 0) {
        if (started < 0) started = seconds;
        if (framed) solo.noteFramed();
      } else if (!flying && started >= 0 && ended < 0) ended = seconds;
      if (flying && solo.pass.index === 1) next = seconds;
    }
    assert.ok(started >= 0 && ended > started && next > ended, `framed ${framed}: one pass flown, then the next`);
    const [low, high] = framed ? BIRDS.gapSeconds : BIRDS.unseenGapSeconds;
    assert.ok(next - ended >= low - 0.25 - 1e-9 && next - ended <= high + 0.25 + 1e-9, `framed ${framed}: a ${(next - ended).toFixed(2)} s quiet`);
  }
  // The same seconds and the same cameras give the same flock, at any frame rate.
  const a = new BirdFlightClock(prepared), b = new BirdFlightClock(prepared), fa = createFlockFrame(), fb = createFlockFrame();
  for (const seconds of [0, 50, 61.5, 90]) {
    assert.equal(a.advance(seconds, false, cameras, fa), b.advance(seconds, false, cameras, fb));
    assert.deepEqual(fa, fb);
  }
  // Checked every half second to 3 minutes (several passes, each retiring out
  // of sight): the same flying flag at every check, the same flock while it flies.
  const coarse = new BirdFlightClock(prepared), fine = new BirdFlightClock(prepared), fc = createFlockFrame(), ff = createFlockFrame();
  let fineSeconds = 0, compared = 0;
  for (let check = 0; check <= 360; check += 1) {
    const seconds = check * 0.5;
    for (; fineSeconds < seconds - 1e-9; fineSeconds += 1 / 60) fine.advance(fineSeconds, false, cameras, ff);
    const flyingFine = fine.advance(seconds, false, cameras, ff), flyingCoarse = coarse.advance(seconds, false, cameras, fc);
    assert.equal(flyingFine, flyingCoarse, `static cameras at ${seconds} s: 60 and 2 frames a second agree on whether it flies`);
    if (!flyingFine) continue;
    compared += 1;
    assert.ok(Math.hypot(fc.x - ff.x, fc.y - ff.y, fc.z - ff.z) < 1e-6 && Math.abs(fc.pitch - ff.pitch) < 1e-9 && Math.abs(fc.roll - ff.roll) < 1e-9,
      `static cameras at ${seconds} s: 60 and 2 frames a second fly the same flock`);
  }
  assert.ok(compared > 60, `a vacuous comparison proves nothing (${compared})`);
});

// ---------------------------------------------------------------------------
// (g) On-screen time, measured and pinned on the town (R13; the birds critic)
// ---------------------------------------------------------------------------

/** 1080p at the chase camera's field of view: pixels the wingspan spans at range r. */
function wingspanPixels(range: number, verticalFov: number): number {
  return (BIRDS.wingspanMetres / range) * (1080 / 2) / Math.tan(verticalFov / 2);
}

/** Smallest a flock may be on screen and still count as seen, px (PLANS §42.8 PF-17). */
const SEEN_PIXELS = 4;
/**
 * The haze: three's linear fog is a smoothstep from `fogNear` to `fogFar` on
 * view depth, so a bird with more than this share of its contrast fogged away
 * (beyond ≈ 320 m of depth) does not count as seen.
 */
const FOG_LIMIT = 0.6;
/** Visible samples this close in time are one sighting, s (a flock blinking behind a crown is still one sighting). */
const SIGHTING_MERGE_SECONDS = 3;
/** Sampling interval for visibility, s. */
const SAMPLE_SECONDS = 0.1;
/** Simulated minutes per ride. */
const MINUTES = 20;
/** "Ordinary riding": the route script held to this pace, m/s (≈ 20 mph). */
const ORDINARY_PACE = 9;
/** Fresh worlds, as if loaded every half minute of the ride's first fifteen: each its own clock and epoch. */
const LOAD_OFFSETS: readonly number[] = Array.from({ length: 31 }, (_, index) => index * 30);
/** A pass counts towards "seen" only once it has flown this long before the ride ends, s (the cut-off one is no miss). */
const PASS_COUNTS_AFTER_SECONDS = 40;
/** R13's promise to the owner: allow this long to see a flock, s ("4–5 minutes"). */
const FIRST_FLOCK_SECONDS = 300;
/**
 * Never constant, on the town: at most this many sightings a minute… (0.8
 * under R13, 0.9 after the critic repair, 2.2 after R17; owner round 2 asked
 * for twice as many passes: ≈ 3.1 measured, was ≈ 1.8.)
 */
const RARE_SIGHTINGS_PER_MINUTE = 4.5;
/** …and a flock on screen (any speck ≥ 4 px within the haze's 60 %) at most this share of the ride (0.1 before R17, 0.3 after; owner round 2, twice as often: ≈ 0.41 measured, was ≈ 0.22 — still absent over half the time). */
const RARE_VISIBLE_SHARE = 0.5;
/** A tree's crown is about this share of its height in radius (`PROP_SIZES.broadleafTree`: 2.45 m on 7.6 m). */
const CROWN_SHARE = 0.32;
/** The occluder's raster and ray step, m. */
const FINE_METRES = 2;

type Occluder = (x: number, z: number) => number;

/**
 * What a rider's eye meets, on a 2 m raster: the physics ground (terrain and
 * every solid's top), every building piece the prop owner emits (bodies, caps
 * and towers, `buildingSourceRecords`) as its turned footprint, and every tree
 * crown as a disc. Street furniture and people are left out (thin or low).
 */
function drawnOccluder(plan: LevelPlan): Occluder {
  const sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
  const tops = new Map<number, number>();
  const key = (c: number, r: number): number => (c + 50_000) * 100_000 + (r + 50_000);
  const stamp = (c: number, r: number, top: number): void => { tops.set(key(c, r), Math.max(tops.get(key(c, r)) ?? -Infinity, top)); };
  for (const prop of plan.props ?? []) {
    if (prop.kind === 'building') {
      const turn = prop.rotationY, scale = prop.scale;
      for (const piece of buildingSourceRecords(prop)) {
        const lx = piece.x * scale, lz = piece.z * scale;
        const cx = prop.position.x + lx * Math.cos(turn) + lz * Math.sin(turn);
        const cz = prop.position.z - lx * Math.sin(turn) + lz * Math.cos(turn);
        const yaw = turn + piece.yaw, hx = (piece.sx * scale) / 2, hz = (piece.sz * scale) / 2;
        const top = prop.position.y + scale * (piece.y + piece.sy), reach = Math.hypot(hx, hz) + FINE_METRES;
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        for (let c = Math.floor((cx - reach) / FINE_METRES); c <= Math.floor((cx + reach) / FINE_METRES); c += 1) {
          for (let r = Math.floor((cz - reach) / FINE_METRES); r <= Math.floor((cz + reach) / FINE_METRES); r += 1) {
            const dx = (c + 0.5) * FINE_METRES - cx, dz = (r + 0.5) * FINE_METRES - cz;
            if (Math.abs(dx * cos - dz * sin) <= hx + FINE_METRES / 2 && Math.abs(dx * sin + dz * cos) <= hz + FINE_METRES / 2) stamp(c, r, top);
          }
        }
      }
      continue;
    }
    if (prop.kind !== 'broadleafTree' && prop.kind !== 'treeCanopy' && prop.kind !== 'conifer') continue;
    const top = prop.position.y + PROP_VERTICAL_SPANS[prop.kind].top * prop.scale;
    const radius = CROWN_SHARE * PROP_VERTICAL_SPANS[prop.kind].top * prop.scale;
    for (let c = Math.floor((prop.position.x - radius) / FINE_METRES); c <= Math.floor((prop.position.x + radius) / FINE_METRES); c += 1) {
      for (let r = Math.floor((prop.position.z - radius) / FINE_METRES); r <= Math.floor((prop.position.z + radius) / FINE_METRES); r += 1) {
        if (Math.hypot((c + 0.5) * FINE_METRES - prop.position.x, (r + 0.5) * FINE_METRES - prop.position.z) <= radius) stamp(c, r, top);
      }
    }
  }
  return (x, z) => Math.max(sampler.sampleGround(x, z, sample).height,
    tops.get(key(Math.floor(x / FINE_METRES), Math.floor(z / FINE_METRES))) ?? -Infinity);
}

/** Does anything along the camera→bird ray stand above it? */
function occluded(height: Occluder, from: THREE.Vector3, to: { x: number; y: number; z: number }): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const steps = Math.ceil(Math.hypot(dx, dz) / FINE_METRES);
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps;
    if (height(from.x + dx * t, from.z + dz * t) > from.y + dy * t) return true;
  }
  return false;
}

/** A ride's chase-camera views every `SAMPLE_SECONDS`: position, look target and vertical field of view. */
interface Ride {
  readonly views: Float32Array;
  readonly meanSpeed: number;
}

const VIEW_FLOATS = 7;
/** Standing still this long sends the scripted rider back to the spawn, s. */
const STALL_SECONDS = 3;

/**
 * A route script on the player's own wheel, held to `pace`, ridden `MINUTES`
 * through `ChaseCamera` + `resolveChaseView`: the poses a rider's own camera
 * takes. A rider standing still for `STALL_SECONDS` (the brain stops short of
 * an open line's end, as on BelVar's segment walk, or sits out a crash) rides
 * again from the spawn, so the camera keeps riding.
 */
function chaseRide(plan: LevelPlan, script: 'follower' | 'evader', pace: number, loop: 'forward' | 'reverse' | null = null,
  minutes = MINUTES): Ride {
  // `loop`: the follower rides the town's closed street loop either way round,
  // as the birds critic's survey does, instead of the route.
  const ring = loop === null ? undefined : plan.streetLoops?.find((each) => each.alternate.length === 0);
  const ids = ring === undefined ? [] : loop === 'reverse' ? [...ring.main].reverse() : [...ring.main];
  const spine = ring !== undefined
    ? RouteSpine.fromTraversal(plan, ids.map((id) => ({ id, forward: loop !== 'reverse' })), { closeWhenJoined: true })
    : RouteSpine.fromPlan(plan)
      ?? RouteSpine.fromTraversal(plan, plan.segments.map((segment) => ({ id: segment.id, forward: true })), { closeWhenJoined: true });
  const sampler = new PlanTerrainSampler(plan);
  const field = buildRouteField(spine, plan, sampler);
  const course = script === 'evader' ? buildEvaderCourse(plan, sampler) : null;
  const outlaw = new ScriptedOutlaw(script, plan, sampler, spine, field, course, hazardsOnLine(plan, spine), plan.spawn);
  // The brain's ceiling is top speed × cutout share × this margin: hold it to the pace.
  const top = Math.sqrt(outlaw.brain.driveAcceleration / outlaw.brain.dragCoefficient);
  outlaw.brain.cutoutMarginShare = pace / (top * outlaw.brain.cutoutSpeedShare);
  const camera = new ChaseCamera(), state = createChaseCameraState(), view = createChaseCameraView();
  const input = { x: 0, y: 0, z: 0, headingY: 0, rollAngle: 0, speed: 0, groundY: 0, airborne: false, crashed: false };
  const fill = (): void => {
    const pose = outlaw.body.pose;
    input.x = pose.x; input.y = pose.y; input.z = pose.z; input.headingY = pose.headingY; input.rollAngle = pose.rollAngle;
    input.speed = pose.speed; input.groundY = pose.y - pose.airHeight; input.airborne = pose.airHeight > 0.05;
    input.crashed = outlaw.body.controller.crashed;
  };
  fill();
  camera.reset(input);
  const dt = 1 / SIMULATION.hz, sampleEvery = Math.round(SAMPLE_SECONDS / dt), steps = minutes * 60 * SIMULATION.hz;
  const views = new Float32Array((Math.floor(steps / sampleEvery) + 1) * VIEW_FLOATS);
  let written = 0, speed = 0, stalled = 0;
  for (let step = 0; step <= steps; step += 1) {
    if (step > 0) {
      outlaw.ride(dt, outlaw.think(dt));
      stalled = Math.abs(outlaw.body.pose.speed) < 0.5 ? stalled + dt : 0;
      if (stalled >= STALL_SECONDS || (!spine.closed && course === null && outlaw.brain.routeDistance >= spine.length - 20)) {
        stalled = 0;
        outlaw.body.controller.reset(plan.spawn);
        outlaw.body.controller.writePose(outlaw.body.pose);
        writeView(outlaw.body);
        outlaw.brain.place(outlaw.body.view, -1);
        fill();
        camera.reset(input);
      }
      fill();
      camera.step(dt, input);
    }
    if (step % sampleEvery !== 0) continue;
    camera.writeState(state);
    resolveChaseView(state, input, camera.tuning, view);
    views.set([view.positionX, view.positionY, view.positionZ, view.targetX, view.targetY, view.targetZ, view.fov], written * VIEW_FLOATS);
    written += 1;
    speed += Math.abs(input.speed);
  }
  return { views: views.subarray(0, written * VIEW_FLOATS), meanSpeed: speed / written };
}

interface OnScreen {
  /** Seconds from each fresh world's load to its first sighting (null: none in the rest of the ride). */
  readonly firstSeconds: readonly (number | null)[];
  readonly sightingsPerMinute: number;
  readonly secondsPerSighting: number;
  /** Share of riding time with a flock on screen. */
  readonly visibleShare: number;
  readonly passes: number;
  readonly seenPasses: number;
  readonly aimedPasses: number;
  /** Seconds from each load to the end of its first readable run of `READABLE_RUN_SECONDS` (null: none). */
  readonly firstReadableSeconds: readonly (number | null)[];
  /** Share of riding time with any bird inside a pane's frustum within the far plane (the critic's "in pane"). */
  readonly inPaneShare: number;
  /** Share of riding time with the flock readable (≥ `READABLE_PIXELS` model pixels at 720p). */
  readableShare: number;
  /** Passes (begun ≥ `PASS_COUNTS_AFTER_SECONDS` before the ride ends) with a readable run of `READABLE_RUN_SECONDS`, per watched minute (R17). */
  readonly readablePassesPerMinute: number;
  /** The longest unbroken stretch with a flock on screen, s (never constant). */
  readonly longestVisibleSeconds: number;
  /** The lowest any bird ever flew over whatever the drawn occluder stands under it, m (never landing). */
  readonly lowestBirdClearance: number;
  /** Passes aimed at the measured pane (begun ≥ `PASS_COUNTS_AFTER_SECONDS` before the end), and how many of them it read (birds critic r4). */
  readonly aimedHere: number;
  readonly aimedHereRead: number;
  /** Once a second while it reads: the lowest bird over the tallest top within 25 m of the flock, m (birds critic r4, "just above the roofline")… */
  readonly overTopAtReadable: readonly number[];
  /** …and whether the flock's centre sat in the top tenth of the frame. */
  readonly topTenthAtReadable: readonly boolean[];
}

/**
 * The birds critic's "readable": at least this many model pixels at 1280×720.
 * The critic's r4 bar is 40 px of its pixel pairs (20 px, r3, left nine birds
 * 2-px dots); the model reads about twice the pairs' median at 150–250 m, so
 * 80 model pixels is that bar (≈ 190 m on a solo pane, ≈ 150 m on a couch pane)…
 */
const READABLE_PIXELS = 80;
/** …for at least this long without a break, s (4 at the 20-px bar; the critic's r4 sighting is one capture at 40 px). */
const READABLE_RUN_SECONDS = 1;
/**
 * The pixels one bird owns at 720p, calibrated on the critic's own pixel pairs
 * (1.8 m flock, 720p, every ring ride): ≈ 1.76 × (wingspan pixels − 2.85),
 * faded by the fog. It matches the critic's upper-quartile counts (clear,
 * whole-flock frames) at 140–240 m; partly hidden flocks count bird by bird.
 */
function birdPixels720(range: number, verticalFov: number, fogShare: number): number {
  const span = (BIRDS.wingspanMetres / range) * 360 / Math.tan(verticalFov / 2);
  return 1.76 * Math.max(0, span - 2.85) * (1 - fogShare);
}

/**
 * Every fresh world's flock clock (`LOAD_OFFSETS`) over one ride, each fed a
 * real three camera at the ride's view (so a pass is aimed across its world
 * matrix and retires out of its frustum, as in the game). A flock is seen when
 * any bird is inside the 16:9 frustum, within the far plane, at least
 * `SEEN_PIXELS` across at 1080p, with no more than `FOG_LIMIT` of it fogged,
 * and unoccluded by `drawnOccluder`. `aim: false` feeds the clock the camera's
 * position alone: the r1 field chords, the pins' negative control.
 * `couchLagSamples` > 0 adds a second seat riding the same line that many
 * samples behind (the birds critic's couch: 80 m back), both fed to the
 * clock as the couch's two view cameras; `pane` picks whose screen is
 * measured.
 */
function onScreen(plan: LevelPlan, ride: Ride, aim = true, loads: readonly number[] = LOAD_OFFSETS,
  couchLagSamples = 0, pane = 0): OnScreen {
  const prepared = prepareBirdFlight(plan);
  assert.equal(prepared.eligible, true);
  const height = drawnOccluder(plan);
  // A couch's panes are side by side (640×720 on the critic's 1280×720), each
  // camera widened by the split's field-of-view gain (`Renderer.splitFieldOfView`).
  const couch = couchLagSamples > 0;
  const cameras = Array.from({ length: couch ? 2 : 1 },
    () => new THREE.PerspectiveCamera(65, couch ? 640 / 720 : 16 / 9, 0.1, CAMERA.far));
  const views: readonly PositionedLike[] = cameras.map((camera) => (aim ? camera : { position: camera.position }));
  const camera = cameras[pane];
  // What a pane's frustum culling tests (the flock's bounding sphere), for the mesh's `onBeforeRender`.
  const frustums = cameras.map(() => new THREE.Frustum()), viewProjection = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), birdFlockRadius());
  const rideSeconds = (ride.views.length / VIEW_FLOATS) * SAMPLE_SECONDS;
  const clocks = loads.map((load) => ({ load, clock: new BirdFlightClock(prepared), frame: createFlockFrame(),
    first: null as number | null, last: -Infinity, sightings: 0, visibleSeconds: 0,
    passes: new Set<number>(), seen: new Set<number>(), aimed: new Set<number>(), readablePasses: new Set<number>(),
    run: 0, firstReadable: null as number | null, inPaneSeconds: 0, readableSeconds: 0, visibleRun: 0, longestVisible: 0,
    lowest: Infinity, aimedHere: new Set<number>(), aimedHereRead: new Set<number>(), probedAt: -Infinity }));
  const overTopAtReadable: number[] = [], topTenthAtReadable: boolean[] = [];
  const local = new THREE.Vector3();
  const fog = (depth: number): number => {
    const t = Math.min(1, Math.max(0, (depth - LIGHTING.fogNear) / (LIGHTING.fogFar - LIGHTING.fogNear)));
    return t * t * (3 - 2 * t);
  };
  const samples = ride.views.length / VIEW_FLOATS;
  for (let sample = 0; sample < samples; sample += 1) {
    const seconds = sample * SAMPLE_SECONDS;
    for (const [index, each] of cameras.entries()) {
      const at = Math.max(0, sample - (index === 1 ? couchLagSamples : 0)) * VIEW_FLOATS;
      each.fov = THREE.MathUtils.radToDeg(couch ? Math.min(CAMERA.splitFovCap, ride.views[at + 6] * CAMERA.splitFovGain) : ride.views[at + 6]);
      each.updateProjectionMatrix();
      each.position.set(ride.views[at], ride.views[at + 1], ride.views[at + 2]);
      each.lookAt(ride.views[at + 3], ride.views[at + 4], ride.views[at + 5]);
      each.updateMatrixWorld(true);
      viewProjection.multiplyMatrices(each.projectionMatrix, each.matrixWorldInverse);
      frustums[index].setFromProjectionMatrix(viewProjection);
    }
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const tanV = Math.tan(verticalFov / 2), tanH = tanV * camera.aspect;
    for (const tally of clocks) {
      if (seconds < tally.load) continue;
      if (!tally.clock.advance(seconds, false, views, tally.frame)) { tally.run = 0; tally.visibleRun = 0; continue; }
      // The game's mesh notes a pass framed when any pane draws it within `framedMetres` (birds.ts).
      sphere.center.set(tally.frame.x, tally.frame.y, tally.frame.z);
      for (const [index, each] of cameras.entries()) {
        if (frustums[index].intersectsSphere(sphere) && each.position.distanceTo(sphere.center) <= BIRDS.framedMetres) tally.clock.noteFramed();
      }
      const counts = seconds < rideSeconds - PASS_COUNTS_AFTER_SECONDS;
      if (counts) {
        tally.passes.add(tally.clock.pass.index);
        if (tally.clock.aimedView !== null) tally.aimed.add(tally.clock.pass.index);
        if (tally.clock.aimedView === pane) tally.aimedHere.add(tally.clock.pass.index);
      }
      let seen = false, inPane = false, pixels = 0, screenY = 0, inFrame = 0;
      const birds = birdPositions(prepared, tally.frame, tally.clock.worldSeconds);
      for (const bird of birds) {
        tally.lowest = Math.min(tally.lowest, bird.y - height(bird.x, bird.z));
        local.set(bird.x, bird.y, bird.z).applyMatrix4(camera.matrixWorldInverse);
        const depth = -local.z;
        if (depth <= 0 || Math.abs(local.x / depth) > tanH || Math.abs(local.y / depth) > tanV) continue;
        const range = local.length();
        if (range > CAMERA.far) continue;
        inPane = true;
        screenY += (1 - local.y / depth / tanV) / 2;
        inFrame += 1;
        const near = wingspanPixels(range, verticalFov) >= SEEN_PIXELS && fog(depth) <= FOG_LIMIT;
        if (!near || occluded(height, camera.position, bird)) continue;
        seen = true;
        pixels += birdPixels720(range, verticalFov, fog(depth));
      }
      if (inPane) tally.inPaneSeconds += SAMPLE_SECONDS;
      if (pixels >= READABLE_PIXELS) {
        if (counts) tally.aimedHereRead.add(tally.clock.pass.index);
        // The critic's roofline probe, once a second: the lowest bird over the
        // tallest top within 25 m of the flock (a 5 m grid), and the flock's
        // centre in the top tenth of the frame.
        if (seconds - tally.probedAt >= 1 - 1e-9) {
          tally.probedAt = seconds;
          let top = -Infinity;
          for (let dx = -25; dx <= 25; dx += 5) {
            for (let dz = -25; dz <= 25; dz += 5) if (Math.hypot(dx, dz) <= 25) top = Math.max(top, height(tally.frame.x + dx, tally.frame.z + dz));
          }
          overTopAtReadable.push(Math.min(...birds.map((bird) => bird.y)) - top);
          topTenthAtReadable.push(screenY / inFrame < 0.1);
        }
        tally.readableSeconds += SAMPLE_SECONDS;
        tally.run += SAMPLE_SECONDS;
        if (tally.run >= READABLE_RUN_SECONDS - 1e-9) {
          tally.firstReadable ??= seconds - tally.load;
          if (counts) tally.readablePasses.add(tally.clock.pass.index);
        }
      } else tally.run = 0;
      if (!seen) { tally.visibleRun = 0; continue; }
      tally.visibleRun += SAMPLE_SECONDS;
      tally.longestVisible = Math.max(tally.longestVisible, tally.visibleRun);
      tally.visibleSeconds += SAMPLE_SECONDS;
      tally.seen.add(tally.clock.pass.index);
      if (seconds - tally.last > SIGHTING_MERGE_SECONDS) {
        tally.sightings += 1;
        tally.first ??= seconds - tally.load;
      }
      tally.last = seconds;
    }
  }
  const minutes = clocks.reduce((sum, tally) => sum + (samples * SAMPLE_SECONDS - tally.load) / 60, 0);
  const counted = clocks.reduce((sum, tally) => sum + Math.max(0, rideSeconds - PASS_COUNTS_AFTER_SECONDS - tally.load) / 60, 0);
  const sightings = clocks.reduce((sum, tally) => sum + tally.sightings, 0);
  const visible = clocks.reduce((sum, tally) => sum + tally.visibleSeconds, 0);
  return {
    firstSeconds: clocks.map((tally) => tally.first),
    sightingsPerMinute: sightings / minutes,
    secondsPerSighting: sightings > 0 ? visible / sightings : 0,
    visibleShare: visible / (minutes * 60),
    passes: clocks.reduce((sum, tally) => sum + tally.passes.size, 0),
    seenPasses: clocks.reduce((sum, tally) => sum + tally.seen.size, 0),
    aimedPasses: clocks.reduce((sum, tally) => sum + tally.aimed.size, 0),
    firstReadableSeconds: clocks.map((tally) => tally.firstReadable),
    inPaneShare: clocks.reduce((sum, tally) => sum + tally.inPaneSeconds, 0) / (minutes * 60),
    readableShare: clocks.reduce((sum, tally) => sum + tally.readableSeconds, 0) / (minutes * 60),
    readablePassesPerMinute: clocks.reduce((sum, tally) => sum + tally.readablePasses.size, 0) / counted,
    longestVisibleSeconds: Math.max(0, ...clocks.map((tally) => tally.longestVisible)),
    lowestBirdClearance: Math.min(...clocks.map((tally) => tally.lowest)),
    // A pass "aimed here" counts once it has ended (a later pass flew) and began early enough.
    aimedHere: clocks.reduce((sum, tally) => sum + [...tally.aimedHere].filter((index) => tally.passes.has(index + 1)).length, 0),
    aimedHereRead: clocks.reduce((sum, tally) => sum + [...tally.aimedHere].filter((index) => tally.passes.has(index + 1)
      && tally.aimedHereRead.has(index)).length, 0),
    overTopAtReadable,
    topTenthAtReadable,
  };
}

test('(g) R13: on the town at ordinary riding a flock is seen within five minutes of any load, and it stays rare', () => {
  const rides = [['euc', town, 'follower'], ['euc', town, 'evader'], ['BelVar', createTrackLevel(), 'follower'],
    ['Switchback', createSwitchbackLevel(), 'follower']] as const;
  for (const [name, source, script] of rides) {
    const plan = preparePopulationWorld(source).level;
    const ride = chaseRide(plan, script, ORDINARY_PACE);
    const figures = onScreen(plan, ride);
    const firsts = figures.firstSeconds.map((first) => (first === null ? null : Math.round(first)));
    const ordered = figures.firstSeconds.map((first) => first ?? Infinity).sort((a, b) => a - b);
    console.log(JSON.stringify({ bird: 'on-screen', world: name, script, minutes: MINUTES, meanSpeed: +ride.meanSpeed.toFixed(1),
      loads: LOAD_OFFSETS.length, within5Minutes: `${figures.firstSeconds.filter((first) => first !== null && first <= FIRST_FLOCK_SECONDS).length}/${LOAD_OFFSETS.length}`,
      firstSightingSeconds: firsts, medianFirstSeconds: Math.round(ordered[Math.floor(ordered.length / 2)]),
      worstFirstSeconds: Math.round(ordered.at(-1)!), sightingsPerMinute: +figures.sightingsPerMinute.toFixed(2),
      secondsPerSighting: +figures.secondsPerSighting.toFixed(1), visibleShare: +figures.visibleShare.toFixed(3),
      readablePassesPerMinute: +figures.readablePassesPerMinute.toFixed(2), longestVisibleSeconds: +figures.longestVisibleSeconds.toFixed(1),
      passesSeen: `${figures.seenPasses}/${figures.passes}` }));
    // The instrument ran, and every pass the rider's camera met was laid across it.
    assert.ok(Math.abs(ride.meanSpeed - ORDINARY_PACE) < ORDINARY_PACE * 0.5, `${name}: ordinary riding (${ride.meanSpeed.toFixed(1)} m/s)`);
    assert.equal(figures.aimedPasses, figures.passes, `${name}: every pass aimed across the view`);
    if (name !== 'euc') continue;
    if (script === 'follower') {
      // The negative control: the same ride with the r1 field chords misses
      // the promise from some loads, so the pin below can fail.
      const control = onScreen(plan, ride, false);
      const late = control.firstSeconds.filter((first) => first === null || first > FIRST_FLOCK_SECONDS).length;
      console.log(JSON.stringify({ bird: 'on-screen control (r1 field chords)', world: name, script,
        within5Minutes: `${LOAD_OFFSETS.length - late}/${LOAD_OFFSETS.length}`, sightingsPerMinute: +control.sightingsPerMinute.toFixed(2) }));
      assert.ok(late > 0, 'the r1 field chords miss five minutes from some load: the instrument can fail');
    }
    // R13, pinned on the town: from any of the thirty-one loads a flock is on
    // screen within the promised five minutes…
    for (const [index, first] of figures.firstSeconds.entries()) {
      assert.ok(first !== null && first <= FIRST_FLOCK_SECONDS,
        `euc ${script}, loaded at ${LOAD_OFFSETS[index]} s: first flock ${first === null ? 'never' : `${first.toFixed(0)} s`} after load`);
    }
    // …and it stays rare, never constant.
    assert.ok(figures.sightingsPerMinute <= RARE_SIGHTINGS_PER_MINUTE, `euc ${script}: ${figures.sightingsPerMinute.toFixed(2)} sightings a minute`);
    assert.ok(figures.visibleShare <= RARE_VISIBLE_SHARE, `euc ${script}: on screen ${(figures.visibleShare * 100).toFixed(1)} % of the ride`);
  }
});

/** The critic's survey: the town's closed loop, both ways round, held to these paces, m/s. */
const RING_PACES: readonly number[] = [9, 11, 14];
/** Minutes per loop ride; loads every 30 s over its first 7.5 minutes, each watched for 4.5 minutes and more. */
const RING_MINUTES = 12;
const RING_LOADS: readonly number[] = Array.from({ length: 16 }, (_, index) => index * 30);
/**
 * R17 (the owner rode and never saw a flock), then owner round 2 ("whatever
 * the frequency is now, half it": twice as often, the first about twice as
 * early): on every loop ride the median load reads a flock for
 * `READABLE_RUN_SECONDS` within this, s (90 under R17, when 33–53 was measured)…
 */
const R17_FIRST_MEDIAN_SECONDS = 45;
/** …the median load over all six solo loop rides within this, s (≈ 40 measured before round 2)… */
const R17_FIRST_MEDIAN_ALL_SECONDS = 25;
/** …and this share of all the loop rides' loads within `R17_FIRST_WITHIN_SECONDS` (0.75 within 120 s under R17)… */
const R17_FIRST_SHARE = 0.85;
const R17_FIRST_WITHIN_SECONDS = 60;
/** …a readable pass (a run of `READABLE_RUN_SECONDS`) at least this often on every solo ride, per minute (0.5 under R17)… */
const R17_READABLE_PASSES_PER_MINUTE = 1.4;
/** …on each couch pane, whose seats take turns (0.5 under R17; ≈ 0.6–0.7 measured before round 2)… */
const R17_COUCH_READABLE_PASSES_PER_MINUTE = 0.9;
/** …and over the six solo rides on average at least this: about twice the ≈ 0.87 measured before round 2… */
const R17_SOLO_READABLE_PASSES_PER_MINUTE = 1.6;
/** …still absent over half the time: seen at most this share of any ride (0.3 under R17, ≈ 0.18–0.23 measured then)… */
const R17_VISIBLE_SHARE = 0.5;
/** …and never constant: no unbroken sighting longer than this, s. */
const R17_LONGEST_VISIBLE_SECONDS = 40;
/** No bird ever flies lower than this over whatever stands under it, m (lower, R17, but never landing; the birds critic r4 asks ≥ 5 m of its raycasts, which read ≈ 1 m more than this raster). */
const R17_LOWEST_BIRD_METRES = 4;
/** The birds critic r4: every pass aimed at a pane is read in that pane (this share of them, at least)… */
const R4_AIMED_READ_SHARE = 0.9;
/**
 * …and, while it reads, it flies lower than R17 did: its lowest bird over the
 * tallest top within 25 m at most this at the median, m, and within 12 m at
 * least this share of the time; its centre in the top tenth of the frame at
 * most this share. A regression guard on this raster, not the critic's bar
 * (≥ 60 %, ≤ 15 m, ≤ 10 %): here ≈ 41 %, 14 m, 12 %; the critic's own
 * raycast probe in the game read 27 %, 16.9 m, 18 % after the r4 repair
 * (16 %, 32.6 m, 28 % before).
 */
const R4_OVER_TOP_MEDIAN_METRES = 15;
const R4_WITHIN_12_SHARE = 0.4;
const R4_TOP_TENTH_SHARE = 0.15;
/** The couch's second seat rides the same loop this far behind the first, m (the birds critic's couch survey). */
const COUCH_BEHIND_METRES = 80;

test('(g) R17 + owner round 2: riding the town loop at 9, 11 and 14 m/s either way, solo and on both couch panes, a readable flock comes within about 20 s and about every half minute (twice as often), and is still absent over half the time', () => {
  const plan = preparePopulationWorld(town).level;
  const median = (list: readonly (number | null)[]): number => {
    const ordered = list.map((first) => first ?? Infinity).sort((a, b) => a - b);
    return ordered[Math.floor((ordered.length - 1) / 2)];
  };
  const pin = (label: string, figures: OnScreen, readablePerMinute = R17_READABLE_PASSES_PER_MINUTE): void => {
    assert.ok(median(figures.firstReadableSeconds) <= R17_FIRST_MEDIAN_SECONDS,
      `${label}: the median load reads a flock ${median(figures.firstReadableSeconds).toFixed(0)} s in`);
    assert.ok(figures.readablePassesPerMinute >= readablePerMinute,
      `${label}: ${figures.readablePassesPerMinute.toFixed(2)} readable passes a minute`);
    assert.ok(figures.visibleShare <= R17_VISIBLE_SHARE, `${label}: on screen ${(figures.visibleShare * 100).toFixed(1)} % of the ride`);
    assert.ok(figures.longestVisibleSeconds <= R17_LONGEST_VISIBLE_SECONDS, `${label}: on screen ${figures.longestVisibleSeconds.toFixed(1)} s without a break`);
    assert.equal(figures.aimedPasses, figures.passes, `${label}: every pass steered for a rider`);
    assert.ok(figures.lowestBirdClearance >= R17_LOWEST_BIRD_METRES, `${label}: a bird ${figures.lowestBirdClearance.toFixed(1)} m over a roof, crown or the ground`);
    assert.ok(figures.aimedHere > 0 && figures.aimedHereRead / figures.aimedHere >= R4_AIMED_READ_SHARE,
      `${label}: ${figures.aimedHereRead} of ${figures.aimedHere} passes aimed at this pane read in it`);
  };
  const overTop: number[] = [], topTenth: boolean[] = [];
  const report = (label: string, ride: Ride, figures: OnScreen, control: OnScreen | null): void => {
    console.log(JSON.stringify({ bird: 'R17 loop', ride: label, meanSpeed: +ride.meanSpeed.toFixed(1),
      firstReadable: figures.firstReadableSeconds.map((first) => (first === null ? null : Math.round(first))),
      medianFirstReadable: Math.round(median(figures.firstReadableSeconds)),
      within60: `${figures.firstReadableSeconds.filter((first) => first !== null && first <= R17_FIRST_WITHIN_SECONDS).length}/${RING_LOADS.length}`,
      readablePassesPerMinute: +figures.readablePassesPerMinute.toFixed(2), visibleShare: +figures.visibleShare.toFixed(3),
      readableShare: +figures.readableShare.toFixed(3), inPaneShare: +figures.inPaneShare.toFixed(3),
      longestVisibleSeconds: +figures.longestVisibleSeconds.toFixed(1), sightingsPerMinute: +figures.sightingsPerMinute.toFixed(2),
      lowestBirdClearance: +figures.lowestBirdClearance.toFixed(1), aimedHereRead: `${figures.aimedHereRead}/${figures.aimedHere}`,
      ...(control === null ? {} : { controlReadablePassesPerMinute: +control.readablePassesPerMinute.toFixed(2),
        controlMedianFirstReadable: Math.round(median(control.firstReadableSeconds)) }) }));
  };
  let within = 0, loads = 0, steered = 0, fields = 0;
  const soloFirsts: (number | null)[] = [];
  for (const pace of RING_PACES) {
    for (const loop of ['forward', 'reverse'] as const) {
      const ride = chaseRide(plan, 'follower', pace, loop, RING_MINUTES);
      const figures = onScreen(plan, ride, true, RING_LOADS);
      const control = onScreen(plan, ride, false, RING_LOADS);
      report(`${pace} m/s ${loop}`, ride, figures, control);
      assert.ok(Math.abs(ride.meanSpeed - pace) < pace * 0.35, `${pace} m/s ${loop}: held pace (${ride.meanSpeed.toFixed(1)} m/s)`);
      pin(`${pace} m/s ${loop}`, figures);
      overTop.push(...figures.overTopAtReadable);
      topTenth.push(...figures.topTenthAtReadable);
      within += figures.firstReadableSeconds.filter((first) => first !== null && first <= R17_FIRST_WITHIN_SECONDS).length;
      loads += RING_LOADS.length;
      steered += figures.readablePassesPerMinute;
      fields += control.readablePassesPerMinute;
      soloFirsts.push(...figures.firstReadableSeconds);
    }
  }
  console.log(JSON.stringify({ bird: 'R17 loop summary', within60: +(within / loads).toFixed(2),
    medianFirstReadable: Math.round(median(soloFirsts)), readablePassesPerMinute: +(steered / 6).toFixed(2),
    controlReadablePassesPerMinute: +(fields / 6).toFixed(2) }));
  assert.ok(within / loads >= R17_FIRST_SHARE, `a readable flock within ${R17_FIRST_WITHIN_SECONDS} s of ${((100 * within) / loads).toFixed(0)} % of loads`);
  // Owner round 2: the first readable flock about twice as early, and twice as many readable passes.
  assert.ok(median(soloFirsts) <= R17_FIRST_MEDIAN_ALL_SECONDS, `the median load reads a flock ${median(soloFirsts).toFixed(0)} s in`);
  assert.ok(steered / 6 >= R17_SOLO_READABLE_PASSES_PER_MINUTE, `${(steered / 6).toFixed(2)} readable passes a minute over the solo rides`);
  // The negative control (field chords, no rider to steer for) falls well short: the pins can fail.
  assert.ok(fields <= steered / 2, `field chords reach ${(fields / 6).toFixed(2)} readable passes a minute`);

  // The couch: seat 1 rides the loop 80 m behind seat 0; passes take turns
  // aiming at each seat, so each pane is pinned as solo is, at about half the solo rate of readable passes.
  const ride = chaseRide(plan, 'follower', RING_PACES[0], 'forward', RING_MINUTES);
  const lag = Math.round(COUCH_BEHIND_METRES / ride.meanSpeed / SAMPLE_SECONDS);
  const paneOne = onScreen(plan, ride, true, RING_LOADS, lag, 1);
  const paneZero = onScreen(plan, ride, true, RING_LOADS, lag, 0);
  report(`couch ${RING_PACES[0]} m/s, pane 1`, ride, paneOne, null);
  report(`couch ${RING_PACES[0]} m/s, pane 0`, ride, paneZero, null);
  pin('couch pane 1', paneOne, R17_COUCH_READABLE_PASSES_PER_MINUTE);
  pin('couch pane 0', paneZero, R17_COUCH_READABLE_PASSES_PER_MINUTE);

  // Just above the roofline while it reads (the birds critic r4, item 2), over every loop ride.
  overTop.push(...paneOne.overTopAtReadable, ...paneZero.overTopAtReadable);
  topTenth.push(...paneOne.topTenthAtReadable, ...paneZero.topTenthAtReadable);
  const ordered = [...overTop].sort((a, b) => a - b), at = (share: number): number => ordered[Math.floor(share * (ordered.length - 1))];
  const within12 = overTop.filter((metres) => metres <= 12).length / overTop.length;
  const tenth = topTenth.filter(Boolean).length / topTenth.length;
  console.log(JSON.stringify({ bird: 'R4 roofline', probes: overTop.length,
    lowestOverTop25: [0.1, 0.25, 0.5, 0.75, 0.9].map((share) => +at(share).toFixed(1)), within12m: +within12.toFixed(2), topTenth: +tenth.toFixed(2) }));
  assert.ok(overTop.length > 500, 'a vacuous roofline probe proves nothing');
  assert.ok(at(0.5) <= R4_OVER_TOP_MEDIAN_METRES, `the lowest bird ${at(0.5).toFixed(1)} m over the tallest top within 25 m at the median`);
  assert.ok(within12 >= R4_WITHIN_12_SHARE, `within 12 m of the roofline ${(within12 * 100).toFixed(0)} % of the time`);
  assert.ok(tenth <= R4_TOP_TENTH_SHARE, `in the top tenth of the frame ${(tenth * 100).toFixed(0)} % of the time`);
});
