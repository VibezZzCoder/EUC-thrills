/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import { BARKS, CAMERA, POPULATION_AUTHORING } from '../data/tuning.ts';
import {
  ChaseCamera,
  createChaseCameraState,
  createChaseCameraView,
  resolveChaseView,
  type ChaseCameraInput,
} from '../render/chaseCamera.ts';
import { PEDESTRIAN_FIGURE, pedestrianStatureMetres } from '../render/populationView.ts';
import {
  BarkView,
  DISPLAY_BAND,
  START_BAND,
  anchorDropMetres,
  bubbleHidden,
  candidateHidden,
  inBand,
  ndcToPane,
  type SightBody,
} from './barkView.ts';

/**
 * The plan review's blocker, proved headlessly: with the shipped chase camera
 * (its own easing, the shipped field of view and the split widening) a pass
 * that qualifies stays readable — at least `minimumReadableSeconds` (2.5 s
 * since owner round 2; 1.2 s before) inside the display band, up to the pass
 * speed cap and the side limit — solo and in a two-pane split, and the people a bark would be unreadable for
 * (beside the shoulder, behind it, between the camera and the rider) never
 * qualify. The measured times are printed for the owner's report.
 */

const STEP = 1 / 120;
const ANCHOR_HEIGHT = POPULATION_AUTHORING.actorHeightMetres + BARKS.anchorLiftMetres;

/** The game's camera for one pane: `Game.placeCamera`'s chase branch, headless. */
class PaneCamera {
  readonly chase = new ChaseCamera();
  readonly state = createChaseCameraState();
  readonly view = createChaseCameraView();
  readonly camera: PerspectiveCamera;
  readonly input: ChaseCameraInput = {
    x: 0, y: 0, z: 0, headingY: 0, rollAngle: 0, speed: 0, groundY: 0, airborne: false, crashed: false,
  };
  private readonly split: boolean;

  constructor(width: number, height: number, split: boolean) {
    this.camera = new PerspectiveCamera(65, width / height, 0.1, 500);
    this.split = split;
  }

  ride(x: number, z: number, headingY: number, speed: number): void {
    const input = this.input;
    input.x = x;
    input.z = z;
    input.headingY = headingY;
    input.speed = speed;
    this.chase.step(STEP, input);
  }

  reset(x: number, z: number, headingY: number, speed: number): void {
    this.input.x = x;
    this.input.z = z;
    this.input.headingY = headingY;
    this.input.speed = speed;
    this.chase.reset(this.input);
  }

