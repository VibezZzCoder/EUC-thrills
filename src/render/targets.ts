/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, TARGET } from '../data/tuning.ts';
import type { Target } from '../level/plan.ts';
import { mergeGeometries, shaded } from './blockoutKit.ts';

/**
 * The Knockabout targets, as one instanced family — M14.
 *
 * **One `InstancedMesh`, and the budget is why.** `docs/PLANS.md`'s M14 verdict
 * allows the target family two draw calls and the paddle two; one unlit
 * instanced mesh is exactly one colour-pass call, and the family stays inside
 * its half of the allowance however many targets a route carries. That is also
 * what makes target *count* a pacing question rather than a frame question:
 * one target and sixty cost the same number of meshes.
 *
 * **A rigid shape is what buys the instancing**, and `level/plan.ts` argues the
 * case: post, arm and pad are one authored object, `Target.base` places it and
 * `Target.centre` is `base` plus the strike height by construction, so an
 * instance is a translation, a yaw, and — once struck — a tip. A per-station
 * shape would be a merged mesh rebuilt whenever anything moved.
 *
 * **Unlit, so brightness means state.** A lit target would say "state" and
 * "which way is the sun" in the same channel. One hue at two brightnesses,
 * never a hue pair: the difference has to survive the commonest colour-vision
 * deficiency, and it has to survive `prefers-reduced-motion` suppressing the
 * knock-down, because the fall and the brightness step are the *only* two
 * channels saying a hit registered and reduced motion removes one of them.
 *
 * Three instancing traps are handled explicitly below, all three already
 * recorded in this codebase and all three certain to be re-hit:
 * `computeBoundingSphere` after the matrices are written, `dispose()` on the
 * mesh rather than only its geometry and material, and the white `color`
 * attribute without which a `vertexColors` material renders black.
 */

export interface TargetFamily {
  /** Root. Added to the scene by `render/Renderer.ts`. */
  readonly group: THREE.Group;
  /** How many targets were drawn. Zero on a plan that carries none. */
  readonly targets: number;
  /** Colour-pass draw calls while visible: one, or none with no targets. */
  readonly drawCalls: number;
  readonly triangles: number;
  /** Knock one down. Ignored for an id this world does not carry. */
  strike(id: string): void;
  /** Which ids are down, so a context restore can repaint them fallen. */
  struck(): readonly string[];
  /** Stand everything back up. A new run, never a reload. */
  reset(): void;
  /**
   * Suppress the fall, leaving the brightness step to carry the whole signal.
   *
   * `prefers-reduced-motion` is a CSS media query and this is WebGL, so nothing
   * about it reaches here on its own — the composition root has to say so.
   */
  setReducedMotion(reduced: boolean): void;
  /** Advance the knock-downs on the simulation clock. From the fixed step. */
  step(stepSeconds: number): void;
  dispose(): void;
}

interface TargetState {
  readonly id: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Which way the arm points, radians about +Y. Derived from base → centre. */
  readonly facing: number;
  /** 0 standing, 1 fully down. */
  fall: number;
  down: boolean;
}

const EMPTY_IDS: readonly string[] = Object.freeze([]);

/** Build the one canonical stand, in its own frame: foot at the origin, arm along +Z. */
function buildStandGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const height = TARGET.strikeHeight;

  // The post, from the foot up to the pad's height.
  const post = new THREE.CylinderGeometry(TARGET.postRadius, TARGET.postRadius * 1.35, height, 7);
  post.translate(0, height / 2, 0);
  parts.push(shaded(post, 0.62));

  // The arm, cantilevered out over the road.
  const arm = new THREE.BoxGeometry(TARGET.postRadius * 1.4, TARGET.postRadius * 1.4, TARGET.cantilever);
  arm.translate(0, height, TARGET.cantilever / 2);
  parts.push(shaded(arm, 0.5));

  // The pad. **Its face points along the road, not across it**, and getting
  // that backwards was the first thing the browser showed: a disc whose axis
  // followed the arm presents its *edge* to a rider coming down the road, so
  // the thing they are supposed to see forty metres out is a sliver. It also
  // fails the mechanic — the paddle sweeps across the rider's front, so its own
  // face meets a target face-on only when that face is turned up the road.
  //
  // The arm runs along local +Z, so the road runs along local ±X, and rotating
  // the cylinder about Z is what puts its axis there.
  const pad = new THREE.CylinderGeometry(
    TARGET.discRadius,
    TARGET.discRadius,
    TARGET.discThickness,
    20,
  );
  pad.rotateZ(Math.PI / 2);
  pad.translate(0, height, TARGET.cantilever);
  parts.push(shaded(pad, 1.0));

  // A darker rim, so the pad has an edge at forty metres rather than fading
  // into a bright blob against a bright sky — the readability distance
  // `TARGET.readMetres` names.
  const rim = new THREE.TorusGeometry(TARGET.discRadius, 0.03, 6, 22);
  rim.rotateY(Math.PI / 2);
  rim.translate(0, height, TARGET.cantilever);
  parts.push(shaded(rim, 0.55));

  return mergeGeometries(parts);
}

