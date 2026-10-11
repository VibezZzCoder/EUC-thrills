/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 — the render-only flock (`docs/PLANS.md` §42.3b; flight in `birdFlight.ts`).
 *
 * One `InstancedMesh` per eligible world: nine birds as eighteen mirrored
 * half-bird instances (R17: a few more than seven), one draw, 72 triangles,
 * no shadow pass, ≈ 1.3 KB.
 *
 * - **Unlit dark slate** (`MeshBasicMaterial`, `BIRDS.colourLinear` linear
 *   luminance with a slate tint) that the scene's existing haze fades towards
 *   the horizon. No vertex colours, instance colours, map or shader patch, so
 *   its program is the same on every tier; fog, exposure and lights are never
 *   touched for it (invariant 6).
 * - **Parked, never hidden.** Between passes the mesh stays `visible` and sits
 *   at `BIRDS.parkY`, beyond every far plane, so every pane culls it while the
 *   warm pass (culling off) still links its program and uploads its buffers
 *   under the loading cover; resource plateaus never step mid-session.
 * - **One clock.** `update` runs once per drawn frame before any pane
 *   (`GameRenderer.updateStreetLife`), returns early on an unchanged clock and
 *   allocates nothing; reduced motion parks the flock.
 * - **Seen, not just flown (M42 R13, the birds critic, R17).** Each pass is
 *   born out of sight beside one view camera's rider and, while far, steers to
 *   intercept a point in front of where he will be (`BirdFlightClock`; owner
 *   round 2: sooner while the haze hides it, `BIRDS.farRate`); near
 *   him it flies straight, and it retires once beyond every far plane or, once
 *   it has flown straight a moment, as soon as no pane's frustum can show it
 *   (the view cameras' `fov` and `aspect` say how wide). The mesh's `onBeforeRender`
 *   tells the clock when a pane drew the flying flock within
 *   `BIRDS.framedMetres`; an aimed pass nobody framed is followed by the short
 *   `unseenGapSeconds` instead of the ordinary quiet.
 * - **Moves by its own matrix.** The mesh's matrix carries the flock centre and
 *   heading (`matrixAutoUpdate = false`); instances hold the formation and the
 *   wings. The bounding sphere is set once, from the formation's own extent.
 *
 * Never a `supplements.setRoots` root, never frozen, layers mask 1 only (never
 * `ULTRA_STATIC_LAYER`), group `world-birds` (no `categoryOf` prefix).
 */
import * as THREE from 'three';
import { BIRDS } from '../data/tuning.ts';
import {
  BIRD_TEMPLATE_INDICES,
  BirdFlightClock,
  birdFlockRadius,
  birdInstances,
  birdLocalPose,
  birdTemplatePositions,
  createBirdLocalPose,
  createFlockFrame,
  type PositionedLike,
  type PreparedBirdFlight,
} from './birdFlight.ts';

export interface BirdsReport {
  /** The world has a flock (plan data: a building or tree prop). */
  readonly eligible: boolean;
  /** The flock mesh was submitted by a pane in the last drawn frame (its `onBeforeRender`). */
  readonly drawn: boolean;
  /**
   * The current or next pass, world-clock seconds; null with no flock. A pass
   * is laid (aimed at a view) when it starts, so a waiting pass's end is
   * provisional until then.
   */
  readonly nextPass: { readonly startSeconds: number; readonly endSeconds: number } | null;
  /** The view the current pass is aimed across; null while it waits or holds its field chord. */
  readonly aimedView: number | null;
  readonly flocks: number;
  readonly birds: number;
  readonly instances: number;
  /** Installed (priced) colour draws, whatever is culled. */
  readonly drawCalls: number;
  readonly colourTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  /** World-clock seconds: the simulation clock since this world's first drawn frame. */
  readonly clockSeconds: number;
  readonly passIndex: number;
  /** A pass is being flown (not parked). */
  readonly active: boolean;
  /** The flock centre while active, world metres; null while parked. */
  readonly centre: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** The flock's heading while active (forward is (sin, cos)); 0 while parked. */
  readonly headingY: number;
}

export const EMPTY_BIRDS_REPORT: BirdsReport = Object.freeze({
  eligible: false, drawn: false, nextPass: null, aimedView: null, flocks: 0, birds: 0, instances: 0, drawCalls: 0,
  colourTriangles: 0, geometryBytes: 0, instanceBytes: 0, clockSeconds: 0, passIndex: -1, active: false,
  centre: null, headingY: 0,
});

export interface Birds {
  readonly group: THREE.Group;
  /** Once per drawn frame, before any pane: the simulation clock and the view cameras' last poses. */
  update(seconds: number, reducedMotion: boolean, cameras: readonly PositionedLike[]): void;
  report(): BirdsReport;
  dispose(): void;
}

/** The silhouette's linear colour: `colourLinear` luminance, slate-tinted. */
export function birdColourLinear(): { r: number; g: number; b: number } {
  const [r, g, b] = BIRDS.slateTint;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const scale = BIRDS.colourLinear / luminance;
  return { r: r * scale, g: g * scale, b: b * scale };
}

export function createBirds(prepared: PreparedBirdFlight): Birds {
  const group = new THREE.Group();
  group.name = 'world-birds';
  if (!prepared.eligible) {
    // Nothing allocated: no geometry, no material, no mesh.
    let disposed = false;
    return {
      group,
      update() {},
      report: () => EMPTY_BIRDS_REPORT,
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
      },
    };
  }

  const instances = birdInstances();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(birdTemplatePositions(), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(BIRD_TEMPLATE_INDICES), 1));
  const linear = birdColourLinear();
  // Linear (≈ 0.042, 0.045, 0.052): luminance BIRDS.colourLinear (0.045), above DESIGN §2's 0.03 floor.
  const colour = new THREE.Color().setRGB(linear.r, linear.g, linear.b, THREE.LinearSRGBColorSpace);
  const material = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.InstancedMesh(geometry, material, instances);
  mesh.name = 'world-birds-flock';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  // Set once: the formation's whole reach about the flock centre. The mesh
  // moves by its own matrix, so three never needs to rescan the instances.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), birdFlockRadius());
  group.add(mesh);

  const clock = new BirdFlightClock(prepared);
  const frame = createFlockFrame();
  const pose = createBirdLocalPose();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let frameNumber = 0;
  let drawnFrame = -1;
  let disposed = false;
  let parked = false;
  let lastSeconds = Number.NaN;
  let lastReduced = false;
  // Drawn by a pane this frame; a flying flock that near its camera was on
  // somebody's screen, so the clock keeps the ordinary quiet after this pass.
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    drawnFrame = frameNumber;
    if (parked) return;
    const eye = camera.matrixWorld.elements;
    if (Math.hypot(eye[12] - frame.x, eye[13] - frame.y, eye[14] - frame.z) <= BIRDS.framedMetres) clock.noteFramed();
  };

  const park = (): void => {
    mesh.matrix.makeTranslation(0, BIRDS.parkY, 0);
    mesh.matrixWorldNeedsUpdate = true;
    parked = true;
  };
  /** Fourteen instance matrices at world time `t`: each bird's offset, the flock's bank and climb, and its wing. */
  const pose14 = (t: number): void => {
    for (let bird = 0; bird < BIRDS.count; bird += 1) {
      birdLocalPose(prepared.worldKey, bird, t, pose);
      position.set(pose.x, pose.y, pose.z);
      for (let half = 0; half < 2; half += 1) {
        const side = half === 0 ? 1 : -1;
        // The left half lifts its +X wing by rolling +wing; the mirrored
        // right half lifts its (−X) wing by rolling −wing. Bank is shared.
        euler.set(-frame.pitch, 0, frame.roll + side * pose.wing, 'XYZ');
        quaternion.setFromEuler(euler);
        scale.set(side, 1, 1);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(bird * 2 + half, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  // The rest formation, so the warm upload holds real matrices; then parked.
  pose14(0);
  park();

  return {
    group,
    update(seconds, reducedMotion, cameras) {
      frameNumber += 1;
      if (disposed) return;
      if (seconds === lastSeconds && reducedMotion === lastReduced) return;
      lastSeconds = seconds;
      lastReduced = reducedMotion;
      const flying = clock.advance(seconds, reducedMotion, cameras, frame);
      if (!flying) {
        if (!parked) park();
        return;
      }
      parked = false;
      position.set(frame.x, frame.y, frame.z);
      quaternion.setFromAxisAngle(up, frame.headingY);
      scale.set(1, 1, 1);
      mesh.matrix.compose(position, quaternion, scale);
      mesh.matrixWorldNeedsUpdate = true;
      pose14(clock.worldSeconds);
    },
    report() {
      const geometryBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
        + (geometry.index?.array.byteLength ?? 0);
      return {
        eligible: true,
        drawn: !disposed && drawnFrame === frameNumber,
        nextPass: clock.window(),
        aimedView: clock.aimedView,
        flocks: 1,
        birds: BIRDS.count,
        instances,
        drawCalls: 1,
        colourTriangles: (BIRD_TEMPLATE_INDICES.length / 3) * instances,
        geometryBytes,
        instanceBytes: mesh.instanceMatrix.array.byteLength,
        clockSeconds: clock.worldSeconds,
        passIndex: clock.pass.index,
        active: !parked,
        centre: parked ? null : { x: frame.x, y: frame.y, z: frame.z },
        headingY: parked ? 0 : frame.headingY,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