  /** Place the three camera as `Game.placeCamera` and `Renderer.setFieldOfView` do. */
  place(): PerspectiveCamera {
    this.chase.writeState(this.state);
    resolveChaseView(this.state, this.input, this.chase.tuning, this.view);
    const camera = this.camera;
    const view = this.view;
    camera.position.set(view.positionX, view.positionY, view.positionZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(view.targetX, view.targetY, view.targetZ);
    if (view.roll !== 0) camera.rotateZ(-view.roll);
    const fov = this.split ? Math.min(CAMERA.splitFovCap, view.fov * CAMERA.splitFovGain) : view.fov;
    camera.fov = (fov * 180) / Math.PI;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }
}

interface PassResult {
  qualified: boolean;
  /** Seconds the anchor stayed inside the display band after qualifying. */
  visibleSeconds: number;
  /** Metres ahead of the rider when it qualified. */
  aheadAtQualify: number;
}

/** A straight pass at `speed` by a still person `side` metres off the line. */
function straightPass(speed: number, side: number, width: number, height: number, split: boolean): PassResult {
  const pane = new PaneCamera(width, height, split);
  const barkView = new BarkView();
  const personZ = 60;
  const anchor = { x: side, y: ANCHOR_HEIGHT, z: personZ };
  const relative = { x: 0, y: 0, z: -speed };
  let z = 0;
  pane.reset(0, z, 0, speed);
  // Settle the arm and the field of view at this speed before the person is near.
  for (let i = 0; i < 600; i += 1) pane.ride(0, z, 0, speed);
  let qualifiedAt = -1;
  let aheadAtQualify = Number.NaN;
  let time = 0;
  let visibleSeconds = 0;
  // Frames at 60 Hz, two fixed steps each.
  while (z < personZ + 10) {
    for (let s = 0; s < 2; s += 1) {
      z += speed * STEP;
      pane.ride(0, z, 0, speed);
    }
    time += 2 * STEP;
    const camera = pane.place();
    const ahead = personZ - z;
    if (qualifiedAt < 0) {
      const inBox = ahead >= BARKS.passAheadMetres[0] && ahead <= BARKS.passAheadMetres[1]
        && Math.abs(side) <= BARKS.passLateralMetres;
      if (inBox && barkView.candidateSeen(camera, anchor, relative, { x: 0, y: 0, z })) {
        qualifiedAt = time;
        aheadAtQualify = ahead;
      }
    } else if (barkView.bubbleInBand(camera, anchor)) {
      visibleSeconds = time - qualifiedAt;
    } else {
      break;
    }
  }
  return { qualified: qualifiedAt >= 0, visibleSeconds, aheadAtQualify };
}

test(`a qualifying straight pass stays in the display band at least ${BARKS.minimumReadableSeconds} s, solo and split`, (t) => {
  const rows: string[] = [];
  const failures: string[] = [];
  for (const [label, width, height, split] of [
    ['solo 16:9', 1280, 720, false],
    ['split half', 640, 720, true],
  ] as const) {
    for (const speed of [3, 5, 7, BARKS.passMaximumSpeed]) {
      for (const side of [2, 3.5, 5, -3.5, BARKS.passLateralMetres - 0.5]) {
        const result = straightPass(speed, side, width, height, split);
        rows.push(`${label} ${speed} m/s ${side} m: ${result.qualified
          ? `qualified ${result.aheadAtQualify.toFixed(1)} m ahead, in band ${result.visibleSeconds.toFixed(2)} s`
          : 'never qualified'}`);
        // The one corner of the envelope — a half-width split pane at the pass
        // cap with the asker at the side limit — would be on screen only
        // ≈ 2.2 s, so the readable prediction rightly never starts it.
        const corner = split && speed === BARKS.passMaximumSpeed && side === BARKS.passLateralMetres - 0.5;
        if (!result.qualified) {
          if (!corner) failures.push(`${label} ${speed} m/s ${side} m never qualified`);
        } else if (result.visibleSeconds < BARKS.minimumReadableSeconds) {
          failures.push(`${label} ${speed} m/s ${side} m: in band only ${result.visibleSeconds.toFixed(2)} s`);
        }
      }
    }
  }
  t.diagnostic(rows.join('\n'));
  console.log(`[bark view] ${rows.join('\n[bark view] ')}`);
  assert.deepEqual(failures, []);
});

function stoppedCamera(): { pane: PaneCamera; camera: PerspectiveCamera } {
  const pane = new PaneCamera(1280, 720, false);
  pane.reset(0, 0, 0, 0);
  for (let i = 0; i < 240; i += 1) pane.ride(0, 0, 0, 0);
  return { pane, camera: pane.place() };
}

test('a person beside or behind the shoulder never qualifies', () => {
  const { camera } = stoppedCamera();
  const view = new BarkView();
  const still = { x: 0, y: 0, z: 0 };
  const rider = { x: 0, y: 0, z: 0 };
  for (const [x, z] of [[1.2, 0], [-1.2, 0], [2, 0.3], [1, -1], [-1.5, -0.5], [0.6, 0.2]]) {
    assert.equal(view.candidateSeen(camera, { x, y: ANCHOR_HEIGHT, z }, still, rider), false, `${x}, ${z}`);
  }
  // A person well ahead does qualify from the same camera — the negative
  // control that keeps the cases above honest.
  assert.equal(view.candidateSeen(camera, { x: 1, y: ANCHOR_HEIGHT, z: 3 }, still, rider), true);
});

test('a person between the camera and the rider fails the depth check', () => {
  const { pane, camera } = stoppedCamera();
  const view = new BarkView();
  const rider = { x: 0, y: 0, z: 0 };
  const behind = -pane.state.armDistance / 2;
  const between = { x: 0.3, y: ANCHOR_HEIGHT, z: behind };
  assert.ok(view.depth(camera, between.x, between.y, between.z) < view.depth(camera, 0, 0, 0) + BARKS.depthBeyondRiderMetres);
  assert.equal(view.candidateSeen(camera, between, { x: 0, y: 0, z: 0 }, rider), false);
});

test('a candidate whose predicted path leaves the start band does not qualify', () => {
  const { camera } = stoppedCamera();
  const view = new BarkView();
  const anchor = { x: 1, y: ANCHOR_HEIGHT, z: 4 };
  const rider = { x: 0, y: 0, z: 0 };
  assert.equal(view.candidateSeen(camera, anchor, { x: 0, y: 0, z: 0 }, rider), true, 'standing there, seen');
  // Walking sideways out of frame fast enough to leave within 1.5 s.
  assert.equal(view.candidateSeen(camera, anchor, { x: 6, y: 0, z: 0 }, rider), false, 'leaving the frame');
});

test('the bands and the pane conversion', () => {
  const ndc = new BarkView().ndc;
  ndc.set(0.6, 0.6, 0.5);
  assert.equal(inBand(ndc, START_BAND), true);
  ndc.set(0.61, 0, 0.5);
  assert.equal(inBand(ndc, START_BAND), false);
  assert.equal(inBand(ndc, DISPLAY_BAND), true);
  ndc.set(0, -0.36, 0.5);
  assert.equal(inBand(ndc, DISPLAY_BAND), false);
  ndc.set(0, 0, 1.01);
  assert.equal(inBand(ndc, DISPLAY_BAND), false, 'beyond the far plane or behind the camera');
  const out = { x: 0, y: 0 };
  ndcToPane(0, 0, { width: 640, height: 720 }, out);
  assert.deepEqual(out, { x: 320, y: 360 });
  ndcToPane(-1, 1, { width: 640, height: 720 }, out);
  assert.deepEqual(out, { x: 0, y: 0 });
  ndcToPane(1, -1, { width: 640, height: 720 }, out);
  assert.deepEqual(out, { x: 640, y: 720 });
});

// -- The asker must be seen clearly (critic item 11) ------------------------

/** A population row for the sight tests: feet at y 0, still unless given a speed. */
function body(id: string, x: number, z: number, headingY: number, kind = 'social', speed = 0): SightBody {
  return { id, kind, x, y: 0, z, headingY, speedMetresPerSecond: speed };
}

function bodies(...rows: SightBody[]): { previous: SightBody[]; current: SightBody[]; alpha: number } {
  return { previous: rows, current: rows, alpha: 1 };
}

/** The candidate record the model hands over for a still person standing at (x, z). */
function asking(id: string, x: number, z: number, relativeZ = 0) {
  return { actorId: id, anchor: { x, y: ANCHOR_HEIGHT, z }, relativeVelocity: { x: 0, y: 0, z: relativeZ } };
}

test('a facing pair met face-on: the partner\'s back hides the asker, so the asker never qualifies', () => {
  const { camera } = stoppedCamera();
  const spacing = 1.4; // POPULATION_AUTHORING.socialSpacingMetres: the pair stands this far apart, face to face.
  const asker = body('asker', 0.4, 12, Math.PI);
  const partner = body('partner', 0.4, 12 - spacing, 0);
  assert.equal(candidateHidden(camera.position, asking('asker', 0.4, 12), bodies(asker, partner), 0, 0), true);
  assert.equal(bubbleHidden(camera.position, 'asker', { x: 0.4, y: ANCHOR_HEIGHT, z: 12 }, bodies(asker, partner)), true);
  // Controls: alone, the asker is clear; the asker's own hull never counts.
  assert.equal(candidateHidden(camera.position, asking('asker', 0.4, 12), bodies(asker), 0, 0), false);
  // The same pair side-on (the axis across the view): both faces are clear.
  const left = body('left', -0.7, 12, Math.PI / 2);
  const right = body('right', 0.7, 12, -Math.PI / 2);
  assert.equal(candidateHidden(camera.position, asking('left', -0.7, 12), bodies(left, right), 0, 0), false);
  assert.equal(candidateHidden(camera.position, asking('right', 0.7, 12), bodies(left, right), 0, 0), false);
  // Somebody standing behind the asker hides nothing.
  const beyond = body('beyond', 0.4, 12 + spacing, Math.PI);
  assert.equal(candidateHidden(camera.position, asking('asker', 0.4, 12), bodies(asker, beyond), 0, 0), false);
});

test('a parked vehicle between counts, and the prediction catches someone about to step between', () => {
  const { camera } = stoppedCamera();
  const asker = body('asker', 0.5, 14, Math.PI);
  const van = body('van', 0.4, 8, Math.PI / 2, 'parkedVehicle');
  assert.equal(candidateHidden(camera.position, asking('asker', 0.5, 14), bodies(asker, van), 0, 0), true);
  // A walker crossing from the left at 1.5 m/s: clear now, in the way within 1.5 s.
  const walker = body('walker', -1.6, 12, Math.PI / 2, 'walker', 1.5);
  const crossing = bodies(asker, walker);
  assert.equal(bubbleHidden(camera.position, 'asker', { x: 0.5, y: ANCHOR_HEIGHT, z: 14 }, crossing), false, 'clear now');
  assert.equal(candidateHidden(camera.position, asking('asker', 0.5, 14), crossing, 0, 0), true, 'not along the prediction');
});

test('riding up to a facing pair face-on (the critic\'s euc approach): the asker never qualifies; side-on it does', () => {
  // The rider rides straight at 5 m/s, 2.5 m off the asker's line, toward an
  // asker who faces the rider with the partner 1.4 m in front, back turned.
  const run = (pairAcross: boolean): { seenFrames: number; clearFrames: number } => {
    const pane = new PaneCamera(1280, 720, false);
    const view = new BarkView();
    const speed = 5;
    const side = 2.5;
    const askerZ = 60;
    const asker = pairAcross ? body('asker', side - 0.7, askerZ, -Math.PI / 2) : body('asker', side, askerZ, Math.PI);
    const partner = pairAcross ? body('partner', side + 0.7, askerZ, Math.PI / 2) : body('partner', side, askerZ - 1.4, 0);
    const rows = bodies(asker, partner);
    let z = 0;
    pane.reset(0, z, 0, speed);
    for (let i = 0; i < 600; i += 1) pane.ride(0, z, 0, speed);
    let seenFrames = 0;
    let clearFrames = 0;
    while (z < askerZ) {
      for (let s = 0; s < 2; s += 1) {
        z += speed * STEP;
        pane.ride(0, z, 0, speed);
      }
      const camera = pane.place();
      const ahead = askerZ - z;
      if (ahead < BARKS.passAheadMetres[0] || ahead > BARKS.passAheadMetres[1]) continue;
      const candidate = asking('asker', asker.x, askerZ, -speed);
      if (!view.candidateSeen(camera, candidate.anchor, candidate.relativeVelocity, { x: 0, y: 0, z })) continue;
      seenFrames += 1;
      if (!candidateHidden(camera.position, candidate, rows, 0, speed)) clearFrames += 1;
    }
    return { seenFrames, clearFrames };
  };
  const faceOn = run(false);
  assert.ok(faceOn.seenFrames > 0, 'the start band alone would have let the hidden asker ask');
  assert.equal(faceOn.clearFrames, 0, 'face-on, the partner always hides the asker');
  const across = run(true);
  assert.ok(across.clearFrames > 0, 'side-on, the asker is clear and qualifies');
});

// -- Measured on the person drawn (2026-10-22) -------------------------------

/** An id whose drawn stature is at most / at least `metres` (statures follow the id hash). */
function idWithStature(prefix: string, test: (stature: number) => boolean): string {
  for (let index = 0; index < 500; index += 1) if (test(pedestrianStatureMetres(`${prefix}-${index}`))) return `${prefix}-${index}`;
  throw new Error(`no ${prefix} id with that stature`);
}

test('the bubble is drawn the same lift above the drawn crown — the speaker\'s own, or the mean stature', () => {
  const { camera } = stoppedCamera();
  const view = new BarkView();
  const feet = { x: 1, y: 0, z: 6 };
  const model = { x: feet.x, y: feet.y + ANCHOR_HEIGHT, z: feet.z };
  const expect = new BarkView();
  // The mean when the caller names nobody.
  assert.ok(Math.abs(anchorDropMetres() - (POPULATION_AUTHORING.actorHeightMetres - PEDESTRIAN_FIGURE.meanHeightMetres)) < 1e-12);
  assert.equal(view.bubbleInBand(camera, model), true);
  expect.project(camera, feet.x, PEDESTRIAN_FIGURE.meanHeightMetres + BARKS.anchorLiftMetres, feet.z);
  assert.ok(view.ndc.distanceTo(expect.ndc) < 1e-9);
  // The speaker's own stature when named: a short and a tall person differ on screen.
  const short = idWithStature('short', (h) => h < 1.71), tall = idWithStature('tall', (h) => h > 1.79);
  for (const id of [short, tall]) {
    assert.equal(view.bubbleInBand(camera, model, id), true);
    expect.project(camera, feet.x, pedestrianStatureMetres(id) + BARKS.anchorLiftMetres, feet.z);
    assert.ok(view.ndc.distanceTo(expect.ndc) < 1e-9, id);
  }
  view.bubbleInBand(camera, model, short); const shortY = view.ndc.y;
  view.bubbleInBand(camera, model, tall); assert.ok(view.ndc.y > shortY, 'the taller speaker\'s bubble stands higher');
  // The old hull anchor would float it a hand's width higher than the mean crown.
  expect.project(camera, model.x, model.y, model.z);
  view.bubbleInBand(camera, model);
  assert.ok(expect.ndc.y > view.ndc.y);
  // A candidate is judged where its bubble will be drawn.
  const still = { x: 0, y: 0, z: 0 };
  assert.equal(view.candidateSeen(camera, model, still, { x: 0, y: 0, z: 0 }, tall), true);
  expect.project(camera, feet.x, pedestrianStatureMetres(tall) + BARKS.anchorLiftMetres, feet.z);
  assert.ok(view.ndc.distanceTo(expect.ndc) < 1e-9);
});

test('a sight ray passing over a drawn crown is clear; one through the drawn head is not', () => {
  // The eye just above head height, the asker 10 m off, someone 1 m in front of the eye on the line.
  const eye = { x: 0, y: 1.85, z: 0 };
  const asker = body('asker', 0, 10, Math.PI);
  const shortId = idWithStature('passer', (h) => h < 1.72);
  const short = body(shortId, 0, 1, Math.PI / 2, 'walker');
  // Head and chest rays cross z 1 at about 1.82 and 1.78 m: over a 1.72 m crown, under the old 1.9 m cylinder.
  assert.equal(candidateHidden(eye, asking('asker', 0, 10), bodies(asker, short), 0, 0), false, 'over the short passer-by');
  assert.equal(bubbleHidden(eye, 'asker', { x: 0, y: ANCHOR_HEIGHT, z: 10 }, bodies(asker, short)), false);
  // The same spot taken by a fictional rider (still the 1.9 m body) or someone further along, where the ray is lower, hides the asker.
  assert.equal(candidateHidden(eye, asking('asker', 0, 10), bodies(asker, body('euc', 0, 1, Math.PI / 2, 'fictionalEuc')), 0, 0), true);
  assert.equal(candidateHidden(eye, asking('asker', 0, 10), bodies(asker, body(shortId, 0, 5, Math.PI / 2, 'walker')), 0, 0), true);
  // A vehicle still blocks as its full hull.
  assert.equal(candidateHidden(eye, asking('asker', 0, 10), bodies(asker, body('van', 0, 5, Math.PI / 2, 'parkedVehicle')), 0, 0), true);
});