export function createTargets(targets: readonly Target[] = []): TargetFamily {
  const group = new THREE.Group();
  group.name = 'knockabout-targets';

  // **The empty-plan early return, and every fixture takes it.** §13 q12 puts
  // targets in generated routes only, so the slice, the proving ground and
  // every unit-test plan carry none — no geometry, no material, no mesh,
  // nothing to dispose, and nothing to measure.
  if (targets.length === 0) {
    return {
      group,
      targets: 0,
      drawCalls: 0,
      triangles: 0,
      strike(): void {},
      struck(): readonly string[] {
        return EMPTY_IDS;
      },
      reset(): void {},
      setReducedMotion(): void {},
      step(): void {},
      dispose(): void {
        group.removeFromParent();
      },
    };
  }

  const geometry = buildStandGeometry();
  const index = geometry.getIndex();
  const trianglesPerStand = (index?.count ?? geometry.getAttribute('position').count) / 3;

  const material = new THREE.MeshBasicMaterial({
    color: BLOCKOUT_COLOURS.target,
    vertexColors: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, targets.length);
  mesh.name = 'knockabout-target-stands';
  // A target is not architecture and it is not solid. No shadow — that is the
  // second draw call the budget does not have, and a shadow would argue the
  // stand is something the wheel could hit. Not pickable either, so nothing
  // pulls the chase camera in around a target the player rides straight past.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = (): void => {};

  const states: TargetState[] = [];
  const byId = new Map<string, TargetState>();
  for (let slot = 0; slot < targets.length; slot += 1) {
    const target = targets[slot];
    const state: TargetState = {
      id: target.id,
      index: slot,
      x: target.base.x,
      y: target.base.y,
      z: target.base.z,
      // Derived from the two points rather than carried as a third field, so
      // the arm cannot be drawn pointing away from the pad the swing tests.
      facing: Math.atan2(target.centre.x - target.base.x, target.centre.z - target.base.z),
      fall: 0,
      down: false,
    };
    states.push(state);
    byId.set(target.id, state);
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const yaw = new THREE.Quaternion();
  const tip = new THREE.Quaternion();
  const colour = new THREE.Color();

  let reducedMotion = false;
  let dirty = true;

  const writeInstances = (): void => {
    for (const state of states) {
      position.set(state.x, state.y, state.z);
      yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.facing);
      // The tip is about the stand's own lateral axis — +X in its yawed frame —
      // so a struck target falls away from the road rather than into it.
      const fall = reducedMotion ? 0 : state.fall;
      tip.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -fall * TARGET.knockdownRadians);
      quaternion.copy(yaw).multiply(tip);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(state.index, matrix);

      // Brightness is state. The step is large rather than a tint, because with
      // reduced motion it is the whole signal.
      const brightness = state.down ? TARGET.struckBrightness : TARGET.standingBrightness;
      colour.setScalar(brightness);
      mesh.setColorAt(state.index, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    // **After the matrices, never before.** An instanced mesh's bounding sphere
    // is computed from the instance transforms, and one computed while they are
    // all identity is a sphere at the origin — so every target more than a metre
    // from spawn is frustum-culled while the player rides through it, with
    // nothing in the console to say so.
    mesh.computeBoundingSphere();
    dirty = false;
  };

  writeInstances();
  group.add(mesh);

  return {
    group,
    targets: states.length,
    drawCalls: 1,
    triangles: trianglesPerStand * states.length,

    strike(id: string): void {
      const state = byId.get(id);
      if (state === undefined || state.down) return;
      state.down = true;
      dirty = true;
    },

    struck(): readonly string[] {
      return states.filter((state) => state.down).map((state) => state.id);
    },

    reset(): void {
      let moved = false;
      for (const state of states) {
        if (!state.down && state.fall === 0) continue;
        state.down = false;
        state.fall = 0;
        moved = true;
      }
      if (moved) writeInstances();
    },

    setReducedMotion(reduced: boolean): void {
      if (reducedMotion === reduced) return;
      reducedMotion = reduced;
      writeInstances();
    },

    step(stepSeconds: number): void {
      const rate = TARGET.knockdownSeconds > 0 ? stepSeconds / TARGET.knockdownSeconds : 1;
      let moving = false;
      for (const state of states) {
        if (!state.down || state.fall >= 1) continue;
        state.fall = Math.min(1, state.fall + rate);
        moving = true;
      }
      // The dirty flag matters more here than the loop does: without it every
      // step rewrites every instance matrix and recomputes a bounding sphere
      // for a family that has not moved since the route was built.
      if (moving || dirty) writeInstances();
    },

    dispose(): void {
      // `InstancedMesh.dispose()` as well as the geometry and the material: the
      // instance matrix and colour buffers belong to the mesh, and disposing
      // around them leaves them alive across a level rebuild while
      // `renderer.info.memory` reports flat.
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}
